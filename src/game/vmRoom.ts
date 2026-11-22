import * as THREE from 'three';
import { itemVoxelGeometry } from './itemSprites';
import type { VmItemId } from './types';

/**
 * VM's rug: light blue with a deeper border, a woven inner frame, little diamond motifs between
 * the wares and tassels on the short ends. Painted to a canvas, laid flat.
 */
function buildCarpet(length: number, width: number): THREE.Group {
  const PX = 64; // texels per unit
  const cw = Math.round(length * PX);
  const ch = Math.round(width * PX);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#cdeeff';
  ctx.fillRect(0, 0, cw, ch);
  // Weave noise
  for (let i = 0; i < cw * ch * 0.04; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(40,110,170,0.12)';
    ctx.fillRect(Math.floor(Math.random() * cw), Math.floor(Math.random() * ch), 2, 1);
  }
  // Border + inner frame
  ctx.fillStyle = '#86c6f2';
  ctx.fillRect(0, 0, cw, 10);
  ctx.fillRect(0, ch - 10, cw, 10);
  ctx.fillRect(0, 0, 10, ch);
  ctx.fillRect(cw - 10, 0, 10, ch);
  ctx.strokeStyle = '#e9f6ff';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, cw - 36, ch - 36);
  ctx.strokeStyle = '#6fb4e8';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, cw - 52, ch - 52);
  // Diamond motifs along the centre line
  const n = Math.max(2, Math.round(length / 1.3) + 1);
  for (let i = 0; i < n; i++) {
    const x = 26 + ((cw - 52) * i) / (n - 1);
    const y = ch / 2;
    ctx.fillStyle = '#9fd2f5';
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x + 9, y);
    ctx.lineTo(x, y + 14);
    ctx.lineTo(x - 9, y);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const g = new THREE.Group();
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false })
  );
  g.add(rug);
  // Tassels on the short ends
  const tasselMat = new THREE.MeshBasicMaterial({ color: 0xe9f6ff, fog: false, toneMapped: false });
  const tasselGeo = new THREE.PlaneGeometry(0.05, 0.22).rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const t = new THREE.Mesh(tasselGeo, tasselMat);
      t.position.set(side * (length / 2 + 0.1), 0.002, -width / 2 + 0.12 + (i * (width - 0.24)) / 11);
      t.rotation.y = Math.PI / 2;
      g.add(t);
    }
  }
  return g;
}

/**
 * VM's place, in two pieces:
 *
 *  VmDoor  — a steel shutter set into the tree arena wall. It opens bottom-to-top onto pure,
 *            blown-out white: from the arena you can see nothing else. Walk in to cross over.
 *  VmSpace — where you end up: an endless white void with thin light-blue lines rippling
 *            through the air and drifting sideways forever. VM sits in a corner behind his
 *            wares (floating item sprites on pedestals). A black door leads onward, deeper.
 */

const DOOR_W = 4.2;
const DOOR_H = 5;
const ROOM_W = 9;
const ROOM_H = 7.5;
const ROOM_D = 11;

