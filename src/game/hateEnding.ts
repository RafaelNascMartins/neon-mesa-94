import * as THREE from 'three';
import { buildDeadFace, type DeadFace } from './deadFace';
import { FACE_ACCESSORY } from './heroOutfits';
import type { HateStage } from './hateStage';

/**
 * Final do ÓDIO — a máscara cai. (Design: docs/neon94-final-odio.md)
 *
 * Self-contained cutscene controller, staged in hateStage.ts (a dead shaft inside the Tree).
 * The engine owns the scene; this file drives camera, hero and boss, and undoes everything it
 * touched on the hero in `restore()`. The scene outside the PC (pcRoom.ts) follows it.
 *
 * Timeline (seconds):
 *    0.0 – 4.5   Looking up the shaft at the light; the camera slowly tilts down to the floor.
 *    4.5 – 10.5  Behind the cowboy: he walks, slow and heavy; reaches over his shoulder for the
 *                gun on his back and flings it aside. Lines start.
 *   10.5 – 16.4  Behind the trembling boss, cornered: the cowboy keeps coming; draws the pistol
 *                from his holster and flings it off the other way.
 *   16.4 – 21.0  Side shot: he stops, reaches out, grabs the boss's head.
 *   21.0 –       Boss POV. The face, too still. The mask unsticks from the right side, hangs,
 *                then drops away slowly: underneath, a burnt, rotten human face that should not
 *                be alive, two black holes for eyes. It twitches. The jaw drops, too far. It pulls
 *                back… and lunges.
 *   32.9         Red, then black. 34.3 → onFinished().
 */

export type HateEndingSound =
  | 'heartbeat'
  | 'talk' // starts his voice (it runs while the line is on screen)
  | 'talk_end'
  | 'gun_land' // a thrown gun hitting the floor
  | 'gun_throw'
  | 'gun_draw' // the pistol leaving its holster
  | 'grab'
  | 'music_down' // the reveal starts: the music begins to sink
  | 'mask_peel'
  | 'mask_fall' // mascara_caindo.mp3: plays as he draws back to strike
  | 'mask_land'
  | 'jaw'
  | 'chomp' // the kill
  | 'sting';

export interface HateEndingHost {
  camera: THREE.PerspectiveCamera;
  /** Places the camera (the engine adds its own shake from `trauma`). */
  aim(pos: THREE.Vector3, target: THREE.Vector3): void;
  /** World position of the stage's centre (all choreography is relative to it). */
  origin: THREE.Vector3;
  stage: HateStage;
  /** Hero root (moves/turns) and the cowboy model inside it (named parts). */
  heroRoot: THREE.Object3D;
  heroModel: THREE.Object3D;
  /** The beaten boss: root (placed/turned here) and its body (leans and shakes). */
  boss: THREE.Object3D;
  bossBody: THREE.Object3D;
  setLetterbox(k: number): void;
  setSubtitle(text: string | null): void;
  fadeEl: HTMLElement;
  shake(amount: number): void;
  /**
   * A fresh copy (not in the scene) of the long gun slung on his back, or of the pistol in his
   * hand (that one also hides the held gun).
   */
  weaponCopy(kind: 'back' | 'hand'): THREE.Object3D | null;
  /** Grab the next rendered frame (the PC outside shows it on its monitor). */
  captureFrame(): void;
  play(id: HateEndingSound): void;
  onFinished(): void;
}

const LINES = {
  a: 'DO YOU REALLY THINK A HUMAN COULD COME BACK INTO THIS FUCKING TREE...',
  b: '...AGAIN AND AGAIN, WITHOUT DYING?',
  c: 'NO...',
};

// Choreography (stage-local; the cowboy walks toward -Z)
const HERO_START = new THREE.Vector3(0, 0, -0.2);
const BOSS_AT = new THREE.Vector3(0, 0, -10);
const STOP_DIST = 0.95; // his hand reaches the boss's head from here
const WALK_SPEED = 0.8;

const T = {
  walk: 4.5,
  shotA2: 10.5,
  shotB: 16.4,
  reach: [17.6, 19.6] as const,
  shotC: 21.0,
  peel: [23.2, 25.8] as const,
  fall: 25.8,
  twitch: [27.8, 30.0] as const,
  jaw: [30.0, 31.9] as const,
  pull: [31.9, 32.6] as const,
  lunge: [32.6, 32.88] as const,
  red: 32.9,
  end: 34.3,
};
export const HATE_ENDING_LENGTH = T.end;

