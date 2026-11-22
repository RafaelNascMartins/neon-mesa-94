import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural arena props, built to sit on the painted floors (floorTextures.ts) instead of the
 * old flat orange blocks: layered sandstone buttes, riveted industrial pillars, strapped
 * explosive crates, humming server caches and broken asphalt slabs.
 *
 * Built once per theme, merged per material, then cloned per obstacle (shared geometry).
 */

export type PropTheme = 'road' | 'desert' | 'cemetery' | 'clearing' | 'tree';

const SELF = 0.16;
const mat = (color: number, rough = 0.9, metal = 0.05, self = SELF) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: color, emissiveIntensity: self, flatShading: true });
const glowMat = (color: number, k = 2.2) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4, toneMapped: false });

/** Deterministic little RNG so every butte looks the same between runs. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Pushes vertices around (shared positions move together so faces stay closed). */
function jitter(geo: THREE.BufferGeometry, amount: number, rand: () => number, keepY = false) {
  const pos = geo.attributes.position;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rand() - 0.5) * amount, keepY ? 0 : (rand() - 0.5) * amount * 0.5, (rand() - 0.5) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  g.add(mesh);
  return mesh;
}

function consolidate(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    for (const key of Object.keys(flat.attributes)) if (key !== 'position' && key !== 'normal') flat.deleteAttribute(key);
    const m = mesh.material as THREE.Material;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)!.push(flat);
  });
  const out = new THREE.Group();
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// ───────────────────────── buttes (road / desert / cemetery / clearing) ─────────────────────────

const BUTTE_COLORS: Record<Exclude<PropTheme, 'tree'>, [number, number, number]> = {
  road: [0x8a4a2a, 0x6a3420, 0x3a1c14],
  desert: [0xb07842, 0x8c5a30, 0x5a3620],
  cemetery: [0x4a3a4c, 0x382a3a, 0x1e1620],
  clearing: [0x6a3a28, 0x4e2a1e, 0x2a1610],
};

/** Sandstone butte: stacked, eroded strata tapering to a flat cap, rubble round the foot. */
function buildButte(theme: Exclude<PropTheme, 'tree'>, seed: number): THREE.Group {
  const [light, mid, dark] = BUTTE_COLORS[theme];
  const mLight = mat(light, 0.95);
  const mMid = mat(mid, 0.95);
  const mDark = mat(dark, 0.95);
  const rand = rng(seed);
  const g = new THREE.Group();
  let y = 0;
  const layers = [
    { r0: 2.25, r1: 2.05, h: 0.9 },
    { r0: 2.0, r1: 1.95, h: 0.35 },
    { r0: 1.95, r1: 1.8, h: 1.0 },
    { r0: 1.82, r1: 1.86, h: 0.3 },
    { r0: 1.8, r1: 1.62, h: 0.8 },
    { r0: 1.7, r1: 1.7, h: 0.22 },
  ];
  layers.forEach((l, i) => {
    const geo = jitter(new THREE.CylinderGeometry(l.r1, l.r0, l.h, 9, 1), i % 2 ? 0.18 : 0.32, rand, true);
    add(g, geo, i % 2 ? mDark : i % 4 === 0 ? mMid : mLight, [0, y + l.h / 2, 0], [0, rand() * Math.PI, 0]);
    y += l.h;
  });
  // Cap: a slightly overhanging hard layer
  add(g, jitter(new THREE.CylinderGeometry(1.78, 1.72, 0.26, 9, 1), 0.22, rand, true), mMid, [0, y + 0.13, 0], [0, rand(), 0]);
  // Vertical erosion grooves
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand() * 0.4;
    const r = 1.95 - rand() * 0.1;
    add(g, new THREE.BoxGeometry(0.16, 1.4 + rand() * 1.2, 0.2), mDark, [Math.cos(a) * r, 1.1 + rand() * 0.6, Math.sin(a) * r], [0, -a, 0]);
  }
  // Rubble around the base
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.1 + rand() * 0.6;
    const s = 0.18 + rand() * 0.32;
    add(g, jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.5, rand), rand() < 0.5 ? mMid : mDark, [Math.cos(a) * r, s * 0.6, Math.sin(a) * r], [rand() * 3, rand() * 3, 0]);
  }
  // Cemetery: dead moss streaks; desert/road: a bleached skull wedged in the rock
  if (theme === 'cemetery') {
    const moss = mat(0x234a3e, 0.95, 0, 0.25);
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      add(g, new THREE.BoxGeometry(0.5, 0.12, 0.3), moss, [Math.cos(a) * 1.95, 0.9 + rand() * 2, Math.sin(a) * 1.95], [0, -a, 0]);
    }
  } else {
    const bone = mat(0xd8ccb0, 0.7, 0, 0.3);
    const a = rand() * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.3, 0.26, 0.3), bone, [Math.cos(a) * 1.9, 1.5, Math.sin(a) * 1.9], [0, -a, 0.2]);
  }
  return consolidate(g);
}

