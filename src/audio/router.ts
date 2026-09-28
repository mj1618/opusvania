import { enemyDef } from '../sim/ai/schema';
import type { SimEvent } from '../sim/events';
import type { SfxFile } from './data';
import type { PlayOpts } from './engine';

/**
 * Maps sim events to sounds (event names and fields: src/sim/events.ts, memory/sim-architecture.md).
 * Pure logic over a small output interface, so it is unit tested with a fake. Never mutates the
 * sim: it only reads events, plus the player's vy to set the wall-slide loop level while a
 * wallSlideStart..wallSlideEnd span is open. Every one-shot sound comes from a real sim event.
 */

export interface Point {
  x: number;
  y: number;
}

/** Hum voices for the sim's sounds (L3): one per sound id, keyed `s<id>`. */
export interface HumOut {
  /** Replaces every hum with these (a room was entered). */
  reset(hums: { id: string; colour: string; pos: Point }[]): void;
  seize(id: string, holder: Point): void;
  fly(id: string, from: Point, towards: Point): void;
  /** The sound is somewhere again (landed, pushed home, snatched, absorbed, revoiced). */
  land(id: string, at: Point, thud: boolean): void;
  setPosition(id: string, at: Point): void;
}

export interface AudioOut {
  play(name: string, opts?: PlayOpts): boolean;
  loopGain(name: string, gain: number): void;
  setRoom(roomId: string): void;
  hums?: HumOut;
}

/** The parts of the sim's room-local state the router reads (hums follow the sounds). */
export interface RouterLocal {
  sources: { id: number; x: number; y: number; w: number; h: number }[];
  sounds: { id: number; colour: string; owner: number; status: string; at: number }[];
  levied: { id: number; soundId: number; x: number; y: number; w: number; h: number }[];
  /** Enemy types, to find a telegraph's wind-up (`cue.audio` in content/enemies). */
  enemies?: { id: number; type: string }[];
}

/** The parts of GameState the router reads. */
export interface RouterState {
  frame: number;
  roomId: string;
  player: { x: number; y: number; w: number; h: number; vy: number };
  local?: RouterLocal;
}

