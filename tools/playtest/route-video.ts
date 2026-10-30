/**
 * A whole area played start to finish as ONE deterministic input tape, for a review video (the Canopy first).
 *
 *   npx tsx tools/playtest/route-video.ts plan [--out dir]        # headless: legs -> tape.txt + legs.json
 *   npx tsx tools/playtest/route-video.ts render --out dir [--url http://localhost:5230]   # raw.mp4, then finish
 *   npx tsx tools/playtest/route-video.ts finish --out dir    # captions (.ass) burnt in -> <name>.mp4, chapters.md
 *
 * `plan` drives the `Game` (the page's harness, world `canopy`, fresh save from cn-hatch) leg by leg: each leg is a
 * goal (an exit, a find, an ability, a flag) reached by the explorer (tools/solve/explore.ts: moves in the real sim,
 * **creatures in**, lamps as they are, her glow as it is), so the found tape is exactly what the Game then plays.
 * When no line avoids a creature, or the leg says so, she fights (tools/playtest/fight.ts: the look-ahead tactics;
 * the old burrback by the den's plan). Between macros a smoothing pass drops the explorer's settle stops where the
 * next move still lands on the same node. `render` replays the tape in the page (follow camera, zoom 1, pickups and
 * HUD on), one picture per 2 sim frames (30 fps, real time), skips long still stretches, and burns the room name in
 * a corner (ffmpeg + an .srt), then writes chapters.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Game } from '../../src/game';
import { parseInputScript } from '../../src/input/script';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { type ExploreNode, explore, feet, glideClimbMacros, pathTo } from '../solve/explore';
import { fightScore, fightTactics, hostile } from './fight';
import type { Line } from './lines';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'playtest-reports/canopy-video' },
    url: { type: 'string', default: 'http://localhost:5230' },
    upto: { type: 'string' },
    from: { type: 'string' },
    size: { type: 'string', default: '1280x720' },
    still: { type: 'string', default: '90' },
    frames: { type: 'string' },
    name: { type: 'string', default: 'canopy-playthrough' },
    crf: { type: 'string', default: '25' },
  },
});

const WORLD = 'canopy';
const START = 'cn-hatch';
const tuning = cloneTuning(defaultTuning);
const world = getWorld(WORLD);

// ---- the route

type Leg =
  | { name: string; kind: 'exit'; exit: string; max?: number }
  | { name: string; kind: 'goal'; test: (s: GameState) => boolean; max?: number }
  | { name: string; kind: 'fight'; ids: string[]; seconds?: number }
  | { name: string; kind: 'script'; script: string }
  | { name: string; kind: 'settle' };

const taken = (id: string) => (s: GameState) => s.save.taken.includes(id);
/** A pickup of the room she is in has been touched (its timer runs: woken, flying to her or taken). */
const picked = (room: string, id: string) => {
  const k = (getRoom(room).pickups ?? []).findIndex((p) => p.id === id);
  return (s: GameState) => s.room === room && (s.pickups.timers[k] ?? 0) !== 0;
};
const owns = (a: string) => (s: GameState) => (s.save.abilities as readonly string[]).includes(a);
const flag = (f: string) => (s: GameState) => s.save.flags.includes(f);
const near =
  (x: number, y: number, r = 120) =>
  (s: GameState) => {
    const f = feet(s);
    return Math.abs(f.x - x) < r && Math.abs(f.y - y) < 60;
  };
const broken = (id: string, sc: () => GameState) => {
  void sc;
  return (s: GameState) => s.save.opened.includes(id) || s.save.opened.some((o) => o.endsWith(`:${id}`));
};

