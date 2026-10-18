/**
 * The greybox render mode (memory/greybox.md): rooms whose JSON says `art: { mode: 'greybox' }` are
 * drawn with minimal readable graphics instead of the painted layers, so a whole region can be
 * designed and played before any art. One environment module (`GreyboxLayer`) replaces every
 * painted one (src/render/scene/index.ts picks it); Wing keeps her real rig; the creatures draw as
 * filled greybox shapes with their danger parts over her (creatures.ts). The stage
 * turns post-processing off and hides the painted creatures for such a room.
 *
 *   sky        a flat dark background with a subtle vertical gradient over the whole view (any shape)
 *   playfield  the grid, solids (a bright walkable top), one-ways, hazards, catch zones, exits, rest points
 *   goal       lures: field, core, flame, husk, the dark a snuff leaves; creatures' bodies (behind her)
 *   air        creatures' danger parts and tells, lure effects, freed moths, motes, labels (over her)
 */
import { Container, Graphics } from 'pixi.js';
import { drawWebs } from '../../debug/overlay';
import type { SceneContext, SceneFrame } from '../scene/index';
import { BossView } from './boss';
import { CreatureView } from './creatures';
import { KitView, kitLabels } from './kit';
import { LureView } from './lures';
import { Motes } from './motes';
import { GB } from './palette';
import { StagingView } from './staging';
import { buildLabels, buildStatic } from './static';
import { WorldView } from './world';

export { isGreybox } from '../../scene/room';

/** Live greybox settings (the debug API and the G key toggle the labels). */
export const GREYBOX = { labels: true };

/** Bands in the background gradient. */
const BANDS = 24;

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

export class GreyboxLayer {
  private ctx!: SceneContext;
  private readonly sky = new Graphics();
  private skyKey = '';
  private readonly lureBack = new Graphics();
  private readonly front = new Graphics();
  /** Webs' strands, creatures' danger parts, tells and the answers to blows: over her. */
  private readonly creatures = new Graphics();
  /** Creatures' bodies: under her (creatures.ts). */
  private readonly creatureBack = new Graphics();
  private readonly creatureView = new CreatureView();
  /** Dust and sparks off her body (motes.ts): over her. */
  private readonly motes = new Motes();
  private readonly moteGfx = new Graphics();
  private labels!: Container;
  private readonly lures = new LureView();
  private world!: WorldView;
  /** The level kit (memory/level-kit.md): thorns, seed-cases, bark, gates, triggers, camera zones. */
  private readonly kit = new KitView();
  /** A boss fight (memory/bosses.md): doors, threads, tells, the label and the name card. */
  private boss!: BossView;
  /** The story's set pieces in grey (staging.ts, memory/staging.md). */
  private staging!: StagingView;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const room = ctx.scene;
    GREYBOX.labels = room.art?.labels ?? true;
    this.staging = new StagingView(room.marks?.stage);
    ctx.layers.sky.addChild(this.sky, this.staging.far, this.staging.farText);
    ctx.layers.playfield.addChild(buildStatic(room));
    ctx.layers.get('goal').addChild(this.staging.back, this.lureBack, this.creatureBack);
    this.labels = buildLabels(room);
    kitLabels(room, this.labels);
    // Patches, glades, shortcuts and doors (memory/world.md): under her, their flashes and lines over her.
    const flashText = new Container({ label: 'greybox-world-text' });
    this.world = new WorldView(flashText);
    this.boss = new BossView(flashText);
    ctx.layers.playfield.addChild(this.world.back, this.kit.back, this.boss.back);
    ctx.layers.air.addChild(
      this.staging.front,
      this.creatures,
      this.moteGfx,
      this.front,
      this.world.front,
      this.kit.front,
      this.boss.front,
      this.labels,
      flashText,
    );
  }

  update(frame: SceneFrame): void {
    this.drawSky();
    const { sim, dt, clock } = frame;
    this.staging.onEvents(sim.events);
    this.staging.draw(dt, clock, sim, frame.camera);
    this.lures.onEvents(sim.events, sim);
    this.lureBack.clear();
    this.front.clear();
    this.lures.draw(dt, clock, sim, this.lureBack, this.front);
    this.world.onEvents(sim.events);
    this.world.draw(dt, clock, sim);
    this.kit.onEvents(sim.events, sim);
    this.kit.draw(dt, clock, sim, GREYBOX.labels);
    this.boss.onEvents(sim.events, sim);
    this.boss.draw(dt, clock, sim);
    const g = this.creatures.clear();
    // Webs first (their strands), then the creatures over them (memory/creatures.md).
    drawWebs(g, sim.scene, sim.enemies, sim.player);
    this.creatureView.onEvents(sim.events, sim);
    this.creatureView.draw(dt, clock, sim, this.creatureBack.clear(), g, frame.camera.zoom);
    this.motes.onEvents(sim.events);
    this.motes.update(dt, sim.player, this.moteGfx.clear());
    this.labels.visible = GREYBOX.labels;
  }

  /** The background over the whole view, redrawn only when the view's shape changes. */
  private drawSky(): void {
    const v = this.ctx.view();
    const key = `${v.left},${v.top},${v.w},${v.h}`;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const g = this.sky.clear();
    const bh = v.h / BANDS;
    for (let i = 0; i < BANDS; i++)
      g.rect(v.left, v.top + i * bh, v.w, bh + 1).fill({
        color: mix(GB.skyTop, GB.skyBottom, i / (BANDS - 1)),
      });
  }
}
