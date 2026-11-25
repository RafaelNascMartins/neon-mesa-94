import * as THREE from 'three';
import { cloneModelWithUniqueMaterials, createHighwayStripTexture, type LoadedGlbAssets } from './assets';
import { synthAudio, type EndingClip } from './audio';
import type { CombatFx } from './combatFx';
import { tumbleweedRepel } from './zoneDetails';

/**
 * Opening cutscene (first run of the session):
 *   1. Low tracking shot on a lone desert highway far outside the arena, under a black sun:
 *      a black muscle car tears past and runs over three bandits (the last one in slow
 *      motion), then leaves frame.
 *   2. Cut to black.
 *   3. Fade in: the car comes back, brakes into a 90° drift (smoke + skid marks) and stops.
 *   4. The driver kicks the door open (screen shake) and steps out → gameplay starts.
 * Skippable at any time; `finish()` always leaves the world in the final parked state.
 */

export interface IntroHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  fx: CombatFx;
  assets: LoadedGlbAssets;
  hero: THREE.Object3D;
  setFade(alpha: number): void;
  setLetterbox(amount: number): void;
  slowMo(duration: number): void;
}

/** Uniform scale of the Mustang model (the primitives are authored at 1×). */
const CAR_SCALE = 1.4;

/** Final parked pose: car faces +Z (south), driver door on its east (+X) side. */
export const INTRO_PARKED_CAR = { x: -21.4, z: 0, halfW: 1.05 * CAR_SCALE, halfD: 2.4 * CAR_SCALE };
export const INTRO_PLAYER_START = { x: -18.2, z: 0.3, yaw: Math.PI / 2 };

// Shot 1 happens on its own set, far south of the arena (fog hides each from the other)
const SET_Z = 420;
const LANE_Z = 2.2; // drift shot lane offset in the arena
const PASS_LANE_Z = SET_Z + 2.2; // pass shot lane on the outside highway
const PASS_SPEED = 32;
const PASS_START_X = -64;
const DRIFT_START_X = -66;
const DRIFT_START_Z = 0.8;

