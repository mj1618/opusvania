/**
 * Fling probe (canopy r9): from a lamp in reach, every aim, where the flight goes: the lamps it brings into reach on
 * the way, where she lands, and any thorn hit. For laying chain lamps on each other's lines.
 *
 *   npx tsx tools/levels/fling-probe.ts <room> <lamp-id> <x> <y> [--lit] [--hold=left|right|none]
 * (x, y) = a spot her feet are placed at (in the air near the lamp: she falls until it is in reach).
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const [room, lampId, xs, ys] = process.argv.slice(2);
const holdArg = process.argv.find((a) => a.startsWith('--hold='))?.slice(7) ?? 'aim';
const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const scene = getRoom(room as string);
const lamps = (scene as unknown as { lures?: Array<{ id: string; x: number; y: number }> }).lures ?? [];
for (const a of process.argv) {
  const m = /^--set=([\w-]+)=(-?\d+),(-?\d+)$/.exec(a);
  const l = m ? lamps.find((q) => q.id === m[1]) : undefined;
  if (m && l) {
    l.x = Number(m[2]);
    l.y = Number(m[3]);
  }
}
const idx = (id: string) => lamps.findIndex((l) => l.id === id);
const C = (process.argv.includes('--glide') ? ['wallJump', 'glide'] : ['wallJump']) as never;
const { left: L, right: R, up: U, down: D, lamp: B } = ActionBit;
const AIMS: Array<[string, number]> = [
  ['L', L],
  ['UL', U | L],
  ['U', U],
  ['UR', U | R],
  ['R', R],
  ['DR', D | R],
  ['D', D],
  ['DL', D | L],
];
for (const [name, aim] of AIMS) {
  const save = newSave(C);
  // (`--flag=<f>`: story flags saved first, e.g. the chase's hooks, `cn-gap-hook-1`, r13.)
  for (const a of process.argv) if (a.startsWith('--flag=')) save.flags.push(a.slice(7));
  const s = createState(1, t, scene, [], C, save);
  s.player.dj = 0;
  placePlayer(s, Number(xs), Number(ys), t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  const ev: SimEvent[] = [];
  const run = (m: number) => {
    const e: SimEvent[] = [];
    step(s, m, t, withShortcuts(scene, s.save), e, W);
    for (const q of e) ev.push(q);
  };
  let k = 0;
  while (flingTarget(s, scene, t) !== idx(lampId as string) && k++ < 200) run(0);
  if (flingTarget(s, scene, t) !== idx(lampId as string)) {
    console.log(name, 'never in reach');
    continue;
  }
  for (let i = 0; i < 4; i++) run(aim | B);
  run(aim);
  const hold = holdArg === 'none' ? 0 : holdArg === 'left' ? L : holdArg === 'right' ? R : aim & (L | R);
  const seen: string[] = [];
  let land = '';
  const path: string[] = [];
  for (k = 0; k < 240; k++) {
    run(hold);
    const i = flingTarget(s, scene, t);
    if (i >= 0 && lamps[i] && lamps[i].id !== lampId && !seen.includes(lamps[i].id)) {
      seen.push(lamps[i].id);
      path.push(`${lamps[i].id}@(${Math.round(s.player.x)},${Math.round(s.player.y + s.player.h)})`);
    }
    if (k % 10 === 0) path.push(`${Math.round(s.player.x)},${Math.round(s.player.y + s.player.h)}`);
    if (s.player.grounded && k > 2) {
      land = `lands (${Math.round(s.player.x)}, ${Math.round(s.player.y + s.player.h)}) f${k}`;
      break;
    }
  }
  const thorn = ev.find((e) => e.type === 'thornHit' || (e.type as string).includes('thorn'));
  console.log(name.padEnd(3), land || 'airborne', thorn ? `THORNS ${thorn.type}` : '', '|', path.join(' '));
}
