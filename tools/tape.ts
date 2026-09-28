/**
 * Golden replay tapes (tests/replays/*.json). `npm run check` runs them via
 * tests/replays/replays.test.ts; this CLI records, checks and refreshes them.
 *
 *   npm run tape -- check                          # all tests/replays/*.json (tapes and raw replays)
 *   npm run tape -- check tests/replays/x.json
 *   npm run tape -- record --room hall --script "R136 R+J16 R108" --target a --name hall-a
 *   npm run tape -- from-replay dump.json --name bug-12 [--target G]   # a __game.replay.stop() dump
 *   npm run tape -- update [files]                 # re-record goldens (after an intended sim/tuning change)
 *   npm run tape -- update --resolve [files]       # also re-solve with the bot when the inputs no longer reach the target
 *
 * From the browser: __game.tape.record(); ...play...; copy(JSON.stringify(__game.tape.stop({name, expect})))
 * or with playwright-cli: eval "JSON.stringify(window.__game.tape.stop({name:'x'}))" > file.
 * From the bot: npm run bot -- --room R --target T --save tests/replays/R-T.json
 * See memory/replays-and-tapes.md.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { explainMismatch } from '../src/debug/build-info';
import { checkTape, isTapeFile, makeTape, type TapeFile, withGolden } from '../src/debug/tape';
import { type Replay, runReplay } from '../src/sim/replay';
import { search } from './bot/search';
import { installBuildInfo } from './lib/build-info';

installBuildInfo();

const ROOT = resolve(import.meta.dirname, '..');
const REPLAY_DIR = join(ROOT, 'tests/replays');

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    room: { type: 'string' },
    spawn: { type: 'string' },
    seed: { type: 'string', default: '1' },
    preset: { type: 'string' },
    script: { type: 'string' },
    target: { type: 'string' },
    'max-frames': { type: 'string' },
    name: { type: 'string' },
    out: { type: 'string' },
    resolve: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

const [cmd, ...files] = positionals;

function usage(code: number): never {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(code);
}

function listTapes(given: string[]): string[] {
  if (given.length > 0) return given.map((f) => resolve(f));
  return readdirSync(REPLAY_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(REPLAY_DIR, f));
}

function write(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

function check(): void {
  let bad = 0;
  for (const f of listTapes(files)) {
    const data = JSON.parse(readFileSync(f, 'utf8')) as unknown;
    if (isTapeFile(data)) {
      const c = checkTape(data);
      if (!c.ok) bad++;
      console.log(
        `${c.ok ? 'PASS' : 'FAIL'} ${basename(f)}: ${c.run.steps} steps, reached ${c.run.reachedAt ?? '-'}, deaths ${c.run.deaths}, golden ${c.golden}`,
      );
      for (const m of [...c.failures, ...c.notes]) console.log(`     ${m}`);
    } else {
      const r = data as Replay & { meta?: Parameters<typeof explainMismatch>[0] };
      const res = runReplay(r);
      const ok = res.matches !== false;
      if (!ok) bad++;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${basename(f)} (raw replay): hash ${res.hash} matches=${res.matches}`,
      );
      if (!ok) console.log(`     ${explainMismatch(r.meta)}`);
    }
  }
  if (bad > 0) process.exitCode = 1;
}

function update(): void {
  for (const f of listTapes(files)) {
    const data = JSON.parse(readFileSync(f, 'utf8')) as unknown;
    if (!isTapeFile(data)) {
      console.log(
        `skip ${basename(f)}: raw replays carry their own start state/tuning; re-record them in the browser`,
      );
      continue;
    }
    let tape: TapeFile = data;
    const c = checkTape({ ...tape, golden: undefined });
    if (!c.ok) {
      if (!args.resolve || !tape.expect.target || !tape.room) {
        console.log(
          `FAIL ${basename(f)}: behaviour broken (${c.failures.join('; ')}); not updated. Use --resolve to re-solve with the bot.`,
        );
        process.exitCode = 1;
        continue;
      }
      const r = search({
        room: tape.room,
        target: tape.expect.target,
        seed: tape.seed ?? 1,
        ...(tape.spawn ? { spawn: tape.spawn } : {}),
        ...(tape.preset ? { preset: tape.preset } : {}),
        ...(tape.abilities ? { abilities: tape.abilities } : {}),
      });
      if (!r.found || !r.tape) {
        console.log(
          `FAIL ${basename(f)}: bot could not re-solve (${r.exhausted ? 'unreachable' : 'budget'})`,
        );
        process.exitCode = 1;
        continue;
      }
      tape = {
        ...tape,
        inputs: r.tape,
        source: 'bot',
        expect: { ...tape.expect, maxFrames: Math.ceil((r.frames ?? 0) * 1.5) },
      };
      console.log(`re-solved ${basename(f)} with the bot: ${r.frames} frames`);
    }
    write(f, withGolden(tape));
  }
}

function record(): void {
  if (!args.room || !args.script) usage(1);
  const name = args.name ?? `${args.room}-${args.target ?? 'run'}`;
  const setup = {
    room: args.room,
    seed: Number(args.seed),
    ...(args.spawn ? { spawn: args.spawn } : {}),
    ...(args.preset ? { preset: args.preset } : {}),
  };
  const expect: TapeFile['expect'] = { maxDeaths: 0 };
  if (args.target) expect.target = args.target;
  if (args['max-frames']) expect.maxFrames = Number(args['max-frames']);
  const tape = makeTape(name, setup, args.script, expect, 'hand');
  const c = checkTape(tape);
  if (!c.ok) {
    console.log(`not saved: ${c.failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  write(resolve(args.out ?? join(REPLAY_DIR, `${name}.json`)), tape);
}

function fromReplay(): void {
  const src = files[0];
  if (!src) usage(1);
  const r = JSON.parse(readFileSync(resolve(src), 'utf8')) as Replay;
  if ((r.ops ?? []).length > 0) {
    console.log(
      'replay has out-of-band ops (load/seed/tuning/state); save it as a raw replay in tests/replays instead',
    );
    process.exitCode = 1;
    return;
  }
  const name = args.name ?? basename(src, '.json');
  const expect: TapeFile['expect'] = { maxDeaths: 0 };
  if (args.target) expect.target = args.target;
  const tape = makeTape(
    name,
    { start: r.start, seed: r.start.seed, tuning: r.tuning },
    r.inputs,
    expect,
    'browser',
  );
  write(resolve(args.out ?? join(REPLAY_DIR, `${name}.json`)), tape);
}

if (args.help || !cmd) usage(args.help ? 0 : 1);
if (cmd === 'check') check();
else if (cmd === 'update') update();
else if (cmd === 'record') record();
else if (cmd === 'from-replay') fromReplay();
else usage(1);
