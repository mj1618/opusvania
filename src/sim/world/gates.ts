import { allDown } from '../ai/enemy';
import type { SimEvent } from '../events';
import type { GameState } from '../state';
import type { Tuning } from '../tuning';

/**
 * Plates, gates and room clear (L3 brief §4.1, step 8.5). A plate is pressed (and latches for the
 * visit) when a landed slab rests on its tiles with >= plate.minOverlapPx of horizontal overlap,
 * or when Kid stands on it in the heavy weight class. Any pressed plate opens every `plate` gate;
 * `clear` gates open when every enemy is KO'd or repossessed.
 */
export function updatePlatesAndGates(state: GameState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  const ts = t.world.tileSize;
  const p = state.player;
  let anyPressed = false;
  for (const pl of L.plates) {
    if (!pl.pressed) {
      let by: '' | 'slab' | 'heavy' = '';
      for (let i = 0; i < pl.tiles.length && !by; i += 2) {
        const x = (pl.tiles[i] as number) * ts;
        const y = (pl.tiles[i + 1] as number) * ts;
        for (const l of L.levied) {
          if (l.colour !== 'brown' || l.phase !== 'landed' || l.y + l.h !== y) continue;
          if (Math.min(l.x + l.w, x + ts) - Math.max(l.x, x) >= t.plate.minOverlapPx) {
            by = 'slab';
            break;
          }
        }
        if (!by && p.grounded && p.profile === 'heavy' && p.y + p.h === y && p.x < x + ts && x < p.x + p.w)
          by = 'heavy';
      }
      if (by) {
        pl.pressed = true;
        pl.by = by;
        const x0 = (pl.tiles[0] as number) * ts;
        const y0 = (pl.tiles[1] as number) * ts;
        events.push({ type: 'plate', char: pl.char, by, x: x0 + ts, y: y0 });
      }
    }
    if (pl.pressed) anyPressed = true;
  }
  const wasClear = L.clear;
  L.clear = allDown(L);
  if (L.clear && !wasClear) events.push({ type: 'roomClear', x: p.x + p.w / 2, y: p.y + p.h / 2 });
  for (const g of L.gates) {
    if (g.open) continue;
    if ((g.opensOn === 'plate' && anyPressed) || (g.opensOn === 'clear' && L.clear)) {
      g.open = true;
      events.push({
        type: 'gateOpen',
        char: g.char,
        x: (g.tiles[0] as number) * ts + ts / 2,
        y: (g.tiles[1] as number) * ts + ts / 2,
      });
    }
  }
}