// ───────────────────────── industrial pillar (tree) ─────────────────────────

function buildPillar(wire: boolean): THREE.Group {
  const steel = mat(wire ? 0x2a2040 : 0x5a5e68, 0.55, 0.6, 0.3);
  const dark = mat(wire ? 0x140c24 : 0x2e3038, 0.6, 0.6, 0.24);
  const rust = mat(0x6a2e18, 0.9, 0.3, 0.2);
  const hazard = mat(0xc8902a, 0.6, 0.2, 0.35);
  const lamp = glowMat(wire ? 0xff1e8a : 0xff2a14, 2.6);
  const g = new THREE.Group();
  // Plinth with chamfered top
  add(g, new THREE.BoxGeometry(3.4, 0.4, 3.4), dark, [0, 0.2, 0]);
  add(g, new THREE.CylinderGeometry(1.95, 2.3, 0.3, 8), steel, [0, 0.55, 0], [0, Math.PI / 8, 0]);
  // Octagonal shaft
  add(g, new THREE.CylinderGeometry(1.45, 1.6, 3.0, 8), steel, [0, 2.2, 0], [0, Math.PI / 8, 0]);
  // Hazard band (alternating blocks around the foot)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.62, 0.32, 0.08), i % 2 ? hazard : dark, [Math.cos(a) * 1.6, 0.95, Math.sin(a) * 1.6], [0, -a + Math.PI / 2, 0]);
  }
  // Rusted straps with rivets
  for (const by of [1.7, 2.9]) {
    add(g, new THREE.CylinderGeometry(1.56, 1.58, 0.16, 8), rust, [0, by, 0], [0, Math.PI / 8, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(g, new THREE.BoxGeometry(0.08, 0.08, 0.08), steel, [Math.cos(a) * 1.6, by, Math.sin(a) * 1.6]);
    }
  }
  // Pipes running up the sides
  for (const a of [0.4, 2.2, 3.9, 5.4]) {
    add(g, new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), rust, [Math.cos(a) * 1.68, 2.2, Math.sin(a) * 1.68]);
    add(g, new THREE.BoxGeometry(0.34, 0.12, 0.34), dark, [Math.cos(a) * 1.68, 3.6, Math.sin(a) * 1.68]);
  }
  // Head: grated cap, conduit box and a red warning lamp
  add(g, new THREE.CylinderGeometry(1.75, 1.5, 0.35, 8), dark, [0, 3.85, 0], [0, Math.PI / 8, 0]);
  for (let i = -2; i <= 2; i++) add(g, new THREE.BoxGeometry(2.4, 0.06, 0.12), steel, [0, 4.05, i * 0.42]);
  add(g, new THREE.BoxGeometry(0.7, 0.45, 0.5), dark, [0.6, 4.25, -0.4]);
  add(g, new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), lamp, [-0.5, 4.2, 0.5]);
  add(g, new THREE.BoxGeometry(0.06, 0.4, 0.06), steel, [-0.5, 4.1, 0.5]);
  // Wireframe floors: magenta seams instead of rust
  if (wire) {
    const seam = glowMat(0xff1e8a, 1.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      add(g, new THREE.BoxGeometry(0.05, 2.8, 0.05), seam, [Math.cos(a) * 1.55, 2.2, Math.sin(a) * 1.55]);
    }
  }
  return consolidate(g);
}

// ───────────────────────── explosive crate ─────────────────────────

