import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Special rooms for the floors between VM and Cem Faces' second coming (waves 11–14).
 *
 *  wall — solid cover: blocks movement and bullets (wave 11, fixed layout).
 *  pit  — the floor has collapsed into the void. Fall in: −1 integrity, you climb back out
 *         where you last stood. Gaps across walkways are ~3.4 m: a dash (≈5 m) carries you.
 *  lava — standing in it burns (1 integrity per tick). Dash across it.
 *
 * Pit / lava rooms are generated fresh every visit (RNG) on a 7×7 grid over the arena: the
 * hazard fills everything up to the arena wall and only walkways / platforms are left —
 * always a north–south spine (entry → centre → exit), random side arms reaching the wall
 * (where enemies warp in), a few random clearings, and dash gaps cut across some walkways.
 * Ground enemies treat hazards as walls; flying ones ignore them.
 */

export type HazardKind = 'pit' | 'lava';

export interface HazardDef {
  kind: HazardKind;
  x: number;
  z: number;
  /** Bounding radius. */
  r: number;
  /** Rectangle half extents. */
  hw?: number;
  hd?: number;
  /** Sides ('n' | 's' | 'e' | 'w') that butt onto more of the same hazard: no lip there. */
  open?: string;
}

export interface WallDef {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

export interface RoomLayout {
  name: string;
  walls: WallDef[];
  hazards: HazardDef[];
  /** How many flying enemies join the round. */
  flyers: number;
}

type RoomKind = 'walls' | 'pit' | 'lava' | 'mixed';

/** Names + kinds of the special rooms (the hazards themselves are rolled on entry). */
export const ROOM_LAYOUTS: Record<number, { name: string; kind: RoomKind; flyers: number }> = {
  11: { name: 'SALA DAS PAREDES', kind: 'walls', flyers: 0 },
  12: { name: 'DESABAMENTO', kind: 'pit', flyers: 4 },
  13: { name: 'MAR DE LAVA', kind: 'lava', flyers: 4 },
  14: { name: 'FOSSO E FORNALHA', kind: 'mixed', flyers: 5 },
};

const WALL_ROOM: WallDef[] = [
  { x: -7, z: -3, halfW: 3, halfD: 0.5 },
  { x: 7, z: -3, halfW: 3, halfD: 0.5 },
  { x: -19, z: 7, halfW: 0.5, halfD: 3.5 },
  { x: 19, z: 7, halfW: 0.5, halfD: 3.5 },
  { x: -8, z: -19, halfW: 2.5, halfD: 0.5 },
  { x: 8, z: -19, halfW: 2.5, halfD: 0.5 },
  { x: -9, z: 14, halfW: 2.2, halfD: 0.5 },
  { x: 9, z: 14, halfW: 2.2, halfD: 0.5 },
];

// ───────────────────────── generator ─────────────────────────

const N = 7;
const SPAN = 64; // grid covers [-32, 32]: a bit past the arena wall
const C = SPAN / N;
const cellX = (i: number) => -SPAN / 2 + C * (i + 0.5);
const GAP = 3.4;

/** Rolls the room for this wave (undefined for ordinary floors). */
export function makeRoomLayout(wave: number, rand: () => number = Math.random): RoomLayout | undefined {
  const meta = ROOM_LAYOUTS[wave];
  if (!meta) return undefined;
  if (meta.kind === 'walls') return { name: meta.name, walls: WALL_ROOM, hazards: [], flyers: meta.flyers };

  // walk[i][j] — i: column (x, west→east), j: row (z, north→south)
  const walk: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const carve = (i: number, j: number) => {
    if (i >= 0 && j >= 0 && i < N && j < N) walk[i][j] = true;
  };
  const mid = (N - 1) / 2; // 3
  // Spine: exit (north) → centre → entry (south)
  for (let j = 0; j < N; j++) carve(mid, j);
  // Side arms to the wall at random rows (enemies warp in at the wall)
  const rows = [1, 2, 3, 4, 5].sort(() => rand() - 0.5);
  const arms = 2 + Math.floor(rand() * 2);
  for (let a = 0; a < arms; a++) {
    const j = rows[a];
    const dirs = rand() < 0.4 ? [-1, 1] : [rand() < 0.5 ? -1 : 1];
    for (const d of dirs) for (let i = mid; i >= 0 && i < N; i += d) carve(i, j);
  }
  // A wandering walkway and a couple of clearings
  let wi = mid;
  let wj = Math.floor(rand() * N);
  for (let s = 0; s < 6; s++) {
    carve(wi, wj);
    if (rand() < 0.5) wi += rand() < 0.5 ? -1 : 1;
    else wj += rand() < 0.5 ? -1 : 1;
    wi = Math.max(0, Math.min(N - 1, wi));
    wj = Math.max(0, Math.min(N - 1, wj));
  }
  for (let k = 0; k < 2; k++) {
    const ci = 1 + Math.floor(rand() * (N - 2));
    const cj = 1 + Math.floor(rand() * (N - 2));
    if (walk[ci][cj]) {
      carve(ci + (rand() < 0.5 ? 1 : -1), cj);
      carve(ci, cj + (rand() < 0.5 ? 1 : -1));
    }
  }

  // Which hazard fills each empty cell
  const flipX = rand() < 0.5;
  const kindAt = (i: number, j: number): HazardKind => {
    if (meta.kind === 'pit') return 'pit';
    if (meta.kind === 'lava') return 'lava';
    // Mixed: one half caved in, the other half burning (side picked at random)
    const west = flipX ? i > mid : i < mid;
    return i === mid ? (j < mid ? 'pit' : 'lava') : west ? 'pit' : 'lava';
  };

  const hazards: HazardDef[] = [];
  const isHaz = (i: number, j: number, kind: HazardKind) => i < 0 || j < 0 || i >= N || j >= N || (!walk[i][j] && kindAt(i, j) === kind);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (walk[i][j]) continue;
      const kind = kindAt(i, j);
      let open = '';
      if (isHaz(i, j - 1, kind)) open += 'n';
      if (isHaz(i, j + 1, kind)) open += 's';
      if (isHaz(i + 1, j, kind)) open += 'e';
      if (isHaz(i - 1, j, kind)) open += 'w';
      hazards.push(rect(kind, cellX(i), cellX(j), C / 2, C / 2, open));
    }
  }

  // Dash gaps: cut a band across walkway cells that sit between two hazard cells
  const gapsWanted = meta.kind === 'lava' ? 2 : 3;
  const cands: { i: number; j: number; vertical: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (!walk[i][j]) continue;
      // Never on the arrival cell or the centre
      if (i === mid && (j === 5 || j === mid)) continue;
      const eHaz = i + 1 < N && !walk[i + 1][j];
      const wHaz = i - 1 >= 0 && !walk[i - 1][j];
      const nHaz = j - 1 >= 0 && !walk[i][j - 1];
      const sHaz = j + 1 < N && !walk[i][j + 1];
      // A north–south walkway: the band runs east–west between the two side hazards
      if (eHaz && wHaz && !nHaz && !sHaz && kindAt(i + 1, j) === kindAt(i - 1, j)) cands.push({ i, j, vertical: true });
      else if (nHaz && sHaz && !eHaz && !wHaz && kindAt(i, j + 1) === kindAt(i, j - 1)) cands.push({ i, j, vertical: false });
    }
  }
  cands.sort(() => rand() - 0.5);
  for (const c of cands.slice(0, gapsWanted)) {
    const x = cellX(c.i);
    const z = cellX(c.j);
    if (c.vertical) hazards.push(rect(kindAt(c.i + 1, c.j), x, z, C / 2, GAP / 2, 'ew'));
    else hazards.push(rect(kindAt(c.i, c.j + 1), x, z, GAP / 2, C / 2, 'ns'));
  }

  return { name: meta.name, walls: [], hazards, flyers: meta.flyers };
}

