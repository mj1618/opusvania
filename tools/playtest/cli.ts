/**
 * Persona playtests (memory/playtest-harness.md).
 *
 *   npm run playtest                                         # every persona, wood-hatch, headless
 *   npm run playtest -- --room wood-hatch --persona naive,explorer
 *   npm run playtest -- --persona explorer --live            # in the page, real keys (dev server on 5180)
 *   npm run playtest -- --persona speedrunner --clip         # + the run replayed in the page as a clip
 *   npm run playtest -- --from trace.json                    # a report for a trace recorded in the page
 *   npm run playtest -- --region wood --upto wood-well       # every persona from the world's start through the chunk
 *
 * --room id[,id]       rooms to start in (default wood-hatch)
 * --persona a,b        naive, explorer, speedrunner, cautious (default all)
 * --abilities list     all | none | glide,wallJump,... instead of the room's kit
 * --seconds n          sim seconds before a run stops (default 300)
 * --give-up n          stop a run lost (no progress) this long (default 120: STUDIO.md's limit)
 * --lost-after n       no progress this long counts as lost time (default 10)
 * --until exit|none    stop at the first room exit (default) or run to the limit
 * --runs n             runs per persona, persona dice 1..n (default 1)
 * --seed n             the sim's seed (default 1, the page's default)
 * --live               play in the page with real keys instead of headless (needs the dev server)
 * --clip               replay each run's input in the page and record it with tools/clip.ts
 * --clip-seconds n     the clip's length (default 30; one screenshot a frame)
 * --region name       a region run: from the world's start, `--until none`, all the region's rooms in one
 *                      report (<stamp>-region.md) against the region doc's §9 targets (docs/design/regions/<name>.md)
 * --upto room          the chunk ends there: a run is through once she leaves that room by another way than in
 * --chunk a..b,c       the chunk's rooms (`a..b` = the region doc's rows from a to b): through once she has been
 *                      in every one (and out of --upto, if given); the speedrunner heads for the nearest not yet
 * --goal room          where the speedrunner heads (default: the placed room furthest from the start)
 * --url, --out dir     dev server (default http://localhost:5180), reports dir (default playtest-reports)
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatInputScript } from '../../src/input/script';
import { getRoom, ROOM_IDS } from '../../src/scene/index';
import { GAME_WORLD } from '../../src/scene/world';
import { ABILITIES } from '../../src/sim/abilities';
import { DEFAULT_URL, launch, openGame } from '../lib/browser';
import { runHeadless } from './headless';
import { drawRoom } from './heatmap';
import type { LiveResult } from './live';
import { PERSONAS } from './personas';
import type { RunTrace } from './recorder';
import { regionMarkdown, reportMarkdown, type Summary, summarize, summaryTable } from './report';
import { loadTargets } from './targets';

const { values: args } = parseArgs({
  options: {
    room: { type: 'string', default: 'wood-hatch' },
    persona: { type: 'string', default: PERSONAS.join(',') },
    abilities: { type: 'string' },
    seconds: { type: 'string', default: '300' },
    'give-up': { type: 'string', default: '120' },
    'lost-after': { type: 'string', default: '10' },
    until: { type: 'string', default: 'exit' },
    runs: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    live: { type: 'boolean', default: false },
    clip: { type: 'boolean', default: false },
    'clip-seconds': { type: 'string', default: '30' },
    from: { type: 'string' },
    url: { type: 'string', default: DEFAULT_URL },
    out: { type: 'string', default: 'playtest-reports' },
    region: { type: 'string' },
    upto: { type: 'string' },
    chunk: { type: 'string' },
    goal: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(
    'npm run playtest -- [--room wood-hatch] [--persona naive,explorer] [--live] [--clip]. See tools/playtest/cli.ts.',
  );
  process.exit(0);
}

function abilitiesArg(v: string | undefined): string[] | null {
  if (v === undefined) return null;
  if (v === 'all' || v === '') return [...ABILITIES];
  if (v === 'none') return [];
  return v.split(',').map((s) => s.trim());
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outRoot = resolve(args.out ?? 'playtest-reports');
const abilities = abilitiesArg(args.abilities);
const lostAfter = Number(args['lost-after']);
const targets = loadTargets(ROOM_IDS);
const command = `npm run playtest -- ${process.argv.slice(2).join(' ')}`.trim();

/** Writes a run's folder: report.md, trace.json, the input tape, a heatmap per room. */
function writeRun(trace: RunTrace, tape: number[] | null, dirName: string): string {
  const dir = join(outRoot, dirName);
  mkdirSync(dir, { recursive: true });
  const files: string[] = ['trace.json'];
  writeFileSync(join(dir, 'trace.json'), JSON.stringify(trace));
  if (tape) {
    writeFileSync(join(dir, 'tape.txt'), `${formatInputScript(tape)}\n`);
    files.push('tape.txt');
  }
  for (const room of [...new Set(trace.rooms.map((r) => r.room))]) {
    let scene: ReturnType<typeof getRoom>;
    try {
      scene = getRoom(room);
    } catch {
      continue;
    }
    const name = `heatmap-${room}.png`;
    writeFileSync(join(dir, name), drawRoom(scene, trace));
    files.push(name);
  }
  writeFileSync(
    join(dir, 'report.md'),
    `${reportMarkdown(trace, { when: new Date().toISOString().slice(0, 16).replace('T', ' '), abilities, targets, files, command, lostAfter })}\n`,
  );
  return dir;
}

