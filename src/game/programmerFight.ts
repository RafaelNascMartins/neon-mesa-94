import * as THREE from 'three';
import type { WeaponId } from './types';
import { ProgrammerBossBrain, type ProgrammerForm } from './programmerBoss';

/**
 * O Programador's fight: his five bodies and what each one does. The engine keeps one enemy
 * entity for him (so every gun, blast and status effect hits him like anything else); this
 * class moves that hit point around (`x`, `z`, `radius`), says how much damage gets through
 * (`damageScale`) and does all the attacking through the host.
 *
 *  - default (`whoami`): the cowboy, all black. Circles you, fires revolver bursts, sidesteps
 *    when you aim at him. The plain damage window.
 *  - centipede (`spawn --legs=64 --armed`): a long armed centipede crawling round the arena and
 *    cutting through it; leg pairs fire in turn; it dives under the edge and comes up elsewhere.
 *    Only the head takes damage.
 *  - knight (`load knight.exe`): tall black knight. Lunge, leap slam, triple slash; each read
 *    from a red mark on the floor, each followed by an opening (damage x1.5).
 *  - goo (`while true; do fork; done`): black goo spreading, leaning toward you to corner you.
 *    One vital point glows at a time: break it and the goo recedes there; break them all and
 *    the form ends early.
 *  - gun_amalgam (`merge ./weapons/* > self`): a mass of the guns you used this run, floating
 *    over the void after 80% of the floor breaks away. Survival only (no damage): sweeps over
 *    half the strip, barrages with a gap to find. The floor comes back when it ends.
 */

const ARENA = 30;
const RED = 0xff1e3c;
const LANE_HALF = 3.4;

export type ProgrammerSound =
  | 'key'
  | 'execute'
  | 'morph'
  | 'revolver'
  | 'dash'
  | 'telegraph'
  | 'slash'
  | 'slam'
  | 'lunge'
  | 'burrow'
  | 'vital'
  | 'beam'
  | 'floor_break'
  | 'floor_fix'
  | 'hack'
  | 'volley';

export interface ProgrammerHost {
  scene: THREE.Scene;
  /** Cowboy model template (cloned and painted black). */
  hero: THREE.Object3D;
  /** A centred copy of a gun model. */
  weaponCopy(id: WeaponId): THREE.Object3D | null;
  /** Guns the player has used this run (for the amalgam). */
  usedWeapons(): WeaponId[];
  player(): { x: number; z: number; firing: boolean; aimX: number; aimZ: number };
  hurtPlayer(dirX: number, dirZ: number): void;
  shoot(x: number, z: number, dirX: number, dirZ: number, speed: number, color: number): void;
  particles(x: number, y: number, z: number, n: number, color: number, speed: number, life: number): void;
  shake(a: number): void;
  /** Breaks the floor away except a strip |z| < halfDepth (null = whole floor back). */
  setFloorBroken(halfDepth: number | null): void;
  sound(id: ProgrammerSound): void;
}

// ───────────────────────── ground telegraphs ─────────────────────────

type DecalShape = 'circle' | 'ring' | 'sector' | 'rect';

class Decal {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  constructor(parent: THREE.Object3D, shape: DecalShape, arc = Math.PI) {
    let geo: THREE.BufferGeometry;
    if (shape === 'circle') geo = new THREE.CircleGeometry(1, 40);
    else if (shape === 'ring') geo = new THREE.RingGeometry(0.88, 1, 48);
    // centred on -y, which the flip below turns into +z (forward)
    else if (shape === 'sector') geo = new THREE.CircleGeometry(1, 32, -Math.PI / 2 - arc / 2, arc);
    else geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0); // grows forward (+z) from its origin
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.07;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }
  show(x: number, z: number, yaw: number, sx: number, sz: number, opacity: number) {
    this.mesh.visible = opacity > 0.01;
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.mesh.rotation.y = yaw;
    this.mesh.scale.set(sx, 1, sz);
    this.mat.opacity = opacity;
  }
  hide() {
    this.mesh.visible = false;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ───────────────────────── bodies ─────────────────────────

const blackMat = () => new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.85, metalness: 0.1, emissive: 0x000000 });
const glowMat = (c = RED) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, toneMapped: false });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function buildKnight(): { root: THREE.Group; sword: THREE.Group; body: THREE.Group } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.45, metalness: 0.7 });
  const slit = glowMat();
  // legs
  body.add(box(0.55, 1.8, 0.6, armor, -0.42, 0.9, 0), box(0.55, 1.8, 0.6, armor, 0.42, 0.9, 0));
  // skirt of plates
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = box(0.5, 0.9, 0.12, armor, Math.sin(a) * 0.62, 1.75, Math.cos(a) * 0.5);
    p.rotation.y = a;
    p.rotation.x = 0.18;
    body.add(p);
  }
  // torso, pauldrons, helm
  body.add(box(1.5, 1.7, 0.95, armor, 0, 2.9, 0));
  body.add(box(0.95, 0.7, 1.05, armor, -1.0, 3.6, 0), box(0.95, 0.7, 1.05, armor, 1.0, 3.6, 0));
  body.add(box(0.75, 0.95, 0.8, armor, 0, 4.25, 0));
  const visor = box(0.6, 0.07, 0.05, slit, 0, 4.3, 0.42);
  body.add(visor);
  // crest
  body.add(box(0.08, 0.5, 0.9, armor, 0, 4.85, 0));
  // arms
  body.add(box(0.42, 1.5, 0.45, armor, -1.15, 2.65, 0.1), box(0.42, 1.5, 0.45, armor, 1.15, 2.65, 0.25));
  // tattered cape
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3, 1, 4), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide }));
  cape.position.set(0, 2.4, -0.55);
  cape.rotation.x = 0.12;
  body.add(cape);
  // the long sword in the right hand
  const sword = new THREE.Group();
  sword.add(box(0.12, 0.5, 0.12, armor, 0, 0, 0)); // grip
  sword.add(box(0.9, 0.1, 0.16, armor, 0, 0.28, 0)); // guard
  const blade = box(0.2, 4.4, 0.05, new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.25, metalness: 0.9 }), 0, 2.55, 0);
  sword.add(blade);
  sword.add(box(0.04, 4.2, 0.06, slit, 0, 2.5, 0.03)); // the edge glows
  sword.position.set(1.15, 1.95, 0.55);
  sword.rotation.x = Math.PI / 2 - 0.3;
  body.add(sword);
  root.add(body);
  root.scale.setScalar(1.25);
  return { root, sword, body };
}