// Timeline (seconds of cutscene time)
const T = {
  fadeOutStart: 3.9,
  fadeOutEnd: 4.4,
  swap: 4.55,
  driftStart: 4.75,
  fadeInStart: 5.0,
  fadeInEnd: 5.5,
  driftEnd: 6.95,
  kick: 7.45,
  walkEnd: 8.15,
  barsOut: 8.15,
  end: 8.65,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const _v = new THREE.Vector3();

interface Victim {
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
  state: 'standing' | 'flying' | 'down';
  bounces: number;
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowMaterial(map: THREE.Texture, color = 0xffffff, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

/**
 * Black sun: an opaque black disc eclipsing a blazing star — a white-hot rim, a wide orange
 * corona and slowly turning light shafts still pouring out from behind it.
 * Billboarded toward the camera by the caller.
 */
export function buildBlackSun(radius: number): { group: THREE.Group; rays: THREE.Group; rayMats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();

  const coronaTex = canvasTexture(512, 512, (ctx) => {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, 'rgba(255,190,120,1)');
    g.addColorStop(0.22, 'rgba(255,150,70,1)');
    g.addColorStop(0.3, 'rgba(255,95,35,0.8)');
    g.addColorStop(0.45, 'rgba(215,45,20,0.35)');
    g.addColorStop(0.7, 'rgba(120,15,10,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  });
  const coronaSize = (radius / 0.24) * 2;
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(coronaSize, coronaSize), glowMaterial(coronaTex));
  corona.position.z = -1;
  group.add(corona);

  // Light shafts radiating from behind the disc
  const rayTex = canvasTexture(64, 512, (ctx) => {
    const v = ctx.createLinearGradient(0, 512, 0, 0);
    v.addColorStop(0, 'rgba(255,160,80,0.95)');
    v.addColorStop(0.35, 'rgba(255,90,35,0.4)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 512);
    // Soft side edges
    const hz = ctx.createLinearGradient(0, 0, 64, 0);
    hz.addColorStop(0, 'rgba(0,0,0,1)');
    hz.addColorStop(0.5, 'rgba(0,0,0,0)');
    hz.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, 64, 512);
  });
  const rays = new THREE.Group();
  rays.position.z = -0.5;
  const rayMats: THREE.MeshBasicMaterial[] = [];
  const RAYS = 18;
  for (let i = 0; i < RAYS; i++) {
    const len = radius * (2.6 + ((i * 7) % 5) * 0.45);
    const geo = new THREE.PlaneGeometry(radius * (0.16 + ((i * 3) % 4) * 0.05), len);
    geo.translate(0, len / 2 + radius * 0.6, 0);
    const mat = glowMaterial(rayTex, 0xffffff, 0.55);
    const ray = new THREE.Mesh(geo, mat);
    ray.rotation.z = (i / RAYS) * Math.PI * 2 + ((i * 13) % 7) * 0.04;
    rays.add(ray);
    rayMats.push(mat);
  }
  group.add(rays);

  // The eclipsing black disc (opaque: hides the bright centre of the corona and rays)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false })
  );
  group.add(disc);

  // White-hot rim of light escaping around the edge
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.995, radius * 1.045, 96),
    new THREE.MeshBasicMaterial({
      color: 0xfff0d6,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  rim.position.z = 0.1;
  group.add(rim);

  return { group, rays, rayMats };
}

/** The lone highway for shot 1: asphalt, poles & wires, signs, cacti, rocks and mesa silhouettes. */
function buildOutsideRoad(assets: LoadedGlbAssets): THREE.Group {
  const set = new THREE.Group();
  let seed = 9413;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // Desert floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 220).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2c130e, roughness: 1 })
  );
  floor.position.set(0, -0.01, SET_Z - 40);
  floor.receiveShadow = true;
  set.add(floor);

  // Highway running east-west
  const tex = createHighwayStripTexture(4);
  tex.repeat.set(1, 26);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(14.5, 360).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.92, metalness: 0.08 })
  );
  road.rotation.y = Math.PI / 2;
  road.position.set(0, 0.02, SET_Z);
  set.add(road);

  // Utility poles + sagging wires along the far (north) shoulder
  const POLE_Z = SET_Z - 9.5;
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x0c0607 });
  for (let x = -140; x <= 140; x += 14) {
    const pole = cloneModelWithUniqueMaterials(assets.utilityPole);
    pole.position.set(x, 0, POLE_Z);
    pole.rotation.y = Math.PI / 2 + (rand() - 0.5) * 0.25;
    set.add(pole);
    if (x < 140) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 14.2, 4), wireMat);
      wire.rotation.z = Math.PI / 2;
      wire.position.set(x + 7, 6.6, POLE_Z - 0.15);
      set.add(wire);
    }
  }

  // Signs, cacti and rocks on the far side (the near side stays clear for the camera)
  for (const [x, ry] of [
    [-30, -0.3],
    [22, 0.25],
    [70, -0.15],
  ]) {
    const sign = cloneModelWithUniqueMaterials(assets.roadSign);
    sign.position.set(x, 0, SET_Z - 8.2);
    sign.rotation.y = ry;
    set.add(sign);
  }
  for (let i = 0; i < 26; i++) {
    const c = cloneModelWithUniqueMaterials(assets.cactus);
    c.position.set(-150 + rand() * 300, 0, SET_Z - 12 - rand() * 30);
    c.rotation.y = rand() * Math.PI * 2;
    c.scale.setScalar(0.8 + rand() * 0.7);
    set.add(c);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a1c16, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0), rockMat, 70);
  const o = new THREE.Object3D();
  for (let i = 0; i < 70; i++) {
    o.position.set(-150 + rand() * 300, 0.15, SET_Z - 9 - rand() * 40);
    o.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    o.scale.set(0.5 + rand() * 1.6, 0.4 + rand() * 0.8, 0.5 + rand() * 1.6);
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  }
  set.add(rocks);

  // Mesa silhouettes on the horizon, in front of the black sun
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x1a0a09, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const h = 7 + rand() * 14;
    const top = 5 + rand() * 9;
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(top, top * (1.25 + rand() * 0.4), h, 7), mesaMat);
    mesa.position.set(-170 + i * 22 + rand() * 10, h / 2 - 0.5, SET_Z - 50 - rand() * 45);
    mesa.rotation.y = rand() * Math.PI;
    set.add(mesa);
  }

  return set;
}

