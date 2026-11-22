import * as THREE from 'three';
import { buildEnemyModel } from './enemyModels';
import { applyFaceExpressions } from './bossFaces';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EnemyArchetype, SkinDef, WeaponId } from './types';

import cowboyHeroUrl from '../assets/models/cowboy_hero.glb?url';
import enemyRustlerUrl from '../assets/models/enemy_rustler.glb?url';
import enemyRangerUrl from '../assets/models/enemy_ranger.glb?url';
import enemyChargerUrl from '../assets/models/enemy_charger.glb?url';
import enemyBombardierUrl from '../assets/models/enemy_bombardier.glb?url';
import enemySpiderUrl from '../assets/models/enemy_spider.glb?url';
import enemySporeUrl from '../assets/models/enemy_spore.glb?url';
import enemyMantisUrl from '../assets/models/enemy_mantis.glb?url';
import enemyJuggernautUrl from '../assets/models/enemy_juggernaut.glb?url';
import enemyTeslaUrl from '../assets/models/enemy_tesla.glb?url';
import bossWarlordUrl from '../assets/models/boss_warlord.glb?url';
import { buildWeaponModels } from './weaponModels';
import propCactusUrl from '../assets/models/prop_cactus.glb?url';
import propCrateUrl from '../assets/models/prop_crate.glb?url';
import propArchUrl from '../assets/models/prop_arch.glb?url';
import propTombstoneUrl from '../assets/models/prop_tombstone.glb?url';
import propDataCacheUrl from '../assets/models/prop_datacache.glb?url';
import propTreeGiantUrl from '../assets/models/prop_tree_giant.glb?url';
import propStumpSmallUrl from '../assets/models/prop_stump_small.glb?url';
import propRoadSignUrl from '../assets/models/prop_road_sign.glb?url';
import propUtilityPoleUrl from '../assets/models/prop_utility_pole.glb?url';
import propMegaTowerUrl from '../assets/models/prop_mega_tower.glb?url';
import propWireframeTowerUrl from '../assets/models/prop_wireframe_tower.glb?url';

export interface LoadedGlbAssets {
  hero: THREE.Group;
  enemies: Record<EnemyArchetype, THREE.Group>;
  weapons: Record<WeaponId, THREE.Group>;
  cactus: THREE.Group;
  crate: THREE.Group;
  arch: THREE.Group;
  tombstone: THREE.Group;
  datacache: THREE.Group;
  treeGiant: THREE.Group;
  stumpSmall: THREE.Group;
  roadSign: THREE.Group;
  utilityPole: THREE.Group;
  megaTower: THREE.Group;
  wireframeTower: THREE.Group;
}

