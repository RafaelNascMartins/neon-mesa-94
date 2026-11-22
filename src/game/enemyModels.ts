import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnemyArchetype } from './types';

/**
 * Procedural enemy models (replacing the old GLBs, whose parts floated apart: blades with no
 * arms, pauldrons in mid-air). Every limb here runs joint to joint. Static parts are merged per
 * material (a handful of draw calls per enemy); animated parts stay separate named pivots the
 * engine drives: spider `leg_upper_*` / `leg_lower_*`, spore `tentacle_*`, charger `leg_r`,
 * juggernaut `stack_*`.
 *
 * Front = +Z, feet on y = 0.
 */

type V3 = [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Blob mode (the Frutiger Aero world): the same enemy, same silhouette, but every part is a
 * rounded glossy jelly — boxes become ellipsoids, limbs become capsules, colours go candy-bright.
 */
let BLOB = false;

/** Candy version of a colour: keeps the hue, lifts it into bright, saturated jelly. */
export function jellyColor(hex: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0.55, hsl.s), 0.42 + hsl.l * 0.38);
  return c;
}

/** Turns an existing material into glossy jelly (for models not built by the Rig). */
/** Three hard light bands: the cartoon (cel) look. */
let toonRamp: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

export function jellyMaterial(hex: number, glowing = false): THREE.MeshToonMaterial {
  const c = jellyColor(hex);
  return new THREE.MeshToonMaterial({
    color: c,
    gradientMap: toonGradient(),
    emissive: c,
    emissiveIntensity: glowing ? 1.1 : 0.22,
  });
}

/** Black inverted-hull outline around every mesh of a model (cartoon ink lines). */
const inkMat = new THREE.MeshBasicMaterial({ color: 0x0a0a12, side: THREE.BackSide });
export function addInkOutlines(root: THREE.Object3D, thickness = 0.028) {
  // One merged ink mesh per parent group (pivots keep animating their own outline)
  const byParent = new Map<THREE.Object3D, THREE.BufferGeometry[]>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noInk && m.parent) meshes.push(m);
  });
  for (const m of meshes) {
    let g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-3);
    g.computeVertexNormals();
    // Into the parent's space, then push out along the (smoothed) normals
    m.updateMatrix();
    g.applyMatrix4(m.matrix);
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) + nor.getX(i) * thickness, pos.getY(i) + nor.getY(i) * thickness, pos.getZ(i) + nor.getZ(i) * thickness);
    }
    g.deleteAttribute('normal');
    const list = byParent.get(m.parent!) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    byParent.set(m.parent!, list);
  }
  for (const [parent, geos] of byParent) {
    const ink = new THREE.Mesh(mergeGeometries(geos), inkMat);
    ink.userData.noInk = true;
    ink.userData.ink = true;
    parent.add(ink);
  }
}

/** Where each enemy's face is (model units) for its big cartoon eyes: [x offset, y, z, eye radius]. */
const EYES: Partial<Record<EnemyArchetype, [number, number, number, number]>> = {
  rustler: [0.08, 1.7, 0.17, 0.07],
  ranger: [0.07, 1.9, 0.14, 0.065],
  charger: [0.13, 1.4, 0.86, 0.08],
  bombardier: [0.06, 1.55, 0.43, 0.055],
  spider: [0.1, 0.72, 0.6, 0.075],
  spore: [0.17, 1.32, 0.56, 0.11],
  mantis: [0.12, 1.82, 0.33, 0.07],
  juggernaut: [0.11, 2.16, 0.4, 0.08],
  tesla: [0.1, 1.4, 0.3, 0.075],
};

/** Big googly cartoon eyes: white, black pupil looking slightly in, a shine dot (2 draw calls). */
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
function addCartoonEyes(inner: THREE.Group, arch: EnemyArchetype) {
  const spot = EYES[arch];
  if (!spot) return;
  const [dx, y, z, r] = spot;
  const whites: THREE.BufferGeometry[] = [];
  const blacks: THREE.BufferGeometry[] = [];
  const at = (geo: THREE.BufferGeometry, x: number, yy: number, zz: number, sx: number, sy: number, sz: number) => {
    geo.scale(sx, sy, sz);
    geo.translate(x, yy, zz);
    return geo;
  };
  for (const s of [-1, 1]) {
    const ex = s * dx;
    whites.push(at(new THREE.SphereGeometry(r, 14, 10), ex, y, z, 1, 1.2, 0.7));
    blacks.push(at(new THREE.SphereGeometry(r * 0.5, 10, 8), ex - s * r * 0.15, y - r * 0.1, z + r * 0.55, 1, 1.2, 0.6));
    whites.push(at(new THREE.SphereGeometry(r * 0.18, 6, 4), ex - s * r * 0.05 + r * 0.15, y + r * 0.25, z + r * 0.85, 1, 1, 1));
  }
  const w = new THREE.Mesh(mergeGeometries(whites.map((g) => g.toNonIndexed())), eyeWhite);
  const k = new THREE.Mesh(mergeGeometries(blacks.map((g) => g.toNonIndexed())), eyeBlack);
  w.userData.noInk = true;
  k.userData.noInk = true;
  inner.add(w, k);
}

function mat(color: number, opts: { emissive?: number; ei?: number; metal?: number; rough?: number } = {}) {
  if (BLOB) return jellyMaterial(color, (opts.ei ?? 0) > 1);
  return new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ?? color,
    emissiveIntensity: opts.ei ?? 0.18,
    metalness: opts.metal ?? 0.15,
    roughness: opts.rough ?? 0.7,
    flatShading: true,
  });
}
function glow(color: number, ei = 1.4) {
  return mat(color, { emissive: color, ei, rough: 0.4 });
}