const smooth = THREE.MathUtils.smoothstep;

/** How a gun sits in the right glove once grabbed (glove space; the gun's barrel is its +Z). */
interface Grip {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}
const GRIP_LONG: Grip = { pos: new THREE.Vector3(0, -0.06, 0.05), quat: new THREE.Quaternion() };
const GRIP_PISTOL: Grip = { pos: new THREE.Vector3(0, -0.07, 0.04), quat: new THREE.Quaternion() };

interface Reparented {
  obj: THREE.Object3D;
  parent: THREE.Object3D;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
}

export class HateEndingCutscene {
  private t = 0;
  private done = false;
  private fired = new Set<string>();
  private walkFrom = new THREE.Vector3();
  private walkTo = new THREE.Vector3();
  private walkEnd: number;
  private bossBase = new THREE.Vector3();
  private yaw: number;
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();

  // Limbs re-hung on pivots at the hip/shoulder so they swing from the joint
  private moved: Reparented[] = [];
  private pivots: THREE.Group[] = [];
  private legL: THREE.Group | null = null;
  private legR: THREE.Group | null = null;
  private armL: THREE.Group | null = null;
  private armR: THREE.Group | null = null;
  private heroTilt = 0;

  // The mask: hinged on its left edge so the right side peels off first, then it drops
  private maskHinge: THREE.Group | null = null;
  private maskFall: { vy: number; landed: boolean } | null = null;

