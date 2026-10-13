/**
 * The slash's look, behind one small interface so the owner can switch styles live (key Y,
 * `?slash=1|2|3`, `window.__vesper.slash`). Every style is fed the same things: the cut that began
 * (its stroke, step, direction), the blade's real path (`StrokeAt`, from `rig.strokeAt`), how far
 * the cut has got each frame, the sim's hitstop, and where a blow landed. What a style draws is its
 * own business; the blade in her hand, the smear frames and the body's snap are shared (rig / draw).
 */
import type { Painter } from '../paint';

export type SlashDir = 'fwd' | 'up' | 'down';

/** The blade point's unit offset from her chest at fraction `q` (0..1) of the current cut. */
export type StrokeAt = (q: number, out: { x: number; y: number }) => void;

/** A cut begins. */
export interface CutInfo {
  dir: SlashDir;
  /** Combo step 1-3 (a down slash is always 1). */
  step: number;
  /** The finisher: bigger, heavier, longer. */
  heavy: boolean;
  /** The side the slash goes to (-1 / 1). */
  facing: number;
  /** The sim's hit reach for this step, px from her chest: the mark's outer edge. */
  reach: number;
  /** Fraction of the cut before which the blade is behind or beside her (nothing is drawn there). */
  show: number;
}

/** What a style gets every frame. Positions are world px; times are render seconds. */
export interface SlashFrame {
  dt: number;
  clock: number;
  /** The sim's hitstop holds this frame: the cut hangs in the air with her. */
  held: boolean;
  chestX: number;
  chestY: number;
  /** How far the cut has got, 0..1; -1 when no cut is running. */
  cutQ: number;
  /** Tone scale for the zone she is in (see `View.pale`). */
  pale: number;
  /** Her velocity, px/s. */
  vx: number;
  vy: number;
  /** The ten wing strand tips (x, y pairs: wing A's five, then wing B's), and which wing is the near one. */
  hem: Float32Array;
  near: number;
}

/** How a style draws the smear frame: the blade as a wedge, a thin streak of light, or a hair-line. */
export type SmearKind = 'wedge' | 'streak' | 'hair';

export interface SlashStyle {
  readonly id: SlashStyleId;
  readonly smear: SmearKind;
  /** 0..1: the wings' eye-spots flash this much (only scale-dust uses it). */
  readonly spot: number;
  /** Anything still on screen. */
  readonly live: boolean;
  clear(): void;
  begin(cut: CutInfo, at: StrokeAt): void;
  /** Once per frame, before `draw`: lays the new part of the cut and ages what is there. */
  frame(f: SlashFrame): void;
  /** A blow landed at (x, y); (dx, dy) = the way the blade's point is travelling. `power` 1 or 2. */
  hit(x: number, y: number, dx: number, dy: number, power: number): void;
  draw(p: Painter, f: SlashFrame): void;
}

export const SLASH_STYLES = ['brush', 'ribbon', 'scale-dust'] as const;
export type SlashStyleId = (typeof SLASH_STYLES)[number];
