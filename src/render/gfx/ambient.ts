/**
 * Ambient particle model ("the music made visible", PLAN §5.1): dust motes, embers, soot. Pure TS
 * stepped once per sim frame (deterministic, unit-tested headless); particles.ts draws it.
 *
 * Particles live in a wrapping field one view (plus margin) in size, offset by the camera times
 * their depth, so density is constant anywhere in any room and nothing is ever spawned or culled.
 */
import { VIEW_H, VIEW_W } from '../camera/index';
import { RenderRng } from './color';

export type AmbientKind = 'mote' | 'ember' | 'soot';

export interface AmbientParticle {
  kind: AmbientKind;
  /** Position in the wrapping field. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Parallax depth: 1 = playfield. */
  depth: number;
  size: number;
  phase: number;
  /** Wobble amplitude (px/frame) and frequency (rad/frame). */
  wob: number;
  freq: number;
}

export interface AmbientConfig {
  motes: number;
  embers: number;
  soot: number;
  wind: number;
}

const FIELD_MARGIN = 64;
export const FIELD_W = VIEW_W + 2 * FIELD_MARGIN;
export const FIELD_H = VIEW_H + 2 * FIELD_MARGIN;

export class AmbientField {
  particles: AmbientParticle[] = [];
  private frame = 0;

  constructor(
    readonly config: AmbientConfig,
    seed: number,
    countScale = 1,
  ) {
    const rng = new RenderRng(seed ^ 0x68e31da4);
    const add = (kind: AmbientKind, n: number) => {
      for (let i = 0; i < Math.round(n * countScale); i++) this.particles.push(spawn(kind, rng, config.wind));
    };
    add('mote', config.motes);
    add('ember', config.embers);
    add('soot', config.soot);
  }

  get count(): number {
    return this.particles.length;
  }

  /** One sim frame. */
  step(): void {
    this.frame++;
    for (const q of this.particles) {
      const w = Math.sin(q.phase + this.frame * q.freq) * q.wob;
      q.x = wrap(q.x + q.vx + w, FIELD_W);
      q.y = wrap(q.y + q.vy + (q.kind === 'mote' ? w * 0.6 : 0), FIELD_H);
    }
  }

  /** Screen position of a particle for a camera top-left (camX, camY). */
  static screen(q: AmbientParticle, camX: number, camY: number): { x: number; y: number } {
    return {
      x: wrap(q.x - camX * q.depth, FIELD_W) - FIELD_MARGIN,
      y: wrap(q.y - camY * q.depth, FIELD_H) - FIELD_MARGIN,
    };
  }

  get time(): number {
    return this.frame;
  }
}

function spawn(kind: AmbientKind, rng: RenderRng, wind: number): AmbientParticle {
  const base = {
    kind,
    x: rng.range(0, FIELD_W),
    y: rng.range(0, FIELD_H),
    phase: rng.range(0, Math.PI * 2),
  };
  if (kind === 'mote')
    return {
      ...base,
      vx: wind * rng.range(0.3, 0.8),
      vy: rng.range(-0.08, 0.1),
      depth: rng.range(0.85, 1.25),
      size: rng.range(2.5, 5),
      wob: rng.range(0.15, 0.4),
      freq: rng.range(0.01, 0.03),
    };
  if (kind === 'ember')
    return {
      ...base,
      vx: wind * rng.range(0.8, 1.6),
      vy: -rng.range(0.5, 1.4),
      depth: rng.range(0.8, 1.3),
      size: rng.range(2.5, 4.5),
      wob: rng.range(0.3, 0.9),
      freq: rng.range(0.03, 0.08),
    };
  return {
    ...base,
    vx: wind * rng.range(1, 2.2),
    vy: rng.range(0.3, 0.9),
    depth: rng.range(0.9, 1.4),
    size: rng.range(3, 7),
    wob: rng.range(0.2, 0.6),
    freq: rng.range(0.02, 0.05),
  };
}

function wrap(v: number, m: number): number {
  return ((v % m) + m) % m;
}
