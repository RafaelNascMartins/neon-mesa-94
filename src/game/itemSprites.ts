import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VmItemId } from './types';

/**
 * Gungeon-style item sprites: 10×10 pixel grids, one char per pixel, outlined in black
 * automatically. Shared by the shop UI (SVG) and the floating pedestal sprites (canvas).
 */

export const ITEM_PALETTE: Record<string, string> = {
  M: '#ffffff', // specular
  W: '#f2efe6', // white
  w: '#c8c4bc', // light grey
  g: '#8a8680', // grey
  k: '#3a3840', // dark
  K: '#1e1d24', // near-black
  R: '#e0283a', // red
  r: '#8a1020', // dark red
  P: '#ff8a9a', // pink / red highlight
  O: '#ff8a2b', // orange
  o: '#b0501a', // dark orange
  Y: '#ffd23a', // yellow
  y: '#c8901a', // dark yellow
  L: '#fff4b0', // pale yellow
  G: '#4dd84a', // green
  D: '#1f8a2a', // dark green
  l: '#b8ff9a', // light green
  B: '#3ab8ff', // blue
  b: '#1a5aa8', // dark blue
  C: '#9fecff', // cyan highlight
  V: '#b04dff', // purple
  v: '#5a1a8a', // dark purple
  N: '#8a5a2c', // brown
  n: '#4a2c14', // dark brown
  T: '#d8b078', // tan
  S: '#a9adb5', // steel
  s: '#5a5e68', // dark steel
};

export const ITEM_OUTLINE = '#050507';

