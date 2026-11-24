import * as THREE from 'three';

/**
 * The Hate ending, outside: the Data Tree seen from the wasteland after he's done in there.
 * The sky has no colour left: flat grey. The Tree loses what colour it had, then comes apart:
 * pieces break off and fall, more and more, ash drifts across, and the whole thing sags into
 * the ground. Then black, and the room outside the PC.
 *
 * Built far from everything else (`origin`); uses the scene's own lights (no new lights: adding
 * one would recompile every shader in the middle of the cutscene).
 */

export type HateTreeSound = 'wind' | 'crumble' | 'groan';

export interface HateTreeHost {
  camera: THREE.PerspectiveCamera;
  aim(pos: THREE.Vector3, target: THREE.Vector3): void;
  origin: THREE.Vector3;
  parent: THREE.Object3D;
  /** A fresh copy of the giant tree model (this scene recolours and owns it). */
  tree: THREE.Object3D;
  fadeEl: HTMLElement;
  shake(amount: number): void;
  /** `crumble` takes how big the break is (0..1). */
  play(id: HateTreeSound, size?: number): void;
  onFinished(): void;
}

const T = { shot2: 5.2, sink: 4.2, out: 10.2, end: 11.4 };
const CHUNKS = 220;
const ASH = 900;
const GREY_SKY = 0x7a7a7a;

interface Chunk {
  live: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  landed: boolean;
}

export class HateTreeScene {
  private t = 0;
  private done = false;
  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private treeRoot = new THREE.Group();
  private mats: { mat: THREE.MeshStandardMaterial; from: THREE.Color; emissive: number }[] = [];
  private height = 30;
  private radius = 10;
  /** Points on the tree's surface (tree-root space) where pieces break off. */
  private surface: THREE.Vector3[] = [];
  private chunks: Chunk[] = [];
  private chunkMesh: THREE.InstancedMesh;
  private chunkCursor = 0;
  private spawnAcc = 0;
  private ash: THREE.Points;
  private ashVel: Float32Array;
  private dust: THREE.Sprite[] = [];
  private nextCrumble = 1.2;
  private nextGroan = 3;
  private eye = new THREE.Vector3();
  private look = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private grey = new THREE.Color();
  private fired = new Set<string>();

