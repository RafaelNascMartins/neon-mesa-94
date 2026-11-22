import * as THREE from 'three';

/**
 * Credits dropped by enemies. Four kinds:
 *   small  – copper coin (1)
 *   medium – gold coin (5)
 *   large  – wad of cash (20)
 *   bug    – a glitching pixel insect worth a fortune (45–70); twitches, RGB-splits, teleports a bit
 * Coins pop out with a little arc, bounce, then sit spinning. Within reach (or once the room is
 * clear) they're pulled into the player. Instanced per kind; bugs are a few small groups.
 */

export type CoinTier = 'small' | 'medium' | 'large' | 'bug';

export const COIN_VALUE: Record<Exclude<CoinTier, 'bug'>, number> = { small: 1, medium: 5, large: 20 };

interface Coin {
  tier: CoinTier;
  value: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  phase: number;
  magnet: boolean;
  age: number;
  bug?: THREE.Group;
}

const CAP = 140;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class CoinField {
  private coins: Coin[] = [];
  private meshes: Record<Exclude<CoinTier, 'bug'>, THREE.InstancedMesh>;
  private bugParts: { body: THREE.MeshBasicMaterial; ghostA: THREE.MeshBasicMaterial; ghostB: THREE.MeshBasicMaterial };

  constructor(private scene: THREE.Scene) {
    const mat = (color: number, emissive: number, ei = 0.6) =>
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, metalness: 0.5, roughness: 0.35, flatShading: true });
    // Coins stand on edge (axis along X) so the spin reads from the top-down camera
    const coinGeo = (r: number) => new THREE.CylinderGeometry(r, r, r * 0.28, 10).rotateZ(Math.PI / 2);
    const wad = new THREE.BoxGeometry(0.5, 0.2, 0.3);
    this.meshes = {
      small: new THREE.InstancedMesh(coinGeo(0.17), mat(0xd9853b, 0xb5561a, 0.55), CAP),
      medium: new THREE.InstancedMesh(coinGeo(0.24), mat(0xffd23f, 0xffa800, 0.8), CAP),
      large: new THREE.InstancedMesh(wad, mat(0x4fd25a, 0x1f8f2c, 0.7), CAP),
    };
    for (const m of Object.values(this.meshes)) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.bugParts = {
      body: new THREE.MeshBasicMaterial({ color: 0x39ff6a, toneMapped: false }),
      ghostA: new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }),
      ghostB: new THREE.MeshBasicMaterial({ color: 0x2bd9ff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }),
    };
  }

  get count() {
    return this.coins.length;
  }

  /** Splits a credit amount into coins and throws them out of (x, z). */
  drop(x: number, z: number, amount: number) {
    let left = Math.max(1, Math.round(amount));
    const out: Exclude<CoinTier, 'bug'>[] = [];
    while (left >= 20 && out.length < 4) {
      out.push('large');
      left -= 20;
    }
    while (left >= 5 && out.length < 7) {
      out.push('medium');
      left -= 5;
    }
    while (left > 0 && out.length < 10) {
      out.push('small');
      left -= 1;
    }
    // Whatever didn't fit rides on the last coin
    out.forEach((tier, i) => this.spawn(tier, x, z, COIN_VALUE[tier] + (i === out.length - 1 ? left : 0)));
  }

  /** The jackpot: a glitching bug crawling out of the corpse. */
  dropBug(x: number, z: number, value: number) {
    const g = new THREE.Group();
    const px = (mat: THREE.Material, bx: number, bz: number, s = 0.12, y = 0.2) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      m.position.set(bx, y, bz);
      g.add(m);
    };
    // 8-bit beetle: body, head, six legs, antennae — plus two RGB-shifted ghosts
    const body = new THREE.Group();
    const shape: [number, number][] = [
      [0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0.12, 0.12], [-0.12, 0.12], [0, -0.12], [0.12, -0.12], [-0.12, -0.12],
      [0, 0.24], // head
      [0.24, 0.06], [-0.24, 0.06], [0.24, -0.06], [-0.24, -0.06], [0.24, -0.18], [-0.24, -0.18], // legs
      [0.08, 0.36], [-0.08, 0.36], // antennae
    ];
    for (const [bx, bz] of shape) px(this.bugParts.body, bx, bz);
    body.add(...g.children.splice(0));
    const ghostA = body.clone();
    ghostA.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = this.bugParts.ghostA) : null));
    const ghostB = body.clone();
    ghostB.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = this.bugParts.ghostB) : null));
    ghostA.name = 'ghostA';
    ghostB.name = 'ghostB';
    g.add(body, ghostA, ghostB);
    g.scale.setScalar(1.6);
    this.scene.add(g);
    const c = this.spawn('bug', x, z, value);
    c.bug = g;
  }

  private spawn(tier: CoinTier, x: number, z: number, value: number): Coin {
    if (this.coins.length >= CAP * 2) {
      // Too many on the floor: the oldest small one is quietly merged into this one
      const i = this.coins.findIndex((c) => c.tier === 'small');
      if (i >= 0) {
        value += this.coins[i].value;
        this.coins.splice(i, 1);
      }
    }
    const a = Math.random() * Math.PI * 2;
    const sp = 1.6 + Math.random() * 3.2;
    const c: Coin = {
      tier,
      value,
      x,
      y: 0.6,
      z,
      vx: Math.cos(a) * sp,
      vy: 5 + Math.random() * 3,
      vz: Math.sin(a) * sp,
      spin: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      magnet: false,
      age: 0,
    };
    this.coins.push(c);
    return c;
  }

  /** Room cleared: everything still lying around flies to the player. */
  magnetAll() {
    for (const c of this.coins) c.magnet = true;
  }

  /** Nearest coin to (x, z) within maxD (for the robot dog to fetch). */
  nearest(x: number, z: number, maxD: number): { x: number; z: number; pull: () => void } | null {
    let best: Coin | null = null;
    let bd = maxD;
    for (const c of this.coins) {
      if (c.magnet) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return null;
    const coin = best;
    return { x: coin.x, z: coin.z, pull: () => (coin.magnet = true) };
  }

  /**
   * Physics, magnet and collection. `onCollect` gets each coin's tier and value.
   * `reach` = magnet pickup radius around the player.
   */
  update(dt: number, elapsed: number, px: number, pz: number, reach: number, onCollect: (tier: CoinTier, value: number, x: number, z: number) => void) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      if (!c.magnet && c.age > 0.45 && d < reach) c.magnet = true;
      if (c.magnet && c.age > 0.25) {
        const pull = 9 + Math.min(c.age, 4) * 6 + (reach - Math.min(d, reach)) * 3;
        c.vx += ((dx / (d || 1)) * pull - c.vx) * Math.min(1, dt * 8);
        c.vz += ((dz / (d || 1)) * pull - c.vz) * Math.min(1, dt * 8);
        c.vy += (2.5 - c.vy) * Math.min(1, dt * 6);
        if (d < 0.65) {
          onCollect(c.tier, c.value, c.x, c.z);
          if (c.bug) this.scene.remove(c.bug);
          this.coins.splice(i, 1);
          continue;
        }
      } else {
        c.vy -= 24 * dt;
        c.vx *= Math.max(0, 1 - dt * 1.5);
        c.vz *= Math.max(0, 1 - dt * 1.5);
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      const floor = c.magnet ? 0.5 : 0.22;
      if (c.y < floor) {
        c.y = floor;
        if (!c.magnet) {
          c.vy = Math.abs(c.vy) > 2 ? -c.vy * 0.4 : 0;
          c.vx *= 0.6;
          c.vz *= 0.6;
        }
      }
      if (c.magnet && c.y > 1.4) c.y = 1.4;
      c.spin += dt * (c.magnet ? 14 : 3.2);
      if (c.bug) this.animateBug(c, elapsed, dt);
    }
    this.writeInstances(elapsed);
  }

  private animateBug(c: Coin, elapsed: number, dt: number) {
    const g = c.bug!;
    // Skitters in jerky hops while it lies on the floor
    if (!c.magnet && c.y <= 0.23 && Math.random() < dt * 4) {
      c.vx += (Math.random() - 0.5) * 7;
      c.vz += (Math.random() - 0.5) * 7;
    }
    const glitch = Math.sin(elapsed * 37 + c.phase) * Math.sin(elapsed * 13.7) > 0.55;
    const jx = glitch ? (Math.random() - 0.5) * 0.4 : 0;
    const jz = glitch ? (Math.random() - 0.5) * 0.4 : 0;
    g.position.set(c.x + jx, c.y - 0.1, c.z + jz);
    g.rotation.y = Math.atan2(c.vx, c.vz) + (glitch ? (Math.random() - 0.5) * 1.5 : 0);
    const split = glitch ? 0.18 : 0.05 + Math.abs(Math.sin(elapsed * 6)) * 0.04;
    const a = g.getObjectByName('ghostA');
    const b = g.getObjectByName('ghostB');
    if (a) a.position.set(split, 0.02, 0);
    if (b) b.position.set(-split, 0.04, split * 0.5);
    g.scale.set(1.6 * (glitch ? 1.4 : 1), 1.6 * (glitch ? 0.5 : 1), 1.6);
    this.bugParts.body.color.setHex(glitch && Math.random() < 0.5 ? 0xffffff : 0x39ff6a);
  }

  private writeInstances(elapsed: number) {
    const n = { small: 0, medium: 0, large: 0 };
    for (const c of this.coins) {
      if (c.tier === 'bug') continue;
      const mesh = this.meshes[c.tier];
      const k = n[c.tier];
      if (k >= CAP) continue;
      n[c.tier]++;
      const bob = c.y <= 0.23 ? Math.sin(elapsed * 4 + c.phase) * 0.06 + 0.08 : 0;
      _p.set(c.x, c.y + bob, c.z);
      if (c.tier === 'large') _e.set(0.15 * Math.sin(c.spin), c.spin * 0.5, 0);
      else _e.set(0, c.spin, 0);
      _q.setFromEuler(_e);
      _s.setScalar(c.magnet ? 0.85 : 1);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
    }
    for (const t of ['small', 'medium', 'large'] as const) {
      this.meshes[t].count = n[t];
      this.meshes[t].instanceMatrix.needsUpdate = true;
    }
  }

  /** Grants everything left (leaving the room) and clears the floor. */
  collectAll(onCollect: (tier: CoinTier, value: number, x: number, z: number) => void) {
    for (const c of this.coins) {
      onCollect(c.tier, c.value, c.x, c.z);
      if (c.bug) this.scene.remove(c.bug);
    }
    this.coins = [];
    this.writeInstances(0);
  }

  clear() {
    for (const c of this.coins) if (c.bug) this.scene.remove(c.bug);
    this.coins = [];
    this.writeInstances(0);
  }
}
