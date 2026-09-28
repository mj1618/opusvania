import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../game';
import { enemyDef, param } from '../sim/ai/schema';
import type { Colour, SimEvent } from '../sim/events';
import { tuning } from '../sim/tuning';
import { VIEW_W } from './camera/index';
import { drawCoin, drawWaxSeal, strokeText, strokeTextWidth } from './glyphs';
import { dashPath, rngFor } from './outline';
import { CBT, colourHex, PALETTE, SIG } from './palette';
import type { SigRect } from './signature';

/** Screen-space layout of the bag HUD (px on the 1920x1080 canvas). */
const LAYOUT = {
  panelX: 16,
  panelY: 56,
  panelW: 252,
  panelH: 208,
  slotX: 32,
  slotY: 88,
  slot: 48,
  slotGap: 12,
  weightY: 150,
  dialX: 226,
  dialY: 184,
  dialR: 24,
  chinY: 208,
  chinX: 40,
  chinGap: 24,
  chinR: 8,
  coinX: 44,
  coinY: 246,
  bossY: 116,
  bossW: 900,
  bossH: 20,
};

interface Coin {
  x: number;
  y: number;
  age: number;
  delay: number;
}

/** Needle angle (radians from straight up) per weight class. */
const NEEDLE: Record<string, number> = { feather: -1, middle: 0, heavy: 1 };
const WEIGHT_INK: Record<string, number> = { feather: 0xcfe8ff, middle: 0xf1d6a4, heavy: PALETTE.brown };

interface Ribbon {
  colour: Colour;
  from: { x: number; y: number; world: boolean } | { slot: number };
  to: { x: number; y: number; world: boolean } | { slot: number };
  age: number;
  /** Slot whose puck grows in as the ribbon arrives (seizeTake). */
  fills: number;
}

/**
 * Bag HUD (L3 brief §5): three slots oldest-left/newest-right with a "next" caret on what Levy
 * throws, the weight plate with a 3-position needle, Chin pips, and the take/push ribbons between
 * world targets and slots. Stepped once per sim step (deterministic), shown only where the player
 * has the seize ability.
 */
export class BagHud {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly ribbonsG = new Graphics();
  private readonly nextLabel: Text;
  private readonly weightLabel: Text;
  private ribbons: Ribbon[] = [];
  private needle: { from: number; to: number; age: number } = { from: -1, to: -1, age: SIG.needleFrames };
  private slots: SigRect[] = [];
  private coins: Coin[] = [];
  /** Poundage shown on the counter (ticks up as coins land). */
  private shown = 0;
  private pending = 0;
  private coinPing = 0;
  /** Pickup juice: a ring bursts off a slot as its sound lands; gold sparks off the counter. */
  private slotBurst: { slot: number; colour: Colour; age: number }[] = [];
  private sparkles: { x: number; y: number; vx: number; vy: number; age: number }[] = [];
  private stepN = 0;
  private ringAge = 0;

  constructor(private readonly game: Game) {
    const font = 'ui-monospace, Menlo, monospace';
    this.nextLabel = new Text({
      text: 'NEXT',
      style: { fontFamily: font, fontSize: 13, fill: PALETTE.hudInk, fontWeight: 'bold' },
    });
    this.nextLabel.anchor.set(0.5, 0);
    this.weightLabel = new Text({
      text: '',
      style: { fontFamily: font, fontSize: 24, fill: PALETTE.hudInk, fontWeight: 'bold', letterSpacing: 2 },
    });
    this.weightLabel.position.set(LAYOUT.slotX, LAYOUT.weightY);
    this.container.addChild(this.g, this.nextLabel, this.weightLabel, this.ribbonsG);
    this.reset();
  }