function canvasTex(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hazardTexture(): THREE.CanvasTexture {
  const tex = canvasTex(64, 64, (c) => {
    c.fillStyle = '#d9a514';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#0c0b0a';
    for (let i = -64; i < 128; i += 32) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + 16, 0);
      c.lineTo(i + 16 + 64, 64);
      c.lineTo(i + 64, 64);
      c.fill();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** VM: a red vending-machine robot sitting cross-legged. Faces local +Z. */
export function buildVm(): { vm: THREE.Group; head: THREE.Group; eyes: THREE.Mesh[] } {
  const vm = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.5, metalness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.4, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.7, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a2c, emissive: 0x1d4c8f, emissiveIntensity: 0.6, roughness: 0.15 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = vm) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Torso = vending machine
  box(1.3, 1.7, 0.85, red, 0, 0.95, 0);
  box(1.34, 0.08, 0.89, trim, 0, 1.8, 0);
  box(1.0, 1.15, 0.05, glass, -0.08, 1.1, 0.43);
  const canColors = [0xff3b30, 0xffd23a, 0x34c759, 0x2ee6d6, 0xff8a2b, 0xe9e4d8];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const col = canColors[(r * 3 + c) % canColors.length];
      box(0.18, 0.2, 0.14, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 }), -0.36 + c * 0.28, 0.65 + r * 0.28, 0.34);
    }
  }
  box(0.16, 0.5, 0.06, dark, 0.52, 1.25, 0.44); // keypad / coin slot strip
  box(0.12, 0.04, 0.07, trim, 0.52, 1.42, 0.46);
  box(0.6, 0.12, 0.08, dark, -0.08, 0.32, 0.44); // pickup flap

  // Crossed legs and resting arms
  for (const side of [-1, 1]) {
    const leg = box(0.3, 0.26, 1.15, dark, side * 0.32, 0.14, 0.62);
    leg.rotation.y = side * -0.55;
    const arm = box(0.18, 0.18, 0.85, dark, side * 0.78, 1.05, 0.32);
    arm.rotation.x = 0.6;
    box(0.22, 0.2, 0.22, trim, side * 0.78, 0.78, 0.66); // hands on knees
  }

  // Monitor head with a blinking face
  const head = new THREE.Group();
  head.position.set(0, 2.25, 0.02);
  box(0.12, 0.25, 0.12, dark, 0, -0.32, 0, head); // neck
  box(0.92, 0.66, 0.6, dark, 0, 0, 0, head);
  box(0.78, 0.5, 0.03, new THREE.MeshBasicMaterial({ color: 0x050608 }), 0, 0, 0.31, head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe9f6ff, toneMapped: false });
  const eyes = [-0.17, 0.17].map((ex) => box(0.12, 0.16, 0.02, eyeMat, ex, 0.05, 0.335, head));
  box(0.3, 0.035, 0.02, eyeMat, 0, -0.14, 0.335, head); // flat mouth
  box(0.04, 0.3, 0.04, trim, 0.32, 0.45, 0, head); // antenna
  vm.add(head);

  return { vm, head, eyes };
}

// ─────────────────────────────── Door in the arena wall ───────────────────────────────

export class VmDoor {
  readonly group = new THREE.Group();
  /** World point just in front of the door (arena side). */
  readonly doorFront = new THREE.Vector3();
  /** World point in the doorway itself — walking here crosses into VM's space. */
  readonly threshold = new THREE.Vector3();
  /** World point deep inside the white (camera target for cutscenes). */
  readonly insideFocus = new THREE.Vector3();
  /** Unit vector (world XZ) pointing from the door out into the arena. */
  readonly outward = new THREE.Vector3();

  private shutter: THREE.Mesh;
  private openAmount = 0;
  private openLinear = 0;
  private opening = false;
  private spill: THREE.PointLight;
  /** Light leaking out of the white: doorway bloom, a pool on the floor, shafts. */
  private leakMats: THREE.MeshBasicMaterial[] = [];

