import { DEFAULT_GRAIN } from './ditherShader';

/** Player settings from the pause menu's Options screen (kept in localStorage). */
export interface GameOptions {
  /** 0..1 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Camera shake on hits / explosions. */
  screenShake: boolean;
  /** Film grain + scanlines, 0..1. */
  grain: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  screenShake: true,
  grain: DEFAULT_GRAIN,
};

const KEY = 'neon94.options';

export function loadOptions(): GameOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<GameOptions>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
    return {
      masterVolume: num(parsed.masterVolume, DEFAULT_OPTIONS.masterVolume),
      musicVolume: num(parsed.musicVolume, DEFAULT_OPTIONS.musicVolume),
      sfxVolume: num(parsed.sfxVolume, DEFAULT_OPTIONS.sfxVolume),
      screenShake: typeof parsed.screenShake === 'boolean' ? parsed.screenShake : DEFAULT_OPTIONS.screenShake,
      grain: num(parsed.grain, DEFAULT_OPTIONS.grain),
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(o: GameOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* private mode / storage off: settings just won't stick */
  }
}