function clip(dir: string, room: string, tape: number[]): void {
  const n = Math.min(tape.length, Math.round(Number(args['clip-seconds']) * 60));
  const script = formatInputScript(tape.slice(0, n));
  const argv = [
    'tsx',
    'tools/clip.ts',
    '--room',
    room,
    '--pickups',
    '--setup',
    'g.load()',
    '--pre',
    '0',
    '--wide',
  ];
  argv.push('--script', script, '--name', 'clip', '--out', dir, '--url', args.url ?? DEFAULT_URL);
  if (args.abilities) argv.push('--abilities', args.abilities);
  console.log(`  recording ${(n / 60).toFixed(1)} s of the run as a clip (one screenshot a frame)...`);
  const r = spawnSync('npx', argv, { stdio: 'inherit' });
  if (r.status !== 0) console.error('  the clip failed (is the dev server running? npm run dev)');
  else
    appendFileSync(
      join(dir, 'report.md'),
      `\nClip of the first ${(n / 60).toFixed(1)} s (the tape replayed in the page): \`clip.mp4\`, \`clip.gif\`.\n`,
    );
}

/** The tape replays in the page to the same state (the sim is deterministic): checks it before a clip. */
async function verifyReplay(room: string, tape: number[], hash: string): Promise<void> {
  const browser = await launch();
  try {
    const page = await openGame(
      browser,
      withAbilities(args.url ?? DEFAULT_URL),
      { width: 640, height: 360 },
      1,
      true,
      room,
    );
    const got = await page.evaluate(
      `(() => { const g = window.__game; g.load(); g.input(${JSON.stringify(formatInputScript(tape))}); g.step(${tape.length}); return g.hash(); })()`,
    );
    if (got !== hash)
      console.warn(
        `  WARNING: the replay in the page ends in a different state (${got} vs ${hash}): the clip may not show this run.`,
      );
    else console.log('  the replay in the page matches the headless run (same state hash).');
  } finally {
    await browser.close();
  }
}

function withAbilities(url: string): string {
  if (!args.abilities) return url;
  return `${url}${url.includes('?') ? '&' : '?'}abilities=${encodeURIComponent(args.abilities)}`;
}

