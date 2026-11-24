import * as THREE from 'three';

/**
 * The aero world going corrupt (after its first boss, worse every room): everything in it
 * loses its colour and glow toward a dead grey, black cracks open in the ground, black
 * glitching voxels hang in the air. The sky, fog, floor and light are the engine's
 * (`applyAeroCorruption`); the screen-space part (tears, dead pixels) is in the dither shader.
 */

type Snap = { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity: number };

const DEAD = new THREE.Color(0x56525c);

export class AeroCorruptionFx {
  readonly group = new THREE.Group();
  private snaps = new Map<THREE.Material, Snap>();
  private cracks: { mesh: THREE.Mesh; at: number }[] = [];
  private voxels: THREE.InstancedMesh;
  private voxelState: { x: number; y: number; z: number; s: number; ph: number }[] = [];
  private level = -1;
  private tmpC = new THREE.Color();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private eu = new THREE.Euler();

  /** `world` is the aero world's group: every material in it gets drained by the corruption. */
  constructor(private world: THREE.Object3D) {
    this.group.name = 'aero_corruption';
    world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.material) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (this.snaps.has(mat)) continue;
        const s = mat as THREE.MeshStandardMaterial;
        this.snaps.set(mat, {
          color: s.color?.clone(),
          emissive: s.emissive?.clone(),
          emissiveIntensity: s.emissiveIntensity,
          opacity: mat.opacity,
        });
      }
    });

    // Black cracks across the field (the deeper the corruption, the more of them are open)
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x050407, toneMapped: false });
    let seed = 777;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + Math.sqrt(rand()) * 50;
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;
      let dir = rand() * Math.PI * 2;
      const pos: number[] = [];
      const idx: number[] = [];
      const segs = 6 + Math.floor(rand() * 8);
      let w = 0.35 + rand() * 0.35;
      for (let k = 0; k <= segs; k++) {
        const nx = Math.cos(dir + Math.PI / 2) * w;
        const nz = Math.sin(dir + Math.PI / 2) * w;
        pos.push(x + nx, 0.035, z + nz, x - nx, 0.035, z - nz);
        if (k > 0) {
          const b = (k - 1) * 2;
          idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
        const step = 0.8 + rand() * 1.4;
        x += Math.cos(dir) * step;
        z += Math.sin(dir) * step;
        dir += (rand() - 0.5) * 1.3;
        w *= 0.85;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, crackMat);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.cracks.push({ mesh, at: 0.08 + (i / 46) * 0.9 });
    }

    // Black voxels in the air, glitching in and out of place
    const VOX = 140;
    this.voxels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), VOX);
    this.voxels.frustumCulled = false;
    this.voxels.count = 0;
    for (let i = 0; i < VOX; i++) {
      const a = rand() * Math.PI * 2;
      const r = 3 + rand() * 55;
      this.voxelState.push({ x: Math.cos(a) * r, y: 0.6 + rand() * 12, z: Math.sin(a) * r, s: 0.25 + rand() * 0.9, ph: rand() * 6 });
    }
    this.group.add(this.voxels);
    world.add(this.group);
  }

  /** 0 = untouched, 1 = as corrupt as it gets. */
  set(c: number) {
    if (Math.abs(c - this.level) < 0.002) return;
    this.level = c;
    for (const [mat, s] of this.snaps) {
      const m = mat as THREE.MeshStandardMaterial;
      if (s.color && m.color) {
        const l = s.color.r * 0.299 + s.color.g * 0.587 + s.color.b * 0.114;
        this.tmpC.copy(DEAD).multiplyScalar(0.5 + l * 0.7);
        m.color.copy(s.color).lerp(this.tmpC, Math.min(1, c * 0.95));
      }
      if (s.emissive && m.emissive) m.emissive.copy(s.emissive).lerp(DEAD, c);
      if (s.emissiveIntensity !== undefined) m.emissiveIntensity = s.emissiveIntensity * (1 - c * 0.85);
      // the see-through things (rainbow, bubbles, water) thin out
      if (mat.transparent) mat.opacity = s.opacity * (1 - c * 0.45);
    }
    for (const k of this.cracks) k.mesh.visible = c > k.at;
    this.voxels.count = Math.floor(Math.max(0, c - 0.1) * 1.1 * this.voxelState.length);
    this.group.visible = c > 0.001;
  }

  update(t: number) {
    if (this.level <= 0.001) return;
    const n = this.voxels.count;
    for (let i = 0; i < n; i++) {
      const s = this.voxelState[i];
      // most of the time still; now and then it skips somewhere close
      const skip = Math.sin(t * 13 + s.ph * 7) > 0.96 ? 1 : 0;
      this.v.set(s.x + skip * (Math.sin(s.ph * 31 + t) * 1.5), s.y + Math.sin(t * 0.7 + s.ph) * 0.3, s.z + skip * (Math.cos(s.ph * 17 + t) * 1.5));
      this.q.setFromEuler(this.eu.set(s.ph, t * 0.3 + s.ph, 0));
      const flick = Math.sin(t * 9 + s.ph * 5) > 0.92 ? 0.4 : 1;
      this.sc.setScalar(s.s * flick);
      this.m4.compose(this.v, this.q, this.sc);
      this.voxels.setMatrixAt(i, this.m4);
    }
    this.voxels.instanceMatrix.needsUpdate = true;
  }
}

/** The aero sky, repainted toward dead grey (`c` 0..1), with black tears at the deep end. */
export function paintCorruptSky(canvas: HTMLCanvasElement, c: number) {
  const g = canvas.getContext('2d')!;
  const h = canvas.height;
  const mix = (a: string, b: string) => {
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    return '#' + ca.lerp(cb, c).getHexString();
  };
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, mix('#1e8ff0', '#141218'));
  grad.addColorStop(0.55, mix('#7cc8ff', '#3e3a44'));
  grad.addColorStop(1, mix('#e6f7ff', '#7a7480'));
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, h);
  if (c > 0.35) {
    g.fillStyle = '#000';
    const tears = Math.floor((c - 0.35) * 14);
    for (let i = 0; i < tears; i++) {
      const y = ((i * 97) % h) * 0.8;
      g.fillRect(0, y, canvas.width, 1 + (i % 3));
    }
  }
}
