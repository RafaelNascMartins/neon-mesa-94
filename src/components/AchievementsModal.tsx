import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, achievementIconUrl } from '../game/achievements';
import { SKIN_MAP } from '../game/config';
import type { PlayerProgress } from '../game/types';
import { PixelText } from './PixelText';

interface AchievementsModalProps {
  progress: PlayerProgress;
  onClose: () => void;
}

/**
 * Main menu → Conquistas: every achievement, unlocked ones in full colour, locked ones greyed
 * out. Story achievements stay hidden ("???") until you've earned them.
 */
export function AchievementsModal({ progress, onClose }: AchievementsModalProps) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const owned = new Set(progress.achievements);
  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter((a) => owned.has(a.id)).length;
  // Earned first, then the visible goals, hidden story ones last
  const list = [...ACHIEVEMENTS].sort((a, b) => {
    const rank = (x: typeof a) => (owned.has(x.id) ? 0 : x.story ? 2 : 1);
    return rank(a) - rank(b);
  });

  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center p-4 px-backdrop ui-fade ${closing ? 'ui-out' : ''}`} onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ach-title"
        className={`px-window w-full max-w-[760px] max-h-[88vh] flex flex-col ui-pop ${closing ? 'ui-out' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-titlebar">
          <span>~/conquistas</span>
          <span className="tabular-nums">
            {got}/{total}
          </span>
        </div>
        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="ach-title">
                <PixelText text="CONQUISTAS" size={40} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
              </h2>
              <div className="hud-track h-[6px] w-[220px]" aria-hidden="true">
                <div className="h-full ach-bar" style={{ width: `${(got / total) * 100}%`, backgroundColor: '#ffd23f' }} />
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Fechar" className="px-btn px-icon-btn">
              ✕
            </button>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {list.map((a, i) => {
              const unlocked = owned.has(a.id);
              const hidden = a.story && !unlocked;
              const goal = a.goal && !unlocked ? Math.min(progress[a.goal.stat], a.goal.target) : null;
              return (
                <li
                  key={a.id}
                  className="px-card ach-card flex items-center gap-3 p-3"
                  data-unlocked={unlocked}
                  style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
                >
                  <div className="ach-icon shrink-0">
                    {hidden ? (
                      <span className="text-[26px] leading-none" style={{ color: 'var(--px-faint)' }}>
                        ?
                      </span>
                    ) : (
                      <img src={achievementIconUrl(a.id)} alt="" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="ach-card-title">{hidden ? '???' : a.title}</span>
                    <span className="text-[12px] leading-snug" style={{ color: 'var(--px-muted)' }}>
                      {hidden ? 'Uma conquista da história. Continue descendo...' : a.desc}
                    </span>
                    {goal !== null && a.goal && (
                      <div className="flex items-center gap-2">
                        <div className="hud-track h-[4px] flex-1">
                          <div className="h-full" style={{ width: `${(goal / a.goal.target) * 100}%`, backgroundColor: 'var(--px-accent)' }} />
                        </div>
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--px-muted)' }}>
                          {goal}/{a.goal.target}
                        </span>
                      </div>
                    )}
                    {a.skin && !hidden && (
                      <span className="text-[11px]" style={{ color: unlocked ? '#7dff9a' : 'var(--px-faint)' }}>
                        {unlocked ? '✓' : '🔒'} Skin: {SKIN_MAP[a.skin].name}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="px-label text-center">ESC para fechar</p>
        </div>
      </div>
    </div>
  );
}
