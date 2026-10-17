/**
 * Screen shake: one trauma value (0..1), render-side (memory/feel.md). Sim events add to it by a
 * budget (`cameraTuning.shake.budget`); it drains over time; the view is offset by `max` x trauma^`power`
 * of smooth value noise. Like the kick it is added to the view at draw time: the follow camera never
 * sees it, so the camera stays as deterministic as the sim. The noise runs on the shake's own render
 * clock (no wall clock, no Math.random), so a capture shakes the same every time.
 *
 * `FEEL.shake` is the accessibility toggle: off, nothing shakes and the kick stays home too. It is
 * read from `?shake=off` (or `?noshake`), then the remembered choice, and set by `setShake`
 * (`__game.debug.shake(on)`).
 */
import type { SimEvent } from '../../sim/events';
import { type CameraTuning, cameraTuning } from './tuning';

const KEY = 'lampfall.shake';

function initialShake(): boolean {
  if (typeof window === 'undefined') return true;
  const q = new URLSearchParams(window.location.search);
  if (q.has('noshake')) return false;
  const v = q.get('shake');
  if (v !== null) return !(v === 'off' || v === '0' || v === 'false');
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Live feel settings (accessibility). */
export const FEEL = { shake: initialShake() };

/** Turns screen shake (and the kick) on or off, and remembers the choice. */
export function setShake(on: boolean): boolean {
  FEEL.shake = on;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // storage unavailable: the choice lasts this session
    }
  }
  return on;
}

/** A hash of an integer lattice point to [-1, 1]. */
function lattice(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1] (smoothstep between lattice values). */
export function valueNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = lattice(i, seed);
  const b = lattice(i + 1, seed);
  return a + (b - a) * f * f * (3 - 2 * f);
}

/** How much trauma a frame's events add (before the cap). Exported for tests and the memory table. */
export function traumaFor(events: readonly SimEvent[], ct: CameraTuning = cameraTuning): number {
  const B = ct.shake.budget;
  let add = 0;
  for (const e of events) {
    switch (e.type) {
      case 'hurt':
        add += e.hp <= 0 ? B.fade : B.hurt;
        break;
      case 'lureSnuff':
        add += B.snuff;
        break;
      case 'enemyDie':
        add += B.kill;
        break;
      case 'enemyCrack':
        add += B.crack;
        break;
      case 'enemyRecover':
        if (e.cause === 'wall') add += B.wallRam;
        break;
      case 'barkBreak':
        add += B.barkBreak;
        break;
      case 'land':
        if (e.hard) add += B.hardLand;
        break;
      case 'impact':
        if (e.power >= 2) add += B.finisher;
        break;
      case 'enemyBlock':
        // A down cut that glances is a bounce, not a clang.
        if (e.slash !== 'down') add += B.clang;
        break;
      case 'kitClang':
        add += B.clang;
        break;
      case 'capBounce':
        add += B.capBounce;
        break;
      case 'slashTerrain':
        add += B.terrain;
        break;
    }
  }
  return add;
}

export class CameraShake {
  /** 0..1. */
  trauma = 0;
  /** Offset to add to the view centre, world px. */
  x = 0;
  y = 0;
  /** The shake's own clock (s): the noise runs on it. */
  private t = 0;

  reset(): void {
    this.trauma = this.x = this.y = 0;
  }

  /** Adds trauma directly (capped at 1). */
  add(k: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, k));
  }

  /** Feed the frame's sim events, then advance `dt` seconds of render time. */
  update(dt: number, events: readonly SimEvent[], ct: CameraTuning = cameraTuning): void {
    const S = ct.shake;
    // A placement (teleport, re-form, room entry) starts clean; the frame's own blows still count.
    if (events.some((e) => e.type === 'spawn')) this.reset();
    this.add(traumaFor(events, ct));
    this.t += Math.max(0, dt);
    if (!FEEL.shake) {
      this.x = this.y = 0;
      this.trauma = Math.max(0, this.trauma - S.decay * dt);
      return;
    }
    const s = S.max * this.trauma ** S.power;
    const u = this.t * S.freq;
    this.x = s * valueNoise(u, 1);
    this.y = s * valueNoise(u + 17.3, 2);
    this.trauma = Math.max(0, this.trauma - S.decay * dt);
  }
}
