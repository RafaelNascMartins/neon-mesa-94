import * as THREE from 'three';

/**
 * Visual effects for Cem Faces' second coming:
 *  - flamethrower: ground cone outline while he winds up, then a roaring stream of fire
 *  - marked barrage: red lanes painted on the floor showing exactly where the bolts will fly
 *  - impale: the wide kill-line of his screaming charge (tracks you, then locks and blinks)
 *  - the ceiling: a growing shadow where he'll land, falling debris, dust
 *  - death: the red/orange fireball and the fire ring left burning around his charred husk
 * One additive point cloud carries every flame / ember particle (cheap, reads as pixels).
 */

const FIRE_MAX = 420;
const FIRE_COLORS = [new THREE.Color(0xfff1a0), new THREE.Color(0xffa22a), new THREE.Color(0xff4a10), new THREE.Color(0x5a0a04)];

interface FireParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: THREE.Vector3;
  resting: boolean;
  life: number;
}

const additive = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

export class BossReturnFx {
  private scene: THREE.Scene;

  // Fire particles
  private fire: FireParticle[] = [];
  private firePoints: THREE.Points;
  private firePos: Float32Array;
  private fireCol: Float32Array;

  // Flamethrower
  private coneGroup = new THREE.Group();
  private coneFill: THREE.Mesh;
  private coneEdges: THREE.Mesh[] = [];
  private coneArc: THREE.Mesh;
  private coneRange = 1;
  private coneHalf = 0.4;
  private flameOn = false;
  private flameEmit = 0;
  private flameOrigin = new THREE.Vector3();
  private flameYaw = 0;

  // Barrage lanes
  private lanes: THREE.Mesh[] = [];
  private laneMat: THREE.MeshBasicMaterial;

  // Impale line
  private impale: THREE.Mesh;
  private impaleMat: THREE.MeshBasicMaterial;
  private impaleCore: THREE.Mesh;

  // Ceiling drop
  private dropShadow: THREE.Mesh;
  private debris: Debris[] = [];
  private debrisMats: THREE.Material[];

