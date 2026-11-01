// biome-ignore-all lint/suspicious/noExplicitAny: page-side staging reads the live sim untyped
/**
 * The bestiary: every Canopy creature kind in its own room, close up and at play zoom (Canopy r22).
 *
 * For each kind she stands `off` px from it (so it notices her and acts), the sim steps one frame at a time, and a
 * frame is taken each time the creature enters a new mode (`settle` frames into it; a tell `tellAt` frames in), up
 * to `count`. Each frame is taken twice: a close-up (`zoom`, default 2.5x, on the creature's box centre, the middle
 * 960 x 540 of a 1920 x 1080 view) and the play view (the room's own follow zoom, centred between her and it, 1:1
 * pixels of a 1080p screen: what a player sees).
 *
 * Out (default `shots/bestiary/`, `--out <dir>`):
 *  - `<kind>/close-<n>-<mode>.png`, `<kind>/play-<n>-<mode>.png`
 *  - `<kind>.png`: the close-ups in a row of four, then the play views, each labelled with its mode
 *  - `lineup-rest.png`, `lineup-tell.png`: every kind at play zoom (640 x 360 crops at 1:1), at its first frame and at
 *    its tell (or the first hostile mode it showed)
 *
 *   npx tsx tools/bestiary.ts --url http://localhost:5240 [--out shots/bestiary/after] [kind ...]
 *
 * The camera: `__game.cam({x, y, zoom})` is a hard override (src/render/stage.ts), not clamped; x / y are the view
 * centre in world px and zoom is world px -> view px, where the view is 1920 wide at zoom 1 whatever the canvas size.
 * The old version shot a 960 x 540 canvas, so its "2.4x" was 1.2 screen px per world px, and its play frame was zoom
 * 1 instead of the room's camera zone zoom.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const URL = opt('--url') ?? DEFAULT_URL;
const OUT = opt('--out') ?? join('shots', 'bestiary');
const wanted = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

interface Entry {
  room: string;
  /** The creature's id; '' = the first live one of the kind. */
  id: string;
  /** Her feet, from the creature's feet centre (px). */
  off: [number, number];
  /** Close-up zoom (default 2.5). */
  zoom?: number;
  /** Frames to run, and how many frames to take at most. */
  frames?: number;
  count?: number;
  /** Flags to set first (a creature that wakes on one). */
  flags?: string[];
  /** A wall creature: she is put this far across the gap it faces, level with its box centre (`off` is ignored). */
  across?: number;
  /**
   * Staging only: the creature `id` is turned into this kind in the page (its live record, through a wrapped
   * `__enemies.update`; box resized about its feet), to see a kind in a room grade it is not placed in.
   */
  as?: { kind: string; w: number; h: number };
  /** Frames into a tell before it is taken (default 14): late in the tell, its deepest pose. */
  tellAt?: number;
  /** She stands this far ahead of it the way it faces (a walker coming at her; `off` is ignored). */
  ahead?: number;
  /** Put her back where she was put before every frame (she hangs there: a wall creature's level, a bite's reach). */
  hold?: boolean;
}

const ENTRIES: Record<string, Entry> = {
  juvenileBurrback: { room: 'cn-hatch', id: 'juv-hatch', off: [-220, 0] },
  burrback: { room: 'cn-hub', id: 'burr-floor', off: [-200, 0], zoom: 2.2 },
  carrier: { room: 'cn-galleries', id: 'ant-g2', off: [0, 0], ahead: 110, zoom: 3, hold: true },
  bombardier: { room: 'cn-hub', id: 'bomb-bank', off: [-330, 0], frames: 320 },
  jumper: { room: 'cn-galleries', id: 'jump-g1', off: [-260, 0] },
  jumperTrunk: { room: 'cn-trunk', id: 'jump-t3', off: [260, 0], tellAt: 21 },
  jumperCellar: { room: 'cn-cellar', id: 'jump-c', off: [-260, 0], tellAt: 21 },
  jumperBlue: {
    room: 'cn-hub',
    id: 'burr-floor',
    off: [-260, 0],
    tellAt: 21,
    as: { kind: 'jumper', w: 58, h: 42 },
  },
  jumperTeal: {
    room: 'cn-well',
    id: 'burr-gallery',
    off: [-260, 0],
    tellAt: 21,
    as: { kind: 'jumper', w: 58, h: 42 },
  },
  huntsman: { room: 'cn-elder', id: 'hunt-elder-1', off: [0, 0], across: 230, hold: true, frames: 360 },
  huntsmanWell: { room: 'cn-well', id: 'hunt-chimney', off: [0, 0], across: 200, hold: true, frames: 360 },
  lampwing: { room: 'cn-grove', id: 'wing-a', off: [-150, 260], zoom: 2.2 },
  hawker: { room: 'cn-limbs', id: 'hawk-limbs', off: [-150, 300], zoom: 2.2 },
  dangler: { room: 'cn-trunk', id: '', off: [60, 300], zoom: 2.2 },
};

