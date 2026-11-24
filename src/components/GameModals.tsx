import { useState, type FormEvent } from 'react';
import { SKIN_MAP } from '../game/config';
import { DEFAULT_OPTIONS, type GameOptions } from '../game/options';
import type { RunSummary } from '../game/types';
import { PixelText } from './PixelText';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
  options: GameOptions;
  onChangeOptions: (next: GameOptions) => void;
  touchEnabled: boolean;
  onToggleTouch: () => void;
}

export function PauseModal({ onResume, onRestart, onQuitToTitle, options, onChangeOptions, touchEnabled, onToggleTouch }: PauseModalProps) {
  const [view, setView] = useState<'main' | 'options'>('main');
  const set = <K extends keyof GameOptions>(key: K, value: GameOptions[K]) => onChangeOptions({ ...options, [key]: value });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 px-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="px-window w-full max-w-[400px] flex flex-col">
        <div className="px-titlebar">
          <span>{view === 'main' ? 'sys // halt' : 'sys // config'}</span>
          <span className="px-blink">■</span>
        </div>

        {view === 'main' ? (
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
              <button type="button" onClick={() => setView('options')} className="px-btn w-full">
                Opções
              </button>
              <button type="button" onClick={onRestart} className="px-btn w-full">
                Reiniciar run
              </button>
              <button type="button" onClick={onQuitToTitle} className="px-btn w-full">
                Voltar ao título
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-5">
            <h2 id="pause-title">
              <PixelText text="OPÇÕES" size={32} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
            </h2>

            <section className="flex flex-col gap-3">
              <span className="px-label">Som</span>
              <OptionSlider label="Volume geral" value={options.masterVolume} onChange={(v) => set('masterVolume', v)} />
              <OptionSlider label="Música" value={options.musicVolume} onChange={(v) => set('musicVolume', v)} />
              <OptionSlider label="Efeitos" value={options.sfxVolume} onChange={(v) => set('sfxVolume', v)} />
            </section>

            <section className="flex flex-col gap-3">
              <span className="px-label">Tela</span>
              <OptionToggle label="Tremor de tela" on={options.screenShake} onChange={(v) => set('screenShake', v)} />
              <OptionSlider label="Estática" value={options.grain} onChange={(v) => set('grain', v)} />
            </section>

            <section className="flex flex-col gap-3">
              <span className="px-label">Controles</span>
              <OptionToggle label="Controles touch" on={touchEnabled} onChange={() => onToggleTouch()} />
            </section>

            <div className="flex gap-3">
              <button type="button" onClick={() => onChangeOptions({ ...DEFAULT_OPTIONS })} className="px-btn flex-1">
                Padrão
              </button>
              <button type="button" autoFocus onClick={() => setView('main')} className="px-btn px-btn-primary flex-1">
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[14px]">
      <span className="w-[110px] shrink-0 text-[var(--px-bone)]">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="opt-range flex-1"
      />
      <span className="w-[38px] text-right tabular-nums text-[var(--px-muted)]">{Math.round(value * 100)}</span>
    </label>
  );
}

function OptionToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-3 text-[14px] text-left" aria-pressed={on}>
      <span className="w-[110px] shrink-0 text-[var(--px-bone)]">{label}</span>
      <span className="opt-toggle" data-on={on}>
        <span />
      </span>
      <span className="text-[var(--px-muted)]">{on ? 'Ligado' : 'Desligado'}</span>
    </button>
  );
}

interface GameOverModalProps {
  summary: RunSummary;
  onPlayAgain: () => void;
  onOpenSkins: () => void;
  onOpenLeaderboard: () => void;
  onSubmitScore: (name: string) => Promise<void>;
  onQuitToTitle: () => void;
}

export function GameOverModal({ summary, onPlayAgain, onOpenSkins, onOpenLeaderboard, onSubmitScore, onQuitToTitle }: GameOverModalProps) {
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
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 px-backdrop gameover-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="gameover-title" className="px-window gameover-window w-full max-w-[460px] flex flex-col">
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
            <button type="button" onClick={onQuitToTitle} className="px-btn w-full">
              Menu principal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
