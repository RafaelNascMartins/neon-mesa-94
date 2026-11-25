import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WeaponId } from './types';
import {
  arrowsTex,
  boltTex,
  checkerTex,
  discTex,
  redScreenTex,
  skullScreenTex,
  starTex,
  stripeTex,
  sunTex,
  treeScreenTex,
  woodTex,
  wornTex,
  wrapTex,
} from './weaponTextures';

/**
 * Procedural weapon models in a chunky, worn pixel-art style: chamfered blocks, octagonal
 * barrels, rivets, rust blooms through chipped paint, hazard stripes and checker panels, a few
 * painted screens and emblems, and one glowing accent per gun. Three families:
 *  - Data Tree tech: Lança-CD, Canhão de Faces, fork(), Juiz, Sunfire, Volt
 *  - industrial western: Peacemaker(s), Scattergun, Coice, Starburst, Pregadeira
 *  - melee & tools: Katana, Marreta, Arpão, rm -rf, Dinamite, Maçarico, Corrente.exe
 *
 * Frames are the same as before so the hand anchor / animations need no changes:
 *   guns   — held to the right (x ≈ 0.32–0.48), barrel pointing +Z, grip near the origin
 *   katana — handle at the origin, blade along +Z
 *   hammer — handle from the origin, head centred at z ≈ 1.02
 *
 * Each model is built at x = 0 inside a group shifted to its side, then merged into one mesh
 * per material (few draw calls).
 */

type V3 = [number, number, number];

/** Faint self-light keeps them readable in the dark arenas (through the texture, so it keeps its detail). */
const SELF_LIGHT = 0.34;
/** Texels per world unit for the tiling textures (position-mapped). */
const TEXELS_PER_UNIT = 56;

function surf(map: THREE.Texture, roughness = 0.8, metalness = 0.2) {
  const m = new THREE.MeshStandardMaterial({
    map,
    roughness,
    metalness: metalness * 0.6,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: SELF_LIGHT,
    flatShading: true,
  });
  m.userData.projUV = true;
  return m;
}
/** A painted screen / emblem: its texture spans each face it's on. */
function decal(map: THREE.Texture, light = 0.7) {
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: light, roughness: 0.5, flatShading: true });
}
const glow = (color: number, intensity = 2.2) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35, metalness: 0.1 });

function palette() {
  return {
    iron: surf(wornTex(0x3e3934, { rust: 0.35, chips: 0.25 }), 0.6, 0.7),
    ironDark: surf(wornTex(0x27241f, { rust: 0.2, chips: 0.18 }), 0.6, 0.7),
    rust: surf(wornTex(0x7a3e1c, { rust: 0.6, chips: 0.1, noise: 0.18 }), 0.9, 0.3),
    white: surf(wornTex(0xcfc5b0, { rust: 0.32, chips: 0.25 }), 0.75, 0.2),
    red: surf(wornTex(0x8e2a20, { rust: 0.25, chips: 0.3 }), 0.75, 0.2),
    orange: surf(wornTex(0xc4602a, { rust: 0.32, chips: 0.2 }), 0.75, 0.2),
    yellow: surf(wornTex(0xd2a224, { rust: 0.3, chips: 0.2 }), 0.75, 0.2),
    olive: surf(wornTex(0x56662f, { rust: 0.35, chips: 0.2 }), 0.8, 0.2),
    teal: surf(wornTex(0x4a7a76, { rust: 0.3, chips: 0.25 }), 0.75, 0.2),
    brass: surf(wornTex(0xa8843a, { rust: 0.15, chips: 0.15 }), 0.45, 0.85),
    steel: surf(wornTex(0xb4b2ac, { rust: 0.22, chips: 0.25, noise: 0.08 }), 0.35, 0.9),
    wood: surf(woodTex(0x7a4426), 0.85, 0),
    woodRed: surf(woodTex(0x6a2c1a), 0.85, 0),
    wrap: surf(wrapTex(0x8a3324), 0.9, 0),
    tape: surf(wrapTex(0xb8a888), 0.9, 0),
    grip: surf(wornTex(0x2a2826, { rust: 0.05, chips: 0.1 }), 0.9, 0),
    rope: surf(wrapTex(0x9a7a4a), 0.95, 0),
    hazard: surf(stripeTex(0xe0b020, 0x1e1c1a, 3), 0.75, 0.2),
    redWhite: surf(stripeTex(0xb02a20, 0xd8cfbe, 3), 0.75, 0.2),
    beigeStripe: surf(stripeTex(0xd8cfbe, 0x3e3934, 3), 0.75, 0.2),
    checker: surf(checkerTex(0xb02a20, 0xd8cfbe), 0.75, 0.2),
    black: new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 1 }),
    redGlow: glow(0xff2a1f, 2.6),
  };
}
type Pal = ReturnType<typeof palette>;

// ─────────────────────────────── part helpers ───────────────────────────────

const chamferCache = new Map<string, THREE.BufferGeometry>();
/** A box with chamfered edges (all twelve), centred. */
function chamferBox(w: number, h: number, d: number, bev: number): THREE.BufferGeometry {
  const b = Math.max(0.002, Math.min(bev, w / 4, h / 4, d / 4));
  const key = `${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${b.toFixed(4)}`;
  const hit = chamferCache.get(key);
  if (hit) return hit;
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + b, -hh);
  s.lineTo(hw - b, -hh);
  s.lineTo(hw, -hh + b);
  s.lineTo(hw, hh - b);
  s.lineTo(hw - b, hh);
  s.lineTo(-hw + b, hh);
  s.lineTo(-hw, hh - b);
  s.lineTo(-hw, -hh + b);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -(d - 2 * b) / 2);
  chamferCache.set(key, geo);
  return geo;
}

/** Chamfered block. */
function cb(g: THREE.Object3D, size: V3, mat: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], bev = 0.014) {
  // screens / emblems need each face mapped 0..1: a plain box for those
  const isDecal = !!(mat as THREE.MeshStandardMaterial).map && !mat.userData.projUV;
  const m = new THREE.Mesh(isDecal ? new THREE.BoxGeometry(...size) : chamferBox(size[0], size[1], size[2], bev), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  g.add(m);
  return m;
}

/** Octagonal cylinder along an axis (flat faces up). */
function oc(g: THREE.Object3D, r: number, len: number, mat: THREE.Material, pos: V3, axis: 'x' | 'y' | 'z' = 'z', seg = 8, r2 = r) {
  const geo = new THREE.CylinderGeometry(r2, r, len, seg);
  geo.rotateY(Math.PI / seg);
  const m = new THREE.Mesh(geo, mat);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(...pos);
  g.add(m);
  return m;
}

/** Ring round an axis (z by default). */
function ring(g: THREE.Object3D, radius: number, thick: number, mat: THREE.Material, pos: V3, axis: 'z' | 'x' = 'z', seg = 8) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 4, seg), mat);
  if (axis === 'x') m.rotation.y = Math.PI / 2;
  m.rotation.z = Math.PI / seg;
  m.position.set(...pos);
  g.add(m);
  return m;
}

