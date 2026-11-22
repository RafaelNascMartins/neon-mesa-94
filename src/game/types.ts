export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover' | 'shop';

export type VmItemId =
  | 'fireAmmo'
  | 'iceAmmo'
  | 'homing'
  | 'ghostAmmo'
  | 'fatAmmo'
  | 'cookieAmmo'
  | 'pinball'
  | 'shades'
  | 'patch'
  | 'cell'
  | 'heatsink'
  | 'overclock'
  | 'ricochet'
  | 'bladeDash'
  | 'vampire'
  | 'volatile'
  | 'magnet'
  | 'firewall'
  | 'doubleTap'
  // Passives (Gungeon-inspired)
  | 'scarf'
  | 'clover'
  | 'pet'
  | 'charm'
  | 'gunboots'
  // Actives (F key, recharge by dealing damage)
  | 'bomb'
  | 'ironSkin'
  | 'pacify';

export type VmItemKind = 'passive' | 'active' | 'consumable';

export interface VmItemDef {
  id: VmItemId;
  name: string;
  desc: string;
  price: number;
  once: boolean; // run-long upgrade, can only be bought once
  kind?: VmItemKind; // default: passive (or consumable when !once)
  /** Actives: damage you must deal to recharge it. */
  charge?: number;
}

export interface VmShopItem extends VmItemDef {
  soldOut: boolean;
}

export interface BackpackState {
  weapons: { id: WeaponId; ammo: number; maxAmmo: number; active: boolean }[];
  passives: VmItemId[];
  activeItem: VmItemId | null;
  activeCharge: number;
  hp: number;
  maxHp: number;
  credits: number;
  /** Almanac: creatures met so far. */
  seen: string[];
}

export interface VmShopState {
  credits: number;
  items: VmShopItem[];
  /**
   * How VM opens the conversation: first meeting of the run ("wanna buy something?"), the
   * Cem Faces line (once, after you've taken him down), or just "hey" after that.
   */
  greeting: 'first' | 'firstBoss' | 'boss' | 'again';
}

export type ArenaZone = 'road' | 'desert' | 'cemetery' | 'clearing' | 'tree';

export type TreeSubBiome = 'megastructure' | 'hybrid' | 'wireframe';

export type TreeBranch = '0' | '1';

export type WeaponId =
  | 'pistol'
  | 'pistols'
  | 'shotgun'
  | 'plasma'
  | 'railgun'
  | 'rocket'
  | 'katana'
  | 'hammer'
  | 'nailgun'
  | 'harpoon'
  | 'forkbomb'
  | 'coice'
  | 'juiz'
  | 'faces'
  | 'rmrf'
  | 'dinamite'
  | 'macarico'
  | 'disco'
  | 'corrente';

/** Close-combat behaviour for melee weapons (ammo is used as durability: one swing = one point). */
export interface MeleeSpec {
  style: 'slash' | 'slam';
  range: number; // reach in front of the player
  arcDeg: number; // total width of the hit arc
  knockback: number; // instant shove distance
  stagger: number; // seconds the target is interrupted
  windup: number; // delay between click and the hit landing
  animDuration: number;
  shockRadius: number; // slam only: radial damage around the impact point
}

export type EnemyArchetype =
  | 'rustler'
  | 'ranger'
  | 'charger'
  | 'bombardier'
  | 'spider'
  | 'spore'
  | 'mantis'
  | 'juggernaut'
  | 'tesla'
  | 'boss';

export type SkinId = 'sunset' | 'cyan_marshal' | 'acid_rattler' | 'gold_desperado' | 'phantom_mesa';

export interface WeaponDef {
  id: WeaponId;
  keyBind: string;
  name: string;
  shortName: string;
  role: string;
  fireInterval: number; // seconds
  projectileSpeed: number;
  damage: number;
  pellets: number;
  piercing: boolean;
  spread: number; // radians
  splashRadius: number;
  maxAmmo: number; // Infinity for starter pistol
  heatPerShot: number; // 0..1 heat gained per trigger pull
  coolRate: number; // heat cooled per second when idle
  overheatDuration: number; // seconds of forced vent cooldown if heat reaches 1
  accentColor: string;
  projectileColor: number;
  melee?: MeleeSpec;
}

