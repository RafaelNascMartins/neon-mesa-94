import { useState } from 'react';
import type * as THREE from 'three';
import { SKINS } from '../game/config';
import { getSkinUnlockProgress } from '../game/rules';
import type { PlayerProgress, SkinId } from '../game/types';
import { PixelText } from './PixelText';
import { SkinPreview } from './SkinPreview';

interface SkinsModalProps {
  progress: PlayerProgress;
  heroTemplate: THREE.Group | null;
  onSelectSkin: (skinId: SkinId) => void;
  onClose: () => void;
}

/** What each outfit actually is, piece by piece (shown under the turntable). */
const OUTFIT_DETAILS: Record<SkinId, string[]> = {
  sunset: ['Poncho carmim com listras creme', 'Cartucheira de couro com balas de latão', 'Lenço no pescoço, calça jeans e esporas'],
  cyan_marshal: ['Sobretudo azul longo com lapelas e capa nos ombros', 'Chapéu holográfico azul (dá pra ver através)', 'Estrela de xerife no peito'],
  acid_rattler: ['Tons de verde-veneno da cabeça às botas', 'Respirador com dois cartuchos tóxicos', 'Chocalho de cascavel no chapéu · pinga ácido verde'],
  gold_desperado: ['Ouro escovado no corpo todo: poncho, braços, chapéu e botas', 'Calça de couro marrom', 'Corrente com medalhão e esporas de ouro'],
  phantom_mesa: ['Roupa inteira preta, barra do poncho rasgada', 'Bandana cobrindo o rosto', 'Deixa um rastro de fumaça por onde anda'],
};

export function SkinsModal({ progress, heroTemplate, onSelectSkin, onClose }: SkinsModalProps) {
  const [viewing, setViewing] = useState<SkinId>(progress.equippedSkin);
  const skin = SKINS.find((s) => s.id === viewing) ?? SKINS[0];
  const status = getSkinUnlockProgress(skin.id, progress);
  const isEquipped = progress.equippedSkin === skin.id;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 px-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="skins-dialog-title" className="px-window w-full max-w-[860px] max-h-[90vh] flex flex-col">
        <div className="px-titlebar">
          <span>~/skins</span>
          <span>{progress.totalKills} abates</span>
        </div>

        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 id="skins-dialog-title">
                <PixelText text="SKINS" size={40} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
              </h2>
              <p className="px-label">
                Recorde {progress.bestScore.toLocaleString()} · onda {progress.bestWave} · combo {progress.bestCombo}x
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="px-btn px-icon-btn">
              ✕
            </button>
          </div>

          <div className="px-divider" />

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-5">
            {/* Turntable + details of the skin being viewed */}
            <div className="px-card p-4 grid grid-cols-[150px_1fr] sm:grid-cols-[200px_1fr] gap-4 items-start">
              <div className="bg-[#0b0a0c]" style={{ boxShadow: 'inset 0 0 0 2px #000' }}>
                <SkinPreview template={heroTemplate} skinId={skin.id} locked={!status.unlocked} />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[20px] leading-none uppercase tracking-[0.04em] px-shadow">{skin.name}</h3>
                  <div className="flex shrink-0" aria-hidden="true" style={{ boxShadow: '0 0 0 2px #000' }}>
                    {skin.swatchHex.map((hex, i) => (
                      <span key={i} className="w-3.5 h-3.5" style={{ backgroundColor: hex }} />
                    ))}
                  </div>
                </div>
                <p className="text-[14px] leading-tight text-[var(--px-muted)]">{skin.tagline}</p>
                <ul className="flex flex-col gap-1.5">
                  {OUTFIT_DETAILS[skin.id].map((line) => (
                    <li key={line} className="text-[13px] leading-snug flex gap-2">
                      <span style={{ color: 'var(--px-accent)' }}>▸</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-divider" />
                <span className="px-label text-[11px] leading-snug normal-case tracking-[0.06em]">
                  {status.unlocked ? skin.unlockText : status.label}
                </span>
                <button
                  type="button"
                  disabled={!status.unlocked || isEquipped}
                  onClick={() => onSelectSkin(skin.id)}
                  aria-label={isEquipped ? `${skin.name} equipada` : `Equipar ${skin.name}`}
                  className={`px-btn text-[14px] px-3 py-1.5 self-start ${isEquipped ? 'px-btn-primary' : ''}`}
                  style={isEquipped ? { opacity: 1, cursor: 'default' } : undefined}
                >
                  {isEquipped ? '✓ Ativa' : status.unlocked ? 'Equipar' : 'Bloqueada'}
                </button>
              </div>
            </div>

            {/* Skin list */}
            <div className="flex flex-col gap-2">
              {SKINS.map((s) => {
                const st = getSkinUnlockProgress(s.id, progress);
                const equipped = progress.equippedSkin === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-active={viewing === s.id}
                    onClick={() => setViewing(s.id)}
                    className="px-card vm-card flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    style={{ opacity: st.unlocked ? 1 : 0.55 }}
                  >
                    <span className="flex flex-col gap-1 min-w-0">
                      <span className="text-[15px] leading-none uppercase tracking-[0.04em] px-shadow">
                        {s.name}
                        {equipped ? ' ✓' : ''}
                      </span>
                      <span className="text-[11px] leading-none" style={{ color: 'var(--px-muted)' }}>
                        {st.unlocked ? 'Liberada' : '🔒 Bloqueada'}
                      </span>
                    </span>
                    <span className="flex shrink-0" aria-hidden="true" style={{ boxShadow: '0 0 0 2px #000' }}>
                      {s.swatchHex.map((hex, i) => (
                        <span key={i} className="w-3 h-3" style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