export const ROUTE: Leg[] = [
  // The hatch: the cocoon listens after the fade up; three presses break it.
  { name: 'cn-hatch: the hatching', kind: 'script', script: '.170 J2 .10 J2 .10 J2 .10 J2 .90' },
  { name: 'cn-hatch: down to the drop', kind: 'exit', exit: 'drop', max: 12000 },
  // The Crossing, first time: the rotten bank wall and its hidden hollow (a secret), then west and low.
  { name: 'cn-hub: break the bank wall', kind: 'goal', test: picked('cn-hub', 'bank-great'), max: 8000 },
  { name: 'cn-hub: to the fallen giant', kind: 'exit', exit: 'trunk', max: 8000 },
  { name: 'cn-trunk: the seed in the roof', kind: 'goal', test: flag('seeds:1'), max: 9000 },
  { name: 'cn-trunk: down to the well', kind: 'exit', exit: 'well', max: 9000 },
  { name: 'cn-well: the claws at the bottom', kind: 'goal', test: owns('wallJump'), max: 9000 },
  {
    name: 'cn-well: up the shaft',
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && feet(s).y <= 1160 && feet(s).y > 900,
    max: 9000,
  },
  {
    name: 'cn-well: the ambush',
    kind: 'fight',
    ids: ['burr-am-1', 'burr-am-2', 'wing-am', 'juv-am'],
    seconds: 120,
  },
  { name: 'cn-well: out by the claw face', kind: 'exit', exit: 'limbs', max: 9000 },
  { name: 'cn-limbs: back to the Crossing', kind: 'exit', exit: 'hub', max: 9000 },
  {
    name: 'cn-hub: the rotten floor and the moth-stone',
    kind: 'goal',
    test: taken('cn-hub:stone-heart'),
    max: 9000,
  },
  { name: 'cn-hub: east to the fork', kind: 'exit', exit: 'fork', max: 9000 },
  { name: 'cn-fork: the claw climb to the Grove', kind: 'exit', exit: 'grove', max: 9000 },
  { name: 'cn-grove: the keen hollow', kind: 'goal', test: flag('upgrade:keenBlade'), max: 9000 },
  { name: 'cn-grove: the seed', kind: 'goal', test: flag('seeds:2'), max: 9000 },
  { name: 'cn-grove: down the rotten pit floor', kind: 'exit', exit: 'hollowroot', max: 9000 },
  {
    name: 'cn-hollowroot: the quick-wings hollow',
    kind: 'goal',
    test: flag('upgrade:quickWings'),
    max: 9000,
  },
  { name: 'cn-hollowroot: back up', kind: 'exit', exit: 'grove', max: 9000 },
  { name: 'cn-grove: on to the Spire', kind: 'exit', exit: 'spire', max: 9000 },
  { name: 'cn-spire: the climb', kind: 'exit', exit: 'bower', max: 9000 },
  { name: 'cn-bower: up the east wall to the attic', kind: 'exit', exit: 'attic', max: 9000 },
  { name: 'cn-attic: the long-breath hollow', kind: 'goal', test: flag('upgrade:longBreath'), max: 9000 },
  { name: 'cn-attic: back down', kind: 'exit', exit: 'bower', max: 9000 },
  { name: 'cn-bower: up to the crown', kind: 'exit', exit: 'crown', max: 9000 },
  { name: 'cn-crown: the glide', kind: 'goal', test: owns('glide'), max: 9000 },
  { name: 'cn-crown: back down', kind: 'exit', exit: 'bower', max: 9000 },
  { name: 'cn-bower: west to the gap', kind: 'exit', exit: 'gap', max: 9000 },
  { name: 'cn-gap: the far seed', kind: 'goal', test: flag('seeds:3'), max: 9000 },
  { name: 'cn-gap: up to the sky room', kind: 'exit', exit: 'sky', max: 9000 },
  { name: 'cn-sky: the night-eyes hollow', kind: 'goal', test: flag('upgrade:nightEyes'), max: 9000 },
  { name: 'cn-sky: back down', kind: 'exit', exit: 'gap', max: 9000 },
  { name: 'cn-gap: the drop into the Crossing', kind: 'exit', exit: 'hub', max: 9000 },
  { name: 'cn-hub: the seed door', kind: 'exit', exit: 'door', max: 9000 },
  { name: 'cn-tunnel: the root tunnel', kind: 'exit', exit: 'den', max: 9000 },
  {
    name: 'cn-den: down into the arena',
    kind: 'goal',
    test: (s) => s.room === 'cn-den' && feet(s).y >= 1270 && feet(s).x > 700,
    max: 9000,
  },
  { name: 'cn-den: the old burrback', kind: 'fight', ids: ['old-burr'], seconds: 300 },
  { name: 'cn-den: out', kind: 'exit', exit: 'out', max: 9000 },
  { name: 'cn-out: the rotten wall to the ledge', kind: 'exit', exit: 'ledge', max: 9000 },
  { name: 'cn-ledge: the hoard', kind: 'goal', test: picked('cn-ledge', 'ledge-great'), max: 9000 },
  { name: 'cn-ledge: back out', kind: 'exit', exit: 'out', max: 9000 },
  { name: 'cn-out: the way on', kind: 'goal', test: flag('cn-area-end'), max: 9000 },
  { name: 'end: hold', kind: 'script', script: '.240' },
];
void near;
void broken;

