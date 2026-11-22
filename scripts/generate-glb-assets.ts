import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Polyfill FileReader for Node 22 so GLTFExporter binary (.glb) export works cleanly
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: ((ev?: unknown) => void) | null = null;
  onload: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onload?.();
        this.onloadend?.();
      })
      .catch((err) => {
        this.onerror?.(err);
      });
  }

  readAsDataURL(blob: Blob) {
    blob
      .arrayBuffer()
      .then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        this.onload?.();
        this.onloadend?.();
      })
      .catch((err) => {
        this.onerror?.(err);
      });
  }
}

(globalThis as unknown as { FileReader: typeof NodeFileReader }).FileReader = NodeFileReader;

function mat(
  color: number,
  roughness = 0.65,
  metalness = 0.2,
  emissive = 0x000000,
  emissiveIntensity = 0
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function addPart(
  parent: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function buildCowboyHero(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cowboy_hero';

  const bootMat = mat(0x281622, 0.78, 0.25);
  const pantsMat = mat(0x3a2648, 0.75, 0.15);
  const ponchoMat = mat(0xe63946, 0.68, 0.12);
  const trimMat = mat(0xffaa2b, 0.28, 0.85, 0xff7700, 0.35);
  const skinMat = mat(0xd89b72, 0.72, 0.05);
  const hatMat = mat(0x4b2b1d, 0.8, 0.1);
  const visorMat = mat(0x22e3d4, 0.18, 0.6, 0x22e3d4, 1.5);

  // Boots
  addPart(g, 'boot_l', new THREE.BoxGeometry(0.24, 0.36, 0.34), bootMat, [-0.18, 0.18, 0.04]);
  addPart(g, 'boot_r', new THREE.BoxGeometry(0.24, 0.36, 0.34), bootMat, [0.18, 0.18, 0.04]);

  // Chaps / Legs
  addPart(g, 'leg_l', new THREE.CylinderGeometry(0.12, 0.11, 0.5, 8), pantsMat, [-0.18, 0.56, 0]);
  addPart(g, 'leg_r', new THREE.CylinderGeometry(0.12, 0.11, 0.5, 8), pantsMat, [0.18, 0.56, 0]);

  // Cyber Poncho (tapered flared silhouette)
  addPart(g, 'poncho_mesh', new THREE.CylinderGeometry(0.32, 0.52, 0.72, 8), ponchoMat, [0, 1.12, 0]);

  // Shoulder Mantle
  addPart(g, 'trim_mesh_shoulders', new THREE.BoxGeometry(0.92, 0.16, 0.44), trimMat, [0, 1.38, 0]);

  // Cyber Belt & Buckle
  addPart(g, 'belt_mesh', new THREE.CylinderGeometry(0.38, 0.4, 0.12, 8), bootMat, [0, 0.82, 0]);
  addPart(g, 'trim_mesh_buckle', new THREE.BoxGeometry(0.18, 0.14, 0.12), trimMat, [0, 0.82, 0.38]);

  // Arms
  addPart(g, 'arm_l', new THREE.CylinderGeometry(0.1, 0.09, 0.56, 8), pantsMat, [-0.48, 1.1, 0.08], [0.4, 0, 0.18]);
  addPart(g, 'arm_r', new THREE.CylinderGeometry(0.1, 0.09, 0.56, 8), pantsMat, [0.48, 1.1, 0.08], [0.4, 0, -0.18]);

  // Head & Cyber Visor
  addPart(g, 'head_mesh', new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat, [0, 1.62, 0]);
  addPart(g, 'visor_mesh', new THREE.BoxGeometry(0.36, 0.12, 0.2), visorMat, [0, 1.65, 0.12]);

  // Stetson Hat (brim + crown + glowing band)
  addPart(g, 'hat_mesh_brim', new THREE.CylinderGeometry(0.56, 0.58, 0.06, 12), hatMat, [0, 1.8, 0]);
  addPart(g, 'hat_mesh_crown', new THREE.CylinderGeometry(0.24, 0.3, 0.26, 10), hatMat, [0, 1.94, 0]);
  addPart(g, 'hatband_mesh', new THREE.CylinderGeometry(0.305, 0.305, 0.06, 10), visorMat, [0, 1.84, 0]);

  return g;
}

function buildEnemyRustler(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_rustler';

  const bootMat = mat(0x1b0e1e, 0.8, 0.2);
  const ponchoMat = mat(0xff2a55, 0.6, 0.15, 0x66081d, 0.25);
  const chromeMat = mat(0x9aa4ba, 0.25, 0.85);
  const hatMat = mat(0x281322, 0.85, 0.1);
  const bladeMat = mat(0xffdd22, 0.18, 0.4, 0xff8800, 1.9);

  // Hunched wide bandit stance + wide dual glowing amber machetes
  addPart(g, 'boot_l', new THREE.BoxGeometry(0.24, 0.34, 0.34), bootMat, [-0.22, 0.17, 0.04]);
  addPart(g, 'boot_r', new THREE.BoxGeometry(0.24, 0.34, 0.34), bootMat, [0.22, 0.17, 0.04]);
  addPart(g, 'legs', new THREE.BoxGeometry(0.54, 0.42, 0.3), bootMat, [0, 0.52, 0]);
  addPart(g, 'poncho', new THREE.ConeGeometry(0.62, 0.78, 6), ponchoMat, [0, 1.05, 0], [0.18, 0, 0]);
  addPart(g, 'pauldron_l', new THREE.BoxGeometry(0.3, 0.16, 0.34), chromeMat, [-0.48, 1.32, 0.04], [0, 0, 0.35]);
  addPart(g, 'pauldron_r', new THREE.BoxGeometry(0.3, 0.16, 0.34), chromeMat, [0.48, 1.32, 0.04], [0, 0, -0.35]);
  addPart(g, 'head', new THREE.BoxGeometry(0.32, 0.3, 0.32), bootMat, [0, 1.52, 0.08]);
  addPart(g, 'visor', new THREE.BoxGeometry(0.36, 0.11, 0.18), bladeMat, [0, 1.54, 0.2]);
  addPart(g, 'hat_brim', new THREE.CylinderGeometry(0.56, 0.58, 0.06, 10), hatMat, [0, 1.69, 0.06], [0.1, 0, 0]);
  addPart(g, 'hat_crown', new THREE.CylinderGeometry(0.22, 0.28, 0.2, 8), hatMat, [0, 1.81, 0.05], [0.1, 0, 0]);
  // Wide twin glowing amber machetes splayed out for clear silhouette
  addPart(g, 'blade_l', new THREE.BoxGeometry(0.11, 0.1, 0.78), bladeMat, [-0.58, 0.96, 0.42], [0.1, -0.25, 0]);
  addPart(g, 'blade_r', new THREE.BoxGeometry(0.11, 0.1, 0.78), bladeMat, [0.58, 0.96, 0.42], [0.1, 0.25, 0]);

  return g;
}

function buildEnemyRanger(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_ranger';

  const coatMat = mat(0x1f523f, 0.68, 0.18);
  const armorMat = mat(0x18222a, 0.4, 0.75);
  const acidMat = mat(0x66ff33, 0.18, 0.4, 0x44ff00, 1.9);
  const hatMat = mat(0x17261f, 0.78, 0.12);

  // Tall slender silhouette + towering antenna + long glowing sniper carbine
  addPart(g, 'duster_coat', new THREE.CylinderGeometry(0.25, 0.36, 1.52, 7), coatMat, [0, 0.76, 0]);
  addPart(g, 'chest_rig', new THREE.BoxGeometry(0.46, 0.4, 0.32), armorMat, [0, 1.38, 0]);
  addPart(g, 'battery_pack', new THREE.BoxGeometry(0.32, 0.5, 0.24), acidMat, [0, 1.38, -0.24]);
  addPart(g, 'antenna_mast', new THREE.CylinderGeometry(0.03, 0.04, 0.75, 6), armorMat, [-0.14, 1.98, -0.22]);
  addPart(g, 'antenna_tip', new THREE.OctahedronGeometry(0.11, 0), acidMat, [-0.14, 2.38, -0.22]);
  addPart(g, 'head', new THREE.BoxGeometry(0.28, 0.32, 0.28), armorMat, [0, 1.76, 0]);
  addPart(g, 'monocle_scope', new THREE.CylinderGeometry(0.1, 0.1, 0.26, 8), acidMat, [0.09, 1.8, 0.16], [Math.PI / 2, 0, 0]);
  addPart(g, 'hat_brim', new THREE.CylinderGeometry(0.42, 0.44, 0.05, 8), hatMat, [0, 1.94, 0]);
  addPart(g, 'hat_crown', new THREE.CylinderGeometry(0.18, 0.22, 0.34, 8), hatMat, [0, 2.12, 0]);
  // Extra-long glowing sniper rail carbine
  addPart(g, 'rifle_body', new THREE.BoxGeometry(0.12, 0.16, 1.38), armorMat, [0.34, 1.28, 0.62]);
  addPart(g, 'rifle_rail', new THREE.BoxGeometry(0.08, 0.08, 1.24), acidMat, [0.34, 1.38, 0.68]);

  return g;
}

function buildEnemyCharger(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_charger';

  const chassisMat = mat(0x283559, 0.38, 0.8);
  const plateMat = mat(0x151a2e, 0.65, 0.45);
  const cyanMat = mat(0x00f0ff, 0.15, 0.5, 0x00d8ff, 2.0);

  // Wide hunched armored Cyber-Bull with giant sweeping horns & glowing core turbine
  addPart(g, 'leg_l', new THREE.BoxGeometry(0.36, 0.58, 0.42), plateMat, [-0.36, 0.29, 0]);
  addPart(g, 'leg_r', new THREE.BoxGeometry(0.36, 0.58, 0.42), plateMat, [0.36, 0.29, 0]);
  addPart(g, 'torso_hull', new THREE.BoxGeometry(1.16, 0.78, 0.74), chassisMat, [0, 0.96, 0.04], [0.2, 0, 0]);
  addPart(g, 'reactor_core', new THREE.CylinderGeometry(0.24, 0.24, 0.2, 8), cyanMat, [0, 1.0, 0.36], [Math.PI / 2, 0, 0]);
  addPart(g, 'pauldron_l', new THREE.BoxGeometry(0.42, 0.44, 0.64), chassisMat, [-0.74, 1.15, 0.08]);
  addPart(g, 'pauldron_r', new THREE.BoxGeometry(0.42, 0.44, 0.64), chassisMat, [0.74, 1.15, 0.08]);
  addPart(g, 'helm', new THREE.BoxGeometry(0.48, 0.38, 0.44), plateMat, [0, 1.36, 0.28]);
  // Giant forward-sweeping Cyber-Bull horns
  addPart(g, 'horn_base_l', new THREE.ConeGeometry(0.14, 0.62, 6), cyanMat, [-0.48, 1.48, 0.38], [Math.PI / 2.2, 0, 0.55]);
  addPart(g, 'horn_base_r', new THREE.ConeGeometry(0.14, 0.62, 6), cyanMat, [0.48, 1.48, 0.38], [Math.PI / 2.2, 0, -0.55]);
  addPart(g, 'horn_tip_l', new THREE.ConeGeometry(0.1, 0.55, 6), cyanMat, [-0.62, 1.54, 0.76], [Math.PI / 2.1, 0, -0.15]);
  addPart(g, 'horn_tip_r', new THREE.ConeGeometry(0.1, 0.55, 6), cyanMat, [0.62, 1.54, 0.76], [Math.PI / 2.1, 0, 0.15]);

  return g;
}

function buildEnemyBombardier(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_bombardier';

  const hullMat = mat(0x5b1b70, 0.52, 0.48);
  const goldMat = mat(0xffc83b, 0.25, 0.85);
  const magentaGlow = mat(0xff33cc, 0.18, 0.3, 0xff22bb, 2.0);

  // Bulky round beetle-tank + twin angled dorsal mortar cannons with glowing magenta warheads
  addPart(g, 'tread_l', new THREE.BoxGeometry(0.34, 0.38, 0.76), hullMat, [-0.46, 0.19, 0]);
  addPart(g, 'tread_r', new THREE.BoxGeometry(0.34, 0.38, 0.76), hullMat, [0.46, 0.19, 0]);
  addPart(g, 'armor_body', new THREE.CylinderGeometry(0.62, 0.68, 0.78, 10), hullMat, [0, 0.68, 0]);
  addPart(g, 'gold_collar', new THREE.TorusGeometry(0.52, 0.09, 6, 12), goldMat, [0, 1.08, 0], [Math.PI / 2, 0, 0]);
  addPart(g, 'dome_helm', new THREE.SphereGeometry(0.36, 10, 8), goldMat, [0, 1.24, 0.08]);
  addPart(g, 'visor_slit', new THREE.BoxGeometry(0.42, 0.11, 0.2), magentaGlow, [0, 1.26, 0.3]);
  // Twin oversized dorsal mortar cannons
  addPart(g, 'mortar_l', new THREE.CylinderGeometry(0.18, 0.22, 0.86, 8), hullMat, [-0.52, 1.38, -0.1], [-0.42, 0, 0.12]);
  addPart(g, 'mortar_r', new THREE.CylinderGeometry(0.18, 0.22, 0.86, 8), hullMat, [0.52, 1.38, -0.1], [-0.42, 0, -0.12]);
  addPart(g, 'mortar_glow_l', new THREE.SphereGeometry(0.17, 8, 6), magentaGlow, [-0.56, 1.76, -0.26]);
  addPart(g, 'mortar_glow_r', new THREE.SphereGeometry(0.17, 8, 6), magentaGlow, [0.56, 1.76, -0.26]);

  return g;
}

function buildPropCactus(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_cactus';

  const cactusMat = mat(0x16806c, 0.72, 0.12);
  const rockMat = mat(0x7c3b2c, 0.9, 0.05);
  const neonMat = mat(0x22e3d4, 0.2, 0.4, 0x22e3d4, 1.5);

  addPart(g, 'base_rock', new THREE.DodecahedronGeometry(0.55, 0), rockMat, [0, 0.22, 0], [0, 0, 0], [1.2, 0.45, 1.1]);
  addPart(g, 'trunk', new THREE.CylinderGeometry(0.24, 0.28, 2.2, 8), cactusMat, [0, 1.1, 0]);
  addPart(g, 'arm_l_h', new THREE.BoxGeometry(0.55, 0.24, 0.24), cactusMat, [-0.38, 1.25, 0]);
  addPart(g, 'arm_l_v', new THREE.CylinderGeometry(0.16, 0.18, 0.85, 7), cactusMat, [-0.58, 1.62, 0]);
  addPart(g, 'arm_r_h', new THREE.BoxGeometry(0.48, 0.22, 0.22), cactusMat, [0.34, 0.95, 0]);
  addPart(g, 'arm_r_v', new THREE.CylinderGeometry(0.15, 0.17, 0.75, 7), cactusMat, [0.52, 1.28, 0]);
  addPart(g, 'neon_ring_1', new THREE.TorusGeometry(0.26, 0.04, 6, 10), neonMat, [0, 1.75, 0], [Math.PI / 2, 0, 0]);
  addPart(g, 'neon_ring_2', new THREE.TorusGeometry(0.27, 0.04, 6, 10), neonMat, [0, 0.9, 0], [Math.PI / 2, 0, 0]);

  return g;
}

function buildPropCrate(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_crate';

  const bodyMat = mat(0x3a2147, 0.58, 0.45);
  const frameMat = mat(0xff8424, 0.35, 0.75);
  const glowMat = mat(0xff3366, 0.2, 0.3, 0xff2255, 1.6);

  addPart(g, 'crate_core', new THREE.BoxGeometry(1.4, 1.25, 1.4), bodyMat, [0, 0.625, 0]);
  addPart(g, 'crate_rim_top', new THREE.BoxGeometry(1.52, 0.16, 1.52), frameMat, [0, 1.2, 0]);
  addPart(g, 'crate_rim_bot', new THREE.BoxGeometry(1.52, 0.16, 1.52), frameMat, [0, 0.08, 0]);
  addPart(g, 'hazard_band', new THREE.BoxGeometry(1.44, 0.18, 1.44), glowMat, [0, 0.64, 0]);

  return g;
}

function buildPropArch(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_arch';

  const stoneMat = mat(0x8e3a2d, 0.85, 0.08);
  const steelMat = mat(0x281736, 0.42, 0.75);
  const neonMagenta = mat(0xff2a9d, 0.2, 0.4, 0xff1e8a, 1.8);
  const neonCyan = mat(0x22e3d4, 0.2, 0.4, 0x22e3d4, 1.8);

  addPart(g, 'pillar_l', new THREE.BoxGeometry(1.2, 4.2, 1.2), stoneMat, [-3.0, 2.1, 0]);
  addPart(g, 'pillar_r', new THREE.BoxGeometry(1.2, 4.2, 1.2), stoneMat, [3.0, 2.1, 0]);
  addPart(g, 'cap_l', new THREE.BoxGeometry(1.45, 0.35, 1.45), steelMat, [-3.0, 4.25, 0]);
  addPart(g, 'cap_r', new THREE.BoxGeometry(1.45, 0.35, 1.45), steelMat, [3.0, 4.25, 0]);
  addPart(g, 'lintel', new THREE.BoxGeometry(7.6, 0.9, 1.1), steelMat, [0, 4.6, 0]);
  addPart(g, 'neon_bar_top', new THREE.BoxGeometry(7.2, 0.16, 1.18), neonMagenta, [0, 4.9, 0]);
  addPart(g, 'neon_bar_bot', new THREE.BoxGeometry(6.4, 0.14, 1.18), neonCyan, [0, 4.25, 0]);
  addPart(g, 'star_crest', new THREE.OctahedronGeometry(0.55, 0), neonCyan, [0, 5.5, 0]);

  return g;
}

function buildPropTombstone(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_tombstone';

  const stoneMat = mat(0x3a3248, 0.88, 0.08);
  const darkStoneMat = mat(0x221b2d, 0.92, 0.05);
  const mossMat = mat(0x165b4a, 0.82, 0.08);
  const runeMat = mat(0x22e3d4, 0.18, 0.35, 0x22e3d4, 1.55);

  // Dirt mound & weathered base plinth
  addPart(g, 'dirt_mound', new THREE.CylinderGeometry(1.05, 1.28, 0.24, 7), darkStoneMat, [0, 0.12, 0]);
  addPart(g, 'plinth', new THREE.BoxGeometry(1.5, 0.34, 0.88), darkStoneMat, [0, 0.36, 0]);
  // Stepped carved tombstone slab
  addPart(g, 'slab_body', new THREE.BoxGeometry(1.22, 1.42, 0.44), stoneMat, [0, 1.18, 0], [-0.05, 0, 0]);
  addPart(g, 'slab_arch', new THREE.CylinderGeometry(0.6, 0.6, 0.44, 8), stoneMat, [0, 1.85, -0.03], [Math.PI / 2, 0, 0]);
  // Glowing cyber-cross epitaph rune on front
  addPart(g, 'rune_v', new THREE.BoxGeometry(0.12, 0.72, 0.08), runeMat, [0, 1.32, 0.22], [-0.05, 0, 0]);
  addPart(g, 'rune_h', new THREE.BoxGeometry(0.46, 0.12, 0.08), runeMat, [0, 1.46, 0.21], [-0.05, 0, 0]);
  // Toxic cemetery moss patches
  addPart(g, 'moss_l', new THREE.BoxGeometry(0.36, 0.28, 0.52), mossMat, [-0.52, 0.62, 0.04]);
  addPart(g, 'moss_r', new THREE.BoxGeometry(0.32, 0.22, 0.48), mossMat, [0.48, 0.52, -0.06]);

  return g;
}

function buildPropDataCache(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_datacache';

  const steelMat = mat(0x1f283d, 0.42, 0.78);
  const copperMat = mat(0xd96b27, 0.35, 0.75);
  const coreCyan = mat(0x22e3d4, 0.15, 0.35, 0x22e3d4, 1.85);
  const coreAmber = mat(0xffaa2b, 0.18, 0.35, 0xffaa2b, 1.65);

  // Armored mainframe supply terminal / cache chest
  addPart(g, 'base_plate', new THREE.BoxGeometry(1.64, 0.2, 1.32), steelMat, [0, 0.1, 0]);
  addPart(g, 'vault_body', new THREE.BoxGeometry(1.42, 0.92, 1.12), steelMat, [0, 0.62, 0]);
  addPart(g, 'copper_band_l', new THREE.BoxGeometry(0.18, 1.0, 1.2), copperMat, [-0.54, 0.64, 0]);
  addPart(g, 'copper_band_r', new THREE.BoxGeometry(0.18, 1.0, 1.2), copperMat, [0.54, 0.64, 0]);
  addPart(g, 'top_lid', new THREE.BoxGeometry(1.52, 0.2, 1.18), copperMat, [0, 1.16, 0]);
  // Glowing canister & holo-crystal beacon on top
  addPart(g, 'core_cell', new THREE.CylinderGeometry(0.24, 0.24, 0.78, 8), coreCyan, [0, 0.7, 0.42], [0, 0, Math.PI / 2]);
  addPart(g, 'beacon_crystal', new THREE.OctahedronGeometry(0.26, 0), coreAmber, [0, 1.54, 0]);

  return g;
}

function buildPropTreeGiant(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_tree_giant';

  // Colossal severed hollow tree stump gripping cracked scorched earth + converging industrial pipe furnace crater
  const barkMat = mat(0x2a140f, 0.94, 0.1, 0x1a0604, 0.25);
  const darkBarkMat = mat(0x160a08, 0.96, 0.08, 0x120302, 0.18);
  const woodCutMat = mat(0x522a1b, 0.88, 0.08, 0x260c05, 0.2);
  const pipeSteelMat = mat(0x2d323d, 0.48, 0.78);
  const pipeRustMat = mat(0x5b281c, 0.65, 0.58);
  const emberMat = mat(0xff4a14, 0.25, 0.2, 0xff3b0f, 1.9);
  const furnaceCoreMat = mat(0xffcc66, 0.15, 0.1, 0xff7718, 2.5);

  const addSeg = (
    name: string,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    rBot: number,
    rTop: number,
    m: THREE.Material = barkMat,
    radialSegs = 8
  ) => {
    const start = new THREE.Vector3(x1, y1, z1);
    const end = new THREE.Vector3(x2, y2, z2);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.05) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, radialSegs), m);
    mesh.name = name;
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(mesh);
  };

  // 1. Central glowing furnace sinkhole crater inside the hollow stump base
  addPart(g, 'furnace_pit_ring', new THREE.TorusGeometry(4.8, 0.85, 7, 16), pipeRustMat, [0, 0.35, 0.4], [Math.PI / 2, 0, 0]);
  addPart(g, 'furnace_glow_disc', new THREE.CylinderGeometry(4.4, 4.4, 0.45, 16), furnaceCoreMat, [0, 0.18, 0.4]);
  addPart(g, 'furnace_core_spire', new THREE.OctahedronGeometry(2.2, 1), emberMat, [0, 1.85, 0.2], [0.2, 0.4, 0.1]);

  // 2. Heavy radial industrial pipes converging down into the glowing hollow stump crater
  const pipeAngles = [-2.55, -2.0, -1.35, -0.75, 0.75, 1.35, 2.0, 2.55];
  pipeAngles.forEach((ang, idx) => {
    const sx = Math.sin(ang) * 18.5;
    const sz = Math.cos(ang) * 16.5 + 1.0;
    const mx = Math.sin(ang) * 8.2;
    const mz = Math.cos(ang) * 7.8 + 0.6;
    const ex = Math.sin(ang) * 3.8;
    const ez = Math.cos(ang) * 3.8 + 0.4;
    const pMat = idx % 2 === 0 ? pipeSteelMat : pipeRustMat;
    addSeg(`pipe_outer_${idx}`, sx, 0.55, sz, mx, 0.85, mz, 0.52, 0.52, pMat, 8);
    addSeg(`pipe_plunge_${idx}`, mx, 0.85, mz, ex, -0.3, ez, 0.52, 0.48, pMat, 8);
    addPart(g, `pipe_flange_${idx}`, new THREE.CylinderGeometry(0.68, 0.68, 0.28, 8), emberMat, [mx, 0.85, mz], [0, ang, Math.PI / 2]);
  });

  // 3. Massive hollow severed stump staves forming an open jagged perimeter (leaving front archway gap!)
  const staveCount = 11;
  for (let i = 0; i < staveCount; i++) {
    // Arc from -140 deg around the back to +140 deg (front face at z+ stays open for breach gateway!)
    const t = i / (staveCount - 1);
    const ang = -Math.PI * 0.78 + t * (Math.PI * 1.56);
    const baseR = 8.4 + (i % 2) * 1.1;
    const topR = 5.4 + ((i + 1) % 2) * 0.55;
    const h = 11.4 + ((i * 5) % 4) * 1.15;

    const bx = Math.sin(ang) * baseR;
    const bz = -Math.cos(ang) * baseR;
    const tx = Math.sin(ang) * topR;
    const tz = -Math.cos(ang) * topR;

    addSeg(
      `stump_stave_${i}`,
      bx,
      0,
      bz,
      tx,
      h,
      tz,
      2.55,
      1.65,
      i % 2 === 0 ? barkMat : darkBarkMat,
      8
    );

    // Sawed / charred flat-ish top rim cap with slight ember fracture on edges
    addPart(
      g,
      `stump_cut_rim_${i}`,
      new THREE.CylinderGeometry(1.55, 1.72, 0.65, 7),
      i % 3 === 0 ? woodCutMat : barkMat,
      [tx, h + 0.1, tz],
      [(i % 3 - 1) * 0.14, ang, 0]
    );
    if (i % 3 === 1) {
      addSeg(`stump_ember_crack_${i}`, bx * 0.92, 1.2, bz * 0.92, tx * 0.94, h * 0.72, tz * 0.94, 0.32, 0.14, emberMat, 5);
    }

    // Flared crawling buttress root gripping the cracked earth outward
    const rx = Math.sin(ang) * (baseR + 7.2);
    const rz = -Math.cos(ang) * (baseR + 7.2);
    addSeg(
      `buttress_root_${i}`,
      bx * 0.96,
      2.4,
      bz * 0.96,
      rx,
      -0.15,
      rz,
      1.85,
      0.42,
      darkBarkMat,
      7
    );
  }

  // 4. Twin massive front gatekeeper buttress roots framing the North Breach Portal
  addSeg('gate_root_l', -6.8, 0.2, 4.2, -13.8, -0.2, 10.6, 2.0, 0.52, darkBarkMat, 7);
  addSeg('gate_root_r', 6.8, 0.2, 4.2, 13.8, -0.2, 10.6, 2.0, 0.52, darkBarkMat, 7);

  // 5. Internal industrial scaffold pipes climbing up the hollow stump interior wall
  for (const ix of [-3.6, 0, 3.6]) {
    addSeg(`core_pipe_${ix}`, ix, 0.5, -4.4, ix * 0.9, 13.8, -3.6, 0.42, 0.42, pipeSteelMat, 8);
  }
  addPart(g, 'core_cross_beam', new THREE.BoxGeometry(8.2, 0.75, 0.85), pipeRustMat, [0, 8.6, -3.8]);
  addPart(g, 'core_furnace_beacon', new THREE.BoxGeometry(5.6, 0.35, 0.92), emberMat, [0, 8.6, -3.35]);

  return g;
}

