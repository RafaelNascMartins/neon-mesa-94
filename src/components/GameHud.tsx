import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Pause, RefreshCw, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { SKIN_MAP, WEAPONS } from '../game/config';
import type { ArenaZone, HudSnapshot, WeaponId } from '../game/types';
import { countSoulItems, SOUL_AWAKEN_COUNT } from '../game/souls';
import { synthAudio } from '../game/audio';
import { SOUL_FORM_TIME, SoulGlyph } from './SoulIcons';
import { ItemIcon, MedKitIcon, WeaponIcon } from './SvgIcons';
import { TouchControls } from './TouchControls';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  touchEnabled: boolean;
  onToggleTouch: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSelectWeapon: (id: WeaponId) => void;
  onSwapWeapon: () => void;
  onTouchMove: (x: number, z: number) => void;
  onTouchAim: (x: number, z: number, firing: boolean) => void;
  onDash: () => void;
  onTalkVm: () => void;
}

const ROUTE_STAGES: { id: ArenaZone; label: string }[] = [
  { id: 'road', label: 'ESTRADA' },
  { id: 'desert', label: 'DESERTO' },
  { id: 'cemetery', label: 'CEMITÉRIO' },
  { id: 'clearing', label: 'CRATERA' },
  { id: 'tree', label: 'ÁRVORE' },
];