/** Collects primitive geometry per (pivot, material) and merges each bucket into one mesh. */
class Rig {
  readonly root = new THREE.Group();
  private buckets = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();

  pivot(name: string, parent: THREE.Object3D, pos: V3): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    parent.add(g);
    return g;
  }

  private push(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material) {
    let byMat = this.buckets.get(parent);
    if (!byMat) this.buckets.set(parent, (byMat = new Map()));
    let list = byMat.get(m);
    if (!list) byMat.set(m, (list = []));
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    list.push(geo);
  }

  /** Any geometry at a position / rotation / scale. */
  put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(_p.set(...pos), _q, _s.set(...scl));
    geo.applyMatrix4(_m);
    this.push(parent, geo, m);
  }

  box(parent: THREE.Object3D, size: V3, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]) {
    if (BLOB) {
      // A squishy ellipsoid filling the same box
      this.put(parent, new THREE.SphereGeometry(0.5, 14, 10), m, pos, rot, [size[0] * 1.15, size[1] * 1.15, size[2] * 1.15]);
      return;
    }
    this.put(parent, new THREE.BoxGeometry(...size), m, pos, rot);
  }

  ball(parent: THREE.Object3D, r: number, m: THREE.Material, pos: V3, scl: V3 = [1, 1, 1], seg = 8) {
    const n = BLOB ? Math.max(seg, 14) : seg;
    this.put(parent, new THREE.SphereGeometry(r, n, Math.max(4, n - 2)), m, pos, [0, 0, 0], scl);
  }

  /** A tapered cylinder running from a to b (r0 at a, r1 at b), with a ball joint at a. */
  limb(parent: THREE.Object3D, a: V3, b: V3, r0: number, m: THREE.Material, r1 = r0, seg = 6, joint = true) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const blob = BLOB;
    const rr = (r0 + r1) / 2;
    const geo = blob ? new THREE.CapsuleGeometry(rr * 1.15, Math.max(0.001, len), 4, 10) : new THREE.CylinderGeometry(r1, r0, len, seg);
    geo.translate(0, len / 2, 0);
    _q.setFromUnitVectors(_up, dir.normalize());
    _m.compose(va, _q, _s.set(1, 1, 1));
    geo.applyMatrix4(_m);
    this.push(parent, geo, m);
    if (joint && !blob) this.ball(parent, r0 * 1.15, m, a, [1, 1, 1], 6);
  }

  cone(parent: THREE.Object3D, r: number, h: number, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], seg = 6) {
    this.put(parent, new THREE.ConeGeometry(r, h, BLOB ? Math.max(seg, 12) : seg), m, pos, rot);
  }

  /** Merges every bucket into meshes. */
  build(): THREE.Group {
    for (const [parent, byMat] of this.buckets) {
      for (const [m, geos] of byMat) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), m);
        mesh.castShadow = true;
        parent.add(mesh);
      }
    }
    this.buckets.clear();
    return this.root;
  }
}

// ───────────────────────── Rustler: bandit with two machetes ─────────────────────────

function rustler(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const denim = mat(0x2a3550);
  const leather = mat(0x3a2418);
  const boot = mat(0x1e1410);
  const poncho = mat(0xc8283a, { ei: 0.25 });
  const cream = mat(0xe8d8b0);
  const skin = mat(0x8a5a3c);
  const steel = mat(0xd8dce4, { metal: 0.7, rough: 0.3, ei: 0.35 });
  const gold = mat(0xffc040, { metal: 0.6, ei: 0.4 });
  const hat = mat(0x2a1a16);
  const visor = glow(0xffd23a, 1.6);

  // Legs: hip → knee → ankle, boots with a spur
  for (const s of [-1, 1]) {
    r.limb(R, [s * 0.15, 0.9, 0], [s * 0.17, 0.48, 0.04], 0.1, denim, 0.09);
    r.limb(R, [s * 0.17, 0.48, 0.04], [s * 0.18, 0.14, 0], 0.085, denim, 0.08);
    r.box(R, [0.2, 0.2, 0.34], boot, [s * 0.18, 0.1, 0.05]);
    r.cone(R, 0.05, 0.08, gold, [s * 0.18, 0.1, -0.15], [Math.PI / 2, 0, 0], 5);
  }
  // Belt + buckle, torso
  r.box(R, [0.48, 0.14, 0.32], leather, [0, 0.92, 0]);
  r.box(R, [0.12, 0.09, 0.04], gold, [0, 0.92, 0.17]);
  r.box(R, [0.44, 0.46, 0.28], leather, [0, 1.18, 0]);
  // Poncho draped over the shoulders, cream stripes
  r.put(R, new THREE.CylinderGeometry(0.2, 0.52, 0.56, 8), poncho, [0, 1.2, 0]);
  r.put(R, new THREE.CylinderGeometry(0.43, 0.47, 0.06, 8), cream, [0, 1.06, 0]);
  r.put(R, new THREE.CylinderGeometry(0.3, 0.34, 0.05, 8), cream, [0, 1.3, 0]);
  // Bandolier across the chest
  r.box(R, [0.08, 0.62, 0.05], leather, [0, 1.2, 0.3], [0, 0, 0.75]);
  for (let k = 0; k < 4; k++) r.box(R, [0.04, 0.08, 0.04], gold, [-0.12 + k * 0.08, 1.08 + k * 0.08, 0.33], [0, 0, 0.75]);
  // Arms: shoulder → elbow → fist, each fist gripping a machete
  for (const s of [-1, 1]) {
    const sh: V3 = [s * 0.3, 1.38, 0];
    const el: V3 = [s * 0.44, 1.12, 0.12];
    const ha: V3 = [s * 0.42, 0.98, 0.34];
    r.limb(R, sh, el, 0.08, leather, 0.07);
    r.limb(R, el, ha, 0.07, skin, 0.06);
    r.ball(R, 0.075, skin, ha);
    // Machete: grip, guard, long blade pointing forward-down
    r.box(R, [0.05, 0.05, 0.14], leather, [ha[0], ha[1], ha[2] + 0.04]);
    r.box(R, [0.12, 0.03, 0.03], gold, [ha[0], ha[1], ha[2] + 0.12]);
    r.box(R, [0.03, 0.1, 0.62], steel, [ha[0], ha[1] - 0.03, ha[2] + 0.44], [0.12, 0, 0]);
  }
  // Neck, head, bandana mask, glowing visor
  r.limb(R, [0, 1.44, 0], [0, 1.52, 0], 0.07, skin);
  r.box(R, [0.3, 0.3, 0.3], skin, [0, 1.66, 0]);
  r.box(R, [0.32, 0.14, 0.06], poncho, [0, 1.58, 0.15]);
  r.cone(R, 0.1, 0.16, poncho, [0, 1.46, 0.17], [Math.PI, 0, 0], 4);
  r.box(R, [0.28, 0.06, 0.05], visor, [0, 1.71, 0.155]);
  // Hat: wide curled brim + crown with a band
  r.put(R, new THREE.CylinderGeometry(0.38, 0.4, 0.05, 12), hat, [0, 1.83, 0]);
  for (const s of [-1, 1]) r.box(R, [0.06, 0.06, 0.5], hat, [s * 0.36, 1.87, 0], [0, 0, s * 0.5]);
  r.put(R, new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10), hat, [0, 1.96, 0]);
  r.put(R, new THREE.CylinderGeometry(0.205, 0.205, 0.05, 10), gold, [0, 1.89, 0]);
  return r.build();
}