function buildPropStumpSmall(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_stump_small';

  const barkMat = mat(0x3a2016, 0.92, 0.06);
  const darkBarkMat = mat(0x23120c, 0.95, 0.05);
  const cutTopMat = mat(0x7a4a2b, 0.84, 0.05);
  const ringMat = mat(0x4d2a19, 0.88, 0.04);
  const emberMat = mat(0xff5a1f, 0.3, 0.2, 0xff4514, 1.3);

  addPart(g, 'stump_trunk', new THREE.CylinderGeometry(0.95, 1.48, 1.35, 9), barkMat, [0, 0.68, 0]);
  addPart(g, 'stump_cut_face', new THREE.CylinderGeometry(0.92, 0.92, 0.08, 9), cutTopMat, [0, 1.36, 0]);
  addPart(g, 'stump_ring_inner', new THREE.CylinderGeometry(0.55, 0.55, 0.09, 9), ringMat, [0, 1.37, 0]);
  addPart(g, 'stump_ember_notch', new THREE.BoxGeometry(0.22, 0.62, 0.22), emberMat, [0.58, 0.72, 0.58], [0.2, 0.6, 0]);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.25;
    addPart(
      g,
      `root_${i}`,
      new THREE.BoxGeometry(0.55, 0.45, 1.35),
      i % 2 === 0 ? darkBarkMat : barkMat,
      [Math.sin(a) * 1.15, 0.22, Math.cos(a) * 1.15],
      [0.24, a, 0]
    );
  }
  return g;
}

