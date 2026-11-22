import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { normalizeLeaderboardName, sortLeaderboard } from './src/game/rules';
import type { LeaderboardEntry, SkinId, WeaponId } from './src/game/types';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

const SEED_ENTRIES: LeaderboardEntry[] = [
  {
    id: 'seed-1',
    name: 'SUNDANCE',
    score: 14800,
    wave: 6,
    maxCombo: 11,
    weapon: 'rocket',
    skin: 'gold_desperado',
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: 'seed-2',
    name: 'VEX-94',
    score: 9650,
    wave: 5,
    maxCombo: 8,
    weapon: 'plasma',
    skin: 'cyan_marshal',
    createdAt: '2026-11-02T15:30:00.000Z',
  },
  {
    id: 'seed-3',
    name: 'KESTREL',
    score: 6420,
    wave: 4,
    maxCombo: 6,
    weapon: 'pistols',
    skin: 'acid_rattler',
    createdAt: '2026-11-03T18:45:00.000Z',
  },
  {
    id: 'seed-4',
    name: 'DUSTDEVIL',
    score: 3840,
    wave: 3,
    maxCombo: 5,
    weapon: 'plasma',
    skin: 'sunset',
    createdAt: '2026-11-04T20:10:00.000Z',
  },
  {
    id: 'seed-5',
    name: 'MIRA-X',
    score: 1920,
    wave: 2,
    maxCombo: 3,
    weapon: 'pistols',
    skin: 'sunset',
    createdAt: '2026-11-05T09:15:00.000Z',
  },
];

function readLeaderboard(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(SEED_ENTRIES, null, 2));
      return [...SEED_ENTRIES];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...SEED_ENTRIES];
    }
    return sortLeaderboard(parsed).slice(0, 15);
  } catch {
    return [...SEED_ENTRIES];
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = sortLeaderboard(entries).slice(0, 15);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(sorted, null, 2));
  return sorted;
}

const VALID_WEAPONS = new Set<WeaponId>([
  'pistol',
  'pistols',
  'shotgun',
  'plasma',
  'railgun',
  'rocket',
]);
const VALID_SKINS = new Set<SkinId>([
  'sunset',
  'cyan_marshal',
  'acid_rattler',
  'gold_desperado',
  'phantom_mesa',
]);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json());

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: readLeaderboard() });
  });

  app.post('/api/leaderboard', (req, res) => {
    const body = req.body as {
      name?: unknown;
      score?: unknown;
      wave?: unknown;
      maxCombo?: unknown;
      weapon?: unknown;
      skin?: unknown;
    };

    const name = typeof body.name === 'string' ? normalizeLeaderboardName(body.name) : null;
    if (!name) {
      res.status(400).json({ error: 'Enter a callsign between 2 and 12 characters.' });
      return;
    }

    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.max(0, Math.round(body.score)) : 0;
    const wave = typeof body.wave === 'number' && Number.isFinite(body.wave) ? Math.max(1, Math.round(body.wave)) : 1;
    const maxCombo =
      typeof body.maxCombo === 'number' && Number.isFinite(body.maxCombo) ? Math.max(0, Math.round(body.maxCombo)) : 0;
    const weapon: WeaponId =
      typeof body.weapon === 'string' && VALID_WEAPONS.has(body.weapon as WeaponId)
        ? (body.weapon as WeaponId)
        : 'pistols';
    const skin: SkinId =
      typeof body.skin === 'string' && VALID_SKINS.has(body.skin as SkinId)
        ? (body.skin as SkinId)
        : 'sunset';

    const current = readLeaderboard();
    const newEntry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      score,
      wave,
      maxCombo,
      weapon,
      skin,
      createdAt: new Date().toISOString(),
    };
    const updated = writeLeaderboard([...current, newEntry]);
    res.status(201).json({ entries: updated, entry: newEntry });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`cd /DataTree server running at http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Server boot error:', err);
  process.exit(1);
});
