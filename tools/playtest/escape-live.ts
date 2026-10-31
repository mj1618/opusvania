/**
 * The Keeper's end and the den's escape played live (the Canopy r14): in a realtime page (GPU), after the Keeper is
 * down (keeper-live.ts plays the fight), she walks to the fallen cage and cuts it open, watches the column, and when
 * the roof gives runs the escape with real keys (tools/playtest/escape-plan.ts, careful: she waits on a rock's grit,
 * seen `lag` frames late) to the clifftop. Reports the frames from the release to the escape's end and to the
 * clifftop, and the hits.
 * Node driver (dev server up): `npx tsx tools/playtest/escape-live.ts --url http://localhost:5212 [--lag 15] [--out dir]`.
 */
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import { EscapePlan } from './escape-plan';
import type { LiveKeeper } from './keeper-live';

const KEYS: Array<[number, string, string]> = [
  [1, 'ArrowLeft', 'ArrowLeft'],
  [2, 'ArrowRight', 'ArrowRight'],
  [4, 'ArrowUp', 'ArrowUp'],
  [8, 'ArrowDown', 'ArrowDown'],
  [16, 'KeyZ', 'z'],
  [64, 'KeyC', 'c'],
];

export interface LiveEscape {
  released: number;
  collapse: number;
  escaped: number;
  out: number;
  hits: string[];
  checkpoints: number;
  log: string[];
}

export function playEscapeLive(lag = 15, seconds = 90): Promise<LiveEscape> {
  const g = (
    window as unknown as {
      __game: {
        state(): GameState;
        scene(): unknown;
        room(): string;
        resume(): void;
        events(n: number): Array<{ type: string; f?: number; what?: string; flag?: string; phase?: string }>;
      };
    }
  ).__game;
  let held = 0;
  const press = (mask: number): void => {
    for (const [bit, code, key] of KEYS) {
      const now = (mask & bit) !== 0;
      const was = (held & bit) !== 0;
      if (now !== was)
        window.dispatchEvent(new KeyboardEvent(now ? 'keydown' : 'keyup', { code, key, bubbles: true }));
    }
    held = mask;
  };
  const start = g.state().frame;
  let last = start;
  const r: LiveEscape = {
    released: -1,
    collapse: -1,
    escaped: -1,
    out: -1,
    hits: [],
    checkpoints: 0,
    log: [],
  };
  let plan: EscapePlan | null = null;
  let prev = 0;
  g.resume();
  return new Promise((resolve) => {
    const tick = (): void => {
      const st = g.state();
      if (st.frame > last) {
        for (const e of g.events(st.frame - last)) {
          const f = e.f ?? st.frame;
          if (e.type === 'flagSet' && e.flag === 'cn-den-freed' && r.released < 0) r.released = f;
          if (e.type === 'flagSet' && e.flag === 'cn-den-collapse' && r.collapse < 0) r.collapse = f;
          if (e.type === 'escapeEnd' && r.escaped < 0) r.escaped = f;
          if (e.type === 'escapeHit') r.hits.push(`${e.what} @${((f - start) / 60).toFixed(1)}s`);
          if (e.type === 'escapeCheckpoint') r.checkpoints++;
          if (e.type === 'rockfall' || e.type === 'collapseFront')
            r.log.push(`${e.type} ${e.phase ?? ''} @${((f - start) / 60).toFixed(1)}s`);
        }
        last = st.frame;
      }
      if (st.room === 'cn-out' && r.out < 0) r.out = st.frame;
      if (r.out >= 0 || st.frame - start > seconds * 60) {
        press(0);
        resolve(r);
        return;
      }
      const p = st.player;
      const px = p.x + p.w / 2;
      let m = 0;
      if (!st.save.flags.includes('cn-den-freed')) {
        // To the fallen cage, up-cuts under it until it is out.
        const cx = st.boss?.cageX ?? 1856;
        const dx = cx - px;
        m = Math.abs(dx) > 40 ? (dx < 0 ? 1 : 2) : prev & 64 ? 0 : 64 | 4;
      } else if (!st.save.flags.includes('cn-den-collapse')) m = 0;
      else {
        plan ??= new EscapePlan(g.scene() as Scene, { careful: true, lag });
        m = plan.act(st);
      }
      prev = m;
      press(m);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// --- The node driver: the den from the balcony, the Keeper (keeper-live.ts), then the release and the escape.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('escape-live.ts')) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const url = arg('url', 'http://localhost:5212');
  const lag = Number(arg('lag', '15'));
  const out = arg('out', '');
  const { launch, openGame } = await import('../lib/browser');
  const browser = await launch({ gpu: true });
  const page = await openGame(
    browser,
    `${url}/?world=canopy&fresh&abilities=wallJump,glide`,
    { width: 1920, height: 1080 },
    1,
    true,
  );
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { goto(id: string, x: number, y: number): unknown } }).__game;
    g.goto('cn-den', 300, 320);
  });
  let shots = 0;
  const timer = out
    ? setInterval(async () => {
        try {
          await page
            .locator('#game')
            .screenshot({ path: `${out}/live-${String(shots++).padStart(3, '0')}.png` });
        } catch {}
      }, 1500)
    : null;
  const k = (await page.evaluate(
    async ([m, lagN]) =>
      (
        (await import(/* @vite-ignore */ m as string)) as {
          playKeeperLive(l: number, s: number): Promise<LiveKeeper>;
        }
      ).playKeeperLive(lagN as number, 420),
    ['/tools/playtest/keeper-live.ts', lag] as const,
  )) as LiveKeeper;
  const sec = (f: number) => (f / 60).toFixed(1);
  console.log(
    `Keeper ${k.won ? 'WON' : 'lost'} live (lag ${lag}): ${sec(k.fight)} s from the first lock, the last try ${sec(k.lastTry)} s (${Object.entries(
      k.phases,
    )
      .map(([n, f]) => `${n} at ${sec(f)} s`)
      .join(
        ', ',
      )}); hits ${k.hurts}, fades ${k.fades}; saved ${k.saved}, eaten ${k.eaten}; glances ${JSON.stringify(k.glances)}`,
  );
  if (k.won) {
    const e = (await page.evaluate(
      async ([m, lagN]) =>
        (
          (await import(/* @vite-ignore */ m as string)) as {
            playEscapeLive(l: number, s: number): Promise<LiveEscape>;
          }
        ).playEscapeLive(lagN as number, 90),
      ['/tools/playtest/escape-live.ts', lag] as const,
    )) as LiveEscape;
    const d = (a: number, b: number) => (a >= 0 && b >= 0 ? `${sec(b - a)} s` : '-');
    console.log(
      `Escape live (lag ${lag}): release -> roof gives ${d(e.released, e.collapse)}, roof -> out of the den ${d(e.collapse, e.escaped)}, release -> clifftop ${d(e.released, e.out)}; checkpoints ${e.checkpoints}; hits ${e.hits.join(', ') || 'none'}`,
    );
  }
  if (timer) clearInterval(timer);
  await browser.close();
}
