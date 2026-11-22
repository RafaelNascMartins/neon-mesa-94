import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA_RADIUS, CEMETERY_GRAVE_POSITIONS, SECTOR_OBSTACLES, VM_DOOR_ANGLE } from './config';

/** True when an angle around the arena is in the slice behind VM's door (keep it clear). */
const nearVmDoor = (a: number) => Math.abs(Math.atan2(Math.sin(a - VM_DOOR_ANGLE), Math.cos(a - VM_DOOR_ANGLE))) < 0.4;
import type { ArenaZone } from './types';

/**
 * Non-colliding set dressing + ambient animation for every sector.
 *
 * Everything here is either flat on the ground / knee-high inside the arena, or outside the
 * arena radius, so it never changes gameplay or collision. Each sector's details are added to
 * that sector's existing decor group, so they inherit the engine's per-zone visibility toggling.
 */

export interface ZoneDetailTargets {
  road: THREE.Group;
  desert: THREE.Group;
  cemetery: THREE.Group;
  clearing: THREE.Group;
  treeMega: THREE.Group;
  treeWire: THREE.Group;
}

export interface ZoneDetails {
  update(dt: number, elapsed: number): void;
}

type Updater = (dt: number, elapsed: number) => void;

const _obj = new THREE.Object3D();
const _col = new THREE.Color();

/** Deterministic PRNG so the layout is identical every session. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isShown(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

interface InstanceSpec {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color?: number;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, specs: InstanceSpec[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, specs.length));
  specs.forEach((s, i) => {
    _obj.position.set(s.x, s.y, s.z);
    _obj.rotation.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
    _obj.scale.set(s.sx ?? 1, s.sy ?? 1, s.sz ?? 1);
    _obj.updateMatrix();
    mesh.setMatrixAt(i, _obj.matrix);
    if (s.color !== undefined) mesh.setColorAt(i, _col.setHex(s.color));
  });
  mesh.count = specs.length;
  mesh.computeBoundingSphere();
  return mesh;
}

function decalMaterial(hex: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Flat, ground-aligned unit plane (X = length, Z = width). */
function flatPlane(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Soft round alpha blob (fog patches, ground shadows). */
function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Picks positions inside the arena that keep clear of the sector's obstacles. */
function scatterFree(
  zone: ArenaZone,
  rand: () => number,
  count: number,
  opts: { clearance: number; minR?: number; maxR?: number; accept?: (x: number, z: number) => boolean }
): { x: number; z: number }[] {
  const obstacles = SECTOR_OBSTACLES[zone];
  const out: { x: number; z: number }[] = [];
  const minR = opts.minR ?? 0;
  const maxR = opts.maxR ?? ARENA_RADIUS - 1.5;
  for (let attempt = 0; attempt < count * 40 && out.length < count; attempt++) {
    const a = rand() * Math.PI * 2;
    const r = minR + Math.sqrt(rand()) * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (opts.accept && !opts.accept(x, z)) continue;
    let ok = true;
    for (const o of obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.radius + opts.clearance) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ x, z });
  }
  return out;
}

/** A chain of flat segments meandering across the ground (skids, cracks, fissures). */
function groundChain(
  rand: () => number,
  start: { x: number; z: number },
  heading: number,
  segs: number,
  segLen: number,
  width: number,
  wander: number,
  y: number
): InstanceSpec[] {
  const out: InstanceSpec[] = [];
  let x = start.x;
  let z = start.z;
  let a = heading;
  for (let i = 0; i < segs; i++) {
    const nx = x + Math.cos(a) * segLen;
    const nz = z + Math.sin(a) * segLen;
    out.push({ x: (x + nx) / 2, y, z: (z + nz) / 2, ry: -a, sx: segLen * 1.08, sz: width * (1 - (i / segs) * 0.6) });
    x = nx;
    z = nz;
    a += (rand() - 0.5) * wander;
  }
  return out;
}

/** Cube outline built from 12 thin bars (survives the low-res dither pass, unlike 1px lines). */
function cubeFrameGeometry(size: number, bar: number): THREE.BufferGeometry {
  const h = size / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const a of [-h, h]) {
    for (const b of [-h, h]) {
      parts.push(new THREE.BoxGeometry(size + bar, bar, bar).translate(0, a, b));
      parts.push(new THREE.BoxGeometry(bar, size + bar, bar).translate(a, 0, b));
      parts.push(new THREE.BoxGeometry(bar, bar, size + bar).translate(a, b, 0));
    }
  }
  return mergeGeometries(parts)!;
}

