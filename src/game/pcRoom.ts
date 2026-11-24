import * as THREE from 'three';

/**
 * After an ending: outside the PC, in 3D. First person, sitting at a desk in a dark bedroom at
 * night; the monitor is the only light. The game froze on its last frame (the bug), glitching.
 * The screen dies, "Reiniciando..." (pc_reiniciando.mp3), and it comes back to a plain desktop
 * (pc_religando.mp3): blue sky, a green hill. Then black.
 *
 * The screen is a canvas redrawn as the scene goes; it also tints the light it throws on the room.
 */

export type PcSound = 'reboot' | 'bootup';

export interface PcRoomHost {
  camera: THREE.PerspectiveCamera;
  aim(pos: THREE.Vector3, target: THREE.Vector3): void;
  /** Where the room is built (far from everything else). */
  origin: THREE.Vector3;
  parent: THREE.Object3D;
  /** The game's last frame (data URL), or null. */
  frame: string | null;
  fadeEl: HTMLElement;
  /** What the person at the PC mutters. */
  setSubtitle(text: string | null): void;
  play(id: PcSound): void;
  onFinished(): void;
}

const AT = { off: 6.2, boot: 7.6, desktop: 10.4, out: 16.2, end: 17.6 };
const SW = 640;
const SH = 400;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PcRoomScene {
  private t = 0;
  private done = false;
  private fired = new Set<string>();
  private group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private screenCanvas = document.createElement('canvas');
  private screenCtx: CanvasRenderingContext2D;
  private screenTex: THREE.CanvasTexture;
  private screenLight = new THREE.PointLight(0xff2030, 2.2, 3.2, 1.4);
  private led: THREE.MeshBasicMaterial;
  private frameImg: HTMLImageElement | null = null;
  private desktop: HTMLCanvasElement;
  private redrawIn = 0;
  private handR = new THREE.Group();
  private eye = new THREE.Vector3();
  private look = new THREE.Vector3();
  private camNear: number;
  private camFov: number;

  constructor(private host: PcRoomHost) {
    const o = host.origin;
    this.group.position.copy(o);
    host.parent.add(this.group);
    this.screenCanvas.width = SW;
    this.screenCanvas.height = SH;
    this.screenCtx = this.screenCanvas.getContext('2d')!;
    this.screenTex = this.keep(new THREE.CanvasTexture(this.screenCanvas));
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.led = this.keep(new THREE.MeshBasicMaterial({ color: 0x3fd16a, toneMapped: false }));
    this.desktop = this.paintDesktop();
    if (host.frame) {
      const img = new Image();
      img.onload = () => {
        this.frameImg = img;
      };
      img.src = host.frame;
    }
    this.build();
    this.camNear = host.camera.near;
    this.camFov = host.camera.fov;
    host.camera.near = 0.03;
    host.camera.fov = 52;
    host.camera.updateProjectionMatrix();
    host.fadeEl.style.background = '#000000';
    host.fadeEl.style.opacity = '1';
  }

  get time() {
    return this.t;
  }

  private keep<T extends { dispose(): void }>(x: T) {
    this.disposables.push(x);
    return x;
  }

  private mat(color: number, roughness = 0.85, metalness = 0.05, extra: THREE.MeshStandardMaterialParameters = {}) {
    return this.keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    const mesh = new THREE.Mesh(this.keep(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  /** Room (local space: you sit at the origin facing -Z). */
  private build() {
    const g = this.group;
    const rnd = seeded(5);
    // Walls / floor / ceiling: a small bedroom, dark wallpaper
    const wallTex = this.keep(
      canvasTex(128, 128, (c) => {
        c.fillStyle = '#2a2630';
        c.fillRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x += 16) {
          c.fillStyle = 'rgba(0,0,0,0.18)';
          c.fillRect(x, 0, 6, 128);
        }
        for (let i = 0; i < 300; i++) {
          c.fillStyle = `rgba(0,0,0,${rnd() * 0.15})`;
          c.fillRect(rnd() * 128, rnd() * 128, 2, 2);
        }
      })
    );
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(4, 2);
    const room = new THREE.Mesh(this.keep(new THREE.BoxGeometry(4.2, 2.7, 4.6)), this.mat(0xffffff, 0.95, 0, { map: wallTex, side: THREE.BackSide }));
    room.position.set(0, 1.35, -0.6);
    g.add(room);
    const floor = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(4.2, 4.6)), this.mat(0x2b1d14, 0.7));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.002, -0.6);
    g.add(floor);

    // Desk
    const wood = this.mat(0x2e2219, 0.7);
    this.box(1.5, 0.04, 0.75, wood, 0, 0.74, -0.95);
    this.box(0.04, 0.72, 0.7, wood, -0.72, 0.36, -0.95);
    this.box(0.04, 0.72, 0.7, wood, 0.72, 0.36, -0.95);
    this.box(1.5, 0.5, 0.02, wood, 0, 0.47, -1.31);

    // Monitor
    const plastic = this.mat(0x111114, 0.5, 0.2);
    this.box(0.66, 0.42, 0.04, plastic, 0, 1.08, -1.12);
    const screen = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(0.62, 0.38)), this.keep(new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false })));
    screen.position.set(0, 1.08, -1.097);
    g.add(screen);
    this.box(0.06, 0.2, 0.04, plastic, 0, 0.84, -1.16);
    this.box(0.26, 0.015, 0.18, plastic, 0, 0.765, -1.14);
    const led = new THREE.Mesh(this.keep(new THREE.CircleGeometry(0.004, 8)), this.led);
    led.position.set(0.29, 0.885, -1.098);
    g.add(led);
    this.screenLight.position.set(0, 1.08, -0.85);
    g.add(this.screenLight);

    // PC tower under the desk, its fan glow dying with it
    this.box(0.2, 0.44, 0.44, plastic, 0.5, 0.22, -1.0);

    // Keyboard (keys as a texture) and mouse
    const keysTex = this.keep(
      canvasTex(256, 80, (c) => {
        c.fillStyle = '#0c0c0e';
        c.fillRect(0, 0, 256, 80);
        c.fillStyle = '#1d1d22';
        for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) c.fillRect(4 + k * 16.5, 4 + r * 15, 14, 12);
      })
    );
    const kb = this.box(0.46, 0.02, 0.15, this.mat(0xffffff, 0.6, 0.1, { map: keysTex }), -0.05, 0.77, -0.78);
    kb.rotation.x = 0.06;
    const mouse = this.box(0.06, 0.03, 0.1, plastic, 0.3, 0.775, -0.78);
    mouse.scale.set(1, 1, 1);

    // Clutter: a mug, papers, an empty can, a dead desk lamp
    const mug = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12)), this.mat(0x6a6058, 0.6));
    mug.position.set(-0.5, 0.81, -0.88);
    g.add(mug);
    for (let i = 0; i < 3; i++) {
      const p = this.box(0.21, 0.002, 0.29, this.mat(0x8a877e, 0.9), -0.42 + i * 0.03, 0.762 + i * 0.002, -1.05 + i * 0.02);
      p.rotation.y = (rnd() - 0.5) * 0.5;
    }
    const can = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 12)), this.mat(0x3a5a2a, 0.4, 0.6));
    can.position.set(0.58, 0.82, -1.1);
    g.add(can);
    this.box(0.12, 0.02, 0.12, plastic, 0.62, 0.77, -1.25);
    const arm = this.box(0.02, 0.4, 0.02, plastic, 0.62, 0.97, -1.25);
    arm.rotation.z = 0.3;

    // Window on the left wall: night, blinds half down
    const win = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(1.0, 0.9)), this.keep(new THREE.MeshBasicMaterial({ color: 0x0c1830, toneMapped: false })));
    win.position.set(-2.09, 1.55, -0.9);
    win.rotation.y = Math.PI / 2;
    g.add(win);
    const slat = this.mat(0x1b1b20, 0.8);
    for (let i = 0; i < 9; i++) this.box(0.02, 0.025, 1.02, slat, -2.07, 1.95 - i * 0.05, -0.9);
    const moon = new THREE.PointLight(0x5a78b0, 0.35, 4, 1.5);
    moon.position.set(-1.7, 1.6, -0.9);
    g.add(moon);

    // A poster, a shelf, the bed in the dark behind
    this.box(0.5, 0.7, 0.01, this.mat(0x4a1d22, 0.9), 0.9, 1.65, -2.88);
    this.box(0.9, 0.03, 0.22, wood, -0.6, 1.75, -2.8);
    for (let i = 0; i < 6; i++) this.box(0.04, 0.2 + rnd() * 0.06, 0.15, this.mat([0x5a2a2a, 0x2a3a5a, 0x3a3a2a][i % 3], 0.9), -0.95 + i * 0.07, 1.87, -2.8);
    this.box(1.0, 0.45, 2.0, this.mat(0x1d1a22, 0.95), 1.55, 0.23, 0.6);

    // Your arms on the desk: left on the keyboard, right on the mouse
    const skin = this.mat(0xc08a6a, 0.7);
    const sleeve = this.mat(0x22252b, 0.9);
    const armL = new THREE.Group();
    armL.position.set(-0.2, 0.8, -0.72);
    g.add(armL);
    this.box(0.085, 0.05, 0.11, skin, 0, 0.0, -0.02, armL);
    const foreL = this.box(0.09, 0.08, 0.45, sleeve, 0.02, 0.0, 0.25, armL);
    foreL.rotation.y = 0.25;
    this.handR.position.set(0.3, 0.81, -0.75);
    g.add(this.handR);
    this.box(0.08, 0.05, 0.11, skin, 0, 0, -0.02, this.handR);
    const foreR = this.box(0.09, 0.08, 0.45, sleeve, 0.04, 0, 0.25, this.handR);
    foreR.rotation.y = -0.15;
  }

  /** The desktop, painted once: sky, clouds, a green hill, two icons, a taskbar. */
  private paintDesktop() {
    const c = document.createElement('canvas');
    c.width = SW;
    c.height = SH;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, SH);
    sky.addColorStop(0, '#1d5fc4');
    sky.addColorStop(0.6, '#5aa2e6');
    sky.addColorStop(1, '#a9d4f5');
    g.fillStyle = sky;
    g.fillRect(0, 0, SW, SH);
    g.filter = 'blur(6px)';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, rx, ry] of [[120, 84, 76, 19], [168, 76, 48, 16], [460, 60, 92, 22], [528, 120, 60, 14], [304, 132, 44, 11]]) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    const hill = (yTop: number, c1: string, c2: string, pts: number[]) => {
      const grd = g.createLinearGradient(0, yTop, 0, SH);
      grd.addColorStop(0, c1);
      grd.addColorStop(1, c2);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, pts[0]);
      g.bezierCurveTo(pts[1], pts[2], pts[3], pts[4], pts[5], pts[6]);
      g.bezierCurveTo(pts[7], pts[8], pts[9], pts[10], SW, pts[11]);
      g.lineTo(SW, SH);
      g.lineTo(0, SH);
      g.fill();
    };
    hill(240, '#4fa52e', '#226316', [304, 120, 244, 248, 240, 360, 264, 500, 304, 580, 300, 280]);
    hill(210, '#6fc23e', '#2f7d22', [256, 152, 208, 304, 216, 420, 256, 560, 312, 600, 304, 304]);
    // icons
    g.font = '10px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    const icon = (y: number, label: string, paint: () => void) => {
      paint();
      g.fillStyle = '#fff';
      g.shadowColor = '#000';
      g.shadowBlur = 2;
      g.fillText(label, 30, y + 34);
      g.shadowBlur = 0;
    };
    icon(14, 'Lixeira', () => {
      g.fillStyle = '#dfe6ee';
      g.fillRect(21, 18, 18, 20);
      g.fillStyle = '#c3ced9';
      g.fillRect(19, 14, 22, 4);
    });
    icon(64, 'cd /DataTree', () => {
      g.fillStyle = '#0a0a0c';
      g.fillRect(17, 66, 26, 20);
      g.strokeStyle = '#8f0f12';
      g.strokeRect(17, 66, 26, 20);
      g.fillStyle = '#e9e4d8';
      g.font = '7px monospace';
      g.fillText('cd /', 30, 79);
      g.font = '10px "Segoe UI", system-ui, sans-serif';
    });
    // taskbar
    const bar = g.createLinearGradient(0, SH - 26, 0, SH);
    bar.addColorStop(0, 'rgba(40,70,110,0.85)');
    bar.addColorStop(1, 'rgba(10,25,50,0.92)');
    g.fillStyle = bar;
    g.fillRect(0, SH - 26, SW, 26);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, SH - 26, SW, 1);
    const orb = g.createRadialGradient(18, SH - 15, 1, 20, SH - 13, 11);
    orb.addColorStop(0, '#b9e2ff');
    orb.addColorStop(0.5, '#2f7fd0');
    orb.addColorStop(1, '#0d3a78');
    g.fillStyle = orb;
    g.beginPath();
    g.arc(20, SH - 13, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'right';
    g.fillText(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), SW - 10, SH - 9);
    return c;
  }

  private drawScreen(stage: 'bug' | 'off' | 'boot' | 'desktop') {
    const g = this.screenCtx;
    const t = this.t;
    if (stage === 'bug') {
      if (this.frameImg) {
        const jx = (Math.random() - 0.5) * 8;
        g.drawImage(this.frameImg, jx, 0, SW, SH);
        // colour split
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.35;
        g.drawImage(this.frameImg, jx + 6, 0, SW, SH);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(160,0,20,0.18)';
        g.fillRect(0, 0, SW, SH);
        // tearing slices
        for (let i = 0; i < 4; i++) {
          if (Math.random() < 0.55) continue;
          const y = Math.random() * SH;
          const h = 6 + Math.random() * 30;
          g.drawImage(this.frameImg, 0, (y / SH) * this.frameImg.height, this.frameImg.width, (h / SH) * this.frameImg.height, (Math.random() - 0.5) * 60, y, SW, h);
        }
      } else {
        for (let y = 0; y < SH; y += 4) {
          g.fillStyle = `rgb(${40 + Math.random() * 60},0,${Math.random() * 12})`;
          g.fillRect(0, y, SW, 4);
        }
      }
      // dead blocks + flicker
      if (Math.random() < 0.3) {
        g.fillStyle = Math.random() < 0.5 ? '#000' : '#ff1e3c';
        g.fillRect(Math.random() * SW, Math.random() * SH, 20 + Math.random() * 120, 6 + Math.random() * 20);
      }
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      g.fillRect(0, 0, SW, SH);
    } else if (stage === 'off') {
      g.fillStyle = '#000';
      g.fillRect(0, 0, SW, SH);
    } else if (stage === 'boot') {
      g.fillStyle = '#000';
      g.fillRect(0, 0, SW, SH);
      const step = Math.floor(t * 8) % 8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillStyle = `rgba(207,216,230,${0.2 + (((i - step + 8) % 8) / 8) * 0.8})`;
        g.beginPath();
        g.arc(SW / 2 + Math.cos(a) * 16, SH / 2 - 16 + Math.sin(a) * 16, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#cfd8e6';
      g.font = '14px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Reiniciando...', SW / 2, SH / 2 + 30);
    } else {
      const fade = Math.min(1, (t - AT.desktop) / 1.2);
      g.fillStyle = '#000';
      g.fillRect(0, 0, SW, SH);
      g.globalAlpha = fade;
      g.drawImage(this.desktop, 0, 0);
      g.globalAlpha = 1;
      // the cursor drifts as your hand moves the mouse
      const k = Math.min(1, Math.max(0, (t - AT.desktop - 1) / 4));
      const e = k * k * (3 - 2 * k);
      const cx = THREE.MathUtils.lerp(SW * 0.72, SW * 0.47, e);
      const cy = THREE.MathUtils.lerp(SH * 0.74, SH * 0.46, e);
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx, cy + 15);
      g.lineTo(cx + 4, cy + 11);
      g.lineTo(cx + 7, cy + 18);
      g.lineTo(cx + 9, cy + 17);
      g.lineTo(cx + 6, cy + 10);
      g.lineTo(cx + 11, cy + 10);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // scanlines over everything
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < SH; y += 3) g.fillRect(0, y, SW, 1);
    this.screenTex.needsUpdate = true;
  }

  private once(id: string, at: number, fn: () => void) {
    if (this.t >= at && !this.fired.has(id)) {
      this.fired.add(id);
      fn();
    }
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const h = this.host;
    const stage = t < AT.off ? 'bug' : t < AT.boot ? 'off' : t < AT.desktop ? 'boot' : 'desktop';

    // The person at the PC
    this.once('sayHuh', 1.9, () => h.setSubtitle('Huh... estranho...'));
    this.once('sayHuhX', 4.9, () => h.setSubtitle(null));
    this.once('sayFinally', AT.desktop + 0.9, () => h.setSubtitle('Finalmente!'));
    this.once('sayFinallyX', AT.desktop + 3.2, () => h.setSubtitle(null));
    this.once('reboot', AT.boot, () => h.play('reboot'));
    this.once('bootup', AT.desktop, () => h.play('bootup'));

    // Screen at ~20fps (it's a canvas upload)
    this.redrawIn -= dt;
    if (this.redrawIn <= 0) {
      this.redrawIn = 0.05;
      this.drawScreen(stage);
    }
    // The room takes the screen's colour
    if (stage === 'bug') {
      this.screenLight.color.setHex(0xff2030);
      this.screenLight.intensity = 1.6 + Math.random() * 1.4;
    } else if (stage === 'desktop') {
      this.screenLight.color.setHex(0x6aa8e8);
      this.screenLight.intensity = 2.4 * Math.min(1, (t - AT.desktop) / 1.2);
    } else {
      this.screenLight.color.setHex(0x8090a8);
      this.screenLight.intensity = stage === 'boot' ? 0.25 : 0;
    }
    this.led.color.setHex(stage === 'off' ? 0xd98a1a : 0x3fd16a);

    // Your hand on the mouse follows the cursor
    const k = stage === 'desktop' ? Math.min(1, Math.max(0, (t - AT.desktop - 1) / 4)) : 0;
    const e = k * k * (3 - 2 * k);
    this.handR.position.set(0.3 - e * 0.05, 0.81, -0.75 - e * 0.04);

    // First person: sitting, breathing; you lean in a little when it dies, back when it's back
    const o = h.origin;
    const lean = THREE.MathUtils.smoothstep(t, AT.off - 1, AT.boot) * 0.12 - THREE.MathUtils.smoothstep(t, AT.desktop, AT.out) * 0.08;
    this.eye.set(o.x + Math.sin(t * 0.5) * 0.012, o.y + 1.2 + Math.sin(t * 1.3) * 0.006, o.z - 0.05 - lean);
    this.look.set(o.x + Math.sin(t * 0.37) * 0.02, o.y + 1.05, o.z - 1.1);
    h.aim(this.eye, this.look);

    // Fade in from black, fade out at the end
    if (t < 1.4) h.fadeEl.style.opacity = String(1 - t / 1.4);
    else if (t > AT.out) h.fadeEl.style.opacity = String(Math.min(1, (t - AT.out) / (AT.end - AT.out - 0.2)));
    else h.fadeEl.style.opacity = '0';

    this.once('end', AT.end, () => this.finish());
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.host.setSubtitle(null);
    this.host.fadeEl.style.background = '#000000';
    this.host.fadeEl.style.opacity = '1';
    this.host.onFinished();
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.host.camera.near = this.camNear;
    this.host.camera.fov = this.camFov;
    this.host.camera.updateProjectionMatrix();
  }
}
