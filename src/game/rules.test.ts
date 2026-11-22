import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_CONFIGS, WEAPONS } from './config';
import {
  acquireOrSwapWeapon,
  calculateComboKillScore,
  computeParabolicJumpHeight,
  computeWaveComposition,
  computeWeaponScreenshake,
  ensureUsableWeapon,
  evaluateSkinUnlocks,
  getSkinUnlockProgress,
  getBarricadePlanksRemaining,
  getSectorRoundInfo,
  getTreeSubBiome,
  getTreeSubBiomeFromRatio,
  getZoneForWave,
  isBossEnraged,
  isBossWave,
  isManualWeapon,
  normalizeLeaderboardName,
  resolveCircleObstacleCollision,
  segmentCircleIntersect,
  selectArenaWeaponSpawn,
  sortLeaderboard,
  stepCyberBlend,
  stepWeaponHeat,
} from './rules';
import type { LeaderboardEntry, WeaponId } from './types';

test('evaluateSkinUnlocks grants sunset and one skin per skin achievement', () => {
  assert.deepEqual(evaluateSkinUnlocks({ totalKills: 0, achievements: [] }), ['sunset']);
  // Achievements without a skin reward don't unlock anything
  assert.deepEqual(evaluateSkinUnlocks({ totalKills: 9, achievements: ['first_blood', 'bug'] }), ['sunset']);
  assert.deepEqual(
    evaluateSkinUnlocks({ totalKills: 60, achievements: ['kills_50', 'faces_1'] }),
    ['sunset', 'cyan_marshal', 'gold_desperado']
  );
  assert.deepEqual(
    evaluateSkinUnlocks({ totalKills: 300, achievements: ['kills_50', 'combo_10', 'faces_1', 'faces_2'] }),
    ['sunset', 'cyan_marshal', 'acid_rattler', 'gold_desperado', 'phantom_mesa']
  );
});

test('getSkinUnlockProgress names the achievement and shows kill progress', () => {
  const st = getSkinUnlockProgress('cyan_marshal', { totalKills: 12, achievements: [] });
  assert.equal(st.unlocked, false);
  assert.match(st.label, /12\/50/);
  assert.equal(getSkinUnlockProgress('sunset', { totalKills: 0, achievements: [] }).unlocked, true);
});

test('calculateComboKillScore scales points with combo up to 6x cap', () => {
  const first = calculateComboKillScore(100, 0);
  assert.equal(first.nextCombo, 1);
  assert.equal(first.pointsAwarded, 100);

  const fifth = calculateComboKillScore(100, 4);
  assert.equal(fifth.nextCombo, 5);
  assert.equal(fifth.pointsAwarded, 200);

  const capped = calculateComboKillScore(100, 30);
  assert.equal(capped.pointsAwarded, 600);
});

test('resolveCircleObstacleCollision pushes player cleanly outside obstacle and arena rim', () => {
  const obstacles = [{ x: 0, z: 0, halfW: 1, halfD: 1 }];
  const pushed = resolveCircleObstacleCollision(0.8, 0.2, 0.6, obstacles, 20);
  assert.ok(pushed.x >= 1.59, `Expected x >= 1.59, got ${pushed.x}`);

  const clamped = resolveCircleObstacleCollision(25, 0, 1, [], 20);
  assert.ok(Math.abs(clamped.x - 19) < 0.001);
});

test('segmentCircleIntersect detects swept projectile hits accurately', () => {
  assert.equal(segmentCircleIntersect(-5, 0, 5, 0, 0, 0.4, 0.6), true);
  assert.equal(segmentCircleIntersect(-5, 0, 5, 0, 0, 2.0, 0.6), false);
  assert.equal(segmentCircleIntersect(-5, 0, -2, 0, 0, 0, 0.6), false);
});

