/**
 * The hatching branch's cast (memory/hatch-and-tatter.md): the cocoon row (cocoons.ts) and Tatter
 * (tatter.ts), and the hand-off to the hero skin (hatch-link.ts). Owned by the CharacterRenderer, which
 * hands it the sim's `state.hatch` every frame. A room without cocoons or Tatter costs nothing.
 *
 * Draw order in the character layer: [husks, Tatter] behind the hero, [her cocoon, falling husk and
 * silk] in front of her (`front`, kept on top by the renderer).
 */
import type { Container } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { HatchState } from '../../sim/state';
import type { PlayerView, RenderContext } from '../contract';
import { CocoonRow, propLight } from './cocoons';
import { hatchLink } from './hatch-link';
import { clamp } from './math';
import { Tatter } from './tatter';
import { Painter } from './vesper/paint';

export class Cast {
  private readonly row: CocoonRow;
  private readonly tatter: Tatter | null;
  private readonly back = new Painter();
  private readonly front = new Painter();
  private readonly bounds: Rectangle;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    const room = ctx.scene;
    this.row = new CocoonRow(room);
    const t = room.marks?.tatter;
    this.tatter = t ? new Tatter(ctx, layer, room, t) : null;
    this.back.mesh.label = 'cocoons';
    this.front.mesh.label = 'cocoon-front';
    this.bounds = new Rectangle(-200, -200, room.width + 400, room.height + 400);
    // Behind the hero (she is added after this): the husks, then Tatter.
    layer.addChildAt(this.back.mesh, 0);
    if (this.tatter) layer.addChildAt(this.tatter.mesh, 1);
    layer.addChild(this.front.mesh);
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
    const at = this.row.hersAt ?? this.ctx.scene.hatch ?? null;
    if (at) {
      l.x = at.x;
      l.y = at.y;
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
  ): void {
    const row = this.row;
    if (!row.any && !this.tatter) return;
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
    if (this.tatter) {
      const stirred = events.some((e) => e.type === 'hatchStir');
      this.tatter.update(dt, clock, hatchLink.inside ? null : her, row.hersAt, row.sinceBreak, stirred);
    }
  }

  destroy(): void {
    this.back.mesh.destroy();
    this.front.mesh.destroy();
    this.tatter?.destroy();
  }
}
