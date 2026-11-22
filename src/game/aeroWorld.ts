import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { synthAudio } from './audio';
import { buildFlyerModel } from './enemyFlyer';
import { buildEnemyModel, jellyMaterial } from './enemyModels';
import type { EnemyArchetype } from './types';

/**
 * The Frutiger Aero world: after Cem Faces dies for good, someone opens the code and "tries
 * another way". Wet green fields under a clean blue sky, glossy bubbles drifting up, blue glass
 * towers on the horizon, a rainbow, butterflies — and every enemy rebuilt as a shiny jelly blob
 * (same abilities as before, new body).
 */

// ───────────────────────── textures ─────────────────────────

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

let grassTex: THREE.CanvasTexture | null = null;
/** Lush wet grass: bright greens, blade strokes, a few dew sparkles and tiny flowers. */
export function aeroGrassTexture(): THREE.CanvasTexture {
  if (grassTex) return grassTex;
  grassTex = canvasTex(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#4fc23a';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1600; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const l = 3 + Math.random() * 7;
        ctx.strokeStyle = ['#3aa52c', '#6ad84a', '#8fe866', '#2f8f24'][Math.floor(Math.random() * 4)];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y - l);
        ctx.stroke();
      }
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = ['#fff6a0', '#ffffff', '#ffb8e8'][i % 3];
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillRect(x, y, 3, 3);
        ctx.fillStyle = '#ffd23a';
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    },
    1
  );
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(26, 26);
  grassTex.magFilter = THREE.NearestFilter;
  return grassTex;
}

