/**
 * `npx tsx tools/levels/canopy-probe.ts <room> <x> <y> <macro> [kit]`: plays one explorer macro (chimneyMacros /
 * base / glideClimb) from a standing point in a Canopy room, creatures out, and prints every wall touch, kick,
 * thorn hit and where she ends. For laying thorns along a climb's real line.
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { baseMacros, chimneyMacros, cutMacros, glideClimbMacros } from '../solve/explore';

const [room, xs, ys, names, kitArg, verbose] = process.argv.slice(2);
const kit = (kitArg ?? 'wallJump').split(',').filter(Boolean);
const t = cloneTuning(defaultTuning);
const full = getRoom(room as string);
const scene = { ...full, enemies: [] } as typeof full;
(scene as { glades: unknown[] }).glades = [];
const W = getWorld('canopy');
const all = [
  ...baseMacros(),
  ...chimneyMacros([0, 1, 2, 3, 4, 6], ['', 'u', 'f']),
  ...glideClimbMacros(),
  ...cutMacros(),
];

for (const xv of (xs as string).split(','))
  for (const name of (names as string).split(',')) {
    const save = newSave(kit as never);
    const s = createState(1, t, scene, [], kit as never, save);
    placePlayer(s, Number(xv), Number(ys), t, withShortcuts(scene, s.save), []);
    s.player.dj = 0;
    const m = all.find((q) => q.name === name);
    if (!m) throw new Error(`no macro ${name}`);
    let prev = 0;
    let wall = 0;
    const log: string[] = [];
    let end = 'timeout';
    for (let k = 0; k < m.max + 120; k++) {
      const inp = k < m.max ? m.prog(s, k, prev) : 0;
      const ev: SimEvent[] = [];
      step(s, Math.max(0, inp), t, scene, ev, W);
      prev = Math.max(0, inp);
      const p = s.player;
      const fx = Math.round(p.x + p.w / 2);
      const fy = Math.round(p.y + p.h);
      if (p.wallDir !== wall) {
        if (p.wallDir) log.push(`${p.wallDir > 0 ? 'E' : 'W'}${fy}`);
        wall = p.wallDir;
      }
      for (const e of ev) {
        if (e.type === 'thornHit') log.push(`THORN(${fx},${fy})`);
        if (e.type === 'barkHit' || e.type === 'barkBreak') log.push(`${e.type}@${fy}`);
        if (e.type === 'headBump' && verbose) log.push(`bump${fy}`);
      }
      if (ev.some((e) => e.type === 'thornHit')) {
        end = 'thorns';
        break;
      }
      if (s.exit) {
        end = `exit ${s.exit.id}`;
        break;
      }
      if (inp < 0 && p.grounded && k > 30) {
        end = `stand (${fx}, ${fy})`;
        break;
      }
    }
    console.log(`${xv} ${name}: ${log.join(' ')} => ${end}`);
  }
