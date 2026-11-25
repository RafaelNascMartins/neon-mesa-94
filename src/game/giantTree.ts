import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The Data Tree: a real tree, and far too big to take in. A trunk ~130 units across at the
 * foot, flared into buttress roots, its bark in deep vertical grooves, rising ~400 units (well
 * past the camera's far plane: from the arena you never see where it ends). Huge roots arch
 * out and dive into the ground; limbs the size of buildings branch off high up into dark
 * crowns of leaves. At its foot, facing +z, a doorway into it, glowing from somewhere inside.
 *
 * Local space: the doorway sits at the origin facing +z (the trunk's centre is at z = -FOOT_R),
 * unless `centred` (trunk centre at the origin). Built once, merged to a handful of draw calls.
 */

const FOOT_R = 66; // trunk radius at ground level (with the flare)
/** Radius of the round iron-rimmed doorway at its foot. */
export const DOOR_R = 6.2;
const CORE_R = 50; // trunk radius above the flare
const TOP = 400;

function trunkRadius(y: number) {
  const taper = 1 - Math.min(0.42, y / 950);
  return (CORE_R + (FOOT_R - CORE_R) * Math.exp(-Math.max(0, y) / 26)) * taper;
}

/**
 * Charred bark: the "alligator" crackle of burnt wood — blocks of charcoal with a dull sheen,
 * split by deep black fissures, grey ash settled in patches. Returns the colour map plus an
 * ember map (same layout): some fissures still glow orange inside.
 */
function barkTexture() {
  let seed = 4242;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const ge = e.getContext('2d')!;
  g.fillStyle = '#050403';
  g.fillRect(0, 0, W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  // rows of charcoal blocks, staggered like scales, running up the trunk
  let y = 0;
  while (y < H) {
    const bh = 9 + Math.floor(r() * 10);
    let x = -Math.floor(r() * 12);
    while (x < W) {
      const bw = 10 + Math.floor(r() * 16);
      const gap = 2 + Math.floor(r() * 2);
      const tone = 46 + Math.floor(r() * 34); // charcoal, but light enough to read in the cutscene
      g.fillStyle = `rgb(${tone + 6},${tone + 2},${tone})`;
      g.fillRect(x + gap, y + gap, bw - gap, bh - gap);
      // a soft sheen on the top edge of each block, a darker underside
      g.fillStyle = 'rgba(120,110,104,0.16)';
      g.fillRect(x + gap, y + gap, bw - gap, 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + gap, y + bh - 2, bw - gap, 2);
      // embers living in this fissure
      if (r() < 0.16) {
        ge.fillStyle = r() < 0.5 ? '#ff5a14' : '#c22a08';
        if (r() < 0.5) ge.fillRect(x, y, gap, bh);
        else ge.fillRect(x, y, bw, gap);
      }
      x += bw;
    }
    y += bh;
  }
  // grey ash settled in patches, and a few long vertical splits
  for (let i = 0; i < 46; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(150,144,138,0.22)' : 'rgba(96,90,86,0.25)';
    g.fillRect(r() * W, r() * H, 3 + r() * 10, 2 + r() * 6);
  }
  for (let i = 0; i < 7; i++) {
    let x = r() * W;
    g.strokeStyle = '#020101';
    g.lineWidth = 2;
    g.beginPath();
    const y0 = r() * H;
    g.moveTo(x, y0);
    for (let yy = y0; yy < y0 + 60 + r() * 80; yy += 8) {
      x += (r() - 0.5) * 4;
      g.lineTo(x, yy);
    }
    g.stroke();
  }
  const mk = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(c), embers: mk(e) };
}

/**
 * Ground-level radius of the trunk (buttresses included) at lathe angle `a` = atan2(z, x) about
 * the trunk centre; +π/2 faces the doorway. Used for its collision and to keep spawns out of it.
 */
export function giantTreeGroundRadius(a: number): number {
  let k = 1 + 0.035 * Math.sin(a * 22) + 0.02 * Math.sin(a * 47);
  const front = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
  const lobe = Math.pow(Math.max(0, Math.cos(a * 6 + 0.9)), 3) * 0.38;
  k += front < 0.55 ? lobe * (front / 0.55) : lobe;
  return trunkRadius(0) * k;
}
export const GIANT_TREE_FOOT_R = FOOT_R;

/** A tube along `curve` whose radius goes from r0 to r1. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial * 2, t * 6);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

export function buildGiantTree(opts: { centred?: boolean } = {}): THREE.Group {
  let seed = 9091;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const root = new THREE.Group();
  root.name = 'data_tree';
  const cz = opts.centred ? 0 : -FOOT_R; // trunk centre
  const bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const veins: THREE.BufferGeometry[] = [];

  // ── Trunk: a lathe, then grooved and flared into buttresses
  const prof: THREE.Vector2[] = [];
  for (let y = -4; y <= TOP; y += y < 60 ? 3 : 10) prof.push(new THREE.Vector2(trunkRadius(y), y));
  prof.push(new THREE.Vector2(0.01, TOP + 2));
  const trunk = new THREE.LatheGeometry(prof, 96);
  const tp = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const y = tp.getY(i);
    const z = tp.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.1) continue;
    const a = Math.atan2(z, x);
    // grooves running up it, twisting slowly
    let k = 1 + 0.035 * Math.sin(a * 22 + y * 0.012) + 0.02 * Math.sin(a * 47 - y * 0.03);
    // buttress roots flaring out at the foot (none straight ahead of the door)
    const front = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    const lobe = Math.pow(Math.max(0, Math.cos(a * 6 + 0.9)), 3) * Math.exp(-Math.max(0, y) / 18) * 0.38;
    k += front < 0.55 ? lobe * (front / 0.55) : lobe;
    tp.setXYZ(i, (x / r) * r * k, y, (z / r) * r * k);
  }
  trunk.computeVertexNormals();
  trunk.translate(0, 0, cz);
  bark.push(trunk);

  // ── Roots: arch out of the foot and dive into the earth
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.25;
    const front = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    if (front < 0.75) continue; // keep the way to the door clear
    const r0 = trunkRadius(8) * 0.95;
    const len = 34 + rand() * 46;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * (r0 - 8), 14 + rand() * 8, cz + dz * (r0 - 8)),
      new THREE.Vector3(dx * (r0 + len * 0.35), 9 + rand() * 6, cz + dz * (r0 + len * 0.35)),
      new THREE.Vector3(dx * (r0 + len * 0.75), 3 + rand() * 3, cz + dz * (r0 + len * 0.75) + (rand() - 0.5) * 8),
      new THREE.Vector3(dx * (r0 + len), -4, cz + dz * (r0 + len)),
    ]);
    bark.push(taperedTube(curve, 9 + rand() * 4, 1.5, 24, 10).toNonIndexed());
  }

  // ── Limbs, high up, with branches off them, ending in crowns of leaves
  const leafGeo = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const s = 0.8 + rand() * 0.35;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    g.translate(x, y, z);
    leaves.push(g.toNonIndexed());
  };
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number) => {
    const bend = new THREE.Vector3((rand() - 0.5) * 0.4, 0.25 + rand() * 0.2, (rand() - 0.5) * 0.4);
    const mid = from.clone().addScaledVector(dir, len * 0.5).addScaledVector(bend, len * 0.3);
    const end = from.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, len * (0.25 + rand() * 0.2), 0));
    const curve = new THREE.CatmullRomCurve3([from, mid, end]);
    bark.push(taperedTube(curve, r0, r0 * 0.28, 16, 9).toNonIndexed());
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const t = 0.45 + rand() * 0.4;
        const p = curve.getPointAt(t);
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (k ? 1 : -1) * (0.5 + rand() * 0.5));
        d.y += 0.3;
        d.normalize();
        limb(p, d, len * (0.45 + rand() * 0.15), r0 * 0.45, depth - 1);
      }
    }
    // a crown of leaves round the end
    const n = depth > 0 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      leafGeo(len * (0.16 + rand() * 0.1), end.x + (rand() - 0.5) * len * 0.35, end.y + (rand() - 0.3) * len * 0.15, end.z + (rand() - 0.5) * len * 0.35);
    }
  };
  for (let i = 0; i < 14; i++) {
    const y = 120 + (i / 14) * 230 + rand() * 20;
    const a = (i * 2.399) % (Math.PI * 2); // golden-angle spiral round the trunk
    const r = trunkRadius(y) * 0.9;
    const dir = new THREE.Vector3(Math.cos(a), 0.35 + rand() * 0.35, Math.sin(a)).normalize();
    limb(new THREE.Vector3(Math.cos(a) * r, y, cz + Math.sin(a) * r), dir, 130 + rand() * 90, 13 + rand() * 4, 1);
  }
  // the crown on top
  for (let k = 0; k < 10; k++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 60;
    leafGeo(45 + rand() * 30, Math.cos(a) * r, TOP + 10 + rand() * 50, cz + Math.sin(a) * r);
  }

  // ── Veins of light running up the bark: it's still the Data Tree
  for (let i = 0; i < 9; i++) {
    const a0 = Math.PI / 2 + (rand() - 0.5) * 2.6;
    const pts: THREE.Vector3[] = [];
    let a = a0;
    for (let y = 2; y < 160; y += 14) {
      a += (rand() - 0.5) * 0.08;
      const r = trunkRadius(y) * 1.035 + 0.6;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
    veins.push(taperedTube(new THREE.CatmullRomCurve3(pts), 0.55, 0.15, 40, 4).toNonIndexed());
  }

  // ── The doorway at its foot: a round hatch cut into the trunk, rimmed in riveted iron
  const R = DOOR_R;
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const gg = glow.getContext('2d')!;
  const grad = gg.createRadialGradient(32, 46, 2, 32, 36, 40);
  grad.addColorStop(0, '#ff7a2a');
  grad.addColorStop(0.35, '#7a1a08');
  grad.addColorStop(1, '#040202');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glow);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const doorGeo = new THREE.CircleGeometry(R, 48);
  const dp = doorGeo.attributes.position as THREE.BufferAttribute;
  const duv: number[] = [];
  for (let i = 0; i < dp.count; i++) duv.push((dp.getX(i) + R) / (R * 2), (dp.getY(i) + R) / (R * 2));
  doorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(duv, 2));
  // The doorway leans back with the flare of the trunk
  const doorway = new THREE.Group();
  doorway.position.set(0, 0, cz + FOOT_R + 3.6);
  doorway.rotation.x = -0.46;
  const door = new THREE.Mesh(doorGeo, new THREE.MeshBasicMaterial({ map: glowTex, toneMapped: false }));
  door.position.y = R - 0.4;
  doorway.add(door);
  // the iron collar: a heavy outer ring, a thinner inner one, bolts all round, and four
  // brackets reaching out into the bark where it's anchored
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.55, metalness: 0.75, flatShading: true, emissive: 0x2a1a14, emissiveIntensity: 0.35 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a3a1c, roughness: 0.85, metalness: 0.4, flatShading: true, emissive: 0x3a1408, emissiveIntensity: 0.3 });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(R + 0.55, 0.85, 8, 48), iron);
  outer.position.set(0, R - 0.4, 0.9);
  doorway.add(outer);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 0.15, 0.28, 6, 48), rust);
  inner.position.set(0, R - 0.4, 1.4);
  doorway.add(inner);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 6), iron);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(a) * (R + 0.55), R - 0.4 + Math.sin(a) * (R + 0.55), 1.75);
    doorway.add(bolt);
  }
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.4, 0.45), rust);
    bracket.position.set(Math.cos(a) * (R + 2.2), R - 0.4 + Math.sin(a) * (R + 2.2), 1.1);
    bracket.rotation.z = a - Math.PI / 2;
    doorway.add(bracket);
  }
  // the bark lip it's set into
  const lipPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    lipPts.push(new THREE.Vector3(Math.cos(a) * (R + 2.4), R - 0.4 + Math.sin(a) * (R + 2.4), 0.4));
  }
  const lip = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(lipPts, true), 1.9, 1.9, 48, 8), undefined);
  doorway.add(lip);
  root.add(doorway);

  // ── Merge per material
  // Charred: charcoal bark with embers still glowing in some cracks; the crowns burnt black
  const barkTex = barkTexture();
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex.map,
    color: 0xd8d0cc,
    roughness: 0.9,
    metalness: 0,
    emissive: 0xff4a14,
    emissiveMap: barkTex.embers,
    emissiveIntensity: 1.2,
  });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1c1614, roughness: 0.95, flatShading: true, emissive: 0x3a0a02, emissiveIntensity: 0.45 });
  const veinMat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff3b0f, emissiveIntensity: 1.3, roughness: 0.4 });
  const fix = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  };
  // the lathe's UVs wrap once round and once up: stretch the bark over it many times
  const tuv = trunk.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 40, tuv.getY(i) * 60);
  const barkMesh = new THREE.Mesh(mergeGeometries(bark.map(fix))!, barkMat);
  const leafMesh = new THREE.Mesh(mergeGeometries(leaves.map(fix))!, leafMat);
  const veinMesh = new THREE.Mesh(mergeGeometries(veins.map(fix))!, veinMat);
  for (const m of [barkMesh, leafMesh, veinMesh]) {
    m.frustumCulled = false; // huge: its bounds always touch the view anyway
    root.add(m);
  }
  lip.material = barkMat;
  root.userData.trunkRadius = FOOT_R;
  root.userData.height = TOP;
  return root;
}