  constructor(angle: number, radius: number) {
    const g = this.group;
    g.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    g.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle)); // local +Z → arena centre
    this.outward.set(-Math.cos(angle), 0, -Math.sin(angle));

    // Facade: heavy steel wall with the opening and hazard trim
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.75, metalness: 0.6 });
    const sideW = 5;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sideW, 11, 0.7), steel);
      wall.position.set(side * (DOOR_W / 2 + sideW / 2), 5.5, 0.3);
      g.add(wall);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 11 - DOOR_H, 0.7), steel);
    lintel.position.set(0, DOOR_H + (11 - DOOR_H) / 2, 0.3);
    g.add(lintel);
    const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, DOOR_H, 0.75), hazardMat);
      post.position.set(side * (DOOR_W / 2 + 0.17), DOOR_H / 2, 0.32);
      g.add(post);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.7, 0.35, 0.75), hazardMat);
    head.position.set(0, DOOR_H + 0.17, 0.32);
    g.add(head);

    // Shutter (opens bottom → top)
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x3b3936, roughness: 0.6, metalness: 0.7 });
    this.shutter = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.18), shutterMat);
    for (let i = 0; i < 10; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 0.08, 0.06), steel);
      rib.position.set(0, -DOOR_H / 2 + 0.25 + i * 0.5, 0.11);
      this.shutter.add(rib);
    }
    this.shutter.position.set(0, DOOR_H / 2, 0.3);
    g.add(this.shutter);

    // Behind it: nothing but white (inside faces only, unlit, no fog)
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false, toneMapped: false });
    const room = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D), white);
    room.position.set(0, ROOM_H / 2 + 0.05, -ROOM_D / 2);
    g.add(room);

    // Opaque outer shell (sides, back, roof) so the white only shows through the doorway
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.85, metalness: 0.5 });
    const T = 0.4;
    const GAP = 0.12;
    const shell = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMat);
      m.position.set(x, y, z);
      g.add(m);
    };
    shell(T, ROOM_H + T, ROOM_D, -ROOM_W / 2 - T / 2 - GAP, ROOM_H / 2, -ROOM_D / 2);
    shell(T, ROOM_H + T, ROOM_D, ROOM_W / 2 + T / 2 + GAP, ROOM_H / 2, -ROOM_D / 2);
    shell(ROOM_W + T * 2 + GAP * 2, ROOM_H + T, T, 0, ROOM_H / 2, -ROOM_D - T / 2 - GAP);
    shell(ROOM_W + T * 2 + GAP * 2, T, ROOM_D + T + GAP, 0, ROOM_H + 0.05 + T / 2 + GAP, -ROOM_D / 2 - T / 2);

    // White light spilling out into the arena once open
    this.spill = new THREE.PointLight(0xf2f6ff, 0, 16, 1.2);
    this.spill.position.set(0, 3, 1.6);
    g.add(this.spill);

    // The white pours out: a bloom over the opening (drawn over any smoke in front of it), a
    // bright fan of light on the floor and a few soft shafts
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      const grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const fanTex = (() => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 128;
      const x = c.getContext('2d')!;
      const grd = x.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.fillRect(0, 0, 64, 128);
      const side = x.createLinearGradient(0, 0, 64, 0);
      side.addColorStop(0, 'rgba(0,0,0,1)');
      side.addColorStop(0.2, 'rgba(0,0,0,0)');
      side.addColorStop(0.8, 'rgba(0,0,0,0)');
      side.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out';
      x.fillStyle = side;
      x.fillRect(0, 0, 64, 128);
      return new THREE.CanvasTexture(c);
    })();
    const leakMat = (map: THREE.Texture) => {
      const m = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
      this.leakMats.push(m);
      return m;
    };
    const bloom = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 1.9, DOOR_H * 1.7), leakMat(glowTex));
    bloom.position.set(0, DOOR_H / 2, 0.75);
    bloom.renderOrder = 20;
    g.add(bloom);
    // Floor fan: narrow at the door, widening out into the arena
    const fanGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const fp = fanGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i); // +0.5 = at the door, −0.5 = far end
      fp.setX(i, fp.getX(i) * (y > 0 ? DOOR_W * 1.05 : DOOR_W * 2.6));
      fp.setY(i, y * 10);
    }
    fanGeo.rotateX(-Math.PI / 2);
    const fan = new THREE.Mesh(fanGeo, leakMat(fanTex));
    fan.position.set(0, 0.07, 0.7 + 5);
    fan.renderOrder = 19;
    g.add(fan);
    for (const [x, rz] of [
      [-1.6, 0.22],
      [0, 0],
      [1.6, -0.22],
    ]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7), leakMat(fanTex));
      shaft.position.set(x, 3.5, 1.2);
      shaft.rotation.set(-1.05, 0, rz);
      shaft.renderOrder = 19;
      g.add(shaft);
    }

    g.updateMatrixWorld(true);
    this.doorFront.set(0, 0, 2.2).applyMatrix4(g.matrixWorld);
    this.threshold.set(0, 0, 0.75).applyMatrix4(g.matrixWorld);
    this.insideFocus.set(0, 2.2, -6).applyMatrix4(g.matrixWorld);
    this.setOpen(0);
  }

  /** 0 = shut, 1 = fully raised. */
  setOpen(u: number) {
    this.openAmount = Math.max(0, Math.min(1, u));
    this.shutter.position.y = DOOR_H / 2 + this.openAmount * (DOOR_H + 0.4);
    this.spill.intensity = this.openAmount * 34;
    this.leakMats.forEach((m, i) => (m.opacity = this.openAmount * (i === 0 ? 0.9 : i === 1 ? 0.55 : 0.18)));
  }

  /** Raise the shutter on its own (outside a cutscene). */
  beginOpen() {
    this.opening = true;
  }

  get isOpen(): boolean {
    return this.openAmount >= 0.99;
  }

  /** Returns true on the frame the shutter finishes opening. */
  update(dt: number): boolean {
    if (!this.opening) return false;
    this.openLinear = Math.min(1, this.openLinear + dt / 0.85);
    const next = this.openLinear;
    this.setOpen(next < 1 ? next * next : 1); // eased: slow start, slams at the top
    if (next >= 1) {
      this.opening = false;
      return true;
    }
    return false;
  }
}

