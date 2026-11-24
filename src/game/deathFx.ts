import * as THREE from 'three';

/**
 * Death screen: on the killing shot the world cuts to black and only the cowboy is left, pure
 * white, frozen mid-pose — then the screen cracks like glass (morte.mp3): a diagonal fracture
 * through the spot the bullet went through him, out past the screen's edges, splintering, and a
 * small web round the bullet hole. Drawn pixelated like the game, inverting what's under it:
 * black across his body, white on the dark.
 *
 * Crack stages follow the sound's own breaks: the impact (0.02s), then splinters at 0.14s,
 * 0.26s and a last spreading web at 0.6s.
 */

/** Only the white cowboy lives on this layer while dying. */
const DEATH_LAYER = 2;
/** Screen pixels per crack pixel (matches the game's chunky look). */
const PX = 3;

export interface DeathFxHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  /** The cowboy model and the gun in his hand, copied as they are right now. */
  heroModel: THREE.Object3D;
  weaponAnchor: THREE.Object3D;
  heroRoot: THREE.Object3D;
  /** Direction the killing shot travelled (world XZ), for where it cracks first. */
  hitDir: THREE.Vector2;
}

interface CrackLine {
  /**
   * Points relative to where the bullet hit, x right / y up. In screen-diagonal units for the
   * glass of the screen breaking (`screen`), else in units of his on-screen height.
   */
  pts: [number, number][];
  screen: boolean;
  at: number;
  grow: number;
  width: number;
}

function jagged(rnd: () => number, from: [number, number], angle: number, length: number, segs: number, jitter: number): [number, number][] {
  const pts: [number, number][] = [from];
  let [x, y] = from;
  let a = angle;
  for (let i = 0; i < segs; i++) {
    a += (rnd() - 0.5) * jitter;
    const step = (length / segs) * (0.6 + rnd() * 0.8);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

/**
 * The whole fracture, with when each line starts and how long it takes to run. `slope` +1 runs
 * the shot's line from lower left to upper right, -1 from upper left to lower right.
 */
function buildCracks(slope: number): CrackLine[] {
  let s = (Math.random() * 1e9) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const lines: CrackLine[] = [];
  const o: [number, number] = [0, 0];
  // 0.02 — the screen itself cracks where the shot went through him: one diagonal fracture
  // running out past both edges of the screen
  const diag = slope > 0 ? Math.PI / 4 : (3 * Math.PI) / 4;
  const tilt = (rnd() - 0.5) * 0.25;
  const top = jagged(rnd, o, diag + tilt, 0.8, 26, 0.35);
  const bottom = jagged(rnd, o, diag + tilt + Math.PI, 0.8, 26, 0.35);
  lines.push({ pts: top, screen: true, at: 0.02, grow: 0.12, width: 3 }, { pts: bottom, screen: true, at: 0.02, grow: 0.12, width: 3 });
  // 0.14 — splinters off the main line
  const branch = (parent: [number, number][], at: number, n: number, len: number, width: number) => {
    const out: [number, number][][] = [];
    for (let i = 0; i < n; i++) {
      const k = 1 + Math.floor(rnd() * (parent.length - 2));
      const [px, py] = parent[k];
      const [qx, qy] = parent[k - 1];
      const dir = Math.atan2(py - qy, px - qx) + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.7);
      const pts = jagged(rnd, [px, py], dir, len * (0.7 + rnd() * 0.6), 7, 0.9);
      lines.push({ pts, screen: true, at, grow: 0.07, width });
      out.push(pts);
    }
    return out;
  };
  const b1 = [...branch(top, 0.14, 4, 0.17, 2), ...branch(bottom, 0.14, 4, 0.17, 2)];
  // 0.26 — the splinters splinter
  for (const p of b1) branch(p, 0.26, 2, 0.08, 1);
  // 0.6 — a web spreading round the bullet hole (sized to him)
  const spokes = 9;
  const rings = [0.1, 0.2, 0.32];
  const spokeEnds: [number, number][][] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rnd() * 0.4;
    const pts = jagged(rnd, o, a, 0.32 + rnd() * 0.14, 5, 0.5);
    lines.push({ pts, screen: false, at: 0.6, grow: 0.12, width: 1 });
    spokeEnds.push(pts);
  }
  for (const r of rings) {
    for (let i = 0; i < spokes; i++) {
      if (rnd() < 0.25) continue; // a few gaps in the web
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      const rr = r * (0.85 + rnd() * 0.3);
      const mid = (a0 + a1) / 2;
      lines.push({
        pts: [
          [Math.cos(a0) * rr, Math.sin(a0) * rr],
          [Math.cos(mid) * rr * 1.08, Math.sin(mid) * rr * 1.08],
          [Math.cos(a1) * rr, Math.sin(a1) * rr],
        ],
        screen: false,
        at: 0.64 + r,
        grow: 0.08,
        width: 1,
      });
    }
  }
  return lines;
}