/** Extrudes a side-profile polygon (points are [z, y]) across the car's width, centred on X. */
function profileGeo(pts: [number, number][], width: number, bevel = 0.04): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.rotateY(-Math.PI / 2); // shape X → car +Z, extrusion → −X
  geo.translate(width / 2 - bevel, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Bottom edge of a side profile, front to rear, with a wheel-arch notch over each axle. */
function bottomWithArches(zRear: number, zFront: number, y: number, axles: number[], r: number): [number, number][] {
  const out: [number, number][] = [[zFront, y]];
  const sorted = [...axles].sort((p, q) => q - p);
  for (const az of sorted) {
    out.push([az + r, y]);
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      out.push([az + Math.cos(a) * r, y + Math.sin(a) * r * 0.92]);
    }
    out.push([az - r, y]);
  }
  out.push([zRear, y]);
  return out;
}

/**
 * Black '60s-style fastback muscle car. Forward = +Z, driver door on +X.
 * Built from extruded side profiles (long hood, fastback roofline, ducktail, wheel arches)
 * plus chrome, glass and lights; the driver door is its own hinged group.
 */
export function buildMustang(): { car: THREE.Group; door: THREE.Group; wheels: THREE.Group[] } {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x101014, metalness: 0.55, roughness: 0.24 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, metalness: 0.35, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd4d8e0, metalness: 0.55, roughness: 0.28 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, metalness: 0.6, roughness: 0.05, emissive: 0x05090e });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.85 });
  const liner = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1, side: THREE.BackSide });
  const head = new THREE.MeshBasicMaterial({ color: 0xfff1c2, toneMapped: false });
  const tail = new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    car.add(m);
    return m;
  };

  const AXLES = [1.45, -1.45];
  const ARCH = 0.5;

  // ── Lower body: shark nose, long hood, ducktail, wheel arches
  const body: [number, number][] = [
    ...bottomWithArches(-2.3, 2.3, 0.26, AXLES, ARCH),
    [-2.36, 0.5],
    [-2.34, 0.86],
    [-2.28, 1.02], // ducktail lip
    [-1.9, 0.99],
    [-1.62, 0.97], // trunk lid → fastback
    [0.6, 0.97], // cowl
    [1.95, 0.9], // hood falls to the nose
    [2.32, 0.84],
    [2.4, 0.66], // shark nose
    [2.36, 0.4],
  ];
  add(profileGeo(body, 1.96, 0.05), paint, 0, 0, 0);
  // Chrome swage line along the flanks
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.035, 3.9), chrome, sx * 0.985, 0.74, 0.05);

  // ── Greenhouse: windshield rake, short roof, long fastback slope down to the ducktail
  const cabin: [number, number][] = [
    [0.62, 0.96],
    [-0.12, 1.44],
    [-0.78, 1.47],
    [-1.85, 0.98],
  ];
  add(profileGeo(cabin, 1.5, 0.04), paint, 0, 0, 0);
  // Side glass: inset outline a hair wider than the roof, so only the flanks read as glass
  const sideGlass: [number, number][] = [
    [0.46, 1.02],
    [-0.13, 1.39],
    [-0.74, 1.41],
    [-1.4, 1.06],
  ];
  add(profileGeo(sideGlass, 1.53, 0), glass, 0, 0, 0);
  // Windshield + fastback rear glass laid on the slopes
  const slope = (z0: number, y0: number, z1: number, y1: number, w: number, inset = 0.1) => {
    const len = Math.hypot(z1 - z0, y1 - y0) - inset * 2;
    const dz = z1 - z0;
    const dy = y1 - y0;
    const l = Math.hypot(dz, dy);
    // Outward normal of the slope in the (z, y) plane
    let nz = -dy / l;
    let ny = dz / l;
    if (ny < 0) {
      nz = -nz;
      ny = -ny;
    }
    const g = add(new THREE.BoxGeometry(w, 0.02, len), glass, 0, (y0 + y1) / 2 + ny * 0.03, (z0 + z1) / 2 + nz * 0.03);
    g.rotation.x = -Math.atan2(dy, dz);
    return g;
  };
  slope(0.62, 0.96, -0.12, 1.44, 1.36);
  slope(-0.78, 1.47, -1.85, 0.98, 1.2, 0.22);
  // Louvered rear quarter vents (fastback signature)
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.02, 0.03, 0.2), chrome, sx * 0.77, 1.17 - k * 0.06, -1.36 + k * 0.08);
  }

  // ── Twin racing stripes over hood, roof and trunk
  const hoodTilt = Math.atan2(0.07, 1.35);
  for (const sx of [-0.2, 0.2]) {
    add(new THREE.BoxGeometry(0.17, 0.012, 1.42), stripe, sx, 0.985, 1.27, hoodTilt);
    add(new THREE.BoxGeometry(0.17, 0.012, 0.62), stripe, sx, 1.5, -0.45);
    add(new THREE.BoxGeometry(0.17, 0.012, 0.34), stripe, sx, 1.0, -2.04);
  }
  // Hood scoop
  add(new THREE.BoxGeometry(0.62, 0.1, 0.5), paint, 0, 1.02, 1.05, hoodTilt);
  add(new THREE.BoxGeometry(0.5, 0.06, 0.04), black, 0, 1.03, 1.31);

  // ── Face: recessed grille, round headlights, pony badge, chrome bumper, amber parking lights
  add(new THREE.BoxGeometry(1.5, 0.3, 0.06), black, 0, 0.62, 2.37);
  for (const sx of [-0.58, 0.58]) {
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), chrome, sx, 0.64, 2.39, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14), head, sx, 0.64, 2.42, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.16, 0.08, 0.03), chrome, 0, 0.64, 2.41); // pony
  add(new THREE.BoxGeometry(2.0, 0.1, 0.14), chrome, 0, 0.36, 2.4);
  for (const sx of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.18, 0.05, 0.03), amber, sx, 0.47, 2.42);

  // ── Tail: three-bar lamps each side, chrome bumper, gas cap, quad exhaust
  add(new THREE.BoxGeometry(1.86, 0.26, 0.05), black, 0, 0.74, -2.37);
  for (const sx of [-1, 1]) {
    for (let b = 0; b < 3; b++) add(new THREE.BoxGeometry(0.1, 0.17, 0.04), tail, sx * (0.42 + b * 0.14), 0.74, -2.4);
  }
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), chrome, 0, 0.74, -2.4, Math.PI / 2);
  add(new THREE.BoxGeometry(2.0, 0.1, 0.14), chrome, 0, 0.4, -2.38);
  for (const sx of [-0.62, -0.48, 0.48, 0.62]) {
    const pipe = add(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 8), chrome, sx, 0.27, -2.36, Math.PI / 2);
    pipe.castShadow = false;
  }

  // Side scoops ahead of the rear arches + mirror on the driver side
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.16, 0.34), black, sx * 0.97, 0.68, -0.68);
  add(new THREE.BoxGeometry(0.16, 0.08, 0.1), chrome, 0.86, 1.07, 0.5);

  // Dark wheel-well liners so the arches read as deep holes
  for (const wz of AXLES) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(ARCH * 0.97, ARCH * 0.97, 1.9, 14, 1, true, -Math.PI / 2, Math.PI), liner);
    well.rotation.z = Math.PI / 2;
    well.position.set(0, 0.26, wz);
    car.add(well);
  }

  // ── Wheels: fat tyres (wider at the back), five-spoke chrome mags
  const wheels: THREE.Group[] = [];
  for (const [wx, wz] of [
    [0.88, 1.45],
    [-0.88, 1.45],
    [0.88, -1.45],
    [-0.88, -1.45],
  ]) {
    const w = new THREE.Group();
    w.position.set(wx, 0.4, wz);
    const width = wz < 0 ? 0.38 : 0.32;
    const side = Math.sign(wx);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, width, 18), rubber);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 14), chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * (width / 2 + 0.005);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), black);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * (width / 2 + 0.03);
    w.add(tire, hub, cap);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.06), black);
      const a = (k / 5) * Math.PI * 2;
      spoke.position.set(side * (width / 2 + 0.03), Math.cos(a) * 0.13, Math.sin(a) * 0.13);
      spoke.rotation.x = -a;
      w.add(spoke);
    }
    car.add(w);
    wheels.push(w);
  }

  // Driver door (hinge at its front edge, swings outward with negative Y rotation)
  const door = new THREE.Group();
  door.position.set(1.0, 0, 0.52);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.22), paint);
  panel.position.set(0.0, 0.66, -0.62);
  panel.castShadow = true;
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.2), chrome);
  sill.position.set(0.03, 0.74, -0.62);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.0), paint);
  frame.position.set(-0.2, 0.97, -0.55);
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.78), glass);
  doorGlass.position.set(-0.22, 1.14, -0.52);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), chrome);
  handle.position.set(0.05, 0.86, -1.0);
  door.add(panel, sill, frame, doorGlass, handle);
  car.add(door);

  return { car, door, wheels };
}