  reset(): void {
    this.ribbons = [];
    this.coins = [];
    this.slotBurst = [];
    this.sparkles = [];
    this.pending = 0;
    this.shown = this.game.state.run.poundage;
    const a = NEEDLE[this.game.state.player.profile] ?? -1;
    this.needle = { from: a, to: a, age: SIG.needleFrames };
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const prevBag = this.game.prev.local.bag;
    this.stepN++;
    for (const r of this.ribbons)
      if (r.fills >= 0 && r.age === SIG.ribbonFrames - 1)
        this.slotBurst.push({ slot: r.fills, colour: r.colour, age: 0 });
    for (const b of this.slotBurst) b.age++;
    this.slotBurst = this.slotBurst.filter((b) => b.age < 16);
    for (const p of this.sparkles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4;
      p.vx *= 0.92;
      p.age++;
    }
    this.sparkles = this.sparkles.filter((p) => p.age < 22);
    for (const r of this.ribbons) r.age++;
    this.ribbons = this.ribbons.filter((r) => r.age < SIG.ribbonFrames);
    if (this.needle.age < SIG.needleFrames) this.needle.age++;
    this.ringAge = s.player.ring > 0 ? this.ringAge + 1 : 0;
    if (this.coinPing > 0) this.coinPing--;
    for (const c of this.coins) c.age++;
    const landed = this.coins.filter((c) => c.age >= c.delay + CBT.coinFrames).length;
    if (landed > 0) {
      this.coinPing = 6;
      const rnd = rngFor(this.stepN, 404);
      for (let i = 0; i < 5 * landed; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
        const sp = 3 + rnd() * 5;
        this.sparkles.push({
          x: LAYOUT.coinX,
          y: LAYOUT.coinY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          age: 0,
        });
      }
    }
    this.coins = this.coins.filter((c) => c.age < c.delay + CBT.coinFrames);
    if (this.coins.length === 0) this.pending = 0;
    const target = s.run.poundage - this.pending;
    if (this.shown < target)
      this.shown = Math.min(target, this.shown + Math.max(1, Math.ceil((target - this.shown) / 8)));
    else if (this.shown > target) this.shown = target;
    for (const e of events) {
      if (e.type === 'poundage' && e.amount > 0) {
        // Coins fly from where it was paid to the counter; the number ticks up as they land.
        this.pending += e.amount;
        const n = Math.max(CBT.coinsPerPayout, Math.min(14, e.amount));
        for (let i = 0; i < n; i++)
          this.coins.push({ x: e.x + (i - 2.5) * 10, y: e.y - (i % 2) * 14, age: 0, delay: i * 2 });
      }
      if (e.type === 'seizeTake') {
        const slot = s.local.bag.indexOf(e.soundId);
        if (slot >= 0)
          this.ribbons.push({
            colour: e.colour,
            from: { x: e.x, y: e.y, world: true },
            to: { slot },
            age: 0,
            fills: slot,
          });
      } else if (e.type === 'bagPush') {
        const slot = Math.max(0, prevBag.indexOf(e.soundId));
        this.ribbons.push({
          colour: e.colour,
          from: { slot },
          to: { x: e.x, y: e.y, world: true },
          age: 0,
          fills: -1,
        });
      } else if (e.type === 'snatch') {
        const snd = s.local.sounds.find((x) => x.id === e.soundId);
        const slot = prevBag.indexOf(e.soundId);
        if (snd && slot >= 0)
          this.ribbons.push({
            colour: snd.colour,
            from: { slot },
            to: { x: e.x, y: e.y, world: true },
            age: 0,
            fills: -1,
          });
      } else if (e.type === 'profileChange') {
        this.needle = { from: this.needleAngle(), to: NEEDLE[e.to] ?? 0, age: 0 };
      }
    }
  }

  private drawBoss(g: Graphics): void {
    drawBossBar(g, this.game);
  }

  private needleAngle(): number {
    const n = this.needle;
    const t = Math.min(1, n.age / SIG.needleFrames);
    // Ease out with a little overshoot: a scale needle settling.
    const k = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
    return n.from + (n.to - n.from) * (t >= 1 ? 1 : k);
  }

  slotRects(): readonly SigRect[] {
    return this.slots;
  }

