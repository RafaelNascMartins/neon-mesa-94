import type { ArenaZone, TreeSubBiome, WeaponId } from './types';

/**
 * Procedural heavy-industrial soundtrack + SFX engine.
 * Zero external audio files: everything is synthesised live on the Web Audio API.
 *
 * Signal flow:
 *   music voices ─┬─────────────────────▶ musicGain ─┐
 *                 └─▶ musicVerb (conv) ──▶ musicGain │
 *   sfx voices   ─┬─────────────────────▶ sfxGain ───┼─▶ masterGain ─▶ compressor ─▶ out
 *                 └─▶ sfxVerb (conv) ────▶ sfxGain ──┘
 */

type MusicScene = 'road' | 'desert' | 'cemetery' | 'clearing' | 'tree_mega' | 'tree_hybrid' | 'tree_wire';

interface SceneMix {
  root: number; // MIDI note of the guitar riff root (E2 = 40)
  guitar: number; // riff level multiplier
  guitarTone: number; // base cabinet low-pass cutoff (Hz)
  drone: number;
  hats: number;
  metal: number; // pipe-clang hit level
  arp: number; // glitch FM arpeggio level (cyber floors)
  snare: number;
  kick: number;
  whisperBars: [number, number]; // min / max bars between whisper phrases
  whisperGain: number;
  whisperVoices: number; // overlapping whisperers per phrase
  trackLevel: number; // level of the recorded soundtrack in this area
  trackCutoff: number; // low-pass on the recorded soundtrack (Hz) — muffles it in eerie areas
}

const SCENES: Record<MusicScene, SceneMix> = {
  road: { root: 40, guitar: 0.55, guitarTone: 1300, drone: 0.8, hats: 0.6, metal: 0.4, arp: 0, snare: 0.8, kick: 1, whisperBars: [6, 9], whisperGain: 0.8, whisperVoices: 1, trackLevel: 0.85, trackCutoff: 9000 },
  desert: { root: 40, guitar: 1, guitarTone: 1900, drone: 0.7, hats: 0.9, metal: 0.6, arp: 0, snare: 1, kick: 1, whisperBars: [5, 8], whisperGain: 0.85, whisperVoices: 1, trackLevel: 1, trackCutoff: 20000 },
  cemetery: { root: 37, guitar: 0.7, guitarTone: 1400, drone: 1.25, hats: 0.5, metal: 0.5, arp: 0, snare: 0.9, kick: 0.95, whisperBars: [2, 4], whisperGain: 1.15, whisperVoices: 3, trackLevel: 0.85, trackCutoff: 850 },
  clearing: { root: 38, guitar: 1, guitarTone: 2200, drone: 0.9, hats: 0.8, metal: 1, arp: 0, snare: 1, kick: 1.05, whisperBars: [3, 5], whisperGain: 1, whisperVoices: 2, trackLevel: 1, trackCutoff: 20000 },
  tree_mega: { root: 38, guitar: 1, guitarTone: 2000, drone: 1, hats: 0.8, metal: 1.3, arp: 0.2, snare: 1, kick: 1.05, whisperBars: [3, 5], whisperGain: 1, whisperVoices: 2, trackLevel: 0.95, trackCutoff: 4200 },
  tree_hybrid: { root: 39, guitar: 0.95, guitarTone: 2200, drone: 0.9, hats: 0.9, metal: 1, arp: 0.55, snare: 1, kick: 1.05, whisperBars: [2, 4], whisperGain: 1, whisperVoices: 2, trackLevel: 1, trackCutoff: 9000 },
  tree_wire: { root: 41, guitar: 0.85, guitarTone: 2400, drone: 0.8, hats: 1, metal: 0.6, arp: 1, snare: 1, kick: 1, whisperBars: [2, 4], whisperGain: 1.05, whisperVoices: 3, trackLevel: 1, trackCutoff: 20000 },
};

