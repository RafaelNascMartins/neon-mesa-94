import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WeaponId } from './types';

/**
 * Procedural weapon models — slick and readable: clean gunmetal and chrome, warm wood, one
 * glowing accent colour per weapon, and a silhouette of its own for each (drum, bell, rails,
 * fat tube, keycap...) so no two read alike from the top-down camera.
 *
 * Frames match the old .glb weapons so the hand anchor / animations need no changes:
 *   guns   — held to the right (x ≈ 0.32–0.48), barrel pointing +Z, grip near the origin
 *   katana — handle at the origin, blade along +Z
 *   hammer — handle from the origin, head centred at z ≈ 1.02
 *
 * Each model is built from small parts, then merged into one mesh per material (few draw calls).
 */

type V3 = [number, number, number];

/** Faint self-light keeps the silhouettes readable in the dark arenas and through the post grade. */
const SELF_LIGHT = 0.38;
const std = (color: number, roughness: number, metalness: number) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: metalness * 0.6,
    emissive: color,
    emissiveIntensity: SELF_LIGHT,
    flatShading: true,
  });
const glow = (color: number, intensity = 2.2) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0.1 });

function palette() {
  return {
    dark: std(0x3a3c44, 0.4, 0.9),
    gunmetal: std(0x6a6e78, 0.32, 0.95),
    chrome: std(0xc8ccd6, 0.18, 1),
    wood: std(0x7a4426, 0.7, 0.05),
    woodDark: std(0x4a2814, 0.75, 0.05),
    grip: std(0x24242a, 0.9, 0),
    brass: std(0xc89a3a, 0.3, 0.9),
    olive: std(0x5a6a40, 0.7, 0.3),
    white: std(0xece8de, 0.35, 0.1),
    yellow: std(0xe8b41a, 0.5, 0.3),
    red: glow(0xff2a1f),
  };
}
type Pal = ReturnType<typeof palette>;

// ─────────────────────────────── part helpers ───────────────────────────────

function box(g: THREE.Group, size: V3, mat: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  g.add(m);
  return m;
}

/** Cylinder lying along +Z. */
function tube(g: THREE.Group, rTop: number, rBot: number, len: number, mat: THREE.Material, pos: V3, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(...pos);
  g.add(m);
  return m;
}

/** Ring around the Z axis. */
function band(g: THREE.Group, radius: number, thick: number, mat: THREE.Material, pos: V3, seg = 16) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 6, seg), mat);
  m.position.set(...pos);
  g.add(m);
  return m;
}

/** Ball, optionally squashed. */
function ball(g: THREE.Group, r: number, mat: THREE.Material, pos: V3, scl: V3 = [1, 1, 1], seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), mat);
  m.position.set(...pos);
  m.scale.set(...scl);
  g.add(m);
  return m;
}

/** Capsule lying along +Z (rounded ends). */
function pill(g: THREE.Group, r: number, len: number, mat: THREE.Material, pos: V3, scl: V3 = [1, 1, 1]) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(...pos);
  m.scale.set(...scl);
  g.add(m);
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Cone whose tip points along `dir`, base centred at `pos`. */
function cone(g: THREE.Group, radius: number, len: number, mat: THREE.Material, pos: V3, dir: V3, seg = 12) {
  const geo = new THREE.ConeGeometry(radius, len, seg);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize());
  g.add(m);
  return m;
}

/** A gently curved pistol grip: two angled slabs + a rounded butt. */
function pistolGrip(g: THREE.Group, mat: THREE.Material, x: number, y: number, z: number, h = 0.2, w = 0.07) {
  box(g, [w, h * 0.6, 0.09], mat, [x, y - h * 0.25, z - 0.02], [0.3, 0, 0]);
  box(g, [w, h * 0.55, 0.095], mat, [x, y - h * 0.7, z - 0.07], [0.5, 0, 0]);
  ball(g, w * 0.62, mat, [x, y - h * 0.98, z - 0.12], [1, 0.7, 1.3], 8);
}