// ───────────────────────── Deadeye: long-coated sniper-sorcerer ─────────────────────────

function ranger(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const coat = mat(0x1f3a2c, { ei: 0.2 });
  const dark = mat(0x121a14);
  const skin = mat(0x6a7a5a);
  const metal = mat(0x4a5048, { metal: 0.6, rough: 0.4 });
  const wood = mat(0x4a2c1a);
  const green = glow(0x7dff4a, 1.8);
  const hat = mat(0x1a1612);

  // Boots and shins peeking under the duster
  for (const s of [-1, 1]) {
    r.limb(R, [s * 0.12, 0.6, 0], [s * 0.13, 0.12, 0.02], 0.07, dark);
    r.box(R, [0.16, 0.16, 0.3], dark, [s * 0.13, 0.08, 0.06]);
  }
  // Duster coat (split at the back), chest rig with pouches
  r.put(R, new THREE.CylinderGeometry(0.25, 0.42, 1.25, 8, 1, true), coat, [0, 0.95, 0]);
  r.put(R, new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8), coat, [0, 1.57, 0]);
  r.box(R, [0.36, 0.5, 0.26], coat, [0, 1.42, 0]);
  for (const x of [-0.1, 0.1]) r.box(R, [0.1, 0.12, 0.06], dark, [x, 1.38, 0.15]);
  // Battery pack on the back, straps over the shoulders, antenna mast with a glowing tip
  r.box(R, [0.3, 0.4, 0.16], metal, [0, 1.4, -0.22]);
  for (const s of [-1, 1]) r.box(R, [0.05, 0.05, 0.4], dark, [s * 0.12, 1.62, -0.02], [0.3, 0, 0]);
  r.limb(R, [0.1, 1.6, -0.25], [0.12, 2.25, -0.3], 0.02, metal);
  r.ball(R, 0.05, green, [0.12, 2.27, -0.3]);
  // Long rifle held across: stock at the right shoulder, barrel forward
  r.box(R, [0.07, 0.12, 0.42], wood, [0.12, 1.42, 0.12]);
  r.box(R, [0.07, 0.08, 0.9], metal, [0.12, 1.45, 0.74]);
  r.box(R, [0.075, 0.02, 0.7], green, [0.12, 1.49, 0.78]);
  r.box(R, [0.04, 0.05, 0.2], metal, [0.12, 1.53, 0.42]);
  r.ball(R, 0.035, green, [0.12, 1.45, 1.2]);
  // Arms: right hand on the grip, left hand under the barrel
  r.limb(R, [0.24, 1.6, 0], [0.3, 1.38, 0.08], 0.065, coat, 0.055);
  r.limb(R, [0.3, 1.38, 0.08], [0.14, 1.38, 0.24], 0.055, coat, 0.05);
  r.ball(R, 0.05, skin, [0.14, 1.38, 0.26]);
  r.limb(R, [-0.24, 1.6, 0], [-0.24, 1.38, 0.3], 0.065, coat, 0.055);
  r.limb(R, [-0.24, 1.38, 0.3], [0.1, 1.4, 0.62], 0.055, coat, 0.05);
  r.ball(R, 0.05, skin, [0.11, 1.4, 0.62]);
  // Gaunt head, scarf, monocle scope, wide hat
  r.limb(R, [0, 1.66, 0], [0, 1.74, 0], 0.06, skin);
  r.box(R, [0.24, 0.28, 0.24], skin, [0, 1.86, 0]);
  r.put(R, new THREE.TorusGeometry(0.14, 0.05, 5, 10), dark, [0, 1.72, 0], [Math.PI / 2, 0, 0]);
  r.put(R, new THREE.CylinderGeometry(0.055, 0.055, 0.1, 8), metal, [0.07, 1.89, 0.15], [Math.PI / 2, 0, 0]);
  r.put(R, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), green, [0.07, 1.89, 0.205], [Math.PI / 2, 0, 0]);
  r.box(R, [0.05, 0.03, 0.03], green, [-0.07, 1.9, 0.125]);
  r.put(R, new THREE.CylinderGeometry(0.36, 0.38, 0.04, 12), hat, [0, 2.02, 0]);
  r.put(R, new THREE.CylinderGeometry(0.13, 0.17, 0.26, 8), hat, [0, 2.16, 0]);
  r.put(R, new THREE.CylinderGeometry(0.172, 0.172, 0.04, 8), green, [0, 2.06, 0]);
  return r.build();
}