function rect(kind: HazardKind, x: number, z: number, hw: number, hd: number, open: string): HazardDef {
  return { kind, x, z, r: Math.hypot(hw, hd), hw, hd, open };
}

// ───────────────────────── visuals ─────────────────────────

let lavaTex: THREE.CanvasTexture | null = null;

/** Lava surface: dark crust plates floating on bright molten cracks. */
function lavaTexture() {
  if (lavaTex) return lavaTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff5a10';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 3 + Math.random() * 14;
    ctx.fillStyle = Math.random() < 0.5 ? '#ffb030' : '#ff2a08';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    ctx.fillStyle = 'rgba(40,10,6,0.85)';
    ctx.beginPath();
    const n = 5 + Math.floor(Math.random() * 3);
    const rr = 8 + Math.random() * 16;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rk = rr * (0.6 + Math.random() * 0.5);
      if (k === 0) ctx.moveTo(x + Math.cos(a) * rk, y + Math.sin(a) * rk);
      else ctx.lineTo(x + Math.cos(a) * rk, y + Math.sin(a) * rk);
    }
    ctx.closePath();
    ctx.fill();
  }
  lavaTex = new THREE.CanvasTexture(c);
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.magFilter = THREE.NearestFilter;
  return lavaTex;
}

/** Jagged outline of a rectangle (relative to its centre, XZ), straight on open sides. */
function outlineFor(hw: number, hd: number, open: string, rand: () => number): [number, number][] {
  const pts: [number, number][] = [];
  const E = 0.35; // open sides overlap the neighbour so the surfaces fuse
  const n0 = open.includes('n') ? -hd - E : -hd;
  const s0 = open.includes('s') ? hd + E : hd;
  const e0 = open.includes('e') ? hw + E : hw;
  const w0 = open.includes('w') ? -hw - E : -hw;
  const edge = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, straight: boolean) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.round(len / 0.55));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = straight || i === 0 ? 0 : (rand() - 0.5) * 0.5;
      pts.push([x0 + (x1 - x0) * t + nx * j, z0 + (z1 - z0) * t + nz * j]);
    }
  };
  edge(w0, n0, e0, n0, 0, 1, open.includes('n'));
  edge(e0, n0, e0, s0, 1, 0, open.includes('e'));
  edge(e0, s0, w0, s0, 0, 1, open.includes('s'));
  edge(w0, s0, w0, n0, 1, 0, open.includes('w'));
  return pts;
}

