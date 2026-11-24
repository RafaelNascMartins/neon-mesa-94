import { useCallback, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { ITEM_LORE, WEAPON_LORE } from '../game/backpackLore';
import { VM_ITEMS, WEAPONS } from '../game/config';
import type { BackpackState, VmItemId, WeaponId } from '../game/types';
import { Almanac } from './Almanac';
import { CodeIntro } from './CodeText';
import { PixelText } from './PixelText';
import { countSoulItems, SOUL_AWAKEN_COUNT, SOUL_MAP } from '../game/souls';
import { ItemArchetypeMark, SoulGlyph } from './SoulIcons';
import { ItemIcon, WeaponIcon } from './SvgIcons';

/**
 * Backpack (M): what you're carrying — equipped guns, the active item and every passive —
 * with a plain-words effect line and a joke for whatever's selected.
 */

type Entry = { kind: 'weapon'; id: WeaponId } | { kind: 'item'; id: VmItemId };

interface BackpackModalProps {
  state: BackpackState;
  getTemplate: (id: string) => THREE.Object3D | null;
  onClose: () => void;
}

export function BackpackModal({ state, getTemplate, onClose }: BackpackModalProps) {
  const [view, setView] = useState<'bag' | 'almanac'>('bag');
  const [booted, setBooted] = useState(false);
  const onBooted = useCallback(() => setBooted(true), []);
  // Opening the bag "prints" it as an object first
  const intro = useMemo(
    () =>
      [
        '> mochila.open()',
        'const mochila = {',
        `  armas: [${state.weapons.map((w) => w.id).join(', ')}],`,
        `  ativo: ${state.activeItem ?? 'null'},`,
        `  passivos: [${state.passives.join(', ')}],`,
        `  integridade: ${state.hp}/${state.maxHp},`,
        `  creditos: ${state.credits},`,
        '};',
      ].join('\n'),
    [state]
  );
  const first: Entry | null = state.weapons[0]
    ? { kind: 'weapon', id: state.weapons.find((w) => w.active)?.id ?? state.weapons[0].id }
    : null;
  const [sel, setSel] = useState<Entry | null>(first);

  const detail = (() => {
    if (!sel) return null;
    if (sel.kind === 'weapon') {
      const w = WEAPONS[sel.id];
      const lore = WEAPON_LORE[sel.id];
      return { title: w.name, what: lore.what, joke: lore.joke, icon: <WeaponIcon weapon={sel.id} className="w-28 h-16" /> };
    }
    const def = VM_ITEMS.find((i) => i.id === sel.id);
    return {
      title: def?.name ?? sel.id,
      what: def?.desc ?? '',
      joke: ITEM_LORE[sel.id] ?? '',
      icon: <ItemIcon id={sel.id} className="w-20 h-20" />,
    };
  })();

  const isSel = (e: Entry) => sel?.kind === e.kind && sel.id === e.id;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 px-backdrop ui-fade" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backpack-title"
        className="px-window w-full max-h-[90vh] flex flex-col ui-pop backpack-window"
        data-view={view}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-titlebar">
          <span>~/mochila</span>
          <span className="tabular-nums">
            integridade {state.hp}/{state.maxHp} · ¢{state.credits}
          </span>
        </div>

        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <h2 id="backpack-title">
              <PixelText text={view === 'bag' ? 'MOCHILA' : 'ALMANAQUE'} size={40} pixel={3} tracking={1} shadows={[{ x: 1, y: 1, color: '#000' }]} />
            </h2>
            <div className="bp-tabs" role="tablist" data-view={view}>
              <span className="bp-tabs-ink" aria-hidden="true" />
              <button type="button" role="tab" aria-selected={view === 'bag'} onClick={() => setView('bag')}>
                🎒 Mochila
              </button>
              <button type="button" role="tab" aria-selected={view === 'almanac'} onClick={() => setView('almanac')}>
                📖 Almanaque
              </button>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="px-btn px-icon-btn">
              ✕
            </button>
          </div>

          {!booted ? (
            <div className="almanac-boot">
              <CodeIntro code={intro} onDone={onBooted} speed={320} />
            </div>
          ) : view === 'almanac' ? (
            <div className="ui-page" key="almanac">
              <Almanac seen={state.seen} getTemplate={getTemplate} />
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 ui-page" key="bag">
            <div className="flex flex-col gap-4">
              {/* Equipped guns */}
              <section className="flex flex-col gap-2">
                <span className="px-label">Armas equipadas</span>
                <div className="grid grid-cols-2 gap-2">
                  {state.weapons.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSel({ kind: 'weapon', id: w.id })}
                      data-active={isSel({ kind: 'weapon', id: w.id })}
                      className="px-card vm-card flex flex-col items-center gap-1.5 p-2.5 text-center"
                    >
                      <WeaponIcon weapon={w.id} className="w-24 h-12" />
                      <span className="text-[14px] leading-none uppercase px-shadow">
                        {WEAPONS[w.id].shortName}
                        {w.active ? ' ◂' : ''}
                      </span>
                      <span className="text-[12px] tabular-nums" style={{ color: 'var(--px-muted)' }}>
                        {Number.isFinite(w.ammo) ? `${w.ammo}/${w.maxAmmo}` : '∞'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Active item */}
              <section className="flex flex-col gap-2">
                <span className="px-label">Item ativo [F]</span>
                {state.activeItem ? (
                  <button
                    type="button"
                    onClick={() => setSel({ kind: 'item', id: state.activeItem! })}
                    data-active={isSel({ kind: 'item', id: state.activeItem })}
                    className="px-card vm-card flex items-center gap-3 p-2.5 text-left"
                  >
                    <ItemIcon id={state.activeItem} className="w-10 h-10" />
                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-[14px] leading-none uppercase px-shadow">{VM_ITEMS.find((i) => i.id === state.activeItem)?.name}</span>
                      <div className="hud-track h-[4px] w-full">
                        <div className="h-full" style={{ width: `${Math.round(state.activeCharge * 100)}%`, backgroundColor: state.activeCharge >= 1 ? 'var(--px-accent)' : 'var(--px-muted)' }} />
                      </div>
                    </div>
                  </button>
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--px-muted)' }}>
                    Nenhum. O VM vende, os baús às vezes dão.
                  </p>
                )}
              </section>

              {/* Soul */}
              {state.soul && (
                <section className="flex flex-col gap-2">
                  <span className="px-label">Alma</span>
                  <div className="px-card flex items-center gap-3 p-2.5">
                    <SoulGlyph soul={state.soul} className="w-12 h-12 shrink-0" animate live glow={state.soulAwakened} />
                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-[14px] leading-none uppercase px-shadow" style={{ color: SOUL_MAP[state.soul].color }}>
                        {SOUL_MAP[state.soul].name} · {state.soulAwakened ? 'DESPERTA' : `${Math.min(SOUL_AWAKEN_COUNT, countSoulItems(state.soul, [...state.passives, ...(state.activeItem ? [state.activeItem] : [])]))}/${SOUL_AWAKEN_COUNT}`}
                      </span>
                      <span className="text-[12px] leading-tight" style={{ color: 'var(--px-muted)' }}>
                        {state.soulAwakened ? SOUL_MAP[state.soul].awakened : SOUL_MAP[state.soul].base}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Passives */}
              <section className="flex flex-col gap-2">
                <span className="px-label">Passivos ({state.passives.length})</span>
                {state.passives.length > 0 ? (
                  <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                    {state.passives.map((id) => (
                      <button
                        key={id}
                        type="button"
                        title={VM_ITEMS.find((i) => i.id === id)?.name}
                        onClick={() => setSel({ kind: 'item', id })}
                        data-active={isSel({ kind: 'item', id })}
                        className="px-card vm-card relative flex items-center justify-center p-1.5 aspect-square"
                      >
                        <ItemIcon id={id} className="w-9 h-9" />
                        <ItemArchetypeMark id={id} className="absolute top-0.5 right-0.5 w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--px-muted)' }}>
                    Mochila vazia. Só poeira e um chiclete velho.
                  </p>
                )}
              </section>
            </div>

            {/* Detail card */}
            <aside className="px-card p-4 flex flex-col items-center gap-3 text-center self-start ui-swap" key={sel ? sel.kind + sel.id : 'none'}>
              {detail ? (
                <>
                  <div className="h-24 flex items-center justify-center">{detail.icon}</div>
                  <h3 className="text-[18px] leading-none uppercase tracking-[0.04em] px-shadow">{detail.title}</h3>
                  <p className="text-[14px] leading-snug">{detail.what}</p>
                  {detail.joke && (
                    <p className="text-[13px] leading-snug italic" style={{ color: 'var(--px-muted)' }}>
                      “{detail.joke}”
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--px-muted)' }}>
                  Escolha algo para ver os detalhes.
                </p>
              )}
            </aside>
          </div>
          )}

          <p className="px-label text-center">M ou ESC para fechar</p>
        </div>
      </div>
    </div>
  );
}
