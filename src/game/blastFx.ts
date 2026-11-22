import * as THREE from 'three';

/**
 * Big detonations (the dead ARACHNID.EXE): an additive fireball that swells and fades, a hot
 * core flash, and a ground shockwave ring racing out to the blast radius. Small fixed pools.
 * Also draws the pulsing danger circle under a spider whose fuse is burning.
 */

interface Blast {
  ball: THREE.Mesh;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  t: number;
  radius: number;
}

const POOL = 6;
const LIFE = 0.75;

export class BlastFx {
  private blasts: Blast[] = [];
  private warnings: THREE.Mesh[] = [];
  private warnUsed = 0;

  constructor(private scene: THREE.Scene) {
    const ballGeo = new THREE.IcosahedronGeometry(1, 2);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const add = (color: number) =>
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const ball = new THREE.Mesh(ballGeo, add(0xff5a12));
      const core = new THREE.Mesh(ballGeo, add(0xfff2b0));
      const ring = new THREE.Mesh(ringGeo, add(0xffa040));
      for (const m of [ball, core, ring]) {
        m.visible = false;
        m.frustumCulled = false;
        scene.add(m);
      }
      this.blasts.push({ ball, core, ring, t: -1, radius: 1 });
    }
    const warnGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, depthWrite: false }));
      w.visible = false;
      scene.add(w);
      this.warnings.push(w);
    }
  }

  spawn(x: number, z: number, radius: number) {
    const b = this.blasts.find((q) => q.t < 0) ?? this.blasts.reduce((p, q) => (q.t > p.t ? q : p));
    b.t = 0;
    b.radius = radius;
    b.ball.position.set(x, 0.9, z);
    b.core.position.set(x, 0.9, z);
    b.ring.position.set(x, 0.06, z);
    b.ball.visible = b.core.visible = b.ring.visible = true;
  }

  /** Call every frame for each burning fuse (u = 0..1 progress); unused warnings hide on update. */
  warn(x: number, z: number, radius: number, u: number, elapsed: number) {
    const w = this.warnings[this.warnUsed++];
    if (!w) return;
    w.visible = true;
    w.position.set(x, 0.05, z);
    w.scale.setScalar(radius);
    (w.material as THREE.MeshBasicMaterial).opacity = (0.25 + u * 0.55) * (0.6 + 0.4 * Math.sin(elapsed * (10 + u * 30)));
  }

  update(dt: number) {
    for (let i = this.warnUsed; i < this.warnings.length; i++) this.warnings[i].visible = false;
    this.warnUsed = 0;
    for (const b of this.blasts) {
      if (b.t < 0) continue;
      b.t += dt;
      const u = b.t / LIFE;
      if (u >= 1) {
        b.t = -1;
        b.ball.visible = b.core.visible = b.ring.visible = false;
        continue;
      }
      const grow = 1 - Math.pow(1 - Math.min(1, u * 2.2), 3);
      b.ball.scale.setScalar(b.radius * (0.35 + grow * 0.75));
      b.ball.position.y = 0.9 + u * 1.4;
      (b.ball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u) * 0.85;
      b.core.scale.setScalar(b.radius * 0.45 * Math.max(0, 1 - u * 2.5));
      (b.core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u * 2.5);
      const rr = b.radius * (0.2 + Math.min(1, u * 1.8) * 1.05);
      b.ring.scale.setScalar(rr);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u * 1.4);
    }
  }

  reset() {
    for (const b of this.blasts) {
      b.t = -1;
      b.ball.visible = b.core.visible = b.ring.visible = false;
    }
    for (const w of this.warnings) w.visible = false;
  }
}
