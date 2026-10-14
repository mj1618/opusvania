import type { Composer } from './lib/compose';

/** One mood frame: built into a Composer (planes, lights, hero, grade), then updated each frame. */
export interface WorldFrame {
  readonly key: number;
  readonly id: string;
  readonly title: string;
  /** One line: what this frame is testing about the new world look. */
  readonly tests: string;
  build(c: Composer): void;
}
