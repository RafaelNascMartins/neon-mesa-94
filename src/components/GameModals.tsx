import { useState, type FormEvent } from 'react';
import { SKIN_MAP } from '../game/config';
import type { RunSummary } from '../game/types';
import { PixelText } from './PixelText';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export function PauseModal({ onResume, onRestart, onQuitToTitle }: PauseModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 px-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="px-window w-full max-w-[360px] flex flex-col">
        <div className="px-titlebar">
          <span>sys // halt</span>
          <span className="px-blink">■</span>
        </div>

        <div className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 id="pause-title">
              <PixelText text="PAUSADO" size={40} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
            </h2>
            <p className="px-label">ESC ou P para continuar</p>
          </div>

          <div className="flex flex-col gap-3">
            <button type="button" autoFocus onClick={onResume} className="px-btn px-btn-primary w-full">
              Continuar
            </button>
            <button type="button" onClick={onRestart} className="px-btn w-full">
              Reiniciar run
            </button>
            <button type="button" onClick={onQuitToTitle} className="px-btn w-full">
              Voltar ao título
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface GameOverModalProps {
  summary: RunSummary;
  onPlayAgain: () => void;
  onOpenSkins: () => void;
  onOpenLeaderboard: () => void;
  onSubmitScore: (name: string) => Promise<void>;
}

export function GameOverModal({ summary, onPlayAgain, onOpenSkins, onOpenLeaderboard, onSubmitScore }: GameOverModalProps) {
  const [callsign, setCallsign] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmitScore(callsign);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const stats: [string, string, string][] = [
    ['Recompensa', summary.score.toLocaleString(), 'var(--px-accent)'],
    ['Profundidade', String(summary.treeDepth), 'var(--px-bone)'],
    ['Combo máx', `${summary.maxCombo}x`, 'var(--px-cyan)'],
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 px-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="gameover-title" className="px-window w-full max-w-[460px] flex flex-col">
        <div className="px-titlebar px-titlebar-danger">
          <span>process killed</span>
          <span>exit 137</span>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="gameover-title">
              <PixelText
                text="SINAL PERDIDO"
                size={45}
                pixel={3}
                tracking={1}
                color="#ff3b3b"
                shadows={[
                  { x: 1, y: 1, color: '#5a0d0d' },
                  { x: 2, y: 2, color: '#000' },
                ]}
              />
            </h2>
            <p className="font-terminal text-[20px] leading-tight text-[var(--px-muted)]">
              {summary.treeDepth > 0
                ? `> morreu na profundidade ${summary.treeDepth} da árvore`
                : `> caiu na onda ${summary.wave}, antes da árvore`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map(([label, value, color]) => (
              <div key={label} className="px-card px-2 py-3 flex flex-col items-center gap-2">
                <span className="px-label text-[10px]">{label}</span>
                <span className="text-[24px] leading-none tabular-nums px-shadow" style={{ color }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {summary.unlockedSkins.length > 0 && (
            <div className="px-card px-3 py-2.5 px-text text-[14px]" data-active="true">
              <span className="px-label mr-2" style={{ color: 'var(--px-accent)' }}>
                Skin nova
              </span>
              {summary.unlockedSkins.map((id) => SKIN_MAP[id].name).join(', ')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label htmlFor="callsign-input" className="px-label">
              Registrar no placar
            </label>
            <div className="flex items-center gap-3">
              <input
                id="callsign-input"
                type="text"
                maxLength={12}
                value={callsign}
                disabled={submitted}
                onChange={(e) => setCallsign(e.target.value)}
                placeholder="CODINOME"
                className="px-input flex-1"
              />
              <button type="submit" disabled={submitting || submitted} className="px-btn">
                {submitted ? 'Salvo' : submitting ? '...' : 'Salvar'}
              </button>
            </div>
            {submitError && <p className="text-[14px] text-[var(--px-danger)]">{submitError}</p>}
          </form>

          <div className="px-divider" />

          <div className="flex flex-col gap-3">
            <button type="button" data-start="true" onClick={onPlayAgain} className="px-btn px-btn-primary w-full">
              Jogar de novo
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onOpenSkins} className="px-btn">
                Skins
              </button>
              <button type="button" onClick={onOpenLeaderboard} className="px-btn">
                Placar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