function buildPropRoadSign(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_road_sign';

  const postMat = mat(0x423026, 0.86, 0.28);
  const plateWhiteMat = mat(0xd8ccb8, 0.76, 0.14);
  const plateTealMat = mat(0x1f6e6b, 0.74, 0.18);
  const textDarkMat = mat(0x1e1312, 0.85, 0.1);
  const rustAccentMat = mat(0x9e3b1e, 0.85, 0.25);

  // Speed Limit 60 weathered upright sign (right) + damaged Teal Highway sign (left)
  addPart(g, 'speed_post', new THREE.BoxGeometry(0.14, 3.1, 0.14), postMat, [0.95, 1.55, 0], [0, 0, -0.05]);
  addPart(g, 'speed_board', new THREE.BoxGeometry(1.12, 1.35, 0.08), plateWhiteMat, [0.95, 2.55, 0.06], [0, -0.1, -0.05]);
  // "60" + "SPEED" stylized crisp block bars so it reads unmistakably under Bayer dither
  addPart(g, 'speed_hdr_bar', new THREE.BoxGeometry(0.84, 0.16, 0.1), textDarkMat, [0.95, 2.95, 0.07], [0, -0.1, -0.05]);
  addPart(g, 'speed_num_6', new THREE.BoxGeometry(0.32, 0.48, 0.1), textDarkMat, [0.74, 2.42, 0.07], [0, -0.1, -0.05]);
  addPart(g, 'speed_num_0', new THREE.BoxGeometry(0.32, 0.48, 0.1), textDarkMat, [1.14, 2.42, 0.07], [0, -0.1, -0.05]);
  addPart(g, 'speed_rust', new THREE.BoxGeometry(0.36, 0.28, 0.09), rustAccentMat, [1.22, 2.04, 0.065], [0, -0.1, -0.05]);

  // Damaged Teal Highway Directional Sign
  addPart(g, 'hwy_post_l', new THREE.BoxGeometry(0.16, 2.9, 0.16), postMat, [-1.85, 1.45, -0.3]);
  addPart(g, 'hwy_post_r', new THREE.BoxGeometry(0.16, 2.9, 0.16), postMat, [-0.55, 1.45, -0.3]);
  addPart(g, 'hwy_board', new THREE.BoxGeometry(1.95, 1.15, 0.1), plateTealMat, [-1.2, 2.42, -0.22], [0, 0.12, 0.03]);
  addPart(g, 'hwy_arrow_bar', new THREE.BoxGeometry(1.4, 0.16, 0.12), plateWhiteMat, [-1.2, 2.6, -0.21], [0, 0.12, 0.03]);
  addPart(g, 'hwy_slash_red', new THREE.BoxGeometry(1.3, 0.14, 0.13), rustAccentMat, [-1.2, 2.35, -0.2], [0, 0.12, -0.22]);

  return g;
}