function rivet(g: THREE.Object3D, mat: THREE.Material, pos: V3, s = 0.022) {
  cb(g, [s, s, s], mat, pos, [0, 0, 0], s * 0.25);
}

/** Tube along a path. */
function pipe(g: THREE.Object3D, pts: V3[], r: number, mat: THREE.Material, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, r, radial), mat));
}

/** Cone whose tip points along `dir`, base centred at `pos`. */
const UP = new THREE.Vector3(0, 1, 0);
function cone(g: THREE.Object3D, radius: number, len: number, mat: THREE.Material, pos: V3, dir: V3, seg = 4) {
  const geo = new THREE.ConeGeometry(radius, len, seg);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize());
  g.add(m);
  return m;
}

/** Chunky pistol grip, angled back, riveted. */
function grip(g: THREE.Object3D, mat: THREE.Material, p: Pal, y: number, z: number, h = 0.2, w = 0.08, tilt = 0.35) {
  cb(g, [w, h, 0.1], mat, [0, y - h / 2, z - Math.sin(tilt) * h * 0.5], [tilt, 0, 0], 0.016);
  for (const s of [-1, 1]) rivet(g, p.iron, [s * (w / 2 + 0.004), y - h * 0.35, z - Math.sin(tilt) * h * 0.35], 0.018);
}

/** Trigger guard + trigger under a receiver. */
function guard(g: THREE.Object3D, p: Pal, y: number, z: number) {
  cb(g, [0.022, 0.016, 0.12], p.iron, [0, y - 0.07, z + 0.02], [0, 0, 0], 0.005);
  cb(g, [0.022, 0.07, 0.016], p.iron, [0, y - 0.035, z + 0.075], [0, 0, 0], 0.005);
  cb(g, [0.014, 0.05, 0.014], p.ironDark, [0, y - 0.03, z + 0.015], [0.3, 0, 0], 0.004);
}

/** The open loop stock the tech guns share (frame bars with a wrapped back bar). */
function loopStock(g: THREE.Object3D, frame: THREE.Material, wrapMat: THREE.Material, y: number, z: number, len = 0.3, h = 0.18) {
  cb(g, [0.06, 0.05, len], frame, [0, y + h / 2, z - len / 2], [0, 0, 0], 0.012);
  cb(g, [0.06, 0.05, len * 0.85], frame, [0, y - h / 2, z - len * 0.42], [-0.12, 0, 0], 0.012);
  cb(g, [0.065, h + 0.05, 0.06], wrapMat, [0, y, z - len], [0, 0, 0], 0.012);
}

/** Shifted model holder (models are built at x = 0). */
function at(g: THREE.Group, x: number, s = 1): THREE.Group {
  const sub = new THREE.Group();
  sub.position.x = x;
  sub.scale.setScalar(s);
  g.add(sub);
  return sub;
}

function consolidate(g: THREE.Group, name: string): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const n = new THREE.Vector3();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    for (const key of Object.keys(flat.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') flat.deleteAttribute(key);
    }
    const mat = mesh.material as THREE.Material;
    if (mat.userData.projUV || !flat.attributes.uv) {
      // Box-projected UVs from the model's own space: one texel is the same size on every part
      const pos = flat.attributes.position;
      if (!flat.attributes.normal) flat.computeVertexNormals();
      const nor = flat.attributes.normal;
      const uv = new Float32Array(pos.count * 2);
      const k = TEXELS_PER_UNIT / 32;
      for (let i = 0; i < pos.count; i++) {
        n.set(Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i)));
        let u: number;
        let v: number;
        if (n.x >= n.y && n.x >= n.z) {
          u = pos.getZ(i);
          v = pos.getY(i);
        } else if (n.y >= n.z) {
          u = pos.getZ(i);
          v = pos.getX(i);
        } else {
          u = pos.getX(i);
          v = pos.getY(i);
        }
        uv[i * 2] = u * k;
        uv[i * 2 + 1] = v * k;
      }
      flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
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

// ─────────────────────────── industrial western ───────────────────────────

/** Peacemaker: rusted iron revolver, walnut grip, octagonal cylinder, beige stripe, red sight. */
function revolver(g: THREE.Object3D, p: Pal) {
  grip(g, p.wood, p, 0.08, -0.06, 0.22, 0.08);
  cb(g, [0.09, 0.13, 0.22], p.iron, [0, 0.11, 0.03]); // frame
  cb(g, [0.03, 0.06, 0.05], p.ironDark, [0, 0.2, -0.08], [-0.5, 0, 0], 0.008); // hammer
  oc(g, 0.078, 0.15, p.iron, [0, 0.13, 0.08]); // cylinder
  oc(g, 0.06, 0.02, p.ironDark, [0, 0.13, 0.165]);
  cb(g, [0.075, 0.08, 0.42], p.iron, [0, 0.155, 0.37]); // barrel
  cb(g, [0.05, 0.045, 0.3], p.ironDark, [0, 0.095, 0.32]); // under-lug
  for (let i = 0; i < 2; i++) cb(g, [0.078, 0.028, 0.032], p.white, [0, 0.17, 0.3 + i * 0.06], [0.6, 0, 0], 0.004); // beige slashes
  cb(g, [0.02, 0.03, 0.04], p.redGlow, [0, 0.21, 0.55], [0, 0, 0], 0.004); // front sight
  cb(g, [0.036, 0.036, 0.01], p.black, [0, 0.155, 0.581], [0, 0, 0], 0.003); // bore
  guard(g, p, 0.1, 0.02);
  for (const s of [-1, 1]) rivet(g, p.ironDark, [s * 0.047, 0.12, -0.04], 0.016);
}

function buildPistol(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  revolver(at(g, 0.44), p);
  return consolidate(g, 'weapon_pistol');
}

