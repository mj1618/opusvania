import type { SimEvent } from '../sim/events';
import type { SfxFile } from './data';
import type { PlayOpts } from './engine';

/**
 * Maps sim events to sounds (event names and fields: src/sim/events.ts, memory/sim-architecture.md).
 * Pure logic over a small output interface, so it is unit tested with a fake. Never mutates the
 * sim: it only reads events, plus the player's vy to set the wall-slide loop level while a
 * wallSlideStart..wallSlideEnd span is open. Every one-shot sound comes from a real sim event.
 */

export interface AudioOut {
  play(name: string, opts?: PlayOpts): boolean;
  loopGain(name: string, gain: number): void;
  setRoom(roomId: string): void;
}

/** The parts of GameState the router reads. */
export interface RouterState {
  frame: number;
  roomId: string;
  player: { x: number; y: number; w: number; h: number; vy: number };
}

export interface RoutedEvent {
  frame: number;
  type: string;
  sound: string | null;
  played: boolean;
}

export class EventRouter {
  /** Last few routed events, newest last (debug stats). */
  readonly log: RoutedEvent[] = [];
  private wallSliding = false;
  private frame = 0;

  constructor(
    private readonly out: AudioOut,
    private readonly sfx: SfxFile,
  ) {}

  handle(e: SimEvent, frame = this.frame): void {
    this.frame = frame;
    const ev = this.sfx.events;
    switch (e.type) {
      case 'roomEnter':
        this.out.setRoom(e.roomId);
        this.wallSliding = false;
        this.out.loopGain(ev.wallSlide.loop, 0);
        this.record(e.type, null, false);
        return;
      case 'jump':
        this.emit(e.type, ev.jump.byKind[e.kind] ?? ev.jump.default, e);
        return;
      case 'land': {
        const l = ev.land;
        const volume = Math.max(l.minVolume, Math.min(1, e.vy / l.refVyPxPerFrame));
        this.emit(e.type, e.hard ? l.hard : l.soft, { x: e.x, y: e.y, volume });
        return;
      }
      case 'wallSlideStart':
      case 'wallSlideEnd':
        this.wallSliding = e.type === 'wallSlideStart';
        if (!this.wallSliding) this.out.loopGain(ev.wallSlide.loop, 0);
        this.record(e.type, ev.wallSlide.loop, this.wallSliding);
        return;
      default: {
        const name = ev.simple[e.type];
        if (name && 'x' in e) this.emit(e.type, name, e);
        else if (name) this.emit(e.type, name, {});
      }
    }
  }

  /** Per render frame: the wall-slide loop follows slide speed while a slide is open. */
  update(s: RouterState): void {
    this.frame = s.frame;
    const w = this.sfx.events.wallSlide;
    const vy = s.player.vy;
    if (this.wallSliding && vy > 0) {
      this.out.loopGain(w.loop, Math.max(w.minGain, Math.min(1, vy / w.refSpeedPxPerFrame)));
    } else {
      this.out.loopGain(w.loop, 0);
    }
  }

  private emit(type: string, sound: string, opts: PlayOpts): void {
    const { x, y, volume } = opts;
    const o: PlayOpts = {};
    if (x !== undefined && y !== undefined) Object.assign(o, { x, y });
    if (volume !== undefined) o.volume = volume;
    this.record(type, sound, this.out.play(sound, o));
  }

  private record(type: string, sound: string | null, played: boolean): void {
    this.log.push({ frame: this.frame, type, sound, played });
    if (this.log.length > 16) this.log.shift();
  }
}