// ───────────────────────────────────────── ROAD ─────────────────────────────────────────

function buildRoad(group: THREE.Group, rand: () => number): Updater {
  const ASPHALT_HALF = 7.25;

  // Skid marks & oil stains on the asphalt
  const skidSpecs: InstanceSpec[] = [];
  for (const [sx, sz, heading] of [
    [-16, -3.5, 0.08],
    [2, 2.4, -0.12],
    [13, -1.5, 0.3],
  ]) {
    const along = groundChain(rand, { x: sx, z: sz }, heading, 12, 0.8, 0.28, 0.12, 0.035);
    skidSpecs.push(...along);
    // Parallel second tyre
    const px = -Math.sin(heading) * 1.5;
    const pz = Math.cos(heading) * 1.5;
    skidSpecs.push(...along.map((s) => ({ ...s, x: s.x + px, z: s.z + pz })));
  }
  group.add(instanced(flatPlane(), decalMaterial(0x0a0607, 0.45), skidSpecs));

  const stainSpecs: InstanceSpec[] = [];
  for (let i = 0; i < 7; i++) {
    stainSpecs.push({
      x: -22 + rand() * 44,
      y: 0.033,
      z: (rand() - 0.5) * ASPHALT_HALF * 1.6,
      ry: rand() * Math.PI,
      sx: 0.8 + rand() * 1.8,
      sz: 0.6 + rand() * 1.1,
    });
  }
  const stainGeo = new THREE.CircleGeometry(0.5, 10);
  stainGeo.rotateX(-Math.PI / 2);
  group.add(instanced(stainGeo, decalMaterial(0x050304, 0.5), stainSpecs));

  // Dry grass tufts & pebbles on the shoulders
  const offRoad = (_x: number, z: number) => Math.abs(z) > ASPHALT_HALF + 0.6;
  const tuftSpecs: InstanceSpec[] = [];
  for (const c of scatterFree('road', rand, 34, { clearance: 1.2, accept: offRoad })) {
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      tuftSpecs.push({
        x: c.x + (rand() - 0.5) * 1.1,
        y: 0.2,
        z: c.z + (rand() - 0.5) * 1.1,
        rx: (rand() - 0.5) * 0.5,
        rz: (rand() - 0.5) * 0.5,
        ry: rand() * Math.PI,
        sy: 0.6 + rand() * 0.8,
        color: [0x6b5a2a, 0x7d6b33, 0x4f4a22, 0x8a6f3a][Math.floor(rand() * 4)],
      });
    }
  }
  group.add(
    instanced(new THREE.ConeGeometry(0.1, 0.55, 4), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), tuftSpecs)
  );

  const pebbleSpecs: InstanceSpec[] = scatterFree('road', rand, 70, { clearance: 0.8, accept: offRoad }).map((p) => ({
    x: p.x,
    y: 0.06,
    z: p.z,
    ry: rand() * 6,
    rx: rand() * 6,
    sx: 0.6 + rand(),
    sy: 0.4 + rand() * 0.5,
    sz: 0.6 + rand(),
    color: [0x3a2a26, 0x51372d, 0x2a1d1c][Math.floor(rand() * 3)],
  }));
  group.add(
    instanced(new THREE.DodecahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), pebbleSpecs)
  );

  // Roadside motel billboard beyond the north edge
  const board = new THREE.Group();
  board.position.set(13, 0, -38);
  board.rotation.y = -0.18;
  const steel = new THREE.MeshStandardMaterial({ color: 0x23201f, roughness: 0.7, metalness: 0.6 });
  for (const px of [-3.4, 3.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8, 0.35), steel);
    post.position.set(px, 4, 0);
    board.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.6, 0.3), steel);
  frame.position.set(0, 9.6, 0);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.12, 0.9), steel);
  walk.position.set(0, 7.7, 0.4);
  board.add(frame, walk);

  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 200;
  const sctx = signCanvas.getContext('2d')!;
  sctx.fillStyle = '#120708';
  sctx.fillRect(0, 0, 512, 200);
  sctx.textAlign = 'center';
  sctx.font = 'bold 92px monospace';
  sctx.fillStyle = '#ff3b6b';
  sctx.fillText('MOTEL', 256, 104);
  sctx.font = 'bold 40px monospace';
  sctx.fillStyle = '#2ee6d6';
  sctx.fillText('NO VACANCY', 256, 168);
  sctx.strokeStyle = '#ffb020';
  sctx.lineWidth = 6;
  sctx.strokeRect(10, 10, 492, 180);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 3.3), signMat);
  face.position.set(0, 9.6, 0.16);
  board.add(face);
  group.add(board);

  // Burnt-out car & cones on the western shoulder (outside the arena)
  const char = new THREE.MeshStandardMaterial({ color: 0x1d1514, roughness: 0.95, metalness: 0.25 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5a2a18, roughness: 0.9, metalness: 0.3 });
  const car = new THREE.Group();
  car.position.set(-37, 0, 2.5);
  car.rotation.set(0, 0.6, 0.12);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 2.0), char);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 1.8), rust);
  cabin.position.set(-0.3, 1.2, 0);
  car.add(body, cabin);
  group.add(car);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1a, roughness: 0.7 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.7 });
  for (const [cx, cz, tilt] of [
    [-31.5, 4.5, 0],
    [-32.6, 6.4, 1.3],
    [-30.8, -5.5, 0],
  ]) {
    const cone = new THREE.Group();
    cone.position.set(cx, 0, cz);
    cone.rotation.z = tilt;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 8), coneMat);
    c.position.y = tilt ? 0.28 : 0.38;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 8), bandMat);
    band.position.y = c.position.y + 0.05;
    cone.add(c, band);
    group.add(cone);
  }

  // Tumbleweeds rolling across with the wind (knocked aside by the intro car, see tumbleweedRepel)
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, wireframe: true });
  const weedCore = new THREE.MeshStandardMaterial({ color: 0x4f3a1f, roughness: 1, flatShading: true });
  const weeds = Array.from({ length: 4 }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), weedMat));
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 0), weedCore));
    const state = { x: -34 + i * 17, z: (rand() - 0.5) * 44, speed: 3 + rand() * 2.5, phase: rand() * 6, kickVz: 0, kickY: 0, kickVy: 0 };
    group.add(g);
    return { g, state };
  });

  return (dt, elapsed) => {
    if (!isShown(group)) return;
    for (const { g, state } of weeds) {
      state.x += state.speed * dt;
      state.phase += dt * state.speed * 1.6;
      if (state.x > 34) {
        state.x = -34;
        state.z = (rand() - 0.5) * 44;
        state.speed = 3 + rand() * 2.5;
      }
      // Something big (the intro car) ploughing through: the weed is flung aside instead of clipped
      if (tumbleweedRepel.active) {
        const dx = state.x - tumbleweedRepel.x;
        const dz = state.z - tumbleweedRepel.z;
        const d = Math.hypot(dx, dz);
        if (d < tumbleweedRepel.r) {
          const side = dz >= 0 ? 1 : -1;
          state.z = tumbleweedRepel.z + side * tumbleweedRepel.r;
          state.kickVz = side * (9 + rand() * 5);
          state.kickVy = 6 + rand() * 3;
        }
      }
      if (state.kickVy !== 0 || state.kickY > 0) {
        state.kickVy -= 22 * dt;
        state.kickY = Math.max(0, state.kickY + state.kickVy * dt);
        if (state.kickY === 0) state.kickVy = 0;
      }
      state.z += state.kickVz * dt;
      state.kickVz *= Math.max(0, 1 - dt * 2.5);
      g.position.set(state.x, 0.5 + state.kickY + Math.abs(Math.sin(state.phase)) * 0.55, state.z + Math.sin(state.phase * 0.3) * 0.6);
      g.rotation.z -= (state.speed * dt) / 0.5;
    }
    // Faulty neon: occasional flicker
    const flick = Math.sin(elapsed * 23) * Math.sin(elapsed * 7.3) > 0.82 ? 0.35 : 1;
    signMat.color.setScalar(flick);
  };
}