function buildPropUtilityPole(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_utility_pole';

  const woodMat = mat(0x4b2f21, 0.9, 0.06);
  const ironMat = mat(0x282c36, 0.55, 0.72);
  const insulatorMat = mat(0x22e3d4, 0.25, 0.3, 0x1aa89c, 1.1);
  const lampGlowMat = mat(0xffaa2b, 0.2, 0.2, 0xff7718, 1.6);

  // Tall crooked timber pole
  addPart(g, 'pole_shaft', new THREE.CylinderGeometry(0.16, 0.24, 7.6, 8), woodMat, [0, 3.8, 0], [0.03, 0, 0.08]);
  // Dual timber crossarms
  addPart(g, 'crossarm_top', new THREE.BoxGeometry(2.4, 0.18, 0.18), woodMat, [-0.24, 7.05, 0], [0, 0, 0.08]);
  addPart(g, 'crossarm_bot', new THREE.BoxGeometry(1.9, 0.16, 0.16), woodMat, [-0.2, 6.15, 0], [0, 0, 0.08]);
  // Ceramic insulators on crossarm
  for (const ix of [-1.25, -0.55, 0.15, 0.85]) {
    addPart(g, `insulator_${ix}`, new THREE.CylinderGeometry(0.06, 0.08, 0.22, 6), insulatorMat, [ix - 0.2, 7.22, 0]);
  }
  // Bent steel streetlamp arm & sodium lantern
  addPart(g, 'lamp_arm', new THREE.BoxGeometry(1.1, 0.1, 0.1), ironMat, [0.32, 5.45, 0], [0, 0, 0.16]);
  addPart(g, 'lamp_hood', new THREE.BoxGeometry(0.45, 0.14, 0.28), ironMat, [0.82, 5.56, 0]);
  addPart(g, 'lamp_bulb', new THREE.BoxGeometry(0.36, 0.1, 0.22), lampGlowMat, [0.82, 5.46, 0]);

  return g;
}

function buildPropMegaTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_mega_tower';

  // BLAME!-inspired brutalist industrial megastructure pillar + catwalks + heavy vertical pipes + stairs
  const darkIronMat = mat(0x1b1d22, 0.68, 0.65);
  const rustSteelMat = mat(0x462a20, 0.78, 0.45);
  const pipeMat = mat(0x353b47, 0.48, 0.78);
  const amberVentMat = mat(0xff8c2b, 0.25, 0.2, 0xff5a0a, 1.45);

  // Heavy ribbed vertical megastructure columns
  addPart(g, 'core_pillar', new THREE.BoxGeometry(2.6, 15.0, 2.6), darkIronMat, [0, 7.5, 0]);
  addPart(g, 'flank_rib_l', new THREE.BoxGeometry(0.65, 14.5, 3.1), rustSteelMat, [-1.45, 7.25, 0]);
  addPart(g, 'flank_rib_r', new THREE.BoxGeometry(0.65, 14.5, 3.1), rustSteelMat, [1.45, 7.25, 0]);

  // Multi-tier industrial catwalk decks + railings
  for (const cy of [3.2, 7.4, 11.6]) {
    addPart(g, `catwalk_deck_${cy}`, new THREE.BoxGeometry(4.4, 0.34, 4.2), rustSteelMat, [0, cy, 0.4]);
    addPart(g, `rail_front_${cy}`, new THREE.BoxGeometry(4.4, 0.12, 0.12), pipeMat, [0, cy + 0.72, 2.42]);
    addPart(g, `rail_post_l_${cy}`, new THREE.BoxGeometry(0.12, 0.7, 0.12), pipeMat, [-2.05, cy + 0.4, 2.42]);
    addPart(g, `rail_post_r_${cy}`, new THREE.BoxGeometry(0.12, 0.7, 0.12), pipeMat, [2.05, cy + 0.4, 2.42]);
  }

  // Diagonal industrial staircase truss connecting tiers
  addPart(g, 'stair_stringer', new THREE.BoxGeometry(0.9, 5.2, 0.25), darkIronMat, [0, 5.3, 1.85], [0.5, 0, -0.52]);

  // Thick exterior vertical & elbowed industrial conduits
  addPart(g, 'pipe_v_l', new THREE.CylinderGeometry(0.32, 0.32, 14.8, 8), pipeMat, [-1.75, 7.4, 1.45]);
  addPart(g, 'pipe_v_r', new THREE.CylinderGeometry(0.38, 0.38, 14.8, 8), pipeMat, [1.75, 7.4, 1.35]);
  addPart(g, 'pipe_cross', new THREE.CylinderGeometry(0.28, 0.28, 3.8, 8), rustSteelMat, [0, 9.6, 1.5], [0, 0, Math.PI / 2]);

  // Glowing furnace slit vent
  addPart(g, 'vent_slit_1', new THREE.BoxGeometry(1.4, 0.26, 0.2), amberVentMat, [0, 5.2, 1.38]);
  addPart(g, 'vent_slit_2', new THREE.BoxGeometry(1.4, 0.26, 0.2), amberVentMat, [0, 9.4, 1.38]);

  return g;
}

function buildPropWireframeTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'prop_wireframe_tower';

  // Dark cyberpunk wireframe monolith (magenta, gold & cyan glowing edges over obsidian core)
  const coreMat = mat(0x090517, 0.82, 0.25);
  const magentaMat = mat(0xff1e8a, 0.15, 0.3, 0xff1e8a, 2.1);
  const cyanMat = mat(0x00f5ff, 0.15, 0.3, 0x00e5ff, 2.0);
  const goldMat = mat(0xffd166, 0.18, 0.3, 0xffaa2b, 1.85);

  addPart(g, 'tower_core', new THREE.BoxGeometry(3.2, 17.0, 3.2), coreMat, [0, 8.5, 0]);

  // 4 Vertical glowing corner wireframe edges
  const corners: Array<[number, number]> = [
    [-1.64, -1.64],
    [1.64, -1.64],
    [-1.64, 1.64],
    [1.64, 1.64],
  ];
  corners.forEach(([cx, cz], idx) => {
    addPart(g, `edge_v_${idx}`, new THREE.BoxGeometry(0.11, 17.1, 0.11), idx % 2 === 0 ? magentaMat : cyanMat, [cx, 8.55, cz]);
  });

  // Horizontal glowing wireframe floor rings
  for (const hy of [2.5, 6.0, 9.5, 13.0, 16.8]) {
    const rMat = hy === 16.8 ? cyanMat : magentaMat;
    addPart(g, `ring_f_${hy}`, new THREE.BoxGeometry(3.38, 0.11, 0.11), rMat, [0, hy, 1.64]);
    addPart(g, `ring_b_${hy}`, new THREE.BoxGeometry(3.38, 0.11, 0.11), rMat, [0, hy, -1.64]);
    addPart(g, `ring_l_${hy}`, new THREE.BoxGeometry(0.11, 0.11, 3.38), rMat, [-1.64, hy, 0]);
    addPart(g, `ring_r_${hy}`, new THREE.BoxGeometry(0.11, 0.11, 3.38), rMat, [1.64, hy, 0]);
  }

  // Glowing golden data window clusters inside the tower facade
  for (const wy of [4.2, 7.8, 11.2, 14.6]) {
    addPart(g, `data_win_l_${wy}`, new THREE.BoxGeometry(0.85, 0.24, 0.08), goldMat, [-0.65, wy, 1.63]);
    addPart(g, `data_win_r_${wy}`, new THREE.BoxGeometry(0.65, 0.24, 0.08), goldMat, [0.7, wy - 0.35, 1.63]);
  }

  // Floating holographic data voxel cubes above tower
  addPart(g, 'holo_cube_1', new THREE.BoxGeometry(1.1, 0.9, 1.1), cyanMat, [-1.2, 18.6, 0.8]);
  addPart(g, 'holo_cube_2', new THREE.BoxGeometry(0.8, 0.8, 0.8), goldMat, [1.3, 19.6, -0.5]);

  return g;
}

// Weapons are built procedurally at runtime now (src/game/weaponModels.ts) — no .glb needed.

