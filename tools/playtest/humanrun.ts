/**
 * Human-like playtests of a whole chunk, watched as video (memory/playtest-harness.md "Human-like runs").
 *
 *   npm run humanplay -- run                                   # casual / average / skilled x seeds 1-3, rendered
 *   npm run humanplay -- run --skills average --seeds 4 --no-render
 *   npm run humanplay -- render playtest-reports/humanlike-<stamp>/average-s1   # (re)render one run
 *   npm run humanplay -- den [--skills casual,average,skilled,explorer] [--seeds 1,2,3]   # the old burrback alone
 *
 * `run`: on the pinned clean build of HEAD (snapshot.ts; `--tree` = the working tree, served at --url), each
 * run plays headless at sim speed from the world's start (the persona `human-<skill>`: human.ts motor and
 * habits, perception delay, a first-timer's map) until it is through the chunk, lost for `--give-up` s, or
 * `--minutes` are up. Then its input tape is replayed in the page of the same build and recorded:
 *   video.mp4            the whole run at 2x (30 fps, one picture per 4 sim frames)
 *   frames/<room>/mm-ss.jpg   one picture a second of play, per room; contact-<room>-NN.jpg sheets of 36 of them
 *   moments/mm-ss-<what>.jpg  key moments: deaths, hits, catches, losing the way, first entries, finds, set pieces
 *   report.md            the usual run report + the feel metrics and the timeline per 10 s; trace.json,
 *                        feel.json, tape.txt, meta.json, heatmap-<room>.png
 * and `summary.md` / `summary.json` beside the runs: one row a run, a mean a skill.
 *
 * The harness of the working tree runs over the build's game: it is copied into the snapshot
 * (`<snapshot>/tools/playtest-human/`), so the tape is played by the very code the page replays.
 * Options: --skills a,b --seeds 1,2,3 --minutes 40 --give-up 180 --jobs 3 --chunk id,id,... --upto wood-well
 * --speed 2 --size 960x540 --out dir --tree --url http://localhost:5180 --no-render; `--world proto-1` plays a
 * prototype level's world (its rooms are the chunk).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Bucket, FeelMetrics } from './feel';
import { SKILL_NAMES, type Skill } from './human';
import type { RunTrace } from './recorder';
import { git, hold, pinnedBuild } from './snapshot';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Chunk 1 (wood.md draft 3, area 1: R1-R10). */
const CHUNK1 = [
  'wood-hatch',
  'wood-chase',
  'wood-wicks',
  'wood-burrow',
  'wood-glade',
  'wood-glidewalk',
  'wood-hollow',
  'wood-hawkers',
  'wood-silk',
  'wood-well',
];

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    skills: { type: 'string', default: SKILL_NAMES.join(',') },
    seeds: { type: 'string', default: '1,2,3' },
    skill: { type: 'string' },
    seed: { type: 'string' },
    minutes: { type: 'string', default: '40' },
    'give-up': { type: 'string', default: '180' },
    jobs: { type: 'string', default: '3' },
    chunk: { type: 'string', default: CHUNK1.join(',') },
    upto: { type: 'string', default: 'wood-well' },
    speed: { type: 'string', default: '2' },
    size: { type: 'string', default: '960x540' },
    out: { type: 'string' },
    tree: { type: 'boolean', default: false },
    url: { type: 'string', default: 'http://localhost:5180' },
    'no-render': { type: 'boolean', default: false },
    sha: { type: 'string', default: '' },
    room: { type: 'string' },
    radius: { type: 'string' },
    at: { type: 'string' },
    /** A prototype level's own world (`proto-1`, Lanternroot): its rooms are the chunk, from its start. */
    world: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

// (`--world <id>`: the chunk is that world's rooms, its start first, and the run has no `upto`: it is through once
// she has been in every room. The page picks the world from the room, as `?room=` does.)
if (args.world) {
  const file = join(HERE, '..', '..', 'content', 'worlds', `${args.world}.json`);
  const w = JSON.parse(readFileSync(file, 'utf8')) as { start: string; rooms: Array<{ id: string }> };
  args.chunk = [w.start, ...w.rooms.map((r) => r.id).filter((id) => id !== w.start)].join(',');
  args.upto = '';
}

