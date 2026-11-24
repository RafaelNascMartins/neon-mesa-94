import {
  ARENA_RADIUS,
  ARENA_SPAWNABLE_WEAPONS,
  BARRICADE_MAX_HP,
  BARRICADE_TOTAL_PLANKS,
  MANUAL_WEAPONS,
  MAX_EQUIPPED_WEAPONS,
  WEAPONS,
} from './config';
import type {
  ArenaZone,
  EnemyArchetype,
  LeaderboardEntry,
  ObstacleDef,
  PlayerProgress,
  SkinId,
  TreeSubBiome,
  WeaponDef,
  WeaponId,
} from './types';
import { ACHIEVEMENTS, achievementForSkin } from './achievements';

type SkinProgress = Pick<PlayerProgress, 'totalKills' | 'achievements'>;

/** Skins are earned through achievements (Sunset Drifter is always yours). */
export function evaluateSkinUnlocks(progress: SkinProgress): SkinId[] {
  const unlocked: SkinId[] = ['sunset'];
  for (const a of ACHIEVEMENTS) {
    if (a.skin && progress.achievements.includes(a.id) && !unlocked.includes(a.skin)) unlocked.push(a.skin);
  }
  return unlocked;
}

export function getSkinUnlockProgress(skinId: SkinId, progress: SkinProgress): { unlocked: boolean; label: string } {
  if (evaluateSkinUnlocks(progress).includes(skinId)) return { unlocked: true, label: 'LIBERADA' };
  const ach = achievementForSkin(skinId);
  if (!ach) return { unlocked: true, label: 'LIBERADA' };
  const counter = ach.goal ? ` (${Math.min(progress[ach.goal.stat], ach.goal.target)}/${ach.goal.target})` : '';
  // Story achievements stay a secret until earned
  if (ach.story) return { unlocked: false, label: '🏆 CONQUISTA SECRETA DA HISTÓRIA — continue descendo...' };
  return { unlocked: false, label: `🏆 ${ach.title.toUpperCase()} — ${ach.desc}${counter}` };
}

export function calculateComboKillScore(basePoints: number, currentCombo: number): {
  nextCombo: number;
  pointsAwarded: number;
} {
  const nextCombo = currentCombo + 1;
  const multiplier = Math.min(1 + (nextCombo - 1) * 0.25, 6);
  return {
    nextCombo,
    pointsAwarded: Math.round(basePoints * multiplier),
  };
}

export function resolveCircleObstacleCollision(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly Pick<ObstacleDef, 'x' | 'z' | 'halfW' | 'halfD'>[],
  arenaRadius: number = ARENA_RADIUS
): { x: number; z: number } {
  let rx = x;
  let rz = z;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const minX = obs.x - obs.halfW;
    const maxX = obs.x + obs.halfW;
    const minZ = obs.z - obs.halfD;
    const maxZ = obs.z + obs.halfD;

    const closestX = Math.max(minX, Math.min(rx, maxX));
    const closestZ = Math.max(minZ, Math.min(rz, maxZ));

    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        const left = rx - minX;
        const right = maxX - rx;
        const top = rz - minZ;
        const bottom = maxZ - rz;
        const m = Math.min(left, right, top, bottom);
        if (m === left) rx = minX - radius;
        else if (m === right) rx = maxX + radius;
        else if (m === top) rz = minZ - radius;
        else rz = maxZ + radius;
      }
    }
  }

  const maxR = arenaRadius - radius;
  const distFromCenterSq = rx * rx + rz * rz;
  if (distFromCenterSq > maxR * maxR) {
    const d = Math.sqrt(distFromCenterSq);
    rx = (rx / d) * maxR;
    rz = (rz / d) * maxR;
  }

  return { x: rx, z: rz };
}

export function segmentCircleIntersect(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  cx: number,
  cz: number,
  radius: number
): boolean {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-8) {
    const ex = cx - x1;
    const ez = cz - z1;
    return ex * ex + ez * ez <= radius * radius;
  }
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / lenSq));
  const px = x1 + t * dx;
  const pz = z1 + t * dz;
  const ex = cx - px;
  const ez = cz - pz;
  return ex * ex + ez * ez <= radius * radius;
}

/** Cem Faces' first fight. */
/** Never more than this many enemies alive at once. */
export const MAX_ENEMIES_ON_FIELD = 15;

export const BOSS_FIRST_WAVE = 10;
/** His second coming: five rooms after VM's (opens with a normal round, then he drops in). */
export const BOSS_RETURN_WAVE = 15;

