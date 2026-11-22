import * as THREE from 'three';

/**
 * High-detail procedural floors. Each zone is painted once into three seamless 512² canvases:
 *  - colour  (mid-dark values: the post grade crushes true blacks, so detail has to live above them)
 *  - height  (bump map: cracks sink, stones / welds / roots stand proud and catch the lights)
 *  - glow    (emissive map: embers, furnace grates, ember cracks that light up in the dark)
 * Every feature is drawn with wrap-around so the tile repeats without seams.
 */

export interface FloorSet {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  /** World units per tile repeat over the 190-unit ground disc. */
  repeat: number;
  bumpScale: number;
  glowIntensity: number;
}

const SIZE = 512;

class Painter {
  readonly c: CanvasRenderingContext2D;
  readonly h: CanvasRenderingContext2D;
  readonly g: CanvasRenderingContext2D;
  readonly canvases: HTMLCanvasElement[];
  private seed: number;

  constructor(seed: number, base: string, baseHeight = 128) {
    this.seed = seed;
    this.canvases = [0, 1, 2].map(() => {
      const cv = document.createElement('canvas');
      cv.width = SIZE;
      cv.height = SIZE;
      return cv;
    });
    [this.c, this.h, this.g] = this.canvases.map((cv) => cv.getContext('2d')!) as [
      CanvasRenderingContext2D,
      CanvasRenderingContext2D,
      CanvasRenderingContext2D,
    ];
    this.c.fillStyle = base;
    this.c.fillRect(0, 0, SIZE, SIZE);
    this.h.fillStyle = gray(baseHeight);
    this.h.fillRect(0, 0, SIZE, SIZE);
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, SIZE, SIZE);
  }

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }
  range(a: number, b: number) {
    return a + this.rand() * (b - a);
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rand() * arr.length)];
  }

  /** Runs `draw` at the 9 wrap offsets so features crossing an edge tile seamlessly. */
  wrap(draw: (dx: number, dy: number) => void) {
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) draw(dx, dy);
  }

  /** Mottled noise in blocks of `cell` px across the whole tile. */
  mottle(cell: number, colors: string[], chance: number, heightJitter = 0) {
    for (let y = 0; y < SIZE; y += cell) {
      for (let x = 0; x < SIZE; x += cell) {
        if (this.rand() > chance) continue;
        this.c.fillStyle = this.pick(colors);
        this.c.fillRect(x, y, cell, cell);
        if (heightJitter) {
          this.h.fillStyle = gray(128 + this.range(-heightJitter, heightJitter));
          this.h.fillRect(x, y, cell, cell);
        }
      }
    }
  }

  /** Irregular blob (stone, puddle, scorch). */
  blob(cx: number, cy: number, r: number, color: string, height: number | null, glow?: string, squash = 1) {
    const pts: [number, number][] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * this.range(0.7, 1.15);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
    }
    this.wrap((dx, dy) => {
      const path = () => {
        const p = new Path2D();
        pts.forEach(([x, y], i) => (i ? p.lineTo(cx + x + dx, cy + y + dy) : p.moveTo(cx + x + dx, cy + y + dy)));
        p.closePath();
        return p;
      };
      this.c.fillStyle = color;
      this.c.fill(path());
      if (height !== null) {
        this.h.fillStyle = gray(height);
        this.h.fill(path());
      }
      if (glow) {
        this.g.fillStyle = glow;
        this.g.fill(path());
      }
    });
  }

  /** Branching crack / root / vein: a jittered polyline that forks. */
  vein(
    x: number,
    y: number,
    angle: number,
    len: number,
    width: number,
    color: string,
    height: number,
    opts: { glow?: string; edge?: string; edgeHeight?: number; fork?: number; wobble?: number; depth?: number } = {}
  ) {
    const depth = opts.depth ?? 0;
    const segs = Math.max(3, Math.round(len / 9));
    const pts: [number, number][] = [[x, y]];
    let a = angle;
    let px = x;
    let py = y;
    for (let i = 0; i < segs; i++) {
      a += this.range(-1, 1) * (opts.wobble ?? 0.45);
      px += Math.cos(a) * (len / segs);
      py += Math.sin(a) * (len / segs);
      pts.push([px, py]);
    }
    const stroke = (ctx: CanvasRenderingContext2D, style: string, w: number) => {
      this.wrap((dx, dy) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx + dx, qy + dy) : ctx.moveTo(qx + dx, qy + dy)));
        ctx.stroke();
      });
    };
    if (opts.edge) stroke(this.c, opts.edge, width + 2);
    if (opts.edgeHeight !== undefined) stroke(this.h, gray(opts.edgeHeight), width + 2);
    stroke(this.c, color, width);
    stroke(this.h, gray(height), width);
    if (opts.glow) stroke(this.g, opts.glow, Math.max(1, width - 1));
    // Forks
    const forks = opts.fork ?? 0;
    if (depth < 2) {
      for (let f = 0; f < forks; f++) {
        const [fx, fy] = pts[1 + Math.floor(this.rand() * (pts.length - 2))];
        this.vein(fx, fy, a + this.range(-1.4, 1.4), len * this.range(0.35, 0.6), Math.max(1, width - 1), color, height, {
          ...opts,
          fork: Math.max(0, forks - 1),
          depth: depth + 1,
        });
      }
    }
  }

  rect(x: number, y: number, w: number, hgt: number, color: string, height: number | null, glow?: string) {
    this.wrap((dx, dy) => {
      this.c.fillStyle = color;
      this.c.fillRect(x + dx, y + dy, w, hgt);
      if (height !== null) {
        this.h.fillStyle = gray(height);
        this.h.fillRect(x + dx, y + dy, w, hgt);
      }
      if (glow) {
        this.g.fillStyle = glow;
        this.g.fillRect(x + dx, y + dy, w, hgt);
      }
    });
  }

  /** Short strokes (grass, scratches) around a point. */
  tuft(x: number, y: number, n: number, len: number, colors: string[], height: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + this.range(-0.9, 0.9);
      const l = len * this.range(0.5, 1);
      const sx = x + this.range(-3, 3);
      const sy = y + this.range(-2, 2);
      const col = this.pick(colors);
      this.wrap((dx, dy) => {
        for (const [ctx, style] of [
          [this.c, col],
          [this.h, gray(height)],
        ] as [CanvasRenderingContext2D, string][]) {
          ctx.strokeStyle = style;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(sx + dx, sy + dy);
          ctx.lineTo(sx + Math.cos(a) * l + dx, sy + Math.sin(a) * l + dy);
          ctx.stroke();
        }
      });
    }
  }

  /** Lifts the colour layer (the grade + dither crush everything near black). */
  gain(k: number, lift = 0) {
    const img = this.c.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * k + lift);
      d[i + 1] = Math.min(255, d[i + 1] * k + lift);
      d[i + 2] = Math.min(255, d[i + 2] * k + lift);
    }
    this.c.putImageData(img, 0, 0);
  }

  build(repeat: number, bumpScale: number, glowIntensity: number, maxAniso: number): FloorSet {
    const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(cv);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      t.anisotropy = maxAniso;
      t.needsUpdate = true;
      return t;
    };
    return {
      map: tex(this.canvases[0], true),
      bump: tex(this.canvases[1], false),
      glow: tex(this.canvases[2], true),
      repeat,
      bumpScale,
      glowIntensity,
    };
  }
}