// Recorded assets (served from /public)
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/aistudio/`;
const TRACK_URL = `${ASSET_BASE}top_sue-industrial-metal-465166.mp3`;
const BOSS_VOICE_URLS = {
  reboot: `${ASSET_BASE}cemFaces_fight1/flesh-pre-par-to-be-rebooted.mp3`,
  everywhere: `${ASSET_BASE}cemFaces_fight1/you-can-t-kill-me-i-m-everywhere.mp3`,
} as const;
type BossVoiceClip = keyof typeof BOSS_VOICE_URLS;
const BOSS_TRACK_URL = `${ASSET_BASE}cemFaces_fight1/psychronic-killer-acid-rain-407862.mp3`;

// Cem Faces, second coming (fight 2): track, scream, and his two lines cut word by word.
// `end` trims each clip's trailing silence so the words run together naturally.
const BOSS2_DIR = `${ASSET_BASE}cemFaces_fight2/`;
const BOSS2_TRACK_URL = `${BOSS2_DIR}aberrantrealities-didgeriduel-303807.mp3`;
const ROBOT_SCREAM_URL = `${BOSS2_DIR}freesound_community-047571_glitchy-robot-scream-64943.mp3`;
const ROBOT_SCREAM_LEN = 1.5; // the scream itself; the file trails off into silence
// His dying scream ("robotic scream 3"): ~7.85 s, he detonates as it ends
const DEATH_SCREAM_URL = `${BOSS2_DIR}freesound_community-robotic-scream-3-103696.mp3`;
export const DEATH_SCREAM_LEN = 7.85;
const BOSS2_CLIPS = {
  whatDidISaid: { url: `${BOSS2_DIR}what-did-i-said.mp3`, end: 2.08, gap: 0.12 },
  you: { url: `${BOSS2_DIR}you.mp3`, end: 0.38, gap: 0.05 },
  fucking: { url: `${BOSS2_DIR}fucking.mp3`, end: 0.82, gap: 0.05 },
  org: { url: `${BOSS2_DIR}org.mp3`, end: 0.5, gap: 0 },
  anic: { url: `${BOSS2_DIR}anic.mp3`, end: 0.62, gap: 0.05 },
  i: { url: `${BOSS2_DIR}i.mp3`, end: 0.27, gap: 0.06 },
  will: { url: `${BOSS2_DIR}will.mp3`, end: 0.52, gap: 0.06 },
  splash: { url: `${BOSS2_DIR}splash.mp3`, end: 0.78, gap: 0.06 },
  you2: { url: `${BOSS2_DIR}you.mp3`, end: 0.38, gap: 0.06 },
  like: { url: `${BOSS2_DIR}like.mp3`, end: 0.47, gap: 0.04 },
  a: { url: `${BOSS2_DIR}a.mp3`, end: 0.27, gap: 0.04 },
  bug: { url: `${BOSS2_DIR}bug.mp3`, end: 0.55, gap: 0 },
} as const;
export type Boss2Clip = keyof typeof BOSS2_CLIPS;
export const BOSS2_LINE_1: Boss2Clip[] = ['whatDidISaid', 'you', 'fucking', 'org', 'anic'];
export const BOSS2_LINE_2: Boss2Clip[] = ['i', 'will', 'splash', 'you2', 'like', 'a', 'bug'];
const ACHIEVEMENT_URL = `${ASSET_BASE}achivment.mp3`;
/** Soul symbols: each plays as its symbol assembles (see playSoulForm). */
export type SoulSound = 'caos' | 'controle' | 'odio';
const SOUL_SOUND_URLS: Record<SoulSound, string> = {
  caos: `${ASSET_BASE}caos.mp3`,
  controle: `${ASSET_BASE}controle.mp3`,
  odio: `${ASSET_BASE}odio.mp3`,
};
/**
 * odio.mp3 beats steadily (~1/s) until ~7.4s, then races. Looping 4 steady beats keeps it calm:
 * both points sit in the same quiet gap just before a beat, so the seam doesn't click.
 */
const ODIO_LOOP = { start: 2.505, end: 6.451 };
/** One-shot clips for the endings. */
/** A playing ending clip: call it to stop (with a fade); `fadeTo` glides its volume. */
export type EndingClip = ((fadeSec?: number) => void) & { fadeTo(gain: number, sec: number): void };

export type EndingSample = 'cowboyTalk' | 'pcReboot' | 'pcBootUp' | 'maskFall' | 'chomp' | 'finalScene' | 'deathShatter' | 'youDied' | 'carEngine' | 'carImpact' | 'torch' | 'judge' | 'pistol' | 'judgeShot' | 'bossSteps' | 'shotgunShot' | 'shotgunRack' | 'coiceShot' | 'crossbow' | 'health' | 'gate' | 'bazooka' | 'slash1' | 'slash2' | 'nails' | 'hammerHit' | 'hammerWhiff' | 'shotgunNew1' | 'shotgunNew2' | 'cd1' | 'cd2' | 'chainLoop' | 'facesLoop';
const ENDING_SAMPLE_URLS: Record<EndingSample, string> = {
  cowboyTalk: `${ASSET_BASE}cowboy_falando.mp3`,
  pcReboot: `${ASSET_BASE}pc_reiniciando.mp3`,
  pcBootUp: `${ASSET_BASE}pc_religando.mp3`,
  maskFall: `${ASSET_BASE}mascara_caindo.mp3`,
  chomp: `${ASSET_BASE}chomp.mp3`,
  finalScene: `${ASSET_BASE}final_scene.mp3`,
  deathShatter: `${ASSET_BASE}morte.mp3`, // glass breaking: the player dies
  youDied: `${ASSET_BASE}youdied.mp3`, // the death screen's music
  carEngine: `${ASSET_BASE}car_engine.mp3`, // the Mustang in the opening (9.4 s, the whole cutscene)
  carImpact: `${ASSET_BASE}cutscene_impact.mp3`, // a bandit going under the Mustang
  torch: `${ASSET_BASE}ma%C3%A7arico.mp3`, // the Maçarico's roar, looped while the trigger is held
  judge: `${ASSET_BASE}judge.mp3`, // the Juiz: every loaded round is ready
  pistol: `${ASSET_BASE}pistola.mp3`, // the Peacemaker's shot
  judgeShot: `${ASSET_BASE}judge_atirando.mp3`, // one of the Juiz's cocked rounds going off
  bossSteps: `${ASSET_BASE}passos_cem_faces.mp3`, // Cem Faces' legs: 10 steps, one every 0.5 s
  shotgunShot: `${ASSET_BASE}escopeta.mp3`,
  shotgunRack: `${ASSET_BASE}escopeta_pickup_ou_equipando.mp3`, // picking up / equipping the shotgun
  coiceShot: `${ASSET_BASE}coice.mp3`,
  crossbow: `${ASSET_BASE}crossbow.mp3`,
  health: `${ASSET_BASE}health_pickup.mp3`,
  gate: `${ASSET_BASE}portao_fechando.mp3`, // the cemetery gate (closing and opening)
  bazooka: `${ASSET_BASE}bazooka.mp3`, // only its first second is used (the rest is the blast)
  slash1: `${ASSET_BASE}slash_1.mp3`,
  slash2: `${ASSET_BASE}slash_2.mp3`,
  nails: `${ASSET_BASE}arma_de_pregos.mp3`, // 8 takes of the nail gun, see NAIL_TAKES
  hammerHit: `${ASSET_BASE}marreta.mp3`,
  hammerWhiff: `${ASSET_BASE}marreta_swing_no_ar.mp3`,
  shotgunNew1: `${ASSET_BASE}escopeta_nova1.mp3`,
  shotgunNew2: `${ASSET_BASE}escopeta_nova2.mp3`,
  cd1: `${ASSET_BASE}cd_1.mp3`,
  cd2: `${ASSET_BASE}cd_2.mp3`,
  chainLoop: `${ASSET_BASE}corrente.mp3`, // the held lightning (looped over its steady stretch)
  facesLoop: `${ASSET_BASE}faces.mp3`, // the Canhão de Faces pouring out faces (looped, made robotic)
};
/** Where each take of the nail gun starts in its clip (s). */
const NAIL_TAKES = [0.7, 3.9, 6.4, 8.63, 9.99, 11.62, 13.19, 15.02];
// The Frutiger Aero world after "trying another way": a sunny deep house loop
const AERO_TRACK_URL = `${ASSET_BASE}aurec-deep-house-577898.mp3`;
const VM_TRACK_URL = `${ASSET_BASE}VM/musinova-ambient-minimal-techno-background-drumless-ambient-loop-538527.mp3`;

// VM (vending-machine merchant) voice clips
const VM_CLIP_URLS = {
  sup: `${ASSET_BASE}VM/sup.mp3`,
  wanna: `${ASSET_BASE}VM/wanna-buy-some-thing.mp3`,
  what: `${ASSET_BASE}VM/what.mp3`,
  myName: `${ASSET_BASE}VM/my-name.mp3`,
  its: `${ASSET_BASE}VM/${encodeURIComponent('it-s (1).mp3')}`,
  vi: `${ASSET_BASE}VM/vi.mp3`,
  em: `${ASSET_BASE}VM/em.mp3`,
  dunno: `${ASSET_BASE}VM/i-don-t-know-i-wasnt-programmed-to.mp3`,
  yeah: `${ASSET_BASE}VM/yeah.mp3`,
  no: `${ASSET_BASE}VM/no.mp3`,
  thanks: `${ASSET_BASE}VM/thanks-for-the-credits-organic.mp3`,
  hey: `${ASSET_BASE}VM/hey.mp3`,
  wasThatYou: `${ASSET_BASE}VM/was-that-you.mp3`,
  tookDown: `${ASSET_BASE}VM/that-took-down-the-big-guy.mp3`,
  props: `${ASSET_BASE}VM/yeah-props-to-you-flesh.mp3`,
  now: `${ASSET_BASE}VM/now.mp3`,
  hes: `${ASSET_BASE}VM/he-s.mp3`,
  mad: `${ASSET_BASE}VM/mad.mp3`,
  duh: `${ASSET_BASE}VM/duh.mp3`,
  ofCourse: `${ASSET_BASE}VM/of-cours.mp3`,
} as const;
export type VmClip = keyof typeof VM_CLIP_URLS;

const TRACK_XFADE = 0.25; // seconds of overlap at the loop seam
const TRACK_LOOP_START = 10; // skip the quiet intro on repeats

// Equal-power crossfade curves for the loop seam
const XFADE_CURVES = (() => {
  const n = 32;
  const fadeIn = new Float32Array(new ArrayBuffer(n * 4));
  const fadeOut = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    fadeIn[i] = Math.sin((t * Math.PI) / 2);
    fadeOut[i] = Math.cos((t * Math.PI) / 2);
  }
  return { fadeIn, fadeOut };
})();

/**
 * Finds a loop end whose rhythm best matches the material right after `startSec`, by
 * correlating onset envelopes. Lets the track repeat from `startSec` without a beat jump.
 */
function findLoopEnd(buf: AudioBuffer, startSec: number): { end: number; score: number } {
  const sr = buf.sampleRate;
  const hop = 512;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const frames = Math.floor(buf.length / hop);
  const onset = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      let s = 0;
      for (const ch of chans) s += ch[i];
      e += s * s;
    }
    e = Math.sqrt(e / hop);
    onset[f] = Math.max(0, e - prev);
    prev = e;
  }

  const win = Math.round((6 * sr) / hop);
  const s0 = Math.round((startSec * sr) / hop);
  const lo = Math.round(((buf.duration - 16) * sr) / hop);
  const hi = Math.min(frames - win - 1, Math.round(((buf.duration - 3) * sr) / hop));
  let normA = 0;
  for (let k = 0; k < win; k++) normA += onset[s0 + k] * onset[s0 + k];

  let best = hi;
  let bestScore = -1;
  for (let j = lo; j <= hi; j++) {
    let dot = 0;
    let normB = 0;
    for (let k = 0; k < win; k++) {
      dot += onset[s0 + k] * onset[j + k];
      normB += onset[j + k] * onset[j + k];
    }
    const score = dot / (Math.sqrt(normA * normB) || 1);
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  return { end: (best * hop) / sr, score: bestScore };
}

const BPM = 112;
const STEP_DUR = 60 / BPM / 4; // 16th notes

// 4-bar patterns, one char per 16th step.
// Guitar: '.' rest · 'x' palm-muted chug · 'A' open power chord · 'b' +1 (♭2) · 'c' +3 · 'f' +6 (tritone)
const GUITAR = ['A..x.xx.A..x.xb.', 'A..x.xx.A..x.c.f', 'A..x.xx.A..x.xb.', 'c..x.xxbb..x.xxx'];
const GUITAR_OFFSETS: Record<string, number> = { x: 0, A: 0, b: 1, c: 3, f: 6 };
const KICK = ['k..k....k.k.....', 'k..k....k.k...k.', 'k..k....k.k.....', 'k..k....k.k.k.kk'];
const SNARE = ['....s.......s...', '....s.......s...', '....s.......s...', '....s.......s.ss'];
const HATS = 'h.h.h.o.h.h.h.o.';
const METAL = ['................', '..........m.....', '................', '......m...m.....'];
const ARP = [12, 15, 19, 24, 22, 19, 15, 13];

// Unvoiced vowel formants (F1, F2, F3 in Hz) used to shape noise into whispers.
const VOWELS: [number, number, number][] = [
  [270, 2290, 3010], // i
  [390, 1990, 2550], // e
  [530, 1840, 2480], // ɛ
  [730, 1090, 2440], // a
  [570, 840, 2410], // ɔ
  [440, 1020, 2240], // o
  [300, 870, 2240], // u
];

interface WhisperSyllable {
  vowel: [number, number, number];
  dur: number;
  consonant: number | null; // hiss centre frequency, or null for a bare vowel
  gap: number;
}

class SynthAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicVerb: GainNode | null = null;
  private musicSlowMoFilter: BiquadFilterNode | null = null;
  private lastCasingTinkAt = 0;

  // Bass-energy tap on the music bus (drives the rave lights)
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bassAvg = 0;
  private pulse = 0;
  private sfxVerb: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private crusherCurve: Float32Array<ArrayBuffer> | null = null;
  private driveCurve: Float32Array<ArrayBuffer> | null = null;
  private lastBossVoiceAt = 0;

  private muted = false;
  private musicPlaying = false;
  private musicPaused = false;
  private comboIntensity = 0;
  private stepIndex = 0;
  private nextStepTime = 0;
  private timerId: number | null = null;
  private scene: MusicScene = 'road';
  private barsUntilWhisper = 2;

  // Recorded soundtrack + boss voice clips
  private trackState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private trackBuffer: AudioBuffer | null = null;
  private trackLoopEnd = 0;
  private trackBus: GainNode | null = null;
  private trackFilter: BiquadFilterNode | null = null;
  private trackSources: AudioBufferSourceNode[] = [];
  private trackNextAt = 0;
  private trackFirst = true;
  private voiceBuffers: Partial<Record<BossVoiceClip, AudioBuffer>> = {};
  private activeVoice: AudioBufferSourceNode | null = null;
  private activeVoiceEndsAt = 0;

  // Boss fight music (replaces the main soundtrack during Cem Faces)
  private mainMute: GainNode | null = null;
  private bossTrackBuffer: AudioBuffer | null = null;
  private boss2TrackBuffer: AudioBuffer | null = null;
  private boss2Buffers: Partial<Record<Boss2Clip, AudioBuffer>> = {};
  private boss2Loading: Promise<void> | null = null;
  private screamBuffer: AudioBuffer | null = null;
  private deathScreamBuffer: AudioBuffer | null = null;
  private deathScreamSrc: AudioBufferSourceNode | null = null;
  private dread: { nodes: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  private flame: { srcs: AudioBufferSourceNode[]; gain: GainNode } | null = null;
  private huskFire: { srcs: AudioBufferSourceNode[]; gain: GainNode } | null = null;
  private bossTrackSource: AudioBufferSourceNode | null = null;
  private bossTrackGain: GainNode | null = null;
  private vmTrackBuffer: AudioBuffer | null = null;
  private vmTrackSource: AudioBufferSourceNode | null = null;
  private vmTrackGain: GainNode | null = null;
  private achievementBuffer: AudioBuffer | null = null;
  private soulBuffers: Partial<Record<SoulSound, Promise<AudioBuffer>>> = {};
  private endingBuffers: Partial<Record<EndingSample, Promise<AudioBuffer>>> = {};
  /** Which of the two recorded katana swings plays next. */
  private slashAlt = false;
  private aeroTrackBuffer: AudioBuffer | null = null;
  private aeroTrackSource: AudioBufferSourceNode | null = null;
  private aeroTrackGain: GainNode | null = null;
  private aeroWanted = false;

  // VM clips (decoded lazily) + the line currently being spoken
  private vmBuffers: Partial<Record<VmClip, AudioBuffer>> = {};
  private vmLoading: Promise<void> | null = null;
  private vmSources: AudioBufferSourceNode[] = [];

  // Player volume (Options), applied on stages after the game's own buses so ducking/fades
  // inside the game never fight the player's setting
  private userVolume = { master: 1, music: 1, sfx: 1 };
  private userMaster: GainNode | null = null;
  private userMusic: GainNode | null = null;
  private userSfx: GainNode | null = null;

  private static readonly MASTER_LEVEL = 0.72;
  private static readonly SFX_LEVEL = 0.8;
  private static readonly MUSIC_LEVEL = 0.46;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Master bus glue compressor keeps the distorted layers from clipping
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : SynthAudioEngine.MASTER_LEVEL;
      this.userMaster = ctx.createGain();
      this.userMaster.gain.value = this.userVolume.master;
      this.masterGain.connect(this.userMaster);
      this.userMaster.connect(comp);

      // Music → slow-mo low-pass → master (muffles the soundtrack during kill slow-motion)
      this.musicSlowMoFilter = ctx.createBiquadFilter();
      this.musicSlowMoFilter.type = 'lowpass';
      this.musicSlowMoFilter.Q.value = 0.9;
      this.musicSlowMoFilter.frequency.value = 20000;
      this.musicSlowMoFilter.connect(this.masterGain);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = SynthAudioEngine.MUSIC_LEVEL;
      this.userMusic = ctx.createGain();
      this.userMusic.gain.value = this.userVolume.music;
      this.musicGain.connect(this.userMusic);
      this.userMusic.connect(this.musicSlowMoFilter);

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.45;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.musicGain.connect(this.analyser);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = SynthAudioEngine.SFX_LEVEL;
      this.userSfx = ctx.createGain();
      this.userSfx.gain.value = this.userVolume.sfx;
      this.sfxGain.connect(this.userSfx);
      this.userSfx.connect(this.masterGain);

      // White noise source buffer (snares, hats, whispers, explosions)
      const length = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;

      // Large industrial hall impulse response (shared by both reverb sends)
      const impulse = this.buildImpulse(ctx, 2.6, 2.4);
      this.musicVerb = this.buildReverbSend(ctx, impulse, this.musicGain, 0.55);
      this.sfxVerb = this.buildReverbSend(ctx, impulse, this.sfxGain, 0.5);

      // Recorded soundtrack bus: segments → per-area low-pass → level → music bus
      this.trackFilter = ctx.createBiquadFilter();
      this.trackFilter.type = 'lowpass';
      this.trackFilter.Q.value = 0.7;
      this.trackFilter.frequency.value = SCENES[this.scene].trackCutoff;
      this.trackBus = ctx.createGain();
      this.trackBus.gain.value = 0.8 * SCENES[this.scene].trackLevel;
      this.mainMute = ctx.createGain();
      this.trackFilter.connect(this.trackBus);
      this.trackBus.connect(this.mainMute);
      this.mainMute.connect(this.musicGain);

      // Boss track bus
      this.bossTrackGain = ctx.createGain();
      this.bossTrackGain.gain.value = 0;
      this.bossTrackGain.connect(this.musicGain);
      this.vmTrackGain = ctx.createGain();
      this.vmTrackGain.gain.value = 0;
      this.vmTrackGain.connect(this.musicGain);
      this.aeroTrackGain = ctx.createGain();
      this.aeroTrackGain.gain.value = 0;
      this.aeroTrackGain.connect(this.musicGain);
      this.loadRecordedAssets(ctx);

      // Stepped bit-crush curve (gritty transients, boss vocoder)
      const samples = 256;
      const crush = new Float32Array(new ArrayBuffer(samples * 4));
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        const crushed = Math.round(x * 10) / 10;
        crush[i] = Math.max(-0.92, Math.min(0.92, crushed * 1.85));
      }
      this.crusherCurve = crush;

      // Smooth asymmetric tanh overdrive (guitar / kick saturation)
      const n = 1024;
      const drive = new Float32Array(new ArrayBuffer(n * 4));
      const k = 9;
      const bias = 0.12;
      const norm = Math.tanh(k * (1 + bias)) - Math.tanh(k * bias);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        drive[i] = (Math.tanh(k * (x + bias)) - Math.tanh(k * bias)) / norm;
      }
      this.driveCurve = drive;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private loadRecordedAssets(ctx: AudioContext) {
    const decode = (url: string) =>
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));

    this.trackState = 'loading';
    decode(TRACK_URL)
      .then((buf) => {
        const { end, score } = findLoopEnd(buf, TRACK_LOOP_START);
        this.trackBuffer = buf;
        this.trackLoopEnd = end;
        this.trackState = 'ready';
        console.info(
          `[audio] soundtrack ready: ${buf.duration.toFixed(1)}s, loop ${TRACK_LOOP_START}s → ${end.toFixed(2)}s (match ${score.toFixed(2)})`
        );
        if (this.musicPlaying) {
          this.trackFirst = true;
          this.trackNextAt = ctx.currentTime + 0.05;
        }
      })
      .catch((err) => {
        // Fall back to the procedural soundtrack
        this.trackState = 'failed';
        console.warn('[audio] soundtrack failed to load, using procedural music', err);
      });

    (Object.keys(BOSS_VOICE_URLS) as BossVoiceClip[]).forEach((clip) => {
      decode(BOSS_VOICE_URLS[clip])
        .then((buf) => {
          this.voiceBuffers[clip] = buf;
        })
        .catch((err) => console.warn(`[audio] boss voice "${clip}" failed to load`, err));
    });

    decode(BOSS_TRACK_URL)
      .then((buf) => {
        this.bossTrackBuffer = buf;
      })
      .catch((err) => console.warn('[audio] boss track failed to load', err));
    for (const id of Object.keys(SOUL_SOUND_URLS) as SoulSound[]) {
      const p = decode(SOUL_SOUND_URLS[id]);
      p.catch((err) => console.warn(`[audio] soul sound "${id}" failed to load`, err));
      this.soulBuffers[id] = p;
    }
    for (const id of Object.keys(ENDING_SAMPLE_URLS) as EndingSample[]) {
      const p = decode(ENDING_SAMPLE_URLS[id]);
      p.catch((err) => console.warn(`[audio] ending clip "${id}" failed to load`, err));
      this.endingBuffers[id] = p;
    }
    decode(ACHIEVEMENT_URL)
      .then((buf) => {
        this.achievementBuffer = buf;
      })
      .catch((err) => console.warn('[audio] achievement jingle failed to load', err));
    decode(AERO_TRACK_URL)
      .then((buf) => {
        this.aeroTrackBuffer = buf;
        if (this.aeroWanted) this.playAeroMusic();
      })
      .catch((err) => console.warn('[audio] aero track failed to load', err));
    decode(VM_TRACK_URL)
      .then((buf) => {
        this.vmTrackBuffer = buf;
      })
      .catch((err) => console.warn('[audio] VM track failed to load', err));
  }

  // ───────────── Frutiger Aero world music ─────────────

  /** Main soundtrack out for good, the deep house loop in (starts once it has loaded). */
  public playAeroMusic() {
    this.aeroWanted = true;
    const ctx = this.ensureContext();
    if (!ctx || !this.mainMute || !this.aeroTrackGain) return;
    const now = ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setTargetAtTime(0, now, 0.3);
    if (this.aeroTrackSource || !this.aeroTrackBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.aeroTrackBuffer;
    src.loop = true;
    src.connect(this.aeroTrackGain);
    src.start(now + 0.05);
    this.aeroTrackSource = src;
    this.aeroTrackGain.gain.cancelScheduledValues(now);
    this.aeroTrackGain.gain.setValueAtTime(0.0001, now);
    this.aeroTrackGain.gain.linearRampToValueAtTime(0.85, now + 2.5);
  }

  public stopAeroMusic(fade = 1) {
    this.aeroWanted = false;
    if (!this.ctx || !this.aeroTrackGain) return;
    const now = this.ctx.currentTime;
    this.aeroTrackGain.gain.cancelScheduledValues(now);
    this.aeroTrackGain.gain.setValueAtTime(this.aeroTrackGain.gain.value, now);
    this.aeroTrackGain.gain.linearRampToValueAtTime(0.0001, now + fade);
    const src = this.aeroTrackSource;
    this.aeroTrackSource = null;
    if (src) src.stop(now + fade + 0.1);
  }

  public isAeroMusicOn(): boolean {
    return this.aeroWanted;
  }

  /** Achievement unlocked jingle (the recorded one; a synth chime if it hasn't loaded). */
  public playAchievement() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (this.achievementBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.achievementBuffer;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g);
      g.connect(this.sfxGain);
      src.start();
      return;
    }
    const now = ctx.currentTime;
    [880, 1175, 1568].forEach((f, i) => this.whine(now + i * 0.09, f, f, 0.18, 0.12, 'square'));
  }

  /**
   * A soul symbol assembling over `formSec` seconds:
   *  - caos plays while the fire runs, then fades out once the symbol is whole
   *  - controle hits the moment the last beam locks in
   *  - odio swells from silence along with the heartbeat fade-in
   * With `hold`, odio keeps beating (looping its steady part) until stopped.
   * Returns a stop(fadeSec) handle.
   */
  public playSoulForm(soul: SoulSound, formSec: number, hold = false, level = 0.9): (fadeSec?: number) => void {
    let stopped = false;
    let stopNow: ((fadeSec: number) => void) | null = null;
    const ctx = this.muted ? null : this.ensureContext();
    const pending = this.soulBuffers[soul];
    if (!ctx || !this.sfxGain || !pending) return () => {};
    const out = this.sfxGain;
    const requested = ctx.currentTime;

    pending
      .then((buf) => {
        if (stopped) return;
        // If the file was still loading, keep the timing relative to when the symbol started
        const now = ctx.currentTime;
        const late = now - requested;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        // `g` carries the per-soul envelope (ramps, Ódio's swell curve); `fade` is only ever
        // touched by stop(), so the two automations can never collide
        const g = ctx.createGain();
        const fade = ctx.createGain();
        src.connect(g);
        g.connect(fade);
        fade.connect(out);
        if (soul === 'caos') {
          if (late >= formSec + 0.4) return; // already formed: too late to burn along
          g.gain.setValueAtTime(level, now);
          const fadeAt = now + Math.max(0, formSec + 0.4 - late);
          g.gain.setValueAtTime(level, fadeAt);
          g.gain.linearRampToValueAtTime(0, fadeAt + 1.2);
          src.start(now, Math.min(late, buf.duration));
          src.stop(fadeAt + 1.3);
        } else if (soul === 'controle') {
          g.gain.setValueAtTime(level, now);
          src.start(now + Math.max(0, formSec - late));
        } else {
          const swell = formSec + 0.5; // rises with the symbol's fade-in
          const startLevel = Math.min(1, late / swell) * level;
          // Ease in along a quadratic curve: stays low at first, then rises as the symbol surfaces
          const rest = Math.max(0.05, swell - late);
          const from = Math.sqrt(startLevel / level);
          const curve = new Float32Array(32).map((_, k) => level * (from + (1 - from) * (k / 31)) ** 2);
          g.gain.setValueCurveAtTime(curve, now, rest);
          if (hold && buf.duration > ODIO_LOOP.end) {
            src.loop = true;
            src.loopStart = ODIO_LOOP.start;
            src.loopEnd = ODIO_LOOP.end;
          }
          src.start(now);
        }
        stopNow = (fadeSec) => {
          const t = ctx.currentTime;
          try {
            fade.gain.setValueAtTime(1, t);
            fade.gain.linearRampToValueAtTime(0, t + fadeSec);
          } catch {
            fade.disconnect();
          }
          try {
            src.stop(t + fadeSec + 0.05);
          } catch {
            /* already stopped */
          }
        };
      })
      .catch(() => {});

    // Called from React cleanups: a sound hiccup must never take the screen down with it
    return (fadeSec = 0.4) => {
      stopped = true;
      try {
        stopNow?.(fadeSec);
      } catch (err) {
        console.warn('[audio] soul sound stop failed', err);
      }
    };
  }

  /**
   * Endings play with no music under them, so their effects need to sit louder in the mix:
   * scales the whole effects bus (1 = normal).
   */
  public setCinematicBoost(k: number) {
    if (!this.sfxGain || !this.ctx) return;
    this.sfxGain.gain.setTargetAtTime(SynthAudioEngine.SFX_LEVEL * k, this.ctx.currentTime, 0.15);
  }

  /**
   * Plays one of the ending clips (waits for it if it's still loading). With `loop` it repeats
   * until stopped. Returns a stop(fadeSec) handle.
   */
  public playEndingSample(
    id: EndingSample,
    gain = 0.9,
    loop = false,
    /** rate: playback speed (pitch); offset/duration: play just a slice of the clip (s). */
    opts: {
      rate?: number;
      offset?: number;
      duration?: number;
      quiet?: boolean;
      fadeAt?: number;
      fadeLen?: number;
      /** Loop only this stretch of the clip (s). */
      loopStart?: number;
      loopEnd?: number;
      /** Ring-modulated + metallic comb: makes a voice/noise sound like a machine. */
      robot?: boolean;
    } = {}
  ): EndingClip {
    const ctx = this.muted ? null : this.ensureContext();
    const pending = this.endingBuffers[id];
    if (!ctx || !this.sfxGain || !pending) {
      console.warn(`[audio] "${id}" skipped: ${this.muted ? 'muted' : !ctx ? 'no context' : !pending ? 'clip not loading' : 'no bus'}`);
      return Object.assign(() => {}, { fadeTo: () => {} });
    }
    if (!opts.quiet) console.info(`[audio] play "${id}" (context ${ctx.state})`);
    const out = this.sfxGain;
    let stopped = false;
    let node: { src: AudioBufferSourceNode; g: GainNode } | null = null;
    pending
      .then((buf) => {
        if (stopped) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = loop;
        if (loop && opts.loopEnd !== undefined) {
          src.loopStart = opts.loopStart ?? 0;
          src.loopEnd = opts.loopEnd;
        }
        if (opts.rate) src.playbackRate.value = opts.rate;
        const g = ctx.createGain();
        g.gain.value = gain;
        if (opts.robot) {
          // ring modulator (the "robot voice" wobble) into a short metallic comb
          const ring = ctx.createGain();
          ring.gain.value = 0;
          const lfo = ctx.createOscillator();
          lfo.type = 'square';
          lfo.frequency.value = 62;
          const depth = ctx.createGain();
          depth.gain.value = 1;
          lfo.connect(depth);
          depth.connect(ring.gain);
          lfo.start();
          const comb = ctx.createDelay(0.05);
          comb.delayTime.value = 0.007;
          const fb = ctx.createGain();
          fb.gain.value = 0.55;
          comb.connect(fb);
          fb.connect(comb);
          src.connect(ring);
          ring.connect(g);
          ring.connect(comb);
          comb.connect(g);
          src.addEventListener('ended', () => lfo.stop());
        } else {
          src.connect(g);
        }
        g.connect(out);
        if (loop && opts.offset !== undefined) src.start(0, opts.offset);
        else if (opts.offset !== undefined || opts.duration !== undefined) src.start(0, opts.offset ?? 0, opts.duration);
        else src.start();
        if (opts.fadeAt !== undefined) {
          // fade out from fadeAt over fadeLen and stop there (keeps a long clip from cutting off dead)
          const t0 = ctx.currentTime + opts.fadeAt;
          const len = opts.fadeLen ?? 0.4;
          g.gain.setValueAtTime(gain, t0);
          g.gain.linearRampToValueAtTime(0.0001, t0 + len);
          src.stop(t0 + len + 0.02);
        }
        node = { src, g };
      })
      .catch(() => {});
    const stop = (fadeSec = 0.15) => {
      stopped = true;
      if (!node) return;
      try {
        const t = ctx.currentTime;
        node.g.gain.cancelScheduledValues(t);
        node.g.gain.setValueAtTime(node.g.gain.value, t);
        node.g.gain.linearRampToValueAtTime(0, t + fadeSec);
        node.src.stop(t + fadeSec + 0.02);
      } catch {
        /* already stopped */
      }
    };
    return Object.assign(stop, {
      fadeTo: (to: number, sec: number) => {
        if (!node || stopped) return;
        const t = ctx.currentTime;
        node.g.gain.cancelScheduledValues(t);
        node.g.gain.setValueAtTime(node.g.gain.value, t);
        node.g.gain.linearRampToValueAtTime(to, t + sec);
      },
    });
  }

  /** Coin pickup: tiny tick for copper, bright ding for gold, papery riffle for cash. */
  public playCoin(tier: 'small' | 'medium' | 'large') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    if (tier === 'small') {
      const f = 1900 + Math.random() * 300;
      this.whine(now, f, f, 0.05, 0.05, 'square');
    } else if (tier === 'medium') {
      this.whine(now, 1320, 1320, 0.06, 0.07, 'square');
      this.whine(now + 0.06, 1980, 1980, 0.12, 0.07, 'square');
    } else {
      this.noiseBurst(now, 0.12, 0.25, 'bandpass', 3200, 2400, { q: 1.2 });
      this.whine(now + 0.03, 990, 990, 0.07, 0.07, 'square');
      this.whine(now + 0.09, 1480, 1480, 0.07, 0.07, 'square');
      this.whine(now + 0.15, 1980, 1980, 0.14, 0.07, 'square');
    }
  }

  /** Robot dog: two metallic yaps. */
  public playDogBark() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    for (const t of [0, 0.16]) {
      this.whine(now + t, 720, 380, 0.09, 0.12, 'square');
      this.noiseBurst(now + t, 0.07, 0.12, 'bandpass', 1400, 900, { q: 3, crush: true });
    }
  }

  /** Robot dog bite: steel jaws clamping. */
  public playDogBite() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.05, 0.4, 'highpass', 3000, 1500, { crush: true });
    this.triggerPunchBody(now, 200, 80, 0.12, 0.4);
  }

  // ───────────── VM's room music ─────────────

  /** Main soundtrack out, VM's ambient loop in. */
  public playVmMusic() {
    const ctx = this.ensureContext();
    if (!ctx || !this.mainMute || !this.vmTrackGain) return;
    const now = ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setTargetAtTime(0, now, 0.2);
    if (this.vmTrackSource || !this.vmTrackBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.vmTrackBuffer;
    src.loop = true;
    src.connect(this.vmTrackGain);
    src.start(now + 0.05);
    this.vmTrackSource = src;
    this.vmTrackGain.gain.cancelScheduledValues(now);
    this.vmTrackGain.gain.setValueAtTime(0.0001, now);
    this.vmTrackGain.gain.linearRampToValueAtTime(0.9, now + 1.2);
  }

  public stopVmMusic(fade = 0.8) {
    if (!this.ctx || !this.vmTrackGain) return;
    const now = this.ctx.currentTime;
    this.vmTrackGain.gain.cancelScheduledValues(now);
    this.vmTrackGain.gain.setValueAtTime(this.vmTrackGain.gain.value, now);
    this.vmTrackGain.gain.linearRampToValueAtTime(0.0001, now + fade);
    const src = this.vmTrackSource;
    this.vmTrackSource = null;
    if (src) src.stop(now + fade + 0.1);
  }

  // ───────────── Boss fight music ─────────────

  /** Main soundtrack fades out, Cem Faces' own track fades in (looping). */
  /** `fadeIn`: seconds for his track to swell up from silence (the intro builds slowly). */
  public startBossMusic(fadeIn = 1.4) {
    const ctx = this.ensureContext();
    if (!ctx || !this.mainMute || !this.bossTrackGain) return;
    const now = ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setTargetAtTime(0, now, 0.4);
    if (this.bossTrackSource || !this.bossTrackBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.bossTrackBuffer;
    src.loop = true;
    src.connect(this.bossTrackGain);
    src.start(now + 0.2);
    this.bossTrackSource = src;
    this.bossTrackGain.gain.cancelScheduledValues(now);
    this.bossTrackGain.gain.setValueAtTime(0.0001, now);
    if (fadeIn > 3) {
      // a crescendo: barely there for a while, then rising hard toward the turn
      this.bossTrackGain.gain.linearRampToValueAtTime(0.12, now + fadeIn * 0.45);
      this.bossTrackGain.gain.linearRampToValueAtTime(0.85, now + fadeIn);
    } else {
      this.bossTrackGain.gain.linearRampToValueAtTime(0.85, now + fadeIn);
    }
  }

  /** After the fight: his track slowly sinks away and leaves silence (main stays muted). */
  public endBossMusic(fade = 3.5) {
    if (!this.ctx || !this.bossTrackGain) return;
    const now = this.ctx.currentTime;
    this.bossTrackGain.gain.cancelScheduledValues(now);
    this.bossTrackGain.gain.setValueAtTime(this.bossTrackGain.gain.value, now);
    this.bossTrackGain.gain.linearRampToValueAtTime(0.0001, now + fade);
    const src = this.bossTrackSource;
    this.bossTrackSource = null;
    if (src) src.stop(now + fade + 0.1);
  }

  // ───────────── Cem Faces, second coming ─────────────

  /** Decodes fight 2's track, scream and voice clips (idempotent). */
  public preloadBoss2(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();
    if (!this.boss2Loading) {
      const decode = (url: string) =>
        fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status} ${url}`);
            return r.arrayBuffer();
          })
          .then((d) => ctx.decodeAudioData(d));
      const jobs: Promise<unknown>[] = [
        decode(BOSS2_TRACK_URL).then((b) => (this.boss2TrackBuffer = b)),
        decode(ROBOT_SCREAM_URL).then((b) => (this.screamBuffer = b)),
        decode(DEATH_SCREAM_URL).then((b) => (this.deathScreamBuffer = b)),
        ...(Object.keys(BOSS2_CLIPS) as Boss2Clip[]).map((k) =>
          decode(BOSS2_CLIPS[k].url).then((b) => (this.boss2Buffers[k] = b))
        ),
      ];
      this.boss2Loading = Promise.all(jobs.map((j) => j.catch((err) => console.warn('[audio] boss 2 asset failed', err)))).then(
        () => undefined
      );
    }
    return this.boss2Loading;
  }

  /** Fight 2's own track replaces whatever is playing (looping). */
  public startBoss2Music() {
    const ctx = this.ensureContext();
    if (!ctx || !this.mainMute || !this.bossTrackGain) return;
    const now = ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setTargetAtTime(0, now, 0.2);
    if (this.bossTrackSource) {
      try {
        this.bossTrackSource.stop(now + 0.05);
      } catch {
        // already stopped
      }
      this.bossTrackSource = null;
    }
    if (!this.boss2TrackBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.boss2TrackBuffer;
    src.loop = true;
    src.connect(this.bossTrackGain);
    src.start(now + 0.05);
    this.bossTrackSource = src;
    this.bossTrackGain.gain.cancelScheduledValues(now);
    this.bossTrackGain.gain.setValueAtTime(0.0001, now);
    this.bossTrackGain.gain.linearRampToValueAtTime(0.9, now + 0.6);
  }

  /** All music sinks to silence (the calm before he comes through the ceiling). */
  public silenceMusic(fade = 2.5) {
    if (!this.ctx || !this.mainMute) return;
    const now = this.ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setValueAtTime(this.mainMute.gain.value, now);
    this.mainMute.gain.linearRampToValueAtTime(0.0001, now + fade);
  }

  /** Speaks one of fight 2's lines (words chained, silences trimmed). Resolves with its length. */
  public async playBoss2Line(clips: Boss2Clip[]): Promise<number> {
    await this.preloadBoss2();
    let total = 0;
    for (const k of clips) total += BOSS2_CLIPS[k].end + BOSS2_CLIPS[k].gap;
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || this.muted) return total;
    if (this.activeVoice) {
      try {
        this.activeVoice.stop();
      } catch {
        // already ended
      }
      this.activeVoice = null;
    }
    // Duck the music under the line
    const now = ctx.currentTime;
    if (this.musicGain && !this.musicPaused) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(0.16, now, 0.05);
      this.musicGain.gain.setTargetAtTime(SynthAudioEngine.MUSIC_LEVEL, now + total, 0.3);
    }
    const out = ctx.createGain();
    out.gain.value = 1.25;
    out.connect(this.sfxGain);
    this.sendTo(out, this.sfxVerb, 0.32);
    let t = now + 0.03;
    for (const k of clips) {
      const buf = this.boss2Buffers[k];
      const spec = BOSS2_CLIPS[k];
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        const end = Math.min(spec.end, buf.duration);
        g.gain.setValueAtTime(1, t);
        g.gain.setValueAtTime(1, t + end - 0.03);
        g.gain.linearRampToValueAtTime(0.0001, t + end);
        src.connect(g);
        g.connect(out);
        src.start(t, 0, end + 0.01);
      }
      t += spec.end + spec.gap;
    }
    this.activeVoiceEndsAt = t;
    return total;
  }

  /**
   * The glitchy robot scream. `rate` < 1 drags it lower; `grit` pushes it through the bitcrusher
   * (his dying screams get progressively more broken).
   */
  public playRobotScream(rate = 1, gain = 1, grit = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    void this.preloadBoss2();
    if (!this.screamBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.screamBuffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const len = ROBOT_SCREAM_LEN / rate;
    g.gain.setValueAtTime(gain * 1.1, now);
    g.gain.setValueAtTime(gain * 1.1, now + len - 0.15);
    g.gain.linearRampToValueAtTime(0.0001, now + len);
    if (grit > 0 && this.crusherCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.crusherCurve;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = 1 - grit * 0.6;
      wet.gain.value = grit;
      src.connect(dry);
      src.connect(shaper);
      shaper.connect(wet);
      dry.connect(g);
      wet.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.45);
    src.start(now, 0, ROBOT_SCREAM_LEN + 0.05);
  }

  /** His dying scream, played whole (he detonates as it ends). */
  public playDeathScream() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    void this.preloadBoss2();
    if (!this.deathScreamBuffer) return;
    const now = ctx.currentTime;
    if (this.musicGain && !this.musicPaused) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(0.12, now, 0.1);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.deathScreamBuffer;
    const g = ctx.createGain();
    g.gain.value = 1.2;
    src.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.5);
    src.start(now, 0, DEATH_SCREAM_LEN + 0.1);
    this.deathScreamSrc = src;
  }

  public stopDeathScream() {
    if (!this.deathScreamSrc) return;
    try {
      this.deathScreamSrc.stop();
    } catch {
      // already ended
    }
    this.deathScreamSrc = null;
  }

  private loopNoise(filterType: BiquadFilterType, freq: number, q: number, level: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    return { src, filter: f, gain: g };
  }

  /** Low dread bed for the silent lull: sub drone + air, swelling over `dur` seconds. */
  public startDread(dur = 10) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    this.stopDread(0.05);
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(0.5, now + dur);
    bus.connect(this.sfxGain);
    this.sendTo(bus, this.sfxVerb, 0.5);
    const nodes: AudioScheduledSourceNode[] = [];
    for (const [freq, type, lvl] of [
      [36, 'sine', 0.5],
      [36.7, 'sawtooth', 0.06],
      [55, 'triangle', 0.12],
    ] as [number, OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = lvl;
      o.connect(g);
      g.connect(bus);
      o.start(now);
      nodes.push(o);
    }
    nodes.push(this.loopNoise('lowpass', 220, 0.7, 0.35, bus).src);
    this.dread = { nodes, gain: bus };
  }

  public stopDread(fade = 0.4) {
    if (!this.ctx || !this.dread) return;
    const now = this.ctx.currentTime;
    const d = this.dread;
    this.dread = null;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(d.gain.gain.value, now);
    d.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    for (const n of d.nodes) n.stop(now + fade + 0.05);
  }

  /** Something heavy pounding on the ceiling, getting closer (0..1). */
  public playCeilingBang(intensity = 0.5) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 70 + intensity * 30, 26, 0.3, 0.35 + intensity * 0.55);
    this.noiseBurst(now, 0.35 + intensity * 0.3, 0.12 + intensity * 0.35, 'lowpass', 900, 90, { crush: true, verb: 0.6 });
    if (Math.random() < 0.6) this.playPipeClang(now + 0.02, 0.4 + intensity * 0.9, this.sfxGain, this.sfxVerb);
  }

  /** He comes through the ceiling: rending metal, a huge slam and debris raining down. */
  public playCeilingCrash() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.5, 0.5, 'bandpass', 3200, 600, { q: 2, crush: true, verb: 0.4 });
    this.whine(now, 1400, 180, 0.45, 0.16, 'sawtooth');
    this.playBossSlam();
    this.triggerPunchBody(now + 0.02, 140, 22, 0.6, 1.0);
    this.noiseBurst(now + 0.03, 1.4, 0.6, 'lowpass', 2600, 60, { crush: true, verb: 0.7 });
    this.playPipeClang(now + 0.05, 2.2, this.sfxGain, this.sfxVerb);
    for (let i = 0; i < 9; i++) {
      const t = now + 0.25 + i * (0.07 + Math.random() * 0.12);
      this.noiseBurst(t, 0.08, 0.12 + Math.random() * 0.15, 'bandpass', 1500 + Math.random() * 3500, 900, { q: 3 });
    }
  }

  /** Flamethrower roar (held until stopFlame). */
  public startFlame() {
    if (this.muted || this.flame) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(0.55, now + 0.12);
    bus.connect(this.sfxGain);
    this.sendTo(bus, this.sfxVerb, 0.25);
    const roar = this.loopNoise('lowpass', 900, 0.6, 0.9, bus);
    roar.filter.frequency.setValueAtTime(600, now);
    roar.filter.frequency.linearRampToValueAtTime(1400, now + 0.3);
    const hiss = this.loopNoise('bandpass', 2600, 1.5, 0.25, bus);
    this.triggerPunchBody(now, 90, 40, 0.25, 0.5);
    this.flame = { srcs: [roar.src, hiss.src], gain: bus };
  }

  public stopFlame() {
    if (!this.ctx || !this.flame) return;
    const now = this.ctx.currentTime;
    const f = this.flame;
    this.flame = null;
    f.gain.gain.cancelScheduledValues(now);
    f.gain.gain.setValueAtTime(f.gain.gain.value, now);
    f.gain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    for (const s of f.srcs) s.stop(now + 0.4);
  }

  /** His final detonation: layered booms in red and orange. */
  public playBigExplosion() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.playExplosion();
    this.playSlowMoImpact();
    this.triggerPunchBody(now, 120, 18, 0.9, 1.0);
    this.noiseBurst(now, 2.4, 0.7, 'lowpass', 3200, 40, { crush: true, verb: 0.8 });
    this.noiseBurst(now + 0.15, 1.2, 0.35, 'bandpass', 900, 200, { q: 0.8, verb: 0.6 });
    setTimeout(() => this.playExplosion(), 180);
  }

  /** Crackling fire around the burnt husk (until the floor is left). */
  public startHuskFire() {
    if (this.muted || this.huskFire) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(0.22, now + 1.5);
    bus.connect(this.sfxGain);
    const crackle = this.loopNoise('bandpass', 1800, 0.9, 0.7, bus);
    const rumble = this.loopNoise('lowpass', 320, 0.5, 0.6, bus);
    this.huskFire = { srcs: [crackle.src, rumble.src], gain: bus };
  }

  public stopHuskFire(fade = 0.8) {
    if (!this.ctx || !this.huskFire) return;
    const now = this.ctx.currentTime;
    const f = this.huskFire;
    this.huskFire = null;
    f.gain.gain.cancelScheduledValues(now);
    f.gain.gain.setValueAtTime(f.gain.gain.value, now);
    f.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    for (const s of f.srcs) s.stop(now + fade + 0.05);
  }

  /** Brings the main soundtrack back (e.g. when descending to the next floor). */
  public resumeMainMusic(fade = 2) {
    if (!this.ctx || !this.mainMute || this.aeroWanted) return;
    const now = this.ctx.currentTime;
    this.mainMute.gain.cancelScheduledValues(now);
    this.mainMute.gain.setTargetAtTime(1, now, fade / 4);
  }

  public isMainMusicMuted(): boolean {
    return !!this.mainMute && this.mainMute.gain.value < 0.5;
  }

  // ───────────── VM voice ─────────────

  /** Decodes all VM clips (idempotent). */
  public preloadVm(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();
    if (!this.vmLoading) {
      this.vmLoading = Promise.all(
        (Object.keys(VM_CLIP_URLS) as VmClip[]).map((k) =>
          fetch(VM_CLIP_URLS[k])
            .then((r) => r.arrayBuffer())
            .then((d) => ctx.decodeAudioData(d))
            .then((b) => {
              this.vmBuffers[k] = b;
            })
            .catch((err) => console.warn(`[audio] VM clip "${k}" failed to load`, err))
        )
      ).then(() => undefined);
    }
    return this.vmLoading;
  }

  /**
   * Speaks a VM line made of one or more clips back to back (cuts off any line in progress).
   * Resolves with the line's duration in seconds (0 if muted / unavailable).
   */
  public async playVmLine(clips: VmClip[]): Promise<number> {
    await this.preloadVm();
    const ctx = this.ctx;
    for (const s of this.vmSources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.vmSources = [];
    let total = 0;
    for (const k of clips) total += (this.vmBuffers[k]?.duration ?? 0.4) + 0.04;
    if (!ctx || !this.sfxGain || this.muted) return total;

    let t = ctx.currentTime + 0.03;
    const out = ctx.createGain();
    out.gain.value = 1.1;
    out.connect(this.sfxGain);
    this.sendTo(out, this.sfxVerb, 0.18);
    for (const k of clips) {
      const buf = this.vmBuffers[k];
      if (!buf) {
        t += 0.4;
        continue;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(t);
      this.vmSources.push(src);
      t += buf.duration + 0.04;
    }
    return total;
  }

  /** Keeps ~1s of soundtrack segments queued; repeats crossfade into the loop start. */
  private scheduleTrack() {
    const ctx = this.ctx;
    if (!ctx || this.trackState !== 'ready' || !this.trackBuffer || !this.trackFilter) return;
    const { fadeIn, fadeOut } = XFADE_CURVES;

    while (this.trackNextAt < ctx.currentTime + 1) {
      const first = this.trackFirst;
      const offset = first ? 0 : TRACK_LOOP_START - TRACK_XFADE;
      const len = this.trackLoopEnd - offset;
      const t0 = Math.max(this.trackNextAt, ctx.currentTime + 0.02);

      const src = ctx.createBufferSource();
      src.buffer = this.trackBuffer;
      const g = ctx.createGain();
      if (first) {
        g.gain.setValueAtTime(1, t0);
      } else {
        g.gain.setValueCurveAtTime(fadeIn, t0, TRACK_XFADE);
      }
      g.gain.setValueCurveAtTime(fadeOut, t0 + len - TRACK_XFADE, TRACK_XFADE);
      src.connect(g);
      g.connect(this.trackFilter);
      src.start(t0, offset);
      src.stop(t0 + len + 0.05);
      src.onended = () => {
        this.trackSources = this.trackSources.filter((s) => s !== src);
      };
      this.trackSources.push(src);

      this.trackFirst = false;
      this.trackNextAt = t0 + len - TRACK_XFADE;
    }
  }

  private buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Slight pre-delay + metallic early reflections, then exponential tail
        const early = i < ctx.sampleRate * 0.012 ? 0 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early;
      }
    }
    return ir;
  }

  private buildReverbSend(ctx: AudioContext, impulse: AudioBuffer, dest: AudioNode, level: number): GainNode {
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180; // keep the low end dry and tight
    const out = ctx.createGain();
    out.gain.value = level;
    input.connect(hp);
    hp.connect(conv);
    conv.connect(out);
    out.connect(dest);
    return input;
  }

  /** Connects `node` to a reverb send with the given amount. */
  private sendTo(node: AudioNode, verb: GainNode | null, amount: number) {
    if (!this.ctx || !verb || amount <= 0) return;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(verb);
  }

  public unlock() {
    const ctx = this.ensureContext();
    console.info(`[audio] unlock: context ${ctx ? ctx.state : 'unavailable'}${this.muted ? ' (muted)' : ''}`);
  }

  /** For diagnostics: the audio context's state ('none' before it exists). */
  public contextState(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /** Player volumes from Options (0..1 each). */
  public setVolumes(v: { master: number; music: number; sfx: number }) {
    this.userVolume = { ...v };
    const t = this.ctx?.currentTime ?? 0;
    this.userMaster?.gain.setTargetAtTime(v.master, t, 0.03);
    this.userMusic?.gain.setTargetAtTime(v.music, t, 0.03);
    this.userSfx?.gain.setTargetAtTime(v.sfx, t, 0.03);
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : SynthAudioEngine.MASTER_LEVEL, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * 0..1 "kick" pulse of the music: spikes on bass hits, decays between them.
   * Call once per frame (it also advances the smoothing).
   */
  public getMusicPulse(): number {
    if (!this.analyser || !this.freqData || this.musicPaused || this.muted) {
      this.pulse *= 0.85;
      return this.pulse;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    for (let i = 1; i <= 6; i++) sum += this.freqData[i]; // ~85–520 Hz at 44.1 kHz
    const level = sum / (6 * 255);
    this.bassAvg += (level - this.bassAvg) * 0.04;
    const hit = Math.max(0, Math.min(1, (level - this.bassAvg * 0.9) * 4.2 + level * 0.25));
    this.pulse = Math.max(hit, this.pulse * 0.86);
    return this.pulse;
  }

  public setComboIntensity(combo: number) {
    this.comboIntensity = Math.min(1, combo / 8);
  }

  /** Switches the soundtrack arrangement (key, density, whisper rate) for the current area. */
  public setMusicZone(zone: ArenaZone, subBiome: TreeSubBiome = 'megastructure') {
    const next: MusicScene =
      zone === 'tree'
        ? subBiome === 'wireframe'
          ? 'tree_wire'
          : subBiome === 'hybrid'
            ? 'tree_hybrid'
            : 'tree_mega'
        : zone;
    if (next === this.scene) return;
    this.scene = next;
    if (this.ctx && this.trackFilter && this.trackBus) {
      const mix = SCENES[next];
      const now = this.ctx.currentTime;
      this.trackFilter.frequency.setTargetAtTime(mix.trackCutoff, now, 0.6);
      this.trackBus.gain.setTargetAtTime(0.8 * mix.trackLevel, now, 0.6);
    }
    // Greet each new area with a whisper soon after arriving
    this.barsUntilWhisper = 1;
  }

  public startMusic() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.musicPaused = false;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(SynthAudioEngine.MUSIC_LEVEL, ctx.currentTime, 0.05);
    }
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.stepIndex = 0;
    this.barsUntilWhisper = 2;
    this.nextStepTime = ctx.currentTime + 0.06;
    this.trackFirst = true;
    this.trackNextAt = ctx.currentTime + 0.06;
    this.scheduleLoop();
  }

  public pauseMusic(paused: boolean) {
    this.musicPaused = paused;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(paused ? 0.04 : SynthAudioEngine.MUSIC_LEVEL, this.ctx.currentTime, 0.04);
    }
  }

  public stopMusic() {
    this.musicPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    for (const src of this.trackSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.trackSources = [];
  }

  private scheduleLoop = () => {
    if (!this.musicPlaying || !this.ctx) return;
    this.scheduleTrack();
    while (this.nextStepTime < this.ctx.currentTime + 0.16) {
      if (!this.musicPaused && !this.muted) {
        this.triggerStep(this.stepIndex, this.nextStepTime);
      }
      this.nextStepTime += STEP_DUR;
      this.stepIndex = (this.stepIndex + 1) % 64;
    }
    this.timerId = window.setTimeout(this.scheduleLoop, 30);
  };

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ───────────────────────────── Sequencer ─────────────────────────────

  private triggerStep(step: number, time: number) {
    if (!this.ctx || !this.musicGain) return;
    const mix = SCENES[this.scene];
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const heat = this.comboIntensity;

    // Recorded soundtrack carries the music; the sequencer only clocks the whispers on top.
    // While it is still decoding, stay silent instead of starting the procedural fallback.
    if (this.trackState === 'ready' || this.trackState === 'loading') {
      if (this.trackState === 'ready' && s === 0 && this.trackFilter) {
        // Combo heat re-opens a muffled area's filter
        const cutoff = mix.trackCutoff + heat * (20000 - mix.trackCutoff) * 0.6;
        this.trackFilter.frequency.setTargetAtTime(cutoff, time, 0.35);
      }
      if (this.trackState === 'ready') this.scheduleWhispers(s, time, mix, 1.35);
      return;
    }

    // ── Procedural fallback (soundtrack missing / failed to load) ──

    // 1. Riff: distorted power chords + palm-muted chugs; combo opens the cabinet filter
    const g = GUITAR[bar][s];
    if (g !== '.' && mix.guitar > 0) {
      const open = g !== 'x';
      this.playGuitar(
        mix.root + GUITAR_OFFSETS[g],
        time,
        open,
        (open ? 0.2 : 0.15) * mix.guitar,
        mix.guitarTone + heat * 1400,
        this.musicGain
      );
    }

    // 2. Kick
    if (KICK[bar][s] === 'k') {
      this.playKick(time, (s % 8 === 0 ? 1 : 0.78) * mix.kick);
    }

    // 3. Snare (backbeat + bar-4 fill)
    if (SNARE[bar][s] === 's') {
      this.playSnare(time, (s === 4 || s === 12 ? 1 : 0.62) * mix.snare);
    }

    // 4. Hats: 8ths, open on the "and" of 2/4; 16ths creep in as the combo heats up
    const h = HATS[s];
    if (h !== '.' && mix.hats > 0) {
      this.playHat(time, (h === 'o' ? 0.07 : 0.045) * mix.hats, h === 'o' ? 0.16 : 0.035);
    } else if (heat > 0.45 && mix.hats > 0) {
      this.playHat(time, 0.022 * mix.hats, 0.025);
    }

    // 5. Pipe-clang metal hits
    if (METAL[bar][s] === 'm' && mix.metal > 0) {
      this.playPipeClang(time, 0.5 * mix.metal, this.musicGain, this.musicVerb);
    }

    // 6. Glitch FM arpeggio on cyber floors
    if (mix.arp > 0 && s % 2 === 0) {
      const note = mix.root + ARP[(step / 2) % ARP.length];
      this.playGlitchStab(this.midiToFreq(note), time, 0.09, 0.07 * mix.arp);
    }

    // 7. Sub drone swell every 2 bars
    if (s === 0 && bar % 2 === 0) {
      this.playDrone(this.midiToFreq(mix.root - 12), time, STEP_DUR * 30, 0.16 * mix.drone);
    }

    // 8. Whispers
    this.scheduleWhispers(s, time, mix, 1);
  }

  /** Counts bars and fires a whisper phrase every few bars (per-area rate). */
  private scheduleWhispers(stepInBar: number, time: number, mix: SceneMix, levelBoost: number) {
    if (stepInBar !== 0 || !this.musicGain) return;
    this.barsUntilWhisper--;
    if (this.barsUntilWhisper > 0) return;
    const [minBars, maxBars] = mix.whisperBars;
    this.barsUntilWhisper = minBars + Math.floor(Math.random() * (maxBars - minBars + 1));
    const offset = Math.random() * STEP_DUR * 8;
    this.playWhisperPhrase(
      time + offset,
      mix.whisperVoices,
      0.55 * mix.whisperGain * levelBoost,
      this.musicGain,
      this.musicVerb
    );
  }

  // ───────────────────────────── Instruments ─────────────────────────────

  /** Synth "guitar": detuned saw power chord → tanh overdrive → 2-pole cabinet low-pass. */
  private playGuitar(midi: number, time: number, open: boolean, gainVal: number, cutoff: number, dest: AudioNode) {
    if (!this.ctx || !this.driveCurve) return;
    const ctx = this.ctx;
    const dur = open ? 0.4 : 0.1;
    const f = this.midiToFreq(midi);
    const freqs = open ? [f, f * 1.4983, f * 2] : [f, f * 1.4983];

    const pre = ctx.createGain();
    pre.gain.value = 1.6 / freqs.length;
    const oscs: OscillatorNode[] = [];
    for (const fr of freqs) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fr, time);
        o.detune.setValueAtTime(det, time);
        o.connect(pre);
        oscs.push(o);
      }
    }

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve;
    shaper.oversample = '2x';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.Q.value = 0.8;
    lp1.frequency.setValueAtTime(open ? cutoff : cutoff * 0.55, time);
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.Q.value = 0.5;
    lp2.frequency.setValueAtTime(open ? cutoff * 1.4 : cutoff * 0.8, time);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gainVal, time + 0.004);
    if (open) {
      env.gain.setValueAtTime(gainVal, time + dur * 0.55);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    pre.connect(shaper);
    shaper.connect(hp);
    hp.connect(lp1);
    lp1.connect(lp2);
    lp2.connect(env);
    env.connect(dest);

    for (const o of oscs) {
      o.start(time);
      o.stop(time + dur + 0.03);
    }

    // Clean sine sub under open chords for weight
    if (open) {
      const sub = ctx.createOscillator();
      const subEnv = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(f / 2, time);
      subEnv.gain.setValueAtTime(0.0001, time);
      subEnv.gain.linearRampToValueAtTime(gainVal * 0.9, time + 0.01);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      sub.connect(subEnv);
      subEnv.connect(dest);
      sub.start(time);
      sub.stop(time + dur + 0.03);
    }
  }

  private playKick(time: number, intensity: number) {
    if (!this.ctx || !this.musicGain || !this.driveCurve || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.12);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.3);
    shaper.curve = this.driveCurve;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.62 * intensity, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    const pre = ctx.createGain();
    pre.gain.value = 1.4;
    osc.connect(pre);
    pre.connect(shaper);
    shaper.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.34);

    // Beater click
    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuffer;
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 3000;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.18 * intensity, time);
    cg.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);
    click.connect(cf);
    cf.connect(cg);
    cg.connect(this.musicGain);
    click.start(time, Math.random());
    click.stop(time + 0.02);
  }

  private playSnare(time: number, intensity: number) {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer || !this.driveCurve) return;
    const ctx = this.ctx;

    // Crushed noise body
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.linearRampToValueAtTime(0.32 * intensity, time + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    src.connect(bp);
    bp.connect(shaper);
    shaper.connect(ng);
    ng.connect(this.musicGain);
    this.sendTo(ng, this.musicVerb, 0.55);
    src.start(time, Math.random());
    src.stop(time + 0.26);

    // Shell tone
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(230, time);
    body.frequency.exponentialRampToValueAtTime(165, time + 0.1);
    bg.gain.setValueAtTime(0.28 * intensity, time);
    bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    body.connect(bg);
    bg.connect(this.musicGain);
    body.start(time);
    body.stop(time + 0.15);

    // Inharmonic metal ring (sheet-steel snare)
    const ringBp = ctx.createBiquadFilter();
    ringBp.type = 'bandpass';
    ringBp.frequency.value = 3200;
    ringBp.Q.value = 3;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.05 * intensity, time);
    rg.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    for (const f of [547, 811]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(ringBp);
      o.start(time);
      o.stop(time + 0.18);
    }
    ringBp.connect(rg);
    rg.connect(this.musicGain);
    this.sendTo(rg, this.musicVerb, 0.4);
  }

  private playHat(time: number, vol: number, dur: number) {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7600;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 10500;
    pk.gain.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(hp);
    hp.connect(pk);
    pk.connect(gain);
    gain.connect(this.musicGain);
    src.start(time, Math.random());
    src.stop(time + dur + 0.01);
  }

  /** Struck steel pipe: FM bell with an inharmonic ratio + noise strike, long reverb tail. */
  private playPipeClang(time: number, level: number, dest: AudioNode, verb: GainNode | null) {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const base = [262, 294, 331][Math.floor(Math.random() * 3)];

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = base;
    mod.frequency.value = base * 2.76;
    modGain.gain.setValueAtTime(base * 3.2, time);
    modGain.gain.exponentialRampToValueAtTime(base * 0.2, time + 0.9);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.22 * level, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
    carrier.connect(env);
    env.connect(dest);
    this.sendTo(env, verb, 0.9);
    mod.start(time);
    carrier.start(time);
    mod.stop(time + 1.15);
    carrier.stop(time + 1.15);

    const strike = ctx.createBufferSource();
    strike.buffer = this.noiseBuffer;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 2400;
    sf.Q.value = 1.2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.2 * level, time);
    sg.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    strike.connect(sf);
    sf.connect(sg);
    sg.connect(dest);
    strike.start(time, Math.random());
    strike.stop(time + 0.06);
  }

  private playGlitchStab(freq: number, time: number, dur: number, gainVal: number) {
    if (!this.ctx || !this.musicGain || !this.crusherCurve) return;
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    carrier.type = 'square';
    carrier.frequency.setValueAtTime(freq, time);
    mod.type = 'square';
    mod.frequency.setValueAtTime(freq * 1.99, time);
    modGain.gain.setValueAtTime(freq * 1.8, time);
    modGain.gain.exponentialRampToValueAtTime(20, time + dur);
    shaper.curve = this.crusherCurve;

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200 + this.comboIntensity * 1400, time);
    filter.Q.value = 2.2;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(shaper);
    shaper.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    this.sendTo(gain, this.musicVerb, 0.35);

    mod.start(time);
    carrier.start(time);
    mod.stop(time + dur + 0.02);
    carrier.stop(time + dur + 0.02);
  }

  private playDrone(freq: number, time: number, dur: number, gainVal: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(160, time);
    filter.frequency.linearRampToValueAtTime(420, time + dur * 0.5);
    filter.frequency.exponentialRampToValueAtTime(110, time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    const oscs = [freq, freq * 1.006, freq * 2.003].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.setValueAtTime(f, time);
      o.connect(filter);
      return o;
    });
    filter.connect(gain);
    gain.connect(this.musicGain);
    this.sendTo(gain, this.musicVerb, 0.6);
    for (const o of oscs) {
      o.start(time);
      o.stop(time + dur + 0.05);
    }
  }

  // ───────────────────────────── Whispers ─────────────────────────────

  private makeWhisperPattern(syllables: number, rate = 1): WhisperSyllable[] {
    const out: WhisperSyllable[] = [];
    for (let i = 0; i < syllables; i++) {
      const wordBreak = i > 0 && Math.random() < 0.25;
      out.push({
        vowel: VOWELS[Math.floor(Math.random() * VOWELS.length)],
        dur: (0.12 + Math.random() * 0.16) * rate,
        consonant: Math.random() < 0.65 ? (Math.random() < 0.55 ? 5400 : 2700) : null,
        gap: (wordBreak ? 0.16 + Math.random() * 0.12 : 0.015 + Math.random() * 0.05) * rate,
      });
    }
    return out;
  }

  /**
   * One whispering voice: looped white noise through three parallel formant band-passes
   * (the vowel) plus a high-passed hiss (s / sh consonants), each with its own envelope.
   */
  private playWhisperVoice(
    time: number,
    pattern: WhisperSyllable[],
    opts: { gain: number; pan: number; formantShift: number; dest: AudioNode; verb: GainNode | null; wet: number }
  ) {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const vowelEnv = ctx.createGain();
    vowelEnv.gain.setValueAtTime(0, time);
    const bands = [
      { q: 5, g: 3.0 },
      { q: 9, g: 2.2 },
      { q: 11, g: 1.2 },
    ].map(({ q, g }) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = g;
      src.connect(bp);
      bp.connect(bg);
      bg.connect(vowelEnv);
      return bp;
    });

    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.Q.value = 1.4;
    const hissEnv = ctx.createGain();
    hissEnv.gain.setValueAtTime(0, time);
    src.connect(hiss);
    hiss.connect(hissEnv);

    const out = ctx.createGain();
    out.gain.value = opts.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    vowelEnv.connect(out);
    hissEnv.connect(out);
    out.connect(pan);
    pan.connect(opts.dest);
    this.sendTo(pan, opts.verb, opts.wet);

    let t = time;
    const first = pattern[0];
    bands.forEach((bp, i) => bp.frequency.setValueAtTime(first.vowel[i] * opts.formantShift, time));
    for (const syl of pattern) {
      let vt = t;
      if (syl.consonant) {
        const cDur = 0.05 + syl.dur * 0.35;
        hiss.frequency.setValueAtTime(syl.consonant, t);
        hissEnv.gain.setValueAtTime(0, t);
        hissEnv.gain.linearRampToValueAtTime(0.16, t + 0.015);
        hissEnv.gain.linearRampToValueAtTime(0, t + cDur);
        vt = t + cDur * 0.7;
      }
      bands.forEach((bp, i) => bp.frequency.setTargetAtTime(syl.vowel[i] * opts.formantShift, vt, 0.02));
      vowelEnv.gain.setValueAtTime(0, vt);
      vowelEnv.gain.linearRampToValueAtTime(1, vt + 0.04);
      vowelEnv.gain.linearRampToValueAtTime(0.55, vt + syl.dur * 0.6);
      vowelEnv.gain.linearRampToValueAtTime(0, vt + syl.dur);
      t = vt + syl.dur + syl.gap;
    }

    src.start(time, Math.random() * 1.5);
    src.stop(t + 0.1);
  }

  /** A whispered phrase from one or several voices scattered around the stereo field. */
  private playWhisperPhrase(time: number, voices: number, gain: number, dest: AudioNode, verb: GainNode | null) {
    const syllables = 3 + Math.floor(Math.random() * 5);
    const shared = Math.random() < 0.5; // half the time the voices "agree" on the same words
    const sharedPattern = this.makeWhisperPattern(syllables, 1.1);
    for (let v = 0; v < voices; v++) {
      const pattern = shared ? sharedPattern : this.makeWhisperPattern(syllables, 0.95 + Math.random() * 0.3);
      this.playWhisperVoice(time + v * (shared ? 0.04 : 0.3 + Math.random() * 0.5), pattern, {
        gain: gain / Math.sqrt(voices),
        pan: voices === 1 ? Math.random() * 1.6 - 0.8 : -0.8 + (1.6 * v) / Math.max(1, voices - 1),
        formantShift: 0.82 + Math.random() * 0.2,
        dest,
        verb,
        wet: 0.85,
      });
    }
  }

  // ───────────────────────────── SFX ─────────────────────────────

  private triggerPunchBody(now: number, startFreq: number, endFreq: number, dur: number, gainVal: number) {
    if (!this.ctx || !this.sfxGain) return;
    const body = this.ctx.createOscillator();
    const shaper = this.ctx.createWaveShaper();
    const bGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(startFreq, now);
    body.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    if (this.crusherCurve) shaper.curve = this.crusherCurve;

    bGain.gain.setValueAtTime(gainVal, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.02);

    body.connect(shaper);
    shaper.connect(bGain);
    bGain.connect(this.sfxGain);
    body.start(now);
    body.stop(now + dur + 0.03);
  }

  /** Filtered noise burst helper for SFX. */
  private noiseBurst(
    now: number,
    dur: number,
    gainVal: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    opts: { q?: number; crush?: boolean; verb?: number } = {}
  ) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = opts.q ?? 0.8;
    filter.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) filter.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    if (opts.crush && this.crusherCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.crusherCurve;
      src.connect(shaper);
      shaper.connect(filter);
    } else {
      src.connect(filter);
    }
    filter.connect(g);
    g.connect(this.sfxGain);
    if (opts.verb) this.sendTo(g, this.sfxVerb, opts.verb);
    src.start(now, Math.random() * Math.max(0, this.noiseBuffer.duration - dur - 0.05));
    src.stop(now + dur + 0.02);
  }

  /**
   * The crater shot's panels: a deep thump on each cut, lower every time the camera climbs the
   * Tree (step 0..2); on the last one (step 3, the whole thing) it booms and rolls away in reverb.
   */
  public playTreeThump(step: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const f = [118, 84, 58, 38][Math.max(0, Math.min(3, step))];
    const last = step >= 3;
    this.triggerPunchBody(now, f, f * 0.42, 0.45 + step * 0.18, 0.95);
    this.noiseBurst(now, 0.35 + step * 0.15, 0.4, 'lowpass', 340 - step * 60, 70, { verb: last ? 0.95 : 0.2 });
    if (last) {
      // the boom rolling off the land: fading echoes, lower each time
      for (let k = 1; k <= 4; k++) {
        this.triggerPunchBody(now + k * 0.34, f * (1 - k * 0.06), f * 0.4, 0.5, 0.5 / k);
        this.noiseBurst(now + k * 0.34, 0.6, 0.18 / k, 'lowpass', 220, 60, { verb: 0.95 });
      }
    }
  }

  /** Sledgehammer: the heavy crunch when it lands on something, the whoosh when it hits air. */
  public playHammer(connected: boolean) {
    if (this.muted) return;
    // a different crunch every time: pitch, weight and a touch of where in the clip it starts
    if (connected) this.playEndingSample('hammerHit', 0.7 + Math.random() * 0.2, false, { quiet: true, rate: 0.82 + Math.random() * 0.3, offset: Math.random() * 0.03, fadeAt: 1.1, fadeLen: 0.5 });
    else this.playEndingSample('hammerWhiff', 0.7, false, { quiet: true, rate: 0.95 + Math.random() * 0.1 });
  }

  /** Bomb fuse: a sharp electronic beep (k 0..1 — higher and more urgent near the end). */
  public playBombBeep(k: number, last = false) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const f = 1200 + k * 900;
    this.whine(now, f, f, last ? 0.32 : 0.07, last ? 0.14 : 0.1, 'square');
  }

  /** Arco: the string being drawn — a slow wooden creak. */
  public playBowDraw() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noiseBurst(now + i * 0.32, 0.12, 0.08, 'bandpass', 420 + i * 60, 520 + i * 60, { q: 6 });
    this.whine(now, 90, 130, 1.8, 0.03, 'triangle');
  }

  /** Arco fully drawn: a deep thump and the ground humming under the pressure. */
  public playBowReady() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 110, 38, 0.4, 0.7);
    this.noiseBurst(now, 0.5, 0.22, 'lowpass', 500, 120, { verb: 0.3 });
    this.whine(now + 0.05, 1600, 2400, 0.35, 0.03, 'sine');
  }

  public playShoot(weapon: WeaponId) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // Recorded shots
    const rec = (id: EndingSample, gain: number, o: { fadeAt?: number; fadeLen?: number; duration?: number; offset?: number } = {}) =>
      this.playEndingSample(id, gain, false, { rate: pitchJitter, quiet: true, ...o });
    if (weapon === 'shotgun') {
      this.slashAlt = !this.slashAlt;
      return void rec(this.slashAlt ? 'shotgunNew1' : 'shotgunNew2', 0.6, { fadeAt: 1.0, fadeLen: 0.5 });
    }
    if (weapon === 'disco') {
      this.slashAlt = !this.slashAlt;
      return void rec(this.slashAlt ? 'cd1' : 'cd2', 0.6, { fadeAt: 0.5, fadeLen: 0.25 });
    }
    if (weapon === 'faces') return; // a looped, robotic stream (engine: faces loop)
    if (weapon === 'coice') return void rec('coiceShot', 0.65);
    if (weapon === 'besta') return void rec('crossbow', 0.75);
    // the clip opens on half a second of silence: start right at the launch, fade before the blast
    if (weapon === 'rocket') return void rec('bazooka', 0.7, { offset: 0.48, fadeAt: 0.55, fadeLen: 0.35 });
    if (weapon === 'nailgun') {
      const at = NAIL_TAKES[Math.floor(Math.random() * NAIL_TAKES.length)];
      return void rec('nails', 0.55, { offset: Math.max(0, at - 0.03), duration: 0.45 });
    }
    if (weapon === 'hammer') return; // its swing / hit are played when the blow resolves (playHammer)
    if (weapon === 'katana') {
      // two takes of the swing, alternating
      this.slashAlt = !this.slashAlt;
      return void rec(this.slashAlt ? 'slash1' : 'slash2', 0.55, { fadeAt: 0.5, fadeLen: 0.3 });
    }

    if (weapon === 'pistol' || weapon === 'pistols') {
      // The recorded Peacemaker shot, pitched a hair each time so it never machine-guns
      this.playEndingSample('pistol', weapon === 'pistols' ? 0.34 : 0.42, false, { rate: pitchJitter * (weapon === 'pistols' ? 1.06 : 1), quiet: true });
      return;
    }

    if (weapon === 'arco') {
      // String snap + the arrow hissing away
      this.whine(now, 320 * pitchJitter, 240, 0.25, 0.1, 'triangle');
      this.noiseBurst(now, 0.06, 0.35, 'bandpass', 900, 500, { q: 3 });
      this.noiseBurst(now + 0.02, 0.4, 0.18, 'highpass', 3800, 2200, { q: 0.8 });
      return;
    }

    if (weapon === 'dinamite') {
      // Underarm toss + the fuse starting to hiss
      this.noiseBurst(now, 0.18, 0.25, 'bandpass', 900 * pitchJitter, 300, { q: 1 });
      this.noiseBurst(now + 0.05, 0.6, 0.12, 'highpass', 5200, 6400, { q: 0.7 });
      return;
    }
    if (weapon === 'macarico') {
      // The roar itself is the looped torch sample (engine); just the odd crackle on top
      if (Math.random() < 0.25) this.noiseBurst(now, 0.03, 0.08, 'bandpass', 2600, 1800, { q: 2, crush: true });
      return;
    }
    if (weapon === 'corrente') {
      // Electric crack and buzz
      this.noiseBurst(now, 0.12, 0.42, 'highpass', 2400 * pitchJitter, 5200, { crush: true, verb: 0.2 });
      this.whine(now, 140, 90, 0.14, 0.12, 'sawtooth');
      return;
    }
    if (weapon === 'harpoon') {
      // Heavy spring thump + the line whistling out
      this.triggerPunchBody(now, 120 * pitchJitter, 34, 0.26, 0.8);
      this.noiseBurst(now, 0.12, 0.4, 'lowpass', 1800, 200, { crush: true });
      this.whine(now + 0.03, 1900 * pitchJitter, 700, 0.45, 0.06, 'sawtooth');
      return;
    }
    if (weapon === 'forkbomb') {
      // Hollow launcher thunk + a terminal "enter" blip
      this.triggerPunchBody(now, 140 * pitchJitter, 40, 0.22, 0.7);
      this.whine(now, 880, 880, 0.06, 0.08, 'square');
      this.whine(now + 0.07, 1320, 1320, 0.05, 0.07, 'square');
      return;
    }

    if (weapon === 'rmrf') return; // playRmRf handles it
    if (weapon === 'juiz') {
      // Heavy-frame magnum crack
      this.triggerPunchBody(now, 165 * pitchJitter, 36, 0.14, 0.7);
      this.noiseBurst(now, 0.12, 0.55, 'bandpass', 1700, 1500, { crush: true, verb: 0.2 });
      return;
    }

    if (weapon === 'railgun') {
      // Sonic crack + sub slam + falling electromagnetic whine
      this.triggerPunchBody(now, 210 * pitchJitter, 24, 0.36, 0.95);
      this.noiseBurst(now, 0.55, 0.92, 'lowpass', 6800, 160, { crush: true, verb: 0.35 });

      const zap = ctx.createOscillator();
      const zG = ctx.createGain();
      zap.type = 'sawtooth';
      zap.frequency.setValueAtTime(2600, now);
      zap.frequency.exponentialRampToValueAtTime(95, now + 0.3);
      zG.gain.setValueAtTime(0.34, now);
      zG.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      zap.connect(zG);
      zG.connect(this.sfxGain);
      zap.start(now);
      zap.stop(now + 0.33);
    } else if (weapon === 'plasma') {
      this.triggerPunchBody(now, 260 * pitchJitter, 58, 0.085, 0.42);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(960 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(135, now + 0.13);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      // Launcher thump + roaring exhaust
      this.triggerPunchBody(now, 150 * pitchJitter, 28, 0.32, 0.88);
      this.noiseBurst(now, 0.38, 0.62, 'bandpass', 980, 210, { crush: true, verb: 0.25 });
    }
  }

  /** fork(): a process splitting — square-wave blips climbing with each generation. */
  public playForkSplit(gen: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const f = 660 * Math.pow(1.5, gen);
    this.whine(now, f, f, 0.05, 0.05, 'square');
    this.whine(now + 0.04, f * 1.5, f * 1.5, 0.04, 0.04, 'square');
  }

  /** fork(): one process terminating — a small crunchy pop (up to eight overlap). */
  public playForkPop() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime + Math.random() * 0.03;
    this.triggerPunchBody(now, 160 + Math.random() * 60, 40, 0.14, 0.32);
    this.noiseBurst(now, 0.18, 0.28, 'lowpass', 2600, 300, { crush: true });
  }

  /** Harpoon bites: wet thunk + the winch ratcheting the line in. */
  public playHarpoonReel() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 110, 40, 0.18, 0.7);
    this.noiseBurst(now, 0.1, 0.35, 'bandpass', 900, 500, { q: 1.5 });
    for (let i = 0; i < 6; i++) this.noiseBurst(now + 0.04 + i * 0.04, 0.025, 0.2, 'highpass', 3200, 3200, { crush: true });
  }

  /** Nail driven through a body into steel. */
  public playNailPin() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 260, 70, 0.08, 0.5);
    this.playPipeClang(now, 0.5, this.sfxGain, this.sfxVerb);
  }

  public playBossAlert() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.driveCurve) return;
    const now = ctx.currentTime;

    // Distorted two-tone factory siren
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    for (let i = 0; i < 4; i++) {
      osc.frequency.setValueAtTime(i % 2 === 0 ? 196 : 277, now + i * 0.32);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.04);
    g.gain.setValueAtTime(0.16, now + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    osc.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.5);
    osc.start(now);
    osc.stop(now + 1.35);

    this.playPipeClang(now, 1.4, this.sfxGain, this.sfxVerb);
  }

  public playPortalOpen() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    // Rising detuned swell (dark fifth) opening up through a filter sweep
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(220, now);
    lp.frequency.exponentialRampToValueAtTime(2600, now + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    const oscs = [82.41, 82.41 * 1.008, 123.47, 164.81].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      return o;
    });
    lp.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.7);
    for (const o of oscs) {
      o.start(now);
      o.stop(now + 1.45);
    }
    this.playPipeClang(now + 0.05, 0.8, this.sfxGain, this.sfxVerb);
  }

  public playTreeEnter() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(130, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.9);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1);
    sub.connect(g);
    g.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 1.05);

    this.noiseBurst(now, 0.8, 0.3, 'bandpass', 600, 3800, { q: 2, verb: 0.6 });
    this.playPipeClang(now, 1.2, this.sfxGain, this.sfxVerb);
  }

  public playExplosion() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 110, 28, 0.3, 0.6);
    this.noiseBurst(now, 0.5, 0.6, 'lowpass', 1100, 90, { crush: true, verb: 0.3 });
  }

  public playHit(killed: boolean) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    if (!killed) {
      // Short metallic tick
      this.noiseBurst(now, 0.035, 0.2, 'bandpass', 3600, 3600, { q: 2 });
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, now);
      o.frequency.exponentialRampToValueAtTime(260, now + 0.05);
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(now);
      o.stop(now + 0.07);
      return;
    }

    // Kill: crunchy thud + crushed grit + bright steel ping
    this.triggerPunchBody(now, 150, 38, 0.12, 0.5);
    this.noiseBurst(now, 0.12, 0.34, 'bandpass', 1300, 600, { crush: true });
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    carrier.frequency.value = 1180;
    mod.frequency.value = 1180 * 2.41;
    modGain.gain.setValueAtTime(1600, now);
    modGain.gain.exponentialRampToValueAtTime(40, now + 0.15);
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.3);
    mod.start(now);
    carrier.start(now);
    mod.stop(now + 0.22);
    carrier.stop(now + 0.22);
  }

  public playDash() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Pneumatic whoosh
    this.noiseBurst(ctx.currentTime, 0.16, 0.26, 'bandpass', 600, 2600, { q: 1.6 });
  }

  public playHurt() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(55, now + 0.22);
    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
    this.noiseBurst(now, 0.14, 0.28, 'lowpass', 2400, 300, { crush: true });
  }

  public playVentHeat() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Pressurised steam release
    this.noiseBurst(ctx.currentTime, 0.32, 0.26, 'bandpass', 3200, 900, { q: 1.1, verb: 0.2 });
  }

  public playTombstoneBreak() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 120, 50, 0.12, 0.35);
    this.noiseBurst(now, 0.26, 0.34, 'lowpass', 1300, 160, { crush: true, verb: 0.2 });
  }

  public playCacheLoot() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    // Three steel clinks, rising
    [880, 1175, 1568].forEach((f, i) => {
      const t = now + i * 0.06;
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const g = ctx.createGain();
      carrier.frequency.value = f;
      mod.frequency.value = f * 3.5;
      modGain.gain.setValueAtTime(f * 1.2, t);
      modGain.gain.exponentialRampToValueAtTime(10, t + 0.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(g);
      g.connect(this.sfxGain!);
      this.sendTo(g, this.sfxVerb, 0.4);
      mod.start(t);
      carrier.start(t);
      mod.stop(t + 0.3);
      carrier.stop(t + 0.3);
    });
  }

  /** Tiny metallic click (mechanism parts, cartridges). */
  private metalClick(t: number, freq: number, gainVal: number) {
    if (!this.ctx || !this.sfxGain) return;
    this.noiseBurst(t, 0.022, gainVal, 'bandpass', freq, freq, { q: 5 });
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq * 0.37, t);
    g.gain.setValueAtTime(gainVal * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.025);
  }

  /** Soft harmonic FM bell (health / restore cues). */
  private softBell(t: number, freq: number, gainVal: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = freq;
    mod.frequency.value = freq * 2;
    modGain.gain.setValueAtTime(freq * 0.9, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.5);
    mod.start(t);
    carrier.start(t);
    mod.stop(t + 0.75);
    carrier.stop(t + 0.75);
  }

  /** Rising whine (energy cells charging, servos). */
  private whine(t: number, from: number, to: number, dur: number, gainVal: number, type: OscillatorType = 'sawtooth') {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(from * 2, t);
    bp.frequency.exponentialRampToValueAtTime(to * 1.5, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /**
   * Weapon pickup: grab thud, then a mechanism sound that depends on the weapon family —
   * ballistic guns rack ("chk-chk"), energy weapons seat a cell and charge up, the launcher
   * latches with a servo. Reloads add cartridge clicks; swaps start with the old gun clattering down.
   */
  public playWeaponPickup(weapon: WeaponId, kind: 'equip' | 'reload' | 'swap') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    let t = ctx.currentTime;
    if (weapon === 'shotgun') {
      // the recorded rack: picking the shotgun up / pumping it ready
      this.playEndingSample('shotgunRack', 0.7, false, { quiet: true });
      return;
    }

    if (kind === 'swap') {
      // Old weapon hits the ground
      this.noiseBurst(t, 0.14, 0.2, 'bandpass', 3000, 1600, { q: 2.5 });
      this.metalClick(t + 0.03, 4300, 0.12);
      this.metalClick(t + 0.09, 3600, 0.08);
      t += 0.12;
    }

    // Grab: weapon slaps into the hand
    this.triggerPunchBody(t, 150, 60, 0.07, 0.32);
    this.noiseBurst(t, 0.06, 0.2, 'bandpass', 2200, 1300, { q: 1.4 });
    t += 0.09;

    if (kind === 'reload') {
      // Cartridges / cells slotted in
      for (let i = 0; i < 3; i++) this.metalClick(t + i * 0.055, 4200 + i * 350, 0.13);
      t += 0.2;
    }

    if (weapon === 'katana') {
      // Blade drawn from the sheath: long steel "shing"
      this.noiseBurst(t, 0.35, 0.2, 'bandpass', 3000, 7500, { q: 4 });
      this.whine(t, 2200, 4200, 0.4, 0.05, 'sine');
      this.softBell(t + 0.12, 2637, 0.05);
    } else if (weapon === 'hammer') {
      // Heavy head thunks into the palm, then rests on the shoulder
      this.triggerPunchBody(t, 85, 38, 0.16, 0.5);
      this.metalClick(t + 0.02, 1100, 0.25);
      this.noiseBurst(t + 0.18, 0.08, 0.15, 'lowpass', 900, 300);
    } else if (weapon === 'plasma' || weapon === 'railgun') {
      const rail = weapon === 'railgun';
      this.metalClick(t, 3000, 0.26);
      this.whine(t + 0.03, rail ? 520 : 300, rail ? 2600 : 1700, rail ? 0.42 : 0.32, 0.12);
      if (rail) this.noiseBurst(t + 0.05, 0.38, 0.08, 'highpass', 6000, 6000);
      // "Ready" blip
      this.softBell(t + (rail ? 0.44 : 0.34), rail ? 1760 : 1320, 0.07);
    } else if (weapon === 'rocket') {
      this.triggerPunchBody(t, 95, 40, 0.12, 0.42);
      this.metalClick(t, 1500, 0.3);
      this.whine(t + 0.06, 110, 190, 0.24, 0.1, 'square');
      this.metalClick(t + 0.32, 2200, 0.32);
    } else {
      // Ballistic rack: back, forward (the shotgun has its own recorded rack)
      const low = weapon === 'coice';
      this.metalClick(t, low ? 1700 : 2600, 0.32);
      this.metalClick(t + 0.012, low ? 3400 : 5200, 0.12);
      this.metalClick(t + (low ? 0.16 : 0.12), low ? 1400 : 2100, 0.34);
      this.triggerPunchBody(t + (low ? 0.16 : 0.12), low ? 120 : 160, 70, 0.05, 0.22);
    }
  }

  /** Spent casing hitting the floor (throttled so rapid fire doesn't turn into a buzz). */
  public playCasingTink() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastCasingTinkAt < 0.07) return;
    this.lastCasingTinkAt = now;
    const f = 5200 + Math.random() * 1800;
    this.metalClick(now, f, 0.05);
    this.metalClick(now + 0.05 + Math.random() * 0.03, f * 1.08, 0.025);
  }

  /** Mechanical keyboard click (terminal boot typing). */
  public playKeyClick() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.025, 0.09, 'bandpass', 2600 + Math.random() * 1600, 2000, { q: 2 });
    this.noiseBurst(now + 0.012, 0.03, 0.05, 'lowpass', 600, 300);
  }

  /** CRT power/glitch burst when the terminal hands over to the game. */
  /** Hate ending, the grey wasteland: a low wind that never lets up. Returns a stop (fade) function. */
  public playAshWind(): (fadeSec?: number) => void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return () => {};
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;
    // the gusts: the filter breathes slowly
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 1.6);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    lfo.start(now);
    let stopped = false;
    return (fadeSec = 0.8) => {
      if (stopped || !this.ctx) return;
      stopped = true;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fadeSec));
      try {
        src.stop(t + fadeSec + 0.05);
        lfo.stop(t + fadeSec + 0.05);
      } catch {
        /* already stopped */
      }
    };
  }

  /** Something huge breaking off and coming down (size 0..1). */
  public playCrumble(size = 0.5) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.6 + size * 0.9, 0.35 + size * 0.45, 'lowpass', 900, 120, { verb: 0.35 });
    this.noiseBurst(now + 0.05, 0.25, 0.18 + size * 0.2, 'bandpass', 2400, 700, { q: 1.2, crush: true });
    this.triggerPunchBody(now + 0.02, 70, 28, 0.5 + size * 0.6, 0.5 + size * 0.5);
  }

  /** The Tree's whole structure groaning as it sinks. */
  public playGroan() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.whine(now, 62 + Math.random() * 20, 38, 1.8, 0.12, 'sawtooth');
    this.whine(now + 0.1, 140, 90, 1.4, 0.04, 'triangle');
  }

  /** The PC dies into a blue screen: a hard pop, a short electrical buzz, then quiet. */
  public playPcCrash() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.12, 0.6, 'lowpass', 2200, 400, { crush: true });
    this.whine(now, 120, 118, 0.7, 0.12, 'square');
    this.whine(now, 15600, 15600, 2.4, 0.025, 'sine');
  }

  public playCrtGlitch() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.35, 0.25, 'bandpass', 4000, 300, { q: 0.8, crush: true });
    this.whine(now, 15000, 60, 0.4, 0.06, 'sine');
  }

  // ───────────── Enemy telegraph & status cues ─────────────

  /** "!" sting when a cowboy is about to lunge. */
  public playAlert() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.whine(now, 1400, 2100, 0.09, 0.07, 'square');
    this.metalClick(now, 4800, 0.1);
  }

  /** Green mage chanting: eerie rising choir-ish drone. */
  public playChant(duration: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.06, now + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.6);
    for (const [f, d] of [
      [220, 0],
      [330, 6],
      [440, -5],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, now);
      o.frequency.linearRampToValueAtTime(f * 1.5, now + duration);
      o.detune.value = d;
      o.connect(g);
      o.start(now);
      o.stop(now + duration + 0.05);
    }
  }

  /** Bull pawing the ground before a charge. */
  public playHoofScrape() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.noiseBurst(ctx.currentTime, 0.14, 0.22, 'bandpass', 700, 300, { q: 1.2, crush: true });
  }

  /** Skull-ship empowering an ally. */
  public playBuff() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.whine(now, 300, 1200, 0.5, 0.09, 'sawtooth');
    this.softBell(now + 0.45, 784, 0.1);
    this.softBell(now + 0.55, 1175, 0.08);
  }

  /** Juggernaut firing artillery rockets skyward. */
  public playArtilleryLaunch() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.noiseBurst(now + i * 0.11, 0.3, 0.3, 'bandpass', 600, 2400, { q: 1, crush: true });
  }

  /** Incoming shell whistle (plays before an artillery impact). */
  public playIncoming(duration: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.whine(ctx.currentTime, 2400, 700, duration, 0.04, 'sine');
  }

  /** Spore glob bursting into a mist cloud. */
  public playPoisonSplat() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.35, 0.3, 'lowpass', 1400, 200, { verb: 0.3 });
    this.whine(now, 220, 90, 0.4, 0.06, 'sine');
  }

  /** rm -rf: a wall of crushed digital noise, a falling sweep and a sub thump — data being shredded. */
  public playRmRf() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 90, 25, 0.5, 1.0);
    this.noiseBurst(now, 0.9, 0.7, 'lowpass', 6000, 300, { crush: true, verb: 0.5 });
    this.whine(now, 4800, 90, 0.8, 0.12, 'square');
    this.whine(now + 0.05, 2400, 60, 0.7, 0.08, 'sawtooth');
    for (let i = 0; i < 10; i++) {
      this.noiseBurst(now + 0.1 + i * 0.05, 0.04, 0.2, 'bandpass', 800 + Math.random() * 5000, 900, { q: 4, crush: true });
    }
  }

  private lastTeleportAt = -1;
  /** Red warp-in: a falling digital zap + crushed static (throttled for group spawns). */
  public playTeleportIn() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastTeleportAt < 0.12) return;
    this.lastTeleportAt = now;
    this.whine(now, 3200, 260, 0.5, 0.05, 'square');
    this.noiseBurst(now, 0.45, 0.14, 'bandpass', 2400, 600, { q: 2, crush: true });
    this.triggerPunchBody(now + 0.78, 120, 40, 0.12, 0.35);
  }

  /** Spider fuse beep (gets faster before it blows). */
  public playFuseBeep() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.whine(ctx.currentTime, 1800, 1800, 0.05, 0.05, 'square');
  }

  /** Dead spider's detonation: sharp crack, deep sub boom, long gritty roar and falling debris. */
  public playSpiderBlast() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, 0.09, 0.9, 'highpass', 2600, 1200, { crush: true });
    this.triggerPunchBody(now, 140, 22, 0.75, 0.95);
    this.triggerPunchBody(now + 0.03, 70, 18, 1.1, 0.7);
    this.noiseBurst(now, 1.5, 0.75, 'lowpass', 2600, 60, { crush: true, verb: 0.55 });
    this.noiseBurst(now + 0.08, 0.9, 0.35, 'bandpass', 700, 160, { q: 0.9, verb: 0.4 });
    // Debris pattering down
    for (let k = 0; k < 6; k++) {
      this.noiseBurst(now + 0.35 + k * 0.09 + Math.random() * 0.05, 0.05, 0.12, 'bandpass', 2500 + Math.random() * 2000, 1800, { q: 2 });
    }
  }

  /** Blade cuts a projectile out of the air: bright steel ting (stacked per projectile). */
  public playParry(count = 1) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < Math.min(3, count); i++) {
      const t = now + i * 0.035;
      this.metalClick(t, 6200 + Math.random() * 1500, 0.22);
      this.softBell(t, 2093 + i * 350, 0.07);
    }
  }

  /** Melee impact: katana = wet slice; sledgehammer = crushing slam with a steel ring. */
  public playMeleeHit(style: 'slash' | 'slam') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    if (style === 'slash') {
      this.noiseBurst(now, 0.12, 0.45, 'highpass', 2800, 2800, { q: 0.7 });
      this.noiseBurst(now + 0.01, 0.16, 0.38, 'bandpass', 900, 400, { q: 1.2, crush: true });
      this.triggerPunchBody(now, 160, 60, 0.07, 0.35);
      return;
    }
    this.triggerPunchBody(now, 100, 26, 0.22, 0.95);
    this.noiseBurst(now, 0.2, 0.6, 'lowpass', 2200, 120, { crush: true, verb: 0.3 });
    this.playPipeClang(now, 0.6, this.sfxGain, this.sfxVerb);
  }

  // ───────────── Intro cutscene: muscle car ─────────────

  /**
   * Running V8 voice. Returns a handle the cutscene drives every frame
   * (speed 0..1 = idle → flat out, pan -1..1 = screen position).
   */
  public startCarEngine(): { setSpeed(s: number): void; setPan(p: number): void; stop(fade?: number): void } | null {
    if (this.muted) return null;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.driveCurve) return null;
    const now = ctx.currentTime;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const sub = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    sub.type = 'square';
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    oscA.connect(pre);
    oscB.connect(pre);
    sub.connect(pre);

    // V8 "lope": amplitude wobble tied to rpm
    const lope = ctx.createOscillator();
    const lopeDepth = ctx.createGain();
    lope.frequency.value = 9;
    lopeDepth.gain.value = 0.3;
    const lopeGain = ctx.createGain();
    lopeGain.gain.value = 0.7;
    lope.connect(lopeDepth);
    lopeDepth.connect(lopeGain.gain);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.driveCurve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    const pan = ctx.createStereoPanner();

    pre.connect(lopeGain);
    lopeGain.connect(shaper);
    shaper.connect(lp);
    lp.connect(out);
    out.connect(pan);
    pan.connect(this.sfxGain);

    for (const o of [oscA, oscB, sub, lope]) o.start(now);

    const setSpeed = (s: number) => {
      const t = ctx.currentTime;
      const v = Math.max(0, Math.min(1, s));
      const f = 42 + v * 88;
      oscA.frequency.setTargetAtTime(f, t, 0.06);
      oscB.frequency.setTargetAtTime(f * 2.02, t, 0.06);
      sub.frequency.setTargetAtTime(f / 2, t, 0.06);
      lope.frequency.setTargetAtTime(6 + v * 22, t, 0.08);
      lp.frequency.setTargetAtTime(380 + v * 2600, t, 0.06);
      out.gain.setTargetAtTime(0.06 + v * 0.2, t, 0.06);
    };
    setSpeed(0.5);
    return {
      setSpeed,
      setPan: (p: number) => pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), ctx.currentTime, 0.05),
      stop: (fade = 0.4) => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0.0001, t, fade / 4);
        for (const o of [oscA, oscB, sub, lope]) o.stop(t + fade + 0.1);
      },
    };
  }

  /** Tyre screech for the drift. */
  public playTireScreech(dur: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.08);
    g.gain.setValueAtTime(0.32, now + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    for (const [f, q] of [
      [2300, 9],
      [3100, 12],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f, now);
      bp.frequency.linearRampToValueAtTime(f * 0.82, now + dur);
      src.connect(bp);
      bp.connect(g);
    }
    // Rubber squeal tone wobbling on top
    const squeal = ctx.createOscillator();
    const wob = ctx.createOscillator();
    const wobDepth = ctx.createGain();
    squeal.type = 'sawtooth';
    squeal.frequency.setValueAtTime(1750, now);
    squeal.frequency.linearRampToValueAtTime(1350, now + dur);
    wob.frequency.value = 23;
    wobDepth.gain.value = 60;
    wob.connect(wobDepth);
    wobDepth.connect(squeal.frequency);
    const sg = ctx.createGain();
    sg.gain.value = 0.05;
    const sbp = ctx.createBiquadFilter();
    sbp.type = 'bandpass';
    sbp.frequency.value = 1700;
    sbp.Q.value = 4;
    squeal.connect(sbp);
    sbp.connect(sg);
    sg.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.25);
    src.start(now, Math.random());
    squeal.start(now);
    wob.start(now);
    src.stop(now + dur + 0.05);
    squeal.stop(now + dur + 0.05);
    wob.stop(now + dur + 0.05);
  }

  /** Car hitting a body at speed. */
  public playCarImpact() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 130, 30, 0.2, 0.9);
    this.noiseBurst(now, 0.16, 0.55, 'lowpass', 2800, 200, { crush: true });
    this.noiseBurst(now + 0.02, 0.1, 0.25, 'bandpass', 4200, 2500, { q: 3 });
  }

  /** Electrical short circuit: crackling arcs + a zap. */
  public playShortCircuit(intensity = 1) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = now + i * (0.02 + Math.random() * 0.05);
      this.noiseBurst(t, 0.03 + Math.random() * 0.05, 0.3 * intensity, 'highpass', 2500 + Math.random() * 4000, 2500, {
        crush: true,
        verb: 0.25,
      });
    }
    this.whine(now, 2400, 300, 0.18, 0.12 * intensity, 'sawtooth');
  }

  /** Machine powering down: falling whine + final thunk. */
  public playPowerDown() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(32, now + 1.8);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(150, now + 1.8);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.4);
    o.start(now);
    o.stop(now + 2);
    this.triggerPunchBody(now + 1.75, 90, 30, 0.2, 0.6);
  }

  /** Heavy steel shutter slamming open upward: rumble while rising + a final bang. */
  public playShutterOpen(rise: number) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.noiseBurst(now, rise, 0.35, 'lowpass', 500, 160, { crush: true, verb: 0.3 });
    this.triggerPunchBody(now + rise, 120, 28, 0.28, 1.0);
    this.noiseBurst(now + rise, 0.3, 0.55, 'lowpass', 2400, 120, { crush: true, verb: 0.5 });
    this.playPipeClang(now + rise, 1.8, this.sfxGain, this.sfxVerb);
  }

  /** Car door kicked open: bang + sheet-metal clang. */
  public playDoorKick() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 140, 40, 0.16, 0.85);
    this.noiseBurst(now, 0.12, 0.5, 'bandpass', 1800, 700, { q: 1.2, crush: true });
    this.playPipeClang(now, 1.3, this.sfxGain, this.sfxVerb);
  }

  /** Last-kill slow-motion: deep impact boom with a long metallic tail. */
  public playSlowMoImpact() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 1.1);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.7, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    sub.connect(g);
    g.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 1.25);
    this.noiseBurst(now, 0.9, 0.3, 'lowpass', 1600, 60, { verb: 0.6 });
    this.playPipeClang(now, 1.1, this.sfxGain, this.sfxVerb);
  }

  /** Muffles the soundtrack while kill slow-motion is active. */
  public setSlowMo(active: boolean) {
    if (!this.ctx || !this.musicSlowMoFilter) return;
    const now = this.ctx.currentTime;
    this.musicSlowMoFilter.frequency.cancelScheduledValues(now);
    this.musicSlowMoFilter.frequency.setTargetAtTime(active ? 420 : 20000, now, active ? 0.05 : 0.25);
  }

  /** Health pickup: heartbeat, rising restore chime and a breath of air. */
  public playHealthPickup() {
    if (this.muted) return;
    this.playEndingSample('health', 0.7, false, { quiet: true });
  }

  public playUnlockFanfare() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    // Two heavy power-chord hits (E → G) + steel shimmer
    this.playGuitar(52, now, true, 0.22, 2600, this.sfxGain);
    this.playGuitar(55, now + 0.16, true, 0.24, 3000, this.sfxGain);
    this.playPipeClang(now + 0.16, 0.7, this.sfxGain, this.sfxVerb);
  }

  public playBossSlam() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(118, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.42);
    subGain.gain.setValueAtTime(0.75, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.48);

    this.noiseBurst(now, 0.52, 0.62, 'lowpass', 1100, 75, { verb: 0.35 });
  }

  public playBossVoice(kind: 'spawn' | 'leap' | 'barrage' | 'enrage' | 'death') {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.crusherCurve) return;
    const now = ctx.currentTime;
    const interrupting = kind === 'death' || kind === 'spawn';
    if (!interrupting && now - this.lastBossVoiceAt < 2.2) return;
    if (!interrupting && now < this.activeVoiceEndsAt) return; // never talk over the current line
    this.lastBossVoiceAt = now;

    if (interrupting && this.activeVoice) {
      try {
        this.activeVoice.stop(now + 0.02);
      } catch {
        // already ended
      }
      this.activeVoice = null;
      this.activeVoiceEndsAt = 0;
    }

    // Spoken lines are reserved for the fight's bookends: intro (spawn) and shutdown (death)
    const clip: BossVoiceClip | null = kind === 'spawn' ? 'reboot' : kind === 'death' ? 'everywhere' : null;
    const recorded = clip ? this.voiceBuffers[clip] : undefined;

    // Duck the music so the voice cuts through
    const duckFor = recorded ? recorded.duration : 1.8;
    if (this.musicGain && !this.musicPaused) {
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setTargetAtTime(0.18, now, 0.04);
      this.musicGain.gain.setTargetAtTime(SynthAudioEngine.MUSIC_LEVEL, now + duckFor, 0.25);
    }

    if (recorded) {
      this.playRecordedBossVoice(recorded, now);
      // Quiet whispered chorus under the recorded line, roughly matching its length
      const syllablesUnder = Math.max(3, Math.round((recorded.duration - 0.4) / 0.3));
      const underPattern = this.makeWhisperPattern(syllablesUnder, 1);
      [-0.8, 0.8].forEach((pan, v) => {
        this.playWhisperVoice(now + 0.06 + v * 0.05, underPattern, {
          gain: 0.3,
          pan,
          formantShift: 0.76 + v * 0.08,
          dest: this.sfxGain!,
          verb: this.sfxVerb,
          wet: 0.95,
        });
      });
      return;
    }

    // Whispered chorus stands in for the spoken lines only if their clips are unavailable
    if (kind === 'spawn' || kind === 'death') {
      const syllables = kind === 'spawn' ? 8 : 9;
      const pattern = this.makeWhisperPattern(syllables, kind === 'death' ? 1.5 : 1.05);
      [-0.75, 0, 0.75].forEach((pan, v) => {
        this.playWhisperVoice(now + v * 0.035, pattern, {
          gain: 0.62,
          pan,
          formantShift: 0.74 + v * 0.07,
          dest: this.sfxGain!,
          verb: this.sfxVerb,
          wet: 0.9,
        });
      });
    }

    // Deep vocoder growl underneath the whispers
    const syl: { t: number; dur: number; pitch: number; formant: number }[] =
      kind === 'spawn'
        ? [
            { t: 0.0, dur: 0.24, pitch: 54, formant: 410 },
            { t: 0.26, dur: 0.16, pitch: 52, formant: 650 },
            { t: 0.44, dur: 0.24, pitch: 50, formant: 500 },
            { t: 0.7, dur: 0.14, pitch: 48, formant: 720 },
            { t: 0.88, dur: 0.32, pitch: 42, formant: 320 },
          ]
        : kind === 'enrage' || kind === 'barrage'
          ? [
              { t: 0.0, dur: 0.14, pitch: 60, formant: 480 },
              { t: 0.16, dur: 0.2, pitch: 64, formant: 800 },
              { t: 0.38, dur: 0.16, pitch: 58, formant: 560 },
              { t: 0.56, dur: 0.22, pitch: 55, formant: 420 },
              { t: 0.84, dur: 0.34, pitch: 46, formant: 340 },
            ]
          : kind === 'leap'
            ? [
                { t: 0.0, dur: 0.18, pitch: 70, formant: 540 },
                { t: 0.2, dur: 0.26, pitch: 50, formant: 340 },
              ]
            : [
                { t: 0.0, dur: 0.28, pitch: 58, formant: 500 },
                { t: 0.32, dur: 0.32, pitch: 46, formant: 350 },
                { t: 0.68, dur: 0.55, pitch: 32, formant: 200 },
              ];

    const totalEnd = syl[syl.length - 1].t + syl[syl.length - 1].dur + 0.08;
    const carrierA = ctx.createOscillator();
    const carrierB = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    carrierA.type = 'sawtooth';
    carrierB.type = 'sawtooth';
    subOsc.type = 'square';

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.crusherCurve;
    const formantFilter = ctx.createBiquadFilter();
    formantFilter.type = 'bandpass';
    formantFilter.Q.value = 3.2;
    const lowBoost = ctx.createBiquadFilter();
    lowBoost.type = 'lowpass';
    lowBoost.frequency.value = 1350;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);

    for (const s of syl) {
      const start = now + s.t;
      const end = start + s.dur;
      carrierA.frequency.setValueAtTime(s.pitch, start);
      carrierB.frequency.setValueAtTime(s.pitch * 1.498, start);
      subOsc.frequency.setValueAtTime(s.pitch * 0.5, start);
      formantFilter.frequency.setValueAtTime(s.formant, start);
      formantFilter.frequency.exponentialRampToValueAtTime(Math.max(180, s.formant * 0.72), end);
      env.gain.setValueAtTime(0.01, start);
      env.gain.linearRampToValueAtTime(0.17, start + 0.025);
      env.gain.exponentialRampToValueAtTime(0.02, end);
    }

    carrierA.connect(shaper);
    carrierB.connect(shaper);
    subOsc.connect(shaper);
    shaper.connect(formantFilter);
    formantFilter.connect(lowBoost);
    lowBoost.connect(env);
    env.connect(this.sfxGain);
    this.sendTo(env, this.sfxVerb, 0.35);

    carrierA.start(now);
    carrierB.start(now);
    subOsc.start(now);
    carrierA.stop(now + totalEnd);
    carrierB.stop(now + totalEnd);
    subOsc.stop(now + totalEnd);
  }

  /** Recorded boss line: low-cut + presence lift, light hall reverb. */
  private playRecordedBossVoice(buf: AudioBuffer, time: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2600;
    presence.Q.value = 0.9;
    presence.gain.value = 3;
    const g = ctx.createGain();
    g.gain.value = 1.05;
    src.connect(hp);
    hp.connect(presence);
    presence.connect(g);
    g.connect(this.sfxGain);
    this.sendTo(g, this.sfxVerb, 0.3);
    src.start(time);
    src.onended = () => {
      if (this.activeVoice === src) this.activeVoice = null;
    };
    this.activeVoice = src;
    this.activeVoiceEndsAt = time + buf.duration;
  }

  /** The cemetery gate grinding shut / dragging open (the recorded gate, faded out after ~2.4 s). */
  public playGate() {
    if (this.muted) return;
    this.playEndingSample('gate', 0.85, false, { quiet: true, fadeAt: 2.2, fadeLen: 0.6 });
  }

  public playGateClang() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.triggerPunchBody(now, 110, 40, 0.3, 0.5);
    this.playPipeClang(now, 1.6, this.sfxGain, this.sfxVerb);
    this.noiseBurst(now, 0.4, 0.3, 'lowpass', 1800, 200, { verb: 0.4 });
  }

  public playThunder() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.noiseBurst(ctx.currentTime, 1.4, 0.65, 'lowpass', 980, 45, { verb: 0.5 });
  }

  public playWoodSplinter() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.noiseBurst(ctx.currentTime, 0.14, 0.32, 'bandpass', 1350 + Math.random() * 400, 900, { q: 1.8 });
  }
}

export const synthAudio = new SynthAudioEngine();