const PORTAL_LABELS: Record<ArenaZone, string> = {
  road: 'SIGA PARA LESTE PELA ESTRADA',
  desert: 'PORTÃO DO CEMITÉRIO ABERTO · ENTRE AO NORTE',
  cemetery: 'A TEMPESTADE CESSOU · VÁ AO PÉ DA ÁRVORE',
  clearing: 'BARRICADA DESTRUÍDA · ENTRE NA ÁRVORE BINÁRIA',
  tree: '↓ DESÇA MAIS FUNDO ↓',
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

/** 7-digit counter with dimmed leading zeros, like a mechanical tally. */
function ScoreDigits({ value }: { value: number }) {
  const safe = Math.max(0, Math.round(value));
  const str = safe.toString().padStart(7, '0');
  const firstSignificant = safe === 0 ? str.length - 1 : str.search(/[1-9]/);
  return (
    <>
      <span style={{ color: 'var(--hud-faint)' }}>{str.slice(0, firstSignificant)}</span>
      <span>{str.slice(firstSignificant)}</span>
    </>
  );
}

/**
 * Entering a new area: its name, big, in Pixelta, across the middle of the screen for a few
 * seconds (also when the HUD first comes up at the start of a run).
 */
function ZoneTitle({ zone, label }: { zone: ArenaZone; label: string }) {
  const [shown, setShown] = useState<{ label: string; key: number } | null>(null);
  const last = useRef<ArenaZone | null>(null);
  useEffect(() => {
    if (last.current === zone) return;
    last.current = zone;
    setShown({ label, key: Date.now() });
    const t = window.setTimeout(() => setShown(null), 3400);
    return () => window.clearTimeout(t);
  }, [zone, label]);
  if (!shown) return null;
  return (
    <div key={shown.key} className="zone-title fixed inset-x-0 top-[30%] flex flex-col items-center pointer-events-none">
      <span className="zone-title-rule" />
      <span className="zone-title-text">{shown.label}</span>
      <span className="zone-title-rule" />
    </div>
  );
}

export function GameHud({
  hud,
  muted,
  touchEnabled,
  onToggleTouch,
  onToggleMute,
  onPause,
  onRestart,
  onSelectWeapon,
  onSwapWeapon,
  onTouchMove,
  onTouchAim,
  onDash,
  onTalkVm,
}: GameHudProps) {
  // The soul awakening mid-run: its symbol re-forms in the HUD, so its sound plays along
  useEffect(() => {
    if (!hud.soul || !hud.soulAwakened) return;
    const stop = synthAudio.playSoulForm(hud.soul, SOUL_FORM_TIME[hud.soul]);
    // Mid-fight it's just a flourish: fade out before Ódio's heartbeat starts racing
    const t = window.setTimeout(() => stop(1.5), (SOUL_FORM_TIME[hud.soul] + 2.5) * 1000);
    return () => {
      window.clearTimeout(t);
      stop(0.5);
    };
  }, [hud.soul, hud.soulAwakened]);
  // Intro cutscene runs full-screen with no HUD
  if (hud.cinematic) return null;

  const lowHp = hud.hp <= 1;
  const activeDef = WEAPONS[hud.activeWeapon];
  const activeAmmo = hud.ammo[hud.activeWeapon];
  const activeAmmoFinite = Number.isFinite(activeAmmo);
  const activeAmmoRatio = activeAmmoFinite ? clamp01(activeAmmo / Math.max(1, activeDef.maxAmmo)) : 1;
  const activeSlotIndex = Math.max(1, hud.ownedWeapons.indexOf(hud.activeWeapon) + 1);
  const secondaryOwned = hud.ownedWeapons.filter((wId) => wId !== hud.activeWeapon);

  const inTree = hud.zone === 'tree';
  const isWireframe = inTree && hud.treeSubBiome === 'wireframe';
  const swapInfo = hud.nearbyWeaponPickup;
  const currentStageIdx = ROUTE_STAGES.findIndex((s) => s.id === hud.zone);
  const zoneLabel = ROUTE_STAGES[currentStageIdx]?.label ?? hud.zone.toUpperCase();

  // Heat / vent / manual-chamber gauge state
  const heatMode: 'chamber' | 'vent' | 'cool' | 'heat' =
    hud.manualReloadRatio > 0 ? 'chamber' : hud.weaponOverheated ? 'vent' : hud.reloadFlash ? 'cool' : 'heat';
  const heatLabel = { chamber: 'CARREGANDO', vent: 'VENTILANDO', cool: 'RESFRIADO', heat: 'CALOR' }[heatMode];
  const heatRatio =
    heatMode === 'chamber' ? hud.manualReloadRatio : heatMode === 'cool' ? 1 : clamp01(hud.weaponHeat);
  const heatColor =
    heatMode === 'vent'
      ? 'var(--hud-danger)'
      : heatMode === 'cool' || heatMode === 'chamber'
        ? 'var(--hud-bone)'
        : hud.weaponHeat >= 0.72
          ? '#ff6a2b'
          : 'var(--hud-accent)';

  return (
    <div
      className="hud fixed inset-0 z-20 pointer-events-none select-none"
      data-zone={hud.zone}
      data-sub={inTree ? hud.treeSubBiome : undefined}
    >
      {/* Damage impact vignette + critical integrity border */}
      {(hud.damageFlashActive || lowHp) && (
        <div
          data-testid="damage-vignette"
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            boxShadow: hud.damageFlashActive
              ? 'inset 0 0 135px rgba(255, 30, 30, 0.85)'
              : 'inset 0 0 90px rgba(255, 30, 30, 0.45)',
          }}
        />
      )}

      {/* ─────────────── Top row ─────────────── */}
      <div className="flex items-start justify-between p-2.5 sm:p-4 gap-2 sm:gap-4">
        {/* Top-left: sector status */}
        <div className="hud-panel px-2.5 py-2 sm:px-3.5 sm:py-2.5 flex flex-col gap-2 min-w-0">
          {(inTree || hud.stormActive) && (
            <div className="flex items-baseline gap-2.5 whitespace-nowrap">
              {inTree && <span className="hud-label">PROFUNDIDADE {hud.treeDepth}</span>}
              {hud.stormActive && <span className="hud-chip hud-pulse">TEMPESTADE</span>}
            </div>
          )}

          {/* Integrity cells (big: it's the one thing you check mid-fight) */}
          <div className="flex flex-col gap-1.5" aria-label={`Integridade ${hud.hp} de ${hud.maxHp}`}>
            <span className="hud-label">INTEGRIDADE</span>
            <div className="flex items-center gap-[7px] pl-1">
              {Array.from({ length: hud.maxHp }).map((_, idx) => (
                <div key={idx} className="hud-cell hud-cell-lg" data-on={idx < hud.hp} data-critical={lowHp} />
              ))}
            </div>
          </div>

          {/* Soul: symbol + progress toward awakening */}
          {hud.soul && (
            <div className="flex items-center gap-1.5" aria-label={hud.soulAwakened ? 'Alma desperta' : 'Alma'}>
              {/* Assembles at run start, and again (glowing) the moment it awakens */}
              <SoulGlyph key={hud.soulAwakened ? 'awake' : 'asleep'} soul={hud.soul} className="w-8 h-8" animate live={hud.soulAwakened} glow={hud.soulAwakened} dim={!hud.soulAwakened} />
              <span className="hud-label tabular-nums">
                {hud.soulAwakened
                  ? 'DESPERTA'
                  : `${Math.min(SOUL_AWAKEN_COUNT, countSoulItems(hud.soul, [...hud.passives, ...(hud.activeItem ? [hud.activeItem] : [])]))}/${SOUL_AWAKEN_COUNT}`}
              </span>
            </div>
          )}

          {/* Passive items picked up this run */}
          {hud.passives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 max-w-[220px]" aria-label="Itens passivos">
              {hud.passives.map((id) => (
                <ItemIcon key={id} id={id} className="w-5 h-5" />
              ))}
            </div>
          )}

          {/* Poison meter: fills inside purple mist, hurts only when full */}
          {hud.poison > 0.01 && (
            <div className="flex items-center gap-2.5" aria-label={`Veneno ${Math.round(hud.poison * 100)}%`}>
              <span className="hud-label" style={{ color: '#c77dff' }}>
                VENENO
              </span>
              <div className="hud-track h-[6px] w-24 sm:w-32">
                <div
                  className={`h-full ${hud.poison > 0.8 ? 'hud-pulse' : ''}`}
                  style={{ width: `${Math.round(hud.poison * 100)}%`, backgroundColor: '#b04dff' }}
                />
              </div>
            </div>
          )}

          {/* 5-stage route progression + tree node path */}
          <div data-testid="tree-path" className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1" aria-label={`Rota: ${zoneLabel}`}>
              {ROUTE_STAGES.map((stage, idx) => (
                <div
                  key={stage.id}
                  title={stage.label}
                  className="h-[5px] w-5 sm:w-7"
                  style={{
                    backgroundColor:
                      idx < currentStageIdx
                        ? 'var(--hud-accent-dim)'
                        : idx === currentStageIdx
                          ? 'var(--hud-accent)'
                          : 'var(--hud-faint)',
                    boxShadow: '0 0 0 1px #000',
                  }}
                />
              ))}
            </div>
            {inTree && (
              <div className="flex items-center gap-[3px]" aria-label={`Profundidade ${hud.treeDepth}`}>
                {/* One notch per floor descended, reddening toward the bottom */}
                {Array.from({ length: Math.min(12, hud.treeDepth) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[5px] h-[9px]"
                    style={{
                      backgroundColor: i >= 5 ? '#ff2a10' : 'var(--hud-accent)',
                      opacity: 0.45 + (i / 12) * 0.55,
                      boxShadow: '0 0 0 1px #000',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top-right: bounty counter + utility buttons */}
        <div className="flex items-start gap-2 sm:gap-3 shrink-0">
          <div className="hud-panel px-2.5 py-2 sm:px-3.5 sm:py-2.5 flex flex-col items-end gap-1.5">
            <span className="hud-label">RECOMPENSA</span>
            <div data-testid="hud-score" className="hud-num text-base sm:text-[26px]">
              <ScoreDigits value={hud.score} />
            </div>
            <div className="flex items-baseline gap-1.5" aria-label={`Créditos ${hud.credits}`}>
              <span className="hud-label">CRÉDITOS</span>
              <span className="hud-num text-xs sm:text-sm hud-accent-text">¢{hud.credits}</span>
            </div>
            {hud.combo > 1 && (
              <div className="flex flex-col items-end gap-1 w-full">
                <div className="flex items-baseline gap-1.5">
                  <span className="hud-num text-sm sm:text-lg hud-accent-text">×{hud.combo}</span>
                  <span className="hud-label">CADEIA</span>
                </div>
                <div className="hud-track h-1 w-full">
                  <div className="hud-fill" style={{ width: pct(hud.comboTimerRatio) }} />
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleTouch();
              }}
              aria-label={touchEnabled ? 'Ocultar controles touch' : 'Mostrar controles touch'}
              title="Controles touch"
              data-active={touchEnabled}
              className="hud-btn w-7 h-7 sm:w-8 sm:h-8"
            >
              <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              aria-label={muted ? 'Ativar som [N]' : 'Silenciar [N]'}
              title={muted ? 'Ativar som [N]' : 'Silenciar [N]'}
              className="hud-btn w-7 h-7 sm:w-8 sm:h-8"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              aria-label="Reiniciar"
              title="Reiniciar"
              className="hud-btn w-7 h-7 sm:w-8 sm:h-8"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              aria-label="Pausar [P]"
              title="Pausar [P]"
              className="hud-btn w-7 h-7 sm:w-8 sm:h-8"
            >
              <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────── Top centre: hostiles left ─────────────── */}
      <div className="fixed top-2.5 sm:top-4 inset-x-0 flex justify-center pointer-events-none">
        <div className="hud-panel px-3.5 py-1.5 flex items-baseline gap-2" aria-label={`Hostis restantes ${hud.enemiesRemaining}`}>
          <span className="hud-label">HOSTIS</span>
          <span className="hud-num text-base sm:text-xl hud-accent-text">
            {hud.barricade ? '∞' : String(hud.enemiesRemaining).padStart(2, '0')}
          </span>
        </div>
      </div>

      <ZoneTitle zone={hud.zone} label={zoneLabel} />

      {/* ─────────────── Top center: boss / barricade / banners ─────────────── */}
      {/* Sits below the corner panels so it never collides with them on narrow screens */}
      <div className="fixed top-[104px] sm:top-[124px] inset-x-0 flex flex-col items-center gap-2 pointer-events-none px-4">
        {hud.boss && (
          <div
            data-testid="boss-hud"
            className="hud-panel hud-panel-danger w-full max-w-[280px] sm:max-w-[440px] px-3 py-2 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className={`hud-chip ${hud.boss.enraged ? 'hud-pulse' : ''}`}>
                  {hud.boss.enraged ? 'FÚRIA' : 'ALVO'}
                </span>
                <span className="hud-title text-[11px] sm:text-sm truncate">{hud.boss.name}</span>
              </span>
              <span className="hud-num text-[10px] sm:text-xs" style={{ color: 'var(--hud-muted)' }}>
                {Math.ceil(hud.boss.hp)}/{hud.boss.maxHp}
              </span>
            </div>
            <div className="hud-track hud-segments h-2.5" style={{ ['--seg' as string]: '10%' }}>
              {/* Damage trail: the chunk you just took off lingers in bone-white, then drains */}
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500 delay-300 ease-out"
                style={{ width: pct(hud.boss.hp / Math.max(1, hud.boss.maxHp)), backgroundColor: 'var(--hud-bone)' }}
              />
              <div
                className={`hud-fill relative transition-[width] duration-75 ${hud.boss.enraged ? 'hud-pulse' : ''}`}
                style={{ width: pct(hud.boss.hp / Math.max(1, hud.boss.maxHp)) }}
              />
            </div>
            {hud.boss.bossLine && (
              <div
                data-testid="boss-voice-line"
                className="font-mono-tabular text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-center italic"
                style={{ color: 'var(--hud-muted)' }}
              >
                “{hud.boss.bossLine}”
              </div>
            )}
          </div>
        )}

        {hud.barricade && (
          <div
            data-testid="barricade-hud"
            className="hud-panel w-full max-w-[300px] sm:max-w-[440px] px-3 py-2 flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-3 whitespace-nowrap">
              <span className="flex items-center gap-2 min-w-0">
                <span className="hud-chip">BARREIRA</span>
                <span className="hud-title text-[11px] sm:text-sm truncate">{hud.barricade.name}</span>
              </span>
              <span className="hud-num text-[10px] sm:text-xs" style={{ color: 'var(--hud-muted)' }}>
                {hud.barricade.planksLeft}/{hud.barricade.totalPlanks} TÁBUAS
              </span>
            </div>
            <div
              className="hud-track hud-segments h-2.5"
              style={{ ['--seg' as string]: `${100 / Math.max(1, hud.barricade.totalPlanks)}%` }}
            >
              <div
                className="h-full transition-[width] duration-75"
                style={{
                  width: pct(hud.barricade.hp / Math.max(1, hud.barricade.maxHp)),
                  backgroundColor: '#b0743f',
                }}
              />
            </div>
          </div>
        )}

        {hud.cutsceneText && (
          <div
            data-testid="cutscene-banner"
            className="hud-panel px-4 py-2.5 flex flex-col items-center gap-1.5 text-center max-w-[92vw]"
          >
            <span className="hud-title text-xs sm:text-base hud-accent-text">{hud.cutsceneText}</span>
            <span className="hud-label">
              <span className="hud-key mr-1.5">SPACE</span>PULAR
            </span>
          </div>
        )}

        {(hud.portalOpen || hud.vmGate) && (
          <div
            data-testid="portal-callout"
            className="hud-banner w-full max-w-[560px] hud-title text-[10px] sm:text-sm hud-accent-text whitespace-nowrap"
          >
            <span
              className="hud-pulse px-3 py-1.5"
              style={{ backgroundColor: 'var(--hud-panel)', boxShadow: '0 0 0 1px #000' }}
            >
              {hud.vmGate ? '↑ ENTRE NA SALA DO VM ↑' : PORTAL_LABELS[hud.zone]}
            </span>
          </div>
        )}

        {hud.waveBanner && !hud.boss && !hud.cutsceneText && (
          <div className="hud-banner w-full max-w-[560px] hud-title text-xs sm:text-base whitespace-nowrap">
            <span className="px-3 py-1.5" style={{ backgroundColor: 'var(--hud-panel)', boxShadow: '0 0 0 1px #000' }}>
              {hud.waveBanner}
            </span>
          </div>
        )}

        {hud.pickupBanner &&
          (() => {
            const matchedWeapon = (Object.keys(WEAPONS) as WeaponId[]).find((wId) =>
              hud.pickupBanner!.includes(WEAPONS[wId].shortName)
            );
            if (matchedWeapon) {
              const b = hud.pickupBanner;
              const actionBadge = b.startsWith('SUPERAQUECEU')
                ? 'RESFRIANDO'
                : b.startsWith('TROCOU')
                  ? 'TROCA'
                  : b.startsWith('RECARREGOU')
                    ? '+MUNIÇÃO'
                    : b.startsWith('RESERVA')
                      ? 'RESERVA'
                      : '+SLOT 2';
              return (
                <div
                  data-testid="pickup-banner"
                  className="hud-panel px-3 py-1.5 flex items-center gap-2.5"
                  aria-label={hud.pickupBanner}
                >
                  <span className="hud-chip">{actionBadge}</span>
                  <WeaponIcon weapon={matchedWeapon} className="w-12 h-6 shrink-0" />
                  <span className="hud-title text-[10px] sm:text-xs">{WEAPONS[matchedWeapon].shortName}</span>
                </div>
              );
            }
            return (
              <div className="hud-panel px-3 py-1.5 hud-title text-[10px] sm:text-xs hud-accent-text">
                {hud.pickupBanner}
              </div>
            );
          })()}

        {hud.newlyUnlockedSkin && (
          <div className="hud-panel px-3 py-1.5 flex items-center gap-2">
            <span className="hud-chip">SKIN</span>
            <span className="hud-title text-[10px] sm:text-xs">
              {SKIN_MAP[hud.newlyUnlockedSkin].name.toUpperCase()} DESBLOQUEADA
            </span>
          </div>
        )}
      </div>

      {/* ─────────────── VM's door ─────────────── */}
      {hud.vmPrompt && (
        <div className={`fixed left-1/2 -translate-x-1/2 pointer-events-auto ${touchEnabled ? 'bottom-64' : 'bottom-36'}`}>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTalkVm();
            }}
            className="hud-panel px-3.5 py-2 flex items-center gap-2.5 cursor-pointer"
            aria-label="Falar com VM [E]"
          >
            <span className="hud-key">E</span>
            <span className="hud-title text-xs sm:text-sm">FALAR COM VM</span>
          </button>
        </div>
      )}

      {/* ─────────────── Nearby pickup prompt ─────────────── */}
      {swapInfo && (
        <div
          data-testid="swap-prompt"
          className={`fixed left-1/2 -translate-x-1/2 ${
            swapInfo.requiresSwap ? 'pointer-events-auto' : 'pointer-events-none'
          } ${touchEnabled ? 'bottom-52' : 'bottom-24'}`}
        >
          {swapInfo.kind === 'med' ? (
            <div className="hud-panel px-3 py-1.5 flex items-center gap-2.5" aria-label="Kit médico +1 integridade">
              <MedKitIcon className="w-9 h-6" />
              <span className="hud-num text-sm" style={{ color: '#4dff7a' }}>
                +1
              </span>
            </div>
          ) : swapInfo.requiresSwap && swapInfo.weaponId && swapInfo.replacingWeaponId ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onSwapWeapon();
              }}
              aria-label={`Trocar ${WEAPONS[swapInfo.replacingWeaponId].shortName} por ${WEAPONS[swapInfo.weaponId].shortName} [E]`}
              className="hud-panel px-3 py-1.5 flex items-center gap-2.5 cursor-pointer"
            >
              <span className="hud-key">E</span>
              <WeaponIcon weapon={swapInfo.replacingWeaponId} dimmed className="w-10 h-5" />
              <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--hud-muted)' }} />
              <WeaponIcon weapon={swapInfo.weaponId} className="w-16 h-8" />
              <span className="hud-num text-xs hud-accent-text">+{swapInfo.ammo}</span>
            </button>
          ) : swapInfo.weaponId ? (
            <div
              className="hud-panel px-3 py-1.5 flex items-center gap-2.5"
              aria-label={`Item próximo: ${WEAPONS[swapInfo.weaponId].shortName}`}
            >
              <WeaponIcon weapon={swapInfo.weaponId} className="w-16 h-8" />
              <span className="hud-num text-xs hud-accent-text">+{swapInfo.ammo}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* ─────────────── Bottom-left: weapon loadout ─────────────── */}
      <div
        data-testid="weapon-strip"
        className={`fixed pointer-events-auto flex items-end gap-2 ${
          touchEnabled ? 'bottom-36 left-1/2 -translate-x-1/2' : 'bottom-4 left-4 sm:bottom-5 sm:left-5'
        }`}
      >
        {/* Active weapon */}
        <div
          data-testid={`weapon-btn-${hud.activeWeapon}`}
          className={`hud-panel ${heatMode === 'vent' ? 'hud-panel-danger' : ''} flex flex-col gap-2 px-2.5 py-2 ${
            touchEnabled ? 'w-[180px]' : 'w-[210px] sm:w-[250px]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="hud-key">{activeSlotIndex}</span>
              <span className="hud-title text-[11px] sm:text-sm truncate">{activeDef.shortName}</span>
            </span>
            <span className="hud-num text-lg sm:text-[26px] hud-accent-text">
              {activeAmmoFinite ? String(activeAmmo).padStart(2, '0') : '∞'}
            </span>
          </div>

          <WeaponIcon weapon={hud.activeWeapon} className={touchEnabled ? 'w-full h-14' : 'w-full h-20 sm:h-24'} />

          {activeAmmoFinite && (
            <div className="hud-track hud-segments h-[5px]" style={{ ['--seg' as string]: '5px' }}>
              <div className="hud-fill transition-[width] duration-75" style={{ width: pct(activeAmmoRatio) }} />
            </div>
          )}

          <div data-testid="weapon-heat-gauge" className="flex items-center gap-2">
            <span
              className={`hud-label w-[62px] shrink-0 ${heatMode === 'vent' || heatMode === 'cool' ? 'hud-pulse' : ''}`}
              style={{ color: heatMode === 'heat' ? undefined : heatColor }}
            >
              {heatLabel}
            </span>
            <div className="hud-track h-1 flex-1">
              <div
                className="h-full transition-[width] duration-75"
                style={{ width: pct(heatRatio), backgroundColor: heatColor }}
              />
            </div>
          </div>
        </div>

        {/* Secondary slot */}
        {secondaryOwned.map((wId) => {
          const w = WEAPONS[wId];
          const ammo = hud.ammo[wId];
          const slotNum = hud.ownedWeapons.indexOf(wId) + 1;
          const finite = Number.isFinite(ammo);
          return (
            <button
              key={wId}
              type="button"
              tabIndex={-1}
              data-testid={`weapon-btn-${wId}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectWeapon(wId);
              }}
              aria-label={`Equipar ${w.name} [${slotNum}]`}
              title={`${w.name} [Q / ${slotNum}]`}
              className="hud-panel flex flex-col gap-1.5 px-2.5 py-2 w-[124px] sm:w-[140px] cursor-pointer opacity-80 hover:opacity-100"
            >
              <div className="w-full flex items-center justify-between">
                <span className="hud-key">{slotNum}</span>
                <span className="hud-num text-[13px] sm:text-sm" style={{ color: 'var(--hud-muted)' }}>
                  {finite ? String(ammo).padStart(2, '0') : '∞'}
                </span>
              </div>
              <WeaponIcon weapon={wId} dimmed className="w-full h-10 sm:h-12" />
              {finite && (
                <div className="hud-track h-[3px] w-full">
                  <div
                    className="h-full"
                    style={{
                      width: pct(ammo / Math.max(1, w.maxAmmo)),
                      backgroundColor: 'var(--hud-muted)',
                    }}
                  />
                </div>
              )}
            </button>
          );
        })}

        {/* Active item (F): icon + charge (fills as you deal damage) */}
        {hud.activeItem && (
          <div className="hud-panel flex flex-col items-center gap-1 px-2 py-1.5 w-[64px]" title="Item ativo [F]">
            <div className="w-full flex items-center justify-between">
              <span className="hud-key">F</span>
              {hud.activeCharge >= 1 && <span className="hud-label hud-pulse" style={{ color: 'var(--hud-bone)' }}>OK</span>}
            </div>
            <div style={{ opacity: hud.activeCharge >= 1 ? 1 : 0.4 }}>
              <ItemIcon id={hud.activeItem} className="w-9 h-9" />
            </div>
            <div className="hud-track h-[3px] w-full">
              <div className="h-full" style={{ width: pct(hud.activeCharge), backgroundColor: hud.activeCharge >= 1 ? 'var(--hud-bone)' : 'var(--hud-faint)' }} />
            </div>
          </div>
        )}
      </div>

      {/* ─────────────── Bottom centre: dash (desktop) ─────────────── */}
      {!touchEnabled && (
        <div className="fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 w-[min(380px,52vw)] flex flex-col items-center gap-1.5 pointer-events-none" aria-label={hud.dashReadyRatio >= 1 ? 'Dash pronto' : 'Dash recarregando'}>
          <span className="flex items-center gap-1.5">
            <span className="hud-key">SPACE</span>
            <span className="hud-label" style={{ color: hud.dashReadyRatio >= 1 ? '#8fd0ff' : undefined }}>
              DASH
            </span>
          </span>
          <div className="hud-dash-track" data-ready={hud.dashReadyRatio >= 1}>
            <div className="hud-dash-fill" style={{ width: pct(hud.dashReadyRatio) }} />
          </div>
        </div>
      )}

      {/* Mobile / touch dual virtual joysticks */}
      {touchEnabled && (
        <TouchControls
          onMove={onTouchMove}
          onAim={onTouchAim}
          onDash={onDash}
          swapPrompt={
            swapInfo && swapInfo.requiresSwap && swapInfo.weaponId
              ? { weaponId: swapInfo.weaponId, label: WEAPONS[swapInfo.weaponId].shortName }
              : null
          }
          onSwap={onSwapWeapon}
        />
      )}
    </div>
  );
}
