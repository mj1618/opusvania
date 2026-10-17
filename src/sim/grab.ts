/**
 * Grabs are Caught (docs/design/creatures.md §1.5, memory/creatures.md): a web's strand (and later a
 * toad's tongue, a mantis's forelegs) holds her in the lure's Caught state. One mechanic, one input:
 * presses of jump or the blade beat free, the last throws her toward the held direction, a dash (owned)
 * or a blow frees her at once. The hold itself does no harm: what costs health is the creature that
 * comes for her while she is held (the weaver's bite).
 *
 * Unlike a lure she does not circle: she stays where she was caught (`grabX`, `grabY`). Beating free
 * shares the lure's counters and spacing (`lureFrames`, `lureBeats`, `lureCd`, `lurePend`; `lures.beatCd`,
 * `beatQueue`) and the number of beats is `grab.beats`. Player-side handling: src/sim/player/player.ts
 * (`caught`). Pure: + - * / sqrt.
 */
import type { SimEvent } from './events';
import type { GameState, PlayerState } from './state';
import type { Tuning } from './tuning';

/** How she got out of a grab: beating free, a dash, a blow, or the thing holding her let go (it went slack, died). */
export type GrabFreeHow = 'beat' | 'dash' | 'hurt' | 'gone';

/** May something grab her now? Whole, in ordinary flight or on foot, not held by anything, not in a grab's grace. */
export function grabbable(p: PlayerState): boolean {
  return (
    p.grab < 0 &&
    p.lure < 0 &&
    p.grabGrace === 0 &&
    p.mode === 'normal' &&
    p.hp > 0 &&
    p.faded === 0 &&
    p.stagger === 0
  );
}

/** Creature `i` holds her where she is: Caught (`grab`). Her glide ends, her speed is gone. */
export function grabPlayer(state: GameState, i: number, events: SimEvent[]): void {
  const p = state.player;
  const e = state.enemies[i];
  if (!e) return;
  const x = p.x + p.rx + p.w / 2;
  const y = p.y + p.ry + p.h / 2;
  p.grab = i;
  p.grabX = x;
  p.grabY = y;
  p.lureFrames = 0;
  p.lureBeats = 0;
  p.lureCd = 0;
  p.lurePend = 0;
  p.lureOut = 0;
  p.pullX = 0;
  p.kickX = 0;
  p.lungeX = 0;
  p.vx = 0;
  p.vy = 0;
  if (p.gliding) {
    p.gliding = false;
    events.push({ type: 'glideEnd', x, y: p.y + p.h, reason: 'lure' });
  }
  events.push({ type: 'grab', id: e.id, kind: e.kind, x, y });
}

/**
 * She is out of the grab. `beat`: thrown toward the held direction (`aimX`, `aimY`; straight up if
 * none) at `grab.freeSpeed`, the sideways part as `pullX` (her steering never eats it), plus
 * `freeLift` up; double jump and air dash back. Otherwise no throw. Either way nothing grabs her for
 * `grab.graceFrames`.
 */
export function freeGrab(
  state: GameState,
  t: Tuning,
  how: GrabFreeHow,
  events: SimEvent[],
  aimX = 0,
  aimY = 0,
): void {
  const p = state.player;
  const e = state.enemies[p.grab];
  p.grab = -1;
  p.lureBeats = 0;
  p.lureOut = 0;
  p.lureCd = 0;
  p.lurePend = 0;
  const G = t.grab;
  let vx = 0;
  let vy = 0;
  if (how === 'beat') {
    let ox = aimX;
    let oy = aimY;
    const m = Math.sqrt(ox * ox + oy * oy);
    if (m > 0) {
      ox /= m;
      oy /= m;
    } else {
      ox = 0;
      oy = -1;
    }
    vx = ox * G.freeSpeed;
    vy = oy * G.freeSpeed - G.freeLift;
    p.vx = 0;
    p.pullX = vx;
    p.vy = vy;
  }
  p.grabGrace = Math.max(0, Math.round(G.graceFrames));
  events.push({
    type: 'grabFree',
    id: e?.id ?? '',
    kind: e?.kind ?? 'web',
    x: p.x + p.w / 2,
    y: p.y + p.h / 2,
    how,
    vx,
    vy,
    grace: p.grabGrace,
  });
}

/** One beat: a press while grabbed. Returns true when it was the last one (she is free and thrown). */
export function beatGrab(state: GameState, t: Tuning, events: SimEvent[], aimX = 0, aimY = 0): boolean {
  const p = state.player;
  const e = state.enemies[p.grab];
  const of = Math.max(1, Math.round(t.grab.beats));
  p.lureBeats++;
  p.lureCd = Math.max(0, Math.round(t.lures.beatCd));
  events.push({
    type: 'grabBeat',
    id: e?.id ?? '',
    x: p.x + p.w / 2,
    y: p.y + p.h / 2,
    beats: p.lureBeats,
    of,
  });
  if (p.lureBeats < of) return false;
  freeGrab(state, t, 'beat', events, aimX, aimY);
  return true;
}

/** Per-step bookkeeping that runs whatever she does (also in hitstop): the grace counts down. */
export function tickGrab(p: PlayerState): void {
  if (p.grabGrace > 0) p.grabGrace--;
}
