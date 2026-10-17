/**
 * The item line (core.md: one line per ability or upgrade): what a glade's grant or a hollow's upgrade says,
 * in screen space, centred in the 16:9 safe area's lower part, so no window shape and no camera position
 * cuts it off (the curious first-timer read "Hold jump to glide" clipped off the left edge when it hung
 * over her in the world). Fades in, holds, fades out; a new grant replaces it. Every room, every view shape.
 */
import { Container, Text } from 'pixi.js';
import type { SimView } from '../contract';
import { SAFE_H, SAFE_W } from '../contract';

/** What each grant says. Glide: the hold has to last into the fall (a held jump only opens the wings once she drops). */
export const ITEM_LINES: Record<string, string> = {
  glide: 'Your wings have dried. Hold jump as you fall to glide.',
  wallJump: 'Your claws have hardened. Jump at a wall to climb.',
  doubleJump: 'Jump again in the air.',
  dash: 'Dash.',
  quickWings: 'Quick wings: beat free in two.',
  keenBlade: 'Keen blade: a longer reach to the flame.',
};

/** Seconds and placement (safe-area units: y as a share of its height). */
export const ITEM_LINE = { in: 0.35, hold: 5, out: 0.9, y: 0.8, size: 30, maxW: 0.8, alpha: 0.92 };

/**
 * The reminder (a human-like player looped R5's chasm 14 times in 21 s): in a room with a wings-twitch spot
 * (`marks.stage.twitch`, the glide's teaching lip), once she owns glide, her `twitch.catches`-th fall catch and
 * every `every` more show the glide's hint again, shorter: just the how.
 */
export const REMIND = { every: 3, line: 'Hold jump as you fall to glide.' };

export class ItemLine {
  readonly root = new Container({ label: 'hud-item-line' });
  private readonly text: Text;
  private t = 1e6;
  /** Fall catches this visit (the reminder). */
  private catches = 0;

  constructor(family: string) {
    this.text = new Text({
      text: '',
      style: {
        fontFamily: family,
        fontSize: ITEM_LINE.size,
        fill: 0xe8ecf6,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: SAFE_W * ITEM_LINE.maxW,
        dropShadow: { color: 0x05070b, alpha: 0.8, blur: 6, distance: 0, angle: 0 },
      },
      resolution: 2,
    });
    this.text.anchor.set(0.5, 0.5);
    this.text.position.set(SAFE_W / 2, SAFE_H * ITEM_LINE.y);
    this.root.addChild(this.text);
    this.root.visible = false;
  }

  /** The line now on screen ('' = none), for tools and tests. */
  get line(): string {
    return this.root.visible ? this.text.text : '';
  }

  update(dt: number, sim: SimView): void {
    const tw = sim.scene.marks?.stage?.twitch;
    for (const e of sim.events) {
      const key = e.type === 'gladeGrant' ? e.ability : e.type === 'hollowGrant' ? e.upgrade : '';
      if (key) {
        this.text.text = ITEM_LINES[key] ?? key;
        this.t = 0;
      } else if (e.type === 'roomEnter') {
        this.catches = 0;
        if (e.from === 'load') this.t = 1e6;
      } else if (e.type === 'fallCatch' && tw && sim.save.abilities.includes('glide')) {
        this.catches++;
        const n = this.catches - tw.catches;
        if (n >= 0 && n % REMIND.every === 0) {
          this.text.text = REMIND.line;
          this.t = 0;
        }
      }
    }
    this.t += dt;
    const L = ITEM_LINE;
    const t = this.t;
    const a =
      t < L.in
        ? t / L.in
        : t < L.in + L.hold
          ? 1
          : t < L.in + L.hold + L.out
            ? 1 - (t - L.in - L.hold) / L.out
            : 0;
    this.root.visible = a > 0.003;
    this.root.alpha = L.alpha * a;
  }
}