export class IntroCutscene {
  readonly car: THREE.Group;
  private door: THREE.Group;
  private wheels: THREE.Group[];
  private victims: Victim[] = [];
  private host: IntroHost;

  private t = 0;
  private freeze = 0;
  private trauma = 0;
  private done = false;
  private swapped = false;
  private screeched = false;
  private kicked = false;
  private engineStopped = false;
  private skidAcc = 0;
  private engine: ReturnType<typeof synthAudio.startCarEngine> = null;
  private engineClip: EndingClip | null = null;
  private heroWalkFrom = new THREE.Vector3();

  // Shot 1 set: outside highway, black sun, back light and darker sky (restored on the cut)
  private outsideSet: THREE.Group | null;
  private sun: ReturnType<typeof buildBlackSun>;
  private sunLight: THREE.DirectionalLight;
  private savedBackground: THREE.Scene['background'];
  private savedFog: THREE.Scene['fog'];

  constructor(host: IntroHost) {
    this.host = host;
    const built = buildMustang();
    this.car = built.car;
    this.door = built.door;
    this.wheels = built.wheels;
    this.car.scale.setScalar(CAR_SCALE);
    this.car.position.set(PASS_START_X, 0, PASS_LANE_Z);
    this.car.rotation.y = Math.PI / 2;
    host.scene.add(this.car);

    // Outside highway set with the black sun hanging over the horizon
    this.outsideSet = buildOutsideRoad(host.assets);
    this.sun = buildBlackSun(11);
    this.outsideSet.add(this.sun.group);
    this.sunLight = new THREE.DirectionalLight(0xff6a2a, 2.2);
    this.sunLight.position.set(10, 22, SET_Z - 100);
    this.sunLight.target.position.set(0, 0, SET_Z);
    this.outsideSet.add(this.sunLight, this.sunLight.target);
    host.scene.add(this.outsideSet);
    this.savedBackground = host.scene.background;
    this.savedFog = host.scene.fog;
    host.scene.background = new THREE.Color(0x160405);
    host.scene.fog = new THREE.FogExp2(0x160405, 0.0105);

    // Bandits standing in the road, facing the oncoming car
    for (const [vx, vz] of [
      [-14, PASS_LANE_Z + 0.4],
      [-4, PASS_LANE_Z - 0.5],
      [5, PASS_LANE_Z + 0.2],
    ]) {
      const mesh = cloneModelWithUniqueMaterials(host.assets.enemies.rustler);
      mesh.position.set(vx, 0, vz);
      mesh.rotation.y = -Math.PI / 2;
      host.scene.add(mesh);
      this.victims.push({ mesh, x: vx, y: 0, z: vz, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, state: 'standing', bounces: 0 });
    }

    host.hero.visible = false;
    host.setFade(1);
    host.setLetterbox(0);
    // the Mustang: the recorded engine, start to finish (it's as long as the cutscene)
    this.engineClip = synthAudio.playEndingSample('carEngine', 1);
  }

