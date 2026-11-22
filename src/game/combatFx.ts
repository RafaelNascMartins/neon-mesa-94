import * as THREE from 'three';
import type { WeaponId } from './types';

/**
 * Madness-style combat feedback:
 *  - blood: directional droplet spray that leaves stains where each drop lands, plus a pool
 *    under the hit; stains persist on the ground until the sector changes
 *  - spent casings: ejected to the gun's right, bounce, then stay on the floor
 *  - oversized muzzle flash per weapon
 *  - melee swing smear
 * All pools are fixed-size InstancedMeshes (ring buffers), so the cost is flat.
 */

const _o = new THREE.Object3D();
const _c = new THREE.Color();

const BLOOD_STAIN_COLORS = [0x4a070b, 0x5e0a0f, 0x3a0508, 0x6e0d12];
const BLOOD_DROP_COLOR = 0xa3101a;

type CasingKind = 'brass' | 'shell' | 'cell';
const CASING_SPECS: Record<CasingKind, { scale: [number, number, number]; color: number }> = {
  brass: { scale: [0.06, 0.06, 0.16], color: 0xd1a43a },
  shell: { scale: [0.1, 0.1, 0.24], color: 0xb3261e },
  cell: { scale: [0.09, 0.09, 0.2], color: 0x2ee6d6 },
};

const FLASH_SPECS: Partial<Record<WeaponId, { color: number; length: number; width: number }>> = {
  pistol: { color: 0xffd27a, length: 1.1, width: 0.55 },
  pistols: { color: 0xffd27a, length: 0.95, width: 0.5 },
  shotgun: { color: 0xffb347, length: 1.6, width: 1.1 },
  plasma: { color: 0x7ff9ff, length: 0.9, width: 0.45 },
  railgun: { color: 0xffffff, length: 2.4, width: 0.8 },
  rocket: { color: 0xff8a3d, length: 1.8, width: 1.3 },
  nailgun: { color: 0xe8e2d4, length: 0.5, width: 0.3 },
  harpoon: { color: 0xd0b080, length: 0.8, width: 0.6 },
  forkbomb: { color: 0x4dff7a, length: 1.2, width: 0.9 },
  coice: { color: 0xff8a3a, length: 2.4, width: 1.6 },
  juiz: { color: 0xffd27a, length: 1.3, width: 0.8 },
  faces: { color: 0xff1e3c, length: 0.9, width: 0.9 },
  rmrf: { color: 0xff2030, length: 3.0, width: 2.2 },
  macarico: { color: 0xff8a1a, length: 1.4, width: 1.0 },
  disco: { color: 0xd8ecff, length: 0.7, width: 0.7 },
  corrente: { color: 0x7fe8ff, length: 1.2, width: 0.7 },
};

interface Droplet {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

interface Casing {
  active: boolean;
  resting: boolean;
  kind: CasingKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
  bounces: number;
}

/** Irregular blob outline so stains don't read as perfect circles. */
function blobGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const noise = (((Math.sin((i % n) * 12.9898) * 43758.5453) % 1) + 1) % 1;
    const r = 0.5 * (0.72 + noise * 0.38);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function hideAll(mesh: THREE.InstancedMesh) {
  _o.position.set(0, -60, 0);
  _o.scale.setScalar(0.0001);
  _o.updateMatrix();
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, _o.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}

export class CombatFx {
  /** Fired on a casing's first bounce (for a tiny "tink"). */
  public onCasingLand: (() => void) | null = null;

  private readonly scene: THREE.Scene;
  private readonly STAINS: number;
  private readonly DROPS: number;
  private readonly CASINGS: number;

  private stains: THREE.InstancedMesh;
  private stainCursor = 0;
  private dropMesh: THREE.InstancedMesh;
  private drops: Droplet[] = [];
  private dropCursor = 0;
  private casingMesh: THREE.InstancedMesh;
  private casings: Casing[] = [];
  private casingCursor = 0;

  private flash = new THREE.Group();
  private flashMat: THREE.MeshBasicMaterial;
  private flashTimer = 0;
  private flashDuration = 0.06;

  private swing: THREE.Mesh;
  private swingMat: THREE.MeshBasicMaterial;
  private swingTimer = 0;
  private swingDuration = 0.16;
  private swingBaseScale = 1;

  private readonly PUFFS: number;
  private puffMesh: THREE.InstancedMesh;
  private puffs: {
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    scale: number;
    spin: number;
  }[] = [];
  private puffCursor = 0;