/** Set by the intro cutscene each frame: tumbleweeds inside this circle get flung out of the way. */
export const tumbleweedRepel = { active: false, x: 0, z: 0, r: 0 };

// ───────────────────────────────────────── DESERT ─────────────────────────────────────────

function buildCattleSkull(bone: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.42), bone);
  cranium.position.y = 0.14;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.55), bone);
  snout.position.set(0, 0.1, 0.42);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x120a08 });
  for (const ex of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), eyeMat);
    eye.position.set(ex, 0.2, 0.2);
    g.add(eye);
  }
  for (const side of [-1, 1]) {
    const hornA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 5), bone);
    hornA.rotation.z = (side * Math.PI) / 2.4;
    hornA.position.set(side * 0.42, 0.2, -0.05);
    const hornB = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.3, 5), bone);
    hornB.rotation.z = side * -0.35;
    hornB.position.set(side * 0.66, 0.38, -0.05);
    g.add(hornA, hornB);
  }
  g.add(cranium, snout);
  return g;
}

function buildDesert(group: THREE.Group, rand: () => number, shadowTex: THREE.Texture): Updater {
  // Low wind-carved dunes on the horizon (outside the arena)
  const duneSpecs: InstanceSpec[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = ARENA_RADIUS + 5 + rand() * 14;
    duneSpecs.push({
      x: Math.cos(a) * r,
      y: -0.2,
      z: Math.sin(a) * r,
      ry: rand() * Math.PI,
      sx: 6 + rand() * 6,
      sy: 0.9 + rand() * 1.3,
      sz: 3.5 + rand() * 4,
      color: [0xb07a45, 0x9a6638, 0xc48a52][Math.floor(rand() * 3)],
    });
  }
  group.add(
    instanced(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), duneSpecs)
  );

  // Sun-baked cracks
  const crackSpecs: InstanceSpec[] = [];
  for (const p of scatterFree('desert', rand, 18, { clearance: 1 })) {
    crackSpecs.push(...groundChain(rand, p, rand() * Math.PI * 2, 5 + Math.floor(rand() * 4), 0.7, 0.07, 1.4, 0.03));
  }
  group.add(instanced(flatPlane(), decalMaterial(0x2a160c, 0.6), crackSpecs));

  // Cattle skulls & scattered bones
  const bone = new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.9 });
  for (const p of scatterFree('desert', rand, 3, { clearance: 2, minR: 6 })) {
    const skull = buildCattleSkull(bone);
    skull.position.set(p.x, 0, p.z);
    skull.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
    group.add(skull);
  }
  const boneSpecs: InstanceSpec[] = scatterFree('desert', rand, 16, { clearance: 1 }).map((p) => ({
    x: p.x,
    y: 0.05,
    z: p.z,
    rz: Math.PI / 2,
    ry: rand() * Math.PI,
    sy: 0.6 + rand() * 0.8,
  }));
  group.add(instanced(new THREE.CylinderGeometry(0.045, 0.05, 0.6, 5), bone, boneSpecs));

  // Circling vultures (with a soft shadow sweeping the sand)
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 1 });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const birds = Array.from({ length: 3 }, (_, i) => {
    const g = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.7), birdMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.18), birdMat);
    head.position.set(0, 0.04, 0.42);
    const wings: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.x = side * 0.1;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.42), birdMat);
      wing.position.x = side * 0.65;
      pivot.add(wing);
      g.add(pivot);
      wings.push(pivot);
    }
    g.add(bodyM, head);
    group.add(g);
    const shadowGeo = new THREE.PlaneGeometry(2.2, 1.2);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.04;
    group.add(shadow);
    return {
      g,
      wings,
      shadow,
      cx: (rand() - 0.5) * 20,
      cz: -10 + (rand() - 0.5) * 16,
      r: 7 + rand() * 7,
      h: 12 + i * 1.6,
      speed: (0.22 + rand() * 0.12) * (i % 2 === 0 ? 1 : -1),
      ang: rand() * Math.PI * 2,
    };
  });

  return (dt, elapsed) => {
    if (!isShown(group)) return;
    for (const b of birds) {
      b.ang += b.speed * dt;
      const x = b.cx + Math.cos(b.ang) * b.r;
      const z = b.cz + Math.sin(b.ang) * b.r;
      b.g.position.set(x, b.h + Math.sin(elapsed * 0.7 + b.r) * 0.4, z);
      const dir = Math.sign(b.speed);
      // Model faces +Z; point it along the orbit tangent and bank into the turn
      b.g.rotation.set(0, Math.atan2(-Math.sin(b.ang) * dir, Math.cos(b.ang) * dir), -0.28 * dir);
      // Glide, with an occasional burst of flaps
      const flapping = Math.sin(elapsed * 0.5 + b.r) > 0.75;
      const flap = flapping ? Math.sin(elapsed * 11) * 0.5 : 0.12;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
      b.shadow.position.set(x + 2, 0.04, z + 2.5);
      b.shadow.rotation.y = b.g.rotation.y;
    }
  };
}