function loadGlb(loader: GLTFLoader, url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        resolve(root);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

export async function loadAllGlbAssets(): Promise<LoadedGlbAssets> {
  const loader = new GLTFLoader();
  const [
    hero,
    rustler,
    ranger,
    charger,
    bombardier,
    spider,
    spore,
    mantis,
    juggernaut,
    tesla,
    boss,
    cactus,
    crate,
    arch,
    tombstone,
    datacache,
    treeGiant,
    stumpSmall,
    roadSign,
    utilityPole,
    megaTower,
    wireframeTower,
  ] = await Promise.all([
    loadGlb(loader, cowboyHeroUrl),
    loadGlb(loader, enemyRustlerUrl),
    loadGlb(loader, enemyRangerUrl),
    loadGlb(loader, enemyChargerUrl),
    loadGlb(loader, enemyBombardierUrl),
    loadGlb(loader, enemySpiderUrl),
    loadGlb(loader, enemySporeUrl),
    loadGlb(loader, enemyMantisUrl),
    loadGlb(loader, enemyJuggernautUrl),
    loadGlb(loader, enemyTeslaUrl),
    loadGlb(loader, bossWarlordUrl),
    loadGlb(loader, propCactusUrl),
    loadGlb(loader, propCrateUrl),
    loadGlb(loader, propArchUrl),
    loadGlb(loader, propTombstoneUrl),
    loadGlb(loader, propDataCacheUrl),
    loadGlb(loader, propTreeGiantUrl),
    loadGlb(loader, propStumpSmallUrl),
    loadGlb(loader, propRoadSignUrl),
    loadGlb(loader, propUtilityPoleUrl),
    loadGlb(loader, propMegaTowerUrl),
    loadGlb(loader, propWireframeTowerUrl),
  ]);

  // Every one of his masks wears its own expression
  applyFaceExpressions(boss);

  return {
    hero,
    // Procedural, joint-to-joint models (see enemyModels.ts); the boss keeps his GLB
    enemies: {
      rustler: buildEnemyModel('rustler') ?? rustler,
      ranger: buildEnemyModel('ranger') ?? ranger,
      charger: buildEnemyModel('charger') ?? charger,
      bombardier: buildEnemyModel('bombardier') ?? bombardier,
      spider: buildEnemyModel('spider') ?? spider,
      spore: buildEnemyModel('spore') ?? spore,
      mantis: buildEnemyModel('mantis') ?? mantis,
      juggernaut: buildEnemyModel('juggernaut') ?? juggernaut,
      tesla: buildEnemyModel('tesla') ?? tesla,
      boss,
    },
    // Procedural, grimy, over-built (see weaponModels.ts)
    weapons: buildWeaponModels(),
    cactus,
    crate,
    arch,
    tombstone,
    datacache,
    treeGiant,
    stumpSmall,
    roadSign,
    utilityPole,
    megaTower,
    wireframeTower,
  };
}

/**
 * Clones a GLB Group with unique material instances so per-actor hit flashes
 * and skin recoloring do not leak across instances.
 */
export function cloneModelWithUniqueMaterials(source: THREE.Group): THREE.Group {
  const cloned = source.clone(true);
  cloned.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
    }
  });
  return cloned;
}

export function applyHeroSkin(heroGroup: THREE.Group, skin: SkinDef): void {
  heroGroup.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || !mat.emissive) return; // (skips the holographic hat / unlit outfit bits)

    if (mesh.name.includes('poncho_mesh')) {
      mat.color.setHex(skin.ponchoColor);
    } else if (mesh.name.includes('hat_mesh')) {
      mat.color.setHex(skin.hatColor);
    } else if (mesh.name.includes('trim_mesh')) {
      mat.color.setHex(skin.trimColor);
      mat.emissive.setHex(skin.trimColor);
      mat.emissiveIntensity = 0.25;
    } else if (mesh.name.includes('visor_mesh') || mesh.name.includes('hatband_mesh')) {
      mat.color.setHex(skin.visorColor);
      mat.emissive.setHex(skin.visorColor);
      mat.emissiveIntensity = 1.65;
    }
    mat.userData.baseEmissive = mat.emissive.getHex();
    mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
  });
}

/**
 * Stage 1 (Estrada) surrounding ground: sun-baked ochre-crimson desert earth,
 * cracked fissures, ash dust pockets & sparse dry scrub flecks (flanking the central highway strip).
 */