async function runLive(room: string, persona: string, personaSeed: number): Promise<LiveResult> {
  const browser = await launch();
  try {
    const page = await openGame(
      browser,
      withAbilities(args.url ?? DEFAULT_URL),
      { width: 1280, height: 720 },
      1,
      true,
      room,
    );
    const opts = {
      persona,
      personaSeed,
      seconds: Number(args.seconds),
      giveUp: Number(args['give-up']),
      until: args.until,
      lostAfter,
    };
    page.setDefaultTimeout(0);
    return (await page.evaluate(
      `(async () => (await import('/tools/playtest/live.ts')).play(${JSON.stringify(opts)}))()`,
    )) as LiveResult;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const rows: Summary[] = [];
  const dirs: string[] = [];
  if (args.from) {
    const trace = JSON.parse(readFileSync(args.from, 'utf8')) as RunTrace;
    const dir = writeRun(trace, null, `${stamp}-${trace.persona}`);
    rows.push(summarize(trace));
    dirs.push(dir);
  } else {
    const region = args.region;
    // `--chunk a..b,c`: rooms in the region doc's order (its §9 rows) from a to b, plus c.
    const docOrder = Object.keys(targets);
    const chunkRooms = args.chunk
      ? args.chunk.split(',').flatMap((part) => {
          const [a, b] = part.split('..');
          if (!b) return [part];
          const i = docOrder.indexOf(a ?? '');
          const j = docOrder.indexOf(b);
          if (i < 0 || j < 0) throw new Error(`--chunk ${part}: ${a} or ${b} is not a row of the region doc`);
          return docOrder.slice(i, j + 1);
        })
      : null;
    const rooms = region ? [GAME_WORLD.start] : (args.room ?? 'wood-hatch').split(',');
    const traces: RunTrace[] = [];
    const personas = (args.persona ?? '').split(',').filter(Boolean);
    const runs = Number(args.runs);
    for (const room of rooms)
      for (const persona of personas)
        for (let k = 1; k <= runs; k++) {
          const name = `${stamp}-${persona}${rooms.length > 1 ? `-${room}` : ''}${runs > 1 ? `-r${k}` : ''}`;
          process.stdout.write(
            `${persona} in ${room}${runs > 1 ? ` (run ${k})` : ''}${args.live ? ' live' : ''}... `,
          );
          let trace: RunTrace;
          let tape: number[];
          let hash = '';
          if (args.live) {
            const r = await runLive(room, persona, k);
            trace = r.trace;
            tape = r.tape;
            console.log(
              `${(trace.frames / 60).toFixed(1)} s, ${r.steps} steps in ${r.rafs} animation frames`,
            );
          } else {
            const t0 = performance.now();
            const r = runHeadless({
              room,
              persona,
              personaSeed: k,
              seed: Number(args.seed),
              abilities,
              seconds: Number(args.seconds),
              giveUp: Number(args['give-up']),
              until: region || args.until === 'none' ? 'none' : 'exit',
              lostAfter,
              ...(args.upto ? { upto: args.upto } : {}),
              ...(chunkRooms ? { chunk: chunkRooms } : {}),
              ...(args.goal ? { goal: args.goal } : {}),
            });
            trace = r.trace;
            tape = r.tape;
            hash = r.hash;
            console.log(
              `${(trace.frames / 60).toFixed(1)} s of play in ${Math.round(performance.now() - t0)} ms`,
            );
          }
          const dir = writeRun(trace, tape, name);
          if (args.clip) {
            if (hash) await verifyReplay(room, tape, hash);
            else
              console.warn('  (a live run: its tape is per animation frame, the replay is close, not exact)');
            clip(dir, room, tape);
          }
          rows.push(summarize(trace));
          dirs.push(dir);
          traces.push(trace);
        }
    if (region) {
      // The region's rooms in the order its doc lists them (the expected route), up to `--upto`.
      const order = Object.keys(targets).filter((r) => {
        try {
          return getRoom(r).region === region;
        } catch {
          return false;
        }
      });
      const end = args.upto ? order.indexOf(args.upto) : -1;
      const chunk = chunkRooms ?? (end >= 0 ? order.slice(0, end + 1) : order);
      const md = regionMarkdown(traces, chunk, targets, {
        when: new Date().toISOString().slice(0, 16).replace('T', ' '),
        command,
        region,
        upto: args.upto ?? null,
      });
      const file = join(outRoot, `${stamp}-region.md`);
      writeFileSync(file, `${md}\n`);
      console.log(`\n${md.split('## Time per room')[0]}`);
      console.log(`  ${relative(process.cwd(), file)}`);
    }
  }
  const table = summaryTable(rows);
  console.log(`\n${table}\n`);
  const index = [
    `# Playtest ${stamp}`,
    '',
    `\`${command}\``,
    '',
    table,
    '',
    ...dirs.map((d) => `- [${relative(outRoot, d)}](${relative(outRoot, d)}/report.md)`),
    '',
  ];
  writeFileSync(join(outRoot, `${stamp}-summary.md`), index.join('\n'));
  for (const d of dirs) console.log(`  ${relative(process.cwd(), d)}/report.md`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