export class DeathFx {
  private t = 0;
  private group = new THREE.Group();
  private whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private cracks: CrackLine[];
  /** Where the bullet hit him, in units of his height from the chest. */
  private impact: [number, number] = [0, 0];
  private savedBg: THREE.Scene['background'];
  private savedFog: THREE.Scene['fog'];
  private camFrom = new THREE.Vector3();
  private camTo = new THREE.Vector3();
  private chest = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private resize = () => this.fit();

  constructor(private host: DeathFxHost) {
    const { scene, camera, heroModel, weaponAnchor, heroRoot } = host;
    // The white cowboy: a frozen copy of him (and his gun), every surface flat white
    heroRoot.updateMatrixWorld(true);
    for (const src of [heroModel, weaponAnchor]) {
      const copy = src.clone(true);
      copy.visible = true;
      src.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      copy.traverse((o) => {
        o.layers.set(DEATH_LAYER);
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = this.whiteMat;
      });
      this.group.add(copy);
    }
    this.group.traverse((o) => o.layers.set(DEATH_LAYER));
    scene.add(this.group);
    // Everything else gone: black
    this.savedBg = scene.background;
    this.savedFog = scene.fog;
    scene.background = new THREE.Color(0x000000);
    scene.fog = null;
    camera.layers.set(DEATH_LAYER);

    // The camera leans in on him
    this.chest.set(heroRoot.position.x, 1.15, heroRoot.position.z);
    this.camFrom.copy(camera.position);
    this.camTo.copy(this.chest).addScaledVector(this.tmp.copy(camera.position).sub(this.chest), 0.6);

    // Where it breaks first: the side the shot came in from, around the chest
    const hit = host.hitDir.lengthSq() > 1e-4 ? host.hitDir.clone().normalize() : new THREE.Vector2(1, 0);
    // the line leans the way the bullet was travelling across the screen
    this.cracks = buildCracks(hit.x >= 0 ? 1 : -1);
    this.impact = [-hit.x * 0.05, 0.04];

    // White strokes with a "difference" blend: black over his white body, white over the dark
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:23;image-rendering:pixelated;mix-blend-mode:difference;';
    host.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.fit();
    window.addEventListener('resize', this.resize);
  }

  get time() {
    return this.t;
  }

  private fit() {
    const r = this.host.container.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.ceil(r.width / PX));
    this.canvas.height = Math.max(1, Math.ceil(r.height / PX));
  }

  /** World point → crack-canvas pixel. */
  private toCanvas(p: THREE.Vector3): [number, number] {
    this.tmp.copy(p).project(this.host.camera);
    return [((this.tmp.x + 1) / 2) * this.canvas.width, ((1 - this.tmp.y) / 2) * this.canvas.height];
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const cam = this.host.camera;
    const k = THREE.MathUtils.smoothstep(t, 0, 2.2);
    cam.position.lerpVectors(this.camFrom, this.camTo, k * 0.6);
    cam.lookAt(this.chest);
    cam.updateMatrixWorld();
    this.draw();
  }

  private draw() {
    const g = this.ctx;
    const { width: W, height: H } = this.canvas;
    g.clearRect(0, 0, W, H);
    // Figure space → canvas: origin at the chest, unit = his on-screen height
    const [cx, cy] = this.toCanvas(this.chest);
    const head = this.toCanvas(this.tmp.set(this.chest.x, 2.2, this.chest.z).clone());
    const feet = this.toCanvas(this.tmp.set(this.chest.x, 0, this.chest.z).clone());
    const figure = Math.hypot(head[0] - feet[0], head[1] - feet[1]);
    const screen = Math.hypot(W, H);
    const ox = cx + this.impact[0] * figure;
    const oy = cy - this.impact[1] * figure;
    g.strokeStyle = '#fff';
    g.lineCap = 'square';
    g.lineJoin = 'miter';
    for (const line of this.cracks) {
      const p = (this.t - line.at) / line.grow;
      if (p <= 0) continue;
      const pts = line.pts;
      const n = Math.min(pts.length - 1, p * (pts.length - 1));
      const unit = line.screen ? screen : figure;
      g.lineWidth = line.width;
      g.beginPath();
      g.moveTo(Math.round(ox + pts[0][0] * unit), Math.round(oy - pts[0][1] * unit));
      for (let i = 1; i <= Math.ceil(n); i++) {
        const f = Math.min(1, n - (i - 1));
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const x = ax + (bx - ax) * f;
        const y = ay + (by - ay) * f;
        g.lineTo(Math.round(ox + x * unit), Math.round(oy - y * unit));
      }
      g.stroke();
    }
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.group.parent?.remove(this.group);
    this.whiteMat.dispose();
    const { scene, camera } = this.host;
    scene.background = this.savedBg;
    scene.fog = this.savedFog;
    camera.layers.set(0);
  }
}
