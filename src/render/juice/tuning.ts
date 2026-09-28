/**
 * Combat juice numbers (render + camera feel only; the sim's hitstop/knockback live in content and
 * src/sim/tuning.ts). One row per hit class, plus the finisher beats (Count repossession, boss
 * phase, room clear). Pure data: tests and tools import it. See memory/combat-juice.md.
 */
import type { HitClass } from '../../sim/events';

export interface ImpactSpec {
  /** Streak sparks thrown along the hit direction (count, speed, spread radians). */
  sparks: number;
  sparkSpeed: number;
  spread: number;
  /** A white-hot star flash at the contact point: points, radius px, frames (0 = none). */
  star: number;
  starR: number;
  starFrames: number;
  /** Shockwave rings: count, end radius px. */
  rings: number;
  ringR: number;
  /** Directional camera kick (px, along the hit) and trauma noise added (0..1). */
  kick: number;
  trauma: number;
  /** Render zoom punch (1 = none) and its frames. */
  zoom: number;
  /** Anime impact frame: frames of the inverted high-contrast screen (0 = none). */
  impactFrames: number;
  /** Chromatic aberration kick (0..1 of the post filter's max). */
  aberration: number;
  /** Radial speed lines around the contact (frames, 0 = none). */
  speedLines: number;
  /** A comic word stamped at the contact ('' = none). */
  word: string;
  /** Tint of sparks/star (hex); null = the hit's sound colour, else hot white-gold. */
  color: number | null;
}

const spec = (o: Partial<ImpactSpec>): ImpactSpec => ({
  sparks: 6,
  sparkSpeed: 14,
  spread: 0.9,
  star: 0,
  starR: 0,
  starFrames: 0,
  rings: 0,
  ringR: 60,
  kick: 6,
  trauma: 0.1,
  zoom: 1,
  impactFrames: 0,
  aberration: 0,
  speedLines: 0,
  word: '',
  color: null,
  ...o,
});

/** Per hit class (combat-spec §2 table, pushed further: the L4 critique said feel needs more). */
export const IMPACT: Record<HitClass, ImpactSpec> = {
  light: spec({ sparks: 7, sparkSpeed: 15, star: 4, starR: 26, starFrames: 4, rings: 1, ringR: 46, kick: 7 }),
  medium: spec({
    sparks: 11,
    sparkSpeed: 19,
    star: 6,
    starR: 38,
    starFrames: 5,
    rings: 1,
    ringR: 80,
    kick: 12,
    trauma: 0.22,
    zoom: 1.025,
    aberration: 0.25,
  }),
  heavy: spec({
    sparks: 18,
    sparkSpeed: 24,
    spread: 1.4,
    star: 8,
    starR: 60,
    starFrames: 6,
    rings: 2,
    ringR: 150,
    kick: 20,
    trauma: 0.42,
    zoom: 1.06,
    impactFrames: 2,
    aberration: 0.7,
    speedLines: 8,
    word: 'WHAM!',
  }),
  counter: spec({
    sparks: 16,
    sparkSpeed: 26,
    spread: 1.1,
    star: 10,
    starR: 70,
    starFrames: 7,
    rings: 2,
    ringR: 170,
    kick: 22,
    trauma: 0.48,
    zoom: 1.07,
    impactFrames: 2,
    aberration: 0.8,
    speedLines: 10,
    word: 'COUNTER!',
    color: 0xffe066,
  }),
  catch: spec({
    sparks: 12,
    sparkSpeed: 16,
    spread: Math.PI * 2,
    star: 8,
    starR: 54,
    starFrames: 6,
    rings: 2,
    ringR: 120,
    kick: 10,
    trauma: 0.32,
    zoom: 1.05,
    impactFrames: 1,
    aberration: 0.5,
    speedLines: 8,
    word: 'CAUGHT!',
    color: 0xffd84a,
  }),
  seizeTake: spec({
    sparks: 6,
    sparkSpeed: 10,
    spread: 1.6,
    star: 0,
    rings: 1,
    ringR: 70,
    kick: 6,
    trauma: 0.14,
    zoom: 1.02,
  }),
  repossess: spec({
    sparks: 20,
    sparkSpeed: 22,
    spread: Math.PI * 2,
    star: 12,
    starR: 90,
    starFrames: 8,
    rings: 3,
    ringR: 220,
    kick: 0,
    trauma: 0.5,
    zoom: 1.1,
    impactFrames: 2,
    aberration: 0.9,
    speedLines: 14,
    word: '',
    color: 0xff3b3b,
  }),
  hurt: spec({
    sparks: 8,
    sparkSpeed: 14,
    star: 5,
    starR: 34,
    starFrames: 4,
    rings: 1,
    ringR: 70,
    kick: 14,
    trauma: 0.5,
    aberration: 0.8,
    color: 0xff5a6e,
  }),
};

