/**
 * The hatching branch's cast (memory/hatch-and-tatter.md): the cocoon row (cocoons.ts) and Tatter
 * (tatter.ts), and the hand-off to the hero skin (hatch-link.ts). Owned by the CharacterRenderer, which
 * hands it the sim's `state.hatch` every frame. A room without cocoons or Tatter costs nothing.
 *
 * Draw order in the character layer: [husks, Tatter] behind the hero, [her cocoon, falling husk and
 * silk] in front of her (`front`, kept on top by the renderer).
 */
import type { Container } from 'pixi.js';
import { Graphics, Rectangle } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { HatchState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { PlayerView, RenderContext } from '../contract';
import { CocoonRow, propLight } from './cocoons';
import { hatchLink } from './hatch-link';
import { clamp } from './math';
import { TATTER, Tatter } from './tatter';
import { Painter } from './vesper/paint';

/**
 * Her cocoon's presses as pips under it, the same look as a lamp catch's beats (greybox/lures.ts), so the
 * three presses here teach the three beats later (plan r3, item 1). Seconds to fade in once the picture is
 * up, to fade out after she breaks out; px below its foot (the branch is over it), between pips, radius.
 */
export const COCOON_PIPS = {
  from: 1.2,
  in: 0.6,
  out: 0.5,
  below: 22,
  gap: 26,
  r: 8,
  hot: 0xfff0c0,
  husk: 0x6b7385,
};

/** A climbing Tatter's path (src/scene/stage.ts `tatters[].climb`). */
type TatterClimb = { path: [number, number][]; lead?: number; speed?: number };

/** Tatter's climb: px above her feet it keeps, px/s while it pulls, seconds of each pull and of each rest. */
export const TATTER_CLIMB = { lead: 420, speed: 260, pull: 0.45, rest: 0.55 };

export class Cast {
  private readonly row: CocoonRow;
  /** Tatter, once per mark (`marks.tatter`, then `marks.stage.tatters`), each with its climb if it has one. */
  private readonly tatters: { t: Tatter; climb: TatterClimb | null; u: number; pull: number }[] = [];
  private readonly back = new Painter();
  private readonly front = new Painter();
  private readonly bounds: Rectangle;
  private readonly pips = new Graphics({ label: 'cocoon-pips' });
  private pipA = 0;
  private pipN = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    const room = ctx.scene;
    this.row = new CocoonRow(room);
    const t = room.marks?.tatter;
    if (t) this.tatters.push({ t: new Tatter(ctx, layer, room, t), climb: null, u: 0, pull: 0 });
    for (const m of room.marks?.stage?.tatters ?? [])
      this.tatters.push({ t: new Tatter(ctx, layer, room, m), climb: m.climb ?? null, u: 0, pull: 0 });
    if (typeof window !== 'undefined') {
      const self = this;
      (window as unknown as { __tatter?: unknown }).__tatter = {
        get info(): Record<string, number> | null {
          return self.tatters[0]?.t.info ?? null;
        },
        /** Its knobs, live (tools: change one, then step). */
        knobs: TATTER,
      };
    }
    this.back.mesh.label = 'cocoons';
    this.front.mesh.label = 'cocoon-front';
    this.bounds = new Rectangle(-200, -200, room.width + 400, room.height + 400);
    // Behind the hero (she is added after this): the husks, then Tatter.
    layer.addChildAt(this.back.mesh, 0);
    for (const [i, c] of this.tatters.entries()) layer.addChildAt(c.t.mesh, 1 + i);
    layer.addChild(this.front.mesh);
    layer.addChild(this.pips);
    const visible = this.row.any;
    this.back.mesh.visible = visible;
    this.front.mesh.visible = visible;
  }

  /** The front painter's mesh: the renderer keeps it on top of the hero. */
  get frontMesh(): Container {
    return this.front.mesh;
  }

  /**
   * Before the skin: works out the link from the sim's hatching and its events. `hatch` is
   * `state.hatch` (null in a room without one).
   */
  link(dt: number, hatch: Readonly<HatchState> | null, events: readonly SimEvent[]): void {
    const inside = !!hatch && !hatch.done;
    const l = hatchLink;
    const g = this.row.hersGeom;
    if (g) {
      l.x = g.x;
      l.y = g.y;
      l.tipY = g.tipY;
      l.botY = g.botY;
    } else if (this.ctx.scene.hatch) {
      const h = this.ctx.scene.hatch;
      l.x = h.x;
      l.y = l.tipY = l.botY = h.y;
    }
    if (inside) {
      l.inside = true;
      l.birthT = 0;
      return;
    }
    l.inside = false;
    if (events.some((e) => e.type === 'hatch')) l.birthT = 0;
    else l.birthT = Math.min(99, l.birthT + dt);
    if (events.some((e) => e.type === 'spawn')) l.birthT = 99;
  }

  /** After the skin: the props, from her as drawn. */
  update(
    dt: number,
    clock: number,
    hatch: Readonly<HatchState> | null,
    her: PlayerView,
    events: readonly SimEvent[],
    flags: readonly string[] = [],
  ): void {
    const row = this.row;
    if (!row.any && this.tatters.length === 0) return;
    row.update(dt, clock, hatch, events);
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    const fw = clamp(1 / scale, 0.06, 1.5);
    const ember = this.ctx.lights.get('ember');
    for (const p of [this.back, this.front]) {
      propLight(p);
      p.fw = fw;
      // Her light rims what is near her (it is silver: no warm on the props).
      if (ember && ember.intensity > 0) {
        p.l2x = ember.x;
        p.l2y = ember.y;
        p.l2r = 130;
        p.l2k = 0.45 * Math.min(1, ember.intensity);
        p.l2c = [0.85, 0.86, 0.84];
      } else p.l2k = 0;
      p.begin();
    }
    if (row.any) {
      row.drawBack(this.back, clock);
      row.drawFront(this.front, clock);
    }
    for (const p of [this.back, this.front]) {
      p.end(0, 0);
      const b = p.mesh.boundsArea;
      b.copyFrom(this.bounds);
    }
    this.drawPips(dt, hatch);
    // Tatter is somewhere only once / until its story flag (`when` / `until`).
    const stirred = events.some((e) => e.type === 'hatchStir');
    const rested = events.some((e) => e.type === 'patchRest');
    for (const c of this.tatters) {
      const t = c.t;
      t.mesh.visible = t.present(flags);
      if (!t.mesh.visible) continue;
      if (c.climb) this.climb(c, dt, her);
      // (It is drawn about its mark: her, seen from where it has climbed to.)
      const seen = hatchLink.inside
        ? null
        : t.ox === 0 && t.oy === 0
          ? her
          : ({ ...her, cx: her.cx - t.ox, feetY: her.feetY - t.oy } as PlayerView);
      t.update(dt, clock, seen, row.hersAt, row.sinceBreak, stirred, rested);
    }
  }

  /**
   * A climbing Tatter (`stage.tatters[].climb`): up its path, `lead` px above her feet as she climbs (never back
   * down), in pulls (`TATTER_CLIMB.pull` s on, `rest` s still), at most `speed` px/s, then sat at the path's end.
   */
  private climb(
    c: { t: Tatter; climb: TatterClimb | null; u: number; pull: number },
    dt: number,
    her: PlayerView,
  ) {
    const C = c.climb as TatterClimb;
    const K = TATTER_CLIMB;
    const pts = C.path;
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as [number, number];
      const b = pts[i] as [number, number];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lens.push(l);
      total += l;
    }
    // How far up she is, as a share of the path's rise (the path climbs: y falls).
    const y0 = (pts[0] as [number, number])[1];
    const y1 = (pts[pts.length - 1] as [number, number])[1];
    const want = clamp((y0 - (her.feetY - (C.lead ?? K.lead))) / Math.max(1, y0 - y1), 0, 1) * total;
    c.pull = (c.pull + dt) % (K.pull + K.rest);
    const pulling = c.pull < K.pull;
    if (pulling && want > c.u)
      c.u = Math.min(want, c.u + ((C.speed ?? K.speed) * dt * (K.pull + K.rest)) / K.pull);
    let d = c.u;
    let x = (pts[0] as [number, number])[0];
    let y = y0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as [number, number];
      const b = pts[i] as [number, number];
      const l = lens[i - 1] as number;
      const k = Math.min(1, d / Math.max(1, l));
      x = a[0] + (b[0] - a[0]) * k;
      y = a[1] + (b[1] - a[1]) * k;
      d -= l;
      if (d <= 0) break;
    }
    c.t.ox = x - (pts[0] as [number, number])[0];
    c.t.oy = y - y0;
  }

  /** The presses over her cocoon: in while she is shut in, out once she is free. */
  private drawPips(dt: number, hatch: Readonly<HatchState> | null): void {
    const P = COCOON_PIPS;
    const g = this.row.hersGeom;
    const inside = !!hatch && !hatch.done;
    if (hatch) this.pipN = hatch.done ? Math.max(this.pipN, hatch.presses) : hatch.presses;
    const want = inside && hatch.frames / 60 >= P.from ? 1 : 0;
    this.pipA = want > this.pipA ? Math.min(1, this.pipA + dt / P.in) : Math.max(0, this.pipA - dt / P.out);
    const pg = this.pips;
    pg.clear();
    if (!g || this.pipA <= 0) return;
    const of = Math.max(1, Math.round(tuning.hatch.presses));
    const done = !!hatch?.done;
    const top = g.botY + P.below;
    for (let k = 0; k < of; k++) {
      const x = g.x + (k - (of - 1) / 2) * P.gap;
      const on = done || k < this.pipN;
      pg.circle(x, top, P.r).fill({ color: on ? P.hot : P.husk, alpha: 0.95 * this.pipA });
      pg.circle(x, top, P.r).stroke({ color: P.hot, width: 2, alpha: 0.8 * this.pipA });
    }
  }

  destroy(): void {
    this.pips.destroy();
    this.back.mesh.destroy();
    this.front.mesh.destroy();
    for (const c of this.tatters) c.t.destroy();
  }
}