function buildBossWarlord(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'boss_cem_faces';

  // Target height = ~5.20 units (2.5x the 2.08u main cowboy!)
  // Palette inspired by Ref 1 (Adam Smasher brushed gunmetal/slate mech + crimson inner cables) & Ref 2 (serene prayer pose)
  const armorSlateMat = mat(0x626f80, 0.4, 0.62, 0x1a202c, 0.55);
  const armorDarkMat = mat(0x2d3440, 0.48, 0.58, 0x0f131a, 0.4);
  const blackHeadMat = mat(0x040407, 0.88, 0.18);
  const cableRedMat = mat(0xdc1b36, 0.32, 0.4, 0xaa0a22, 1.05);
  const visorRedMat = mat(0xff2a48, 0.15, 0.35, 0xff1e3c, 2.0);
  const whiteMaskMat = mat(0xffffff, 0.35, 0.08, 0xe8eef5, 0.55);
  const goldAccentMat = mat(0xe3a83e, 0.3, 0.78, 0x8f5610, 0.45);

  const addSeg = (
    parent: THREE.Object3D,
    name: string,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    rBot: number,
    rTop: number,
    m: THREE.Material,
    radialSegs = 8
  ) => {
    const start = new THREE.Vector3(x1, y1, z1);
    const end = new THREE.Vector3(x2, y2, z2);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    if (len < 0.02) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, radialSegs), m);
    mesh.name = name;
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
  };

  // 1. FOUR ARTICULATED MECHANICAL SPIDER LEGS (wide arachnid stance grounded at y = 0)
  const legAngles = [0.68, -0.68, Math.PI - 0.68, -Math.PI + 0.68];
  legAngles.forEach((ang, idx) => {
    const legGroup = new THREE.Group();
    legGroup.name = `spider_leg_${idx}`;
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);

    const hipX = sinA * 0.72;
    const hipY = 1.68;
    const hipZ = cosA * 0.72;

    const kneeX = sinA * 2.35;
    const kneeY = 2.32;
    const kneeZ = cosA * 2.35;

    const ankleX = sinA * 2.75;
    const ankleY = 0.82;
    const ankleZ = cosA * 2.75;

    const footX = sinA * 2.45;
    const footY = 0.06;
    const footZ = cosA * 2.45;

    // Crimson hydraulic piston + heavy slate femur + knee guard + armored tibia claw
    addSeg(legGroup, `leg_cable_${idx}`, hipX * 0.9, hipY - 0.18, hipZ * 0.9, kneeX * 0.92, kneeY - 0.25, kneeZ * 0.92, 0.16, 0.16, cableRedMat, 6);
    addSeg(legGroup, `leg_femur_${idx}`, hipX, hipY, hipZ, kneeX, kneeY, kneeZ, 0.3, 0.25, armorSlateMat, 8);
    addPart(legGroup, `leg_knee_${idx}`, new THREE.BoxGeometry(0.52, 0.52, 0.52), armorDarkMat, [kneeX, kneeY, kneeZ], [0, ang, 0]);
    addSeg(legGroup, `leg_tibia_${idx}`, kneeX, kneeY, kneeZ, ankleX, ankleY, ankleZ, 0.26, 0.18, armorSlateMat, 8);
    addSeg(legGroup, `leg_claw_${idx}`, ankleX, ankleY, ankleZ, footX, footY, footZ, 0.17, 0.09, armorDarkMat, 6);
    addPart(legGroup, `leg_ankle_piston_${idx}`, new THREE.BoxGeometry(0.28, 0.36, 0.28), cableRedMat, [ankleX, ankleY + 0.08, ankleZ], [0, ang, 0]);

    g.add(legGroup);
  });

  // 2. LOWER PELVIS CRADLE & SEGMENTED ADAM-SMASHER WAIST
  addPart(g, 'pelvis_core', new THREE.CylinderGeometry(0.86, 0.68, 0.72, 8), armorDarkMat, [0, 1.72, 0]);
  addPart(g, 'pelvis_armor_front', new THREE.BoxGeometry(1.18, 0.56, 0.98), armorSlateMat, [0, 1.78, 0.06]);
  for (let r = -2; r <= 2; r++) {
    addPart(g, `waist_cable_${r}`, new THREE.CylinderGeometry(0.11, 0.11, 0.66, 6), cableRedMat, [r * 0.24, 2.26, 0.26]);
    addPart(g, `waist_cable_b_${r}`, new THREE.CylinderGeometry(0.11, 0.11, 0.66, 6), cableRedMat, [r * 0.24, 2.26, -0.26]);
  }
  addPart(g, 'spine_core', new THREE.CylinderGeometry(0.54, 0.62, 0.78, 8), armorDarkMat, [0, 2.34, 0]);

  // 3. HEAVY BULKED ADAM-SMASHER TORSO CHASSIS & LAYERED CHEST PLATES
  addPart(g, 'torso_chassis', new THREE.BoxGeometry(1.92, 1.38, 1.18), armorDarkMat, [0, 3.28, 0]);
  addPart(g, 'chest_plate_upper', new THREE.BoxGeometry(1.74, 0.74, 1.32), armorSlateMat, [0, 3.55, 0.08], [0.14, 0, 0]);
  addPart(g, 'chest_plate_lower', new THREE.BoxGeometry(1.36, 0.56, 1.24), armorSlateMat, [0, 2.94, 0.06], [-0.12, 0, 0]);
  addPart(g, 'chest_crimson_vent_l', new THREE.BoxGeometry(0.24, 0.24, 0.18), visorRedMat, [-0.52, 3.46, 0.68]);
  addPart(g, 'chest_crimson_vent_r', new THREE.BoxGeometry(0.24, 0.24, 0.18), visorRedMat, [0.52, 3.46, 0.68]);
  addPart(g, 'collar_cowling', new THREE.TorusGeometry(0.76, 0.22, 6, 12), armorSlateMat, [0, 4.02, 0.02], [Math.PI / 2 - 0.12, 0, 0]);
  addPart(g, 'back_reactor_pack', new THREE.BoxGeometry(1.32, 1.22, 0.56), armorDarkMat, [0, 3.45, -0.68]);

  // Massive Multi-Layered Shoulder Pauldrons
  for (const side of [-1, 1]) {
    addPart(g, `pauldron_outer_${side}`, new THREE.BoxGeometry(0.86, 0.88, 1.14), armorSlateMat, [side * 1.32, 3.86, 0], [0, 0, side * 0.28]);
    addPart(g, `pauldron_inner_${side}`, new THREE.BoxGeometry(0.68, 0.68, 0.92), armorDarkMat, [side * 1.18, 3.68, 0.06], [0, 0, side * 0.16]);
    addPart(g, `shoulder_cable_${side}`, new THREE.CylinderGeometry(0.14, 0.14, 0.62, 6), cableRedMat, [side * 0.96, 3.36, 0.34], [0, 0, side * 0.4]);
  }

  // Sacred Industrial Dharma Halo Ring behind shoulders (blending Ref 1 mech + Ref 2 Buddhist motif)
  addPart(g, 'dharma_halo_outer', new THREE.TorusGeometry(1.52, 0.09, 6, 16), goldAccentMat, [0, 4.25, -0.78]);
  addPart(g, 'dharma_halo_inner', new THREE.TorusGeometry(1.18, 0.06, 6, 16), cableRedMat, [0, 4.25, -0.76]);

  // 4. TWO CYBERNETIC ARMS HELD IN BUDDHIST PRAYER (ANJALI MUDRA) IN FRONT OF CHEST
  const armsGroup = new THREE.Group();
  armsGroup.name = 'prayer_arms';
  for (const side of [-1, 1]) {
    // Upper arm drops outward from pauldron to elbow
    addSeg(armsGroup, `upper_arm_${side}`, side * 1.36, 3.56, 0.04, side * 1.12, 2.74, 0.54, 0.26, 0.24, armorDarkMat, 8);
    addPart(armsGroup, `elbow_guard_${side}`, new THREE.BoxGeometry(0.42, 0.42, 0.46), armorSlateMat, [side * 1.12, 2.72, 0.56]);
    // Forearm sweeps sharply inward so armored wrists & hands meet centered at chest
    addSeg(armsGroup, `forearm_${side}`, side * 1.12, 2.74, 0.56, side * 0.22, 3.16, 1.06, 0.24, 0.21, armorSlateMat, 8);
    addPart(armsGroup, `wrist_cuff_${side}`, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8), cableRedMat, [side * 0.24, 3.16, 1.04], [0.35, 0, side * -0.45]);
    // Pressed upright prayer palm + extended finger blade pointing skyward
    addPart(armsGroup, `prayer_palm_${side}`, new THREE.BoxGeometry(0.14, 0.46, 0.34), armorDarkMat, [side * 0.085, 3.46, 1.14], [0.18, 0, side * 0.06]);
    addPart(armsGroup, `prayer_fingers_${side}`, new THREE.BoxGeometry(0.1, 0.34, 0.22), goldAccentMat, [side * 0.055, 3.82, 1.18], [0.12, 0, side * 0.04]);
  }
  g.add(armsGroup);

  // 5. PITCH-BLACK HEAD WITH 4 SPINNING STARK-WHITE MASK FACES ("apenas o rosto é branco e o resto da cabeça preto")
  const headRoot = new THREE.Group();
  headRoot.name = 'head_black_base';
  // Black neck & dark solid obsidian skull core so the crown, neck, back & seams stay pitch black
  addPart(headRoot, 'neck_black', new THREE.CylinderGeometry(0.46, 0.54, 0.48, 10), blackHeadMat, [0, 4.18, 0.06]);
  addPart(headRoot, 'cranium_black_core', new THREE.CylinderGeometry(0.56, 0.54, 0.92, 12), blackHeadMat, [0, 4.62, 0.06]);
  addPart(headRoot, 'cranium_black_dome', new THREE.SphereGeometry(0.56, 12, 8), blackHeadMat, [0, 5.04, 0.06], [0, 0, 0], [1, 0.58, 1]);
  // Dark matte-black dorsal cables crowning the top of the black skull
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * Math.PI * 2 + Math.PI / 4;
    addPart(headRoot, `head_black_cable_${c}`, new THREE.BoxGeometry(0.14, 0.62, 0.14), blackHeadMat, [Math.sin(a) * 0.48, 4.86, Math.cos(a) * 0.48 + 0.06]);
  }
  g.add(headRoot);

  // Rotating Carousel holding ONLY the 4 porcelain-white faces at 0°, 90°, 180°, 270°
  const facesCarousel = new THREE.Group();
  facesCarousel.name = 'faces_carousel';
  facesCarousel.position.set(0, 4.62, 0.06);

  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    const maskGroup = new THREE.Group();
    maskGroup.name = `white_face_${f}`;
    maskGroup.rotation.y = ang;

    // Sculpted white facial plate projecting off the black skull (ONLY the face is white!)
    addPart(maskGroup, `face_plate_${f}`, new THREE.BoxGeometry(0.56, 0.72, 0.16), whiteMaskMat, [0, 0.0, 0.54]);
    addPart(maskGroup, `face_chin_${f}`, new THREE.BoxGeometry(0.38, 0.16, 0.14), whiteMaskMat, [0, -0.38, 0.52]);
    addPart(maskGroup, `face_brow_${f}`, new THREE.BoxGeometry(0.52, 0.14, 0.18), whiteMaskMat, [0, 0.28, 0.56]);

    // Deep pitch-black eye sockets, cyber-brow seam & grim slit carved into the white face
    addPart(maskGroup, `face_eye_l_${f}`, new THREE.BoxGeometry(0.14, 0.09, 0.06), blackHeadMat, [-0.14, 0.1, 0.61]);
    addPart(maskGroup, `face_eye_r_${f}`, new THREE.BoxGeometry(0.14, 0.09, 0.06), blackHeadMat, [0.14, 0.1, 0.61]);
    addPart(maskGroup, `face_seam_${f}`, new THREE.BoxGeometry(0.05, 0.36, 0.06), blackHeadMat, [0, 0.16, 0.61]);
    addPart(maskGroup, `face_mouth_${f}`, new THREE.BoxGeometry(0.24, 0.07, 0.06), blackHeadMat, [0, -0.18, 0.61]);

    facesCarousel.add(maskGroup);
  }
  g.add(facesCarousel);

  return g;
}