function buildPistols(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  revolver(at(g, 0.48, 0.82), p);
  revolver(at(g, -0.48, 0.82), p);
  return consolidate(g, 'weapon_pistols');
}

/** Scattergun: pump shotgun, rusted shroud with vent slashes, ribbed pump, hazard butt plate. */
function buildShotgun(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.34);
  cb(s, [0.09, 0.15, 0.34], p.rust, [0, 0.05, -0.27], [0.12, 0, 0]); // stock
  cb(s, [0.095, 0.17, 0.05], p.hazard, [0, 0.03, -0.45], [0.12, 0, 0]); // butt plate
  grip(s, p.wood, p, 0.08, 0.0, 0.17);
  cb(s, [0.11, 0.14, 0.3], p.iron, [0, 0.13, 0.06]); // receiver
  cb(s, [0.115, 0.12, 0.46], p.orange, [0, 0.17, 0.44]); // shroud
  for (let i = 0; i < 3; i++) cb(s, [0.118, 0.025, 0.05], p.black, [0, 0.2, 0.42 + i * 0.06], [0.5, 0, 0], 0.004);
  oc(s, 0.05, 0.04, p.ironDark, [0, 0.17, 0.69]);
  oc(s, 0.032, 0.01, p.black, [0, 0.17, 0.712]);
  oc(s, 0.035, 0.42, p.ironDark, [0, 0.075, 0.44]); // magazine tube
  cb(s, [0.1, 0.08, 0.2], p.rust, [0, 0.07, 0.42]); // pump
  for (let i = 0; i < 6; i++) cb(s, [0.105, 0.086, 0.012], p.ironDark, [0, 0.07, 0.34 + i * 0.03], [0, 0, 0], 0.003);
  guard(s, p, 0.1, 0.04);
  for (const z of [-0.02, 0.15]) for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.057, 0.17, z], 0.016);
  return consolidate(g, 'weapon_shotgun');
}

/**
 * Coice: a classic side-by-side double barrel — walnut stock with a red recoil pad, a
 * case-hardened action with the hinge pin and the top lever, two long barrels joined by a rib
 * with a brass bead at the end, a wooden forend under them, twin triggers.
 */
function buildCoice(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.36);
  // stock: wrist dropping into the butt, recoil pad at the end
  cb(s, [0.075, 0.09, 0.16], p.wood, [0, 0.105, -0.08], [0.18, 0, 0], 0.02); // wrist
  cb(s, [0.085, 0.16, 0.2], p.wood, [0, 0.07, -0.24], [0.12, 0, 0], 0.025); // butt
  cb(s, [0.09, 0.17, 0.03], p.red, [0, 0.055, -0.35], [0.12, 0, 0], 0.01); // recoil pad
  // the action: steel box, hinge pin, top lever, twin hammers' spurs
  cb(s, [0.11, 0.1, 0.16], p.steel, [0, 0.14, 0.06], [0, 0, 0], 0.016);
  oc(s, 0.022, 0.12, p.ironDark, [0, 0.1, 0.14], 'x', 8); // hinge pin
  cb(s, [0.03, 0.018, 0.08], p.ironDark, [0.02, 0.2, 0.02], [0, -0.35, 0], 0.005); // top lever
  for (const sx of [-1, 1]) cb(s, [0.018, 0.05, 0.04], p.ironDark, [sx * 0.03, 0.2, -0.02], [-0.6, 0, 0], 0.005); // hammers
  // the barrels, side by side, with the rib and the bead
  for (const sx of [-1, 1]) {
    oc(s, 0.034, 0.6, p.iron, [sx * 0.036, 0.165, 0.44], 'z', 10);
    oc(s, 0.022, 0.012, p.black, [sx * 0.036, 0.165, 0.741], 'z', 10); // bores
    ring(s, 0.037, 0.012, p.steel, [sx * 0.036, 0.165, 0.72]);
  }
  cb(s, [0.022, 0.012, 0.6], p.ironDark, [0, 0.206, 0.44], [0, 0, 0], 0.004); // rib
  cb(s, [0.014, 0.014, 0.014], p.brass, [0, 0.218, 0.73], [0, 0, 0], 0.003); // bead
  // forend under the barrels
  cb(s, [0.1, 0.05, 0.2], p.woodRed, [0, 0.12, 0.28], [0, 0, 0], 0.018);
  // twin triggers in the guard
  guard(s, p, 0.1, 0.0);
  cb(s, [0.012, 0.045, 0.012], p.ironDark, [0, 0.075, 0.045], [0.3, 0, 0], 0.003);
  for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.057, 0.14, 0.06], 0.016);
  return consolidate(g, 'weapon_coice');
}

/** Starburst: blocky orange launcher, flared octagonal muzzle with a checker ring, yellow canister. */
function buildRocket(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.32);
  cb(s, [0.2, 0.2, 0.84], p.orange, [0, 0.2, 0.12], [0, 0, 0], 0.03); // tube
  cb(s, [0.205, 0.05, 0.22], p.beigeStripe, [0, 0.29, -0.02], [0, 0, 0], 0.01); // stripes on top
  cb(s, [0.23, 0.23, 0.07], p.ironDark, [0, 0.2, -0.31], [0, 0, 0], 0.02); // back cap
  oc(s, 0.15, 0.2, p.ironDark, [0, 0.2, 0.62], 'z', 8, 0.12); // flared muzzle
  oc(s, 0.155, 0.04, p.checker, [0, 0.2, 0.55]);
  oc(s, 0.115, 0.01, p.black, [0, 0.2, 0.722]);
  // carry handle
  cb(s, [0.03, 0.025, 0.3], p.iron, [0, 0.355, 0.1], [0, 0, 0], 0.006);
  for (const z of [-0.03, 0.23]) cb(s, [0.03, 0.06, 0.03], p.iron, [0, 0.325, z], [0, 0, 0], 0.006);
  // X panel on the side
  cb(s, [0.012, 0.09, 0.09], p.iron, [0.105, 0.15, -0.12], [0, 0, 0], 0.004);
  for (const r of [Math.PI / 4, -Math.PI / 4]) cb(s, [0.014, 0.1, 0.012], p.ironDark, [0.108, 0.15, -0.12], [r, 0, 0], 0.003);
  // the yellow canister slung under
  oc(s, 0.055, 0.22, p.yellow, [0, 0.05, 0.14]);
  for (const z of [0.06, 0.22]) oc(s, 0.058, 0.03, p.hazard, [0, 0.05, z]);
  for (const z of [0.02, 0.26]) oc(s, 0.045, 0.02, p.ironDark, [0, 0.05, z]);
  grip(s, p.wood, p, 0.1, -0.12, 0.17);
  guard(s, p, 0.12, -0.1);
  for (const z of [-0.2, 0.0, 0.3]) for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.102, 0.12, z], 0.018);
  return consolidate(g, 'weapon_rocket');
}