test('5-stage world progression (road -> desert[3] -> cemetery[3] -> clearing -> tree) and boss waves', () => {
  assert.equal(isBossWave(1), false);
  assert.equal(isBossWave(5), false);
  assert.equal(isBossWave(9), false);
  assert.equal(isBossWave(10), true);
  assert.equal(isBossWave(15), true); // his second coming, five rooms after VM
  assert.equal(isBossWave(13), false);
  assert.equal(isBossWave(17), false);

  assert.equal(getZoneForWave(1), 'road');
  assert.equal(getZoneForWave(2), 'desert');
  assert.equal(getZoneForWave(3), 'desert');
  assert.equal(getZoneForWave(4), 'desert');
  assert.equal(getZoneForWave(5), 'cemetery');
  assert.equal(getZoneForWave(6), 'cemetery');
  assert.equal(getZoneForWave(7), 'cemetery');
  assert.equal(getZoneForWave(8), 'clearing');
  assert.equal(getZoneForWave(9), 'tree');
  assert.equal(getZoneForWave(10), 'tree');

  assert.deepEqual(getSectorRoundInfo(2), { round: 1, totalRounds: 3 });
  assert.deepEqual(getSectorRoundInfo(4), { round: 3, totalRounds: 3 });
  assert.deepEqual(getSectorRoundInfo(6), { round: 2, totalRounds: 3 });

  const w1 = computeWaveComposition(1);
  assert.equal(w1.zone, 'road');
  assert.ok(w1.enemies.includes('rustler'));

  const w2 = computeWaveComposition(2);
  assert.equal(w2.zone, 'desert');
  assert.ok(w2.enemies.includes('ranger'));

  const w5 = computeWaveComposition(5);
  assert.equal(w5.zone, 'cemetery');
  assert.ok(w5.enemies.includes('spider') && w5.enemies.includes('tesla'));

  const w8 = computeWaveComposition(8);
  assert.equal(w8.zone, 'clearing');
  assert.equal(w8.maxConcurrent, 3);
  assert.ok(w8.spawnInterval >= 2.0);
  assert.ok(w8.enemies.includes('juggernaut') && w8.enemies.includes('tesla'));

  const w9 = computeWaveComposition(9);
  assert.equal(w9.zone, 'tree');
  assert.ok(w9.enemies.includes('spider'), 'Binary Tree should spawn spider enemies');
  assert.ok(w9.enemies.includes('spore'), 'Binary Tree should spawn viral spore enemies');
  assert.ok(w9.enemies.includes('tesla'), 'Binary Tree should spawn Volt Wraith tesla enemies');

  const w10 = computeWaveComposition(10);
  assert.equal(w10.isBossWave, true);
  assert.equal(w10.zone, 'tree');
  assert.deepEqual(w10.enemies, ['boss']);
  assert.equal(w10.maxConcurrent, 1);
  assert.ok(w10.speedMultiplier > w1.speedMultiplier);
  assert.ok(w10.hpMultiplier > w1.hpMultiplier);

  // The return fight opens with an ordinary round; he drops in once it's cleared
  const w15 = computeWaveComposition(15);
  assert.equal(w15.isBossWave, true);
  assert.equal(w15.enemies.length, 10);
  assert.ok(!w15.enemies.includes('boss'));

  // Manual guns, staircase gradual cyber/industrial blending & wooden barricade planks
  assert.equal(isManualWeapon('shotgun'), true);
  assert.equal(isManualWeapon('railgun'), true);
  assert.equal(isManualWeapon('rocket'), true);
  assert.equal(isManualWeapon('pistol'), false);
  assert.equal(isManualWeapon('plasma'), false);

  assert.equal(stepCyberBlend(0.5, 'up'), 0.7);
  assert.equal(stepCyberBlend(0.9, 'up'), 1);
  assert.equal(stepCyberBlend(0.5, 'down'), 0.3);
  assert.equal(stepCyberBlend(0.1, 'down'), 0);

  assert.equal(getTreeSubBiomeFromRatio(0.2), 'megastructure');
  assert.equal(getTreeSubBiomeFromRatio(0.5), 'hybrid');
  assert.equal(getTreeSubBiomeFromRatio(0.8), 'wireframe');

  assert.equal(getBarricadePlanksRemaining(720, 720, 8), 8);
  assert.equal(getBarricadePlanksRemaining(360, 720, 8), 4);
  assert.equal(getBarricadePlanksRemaining(1, 720, 8), 1);
  assert.equal(getBarricadePlanksRemaining(0, 720, 8), 0);

  assert.equal(getTreeSubBiome(0), 'megastructure');
  assert.equal(getTreeSubBiome(3), 'wireframe');
});

