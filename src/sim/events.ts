/**
 * Typed sim events. The sim pushes events into the per-step array; the runtime dispatches them
 * on an EventBus that render/audio subscribe to. Consumers must never mutate the sim.
 */
export type SimEvent =
  | { type: 'roomEnter'; roomId: string; x: number; y: number }
  | { type: 'jump'; x: number; y: number; coyote: boolean }
  | { type: 'land'; x: number; y: number; speed: number; variant: number };

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

  emit(e: E): void {
    const set = this.handlers.get(e.type);
    if (!set) return;
    for (const fn of set) (fn as Handler<E>)(e);
  }

  emitAll(events: readonly E[]): void {
    for (const e of events) this.emit(e);
  }
}