/** Pregadeira: yellow power tool, hazard band, black nose and magazine, yellow-capped grip. */
function buildNailgun(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.13, 0.18, 0.34], p.yellow, [0, 0.17, 0.05]); // body
  cb(s, [0.132, 0.04, 0.2], p.hazard, [0, 0.1, 0.12]);
  for (let i = 0; i < 3; i++) cb(s, [0.134, 0.012, 0.08], p.black, [0, 0.2 + i * 0.025, -0.01], [0, 0, 0], 0.003);
  cb(s, [0.135, 0.19, 0.04], p.ironDark, [0, 0.17, -0.13]); // back plate
  cb(s, [0.1, 0.1, 0.1], p.ironDark, [0, 0.18, 0.27]); // nose
  cb(s, [0.06, 0.06, 0.08], p.iron, [0, 0.18, 0.35]);
  cb(s, [0.03, 0.03, 0.01], p.black, [0, 0.18, 0.391], [0, 0, 0], 0.003);
  cb(s, [0.09, 0.2, 0.08], p.ironDark, [0, -0.02, 0.16]); // magazine
  for (let i = 0; i < 4; i++) cb(s, [0.094, 0.012, 0.084], p.iron, [0, -0.08 + i * 0.04, 0.16], [0, 0, 0], 0.003);
  grip(s, p.grip, p, 0.08, -0.04, 0.2, 0.08, 0.2);
  cb(s, [0.09, 0.05, 0.11], p.yellow, [0, -0.13, -0.065], [0.2, 0, 0]); // yellow butt
  guard(s, p, 0.1, -0.02);
  for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.068, 0.24, -0.13], 0.018);
  return consolidate(g, 'weapon_nailgun');
}

// ─────────────────────────── Data Tree tech ───────────────────────────

/** Lança-CD (two hands): beige drive body, a rainbow disc loaded on top, >>> arrows, green LED. */
function buildDisco(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.2, 0.12, 0.52], p.white, [0, 0.13, 0.15], [0, 0, 0], 0.02); // body
  cb(s, [0.2, 0.03, 0.42], p.hazard, [0, 0.06, 0.16], [0, 0, 0], 0.006);
  cb(s, [0.22, 0.035, 0.42], p.ironDark, [0, 0.205, 0.17], [0, 0, 0], 0.01); // tray
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 24), decal(discTex(), 0.9));
  disc.position.set(0, 0.228, 0.18);
  s.add(disc);
  oc(s, 0.04, 0.016, p.ironDark, [0, 0.232, 0.18], 'y');
  for (const [x, z] of [[-0.1, 0.02], [0.1, 0.02], [-0.1, 0.34], [0.1, 0.34]]) cb(s, [0.04, 0.03, 0.04], p.brass, [x, 0.23, z], [0, 0, 0], 0.006);
  cb(s, [0.204, 0.05, 0.12], decal(arrowsTex()), [0, 0.15, -0.02], [0, 0, 0], 0.004); // >>> on the side
  cb(s, [0.16, 0.03, 0.01], p.black, [0, 0.1, 0.413], [0, 0, 0], 0.003); // disc slot
  cb(s, [0.03, 0.012, 0.012], glow(0x6cff5a, 2.4), [0.05, 0.13, 0.414], [0, 0, 0], 0.003);
  grip(s, p.wrap, p, 0.08, -0.02, 0.17);
  cb(s, [0.07, 0.15, 0.08], p.wrap, [0, -0.01, 0.3], [0.1, 0, 0]); // front grip
  loopStock(s, p.ironDark, p.wrap, 0.12, -0.12);
  for (const z of [0.0, 0.3]) for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.102, 0.17, z], 0.016);
  return consolidate(g, 'weapon_disco');
}

/** Canhão de Faces: a CRT on the front showing a screaming green face, cables, checker panel. */
function buildFaces(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.38);
  cb(s, [0.26, 0.24, 0.24], p.white, [0, 0.2, 0.5], [0, 0, 0], 0.025); // monitor
  cb(s, [0.2, 0.17, 0.012], decal(skullScreenTex(), 1.2), [0, 0.215, 0.622], [0, 0, 0], 0.003); // screen
  for (let i = 0; i < 3; i++) cb(s, [0.03, 0.02, 0.01], p.black, [-0.08 + i * 0.04, 0.105, 0.622], [0, 0, 0], 0.003);
  cb(s, [0.03, 0.02, 0.01], p.redGlow, [0.08, 0.105, 0.622], [0, 0, 0], 0.003);
  cb(s, [0.262, 0.1, 0.03], p.hazard, [0, 0.22, 0.4], [0, 0, 0], 0.006);
  cb(s, [0.18, 0.15, 0.3], p.white, [0, 0.17, 0.2]); // body
  for (let i = 0; i < 3; i++) cb(s, [0.184, 0.012, 0.08], p.black, [0, 0.21 + i * 0.022, 0.24], [0, 0, 0], 0.003);
  cb(s, [0.184, 0.05, 0.12], p.checker, [0, 0.12, 0.16], [0, 0, 0], 0.006);
  // cables from the monitor's top back over the body
  pipe(s, [[0.05, 0.31, 0.45], [0.06, 0.36, 0.3], [0.05, 0.26, 0.12]], 0.018, p.red);
  pipe(s, [[-0.04, 0.31, 0.44], [-0.06, 0.34, 0.28], [-0.05, 0.25, 0.1]], 0.015, surf(wornTex(0x4a2a5a, { rust: 0.1 })));
  grip(s, p.ironDark, p, 0.1, 0.06, 0.17);
  loopStock(s, p.ironDark, p.wrap, 0.16, 0.04, 0.32, 0.2);
  for (const z of [0.42, 0.58]) for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.132, 0.3, z], 0.016);
  return consolidate(g, 'weapon_faces');
}