/**
 * The second world (the rewrite, Frutiger Aero): 5 rooms, boss 1 (the Demiurge's machine
 * servant), 5 rooms going corrupt one by one, boss 2 (the Demiurge). Then the third world.
 */
export const AERO_FIRST_WAVE = BOSS_RETURN_WAVE + 1;
export const AERO_SERVANT_WAVE = AERO_FIRST_WAVE + 5;
export const AERO_DEMIURGE_WAVE = AERO_SERVANT_WAVE + 6;
/** O Programador belongs to the third world (not built yet): for now he waits right after the Demiurge. */
export const PROGRAMMER_WAVE = AERO_DEMIURGE_WAVE + 1;

/** Room number (1–10) of an aero wave, or null for its two boss rooms. */
export function aeroRoomNumber(wave: number): number | null {
  if (wave === AERO_SERVANT_WAVE || wave === AERO_DEMIURGE_WAVE) return null;
  return wave < AERO_SERVANT_WAVE ? wave - AERO_FIRST_WAVE + 1 : wave - AERO_SERVANT_WAVE + 5;
}

export function isBossWave(wave: number): boolean {
  return wave === BOSS_FIRST_WAVE || wave === BOSS_RETURN_WAVE;
}

export function isBossReturnWave(wave: number): boolean {
  return wave === BOSS_RETURN_WAVE;
}

export function isManualWeapon(weapon: WeaponId): boolean {
  return MANUAL_WEAPONS.has(weapon);
}

export function computeParabolicJumpHeight(u: number, maxHeight: number): number {
  const t = Math.max(0, Math.min(1, u));
  return 4 * maxHeight * t * (1 - t);
}

export function isBossEnraged(hp: number, maxHp: number): boolean {
  return maxHp > 0 && hp > 0 && hp <= maxHp * 0.5;
}

export function getZoneForWave(wave: number): ArenaZone {
  const w = Math.max(1, Math.floor(wave));
  if (w === 1) return 'road';
  if (w >= 2 && w <= 4) return 'desert';
  if (w >= 5 && w <= 7) return 'cemetery';
  if (w === 8) return 'clearing';
  return 'tree';
}

export function getSectorRoundInfo(wave: number): { round: number; totalRounds: number } {
  const w = Math.max(1, Math.floor(wave));
  const zone = getZoneForWave(w);
  if (zone === 'desert') return { round: w - 1, totalRounds: 3 };
  if (zone === 'cemetery') return { round: w - 4, totalRounds: 3 };
  if (zone === 'tree') return { round: w - 8, totalRounds: 1 };
  return { round: 1, totalRounds: 1 };
}

export function getNextZoneForWave(wave: number): ArenaZone {
  return getZoneForWave(Math.max(1, Math.floor(wave)) + 1);
}

export function stepCyberBlend(currentRatio: number, direction: 'up' | 'down'): number {
  const delta = direction === 'up' ? 0.2 : -0.2;
  return Math.round(Math.max(0, Math.min(1, currentRatio + delta)) * 100) / 100;
}

export function getTreeSubBiomeFromRatio(cyberRatio: number): TreeSubBiome {
  if (cyberRatio <= 0.35) return 'megastructure';
  if (cyberRatio >= 0.65) return 'wireframe';
  return 'hybrid';
}

export function getTreeSubBiome(treeDepth: number): TreeSubBiome {
  return treeDepth >= 3 ? 'wireframe' : 'megastructure';
}

export function getBarricadePlanksRemaining(
  hp: number,
  maxHp = BARRICADE_MAX_HP,
  totalPlanks = BARRICADE_TOTAL_PLANKS
): number {
  if (hp <= 0) return 0;
  return Math.min(totalPlanks, Math.max(1, Math.ceil((hp / Math.max(1, maxHp)) * totalPlanks)));
}

export interface WeaponHeatState {
  heat: number; // 0..1
  overheated: boolean;
  overheatTimer: number; // seconds left when locked
  reloadFlashTimer: number; // brief flash when cooling down / venting
}