  /** Ignore skip input for the first instant (the key that started the run must not skip it). */
  get canSkip(): boolean {
    return this.t > 0.3;
  }

  /** Jump straight to the end state. */
  skip() {
    this.finish();
  }

  /** Advances the cutscene. Returns true once it has finished. */
  update(dt: number, realDt: number): boolean {
    if (this.done) return true;

    let d = dt;
    if (this.freeze > 0) {
      this.freeze -= realDt;
      d = 0;
    }
    this.t += d;
    const t = this.t;

    // Letterbox bars and fades
    this.host.setLetterbox(t < 0.4 ? t / 0.4 : t > T.barsOut ? Math.max(0, 1 - (t - T.barsOut) / (T.end - T.barsOut)) : 1);
    let fade = 0;
    if (t < 0.35) fade = 1 - t / 0.35;
    else if (t >= T.fadeOutStart && t < T.fadeOutEnd) fade = (t - T.fadeOutStart) / (T.fadeOutEnd - T.fadeOutStart);
    else if (t >= T.fadeOutEnd && t < T.fadeInStart) fade = 1;
    else if (t >= T.fadeInStart && t < T.fadeInEnd) fade = 1 - (t - T.fadeInStart) / (T.fadeInEnd - T.fadeInStart);
    this.host.setFade(fade);

    if (t < T.swap) this.updatePass(d);
    else {
      if (!this.swapped) this.swapToDrift();
      this.updateDriftAndExit(d);
    }

    this.applyShake(realDt);
    if (t >= T.end) {
      this.finish();
      return true;
    }
    return false;
  }

