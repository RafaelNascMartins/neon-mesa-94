import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBlackSun } from './introCutscene';

/**
 * Everything around the crater that gameplay never shows: only the crater cutscene pulls the
 * camera far enough back to see it. The scorched plain rising into the crater's rim, the
 * shattered streets running off it (split slabs, potholes, burnt-out cars, bent lamp posts),
 * and in the back right a big city, completely destroyed — gutted towers with broken tops,
 * bare girders, collapsed blocks leaning on each other, fires and smoke columns.
 *
 * World coordinates (it's added straight to the scene). The arena floor is a disc of radius 95
 * at y = 0; the plain starts just inside it, a hair lower.
 */

let seed = 77123;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const rr = (a: number, b: number) => a + rand() * (b - a);

/** Plain height: flat arena, the crater wall climbing to the rim, then a scorched plateau. */
function groundY(x: number, z: number) {
  const r = Math.hypot(x, z);
  const rim = r < 96 ? 0 : r < 150 ? ((r - 96) / 54) ** 1.6 * 14 : 14 - Math.min(10, (r - 150) * 0.04);
  const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 2.2 + Math.sin(x * 0.051 + z * 0.037) * 0.6;
  return rim + (r < 110 ? 0 : n);
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2624';
  g.fillRect(0, 0, 32, 64);
  for (let y = 2; y < 64; y += 6) {
    for (let x = 2; x < 32; x += 5) {
      const k = rand();
      // mostly dark and blown out; a few windows still burning
      g.fillStyle = k < 0.07 ? '#ff7a2a' : k < 0.1 ? '#ffb04a' : k < 0.55 ? '#0c0a0a' : '#1a1716';
      g.fillRect(x, y, 3, 4);
    }
  }
  // soot streaks down the facade
  for (let i = 0; i < 10; i++) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(rand() * 32, rand() * 30, 2 + rand() * 3, 20 + rand() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Box placed in the world, rotated, with its UVs scaled so `tex` tiles at a fixed size. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale > 0) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const side = Math.abs(n.getX(i)) > 0.5 ? d : w;
      uv.setXY(i, uv.getX(i) * (side / uvScale), uv.getY(i) * (h / (uvScale * 2)));
    }
  }
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function buildCraterVista(): THREE.Group {
  seed = 77123;
  const root = new THREE.Group();
  root.name = 'crater_vista';

  // ── The scorched plain and the crater's wall
  const ground = new THREE.RingGeometry(92, 2600, 160, 40);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position as THREE.BufferAttribute;
  const cols: number[] = [];
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    gp.setY(i, groundY(x, z) - 0.06);
    const r = Math.hypot(x, z);
    const ash = rand();
    // charred black on the crater wall, ash grey and rust brown out on the plain
    const base = r < 150 ? [0.09, 0.07, 0.06] : ash < 0.3 ? [0.32, 0.29, 0.27] : ash < 0.65 ? [0.24, 0.16, 0.12] : [0.15, 0.11, 0.09];
    // dark: scorched earth at night (only the light grazes it)
    const k = (0.85 + rand() * 0.3) * 0.38;
    cols.push(base[0] * k, base[1] * k, base[2] * k);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  ground.computeVertexNormals();
  root.add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));

  const asphalt: THREE.BufferGeometry[] = [];
  const paint: THREE.BufferGeometry[] = [];
  const rust: THREE.BufferGeometry[] = [];
  const iron: THREE.BufferGeometry[] = [];
  const concrete: THREE.BufferGeometry[] = [];
  const facade: THREE.BufferGeometry[] = [];
  const fire: THREE.BufferGeometry[] = [];
  const smoke: THREE.BufferGeometry[] = [];

  // ── Streets: running out from the crater rim, split into slabs, some heaved up or sunk
  const street = (ax: number, az: number, bx: number, bz: number, width: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let t = 0;
    while (t < len) {
      const slab = rr(14, 34);
      const gap = rand() < 0.25 ? rr(2, 7) : 0.6;
      const cx = ax + dx * (t + slab / 2);
      const cz = az + dz * (t + slab / 2);
      const y = groundY(cx, cz) + 0.15;
      const heave = rand() < 0.2;
      asphalt.push(box(width, 0.5, slab, cx, y + (heave ? rr(0.5, 2) : 0), cz, heave ? rr(-0.12, 0.12) : 0, yaw + rr(-0.04, 0.04), heave ? rr(-0.08, 0.08) : 0));
      // broken lane dashes
      for (let s = 2; s < slab - 2; s += 6) if (rand() < 0.7) paint.push(box(0.5, 0.1, 3, cx + dx * (s - slab / 2), y + 0.3, cz + dz * (s - slab / 2), 0, yaw));
      // potholes / rubble on it
      if (rand() < 0.45) concrete.push(box(rr(1.5, 4), rr(0.8, 2.4), rr(1.5, 4), cx + rr(-width / 3, width / 3), y + 0.4, cz + rr(-4, 4), rr(-0.4, 0.4), rr(0, 3), rr(-0.4, 0.4)));
      // burnt-out cars, abandoned at angles
      if (rand() < 0.3) {
        const ox = cx + rr(-width / 3, width / 3);
        const oz = cz + rr(-5, 5);
        const cy = yaw + rr(-0.8, 0.8);
        rust.push(box(2.2, 1.1, 4.6, ox, y + 0.8, oz, 0, cy, rr(-0.06, 0.06)));
        rust.push(box(1.9, 0.8, 2.2, ox, y + 1.7, oz, 0, cy));
      }
      // bent lamp posts along the side
      if (rand() < 0.35) {
        const side = rand() < 0.5 ? -1 : 1;
        const lx = cx - dz * side * (width / 2 + 1.5);
        const lz = cz + dx * side * (width / 2 + 1.5);
        iron.push(box(0.35, 9, 0.35, lx, groundY(lx, lz) + 4.5, lz, rr(-0.5, 0.5), 0, rr(-0.5, 0.5)));
      }
      t += slab + gap;
    }
  };
  const streets: [number, number, number][] = [
    // [heading, start radius, end radius]
    [0.35, 150, 1700],
    [-0.5, 150, 1500],
    [1.25, 150, 1100],
    [2.4, 150, 1300],
    [-1.6, 150, 1200],
    [3.05, 150, 1000],
    [-2.5, 160, 900],
    [0.75, 160, 900],
  ];
  for (const [h, r0, r1] of streets) street(Math.sin(h) * r0, -Math.cos(h) * r0, Math.sin(h) * r1, -Math.cos(h) * r1, rr(12, 18));
  // a ring road round the crater, mostly gone
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    if (rand() < 0.4) continue;
    const r = 175;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    asphalt.push(box(14, 0.5, 22, cx, groundY(cx, cz) + 0.2, cz, rr(-0.05, 0.05), -a, rr(-0.05, 0.05)));
  }

  // ── The city, back right: a grid of blocks, every one of them wrecked
  // back right of the wide shot
  const CX = 1450;
  const CZ = -1000;
  for (let gx = -9; gx <= 9; gx++) {
    for (let gz = -7; gz <= 7; gz++) {
      if (rand() < 0.12) continue; // a flattened lot
      const bx = CX + gx * 46 + rr(-6, 6);
      const bz = CZ + gz * 46 + rr(-6, 6);
      const centre = 1 - Math.min(1, Math.hypot(gx, gz) / 10);
      const w = rr(18, 32);
      const d = rr(18, 32);
      const h = rr(22, 60) + centre * centre * rr(60, 200);
      const y0 = groundY(bx, bz);
      const kind = rand();
      if (kind < 0.12) {
        // bare skeleton: just the girders left
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) iron.push(box(1.4, h, 1.4, bx + (sx * w) / 2, y0 + h / 2, bz + (sz * d) / 2));
        for (let fy = 12; fy < h; fy += 12) if (rand() < 0.7) iron.push(box(w, 1, 1, bx, y0 + fy, bz + ((rand() < 0.5 ? -1 : 1) * d) / 2));
        continue;
      }
      if (kind < 0.24) {
        // collapsed: the lower half standing, the top slumped over against the next block
        const hh = h * 0.5;
        facade.push(box(w, hh, d, bx, y0 + hh / 2, bz, 0, 0, 0, 8));
        facade.push(box(w * 0.9, hh * 0.8, d * 0.9, bx + w * 0.3, y0 + hh * 0.9, bz, 0, rr(-0.2, 0.2), -rr(0.35, 0.7), 8));
        concrete.push(box(w * 1.3, rr(4, 9), d * 1.3, bx + w * 0.4, y0 + 2, bz + rr(-4, 4), 0, rr(0, 3), 0));
        continue;
      }
      // standing but gutted: a broken, jagged crown
      const lean = rand() < 0.2 ? rr(-0.12, 0.12) : 0;
      facade.push(box(w, h, d, bx, y0 + h / 2, bz, 0, 0, lean, 8));
      const chunks = 2 + Math.floor(rand() * 3);
      for (let c = 0; c < chunks; c++) {
        const cw = w * rr(0.25, 0.55);
        const ch = rr(4, 16);
        facade.push(box(cw, ch, d * rr(0.3, 0.7), bx + rr(-w / 3, w / 3), y0 + h + ch / 2 - 2, bz + rr(-d / 4, d / 4), 0, 0, rr(-0.3, 0.3), 8));
      }
      // rebar sticking out of the broken top
      for (let k = 0; k < 4; k++) iron.push(box(0.3, rr(3, 8), 0.3, bx + rr(-w / 2, w / 2), y0 + h + 2, bz + rr(-d / 2, d / 2), rr(-0.4, 0.4), 0, rr(-0.4, 0.4)));
      // a bite taken out of a corner
      if (rand() < 0.4) concrete.push(box(w * 0.5, rr(6, 14), d * 0.5, bx + w / 2, y0 + rr(4, h * 0.6), bz + d / 2, rr(0, 0.5), rr(0, 3), rr(0, 0.5)));
      // still burning up there
      if (rand() < 0.22) fire.push(box(rr(3, 8), rr(2, 5), rr(3, 8), bx + rr(-w / 3, w / 3), y0 + h + 1, bz + rr(-d / 3, d / 3)));
      // rubble at its feet
      concrete.push(box(rr(8, 16), rr(2, 5), rr(8, 16), bx + rr(-w, w), y0 + 1, bz + rr(-d, d), 0, rr(0, 3), 0));
    }
  }
  // smoke columns rising off the city and the plain
  for (let i = 0; i < 14; i++) {
    const city = i < 10;
    const sx = city ? CX + rr(-380, 380) : rr(-900, 900);
    const sz = city ? CZ + rr(-300, 300) : rr(-1000, 600);
    if (!city && Math.hypot(sx, sz) < 300) continue;
    const base = groundY(sx, sz) + (city ? rr(40, 120) : 0);
    for (let k = 0; k < 7; k++) {
      const s = new THREE.IcosahedronGeometry(rr(14, 22) + k * 7, 0);
      s.translate(sx + k * rr(4, 12), base + k * 26, sz + k * rr(-4, 4));
      smoke.push(s);
    }
  }
  // the crater's wall: broken pipes and boulders tumbling down it
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = rr(100, 160);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (rand() < 0.5) concrete.push(box(rr(3, 9), rr(2, 6), rr(3, 9), x, groundY(x, z) + 1, z, rr(0, 1), rr(0, 3), rr(0, 1)));
    else rust.push(box(1.6, 1.6, rr(10, 24), x, groundY(x, z) + 1, z, 0, rr(0, 3), rr(-0.2, 0.2)));
  }

  const winTex = windowTexture();
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!geos.length) return;
    const fixed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const m = new THREE.Mesh(mergeGeometries(fixed)!, mat);
    m.frustumCulled = false;
    root.add(m);
  };
  add(asphalt, new THREE.MeshStandardMaterial({ color: 0x2c2a2a, roughness: 0.95, flatShading: true }));
  add(paint, new THREE.MeshStandardMaterial({ color: 0x8a7a40, roughness: 0.9 }));
  add(rust, new THREE.MeshStandardMaterial({ color: 0x5a2e1a, roughness: 0.9, flatShading: true }));
  add(iron, new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.7, metalness: 0.4, flatShading: true }));
  add(concrete, new THREE.MeshStandardMaterial({ color: 0x5a5450, roughness: 1, flatShading: true }));
  add(facade, new THREE.MeshStandardMaterial({ map: winTex, color: 0xb8b0a8, roughness: 0.95, flatShading: true, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.22 }));
  add(fire, new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
  add(smoke, new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 1, flatShading: true, transparent: true, opacity: 0.72, depthWrite: false }));
  // The same black sun as over the Mustang's highway, low behind the Tree in the wide shot
  const sun = buildBlackSun(420);
  sun.group.name = 'vista_sun';
  sun.group.position.set(1500, 520, -3300);
  // its layers sit a hair apart in depth: from miles away they'd z-fight (two textures
  // flickering through each other), so they don't write depth and draw strictly in order
  let order = 1;
  sun.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m) return;
    (m as THREE.MeshBasicMaterial).fog = false;
    m.depthWrite = false;
    m.transparent = true;
    (o as THREE.Mesh).renderOrder = -10 + order++;
  });
  root.add(sun.group);
  root.visible = false;
  return root;
}