function buildCrate(): THREE.Group {
  const wood = mat(0x7a4a26, 0.9, 0.02, 0.22);
  const woodDark = mat(0x4a2c16, 0.92, 0.02, 0.18);
  const metal = mat(0x4a4c54, 0.5, 0.8, 0.2);
  const red = glowMat(0xff2414, 1.6);
  const paint = mat(0xd8c8a0, 0.8, 0, 0.3);
  const g = new THREE.Group();
  const S = 1.36;
  add(g, new THREE.BoxGeometry(S, S, S), woodDark, [0, S / 2, 0]);
  // Plank faces (slightly proud) on 4 sides + top
  for (let side = 0; side < 4; side++) {
    const a = (side / 4) * Math.PI * 2;
    for (let p = 0; p < 3; p++) {
      const y = 0.24 + p * 0.44;
      add(g, new THREE.BoxGeometry(S - 0.14, 0.38, 0.06), wood, [Math.sin(a) * (S / 2 + 0.01), y, Math.cos(a) * (S / 2 + 0.01)], [0, a, 0]);
    }
    // Diagonal brace
    add(g, new THREE.BoxGeometry(0.14, S * 1.25, 0.05), woodDark, [Math.sin(a) * (S / 2 + 0.05), S / 2, Math.cos(a) * (S / 2 + 0.05)], [0, a, 0.78]);
  }
  for (let p = 0; p < 3; p++) add(g, new THREE.BoxGeometry(0.4, 0.06, S - 0.12), wood, [-0.44 + p * 0.44, S + 0.01, 0]);
  // Steel corner brackets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0, 1]) {
    add(g, new THREE.BoxGeometry(0.22, 0.22, 0.22), metal, [sx * (S / 2), sy * S, sz * (S / 2)]);
  }
  // Red hazard diamonds + stencil bars on two faces
  for (const a of [0, Math.PI / 2]) {
    add(g, new THREE.BoxGeometry(0.42, 0.42, 0.04), red, [Math.sin(a) * (S / 2 + 0.09), 0.72, Math.cos(a) * (S / 2 + 0.09)], [0, a, Math.PI / 4]);
    add(g, new THREE.BoxGeometry(0.7, 0.07, 0.04), paint, [Math.sin(a) * (S / 2 + 0.09), 0.32, Math.cos(a) * (S / 2 + 0.09)], [0, a, 0]);
  }
  // A fuse wire coiled on top
  for (let i = 0; i < 5; i++) add(g, new THREE.BoxGeometry(0.05, 0.05, 0.22), metal, [0.3 + Math.cos(i) * 0.15, S + 0.08, -0.2 + Math.sin(i) * 0.15], [0, i, 0]);
  return consolidate(g);
}

// ───────────────────────── data cache (server box) ─────────────────────────