// ───────────────────────────────────────── CEMETERY ─────────────────────────────────────────

function buildDeadTree(rand: () => number, mat: THREE.Material, height: number): THREE.Group {
  const root = new THREE.Group();
  const grow = (parent: THREE.Object3D, len: number, radius: number, depth: number) => {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius, len, 5), mat);
    seg.position.y = len / 2;
    parent.add(seg);
    if (depth <= 0) return;
    const kids = depth === 3 ? 3 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < kids; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = len * (0.62 + rand() * 0.36);
      pivot.rotation.set((rand() - 0.5) * 1.5, rand() * Math.PI * 2, 0.45 + rand() * 0.6);
      parent.add(pivot);
      grow(pivot, len * (0.5 + rand() * 0.2), radius * 0.58, depth - 1);
    }
  };
  grow(root, height * 0.45, height * 0.06, 3);
  root.rotation.z = (rand() - 0.5) * 0.2;
  return root;
}

function buildCemetery(group: THREE.Group, rand: () => number, fogTex: THREE.Texture, lowSpec: boolean): Updater {
  // Wrought-iron fence just outside the arena, open to the north
  const FENCE_R = ARENA_RADIUS + 0.7;
  const GAP = 0.34;
  const iron = new THREE.MeshStandardMaterial({ color: 0x1b1622, metalness: 0.7, roughness: 0.5 });
  const barSpecs: InstanceSpec[] = [];
  const tipSpecs: InstanceSpec[] = [];
  const BAR_COUNT = 300;
  for (let i = 0; i < BAR_COUNT; i++) {
    const a = (i / BAR_COUNT) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < GAP) continue;
    const x = Math.cos(a) * FENCE_R;
    const z = Math.sin(a) * FENCE_R;
    const lean = (rand() - 0.5) * 0.08;
    barSpecs.push({ x, y: 0.78, z, rz: lean });
    tipSpecs.push({ x: x - lean * 0.8, y: 1.66, z });
  }
  group.add(instanced(new THREE.BoxGeometry(0.07, 1.56, 0.07), iron, barSpecs));
  group.add(instanced(new THREE.ConeGeometry(0.08, 0.22, 4), iron, tipSpecs));
  for (const y of [0.35, 1.42]) {
    const rail = new THREE.TorusGeometry(FENCE_R, 0.045, 4, 160, Math.PI * 2 - GAP * 2);
    rail.rotateX(Math.PI / 2);
    rail.rotateY(Math.PI / 2 - GAP);
    const railMesh = new THREE.Mesh(rail, iron);
    railMesh.position.y = y;
    group.add(railMesh);
  }

  // Dead, twisted trees silhouetted in the fog
  const bark = new THREE.MeshStandardMaterial({ color: 0x1c1218, roughness: 1, flatShading: true });
  const treeAngles = [-2.7, -2.2, -1.85, -1.25, -0.9, -0.4, 0.1, 2.95];
  treeAngles.forEach((a) => {
    const r = ARENA_RADIUS + 4 + rand() * 8;
    const tree = buildDeadTree(rand, bark, 7 + rand() * 5);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rand() * Math.PI * 2;
    group.add(tree);
  });

  // Broken headstone fragments
  const fragSpecs: InstanceSpec[] = scatterFree('cemetery', rand, 22, { clearance: 1.1, accept: (x) => Math.abs(x) > 3 }).map(
    (p) => ({
      x: p.x,
      y: 0.07,
      z: p.z,
      ry: rand() * Math.PI,
      rx: (rand() - 0.5) * 0.3,
      sx: 0.5 + rand() * 0.6,
      sz: 0.3 + rand() * 0.5,
      color: [0x4a4250, 0x3a3340, 0x5a5160][Math.floor(rand() * 3)],
    })
  );
  group.add(instanced(new THREE.BoxGeometry(0.6, 0.14, 0.45), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), fragSpecs));

  // Candles flickering beside the graves
  const wax = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const flames: THREE.Mesh[] = [];
  const candleGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
  const flameGeo = new THREE.OctahedronGeometry(0.075, 0);
  for (const g of CEMETERY_GRAVE_POSITIONS) {
    const cos = Math.cos(g.yaw);
    const sin = Math.sin(g.yaw);
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const lx = (k % 2 === 0 ? 1 : -1) * (1.1 + rand() * 0.25);
      const lz = (rand() - 0.5) * 0.9;
      const x = g.x + lx * cos + lz * sin;
      const z = g.z - lx * sin + lz * cos;
      const h = 0.16 + rand() * 0.2;
      const candle = new THREE.Mesh(candleGeo, wax);
      candle.scale.y = h;
      candle.position.set(x, h / 2, z);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, h + 0.1, z);
      flame.userData.seed = rand() * 100;
      group.add(candle, flame);
      flames.push(flame);
    }
  }

  // Low ground fog patches drifting between the graves
  const fogMat = new THREE.MeshBasicMaterial({ map: fogTex, color: 0x9fd8d0, transparent: true, opacity: 0.15, depthWrite: false });
  const fogGeo = new THREE.PlaneGeometry(13, 13);
  fogGeo.rotateX(-Math.PI / 2);
  const fogs = Array.from({ length: lowSpec ? 5 : 10 }, (_, i) => {
    const m = new THREE.Mesh(fogGeo, fogMat);
    m.renderOrder = 2;
    group.add(m);
    return { m, cx: (rand() - 0.5) * 36, cz: (rand() - 0.5) * 36, r: 2 + rand() * 4, speed: 0.04 + rand() * 0.06, y: 0.3 + i * 0.035, phase: rand() * 6 };
  });

  return (_dt, elapsed) => {
    if (!isShown(group)) return;
    for (const f of flames) {
      const s = f.userData.seed as number;
      const flick = 0.75 + Math.sin(elapsed * 13 + s) * 0.15 + Math.sin(elapsed * 31 + s * 2) * 0.1;
      f.scale.set(flick, 1.3 + flick * 0.6, flick);
    }
    for (const f of fogs) {
      const a = elapsed * f.speed + f.phase;
      f.m.position.set(f.cx + Math.cos(a) * f.r, f.y, f.cz + Math.sin(a) * f.r);
      f.m.rotation.y = a * 0.5;
    }
  };
}