interface Segment {
  g: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}

function buildCentipede(n: number): { head: THREE.Group; segments: Segment[] } {
  const shell = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.35, metalness: 0.55 });
  const eye = glowMat();
  const head = new THREE.Group();
  head.add(box(1.7, 1.0, 1.6, shell, 0, 0, 0));
  head.add(box(0.28, 0.16, 0.1, eye, -0.45, 0.12, 0.81), box(0.28, 0.16, 0.1, eye, 0.45, 0.12, 0.81));
  for (const s of [-1, 1]) {
    const mand = box(0.18, 0.18, 1.0, shell, s * 0.55, -0.25, 1.1);
    mand.rotation.y = -s * 0.35;
    head.add(mand);
  }
  const segments: Segment[] = [];
  const segGeo = new THREE.BoxGeometry(1.45, 0.85, 1.1);
  const legGeo = new THREE.BoxGeometry(1.4, 0.14, 0.14).translate(0.7, 0, 0);
  const barrelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6).rotateZ(Math.PI / 2).translate(1.55, -0.05, 0);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(segGeo, shell));
    const mk = (side: number) => {
      const leg = new THREE.Group();
      leg.add(new THREE.Mesh(legGeo, shell), new THREE.Mesh(barrelGeo, shell));
      leg.position.set(side * 0.6, -0.1, 0);
      leg.scale.x = side;
      g.add(leg);
      return leg;
    };
    segments.push({ g, legL: mk(-1), legR: mk(1) });
  }
  return { head, segments };
}

// ───────────────────────── the fight ─────────────────────────

type KnightMove = 'approach' | 'lunge' | 'leap' | 'slash' | 'recover';

export class ProgrammerFight {
  readonly brain: ProgrammerBossBrain;
  /** Everything he is, in world space (added to the scene by the engine). */
  readonly root = new THREE.Group();
  /** Where he can be hit this frame, and how big. */
  x = 0;
  z = -10;
  radius = 0.9;
  /** How much of any hit gets through (0 = immune). */
  damageScale = 1;
  /** The body that flashes when hit (the engine's `e.mesh`). */
  hitMesh: THREE.Group;
  /** Hate path: he stopped, on his knees, shaking. */
  broken = false;
  /** Dying (any other soul): dissolving. */
  dying = 0;

  private t = 0;
  private formT = 0;
  private host: ProgrammerHost;
  private disposables: { dispose(): void }[] = [];

  // default body
  private cowboy = new THREE.Group();
  private cowboyModel: THREE.Object3D;
  private yaw = 0;
  private strafe = 1;
  private burstLeft = 0;
  private burstT = 1.2;
  private dodgeCd = 0;
  private dash: { vx: number; vz: number; t: number } | null = null;

  // centipede
  private centi: { head: THREE.Group; segments: Segment[] };
  private centiGroup = new THREE.Group();
  private trail: { x: number; z: number; y: number }[] = [];
  private headX = 0;
  private headZ = 0;
  private headY = 0.9;
  private heading = 0;
  private centiMode: 'loop' | 'charge' | 'dive' | 'under' = 'loop';
  private centiModeT = 0;
  private volleyT = 0;
  private volleyIdx = 0;

  // knight
  private knight: { root: THREE.Group; sword: THREE.Group; body: THREE.Group };
  private kMove: KnightMove = 'approach';
  private kT = 0;
  private kDirX = 0;
  private kDirZ = 1;
  private kTarget = new THREE.Vector2();
  private kFrom = new THREE.Vector2();
  private kSlash = 0;
  private kNext = 0;

  // goo
  private gooGroup = new THREE.Group();
  private gooGeo: THREE.BufferGeometry;
  private gooR: Float32Array;
  private readonly GOO_N = 64;
  private vitals: { a: number; hp: number; mesh: THREE.Mesh; popped: boolean }[] = [];
  private vitalIdx = 0;
  private gooHurtT = 0;

  // amalgam
  private amalgam = new THREE.Group();
  private amalgamParts: THREE.Object3D[] = [];
  private amT = 0;
  private amPhase: 'warn' | 'broken' = 'warn';
  private amMove: 'sweepL' | 'sweepR' | 'barrage' | 'rest' = 'rest';
  private amMoveT = 0;
  private amCycle = 0;
  private amVolleys = 0;
  private laneGlow: THREE.Mesh;
  private beam: THREE.Mesh;

  private decalA: Decal;
  private decalB: Decal;
  private decalC: Decal;
  private ring: Decal;
  private sector: Decal;
  private sectorWide: Decal;