export const JUICE = {
  /**
   * Combat framing: the render zooms in this far while an engaged enemy is within combatRange px
   * of Kid (the Pit framed the whole room: 48 px dogs on a 1920 px screen). Focus = Kid pulled
   * toward the enemies' centroid; Kid is always kept inside the frame (world.ts).
   */
  combatZoom: 1.3,
  combatRange: 900,
  combatFocusPull: 0.35,
  combatFocusLerp: 0.08,
  /** Max zoom change per step going in / out. */
  combatZoomIn: 0.006,
  combatZoomOut: 0.004,
  /** Screen margin (px) Kid is kept inside while zoomed. */
  combatMargin: 160,
  /** Camera kick spring (per step): velocity damping and pull back to 0. */
  kickDamp: 0.62,
  kickPull: 0.35,
  /** Trauma noise (squared, like the camera's): max px, decay per step. */
  shakePx: 26,
  traumaDecay: 0.045,
  /** Zoom punch: rises in 2 steps, then eases back over this many steps. */
  zoomBack: 14,
  /** Words: life (steps), rise px/step, size px. */
  wordLife: 30,
  wordSize: 34,
  /** Sparks: life range (steps) and drag. */
  sparkLife: [10, 18] as const,
  sparkDrag: 0.84,
  sparkGravity: 0.5,
  /** Rings: life (steps). */
  ringLife: 16,
  /** Speed lines: count and inner radius (px) around the contact point. */
  speedLineCount: 26,
  speedLineInner: 180,
  /** Slow motion (render time dilation; the sim is unchanged). */
  slowmo: {
    /** Count repossession: after the hitstop, `frames` steps whose time scale eases from `scale` to 1. */
    repossess: { frames: 40, scale: 0.25, zoom: 1.14 },
    /** The last enemy of a room goes down. */
    clear: { frames: 36, scale: 0.3, zoom: 1.1 },
    /** Boss phase change: long, dramatic. */
    bossPhase: { frames: 70, scale: 0.2, zoom: 1.16 },
    /** A Catch: a short beat. */
    catch: { frames: 14, scale: 0.45, zoom: 1.05 },
  },
  /** Telegraph glint: frames and size of the star over the attacker's eye. */
  glintFrames: 12,
  glintSize: 34,
  /** Knockdown: dizzy stars circling the head (count, radius px). */
  dizzyStars: 3,
  dizzyR: 26,
  /** Deflate (repossession): steps to go flat, final scale. */
  deflateFrames: 34,
  deflateSy: 0.32,
  /** Words the Auctioneer's patter throws out (idle chatter; sound made visible). */
  patter: [
    'DO I HEAR TEN',
    'TWENTY',
    'THIRTY',
    'LOVELY LOT',
    'FORTY?',
    'FIFTY!',
    'WHO WILL GIVE',
    'BID NOW',
    'NO RESERVE',
    'HUNDRED!',
  ],
  patterEvery: 26,
  patterLife: 70,
} as const;