// ───────────────────────── Cyber-Bull: hunched cybernetic minotaur ─────────────────────────

function charger(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const hull = mat(0x161a24, { metal: 0.6, rough: 0.45, ei: 0.25 });
  const plate = mat(0x2a3040, { metal: 0.7, rough: 0.35, ei: 0.25 });
  const cyan = glow(0x2ef0ff, 1.6);
  const red = glow(0xff2a3a, 1.8);
  const bone = mat(0xd8d0bc, { ei: 0.3 });

  // Legs on hip pivots (leg_r scrapes the floor before the charge)
  for (const s of [-1, 1]) {
    const leg = r.pivot(s > 0 ? 'leg_r' : 'leg_l', R, [s * 0.32, 0.78, -0.05]);
    r.limb(leg, [0, 0, 0], [s * 0.04, -0.36, 0.12], 0.14, hull, 0.12);
    r.limb(leg, [s * 0.04, -0.36, 0.12], [s * 0.03, -0.66, -0.04], 0.11, plate, 0.1);
    r.box(leg, [0.24, 0.14, 0.3], plate, [s * 0.03, -0.71, 0.04]); // hoof
    r.box(leg, [0.25, 0.04, 0.06], cyan, [s * 0.03, -0.7, 0.2]);
  }
  // Hunched torso tipped forward, armour plates, reactor in the chest
  r.box(R, [0.62, 0.26, 0.44], hull, [0, 0.86, -0.02]);
  r.box(R, [0.9, 0.62, 0.62], hull, [0, 1.2, 0.08], [0.3, 0, 0]);
  r.box(R, [0.7, 0.3, 0.1], plate, [0, 1.3, 0.42], [0.3, 0, 0]);
  r.ball(R, 0.15, cyan, [0, 1.12, 0.42]);
  r.box(R, [0.94, 0.1, 0.5], plate, [0, 1.5, -0.05], [0.3, 0, 0]);
  // Shoulders bolted on, thick arms down to big fists
  for (const s of [-1, 1]) {
    r.box(R, [0.36, 0.22, 0.42], plate, [s * 0.56, 1.48, 0.05], [0.3, 0, s * -0.3]);
    r.box(R, [0.38, 0.05, 0.08], cyan, [s * 0.56, 1.56, 0.28], [0.3, 0, s * -0.3]);
    r.limb(R, [s * 0.52, 1.36, 0.06], [s * 0.66, 1.0, 0.2], 0.13, hull, 0.11);
    r.limb(R, [s * 0.66, 1.0, 0.2], [s * 0.62, 0.72, 0.34], 0.11, plate, 0.1);
    r.box(R, [0.24, 0.24, 0.24], plate, [s * 0.62, 0.66, 0.36]);
  }
  // Bull head thrust low and forward: snout, nose ring, red eyes, horns curling forward
  r.limb(R, [0, 1.42, 0.3], [0, 1.36, 0.5], 0.14, hull);
  r.box(R, [0.42, 0.34, 0.42], hull, [0, 1.32, 0.62]);
  r.box(R, [0.32, 0.2, 0.22], plate, [0, 1.22, 0.86]);
  r.put(R, new THREE.TorusGeometry(0.07, 0.018, 4, 10), bone, [0, 1.14, 0.98]);
  for (const s of [-1, 1]) {
    r.box(R, [0.1, 0.05, 0.04], red, [s * 0.12, 1.38, 0.835]);
    r.limb(R, [s * 0.2, 1.42, 0.6], [s * 0.5, 1.56, 0.62], 0.07, bone, 0.055);
    r.limb(R, [s * 0.5, 1.56, 0.62], [s * 0.6, 1.66, 0.92], 0.055, bone, 0.03);
    r.cone(R, 0.035, 0.16, cyan, [s * 0.6, 1.7, 1.02], [Math.PI / 2.4, 0, 0], 5);
  }
  return r.build();
}

// ───────────────────────── Catalyst mage: frail, hunched, all bones and a staff ─────────────────────────

