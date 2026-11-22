import { useEffect, useState } from 'react';
import { SKIN_MAP } from '../game/config';
import type { SkinId } from '../game/types';
import { PixelText } from './PixelText';

interface TitleScreenProps {
  bestScore: number;
  equippedSkin: SkinId;
  muted: boolean;
  assetsReady: boolean;
  /** False while a modal (skins / scores) sits on top: keyboard input belongs to it. */
  interactive: boolean;
  onStart: () => void;
  onOpenSkins: () => void;
  onOpenAchievements: () => void;
  onOpenLeaderboard: () => void;
  onToggleMute: () => void;
}

type ItemId = 'start' | 'skins' | 'achievements' | 'scores' | 'sound';

/**
 * Main menu: pixel logo, a keyboard-driven list (↑/↓ or W/S, Enter) with a ▶ cursor, the
 * record panel, and the controls strip. Sits over the live 3D scene behind a dark fade.
 */
export function TitleScreen({
  bestScore,
  equippedSkin,
  muted,
  assetsReady,
  interactive,
  onStart,
  onOpenSkins,
  onOpenAchievements,
  onOpenLeaderboard,
  onToggleMute,
}: TitleScreenProps) {
  const skin = SKIN_MAP[equippedSkin];
  const [selected, setSelected] = useState(0);
  // Logo scales in whole pixel blocks: 4px blocks on desktop, 2px on phones
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const logoPixel = narrow ? 2 : 4;
  const logoSize = narrow ? 44 : 88;

  const items: { id: ItemId; label: string; disabled?: boolean }[] = [
    { id: 'start', label: assetsReady ? 'Iniciar run' : 'Carregando...', disabled: !assetsReady },
    { id: 'skins', label: 'Skins' },
    { id: 'achievements', label: 'Conquistas' },
    { id: 'scores', label: 'Placar' },
    { id: 'sound', label: muted ? 'Som: desligado' : 'Som: ligado' },
  ];

  const activate = (id: ItemId) => {
    if (id === 'start') {
      if (assetsReady) onStart();
    } else if (id === 'skins') onOpenSkins();
    else if (id === 'achievements') onOpenAchievements();
    else if (id === 'scores') onOpenLeaderboard();
    else onToggleMute();
  };

  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        setSelected((s) => (s + 1) % items.length);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        setSelected((s) => (s + items.length - 1) % items.length);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        activate(items[selected].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-10 px-crt"
      style={{
        background:
          'linear-gradient(90deg, rgba(5,5,6,0.96) 0%, rgba(5,5,6,0.82) 34%, rgba(5,5,6,0.25) 64%, rgba(5,5,6,0) 80%)',
      }}
    >
      {/* Top strip */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="font-terminal text-[18px] sm:text-[20px] leading-none text-[var(--px-faint)]">
          DataTree OS 0.94 · tty1
        </div>
        <div className="px-window px-3 py-2 flex flex-col items-end gap-1">
          <span className="px-label">Recorde</span>
          <span className="text-[22px] leading-none text-[var(--px-bone)] px-shadow tabular-nums">
            {String(bestScore).padStart(7, '0')}
          </span>
          <span className="px-label" style={{ color: skin.swatchHex[0] }}>
            {skin.name}
          </span>
        </div>
      </div>

      {/* Logo + menu */}
      <div className="relative z-10 my-auto flex flex-col gap-7 max-w-[760px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="px-hazard w-10 h-3" aria-hidden="true" />
            <span className="px-label" style={{ color: 'var(--px-accent)' }}>
              Tiro top-down industrial
            </span>
          </div>
          <h1 className="flex items-end gap-3 whitespace-nowrap">
            <PixelText
              text="cd /DataTree"
              size={logoSize}
              pixel={logoPixel}
              bold
              tracking={1}
              color="#e9e4d8"
              shadows={[
                { x: 1, y: 1, color: '#8f0f12' },
                { x: 2, y: 2, color: '#000' },
              ]}
            />
            <span
              className="px-blink inline-block bg-[var(--px-accent)]"
              style={{ width: logoPixel * 7, height: logoPixel * 13, marginBottom: logoPixel * 3, boxShadow: `${logoPixel * 2}px ${logoPixel * 2}px 0 #000` }}
              aria-hidden="true"
            />
          </h1>
          <p className="font-terminal text-[22px] sm:text-[26px] leading-none text-[var(--px-muted)]">
            desça. mais. fundo.
          </p>
        </div>

        <nav className="flex flex-col gap-1.5 w-full max-w-[380px]" aria-label="Menu principal">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              data-start={it.id === 'start' ? 'true' : undefined}
              data-selected={selected === i}
              disabled={it.disabled}
              onMouseEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => activate(it.id)}
              className="px-menu-item"
            >
              <span className="px-cursor" aria-hidden="true">
                ▶
              </span>
              <PixelText
                text={it.label.toUpperCase()}
                size={28}
                pixel={2}
                tracking={1}
                color={selected === i ? '#0a0a0c' : '#8f897d'}
                shadows={selected === i ? [] : [{ x: 1, y: 1, color: '#000' }]}
              />
            </button>
          ))}
        </nav>
      </div>

      {/* Controls strip */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-[var(--px-muted)] px-shadow">
        {[
          ['WASD', 'mover'],
          ['MOUSE', 'mirar / atirar'],
          ['SPACE', 'dash'],
          ['E', 'pegar arma'],
          ['Q', 'trocar'],
        ].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="hud-key">{k}</span>
            {l}
          </span>
        ))}
        <span className="ml-auto font-terminal text-[18px] text-[var(--px-faint)]">v0.94</span>
      </div>
    </div>
  );
}
