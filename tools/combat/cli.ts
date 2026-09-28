/**
 * Runs fairness-bot fights (tools/combat/fighter.ts) and optionally saves one as a golden tape.
 *
 *   npm run fight -- --room the-pit --fighter signature --seeds 1-10
 *   npm run fight -- --room auction --fighter signature --seed 1 --save tests/replays/auction.signature.s1.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { makeTape } from '../../src/debug/tape';
import { installBuildInfo } from '../lib/build-info';
import { FIGHTERS } from './fighter';
import { runFight } from './run';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    room: { type: 'string', default: 'the-pit' },
    fighter: { type: 'string', default: 'signature' },
    seed: { type: 'string' },
    seeds: { type: 'string', default: '1-5' },
    frames: { type: 'string', default: '7200' },
    save: { type: 'string' },
  },
});

const fighter = args.fighter as string;
if (!FIGHTERS[fighter])
  throw new Error(`Unknown fighter ${fighter}. Known: ${Object.keys(FIGHTERS).join(', ')}`);
const [a, b] = (args.seed ?? args.seeds ?? '1').split('-').map(Number);
const seeds: number[] = [];
for (let s = a ?? 1; s <= (b ?? a ?? 1); s++) seeds.push(s);
for (const seed of seeds) {
  const r = runFight({ room: args.room as string, fighter, seed, maxFrames: Number(args.frames) });
  console.log(
    `${fighter} ${args.room} seed ${seed}: clear ${r.clear ?? '-'} (engaged ${r.engaged ?? '-'}) countedOut ${r.countedOut} hurts ${r.hurts} chin -${r.chinLost} takes ${r.takes} catches ${r.catches} levies ${r.levies} swallows ${r.swallows} repossessions ${r.repossessions} KOs ${r.kos} counters ${r.counterHits}`,
  );
  if (args.save && seeds.length === 1) {
    // The tape plays the fight and then walks right to G (the room's gate is open once clear).
    const walk = Array.from({ length: 600 }, (_, i) => (i % 40 === 0 ? 0 : 2 | (i % 40 < 20 ? 16 : 0)));
    const tape = makeTape(
      `${args.room}.${fighter}.s${seed}`,
      { room: args.room as string, seed },
      [...r.inputs, ...walk],
      { target: 'G', maxDeaths: 0 },
      `fight:${fighter}`,
    );
    tape.notes = `Recorded run of the ${fighter} fighter (tools/combat/fighter.ts, ${FIGHTERS[fighter]?.delay}-step reaction) on seed ${seed}: roomClear at ${r.clear ?? '-'}, ${r.hurts} hurts, then a walk to G.`;
    const out = resolve(args.save);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(tape, null, 2)}\n`);
    console.log(`saved ${out}`);
  }
}