export const humId = (soundId: number): string => `s${soundId}`;

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
  private roomId: string | null = null;

  constructor(
    private readonly out: AudioOut,
    private readonly sfx: SfxFile,
  ) {}

  handle(e: SimEvent, frame = this.frame, s?: RouterState): void {
    this.frame = frame;
    const ev = this.sfx.events;
    const hums = this.out.hums;
    switch (e.type) {
      case 'roomEnter':
        this.roomId = e.roomId;
        this.out.setRoom(e.roomId);
        this.wallSliding = false;
        this.out.loopGain(ev.wallSlide.loop, 0);
        this.resetHums(s);
        this.record(e.type, null, false);
        return;
      // --- L3 hums: they only follow the sim (read-only). ---
      case 'seizeTake': {
        const p = s?.player;
        hums?.seize(humId(e.soundId), p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: e.x, y: e.y });
        this.record(e.type, 'seize', !!hums);
        // The rip (the sound torn out of its owner), then the pop as the ribbon lands in the sack.
        const rip = this.sfx.events.seizeRip;
        if (rip) {
          this.emit(e.type, rip.rip, { x: e.x, y: e.y });
          const at = p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: e.x, y: e.y };
          this.emit(e.type, rip.pop, { ...at, delay: rip.popDelay });
        }
        return;
      }
      case 'poundage': {
        // A shower of rising coin ticks as the coins fly to the counter, then the till.
        const c = this.sfx.events.coinShower;
        if (!c || e.amount <= 0) {
          this.emit(e.type, ev.simple.poundage ?? 'coin', e);
          return;
        }
        for (let i = 0; i < c.ticks; i++)
          this.emit(e.type, c.tick, {
            delay: c.delay + i * c.gap,
            pitch: 2 ** ((i * c.stepSemis) / 12),
            volume: 0.8,
          });
        this.emit(e.type, c.till, { delay: c.delay + c.ticks * c.gap });
        return;
      }
      case 'seizeRefused':
        this.emit(e.type, 'seizeRefused', e);
        return;
      case 'levyThrow': {
        const p = s?.player;
        const from = p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: e.x, y: e.y };
        hums?.fly(humId(e.soundId), from, { x: e.x, y: e.y });
        this.record(e.type, 'whoosh', !!hums);
        return;
      }
      case 'levyLand':
        hums?.land(humId(e.soundId), { x: e.x, y: e.y }, true);
        this.record(e.type, `levyLand${e.colour[0]?.toUpperCase()}${e.colour.slice(1)}`, !!hums);
        return;
      case 'bagPush':
      case 'snatch':
      case 'absorb':
      case 'revoice': {
        const home = this.ownerPos(s, e.soundId) ?? { x: e.x, y: e.y };
        hums?.land(humId(e.soundId), home, false);
        this.record(e.type, 'rehum', !!hums);
        return;
      }
      case 'jump':
        this.emit(e.type, ev.jump.byKind[e.kind] ?? ev.jump.default, e);
        return;
      // --- L4 combat: sounds chosen by a field of the event. ---
      case 'hit':
        this.emit(e.type, ev.hit.byClass[e.cls] ?? ev.hit.default, e);
        return;
      case 'whiff':
        this.emit(e.type, ev.whiff.byMove[e.move] ?? ev.whiff.default, e);
        return;
      case 'telegraph': {
        const cue = e.cue || this.cueOf(s, e.enemy, e.attackId);
        this.emit(e.type, (cue && ev.telegraph.byCue[cue]) || ev.telegraph.default, e);
        return;
      }
      case 'lotMarked':
        this.emit(e.type, ev.lotMarked.byBeat[String(e.beat)] ?? ev.lotMarked.default, e);
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

  /** The wind-up name (`cue.audio`) of an enemy's attack, or null if it can't be found. */
  private cueOf(s: RouterState | undefined, enemy: number, attackId: string): string | null {
    const type = s?.local?.enemies?.find((x) => x.id === enemy)?.type;
    if (!type) return null;
    try {
      return enemyDef(type).attacks[attackId]?.cue.audio ?? null;
    } catch {
      return null;
    }
  }

  /** Rebuilds the hums from the current state (audio unlocked mid-room). */
  rehum(s: RouterState): void {
    this.resetHums(s);
  }

  private resetHums(s?: RouterState): void {
    const hums = this.out.hums;
    const L = s?.local;
    if (!hums || !L) return;
    const list: { id: string; colour: string; pos: Point }[] = [];
    for (const snd of L.sounds) {
      if (snd.status !== 'home') continue;
      const pos = this.ownerPos(s, snd.id);
      if (pos) list.push({ id: humId(snd.id), colour: snd.colour, pos });
    }
    hums.reset(list);
  }

  /** Centre of the source that owns a sound. */
  private ownerPos(s: RouterState | undefined, soundId: number): Point | null {
    const L = s?.local;
    const snd = L?.sounds.find((x) => x.id === soundId);
    const src = snd ? L?.sources.find((x) => x.id === snd.owner) : undefined;
    return src ? { x: src.x + src.w / 2, y: src.y + src.h / 2 } : null;
  }

  /**
   * Per render frame: the wall-slide loop follows slide speed while a slide is open. Also follows
   * room changes that bypass events (restore(), replay/tape playback replace the whole state).
   */
  update(s: RouterState): void {
    this.frame = s.frame;
    if (s.roomId !== this.roomId) {
      this.roomId = s.roomId;
      this.wallSliding = false;
      this.out.setRoom(s.roomId);
      this.resetHums(s);
    }
    // Thrown sounds hum where their levied object is; enemy voices follow their owner.
    const L = s.local;
    const hums = this.out.hums;
    if (L && hums) {
      for (const l of L.levied) hums.setPosition(humId(l.soundId), { x: l.x + l.w / 2, y: l.y + l.h / 2 });
      for (const snd of L.sounds) {
        if (snd.status !== 'home') continue;
        const pos = this.ownerPos(s, snd.id);
        if (pos) hums.setPosition(humId(snd.id), pos);
      }
    }
    const w = this.sfx.events.wallSlide;
    const vy = s.player.vy;
    if (this.wallSliding && vy > 0) {
      this.out.loopGain(w.loop, Math.max(w.minGain, Math.min(1, vy / w.refSpeedPxPerFrame)));
    } else {
      this.out.loopGain(w.loop, 0);
    }
  }

  private emit(type: string, sound: string, opts: PlayOpts): void {
    const { x, y, volume, delay, pitch } = opts;
    const o: PlayOpts = {};
    if (x !== undefined && y !== undefined) Object.assign(o, { x, y });
    if (volume !== undefined) o.volume = volume;
    if (delay !== undefined) o.delay = delay;
    if (pitch !== undefined) o.pitch = pitch;
    this.record(type, sound, this.out.play(sound, o));
  }

  private record(type: string, sound: string | null, played: boolean): void {
    this.log.push({ frame: this.frame, type, sound, played });
    if (this.log.length > 16) this.log.shift();
  }
}
