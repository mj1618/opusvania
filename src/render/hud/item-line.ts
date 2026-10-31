/**
 * The item line (core.md: one line per ability or upgrade): what a glade's grant or a hollow's upgrade says,
 * in screen space, centred in the 16:9 safe area's lower part, so no window shape and no camera position
 * cuts it off (the curious first-timer read "Hold jump to glide" clipped off the left edge when it hung
 * over her in the world). Fades in, holds, fades out; a new grant replaces it. Every room, every view shape.
 * At most 2.5 s, and never over a fight (line-logic.ts: it waits for the fight's last creature).
 */
import { Container, Text } from 'pixi.js';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { SAFE_H, SAFE_W } from '../contract';
import { RELEASE, releaseGreat } from '../lantern/release';
import { fightNear, LineTimer, quietNow } from './line-logic';

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

/**
 * A moon shard's line (the Canopy r16, first-timer ft15fix: "the shard just shows its name; I don't know what it does or
 * if it counts toward anything"): how many she holds toward the next light, `per` making one.
 */
export function shardLine(held: number, per: number): string {
  const n = held % per;
  const words = ['None', 'One', 'Two', 'Three', 'Four', 'Five'];
  if (n === 0) return `A moon shard. ${words[per] ?? per} of them: a new light kindles.`;
  return `A moon shard: ${(words[n] ?? String(n)).toLowerCase()} of ${(words[per] ?? String(per)).toLowerCase()}. ${words[per] ?? per} kindle a new light.`;
}

/** Lines for story flags that close an area. */
export const FLAG_LINES: Record<string, string> = {
  'dw-valley': 'The valley of lamps, below. The end of the Downwood.',
};

/** A moonseed's line: the count she holds (the Seed Door counts three, the Heartwood five). */
export function seedLine(count: number): string {
  return `A moonseed. ${count === 1 ? 'One' : count === 2 ? 'Two' : count === 3 ? 'Three' : count === 4 ? 'Four' : 'Five'} held.`;
}

/** Placement (safe-area units: y as a share of its height); its timing is `LINE_TIME` (line-logic.ts). */
export const ITEM_LINE = { y: 0.8, size: 30, maxW: 0.8, alpha: 0.92 };

export class ItemLine {
  readonly root = new Container({ label: 'hud-item-line' });
  private readonly text: Text;
  private readonly timer = new LineTimer();

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

  /** `quiet`: a quiet moment on, or the HUD still stepping back in after one (index.ts `quietK`). */
  update(dt: number, sim: SimView, quiet = quietNow(sim)): void {
    for (const e of sim.events) {
      const key =
        e.type === 'gladeGrant'
          ? e.ability
          : e.type === 'hollowGrant'
            ? e.upgrade
            : e.type === 'healthUp'
              ? 'healthUp'
              : '';
      if (key === 'moonShard') {
        const held = sim.save.flags.filter((f) => f.startsWith('moonShard:')).length;
        this.timer.show(shardLine(held, Math.max(1, Math.round(tuning.upgrades.moonShard.perLight))));
      } else if (key) this.timer.show(itemLine(key));
      // A story beat that ends a demo area (the Downwood's valley).
      else if (e.type === 'flagSet' && FLAG_LINES[e.flag]) this.timer.show(FLAG_LINES[e.flag] as string);
      // A moonseed (the Downwood's keys): how many she holds now.
      else if (e.type === 'seedTaken') this.timer.show(seedLine(e.count));
      else if (e.type === 'roomEnter' && e.from === 'load') this.timer.clear();
      // The great cage's release: no line over its column until it has gone (review r13 #1).
      if (e.type === 'lureSnuff' && e.trap) {
        const l = (sim.scene.lures ?? []).find((q) => q.id === e.id);
        if (l && releaseGreat(l.moths ?? 0)) this.timer.hold(RELEASE.greatClear);
      }
    }
    // (The escape is a fight with the roof: no line over it. The Canopy r14, moment 7. Nor over a quiet moment: the
    // sit, the column, the vista wait out their beats with no words; r15's fixes.)
    const esc = (sim.kit as unknown as { escape?: { on: number } }).escape;
    const a = this.timer.update(dt, fightNear(sim) || esc?.on === 1, quiet);
    if (this.text.text !== this.timer.text) this.text.text = this.timer.text;
    this.root.visible = a > 0.003;
    this.root.alpha = ITEM_LINE.alpha * a;
  }
}
