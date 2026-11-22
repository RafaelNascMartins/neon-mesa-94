import type { SkinId } from './types';

/**
 * Achievements ("conquistas"). They pop up at the top of the screen with a jingle, and some of
 * them are how skins are earned now. Unlocked ids are saved in the player's progress.
 */

export type AchievementId =
  | 'first_blood'
  | 'kills_50'
  | 'kills_250'
  | 'combo_10'
  | 'faces_1'
  | 'faces_2'
  | 'bug'
  | 'rich'
  | 'chest'
  | 'pit'
  | 'aero';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  desc: string;
  /** Part of the story: hidden in the achievements list until unlocked (no spoilers). */
  story?: boolean;
  /** Skin granted when this unlocks. */
  skin?: SkinId;
  /** Lifetime counter goal (shown as progress on locked skins). */
  goal?: { stat: 'totalKills'; target: number };
  /** 12×12 pixel-art icon: rows of palette keys ('.' = empty). */
  icon: string[];
  palette: Record<string, string>;
}

const P = {
  k: '#0a0608',
  r: '#e0283a',
  R: '#8a0a18',
  w: '#f4ead8',
  y: '#ffd23f',
  o: '#ff8a1f',
  g: '#39ff6a',
  G: '#1f8f2c',
  c: '#46d8ff',
  C: '#1f4e8c',
  m: '#ff2bd6',
  s: '#9aa0a8',
  b: '#6a4428',
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_blood',
    title: 'Primeiro Sangue',
    desc: 'Mate o seu primeiro inimigo.',
    palette: P,
    icon: [
      '............',
      '.....rr.....',
      '....rrrr....',
      '...rrrrrr...',
      '...rrrrrr...',
      '..rrrrrrrr..',
      '..rrrrwrrr..',
      '..rrrrrwrr..',
      '..RrrrrrrR..',
      '...RrrrrR...',
      '....RRRR....',
      '............',
    ],
  },
  {
    id: 'kills_50',
    title: 'Exterminador de Pragas',
    desc: 'Mate 50 inimigos (somando todas as runs).',
    skin: 'cyan_marshal',
    goal: { stat: 'totalKills', target: 50 },
    palette: P,
    icon: [
      '............',
      '.....yy.....',
      '.....yy.....',
      '..yyyyyyyy..',
      '...yyyyyy...',
      '....yyyy....',
      '...yy..yy...',
      '..yy....yy..',
      '............',
      '..cccccccc..',
      '..CCCCCCCC..',
      '............',
    ],
  },
  {
    id: 'kills_250',
    title: 'Ceifador do Deserto',
    desc: 'Mate 250 inimigos (somando todas as runs).',
    goal: { stat: 'totalKills', target: 250 },
    palette: P,
    icon: [
      '..ssssss....',
      '.s......s...',
      '.........s..',
      '.........s..',
      '........bs..',
      '.......b....',
      '......b.....',
      '.....b......',
      '....b.......',
      '...b........',
      '..b.........',
      '............',
    ],
  },
  {
    id: 'combo_10',
    title: 'Combo Tóxico',
    desc: 'Faça um combo de 10x.',
    skin: 'acid_rattler',
    palette: P,
    icon: [
      '............',
      '....gggg....',
      '...gGGGGg...',
      '..gG.gg.Gg..',
      '..gGgggg.g..',
      '..gGgg...g..',
      '..gG.....g..',
      '..gG.gg..g..',
      '...gGggGg...',
      '....gggg....',
      '.....gg.....',
      '............',
    ],
  },
  {
    id: 'faces_1',
    title: 'Cem Faces, Zero Chances',
    story: true,
    desc: 'Derrube o Cem Faces pela primeira vez.',
    skin: 'gold_desperado',
    palette: P,
    icon: [
      '............',
      '..y..yy..y..',
      '..yy.yy.yy..',
      '..yyyyyyyy..',
      '..yyyyyyyy..',
      '...wwwwww...',
      '..wkwwwwkw..',
      '..wwwwwwww..',
      '..wwkkkkww..',
      '...wwwwww...',
      '....wwww....',
      '............',
    ],
  },
  {
    id: 'faces_2',
    title: 'E continue assim!',
    story: true,
    desc: 'Mate o Cem Faces... de novo.',
    skin: 'phantom_mesa',
    palette: P,
    icon: [
      '............',
      '....kkkk....',
      '...kssssk...',
      '..kssssssk..',
      '..ksrssrsk..',
      '..kssssssk..',
      '..kkkkkkkk..',
      '..kRRRRRRk..',
      '..kRkRRkRk..',
      '..kk.kk.kk..',
      '............',
      '............',
    ],
  },
  {
    id: 'bug',
    title: 'Debugger',
    desc: 'Capture um bug glitchado (vale muito crédito).',
    palette: P,
    icon: [
      '............',
      '...g....g...',
      '....g..g....',
      '.....gg.....',
      '..g.gggg.g..',
      '...gggmggg..',
      '..g.gggg.g..',
      '...gggggg...',
      '..g.gggg.g..',
      '.....gg.....',
      '............',
      '............',
    ],
  },
  {
    id: 'rich',
    title: 'Capitalista Selvagem',
    desc: 'Junte 400 créditos numa única run.',
    palette: P,
    icon: [
      '............',
      '....yyyy....',
      '...yooooy...',
      '..yoyyyyoy..',
      '..yoyooooy..',
      '..yoyyyyoy..',
      '..yooooyoy..',
      '..yoyyyyoy..',
      '...yooooy...',
      '....yyyy....',
      '............',
      '............',
    ],
  },
  {
    id: 'chest',
    title: 'Caixinha de Surpresas',
    desc: 'Abra um baú de sala.',
    palette: P,
    icon: [
      '............',
      '............',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '..yyyyyyyy..',
      '..bbbyybbb..',
      '..bbbyybbb..',
      '..bbbbbbbb..',
      '..bbbbbbbb..',
      '............',
      '............',
    ],
  },
  {
    id: 'pit',
    title: 'A Gravidade Venceu',
    desc: 'Caia num buraco. Acontece com todo mundo.',
    palette: P,
    icon: [
      '............',
      '.....ww.....',
      '.....ww.....',
      '....wwww....',
      '.....ww.....',
      '....w..w....',
      '............',
      '..kkkkkkkk..',
      '.kkkkkkkkkk.',
      '.kkkkkkkkkk.',
      '..kkkkkkkk..',
      '............',
    ],
  },
  {
    id: 'aero',
    title: 'Outro Jeito',
    story: true,
    desc: 'Alguém mexeu no código. Chegue ao mundo novo.',
    palette: P,
    icon: [
      '............',
      '....cccc....',
      '...cwwccc...',
      '..cwccccccc.',
      '..ccccccccc.',
      '..ccccccccc.',
      '...ccccccc..',
      '....ccccc...',
      '..gggggggg..',
      '.gGgGgGgGgg.',
      '............',
      '............',
    ],
  },
];

export const ACHIEVEMENT_MAP: Record<AchievementId, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a])
) as Record<AchievementId, AchievementDef>;

/** The achievement that grants a given skin (if any). */
export function achievementForSkin(skin: SkinId): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.skin === skin);
}

/** Paints an achievement icon to a cached data URL. */
const iconCache = new Map<string, string>();
export function achievementIconUrl(id: AchievementId): string {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const def = ACHIEVEMENT_MAP[id];
  const S = 6;
  const c = document.createElement('canvas');
  c.width = 12 * S;
  c.height = 12 * S;
  const ctx = c.getContext('2d')!;
  def.icon.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = def.palette[ch];
      if (!fill) return;
      ctx.fillStyle = fill;
      ctx.fillRect(x * S, y * S, S, S);
    });
  });
  const url = c.toDataURL('image/png');
  iconCache.set(id, url);
  return url;
}