  // ───────────── Shot 1: the pass ─────────────

  private updatePass(d: number) {
    const carX = PASS_START_X + PASS_SPEED * this.t;
    this.car.position.set(carX, 0, PASS_LANE_Z);
    this.car.rotation.set(0, Math.PI / 2, 0);
    this.spinWheels(PASS_SPEED, d);

    // Low side tracking shot from the near shoulder; the road, poles and sun fill the background
    const camX = clamp(carX, -44, 14);
    const cam = this.host.camera;
    cam.position.set(camX - 2.5, 2.0, PASS_LANE_Z + 8.2);
    cam.lookAt(camX + 1.5, 1.0, PASS_LANE_Z);
    this.engine?.setPan((carX - camX) / 12);

    // The sun sits "at infinity": it follows the camera sideways, faces it, and its shafts turn
    // Low on the horizon so the whole disc clears the letterbox, half-set behind the mesas
    this.sun.group.position.set(cam.position.x + 16, 8.5, SET_Z - 105);
    this.sun.group.quaternion.copy(cam.quaternion);
    this.sun.rays.rotation.z = this.t * 0.06;
    this.sun.rayMats.forEach((m, i) => {
      m.opacity = 0.42 + 0.18 * Math.sin(this.t * 1.7 + i * 1.3);
    });

    const frontX = carX + 2.35 * CAR_SCALE;
    const standing = this.victims.filter((v) => v.state === 'standing');
    for (const v of standing) {
      if (frontX >= v.x - 0.4 && Math.abs(v.z - PASS_LANE_Z) < 1.6) {
        v.state = 'flying';
        v.vx = PASS_SPEED * 0.55 + Math.random() * 4;
        v.vy = 8 + Math.random() * 3;
        v.vz = (v.z - PASS_LANE_Z) * 3 + (Math.random() - 0.5) * 3;
        v.spinX = (Math.random() - 0.5) * 14;
        v.spinZ = -8 - Math.random() * 6;
        this.host.fx.splatter(v.x, v.z, 1, (v.z - PASS_LANE_Z) * 0.4, 1.9);
        this.trauma = Math.min(1, this.trauma + 0.5);
        this.freeze = 0.05;
        synthAudio.playEndingSample('carImpact', 0.95);
        if (standing.length === 1) this.host.slowMo(0.9); // last one in slow motion
      }
    }

    for (const v of this.victims) this.updateVictim(v, d);
  }