function gray(v: number) {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${n},${n},${n})`;
}

// ───────────────────────────── zones ─────────────────────────────

/** Estrada surroundings: sun-cracked hardpan, tyre ruts, scrub, gravel, oil. */
export function createRoadEarthFloor(maxAniso: number): FloorSet {
  const p = new Painter(19940101, '#3e2219');
  p.mottle(4, ['#44261b', '#3a1f16', '#48291d', '#36201a'], 0.5, 8);
  p.mottle(4, ['#4e2e20', '#301a13'], 0.1, 12);
  // Drifted sand pockets
  for (let i = 0; i < 14; i++) p.blob(p.range(0, SIZE), p.range(0, SIZE), p.range(18, 46), p.pick(['#553524', '#5c3a26']), 140, undefined, 0.55);
  // Hardpan crack network (polygonal mud cracks)
  for (let i = 0; i < 26; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(40, 110), 2.4, '#1c0806', 60, {
      edge: '#553222',
      edgeHeight: 150,
      fork: 2,
      wobble: 0.7,
    });
  }
  // Tyre ruts: long parallel darker bands with tread marks
  for (const y of [150, 172, 360, 382]) {
    p.rect(0, y, SIZE, 7, '#30190f', 112);
    for (let x = 0; x < SIZE; x += 6) p.rect(x, y + 1, 2, 5, '#26140c', 104);
  }
  // Gravel & stones
  for (let i = 0; i < 160; i++) {
    const r = p.range(1.5, 4.5);
    p.blob(p.range(0, SIZE), p.range(0, SIZE), r, p.pick(['#7a6050', '#6a5444', '#8a7060', '#4e3e32']), 175 + r * 8);
  }
  // Dry scrub tufts
  for (let i = 0; i < 46; i++) p.tuft(p.range(0, SIZE), p.range(0, SIZE), 7, 9, ['#6b6a2a', '#8a7a34', '#4f5a22'], 160);
  // Oil stains
  for (let i = 0; i < 6; i++) p.blob(p.range(0, SIZE), p.range(0, SIZE), p.range(10, 22), 'rgba(16,6,6,0.55)', null);
  p.gain(1.35, 4);
  return p.build(5, 2.2, 0, maxAniso);
}

/** Cemetery: cursed plum earth, dead grass, moss, leaf litter, stones, puddles. */
export function createCemeteryGroundFloor(maxAniso: number): FloorSet {
  const p = new Painter(19940102, '#2f1a26');
  p.mottle(8, ['#3a2030', '#28141f', '#341c28', '#22111a'], 0.6, 10);
  // Moss patches
  for (let i = 0; i < 16; i++) p.blob(p.range(0, SIZE), p.range(0, SIZE), p.range(10, 26), p.pick(['#26332c', '#2a3a30', '#20302a']), 138, undefined, 0.7);
  // Dead grass, everywhere in clumps
  for (let i = 0; i < 140; i++) p.tuft(p.range(0, SIZE), p.range(0, SIZE), 6, 8, ['#4a4a30', '#5a5536', '#3a3a26', '#6a6040'], 150);
  // Leaf litter
  for (let i = 0; i < 120; i++) {
    const r = p.range(1.5, 3);
    p.blob(p.range(0, SIZE), p.range(0, SIZE), r, p.pick(['#5a2a1a', '#6a3418', '#4a2014', '#7a4020']), 140, undefined, 0.5);
  }
  // Half-buried stones
  for (let i = 0; i < 40; i++) {
    const r = p.range(2.5, 5.5);
    const x = p.range(0, SIZE);
    const y = p.range(0, SIZE);
    p.blob(x + 1, y + 2, r, '#140a10', 100); // contact shadow
    p.blob(x, y, r, p.pick(['#55505a', '#4a4650', '#5e5a64']), 190 + r * 4);
  }
  // Puddles: deep, with a cold rim of light
  for (let i = 0; i < 5; i++) {
    const x = p.range(0, SIZE);
    const y = p.range(0, SIZE);
    const r = p.range(16, 30);
    p.blob(x, y, r + 2, '#5a7a88', 110, undefined, 0.6);
    p.blob(x, y, r, '#140c18', 96, undefined, 0.6);
  }
  // Root cracks with a faint spectral glow
  for (let i = 0; i < 8; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(50, 110), 1.6, '#12090e', 80, {
      glow: 'rgba(40,200,180,0.55)',
      fork: 1,
    });
  }
  p.gain(1.5, 6);
  return p.build(5, 2.0, 0.9, maxAniso);
}

/** Crater under the tree: scorched earth, raised roots, ash, ember cracks. */
export function createCraterFloor(maxAniso: number): FloorSet {
  const p = new Painter(19940103, '#3a1114');
  p.mottle(4, ['#3e1416', '#361013', '#42181a', '#331012'], 0.55, 10);
  // Scorch blooms
  for (let i = 0; i < 12; i++) p.blob(p.range(0, SIZE), p.range(0, SIZE), p.range(24, 60), 'rgba(18,5,6,0.6)', 110);
  // Ash drifts
  for (let i = 0; i < 18; i++) p.blob(p.range(0, SIZE), p.range(0, SIZE), p.range(10, 26), p.pick(['#4a3c3a', '#3e3432', '#544644']), 135, undefined, 0.5);
  // Raised roots crawling across
  for (let i = 0; i < 12; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(90, 180), 5, '#2a140c', 205, {
      edge: '#140806',
      edgeHeight: 120,
      fork: 2,
      wobble: 0.35,
    });
  }
  // Ember cracks: glowing orange seams
  for (let i = 0; i < 14; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(40, 100), 2, '#ff5a1a', 70, {
      glow: '#ff6a1a',
      edge: '#1a0606',
      fork: 1,
      wobble: 0.8,
    });
  }
  // Cinders
  for (let i = 0; i < 140; i++) {
    const hot = p.rand() < 0.25;
    p.rect(p.range(0, SIZE), p.range(0, SIZE), 2, 2, hot ? '#ff7a2a' : '#1a0a0a', hot ? null : 120, hot ? '#ff5a10' : undefined);
  }
  p.gain(1.35, 4);
  return p.build(5, 2.4, 1.3, maxAniso);
}

/** Desert: wind-rippled ochre sand, streaks, rocks and bleached bones half buried. */
export function createDesertSandFloor(maxAniso: number): FloorSet {
  const p = new Painter(19940106, '#4a2618');
  p.mottle(4, ['#50291a', '#45231a', '#552c1c', '#3f2116'], 0.5, 6);
  // Dune ripples: wavy bands with a lit crest and a shaded trough
  for (let row = 0; row < 26; row++) {
    const y0 = (row / 26) * SIZE;
    const phase = p.range(0, Math.PI * 2);
    for (let x = 0; x < SIZE; x += 3) {
      const y = y0 + Math.sin(x * 0.035 + phase) * 6 + Math.sin(x * 0.011 + row) * 4;
      p.rect(x, y, 3, 2, '#62361f', 168); // crest
      p.rect(x, y + 3, 3, 3, '#36190f', 98); // trough
    }
  }
  // Wind streaks
  for (let i = 0; i < 30; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(-0.15, 0.15), p.range(30, 80), 2, 'rgba(110,60,34,0.6)', 150, { wobble: 0.05 });
  }
  // Rocks with shadows
  for (let i = 0; i < 26; i++) {
    const r = p.range(3, 9);
    const x = p.range(0, SIZE);
    const y = p.range(0, SIZE);
    p.blob(x + 2, y + 3, r, '#24100a', 100);
    p.blob(x, y, r, p.pick(['#6a4a3a', '#5a3e30', '#7a5848']), 200 + r * 3);
  }
  // Bleached bones: ribs and a long bone or two
  for (let i = 0; i < 5; i++) {
    const x = p.range(0, SIZE);
    const y = p.range(0, SIZE);
    const a = p.range(0, Math.PI);
    p.vein(x, y, a, 26, 3, '#b8a890', 190, { wobble: 0.05 });
    for (let k = 0; k < 4; k++) {
      p.vein(x + Math.cos(a) * k * 6, y + Math.sin(a) * k * 6, a + Math.PI / 2, 10, 2, '#a89880', 185, { wobble: 0.2 });
    }
  }
  p.gain(1.7, 10);
  return p.build(5, 1.8, 0, maxAniso);
}

/**
 * The highway strip (Estrada): worn asphalt with aggregate, patch repairs, crack networks,
 * potholes, skid marks, oil, faded shoulder lines and chipped double amber dashes.
 * u runs across the road (14.5 wide), v along it; tiled 8× along the length.
 */
export function createHighwayAsphalt(maxAniso: number): FloorSet {
  const p = new Painter(19940105, '#2a2326');
  p.mottle(4, ['#302829', '#251f21', '#2e2628', '#221c1e'], 0.6, 8);
  // Aggregate glints
  for (let i = 0; i < 900; i++) p.rect(p.range(0, SIZE), p.range(0, SIZE), 2, 2, p.pick(['#4a4244', '#3c3436', '#57504f']), 150);
  // Patch repairs (darker, newer tar with a sealed edge)
  for (let i = 0; i < 6; i++) {
    const w = p.range(60, 150);
    const h = p.range(40, 120);
    const x = p.range(40, SIZE - 40 - w);
    const y = p.range(0, SIZE);
    p.rect(x - 2, y - 2, w + 4, h + 4, '#141012', 118);
    p.rect(x, y, w, h, '#1e191b', 126);
  }
  // Skid marks along the lanes
  for (let i = 0; i < 5; i++) {
    const x = p.pick([150, 170, 340, 360]) + p.range(-10, 10);
    const y = p.range(0, SIZE);
    p.vein(x, y, Math.PI / 2 + p.range(-0.08, 0.08), p.range(90, 200), 7, 'rgba(10,8,9,0.7)', 118, { wobble: 0.06 });
  }
  // Crack networks
  for (let i = 0; i < 18; i++) {
    p.vein(p.range(30, SIZE - 30), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(40, 120), 2, '#0e0b0c', 70, {
      edge: '#3a3133',
      edgeHeight: 150,
      fork: 2,
      wobble: 0.6,
    });
  }
  // Potholes
  for (let i = 0; i < 4; i++) {
    const x = p.range(70, SIZE - 70);
    const y = p.range(0, SIZE);
    const r = p.range(10, 18);
    p.blob(x, y, r + 3, '#3e3538', 150);
    p.blob(x, y, r, '#0c0a0b', 60);
  }
  // Oil stains down the middle of the lanes
  for (let i = 0; i < 7; i++) p.blob(p.pick([160, 350]) + p.range(-20, 20), p.range(0, SIZE), p.range(10, 22), 'rgba(8,6,8,0.6)', null, undefined, 1.6);
  // Sand drifting over both shoulders
  for (let i = 0; i < 26; i++) {
    const x = p.rand() < 0.5 ? p.range(-10, 46) : p.range(SIZE - 46, SIZE + 10);
    p.blob(x, p.range(0, SIZE), p.range(8, 22), p.pick(['#5a3424', '#4e2c1e', '#64402a']), 140, undefined, 2);
  }
  // Faded shoulder lines (chipped)
  for (const lx of [36, SIZE - 44]) {
    for (let y = 0; y < SIZE; y += 4) {
      if (p.rand() < 0.18) continue;
      p.rect(lx, y, 8, 4, p.rand() < 0.3 ? '#9a9286' : '#c8beb0', 136);
    }
  }
  // Double amber centre dashes, worn at the edges
  for (let y = 10; y < SIZE; y += 64) {
    for (const lx of [244, 262]) {
      for (let k = 0; k < 36; k += 3) {
        if (p.rand() < 0.15) continue;
        p.rect(lx, y + k, 7, 3, p.rand() < 0.25 ? '#a8701e' : '#e0a030', 136);
      }
    }
  }
  p.gain(1.35, 4);
  const set = p.build(1, 1.8, 0, maxAniso);
  for (const t of [set.map, set.bump]) t.repeat.set(1, 8);
  return set;
}

/** Inside the tree: welded steel deck, furnace grates glowing from below, hazard trim, rust, oil. */
export function createIndustrialDeckFloor(maxAniso: number): FloorSet {
  const p = new Painter(19940104, '#2b2d34', 140);
  const PLATE = 128;
  for (let y = 0; y < SIZE; y += PLATE) {
    for (let x = 0; x < SIZE; x += PLATE) {
      const shade = p.pick(['#30333b', '#2a2c33', '#353841', '#2e3037']);
      p.rect(x + 3, y + 3, PLATE - 6, PLATE - 6, shade, 150);
      // Diamond tread pattern on some plates
      if (p.rand() < 0.5) {
        for (let ty = y + 10; ty < y + PLATE - 10; ty += 10) {
          for (let tx = x + 10 + ((ty / 10) % 2) * 5; tx < x + PLATE - 10; tx += 10) {
            p.rect(tx, ty, 4, 2, '#3c3f48', 168);
          }
        }
      }
      // Weld seams (sunken) + bolts (proud)
      p.rect(x, y, PLATE, 3, '#15161b', 90);
      p.rect(x, y, 3, PLATE, '#15161b', 90);
      for (const [bx, by] of [
        [8, 8],
        [PLATE - 12, 8],
        [8, PLATE - 12],
        [PLATE - 12, PLATE - 12],
        [PLATE / 2 - 2, 8],
        [PLATE / 2 - 2, PLATE - 12],
      ]) {
        p.rect(x + bx, y + by, 4, 4, '#8a8f9a', 215);
        p.rect(x + bx + 1, y + by + 3, 3, 1, '#1a1b20', 120);
      }
    }
  }
  // Furnace grates: slotted panels with fire glowing through
  for (let i = 0; i < 4; i++) {
    const gx = Math.floor(p.range(0, 4)) * PLATE + 22;
    const gy = Math.floor(p.range(0, 4)) * PLATE + 22;
    p.rect(gx - 4, gy - 4, 92, 92, '#1a1a1f', 120);
    for (let sy = gy; sy < gy + 84; sy += 8) {
      p.rect(gx, sy, 84, 4, '#b8360a', 60, '#ff4a0a');
      p.rect(gx, sy + 4, 84, 4, '#22232a', 175);
    }
  }
  // Hazard stripe trim along one seam line
  for (let x = 0; x < SIZE; x += 16) {
    p.rect(x, 254, 8, 8, '#c8902a', 150);
    p.rect(x + 8, 254, 8, 8, '#141418', 150);
  }
  // Rust streaks & bleed
  for (let i = 0; i < 30; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), Math.PI / 2 + p.range(-0.3, 0.3), p.range(14, 40), p.range(2, 5), p.pick(['#6a3a20', '#5a2e18', '#7a4424']), 140, { wobble: 0.15 });
  }
  // Oil stains with a sheen ring
  for (let i = 0; i < 8; i++) {
    const x = p.range(0, SIZE);
    const y = p.range(0, SIZE);
    const r = p.range(10, 26);
    p.blob(x, y, r + 2, '#3a3d48', null, undefined, 0.7);
    p.blob(x, y, r, '#0e0e12', 130, undefined, 0.7);
  }
  // Scuffs & scratches
  for (let i = 0; i < 70; i++) {
    p.vein(p.range(0, SIZE), p.range(0, SIZE), p.range(0, Math.PI * 2), p.range(6, 22), 1, '#4a4e58', 160, { wobble: 0.1 });
  }
  p.gain(1.5, 10);
  return p.build(5, 2.0, 1.6, maxAniso);
}