function buildCache(theme: PropTheme): THREE.Group {
  const shell = mat(0x5a5e68, 0.5, 0.6, 0.32);
  const dark = mat(0x24262c, 0.6, 0.6, 0.22);
  const lid = mat(0x7a7e88, 0.45, 0.6, 0.35);
  const rust = mat(0x6a2e18, 0.9, 0.3, 0.2);
  const led = glowMat(theme === 'cemetery' ? 0x22e3d4 : 0x00e5ff, 2.4);
  const amber = glowMat(0xffaa2b, 2.0);
  const g = new THREE.Group();
  // Body
  add(g, new THREE.BoxGeometry(1.6, 1.15, 1.2), shell, [0, 0.62, 0]);
  add(g, new THREE.BoxGeometry(1.7, 0.12, 1.3), dark, [0, 0.06, 0]);
  // Top (what the overhead camera actually sees): light steel lid, vent grille, LED strip, warning label
  add(g, new THREE.BoxGeometry(1.66, 0.1, 1.26), lid, [0, 1.24, 0]);
  for (let i = 0; i < 6; i++) add(g, new THREE.BoxGeometry(0.06, 0.03, 0.8), dark, [-0.62 + i * 0.12, 1.3, -0.05]);
  for (let i = 0; i < 5; i++) add(g, new THREE.BoxGeometry(0.1, 0.04, 0.1), i === 3 ? amber : led, [0.2 + i * 0.13, 1.31, 0.42]);
  add(g, new THREE.BoxGeometry(0.42, 0.03, 0.28), mat(0xc8902a, 0.6, 0.2, 0.4), [0.45, 1.3, -0.2]);
  // Front: vent slats + LED column, back: more vents
  for (const fz of [1, -1]) {
    for (let i = 0; i < 5; i++) add(g, new THREE.BoxGeometry(0.9, 0.05, 0.04), dark, [-0.25, 0.35 + i * 0.16, fz * 0.61]);
    for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.08, 0.08, 0.04), i === 2 ? amber : led, [0.55, 0.4 + i * 0.17, fz * 0.62]);
  }
  // Side handles, a rust patch and a cracked panel
  for (const sx of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, 0.12, 0.6), dark, [sx * 0.83, 0.85, 0]);
  add(g, new THREE.BoxGeometry(0.5, 0.3, 0.02), rust, [-0.4, 0.95, 0.61], [0, 0, 0.2]);
  // Antenna + dangling cables
  add(g, new THREE.BoxGeometry(0.04, 0.6, 0.04), dark, [0.6, 1.55, -0.35]);
  add(g, new THREE.BoxGeometry(0.1, 0.1, 0.1), led, [0.6, 1.88, -0.35]);
  for (const [x, z] of [[-0.7, 0.4], [-0.75, -0.2]] as [number, number][]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 1.1, z), new THREE.Vector3(x - 0.3, 0.6, z + 0.1), new THREE.Vector3(x - 0.45, 0.04, z + 0.3)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.04, 4), dark));
  }
  return consolidate(g);
}

// ───────────────────────── broken asphalt slab (desert) ─────────────────────────

function buildRuin(seed: number): THREE.Group {
  const rand = rng(seed);
  const asphalt = mat(0x2a2224, 0.95, 0.05, 0.18);
  const base = mat(0x5a4a3a, 0.95, 0, 0.18);
  const line = mat(0xd8a030, 0.8, 0, 0.35);
  const rebar = mat(0x6a3a22, 0.7, 0.6, 0.2);
  const g = new THREE.Group();
  add(g, jitter(new THREE.BoxGeometry(2.2, 0.32, 1.4, 3, 1, 2), 0.2, rand, true), asphalt, [0, 0.42, 0], [0.16, 0, -0.18]);
  add(g, jitter(new THREE.BoxGeometry(2.1, 0.36, 1.3, 3, 1, 2), 0.24, rand, true), base, [0.05, 0.16, 0.02], [0.14, 0, -0.16]);
  add(g, new THREE.BoxGeometry(1.4, 0.04, 0.16), line, [-0.1, 0.62, 0], [0.16, 0, -0.18]);
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.05, 0.05, 0.6 + rand() * 0.5), rebar, [1.0 + rand() * 0.2, 0.35, -0.4 + i * 0.26], [0.3 * rand(), 0.6 + rand() * 0.4, 0.2]);
  for (let i = 0; i < 4; i++) {
    const s = 0.14 + rand() * 0.18;
    add(g, jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.4, rand), asphalt, [-1.3 + rand() * 2.6, s * 0.5, (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 0.3)]);
  }
  return consolidate(g);
}

// ───────────────────────── cache + factory ─────────────────────────

const cache = new Map<string, THREE.Group>();
function cached(key: string, build: () => THREE.Group) {
  let g = cache.get(key);
  if (!g) {
    g = build();
    cache.set(key, g);
  }
  return g.clone(true);
}

export function buildMesaProp(theme: PropTheme, variant: number, wire = false): THREE.Group {
  if (theme === 'tree') return cached(`pillar_${wire}`, () => buildPillar(wire));
  const v = variant % 3;
  return cached(`butte_${theme}_${v}`, () => buildButte(theme, 1994 + v * 77));
}

export function buildCrateProp(): THREE.Group {
  return cached('crate', buildCrate);
}

export function buildCacheProp(theme: PropTheme): THREE.Group {
  return cached(`cache_${theme === 'cemetery' ? 'c' : 'n'}`, () => buildCache(theme));
}

export function buildRuinProp(variant: number): THREE.Group {
  return cached(`ruin_${variant % 2}`, () => buildRuin(77 + (variant % 2) * 13));
}
