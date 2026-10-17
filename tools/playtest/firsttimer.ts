/**
 * The first-timer agent's controller: a Claude sub-agent plays the game in the page with real keys, a
 * short burst at a time, looks at screenshots, and writes down what it understood. One command per turn;
 * a small server keeps the browser between commands (memory/playtest-harness.md "First-timer agent").
 *
 *   npm run firsttimer -- start [--room wood-hatch] [--name s1] [--abilities glide] [--size 1280x720]
 *   npm run firsttimer -- act "R60 R+J20 .30" [--every 2]   # real keys in real time, then the game pauses
 *   npm run firsttimer -- look                             # a screenshot now (the game stays paused)
 *   npm run firsttimer -- note "I think the moths want me to follow them" [--mood lost|unfair|fun|stuck|ok]
 *   npm run firsttimer -- status
 *   npm run firsttimer -- stop                             # report.md + heatmaps + journal.md, browser closed
 *
 * `act` takes the input DSL (src/input/script.ts): R L U D, J jump, X dash, A attack (cut), O offer, `.`
 * nothing, a number = frames (60 = 1 s), `+` combines (`R+J20`); keep a burst to 0.5-4 s. It prints what
 * happened in a player's words, where she is, and the screenshots taken (every `--every` s and at hits,
 * deaths, new rooms, abilities, catches). The session's files are in playtest-reports/<stamp>-firsttimer-<name>/.
 * Needs the dev server (npm run dev, port 5180): the page loads /tools/playtest/live.ts from it.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { GAME_WORLD } from '../../src/scene/world';
import { DEFAULT_URL, launch, openGame } from '../lib/browser';
import { drawRoom } from './heatmap';
import type { RunTrace } from './recorder';
import { reportMarkdown } from './report';
import { loadTargets } from './targets';

const OUT = resolve('playtest-reports');
const POINTER = join(OUT, '.firsttimer.json');

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
  },
});

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
  // A fresh run from the room's start, its telemetry recorded from the first frame; the game waits.
  await page.evaluate(`(async () => {
    const m = await import('/tools/playtest/live.ts');
    window.__ft = m;
    const g = window.__game;
    g.load();
    g.pause();
    m.record(${JSON.stringify(args.name ?? 'agent')});
  })()`);
  let shot = 0;
  const snap = async (why: string): Promise<string> => {
    shot++;
    const file = join(
      shotsDir,
      `${String(shot).padStart(4, '0')}-${why.replace(/[^\w]+/g, '-').slice(0, 40)}.png`,
    );
    await page.locator('#game').screenshot({ path: file });
    return relative(process.cwd(), file);
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
      const file = await snap('look');
      last = file;
      return `${where(s)}\nscreenshot: ${file}`;
    },
    async status() {
      return where(await summary());
    },
    async act(b) {
      const script = b.script ?? '';
      const every = Math.max(0.5, Number(b.every ?? 2)) * 1000;
      await page.evaluate(`window.__ft.burst(${JSON.stringify(script)})`);
      const said: string[] = [];
      const files: string[] = [];
      let lastShot = Date.now();
      for (;;) {
        await page.waitForTimeout(150);
        const st = (await page.evaluate('window.__ft.burstStatus()')) as {
          done: boolean;
          frames: number;
          said: string[];
        };
        for (const w of st.said) {
          said.push(w);
          // A moment worth a picture.
          if (/hit|faded|fell|came into|gained|caught|killed|rested|put out/.test(w))
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
        `- _act_ \`${script}\`: ${said.join('; ') || 'nothing of note'}. Now: ${where(s)}. ![](${relative(dir, join(process.cwd(), last))})\n`,
      );
      return `${said.length ? `what happened: ${said.join('; ')}` : 'nothing of note happened'}\nnow: ${where(s)}\nscreenshots: ${files.join(', ')}`;
    },
    async note(b) {
      const s = await summary();
      const mood = b.mood ? ` **[${b.mood}]**` : '';
      appendFileSync(
        journal,
        `- **${s.time}, ${s.title}** (x ${s.x}, y ${s.y})${mood}: ${b.text ?? ''}${last ? ` (seen in ${relative(dir, join(process.cwd(), last))})` : ''}\n`,
      );
      return 'noted';
    },
    async stop() {
      const trace = (await page.evaluate('window.__ft.stop()')) as RunTrace | null;
      await browser.close();
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
        targets: loadTargets(Object.keys(GAME_WORLD.rooms)),
        files,
        command: 'npm run firsttimer',
        lostAfter: 10,
      });
      writeFileSync(join(dir, 'report.md'), `${md}\n\nThe agent's own words: journal.md.\n`);
      setTimeout(() => process.exit(0), 50);
      return `report: ${relative(process.cwd(), join(dir, 'report.md'))}\njournal: ${relative(process.cwd(), journal)}`;
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

async function start(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(OUT, `${stamp}-firsttimer-${(args.name ?? 'agent').replace(/[^\w-]/g, '_')}`);
  mkdirSync(dir, { recursive: true });
  const argv = [
    'tsx',
    'tools/playtest/firsttimer.ts',
    'serve',
    '--dir',
    dir,
    '--room',
    args.room ?? 'wood-hatch',
  ];
  argv.push(
    '--name',
    args.name ?? 'agent',
    '--size',
    args.size ?? '1280x720',
    '--url',
    args.url ?? DEFAULT_URL,
  );
  if (args.abilities) argv.push('--abilities', args.abilities);
  const child = spawn('npx', argv, { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
  child.unref();
  const ready = join(dir, 'server.json');
  for (let i = 0; i < 600 && !existsSync(ready); i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(ready)) throw new Error('The session did not start (is the dev server up? npm run dev)');
  const { port, pid } = JSON.parse(readFileSync(ready, 'utf8')) as { port: number; pid: number };
  writeFileSync(POINTER, JSON.stringify({ dir, port, pid } satisfies Session));
  console.log(`session: ${relative(process.cwd(), dir)}`);
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
