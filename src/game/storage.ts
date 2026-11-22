import type { LeaderboardEntry, PlayerProgress, SkinId, WeaponId } from './types';

const PROGRESS_KEY = 'neon_mesa_94_progress_v1';

const DEFAULT_PROGRESS: PlayerProgress = {
  bestScore: 0,
  bestWave: 1,
  bestCombo: 0,
  totalKills: 0,
  equippedSkin: 'sunset',
  achievements: [],
  seenEnemies: [],
};

export function loadPlayerProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      bestWave: typeof parsed.bestWave === 'number' ? parsed.bestWave : 1,
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
      equippedSkin: (parsed.equippedSkin as SkinId) || 'sunset',
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.filter((a) => typeof a === 'string') : [],
      seenEnemies: Array.isArray(parsed.seenEnemies) ? parsed.seenEnemies.filter((a) => typeof a === 'string') : [],
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function savePlayerProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch('/api/leaderboard');
  if (!res.ok) {
    throw new Error(`Leaderboard load failed (${res.status})`);
  }
  const data = (await res.json()) as { entries: LeaderboardEntry[] };
  return data.entries;
}

export async function submitLeaderboardScore(payload: {
  name: string;
  score: number;
  wave: number;
  maxCombo: number;
  weapon: WeaponId;
  skin: SkinId;
}): Promise<LeaderboardEntry[]> {
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Score submit failed (${res.status})`);
  }
  const data = (await res.json()) as { entries: LeaderboardEntry[] };
  return data.entries;
}