test('stepWeaponHeat tracks buildup, idle cooling, overheat lock, and starter pistol exemption', () => {
  let state = { heat: 0, overheated: false, overheatTimer: 0, reloadFlashTimer: 0 };

  // Firing rapid shots builds heat up to overheat lock for non-starter weapons
  state = stepWeaponHeat(state, 0.05, 0.4, true, 0.55, 0.6, false);
  assert.ok(state.heat > 0.5 && !state.overheated);

  state = stepWeaponHeat(state, 0.05, 0.4, true, 0.55, 0.6, false);
  assert.equal(state.heat, 1);
  assert.equal(state.overheated, true);
  assert.ok(state.overheatTimer > 0.5);

  // Venting over overheatDuration resets heat and triggers reload flash
  state = stepWeaponHeat(state, 0.35, 0.4, false, 0.55, 0.6, false);
  assert.equal(state.overheated, true);
  state = stepWeaponHeat(state, 0.35, 0.4, false, 0.55, 0.6, false);
  assert.equal(state.overheated, false);
  assert.equal(state.heat, 0);
  assert.ok(state.reloadFlashTimer > 0);

  // Starter pistol never locks into overheat
  let pistolState = { heat: 0.96, overheated: false, overheatTimer: 0, reloadFlashTimer: 0 };
  pistolState = stepWeaponHeat(pistolState, 0.05, 0.4, true, 0.1, 0.45, true);
  assert.equal(pistolState.overheated, false);
});

