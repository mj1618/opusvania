/**
 * The first-timer agent's controller: a Claude sub-agent plays the game in the page with real keys, a
 * short burst at a time, looks at screenshots, and writes down what it understood. One command per turn;
 * a small server keeps the browser between commands (memory/playtest-harness.md "First-timer agent").
 *
 *   npm run firsttimer -- start [--room wood-hatch] [--name s1] [--abilities glide] [--size 1280x720]
 *   npm run firsttimer -- act "R60 R+J20 .30 {Tab}" [--every 2]   # real keys in real time, then the game pauses
 *   npm run firsttimer -- look                             # a screenshot now (the game stays paused)
 *   npm run firsttimer -- note "I think the moths want me to follow them" [--mood lost|unfair|fun|stuck|ok]
 *   npm run firsttimer -- status
 *   npm run firsttimer -- stop                             # report.md + heatmaps + journal.md, browser closed
 *
 * `act` takes the input DSL (src/input/script.ts): R L U D, J jump, X dash, A attack (cut), O offer, `.`
 * nothing, a number = frames (60 = 1 s), `+` combines (`R+J20`); and a player's other keys in braces: `{Tab}`
 * (the map), `{R}` (restart), `{M}` (sound), `{Esc}`, `{Enter}`; `{Tab}30` holds it 30 frames. Keep a burst to
 * 0.5-4 s. It prints what happened in a player's words, where she is, and the screenshots taken (every `--every`
 * s and at hits, deaths, new rooms, abilities, catches). Files: playtest-reports/<stamp>-firsttimer-<name>/.
 *
 * A first-timer sees what a player sees: the greybox designer labels and room notes are off (every room turns
 * them on again; the session turns them off), and the designer keys (G, F2, the panel) are refused. `--labels`
 * keeps the labels, `--dev` allows those keys: only when the orchestrator asks.
 *
 * It plays a **pinned clean build**: `start` makes (or refreshes, when HEAD has moved) a detached git worktree of
 * HEAD in `.scratch/playtest-snapshot` (node_modules linked), serves it with its own Vite on `--snap-port` (5193)
 * and runs the session's server from it, so other agents' half-edited files never reach a playtest. `--tree` plays
 * the working tree on the dev server instead (`--url`, default 5180).
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import type { RunTrace } from './recorder';

// The client commands import nothing of the game (only the server does, from the pinned snapshot): a
// half-edited file in the working tree cannot break a turn.
const DEFAULT_URL = process.env.GAME_URL ?? 'http://localhost:5180';

const [cmd = 'help', ...rest] = process.argv.slice(2);
const { values: args, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    room: { type: 'string', default: 'wood-hatch' },
    name: { type: 'string', default: 'agent' },
    abilities: { type: 'string' },
    size: { type: 'string', default: '1280x720' },
    every: { type: 'string', default: '2' },
    mood: { type: 'string' },
    url: { type: 'string', default: DEFAULT_URL },
    dir: { type: 'string' },
    port: { type: 'string' },
    root: { type: 'string' },
    labels: { type: 'boolean', default: false },
    dev: { type: 'boolean', default: false },
    tree: { type: 'boolean', default: false },
    'snap-port': { type: 'string', default: '5193' },
  },
});

/** The repo the reports belong to (the server runs in the snapshot and is told). */
const ROOT = resolve(args.root ?? '.');
const OUT = join(ROOT, 'playtest-reports');
const POINTER = join(OUT, '.firsttimer.json');

interface Session {
  dir: string;
  port: number;
  pid: number;
}

function session(): Session {
  if (!existsSync(POINTER)) throw new Error('No session: npm run firsttimer -- start');
  return JSON.parse(readFileSync(POINTER, 'utf8')) as Session;
}

async function call(path: string, body: unknown = {}): Promise<string> {
  const s = session();
  const r = await fetch(`http://127.0.0.1:${s.port}/${path}`, { method: 'POST', body: JSON.stringify(body) });
  return r.text();
}

// ---- The server: one browser page, commands one at a time.

