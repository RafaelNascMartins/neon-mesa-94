import * as THREE from 'three';

/**
 * Pixel-art surface textures for the weapons (chunky, nearest-filtered, tiling): worn paint
 * with rust blooms and chipped edges, rusted iron, wood grain, wrapped grips, hazard stripes,
 * checker panels — plus the little screens and emblems painted on them.
 *
 * Tiling textures are mapped by position (see `weaponModels.consolidate`), so a texel is the
 * same size on every part: the guns read like the reference pixel art at any scale.
 */

const cache = new Map<string, THREE.CanvasTexture>();

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, r: () => number) => void, tile = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  let seed = 7;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  paint(g, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
function shade(c: number, k: number) {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

export interface WearOpts {
  /** 0..1: how much of it has rusted through. */
  rust?: number;
  /** 0..1: pale chips / scratches. */
  chips?: number;
  /** 0..1: per-pixel colour noise. */
  noise?: number;
}

/** Painted / bare metal with pixel noise, rust blooms and chips. */
export function wornTex(base: number, o: WearOpts = {}) {
  const rust = o.rust ?? 0.25;
  const chips = o.chips ?? 0.2;
  const noise = o.noise ?? 0.12;
  return make(`worn${base}:${rust}:${chips}:${noise}`, 32, 32, (g, r) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        g.fillStyle = shade(base, 1 - noise + r() * noise * 2);
        g.fillRect(x, y, 1, 1);
      }
    // rust blooms: clusters of brown-orange, darker at the heart
    const blooms = Math.round(rust * 14);
    for (let i = 0; i < blooms; i++) {
      const cx = r() * 32;
      const cy = r() * 32;
      const rad = 1.5 + r() * 3.5;
      for (let k = 0; k < rad * rad * 3; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * rad;
        const x = Math.floor(cx + Math.cos(a) * d) & 31;
        const y = Math.floor(cy + Math.sin(a) * d) & 31;
        g.fillStyle = d < rad * 0.45 ? '#4a2412' : r() < 0.5 ? '#8a4a1e' : '#a45a24';
        g.fillRect(x, y, 1, 1);
      }
    }
    // chips and scratches
    const n = Math.round(chips * 40);
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.6 ? 'rgba(255,245,225,0.35)' : 'rgba(20,14,10,0.55)';
      g.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1 + Math.floor(r() * 2), 1);
    }
  });
}

/** Wood: horizontal grain (along the part), knots. */
export function woodTex(base = 0x7a4426) {
  return make(`wood${base}`, 32, 32, (g, r) => {
    for (let y = 0; y < 32; y++) {
      const band = 0.85 + Math.sin(y * 0.9 + r() * 0.6) * 0.12;
      for (let x = 0; x < 32; x++) {
        g.fillStyle = shade(base, band + (r() - 0.5) * 0.1);
        g.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = shade(base, 0.55);
      g.fillRect(Math.floor(r() * 30), Math.floor(r() * 30), 2, 1);
    }
  });
}

/** Wrapped grip: bands of cord with dark gaps. */
export function wrapTex(base = 0x8a3324) {
  return make(`wrap${base}`, 16, 16, (g, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const gap = y % 4 === 3;
        g.fillStyle = gap ? shade(base, 0.45) : shade(base, 0.9 + r() * 0.2 - (y % 4 === 0 ? 0.1 : 0));
        g.fillRect(x, y, 1, 1);
      }
  });
}

/** Diagonal stripes (hazard yellow/black, red/white...). */
export function stripeTex(a: number, b: number, width = 4) {
  return make(`stripe${a}:${b}:${width}`, 16, 16, (g, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const on = Math.floor((x + y) / width) % 2 === 0;
        g.fillStyle = shade(on ? a : b, 0.9 + r() * 0.2);
        g.fillRect(x, y, 1, 1);
      }
    // a few scuffs
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(60,30,14,0.6)';
      g.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1, 1);
    }
  });
}

export function checkerTex(a: number, b: number) {
  return make(`checker${a}:${b}`, 8, 8, (g, r) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const on = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
        g.fillStyle = shade(on ? a : b, 0.9 + r() * 0.2);
        g.fillRect(x, y, 1, 1);
      }
  });
}

// ───────────── one-off screens and emblems (mapped 0..1 on their own plane) ─────────────

function screenBase(g: CanvasRenderingContext2D, r: () => number, bg: string, line: string) {
  g.fillStyle = bg;
  g.fillRect(0, 0, 24, 24);
  for (let y = 0; y < 24; y += 2) {
    g.fillStyle = line;
    g.fillRect(0, y, 24, 1);
  }
  void r;
}