export interface HazardField {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
}

/**
 * Builds every hazard of a room as a handful of merged meshes: the void, the cliff faces and
 * rims, broken-lip rubble and rebar, the lava surface (world-space UVs, one scrolling texture),
 * its crust and glow — plus a few crumbs that keep falling into the chasms.
 */
export function buildHazardField(defs: HazardDef[]): HazardField {
  const g = new THREE.Group();
  let seed = 1 + Math.floor(Math.random() * 1e6);
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const voids: THREE.BufferGeometry[] = [];
  const lavas: THREE.BufferGeometry[] = [];
  const colored: THREE.BufferGeometry[] = []; // vertex-coloured strips (cliffs, rims, crust, glow)
  const chunks: THREE.BufferGeometry[] = [];
  const rebar: THREE.BufferGeometry[] = [];
  const crumbEdges: [number, number][] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();

  const strip = (x0: number, z0: number, x1: number, z1: number, dx: number, dz: number, y: number, top: number, bottom: number) => {
    const geo = new THREE.BufferGeometry();
    const a = new THREE.Color(top);
    const b = new THREE.Color(bottom);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z1, x1 + dx, y, z1 + dz, x0 + dx, y, z0 + dz], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([a.r, a.g, a.b, a.r, a.g, a.b, b.r, b.g, b.b, b.r, b.g, b.b], 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    colored.push(geo);
  };

  for (const def of defs) {
    const hw = def.hw ?? def.r * 0.7;
    const hd = def.hd ?? def.r * 0.7;
    const open = def.open ?? '';
    const out = outlineFor(hw, hd, open, rand);
    const sideOf = (x: number, z: number) => {
      const dn = Math.abs(z + hd);
      const ds = Math.abs(z - hd);
      const de = Math.abs(x - hw);
      const dw = Math.abs(x + hw);
      const m = Math.min(dn, ds, de, dw);
      return m === dn ? 'n' : m === ds ? 's' : m === de ? 'e' : 'w';
    };
    const shape = new THREE.Shape(out.map(([x, z]) => new THREE.Vector2(x, -z)));
    const surf = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    surf.translate(def.x, 0, def.z);
    const lava = def.kind === 'lava';
    if (lava) {
      // World-space UVs so neighbouring cells read as one sea of lava
      const pos = surf.getAttribute('position');
      const uv = surf.getAttribute('uv');
      for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) / 7, pos.getZ(k) / 7);
      surf.deleteAttribute('normal');
      lavas.push(surf);
    } else {
      surf.deleteAttribute('normal');
      surf.deleteAttribute('uv');
      voids.push(surf);
    }

    for (let k = 0; k < out.length; k++) {
      const [ax, az] = out[k];
      const [bx, bz] = out[(k + 1) % out.length];
      const side = sideOf((ax + bx) / 2, (az + bz) / 2);
      if (open.includes(side)) continue;
      const x0 = ax + def.x;
      const z0 = az + def.z;
      const x1 = bx + def.x;
      const z1 = bz + def.z;
      // Outward normal of this edge (away from the rectangle's centre)
      let nx = bz - az;
      let nz = -(bx - ax);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      if (nx * (ax + bx) + nz * (az + bz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      if (lava) {
        // Cooled crust lip + hot glow bleeding onto the floor
        strip(x0, z0, x1, z1, nx * 0.35, nz * 0.35, 0.05, 0x3a1a10, 0x1a0c08);
        strip(x0 + nx * 0.35, z0 + nz * 0.35, x1 + nx * 0.35, z1 + nz * 0.35, nx * 0.9, nz * 0.9, 0.045, 0x5a1a06, 0x000000);
      } else {
        // Bright broken-slab rim, and the cliff face falling away on the far / side walls
        const w = 0.16 + rand() * 0.14;
        strip(x0, z0, x1, z1, nx * w, nz * w, 0.045, 0xb0a69a, 0x6a6058);
        if (side === 'n') strip(x0, z0, x1, z1, 0, Math.min(1.6, hd * 0.9) * (0.8 + rand() * 0.35), 0.04, 0x8a7a6a, 0x000000);
        else if (side === 'e') strip(x0, z0, x1, z1, -0.7, 0, 0.04, 0x4a4038, 0x000000);
        else if (side === 'w') strip(x0, z0, x1, z1, 0.7, 0, 0.04, 0x4a4038, 0x000000);
        if (rand() < 0.12) crumbEdges.push([x0, z0]);
      }
      // Rubble on the lip
      if (rand() < 0.6) {
        const s = 0.14 + rand() * 0.26;
        const geo = new THREE.DodecahedronGeometry(s, 0);
        eu.set(rand() * 3, rand() * 3, rand() * 3);
        q.setFromEuler(eu);
        m4.compose(new THREE.Vector3(x0 + nx * (0.15 + rand() * 0.3), s * 0.35, z0 + nz * (0.15 + rand() * 0.3)), q, new THREE.Vector3(1, 0.6 + rand() * 0.4, 1));
        geo.applyMatrix4(m4);
        chunks.push(geo);
      }
      if (!lava && rand() < 0.12) {
        const len = 0.5 + rand() * 0.6;
        const bar = new THREE.CylinderGeometry(0.035, 0.035, len, 4);
        bar.translate(0, len / 2, 0);
        eu.set(nz * (0.9 + rand() * 0.5), 0, -nx * (0.9 + rand() * 0.5));
        q.setFromEuler(eu);
        m4.compose(new THREE.Vector3(x0, 0.08, z0), q, new THREE.Vector3(1, 1, 1));
        bar.applyMatrix4(m4);
        rebar.push(bar);
      }
    }
  }

  if (voids.length) {
    const m = new THREE.Mesh(mergeGeometries(voids), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    m.position.y = 0.03;
    g.add(m);
  }
  let lavaMat: THREE.MeshBasicMaterial | null = null;
  if (lavas.length) {
    const tex = lavaTexture().clone();
    tex.needsUpdate = true;
    lavaMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false });
    const m = new THREE.Mesh(mergeGeometries(lavas), lavaMat);
    m.position.y = 0.035;
    g.add(m);
  }
  if (colored.length) {
    g.add(new THREE.Mesh(mergeGeometries(colored), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, side: THREE.DoubleSide })));
  }
  if (chunks.length) {
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x5a524a, emissive: 0x5a524a, emissiveIntensity: 0.28, roughness: 0.95, flatShading: true });
    const m = new THREE.Mesh(mergeGeometries(chunks.map((c) => c.toNonIndexed())), lipMat);
    m.castShadow = true;
    g.add(m);
  }
  if (rebar.length) {
    const rust = new THREE.MeshStandardMaterial({ color: 0x8a4a22, emissive: 0x8a4a22, emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.5 });
    g.add(new THREE.Mesh(mergeGeometries(rebar.map((c) => c.toNonIndexed())), rust));
  }

  // A few crumbs breaking off the chasm lips and shrinking into the dark
  const crumbs: { mesh: THREE.Mesh; t: number; speed: number; x: number; z: number; dx: number; dz: number }[] = [];
  const crumbGeo = new THREE.DodecahedronGeometry(0.13, 0);
  const crumbMat = new THREE.MeshStandardMaterial({ color: 0x5a524a, emissive: 0x3a342e, emissiveIntensity: 0.3, roughness: 1, flatShading: true });
  for (const [x, z] of crumbEdges.sort(() => rand() - 0.5).slice(0, 14)) {
    const mesh = new THREE.Mesh(crumbGeo, crumbMat);
    g.add(mesh);
    // Falls toward the nearest void centre
    const target = defs.filter((d) => d.kind === 'pit').reduce((p, d) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(p.x - x, p.z - z) ? d : p));
    const dl = Math.hypot(target.x - x, target.z - z) || 1;
    crumbs.push({ mesh, t: rand(), speed: 0.5 + rand() * 0.5, x, z, dx: (target.x - x) / dl, dz: (target.z - z) / dl });
  }

  return {
    group: g,
    update(elapsed: number, dt: number) {
      if (lavaMat?.map) {
        lavaMat.map.offset.set(Math.sin(elapsed * 0.13) * 0.2, elapsed * 0.04);
        const k = 0.85 + Math.sin(elapsed * 2.1) * 0.15;
        lavaMat.color.setRGB(k, k, k);
      }
      for (const c of crumbs) {
        c.t += dt * c.speed;
        if (c.t >= 1) c.t = 0;
        const t = c.t;
        c.mesh.position.set(c.x + c.dx * t * 1.6, 0.06 + (1 - t) * 0.08, c.z + c.dz * t * 1.6);
        c.mesh.scale.setScalar(Math.max(0.01, 1 - t));
        c.mesh.rotation.x = t * 6;
      }
    },
  };
}