function bombardier(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const robe = mat(0x3a1a52, { ei: 0.22 });
  const robeDark = mat(0x22102e);
  const bone = mat(0xcfc6b0, { ei: 0.3 });
  const wood = mat(0x3a2414);
  const gold = mat(0xd8a838, { metal: 0.6, ei: 0.35 });
  const orb = glow(0xff4ad8, 2.0);
  const eyes = glow(0xffd23a, 2);

  // Spindly legs, knees bent under the robe
  for (const s of [-1, 1]) {
    r.limb(R, [s * 0.1, 0.62, -0.05], [s * 0.13, 0.34, 0.08], 0.035, bone);
    r.limb(R, [s * 0.13, 0.34, 0.08], [s * 0.12, 0.05, -0.02], 0.03, bone);
    r.box(R, [0.08, 0.05, 0.16], bone, [s * 0.12, 0.03, 0.03]);
  }
  // Long ragged robe, tattered hem
  r.put(R, new THREE.CylinderGeometry(0.14, 0.34, 1.0, 8, 1, true), robe, [0, 0.72, 0], [0.1, 0, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    r.cone(R, 0.06, 0.2, robeDark, [Math.sin(a) * 0.32, 0.18, Math.cos(a) * 0.32 - 0.03], [Math.PI, 0, 0], 3);
  }
  // Bent back: chest curls forward, gold collar
  r.limb(R, [0, 1.18, -0.06], [0, 1.42, 0.12], 0.12, robe, 0.1);
  r.put(R, new THREE.TorusGeometry(0.12, 0.03, 4, 10), gold, [0, 1.38, 0.1], [Math.PI / 2 + 0.6, 0, 0]);
  // Thin neck craning forward, skull face in a drooping pointed hood, glowing eyes
  r.limb(R, [0, 1.42, 0.12], [0, 1.48, 0.28], 0.04, bone);
  r.ball(R, 0.13, bone, [0, 1.5, 0.32], [1, 1.1, 1]);
  r.box(R, [0.06, 0.03, 0.03], eyes, [-0.05, 1.53, 0.43]);
  r.box(R, [0.06, 0.03, 0.03], eyes, [0.05, 1.53, 0.43]);
  r.put(R, new THREE.ConeGeometry(0.2, 0.36, 6, 1, true), robeDark, [0, 1.62, 0.26], [0.35, 0, 0]);
  r.cone(R, 0.06, 0.28, robeDark, [0, 1.86, 0.12], [-0.9, 0, 0], 5); // floppy hood tip
  // Right arm: bony, clutching a crooked staff planted on the floor, catalyst orb in a claw cage
  r.limb(R, [0.16, 1.38, 0.06], [0.3, 1.18, 0.2], 0.035, bone);
  r.limb(R, [0.3, 1.18, 0.2], [0.34, 1.3, 0.36], 0.03, bone);
  r.ball(R, 0.04, bone, [0.34, 1.3, 0.38]);
  r.limb(R, [0.36, 0.0, 0.42], [0.34, 1.5, 0.38], 0.03, wood, 0.025, 5, false);
  r.limb(R, [0.34, 1.5, 0.38], [0.3, 1.72, 0.34], 0.025, wood, 0.02, 5, false);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    r.limb(R, [0.3, 1.72, 0.34], [0.3 + Math.cos(a) * 0.1, 1.9, 0.34 + Math.sin(a) * 0.1], 0.015, gold, 0.01, 4, false);
  }
  r.ball(R, 0.09, orb, [0.3, 1.84, 0.34]);
  // Left arm: trembling open hand reaching out to the ally it empowers
  r.limb(R, [-0.16, 1.38, 0.06], [-0.32, 1.3, 0.3], 0.035, bone);
  r.limb(R, [-0.32, 1.3, 0.3], [-0.36, 1.36, 0.56], 0.03, bone);
  for (let f = 0; f < 4; f++) r.limb(R, [-0.36, 1.36, 0.56], [-0.42 + f * 0.04, 1.36 + (f % 2) * 0.03, 0.68], 0.012, bone, 0.008, 4, false);
  r.ball(R, 0.05, orb, [-0.38, 1.38, 0.74], [1, 1, 1], 6);
  return r.build();
}

// ───────────────────────── ARACHNID.EXE ─────────────────────────

function spider(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const shell = mat(0x7dd82a, { ei: 0.25 });
  const dark = mat(0x161a12);
  const red = glow(0xff2a4a, 2);
  const pink = glow(0xff3aa8, 1.6);
  const fang = glow(0x46e8ff, 1.2);

  // Thorax + head + big abdomen with a glowing ".exe" circuit stripe
  r.ball(R, 0.38, shell, [0, 0.62, 0.05], [1, 0.72, 1.1]);
  r.ball(R, 0.22, dark, [0, 0.6, 0.42], [1, 0.8, 0.9]);
  r.ball(R, 0.55, shell, [0, 0.78, -0.62], [1, 0.82, 1.15]);
  r.box(R, [0.08, 0.06, 0.9], pink, [0, 1.2, -0.62], [0.12, 0, 0]);
  for (const s of [-1, 1]) r.box(R, [0.06, 0.05, 0.6], pink, [s * 0.32, 1.06, -0.62], [0.1, 0, s * 0.5]);
  r.limb(R, [0, 0.66, -0.2], [0, 0.72, -0.3], 0.18, dark);
  // Eye cluster and fangs
  const eyePos: V3[] = [[-0.08, 0.7, 0.6], [0.08, 0.7, 0.6], [-0.15, 0.66, 0.55], [0.15, 0.66, 0.55], [0, 0.76, 0.56], [-0.05, 0.62, 0.62], [0.05, 0.62, 0.62]];
  if (!BLOB) for (const p of eyePos) r.ball(R, 0.035, red, p, [1, 1, 1], 6);
  for (const s of [-1, 1]) r.cone(R, 0.04, 0.2, fang, [s * 0.07, 0.48, 0.62], [Math.PI * 0.85, 0, 0], 4);
  // 8 legs: upper pivot at the body, lower pivot at the knee (child), foot claw
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.3 - i * 0.2;
      const upper = r.pivot(`leg_upper_${s}_${i}`, R, [s * 0.28, 0.64, z]);
      const knee: V3 = [s * 0.42, 0.3, (1.5 - i) * 0.12];
      r.limb(upper, [0, 0, 0], knee, 0.055, dark, 0.045);
      const lower = r.pivot(`leg_lower_${s}_${i}`, upper, knee);
      r.limb(lower, [0, 0, 0], [s * 0.42, -1.0, (1.5 - i) * 0.1], 0.045, shell, 0.02);
      r.ball(lower, 0.05, dark, [0, 0, 0]);
    }
  }
  return r.build();
}