function consolidate(g: THREE.Group, name: string): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    for (const key of Object.keys(flat.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') flat.deleteAttribute(key);
    }
    if (!flat.attributes.uv) flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
    const mat = mesh.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(flat);
  });
  const out = new THREE.Group();
  out.name = name;
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeVertexNormals();
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

// ─────────────────────────────── guns ───────────────────────────────

/** Single-action revolver: walnut grip, fluted cylinder, octagonal barrel, red sight line. */
function revolver(g: THREE.Group, p: Pal, x: number, short = false) {
  const len = short ? 0.36 : 0.5;
  pistolGrip(g, p.wood, x, 0.06, -0.06);
  box(g, [0.08, 0.11, 0.2], p.dark, [x, 0.11, 0.04]); // frame
  band(g, 0.045, 0.01, p.dark, [x, 0.02, 0.06]).rotation.y = Math.PI / 2; // trigger guard
  box(g, [0.015, 0.05, 0.015], p.chrome, [x, 0.03, 0.06]); // trigger
  tube(g, 0.068, 0.068, 0.13, p.gunmetal, [x, 0.13, 0.06], 6); // cylinder
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    box(g, [0.012, 0.012, 0.11], p.dark, [x + Math.cos(a) * 0.066, 0.13 + Math.sin(a) * 0.066, 0.06]);
  }
  tube(g, 0.036, 0.036, len, p.chrome, [x, 0.145, 0.12 + len / 2], 8); // barrel
  tube(g, 0.022, 0.022, len * 0.85, p.dark, [x, 0.1, 0.12 + len * 0.43], 8); // ejector rod
  box(g, [0.01, 0.006, len * 0.9], p.red, [x + 0.037, 0.15, 0.12 + len / 2]); // glowing sight line
  box(g, [0.014, 0.035, 0.02], p.chrome, [x, 0.19, 0.11 + len]); // front sight
  box(g, [0.03, 0.05, 0.04], p.dark, [x, 0.2, -0.04], [-0.6, 0, 0]); // hammer
}

function buildPistol(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  revolver(g, p, 0.44);
  return consolidate(g, 'weapon_pistol');
}

function buildPistols(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  revolver(g, p, 0.48);
  revolver(g, p, -0.48, true);
  return consolidate(g, 'weapon_pistols');
}

/** Pump shotgun: long walnut stock, receiver with red shell window, ribbed pump, tube magazine. */
function buildShotgun(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.34;
  box(g, [0.09, 0.15, 0.42], p.wood, [x, 0.04, -0.26], [0.12, 0, 0]); // stock
  box(g, [0.1, 0.05, 0.08], p.grip, [x, -0.02, -0.48], [0.12, 0, 0]); // butt pad
  pistolGrip(g, p.woodDark, x, 0.07, 0.02, 0.14);
  box(g, [0.11, 0.13, 0.28], p.dark, [x, 0.12, 0.12]); // receiver
  box(g, [0.112, 0.04, 0.12], p.red, [x, 0.12, 0.14]); // shell port glow
  tube(g, 0.042, 0.042, 0.72, p.gunmetal, [x, 0.16, 0.62]); // barrel
  tube(g, 0.032, 0.032, 0.6, p.dark, [x, 0.095, 0.56]); // magazine tube
  tube(g, 0.058, 0.058, 0.22, p.wood, [x, 0.1, 0.6]); // pump
  for (let i = 0; i < 4; i++) band(g, 0.06, 0.008, p.woodDark, [x, 0.1, 0.52 + i * 0.05]);
  box(g, [0.012, 0.025, 0.02], p.chrome, [x, 0.2, 0.96]);
  return consolidate(g, 'weapon_shotgun');
}

