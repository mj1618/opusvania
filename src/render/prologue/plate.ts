/**
 * A plate: one of the prologue's shots that is not in the Grove (the breath, the world from high,
 * outside the Grove), built with the world kit (src/render/world: planes, shader bodies, the post)
 * at 1920x1080. It is drawn off screen, graded by the kit's own post, and the result shown as one
 * sprite over the game's layers: so the kit's screen-space maths (lights, vignette, grain) holds at
 * any window size and device pixel ratio.
 */
import { Container, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import { Composer } from '../world/compose';
import { VIEW_H, VIEW_W } from '../world/layer';
import { Post } from '../world/post';

export type PlateUpdate = (t: number, dt: number) => void;

export class Plate {
  readonly composer: Composer;
  readonly sprite: Sprite;
  private readonly post: Post;
  private readonly out: RenderTexture;
  private readonly tick: PlateUpdate;
  private readonly holder = new Container();

  constructor(
    private readonly renderer: Renderer,
    build: (c: Composer) => PlateUpdate,
  ) {
    this.composer = new Composer(renderer);
    this.tick = build(this.composer);
    this.post = new Post(renderer);
    this.post.set(this.composer.grade);
    this.out = RenderTexture.create({ width: VIEW_W, height: VIEW_H, resolution: 1, antialias: false });
    this.sprite = new Sprite(this.out);
    this.sprite.label = 'prologue-plate';
    this.holder.addChild(this.post.display);
  }

  /** Steps the plate to prologue time `t` and draws it into the sprite's texture. */
  render(t: number, dt: number): void {
    this.tick(t, dt);
    this.composer.update(t, dt);
    this.post.render(this.composer.root, t);
    this.renderer.render({ container: this.holder, target: this.out, clear: true, clearColor: [0, 0, 0, 1] });
  }

  destroy(): void {
    this.composer.destroy();
    this.sprite.destroy();
    this.out.destroy(true);
    this.post.rt.destroy(true);
    this.holder.destroy({ children: true });
  }
}