// ───────────────────────────────────────── CLEARING ─────────────────────────────────────────

function buildExcavator(): THREE.Group {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0x9a7420, roughness: 0.75, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: 0.9, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x14202a, roughness: 0.3, metalness: 0.6 });
  for (const tz of [-1.1, 1.1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.9), dark);
    track.position.set(0, 0.45, tz);
    g.add(track);
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 2.5), yellow);
  body.position.set(-0.3, 1.65, 0);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 2.5), dark);
  counter.position.set(-2.1, 1.55, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 1.2), yellow);
  cab.position.set(0.7, 3.0, 0.6);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.0), glass);
  win.position.set(1.38, 3.05, 0.6);
  g.add(body, counter, cab, win);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(1.0, 2.2, -0.4);
  boomPivot.rotation.z = 0.75;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 0.45), yellow);
  boom.position.x = 2.2;
  boomPivot.add(boom);
  const stickPivot = new THREE.Group();
  stickPivot.position.x = 4.3;
  stickPivot.rotation.z = -2.0;
  const stick = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.36, 0.36), yellow);
  stick.position.x = 1.5;
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), dark);
  bucket.position.set(3.1, -0.15, 0);
  stickPivot.add(stick, bucket);
  boomPivot.add(stickPivot);
  g.add(boomPivot);
  return g;
}

