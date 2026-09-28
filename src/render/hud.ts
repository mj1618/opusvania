import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../game';
import type { Colour, SimEvent } from '../sim/events';
import { tuning } from '../sim/tuning';
import { dashPath } from './outline';
import { colourHex, PALETTE, SIG } from './palette';
import type { SigRect } from './signature';

/** Screen-space layout of the bag HUD (px on the 1920x1080 canvas). */
const LAYOUT = {
  panelX: 16,
  panelY: 56,
  panelW: 252,
  panelH: 168,
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
};

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
    const a = NEEDLE[this.game.state.player.profile] ?? -1;
    this.needle = { from: a, to: a, age: SIG.needleFrames };
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const prevBag = this.game.prev.local.bag;
    for (const r of this.ribbons) r.age++;
    this.ribbons = this.ribbons.filter((r) => r.age < SIG.ribbonFrames);
    if (this.needle.age < SIG.needleFrames) this.needle.age++;
    for (const e of events) {
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

  /** `cam` = the world container's offset (world px + cam = canvas px). */
  draw(cam: { x: number; y: number }): void {
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

    // Chin pips.
    const chinMax = tuning.kid.chin;
    for (let i = 0; i < chinMax; i++) {
      const x = Lh.chinX + i * Lh.chinGap;
      if (i < s.player.chin) g.circle(x, Lh.chinY, Lh.chinR).fill(PALETTE.chin);
      else g.circle(x, Lh.chinY, Lh.chinR - 1).stroke({ width: 2, color: PALETTE.hudDim });
    }

    // Ribbons: 12 f from the target to the slot (take) or from the slot to the source (push).
    const pos = (p: Ribbon['from']): { x: number; y: number } =>
      'slot' in p
        ? { x: Lh.slotX + p.slot * (Lh.slot + Lh.slotGap) + Lh.slot / 2, y: Lh.slotY + Lh.slot / 2 }
        : { x: p.x + cam.x, y: p.y + cam.y };
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