  /**
   * `cam` = the world container's offset (world px + cam = unzoomed canvas px); `zoom` = the combat
   * render zoom (canvas = unzoomed * z + o).
   */
  draw(
    cam: { x: number; y: number },
    zoom: { z: number; ox: number; oy: number } = { z: 1, ox: 0, oy: 0 },
  ): void {
    const s = this.game.state;
    const g = this.g.clear();
    const rg = this.ribbonsG.clear();
    this.slots = [];
    const show = s.player.abilities.seize;
    this.container.visible = show;
    if (!show) return;
    const L = s.local;
    const Lh = LAYOUT;
    const N = tuning.bag.slots;

    g.roundRect(Lh.panelX, Lh.panelY, Lh.panelW, Lh.panelH, 10).fill({
      color: PALETTE.hudPanel,
      alpha: 0.72,
    });

    const growing = new Map<number, number>();
    for (const r of this.ribbons) if (r.fills >= 0) growing.set(r.fills, r.age / SIG.ribbonFrames);

    const newest = L.bag.length - 1;
    for (let i = 0; i < N; i++) {
      const x = Lh.slotX + i * (Lh.slot + Lh.slotGap);
      const y = Lh.slotY;
      const cx = x + Lh.slot / 2;
      const cy = y + Lh.slot / 2;
      const id = L.bag[i];
      const snd = id === undefined ? undefined : L.sounds.find((o) => o.id === id);
      g.roundRect(x, y, Lh.slot, Lh.slot, 8).stroke({ width: 2, color: PALETTE.hudDim, alpha: 0.6 });
      if (!snd) {
        dashPath(g, circlePts(cx, cy, 16, 24), true, 5, 4);
        g.stroke({ width: 2, color: PALETTE.hudDim, alpha: 0.9 });
      } else {
        const grow = growing.get(i);
        const k = grow === undefined ? 1 : 0.4 + 0.6 * grow;
        drawPuck(g, cx, cy, 20 * k, snd.colour);
      }
      if (i === newest) {
        g.roundRect(x - 2, y - 2, Lh.slot + 4, Lh.slot + 4, 9).stroke({
          width: 3,
          color: PALETTE.hudInk,
          alpha: 0.95,
        });
        g.poly([cx - 8, y - 12, cx + 8, y - 12, cx, y - 4]).fill(PALETTE.hudInk);
        this.nextLabel.position.set(cx, y - 30);
      }
      this.slots.push({
        id: i,
        kind: 'slot',
        colour: snd?.colour ?? '',
        status: !snd ? 'empty' : i === newest ? 'next' : 'full',
        x,
        y,
        w: Lh.slot,
        h: Lh.slot,
      });
    }
    this.nextLabel.visible = newest >= 0;

    // Weight plate: FEATHER / MIDDLE / HEAVY with a 3-position needle.
    const prof = s.player.profile;
    const name = prof.toUpperCase();
    if (this.weightLabel.text !== name) this.weightLabel.text = name;
    this.weightLabel.style.fill = WEIGHT_INK[prof] ?? PALETTE.hudInk;
    const dx = Lh.dialX;
    const dy = Lh.dialY;
    const R = Lh.dialR;
    g.moveTo(dx - R, dy)
      .arc(dx, dy, R, Math.PI, 2 * Math.PI)
      .stroke({ width: 3, color: PALETTE.hudDim });
    for (const [cls, a] of Object.entries(NEEDLE)) {
      const on = cls === prof;
      const ux = Math.sin(a * 0.96);
      const uy = -Math.cos(a * 0.96);
      g.moveTo(dx + ux * (R - 6), dy + uy * (R - 6))
        .lineTo(dx + ux * (R + 5), dy + uy * (R + 5))
        .stroke({ width: on ? 4 : 2, color: on ? (WEIGHT_INK[cls] ?? PALETTE.hudInk) : PALETTE.hudDim });
    }
    const a = this.needleAngle() * 0.96;
    g.moveTo(dx, dy)
      .lineTo(dx + Math.sin(a) * (R - 2), dy - Math.cos(a) * (R - 2))
      .stroke({ width: 3, color: PALETTE.hudInk });
    g.circle(dx, dy, 4).fill(PALETTE.hudInk);

    // Chin pips up to max Chin, then Lien pips (red wax seals) for the pips under a Lien.
    const p = s.player;
    const chinMax = p.chinMax;
    const frame = s.frame;
    for (let i = 0; i < chinMax; i++) {
      const x = Lh.chinX + i * Lh.chinGap;
      if (i < p.chin) g.circle(x, Lh.chinY, Lh.chinR).fill(PALETTE.chin);
      else if (i === p.chin && p.ring > 0) {
        // Ringing: the pip just lost vibrates with sound rings; the arc is the window left.
        const dx = Math.sin(frame * 2.2) * 2;
        const k = p.ring / tuning.kid.ringFrames;
        g.circle(x + dx, Lh.chinY, Lh.chinR).fill({
          color: PALETTE.chin,
          alpha: 0.45 + 0.3 * Math.sin(frame * 0.9),
        });
        for (let r = 0; r < 2; r++) {
          const u = (((this.ringAge / 14 + r / 2) % 1) + 1) % 1;
          g.circle(x, Lh.chinY, Lh.chinR + 2 + u * 10).stroke({
            width: 2,
            color: PALETTE.chin,
            alpha: 0.7 * (1 - u),
          });
        }
        g.moveTo(x, Lh.chinY - Lh.chinR - 5)
          .arc(x, Lh.chinY, Lh.chinR + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
          .stroke({ width: 2.5, color: PALETTE.gold, alpha: 0.95 });
      } else g.circle(x, Lh.chinY, Lh.chinR - 1).stroke({ width: 2, color: PALETTE.hudDim });
    }
    for (let i = 0; i < s.run.lien; i++)
      drawWaxSeal(g, Lh.chinX + (chinMax + i) * Lh.chinGap, Lh.chinY, Lh.chinR + 2);

    // Poundage: a coin and the count (ticks up); debt in garnish mode.
    const ping = this.coinPing / 6;
    drawCoin(g, Lh.coinX, Lh.coinY, 10 * (1 + 0.25 * ping));
    const txt = String(this.shown);
    strokeText(g, txt, Lh.coinX + 18 + strokeTextWidth(txt, 16) / 2, Lh.coinY, 16 * (1 + 0.12 * ping), {
      color: ping > 0 ? PALETTE.coin : PALETTE.hudInk,
      width: 3,
    });
    if (s.run.debt > 0) {
      const d = `-${s.run.debt}`;
      strokeText(g, d, Lh.panelX + Lh.panelW - 16 - strokeTextWidth(d, 14) / 2, Lh.coinY, 14, {
        color: PALETTE.stampRed,
        width: 3,
      });
    }
    // Counter pulse: the panel edge glows gold while coins land.
    if (ping > 0)
      g.roundRect(Lh.panelX, Lh.panelY, Lh.panelW, Lh.panelH, 10).stroke({
        width: 3,
        color: PALETTE.coin,
        alpha: ping,
      });
    for (const c of this.coins) {
      if (c.age < c.delay) continue;
      const a0 = { x: (c.x + cam.x) * zoom.z + zoom.ox, y: (c.y + cam.y) * zoom.z + zoom.oy };
      const at = (age: number) => {
        const t = Math.max(0, Math.min(1, (age - c.delay) / CBT.coinFrames));
        const u = t * t;
        return [
          a0.x + (Lh.coinX - a0.x) * u,
          a0.y + (Lh.coinY - a0.y) * u - Math.sin(t * Math.PI) * 120,
        ] as const;
      };
      // A glittering tail behind each coin.
      for (let j = 3; j >= 1; j--) {
        const [tx, ty] = at(c.age - j * 1.5);
        rg.circle(tx, ty, 6 - j).fill({ color: PALETTE.coin, alpha: 0.5 - j * 0.12 });
      }
      const [x, y] = at(c.age);
      drawCoin(rg, x, y, 13, 1, Math.abs(Math.cos(c.age * 0.5)) * 0.8 + 0.2);
      if (c.age % 6 < 2) rg.circle(x - 4, y - 5, 3).fill({ color: 0xffffff, alpha: 0.9 });
    }
    for (const p of this.sparkles) {
      const k = 1 - p.age / 22;
      rg.rect(p.x - 2, p.y - 2, 4, 4).fill({ color: p.age % 4 < 2 ? 0xffffff : PALETTE.coin, alpha: k });
    }
    // A sound landing in its slot: a ring bursts off the slot in its colour.
    for (const b of this.slotBurst) {
      const t = b.age / 16;
      const cx = Lh.slotX + b.slot * (Lh.slot + Lh.slotGap) + Lh.slot / 2;
      const cy = Lh.slotY + Lh.slot / 2;
      rg.circle(cx, cy, 26 + 30 * (1 - (1 - t) ** 2)).stroke({
        width: 5 * (1 - t) + 1,
        color: colourHex(b.colour),
        alpha: 1 - t,
      });
      if (b.age < 3) rg.circle(cx, cy, 30).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
    }

    this.drawBoss(g);

    // Ribbons: 12 f from the target to the slot (take) or from the slot to the source (push).
    const pos = (p: Ribbon['from']): { x: number; y: number } =>
      'slot' in p
        ? { x: Lh.slotX + p.slot * (Lh.slot + Lh.slotGap) + Lh.slot / 2, y: Lh.slotY + Lh.slot / 2 }
        : { x: (p.x + cam.x) * zoom.z + zoom.ox, y: (p.y + cam.y) * zoom.z + zoom.oy };
    for (const r of this.ribbons) {
      const a0 = pos(r.from);
      const a1 = pos(r.to);
      const c = colourHex(r.colour);
      const ctrl = { x: (a0.x + a1.x) / 2, y: Math.min(a0.y, a1.y) - 140 };
      const at = (t: number) => {
        const u = 1 - t;
        return {
          x: u * u * a0.x + 2 * u * t * ctrl.x + t * t * a1.x,
          y: u * u * a0.y + 2 * u * t * ctrl.y + t * t * a1.y,
        };
      };
      const t1 = easeInOut(Math.min(1, (r.age + 1) / SIG.ribbonFrames));
      const t0 = Math.max(0, t1 - 0.4);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const p0 = at(t0 + ((t1 - t0) * i) / n);
        const p1 = at(t0 + ((t1 - t0) * (i + 1)) / n);
        rg.moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: 2 + (i / n) * 8, color: c, alpha: 0.35 + (0.6 * i) / n, cap: 'round' });
      }
      const h = at(t1);
      rg.circle(h.x, h.y, 10).fill(c);
      rg.circle(h.x, h.y, 10).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    }
  }
}