/** Plasma rifle: rounded cyan-lit shell, triple coil rings around a glowing core, battery cell. */
function buildPlasma(): THREE.Group {
  const p = palette();
  const cyan = glow(0x2ef0ff, 2.4);
  const g = new THREE.Group();
  const x = 0.36;
  pill(g, 0.1, 0.42, p.white, [x, 0.14, 0.02], [1, 0.9, 1]); // body
  box(g, [0.08, 0.1, 0.24], p.dark, [x, 0.08, -0.32], [0.1, 0, 0]); // stock
  pistolGrip(g, p.grip, x, 0.06, 0.02, 0.16);
  tube(g, 0.045, 0.045, 0.5, p.gunmetal, [x, 0.15, 0.42]); // barrel core
  tube(g, 0.03, 0.03, 0.5, cyan, [x, 0.15, 0.42]);
  for (let i = 0; i < 3; i++) band(g, 0.085 - i * 0.008, 0.018, cyan, [x, 0.15, 0.3 + i * 0.12]);
  tube(g, 0.06, 0.07, 0.06, p.dark, [x, 0.15, 0.68]); // muzzle
  box(g, [0.06, 0.12, 0.1], cyan, [x, -0.02, 0.14]); // battery cell
  box(g, [0.104, 0.02, 0.36], cyan, [x, 0.21, 0.02]); // top light strip
  return consolidate(g, 'weapon_plasma');
}

/** Railgun: two long open rails with green current arcing between, capacitor drum, scope. */
function buildRailgun(): THREE.Group {
  const p = palette();
  const green = glow(0x9dff2a, 2.6);
  const g = new THREE.Group();
  const x = 0.34;
  box(g, [0.08, 0.13, 0.36], p.dark, [x, 0.08, -0.28], [0.1, 0, 0]); // stock
  pistolGrip(g, p.grip, x, 0.06, 0.02, 0.15);
  box(g, [0.12, 0.14, 0.3], p.gunmetal, [x, 0.13, 0.08]); // body
  tube(g, 0.085, 0.085, 0.16, p.dark, [x, 0.13, 0.28], 16); // capacitor drum
  band(g, 0.088, 0.012, green, [x, 0.13, 0.26]);
  band(g, 0.088, 0.012, green, [x, 0.13, 0.31]);
  for (const s of [-1, 1]) box(g, [0.025, 0.11, 0.85], p.chrome, [x + s * 0.045, 0.13, 0.78]); // rails
  box(g, [0.03, 0.04, 0.8], green, [x, 0.13, 0.78]); // the current
  for (let i = 0; i < 4; i++) box(g, [0.12, 0.014, 0.02], p.dark, [x, 0.19, 0.45 + i * 0.2]); // rail ties
  tube(g, 0.03, 0.03, 0.22, p.dark, [x, 0.25, 0.1]); // scope
  tube(g, 0.026, 0.026, 0.01, green, [x, 0.25, 0.215]);
  return consolidate(g, 'weapon_railgun');
}

/** Rocket launcher: fat olive tube, flared exhaust, red warhead peeking out, side grip + sight. */
function buildRocket(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.32;
  tube(g, 0.13, 0.13, 1.0, p.olive, [x, 0.2, 0.18], 16);
  tube(g, 0.17, 0.13, 0.16, p.dark, [x, 0.2, -0.36], 16); // flared exhaust
  band(g, 0.135, 0.018, p.yellow, [x, 0.2, 0.0]);
  band(g, 0.135, 0.018, p.yellow, [x, 0.2, 0.5]);
  tube(g, 0.145, 0.14, 0.06, p.dark, [x, 0.2, 0.68], 16); // muzzle rim
  cone(g, 0.1, 0.16, p.red, [x, 0.2, 0.62], [0, 0, 1]); // warhead
  pistolGrip(g, p.grip, x, 0.06, 0.12, 0.16);
  box(g, [0.05, 0.12, 0.08], p.dark, [x, 0.03, 0.38]); // front grip
  box(g, [0.03, 0.08, 0.14], p.dark, [x - 0.13, 0.3, 0.2]); // flip sight
  return consolidate(g, 'weapon_rocket');
}

