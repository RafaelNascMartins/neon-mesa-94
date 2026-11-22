import * as THREE from 'three';
import type { ArenaZone } from './types';

/**
 * "Rave" lighting rig layered over each sector:
 *  - four coloured lamps sweeping around the arena, pumping with the music's kick and
 *    swapping colours on hard hits
 *  - a white strobe that fires on the strongest beats
 *  - fluorescent failures: every few seconds the main lights stutter / black out briefly
 * The light count never changes (only intensities), so materials never recompile.
 */

const PALETTES: Record<ArenaZone, number[]> = {
  road: [0xff2a55, 0x2ee6d6, 0xff8a2b, 0xb04dff],
  desert: [0xff8a2b, 0xff2a55, 0x2ee6d6, 0xffd166],
  cemetery: [0x2ee6d6, 0x7a5cff, 0xff2a85, 0x22ffaa],
  clearing: [0xff4a1a, 0xffb020, 0xff2a55, 0xff6a00],
  tree: [0xff2a10, 0xff6a00, 0xff0040, 0xffb020], // industrial hell
};

export class RaveLights {
  private lamps: THREE.PointLight[] = [];
  private strobe: THREE.PointLight;
  private colorIdx = 0;
  private colorCooldown = 0;
  private strobeTimer = 0;
  private strobeCooldown = 0;

  // Fluorescent failure state
  private nextFailure = 5;
  private failureTimer = 0;
  private failureFactor = 1;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 42, 1.3);
      l.castShadow = false;
      scene.add(l);
      this.lamps.push(l);
    }
    this.strobe = new THREE.PointLight(0xffffff, 0, 60, 1.1);
    this.strobe.position.set(0, 15, 0);
    scene.add(this.strobe);
  }

  /**
   * @param pulse   0..1 music kick from the audio engine
   * @param hell    0..1 how deep into the industrial hell (tree depth)
   * @returns       multiplier for the sector's key/fill lights (fluorescent failures)
   */
  update(dt: number, elapsed: number, zone: ArenaZone, pulse: number, hell: number, active: boolean): number {
    const palette = PALETTES[zone];

    // Colour swap on hard hits
    this.colorCooldown -= dt;
    if (pulse > 0.72 && this.colorCooldown <= 0) {
      this.colorIdx = (this.colorIdx + 1) % palette.length;
      this.colorCooldown = 0.45;
    }

    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      if (!active) {
        l.intensity = 0;
        continue;
      }
      // Moving-head sweep around the arena
      const a = elapsed * (0.35 + i * 0.07) * (i % 2 === 0 ? 1 : -1) + (i * Math.PI) / 2;
      const r = 15 + Math.sin(elapsed * 0.5 + i) * 6;
      l.position.set(Math.cos(a) * r, 7 + Math.sin(elapsed * 1.3 + i) * 1.5, Math.sin(a) * r);
      l.color.setHex(palette[(this.colorIdx + i) % palette.length]);
      l.intensity = (5 + hell * 4) + pulse * (55 + hell * 20);
    }

    // Strobe on the strongest beats
    this.strobeCooldown -= dt;
    if (active && pulse > 0.88 && this.strobeCooldown <= 0 && Math.random() < 0.35) {
      this.strobeTimer = 0.05;
      this.strobeCooldown = 0.9;
    }
    if (this.strobeTimer > 0) {
      this.strobeTimer -= dt;
      this.strobe.intensity = 140;
    } else {
      this.strobe.intensity = 0;
    }

    // Fluorescent failures: random stutter of the main lights, deeper hell = more often
    this.nextFailure -= dt;
    if (this.nextFailure <= 0 && this.failureTimer <= 0) {
      this.failureTimer = 0.35 + Math.random() * 0.8;
      this.nextFailure = (6 + Math.random() * 9) * (1 - hell * 0.5);
    }
    if (this.failureTimer > 0) {
      this.failureTimer -= dt;
      // Chattering on/off at ~30 Hz with occasional full blackout frames
      const chatter = Math.sin(elapsed * 190) * Math.sin(elapsed * 47);
      this.failureFactor = chatter > 0.15 ? 1 : chatter > -0.4 ? 0.45 : 0.08;
    } else {
      this.failureFactor += (1 - this.failureFactor) * Math.min(1, dt * 12);
    }
    return this.failureFactor;
  }
}