// ---- the driver

interface LegLog {
  name: string;
  room: string;
  start: number;
  end: number;
  ok: boolean;
  note: string;
}

class Driver {
  game: Game;
  tape: number[] = [];
  /** Per frame: the room and events worth a chapter line. */
  rooms: string[] = [];
  events: Array<{ f: number; e: SimEvent }> = [];
  log: LegLog[] = [];
  private last: readonly SimEvent[] = [];

  constructor() {
    this.game = new Game(tuning, getRoom(START), 1, () => 0, null, { world });
    this.game.mode = 'manual';
    this.game.afterStep.add((ev) => {
      this.last = ev;
    });
  }

  get s(): GameState {
    return this.game.state;
  }

  push(m: number): readonly SimEvent[] {
    this.tape.push(m);
    this.game.queueInput([m]);
    this.game.stepOnce();
    this.rooms.push(this.game.state.room);
    for (const e of this.last) if (KEEP.has(e.type)) this.events.push({ f: this.tape.length, e });
    return this.last;
  }

  play(tape: readonly number[]): void {
    for (const m of tape) this.push(m);
  }

  settle(max = 180): void {
    for (let i = 0; i < max; i++) {
      const p = this.s.player;
      if (p.grounded && p.hitstop === 0 && p.contactFrames >= 2 && Math.abs(p.vx) < 1 && p.fling < 0) return;
      this.push(0);
    }
  }

  /** The explorer from where she stands to an exit or a goal; null if no line (creatures in) gets there. */
  search(goalExit: string | undefined, goal: ((s: GameState) => boolean) | undefined, max: number) {
    const a = this.search1(goalExit, goal, max, 'time');
    if (a.tape) return a;
    const b = this.search1(goalExit, goal, max, 'moves');
    return { ...b, nodes: a.nodes + b.nodes };
  }

  search1(
    goalExit: string | undefined,
    goal: ((s: GameState) => boolean) | undefined,
    max: number,
    order: 'time' | 'moves',
  ) {
    const s0 = cloneState(this.s);
    const res = explore({
      scene: this.game.scene,
      tuning,
      start: [s0],
      world,
      maxNodes: max,
      keepLamps: false,
      glow: null,
      creatures: true,
      order,
      more: glideClimbMacros(),
      ...(goalExit ? { goalExit } : {}),
      ...(goal ? { goal } : {}),
    });
    if (goalExit) {
      const x = res.exits.get(goalExit);
      if (!x) return { tape: null, nodes: res.nodes.size, truncated: res.truncated };
      return {
        tape: [...pathTo(res, x.from).tape, ...x.tape],
        nodes: res.nodes.size,
        truncated: res.truncated,
      };
    }
    let best: ExploreNode | null = null;
    for (const n of res.nodes.values()) if (goal?.(n.state) && (!best || n.frames < best.frames)) best = n;
    if (!best) return { tape: null, nodes: res.nodes.size, truncated: res.truncated };
    return { tape: pathTo(res, best).tape, nodes: res.nodes.size, truncated: res.truncated };
  }