/** 16×16 item sprites, Gungeon-style: three-tone shading, a specular glint, auto black outline. */
export const ITEM_SPRITES: Record<VmItemId, string[]> = {
  patch: [
    '................',
    '.....kkkkkk.....',
    '.....k....k.....',
    '..MWWWWWWWWWWW..',
    '.MWWWWWWWWWWWWw.',
    '.WWWWWWPRWWWWWw.',
    '.WWWWWWRRWWWWWw.',
    '.WWWWWWRRWWWWWw.',
    '.WWWPRRRRRRRWWw.',
    '.WWWRRRRRRRrWWw.',
    '.WWWWWWRRWWWWWw.',
    '.WWWWWWRrWWWWWw.',
    '.WWWWWWWWWWWWWw.',
    '.wwwwwwwwwwwwwg.',
    '..gggggggggggg..',
    '................',
  ],
  cell: [
    '......sSSs......',
    '......SMSs......',
    '....kkkkkkkk....',
    '....GlGGGGGD....',
    '....GlGGGGGD....',
    '....GlGGYGGD....',
    '....GlGYYGGD....',
    '....GlYYYYGD....',
    '....GlGGYLGD....',
    '....GlGYYGGD....',
    '....GlGYGGGD....',
    '....GlGGGGGD....',
    '....GlGGGGGD....',
    '....kkkkkkkk....',
    '.....DDDDDD.....',
    '................',
  ],
  heatsink: [
    '................',
    '..S.S.S.S.S.S...',
    '..S.S.S.S.S.S...',
    '..S.S.S.S.S.S...',
    '..SsSsSsSsSsS...',
    '.MSSSSSSSSSSSs..',
    '.SkkkkkkkkkkSs..',
    '.SkBBCBBBBBkSs..',
    '.SkBbBBCBbBkSs..',
    '.SkBBBkkBBBkSs..',
    '.SkBbBkkBbBkSs..',
    '.SkBBBCBBBBkSs..',
    '.SkkkkkkkkkkSs..',
    '.sssssssssssss..',
    '..s.s......s.s..',
    '................',
  ],
  overclock: [
    '................',
    '....WWWWWWWW....',
    '...WMwwwwwwgW...',
    '..WwwwwKwwwwgW..',
    '..WwwwwKwwwYgW..',
    '..WwwwwKwwYYgW..',
    '..WwKwwKwYYwgW..',
    '..WwwKwKYYYYYW..',
    '..WwwwKKwwYYgW..',
    '..WwwwwwwYYwgW..',
    '..WwwwwwYYwwgW..',
    '..WgwwwwYwwggW..',
    '...WggggggggW...',
    '....WWWWWWWW....',
    '...rR......Rr...',
    '................',
  ],
  ricochet: [
    '................',
    '.Y..............',
    '..Y.........Y...',
    '...Y.......Y....',
    '....Y.....Y.....',
    '.....Y...Y......',
    '......Y.Y.......',
    '.......Y........',
    '................',
    '.....oyYYYYSSM..',
    '.....oyLYYYSSSs.',
    '.....oyYYYYSSs..',
    '.....ooyyyyss...',
    '................',
    '................',
    '................',
  ],
  bladeDash: [
    '................',
    '.............M..',
    '............MW..',
    '...........MWw..',
    '..........MWw...',
    '.........MWw....',
    '........MWw.....',
    '.......MWw......',
    '..C...MWw.......',
    '.C...MWw........',
    'C..YyWw.........',
    '...yYY..........',
    '..nNyy..........',
    '.nNn............',
    'nNn.............',
    '................',
  ],
  vampire: [
    '................',
    '......kkkk......',
    '......SMSs......',
    '......SSSs......',
    '.....WWWWWW.....',
    '....WMWWWWWw....',
    '...WWPRRRRRWw...',
    '...WPRRRRRRrw...',
    '...WRRRRRRRrw...',
    '...WRRRRRRrrw...',
    '...WRRRRRRrrw...',
    '....wRRRRrrw....',
    '.....wwwwww.....',
    '......R.........',
    '......r.........',
    '................',
  ],
  volatile: [
    '................',
    '......Y.........',
    '.....YOY........',
    '.....OYOY.......',
    '......Ok........',
    '......kk........',
    '.....RRRR.......',
    '....RPRRRr......',
    '....RPRRRr......',
    '....RRRRRr......',
    '....RRRRRr......',
    '....yYYYYy......',
    '....yLYYYy......',
    '....yYYYYy......',
    '....yyyyyy......',
    '................',
  ],
  magnet: [
    '................',
    '....RRRRRRRR....',
    '...RPRRRRRRrR...',
    '..RPRRrrrrRRrR..',
    '..RPRr....rRrR..',
    '..RRRr....rRrR..',
    '..RRRr....rRrR..',
    '..RRr......RrR..',
    '..RRr......Rrr..',
    '..WWw......WWw..',
    '..WMw......WMw..',
    '..wgg......wgg..',
    '................',
    '.Y............Y.',
    'Y.Y..........Y.Y',
    '.Y............Y.',
  ],
  firewall: [
    '.....Y....Y.....',
    '....YOY..YOY....',
    '...OYOO.OYOOY...',
    '..OOROOOOOROOO..',
    '..ORRROOORRROO..',
    '.RNNNNnRNNNNnR..',
    '.NTNNNnNTNNNn...',
    '.nnnnnnnnnnnn...',
    '.NNnNTNNnNTNN...',
    '.NNnNNNNnNNNN...',
    '.nnnnnnnnnnnn...',
    '.NTNNNnNTNNNn...',
    '.NNNNNnNNNNNn...',
    '.nnnnnnnnnnnn...',
    '................',
    '................',
  ],
  doubleTap: [
    '................',
    '....SS....SS....',
    '...SMSs..SMSs...',
    '...SSSs..SSSs...',
    '...SSSs..SSSs...',
    '...sSss..sSss...',
    '...YYYy..YYYy...',
    '...YLYy..YLYy...',
    '...YYYy..YYYy...',
    '...YYYy..YYYy...',
    '...YYYy..YYYy...',
    '...yyyy..yyyy...',
    '...oooo..oooo...',
    '................',
    '..R..R....R..R..',
    '................',
  ],
  scarf: [
    '................',
    '...RRRRRRRRR....',
    '..RPPRRRRRRrR...',
    '..RRRRRRRRRRrR..',
    '...rrrrrrrRRrR..',
    '.........RRRr...',
    '........RRRr....',
    '.......RPRr.....',
    '......RRRr......',
    '.....RRRrr......',
    '....RRRr.r......',
    '....RRr..r......',
    '....R.R.........',
    '....R..R........',
    '...r....r.......',
    '................',
  ],
  clover: [
    '................',
    '......GG........',
    '.....GlGG.GG....',
    '..GG.GGGDGlGG...',
    '.GlGGGGDGGGGD...',
    '.GGGDGGDGGGD....',
    '..DGGGGGGGDGGG..',
    '...GGGlGGGGlGGG.',
    '..GlGGGGDGGGGGD.',
    '.GGGGDGGDGGDDD..',
    '.GGGD..GD.......',
    '..DD...GD.......',
    '.......D........',
    '......D.........',
    '.....D..........',
    '................',
  ],
  pet: [
    '................',
    '...s........s...',
    '...ss......ss...',
    '...SSS....SSS...',
    '...SSSSSSSSSs...',
    '..SMSSSSSSSSSs..',
    '..SSRRSSSSRRSs..',
    '..SSRRSSSSRRSs..',
    '..SSSSSSSSSSSs..',
    '..SSSSkkkkSSSs..',
    '...SSkKKKKkSs...',
    '...sSSkkkkSSs...',
    '....ssSSSSss....',
    '.....YsssY......',
    '......YYY.......',
    '................',
  ],
  charm: [
    '................',
    '................',
    '...PPP...PPP....',
    '..PMPPR.PPPPR...',
    '.PMPPRRRPPRRRr..',
    '.PPPRRRRRRRRRr..',
    '.PPRRRRRRRRRRr..',
    '.RRRRRRRRRRRrr..',
    '..RRRRRRRRRrr...',
    '...RRRRRRRrr....',
    '....RRRRRrr.....',
    '.....RRRrr......',
    '......Rrr.......',
    '.......r........',
    '................',
    '................',
  ],
  // Willow's Defender: a little weeping willow riding in a rusty cart
  willow: [
    '.....DGGGD......',
    '...DGGlGGGGD....',
    '..DGlGGGGlGGD...',
    '.DGGGGGDGGGGGD..',
    '.GDGDGNNGDGDGG..',
    '.GDGDGNNGDGDGD..',
    '.D.G.DNND.G.D...',
    '.D.D..NN..D.D...',
    '......NN........',
    '..oOOOOOOOOOOo..',
    '..oOOOOOOOOOOo..',
    '..ooooooooooooS.',
    '...ooooooooo..SS',
    '...ksk....ksk...',
    '...kSk....kSk...',
    '....k......k....',
  ],
  gunboots: [
    '................',
    '....NNNNNN......',
    '....NTNNNn......',
    '....NTNNNn......',
    '....NTNNNn......',
    '....NNNNNn......',
    '....yYYYYy......',
    '....NTNNNn......',
    '....NNNNNNNn....',
    '...NTNNNNNNNNn..',
    '...nnnnnnnnnnn..',
    '...sSSSSSSSSSSSM',
    '...ssssssssssss.',
    '..O.....s...s...',
    '.OY.............',
    '................',
  ],
  bomb: [
    '..........Y.....',
    '.........YOY....',
    '..........Y.....',
    '.........o......',
    '........o.......',
    '......gkkg......',
    '....kkkkkkkk....',
    '...kMgkkkkkkK...',
    '..kMgkkkkkkkKK..',
    '..kgkkkkkkkkKK..',
    '..kkkkkkkkkkKK..',
    '..kkkkkkkkkKKK..',
    '...kkkkkkkKKK...',
    '....KKKKKKKK....',
    '......KKKK......',
    '................',
  ],
  ironSkin: [
    '................',
    '..SSSSSSSSSSSS..',
    '.SMSSSSSSSSSSss.',
    '.SMSSSSSSSSSSss.',
    '.SSSkkSSSSkkSss.',
    '.SSSkKSSSSkKSss.',
    '.SSSSSSSSSSSSss.',
    '.SSSSSSssSSSSss.',
    '..SSSSSSSSSSss..',
    '..SSSkkkkkkSss..',
    '...SSSSSSSSss...',
    '....SSSSSSss....',
    '.....sSSSss.....',
    '......ssss......',
    '................',
    '................',
  ],
  pacify: [
    '................',
    '..MWWWWWWWWW....',
    '..WWWWWWWWWWw...',
    '..WkkkkkkkkWww..',
    '..WWWWWWWWWWwgw.',
    '..WkkkkkkWWWWww.',
    '..WWWWWWWWWWWWw.',
    '..WbWWRWWGWkWWw.',
    '..WWbWRRWWGkWWw.',
    '..WbWWWRWGWWkWw.',
    '..WWWWWWWWWWWWw.',
    '..WWkWWWWWWWWWw.',
    '..WkWkWWWWWWWWw.',
    '..wwwwwwwwwwwwg.',
    '................',
    '................',
  ],
  fireAmmo: [
    '.......Y........',
    '......YOY.......',
    '.....YOROY......',
    '.....ORRROY.....',
    '......RRRO......',
    '.....yYYYy......',
    '.....yLYYy......',
    '.....yYYYy......',
    '.....yYYYy......',
    '.....yYYYy......',
    '.....yYYYy......',
    '.....RRRRR......',
    '.....rrrrr......',
    '................',
    '................',
    '................',
  ],
  iceAmmo: [
    '................',
    '.......C........',
    '......CMC.......',
    '.....CBMBC......',
    '.....BCMCB......',
    '....CBBMBBC.....',
    '....BCBBBCB.....',
    '....CBMBBBC.....',
    '....BBBBBBB.....',
    '....CBBBBBC.....',
    '.....bBBBb......',
    '......bbb.......',
    '..C..........C..',
    '.CMC........CMC.',
    '..C..........C..',
    '................',
  ],
  homing: [
    '................',
    '.....RRRRRR.....',
    '....R......R....',
    '...R...SS...R...',
    '...R..SMSs..R...',
    '..RR..SSSs..RR..',
    '...R..YYYy..R...',
    '...R..YLYy..R...',
    '....R.YYYy.R....',
    '.....RyyyyR.....',
    '......oooo......',
    '................',
    '....Y.......Y...',
    '.....Y.....Y....',
    '......Y...Y.....',
    '.......YYY......',
  ],
  ghostAmmo: [
    '................',
    '.....WWWWW......',
    '....WMWWWWW.....',
    '...WMWWWWWWw....',
    '...WWKKWKKWw....',
    '...WWKKWKKWw....',
    '...WWWWWWWWw....',
    '...WWWWWWWWw....',
    '...WWWWKWWWw....',
    '...WWWWWWWWw....',
    '...wWWWWWWWw....',
    '...w.ww.ww.w....',
    '................',
    '..B.........B...',
    '.BCB.......BCB..',
    '..B.........B...',
  ],
  fatAmmo: [
    '................',
    '.....SSSSS......',
    '....SMMSSSs.....',
    '...SMSSSSSSs....',
    '...SSSSSSSSs....',
    '..YYYYYYYYYYy...',
    '..YLLYYYYYYYy...',
    '..YLYYYYYYYYy...',
    '..YYYYYYYYYYy...',
    '..YYYYYYYYYyy...',
    '..yYYYYYYYyyy...',
    '...yyyyyyyyy....',
    '...oooooooooo...',
    '................',
    '................',
    '................',
  ],
  cookieAmmo: [
    '................',
    '.....TTTTT......',
    '...TTTTTTTTT....',
    '..TTnTTTTnTTT...',
    '..TTTTTTTTTT....',
    '.TTTTTnTTTT.....',
    '.TTnTTTTTTTT....',
    '.TTTTTTTnTTTT...',
    '.TTTTnTTTTTTT...',
    '..TTTTTTTnTT....',
    '..TTnTTTTTTT....',
    '...TTTTTTTT.....',
    '.....TTTT.......',
    '................',
    '..............T.',
    '............T.n.',
  ],
  pinball: [
    '................',
    '.....SSSSS......',
    '....SMMSSSs.....',
    '...SMSSSSSSs....',
    '...SSSSSSSSs....',
    '...SSSSSSSss....',
    '....SSSSSss.....',
    '.....sssss......',
    '................',
    '.Y....RRRRRRRR..',
    'YLY..RPPRRRRRr..',
    '.Y...rrrrrrrr...',
    '................',
    '.....Y....Y.....',
    '....YLY..YLY....',
    '.....Y....Y.....',
  ],
  shades: [
    '................',
    '................',
    '................',
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kKKKKKkkKKKKKk.',
    '.KMCKKKk.kMCKKK.',
    '.KCKKKKk.KCKKKK.',
    '.KKKKKKk.KKKKKK.',
    '..KKKKK...KKKKK.',
    '...KKK.....KKK..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

/** Filled pixels + a 1px black outline ring, as [x, y, color] cells (outline coords may be -1). */
export function itemPixels(id: VmItemId): [number, number, string][] {
  const rows = ITEM_SPRITES[id];
  const h = rows.length;
  const w = rows[0].length;
  const filled = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== '.' && !!ITEM_PALETTE[rows[y][x]];
  const out: [number, number, string][] = [];
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (filled(x, y)) out.push([x, y, ITEM_PALETTE[rows[y][x]]]);
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out.push([x, y, ITEM_OUTLINE]);
    }
  }
  return out;
}