/** Nail gun: chunky yellow power tool, slanted nail strip, black nose, rubber handle. */
function buildNailgun(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.36;
  box(g, [0.13, 0.2, 0.36], p.yellow, [x, 0.17, 0.08]); // body
  box(g, [0.135, 0.05, 0.37], p.dark, [x, 0.27, 0.08]); // top cap
  pistolGrip(g, p.grip, x, 0.08, -0.04, 0.2, 0.075); // rubber handle under the rear
  box(g, [0.08, 0.06, 0.08], p.grip, [x, -0.1, 0.02]); // battery foot
  tube(g, 0.05, 0.04, 0.22, p.dark, [x, 0.12, 0.36]); // nose
  box(g, [0.05, 0.05, 0.02], p.red, [x, 0.12, 0.475]);
  for (let i = 0; i < 7; i++) box(g, [0.05, 0.012, 0.012], p.chrome, [x, 0.03 - i * 0.012, 0.22 - i * 0.03]); // nail strip
  box(g, [0.06, 0.012, 0.25], p.dark, [x, -0.01, 0.12], [0.45, 0, 0]);
  return consolidate(g, 'weapon_nailgun');
}

/** Speargun: slim barrel with rubber bands, harpoon with one clean arrowhead, reel on the side. */
function buildHarpoon(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.34;
  box(g, [0.07, 0.1, 0.4], p.wood, [x, 0.06, -0.2], [0.08, 0, 0]);
  pistolGrip(g, p.grip, x, 0.06, 0.04, 0.15);
  box(g, [0.06, 0.07, 0.7], p.wood, [x, 0.1, 0.4]); // barrel
  for (const s of [-1, 1]) {
    tube(g, 0.012, 0.012, 0.35, p.red, [x + s * 0.045, 0.14, 0.55]); // rubber bands
  }
  tube(g, 0.014, 0.014, 0.9, p.chrome, [x, 0.16, 0.6], 6); // shaft
  cone(g, 0.045, 0.16, p.chrome, [x, 0.16, 1.05], [0, 0, 1], 4); // arrowhead
  cone(g, 0.02, 0.06, p.chrome, [x, 0.16, 1.03], [0, -1, -1.4], 4); // single barb
  tube(g, 0.07, 0.07, 0.04, p.brass, [x + 0.07, 0.05, 0.12], 12).rotation.set(0, 0, Math.PI / 2); // reel
  return consolidate(g, 'weapon_harpoon');
}

/** fork(): stubby grenade launcher with a big revolving drum of glowing green bomblets. */
function buildForkbomb(): THREE.Group {
  const p = palette();
  const green = glow(0x3fd96a, 2.4);
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.grip, x, 0.04, -0.04, 0.17);
  box(g, [0.1, 0.1, 0.2], p.dark, [x, 0.1, -0.06]); // frame
  // The drum: wide, six chambers, each a green bomb face showing
  tube(g, 0.16, 0.16, 0.2, p.gunmetal, [x, 0.17, 0.16], 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ball(g, 0.045, green, [x + Math.cos(a) * 0.11, 0.17 + Math.sin(a) * 0.11, 0.26], [1, 1, 0.5], 8);
  }
  tube(g, 0.04, 0.04, 0.03, p.chrome, [x, 0.17, 0.27]); // axle cap
  tube(g, 0.07, 0.07, 0.32, p.dark, [x, 0.22, 0.42]); // fat short barrel
  band(g, 0.072, 0.014, green, [x, 0.22, 0.58]);
  box(g, [0.06, 0.04, 0.12], p.dark, [x, 0.05, 0.36]); // foregrip
  return consolidate(g, 'weapon_forkbomb');
}

/** Coice: two stubby sawn-off barrels side by side, swept walnut grip, brass hinge. */
function buildCoice(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.wood, x, 0.06, -0.06, 0.2, 0.08);
  box(g, [0.12, 0.1, 0.16], p.dark, [x, 0.12, 0.02]); // action
  tube(g, 0.03, 0.03, 0.04, p.brass, [x, 0.12, 0.1], 10).rotation.set(0, 0, Math.PI / 2); // hinge
  for (const s of [-1, 1]) {
    tube(g, 0.042, 0.042, 0.34, p.gunmetal, [x + s * 0.042, 0.14, 0.28]);
    tube(g, 0.026, 0.026, 0.01, p.red, [x + s * 0.042, 0.14, 0.455]); // hot bores
  }
  box(g, [0.11, 0.04, 0.16], p.wood, [x, 0.08, 0.2]); // fore-end
  return consolidate(g, 'weapon_coice');
}