let skyTex: THREE.CanvasTexture | null = null;
export function aeroSkyTexture(): THREE.CanvasTexture {
  if (skyTex) return skyTex;
  skyTex = canvasTex(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1e8ff0');
    g.addColorStop(0.55, '#7cc8ff');
    g.addColorStop(1, '#e6f7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });
  return skyTex;
}

/** Glass tower facade: blue reflective panes with a bright diagonal sheen. */
function towerTexture(): THREE.CanvasTexture {
  return canvasTex(64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 256);
    g.addColorStop(0, '#9fdcff');
    g.addColorStop(0.5, '#2a7fd4');
    g.addColorStop(1, '#0d4fa0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = 'rgba(10,40,90,0.35)';
    for (let y = 0; y < 256; y += 8) ctx.fillRect(0, y, 64, 1);
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 1, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.lineTo(64, 20);
    ctx.lineTo(64, 50);
    ctx.lineTo(0, 90);
    ctx.fill();
  });
}

// ───────────────────────── the world ─────────────────────────

export interface AeroWorld {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
}

export function buildAeroWorld(): AeroWorld {
  const g = new THREE.Group();
  g.name = 'aero_world';
  let seed = 4242;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const o = new THREE.Object3D();

  // Grass tufts scattered over the field (instanced)
  const tuftGeo = mergeGeometries([
    new THREE.ConeGeometry(0.06, 0.45, 3).translate(0, 0.22, 0),
    new THREE.ConeGeometry(0.05, 0.35, 3).rotateZ(0.35).translate(0.06, 0.16, 0),
    new THREE.ConeGeometry(0.05, 0.38, 3).rotateZ(-0.35).translate(-0.06, 0.17, 0.02),
  ]);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0x5ed845, roughness: 0.6, emissive: 0x2a8a1a, emissiveIntensity: 0.35 }), 520);
  for (let i = 0; i < 520; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3 + Math.sqrt(rand()) * 46;
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.rotation.set(0, rand() * 6, 0);
    o.scale.setScalar(0.7 + rand() * 0.9);
    o.updateMatrix();
    tufts.setMatrixAt(i, o.matrix);
  }
  g.add(tufts);

  // Water droplets resting on the grass: little glossy domes
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, emissive: 0x3a8fd0, emissiveIntensity: 0.25 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dropMat, 140);
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + Math.sqrt(rand()) * 40;
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.rotation.set(0, 0, 0);
    o.scale.set(1 + rand() * 1.4, 0.5 + rand() * 0.5, 1 + rand() * 1.4);
    o.updateMatrix();
    drops.setMatrixAt(i, o.matrix);
  }
  g.add(drops);

  // Boundary: a ring of glossy aqua glass bumpers just past the arena edge
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x7fe0ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x2aa8e0, emissiveIntensity: 0.4 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const bumperGeos: THREE.BufferGeometry[] = [];
  const capGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.cos(a) * 31.5;
    const z = Math.sin(a) * 31.5;
    bumperGeos.push(new THREE.CapsuleGeometry(0.9, 1.6, 4, 10).translate(x, 1.7, z));
    capGeos.push(new THREE.SphereGeometry(0.35, 10, 8).translate(x, 3.6, z));
  }
  g.add(new THREE.Mesh(mergeGeometries(bumperGeos), bumperMat), new THREE.Mesh(mergeGeometries(capGeos), capMat));

  // Blue glass towers on the horizon
  const towerMat = new THREE.MeshStandardMaterial({ map: towerTexture(), roughness: 0.1, metalness: 0.4, emissive: 0x1a6ad0, emissiveIntensity: 0.35 });
  const towerGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 2.6 + (i % 2 ? Math.PI : 0) * 0.15;
    const r = 58 + rand() * 30;
    const h = 18 + rand() * 32;
    const w = 4 + rand() * 5;
    const geo = rand() < 0.4 ? new THREE.CylinderGeometry(w * 0.6, w * 0.6, h, 10) : new THREE.BoxGeometry(w, h, w * (0.7 + rand() * 0.6));
    geo.rotateY(rand() * Math.PI);
    geo.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    towerGeos.push(geo.toNonIndexed());
  }
  g.add(new THREE.Mesh(mergeGeometries(towerGeos), towerMat));

  // Puffy white clouds
  const cloudGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 40;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r - 20;
    const cy = 26 + rand() * 14;
    for (let k = 0; k < 5; k++) {
      cloudGeos.push(new THREE.SphereGeometry(3 + rand() * 3, 10, 8).translate(cx + (k - 2) * 3.2, cy + rand() * 2, cz + (rand() - 0.5) * 3));
    }
  }
  const clouds = new THREE.Mesh(mergeGeometries(cloudGeos), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.65, roughness: 1 }));
  g.add(clouds);

  // A rainbow arching over the north horizon
  const bands = [0xff3b3b, 0xff9a2b, 0xffe23b, 0x4dd84a, 0x3ab8ff, 0x6a4dff];
  bands.forEach((c, i) => {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(70 - i * 1.6, 0.8, 6, 64, Math.PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, depthWrite: false, fog: false })
    );
    arc.position.set(0, -6, -110);
    g.add(arc);
  });

  // Bubbles drifting up from the grass (instanced, recycled)
  const BUB = 46;
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.32, emissive: 0x8fd8ff, emissiveIntensity: 0.25, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), bubbleMat, BUB);
  const shine = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), BUB);
  const bubbleState = Array.from({ length: BUB }, () => ({ x: (rand() - 0.5) * 70, y: rand() * 14, z: (rand() - 0.5) * 70, s: 0.4 + rand() * 1.3, v: 0.6 + rand() * 0.9, ph: rand() * 6 }));
  bubbles.frustumCulled = shine.frustumCulled = false;
  g.add(bubbles, shine);

  // Butterflies
  const flies: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; ph: number; cx: number; cz: number; rad: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const bf = new THREE.Group();
    const col = [0xff8a2b, 0x3ab8ff, 0xffe23b, 0xff5ac8][i % 4];
    const wingMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const wingGeo = new THREE.CircleGeometry(0.35, 5).translate(0.32, 0, 0);
    const l = new THREE.Mesh(wingGeo, wingMat);
    const r = new THREE.Mesh(wingGeo, wingMat);
    r.scale.x = -1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    bf.add(l, r, body);
    g.add(bf);
    flies.push({ g: bf, l, r, ph: rand() * 6, cx: (rand() - 0.5) * 40, cz: (rand() - 0.5) * 40, rad: 3 + rand() * 6 });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  return {
    group: g,
    update(elapsed: number, dt: number) {
      for (let i = 0; i < BUB; i++) {
        const b = bubbleState[i];
        b.y += b.v * dt;
        if (b.y > 16) {
          b.y = 0;
          b.x = (Math.random() - 0.5) * 70;
          b.z = (Math.random() - 0.5) * 70;
        }
        const wob = 1 + Math.sin(elapsed * 3 + b.ph) * 0.05;
        p.set(b.x + Math.sin(elapsed * 0.7 + b.ph) * 0.8, b.y + 0.3, b.z);
        sc.set(b.s * wob, b.s / wob, b.s * wob);
        m.compose(p, q, sc);
        bubbles.setMatrixAt(i, m);
        p.x -= b.s * 0.22;
        p.y += b.s * 0.25;
        p.z += b.s * 0.2;
        sc.setScalar(b.s);
        m.compose(p, q, sc);
        shine.setMatrixAt(i, m);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      shine.instanceMatrix.needsUpdate = true;
      for (const f of flies) {
        const t = elapsed * 0.5 + f.ph;
        f.g.position.set(f.cx + Math.cos(t) * f.rad, 1.6 + Math.sin(t * 3) * 0.5, f.cz + Math.sin(t * 1.3) * f.rad);
        f.g.rotation.y = -t + Math.PI / 2;
        const flap = Math.sin(elapsed * 22 + f.ph) * 1.1;
        f.l.rotation.y = flap;
        f.r.rotation.y = -flap;
      }
      clouds.position.x = Math.sin(elapsed * 0.02) * 6;
    },
  };
}

