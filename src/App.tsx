import { useCallback, useEffect, useRef, useState } from 'react';
import { AchievementToast } from './components/AchievementToast';
import { AchievementsModal } from './components/AchievementsModal';
import { BackpackModal } from './components/BackpackModal';
import { GameHud } from './components/GameHud';
import { HandCursor } from './components/HandCursor';
import { GameOverModal, PauseModal } from './components/GameModals';
import { LeaderboardModal } from './components/LeaderboardModal';
import { SkinsModal } from './components/SkinsModal';
import { TerminalBoot } from './components/TerminalBoot';
import { TitleScreen } from './components/TitleScreen';
import { VmDialog } from './components/VmDialog';
import type { AchievementDef } from './game/achievements';
import { synthAudio } from './game/audio';
import { PLAYER_MAX_HP } from './game/config';
import { NeonMesaEngine } from './game/engine';
import {
  fetchLeaderboard,
  loadPlayerProgress,
  savePlayerProgress,
  submitLeaderboardScore,
} from './game/storage';
import type {
  BackpackState,
  GamePhase,
  HudSnapshot,
  LeaderboardEntry,
  PlayerProgress,
  RunSummary,
  SkinId,
  WeaponId,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  score: 0,
  bestScore: 0,
  wave: 1,
  zone: 'road',
  sectorRound: 1,
  sectorTotalRounds: 1,
  treeSubBiome: 'megastructure',
  treeCyberRatio: 0.5,
  treeDepth: 0,
  treePath: [],
  portalOpen: false,
  vmGate: false,
  activeItem: null,
  activeCharge: 0,
  passives: [],
  stormActive: false,
  cutsceneText: null,
  enemiesRemaining: 0,
  combo: 0,
  comboTimerRatio: 0,
  activeWeapon: 'pistol',
  ownedWeapons: ['pistol'],
  ammo: {
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
  },
  weaponHeat: 0,
  weaponOverheated: false,
  reloadFlash: false,
  manualReloadRatio: 0,
  nearbyWeaponPickup: null,
  dashReadyRatio: 1,
  cinematic: false,
  credits: 0,
  poison: 0,
  vmPrompt: false,
  kills: 0,
  maxCombo: 0,
  waveBanner: null,
  pickupBanner: null,
  newlyUnlockedSkin: null,
  damageFlashActive: false,
  boss: null,
  barricade: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<NeonMesaEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [backpack, setBackpack] = useState<BackpackState | null>(null);
  const [toasts, setToasts] = useState<AchievementDef[]>([]);
  const dismissToast = useCallback(() => setToasts((q) => q.slice(1)), []);
  const [assetsReady, setAssetsReady] = useState(false);
  const [progress, setProgress] = useState<PlayerProgress>(() => loadPlayerProgress());
  const [hud, setHud] = useState<HudSnapshot>(() => ({
    ...INITIAL_HUD,
    bestScore: loadPlayerProgress().bestScore,
  }));
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [muted, setMuted] = useState(false);
  const manualTouchOverride = useRef(false);
  const [touchEnabled, setTouchEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  });

  useEffect(() => {
    const onResize = () => {
      if (manualTouchOverride.current) return;
      setTouchEnabled(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [showSkins, setShowSkins] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const entries = await fetchLeaderboard();
      setLeaderboardEntries(entries);
    } catch (err) {
      setLeaderboardError(err instanceof Error ? err.message : 'Unable to load leaderboard');
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const handleStart = useCallback(() => {
    setShowSkins(false);
    setShowLeaderboard(false);
    setRunSummary(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    engineRef.current?.startNewRun();
  }, []);

  // From the title, a run boots through the terminal sequence first
  const [booting, setBooting] = useState(false);
  const startBoot = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setShowSkins(false);
    setShowLeaderboard(false);
    synthAudio.unlock();
    setBooting(true);
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !synthAudio.isMuted();
    synthAudio.setMuted(next);
    setMuted(next);
  }, []);

  const handleEquipSkin = useCallback((skinId: SkinId) => {
    engineRef.current?.equipSkin(skinId);
    setProgress((prev) => {
      const next = { ...prev, equippedSkin: skinId };
      savePlayerProgress(next);
      return next;
    });
  }, []);

  const handleSubmitScore = useCallback(
    async (name: string) => {
      if (!runSummary) return;
      const updated = await submitLeaderboardScore({
        name,
        score: runSummary.score,
        wave: runSummary.wave,
        maxCombo: runSummary.maxCombo,
        weapon: runSummary.weaponUsed,
        skin: runSummary.skinUsed,
      });
      setLeaderboardEntries(updated);
    },
    [runSummary]
  );

  useEffect(() => {
    if (!mountRef.current) return;
    const initialProgress = loadPlayerProgress();

    const engine = new NeonMesaEngine(mountRef.current, initialProgress, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onPhaseChange: (nextPhase) => {
        setPhase(nextPhase);
      },
      onGameOver: (summary) => {
        setRunSummary(summary);
        const latest = engine.getProgress();
        savePlayerProgress(latest);
        setProgress(latest);
      },
      onAchievement: (def) => {
        setToasts((q) => [...q, def]);
        setProgress(engine.getProgress());
      },
      onAssetsReady: () => {
        setAssetsReady(true);
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1') {
          const waveNum = Number(params.get('wave') || '1');
          engine.startNewRun(Number.isFinite(waveNum) && waveNum >= 1 ? waveNum : 1);
        }
      },
    });
    engineRef.current = engine;
    // Dev-only handle for automated playtests (stripped from production builds)
    if (import.meta.env.DEV) (window as unknown as { __engine?: NeonMesaEngine }).__engine = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts (Enter/Space on Title, Esc/P Pause, N Mute, M Backpack)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'KeyN') {
        handleToggleMute();
        return;
      }

      // Backpack: M opens it (pausing the game), M / Esc closes it
      if (e.code === 'KeyM' && (phase === 'playing' || (phase === 'paused' && backpack))) {
        e.preventDefault();
        if (backpack) {
          setBackpack(null);
          engineRef.current?.setPaused(false);
        } else if (engineRef.current) {
          engineRef.current.setPaused(true);
          setBackpack(engineRef.current.getBackpack());
        }
        return;
      }
      if (backpack && phase === 'paused' && e.code === 'Escape') {
        e.preventDefault();
        setBackpack(null);
        engineRef.current?.setPaused(false);
        return;
      }

      // (The title menu handles its own ↑/↓/Enter navigation)
      if (phase === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          engineRef.current?.setPaused(true);
        }
      } else if (phase === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          engineRef.current?.setPaused(false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, handleToggleMute, backpack]);

  const openLeaderboard = useCallback(() => {
    setShowLeaderboard(true);
    loadLeaderboard();
  }, [loadLeaderboard]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#050506]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {phase === 'title' && !booting && (
        <TitleScreen
          bestScore={progress.bestScore}
          equippedSkin={progress.equippedSkin}
          muted={muted}
          assetsReady={assetsReady}
          interactive={!showSkins && !showLeaderboard && !showAchievements}
          onStart={startBoot}
          onOpenSkins={() => setShowSkins(true)}
          onOpenAchievements={() => setShowAchievements(true)}
          onOpenLeaderboard={openLeaderboard}
          onToggleMute={handleToggleMute}
        />
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <GameHud
          hud={hud}
          muted={muted}
          touchEnabled={touchEnabled}
          onToggleTouch={() => {
            manualTouchOverride.current = true;
            setTouchEnabled((v) => !v);
          }}
          onToggleMute={handleToggleMute}
          onPause={() => engineRef.current?.setPaused(phase === 'playing')}
          onRestart={handleStart}
          onSelectWeapon={(w: WeaponId) => engineRef.current?.switchWeapon(w)}
          onSwapWeapon={() => engineRef.current?.swapNearbyWeapon()}
          onTouchMove={(x, z) => engineRef.current?.setTouchMove(x, z)}
          onTouchAim={(x, z, firing) => engineRef.current?.setTouchAim(x, z, firing)}
          onDash={() => engineRef.current?.triggerDash()}
          onTalkVm={() => engineRef.current?.openVm()}
        />
      )}

      {phase === 'shop' && engineRef.current && (
        <VmDialog
          getShop={() => engineRef.current!.getVmShop()}
          onBuy={(id) => engineRef.current!.buyVmItem(id)}
          onClose={() => engineRef.current?.closeVm()}
        />
      )}

      {phase === 'paused' && backpack && (
        <BackpackModal
          state={backpack}
          getTemplate={(id) => engineRef.current?.getCreatureTemplate(id) ?? null}
          onClose={() => {
            setBackpack(null);
            engineRef.current?.setPaused(false);
          }}
        />
      )}

      {phase === 'paused' && !backpack && (
        <PauseModal
          onResume={() => engineRef.current?.setPaused(false)}
          onRestart={handleStart}
          onQuitToTitle={() => engineRef.current?.returnToTitle()}
        />
      )}

      {phase === 'gameover' && runSummary && (
        <GameOverModal
          summary={runSummary}
          onPlayAgain={handleStart}
          onOpenSkins={() => setShowSkins(true)}
          onOpenLeaderboard={openLeaderboard}
          onSubmitScore={handleSubmitScore}
        />
      )}

      {showSkins && (
        <SkinsModal
          progress={progress}
          heroTemplate={engineRef.current?.getHeroTemplate() ?? null}
          onSelectSkin={handleEquipSkin}
          onClose={() => setShowSkins(false)}
        />
      )}

      {showAchievements && <AchievementsModal progress={progress} onClose={() => setShowAchievements(false)} />}

      <HandCursor />

      {toasts.length > 0 && <AchievementToast key={toasts[0].id} def={toasts[0]} onDone={dismissToast} />}

      {booting && (
        <TerminalBoot
          onDone={() => {
            setBooting(false);
            handleStart();
          }}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal
          entries={leaderboardEntries}
          loading={leaderboardLoading}
          error={leaderboardError}
          onRefresh={loadLeaderboard}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </main>
  );
}