  private face: DeadFace;
  private faceBase = new THREE.Vector3(0, 1.72, 0);
  /** Guns flying off / lying on the floor. */
  private thrown: {
    o: THREE.Object3D;
    vel: THREE.Vector3;
    /** End-over-end spin (rad/s about the gun's own X). */
    tumble: number;
    bounced: boolean;
    grounded: boolean;
    done: boolean;
    /** How it ends up lying on the floor. */
    rest: THREE.Quaternion;
  }[] = [];
  /** A gun sliding from where it was grabbed into the hand's grip. */
  private gripping: { o: THREE.Object3D; t0: number; fromPos: THREE.Vector3; fromQuat: THREE.Quaternion; to: Grip } | null = null;
  /** The long gun slung across his back (until he pulls it off). */
  private backGun: THREE.Object3D | null = null;
  private pistol: THREE.Object3D | null = null;
  /** Key light on the face from above: the hat brim throws its shadow over the eyes. */
  private faceLight = new THREE.SpotLight(0xffc9a8, 0, 4, 0.42, 0.55, 1.4);
  /** Faint fill from below/front so the shadowed half isn't pure black. */
  private faceFill = new THREE.PointLight(0x9a6a5a, 0, 2.2, 1.6);
  /** Where the neck leaves the shoulders (hero model space). */
  private shoulder = new THREE.Vector3(0, 1.42, 0);
  private hidden: THREE.Object3D[] = [];
  private camNear: number;
  private camFov: number;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(private host: HateEndingHost) {
    const { heroRoot, heroModel, boss, bossBody, camera, origin } = host;
    this.walkFrom.copy(origin).add(HERO_START);
    this.bossBase.copy(origin).add(BOSS_AT);
    const dx = this.bossBase.x - this.walkFrom.x;
    const dz = this.bossBase.z - this.walkFrom.z;
    const d = Math.hypot(dx, dz) || 1;
    this.yaw = Math.atan2(dx, dz);
    this.fwd.set(dx / d, 0, dz / d);
    this.right.set(this.fwd.z, 0, -this.fwd.x);
    this.walkTo.set(this.bossBase.x - this.fwd.x * STOP_DIST, 0, this.bossBase.z - this.fwd.z * STOP_DIST);
    this.walkEnd = T.walk + (d - STOP_DIST) / WALK_SPEED;

    heroRoot.position.copy(this.walkFrom);
    heroRoot.rotation.set(0, this.yaw, 0);
    heroRoot.updateMatrixWorld(true);
    boss.position.copy(this.bossBase);
    boss.rotation.set(0, this.yaw + Math.PI, 0);
    this.heroTilt = heroModel.rotation.x;

    // The boss has no visor: just a black head
    const bossVisor = bossBody.getObjectByName('visor_mesh');
    if (bossVisor) bossVisor.visible = false;

    // ── Limbs on joint pivots (boots travel with their leg)
    this.legL = this.pivot(heroModel.getObjectByName('leg_l'), 0.25, heroModel.getObjectByName('boot_l'));
    this.legR = this.pivot(heroModel.getObjectByName('leg_r'), 0.25, heroModel.getObjectByName('boot_r'));
    this.armL = this.pivot(heroModel.getObjectByName('arm_l'), 0.27);
    this.armR = this.pivot(heroModel.getObjectByName('arm_r'), 0.27);

    // ── Mask + visor on a hinge at the face's left edge (screen right lifts first)
    const mask = heroModel.getObjectByName('face_mask');
    const visor = heroModel.getObjectByName('visor_mesh');
    if (mask?.parent) {
      const hinge = new THREE.Group();
      hinge.position.set(-0.19, 1.7, 0.2);
      mask.parent.add(hinge);
      hinge.updateMatrixWorld(true);
      this.remember(mask);
      hinge.attach(mask);
      if (visor) {
        this.remember(visor);
        hinge.attach(visor);
      }
      this.maskHinge = hinge;
    }

    // ── The face under it, waiting where the head box is
    this.face = buildDeadFace();
    this.face.group.visible = false;
    this.face.group.position.copy(this.faceBase);
    heroModel.add(this.face.group);

    // Bandana / respirator off for the whole scene: the face has to read
    heroModel.traverse((o) => {
      if (o.name === FACE_ACCESSORY) this.hide(o);
    });
    heroModel.add(this.face.neck);

    // A long gun slung diagonally across his back: barrel up past his right shoulder
    this.backGun = host.weaponCopy('back');
    if (this.backGun) {
      // (centred copy: its width, ~0.14, lies against the poncho's back at z ≈ -0.37)
      this.backGun.position.set(0.04, 1.2, -0.445);
      this.backGun.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -0.55, 'ZYX'));
      heroModel.add(this.backGun);
    }
    // The pistol rides in the holster on his right hip, barrel down (the held one is put away)
    this.pistol = host.weaponCopy('hand');
    const holster = heroModel.getObjectByName('belt_holster');
    if (this.pistol && holster) {
      this.pistol.position.set(0, 0.03, 0);
      this.pistol.rotation.set(Math.PI / 2, 0, 0);
      this.pistol.scale.setScalar(0.85);
      holster.add(this.pistol);
      this.hide(heroModel.getObjectByName('belt_holster_grip'));
    }

    // high and in front: the brim (y 1.8, r 0.5) shades the eyes and brow, the mouth stays lit
    this.faceLight.position.set(0.1, 2.5, 1.6);
    this.faceLight.target.position.set(0, 1.7, 0.1);
    this.faceLight.castShadow = true;
    this.faceLight.shadow.mapSize.set(1024, 1024);
    this.faceLight.shadow.bias = -0.0006;
    this.faceLight.shadow.camera.near = 0.2;
    this.faceLight.shadow.camera.far = 3.5;
    heroModel.add(this.faceLight, this.faceLight.target);
    this.faceFill.position.set(0, 1.2, 0.9);
    heroModel.add(this.faceFill);

    // Close-ups need a short near plane and a slightly tighter lens
    this.camNear = camera.near;
    this.camFov = camera.fov;
    camera.near = 0.05;
    camera.fov = 44;
    camera.updateProjectionMatrix();
    host.play('heartbeat');
  }

  get finished() {
    return this.done;
  }

  get time() {
    return this.t;
  }

  private remember(obj: THREE.Object3D) {
    if (!obj.parent || this.moved.some((m) => m.obj === obj)) return;
    this.moved.push({ obj, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() });
  }

  /** Hangs `part` (and any `extras`) on a pivot at its top end, `half` above its centre. */
  private pivot(part: THREE.Object3D | undefined, half: number, ...extras: (THREE.Object3D | undefined)[]) {
    if (!part?.parent) return null;
    part.updateMatrix();
    const joint = new THREE.Vector3(0, half, 0).applyMatrix4(part.matrix);
    const g = new THREE.Group();
    g.position.copy(joint);
    part.parent.add(g);
    g.updateMatrixWorld(true);
    for (const o of [part, ...extras]) {
      if (!o) continue;
      this.remember(o);
      g.attach(o);
    }
    this.pivots.push(g);
    return g;
  }

  private once(id: string, at: number, fn: () => void) {
    if (this.t >= at && !this.fired.has(id)) {
      this.fired.add(id);
      fn();
    }
  }

  private hide(o: THREE.Object3D | undefined | null) {
    if (!o || !o.visible) return;
    o.visible = false;
    this.hidden.push(o);
  }

  /** Takes `o` into the right hand: it slides from where it is into the grip. */
  private grip(o: THREE.Object3D | null, g: Grip) {
    const glove = this.host.heroModel.getObjectByName('boot_glove_r');
    if (!o || !glove) return;
    this.host.heroRoot.updateMatrixWorld(true);
    glove.attach(o);
    this.gripping = { o, t0: this.t, fromPos: o.position.clone(), fromQuat: o.quaternion.clone(), to: g };
  }

  /** Lets go of `o` (moved into world space), flung off to `side` (+1 his right, -1 his left). */
  private throwGun(o: THREE.Object3D, side: number) {
    if (this.gripping?.o === o) this.gripping = null;
    this.host.heroRoot.updateMatrixWorld(true);
    this.host.heroRoot.parent?.attach(o);
    const vel = new THREE.Vector3()
      .addScaledVector(this.right, side * 2.4)
      .addScaledVector(this.fwd, WALK_SPEED) // he's still walking
      .add(new THREE.Vector3(0, 1.7, 0));
    this.thrown.push({ o, vel, tumble: side * 7, bounced: false, grounded: false, done: false, rest: new THREE.Quaternion() });
    this.host.play('gun_throw');
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const h = this.host;
    h.setLetterbox(Math.min(1, t / 1.2));
    h.stage.update(dt, t);

    // ── Boss: cornered, shaking all over, leaning away
    const shake = t < T.shotC ? 0.03 : 0.012;
    h.boss.position.set(this.bossBase.x + (Math.random() - 0.5) * shake, 0, this.bossBase.z + (Math.random() - 0.5) * shake);
    const cower = smooth(t, 6, 16);
    h.bossBody.rotation.set(-0.06 - cower * 0.16 + (Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.035);
    h.bossBody.scale.set(1, 0.98 - cower * 0.04 + Math.sin(t * 19) * 0.006, 1);

    // ── The walk: slow, heavy, hunched
    const walkK = Math.min(1, Math.max(0, (t - T.walk) / (this.walkEnd - T.walk)));
    h.heroRoot.position.lerpVectors(this.walkFrom, this.walkTo, walkK);
    const walking = t > T.walk && t < this.walkEnd ? Math.min(1, (t - T.walk) / 0.6, (this.walkEnd - t) / 0.6) : 0;
    const phase = (t - T.walk) * 2.6;
    const step = Math.sin(phase) * walking;
    h.heroRoot.position.y = Math.abs(Math.sin(phase)) * 0.04 * walking;
    h.heroRoot.rotation.set(0, this.yaw + Math.sin(phase) * 0.03 * walking, 0);
    h.heroModel.rotation.x = this.heroTilt + 0.07 * smooth(t, T.walk, T.walk + 2);
    if (this.legL) this.legL.rotation.x = step * 0.42;
    if (this.legR) this.legR.rotation.x = -step * 0.42;
    // Arms: swinging with the walk, except while he's getting rid of the guns / reaching out.
    //  · 7.0–8.9: right hand over the shoulder for the long gun on his back, flings it off to his right
    //  · 11.0–12.7: right hand down to the holster, draws the pistol, flings it across to his left
    const swingL: [number, number, number] = [-step * 0.28, 0, 0];
    const swingR: [number, number, number] = [step * 0.28, 0, 0];
    const reach = smooth(t, T.reach[0], T.reach[1]);
    if (this.armL) this.armL.rotation.set(...swingL);
    type Rot = [number, number, number];
    const mix = (x: Rot, y: Rot, w: number): Rot => [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w];
    const P_BACK: Rot = [-2.8, 0, 0.3]; // over the shoulder
    const P_OUT: Rot = [-0.6, 0, 1.3]; // flung out to his right
    const P_HIP: Rot = [0.25, 0, -0.12]; // hand on the holster
    const P_ACROSS: Rot = [-1.05, 0, -1.0]; // swung across, to his left
    const P_REACH: Rot = [-1.95, 0, 0.35]; // toward the boss's head
    let r: Rot = swingR;
    if (t < 7.75) r = mix(swingR, P_BACK, smooth(t, 7.0, 7.7));
    else if (t < 9.2) r = mix(mix(P_BACK, P_OUT, smooth(t, 7.75, 8.1)), swingR, smooth(t, 8.45, 9.0));
    else if (t < 11.45) r = mix(swingR, P_HIP, smooth(t, 11.0, 11.4));
    else if (t < 13) r = mix(mix(P_HIP, P_ACROSS, smooth(t, 11.45, 11.75)), swingR, smooth(t, 12.1, 12.7));
    else r = mix(swingR, P_REACH, reach);
    if (this.armR) this.armR.rotation.set(...r);

    this.once('grabBack', 7.72, () => this.grip(this.backGun, GRIP_LONG));
    this.once('flingBack', 8.05, () => {
      if (this.backGun) this.throwGun(this.backGun, 1);
      this.backGun = null;
    });
    this.once('draw', 11.42, () => {
      this.grip(this.pistol, GRIP_PISTOL);
      this.hide(h.heroModel.getObjectByName('belt_holster_grip'));
      h.play('gun_draw');
    });
    this.once('flingPistol', 11.78, () => {
      if (this.pistol) this.throwGun(this.pistol, -1);
      this.pistol = null;
    });

    // A gun just grabbed slides into the hand's grip
    if (this.gripping) {
      const k = Math.min(1, (t - this.gripping.t0) / 0.18);
      const e = k * k * (3 - 2 * k);
      this.gripping.o.position.lerpVectors(this.gripping.fromPos, this.gripping.to.pos, e);
      this.gripping.o.quaternion.slerpQuaternions(this.gripping.fromQuat, this.gripping.to.quat, e);
      if (k >= 1) this.gripping = null;
    }

    // Thrown guns: tumble end over end, one bounce, skid to a stop lying on their side
    for (const g of this.thrown) {
      if (g.done) continue;
      const o = g.o;
      if (!g.grounded) {
        g.vel.y -= 9.8 * dt;
        o.position.addScaledVector(g.vel, dt);
        o.rotateX(g.tumble * dt);
        if (o.position.y <= 0.07) {
          o.position.y = 0.07;
          if (!g.bounced && g.vel.y < -1.2) {
            g.bounced = true;
            g.vel.set(g.vel.x * 0.5, -g.vel.y * 0.22, g.vel.z * 0.5);
            g.tumble *= 0.35;
            this.host.play('gun_land');
          } else {
            g.grounded = true;
            g.vel.y = 0;
            // settle on its side, keeping the heading it landed with
            const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion).setY(0);
            const yaw = fwd.lengthSq() > 1e-4 ? Math.atan2(fwd.x, fwd.z) : 0;
            g.rest.setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'));
          }
        }
      } else {
        // skidding on the floor
        const fr = Math.exp(-5 * dt);
        g.vel.x *= fr;
        g.vel.z *= fr;
        o.position.x += g.vel.x * dt;
        o.position.z += g.vel.z * dt;
        o.quaternion.slerp(g.rest, Math.min(1, dt * 9));
        if (Math.hypot(g.vel.x, g.vel.z) < 0.03 && o.quaternion.angleTo(g.rest) < 0.02) g.done = true;
      }
    }

    // Lines (each with his voice)
    const say = (id: string, at: number, text: string | null) =>
      this.once(id, at, () => {
        h.setSubtitle(text);
        h.play(text ? 'talk' : 'talk_end');
      });
    say('la', 5.5, LINES.a);
    say('lb', 9.6, LINES.b);
    say('lc', 13.6, LINES.c);
    say('lx', 15.6, null);

    this.once('grab', T.reach[1], () => {
      h.shake(0.3);
      h.play('grab');
    });

    // ── Boss POV: the face. Then the mask comes away.
    this.once('pov', T.shotC, () => {
      h.boss.visible = false; // the camera is in his head
      this.faceLight.intensity = 7;
      this.faceFill.intensity = 0.5;
    });
    this.once('peel', T.peel[0], () => {
      h.play('music_down');
      // the real face is already under it, hidden by the mask until it lifts
      this.hide(h.heroModel.getObjectByName('head_mesh'));
      this.hide(h.heroModel.getObjectByName('head_neck'));
      this.hide(h.heroModel.getObjectByName('trim_mesh_collar')); // the meat neck takes its place
      this.face.group.visible = true;
      h.play('mask_peel');
    });
    if (this.maskHinge && !this.maskFall) {
      // sticky: it comes off in little tugs, then hangs
      const k = smooth(t, T.peel[0], T.peel[1]);
      const tug = Math.max(0, Math.sin(t * 9)) * 0.03 * (k > 0 && k < 1 ? 1 : 0);
      this.maskHinge.rotation.set(0, -(k * 0.75 + tug), -k * 0.08);
    }
    this.once('fall', T.fall, () => {
      const hinge = this.maskHinge;
      if (!hinge) return;
      hinge.parent?.updateMatrixWorld(true);
      h.heroRoot.parent?.attach(hinge);
      this.maskFall = { vy: 0, landed: false };
      this.faceLight.color.setHex(0xffa070);
      h.shake(0.15);
    });
    if (this.maskHinge && this.maskFall && !this.maskFall.landed) {
      // drifts down slowly, turning over
      const f = this.maskFall;
      f.vy -= 2.6 * dt;
      this.maskHinge.position.y += f.vy * dt;
      this.maskHinge.position.addScaledVector(this.fwd, -0.12 * dt);
      this.maskHinge.rotation.x += dt * 1.1;
      this.maskHinge.rotation.y -= dt * 0.5;
      if (this.maskHinge.position.y <= 0.04) {
        this.maskHinge.position.y = 0.04;
        f.landed = true;
        h.play('mask_land');
      }
    }

    // ── The face: it doesn't breathe. It twitches. The jaw drops too far. Back… and lunge.
    const fg = this.face.group;
    let twitchY = 0;
    let twitchZ = 0;
    if (t > T.twitch[0]) {
      // sudden small jerks of the head, held, then another
      const beat = Math.floor((t - T.twitch[0]) * 1.7);
      const r1 = Math.sin(beat * 12.9898) * 43758.5453;
      const r2 = Math.sin(beat * 78.233) * 12543.123;
      twitchY = ((r1 - Math.floor(r1)) - 0.5) * 0.22;
      twitchZ = ((r2 - Math.floor(r2)) - 0.5) * 0.3;
    }
    const jaw = smooth(t, T.jaw[0], T.jaw[1]);
    const pull = smooth(t, T.pull[0], T.pull[1]);
    const lunge = smooth(t, T.lunge[0], T.lunge[1]);
    this.face.jaw.rotation.x = jaw * 0.85 + lunge * 0.25 + (jaw > 0 && jaw < 1 ? Math.sin(t * 40) * 0.015 : 0);
    fg.rotation.set(-jaw * 0.18 - pull * 0.12 + lunge * 0.3, twitchY * (1 - pull), twitchZ * (1 - pull));
    fg.position.set(this.faceBase.x, this.faceBase.y, this.faceBase.z - pull * 0.14 + lunge * 0.72);
    fg.scale.setScalar(1 + lunge * 0.3);
    this.once('jawS', T.jaw[0], () => h.play('jaw'));
    // gathering itself to strike
    this.once('prep', T.pull[0], () => h.play('mask_fall'));
    this.face.update(this.shoulder);
    this.once('lungeS', T.lunge[0], () => h.play('chomp'));
    if (t > T.lunge[0]) h.shake(1);
    else if (t > T.jaw[0]) h.shake(0.06 + (t - T.jaw[0]) * 0.05);
    this.once('capture', T.lunge[1] - 0.04, () => h.captureFrame());

    // ── Camera
    this.camera(t);

    // Hard cuts: one black frame each
    const cut = (at: number) => t >= at && t < at + 0.06;
    if (cut(T.walk) || cut(T.shotA2) || cut(T.shotB) || cut(T.shotC)) {
      h.fadeEl.style.background = '#000000';
      h.fadeEl.style.opacity = '1';
    } else if (t < T.red) {
      // fade in from black at the very start
      h.fadeEl.style.background = '#000000';
      h.fadeEl.style.opacity = String(Math.max(0, 1 - t / 1.5));
    }

    // ── Red, then black
    this.once('red', T.red, () => {
      h.fadeEl.style.background = '#b00010';
      h.fadeEl.style.opacity = '1';
      h.play('sting');
    });
    this.once('black', T.red + 0.25, () => {
      h.fadeEl.style.background = '#000000';
      h.fadeEl.style.opacity = '1';
    });
    this.once('end', T.end, () => this.finish());
  }

  private camera(t: number) {
    const h = this.host;
    const o = h.origin;
    const hp = h.heroRoot.position;
    const bp = this.bossBase;
    const f = this.fwd;
    const r = this.right;
    if (t < T.walk) {
      // Up the shaft at the light, then slowly down to the floor
      const k = smooth(t, 1.0, T.walk);
      this.tmpA.set(o.x + 1.2, 0.5, o.z + 3.6);
      this.tmpB.set(o.x + 0.4 * (1 - k), THREE.MathUtils.lerp(60, 1.4, k * k * (3 - 2 * k)), o.z + THREE.MathUtils.lerp(-3, -7, k));
    } else if (t < T.shotA2) {
      // Low, behind his shoulder, the boss far ahead
      this.tmpA.set(hp.x - f.x * 2.6 + r.x * 0.7, 1.15, hp.z - f.z * 2.6 + r.z * 0.7);
      this.tmpB.set(bp.x, 1.5, bp.z);
    } else if (t < T.shotB) {
      // Behind the boss, over his trembling shoulder: the cowboy keeps coming
      this.tmpA.set(bp.x + f.x * 1.1 - r.x * 0.6, 1.8, bp.z + f.z * 1.1 - r.z * 0.6);
      this.tmpB.set(hp.x, 1.55, hp.z);
    } else if (t < T.shotC) {
      // Side, both in profile, pushing in
      const mx = (hp.x + bp.x) / 2;
      const mz = (hp.z + bp.z) / 2;
      const push = smooth(t, T.shotB, T.shotC) * 1.2;
      this.tmpA.set(mx + r.x * (4.2 - push), 1.5, mz + r.z * (4.2 - push));
      this.tmpB.set(mx, 1.45, mz);
    } else {
      // Boss POV: the face at arm's length, creeping a little closer
      const back = 1.25 - smooth(t, T.shotC, T.jaw[0]) * 0.25;
      this.tmpA.set(hp.x + f.x * back, 1.73, hp.z + f.z * back);
      this.tmpB.set(hp.x, 1.7, hp.z);
    }
    h.aim(this.tmpA, this.tmpB);
  }

  /** Jump to the end (skip). */
  finish() {
    if (this.done) return;
    this.done = true;
    this.host.setSubtitle(null);
    this.host.fadeEl.style.background = '#000000';
    this.host.fadeEl.style.opacity = '1';
    this.host.onFinished();
  }

  /** Puts the hero back (limbs, mask, head, posture) and frees what this scene created. */
  restore() {
    const { heroModel, heroRoot, camera } = this.host;
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    for (const m of this.moved) {
      m.parent.add(m.obj);
      m.obj.position.copy(m.pos);
      m.obj.quaternion.copy(m.quat);
      m.obj.scale.copy(m.scale);
    }
    this.moved = [];
    for (const p of this.pivots) p.parent?.remove(p);
    this.pivots = [];
    this.maskHinge?.parent?.remove(this.maskHinge);
    this.maskHinge = null;
    heroModel.rotation.x = this.heroTilt;
    heroRoot.rotation.set(0, heroRoot.rotation.y, 0);
    this.face.dispose();
    heroModel.remove(this.faceLight, this.faceLight.target, this.faceFill);
    this.faceLight.dispose();
    this.faceFill.dispose();
    for (const g of this.thrown) g.o.parent?.remove(g.o);
    this.thrown = [];
    this.backGun?.parent?.remove(this.backGun);
    this.backGun = null;
    this.pistol?.parent?.remove(this.pistol);
    this.pistol = null;
    this.gripping = null;
    camera.near = this.camNear;
    camera.fov = this.camFov;
    camera.updateProjectionMatrix();
  }
}
