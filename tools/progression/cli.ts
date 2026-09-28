/**
 * Progression validator (PLAN §4.3, Phase 3): proves the world has no softlocks and every gate holds.
 *
 *   npm run progression                                   # full run, writes progress/progression/*
 *   npm run progression -- --out docs/reports/progression.md
 *   npm run progression -- --check                        # fast subset (npm run check): cache-backed,
 *                                                         # read-only, fails on errors not in the baseline
 *   npm run progression -- --design docs/design/world-design.md --design tests/progression/gym-world.json
 *
 * Options: --budget (300000 nodes; check 150000), --combo-budget (2 × budget), --workers N,
 * --semantics world,gym, --no-probes, --no-cache, --trust-stale, --baseline <file>, --json (print
 * the findings as JSON). See memory/progression.md.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { makeTape } from '../../src/debug/tape';
import { installBuildInfo } from '../lib/build-info';
import { auditGates, type GateAudit } from './audit';
import { checkDesign, type DesignGraph, diffDesign, loadDesign } from './intended';
import { abilitySet } from './job';
import { Oracle } from './oracle';
import { SearchPool } from './pool';
import { type ProbeReport, probeTraps } from './probes';
import { type DesignSection, dot, findings, markdown, type RunReport, renderSvg } from './report';
import { type Semantics, type Solution, solve } from './solver';
import { type Ability, abilKey, extractWorld } from './world';

installBuildInfo();
const ROOT = resolve(import.meta.dirname, '../..');

const { values: args } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    out: { type: 'string' },
    design: { type: 'string', multiple: true },
    budget: { type: 'string' },
    'combo-budget': { type: 'string' },
    workers: { type: 'string' },
    semantics: { type: 'string', default: 'world,gym' },
    'no-probes': { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
    'trust-stale': { type: 'boolean', default: false },
    baseline: { type: 'string', default: 'tests/progression/baseline.json' },
    json: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(0);
}

const check = args.check === true;
const log = (s: string) => {
  if (!args.quiet) console.log(s);
};
const budget = Number(args.budget ?? (check ? 150_000 : 300_000));
const comboBudget = Number(args['combo-budget'] ?? 2 * budget);
const semantics = (args.semantics ?? 'world,gym').split(',').filter(Boolean) as Semantics[];
const cachePath = args['no-cache'] ? undefined : join(ROOT, 'tests/progression/cache.json');
const DEFAULT_DESIGNS = ['tests/progression/gym-world.json', 'docs/design/world-design.md'];

async function main(): Promise<number> {
  const T: Record<string, number> = {};
  const t0 = performance.now();
  const lap = (name: string, since: number) => {
    T[name] = Math.round(performance.now() - since);
    return performance.now();
  };
  let t = performance.now();
  const world = extractWorld();
  t = lap('extract', t);
  const pool = new SearchPool(args.workers ? Number(args.workers) : undefined);
  const oracle = new Oracle({
    graph: world,
    pool,
    budget,
    ...(cachePath ? { cachePath } : {}),
    trustStale: check || args['trust-stale'] === true,
    log,
  });
  log(
    `progression: ${Object.keys(world.rooms).length} rooms, ${world.links.length} links, engine ${oracle.engine}, ${pool.size} workers${check ? ' (check mode)' : ''}`,
  );

  // 1. Global solve per semantics.
  const solutions: Solution[] = [];
  for (const sem of semantics) {
    log(`solve (${sem} semantics)...`);
    solutions.push(await solve(world, (qs) => oracle.ask(qs), { semantics: sem, budget }));
  }
  t = lap('solve', t);
  const worldSol = solutions.find((s) => s.semantics === 'world');
  const stripMemo = new Map<string, Promise<Solution>>();
  const solveWithout = (strip: Ability[]) => {
    const k = abilKey(strip);
    let p = stripMemo.get(k);
    if (!p) {
      p = solve(world, (qs) => oracle.ask(qs), { semantics: 'world', budget, strip });
      stripMemo.set(k, p);
    }
    return p;
  };

  // 2. Gate audit.
  log('gate audit...');
  const audit: GateAudit[] = await auditGates(world, oracle, { budget, comboBudget, solveWithout });
  t = lap('audit', t);

  // 3. Trap probes (world semantics states; the gym ones are a subset of rooms × smaller kits).
  let probes: ProbeReport | undefined;
  if (!args['no-probes']) {
    log('trap probes...');
    const sols = solutions;
    const merged: ProbeReport = { probed: 0, escaped: 0, unreachable: 0, traps: [], ms: 0 };
    for (const s of sols) {
      const p = await probeTraps(world, s, oracle, check ? Math.min(budget, 60_000) : budget);
      merged.probed += p.probed;
      merged.escaped += p.escaped;
      merged.unreachable += p.unreachable;
      for (const tr of p.traps)
        if (
          !merged.traps.some(
            (x) =>
              x.room === tr.room && x.ledge === tr.ledge && abilKey(x.abilities) === abilKey(tr.abilities),
          )
        )
          merged.traps.push(tr);
      merged.ms += p.ms;
    }
    probes = merged;
    t = lap('probes', t);
  }

  // 4. Design graphs: symbolic checks and the diff against the built world.
  const designs: DesignSection[] = [];
  const designFiles = args.design ?? DEFAULT_DESIGNS.filter((f) => existsSync(join(ROOT, f)));
  for (const f of designFiles) {
    let g: DesignGraph;
    try {
      g = loadDesign(resolve(ROOT, f));
    } catch (e) {
      console.error(`design ${f}: ${(e as Error).message}`);
      return 1;
    }
    log(`design ${f}...`);
    const report = checkDesign(g);
    const diff = worldSol ? await diffDesign(g, world, worldSol, oracle, { budget, solveWithout }) : [];
    // The built-world design (every room built) is strict; a future slice design only warns.
    const strict = g.rooms.every((r) => r.stub || world.rooms[r.id]);
    designs.push({ file: f, graph: g, report, diff, strict });
  }
  t = lap('design', t);
  await pool.close();
  T.total = Math.round(performance.now() - t0);

  const run: RunReport = {
    meta: {
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      sha: (globalThis as { __OPUS_BUILD__?: { sha: string } }).__OPUS_BUILD__?.sha ?? 'unknown',
      engine: oracle.engine,
      mode: check ? 'check' : 'full',
      workers: pool.size,
      budget,
    },
    world,
    solutions,
    audit,
    ...(probes ? { probes } : {}),
    designs,
    oracle: { ...oracle.stats },
    timings: T,
    evidence: {},
  };
  const fs = findings(run);
  const baselinePath = resolve(ROOT, args.baseline ?? 'tests/progression/baseline.json');
  const baseline = new Map<string, string>();
  if (existsSync(baselinePath)) {
    const b = JSON.parse(readFileSync(baselinePath, 'utf8')) as { accepted: { id: string; why: string }[] };
    for (const a of b.accepted) baseline.set(a.id, a.why);
  }
  const newErrors = fs.filter((f) => f.level === 'error' && !baseline.has(f.id));
  const fixed = [...baseline.keys()].filter((id) => !fs.some((f) => f.id === id));

  // Outputs (never in check mode unless --out is given).
  const out = args.out ?? (check ? undefined : 'progress/progression/progression.md');
  if (out) {
    const md = resolve(ROOT, out);
    const dir = dirname(md);
    const stem = basename(md, '.md');
    mkdirSync(dir, { recursive: true });
    // Evidence tapes for gate bypasses (replay / clip them: npm run tape -- check <file>).
    const evDir = join(dir, `${stem}-evidence`);
    rmSync(evDir, { recursive: true, force: true });
    for (const a of audit)
      for (const c of a.checks)
        for (const b of c.bypasses) {
          if (!b.answer.tape) continue;
          const key = `${a.gate.id}|${b.abilities.join('+')}`;
          if (run.evidence[key]) continue;
          const name = `${a.gate.id.replace(/[/:]/g, '.')}.${abilKey(b.answer.tapeAbilities ?? b.abilities)}`;
          const file = join(evDir, `${name}.json`);
          mkdirSync(evDir, { recursive: true });
          const tape = makeTape(
            name,
            {
              room: a.gate.room,
              spawn: a.gate.from,
              seed: 1,
              abilities: abilitySet(b.answer.tapeAbilities ?? b.abilities),
            },
            b.answer.tape,
            { target: a.gate.target, maxDeaths: 0 },
            'progression',
          );
          tape.notes = `Gate audit evidence: ${a.gate.id} (requires ${a.gate.requires.join(', ')}) reached with ${abilKey(b.answer.tapeAbilities ?? b.abilities)}.`;
          writeFileSync(file, `${JSON.stringify(tape, null, 2)}\n`);
          run.evidence[key] = relative(dir, file);
        }
    const { svg, via } = renderSvg(run);
    writeFileSync(join(dir, `${stem}.svg`), svg);
    writeFileSync(join(dir, `${stem}.dot`), dot(run));
    writeFileSync(md, markdown(run, fs, new Set(baseline.keys()), `${stem}.svg`));
    writeFileSync(join(dir, `${stem}.json`), `${JSON.stringify(jsonReport(run, fs, baseline), null, 1)}\n`);
    log(
      `wrote ${relative(ROOT, md)} (+ .json, .dot, .svg via ${via}, ${Object.keys(run.evidence).length} evidence tapes)`,
    );
  }
  if (!check && oracle.save()) log(`updated ${relative(ROOT, cachePath ?? '')}`);

  // Console summary.
  if (args.json) console.log(JSON.stringify(fs, null, 1));
  const w = worldSol;
  log(
    `\nrooms reached (world) ${w ? Object.values(w.rooms).filter((x) => x.reached).length : '-'}/${Object.keys(world.rooms).length}; gates ${audit.filter((a) => a.status === 'fail').length} failing / ${audit.length}; softlocks ${solutions.reduce((n, s) => n + s.softlocks.length, 0)}; traps ${probes?.traps.length ?? '-'}`,
  );
  for (const f of fs.filter((x) => x.level !== 'info'))
    log(`  ${f.level === 'error' ? (baseline.has(f.id) ? 'accepted' : 'ERROR   ') : 'warning '} ${f.text}`);
  for (const id of fixed) log(`  fixed?   baseline entry no longer found: ${id}`);
  const o = oracle.stats;
  log(
    `oracle: ${o.queries} queries, ${o.static} static, ${o.cache} cached, ${o.inferred} inferred, ${o.tapes} tapes, ${o.searches} searches (${(o.searchMs / 1000).toFixed(1)} s), ${o.reverified} re-verified, ${o.stale} stale`,
  );
  log(
    `time: ${Object.entries(T)
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
      .join(', ')}`,
  );
  if (newErrors.length > 0) {
    for (const f of newErrors) console.error(`  ERROR ${f.text}\n        id: ${f.id}`);
    console.error(
      `\nprogression: ${newErrors.length} error(s) not in ${relative(ROOT, baselinePath)}. Fix them, or accept one by adding its id and a reason to the baseline. Full report: npm run progression.`,
    );
    return 1;
  }
  return 0;
}

function jsonReport(r: RunReport, fs: ReturnType<typeof findings>, baseline: Map<string, string>) {
  return {
    meta: r.meta,
    timings: r.timings,
    oracle: r.oracle,
    findings: fs.map((f) => ({ ...f, accepted: baseline.get(f.id) })),
    rooms: Object.fromEntries(
      Object.values(r.world.rooms).map((room) => [
        room.id,
        {
          grant: room.grant,
          entries: room.entries,
          palette: room.palette,
          hazards: room.hazards,
          exits: room.exits.map((x) => ({ id: x.id, to: x.to, spawn: x.toSpawn })),
          pickups: room.pickups.map((p) => ({ id: p.id, grants: p.grants, implicit: p.implicit })),
          gates: room.gates,
          reach: Object.fromEntries(
            r.solutions.map((s) => [
              s.semantics,
              { reached: s.rooms[room.id]?.reached, kits: s.rooms[room.id]?.kits },
            ]),
          ),
        },
      ]),
    ),
    exits: Object.fromEntries(
      r.solutions.map((s) => [
        s.semantics,
        Object.fromEntries(
          Object.entries(s.exits).map(([id, n]) => [
            id,
            {
              reached: n.reached,
              verdict: n.verdict,
              kits: n.kits,
              how: n.evidence?.how,
              evidence: n.evidence?.evidence,
              frames: n.evidence?.frames,
              tape: n.evidence?.tape,
              why: n.why && { verdict: n.why.verdict, how: n.why.how, budget: n.why.budget },
            },
          ]),
        ),
      ]),
    ),
    softlocks: r.solutions.flatMap((s) => s.softlocks.map((x) => ({ semantics: s.semantics, ...x }))),
    gates: r.audit.map((a) => ({
      id: a.gate.id,
      status: a.status,
      hold: a.gate.hold,
      teachGate: a.gate.teachGate,
      requires: a.gate.requires,
      target: a.gate.target,
      palette: a.palette,
      rules: a.rules,
      notes: a.notes,
      checks: a.checks.map((c) => ({
        verb: c.verb,
        basis: c.basis,
        kit: c.kit,
        status: c.status,
        verdict: c.answer.verdict,
        how: c.answer.how,
        budget: c.answer.budget,
        bypasses: c.bypasses.map((b) => ({
          abilities: b.abilities,
          frames: b.answer.frames,
          tape: b.answer.tape,
          tapeAbilities: b.answer.tapeAbilities,
          file: r.evidence[`${a.gate.id}|${b.abilities.join('+')}`],
        })),
      })),
    })),
    traps: r.probes,
    designs: r.designs.map((d) => ({ file: d.file, strict: d.strict, report: d.report, diff: d.diff })),
  };
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