// ───────────────────────── VIRAL_SPORE ─────────────────────────

function spore(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const sac = mat(0x5a2a7a, { ei: 0.25, rough: 0.5 });
  const spot = mat(0x9a4ac8, { ei: 0.35 });
  const core = glow(0xb8ff3a, 1.8);
  const pod1 = glow(0xff3ab8, 1.2);
  const pod2 = glow(0xb8ff3a, 1.2);
  const stalk = mat(0x3a1a4a);

  // Fungal sac, spots, ring "windows" onto the glowing core
  r.put(R, BLOB ? new THREE.SphereGeometry(0.62, 18, 14) : new THREE.IcosahedronGeometry(0.62, 1), sac, [0, 1.22, 0], [0, 0, 0], [1, 0.85, 1]);
  r.ball(R, 0.3, core, [0, 1.2, 0.18]);
  for (const s of [-1, 1]) r.put(R, new THREE.TorusGeometry(0.16, 0.04, 5, 10), spot, [s * 0.26, 1.24, 0.48], [0, s * 0.5, 0]);
  r.put(R, new THREE.TorusGeometry(0.2, 0.05, 5, 12), spot, [0, 1.15, 0.55]);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.3;
    r.ball(R, 0.07 + (k % 3) * 0.02, spot, [Math.cos(a) * 0.5, 1.15 + Math.sin(k) * 0.3, Math.sin(a) * 0.5]);
  }
  // Crown: stalks with glowing pods
  const crown: [V3, THREE.Material][] = [[[-0.25, 1.95, 0.05], pod1], [[0.22, 1.98, -0.08], pod2], [[0.02, 2.05, 0.2], pod1]];
  for (const [p, m] of crown) {
    r.limb(R, [p[0] * 0.5, 1.68, p[2] * 0.5], p, 0.035, stalk, 0.025);
    r.ball(R, 0.12, m, p);
  }
  // Tentacles: pivots under the sac, three tapering segments each, glowing tips
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const t = r.pivot(`tentacle_${i}`, R, [Math.cos(a) * 0.3, 0.78, Math.sin(a) * 0.3]);
    const o = [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1];
    r.limb(t, [0, 0, 0], [o[0], -0.25, o[2]], 0.07, sac, 0.055);
    r.limb(t, [o[0], -0.25, o[2]], [o[0] * 1.8, -0.48, o[2] * 1.8], 0.055, sac, 0.04);
    r.limb(t, [o[0] * 1.8, -0.48, o[2] * 1.8], [o[0] * 2.2, -0.66, o[2] * 2.2], 0.04, spot, 0.015);
    r.ball(t, 0.035, pod2, [o[0] * 2.2, -0.68, o[2] * 2.2]);
  }
  return r.build();
}

// ───────────────────────── ROOT_STALKER: root-and-bark mantis ─────────────────────────

function mantis(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const bark = mat(0x3a2a1a, { ei: 0.2 });
  const moss = mat(0x3a7a2a, { ei: 0.3 });
  const chitin = mat(0x22301c);
  const blade = glow(0x46e8ff, 1.3);
  const eye = glow(0x46e8ff, 2);
  const amber = glow(0xffb02a, 1.2);

  // Four thin legs from the low abdomen joint, knees high
  for (const s of [-1, 1]) {
    for (const z of [0.05, -0.35]) {
      r.limb(R, [s * 0.12, 0.82, z], [s * 0.45, 0.72, z + 0.05], 0.045, chitin, 0.035);
      r.limb(R, [s * 0.45, 0.72, z + 0.05], [s * 0.55, 0.02, z + 0.12], 0.035, bark, 0.02);
    }
  }
  // Segmented abdomen trailing back, root tendrils
  r.ball(R, 0.22, bark, [0, 0.82, -0.1], [1, 0.9, 1.2]);
  r.ball(R, 0.2, moss, [0, 0.78, -0.42], [1, 0.85, 1.2]);
  r.ball(R, 0.15, bark, [0, 0.72, -0.7], [1, 0.8, 1.2]);
  r.limb(R, [0, 0.66, -0.78], [0.1, 0.2, -1.0], 0.03, bark, 0.012);
  r.limb(R, [0, 0.66, -0.78], [-0.12, 0.25, -0.95], 0.025, bark, 0.01);
  // Upright thorax leaning forward
  r.limb(R, [0, 0.9, 0], [0, 1.55, 0.18], 0.12, bark, 0.09);
  r.box(R, [0.06, 0.4, 0.05], amber, [0, 1.25, 0.16], [-0.27, 0, 0]);
  for (const s of [-1, 1]) r.cone(R, 0.05, 0.2, moss, [s * 0.1, 1.45, 0.05], [0, 0, s * -0.6], 4);
  // Triangular head, big eyes, antennae
  r.limb(R, [0, 1.55, 0.18], [0, 1.66, 0.24], 0.06, chitin);
  r.put(R, new THREE.ConeGeometry(0.2, 0.3, 3), chitin, [0, 1.74, 0.3], [-Math.PI / 2 - 0.4, 0, 0]);
  for (const s of [-1, 1]) {
    if (!BLOB) r.ball(R, 0.07, eye, [s * 0.12, 1.8, 0.28]);
    r.limb(R, [s * 0.05, 1.85, 0.26], [s * 0.2, 2.15, 0.1], 0.012, chitin, 0.008, 4, false);
  }
  // Scythe arms: shoulder → elbow up high → forearm → one continuous hooked blade
  for (const s of [-1, 1]) {
    const sh: V3 = [s * 0.13, 1.45, 0.16];
    const el: V3 = [s * 0.3, 1.68, 0.42];
    const wr: V3 = [s * 0.28, 1.28, 0.62];
    r.limb(R, sh, el, 0.055, chitin, 0.045);
    r.limb(R, el, wr, 0.045, bark, 0.04);
    const b1: V3 = [wr[0], wr[1] - 0.4, wr[2] + 0.2];
    const b2: V3 = [wr[0] * 0.9, wr[1] - 0.46, wr[2] + 0.56];
    r.limb(R, wr, b1, 0.06, blade, 0.05, 3);
    r.limb(R, b1, b2, 0.05, blade, 0.008, 3);
  }
  return r.build();
}

