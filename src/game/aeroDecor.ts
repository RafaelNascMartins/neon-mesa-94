import * as THREE from 'three';

/**
 * More Frutiger Aero around the second world's arena (all outside the play area, nothing to
 * collide with):
 *  - big globs of water hanging in the air: glossy aqua, a bright highlight, a few droplets
 *    orbiting them, wobbling like water does;
 *  - display cases: clear acrylic cubes on glossy white plinths with an aqua light strip, each
 *    holding a piece of tech turning slowly (CRT, music player, phone, mouse, disc, router,
 *    headphones, memory stick), floating up and down.
 */

const ARENA_EDGE = 33;

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tiny aero desktop for the screens: blue sky, green hill, a white glow. */
function screenTexture() {
  return canvasTex(64, 48, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 48);
    sky.addColorStop(0, '#1e8ff0');
    sky.addColorStop(0.6, '#9fdcff');
    g.fillStyle = sky;
    g.fillRect(0, 0, 64, 48);
    g.fillStyle = '#4fc23a';
    g.beginPath();
    g.ellipse(26, 52, 46, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(46, 12, 9, 4, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function discTexture() {
  return canvasTex(64, 64, (g) => {
    const grad = g.createConicGradient(0, 32, 32);
    ['#e8f6ff', '#9fe8ff', '#ffd6f4', '#fff7b0', '#b8ffd0', '#e8f6ff'].forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(32, 32, 5, 0, Math.PI * 2);
    g.fill();
  });
}

interface Gadget {
  build(): THREE.Group;
}

const glossWhite = () => new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.1, metalness: 0.05, emissive: 0xdff3ff, emissiveIntensity: 0.2 });
const glossDark = () => new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.15, metalness: 0.3 });
const silver = () => new THREE.MeshStandardMaterial({ color: 0xc9d4de, roughness: 0.2, metalness: 0.85 });
const aquaGlow = () => new THREE.MeshStandardMaterial({ color: 0x5ad0ff, emissive: 0x3ab8ff, emissiveIntensity: 1.4, roughness: 0.1 });

function screenMat(tex: THREE.Texture) {
  return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
}

function gadgets(screen: THREE.Texture, disc: THREE.Texture): Gadget[] {
  return [
    {
      // CRT monitor
      build() {
        const g = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.3), glossWhite());
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.86), screenMat(screen));
        face.position.set(0, 0.04, 0.66);
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.6), glossWhite());
        back.position.z = -0.85;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.2, 16), glossWhite());
        stand.position.y = -0.7;
        g.add(shell, face, back, stand);
        return g;
      },
    },
    {
      // pocket music player with a click wheel
      build() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.25, 0.14), glossWhite());
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), screenMat(screen));
        face.position.set(0, 0.32, 0.075);
        const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.3 }));
        wheel.position.set(0, -0.25, 0.075);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), glossWhite());
        hub.position.set(0, -0.25, 0.077);
        g.add(body, face, wheel, hub);
        g.scale.setScalar(1.3);
        return g;
      },
    },
    {
      // slider phone
      build() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.16), silver());
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.6), screenMat(screen));
        face.position.set(0, 0.25, 0.085);
        g.add(body, face);
        const key = new THREE.BoxGeometry(0.11, 0.07, 0.03);
        const keyMat = glossDark();
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 3; c++) {
            const k = new THREE.Mesh(key, keyMat);
            k.position.set((c - 1) * 0.15, -0.18 - r * 0.11, 0.09);
            g.add(k);
          }
        g.scale.setScalar(1.25);
        return g;
      },
    },
    {
      // optical mouse
      build() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), glossWhite());
        body.scale.set(0.75, 0.42, 1.1);
        const light = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 24), aquaGlow());
        light.rotation.x = Math.PI / 2;
        light.scale.set(1, 1.45, 1);
        light.position.y = -0.08;
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.45), glossDark());
        split.position.set(0, 0.2, 0.28);
        g.add(body, light, split);
        g.scale.setScalar(1.4);
        return g;
      },
    },
    {
      // a disc, standing on edge
      build() {
        const g = new THREE.Group();
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshStandardMaterial({ map: disc, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide, transparent: true }));
        g.add(d);
        return g;
      },
    },
    {
      // wireless router
      build() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.9), glossWhite());
        g.add(body);
        for (const x of [-0.5, 0, 0.5]) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), glossDark());
          ant.position.set(x, 0.55, -0.35);
          ant.rotation.z = x * 0.3;
          g.add(ant);
        }
        const leds = aquaGlow();
        for (let i = 0; i < 5; i++) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), leds);
          l.position.set(-0.4 + i * 0.2, 0.02, 0.46);
          g.add(l);
        }
        return g;
      },
    },
    {
      // headphones
      build() {
        const g = new THREE.Group();
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24, Math.PI), silver());
        const cupMat = glossWhite();
        for (const s of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 20), cupMat);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(s * 0.62, -0.1, 0);
          const pad = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 16), aquaGlow());
          pad.rotation.y = Math.PI / 2;
          pad.position.set(s * 0.5, -0.1, 0);
          g.add(cup, pad);
        }
        g.add(band);
        return g;
      },
    },
    {
      // memory stick
      build() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.16), new THREE.MeshStandardMaterial({ color: 0x5ad0ff, roughness: 0.05, transparent: true, opacity: 0.8, emissive: 0x1a8ad0, emissiveIntensity: 0.4 }));
        const plug = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.1), silver());
        plug.position.y = 0.66;
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), aquaGlow());
        led.position.set(0, -0.3, 0.09);
        g.add(body, plug, led);
        g.scale.setScalar(1.4);
        return g;
      },
    },
  ];
}