export function stepWeaponHeat(
  state: WeaponHeatState,
  dt: number,
  coolRate: number,
  didFire: boolean,
  heatPerShot: number,
  overheatDuration: number,
  isStarterPistol = false
): WeaponHeatState {
  let { heat, overheated, overheatTimer, reloadFlashTimer } = state;
  reloadFlashTimer = Math.max(0, reloadFlashTimer - dt);

  if (overheated) {
    overheatTimer = Math.max(0, overheatTimer - dt);
    heat = Math.max(0, heat - (dt / Math.max(0.15, overheatDuration)) * 0.95);
    if (overheatTimer <= 0) {
      overheated = false;
      heat = 0;
      reloadFlashTimer = 0.25;
    }
    return { heat, overheated, overheatTimer, reloadFlashTimer };
  }

  if (didFire) {
    heat = Math.min(1, heat + heatPerShot);
    if (!isStarterPistol && heat >= 0.999) {
      overheated = true;
      overheatTimer = overheatDuration;
      reloadFlashTimer = overheatDuration;
    }
  } else if (heat > 0) {
    heat = Math.max(0, heat - coolRate * dt);
  }

  return { heat, overheated, overheatTimer, reloadFlashTimer };
}

export interface WavePlan {
  wave: number;
  zone: ArenaZone;
  isBossWave: boolean;
  enemies: EnemyArchetype[];
  speedMultiplier: number;
  hpMultiplier: number;
  spawnInterval: number;
  maxConcurrent: number;
  attackTokenCap: number;
}

export function computeWaveComposition(wave: number, zone?: ArenaZone): WavePlan {
  const w = Math.max(1, Math.floor(wave));
  const bossWave = isBossWave(w);
  const effectiveZone: ArenaZone = zone ?? getZoneForWave(w);

  if (bossWave && !isBossReturnWave(w)) {
    // Boss waves pit the player solely 1-on-1 against Cem Faces
    return {
      wave: w,
      zone: effectiveZone,
      isBossWave: true,
      enemies: ['boss'],
      speedMultiplier: 1 + Math.min((w - 1) * 0.06, 0.55),
      hpMultiplier: 1 + Math.min((w - 1) * 0.1, 1.2),
      spawnInterval: 0.9,
      maxConcurrent: 1,
      attackTokenCap: 1,
    };
  }

  // The return fight opens with a lighter ordinary round before he drops in
  const totalCount = isBossReturnWave(w)
    ? 10
    : effectiveZone === 'road'
      ? 7
      : effectiveZone === 'desert'
        ? 7 + (w - 2) * 2
        : effectiveZone === 'cemetery'
          ? 8 + (w - 5) * 2
          : effectiveZone === 'clearing'
            ? 4
            : Math.min(8 + Math.max(1, w - 8) * 2, 26);
  const enemies: EnemyArchetype[] = [];

  for (let i = 0; i < totalCount; i++) {
    if (effectiveZone === 'road') {
      // Stage 1 (Horizontal Estrada): nimble bandit rustlers + highway deadeye snipers
      if (i === totalCount - 1) enemies.push('ranger');
      else enemies.push(i % 4 === 3 ? 'ranger' : 'rustler');
    } else if (effectiveZone === 'desert') {
      // Stage 2 (Deserto 3 Rounds): bandits, deadeyes, cyber-bull chargers & R3 Ironclad juggernaut
      if (w >= 4 && i === totalCount - 1) {
        enemies.push('juggernaut');
      } else {
        const mod = i % 5;
        if (mod === 0 || mod === 1) enemies.push('rustler');
        else if (mod === 2 || mod === 3) enemies.push('ranger');
        else enemies.push('charger');
      }
    } else if (effectiveZone === 'cemetery') {
      // Stage 3 (Cemiterio 3 Rounds): rustlers, spiders, tesla wraiths, rangers & juggernauts
      const mod = i % 6;
      if (mod === 0 || mod === 1) enemies.push('rustler');
      else if (mod === 2) enemies.push('spider');
      else if (mod === 3) enemies.push('tesla');
      else if (mod === 4) enemies.push('ranger');
      else enemies.push(w >= 6 ? 'juggernaut' : 'charger');
    } else if (effectiveZone === 'clearing') {
      // Stage 4 (Pé da Árvore): strictly capped crater guardians so player can break the wooden barricade with any weapon
      const mod = i % 4;
      if (mod === 0) enemies.push('rustler');
      else if (mod === 1) enemies.push('tesla');
      else if (mod === 2) enemies.push('ranger');
      else enemies.push('juggernaut');
    } else {
      // Stage 5+ (Inside Arvore Binaria): cyber-industrial & organic malware mix including Tesla & Juggernaut
      const mod = i % 7;
      if (w <= 9) {
        if (mod <= 1) enemies.push('spider');
        else if (mod === 2 || mod === 3) enemies.push('spore');
        else if (mod === 4) enemies.push('tesla');
        else if (mod === 5) enemies.push('mantis');
        else enemies.push('juggernaut');
      } else {
        if (mod === 0) enemies.push('spider');
        else if (mod === 1 || mod === 2) enemies.push('spore');
        else if (mod === 3) enemies.push('tesla');
        else if (mod === 4) enemies.push('mantis');
        else if (mod === 5) enemies.push('juggernaut');
        else enemies.push('bombardier');
      }
    }
  }

  return {
    wave: w,
    zone: effectiveZone,
    isBossWave: bossWave,
    enemies,
    speedMultiplier: 1 + Math.min((w - 1) * 0.08, 0.78),
    hpMultiplier: 1 + Math.min((w - 1) * 0.13, 1.6),
    spawnInterval:
      effectiveZone === 'clearing' ? 2.5 : Math.max(0.32, 0.94 - (w - 1) * 0.075),
    maxConcurrent:
      effectiveZone === 'clearing' ? 3 : Math.min(10 + w * 2, MAX_ENEMIES_ON_FIELD),
    attackTokenCap: effectiveZone === 'clearing' ? 2 : w >= 4 ? 5 : 4,
  };
}

