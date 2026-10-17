/**
 * The prologue's picture, v2 "The first night" (docs/story/scenes/prologue-v2.md, about 2 min 50 s,
 * wordless): what the director (src/prologue/) has got to, drawn. It reads the director's plan
 * (plan.ts) every frame.
 *
 *   1 the breath            a plate (plate.ts + breath.ts): the world kit at 1920x1080, own post
 *   2 hatching              in the Grove (grove.ts): the game's own layers and post, frost
 *   3 the first night       played, in the Grove
 *   4 the hollow            in the Grove, a short played escape
 *   5 the summit            a plate (summit.ts: the world-from-high set re-angled)
 *   6 the title, the next night   the title over the summit plate, black, then the Grove
 *
 * Over everything (under the HUD) a black for fades and cuts. Render only: it never writes to the
 * sim or the plan.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { CameraView, PlayerView, RenderContext, SimView } from '../contract';
import { VIEW_H, VIEW_W } from '../contract';
import type { LayerTree } from '../scene/layer-tree';
import { buildBreath } from './breath';
import { GroveActors } from './grove';
import { titleCard } from './outside';
import type { ProloguePlan } from './plan';
import { Plate } from './plate';
import { BEATS, HATCH, HOLLOW, SUMMIT, WAKE } from './script';
import { buildSummit } from './summit';
import { window01 } from './track';

export class PrologueRenderer {
  /** Over the game's layers (plates, the title, the black), under the dip and the HUD. */
  readonly layer = new Container({ label: 'prologue' });
  private readonly black = new Graphics();
  private readonly breath: Plate;
  private readonly summit: Plate;
  private readonly actors: GroveActors;
  private readonly title: Container;
  /** The glint's item text, the one place her having no mouth is named (prologue-v2.md section 6). */
  private readonly item: Text;

  constructor(
    ctx: RenderContext,
    layers: LayerTree,
    private readonly plan: ProloguePlan,
  ) {
    const r = ctx.renderer;
    this.breath = new Plate(r, buildBreath);
    this.summit = new Plate(r, buildSummit);
    this.actors = new GroveActors(ctx, layers, plan);
    this.black.rect(-4, -4, VIEW_W + 8, VIEW_H + 8).fill(0x020306);
    this.title = titleCard();
    this.title.visible = false;
    this.item = new Text({
      text: 'Warmth the forest grows to give away.\nA moth has no mouth to keep it.',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        fontSize: 22,
        fill: 0xe8dcc8,
        lineHeight: 30,
      },
    });
    this.item.position.set(56, VIEW_H - 150);
    this.item.visible = false;
    this.layer.addChild(this.breath.sprite, this.summit.sprite, this.title, this.item, this.black);
    this.layer.eventMode = 'none';
  }

  /** The Grove is not on screen at all (a plate or black covers it): the stage may skip drawing it. */
  get groveHidden(): boolean {
    const P = this.plan;
    return P.beat === 'breath' || P.beat === 'summit' || (P.beat === 'wake' && P.bt < WAKE.black[1]);
  }

  /** The real character layer stays hidden for the whole prologue (her stand-in is drawn instead). */
  get heroHidden(): boolean {
    return true;
  }

  /** How much of the HUD shows: none until the very end. */
  get hudAlpha(): number {
    const P = this.plan;
    return P.beat === 'wake' ? window01(P.bt, WAKE.hud[0], WAKE.hud[1]) : 0;
  }

  camera(follow: CameraView, player: PlayerView): CameraView | null {
    return this.actors.camera(follow, player);
  }

  /** Before the character renderer. */
  update(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const P = this.plan;
    const t = P.bt;
    const inBreath = P.beat === 'breath';
    const summitT = P.beat === 'summit' ? t : P.beat === 'wake' ? SUMMIT.end + t : -1;
    const inSummit = summitT >= 0 && (P.beat === 'summit' || t < WAKE.black[1]);
    this.breath.sprite.visible = inBreath;
    this.summit.sprite.visible = inSummit;
    if (inBreath) this.breath.render(t, dt);
    if (inSummit) this.summit.render(summitT, dt);
    // The title over the mountain, on the summit's last frame.
    const tk =
      P.beat === 'wake'
        ? window01(t, WAKE.title[0], WAKE.title[1]) * (1 - window01(t, WAKE.titleOut[0], WAKE.titleOut[1]))
        : 0;
    this.title.visible = tk > 0.001;
    // Big enough to read on a phone, over the dance and the sky.
    this.title.alpha = 0.72 * tk;
    this.title.scale.set(1.9);
    this.title.position.set(640, 210);
    const ik = P.beat === 'wake' ? window01(t, WAKE.rise[1], WAKE.rise[1] + 1) : 0;
    this.item.visible = ik > 0.001;
    this.item.alpha = 0.7 * ik;
    this.actors.update(dt, clock, view, sim);
    // The black: out of it at the start of the hatching (the match cut) and of the next night; into it
    // at the end of the breath, the hollow (the hard cut to the summit is a short dip) and the title.
    let k = 0;
    if (P.beat === 'breath') k = t < 0.05 ? 1 : 0;
    else if (P.beat === 'hatch') k = 1 - window01(t, HATCH.fadeIn[0], HATCH.fadeIn[1]);
    else if (P.beat === 'hollow') k = window01(t, HOLLOW.hide[1] - 0.25, HOLLOW.hide[1]);
    else if (P.beat === 'summit') k = 1 - window01(t, 0, 0.3);
    else if (P.beat === 'wake')
      k = window01(t, WAKE.black[0], WAKE.black[0] + 0.6) * (1 - window01(t, WAKE.fadeUp[0], WAKE.fadeUp[1]));
    this.black.visible = k > 0.001;
    this.black.alpha = k;
    void BEATS;
  }

  destroy(): void {
    this.actors.destroy();
    this.breath.destroy();
    this.summit.destroy();
    this.layer.destroy({ children: true });
  }
}
