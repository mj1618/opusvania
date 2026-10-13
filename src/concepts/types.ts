import type { Container } from 'pixi.js';

/** The poses the gallery shows. `run` should loop (use t), `jump` is a held mid-air fall/rise pose. */
export type ConceptPose = 'idle' | 'run' | 'jump';

export interface ConceptInstance {
  /**
   * Draw in local units = world px. Origin (0, 0) is the feet on the ground line, +y is down, the
   * character faces +x (right). The body should be about 84 units tall to the top of the head
   * (crests, antlers, cloth and props may extend beyond). Key light comes from the upper right.
   */
  readonly view: Container;
  /** Called every frame. `t` is seconds since load. Animate lightly: breathing, cloth, glow. */
  update(t: number, dt: number): void;
}

export interface Concept {
  /** Short id, also the file name. */
  readonly id: string;
  readonly name: string;
  /** One or two sentences: who this is and what makes the silhouette. */
  readonly blurb: string;
  create(pose: ConceptPose): ConceptInstance;
}
