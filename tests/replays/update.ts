/**
 * `npm run replays:update`: re-records the golden part of every tests/replays/*.json from its
 * tape under the current preset tuning (and trims the tape to the goal frame). Rooms whose tape
 * no longer reaches G are reported; re-search them with the bot (tools/bot, stream B) and paste
 * the new tape into `inputs`.
 *
 *   npm run replays:update            # all
 *   npm run replays:update -- gym-04  # one room
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatInputScript, parseInputScript } from '../../src/input/script';
import { presetTuning } from '../../src/sim/tuning';
import { type GoldenReplay, runGolden, tuningHash } from './golden';

const DIR = import.meta.dirname;
const only = process.argv[2];
let failed = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
  if (only && !f.startsWith(only)) continue;
  const path = join(DIR, f);
  const r = JSON.parse(readFileSync(path, 'utf8')) as GoldenReplay;
  const res = runGolden(r);
  if (!res.goalFrame || res.deaths > 0) {
    console.error(
      `${f}: tape no longer completes (goal ${res.goalFrame}, deaths ${res.deaths}). Re-search it.`,
    );
    failed++;
    continue;
  }
  const trimmed = formatInputScript(parseInputScript(r.inputs).slice(0, res.goalFrame));
  const again = runGolden({ ...r, inputs: trimmed });
  const out: GoldenReplay = {
    ...r,
    tuningHash: tuningHash(presetTuning(r.preset)),
    inputs: trimmed,
    expect: {
      maxFrames: r.expect?.maxFrames ?? Math.ceil(res.goalFrame * 1.5),
      goalFrame: again.goalFrame,
      deaths: 0,
      end: again.end,
      hashes: again.hashes,
    },
  };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${f}: goal at frame ${again.goalFrame}`);
}
if (failed) process.exit(1);