export interface AeroDecor {
  group: THREE.Group;
  update(elapsed: number): void;
}

export function buildAeroDecor(rand: () => number): AeroDecor {
  const group = new THREE.Group();
  group.name = 'aero_decor';

  // ── Water globs
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x6fd8ff, roughness: 0.02, metalness: 0.15, transparent: true, opacity: 0.42, emissive: 0x2a9ae0, emissiveIntensity: 0.35, depthWrite: false });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xc8f2ff, roughness: 0.05, transparent: true, opacity: 0.25, emissive: 0x8fe0ff, emissiveIntensity: 0.3, depthWrite: false, side: THREE.BackSide });
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const globGeo = new THREE.SphereGeometry(1, 24, 16);
  const hiGeo = new THREE.SphereGeometry(1, 10, 6);
  const dropGeo = new THREE.SphereGeometry(1, 10, 8);
  const globs: { g: THREE.Group; body: THREE.Mesh; y: number; ph: number; drops: THREE.Mesh[]; s: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const r = ARENA_EDGE + 4 + rand() * 22;
    const s = 1.4 + rand() * 2.6;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const body = new THREE.Mesh(globGeo, waterMat);
    body.scale.setScalar(s);
    const inner = new THREE.Mesh(globGeo, coreMat);
    inner.scale.setScalar(s * 0.94);
    const hi = new THREE.Mesh(hiGeo, hiMat);
    hi.scale.set(s * 0.28, s * 0.16, s * 0.1);
    hi.position.set(-s * 0.38, s * 0.48, s * 0.62);
    hi.rotation.z = 0.6;
    const hi2 = new THREE.Mesh(hiGeo, hiMat);
    hi2.scale.setScalar(s * 0.07);
    hi2.position.set(s * 0.45, -s * 0.4, s * 0.68);
    g.add(body, inner, hi, hi2);
    const drops: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(dropGeo, waterMat);
      d.scale.setScalar(s * (0.1 + rand() * 0.12));
      g.add(d);
      drops.push(d);
    }
    group.add(g);
    globs.push({ g, body, y: 3 + rand() * 11, ph: rand() * 6, drops, s });
  }

  // ── Display cases with tech inside
  const screen = screenTexture();
  const disc = discTexture();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0xe8f8ff, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, emissive: 0xbfe9ff, emissiveIntensity: 0.15 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const caseGeo = new THREE.BoxGeometry(2.6, 2.6, 2.6);
  const edgeGeo = new THREE.EdgesGeometry(caseGeo);
  const plinthGeo = new THREE.CylinderGeometry(1.7, 1.9, 0.5, 28);
  const stripGeo = new THREE.TorusGeometry(1.75, 0.07, 6, 40);
  const plinthMat = glossWhite();
  const stripMat = aquaGlow();
  const items = gadgets(screen, disc);
  const cases: { g: THREE.Group; inner: THREE.Group; y: number; ph: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = (i / items.length) * Math.PI * 2 + 0.35;
    const r = ARENA_EDGE + 5 + rand() * 9;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.y = -a + Math.PI / 2;
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -1.55;
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.y = -1.32;
    const box = new THREE.Mesh(caseGeo, caseMat);
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    const inner = items[i].build();
    g.add(plinth, strip, inner, box, edges);
    group.add(g);
    cases.push({ g, inner, y: 2.4 + rand() * 4, ph: rand() * 6 });
  }

  return {
    group,
    update(t: number) {
      for (const w of globs) {
        // bob, and wobble like a drop of water in zero gravity
        w.g.position.y = w.y + Math.sin(t * 0.6 + w.ph) * 0.8;
        const k = Math.sin(t * 2.1 + w.ph) * 0.04;
        w.body.scale.set(w.s * (1 + k), w.s * (1 - k), w.s * (1 + k * 0.5));
        for (let i = 0; i < w.drops.length; i++) {
          const a = t * (0.5 + i * 0.2) + w.ph + i * 2.1;
          w.drops[i].position.set(Math.cos(a) * w.s * 1.5, Math.sin(a * 1.3) * w.s * 0.5, Math.sin(a) * w.s * 1.5);
        }
      }
      for (const c of cases) {
        c.g.position.y = c.y + Math.sin(t * 0.8 + c.ph) * 0.35;
        c.inner.rotation.y = t * 0.6 + c.ph;
      }
    },
  };
}
