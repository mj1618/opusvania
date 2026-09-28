import type { SimEvent } from './events';
import type { GameState, RunState } from './state';
import type { Tuning } from './tuning';

/**
 * Run-level state (combat-spec §3.4-3.5): Poundage, the Corner, the Runner and its Lien, and
 * whether Beat the Count was used since the last Corner. It survives room loads; the room-local
 * state (`state.local`) does not.
 */
export function newRun(): RunState {
  return {
    poundage: 0,
    debt: 0,
    lien: 0,
    runner: null,
    corner: { roomId: 'hub', spawn: 'corner' },
    beatUsed: false,
    countedOut: 0,
    deaths: 0,
    fever: 0,
  };
}

/** Pays Poundage (a KO pays x1, a repossession x2). In `garnish` mode part of it clears the debt. */
export function pay(
  state: GameState,
  amount: number,
  t: Tuning,
  events: SimEvent[],
  at: { x: number; y: number },
): void {
  if (amount <= 0) return;
  const r = state.run;
  let got = amount;
  if (t.death.mode === 'garnish' && r.debt > 0) {
    const cut = Math.min(r.debt, Math.ceil(amount * t.death.garnishShare));
    r.debt -= cut;
    got -= cut;
  }
  r.poundage += got;
  events.push({ type: 'poundage', amount: got, ...at });
}

/**
 * Counted Out (combat-spec §3.5 step 4): the Runner takes the Poundage and puts a Lien on a Chin
 * pip ('runner'), or the Poundage becomes a debt ('garnish'). An uncaught Runner's haul is sold
 * at auction and gone.
 */
export function distrain(
  state: GameState,
  t: Tuning,
  events: SimEvent[],
  at: { x: number; y: number },
  feetY: number,
): void {
  const r = state.run;
  r.countedOut++;
  r.deaths++;
  if (t.death.mode === 'garnish') {
    r.debt += r.poundage;
    events.push({ type: 'distrained', poundage: r.poundage, lien: 0, ...at });
    r.poundage = 0;
    return;
  }
  if (r.runner) events.push({ type: 'auctioned', poundage: r.runner.poundage, ...at });
  r.lien = t.death.lienPips;
  r.runner = { roomId: state.roomId, poundage: r.poundage, lien: r.lien, x: at.x, feetY };
  events.push({ type: 'distrained', poundage: r.poundage, lien: r.lien, ...at });
  r.poundage = 0;
}

/** Max Chin under the current Lien. */
export function chinMax(state: GameState, t: Tuning): number {
  return Math.max(1, t.kid.chin - state.run.lien);
}