  private updateVictim(v: Victim, d: number) {
    if (v.state !== 'flying') return;
    v.vy -= 22 * d;
    v.x += v.vx * d;
    v.y += v.vy * d;
    v.z += v.vz * d;
    v.mesh.rotation.x += v.spinX * d;
    v.mesh.rotation.z += v.spinZ * d;
    if (v.y <= 0) {
      v.y = 0;
      if (v.bounces < 1) {
        v.bounces++;
        v.vy = -v.vy * 0.25;
        v.vx *= 0.4;
        v.vz *= 0.4;
        this.host.fx.splatter(v.x, v.z, v.vx, v.vz, 1.0);
      } else {
        v.state = 'down';
        v.y = 0.15;
        v.mesh.rotation.set(-Math.PI / 2, v.mesh.rotation.y, 0);
        this.host.fx.splatter(v.x, v.z, v.vx || 1, v.vz, 1.3);
      }
    }
    v.mesh.position.set(v.x, v.y, v.z);
  }

  // ───────────── Cut: reset for the drift shot ─────────────

  /** Tears down the outside-highway set and restores the arena sky. Idempotent. */
  private removeOutsideSet() {
    if (!this.outsideSet) return;
    this.host.scene.remove(this.outsideSet);
    this.outsideSet = null;
    this.host.scene.background = this.savedBackground;
    this.host.scene.fog = this.savedFog;
  }

  private swapToDrift() {
    this.swapped = true;
    this.removeOutsideSet();
    for (const v of this.victims) this.host.scene.remove(v.mesh);
    this.victims = [];
    this.car.position.set(DRIFT_START_X, 0, DRIFT_START_Z);
    this.car.rotation.set(0, Math.PI / 2, 0);
    this.engine?.setPan(-0.8);
  }

  // ───────────── Shots 2–3: drift, door kick, step out ─────────────

  private updateDriftAndExit(d: number) {
    const t = this.t;
    const u = clamp((t - T.driftStart) / (T.driftEnd - T.driftStart), 0, 1);
    const ease = 1 - Math.pow(1 - u, 3);
    const x = DRIFT_START_X + (INTRO_PARKED_CAR.x - DRIFT_START_X) * ease;
    const z = INTRO_PARKED_CAR.z + DRIFT_START_Z * (1 - ease) - Math.sin(u * Math.PI) * 0.9;
    const yaw =
      (Math.PI / 2) * (1 - smoothstep(0.3, 0.9, u)) - 0.12 * Math.sin(smoothstep(0.85, 1, u) * Math.PI);
    this.car.position.set(x, 0, z);
    this.car.rotation.set(0, yaw, -0.05 * Math.sin(smoothstep(0.3, 1, u) * Math.PI)); // body roll in the slide
    tumbleweedRepel.active = true;
    tumbleweedRepel.x = x;
    tumbleweedRepel.z = z;
    tumbleweedRepel.r = 3.6;

    const speed = (3 * Math.pow(1 - u, 2) * (INTRO_PARKED_CAR.x - DRIFT_START_X)) / (T.driftEnd - T.driftStart);
    this.spinWheels(speed, d);
    if (!this.kicked) {
      this.engine?.setSpeed(0.08 + Math.min(1, speed / PASS_SPEED) * 0.92);
      this.engine?.setPan((x + 11) / 14);
    }

    // Screech, smoke and rubber on the asphalt while sliding
    if (u >= 0.3 && !this.screeched) {
      this.screeched = true;
      synthAudio.playTireScreech(Math.max(0.6, T.driftEnd - t + 0.25));
    }
    if (u > 0.3 && u < 0.97) {
      this.skidAcc += d;
      while (this.skidAcc >= 0.025) {
        this.skidAcc -= 0.025;
        for (const wx of [0.98, -0.98]) {
          _v.set(wx, 0, -1.45);
          this.car.localToWorld(_v);
          this.host.fx.stampMark(_v.x, _v.z, 0.26, 1.9, 0, 0x0c0a0a);
          if (Math.random() < 0.45) this.host.fx.puff(_v.x, 0.3, _v.z, 0.6, 0x9a948c, { x: -1.2, z: 0 });
        }
      }
    }

    // Camera: wide on the slide, then push in on the door
    const push = smoothstep(T.driftEnd - 0.2, T.kick + 0.3, t);
    const cam = this.host.camera;
    // Kept south of the car but in front of the pole line (z = 10.2)
    cam.position.set(-10 + (-14.5 + 10) * push, 5.0 + (3.4 - 5.0) * push, 9.2 + (8.0 - 9.2) * push);
    const lookX = -30 + (INTRO_PARKED_CAR.x + 30) * ease;
    cam.lookAt(lookX + (-18.8 - lookX) * push, 0.9 + push * 0.2, INTRO_PARKED_CAR.z + push * 0.2);

    // Door kick
    if (t >= T.kick) {
      if (!this.kicked) {
        this.kicked = true;
        this.trauma = 1;
        synthAudio.playDoorKick();
        _v.set(1.6, 0, -0.3);
        this.car.localToWorld(_v);
        this.heroWalkFrom.copy(_v);
        for (let k = 0; k < 4; k++) this.host.fx.puff(_v.x + 0.3, 0.2 + Math.random() * 0.3, _v.z, 0.32, 0x7d766e, { x: 1.8, z: (Math.random() - 0.5) * 2 });
        this.host.hero.visible = true;
      }
      const k = (t - T.kick) / 0.09;
      const open = k < 1 ? -1.35 * Math.sin((k * Math.PI) / 2) : -1.35 + Math.min(1, (t - T.kick - 0.09) / 0.35) * 0.2;
      this.door.rotation.y = open;

      if (!this.engineStopped && t >= T.kick + 0.35) {
        this.engineStopped = true;
        this.engineClip?.(0.8);
      }

      // Driver steps out toward the fight
      const w = smoothstep(T.kick + 0.12, T.walkEnd, t);
      const hx = this.heroWalkFrom.x + (INTRO_PLAYER_START.x - this.heroWalkFrom.x) * w;
      const hz = this.heroWalkFrom.z + (INTRO_PLAYER_START.z - this.heroWalkFrom.z) * w;
      this.host.hero.position.set(hx, Math.abs(Math.sin(w * Math.PI * 3)) * 0.08, hz);
      this.host.hero.rotation.y = INTRO_PLAYER_START.yaw;
    }
  }

