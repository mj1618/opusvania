import type { SfxFile } from './data';
import type { PlayOpts } from './engine';

/**
 * Maps sim events and state to sounds. Pure logic over a small output interface, so it is unit
 * tested with a fake. Never mutates the sim: it only reads events and a state snapshot.
 *
 * Events are handled loosely (`{type, ...}`) so it already understands the Phase 1 contract in
 * docs/design/movement-spec.md §5 (jump.kind, land.vy/fallPx, step, wallSlideStart/End, dashStart,
 * headBump, pogo, death, respawn) as well as the Phase 0 events (jump.coyote, land.speed).
 * Until the sim emits `step` / `wallSlide*`, footsteps and wall-slide are derived from state.
 */

export interface AudioOut {
  play(name: string, opts?: PlayOpts): boolean;
  loopGain(name: string, gain: number): void;
  setRoom(roomId: string): void;
}

export interface LooseEvent {
  type: string;
  [k: string]: unknown;
}

/** The parts of GameState the router reads. Extra/unknown player fields are read loosely. */
export interface RouterState {
  frame: number;
  roomId: string;
  player: { x: number; y: number; w: number; h: number; grounded: boolean };
}

export interface RoutedEvent {
  frame: number;
  type: string;
  sound: string | null;
  played: boolean;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export class EventRouter {
  /** Last few routed events, newest last (debug stats). */
  readonly log: RoutedEvent[] = [];
  private sawStep = false;
  private sawWallSlide = false;
  private wallSliding = false;
  private last: { frame: number; roomId: string; x: number; y: number } | null = null;
  private stride = 0;
  /** Highest point (min y) since leaving the ground, for Phase 0 land events without fallPx. */
  private apexY: number | null = null;
  private frame = 0;

  constructor(
    private readonly out: AudioOut,
    private readonly sfx: SfxFile,
  ) {}

  handle(e: LooseEvent, frame = this.frame): void {
    this.frame = frame;
    const ev = this.sfx.events;
    const pos = this.pos(e);
    switch (e.type) {
      case 'roomEnter':
        if (typeof e.roomId === 'string') this.out.setRoom(e.roomId);
        this.last = null;
        this.record(e.type, null, false);
        return;
      case 'jump': {
        const kind = typeof e.kind === 'string' ? e.kind : e.coyote === true ? 'coyote' : 'ground';
        this.emit(e.type, ev.jump.byKind[kind] ?? ev.jump.default, pos);
        return;
      }
      case 'land': {
        const l = ev.land;
        // Phase 0 reports px/s as `speed`; the Phase 1 spec reports `vy` in px/frame.
        const speed = num(e.speed) ?? (num(e.vy) ?? 0) * 60;
        const derivedFall = this.apexY !== null && this.last ? this.last.y - this.apexY : undefined;
        const fallPx = num(e.fallPx) ?? derivedFall;
        // Hard landing = a long fall (spec: fallPx >= 5 tiles); speed is only a fallback when the
        // fall height is unknown, because Phase 0 jumps all land near max fall speed.
        const hard = fallPx !== undefined ? fallPx >= l.hardFallPx : speed >= l.hardSpeedPxPerSec;
        const volume = Math.max(l.minVolume, Math.min(1, speed / l.refSpeedPxPerSec));
        this.emit(e.type, hard ? l.hard : l.soft, { ...pos, volume });
        this.stride = 0;
        return;
      }
      case 'step':
        this.sawStep = true;
        this.emit(e.type, ev.footstep.sound, pos);
        return;
      case 'wallSlideStart':
      case 'wallSlideEnd':
        this.sawWallSlide = true;
        this.wallSliding = e.type === 'wallSlideStart';
        if (!this.wallSliding) this.out.loopGain(ev.wallSlide.loop, 0);
        this.record(e.type, ev.wallSlide.loop, this.wallSliding);
        return;
      default: {
        const name = ev.simple[e.type];
        if (name) this.emit(e.type, name, pos);
      }
    }
  }

  /** Per render frame: derived footsteps and the wall-slide loop level. */
  update(s: RouterState): void {
    this.frame = s.frame;
    const p = s.player;
    const prev = this.last;
    this.last = { frame: s.frame, roomId: s.roomId, x: p.x, y: p.y };
    this.apexY = p.grounded ? null : Math.min(this.apexY ?? p.y, p.y);
    if (!prev || prev.roomId !== s.roomId || s.frame <= prev.frame) return;
    const frames = s.frame - prev.frame;
    const dx = Math.abs(p.x - prev.x);
    const dy = p.y - prev.y;
    const ev = this.sfx.events;

    if (!this.sawStep) {
      if (p.grounded && dx / frames >= ev.footstep.minSpeedPxPerFrame) {
        this.stride += dx;
        if (this.stride >= ev.footstep.stridePx) {
          this.stride %= ev.footstep.stridePx;
          this.emit('step*', ev.footstep.sound, { x: p.x + p.w / 2, y: p.y + p.h });
        }
      } else if (!p.grounded) {
        // First step after landing comes half a stride in (the land sound covers the contact).
        this.stride = ev.footstep.stridePx / 2;
      }
    }

    const sliding = this.sawWallSlide ? this.wallSliding : derivedWallSlide(p);
    if (sliding && dy > 0) {
      const g = Math.max(ev.wallSlide.minGain, Math.min(1, dy / frames / ev.wallSlide.refSpeedPxPerFrame));
      this.out.loopGain(ev.wallSlide.loop, g);
    } else {
      this.out.loopGain(ev.wallSlide.loop, 0);
    }
  }

  private pos(e: LooseEvent): PlayOpts {
    const x = num(e.x);
    const y = num(e.y);
    return x !== undefined && y !== undefined ? { x, y } : {};
  }

  private emit(type: string, sound: string, opts: PlayOpts): void {
    this.record(type, sound, this.out.play(sound, opts));
  }

  private record(type: string, sound: string | null, played: boolean): void {
    this.log.push({ frame: this.frame, type, sound, played });
    if (this.log.length > 16) this.log.shift();
  }
}

/** Wall-slide from state, for sims that don't emit wallSlide events (state string or flag). */
function derivedWallSlide(player: RouterState['player']): boolean {
  const p = player as unknown as Record<string, unknown>;
  if (p.wallSliding === true) return true;
  return typeof p.state === 'string' && /wall.?slide/i.test(p.state);
}
