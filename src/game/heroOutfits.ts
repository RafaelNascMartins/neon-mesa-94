import * as THREE from 'three';
import type { SkinId } from './types';

/**
 * Per-skin outfits layered on the cowboy_hero model: recolours every body part (pants, boots,
 * sleeves, belt — not just the poncho) and bolts on extra pieces:
 *
 *  sunset        — the basic outfit, detailed: denim, bandolier of brass rounds, poncho stripes,
 *                  neckerchief, spurs
 *  cyan_marshal  — long blue overcoat with lapels and a shoulder mantle, holographic blue hat,
 *                  marshal's star
 *  acid_rattler  — toxic greens, respirator with canisters, rattlesnake tail on the hat,
 *                  dripping acid (green particles come from the engine)
 *  gold_desperado— gold all over, brown trousers, chain + medallion, gold spurs
 *  phantom_mesa  — all black, a bandana over the face (smoke particles come from the engine)
 *
 * Model space: feet at y=0, hat top ≈2.07, facing +Z. Parts: boot_l/r, leg_l/r, poncho_mesh,
 * trim_mesh_*, belt_mesh, arm_l/r, head_mesh, visor_mesh, hat_mesh_brim/crown, hatband_mesh.
 */

type Std = THREE.MeshStandardMaterial;

interface PartLook {
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

interface Look {
  parts: Partial<Record<'boots' | 'legs' | 'poncho' | 'belt' | 'arms' | 'head' | 'hat' | 'trim' | 'visor' | 'hatband', PartLook>>;
  holoHat?: boolean;
}

const gold = (c = 0xd4a017): PartLook => ({ color: c, emissive: c, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.28 });

const LOOKS: Record<SkinId, Look> = {
  sunset: {
    parts: {
      legs: { color: 0x34425e },
      boots: { color: 0x4a2a16 },
      arms: { color: 0x7a2a1c },
      belt: { color: 0x2a1810 },
    },
  },
  cyan_marshal: {
    parts: {
      poncho: { color: 0x1f4e8c },
      arms: { color: 0x1a4078 },
      legs: { color: 0x182034 },
      boots: { color: 0x14161c },
      belt: { color: 0x10141c },
      trim: { color: 0x9fdcff, emissive: 0x9fdcff, emissiveIntensity: 0.4 },
    },
    holoHat: true,
  },
  acid_rattler: {
    parts: {
      poncho: { color: 0x3a8a10 },
      arms: { color: 0x1e4a12 },
      legs: { color: 0x2a3a1a },
      boots: { color: 0x1a2214 },
      belt: { color: 0x141a10 },
      hat: { color: 0x1c2a14 },
      trim: { color: 0xccff33, emissive: 0xccff33, emissiveIntensity: 0.8 },
      hatband: { color: 0x9ef01a, emissive: 0x9ef01a, emissiveIntensity: 1.4 },
    },
  },
  gold_desperado: {
    parts: {
      poncho: gold(0xd4a017),
      arms: gold(0xc8961a),
      hat: gold(0xe0b020),
      boots: gold(0xb8860b),
      belt: gold(0x8a6410),
      trim: gold(0xffe066),
      legs: { color: 0x5a3418, roughness: 0.9 },
      hatband: { color: 0x5a3418, emissive: 0x000000, emissiveIntensity: 0 },
    },
  },
  phantom_mesa: {
    parts: {
      poncho: { color: 0x0c0a10 },
      arms: { color: 0x0e0b12 },
      legs: { color: 0x100c14 },
      boots: { color: 0x08060a },
      belt: { color: 0x0a080c },
      hat: { color: 0x0a0810 },
      trim: { color: 0x2a1a30, emissive: 0xff1e8a, emissiveIntensity: 0.25 },
      hatband: { color: 0x14101a, emissive: 0x000000, emissiveIntensity: 0 },
    },
  },
};

function partKey(name: string): keyof Look['parts'] | null {
  if (name.startsWith('boot')) return 'boots';
  if (name.startsWith('leg')) return 'legs';
  if (name.startsWith('poncho')) return 'poncho';
  if (name.startsWith('belt')) return 'belt';
  if (name.startsWith('arm')) return 'arms';
  if (name.startsWith('head')) return 'head';
  if (name.startsWith('hat_mesh')) return 'hat';
  if (name.startsWith('trim')) return 'trim';
  if (name.startsWith('visor')) return 'visor';
  if (name.startsWith('hatband')) return 'hatband';
  return null;
}

/** Restores the material to what the GLB / applyHeroSkin left before any outfit touched it. */
function remember(m: Std) {
  if (!m.userData.orig) {
    m.userData.orig = {
      color: m.color.getHex(),
      emissive: m.emissive.getHex(),
      emissiveIntensity: m.emissiveIntensity,
      metalness: m.metalness,
      roughness: m.roughness,
    };
  }
}

function apply(m: Std, look: PartLook) {
  m.color.setHex(look.color);
  if (look.emissive !== undefined) m.emissive.setHex(look.emissive);
  if (look.emissiveIntensity !== undefined) m.emissiveIntensity = look.emissiveIntensity;
  if (look.metalness !== undefined) m.metalness = look.metalness;
  if (look.roughness !== undefined) m.roughness = look.roughness;
  m.userData.baseEmissive = m.emissive.getHex();
  m.userData.baseEmissiveIntensity = m.emissiveIntensity;
}

// ───────────────────────── extra pieces ─────────────────────────

const mat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, emissive: color, emissiveIntensity: 0.15, flatShading: true, ...o });

