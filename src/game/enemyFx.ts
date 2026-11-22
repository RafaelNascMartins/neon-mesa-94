import * as THREE from 'three';

/**
 * Enemy telegraph & status visuals:
 *  - floating "!" alert and "+" buff icons (pixel glyphs with a thick black outline)
 *  - purple poison mist clouds (Gungeon-style: standing in them fills a meter)
 */

function pixelGlyph(rows: string[], fill: string, outline: string): THREE.CanvasTexture {
  const scale = 4;
  const h = rows.length;
  const w = rows[0].length;
  const pad = 2;
  const c = document.createElement('canvas');
  c.width = (w + pad * 2) * scale;
  c.height = (h + pad * 2) * scale;
  const ctx = c.getContext('2d')!;
  const on = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] === '#';
  // Outline: every empty cell touching a filled one (8-neighbourhood, thick)
  ctx.fillStyle = outline;
  for (let y = -pad; y < h + pad; y++) {
    for (let x = -pad; x < w + pad; x++) {
      if (on(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = on(x + dx, y + dy);
      if (near) ctx.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
    }
  }
  ctx.fillStyle = fill;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) ctx.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const ALERT_ROWS = ['..##..', '..##..', '..##..', '..##..', '..##..', '......', '..##..', '..##..'];
const BUFF_ROWS = ['..##..', '..##..', '######', '######', '..##..', '..##..'];

export class EnemyIndicators {
  private alertMat: THREE.SpriteMaterial;
  private buffMat: THREE.SpriteMaterial;

  constructor() {
    const mat = (tex: THREE.Texture) =>
      new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false });
    this.alertMat = mat(pixelGlyph(ALERT_ROWS, '#ffd23a', '#000000'));
    this.buffMat = mat(pixelGlyph(BUFF_ROWS, '#4dff7a', '#000000'));
  }

  /** "!" shown above an enemy that is about to attack. */
  makeAlert(): THREE.Sprite {
    const s = new THREE.Sprite(this.alertMat);
    s.scale.set(0.95, 1.27, 1);
    s.renderOrder = 30;
    return s;
  }

  /** Small "+" shown above an enemy empowered by a skull-ship. */
  makeBuff(): THREE.Sprite {
    const s = new THREE.Sprite(this.buffMat);
    s.scale.set(0.5, 0.5, 1);
    s.renderOrder = 30;
    return s;
  }
}

function softDiscTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Cloud {
  group: THREE.Group;
  disc: THREE.Mesh;
  puffs: THREE.Mesh[];
  bubbles: THREE.Mesh[];
  bubbleMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
  phase: number;
}

/** Lingering purple mist patches laid by the spore blobs. */
export class PoisonClouds {
  private scene: THREE.Scene;
  private clouds: Cloud[] = [];
  private discTex = softDiscTexture();
  private puffGeo = new THREE.DodecahedronGeometry(0.9, 0);
  private bubbleGeo = new THREE.OctahedronGeometry(0.26, 0);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(x: number, z: number, radius = 3.0, life = 6.5) {
    if (this.clouds.length >= 7) this.remove(0);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.15, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.discTex, color: 0xc04dff, transparent: true, opacity: 0, depthWrite: false })
    );
    disc.position.y = 0.07;
    (disc.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;
    group.add(disc);
    // Pulsing rim so the danger edge reads through the desaturating grade
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.9, radius * 1.03, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf0b0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    rim.position.y = 0.09;
    rim.name = 'rim';
    group.add(rim);
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        this.puffGeo,
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xc77dff : 0x7b2cbf, transparent: true, opacity: 0, depthWrite: false })
      );
      m.userData.a = (i / 9) * Math.PI * 2;
      m.userData.r = radius * (0.25 + Math.random() * 0.6);
      m.userData.h = 0.4 + Math.random() * 1.1;
      m.userData.s = 0.8 + Math.random() * 0.9;
      group.add(m);
      puffs.push(m);
    }
    // Bright toxic bubbles rising out of the mist (brights survive the grade, so it reads)
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: 0xf4b8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const bubbles: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(this.bubbleGeo, bubbleMat);
      this.placeBubble(b, radius, Math.random());
      group.add(b);
      bubbles.push(b);
    }
    this.scene.add(group);
    this.clouds.push({ group, disc, puffs, bubbles, bubbleMat, x, z, radius, life, maxLife: life, phase: Math.random() * 6 });
  }

  private placeBubble(b: THREE.Mesh, radius: number, t: number) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius * 0.9;
    b.userData.x = Math.cos(a) * r;
    b.userData.z = Math.sin(a) * r;
    b.userData.t = t; // 0..1 rise progress
    b.userData.speed = 0.45 + Math.random() * 0.4;
  }

  private remove(i: number) {
    const c = this.clouds[i];
    this.scene.remove(c.group);
    (c.disc.material as THREE.Material).dispose();
    c.disc.geometry.dispose();
    const rim = c.group.getObjectByName('rim') as THREE.Mesh | undefined;
    if (rim) {
      rim.geometry.dispose();
      (rim.material as THREE.Material).dispose();
    }
    for (const p of c.puffs) (p.material as THREE.Material).dispose();
    c.bubbleMat.dispose();
    this.clouds.splice(i, 1);
  }

  clear() {
    while (this.clouds.length) this.remove(0);
  }

  /** True when (x, z) is inside any active cloud. */
  contains(x: number, z: number): boolean {
    for (const c of this.clouds) {
      if (c.life > 0.3 && Math.hypot(x - c.x, z - c.z) < c.radius) return true;
    }
    return false;
  }

  update(dt: number, elapsed: number) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.remove(i);
        continue;
      }
      const age = c.maxLife - c.life;
      const fade = Math.min(1, age / 0.5) * Math.min(1, c.life / 0.9);
      (c.disc.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
      const rim = c.group.getObjectByName('rim') as THREE.Mesh | undefined;
      if (rim) (rim.material as THREE.MeshBasicMaterial).opacity = (0.55 + Math.sin(elapsed * 5 + c.phase) * 0.25) * fade;
      for (const p of c.puffs) {
        const a = p.userData.a + elapsed * 0.35 + c.phase;
        p.position.set(Math.cos(a) * p.userData.r, p.userData.h + Math.sin(elapsed * 1.3 + a) * 0.2, Math.sin(a) * p.userData.r);
        p.rotation.set(elapsed * 0.3 + a, elapsed * 0.2, 0);
        p.scale.setScalar(p.userData.s * (0.85 + Math.sin(elapsed * 0.9 + a) * 0.15));
        (p.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
      }
      c.bubbleMat.opacity = fade;
      for (const b of c.bubbles) {
        b.userData.t += dt * b.userData.speed;
        if (b.userData.t >= 1) this.placeBubble(b, c.radius, 0);
        const t = b.userData.t as number;
        b.position.set(b.userData.x + Math.sin(elapsed * 3 + b.userData.z) * 0.08, 0.1 + t * 1.8, b.userData.z);
        b.scale.setScalar(Math.sin(t * Math.PI) * 1.2 + 0.2); // swell, then pop
        b.rotation.y = elapsed * 2;
      }
    }
  }
}