export function createRoadFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#331110';
  ctx.fillRect(0, 0, size, size);

  let seed = 199401;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const r = rand();
      if (r < 0.25) {
        ctx.fillStyle = '#471a14';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.45) {
        ctx.fillStyle = '#5c2617'; // warm desert ochre sand pocket
        ctx.fillRect(x, y, 6, 6);
      } else if (r < 0.56) {
        ctx.fillStyle = '#1f090a';
        ctx.fillRect(x, y, 7, 7);
      }
    }
  }

  // Cracked fissures & olive-ochre dry brush tufts
  ctx.fillStyle = 'rgba(225, 68, 24, 0.22)';
  ctx.fillRect(28, 74, 178, 2);
  ctx.fillRect(54, 188, 160, 2);
  ctx.fillStyle = '#4f6228';
  for (let i = 0; i < 28; i++) {
    const sx = Math.floor(rand() * 246);
    const sy = Math.floor(rand() * 246);
    ctx.fillRect(sx, sy, 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Single central desert asphalt highway strip (Stage 1 Estrada) with cracked tarmac,
 * faded white shoulder lines, and double amber center dashes.
 */
export function createHighwayStripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Weathered dark cracked desert asphalt
  ctx.fillStyle = '#1d1417';
  ctx.fillRect(0, 0, size, size);

  let seed = 771994;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const r = rand();
      if (r < 0.25) {
        ctx.fillStyle = '#291c1e';
        ctx.fillRect(x, y, 6, 6);
      } else if (r < 0.42) {
        ctx.fillStyle = '#140d10';
        ctx.fillRect(x, y, 6, 6);
      } else if ((x < 24 || x > 224) && r < 0.65) {
        // Dust drifting onto asphalt shoulders
        ctx.fillStyle = '#4c2116';
        ctx.fillRect(x, y, 7, 7);
      }
    }
  }

  // Faded white shoulder stripes
  ctx.fillStyle = 'rgba(222, 208, 190, 0.56)';
  ctx.fillRect(14, 0, 5, size);
  ctx.fillRect(237, 0, 5, size);

  // Double yellow/amber center road dashes
  ctx.fillStyle = 'rgba(255, 178, 52, 0.72)';
  for (let y = 8; y < size; y += 40) {
    ctx.fillRect(121, y, 5, 22);
    ctx.fillRect(130, y, 5, 22);
  }

  // Asphalt fracture seams
  ctx.fillStyle = 'rgba(14, 7, 9, 0.75)';
  ctx.fillRect(36, 54, 78, 2);
  ctx.fillRect(142, 166, 86, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Stage 2 (Deserto): Wind-swept sun-baked ochre desert sand with rippled dunes & dry gravel.
 */
export function createTrueDesertSandTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#8d5b32';
  ctx.fillRect(0, 0, size, size);

  let seed = 199407;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const r = rand();
      if (r < 0.28) {
        ctx.fillStyle = '#9e6a3d';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.5) {
        ctx.fillStyle = '#754724';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.58) {
        ctx.fillStyle = '#b47d4a';
        ctx.fillRect(x, y, 6, 4);
      }
    }
  }

  // Wind-blown sand ripple ridges
  ctx.fillStyle = 'rgba(235, 186, 128, 0.22)';
  for (let y = 12; y < size; y += 28) {
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = 'rgba(72, 39, 18, 0.2)';
    ctx.fillRect(0, y + 4, size, 2);
    ctx.fillStyle = 'rgba(235, 186, 128, 0.22)';
  }

  // Pebbles & dry brush flecks
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#4c2c16' : '#c9935b';
    ctx.fillRect(Math.floor(rand() * 250), Math.floor(rand() * 250), 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Central cobblestone stone walkway texture for Stage 3 (Cemitério).
 */
export function createStoneWalkwayTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#241928';
  ctx.fillRect(0, 0, size, size);

  let seed = 884422;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 4; y < size; y += 28) {
    const rowShift = ((y / 28) % 2) * 14;
    for (let x = 8; x < size - 8; x += 34) {
      const shade = rand();
      ctx.fillStyle = shade < 0.33 ? '#5e4b66' : shade < 0.66 ? '#4e3c55' : '#6c5a74';
      const bx = Math.min(size - 28, x + (rowShift % 14));
      ctx.fillRect(bx, y, 28, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(bx, y, 28, 3);
    }
  }

  // Moss & spectral cyan stone seams
  ctx.fillStyle = 'rgba(34, 227, 212, 0.25)';
  ctx.fillRect(6, 0, 4, size);
  ctx.fillRect(size - 10, 0, 4, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 9);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Stage 3 (Cemiterio): Dark cursed crimson-plum graveyard earth & moss surrounding the circular graves & central stone path.
 */
export function createCemeteryFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#250c19';
  ctx.fillRect(0, 0, size, size);

  let seed = 199402;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const r = rand();
      if (r < 0.24) {
        ctx.fillStyle = '#361426';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.44) {
        ctx.fillStyle = '#180710';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.54) {
        ctx.fillStyle = '#19453e'; // mossy graveyard turf
        ctx.fillRect(x + 1, y + 1, 5, 5);
      }
    }
  }

  // Spectral cyan/emerald soul hairline fractures
  ctx.fillStyle = 'rgba(34, 227, 212, 0.22)';
  ctx.fillRect(0, 112, 256, 2);
  ctx.fillRect(126, 0, 2, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Stage 3 (Area da Arvore): Ruined scorched-earth crimson clearing, charred blast scars,
 * ash rubble, and glowing ember fissures directly beneath the giant tree.
 */
export function createDesertFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Dark scorched crimson-charcoal earth for crisp character readability
  ctx.fillStyle = '#330a0f';
  ctx.fillRect(0, 0, size, size);

  let seed = 941994;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Ruined dark-red earth blocks, soot patches & scorched ash tiles
  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const r = rand();
      if (r < 0.22) {
        ctx.fillStyle = '#441016';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.42) {
        ctx.fillStyle = '#24070b';
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.54) {
        ctx.fillStyle = '#160507'; // charred ash patch
        ctx.fillRect(x, y, 7, 7);
      } else if (r < 0.59) {
        ctx.fillStyle = '#52151a';
        ctx.fillRect(x + 1, y + 1, 5, 5);
      }
    }
  }

  // Irregular pixelated circular blast craters
  const craters = [
    { cx: 58, cy: 66, r: 22 },
    { cx: 192, cy: 84, r: 19 },
    { cx: 124, cy: 196, r: 24 },
  ];
  for (const c of craters) {
    for (let dy = -c.r; dy <= c.r; dy += 4) {
      for (let dx = -c.r; dx <= c.r; dx += 4) {
        const dist = Math.hypot(dx, dy) + (rand() - 0.5) * 4;
        if (dist <= c.r) {
          ctx.fillStyle = dist < c.r * 0.55 ? '#100305' : '#1e0609';
          ctx.fillRect(c.cx + dx, c.cy + dy, 4, 4);
        }
      }
    }
    // Subtle smoldering embers inside blast scar
    ctx.fillStyle = '#d93d14';
    ctx.fillRect(c.cx - 3, c.cy - 2, 3, 3);
    ctx.fillRect(c.cx + 4, c.cy + 3, 2, 2);
    ctx.fillStyle = '#ff8824';
    ctx.fillRect(c.cx - 2, c.cy, 2, 2);
  }

  // Subtle cracked ember fissures & broken mainframe bus lines
  ctx.fillStyle = 'rgba(215, 52, 18, 0.22)';
  ctx.fillRect(0, 128, 96, 2);
  ctx.fillRect(140, 128, 116, 2);
  ctx.fillRect(128, 0, 2, 88);
  ctx.fillRect(128, 148, 2, 108);
  ctx.fillRect(64, 36, 2, 62);
  ctx.fillRect(64, 96, 54, 2);

  // Subtle cinder & ash specks
  for (let i = 0; i < 65; i++) {
    const px = Math.floor(rand() * 64) * 4;
    const py = Math.floor(rand() * 64) * 4;
    ctx.fillStyle = rand() < 0.2 ? '#c44616' : '#130406';
    ctx.fillRect(px, py, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Binary Tree Lower Floors (Depth 0-2): BLAME!-style dark brutalist industrial steel grating,
 * riveted iron catwalk seams, dark conduit channels & subtle warm furnace glow.
 */
export function createBinaryTreeFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#121318';
  ctx.fillRect(0, 0, size, size);

  let seed = 101010;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // Industrial steel deck plates + rusted bolt grid (high contrast for floor readability)
  for (let y = 0; y < size; y += 32) {
    for (let x = 0; x < size; x += 32) {
      ctx.fillStyle = rand() < 0.45 ? '#262934' : '#1e2029';
      ctx.fillRect(x + 2, y + 2, 28, 28);
      // Grating cross-slots
      ctx.fillStyle = '#0d0f14';
      for (let gy = y + 6; gy < y + 26; gy += 6) {
        ctx.fillRect(x + 6, gy, 20, 2);
      }
      // Corner rivets
      ctx.fillStyle = '#6b402c';
      ctx.fillRect(x + 3, y + 3, 3, 3);
      ctx.fillRect(x + 26, y + 3, 3, 3);
      ctx.fillRect(x + 3, y + 26, 3, 3);
      ctx.fillRect(x + 26, y + 26, 3, 3);
    }
  }

  // Heavy industrial floor pipe trench + warm sodium shaft accent
  ctx.fillStyle = '#3b2218';
  ctx.fillRect(114, 0, 28, size);
  ctx.fillStyle = '#5a6373';
  ctx.fillRect(119, 0, 6, size);
  ctx.fillRect(131, 0, 5, size);
  ctx.fillStyle = 'rgba(255, 138, 42, 0.52)';
  ctx.fillRect(127, 0, 2, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Binary Tree Upper Floors (Depth 3+): Dark cyberpunk neon wireframe city grid
 * glowing in magenta, gold & cyan data circuitry.
 */
export function createWireframeCityFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070414';
  ctx.fillRect(0, 0, size, size);

  // Crisp magenta & cyan wireframe grid cells
  for (let y = 0; y < size; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? 'rgba(255, 30, 138, 0.42)' : 'rgba(0, 245, 255, 0.25)';
    ctx.fillRect(0, y, size, 2);
  }
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = x % 64 === 0 ? 'rgba(0, 245, 255, 0.38)' : 'rgba(255, 30, 138, 0.24)';
    ctx.fillRect(x, 0, 2, size);
  }

  // Golden holographic binary circuit pads
  ctx.fillStyle = 'rgba(255, 209, 102, 0.55)';
  ctx.fillRect(61, 61, 6, 6);
  ctx.fillRect(189, 189, 6, 6);
  ctx.fillStyle = 'rgba(0, 245, 255, 0.65)';
  ctx.fillRect(125, 125, 6, 6);
  ctx.fillRect(62, 190, 4, 4);
  ctx.fillRect(190, 62, 4, 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Transparent grime layer laid over every floor: oil/soot blotches, drip streaks, scratches
 * and speckle. Meant for a tiled overlay plane (alpha only darkens).
 */
export function createGrimeOverlayTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let seed = 4021;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // Soot / oil blotches (drawn 3× wrapped so the tile is seamless)
  const blotch = (x: number, y: number, r: number, a: number) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(8,5,4,${a})`);
        g.addColorStop(0.6, `rgba(8,5,4,${a * 0.45})`);
        g.addColorStop(1, 'rgba(8,5,4,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  };
  for (let i = 0; i < 70; i++) blotch(rand() * size, rand() * size, 14 + rand() * 70, 0.18 + rand() * 0.4);

  // Drip streaks
  ctx.strokeStyle = 'rgba(10,6,5,0.35)';
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.lineWidth = 1 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 12, y + 20 + rand() * 70);
    ctx.stroke();
  }

  // Scratches
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const l = 6 + rand() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }

  // Speckle
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.35})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createCanyonBumpTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  let seed = 424242;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < 420; i++) {
    const x = Math.floor(rand() * 32) * 4;
    const y = Math.floor(rand() * 32) * 4;
    const v = Math.floor(70 + rand() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 4, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(8, 2, 14, 0.72)');
  grad.addColorStop(0.65, 'rgba(8, 2, 14, 0.35)');
  grad.addColorStop(1, 'rgba(8, 2, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