function box(g: THREE.Object3D, size: [number, number, number], m: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function star(g: THREE.Object3D, m: THREE.Material, pos: [number, number, number], r: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, -Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr);
  }
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), m);
  mesh.position.set(...pos);
  g.add(mesh);
  return mesh;
}

function spurs(g: THREE.Object3D, m: THREE.Material) {
  for (const sx of [-0.18, 0.18]) {
    box(g, [0.04, 0.04, 0.1], m, [sx, 0.1, -0.17]);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 6), m);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, 0.1, -0.23);
    g.add(wheel);
  }
}

// The poncho is a square frustum: half-width 0.52 at its hem (y 0.75) narrowing to 0.32 at the
// collar (y 1.5). Pieces worn on it follow that sloped surface.
const ponchoW = (y: number) => 0.52 - 0.2667 * (y - 0.75);
const frontZ = (y: number) => ponchoW(y) + 0.018;
const TILT = -0.26; // the front face leans back this much

/** A stripe wrapped around the poncho at height y (a thin open square frustum). */
function ponchoBand(g: THREE.Object3D, m: THREE.Material, y: number, h: number) {
  const wt = ponchoW(y + h / 2) + 0.012;
  const wb = ponchoW(y - h / 2) + 0.012;
  const geo = new THREE.CylinderGeometry(wt / Math.SQRT1_2, wb / Math.SQRT1_2, h, 4, 1, true).rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = y;
  g.add(mesh);
}