// ───────────────────────── IRONCLAD: artillery mech ─────────────────────────

function juggernaut(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const iron = mat(0x2a2c32, { metal: 0.7, rough: 0.45, ei: 0.2 });
  const rust = mat(0x5a3220, { metal: 0.4, ei: 0.2 });
  const plate = mat(0x3a3e48, { metal: 0.7, rough: 0.35, ei: 0.2 });
  const fire = glow(0xff8a1a, 1.8);
  const hazard = mat(0xd89a1a, { ei: 0.35 });

  // Legs: thick thigh → knee pad → shin → big boot
  for (const s of [-1, 1]) {
    r.limb(R, [s * 0.32, 1.05, 0], [s * 0.38, 0.58, 0.12], 0.17, iron, 0.15);
    r.box(R, [0.3, 0.26, 0.2], plate, [s * 0.38, 0.6, 0.24]);
    r.limb(R, [s * 0.38, 0.58, 0.12], [s * 0.38, 0.18, 0.02], 0.14, rust, 0.13);
    r.box(R, [0.4, 0.22, 0.56], iron, [s * 0.38, 0.11, 0.08]);
    r.box(R, [0.42, 0.06, 0.08], hazard, [s * 0.38, 0.2, 0.36]);
  }
  // Hips and a huge torso with a furnace grill
  r.box(R, [0.8, 0.26, 0.5], iron, [0, 1.12, 0]);
  r.box(R, [1.2, 0.86, 0.8], plate, [0, 1.62, 0]);
  r.box(R, [0.7, 0.44, 0.1], iron, [0, 1.58, 0.42]);
  for (let k = 0; k < 4; k++) r.box(R, [0.56, 0.05, 0.04], fire, [0, 1.44 + k * 0.1, 0.48]);
  r.box(R, [1.22, 0.08, 0.82], hazard, [0, 2.02, 0]);
  // Little domed head sunk between the shoulders, glowing visor slit
  r.ball(R, 0.24, iron, [0, 2.12, 0.18], [1, 0.8, 1]);
  if (!BLOB) r.box(R, [0.32, 0.05, 0.05], fire, [0, 2.14, 0.38]);
  // Pauldrons, arms ending in cannons pointing forward
  for (const s of [-1, 1]) {
    r.box(R, [0.46, 0.34, 0.6], rust, [s * 0.78, 2.0, 0], [0, 0, s * -0.2]);
    r.limb(R, [s * 0.72, 1.82, 0], [s * 0.8, 1.42, 0.08], 0.14, iron, 0.12);
    r.put(R, new THREE.CylinderGeometry(0.15, 0.17, 0.7, 10), plate, [s * 0.82, 1.36, 0.36], [Math.PI / 2, 0, 0]);
    r.put(R, new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), fire, [s * 0.82, 1.36, 0.72], [Math.PI / 2, 0, 0]);
    r.box(R, [0.06, 0.2, 0.3], hazard, [s * 0.98, 1.36, 0.3]);
  }
  // Back stacks: the artillery tubes (smoke comes out of these)
  for (const s of [-1, 1]) {
    const st = r.pivot(s < 0 ? 'stack_l' : 'stack_r', R, [s * 0.3, 2.05, -0.3]);
    r.put(st, new THREE.CylinderGeometry(0.13, 0.15, 0.7, 10), iron, [0, 0.35, 0]);
    r.put(st, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), rust, [0, 0.7, 0]);
    r.put(st, new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), fire, [0, 0.745, 0]);
  }
  return r.build();
}

// ───────────────────────── VOLT_WRAITH: a skull piloting a tiny tesla ship ─────────────────────────