// ─────────────────────────────── VM's white space ───────────────────────────────

const LINE_LANES = 14; // lanes per side, marching outward from the room
const LINE_LAYERS = 2; // low / high line in every lane
const LINE_COUNT = LINE_LANES * LINE_LAYERS * 2;
const BACK_LINES = 16; // a band running side to side beyond the exit door (above it on screen)
const LINE_POINTS = 120;
const LINE_SPAN = 320; // runs far past both ends of the room
const LINE_GAP = 2.2; // spacing between neighbouring lanes (world units)
const LAYER_HEIGHT: [number, number][] = [
  [0.2, 3.5], // skimming the floor
  [5, 15], // high overhead (camera sits ~20 up)
];
const LINE_BASE = new THREE.Color(0xa9dcff);
const LINE_PULSE = new THREE.Color(0x1f7bff);

interface FlowLine {
  line: THREE.Line;
  /** 'z' lines run up the screen beside the room; 'x' lines cross side to side behind the exit. */
  axis: 'z' | 'x';
  /** Fixed coordinate across the line: x for 'z' lines, z for 'x' lines. */
  x: number;
  /** Flow direction along the line (+1 / −1). */
  dir: number;
  base: number;
  amp: number;
  k: number;
  speed: number;
  phase: number;
  pulseSpeed: number;
  pulseOffset: number;
}

export class VmSpace {
  readonly group = new THREE.Group();
  readonly origin: THREE.Vector3;
  /** Walkable rectangle (world), relative to origin: |x| ≤ halfW, |z| ≤ halfD. */
  readonly halfW = 8;
  readonly halfD = 11;
  readonly entry = new THREE.Vector3();
  readonly vmPos = new THREE.Vector3();
  readonly vmFocus = new THREE.Vector3();
  readonly vmFacing = new THREE.Vector3();
  readonly exitPos = new THREE.Vector3();