  constructor(private host: HateTreeHost) {
    this.group.position.copy(host.origin);
    host.parent.add(this.group);

    // The ground: ash and grit to the horizon
    const groundMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x4c4c4c, roughness: 1, metalness: 0 }));
    const ground = new THREE.Mesh(this.keep(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2)), groundMat);
    this.group.add(ground);
    const rubbleMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 }));
    const rubbleGeo = this.keep(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 70; i++) {
      const r = new THREE.Mesh(rubbleGeo, rubbleMat);
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 90;
      r.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      r.scale.set(0.4 + Math.random() * 1.6, 0.2 + Math.random() * 0.7, 0.4 + Math.random() * 1.6);
      r.rotation.set(Math.random(), Math.random() * 6, Math.random());
      this.group.add(r);
    }

    // The Tree: its own materials, each heading for grey
    const tree = host.tree;
    tree.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const mat = this.keep(
        new THREE.MeshStandardMaterial({
          color: src.color ? src.color.clone() : new THREE.Color(0x777777),
          roughness: 1,
          metalness: 0,
          emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
          emissiveIntensity: src.emissiveIntensity ?? 0,
          flatShading: true,
        })
      );
      m.material = mat;
      m.castShadow = false;
      this.mats.push({ mat, from: mat.color.clone(), emissive: mat.emissiveIntensity });
    });
    tree.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tree);
    const size = box.getSize(new THREE.Vector3());
    const scale = 34 / Math.max(1, size.y); // a colossus in the frame, whatever the model's units
    tree.scale.multiplyScalar(scale);
    tree.updateMatrixWorld(true);
    box.setFromObject(tree);
    tree.position.y -= box.min.y;
    tree.position.x -= (box.min.x + box.max.x) / 2;
    tree.position.z -= (box.min.z + box.max.z) / 2;
    tree.updateMatrixWorld(true);
    box.setFromObject(tree);
    this.height = box.max.y - box.min.y;
    this.radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    this.treeRoot.add(tree);
    this.group.add(this.treeRoot);

    // Where it can break: vertices sampled off the model (tree-root space)
    this.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    tree.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 60));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        // matrixWorld includes the scene group's offset: back to tree-root space
        v.sub(this.group.position);
        if (v.y > 1.5) this.surface.push(v.clone());
      }
    });
    if (this.surface.length === 0) this.surface.push(new THREE.Vector3(0, this.height * 0.5, 0));

    // Falling pieces
    const chunkMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 1, flatShading: true }));
    this.chunkMesh = new THREE.InstancedMesh(this.keep(new THREE.DodecahedronGeometry(0.5, 0)), chunkMat, CHUNKS);
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.count = CHUNKS;
    for (let i = 0; i < CHUNKS; i++) {
      this.chunks.push({ live: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 1, landed: false });
      this.m4.makeScale(0, 0, 0);
      this.chunkMesh.setMatrixAt(i, this.m4);
    }
    this.group.add(this.chunkMesh);

    // Ash on the wind
    const ashPos = new Float32Array(ASH * 3);
    this.ashVel = new Float32Array(ASH);
    for (let i = 0; i < ASH; i++) {
      ashPos[i * 3] = (Math.random() - 0.5) * 120;
      ashPos[i * 3 + 1] = Math.random() * 40;
      ashPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      this.ashVel[i] = 0.4 + Math.random() * 1.2;
    }
    const ashGeo = this.keep(new THREE.BufferGeometry());
    ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
    this.ash = new THREE.Points(
      ashGeo,
      this.keep(new THREE.PointsMaterial({ color: 0xb4b4b4, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false }))
    );
    this.ash.frustumCulled = false;
    this.group.add(this.ash);

    // Dust rolling out at the base as it sinks
    const dustTex = this.keep(this.dustTexture());
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: dustTex, color: 0x8a8a8a, transparent: true, opacity: 0, depthWrite: false })));
      const a = (i / 14) * Math.PI * 2;
      sp.position.set(Math.cos(a) * this.radius * 0.7, 2, Math.sin(a) * this.radius * 0.7);
      sp.userData.a = a;
      sp.scale.setScalar(8);
      this.dust.push(sp);
      this.group.add(sp);
    }

    host.play('wind');
  }

  get time() {
    return this.t;
  }

  private keep<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private dustTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** The sky and haze of this ending: grey, colourless. */
  static readonly SKY = GREY_SKY;

  private once(id: string, at: number, fn: () => void) {
    if (this.t >= at && !this.fired.has(id)) {
      this.fired.add(id);
      fn();
    }
  }

  private breakOff(big: boolean) {
    const c = this.chunks[this.chunkCursor];
    this.chunkCursor = (this.chunkCursor + 1) % CHUNKS;
    const from = this.surface[Math.floor(Math.random() * this.surface.length)];
    // the tree root sinks and leans: pieces leave from where the surface is now
    c.p.copy(from).applyMatrix4(this.treeRoot.matrix);
    const out = Math.atan2(c.p.z, c.p.x);
    c.v.set(Math.cos(out) * (0.5 + Math.random() * 2), Math.random() * 1.5, Math.sin(out) * (0.5 + Math.random() * 2));
    c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.spin.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    c.size = big ? 1.6 + Math.random() * 2.2 : 0.4 + Math.random() * 1.1;
    c.live = true;
    c.landed = false;
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const h = this.host;

    // Colour drains out of it in the first seconds, glow dies
    const drain = THREE.MathUtils.smoothstep(t, 0.2, 3.2);
    for (const { mat, from, emissive } of this.mats) {
      const l = from.r * 0.299 + from.g * 0.587 + from.b * 0.114;
      this.grey.setRGB(l, l, l).multiplyScalar(0.85);
      mat.color.copy(from).lerp(this.grey, drain);
      mat.emissiveIntensity = emissive * (1 - drain);
    }

    // It comes apart: slowly at first, then worse and worse
    const rate = t < 1 ? 0 : 4 + Math.pow(Math.max(0, t - 1), 1.7) * 6;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.breakOff(Math.random() < 0.12 + Math.min(0.3, t * 0.03));
    }
    if (t > this.nextCrumble) {
      const size = Math.min(1, 0.3 + t / T.out);
      h.play('crumble', size);
      h.shake(0.12 + size * 0.25);
      for (let k = 0; k < 4 + size * 8; k++) this.breakOff(true);
      this.nextCrumble = t + Math.max(0.5, 2.2 - t * 0.18) * (0.7 + Math.random() * 0.6);
    }
    if (t > this.nextGroan && t > T.sink) {
      h.play('groan');
      this.nextGroan = t + 2.4 + Math.random() * 1.5;
    }

    // Pieces fall, tumble, smash into the ash and stay there
    for (let i = 0; i < CHUNKS; i++) {
      const c = this.chunks[i];
      if (!c.live) continue;
      if (!c.landed) {
        c.v.y -= 18 * dt;
        c.p.addScaledVector(c.v, dt);
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        if (c.p.y <= c.size * 0.3) {
          c.p.y = c.size * 0.3;
          c.landed = true;
        }
      }
      this.q.setFromEuler(c.rot);
      this.s.setScalar(c.size);
      this.m4.compose(c.p, this.q, this.s);
      this.chunkMesh.setMatrixAt(i, this.m4);
    }
    this.chunkMesh.instanceMatrix.needsUpdate = true;

    // ...and the whole thing sags into the ground, leaning
    const sink = THREE.MathUtils.smoothstep(t, T.sink, T.end) ;
    this.treeRoot.position.y = -sink * this.height * 0.28;
    this.treeRoot.rotation.z = sink * 0.09;
    this.treeRoot.rotation.x = sink * 0.04;
    this.treeRoot.updateMatrix();
    for (const sp of this.dust) {
      const a = sp.userData.a as number;
      const grow = THREE.MathUtils.smoothstep(t, T.sink - 0.5, T.end);
      const r = this.radius * (0.7 + grow * 0.9);
      sp.position.set(Math.cos(a + t * 0.05) * r, 2 + grow * 4, Math.sin(a + t * 0.05) * r);
      sp.scale.setScalar(8 + grow * 14);
      (sp.material as THREE.SpriteMaterial).opacity = grow * 0.55;
    }

    // Ash drifting across, falling
    const pos = this.ash.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ASH; i++) {
      let x = pos.getX(i) + (2.6 + Math.sin(t + i) * 0.6) * dt;
      let y = pos.getY(i) - this.ashVel[i] * dt;
      if (y < 0) y += 40;
      if (x > 60) x -= 120;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;

    // Camera: a wide, low shot of the whole Tree; then in at the foot of it, looking up
    const o = h.origin;
    const H = this.height;
    const R = this.radius;
    if (t < T.shot2) {
      const k = t / T.shot2;
      this.eye.set(o.x + Math.sin(0.4 + k * 0.08) * (R + H * 1.15 - k * 4), o.y + 3.2, o.z + Math.cos(0.4 + k * 0.08) * (R + H * 1.15 - k * 4));
      this.look.set(o.x, o.y + H * 0.42, o.z);
    } else {
      const k = (t - T.shot2) / (T.end - T.shot2);
      this.eye.set(o.x - (R + 9 - k * 2), o.y + 1.6, o.z + R * 0.6 + 6);
      this.look.set(o.x, o.y + H * (0.55 + k * 0.1), o.z);
    }
    h.aim(this.eye, this.look);

    // In from black (cut on a hard frame for the second shot), out to black
    if (t < 1.6) h.fadeEl.style.opacity = String(1 - t / 1.6);
    else if (t > T.shot2 && t < T.shot2 + 0.12) h.fadeEl.style.opacity = '1';
    else if (t > T.out) h.fadeEl.style.opacity = String(Math.min(1, (t - T.out) / (T.end - T.out - 0.2)));
    else h.fadeEl.style.opacity = '0';
    this.once('cut', T.shot2, () => h.play('crumble', 1));

    this.once('end', T.end, () => this.finish());
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.host.fadeEl.style.background = '#000000';
    this.host.fadeEl.style.opacity = '1';
    this.host.onFinished();
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