/** Replaces the industrial columns: a glossy white pill with an aqua glass top and a bubble. */
export function buildAeroPillar(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.12, metalness: 0.05, emissive: 0xdff3ff, emissiveIntensity: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5ad0ff, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.7, emissive: 0x2a9ae0, emissiveIntensity: 0.45 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.5, 20), white);
  base.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.45, 2.2, 6, 18), white);
  body.position.y = 2.2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.7, 20), glass);
  band.position.y = 2.6;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), glass);
  orb.position.y = 4.9;
  const hi = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hi.position.set(-0.3, 5.2, 0.35);
  for (const mesh of [base, body, band, orb]) mesh.castShadow = true;
  g.add(base, body, band, orb, hi);
  return g;
}

// ───────────────────────── blob enemies ─────────────────────────

/**
 * The aero version of an enemy: the very same model (same shape, same rig names the engine
 * animates) rebuilt out of glossy jelly blobs. Flyers keep their own model, turned to jelly.
 */
export function buildBlobEnemy(arch: EnemyArchetype, flying = false): THREE.Group {
  if (!flying) {
    const g = buildEnemyModel(arch, true);
    if (g) return g;
  }
  const inner = buildFlyerModel();
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial;
    m.material = jellyMaterial(old.color?.getHex() ?? 0xff9ad8, (old.emissiveIntensity ?? 0) > 1);
  });
  inner.scale.setScalar(1.3);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'blob_body';
  body.add(inner);
  root.add(body);
  root.userData.wings = inner.userData.wings;
  root.userData.blob = true;
  return root;
}

/** Jelly squash-and-stretch on the blob body (call each frame). */
export function wobbleBlob(mesh: THREE.Object3D, elapsed: number, phase: number) {
  const body = mesh.userData.blobBody ?? (mesh.userData.blobBody = mesh.getObjectByName('blob_body'));
  if (!body) return;
  const s = Math.sin(elapsed * 7 + phase) * 0.07;
  body.scale.set(1 + s, 1 - s, 1 + s);

}

// ───────────────────────── "?" / "!" bubble over the hero ─────────────────────────

