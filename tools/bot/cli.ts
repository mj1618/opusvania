/**
 * Search bot CLI. Finds an input tape that takes the player from a spawn to a target, or reports
 * "not found within budget" / "unreachable (search space exhausted)".
 *
 *   npm run bot -- --room gym --target b                      # spawn:b in the Phase 0 gym
 *   npm run bot -- --room gym-10 --target G --abilities dash   # spec rooms
 *   npm run bot -- --room gym-04 --target G --save tests/replays/gym-04.none.json
 *   npm run bot -- --all                                       # every room's claims (bot:all)
 *
 * Options: --spawn, --seed (1), --preset, --abilities a,b (default: the room's),
 * --assists-off coyote,variableJump, --budget (300000
 * child nodes), --k (4 frames per macro), --weight (1.5; 1 = shortest path, slower),
 * --max-frames (3600), --json (machine output). See memory/bot.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ABILITIES,
  type Ability,
  type AbilitySet,
  type AssistSet,
  roomAbilities,
  roomClaims,
  roomIds,
  roomTargets,
} from '../../src/debug/sim-adapter';
import { makeTape } from '../../src/debug/tape';
import { installBuildInfo } from '../lib/build-info';
import { type SearchOptions, type SearchResult, search } from './search';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    room: { type: 'string' },
    target: { type: 'string' },
    spawn: { type: 'string' },
    seed: { type: 'string', default: '1' },
    preset: { type: 'string' },
    abilities: { type: 'string' },
    'assists-off': { type: 'string' },
    budget: { type: 'string' },
    k: { type: 'string' },
    weight: { type: 'string' },
    'max-frames': { type: 'string' },
    save: { type: 'string' },
    all: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help || (!args.all && (!args.room || !args.target))) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(args.help ? 0 : 1);
}

function parseAbilities(s: string | undefined, fallback: AbilitySet): AbilitySet {
  if (s === undefined) return fallback;
  const out: AbilitySet = {};
  for (const a of ABILITIES) out[a] = false;
  for (const name of s.split(',').filter(Boolean)) {
    if (name === 'all') for (const a of ABILITIES) out[a] = true;
    else if (name === 'none') continue;
    else if ((ABILITIES as readonly string[]).includes(name)) out[name as Ability] = true;
    else throw new Error(`Unknown ability "${name}". Known: ${ABILITIES.join(', ')}, all, none`);
  }
  return out;
}

function baseOpts(room: string, target: string, abilities: AbilitySet): SearchOptions {
  const o: SearchOptions = { room, target, abilities, seed: Number(args.seed) };
  if (args.spawn) o.spawn = args.spawn;
  if (args.preset) o.preset = args.preset;
  if (args['assists-off'])
    o.assists = Object.fromEntries(args['assists-off'].split(',').map((a) => [a, false])) as AssistSet;
  if (args.budget) o.budget = Number(args.budget);
  if (args.k) o.macroFrames = Number(args.k);
  if (args.weight) o.weight = Number(args.weight);
  if (args['max-frames']) o.maxFrames = Number(args['max-frames']);
  return o;
}

function summary(r: SearchResult): string {
  const abil =
    Object.entries(r.abilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',') || 'none';
  const perf = `${r.ms} ms, ${r.generated} nodes (${r.expanded} expanded, ${r.uniqueStates} unique), ${r.simFrames} sim frames, ${Math.round(r.simFrames / Math.max(1, r.ms))}k frames/s`;
  if (r.found)
    return `FOUND ${r.room} -> target in ${r.frames} frames (${((r.frames ?? 0) / 60).toFixed(2)} s) with [${abil}], verified=${r.verified}. ${perf}\n  tape: ${r.tape}`;
  const why = r.exhausted ? 'UNREACHABLE (search space exhausted)' : 'NOT FOUND within budget';
  return `${why} ${r.room} with [${abil}]; closest ${Math.round(r.closest.distance)} px at (${r.closest.x},${r.closest.y}) frame ${r.closest.frame}. ${perf}`;
}

function runOne(): void {
  const room = args.room as string;
  const abilities = parseAbilities(args.abilities, roomAbilities(room));
  const opts = baseOpts(room, args.target as string, abilities);
  const r = search(opts);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else console.log(summary(r));
  if (args.save && r.found && r.tape) {
    const setup = { room, seed: opts.seed ?? 1, abilities, ...(opts.spawn ? { spawn: opts.spawn } : {}) };
    const tape = makeTape(
      `${room}-${args.target}`,
      { ...setup, ...(opts.preset ? { preset: opts.preset } : {}) },
      r.tape,
      { target: args.target, maxFrames: Math.ceil((r.frames ?? 0) * 1.5), maxDeaths: 0 },
      'bot',
    );
    const out = resolve(args.save);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(tape, null, 2)}\n`);
    console.log(`saved ${out}`);
  }
  if (!r.found) process.exitCode = 2;
}

/** bot:all: every room's claims; rooms without claims get an informational run per named target. */
function runAll(): void {
  const t0 = performance.now();
  let failures = 0;
  const rows: string[] = [];
  for (const room of roomIds()) {
    const claims = roomClaims(room);
    const roomAbil = roomAbilities(room);
    const checks: {
      target: string;
      abilities: AbilitySet;
      assists?: AssistSet;
      expect: boolean | null;
      label: string;
      budget?: number;
    }[] = [];
    if (Object.keys(claims).length === 0) {
      for (const t of Object.keys(roomTargets(room))) {
        if (t === 'spawn:default') continue;
        checks.push({ target: t, abilities: roomAbil, expect: null, label: `${t} (no claim; info)` });
      }
    } else {
      for (const [t, c] of Object.entries(claims)) {
        const withSet: AbilitySet = {};
        for (const a of ABILITIES) withSet[a] = c.with.includes(a);
        const budget = c.budget !== undefined ? { budget: c.budget } : {};
        checks.push({
          target: t,
          abilities: withSet,
          expect: c.info ? null : true,
          label: `${t} with [${c.with.join(',')}]${c.info ? ' (info)' : ''}`,
          ...budget,
        });
        for (const a of c.without) {
          // `without` names an ability (removed) or an assist (switched off), e.g. gym-03 variableJump.
          const isAbility = (ABILITIES as readonly string[]).includes(a);
          const w = isAbility ? { ...withSet, [a]: false } : withSet;
          const assists = isAbility ? undefined : ({ [a]: false } as AssistSet);
          checks.push({
            target: t,
            abilities: w,
            ...(assists ? { assists } : {}),
            expect: false,
            label: `${t} without ${a}`,
            ...budget,
          });
        }
      }
    }
    for (const c of checks) {
      const r = search({
        ...baseOpts(room, c.target, c.abilities),
        ...(c.assists ? { assists: c.assists } : {}),
        ...(c.budget !== undefined && !args.budget ? { budget: c.budget } : {}),
      });
      const ok = c.expect === null || c.expect === r.found;
      if (!ok) failures++;
      const verdict = r.found ? `found ${r.frames}f` : r.exhausted ? 'unreachable' : 'not found in budget';
      rows.push(
        `| ${room} | ${c.label} | ${verdict} | ${c.expect === null ? 'info' : ok ? 'PASS' : 'FAIL'} | ${r.ms} ms |`,
      );
    }
  }
  console.log('| room | claim | result | status | time |\n|---|---|---|---|---|');
  console.log(rows.join('\n'));
  console.log(`\n${failures} failing claims; total ${Math.round(performance.now() - t0)} ms`);
  if (failures > 0) process.exitCode = 1;
}

if (args.all) runAll();
else runOne();