  /** Fight creature ids (or the nearest hostile) until they are down or `frames` pass. */
  fight(ids: string[] | null, frames: number): string {
    let line: Line | null = null;
    let k = 0;
    let name = '';
    let prev = 0;
    let fi = -1;
    const t0 = this.tape.length;
    let hurts = 0;
    let approachFails = 0;
    while (this.tape.length - t0 < frames) {
      const s = this.s;
      const i = this.pickFoe(ids);
      if (i < 0) return `down in ${((this.tape.length - t0) / 60).toFixed(1)} s, ${hurts} hits taken`;
      const e = s.enemies[i] as GameState['enemies'][number];
      const boss = (e.kind as string) === 'oldBurrback';
      const f = feet(s);
      const dx = Math.abs(e.x + e.w / 2 - f.x);
      const dy = e.y + e.h - f.y;
      const flyer = (e.kind as string) === 'lampwing';
      const far = dx > 480 || (flyer ? dy > 120 || dy < -700 : Math.abs(dy) > 200);
      if (!boss && far && approachFails < 3 && s.player.grounded) {
        // Out of reach: walk there (the explorer, creatures in), a few seconds at a time (it moves).
        const id = e.id;
        const goal = (q: GameState) => {
          const x = q.enemies.find((z) => z.id === id);
          if (!x) return true;
          const ff = feet(q);
          return Math.abs(x.x + x.w / 2 - ff.x) < 300 && Math.abs(x.y + x.h - ff.y) < (flyer ? 700 : 90);
        };
        this.settle();
        const r = this.search(undefined, goal, 5000);
        if (r.tape && r.tape.length > 0) {
          this.play(r.tape.slice(0, 300));
          line = null;
          continue;
        }
        approachFails++;
      }
      if (i !== fi || !line || (!boss && k >= 20)) {
        const tactics = fightTactics(this.game.scene, i, 1, 0);
        const cand = boss
          ? (tactics.find((q) => q.name === 'the den') ?? (tactics[0] as (typeof tactics)[number]))
          : this.choose(tactics, i, name);
        if (!(boss && line && i === fi)) {
          line = cand.make();
          k = 0;
          name = cand.name;
        }
        fi = i;
      }
      const m = (line as Line).act(s, k++, prev);
      prev = m;
      const ev = this.push(m);
      if (ev.some((x) => x.type === 'hurt')) hurts++;
    }
    return `not down after ${frames / 60} s (${hurts} hits taken)`;
  }

  /** fight.ts's look-ahead choice, plus: never a tactic that drops her far below where she stands. */
  choose(
    cands: ReturnType<typeof fightTactics>,
    i: number,
    current: string,
  ): ReturnType<typeof fightTactics>[number] {
    let best = cands[0] as ReturnType<typeof fightTactics>[number];
    let bs = Number.POSITIVE_INFINITY;
    const y0 = feet(this.s).y;
    for (const c of cands) {
      const s = cloneState(this.s);
      const line = c.make();
      const id = s.enemies[i]?.id ?? '';
      const ev: SimEvent[] = [];
      const r = { dealt: 0, taken: 0, killed: false, faded: false, caught: 0, frames: 300, stunned: false };
      let prev = s.prevInput;
      let low = 0;
      for (let k = 0; k < 300; k++) {
        const m = line.act(s, k, prev);
        prev = m;
        ev.length = 0;
        step(s, m, tuning, this.game.scene, ev, world);
        for (const x of ev) {
          if (x.type === 'hurt') r.taken++;
          if (x.type === 'enemyHit' && x.id === id) r.dealt += (x as { power?: number }).power ?? 1;
          if (x.type === 'enemyDie' && x.id === id) r.killed = true;
          if (x.type === 'fade') r.faded = true;
          if (x.type === 'fallCatch' || x.type === 'roomExit') r.caught++;
        }
        low = Math.max(low, feet(s).y - y0);
        if (r.killed || r.faded) {
          r.frames = k;
          break;
        }
      }
      const sc = fightScore(r, c.name) - (c.name === current ? 300 : 0) + (low > 260 ? 5000 : 0);
      if (sc < bs) {
        bs = sc;
        best = c;
      }
    }
    return best;
  }