export interface SkinDef {
  id: SkinId;
  name: string;
  tagline: string;
  unlockText: string;
  ponchoColor: number;
  hatColor: number;
  trimColor: number;
  visorColor: number;
  swatchHex: [string, string, string];
}

export interface PlayerProgress {
  bestScore: number;
  bestWave: number;
  bestCombo: number;
  totalKills: number;
  equippedSkin: SkinId;
  /** Unlocked achievement ids (see achievements.ts). */
  achievements: string[];
  /** Almanac: creature ids met so far (see almanac.ts); 'blob' once the aero world was seen. */
  seenEnemies: string[];
}

export interface ObstacleDef {
  id: string;
  kind: 'cactus' | 'crate' | 'arch' | 'mesa' | 'tombstone' | 'datacache' | 'stump' | 'road_ruin' | 'wall';
  x: number;
  z: number;
  radius: number;
  halfW: number;
  halfD: number;
  destructible: boolean;
  explosive: boolean;
}

export interface BossHudInfo {
  name: string;
  hp: number;
  maxHp: number;
  enraged: boolean;
  bossLine: string | null;
}

export interface BarricadeHudInfo {
  name: string;
  hp: number;
  maxHp: number;
  planksLeft: number;
  totalPlanks: number;
}

export interface NearbyWeaponPrompt {
  kind: WeaponId | 'med';
  weaponId: WeaponId | null;
  ammo: number;
  requiresSwap: boolean;
  replacingWeaponId: WeaponId | null;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  bestScore: number;
  wave: number;
  zone: ArenaZone;
  sectorRound: number;
  sectorTotalRounds: number;
  treeSubBiome: TreeSubBiome;
  treeCyberRatio: number; // 0 = pure industrial, 0.5 = balanced, 1 = pure cyberpunk
  treeDepth: number;
  treePath: TreeBranch[];
  portalOpen: boolean;
  /** VM's door is open: it's the only way onward this floor. */
  vmGate: boolean;
  /** Active item in the F slot (null = none) and its charge 0..1. */
  activeItem: VmItemId | null;
  activeCharge: number;
  /** Passives installed this run (shown as a row of little icons). */
  passives: VmItemId[];
  stormActive: boolean;
  cutsceneText: string | null;
  enemiesRemaining: number;
  combo: number;
  comboTimerRatio: number; // 0..1
  activeWeapon: WeaponId;
  ownedWeapons: WeaponId[];
  ammo: Record<WeaponId, number>;
  weaponHeat: number; // 0..1
  weaponOverheated: boolean;
  reloadFlash: boolean;
  manualReloadRatio: number; // 0..1 remaining cooldown for manual weapons
  nearbyWeaponPickup: NearbyWeaponPrompt | null;
  dashReadyRatio: number; // 0..1
  cinematic: boolean; // a cutscene is running → HUD hidden
  credits: number; // VM shop currency
  poison: number; // 0..1 poison meter (mist clouds)
  vmPrompt: boolean; // standing at VM's open door
  kills: number;
  maxCombo: number;
  waveBanner: string | null;
  pickupBanner: string | null;
  newlyUnlockedSkin: SkinId | null;
  damageFlashActive: boolean;
  boss: BossHudInfo | null;
  barricade: BarricadeHudInfo | null;
}

export interface RunSummary {
  score: number;
  bestScore: number;
  wave: number;
  treeDepth: number;
  treePath: TreeBranch[];
  kills: number;
  maxCombo: number;
  weaponUsed: WeaponId;
  skinUsed: SkinId;
  unlockedSkins: SkinId[];
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  wave: number;
  maxCombo: number;
  weapon: WeaponId;
  skin: SkinId;
  createdAt: string;
}