function buildClearing(group: THREE.Group, rand: () => number, lowSpec: boolean): Updater {
  // Glowing fissures cracking out from the crater
  const charSpecs: InstanceSpec[] = [];
  const glowSpecs: InstanceSpec[] = [];
  for (let i = 0; i < 9; i++) {
    const heading = Math.PI / 2 + (rand() - 0.5) * 2.4; // fanning south from the crater
    const start = { x: (rand() - 0.5) * 12, z: -16 + rand() * 3 };
    const chain = groundChain(rand, start, heading, 6 + Math.floor(rand() * 5), 1.1, 0.16, 0.9, 0.032);
    glowSpecs.push(...chain);
    charSpecs.push(...chain.map((s) => ({ ...s, y: 0.028, sz: (s.sz ?? 0.16) * 3.2 })));
  }
  group.add(instanced(flatPlane(), decalMaterial(0x140405, 0.75), charSpecs));
  const fissureMat = decalMaterial(0xff5a1a, 0.95);
  group.add(instanced(flatPlane(), fissureMat, glowSpecs));

  // Wood chips around the stumps
  const chipSpecs: InstanceSpec[] = scatterFree('clearing', rand, 70, { clearance: 0.4 }).map((p) => ({
    x: p.x,
    y: 0.03,
    z: p.z,
    ry: rand() * Math.PI,
    sx: 0.6 + rand() * 0.8,
    color: [0xa87443, 0x8a5a30, 0xc48a52][Math.floor(rand() * 3)],
  }));
  group.add(instanced(new THREE.BoxGeometry(0.22, 0.04, 0.1), new THREE.MeshStandardMaterial({ roughness: 1 }), chipSpecs));

  // Felled logs stacked beyond the arena edge (bark sides, sawn faces)
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x3d2414, roughness: 1, flatShading: true });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI + (i / 9) * Math.PI * 1.15 - 0.1;
    const r = ARENA_RADIUS + 2.5 + rand() * 5;
    const len = 4 + rand() * 4;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, len, 8), [barkMat, ringMat, ringMat]);
    log.rotation.set(0, rand() * Math.PI, Math.PI / 2);
    log.position.set(Math.cos(a) * r, 0.48, Math.sin(a) * r);
    group.add(log);
    if (i % 3 === 0) {
      const top = log.clone();
      top.position.y = 1.35;
      top.position.x += 0.3;
      top.rotation.y += 0.15;
      group.add(top);
    }
  }

  // Abandoned excavator that did the clear-cutting
  const exc = buildExcavator();
  exc.position.set(-35, 0, -9);
  exc.rotation.y = -0.35;
  group.add(exc);

  // Smoke pouring from the smokestacks (matches the stacks built by the engine)
  const stacks: [number, number, number][] = [
    [-21, -41, 21.3],
    [-14, -44, 17.3],
    [15, -43, 19.3],
    [23, -39, 23.3],
  ];
  const PUFFS = lowSpec ? 5 : 10;
  const smoke = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x2a2224, roughness: 1, flatShading: true }),
    stacks.length * PUFFS
  );
  smoke.frustumCulled = false;
  group.add(smoke);
  const LIFE = 7;

  return (_dt, elapsed) => {
    if (!isShown(group)) return;
    const pulse = 0.65 + Math.sin(elapsed * 2.1) * 0.2 + Math.sin(elapsed * 5.3) * 0.1;
    fissureMat.color.setRGB(1, 0.35 * pulse + 0.05, 0.1 * pulse);
    let idx = 0;
    stacks.forEach(([sx, sz, top], si) => {
      for (let p = 0; p < PUFFS; p++) {
        const u = ((elapsed + (p / PUFFS) * LIFE + si * 1.7) % LIFE) / LIFE;
        const fade = u > 0.75 ? (1 - u) / 0.25 : 1;
        const s = (0.7 + u * 2.6) * fade;
        _obj.position.set(sx + u * 5 + Math.sin(u * 6 + p) * 0.6, top + u * 15, sz + Math.cos(u * 5 + p) * 0.5);
        _obj.rotation.set(u * 2 + p, u * 3, 0);
        _obj.scale.setScalar(Math.max(0.001, s));
        _obj.updateMatrix();
        smoke.setMatrixAt(idx++, _obj.matrix);
      }
    });
    smoke.instanceMatrix.needsUpdate = true;
  };
}