export function buildEmoteSprite(char: '?' | '!'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(10, 6, 44, 46);
  ctx.fillRect(26, 52, 12, 8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(14, 10, 36, 38);
  ctx.fillRect(28, 48, 8, 8);
  ctx.fillStyle = char === '!' ? '#e0283a' : '#1e6ad0';
  ctx.font = 'bold 34px "Pixelta", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 32, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
  sp.scale.setScalar(1.1);
  sp.renderOrder = 10;
  return sp;
}

// ───────────────────────── the rewrite cutscene (DOM) ─────────────────────────

const SPEECH = 'Hum... vamos tentar de outro jeito então..';
const CODE: { text: string; del?: boolean }[] = [
  { text: '$ vim /DataTree/world.config' },
  { text: 'world.theme      = "INFERNO_INDUSTRIAL";', del: true },
  { text: 'world.theme      = "FRUTIGER_AERO";' },
  { text: 'world.sky        = #8fd3ff;' },
  { text: 'world.floor      = GRAMA_MOLHADA;' },
  { text: 'enemies.material = BLOB;  // mesmas habilidades :)' },
  { text: 'music.play("deep_house.mp3");' },
  { text: ':wq' },
  { text: '$ make world && ./run' },
];

/**
 * Black screen, someone speaking in Pixelta ("Hum... vamos tentar de outro jeito então.."),
 * then a code editor where the world config is rewritten, compile bar, white glitch flash.
 */
export class RewriteCutscene {
  private el: HTMLDivElement;
  private speech: HTMLDivElement;
  private code: HTMLPreElement;
  private flash: HTMLDivElement;
  private t = 0;
  private lastChars = 0;
  private lastCode = '';
  private flashed = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;z-index:30;background:#000;opacity:0;transition:opacity 0.5s;display:flex;align-items:center;justify-content:center;pointer-events:none;';
    this.speech = document.createElement('div');
    this.speech.style.cssText = "font-family:'Pixelta',monospace;color:#f4ead8;font-size:clamp(22px,3.2vw,40px);letter-spacing:0.04em;text-align:center;padding:0 24px;text-shadow:3px 3px 0 #000;";
    this.code = document.createElement('pre');
    this.code.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(680px,calc(100vw - 32px));margin:0;padding:18px 20px;background:#0c0c10;box-shadow:0 0 0 2px #2c2c33;color:#9fdcff;font-family:'VT323','Flat Book',monospace;font-size:clamp(15px,2vw,22px);line-height:1.35;white-space:pre-wrap;display:none;";
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;';
    this.el.append(this.speech, this.code, this.flash);
    parent.appendChild(this.el);
    requestAnimationFrame(() => (this.el.style.opacity = '1'));
  }

  /** Returns true when finished. */
  update(dt: number): boolean {
    this.t += dt;
    const t = this.t;
    // 1) The voice
    if (t > 0.9 && t < 5.6) {
      const u = Math.min(1, (t - 0.9) / 3.2);
      // Linger on the ellipses
      const n = Math.floor(u * SPEECH.length);
      if (n !== this.lastChars) {
        this.lastChars = n;
        this.speech.textContent = '“' + SPEECH.slice(0, n) + '”';
        const ch = SPEECH[n - 1];
        if (ch && ch !== ' ' && ch !== '.') synthAudio.playKeyClick();
      }
    }
    if (t >= 5.6 && this.speech.style.display !== 'none') this.speech.style.display = 'none';
    // 2) The code
    if (t >= 5.8 && t < 11) {
      this.code.style.display = 'block';
      const ct = (t - 5.8) * 38; // chars per second
      let budget = ct;
      const lines: string[] = [];
      for (const line of CODE) {
        if (budget <= 0) break;
        const shown = line.text.slice(0, Math.floor(budget));
        budget -= line.text.length + 6;
        if (line.del && budget > 12) lines.push('<span style="color:#ff5a5a;text-decoration:line-through;opacity:0.6">- ' + esc(line.text) + '</span>');
        else lines.push((line.del ? '<span style="color:#ff5a5a">- ' : '<span style="color:#7dff9a">+ ') + esc(shown) + '</span>');
      }
      if (budget > 0) {
        const bar = Math.min(20, Math.floor(budget / 2));
        lines.push('<span style="color:#ffd23f">compilando ' + '█'.repeat(bar) + '░'.repeat(20 - bar) + ' ' + Math.round((bar / 20) * 100) + '%</span>');
      }
      const html = lines.join('\n') + (Math.floor(t * 3) % 2 ? '▌' : ' ');
      if (html !== this.lastCode) {
        if (html.length > this.lastCode.length && Math.random() < 0.6) synthAudio.playKeyClick();
        this.lastCode = html;
        this.code.innerHTML = html;
      }
    }
    // 3) Glitch + white flash
    if (t >= 10.6 && !this.flashed) {
      this.flashed = true;
      synthAudio.playCrtGlitch();
      this.code.style.transform = 'translate(-50%,-50%) skewX(-12deg) scaleY(0.6)';
      this.code.style.filter = 'hue-rotate(160deg)';
    }
    if (t >= 10.6) this.flash.style.opacity = String(Math.min(1, (t - 10.6) / 0.4));
    return t >= 11.2;
  }

  /** Fades the white flash out over the new world, then removes itself. */
  dispose() {
    this.el.style.transition = 'opacity 0.9s';
    this.el.style.background = 'transparent';
    this.speech.remove();
    this.code.remove();
    this.flash.style.transition = 'opacity 0.9s';
    requestAnimationFrame(() => {
      this.flash.style.opacity = '0';
    });
    window.setTimeout(() => this.el.remove(), 1000);
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