  private lines: FlowLine[] = [];
  private head: THREE.Group;
  private eyes: THREE.Mesh[];
  private blinkTimer = 2;
  private pedestals: { id: VmItemId; pedestal: THREE.Mesh; sprite: THREE.Object3D; baseY: number; phase: number; sold: boolean }[] = [];
  private pedestalMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false, fog: false });
  private voxelMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
  private carpet: THREE.Group | null = null;

  constructor(origin: THREE.Vector3) {
    this.origin = origin.clone();
    const g = this.group;
    g.position.copy(this.origin);

    // Endless white floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })
    );
    g.add(floor);

    // Thin light-blue lines walling the room in on both sides: vertical on screen, rippling and
    // flowing upward (toward the exit) forever, with brighter data pulses riding them
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    const makeLine = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
      const line = new THREE.Line(geo, lineMat);
      line.frustumCulled = false;
      g.add(line);
      return line;
    };
    // Band crossing side to side beyond the exit door — fills the white above the door
    for (let i = 0; i < BACK_LINES; i++) {
      const height = i % 2 === 0 ? 0.3 + Math.random() * 3 : 4 + Math.random() * 10;
      this.lines.push({
        line: makeLine(),
        axis: 'x',
        x: -this.halfD - 2.5 - i * 1.6 - Math.random() * 0.6,
        dir: i % 3 === 0 ? -1 : 1,
        base: height,
        amp: (0.15 + Math.random() * 0.4) * (1 + height / 12),
        k: 0.1 + Math.random() * 0.2,
        speed: 1.2 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 7 + Math.random() * 9,
        pulseOffset: Math.random() * LINE_SPAN,
      });
    }
    for (let i = 0; i < LINE_COUNT; i++) {
      const line = makeLine();
      const side = i % 2 === 0 ? -1 : 1;
      const lane = Math.floor(i / 2) % LINE_LANES;
      const layer = Math.floor(i / (2 * LINE_LANES));
      // Evenly spaced lanes marching outward from the room's edge, each carrying a low, mid and
      // high line, so the white reads as a vast open space at every depth (kept below the
      // overhead camera). Higher lines sit a bit further in and are offset half a lane:
      // perspective pushes them outward on screen, so they frame the room instead of covering it.
      const [hMin, hMax] = LAYER_HEIGHT[layer];
      const height = hMin + Math.random() * (hMax - hMin);
      const stagger = (layer % 2) * LINE_GAP * 0.5;
      this.lines.push({
        line,
        axis: 'z',
        dir: 1,
        x: side * (this.halfW + 1.2 - Math.min(height, 12) * 0.3 + lane * LINE_GAP + stagger + (Math.random() - 0.5) * 0.4),
        base: 0.15 + height,
        amp: (0.12 + Math.random() * 0.45) * (1 + height / 12),
        k: 0.1 + Math.random() * 0.2,
        speed: 1.4 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 7 + Math.random() * 9,
        pulseOffset: Math.random() * LINE_SPAN,
      });
    }

    // VM, sitting in the top-right corner, turned toward the middle of the room
    const built = buildVm();
    this.head = built.head;
    this.eyes = built.eyes;
    const vmLocal = new THREE.Vector3(5.4, 0, -6.4);
    built.vm.position.copy(vmLocal);
    built.vm.rotation.y = Math.atan2(-vmLocal.x, -vmLocal.z + 3);
    g.add(built.vm);
    const vmLight = new THREE.PointLight(0xffffff, 26, 14, 1.2);
    vmLight.position.set(vmLocal.x - 2, 4.5, vmLocal.z + 2.5);
    g.add(vmLight);

    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1f, fog: false });
    const doorFrame = (z: number, facing: number, h: number) => {
      const d = new THREE.Group();
      d.position.set(0, 0, z);
      d.rotation.y = facing;
      for (const [w, fh, x, y] of [
        [0.3, h + 0.3, -1.45, (h + 0.3) / 2],
        [0.3, h + 0.3, 1.45, (h + 0.3) / 2],
        [3.2, 0.3, 0, h + 0.15],
      ]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, fh, 0.35), frameMat);
        f.position.set(x, y, 0);
        d.add(f);
      }
      g.add(d);
      return d;
    };

    // Exit (top centre): a black doorway, the way deeper down
    const exitLocal = new THREE.Vector3(0, 0, -this.halfD - 0.3);
    const exitDoor = doorFrame(exitLocal.z, 0, 4.2);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.2, 0.2), blackMat);
    hole.position.y = 2.1;
    exitDoor.add(hole);
    // A dark spill on the floor in front of it
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, fog: false }));
    spill.position.set(0, 0.02, exitLocal.z + 0.9);
    g.add(spill);

    // Entry (bottom centre): the steel shutter you came through, shut behind you. Kept low so
    // it doesn't hide the player from the overhead camera.
    const entryZ = this.halfD + 1;
    const entryDoor = doorFrame(entryZ, Math.PI, 3.4);
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.16), new THREE.MeshBasicMaterial({ color: 0x3b3936, fog: false }));
    shutter.position.y = 1.7;
    entryDoor.add(shutter);
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.2), frameMat);
      rib.position.set(0, 0.35 + i * 0.52, 0);
      entryDoor.add(rib);
    }

    // World-space anchors
    this.entry.copy(this.origin).add(new THREE.Vector3(0, 0, this.halfD - 3));
    this.vmPos.copy(this.origin).add(vmLocal);
    this.vmFocus.copy(this.vmPos).setY(1.7);
    this.vmFacing.set(-vmLocal.x, 0, -vmLocal.z + 3).normalize();
    this.exitPos.copy(this.origin).add(new THREE.Vector3(0, 0, -this.halfD + 0.7));
    this.group.visible = false;
  }

  /** Lays out this visit's wares on pedestals in front of VM. */
  setWares(ids: VmItemId[]) {
    for (const p of this.pedestals) {
      this.group.remove(p.pedestal);
      this.group.remove(p.sprite);
    }
    this.pedestals = [];
    if (this.carpet) this.group.remove(this.carpet);
    const vmLocal = this.vmPos.clone().sub(this.origin);
    const toCentre = Math.atan2(-vmLocal.x, -vmLocal.z);
    // A light-blue rug laid out in front of VM, square to him; the wares sit on it in a row
    const GAP = 1.3;
    const len = ids.length * GAP + 0.9;
    const cx = vmLocal.x + Math.sin(toCentre) * 3.1;
    const cz = vmLocal.z + Math.cos(toCentre) * 3.1;
    this.carpet = buildCarpet(len, 2.1);
    this.carpet.position.set(cx, 0.015, cz);
    this.carpet.rotation.y = toCentre;
    this.group.add(this.carpet);
    const sideX = Math.cos(toCentre);
    const sideZ = -Math.sin(toCentre);
    ids.forEach((id, i) => {
      const off = (i - (ids.length - 1) / 2) * GAP;
      const px = cx + sideX * off;
      const pz = cz + sideZ * off;
      // Soft contact shadow on the rug
      const pedestal = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), this.pedestalMat);
      pedestal.position.set(px, 0.03, pz);
      const item = new THREE.Mesh(itemVoxelGeometry(id), this.voxelMat);
      item.scale.setScalar(1.25);
      item.position.set(px, 0.85, pz);
      // Face tilted up toward the overhead camera (it looks down from +z)
      item.rotation.set(-0.8, 0, 0, 'YXZ');
      this.group.add(pedestal, item);
      this.pedestals.push({ id, pedestal, sprite: item, baseY: 0.85, phase: i * 1.3, sold: false });
    });
  }

  /** Bought: the sprite vanishes, the empty pedestal stays. */
  markSold(id: VmItemId) {
    const p = this.pedestals.find((q) => q.id === id && !q.sold);
    if (p) {
      p.sold = true;
      p.sprite.visible = false;
    }
  }

  /** Hides the pedestals during the close-up dialogue shot (they sit between camera and VM). */
  setWaresVisible(v: boolean) {
    for (const p of this.pedestals) {
      p.pedestal.visible = v;
      p.sprite.visible = v && !p.sold;
    }
  }

  /** Keeps a world position inside the walkable rectangle. */
  clamp(x: number, z: number, r: number): { x: number; z: number } {
    return {
      x: Math.max(this.origin.x - this.halfW + r, Math.min(this.origin.x + this.halfW - r, x)),
      z: Math.max(this.origin.z - this.halfD + r, Math.min(this.origin.z + this.halfD - r, z)),
    };
  }

  update(dt: number, elapsed: number) {
    if (!this.group.visible) return;
    const c = new THREE.Color();
    for (const l of this.lines) {
      const pos = l.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = l.line.geometry.getAttribute('color') as THREE.BufferAttribute;
      // Pulse head travels toward -z (up the screen) and wraps
      const head = LINE_SPAN / 2 - ((elapsed * l.pulseSpeed + l.pulseOffset) % LINE_SPAN);
      for (let p = 0; p < LINE_POINTS; p++) {
        // `along` runs the length of the line; crests travel toward −along·dir (z lines: up the screen)
        const along = (LINE_SPAN / 2 - (p / (LINE_POINTS - 1)) * LINE_SPAN) * l.dir;
        const w = along * l.k + elapsed * l.speed + l.phase;
        const across = l.x + Math.sin(w) * l.amp + Math.sin(w * 2.3 + elapsed * 0.6) * l.amp * 0.25;
        const y = l.base + Math.sin(w * 0.7 + l.phase) * 0.25;
        if (l.axis === 'z') pos.setXYZ(p, across, y, along);
        else pos.setXYZ(p, along, y, across);
        // Bright tail behind the pulse head
        const behind = along - head;
        const glow = behind >= 0 && behind < 9 ? 1 - behind / 9 : 0;
        c.copy(LINE_BASE).lerp(LINE_PULSE, glow);
        col.setXYZ(p, c.r, c.g, c.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
    for (const p of this.pedestals) {
      p.sprite.position.y = p.baseY + Math.sin(elapsed * 2 + p.phase) * 0.12;
      p.sprite.rotation.y = Math.sin(elapsed * 1.3 + p.phase) * 0.4;
      p.pedestal.scale.setScalar(1 - Math.sin(elapsed * 2 + p.phase) * 0.12);
    }
    this.head.rotation.z = Math.sin(elapsed * 0.9) * 0.05;
    this.head.rotation.y = Math.sin(elapsed * 0.4) * 0.12;
    this.blinkTimer -= dt;
    const blinking = this.blinkTimer < 0.12;
    for (const e of this.eyes) e.scale.y = blinking ? 0.15 : 1;
    if (this.blinkTimer <= 0) this.blinkTimer = 2 + Math.random() * 3;
  }
}