/** Juiz: a hand cannon — huge gold cylinder, thick ported barrel glowing at the vents, bone grip. */
function buildJuiz(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.42;
  pistolGrip(g, p.white, x, 0.06, -0.07, 0.22, 0.08);
  box(g, [0.1, 0.14, 0.22], p.dark, [x, 0.13, 0.03]);
  tube(g, 0.1, 0.1, 0.16, p.brass, [x, 0.16, 0.06], 6); // oversized gold drum
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    tube(g, 0.022, 0.022, 0.02, p.dark, [x + Math.cos(a) * 0.06, 0.16 + Math.sin(a) * 0.06, 0.145], 8);
  }
  box(g, [0.09, 0.1, 0.5], p.gunmetal, [x, 0.18, 0.39]); // slab barrel
  for (let i = 0; i < 4; i++) box(g, [0.092, 0.02, 0.04], p.red, [x, 0.235, 0.24 + i * 0.09]); // vent ports
  box(g, [0.06, 0.02, 0.48], p.chrome, [x, 0.24, 0.39]); // top rib
  return consolidate(g, 'weapon_juiz');
}

/**
 * Canhão de Faces: a bell-mouthed cannon with a ring of tiny white Cem Faces masks around the
 * barrel and one big red eye in the breech.
 */
function buildFaces(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.38;
  pistolGrip(g, p.grip, x, 0.04, -0.06, 0.17);
  ball(g, 0.15, p.dark, [x, 0.18, -0.02], [1, 1, 1.15], 14); // round breech
  ball(g, 0.06, p.red, [x, 0.18, -0.15], [1, 1, 0.5], 10); // the eye, at the back
  tube(g, 0.06, 0.07, 0.4, p.gunmetal, [x, 0.18, 0.3]);
  tube(g, 0.2, 0.065, 0.24, p.dark, [x, 0.18, 0.6], 16); // bell mouth
  band(g, 0.2, 0.018, p.red, [x, 0.18, 0.72]);
  // Masks ringed round the barrel, facing out
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const mx = x + Math.cos(a) * 0.12;
    const my = 0.18 + Math.sin(a) * 0.12;
    const mask = box(g, [0.075, 0.09, 0.02], p.white, [mx, my, 0.3]);
    mask.lookAt(mx + Math.cos(a), my + Math.sin(a), 0.3);
    mask.rotateY(Math.PI / 2);
  }
  return consolidate(g, 'weapon_faces');
}

/**
 * rm -rf: a sleek white wand with a big red DELETE keycap on top and a wide flat slot nozzle
 * that sweeps a whole strip away.
 */
function buildRmrf(): THREE.Group {
  const p = palette();
  const red = glow(0xff2030, 2.8);
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.white, x, 0.04, -0.04, 0.17);
  pill(g, 0.075, 0.42, p.white, [x, 0.14, 0.12], [1.05, 0.85, 1]); // body
  box(g, [0.154, 0.02, 0.36], red, [x, 0.14, 0.12]); // red stripe round the waist
  // The keycap: a chunky rounded key with a dark stem
  box(g, [0.06, 0.04, 0.06], p.dark, [x, 0.22, 0.02]);
  box(g, [0.16, 0.06, 0.16], red, [x, 0.27, 0.02]);
  box(g, [0.13, 0.02, 0.13], glow(0xffffff, 1.2), [x, 0.305, 0.02]);
  // Slot nozzle: wide and flat, glowing lip
  tube(g, 0.06, 0.07, 0.1, p.dark, [x, 0.14, 0.4]); // neck
  box(g, [0.3, 0.05, 0.14], p.dark, [x, 0.14, 0.48]);
  box(g, [0.28, 0.02, 0.02], red, [x, 0.14, 0.555]);
  return consolidate(g, 'weapon_rmrf');
}

// ─────────────────────────────── melee ───────────────────────────────

