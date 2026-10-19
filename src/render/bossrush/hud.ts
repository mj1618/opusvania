/**
 * The boss fight's screen layer (the boss rush, memory/bossrush.md), in painted rooms (the greybox draws its own
 * label: render/greybox/boss.ts): the name card as the doors seal, a slim health bar at the foot of the view (one
 * segment per phase, the current one draining), the phase's name as it begins, the attempt count on a retry, the
 * final blow's white flash and the victory card (its time, and what the win taught her). Screen space, logical
 * units; the bar sits at the foot of the real view so every window shape keeps it on screen.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { bossRules } from '../../sim/boss/index';
import { tuning } from '../../sim/tuning';
import { SAFE_H, SAFE_W, type SimView, type ViewSize } from '../contract';

const FAMILY = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

export const BOSS_HUD = {
  barW: 820,
  barH: 10,
  /** The bar's foot above the view's bottom (logical px). */
  foot: 58,
  card: { in: 0.3, hold: 1.1, out: 0.6 },
  phase: { in: 0.2, hold: 1.4, out: 0.6 },
  win: { in: 0.5, hold: 6.5, out: 1.2 },
  flash: 0.55,
  colors: { bar: 0xe9d9b8, back: 0x0a0c10, edge: 0xf6ead0, hurt: 0xff7a4a, done: 0x3a3f48 },
} as const;

function text(size: number, fill: number, spacing = 0): Text {
  const t = new Text({
    text: '',
    style: {
      fontFamily: FAMILY,
      fontSize: size,
      fill,
      align: 'center',
      letterSpacing: spacing,
      dropShadow: { color: 0x020305, alpha: 0.85, blur: 8, distance: 0, angle: 0 },
    },
    resolution: 2,
  });
  t.anchor.set(0.5);
  return t;
}

/** A timed line: fades in, holds, fades out. */
class Line {
  t = 1e6;
  constructor(
    readonly text: Text,
    private readonly timing: { in: number; hold: number; out: number },
  ) {
    text.alpha = 0;
  }
  show(s: string): void {
    this.text.text = s;
    this.t = 0;
  }
  update(dt: number): void {
    this.t += dt;
    const { in: a, hold: h, out: o } = this.timing;
    const k = this.t < a ? this.t / a : this.t < a + h ? 1 : Math.max(0, 1 - (this.t - a - h) / o);
    this.text.alpha = k;
  }
}