test('2-weapon slot limit auto-picks up when holding 1 gun and swaps via E when holding 2', () => {
  for (let i = 0; i < 10; i++) {
    assert.notEqual(selectArenaWeaponSpawn(1, i / 10), 'pistol');
    assert.notEqual(selectArenaWeaponSpawn(3, i / 10), 'pistol');
  }

  const startAmmo: Record<WeaponId, number> = {
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

  // Holding 1 weapon ('pistol') -> shotgun auto-equips into slot 2
  const autoRes = acquireOrSwapWeapon(['pistol'], 'pistol', startAmmo, 'shotgun');
  assert.equal(autoRes.pickedUp, true);
  assert.equal(autoRes.requiresSwap, false);
  assert.deepEqual(autoRes.ownedWeapons, ['pistol', 'shotgun']);
  assert.equal(autoRes.activeWeapon, 'shotgun');
  assert.equal(autoRes.ammo.shotgun, 24);

  // Holding 2 weapons -> stepping over a 3rd gun prompts swap without replacing
  const promptRes = acquireOrSwapWeapon(autoRes.ownedWeapons, 'shotgun', autoRes.ammo, 'railgun', undefined, false);
  assert.equal(promptRes.pickedUp, false);
  assert.equal(promptRes.requiresSwap, true);
  assert.deepEqual(promptRes.ownedWeapons, ['pistol', 'shotgun']);

  // Pressing E (forceSwap=true) swaps active slot ('shotgun') for 'railgun' and drops shotgun
  const swapRes = acquireOrSwapWeapon(autoRes.ownedWeapons, 'shotgun', autoRes.ammo, 'railgun', undefined, true);
  assert.equal(swapRes.pickedUp, true);
  assert.deepEqual(swapRes.ownedWeapons, ['pistol', 'railgun']);
  assert.equal(swapRes.activeWeapon, 'railgun');
  assert.equal(swapRes.swappedOut?.weaponId, 'shotgun');
  assert.equal(swapRes.swappedOut?.ammo, 24);

  // If a limited gun hits 0 ammo and no pistol is held, emergency pistol restores
  const zeroAmmo: Record<WeaponId, number> = { ...startAmmo, railgun: 0 };
  const fallback = ensureUsableWeapon(['railgun'], 'railgun', zeroAmmo);
  assert.deepEqual(fallback.ownedWeapons, ['pistol']);
  assert.equal(fallback.activeWeapon, 'pistol');
  assert.equal(fallback.restoredPistol, true);
});

test('normalizeLeaderboardName validates and sanitizes arcade callsigns', () => {
  assert.equal(normalizeLeaderboardName('  Sundance! '), 'SUNDANCE');
  assert.equal(normalizeLeaderboardName('a'), null);
  assert.equal(normalizeLeaderboardName('   '), null);
  assert.equal(normalizeLeaderboardName('very_long_cowboy_name'), 'VERY_LONG_CO');
});

test('sortLeaderboard orders by score, then wave, then combo', () => {
  const entries: LeaderboardEntry[] = [
    { id: '1', name: 'AAA', score: 1000, wave: 2, maxCombo: 3, weapon: 'pistol', skin: 'sunset', createdAt: '' },
    { id: '2', name: 'BBB', score: 2500, wave: 3, maxCombo: 5, weapon: 'plasma', skin: 'sunset', createdAt: '' },
    { id: '3', name: 'CCC', score: 2500, wave: 4, maxCombo: 2, weapon: 'rocket', skin: 'sunset', createdAt: '' },
  ];
  const sorted = sortLeaderboard(entries);
  assert.deepEqual(sorted.map((e) => e.id), ['3', '2', '1']);
});

test('Cem Faces boss config, parabolic leap slam arc, and enrage threshold', () => {
  assert.equal(ENEMY_CONFIGS.boss.label, 'CEM FACES');
  assert.ok(ENEMY_CONFIGS.boss.hp >= 1500);

  assert.equal(computeParabolicJumpHeight(0, 11.5), 0);
  assert.equal(computeParabolicJumpHeight(0.5, 11.5), 11.5);
  assert.equal(computeParabolicJumpHeight(1, 11.5), 0);

  assert.equal(isBossEnraged(1200, 1650), false);
  assert.equal(isBossEnraged(825, 1650), true);
  assert.equal(isBossEnraged(0, 1650), false);
});

test('computeWeaponScreenshake scales intensity by weapon damage and ordnance impact', () => {
  const pistolShake = computeWeaponScreenshake(WEAPONS.pistol, 'fire');
  const plasmaShake = computeWeaponScreenshake(WEAPONS.plasma, 'fire');
  const shotgunShake = computeWeaponScreenshake(WEAPONS.shotgun, 'fire');
  const rocketShake = computeWeaponScreenshake(WEAPONS.rocket, 'fire');
  const railgunShake = computeWeaponScreenshake(WEAPONS.railgun, 'fire');

  assert.ok(shotgunShake.trauma > pistolShake.trauma);
  assert.ok(rocketShake.trauma > shotgunShake.trauma);
  assert.ok(railgunShake.trauma > shotgunShake.trauma);
  assert.ok(rocketShake.trauma > plasmaShake.trauma);
  assert.ok(railgunShake.cameraKick > shotgunShake.cameraKick);
  // Rapid-fire plasma stays gentle so it can't stack into a constant quake
  assert.ok(plasmaShake.trauma < 0.06);
  assert.ok(plasmaShake.trauma < pistolShake.trauma);

  const rocketImpact = computeWeaponScreenshake(WEAPONS.rocket, 'impact');
  const railgunImpact = computeWeaponScreenshake(WEAPONS.railgun, 'impact');
  const pistolImpact = computeWeaponScreenshake(WEAPONS.pistol, 'impact');
  assert.ok(rocketImpact.trauma > 0.9);
  assert.ok(rocketImpact.trauma > railgunImpact.trauma);
  assert.ok(railgunImpact.trauma > pistolImpact.trauma);
});