/** Katana: a curved blade (segments bent along the arc), red hamon edge, round tsuba, wrapped hilt. */
function buildKatana(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  // Hilt: dark wrap with white diamond crossings, gold pommel cap
  box(g, [0.06, 0.08, 0.4], p.grip, [0, 0, -0.04]);
  for (let i = 0; i < 4; i++) box(g, [0.064, 0.05, 0.04], p.white, [0, 0, -0.18 + i * 0.09], [0, 0, Math.PI / 4]);
  tube(g, 0.045, 0.045, 0.04, p.brass, [0, 0, -0.26]);
  // Tsuba
  tube(g, 0.12, 0.12, 0.025, p.brass, [0, 0, 0.18], 16);
  // Curved blade: 6 segments, each tipped up a little more
  let y = 0;
  let z = 0.2;
  let a = 0;
  for (let i = 0; i < 6; i++) {
    const segLen = 0.2;
    const cz = z + Math.cos(a) * segLen * 0.5;
    const cy = y + Math.sin(a) * segLen * 0.5;
    box(g, [0.025, 0.07, segLen + 0.01], p.chrome, [0, cy, cz], [-a, 0, 0]);
    box(g, [0.027, 0.014, segLen + 0.01], p.red, [0, cy - 0.032 * Math.cos(a), cz + 0.032 * Math.sin(a)], [-a, 0, 0]);
    z += Math.cos(a) * segLen;
    y += Math.sin(a) * segLen;
    a += 0.035;
  }
  cone(g, 0.04, 0.14, p.chrome, [0, y, z], [0, Math.sin(a), Math.cos(a)], 3);
  return consolidate(g, 'weapon_katana');
}

/** Sledgehammer: a big round steel head with red-rimmed faces, long ash handle, taped grip. */
function buildHammer(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  tube(g, 0.04, 0.05, 1.2, p.wood, [0, 0, 0.42]);
  tube(g, 0.056, 0.056, 0.3, p.grip, [0, 0, -0.05]);
  tube(g, 0.06, 0.05, 0.06, p.dark, [0, 0, -0.22]);
  // Head: drum lying across X
  const head = tube(g, 0.15, 0.15, 0.5, p.gunmetal, [0, 0, 1.02], 16);
  head.rotation.set(0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    const face = tube(g, 0.155, 0.155, 0.05, p.dark, [s * 0.25, 0, 1.02], 16);
    face.rotation.set(0, 0, Math.PI / 2);
    const rim = band(g, 0.15, 0.015, p.red, [s * 0.275, 0, 1.02]);
    rim.rotation.y = Math.PI / 2;
  }
  box(g, [0.12, 0.33, 0.12], p.dark, [0, 0, 1.02]); // collar where the handle goes in
  return consolidate(g, 'weapon_hammer');
}

/** Dinamite: three red sticks bound with brass wire, a curled fuse with a glowing tip. */
function buildDinamite(): THREE.Group {
  const p = palette();
  const stick = std(0xc8281e, 0.6, 0.1);
  const g = new THREE.Group();
  const x = 0.36;
  for (const [dx, dy] of [[-0.045, 0.06], [0.045, 0.06], [0, 0.135]] as [number, number][]) {
    tube(g, 0.045, 0.045, 0.34, stick, [x + dx, dy + 0.04, 0.12]);
    tube(g, 0.03, 0.03, 0.01, p.white, [x + dx, dy + 0.04, 0.295]);
  }
  for (const z of [0.02, 0.22]) band(g, 0.1, 0.012, p.brass, [x, 0.12, z]);
  const fuse = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.17, 0.29), new THREE.Vector3(x, 0.26, 0.34), new THREE.Vector3(x + 0.04, 0.3, 0.28)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(fuse, 8, 0.01, 4), p.dark));
  ball(g, 0.03, glow(0xffd23a, 3), [x + 0.04, 0.3, 0.28], [1, 1, 1], 8);
  return consolidate(g, 'weapon_dinamite');
}