/** fork(): olive body with a process-tree screen, a ring drum of glowing green bomblets up front. */
function buildForkbomb(): THREE.Group {
  const p = palette();
  const green = glow(0x5aff4a, 2.4);
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.16, 0.18, 0.32], p.olive, [0, 0.16, 0.0]); // body
  cb(s, [0.164, 0.1, 0.12], decal(treeScreenTex(), 1.1), [0, 0.18, -0.03], [0, 0, 0], 0.005);
  cb(s, [0.164, 0.03, 0.1], p.hazard, [0, 0.255, 0.1], [0, 0, 0], 0.006);
  for (const z of [0.06, 0.1]) cb(s, [0.166, 0.025, 0.025], p.redGlow, [0, 0.085, z], [0, 0, 0], 0.003);
  // the drum: a ring of rusted blocks round a dark hub, bomblets glowing between
  const cz = 0.34;
  const cy = 0.17;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = cb(s, [0.075, 0.07, 0.11], i % 2 ? p.iron : p.white, [Math.cos(a) * 0.18, cy + Math.sin(a) * 0.18, cz], [0, 0, 0], 0.012);
    m.rotation.z = a;
  }
  oc(s, 0.11, 0.1, p.ironDark, [0, cy, cz], 'z', 10);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), green);
    b.position.set(Math.cos(a) * 0.14, cy + Math.sin(a) * 0.14, cz + 0.05);
    s.add(b);
  }
  grip(s, p.ironDark, p, 0.08, -0.02, 0.17);
  loopStock(s, p.ironDark, p.wrap, 0.15, -0.16);
  for (const z of [-0.12, 0.12]) for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.082, 0.22, z], 0.016);
  return consolidate(g, 'weapon_forkbomb');
}

/** Juiz: white-painted hand cannon, red sheriff's star on the grip, red lights in the drum. */
function buildJuiz(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.42);
  grip(s, p.white, p, 0.08, -0.06, 0.23, 0.09);
  cb(s, [0.094, 0.09, 0.07], decal(starTex(), 0.8), [0, -0.0, -0.1], [0.35, 0, 0], 0.004); // star
  cb(s, [0.1, 0.14, 0.22], p.white, [0, 0.12, 0.03]); // frame
  cb(s, [0.03, 0.07, 0.05], p.ironDark, [0, 0.22, -0.08], [-0.5, 0, 0], 0.008); // hammer
  cb(s, [0.13, 0.15, 0.17], p.white, [0, 0.14, 0.09], [0, 0, 0], 0.035); // drum
  for (const dy of [-0.045, 0, 0.045]) cb(s, [0.134, 0.022, 0.055], p.redGlow, [0, 0.14 + dy, 0.09], [0, 0, 0], 0.004);
  cb(s, [0.092, 0.1, 0.42], p.white, [0, 0.165, 0.38]); // barrel
  for (let i = 0; i < 3; i++) cb(s, [0.094, 0.03, 0.03], p.red, [0, 0.19, 0.24 + i * 0.05], [0.6, 0, 0], 0.004);
  cb(s, [0.03, 0.04, 0.12], p.white, [0, 0.235, 0.52], [0, 0, 0], 0.006); // sight block
  for (let i = 0; i < 3; i++) cb(s, [0.094, 0.02, 0.03], p.redGlow, [0, 0.135, 0.46 + i * 0.05], [0, 0, 0], 0.003);
  cb(s, [0.06, 0.06, 0.3], p.ironDark, [0, 0.1, 0.33]); // under-lug
  cb(s, [0.04, 0.04, 0.01], p.black, [0, 0.165, 0.591], [0, 0, 0], 0.003);
  guard(s, p, 0.1, 0.02);
  return consolidate(g, 'weapon_juiz');
}

/** Sunfire: orange body with a pixel sun, a caged tube of plasma, cyan cell bars, loop stock. */
function buildPlasma(): THREE.Group {
  const p = palette();
  const cyan = glow(0x3ae8ff, 2.4);
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.18, 0.2, 0.24], p.orange, [0, 0.17, -0.06], [0, 0, 0], 0.025); // body
  cb(s, [0.184, 0.12, 0.12], decal(sunTex(), 0.9), [0, 0.17, -0.07], [0, 0, 0], 0.005);
  cb(s, [0.182, 0.03, 0.22], p.hazard, [0, 0.275, -0.06], [0, 0, 0], 0.006);
  // the plasma: a glowing core inside a violet tube, caged in orange rings
  oc(s, 0.07, 0.46, glow(0x9a6cff, 2.0), [0, 0.18, 0.3], 'z', 12);
  oc(s, 0.035, 0.47, glow(0xff8ad8, 2.8), [0, 0.18, 0.3], 'z', 8);
  for (const z of [0.12, 0.3, 0.48]) {
    ring(s, 0.1, 0.028, p.orange, [0, 0.18, z]);
    ring(s, 0.078, 0.008, cyan, [0, 0.18, z]);
  }
  cb(s, [0.05, 0.03, 0.62], p.ironDark, [0, 0.3, 0.26], [0, 0, 0], 0.008); // top rail
  cb(s, [0.05, 0.03, 0.62], p.ironDark, [0, 0.06, 0.26], [0, 0, 0], 0.008);
  cb(s, [0.2, 0.22, 0.07], p.orange, [0, 0.18, 0.58], [0, 0, 0], 0.02); // front frame
  cb(s, [0.1, 0.1, 0.01], p.black, [0, 0.18, 0.616], [0, 0, 0], 0.003);
  cb(s, [0.14, 0.1, 0.16], p.ironDark, [0, 0.01, 0.2]); // cell
  for (let i = 0; i < 3; i++) cb(s, [0.144, 0.05, 0.016], cyan, [0, 0.01, 0.15 + i * 0.045], [0, 0, 0], 0.003);
  grip(s, p.wrap, p, 0.08, -0.06, 0.17);
  loopStock(s, p.orange, p.wrap, 0.16, -0.18, 0.28);
  for (const z of [-0.14, 0.02]) for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.092, 0.24, z], 0.016);
  return consolidate(g, 'weapon_plasma');
}

