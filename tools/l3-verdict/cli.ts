/**
 * The L3 verdict (docs/design/seize-levy-experiment.md §6.3-6.4): runs every headless check for
 * the Seize/Levy experiment, reads the e2e readability results (progress/l3/e-checks.json, written
 * by tests/e2e/signature.spec.ts) and prints PASS / IMPROVE / KILL / INVALID with each check's
 * measured value. Writes progress/l3/verdict.{md,json} and docs/reports/L3-verdict.md.
 *
 *   npm run l3:verdict              # full run (bot claims at 1M, fuzz 500 x 3600, 20 policy seeds)
 *   npm run l3:verdict -- --quick   # smaller budgets for iteration (marked QUICK; not a decision)
 *   npm run l3:verdict -- --b1prime # also run the informational bot-vs-bot flow ratio (slow)
 *
 * Reviewers: re-run it and read progress/l3/verdict.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildMeta } from '../../src/debug/build-info';
import { runPolicy } from '../bot/policies/common';
import { POLICIES } from '../bot/policies/fight';
import { search } from '../bot/search';
import { expertFor, fuzz } from '../fuzz';
import { installBuildInfo } from '../lib/build-info';
import {
  a4Scan,
  checkA1A2A3,
  checkA5,
  d1Scan,
  d3Scan,
  determinism,
  loadTape,
  pathLength,
  play,
  ROOT,
  stillness,
  tapeIntegrity,
  telegraphData,
} from './checks';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    quick: { type: 'boolean', default: false },
    b1prime: { type: 'boolean', default: false },
  },
});
const QUICK = args.quick === true;
const BOT_BUDGET = QUICK ? 200_000 : 1_000_000;
const FUZZ_RUNS = QUICK ? 50 : 500;
const SEEDS = QUICK ? 5 : 20;

interface Row {
  id: string;
  name: string;
  value: string;
  threshold: string;
  status: 'PASS' | 'FAIL' | 'INFO';
  kill?: boolean;
  notes?: string;
}
const rows: Row[] = [];
const guards: { name: string; ok: boolean; value: string }[] = [];
const t0 = performance.now();
const log = (s: string) =>
  console.error(`[l3:verdict ${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const add = (r: Row) => rows.push(r);

// ---- Tapes -------------------------------------------------------------------------------
const TAPES = {
  slab: 'lot-7.slab.json',
  heavy: 'lot-7.heavy.json',
  control: 'lot-7-control.json',
  sig: 'the-pit.signature.s2.json',
  jab: 'the-pit.jabOnly.s1.json',
};
const tapes = Object.fromEntries(Object.entries(TAPES).map(([k, f]) => [k, loadTape(f)])) as Record<
  keyof typeof TAPES,
  ReturnType<typeof loadTape>
>;
log('playing tapes');
const played = Object.fromEntries(Object.entries(tapes).map(([k, t]) => [k, play(t)])) as Record<
  keyof typeof TAPES,
  ReturnType<typeof play>
>;

// ---- Integrity guards (§6.4 step 4) ---------------------------------------------------------
log('integrity guards (tuning hash, overrides, re-trim)');
for (const k of ['slab', 'heavy', 'control'] as const) {
  const g = tapeIntegrity(tapes[k]);
  guards.push({
    name: `${TAPES[k]} tuning hash = current`,
    ok: g.tuningMatches,
    value: String(g.tuningMatches),
  });
  guards.push({
    name: `${TAPES[k]} carries no tuning overrides`,
    ok: !g.overrides,
    value: String(!g.overrides),
  });
  guards.push({
    name: `${TAPES[k]} re-trims to the same length (made by tape trim)`,
    ok: g.trimStable,
    value: `${g.frames} f`,
  });
}
for (const k of ['sig', 'jab'] as const) {
  const g = tapeIntegrity(tapes[k]);
  guards.push({
    name: `${TAPES[k]} tuning hash = current`,
    ok: g.tuningMatches,
    value: String(g.tuningMatches),
  });
}

// Control guard: the control tape must be within 5% of the bot's best (weight 1, 1M budget; the
// bot can't always finish at weight 1, so lighter greed levels are tried and reported).
log('control guard: bot on lot-7-control');
let botBest: { frames: number; weight: number } | null = null;
for (const weight of [1, 1.1, 1.2, 1.5]) {
  const r = search({ room: 'lot-7-control', target: 'G', weight, budget: BOT_BUDGET });
  if (r.found && r.frames !== undefined && (!botBest || r.frames < botBest.frames))
    botBest = { frames: r.frames, weight };
  if (botBest && weight >= 1.1) break;
}
const controlFrames = played.control.reachedAt ?? Infinity;
const guardOk = botBest !== null && controlFrames <= 1.05 * botBest.frames;
guards.push({
  name: 'control tape <= 1.05 x bot best',
  ok: guardOk,
  value: `${controlFrames} f vs bot ${botBest ? `${botBest.frames} f (weight ${botBest.weight})` : 'not found'}`,
});
const pathRatio = pathLength(played.control) / pathLength(played.slab);
guards.push({
  name: 'control/route A centre-path length in 0.90-1.10',
  ok: pathRatio >= 0.9 && pathRatio <= 1.1,
  value: pathRatio.toFixed(3),
});

// ---- A: feel of the verbs --------------------------------------------------------------------
log('A1-A3 lab scenarios, A5 weight classes');
const A = checkA1A2A3();
add({
  id: 'A1',
  name: 'Responsiveness (Seize)',
  value: `moveStart f${A.A1.moveStartFrame}, seizeTake f${A.A1.seizeTakeFrame}`,
  threshold: 'moveStart f1; seizeTake <= 6',
  status: A.A1.moveStartFrame === 1 && A.A1.seizeTakeFrame > 0 && A.A1.seizeTakeFrame <= 6 ? 'PASS' : 'FAIL',
});
const a2ok =
  A.A2.seizeTake <= 14 && A.A2.seizeWhiff <= 18 && A.A2.levy <= 10 && A.A2.horizontalIgnoredFrames === 0;
add({
  id: 'A2',
  name: 'Durations (hitstop excluded)',
  value: `take ${A.A2.seizeTake}, whiff ${A.A2.seizeWhiff}, levy ${A.A2.levy}; horizontal input ignored ${A.A2.horizontalIgnoredFrames} f`,
  threshold: '<= 14 / 18 / 10; 0 f ignored',
  status: a2ok ? 'PASS' : 'FAIL',
});
const a3min = Math.min(...Object.values(A.A3));
add({
  id: 'A3',
  name: 'Momentum (aerial S, V, D+V)',
  value: Object.entries(A.A3)
    .map(([k, v]) => `${k} ${pct(v)}`)
    .join(', '),
  threshold: '>= 80%',
  status: a3min >= 0.8 ? 'PASS' : 'FAIL',
});

log('A4 feedback over tapes + fuzz; C3 robustness fuzz (lot-7, the-pit)');
const fuzzLot = fuzz({
  room: 'lot-7',
  runs: FUZZ_RUNS,
  frames: 3600,
  seed: 1,
  verbs: true,
  expert: expertFor('lot-7'),
});
const fuzzPit = fuzz({ room: 'the-pit', runs: FUZZ_RUNS, frames: 3600, seed: 1, verbs: true });
const tapeA4 = a4Scan([
  ...played.slab.events,
  ...played.heavy.events,
  ...played.sig.events,
  ...played.jab.events,
]);
const a4checked = tapeA4.checked + fuzzLot.a4.checked + fuzzPit.a4.checked;
const a4bad = [...tapeA4.bad, ...fuzzLot.a4.bad, ...fuzzPit.a4.bad];
add({
  id: 'A4',
  name: 'Feedback (same-step hitstop >= class, colour + position)',
  value: `${a4checked - a4bad.length}/${a4checked} (${pct(a4checked ? (a4checked - a4bad.length) / a4checked : 0)})`,
  threshold: '100%',
  status: a4bad.length === 0 && a4checked > 0 ? 'PASS' : 'FAIL',
  ...(a4bad.length ? { notes: a4bad.slice(0, 3).join('; ') } : {}),
});
const A5 = checkA5();
const f = A5.feather;
const m = A5.middle;
const h = A5.heavy;
const a5ok =
  f !== undefined &&
  m !== undefined &&
  h !== undefined &&
  m.heightPx <= 0.85 * f.heightPx &&
  h.heightPx <= 0.85 * m.heightPx &&
  f.apexFrame - m.apexFrame >= 2 &&
  m.apexFrame - h.apexFrame >= 2 &&
  f.heightPx === 272 + 4; // the L2 opus table: 272 px + apex hang (4.31 tiles)
add({
  id: 'A5',
  name: 'Weight felt (feather = L2; adjacent classes differ)',
  value: Object.entries(A5)
    .map(([k, v]) => `${k} ${v.heightPx}px/apex f${v.apexFrame}/run ${v.runSpeed.toFixed(2)}`)
    .join('; '),
  threshold: 'feather = L2 opus (276 px with apex hang); >=15% height, >=2 f apex between classes',
  status: a5ok ? 'PASS' : 'FAIL',
});

// ---- B: flow -----------------------------------------------------------------------------------
const slabF = played.slab.reachedAt ?? Infinity;
const heavyF = played.heavy.reachedAt ?? Infinity;
const b1 = slabF / controlFrames;
add({
  id: 'B1',
  name: 'Flow ratio (route A / control)',
  value: `${b1.toFixed(3)} (${slabF} / ${controlFrames} f); min(A, B) ratio ${(Math.min(slabF, heavyF) / controlFrames).toFixed(3)} (route B ${heavyF} f)`,
  threshold: '<= 1.35 (kill > 1.6)',
  status: b1 <= 1.35 ? 'PASS' : 'FAIL',
  kill: b1 > 1.6,
});
const st = stillness(played.slab);
add({
  id: 'B2',
  name: 'Stillness (route A: grounded, |vx| < 0.5, non-hitstop)',
  value: `${pct(st.share)} (${st.still}/${st.total} steps)`,
  threshold: '<= 10% (kill > 20%)',
  status: st.share <= 0.1 ? 'PASS' : 'FAIL',
  kill: st.share > 0.2,
});
add({
  id: 'B3',
  name: 'Verb density (route A)',
  value: `${st.verbs} seize/levy uses; longest still pause before a verb ${st.longestPauseBeforeVerb} f`,
  threshold: '>= 3 uses, no pause > 20 f',
  status: st.verbs >= 3 && st.longestPauseBeforeVerb <= 20 ? 'PASS' : 'FAIL',
});
if (args.b1prime) {
  log("B1' bot on lot-7 (informational)");
  const r = search({ room: 'lot-7', target: 'G', weight: 1, budget: 2_000_000 });
  add({
    id: "B1'",
    name: 'Bot / bot flow ratio (informational)',
    value: r.found
      ? `${((r.frames ?? 0) / (botBest?.frames ?? 1)).toFixed(3)}`
      : 'bot did not find Lot 7 in 2M nodes',
    threshold: 'info',
    status: 'INFO',
  });
}

// ---- C: gates, expression, robustness -----------------------------------------------------
log('C1 gate integrity: bot without seize / without levy, fuzz without verbs');
const c1: string[] = [];
let bypass = false;
for (const [target, abilities, label] of [
  ['G', { seize: false, levy: true }, 'G without seize'],
  ['G', { seize: true, levy: false }, 'G without levy'],
  ['rect:1536,512,64,256', { seize: true, levy: false }, 'upper corridor mouth without levy'],
] as const) {
  const r = search({ room: 'lot-7', target, abilities, budget: BOT_BUDGET });
  if (r.found) bypass = true;
  c1.push(
    `${label}: ${r.found ? `FOUND ${r.frames} f` : r.exhausted ? 'exhausted' : `not found in ${BOT_BUDGET / 1000}k`}`,
  );
}
const fuzzNo = fuzz({ room: 'lot-7', runs: FUZZ_RUNS, frames: 3600, seed: 7, verbs: false });
if (fuzzNo.reachedG > 0) bypass = true;
c1.push(`fuzz no verbs ${FUZZ_RUNS}x3600: reached G ${fuzzNo.reachedG}`);
add({
  id: 'C1',
  name: 'Gate integrity (no bypass without the verbs)',
  value: c1.join('; '),
  threshold: 'never reached',
  status: bypass ? 'FAIL' : 'PASS',
  kill: bypass,
});
const plateBy = (p: ReturnType<typeof play>) =>
  p.events.flat().find((e) => e.type === 'plate') as { by?: string } | undefined;
const byA = plateBy(played.slab)?.by;
const byB = plateBy(played.heavy)?.by;
add({
  id: 'C2',
  name: 'Expression (distinct solutions)',
  value: `route A plate by ${byA ?? '-'} (${slabF} f), route B plate by ${byB ?? '-'} (${heavyF} f)`,
  threshold: '>= 2 distinct',
  status: byA && byB && byA !== byB && Number.isFinite(slabF) && Number.isFinite(heavyF) ? 'PASS' : 'FAIL',
});
const c3v = [...fuzzLot.violations, ...fuzzPit.violations];
add({
  id: 'C3',
  name: 'Robustness (fuzz invariants, regeneration, expert re-reach)',
  value: `lot-7 ${fuzzLot.violations.length} + the-pit ${fuzzPit.violations.length} violations over ${2 * FUZZ_RUNS} runs x 3600 f; expert re-reach ${fuzzLot.expertChecks - fuzzLot.expertFailures}/${fuzzLot.expertChecks}`,
  threshold: '0 violations',
  status: c3v.length === 0 && fuzzLot.expertFailures === 0 ? 'PASS' : 'FAIL',
  ...(c3v.length ? { notes: c3v.slice(0, 3).join('; ') } : {}),
});

// ---- D: combat (tuning debt, never blocks PASS) -------------------------------------------
log(`D2 policies x ${SEEDS} seeds`);
const pol: Record<string, ReturnType<typeof runPolicy>[]> = { signature: [], jabOnly: [] };
for (const name of ['signature', 'jabOnly'] as const) {
  const p = POLICIES[name];
  if (!p) continue;
  for (let seed = 1; seed <= SEEDS; seed++) pol[name]?.push(runPolicy(name, p, { seed, record: true }));
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? ((s[(s.length - 1) >> 1] ?? 0) + (s[s.length >> 1] ?? 0)) / 2 : Infinity;
};
const clearFrames = (rs: ReturnType<typeof runPolicy>[]) => rs.map((r) => r.clearFrame ?? 3600);
const sigMed = median(clearFrames(pol.signature ?? []));
const jabMed = median(clearFrames(pol.jabOnly ?? []));
const ok = (rs: ReturnType<typeof runPolicy>[]) => rs.filter((r) => r.cleared && r.deaths === 0).length;
const d2ratio = sigMed / jabMed;
add({
  id: 'D2',
  name: 'Signature dominance (median frames to roomClear)',
  value: `signature ${sigMed} / jabOnly ${jabMed} = ${d2ratio.toFixed(3)}; clean clears signature ${ok(pol.signature ?? [])}/${SEEDS}, jabOnly ${ok(pol.jabOnly ?? [])}/${SEEDS}; deaths ${(pol.signature ?? []).reduce((a, r) => a + r.deaths, 0)} / ${(pol.jabOnly ?? []).reduce((a, r) => a + r.deaths, 0)}`,
  threshold: '<= 0.75; both 20/20 clear, 0 deaths (< 0.50 warns)',
  status:
    d2ratio <= 0.75 && ok(pol.signature ?? []) === SEEDS && ok(pol.jabOnly ?? []) === SEEDS ? 'PASS' : 'FAIL',
  ...(d2ratio < 0.5 ? { notes: 'ratio < 0.50: Phase 2 tuning warning (the jab may not matter enough)' } : {}),
  ...(d2ratio > 1 ? { notes: 'signature is SLOWER than jab-only: flagged for the human' } : {}),
});
// D1 and D3 over the Pit tapes, every policy run and the Pit fuzz.
const fightSteps: { events: ReturnType<typeof play>['events']; frozen: boolean[] }[] = [
  { events: played.sig.events, frozen: played.sig.frozen },
  { events: played.jab.events, frozen: played.jab.frozen },
  ...[...(pol.signature ?? []), ...(pol.jabOnly ?? [])].map((r) => ({
    events: r.steps ?? [],
    frozen: r.frozen ?? [],
  })),
];
let d1takes = 0;
const d1bad: string[] = [];
const lags: number[] = [];
let d3att = fuzzPit.d3.attacks;
const d3bad = [...fuzzPit.d3.bad];
let d3min = Infinity;
for (const fs of fightSteps) {
  const d1 = d1Scan(fs.events);
  d1takes += d1.takes;
  d1bad.push(...d1.bad);
  lags.push(...d1.retrieveLags);
  const d3 = d3Scan(fs.events, fs.frozen);
  d3att += d3.attacks;
  d3bad.push(...d3.bad);
  d3min = Math.min(d3min, d3.minGap);
}
const maxLag = lags.length ? Math.max(...lags) : 0;
add({
  id: 'D1',
  name: 'Disarm (taken voice disables its attack; retrieve <= 10 f)',
  value: `${d1takes} voice takes (Pit tapes + policy runs); ${d1bad.length} attacks while disarmed; max take->retrieve ${maxLag} f`,
  threshold: '100%; <= 10 f',
  status: d1bad.length === 0 && maxLag <= 10 && d1takes > 0 ? 'PASS' : 'FAIL',
});
const tele = telegraphData();
add({
  id: 'D3',
  name: 'Telegraphs (data >= 15; T4 over tapes + Pit fuzz)',
  value: `data min ${tele.min} (${tele.list.join(', ')}); T4 ${d3att - d3bad.length}/${d3att} attacks >= 15 non-hitstop steps (tapes + policy runs + Pit fuzz; min gap ${d3min})`,
  threshold: '100%',
  status: tele.min >= 15 && d3bad.length === 0 ? 'PASS' : 'FAIL',
});

// ---- E: readability (e2e results) ----------------------------------------------------------
const ePath = join(ROOT, 'progress/l3/e-checks.json');
const E = existsSync(ePath)
  ? (JSON.parse(readFileSync(ePath, 'utf8')) as Record<string, Record<string, unknown>>)
  : null;
const eRow = (id: string, name: string, threshold: string, fmt: (e: Record<string, unknown>) => string) => {
  const e = E?.[id];
  add({
    id,
    name,
    value: e ? fmt(e) : 'not measured (run npx playwright test tests/e2e/signature.spec.ts)',
    threshold,
    status: e?.pass === true ? 'PASS' : 'FAIL',
  });
};
eRow(
  'E1',
  'Readability (ghost vs humming, hues, contrast)',
  'ghost <= 40% of humming; hue gap >= 60 deg; >= 3:1',
  (e) =>
    `ghost ratio ${Number(e.ghostRatio).toFixed(3)}, hue gap ${Number(e.hueGapMin).toFixed(1)} deg, contrast min ${Number(e.contrastMin).toFixed(2)}:1`,
);
eRow(
  'E2',
  'Silhouettes (humming vs ghost at 25%)',
  '>= 15% of bbox pixels differ',
  (e) => `${pct(Number(e.diffFrac))} differ`,
);
eRow(
  'E3',
  'Muting reads in one frame',
  'ghost on the take frame; passable next',
  (e) => `ghost same frame ${e.ghostSameFrame}, passable ${e.passableNext}`,
);

// ---- F1: determinism -------------------------------------------------------------------------
log('F1 determinism (3x per tape)');
const detOk = Object.values(tapes).every((t) => determinism(t));
add({
  id: 'F1',
  name: 'Determinism (each L3 tape 3x; cross-runtime in npm run check)',
  value: detOk ? 'identical 60-frame hash sequences' : 'MISMATCH',
  threshold: 'identical; check green',
  status: detOk ? 'PASS' : 'FAIL',
});

// ---- Decision (§6.4) ---------------------------------------------------------------------------
const get = (id: string) => rows.find((r) => r.id === id);
const passIds = ['A1', 'A2', 'A3', 'A4', 'C1', 'C2', 'C3', 'E1', 'E2', 'E3', 'F1'];
const invalid = guards.filter((g) => !g.ok);
const kills = rows.filter((r) => r.kill);
let decision: 'PASS' | 'IMPROVE' | 'KILL' | 'INVALID';
if (invalid.length > 0) decision = 'INVALID';
else if (kills.length > 0) decision = 'KILL';
else if (
  passIds.every((id) => get(id)?.status === 'PASS') &&
  (get('B1')?.status === 'PASS' || get('B2')?.status === 'PASS')
)
  decision = 'PASS';
else decision = 'IMPROVE';

const blocking = passIds.filter((id) => get(id)?.status !== 'PASS');
const debt = rows.filter((r) => r.id.startsWith('D') && r.status === 'FAIL').map((r) => r.id);
const meta = buildMeta(4);
const now = new Date().toISOString();
const reason =
  decision === 'INVALID'
    ? `integrity guard failed: ${invalid.map((g) => g.name).join('; ')}`
    : decision === 'KILL'
      ? `kill trigger: ${kills.map((r) => r.id).join(', ')} (the concept slows play) -> fallback per PLAN §2`
      : decision === 'PASS'
        ? `every A, C, E and F check passes and ${get('B1')?.status === 'PASS' ? 'B1' : 'B2'} passes`
        : `no kill trigger; failing pass conditions: ${[...blocking, ...(get('B1')?.status !== 'PASS' && get('B2')?.status !== 'PASS' ? ['B1+B2'] : [])].join(', ')}`;

const md: string[] = [];
md.push(`# L3 verdict: ${decision}${QUICK ? ' (QUICK run: reduced budgets, not a decision)' : ''}`);
md.push('');
md.push(
  `Generated by \`npm run l3:verdict\`${QUICK ? ' --quick' : ''} on ${now}, build ${meta.sha} (sim ${meta.sim}). Brief: docs/design/seize-levy-experiment.md §6.`,
);
md.push('');
md.push(`**Decision: ${decision}.** ${reason}.`);
if (debt.length) md.push(`D failures are Phase 2 tuning debt and don't block a PASS: ${debt.join(', ')}.`);
md.push('');
md.push('| # | Check | Measured | Threshold | Result |');
md.push('|---|---|---|---|---|');
for (const r of rows)
  md.push(
    `| ${r.id} | ${r.name} | ${r.value}${r.notes ? ` (${r.notes})` : ''} | ${r.threshold} | ${r.status}${r.kill ? ' **KILL**' : ''} |`,
  );
md.push('');
md.push('## Integrity guards (any failure makes the verdict INVALID)');
md.push('');
md.push('| Guard | Value | OK |');
md.push('|---|---|---|');
for (const g of guards) md.push(`| ${g.name} | ${g.value} | ${g.ok ? 'yes' : '**NO**'} |`);
md.push('');
md.push('## Inputs');
md.push('');
md.push(
  `- Tapes: ${Object.values(TAPES)
    .map((f) => `tests/replays/${f}`)
    .join(', ')}.`,
);
md.push(
  `- Fuzz: ${FUZZ_RUNS} runs x 3600 f per room (lot-7 all verbs, the-pit all verbs, lot-7 without verbs).`,
);
md.push(
  `- Policies: signature and jabOnly (tools/bot/policies/fight.ts), seeds 1-${SEEDS}, 12-step reaction delay.`,
);
md.push(
  `- Policy runs: signature ${JSON.stringify(clearFrames(pol.signature ?? []))}; jabOnly ${JSON.stringify(clearFrames(pol.jabOnly ?? []))} (3600 = not cleared).`,
);
md.push(`- E checks from ${existsSync(ePath) ? 'progress/l3/e-checks.json' : '(missing)'}.`);
const text = md.join('\n');

mkdirSync(join(ROOT, 'progress/l3'), { recursive: true });
writeFileSync(join(ROOT, 'progress/l3/verdict.md'), `${text}\n`);
writeFileSync(
  join(ROOT, 'progress/l3/verdict.json'),
  `${JSON.stringify({ decision, quick: QUICK, reason, rows, guards, build: meta, generated: now, policyRuns: { signature: clearFrames(pol.signature ?? []), jabOnly: clearFrames(pol.jabOnly ?? []) } }, null, 2)}\n`,
);
if (!QUICK) writeFileSync(join(ROOT, 'docs/reports/L3-verdict.md'), `${text}\n`);
console.log(text);
log('done');