function tesla(): THREE.Group {
  const r = new Rig();
  const R = r.root;
  const hull = mat(0x23283a, { metal: 0.7, rough: 0.35, ei: 0.25 });
  const trim = mat(0x8a94a8, { metal: 0.8, rough: 0.3, ei: 0.25 });
  const bone = mat(0xe8e0cc, { ei: 0.35 });
  const sock = mat(0x0a0a10);
  const cyan = glow(0x46e8ff, 2);
  const copper = mat(0xc86a2a, { metal: 0.7, ei: 0.3 });

  // Ship hovering at waist height: saucer hull, rim lights, cockpit ring, thruster glow underneath
  r.put(R, new THREE.CylinderGeometry(0.58, 0.42, 0.26, 12), hull, [0, 0.82, 0]);
  r.put(R, new THREE.CylinderGeometry(0.62, 0.62, 0.06, 12), trim, [0, 0.92, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    r.ball(R, 0.04, cyan, [Math.cos(a) * 0.62, 0.92, Math.sin(a) * 0.62], [1, 1, 1], 5);
  }
  r.put(R, new THREE.ConeGeometry(0.3, 0.4, 10), cyan, [0, 0.52, 0], [Math.PI, 0, 0]);
  r.put(R, new THREE.TorusGeometry(0.34, 0.05, 6, 14), trim, [0, 1.0, 0.02], [Math.PI / 2, 0, 0]);
  // Tail fin + thruster at the back
  r.box(R, [0.06, 0.34, 0.36], hull, [0, 1.06, -0.52], [0.4, 0, 0]);
  r.put(R, new THREE.CylinderGeometry(0.1, 0.13, 0.22, 8), trim, [0, 0.84, -0.62], [Math.PI / 2, 0, 0]);
  r.put(R, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8), cyan, [0, 0.84, -0.74], [Math.PI / 2, 0, 0]);
  // Tesla prongs out front (they fire the twin bolts)
  for (const s of [-1, 1]) {
    r.limb(R, [s * 0.22, 0.86, 0.45], [s * 0.26, 0.88, 0.85], 0.04, copper, 0.03);
    r.ball(R, 0.06, cyan, [s * 0.26, 0.88, 0.88]);
  }
  // The pilot: a skull sitting in the cockpit, cracked jaw, glowing eye sockets, a little spine
  r.limb(R, [0, 0.96, -0.04], [0, 1.12, 0], 0.05, bone);
  for (let k = 0; k < 3; k++) r.limb(R, [-0.12, 1.0 + k * 0.05, 0.02], [0.12, 1.0 + k * 0.05, 0.02], 0.015, bone, 0.015, 4, false);
  r.ball(R, 0.26, bone, [0, 1.36, 0.02], [1, 0.95, 1.05], 10);
  r.box(R, [0.3, 0.12, 0.2], bone, [0, 1.17, 0.12]);
  for (let k = 0; k < 5; k++) r.box(R, [0.035, 0.05, 0.02], sock, [-0.09 + k * 0.045, 1.2, 0.225]);
  if (!BLOB) {
    for (const s of [-1, 1]) {
      r.ball(R, 0.075, sock, [s * 0.1, 1.38, 0.2]);
      r.ball(R, 0.04, cyan, [s * 0.1, 1.38, 0.24], [1, 1, 1], 6);
    }
  }
  r.cone(R, 0.04, 0.08, sock, [0, 1.28, 0.25], [Math.PI, 0, 0], 3);
  // Coil spire behind the seat, copper windings, orb crackling on top
  r.limb(R, [0, 0.96, -0.34], [0, 1.78, -0.34], 0.05, trim, 0.04, 6, false);
  for (let k = 0; k < 4; k++) r.put(R, new THREE.TorusGeometry(0.09 - k * 0.012, 0.025, 4, 10), copper, [0, 1.22 + k * 0.14, -0.34], [Math.PI / 2, 0, 0]);
  r.ball(R, 0.12, cyan, [0, 1.88, -0.34], [1, 1, 1], 10);
  // Halo ring of current around the ship
  r.put(R, new THREE.TorusGeometry(0.82, 0.03, 4, 28), cyan, [0, 0.88, 0], [Math.PI / 2, 0, 0]);
  return r.build();
}

/** How much bigger than the cowboy each one stands. */
export const ENEMY_SCALE: Partial<Record<EnemyArchetype, number>> = {
  rustler: 1.28,
  ranger: 1.25,
  charger: 1.35,
  bombardier: 1.25,
  spider: 1.35,
  spore: 1.3,
  mantis: 1.3,
  juggernaut: 1.35,
  tesla: 1.3,
};

const BUILDERS: Partial<Record<EnemyArchetype, () => THREE.Group>> = {
  rustler,
  ranger,
  charger,
  bombardier,
  spider,
  spore,
  mantis,
  juggernaut,
  tesla,
};

/** The procedural model for an archetype (undefined for the boss, which keeps its GLB). */
export function buildEnemyModel(arch: EnemyArchetype, blob = false): THREE.Group | undefined {
  const b = BUILDERS[arch];
  if (!b) return undefined;
  // Built at "human" size; scaled up on an inner group so they read big next to the cowboy
  // (the engine animates the outer group's scale for spawns / fuses)
  BLOB = blob;
  let inner: THREE.Group;
  try {
    inner = b();
  } finally {
    BLOB = false;
  }
  if (blob) {
    // Cartoon finish: big googly eyes + cel shading (materials)
    addCartoonEyes(inner, arch);
  }
  inner.scale.setScalar(ENEMY_SCALE[arch] ?? 1.3);
  const g = new THREE.Group();
  g.name = blob ? `blob_${arch}` : `enemy_${arch}`;
  if (blob) {
    // The jiggle lives on this middle group (see wobbleBlob)
    const body = new THREE.Group();
    body.name = 'blob_body';
    body.add(inner);
    g.add(body);
    g.userData.blob = true;
  } else g.add(inner);
  return g;
}
