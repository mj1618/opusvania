// biome-ignore-all lint/suspicious/noExplicitAny: page-side staging reads the live sim untyped
/**
 * The bestiary: every Canopy creature kind in its own room, close up and at play zoom, side by side (Canopy r22).
 * For each kind: she stands `off` px from it (so it notices her and tells), the camera sits on the creature, and a
 * strip of frames is captured at `zoom` and one at play zoom. One sheet per kind and one lineup of all kinds in
 * shots/bestiary/.
 *
 *   npx tsx tools/bestiary.ts --url http://localhost:5222 [kind ...]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const URL = urlAt >= 0 ? (argv[urlAt + 1] ?? DEFAULT_URL) : DEFAULT_URL;
const wanted = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--url');

interface Entry {
  room: string;
  id: string;
  /** Her feet, from the creature's feet / centre (px). */
  off: [number, number];
  zoom: number;
  /** Frames between pictures, and how many pictures. */
  every: number;
  count: number;
  /** Flags to set first (a creature that wakes on one). */
  flags?: string[];
}

const ENTRIES: Record<string, Entry> = {
  juvenileBurrback: { room: 'cn-grove', id: 'juv-wave-w', off: [-220, 0], zoom: 2.4, every: 10, count: 8 },
  burrback: { room: 'cn-grove', id: 'burr-pit-w', off: [-200, 0], zoom: 2.2, every: 10, count: 8 },
  carrier: { room: 'cn-hub', id: '', off: [-160, 0], zoom: 2.6, every: 8, count: 8 },
  bombardier: { room: 'cn-hub', id: 'bomb-bank', off: [-330, 0], zoom: 2.2, every: 12, count: 8 },
  jumper: { room: 'cn-galleries', id: 'jump-g1', off: [-260, 0], zoom: 2.4, every: 8, count: 8 },
  huntsman: { room: 'cn-elder', id: 'hunt-elder-1', off: [180, 120], zoom: 2.2, every: 10, count: 8 },
  lampwing: { room: 'cn-grove', id: 'wing-a', off: [-150, 260], zoom: 2.2, every: 8, count: 8 },
  hawker: { room: 'cn-limbs', id: 'hawk-limbs', off: [-150, 300], zoom: 2.2, every: 8, count: 8 },
  dangler: { room: 'cn-trunk', id: '', off: [60, 300], zoom: 2.2, every: 10, count: 8 },
};

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr?.toString().slice(-800)}`);
}

async function main(): Promise<void> {
  const kinds = wanted.length ? wanted : Object.keys(ENTRIES);
  const out = join('shots', 'bestiary');
  mkdirSync(out, { recursive: true });
  const browser = await launch({ gpu: true });
  const lineup: string[] = [];
  try {
    for (const kind of kinds) {
      const E = ENTRIES[kind];
      if (!E) throw new Error(`no entry for ${kind}`);
      const page = await openGame(
        browser,
        `${URL}?abilities=all`,
        { width: 960, height: 540 },
        1,
        true,
        E.room,
      );
      const dir = join(out, kind);
      mkdirSync(dir, { recursive: true });
      const found = await page.evaluate(
        ([E, kind]) => {
          const g = (window as any).__game;
          for (const f of E.flags ?? []) g.flag(f);
          g.step(2);
          const list = g.enemies().list as any[];
          const e = list.find((q) => (E.id ? q.id === E.id : q.kind === kind && !q.gone));
          if (!e) return null;
          (window as any).__bx = { id: e.id, x: e.x, y: e.y };
          g.teleport(e.x + E.off[0], e.y + E.off[1]);
          g.step(1);
          return e.id;
        },
        [E, kind] as const,
      );
      if (!found) {
        console.log(kind, 'not found in', E.room);
        await page.close();
        continue;
      }
      const shots: string[] = [];
      for (let k = 0; k < E.count; k++) {
        const zoom = k === E.count - 1 ? 1 : E.zoom;
        await page.evaluate(
          ([every, zoom]) => {
            const g = (window as any).__game;
            const id = (window as any).__bx.id;
            g.step(every);
            const e = (g.enemies().list as any[]).find((q) => q.id === id);
            const p = g.state().player;
            const cx = zoom === 1 ? (e.x + p.x + p.w / 2) / 2 : e.x;
            g.cam({ x: Math.round(cx), y: Math.round(e.y - 30), zoom });
            g.render();
          },
          [E.every, zoom] as const,
        );
        const f = join(dir, `${k}.png`);
        writeFileSync(f, await page.locator('#game').screenshot({ type: 'png' }));
        shots.push(f);
      }
      const modes = await page.evaluate(() => {
        const g = (window as any).__game;
        return (g.events(400) as any[])
          .filter((q) => q.type.startsWith('enemy') || q.type === 'hurt' || q.type.startsWith('shot'))
          .map((q) => `${q.f}:${q.type}`)
          .slice(-12)
          .join(' ');
      });
      console.log(kind, found, modes);
      await page.close();
      const sheet = join(out, `${kind}.png`);
      ffmpeg([
        '-pattern_type',
        'glob',
        '-i',
        join(dir, '*.png'),
        '-vf',
        `scale=480:-1,drawtext=text='${kind}':x=6:y=6:fontcolor=white:fontsize=18,tile=4x2`,
        '-frames:v',
        '1',
        sheet,
      ]);
      lineup.push(join(dir, '1.png'), join(dir, `${E.count - 1}.png`));
    }
  } finally {
    await browser.close();
  }
  console.log(`sheets in ${out}/`);
}

void main();
