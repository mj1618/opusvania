import type { Container } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { PlayerView, RenderContext } from '../contract';

/**
 * One playable look for the hero. Each skin lives in its own directory `character/<id>/` and
 * exports `skin: SkinDef` from its `index.ts`; the switcher (character/index.ts) finds it.
 */
export interface CharacterSkin {
  /** Once per render frame: interpolated player state and the sim events since the last update. */
  update(dt: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void;
  /** Remove everything this skin added to the layer and the light registry. */
  destroy(): void;
}

export interface SkinDef {
  readonly id: string;
  readonly name: string;
  /** `layer` is the character layer (world px, parallax 1). Add display objects to it; never move it. */
  create(ctx: RenderContext, layer: Container): CharacterSkin;
}