/** Volt: white body, battery drum with a lightning bolt, two long prongs lit green inside. */
function buildRailgun(): THREE.Group {
  const p = palette();
  const green = glow(0x7aff2a, 2.6);
  const g = new THREE.Group();
  const s = at(g, 0.34);
  cb(s, [0.16, 0.18, 0.3], p.white, [0, 0.15, -0.05]); // body
  cb(s, [0.164, 0.05, 0.12], p.checker, [0, 0.1, -0.1], [0, 0, 0], 0.006);
  for (let i = 0; i < 3; i++) cb(s, [0.164, 0.012, 0.06], p.black, [0, 0.19 + i * 0.022, 0.03], [0, 0, 0], 0.003);
  oc(s, 0.1, 0.16, p.ironDark, [0, 0.15, 0.17]); // battery drum
  for (const z of [0.1, 0.24]) oc(s, 0.104, 0.025, p.brass, [0, 0.15, z]);
  for (const sx of [-1, 1]) cb(s, [0.01, 0.09, 0.09], decal(boltTex(), 0.9), [sx * 0.1, 0.15, 0.17], [0, 0, 0], 0.002);
  // the prongs
  for (const y of [0.255, 0.045]) {
    cb(s, [0.12, 0.05, 0.62], p.white, [0, y, 0.56]);
    cb(s, [0.122, 0.052, 0.12], p.hazard, [0, y, 0.74], [0, 0, 0], 0.01);
    cb(s, [0.07, 0.016, 0.56], green, [0, y + (y > 0.15 ? -0.03 : 0.03), 0.57], [0, 0, 0], 0.004);
  }
  cb(s, [0.012, 0.15, 0.5], glow(0x9dff4a, 0.9), [0, 0.15, 0.58], [0, 0, 0], 0.003); // the current
  grip(s, p.wrap, p, 0.07, -0.04, 0.17);
  loopStock(s, p.ironDark, p.wrap, 0.14, -0.2);
  for (const z of [-0.15, 0.05]) for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.082, 0.21, z], 0.016);
  return consolidate(g, 'weapon_railgun');
}

// ─────────────────────────── melee & tools ───────────────────────────

/** Katana: red diamond-wrapped hilt, square dark tsuba with brass, curved worn blade. */
function buildKatana(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  cb(g, [0.06, 0.08, 0.4], p.wrap, [0, 0, -0.04], [0, 0, 0], 0.012); // hilt
  for (let i = 0; i < 4; i++) cb(g, [0.064, 0.045, 0.045], p.ironDark, [0, 0, -0.18 + i * 0.09], [Math.PI / 4, 0, 0], 0.005);
  cb(g, [0.07, 0.09, 0.04], p.brass, [0, 0, -0.26], [0, 0, 0], 0.01); // pommel
  cb(g, [0.15, 0.15, 0.03], p.ironDark, [0, 0, 0.18], [0, 0, 0], 0.02); // tsuba
  cb(g, [0.16, 0.035, 0.034], p.brass, [0, 0.07, 0.18], [0, 0, 0], 0.006);
  cb(g, [0.05, 0.09, 0.05], p.brass, [0, 0, 0.22], [0, 0, 0], 0.008); // habaki
  let y = 0;
  let z = 0.22;
  let a = 0;
  for (let i = 0; i < 6; i++) {
    const segLen = 0.2;
    const cz = z + Math.cos(a) * segLen * 0.5;
    const cy = y + Math.sin(a) * segLen * 0.5;
    cb(g, [0.024, 0.07, segLen + 0.012], p.steel, [0, cy, cz], [-a, 0, 0], 0.006);
    z += Math.cos(a) * segLen;
    y += Math.sin(a) * segLen;
    a += 0.035;
  }
  cone(g, 0.045, 0.14, p.steel, [0, y, z], [0, Math.sin(a), Math.cos(a)], 3);
  return consolidate(g, 'weapon_katana');
}

/** Marreta: octagonal iron head with red-painted faces and banded ends, taped wooden handle. */
function buildHammer(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  oc(g, 0.042, 1.2, p.wood, [0, 0, 0.42]); // handle
  for (let i = 0; i < 4; i++) oc(g, 0.05, 0.06, p.tape, [0, 0, -0.14 + i * 0.075]); // tape
  cb(g, [0.1, 0.1, 0.06], p.ironDark, [0, 0, -0.22], [0, 0, 0], 0.015); // butt
  oc(g, 0.15, 0.36, p.iron, [0, 0, 1.02], 'x'); // head
  for (const sx of [-1, 1]) {
    oc(g, 0.155, 0.1, p.red, [sx * 0.21, 0, 1.02], 'x');
    oc(g, 0.165, 0.03, p.ironDark, [sx * 0.155, 0, 1.02], 'x');
    oc(g, 0.13, 0.02, p.iron, [sx * 0.27, 0, 1.02], 'x');
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    rivet(g, p.ironDark, [0.08, Math.cos(a) * 0.15, 1.02 + Math.sin(a) * 0.15], 0.024);
    rivet(g, p.ironDark, [-0.08, Math.cos(a) * 0.15, 1.02 + Math.sin(a) * 0.15], 0.024);
  }
  cb(g, [0.12, 0.34, 0.12], p.ironDark, [0, 0, 1.02], [0, 0, 0], 0.02); // collar
  return consolidate(g, 'weapon_hammer');
}

/** Arpão: teal speargun with a hazard patch, rope reel, wrapped grip, barbed iron head. */
function buildHarpoon(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.34);
  cb(s, [0.1, 0.11, 0.46], p.teal, [0, 0.12, 0.18]); // body
  cb(s, [0.104, 0.05, 0.1], p.hazard, [0, 0.13, 0.27], [0, 0, 0], 0.006);
  cb(s, [0.04, 0.04, 0.06], p.ironDark, [0, 0.19, 0.0], [0, 0, 0], 0.008); // rear sight
  cb(s, [0.06, 0.07, 0.07], p.iron, [0, 0.14, 0.43], [0, 0, 0], 0.01); // muzzle block
  grip(s, p.wrap, p, 0.08, -0.04, 0.18);
  guard(s, p, 0.08, 0.0);
  // reel of rope under the barrel
  oc(s, 0.085, 0.09, p.ironDark, [0, 0.03, 0.14], 'x', 10);
  oc(s, 0.07, 0.095, p.rope, [0, 0.03, 0.14], 'x', 10);
  pipe(s, [[0, 0.1, 0.14], [0, 0.22, 0.4], [0, 0.2, 0.9]], 0.008, p.rope, 4); // line up to the spear
  // the spear
  oc(s, 0.016, 0.72, p.rust, [0, 0.17, 0.72], 'z', 6);
  cone(s, 0.05, 0.16, p.iron, [0, 0.17, 1.07], [0, 0, 1], 4);
  cone(s, 0.022, 0.07, p.iron, [0, 0.17, 1.08], [0, -1, -1.4], 4);
  cone(s, 0.022, 0.07, p.iron, [0, 0.17, 1.08], [0, 1, -1.4], 4);
  for (const z of [0.05, 0.32]) for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.052, 0.15, z], 0.016);
  return consolidate(g, 'weapon_harpoon');
}

