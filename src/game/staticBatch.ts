import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Static batching for set dressing.
 *
 * The decor groups are built from hundreds of small meshes (one draw call each). Most never
 * move, so once a zone has been running for a moment we merge every *still* leaf mesh with its
 * siblings that share the same material, inside the same parent. Batching per parent keeps
 * group-level tricks working (zone toggles, tower hiding, mega/wireframe cross-fades), and
 * shared materials keep colour/opacity animation working.
 *
 * Leaves that moved, swapped material or toggled visibility between the snapshot and the batch
 * are treated as animated and left alone. Tag `userData.noBatch = true` to opt a subtree out.
 */

interface LeafState {
  matrix: THREE.Matrix4;
  material: THREE.Material | THREE.Material[];
  matSig: string;
  visible: boolean;
}

const SIG_KEYS = [
  'type', 'color', 'emissive', 'emissiveIntensity', 'roughness', 'metalness', 'opacity', 'transparent', 'side',
  'map', 'emissiveMap', 'alphaMap', 'bumpMap', 'bumpScale', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap',
  'vertexColors', 'flatShading', 'depthWrite', 'depthTest', 'blending', 'toneMapped', 'fog', 'alphaTest', 'wireframe',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'colorWrite', 'visible', 'specular', 'shininess', 'sizeAttenuation',
] as const;

/** Materials with equal signatures render identically, so their meshes can share one draw call. */
function materialSig(m: THREE.Material): string {
  const rec = m as unknown as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of SIG_KEYS) {
    const v = rec[k];
    if (v === undefined) continue;
    if (v === null) parts.push(k + ':-');
    else if ((v as THREE.Color).isColor) parts.push(k + ':' + (v as THREE.Color).getHexString());
    else if ((v as THREE.Texture).isTexture) parts.push(k + ':' + (v as THREE.Texture).uuid);
    else if (typeof v === 'object') return 'unique:' + m.uuid; // something exotic: don't share
    else parts.push(k + ':' + String(v));
  }
  // Custom shaders / onBeforeCompile hooks can't be assumed equivalent
  if ((m as THREE.ShaderMaterial).isShaderMaterial || m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return 'unique:' + m.uuid;
  return parts.join('|');
}

export type BatchSnapshot = Map<THREE.Mesh, LeafState>;

function isCandidate(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  return (
    m.isMesh === true &&
    !(m as unknown as THREE.InstancedMesh).isInstancedMesh &&
    !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh &&
    m.children.length === 0 &&
    !Array.isArray(m.material) &&
    !m.geometry.morphAttributes.position &&
    m.geometry.groups.length <= 1 &&
    !!m.geometry.attributes.position
  );
}

function optedOut(o: THREE.Object3D, root: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p && p !== root.parent) {
    if (p.userData.noBatch) return true;
    p = p.parent;
  }
  return false;
}

export function snapshotLeaves(root: THREE.Object3D, visibleOnly = false): BatchSnapshot {
  const snap: BatchSnapshot = new Map();
  (visibleOnly ? root.traverseVisible.bind(root) : root.traverse.bind(root))((o) => {
    if (!isCandidate(o)) return;
    o.updateMatrix();
    snap.set(o, { matrix: o.matrix.clone(), material: o.material, matSig: materialSig(o.material as THREE.Material), visible: o.visible });
  });
  return snap;
}

export interface BatchJob {
  parent: THREE.Object3D;
  meshes: THREE.Mesh[];
}

/** Merges still leaves per (parent, material, shadow flags, attribute layout). Returns draw calls saved. */
export function batchStaticLeaves(root: THREE.Object3D, snap: BatchSnapshot): number {
  let saved = 0;
  for (const job of planStaticBatches(root, snap)) saved += runBatchJob(job);
  return saved;
}

/** Groups the still leaves into merge jobs (cheap); run them with `runBatchJob`, spread over frames. */
export function planStaticBatches(root: THREE.Object3D, snap: BatchSnapshot): BatchJob[] {
  const buckets = new Map<string, { parent: THREE.Object3D; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    if (!isCandidate(o) || !o.parent) return;
    const before = snap.get(o);
    if (!before) return;
    o.updateMatrix();
    if (!o.visible || !before.visible || before.material !== o.material || !before.matrix.equals(o.matrix)) return;
    const sig = materialSig(o.material as THREE.Material);
    if (sig !== before.matSig) return; // its material is being animated
    if (optedOut(o, root)) return;
    const attrs = Object.keys(o.geometry.attributes)
      .sort()
      .map((k) => `${k}${o.geometry.attributes[k].itemSize}`)
      .join(',');
    const mat = o.material as THREE.Material;
    void mat;
    const key = `${o.parent.uuid}|${sig}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}|${attrs}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { parent: o.parent, meshes: [] }));
    b.meshes.push(o);
  });

  return [...buckets.values()].filter((b) => b.meshes.length >= 2);
}

/** Merges one job's meshes into a single draw call. Returns draw calls saved. */
export function runBatchJob({ parent, meshes }: BatchJob): number {
  // something changed since the plan (zone left, mesh removed): skip it
  if (meshes.some((m) => m.parent !== parent)) return 0;
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const m of meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix); // into the parent's space
      g.clearGroups();
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return 0;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const first = meshes[0];
    const batched = new THREE.Mesh(merged, first.material);
    batched.name = 'static_batch';
    batched.castShadow = first.castShadow;
    batched.receiveShadow = first.receiveShadow;
    batched.renderOrder = first.renderOrder;
    batched.frustumCulled = first.frustumCulled;
    batched.matrixAutoUpdate = false;
    batched.updateMatrix();
    parent.add(batched);
    for (const m of meshes) parent.remove(m);
    return meshes.length - 1;
  }
}

/** Freezes the local matrices of a whole static subtree (skips per-frame matrix recompose). */
export function freezeMatrices(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData.noBatch) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}
