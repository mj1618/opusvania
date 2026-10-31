/**
 * The Keeper played live (the Canopy r13): in a realtime page (GPU), the den's fight controller (fight.ts `the den`)
 * plays with real keys (one rAF loop dispatching KeyboardEvents, as weaver-bot's `playLive`), deciding from the state
 * `lag` frames ago (a person's reaction: what they see is that old by the time their hands move). Reports the fight's
 * time from the lock, its phases, hits and fades, and the moths. Run in the page:
 *   eval "(async () => (await import('/tools/playtest/keeper-live.ts')).playKeeperLive(15, 360))()"
 * Node driver (dev server up): `npx tsx tools/playtest/keeper-live.ts --url http://localhost:5212 [--lag 15]`.
 */
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import { fightTactics } from './fight';
import type { Line } from './lines';

const KEYS: Array<[number, string, string]> = [
  [1, 'ArrowLeft', 'ArrowLeft'],
  [2, 'ArrowRight', 'ArrowRight'],
  [4, 'ArrowUp', 'ArrowUp'],
  [8, 'ArrowDown', 'ArrowDown'],
  [16, 'KeyZ', 'z'],
  [64, 'KeyC', 'c'],
];

export interface LiveKeeper {
  won: boolean;
  frames: number;
  fight: number;
  /** The winning (last) try, from its lock. */
  lastTry: number;
  phases: Record<string, number>;
  hurts: number;
  fades: number;
  saved: number;
  eaten: number;
  glances: Record<string, number>;
  log: string[];
}

export function playKeeperLive(lag = 15, seconds = 360): Promise<LiveKeeper> {
  const g = (
    window as unknown as {
      __game: {
        state(): GameState;
        scene(): unknown;
        resume(): void;
        events(n: number): Array<{ type: string; phase?: number; why?: string; f?: number }>;
      };
    }
  ).__game;
  const scene = g.scene() as Scene;
  const i = (scene.enemies ?? []).findIndex((e) => e.id === 'old-burr');
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
  const seen: GameState[] = [];
  let last = g.state().frame;
  const start = last;
  let lock = -1;
  let lastLock = -1;
  let hurts = 0;
  let fades = 0;
  const phases: Record<string, number> = {};
  const glances: Record<string, number> = {};
  const log: string[] = [];
  let line: Line | null = null;
  let k = 0;
  let prev = 0;
  g.resume();
  return new Promise((resolve) => {
    const tick = (): void => {
      const st = g.state();
      if (st.frame > last) {
        for (const e of g.events(st.frame - last)) {
          if (e.type === 'bossLock') {
            if (lock < 0) lock = e.f ?? st.frame;
            lastLock = e.f ?? st.frame;
          }
          if (e.type === 'hurt') hurts++;
          if (e.type === 'fade') {
            fades++;
            log.push(
              `fade in P${st.boss?.phase ?? 0} @${((st.frame - (lock < 0 ? start : lock)) / 60).toFixed(1)}s`,
            );
          }
          if (e.type === 'bossPhase') phases[`P${e.phase}`] = (e.f ?? st.frame) - lastLock;
          if (e.type === 'keeperGlance') glances[e.why ?? '?'] = (glances[e.why ?? '?'] ?? 0) + 1;
        }
        // (One snapshot a sim frame: her eyes see the one `lag` frames old.)
        for (let n = last; n < st.frame; n++) seen.push(st);
        while (seen.length > lag + 1) seen.shift();
        last = st.frame;
      }
      const b = st.boss;
      const done = b?.stage === 'end' || b?.stage === 'down' || st.frame - start > seconds * 60;
      if (done) {
        press(0);
        resolve({
          won: b?.stage === 'end' || b?.stage === 'down',
          frames: st.frame - start,
          fight: lock >= 0 ? st.frame - lock : -1,
          lastTry: lastLock >= 0 ? st.frame - lastLock : -1,
          phases,
          hurts,
          fades,
          saved: b?.saved ?? 0,
          eaten: b?.eaten ?? 0,
          glances,
          log,
        });
        return;
      }
      const view = seen[0] ?? st;
      const p = view.player;
      let m = 0;
      // Off the balcony (or re-formed there): east and down into the arena.
      if (p.y + p.h < 1100 && view.boss?.stage === 'wait') {
        m = 2;
        line = null;
      } else {
        if (!line || k > 900) {
          line =
            fightTactics(scene, i, 1, lag)
              .find((q) => q.name === 'the den')
              ?.make() ?? null;
          k = 0;
        }
        m = line ? line.act(view, k++, prev) : 0;
      }
      prev = m;
      press(m);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// --- The node driver: a GPU page on the dev server, the den from the balcony, the fight played live.
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('keeper-live.ts')) {
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
      }, 2500)
    : null;
  // (The module as the page's Vite serves it: a path string, so tsc does not resolve it.)
  const mod = '/tools/playtest/keeper-live.ts';
  const r = (await page.evaluate(
    async ([m, lagN]) =>
      (
        (await import(/* @vite-ignore */ m as string)) as {
          playKeeperLive(l: number, s: number): Promise<LiveKeeper>;
        }
      ).playKeeperLive(lagN as number, 420),
    [mod, lag] as const,
  )) as LiveKeeper;
  if (timer) clearInterval(timer);
  const sec = (f: number) => (f / 60).toFixed(1);
  console.log(
    `${r.won ? 'WON' : 'lost'} live (lag ${lag}): ${sec(r.fight)} s from the first lock, the last try ${sec(r.lastTry)} s (${Object.entries(
      r.phases,
    )
      .map(([n, f]) => `${n} at ${sec(f)} s`)
      .join(
        ', ',
      )}); hits ${r.hurts}, fades ${r.fades}; saved ${r.saved}, eaten ${r.eaten}; glances ${JSON.stringify(r.glances)}; ${r.log.join('; ')}`,
  );
  await browser.close();
}