export function selectArenaWeaponSpawn(wave: number, rngVal = Math.random()): WeaponId {
  const pool: WeaponId[] =
    wave <= 1
      ? ['pistols', 'shotgun', 'plasma', 'katana']
      : ARENA_SPAWNABLE_WEAPONS;
  const idx = Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(0.9999, rngVal)) * pool.length));
  return pool[idx];
}

export interface WeaponPickupOutcome {
  ownedWeapons: WeaponId[];
  activeWeapon: WeaponId;
  ammo: Record<WeaponId, number>;
  pickedUp: boolean;
  requiresSwap: boolean;
  newlyUnlocked: boolean;
  swappedOut: { weaponId: WeaponId; ammo: number } | null;
}

export function acquireOrSwapWeapon(
  ownedWeapons: readonly WeaponId[],
  activeWeapon: WeaponId,
  ammo: Record<WeaponId, number>,
  groundWeapon: WeaponId,
  groundAmmo?: number,
  forceSwap = false
): WeaponPickupOutcome {
  const nextAmmo = { ...ammo };
  const cap = WEAPONS[groundWeapon].maxAmmo;
  const incomingAmmo =
    groundWeapon === 'pistol'
      ? Infinity
      : groundAmmo !== undefined && Number.isFinite(groundAmmo)
        ? Math.max(1, Math.min(cap, groundAmmo))
        : cap;

  // Already carrying this weapon -> reload automatically
  if (ownedWeapons.includes(groundWeapon)) {
    nextAmmo[groundWeapon] =
      groundWeapon === 'pistol'
        ? Infinity
        : Math.min(cap, Math.max(nextAmmo[groundWeapon] || 0, 0) + incomingAmmo);
    return {
      ownedWeapons: [...ownedWeapons],
      activeWeapon,
      ammo: nextAmmo,
      pickedUp: true,
      requiresSwap: false,
      newlyUnlocked: false,
      swappedOut: null,
    };
  }

  // Carrying fewer than MAX_EQUIPPED_WEAPONS (only 1 weapon) -> auto-pickup into slot 2
  if (ownedWeapons.length < MAX_EQUIPPED_WEAPONS) {
    nextAmmo[groundWeapon] = incomingAmmo;
    return {
      ownedWeapons: [...ownedWeapons, groundWeapon],
      activeWeapon: groundWeapon,
      ammo: nextAmmo,
      pickedUp: true,
      requiresSwap: false,
      newlyUnlocked: true,
      swappedOut: null,
    };
  }

  // Already carrying 2 weapons -> require explicit E-key swap
  if (!forceSwap) {
    return {
      ownedWeapons: [...ownedWeapons],
      activeWeapon,
      ammo: nextAmmo,
      pickedUp: false,
      requiresSwap: true,
      newlyUnlocked: false,
      swappedOut: null,
    };
  }

  // Swap currently equipped activeWeapon with groundWeapon in the exact same slot
  const replaceIdx = Math.max(0, ownedWeapons.indexOf(activeWeapon));
  const replacedId = ownedWeapons[replaceIdx];
  const replacedAmmo = replacedId === 'pistol' ? Infinity : Math.max(1, nextAmmo[replacedId] || WEAPONS[replacedId].maxAmmo);
  const nextOwned = [...ownedWeapons];
  nextOwned[replaceIdx] = groundWeapon;
  nextAmmo[groundWeapon] = incomingAmmo;

  return {
    ownedWeapons: nextOwned,
    activeWeapon: groundWeapon,
    ammo: nextAmmo,
    pickedUp: true,
    requiresSwap: false,
    newlyUnlocked: true,
    swappedOut: { weaponId: replacedId, ammo: replacedAmmo },
  };
}