const clock = (f: number): string => {
  const s = Math.floor(f / 60);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}-${String(s % 60).padStart(2, '0')}`;
};
const mmss = (f: number): string => clock(f).replace('-', ':');

interface Meta {
  sha: string;
  subject: string;
  skill: Skill;
  seed: number;
  outcome: string;
  frames: number;
  hash: string;
  rooms: number;
  chunk: string[];
  deaths: number;
  hits: number;
  catches: number;
  motor: { strays: number; doubles: number } | null;
  metrics: FeelMetrics;
  render?: { url: string; match: boolean; hash: string; captures: number; seconds: number };
}

// ---- job: one headless run (inside the snapshot, or the working tree).

async function job(): Promise<void> {
  const skill = args.skill as Skill;
  const seed = Number(args.seed ?? 1);
  const out = resolve(args.out ?? '.');
  const chunk = (args.chunk ?? '').split(',');
  // The game is loaded here only (render and run never import it: the working tree may be mid-edit).
  const { runHeadless } = await import('./headless');
  const { drawRoom } = await import('./heatmap');
  const { getRoom } = await import('../../src/scene/index');
  const { formatInputScript } = await import('../../src/input/script');
  const { reportMarkdown } = await import('./report');
  const t0 = Date.now();
  const r = runHeadless({
    room: chunk[0] ?? 'wood-hatch',
    persona: `human-${skill}`,
    human: skill,
    personaSeed: seed,
    seconds: Number(args.minutes) * 60,
    until: 'none',
    giveUp: Number(args['give-up']),
    chunk,
    upto: args.upto ?? 'wood-well',
  });
  const t = r.trace;
  mkdirSync(out, { recursive: true });
  const files = ['trace.json', 'tape.txt', 'feel.json', 'meta.json', 'timeline.md'];
  writeFileSync(join(out, 'trace.json'), JSON.stringify(t));
  writeFileSync(join(out, 'tape.txt'), `${formatInputScript(r.tape)}\n`);
  writeFileSync(join(out, 'feel.json'), JSON.stringify(r.feel, null, 1));
  for (const room of [...new Set(t.rooms.map((v) => v.room))]) {
    const name = `heatmap-${room}.png`;
    writeFileSync(join(out, name), drawRoom(getRoom(room), t));
    files.push(name);
  }
  const meta: Meta = {
    sha: args.sha || 'tree',
    subject: args.sha ? git(process.cwd(), 'log', '-1', '--format=%s') : 'the working tree',
    skill,
    seed,
    outcome: t.outcome,
    frames: t.frames,
    hash: r.hash,
    rooms: new Set(t.rooms.map((v) => v.room).filter((q) => chunk.includes(q))).size,
    chunk,
    deaths: t.deaths.length,
    hits: t.hurts.length,
    catches: t.catches.length,
    motor: r.motor ?? null,
    metrics: r.feel.metrics,
  };
  writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 1));
  writeFileSync(join(out, 'timeline.md'), `${timelineMarkdown(r.feel.buckets)}\n`);
  const report = reportMarkdown(t, {
    when: new Date().toISOString().slice(0, 16).replace('T', ' '),
    abilities: null,
    targets: {},
    files: [...files, 'video.mp4', 'frames/', 'moments/'],
    command: `npm run humanplay -- run --skills ${skill} --seeds ${seed}`,
    lostAfter: 10 * 60,
  });
  writeFileSync(
    join(out, 'report.md'),
    `${report}\n\n${feelMarkdown(meta)}\n\n## Timeline (10 s a row)\n\n${timelineMarkdown(r.feel.buckets)}\n`,
  );
  console.log(
    `${skill} s${seed}: ${t.outcome} after ${mmss(t.frames)}, ${meta.rooms}/${chunk.length} rooms, ${meta.deaths} deaths (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}

export function feelMarkdown(m: Meta): string {
  const x = m.metrics;
  return [
    `## Feel (human-like ${m.skill}, seed ${m.seed}, build ${m.sha})`,
    '',
    '| metric | value |',
    '|---|---|',
    `| ended | ${m.outcome} after ${mmss(m.frames)}, ${m.rooms} of ${m.chunk.length} chunk rooms |`,
    `| first input after spawn / control from | ${x.firstInputS.toFixed(1)} s / ${x.controlS.toFixed(1)} s |`,
    `| flow (moving or in the air) / stood still | ${x.flowPct.toFixed(0)}% / ${x.stoppedPct.toFixed(0)}% |`,
    `| deaths per 10 min | ${x.deathsPer10Min.toFixed(1)} (${m.deaths} deaths, ${m.hits} hits, ${m.catches} catches) |`,
    `| fail-retry loops (a fall or death within 20 s, 300 px of the last) | ${x.retryLoops} |`,
    `| longest stretch through ground already walked | ${x.longestRepeatS.toFixed(0)} s |`,
    `| presses a second | ${x.inputDensity.toFixed(1)} |`,
    `| something new every | ${x.newEveryS.toFixed(1)} s |`,
    `| motor slips | ${m.motor ? `${m.motor.strays} stray presses, ${m.motor.doubles} double taps` : '-'} |`,
  ].join('\n');
}