/** Maçarico: long steel nozzle with a pilot flame, fat orange fuel tank slung underneath. */
function buildMacarico(): THREE.Group {
  const p = palette();
  const orange = std(0xe06a1a, 0.5, 0.3);
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.grip, x, 0.12, -0.02, 0.16);
  box(g, [0.09, 0.1, 0.3], p.dark, [x, 0.19, 0.06]);
  tube(g, 0.04, 0.05, 0.5, p.gunmetal, [x, 0.2, 0.44]);
  tube(g, 0.055, 0.045, 0.06, p.dark, [x, 0.2, 0.71]);
  cone(g, 0.035, 0.14, glow(0xff8a1a, 2.6), [x, 0.2, 0.74], [0, 0, 1], 8); // pilot flame
  pill(g, 0.08, 0.3, orange, [x, 0.03, 0.18]); // tank
  band(g, 0.082, 0.012, p.dark, [x, 0.03, 0.1]);
  band(g, 0.082, 0.012, p.dark, [x, 0.03, 0.26]);
  tube(g, 0.012, 0.012, 0.2, p.grip, [x - 0.06, 0.1, 0.28]); // hose
  return consolidate(g, 'weapon_macarico');
}

/** Lança-CD: a chunky launcher with a big shiny disc loaded flat on top (reads from above). */
function buildDisco(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.grip, x, 0.06, -0.04, 0.16);
  box(g, [0.13, 0.11, 0.42], p.gunmetal, [x, 0.12, 0.12]);
  box(g, [0.14, 0.02, 0.4], glow(0xff5ac8, 1.8), [x, 0.08, 0.12]); // pink light strip
  tube(g, 0.2, 0.2, 0.015, p.chrome, [x, 0.19, 0.2], 24).rotation.set(0, 0, 0); // the disc, flat
  tube(g, 0.05, 0.05, 0.02, p.dark, [x, 0.195, 0.2], 12).rotation.set(0, 0, 0); // hub hole
  band(g, 0.14, 0.01, glow(0x7fe8ff, 1.6), [x, 0.2, 0.2]).rotation.x = Math.PI / 2; // rainbow sheen
  box(g, [0.15, 0.03, 0.06], p.dark, [x, 0.15, 0.4]); // mouth
  return consolidate(g, 'weapon_disco');
}

/** Corrente.exe: copper-coiled gun with two forward prongs and a crackling orb between them. */
function buildCorrente(): THREE.Group {
  const p = palette();
  const cyan = glow(0x2ee6ff, 2.6);
  const g = new THREE.Group();
  const x = 0.36;
  pistolGrip(g, p.grip, x, 0.06, -0.04, 0.16);
  box(g, [0.1, 0.12, 0.26], p.dark, [x, 0.13, 0.02]);
  tube(g, 0.05, 0.05, 0.28, p.gunmetal, [x, 0.15, 0.28]);
  for (let i = 0; i < 5; i++) band(g, 0.06, 0.014, p.brass, [x, 0.15, 0.17 + i * 0.05]);
  for (const s of [-1, 1]) {
    box(g, [0.02, 0.02, 0.2], p.chrome, [x + s * 0.05, 0.15, 0.5]);
    ball(g, 0.022, cyan, [x + s * 0.05, 0.15, 0.6], [1, 1, 1], 8);
  }
  ball(g, 0.04, cyan, [x, 0.15, 0.58], [1, 1, 1], 10);
  box(g, [0.06, 0.06, 0.1], cyan, [x, 0.24, 0.0]); // cell on top
  return consolidate(g, 'weapon_corrente');
}

export function buildWeaponModels(): Record<WeaponId, THREE.Group> {
  return {
    pistol: buildPistol(),
    pistols: buildPistols(),
    shotgun: buildShotgun(),
    plasma: buildPlasma(),
    railgun: buildRailgun(),
    rocket: buildRocket(),
    katana: buildKatana(),
    hammer: buildHammer(),
    nailgun: buildNailgun(),
    harpoon: buildHarpoon(),
    forkbomb: buildForkbomb(),
    coice: buildCoice(),
    juiz: buildJuiz(),
    faces: buildFaces(),
    rmrf: buildRmrf(),
    dinamite: buildDinamite(),
    macarico: buildMacarico(),
    disco: buildDisco(),
    corrente: buildCorrente(),
  };
}