  // Death
  private fireball: THREE.Mesh;
  private fireballT = -1;
  private huskFlames: THREE.Mesh[] = [];
  private huskLight: THREE.PointLight;
  private huskCenter: THREE.Vector3 | null = null;
  private huskEmit = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ── fire point cloud
    this.firePos = new Float32Array(FIRE_MAX * 3);
    this.fireCol = new Float32Array(FIRE_MAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.firePos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.fireCol, 3));
    g.setDrawRange(0, 0);
    this.firePoints = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      })
    );
    this.firePoints.frustumCulled = false;
    scene.add(this.firePoints);

    // ── flamethrower cone (unit cone along +Z, scaled per use)
    this.coneFill = new THREE.Mesh(new THREE.BufferGeometry(), additive(0xff5a14, 0.0));
    this.coneArc = new THREE.Mesh(new THREE.BufferGeometry(), additive(0xff3a10, 0.9));
    for (let i = 0; i < 2; i++) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), additive(0xff3a10, 0.9));
      this.coneEdges.push(edge);
      this.coneGroup.add(edge);
    }
    this.coneGroup.add(this.coneFill, this.coneArc);
    this.coneGroup.position.y = 0.07;
    this.coneGroup.visible = false;
    scene.add(this.coneGroup);

    // ── barrage lanes
    this.laneMat = additive(0xff1e2a, 0.8);
    const laneGeo = new THREE.PlaneGeometry(0.16, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    for (let i = 0; i < 14; i++) {
      const l = new THREE.Mesh(laneGeo, this.laneMat);
      l.position.y = 0.06;
      l.visible = false;
      scene.add(l);
      this.lanes.push(l);
    }

    // ── impale line: wide translucent band + bright centre stripe
    this.impaleMat = additive(0xff1020, 0.35);
    this.impale = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), this.impaleMat);
    this.impaleCore = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), additive(0xffffff, 0.9));
    this.impale.add(this.impaleCore);
    this.impale.position.y = 0.065;
    this.impale.visible = false;
    scene.add(this.impale);

    // ── ceiling drop shadow
    this.dropShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
    );
    this.dropShadow.position.y = 0.05;
    scene.add(this.dropShadow);
    this.debrisMats = [
      new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.9, metalness: 0.4, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x5a2a16, roughness: 0.95, metalness: 0.2, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.8, metalness: 0.7, flatShading: true }),
    ];

    // ── death fireball + husk fire
    this.fireball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), additive(0xff6a1a, 0));
    this.fireball.visible = false;
    scene.add(this.fireball);
    const flameGeo = new THREE.ConeGeometry(0.35, 1.4, 5).translate(0, 0.7, 0);
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(flameGeo, additive(i % 3 === 0 ? 0xffb030 : 0xff5a14, 0.85));
      f.visible = false;
      scene.add(f);
      this.huskFlames.push(f);
    }
    this.huskLight = new THREE.PointLight(0xff6a1a, 0, 18, 1.4);
    scene.add(this.huskLight);
  }

  // ───────────── particles

  private emitFire(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    if (this.fire.length >= FIRE_MAX) this.fire.shift();
    this.fire.push({ x, y, z, vx, vy, vz, life, max: life });
  }

  /** Burst of fire/sparks (used for the explosion and impacts). */
  burst(x: number, y: number, z: number, count: number, speed: number, life = 0.8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.1;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emitFire(x, y, z, Math.cos(a) * s, up * s * 0.8, Math.sin(a) * s, life * (0.5 + Math.random() * 0.7));
    }
  }

  // ───────────── flamethrower

  private buildCone(range: number, half: number) {
    if (range === this.coneRange && half === this.coneHalf) return;
    this.coneRange = range;
    this.coneHalf = half;
    const seg = 18;
    // Sector angle θ (XY plane) maps to (cos θ, 0, -sin θ) after rotateX(-π/2): θ = -π/2 is +Z
    const start = -Math.PI / 2 - half;
    const fill = new THREE.CircleGeometry(range, seg, start, half * 2).rotateX(-Math.PI / 2);
    this.coneFill.geometry.dispose();
    this.coneFill.geometry = fill;
    const arc = new THREE.RingGeometry(range - 0.28, range, seg, 1, start, half * 2).rotateX(-Math.PI / 2);
    this.coneArc.geometry.dispose();
    this.coneArc.geometry = arc;
    this.coneEdges.forEach((e, i) => {
      e.scale.z = range;
      e.rotation.y = (i === 0 ? 1 : -1) * half;
    });
  }

  /** Wind-up: the danger cone is outlined (blinking faster as it's about to fire). */
  showFlameTelegraph(x: number, z: number, yaw: number, range: number, half: number, urgency: number) {
    this.buildCone(range, half);
    this.coneGroup.visible = true;
    this.coneGroup.position.set(x, 0.07, z);
    // Circle sectors start along +X; rotate so the cone's centre points along `yaw` (+Z basis)
    this.coneGroup.rotation.y = yaw;
    const blink = Math.sin(performance.now() * 0.001 * (8 + urgency * 22)) > 0 ? 1 : 0.45;
    (this.coneFill.material as THREE.MeshBasicMaterial).opacity = 0.1 + urgency * 0.16;
    for (const m of [...this.coneEdges, this.coneArc]) (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * blink;
  }

  /** Burning: fire streams along the cone from his chest. */
  setFlame(on: boolean, x = 0, y = 0, z = 0, yaw = 0, range = 9, half = 0.38) {
    this.flameOn = on;
    if (!on) {
      this.coneGroup.visible = false;
      return;
    }
    this.buildCone(range, half);
    this.flameOrigin.set(x, y, z);
    this.flameYaw = yaw;
    this.coneGroup.visible = true;
    this.coneGroup.position.set(x, 0.07, z);
    this.coneGroup.rotation.y = yaw;
    (this.coneFill.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.random() * 0.08;
    for (const m of [...this.coneEdges, this.coneArc]) (m.material as THREE.MeshBasicMaterial).opacity = 0.35;
  }

  // ───────────── barrage lanes

  showLanes(x: number, z: number, yaws: number[], length: number, alpha: number) {
    this.laneMat.opacity = alpha;
    this.lanes.forEach((l, i) => {
      const yaw = yaws[i];
      l.visible = yaw !== undefined;
      if (yaw === undefined) return;
      l.position.set(x, 0.06, z);
      l.rotation.y = yaw;
      l.scale.z = length;
    });
  }

  hideLanes() {
    for (const l of this.lanes) l.visible = false;
  }

  // ───────────── impale line

  showImpale(x: number, z: number, yaw: number, length: number, locked: boolean, elapsed: number) {
    this.impale.visible = true;
    this.impale.position.set(x, 0.065, z);
    this.impale.rotation.y = yaw;
    this.impale.scale.z = length;
    const blink = locked ? (Math.sin(elapsed * 40) > 0 ? 1 : 0.35) : 0.75 + Math.sin(elapsed * 9) * 0.25;
    this.impaleMat.opacity = (locked ? 0.95 : 0.55) * blink;
    (this.impaleCore.material as THREE.MeshBasicMaterial).opacity = locked ? blink : 0.8;
  }

  hideImpale() {
    this.impale.visible = false;
  }

  // ───────────── ceiling drop

  setDropShadow(x: number, z: number, radius: number, alpha: number) {
    this.dropShadow.position.set(x, 0.05, z);
    this.dropShadow.scale.setScalar(Math.max(0.01, radius));
    (this.dropShadow.material as THREE.MeshBasicMaterial).opacity = alpha;
  }

  /** Chunks of ceiling raining down around (x, z). */
  spawnDebris(x: number, z: number, count: number, spread: number, fromY: number) {
    for (let i = 0; i < count; i++) {
      const s = 0.25 + Math.random() * 0.7;
      const geo = Math.random() < 0.5 ? new THREE.BoxGeometry(s, s * 0.4, s * (0.6 + Math.random())) : new THREE.DodecahedronGeometry(s * 0.6, 0);
      const mesh = new THREE.Mesh(geo, this.debrisMats[i % this.debrisMats.length]);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      mesh.position.set(x + Math.cos(a) * r, fromY + Math.random() * 4, z + Math.sin(a) * r);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        vx: Math.cos(a) * (1 + Math.random() * 3),
        vy: -4 - Math.random() * 6,
        vz: Math.sin(a) * (1 + Math.random() * 3),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        resting: false,
        life: 14 + Math.random() * 6,
      });
    }
  }

  // ───────────── death

  explode(x: number, y: number, z: number) {
    this.fireball.position.set(x, y, z);
    this.fireball.visible = true;
    this.fireballT = 0;
    this.burst(x, y, z, 160, 16, 1.4);
    this.burst(x, y + 1, z, 80, 9, 2.0);
  }

  /** Leaves a ring of fire burning around the burnt husk. */
  igniteHusk(x: number, z: number) {
    this.huskCenter = new THREE.Vector3(x, 0, z);
    this.huskFlames.forEach((f, i) => {
      const a = (i / this.huskFlames.length) * Math.PI * 2 + Math.random() * 0.3;
      const r = 2.2 + Math.random() * 2.4;
      f.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      f.userData.base = 0.6 + Math.random() * 0.9;
      f.userData.phase = Math.random() * 10;
      f.visible = true;
    });
    this.huskLight.position.set(x, 2.2, z);
  }

  clearHusk() {
    this.huskCenter = null;
    for (const f of this.huskFlames) f.visible = false;
    this.huskLight.intensity = 0;
  }

  /** Everything off (new floor / new run). */
  reset() {
    this.setFlame(false);
    this.hideLanes();
    this.hideImpale();
    this.setDropShadow(0, 0, 0, 0);
    this.clearHusk();
    this.fireball.visible = false;
    this.fireballT = -1;
    this.fire.length = 0;
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
    }
    this.debris = [];
  }

  // ───────────── per frame

  update(dt: number, elapsed: number) {
    // Flamethrower stream
    if (this.flameOn) {
      this.flameEmit += dt * 140;
      while (this.flameEmit >= 1) {
        this.flameEmit -= 1;
        const yaw = this.flameYaw + (Math.random() * 2 - 1) * this.coneHalf * 0.85;
        const speed = this.coneRange * (1.5 + Math.random() * 0.6);
        this.emitFire(
          this.flameOrigin.x + Math.sin(yaw) * 0.6,
          this.flameOrigin.y,
          this.flameOrigin.z + Math.cos(yaw) * 0.6,
          Math.sin(yaw) * speed,
          -this.flameOrigin.y * 1.6 + Math.random() * 1.5,
          Math.cos(yaw) * speed,
          0.5 + Math.random() * 0.25
        );
      }
    }

    // Husk fire: flickering cones, embers, light
    if (this.huskCenter) {
      for (const f of this.huskFlames) {
        const p = f.userData.phase as number;
        const b = f.userData.base as number;
        const flick = 0.75 + Math.sin(elapsed * 11 + p) * 0.15 + Math.sin(elapsed * 23 + p * 2) * 0.1;
        f.scale.set(1, b * flick, 1);
        f.rotation.y = elapsed * 0.6 + p;
      }
      this.huskLight.intensity = 22 + Math.sin(elapsed * 13) * 5 + Math.sin(elapsed * 31) * 3;
      this.huskEmit += dt * 30;
      while (this.huskEmit >= 1) {
        this.huskEmit -= 1;
        const f = this.huskFlames[Math.floor(Math.random() * this.huskFlames.length)];
        const src = Math.random() < 0.35 ? this.huskCenter : f.position;
        this.emitFire(
          src.x + (Math.random() - 0.5) * 0.8,
          0.3 + Math.random() * 0.6,
          src.z + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.6,
          2 + Math.random() * 2.5,
          (Math.random() - 0.5) * 0.6,
          0.7 + Math.random() * 0.7
        );
      }
    }

    // Fireball
    if (this.fireballT >= 0) {
      this.fireballT += dt;
      const u = Math.min(1, this.fireballT / 0.7);
      this.fireball.scale.setScalar(1 + u * 6.5);
      const m = this.fireball.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - u) * 0.95;
      m.color.setHex(u < 0.25 ? 0xffd27a : u < 0.6 ? 0xff6a1a : 0xc0200a);
      if (u >= 1) {
        this.fireball.visible = false;
        this.fireballT = -1;
      }
    }

    // Debris: fall, bounce once, settle, then sink away
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (!d.resting) {
        d.vy -= 26 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;
        if (d.mesh.position.y <= 0.12) {
          d.mesh.position.y = 0.12;
          if (Math.abs(d.vy) > 6) {
            d.vy = -d.vy * 0.25;
            d.vx *= 0.4;
            d.vz *= 0.4;
            d.spin.multiplyScalar(0.4);
          } else {
            d.resting = true;
          }
        }
      } else if (d.life < 1.5) {
        d.mesh.position.y -= dt * 0.25;
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.debris.splice(i, 1);
      }
    }

    // Fire particles → point cloud (colour runs white-hot → orange → red → soot)
    let n = 0;
    const tmp = new THREE.Color();
    for (let i = this.fire.length - 1; i >= 0; i--) {
      const p = this.fire[i];
      p.life -= dt;
      // Heat rises — but never up into the overhead camera (they'd blow up into giant squares)
      if (p.life <= 0 || p.y > 7.5) {
        this.fire.splice(i, 1);
        continue;
      }
      p.vy = Math.min(p.vy + 3.2 * dt, 6);
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const age = 1 - p.life / p.max;
      const k = Math.min(FIRE_COLORS.length - 1.001, age * (FIRE_COLORS.length - 1));
      const c0 = FIRE_COLORS[Math.floor(k)];
      const c1 = FIRE_COLORS[Math.floor(k) + 1];
      tmp.copy(c0).lerp(c1, k - Math.floor(k));
      const fade = Math.min(1, p.life / (p.max * 0.4));
      this.firePos[n * 3] = p.x;
      this.firePos[n * 3 + 1] = p.y;
      this.firePos[n * 3 + 2] = p.z;
      this.fireCol[n * 3] = tmp.r * fade;
      this.fireCol[n * 3 + 1] = tmp.g * fade;
      this.fireCol[n * 3 + 2] = tmp.b * fade;
      n++;
    }
    const geo = this.firePoints.geometry;
    geo.setDrawRange(0, n);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