function buildEnemySpider(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_spider';

  const chitinMat = mat(0x1b122b, 0.52, 0.45);
  const sacMat = mat(0x70e000, 0.28, 0.25, 0x38b000, 1.55);
  const eyeMat = mat(0xff1e56, 0.15, 0.3, 0xff1e56, 2.2);
  const fangMat = mat(0x22e3d4, 0.25, 0.6, 0x00f5ff, 1.6);

  // Low-slung wide 8-legged arachnid silhouette (~2.1 units across)
  addPart(g, 'thorax', new THREE.BoxGeometry(0.58, 0.32, 0.56), chitinMat, [0, 0.42, 0.12]);
  addPart(g, 'abdomen', new THREE.DodecahedronGeometry(0.56, 0), sacMat, [0, 0.56, -0.52], [0.18, 0, 0], [1.05, 0.8, 1.25]);
  addPart(g, 'abdomen_ridge', new THREE.BoxGeometry(0.32, 0.2, 0.6), chitinMat, [0, 0.86, -0.48]);

  // Cluster eyes & cyber-mandible fangs
  addPart(g, 'eye_c', new THREE.BoxGeometry(0.18, 0.12, 0.1), eyeMat, [0, 0.5, 0.4]);
  addPart(g, 'eye_l', new THREE.BoxGeometry(0.11, 0.09, 0.1), eyeMat, [-0.19, 0.53, 0.38]);
  addPart(g, 'eye_r', new THREE.BoxGeometry(0.11, 0.09, 0.1), eyeMat, [0.19, 0.53, 0.38]);
  addPart(g, 'fang_l', new THREE.ConeGeometry(0.08, 0.36, 5), fangMat, [-0.16, 0.3, 0.48], [Math.PI * 0.7, 0, 0.16]);
  addPart(g, 'fang_r', new THREE.ConeGeometry(0.08, 0.36, 5), fangMat, [0.16, 0.3, 0.48], [Math.PI * 0.7, 0, -0.16]);

  // 8 wide-splayed articulated arachnid legs
  const legZ = [0.28, 0.08, -0.12, -0.34];
  for (let i = 0; i < 4; i++) {
    const z = legZ[i];
    const splay = (1.5 - i) * 0.2;
    for (const side of [-1, 1]) {
      addPart(
        g,
        `leg_upper_${side}_${i}`,
        new THREE.BoxGeometry(0.64, 0.09, 0.1),
        chitinMat,
        [side * 0.54, 0.52, z],
        [0, side * splay, side * -0.42]
      );
      addPart(
        g,
        `leg_lower_${side}_${i}`,
        new THREE.BoxGeometry(0.1, 0.52, 0.1),
        i % 2 === 0 ? sacMat : chitinMat,
        [side * 0.84, 0.24, z + splay * 0.25],
        [0, 0, side * 0.28]
      );
    }
  }

  return g;
}

function buildEnemySpore(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_spore';

  const fleshMat = mat(0x611c82, 0.55, 0.2);
  const coreMat = mat(0x9ef01a, 0.2, 0.3, 0x70e000, 1.95);
  const veinMat = mat(0xff2a85, 0.25, 0.25, 0xff1e8a, 1.6);

  // Floating bulbous jellyfish spore + orbiting spore pods
  addPart(g, 'sac_body', new THREE.DodecahedronGeometry(0.62, 0), fleshMat, [0, 1.25, 0], [0, 0.4, 0], [1.12, 1.1, 1.12]);
  addPart(g, 'bio_core', new THREE.OctahedronGeometry(0.36, 0), coreMat, [0, 1.25, 0.42]);
  addPart(g, 'crown_pod_1', new THREE.SphereGeometry(0.22, 7, 6), veinMat, [-0.36, 1.78, 0.08]);
  addPart(g, 'crown_pod_2', new THREE.SphereGeometry(0.24, 7, 6), coreMat, [0.32, 1.84, -0.08]);
  addPart(g, 'orbit_pod_1', new THREE.OctahedronGeometry(0.18, 0), coreMat, [-0.82, 1.25, 0]);
  addPart(g, 'orbit_pod_2', new THREE.OctahedronGeometry(0.18, 0), veinMat, [0.82, 1.25, 0]);
  addPart(g, 'orbit_pod_3', new THREE.OctahedronGeometry(0.18, 0), coreMat, [0, 1.25, -0.82]);

  // 4 hanging organic bio-tentacles
  const tentPos: Array<[number, number]> = [
    [-0.28, 0.24],
    [0.28, 0.24],
    [-0.26, -0.26],
    [0.26, -0.26],
  ];
  tentPos.forEach(([tx, tz], idx) => {
    addPart(
      g,
      `tentacle_${idx}`,
      new THREE.ConeGeometry(0.12, 0.82, 6),
      idx % 2 === 0 ? fleshMat : veinMat,
      [tx, 0.56, tz],
      [Math.PI, 0, tx * 0.5]
    );
  });

  return g;
}

function buildEnemyMantis(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_mantis';

  const barkMat = mat(0x1d4028, 0.62, 0.25);
  const chitinMat = mat(0x281136, 0.45, 0.55);
  const bladeMat = mat(0x00f5ff, 0.16, 0.45, 0x00e5ff, 2.0);
  const bioMat = mat(0xffaa2b, 0.22, 0.3, 0xff7700, 1.7);

  // Tall razor-crested praying mantis stalker + towering twin forward cyan scythes
  addPart(g, 'leg_l', new THREE.BoxGeometry(0.2, 0.84, 0.24), chitinMat, [-0.26, 0.42, -0.08], [-0.2, 0, 0]);
  addPart(g, 'leg_r', new THREE.BoxGeometry(0.2, 0.84, 0.24), chitinMat, [0.26, 0.42, -0.08], [-0.2, 0, 0]);
  addPart(g, 'abdomen', new THREE.ConeGeometry(0.38, 1.05, 6), barkMat, [0, 1.05, -0.32], [-0.55, 0, 0]);
  addPart(g, 'thorax', new THREE.BoxGeometry(0.54, 0.72, 0.48), barkMat, [0, 1.4, 0.08], [0.22, 0, 0]);
  addPart(g, 'spine_crest', new THREE.BoxGeometry(0.14, 0.82, 0.32), bioMat, [0, 1.76, -0.18], [-0.42, 0, 0]);
  addPart(g, 'head', new THREE.ConeGeometry(0.26, 0.48, 5), chitinMat, [0, 1.88, 0.28], [Math.PI / 2, 0, 0]);
  addPart(g, 'eyes', new THREE.BoxGeometry(0.42, 0.12, 0.16), bladeMat, [0, 1.9, 0.42]);

  // Twin extra-long glowing cyan scythe blades swept forward
  addPart(g, 'scythe_l', new THREE.BoxGeometry(0.11, 0.22, 1.18), bladeMat, [-0.52, 1.32, 0.62], [0.3, 0.22, 0]);
  addPart(g, 'scythe_r', new THREE.BoxGeometry(0.11, 0.22, 1.18), bladeMat, [0.52, 1.32, 0.62], [0.3, -0.22, 0]);

  return g;
}