export function ensureUsableWeapon(
  ownedWeapons: readonly WeaponId[],
  activeWeapon: WeaponId,
  ammo: Record<WeaponId, number>
): { ownedWeapons: WeaponId[]; activeWeapon: WeaponId; ammo: Record<WeaponId, number>; restoredPistol: boolean } {
  const nextAmmo = { ...ammo };
  const kept = ownedWeapons.filter((wId) => wId === 'pistol' || (nextAmmo[wId] ?? 0) > 0);

  if (kept.length === 0) {
    nextAmmo.pistol = Infinity;
    return {
      ownedWeapons: ['pistol'],
      activeWeapon: 'pistol',
      ammo: nextAmmo,
      restoredPistol: true,
    };
  }

  const nextActive = kept.includes(activeWeapon) ? activeWeapon : kept[0];
  return {
    ownedWeapons: kept,
    activeWeapon: nextActive,
    ammo: nextAmmo,
    restoredPistol: false,
  };
}

export function normalizeLeaderboardName(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12).trim();
  if (cleaned.length < 2) return null;
  return cleaned;
}

export function sortLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wave !== a.wave) return b.wave - a.wave;
    return b.maxCombo - a.maxCombo;
  });
}

export interface WeaponShakeProfile {
  trauma: number;
  cameraKick: number;
  hitstopSec: number;
}

export function computeWeaponScreenshake(
  weapon: Pick<WeaponDef, 'id' | 'damage' | 'pellets' | 'piercing' | 'splashRadius'>,
  phase: 'fire' | 'impact' = 'fire'
): WeaponShakeProfile {
  const totalDamage = Math.max(1, weapon.damage * Math.max(1, weapon.pellets));
  const damageFactor = Math.min(1.25, totalDamage / 120);

  if (phase === 'impact') {
    if (weapon.splashRadius > 0) {
      return {
        trauma: Math.min(1, 0.72 + damageFactor * 0.28),
        cameraKick: 0.42,
        hitstopSec: 0.055,
      };
    }
    if (weapon.piercing) {
      return {
        trauma: Math.min(0.65, 0.28 + damageFactor * 0.22),
        cameraKick: 0.24,
        hitstopSec: 0.035,
      };
    }
    return {
      trauma: Math.min(0.32, 0.06 + damageFactor * 0.14),
      cameraKick: 0.06,
      hitstopSec: 0,
    };
  }

  // Plasma fires ~10 shots/s: per-shot trauma must stay tiny or it stacks into a constant quake
  if (weapon.id === 'plasma') {
    return { trauma: 0.035, cameraKick: 0.015, hitstopSec: 0 };
  }
  // Maçarico and Canhão de Faces fire every 0.06s: just a faint rumble, not a quake
  if (weapon.id === 'macarico' || weapon.id === 'faces') {
    return { trauma: 0.018, cameraKick: 0.006, hitstopSec: 0 };
  }

  // Firing recoil & screenshake scaled directly by damage per trigger pull + ordnance power
  const ordnanceBonus = weapon.piercing ? 0.22 : weapon.splashRadius > 0 ? 0.14 : 0;
  const rapidDamping = weapon.id === 'pistols' ? 0.78 : 1.0;
  const rawTrauma = (0.14 + damageFactor * 0.62 + ordnanceBonus) * rapidDamping;
  const trauma = Math.max(0.14, Math.min(0.98, Math.round(rawTrauma * 1000) / 1000));

  const rawKick = totalDamage >= 90 ? 0.28 + damageFactor * 0.46 + ordnanceBonus * 0.65 : damageFactor * 0.35;
  const cameraKick = Math.round(Math.min(0.92, rawKick) * 1000) / 1000;

  const hitstopSec =
    weapon.piercing ? 0.06 : weapon.splashRadius > 0 ? 0.035 : totalDamage >= 85 ? 0.024 : 0;

  return { trauma, cameraKick, hitstopSec };
}
