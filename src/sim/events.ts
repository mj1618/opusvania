/**
 * Typed sim events. The sim pushes events into the per-step array; the runtime dispatches them
 * on an EventBus that render/audio subscribe to. Consumers must never mutate the sim.
 *
 * Positions (x, y) are the player's feet centre in world px unless stated. `dir` is -1 / 1.
 * The full list with meanings is in memory/sim-architecture.md.
 */
export type JumpKind = 'ground' | 'coyote' | 'buffered' | 'wall' | 'double' | 'dashJump';
export type CornerKind = 'head' | 'ledge' | 'dash';

export type SimEvent =
  | { type: 'roomEnter'; roomId: string; x: number; y: number }
  | { type: 'roomExit'; roomId: string; to: string; x: number; y: number }
  | { type: 'jump'; kind: JumpKind; x: number; y: number; dir: number }
  | { type: 'land'; x: number; y: number; vy: number; fallPx: number; hard: boolean }
  | { type: 'step'; x: number; y: number }
  | { type: 'skid'; x: number; y: number; dir: number }
  | { type: 'wallSlideStart'; x: number; y: number; dir: number }
  | { type: 'wallSlideEnd'; x: number; y: number; dir: number }
  | { type: 'dashStart'; x: number; y: number; dir: number; air: boolean }
  | { type: 'dashEnd'; x: number; y: number; dir: number }
  | { type: 'headBump'; x: number; y: number }
  | { type: 'cornerCorrect'; kind: CornerKind; x: number; y: number; dx: number; dy: number }
  | { type: 'dropThrough'; x: number; y: number }
  | { type: 'pogo'; x: number; y: number; target: 'orb' | 'spike' }
  | { type: 'death'; x: number; y: number }
  | { type: 'respawn'; x: number; y: number }
  | { type: 'checkpoint'; x: number; y: number }
  | { type: 'goal'; kind: 'main' | 'optional'; roomId: string; x: number; y: number }
  | { type: 'profileChange'; from: string; to: string };

export type SimEventType = SimEvent['type'];
export type SimEventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;

type Handler<E> = (e: E) => void;

export class EventBus<E extends { type: string } = SimEvent> {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<T extends E['type']>(type: T, fn: Handler<Extract<E, { type: T }>>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  /** Subscribes to every event (debug logs, audio routers). */
  onAny(fn: Handler<E>): () => void {
    return this.on('*' as E['type'], fn as never);
  }

  emit(e: E): void {
    const set = this.handlers.get(e.type);
    if (set) for (const fn of set) (fn as Handler<E>)(e);
    const any = this.handlers.get('*');
    if (any) for (const fn of any) (fn as Handler<E>)(e);
  }

  emitAll(events: readonly E[]): void {
    for (const e of events) this.emit(e);
  }
}