async function serve(): Promise<void> {
  const { GAME_WORLD } = await import('../../src/scene/world');
  const { launch, openGame } = await import('../lib/browser');
  const { drawRoom } = await import('./heatmap');
  const { reportMarkdown } = await import('./report');
  const { loadTargets } = await import('./targets');
  const rel = (p: string): string => relative(ROOT, p);
  const dir = resolve(args.dir ?? '');
  const shotsDir = join(dir, 'shots');
  mkdirSync(shotsDir, { recursive: true });
  const journal = join(dir, 'journal.md');
  const [w = 1280, h = 720] = (args.size ?? '').split('x').map(Number);
  const browser = await launch();
  const base = args.url ?? DEFAULT_URL;
  const url = args.abilities
    ? `${base}${base.includes('?') ? '&' : '?'}abilities=${encodeURIComponent(args.abilities)}`
    : base;
  const page: Page = await openGame(browser, url, { width: w, height: h }, 1, true, args.room);
  page.setDefaultTimeout(0);
  // A fresh run from the room's start, labels off, its telemetry recorded from the first frame; the game waits.
  await page.evaluate(`(async () => {
    const m = await import('/tools/playtest/live.ts');
    window.__ft = m;
    const g = window.__game;
    g.load();
    g.pause();
    m.setLabels(${args.labels ? 'true' : 'false'});
    m.record(${JSON.stringify(args.name ?? 'agent')});
  })()`);
  let shot = 0;
  const snap = async (why: string): Promise<string> => {
    shot++;
    const name = `${String(shot).padStart(4, '0')}-${why.replace(/[^\w]+/g, '-').slice(0, 40)}.png`;
    const file = join(shotsDir, name);
    await page.locator('#game').screenshot({ path: file });
    return file;
  };
  const summary = async (): Promise<Record<string, unknown>> =>
    (await page.evaluate('window.__ft.summary()')) as Record<string, unknown>;
  const where = (s: Record<string, unknown>): string =>
    `${s.title} (${s.room}), x ${s.x} y ${s.y} of ${s.roomSize}; health ${s.hp}; owns ${(s.abilities as string[]).join(', ') || 'nothing yet'}; played ${s.time}${s.shut ? '; still in the cocoon (press any button)' : ''}`;
  appendFileSync(journal, `# First-timer journal: ${args.name} in ${args.room}\n\n`);
  let last = '';
  const handlers: Record<string, (b: Record<string, string>) => Promise<string>> = {
    async look() {
      const s = await summary();
      last = await snap('look');
      return `${where(s)}\nscreenshot: ${rel(last)}`;
    },
    async status() {
      return where(await summary());
    },
    async act(b) {
      const script = b.script ?? '';
      const every = Math.max(0.5, Number(b.every ?? 2)) * 1000;
      try {
        await page.evaluate(`window.__ft.burst(${JSON.stringify(script)}, ${args.dev ? 'true' : 'false'})`);
      } catch (e) {
        // A key it does not have, a token it cannot read: say so plainly (nothing was played).
        const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0]?.replace(/^.*Error: /, '');
        return `not played: ${msg}`;
      }
      const said: string[] = [];
      const files: string[] = [];
      let lastShot = Date.now();
      for (;;) {
        await page.waitForTimeout(150);
        const st = (await page.evaluate('window.__ft.burstStatus()')) as { done: boolean; said: string[] };
        for (const w of st.said) {
          said.push(w);
          // A moment worth a picture.
          if (/hit|faded|fell|came into|gained|caught|killed|rested|put out|map/.test(w))
            files.push(await snap(w));
        }
        if (st.done) break;
        if (Date.now() - lastShot > every) {
          files.push(await snap('burst'));
          lastShot = Date.now();
        }
      }
      const s = await summary();
      files.push(await snap('after'));
      last = files[files.length - 1] ?? '';
      appendFileSync(
        journal,
        `- _act_ \`${script}\`: ${said.join('; ') || 'nothing of note'}. Now: ${where(s)}. ![](${relative(dir, last)})\n`,
      );
      const what = said.length ? `what happened: ${said.join('; ')}` : 'nothing of note happened';
      return `${what}\nnow: ${where(s)}\nscreenshots: ${files.map(rel).join(', ')}`;
    },
    async note(b) {
      const s = await summary();
      const mood = b.mood ? ` **[${b.mood}]**` : '';
      const seen = last ? ` (seen in ${relative(dir, last)})` : '';
      appendFileSync(
        journal,
        `- **${s.time}, ${s.title}** (x ${s.x}, y ${s.y})${mood}: ${b.text ?? ''}${seen}\n`,
      );
      return 'noted';
    },
    async stop() {
      const trace = (await page.evaluate('window.__ft.stop()')) as RunTrace | null;
      await browser.close();
      setTimeout(() => process.exit(0), 50);
      if (!trace) return 'no trace';
      trace.persona = `first-timer ${args.name}`;
      writeFileSync(join(dir, 'trace.json'), JSON.stringify(trace));
      const files = ['trace.json', 'journal.md'];
      for (const room of new Set(trace.rooms.map((r) => r.room))) {
        const sc = GAME_WORLD.rooms[room]?.scene;
        if (!sc) continue;
        writeFileSync(join(dir, `heatmap-${room}.png`), drawRoom(sc, trace));
        files.push(`heatmap-${room}.png`);
      }
      const md = reportMarkdown(trace, {
        when: new Date().toISOString().slice(0, 16).replace('T', ' '),
        abilities: null,
        targets: loadTargets(Object.keys(GAME_WORLD.rooms), join(ROOT, 'docs/design/regions')),
        files,
        command: 'npm run firsttimer',
        lostAfter: 10,
      });
      writeFileSync(join(dir, 'report.md'), `${md}\n\nThe agent's own words: journal.md.\n`);
      return `report: ${rel(join(dir, 'report.md'))}\njournal: ${rel(journal)}`;
    },
  };
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      queue = queue.then(async () => {
        const name = (req.url ?? '/').slice(1);
        const fn = handlers[name];
        try {
          const out = fn ? await fn(JSON.parse(body || '{}')) : `unknown command ${name}`;
          res.end(out);
        } catch (e) {
          res.end(`error: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    });
  });
  server.listen(Number(args.port ?? 0), '127.0.0.1', () => {
    const a = server.address();
    const port = typeof a === 'object' && a ? a.port : 0;
    writeFileSync(join(dir, 'server.json'), JSON.stringify({ port, pid: process.pid }));
  });
}

// ---- The pinned build.

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/**
 * A detached worktree of HEAD in .scratch/playtest-snapshot (refreshed when HEAD has moved), node_modules
 * linked, served by its own Vite (left running between sessions; restarted with a new HEAD).
 */
async function snapshot(): Promise<{ dir: string; url: string }> {
  const git = (cwd: string, ...a: string[]): string =>
    execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  const repo = git(ROOT, 'rev-parse', '--show-toplevel');
  const head = git(repo, 'rev-parse', 'HEAD');
  const dir = join(repo, '.scratch', 'playtest-snapshot');
  const port = Number(args['snap-port'] ?? 5193);
  const url = `http://localhost:${port}`;
  const meta = join(repo, '.scratch', 'playtest-snapshot.json');
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(join(repo, '.scratch'), { recursive: true });
    git(repo, 'worktree', 'prune');
    git(repo, 'worktree', 'add', '--detach', '--force', dir, head);
  } else if (git(dir, 'rev-parse', 'HEAD') !== head) git(dir, 'checkout', '--detach', '--force', head);
  if (!existsSync(join(dir, 'node_modules')))
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'));
  const old = existsSync(meta)
    ? (JSON.parse(readFileSync(meta, 'utf8')) as { pid: number; head: string })
    : null;
  const live = await up(url);
  if (!(old && old.head === head && live)) {
    if (old)
      try {
        process.kill(old.pid);
      } catch {
        // already gone
      }
    if (live && !old) throw new Error(`Port ${port} is taken by something else: --snap-port <n>`);
    const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
    });
    vite.unref();
    writeFileSync(meta, JSON.stringify({ pid: vite.pid, head }));
    for (let i = 0; i < 300 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await up(url))) throw new Error(`The snapshot's Vite did not come up on ${url}`);
  }
  console.log(`playing the pinned build ${head.slice(0, 7)} (${relative(ROOT, dir)}, ${url})`);
  return { dir, url };
}