function buildEnemyJuggernaut(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_juggernaut';

  const ironMat = mat(0x2b303c, 0.55, 0.72);
  const rustPlateMat = mat(0x522a1b, 0.7, 0.45);
  const furnaceMat = mat(0xff8c1a, 0.22, 0.2, 0xff5a00, 1.9);
  const steelMat = mat(0x64748b, 0.35, 0.85);

  // Heavy stomping mech legs
  addPart(g, 'leg_l', new THREE.BoxGeometry(0.42, 0.92, 0.46), ironMat, [-0.36, 0.46, 0]);
  addPart(g, 'leg_r', new THREE.BoxGeometry(0.42, 0.92, 0.46), ironMat, [0.36, 0.46, 0]);
  addPart(g, 'boot_l', new THREE.BoxGeometry(0.48, 0.24, 0.6), steelMat, [-0.36, 0.12, 0.08]);
  addPart(g, 'boot_r', new THREE.BoxGeometry(0.48, 0.24, 0.6), steelMat, [0.36, 0.12, 0.08]);

  // Hulking boiler chest & glowing furnace slit visor
  addPart(g, 'torso_hull', new THREE.BoxGeometry(1.18, 1.05, 0.86), ironMat, [0, 1.38, 0]);
  addPart(g, 'chest_plate', new THREE.BoxGeometry(0.92, 0.74, 0.22), rustPlateMat, [0, 1.38, 0.46]);
  addPart(g, 'furnace_core', new THREE.BoxGeometry(0.44, 0.28, 0.12), furnaceMat, [0, 1.42, 0.56]);
  addPart(g, 'dome_helm', new THREE.CylinderGeometry(0.32, 0.38, 0.42, 8), steelMat, [0, 2.02, 0.06]);
  addPart(g, 'visor_slit', new THREE.BoxGeometry(0.48, 0.12, 0.16), furnaceMat, [0, 2.04, 0.36]);

  // Towering asymmetrical boiler shoulder shields + back exhaust smokestacks
  addPart(g, 'pauldron_l', new THREE.BoxGeometry(0.56, 0.62, 0.72), rustPlateMat, [-0.82, 1.72, 0], [0, 0, 0.22]);
  addPart(g, 'pauldron_r', new THREE.BoxGeometry(0.56, 0.62, 0.72), rustPlateMat, [0.82, 1.72, 0], [0, 0, -0.22]);
  addPart(g, 'stack_l', new THREE.CylinderGeometry(0.11, 0.14, 0.75, 6), steelMat, [-0.36, 2.15, -0.34]);
  addPart(g, 'stack_r', new THREE.CylinderGeometry(0.11, 0.14, 0.75, 6), steelMat, [0.36, 2.15, -0.34]);

  // Twin arm-mounted rotary autocannons
  addPart(g, 'cannon_l', new THREE.CylinderGeometry(0.14, 0.16, 0.92, 8), steelMat, [-0.88, 1.24, 0.44], [Math.PI / 2, 0, 0]);
  addPart(g, 'cannon_r', new THREE.CylinderGeometry(0.14, 0.16, 0.92, 8), steelMat, [0.88, 1.24, 0.44], [Math.PI / 2, 0, 0]);
  addPart(g, 'muzzle_l', new THREE.BoxGeometry(0.18, 0.18, 0.12), furnaceMat, [-0.88, 1.24, 0.92]);
  addPart(g, 'muzzle_r', new THREE.BoxGeometry(0.18, 0.18, 0.12), furnaceMat, [0.88, 1.24, 0.92]);

  return g;
}

function buildEnemyTesla(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'enemy_tesla';

  const obsidianMat = mat(0x131726, 0.35, 0.85);
  const copperMat = mat(0xc26a2b, 0.38, 0.88);
  const arcMat = mat(0x38bdf8, 0.15, 0.2, 0x00d9ff, 2.2);
  const boneMat = mat(0xdbeafe, 0.4, 0.3, 0x38bdf8, 0.45);

  // Hovering horned cyber-skull core
  addPart(g, 'skull_cranium', new THREE.DodecahedronGeometry(0.46, 0), obsidianMat, [0, 1.48, 0]);
  addPart(g, 'skull_face', new THREE.BoxGeometry(0.48, 0.42, 0.24), boneMat, [0, 1.44, 0.36]);
  addPart(g, 'eye_l', new THREE.BoxGeometry(0.12, 0.1, 0.12), arcMat, [-0.13, 1.5, 0.46]);
  addPart(g, 'eye_r', new THREE.BoxGeometry(0.12, 0.1, 0.12), arcMat, [0.13, 1.5, 0.46]);
  addPart(g, 'jaw', new THREE.BoxGeometry(0.32, 0.14, 0.22), obsidianMat, [0, 1.18, 0.32]);

  // Swept horns & dorsal Tesla coil tower
  addPart(g, 'horn_l', new THREE.ConeGeometry(0.12, 0.62, 5), copperMat, [-0.36, 1.92, -0.05], [-0.35, 0, 0.42]);
  addPart(g, 'horn_r', new THREE.ConeGeometry(0.12, 0.62, 5), copperMat, [0.36, 1.92, -0.05], [-0.35, 0, -0.42]);
  addPart(g, 'coil_spire', new THREE.CylinderGeometry(0.08, 0.14, 0.68, 6), copperMat, [0, 2.02, -0.1]);
  addPart(g, 'coil_orb', new THREE.OctahedronGeometry(0.2, 0), arcMat, [0, 2.42, -0.1]);

  // Orbiting electric arc rings / wing prongs
  addPart(g, 'tesla_ring', new THREE.TorusGeometry(0.68, 0.06, 6, 16), arcMat, [0, 1.48, 0], [Math.PI / 2.2, 0, 0]);
  addPart(g, 'prong_l', new THREE.OctahedronGeometry(0.16, 0), arcMat, [-0.74, 1.48, 0.08]);
  addPart(g, 'prong_r', new THREE.OctahedronGeometry(0.16, 0), arcMat, [0.74, 1.48, 0.08]);
  addPart(g, 'thruster_tail', new THREE.ConeGeometry(0.18, 0.56, 6), arcMat, [0, 0.92, -0.04], [Math.PI, 0, 0]);

  return g;
}

async function exportGlb(group: THREE.Group, outPath: string) {
  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (res) => resolve(res as ArrayBuffer),
      (err) => reject(err),
      { binary: true }
    );
  });
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'src/assets/models');
  fs.mkdirSync(outDir, { recursive: true });

  const builders: Array<[string, () => THREE.Group]> = [
    ['cowboy_hero.glb', buildCowboyHero],
    ['enemy_rustler.glb', buildEnemyRustler],
    ['enemy_ranger.glb', buildEnemyRanger],
    ['enemy_charger.glb', buildEnemyCharger],
    ['enemy_bombardier.glb', buildEnemyBombardier],
    ['enemy_spider.glb', buildEnemySpider],
    ['enemy_spore.glb', buildEnemySpore],
    ['enemy_mantis.glb', buildEnemyMantis],
    ['enemy_juggernaut.glb', buildEnemyJuggernaut],
    ['enemy_tesla.glb', buildEnemyTesla],
    ['boss_warlord.glb', buildBossWarlord],
    ['prop_cactus.glb', buildPropCactus],
    ['prop_crate.glb', buildPropCrate],
    ['prop_arch.glb', buildPropArch],
    ['prop_tombstone.glb', buildPropTombstone],
    ['prop_datacache.glb', buildPropDataCache],
    ['prop_tree_giant.glb', buildPropTreeGiant],
    ['prop_stump_small.glb', buildPropStumpSmall],
    ['prop_road_sign.glb', buildPropRoadSign],
    ['prop_utility_pole.glb', buildPropUtilityPole],
    ['prop_mega_tower.glb', buildPropMegaTower],
    ['prop_wireframe_tower.glb', buildPropWireframeTower],
  ];

  for (const [filename, fn] of builders) {
    const group = fn();
    const outPath = path.join(outDir, filename);
    await exportGlb(group, outPath);
    console.log(`Generated ${filename} (${fs.statSync(outPath).size} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
