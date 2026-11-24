/**
 * O PROGRAMADOR: the final boss. A bug in the system.
 *
 * Default body: the cowboy's silhouette, all black. He TYPES commands into a floating prompt to
 * change form and to hack the player's HUD. The typing is the telegraph: you read the command
 * before it runs.
 *
 * This file is only the "brain" (data + state machine). Bodies, movement and attacks live in
 * `programmerFight.ts`, which reads `brain.form` / `brain.prompt` every frame.
 */

export type ProgrammerForm = 'default' | 'centipede' | 'gun_amalgam' | 'knight' | 'goo';

export type HudHack = 'none' | 'hp_hidden' | 'hp_garbage' | 'ammo_garbage' | 'ammo_hidden';

export interface FormDef {
  form: ProgrammerForm;
  /** What he types before turning into it (shown letter by letter = telegraph). */
  command: string;
  /** Seconds he stays in this form before going back to `default`. */
  duration: number;
}

export const PROGRAMMER_FORMS: Record<ProgrammerForm, FormDef> = {
  default: { form: 'default', command: 'whoami', duration: 9 },
  centipede: { form: 'centipede', command: 'spawn --legs=64 --armed', duration: 14 },
  gun_amalgam: { form: 'gun_amalgam', command: 'merge ./weapons/* > self', duration: 12 },
  knight: { form: 'knight', command: 'load knight.exe', duration: 16 },
  goo: { form: 'goo', command: 'while true; do fork; done', duration: 13 },
};

export const HUD_HACK_COMMANDS: Record<Exclude<HudHack, 'none'>, string> = {
  hp_hidden: 'chmod 000 /hud/hp',
  hp_garbage: 'cat /dev/urandom > /hud/hp',
  ammo_hidden: 'chmod 000 /hud/ammo',
  ammo_garbage: 'cat /dev/urandom > /hud/ammo',
};

const SEQUENCE: ProgrammerForm[] = ['centipede', 'knight', 'goo', 'gun_amalgam'];
const TYPE_SPEED = 22; // chars/second
const TYPE_HOLD = 0.45; // command stays fully typed this long before executing
const HUD_HACK_DURATION = 8;

export interface ProgrammerPrompt {
  /** The command as typed so far (no prefix). */
  text: string;
  /** true while typing (telegraph), false once executed. */
  typing: boolean;
}

/**
 * default → (types) → form → back to default → … ; HUD hacks are typed on top, mostly during
 * the most stressful forms (goo / amalgam), never two at once.
 */
export class ProgrammerBossBrain {
  form: ProgrammerForm = 'default';
  hudHack: HudHack = 'none';
  prompt: ProgrammerPrompt | null = null;
  /** Hate ending: he stops transforming and stays in the default body, afraid. */
  broken = false;

  private formTimer = 5; // a shorter first stretch in the default body
  private seqIndex = 0;
  private typing: { cmd: string; t: number; onDone: () => void } | null = null;
  private promptFade = 0;
  private hackTimer = 0;
  private hackCooldown = 6;
  private hackIndex = 0;
  private lastTyped = 0;

  constructor(
    private rnd: () => number = Math.random,
    private onEvent: (ev: string) => void = () => {}
  ) {}

  get formTimeLeft() {
    return this.formTimer;
  }

  /** Every vital point of the goo was hit. */
  endGooEarly() {
    if (this.form === 'goo') this.formTimer = Math.min(this.formTimer, 0.3);
  }

  update(dt: number) {
    // typing / telegraph
    if (this.typing) {
      this.typing.t += dt;
      const n = Math.min(this.typing.cmd.length, Math.floor(this.typing.t * TYPE_SPEED));
      if (n > this.lastTyped) {
        this.lastTyped = n;
        this.onEvent('key');
      }
      this.prompt = { text: this.typing.cmd.slice(0, n), typing: true };
      if (this.typing.t >= this.typing.cmd.length / TYPE_SPEED + TYPE_HOLD) {
        const done = this.typing.onDone;
        this.prompt = { text: this.typing.cmd, typing: false };
        this.typing = null;
        this.promptFade = 1.6;
        this.onEvent('execute');
        done();
      }
    } else if (this.promptFade > 0) {
      this.promptFade -= dt;
      if (this.promptFade <= 0 && !this.broken) this.prompt = null;
    }

    // HUD hack lifetime
    if (this.hudHack !== 'none') {
      this.hackTimer -= dt;
      if (this.hackTimer <= 0) {
        this.hudHack = 'none';
        this.onEvent('hud_restored');
      }
    } else {
      this.hackCooldown -= dt;
    }

    if (this.broken) return;

    // form lifetime
    this.formTimer -= dt;
    if (this.formTimer <= 0 && !this.typing) {
      if (this.form === 'default') {
        const next = SEQUENCE[this.seqIndex % SEQUENCE.length];
        this.seqIndex++;
        this.type(PROGRAMMER_FORMS[next].command, () => this.enter(next));
      } else {
        this.type('exit', () => this.enter('default'));
      }
      return;
    }

    // HUD hacks: much likelier in the forms where you most need the HUD
    const stressful = this.form === 'goo' || this.form === 'gun_amalgam';
    if (!this.typing && this.hudHack === 'none' && this.hackCooldown <= 0 && this.formTimer > 3 && this.rnd() < (stressful ? 0.02 : 0.004)) {
      const order: Exclude<HudHack, 'none'>[] = ['hp_hidden', 'ammo_garbage', 'hp_garbage', 'ammo_hidden'];
      const hack = order[this.hackIndex++ % order.length];
      this.type(HUD_HACK_COMMANDS[hack], () => {
        this.hudHack = hack;
        this.hackTimer = HUD_HACK_DURATION;
        this.hackCooldown = 10;
        this.onEvent(`hud_hack:${hack}`);
      });
    }
  }

  /** Hate path: his HP hit the threshold with the soul of Hate. */
  breakDown() {
    if (this.broken) return;
    this.broken = true;
    this.typing = null;
    this.hudHack = 'none';
    this.form = 'default';
    this.prompt = { text: 'exit', typing: false };
    this.onEvent('broken');
  }

  private type(cmd: string, onDone: () => void) {
    this.typing = { cmd, t: 0, onDone };
    this.lastTyped = 0;
    this.onEvent(`typing:${cmd}`);
  }

  private enter(form: ProgrammerForm) {
    this.form = form;
    this.formTimer = PROGRAMMER_FORMS[form].duration;
    this.onEvent(`form:${form}`);
  }
}

// ───────── HUD glitch: what the HUD SHOWS (the real values never change) ─────────

export interface HudDisplay {
  /** Cells to draw as "on"; null → draw every cell as "???" / static. */
  hpCells: number | null;
  /** Ammo text for the active weapon; null = show the real number. */
  ammoText: string | null;
}

export function hudDisplay(hack: HudHack, hp: number, maxHp: number, rnd: () => number = Math.random): HudDisplay {
  const out: HudDisplay = { hpCells: hp, ammoText: null };
  switch (hack) {
    case 'hp_hidden':
      out.hpCells = null;
      break;
    case 'hp_garbage':
      out.hpCells = Math.floor(rnd() * (maxHp + 1));
      break;
    case 'ammo_hidden':
      out.ammoText = '??';
      break;
    case 'ammo_garbage': {
      const glyphs = '0123456789#%&?!';
      out.ammoText = glyphs[Math.floor(rnd() * glyphs.length)] + glyphs[Math.floor(rnd() * glyphs.length)];
      break;
    }
  }
  return out;
}