// ───────────────────────────────────────── TREE · MEGASTRUCTURE ─────────────────────────────────────────

function buildTreeMega(group: THREE.Group, rand: () => number, lowSpec: boolean): Updater {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2626, metalness: 0.72, roughness: 0.55 });
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x141213, metalness: 0.6, roughness: 0.7 });

  // Floor grates with intermittent steam vents near the arena edge
  const VENT_R = ARENA_RADIUS - 3.5;
  const ventAngles = [-2.6, -1.95, -1.15, -0.55, 0.25, 2.9];
  const vents = ventAngles.map((a) => ({ x: Math.cos(a) * VENT_R, z: Math.sin(a) * VENT_R }));
  for (const v of vents) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 1.8), grateMat);
    grate.position.set(v.x, 0.03, v.z);
    group.add(grate);
    for (let s = -2; s <= 2; s++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.1), steel);
      slat.position.set(v.x, 0.05, v.z + s * 0.32);
      group.add(slat);
    }
  }
  const STEAM = lowSpec ? 4 : 7;
  const steam = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xb8b0a8, roughness: 1, flatShading: true }),
    vents.length * STEAM
  );
  steam.frustumCulled = false;
  group.add(steam);

  // Blinking warning beacons on posts around the perimeter
  const lampOn = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const lampOff = new THREE.MeshBasicMaterial({ color: 0x3a0a08 });
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI + (i / 9) * Math.PI * 1.3 - 0.15;
    if (nearVmDoor(a)) continue;
    const r = ARENA_RADIUS + 1.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4, 0.28), steel);
    post.position.set(Math.cos(a) * r, 2, Math.sin(a) * r);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), lampOn);
    lamp.position.set(post.position.x, 4.15, post.position.z);
    lamp.userData.phase = i * 0.37;
    group.add(post, lamp);
    lamps.push(lamp);
  }

  // Cables & hooks hanging from the north overhead pipe (kept off the central sightline)
  const cables: THREE.Group[] = [];
  for (const cx of [-27, -21, -15, -9, 9, 15, 21, 27]) {
    const pivot = new THREE.Group();
    pivot.position.set(cx + (rand() - 0.5) * 2, 14.5, -31);
    const len = 3 + rand() * 4;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 4), grateMat);
    cable.position.y = -len / 2;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 4, 8, Math.PI * 1.4), steel);
    hook.position.y = -len - 0.15;
    pivot.add(cable, hook);
    pivot.userData.phase = rand() * 6;
    group.add(pivot);
    cables.push(pivot);
  }

  const STEAM_LIFE = 2.4;
  return (_dt, elapsed) => {
    if (!isShown(group)) return;
    let idx = 0;
    vents.forEach((v, vi) => {
      const active = Math.sin(elapsed * 0.6 + vi * 1.9) > -0.1;
      for (let p = 0; p < STEAM; p++) {
        const u = ((elapsed + (p / STEAM) * STEAM_LIFE + vi) % STEAM_LIFE) / STEAM_LIFE;
        const s = active ? (0.4 + u * 1.6) * (u > 0.7 ? (1 - u) / 0.3 : 1) : 0.001;
        _obj.position.set(v.x + Math.sin(u * 7 + p) * 0.3, 0.2 + u * 4.5, v.z + Math.cos(u * 6 + p) * 0.3);
        _obj.rotation.set(p, u * 2, 0);
        _obj.scale.setScalar(Math.max(0.001, s));
        _obj.updateMatrix();
        steam.setMatrixAt(idx++, _obj.matrix);
      }
    });
    steam.instanceMatrix.needsUpdate = true;
    for (const l of lamps) {
      l.material = Math.sin(elapsed * 4 + (l.userData.phase as number) * 6) > 0.2 ? lampOn : lampOff;
    }
    for (const c of cables) {
      c.rotation.z = Math.sin(elapsed * 0.8 + (c.userData.phase as number)) * 0.05;
    }
  };
}

