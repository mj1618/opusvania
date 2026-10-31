/**
 * The first-timer agent's controller: a Claude sub-agent plays the game in the page with real keys, a
 * short burst at a time, looks at screenshots, and writes down what it understood. One command per turn;
 * a small server keeps the browser between commands (memory/playtest-harness.md "First-timer agent").
 *
 *   npm run firsttimer -- start --name s1 [--world canopy] [--room wood-hatch] [--abilities glide] [--size 1280x720]
 *   npm run firsttimer -- act "R60 R+J20 .30 {Tab}" [--every 2]   # real keys in real time, then the game pauses
 *   npm run firsttimer -- look                             # a screenshot now (the game stays paused)
 *   npm run firsttimer -- note "I think the moths want me to follow them" [--mood lost|unfair|fun|stuck|ok]
 *   npm run firsttimer -- status
 *   npm run firsttimer -- stop                             # report.md + heatmaps + journal.md, browser closed
 *
 * Every command after `start` takes the session's `--name` (it may be left out while only one session runs);
 * several sessions run at once, each with its own pointer (playtest-reports/.firsttimer/<name>.json) and browser,
 * sharing the pinned build's server. `list` shows them.
 *
 * `act` takes the input DSL (src/input/script.ts): R L U D, J jump, X dash, A attack (cut), O offer, `.`
 * nothing, a number = frames (60 = 1 s), `+` combines (`R+J20`); and a player's other keys in braces: `{Tab}`
 * (the map), `{R}` (back to the last save: from the world start the page is the game; another --room is a test boot, where R restarts that room), `{M}` (sound), `{Esc}`, `{Enter}`; `{Tab}30` holds it 30 frames. Keep a burst to
 * 0.5-4 s. It prints what happened in a player's words, where she is, and the screenshots taken (every `--every`
 * s and at hits, deaths, new rooms, abilities, catches). Files: playtest-reports/<stamp>-firsttimer-<name>/.
 *
 * A first-timer sees what a player sees: the greybox designer labels and room notes are off (every room turns
 * them on again; the session turns them off), and the designer keys (G, F2, the panel) are refused. `--labels`
 * keeps the labels, `--dev` allows those keys: only when the orchestrator asks.
 *
 * `--world <id>` (the Canopy r11, review r10 #7): plays that world (`?world=<id>`) from its start room as the game
 * (`&fresh`, autosave, R = back to its last save); `--room` then defaults to the world's start.
 *
 * It plays a **pinned clean build**: `start` makes a detached git worktree of HEAD (`.scratch/playtest-snap-<sha>`,
 * node_modules linked), checks that its rooms and world load (a broken commit is named, nothing starts), serves it
 * with its own Vite (from `--snap-port` 5193 up) and runs the session's server from it, so other agents'
 * half-edited files never reach a playtest. `--tree` plays the working tree on the dev server (`--url`, 5180).
 */
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import type { RunTrace } from './recorder';
import { alive, pinnedBuild, type Snap } from './snapshot';

// The client commands import nothing of the game (only the server does, from the pinned snapshot): a
// half-edited file in the working tree cannot break a turn.
const DEFAULT_URL = process.env.GAME_URL ?? 'http://localhost:5180';

const [cmd = 'help', ...rest] = process.argv.slice(2);
const { values: args, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    room: { type: 'string' },
    world: { type: 'string' },
    name: { type: 'string' },
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
    build: { type: 'string' },
  },
});

/** The repo the reports belong to (the server runs in the snapshot and is told). */
const ROOT = resolve(args.root ?? '.');
const OUT = join(ROOT, 'playtest-reports');
/** One pointer per session (`--name`): several agents can play at once without crossing wires. */
const SESSIONS = join(OUT, '.firsttimer');

interface Session {
  name: string;
  dir: string;
  port: number;
  pid: number;
  /** The pinned commit it plays ('' with --tree). */
  sha: string;
}

function sessionFile(name: string): string {
  return join(SESSIONS, `${name.replace(/[^\w-]/g, '_')}.json`);
}

/** Live sessions (pointers whose server is still running; dead ones are cleared). */
function sessions(): Session[] {
  if (!existsSync(SESSIONS)) return [];
  const out: Session[] = [];
  for (const f of readdirSync(SESSIONS).filter((n) => n.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(join(SESSIONS, f), 'utf8')) as Session;
    if (alive(s.pid)) out.push(s);
    else rmSync(join(SESSIONS, f), { force: true });
  }
  return out;
}