  private spinWheels(speed: number, d: number) {
    for (const w of this.wheels) w.rotation.x += (speed / (0.38 * CAR_SCALE)) * d;
  }

  private applyShake(realDt: number) {
    if (this.trauma <= 0) return;
    const s = this.trauma * this.trauma * 1.1;
    const cam = this.host.camera;
    cam.position.x += (Math.random() * 2 - 1) * s;
    cam.position.y += (Math.random() * 2 - 1) * s * 0.7;
    cam.position.z += (Math.random() * 2 - 1) * s * 0.6;
    cam.rotation.z += (Math.random() * 2 - 1) * s * 0.05;
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
  }

  /** Puts everything in the final state (also used by skip). Idempotent. */
  finish() {
    if (this.done) return;
    this.done = true;
    this.removeOutsideSet();
    for (const v of this.victims) this.host.scene.remove(v.mesh);
    this.victims = [];
    this.car.position.set(INTRO_PARKED_CAR.x, 0, INTRO_PARKED_CAR.z);
    this.car.rotation.set(0, 0, 0);
    // The parked car keeps shoving tumbleweeds aside for the rest of the stage
    tumbleweedRepel.active = true;
    tumbleweedRepel.x = INTRO_PARKED_CAR.x;
    tumbleweedRepel.z = INTRO_PARKED_CAR.z;
    tumbleweedRepel.r = 3.2;
    this.door.rotation.y = -1.15;
    this.host.hero.visible = true;
    this.host.hero.position.set(INTRO_PLAYER_START.x, 0, INTRO_PLAYER_START.z);
    this.host.hero.rotation.y = INTRO_PLAYER_START.yaw;
    this.host.setFade(0);
    this.host.setLetterbox(0);
    if (!this.engineStopped) {
      this.engineStopped = true;
      this.engineClip?.(0.3);
    }
  }
}