/** Industrial wall: riveted steel plates on a concrete footing, hazard-striped cap. */
export function buildWall(w: WallDef): THREE.Group {
  const g = new THREE.Group();
  const H = 2.6;
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5e68, emissive: 0x5a5e68, emissiveIntensity: 0.3, roughness: 0.55, metalness: 0.6, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c32, emissive: 0x2a2c32, emissiveIntensity: 0.25, roughness: 0.7, metalness: 0.5, flatShading: true });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6a645c, emissive: 0x6a645c, emissiveIntensity: 0.22, roughness: 0.95, flatShading: true });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xc8902a, emissive: 0xc8902a, emissiveIntensity: 0.45, roughness: 0.6 });
  const W = w.halfW * 2;
  const D = w.halfD * 2;
  const along = W >= D;
  const len = along ? W : D;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  add(new THREE.BoxGeometry(W + 0.2, 0.35, D + 0.2), concrete, 0, 0.17, 0);
  add(new THREE.BoxGeometry(W, H, D), steel, 0, H / 2 + 0.3, 0);
  const n = Math.max(2, Math.round(len / 1.4));
  for (let i = 1; i < n; i++) {
    const t = -len / 2 + (len * i) / n;
    add(along ? new THREE.BoxGeometry(0.06, H, D + 0.04) : new THREE.BoxGeometry(W + 0.04, H, 0.06), dark, along ? t : 0, H / 2 + 0.3, along ? 0 : t);
  }
  const stripes = Math.max(4, Math.round(len / 0.5));
  for (let i = 0; i < stripes; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / stripes;
    const seg = len / stripes;
    add(along ? new THREE.BoxGeometry(seg, 0.14, D + 0.06) : new THREE.BoxGeometry(W + 0.06, 0.14, seg), i % 2 ? hazard : dark, along ? t : 0, H + 0.37, along ? 0 : t);
  }
  g.position.set(w.x, 0, w.z);
  return g;
}