// ───────────────────────────────────────── TREE · WIREFRAME ─────────────────────────────────────────

function buildTreeWire(group: THREE.Group, rand: () => number): Updater {
  const palette = [0xff1e8a, 0x00f5ff, 0xffd166];

  // Floating holographic cube frames around the edge
  const cubes = Array.from({ length: 12 }, (_, i) => {
    const size = 1.2 + rand() * 1.8;
    const mesh = new THREE.Mesh(cubeFrameGeometry(size, 0.09), new THREE.MeshBasicMaterial({ color: palette[i % 3] }));
    const a = -Math.PI + (i / 11) * Math.PI * 1.25 - 0.12;
    const r = ARENA_RADIUS - 2 + rand() * 9;
    const y = 3 + rand() * 7;
    mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    mesh.visible = !nearVmDoor(a);
    group.add(mesh);
    return { mesh, y, spin: 0.2 + rand() * 0.5, phase: rand() * 6 };
  });

  // Vertical light beams rising into the dark
  const beams = Array.from({ length: 10 }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: palette[i % 3], transparent: true, opacity: 0.4, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 40, 0.22), mat);
    const a = -Math.PI + (i / 9) * Math.PI * 1.2 - 0.1;
    const r = ARENA_RADIUS + 4 + rand() * 9;
    beam.position.set(Math.cos(a) * r, 20, Math.sin(a) * r);
    beam.visible = !nearVmDoor(a);
    group.add(beam);
    return { mat, phase: rand() * 6 };
  });

  return (_dt, elapsed) => {
    if (!isShown(group)) return;
    for (const c of cubes) {
      c.mesh.rotation.set(elapsed * c.spin, elapsed * c.spin * 1.3, 0);
      c.mesh.position.y = c.y + Math.sin(elapsed * 0.9 + c.phase) * 0.6;
    }
    for (const b of beams) {
      b.mat.opacity = 0.22 + (Math.sin(elapsed * 1.7 + b.phase) * 0.5 + 0.5) * 0.35;
    }
  };
}

// ───────────────────────────────────────── Entry point ─────────────────────────────────────────

export function buildZoneDetails(targets: ZoneDetailTargets, opts: { lowSpec: boolean }): ZoneDetails {
  const rand = makeRng(0x94e5a);
  const blobTex = radialTexture();
  const updaters: Updater[] = [
    buildRoad(targets.road, rand),
    buildDesert(targets.desert, rand, blobTex),
    buildCemetery(targets.cemetery, rand, blobTex, opts.lowSpec),
    buildClearing(targets.clearing, rand, opts.lowSpec),
    buildTreeMega(targets.treeMega, rand, opts.lowSpec),
    buildTreeWire(targets.treeWire, rand),
  ];
  return {
    update(dt, elapsed) {
      for (const u of updaters) u(dt, elapsed);
    },
  };
}