/** rm -rf /: a boxy white-and-rust unit with black fins, a red glowing screen on the front, a red hose. */
function buildRmrf(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.24, 0.22, 0.34], p.white, [0, 0.17, 0.1], [0, 0, 0], 0.025); // body
  for (let i = 0; i < 3; i++) cb(s, [0.05, 0.07, 0.24], p.ironDark, [-0.07 + i * 0.07, 0.31, 0.08], [0, 0, 0], 0.012); // fins
  cb(s, [0.244, 0.04, 0.2], p.hazard, [0, 0.09, 0.1], [0, 0, 0], 0.006);
  for (let i = 0; i < 3; i++) cb(s, [0.244, 0.012, 0.08], p.black, [0, 0.2 + i * 0.025, -0.02], [0, 0, 0], 0.003); // vents
  cb(s, [0.27, 0.25, 0.07], p.ironDark, [0, 0.17, 0.3], [0, 0, 0], 0.02); // front frame
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.17), new THREE.MeshBasicMaterial({ map: redScreenTex(), toneMapped: false }));
  screen.position.set(0, 0.17, 0.337);
  s.add(screen);
  pipe(s, [[0.1, 0.06, -0.05], [0.16, -0.02, 0.05], [0.14, 0.04, 0.22], [0.12, 0.12, 0.26]], 0.022, p.red);
  grip(s, p.grip, p, 0.07, 0.02, 0.17);
  guard(s, p, 0.08, 0.02);
  for (const z of [-0.04, 0.2]) for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.122, 0.24, z], 0.018);
  return consolidate(g, 'weapon_rmrf');
}

/** Dinamite: five red sticks strapped with iron, a frayed rope fuse with a glowing tip. */
function buildDinamite(): THREE.Group {
  const p = palette();
  const stick = surf(wornTex(0xb02a1e, { rust: 0.08, chips: 0.2 }), 0.7, 0);
  const g = new THREE.Group();
  const s = at(g, 0.36);
  const sticks: [number, number][] = [[-0.09, 0.06], [0, 0.06], [0.09, 0.06], [-0.045, 0.14], [0.045, 0.14]];
  for (const [x, y] of sticks) {
    oc(s, 0.046, 0.34, stick, [x, y, 0.12]);
    oc(s, 0.036, 0.01, p.red, [x, y, 0.295]);
  }
  for (const z of [0.03, 0.21]) {
    cb(s, [0.26, 0.018, 0.04], p.ironDark, [0, 0.19, z], [0, 0, 0], 0.005);
    cb(s, [0.26, 0.018, 0.04], p.ironDark, [0, 0.01, z], [0, 0, 0], 0.005);
    for (const sx of [-1, 1]) cb(s, [0.018, 0.19, 0.04], p.ironDark, [sx * 0.138, 0.1, z], [0, 0, 0], 0.005);
    rivet(s, p.iron, [0.14, 0.1, z], 0.02);
  }
  pipe(s, [[0, 0.17, 0.29], [0.02, 0.26, 0.34], [0.06, 0.32, 0.3], [0.08, 0.34, 0.24]], 0.011, p.rope, 4);
  const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.024, 0), glow(0xffd23a, 3));
  tip.position.set(0.08, 0.34, 0.24);
  s.add(tip);
  return consolidate(g, 'weapon_dinamite');
}

/** Maçarico: orange torch body with a loop handle and hazard foot, white tank, bent nozzle, pilot flame. */
function buildMacarico(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.12, 0.2, 0.18], p.orange, [0, 0.16, 0.02], [0, 0, 0], 0.02); // body
  cb(s, [0.124, 0.05, 0.182], p.hazard, [0, 0.08, 0.02], [0, 0, 0], 0.006);
  cb(s, [0.07, 0.05, 0.22], p.orange, [0, 0.31, -0.07], [0, 0, 0], 0.012); // loop handle
  cb(s, [0.07, 0.2, 0.05], p.orange, [0, 0.22, -0.17], [0, 0, 0], 0.012);
  cb(s, [0.075, 0.12, 0.06], p.grip, [0, 0.22, -0.17], [0, 0, 0], 0.01);
  oc(s, 0.075, 0.24, p.white, [0.0, 0.12, 0.17], 'y'); // tank
  for (const y of [0.04, 0.2]) oc(s, 0.078, 0.025, p.ironDark, [0, y, 0.17], 'y');
  oc(s, 0.03, 0.05, p.brass, [0, 0.26, 0.17], 'y'); // valve
  cb(s, [0.04, 0.04, 0.04], p.ironDark, [0, 0.27, 0.06], [0, 0, 0], 0.008);
  pipe(s, [[0, 0.27, 0.06], [0, 0.33, 0.14], [0, 0.35, 0.3], [0, 0.35, 0.44]], 0.032, p.ironDark, 8); // nozzle
  oc(s, 0.045, 0.08, p.iron, [0, 0.35, 0.48]);
  oc(s, 0.03, 0.01, p.black, [0, 0.35, 0.521]);
  cone(s, 0.03, 0.12, glow(0xff8a1a, 2.6), [0, 0.35, 0.53], [0, 0, 1], 6); // pilot flame
  for (const sx of [-1, 1]) rivet(s, p.ironDark, [sx * 0.062, 0.22, 0.08], 0.018);
  return consolidate(g, 'weapon_macarico');
}