/** Pushes a ground-bound circle out of every pit / lava region. */
export function pushOutOfHazards(x: number, z: number, r: number, hazards: readonly HazardDef[]): { x: number; z: number } {
  let rx = x;
  let rz = z;
  // Several passes: regions are made of touching cells
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const h of hazards) {
      if (h.hw !== undefined && h.hd !== undefined) {
        const hw = h.hw + r + 0.15;
        const hd = h.hd + r + 0.15;
        const dx = rx - h.x;
        const dz = rz - h.z;
        if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
          // Shove out through the nearest side that isn't open onto more hazard
          const opts: { d: number; x: number; z: number }[] = [];
          const o = h.open ?? '';
          if (!o.includes('e')) opts.push({ d: hw - dx, x: h.x + hw, z: rz });
          if (!o.includes('w')) opts.push({ d: hw + dx, x: h.x - hw, z: rz });
          if (!o.includes('s')) opts.push({ d: hd - dz, x: rx, z: h.z + hd });
          if (!o.includes('n')) opts.push({ d: hd + dz, x: rx, z: h.z - hd });
          if (!opts.length) opts.push({ d: 0, x: rx, z: rz });
          const best = opts.reduce((p, c) => (c.d < p.d ? c : p));
          rx = best.x;
          rz = best.z;
          moved = true;
        }
        continue;
      }
      const dx = rx - h.x;
      const dz = rz - h.z;
      const d = Math.hypot(dx, dz);
      const min = h.r + r + 0.15;
      if (d < min) {
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        rx = h.x + nx * min;
        rz = h.z + nz * min;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: rx, z: rz };
}

/**
 * The hazard the point is standing in (centre of mass inside, with a small forgiveness margin;
 * a negative margin grows the hazard). Open sides get no margin (the region carries on).
 */
export function hazardAt(x: number, z: number, hazards: readonly HazardDef[], margin = 0.35): HazardDef | null {
  for (const h of hazards) {
    if (h.hw !== undefined && h.hd !== undefined) {
      const o = h.open ?? '';
      const dx = x - h.x;
      const dz = z - h.z;
      const me = o.includes('e') ? Math.min(0, margin) : margin;
      const mw = o.includes('w') ? Math.min(0, margin) : margin;
      const ms = o.includes('s') ? Math.min(0, margin) : margin;
      const mn = o.includes('n') ? Math.min(0, margin) : margin;
      if (dx < h.hw - me && dx > -h.hw + mw && dz < h.hd - ms && dz > -h.hd + mn) return h;
    } else if (Math.hypot(x - h.x, z - h.z) < h.r - margin) return h;
  }
  return null;
}
