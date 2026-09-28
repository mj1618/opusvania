/**
 * Typed sim events. The sim pushes events into the per-step array; the runtime dispatches them
 * on an EventBus that render/audio subscribe to. Consumers must never mutate the sim.
 *
 * Positions (x, y) are the player's feet centre in world px unless stated. `dir` is -1 / 1.
 * The full list with meanings is in memory/sim-architecture.md.
 */
export type Colour = 'brown' | 'pink' | 'violet' | 'white';
export type MoveDir = 'fwd' | 'up' | 'down';
export type HitClass =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'seizeTake'
  | 'catch'
  | 'counter'
  | 'repossess'
  | 'hurt';

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
  | { type: 'profileChange'; from: string; to: string }
  // --- L3 signature mechanic and combat foundations (combat-spec §2, L3 brief §2.4). Positions
  // are world px (the target's centre unless stated). `soundId`/`source`/`enemy` are local ids.
  | { type: 'moveStart'; move: string; dir: MoveDir; x: number; y: number }
  | { type: 'whiff'; move: string; reason?: 'down'; target?: number; x: number; y: number }
  | {
      type: 'hit';
      cls: HitClass;
      move: string;
      target: number;
      dmg: number;
      x: number;
      y: number;
      dir: number;
    }
  | { type: 'hitstop'; frames: number; cls: HitClass }
  | {
      type: 'seizeTake';
      soundId: number;
      colour: Colour;
      kind: 'voice' | 'deed';
      owner: number;
      x: number;
      y: number;
    }
  | { type: 'seizeGuarded'; target: number; x: number; y: number }
  | { type: 'seizeRefused'; target: number; x: number; y: number }
  | { type: 'catch'; enemy: number; attackId: string; x: number; y: number }
  | { type: 'ghost'; source: number; on: boolean; x: number; y: number }
  | { type: 'levyThrow'; soundId: number; colour: Colour; dir: MoveDir; levied: number; x: number; y: number }
  | { type: 'levyLand'; soundId: number; colour: Colour; levied: number; x: number; y: number }
  | { type: 'levyDry'; x: number; y: number }
  | { type: 'recoilHop'; colour: Colour; x: number; y: number }
  | { type: 'springBounce'; levied: number; target: number; x: number; y: number }
  | { type: 'bagPush'; soundId: number; colour: Colour; owner: number; x: number; y: number }
  | { type: 'snatch'; soundId: number; enemy: number; x: number; y: number }
  | { type: 'absorb'; soundId: number; enemy: number; x: number; y: number }
  | { type: 'revoice'; soundId: number; enemy: number; x: number; y: number }
  | { type: 'retrieve'; soundId: number; enemy: number; x: number; y: number }
  | { type: 'hurt'; dmg: number; src: number; attack: string; x: number; y: number }
  | {
      type: 'telegraph';
      enemy: number;
      attackId: string;
      colour: Colour;
      frames: number;
      /** The attack's wind-up sound (`cue.audio` in content/enemies). */
      cue: string;
      x: number;
      y: number;
    }
  | { type: 'attackActive'; enemy: number; attackId: string; x: number; y: number }
  | { type: 'down'; enemy: number; x: number; y: number }
  | { type: 'countTick'; enemy: number; beat: number; x: number; y: number }
  | { type: 'repossess'; enemy: number; x: number; y: number }
  | { type: 'rise'; enemy: number; x: number; y: number }
  | { type: 'ko'; enemy: number; x: number; y: number }
  | { type: 'plate'; char: string; by: 'slab' | 'heavy'; x: number; y: number }
  | { type: 'gateOpen'; char: string; x: number; y: number }
  | { type: 'roomClear'; x: number; y: number }
  // --- L4 combat greybox (combat-spec §2 event names). Positions: Kid's centre for Kid events,
  // the enemy's centre for enemy events, unless stated.
  | { type: 'flinch'; enemy: number; x: number; y: number }
  | { type: 'slipStart'; x: number; y: number }
  | { type: 'slipClean'; enemy: number; x: number; y: number }
  | { type: 'counterOpen'; x: number; y: number }
  | { type: 'counterHit'; enemy: number; move: string; x: number; y: number }
  | { type: 'ringStart'; x: number; y: number }
  | { type: 'ringRecover'; x: number; y: number }
  | { type: 'ringLost'; x: number; y: number }
  | { type: 'hazard'; dmg: number; x: number; y: number }
  | { type: 'swallowStart'; colour: Colour; soundId: number; x: number; y: number }
  | { type: 'swallowCommit'; colour: Colour; soundId: number; heal: number; x: number; y: number }
  | { type: 'swallowSpill'; colour: Colour; soundId: number; x: number; y: number }
  | { type: 'swallowRefused'; x: number; y: number }
  | { type: 'bagLeak'; soundId: number; colour: Colour; x: number; y: number }
  | { type: 'hoarse'; enemy: number; x: number; y: number }
  | { type: 'shot'; enemy: number; attackId: string; kind: string; colour: Colour; x: number; y: number }
  | { type: 'shotLand'; kind: string; colour: Colour; x: number; y: number }
  | { type: 'hop'; enemy: number; x: number; y: number }
  | { type: 'runnerSlip'; enemy: number; x: number; y: number }
  | { type: 'kidDown'; x: number; y: number }
  | { type: 'beatCountTick'; beat: number; canRise: boolean; x: number; y: number }
  | { type: 'beatCountRise'; paid: number; x: number; y: number }
  | { type: 'countedOut'; x: number; y: number }
  | { type: 'corner'; x: number; y: number }
  | { type: 'distrained'; poundage: number; lien: number; x: number; y: number }
  | { type: 'redistrained'; poundage: number; x: number; y: number }
  | { type: 'auctioned'; poundage: number; x: number; y: number }
  | { type: 'poundage'; amount: number; x: number; y: number }
  | { type: 'lotMarked'; enemy: number; lot: number; beat: number; x: number; y: number }
  | { type: 'sold'; enemy: number; lot: number; x: number; y: number }
  | { type: 'soldBag'; enemy: number; soundId: number; x: number; y: number }
  | { type: 'outbid'; enemy: number; lot: number; x: number; y: number }
  | { type: 'bossPhase'; enemy: number; phase: number; x: number; y: number }
  | { type: 'fever'; level: number; x: number; y: number };

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
