/**
 * The fade of a room exit and the dip of a caught fall (memory/rooms.md), render-side: the sim
 * holds her for the hold's frames (`roomExit.frames`, `fallCatch.frames`) and then restarts the room
 * (`roomEnter`) or puts her back (`fallReturn`); this is the picture over those beats. A flat black
 * sprite over the post-processed picture, under the HUD. Knobs: `cameraTuning.room`.
 *
 * A room with `camera.fadeIn` (src/scene/room.ts) also comes up from black over that many seconds at
 * boot and at every restart (`fadeIn()`, called by stage.ts), and after a room exit.
 */
import { Sprite, Texture } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { SAFE_VIEW, type ViewSize } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';

function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export class RoomFade {
  readonly layer: Sprite;
  /** 0..1 now. */
  k = 0;
  private from = 0;
  private to = 0;
  private t = 0;
  private dur = 0;
  /** A fade up from black asked for since the last update (seconds), applied after the frame's events. */
  private queued: number | null = null;

  /** `roomFadeIn`: the room's fade up from black, s (0 = none: a room exit lifts over `exitLift`). */
  constructor(private roomFadeIn = 0) {
    this.layer = new Sprite(Texture.WHITE);
    this.layer.label = 'room-fade';
    this.layer.tint = 0x000000;
    this.layer.eventMode = 'none';
    this.layer.visible = false;
  }

  /** The room changed (memory/world.md): its own fade up from black, s. */
  setRoomFadeIn(seconds: number): void {
    this.roomFadeIn = seconds;
  }

  /**
   * Seconds of plain black before the room's fade up (the Canopy r12 opening, `marks.stage.open.black`: the wings are
   * heard before anything is seen). Only the boot / restart fade holds it.
   */
  setBlack(seconds: number): void {
    this.black = seconds;
  }
  private black = 0;
  private holdT = 0;

  /** From black, up over `seconds` (boot, a restart). Wins over the frame's placement events. */
  fadeIn(seconds = this.roomFadeIn): void {
    if (seconds > 0) this.queued = seconds;
  }

  private go(to: number, seconds: number): void {
    this.from = this.k;
    this.to = to;
    this.t = 0;
    this.dur = Math.max(0.001, seconds);
  }

  /** Reads this frame's sim events and advances by `dt` seconds of render time. */
  update(
    dt: number,
    events: readonly SimEvent[],
    v: ViewSize = SAFE_VIEW,
    ct: CameraTuning = cameraTuning,
  ): void {
    const R = ct.room;
    for (const e of events) {
      if (e.type === 'roomExit') this.go(1, e.frames / 60 - R.exitEarly);
      else if (e.type === 'roomEnter' && e.from !== 'load') {
        this.k = 1;
        // From another room's exit or door (`room#exit`), a re-form, a goto: a short lift. A restart: the room's own fade.
        const across = e.from.includes('#') || e.from === 'goto' || e.from === 'continue';
        this.go(
          0,
          across
            ? R.enterLift
            : e.from === 'reform'
              ? R.exitLift
              : this.roomFadeIn > 0
                ? this.roomFadeIn
                : R.exitLift,
        );
      } else if (e.type === 'fallCatch') this.go(R.catchDepth, e.frames / 60);
      // Thorns (memory/level-kit.md): the same dip over their hold, lifted by the `fallReturn` that ends it.
      else if (e.type === 'thornHit' && e.frames > 0) this.go(R.catchDepth, e.frames / 60);
      else if (e.type === 'fallReturn') this.go(0, R.catchLift);
      // A placement by hand (teleport, load) shows the picture plainly at once.
      else if (e.type === 'spawn' && !events.some((o) => o.type === 'roomEnter' || o.type === 'fallReturn')) {
        this.k = this.to = this.from = 0;
        this.dur = 0;
      }
    }
    if (this.queued !== null) {
      this.k = 1;
      this.go(0, this.queued);
      this.queued = null;
      this.holdT = this.black;
    }
    if (this.holdT > 0) {
      this.holdT -= dt;
      this.k = 1;
    } else if (this.dur > 0 && dt > 0) {
      this.t += dt;
      this.k = this.from + (this.to - this.from) * ease(this.t / this.dur);
      if (this.t >= this.dur) this.dur = 0;
    }
    this.layer.visible = this.k > 0.002;
    this.layer.alpha = Math.min(1, this.k);
    // Over the whole visible view, 2 px to spare at every edge.
    this.layer.position.set(v.left - 2, v.top - 2);
    this.layer.setSize(v.w + 4, v.h + 4);
  }
}