/** The session a command is for: `--name`, or the only one running. */
function session(): Session {
  const live = sessions();
  if (args.name) {
    const s = live.find((q) => q.name === args.name);
    if (!s) throw new Error(`No session named ${args.name}: npm run firsttimer -- start --name ${args.name}`);
    return s;
  }
  if (live.length === 1 && live[0]) return live[0];
  if (live.length === 0) throw new Error('No session: npm run firsttimer -- start --name <you>');
  throw new Error(
    `${live.length} sessions are running (${live.map((q) => q.name).join(', ')}): add --name <yours>`,
  );
}

async function call(path: string, body: unknown = {}): Promise<string> {
  const s = session();
  const r = await fetch(`http://127.0.0.1:${s.port}/${path}`, { method: 'POST', body: JSON.stringify(body) });
  const out = await r.text();
  if (path === 'stop') rmSync(sessionFile(s.name), { force: true });
  return out;
}

// ---- The server: one browser page, commands one at a time.

async function serve(): Promise<void> {
  const { GAME_WORLD, getWorld } = await import('../../src/scene/world');
  const W = args.world ? getWorld(args.world) : GAME_WORLD;
  const room = args.room ?? W.start;
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
  const base0 = args.url ?? DEFAULT_URL;
  const base = args.world
    ? `${base0}${base0.includes('?') ? '&' : '?'}world=${encodeURIComponent(args.world)}`
    : base0;
  const url = args.abilities
    ? `${base}${base.includes('?') ? '&' : '?'}abilities=${encodeURIComponent(args.abilities)}`
    : base;
  // From the world's start the page is **the game** (no ?room=, ?fresh): it autosaves, and R goes back to the last
  // save as a player's does. A ?room= page is a test boot: the slot is never read or written, and R starts that
  // room over with its own kit (round 4: R in the roots put her in glade 2 with wall jump and a new tally).
  // Each session has its own browser and a new context, so its storage (the slot) is its own: never another's.
  const asGame = room === W.start;
  const gameUrl = asGame ? `${url}${url.includes('?') ? '&' : '?'}fresh` : url;
  const page: Page = await openGame(
    browser,
    gameUrl,
    { width: w, height: h },
    1,
    true,
    asGame ? undefined : room,
  );
  page.setDefaultTimeout(0);
  // A fresh run from the room's start, labels off, its telemetry recorded from the first frame; the game waits.
  await page.evaluate(`(async () => {
    const m = await import('/tools/playtest/live.ts');
    window.__ft = m;
    const g = window.__game;
    g.load();
    g.pause();
    // The key prompts a player sees (the Lamp's cap by the first flame, the glide's, the kick's): ?manual turns them
    // off for captures, and every first-timer before r17 played without them (it learned nothing it was not shown).
    if (window.__prompts) window.__prompts.enabled = true;
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
  // The build it plays, stated once: it never changes during a session (a later session may pin a newer one).
  let build = 'the working tree (--tree: not pinned)';
  if (args.build)
    try {
      const subject = execFileSync('git', ['log', '-1', '--format=%s', args.build], {
        encoding: 'utf8',
      }).trim();
      build = `${args.build} ("${subject}"), pinned for the whole session`;
    } catch {
      build = `${args.build}, pinned for the whole session`;
    }
  // The save it starts from, stated: the slot of this session's own browser (empty: a new game).
  const save0 = (await page.evaluate(
    '(() => { const v = window.__game.save(); return { stored: v.stored, autosave: v.autosave }; })()',
  )) as { stored: unknown; autosave: boolean };
  const saveLine = asGame
    ? `Save: ${save0.stored ? "a slot was there at start (unexpected: this browser is the session's own)" : 'a new game, the slot empty'}; autosave ${save0.autosave ? 'on' : 'OFF'}; R = back to the last save (this session's own).`
    : `Save: none (a test boot in ${room}: the slot is never read or written); R starts ${room} over with its own kit.`;
  appendFileSync(
    journal,
    `# First-timer journal: ${args.name} in ${args.world ? `the world ${args.world}, ` : ''}${room}\n\nBuild: ${build}.\n\n${saveLine}\n\n`,
  );
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
      if (said.includes('restarted')) {
        // What R gave back: the room and what the save holds (so a journal shows where a restart put her).
        const v = (await page.evaluate(
          '(() => { const s = window.__game.state().save; return { patch: s.patch, moths: s.moths, abilities: s.abilities }; })()',
        )) as { patch: { room: string; id: string } | null; moths: number; abilities: string[] };
        said.push(
          `R: back to ${v.patch ? `the moon patch ${v.patch.id} in ${v.patch.room}` : 'the start'} (moths ${v.moths}, owns ${v.abilities.join(', ') || 'nothing'})`,
        );
      }
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
        const sc = W.rooms[room]?.scene;
        if (!sc) continue;
        writeFileSync(join(dir, `heatmap-${room}.png`), drawRoom(sc, trace));
        files.push(`heatmap-${room}.png`);
      }
      const md = reportMarkdown(trace, {
        when: new Date().toISOString().slice(0, 16).replace('T', ' '),
        abilities: null,
        targets: loadTargets(Object.keys(W.rooms), join(ROOT, 'docs/design/regions')),
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

/** HEAD's pinned build, keeping the snapshots that live sessions still play. */
async function snapshot(): Promise<Snap> {
  return pinnedBuild(
    ROOT,
    Number(args['snap-port'] ?? 5193),
    sessions().map((q) => q.sha),
  );
}

/** `validate`: load the rooms and the world as the game does (run inside a snapshot by `start`). */
async function validate(): Promise<void> {
  const { ROOM_IDS } = await import('../../src/scene/index');
  const { GAME_WORLD, validateWorld } = await import('../../src/scene/world');
  const problems = validateWorld(GAME_WORLD);
  console.log(`${ROOM_IDS.length} rooms load; world: ${problems.length ? problems.join('; ') : 'ok'}`);
}

async function start(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(SESSIONS, { recursive: true });
  const name = args.name ?? 'agent';
  if (sessions().some((q) => q.name === name))
    throw new Error(
      `A session named ${name} is running: stop it (--name ${name}) or start with another --name`,
    );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(OUT, `${stamp}-firsttimer-${name.replace(/[^\w-]/g, '_')}`);
  mkdirSync(dir, { recursive: true });
  const snap = args.tree ? null : await snapshot();
  const url = snap ? `http://localhost:${snap.port}` : (args.url ?? DEFAULT_URL);
  const argv = ['tsx', 'tools/playtest/firsttimer.ts', 'serve', '--dir', dir, '--root', ROOT, '--url', url];
  if (args.world) argv.push('--world', args.world);
  if (args.room || !args.world) argv.push('--room', args.room ?? 'wood-hatch');
  argv.push('--name', name, '--size', args.size ?? '1280x720');
  if (args.abilities) argv.push('--abilities', args.abilities);
  if (snap) argv.push('--build', snap.sha);
  if (args.labels) argv.push('--labels');
  if (args.dev) argv.push('--dev');
  const log = join(dir, 'server.log');
  const out = openSync(log, 'a');
  const child = spawn('npx', argv, {
    cwd: snap ? snap.dir : ROOT,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  const ready = join(dir, 'server.json');
  for (let i = 0; i < 900 && !existsSync(ready) && !exited; i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(ready)) {
    const tail = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').slice(-12).join('\n  ') : '';
    throw new Error(
      `The session did not start${snap ? ` (pinned build ${snap.sha})` : ' (with --tree: is the dev server up?)'}:\n  ${tail}`,
    );
  }
  const { port, pid } = JSON.parse(readFileSync(ready, 'utf8')) as { port: number; pid: number };
  writeFileSync(
    sessionFile(name),
    JSON.stringify({ name, dir, port, pid, sha: snap?.sha ?? '' } satisfies Session),
  );
  console.log(`session ${name}: ${relative(ROOT, dir)} (every command: --name ${name})`);
  console.log(await call('look'));
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'serve':
      return serve();
    case 'validate':
      return validate();
    case 'list':
      for (const q of sessions())
        console.log(`${q.name}: ${relative(ROOT, q.dir)} (build ${q.sha || 'working tree'})`);
      return;
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
        'npm run firsttimer -- start --name <you> | act "<keys>" | look | note "<text>" | status | stop | list (all with --name <you>; see tools/playtest/firsttimer.ts)',
      );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
