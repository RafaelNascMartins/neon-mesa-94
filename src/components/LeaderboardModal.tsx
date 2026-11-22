import { SKIN_MAP, WEAPONS } from '../game/config';
import type { LeaderboardEntry } from '../game/types';
import { PixelText } from './PixelText';

interface LeaderboardModalProps {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
}

export function LeaderboardModal({ entries, loading, error, onRefresh, onClose }: LeaderboardModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 px-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-dialog-title"
        className="px-window w-full max-w-[720px] max-h-[88vh] flex flex-col"
      >
        <div className="px-titlebar">
          <span>~/placar · sort -nr</span>
          <span>top {entries.length}</span>
        </div>

        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="leaderboard-dialog-title">
                <PixelText text="PLACAR" size={40} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
              </h2>
              <p className="px-label">Os mais procurados da árvore</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onRefresh} aria-label="Atualizar" className="px-btn px-icon-btn">
                <span className={loading ? 'px-blink' : undefined}>↻</span>
              </button>
              <button type="button" onClick={onClose} aria-label="Fechar" className="px-btn px-icon-btn">
                ✕
              </button>
            </div>
          </div>

          <div className="px-divider" />

          <div className="overflow-y-auto flex-1">
            {loading && entries.length === 0 ? (
              <div className="py-12 text-center font-terminal text-[22px] text-[var(--px-muted)]">
                lendo arquivo<span className="px-blink">_</span>
              </div>
            ) : error ? (
              <div className="py-10 text-center flex flex-col items-center gap-4">
                <p className="text-[16px] text-[var(--px-danger)]">{error}</p>
                <button type="button" onClick={onRefresh} className="px-btn px-btn-primary">
                  Tentar de novo
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center font-terminal text-[22px] text-[var(--px-muted)]">
                nenhum registro ainda. faça uma run.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="px-label text-[11px]">
                    <th className="py-2 pr-3 font-normal">#</th>
                    <th className="py-2 pr-3 font-normal">Codinome</th>
                    <th className="py-2 pr-3 font-normal">Arma · skin</th>
                    <th className="py-2 pr-3 font-normal text-right">Onda</th>
                    <th className="py-2 pr-3 font-normal text-right">Combo</th>
                    <th className="py-2 font-normal text-right">Pontos</th>
                  </tr>
                </thead>
                <tbody className="text-[16px] tabular-nums">
                  {entries.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className="px-shadow"
                      style={{
                        color: idx === 0 ? 'var(--px-accent)' : 'var(--px-bone)',
                        backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : undefined,
                      }}
                    >
                      <td className="py-2 pl-1 pr-3">{String(idx + 1).padStart(2, '0')}</td>
                      <td className="py-2 pr-3 uppercase">{entry.name}</td>
                      <td className="py-2 pr-3 text-[13px] text-[var(--px-muted)]">
                        {WEAPONS[entry.weapon]?.name ?? entry.weapon} · {SKIN_MAP[entry.skin]?.name ?? entry.skin}
                      </td>
                      <td className="py-2 pr-3 text-right">{entry.wave}</td>
                      <td className="py-2 pr-3 text-right" style={{ color: 'var(--px-cyan)' }}>
                        {entry.maxCombo}x
                      </td>
                      <td className="py-2 pr-1 text-right">{entry.score.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