/** Corrente.exe: dark body venting purple, a glowing coil, a white claw arcing purple lightning. */
function buildCorrente(): THREE.Group {
  const p = palette();
  const purple = glow(0xb04aff, 2.6);
  const g = new THREE.Group();
  const s = at(g, 0.36);
  cb(s, [0.14, 0.16, 0.24], p.ironDark, [0, 0.15, -0.05]); // body
  cb(s, [0.144, 0.05, 0.1], purple, [0, 0.15, -0.07], [0, 0, 0], 0.005);
  for (let i = 0; i < 3; i++) cb(s, [0.03, 0.05, 0.16], p.ironDark, [-0.04 + i * 0.04, 0.25, -0.05], [0, 0, 0], 0.008);
  cb(s, [0.11, 0.11, 0.04], p.white, [0, 0.15, 0.09], [0, 0, 0], 0.012);
  oc(s, 0.055, 0.2, purple, [0, 0.15, 0.2], 'z', 10); // coil core
  for (let i = 0; i < 4; i++) ring(s, 0.065, 0.016, p.brass, [0, 0.15, 0.13 + i * 0.045]);
  cb(s, [0.18, 0.2, 0.08], p.white, [0, 0.15, 0.33], [0, 0, 0], 0.02); // claw housing
  cb(s, [0.08, 0.05, 0.18], p.white, [0, 0.235, 0.43], [-0.25, 0, 0], 0.012); // claws
  cb(s, [0.08, 0.05, 0.18], p.white, [0, 0.065, 0.43], [0.25, 0, 0], 0.012);
  cb(s, [0.08, 0.05, 0.06], p.ironDark, [0, 0.215, 0.52], [0.5, 0, 0], 0.01);
  cb(s, [0.08, 0.05, 0.06], p.ironDark, [0, 0.085, 0.52], [-0.5, 0, 0], 0.01);
  // the arc between the claws
  cb(s, [0.012, 0.05, 0.012], purple, [0, 0.18, 0.5], [0, 0, 0.5], 0.003);
  cb(s, [0.012, 0.05, 0.012], purple, [0, 0.14, 0.505], [0, 0, -0.5], 0.003);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), purple);
  orb.position.set(0, 0.15, 0.48);
  s.add(orb);
  pipe(s, [[0.05, 0.08, -0.12], [0.08, 0.0, 0.0], [0.07, 0.07, 0.12]], 0.016, p.red);
  grip(s, p.ironDark, p, 0.08, -0.04, 0.17);
  guard(s, p, 0.09, -0.04);
  for (const z of [0.31, 0.36]) for (const sx of [-1, 1]) rivet(s, p.iron, [sx * 0.092, 0.22, z], 0.016);
  // where the arc leaves the gun (between the claws), kept as a marker for the beam
  g.updateMatrixWorld(true);
  const tip = s.localToWorld(new THREE.Vector3(0, 0.15, 0.5));
  const out = consolidate(g, 'weapon_corrente');
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.copy(tip);
  out.add(muzzle);
  return out;
}

/** Besta: wooden stock, iron tiller with a crank, wide steel limbs across the front, a loaded bolt. */
function buildBesta(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.34);
  cb(s, [0.09, 0.09, 0.52], p.wood, [0, 0.12, 0.12]); // tiller
  cb(s, [0.1, 0.05, 0.2], p.iron, [0, 0.17, 0.04], [0, 0, 0], 0.01); // latch block
  cb(s, [0.08, 0.12, 0.22], p.woodRed, [0, 0.07, -0.2], [0.18, 0, 0], 0.02); // butt
  grip(s, p.wrap, p, 0.06, -0.02, 0.17);
  guard(s, p, 0.06, 0.02);
  // crank on the side
  oc(s, 0.04, 0.03, p.ironDark, [0.065, 0.12, -0.02], 'x', 8);
  cb(s, [0.02, 0.09, 0.02], p.iron, [0.085, 0.08, -0.02], [0, 0, 0], 0.004);
  // front stirrup + limbs (swept forward a touch)
  cb(s, [0.1, 0.08, 0.06], p.iron, [0, 0.14, 0.4], [0, 0, 0], 0.012);
  for (const sx of [-1, 1]) {
    cb(s, [0.34, 0.035, 0.05], p.steel, [sx * 0.2, 0.15, 0.41], [0, sx * -0.22, 0], 0.008);
    cb(s, [0.04, 0.05, 0.05], p.ironDark, [sx * 0.36, 0.15, 0.37], [0, 0, 0], 0.008); // limb tips
    pipe(s, [[sx * 0.36, 0.15, 0.37], [sx * 0.18, 0.165, 0.2], [0, 0.17, 0.06]], 0.006, p.rope, 3); // string
  }
  // the bolt, ready
  oc(s, 0.012, 0.5, p.wood, [0, 0.185, 0.3], 'z', 6);
  cone(s, 0.03, 0.08, p.iron, [0, 0.185, 0.58], [0, 0, 1], 4);
  cb(s, [0.004, 0.04, 0.06], p.red, [0, 0.205, 0.08], [0, 0, 0], 0.002); // fletching
  for (const z of [0.0, 0.26]) for (const sx of [-1, 1]) rivet(s, p.brass, [sx * 0.047, 0.14, z], 0.014);
  return consolidate(g, 'weapon_besta');
}

/** Arco: a hunting recurve held upright, wrapped grip, the string drawn back to a nocked arrow. */
function buildArco(): THREE.Group {
  const p = palette();
  const g = new THREE.Group();
  const s = at(g, 0.3);
  const gy = 0.12;
  const gz = 0.26;
  cb(s, [0.05, 0.16, 0.06], p.wrap, [0, gy, gz], [0, 0, 0], 0.012); // grip
  // limbs: one continuous recurve, bending back toward the archer and flicking forward at the tips
  const limbPts: [number, number, number][] = [];
  for (let i = -6; i <= 6; i++) {
    const u = i / 6; // -1 (bottom tip) .. 1 (top tip)
    const au = Math.abs(u);
    const bend = -0.16 * au * au + (au > 0.82 ? (au - 0.82) * 0.9 : 0); // back, then the recurve
    limbPts.push([0, gy + u * 0.46, gz + bend]);
  }
  pipe(s, limbPts, 0.03, p.wood, 6);
  for (const sy of [-1, 1]) {
    const tip = limbPts[sy > 0 ? limbPts.length - 1 : 0];
    cb(s, [0.04, 0.03, 0.04], p.brass, tip, [0, 0, 0], 0.006); // nock caps
    pipe(s, [tip, [0, gy + sy * 0.2, 0.0], [0, gy, -0.08]], 0.009, p.rope, 3); // string to the draw
  }
  // nocked arrow
  oc(s, 0.011, 0.62, p.wood, [0, gy, 0.2], 'z', 6);
  cone(s, 0.026, 0.07, p.steel, [0, gy, 0.53], [0, 0, 1], 4);
  cb(s, [0.004, 0.05, 0.07], p.white, [0, gy + 0.02, -0.07], [0, 0, 0], 0.002);
  cb(s, [0.004, 0.05, 0.07], p.red, [0, gy - 0.02, -0.07], [0, 0, 0], 0.002);
  return consolidate(g, 'weapon_arco');
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
    besta: buildBesta(),
    arco: buildArco(),
  };
}