/** Modes that are a creature's tell (the lineup's second sheet shows the first of these it reaches). */
const TELLS = ['windup', 'rear', 'alert', 'curious', 'spit', 'spray', 'charge', 'dive', 'bite', 'drop'];

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr?.toString().slice(-800)}`);
}

/** Tiles `files` (each scaled to w x h, labelled) `cols` across into `out`. */
function sheet(files: string[], labels: string[], cols: number, w: number, h: number, out: string): void {
  if (!files.length) return;
  const rows = Math.ceil(files.length / cols);
  const n = rows * cols;
  const inputs: string[] = [];
  const chains: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i < files.length) {
      inputs.push('-i', files[i] as string);
      const text = (labels[i] ?? '').replace(/[':]/g, ' ');
      chains.push(
        `[${i}:v]scale=${w}:${h},drawtext=text='${text}':x=8:y=8:fontcolor=white:fontsize=20:box=1:boxcolor=black@0.5[v${i}]`,
      );
    } else {
      inputs.push('-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}`);
      chains.push(`[${i}:v]null[v${i}]`);
    }
  }
  const layout = Array.from({ length: n }, (_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join(
    '|',
  );
  const stack = `${Array.from({ length: n }, (_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${layout}[out]`;
  ffmpeg([
    ...inputs,
    '-filter_complex',
    [...chains, stack].join(';'),
    '-map',
    '[out]',
    '-frames:v',
    '1',
    out,
  ]);
}

async function main(): Promise<void> {
  const kinds = wanted.length ? wanted : Object.keys(ENTRIES);
  mkdirSync(OUT, { recursive: true });
  const browser = await launch({ gpu: true });
  try {
    for (const kind of kinds) {
      const E = ENTRIES[kind];
      const simKind = kind.replace(/(Well|Trunk|Cellar|Blue|Teal)$/, '');
      if (!E) throw new Error(`no entry for ${kind}`);
      const page = await openGame(
        browser,
        `${URL}?abilities=all`,
        { width: 1920, height: 1080 },
        1,
        true,
        E.room,
      );
      const dir = join(OUT, kind);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const found = await page.evaluate(
        ([E, kind]) => {
          const g = (window as any).__game;
          for (const f of E.flags ?? []) g.flag(f);
          g.step(2);
          const list = g.enemies().list as any[];
          let e = list.find((q) => (E.id ? q.id === E.id : q.kind === kind && !q.gone));
          if (!e) return null;
          if (E.as) {
            // (The renderer's update gets the live sim view: its `enemies` are the state's records.)
            const en = (window as any).__enemies;
            const orig = en.update.bind(en);
            const as = E.as;
            en.update = (...args: any[]) => {
              const rec = (args[3]?.enemies as any[] | undefined)?.find((q) => q.id === E.id);
              if (rec && rec.kind !== as.kind) {
                const feet = rec.y + rec.h;
                const cx = rec.x + rec.w / 2;
                rec.kind = as.kind;
                rec.w = as.w;
                rec.h = as.h;
                rec.x = Math.round(cx - as.w / 2);
                rec.y = feet - as.h;
                rec.mode = 'sit';
                rec.modeFrames = 0;
              }
              return orig(...args);
            };
            g.render();
            g.step(1);
            e = (g.enemies().list as any[]).find((q) => q.id === E.id);
          }
          (window as any).__bx = e.id;
          const at = E.across
            ? [e.box.x + e.box.w / 2 + e.facing * E.across, e.box.y + e.box.h / 2 + 40]
            : E.ahead
              ? [e.x + e.facing * E.ahead, e.y]
              : [e.x + E.off[0], e.y + E.off[1]];
          (window as any).__bxHold = E.hold ? at : null;
          g.teleport(at[0], at[1]);
          g.step(1);
          return e.id;
        },
        [E, simKind] as const,
      );
      if (!found) {
        console.log(kind, 'not found in', E.room);
        await page.close();
        continue;
      }
      const count = E.count ?? 7;
      const frames = E.frames ?? 240;
      const seen = new Set<string>();
      const close: string[] = [];
      const play: string[] = [];
      const labels: string[] = [];
      for (let f = 0; f < frames && close.length < count; ) {
        // Run to the next frame worth taking: a mode not taken yet, `settle` frames in.
        const at = await page.evaluate(
          ([left, TELLS, tellAt]) => {
            const g = (window as any).__game;
            const id = (window as any).__bx;
            // (No named functions in here: tsx wraps them in a `__name` the page does not have.)
            const quick = (TELLS as string[]).slice(0, 4);
            const taken: string[] = (window as any).__bxTaken ?? [];
            for (let k = 0; k < left; k++) {
              const e = (g.enemies().list as any[]).find((q) => q.id === id);
              if (!e || e.gone) return { f: k, mode: null };
              const first = (window as any).__bxFirst !== true;
              // (A new mode, settled in; or a long stretch with none: one more of the same.)
              const fresh = !taken.includes(e.mode) && e.modeFrames >= (quick.includes(e.mode) ? tellAt : 5);
              if (first || fresh || k >= 75) {
                (window as any).__bxFirst = true;
                taken.push(e.mode);
                (window as any).__bxTaken = taken;
                return { f: k, mode: e.mode as string };
              }
              const hold = (window as any).__bxHold;
              if (hold) g.teleport(hold[0], hold[1]);
              g.step(1);
            }
            return { f: left, mode: null };
          },
          [frames - f, TELLS, E.tellAt ?? 14] as const,
        );
        f += at.f + 1;
        if (!at.mode) break;
        seen.add(at.mode);
        const n = close.length;
        const shoot = async (closeUp: boolean): Promise<string> => {
          await page.evaluate(
            ([closeUp, zoom]) => {
              const g = (window as any).__game;
              const id = (window as any).__bx;
              const e = (g.enemies().list as any[]).find((q) => q.id === id);
              const p = g.state().player;
              if (closeUp) {
                g.cam({ x: e.box.x + e.box.w / 2, y: e.box.y + e.box.h / 2, zoom });
              } else {
                g.cam(null);
                const z = g.cam().follow.zoom;
                g.cam({
                  x: Math.round((e.x + p.x + p.w / 2) / 2),
                  y: Math.round((e.box.y + e.box.h / 2 + p.y + p.h / 2) / 2),
                  zoom: z,
                });
              }
              g.render();
            },
            [closeUp, E.zoom ?? 2.5] as const,
          );
          const file = join(dir, `${closeUp ? 'close' : 'play'}-${n}-${at.mode}.png`);
          // Close-ups: the middle 960 x 540 (a 2x crop of the view). Play: the middle 640 x 360 at 1:1.
          const clip = closeUp
            ? { x: 480, y: 270, width: 960, height: 540 }
            : { x: 640, y: 360, width: 640, height: 360 };
          await page.screenshot({ path: file, clip });
          return file;
        };
        close.push(await shoot(true));
        play.push(await shoot(false));
        labels.push(`${kind} ${at.mode}`);
        await page.evaluate(() => (window as any).__game.step(1));
      }
      console.log(kind, found, [...seen].join(' '));
      await page.close();
      sheet([...close, ...play], [...labels, ...labels], 4, 640, 360, join(OUT, `${kind}.png`));
    }
  } finally {
    await browser.close();
  }
  // The lineups: every kind with frames in OUT (this run's or an earlier one's), in ENTRIES order.
  const rest: { f: string; label: string }[] = [];
  const tell: { f: string; label: string }[] = [];
  for (const kind of Object.keys(ENTRIES)) {
    const dir = join(OUT, kind);
    if (!existsSync(dir)) continue;
    const plays = readdirSync(dir)
      .filter((f) => f.startsWith('play-'))
      .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
    if (!plays.length) continue;
    const mode = (f: string) => f.replace(/^play-\d+-/, '').replace(/\.png$/, '');
    const first = plays[0] as string;
    rest.push({ f: join(dir, first), label: `${kind} ${mode(first)}` });
    const t = plays.find((f) => TELLS.includes(mode(f))) ?? (plays[plays.length - 1] as string);
    tell.push({ f: join(dir, t), label: `${kind} ${mode(t)}` });
  }
  for (const [name, list] of [
    ['lineup-rest.png', rest],
    ['lineup-tell.png', tell],
  ] as const)
    sheet(
      list.map((q) => q.f),
      list.map((q) => q.label),
      3,
      640,
      360,
      join(OUT, name),
    );
  console.log(`sheets in ${OUT}/`);
}

void main();