/** A flat piece lying on the poncho's sloped front face. */
function onFront(g: THREE.Object3D, size: [number, number, number], m: THREE.Material, x: number, y: number, rotZ = 0, lift = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.position.set(x, y, frontZ(y) + lift);
  mesh.rotation.set(TILT, 0, rotZ);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** A strap running across the front from (x0,y0) to (x1,y1), built from short segments. */
function frontStrap(g: THREE.Object3D, m: THREE.Material, x0: number, y0: number, x1: number, y1: number, width: number, n = 7) {
  const rotZ = Math.atan2(-(x1 - x0), y1 - y0);
  const seg = Math.hypot(x1 - x0, y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    onFront(g, [width, seg * 1.08, 0.035], m, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, rotZ);
  }
  return rotZ;
}

function buildOutfit(id: SkinId): THREE.Group {
  const g = new THREE.Group();
  g.name = 'outfit';
  switch (id) {
    case 'sunset': {
      const leather = mat(0x5a3418);
      const brass = mat(0xd8a030, { metalness: 0.7, roughness: 0.35, emissiveIntensity: 0.3 });
      // Bandolier across the chest (left shoulder → right hip), brass rounds in the loops
      const rz = frontStrap(g, leather, -0.24, 1.42, 0.3, 0.84, 0.11);
      for (let i = 1; i < 7; i++) {
        const u = i / 7;
        onFront(g, [0.045, 0.1, 0.05], brass, -0.24 + 0.54 * u, 1.42 - 0.58 * u, rz + Math.PI / 2, 0.025);
      }
      // Poncho stripes (cream + oxblood) and a neckerchief
      ponchoBand(g, mat(0xf2d6a2), 0.9, 0.05);
      ponchoBand(g, mat(0x6a1018), 0.96, 0.04);
      const scarf = mat(0xb0281c);
      box(g, [0.36, 0.08, 0.36], scarf, [0, 1.47, 0.02]);
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 3), scarf);
      tri.rotation.set(Math.PI, 0, 0);
      tri.position.set(0, 1.38, 0.2);
      g.add(tri);
      spurs(g, brass);
      break;
    }
    case 'cyan_marshal': {
      const coat = mat(0x1f4e8c);
      const lapel = mat(0x6fb4ee, { emissiveIntensity: 0.3 });
      // Long overcoat: skirt panels from the poncho hem down to the shins, open at the front
      box(g, [1.0, 0.62, 0.05], coat, [0, 0.47, -0.47], [-0.08, 0, 0]);
      for (const sx of [-1, 1]) {
        box(g, [0.05, 0.62, 0.92], coat, [sx * 0.49, 0.47, 0], [0, 0, sx * 0.08]);
        box(g, [0.36, 0.62, 0.05], coat, [sx * 0.31, 0.47, 0.47], [0.08, sx * -0.12, 0]);
        // Lapels running up the front, converging at the collar
        frontStrap(g, lapel, sx * 0.2, 0.8, sx * 0.1, 1.44, 0.07, 5);
      }
      // Shoulder mantle (short cape) and brass buttons
      box(g, [1.18, 0.1, 0.7], coat, [0, 1.47, 0], [0, 0, 0]);
      box(g, [1.12, 0.22, 0.05], coat, [0, 1.36, -0.37], [0.25, 0, 0]);
      const brass = mat(0xffd27a, { metalness: 0.8, roughness: 0.3, emissiveIntensity: 0.4 });
      for (let i = 0; i < 3; i++) onFront(g, [0.05, 0.05, 0.03], brass, 0.0, 0.92 + i * 0.14, 0, 0.01);
      // Marshal's star
      const badge = star(g, mat(0xffd24a, { metalness: 0.8, roughness: 0.25, emissiveIntensity: 0.6 }), [-0.2, 1.2, frontZ(1.2)], 0.09);
      badge.rotation.x = TILT;
      break;
    }
    case 'acid_rattler': {
      const lime = mat(0x9ef01a, { emissiveIntensity: 1.0 });
      const dark = mat(0x1a2214);
      // Respirator over mouth + two canisters
      box(g, [0.24, 0.12, 0.08], dark, [0, 1.52, 0.2]);
      for (const sx of [-1, 1]) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), lime);
        can.rotation.x = Math.PI / 2;
        can.position.set(sx * 0.12, 1.5, 0.27);
        g.add(can);
      }
      // Rattlesnake tail curling off the back of the hatband
      for (let i = 0; i < 5; i++) {
        box(g, [0.08 - i * 0.008, 0.06, 0.07], i % 2 ? lime : dark, [0, 1.86 + i * 0.045, -0.32 - i * 0.03], [-0.5, 0, 0]);
      }
      // Acid drips down the poncho
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        box(g, [0.04, 0.1 + (i % 3) * 0.05, 0.02], lime, [Math.sin(a) * 0.53, 0.8, Math.cos(a) * 0.53], [0, a, 0]);
      }
      // Toxic vials on the belt
      for (const sx of [-0.25, -0.1]) {
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6), lime);
        vial.position.set(sx, 0.8, 0.42);
        g.add(vial);
      }
      break;
    }
    case 'gold_desperado': {
      const au = mat(0xffd24a, { metalness: 0.9, roughness: 0.22, emissiveIntensity: 0.45 });
      // Heavy chain + medallion
      for (let i = 0; i < 9; i++) {
        const t = (i / 8) * Math.PI;
        const y = 1.44 - Math.sin(t) * 0.2;
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 4, 6), au);
        link.position.set(Math.cos(t) * 0.2, y, frontZ(y) + 0.01);
        link.rotation.set(TILT, i % 2 ? Math.PI / 2 : 0, 0);
        g.add(link);
      }
      const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 10), au);
      medal.rotation.x = Math.PI / 2 + TILT;
      medal.position.set(0, 1.18, frontZ(1.18) + 0.015);
      g.add(medal);
      // Gold-tipped boots and big spurs, gold rings on the hat
      spurs(g, au);
      for (const sx of [-0.18, 0.18]) box(g, [0.2, 0.06, 0.08], au, [sx, 0.04, 0.18]);
      break;
    }
    case 'phantom_mesa': {
      const cloth = mat(0x120a16, { roughness: 0.95, emissiveIntensity: 0.05 });
      const stitch = mat(0xff1e8a, { emissiveIntensity: 0.9 });
      // Bandana wrapped over the lower face, a point hanging at the front, knot + tails behind
      box(g, [0.38, 0.16, 0.38], cloth, [0, 1.52, 0]);
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.22, 3), cloth);
      point.rotation.set(Math.PI, Math.PI / 6, 0);
      point.position.set(0, 1.38, 0.17);
      g.add(point);
      box(g, [0.3, 0.02, 0.02], stitch, [0, 1.6, 0.195]);
      box(g, [0.1, 0.08, 0.06], cloth, [0, 1.53, -0.21]);
      for (const sx of [-1, 1]) box(g, [0.05, 0.22, 0.03], cloth, [sx * 0.05, 1.4, -0.23], [0.3, 0, sx * 0.3]);
      // Tattered hem on the poncho
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        box(g, [0.12, 0.12 + (i % 3) * 0.06, 0.02], cloth, [Math.sin(a) * 0.53, 0.72, Math.cos(a) * 0.53], [0, a, (i % 2 ? 1 : -1) * 0.2]);
      }
      break;
    }
  }
  return g;
}