export function fightTime(frames: number): string {
  const s = Math.max(0, frames) / 60;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

export class BossHud {
  readonly root = new Container({ label: 'hud-boss' });
  private readonly bar = new Graphics();
  private readonly flash = new Graphics();
  private readonly name = text(26, 0xf2e8d4, 6);
  private readonly card: Line;
  private readonly cardSub: Line;
  private readonly phase: Line;
  private readonly win: Line;
  private readonly winSub: Line;
  /** The hub's line of keys. */
  private readonly hint: Line;
  private barA = 0;
  private flashK = 0;
  /** The bar's fill as drawn (it eases down after a hit) and the hit's afterglow. */
  private shown = 1;
  private hurt = 0;

  constructor() {
    this.card = new Line(text(78, 0xfff6e6, 10), BOSS_HUD.card);
    this.cardSub = new Line(text(26, 0xd8cdb8, 2), BOSS_HUD.card);
    this.phase = new Line(text(40, 0xf6e2c0, 4), BOSS_HUD.phase);
    this.win = new Line(text(64, 0xfff6e6, 8), BOSS_HUD.win);
    this.winSub = new Line(text(30, 0xe8ecf6, 1), BOSS_HUD.win);
    this.hint = new Line(text(24, 0xc8d4e8, 1), { in: 0.6, hold: 8, out: 1.5 });
    this.root.addChild(
      this.flash,
      this.bar,
      this.name,
      this.card.text,
      this.cardSub.text,
      this.phase.text,
      this.win.text,
      this.winSub.text,
      this.hint.text,
    );
  }

  update(dt: number, sim: SimView, view: ViewSize): void {
    const b = sim.boss;
    const spec = sim.scene.boss;
    const painted = (sim.scene as { art?: { mode?: string } }).art?.mode !== 'greybox';
    const cx = SAFE_W / 2;
    if (sim.scene.id === 'br-hub') {
      // Back in the hub with all three fallen: the run's card (once a visit), its whole time.
      const all = ['br-weaver-down', 'br-gloam-down', 'br-mantis-down'].every((f) =>
        sim.save.flags.includes(f),
      );
      // (Otherwise, on the way in: the keys, once a visit.)
      if (!all && sim.events.some((e) => e.type === 'roomEnter' || e.type === 'spawn'))
        this.hint.show(
          'Three doors: \u2191 to enter.   Z jump   C cut   \u2193 C in the air: a pogo   X dash, once learned',
        );
      if (all && sim.events.some((e) => e.type === 'roomEnter')) {
        this.win.show('The rush is done');
        this.winSub.show(`three have fallen  \u00b7  ${fightTime(sim.save.time)} in all`);
      }
      this.root.visible = true;
      this.bar.clear();
      this.name.alpha = 0;
      this.win.text.position.set(cx, SAFE_H * 0.28);
      this.winSub.text.position.set(cx, SAFE_H * 0.28 + 66);
      this.win.update(dt);
      this.winSub.update(dt);
      this.hint.text.position.set(cx, view.top + view.h - 70);
      this.hint.update(dt);
      return;
    }
    this.hint.t = 1e6;
    this.hint.text.alpha = 0;
    this.root.visible = !!b && !!spec && painted;
    if (!b || !spec || !painted) return;
    for (const e of sim.events) {
      if (e.type === 'bossLock') {
        this.card.show(spec.name.toUpperCase());
        this.cardSub.show(e.attempt > 1 || e.retry ? `attempt ${Math.max(2, e.attempt)}` : '');
        this.win.t = 1e6;
        this.winSub.t = 1e6;
      } else if (e.type === 'bossPhase' && e.phase > 1)
        // (The rush's Gloamweaver hunts again in P3: its table's "the Gloam lamp" is Lanternroot's.)
        this.phase.show(`—  ${spec.rush && e.phase === 3 ? 'the frenzy' : e.name}  —`);
      else if (e.type === 'bossDefeat') {
        this.flashK = 1;
        this.win.show(`${spec.name} falls  ·  ${fightTime(e.time)}`);
      } else if (e.type === 'bossGrant') this.winSub.show(e.text);
    }
    this.card.text.position.set(cx, SAFE_H * 0.3);
    this.cardSub.text.position.set(cx, SAFE_H * 0.3 + 70);
    this.phase.text.position.set(cx, SAFE_H * 0.26);
    this.win.text.position.set(cx, SAFE_H * 0.28);
    this.winSub.text.position.set(cx, SAFE_H * 0.28 + 66);
    for (const l of [this.card, this.cardSub, this.phase, this.win, this.winSub]) l.update(dt);
    // The final blow's flash: the whole view white, fading.
    this.flash.clear();
    if (this.flashK > 0) {
      this.flash
        .rect(view.left, view.top, view.w, view.h)
        .fill({ color: 0xfff8ee, alpha: this.flashK * BOSS_HUD.flash });
      this.flashK = Math.max(0, this.flashK - dt * 2.2);
    }
    // The bar: while it is on (intro, fight, between phases).
    const on = b.stage === 'intro' || b.stage === 'fight' || b.stage === 'shift';
    this.barA = Math.max(0, Math.min(1, this.barA + (on ? dt * 3 : -dt * 1.5)));
    this.bar.clear();
    this.name.alpha = this.barA;
    if (this.barA <= 0) return;
    const rules = bossRules(spec.kind);
    const n = rules.phases.length;
    const left = this.left(sim);
    const k = b.stage === 'end' || b.stage === 'down' ? 0 : left;
    if (k < this.shown - 0.001) this.hurt = 1;
    this.shown = k > this.shown ? k : Math.max(k, this.shown - dt * 0.6);
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const C = BOSS_HUD.colors;
    const w = BOSS_HUD.barW;
    const h = BOSS_HUD.barH;
    const x0 = cx - w / 2;
    const y0 = view.top + view.h - BOSS_HUD.foot;
    const A = this.barA;
    this.bar.roundRect(x0 - 3, y0 - 3, w + 6, h + 6, 4).fill({ color: C.back, alpha: 0.7 * A });
    // One bar for the whole fight, draining from its right end; a notch where each phase begins, the last blow's
    // share trailing in the hurt colour.
    this.bar.rect(x0, y0, w, h).fill({ color: C.done, alpha: 0.6 * A });
    if (this.shown > k)
      this.bar.rect(x0, y0, w * this.shown, h).fill({ color: C.hurt, alpha: (0.5 + 0.5 * this.hurt) * A });
    if (k > 0) this.bar.rect(x0, y0, w * k, h).fill({ color: C.bar, alpha: 0.95 * A });
    for (let i = 1; i < n; i++)
      this.bar.rect(x0 + (w * i) / n - 1.5, y0 - 3, 3, h + 6).fill({ color: C.back, alpha: 0.9 * A });
    this.bar.rect(x0, y0 - 1, w, 1).fill({ color: C.edge, alpha: 0.35 * A });
    this.name.text = spec.name.toUpperCase();
    this.name.position.set(cx, y0 - 24);
  }

  /** The share of the whole fight left (1 = untouched): whole phases ahead plus the current one's share. */
  private left(sim: SimView): number {
    const b = sim.boss;
    const spec = sim.scene.boss;
    if (!b || !spec) return 0;
    const n = bossRules(spec.kind).phases.length;
    if (b.stage === 'wait' || b.stage === 'intro' || b.phase <= 0) return 1;
    const e = sim.enemies.find((q) => q.id === spec.creature);
    let cur = 1;
    if (spec.kind === 'weaver' && b.phase === 1) {
      // The Weaver's ring: the ring flames still burning.
      const L = sim.scene.lures ?? [];
      let lit = 0;
      for (const id of spec.rings) {
        const i = L.findIndex((l) => l.id === id);
        if (i >= 0 && (sim.lures.hp[i] ?? 0) > 0) lit++;
      }
      cur = lit / Math.max(1, spec.rings.length);
    } else if (spec.kind === 'weaver' && b.phase === 4) {
      const i = (sim.scene.lures ?? []).findIndex((l) => l.id === spec.heart);
      const l = sim.scene.lures?.[i];
      const max = l ? Math.max(1, tuning.lures.kinds.great.hp) : 3;
      cur = Math.max(0, (sim.lures.hp[i] ?? 0) / max);
    } else if (e) cur = e.hpMax > 0 ? Math.max(0, e.hp / e.hpMax) : 0;
    if (b.stage === 'shift') cur = 0;
    return Math.max(0, Math.min(1, (n - b.phase + cur) / n));
  }
}
