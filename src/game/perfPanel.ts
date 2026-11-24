/**
 * `?perf` overlay: FPS, frame time (average and worst over the last half second), how much the
 * GPU is asked to draw, shader programs (a jump mid-game = a recompile hitch) and HUD pushes.
 */
export interface PerfStats {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  enemies: number;
  lights: number;
}

const WINDOW_MS = 500;

export class PerfPanel {
  private el = document.createElement('div');
  private windowStart = 0;
  private frames = 0;
  private cpuSum = 0;
  private gapMax = 0;
  private lastFrame = 0;
  private hud = 0;
  private lastPrograms = -1;
  private programJumps = 0;

  constructor(container: HTMLElement) {
    this.el.style.cssText =
      'position:absolute;top:8px;right:8px;z-index:60;pointer-events:none;white-space:pre;' +
      'font:12px/1.35 ui-monospace,Consolas,monospace;color:#d8ffd8;background:rgba(0,0,0,0.72);' +
      'padding:6px 8px;border:1px solid rgba(120,255,140,0.35);';
    container.appendChild(this.el);
  }

  /** A HUD snapshot was actually pushed to React. */
  hudPush() {
    this.hud++;
  }

  /** Once per frame: `now` is when the frame started, `cpuMs` how long the engine spent on it. */
  frame(now: number, cpuMs: number, s: PerfStats) {
    if (this.lastFrame > 0) this.gapMax = Math.max(this.gapMax, now - this.lastFrame);
    this.lastFrame = now;
    this.frames++;
    this.cpuSum += cpuMs;
    if (this.lastPrograms >= 0 && s.programs > this.lastPrograms) this.programJumps++;
    this.lastPrograms = s.programs;
    if (this.windowStart === 0) this.windowStart = now;
    const span = now - this.windowStart;
    if (span < WINDOW_MS) return;

    const fps = (this.frames * 1000) / span;
    const cpu = this.cpuSum / this.frames;
    const hudRate = (this.hud * 1000) / span;
    const tri = s.triangles >= 1000 ? `${(s.triangles / 1000).toFixed(1)}k` : String(s.triangles);
    this.el.style.color = fps < 50 ? (fps < 30 ? '#ff8a8a' : '#ffe08a') : '#d8ffd8';
    this.el.textContent =
      `FPS        ${fps.toFixed(0)}\n` +
      `frame CPU  ${cpu.toFixed(2)} ms\n` +
      `pior frame ${this.gapMax.toFixed(1)} ms\n` +
      `draw calls ${s.calls}\n` +
      `triângulos ${tri}\n` +
      `luzes      ${s.lights}\n` +
      `shaders    ${s.programs}${this.programJumps ? `  (+${this.programJumps} recompilações)` : ''}\n` +
      `geometrias ${s.geometries}  texturas ${s.textures}\n` +
      `inimigos   ${s.enemies}\n` +
      `HUD/s      ${hudRate.toFixed(0)}`;

    this.windowStart = now;
    this.frames = 0;
    this.cpuSum = 0;
    this.gapMax = 0;
    this.hud = 0;
  }

  dispose() {
    this.el.remove();
  }
}