// Kept off userData: Object3D.clone() JSON-copies userData, and materials don't belong there
const solidMats = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const holoMats = new WeakMap<THREE.Mesh, THREE.Material>();

/** Swaps the hero into the given skin's outfit (idempotent; call after applyHeroSkin). */
export function applyHeroOutfit(hero: THREE.Object3D, id: SkinId) {
  const old = hero.getObjectByName('outfit');
  if (old) old.parent?.remove(old);
  const look = LOOKS[id];
  hero.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.parent?.name === 'outfit') return;
    const key = partKey(mesh.name);
    if (!key) return;
    // Holographic hat swap (and back)
    if (key === 'hat' || key === 'hatband') {
      if (!solidMats.has(mesh)) solidMats.set(mesh, mesh.material);
      const holo = look.holoHat;
      if (holo) {
        if (!holoMats.has(mesh)) {
          holoMats.set(mesh, new THREE.MeshBasicMaterial({
            color: key === 'hatband' ? 0xe8fbff : 0x46d8ff,
            transparent: true,
            opacity: key === 'hatband' ? 0.95 : 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }));
        }
        mesh.material = holoMats.get(mesh)!;
        // Wireframe shell gives it the projected-hologram look
        if (key === 'hat' && !mesh.getObjectByName('holo_wire')) {
          const wire = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0xbff6ff, wireframe: true, transparent: true, opacity: 0.7, toneMapped: false }));
          wire.name = 'holo_wire';
          wire.scale.setScalar(1.01);
          mesh.add(wire);
        }
        return;
      }
      mesh.material = solidMats.get(mesh) ?? mesh.material;
      const wire = mesh.getObjectByName('holo_wire');
      if (wire) mesh.remove(wire);
    }
    const m = mesh.material as Std;
    if (!m.isMeshStandardMaterial) return;
    remember(m);
    const o2 = m.userData.orig;
    // Reset to the base (GLB + applyHeroSkin colours), then layer this skin's look
    if (key !== 'poncho' && key !== 'hat' && key !== 'trim' && key !== 'visor' && key !== 'hatband') m.color.setHex(o2.color);
    m.metalness = o2.metalness;
    m.roughness = o2.roughness;
    if (key !== 'trim' && key !== 'visor' && key !== 'hatband') {
      m.emissive.setHex(o2.emissive);
      m.emissiveIntensity = o2.emissiveIntensity;
    }
    const part = look.parts[key];
    if (part) apply(m, part);
  });
  hero.add(buildOutfit(id));
}

/** Ambient particle style per skin (the engine emits them around the hero). */
export function outfitAura(id: SkinId): 'acid' | 'smoke' | 'gold' | 'holo' | null {
  return id === 'acid_rattler' ? 'acid' : id === 'phantom_mesa' ? 'smoke' : id === 'gold_desperado' ? 'gold' : id === 'cyan_marshal' ? 'holo' : null;
}