/** Draws the boss bar (top centre) and the fever gauge, when a boss is in the room. */
function drawBossBar(g: Graphics, game: Game): void {
  const s = game.state;
  const boss = s.local.enemies.find((e) => e.boss && e.state !== 'KO' && e.state !== 'REPOSSESSED');
  const fever = Math.max(s.run.fever, s.local.fever);
  const cx = VIEW_W / 2;
  const y = LAYOUT.bossY;
  if (boss?.boss) {
    const d = enemyDef(boss.type);
    const hp1 = d.hp;
    const hp2 = param(d, 'phase2Hp');
    const W = LAYOUT.bossW;
    const H = LAYOUT.bossH;
    const w1 = (W * hp1) / (hp1 + hp2) - 4;
    const w2 = W - w1 - 8;
    const x0 = cx - W / 2;
    strokeText(g, 'THE AUCTIONEER', cx, y - 20, 16, { color: PALETTE.hudInk, width: 3 });
    const ph = boss.boss.phase;
    const f1 = ph === 1 ? Math.max(0, boss.hp) / hp1 : 0;
    const f2 = ph === 2 ? Math.max(0, boss.hp) / hp2 : 1;
    for (const [x, w, fill, on] of [
      [x0, w1, f1, ph === 1],
      [x0 + w1 + 8, w2, f2, ph === 2],
    ] as const) {
      g.rect(x, y, w, H).fill({ color: PALETTE.bossBarBack, alpha: 0.9 });
      if (fill > 0)
        g.rect(x, y, w * Math.min(1, fill), H).fill({ color: PALETTE.bossBar, alpha: on ? 1 : 0.35 });
      g.rect(x, y, w, H).stroke({ width: 2, color: on ? PALETTE.hudInk : PALETTE.hudDim });
    }
    // Downed: the bar flashes gold (the Count is the phase gate).
    if (boss.state === 'DOWN' || boss.state === 'COUNT')
      g.rect(x0 - 4, y - 4, W + 8, H + 8).stroke({
        width: 3,
        color: PALETTE.gold,
        alpha: 0.5 + 0.5 * Math.sin(s.frame * 0.5),
      });
  }
  if (boss || fever > 0) {
    // Fever: four segments like a thermometer.
    const fx = cx + LAYOUT.bossW / 2 + 40;
    strokeText(g, 'FEVER', fx + 30, y - 20, 12, { color: PALETTE.hudInk, width: 2.5 });
    for (let i = 0; i < 4; i++) {
      const on = i < fever;
      g.roundRect(fx + i * 16, y + 16 - i * 4 - 4, 12, 8 + i * 4, 3).fill({
        color: on ? PALETTE.furious : PALETTE.bossBarBack,
        alpha: on ? 1 : 0.8,
      });
    }
  }
}

/** A bag puck: colour disc plus its glyph (brown square, pink zigzag, violet chevron). */
function drawPuck(g: Graphics, cx: number, cy: number, r: number, colour: Colour): void {
  g.circle(cx, cy, r).fill(colourHex(colour));
  g.circle(cx, cy, r).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
  const ink = PALETTE.bg;
  const k = r / 20;
  if (colour === 'brown') g.rect(cx - 7 * k, cy - 7 * k, 14 * k, 14 * k).fill(ink);
  else if (colour === 'pink')
    g.poly(
      [
        cx - 10 * k,
        cy + 4 * k,
        cx - 5 * k,
        cy - 5 * k,
        cx,
        cy + 4 * k,
        cx + 5 * k,
        cy - 5 * k,
        cx + 10 * k,
        cy + 4 * k,
      ],
      false,
    ).stroke({
      width: 3.5 * k,
      color: ink,
      join: 'miter',
    });
  else if (colour === 'violet')
    g.poly([cx - 7 * k, cy - 8 * k, cx + 5 * k, cy, cx - 7 * k, cy + 8 * k], false).stroke({
      width: 4 * k,
      color: ink,
      join: 'miter',
    });
}

function circlePts(cx: number, cy: number, r: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
