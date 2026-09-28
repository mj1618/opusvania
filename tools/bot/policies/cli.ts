/**
 * Runs a Pit fight policy (combat-spec §6.4; tools/bot/policies/fight.ts) and optionally saves the
 * run as a tape.
 *
 *   npm run policy -- --policy signature --seeds 1-20              # table of clear frames / deaths
 *   npm run policy -- --policy jabOnly --seed 1 --save tests/replays/the-pit.jabOnly.s1.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { makeTape } from '../../../src/debug/tape';
import { installBuildInfo } from '../../lib/build-info';
import { runPolicy } from './common';
import { POLICIES } from './fight';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    policy: { type: 'string', default: 'signature' },
    seed: { type: 'string' },
    seeds: { type: 'string', default: '1-20' },
    room: { type: 'string', default: 'the-pit' },
    save: { type: 'string' },
  },
});

const name = args.policy as string;
const policy = POLICIES[name];
if (!policy) throw new Error(`Unknown policy ${name}. Known: ${Object.keys(POLICIES).join(', ')}`);
const [a, b] = (args.seed ?? args.seeds ?? '1').split('-').map(Number);
const seeds: number[] = [];
for (let s = a ?? 1; s <= (b ?? a ?? 1); s++) seeds.push(s);
for (const seed of seeds) {
  const r = runPolicy(name, policy, { room: args.room, seed });
  console.log(
    `${name} seed ${seed}: clear ${r.clearFrame ?? '-'} goal ${r.goalFrame ?? '-'} deaths ${r.deaths} hurts ${r.hurts} (chin -${r.chinLost}) verbs ${JSON.stringify(r.verbs)}`,
  );
  if (args.save && seeds.length === 1) {
    const tape = makeTape(
      `${args.room}.${name}.s${seed}`,
      { room: args.room, seed },
      r.inputs,
      { target: 'G', maxDeaths: 0 },
      `policy:${name}`,
    );
    tape.notes = `Recorded run of the ${name} policy (tools/bot/policies/fight.ts, 12-step reaction delay) on seed ${seed}: roomClear at ${r.clearFrame ?? '-'}, G at ${r.goalFrame ?? '-'}, ${r.deaths} deaths, ${r.hurts} hurts.`;
    const out = resolve(args.save);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(tape, null, 2)}\n`);
    console.log(`saved ${out}`);
  }
}
