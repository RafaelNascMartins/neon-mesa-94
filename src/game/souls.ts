import type { VmItemId } from './types';

/**
 * Souls (archetypes): picked at the start of a run. Each soul has a base effect, and VM items
 * carry an archetype too — install SOUL_AWAKEN_COUNT items of your soul's archetype and the
 * soul awakens (stronger effect).
 *
 * To add a new archetype: add its id to SoulId and an entry in SOULS, draw its symbol in
 * components/SoulIcons.tsx, tag items in ITEM_ARCHETYPE, then hook its effect in engine.ts
 * (search for `soul ===`).
 */
export type SoulId = 'caos' | 'controle' | 'odio';

export interface SoulDef {
  id: SoulId;
  name: string;
  tagline: string;
  /** Effect from the start of the run. */
  base: string;
  /** Effect once awakened. */
  awakened: string;
  color: string;
}

export const SOUL_AWAKEN_COUNT = 3;

export const SOULS: SoulDef[] = [
  {
    id: 'caos',
    name: 'CAOS',
    tagline: 'Nada fica inteiro por muito tempo.',
    base: 'Abates têm 15% de chance de explodir e ferir quem está perto.',
    awakened: 'Explosões em 40% dos abates e seus tiros causam +15% de dano.',
    color: '#ed1c24',
  },
  {
    id: 'controle',
    name: 'CONTROLE',
    tagline: 'Tudo se move no seu ritmo.',
    base: 'Cada acerto desacelera o inimigo por 1s.',
    awakened: 'A cada 4 acertos no mesmo inimigo, ele trava por 0,8s (chefes não).',
    color: '#00a2e8',
  },
  {
    id: 'odio',
    name: 'ÓDIO',
    tagline: 'Cada ferida vira combustível.',
    base: 'Cada ponto de integridade perdido dá +8% de dano.',
    awakened: 'Ao levar um golpe, solta uma onda de sangue que fere todo mundo perto.',
    color: '#c0001f',
  },
];

export const SOUL_MAP: Record<SoulId, SoulDef> = Object.fromEntries(SOULS.map((s) => [s.id, s])) as Record<SoulId, SoulDef>;

/** Which archetype each VM item belongs to (items not listed are neutral). */
export const ITEM_ARCHETYPE: Partial<Record<VmItemId, SoulId>> = {
  // Caos: explosions, extra shots, bounces, reckless dashes
  volatile: 'caos',
  doubleTap: 'caos',
  fireAmmo: 'caos',
  pinball: 'caos',
  ricochet: 'caos',
  gunboots: 'caos',
  bomb: 'caos',
  dynamite: 'caos',
  // Controle: slows, stuns, steering, defense
  iceAmmo: 'controle',
  homing: 'controle',
  charm: 'controle',
  pacify: 'controle',
  pet: 'controle',
  firewall: 'controle',
  shades: 'controle',
  heatsink: 'controle',
  fatAmmo: 'controle',
  // Ódio: blood, pain, hitting back
  vampire: 'odio',
  scarf: 'odio',
  bladeDash: 'odio',
  ironSkin: 'odio',
  cell: 'odio',
  overclock: 'odio',
};

/** How many installed items match `soul`'s archetype. */
export function countSoulItems(soul: SoulId | null, items: Iterable<VmItemId>): number {
  if (!soul) return 0;
  let n = 0;
  for (const id of items) if (ITEM_ARCHETYPE[id] === soul) n += 1;
  return n;
}

export function isSoulAwakened(soul: SoulId | null, items: Iterable<VmItemId>): boolean {
  return countSoulItems(soul, items) >= SOUL_AWAKEN_COUNT;
}
