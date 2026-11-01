// biome-ignore-all lint/suspicious/noExplicitAny: page-side staging reads and pokes the live sim untyped
/**
 * The huntsman staged and captured closed-loop in a painted room (memory/enemies-render.md "Staging and capture"): each
 * frame the page reads the sim, a small policy picks her input, one step, one picture. Frames go to
 * shots/hunt/<scene>/, a contact sheet beside them, an mp4 in clips/hunt-<scene>.mp4.
 *
 *   npx tsx tools/hunt-capture.ts --url http://localhost:5234 [scuttle|climb|punish|kill|all]
 *
 * Scenes (the Elder's root room, cn-elder):
 *  - scuttle: hunt-elder-1 alone on its face (she is far off), close up: the bursts and pauses.
 *  - climb: a wall-jump climb up the east face past it (kick 6 frames after each touch): the tell, the lunge.
 *  - punish: it is moved low on its face (staging) so it is level with her on the floor; she cuts as the lunge comes:
 *    batted out of the air, it lies open on its back.
 *  - kill: as punish, then three cuts while it lies there: knocked along the blow, on its back, legs curl, it fades.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const URL = urlAt >= 0 ? (argv[urlAt + 1] ?? DEFAULT_URL) : DEFAULT_URL;
const wanted = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--url');
const scenes =
  wanted.length === 0 || wanted.includes('all') ? ['scuttle', 'climb', 'punish', 'kill'] : wanted;

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr?.toString().slice(-800)}`);
}

interface Setup {
  /** Where she starts (feet), the camera (x, y, zoom), frames to record, the policy name. */
  at: [number, number];
  cam: [number, number, number];
  frames: number;
  policy: string;
  /** Staging: the huntsman's box centre y and its stretch (fromY, span), set on the live record. */
  stage?: { cy: number; fromY: number; span: number };
  /** Contact sheet: every n-th frame. */
  every: number;
}

const SCENES: Record<string, Setup> = {
  scuttle: { at: [2300, 2496], cam: [800, 2210, 2.6], frames: 240, policy: 'idle', every: 8 },
  climb: { at: [1040, 2496], cam: [960, 2150, 1.25], frames: 200, policy: 'climbE', every: 5 },
  punish: {
    at: [1010, 2496],
    cam: [930, 2400, 2],
    frames: 150,
    policy: 'deflect',
    stage: { cy: 2440, fromY: 2440, span: 0 },
    every: 4,
  },
  kill: {
    at: [1010, 2496],
    cam: [930, 2420, 1.8],
    frames: 300,
    policy: 'deflectKill',
    stage: { cy: 2440, fromY: 2440, span: 0 },
    every: 6,
  },
};

async function main(): Promise<void> {
  const browser = await launch({ gpu: true });
  try {
    for (const name of scenes) {
      const S = SCENES[name];
      if (!S) throw new Error(`no scene ${name}`);
      const page = await openGame(
        browser,
        `${URL}?abilities=all`,
        { width: 960, height: 540 },
        1,
        true,
        'cn-elder',
      );
      const out = join('shots', 'hunt', name);
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      await page.evaluate(
        ([S]) => {
          const g = (window as unknown as { __game: any }).__game;
          const w = window as unknown as Record<string, any>;
          // The live sim, from the enemy renderer's update (memory/enemies-render.md: staging).
          const r = w.__enemies;
          const orig = r.update.bind(r);
          r.update = (dt: number, clock: number, cam: unknown, sim: unknown) => {
            w.__sim = sim;
            return orig(dt, clock, cam, sim);
          };
          g.teleport(S.at[0], S.at[1]);
          g.cam({ x: S.cam[0], y: S.cam[1], zoom: S.cam[2] });
          g.step(2);
          const hi = (w.__sim.enemies as any[]).findIndex((e) => e.id === 'hunt-elder-1');
          w.__hi = hi;
          if (S.stage) {
            const e = w.__sim.enemies[hi];
            e.y = Math.round(S.stage.cy - e.h / 2);
            e.fromY = S.stage.fromY;
            e.span = S.stage.span;
            e.strikeCd = 30;
            e.mode = 'pause';
            e.timer = 10;
          }
          w.__pol = { touch: -1, prev: '', f: 0, cuts: 0, lastCut: -99 };
        },
        [S] as const,
      );
      for (let i = 0; i < S.frames; i++) {
        await page.evaluate(
          ([policy]) => {
            const g = (window as unknown as { __game: any }).__game;
            const w = window as unknown as Record<string, any>;
            const st = g.state();
            const p = st.player;
            const e = st.enemies[w.__hi];
            const P = w.__pol;
            let tok = '.';
            if (policy === 'climbE') {
              if (P.f < 10) tok = '.';
              else if (P.f < 34) tok = 'R+J';
              else if (!p.grounded && (p.mode === 'wallSlide' || p.wallDir === 1)) {
                if (P.touch < 0) P.touch = P.f;
                tok = P.f - P.touch >= 6 && !P.prev.includes('J') ? 'R+J' : 'R';
                if (tok === 'R+J') P.touch = -1;
              } else {
                P.touch = -1;
                tok = 'R';
              }
            } else if (policy === 'deflect' || policy === 'deflectKill') {
              const gap = p.x - (e.x + e.w);
              if (e.mode === 'charge' && gap < 70 && !P.prev.includes('A')) tok = 'A';
              else if (policy === 'deflectKill' && (e.mode === 'recover' || e.mode === 'hurt') && e.landed) {
                // Walk up to it and cut, facing it.
                const dx = e.x + e.w / 2 - (p.x + p.w / 2);
                const dir = dx < 0 ? 'L' : 'R';
                if (Math.abs(dx) > 70) tok = dir;
                else if (P.f - P.lastCut > 20) {
                  tok = `${dir}+A`;
                  P.lastCut = P.f;
                } else tok = '.';
              } else if (P.f < 2) tok = 'L';
            }
            P.prev = tok;
            P.f++;
            g.input(`${tok}1`);
            g.step(1);
          },
          [S.policy] as const,
        );
        const png = await page.locator('#game').screenshot({ type: 'png' });
        writeFileSync(join(out, `${String(i).padStart(4, '0')}.png`), png);
      }
      const log = await page.evaluate(() => {
        const g = (window as unknown as { __game: any }).__game;
        return (g.events(400) as Array<{ type: string; f: number; kind?: string }>)
          .filter((q) => q.type.startsWith('enemy') || q.type === 'hurt' || q.type === 'slashHit')
          .map((q) => `${q.f} ${q.type}`)
          .join(', ');
      });
      console.log(name, log);
      await page.close();
      // A contact sheet (every n-th frame, 6 across) and an mp4.
      ffmpeg([
        '-i',
        join(out, '%04d.png'),
        '-vf',
        `select='not(mod(n\\,${S.every}))',scale=480:-1,tile=6x5`,
        '-frames:v',
        '1',
        join(out, 'sheet.png'),
      ]);
      mkdirSync('clips', { recursive: true });
      ffmpeg([
        '-framerate',
        '60',
        '-i',
        join(out, '%04d.png'),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '16',
        join('clips', `hunt-${name}.mp4`),
      ]);
      console.log(`  ${out}/sheet.png, clips/hunt-${name}.mp4`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