  constructor(host: ProgrammerHost) {
    this.host = host;
    this.brain = new ProgrammerBossBrain(Math.random, (ev) => this.onBrain(ev));

    // ── the black cowboy
    this.cowboyModel = host.hero.clone(true);
    const black = this.keep(blackMat());
    this.cowboyModel.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = black;
    });
    this.cowboy.add(this.cowboyModel);
    const gun = host.weaponCopy('pistol');
    if (gun) {
      gun.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = black;
      });
      gun.position.set(0.42, 1.1, 0.55);
      gun.scale.multiplyScalar(0.85);
      this.cowboy.add(gun);
    }
    // two red pinpricks where his eyes would be
    const eyes = this.keep(glowMat());
    const eyeGeo = this.keep(new THREE.BoxGeometry(0.07, 0.04, 0.02));
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyes);
      e.position.set(s * 0.09, 1.78, 0.25);
      this.cowboy.add(e);
    }
    this.root.add(this.cowboy);
    this.hitMesh = this.cowboy;

    // ── centipede
    this.centi = buildCentipede(22);
    this.centiGroup.add(this.centi.head);
    for (const s of this.centi.segments) this.centiGroup.add(s.g);
    this.centiGroup.visible = false;
    this.root.add(this.centiGroup);

    // ── knight
    this.knight = buildKnight();
    this.knight.root.visible = false;
    this.root.add(this.knight.root);

    // ── goo: a triangle fan whose rim is redrawn every frame
    this.gooR = new Float32Array(this.GOO_N).fill(1);
    const pos = new Float32Array((this.GOO_N + 2) * 3);
    this.gooGeo = this.keep(new THREE.BufferGeometry());
    this.gooGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < this.GOO_N; i++) idx.push(0, i + 1, i + 2);
    this.gooGeo.setIndex(idx);
    const gooMesh = new THREE.Mesh(
      this.gooGeo,
      this.keep(new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide }))
    );
    gooMesh.frustumCulled = false;
    gooMesh.position.y = 0.05;
    this.gooGroup.add(gooMesh);
    const vitalGeo = this.keep(new THREE.SphereGeometry(0.55, 14, 10));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(vitalGeo, this.keep(glowMat()));
      this.gooGroup.add(m);
      this.vitals.push({ a: 0, hp: 0, mesh: m, popped: false });
    }
    this.gooGroup.visible = false;
    this.root.add(this.gooGroup);

    // ── amalgam: the guns of this run, packed into a spinning mass
    const used = host.usedWeapons();
    const list: WeaponId[] = used.length ? used : ['pistol', 'shotgun'];
    for (let i = 0; i < 14; i++) {
      const id = list[i % list.length];
      const copy = host.weaponCopy(id);
      if (!copy) continue;
      copy.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = black;
      });
      const a = (i / 14) * Math.PI * 2;
      const b = Math.acos(1 - (2 * (i + 0.5)) / 14);
      copy.position.set(Math.sin(b) * Math.cos(a) * 1.6, Math.cos(b) * 1.6, Math.sin(b) * Math.sin(a) * 1.6);
      copy.lookAt(copy.position.clone().multiplyScalar(2));
      copy.scale.multiplyScalar(2.2);
      this.amalgam.add(copy);
      this.amalgamParts.push(copy);
    }
    const core = new THREE.Mesh(this.keep(new THREE.SphereGeometry(1.1, 12, 10)), this.keep(glowMat()));
    this.amalgam.add(core);
    this.amalgam.visible = false;
    this.root.add(this.amalgam);

    const laneMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.laneGlow = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(ARENA * 2, LANE_HALF * 2).rotateX(-Math.PI / 2)), laneMat);
    this.laneGlow.position.y = 0.06;
    this.laneGlow.visible = false;
    this.root.add(this.laneGlow);
    const beamMat = this.keep(new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.beam = new THREE.Mesh(this.keep(new THREE.BoxGeometry(ARENA, 2.4, LANE_HALF * 2 + 0.6)), beamMat);
    this.beam.visible = false;
    this.root.add(this.beam);

    this.decalA = new Decal(this.root, 'rect');
    this.decalB = new Decal(this.root, 'circle');
    this.decalC = new Decal(this.root, 'rect');
    this.ring = new Decal(this.root, 'ring');
    this.sector = new Decal(this.root, 'sector', (110 * Math.PI) / 180);
    this.sectorWide = new Decal(this.root, 'sector', (200 * Math.PI) / 180);
    for (const d of [this.decalA, this.decalB, this.decalC, this.ring, this.sector, this.sectorWide]) this.disposables.push(d);

    this.cowboy.position.set(this.x, 0, this.z);
  }

  private keep<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  get form(): ProgrammerForm {
    return this.brain.form;
  }

  // ───────────────────────── brain events ─────────────────────────

  private onBrain(ev: string) {
    const h = this.host;
    if (ev === 'key') h.sound('key');
    else if (ev === 'execute') h.sound('execute');
    else if (ev.startsWith('hud_hack:')) h.sound('hack');
    else if (ev.startsWith('form:')) this.enterForm(ev.slice(5) as ProgrammerForm);
  }

  private glitchBurst(x: number, z: number, n = 30) {
    this.host.particles(x, 1.4, z, n, 0x000000, 10, 0.5);
    this.host.particles(x, 1.4, z, Math.round(n / 2), RED, 12, 0.4);
    this.host.shake(0.35);
    this.host.sound('morph');
  }

  private enterForm(form: ProgrammerForm) {
    // leaving the amalgam: the floor comes back
    if (this.amalgam.visible && form !== 'gun_amalgam') {
      this.host.setFloorBroken(null);
      this.host.sound('floor_fix');
      this.host.particles(0, 0.5, 0, 40, 0xffffff, 12, 0.5);
    }
    this.glitchBurst(this.x, this.z);
    this.formT = 0;
    this.cowboy.visible = form === 'default';
    this.centiGroup.visible = form === 'centipede';
    this.knight.root.visible = form === 'knight';
    this.gooGroup.visible = form === 'goo';
    this.amalgam.visible = form === 'gun_amalgam';
    this.laneGlow.visible = false;
    this.beam.visible = false;
    this.hideDecals();
    const p = this.host.player();

    if (form === 'default') {
      this.hitMesh = this.cowboy;
      this.radius = 0.9;
      this.damageScale = 1;
      // he reassembles where the last body was (inside the arena)
      const r = Math.hypot(this.x, this.z);
      if (r > ARENA - 4) {
        this.x *= (ARENA - 4) / r;
        this.z *= (ARENA - 4) / r;
      }
      this.burstT = 1.2;
    } else if (form === 'centipede') {
      this.hitMesh = this.centi.head;
      this.radius = 1.35;
      this.damageScale = 1.2;
      // it comes up out of the floor at the edge, heading in
      const a = Math.atan2(p.z, p.x) + Math.PI + (Math.random() - 0.5);
      this.headX = Math.cos(a) * (ARENA + 2);
      this.headZ = Math.sin(a) * (ARENA + 2);
      this.heading = Math.atan2(-this.headX, -this.headZ);
      this.trail = [];
      for (let i = 0; i < 160; i++) this.trail.push({ x: this.headX - Math.sin(this.heading) * i * 0.25, z: this.headZ - Math.cos(this.heading) * i * 0.25, y: -2 });
      this.centiMode = 'loop';
      this.centiModeT = 0;
    } else if (form === 'knight') {
      this.hitMesh = this.knight.body;
      this.radius = 1.6;
      this.damageScale = 1;
      this.kMove = 'approach';
      this.kT = 0;
      this.kNext = 0;
    } else if (form === 'goo') {
      // he melts where he stood into the middle of the arena
      this.gooR.fill(2.5);
      this.gooGroup.position.set(0, 0, 0);
      const base = Math.random() * Math.PI * 2;
      for (let i = 0; i < this.vitals.length; i++) {
        const v = this.vitals[i];
        v.a = base + (i / this.vitals.length) * Math.PI * 2;
        v.hp = 55;
        v.popped = false;
        v.mesh.visible = true;
      }
      this.vitalIdx = 0;
      this.damageScale = 1;
      this.radius = 0.85;
      this.gooHurtT = 0;
      this.hitMesh = this.gooGroup;
    } else if (form === 'gun_amalgam') {
      this.hitMesh = this.amalgam;
      this.radius = 2.4;
      this.damageScale = 0;
      this.amT = 0;
      this.amPhase = 'warn';
      this.amMove = 'rest';
      this.amMoveT = 0;
      this.amCycle = 0;
      this.x = 0;
      this.z = -15;
      this.amalgam.position.set(0, 3, -15);
    }
  }

  private hideDecals() {
    for (const d of [this.decalA, this.decalB, this.decalC, this.ring, this.sector, this.sectorWide]) d.hide();
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number) {
    this.t += dt;
    this.formT += dt;
    if (this.dying > 0) {
      this.updateDying(dt);
      return;
    }
    this.brain.update(dt);
    if (this.broken) {
      this.updateBroken(dt);
      return;
    }
    switch (this.brain.form) {
      case 'default':
        this.updateDefault(dt);
        break;
      case 'centipede':
        this.updateCentipede(dt);
        break;
      case 'knight':
        this.updateKnight(dt);
        break;
      case 'goo':
        this.updateGoo(dt);
        break;
      case 'gun_amalgam':
        this.updateAmalgam(dt);
        break;
    }
  }

  /** Default body: circle, burst, sidestep what you aim at him. */
  private updateDefault(dt: number) {
    const h = this.host;
    const p = h.player();
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    // typing: he stands still, one hand up
    const typing = !!this.brain.prompt?.typing;

    if (this.dash) {
      this.dash.t -= dt;
      this.x += this.dash.vx * dt;
      this.z += this.dash.vz * dt;
      if (Math.random() < 0.8) h.particles(this.x, 1, this.z, 1, 0x000000, 2, 0.3);
      if (this.dash.t <= 0) this.dash = null;
    } else if (!typing) {
      // circle at ~9 from you, closing in or backing off
      const want = 9;
      const radial = (d - want) * 0.8;
      const tx = (dx / d) * radial + (-dz / d) * this.strafe * 4.2;
      const tz = (dz / d) * radial + (dx / d) * this.strafe * 4.2;
      const tl = Math.hypot(tx, tz) || 1;
      const sp = Math.min(6.2, tl);
      this.x += (tx / tl) * sp * dt;
      this.z += (tz / tl) * sp * dt;
      if (Math.random() < dt * 0.35) this.strafe *= -1;
    }
    this.clampToArena(1.2);

    // Mirror dodge: you aim at him and pull the trigger, he's already gone sideways
    this.dodgeCd -= dt;
    if (p.firing && this.dodgeCd <= 0 && !this.dash && !typing) {
      const ax = this.x - p.x;
      const az = this.z - p.z;
      const al = Math.hypot(ax, az) || 1;
      const cos = (ax * p.aimX + az * p.aimZ) / al;
      if (cos > 0.97) {
        const side = Math.random() < 0.5 ? 1 : -1;
        this.dash = { vx: (-az / al) * side * 26, vz: (ax / al) * side * 26, t: 0.2 };
        this.dodgeCd = 1.5;
        h.sound('dash');
      }
    }

    // Revolver bursts
    if (!typing) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        if (this.burstLeft <= 0) this.burstLeft = 3;
        h.shoot(this.x + (dx / d) * 0.9, this.z + (dz / d) * 0.9, dx / d, dz / d, 17, RED);
        h.sound('revolver');
        this.burstLeft--;
        this.burstT = this.burstLeft > 0 ? 0.13 : 1.05 + Math.random() * 0.5;
      }
    }

    this.yaw = Math.atan2(dx, dz);
    this.cowboy.position.set(this.x, 0, this.z);
    this.cowboy.rotation.y = this.yaw;
    // glitch: now and then he skips a few centimetres
    this.cowboyModel.position.x = Math.random() < 0.04 ? (Math.random() - 0.5) * 0.25 : 0;
  }

  private clampToArena(margin: number) {
    const r = Math.hypot(this.x, this.z);
    const max = ARENA - margin;
    if (r > max) {
      this.x *= max / r;
      this.z *= max / r;
    }
  }

  /** Centipede: loops the arena, cuts through at you, dives under the edge. */
  private updateCentipede(dt: number) {
    const h = this.host;
    const p = h.player();
    this.centiModeT += dt;
    let targetHeading = this.heading;
    let speed = 10;
    const r = Math.hypot(this.headX, this.headZ);
    if (this.centiMode === 'loop') {
      // follow a wobbling circle of radius ~20
      const a = Math.atan2(this.headZ, this.headX);
      const ring = 19 + Math.sin(this.t * 0.9) * 4;
      const ta = a + 0.45;
      const tx = Math.cos(ta) * ring;
      const tz = Math.sin(ta) * ring;
      targetHeading = Math.atan2(tx - this.headX, tz - this.headZ);
      if (this.centiModeT > 4.2) {
        this.centiMode = 'charge';
        this.centiModeT = 0;
        h.sound('telegraph');
      }
    } else if (this.centiMode === 'charge') {
      targetHeading = Math.atan2(p.x - this.headX, p.z - this.headZ);
      speed = 12.5;
      if (this.centiModeT > 2.6) {
        this.centiMode = 'dive';
        this.centiModeT = 0;
      }
    } else if (this.centiMode === 'dive') {
      // out past the edge and down
      targetHeading = Math.atan2(this.headX, this.headZ);
      speed = 13;
      if (r > ARENA + 1) {
        this.centiMode = 'under';
        this.centiModeT = 0;
        h.sound('burrow');
      }
    } else {
      // under the floor: come up somewhere else once the tail is down too
      speed = 13;
      if (this.centiModeT > 1.6) {
        const a = Math.random() * Math.PI * 2;
        this.headX = Math.cos(a) * (ARENA + 1.5);
        this.headZ = Math.sin(a) * (ARENA + 1.5);
        this.heading = Math.atan2(p.x - this.headX, p.z - this.headZ);
        targetHeading = this.heading;
        this.centiMode = 'loop';
        this.centiModeT = 0;
        h.sound('burrow');
        h.shake(0.3);
        h.particles(Math.cos(a) * ARENA, 0.4, Math.sin(a) * ARENA, 24, 0x2a2a2a, 9, 0.5);
      }
    }
    // steer
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, dh));
    this.headX += Math.sin(this.heading) * speed * dt;
    this.headZ += Math.cos(this.heading) * speed * dt;
    const under = this.centiMode === 'under' || Math.hypot(this.headX, this.headZ) > ARENA + 0.5;
    const targetY = under ? -2.4 : 0.85;
    this.headY += (targetY - this.headY) * Math.min(1, dt * 6);

    // trail: a point every 0.25 of travel
    const last = this.trail[0];
    if (!last || Math.hypot(this.headX - last.x, this.headZ - last.z) >= 0.25) {
      this.trail.unshift({ x: this.headX, z: this.headZ, y: this.headY });
      if (this.trail.length > 200) this.trail.pop();
    }

    // place head + segments
    this.centi.head.position.set(this.headX, this.headY, this.headZ);
    this.centi.head.rotation.y = this.heading;
    const SP = 5; // trail points between segments (1.25 units)
    const segs = this.centi.segments;
    for (let i = 0; i < segs.length; i++) {
      const a = this.trail[Math.min(this.trail.length - 1, (i + 1) * SP)];
      const b = this.trail[Math.min(this.trail.length - 1, (i + 1) * SP - 1)];
      const s = segs[i];
      s.g.position.set(a.x, a.y + Math.sin(this.t * 9 + i) * 0.05, a.z);
      s.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const swing = Math.sin(this.t * 14 + i * 0.8) * 0.45;
      s.legL.rotation.y = swing;
      s.legR.rotation.y = -swing;
    }

    // hit point: the head (nowhere while it's under)
    if (this.headY > 0) {
      this.x = this.headX;
      this.z = this.headZ;
    } else {
      this.x = 999;
      this.z = 999;
    }

    // the body hurts
    for (let i = -1; i < segs.length; i++) {
      const px = i < 0 ? this.headX : segs[i].g.position.x;
      const pz = i < 0 ? this.headZ : segs[i].g.position.z;
      const py = i < 0 ? this.headY : segs[i].g.position.y;
      if (py < 0.2) continue;
      if (Math.hypot(p.x - px, p.z - pz) < 1.15) {
        h.hurtPlayer(p.x - px, p.z - pz);
        break;
      }
    }

    // leg pairs fire in turn, out to both sides
    this.volleyT -= dt;
    if (this.volleyT <= 0) {
      this.volleyT = 0.2;
      this.volleyIdx = (this.volleyIdx + 3) % segs.length;
      const s = segs[this.volleyIdx].g;
      if (s.position.y > 0.3 && Math.hypot(s.position.x, s.position.z) < ARENA - 1) {
        const yaw = s.rotation.y;
        const sx = Math.cos(yaw);
        const sz = -Math.sin(yaw);
        h.shoot(s.position.x + sx * 1.6, s.position.z + sz * 1.6, sx, sz, 10, RED);
        h.shoot(s.position.x - sx * 1.6, s.position.z - sz * 1.6, -sx, -sz, 10, RED);
        if (this.volleyIdx % 6 === 0) h.sound('volley');
      }
    }
  }

  /** Knight: approach, then lunge / leap slam / triple slash, each with an opening after. */
  private updateKnight(dt: number) {
    const h = this.host;
    const p = h.player();
    const k = this.knight;
    this.kT += dt;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    let lift = 0;
    this.damageScale = this.kMove === 'recover' ? 1.5 : 1;

    switch (this.kMove) {
      case 'approach': {
        if (!this.brain.prompt?.typing) {
          const sp = 4.2;
          if (d > 5) {
            this.x += (dx / d) * sp * dt;
            this.z += (dz / d) * sp * dt;
          }
          this.kDirX = dx / d;
          this.kDirZ = dz / d;
        }
        if (this.kT > (this.kNext === 0 ? 1.4 : 0.6) && !this.brain.prompt?.typing) {
          const order: KnightMove[] = ['lunge', 'slash', 'leap'];
          let move = order[this.kNext % 3];
          if (move === 'slash' && d > 8) move = 'lunge';
          this.kNext++;
          this.kMove = move;
          this.kT = 0;
          this.kSlash = 0;
          this.kDirX = dx / d;
          this.kDirZ = dz / d;
          this.kTarget.set(p.x, p.z);
          this.kFrom.set(this.x, this.z);
          h.sound('telegraph');
        }
        break;
      }
      case 'lunge': {
        const yaw = Math.atan2(this.kDirX, this.kDirZ);
        if (this.kT < 0.75) {
          this.decalA.show(this.kFrom.x, this.kFrom.y, yaw, 2.6, 15, 0.25 + (this.kT / 0.75) * 0.35);
        } else if (this.kT < 1.03) {
          if (this.kT - dt < 0.75) h.sound('lunge');
          const sp = 15 / 0.28;
          this.x += this.kDirX * sp * dt;
          this.z += this.kDirZ * sp * dt;
          this.decalA.show(this.kFrom.x, this.kFrom.y, yaw, 2.6, 15, 0.6);
          if (Math.hypot(p.x - this.x, p.z - this.z) < 2) h.hurtPlayer(this.kDirX, this.kDirZ);
        } else {
          this.decalA.hide();
          this.toRecover(1.0);
        }
        break;
      }
      case 'leap': {
        if (this.kT < 1.0) {
          this.ring.show(this.kTarget.x, this.kTarget.y, 0, 3.8, 3.8, 0.35 + this.kT * 0.4);
          this.decalB.show(this.kTarget.x, this.kTarget.y, 0, 3.8 * this.kT, 3.8 * this.kT, 0.25);
          lift = -0.3 * Math.min(1, this.kT * 3); // crouch
        } else if (this.kT < 1.6) {
          const u = (this.kT - 1.0) / 0.6;
          this.x = THREE.MathUtils.lerp(this.kFrom.x, this.kTarget.x, u);
          this.z = THREE.MathUtils.lerp(this.kFrom.y, this.kTarget.y, u);
          lift = 4 * 7 * u * (1 - u);
        } else {
          this.ring.hide();
          this.decalB.hide();
          if (this.kT - dt < 1.6) {
            h.sound('slam');
            h.shake(0.8);
            h.particles(this.x, 0.3, this.z, 36, 0x1a1a1a, 12, 0.5);
            h.particles(this.x, 0.3, this.z, 14, RED, 10, 0.35);
            if (Math.hypot(p.x - this.x, p.z - this.z) < 3.8) h.hurtPlayer(p.x - this.x, p.z - this.z);
          }
          this.toRecover(1.2);
        }
        break;
      }
      case 'slash': {
        // three cuts: two quick, the third slower and wider
        const tele = this.kSlash < 2 ? 0.45 : 0.8;
        const radius = this.kSlash < 2 ? 5.4 : 6.8;
        const decal = this.kSlash < 2 ? this.sector : this.sectorWide;
        if (this.kT < tele) {
          if (this.kT < dt * 1.5) {
            this.kDirX = dx / d;
            this.kDirZ = dz / d;
            // a step in with each cut
            this.x += this.kDirX * 0.8;
            this.z += this.kDirZ * 0.8;
          }
          decal.show(this.x, this.z, Math.atan2(this.kDirX, this.kDirZ), radius, radius, 0.2 + (this.kT / tele) * 0.4);
        } else {
          decal.hide();
          h.sound('slash');
          h.shake(0.25);
          const ang = this.kSlash < 2 ? (110 * Math.PI) / 360 : (200 * Math.PI) / 360;
          const px = p.x - this.x;
          const pz = p.z - this.z;
          const pd = Math.hypot(px, pz) || 1;
          if (pd < radius && Math.acos(Math.max(-1, Math.min(1, (px * this.kDirX + pz * this.kDirZ) / pd))) < ang) {
            h.hurtPlayer(px, pz);
          }
          h.particles(this.x + this.kDirX * 3, 1.4, this.z + this.kDirZ * 3, 10, RED, 9, 0.25);
          this.kSlash++;
          this.kT = -0.15;
          if (this.kSlash >= 3) this.toRecover(1.3);
        }
        break;
      }
      case 'recover': {
        if (this.kT > 0) {
          this.kMove = 'approach';
          this.kT = 0;
        }
        lift = -0.15;
        break;
      }
    }
    this.clampToArena(1.8);
    k.root.position.set(this.x, Math.max(-0.3, lift), this.z);
    k.root.rotation.y = Math.atan2(this.kDirX, this.kDirZ);
    // the sword arm: raised while winding up, swung through on the cut
    const wind = this.kMove === 'slash' || this.kMove === 'lunge' ? Math.min(1, Math.max(0, this.kT) * 3) : 0;
    k.sword.rotation.x = Math.PI / 2 - 0.3 - wind * 0.9;
    k.sword.rotation.z = this.kMove === 'slash' ? Math.sin(this.kSlash * 2.1) * 0.6 : 0;
  }

  private toRecover(sec: number) {
    this.kMove = 'recover';
    this.kT = -sec;
  }

  /** Goo: spreads, leans toward you; break the glowing points to push it back. */
  private updateGoo(dt: number) {
    const h = this.host;
    const p = h.player();
    const pa = Math.atan2(p.z, p.x);
    const N = this.GOO_N;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let da = a - pa;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const lean = Math.max(0, Math.cos(da));
      this.gooR[i] = Math.min(ARENA - 0.5, this.gooR[i] + dt * (0.8 + lean * lean * 2.6));
    }
    // smooth the rim a little
    const pos = this.gooGeo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, 0, 0, 0);
    for (let i = 0; i <= N; i++) {
      const j = i % N;
      const a = (j / N) * Math.PI * 2;
      const r = this.gooR[j] + Math.sin(this.t * 3 + j * 1.7) * 0.35 + Math.sin(this.t * 5.3 + j * 0.6) * 0.2;
      pos.setXYZ(i + 1, Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    this.gooGeo.computeBoundingSphere();

    // standing in it hurts
    const pi = Math.round(((pa + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * N) % N;
    const pd = Math.hypot(p.x, p.z);
    this.gooHurtT -= dt;
    if (pd < this.gooR[pi] - 0.4 && this.gooHurtT <= 0) {
      this.gooHurtT = 0.5;
      h.hurtPlayer(p.x, p.z);
    }
    if (Math.random() < dt * 12) {
      const a = Math.random() * Math.PI * 2;
      const r = this.gooR[Math.floor((a / (Math.PI * 2)) * N) % N] * Math.random();
      h.particles(Math.cos(a) * r, 0.2, Math.sin(a) * r, 1, 0x000000, 1.5, 0.5);
    }

    // vital points sit inside the goo; one glows (and is the one you can hit) at a time
    for (let i = 0; i < this.vitals.length; i++) {
      const v = this.vitals[i];
      if (v.popped) continue;
      const ri = Math.floor((((v.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * N) % N;
      const r = Math.max(1.5, this.gooR[ri] * 0.6);
      v.mesh.position.set(Math.cos(v.a) * r, 0.6 + Math.sin(this.t * 4 + i) * 0.15, Math.sin(v.a) * r);
      const active = i === this.vitalIdx;
      const pulse = active ? 1.15 + Math.sin(this.t * 9) * 0.25 : 0.5;
      v.mesh.scale.setScalar(pulse);
      (v.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 3.2 : 0.6;
      if (active) {
        this.x = v.mesh.position.x;
        this.z = v.mesh.position.z;
      }
    }
  }

  /** A hit got through (after damageScale). Goo: it's the glowing point taking it. */
  onHit(amount: number) {
    if (this.brain.form !== 'goo' || this.dying > 0 || this.broken) return;
    const v = this.vitals[this.vitalIdx];
    if (!v || v.popped) return;
    v.hp -= amount;
    if (v.hp > 0) return;
    v.popped = true;
    v.mesh.visible = false;
    this.host.sound('vital');
    this.host.particles(v.mesh.position.x, 0.8, v.mesh.position.z, 30, RED, 11, 0.45);
    // the goo pulls back on that side
    const N = this.GOO_N;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let da = a - v.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const k = Math.max(0, Math.cos(da));
      this.gooR[i] = Math.max(2, this.gooR[i] - k * k * 9);
    }
    const next = this.vitals.findIndex((q) => !q.popped);
    if (next < 0) {
      this.brain.endGooEarly();
      this.x = 999;
      this.z = 999;
    } else {
      this.vitalIdx = next;
    }
  }

  /** Amalgam: the floor breaks away, then sweeps and barrages over the strip that's left. */
  private updateAmalgam(dt: number) {
    const h = this.host;
    const p = h.player();
    this.amT += dt;
    // the mass: floating, turning, every gun twitching
    this.amalgam.position.set(Math.sin(this.t * 0.6) * 4, 3 + Math.sin(this.t * 1.7) * 0.4, -15);
    this.amalgam.rotation.y += dt * 0.9;
    this.amalgam.rotation.x = Math.sin(this.t * 0.7) * 0.3;
    for (let i = 0; i < this.amalgamParts.length; i++) {
      this.amalgamParts[i].rotation.z = Math.sin(this.t * 7 + i) * 0.15;
    }
    this.x = this.amalgam.position.x;
    this.z = this.amalgam.position.z;

    if (this.amPhase === 'warn') {
      // the strip lights up, everything else flashes: get on it
      this.laneGlow.visible = true;
      (this.laneGlow.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.abs(Math.sin(this.amT * 6)) * 0.18;
      const flash = 0.15 + Math.abs(Math.sin(this.amT * 9)) * 0.25;
      this.decalA.show(0, LANE_HALF, 0, ARENA * 2, ARENA - LANE_HALF, flash);
      this.decalC.show(0, -LANE_HALF, Math.PI, ARENA * 2, ARENA - LANE_HALF, flash);
      this.sector.hide();
      if (this.amT - dt < 0.01) h.sound('telegraph');
      if (this.amT > 2.2) {
        this.amPhase = 'broken';
        this.amMoveT = 0;
        this.decalA.hide();
        this.decalC.hide();
        h.setFloorBroken(LANE_HALF);
        h.sound('floor_break');
        h.shake(1);
      }
      return;
    }
    (this.laneGlow.material as THREE.MeshBasicMaterial).opacity = 0.06;

    this.amMoveT += dt;
    if (this.amMove === 'rest') {
      this.beam.visible = false;
      if (this.amMoveT > 0.55) {
        const cycle: ('sweepL' | 'sweepR' | 'barrage')[] = ['sweepL', 'barrage', 'sweepR', 'sweepL', 'sweepR', 'barrage'];
        this.amMove = cycle[this.amCycle++ % cycle.length];
        // a sweep goes where you are, so you have to cross
        if (this.amMove !== 'barrage') this.amMove = p.x < 0 ? 'sweepL' : 'sweepR';
        this.amMoveT = 0;
        this.amVolleys = 0;
        h.sound('telegraph');
      }
    } else if (this.amMove === 'sweepL' || this.amMove === 'sweepR') {
      const side = this.amMove === 'sweepL' ? -1 : 1;
      const cx = (side * ARENA) / 2;
      if (this.amMoveT < 0.9) {
        this.decalB.hide();
        this.decalA.show(cx, -LANE_HALF, 0, ARENA, LANE_HALF * 2, 0.2 + (this.amMoveT / 0.9) * 0.45);
      } else if (this.amMoveT < 1.35) {
        if (this.amMoveT - dt < 0.9) {
          h.sound('beam');
          h.shake(0.5);
        }
        this.decalA.hide();
        this.beam.visible = true;
        this.beam.position.set(cx, 1.2, 0);
        (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.75 - (this.amMoveT - 0.9);
        if (Math.sign(p.x || 1) === side && Math.abs(p.z) < LANE_HALF + 0.6) h.hurtPlayer(0, 1);
      } else {
        this.beam.visible = false;
        this.amMove = 'rest';
        this.amMoveT = 0;
      }
    } else if (this.amMove === 'barrage') {
      // rows of bullets down the strip with one gap to stand in
      if (this.amMoveT > 0.35 + this.amVolleys * 0.75 && this.amVolleys < 3) {
        const gap = (Math.random() - 0.5) * (ARENA * 1.4);
        for (let x = -ARENA + 1; x <= ARENA - 1; x += 1.6) {
          if (Math.abs(x - gap) < 2.8) continue;
          h.shoot(x, -LANE_HALF - 4, 0, 1, 9, RED);
        }
        h.sound('volley');
        this.amVolleys++;
      }
      if (this.amMoveT > 3) {
        this.amMove = 'rest';
        this.amMoveT = 0;
      }
    }
  }

  /** Hate path: he stops. On his knees, shaking. */
  breakDown() {
    if (this.broken) return;
    this.brain.breakDown();
    if (this.brain.form !== 'default' || !this.cowboy.visible) this.enterForm('default');
    this.broken = true;
    this.damageScale = 0;
    this.hideDecals();
    this.beam.visible = false;
    this.laneGlow.visible = false;
    this.host.setFloorBroken(null);
  }

  private updateBroken(dt: number) {
    void dt;
    this.cowboy.position.set(this.x + (Math.random() - 0.5) * 0.06, -0.35, this.z);
    this.cowboy.rotation.x = 0.25;
  }

  /** Any other soul: he comes apart into black pixels. */
  die() {
    if (this.dying > 0) return;
    this.dying = 0.001;
    this.damageScale = 0;
    this.hideDecals();
    this.beam.visible = false;
    this.laneGlow.visible = false;
    this.host.setFloorBroken(null);
    this.brain.prompt = { text: 'kill -9 $$', typing: false };
  }

  private updateDying(dt: number) {
    this.dying += dt;
    const k = Math.min(1, this.dying / 2.4);
    const body = this.hitMesh;
    body.position.x += (Math.random() - 0.5) * 0.2 * k;
    body.scale.set(1 + k * 0.3, Math.max(0.02, 1 - k), 1 + k * 0.3);
    if (Math.random() < 0.9) this.host.particles(this.x + (Math.random() - 0.5) * 2, Math.random() * 2.4, this.z + (Math.random() - 0.5) * 2, 2, Math.random() < 0.7 ? 0x000000 : RED, 4, 0.6);
    if (k >= 1) body.visible = false;
  }

  get dead() {
    return this.dying >= 2.6;
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