  constructor(scene: THREE.Scene, lowSpec: boolean) {
    this.scene = scene;
    this.STAINS = lowSpec ? 160 : 320;
    this.DROPS = lowSpec ? 80 : 160;
    this.CASINGS = lowSpec ? 50 : 110;

    // Ground stains
    this.stains = new THREE.InstancedMesh(
      blobGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
      this.STAINS
    );
    this.stains.frustumCulled = false;
    this.stains.renderOrder = 1;
    for (let i = 0; i < this.STAINS; i++) this.stains.setColorAt(i, _c.setHex(BLOOD_STAIN_COLORS[0]));
    hideAll(this.stains);
    scene.add(this.stains);

    // Airborne droplets
    this.dropMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: BLOOD_DROP_COLOR }),
      this.DROPS
    );
    this.dropMesh.frustumCulled = false;
    hideAll(this.dropMesh);
    scene.add(this.dropMesh);
    for (let i = 0; i < this.DROPS; i++) {
      this.drops.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1 });
    }

    // Spent casings
    this.casingMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35 }),
      this.CASINGS
    );
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = false;
    for (let i = 0; i < this.CASINGS; i++) this.casingMesh.setColorAt(i, _c.setHex(CASING_SPECS.brass.color));
    hideAll(this.casingMesh);
    scene.add(this.casingMesh);
    for (let i = 0; i < this.CASINGS; i++) {
      this.casings.push({
        active: false,
        resting: false,
        kind: 'brass',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        spin: 0,
        bounces: 0,
      });
    }

    // Muzzle flash: long forward spike + crossed star blades (reads from the top-down camera)
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
    const spike = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), this.flashMat);
    spike.scale.set(0.5, 0.35, 1.0);
    spike.position.z = 0.45;
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 1.0), this.flashMat);
    bladeA.rotation.y = Math.PI / 4;
    bladeA.position.z = 0.2;
    const bladeB = bladeA.clone();
    bladeB.rotation.y = -Math.PI / 4;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.flash.add(spike, bladeA, bladeB, core);
    this.flash.visible = false;
    scene.add(this.flash);

    // Melee smear arc, centred on the facing direction (+Z local)
    const arcGeo = new THREE.RingGeometry(0.9, 2.4, 18, 1, -Math.PI / 2 - 0.95, 1.9);
    arcGeo.rotateX(-Math.PI / 2);
    this.swingMat = new THREE.MeshBasicMaterial({
      color: 0xf2efe6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.swing = new THREE.Mesh(arcGeo, this.swingMat);
    this.swing.visible = false;
    scene.add(this.swing);

    // Smoke / dust puffs
    this.PUFFS = lowSpec ? 40 : 80;
    this.puffMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
      this.PUFFS
    );
    this.puffMesh.frustumCulled = false;
    for (let i = 0; i < this.PUFFS; i++) {
      this.puffMesh.setColorAt(i, _c.setHex(0xb8b2a8));
      this.puffs.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1, spin: 0 });
    }
    hideAll(this.puffMesh);
    scene.add(this.puffMesh);
  }

  // ───────────── Blood ─────────────

  private stamp(x: number, z: number, size: number, stretch: number, angle: number, colorHex?: number) {
    const i = this.stainCursor;
    this.stainCursor = (this.stainCursor + 1) % this.STAINS;
    // Tiny height stagger keeps overlapping stains from z-fighting
    _o.position.set(x, 0.04 + (i % 24) * 0.0007, z);
    _o.rotation.set(0, angle, 0);
    _o.scale.set(size * stretch, 1, size);
    _o.updateMatrix();
    this.stains.setMatrixAt(i, _o.matrix);
    this.stains.setColorAt(
      i,
      _c.setHex(colorHex ?? BLOOD_STAIN_COLORS[Math.floor(Math.random() * BLOOD_STAIN_COLORS.length)])
    );
    this.stains.instanceMatrix.needsUpdate = true;
    if (this.stains.instanceColor) this.stains.instanceColor.needsUpdate = true;
  }

  /** Persistent non-blood ground mark (tyre skids, scorch, cracks). */
  stampMark(x: number, z: number, size: number, stretch: number, angle: number, colorHex: number) {
    this.stamp(x, z, size, stretch, angle, colorHex);
  }

  /** Rising, swelling puff of smoke / dust. */
  puff(x: number, y: number, z: number, scale: number, colorHex = 0xb8b2a8, drift = { x: 0, z: 0 }) {
    const p = this.puffs[this.puffCursor];
    const idx = this.puffCursor;
    this.puffCursor = (this.puffCursor + 1) % this.PUFFS;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = drift.x + (Math.random() - 0.5) * 0.8;
    p.vz = drift.z + (Math.random() - 0.5) * 0.8;
    p.vy = 0.9 + Math.random() * 0.8;
    p.life = p.maxLife = 0.9 + Math.random() * 0.6;
    p.scale = scale * (0.8 + Math.random() * 0.4);
    p.spin = (Math.random() - 0.5) * 3;
    this.puffMesh.setColorAt(idx, _c.setHex(colorHex));
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Blood from a hit at (x, z) travelling along (dirX, dirZ).
   * `power` ~0.5 for a graze, ~1.5 for a kill, ~3 for a boss.
   */
  splatter(x: number, z: number, dirX: number, dirZ: number, power: number) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / len;
    const fz = dirZ / len;
    const heading = Math.atan2(fx, fz);

    // Pool / smear under the hit, pushed slightly along the shot
    if (power >= 1) {
      this.stamp(x + fx * 0.4, z + fz * 0.4, 0.9 + power * 0.45, 1.3 + Math.random() * 0.5, heading + Math.PI / 2);
    } else {
      this.stamp(x + fx * 0.3, z + fz * 0.3, 0.35 + power * 0.4, 1.1, Math.random() * Math.PI);
    }

    // Droplets fly out in a cone along the shot direction, each staining where it lands
    const count = Math.round(5 + power * 9);
    for (let k = 0; k < count; k++) {
      const d = this.drops[this.dropCursor];
      this.dropCursor = (this.dropCursor + 1) % this.DROPS;
      const spread = (Math.random() - 0.5) * 1.3;
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const dx = fx * ca - fz * sa;
      const dz = fx * sa + fz * ca;
      const speed = 3 + Math.random() * (5 + power * 3);
      d.active = true;
      d.x = x;
      d.y = 0.9 + Math.random() * 0.5;
      d.z = z;
      d.vx = dx * speed;
      d.vz = dz * speed;
      d.vy = 1.5 + Math.random() * 4;
      d.size = 0.07 + Math.random() * 0.09;
    }
  }

  // ───────────── Casings ─────────────

  /** Ejects a spent case to the gun's right (yaw = facing, +Z forward convention). */
  ejectCasing(x: number, y: number, z: number, yaw: number, weapon: WeaponId) {
    const kind: CasingKind | null =
      weapon === 'pistol' || weapon === 'pistols' ? 'brass' : weapon === 'shotgun' ? 'shell' : weapon === 'railgun' ? 'cell' : null;
    if (!kind) return;
    const c = this.casings[this.casingCursor];
    const idx = this.casingCursor;
    this.casingCursor = (this.casingCursor + 1) % this.CASINGS;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const side = 2.6 + Math.random() * 1.6;
    c.active = true;
    c.resting = false;
    c.kind = kind;
    c.x = x + rightX * 0.25;
    c.y = y;
    c.z = z + rightZ * 0.25;
    c.vx = rightX * side - fwdX * (0.4 + Math.random() * 0.6);
    c.vz = rightZ * side - fwdZ * (0.4 + Math.random() * 0.6);
    c.vy = 3.6 + Math.random() * 1.8;
    c.rx = Math.random() * Math.PI;
    c.ry = yaw + Math.random() * 0.6;
    c.spin = 14 + Math.random() * 10;
    c.bounces = 0;
    this.casingMesh.setColorAt(idx, _c.setHex(CASING_SPECS[kind].color));
    if (this.casingMesh.instanceColor) this.casingMesh.instanceColor.needsUpdate = true;
  }

  // ───────────── Muzzle flash ─────────────

  muzzleFlash(x: number, y: number, z: number, yaw: number, weapon: WeaponId) {
    const spec = FLASH_SPECS[weapon];
    if (!spec) return;
    const jitter = 0.8 + Math.random() * 0.45;
    this.flashMat.color.setHex(spec.color);
    this.flash.position.set(x, y, z);
    this.flash.rotation.set(0, yaw + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.6);
    this.flash.scale.set(spec.width * jitter, spec.width * jitter, spec.length * jitter);
    this.flash.visible = true;
    this.flashDuration = weapon === 'railgun' || weapon === 'rocket' ? 0.08 : 0.05;
    this.flashTimer = this.flashDuration;
  }

  // ───────────── Melee ─────────────

  /** Slash: wide fast white smear at waist height. Slam: short heavy smear low to the ground. */
  meleeSwing(x: number, z: number, yaw: number, style: 'slash' | 'slam' = 'slash', reachScale = 1, heavy = false) {
    const slam = style === 'slam';
    this.swing.position.set(x, slam ? 0.35 : heavy ? 0.8 : 1.0, z);
    this.swing.rotation.set(0, yaw, 0);
    this.swingBaseScale = (slam ? 0.8 : 1.15) * reachScale;
    this.swingMat.color.setHex(slam || heavy ? 0xd9b48a : 0xf2efe6);
    this.swing.visible = true;
    this.swingDuration = slam ? 0.22 : heavy ? 0.26 : 0.14;
    this.swingTimer = this.swingDuration;
  }

  // ───────────── Lifecycle ─────────────

  /** Wipes stains, droplets and casings (call on sector change / new run). */
  clear() {
    for (const d of this.drops) d.active = false;
    for (const c of this.casings) c.active = false;
    for (const p of this.puffs) p.active = false;
    hideAll(this.stains);
    hideAll(this.dropMesh);
    hideAll(this.casingMesh);
    hideAll(this.puffMesh);
    this.stainCursor = 0;
    this.flash.visible = false;
    this.swing.visible = false;
  }

  update(dt: number) {
    // Droplets
    let dropsDirty = false;
    for (let i = 0; i < this.DROPS; i++) {
      const d = this.drops[i];
      if (!d.active) continue;
      dropsDirty = true;
      d.vy -= 22 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y <= 0.05) {
        d.active = false;
        this.stamp(d.x, d.z, d.size * 2.6 + Math.random() * 0.12, 1 + Math.hypot(d.vx, d.vz) * 0.05, Math.atan2(d.vx, d.vz) + Math.PI / 2);
        _o.position.set(0, -60, 0);
        _o.scale.setScalar(0.0001);
      } else {
        _o.position.set(d.x, d.y, d.z);
        _o.scale.setScalar(d.size);
      }
      _o.rotation.set(0, 0, 0);
      _o.updateMatrix();
      this.dropMesh.setMatrixAt(i, _o.matrix);
    }
    if (dropsDirty) this.dropMesh.instanceMatrix.needsUpdate = true;

    // Casings
    let casingsDirty = false;
    for (let i = 0; i < this.CASINGS; i++) {
      const c = this.casings[i];
      if (!c.active || c.resting) continue;
      casingsDirty = true;
      c.vy -= 24 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += c.spin * dt;
      const floor = CASING_SPECS[c.kind].scale[0] * 0.5;
      if (c.y <= floor) {
        c.y = floor;
        if (c.bounces === 0) this.onCasingLand?.();
        if (c.bounces < 2 && Math.abs(c.vy) > 1.2) {
          c.vy = -c.vy * 0.32;
          c.vx *= 0.45;
          c.vz *= 0.45;
          c.spin *= 0.5;
          c.bounces++;
        } else {
          // Settle lying on its side (long axis is local Z, so no pitch)
          c.resting = true;
          c.rx = 0;
        }
      }
      const [sx, sy, sz] = CASING_SPECS[c.kind].scale;
      _o.position.set(c.x, c.y, c.z);
      _o.rotation.set(c.rx, c.ry, 0);
      _o.scale.set(sx, sy, sz);
      _o.updateMatrix();
      this.casingMesh.setMatrixAt(i, _o.matrix);
    }
    if (casingsDirty) this.casingMesh.instanceMatrix.needsUpdate = true;

    // Muzzle flash
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }

    // Melee smear
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const u = 1 - this.swingTimer / this.swingDuration;
      this.swingMat.opacity = (1 - u) * 0.85;
      this.swing.scale.setScalar(this.swingBaseScale * (0.85 + u * 0.3));
      if (this.swingTimer <= 0) this.swing.visible = false;
    }

    // Smoke / dust puffs: rise, swell, then shrink away
    let puffsDirty = false;
    for (let i = 0; i < this.PUFFS; i++) {
      const p = this.puffs[i];
      if (!p.active) continue;
      puffsDirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _o.position.set(0, -60, 0);
        _o.scale.setScalar(0.0001);
      } else {
        const u = 1 - p.life / p.maxLife;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - dt * 1.5;
        p.vz *= 1 - dt * 1.5;
        const s = p.scale * (0.6 + u * 1.4) * (u > 0.7 ? (1 - u) / 0.3 : 1);
        _o.position.set(p.x, p.y, p.z);
        _o.rotation.set(u * p.spin, u * p.spin * 0.7, 0);
        _o.scale.setScalar(Math.max(0.0001, s));
      }
      _o.updateMatrix();
      this.puffMesh.setMatrixAt(i, _o.matrix);
    }
    if (puffsDirty) this.puffMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.stains, this.dropMesh, this.casingMesh, this.flash, this.swing, this.puffMesh);
  }
}