async function start(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(OUT, `${stamp}-firsttimer-${(args.name ?? 'agent').replace(/[^\w-]/g, '_')}`);
  mkdirSync(dir, { recursive: true });
  const snap = args.tree ? null : await snapshot();
  const url = snap ? snap.url : (args.url ?? DEFAULT_URL);
  const argv = ['tsx', 'tools/playtest/firsttimer.ts', 'serve', '--dir', dir, '--root', ROOT, '--url', url];
  argv.push(
    '--room',
    args.room ?? 'wood-hatch',
    '--name',
    args.name ?? 'agent',
    '--size',
    args.size ?? '1280x720',
  );
  if (args.abilities) argv.push('--abilities', args.abilities);
  if (args.labels) argv.push('--labels');
  if (args.dev) argv.push('--dev');
  const child = spawn('npx', argv, { cwd: snap ? snap.dir : ROOT, detached: true, stdio: 'ignore' });
  child.unref();
  const ready = join(dir, 'server.json');
  for (let i = 0; i < 900 && !existsSync(ready); i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(ready))
    throw new Error('The session did not start (with --tree: is the dev server up? npm run dev)');
  const { port, pid } = JSON.parse(readFileSync(ready, 'utf8')) as { port: number; pid: number };
  writeFileSync(POINTER, JSON.stringify({ dir, port, pid } satisfies Session));
  console.log(`session: ${relative(ROOT, dir)}`);
  console.log(await call('look'));
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'serve':
      return serve();
    case 'start':
      return start();
    case 'act':
      console.log(await call('act', { script: positionals.join(' '), every: args.every }));
      return;
    case 'note':
      console.log(await call('note', { text: positionals.join(' '), mood: args.mood }));
      return;
    case 'look':
    case 'status':
      console.log(await call(cmd));
      return;
    case 'stop':
      console.log(await call('stop'));
      return;
    default:
      console.log(
        'npm run firsttimer -- start | act "<keys>" | look | note "<text>" | status | stop (see tools/playtest/firsttimer.ts)',
      );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
