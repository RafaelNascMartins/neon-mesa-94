import * as THREE from 'three';
import { buildWeaponModels } from './weaponModels';
import type { WeaponId } from './types';

/**
 * Weapon icons rendered from the weapons' own 3D models: seen side-on (muzzle to the right),
 * lit from the upper left, rendered at 2× and boxed down to a 64×32 pixel grid, alpha cut hard
 * and a 1px black outline grown around the silhouette — chunky pixel art that always matches
 * the model in your hands. One small offscreen WebGL context, used lazily; each icon is cached
 * as a PNG data URL. Returns null if WebGL isn't available (the hand-drawn sprites take over).
 */

export const ICON_W = 64;
export const ICON_H = 32;
const SS = 2; // supersampling

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let models: Record<WeaponId, THREE.Group> | null = null;
let scene: THREE.Scene | null = null;
const cache = new Map<WeaponId, string>();

function setup(): boolean {
  if (renderer) return true;
  if (failed || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(ICON_W * SS, ICON_H * SS, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3236, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-3, 5, 2);
    scene.add(key);
    models = buildWeaponModels();
    return true;
  } catch (err) {
    console.warn('[icons] 3D icon renderer unavailable, using sprites', err);
    failed = true;
    renderer = null;
    return false;
  }
}

export function renderWeaponIcon(id: WeaponId): string | null {
  const hit = cache.get(id);
  if (hit) return hit;
  if (!setup() || !renderer || !scene || !models) return null;

  // Frame the model: centred, side-on, its longest extent filling the 2:1 frame
  const model = models[id];
  const holder = new THREE.Group();
  holder.add(model);
  // a few read better turned toward you: both guns, the crossbow's limbs, the CRT's face
  const turn: Partial<Record<WeaponId, [number, number]>> = { pistols: [-0.5, 0], besta: [-0.2, 1.05], faces: [-0.55, 0.15], rmrf: [-0.5, 0.15] };
  const tr = turn[id];
  if (tr) {
    holder.rotation.y = tr[0];
    holder.rotation.z = tr[1];
  }
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const halfW = Math.max(size.z, size.y * 2, 0.05) * 0.54;
  const halfH = halfW / 2;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 50);
  cam.position.set(centre.x - 10, centre.y, centre.z);
  cam.lookAt(centre);
  renderer.render(scene, cam);
  scene.remove(holder);
  holder.remove(model);

  // Box down to the pixel grid
  const small = document.createElement('canvas');
  small.width = ICON_W;
  small.height = ICON_H;
  const sg = small.getContext('2d', { willReadFrequently: true })!;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(renderer.domElement, 0, 0, ICON_W, ICON_H);
  const img = sg.getImageData(0, 0, ICON_W, ICON_H);
  const px = img.data;

  // Hard alpha, a little punch in the colours (pixel-art contrast)
  const solid = new Uint8Array(ICON_W * ICON_H);
  for (let i = 0; i < ICON_W * ICON_H; i++) {
    const a = px[i * 4 + 3];
    if (a < 110) {
      px[i * 4 + 3] = 0;
      continue;
    }
    solid[i] = 1;
    const k = 255 / a; // un-premultiply the edge
    for (let c = 0; c < 3; c++) {
      let v = Math.min(255, px[i * 4 + c] * k);
      v = (v - 128) * 1.12 + 128;
      px[i * 4 + c] = Math.max(0, Math.min(255, v));
    }
    px[i * 4 + 3] = 255;
  }

  // Output with a 1px outline ring around everything
  const out = document.createElement('canvas');
  out.width = ICON_W + 2;
  out.height = ICON_H + 2;
  const og = out.getContext('2d')!;
  const oimg = og.createImageData(ICON_W + 2, ICON_H + 2);
  const o = oimg.data;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < ICON_W && y < ICON_H && solid[y * ICON_W + x] === 1;
  for (let y = -1; y <= ICON_H; y++) {
    for (let x = -1; x <= ICON_W; x++) {
      const j = ((y + 1) * (ICON_W + 2) + (x + 1)) * 4;
      if (at(x, y)) {
        const i = (y * ICON_W + x) * 4;
        o[j] = px[i];
        o[j + 1] = px[i + 1];
        o[j + 2] = px[i + 2];
        o[j + 3] = 255;
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        o[j] = 5;
        o[j + 1] = 5;
        o[j + 2] = 7;
        o[j + 3] = 255;
      }
    }
  }
  og.putImageData(oimg, 0, 0);
  const url = out.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
