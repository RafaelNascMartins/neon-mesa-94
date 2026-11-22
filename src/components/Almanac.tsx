import { useCallback, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { AERO_ALMANAC, BOSS_ALMANAC, ENEMY_ALMANAC, type CreatureEntry } from '../game/almanac';
import { ITEM_LORE, WEAPON_LORE } from '../game/backpackLore';
import { VM_ITEMS, WEAPON_ORDER, WEAPONS } from '../game/config';
import type { VmItemId, WeaponId } from '../game/types';
import { CodeBlock, CodeIntro, highlight, ident } from './CodeText';
import { ModelPreview } from './ModelPreview';
import { ItemIcon, WeaponIcon } from './SvgIcons';

/**
 * The almanac, written like a code book: it boots by typing `almanaque: { … }`, every section
 * is a `const lista = [ … ]` and every entry a syntax-highlighted object. Highlighter bookmarks
 * on the edge pick the section — Inimigos (originals + aero blobs), Armas, Itens and, last, Chefes
 * (bigger cards). Creatures not met yet stay black silhouettes.
 */

type Tab = 'enemies' | 'weapons' | 'items' | 'bosses';

/** Every enemy in one list: the originals, then their Frutiger Aero blob versions. */
const ALL_ENEMIES: CreatureEntry[] = [...ENEMY_ALMANAC, ...AERO_ALMANAC];

const TABS: { id: Tab; label: string; code: string; color: string }[] = [
  { id: 'enemies', label: 'Inimigos', code: 'inimigos', color: '#ff5a5a' },
  { id: 'weapons', label: 'Armas', code: 'armas', color: '#ffb02e' },
  { id: 'items', label: 'Itens', code: 'itens', color: '#46d8ff' },
  { id: 'bosses', label: 'Chefes', code: 'chefes', color: '#c77dff' },
];

interface AlmanacProps {
  seen: string[];
  getTemplate: (id: string) => THREE.Object3D | null;
}

export function Almanac({ seen, getTemplate }: AlmanacProps) {
  const [tab, setTab] = useState<Tab>('enemies');
  const [booted, setBooted] = useState(false);
  const [sel, setSel] = useState<Record<Tab, string>>({
    enemies: ENEMY_ALMANAC[0].id,
    weapons: 'pistol',
    items: VM_ITEMS[0].id,
    bosses: BOSS_ALMANAC[0].id,
  });
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const templates = useMemo(() => new Map<string, THREE.Object3D | null>(), []);
  const tpl = (id: string) => {
    if (!templates.has(id)) templates.set(id, getTemplate(id));
    return templates.get(id) ?? null;
  };

  const cur = TABS.find((t) => t.id === tab)!;
  const choose = (id: string) => setSel((s) => ({ ...s, [tab]: id }));
  const known = (list: CreatureEntry[]) => list.filter((e) => seenSet.has(e.id)).length;
  const counts: Record<Tab, string> = {
    enemies: `${known(ALL_ENEMIES)}/${ALL_ENEMIES.length}`,
    weapons: `${WEAPON_ORDER.length}`,
    items: `${VM_ITEMS.length}`,
    bosses: `${known(BOSS_ALMANAC)}/${BOSS_ALMANAC.length}`,
  };

  const intro = useMemo(
    () =>
      [
        '> import almanaque from "./DataTree/almanaque.json"',
        'almanaque: {',
        ...TABS.map((t) => `  ${t.code}: [ ${counts[t.id]} ],`),
        '}',
      ].join('\n'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seen]
  );
  const onBooted = useCallback(() => setBooted(true), []);

  if (!booted) {
    return (
      <div className="almanac-boot">
        <CodeIntro code={intro} onDone={onBooted} />
      </div>
    );
  }

  const creatureList = tab === 'enemies' ? ALL_ENEMIES : tab === 'bosses' ? BOSS_ALMANAC : null;

  return (
    <div className="almanac-book ui-page" style={{ ['--tab' as string]: cur.color }}>
      <nav className="almanac-marks" aria-label="Seções do almanaque">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="almanac-mark" data-active={tab === t.id} style={{ ['--mark' as string]: t.color }} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            <span className="almanac-mark-count">{counts[t.id]}</span>
          </button>
        ))}
      </nav>

      <div className="almanac-pages">
        {/* Left page: the list, as an array literal */}
        <section className="almanac-page almanac-left" key={'list-' + tab}>
          <div className="code-line almanac-code-head">
            <span className="code-gutter">1</span>
            <span>{highlight(`const ${cur.code} = [`)}</span>
          </div>
          {tab === 'enemies' && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 almanac-indent">
              {creatureList!.map((c, i) => (
                <CreatureChip key={c.id} c={c} known={seenSet.has(c.id)} active={sel[tab] === c.id} index={i} onClick={() => choose(c.id)} />
              ))}
            </ul>
          )}
          {tab === 'weapons' && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 almanac-indent">
              {WEAPON_ORDER.map((w, i) => (
                <li key={w} className="almanac-in" style={{ animationDelay: `${i * 22}ms` }}>
                  <button type="button" className="px-card vm-card almanac-chip" data-active={sel.weapons === w} onClick={() => choose(w)}>
                    <WeaponIcon weapon={w} className="w-20 h-10" />
                    <span className="almanac-chip-name">{WEAPONS[w].shortName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'items' && (
            <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2 almanac-indent">
              {VM_ITEMS.map((it, i) => (
                <li key={it.id} className="almanac-in" style={{ animationDelay: `${i * 18}ms` }}>
                  <button type="button" title={it.name} className="px-card vm-card almanac-chip aspect-square" data-active={sel.items === it.id} onClick={() => choose(it.id)}>
                    <ItemIcon id={it.id} className="w-11 h-11" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'bosses' && (
            <ul className="flex flex-col gap-3 almanac-indent">
              {BOSS_ALMANAC.map((b, i) => {
                const k = seenSet.has(b.id);
                return (
                  <li key={b.id} className="almanac-in" style={{ animationDelay: `${i * 80}ms` }}>
                    <button type="button" className="px-card vm-card almanac-boss" data-active={sel.bosses === b.id} onClick={() => choose(b.id)} style={{ ['--swatch' as string]: b.color }}>
                      <div className="almanac-boss-art">
                        <ModelPreview template={tpl(b.id)} silhouette={!k} width={120} height={120} spin={0.5} />
                      </div>
                      <div className="flex flex-col gap-1.5 text-left min-w-0">
                        <span className="almanac-boss-name">{k ? b.name : '???'}</span>
                        <span className="text-[12px]" style={{ color: 'var(--px-muted)' }}>
                          {k ? b.habitat : 'Ainda não encontrado'}
                        </span>
                        <Threat n={k ? b.threat : 0} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="code-line">
            <span className="code-gutter">…</span>
            <span>{highlight('];')}</span>
          </div>
        </section>

        {/* Right page: the entry object */}
        <section className="almanac-page almanac-right" key={'entry-' + tab + sel[tab]}>
          {creatureList && (
            <CreatureEntryView c={creatureList.find((c) => c.id === sel[tab])!} known={seenSet.has(sel[tab])} big={tab === 'bosses'} template={tpl(sel[tab])} />
          )}
          {tab === 'weapons' && <WeaponEntryView id={sel.weapons as WeaponId} />}
          {tab === 'items' && <ItemEntryView id={sel.items as VmItemId} />}
        </section>
      </div>
    </div>
  );
}

function Threat({ n }: { n: number }) {
  return (
    <span className="almanac-threat" aria-label={`Ameaça ${n} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} data-on={i < n}>
          ☠
        </span>
      ))}
    </span>
  );
}

function CreatureChip({ c, known, active, index, onClick }: { c: CreatureEntry; known: boolean; active: boolean; index: number; onClick: () => void }) {
  return (
    <li className="almanac-in" style={{ animationDelay: `${index * 22}ms` }}>
      <button type="button" className="px-card vm-card almanac-chip" data-active={active} onClick={onClick}>
        <span className="almanac-swatch" style={{ background: known ? c.color : '#1a1820' }}>
          {known ? '' : '?'}
        </span>
        <span className="almanac-chip-name">{known ? c.name : '???'}</span>
      </button>
    </li>
  );
}

function CreatureEntryView({ c, known, big, template }: { c: CreatureEntry; known: boolean; big: boolean; template: THREE.Object3D | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="almanac-stage" style={{ ['--swatch' as string]: known ? c.color : '#333' }}>
        <div className="mx-auto" style={{ maxWidth: big ? 240 : 170 }}>
          <ModelPreview template={template} silhouette={!known} width={big ? 220 : 160} height={big ? 190 : 140} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="almanac-entry-title">{known ? c.name : '???'}</h3>
        <Threat n={known ? c.threat : 0} />
      </div>
      {known ? (
        <CodeBlock
          name={ident(c.name)}
          fields={[
            ['habitat', c.habitat],
            ['ameaca', c.threat],
            ['faz', c.what],
            ['dica', c.tip],
          ]}
          comment={c.joke}
        />
      ) : (
        <CodeBlock name="desconhecido" fields={[['status', 'undefined']]} comment="Desça mais fundo para preencher esta página." />
      )}
    </div>
  );
}

function WeaponEntryView({ id }: { id: WeaponId }) {
  const w = WEAPONS[id];
  const lore = WEAPON_LORE[id];
  return (
    <div className="flex flex-col gap-3">
      <div className="almanac-stage flex items-center justify-center py-6" style={{ ['--swatch' as string]: w.accentColor }}>
        <WeaponIcon weapon={id} className="w-44 h-20 almanac-float" />
      </div>
      <h3 className="almanac-entry-title">{w.name}</h3>
      <CodeBlock
        name={ident(w.shortName)}
        fields={[
          ['dano', w.melee ? w.damage : w.damage * Math.max(1, w.pellets)],
          ['municao', Number.isFinite(w.maxAmmo) ? w.maxAmmo : 'Infinity'],
          ['cadencia', w.fireInterval > 0 ? `${(1 / w.fireInterval).toFixed(1)}/s` : '—'],
          ['tipo', w.melee ? 'corpo a corpo' : w.splashRadius > 0 ? 'explosivo' : w.piercing ? 'perfurante' : 'projétil'],
          ['faz', lore.what],
        ]}
        comment={lore.joke}
      />
    </div>
  );
}

function ItemEntryView({ id }: { id: VmItemId }) {
  const def = VM_ITEMS.find((i) => i.id === id)!;
  return (
    <div className="flex flex-col gap-3">
      <div className="almanac-stage flex items-center justify-center py-6" style={{ ['--swatch' as string]: '#46d8ff' }}>
        <ItemIcon id={id} className="w-24 h-24 almanac-float" />
      </div>
      <h3 className="almanac-entry-title">{def.name}</h3>
      <CodeBlock
        name={ident(def.name)}
        fields={[
          ['tipo', def.kind === 'active' ? 'ativo [F]' : def.once ? 'passivo' : 'consumível'],
          ['preco', def.price],
          ['faz', def.desc],
        ]}
        comment={ITEM_LORE[id]}
      />
    </div>
  );
}