/** Canhão de Faces: a screaming green face on a CRT. */
export function skullScreenTex() {
  return make(
    'skull',
    24,
    24,
    (g, r) => {
      screenBase(g, r, '#0b2a12', 'rgba(0,0,0,0.35)');
      g.fillStyle = '#5dff6a';
      const px = (x: number, y: number, w = 1, h = 1) => g.fillRect(x, y, w, h);
      px(7, 4, 10, 2);
      px(5, 6, 14, 10);
      px(7, 16, 10, 3);
      g.fillStyle = '#0b2a12';
      px(7, 8, 4, 4); // eyes
      px(13, 8, 4, 4);
      px(10, 13, 4, 5); // screaming mouth
      g.fillStyle = 'rgba(200,120,255,0.5)';
      for (let i = 0; i < 4; i++) px(0, Math.floor(r() * 24), 24, 1); // glitch lines
    },
    false
  );
}

/** fork(): a little process tree on a green screen. */
export function treeScreenTex() {
  return make(
    'proctree',
    24,
    24,
    (g, r) => {
      screenBase(g, r, '#0e2410', 'rgba(0,0,0,0.3)');
      g.fillStyle = '#6cff5a';
      g.fillRect(10, 3, 4, 3);
      g.fillRect(11, 6, 2, 3);
      g.fillRect(4, 9, 16, 1);
      for (const x of [4, 11, 19]) {
        g.fillRect(x, 9, 1, 4);
        g.fillRect(x - 1, 13, 3, 3);
      }
    },
    false
  );
}

function emblem(key: string, bg: number, draw: (g: CanvasRenderingContext2D) => void) {
  return make(
    key,
    16,
    16,
    (g, r) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          g.fillStyle = shade(bg, 0.88 + r() * 0.24);
          g.fillRect(x, y, 1, 1);
        }
      draw(g);
    },
    false
  );
}

/** Plasma: a pixel sun on orange paint. */
export function sunTex() {
  return emblem('sun', 0xc8662a, (g) => {
    g.fillStyle = '#ffe08a';
    g.fillRect(6, 6, 4, 4);
    for (const [x, y] of [[7, 2], [7, 12], [2, 7], [12, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) g.fillRect(x, y, 2, 2);
  });
}

/** Juiz: a red sheriff's star on white paint. */
export function starTex() {
  return emblem('star', 0xd8cfbe, (g) => {
    g.fillStyle = '#b8241c';
    g.fillRect(7, 2, 2, 12);
    g.fillRect(2, 7, 12, 2);
    g.fillRect(4, 4, 2, 2);
    g.fillRect(10, 4, 2, 2);
    g.fillRect(4, 10, 2, 2);
    g.fillRect(10, 10, 2, 2);
    g.fillRect(6, 6, 4, 4);
  });
}

/** Railgun: a yellow lightning bolt on dark iron. */
export function boltTex() {
  return emblem('bolt', 0x2e2b2a, (g) => {
    g.fillStyle = '#ffc21a';
    g.fillRect(8, 2, 3, 2);
    g.fillRect(7, 4, 3, 2);
    g.fillRect(6, 6, 6, 2);
    g.fillRect(8, 8, 3, 2);
    g.fillRect(7, 10, 2, 2);
    g.fillRect(6, 12, 2, 2);
  });
}

/** Lança-CD: an iridescent disc, rainbow wedges round the hole. */
export function discTex() {
  return make(
    'disc',
    32,
    32,
    (g) => {
      const cols = ['#c8b4ff', '#9fe8ff', '#b8ffd0', '#fff7b0', '#ffc8e8', '#d0c0ff'];
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const dx = x - 15.5;
          const dy = y - 15.5;
          const d = Math.hypot(dx, dy);
          if (d > 15.5) continue;
          if (d < 3.5) {
            g.fillStyle = '#2a2a30';
          } else {
            const a = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
            g.fillStyle = cols[Math.floor(a * 12) % cols.length];
          }
          g.fillRect(x, y, 1, 1);
        }
    },
    false
  );
}

/** rm -rf: the front screen, a red glow with scanlines. */
export function redScreenTex() {
  return make(
    'redscreen',
    16,
    16,
    (g) => {
      for (let y = 0; y < 16; y++) {
        const k = 1 - Math.abs(y - 7.5) / 9;
        g.fillStyle = `rgb(${Math.round(255 * (0.5 + k * 0.5))},${Math.round(40 * k)},${Math.round(30 * k)})`;
        g.fillRect(0, y, 16, 1);
        if (y % 2) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(0, y, 16, 1);
        }
      }
    },
    false
  );
}

/** Lança-CD: three red "fast forward" arrows. */
export function arrowsTex() {
  return emblem('ffarrows', 0xd8cfbe, (g) => {
    g.fillStyle = '#c0281e';
    for (const x0 of [1, 6, 11]) {
      for (let i = 0; i < 4; i++) g.fillRect(x0 + i, 4 + i, 1, 8 - i * 2);
    }
  });
}

export { hex };
