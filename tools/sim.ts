/**
 * Headless runner: loads a room, runs an input tape in Node (no browser), prints the trace and
 * final state. The base the bot, feel report and tapes are built on (src/debug/headless.ts).
 *
 *   npm run sim -- --room gym-01 --script "R30 R+J16 .40"               # summary + final player
 *   npm run sim -- --room gym-01 --script "R30 R+J16 .40" --trace        # + per-frame table
 *   npm run sim -- --room hub --spawn 5 --script "L90" --target spawn:4 --json
 *   npm run sim -- --tape tests/replays/gym-04.none.json --trace
 *
 * Options: --spawn, --seed (1), --preset, --tuning '<json partial>', --assists '<json>',
 * --abilities dash,doubleJump, --target <name|tile:x,y|rect:x,y,w,h> (stops when reached),
 * --from/--to (trace frame range), --json (full machine-readable result).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTrace, runScenario, type Scenario } from '../src/debug/headless';
import { ABILITIES, type AbilitySet } from '../src/debug/sim-adapter';
import { isTapeFile, tapeSetup } from '../src/debug/tape';
import { installBuildInfo } from './lib/build-info';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    room: { type: 'string' },
    spawn: { type: 'string' },
    seed: { type: 'string', default: '1' },
    preset: { type: 'string' },
    tuning: { type: 'string' },
    assists: { type: 'string' },
    abilities: { type: 'string' },
    script: { type: 'string', short: 's' },
    tape: { type: 'string' },
    target: { type: 'string' },
    trace: { type: 'boolean', default: false },
    from: { type: 'string' },
    to: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help || (!args.script && !args.tape)) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(args.help ? 0 : 1);
}

let sc: Scenario;
if (args.tape) {
  const t = JSON.parse(readFileSync(resolve(args.tape), 'utf8')) as unknown;
  if (!isTapeFile(t)) throw new Error(`${args.tape} is not a tape (kind: "tape")`);
  sc = { ...tapeSetup(t), inputs: t.inputs };
  if (t.expect.target) sc.stop = { target: t.expect.target };
} else {
  sc = { room: args.room, seed: Number(args.seed), inputs: args.script ?? '' };
  if (args.spawn) sc.spawn = args.spawn;
}
if (args.preset) sc.preset = args.preset;
if (args.tuning) sc.tuning = JSON.parse(args.tuning) as Record<string, unknown>;
if (args.assists) sc.assists = JSON.parse(args.assists) as Scenario['assists'];
if (args.abilities) {
  const a: AbilitySet = {};
  for (const n of ABILITIES) a[n] = args.abilities.split(',').includes(n);
  sc.abilities = a;
}
if (args.target) sc.stop = { target: args.target };
sc.trace = args.trace || args.json;

const t0 = performance.now();
const r = runScenario(sc);
const ms = performance.now() - t0;
if (args.json) {
  console.log(JSON.stringify({ ...r, ms }, null, 2));
} else {
  if (r.trace) {
    const from = Number(args.from ?? 0);
    const to = Number(args.to ?? Number.POSITIVE_INFINITY);
    console.log(formatTrace(r.trace.filter((t) => t.f >= from && t.f <= to)));
  }
  const p = r.final.player;
  console.log(
    `\n${r.steps} steps in ${ms.toFixed(1)} ms; room ${r.final.state.roomId}, frame ${r.final.state.frame}, hash ${r.final.hash}, tuning ${r.tuningHash}`,
  );
  console.log(
    `player x=${p.x} y=${p.y} vx=${p.vx.toFixed(2)} vy=${p.vy.toFixed(2)} grounded=${p.grounded} state=${p.state}`,
  );
  if (sc.stop?.target)
    console.log(r.reachedAt !== undefined ? `reached target on frame ${r.reachedAt}` : 'target NOT reached');
  console.log(
    `events: ${r.events.map((e) => `f${e.f}:${e.e.kind ? `${e.e.type}:${e.e.kind}` : e.e.type}`).join(' ')}`,
  );
}
