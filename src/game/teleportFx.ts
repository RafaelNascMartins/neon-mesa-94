import * as THREE from 'three';

/**
 * Red teleport-in: a ground sigil spins up, a thin column of red light drops from above,
 * widens as the body materialises inside it, then collapses into a flash + shockwave ring.
 * Pooled; each warp animates itself after spawn().
 */

const POOL = 18;

const additive = (hex: number, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

interface Warp {
  group: THREE.Group;
  column: THREE.Mesh;
  core: THREE.Mesh;
  sigil: THREE.Mesh;
  ring: THREE.Mesh;
  shock: THREE.Mesh;
  mats: THREE.MeshBasicMaterial[];
  t: number;
  dur: number;
  height: number;
  active: boolean;
}

export class TeleportFx {
  private warps: Warp[] = [];

  constructor(scene: THREE.Scene) {
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
    const coreGeo = new THREE.CylinderGeometry(0.25, 0.25, 1, 8, 1, true).translate(0, 0.5, 0);
    // Sigil: a broken ring with ticks — reads as "something is being written here"
    const sigilGeo = new THREE.RingGeometry(0.62, 0.9, 24, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.9, 1.05, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const mats = [additive(0xff1e2a, 0), additive(0xffd0d0, 0), additive(0xff2a30, 0), additive(0xff1020, 0), additive(0xff4a3a, 0)];
      const column = new THREE.Mesh(colGeo, mats[0]);
      const core = new THREE.Mesh(coreGeo, mats[1]);
      const sigil = new THREE.Mesh(sigilGeo, mats[2]);
      const ring = new THREE.Mesh(ringGeo, mats[3]);
      const shock = new THREE.Mesh(ringGeo, mats[4]);
      sigil.position.y = 0.05;
      ring.position.y = 0.045;
      shock.position.y = 0.06;
      const group = new THREE.Group();
      group.add(column, core, sigil, ring, shock);
      group.visible = false;
      scene.add(group);
      this.warps.push({ group, column, core, sigil, ring, shock, mats, t: 0, dur: 1, height: 3, active: false });
    }
  }

  spawn(x: number, z: number, radius: number, duration: number, height = 3.2) {
    const w = this.warps.find((v) => !v.active) ?? this.warps[0];
    w.active = true;
    w.t = 0;
    w.dur = duration;
    w.height = height;
    w.group.position.set(x, 0, z);
    w.group.scale.set(radius, 1, radius);
    w.group.visible = true;
  }

  /** 0..1 progress of a warp at (x,z), used by the engine to sync the body. */
  update(dt: number, elapsed: number) {
    for (const w of this.warps) {
      if (!w.active) continue;
      w.t += dt;
      const u = w.t / w.dur; // 0..1 materialise, 1..1.45 collapse
      const [colM, coreM, sigM, ringM, shockM] = w.mats;
      const flick = 0.75 + Math.random() * 0.25;
      if (u < 1) {
        // Sigil spins up and brightens
        sigM.opacity = Math.min(1, u * 3) * 0.95 * flick;
        w.sigil.rotation.y = elapsed * (4 + u * 14);
        ringM.opacity = Math.min(1, u * 2.5) * 0.8;
        w.ring.scale.setScalar(1.25 - u * 0.25);
        // Column: drops from the sky (first 30%), then widens and pulses
        const drop = Math.min(1, u / 0.3);
        w.column.scale.set(0.15 + u * 0.75, w.height * 3 * drop, 0.15 + u * 0.75);
        w.column.position.y = w.height * 3 * (1 - drop);
        colM.opacity = (0.55 + u * 0.4) * flick;
        w.core.scale.set(1, w.height * 3 * drop, 1);
        w.core.position.y = w.column.position.y;
        coreM.opacity = (0.8 + u * 0.2) * flick;
        shockM.opacity = 0;
      } else {
        // Collapse: column pinches shut, shockwave ring runs out
        const k = Math.min(1, (u - 1) / 0.45);
        w.column.scale.x = w.column.scale.z = 0.9 * (1 - k);
        colM.opacity = 0.7 * (1 - k);
        coreM.opacity = 0.9 * (1 - k);
        sigM.opacity = 0.9 * (1 - k);
        ringM.opacity = 0.6 * (1 - k);
        w.shock.scale.setScalar(1 + k * 2.6);
        shockM.opacity = 0.9 * (1 - k);
        if (k >= 1) {
          w.active = false;
          w.group.visible = false;
        }
      }
    }
  }

  reset() {
    for (const w of this.warps) {
      w.active = false;
      w.group.visible = false;
    }
  }
}
