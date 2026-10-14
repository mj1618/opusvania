/**
 * Umber for scale: the game's own skin (src/render/character/vesper), driven by a hand-made player
 * state instead of the sim. She stands on a fake floor, or glides with nothing under her. Her
 * lantern light comes back as a screen-space point (`light`) so the frame can light its planes.
 */
import { Container, type Renderer } from 'pixi.js';
import type { CharacterSkin } from '../../render/character/skin';
import { skin } from '../../render/character/vesper';
import type { PlayerView, RenderContext } from '../../render/contract';
import { LightRegistry } from '../../render/lights';
import { createPlayer } from '../../sim/player/player';
import type { Scene } from '../../sim/scene';
import type { PlayerState } from '../../sim/state';
import { tuning } from '../../sim/tuning';

/** World x she lives at: the Grove's centre zone, where her face is graded as in play. */
const WX = 2900;
const FLOOR = 1600;

export interface HeroSpec {
  /** Screen position of her feet (standing) or of her body (gliding). */
  x: number;
  y: number;
  /** Screen px per world px (1 = in-game size at zoom 1, about 84 px tall). */
  scale: number;
  pose: 'stand' | 'glide';
  facing: 1 | -1;
}

export class Hero {
  readonly view = new Container();
  private readonly skin: CharacterSkin;
  private readonly lights = new LightRegistry();
  private readonly state: PlayerState;
  private readonly feetY: number;
  /** Her lantern light in screen px (updated each frame). */
  readonly light = { x: 0, y: 0, k: 1 };

  constructor(
    renderer: Renderer,
    private readonly spec: HeroSpec,
  ) {
    const glide = spec.pose === 'glide';
    const scene: Scene = {
      id: 'world-concepts',
      width: 6000,
      height: 4000,
      spawn: { x: WX, y: FLOOR },
      solids: glide ? [] : [{ x: 0, y: FLOOR, w: 6000, h: 200, tag: 'ground' }],
      oneWays: [],
    };
    this.feetY = glide ? 900 : FLOOR;
    const p = createPlayer(WX, this.feetY, tuning, scene);
    p.facing = spec.facing;
    if (glide) {
      p.grounded = false;
      p.gliding = true;
      p.motion = 'glide';
      p.vx = 2.4 * spec.facing;
      p.vy = 1.1;
      p.contactFrames = 120;
    }
    this.state = p;
    const ctx: RenderContext = {
      renderer,
      scene,
      lights: this.lights,
      viewScale: () => 1,
    };
    const layer = new Container();
    layer.scale.set(spec.scale);
    layer.position.set(spec.x - WX * spec.scale, spec.y - this.feetY * spec.scale);
    this.view.addChild(layer);
    this.skin = skin.create(ctx, layer);
    // Let springs and chains settle into the pose before the first picture.
    for (let i = 0; i < 150; i++) this.step(i / 60, 1 / 60);
  }

  private step(clock: number, dt: number): void {
    const p = this.state;
    p.motionFrames++;
    p.modeFrames++;
    p.contactFrames++;
    const view = {
      ...p,
      cx: p.x + p.w / 2,
      feetY: p.y + p.h,
      cy: p.y + p.h / 2,
    } as PlayerView;
    this.skin.update(dt, clock, view, []);
  }

  update(t: number, dt: number): void {
    this.step(t + 2.5, dt);
    const l = this.lights.get('ember');
    if (l) {
      const s = this.spec.scale;
      this.light.x = this.spec.x + (l.x - WX) * s;
      this.light.y = this.spec.y + (l.y - this.feetY) * s;
      this.light.k = l.intensity;
    }
  }

  destroy(): void {
    this.skin.destroy();
    this.view.destroy({ children: true });
  }
}