export function timelineMarkdown(buckets: readonly Bucket[]): string {
  const rows = [
    '| t | rooms | label | doing (s) | threat | new cells | idle s | backtrack s | deaths / hits / catches |',
  ];
  rows.push('|---|---|---|---|---|---|---|---|---|');
  for (const b of buckets) {
    const doing = Object.entries(b.doing)
      .sort((a, c) => c[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${(v / 60).toFixed(0)}`)
      .join(', ');
    rows.push(
      `| ${mmss(b.t * 60)} | ${b.rooms.map((q) => q.replace(/^wood-/, '')).join(' > ')} | ${b.label} | ${doing} | ${b.threat} | ${b.novelty} | ${(b.idle / 60).toFixed(0)} | ${(b.backtrack / 60).toFixed(0)} | ${b.deaths} / ${b.hits} / ${b.catches} |`,
    );
  }
  return rows.join('\n');
}

// ---- render: the tape replayed in the page, recorded.

/** Frames worth a still, with a word for the file name. */
export function moments(t: RunTrace): Array<{ f: number; what: string }> {
  const out: Array<{ f: number; what: string }> = [];
  const add = (f: number, what: string) =>
    out.push({ f: Math.max(0, f), what: what.replace(/[^\w-]+/g, '-') });
  if (t.hatchFrame !== null) add(t.hatchFrame + 30, 'hatch');
  const firsts = new Set<string>();
  for (const v of t.rooms)
    if (!firsts.has(v.room)) {
      firsts.add(v.room);
      add(v.enter + 45, `enter-${v.room}`);
    }
  for (const d of t.deaths) {
    add(d.f - 40, `death-${d.by}`);
    add(d.f + 5, 'death-after');
  }
  for (const h of t.hurts) add(h.f, `hit-${h.kind}`);
  for (const c of t.catches) add(c.f - 20, `caught-${c.id}`);
  for (const l of t.lost) add(l.from + 300, `lost-${l.room}`);
  for (const a of t.abilities) add(a.f + 30, `find-${a.id}`);
  for (const [id, l] of Object.entries(t.lights)) {
    if (l.snuffed !== null) add(l.snuffed, `snuff-${id}`);
    if (l.lit !== null) add(l.lit, `lit-${id}`);
  }
  for (const [id, e] of Object.entries(t.encounters))
    if (/old|boss|weaver/i.test(e.kind)) {
      add(e.first + 30, `setpiece-${id}`);
      add(e.last, `setpiece-${id}-end`);
    }
  return out.sort((a, b) => a.f - b.f);
}

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message})`);
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function render(dir: string, url: string): Promise<void> {
  const { launch, openGame } = await import('../lib/browser');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
  const trace = JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8')) as RunTrace;
  const tape = readFileSync(join(dir, 'tape.txt'), 'utf8').trim();
  const [w = 960, h = 540] = (args.size ?? '960x540').split('x').map(Number);
  const per = Math.max(1, Math.round(Number(args.speed) * 2)); // sim frames a picture (30 fps out)
  const shots = join(dir, '.video');
  for (const d of [shots, join(dir, 'frames'), join(dir, 'moments')])
    rmSync(d, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  const want = moments(trace);
  const t0 = Date.now();
  const browser = await launch();
  let captures = 0;
  let hash = '';
  try {
    const page = await openGame(browser, url, { width: w, height: h }, 1, true, meta.chunk[0]);
    page.setDefaultTimeout(0);
    await page.evaluate(
      `(() => { const g = window.__game; g.cam(null); g.debug.labels?.(false); g.load(); g.input(${JSON.stringify(tape)}); })()`,
    );
    const canvas = page.locator('#game');
    let done = 0;
    let mi = 0;
    let lastSec = -1;
    for (;;) {
      const n = captures === 0 ? 0 : Math.min(per, meta.frames - done);
      if (captures > 0 && n <= 0) break;
      done += n;
      const s = (await page.evaluate((k) => {
        const g = (
          window as unknown as {
            __game: { step(n: number): unknown; state(): { frame: number; room: string } };
          }
        ).__game;
        if (k > 0) g.step(k);
        const st = g.state();
        return { frame: st.frame, room: st.room };
      }, n)) as { frame: number; room: string };
      const shot = await canvas.screenshot({ type: 'jpeg', quality: 85 });
      writeFileSync(join(shots, `${String(captures++).padStart(6, '0')}.jpg`), shot);
      const sec = Math.floor(done / 60);
      if (sec !== lastSec) {
        lastSec = sec;
        const rd = join(dir, 'frames', s.room);
        mkdirSync(rd, { recursive: true });
        writeFileSync(join(rd, `${clock(done)}.jpg`), shot);
      }
      while (mi < want.length && (want[mi]?.f ?? Number.POSITIVE_INFINITY) <= done) {
        const m = want[mi++] as { f: number; what: string };
        mkdirSync(join(dir, 'moments'), { recursive: true });
        writeFileSync(join(dir, 'moments', `${clock(m.f)}-${m.what}.jpg`), shot);
      }
      if (captures % 900 === 0)
        console.log(
          `  ${basename(dir)}: ${mmss(done)} of ${mmss(meta.frames)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
        );
    }
    hash = String(await page.evaluate('window.__game.hash()'));
  } finally {
    await browser.close();
  }
  ffmpeg([
    '-framerate',
    '30',
    '-i',
    join(shots, '%06d.jpg'),
    '-vf',
    'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '23',
    join(dir, 'video.mp4'),
  ]);
  rmSync(shots, { recursive: true, force: true });
  // Contact sheets: 36 seconds a sheet (6 x 6), per room.
  const sheets: string[] = [];
  for (const room of readdirSync(join(dir, 'frames'))) {
    ffmpeg([
      '-pattern_type',
      'glob',
      '-i',
      join(dir, 'frames', room, '*.jpg'),
      '-vf',
      'scale=320:-1,tile=6x6:padding=4:margin=4',
      '-q:v',
      '4',
      join(dir, `contact-${room}-%02d.jpg`),
    ]);
    sheets.push(room);
  }
  const match = hash === meta.hash;
  meta.render = { url, match, hash, captures, seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(
    `  ${basename(dir)}: video.mp4 (${captures} pictures, ${meta.render.seconds} s), ${sheets.length} rooms of contact sheets, ${want.length} moments; replay ${match ? 'matches the headless run' : `DIFFERS (${hash} vs ${meta.hash})`}`,
  );
}

// ---- run: the matrix.

function sh(cmd: string, argv: string[], cwd: string): Promise<number> {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { cwd, stdio: 'inherit' });
    p.on('exit', (code) => res(code ?? 1));
  });
}

async function pool<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (queue.length) await fn(queue.shift() as T);
    }),
  );
}

export function summaryMarkdown(metas: readonly Meta[], dirOf: (m: Meta) => string): string {
  const out: string[] = [];
  const m0 = metas[0];
  out.push(`# Human-like runs: build ${m0?.sha ?? '?'} ("${m0?.subject ?? ''}")`);
  out.push('');
  out.push(
    '| run | ended | time | rooms | deaths | hits | catches | first input | flow / still | deaths/10 min | retry loops | longest repeat | presses/s | new every | video |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of metas) {
    const x = m.metrics;
    const d = dirOf(m);
    out.push(
      `| ${m.skill} s${m.seed} | ${m.outcome} | ${mmss(m.frames)} | ${m.rooms}/${m.chunk.length} | ${m.deaths} | ${m.hits} | ${m.catches} | ${x.firstInputS.toFixed(1)} s | ${x.flowPct.toFixed(0)}% / ${x.stoppedPct.toFixed(0)}% | ${x.deathsPer10Min.toFixed(1)} | ${x.retryLoops} | ${x.longestRepeatS.toFixed(0)} s | ${x.inputDensity.toFixed(1)} | ${x.newEveryS.toFixed(1)} s | ${m.render ? `[mp4](${d}/video.mp4)${m.render.match ? '' : ' (replay differs)'}` : '-'} |`,
    );
  }
  out.push('');
  out.push('Means per skill:');
  out.push('');
  out.push(
    '| skill | through | time | rooms | deaths | hits | flow | deaths/10 min | retry loops | longest repeat | new every |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const skill of SKILL_NAMES) {
    const ms = metas.filter((m) => m.skill === skill);
    if (!ms.length) continue;
    const avg = (fn: (m: Meta) => number) => ms.reduce((a, m) => a + fn(m), 0) / ms.length;
    out.push(
      `| ${skill} | ${ms.filter((m) => m.outcome === 'through').length}/${ms.length} | ${mmss(avg((m) => m.frames))} | ${avg((m) => m.rooms).toFixed(1)} | ${avg((m) => m.deaths).toFixed(1)} | ${avg((m) => m.hits).toFixed(1)} | ${avg((m) => m.metrics.flowPct).toFixed(0)}% | ${avg((m) => m.metrics.deathsPer10Min).toFixed(1)} | ${avg((m) => m.metrics.retryLoops).toFixed(1)} | ${avg((m) => m.metrics.longestRepeatS).toFixed(0)} s | ${avg((m) => m.metrics.newEveryS).toFixed(1)} s |`,
    );
  }
  return out.join('\n');
}

async function run(): Promise<void> {
  const root = resolve(HERE, '../..');
  const skills = (args.skills ?? '').split(',').filter(Boolean) as Skill[];
  const seeds = (args.seeds ?? '').split(',').filter(Boolean).map(Number);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outRoot = resolve(args.out ?? join(root, 'playtest-reports', `humanlike-${stamp}`));
  mkdirSync(outRoot, { recursive: true });
  let cwd = root;
  let harness = join(root, 'tools/playtest/humanrun.ts');
  let url = args.url ?? 'http://localhost:5180';
  let sha = '';
  if (!args.tree) {
    const snap = await pinnedBuild(root);
    hold(root, snap.sha);
    sha = snap.sha;
    // The working tree's harness over the build's game (a folder of its own: first-timer sessions keep theirs).
    const h = join(snap.dir, 'tools/playtest-human');
    mkdirSync(h, { recursive: true });
    for (const f of readdirSync(join(root, 'tools/playtest')))
      if (f.endsWith('.ts')) copyFileSync(join(root, 'tools/playtest', f), join(h, f));
    cwd = snap.dir;
    harness = join(h, 'humanrun.ts');
    url = `http://localhost:${snap.port}`;
  }
  const runs = skills.flatMap((skill) =>
    seeds.map((seed) => ({ skill, seed, dir: join(outRoot, `${skill}-s${seed}`) })),
  );
  console.log(`${runs.length} runs on ${sha || 'the working tree'} -> ${relative(root, outRoot)}`);
  const common = [
    '--minutes',
    args.minutes ?? '40',
    '--give-up',
    args['give-up'] ?? '180',
    '--chunk',
    args.chunk ?? '',
    '--upto',
    args.upto ?? '',
  ];
  await pool(runs, Number(args.jobs), async (r) => {
    const code = await sh(
      'npx',
      [
        'tsx',
        harness,
        'job',
        '--skill',
        r.skill,
        '--seed',
        String(r.seed),
        '--out',
        r.dir,
        '--sha',
        sha,
        ...common,
      ],
      cwd,
    );
    if (code !== 0) console.error(`  ${r.skill} s${r.seed}: the run failed (${code})`);
  });
  if (!args['no-render'])
    await pool(runs, Number(args.jobs), async (r) => {
      if (!existsSync(join(r.dir, 'meta.json'))) return;
      const code = await sh(
        'npx',
        [
          'tsx',
          join(root, 'tools/playtest/humanrun.ts'),
          'render',
          r.dir,
          '--url',
          url,
          '--speed',
          args.speed ?? '2',
          '--size',
          args.size ?? '',
        ],
        root,
      );
      if (code !== 0) console.error(`  ${r.skill} s${r.seed}: the render failed (${code})`);
    });
  const metas = runs
    .filter((r) => existsSync(join(r.dir, 'meta.json')))
    .map((r) => JSON.parse(readFileSync(join(r.dir, 'meta.json'), 'utf8')) as Meta);
  writeFileSync(join(outRoot, 'summary.json'), JSON.stringify(metas, null, 1));
  writeFileSync(join(outRoot, 'summary.md'), `${summaryMarkdown(metas, (m) => `${m.skill}-s${m.seed}`)}\n`);
  console.log(
    `\n${summaryMarkdown(metas, (m) => `${m.skill}-s${m.seed}`)}\n\n  ${relative(root, join(outRoot, 'summary.md'))}`,
  );
}

// ---- den: the old burrback's fight alone, every skill (and the bots), headless.

/**
 * `npm run humanplay -- den [--skills casual,average,skilled,explorer] [--seeds 1,2,3] [--minutes 5]`: each persona
 * from the den's patch (`--at x`) in `--room` (wood-well) with glide, until the old burrback is down or time is up.
 * A room whose boss has no `taproot` yet gets the den's (3200-3296) and `--radius` (1000) for the run, said so.
 */
async function den(): Promise<void> {
  const { runHeadless } = await import('./headless');
  const { getRoom } = await import('../../src/scene/index');
  const base = getRoom(args.room ?? 'wood-well');
  type Spawn = NonNullable<typeof base.enemies>[number] & { taproot?: [number, number]; radius?: number };
  const patched = (base.enemies ?? []).some((e) => e.kind === 'oldBurrback' && !(e as Spawn).taproot);
  const room = {
    ...base,
    enemies: (base.enemies ?? []).map((e) =>
      e.kind === 'oldBurrback' && !(e as Spawn).taproot
        ? { ...e, taproot: [3200, 3296] as [number, number], radius: Number(args.radius ?? 1000) }
        : e,
    ),
  };
  if (patched)
    console.log(
      `(${base.id}'s old burrback has no taproot: the den's 3200-3296 and radius ${args.radius ?? 1000} for this run)`,
    );
  const skills = (args.skills ?? '').split(',').filter(Boolean);
  const seeds = (args.seeds ?? '').split(',').filter(Boolean).map(Number);
  let wins = 0;
  for (const skill of skills)
    for (const seed of seeds) {
      const human = (SKILL_NAMES as readonly string[]).includes(skill) ? (skill as Skill) : undefined;
      const unroll: Record<string, number> = {};
      const r = runHeadless({
        room,
        persona: human ? `human-${human}` : skill,
        ...(human ? { human } : {}),
        personaSeed: seed,
        seconds: Number(args.minutes ?? 5) * 60,
        until: 'none',
        giveUp: 200,
        abilities: ['glide'],
        at: { x: Number(args.at ?? 3744), y: (base.patches?.[0]?.y as number | undefined) ?? 2112 },
        onStep: (_s, _m, _p, ev) => {
          for (const e of ev)
            if ((e.type as string) === 'enemyUnroll') {
              const how = String((e as unknown as { how?: string }).how);
              unroll[how] = (unroll[how] ?? 0) + 1;
            }
        },
      });
      const t = r.trace;
      const kill = t.kills.find(
        (k) => /burr/.test(k.id) && t.encounters[`${k.room}:${k.id}`]?.kind === 'oldBurrback',
      );
      if (kill) wins++;
      const enc = Object.values(t.encounters).find((e) => e.kind === 'oldBurrback');
      console.log(
        `${skill.padEnd(11)} s${seed}: ${kill ? `down in ${mmss(kill.f)}` : `not down (${t.outcome} after ${mmss(t.frames)})`}, ${t.deaths.length} fades, ${enc?.hits ?? 0} hits, slams ${t.events.enemySlam ?? 0}, unrolled ${JSON.stringify(unroll)}, taproot ${t.events.enemyTaproot ?? 0}, den lamp catches ${t.lureCatches['wick-den'] ?? 0}`,
      );
    }
  console.log(`${wins} of ${skills.length * seeds.length} down`);
}

async function main(): Promise<void> {
  const cmd = positionals[0];
  if (args.help || !cmd) {
    console.log(
      'npm run humanplay -- run [--skills casual,average,skilled] [--seeds 1,2,3] [--no-render] [--tree] | render <run dir>. See tools/playtest/humanrun.ts.',
    );
    process.exit(args.help ? 0 : 1);
  }
  if (cmd === 'job') await job();
  else if (cmd === 'render')
    await render(resolve(positionals[1] ?? '.'), args.url ?? 'http://localhost:5180');
  else if (cmd === 'run') await run();
  else if (cmd === 'den') await den();
  else throw new Error(`Unknown command "${cmd}" (run | render)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