const voxelCache = new Map<VmItemId, THREE.BufferGeometry>();

/**
 * The item sprite extruded into chunky 3D voxels (vertex-coloured, one draw call): the face
 * pixels are two voxels deep with a darker back layer, the black outline a thinner shell,
 * so it reads as a little physical object on VM's carpet.
 */
export function itemVoxelGeometry(id: VmItemId): THREE.BufferGeometry {
  const cached = voxelCache.get(id);
  if (cached) return cached;
  const rows = ITEM_SPRITES[id];
  const h = rows.length;
  const w = rows[0].length;
  const S = 1 / w; // whole sprite ≈ 1 unit wide whatever its resolution
  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const [x, y, col] of itemPixels(id)) {
    const outline = col === ITEM_OUTLINE;
    const depth = (outline ? 1.4 : 2.4) * S;
    const g = new THREE.BoxGeometry(S, S, depth).toNonIndexed();
    g.translate((x - (w - 1) / 2) * S, ((h - 1) / 2 - y) * S, 0);
    c.set(col);
    if (outline) c.set('#1a1a22');
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Back faces / sides a touch darker so the extrusion reads
      const z = pos.getZ(i);
      const k = z < 0 ? 0.55 : 1;
      colors[i * 3] = c.r * k;
      colors[i * 3 + 1] = c.g * k;
      colors[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  merged.computeVertexNormals();
  voxelCache.set(id, merged);
  return merged;
}

const textureCache = new Map<VmItemId, THREE.CanvasTexture>();

/** Crisp canvas texture of an item sprite (for THREE.Sprite pedestals). */
export function itemTexture(id: VmItemId): THREE.CanvasTexture {
  const cached = textureCache.get(id);
  if (cached) return cached;
  const scale = 6;
  const c = document.createElement('canvas');
  const n = ITEM_SPRITES[id].length + 2;
  c.width = c.height = n * scale;
  const ctx = c.getContext('2d')!;
  for (const [x, y, col] of itemPixels(id)) {
    ctx.fillStyle = col;
    ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  textureCache.set(id, tex);
  return tex;
}
