/**
 * A bot for the boss rush's fights (memory/bossrush.md): the Mantis and the Gloamweaver (rush mode). It is for
 * bugs, not fun: can each fight be won, does nothing softlock. It reads only what a player sees (the tells, the
 * boss's mode) and answers a tell `react` frames after it shows (a person's ~0.25-0.4 s).
 *
 *   headless: `runRush('br-mantis', { react: 18 })` (tests/unit/bossrush.test.ts, tools/playtest/rush-run.ts)
 *   live, real keys: `(await import('/tools/playtest/rush-bot.ts')).playLive(240)` in a `?world=demo-bossrush` page
 */
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import type { EnemyState, GameState } from '../../src/sim/state';
import { newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';

const L = ActionBit.left;
const R = ActionBit.right;
const U = ActionBit.up;
const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;
const X = ActionBit.dash;

export class RushBot {
  private prev = 0;
  private f = 0;
  private tellKey = '';
  private tellAt = 0;
  private plan = '';
  private planF = 0;

  constructor(readonly react = 18) {}

  decide(s: GameState, scene: Scene): number {
    const m = this.choose(s, scene);
    this.prev = m;
    this.f++;
    return m;
  }

  /** A press of `bit` (released first if it was held, so it is an edge). */
  private tap(mask: number, bit: number): number {
    return (this.prev & bit) !== 0 ? mask & ~bit : mask | bit;
  }

  private begin(plan: string): void {
    this.plan = plan;
    this.planF = this.f;
  }

  /** Frames the tell now showing has been seen (0 = none, or not yet noticed). */
  private seen(s: GameState): number {
    const b = s.boss;
    const key = b?.tell ? `${b.tell}:${b.moves}:${b.phase}` : '';
    if (key !== this.tellKey) {
      this.tellKey = key;
      this.tellAt = this.f;
    }
    return key ? this.f - this.tellAt : 0;
  }

  private toX(cx: number, x: number, slack: number): number {
    if (x < cx - slack) return L;
    if (x > cx + slack) return R;
    return 0;
  }

  private choose(s: GameState, scene: Scene): number {
    const b = s.boss;
    const spec = scene.boss;
    const p = s.player;
    if (!b || !spec || b.stage === 'down' || b.stage === 'end') return 0;
    if (p.faded > 0 || p.hp <= 0) return 0;
    const cx = p.x + p.w / 2;
    if (b.stage === 'wait') return this.toX(cx, spec.arena.x + 400, 20);
    const e = s.enemies.find((q) => q.id === spec.creature);
    if (!e) return 0;
    const seen = this.seen(s);
    const know = seen >= this.react;
    if (this.plan === 'jump') {
      // A jump in progress: hold it up to its top, drifting away from the danger.
      const t = this.f - this.planF;
      if (t > 28 || (t > 4 && p.grounded)) this.begin('');
      else return (t < 20 ? J : 0) | (this.prev & (L | R));
    }
    if (this.plan === 'pogo') {
      const t = this.f - this.planF;
      const ex = e.x + e.w / 2;
      if (t > 70 || (t > 6 && p.grounded)) this.begin('');
      else {
        const above = p.y + p.h < e.y + 10;
        const steer = this.toX(cx, ex, 8);
        if (above && Math.abs(ex - cx) < 50) return this.tap(D | steer, A);
        return (t < 22 ? J : 0) | steer;
      }
    }
    if (spec.kind === 'mantis') return this.mantis(s, scene, e, cx, know);
    return this.gloam(s, scene, e, cx, know);
  }

  private mantis(s: GameState, scene: Scene, e: EnemyState, cx: number, know: boolean): number {
    const b = s.boss as NonNullable<GameState['boss']>;
    const spec = scene.boss as NonNullable<Scene['boss']>;
    const p = s.player;
    const ex = e.x + e.w / 2;
    const dx = ex - cx;
    const dist = Math.abs(dx);
    const toward = dx < 0 ? L : R;
    const away = dx < 0 ? R : L;
    const a = spec.arena;
    const room = (x: number): number => Math.max(a.x + 60, Math.min(a.x + a.w - 60, x));
    // The ripple coming along the floor: jump it.
    if (b.waveT > 0 && p.grounded) {
      const wd = b.waveX - cx;
      if (Math.abs(wd) < 150 && Math.sign(wd) === -b.waveDir) {
        this.begin('jump');
        return J;
      }
    }
    // The strike under way and coming at her: jump it (or Moonstep through it).
    if (e.mode === 'charge' && Math.sign(dx) === -b.dir && dist < 330) {
      const step = s.save.flags.includes('upgrade:moonstep') && s.save.abilities.includes('dash');
      if (step && dist < 140) return this.tap(toward, X);
      if (p.grounded) {
        this.begin('jump');
        return J | away;
      }
      return away;
    }
    // Its dive's landing: get out from under it.
    if ((b.tell === 'leap' && know) || e.mode === 'dive') {
      const lx = b.landX;
      if (Math.abs(lx - cx) < 220) {
        const go = room(lx < cx ? lx + 300 : lx - 300);
        return this.toX(cx, go === room(lx + 300) && lx < cx ? go : go, 10) || (lx < cx ? R : L);
      }
      return 0;
    }
    // A riposte or a flurry coming: back away out of its reach.
    if ((know && (b.tell === 'riposte' || b.tell === 'flurry')) || e.mode === 'slam') {
      if (dist < 260) {
        if (p.grounded && dist < 140) {
          this.begin('jump');
          return J | away;
        }
        return away;
      }
      return 0;
    }
    // The strike's display: stand ready (facing it), not too near.
    if (b.tell === 'strike') return dist < 200 ? away : 0;
    // The guard: never cut its front; jump over it and pogo.
    if (e.mode === 'feint') {
      if (dist < 240 && p.grounded) {
        this.begin('pogo');
        return J | toward;
      }
      return dist > 300 ? toward : 0;
    }
    // Open: in and cut.
    const open = e.mode === 'recover' || (e.mode === 'stall' && b.move !== 'flurryGap');
    if (open) {
      if (dist > 70) return toward;
      return this.tap(toward & 0, A) | (p.facing === (dx < 0 ? -1 : 1) ? 0 : toward);
    }
    // Stalking: keep a little out of its range.
    if (dist < 220) return away;
    if (dist > 420) return toward;
    return 0;
  }

  private gloam(s: GameState, scene: Scene, e: EnemyState, cx: number, know: boolean): number {
    const b = s.boss as NonNullable<GameState['boss']>;
    const spec = scene.boss as NonNullable<Scene['boss']>;
    const p = s.player;
    const ex = e.x + e.w / 2;
    const dx = ex - cx;
    const dist = Math.abs(dx);
    const toward = dx < 0 ? L : R;
    const a = spec.arena;
    const mid = a.x + a.w / 2;
    // A lunge's line (P1, P3): off where it lands.
    if ((b.tell === 'lunge' && know) || (e.mode === 'dive' && !b.thread)) {
      const lx = b.pivotX;
      if (Math.abs(lx - cx) < 240) return lx < cx ? (cx > a.x + a.w - 120 ? L : R) : cx < a.x + 120 ? R : L;
      return 0;
    }
    // P2's swing: to the place it never reaches.
    if (b.tell === 'swing' && know && b.safeX >= 0) return this.toX(cx, b.safeX, 16);
    if (e.mode === 'dive' || e.mode === 'swing') return b.safeX >= 0 ? this.toX(cx, b.safeX, 16) : 0;
    // Open (fallen, winded, a lunge's rest): in and cut (up at it if it hangs).
    if (e.mode === 'recover' || e.mode === 'fall') {
      if (dist > 60) return toward;
      const high = e.y + e.h < p.y - 10;
      if (high && p.grounded) {
        this.begin('jump');
        return J;
      }
      return this.tap(high ? U : 0, A);
    }
    // Otherwise wait by the middle, out from under it.
    if (dist < 120) return dx < 0 ? R : L;
    return this.toX(cx, mid + (cx < mid ? -300 : 300), 80);
  }
}

export interface RushResult {
  won: boolean;
  frames: number;
  hurts: number;
  fades: number;
  phase: number;
  /** The save at the end (its flags, abilities, re-form patch). */
  save?: GameState['save'];
}

/**
 * Plays one boss room headless from its moon patch by the arena (`p-gate`) with the kit she would have there
 * (the dash for the Gloamweaver; the Moonstep too for the Mantis). `react`: frames to answer a tell.
 */
export function runRush(
  room: 'br-gloam' | 'br-mantis',
  opts: { react?: number; seconds?: number; tuning?: Tuning; moonstep?: boolean } = {},
): RushResult {
  const t = opts.tuning ?? cloneTuning(defaultTuning);
  const r = getRoom(room);
  const save = newSave(r.abilities ?? []);
  save.patch = { room: r.id, id: 'p-gate' };
  save.visited.push(r.id);
  if (opts.moonstep ?? room === 'br-mantis') save.flags.push('upgrade:moonstep');
  const patch = r.patches?.find((q) => q.id === 'p-gate');
  const g = new Game(t, r, 1, () => 0, null, { world: getWorld('demo-bossrush'), save });
  g.mode = 'manual';
  if (patch) g.teleport(patch.x, patch.y);
  let hurts = 0;
  let fades = 0;
  g.afterStep.add((ev) => {
    for (const e of ev) {
      if (e.type === 'hurt') hurts++;
      if (e.type === 'fade') fades++;
    }
  });
  const bot = new RushBot(opts.react ?? 18);
  const max = Math.round((opts.seconds ?? 600) * 60);
  for (let f = 0; f < max; f++) {
    g.queueInput([bot.decide(g.state, g.scene)]);
    g.stepOnce();
    if (g.state.boss?.stage === 'down' || g.state.boss?.stage === 'end')
      return { won: true, frames: f, hurts, fades, phase: g.state.boss.phase, save: g.state.save };
  }
  return { won: false, frames: max, hurts, fades, phase: g.state.boss?.phase ?? 0, save: g.state.save };
}

/** Plays the fight in the page with real keys (one rAF loop reading `__game.state()`). */
export function playLive(seconds = 240, react = 18): Promise<RushResult> {
  const KEYS: Array<[number, string, string]> = [
    [L, 'ArrowLeft', 'ArrowLeft'],
    [R, 'ArrowRight', 'ArrowRight'],
    [U, 'ArrowUp', 'ArrowUp'],
    [D, 'ArrowDown', 'ArrowDown'],
    [J, 'KeyZ', 'z'],
    [A, 'KeyC', 'c'],
    [X, 'KeyX', 'x'],
  ];
  const w = window as unknown as {
    __game: {
      state(): GameState;
      scene(): unknown;
      resume(): void;
      events(n: number): Array<{ type: string }>;
    };
  };
  const g = w.__game;
  const bot = new RushBot(react);
  let held = 0;
  let last = g.state().frame;
  const start = last;
  let hurts = 0;
  let fades = 0;
  const press = (mask: number): void => {
    for (const [bit, code, key] of KEYS) {
      const now = (mask & bit) !== 0;
      if (now !== ((held & bit) !== 0))
        window.dispatchEvent(new KeyboardEvent(now ? 'keydown' : 'keyup', { code, key, bubbles: true }));
    }
    held = mask;
  };
  g.resume();
  return new Promise((resolve) => {
    const tick = (): void => {
      const st = g.state();
      if (st.frame > last) {
        for (const e of g.events(st.frame - last)) {
          if (e.type === 'hurt') hurts++;
          if (e.type === 'fade') fades++;
        }
        last = st.frame;
      }
      const won = st.boss?.stage === 'down' || st.boss?.stage === 'end';
      if (won || st.frame - start > seconds * 60) {
        press(0);
        resolve({ won, frames: st.frame - start, hurts, fades, phase: st.boss?.phase ?? 0 });
        return;
      }
      press(bot.decide(st, g.scene() as Scene));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