  pickFoe(ids: string[] | null): number {
    const s = this.s;
    const f = feet(s);
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    s.enemies.forEach((e, i) => {
      if (ids && !ids.includes(e.id)) return;
      // (A creature named for the fight counts while it lives, asleep or not: the boss sleeps until she is down.)
      if (ids ? e.gone || e.mode === 'dead' : !hostile(e) || (e.kind as string) === 'carrier') return;
      const d = Math.abs(e.x + e.w / 2 - f.x) + Math.abs(e.y + e.h - f.y);
      if (!ids && d > 1600) return;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  leg(L: Leg): LegLog {
    const start = this.tape.length;
    const room = this.s.room;
    let ok = false;
    let note = '';
    if (L.kind === 'script') {
      this.play(parseInputScript(L.script));
      ok = true;
    } else if (L.kind === 'settle') {
      this.settle();
      ok = true;
    } else if (L.kind === 'fight') {
      note = this.fight(L.ids, (L.seconds ?? 120) * 60);
      ok = note.startsWith('down');
    } else {
      const test = L.kind === 'goal' ? L.test : undefined;
      const exit = L.kind === 'exit' ? L.exit : undefined;
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        this.settle();
        if (test?.(this.s)) {
          ok = true;
          break;
        }
        const t = Date.now();
        const r = this.search(exit, test, L.max ?? 6000);
        note += `[search ${r.nodes} nodes${r.truncated ? ' trunc' : ''} ${((Date.now() - t) / 1000).toFixed(1)}s ${r.tape ? `${r.tape.length} f` : 'none'}] `;
        if (r.tape) {
          const roomBefore = this.s.room;
          this.play(r.tape);
          for (let w = 0; w < 240 && this.s.exit; w++) this.push(0);
          if (exit && this.s.room !== roomBefore) {
            // Arrived (maybe in the air, rising out of a floor opening): onto ground in this room, not back out.
            const here = this.s.room;
            const sc = this.game.scene;
            // (Ground inside the room: not the lip of the opening she came through on its very edge.)
            const inside = (q: GameState) => {
              const f = feet(q);
              return f.x > 64 && f.x < sc.width - 64 && f.y > 96 && f.y < sc.height - 32;
            };
            const r2 = this.search1(
              undefined,
              (q) => q.room === here && q.player.grounded && inside(q),
              3000,
              'time',
            );
            if (r2.tape) this.play(r2.tape);
            note += `[land ${r2.tape ? `${r2.tape.length} f` : 'none'}] `;
          }
          ok = exit ? this.s.room !== roomBefore : !!test?.(this.s);
          if (!ok) note += '(replay missed!) ';
          break;
        }
        // No line past the creatures: wait a moment (they move), then fight the nearest one, then look again.
        if (attempt % 2 === 0) {
          for (let w = 0; w < 90; w++) this.push(0);
          note += 'wait; ';
          continue;
        }
        const i = this.pickFoe(null);
        if (i < 0) {
          note += 'no foe near; ';
          break;
        }
        note += `fight ${this.s.enemies[i]?.id}: ${this.fight([this.s.enemies[i]?.id as string], 40 * 60)}; `;
      }
    }
    const log = { name: L.name, room, start, end: this.tape.length, ok, note };
    this.log.push(log);
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${L.name} [${room} -> ${this.s.room}] ${((log.end - log.start) / 60).toFixed(1)} s (t ${(log.end / 60).toFixed(0)} s, hp ${this.s.player.hp}) ${note}`,
    );
    return log;
  }
}

const KEEP = new Set([
  'roomEnter',
  'gladeGrant',
  'hollowGrant',
  'seedTaken',
  'stoneRead',
  'hurt',
  'fade',
  'enemyDie',
  'barkBreak',
  'gateOpen',
  'patchRest',
  'bossPhase',
  'flagSet',
  'enemyAware',
  'reform',
  'fallCatch',
]);

// ---- render

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  const out = resolve(args.out ?? 'playtest-reports/canopy-video');
  mkdirSync(out, { recursive: true });
  const cmd = positionals[0] ?? 'plan';
  if (cmd === 'plan') {
    const d = new Driver();
    const from = args.from ? Number(args.from) : 0;
    if (from > 0) {
      // Resume: replay the saved tape's first legs.
      const prev = JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as { legs: LegLog[] };
      const tape = JSON.parse(readFileSync(join(out, 'tape.json'), 'utf8')) as number[];
      const upto = prev.legs[from - 1]?.end ?? 0;
      d.play(tape.slice(0, upto));
      d.log.push(...prev.legs.slice(0, from));
      console.log(`resumed at leg ${from} (frame ${upto}, ${d.s.room})`);
    }
    const t0 = Date.now();
    for (let k = from; k < ROUTE.length; k++) {
      const L = ROUTE[k] as Leg;
      const log = d.leg(L);
      // (formatInputScript writes the lamp as `L+B*3`, which the parser refuses: the raw masks are the tape.)
      writeFileSync(join(out, 'tape.json'), JSON.stringify(d.tape));
      writeFileSync(
        join(out, 'legs.json'),
        JSON.stringify({ legs: d.log, hash: d.game.hash(), frames: d.tape.length }, null, 1),
      );
      if (!log.ok || L.name === args.upto) break;
    }
    writeFileSync(join(out, 'rooms.json'), JSON.stringify(compress(d.rooms)));
    writeFileSync(join(out, 'events.json'), JSON.stringify(d.events));
    console.log(
      `plan: ${d.tape.length} frames (${(d.tape.length / 60 / 60).toFixed(1)} min), ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  } else if (cmd === 'render') {
    await render(out);
    finish(out);
  } else if (cmd === 'finish') finish(out);
}

function compress(rooms: string[]): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  rooms.forEach((r, i) => {
    if (out.at(-1)?.[1] !== r) out.push([i, r]);
  });
  return out;
}

async function render(out: string): Promise<void> {
  const { launch, openGame } = await import('../lib/browser');
  const masks = JSON.parse(readFileSync(join(out, 'tape.json'), 'utf8')) as number[];
  const tape = masks;
  const [w = 1280, h = 720] = (args.size ?? '1280x720').split('x').map(Number);
  const shots = join(out, '.video');
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  // Still stretches longer than `still` frames are cut down to that (the sim still steps them).
  const stillMax = Number(args.still);
  const browser = await launch();
  let captures = 0;
  const kept: number[] = []; // sim frame of each capture
  try {
    const page = await openGame(
      browser,
      args.url ?? 'http://localhost:5230',
      { width: w, height: h },
      1,
      true,
      START,
    );
    page.setDefaultTimeout(0);
    await page.evaluate(
      `(() => { const g = window.__game; g.cam(null); g.debug.labels?.(false); g.load(); g.input(${JSON.stringify(tape)}); })()`,
    );
    const canvas = page.locator('#game');
    let done = 0;
    let still = 0;
    let lastPos = '';
    const t0 = Date.now();
    const total = args.frames ? Math.min(Number(args.frames), masks.length) : masks.length;
    while (done < total) {
      const n = Math.min(2, total - done);
      const st = (await page.evaluate((k) => {
        const g = (window as unknown as { __game: { step(n: number): unknown; state(): GameState } }).__game;
        g.step(k);
        const s = g.state();
        return { x: Math.round(s.player.x), y: Math.round(s.player.y), room: s.room, frame: s.frame };
      }, n)) as { x: number; y: number; room: string };
      done += n;
      const pos = `${st.room}:${st.x},${st.y}`;
      still = pos === lastPos ? still + n : 0;
      lastPos = pos;
      if (still > stillMax && done > 600 && done < total - 300) continue;
      const shot = await canvas.screenshot({ type: 'jpeg', quality: 88 });
      writeFileSync(join(shots, `${String(captures++).padStart(6, '0')}.jpg`), shot);
      kept.push(done);
      if (captures % 900 === 0)
        console.log(
          `  ${(done / 3600).toFixed(1)} of ${(masks.length / 3600).toFixed(1)} min (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
        );
    }
    const hash = String(await page.evaluate('window.__game.hash()'));
    const legs = JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as { hash: string };
    console.log(`replay ${hash === legs.hash ? 'matches' : `DIFFERS (${hash} vs ${legs.hash})`} the plan`);
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, 'kept.json'), JSON.stringify(kept));
  ffmpeg([
    '-framerate',
    '30',
    '-i',
    join(shots, '%06d.jpg'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '24',
    '-preset',
    'slow',
    join(out, 'raw.mp4'),
  ]);
  console.log(`raw.mp4: ${captures} pictures (${(captures / 30 / 60).toFixed(1)} min)`);
}

// ---- finish: captions and chapters

const ABILITY: Record<string, string> = { wallJump: 'the claws (wall jump)', glide: 'the glide' };
const UPGRADE: Record<string, string> = {
  keenBlade: 'keen blade',
  quickWings: 'quick wings',
  longBreath: 'long breath',
  nightEyes: 'night eyes',
};
const BARK: Record<string, string> = {
  'bank-wall': 'Secret: a rotten wall breaks',
  'cache-floor': 'Secret: a rotten floor breaks',
  'pit-panel': 'A rotten floor breaks',
  'ledge-wall': 'Secret: a rotten wall breaks',
};

function eventText(e: SimEvent): string | null {
  const x = e as SimEvent & Record<string, unknown>;
  switch (e.type) {
    case 'gladeGrant':
      return `Ability: ${ABILITY[x.ability as string] ?? x.ability}`;
    case 'seedTaken':
      return `Moonseed ${x.count} of 3`;
    case 'barkBreak':
      return BARK[x.id as string] ?? null;
    case 'hollowGrant':
      return `Hollow: ${UPGRADE[x.upgrade as string] ?? x.upgrade}`;
    case 'stoneRead':
      return 'Moth-stone: the map is drawn';
    case 'enemyDie':
      return x.id === 'old-burr'
        ? 'The old burrback is down'
        : x.id === 'wing-am' || /^burr-am|juv-am/.test(x.id as string)
          ? null
          : null;
    case 'gateOpen':
      return 'The root gate opens';
    case 'flagSet':
      return x.flag === 'cn-area-end' ? 'The way on: end of the Canopy' : null;
    case 'fade':
      return 'She fades';
    default:
      return null;
  }
}

function finish(out: string): void {
  const kept = JSON.parse(readFileSync(join(out, 'kept.json'), 'utf8')) as number[];
  const rooms = JSON.parse(readFileSync(join(out, 'rooms.json'), 'utf8')) as Array<[number, string]>;
  const events = JSON.parse(readFileSync(join(out, 'events.json'), 'utf8')) as Array<{
    f: number;
    e: SimEvent;
  }>;
  const legs = (JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as { legs: LegLog[] }).legs;
  // Video time (s) of sim frame f: the first picture at or after it.
  const vt = (f: number): number => {
    let lo = 0;
    let hi = kept.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((kept[mid] as number) < f) lo = mid + 1;
      else hi = mid;
    }
    return lo / 30;
  };
  const end = kept.length / 30;
  const ts = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  };
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const title = (id: string) => {
    try {
      return getRoom(id).title ?? id;
    } catch {
      return id;
    }
  };
  // Ambush and boss lines from the leg names.
  const lines: Array<{ a: number; b: number; style: string; text: string }> = [];
  rooms.forEach(([f, id], k) => {
    const next = rooms[k + 1]?.[0];
    const a = vt(f);
    const b = next === undefined ? end : vt(next);
    lines.push({ a, b, style: 'Room', text: title(id) });
  });
  for (const { f, e } of events) {
    const text = eventText(e);
    if (!text) continue;
    const a = vt(f);
    lines.push({ a, b: Math.min(end, a + 3.5), style: 'Event', text });
  }
  for (const L of legs)
    if (/ambush|old burrback/.test(L.name)) {
      const a = vt(L.start);
      lines.push({
        a,
        b: Math.min(end, a + 3),
        style: 'Event',
        text: L.name.includes('ambush') ? 'Ambush!' : 'Boss: the old burrback',
      });
      if (L.name.includes('ambush'))
        lines.push({ a: vt(L.end), b: Math.min(end, vt(L.end) + 3), style: 'Event', text: 'Ambush cleared' });
    }
  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1280',
    'PlayResY: 720',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Room,Helvetica Neue,30,&H00F0F0F0,&H00F0F0F0,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,9,24,24,18,1',
    'Style: Event,Helvetica Neue,26,&H0080E8FF,&H0080E8FF,&H00000000,&H80000000,0,1,0,0,100,100,0,0,1,2,1,9,24,24,58,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines
      .filter((l) => l.b > l.a)
      .sort((p, q) => p.a - q.a)
      .map((l) => `Dialogue: 0,${ts(l.a)},${ts(l.b)},${l.style},,0,0,0,,${l.text}`),
  ].join('\n');
  writeFileSync(join(out, 'captions.ass'), `${ass}\n`);
  const name = args.name ?? 'canopy-playthrough';
  ffmpeg([
    '-i',
    join(out, 'raw.mp4'),
    '-vf',
    `ass=${join(out, 'captions.ass')}`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    args.crf ?? '25',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(out, `${name}.mp4`),
  ]);
  // Chapters: one row per leg (merged per room visit), with what happened.
  const rows: string[] = [];
  let lastRoom = '';
  for (const L of legs) {
    const t = vt(L.start);
    const room = L.name.split(':')[0] ?? '';
    const what = L.name.slice(room.length + 1).trim();
    const evs = events
      .filter(({ f }) => f >= L.start && f < L.end)
      .map(({ e }) => eventText(e))
      .filter((x): x is string => !!x);
    const fightNote = L.note.startsWith('down') ? ` (${L.note})` : '';
    const roomCell = room === lastRoom ? '' : room.startsWith('cn-') ? `${title(room)} (\`${room}\`)` : room;
    lastRoom = room;
    rows.push(
      `| ${mmss(t)} | ${roomCell} | ${what}${fightNote}${evs.length ? `: ${[...new Set(evs)].join('; ')}` : ''} |`,
    );
  }
  writeFileSync(
    join(out, 'chapters.md'),
    [
      '# The Canopy: a complete playthrough (review video)',
      '',
      `\`${name}.mp4\`: ${mmss(end)}, 1280x720, 30 fps, real-time speed. Build 93710c7 (the v2 layout, round-3 rendering), world \`canopy\` from a fresh save in \`cn-hatch\`; the follow camera at zoom 1, glints and HUD on. Played by a bot (tools/playtest/route-video.ts): one input tape, every ability, seed and flag earned in play, fights fought for real. Still stretches over 1.5 s are cut short.`,
      '',
      '| time | room | what happens |',
      '|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log(`${name}.mp4 and chapters.md written (${mmss(end)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
