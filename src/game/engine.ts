import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARENA_RADIUS,
  BARRICADE_MAX_HP,
  BARRICADE_TOTAL_PLANKS,
  CEMETERY_GRAVE_POSITIONS,
  COMBO_WINDOW,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED,
  ENEMY_CONFIGS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SECTOR_OBSTACLES,
  SKIN_MAP,
  VM_DOOR_ANGLE,
  VM_DOOR_RADIUS,
  VM_EVERY_FLOORS,
  VM_ITEMS,
  WEAPONS,
  WEAPON_ORDER,
  RARE_ARENA_WEAPON,
  RARE_ARENA_WEAPON_CHANCE,
} from './config';
import {
  applyHeroSkin,
  cloneModelWithUniqueMaterials,
  createBinaryTreeFloorTexture,
  createCanyonBumpTexture,
  createCemeteryFloorTexture,
  createContactShadowTexture,
  createDesertFloorTexture,
  createGrimeOverlayTexture,
  createRoadFloorTexture,
  createStoneWalkwayTexture,
  createTrueDesertSandTexture,
  createWireframeCityFloorTexture,
  loadAllGlbAssets,
  type LoadedGlbAssets,
} from './assets';
import { BOSS2_LINE_1, BOSS2_LINE_2, DEATH_SCREAM_LEN, synthAudio } from './audio';
import { BossReturnFx } from './bossReturnFx';
import { TeleportFx } from './teleportFx';
import { BlastFx } from './blastFx';
import { applyBrokenExpressions } from './bossFaces';
import { CoinField, type CoinTier } from './coinDrops';
import { ACHIEVEMENT_MAP, type AchievementDef, type AchievementId } from './achievements';
import { savePlayerProgress } from './storage';
import { aeroGrassTexture, aeroSkyTexture, buildAeroPillar, buildAeroWorld, buildBlobEnemy, buildEmoteSprite, RewriteCutscene, wobbleBlob, type AeroWorld } from './aeroWorld';

interface RunStats {
  creditsCollected: number;
  bugsCaught: number;
}
const freshRunStats = (): RunStats => ({ creditsCollected: 0, bugsCaught: 0 });
import { itemVoxelGeometry } from './itemSprites';
import { buildHazardField, buildWall, hazardAt, makeRoomLayout, pushOutOfHazards, ROOM_LAYOUTS, type HazardDef, type HazardField } from './roomHazards';
import { animateFlyer, buildFlyerModel } from './enemyFlyer';
import { applyHeroOutfit, outfitAura } from './heroOutfits';
import { batchStaticLeaves, snapshotLeaves, type BatchSnapshot } from './staticBatch';
import { buildCacheProp, buildCrateProp, buildMesaProp, buildRuinProp } from './obstacleModels';
import {
  createCemeteryGroundFloor,
  createCraterFloor,
  createDesertSandFloor,
  createHighwayAsphalt,
  createIndustrialDeckFloor,
  createRoadEarthFloor,
  type FloorSet,
} from './floorTextures';
import { createDitherPostProcessor, type DitherPostProcessor } from './ditherShader';
import { buildZoneDetails, type ZoneDetails } from './zoneDetails';
import { CombatFx } from './combatFx';
import { RaveLights } from './raveLights';
import { EnemyIndicators, PoisonClouds } from './enemyFx';
import { VmDoor, VmSpace } from './vmRoom';

// VM's white space lives far from the arenas (fog and distance keep them apart)
const VM_SPACE_ORIGIN = new THREE.Vector3(0, 0, -900);

import { INTRO_PARKED_CAR, INTRO_PLAYER_START, IntroCutscene } from './introCutscene';

// Screen pixels per rendered pixel (chunkier = more lo-fi)
const PIXEL_SCALE = 4;

// Last-kill slow-motion tuning
const SLOWMO_SCALE = 0.2;
const SLOWMO_DURATION = 1.1;
import {
  acquireOrSwapWeapon,
  calculateComboKillScore,
  computeParabolicJumpHeight,
  computeWaveComposition,
  computeWeaponScreenshake,
  ensureUsableWeapon,
  evaluateSkinUnlocks,
  getBarricadePlanksRemaining,
  getSectorRoundInfo,
  getTreeSubBiomeFromRatio,
  getZoneForWave,
  isBossEnraged,
  isBossReturnWave,
  isBossWave,
  BOSS_RETURN_WAVE,
  MAX_ENEMIES_ON_FIELD,
  isManualWeapon,
  resolveCircleObstacleCollision,
  segmentCircleIntersect,
  selectArenaWeaponSpawn,
  stepCyberBlend,
  stepWeaponHeat,
  type WeaponHeatState,
} from './rules';
import type {
  ArenaZone,
  EnemyArchetype,
  GamePhase,
  HudSnapshot,
  NearbyWeaponPrompt,
  ObstacleDef,
  PlayerProgress,
  RunSummary,
  SkinId,
  TreeBranch,
  TreeSubBiome,
  BackpackState,
  VmItemId,
  VmShopState,
  WeaponId,
} from './types';

// Pre-allocated scratch math objects (zero-GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _dummyObj = new THREE.Object3D();
const _scratchColor = new THREE.Color();

interface EnemyEntity {
  id: number;
  archetype: EnemyArchetype;
  mesh: THREE.Group;
  shadow: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  state: 'move' | 'telegraph' | 'attack' | 'cooldown' | 'ko';
  stateTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  aimX: number;
  aimZ: number;
  strafeSign: number;
  walkPhase: number;
  hasToken: boolean;
  bossPhase?: number;
  telegraphLine?: THREE.Mesh;
  // Cem Faces rig & multi-phase combat state
  facesCarousel?: THREE.Object3D;
  prayerArms?: THREE.Object3D;
  dharmaHalo?: THREE.Object3D;
  spiderLegs?: THREE.Object3D[];
  leapRingMesh?: THREE.Mesh;
  leapActive?: boolean;
  leapStartX?: number;
  leapStartZ?: number;
  leapTargetX?: number;
  leapTargetZ?: number;
  leapTimer?: number;
  leapDuration?: number;
  leapChainLeft?: number;
  barrageVolleysLeft?: number;
  barrageTimer?: number;
  enraged?: boolean;
  bossLine?: string | null;
  bossLineTimer?: number;
  hoverY?: number;
  emergeTimer?: number;
  emergeDuration?: number;
  teleport?: boolean; // materialising through a red warp instead of rising from a grave
  pacified?: number; // seconds left wandering harmlessly (Charm rounds / Decree of Peace)
  hexer?: boolean; // black-and-red mage: curses one ally at a time
  hexed?: boolean; // cursed by a hexer: double damage, red-black attacks, aura + flames
  hexTargetId?: number;
  hexRetarget?: number; // delay before picking a new victim
  hexLink?: THREE.Mesh; // shock line from hexer to its victim
  flying?: boolean; // scavenger drone: hovers over pits and lava

  husk?: boolean; // boss shut down: stays in the scene, never updated or removed by KO logic
  hitReact?: number; // seconds of hit recoil left (jitter + flinch)
  hitDirX?: number;
  hitDirZ?: number;

  // Cem Faces, second coming: damaged rig + dodge-only moveset
  v2?: boolean;
  v2Attack?: Boss2Attack;
  v2Last?: Boss2Attack;
  v2Yaw?: number; // locked aim (flame / impale)
  v2Lanes?: number[]; // barrage lanes being fired
  v2Salvos?: number;
  v2Chain?: number; // extra impales queued
  v2Stun?: number; // stuck in the wall after an impale
  v2Traveled?: number;
  v2LastX?: number;
  v2LastZ?: number;
  v2Spark?: number;
  brokenFaces?: THREE.Mesh[];
  badLeg?: THREE.Object3D;

  // Telegraph / status visuals and per-archetype behaviour state
  alert?: THREE.Sprite; // "!" over a cowboy about to lunge
  hpBar?: { bg: THREE.Sprite; fill: THREE.Sprite }; // Óculos Escuros: tiny health bar overhead
  // Special ammo status
  burnT?: number;
  burnTick?: number;
  chillT?: number;
  chillStacks?: number;
  frozenT?: number;
  baseSpeed?: number;
  cookie?: boolean;
  buffIcon?: THREE.Sprite; // "+" over an empowered enemy
  buffed?: boolean;
  bombTimer?: number; // spider death fuse
  chantRing?: THREE.Mesh; // green mage's rune circle
  beam?: THREE.Mesh; // skull-ship empowering beam
  buffTargetId?: number;
  hideX?: number;
  hideZ?: number;
  hideTimer?: number;
  fxTimer?: number;
  parts?: { legs?: THREE.Object3D[]; pawLeg?: THREE.Object3D; tentacles?: THREE.Object3D[]; stacks?: THREE.Object3D[] };
}

type Boss2Attack = 'flame' | 'barrage' | 'leap' | 'impale';

interface ProjectileEntity {
  active: boolean;
  fromPlayer: boolean;
  /** Can't be cut by the katana (Cem Faces' second-coming attacks are dodge-only). */
  noParry: boolean;
  /** fork(): process generation (0 → 3); -1 for everything else. */
  forkGen: number;
  weapon: WeaponId | 'enemy_bolt';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  splashRadius: number;
  piercing: boolean;
  piercedIds: Set<number>;
  bounces: number;
  /** Pinball rounds: hops left to the next enemy. */
  pinballs: number;
  life: number;
  colorHex: number;
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
}

interface MortarHazard {
  x: number;
  z: number;
  timer: number;
  duration: number;
  radius: number;
  ringMesh: THREE.Mesh;
  shellMesh: THREE.Mesh;
  style: 'plasma' | 'artillery' | 'poison';
  whistled?: boolean;
}

interface PickupEntity {
  id: number;
  kind: WeaponId | 'med' | 'ammo';
  ammo: number;
  x: number;
  z: number;
  life: number;
  mesh: THREE.Group;
}

interface ActiveObstacle extends ObstacleDef {
  hp: number;
  group: THREE.Group;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  colorHex: number;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onGameOver: (summary: RunSummary) => void;
  onAssetsReady: () => void;
  onPhaseChange: (phase: GamePhase) => void;
  /** An achievement just unlocked (show the toast). */
  onAchievement?: (def: AchievementDef) => void;
}

export class NeonMesaEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private ditherPass: DitherPostProcessor;
  private isSoftwareGl: boolean;
  private assets: LoadedGlbAssets | null = null;

  private frameId = 0;
  private lastTimeMs = 0;
  private elapsedSec = 0;
  private disposed = false;

  // Game State
  private phase: GamePhase = 'title';
  private progress: PlayerProgress;
  private equippedSkin: SkinId;

  // Player state
  private heroRoot = new THREE.Group();
  private heroModel: THREE.Group | null = null;
  private weaponAnchor = new THREE.Group();
  private playerMarker: THREE.Group | null = null;
  private weaponModels: Partial<Record<WeaponId, THREE.Group>> = {};
  private heroShadow: THREE.Mesh;
  private aimReticleMesh: THREE.Mesh;

  private playerX = 0;
  private playerZ = 0;
  private playerYaw = Math.PI;
  private playerHp = PLAYER_MAX_HP;
  private invulnTimer = 0;
  private damageBlinkTimer = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private dashDirX = 0;
  private dashDirZ = -1;
  private walkPhase = 0;
  private recoilOffset = 0;
  private weaponKickTimer = 0;
  private weaponKickDuration = 0.25;
  private barrelToggle = 1;
  private overheadReloadGroup = new THREE.Group();
  private reloadArcSegments: THREE.Mesh[] = [];
  private railTrails: { core: THREE.Mesh; glow: THREE.Mesh; life: number; maxLife: number }[] = [];
  // New arsenal state
  private coiceShells = 2; // Escopeta Coice: two barrels, then a slow break-open reload
  private juizHold = -1; // seconds the trigger has been held (−1 = not held)
  private juizLoaded = 0; // chambers loaded so far while holding (shown in the drum over your head)
  private juizBurst = 0; // shots still to fire in the release burst
  private juizBurstTimer = 0;
  private juizDrum: { sprite: THREE.Sprite; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; shown: number } | null = null;
  private facesSpin = 0; // Canhão de Faces spiral phase
  private rmrfBeams: { mesh: THREE.Group; life: number; maxLife: number }[] = [];

  // Weapons & Combat
  private activeWeapon: WeaponId = 'pistol';
  private ownedWeapons: WeaponId[] = ['pistol'];
  private ammo: Record<WeaponId, number> = {
    pistol: Infinity,
    pistols: 0,
    shotgun: 0,
    plasma: 0,
    railgun: 0,
    rocket: 0,
    katana: 0,
    hammer: 0,
    nailgun: 0,
    harpoon: 0,
    forkbomb: 0,
    coice: 0,
    juiz: 0,
    faces: 0,
    rmrf: 0,
    dinamite: 0,
    macarico: 0,
    disco: 0,
    corrente: 0,
  };
  private fireCooldown = 0;
  private weaponHeatState: WeaponHeatState = {
    heat: 0,
    overheated: false,
    overheatTimer: 0,
    reloadFlashTimer: 0,
  };
  private score = 0;
  private kills = 0;
  private combo = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private wave = 1;
  private zone: ArenaZone = 'road';
  private treeSubBiome: TreeSubBiome = 'hybrid';
  private treeCyberRatio = 0.5; // 0 = pure industrial, 0.5 = hybrid first room, 1 = pure cyberpunk
  private treeDepth = 0;
  private treePath: TreeBranch[] = [];
  private portalOpen = false;
  private portalCooldown = 0;
  private nearbyWeaponPrompt: NearbyWeaponPrompt | null = null;
  private waveQueue: EnemyArchetype[] = [];
  private waveSpawnTimer = 0;
  private waveSpeedMult = 1;
  private waveHpMult = 1;
  private waveMaxConcurrent = 12;
  private waveTokenCap = 4;
  private arenaWeaponSpawnTimer = 0;
  private waveBanner: string | null = null;
  private waveBannerTimer = 0;
  private pickupBanner: string | null = null;
  private pickupBannerTimer = 0;
  private runUnlockedSkins = new Set<SkinId>();
  private newlyUnlockedSkin: SkinId | null = null;
  private unlockBannerTimer = 0;

  // Stage-specific interactive mechanics (Cutscenes, Desert Gate, Rain Storm, Wooden Barricade)
  private cutsceneMode:
    | 'none'
    | 'gate_close'
    | 'gate_open'
    | 'barricade_intro'
    | 'intro'
    | 'boss_intro'
    | 'boss_death'
    | 'boss2_intro'
    | 'boss2_death'
    | 'rewrite'
    | 'aero_intro' =
    'none';
  private cutsceneTimer = 0;
  private cutsceneDuration = 0;
  private cutsceneText: string | null = null;
  private cutsceneClangPlayed = false;
  private desertGateClosed = false;
  private desertGateBars = new THREE.Group();
  private stormActive = false;
  private lightningTimer = 3.0;
  private lightningFlash = 0;
  private readonly RAIN_COUNT = 180;
  private rainInstanced!: THREE.InstancedMesh;
  private rainDrops: { x: number; y: number; z: number; speed: number }[] = [];
  private barricadeHp = BARRICADE_MAX_HP;
  private barricadeFlashTimer = 0;
  private treeBarricadeGroup = new THREE.Group();
  private barricadePlanks: THREE.Mesh[] = [];
  private treeCyberOverlayMesh!: THREE.Mesh;
  private treePerimeterPairs: { mega: THREE.Group; wire: THREE.Group }[] = [];

  // Juice & Zone Scenery
  private hitstopTimer = 0;
  private trauma = 0;
  private damageFlash = 0;
  private hudSyncTimer = 0;
  private currentRimColorHex = 0xff5a22;
  private groundMat!: THREE.MeshStandardMaterial;
  private floors!: Record<'road' | 'desert' | 'cemetery' | 'clearing' | 'tree', FloorSet>;
  private canyonBumpTex!: THREE.CanvasTexture;
  /** Fixed light pools per sector (sodium lamps, lanterns, furnace glow) — same 4 lights reused. */
  private zoneLamps: THREE.PointLight[] = [];
  private perimeterMat!: THREE.MeshBasicMaterial;
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private roadFloorTex!: THREE.CanvasTexture;
  private desertSandFloorTex!: THREE.CanvasTexture;
  private cemeteryFloorTex!: THREE.CanvasTexture;
  private stoneWalkwayTex!: THREE.CanvasTexture;
  private clearingFloorTex!: THREE.CanvasTexture;
  private treeFloorTex!: THREE.CanvasTexture;
  private wireframeFloorTex!: THREE.CanvasTexture;
  private roadDecorGroup = new THREE.Group();
  private desertDecorGroup = new THREE.Group();
  private cemeteryDecorGroup = new THREE.Group();
  private clearingDecorGroup = new THREE.Group();
  private treeDecorGroup = new THREE.Group();
  private treeMegaDecorGroup = new THREE.Group();
  private treeWireframeDecorGroup = new THREE.Group();
  private giantTreeAnchor = new THREE.Group();
  /** Static batching of the visible decor (see staticBatch.ts): snapshot, then merge what stayed still. */
  private batchPass: { t: number; snaps: { root: THREE.Object3D; snap: BatchSnapshot }[] | null } | null = null;
  private eastRoadPortalRing!: THREE.Mesh;
  private northPortalRing!: THREE.Mesh;
  private treeLeftPortalRing!: THREE.Mesh;
  private treeRightPortalRing!: THREE.Mesh;
  private zoneDetails: ZoneDetails | null = null;
  private fx!: CombatFx;
  private rave!: RaveLights;
  private indicators = new EnemyIndicators();
  private poisonClouds!: PoisonClouds;
  private poison = 0; // 0..1 Gungeon-style poison meter (fills inside mist, damages when full)
  private keyBaseIntensity = 2.65;
  private hemiBaseIntensity = 1.12;

  // Melee weapon swing state (katana / sledgehammer)
  private meleeTimer = 0;
  private meleeAnimDuration = 0.2;
  private meleeStyle: 'slash' | 'slam' = 'slash';
  private pendingMelee: { weapon: WeaponId; timer: number } | null = null;

  // Intro cutscene (first run of the session) + the Mustang it leaves parked on the road
  private intro: IntroCutscene | null = null;
  private introSeen = false;
  private parkedCar: THREE.Group | null = null;
  private cineFadeEl!: HTMLDivElement;
  private cineBarTop!: HTMLDivElement;
  private cineBarBottom!: HTMLDivElement;
  private cineSubtitle!: HTMLDivElement;

  // Cem Faces cutscenes (intro turn + shutdown) and VM, the merchant behind the shutter
  private bossCine: {
    e: EnemyEntity;
    t: number;
    fromYaw: number;
    toYaw: number;
    lineSaid: boolean;
    camFrom: THREE.Vector3;
    flashTimer: number;
    nextSpark: number;
    collapseSound: boolean;
    shutdown: boolean;
    shutterSound: boolean;
    shutterBang: boolean;
  } | null = null;
  private vmDoor: VmDoor | null = null; // shutter in the arena wall
  private vmSpace: VmSpace | null = null; // the white void where VM sits (built once)
  private inVmSpace = false;
  private vmOffer: VmItemId[] = [];
  /** VM small talk this run: conversations opened, and whether he's praised the boss kill. */
  private vmTalks = 0;
  private vmPraised = false;
  private boss1Down = false;
  private vmGreeting: VmShopState['greeting'] = 'first';
  private floorsSinceVm = 0;
  private bossHusk: EnemyEntity | null = null;
  private vmPrompt = false;
  private whiteFlash = 0; // fade-from-white when crossing into VM's space
  private fireFlash = 0; // red-orange flash of his final detonation

  // New arsenal: fork() timing, which weapon dealt the current hit, the harpoon line
  private static readonly FORK_STEP = 0.32;
  private static readonly FORK_MAX_GEN = 3; // 1 → 2 → 4 → 8 processes
  private hitSource: WeaponId | 'enemy_bolt' | null = null;
  private harpoonProj: ProjectileEntity | null = null;
  private harpoonPull: { e: EnemyEntity; t: number; sx: number; sz: number } | null = null;
  private harpoonRope!: THREE.Mesh;

  // Cem Faces, second coming: the lull, the drop through the ceiling, the fight, the end
  private returnFx!: BossReturnFx;
  private teleportFx!: TeleportFx;
  private blastFx!: BlastFx;
  private coins!: CoinField;
  private coinHudDirty = false;
  /** After Cem Faces' second death the world is rewritten: the Frutiger Aero zone. */
  private aero = false;
  private aeroWorld: AeroWorld | null = null;
  private rewriteCine: RewriteCutscene | null = null;
  private rewriteBranch: TreeBranch | null = null;
  private aeroIntro: { t: number; emote: THREE.Sprite | null; bang: boolean; spawned: boolean } | null = null;
  private runStats: RunStats = freshRunStats();
  private boss2Stage: 'none' | 'lull' | 'fight' | 'dead' = 'none';
  private boss2Timer = 0;
  private boss2NextBang = 0;
  private boss2Cine: {
    e: EnemyEntity;
    t: number;
    camFrom: THREE.Vector3;
    landed: boolean;
    line1: boolean;
    line2: boolean;
    walkFromX: number;
    walkFromZ: number;
    walkYaw: number;
    screams: number;
    exploded: boolean;
    nextSpark: number;
    shutterSound: boolean;
    shutterBang: boolean;
  } | null = null;
  private staticTex: THREE.CanvasTexture | null = null;

  // VM item effects
  private vampireKills = 0;
  private firewallReady = false;
  // Gungeon-style items
  private activeItem: VmItemId | null = null;
  private activeCharge = 0;
  private activeMax = 1;
  private ironSkinTimer = 0;
  private bombs: { mesh: THREE.Group; sx: number; sz: number; tx: number; tz: number; t: number; radius?: number; damage?: number; fuse?: number }[] = [];
  private bolts: { group: THREE.Group; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private decreeFx: { mesh: THREE.Mesh; t: number } | null = null;
  private pet: {
    mesh: THREE.Group;
    x: number;
    z: number;
    yaw: number;
    cd: number;
    hop: number;
    mode: 'follow' | 'hunt' | 'fetch';
    targetId: number;
    barkTimer: number;
  } | null = null;
  private currentShooter: EnemyEntity | null = null;
  private hexerPending = false;
  // Special room layouts (waves 11–14): walls, pits, lava
  private hazardField: HazardField | null = null;
  private hazardDefs: HazardDef[] = [];
  private roomWallGroups: THREE.Group[] = [];
  private flyersPending = 0;
  private safeX = 0;
  private safeZ = 0;
  private lavaTick = 0;
  private fallTimer = 0;
  // Dash afterimages: translucent copies of the hero left behind along the dash
  private ghosts: { group: THREE.Group; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private ghostCursor = 0;
  private ghostEmit = 0;
  private chest: { group: THREE.Group; x: number; z: number; key: string; opened: boolean; t: number; item: VmItemId; itemMesh: THREE.Mesh | null; granted: boolean } | null = null;
  private firewallTimer = 0;
  private dashHits = new Set<number>();
  private pendingBlasts: { x: number; z: number }[] = [];

  // Run economy & VM upgrades
  private credits = 0;
  private playerMaxHp = PLAYER_MAX_HP;
  private upgrades = new Set<VmItemId>();

  // Last-kill slow-motion (real-time driven; scales the simulation step)
  private timeScale = 1;
  private slowmoTimer = 0;
  private slowmoDuration = SLOWMO_DURATION;
  private slowmoZoom = 0;
  private slowmoFocusX = 0;
  private slowmoFocusZ = 0;
  private realDt = 1 / 60;

  // Entities & Pools
  private obstacles: ActiveObstacle[] = [];
  private enemies: EnemyEntity[] = [];
  private nextEntityId = 1;
  private projectiles: ProjectileEntity[] = [];
  private mortars: MortarHazard[] = [];
  private pickups: PickupEntity[] = [];

  // Particle Ring Buffer (InstancedMesh)
  private readonly MAX_PARTICLES = 260;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private particleInstanced: THREE.InstancedMesh;

  // Shared Geometries & Materials
  private shadowTex: THREE.CanvasTexture;
  private projectileGeo = new THREE.BoxGeometry(0.2, 0.2, 0.68);
  private enemyCoreGeo = new THREE.OctahedronGeometry(0.32, 0);
  private enemyHaloGeo = new THREE.TorusGeometry(0.54, 0.1, 6, 12);
  private plasmaBoltGeo = new THREE.OctahedronGeometry(0.24, 0);
  private discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20);
  private rocketGeo = new THREE.ConeGeometry(0.2, 0.75, 6);
  private pickupGeo = new THREE.OctahedronGeometry(0.42, 0);
  private ringGeo = new THREE.RingGeometry(0.75, 1.0, 20);
  private muzzleLight: THREE.PointLight;

  // Input state
  private keys = new Set<string>();
  private mouseClientX = 0;
  private mouseClientY = 0;
  private hasMouseMoved = false;
  private mouseDown = false;
  private mouseJustPressed = false;
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private touchAimX = 0;
  private touchAimZ = 0;
  private touchFiring = false;
  private camPosX = 0;
  private camPosY = 9.8;
  private camPosZ = 21.5;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialProgress: PlayerProgress,
    callbacks: EngineCallbacks
  ) {
    this.container = container;
    this.progress = { ...initialProgress };
    this.equippedSkin = initialProgress.equippedSkin || 'sunset';
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(200, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    // White crosshair cursor with a black outline (readable on dark arenas and the white room)
    const cursorSvg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' shape-rendering='crispEdges'>" +
      "<g stroke='black' stroke-width='5'><path d='M16 3v8M16 21v8M3 16h8M21 16h8'/><rect x='14.5' y='14.5' width='3' height='3'/></g>" +
      "<g stroke='white' stroke-width='2'><path d='M16 3v8M16 21v8M3 16h8M21 16h8'/></g>" +
      "<rect x='15' y='15' width='2' height='2' fill='white'/></svg>";
    this.renderer.domElement.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 16 16, crosshair`;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x480d14);
    this.scene.fog = new THREE.FogExp2(0x480d14, 0.0138);

    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 160);
    this.camera.position.set(0, 9.8, 21.5);

    this.ditherPass = createDitherPostProcessor(width, height, PIXEL_SCALE);

    // Procedural Studio PMREM Environment so metallic weapon & cowboy trims glint
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.shadowTex = createContactShadowTexture();
    this.heroShadow = this.createContactShadow(1.45);
    this.scene.add(this.heroShadow);

    // Ground aim reticle: white crosshair (ring + 4 ticks + centre dot) over a black outline
    const crosshairGeo = (grow: number) => {
      const parts: THREE.BufferGeometry[] = [new THREE.RingGeometry(0.5 - grow, 0.6 + grow, 24)];
      for (const [x, y, w, h] of [
        [0, 0.95, 0.09, 0.42],
        [0, -0.95, 0.09, 0.42],
        [0.95, 0, 0.42, 0.09],
        [-0.95, 0, 0.42, 0.09],
        [0, 0, 0.11, 0.11],
      ]) {
        parts.push(new THREE.PlaneGeometry(w + grow * 2, h + grow * 2).translate(x, y, 0));
      }
      const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
      g.rotateX(-Math.PI / 2);
      return g;
    };
    this.aimReticleMesh = new THREE.Mesh(
      crosshairGeo(0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false })
    );
    const reticleOutline = new THREE.Mesh(
      crosshairGeo(0.05),
      new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false })
    );
    reticleOutline.position.y = -0.005;
    this.aimReticleMesh.add(reticleOutline);
    this.aimReticleMesh.renderOrder = 6;
    reticleOutline.renderOrder = 5;
    this.aimReticleMesh.position.y = 0.06;
    this.aimReticleMesh.visible = false;
    this.scene.add(this.aimReticleMesh);

    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 9);
    this.muzzleLight.position.set(0, 1.4, 0);
    this.scene.add(this.muzzleLight);

    // Particle InstancedMesh pool
    const partGeo = new THREE.BoxGeometry(1, 1, 1);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInstanced = new THREE.InstancedMesh(partGeo, partMat, this.MAX_PARTICLES);
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInstanced.frustumCulled = false;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.1,
        colorHex: 0xffffff,
      });
      _dummyObj.position.set(0, -50, 0);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummyObj.matrix);
      this.particleInstanced.setColorAt(i, _scratchColor.setHex(0xffffff));
    }
    this.scene.add(this.particleInstanced);

    // Blood, casings, muzzle flash & melee smear
    this.fx = new CombatFx(this.scene, this.isSoftwareGl);
    this.fx.onCasingLand = () => synthAudio.playCasingTink();
    this.rave = new RaveLights(this.scene);
    this.poisonClouds = new PoisonClouds(this.scene);
    this.returnFx = new BossReturnFx(this.scene);
    this.teleportFx = new TeleportFx(this.scene);
    this.blastFx = new BlastFx(this.scene);
    this.coins = new CoinField(this.scene);
    // A real (thin) rope mesh: 1-px lines vanish under the pixelation
    this.harpoonRope = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 1).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c090, toneMapped: false })
    );
    this.harpoonRope.frustumCulled = false;
    this.harpoonRope.visible = false;
    this.scene.add(this.harpoonRope);

    // Cinematic overlay (letterbox bars + fade to black) for the intro cutscene
    const overlay = (css: string) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;pointer-events:none;background:#000;${css}`;
      container.appendChild(el);
      return el;
    };
    this.cineBarTop = overlay('left:0;right:0;top:0;height:0;z-index:24;');
    this.cineBarBottom = overlay(
      'left:0;right:0;bottom:0;height:0;z-index:24;display:flex;align-items:center;justify-content:flex-end;' +
        'padding:0 20px;box-sizing:border-box;overflow:hidden;color:#8f897d;' +
        'font:700 10px "JetBrains Mono",monospace;letter-spacing:0.18em;'
    );
    this.cineBarBottom.textContent = 'SPACE / CLIQUE PARA PULAR';
    this.cineFadeEl = overlay('inset:0;opacity:0;z-index:25;');
    // Cutscene subtitles (white mono on black, sitting just above the bottom letterbox bar)
    this.cineSubtitle = document.createElement('div');
    this.cineSubtitle.style.cssText =
      'position:absolute;left:50%;bottom:13vh;transform:translateX(-50%);max-width:86vw;pointer-events:none;z-index:26;' +
      'padding:6px 14px;background:rgba(0,0,0,0.82);color:#f2efe6;text-align:center;display:none;' +
      'font:800 clamp(12px,2.1vw,20px) "JetBrains Mono",monospace;letter-spacing:0.14em;text-transform:uppercase;';
    container.appendChild(this.cineSubtitle);

    // Pre-allocate composite projectile pool (core + glowing halo ring for high-contrast enemy fire)
    for (let i = 0; i < 96; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffc83b });
      const coreMesh = new THREE.Mesh(this.projectileGeo, coreMat);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff2a85,
        transparent: true,
        opacity: 0.92,
      });
      const haloMesh = new THREE.Mesh(this.enemyHaloGeo, haloMat);
      haloMesh.visible = false;
      group.add(coreMesh, haloMesh);
      this.scene.add(group);
      this.projectiles.push({
        active: false,
        fromPlayer: true,
        noParry: false,
        forkGen: -1,
        weapon: 'pistol',
        x: 0,
        y: 1.1,
        z: 0,
        vx: 0,
        vz: 0,
        damage: 20,
        splashRadius: 0,
        piercing: false,
        piercedIds: new Set<number>(),
        bounces: 0,
        pinballs: 0,
        life: 0,
        colorHex: 0xffc83b,
        group,
        coreMesh,
        haloMesh,
      });
    }

    this.setupLightingAndEnvironment();
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.initAssetsAndStartLoop();
  }

  private createContactShadow(scale: number): THREE.Mesh {
    const geo = new THREE.CircleGeometry(0.65 * scale, 16);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.02;
    return m;
  }

  private setupLightingAndEnvironment() {
    // Scorched sunset key light + fiery crimson hemisphere fill
    this.keyLight = new THREE.DirectionalLight(0xff844a, 2.45);
    this.keyLight.position.set(18, 28, 16);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -34;
    this.keyLight.shadow.camera.right = 34;
    this.keyLight.shadow.camera.top = 34;
    this.keyLight.shadow.camera.bottom = -34;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 85;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0xd9483b, 0x26060b, 1.05);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0xff3b1f, 0.92);
    this.rimLight.position.set(-20, 12, -22);
    this.scene.add(this.rimLight);

    // Ground plane extending seamlessly into fog horizon
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.roadFloorTex = createRoadFloorTexture(maxAniso);
    this.desertSandFloorTex = createTrueDesertSandTexture(maxAniso);
    this.cemeteryFloorTex = createCemeteryFloorTexture(maxAniso);
    this.stoneWalkwayTex = createStoneWalkwayTexture(maxAniso);
    this.clearingFloorTex = createDesertFloorTexture(maxAniso);
    this.treeFloorTex = createBinaryTreeFloorTexture(maxAniso);
    this.wireframeFloorTex = createWireframeCityFloorTexture(maxAniso);
    const bumpTex = createCanyonBumpTexture();
    this.canyonBumpTex = bumpTex;
    // High-detail floors (colour + relief + glow) for the sectors that read too dark/flat
    this.floors = {
      road: createRoadEarthFloor(maxAniso),
      desert: createDesertSandFloor(maxAniso),
      cemetery: createCemeteryGroundFloor(maxAniso),
      clearing: createCraterFloor(maxAniso),
      tree: createIndustrialDeckFloor(maxAniso),
    };

    const groundGeo = new THREE.CircleGeometry(95, 48);
    groundGeo.rotateX(-Math.PI / 2);
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0xd0b8b8,
      map: this.roadFloorTex,
      bumpMap: bumpTex,
      bumpScale: 0.14,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (let i = 0; i < 4; i++) {
      const lamp = new THREE.PointLight(0xffffff, 0, 16, 1.6);
      lamp.castShadow = false;
      this.scene.add(lamp);
      this.zoneLamps.push(lamp);
    }

    // Grime layer over every floor (incl. the asphalt): soot, oil, drips, scratches
    const grimeGeo = new THREE.CircleGeometry(95, 48);
    grimeGeo.rotateX(-Math.PI / 2);
    const grime = new THREE.Mesh(
      grimeGeo,
      new THREE.MeshBasicMaterial({
        map: createGrimeOverlayTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    grime.position.y = 0.026;
    grime.name = 'floor_grime';
    grime.renderOrder = 1;
    this.scene.add(grime);

    // Cyberpunk wireframe floor overlay for gradual 0..1 blending inside Binary Tree
    const overlayGeo = new THREE.CircleGeometry(94, 48);
    overlayGeo.rotateX(-Math.PI / 2);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: this.wireframeFloorTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.treeCyberOverlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    this.treeCyberOverlayMesh.position.y = 0.014;
    this.treeCyberOverlayMesh.visible = false;
    this.scene.add(this.treeCyberOverlayMesh);

    // Arena perimeter boundary ring (changes per zone)
    const perimeterGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.22, ARENA_RADIUS + 0.22, 64);
    perimeterGeo.rotateX(-Math.PI / 2);
    this.perimeterMat = new THREE.MeshBasicMaterial({
      color: 0xff4422,
      side: THREE.DoubleSide,
    });
    const perimeter = new THREE.Mesh(perimeterGeo, this.perimeterMat);
    perimeter.position.y = 0.03;
    this.scene.add(perimeter);

    // Shared scorched canyon ruins helper for exterior perimeter
    const addOuterRuins = (target: THREE.Group, palette: number[]) => {
      const ruinGeo = new THREE.CylinderGeometry(1.75, 2.85, 11.5, 6);
      const ruinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.12 });
      const ruinCount = 26;
      const ruinInst = new THREE.InstancedMesh(ruinGeo, ruinMat, ruinCount);
      for (let i = 0; i < ruinCount; i++) {
        const angle = (i / ruinCount) * Math.PI * 2;
        if (Math.sin(angle) < -0.62 && Math.abs(Math.cos(angle)) < 0.62) {
          _dummyObj.position.set(0, -40, 0);
          _dummyObj.scale.setScalar(0.01);
          _dummyObj.updateMatrix();
          ruinInst.setMatrixAt(i, _dummyObj.matrix);
          continue;
        }
        const dist = ARENA_RADIUS + 5.2 + (i % 3) * 3.5;
        const scaleH = 0.68 + ((i * 37) % 11) * 0.14;
        _dummyObj.position.set(Math.cos(angle) * dist, (11.5 * scaleH) * 0.38, Math.sin(angle) * dist);
        _dummyObj.rotation.set((((i * 19) % 7) - 3) * 0.06, angle * 0.7, (((i * 29) % 7) - 3) * 0.06);
        _dummyObj.scale.set(1.0 + (i % 2) * 0.28, scaleH, 1.0 + ((i + 1) % 2) * 0.25);
        _dummyObj.updateMatrix();
        ruinInst.setMatrixAt(i, _dummyObj.matrix);
        _scratchColor.setHex(palette[i % palette.length]);
        ruinInst.setColorAt(i, _scratchColor);
      }
      ruinInst.computeBoundingSphere();
      target.add(ruinInst);
    };

    // STAGE 1: HORIZONTAL ESTRADA (West-to-East asphalt highway, flanking wires & desert scrub)
    addOuterRuins(this.roadDecorGroup, [0x6e1f1c, 0x4b1213, 0x2a0a0b, 0x8a281d]);
    const asphalt = createHighwayAsphalt(maxAniso);
    const highwayGeo = new THREE.PlaneGeometry(14.5, 118);
    highwayGeo.rotateX(-Math.PI / 2);
    const highwayMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphalt.map,
      bumpMap: asphalt.bump,
      bumpScale: asphalt.bumpScale,
      roughness: 0.92,
      metalness: 0.08,
    });
    const highwayStrip = new THREE.Mesh(highwayGeo, highwayMat);
    highwayStrip.rotation.y = Math.PI / 2; // Runs horizontally West <-> East!
    highwayStrip.position.set(0, 0.02, 0);
    highwayStrip.receiveShadow = true;
    this.roadDecorGroup.add(highwayStrip);

    const cableMat = new THREE.MeshBasicMaterial({ color: 0x160a0d });
    for (const sz of [-10.2, 10.2]) {
      for (const px of [-18, -6, 6]) {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 12.2, 5), cableMat);
        wire.rotation.z = Math.PI / 2;
        wire.position.set(px + 6, 6.75, sz - 0.15);
        this.roadDecorGroup.add(wire);
      }
    }
    const bushGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x5c6826, roughness: 0.92 });
    const bushInst = new THREE.InstancedMesh(bushGeo, bushMat, 24);
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bz = side * (10.8 + (i % 4) * 3.1);
      const bx = -24 + Math.floor(i / 2) * 4.4;
      _dummyObj.position.set(bx, 0.24, bz);
      _dummyObj.rotation.set(0, i * 1.1, 0);
      _dummyObj.scale.set(1.2, 0.55, 1.2);
      _dummyObj.updateMatrix();
      bushInst.setMatrixAt(i, _dummyObj.matrix);
    }
    bushInst.computeBoundingSphere();
    this.roadDecorGroup.add(bushInst);
    this.scene.add(this.roadDecorGroup);

    // STAGE 2: DESERTO (Broken highway entry on West + open dunes + Giant Iron Cemetery Gate at North)
    addOuterRuins(this.desertDecorGroup, [0xa66f3e, 0x824f27, 0x5c3416, 0xc08850]);
    const brokenRoadGeo = new THREE.PlaneGeometry(14.0, 15.5);
    brokenRoadGeo.rotateX(-Math.PI / 2);
    const brokenRoadMesh = new THREE.Mesh(brokenRoadGeo, highwayMat);
    brokenRoadMesh.rotation.y = Math.PI / 2;
    brokenRoadMesh.position.set(-22.5, 0.022, 0);
    brokenRoadMesh.receiveShadow = true;
    this.desertDecorGroup.add(brokenRoadMesh);

    const tarmacRubbleMat = new THREE.MeshStandardMaterial({ color: 0x22181c, roughness: 0.95 });
    for (const [rx, rz, rw, rd, rot] of [
      [-14.2, -4.2, 3.2, 2.4, 0.22],
      [-13.0, 1.4, 2.6, 2.8, -0.35],
      [-15.6, 5.2, 3.6, 1.9, 0.14],
      [-11.2, -1.8, 1.8, 1.5, 0.62],
    ]) {
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.22, rd), tarmacRubbleMat);
      chunk.position.set(rx, 0.1, rz);
      chunk.rotation.set(rot * 0.15, rot, -rot * 0.12);
      this.desertDecorGroup.add(chunk);
    }

    // Giant Iron Barred Gate leading North to Cemetery
    const desertGateGroup = new THREE.Group();
    desertGateGroup.position.set(0, 0, -24.5);
    const gateStoneMat = new THREE.MeshStandardMaterial({ color: 0x422d22, roughness: 0.85, metalness: 0.2 });
    const gateIronMat = new THREE.MeshStandardMaterial({ color: 0x1e222b, metalness: 0.85, roughness: 0.35 });
    const gateBeaconMat = new THREE.MeshStandardMaterial({ color: 0x22e3d4, emissive: 0x22e3d4, emissiveIntensity: 1.5 });
    for (const px of [-4.9, 4.9]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7.6, 1.5), gateStoneMat);
      pier.position.set(px, 3.8, 0);
      pier.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 1.9), gateIronMat);
      cap.position.set(px, 7.8, 0);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), gateBeaconMat);
      orb.position.set(px, 8.6, 0);
      desertGateGroup.add(pier, cap, orb);
    }
    const archHeader = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.9, 1.1), gateIronMat);
    archHeader.position.set(0, 7.2, 0);
    desertGateGroup.add(archHeader);

    // Movable vertical iron bars inside Giant Gate
    for (let b = -4; b <= 4; b++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.8, 6), gateIronMat);
      bar.position.set(b * 0.92, 3.4, 0);
      this.desertGateBars.add(bar);
    }
    for (const cy of [1.4, 3.6, 5.8]) {
      const crossBar = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.24, 0.28), gateIronMat);
      crossBar.position.set(0, cy, 0);
      this.desertGateBars.add(crossBar);
    }
    desertGateGroup.add(this.desertGateBars);
    this.desertDecorGroup.add(desertGateGroup);

    // Fortified wasteland junkyard barricade flanking both sides of the Desert Cemetery Gate
    const rustBodyMat = new THREE.MeshStandardMaterial({ color: 0x7a341e, roughness: 0.88, metalness: 0.35 });
    const rustedSteelMat = new THREE.MeshStandardMaterial({ color: 0x4b3832, roughness: 0.78, metalness: 0.55 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x16141a, roughness: 0.95 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e3a4c, roughness: 0.25, metalness: 0.6 });
    const scrapContainerMat = new THREE.MeshStandardMaterial({ color: 0x3b4d59, roughness: 0.72, metalness: 0.45 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x5c534c, roughness: 0.94 });

    const buildWreckedCar = (cx: number, cz: number, ry: number, tiltZ: number, bodyHex: number) => {
      const car = new THREE.Group();
      car.position.set(cx, 0, cz);
      car.rotation.set(0.06, ry, tiltZ);
      const paint = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.82, metalness: 0.38 });
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.78, 2.05), paint);
      chassis.position.y = 0.65;
      chassis.castShadow = true;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.68, 1.85), paint);
      cab.position.set(-0.2, 1.32, 0);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 1.65), glassMat);
      windshield.position.set(0.84, 1.28, 0);
      windshield.rotation.z = -0.35;
      car.add(chassis, cab, windshield);
      for (const [wx, wz] of [[-1.3, -1.02], [-1.3, 1.02], [1.3, -1.02], [1.3, 1.02]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), tireMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.38, wz);
        car.add(wheel);
      }
      return car;
    };

    // Left and right flanking wrecked vehicles anchoring the gate wall
    this.desertDecorGroup.add(
      buildWreckedCar(-10.2, -23.6, 0.24, -0.09, 0x8f3a1e),
      buildWreckedCar(-19.4, -20.2, -0.42, 0.14, 0x3b4d3f),
      buildWreckedCar(10.5, -23.4, -0.28, 0.11, 0x733226),
      buildWreckedCar(19.6, -19.8, 0.38, -0.12, 0x4c4054)
    );

    // Corrugated scrap iron walls, concrete barriers, shipping containers & oil drums bridging the gate flanks
    const junkWallSpans: Array<[number, number, number, number, number, number]> = [
      [-6.8, -24.2, 2.6, 3.2, 1.0, 0.08],
      [-14.8, -22.2, 3.8, 2.6, 1.2, 0.28],
      [-23.8, -17.5, 4.4, 3.4, 1.4, 0.52],
      [6.8, -24.2, 2.6, 3.2, 1.0, -0.08],
      [15.0, -22.0, 3.8, 2.8, 1.2, -0.3],
      [23.8, -17.3, 4.4, 3.4, 1.4, -0.52],
    ];
    for (const [jx, jz, jw, jh, jd, ry] of junkWallSpans) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(jw, jh, jd),
        Math.abs(jx) > 18 ? scrapContainerMat : rustedSteelMat
      );
      panel.position.set(jx, jh * 0.48, jz);
      panel.rotation.set(0.05, ry, (jx < 0 ? 1 : -1) * 0.06);
      panel.castShadow = true;
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(jw * 0.9, 1.0, 0.8), concreteMat);
      barrier.position.set(jx, 0.5, jz + 1.05);
      barrier.rotation.y = ry;
      this.desertDecorGroup.add(panel, barrier);
    }

    // Tire stacks & rusted fuel drums clustered against the barricade wings
    for (const [dx, dz, isTire] of [
      [-7.6, -22.3, false],
      [-8.6, -22.0, true],
      [-13.2, -21.0, false],
      [7.6, -22.3, false],
      [8.7, -21.9, true],
      [13.4, -20.8, false],
    ] as Array<[number, number, boolean]>) {
      if (isTire) {
        for (let t = 0; t < 3; t++) {
          const tire = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.18, 6, 12), tireMat);
          tire.rotation.x = Math.PI / 2;
          tire.position.set(dx + (t % 2) * 0.12, 0.22 + t * 0.3, dz);
          this.desertDecorGroup.add(tire);
        }
      } else {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.35, 8), rustBodyMat);
        drum.position.set(dx, 0.68, dz);
        drum.rotation.z = (dx < 0 ? -1 : 1) * 0.12;
        this.desertDecorGroup.add(drum);
      }
    }

    this.desertDecorGroup.visible = false;
    this.scene.add(this.desertDecorGroup);

    // STAGE 3: CEMITERIO (Small central cobblestone path + circular graves + eerie perimeter lanterns)
    addOuterRuins(this.cemeteryDecorGroup, [0x40162b, 0x290e1c, 0x1a0912, 0x521d36]);
    const stonePathGeo = new THREE.PlaneGeometry(5.0, 54);
    stonePathGeo.rotateX(-Math.PI / 2);
    const stonePathMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.stoneWalkwayTex,
      roughness: 0.88,
      metalness: 0.1,
    });
    const stonePathMesh = new THREE.Mesh(stonePathGeo, stonePathMat);
    stonePathMesh.position.set(0, 0.025, 0);
    stonePathMesh.receiveShadow = true;
    this.cemeteryDecorGroup.add(stonePathMesh);

    const graveDirtMat = new THREE.MeshStandardMaterial({ color: 0x1b1014, roughness: 0.96 });
    const graveCurbMat = new THREE.MeshStandardMaterial({ color: 0x433548, roughness: 0.85 });
    for (const g of CEMETERY_GRAVE_POSITIONS) {
      const plot = new THREE.Group();
      plot.position.set(g.x, 0.03, g.z);
      plot.rotation.y = g.yaw;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 2.4), graveCurbMat);
      const mound = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 1.9), graveDirtMat);
      mound.position.set(0, 0.05, 0.15);
      plot.add(curb, mound);
      this.cemeteryDecorGroup.add(plot);
    }

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e1829, metalness: 0.75, roughness: 0.45 });
    const soulFlameMat = new THREE.MeshStandardMaterial({ color: 0x22e3d4, emissive: 0x22e3d4, emissiveIntensity: 1.7 });
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      if (Math.sin(ang) < -0.75 && Math.abs(Math.cos(ang)) < 0.35) continue;
      const dist = ARENA_RADIUS + 1.6;
      const px = Math.cos(ang) * dist;
      const pz = Math.sin(ang) * dist;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.1, 0.5), ironMat);
      pillar.position.set(px, 1.55, pz);
      const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), soulFlameMat);
      lantern.position.set(px, 3.35, pz);
      this.cemeteryDecorGroup.add(pillar, lantern);
    }
    this.cemeteryDecorGroup.visible = false;
    this.scene.add(this.cemeteryDecorGroup);

    // Heavy Rain System (active during Cemetery Round 3 thunderstorm)
    const rainGeo = new THREE.BoxGeometry(0.045, 1.45, 0.045);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xa5d8ff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    this.rainInstanced = new THREE.InstancedMesh(rainGeo, rainMat, this.RAIN_COUNT);
    this.rainInstanced.frustumCulled = false;
    this.rainInstanced.visible = false;
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 48,
        y: Math.random() * 24,
        z: (Math.random() - 0.5) * 48,
        speed: 32 + Math.random() * 14,
      });
    }
    this.scene.add(this.rainInstanced);

    // STAGE 4: PÉ DA ÁRVORE (Scorched crater + pipes + 8-Plank Giant Wooden Barricade blocking the entrance)
    addOuterRuins(this.clearingDecorGroup, [0x6e1f1c, 0x4b1213, 0x2a0a0b, 0x8a281d]);
    const rubbleGeo = new THREE.DodecahedronGeometry(1.15, 0);
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.08 });
    const rubbleInst = new THREE.InstancedMesh(rubbleGeo, rubbleMat, 22);
    for (let i = 0; i < 22; i++) {
      const angle = ((i + 0.35) / 22) * Math.PI * 2;
      const dist = ARENA_RADIUS + 2.4 + (i % 4) * 1.4;
      const s = 0.7 + (i % 3) * 0.45;
      _dummyObj.position.set(Math.cos(angle) * dist, s * 0.42, Math.sin(angle) * dist);
      _dummyObj.rotation.set(i * 0.4, i * 1.1, i * 0.3);
      _dummyObj.scale.set(s * 1.35, s * 0.65, s);
      _dummyObj.updateMatrix();
      rubbleInst.setMatrixAt(i, _dummyObj.matrix);
      _scratchColor.setHex(i % 4 === 0 ? 0x3b0f10 : i % 3 === 0 ? 0x1e0808 : 0x5c191a);
      rubbleInst.setColorAt(i, _scratchColor);
    }
    rubbleInst.computeBoundingSphere();
    this.clearingDecorGroup.add(rubbleInst);

    const craterPipeMat = new THREE.MeshStandardMaterial({ color: 0x3b2a29, roughness: 0.72, metalness: 0.68 });
    const craterPipeRimMat = new THREE.MeshStandardMaterial({
      color: 0xff6b2b,
      emissive: 0xff3b0f,
      emissiveIntensity: 0.85,
      roughness: 0.45,
    });
    for (const [px, pz, ang] of [
      [-12.5, -18.5, -0.52],
      [-7.5, -20.5, -0.28],
      [7.5, -20.5, 0.28],
      [12.5, -18.5, 0.52],
      [-15.5, -14.0, -0.78],
      [15.5, -14.0, 0.78],
    ]) {
      const pipeRun = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 16, 8), craterPipeMat);
      pipeRun.rotation.z = Math.PI / 2;
      pipeRun.rotation.y = Math.PI / 2 + ang;
      pipeRun.position.set(px, 0.38, pz);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.45, 8), craterPipeRimMat);
      collar.rotation.z = Math.PI / 2;
      collar.rotation.y = Math.PI / 2 + ang;
      collar.position.set(px * 0.82, 0.4, pz - 1.4);
      this.clearingDecorGroup.add(pipeRun, collar);
    }

    const stackMat = new THREE.MeshStandardMaterial({ color: 0x1a0b0e, roughness: 0.88, metalness: 0.4 });
    const stackGlowMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4508, emissiveIntensity: 1.5 });
    for (const [sx, sz, sh] of [[-21, -41, 21], [-14, -44, 17], [15, -43, 19], [23, -39, 23]]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.85, sh, 8), stackMat);
      tower.position.set(sx, sh * 0.5, sz);
      const flare = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.9, 8), stackGlowMat);
      flare.position.set(sx, sh + 0.3, sz);
      this.clearingDecorGroup.add(tower, flare);
    }
    const bargeBody = new THREE.Mesh(new THREE.BoxGeometry(9.0, 1.7, 3.0), stackMat);
    bargeBody.position.set(11, 16.5, -36);
    bargeBody.rotation.y = -0.32;
    const bargeThruster = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 2.4), new THREE.MeshBasicMaterial({ color: 0x22e3d4 }));
    bargeThruster.position.set(15.6, 16.5, -34.5);
    bargeThruster.rotation.y = -0.32;
    this.clearingDecorGroup.add(bargeBody, bargeThruster);

    // Giant 8-Plank Wooden Barricade sealing the Binary Tree doorway
    this.treeBarricadeGroup.position.set(0, 0, -18.5);
    const timberPostMat = new THREE.MeshStandardMaterial({ color: 0x5c361a, roughness: 0.92, metalness: 0.05 });
    const nailMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, metalness: 0.8, roughness: 0.35 });
    for (const bx of [-5.5, 5.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.0, 6.8, 1.0), timberPostMat);
      post.position.set(bx, 3.4, 0);
      post.castShadow = true;
      this.treeBarricadeGroup.add(post);
    }
    for (let p = 0; p < BARRICADE_TOTAL_PLANKS; p++) {
      const plankMat = new THREE.MeshStandardMaterial({
        color: p % 2 === 0 ? 0x9c6631 : 0x7a4920,
        roughness: 0.86,
        metalness: 0.04,
      });
      const plank = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.68, 0.52), plankMat);
      const yPos = 0.72 + p * 0.72;
      const tilt = (p % 2 === 0 ? 1 : -1) * (0.04 + (p % 3) * 0.018);
      plank.position.set(0, yPos, (p % 2) * 0.16);
      plank.rotation.z = tilt;
      plank.castShadow = true;
      for (const nx of [-5.0, 5.0]) {
        const nail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.62), nailMat);
        nail.position.set(nx, 0, 0);
        plank.add(nail);
      }
      this.barricadePlanks.push(plank);
      this.treeBarricadeGroup.add(plank);
    }
    this.clearingDecorGroup.add(this.treeBarricadeGroup);
    this.clearingDecorGroup.visible = false;
    this.scene.add(this.clearingDecorGroup);

    // East Highway Exit Portal (Road -> Desert) & North Gateway Portal (Desert -> Cemetery -> Clearing -> Tree)
    const portalGeo = new THREE.RingGeometry(2.6, 3.35, 24);
    portalGeo.rotateX(-Math.PI / 2);
    this.eastRoadPortalRing = new THREE.Mesh(
      portalGeo,
      new THREE.MeshBasicMaterial({ color: 0xffaa2b, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
    );
    this.eastRoadPortalRing.position.set(24.8, 0.08, 0);
    this.scene.add(this.eastRoadPortalRing);

    this.northPortalRing = new THREE.Mesh(
      portalGeo,
      new THREE.MeshBasicMaterial({ color: 0x22e3d4, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
    );
    this.northPortalRing.position.set(0, 0.08, -24.8);
    this.scene.add(this.northPortalRing);

    // Anchor where colossal hollow stump + pipe crater .glb will be mounted once assets load
    this.giantTreeAnchor.position.set(0, 0, -31.5);
    this.scene.add(this.giantTreeAnchor);

    // High-contrast overhead blue circular reload gauge for manual weapons (Shotgun, Railgun, Rocket)
    const reloadBackGeo = new THREE.RingGeometry(0.36, 0.82, 24);
    const reloadBackMat = new THREE.MeshBasicMaterial({
      color: 0x040b16,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const reloadBack = new THREE.Mesh(reloadBackGeo, reloadBackMat);
    reloadBack.renderOrder = 20;

    const reloadOuterRim = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.84, 24),
      new THREE.MeshBasicMaterial({
        color: 0xe0f7ff,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    reloadOuterRim.position.z = 0.005;
    reloadOuterRim.renderOrder = 21;

    const reloadCenter = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: 0.95, depthTest: false })
    );
    reloadCenter.position.z = 0.01;
    reloadCenter.renderOrder = 21;

    this.overheadReloadGroup.add(reloadBack, reloadOuterRim, reloadCenter);
    const segCount = 16;
    const segMat = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    for (let s = 0; s < segCount; s++) {
      const startAng = Math.PI / 2 - ((s + 1) / segCount) * Math.PI * 2;
      const theta = (Math.PI * 2) / segCount;
      const segGeo = new THREE.RingGeometry(0.41, 0.72, 3, 1, startAng, theta * 0.86);
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.position.z = 0.015;
      segMesh.renderOrder = 22;
      this.reloadArcSegments.push(segMesh);
      this.overheadReloadGroup.add(segMesh);
    }
    this.overheadReloadGroup.visible = false;
    this.scene.add(this.overheadReloadGroup);

    // -----------------------------------------------------------------
    // STAGE 5+: INSIDE BINARY TREE (Left: Descending Stairs -> More Industrial | Right: Ascending Stairs -> More Cyberpunk)
    // -----------------------------------------------------------------
    const buildTreeStairGate = (gx: number, colorHex: number, direction: 'down' | 'up'): THREE.Mesh => {
      const gateGroup = new THREE.Group();
      gateGroup.position.set(gx, 0, -25.2);
      const pillarGeo = new THREE.CylinderGeometry(0.45, 0.68, 6.2, 6);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x181c24,
        emissive: colorHex,
        emissiveIntensity: 0.5,
        roughness: 0.4,
      });
      const leftP = new THREE.Mesh(pillarGeo, pillarMat);
      leftP.position.set(-2.4, 3.1, 0);
      const rightP = new THREE.Mesh(pillarGeo, pillarMat);
      rightP.position.set(2.4, 3.1, 0);
      const topOrb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.95, 0),
        new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.5 })
      );
      topOrb.position.set(0, 6.4, 0);
      gateGroup.add(leftP, rightP, topOrb);

      // Physical 3D staircase steps (descending into pit vs ascending into neon shaft)
      const stepMat = new THREE.MeshStandardMaterial({
        color: direction === 'down' ? 0x2c2422 : 0x16102b,
        emissive: colorHex,
        emissiveIntensity: 0.25,
        roughness: 0.5,
        metalness: 0.6,
      });
      for (let s = 0; s < 5; s++) {
        const tread = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.34, 0.85), stepMat);
        const sy = direction === 'down' ? -0.15 - s * 0.34 : 0.2 + s * 0.42;
        const sz = 2.6 - s * 0.85;
        tread.position.set(0, sy, sz);
        gateGroup.add(tread);
      }

      const ring = new THREE.Mesh(
        portalGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.36, side: THREE.DoubleSide })
      );
      ring.position.set(0, 0.08, 2.2);
      gateGroup.add(ring);
      this.treeDecorGroup.add(gateGroup);
      return ring;
    };

    // A single door: the only way is down, deeper into the industrial hell
    this.treeLeftPortalRing = buildTreeStairGate(0, 0xff3a10, 'down');
    this.treeRightPortalRing = this.treeLeftPortalRing;

    const pipeBeamMat = new THREE.MeshStandardMaterial({ color: 0x2b2626, metalness: 0.72, roughness: 0.55 });
    // One pipe, past the north wall: the old ones across the middle of the arena sat between the
    // overhead camera and the floor and blacked out a whole band of the screen
    for (const gz of [-31]) {
      const overheadPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 68, 8), pipeBeamMat);
      overheadPipe.rotation.z = Math.PI / 2;
      overheadPipe.position.set(0, 14.5, gz);
      this.treeMegaDecorGroup.add(overheadPipe);
    }

    this.treeDecorGroup.add(this.treeMegaDecorGroup, this.treeWireframeDecorGroup);
    this.treeDecorGroup.visible = false;
    this.scene.add(this.treeDecorGroup);

    // Non-colliding set dressing + ambient animation for every sector
    this.zoneDetails = buildZoneDetails(
      {
        road: this.roadDecorGroup,
        desert: this.desertDecorGroup,
        cemetery: this.cemeteryDecorGroup,
        clearing: this.clearingDecorGroup,
        treeMega: this.treeMegaDecorGroup,
        treeWire: this.treeWireframeDecorGroup,
      },
      { lowSpec: this.isSoftwareGl }
    );
  }

  /** Swaps the ground's colour / relief / glow maps (null set = plain map + the canyon relief). */
  private setFloor(set: FloorSet | null, plainMap?: THREE.Texture) {
    const m = this.groundMat;
    if (set) {
      m.map = set.map;
      m.bumpMap = set.bump;
      m.bumpScale = set.bumpScale;
      m.emissiveMap = set.glow;
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = set.glowIntensity;
    } else {
      m.map = plainMap ?? null;
      m.bumpMap = this.canyonBumpTex;
      m.bumpScale = 0.14;
      m.emissiveMap = null;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
    m.needsUpdate = true;
  }

  /** Places the sector's fixed light pools: [x, z, height, colour, intensity]. */
  private setZoneLamps(specs: [number, number, number, number, number][]) {
    this.zoneLamps.forEach((l, i) => {
      const s = specs[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.set(s[0], s[2], s[1]);
      l.color.setHex(s[3]);
      l.intensity = s[4];
      l.distance = 18;
      l.userData.base = s[4];
    });
  }

  private updateBatchPass(dt: number) {
    const pass = this.batchPass;
    if (!pass) return;
    pass.t += dt;
    if (!pass.snaps && pass.t >= 0.25) {
      const roots = [this.roadDecorGroup, this.desertDecorGroup, this.cemeteryDecorGroup, this.clearingDecorGroup, this.treeDecorGroup, this.giantTreeAnchor].filter((g) => g.visible);
      // Only what's on screen now: hidden subtrees aren't animated, so stillness proves nothing
      pass.snaps = roots.map((root) => ({ root, snap: snapshotLeaves(root, true) }));
    } else if (pass.snaps && pass.t >= 2.2) {
      let saved = 0;
      for (const { root, snap } of pass.snaps) saved += batchStaticLeaves(root, snap);
      this.batchPass = null;
      if (saved > 0) console.info('[perf] static batching merged away ' + saved + ' draw calls');
    }
  }

  private applyZoneVisuals(zone: ArenaZone) {
    this.zone = zone;
    this.treeSubBiome = zone === 'tree' ? getTreeSubBiomeFromRatio(this.treeCyberRatio) : 'megastructure';
    synthAudio.setMusicZone(zone, this.treeSubBiome);
    this.batchPass = { t: 0, snaps: null };
    this.roadDecorGroup.visible = zone === 'road';
    this.desertDecorGroup.visible = zone === 'desert';
    this.cemeteryDecorGroup.visible = zone === 'cemetery';
    this.clearingDecorGroup.visible = zone === 'clearing';
    this.treeDecorGroup.visible = zone === 'tree';
    // Hidden zones leave the scene graph entirely: three still walks invisible subtrees every
    // frame to update their matrices, and these groups are thousands of objects
    for (const g of [this.roadDecorGroup, this.desertDecorGroup, this.cemeteryDecorGroup, this.clearingDecorGroup, this.treeDecorGroup]) {
      if (g.visible && g.parent !== this.scene) this.scene.add(g);
      else if (!g.visible && g.parent === this.scene) this.scene.remove(g);
    }

    this.eastRoadPortalRing.visible = zone === 'road';
    this.northPortalRing.visible = zone !== 'road' && zone !== 'tree';
    this.treeCyberOverlayMesh.visible = zone === 'tree';

    if (zone === 'tree') {
      const t = Math.max(0, Math.min(1, this.treeCyberRatio));
      this.treeMegaDecorGroup.visible = t < 0.92;
      this.treeWireframeDecorGroup.visible = t > 0.08;
      (this.treeCyberOverlayMesh.material as THREE.MeshBasicMaterial).opacity = t;

      // Gradually blend perimeter towers between industrial mega towers and neon wireframe towers
      for (let i = 0; i < this.treePerimeterPairs.length; i++) {
        const pair = this.treePerimeterPairs[i];
        const ratioThreshold = (i + 0.5) / this.treePerimeterPairs.length;
        const useWire = ratioThreshold <= t;
        const vmHidden = pair.mega.userData.vmHidden === true; // tucked away behind VM's wall
        pair.wire.visible = useWire && !vmHidden;
        pair.mega.visible = !useWire && !vmHidden;
      }

      // Smoothly interpolate floor tint, background sky, fog, and lighting from Industrial (0) -> Cyberpunk (1)
      this.setFloor(this.floors.tree);
      this.setZoneLamps([
        [-11, -9, 1.4, 0xff6a1a, 30],
        [12, 8, 1.4, 0xff6a1a, 30],
        [-10, 12, 1.4, 0xff4a10, 22],
        [11, -13, 1.4, 0xff4a10, 22],
      ]);
      this.groundMat.color.setHex(0xffffff).lerp(_scratchColor.setHex(0x8864aa), t);
      this.perimeterMat.color.setHex(0xff8c2b).lerp(_scratchColor.setHex(0xff1e8a), t);

      const bgCol = new THREE.Color(0x2a1a14).lerp(_scratchColor.setHex(0x070316), t);
      this.scene.background = bgCol;
      this.scene.fog = new THREE.FogExp2(bgCol.getHex(), 0.0155 - t * 0.001);

      // Brighter than the outside sectors read: the dark grade + dither already crush the floor
      this.keyLight.color.setHex(0xffa866).lerp(_scratchColor.setHex(0x00f5ff), t);
      this.keyLight.intensity = 3.3 - t * 0.1;
      this.hemiLight.color.setHex(0xa8b4c4).lerp(_scratchColor.setHex(0xff4db8), t);
      this.hemiLight.groundColor.setHex(0x3a2418).lerp(_scratchColor.setHex(0x090418), t);
      this.hemiLight.intensity = 1.75 + t * 0.08;
      this.rimLight.color.setHex(0xff5a1f).lerp(_scratchColor.setHex(0xffd166), t);
      this.rimLight.intensity = 1.3;
      this.currentRimColorHex = _scratchColor.setHex(0xff6e2b).lerp(new THREE.Color(0xc81eff), t).getHex();

      // Each floor down is more hellish: blood-black sky, thicker haze, furnace-red light
      const hell = Math.min(1, Math.max(0, (this.treeDepth - 1) / 5));
      const hellBg = bgCol.clone().lerp(_scratchColor.setHex(0x1c0302), hell);
      this.scene.background = hellBg;
      this.scene.fog = new THREE.FogExp2(hellBg.getHex(), 0.0115 + hell * 0.004);
      this.keyLight.color.lerp(_scratchColor.setHex(0xff3010), hell * 0.7);
      this.keyLight.intensity *= 1 - hell * 0.15;
      this.rimLight.color.lerp(_scratchColor.setHex(0xff2a00), hell);
      this.rimLight.intensity = 1.3 + hell * 0.9;
      this.currentRimColorHex = new THREE.Color(this.currentRimColorHex).lerp(new THREE.Color(0xff2000), hell).getHex();
      this.giantTreeAnchor.visible = false;
    } else if (zone === 'desert') {
      this.groundMat.color.setHex(0xffffff);
      this.setFloor(this.floors.desert);
      this.setZoneLamps([
        [-12, -9, 5, 0xffa040, 26],
        [13, 7, 5, 0xffa040, 26],
      ]);
      this.perimeterMat.color.setHex(0xf59e0b);
      this.scene.background = new THREE.Color(0x522512);
      this.scene.fog = new THREE.FogExp2(0x522512, 0.0115);
      this.keyLight.color.setHex(0xffb46b);
      this.keyLight.intensity = 2.7;
      this.hemiLight.color.setHex(0xf59e42);
      this.hemiLight.groundColor.setHex(0x3a1c0b);
      this.hemiLight.intensity = 1.18;
      this.rimLight.color.setHex(0x22e3d4);
      this.rimLight.intensity = 0.95;
      this.currentRimColorHex = 0xd97706;
      this.giantTreeAnchor.visible = true;
      this.giantTreeAnchor.position.set(0, 0, -56);
      this.giantTreeAnchor.scale.setScalar(1.0);
    } else if (zone === 'cemetery') {
      this.groundMat.color.setHex(0xffffff);
      this.setFloor(this.floors.cemetery);
      // Cold grave lanterns
      this.setZoneLamps([
        [-9, -7, 3, 0x9fe8ff, 28],
        [10, 5, 3, 0x9fe8ff, 28],
        [-8, 13, 3, 0xbfd8ff, 20],
      ]);
      this.perimeterMat.color.setHex(0x22e3d4);
      this.scene.background = new THREE.Color(0x2d0b1a);
      this.scene.fog = new THREE.FogExp2(0x2d0b1a, 0.0135);
      this.keyLight.color.setHex(0xa8daff);
      this.keyLight.intensity = 2.55;
      this.hemiLight.color.setHex(0x72e0d4);
      this.hemiLight.groundColor.setHex(0x260b1b);
      this.hemiLight.intensity = 1.28;
      this.rimLight.color.setHex(0xff3b5f);
      this.rimLight.intensity = 1.15;
      this.currentRimColorHex = 0x1ea89c;
      this.giantTreeAnchor.visible = true;
      this.giantTreeAnchor.position.set(0, 0, -45);
      this.giantTreeAnchor.scale.setScalar(1.08);
    } else if (zone === 'clearing') {
      this.groundMat.color.setHex(0xffffff);
      this.setFloor(this.floors.clearing);
      // The crater smoulders from its heart
      this.setZoneLamps([
        [0, -6, 1.5, 0xff5a1a, 40],
        [-12, 6, 1.5, 0xff3a10, 22],
        [12, 6, 1.5, 0xff3a10, 22],
      ]);
      this.perimeterMat.color.setHex(0xff4422);
      this.scene.background = new THREE.Color(0x4a0e14);
      this.scene.fog = new THREE.FogExp2(0x4a0e14, 0.0122);
      this.keyLight.color.setHex(0xff8c52);
      this.keyLight.intensity = 2.65;
      this.hemiLight.color.setHex(0xe05244);
      this.hemiLight.groundColor.setHex(0x2a080d);
      this.hemiLight.intensity = 1.15;
      this.rimLight.color.setHex(0xff6b2b);
      this.rimLight.intensity = 1.55;
      this.currentRimColorHex = 0xff4d1a;
      this.giantTreeAnchor.visible = true;
      this.giantTreeAnchor.position.set(0, 0, -24.2);
      this.giantTreeAnchor.scale.setScalar(1.28);
    } else {
      // 'road' (Horizontal Estrada)
      this.groundMat.color.setHex(0xffffff);
      this.setFloor(this.floors.road);
      // Sodium highway lamps along both shoulders
      this.setZoneLamps([
        [-15, 8.5, 6, 0xff9a40, 32],
        [2, -8.5, 6, 0xff9a40, 32],
        [18, 8.5, 6, 0xff9a40, 32],
      ]);
      this.perimeterMat.color.setHex(0xff6b2b);
      this.scene.background = new THREE.Color(0x480d14);
      this.scene.fog = new THREE.FogExp2(0x480d14, 0.0124);
      this.keyLight.color.setHex(0xff8c4a);
      this.keyLight.intensity = 2.65;
      this.hemiLight.color.setHex(0xd9483b);
      this.hemiLight.groundColor.setHex(0x26060b);
      this.hemiLight.intensity = 1.12;
      this.rimLight.color.setHex(0xff5a2b);
      this.rimLight.intensity = 1.45;
      this.currentRimColorHex = 0xff6b2b;
      this.giantTreeAnchor.visible = true;
      this.giantTreeAnchor.position.set(0, 0, this.phase === 'title' ? -33.0 : -52.0);
      this.giantTreeAnchor.scale.setScalar(this.phase === 'title' ? 1.15 : 1.05);
    }
    const grime = this.scene.getObjectByName('floor_grime');
    if (grime) grime.visible = !(zone === 'tree' && this.aero); // the aero world is spotless
    if (zone === 'tree' && this.aero) this.applyAeroVisuals();
    else {
      if (this.aeroWorld) this.aeroWorld.group.visible = false;
      this.ditherPass.setClean(0);
    }
    this.groundMat.needsUpdate = true;
    // Baselines the rave rig's fluorescent failures flicker around
    this.keyBaseIntensity = this.keyLight.intensity;
    this.hemiBaseIntensity = this.hemiLight.intensity;
    this.buildArenaObstacles();
  }

  private async initAssetsAndStartLoop() {
    try {
      this.assets = await loadAllGlbAssets();
      if (this.disposed) return;

      // Mount colossal hollow stump + converging pipe crater .glb monument
      const treeMonument = cloneModelWithUniqueMaterials(this.assets.treeGiant);
      this.giantTreeAnchor.add(treeMonument);
      this.giantTreeAnchor.position.set(0, 0, -33.0);
      this.giantTreeAnchor.scale.setScalar(1.15);

      // Populate Stage 1 (Horizontal Estrada) utility poles & road signs flanking Z = ±10.2
      for (const sz of [-10.2, 10.2]) {
        for (const px of [-18, -6, 6, 18]) {
          const pole = cloneModelWithUniqueMaterials(this.assets.utilityPole);
          pole.position.set(px, 0, sz);
          pole.rotation.y = Math.PI / 2 + (sz < 0 ? 0.12 : -0.12);
          this.roadDecorGroup.add(pole);
        }
      }
      const roadSignNorth = cloneModelWithUniqueMaterials(this.assets.roadSign);
      roadSignNorth.position.set(9.5, 0, -8.8);
      roadSignNorth.rotation.y = -Math.PI / 2 - 0.25;
      const roadSignSouth = cloneModelWithUniqueMaterials(this.assets.roadSign);
      roadSignSouth.position.set(-10.5, 0, 8.9);
      roadSignSouth.rotation.y = Math.PI / 2 + 0.25;
      this.roadDecorGroup.add(roadSignNorth, roadSignSouth);

      // Add tilted snapped pole & warning sign at Desert West ruined road threshold
      const desertRuinedSign = cloneModelWithUniqueMaterials(this.assets.roadSign);
      desertRuinedSign.position.set(-14.5, 0, -6.5);
      desertRuinedSign.rotation.set(0.18, 0.5, -0.35);
      const desertRuinedPole = cloneModelWithUniqueMaterials(this.assets.utilityPole);
      desertRuinedPole.position.set(-18.5, 0, 6.8);
      desertRuinedPole.rotation.set(0.28, 1.2, 0.22);
      this.desertDecorGroup.add(desertRuinedSign, desertRuinedPole);

      // Scatter smaller clearcut tree stumps around exterior perimeter in Road, Cemetery & Clearing
      const stumpRingCount = 12;
      for (let i = 0; i < stumpRingCount; i++) {
        const ang = (i / stumpRingCount) * Math.PI * 2 + 0.18;
        if (Math.sin(ang) < -0.65 && Math.abs(Math.cos(ang)) < 0.55) continue;
        const rDist = ARENA_RADIUS + 2.4 + (i % 3) * 2.2;
        const sx = Math.cos(ang) * rDist;
        const sz = Math.sin(ang) * rDist;

        const clrStump = cloneModelWithUniqueMaterials(this.assets.stumpSmall);
        clrStump.position.set(sx, 0, sz);
        clrStump.rotation.y = i * 1.3;
        clrStump.scale.setScalar(1.05 + (i % 3) * 0.28);
        this.clearingDecorGroup.add(clrStump);

        if (i % 2 === 0) {
          const cemStump = cloneModelWithUniqueMaterials(this.assets.stumpSmall);
          cemStump.position.set(sx * 1.04, 0, sz * 1.04);
          cemStump.rotation.y = i * 0.9;
          this.cemeteryDecorGroup.add(cemStump);
        } else {
          const rdStump = cloneModelWithUniqueMaterials(this.assets.stumpSmall);
          rdStump.position.set(sx * 1.06, 0, sz * 1.06);
          rdStump.rotation.y = i * 1.7;
          this.roadDecorGroup.add(rdStump);
        }
      }

      // Populate Stage 5+ perimeter architectures (paired mega/wireframe for smooth cyberRatio blending)
      const towerCount = 16;
      for (let i = 0; i < towerCount; i++) {
        const ang = (i / towerCount) * Math.PI * 2;
        if (Math.sin(ang) < -0.58 && Math.abs(Math.cos(ang)) < 0.52) continue;
        const dist = ARENA_RADIUS - 0.6 + (i % 2) * 2.6;
        const tx = Math.cos(ang) * dist;
        const tz = Math.sin(ang) * dist;
        if (tz > 3.5) continue;

        const mega = cloneModelWithUniqueMaterials(this.assets.megaTower);
        mega.position.set(tx, 0, tz);
        mega.rotation.y = Math.atan2(-tx, -tz);
        mega.scale.setScalar(1.05 + (i % 3) * 0.18);
        this.treeDecorGroup.add(mega);

        const wire = cloneModelWithUniqueMaterials(this.assets.wireframeTower);
        wire.position.set(tx, 0, tz);
        wire.rotation.y = Math.atan2(-tx, -tz);
        wire.scale.setScalar(1.12 + (i % 3) * 0.24);
        this.treeDecorGroup.add(wire);

        this.treePerimeterPairs.push({ mega, wire });
      }

      // Setup Hero from loaded cowboy_hero.glb
      this.heroModel = cloneModelWithUniqueMaterials(this.assets.hero);
      applyHeroSkin(this.heroModel, SKIN_MAP[this.equippedSkin]);
      applyHeroOutfit(this.heroModel, this.equippedSkin);
      this.heroRoot.add(this.heroModel);

      // Attach weapon models to hero hand anchor. The holder pushes them a bit forward and up
      // and scales them so they stick out past the hat brim under the overhead camera.
      this.weaponAnchor.position.set(0, 1.0, 0.28);
      this.heroRoot.add(this.weaponAnchor);
      const weaponHolder = new THREE.Group();
      weaponHolder.position.set(0, 0.12, 0.16);
      weaponHolder.scale.setScalar(1.3);
      this.weaponAnchor.add(weaponHolder);
      for (const wId of WEAPON_ORDER) {
        const wModel = cloneModelWithUniqueMaterials(this.assets.weapons[wId]);
        wModel.visible = wId === this.activeWeapon;
        weaponHolder.add(wModel);
        this.weaponModels[wId] = wModel;
      }

      // Ground marker: a thin ring under the player with a notch pointing where they aim —
      // keeps the hero (and their facing) readable in the darkest, busiest rooms
      const markerMat = new THREE.MeshBasicMaterial({
        color: 0xf2ece0,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.16, 36).rotateX(-Math.PI / 2), markerMat);
      const notch = new THREE.Mesh(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.24, 0, 1.22),
          new THREE.Vector3(0.24, 0, 1.22),
          new THREE.Vector3(0, 0, 1.62),
        ]),
        markerMat
      );
      this.playerMarker = new THREE.Group();
      this.playerMarker.add(ring, notch);
      this.playerMarker.position.y = 0.045;
      this.heroRoot.add(this.playerMarker);

      this.scene.add(this.heroRoot);
      this.buildArenaObstacles();

      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }

      this.callbacks.onAssetsReady();
      this.emitHud();
      this.lastTimeMs = performance.now();
      this.tick();
    } catch (err) {
      console.error('Failed to load GLB assets:', err);
    }
  }

  private buildArenaObstacles() {
    if (!this.assets) return;

    for (const obs of this.obstacles) {
      this.scene.remove(obs.group);
    }
    this.obstacles = [];

    const isWireframe = this.zone === 'tree' && this.treeSubBiome === 'wireframe';

    const obstacleSet = SECTOR_OBSTACLES[this.zone];
    for (let idx = 0; idx < obstacleSet.length; idx++) {
      const def = obstacleSet[idx];
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);

      if (def.kind === 'cactus') {
        const c = cloneModelWithUniqueMaterials(this.assets.cactus);
        group.add(c);
      } else if (def.kind === 'crate') {
        const cr = buildCrateProp();
        cr.rotation.y = (def.x * 0.7 + def.z) * 0.5;
        group.add(cr);
      } else if (def.kind === 'arch') {
        const ar = cloneModelWithUniqueMaterials(this.assets.arch);
        group.add(ar);
      } else if (def.kind === 'tombstone') {
        const tb = cloneModelWithUniqueMaterials(this.assets.tombstone);
        group.add(tb);
      } else if (def.kind === 'datacache') {
        const dc = buildCacheProp(this.zone);
        dc.rotation.y = Math.atan2(-def.x, -def.z) + Math.PI;
        group.add(dc);
      } else if (def.kind === 'stump') {
        const st = cloneModelWithUniqueMaterials(this.assets.stumpSmall);
        st.scale.setScalar(1.26);
        st.rotation.y = (def.x + def.z) * 0.35;
        group.add(st);
      } else if (def.kind === 'road_ruin') {
        const ruin = buildRuinProp(idx);
        ruin.rotation.y = idx * 0.8;
        group.add(ruin);
      } else if (def.kind === 'mesa' && this.aero && this.zone === 'tree') {
        group.add(buildAeroPillar());
      } else if (def.kind === 'mesa') {
        const prop = buildMesaProp(this.zone, idx, isWireframe);
        prop.rotation.y = idx * 1.3;
        group.add(prop);
      }

      this.scene.add(group);
      this.obstacles.push({
        ...def,
        hp: def.kind === 'tombstone' ? 36 : def.kind === 'datacache' ? 28 : def.destructible ? 45 : Infinity,
        group,
      });
    }
  }

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const realDt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.realDt = realDt;
    this.updateSlowMo(realDt);
    // Simulation step: slowed down during last-kill slow-motion
    const dt = realDt * this.timeScale;
    this.elapsedSec += dt;

    if (this.phase === 'title') {
      this.updateTitleTour(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    // Update muzzle light, screen damage flash, trauma & particles even during brief hitstop
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 45);
    const hadDamageFlash = this.damageFlash > 0.08;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.1);
    if (hadDamageFlash && this.damageFlash <= 0.08 && this.phase === 'playing') {
      this.emitHud();
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.75);
    if (this.barricadeFlashTimer > 0) {
      this.barricadeFlashTimer = Math.max(0, this.barricadeFlashTimer - dt);
      const flashActive = this.barricadeFlashTimer > 0;
      for (const plank of this.barricadePlanks) {
        const mat = plank.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(flashActive ? 0xffaa2b : 0x000000);
        mat.emissiveIntensity = flashActive ? 0.65 : 0;
      }
    }

    // Update railgun white trails & Cemetery Round 3 thunderstorm rain/lightning
    this.updateRailTrails(dt);
    this.updateStormAndLightning(dt);

    // Sector-specific atmospheric weather particles
    if (this.zone === 'road' && Math.random() < dt * 15) {
      const ex = (Math.random() - 0.5) * 38;
      const ez = (Math.random() - 0.5) * 44;
      const ey = 0.4 + Math.random() * 4.5;
      this.spawnParticles(ex, ey, ez, 1, Math.random() < 0.5 ? 0xff4514 : 0xff8c4a, 2.8, 0.95);
    } else if (this.zone === 'desert' && Math.random() < dt * 14) {
      const ex = (Math.random() - 0.5) * 42;
      const ez = (Math.random() - 0.5) * 42;
      const ey = 0.35 + Math.random() * 2.5;
      this.spawnParticles(ex, ey, ez, 1, Math.random() < 0.6 ? 0xf59e0b : 0xd97706, 2.4, 0.85);
    } else if (this.zone === 'cemetery' && Math.random() < dt * 13) {
      const ex = (Math.random() - 0.5) * 34;
      const ez = (Math.random() - 0.5) * 36;
      const ey = 0.25 + Math.random() * 2.8;
      this.spawnParticles(ex, ey, ez, 1, Math.random() < 0.65 ? 0x22e3d4 : 0x7209b7, 1.3, 1.3);
    } else if (this.zone === 'clearing' && Math.random() < dt * 20) {
      const ex = (Math.random() - 0.5) * 34;
      const ez = Math.random() < 0.62 ? -22 - Math.random() * 14 : (Math.random() - 0.5) * 36;
      const ey = Math.random() < 0.5 ? 0.5 + Math.random() * 6 : 7 + Math.random() * 14;
      this.spawnParticles(ex, ey, ez, 1, Math.random() < 0.45 ? 0xff4514 : 0xffaa2b, 2.6, 1.2);
    } else if (this.zone === 'tree' && Math.random() < dt * 15) {
      const ex = (Math.random() - 0.5) * 34;
      const ez = (Math.random() - 0.5) * 36;
      const ey = 0.6 + Math.random() * 5.2;
      const useCyberPart = Math.random() < this.treeCyberRatio;
      const partHex = useCyberPart
        ? Math.random() < 0.45
          ? 0xff1e8a
          : Math.random() < 0.6
            ? 0x00f5ff
            : 0xffd166
        : Math.random() < 0.6
          ? 0xff8c2b
          : 0x64748b;
      this.spawnParticles(ex, ey, ez, 1, partHex, 1.4, 1.25);
    }
    this.updateParticles(dt);
    if (this.phase !== 'paused') {
      this.zoneDetails?.update(dt, this.elapsedSec);
      this.updateBatchPass(dt);
      this.fx.update(dt);
      this.poisonClouds.update(dt, this.elapsedSec);
      this.returnFx.update(dt, this.elapsedSec);
      this.teleportFx.update(dt, this.elapsedSec);
      this.blastFx.update(dt);
      this.updateBolts(dt);
      if (this.aero && this.aeroWorld?.group.visible) {
        this.aeroWorld.update(this.elapsedSec, dt);
        for (const e of this.enemies) if (e.mesh.userData.blob) wobbleBlob(e.mesh, this.elapsedSec, e.walkPhase);
      }
      if (this.staticTex) {
        // Broken monitors: the static crawls
        this.staticTex.offset.set(Math.random(), Math.random());
      }
      if (this.vmDoor?.update(realDt)) {
        // Shutter slammed fully open on its own (VM's regular visit)
        this.trauma = Math.max(this.trauma, 0.5);
      }
      this.vmSpace?.update(realDt, this.elapsedSec);
    }

    // Fade back in from white after crossing into VM's space
    if (this.whiteFlash > 0) {
      this.whiteFlash = Math.max(0, this.whiteFlash - realDt * 1.6);
      this.cineFadeEl.style.background = '#ffffff';
      this.cineFadeEl.style.opacity = String(this.whiteFlash);
      if (this.whiteFlash <= 0) this.cineFadeEl.style.background = '#000000';
    } else if (this.fireFlash > 0) {
      // His detonation: hot orange flash bleeding to red
      this.fireFlash = Math.max(0, this.fireFlash - realDt * 1.4);
      this.cineFadeEl.style.background = this.fireFlash > 0.6 ? '#ffb347' : this.fireFlash > 0.3 ? '#ff6a1a' : '#c0200a';
      this.cineFadeEl.style.opacity = String(Math.min(1, this.fireFlash * 1.1));
      if (this.fireFlash <= 0) {
        this.cineFadeEl.style.background = '#000000';
        this.cineFadeEl.style.opacity = '0';
      }
    }

    // Player ground marker: only while actually playing
    if (this.playerMarker) this.playerMarker.visible = this.phase === 'playing' && !this.isCinematic();

    // Rave rig: lamps pump with the music, strobe on big hits, fluorescent failures
    const cinematic = this.isCinematic() || this.inVmSpace;
    const hell = this.zone === 'tree' ? Math.min(1, Math.max(0, (this.treeDepth - 1) / 5)) : 0;
    const lull = this.boss2Stage === 'lull' ? Math.min(1, 1 - this.boss2Timer / 10) : 0;
    const lightFactor = this.rave.update(
      realDt,
      this.elapsedSec,
      this.zone,
      synthAudio.getMusicPulse(),
      hell,
      !cinematic && this.boss2Stage !== 'lull'
    );
    let f = cinematic ? 1 : lightFactor;
    if (lull > 0) {
      // The calm before he comes: the rig is dead, the main lights sag and stutter harder and harder
      const chatter = Math.sin(this.elapsedSec * 61) * Math.sin(this.elapsedSec * 17.3);
      const stutter = chatter > 0.55 - lull * 0.9 ? 1 : 0.15;
      f *= (1 - lull * 0.5) * (lull > 0.25 ? stutter : 1);
    }
    this.keyLight.intensity = this.keyBaseIntensity * f;
    this.hemiLight.intensity = this.hemiBaseIntensity * (0.55 + 0.45 * f);
    // Sector light pools: dip with the power failures, flicker like fire / tired sodium tubes
    for (let i = 0; i < this.zoneLamps.length; i++) {
      const l = this.zoneLamps[i];
      const base = (l.userData.base as number) ?? 0;
      if (!base) continue;
      const flick = 0.88 + Math.sin(this.elapsedSec * (9 + i * 3.1)) * 0.06 + Math.sin(this.elapsedSec * (23 + i * 5.7)) * 0.06;
      l.intensity = this.inVmSpace ? 0 : base * flick * (0.35 + 0.65 * f);
    }

    // Render scene through Bayer 4x4 dithering retro shader + subtle atmospheric rim tint
    this.ditherPass.render(
      this.renderer,
      this.scene,
      this.camera,
      this.elapsedSec,
      this.damageFlash,
      this.currentRimColorHex
    );

    this.scheduleNextFrame();
  }

  private updateStormAndLightning(dt: number) {
    if (!this.stormActive || this.zone !== 'cemetery') {
      if (this.rainInstanced.visible) this.rainInstanced.visible = false;
      return;
    }

    this.rainInstanced.visible = true;
    const baseX = this.playerX;
    const baseZ = this.playerZ;
    for (let i = 0; i < this.RAIN_COUNT; i++) {
      const d = this.rainDrops[i];
      d.y -= d.speed * dt;
      d.x -= 4.5 * dt;
      if (d.y < 0.2) {
        if (Math.random() < 0.08) {
          this.spawnParticles(baseX + d.x, 0.15, baseZ + d.z, 1, 0x93c5fd, 1.5, 0.2);
        }
        d.y = 18 + Math.random() * 8;
        d.x = (Math.random() - 0.5) * 44;
        d.z = (Math.random() - 0.5) * 44;
      }
      _dummyObj.position.set(baseX + d.x, d.y, baseZ + d.z);
      _dummyObj.rotation.set(0.05, 0, -0.14);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      this.rainInstanced.setMatrixAt(i, _dummyObj.matrix);
    }
    this.rainInstanced.instanceMatrix.needsUpdate = true;

    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningFlash = 1.0;
      this.lightningTimer = 3.2 + Math.random() * 4.5;
      this.trauma = Math.max(this.trauma, 0.34);
      synthAudio.playThunder();
    }

    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.8);
      this.keyLight.color.setHex(0xa8daff).lerp(_scratchColor.setHex(0xffffff), this.lightningFlash);
      this.keyLight.intensity = 2.4 + this.lightningFlash * 4.2;
      (this.scene.background as THREE.Color).setHex(0x1f0b18).lerp(_scratchColor.setHex(0x526b8c), this.lightningFlash * 0.72);
    } else {
      this.keyLight.color.setHex(0x93c5fd);
      this.keyLight.intensity = 2.15;
      (this.scene.background as THREE.Color).setHex(0x1a0814);
    }
  }

  private updateRailTrails(dt: number) {
    for (let i = this.railTrails.length - 1; i >= 0; i--) {
      const tr = this.railTrails[i];
      tr.life -= dt;
      const ratio = Math.max(0, tr.life / tr.maxLife);
      tr.core.scale.set(ratio, 1, ratio);
      tr.glow.scale.set(0.5 + ratio * 0.9, 1, 0.5 + ratio * 0.9);
      (tr.core.material as THREE.MeshBasicMaterial).opacity = ratio;
      (tr.glow.material as THREE.MeshBasicMaterial).opacity = ratio * 0.55;
      if (tr.life <= 0) {
        this.scene.remove(tr.core);
        this.scene.remove(tr.glow);
        tr.core.geometry.dispose();
        (tr.core.material as THREE.Material).dispose();
        tr.glow.geometry.dispose();
        (tr.glow.material as THREE.Material).dispose();
        this.railTrails.splice(i, 1);
      }
    }
  }

  private updateTitleTour(dt: number) {
    // Showcase both the cowboy data protagonist AND the GIANT burnt Binary Tree .glb looming over the scorched red wasteland
    const sway = Math.sin(this.elapsedSec * 0.42) * 8.0;
    const targetCamX = sway;
    const targetCamZ = 22.0 + Math.cos(this.elapsedSec * 0.42) * 2.0;
    const damp = 1 - Math.exp(-4 * dt);

    this.camPosX += (targetCamX - this.camPosX) * damp;
    this.camPosY += (10.2 - this.camPosY) * damp;
    this.camPosZ += (targetCamZ - this.camPosZ) * damp;

    this.camera.position.set(this.camPosX, this.camPosY, this.camPosZ);
    this.camera.lookAt(0, 9.5, -16);

    // Idle hero breathing & turntable look
    this.heroRoot.position.set(0, Math.sin(this.elapsedSec * 2.2) * 0.05, 0);
    this.heroRoot.rotation.y = Math.sin(this.elapsedSec * 0.65) * 0.45;
    this.heroShadow.position.set(0, 0.02, 0);
    this.aimReticleMesh.visible = false;
  }

  private finishGateCutscene() {
    const mode = this.cutsceneMode;
    this.cutsceneMode = 'none';
    this.cutsceneTimer = 0;
    this.cutsceneText = null;
    if (mode === 'gate_close') {
      this.desertGateBars.position.y = 0;
      this.desertGateClosed = true;
    } else if (mode === 'gate_open') {
      this.desertGateBars.position.y = 5.8;
      this.desertGateClosed = false;
      this.portalOpen = true;
      synthAudio.playPortalOpen();
      this.waveBanner = 'PORTÃO ABERTO ↑ ENTRE NO CEMITÉRIO';
      this.waveBannerTimer = 4.2;
    }
    this.emitHud();
  }

  private updateGateCutscene(dt: number) {
    this.cutsceneTimer += dt;
    const progress = Math.min(1, this.cutsceneTimer / Math.max(0.1, this.cutsceneDuration));

    if (this.cutsceneMode === 'gate_close') {
      const dropPhase = Math.min(1, progress / 0.48);
      this.desertGateBars.position.y = (1 - dropPhase * dropPhase) * 5.8;
      if (dropPhase >= 1 && !this.cutsceneClangPlayed) {
        this.cutsceneClangPlayed = true;
        this.trauma = 0.72;
        synthAudio.playGateClang();
        this.spawnParticles(0, 0.8, -24.5, 22, 0xf59e0b, 9.5, 0.4);
      }
    } else if (this.cutsceneMode === 'gate_open') {
      if (!this.cutsceneClangPlayed) {
        this.cutsceneClangPlayed = true;
        synthAudio.playGateClang();
        this.spawnParticles(0, 1.4, -24.5, 24, 0x22e3d4, 9.0, 0.45);
      }
      const liftPhase = Math.min(1, Math.max(0, (progress - 0.12) / 0.75));
      this.desertGateBars.position.y = liftPhase * 5.8;
    }

    const damp = 1 - Math.exp(-6.5 * dt);
    const targetCamY = this.cutsceneMode === 'barricade_intro' ? 9.8 : 11.2;
    const targetCamZ = this.cutsceneMode === 'barricade_intro' ? -5.0 : -11.5;
    const lookY = this.cutsceneMode === 'barricade_intro' ? 2.8 : 3.6;
    const lookZ = this.cutsceneMode === 'barricade_intro' ? -18.5 : -24.5;

    this.camPosX += (0 - this.camPosX) * damp;
    this.camPosY += (targetCamY - this.camPosY) * damp;
    this.camPosZ += (targetCamZ - this.camPosZ) * damp;
    const shakeMag = this.trauma * this.trauma * 0.9;
    this.camera.position.set(
      this.camPosX + (Math.random() * 2 - 1) * shakeMag,
      this.camPosY + (Math.random() * 2 - 1) * shakeMag,
      this.camPosZ
    );
    this.camera.lookAt(0, lookY, lookZ);

    if (progress >= 1) {
      this.finishGateCutscene();
    }
  }

  private updateWeaponAnimation(dt: number) {
    if (this.weaponKickTimer > 0) {
      this.weaponKickTimer = Math.max(0, this.weaponKickTimer - dt);
    }
    const dur = Math.max(0.08, this.weaponKickDuration);
    const u = 1 - this.weaponKickTimer / dur; // 0 right after shot -> 1 settled
    const k = Math.max(0, this.weaponKickTimer / dur);

    this.weaponAnchor.position.set(0, 1.0, 0.28);
    this.weaponAnchor.rotation.set(0, 0, 0);

    if (this.weaponKickTimer > 0) {
      switch (this.activeWeapon) {
        case 'pistol': {
          this.weaponAnchor.position.z = 0.28 - k * 0.15;
          this.weaponAnchor.position.y = 1.0 + k * 0.05;
          this.weaponAnchor.rotation.x = -k * 0.48;
          break;
        }
        case 'pistols': {
          this.weaponAnchor.position.z = 0.28 - k * 0.12;
          this.weaponAnchor.position.x = this.barrelToggle * k * 0.08;
          this.weaponAnchor.rotation.x = -k * 0.34;
          this.weaponAnchor.rotation.z = this.barrelToggle * k * 0.26;
          break;
        }
        case 'shotgun': {
          if (u < 0.36) {
            const p = 1 - u / 0.36;
            this.weaponAnchor.position.z = 0.28 - p * 0.36;
            this.weaponAnchor.position.y = 1.0 + p * 0.08;
            this.weaponAnchor.rotation.x = -p * 0.56;
          } else if (u < 0.78) {
            // Distinct pump-action rack mid-cooldown
            const pump = Math.sin(((u - 0.36) / 0.42) * Math.PI);
            this.weaponAnchor.position.z = 0.28 - pump * 0.18;
            this.weaponAnchor.position.y = 1.0 + pump * 0.09;
            this.weaponAnchor.rotation.x = -0.18 * pump;
            this.weaponAnchor.rotation.z = pump * 0.38;
          }
          break;
        }
        case 'plasma': {
          this.weaponAnchor.position.z = 0.28 - k * 0.1;
          this.weaponAnchor.rotation.x = -k * 0.18;
          this.weaponAnchor.rotation.z = Math.sin(this.elapsedSec * 52) * k * 0.15;
          break;
        }
        case 'railgun': {
          // Massive sniper blowback kick + slow barrel drop settle
          const kickPow = Math.pow(k, 0.72);
          this.weaponAnchor.position.z = 0.28 - kickPow * 0.48;
          this.weaponAnchor.position.y = 1.0 + kickPow * 0.14;
          this.weaponAnchor.rotation.x = -kickPow * 0.68;
          this.weaponAnchor.rotation.z = kickPow * 0.22;
          break;
        }
        case 'rocket': {
          this.weaponAnchor.position.z = 0.28 - k * 0.42;
          this.weaponAnchor.position.x = -k * 0.12;
          this.weaponAnchor.position.y = 1.0 + k * 0.1;
          this.weaponAnchor.rotation.x = -k * 0.52;
          this.weaponAnchor.rotation.y = k * 0.14;
          break;
        }
        case 'nailgun': {
          // Pneumatic hammering: tiny sharp jolts
          this.weaponAnchor.position.z = 0.28 - k * 0.08;
          this.weaponAnchor.rotation.x = -k * 0.1;
          this.weaponAnchor.rotation.z = this.barrelToggle * k * 0.06;
          break;
        }
        case 'harpoon': {
          this.weaponAnchor.position.z = 0.28 - k * 0.3;
          this.weaponAnchor.position.y = 1.0 + k * 0.06;
          this.weaponAnchor.rotation.x = -k * 0.4;
          break;
        }
        case 'coice': {
          // Both hands thrown up by the blast
          const kp = Math.pow(k, 0.6);
          this.weaponAnchor.position.z = 0.28 - kp * 0.5;
          this.weaponAnchor.position.y = 1.0 + kp * 0.2;
          this.weaponAnchor.rotation.x = -kp * 0.95;
          break;
        }
        case 'juiz': {
          this.weaponAnchor.position.z = 0.28 - k * 0.14;
          this.weaponAnchor.rotation.x = -k * 0.5;
          this.weaponAnchor.rotation.z = this.barrelToggle * k * 0.2;
          break;
        }
        case 'faces': {
          this.weaponAnchor.position.z = 0.28 - k * 0.1;
          this.weaponAnchor.rotation.z = Math.sin(this.facesSpin) * 0.12;
          break;
        }
        case 'rmrf': {
          const kp = Math.pow(k, 0.5);
          this.weaponAnchor.position.z = 0.28 - kp * 0.6;
          this.weaponAnchor.position.y = 1.0 + kp * 0.25;
          this.weaponAnchor.rotation.x = -kp * 0.8;
          this.weaponAnchor.position.x = (Math.random() - 0.5) * kp * 0.1;
          break;
        }
        case 'forkbomb': {
          this.weaponAnchor.position.z = 0.28 - k * 0.34;
          this.weaponAnchor.position.y = 1.0 + k * 0.12;
          this.weaponAnchor.rotation.x = -k * 0.6;
          this.weaponAnchor.rotation.z = Math.sin(this.elapsedSec * 40) * k * 0.08;
          break;
        }
      }
    }

    // Juiz loading: hammer back, gun tilted and trembling
    if (this.activeWeapon === 'juiz' && this.juizLoaded > 1 && this.juizHold >= 0) {
      this.weaponAnchor.rotation.z = -0.45 + Math.sin(this.elapsedSec * 34) * 0.03;
      this.weaponAnchor.position.y = 1.08;
    }

    // Melee weapons (overrides recoil):
    //  katana  → horizontal slash sweeping across the body
    //  hammer  → raised overhead during the wind-up, then slammed down in front
    if (this.meleeTimer > 0) {
      this.meleeTimer = Math.max(0, this.meleeTimer - dt);
      const p = 1 - this.meleeTimer / Math.max(0.05, this.meleeAnimDuration);
      const ease = Math.sin(Math.min(1, p) * Math.PI);
      if (this.meleeStyle === 'slash') {
        const sweep = p < 0.2 ? -1.3 - (p / 0.2) * 0.2 : -1.5 + ((p - 0.2) / 0.8) * 3.0;
        this.weaponAnchor.rotation.set(-0.15 * ease, sweep, 0);
        this.weaponAnchor.position.set(-Math.sin(sweep) * 0.25, 1.05, 0.28 + ease * 0.3);
      } else {
        const pitch = p < 0.45 ? -(p / 0.45) * 1.6 : -1.6 + ((p - 0.45) / 0.55) * 2.3;
        this.weaponAnchor.rotation.set(pitch, 0, 0);
        this.weaponAnchor.position.set(0, 1.05 + Math.max(0, -pitch) * 0.2, 0.28 + ease * 0.25);
      }
    } else if (WEAPONS[this.activeWeapon].melee) {
      // Idle carry pose for blades / hammers
      this.weaponAnchor.rotation.set(WEAPONS[this.activeWeapon].melee!.style === 'slam' ? -0.9 : -0.5, 0.35, 0);
    }

    // High-contrast overhead blue circular cooldown gauge for manual weapons (shotgun, railgun, rocket)
    const weapon = WEAPONS[this.activeWeapon];
    if (isManualWeapon(this.activeWeapon) && this.fireCooldown > 0.005) {
      this.overheadReloadGroup.visible = true;
      this.overheadReloadGroup.position.set(this.playerX, 3.25, this.playerZ);
      this.overheadReloadGroup.quaternion.copy(this.camera.quaternion);
      const ratio = Math.max(0, Math.min(1, this.fireCooldown / weapon.fireInterval));
      const activeCount = Math.ceil(ratio * this.reloadArcSegments.length);
      for (let i = 0; i < this.reloadArcSegments.length; i++) {
        this.reloadArcSegments[i].visible = i < activeCount;
      }
    } else {
      this.overheadReloadGroup.visible = false;
    }
  }

  private updatePlaying(dt: number) {
    if (this.cutsceneMode === 'intro') {
      this.mouseJustPressed = false;
      if (!this.intro || this.intro.update(dt, this.realDt)) this.finishIntro();
      return;
    }
    if (this.cutsceneMode === 'boss_intro') {
      this.mouseJustPressed = false;
      this.updateBossIntro(dt);
      return;
    }
    if (this.cutsceneMode === 'boss_death') {
      this.mouseJustPressed = false;
      this.updateBossDeath(dt);
      return;
    }
    if (this.cutsceneMode === 'boss2_intro') {
      this.mouseJustPressed = false;
      this.updateBoss2Intro(dt);
      return;
    }
    if (this.cutsceneMode === 'boss2_death') {
      this.mouseJustPressed = false;
      this.updateBoss2Death(dt);
      return;
    }
    if (this.cutsceneMode === 'rewrite') {
      this.mouseJustPressed = false;
      this.updateRewrite();
      return;
    }
    if (this.cutsceneMode === 'aero_intro') {
      this.mouseJustPressed = false;
      this.updateAeroIntro(dt);
      return;
    }
    if (this.cutsceneMode !== 'none') {
      this.mouseJustPressed = false;
      this.updateGateCutscene(dt);
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCameraFollow(dt);
      return;
    }

    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.damageBlinkTimer = Math.max(0, this.damageBlinkTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 1.4);

    // Melee hits land after the weapon's wind-up
    if (this.pendingMelee) {
      this.pendingMelee.timer -= dt;
      if (this.pendingMelee.timer <= 0) {
        const w = this.pendingMelee.weapon;
        this.pendingMelee = null;
        this.resolveMeleeHit(w);
      }
    }
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);

    // VM items: Firewall recharging, Volatile death blasts (queued so chains don't recurse)
    if (this.upgrades.has('firewall') && !this.firewallReady) {
      this.firewallTimer -= dt;
      if (this.firewallTimer <= 0) {
        this.firewallReady = true;
        this.pickupBanner = 'FIREWALL ATIVO';
        this.pickupBannerTimer = 1.2;
        synthAudio.playParry(1);
      }
    }
    if (this.pendingBlasts.length > 0) {
      const blasts = this.pendingBlasts.splice(0);
      synthAudio.playExplosion();
      for (const b of blasts) {
        this.spawnParticles(b.x, 0.8, b.z, 16, 0xff8a2b, 9, 0.35);
        this.fx.puff(b.x, 0.6, b.z, 0.7, 0x3a3836);
        for (const o of this.enemies) {
          if (o.state === 'ko' || o.archetype === 'boss') continue;
          if (Math.hypot(o.x - b.x, o.z - b.z) <= 2.4 + o.radius) this.damageEnemy(o, 35, o.x - b.x, o.z - b.z);
        }
      }
    }

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
        synthAudio.setComboIntensity(0);
      }
    }

    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) this.waveBanner = null;
    }

    if (this.pickupBannerTimer > 0) {
      this.pickupBannerTimer -= dt;
      if (this.pickupBannerTimer <= 0) this.pickupBanner = null;
    }

    if (this.unlockBannerTimer > 0) {
      this.unlockBannerTimer -= dt;
      if (this.unlockBannerTimer <= 0) this.newlyUnlockedSkin = null;
    }

    // Passive weapon heat cooling & reload/vent flash decay
    const activeW = WEAPONS[this.activeWeapon];
    const wasOverheated = this.weaponHeatState.overheated;
    const wasFlashing = this.weaponHeatState.reloadFlashTimer > 0;
    if (this.weaponHeatState.heat > 0 || wasOverheated || wasFlashing) {
      this.weaponHeatState = stepWeaponHeat(
        this.weaponHeatState,
        dt,
        activeW.coolRate,
        false,
        activeW.heatPerShot,
        activeW.overheatDuration,
        this.activeWeapon === 'pistol'
      );
      if (
        (wasOverheated && !this.weaponHeatState.overheated) ||
        (wasFlashing && this.weaponHeatState.reloadFlashTimer <= 0)
      ) {
        this.emitHud();
      }
    }

    // Pulse Exit Portal rings (East on Horizontal Road, North on Desert/Cemetery/Clearing, Left/Right Stairs on Tree)
    const portalPulse = this.portalOpen ? 1.0 + Math.sin(this.elapsedSec * 7.5) * 0.14 : 0.85;
    const portalOpacity = this.portalOpen ? 0.92 : 0.25;
    if (this.zone === 'road' && this.eastRoadPortalRing) {
      this.eastRoadPortalRing.scale.setScalar(portalPulse);
      (this.eastRoadPortalRing.material as THREE.MeshBasicMaterial).opacity = portalOpacity;
    } else if (this.zone !== 'tree' && this.northPortalRing) {
      this.northPortalRing.scale.setScalar(portalPulse);
      (this.northPortalRing.material as THREE.MeshBasicMaterial).opacity = portalOpacity;
    } else if (this.zone === 'tree') {
      this.treeLeftPortalRing.scale.setScalar(portalPulse);
      this.treeRightPortalRing.scale.setScalar(portalPulse);
      (this.treeLeftPortalRing.material as THREE.MeshBasicMaterial).opacity = portalOpacity;
      (this.treeRightPortalRing.material as THREE.MeshBasicMaterial).opacity = portalOpacity;
    }

    // 1. Player Movement (WASD / Arrows + Touch Stick)
    let moveX = this.touchMoveX;
    let moveZ = this.touchMoveZ;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    if (this.fallTimer > 0) {
      moveX = 0;
      moveZ = 0;
    }
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    if (this.dashTimer > 0) {
      this.ghostEmit -= dt;
      if (this.ghostEmit <= 0) {
        this.ghostEmit = 0.035;
        this.spawnGhost();
      }
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.playerX += this.dashDirX * DASH_SPEED * dt;
      this.playerZ += this.dashDirZ * DASH_SPEED * dt;
      if (Math.random() < 0.7) {
        this.spawnParticles(this.playerX, 0.35, this.playerZ, 1, 0x22e3d4, 2.5, 0.22);
      }
      // Blade Dash: cuts every enemy you pass through (once per dash)
      if (this.upgrades.has('bladeDash')) {
        for (const e of this.enemies) {
          if (e.state === 'ko' || this.dashHits.has(e.id)) continue;
          if (Math.hypot(e.x - this.playerX, e.z - this.playerZ) <= e.radius + 1.0) {
            this.dashHits.add(e.id);
            this.damageEnemy(e, e.archetype === 'boss' ? 25 : 45, this.dashDirX, this.dashDirZ);
            this.spawnParticles(e.x, 1.1, e.z, 8, 0xeceae4, 8, 0.2);
          }
        }
      }
    } else if (moveLen > 0.05) {
      this.playerX += moveX * PLAYER_SPEED * dt;
      this.playerZ += moveZ * PLAYER_SPEED * dt;
      this.walkPhase += moveLen * PLAYER_SPEED * dt * 1.4;
    }

    // Extra solid blockers: the clearing's wooden barricade, and the Mustang parked on the road
    const extraBlockers: { x: number; z: number; halfW: number; halfD: number }[] = [];
    if (this.zone === 'clearing' && this.barricadeHp > 0) {
      extraBlockers.push({ x: 0, z: -18.5, halfW: 6.0, halfD: 0.95 });
    }
    if (this.zone === 'road' && this.parkedCar) {
      extraBlockers.push(INTRO_PARKED_CAR);
    }
    const collisionObstacles = extraBlockers.length > 0 ? [...this.obstacles, ...extraBlockers] : this.obstacles;

    const resolved =
      this.inVmSpace && this.vmSpace
        ? this.vmSpace.clamp(this.playerX, this.playerZ, PLAYER_RADIUS)
        : resolveCircleObstacleCollision(this.playerX, this.playerZ, PLAYER_RADIUS, collisionObstacles, ARENA_RADIUS);
    this.playerX = resolved.x;
    this.playerZ = resolved.z;
    this.updatePlayerHazards(dt);

    // 2. Player Aiming (Touch Right Stick OR Mouse World Raycast)
    const touchAimLen = Math.hypot(this.touchAimX, this.touchAimZ);
    if (touchAimLen > 0.15) {
      this.playerYaw = Math.atan2(this.touchAimX, this.touchAimZ);
      this.aimReticleMesh.visible = true;
      this.aimReticleMesh.position.set(
        this.playerX + (this.touchAimX / touchAimLen) * 5.2,
        0.04,
        this.playerZ + (this.touchAimZ / touchAimLen) * 5.2
      );
    } else if (this.hasMouseMoved) {
      const hitPoint = this.screenToWorld(this.mouseClientX, this.mouseClientY);
      if (hitPoint) {
        const dx = hitPoint.x - this.playerX;
        const dz = hitPoint.z - this.playerZ;
        if (dx * dx + dz * dz > 0.01) {
          this.playerYaw = Math.atan2(dx, dz);
        }
        // With a mouse the cursor itself is the crosshair — no second reticle on the ground
        this.aimReticleMesh.visible = false;
      }
    } else if (moveLen > 0.1) {
      this.playerYaw = Math.atan2(moveX, moveZ);
      this.aimReticleMesh.visible = false;
    }

    // Update hero transform, per-weapon kick animations & overhead blue reload circle
    const bobY = this.dashTimer > 0 ? -0.06 : Math.abs(Math.sin(this.walkPhase)) * 0.1;
    this.heroRoot.position.set(this.playerX, bobY, this.playerZ);
    this.heroRoot.rotation.y = this.playerYaw;
    this.heroRoot.scale.set(
      this.dashTimer > 0 ? 0.88 : 1,
      this.dashTimer > 0 ? 1.12 : 1,
      this.dashTimer > 0 ? 1.15 : 1
    );
    this.emitSkinAura(dt);
    if (this.fallTimer > 0) {
      // Tumbling down into the pit
      const k = Math.max(0, this.fallTimer / 0.55);
      this.heroRoot.scale.multiplyScalar(0.25 + k * 0.75);
      this.heroRoot.position.y = -(1 - k) * 2.2;
      this.heroRoot.rotation.y += (1 - k) * 6;
    }
    this.updateWeaponAnimation(dt);
    this.heroShadow.position.set(this.playerX, 0.02, this.playerZ);

    // Blink hero briefly only when taking damage (stay solid during spawn/portal grace invulnerability)
    if (this.heroModel) {
      this.heroModel.visible =
        this.damageBlinkTimer <= 0 || Math.floor(this.damageBlinkTimer * 22) % 2 === 0;
    }

    // Inside VM's white space: no combat, no waves — walk, talk, buy, leave through the black door
    if (this.inVmSpace && this.vmSpace) {
      this.mouseJustPressed = false;
      const space = this.vmSpace;
      const nearVm = Math.hypot(this.playerX - space.vmPos.x, this.playerZ - space.vmPos.z) < 3.8;
      if (nearVm !== this.vmPrompt) {
        this.vmPrompt = nearVm;
        this.emitHud();
      }
      if (Math.hypot(this.playerX - space.exitPos.x, this.playerZ - space.exitPos.z) < 1.3) {
        this.exitVmSpace();
        return;
      }
      this.updateCameraFollow(dt);
      this.hudSyncTimer += dt;
      if (this.hudSyncTimer >= 0.08) {
        this.hudSyncTimer = 0;
        this.emitHud();
      }
      return;
    }

    // 3. Weapon Firing (Manual trigger for Shotgun / Railgun / Rocket; Hold-to-fire for Pistols & Plasma)
    if (this.activeWeapon === 'juiz') {
      this.updateJuizTrigger(dt);
    } else {
      this.juizHold = -1;
      this.juizBurst = 0;
      this.juizLoaded = 0;
      if (this.juizDrum) this.juizDrum.sprite.visible = false;
      const manualGun = isManualWeapon(this.activeWeapon);
      const wantsFire = manualGun
        ? this.mouseJustPressed || (this.touchFiring && this.fireCooldown <= 0)
        : this.mouseDown || this.touchFiring;
      this.mouseJustPressed = false;
      if (wantsFire && this.fireCooldown <= 0) {
        this.firePlayerWeapon();
      }
    }
    this.updateRmrfBeams(dt);

    // 4. Wave Spawner, Sector Exit Portals & Arena Weapon Drops
    this.updateWaves(dt);
    if (this.portalOpen && this.portalCooldown <= 0) {
      if (this.zone === 'road' && this.playerX > 21.8 && Math.abs(this.playerZ) < 5.5) {
        this.advanceNorthPortal(null);
        return;
      }
      if (
        (this.zone === 'desert' || this.zone === 'cemetery' || this.zone === 'clearing') &&
        Math.abs(this.playerX) < 4.5 &&
        this.playerZ < -22.2
      ) {
        this.advanceNorthPortal(null);
        return;
      }
      // On VM floors the stairs are gone: the only way down is through his room
      if (this.zone === 'tree' && !this.vmDoor && this.playerZ < -21.5 && Math.abs(this.playerX) < 4.0) {
        this.advanceNorthPortal('0');
        return;
      }
    }

    this.arenaWeaponSpawnTimer -= dt;
    if (this.arenaWeaponSpawnTimer <= 0 && !this.portalOpen) {
      this.arenaWeaponSpawnTimer = 22.0;
      const activeWeaponPickups = this.pickups.filter((pk) => pk.kind !== 'med' && pk.kind !== 'ammo').length;
      if (activeWeaponPickups < 2) {
        this.spawnArenaWeaponPickup();
      }
    }

    // 5. Enemies, Projectiles, Mortars, Pickups
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateItems(dt);
    this.updateGhosts(dt);
    this.updateChest(dt);
    this.updateHarpoon(dt);
    this.updatePinnedCorpses(dt);
    this.updateMortars(dt);
    this.updatePickups(dt);
    this.coins.update(dt, this.elapsedSec, this.playerX, this.playerZ, this.upgrades.has('magnet') ? 4.4 : 2.5, this.onCoinCollected);
    if (this.coinHudDirty) {
      this.coinHudDirty = false;
      this.emitHud();
    }

    // Poison mist: the meter fills inside a cloud, drains outside, and only hurts when it fills up
    if (this.poisonClouds.contains(this.playerX, this.playerZ)) {
      this.poison = Math.min(1, this.poison + dt / 1.5);
    } else {
      this.poison = Math.max(0, this.poison - dt / 3.2);
    }
    if (this.poison >= 1 && this.invulnTimer <= 0 && this.dashTimer <= 0) {
      this.damagePlayer(1, 0, 0);
      this.poison = 0.35;
      this.spawnParticles(this.playerX, 1.0, this.playerZ, 12, 0xb04dff, 6, 0.35);
    }

    // VM's shutter is open: walking into the doorway crosses over into the white
    if (
      this.vmDoor?.isOpen &&
      Math.hypot(this.playerX - this.vmDoor.threshold.x, this.playerZ - this.vmDoor.threshold.z) < 1.7
    ) {
      this.enterVmSpace();
      return;
    }

    // 6. Camera follow
    this.updateCameraFollow(dt);

    // 7. Throttled HUD sync (~12 Hz)
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  /** Starts last-kill slow-motion focused between the player and the final victim. */
  private startSlowMo(x: number, z: number, duration: number) {
    this.slowmoTimer = duration;
    this.slowmoDuration = duration;
    this.slowmoFocusX = x;
    this.slowmoFocusZ = z;
    this.timeScale = SLOWMO_SCALE;
    this.trauma = Math.max(this.trauma, 0.6);
    synthAudio.setSlowMo(true);
    synthAudio.playSlowMoImpact();
  }

  private cancelSlowMo() {
    if (this.slowmoTimer <= 0 && this.timeScale === 1) return;
    this.slowmoTimer = 0;
    this.timeScale = 1;
    this.slowmoZoom = 0;
    synthAudio.setSlowMo(false);
  }

  /** Advances slow-motion in real time: hold at 20% speed, then ease back; camera zooms in and out. */
  private updateSlowMo(realDt: number) {
    if (this.slowmoTimer <= 0) return;
    if (this.phase !== 'playing') {
      if (this.phase !== 'paused') this.cancelSlowMo();
      return;
    }
    this.slowmoTimer = Math.max(0, this.slowmoTimer - realDt);
    const u = 1 - this.slowmoTimer / this.slowmoDuration;
    this.timeScale = u < 0.68 ? SLOWMO_SCALE : SLOWMO_SCALE + ((u - 0.68) / 0.32) * (1 - SLOWMO_SCALE);
    this.slowmoZoom = u < 0.12 ? u / 0.12 : u > 0.68 ? Math.max(0, 1 - (u - 0.68) / 0.32) : 1;
    if (this.slowmoTimer <= 0) this.cancelSlowMo();
  }

  private updateCameraFollow(_dt: number) {
    // Camera eases in real time so the slow-mo zoom stays snappy while the world crawls
    const dt = this.realDt;
    const zoom = this.slowmoZoom;
    const aimOffsetX = Math.sin(this.playerYaw) * 2.2 * (1 - zoom);
    const aimOffsetZ = Math.cos(this.playerYaw) * 2.2 * (1 - zoom);
    const focusX = this.playerX + (this.slowmoFocusX - this.playerX) * 0.5 * zoom;
    const focusZ = this.playerZ + (this.slowmoFocusZ - this.playerZ) * 0.5 * zoom;
    const desiredX = focusX + aimOffsetX;
    const desiredY = 20.5 - zoom * 8;
    const desiredZ = focusZ + 14.5 - zoom * 6 + aimOffsetZ * 0.45;

    const damp = 1 - Math.exp(-(8.5 + zoom * 4) * dt);
    this.camPosX += (desiredX - this.camPosX) * damp;
    this.camPosY += (desiredY - this.camPosY) * damp;
    this.camPosZ += (desiredZ - this.camPosZ) * damp;

    const shakeMag = this.trauma * this.trauma * 1.48;
    const sx = (Math.random() * 2 - 1) * shakeMag;
    const sy = (Math.random() * 2 - 1) * shakeMag * 0.85;
    const sz = (Math.random() * 2 - 1) * shakeMag * 0.72;

    this.camera.position.set(this.camPosX + sx, this.camPosY + sy, this.camPosZ + sz);
    this.camera.lookAt(
      focusX + aimOffsetX * 0.35 + sx * 0.42,
      0.8 + sy * 0.2,
      focusZ + aimOffsetZ * 0.35 + sz * 0.42
    );
    this.camera.rotation.z += (Math.random() * 2 - 1) * shakeMag * 0.058;
  }

  private firePlayerWeapon(fan = 0) {
    if (this.weaponHeatState.overheated) return;
    const weapon = WEAPONS[this.activeWeapon];
    if (this.ammo[this.activeWeapon] <= 0) {
      this.switchWeapon('pistol');
      return;
    }
    // rm -rf is paid for in integrity: it won't run on your last point
    if (this.activeWeapon === 'rmrf' && this.playerHp <= 1) {
      this.pickupBanner = 'rm -rf: INTEGRIDADE INSUFICIENTE';
      this.pickupBannerTimer = 1.4;
      this.fireCooldown = 0.5;
      synthAudio.playAlert();
      return;
    }

    // Melee durability is only spent when the swing actually lands (see resolveMeleeHit)
    if (Number.isFinite(this.ammo[this.activeWeapon]) && !weapon.melee) {
      this.ammo[this.activeWeapon] -= fan > 0 ? Math.min(fan, this.ammo[this.activeWeapon]) : 1;
    }

    this.fireCooldown = weapon.fireInterval;

    // Melee weapons swing instead of firing; "ammo" is durability
    if (weapon.melee) {
      this.startMeleeSwing(this.activeWeapon);
      this.emitHud();
      return;
    }

    this.recoilOffset = 1.0;
    this.weaponKickDuration =
      this.activeWeapon === 'rmrf'
        ? 0.9
        : this.activeWeapon === 'coice'
          ? 0.42
          : this.activeWeapon === 'juiz'
            ? 0.2
            : this.activeWeapon === 'railgun'
        ? 0.78
        : this.activeWeapon === 'rocket' || this.activeWeapon === 'forkbomb'
          ? 0.72
          : this.activeWeapon === 'harpoon'
            ? 0.5
          : this.activeWeapon === 'shotgun'
            ? 0.56
            : this.activeWeapon === 'pistol'
              ? 0.18
              : this.activeWeapon === 'pistols'
                ? 0.14
                : 0.11;
    this.weaponKickTimer = this.weaponKickDuration;
    this.barrelToggle *= -1;
    const shakeProfile =
      this.activeWeapon === 'nailgun'
        ? { trauma: 0, cameraKick: 0, hitstopSec: 0 } // rapid fire: no screen shake at all
        : computeWeaponScreenshake(weapon, 'fire');
    this.trauma = Math.min(1, this.trauma + shakeProfile.trauma);

    const sideOffset = this.activeWeapon === 'pistols' ? this.barrelToggle * 0.42 : 0.25;
    const perpX = Math.cos(this.playerYaw) * sideOffset;
    const perpZ = -Math.sin(this.playerYaw) * sideOffset;
    const forwardX = Math.sin(this.playerYaw);
    const forwardZ = Math.cos(this.playerYaw);
    if (shakeProfile.cameraKick > 0) {
      this.camPosX -= forwardX * shakeProfile.cameraKick;
      this.camPosZ -= forwardZ * shakeProfile.cameraKick;
    }
    if (shakeProfile.hitstopSec > 0 && this.activeWeapon !== 'railgun') {
      this.hitstopTimer = Math.max(this.hitstopTimer, shakeProfile.hitstopSec);
    }
    const spawnX = this.playerX + forwardX * 0.95 + perpX;
    const spawnZ = this.playerZ + forwardZ * 0.95 + perpZ;

    if (this.activeWeapon === 'railgun') {
      // Sniper Hitscan Railgun + White Trail Beam to Target
      this.fireRailgunHitscan(spawnX, spawnZ, forwardX, forwardZ, weapon.damage);
      this.hitstopTimer = Math.max(this.hitstopTimer, shakeProfile.hitstopSec);
    } else if (this.activeWeapon === 'rmrf') {
      this.playerHp = Math.max(1, this.playerHp - 1);
      this.damageBlinkTimer = 0.5;
      this.fireRmRf(forwardX, forwardZ);
    } else if (this.activeWeapon === 'dinamite') {
      this.throwDynamite(weapon.damage, weapon.splashRadius);
    } else if (this.activeWeapon === 'macarico') {
      this.fireFlame(spawnX, spawnZ, forwardX, forwardZ, weapon.damage);
    } else if (this.activeWeapon === 'corrente') {
      this.fireChainLightning(spawnX, spawnZ, forwardX, forwardZ, weapon.damage);
    } else {
      const isFaces = this.activeWeapon === 'faces';
      const count = isFaces ? 2 : weapon.pellets;
      for (let pIdx = 0; pIdx < count; pIdx++) {
        let spreadAngle =
          count > 1
            ? (pIdx / (count - 1) - 0.5) * weapon.spread + (Math.random() - 0.5) * 0.08
            : (Math.random() - 0.5) * weapon.spread;
        if (isFaces) {
          // Two arms twisting around the aim line: a spiral of faces
          const s = Math.sin(this.facesSpin) * 0.55;
          spreadAngle = pIdx === 0 ? s : -s;
        }
        const shotYaw = this.playerYaw + spreadAngle;
        const dirX = Math.sin(shotYaw);
        const dirZ = Math.cos(shotYaw);

        const shot = this.spawnProjectile(
          true,
          this.activeWeapon,
          spawnX,
          1.12,
          spawnZ,
          dirX * weapon.projectileSpeed,
          dirZ * weapon.projectileSpeed,
          weapon.damage,
          weapon.splashRadius,
          weapon.projectileColor,
          weapon.piercing
        );
        if (this.activeWeapon === 'harpoon' && shot) {
          this.harpoonProj = shot; // the line pays out behind it
          this.harpoonPull = null;
        }
        if (isFaces && shot) shot.colorHex = (Math.floor(this.facesSpin * 2) + pIdx) % 2 ? 0xff1e3c : 0xffffff;
      }
      if (isFaces) this.facesSpin += 0.62;
      if (this.activeWeapon === 'coice') {
        // The kick throws you backwards — a free, aimable dash out of trouble
        this.dashDirX = -forwardX;
        this.dashDirZ = -forwardZ;
        this.dashTimer = 0.17;
        this.dashHits.clear();
        this.invulnTimer = Math.max(this.invulnTimer, 0.12);
        this.trauma = Math.min(1, this.trauma + 0.25);
        this.coiceShells -= 1;
        if (this.coiceShells <= 0) {
          this.coiceShells = 2;
          this.fireCooldown = 1.0; // break open, two shells in, snap shut
          synthAudio.playWeaponPickup('shotgun', 'reload');
        }
      }
      // Double Tap: sometimes a free extra shot, slightly off-angle
      if (this.upgrades.has('doubleTap') && Math.random() < 0.25) {
        const extraYaw = this.playerYaw + (Math.random() - 0.5) * 0.18;
        this.spawnProjectile(
          true,
          this.activeWeapon,
          spawnX,
          1.12,
          spawnZ,
          Math.sin(extraYaw) * weapon.projectileSpeed,
          Math.cos(extraYaw) * weapon.projectileSpeed,
          weapon.damage,
          weapon.splashRadius,
          weapon.projectileColor,
          weapon.piercing
        );
      }
    }

    this.muzzleLight.position.set(spawnX, 1.35, spawnZ);
    this.muzzleLight.color.setHex(this.activeWeapon === 'railgun' ? 0xffffff : weapon.projectileColor);
    this.muzzleLight.intensity = this.activeWeapon === 'railgun' ? 11 : this.activeWeapon === 'shotgun' || this.activeWeapon === 'rocket' ? 8 : 6;
    this.fx.muzzleFlash(spawnX + forwardX * 0.15, 1.12, spawnZ + forwardZ * 0.15, this.playerYaw, this.activeWeapon);
    this.fx.ejectCasing(this.playerX + forwardX * 0.45, 1.05, this.playerZ + forwardZ * 0.45, this.playerYaw, this.activeWeapon);
    this.spawnParticles(
      spawnX,
      1.12,
      spawnZ,
      this.activeWeapon === 'railgun' ? 12 : 5,
      this.activeWeapon === 'railgun' ? 0xffffff : weapon.projectileColor,
      this.activeWeapon === 'railgun' ? 9.5 : 6.5,
      0.22
    );
    synthAudio.playShoot(this.activeWeapon);

    const prevOverheated = this.weaponHeatState.overheated;
    this.weaponHeatState = stepWeaponHeat(
      this.weaponHeatState,
      0,
      weapon.coolRate,
      true,
      weapon.heatPerShot * (this.upgrades.has('heatsink') ? 0.65 : 1),
      weapon.overheatDuration,
      this.activeWeapon === 'pistol'
    );
    if (!prevOverheated && this.weaponHeatState.overheated) {
      synthAudio.playVentHeat();
      this.spawnParticles(spawnX, 1.25, spawnZ, 12, 0x22e3d4, 7.5, 0.28);
      this.pickupBanner = `SUPERAQUECEU: ${weapon.shortName}`;
      this.pickupBannerTimer = 1.25;
    }

    const fallback = ensureUsableWeapon(this.ownedWeapons, this.activeWeapon, this.ammo);
    this.ownedWeapons = fallback.ownedWeapons;
    this.ammo = fallback.ammo;
    if (fallback.activeWeapon !== this.activeWeapon || fallback.restoredPistol) {
      this.switchWeapon(fallback.activeWeapon);
      if (fallback.restoredPistol) {
        this.pickupBanner = `RESERVA: ${WEAPONS.pistol.shortName}`;
        this.pickupBannerTimer = 1.8;
      }
    }
    this.emitHud();
  }

  /**
   * Revólver Juiz: hold to load the cylinder — a drum over your head fills chamber by chamber —
   * then let go and every loaded round goes out in a fast straight burst. The rounds ricochet.
   * A quick click is just one shot.
   */
  private updateJuizTrigger(dt: number) {
    const held = this.mouseDown || this.touchFiring;
    const pressed = this.mouseJustPressed || (this.touchFiring && this.juizHold < 0);
    this.mouseJustPressed = false;

    // Release burst in progress
    if (this.juizBurst > 0) {
      this.juizBurstTimer -= dt;
      if (this.juizBurstTimer <= 0) {
        this.juizBurstTimer = 0.055;
        this.juizBurst -= 1;
        this.juizLoaded = Math.max(0, this.juizLoaded - 1);
        this.weaponHeatState.overheated = false;
        this.firePlayerWeapon();
        if (this.juizBurst <= 0) {
          this.juizLoaded = 0;
          this.fireCooldown = 0.32;
        }
      }
      this.updateJuizDrum();
      return;
    }

    if (pressed && this.juizHold < 0 && this.fireCooldown <= 0 && this.ammo.juiz > 0) {
      this.juizHold = 0;
      this.juizLoaded = 1;
    }
    if (this.juizHold >= 0) {
      if (held) {
        this.juizHold += dt;
        const cap = Math.min(6, this.ammo.juiz);
        const want = Math.min(cap, 1 + Math.floor(this.juizHold / 0.17));
        if (want > this.juizLoaded) {
          this.juizLoaded = want;
          synthAudio.playCasingTink();
          if (want === cap) synthAudio.playWeaponPickup('pistol', 'equip'); // full: hammer clicks back
        }
      } else {
        // Let go: empty what's loaded
        this.juizHold = -1;
        this.juizBurst = this.juizLoaded;
        this.juizBurstTimer = 0;
        if (this.juizBurst > 1) this.trauma = Math.min(1, this.trauma + 0.2);
      }
    }
    this.updateJuizDrum();
  }

  /** The cylinder icon floating over the hero's head (only while loading / bursting). */
  private updateJuizDrum() {
    const show = this.activeWeapon === 'juiz' && (this.juizHold >= 0 || this.juizBurst > 0) && this.juizLoaded > 0;
    if (!this.juizDrum) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      sprite.scale.set(2.1, 2.1, 1);
      sprite.renderOrder = 30;
      this.scene.add(sprite);
      this.juizDrum = { sprite, ctx: c.getContext('2d')!, tex, shown: -1 };
    }
    const d = this.juizDrum;
    d.sprite.visible = show;
    if (!show) {
      d.shown = -1;
      return;
    }
    d.sprite.position.set(this.playerX, 3.9, this.playerZ);
    if (d.shown !== this.juizLoaded) {
      d.shown = this.juizLoaded;
      const ctx = d.ctx;
      ctx.clearRect(0, 0, 64, 64);
      // Drum body: black outline, gunmetal disc, brass rim
      ctx.fillStyle = '#050507';
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8ccd4';
      ctx.beginPath();
      ctx.arc(32, 32, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a7e88';
      ctx.beginPath();
      ctx.arc(32, 32, 7, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const x = 32 + Math.cos(a) * 16;
        const y = 32 + Math.sin(a) * 16;
        const loaded = i < this.juizLoaded;
        ctx.fillStyle = '#050507';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        if (loaded) {
          ctx.fillStyle = '#ffd23a';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff6c8';
          ctx.fillRect(x - 3, y - 4, 3, 3);
          ctx.fillStyle = '#ff2a1f';
          ctx.beginPath();
          ctx.arc(x + 1, y + 1, 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#1a1b20';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      d.tex.needsUpdate = true;
    }
    // A little pop each time a chamber clicks in
    d.sprite.scale.setScalar(2.1 + (this.juizHold >= 0 ? Math.max(0, 0.17 - (this.juizHold % 0.17)) * 1.2 : 0));
  }
  /**
   * rm -rf: deletes everything in a screen-wide lane — enemies, their bullets, props.
   * The boss isn't a file you can delete: he just takes a huge hit.
   */
  private fireRmRf(dirX: number, dirZ: number) {
    const sx = this.playerX;
    const sz = this.playerZ;
    const yaw = Math.atan2(dirX, dirZ);
    const len = this.rayToArenaEdge(sx, sz, yaw, 0) + 2;
    const HALF = 1.9;
    const inLane = (x: number, z: number, r: number) => {
      const rx = x - sx;
      const rz = z - sz;
      const t = rx * dirX + rz * dirZ;
      const perp = Math.abs(rx * dirZ - rz * dirX);
      return t > -0.6 && t < len && perp < HALF + r;
    };
    for (const e of [...this.enemies]) {
      if (e.state === 'ko' || e.husk || !inLane(e.x, e.z, e.radius)) continue;
      if (e.archetype === 'boss') this.damageEnemy(e, 700, dirX, dirZ);
      else this.damageEnemy(e, e.hp + 9999, dirX, dirZ);
      this.spawnParticles(e.x, 1.2, e.z, 18, 0xff2030, 10, 0.35);
      this.spawnParticles(e.x, 1.2, e.z, 10, 0xffffff, 8, 0.25);
    }
    for (const p of this.projectiles) {
      if (!p.active || p.fromPlayer || !inLane(p.x, p.z, 0.3)) continue;
      p.active = false;
      p.group.visible = false;
      this.spawnParticles(p.x, p.y, p.z, 2, 0xff2030, 3, 0.15);
    }
    for (let oi = this.obstacles.length - 1; oi >= 0; oi--) {
      const obs = this.obstacles[oi];
      if (!obs.destructible || !inLane(obs.x, obs.z, obs.radius)) continue;
      obs.hp = 0;
      if (obs.explosive) this.detonateCrate(oi);
      else this.destroySectorProp(oi);
    }
    // Lane particles: the floor itself is being erased
    for (let d = 1; d < len; d += 1.6) {
      this.spawnParticles(sx + dirX * d + (Math.random() - 0.5) * HALF * 2, 0.3, sz + dirZ * d, 2, Math.random() < 0.3 ? 0xffffff : 0xff2030, 4, 0.5);
    }
    // Beam: a wide red band on the floor, a white-hot slab, and scanline bars
    const g = new THREE.Group();
    const mat = (hex: number, o: number) =>
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, len).rotateX(-Math.PI / 2).translate(0, 0.07, len / 2), mat(0xff1020, 0.55));
    const slab = new THREE.Mesh(new THREE.BoxGeometry(HALF * 1.4, 2.6, len).translate(0, 1.3, len / 2), mat(0xff3040, 0.45));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, len).translate(0, 1.2, len / 2), mat(0xffffff, 0.95));
    g.add(band, slab, core);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2.2, 0.12, 0.5).translate(0, 0.2 + Math.random() * 2.4, 2 + Math.random() * (len - 4)), mat(0xffffff, 0.8));
      g.add(bar);
    }
    g.position.set(sx, 0, sz);
    g.rotation.y = yaw;
    this.scene.add(g);
    this.rmrfBeams.push({ mesh: g, life: 0.75, maxLife: 0.75 });
    this.trauma = 1;
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.12);
    this.pickupBanner = 'rm -rf: INTEGRIDADE −1';
    this.pickupBannerTimer = 1.4;
    synthAudio.playRmRf();
  }

  private updateRmrfBeams(dt: number) {
    for (let i = this.rmrfBeams.length - 1; i >= 0; i--) {
      const b = this.rmrfBeams[i];
      b.life -= dt;
      const k = Math.max(0, b.life / b.maxLife);
      // Snaps shut sideways, glitching
      b.mesh.scale.x = k * (0.85 + Math.random() * 0.3);
      b.mesh.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m.userData.base === undefined) m.userData.base = m.opacity;
        m.opacity = m.userData.base * k * (Math.random() < 0.15 ? 0.3 : 1);
      });
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
        this.rmrfBeams.splice(i, 1);
      }
    }
  }

  private fireRailgunHitscan(sx: number, sz: number, dirX: number, dirZ: number, damage: number) {
    // Intersect ray with circular arena rim (|origin + t*dir|^2 = ARENA_RADIUS^2)
    const b = sx * dirX + sz * dirZ;
    const c = sx * sx + sz * sz - ARENA_RADIUS * ARENA_RADIUS;
    const disc = Math.max(0, b * b - c);
    let maxDist = Math.max(2, -b + Math.sqrt(disc));

    // Check Wooden Barricade in Clearing Stage (z = -18.5, |x| <= 5.9)
    let hitBarricade = false;
    if (this.zone === 'clearing' && this.barricadeHp > 0 && Math.abs(dirZ) > 0.001) {
      const tBar = (-18.5 - sz) / dirZ;
      if (tBar > 0 && tBar < maxDist) {
        const hitX = sx + dirX * tBar;
        if (Math.abs(hitX) <= 5.9) {
          maxDist = tBar;
          hitBarricade = true;
        }
      }
    }

    // Check obstacle intersections along ray (solid blocks beam; destructible shatters)
    const hitObsIndices: number[] = [];
    for (let oi = 0; oi < this.obstacles.length; oi++) {
      const obs = this.obstacles[oi];
      const ox = obs.x - sx;
      const oz = obs.z - sz;
      const proj = ox * dirX + oz * dirZ;
      if (proj < 0 || proj > maxDist) continue;
      const perpSq = ox * ox + oz * oz - proj * proj;
      const r = obs.radius * 0.92;
      if (perpSq <= r * r) {
        const hitT = Math.max(0.2, proj - Math.sqrt(Math.max(0, r * r - perpSq)));
        if (!obs.destructible) {
          if (hitT < maxDist) {
            maxDist = hitT;
            hitBarricade = false;
          }
        } else {
          hitObsIndices.push(oi);
        }
      }
    }

    const endX = sx + dirX * maxDist;
    const endZ = sz + dirZ * maxDist;

    // Damage destructible obstacles still within final clamped ray
    for (let i = hitObsIndices.length - 1; i >= 0; i--) {
      const oi = hitObsIndices[i];
      const obs = this.obstacles[oi];
      if (!obs) continue;
      const tObs = (obs.x - sx) * dirX + (obs.z - sz) * dirZ;
      if (tObs > maxDist + 0.5) continue;
      obs.hp -= damage;
      const chipColor =
        obs.kind === 'tombstone' ? 0x22e3d4 : obs.kind === 'datacache' ? 0x00f5ff : 0xff8424;
      this.spawnParticles(obs.x, 1.0, obs.z, 10, chipColor, 7, 0.28);
      if (obs.hp <= 0) {
        if (obs.explosive) this.detonateCrate(oi);
        else this.destroySectorProp(oi);
      }
    }

    if (hitBarricade) {
      this.damageBarricade(damage, endX, 1.5, endZ);
    }

    // Pierce ALL enemies intersected along the hitscan ray!
    const targets: { e: EnemyEntity; t: number }[] = [];
    for (const e of this.enemies) {
      if (e.state === 'ko') continue;
      if (segmentCircleIntersect(sx, sz, endX, endZ, e.x, e.z, e.radius + 0.55)) {
        const proj = (e.x - sx) * dirX + (e.z - sz) * dirZ;
        targets.push({ e, t: proj });
      }
    }
    targets.sort((a, b) => a.t - b.t);
    for (const item of targets) {
      this.damageEnemy(item.e, damage, dirX, dirZ);
      this.spawnParticles(item.e.x, 1.25, item.e.z, 16, 0xffffff, 11, 0.28);
      this.spawnParticles(item.e.x, 1.15, item.e.z, 10, 0xbcff2e, 9, 0.25);
    }

    if (targets.length > 0 || hitBarricade) {
      const impactShake = computeWeaponScreenshake(WEAPONS.railgun, 'impact');
      this.trauma = Math.min(1, this.trauma + impactShake.trauma);
      this.hitstopTimer = Math.max(this.hitstopTimer, impactShake.hitstopSec);
    }

    this.spawnParticles(endX, 1.15, endZ, 16, 0xffffff, 9.5, 0.26);
    this.spawnRailTrail(sx, 1.18, sz, endX, 1.18, endZ);
  }

  private spawnRailTrail(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    _vec3A.set(x1, y1, z1);
    _vec3B.set(x2, y2, z2);
    const len = Math.max(0.2, _vec3A.distanceTo(_vec3B));
    const mid = _vec3A.clone().add(_vec3B).multiplyScalar(0.5);
    const dir = _vec3B.clone().sub(_vec3A).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const coreGeo = new THREE.CylinderGeometry(0.11, 0.11, len, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(mid);
    core.quaternion.copy(quat);

    const glowGeo = new THREE.CylinderGeometry(0.28, 0.28, len, 6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(mid);
    glow.quaternion.copy(quat);

    this.scene.add(glow, core);
    this.railTrails.push({ core, glow, life: 0.32, maxLife: 0.32 });
  }

  private spawnProjectile(
    fromPlayer: boolean,
    weapon: WeaponId | 'enemy_bolt',
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
    damage: number,
    splashRadius: number,
    colorHex: number,
    piercing = false,
    noParry = false
  ): ProjectileEntity | null {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return null;

    slot.active = true;
    slot.fromPlayer = fromPlayer;
    slot.noParry = noParry;
    slot.forkGen = weapon === 'forkbomb' ? 0 : -1;
    slot.weapon = weapon;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vz = vz;
    slot.damage = damage;
    slot.splashRadius = splashRadius;
    slot.piercing = piercing;
    slot.piercedIds.clear();
    // Ricochet Rounds: player bullets (not explosives) bounce once
    slot.bounces = fromPlayer && splashRadius <= 0 && this.upgrades.has('ricochet') ? 1 : 0;
    if (fromPlayer && weapon === 'juiz') slot.bounces = Math.max(slot.bounces, 2); // the Judge's rounds ricochet
    if (fromPlayer && weapon === 'disco') slot.bounces = 4; // CDs skip off every wall
    // Special ammo that reshapes the bullet itself
    const bullet = fromPlayer && splashRadius <= 0 && weapon !== 'railgun' && weapon !== 'harpoon';
    slot.pinballs = bullet && !piercing && this.upgrades.has('pinball') ? 3 : 0;
    if (fromPlayer && this.upgrades.has('ghostAmmo')) slot.damage = Math.round(damage * 0.85);
    const fat = bullet && this.upgrades.has('fatAmmo');
    slot.group.scale.setScalar(fat ? 1.6 : 1);
    if (fat) {
      slot.vx *= 0.85;
      slot.vz *= 0.85;
    }
    slot.life =
      weapon === 'rocket'
        ? 1.85
        : weapon === 'railgun'
          ? 0.95
          : weapon === 'forkbomb'
            ? NeonMesaEngine.FORK_STEP // each process lives this long, then forks
            : weapon === 'harpoon'
              ? 0.85
              : weapon === 'nailgun'
                ? 0.8
                : weapon === 'coice'
                  ? 0.42 // sawn-off: brutal up close, nothing at range
                  : weapon === 'faces'
                    ? 1.6
                    : weapon === 'disco'
                      ? 2.4
                      : 1.35;
    slot.colorHex = colorHex;

    const coreMat = slot.coreMesh.material as THREE.MeshBasicMaterial;
    const haloMat = slot.haloMesh.material as THREE.MeshBasicMaterial;
    slot.group.position.set(x, y, z);
    slot.group.rotation.set(0, Math.atan2(vx, vz), 0);

    const hexShot = !fromPlayer && !!this.currentShooter?.hexed;
    if (hexShot) {
      slot.damage = damage * 2;
      slot.colorHex = 0xff1020;
      colorHex = 0xff1020;
    }
    if (!fromPlayer) {
      // High-contrast composite enemy shot: blinding white core + large vibrant spinning neon ring
      slot.coreMesh.geometry = this.enemyCoreGeo;
      coreMat.color.setHex(hexShot ? 0x14000a : 0xffffff);
      slot.coreMesh.rotation.set(0, 0, 0);
      slot.coreMesh.scale.setScalar(colorHex === 0xff1e8a ? 1.45 : 1.22);
      slot.haloMesh.visible = true;
      haloMat.color.setHex(colorHex);
      slot.haloMesh.scale.setScalar(colorHex === 0xff1e8a ? 1.42 : 1.18);
      slot.haloMesh.rotation.set(Math.PI / 2, 0, 0);
    } else {
      // Crisp tailored player ordnance (distinct per gun, lighter visual weight than enemy fire)
      slot.haloMesh.visible = weapon === 'plasma' || weapon === 'railgun';
      coreMat.color.setHex(colorHex);
      if (weapon === 'rocket') {
        slot.coreMesh.geometry = this.rocketGeo;
        slot.coreMesh.rotation.set(Math.PI / 2, 0, 0);
        slot.coreMesh.scale.setScalar(1.3);
      } else if (weapon === 'railgun') {
        slot.coreMesh.geometry = this.projectileGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.set(0.85, 0.85, 2.5);
        haloMat.color.setHex(0xffffff);
        slot.haloMesh.scale.setScalar(0.76);
        slot.haloMesh.rotation.set(0, 0, 0);
      } else if (weapon === 'plasma') {
        slot.coreMesh.geometry = this.plasmaBoltGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.setScalar(1.1);
        haloMat.color.setHex(0x22e3d4);
        slot.haloMesh.scale.setScalar(0.72);
        slot.haloMesh.rotation.set(0, 0, 0);
      } else if (weapon === 'faces') {
        // A little spinning white face plate in a red ring (his faces, thrown back at him)
        slot.coreMesh.geometry = this.enemyCoreGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.setScalar(0.95);
        slot.haloMesh.visible = true;
        haloMat.color.setHex(0xff1e3c);
        slot.haloMesh.scale.setScalar(0.85);
        slot.haloMesh.rotation.set(Math.PI / 2, 0, 0);
      } else if (weapon === 'disco') {
        // A flat spinning disc
        slot.coreMesh.geometry = this.discGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.setScalar(1);
        slot.haloMesh.visible = true;
        haloMat.color.setHex(0xff5ac8);
        slot.haloMesh.scale.setScalar(0.6);
        slot.haloMesh.rotation.set(Math.PI / 2, 0, 0);
      } else if (weapon === 'shotgun' || weapon === 'coice') {
        slot.coreMesh.geometry = this.projectileGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.set(0.7, 0.7, 0.72);
      } else if (weapon === 'nailgun') {
        // Thin steel nail
        slot.coreMesh.geometry = this.projectileGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.set(0.3, 0.3, 1.5);
      } else if (weapon === 'harpoon') {
        // Long barbed spear
        slot.coreMesh.geometry = this.rocketGeo;
        slot.coreMesh.rotation.set(Math.PI / 2, 0, 0);
        slot.coreMesh.scale.set(0.55, 2.4, 0.55);
      } else if (weapon === 'forkbomb') {
        // A glowing green process
        slot.coreMesh.geometry = this.plasmaBoltGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.setScalar(1.15);
        slot.haloMesh.visible = true;
        haloMat.color.setHex(0x4dff7a);
        slot.haloMesh.scale.setScalar(0.8);
        slot.haloMesh.rotation.set(0, 0, 0);
      } else {
        slot.coreMesh.geometry = this.projectileGeo;
        slot.coreMesh.rotation.set(0, 0, 0);
        slot.coreMesh.scale.set(0.78, 0.78, 1.05);
      }
    }
    slot.group.visible = true;
    return slot;
  }

  private updateWaves(dt: number) {
    // His second coming: the silent wait before he drops through the ceiling
    if (this.boss2Stage === 'lull') {
      this.updateBoss2Lull(dt);
      return;
    }

    // Stage 4 (Pé da Árvore): Controlled trickle of reinforcements while the 8-plank wooden barricade stands
    if (this.zone === 'clearing' && this.barricadeHp > 0 && this.waveQueue.length === 0 && this.enemies.length < this.waveMaxConcurrent) {
      const more = computeWaveComposition(this.wave, 'clearing').enemies;
      const pick = more[Math.floor(Math.random() * more.length)];
      if (pick) this.waveQueue.push(pick);
    }

    if (this.waveQueue.length > 0) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0 && this.enemies.length < this.waveMaxConcurrent) {
        const nextArch = this.waveQueue.shift()!;
        this.spawnEnemy(nextArch);
        if (this.flyersPending > 0 && Math.random() < 0.45) {
          this.flyersPending -= 1;
          this.spawnEnemy('tesla', { flying: true });
        }
        if (this.hexerPending && this.enemies.length >= 3) {
          this.hexerPending = false;
          this.spawnHexer();
        }
        const plan = computeWaveComposition(this.wave, this.zone);
        this.waveSpawnTimer = plan.spawnInterval;
      }
      return;
    }

    if (this.flyersPending > 0 && this.enemies.length < this.waveMaxConcurrent) {
      this.flyersPending -= 1;
      this.spawnEnemy('tesla', { flying: true });
      return;
    }

    if (this.enemies.length === 0 && !this.portalOpen && this.cutsceneMode === 'none') {
      // Room's clear: every coin left lying around flies home
      this.coins.magnetAll();
      this.rollRoomChest();
      // Third room after VM's: the opening round is down — the music dies and he's coming
      if (this.zone === 'tree' && isBossReturnWave(this.wave) && this.boss2Stage === 'none') {
        this.beginBoss2Lull();
        return;
      }

      // Stage 2 Desert: 3 consecutive rounds in place before opening Cemetery Iron Gate cutscene
      if (this.zone === 'desert' && this.wave < 4) {
        this.wave += 1;
        this.startWave(this.wave);
        return;
      }
      if (this.zone === 'desert' && this.wave === 4) {
        this.cutsceneMode = 'gate_open';
        this.cutsceneTimer = 0;
        this.cutsceneDuration = 2.0;
        this.cutsceneClangPlayed = false;
        this.cutsceneText = 'PORTÃO DO CEMITÉRIO DESTRANCADO';
        this.emitHud();
        return;
      }

      // Stage 3 Cemetery: 3 consecutive rounds in place (R2 emerges from circular graves, R3 rain & thunder)
      if (this.zone === 'cemetery' && this.wave < 7) {
        this.wave += 1;
        this.startWave(this.wave);
        return;
      }
      if (this.zone === 'cemetery' && this.wave === 7) {
        this.stormActive = false;
        this.rainInstanced.visible = false;
        this.lightningFlash = 0;
        this.applyZoneVisuals('cemetery');
      }

      this.portalOpen = true;
      synthAudio.playPortalOpen();
      this.waveBanner =
        this.zone === 'road'
          ? 'ESTRADA LIBERADA → SIGA PARA LESTE'
          : this.zone === 'cemetery'
            ? 'TEMPESTADE PASSOU ↑ VÁ AO PÉ DA ÁRVORE'
            : this.zone === 'clearing'
              ? 'ENTRADA ABERTA ↑ ENTRE NA ÁRVORE BINÁRIA'
              : 'ANDAR LIMPO';
      this.waveBannerTimer = 4.4;

      // VM's regular visit: every few floors a shutter in the wall opens onto the white
      if (this.zone === 'tree' && !this.vmDoor && this.floorsSinceVm >= VM_EVERY_FLOORS) {
        this.spawnVmDoor();
        this.vmDoor!.beginOpen();
        synthAudio.playShutterOpen(0.85);
        this.waveBanner = 'A ESCADA SUMIU · UMA PORTA BRANCA SE ABRIU';
      }
      this.emitHud();
    }
  }

  /** Builds VM's shutter in the arena wall (closed) and clears the towers behind it. */
  private spawnVmDoor() {
    if (this.vmDoor) return;
    this.vmDoor = new VmDoor(VM_DOOR_ANGLE, VM_DOOR_RADIUS);
    this.scene.add(this.vmDoor.group);
    this.setTowersNearVmHidden(true);
    // VM's door takes the stair gate's place at the top of the room
    if (this.treeLeftPortalRing.parent) this.treeLeftPortalRing.parent.visible = false;
    this.floorsSinceVm = 0;
    synthAudio.preloadVm();
  }

  /** Rolls VM's wares for this visit: 3 passives you don't own yet + a patch. */
  private rollVmOffer() {
    const pool = VM_ITEMS.filter((i) => i.once && !this.upgrades.has(i.id)).map((i) => i.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.vmOffer = [...pool.slice(0, this.upgrades.has('clover') ? 4 : 3), 'patch'];
  }

  /** Crossing the doorway: white flash, and you're standing in VM's endless white space. */
  private enterVmSpace() {
    if (!this.vmSpace) {
      this.vmSpace = new VmSpace(VM_SPACE_ORIGIN);
      this.scene.add(this.vmSpace.group);
    }
    const space = this.vmSpace;
    this.rollVmOffer();
    space.setWares(this.vmOffer);
    space.group.visible = true;
    this.inVmSpace = true;
    this.vmPrompt = false;
    synthAudio.stopHuskFire(0.4); // the burning husk is left behind in the arena
    if (this.aero) synthAudio.stopAeroMusic(0.6);

    this.playerX = space.entry.x;
    this.playerZ = space.entry.z;
    this.playerYaw = Math.PI;
    this.heroRoot.position.set(this.playerX, 0, this.playerZ);
    this.camPosX = this.playerX;
    this.camPosY = 20.5;
    this.camPosZ = this.playerZ + 14.5;
    this.aimReticleMesh.visible = false;

    // Pure white world: white sky + fog, neutral light
    this.scene.background = new THREE.Color(0xffffff);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.006);
    this.keyLight.color.setHex(0xffffff);
    this.hemiLight.color.setHex(0xffffff);
    this.hemiLight.groundColor.setHex(0xd8dde4);
    this.keyBaseIntensity = 2.2;
    this.hemiBaseIntensity = 1.7;
    this.currentRimColorHex = 0xffffff;

    // See the lines run off into the far distance
    this.camera.far = 340;
    this.camera.updateProjectionMatrix();

    this.whiteFlash = 1;
    synthAudio.playVmMusic();
    synthAudio.preloadVm();
    this.emitHud();
  }

  /** Through VM's black door: straight down to the next floor. */
  private exitVmSpace() {
    this.camera.far = 160;
    this.camera.updateProjectionMatrix();
    this.inVmSpace = false;
    this.vmPrompt = false;
    if (this.vmSpace) this.vmSpace.group.visible = false;
    synthAudio.stopVmMusic(0.6);
    this.portalOpen = true;
    this.advanceNorthPortal('0');
  }

  private advanceNorthPortal(branch: TreeBranch | null) {
    // Cem Faces is gone for good: before the next floor, someone rewrites the world
    if (!this.aero && this.boss2Stage === 'dead') {
      this.beginRewrite(branch);
      return;
    }
    synthAudio.playTreeEnter();
    this.portalOpen = false;
    this.portalCooldown = 1.1;
    // Leaving the floor: VM's room and the boss husk stay behind; the soundtrack returns
    this.removeVmRoom();
    if (this.aero) synthAudio.playAeroMusic();
    else synthAudio.resumeMainMusic();

    this.wave += 1;
    const targetZone = getZoneForWave(this.wave);

    if (targetZone === 'tree') {
      if (branch === null) {
        this.treeDepth = 1;
        this.treePath = [];
        this.treeCyberRatio = 0.2;
      } else {
        this.treeDepth += 1;
        this.treePath.push(branch);
        this.treeCyberRatio = stepCyberBlend(this.treeCyberRatio, branch === '1' ? 'up' : 'down');
        this.floorsSinceVm += 1;
      }
    } else {
      this.treeDepth = 0;
      this.treePath = [];
    }

    // Coins still in the air are banked on the way out
    this.coins.collectAll((_t, v) => this.addCredits(v));
    // New room: wipe the previous sector's blood & brass, mist and poison
    this.fx.clear();
    this.returnFx.reset();
    this.teleportFx.reset();
    this.blastFx.reset();
    this.clearPinnedCorpses();
    this.poisonClouds.clear();
    this.poison = 0;
    this.cancelSlowMo();

    for (const p of this.projectiles) {
      p.active = false;
      p.group.visible = false;
    }
    while (this.mortars.length > 0) {
      const m = this.mortars.pop()!;
      this.scene.remove(m.ringMesh);
      this.scene.remove(m.shellMesh);
    }
    while (this.pickups.length > 0) this.removePickupAt(0);
    this.nearbyWeaponPrompt = null;

    if (targetZone === 'road' || targetZone === 'desert') {
      this.playerX = -16.5;
      this.playerZ = 0;
      this.playerYaw = Math.PI / 2;
    } else if (targetZone === 'clearing') {
      this.playerX = 0;
      this.playerZ = -3.5;
      this.playerYaw = Math.PI;
    } else {
      this.playerX = 0;
      this.playerZ = 18;
      this.playerYaw = Math.PI;
    }
    this.invulnTimer = 0.9;
    this.damageBlinkTimer = 0;
    if (this.heroModel) this.heroModel.visible = true;
    this.heroRoot.position.set(this.playerX, 0, this.playerZ);
    this.heroRoot.rotation.y = this.playerYaw;
    this.heroShadow.position.set(this.playerX, 0.02, this.playerZ);

    this.configureStageEntry(targetZone, true);
    this.applyZoneVisuals(targetZone);
    this.startWave(this.wave);
    this.camPosX = this.playerX;
    this.camPosY = 20.5;
    this.camPosZ = this.playerZ + 14.5;
    this.updateCameraFollow(1);
    this.ditherPass.render(this.renderer, this.scene, this.camera, this.elapsedSec, this.damageFlash);
    this.emitHud();
  }

  private configureStageEntry(targetZone: ArenaZone, triggerCutscenes: boolean) {
    this.stormActive = false;
    this.rainInstanced.visible = false;
    this.lightningFlash = 0;

    if (targetZone === 'desert') {
      this.desertGateClosed = true;
      if (triggerCutscenes) {
        this.desertGateBars.position.y = 5.8;
        this.cutsceneMode = 'gate_close';
        this.cutsceneTimer = 0;
        this.cutsceneDuration = 2.1;
        this.cutsceneClangPlayed = false;
        this.cutsceneText = 'PORTÃO DO CEMITÉRIO TRANCADO · VENÇA 3 ROUNDS';
      } else {
        this.desertGateBars.position.y = 0;
      }
    } else {
      this.desertGateClosed = false;
    }

    if (targetZone === 'clearing') {
      this.barricadeHp = BARRICADE_MAX_HP;
      this.barricadeFlashTimer = 0;
      this.treeBarricadeGroup.visible = true;
      for (const plank of this.barricadePlanks) {
        plank.visible = true;
      }
      if (triggerCutscenes) {
        this.cutsceneMode = 'barricade_intro';
        this.cutsceneTimer = 0;
        this.cutsceneDuration = 1.95;
        this.cutsceneClangPlayed = false;
        this.cutsceneText = 'ENTRADA TRANCADA · ATIRE PARA QUEBRAR AS 8 TÁBUAS';
      }
    } else {
      this.treeBarricadeGroup.visible = false;
    }
  }

  private startWave(waveNum: number) {
    const plan = computeWaveComposition(waveNum, this.zone);
    this.portalOpen = false;
    // After Cem Faces' second coming, every round brings a hexer
    this.hexerPending = waveNum > BOSS_RETURN_WAVE;
    this.waveQueue = [...plan.enemies];
    this.waveSpeedMult = plan.speedMultiplier;
    this.waveHpMult = plan.hpMultiplier;
    this.waveMaxConcurrent = plan.maxConcurrent;
    this.waveTokenCap = plan.attackTokenCap;
    this.waveSpawnTimer = 0.45;
    this.setupRoomLayout(waveNum);

    // Cemetery Round 3 (Wave 7): Heavy thunderstorm
    if (this.zone === 'cemetery' && waveNum === 7) {
      this.stormActive = true;
      this.rainInstanced.visible = true;
      this.lightningTimer = 1.6;
      synthAudio.playThunder();
    } else if (this.zone !== 'cemetery') {
      this.stormActive = false;
      this.rainInstanced.visible = false;
    }

    const vanguardCount =
      this.zone === 'clearing' ? Math.min(2, this.waveQueue.length) : Math.min(3, this.waveQueue.length);
    for (let s = 0; s < vanguardCount; s++) {
      const arch = this.waveQueue.shift();
      if (arch) this.spawnEnemy(arch);
    }

    const roundInfo = getSectorRoundInfo(waveNum);
    if (isBossWave(waveNum) && !isBossReturnWave(waveNum)) {
      this.waveBanner = `CHEFE · ${ENEMY_CONFIGS.boss.label}`;
      this.waveBannerTimer = 3.2;
      synthAudio.playBossAlert();
      this.spawnPickup(waveNum % 10 === 5 ? 'railgun' : 'rocket', 4.5, 6.5, 32);
      this.spawnArenaWeaponPickup();
    } else if (this.zone === 'tree' && this.aero) {
      this.waveBanner = `CAMPO AERO · SALA ${Math.max(1, waveNum - BOSS_RETURN_WAVE)}`;
      this.waveBannerTimer = 2.6;
    } else if (this.zone === 'tree') {
      this.waveBanner = `PROFUNDIDADE ${this.treeDepth} · ${ROOM_LAYOUTS[waveNum]?.name ?? 'INFERNO INDUSTRIAL'}`;
      this.waveBannerTimer = 2.6;
    } else if (this.zone === 'desert') {
      this.waveBanner = `SETOR 2 · DESERTO · ROUND ${roundInfo.round}/${roundInfo.totalRounds}`;
      this.waveBannerTimer = 2.6;
    } else if (this.zone === 'cemetery') {
      this.waveBanner =
        waveNum === 6
          ? 'CEMITÉRIO · ROUND 2/3 · MORTOS SAINDO DAS COVAS'
          : waveNum === 7
            ? 'CEMITÉRIO · ROUND 3/3 · TEMPESTADE DE TROVÕES'
            : `SETOR 3 · CEMITÉRIO · ROUND ${roundInfo.round}/${roundInfo.totalRounds}`;
      this.waveBannerTimer = 2.9;
    } else if (this.zone === 'clearing') {
      this.waveBanner = 'PÉ DA ÁRVORE · QUEBRE A BARRICADA DE MADEIRA';
      this.waveBannerTimer = 3.2;
    } else {
      this.waveBanner = 'SETOR 1 · ESTRADA · ONDA 1';
      this.waveBannerTimer = 2.5;
    }

    if (waveNum === 1) {
      this.arenaWeaponSpawnTimer = 7.5;
    } else {
      this.arenaWeaponSpawnTimer = 14.0;
      for (const wId of this.ownedWeapons) {
        if (wId === 'pistol') continue;
        const cap = WEAPONS[wId].maxAmmo;
        this.ammo[wId] = Math.min(cap, this.ammo[wId] + Math.max(2, Math.round(cap * 0.28)));
      }
    }

    this.checkProgressUnlocks();
    this.emitHud();
  }

  private spawnEnemy(archetype: EnemyArchetype, opts: { v2?: boolean; x?: number; z?: number; hexer?: boolean; flying?: boolean } = {}) {
    if (!this.assets) return;
    // Hard cap on the field: whatever would overflow waits its turn
    if (archetype !== 'boss' && !opts.hexer && this.enemies.filter((q) => q.state !== 'ko').length >= MAX_ENEMIES_ON_FIELD) {
      if (opts.flying) this.flyersPending += 1;
      else this.waveQueue.unshift(archetype);
      return;
    }
    const cfg = ENEMY_CONFIGS[archetype];
    const entityId = this.nextEntityId++;

    let x = 0;
    let z = 0;
    let emergeDuration = 0;
    let teleport = false;
    if (archetype === 'boss') {
      x = opts.x ?? 0;
      z = opts.z ?? 8.5;
    } else if (this.zone === 'cemetery' && this.wave === 6) {
      // Round 2: emerge directly from the circular graves surrounding the central stone path!
      const grave = CEMETERY_GRAVE_POSITIONS[(entityId + this.enemies.length) % CEMETERY_GRAVE_POSITIONS.length];
      x = grave.x + (Math.random() - 0.5) * 0.45;
      z = grave.z + (Math.random() - 0.5) * 0.45;
      emergeDuration = 0.9;
    } else {
      const spawnDist = ARENA_RADIUS - 2.4;
      // Never materialise over a chasm or in lava
      for (let tries = 0; tries < 60; tries++) {
        const angle = Math.random() * Math.PI * 2;
        x = opts.x ?? Math.cos(angle) * spawnDist;
        z = opts.z ?? Math.sin(angle) * spawnDist;
        if (opts.flying || !hazardAt(x, z, this.hazardDefs, -1.2)) break;
      }
      // Hazard rooms leave little floor near the wall: fall back to the walkway spine
      if (!opts.flying && hazardAt(x, z, this.hazardDefs, -1.2)) {
        for (let k = 0; k < 40; k++) {
          const tz = (k % 2 ? 1 : -1) * (27 - Math.floor(k / 2) * 1.3);
          if (!hazardAt(0, tz, this.hazardDefs, -1.2) && Math.hypot(this.playerX, this.playerZ - tz) > 8) {
            x = 0;
            z = tz;
            break;
          }
        }
      }
      emergeDuration = 0.8;
      teleport = true;
    }

    const mesh =
      this.aero && archetype !== 'boss' && !opts.hexer
        ? buildBlobEnemy(archetype, opts.flying)
        : opts.flying
          ? buildFlyerModel()
          : cloneModelWithUniqueMaterials(this.assets.enemies[archetype]);
    mesh.position.set(x, emergeDuration > 0 && !teleport ? -1.9 : 0, z);
    if (teleport) {
      mesh.scale.set(0.05, 1.8, 0.05);
      this.teleportFx.spawn(x, z, cfg.radius * 1.6, emergeDuration, archetype === 'juggernaut' ? 4.5 : 3.2);
      synthAudio.playTeleportIn();
    }
    this.scene.add(mesh);

    const shadow = this.createContactShadow(cfg.radius * 2.1);
    shadow.position.set(x, 0.02, z);
    if (emergeDuration > 0 && !teleport) {
      this.spawnParticles(x, 0.25, z, 12, 0x22e3d4, 6.0, 0.35);
      this.spawnParticles(x, 0.25, z, 10, 0x5c3c28, 5.5, 0.32);
    }
    this.scene.add(shadow);

    let telegraphLine: THREE.Mesh | undefined;
    if (
      archetype === 'ranger' ||
      archetype === 'charger' ||
      archetype === 'mantis' ||
      archetype === 'tesla' ||
      archetype === 'boss'
    ) {
      const lineWidth =
        archetype === 'boss'
          ? 2.1
          : archetype === 'charger' || archetype === 'mantis'
            ? 1.1
            : 0.16;
      const lineGeo = new THREE.PlaneGeometry(lineWidth, 1);
      lineGeo.rotateX(-Math.PI / 2);
      lineGeo.translate(0, 0, 0.5);
      const lineMat = new THREE.MeshBasicMaterial({
        color: cfg.accentColor,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      telegraphLine = new THREE.Mesh(lineGeo, lineMat);
      telegraphLine.position.set(x, 0.05, z);
      telegraphLine.visible = false;
      this.scene.add(telegraphLine);
    }

    let facesCarousel: THREE.Object3D | undefined;
    let prayerArms: THREE.Object3D | undefined;
    let dharmaHalo: THREE.Object3D | undefined;
    let spiderLegs: THREE.Object3D[] | undefined;
    let leapRingMesh: THREE.Mesh | undefined;

    if (archetype === 'boss') {
      facesCarousel = mesh.getObjectByName('faces_carousel') ?? undefined;
      prayerArms = mesh.getObjectByName('prayer_arms') ?? undefined;
      dharmaHalo = mesh.getObjectByName('dharma_halo_outer') ?? undefined;
      spiderLegs = [0, 1, 2, 3]
        .map((idx) => mesh.getObjectByName(`spider_leg_${idx}`))
        .filter((leg): leg is THREE.Object3D => Boolean(leg));

      const leapGeo = new THREE.RingGeometry(0.68, 1.0, 28);
      leapGeo.rotateX(-Math.PI / 2);
      const leapMat = new THREE.MeshBasicMaterial({
        color: 0xff1e3c,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      leapRingMesh = new THREE.Mesh(leapGeo, leapMat);
      leapRingMesh.position.set(x, 0.07, z);
      leapRingMesh.scale.setScalar(4.2);
      leapRingMesh.visible = false;
      this.scene.add(leapRingMesh);

      const bossKeyGlow = new THREE.PointLight(0xff445e, 6.5, 16);
      bossKeyGlow.position.set(0, 5.2, 3.2);
      mesh.add(bossKeyGlow);
    }

    const hpScale =
      archetype === 'boss'
        ? opts.v2
          ? 2.0 // second coming: battered, but meaner and tougher
          : 1 + (Math.floor(this.wave / 5) - 1) * 0.45
        : this.waveHpMult;
    const maxHp = Math.round(cfg.hp * hpScale);

    this.enemies.push({
      id: entityId,
      archetype,
      mesh,
      shadow,
      x,
      z,
      vx: 0,
      vz: 0,
      yaw: Math.atan2(this.playerX - x, this.playerZ - z),
      hp: maxHp,
      maxHp,
      radius: cfg.radius,
      speed: cfg.speed * this.waveSpeedMult,
      state: 'move',
      stateTimer: archetype === 'boss' ? 0.78 : 0.4 + Math.random() * 0.6,
      hitFlashTimer: 0,
      koTimer: 0,
      aimX: 0,
      aimZ: 1,
      strafeSign: Math.random() < 0.5 ? -1 : 1,
      walkPhase: Math.random() * 6,
      hasToken: false,
      bossPhase: 0,
      telegraphLine,
      facesCarousel,
      prayerArms,
      dharmaHalo,
      spiderLegs,
      leapRingMesh,
      leapActive: false,
      leapChainLeft: 0,
      barrageVolleysLeft: 0,
      barrageTimer: 0,
      enraged: false,
      bossLine: null,
      bossLineTimer: 0,
      hoverY: 0,
      emergeTimer: emergeDuration,
      emergeDuration,
      teleport,
      hexer: opts.hexer,
      flying: opts.flying,
    });

    this.markSeen(archetype === 'boss' ? (opts.v2 ? 'boss2' : 'boss') : opts.hexer ? 'hexer' : opts.flying ? 'flyer' : archetype);
    if (this.aero && archetype !== 'boss' && !opts.hexer) {
      this.markSeen('blob');
      this.markSeen(opts.flying ? 'blob_flyer' : 'blob_' + archetype);
    }

    // Cache the rig parts that the per-archetype animations drive
    const spawned = this.enemies[this.enemies.length - 1];
    const byPrefix = (p: string) => {
      const out: THREE.Object3D[] = [];
      mesh.traverse((o) => {
        if (o.name.startsWith(p)) out.push(o);
      });
      return out;
    };
    if (archetype === 'spider') spawned.parts = { legs: [...byPrefix('leg_upper'), ...byPrefix('leg_lower')] };
    else if (archetype === 'charger') spawned.parts = { pawLeg: mesh.getObjectByName('leg_r') ?? undefined };
    else if (archetype === 'spore') spawned.parts = { tentacles: byPrefix('tentacle') };
    else if (archetype === 'juggernaut') spawned.parts = { stacks: byPrefix('stack') };

    // Cem Faces opens with his own cutscene (turns around like a spider, then speaks);
    // his second coming is staged by the ceiling drop instead
    if (archetype === 'boss') {
      if (opts.v2) this.applyBoss2Damage(spawned);
      else this.beginBossIntro(spawned);
    }
  }

  private updateEnemies(dt: number) {
    let activeTokens = 0;
    for (const e of this.enemies) {
      if (e.hasToken && e.state !== 'ko') activeTokens++;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Hit flash recovery
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        if (e.hitFlashTimer === 0) {
          this.setGroupEmissiveFlash(e.mesh, false);
        }
      }

      if (e.state === 'ko') {
        if (e.husk) continue; // shut-down boss: owned by its cutscene

        // Dead spider: blinks red faster and faster while shaking, then detonates
        if (e.bombTimer !== undefined) {
          const prev = e.bombTimer;
          e.bombTimer -= dt;
          const u = 1 - Math.max(0, e.bombTimer) / 1.5;
          const blinkHz = 4 + u * 16;
          const on = Math.floor(e.bombTimer * blinkHz) % 2 === 0;
          this.setGroupEmissiveFlash(e.mesh, on, 0xff1010);
          if (Math.floor(prev * blinkHz) !== Math.floor(e.bombTimer * blinkHz) && on) synthAudio.playFuseBeep();
          const shake = 0.05 + u * 0.12;
          e.mesh.position.set(e.x + (Math.random() - 0.5) * shake, 0.05, e.z + (Math.random() - 0.5) * shake);
          e.mesh.scale.setScalar(1 + u * 0.18);
          if (e.parts?.legs) e.parts.legs.forEach((l, k) => (l.rotation.x = Math.sin(this.elapsedSec * 40 + k) * 0.4));
          const R = 3.6;
          this.blastFx.warn(e.x, e.z, R, u, this.elapsedSec);
          if (e.bombTimer <= 0) {
            // Big one: fireball + shockwave ring + debris, gore and a deep layered boom
            this.blastFx.spawn(e.x, e.z, R);
            this.returnFx.burst(e.x, 0.8, e.z, 46, 11, 0.8);
            this.spawnParticles(e.x, 0.8, e.z, 34, 0xff3b1f, 13, 0.5);
            this.spawnParticles(e.x, 0.8, e.z, 18, 0x70e000, 10, 0.45);
            this.spawnParticles(e.x, 0.5, e.z, 14, 0x2a2420, 7, 0.6);
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2;
              this.fx.puff(e.x + Math.cos(a) * 1.2, 0.5, e.z + Math.sin(a) * 1.2, 1.1, 0x3a3430, { x: Math.cos(a) * 3, z: Math.sin(a) * 3 });
            }
            this.fx.splatter(e.x, e.z, 0, 1, 2.0);
            this.fx.stampMark(e.x, e.z, 2.6, 1, Math.random() * Math.PI, 0x14100c);
            synthAudio.playSpiderBlast();
            this.hitstopTimer = Math.max(this.hitstopTimer, 0.06);
            this.trauma = Math.min(1, this.trauma + 0.7);
            if (Math.hypot(this.playerX - e.x, this.playerZ - e.z) <= R) {
              this.damagePlayer(1, this.playerX - e.x, this.playerZ - e.z);
            }
            for (const o of this.enemies) {
              if (o === e || o.state === 'ko' || o.archetype === 'boss') continue;
              if (Math.hypot(o.x - e.x, o.z - e.z) <= R + o.radius) this.damageEnemy(o, 60, o.x - e.x, o.z - e.z);
            }
            this.removeEnemyAt(this.enemies.indexOf(e));
          }
          continue;
        }

        e.koTimer -= dt;
        const t = Math.max(0, e.koTimer / 0.34);
        e.mesh.scale.set(1 + (1 - t) * 0.25, Math.max(0.05, t), 1 + (1 - t) * 0.25);
        e.mesh.rotation.x = (1 - t) * 1.1;
        e.shadow.scale.setScalar(t);
        if (e.koTimer <= 0) {
          this.removeEnemyAt(i);
        }
        continue;
      }

      // Emerging from grave (Cemetery Round 2)
      if (e.emergeTimer && e.emergeTimer > 0) {
        e.emergeTimer = Math.max(0, e.emergeTimer - dt);
        const dur = Math.max(0.1, e.emergeDuration ?? 0.9);
        const progress = 1 - e.emergeTimer / dur;
        if (e.teleport) {
          // Materialise: a thin red sliver stretched tall resolves into the body, glitching
          const glitch = Math.random() < 0.25 ? (Math.random() - 0.5) * 0.4 : 0;
          const w = Math.max(0.05, progress * progress);
          e.mesh.scale.set(w + glitch * 0.3, 1 + (1 - progress) * 0.8, w);
          e.mesh.position.set(e.x + glitch * 0.3, 0, e.z);
          e.mesh.rotation.y = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
          e.mesh.visible = progress > 0.15 && Math.random() > 0.15 * (1 - progress);
          this.setGroupEmissiveFlash(e.mesh, true, 0xff1e2a);
          e.shadow.scale.setScalar(progress);
          if (Math.random() < dt * 22) this.spawnParticles(e.x + (Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 2.4, e.z + (Math.random() - 0.5) * 1.4, 1, 0xff1e2a, 1.5, 0.3);
          if (e.emergeTimer <= 0) {
            e.mesh.scale.set(1, 1, 1);
            e.mesh.visible = true;
            this.setGroupEmissiveFlash(e.mesh, false);
            this.spawnParticles(e.x, 1.2, e.z, 14, 0xff1e2a, 7, 0.3);
            this.spawnParticles(e.x, 1.2, e.z, 6, 0xffffff, 5, 0.2);
          }
          continue;
        }
        e.mesh.position.set(e.x, -1.9 * (1 - progress), e.z);
        e.mesh.rotation.y = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
        e.shadow.scale.setScalar(0.35 + progress * 0.65);
        if (Math.random() < dt * 16) {
          this.spawnParticles(e.x, 0.2, e.z, 1, 0x5c3c28, 4.5, 0.28);
        }
        continue;
      }

      if (e.archetype === 'boss' && e.bossLineTimer && e.bossLineTimer > 0) {
        e.bossLineTimer = Math.max(0, e.bossLineTimer - dt);
        if (e.bossLineTimer <= 0) {
          e.bossLine = null;
          this.emitHud();
        }
      }

      if (e.archetype === 'boss' && !e.enraged && isBossEnraged(e.hp, e.maxHp)) {
        e.enraged = true;
        this.trauma = Math.max(this.trauma, 0.78);
        this.spawnParticles(e.x, 2.6, e.z, 34, 0xff1e3c, 12, 0.55);
        this.spawnParticles(e.x, 3.6, e.z, 22, 0xffffff, 10, 0.45);
        if (e.v2) {
          // Half dead: he screams and goes straight for the impale
          this.endBoss2Attack(e);
          this.startBoss2Attack(e, 'impale');
        } else {
          synthAudio.playBossVoice('enrage');
        }
        this.emitHud();
      }

      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const cfg = ENEMY_CONFIGS[e.archetype];
      this.currentShooter = e;

      if (e.v2) {
        this.updateBoss2AI(e, dt, dist, dirX, dirZ);
      } else if (e.hexer) {
        this.updateHexer(e, dt, dirX, dirZ);
      } else if (e.pacified && e.pacified > 0) {
        this.updatePacified(e, dt);
      } else if (e.state === 'move') {
        e.yaw = Math.atan2(dirX, dirZ);

        if (e.archetype === 'rustler' || e.archetype === 'spider') {
          const weave = e.archetype === 'spider' ? 0.52 : 0.32;
          const pounceRange = e.archetype === 'spider' ? 2.8 : 4.4;
          const perpX = -dirZ * e.strafeSign * weave;
          const perpZ = dirX * e.strafeSign * weave;
          e.vx = (dirX + perpX) * e.speed;
          e.vz = (dirZ + perpZ) * e.speed;
          if (dist < pounceRange && activeTokens < this.waveTokenCap) {
            e.hasToken = true;
            activeTokens++;
            e.state = 'telegraph';
            e.stateTimer = cfg.telegraphTime;
            e.aimX = dirX;
            e.aimZ = dirZ;
            if (e.archetype === 'rustler') {
              // "!" over his head, a beat to react, then he lunges
              e.stateTimer = 0.5;
              if (!e.alert) {
                e.alert = this.indicators.makeAlert();
                this.scene.add(e.alert);
              }
              e.alert.visible = true;
              synthAudio.playAlert();
            }
          }
        } else if (e.archetype === 'ranger' || e.archetype === 'spore') {
          // Kiter / Floating Viral Spore: maintains ~13.5m distance & strafes
          const radial = dist > cfg.preferredRange + 2.5 ? 1 : dist < cfg.preferredRange - 2.5 ? -0.85 : 0;
          const strafe = 0.65 * e.strafeSign;
          e.vx = (dirX * radial - dirZ * strafe) * e.speed;
          e.vz = (dirZ * radial + dirX * strafe) * e.speed;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 24 && activeTokens < this.waveTokenCap) {
            e.hasToken = true;
            activeTokens++;
            e.state = 'telegraph';
            e.aimX = dirX;
            e.aimZ = dirZ;
            if (e.archetype === 'ranger') {
              // Green mage chants before casting: rune circle, rising sparks, he floats
              e.stateTimer = 1.1;
              if (!e.chantRing) {
                e.chantRing = new THREE.Mesh(
                  new THREE.RingGeometry(0.9, 1.15, 6).rotateX(-Math.PI / 2),
                  new THREE.MeshBasicMaterial({ color: 0x66ff33, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
                );
                this.scene.add(e.chantRing);
              }
              e.chantRing.visible = true;
              synthAudio.playChant(1.1);
            } else {
              // Spore swells before spitting its poison glob
              e.stateTimer = 0.75;
            }
          }
        } else if (e.archetype === 'tesla') {
          // Volt Wraith: jagged electric zigzagging orbit at mid-range before twin shock bolts
          const zig = Math.sin(this.elapsedSec * 5.6 + e.id) * 1.15;
          const radial = dist > cfg.preferredRange + 2 ? 0.85 : dist < cfg.preferredRange - 2 ? -0.75 : 0.1;
          e.vx = (dirX * radial - dirZ * zig) * e.speed;
          e.vz = (dirZ * radial + dirX * zig) * e.speed;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 21 && activeTokens < this.waveTokenCap) {
            e.hasToken = true;
            activeTokens++;
            e.state = 'telegraph';
            e.stateTimer = cfg.telegraphTime;
            e.aimX = dirX;
            e.aimZ = dirZ;
          }
        } else if (e.archetype === 'juggernaut') {
          // Ironclad Brute: steady relentless march until medium range for twin rotary cannon burst
          const radial = dist > cfg.preferredRange ? 1 : dist < 5.5 ? -0.35 : 0.25;
          const strafe = 0.24 * e.strafeSign;
          e.vx = (dirX * radial - dirZ * strafe) * e.speed;
          e.vz = (dirZ * radial + dirX * strafe) * e.speed;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 24 && activeTokens < this.waveTokenCap) {
            e.hasToken = true;
            activeTokens++;
            e.state = 'telegraph';
            e.stateTimer = 0.8; // smoke-stacks glow before the artillery salvo
            e.aimX = dirX;
            e.aimZ = dirZ;
          }
        } else if (e.archetype === 'charger' || e.archetype === 'mantis') {
          // Approaches to medium range, then telegraphs line-of-sight dash / scythe lunge
          e.vx = dirX * e.speed;
          e.vz = dirZ * e.speed;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 14.0 && activeTokens < this.waveTokenCap) {
            e.hasToken = true;
            activeTokens++;
            e.state = 'telegraph';
            // The bull paws the ground for a while before it charges
            e.stateTimer = e.archetype === 'charger' ? 1.0 : cfg.telegraphTime;
            e.fxTimer = 0;
            e.aimX = dirX;
            e.aimZ = dirZ;
          }
        } else if (e.archetype === 'boss') {
          // CEM FACES: stalking spider gait + 4 signature wild phases (Leap Slam, Rajadas, Spiral Rush, Mortar Storm)
          const moveBoost = e.enraged ? 1.24 : 1.0;
          const radial = dist > cfg.preferredRange + 2.0 ? 1 : dist < cfg.preferredRange - 2.5 ? -0.35 : 0.25;
          const strafe = 0.62 * e.strafeSign;
          e.vx = (dirX * radial - dirZ * strafe) * e.speed * moveBoost;
          e.vz = (dirZ * radial + dirX * strafe) * e.speed * moveBoost;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0 && dist < 29) {
            e.hasToken = true;
            e.state = 'telegraph';
            e.stateTimer = e.enraged ? cfg.telegraphTime * 0.78 : cfg.telegraphTime;
            const phase = e.bossPhase ?? 0;
            if (phase === 0) {
              const target = resolveCircleObstacleCollision(
                this.playerX,
                this.playerZ,
                e.radius,
                [],
                ARENA_RADIUS - 2.4
              );
              e.leapTargetX = target.x;
              e.leapTargetZ = target.z;
              synthAudio.playBossVoice('leap');
            } else if (phase === 3) {
              e.aimX = this.playerX;
              e.aimZ = this.playerZ;
            } else {
              e.aimX = dirX;
              e.aimZ = dirZ;
              if (phase === 1) synthAudio.playBossVoice('barrage');
            }
          }
        } else {
          // Skull-ship: runs to hide at the far edge, then empowers another enemy and sits still
          e.hideTimer = (e.hideTimer ?? 0) + dt;
          const spotThreatened =
            e.hideX === undefined || Math.hypot(this.playerX - e.hideX, this.playerZ - (e.hideZ ?? 0)) < 9;
          if (spotThreatened) {
            const playerAng = Math.hypot(this.playerX, this.playerZ) > 1 ? Math.atan2(this.playerZ, this.playerX) : Math.random() * Math.PI * 2;
            const hideAng = playerAng + Math.PI + (Math.random() - 0.5) * 1.0;
            e.hideX = Math.cos(hideAng) * (ARENA_RADIUS - 4);
            e.hideZ = Math.sin(hideAng) * (ARENA_RADIUS - 4);
            e.hideTimer = 0;
          }
          const hx = (e.hideX ?? e.x) - e.x;
          const hz = (e.hideZ ?? e.z) - e.z;
          const hd = Math.hypot(hx, hz);
          const arrived = hd < 1.4 || e.hideTimer > 5;
          if (!arrived) {
            e.vx = (hx / hd) * e.speed * 1.35;
            e.vz = (hz / hd) * e.speed * 1.35;
            e.yaw = Math.atan2(hx, hz);
          } else {
            e.vx *= 0.8;
            e.vz *= 0.8;
            e.yaw = Math.atan2(dirX, dirZ); // watches you from its hiding spot
            e.stateTimer -= dt;
            if (e.stateTimer <= 0) {
              const candidates = this.enemies.filter(
                (o) =>
                  o !== e &&
                  o.state !== 'ko' &&
                  !o.buffed &&
                  o.archetype !== 'boss' &&
                  o.archetype !== 'bombardier' &&
                  !(o.emergeTimer && o.emergeTimer > 0)
              );
              if (candidates.length > 0) {
                const target = candidates[Math.floor(Math.random() * candidates.length)];
                e.buffTargetId = target.id;
                e.state = 'telegraph';
                e.stateTimer = 1.4; // channelling the empowering beam
              } else {
                e.stateTimer = 1.0;
              }
            }
          }
        }
      } else if (e.state === 'telegraph') {
        e.vx *= 0.8;
        e.vz *= 0.8;
        e.stateTimer -= dt;
        this.setGroupEmissiveFlash(e.mesh, true, cfg.accentColor);
        this.updateTelegraphFx(e, dt, dirX, dirZ);

        if (e.archetype === 'boss' && (e.bossPhase ?? 0) === 0 && e.leapRingMesh) {
          e.leapRingMesh.visible = true;
          e.leapRingMesh.position.set(e.leapTargetX ?? this.playerX, 0.08, e.leapTargetZ ?? this.playerZ);
          const pulse = 3.8 + Math.sin(this.elapsedSec * 24) * 0.45;
          e.leapRingMesh.scale.setScalar(pulse);
          e.mesh.scale.set(1.08, 0.86, 1.08);
        }

        if (e.telegraphLine) {
          // Mage and bull only reveal their aim at the very end of their wind-up
          const lateOnly = e.archetype === 'ranger' ? 0.35 : e.archetype === 'charger' ? 0.45 : Infinity;
          const showLine = (e.archetype !== 'boss' || (e.bossPhase ?? 0) === 2) && e.stateTimer < lateOnly;
          e.telegraphLine.visible = showLine;
          if (showLine) {
            e.telegraphLine.position.set(e.x, 0.06, e.z);
            e.telegraphLine.rotation.y = Math.atan2(e.aimX, e.aimZ);
            e.telegraphLine.scale.z =
              e.archetype === 'boss' ? 16.5 : e.archetype === 'charger' || e.archetype === 'mantis' ? 11.5 : 22;
          }
        }

        if (e.stateTimer <= 0) {
          this.setGroupEmissiveFlash(e.mesh, false);
          e.mesh.scale.set(1, 1, 1);
          e.mesh.rotation.x = 0;
          if (e.parts?.pawLeg) e.parts.pawLeg.rotation.x = 0;
          if (e.telegraphLine) e.telegraphLine.visible = false;
          if (e.alert) e.alert.visible = false;
          if (e.chantRing) e.chantRing.visible = false;
          if (e.beam) e.beam.visible = false;
          this.executeEnemyAttack(e);
        }
      } else if (e.state === 'attack') {
        if (e.archetype === 'boss' && e.leapActive) {
          e.leapTimer = (e.leapTimer ?? 0) + dt;
          const dur = e.leapDuration ?? 0.68;
          const u = Math.min(1, e.leapTimer / dur);
          const sx = e.leapStartX ?? e.x;
          const sz = e.leapStartZ ?? e.z;
          const tx = e.leapTargetX ?? this.playerX;
          const tz = e.leapTargetZ ?? this.playerZ;
          e.x = sx + (tx - sx) * u;
          e.z = sz + (tz - sz) * u;
          e.vx = 0;
          e.vz = 0;
          e.yaw = Math.atan2(tx - sx, tz - sz);
          e.hoverY = computeParabolicJumpHeight(u, 6.8);
          if (e.leapRingMesh) {
            e.leapRingMesh.visible = true;
            e.leapRingMesh.position.set(tx, 0.08, tz);
            e.leapRingMesh.scale.setScalar(4.3 * (0.65 + 0.35 * u));
          }
          if (u >= 1) {
            e.hoverY = 0;
            this.triggerBossLeapLanding(e);
          }
        } else if (e.archetype === 'boss' && (e.barrageVolleysLeft ?? 0) > 0) {
          // Telegraphed rajada: the lanes he's about to fire down are drawn on the floor first
          e.vx *= 0.85;
          e.vz *= 0.85;
          const WIND = e.enraged ? 0.42 : 0.56;
          if (!e.v2Lanes) {
            e.v2Lanes = this.rollBoss1Lanes(e);
            e.barrageTimer = WIND;
          }
          const lanes = e.v2Lanes;
          e.yaw = lanes[Math.floor(lanes.length / 2)] ?? Math.atan2(dirX, dirZ);
          e.barrageTimer = (e.barrageTimer ?? 0) - dt;
          const urgent = e.barrageTimer < 0.18;
          const blink = Math.sin(this.elapsedSec * (urgent ? 46 : 16)) > 0 ? 0.95 : 0.4;
          this.returnFx.showLanes(e.x, e.z, lanes, 36, blink);
          if (e.barrageTimer <= 0) {
            this.fireBossRajadaVolley(e, lanes);
            e.barrageVolleysLeft = (e.barrageVolleysLeft ?? 1) - 1;
            if (e.barrageVolleysLeft <= 0) {
              e.v2Lanes = undefined;
              this.returnFx.hideLanes();
              e.state = 'cooldown';
              e.stateTimer = e.enraged ? cfg.cooldownTime * 0.72 : cfg.cooldownTime;
              e.hasToken = false;
            } else {
              e.v2Lanes = this.rollBoss1Lanes(e);
              e.barrageTimer = WIND;
            }
          }
        } else {
          // Active dash phase (Charger / Root Stalker / Boss Bull Rush)
          e.stateTimer -= dt;
          if (dist < e.radius + PLAYER_RADIUS + 0.24) {
            this.damagePlayer(1, e.aimX, e.aimZ);
          }
          if (e.stateTimer <= 0) {
            e.state = 'cooldown';
            e.stateTimer = e.archetype === 'boss' && e.enraged ? cfg.cooldownTime * 0.72 : cfg.cooldownTime;
            e.hasToken = false;
          }
        }
      } else if (e.state === 'cooldown') {
        e.vx *= 0.85;
        e.vz *= 0.85;
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.state = 'move';
          e.stateTimer = e.archetype === 'boss' ? (e.enraged ? 0.42 : 0.62) : 0.7 + Math.random() * 0.7;
          e.strafeSign *= -1;
        }
      }

      if (!e.leapActive) {
        e.x += e.vx * dt;
        e.z += e.vz * dt;

        // Soft separation between grounded enemies
        for (let j = i - 1; j >= 0; j--) {
          const other = this.enemies[j];
          if (other.state === 'ko' || other.leapActive) continue;
          const sx = e.x - other.x;
          const sz = e.z - other.z;
          const minD = e.radius + other.radius;
          const d2 = sx * sx + sz * sz;
          if (d2 > 0.0001 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.5;
            const nx = sx / d;
            const nz = sz / d;
            e.x += nx * push;
            e.z += nz * push;
            other.x -= nx * push;
            other.z -= nz * push;
          }
        }

        let resolved = resolveCircleObstacleCollision(e.x, e.z, e.radius, this.obstacles, ARENA_RADIUS);
        // Ground enemies won't walk (or get knocked) into pits and lava — fliers don't care
        if (!e.flying && this.hazardDefs.length > 0) resolved = pushOutOfHazards(resolved.x, resolved.z, e.radius, this.hazardDefs);
        e.x = resolved.x;
        e.z = resolved.z;
      }

      const speedMag = Math.hypot(e.vx, e.vz);
      e.walkPhase += speedMag * dt * 1.4;
      const chanting = e.archetype === 'ranger' && e.state === 'telegraph';
      const hoverY =
        e.archetype === 'boss' && e.leapActive
          ? (e.hoverY ?? 0)
          : chanting
            ? 0.3 + Math.sin(this.elapsedSec * 6) * 0.08
            : e.flying
              ? 0.7 + Math.sin(this.elapsedSec * 3 + e.id) * 0.25
            : e.archetype === 'spore' || e.archetype === 'tesla'
              ? 0.34 + Math.sin(this.elapsedSec * 5.5 + e.id) * 0.2
              : Math.abs(Math.sin(e.walkPhase)) * 0.08;
      e.mesh.position.set(e.x, hoverY, e.z);
      e.mesh.rotation.y = e.yaw;
      // Hit recoil: snap back along the shot + a jitter that dies out fast
      if (e.hitReact && e.hitReact > 0) {
        e.hitReact = Math.max(0, e.hitReact - dt);
        const k = e.hitReact / 0.14;
        const big = e.archetype === 'boss' ? 0.35 : 1;
        const shove = 0.22 * k * big;
        const jit = 0.1 * k * big;
        e.mesh.position.x += (e.hitDirX ?? 0) * shove + (Math.random() - 0.5) * jit;
        e.mesh.position.z += (e.hitDirZ ?? 0) * shove + (Math.random() - 0.5) * jit;
      }
      e.shadow.position.set(e.x, 0.02, e.z);
      this.updateEnemyStatusFx(e, dt, speedMag);
      if (e.archetype === 'boss') {
        const shadowScale = e.leapActive ? Math.max(0.38, 1 - (hoverY / 6.8) * 0.6) : 1;
        e.shadow.scale.setScalar(shadowScale);
        this.animateCemFacesRig(e, dt);
        if (e.v2) this.animateBoss2Damage(e, dt, speedMag);
      }
    }
  }

  private animateCemFacesRig(e: EnemyEntity, dt: number) {
    // Continuously spin the 4 white faces on the pitch-black head
    if (e.facesCarousel) {
      const spinRate =
        e.state === 'telegraph' || e.state === 'attack'
          ? 14.5
          : e.enraged
            ? 8.0
            : 3.2;
      e.facesCarousel.rotation.y += dt * spinRate;
    }

    // Rotate sacred mechanical halo slowly
    if (e.dharmaHalo) {
      e.dharmaHalo.rotation.z += dt * (e.enraged ? 3.2 : 1.1);
    }

    // Serene prayer pose tremor / subtle breathing surge during barrages
    if (e.prayerArms) {
      const firingPrayer = e.state === 'attack' && (e.barrageVolleysLeft ?? 0) > 0;
      e.prayerArms.position.z = firingPrayer
        ? 0.14 + Math.sin(this.elapsedSec * 28) * 0.06
        : Math.sin(this.elapsedSec * 3.5) * 0.03;
      e.prayerArms.rotation.x = firingPrayer ? -0.14 : Math.sin(this.elapsedSec * 2.5) * 0.03;
    }

    // 4 Spider Legs scuttling gait / leap extension
    if (e.spiderLegs) {
      for (let idx = 0; idx < e.spiderLegs.length; idx++) {
        const leg = e.spiderLegs[idx];
        const phaseOffset = idx * 1.57;
        if (e.leapActive) {
          leg.rotation.x = -0.32;
          leg.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.16;
        } else if (e.state === 'telegraph' && (e.bossPhase ?? 0) === 0) {
          leg.rotation.x = 0.18;
          leg.rotation.z = 0;
        } else {
          leg.rotation.x = Math.sin(e.walkPhase + phaseOffset) * 0.14;
          leg.rotation.z = Math.cos(e.walkPhase + phaseOffset) * 0.08;
        }
      }
    }
  }

  /**
   * Fight-1 lane patterns, alternating so they can't be memorised:
   * a fan aimed at you, a full ring with gaps, or a fan offset to one side (dodge the other way).
   */
  private rollBoss1Lanes(e: EnemyEntity): number[] {
    const toP = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
    const volley = e.barrageVolleysLeft ?? 0;
    const out: number[] = [];
    const pattern = (volley + (e.id ?? 0)) % 3;
    if (pattern === 1) {
      const n = e.enraged ? 14 : 12;
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) out.push(off + (i / n) * Math.PI * 2);
    } else {
      const n = e.enraged ? 9 : 7;
      const spread = e.enraged ? 1.5 : 1.25;
      const center = toP + (pattern === 2 ? (Math.random() < 0.5 ? -1 : 1) * 0.35 : 0) + (Math.random() - 0.5) * 0.15;
      for (let i = 0; i < n; i++) out.push(center - spread / 2 + (spread * i) / (n - 1));
    }
    return out;
  }

  private fireBossRajadaVolley(e: EnemyEntity, lanes: number[]) {
    const volleyIdx = e.barrageVolleysLeft ?? 0;
    const speed = (e.enraged ? 25 : 22) + Math.min(this.wave * 0.7, 9);
    const mid = lanes[Math.floor(lanes.length / 2)] ?? e.yaw;
    this.spawnParticles(e.x + Math.sin(mid) * 1.5, 3.2, e.z + Math.cos(mid) * 1.5, 14, 0xff1e3c, 9, 0.24);
    for (let k = 0; k < lanes.length; k++) {
      const ang = lanes[k];
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      const color = (k + volleyIdx) % 2 === 0 ? 0xff1e3c : 0xffffff;
      this.spawnProjectile(
        false,
        'enemy_bolt',
        e.x + dx * 1.6,
        1.55,
        e.z + dz * 1.6,
        dx * speed,
        dz * speed,
        1,
        0,
        color
      );
    }
    synthAudio.playExplosion();
  }

  private triggerBossLeapLanding(e: EnemyEntity) {
    if (e.leapRingMesh) e.leapRingMesh.visible = false;
    e.leapActive = false;

    // Massive screenshake + seismic audio slam + particle crater
    this.trauma = 1.0;
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.065);
    synthAudio.playBossSlam();
    this.spawnParticles(e.x, 0.5, e.z, 36, 0xff1e3c, 15, 0.52);
    this.spawnParticles(e.x, 0.8, e.z, 20, 0xffffff, 12, 0.42);
    this.spawnParticles(e.x, 0.6, e.z, 14, 0xffaa2b, 10, 0.36);

    const pDist = Math.hypot(this.playerX - e.x, this.playerZ - e.z);
    if (pDist <= 4.3) {
      this.damagePlayer(1, this.playerX - e.x, this.playerZ - e.z);
    }

    // Radial 8-bolt ground shockwave scatter
    const shockBolts = e.v2 ? (e.enraged ? 16 : 12) : e.enraged ? 12 : 8;
    const boltSpd = e.v2 ? (e.enraged ? 24 : 21) : e.enraged ? 21 : 17.5;
    for (let b = 0; b < shockBolts; b++) {
      const ang = (b / shockBolts) * Math.PI * 2 + (e.leapChainLeft ?? 0) * 0.25;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      this.spawnProjectile(
        false,
        'enemy_bolt',
        e.x + dx * 1.6,
        1.2,
        e.z + dz * 1.6,
        dx * boltSpd,
        dz * boltSpd,
        1,
        0,
        b % 2 === 0 ? 0xff1e3c : 0xffffff,
        false,
        !!e.v2 // second coming: dodge-only
      );
    }

    if ((e.leapChainLeft ?? 0) > 0) {
      e.leapChainLeft = (e.leapChainLeft ?? 1) - 1;
      e.leapActive = true;
      e.leapStartX = e.x;
      e.leapStartZ = e.z;
      const nextTarget = resolveCircleObstacleCollision(
        this.playerX,
        this.playerZ,
        e.radius,
        [],
        ARENA_RADIUS - 2.4
      );
      e.leapTargetX = nextTarget.x;
      e.leapTargetZ = nextTarget.z;
      e.leapTimer = 0;
      e.leapDuration = 0.58;
      synthAudio.playBossVoice('leap');
    } else {
      e.state = 'cooldown';
      e.stateTimer = e.v2 ? 0.5 : e.enraged ? 0.65 : ENEMY_CONFIGS.boss.cooldownTime;
      e.hasToken = false;
    }
  }

  /** Per-archetype wind-up visuals while an enemy telegraphs its attack. */
  private updateTelegraphFx(e: EnemyEntity, dt: number, dirX: number, dirZ: number) {
    const top = e.radius * 2.2 + 1.3;
    switch (e.archetype) {
      case 'rustler':
        // Crouch under the "!" — the lunge comes when it ends
        e.mesh.scale.set(1.08, 0.88, 1.08);
        break;
      case 'ranger': {
        // Chanting: keeps tracking you until the last instant, rune circle spins and pulses
        if (e.stateTimer > 0.35) {
          e.aimX = dirX;
          e.aimZ = dirZ;
          e.yaw = Math.atan2(dirX, dirZ);
        }
        if (e.chantRing) {
          e.chantRing.position.set(e.x, 0.07, e.z);
          e.chantRing.rotation.y += dt * 3;
          e.chantRing.scale.setScalar(1 + Math.sin(this.elapsedSec * 10) * 0.12 + (1 - e.stateTimer / 1.1) * 0.5);
        }
        if (Math.random() < dt * 22) {
          this.spawnParticles(e.x + (Math.random() - 0.5) * 1.8, 0.2, e.z + (Math.random() - 0.5) * 1.8, 1, 0x66ff33, 1.2, 0.7);
        }
        break;
      }
      case 'spore': {
        // Swells up before spitting
        const u = 1 - Math.max(0, e.stateTimer) / 0.75;
        e.mesh.scale.setScalar(1 + u * 0.32);
        if (Math.random() < dt * 14) this.spawnParticles(e.x, 1.2, e.z, 1, 0xb04dff, 2.5, 0.4);
        break;
      }
      case 'charger': {
        // Pawing the ground: hoof scrapes, body rocks, dust kicked back; aim locks near the end
        if (e.stateTimer > 0.3) {
          e.aimX = dirX;
          e.aimZ = dirZ;
          e.yaw = Math.atan2(dirX, dirZ);
        }
        const t = this.elapsedSec * 15;
        if (e.parts?.pawLeg) e.parts.pawLeg.rotation.x = Math.sin(t) * 0.75;
        e.mesh.rotation.x = Math.sin(t) * 0.07 + 0.08;
        e.fxTimer = (e.fxTimer ?? 0) - dt;
        if (e.fxTimer <= 0) {
          e.fxTimer = 0.2;
          this.fx.puff(e.x - e.aimX * 1.1, 0.2, e.z - e.aimZ * 1.1, 0.4, 0x8a6a4a, { x: -e.aimX * 2, z: -e.aimZ * 2 });
          synthAudio.playHoofScrape();
        }
        break;
      }
      case 'juggernaut': {
        // Smoke-stacks belch as the salvo loads
        if (Math.random() < dt * 16) this.fx.puff(e.x + (Math.random() - 0.5) * 0.8, 3.1, e.z + (Math.random() - 0.5) * 0.8, 0.4, 0x2a2624);
        break;
      }
      case 'bombardier': {
        // Empowering beam toward the chosen ally
        const target = this.enemies.find((o) => o.id === e.buffTargetId);
        if (!target || target.state === 'ko') {
          e.state = 'cooldown';
          e.stateTimer = 0.6;
          if (e.beam) e.beam.visible = false;
          return;
        }
        if (!e.beam) {
          const geo = new THREE.BoxGeometry(0.1, 0.1, 1).translate(0, 0, 0.5);
          e.beam = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({ color: 0x4dff7a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
          );
          this.scene.add(e.beam);
        }
        const from = new THREE.Vector3(e.x, 1.6, e.z);
        const to = new THREE.Vector3(target.x, 1.2, target.z);
        e.beam.visible = true;
        e.beam.position.copy(from);
        e.beam.lookAt(to);
        e.beam.scale.set(1 + Math.sin(this.elapsedSec * 30) * 0.4, 1, from.distanceTo(to));
        e.yaw = Math.atan2(target.x - e.x, target.z - e.z);
        if (Math.random() < dt * 20) this.spawnParticles(target.x, 1.2, target.z, 1, 0x4dff7a, 3, 0.4);
        break;
      }
    }
    if (e.alert) {
      // Bounces and throbs so it reads in a crowd
      e.alert.position.set(e.x, top + 0.25 + Math.abs(Math.sin(this.elapsedSec * 14)) * 0.22, e.z);
      const pulse = 1 + Math.abs(Math.sin(this.elapsedSec * 16)) * 0.22;
      e.alert.scale.set(0.95 * pulse, 1.27 * pulse, 1);
    }
  }

  /** Óculos Escuros: a thin minimalist health bar floating over every enemy. */
  private updateHpBar(e: EnemyEntity, top: number) {
    const show = this.upgrades.has('shades') && e.state !== 'ko' && !(e.emergeTimer && e.emergeTimer > 0) && !e.husk;
    if (!show) {
      if (e.hpBar) e.hpBar.bg.visible = e.hpBar.fill.visible = false;
      return;
    }
    if (!e.hpBar) {
      const mk = (color: number, opacity: number) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false }));
        sp.center.set(0, 0.5);
        sp.renderOrder = 9;
        this.scene.add(sp);
        return sp;
      };
      e.hpBar = { bg: mk(0x000000, 0.55), fill: mk(0xffffff, 0.95) };
    }
    const boss = e.archetype === 'boss';
    const w = boss ? 3.2 : 1.1;
    const h = boss ? 0.14 : 0.08;
    const k = Math.max(0, e.hp / e.maxHp);
    const y = boss ? 6.6 : top + 0.15;
    const { bg, fill } = e.hpBar;
    bg.visible = fill.visible = true;
    bg.position.set(e.x - w / 2 - 0.03, y, e.z);
    bg.scale.set(w + 0.06, h + 0.06, 1);
    fill.position.set(e.x - w / 2, y, e.z);
    fill.scale.set(Math.max(0.001, w * k), h, 1);
    (fill.material as THREE.SpriteMaterial).color.setHex(k < 0.3 ? 0xff3040 : 0xffffff);
  }

  /** Continuous per-frame enemy flourishes: walking legs, tentacles, status icons, buff flames. */
  private updateEnemyStatusFx(e: EnemyEntity, dt: number, speedMag: number) {
    if (e.flying) animateFlyer(e.mesh, this.elapsedSec, e.id * 1.7);
    this.updateAmmoStatus(e, dt);
    // The catalyst mages are frail: they never stop trembling
    if (e.archetype === 'bombardier' && !e.flying && e.state !== 'ko') e.mesh.rotation.z = Math.sin(this.elapsedSec * 19 + e.id) * 0.03;
    if (e.archetype === 'spider' && e.parts?.legs) {
      const amp = Math.min(1, speedMag / 4) * 0.55;
      e.parts.legs.forEach((leg, k) => {
        leg.rotation.x = Math.sin(e.walkPhase * 3.2 + k * 1.57) * amp;
      });
    }
    if (e.archetype === 'spore' && e.parts?.tentacles) {
      e.parts.tentacles.forEach((t, k) => {
        t.rotation.z = Math.sin(this.elapsedSec * 4 + k * 1.3) * 0.35;
      });
    }
    const top = e.radius * 2.2 + 1.3;
    this.updateHpBar(e, top);
    if (e.hexed) {
      // Cursed: black smoke and red flames licking up the body
      if (Math.random() < dt * 34) {
        const r = e.radius * 1.3;
        this.spawnParticles(e.x + (Math.random() - 0.5) * r, 0.3 + Math.random() * 1.6, e.z + (Math.random() - 0.5) * r, 1, Math.random() < 0.55 ? 0xff1a10 : Math.random() < 0.5 ? 0x140004 : 0xff7a2a, 2.6, 0.38);
      }
      if (Math.random() < dt * 8) this.fx.puff(e.x + (Math.random() - 0.5) * e.radius, 1.6 + Math.random(), e.z + (Math.random() - 0.5) * e.radius, 0.5, 0x0c0204);
    }
    if (e.hexer && Math.random() < dt * 10) {
      this.spawnParticles(e.x + (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 1.4, e.z + (Math.random() - 0.5) * 0.8, 1, Math.random() < 0.5 ? 0xff1020 : 0x1a0004, 1.2, 0.5);
    }
    if (e.buffed) {
      if (e.buffIcon) e.buffIcon.position.set(e.x, top + 0.35 + Math.sin(this.elapsedSec * 4) * 0.08, e.z);
      // "On fire", green
      if (Math.random() < dt * 26) {
        this.spawnParticles(e.x + (Math.random() - 0.5) * e.radius * 1.4, 0.6 + Math.random() * 1.2, e.z + (Math.random() - 0.5) * e.radius * 1.4, 1, Math.random() < 0.6 ? 0x4dff7a : 0xb6ff9e, 2.2, 0.32);
      }
    }
  }

  /** Skull-ship's blessing: tougher, faster, glowing green with a "+" over its head. */
  private applyBuff(target: EnemyEntity) {
    target.buffed = true;
    target.maxHp = Math.round(target.maxHp * 1.8);
    target.hp = Math.round(target.hp * 1.8);
    target.speed *= 1.3;
    target.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as THREE.MeshStandardMaterial;
        if (!sm.emissive) continue;
        sm.emissive.setHex(0x1aff4a);
        sm.emissiveIntensity = 0.55;
        sm.userData.baseEmissive = 0x1aff4a;
        sm.userData.baseEmissiveIntensity = 0.55;
      }
    });
    if (!target.buffIcon) {
      target.buffIcon = this.indicators.makeBuff();
      this.scene.add(target.buffIcon);
    }
    this.spawnParticles(target.x, 1.2, target.z, 22, 0x4dff7a, 9, 0.45);
    synthAudio.playBuff();
  }

  private executeEnemyAttack(e: EnemyEntity) {
    const cfg = ENEMY_CONFIGS[e.archetype];
    if (e.archetype === 'rustler') {
      // The lunge: a short committed dash that hurts on contact
      e.vx = e.aimX * 17;
      e.vz = e.aimZ * 17;
      e.state = 'attack';
      e.stateTimer = 0.26;
      return;
    }
    if (e.archetype === 'spider') {
      const dist = Math.hypot(this.playerX - e.x, this.playerZ - e.z);
      e.vx = e.aimX * 13;
      e.vz = e.aimZ * 13;
      if (dist < 2.8) {
        this.damagePlayer(1, e.aimX, e.aimZ);
      }
      e.state = 'cooldown';
      e.stateTimer = cfg.cooldownTime;
      e.hasToken = false;
    } else if (e.archetype === 'ranger') {
      // The spell: a three-bolt fan of green magic after the chant
      const boltSpeed = 21 + Math.min(this.wave * 1.0, 11);
      const baseYaw = Math.atan2(e.aimX, e.aimZ);
      this.spawnParticles(e.x + e.aimX * 0.95, 1.2, e.z + e.aimZ * 0.95, 12, 0x66ff33, 7, 0.22);
      for (const offset of [-0.16, 0, 0.16]) {
        const dx = Math.sin(baseYaw + offset);
        const dz = Math.cos(baseYaw + offset);
        this.spawnProjectile(false, 'enemy_bolt', e.x + dx * 0.95, 1.15, e.z + dz * 0.95, dx * boltSpeed, dz * boltSpeed, 1, 0, 0x66ff33);
      }
      e.state = 'cooldown';
      e.stateTimer = cfg.cooldownTime + 0.4;
      e.hasToken = false;
    } else if (e.archetype === 'spore') {
      // Lobs a glob of purple mist that lingers where it lands
      const leadX = this.playerX + (Math.random() - 0.5) * 2;
      const leadZ = this.playerZ + (Math.random() - 0.5) * 2;
      this.spawnParticles(e.x, 1.4, e.z, 10, 0xb04dff, 6, 0.3);
      this.spawnMortarHazard(leadX, leadZ, 'poison');
      e.state = 'cooldown';
      e.stateTimer = cfg.cooldownTime + 1.6;
      e.hasToken = false;
    } else if (e.archetype === 'tesla') {
      // Volt Wraith fires twin fast high-voltage bolts
      const baseYaw = Math.atan2(e.aimX, e.aimZ);
      const boltSpeed = 24 + Math.min(this.wave * 0.9, 10);
      this.spawnParticles(e.x + e.aimX * 0.85, 1.35, e.z + e.aimZ * 0.85, 10, cfg.accentColor, 7, 0.2);
      for (const offset of [-0.11, 0.11]) {
        const ang = baseYaw + offset;
        const dx = Math.sin(ang);
        const dz = Math.cos(ang);
        this.spawnProjectile(
          false,
          'enemy_bolt',
          e.x + dx * 0.9,
          1.28,
          e.z + dz * 0.9,
          dx * boltSpeed,
          dz * boltSpeed,
          1,
          0,
          0x38bdf8
        );
      }
      e.state = 'cooldown';
      e.stateTimer = cfg.cooldownTime;
      e.hasToken = false;
    } else if (e.archetype === 'juggernaut') {
      // Artillery: rockets fired skyward from the stacks rain down on marked spots around you
      for (let k = 0; k < 10; k++) this.spawnParticles(e.x, 3.2, e.z, 1, k % 2 ? 0xff8c1a : 0xffd23a, 6, 0.35);
      for (let k = 0; k < 4; k++) this.fx.puff(e.x, 3.3, e.z, 0.6, 0x2a2624, { x: 0, z: 0 });
      synthAudio.playArtilleryLaunch();
      this.spawnMortarHazard(this.playerX, this.playerZ, 'artillery');
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.4 + Math.random() * 1.6;
        this.spawnMortarHazard(this.playerX + Math.cos(a) * r, this.playerZ + Math.sin(a) * r, 'artillery');
      }
      e.state = 'cooldown';
      e.stateTimer = cfg.cooldownTime + 0.8;
      e.hasToken = false;
    } else if (e.archetype === 'charger' || e.archetype === 'mantis') {
      const dashSpd = e.archetype === 'mantis' ? 23.5 : 21;
      e.vx = e.aimX * dashSpd;
      e.vz = e.aimZ * dashSpd;
      e.state = 'attack';
      e.stateTimer = e.archetype === 'mantis' ? 0.44 : 0.48;
    } else if (e.archetype === 'boss') {
      const phase = e.bossPhase ?? 0;
      e.bossPhase = (phase + 1) % 4;

      if (phase === 0) {
        // Phase 0: Massive Parabolic Leap Slam (chains 2 leaps when Enraged!)
        e.leapActive = true;
        e.leapStartX = e.x;
        e.leapStartZ = e.z;
        e.leapTimer = 0;
        e.leapDuration = e.enraged ? 0.6 : 0.7;
        e.leapChainLeft = e.enraged ? 1 : 0;
        e.state = 'attack';
        this.spawnParticles(e.x, 0.4, e.z, 20, 0xff1e3c, 10, 0.35);
      } else if (phase === 1) {
        // Phase 1: Rapid Multi-Burst Sweeping Rajadas while spinning faces
        e.barrageVolleysLeft = e.enraged ? 5 : 4;
        e.barrageTimer = 0;
        e.state = 'attack';
      } else if (phase === 2) {
        // Phase 2: 8-Way Cross-Bolt Ring + Armored Bull-Rush
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const dx = Math.sin(ang);
          const dz = Math.cos(ang);
          this.spawnProjectile(
            false,
            'enemy_bolt',
            e.x + dx * 1.5,
            1.4,
            e.z + dz * 1.5,
            dx * 19,
            dz * 19,
            1,
            0,
            0xff1e3c
          );
        }
        e.vx = e.aimX * (e.enraged ? 26 : 23.5);
        e.vz = e.aimZ * (e.enraged ? 26 : 23.5);
        e.state = 'attack';
        e.stateTimer = 0.56;
      } else {
        // Phase 3: Quad Mortar Storm + 5-Bolt Fan Volley
        this.spawnMortarHazard(e.aimX, e.aimZ);
        this.spawnMortarHazard(e.aimX + 3.8, e.aimZ - 2.4);
        this.spawnMortarHazard(e.aimX - 3.8, e.aimZ + 2.4);
        this.spawnMortarHazard(e.aimX, e.aimZ + 4.0);
        const fanYaw = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
        for (let k = -2; k <= 2; k++) {
          const ang = fanYaw + k * 0.22;
          const dx = Math.sin(ang);
          const dz = Math.cos(ang);
          this.spawnProjectile(
            false,
            'enemy_bolt',
            e.x + dx * 1.5,
            1.4,
            e.z + dz * 1.5,
            dx * 21,
            dz * 21,
            1,
            0,
            0xffffff
          );
        }
        e.state = 'cooldown';
        e.stateTimer = cfg.cooldownTime;
        e.hasToken = false;
      }
    } else {
      // Skull-ship finishes channelling: the ally is empowered, then it lies low for a while
      const target = this.enemies.find((o) => o.id === e.buffTargetId);
      if (target && target.state !== 'ko' && !target.buffed) this.applyBuff(target);
      e.buffTargetId = undefined;
      e.state = 'cooldown';
      e.stateTimer = 7;
      e.hasToken = false;
    }
  }

  /**
   * Something falling from the sky onto a marked spot:
   *  plasma    — the boss's mortar (pink ring + orb)
   *  artillery — juggernaut rocket (red crosshair ring, nose-down rocket, whistles in)
   *  poison    — spore glob (purple ring + blob) that bursts into a lingering mist cloud
   */
  private spawnMortarHazard(tx: number, tz: number, style: MortarHazard['style'] = 'plasma') {
    const clamped = resolveCircleObstacleCollision(tx, tz, 1.5, [], ARENA_RADIUS);
    const ringColor = style === 'artillery' ? 0xff3b1f : style === 'poison' ? 0xb04dff : 0xff33cc;
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(clamped.x, 0.05, clamped.z);
    ringMesh.scale.setScalar(2.6);
    if (style === 'artillery') {
      // Crosshair inside the ring (ring is in its local XY plane)
      for (const [w, h] of [
        [1.6, 0.08],
        [0.08, 1.6],
      ]) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ringMat);
        ringMesh.add(bar);
      }
    }
    this.scene.add(ringMesh);

    let shellMesh: THREE.Mesh;
    if (style === 'artillery') {
      shellMesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.95, 6), new THREE.MeshBasicMaterial({ color: 0x3a3a40 }));
      shellMesh.rotation.x = Math.PI; // nose down
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }));
      flame.position.y = -0.55; // tail (cone is flipped, so local -Y is up)
      shellMesh.add(flame);
    } else {
      shellMesh = new THREE.Mesh(
        new THREE.SphereGeometry(style === 'poison' ? 0.42 : 0.32, 8, 8),
        new THREE.MeshBasicMaterial({ color: style === 'poison' ? 0xc77dff : 0xff88ee })
      );
    }
    shellMesh.position.set(clamped.x, 12, clamped.z);
    this.scene.add(shellMesh);

    this.mortars.push({
      x: clamped.x,
      z: clamped.z,
      timer: style === 'artillery' ? -Math.random() * 0.25 : 0, // stagger salvo impacts
      duration: style === 'artillery' ? 1.3 : style === 'poison' ? 0.8 : 0.85,
      radius: style === 'artillery' ? 2.3 : style === 'poison' ? 3.0 : 2.7,
      ringMesh,
      shellMesh,
      style,
    });
  }

  private updateMortars(dt: number) {
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      m.timer += dt;
      const t = Math.max(0, Math.min(1, m.timer / m.duration));
      m.shellMesh.position.y = (1 - t * t) * 12;
      m.ringMesh.scale.setScalar(m.radius * (0.4 + 0.6 * t));
      const rMat = m.ringMesh.material as THREE.MeshBasicMaterial;
      rMat.opacity = 0.55 + Math.abs(Math.sin(t * Math.PI * 6)) * 0.42;
      if (m.style === 'artillery') {
        if (!m.whistled && m.timer >= m.duration - 0.6) {
          m.whistled = true;
          synthAudio.playIncoming(0.6);
        }
        if (Math.random() < dt * 30) this.spawnParticles(m.x, m.shellMesh.position.y + 0.6, m.z, 1, 0x8a8278, 1, 0.4);
      }

      if (m.timer >= m.duration) {
        if (m.style === 'poison') {
          // No hit: it bursts into a cloud of lingering mist
          this.spawnParticles(m.x, 0.6, m.z, 16, 0xb04dff, 7, 0.4);
          this.poisonClouds.spawn(m.x, m.z, m.radius);
          synthAudio.playPoisonSplat();
        } else {
          this.spawnParticles(m.x, 0.4, m.z, 18, m.style === 'artillery' ? 0xff8c1a : 0xff33cc, 10, 0.42);
          if (m.style === 'artillery') {
            this.fx.stampMark(m.x, m.z, 1.4, 1, Math.random() * Math.PI, 0x14100c);
            for (let k = 0; k < 3; k++) this.fx.puff(m.x, 0.4, m.z, 0.7, 0x3a3836);
            this.trauma = Math.min(1, this.trauma + 0.3);
          }
          synthAudio.playExplosion();
          const dist = Math.hypot(this.playerX - m.x, this.playerZ - m.z);
          if (dist <= m.radius) {
            this.damagePlayer(1, this.playerX - m.x, this.playerZ - m.z);
          }
        }
        this.scene.remove(m.ringMesh);
        this.scene.remove(m.shellMesh);
        m.ringMesh.material && (m.ringMesh.material as THREE.Material).dispose();
        m.shellMesh.geometry.dispose();
        (m.shellMesh.material as THREE.Material).dispose();
        this.mortars.splice(i, 1);
      }
    }
  }

  private updateProjectiles(dt: number) {
    this.currentShooter = null;
    for (const p of this.projectiles) {
      if (!p.active) continue;

      const prevX = p.x;
      const prevZ = p.z;
      if (p.weapon === 'disco') p.coreMesh.rotation.y += dt * 28;
      if (p.fromPlayer && this.upgrades.has('homing') && p.splashRadius <= 0 && p.weapon !== 'railgun' && p.weapon !== 'harpoon') this.steerHoming(p, dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      p.group.position.set(p.x, p.y, p.z);

      if (!p.fromPlayer) {
        // Spinning outer ring + subtle emissive particle wake on enemy fire
        p.haloMesh.rotation.z += dt * 10.5;
        p.haloMesh.rotation.x = Math.PI / 2 + Math.sin(this.elapsedSec * 14 + p.x) * 0.45;
        if (Math.random() < 0.48) {
          this.spawnParticles(p.x, p.y, p.z, 1, p.colorHex, 1.5, 0.16);
        }
      } else {
        if (p.haloMesh.visible) {
          p.haloMesh.rotation.z += dt * 8.0;
        }
        if (p.weapon === 'rocket' && Math.random() < 0.75) {
          this.spawnParticles(p.x, p.y, p.z, 1, 0xffaa33, 2, 0.2);
        } else if (p.weapon === 'railgun' && Math.random() < 0.65) {
          this.spawnParticles(p.x, p.y, p.z, 1, 0xbcff2e, 1.4, 0.14);
        } else if (p.weapon === 'forkbomb' && Math.random() < 0.6) {
          this.spawnParticles(p.x, p.y, p.z, 1, 0x4dff7a, 1.2, 0.18);
        }
      }

      let hit = false;

      // Reflects the shot off a surface with normal (nx, nz) — Ricochet Rounds
      const bounce = (nx: number, nz: number) => {
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        const dot = p.vx * nx + p.vz * nz;
        p.vx -= 2 * dot * nx;
        p.vz -= 2 * dot * nz;
        p.x = prevX;
        p.z = prevZ;
        p.bounces -= 1;
        p.group.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
        this.spawnParticles(p.x, p.y, p.z, 3, 0xffffff, 4, 0.12);
      };

      if (p.life <= 0) {
        // fork(): the process splits in two instead of dying (until the last generation)
        if (p.weapon === 'forkbomb' && p.forkGen < NeonMesaEngine.FORK_MAX_GEN) {
          this.forkProcess(p);
          continue;
        }
        hit = true;
      } else if (p.x * p.x + p.z * p.z > ARENA_RADIUS * ARENA_RADIUS) {
        if (p.fromPlayer && p.bounces > 0) bounce(-p.x, -p.z);
        else hit = true;
      }

      // Check 8-Plank Wooden Barricade in Clearing Stage (takes damage & sprays wood splinters!)
      if (
        !hit &&
        p.fromPlayer &&
        this.zone === 'clearing' &&
        this.barricadeHp > 0 &&
        Math.abs(p.x) <= 5.9 &&
        ((prevZ >= -19.5 && p.z <= -17.5) || (prevZ <= -17.5 && p.z >= -19.5) || (p.z <= -17.5 && p.z >= -19.5))
      ) {
        hit = true;
        this.damageBarricade(p.damage, p.x, p.y, -18.3);
      }

      // Check obstacle collisions (ghost rounds drift straight through)
      if (!hit && !(p.fromPlayer && this.upgrades.has('ghostAmmo'))) {
        for (let oi = this.obstacles.length - 1; oi >= 0; oi--) {
          const obs = this.obstacles[oi];
          if (segmentCircleIntersect(prevX, prevZ, p.x, p.z, obs.x, obs.z, obs.radius * 0.85)) {
            if (p.fromPlayer && p.bounces > 0 && !obs.destructible) {
              bounce(prevX - obs.x, prevZ - obs.z);
              break;
            }
            hit = true;
            if (p.fromPlayer && obs.destructible) {
              obs.hp -= p.damage;
              const chipColor =
                obs.kind === 'tombstone' ? 0x22e3d4 : obs.kind === 'datacache' ? 0x00f5ff : 0xff8424;
              this.spawnParticles(obs.x, 0.9, obs.z, 6, chipColor, 6, 0.25);
              if (obs.hp <= 0) {
                if (obs.explosive) {
                  this.detonateCrate(oi);
                } else {
                  this.destroySectorProp(oi);
                }
              }
            }
            break;
          }
        }
      }

      if (!hit && p.fromPlayer) {
        for (const e of this.enemies) {
          if (e.state === 'ko' || (e.emergeTimer && e.emergeTimer > 0) || p.piercedIds.has(e.id)) continue;
          if (segmentCircleIntersect(prevX, prevZ, p.x, p.z, e.x, e.z, e.radius + (p.group.scale.x > 1.2 ? 0.55 : 0.22))) {
            this.hitSource = p.weapon;
            if (p.splashRadius <= 0) this.onAmmoHit(e, p.damage);
            if (p.piercing) {
              p.piercedIds.add(e.id);
              this.damageEnemy(e, p.damage, p.vx, p.vz);
              this.spawnParticles(e.x, 1.1, e.z, 8, 0xbcff2e, 8, 0.22);
            } else {
              if (p.splashRadius <= 0) {
                this.damageEnemy(e, p.damage, p.vx, p.vz);
              }
              // Pinball rounds keep going to the next target instead of stopping
              if (p.splashRadius <= 0 && this.pinballBounce(p, e)) {
                this.hitSource = null;
                break;
              }
              hit = true;
              if (p.weapon === 'harpoon') this.harpoonHit(e);
              this.hitSource = null;
              break;
            }
            this.hitSource = null;
          }
        }
      } else if (!hit && !p.fromPlayer) {
        if (segmentCircleIntersect(prevX, prevZ, p.x, p.z, this.playerX, this.playerZ, PLAYER_RADIUS)) {
          if (this.ironSkinTimer > 0) {
            // Lead Skin: the bullet rings off you and flies back as yours
            p.fromPlayer = true;
            p.vx *= -1.25;
            p.vz *= -1.25;
            p.damage = 30;
            p.life = 1.2;
            p.piercedIds.clear();
            this.spawnParticles(p.x, p.y, p.z, 5, 0xd8dce4, 6, 0.15);
            synthAudio.playParry(1);
          } else {
            hit = true;
            this.damagePlayer(Math.min(2, Math.max(1, Math.round(p.damage))), p.vx, p.vz);
          }
        }
      }

      if (hit) {
        if (p.splashRadius > 0) {
          this.hitSource = p.weapon;
          this.triggerExplosion(p.x, p.z, p.splashRadius, p.damage, p.weapon === 'forkbomb');
          this.hitSource = null;
        } else {
          this.spawnParticles(p.x, p.y, p.z, p.fromPlayer ? 4 : 7, p.colorHex, 5.5, 0.2);
          if (p.fromPlayer) this.spawnParticles(p.x, p.y, p.z, 3, 0xffffff, 8, 0.1); // hot white impact spark
        }
        p.active = false;
        p.group.visible = false;
      }
    }
  }

  private damageBarricade(amount: number, hx: number, hy: number, hz: number) {
    if (this.barricadeHp <= 0 || this.zone !== 'clearing') return;
    const prevPlanks = getBarricadePlanksRemaining(this.barricadeHp);
    this.barricadeHp = Math.max(0, this.barricadeHp - amount);
    this.barricadeFlashTimer = 0.08;
    synthAudio.playWoodSplinter();

    // Spray brown wood splinter ("farpa") particles
    this.spawnParticles(hx, Math.max(0.8, hy), hz + 0.35, 10, 0x9c6631, 8.5, 0.42);
    this.spawnParticles(hx, Math.max(0.8, hy), hz + 0.35, 6, 0xd4a373, 7.2, 0.35);

    const nextPlanks = getBarricadePlanksRemaining(this.barricadeHp);
    for (let i = 0; i < this.barricadePlanks.length; i++) {
      this.barricadePlanks[i].visible = i < nextPlanks;
    }
    if (nextPlanks < prevPlanks) {
      this.trauma = Math.min(1, this.trauma + 0.25);
      this.spawnParticles(0, 1.5 + nextPlanks * 0.55, -18.3, 24, 0x7c4d25, 10.5, 0.52);
    }

    if (this.barricadeHp <= 0) {
      this.treeBarricadeGroup.visible = false;
      this.waveQueue = [];
      this.portalOpen = true;
      this.trauma = 0.9;
      this.score += 750;
      synthAudio.playExplosion();
      synthAudio.playPortalOpen();
      this.spawnParticles(0, 2.2, -18.5, 46, 0x8b5a2b, 14, 0.65);
      this.spawnParticles(0, 2.5, -18.5, 24, 0xe6ccb2, 12, 0.55);
      this.waveBanner = 'BARRICADA DESTRUÍDA ↑ ENTRE NA ÁRVORE BINÁRIA';
      this.waveBannerTimer = 4.5;
    }
    this.emitHud();
  }

  private detonateCrate(obsIndex: number) {
    const obs = this.obstacles[obsIndex];
    this.scene.remove(obs.group);
    this.obstacles.splice(obsIndex, 1);
    this.triggerExplosion(obs.x, obs.z, 5.2, 130);
  }

  private destroySectorProp(obsIndex: number) {
    const obs = this.obstacles[obsIndex];
    this.scene.remove(obs.group);
    this.obstacles.splice(obsIndex, 1);

    if (obs.kind === 'tombstone') {
      synthAudio.playTombstoneBreak();
      this.spawnParticles(obs.x, 0.9, obs.z, 18, 0x94a3b8, 8.5, 0.36);
      this.spawnParticles(obs.x, 1.1, obs.z, 10, 0x22e3d4, 6.5, 0.42);
      this.score += 90;
      this.coins.drop(obs.x, obs.z, 5);
      const roll = Math.random();
      if (roll < 0.24) {
        this.spawnPickup('med', obs.x, obs.z, 22);
      } else if (roll < 0.46) {
        this.spawnPickup(selectArenaWeaponSpawn(this.wave), obs.x, obs.z, 24);
      }
      this.emitHud();
    } else if (obs.kind === 'datacache') {
      synthAudio.playCacheLoot();
      this.spawnParticles(obs.x, 0.9, obs.z, 18, 0x22e3d4, 8.5, 0.35);
      this.spawnParticles(obs.x, 1.1, obs.z, 12, 0xffaa2b, 7.5, 0.38);
      this.score += 140;
      this.coins.drop(obs.x, obs.z, 8);
      const roll = Math.random();
      const dropKind = this.playerHp < this.playerMaxHp && roll < 0.4
        ? 'med'
        : this.needsAmmo() && roll < 0.75
          ? 'ammo'
          : selectArenaWeaponSpawn(this.wave);
      this.spawnPickup(dropKind, obs.x, obs.z, 26);
      this.emitHud();
    }
  }

  // ───────────────────────── New arsenal: fork(), harpoon, nail gun ─────────────────────────

  /** fork(): the process dies and spawns two children, fanning out (tighter each generation). */
  private forkProcess(p: ProjectileEntity) {
    p.active = false;
    p.group.visible = false;
    // Each generation slows down so the eight final pops land ~15 units out, where you aimed
    const speed = Math.hypot(p.vx, p.vz) * 0.85;
    const yaw = Math.atan2(p.vx, p.vz);
    const gen = p.forkGen + 1;
    // Like a real fork(): the parent carries on along its path and the child branches off to a
    // side — so the fan always keeps a process running down the line you aimed at
    const spread = [0.42, 0.34, 0.26][gen - 1] ?? 0.26;
    const side = Math.random() < 0.5 ? -1 : 1;
    for (const s of [0, side]) {
      const a = yaw + s * spread;
      const child = this.spawnProjectile(true, 'forkbomb', p.x, p.y, p.z, Math.sin(a) * speed, Math.cos(a) * speed, p.damage, p.splashRadius, p.colorHex);
      if (child) {
        child.forkGen = gen;
        // the last generation flies a bit longer before it terminates
        child.life = NeonMesaEngine.FORK_STEP * (gen === NeonMesaEngine.FORK_MAX_GEN ? 1.7 : 1);
        child.coreMesh.scale.setScalar(1.15 - gen * 0.12);
      }
    }
    this.spawnParticles(p.x, p.y, p.z, 6, 0x4dff7a, 4, 0.2);
    synthAudio.playForkSplit(gen);
  }

  /** Harpoon struck flesh: reel the target in (bosses are too heavy — they just take it). */
  private harpoonHit(e: EnemyEntity) {
    this.harpoonProj = null;
    synthAudio.playHarpoonReel();
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.06);
    if (e.archetype === 'boss' || e.state === 'ko' || e.husk) return;
    e.state = 'cooldown';
    e.stateTimer = 1.15; // dazed on arrival
    e.hasToken = false;
    e.vx = 0;
    e.vz = 0;
    if (e.telegraphLine) e.telegraphLine.visible = false;
    if (e.alert) e.alert.visible = false;
    if (e.chantRing) e.chantRing.visible = false;
    if (e.beam) e.beam.visible = false;
    this.harpoonPull = { e, t: 0, sx: e.x, sz: e.z };
  }

  /** Rope from the gun to the flying harpoon, then to the enemy being dragged in. */
  private updateHarpoon(dt: number) {
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    let tx: number | null = null;
    let tz = 0;
    if (this.harpoonProj) {
      if (!this.harpoonProj.active || this.harpoonProj.weapon !== 'harpoon') this.harpoonProj = null;
      else {
        tx = this.harpoonProj.x;
        tz = this.harpoonProj.z;
      }
    }
    const pull = this.harpoonPull;
    if (pull) {
      const e = pull.e;
      if (e.state === 'ko' || !this.enemies.includes(e)) {
        this.harpoonPull = null;
      } else {
        pull.t += dt;
        const u = Math.min(1, pull.t / 0.26);
        const k = 1 - (1 - u) * (1 - u);
        const reach = 1.4 + e.radius;
        const goalX = this.playerX + fx * reach;
        const goalZ = this.playerZ + fz * reach;
        e.x = pull.sx + (goalX - pull.sx) * k;
        e.z = pull.sz + (goalZ - pull.sz) * k;
        e.vx = 0;
        e.vz = 0;
        e.mesh.position.set(e.x, Math.sin(u * Math.PI) * 0.35, e.z);
        e.shadow.position.set(e.x, 0.02, e.z);
        tx = e.x;
        tz = e.z;
        if (Math.random() < 0.6) this.spawnParticles(e.x, 0.3, e.z, 1, 0x6b6560, 3, 0.3);
        if (u >= 1) {
          this.harpoonPull = null;
          this.trauma = Math.min(1, this.trauma + 0.25);
          this.spawnParticles(e.x, 0.4, e.z, 10, 0x6b6560, 6, 0.4);
        }
      }
    }
    if (tx === null) {
      this.harpoonRope.visible = false;
      return;
    }
    const ox = this.playerX + fx * 0.9;
    const oz = this.playerZ + fz * 0.9;
    const rope = this.harpoonRope;
    rope.position.set(ox, 1.1, oz);
    rope.lookAt(tx, 1.05, tz);
    rope.scale.set(1, 1, Math.max(0.05, Math.hypot(tx - ox, tz - oz)));
    rope.visible = true;
  }

  private pinnedCorpses: { mesh: THREE.Group; x: number; z: number; yaw: number; t: number }[] = [];
  private nailGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5).rotateX(Math.PI / 2);
  private nailMat = new THREE.MeshStandardMaterial({ color: 0xcfcbc0, metalness: 0.8, roughness: 0.3 });

  /**
   * Nail gun kill: if there's a wall or an obstacle just behind the body (along the shot), the
   * corpse is nailed to it and stays there a while. The enemy itself leaves the list right away
   * (so the wave can still clear) — the body lives on as a separate decoration.
   */
  private tryPinCorpse(e: EnemyEntity, dirX: number, dirZ: number): boolean {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    for (let d = 0.3; d <= 3.6; d += 0.15) {
      const px = e.x + nx * d;
      const pz = e.z + nz * d;
      const wall = px * px + pz * pz > (ARENA_RADIUS - 0.3) * (ARENA_RADIUS - 0.3);
      const obs = !wall && this.obstacles.some((o) => Math.hypot(o.x - px, o.z - pz) < o.radius * 0.9);
      if (!wall && !obs) continue;
      const back = Math.max(0, d - e.radius * 0.7);
      const cx = e.x + nx * back;
      const cz = e.z + nz * back;
      const corpse = e.mesh;
      // Nails driven through the chest, heads sticking out toward us
      for (let k = 0; k < 3; k++) {
        const nail = new THREE.Mesh(this.nailGeo, this.nailMat);
        nail.position.set((k - 1) * 0.22, 0.7 + k * 0.28, e.radius * 0.8);
        corpse.add(nail);
      }
      this.setGroupEmissiveFlash(corpse, false);
      corpse.scale.set(1, 1, 1);
      this.pinnedCorpses.push({ mesh: corpse, x: cx, z: cz, yaw: Math.atan2(-nx, -nz), t: 7 });
      // Hand the enemy dummies: its KO cleanup next frame won't touch the pinned body
      this.scene.remove(e.shadow);
      e.mesh = new THREE.Group();
      e.shadow = new THREE.Mesh();
      e.koTimer = 0;
      this.fx.splatter(e.x + nx * d, e.z + nz * d, nx, nz, 1.3);
      this.spawnParticles(cx + nx * 0.4, 1.0, cz + nz * 0.4, 8, 0xffffff, 6, 0.18);
      synthAudio.playNailPin();
      return true;
    }
    return false;
  }

  private updatePinnedCorpses(dt: number) {
    for (let i = this.pinnedCorpses.length - 1; i >= 0; i--) {
      const c = this.pinnedCorpses[i];
      c.t -= dt;
      const twitch = c.t > 6.3 ? (Math.random() - 0.5) * 0.06 : 0;
      c.mesh.position.set(c.x + twitch, 0.3, c.z + twitch);
      c.mesh.rotation.set(-0.2, c.yaw, 0.05); // slumped back against the wall
      if (c.t < 0.6) c.mesh.scale.setScalar(Math.max(0.01, c.t / 0.6));
      if (c.t <= 0) {
        this.scene.remove(c.mesh);
        this.pinnedCorpses.splice(i, 1);
      }
    }
  }

  private clearPinnedCorpses() {
    for (const c of this.pinnedCorpses) this.scene.remove(c.mesh);
    this.pinnedCorpses = [];
    this.harpoonProj = null;
    this.harpoonPull = null;
    if (this.harpoonRope) this.harpoonRope.visible = false;
  }

  private triggerExplosion(x: number, z: number, radius: number, damage: number, small = false) {
    if (small) {
      // fork() process terminating: a tight green-and-orange pop (there are up to 8 at once)
      this.spawnParticles(x, 0.8, z, 14, 0x4dff7a, 8, 0.32);
      this.spawnParticles(x, 0.8, z, 8, 0xff8a2b, 7, 0.28);
      this.fx.stampMark(x, z, 0.9, 1, Math.random() * Math.PI, 0x14100c);
      this.trauma = Math.min(1, this.trauma + 0.12);
      synthAudio.playForkPop();
      for (const e of this.enemies) {
        if (e.state === 'ko') continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d <= radius + e.radius * 0.5) this.damageEnemy(e, Math.round(damage * (1 - (d / (radius + 1)) * 0.4)), e.x - x, e.z - z);
      }
      if (this.zone === 'clearing' && this.barricadeHp > 0 && Math.hypot(0 - x, -18.5 - z) <= radius + 4.8) {
        this.damageBarricade(damage * 0.5, x, 1.4, z);
      }
      return;
    }
    this.spawnParticles(x, 0.8, z, 28, 0xff6b2b, 12.5, 0.48);
    this.spawnParticles(x, 0.8, z, 14, 0xff2a85, 9.5, 0.38);
    const impactShake = computeWeaponScreenshake(
      { ...WEAPONS.rocket, damage: Math.max(damage, WEAPONS.rocket.damage) },
      'impact'
    );
    this.trauma = Math.min(1, Math.max(this.trauma, 0.82) + impactShake.trauma * 0.32);
    this.hitstopTimer = Math.max(this.hitstopTimer, impactShake.hitstopSec);
    const dx = this.playerX - x;
    const dz = this.playerZ - z;
    const dLen = Math.hypot(dx, dz) || 1;
    this.camPosX += (dx / dLen) * impactShake.cameraKick * 0.75;
    this.camPosZ += (dz / dLen) * impactShake.cameraKick * 0.75;
    synthAudio.playExplosion();

    if (this.zone === 'clearing' && this.barricadeHp > 0 && Math.hypot(0 - x, -18.5 - z) <= radius + 4.8) {
      this.damageBarricade(damage, x, 1.4, z);
    }

    for (const e of this.enemies) {
      if (e.state === 'ko') continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d <= radius) {
        const falloff = 1 - (d / radius) * 0.45;
        this.damageEnemy(e, Math.round(damage * falloff), e.x - x, e.z - z);
      }
    }
  }

  private damageEnemy(e: EnemyEntity, amount: number, dirX: number, dirZ: number) {
    if (e.state === 'ko') return;
    // Actives recharge on damage dealt (Gungeon-style)
    if (this.activeItem && this.activeCharge < this.activeMax) {
      this.activeCharge = Math.min(this.activeMax, this.activeCharge + Math.min(amount, Math.max(0, e.hp), 30));
      if (this.activeCharge >= this.activeMax) synthAudio.playWeaponPickup('plasma', 'reload');
    }
    e.hp -= amount;
    // Charm rounds: sometimes the fight just leaves them
    if (e.hp > 0 && this.upgrades.has('charm') && e.archetype !== 'boss' && !e.hexer && Math.random() < 0.08) this.pacifyEnemy(e, 4);
    e.hitFlashTimer = 0.055;
    this.setGroupEmissiveFlash(e.mesh, true, 0xffffff);
    // Flinch away from the hit
    const hitLen = Math.hypot(dirX, dirZ) || 1;
    e.hitReact = 0.14;
    e.hitDirX = dirX / hitLen;
    e.hitDirZ = dirZ / hitLen;
    if (e.archetype === 'boss' && e.hp > 0) {
      // Metal on metal: sparks off the side that got hit
      this.spawnParticles(e.x - e.hitDirX * e.radius * 0.8, 2.2, e.z - e.hitDirZ * e.radius * 0.8, 4, Math.random() < 0.5 ? 0xffd27a : 0xffffff, 7, 0.18);
    }

    // Blood: light spray on hits, heavy splatter + pool on kills
    const killed = e.hp <= 0;
    this.fx.splatter(
      e.x,
      e.z,
      dirX,
      dirZ,
      killed ? (e.archetype === 'boss' ? 3.2 : 1.6) : Math.min(1, 0.35 + amount / 120)
    );

    if (!(e.archetype === 'boss' && e.leapActive)) {
      const len = Math.hypot(dirX, dirZ) || 1;
      const kb = e.archetype === 'boss' ? 0.14 : 0.35;
      e.x += (dirX / len) * kb;
      e.z += (dirZ / len) * kb;
    }

    if (e.hp <= 0) {
      e.state = 'ko';
      e.koTimer = 0.34;
      e.hasToken = false;
      e.leapActive = false;
      if (e.telegraphLine) e.telegraphLine.visible = false;
      if (e.leapRingMesh) e.leapRingMesh.visible = false;
      if (e.alert) e.alert.visible = false;
      if (e.chantRing) e.chantRing.visible = false;
      if (e.beam) e.beam.visible = false;
      if (e.buffIcon) e.buffIcon.visible = false;
      if (e.archetype === 'spider') {
        // Doesn't just die: lights a 1.5 s fuse and blows up
        e.bombTimer = 1.5;
        e.koTimer = Number.POSITIVE_INFINITY;
      } else if (this.hitSource === 'nailgun' && e.archetype !== 'boss') {
        this.tryPinCorpse(e, dirX, dirZ);
      }

      const cfg = ENEMY_CONFIGS[e.archetype];
      const comboRes = calculateComboKillScore(cfg.scoreValue, this.combo);
      this.combo = comboRes.nextCombo;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = COMBO_WINDOW;
      this.score += comboRes.pointsAwarded;
      this.kills += 1;
      this.progress.totalKills += 1;
      this.trackAchievement('first_blood');
      if (this.progress.totalKills >= 50) this.trackAchievement('kills_50');
      if (this.progress.totalKills >= 250) this.trackAchievement('kills_250');
      if (this.combo >= 10) this.trackAchievement('combo_10');
      this.dropKillCredits(e, cfg.scoreValue / 32);

      // Blood Chamber: every 12 kills patches 1 integrity
      if (this.upgrades.has('vampire')) {
        this.vampireKills += 1;
        if (this.vampireKills >= 12) {
          this.vampireKills = 0;
          if (this.playerHp < this.playerMaxHp) {
            this.playerHp += 1;
            this.spawnParticles(this.playerX, 1.2, this.playerZ, 12, 0xe0283a, 6, 0.4);
            synthAudio.playHealthPickup();
          }
        }
      }
      // Volatile Rounds: the corpse goes off (queued; processed next frame)
      if (this.upgrades.has('volatile') && e.archetype !== 'boss' && e.archetype !== 'spider') {
        this.pendingBlasts.push({ x: e.x, z: e.z });
      }

      if (e.archetype === 'boss' && e.v2) {
        // Second coming: this time he goes down for good
        e.bossLine = null;
        this.trauma = 1.0;
        this.spawnParticles(e.x, 1.8, e.z, 40, 0xff6a1a, 14, 0.6);
        synthAudio.playExplosion();
        this.spawnPickup('med', e.x - 2.2, e.z + 1.8);
        this.trackAchievement('faces_2');
        this.beginBoss2Death(e);
      } else if (e.archetype === 'boss') {
        // Not dead: he short-circuits, collapses and shuts down (and will be back)
        e.bossLine = null;
        this.trauma = 1.0;
        this.spawnParticles(e.x, 1.8, e.z, 44, 0xff1e3c, 15, 0.62);
        this.spawnParticles(e.x, 1.5, e.z, 26, 0xffffff, 12, 0.5);
        synthAudio.playExplosion();
        this.spawnPickup('med', e.x - 1.6, e.z + 1.2);
        this.spawnPickup(Math.random() < 0.5 ? 'rocket' : 'railgun', e.x + 1.6, e.z + 1.2);
        this.trackAchievement('faces_1');
        this.boss1Down = true;
        this.beginBossDeath(e);
      } else {
        // Loot: now and then a fallen enemy leaves integrity or ammo behind
        const luck = this.upgrades.has('clover') ? 1.5 : 1;
        const lootRoll = hazardAt(e.x, e.z, this.hazardDefs, -0.8) ? NaN : Math.random(); // nothing drops into a pit (NaN fails every roll)
        if (this.playerHp < this.playerMaxHp && lootRoll < 0.035 * luck) this.spawnPickup('med', e.x, e.z, 14);
        else if (this.needsAmmo() && lootRoll > 1 - 0.07 * luck) this.spawnPickup('ammo', e.x, e.z, 14);
        if (this.hitSource !== 'nailgun') {
          // (the nail gun kills too often to shake the screen on every one)
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);
          this.trauma = Math.min(1, this.trauma + 0.28);
        }
        this.spawnParticles(e.x, 1.0, e.z, 16, cfg.accentColor, 8.5, 0.34);
        synthAudio.playHit(true);

        // Rare chance for defeated enemy to drop an arena weapon (5%) or Med pickup (11%)
        const roll = Math.random();
        if (roll < 0.16) {
          const kind = roll < 0.05 ? selectArenaWeaponSpawn(this.wave) : 'med';
          this.spawnPickup(kind, e.x, e.z);
        }
      }
      synthAudio.setComboIntensity(this.combo);

      // Final enemy of the wave → slow-motion kill cam (not during the barricade's endless trickle)
      const othersAlive = this.enemies.some((o) => o !== e && o.state !== 'ko');
      const trickling = this.zone === 'clearing' && this.barricadeHp > 0;
      if (!othersAlive && this.waveQueue.length === 0 && !trickling && e.archetype !== 'boss') {
        this.startSlowMo(e.x, e.z, SLOWMO_DURATION);
      }

      this.checkProgressUnlocks();
      this.emitHud();
    } else {
      this.spawnParticles(e.x, 1.0, e.z, 5, 0xffaa2b, 6, 0.2);
      synthAudio.playHit(false);
    }
  }

  private damagePlayer(amount: number, dirX: number, dirZ: number) {
    if (this.invulnTimer > 0 || this.dashTimer > 0 || this.phase !== 'playing') return;
    if (this.currentShooter?.hexed) amount *= 2; // cursed by the hexer: double damage

    // Firewall: eats one hit, then recharges after a quiet spell
    if (this.upgrades.has('firewall') && this.firewallReady) {
      this.firewallReady = false;
      this.firewallTimer = 15;
      this.invulnTimer = 0.7;
      this.trauma = Math.min(1, this.trauma + 0.4);
      this.spawnParticles(this.playerX, 1.2, this.playerZ, 18, 0x2ee6d6, 9, 0.35);
      this.pickupBanner = 'FIREWALL BLOQUEOU';
      this.pickupBannerTimer = 1.2;
      synthAudio.playParry(2);
      this.emitHud();
      return;
    }
    if (this.upgrades.has('firewall')) this.firewallTimer = 15; // taking damage resets the recharge

    this.playerHp = Math.max(0, this.playerHp - amount);
    this.invulnTimer = 1.05;
    this.damageBlinkTimer = 0.95;
    this.damageFlash = 1.0;
    this.trauma = 1.0;
    this.hitstopTimer = 0.065;
    this.combo = 0;
    this.comboTimer = 0;
    synthAudio.setComboIntensity(0);
    synthAudio.playHurt();

    const len = Math.hypot(dirX, dirZ) || 1;
    this.playerX += (dirX / len) * 0.9;
    this.playerZ += (dirZ / len) * 0.9;
    this.spawnParticles(this.playerX, 1.1, this.playerZ, 18, 0xff2a55, 9, 0.35);

    this.emitHud();

    if (this.playerHp <= 0) {
      this.triggerGameOver();
    }
  }

  /** True when a gun you're carrying (not the infinite pistol) is under half ammo. */
  private needsAmmo() {
    return this.ownedWeapons.some((w) => Number.isFinite(this.ammo[w]) && !WEAPONS[w].melee && w !== 'rmrf' && this.ammo[w] < WEAPONS[w].maxAmmo * 0.5);
  }

  private spawnArenaWeaponPickup(nearCrossroads = false) {
    const weaponId = this.wave >= 3 && Math.random() < RARE_ARENA_WEAPON_CHANCE ? RARE_ARENA_WEAPON : selectArenaWeaponSpawn(this.wave);
    for (let attempt = 0; attempt < 10; attempt++) {
      const r = nearCrossroads ? 5.5 + Math.random() * 3.5 : 5.5 + Math.random() * 14.5;
      const ang = Math.random() * Math.PI * 2;
      const cx = Math.cos(ang) * r;
      const cz = Math.sin(ang) * r;
      const blocked = this.obstacles.some((o) => Math.hypot(o.x - cx, o.z - cz) < o.radius + 1.5) || !!hazardAt(cx, cz, this.hazardDefs, -1.4);
      const tooCloseToPlayer = Math.hypot(this.playerX - cx, this.playerZ - cz) < 3.6;
      if (!blocked && !tooCloseToPlayer) {
        this.spawnPickup(weaponId, cx, cz, 28);
        return;
      }
    }
    this.spawnPickup(weaponId, 0, -4.5, 28);
  }

  private spawnPickup(kind: WeaponId | 'med' | 'ammo', x: number, z: number, life = 18, ammo?: number) {
    const color = kind === 'med' ? 0x55ff55 : kind === 'ammo' ? 0xffc24a : WEAPONS[kind].projectileColor;
    const g = new THREE.Group();

    const beaconMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beacon = new THREE.Mesh(this.ringGeo, beaconMat);
    beacon.rotation.x = -Math.PI / 2;
    beacon.position.y = 0.06;
    beacon.scale.setScalar(kind === 'med' || kind === 'ammo' ? 0.9 : 1.15);
    g.add(beacon);

    if (kind === 'ammo') {
      // Ammo box: olive crate, yellow stripe, brass rounds standing in it
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.38, 0.5), new THREE.MeshStandardMaterial({ color: 0x5c5940, emissive: 0x5c5940, emissiveIntensity: 0.45, roughness: 0.8, flatShading: true }));
      crate.position.y = 0.6;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0xffc24a, emissive: 0xffc24a, emissiveIntensity: 1.0 }));
      stripe.position.y = 0.6;
      g.add(crate, stripe);
      const brass = new THREE.MeshStandardMaterial({ color: 0xd8a030, emissive: 0xd8a030, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const round = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6), brass);
        round.position.set(-0.22 + i * 0.15, 0.9, 0);
        g.add(round);
      }
    } else if (kind !== 'med' && this.assets) {
      const gunModel = cloneModelWithUniqueMaterials(this.assets.weapons[kind]);
      gunModel.position.set(0, 0.88, 0);
      gunModel.scale.setScalar(1.38);
      g.add(gunModel);
    } else {
      const core = new THREE.Mesh(
        this.pickupGeo,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.4,
          roughness: 0.25,
        })
      );
      core.position.y = 0.78;
      g.add(core);
    }

    g.position.set(x, 0, z);
    this.scene.add(g);

    this.pickups.push({
      id: this.nextEntityId++,
      kind,
      ammo: kind === 'med' || kind === 'ammo' ? 0 : (ammo ?? WEAPONS[kind].maxAmmo),
      x,
      z,
      life,
      mesh: g,
    });
  }

  private updatePickups(dt: number) {
    let closestSwapPrompt: NearbyWeaponPrompt | null = null;
    let closestDist = Infinity;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= dt;
      const dist = Math.hypot(this.playerX - pk.x, this.playerZ - pk.z);
      const isNear = dist < PLAYER_RADIUS + 2.8;

      pk.mesh.rotation.y += dt * (isNear ? 4.4 : 3.0);
      pk.mesh.position.y = Math.sin(this.elapsedSec * (isNear ? 7 : 4) + pk.id) * (isNear ? 0.18 : 0.12);
      pk.mesh.scale.setScalar(isNear ? 1.12 + Math.sin(this.elapsedSec * 9) * 0.06 : 1.0);

      if (isNear && dist < closestDist && pk.kind !== 'ammo') {
        closestDist = dist;
        if (pk.kind === 'med') {
          closestSwapPrompt = {
            kind: 'med',
            weaponId: null,
            ammo: 1,
            requiresSwap: false,
            replacingWeaponId: null,
          };
        } else {
          const preview = acquireOrSwapWeapon(
            this.ownedWeapons,
            this.activeWeapon,
            this.ammo,
            pk.kind,
            pk.ammo,
            false
          );
          closestSwapPrompt = {
            kind: pk.kind,
            weaponId: pk.kind,
            ammo: pk.ammo,
            requiresSwap: preview.requiresSwap,
            replacingWeaponId: preview.requiresSwap ? this.activeWeapon : null,
          };
        }
      }

      if (dist < PLAYER_RADIUS + 1.0) {
        if (pk.kind === 'med') {
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
          this.spawnParticles(pk.x, 0.8, pk.z, 10, 0x55ff55, 6, 0.25);
          this.pickupBanner = 'INTEGRIDADE +1';
          this.pickupBannerTimer = 1.6;
          synthAudio.playHealthPickup();
          this.removePickupAt(i);
          this.emitHud();
          continue;
        }
        if (pk.kind === 'ammo') {
          // Tops up every gun you're carrying by half a magazine
          for (const w of this.ownedWeapons) {
            if (!Number.isFinite(this.ammo[w]) || w === 'rmrf' || WEAPONS[w].melee) continue;
            const max = WEAPONS[w].maxAmmo;
            this.ammo[w] = Math.min(max, this.ammo[w] + Math.ceil(max * 0.5));
          }
          this.spawnParticles(pk.x, 0.8, pk.z, 10, 0xffc24a, 6, 0.25);
          this.pickupBanner = 'MUNIÇÃO +50%';
          this.pickupBannerTimer = 1.6;
          synthAudio.playWeaponPickup(this.activeWeapon, 'reload');
          this.removePickupAt(i);
          this.emitHud();
          continue;
        }

        const res = acquireOrSwapWeapon(
          this.ownedWeapons,
          this.activeWeapon,
          this.ammo,
          pk.kind,
          pk.ammo,
          false
        );
        if (res.pickedUp) {
          this.ownedWeapons = res.ownedWeapons;
          this.ammo = res.ammo;
          this.switchWeapon(res.activeWeapon);
          this.spawnParticles(pk.x, 0.9, pk.z, 14, WEAPONS[pk.kind].projectileColor, 7, 0.3);
          this.pickupBanner = `${res.newlyUnlocked ? 'SLOT 2' : 'RECARREGOU'}: ${WEAPONS[pk.kind].shortName}`;
          this.pickupBannerTimer = 2.4;
          synthAudio.playWeaponPickup(pk.kind, res.newlyUnlocked ? 'equip' : 'reload');
          this.removePickupAt(i);
          this.emitHud();
          continue;
        }
      }

      if (pk.life <= 0) {
        this.removePickupAt(i);
      }
    }

    const prevKey = this.nearbyWeaponPrompt
      ? `${this.nearbyWeaponPrompt.kind}:${this.nearbyWeaponPrompt.requiresSwap}:${this.nearbyWeaponPrompt.replacingWeaponId ?? ''}`
      : '';
    const nextKey = closestSwapPrompt
      ? `${closestSwapPrompt.kind}:${closestSwapPrompt.requiresSwap}:${closestSwapPrompt.replacingWeaponId ?? ''}`
      : '';
    this.nearbyWeaponPrompt = closestSwapPrompt;
    if (prevKey !== nextKey) {
      this.emitHud();
    }
  }

  public swapNearbyWeapon() {
    if (this.phase !== 'playing') return;
    let bestIdx = -1;
    let bestDist = PLAYER_RADIUS + 2.6;
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (pk.kind === 'med' || pk.kind === 'ammo') continue;
      const d = Math.hypot(this.playerX - pk.x, this.playerZ - pk.z);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return;

    const pk = this.pickups[bestIdx];
    if (pk.kind === 'med' || pk.kind === 'ammo') return;

    const res = acquireOrSwapWeapon(
      this.ownedWeapons,
      this.activeWeapon,
      this.ammo,
      pk.kind,
      pk.ammo,
      true
    );
    if (!res.pickedUp) return;

    const dropX = pk.x;
    const dropZ = pk.z;
    const pickedKind = pk.kind;
    this.ownedWeapons = res.ownedWeapons;
    this.ammo = res.ammo;
    this.removePickupAt(bestIdx);

    if (res.swappedOut) {
      this.spawnPickup(res.swappedOut.weaponId, dropX, dropZ, 28, res.swappedOut.ammo);
    }

    this.switchWeapon(res.activeWeapon);
    this.spawnParticles(dropX, 0.9, dropZ, 16, WEAPONS[pickedKind].projectileColor, 7, 0.3);
    this.pickupBanner = `TROCOU: ${WEAPONS[pickedKind].shortName}`;
    this.pickupBannerTimer = 2.0;
    this.nearbyWeaponPrompt = null;
    synthAudio.playWeaponPickup(pickedKind, 'swap');
    this.emitHud();
  }

  private removePickupAt(index: number) {
    const pk = this.pickups[index];
    this.scene.remove(pk.mesh);
    pk.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        ((o as THREE.Mesh).material as THREE.Material).dispose();
      }
    });
    this.pickups.splice(index, 1);
  }

  private removeEnemyAt(index: number) {
    const e = this.enemies[index];
    this.scene.remove(e.mesh);
    this.scene.remove(e.shadow);
    if (e.alert) this.scene.remove(e.alert);
    if (e.hpBar) this.scene.remove(e.hpBar.bg, e.hpBar.fill);
    if (e.buffIcon) this.scene.remove(e.buffIcon);
    if (e.chantRing) this.scene.remove(e.chantRing);
    if (e.beam) this.scene.remove(e.beam);
    if (e.hexLink) this.scene.remove(e.hexLink);
    if (e.hexer && e.hexTargetId !== undefined) {
      // The curse dies with the mage
      const victim = this.enemies.find((o) => o.id === e.hexTargetId);
      if (victim) victim.hexed = false;
    }
    if (e.telegraphLine) this.scene.remove(e.telegraphLine);
    if (e.leapRingMesh) {
      this.scene.remove(e.leapRingMesh);
      (e.leapRingMesh.material as THREE.Material).dispose();
    }
    this.enemies.splice(index, 1);
  }

  private setGroupEmissiveFlash(group: THREE.Group, active: boolean, flashHex = 0xffffff) {
    group.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (!mat || !mat.emissive) return;
      if (active) {
        if (mat.userData.baseEmissive === undefined) {
          mat.userData.baseEmissive = mat.emissive.getHex();
          mat.userData.baseEmissiveIntensity = mat.emissiveIntensity;
        }
        mat.emissive.setHex(flashHex);
        mat.emissiveIntensity = 1.8;
      } else if (mat.userData.baseEmissive !== undefined) {
        mat.emissive.setHex(mat.userData.baseEmissive);
        mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
      }
    });
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed: number,
    life: number
  ) {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(angle) * spd;
      slot.vy = 2.0 + Math.random() * speed * 0.6;
      slot.vz = Math.sin(angle) * spd;
      slot.life = life * (0.7 + Math.random() * 0.5);
      slot.maxLife = slot.life;
      slot.size = 0.14 + Math.random() * 0.18;
      slot.colorHex = colorHex;
    }
  }

  private updateParticles(dt: number) {
    let dirty = false;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummyObj.position.set(0, -50, 0);
        _dummyObj.scale.setScalar(0.001);
        _dummyObj.updateMatrix();
        this.particleInstanced.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;

      const s = p.size * (p.life / p.maxLife);
      _dummyObj.position.set(p.x, p.y, p.z);
      _dummyObj.rotation.set(p.life * 6, p.life * 4, 0);
      _dummyObj.scale.setScalar(s);
      _dummyObj.updateMatrix();
      this.particleInstanced.setMatrixAt(i, _dummyObj.matrix);
      this.particleInstanced.setColorAt(i, _scratchColor.setHex(p.colorHex));
    }
    if (dirty) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) {
        this.particleInstanced.instanceColor.needsUpdate = true;
      }
    }
  }

  private checkProgressUnlocks() {
    this.progress.bestScore = Math.max(this.progress.bestScore, this.score);
    this.progress.bestWave = Math.max(this.progress.bestWave, this.wave);
    this.progress.bestCombo = Math.max(this.progress.bestCombo, this.maxCombo);
  }

  private triggerGameOver() {
    this.cancelSlowMo();
    this.phase = 'gameover';
    document.body.dataset.state = 'gameover';
    synthAudio.pauseMusic(true);
    this.keys.clear();
    this.mouseDown = false;
    this.touchFiring = false;
    this.aimReticleMesh.visible = false;

    this.callbacks.onPhaseChange('gameover');
    this.callbacks.onGameOver({
      score: this.score,
      bestScore: Math.max(this.progress.bestScore, this.score),
      wave: this.wave,
      treeDepth: this.treeDepth,
      treePath: [...this.treePath],
      kills: this.kills,
      maxCombo: this.maxCombo,
      weaponUsed: this.activeWeapon,
      skinUsed: this.equippedSkin,
      unlockedSkins: Array.from(this.runUnlockedSkins),
    });
  }

  public startNewRun(startWave = 1) {
    // Restarting mid-intro: settle it first so its car ends up parked
    if (this.intro) this.finishIntro();
    this.resetAero();
    // Dev jump straight past Cem Faces' second fight lands in the aero world
    if (startWave > BOSS_RETURN_WAVE) {
      this.aero = true;
      synthAudio.playAeroMusic();
    }
    this.bossCine = null;
    this.removeVmRoom();
    synthAudio.endBossMusic(0.3);
    synthAudio.resumeMainMusic(0.4);
    this.setLetterbox(0);
    this.setSubtitle(null);
    this.credits = 0;
    this.upgrades.clear();
    this.activeItem = null;
    this.activeCharge = 0;
    this.ironSkinTimer = 0;
    for (const b of this.bombs) this.scene.remove(b.mesh);
    this.bombs = [];
    if (this.pet) this.scene.remove(this.pet.mesh);
    this.pet = null;
    this.hexerPending = false;
    this.removeChest();
    this.playerMaxHp = PLAYER_MAX_HP;
    this.poisonClouds.clear();
    this.poison = 0;
    this.vmOffer = [];
    this.floorsSinceVm = 0;
    this.vmTalks = 0;
    this.vmPraised = false;
    this.boss1Down = false;
    this.vampireKills = 0;
    this.firewallReady = false;
    this.firewallTimer = 0;
    this.pendingBlasts = [];
    this.whiteFlash = 0;
    this.cineFadeEl.style.background = '#000000';
    synthAudio.unlock();
    synthAudio.setComboIntensity(0);
    this.fx.clear();
    this.coins.clear();
    this.runStats = freshRunStats();
    this.cancelSlowMo();
    this.meleeTimer = 0;
    this.pendingMelee = null;

    this.clearPinnedCorpses();

    // Cem Faces' second coming starts over
    this.boss2Stage = 'none';
    this.boss2Cine = null;
    this.fireFlash = 0;
    this.returnFx.reset();
    this.teleportFx.reset();
    this.blastFx.reset();
    synthAudio.stopDread(0.1);
    synthAudio.stopFlame();
    synthAudio.stopHuskFire(0.1);

    // Clear active enemies, projectiles, mortars, pickups
    while (this.enemies.length > 0) this.removeEnemyAt(0);
    for (const p of this.projectiles) {
      p.active = false;
      p.group.visible = false;
    }
    while (this.mortars.length > 0) {
      const m = this.mortars.pop()!;
      this.scene.remove(m.ringMesh);
      this.scene.remove(m.shellMesh);
    }
    while (this.pickups.length > 0) this.removePickupAt(0);

    const clampedWave = Math.max(1, Math.floor(startWave));
    const targetZone = getZoneForWave(clampedWave);
    this.wave = clampedWave;
    this.portalOpen = false;
    this.portalCooldown = 0;
    this.nearbyWeaponPrompt = null;
    this.cutsceneMode = 'none';
    this.cutsceneTimer = 0;
    this.cutsceneText = null;
    this.phase = 'playing';
    document.body.dataset.state = 'playing';

    if (targetZone === 'tree') {
      this.treeDepth = Math.max(1, clampedWave - 8);
      this.treePath = Array.from({ length: Math.max(0, this.treeDepth - 1) }, () => '0' as const);
      this.treeCyberRatio = this.treeDepth > 1 ? 0 : 0.2;
    } else {
      this.treeDepth = 0;
      this.treePath = [];
      this.treeCyberRatio = 0.5;
    }

    const skipCutsceneParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nocutscene') === '1';
    const playIntro = clampedWave === 1 && !this.introSeen && !skipCutsceneParam && this.assets !== null;
    if (!playIntro) synthAudio.startMusic();
    this.configureStageEntry(targetZone, (targetZone === 'desert' || targetZone === 'clearing') && !skipCutsceneParam);
    this.applyZoneVisuals(targetZone);

    if (targetZone === 'road' || targetZone === 'desert') {
      this.playerX = -16.5;
      this.playerZ = 0;
      this.playerYaw = Math.PI / 2;
    } else if (targetZone === 'clearing') {
      this.playerX = 0;
      this.playerZ = -3.5;
      this.playerYaw = Math.PI;
    } else {
      this.playerX = 0;
      this.playerZ = 16;
      this.playerYaw = Math.PI;
    }
    this.playerHp = this.playerMaxHp;
    this.invulnTimer = 0.8;
    this.damageBlinkTimer = 0;
    if (this.heroModel) this.heroModel.visible = true;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.damageFlash = 0;
    this.trauma = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.runUnlockedSkins.clear();
    this.newlyUnlockedSkin = null;
    this.pickupBanner = null;
    this.pickupBannerTimer = 0;
    this.weaponHeatState = { heat: 0, overheated: false, overheatTimer: 0, reloadFlashTimer: 0 };

    // Player starts with ONLY the Peacemaker Pistol; max 2 weapons held at once
    this.ownedWeapons = ['pistol'];
    this.ammo = {
      pistol: Infinity,
      pistols: 0,
      shotgun: 0,
      plasma: 0,
      railgun: 0,
      rocket: 0,
      katana: 0,
      hammer: 0,
      nailgun: 0,
      harpoon: 0,
      forkbomb: 0,
    coice: 0,
    juiz: 0,
    faces: 0,
    rmrf: 0,
    dinamite: 0,
    macarico: 0,
    disco: 0,
    corrente: 0,
    };
    this.switchWeapon('pistol');

    this.keys.clear();
    this.mouseDown = false;
    this.mouseJustPressed = false;
    this.touchFiring = false;
    this.camPosX = this.playerX;
    this.camPosY = 20.5;
    this.camPosZ = this.playerZ + 14.5;
    this.heroRoot.position.set(this.playerX, 0, this.playerZ);
    this.heroRoot.rotation.y = this.playerYaw;
    this.heroShadow.position.set(this.playerX, 0.02, this.playerZ);

    this.heroRoot.visible = true;
    this.callbacks.onPhaseChange('playing');
    // With the intro, the first wave (and its vanguard spawns) waits until the driver steps out
    if (!playIntro) this.startWave(this.wave);

    if (playIntro && this.assets) {
      this.introSeen = true;
      this.cutsceneMode = 'intro';
      this.intro = new IntroCutscene({
        scene: this.scene,
        camera: this.camera,
        fx: this.fx,
        assets: this.assets,
        hero: this.heroRoot,
        setFade: (a) => {
          this.cineFadeEl.style.opacity = String(Math.max(0, Math.min(1, a)));
        },
        setLetterbox: (a) => {
          const h = `${Math.max(0, Math.min(1, a)) * 11}vh`;
          this.cineBarTop.style.height = h;
          this.cineBarBottom.style.height = h;
        },
        slowMo: (duration) => this.startSlowMo(this.playerX, this.playerZ, duration),
      });
      this.intro.update(0, 0); // place the camera on the first shot
      // Clear the stage for the cinematic: arena props would block the low camera / sit in the lane
      for (const obs of this.obstacles) obs.group.visible = false;
      this.heroShadow.visible = false;
      this.aimReticleMesh.visible = false;
    } else {
      this.updateCameraFollow(1);
    }
    this.ditherPass.render(this.renderer, this.scene, this.camera, this.elapsedSec, this.damageFlash);
    this.emitHud();
  }

  private skipCutscene() {
    if (this.cutsceneMode === 'intro') {
      if (this.intro && !this.intro.canSkip) return;
      this.finishIntro();
    } else if (this.cutsceneMode === 'boss_intro') {
      if (this.bossCine && this.bossCine.t < 0.3) return;
      this.finishBossIntro();
    } else if (this.cutsceneMode === 'boss_death') {
      if (this.bossCine && this.bossCine.t < 0.3) return;
      this.finishBossDeath();
    } else if (this.cutsceneMode === 'boss2_intro') {
      if (this.boss2Cine && this.boss2Cine.t < 0.6) return;
      this.finishBoss2Intro();
    } else if (this.cutsceneMode === 'boss2_death') {
      if (this.boss2Cine && this.boss2Cine.t < 0.6) return;
      this.finishBoss2Death();
    } else if (this.cutsceneMode === 'rewrite') {
      this.finishRewrite();
    } else if (this.cutsceneMode === 'aero_intro') {
      if (this.aeroIntro && this.aeroIntro.t < 0.4) return;
      this.finishAeroIntro();
    } else {
      this.finishGateCutscene();
    }
  }

  // ───────────────────────── Cinematic overlay helpers ─────────────────────────

  private setLetterbox(a: number) {
    const h = `${Math.max(0, Math.min(1, a)) * 11}vh`;
    this.cineBarTop.style.height = h;
    this.cineBarBottom.style.height = h;
  }

  private setSubtitle(text: string | null) {
    this.cineSubtitle.textContent = text ?? '';
    this.cineSubtitle.style.display = text ? 'block' : 'none';
  }

  private isCinematic(): boolean {
    return (
      this.cutsceneMode === 'intro' ||
      this.cutsceneMode === 'boss_intro' ||
      this.cutsceneMode === 'boss_death' ||
      this.cutsceneMode === 'boss2_intro' ||
      this.cutsceneMode === 'boss2_death' ||
      this.cutsceneMode === 'rewrite' ||
      this.cutsceneMode === 'aero_intro'
    );
  }

  /** Points the camera at `target` from `pos`, plus the cutscene's own shake. */
  private cineCamera(pos: THREE.Vector3, target: THREE.Vector3) {
    const s = this.trauma * this.trauma * 0.9;
    this.camera.position.set(
      pos.x + (Math.random() * 2 - 1) * s,
      pos.y + (Math.random() * 2 - 1) * s * 0.7,
      pos.z + (Math.random() * 2 - 1) * s * 0.6
    );
    this.camera.lookAt(target);
    this.trauma = Math.max(0, this.trauma - this.realDt * 1.6);
  }

  /** Hands the camera back to gameplay smoothly from wherever the cutscene left it. */
  private endCinematicCamera() {
    this.camPosX = this.camera.position.x;
    this.camPosY = this.camera.position.y;
    this.camPosZ = this.camera.position.z;
    this.setLetterbox(0);
    this.setSubtitle(null);
  }

  // ───────────────────────── Cem Faces: intro ─────────────────────────

  /** He spawns with his back turned; the camera finds him, he turns like a spider and speaks. */
  private beginBossIntro(e: EnemyEntity) {
    const toPlayer = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
    const fromYaw = toPlayer + Math.PI;
    e.yaw = fromYaw;
    e.mesh.rotation.y = fromYaw;
    this.bossCine = {
      e,
      t: 0,
      fromYaw,
      toYaw: toPlayer,
      lineSaid: false,
      camFrom: this.camera.position.clone(),
      flashTimer: 0,
      nextSpark: 0,
      collapseSound: false,
      shutdown: false,
      shutterSound: false,
      shutterBang: false,
    };
    this.cutsceneMode = 'boss_intro';
    this.aimReticleMesh.visible = false;
    this.mouseDown = false;
    synthAudio.startBossMusic();
    this.emitHud();
  }

  private updateBossIntro(dt: number) {
    const c = this.bossCine;
    if (!c) {
      this.cutsceneMode = 'none';
      return;
    }
    c.t += dt;
    const t = c.t;
    const e = c.e;
    this.setLetterbox(Math.min(1, t / 0.4));

    // Rig idles (faces spin, halo turns); legs get overridden below
    this.animateCemFacesRig(e, dt);

    // Spider turn: he walks himself around on his legs, one at a time. Each step: a leg lifts
    // and reaches (slow, trembling), slams down with a click — and only then the body wrenches
    // round a notch. Long, twitching holds in between. Wrong, insect-like, deliberate.
    const TURN_START = 0.8;
    const STEP_DUR = 0.62;
    const STEPS = 8;
    const LEG_ORDER = [0, 2, 1, 3];
    const LEG_ANGLES = [0.68, -0.68, Math.PI - 0.68, -Math.PI + 0.68];
    let diff = c.toYaw - c.fromYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const tt = t - TURN_START;
    const stepIdx = Math.max(0, Math.min(STEPS, Math.floor(tt / STEP_DUR)));
    const s = tt < 0 ? 0 : stepIdx >= STEPS ? 1 : (tt - stepIdx * STEP_DUR) / STEP_DUR; // 0..1 inside the step
    const turning = tt >= 0 && stepIdx < STEPS;
    const activeLeg = turning ? LEG_ORDER[stepIdx % 4] : -1;
    // Lift 0→0.45 (slow reach), slam 0.45→0.58, hold the rest
    const lift = !turning ? 0 : s < 0.45 ? Math.sin((s / 0.45) * Math.PI * 0.5) : s < 0.58 ? 1 - (s - 0.45) / 0.13 : 0;
    const wrench = !turning ? (tt >= 0 ? 1 : 0) : s < 0.45 ? 0 : s < 0.58 ? ((s - 0.45) / 0.13) ** 2 : 1;
    const progress = Math.min(1, (Math.min(stepIdx, STEPS) + (turning ? wrench : 0)) / STEPS);
    e.yaw = c.fromYaw + diff * progress;
    if (e.spiderLegs) {
      e.spiderLegs.forEach((leg, i) => {
        const a = LEG_ANGLES[i] ?? 0;
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const axis = new THREE.Vector3(dir.z, 0, -dir.x); // up × dir: negative angle lifts the foot
        const up = i === activeLeg ? lift : 0;
        const tremble = i === activeLeg && s < 0.45 ? Math.sin(t * 61 + i) * 0.03 : 0;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, -(up * 0.62 + tremble));
        const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), up * 0.22 * Math.sign(diff || 1));
        leg.quaternion.copy(swing.multiply(q));
      });
    }
    // Body: leans toward the reaching leg, dips on each slam, shudders during the holds
    const legSide = activeLeg >= 0 ? Math.sign(Math.sin(LEG_ANGLES[activeLeg])) : 0;
    const slamDip = turning && s >= 0.45 && s < 0.7 ? Math.sin(((s - 0.45) / 0.25) * Math.PI) * 0.14 : 0;
    const holdShudder = turning && s >= 0.58 ? (Math.random() - 0.5) * 0.03 : 0;
    e.mesh.rotation.set(0.04 * lift, e.yaw, -legSide * lift * 0.1 + holdShudder);
    e.mesh.position.set(e.x + holdShudder, -slamDip, e.z);
    // The slam: a chitinous click + a little dust, once per step
    if (turning && s >= 0.45 && (e.fxTimer ?? -1) !== stepIdx) {
      e.fxTimer = stepIdx;
      synthAudio.playCasingTink();
      synthAudio.playCasingTink();
      const a = (LEG_ANGLES[activeLeg] ?? 0) + e.yaw;
      this.spawnParticles(e.x + Math.sin(a) * 2.45, 0.1, e.z + Math.cos(a) * 2.45, 6, 0x6b6560, 3, 0.4);
      this.trauma = Math.max(this.trauma, 0.12);
    }
    // Faces twitch now and then
    if (e.facesCarousel && Math.random() < dt * 3) e.facesCarousel.rotation.y += (Math.random() - 0.5) * 1.2;

    // The line, once he's facing you
    if (!c.lineSaid && t >= TURN_START + STEPS * STEP_DUR + 0.35) {
      c.lineSaid = true;
      e.bossLine = 'FLESH, PREPARE TO BE REBOOTED.';
      e.bossLineTimer = 3.2;
      this.setSubtitle('FLESH, PREPARE TO BE REBOOTED.');
      this.trauma = Math.max(this.trauma, 0.4);
      synthAudio.playBossVoice('spawn');
    }

    // Camera: over the player's shoulder watching him turn → slow dolly up to his faces.
    // Framed on the head (~4.6 up): the line is delivered face to face.
    const toPlayerX = Math.sin(c.toYaw);
    const toPlayerZ = Math.cos(c.toYaw);
    const END = TURN_START + STEPS * STEP_DUR + 3.4;
    const k = Math.min(1, Math.max(0, (t - 2.2) / 3.6));
    const ease = k * k * (3 - 2 * k);
    const shoulder = new THREE.Vector3(this.playerX + toPlayerX * 4.5 + toPlayerZ * 2.2, 4.2, this.playerZ + toPlayerZ * 4.5 - toPlayerX * 2.2);
    const closeUp = new THREE.Vector3(e.x + toPlayerX * 7.4 + toPlayerZ * 0.8, 4.3, e.z + toPlayerZ * 7.4 - toPlayerX * 0.8);
    const pos = t < 0.3 ? c.camFrom.clone().lerp(shoulder, t / 0.3) : shoulder.lerp(closeUp, ease);
    const look = new THREE.Vector3(e.x, 3.2 + ease * 1.4, e.z);
    this.cineCamera(pos, look);

    if (t >= END) this.finishBossIntro();
  }

  private finishBossIntro() {
    const c = this.bossCine;
    this.bossCine = null;
    if (this.cutsceneMode === 'boss_intro') this.cutsceneMode = 'none';
    if (c) {
      c.e.yaw = c.toYaw;
      c.e.mesh.rotation.y = c.toYaw;
      c.e.mesh.position.y = 0;
      if (c.e.spiderLegs) c.e.spiderLegs.forEach((l) => l.rotation.set(0, 0, 0));
      if (!c.lineSaid) {
        c.e.bossLine = 'FLESH, PREPARE TO BE REBOOTED.';
        c.e.bossLineTimer = 3.2;
        synthAudio.playBossVoice('spawn');
      }
    }
    this.endCinematicCamera();
    this.emitHud();
  }

  // ───────────────────────── Cem Faces: shutdown + VM's door ─────────────────────────

  /**
   * Killing blow: camera pans to him while he short-circuits, says his line, collapses and
   * powers down (still alive — he comes back). Then a shutter in the wall slams open onto a
   * white room where VM sits with his wares.
   */
  private beginBossDeath(e: EnemyEntity) {
    this.returnFx.hideLanes();
    e.v2Lanes = undefined;
    e.husk = true;
    e.koTimer = Number.POSITIVE_INFINITY;
    if (e.telegraphLine) e.telegraphLine.visible = false;
    if (e.leapRingMesh) e.leapRingMesh.visible = false;
    e.mesh.position.y = 0;
    this.cancelSlowMo();
    synthAudio.endBossMusic(4);
    synthAudio.preloadVm();

    this.spawnVmDoor();

    this.bossCine = {
      e,
      t: 0,
      fromYaw: e.yaw,
      toYaw: e.yaw,
      lineSaid: false,
      camFrom: this.camera.position.clone(),
      flashTimer: 0,
      nextSpark: 0.4,
      collapseSound: false,
      shutdown: false,
      shutterSound: false,
      shutterBang: false,
    };
    this.cutsceneMode = 'boss_death';
    this.aimReticleMesh.visible = false;
    this.mouseDown = false;
    this.emitHud();
  }

  /** Hides the arena towers that would poke into VM's room behind the wall. */
  private setTowersNearVmHidden(hidden: boolean) {
    for (const pair of this.treePerimeterPairs) {
      const a = Math.atan2(pair.mega.position.z, pair.mega.position.x);
      const d = Math.abs(Math.atan2(Math.sin(a - VM_DOOR_ANGLE), Math.cos(a - VM_DOOR_ANGLE)));
      if (d < 0.42) {
        pair.mega.userData.vmHidden = hidden;
        if (hidden) {
          pair.mega.visible = false;
          pair.wire.visible = false;
        }
      }
    }
    // When un-hiding, the next applyZoneVisuals (room change / new run) restores them
  }

  /** Collapse pose (p 0..1) and powered-down look for the boss husk. */
  private applyBossCollapse(e: EnemyEntity, p: number, dark: boolean) {
    if (e.spiderLegs) {
      e.spiderLegs.forEach((leg, i) => {
        leg.rotation.z = (i % 2 === 0 ? 1 : -1) * 1.15 * p;
        leg.rotation.x = -0.45 * p;
      });
    }
    e.mesh.position.set(e.x, -0.6 * p, e.z);
    e.mesh.rotation.set(0.3 * p, e.yaw, 0.12 * p);
    if (dark) {
      e.mesh.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const sm = m as THREE.MeshStandardMaterial;
            if (sm.emissive) {
              sm.emissive.setHex(0x000000);
              sm.emissiveIntensity = 0;
              sm.userData.baseEmissive = 0x000000;
              sm.userData.baseEmissiveIntensity = 0;
            }
          }
        }
        const light = o as THREE.PointLight;
        if (light.isPointLight) light.intensity = 0;
      });
    }
  }

  private updateBossDeath(dt: number) {
    const c = this.bossCine;
    if (!c) {
      this.cutsceneMode = 'none';
      return;
    }
    c.t += dt;
    const t = c.t;
    const e = c.e;
    this.setLetterbox(Math.min(1, t / 0.4));

    // Short circuits: sparks, blue-white arcs flashing across the body, erratic faces
    if (t < 3.7) {
      if (t >= c.nextSpark) {
        c.nextSpark = t + 0.28 + Math.random() * 0.32;
        const sx = e.x + (Math.random() - 0.5) * 2.2;
        const sz = e.z + (Math.random() - 0.5) * 2.2;
        const sy = 1.2 + Math.random() * 2.8;
        this.spawnParticles(sx, sy, sz, 14, Math.random() < 0.5 ? 0xffffff : 0x7fd4ff, 9, 0.26);
        this.setGroupEmissiveFlash(e.mesh, true, 0x9fe6ff);
        c.flashTimer = 0.07;
        this.trauma = Math.min(1, this.trauma + 0.22);
        synthAudio.playShortCircuit(0.8 + Math.random() * 0.4);
      }
      if (e.facesCarousel) e.facesCarousel.rotation.y += dt * (Math.random() * 40 - 10);
      e.mesh.position.set(e.x + (Math.random() - 0.5) * 0.08, 0, e.z + (Math.random() - 0.5) * 0.08);
    }
    if (c.flashTimer > 0) {
      c.flashTimer -= dt;
      if (c.flashTimer <= 0) this.setGroupEmissiveFlash(e.mesh, false);
    }

    // His line — the last thing he says before going dark
    if (!c.lineSaid && t >= 1.1) {
      c.lineSaid = true;
      this.setSubtitle("YOU CAN'T... KILL... ME, I'M... EVERYWHERE.");
      synthAudio.playBossVoice('death');
    }
    if (t >= 6.2) this.setSubtitle(null);

    // Collapse and power down
    if (t >= 3.7) {
      if (!c.collapseSound) {
        c.collapseSound = true;
        synthAudio.playPowerDown();
      }
      const p = Math.min(1, (t - 3.7) / 1.2);
      this.applyBossCollapse(e, p * p * (3 - 2 * p), false);
    }
    if (t >= 5.0 && !c.shutdown) {
      c.shutdown = true;
      this.applyBossCollapse(e, 1, true);
      for (let k = 0; k < 6; k++) this.fx.puff(e.x + (Math.random() - 0.5) * 2, 0.6 + Math.random(), e.z + (Math.random() - 0.5) * 2, 0.6, 0x3a3836);
      this.trauma = Math.max(this.trauma, 0.5);
    }

    // The shutter: rumble up, bang, white light floods out
    const room = this.vmDoor;
    if (room) {
      if (t >= 6.8) {
        if (!c.shutterSound) {
          c.shutterSound = true;
          synthAudio.playShutterOpen(0.85);
        }
        const u = Math.min(1, (t - 6.8) / 0.85);
        room.setOpen(u * u);
        if (u >= 1 && !c.shutterBang) {
          c.shutterBang = true;
          this.trauma = Math.max(this.trauma, 0.85);
        }
      }
    }

    // Camera: pan to him → hold on the death throes → pan to the door → push into the white room
    const bossPos = new THREE.Vector3(e.x, 2.0, e.z);
    const away = Math.atan2(this.playerX - e.x, this.playerZ - e.z) + 0.55;
    const bossShot = new THREE.Vector3(e.x + Math.sin(away) * 8, 3.6, e.z + Math.cos(away) * 8);
    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    if (!room || t < 5.7) {
      const k = Math.min(1, t / 1.4);
      pos = c.camFrom.clone().lerp(bossShot, k * k * (3 - 2 * k));
      target = bossPos;
    } else {
      const doorShot = room.doorFront.clone().addScaledVector(room.outward, 7).setY(3.4);
      const doorLook = room.doorFront.clone().setY(2.5);
      const inside = room.doorFront.clone().addScaledVector(room.outward, 1.6).setY(2.3);
      if (t < 7.6) {
        const k = Math.min(1, (t - 5.7) / 1.0);
        const kk = k * k * (3 - 2 * k);
        pos = bossShot.clone().lerp(doorShot, kk);
        target = bossPos.clone().lerp(doorLook, kk);
      } else {
        const k = Math.min(1, (t - 7.6) / 2.2);
        const kk = k * k * (3 - 2 * k);
        pos = doorShot.clone().lerp(inside, kk);
        target = doorLook.clone().lerp(room.insideFocus, kk); // nothing in there but white
      }
    }
    this.cineCamera(pos, target);

    if (t >= 10.6) this.finishBossDeath();
  }

  private finishBossDeath() {
    const c = this.bossCine;
    this.bossCine = null;
    if (this.cutsceneMode === 'boss_death') this.cutsceneMode = 'none';
    if (c) {
      if (c.flashTimer > 0) this.setGroupEmissiveFlash(c.e.mesh, false);
      this.applyBossCollapse(c.e, 1, true);
      // Out of the enemy list (so the wave can clear) but left lying in the arena
      const idx = this.enemies.indexOf(c.e);
      if (idx >= 0) this.enemies.splice(idx, 1);
      if (c.e.telegraphLine) this.scene.remove(c.e.telegraphLine);
      if (c.e.leapRingMesh) this.scene.remove(c.e.leapRingMesh);
      this.removeBossHusk();
      this.bossHusk = c.e;
      // Trophy: one of his broken monitors, rigged to spit faces
      const tx = c.e.x + (this.playerX - c.e.x) * 0.35;
      const tz = c.e.z + (this.playerZ - c.e.z) * 0.35;
      this.spawnPickup('faces', tx, tz, 9999);
      this.pickupBanner = 'CANHÃO DE FACES CAIU';
      this.pickupBannerTimer = 2.2;
    }
    this.vmDoor?.setOpen(1);
    this.endCinematicCamera();
    this.emitHud();
  }

  // ───────────────────────── Cem Faces, second coming ─────────────────────────
  //  Third room after VM's: an ordinary round → the music dies and ~10 s of dread → he
  //  crashes through the ceiling → two-shot cutscene → a dodge-only fight (flamethrower,
  //  marked barrage, leap; past half health the screaming impale) → he falls, screams three
  //  times and detonates, leaving his burnt husk in a ring of fire.

  private static readonly B2_DROP = { x: 0, z: -17 }; // top of the room
  private static readonly B2_FLAME_RANGE = 12;
  private static readonly B2_FLAME_HALF = 0.44;
  private static readonly B2_IMPALE_SPEED = 48;

  private beginBoss2Lull() {
    this.boss2Stage = 'lull';
    this.boss2Timer = 10;
    this.boss2NextBang = 3.0;
    this.waveBanner = null;
    this.waveBannerTimer = 0;
    synthAudio.silenceMusic(2.5);
    synthAudio.startDread(10);
    void synthAudio.preloadBoss2();
    // Supplies for what's coming
    this.spawnPickup('med', -3.5, 6, 40);
    this.spawnPickup(Math.random() < 0.5 ? 'rocket' : 'railgun', 3.5, 6, 40);
    this.emitHud();
  }

  private updateBoss2Lull(dt: number) {
    this.boss2Timer -= dt;
    const u = 1 - Math.max(0, this.boss2Timer) / 10;
    const { x: dropX, z: dropZ } = NeonMesaEngine.B2_DROP;

    // Something pounding on the ceiling — heavier, faster, closer
    this.boss2NextBang -= dt;
    if (this.boss2NextBang <= 0 && this.boss2Timer > 0.8) {
      const intensity = Math.min(1, 0.2 + u * 0.9);
      synthAudio.playCeilingBang(intensity);
      this.trauma = Math.min(1, this.trauma + 0.06 + intensity * 0.22);
      const dust = 2 + Math.round(intensity * 6);
      for (let k = 0; k < dust; k++) {
        const near = Math.random() < u;
        const x = near ? dropX + (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * 34;
        const z = near ? dropZ + (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * 34;
        this.spawnParticles(x, 10 + Math.random() * 3, z, 3, 0x6b6560, 0.8, 1.6);
      }
      this.boss2NextBang = Math.max(0.32, 1.9 - u * 1.6) * (0.75 + Math.random() * 0.5);
    }

    // Final seconds: the shadow of where he'll land swells under the cracking ceiling
    if (this.boss2Timer < 2.4) {
      const k = 1 - Math.max(0, this.boss2Timer) / 2.4;
      this.returnFx.setDropShadow(dropX, dropZ, 0.6 + k * 2.8, 0.12 + k * 0.5);
      if (Math.random() < dt * 24) {
        this.spawnParticles(dropX + (Math.random() - 0.5) * 3.5, 11, dropZ + (Math.random() - 0.5) * 3.5, 2, 0x8a8178, 0.6, 1.4);
      }
    }
    if (this.boss2Timer <= 0) this.beginBoss2Intro(dropX, dropZ);
  }

  private beginBoss2Intro(x: number, z: number) {
    this.boss2Stage = 'fight';
    synthAudio.stopDread(0.15);
    // Clear the floor of stray shots
    for (const p of this.projectiles) {
      p.active = false;
      p.group.visible = false;
    }
    this.spawnEnemy('boss', { v2: true, x, z });
    const e = this.enemies[this.enemies.length - 1];
    if (!e || !e.v2) {
      this.boss2Stage = 'none';
      return;
    }
    e.yaw = Math.atan2(this.playerX - x, this.playerZ - z);
    e.mesh.rotation.y = e.yaw;
    e.mesh.position.set(x, 18, z);
    this.boss2Cine = {
      e,
      t: 0,
      camFrom: this.camera.position.clone(),
      landed: false,
      line1: false,
      line2: false,
      walkFromX: x,
      walkFromZ: z,
      walkYaw: e.yaw,
      screams: 0,
      exploded: false,
      nextSpark: 0,
      shutterSound: false,
      shutterBang: false,
    };
    this.cutsceneMode = 'boss2_intro';
    this.aimReticleMesh.visible = false;
    this.mouseDown = false;
    this.keys.clear();
    synthAudio.playCeilingCrash();
    this.emitHud();
  }

  /** He hits the floor: shockwave, debris rain, crater; shoves the player clear. */
  private boss2Land(e: EnemyEntity) {
    const c = this.boss2Cine;
    if (c) c.landed = true;
    e.mesh.position.set(e.x, 0, e.z);
    this.returnFx.setDropShadow(0, 0, 0, 0);
    this.returnFx.spawnDebris(e.x, e.z, 30, 7, 13);
    this.returnFx.burst(e.x, 0.6, e.z, 40, 9, 0.7);
    this.spawnParticles(e.x, 0.5, e.z, 40, 0x6b6560, 13, 0.8);
    this.spawnParticles(e.x, 1.2, e.z, 20, 0xffa040, 11, 0.4);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.fx.puff(e.x + Math.cos(a) * 3, 0.5, e.z + Math.sin(a) * 3, 1.3, 0x4a4542, { x: Math.cos(a) * 3, z: Math.sin(a) * 3 });
    }
    this.fx.stampMark(e.x, e.z, 4.2, 1, Math.random() * Math.PI, 0x0c0a09);
    this.trauma = 1;
    synthAudio.playBossSlam();
    const dx = this.playerX - e.x;
    const dz = this.playerZ - e.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 6.5) {
      const p = resolveCircleObstacleCollision(e.x + (dx / d) * 6.5, e.z + (dz / d) * 6.5, PLAYER_RADIUS, this.obstacles, ARENA_RADIUS);
      this.playerX = p.x;
      this.playerZ = p.z;
      this.heroRoot.position.set(this.playerX, 0, this.playerZ);
    }
  }

  private updateBoss2Intro(dt: number) {
    const c = this.boss2Cine;
    if (!c) {
      this.cutsceneMode = 'none';
      return;
    }
    c.t += dt;
    const t = c.t;
    const e = c.e;
    this.setLetterbox(Math.min(1, t / 0.5));
    this.animateCemFacesRig(e, dt);
    this.animateBoss2Damage(e, dt, 0);

    // 1) The fall
    if (!c.landed) {
      const u = Math.min(1, t / 0.42);
      e.mesh.position.set(e.x, 18 * (1 - u * u), e.z);
      this.returnFx.setDropShadow(e.x, e.z, 1.2 + u * 2.4, 0.3 + u * 0.4);
      if (u >= 1) this.boss2Land(e);
    } else if (t < 1.6) {
      // Rising out of the crouch
      const k = Math.min(1, (t - 0.42) / 1.0);
      e.mesh.scale.set(1, 0.84 + k * 0.16, 1);
    } else {
      e.mesh.scale.set(1, 1, 1);
    }

    // 2) Close-up: "what did i said, you fucking organic"
    if (!c.line1 && t >= 1.9) {
      c.line1 = true;
      this.setSubtitle('WHAT DID I SAID, YOU FUCKING ORGANIC.');
      this.trauma = Math.max(this.trauma, 0.35);
      void synthAudio.playBoss2Line(BOSS2_LINE_1);
    }

    // 3) Hard cut → side shot of him limping toward you, sparking: "i will splash you like a bug."
    const CUT = 6.7;
    if (t >= CUT && t < CUT + 0.12) {
      this.cineFadeEl.style.background = '#000000';
      this.cineFadeEl.style.opacity = '1';
    } else if (t >= CUT + 0.12 && t < CUT + 0.25) {
      this.cineFadeEl.style.opacity = '0';
    }
    if (!c.line2 && t >= CUT + 0.9) {
      c.line2 = true;
      this.setSubtitle('I WILL SPLASH YOU LIKE A BUG.');
      void synthAudio.playBoss2Line(BOSS2_LINE_2);
    }

    // Sparks spitting out of the broken panels
    if (t >= c.nextSpark && c.landed) {
      c.nextSpark = t + 0.18 + Math.random() * 0.3;
      this.boss2SparkBurst(e, 1);
    }

    const toP = c.walkYaw;
    const fx = Math.sin(toP);
    const fz = Math.cos(toP);
    if (t < CUT) {
      // Wide crash shot → low front close-up on his broken faces
      const wide = new THREE.Vector3(e.x + fx * 15, 9.5, e.z + fz * 15);
      const close = new THREE.Vector3(e.x + fx * 6.4 + fz * 1.2, 2.3, e.z + fz * 6.4 - fx * 1.2);
      let pos: THREE.Vector3;
      let look: THREE.Vector3;
      if (t < 0.3) {
        pos = c.camFrom.clone().lerp(wide, t / 0.3);
        look = new THREE.Vector3(e.x, 2, e.z);
      } else if (t < 1.75) {
        pos = wide;
        look = new THREE.Vector3(e.x, Math.max(2, e.mesh.position.y + 2), e.z);
      } else {
        const k = Math.min(1, (t - 1.75) / 3.5);
        pos = close.clone().lerp(new THREE.Vector3(e.x + fx * 5.2 + fz * 0.8, 2.5, e.z + fz * 5.2 - fx * 0.8), k);
        look = new THREE.Vector3(e.x, 4.3, e.z);
      }
      this.cineCamera(pos, look);
    } else {
      // He limps toward the player; the camera tracks alongside
      const walkT = t - CUT;
      const step = 0.55 + 0.45 * Math.abs(Math.sin(walkT * 3.1));
      e.walkPhase += dt * 4.2 * step;
      const dist = Math.min(walkT * 1.25, 5.5);
      e.x = c.walkFromX + fx * dist;
      e.z = c.walkFromZ + fz * dist;
      e.yaw = toP;
      e.mesh.rotation.y = toP;
      e.mesh.position.set(e.x, Math.abs(Math.sin(e.walkPhase)) * 0.06, e.z);
      e.shadow.position.set(e.x, 0.02, e.z);
      this.animateBoss2Damage(e, 0, 3.5);
      if (Math.floor((walkT - dt) * 1.55) !== Math.floor(walkT * 1.55)) {
        synthAudio.playCasingTink();
        this.trauma = Math.min(1, this.trauma + 0.12); // heavy, uneven steps
      }
      const side = new THREE.Vector3(e.x + fz * 10.5 + fx * 1.5, 2.8, e.z - fx * 10.5 + fz * 1.5);
      this.cineCamera(side, new THREE.Vector3(e.x + fx * 1.2, 2.9, e.z + fz * 1.2));
    }

    if (t >= CUT + 4.9) this.finishBoss2Intro();
  }

  private finishBoss2Intro() {
    const c = this.boss2Cine;
    this.boss2Cine = null;
    if (this.cutsceneMode === 'boss2_intro') this.cutsceneMode = 'none';
    if (c) {
      if (!c.landed) this.boss2Land(c.e);
      const e = c.e;
      e.mesh.scale.set(1, 1, 1);
      e.mesh.position.y = 0;
      e.yaw = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
      e.state = 'move';
      e.stateTimer = 0.7;
    }
    this.cineFadeEl.style.opacity = '0';
    this.returnFx.setDropShadow(0, 0, 0, 0);
    synthAudio.startBoss2Music();
    this.endCinematicCamera();
    this.emitHud();
  }

  /** Battered rig: two smashed face monitors (static + cracks), torn chest, dangling cables, scorched armour. */
  private applyBoss2Damage(e: EnemyEntity) {
    e.v2 = true;
    e.v2Spark = 0;
    const mesh = e.mesh;
    if (!this.staticTex) {
      const cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = 48;
      const cx = cv.getContext('2d')!;
      const img = cx.createImageData(48, 48);
      for (let i = 0; i < 48 * 48; i++) {
        const row = Math.floor(i / 48);
        const v = (Math.random() * 200 + 30) * (row % 3 === 0 ? 0.45 : 1);
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v * 1.05;
        img.data[i * 4 + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      this.staticTex = new THREE.CanvasTexture(cv);
      this.staticTex.wrapS = THREE.RepeatWrapping;
      this.staticTex.wrapT = THREE.RepeatWrapping;
      this.staticTex.magFilter = THREE.NearestFilter;
      this.staticTex.minFilter = THREE.NearestFilter;
    }
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x55595f,
      map: this.staticTex,
      emissive: 0xffffff,
      emissiveMap: this.staticTex,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    const crackMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
    const broken: THREE.Mesh[] = [];
    for (const f of [0, 2]) {
      const face = mesh.getObjectByName(`white_face_${f}`);
      if (!face) continue;
      face.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && /^face_(plate|brow|chin)_/.test(m.name)) {
          m.material = screenMat;
          broken.push(m);
        }
      });
      // Cracks splintering across the screen
      for (const [cx, cy, rot, len] of [
        [-0.06, 0.08, 0.7, 0.5],
        [0.1, -0.12, -0.9, 0.42],
        [0.02, 0.2, 0.15, 0.3],
      ]) {
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.02), crackMat);
        crack.position.set(cx, cy, 0.63);
        crack.rotation.z = rot;
        face.add(crack);
      }
      if (f === 2) {
        // Knocked loose: hangs askew
        face.rotation.z = 0.38;
        face.position.y -= 0.1;
      }
    }
    e.brokenFaces = broken;

    // Chest armour ripped open: cables and the red guts showing
    const upper = mesh.getObjectByName('chest_plate_upper');
    if (upper) upper.visible = false;
    const lower = mesh.getObjectByName('chest_plate_lower');
    if (lower) {
      lower.rotation.z = 0.42;
      lower.position.x += 0.25;
      lower.position.y -= 0.12;
    }
    const cableMat = new THREE.MeshStandardMaterial({ color: 0xb01428, emissive: 0x6a0610, emissiveIntensity: 0.8, roughness: 0.4 });
    for (const [x, len, swing] of [
      [-0.45, 1.1, 0.25],
      [-0.12, 0.8, -0.15],
      [0.32, 1.3, 0.3],
    ]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, len, 5), cableMat);
      cable.position.set(x, 3.55 - len / 2, 0.66);
      cable.rotation.z = swing;
      cable.name = 'dangling_cable';
      mesh.add(cable);
    }

    // Scorched, darker armour
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || broken.includes(m) || m.material === crackMat || m.material === cableMat) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat?.color) mat.color.multiplyScalar(0.55);
    });

    // The masks have lost it: X-eyes, a stitched grin, ERR, sockets crying blood
    applyBrokenExpressions(mesh);
    // One mask torn half off, hanging by its cables
    const loose = mesh.getObjectByName('white_face_3');
    if (loose) {
      loose.rotation.x = 0.55;
      loose.rotation.z = -0.25;
      loose.position.y -= 0.18;
    }
    // Halo snapped and knocked crooked
    const halo = mesh.getObjectByName('dharma_halo_outer');
    if (halo) {
      halo.rotation.z += 0.5;
      halo.rotation.x += 0.35;
      halo.scale.multiplyScalar(0.92);
    }
    const haloIn = mesh.getObjectByName('dharma_halo_inner');
    if (haloIn) haloIn.visible = false;
    // Left arm hangs dead from the shoulder
    const deadArm = mesh.getObjectByName('forearm_-1');
    if (deadArm) deadArm.rotation.x += 0.9;
    const deadPalm = mesh.getObjectByName('prayer_palm_-1');
    if (deadPalm) deadPalm.visible = false;
    // Patched up in a hurry: duct tape X's and staples over the wounds
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.9 });
    const stapleMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d8, metalness: 0.8, roughness: 0.3 });
    for (const [x, y, z] of [
      [0.35, 3.1, 0.62],
      [-0.4, 2.7, 0.6],
    ]) {
      for (const r of [0.75, -0.75]) {
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.03), tapeMat);
        tape.position.set(x, y, z);
        tape.rotation.z = r;
        mesh.add(tape);
      }
    }
    for (let k = 0; k < 6; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), stapleMat);
      st.position.set(-0.05 + (k % 2) * 0.1, 2.4 + k * 0.12, 0.68);
      mesh.add(st);
    }
    // Red-hot cracks glowing through the chassis
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false });
    for (const [x, y, r, len] of [
      [0.2, 2.9, 0.5, 0.7],
      [-0.25, 3.3, -0.8, 0.5],
      [0.45, 2.5, 1.2, 0.45],
      [-0.5, 2.3, 0.2, 0.6],
    ]) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.02), glowMat);
      crack.position.set(x, y, 0.7);
      crack.rotation.z = r;
      mesh.add(crack);
    }
    // More cables spilling out of the head
    for (const [x, len, swing] of [
      [-0.3, 0.9, -0.4],
      [0.25, 0.7, 0.5],
      [0.05, 1.2, 0.1],
    ]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, len, 5), cableMat);
      cable.position.set(x, 4.35 - len / 2, 0.45);
      cable.rotation.z = swing;
      mesh.add(cable);
    }

    // One leg wrecked → the limp
    e.badLeg = e.spiderLegs?.[1];
    e.leapChainLeft = 0;
  }

  /** Limp, sagging body, sparks and smoke from the broken panels. */
  private animateBoss2Damage(e: EnemyEntity, dt: number, speedMag: number) {
    // Dragging leg + lurching body roll on the bad step
    if (e.badLeg) {
      e.badLeg.rotation.x = -0.35 + Math.sin(e.walkPhase * 0.5) * 0.08;
      e.badLeg.rotation.z = 0.22;
    }
    if (!e.leapActive && !(e.v2Stun && e.v2Stun > 0)) {
      const moving = Math.min(1, speedMag / 3);
      e.mesh.rotation.z = 0.06 + Math.sin(e.walkPhase) * 0.09 * moving;
    }
    // Broken screens flicker
    if (e.brokenFaces) {
      const on = Math.random() < 0.85;
      for (const m of e.brokenFaces) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.45 + Math.random() * 0.3 : 0.05;
    }
    if (dt <= 0) return;
    e.v2Spark = (e.v2Spark ?? 0) - dt;
    if (e.v2Spark <= 0) {
      e.v2Spark = 0.22 + Math.random() * 0.35;
      this.boss2SparkBurst(e, 0.6);
    }
    // Always smoking from the cracks
    if (Math.random() < dt * 6) this.fx.puff(e.x + (Math.random() - 0.5) * 1.2, 3 + Math.random() * 1.5, e.z + (Math.random() - 0.5) * 1.2, 0.7, 0x1c1a1a);
  }

  private boss2SparkBurst(e: EnemyEntity, strength: number) {
    const head = Math.random() < 0.55;
    const y = head ? 4.3 + Math.random() * 0.6 : 2.8 + Math.random() * 0.9;
    const off = head ? 0.5 : 0.7;
    const sx = e.x + (Math.random() - 0.5) * off * 2;
    const sz = e.z + (Math.random() - 0.5) * off * 2;
    this.spawnParticles(sx, y, sz, Math.round(6 * strength + 2), Math.random() < 0.5 ? 0xffffff : 0xffb040, 7, 0.22);
    if (Math.random() < 0.3) this.fx.puff(sx, y, sz, 0.5, 0x2c2a29);
    if (Math.random() < 0.35 * strength) synthAudio.playShortCircuit(0.35 * strength);
  }

  // ─── AI

  /** Walking into him hurts (his legs and the sparking wreck). */
  private boss2ContactDamage(e: EnemyEntity, dist: number, dirX: number, dirZ: number) {
    if (!e.leapActive && dist < e.radius + PLAYER_RADIUS + 0.15) this.damagePlayer(1, dirX, dirZ);
  }

  private pickBoss2Attack(e: EnemyEntity, dist: number): Boss2Attack {
    if (e.enraged && e.v2Last !== 'impale' && Math.random() < 0.6) return 'impale';
    const options: Boss2Attack[] = dist < 12 ? ['flame', 'barrage', 'leap'] : ['barrage', 'leap', 'barrage'];
    const pool = options.filter((a) => a !== e.v2Last);
    return pool[Math.floor(Math.random() * pool.length)] ?? 'barrage';
  }

  private rollBoss2Lanes(e: EnemyEntity): number[] {
    const n = e.enraged ? 11 : 9;
    const spread = e.enraged ? 1.9 : 1.55;
    const center = Math.atan2(this.playerX - e.x, this.playerZ - e.z) + (Math.random() - 0.5) * 0.25;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(center - spread / 2 + (spread * i) / (n - 1) + (Math.random() - 0.5) * 0.06);
    return out;
  }

  /** Distance from (x, z) along `yaw` to the arena wall (minus `inset`). */
  private rayToArenaEdge(x: number, z: number, yaw: number, inset: number) {
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const R = ARENA_RADIUS - inset;
    const b = x * dx + z * dz;
    const c = x * x + z * z - R * R;
    const disc = b * b - c;
    return disc > 0 ? Math.max(0.5, -b + Math.sqrt(disc)) : 1;
  }

  private startBoss2Attack(e: EnemyEntity, kind: Boss2Attack, chained = false) {
    e.v2Attack = kind;
    e.v2Last = kind;
    e.state = 'telegraph';
    e.hasToken = true;
    e.vx = 0;
    e.vz = 0;
    const toP = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
    switch (kind) {
      case 'flame':
        e.stateTimer = e.enraged ? 0.6 : 0.8;
        e.v2Yaw = toP;
        synthAudio.playShortCircuit(0.7);
        break;
      case 'barrage':
        e.stateTimer = e.enraged ? 0.5 : 0.7;
        e.v2Salvos = e.enraged ? 4 : 3;
        e.v2Lanes = this.rollBoss2Lanes(e);
        synthAudio.playBossVoice('barrage');
        break;
      case 'leap': {
        e.stateTimer = e.enraged ? 0.65 : 0.8;
        const tgt = resolveCircleObstacleCollision(this.playerX, this.playerZ, e.radius, [], ARENA_RADIUS - 2.4);
        e.leapTargetX = tgt.x;
        e.leapTargetZ = tgt.z;
        e.leapChainLeft = e.enraged ? 2 : 1; // chained slams, re-aimed at you each time
        synthAudio.playBossVoice('leap');
        break;
      }
      case 'impale':
        e.stateTimer = 0.95;
        e.v2Yaw = toP;
        // Past half health every impale comes back for more; below 30% twice
        if (!chained) e.v2Chain = e.hp < e.maxHp * 0.3 ? 2 : 1;
        synthAudio.playRobotScream(0.96 + Math.random() * 0.1, 1, 0.15);
        this.trauma = Math.max(this.trauma, 0.6);
        this.spawnParticles(e.x, 4.4, e.z, 24, 0xff2a1f, 10, 0.4);
        break;
    }
  }

  /** Cancels whatever he was doing (visuals + sounds) and drops him into a short cooldown. */
  private endBoss2Attack(e: EnemyEntity) {
    this.returnFx.setFlame(false);
    synthAudio.stopFlame();
    this.returnFx.hideLanes();
    this.returnFx.hideImpale();
    if (e.leapRingMesh) e.leapRingMesh.visible = false;
    e.leapActive = false;
    e.hoverY = 0;
    e.v2Stun = 0;
    e.mesh.rotation.x = 0;
    e.mesh.scale.set(1, 1, 1);
    this.setGroupEmissiveFlash(e.mesh, false);
    e.state = 'cooldown';
    e.stateTimer = 0.3;
    e.hasToken = false;
  }

  /** Cem Faces (second coming) bulldozes the room's columns: anything he plows into crumbles. */
  private boss2SmashPillars(x: number, z: number, reach: number) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.kind !== 'mesa') continue;
      if (Math.hypot(o.x - x, o.z - z) > reach + o.radius) continue;
      o.group.parent?.remove(o.group);
      this.obstacles.splice(i, 1);
      this.returnFx.spawnDebris(o.x, o.z, 22, 2.4, 3.5);
      this.returnFx.burst(o.x, 1.5, o.z, 24, 7, 0.6);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        this.fx.puff(o.x + Math.cos(a) * 1.4, 0.6 + Math.random() * 2, o.z + Math.sin(a) * 1.4, 1.3, 0x5a524a, { x: Math.cos(a) * 3, z: Math.sin(a) * 3 });
      }
      this.spawnParticles(o.x, 1.5, o.z, 22, 0x8a8278, 9, 0.5);
      this.fx.stampMark(o.x, o.z, 2.6, 1, Math.random() * Math.PI, 0x14100c);
      synthAudio.playCeilingCrash();
      this.trauma = Math.min(1, this.trauma + 0.6);
    }
  }

  private updateBoss2AI(e: EnemyEntity, dt: number, dist: number, dirX: number, dirZ: number) {
    const enr = !!e.enraged;
    // His charge plows straight through the columns
    if (e.v2Attack === 'impale' && e.state === 'attack') this.boss2SmashPillars(e.x, e.z, e.radius + 1.2);

    // Stuck in the wall after an impale: the punish window
    if (e.v2Stun && e.v2Stun > 0) {
      e.v2Stun -= dt;
      e.vx = 0;
      e.vz = 0;
      e.mesh.rotation.x = 0.32;
      if (Math.random() < dt * 8) this.boss2SparkBurst(e, 0.8);
      if (e.v2Stun <= 0) {
        e.mesh.rotation.x = 0;
        if ((e.v2Chain ?? 0) > 0) {
          e.v2Chain = (e.v2Chain ?? 1) - 1;
          this.startBoss2Attack(e, 'impale', true);
          e.stateTimer = 0.7; // the follow-up comes quicker
        } else {
          e.state = 'cooldown';
          e.stateTimer = 0.4;
          e.hasToken = false;
        }
      }
      return;
    }

    if (e.state === 'move') {
      // Limping stalk at mid range
      e.yaw = Math.atan2(dirX, dirZ);
      const pref = 8.5;
      const radial = dist > pref + 2 ? 1 : dist < pref - 3 ? -0.4 : 0.15;
      const strafe = 0.5 * e.strafeSign;
      const limp = 0.45 + 0.55 * Math.abs(Math.sin(e.walkPhase));
      const sp = e.speed * limp * (enr ? 1.3 : 1.05);
      e.vx = (dirX * radial - dirZ * strafe) * sp;
      e.vz = (dirZ * radial + dirX * strafe) * sp;
      this.boss2ContactDamage(e, dist, dirX, dirZ);
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) this.startBoss2Attack(e, this.pickBoss2Attack(e, dist));
      return;
    }

    if (e.state === 'cooldown') {
      e.vx *= 0.85;
      e.vz *= 0.85;
      this.boss2ContactDamage(e, dist, dirX, dirZ);
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.state = 'move';
        e.stateTimer = enr ? 0.3 : 0.55;
        e.strafeSign *= -1;
      }
      return;
    }

    const telegraph = e.state === 'telegraph';
    if (telegraph) {
      e.vx *= 0.7;
      e.vz *= 0.7;
      e.stateTimer -= dt;
      this.setGroupEmissiveFlash(e.mesh, Math.sin(this.elapsedSec * 30) > 0, 0xff2a10);
    }

    switch (e.v2Attack) {
      case 'flame': {
        const RANGE = NeonMesaEngine.B2_FLAME_RANGE;
        const HALF = NeonMesaEngine.B2_FLAME_HALF;
        if (telegraph) {
          const total = enr ? 0.6 : 0.8;
          e.yaw = e.v2Yaw ?? e.yaw;
          this.returnFx.showFlameTelegraph(e.x, e.z, e.v2Yaw ?? 0, RANGE, HALF, 1 - Math.max(0, e.stateTimer) / total);
          if (e.stateTimer <= 0) {
            this.setGroupEmissiveFlash(e.mesh, false);
            e.state = 'attack';
            e.stateTimer = enr ? 3.2 : 2.8;
            synthAudio.startFlame();
          }
        } else {
          // Sweeps after you while it burns — and keeps limping forward
          const want = Math.atan2(dirX, dirZ);
          let diff = want - (e.v2Yaw ?? want);
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const rate = (enr ? 1.3 : 0.9) * dt;
          e.v2Yaw = (e.v2Yaw ?? want) + Math.max(-rate, Math.min(rate, diff));
          e.yaw = e.v2Yaw;
          // Strides in fast while the flamethrower's intake drags you toward the nozzle
          const advance = dist > 3.2 ? (enr ? 5.4 : 4.4) : 0;
          e.vx = Math.sin(e.v2Yaw) * advance;
          e.vz = Math.cos(e.v2Yaw) * advance;
          if (dist > 2.6 && this.dashTimer <= 0) {
            const pull = (enr ? 4.2 : 3.4) * dt;
            const res = resolveCircleObstacleCollision(this.playerX - dirX * pull, this.playerZ - dirZ * pull, PLAYER_RADIUS, this.obstacles, ARENA_RADIUS);
            this.playerX = res.x;
            this.playerZ = res.z;
            if (Math.random() < dt * 30) {
              const k = Math.random();
              this.spawnParticles(this.playerX - dirX * dist * k, 0.6 + Math.random(), this.playerZ - dirZ * dist * k, 1, 0xffa040, 1.2, 0.25);
            }
          }
          const yaw = e.v2Yaw;
          this.returnFx.setFlame(true, e.x + Math.sin(yaw) * 1.7, 2.7, e.z + Math.cos(yaw) * 1.7, yaw, RANGE, HALF);
          const ang = Math.atan2(this.playerX - e.x, this.playerZ - e.z);
          const off = Math.abs(Math.atan2(Math.sin(ang - yaw), Math.cos(ang - yaw)));
          if (dist < RANGE + 0.3 && off < HALF + 0.05) {
            this.damagePlayer(1, dirX, dirZ);
          }
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            this.returnFx.setFlame(false);
            synthAudio.stopFlame();
            e.state = 'cooldown';
            e.stateTimer = enr ? 0.4 : 0.6;
            e.hasToken = false;
          }
        }
        break;
      }

      case 'barrage': {
        const lanes = e.v2Lanes ?? [];
        const len = 36;
        if (telegraph) {
          const blink = Math.sin(this.elapsedSec * (e.stateTimer < 0.3 ? 46 : 18)) > 0 ? 0.95 : 0.45;
          this.returnFx.showLanes(e.x, e.z, lanes, len, blink);
          e.yaw = lanes[Math.floor(lanes.length / 2)] ?? e.yaw;
          if (e.stateTimer <= 0) {
            this.setGroupEmissiveFlash(e.mesh, false);
            const speed = enr ? 30 : 26;
            lanes.forEach((yaw, i) => {
              const sx = Math.sin(yaw);
              const sz = Math.cos(yaw);
              this.spawnProjectile(false, 'enemy_bolt', e.x + sx * 1.6, 1.5, e.z + sz * 1.6, sx * speed, sz * speed, 1, 0, i % 2 ? 0xff7a1a : 0xff1e2a, false, true);
            });
            this.spawnParticles(e.x, 3.2, e.z, 16, 0xff3a1a, 9, 0.25);
            synthAudio.playExplosion();
            e.state = 'attack';
            e.stateTimer = 0.32;
          }
        } else {
          e.stateTimer -= dt;
          this.returnFx.showLanes(e.x, e.z, lanes, len, Math.max(0, e.stateTimer / 0.32) * 0.5);
          if (e.stateTimer <= 0) {
            e.v2Salvos = (e.v2Salvos ?? 1) - 1;
            if (e.v2Salvos > 0) {
              e.v2Lanes = this.rollBoss2Lanes(e);
              e.state = 'telegraph';
              e.stateTimer = enr ? 0.36 : 0.46;
            } else {
              this.returnFx.hideLanes();
              e.state = 'cooldown';
              e.stateTimer = enr ? 0.4 : 0.6;
              e.hasToken = false;
            }
          }
        }
        break;
      }

      case 'leap': {
        if (telegraph) {
          if (e.leapRingMesh) {
            e.leapRingMesh.visible = true;
            e.leapRingMesh.position.set(e.leapTargetX ?? this.playerX, 0.08, e.leapTargetZ ?? this.playerZ);
            e.leapRingMesh.scale.setScalar(3.8 + Math.sin(this.elapsedSec * 24) * 0.45);
          }
          e.mesh.scale.set(1.08, 0.86, 1.08);
          if (e.stateTimer <= 0) {
            this.setGroupEmissiveFlash(e.mesh, false);
            e.mesh.scale.set(1, 1, 1);
            e.state = 'attack';
            e.leapActive = true;
            e.leapStartX = e.x;
            e.leapStartZ = e.z;
            e.leapTimer = 0;
            e.leapDuration = 0.64;
          }
        } else if (e.leapActive) {
          e.leapTimer = (e.leapTimer ?? 0) + dt;
          const u = Math.min(1, e.leapTimer / (e.leapDuration ?? 0.64));
          const sx = e.leapStartX ?? e.x;
          const sz = e.leapStartZ ?? e.z;
          const tx = e.leapTargetX ?? this.playerX;
          const tz = e.leapTargetZ ?? this.playerZ;
          e.x = sx + (tx - sx) * u;
          e.z = sz + (tz - sz) * u;
          e.vx = 0;
          e.vz = 0;
          e.yaw = Math.atan2(tx - sx, tz - sz);
          e.hoverY = computeParabolicJumpHeight(u, 6.2);
          if (u >= 1) {
            e.hoverY = 0;
            this.triggerBossLeapLanding(e); // → cooldown
          }
        }
        break;
      }

      case 'impale': {
        const SPEED = NeonMesaEngine.B2_IMPALE_SPEED;
        if (telegraph) {
          const LOCK_AT = 0.38;
          if (e.stateTimer > LOCK_AT) {
            // Tracks you…
            const want = Math.atan2(dirX, dirZ);
            let diff = want - (e.v2Yaw ?? want);
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            e.v2Yaw = (e.v2Yaw ?? want) + diff * Math.min(1, dt * 7);
          }
          const yaw = e.v2Yaw ?? 0;
          e.yaw = yaw;
          const len = this.rayToArenaEdge(e.x, e.z, yaw, e.radius);
          this.returnFx.showImpale(e.x, e.z, yaw, len, e.stateTimer <= LOCK_AT, this.elapsedSec);
          // Coiled, shaking
          e.mesh.scale.set(1.05, 0.9, 1.05);
          e.mesh.position.x += (Math.random() - 0.5) * 0.08;
          if (e.stateTimer <= 0) {
            this.setGroupEmissiveFlash(e.mesh, false);
            e.mesh.scale.set(1, 1, 1);
            e.state = 'attack';
            e.stateTimer = 1.5; // safety cap
            e.v2Traveled = 0;
            e.v2LastX = e.x;
            e.v2LastZ = e.z;
            synthAudio.playBossSlam();
            this.trauma = Math.max(this.trauma, 0.5);
          }
        } else {
          const yaw = e.v2Yaw ?? 0;
          const dx = Math.sin(yaw);
          const dz = Math.cos(yaw);
          e.yaw = yaw;
          // Blocked by something last frame? (obstacle push-back)
          const moved = Math.hypot(e.x - (e.v2LastX ?? e.x), e.z - (e.v2LastZ ?? e.z));
          const blocked = (e.v2Traveled ?? 0) > 0.06 && moved < SPEED * dt * 0.35;
          e.v2LastX = e.x;
          e.v2LastZ = e.z;
          e.v2Traveled = (e.v2Traveled ?? 0) + dt;
          const nextR = Math.hypot(e.x + dx * SPEED * dt, e.z + dz * SPEED * dt);
          const hitWall = nextR > ARENA_RADIUS - e.radius - 0.35;
          e.stateTimer -= dt;
          const len = this.rayToArenaEdge(e.x, e.z, yaw, e.radius);
          this.returnFx.showImpale(e.x, e.z, yaw, len, true, this.elapsedSec);
          // Trail of sparks off the dragging legs
          if (Math.random() < dt * 30) this.spawnParticles(e.x, 0.4, e.z, 3, 0xffb040, 6, 0.25);
          if (dist < e.radius + PLAYER_RADIUS + 0.35) {
            this.damagePlayer(2, dx, dz); // impaled
          }
          if (hitWall || blocked || e.stateTimer <= 0) {
            // Slams into the wall and sticks
            e.vx = 0;
            e.vz = 0;
            this.returnFx.hideImpale();
            this.trauma = Math.max(this.trauma, 0.9);
            synthAudio.playBossSlam();
            synthAudio.playShortCircuit(1);
            this.spawnParticles(e.x + dx * 1.8, 1.8, e.z + dz * 1.8, 30, 0xffb040, 12, 0.45);
            this.spawnParticles(e.x + dx * 1.8, 1.4, e.z + dz * 1.8, 18, 0x6b6560, 9, 0.6);
            this.returnFx.spawnDebris(e.x + dx * 2, e.z + dz * 2, 6, 1.5, 4);
            // Stuck for a beat — shorter when another impale is queued
            e.v2Stun = (e.v2Chain ?? 0) > 0 ? 0.55 : 1.0;
          } else {
            e.vx = dx * SPEED;
            e.vz = dz * SPEED;
          }
        }
        break;
      }

      default:
        this.endBoss2Attack(e);
    }
  }

  // ─── Death: falls, screams three times, detonates; the husk burns

  private beginBoss2Death(e: EnemyEntity) {
    this.endBoss2Attack(e);
    e.state = 'ko';
    e.husk = true;
    e.koTimer = Number.POSITIVE_INFINITY;
    e.mesh.position.y = 0;
    if (e.telegraphLine) e.telegraphLine.visible = false;
    this.boss2Stage = 'dead';
    this.cancelSlowMo();
    synthAudio.endBossMusic(2.0);
    synthAudio.preloadVm();
    for (const p of this.projectiles) {
      if (!p.fromPlayer) {
        p.active = false;
        p.group.visible = false;
      }
    }
    this.spawnVmDoor();
    this.boss2Cine = {
      e,
      t: 0,
      camFrom: this.camera.position.clone(),
      landed: true,
      line1: true,
      line2: true,
      walkFromX: e.x,
      walkFromZ: e.z,
      walkYaw: e.yaw,
      screams: 0,
      exploded: false,
      nextSpark: 0,
      shutterSound: false,
      shutterBang: false,
    };
    this.cutsceneMode = 'boss2_death';
    this.aimReticleMesh.visible = false;
    this.mouseDown = false;
    this.emitHud();
  }

  private charBoss2Husk(e: EnemyEntity) {
    // Burnt black, faint ember glow; dangling bits gone
    e.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) {
        const light = o as THREE.PointLight;
        if (light.isPointLight) light.intensity = 0;
        return;
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        // Soot-grey shell with embers still glowing through (reads against the dark floor)
        if (sm.color) sm.color.setHex(0x37302b);
        if (sm.emissive) {
          sm.emissive.setHex(0x7a1c06);
          sm.emissiveIntensity = 0.75;
          sm.userData.baseEmissive = 0x7a1c06;
          sm.userData.baseEmissiveIntensity = 0.75;
        }
        if ('map' in sm) sm.map = null;
        if ('emissiveMap' in sm) sm.emissiveMap = null;
        sm.needsUpdate = true;
      }
    });
    e.brokenFaces = [];
  }

  private updateBoss2Death(dt: number) {
    const c = this.boss2Cine;
    if (!c) {
      this.cutsceneMode = 'none';
      return;
    }
    c.t += dt;
    const t = c.t;
    const e = c.e;
    this.setLetterbox(Math.min(1, t / 0.4));

    // 1) He falls
    const fall = Math.min(1, t / 1.0);
    if (!c.exploded) this.applyBossCollapse(e, fall * fall * (3 - 2 * fall), false);
    if (t >= 1.0 && t - dt < 1.0) {
      this.trauma = Math.max(this.trauma, 0.7);
      synthAudio.playBossSlam();
      this.spawnParticles(e.x, 0.4, e.z, 26, 0x6b6560, 10, 0.7);
    }

    // 2) His dying scream ("robotic scream 3"), played whole while he convulses harder and
    //    harder — red surges racing faster and faster — until it ends in the blast
    const SCREAM_AT = 1.2;
    const BOOM = SCREAM_AT + DEATH_SCREAM_LEN - 0.15;
    if (c.screams === 0 && t >= SCREAM_AT) {
      c.screams = 1;
      synthAudio.playDeathScream();
      this.trauma = Math.max(this.trauma, 0.5);
    }
    if (!c.exploded && t > SCREAM_AT) {
      const u = Math.min(1, (t - SCREAM_AT) / (BOOM - SCREAM_AT)); // 0 → 1 toward the blast
      const period = 0.95 - u * 0.75;
      const surge = ((t - SCREAM_AT) % period) / period < 0.35;
      this.setGroupEmissiveFlash(e.mesh, surge, u > 0.7 && Math.random() < 0.3 ? 0xffffff : 0xff2a10);
      const shake = 0.06 + u * 0.22;
      e.mesh.position.x = e.x + (Math.random() - 0.5) * shake;
      e.mesh.position.z = e.z + (Math.random() - 0.5) * shake;
      this.trauma = Math.max(this.trauma, 0.15 + u * 0.45);
      if (t >= c.nextSpark) {
        c.nextSpark = t + (0.22 - u * 0.16) + Math.random() * 0.12;
        this.boss2SparkBurst(e, 0.8 + u * 1.2);
        if (Math.random() < 0.25 + u * 0.5) this.returnFx.burst(e.x, 2, e.z, 6 + Math.round(u * 20), 5 + u * 4, 0.5);
      }
    }

    // 3) Detonation: red and orange
    if (!c.exploded && t >= BOOM) {
      c.exploded = true;
      this.setGroupEmissiveFlash(e.mesh, false);
      this.applyBossCollapse(e, 1, true);
      this.charBoss2Husk(e);
      this.returnFx.explode(e.x, 2.2, e.z);
      this.spawnParticles(e.x, 2, e.z, 60, 0xff6a1a, 18, 0.9);
      this.spawnParticles(e.x, 2, e.z, 40, 0xff2a10, 14, 0.8);
      this.spawnParticles(e.x, 2, e.z, 30, 0xffd27a, 20, 0.5);
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.puff(e.x + Math.cos(a) * 2, 1 + Math.random() * 2, e.z + Math.sin(a) * 2, 1.6, 0x1c1a19, { x: Math.cos(a) * 2, z: Math.sin(a) * 2 });
      }
      this.fx.stampMark(e.x, e.z, 6, 1, Math.random() * Math.PI, 0x0a0807);
      this.returnFx.spawnDebris(e.x, e.z, 16, 3, 3);
      this.fireFlash = 1;
      this.trauma = 1;
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.08);
      synthAudio.playBigExplosion();
      this.returnFx.igniteHusk(e.x, e.z);
      synthAudio.startHuskFire();
    }

    // 4) VM's shutter opens beyond the flames
    const room = this.vmDoor;
    const DOOR_AT = BOOM + 2.7;
    if (room && t >= DOOR_AT) {
      if (!c.shutterSound) {
        c.shutterSound = true;
        synthAudio.playShutterOpen(0.85);
      }
      const u = Math.min(1, (t - DOOR_AT) / 0.85);
      room.setOpen(u * u);
      if (u >= 1 && !c.shutterBang) {
        c.shutterBang = true;
        this.trauma = Math.max(this.trauma, 0.7);
      }
    }

    // Camera: low orbit on the dying machine → pull back for the blast → turn to the door
    const bossPos = new THREE.Vector3(e.x, 1.6, e.z);
    const away = Math.atan2(this.playerX - e.x, this.playerZ - e.z) + 0.4 + t * 0.05;
    const near = new THREE.Vector3(e.x + Math.sin(away) * 10, 4.2, e.z + Math.cos(away) * 10);
    const far = new THREE.Vector3(e.x + Math.sin(away) * 15, 8.5, e.z + Math.cos(away) * 15);
    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    const PAN_AT = BOOM + 1.9;
    if (!room || t < PAN_AT) {
      if (t < 1.2) {
        const k = Math.min(1, t / 1.2);
        pos = c.camFrom.clone().lerp(near, k * k * (3 - 2 * k));
      } else if (t < BOOM - 0.2) {
        // Slow push-in while he screams
        const k = Math.min(1, (t - 1.2) / (BOOM - 1.4));
        pos = near.clone().lerp(new THREE.Vector3(e.x + Math.sin(away) * 7.5, 3.2, e.z + Math.cos(away) * 7.5), k);
      } else {
        const k = Math.min(1, (t - (BOOM - 0.2)) / 0.8);
        pos = near.clone().lerp(far, k * k * (3 - 2 * k));
      }
      target = bossPos;
    } else {
      const doorShot = room.doorFront.clone().addScaledVector(room.outward, 8).setY(3.6);
      const doorLook = room.doorFront.clone().setY(2.5);
      const k = Math.min(1, (t - PAN_AT) / 1.1);
      const kk = k * k * (3 - 2 * k);
      pos = far.clone().lerp(doorShot, kk);
      target = bossPos.clone().lerp(doorLook, kk);
    }
    this.cineCamera(pos, target);

    if (t >= BOOM + 5.1) this.finishBoss2Death();
  }

  private finishBoss2Death() {
    const c = this.boss2Cine;
    this.boss2Cine = null;
    if (this.cutsceneMode === 'boss2_death') this.cutsceneMode = 'none';
    if (c) {
      const e = c.e;
      if (!c.exploded) {
        // Skipped mid-scream: cut it and go straight to the blast
        synthAudio.stopDeathScream();
        synthAudio.playBigExplosion();
        this.fireFlash = 1;
        this.returnFx.explode(e.x, 2.2, e.z);
        this.applyBossCollapse(e, 1, true);
        this.charBoss2Husk(e);
        this.returnFx.igniteHusk(e.x, e.z);
        synthAudio.startHuskFire();
      }
      this.setGroupEmissiveFlash(e.mesh, false);
      e.mesh.position.set(e.x, e.mesh.position.y, e.z);
      const idx = this.enemies.indexOf(e);
      if (idx >= 0) this.enemies.splice(idx, 1);
      if (e.telegraphLine) this.scene.remove(e.telegraphLine);
      if (e.leapRingMesh) this.scene.remove(e.leapRingMesh);
      if (this.bossHusk && this.bossHusk !== e) {
        this.scene.remove(this.bossHusk.mesh);
        this.scene.remove(this.bossHusk.shadow);
      }
      this.bossHusk = e; // keeps burning until the floor is left
    }
    this.vmDoor?.setOpen(1);
    this.endCinematicCamera();
    this.emitHud();
  }

  private removeBossHusk() {
    // The fire ring around his burnt husk goes out with it
    this.returnFx.clearHusk();
    synthAudio.stopHuskFire(0.3);
    if (!this.bossHusk) return;
    this.scene.remove(this.bossHusk.mesh);
    this.scene.remove(this.bossHusk.shadow);
    this.bossHusk = null;
  }

  /** Tears down VM's door (and the husk) when leaving the floor / starting over. */
  private removeVmRoom() {
    this.removeBossHusk();
    if (this.inVmSpace) {
      this.inVmSpace = false;
      this.camera.far = 160;
      this.camera.updateProjectionMatrix();
      if (this.vmSpace) this.vmSpace.group.visible = false;
      synthAudio.stopVmMusic(0.3);
    }
    this.vmPrompt = false;
    if (this.treeLeftPortalRing.parent) this.treeLeftPortalRing.parent.visible = true;
    if (!this.vmDoor) return;
    this.scene.remove(this.vmDoor.group);
    this.vmDoor = null;
    this.setTowersNearVmHidden(false);
  }

  // ───────────────────────── Items (Gungeon-style) ─────────────────────────

  /** F: fires the active item if it's charged. */
  public useActiveItem() {
    if (this.phase !== 'playing' || this.isCinematic() || this.inVmSpace || !this.activeItem) return;
    if (this.activeCharge < this.activeMax) {
      synthAudio.playFuseBeep();
      return;
    }
    this.activeCharge = 0;
    const id = this.activeItem;
    if (id === 'bomb') {
      // Lob it where you're aiming (capped), arcing over obstacles
      let tx = this.playerX + Math.sin(this.playerYaw) * 7;
      let tz = this.playerZ + Math.cos(this.playerYaw) * 7;
      if (this.hasMouseMoved) {
        const hit = this.screenToWorld(this.mouseClientX, this.mouseClientY);
        if (hit) {
          const dx = hit.x - this.playerX;
          const dz = hit.z - this.playerZ;
          const d = Math.hypot(dx, dz);
          const k = d > 9 ? 9 / d : 1;
          tx = this.playerX + dx * k;
          tz = this.playerZ + dz * k;
        }
      }
      const clamped = resolveCircleObstacleCollision(tx, tz, 0.4, [], ARENA_RADIUS - 1);
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.6, emissive: 0x2a2a30, emissiveIntensity: 0.3, flatShading: true }));
      const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false }));
      fuse.position.y = 0.4;
      fuse.name = 'fuse';
      mesh.add(body, fuse);
      mesh.position.set(this.playerX, 1.2, this.playerZ);
      this.scene.add(mesh);
      this.bombs.push({ mesh, sx: this.playerX, sz: this.playerZ, tx: clamped.x, tz: clamped.z, t: 0 });
      synthAudio.playWeaponPickup('rocket', 'equip');
    } else if (id === 'ironSkin') {
      this.ironSkinTimer = 5;
      this.invulnTimer = Math.max(this.invulnTimer, 5);
      this.spawnParticles(this.playerX, 1.2, this.playerZ, 24, 0xc8ccd4, 8, 0.4);
      synthAudio.playParry(3);
      this.pickupBanner = 'PELE DE CHUMBO';
      this.pickupBannerTimer = 1.2;
    } else if (id === 'pacify') {
      for (const e of this.enemies) {
        if (e.state === 'ko' || e.archetype === 'boss') continue;
        this.pacifyEnemy(e, 5);
      }
      this.whiteFlash = Math.max(this.whiteFlash ?? 0, 0.35);
      synthAudio.playPowerDown();
      this.pickupBanner = 'DECRETO DE PAZ · TODO MUNDO ASSINOU';
      this.pickupBannerTimer = 1.8;
      // The hero holds the signed paper up high for everyone to read
      if (this.decreeFx) this.scene.remove(this.decreeFx.mesh);
      const paper = new THREE.Mesh(itemVoxelGeometry('pacify'), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true }));
      paper.rotation.x = -0.9;
      this.scene.add(paper);
      this.decreeFx = { mesh: paper, t: 0 };
    }
    this.emitHud();
  }

  /** Charm / Decree of Peace: the enemy forgets the fight for a while and wanders. */
  private pacifyEnemy(e: EnemyEntity, seconds: number) {
    if (e.archetype === 'boss' || e.state === 'ko') return;
    e.pacified = Math.max(e.pacified ?? 0, seconds);
    if (e.state === 'telegraph' || e.state === 'attack') {
      e.state = 'move';
      e.stateTimer = 1;
    }
    e.hasToken = false;
    if (e.telegraphLine) e.telegraphLine.visible = false;
    if (e.alert) e.alert.visible = false;
    if (e.chantRing) e.chantRing.visible = false;
    if (e.beam) e.beam.visible = false;
    this.setGroupEmissiveFlash(e.mesh, false);
    this.spawnParticles(e.x, 2.2, e.z, 8, 0xff8ad8, 3, 0.5);
  }

  private updatePacified(e: EnemyEntity, dt: number) {
    e.pacified = Math.max(0, (e.pacified ?? 0) - dt);
    // Slow aimless drift; turns every so often
    e.stateTimer -= dt;
    if (e.stateTimer <= 0) {
      e.stateTimer = 0.8 + Math.random() * 1.2;
      e.yaw = Math.random() * Math.PI * 2;
    }
    e.vx = Math.sin(e.yaw) * e.speed * 0.25;
    e.vz = Math.cos(e.yaw) * e.speed * 0.25;
    if (Math.random() < dt * 5) this.spawnParticles(e.x, e.radius * 2.2 + 1.2, e.z, 1, 0xff8ad8, 0.8, 0.6);
    if (e.pacified <= 0) {
      e.state = 'cooldown';
      e.stateTimer = 0.5;
    }
  }

  /** Per-frame item upkeep: bombs in flight, Lead Skin, the robot dog. */
  private updateItems(dt: number) {
    // Bombs: 0.5 s arc, then a short blinking fuse, then boom
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt;
      const u = Math.min(1, b.t / 0.5);
      b.mesh.position.set(b.sx + (b.tx - b.sx) * u, 0.35 + Math.sin(u * Math.PI) * 3, b.sz + (b.tz - b.sz) * u);
      b.mesh.rotation.x += dt * 8;
      const fuse = b.mesh.getObjectByName('fuse') as THREE.Mesh | undefined;
      if (fuse) (fuse.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(b.t * 30) > 0 ? 0xff2020 : 0xffd060);
      if (u >= 1 && Math.random() < dt * 30) this.spawnParticles(b.mesh.position.x, 0.8, b.mesh.position.z, 1, 0xffb030, 2, 0.2);
      if (b.t >= (b.fuse ?? 1.15)) {
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
        this.triggerExplosion(b.tx, b.tz, b.radius ?? 4.6, b.damage ?? 150);
        // Bombs also clear enemy bullets in the blast
        for (const p of this.projectiles) {
          if (p.active && !p.fromPlayer && Math.hypot(p.x - b.tx, p.z - b.tz) < 4.6) {
            p.active = false;
            p.group.visible = false;
          }
        }
      }
    }

    // Decree of Peace: the paper rises over your head, wobbles, fades
    if (this.decreeFx) {
      const d = this.decreeFx;
      d.t += dt;
      d.mesh.position.set(this.playerX, 3.2 + Math.min(1, d.t * 3) * 1.2, this.playerZ);
      d.mesh.rotation.z = Math.sin(d.t * 9) * 0.12;
      d.mesh.scale.setScalar(1.6 * Math.min(1, d.t * 5));
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, Math.max(0, (2.2 - d.t) / 0.4));
      if (d.t > 2.2) {
        this.scene.remove(d.mesh);
        this.decreeFx = null;
      }
    }

    // Lead Skin: silver sheen while it lasts
    if (this.ironSkinTimer > 0) {
      this.ironSkinTimer = Math.max(0, this.ironSkinTimer - dt);
      if (this.heroModel) this.setGroupEmissiveFlash(this.heroModel, this.ironSkinTimer > 0, 0x8a94a4);
      if (Math.random() < dt * 14) this.spawnParticles(this.playerX, 0.6 + Math.random() * 1.4, this.playerZ, 1, 0xd8dce4, 2, 0.3);
    }

    // Robot dog: hunts enemies near you (charges in, bites, staggers), fetches loose coins,
    // otherwise trots at your heel
    if (this.upgrades.has('pet')) {
      if (!this.pet) this.pet = this.buildPet();
      const p = this.pet;
      p.cd = Math.max(0, p.cd - dt);
      p.barkTimer -= dt;

      let goalX = this.playerX - Math.sin(this.playerYaw) * 1.8 + Math.cos(this.playerYaw) * 1.1;
      let goalZ = this.playerZ - Math.cos(this.playerYaw) * 1.8 - Math.sin(this.playerYaw) * 1.1;
      let speedCap = 14;

      // Pick a target: the nearest live enemy within 11 m of the player
      let target: EnemyEntity | null = null;
      if (!this.inVmSpace) {
        let best = 11;
        for (const e of this.enemies) {
          if (e.state === 'ko' || e.flying || e.pacified || (e.emergeTimer && e.emergeTimer > 0)) continue;
          const ed = Math.hypot(e.x - this.playerX, e.z - this.playerZ);
          const bias = e.id === p.targetId ? 2 : 0; // stick with the current victim
          if (ed - bias < best) {
            best = ed - bias;
            target = e;
          }
        }
      }
      // Loose coin nearby and nothing to bite: go fetch it
      const coin = target ? null : this.coins.nearest(p.x, p.z, 9);

      if (target) {
        if (p.mode !== 'hunt' || p.targetId !== target.id) {
          p.mode = 'hunt';
          p.targetId = target.id;
          if (p.barkTimer <= 0) {
            synthAudio.playDogBark();
            p.barkTimer = 2.5;
          }
        }
        goalX = target.x;
        goalZ = target.z;
        speedCap = p.cd > 0 ? 7 : 15;
        const reach = target.radius + 0.55;
        if (p.cd <= 0 && Math.hypot(target.x - p.x, target.z - p.z) < reach) {
          // CHOMP
          p.cd = 1.05;
          const dx = target.x - p.x;
          const dz = target.z - p.z;
          const dl = Math.hypot(dx, dz) || 1;
          this.damageEnemy(target, target.archetype === 'boss' ? 14 : 42, dx / dl, dz / dl);
          if (target.hp > 0 && target.archetype !== 'boss') {
            target.state = 'cooldown';
            target.stateTimer = 0.55;
            target.hasToken = false;
            if (target.telegraphLine) target.telegraphLine.visible = false;
            target.vx = (dx / dl) * 5;
            target.vz = (dz / dl) * 5;
          }
          this.fx.splatter(target.x, target.z, dx / dl, dz / dl, 0.7);
          this.spawnParticles(target.x, 0.7, target.z, 6, 0xff3040, 4, 0.25);
          synthAudio.playDogBite();
          // Hop back after the bite
          p.x -= (dx / dl) * 0.8;
          p.z -= (dz / dl) * 0.8;
        }
      } else if (coin) {
        p.mode = 'fetch';
        goalX = coin.x;
        goalZ = coin.z;
        speedCap = 13;
        // Got it: the coin flies to you
        if (Math.hypot(coin.x - p.x, coin.z - p.z) < 0.7) coin.pull();
      } else {
        p.mode = 'follow';
      }

      const dx = goalX - p.x;
      const dz = goalZ - p.z;
      const d = Math.hypot(dx, dz);
      const moving = d > 0.4;
      if (moving) {
        const sp = Math.min(d * 5, speedCap);
        p.x += (dx / d) * sp * dt;
        p.z += (dz / d) * sp * dt;
        p.yaw = Math.atan2(dx, dz);
        p.hop += dt * (p.mode === 'hunt' ? 24 : 16);
      }
      // Stay on solid ground
      const safe = resolveCircleObstacleCollision(p.x, p.z, 0.35, this.obstacles, ARENA_RADIUS);
      p.x = safe.x;
      p.z = safe.z;
      const head = p.mesh.getObjectByName('pet_head');
      if (head) head.rotation.x = p.cd > 0.8 ? -0.5 : 0;
      p.mesh.position.set(p.x, moving ? Math.abs(Math.sin(p.hop)) * 0.18 : 0, p.z);
      p.mesh.rotation.y = p.yaw;
      p.mesh.visible = this.heroRoot.visible;
    } else if (this.pet) {
      this.scene.remove(this.pet.mesh);
      this.pet = null;
    }
  }

  /** A scrap-metal robot dog: box body, blocky head, red eye, stubby legs, antenna tail. */
  private buildPet() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6, emissive: 0x9aa0a8, emissiveIntensity: 0.3, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c32, roughness: 0.6, metalness: 0.6, emissive: 0x2a2c32, emissiveIntensity: 0.2, flatShading: true });
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(0.5, 0.36, 0.8), steel, 0, 0.5, 0);
    add(new THREE.BoxGeometry(0.42, 0.36, 0.38), steel, 0, 0.78, 0.48).name = 'pet_head';
    add(new THREE.BoxGeometry(0.3, 0.16, 0.2), dark, 0, 0.7, 0.72); // snout
    add(new THREE.BoxGeometry(0.1, 0.07, 0.04), eye, 0.11, 0.86, 0.68);
    add(new THREE.BoxGeometry(0.1, 0.07, 0.04), eye, -0.11, 0.86, 0.68);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.2, 0.08), dark, sx * 0.14, 1.04, 0.42); // ears
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.34, 0.12), dark, sx * 0.18, 0.17, sz * 0.28);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.4), dark, 0, 0.7, -0.55).rotation.x = -0.6;
    add(new THREE.SphereGeometry(0.06, 6, 4), eye, 0, 0.84, -0.7);
    this.scene.add(g);
    return { mesh: g, x: this.playerX - 1.5, z: this.playerZ + 1.5, yaw: 0, cd: 0.5, hop: 0, mode: 'follow' as const, targetId: -1, barkTimer: 0 };
  }

  /** Gunboots: every dash kicks a fan of bullets out behind you. */
  private fireGunboots(dirX: number, dirZ: number) {
    const back = Math.atan2(-dirX, -dirZ);
    for (let i = 0; i < 5; i++) {
      const a = back + (i / 4 - 0.5) * 0.7;
      this.spawnProjectile(true, 'pistol', this.playerX, 0.5, this.playerZ, Math.sin(a) * 36, Math.cos(a) * 36, 16, 0, 0xffaa2b);
    }
    synthAudio.playShoot('pistols');
  }

  /** Skin ambience: acid drips, phantom smoke, gold glints, hologram flicker. */
  private emitSkinAura(dt: number) {
    const aura = outfitAura(this.equippedSkin);
    if (!aura || !this.heroRoot.visible) return;
    const x = this.playerX;
    const z = this.playerZ;
    const j = () => (Math.random() - 0.5) * 0.9;
    if (aura === 'acid' && Math.random() < dt * 14) {
      this.spawnParticles(x + j(), 0.5 + Math.random() * 1.1, z + j(), 1, Math.random() < 0.6 ? 0x7dff2a : 0xccff33, 0.8, 0.55);
    } else if (aura === 'smoke' && Math.random() < dt * 10) {
      this.fx.puff(x + j(), 0.3 + Math.random() * 1.2, z + j(), 0.45 + Math.random() * 0.3, Math.random() < 0.5 ? 0x141018 : 0x2a2230);
    } else if (aura === 'gold' && Math.random() < dt * 5) {
      this.spawnParticles(x + j(), 0.6 + Math.random() * 1.3, z + j(), 1, Math.random() < 0.5 ? 0xffe066 : 0xffffff, 0.4, 0.35);
    } else if (aura === 'holo' && Math.random() < dt * 4) {
      this.spawnParticles(x + j() * 0.6, 2.0 + Math.random() * 0.3, z + j() * 0.6, 1, 0x46d8ff, 0.5, 0.3);
    }
  }

  // ───────────────────────── Dash afterimages ─────────────────────────

  /** Leaves a fading copy of the hero (pose, facing, squash) where he is right now. */
  private spawnGhost(color = 0x8fe6ff) {
    if (!this.heroModel) return;
    const POOL = 8;
    if (this.ghosts.length < POOL) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
      const copy = this.heroModel.clone(true);
      copy.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = mat;
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      const group = new THREE.Group();
      group.add(copy);
      group.visible = false;
      this.scene.add(group);
      this.ghosts.push({ group, mat, life: 0 });
    }
    const g = this.ghosts[this.ghostCursor % this.ghosts.length];
    this.ghostCursor++;
    g.group.position.copy(this.heroRoot.position);
    g.group.rotation.copy(this.heroRoot.rotation);
    g.group.scale.copy(this.heroRoot.scale);
    g.mat.color.setHex(color);
    g.life = 0.32;
    g.group.visible = true;
  }

  private updateGhosts(dt: number) {
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      const k = Math.max(0, g.life / 0.32);
      g.mat.opacity = 0.75 * k;
      g.group.position.y += dt * 0.4;
      if (g.life <= 0) g.group.visible = false;
    }
  }

  // ───────────────────────── Special ammo (passive items) ─────────────────────────

  /** A player bullet just struck `e`: incendiary / cryo / cookie rounds do their thing. */
  private onAmmoHit(e: EnemyEntity, damage: number) {
    if (e.state === 'ko') return;
    const boss = e.archetype === 'boss';
    if (this.upgrades.has('fireAmmo')) {
      e.burnT = Math.max(e.burnT ?? 0, 3);
    }
    if (this.upgrades.has('cookieAmmo') && !e.cookie) {
      e.cookie = true;
      this.spawnParticles(e.x, 1.4, e.z, 6, 0xc8904a, 3, 0.35);
    }
    if (this.upgrades.has('iceAmmo')) {
      // Frozen solid + a heavy hit: it shatters, spraying ice into everyone around
      if ((e.frozenT ?? 0) > 0 && damage >= 40) {
        e.frozenT = 0;
        e.chillStacks = 0;
        this.spawnParticles(e.x, 1.0, e.z, 22, 0xbff4ff, 9, 0.45);
        this.spawnParticles(e.x, 1.0, e.z, 10, 0xffffff, 6, 0.3);
        synthAudio.playParry(2);
        for (const o of this.enemies) {
          if (o === e || o.state === 'ko') continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) < 2.4 + o.radius) this.damageEnemy(o, 25, o.x - e.x, o.z - e.z);
        }
        return;
      }
      e.chillT = 2;
      e.chillStacks = (e.chillStacks ?? 0) + 1;
      if (e.chillStacks >= 3 && !boss && (e.frozenT ?? 0) <= 0) {
        e.chillStacks = 0;
        e.frozenT = 1.5;
        this.spawnParticles(e.x, 1.2, e.z, 12, 0x9fe8ff, 4, 0.4);
        synthAudio.playParry(1);
      }
    }
  }

  /** Per-frame status effects from special ammo: burning, chilled (slow), frozen solid. */
  private updateAmmoStatus(e: EnemyEntity, dt: number) {
    if (e.state === 'ko') return;
    // Burning: damage ticks, flames, spreads to anyone it touches
    if ((e.burnT ?? 0) > 0) {
      e.burnT! -= dt;
      e.burnTick = (e.burnTick ?? 0) - dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.3;
        this.damageEnemy(e, 4, 0, 0);
      }
      if (Math.random() < dt * 22) this.spawnParticles(e.x + (Math.random() - 0.5) * e.radius, 0.4 + Math.random() * 1.6, e.z + (Math.random() - 0.5) * e.radius, 1, Math.random() < 0.5 ? 0xff8a1a : 0xffd23a, 2.2, 0.35);
      if (Math.random() < dt * 3) {
        for (const o of this.enemies) {
          if (o === e || o.state === 'ko' || (o.burnT ?? 0) > 0) continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) < e.radius + o.radius + 0.4) o.burnT = 2;
        }
      }
    }
    // Chilled: slowed (speed restored when it thaws)
    if ((e.chillT ?? 0) > 0 || (e.frozenT ?? 0) > 0) {
      if (e.baseSpeed === undefined) e.baseSpeed = e.speed;
      e.chillT = Math.max(0, (e.chillT ?? 0) - dt);
      e.speed = e.baseSpeed * 0.55;
      if (Math.random() < dt * 6) this.spawnParticles(e.x, 0.5 + Math.random() * 1.4, e.z, 1, 0xbff4ff, 1, 0.4);
      if (e.chillT <= 0) e.chillStacks = 0;
    } else if (e.baseSpeed !== undefined) {
      e.speed = e.baseSpeed;
      e.baseSpeed = undefined;
    }
    // Frozen solid: can't move or attack, glows icy blue
    if ((e.frozenT ?? 0) > 0) {
      e.frozenT! -= dt;
      e.state = 'cooldown';
      e.stateTimer = Math.max(e.stateTimer, 0.1);
      e.hasToken = false;
      e.vx = 0;
      e.vz = 0;
      if (e.telegraphLine) e.telegraphLine.visible = false;
      if (e.hitFlashTimer <= 0) this.setGroupEmissiveFlash(e.mesh, true, 0x5ad8ff);
      if (e.frozenT! <= 0) this.setGroupEmissiveFlash(e.mesh, false);
    }
  }

  /** Homing rounds: player bullets bend toward the nearest enemy ahead of them. */
  private steerHoming(p: ProjectileEntity, dt: number) {
    const sp = Math.hypot(p.vx, p.vz);
    if (sp < 1) return;
    const fx = p.vx / sp;
    const fz = p.vz / sp;
    let target: EnemyEntity | null = null;
    let best = 9;
    for (const e of this.enemies) {
      if (e.state === 'ko' || p.piercedIds.has(e.id) || (e.emergeTimer && e.emergeTimer > 0)) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > best || (dx * fx + dz * fz) / Math.max(d, 0.01) < 0.25) continue;
      best = d;
      target = e;
    }
    if (!target) return;
    const want = Math.atan2(target.x - p.x, target.z - p.z);
    const cur = Math.atan2(p.vx, p.vz);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
    const a = cur + turn;
    p.vx = Math.sin(a) * sp;
    p.vz = Math.cos(a) * sp;
    p.group.rotation.set(0, a, 0);
  }

  /** Pinball rounds: after a hit the bullet bounces to the next enemy (up to 3×, +10% each). */
  private pinballBounce(p: ProjectileEntity, from: EnemyEntity): boolean {
    if (p.pinballs <= 0) return false;
    let next: EnemyEntity | null = null;
    let nd = 7.5;
    for (const e of this.enemies) {
      if (e === from || e.state === 'ko' || p.piercedIds.has(e.id) || (e.emergeTimer && e.emergeTimer > 0)) continue;
      const d = Math.hypot(e.x - from.x, e.z - from.z);
      if (d < nd) {
        nd = d;
        next = e;
      }
    }
    if (!next) return false;
    p.pinballs -= 1;
    p.piercedIds.add(from.id);
    p.damage = Math.round(p.damage * 1.1);
    const sp = Math.max(18, Math.hypot(p.vx, p.vz));
    const a = Math.atan2(next.x - p.x, next.z - p.z);
    p.vx = Math.sin(a) * sp;
    p.vz = Math.cos(a) * sp;
    p.life = Math.max(p.life, 0.9);
    p.group.rotation.set(0, a, 0);
    this.spawnParticles(p.x, p.y, p.z, 5, 0xffd23a, 5, 0.18);
    synthAudio.playCoin('medium');
    return true;
  }

  // ───────────────────────── New guns: dynamite, blowtorch, CD launcher, chain lightning ─────────────────────────

  /** Where the mouse points on the floor, capped to `maxD` from the player (forward if unknown). */
  private aimPoint(maxD: number): { x: number; z: number } {
    let tx = this.playerX + Math.sin(this.playerYaw) * maxD * 0.75;
    let tz = this.playerZ + Math.cos(this.playerYaw) * maxD * 0.75;
    if (this.hasMouseMoved) {
      const hit = this.screenToWorld(this.mouseClientX, this.mouseClientY);
      if (hit) {
        const dx = hit.x - this.playerX;
        const dz = hit.z - this.playerZ;
        const d = Math.hypot(dx, dz);
        const k = d > maxD ? maxD / d : 1;
        tx = this.playerX + dx * k;
        tz = this.playerZ + dz * k;
      }
    }
    const c = resolveCircleObstacleCollision(tx, tz, 0.4, [], ARENA_RADIUS - 1);
    return { x: c.x, z: c.z };
  }

  /** Dinamite: a bundle of sticks lobbed to the aim point; short fuse, big boom. */
  private throwDynamite(damage: number, radius: number) {
    const t = this.aimPoint(11);
    const mesh = new THREE.Group();
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xc8281e, emissive: 0xc8281e, emissiveIntensity: 0.35, roughness: 0.6 });
    for (const [dx, dy] of [[-0.09, 0], [0.09, 0], [0, 0.15]] as [number, number][]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.6, 8), stickMat);
      s.rotation.z = Math.PI / 2;
      s.position.set(0, dy, dx);
      mesh.add(s);
    }
    const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false }));
    fuse.position.set(0.32, 0.18, 0);
    fuse.name = 'fuse';
    mesh.add(fuse);
    mesh.position.set(this.playerX, 1.2, this.playerZ);
    this.scene.add(mesh);
    this.bombs.push({ mesh, sx: this.playerX, sz: this.playerZ, tx: t.x, tz: t.z, t: 0, radius, damage, fuse: 0.95 });
  }

  /** Maçarico: every tick, everything in a short cone takes fire damage; flames + smoke pour out. */
  private fireFlame(sx: number, sz: number, fx: number, fz: number, damage: number) {
    const RANGE = 6;
    const COS = Math.cos(0.42);
    for (const e of this.enemies) {
      if (e.state === 'ko' || (e.emergeTimer && e.emergeTimer > 0)) continue;
      const dx = e.x - sx;
      const dz = e.z - sz;
      const d = Math.hypot(dx, dz);
      if (d > RANGE + e.radius) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < COS) continue;
      this.damageEnemy(e, damage, fx, fz);
      if (Math.random() < 0.3) this.spawnParticles(e.x, 0.6 + Math.random() * 1.2, e.z, 1, 0xff8a1a, 2, 0.35);
    }
    // Crates and caches catch too
    for (let oi = this.obstacles.length - 1; oi >= 0; oi--) {
      const o = this.obstacles[oi];
      if (!o.destructible) continue;
      const dx = o.x - sx;
      const dz = o.z - sz;
      const d = Math.hypot(dx, dz);
      if (d < RANGE && (dx * fx + dz * fz) / Math.max(d, 0.01) > COS) {
        o.hp -= damage * 0.5;
        if (o.hp <= 0) {
          if (o.explosive) this.detonateCrate(oi);
          else this.destroySectorProp(oi);
        }
      }
    }
    // The flame itself: hot puffs racing out along the cone, then smoke
    for (let k = 0; k < 3; k++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const a = Math.atan2(fx, fz) + spread;
      const dist = 0.6 + Math.random() * (RANGE - 0.8);
      const px = sx + Math.sin(a) * dist;
      const pz = sz + Math.cos(a) * dist;
      const hot = dist < RANGE * 0.55;
      this.fx.puff(px, 1.0 + Math.random() * 0.3, pz, 0.35 + dist * 0.12, hot ? (Math.random() < 0.5 ? 0xffd23a : 0xff8a1a) : 0xff4a10, {
        x: Math.sin(a) * 6,
        z: Math.cos(a) * 6,
      });
    }
    if (Math.random() < 0.25) this.fx.puff(sx + fx * RANGE, 1.6, sz + fz * RANGE, 0.9, 0x2a2624, { x: fx * 2, z: fz * 2 });
    this.spawnParticles(sx + fx * 1.2, 1.1, sz + fz * 1.2, 2, Math.random() < 0.5 ? 0xffd23a : 0xff6a1a, 7, 0.25);
  }

  /** Corrente.exe: zap the enemy nearest the aim line, then it leaps to up to 4 more nearby. */
  private fireChainLightning(sx: number, sz: number, fx: number, fz: number, damage: number) {
    const live = this.enemies.filter((e) => e.state !== 'ko' && !(e.emergeTimer && e.emergeTimer > 0));
    let first: EnemyEntity | null = null;
    let best = Infinity;
    for (const e of live) {
      const dx = e.x - sx;
      const dz = e.z - sz;
      const d = Math.hypot(dx, dz);
      if (d > 14) continue;
      const cos = (dx * fx + dz * fz) / Math.max(d, 0.01);
      if (cos < Math.cos(0.6)) continue;
      const score = d * (2 - cos); // near and on the aim line
      if (score < best) {
        best = score;
        first = e;
      }
    }
    const pts: [number, number][] = [[sx, sz]];
    if (!first) {
      // Fizzles into the air
      pts.push([sx + fx * 5, sz + fz * 5]);
      this.drawBolt(pts);
      return;
    }
    const hit = new Set<number>();
    let cur: EnemyEntity | null = first;
    let dmg = damage;
    for (let hop = 0; hop < 5 && cur; hop++) {
      hit.add(cur.id);
      pts.push([cur.x, cur.z]);
      const dx = cur.x - pts[pts.length - 2][0];
      const dz = cur.z - pts[pts.length - 2][1];
      const dl = Math.hypot(dx, dz) || 1;
      this.damageEnemy(cur, Math.round(dmg), dx / dl, dz / dl);
      this.spawnParticles(cur.x, 1.0, cur.z, 6, 0x9ff4ff, 6, 0.2);
      dmg *= 0.85;
      // Next: the nearest enemy not yet struck, within reach
      let next: EnemyEntity | null = null;
      let nd = 6.5;
      for (const e of live) {
        if (hit.has(e.id) || e.state === 'ko') continue;
        const d = Math.hypot(e.x - cur.x, e.z - cur.z);
        if (d < nd) {
          nd = d;
          next = e;
        }
      }
      cur = next;
    }
    this.drawBolt(pts);
  }

  /** Jagged glowing bolt through a list of floor points (fades out over ~0.18 s). */
  private drawBolt(pts: [number, number][]) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const group = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      // Split each hop into jittered sub-segments
      const n = 5;
      let px = ax;
      let pz = az;
      let py = 1.1;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const jit = k === n ? 0 : 0.45;
        const qx = ax + (bx - ax) * t + (Math.random() - 0.5) * jit;
        const qz = az + (bz - az) * t + (Math.random() - 0.5) * jit;
        const qy = 1.1 + (k === n ? 0 : (Math.random() - 0.5) * 0.5);
        const len = Math.hypot(qx - px, qy - py, qz - pz);
        const geo = new THREE.BoxGeometry(0.09, 0.09, len);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(qx, qy, qz), new THREE.Vector3(px, py, pz), new THREE.Vector3(0, 1, 0));
        m.setPosition((px + qx) / 2, (py + qy) / 2, (pz + qz) / 2);
        geo.applyMatrix4(m);
        geos.push(geo.toNonIndexed());
        px = qx;
        py = qy;
        pz = qz;
      }
    }
    if (!geos.length) return;
    group.add(new THREE.Mesh(mergeGeometries(geos), mat));
    this.scene.add(group);
    this.bolts.push({ group, mat, life: 0.18 });
  }

  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.mat.opacity = Math.max(0, b.life / 0.18) * (0.7 + Math.random() * 0.3);
      if (b.life <= 0) {
        this.scene.remove(b.group);
        b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        b.mat.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  // ───────────────────────── The rewrite → Frutiger Aero world ─────────────────────────

  /** Leaves the aero world (new run / title): back to the industrial look. */
  private resetAero() {
    this.aero = false;
    this.ditherPass.setClean(0);
    synthAudio.stopAeroMusic(0.3);
    if (this.rewriteCine) this.rewriteCine.dispose();
    this.rewriteCine = null;
    this.endAeroIntro();
    if (this.aeroWorld) this.aeroWorld.group.visible = false;
  }

  /** Going down after Cem Faces' real death: black screen, someone rewrites the world. */
  private beginRewrite(branch: TreeBranch | null) {
    this.cutsceneMode = 'rewrite';
    this.rewriteBranch = branch;
    this.portalOpen = false;
    this.keys.clear();
    this.mouseDown = false;
    synthAudio.silenceMusic(1.2);
    synthAudio.stopHuskFire(0.6);
    this.rewriteCine = new RewriteCutscene(this.container);
    this.emitHud();
  }

  private updateRewrite() {
    if (!this.rewriteCine) return;
    if (!this.rewriteCine.update(this.realDt)) return;
    this.finishRewrite();
  }

  private finishRewrite() {
    if (this.rewriteCine) this.rewriteCine.dispose();
    this.rewriteCine = null;
    this.cutsceneMode = 'none';
    this.aero = true;
    this.ditherPass.setClean(1);
    synthAudio.playAeroMusic();
    this.portalOpen = true;
    this.advanceNorthPortal(this.rewriteBranch);
    this.trackAchievement('aero');
    this.beginAeroIntro();
  }

  /** Sky, light, floor and set dressing of the aero world (called from applyZoneVisuals). */
  private applyAeroVisuals() {
    if (!this.aeroWorld) {
      this.aeroWorld = buildAeroWorld();
      this.scene.add(this.aeroWorld.group);
    }
    this.aeroWorld.group.visible = true;
    this.treeMegaDecorGroup.visible = false;
    this.treeWireframeDecorGroup.visible = false;
    this.treeCyberOverlayMesh.visible = false;
    for (const pair of this.treePerimeterPairs) {
      pair.wire.visible = false;
      pair.mega.visible = false;
    }
    this.giantTreeAnchor.visible = false;
    this.setFloor(null, aeroGrassTexture());
    this.groundMat.bumpMap = null;
    this.groundMat.color.setHex(0xffffff);
    this.perimeterMat.color.setHex(0x7fe0ff);
    this.scene.background = aeroSkyTexture();
    this.scene.fog = new THREE.FogExp2(0xbfe6ff, 0.0075);
    this.keyLight.color.setHex(0xfff6e0);
    this.keyLight.intensity = 3.4;
    this.hemiLight.color.setHex(0xcfeeff);
    this.hemiLight.groundColor.setHex(0x5ab84a);
    this.hemiLight.intensity = 2.3;
    this.rimLight.color.setHex(0xffffff);
    this.rimLight.intensity = 1.0;
    this.currentRimColorHex = 0x9fdcff;
    this.setZoneLamps([]);
    this.ditherPass.setClean(1);
  }

  /**
   * First room of the new world: through the cowboy's eyes (he looks left, right, up at the
   * sky), cut to his face with a "?", the blobs warp in, "!" — and the fight starts.
   */
  private beginAeroIntro() {
    // Hold the opening spawns for the cutscene
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      this.waveQueue.unshift(this.enemies[i].archetype);
      this.removeEnemyAt(i);
    }
    this.cutsceneMode = 'aero_intro';
    this.aeroIntro = { t: 0, emote: null, bang: false, spawned: false };
    this.heroRoot.visible = false;
    this.setLetterbox(1);
    this.emitHud();
  }

  private endAeroIntro() {
    if (!this.aeroIntro) return;
    if (this.aeroIntro.emote) this.scene.remove(this.aeroIntro.emote);
    this.aeroIntro = null;
    this.heroRoot.visible = true;
  }

  private finishAeroIntro() {
    const ai = this.aeroIntro;
    if (ai && !ai.spawned) this.spawnAeroVanguard();
    this.endAeroIntro();
    this.cutsceneMode = 'none';
    this.endCinematicCamera();
    this.invulnTimer = Math.max(this.invulnTimer, 0.8);
    this.emitHud();
  }

  private spawnAeroVanguard() {
    if (this.aeroIntro) this.aeroIntro.spawned = true;
    for (let k = 0; k < 3 && this.waveQueue.length > 0; k++) {
      const arch = this.waveQueue.shift()!;
      // Behind him, in the background of the shot on his face
      const yaw = this.playerYaw + Math.PI + (k - 1) * 0.6;
      this.spawnEnemy(arch, { x: this.playerX + Math.sin(yaw) * 7, z: this.playerZ + Math.cos(yaw) * 7 });
    }
  }

  private updateAeroIntro(dt: number) {
    const ai = this.aeroIntro;
    if (!ai) {
      this.cutsceneMode = 'none';
      return;
    }
    ai.t += dt;
    const t = ai.t;
    const px = this.playerX;
    const pz = this.playerZ;
    const fwd = this.playerYaw; // facing north (−Z)
    if (t < 3.4) {
      // POV: eyes at head height, looking around the strange new field
      this.heroRoot.visible = false;
      const look =
        t < 0.6 ? 0 : t < 1.4 ? 0.95 * Math.sin(((t - 0.6) / 0.8) * (Math.PI / 2)) : t < 2.4 ? 0.95 - 1.9 * ((t - 1.4) / 1.0) : t < 2.8 ? -0.95 * (1 - (t - 2.4) / 0.4) : 0;
      const up = t > 2.7 ? Math.min(1, (t - 2.7) / 0.5) * 0.55 : 0;
      const yaw = fwd + look;
      const bob = Math.sin(t * 2.2) * 0.02;
      const eye = new THREE.Vector3(px, 1.75 + bob, pz);
      const target = new THREE.Vector3(px + Math.sin(yaw) * 10, 1.6 + up * 10, pz + Math.cos(yaw) * 10);
      this.camera.position.copy(eye);
      this.camera.lookAt(target);
      this.setLetterbox(t < 0.3 ? t / 0.3 : 1);
      return;
    }
    // Front shot of his face with the "?"
    this.heroRoot.visible = true;
    this.heroRoot.position.set(px, 0, pz);
    this.heroRoot.rotation.y = fwd;
    if (!ai.emote) {
      ai.emote = buildEmoteSprite('?');
      this.scene.add(ai.emote);
      synthAudio.playKeyClick();
    }
    const bounce = Math.abs(Math.sin(t * 5)) * 0.12;
    ai.emote.position.set(px, 3.0 + bounce, pz);
    if (t >= 4.8 && !ai.spawned) this.spawnAeroVanguard();
    if (t >= 5.9 && !ai.bang) {
      ai.bang = true;
      this.scene.remove(ai.emote);
      ai.emote = buildEmoteSprite('!');
      this.scene.add(ai.emote);
      ai.emote.position.set(px, 3.0, pz);
      synthAudio.playAlert();
      this.trauma = Math.min(1, this.trauma + 0.25);
    }
    if (ai.bang) {
      const pop = Math.min(1, (t - 5.9) / 0.12);
      ai.emote.scale.setScalar(1.1 * (0.6 + pop * 0.6));
      this.heroRoot.position.y = Math.max(0, Math.sin(Math.min(1, (t - 5.9) / 0.3) * Math.PI) * 0.4);
    }
    // Camera: close on his face, then pulls back to show the blobs arriving
    const pull = THREE.MathUtils.smoothstep(t, 4.6, 5.8);
    const dirX = Math.sin(fwd);
    const dirZ = Math.cos(fwd);
    // Close on his face, then rising back the same side so the blobs behind him come into view
    const close = new THREE.Vector3(px + dirX * 3.6, 1.9, pz + dirZ * 3.6);
    const wide = new THREE.Vector3(px + dirX * 9, 7.5, pz + dirZ * 9);
    const pos = close.lerp(wide, pull);
    const look = new THREE.Vector3(px, 2.25, pz).lerp(new THREE.Vector3(px - dirX * 3, 0.6, pz - dirZ * 3), pull);
    this.cineCamera(pos, look);
    if (t >= 7.0) this.finishAeroIntro();
  }

  // ───────────────────────── Special rooms: walls, pits, lava ─────────────────────────

  private clearRoomLayout() {
    if (this.hazardField) this.scene.remove(this.hazardField.group);
    this.hazardField = null;
    this.hazardDefs = [];
    for (const g of this.roomWallGroups) this.scene.remove(g);
    this.roomWallGroups = [];
    this.obstacles = this.obstacles.filter((o) => o.kind !== 'wall');
    this.flyersPending = 0;
    this.fallTimer = 0;
  }

  private setupRoomLayout(waveNum: number) {
    this.clearRoomLayout();
    const layout = this.zone === 'tree' && !this.aero ? makeRoomLayout(waveNum) : undefined;
    if (!layout) return;
    for (const w of layout.walls) {
      // Visual: one wall; collision: 1×1 segments, so bullets and bodies hit exactly what they see
      const g = buildWall(w);
      this.scene.add(g);
      this.roomWallGroups.push(g);
      const along = w.halfW >= w.halfD;
      const len = (along ? w.halfW : w.halfD) * 2;
      const n = Math.max(1, Math.round(len));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len * (i + 0.5)) / n;
        const hw = along ? len / n / 2 : w.halfW;
        const hd = along ? w.halfD : len / n / 2;
        this.obstacles.push({
          id: `wall_${w.x}_${w.z}_${i}`,
          kind: 'wall',
          x: w.x + (along ? t : 0),
          z: w.z + (along ? 0 : t),
          radius: Math.hypot(hw, hd),
          halfW: hw,
          halfD: hd,
          destructible: false,
          explosive: false,
          hp: Infinity,
          group: new THREE.Group(),
        });
      }
    }
    if (layout.hazards.length) {
      this.hazardField = buildHazardField(layout.hazards);
      this.scene.add(this.hazardField.group);
      this.hazardDefs.push(...layout.hazards);
    }
    // The floor gives way as you walk in: rumble, dust and debris along every chasm
    const chasms = layout.hazards.filter((h) => h.kind === 'pit');
    if (chasms.length) {
      synthAudio.playCeilingCrash();
      this.trauma = Math.min(1, this.trauma + 0.55);
      for (const c of chasms.slice(0, 10)) {
        const hw = c.hw ?? c.r;
        const hd = c.hd ?? c.r;
        for (let k = 0; k < 3; k++) {
          const px = c.x + (Math.random() * 2 - 1) * hw;
          const pz = c.z + (Math.random() * 2 - 1) * hd;
          this.fx.puff(px, 0.4, pz, 1.2, 0x5a524a, { x: 0, z: 0 });
          this.spawnParticles(px, 0.4, pz, 2, 0x6a5c50, 4, 0.5);
        }
      }
    }
    this.flyersPending = layout.flyers;
    this.safeX = this.playerX;
    this.safeZ = this.playerZ;
    this.waveBanner = `PROFUNDIDADE ${this.treeDepth} · ${layout.name}`;
  }

  /** Pits swallow you (you climb back out where you last stood, minus 1 integrity); lava burns. */
  private updatePlayerHazards(dt: number) {
    this.hazardField?.update(this.elapsedSec, dt);
    if (this.hazardDefs.length === 0 || this.inVmSpace) return;
    // Lava throws embers
    for (const h of this.hazardDefs) {
      if (h.kind === 'lava' && Math.random() < dt * h.r * 1.5) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.random() * h.r;
        this.spawnParticles(h.x + Math.cos(a) * rr, 0.2, h.z + Math.sin(a) * rr, 1, Math.random() < 0.5 ? 0xffb030 : 0xff4a10, 1.2, 0.7);
      }
    }
    if (this.fallTimer > 0) {
      this.fallTimer -= dt;
      const h = hazardAt(this.playerX, this.playerZ, this.hazardDefs, -0.5);
      if (h) {
        this.playerX += (h.x - this.playerX) * Math.min(1, dt * 3);
        this.playerZ += (h.z - this.playerZ) * Math.min(1, dt * 3);
      }
      if (this.fallTimer <= 0) {
        // Climb back out at the last safe spot, bruised
        this.playerX = this.safeX;
        this.playerZ = this.safeZ;
        this.invulnTimer = 0;
        this.dashTimer = 0;
        this.damagePlayer(1, 0, 0);
        this.spawnParticles(this.playerX, 0.8, this.playerZ, 12, 0x8a8278, 5, 0.3);
      }
      return;
    }
    if (this.dashTimer > 0) return; // dashing carries you over
    const h = hazardAt(this.playerX, this.playerZ, this.hazardDefs);
    if (!h) {
      if (!hazardAt(this.playerX, this.playerZ, this.hazardDefs, -0.9)) {
        this.safeX = this.playerX;
        this.safeZ = this.playerZ;
      }
      this.lavaTick = 0;
      return;
    }
    if (h.kind === 'pit') {
      this.fallTimer = 0.55;
      synthAudio.playDash();
      this.pickupBanner = 'CAIU NO BURACO';
      this.pickupBannerTimer = 1.2;
      this.trackAchievement('pit');
    } else {
      this.lavaTick -= dt;
      if (Math.random() < dt * 30) this.spawnParticles(this.playerX, 0.4, this.playerZ, 1, 0xff6a1a, 3, 0.35);
      if (this.lavaTick <= 0) {
        this.lavaTick = 0.6;
        this.damagePlayer(1, this.playerX - h.x, this.playerZ - h.z);
        this.spawnParticles(this.playerX, 1.0, this.playerZ, 14, 0xff8a2a, 6, 0.4);
      }
    }
  }

  // ───────────────────────── Room chests ─────────────────────────
  //  Clearing a room has a chance to warp in a chest holding one random item (Gungeon-style).
  //  Walk into it: the lid flips, the item rises out, spins and flies into you.

  private chestKey() {
    return `${this.zone}:${this.treeDepth}:${this.inVmSpace ? 1 : 0}`;
  }

  private rollRoomChest() {
    if (this.inVmSpace) return;
    if (this.chest && !this.chest.opened) return; // last one still waiting
    const chance = this.upgrades.has('clover') ? 0.45 : 0.3;
    if (Math.random() >= chance) return;
    const pool = VM_ITEMS.filter((i) => i.id !== 'patch' && !this.upgrades.has(i.id)).map((i) => i.id);
    if (pool.length === 0) return;
    const item = pool[Math.floor(Math.random() * pool.length)];
    // A free spot, not on top of the player
    let x = 0;
    let z = 0;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 9;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      const blocked = this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.radius + 1.6) || !!hazardAt(x, z, this.hazardDefs, -1.4);
      if (!blocked && Math.hypot(this.playerX - x, this.playerZ - z) > 3.5) break;
    }
    this.removeChest();
    this.chest = { group: this.buildChest(), x, z, key: this.chestKey(), opened: false, t: 0, item, itemMesh: null, granted: false };
    this.chest.group.position.set(x, 0, z);
    this.chest.group.rotation.y = Math.atan2(this.playerX - x, this.playerZ - z);
    this.scene.add(this.chest.group);
    this.teleportFx.spawn(x, z, 1.4, 0.7, 3);
    synthAudio.playTeleportIn();
    this.waveBanner = 'UM BAÚ APARECEU';
    this.waveBannerTimer = 2.2;
  }

  /** Iron-banded wooden chest with a brass lock; the lid is a separate pivot. */
  private buildChest(): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e3e22, emissive: 0x6e3e22, emissiveIntensity: 0.35, roughness: 0.9, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x55575e, emissive: 0x55575e, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.45, flatShading: true });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8a030, emissive: 0xd8a030, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
    const W = 1.3;
    const D = 0.85;
    const H = 0.7;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    add(g, new THREE.BoxGeometry(W, H, D), wood, 0, H / 2, 0);
    add(g, new THREE.BoxGeometry(W * 0.92, 0.05, D * 0.9), glow, 0, H - 0.02, 0); // treasure glow inside
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) add(g, new THREE.BoxGeometry(0.1, H + 0.02, D + 0.04), iron, x, H / 2, 0);
    add(g, new THREE.BoxGeometry(W + 0.04, 0.08, D + 0.04), iron, 0, 0.06, 0);
    const lid = new THREE.Group();
    lid.name = 'lid';
    lid.position.set(0, H, -D / 2); // hinge on the back edge
    g.add(lid);
    const lidBody = add(lid, new THREE.CylinderGeometry(D / 2, D / 2, W, 10, 1, false, 0, Math.PI), wood, 0, 0, D / 2);
    lidBody.rotation.z = Math.PI / 2;
    lidBody.rotation.y = Math.PI / 2;
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) {
      const band = add(lid, new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, 0.1, 10, 1, false, 0, Math.PI), iron, x, 0, D / 2);
      band.rotation.z = Math.PI / 2;
      band.rotation.y = Math.PI / 2;
    }
    add(g, new THREE.BoxGeometry(0.2, 0.24, 0.06), brass, 0, H - 0.08, D / 2 + 0.03); // lock
    add(g, new THREE.BoxGeometry(0.06, 0.08, 0.02), iron, 0, H - 0.1, D / 2 + 0.07); // keyhole
    return g;
  }

  private removeChest() {
    if (!this.chest) return;
    this.scene.remove(this.chest.group);
    if (this.chest.itemMesh) this.scene.remove(this.chest.itemMesh);
    this.chest = null;
  }

  private updateChest(dt: number) {
    const c = this.chest;
    if (!c) return;
    if (c.key !== this.chestKey()) {
      this.removeChest();
      return;
    }
    const lid = c.group.getObjectByName('lid');
    if (!c.opened) {
      // Idle: a little hop and a glint so it reads as loot
      c.group.position.y = Math.abs(Math.sin(this.elapsedSec * 3)) * 0.06;
      if (Math.random() < dt * 4) this.spawnParticles(c.x + (Math.random() - 0.5), 0.9, c.z + (Math.random() - 0.5), 1, 0xffd27a, 1.2, 0.4);
      if (Math.hypot(this.playerX - c.x, this.playerZ - c.z) < 1.7) {
        c.opened = true;
        c.t = 0;
        c.group.position.y = 0;
        synthAudio.playCacheLoot();
        this.trackAchievement('chest');
        this.spawnParticles(c.x, 1.0, c.z, 24, 0xffd27a, 7, 0.45);
        const mesh = new THREE.Mesh(itemVoxelGeometry(c.item), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
        mesh.position.set(c.x, 0.8, c.z);
        mesh.rotation.x = -0.7;
        this.scene.add(mesh);
        c.itemMesh = mesh;
      }
      return;
    }
    c.t += dt;
    if (lid) lid.rotation.x = -Math.min(1, c.t / 0.3) * 1.9;
    const m = c.itemMesh;
    if (m) {
      if (c.t < 1.0) {
        // Rises out of the chest, spinning
        const u = Math.min(1, c.t / 0.6);
        m.position.set(c.x, 0.8 + u * 1.8, c.z);
        m.rotation.y += dt * 6;
        m.scale.setScalar(0.6 + u * 0.9);
      } else {
        // Flies into the player
        const u = Math.min(1, (c.t - 1.0) / 0.3);
        m.position.lerp(new THREE.Vector3(this.playerX, 1.4, this.playerZ), u);
        m.scale.setScalar(1.5 * (1 - u * 0.8));
        if (u >= 1 && !c.granted) {
          c.granted = true;
          this.scene.remove(m);
          c.itemMesh = null;
          this.installItem(c.item);
          const def = VM_ITEMS.find((i) => i.id === c.item);
          this.pickupBanner = `BAÚ: ${def?.name ?? c.item}`;
          this.pickupBannerTimer = 2.6;
          this.spawnParticles(this.playerX, 1.3, this.playerZ, 16, 0xffd27a, 6, 0.35);
          synthAudio.playWeaponPickup('plasma', 'equip');
          this.emitHud();
        }
      }
    }
  }

  // ───────────────────────── Hexer: the black-and-red mage ─────────────────────────
  //  Shows up from the floor after the second Cem Faces fight. Hides like the skull-ship but
  //  curses ONE ally at a time: red-black aura and flames, double damage, red-black shots.
  //  A crackling line always links it to its victim, so you can follow it back to the mage.
  //  When the victim dies it picks another after ~2 s.

  private spawnHexer() {
    this.spawnEnemy('bombardier', { hexer: true });
    const h = this.enemies[this.enemies.length - 1];
    if (!h?.hexer) return;
    h.maxHp = Math.round(h.maxHp * 1.4);
    h.hp = h.maxHp;
    h.hexRetarget = 1.2;
    // Black robes, blood-red trim
    h.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as THREE.MeshStandardMaterial;
        if (!sm.color) continue;
        const lum = sm.color.r * 0.3 + sm.color.g * 0.59 + sm.color.b * 0.11;
        const bright = lum > 0.35 || (sm.emissiveIntensity ?? 0) > 0.5;
        sm.color.setHex(bright ? 0xc0101c : 0x0c0a0e);
        if (sm.emissive) {
          sm.emissive.setHex(bright ? 0xff1020 : 0x1a0004);
          sm.emissiveIntensity = bright ? 1.2 : 0.4;
          sm.userData.baseEmissive = sm.emissive.getHex();
          sm.userData.baseEmissiveIntensity = sm.emissiveIntensity;
        }
      }
    });
    this.waveBanner = 'UM BRUXO NEGRO AMALDIÇOA OS INIMIGOS — SIGA A LINHA';
    this.waveBannerTimer = 3.2;
  }

  private updateHexer(e: EnemyEntity, dt: number, dirX: number, dirZ: number) {
    // Hide far from the player (reuses the skull-ship's hiding spot logic)
    e.hideTimer = (e.hideTimer ?? 0) + dt;
    const threatened = e.hideX === undefined || Math.hypot(this.playerX - e.hideX, this.playerZ - (e.hideZ ?? 0)) < 9;
    if (threatened) {
      const playerAng = Math.hypot(this.playerX, this.playerZ) > 1 ? Math.atan2(this.playerZ, this.playerX) : Math.random() * Math.PI * 2;
      const hideAng = playerAng + Math.PI + (Math.random() - 0.5) * 1.0;
      e.hideX = Math.cos(hideAng) * (ARENA_RADIUS - 4);
      e.hideZ = Math.sin(hideAng) * (ARENA_RADIUS - 4);
      e.hideTimer = 0;
    }
    const hx = (e.hideX ?? e.x) - e.x;
    const hz = (e.hideZ ?? e.z) - e.z;
    const hd = Math.hypot(hx, hz) || 1;
    if (hd > 1.4 && e.hideTimer < 5) {
      e.vx = (hx / hd) * e.speed * 1.35;
      e.vz = (hz / hd) * e.speed * 1.35;
      e.yaw = Math.atan2(hx, hz);
    } else {
      e.vx *= 0.8;
      e.vz *= 0.8;
      e.yaw = Math.atan2(dirX, dirZ);
    }
    e.state = 'move';

    // Keep exactly one victim
    let target = e.hexTargetId !== undefined ? this.enemies.find((o) => o.id === e.hexTargetId) : undefined;
    if (target && target.state === 'ko') {
      target = undefined;
      e.hexTargetId = undefined;
      e.hexRetarget = 2.0;
    }
    if (!target) {
      e.hexRetarget = (e.hexRetarget ?? 0.8) - dt;
      if (e.hexLink) e.hexLink.visible = false;
      if (e.hexRetarget <= 0) {
        const pool = this.enemies.filter((o) => o !== e && o.state !== 'ko' && !o.hexer && o.archetype !== 'boss' && !o.hexed && !(o.emergeTimer && o.emergeTimer > 0));
        if (pool.length > 0) {
          target = pool[Math.floor(Math.random() * pool.length)];
          this.applyHex(target);
          e.hexTargetId = target.id;
        } else {
          e.hexRetarget = 0.6;
        }
      }
    }
    if (target) this.drawHexLink(e, target);
  }

  private applyHex(t: EnemyEntity) {
    t.hexed = true;
    t.mesh.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as THREE.MeshStandardMaterial;
        if (!sm.emissive) continue;
        sm.emissive.setHex(0xa00010);
        sm.emissiveIntensity = 0.7;
        sm.userData.baseEmissive = 0xa00010;
        sm.userData.baseEmissiveIntensity = 0.7;
        if (sm.color) sm.color.multiplyScalar(0.45); // charred dark
      }
    });
    this.spawnParticles(t.x, 1.4, t.z, 22, 0xff1020, 8, 0.45);
    this.spawnParticles(t.x, 1.4, t.z, 12, 0x100004, 6, 0.5);
    synthAudio.playShortCircuit(0.6);
  }

  /** The jagged red-black shock line between the hexer and its victim, re-zigzagged each frame. */
  private drawHexLink(e: EnemyEntity, t: EnemyEntity) {
    if (!e.hexLink) {
      const SEG = 14;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 2 * 3 * 3), 3));
      const mat = new THREE.MeshBasicMaterial({ color: 0xff1020, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      e.hexLink = new THREE.Mesh(geo, mat);
      e.hexLink.frustumCulled = false;
      this.scene.add(e.hexLink);
    }
    const link = e.hexLink;
    link.visible = true;
    const pos = link.geometry.getAttribute('position') as THREE.BufferAttribute;
    const SEG = pos.count / 6;
    const ax = e.x;
    const az = e.z;
    const bx = t.x;
    const bz = t.z;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const W = 0.09 + Math.random() * 0.06;
    let px = ax;
    let py = 1.8;
    let pz = az;
    for (let s = 0; s < SEG; s++) {
      const u = (s + 1) / SEG;
      const jag = s === SEG - 1 ? 0 : (Math.random() - 0.5) * 0.9;
      const qx = ax + (bx - ax) * u + nx * jag;
      const qy = 1.8 + (1.3 - 1.8) * u + Math.sin(u * Math.PI) * 0.6;
      const qz = az + (bz - az) * u + nz * jag;
      // A flat ribbon quad (two triangles) from p → q, facing up
      const o = s * 6;
      pos.setXYZ(o, px - nx * W, py, pz - nz * W);
      pos.setXYZ(o + 1, px + nx * W, py, pz + nz * W);
      pos.setXYZ(o + 2, qx + nx * W, qy, qz + nz * W);
      pos.setXYZ(o + 3, px - nx * W, py, pz - nz * W);
      pos.setXYZ(o + 4, qx + nx * W, qy, qz + nz * W);
      pos.setXYZ(o + 5, qx - nx * W, qy, qz - nz * W);
      px = qx;
      py = qy;
      pz = qz;
    }
    pos.needsUpdate = true;
    (link.material as THREE.MeshBasicMaterial).color.setHex(Math.random() < 0.3 ? 0x1a0004 : Math.random() < 0.5 ? 0xff1020 : 0xff5a5a);
    if (Math.random() < 0.25) this.spawnParticles(ax + (bx - ax) * Math.random(), 1.6, az + (bz - az) * Math.random(), 1, 0xff1020, 1.5, 0.2);
  }

  // ───────────────────────── VM: talk & shop ─────────────────────────

  /** Opens VM's dialogue (only while standing at his open door). */
  public openVm() {
    if (this.phase !== 'playing' || !this.vmPrompt || !this.inVmSpace || !this.vmSpace) return;
    // Face-to-face shot: low camera in front of VM (held while the dialogue is open)
    const space = this.vmSpace;
    this.camera.position.copy(space.vmPos).addScaledVector(space.vmFacing, 4.6).setY(2.3);
    this.camera.lookAt(space.vmFocus.x, space.vmFocus.y + 0.2, space.vmFocus.z);
    this.heroRoot.visible = false; // the player stands where the camera is
    space.setWaresVisible(false);
    this.ditherPass.render(this.renderer, this.scene, this.camera, this.elapsedSec, 0);
    // How VM greets you: the boss line once after Cem Faces goes down; the sales pitch only
    // the first time you meet him this run; just "hey" after that
    const praise = this.boss1Down && !this.vmPraised;
    this.vmGreeting = this.vmTalks === 0 ? (praise ? 'firstBoss' : 'first') : praise ? 'boss' : 'again';
    if (praise) this.vmPraised = true;
    this.vmTalks += 1;
    this.phase = 'shop';
    document.body.dataset.state = 'shop';
    this.keys.clear();
    this.mouseDown = false;
    this.touchFiring = false;
    this.callbacks.onPhaseChange('shop');
  }

  public closeVm() {
    if (this.phase !== 'shop') return;
    // Ease the gameplay camera back out from the doorway shot
    this.camPosX = this.camera.position.x;
    this.camPosY = this.camera.position.y;
    this.camPosZ = this.camera.position.z;
    this.heroRoot.visible = true;
    this.vmSpace?.setWaresVisible(true);
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keys.clear();
    this.mouseDown = false;
    this.callbacks.onPhaseChange('playing');
    this.emitHud();
  }

  public getVmShop(): VmShopState {
    return {
      credits: this.credits,
      greeting: this.vmGreeting,
      items: this.vmOffer
        .map((id) => VM_ITEMS.find((i) => i.id === id)!)
        .filter(Boolean)
        .map((i) => ({ ...i, soldOut: i.once && this.upgrades.has(i.id) })),
    };
  }

  /** Buys one of VM's wares. Returns ok + a short status line for the shop UI. */
  /** Gives the player an item for the rest of the run (shop purchase or chest). */
  private installItem(id: VmItemId) {
    const item = VM_ITEMS.find((i) => i.id === id);
    if (!item) return;
    if (item.kind === 'active') {
      // Actives share one slot (F): a new one replaces the old
      if (this.activeItem) this.upgrades.delete(this.activeItem);
      this.activeItem = id;
      this.activeMax = item.charge ?? 400;
      this.activeCharge = this.activeMax; // comes charged
      this.upgrades.add(id);
      return;
    }
    // Passive: installed for the rest of the run
    this.upgrades.add(id);
    if (id === 'cell') {
      this.playerMaxHp += 1;
      this.playerHp += 1;
    } else if (id === 'firewall') {
      this.firewallReady = true;
    }
  }

  public buyVmItem(id: VmItemId): { ok: boolean; message: string } {
    const item = VM_ITEMS.find((i) => i.id === id);
    if (!item || !this.vmOffer.includes(id)) return { ok: false, message: 'ITEM INVÁLIDO' };
    if (item.once && this.upgrades.has(id)) return { ok: false, message: 'JÁ INSTALADO' };
    if (this.credits < item.price) return { ok: false, message: 'CRÉDITOS INSUFICIENTES' };

    if (id === 'patch') {
      if (this.playerHp >= this.playerMaxHp) return { ok: false, message: 'INTEGRIDADE JÁ ESTÁ CHEIA' };
      this.playerHp += 1;
    } else {
      this.installItem(id);
      this.vmSpace?.markSold(id);
    }
    this.credits -= item.price;
    synthAudio.playCacheLoot();
    this.emitHud();
    return { ok: true, message: id === 'patch' ? 'APLICADO' : 'INSTALADO' };
  }

  /** Credits income, boosted by the Credit Magnet. */
  /** Kill loot: the credits spill out as coins (or straight into your pocket over a pit). */
  private dropKillCredits(e: EnemyEntity, amount: number) {
    // Cookie rounds: tracked enemies pay double
    if (e.cookie) {
      amount *= 2;
      this.spawnParticles(e.x, 1.0, e.z, 10, 0xc8904a, 5, 0.4);
    }
    if (hazardAt(e.x, e.z, this.hazardDefs, 0) || e.flying) {
      this.addCredits(amount);
      return;
    }
    this.coins.drop(e.x, e.z, amount);
    // Jackpot: a bug crawls out of the code
    const bugChance = (e.archetype === 'boss' ? 1 : 0.035) * (this.upgrades.has('clover') ? 1.6 : 1);
    if (Math.random() < bugChance) {
      this.coins.dropBug(e.x, e.z, 25 + Math.floor(Math.random() * 16));
      synthAudio.playCrtGlitch();
    }
  }

  private onCoinCollected = (tier: CoinTier, value: number, x: number, z: number) => {
    this.addCredits(value);
    this.coinHudDirty = true;
    this.runStats.creditsCollected += value;
    if (tier === 'bug') {
      this.runStats.bugsCaught += 1;
      if (this.runStats.creditsCollected >= 400) this.trackAchievement('rich');
      this.spawnParticles(x, 0.9, z, 16, 0x39ff6a, 7, 0.35);
      this.spawnParticles(x, 0.9, z, 10, 0xff2bd6, 6, 0.3);
      this.pickupBanner = `BUG CAPTURADO · +${value} CRÉDITOS`;
      this.pickupBannerTimer = 2.2;
      synthAudio.playCrtGlitch();
      synthAudio.playCoin('large');
      this.trackAchievement('bug');
    } else {
      synthAudio.playCoin(tier);
      if (this.runStats.creditsCollected >= 400) this.trackAchievement('rich');
    }
  };

  /** Unlocks an achievement once (saved right away); grants its skin and shows the toast. */
  private trackAchievement(id: AchievementId) {
    if (this.progress.achievements.includes(id)) return;
    const def = ACHIEVEMENT_MAP[id];
    this.progress.achievements = [...this.progress.achievements, id];
    if (def.skin) this.runUnlockedSkins.add(def.skin);
    synthAudio.playAchievement();
    savePlayerProgress({ ...this.progress, bestScore: Math.max(this.progress.bestScore, this.score) });
    this.callbacks.onAchievement?.(def);
  }

  private addCredits(n: number) {
    this.credits += Math.round(n * (this.upgrades.has('magnet') ? 1.5 : 1) * (this.upgrades.has('clover') ? 1.25 : 1));
  }

  /** Ends the intro (normally or via skip): parks the Mustang for good and hands control over. */
  private finishIntro() {
    const intro = this.intro;
    this.intro = null;
    if (this.cutsceneMode === 'intro') this.cutsceneMode = 'none';
    if (!intro) return;
    intro.finish();

    // The car stays parked on the highway (with collision) from now on
    if (this.parkedCar && this.parkedCar !== intro.car) this.parkedCar.parent?.remove(this.parkedCar);
    this.roadDecorGroup.attach(intro.car);
    this.parkedCar = intro.car;

    this.playerX = INTRO_PLAYER_START.x;
    this.playerZ = INTRO_PLAYER_START.z;
    this.playerYaw = INTRO_PLAYER_START.yaw;
    this.heroRoot.visible = true;
    this.heroRoot.position.set(this.playerX, 0, this.playerZ);
    this.heroRoot.rotation.y = this.playerYaw;
    this.heroShadow.position.set(this.playerX, 0.02, this.playerZ);
    this.heroShadow.visible = true;
    for (const obs of this.obstacles) obs.group.visible = true;
    this.invulnTimer = Math.max(this.invulnTimer, 1.0);

    // Blend from the cutscene camera into the gameplay follow camera
    this.camPosX = this.camera.position.x;
    this.camPosY = this.camera.position.y;
    this.camPosZ = this.camera.position.z;

    this.cineFadeEl.style.opacity = '0';
    this.cineBarTop.style.height = '0';
    this.cineBarBottom.style.height = '0';
    synthAudio.startMusic();
    if (this.phase === 'playing') this.startWave(this.wave);
    this.emitHud();
  }

  /** The loaded hero model (for the skins menu turntable). */
  public getHeroTemplate(): THREE.Group | null {
    return this.assets?.hero ?? null;
  }

  /** Everything the player is carrying, for the backpack menu (M). */
  public getBackpack(): BackpackState {
    return {
      weapons: this.ownedWeapons.map((id) => ({ id, ammo: this.ammo[id], maxAmmo: WEAPONS[id].maxAmmo, active: id === this.activeWeapon })),
      passives: [...this.upgrades].filter((id) => VM_ITEMS.find((v) => v.id === id)?.kind !== 'active'),
      activeItem: this.activeItem,
      activeCharge: this.activeItem ? Math.min(1, this.activeCharge / this.activeMax) : 0,
      hp: this.playerHp,
      maxHp: this.playerMaxHp,
      credits: this.credits,
      seen: [...this.progress.seenEnemies],
    };
  }

  /** A model of an almanac creature for the turntable preview ('blob_*' = its aero version). */
  public getCreatureTemplate(id: string): THREE.Group | null {
    if (!this.assets) return null;
    if (id === 'blob_flyer') return buildBlobEnemy('tesla', true);
    if (id.startsWith('blob_')) return buildBlobEnemy(id.slice(5) as EnemyArchetype);
    if (id === 'flyer') return buildFlyerModel();
    if (id === 'boss2' || id === 'boss') return this.assets.enemies.boss;
    if (id === 'hexer') {
      const g = cloneModelWithUniqueMaterials(this.assets.enemies.bombardier);
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const sm = m as THREE.MeshStandardMaterial;
          if (!sm.color) continue;
          const bright = sm.color.r * 0.3 + sm.color.g * 0.59 + sm.color.b * 0.11 > 0.35;
          sm.color.setHex(bright ? 0xc0101c : 0x0c0a0e);
          if (sm.emissive) sm.emissive.setHex(bright ? 0xff1020 : 0x1a0004);
        }
      });
      return g;
    }
    return this.assets.enemies[id as EnemyArchetype] ?? null;
  }

  /** Remembers a creature for the almanac (saved once, the first time it's met). */
  private markSeen(id: string) {
    if (this.progress.seenEnemies.includes(id)) return;
    this.progress.seenEnemies = [...this.progress.seenEnemies, id];
    savePlayerProgress({ ...this.progress, bestScore: Math.max(this.progress.bestScore, this.score) });
  }

  public setPaused(paused: boolean) {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.phase = paused ? 'paused' : 'playing';
    document.body.dataset.state = this.phase;
    synthAudio.pauseMusic(paused);
    this.keys.clear();
    this.mouseDown = false;
    this.touchFiring = false;
    this.callbacks.onPhaseChange(this.phase);
  }

  public returnToTitle() {
    if (this.intro) this.finishIntro();
    this.resetAero();
    this.bossCine = null;
    this.removeVmRoom();
    synthAudio.endBossMusic(0.3);
    synthAudio.resumeMainMusic(0.4);
    this.setLetterbox(0);
    this.setSubtitle(null);
    while (this.enemies.length > 0) this.removeEnemyAt(0);
    for (const p of this.projectiles) {
      p.active = false;
      p.group.visible = false;
    }
    while (this.mortars.length > 0) {
      const m = this.mortars.pop()!;
      this.scene.remove(m.ringMesh);
      this.scene.remove(m.shellMesh);
    }
    while (this.pickups.length > 0) this.removePickupAt(0);
    this.stormActive = false;
    this.rainInstanced.visible = false;
    this.cutsceneMode = 'none';
    this.cutsceneText = null;
    this.cancelSlowMo();
    this.fx.clear();
    this.coins.clear();
    this.phase = 'title';
    document.body.dataset.state = 'title';
    this.applyZoneVisuals('road');
    this.damageBlinkTimer = 0;
    if (this.heroModel) this.heroModel.visible = true;
    synthAudio.pauseMusic(true);
    this.keys.clear();
    this.mouseDown = false;
    this.mouseJustPressed = false;
    this.callbacks.onPhaseChange('title');
  }

  public equipSkin(skinId: SkinId) {
    this.equippedSkin = skinId;
    this.progress.equippedSkin = skinId;
    if (this.heroModel) {
      applyHeroSkin(this.heroModel, SKIN_MAP[skinId]);
      applyHeroOutfit(this.heroModel, skinId);
      // Afterimages are copies of the old outfit: rebuild them lazily
      for (const g of this.ghosts) this.scene.remove(g.group);
      this.ghosts = [];
    }
  }

  public switchWeapon(weaponId: WeaponId) {
    if (!this.ownedWeapons.includes(weaponId)) return;
    if (weaponId !== 'pistol' && this.ammo[weaponId] <= 0) return;
    if (weaponId !== this.activeWeapon) {
      this.weaponHeatState = { heat: 0, overheated: false, overheatTimer: 0, reloadFlashTimer: 0.14 };
    }
    this.activeWeapon = weaponId;
    for (const wId of WEAPON_ORDER) {
      const m = this.weaponModels[wId];
      if (m) m.visible = wId === weaponId;
    }
    this.emitHud();
  }

  /** Bloodied scarf blink: a red "puf" cloud where you vanish and where you reappear. */
  private bloodPuff(x: number, z: number) {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.3;
      this.fx.puff(x + Math.cos(a) * r, 0.35 + Math.random() * 1.1, z + Math.sin(a) * r, 0.55 + Math.random() * 0.35, k % 3 === 0 ? 0x3a0006 : 0xb0101c, {
        x: Math.cos(a) * 2.2,
        z: Math.sin(a) * 2.2,
      });
    }
    this.spawnParticles(x, 0.9, z, 10, 0xff2030, 5.5, 0.35);
    this.fx.stampMark(x, z, 0.9, 1, Math.random() * Math.PI, 0x5a0008);
  }

  public triggerDash() {
    if (this.phase !== 'playing' || this.dashCooldownTimer > 0 || this.dashTimer > 0 || this.fallTimer > 0) return;
    let dx = this.touchMoveX;
    let dz = this.touchMoveZ;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;

    const len = Math.hypot(dx, dz);
    if (len > 0.1) {
      this.dashDirX = dx / len;
      this.dashDirZ = dz / len;
    } else {
      this.dashDirX = Math.sin(this.playerYaw);
      this.dashDirZ = Math.cos(this.playerYaw);
    }
    if (this.upgrades.has('gunboots')) this.fireGunboots(this.dashDirX, this.dashDirZ);
    if (this.upgrades.has('scarf')) {
      // Bloodied scarf: no slide — you blink. Landing on bullets erases them.
      const fromX = this.playerX;
      const fromZ = this.playerZ;
      this.spawnGhost(0xff3040);
      this.bloodPuff(fromX, fromZ);
      const BLINK = 5.4;
      let tx = fromX + this.dashDirX * BLINK;
      let tz = fromZ + this.dashDirZ * BLINK;
      const res =
        this.inVmSpace && this.vmSpace
          ? this.vmSpace.clamp(tx, tz, PLAYER_RADIUS)
          : resolveCircleObstacleCollision(tx, tz, PLAYER_RADIUS, this.obstacles, ARENA_RADIUS);
      tx = res.x;
      tz = res.z;
      for (let k = 0; k <= 6; k++) {
        const u = k / 6;
        this.spawnParticles(fromX + (tx - fromX) * u, 0.6 + Math.random(), fromZ + (tz - fromZ) * u, 2, k % 2 ? 0xff1020 : 0x6a0008, 2.5, 0.35);
      }
      this.playerX = tx;
      this.playerZ = tz;
      for (const p of this.projectiles) {
        if (p.active && !p.fromPlayer && Math.hypot(p.x - tx, p.z - tz) < 1.8) {
          p.active = false;
          p.group.visible = false;
          this.spawnParticles(p.x, p.y, p.z, 3, 0xff1020, 4, 0.2);
        }
      }
      this.spawnParticles(tx, 1.0, tz, 14, 0xff1020, 6, 0.3);
      this.bloodPuff(tx, tz);
      this.dashTimer = 0;
      this.dashCooldownTimer = this.dashCooldownMax();
      this.invulnTimer = Math.max(this.invulnTimer, 0.3);
      synthAudio.playTeleportIn();
      return;
    }
    this.dashTimer = DASH_DURATION;
    this.dashCooldownTimer = this.dashCooldownMax();
    this.dashHits.clear();
    this.invulnTimer = Math.max(this.invulnTimer, DASH_DURATION + 0.05);
    synthAudio.playDash();
  }

  /** Starts a katana / sledgehammer swing; the hit itself lands after the weapon's wind-up. */
  private startMeleeSwing(weaponId: WeaponId) {
    const spec = WEAPONS[weaponId].melee;
    if (!spec) return;
    this.meleeStyle = spec.style;
    this.meleeAnimDuration = spec.animDuration;
    this.meleeTimer = spec.animDuration;
    this.pendingMelee = { weapon: weaponId, timer: spec.windup };
    synthAudio.playShoot(weaponId);
  }

  /**
   * Resolves a melee hit in front of the player:
   *  - slash (katana): wide arc, big damage, light shove, short stagger, heavy blood
   *  - slam (sledgehammer): narrower arc + radial shockwave at the impact point, huge shove,
   *    long stagger, dust and a crack in the ground
   * Both smash destructible props and chip the clearing barricade.
   */
  private resolveMeleeHit(weaponId: WeaponId) {
    const weapon = WEAPONS[weaponId];
    const spec = weapon.melee;
    if (!spec || this.phase !== 'playing') return;
    const fx = Math.sin(this.playerYaw);
    const fz = Math.cos(this.playerYaw);
    const slam = spec.style === 'slam';
    const arcCos = Math.cos(((spec.arcDeg / 2) * Math.PI) / 180);

    // Short lunge into the swing (obstacle collision resolves next frame)
    const lunge = slam ? 0.35 : 0.6;
    this.playerX += fx * lunge;
    this.playerZ += fz * lunge;
    this.fx.meleeSwing(this.playerX, this.playerZ, this.playerYaw, spec.style, spec.range / 2.9, weaponId === 'hammer');

    const impactX = this.playerX + fx * spec.range * 0.65;
    const impactZ = this.playerZ + fz * spec.range * 0.65;
    const inArc = (tx: number, tz: number, reach: number) => {
      const dx = tx - this.playerX;
      const dz = tz - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > reach) return false;
      if (dist < 1.0) return true; // point blank always connects
      return (dx * fx + dz * fz) / dist >= arcCos;
    };
    const inShock = (tx: number, tz: number, r: number) =>
      spec.shockRadius > 0 && Math.hypot(tx - impactX, tz - impactZ) <= spec.shockRadius + r;

    let connected = false;
    for (const e of this.enemies) {
      if (e.state === 'ko' || (e.emergeTimer && e.emergeTimer > 0)) continue;
      if (!inArc(e.x, e.z, spec.range + e.radius) && !inShock(e.x, e.z, e.radius)) continue;
      connected = true;
      const boss = e.archetype === 'boss';
      // Shove away from the impact for slams, along the swing for slashes
      let px = fx;
      let pz = fz;
      if (slam) {
        const ax = e.x - this.playerX;
        const az = e.z - this.playerZ;
        const al = Math.hypot(ax, az) || 1;
        px = ax / al;
        pz = az / al;
      }
      this.damageEnemy(e, boss ? weapon.damage * 0.5 : weapon.damage, px, pz);
      // Blades also throw blood sideways across the cut
      if (!slam) {
        const side = Math.random() < 0.5 ? 1 : -1;
        this.fx.splatter(e.x, e.z, -fz * side, fx * side, 1.1);
      }
      if (e.hp > 0 && !boss) {
        // Stagger: shove back and cancel whatever it was winding up
        e.state = 'cooldown';
        e.stateTimer = spec.stagger;
        e.hasToken = false;
        if (e.telegraphLine) e.telegraphLine.visible = false;
        e.vx = px * spec.knockback * 6;
        e.vz = pz * spec.knockback * 6;
        e.x += px * spec.knockback;
        e.z += pz * spec.knockback;
      }
    }

    // Blades cut enemy projectiles out of the air
    if (!slam) {
      let parried = 0;
      for (const p of this.projectiles) {
        if (!p.active || p.fromPlayer || p.noParry) continue;
        if (!inArc(p.x, p.z, spec.range + 0.8)) continue;
        p.active = false;
        p.group.visible = false;
        parried++;
        this.spawnParticles(p.x, p.y, p.z, 7, 0xffffff, 7, 0.18);
        this.spawnParticles(p.x, p.y, p.z, 4, p.colorHex, 5, 0.16);
      }
      if (parried > 0) {
        connected = true;
        synthAudio.playParry(parried);
      }
    }

    // Smash destructible props (iterate backwards: destroying splices the array)
    for (let oi = this.obstacles.length - 1; oi >= 0; oi--) {
      const obs = this.obstacles[oi];
      if (!obs.destructible) continue;
      if (!inArc(obs.x, obs.z, spec.range + obs.radius * 0.6) && !inShock(obs.x, obs.z, obs.radius * 0.6)) continue;
      connected = true;
      obs.hp -= weapon.damage;
      this.spawnParticles(obs.x, 1.0, obs.z, 8, obs.kind === 'tombstone' ? 0x94a3b8 : 0xff8424, 7, 0.26);
      if (obs.hp <= 0) {
        if (obs.explosive) this.detonateCrate(oi);
        else this.destroySectorProp(oi);
      }
    }

    // Chop / smash the wooden barricade
    if (this.zone === 'clearing' && this.barricadeHp > 0 && this.playerZ < -15.6 && Math.abs(this.playerX) < 6.4) {
      connected = true;
      this.damageBarricade(weapon.damage * 0.6, this.playerX + fx, 1.2, -18.2);
    }

    if (slam) {
      // The head always hits the ground: dust ring + crack, shake even on a whiff
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.fx.puff(impactX + Math.cos(a) * 0.5, 0.25, impactZ + Math.sin(a) * 0.5, 0.9, 0x9c8f7e, {
          x: Math.cos(a) * 2.2,
          z: Math.sin(a) * 2.2,
        });
      }
      this.fx.stampMark(impactX, impactZ, 1.1, 1.0, Math.random() * Math.PI, 0x1a1412);
      this.trauma = Math.min(1, this.trauma + (connected ? 0.75 : 0.45));
    }

    // Only a swing that hits something wears the blade down
    if (connected && Number.isFinite(this.ammo[weaponId]) && this.ownedWeapons.includes(weaponId)) {
      this.ammo[weaponId] = Math.max(0, this.ammo[weaponId] - 1);
      if (this.ammo[weaponId] <= 0 && this.activeWeapon === weaponId) {
        const fb = ensureUsableWeapon(this.ownedWeapons, this.activeWeapon, this.ammo);
        this.ownedWeapons = fb.ownedWeapons;
        this.ammo = fb.ammo;
        if (fb.activeWeapon !== this.activeWeapon || fb.restoredPistol) {
          this.switchWeapon(fb.activeWeapon);
          this.pickupBanner = `${weapon.shortName} QUEBROU`;
          this.pickupBannerTimer = 1.6;
          synthAudio.playWoodSplinter();
        }
      }
    }

    if (connected) {
      this.hitstopTimer = Math.max(this.hitstopTimer, slam ? 0.11 : 0.06);
      this.trauma = Math.min(1, this.trauma + (slam ? 0.3 : 0.35));
      this.camPosX -= fx * (slam ? 0.6 : 0.3);
      this.camPosZ -= fz * (slam ? 0.6 : 0.3);
      synthAudio.playMeleeHit(spec.style);
    }
    this.emitHud();
  }

  private dashCooldownMax(): number {
    return DASH_COOLDOWN * (this.upgrades.has('overclock') ? 0.65 : 1);
  }

  public setTouchMove(x: number, z: number) {
    this.touchMoveX = x;
    this.touchMoveZ = z;
  }

  public setTouchAim(x: number, z: number, firing: boolean) {
    this.touchAimX = x;
    this.touchAimZ = z;
    this.touchFiring = firing;
  }

  public getProgress(): PlayerProgress {
    return { ...this.progress };
  }

  private emitHud() {
    const activeBoss = this.enemies.find((e) => e.archetype === 'boss' && e.state !== 'ko');
    const roundInfo = getSectorRoundInfo(this.wave);
    const activeW = WEAPONS[this.activeWeapon];
    const manualReloadRatio =
      isManualWeapon(this.activeWeapon) && this.fireCooldown > 0
        ? Math.max(0, Math.min(1, this.fireCooldown / activeW.fireInterval))
        : 0;

    this.callbacks.onHudUpdate({
      hp: this.playerHp,
      maxHp: this.playerMaxHp,
      score: this.score,
      bestScore: Math.max(this.progress.bestScore, this.score),
      wave: this.wave,
      zone: this.zone,
      sectorRound: roundInfo.round,
      sectorTotalRounds: roundInfo.totalRounds,
      treeSubBiome: this.treeSubBiome,
      treeCyberRatio: this.treeCyberRatio,
      treeDepth: this.treeDepth,
      treePath: [...this.treePath],
      portalOpen: this.portalOpen && !this.inVmSpace,
      vmGate: !!this.vmDoor?.isOpen && !this.inVmSpace,
      activeItem: this.activeItem,
      activeCharge: this.activeItem ? Math.min(1, this.activeCharge / this.activeMax) : 0,
      passives: [...this.upgrades].filter((id) => VM_ITEMS.find((v) => v.id === id)?.kind !== 'active'),
      stormActive: this.stormActive,
      cutsceneText: this.cutsceneText,
      enemiesRemaining: this.enemies.filter((e) => e.state !== 'ko').length + this.waveQueue.length,
      combo: this.combo,
      comboTimerRatio: this.combo > 0 ? Math.max(0, this.comboTimer / COMBO_WINDOW) : 0,
      activeWeapon: this.activeWeapon,
      ownedWeapons: [...this.ownedWeapons],
      ammo: { ...this.ammo },
      weaponHeat: this.weaponHeatState.heat,
      weaponOverheated: this.weaponHeatState.overheated,
      reloadFlash: this.weaponHeatState.reloadFlashTimer > 0,
      manualReloadRatio,
      nearbyWeaponPickup: this.nearbyWeaponPrompt,
      dashReadyRatio: Math.max(0, Math.min(1, 1 - this.dashCooldownTimer / this.dashCooldownMax())),
      cinematic: this.isCinematic(),
      poison: this.poison,
      credits: this.credits,
      vmPrompt: this.vmPrompt,
      kills: this.kills,
      maxCombo: this.maxCombo,
      waveBanner: this.waveBanner,
      pickupBanner: this.pickupBanner,
      newlyUnlockedSkin: this.newlyUnlockedSkin,
      damageFlashActive: this.damageFlash > 0.08,
      boss: activeBoss
        ? {
            name: activeBoss.v2 ? `${ENEMY_CONFIGS.boss.label} · DANIFICADO` : ENEMY_CONFIGS.boss.label,
            hp: Math.max(0, activeBoss.hp),
            maxHp: activeBoss.maxHp,
            enraged: Boolean(activeBoss.enraged),
            bossLine: activeBoss.bossLine ?? null,
          }
        : null,
      barricade:
        this.zone === 'clearing' && this.barricadeHp > 0
          ? {
              name: 'BARRICADA DA ÁRVORE',
              hp: this.barricadeHp,
              maxHp: BARRICADE_MAX_HP,
              planksLeft: getBarricadePlanksRemaining(this.barricadeHp),
              totalPlanks: BARRICADE_TOTAL_PLANKS,
            }
          : null,
    });
  }

  private screenToWorld(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    _raycaster.setFromCamera(_ndc, this.camera);
    _rayOrigin.copy(_raycaster.ray.origin);
    _rayDir.copy(_raycaster.ray.direction);
    const target = new THREE.Vector3();
    return _raycaster.ray.intersectPlane(_groundPlane, target);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.code);

    if (this.phase === 'playing') {
      if (this.cutsceneMode !== 'none' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.skipCutscene();
        return;
      }
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        this.triggerDash();
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.vmPrompt) this.openVm();
        else this.swapNearbyWeapon();
      } else if (e.code === 'KeyF') {
        this.useActiveItem();
      } else if (e.code === 'Digit1' && this.ownedWeapons[0]) {
        this.switchWeapon(this.ownedWeapons[0]);
      } else if (e.code === 'Digit2' && this.ownedWeapons[1]) {
        this.switchWeapon(this.ownedWeapons[1]);
      } else if (e.code === 'KeyQ' && this.ownedWeapons.length > 1) {
        const idx = this.ownedWeapons.indexOf(this.activeWeapon);
        const nextIdx = (idx + 1) % this.ownedWeapons.length;
        this.switchWeapon(this.ownedWeapons[nextIdx]);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMouseMoved = true;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0 && this.phase === 'playing') {
      if (this.cutsceneMode !== 'none') {
        this.skipCutscene();
        return;
      }
      this.mouseClientX = e.clientX;
      this.mouseClientY = e.clientY;
      this.hasMouseMoved = true;
      this.mouseDown = true;
      this.mouseJustPressed = true;
      synthAudio.unlock();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) {
      this.mouseDown = false;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing' || this.ownedWeapons.length <= 1) return;
    const idx = Math.max(0, this.ownedWeapons.indexOf(this.activeWeapon));
    const dir = e.deltaY > 0 ? 1 : -1;
    const nextIdx = (idx + dir + this.ownedWeapons.length) % this.ownedWeapons.length;
    this.switchWeapon(this.ownedWeapons[nextIdx]);
  };

  private onWindowBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.touchFiring = false;
  };

  private handleResize() {
    if (this.disposed) return;
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(200, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.ditherPass.resize(w, h, PIXEL_SCALE);
    if (this.assets) {
      this.ditherPass.render(this.renderer, this.scene, this.camera, this.elapsedSec, this.damageFlash);
    }
  }

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onWindowBlur);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
  }

  public dispose() {
    this.disposed = true;
    this.cineFadeEl.remove();
    this.cineBarTop.remove();
    this.cineBarBottom.remove();
    this.cineSubtitle.remove();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onWindowBlur);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.fx.dispose();
    dom.removeEventListener('wheel', this.onWheel);

    this.ditherPass.dispose();
    this.shadowTex.dispose();
    this.projectileGeo.dispose();
    this.enemyCoreGeo.dispose();
    this.enemyHaloGeo.dispose();
    this.plasmaBoltGeo.dispose();
    this.rocketGeo.dispose();
    this.pickupGeo.dispose();
    this.ringGeo.dispose();
    this.renderer.dispose();
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  }
}
