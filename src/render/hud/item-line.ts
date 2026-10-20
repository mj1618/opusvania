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
  nightEyes: 'Night eyes: the map shows the lamps you have not seen.',
  /** A moth milestone (`healthUp`): one more light. */
  healthUp: 'A new light kindles.',
};

/** A grant's line, and never a code name: an id with no line reads as words ("nightEyes" -> "Night eyes."). */
export function itemLine(key: string): string {
  const line = ITEM_LINES[key];
  if (line) return line;
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

/** A moonseed's line: the count she holds (the Seed Door counts three, the Heartwood five). */
export function seedLine(count: number): string {
  return `A moonseed. ${count === 1 ? 'One' : count === 2 ? 'Two' : count === 3 ? 'Three' : count === 4 ? 'Four' : 'Five'} held.`;
}

/** Seconds and placement (safe-area units: y as a share of its height). */
export const ITEM_LINE = { in: 0.35, hold: 5, out: 0.9, y: 0.8, size: 30, maxW: 0.8, alpha: 0.92 };

export class ItemLine {
  readonly root = new Container({ label: 'hud-item-line' });
  private readonly text: Text;
  private t = 1e6;

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
    for (const e of sim.events) {
      const key =
        e.type === 'gladeGrant'
          ? e.ability
          : e.type === 'hollowGrant'
            ? e.upgrade
            : e.type === 'healthUp'
              ? 'healthUp'
              : '';
      if (key) {
        this.text.text = itemLine(key);
        this.t = 0;
      } else if (e.type === 'seedTaken') {
        // A moonseed (the Downwood's keys): how many she holds now.
        this.text.text = seedLine(e.count);
        this.t = 0;
      } else if (e.type === 'roomEnter' && e.from === 'load') this.t = 1e6;
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
