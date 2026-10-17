/**
 * A scripted perfect-ish player for the Weaver (memory/bosses.md): reads the sim state (everything a
 * player sees on screen: the arc, the tells, the flames) and presses buttons. It wins the fight
 * headless (tests/unit/boss.test.ts, `npx tsx tools/playtest/weaver-run.ts`) and in the page with real
 * keys (`playLive()`: one rAF loop dispatching KeyboardEvents, memory/debug-api.md).
 *
 * How it plays, phase by phase:
 *  - P1: the outer rings from the floor (jump, up cut), then the inner ones from the columns (onto the
 *    branch, up the face by kicks, kick out at the flame; caught by it, it mashes the blade and cuts it
 *    on the way out), ring 3 last from the top of a column. Caught by the heart: beats free, away.
 *  - P2: on the tell it runs to the safe side the arc leaves; when the Weaver hangs open it runs in and
 *    cuts until it climbs.
 *  - P3: keeps a lunge and a bit away; hops a lunge it is in; pogos the winded abdomen; steps off a
 *    drop's landing.
 *  - P4: under the lowered heart, jump and up cut (beats free if caught, then cuts again).
 */
import type { Scene } from '../../src/sim/scene';
import type { EnemyState, GameState } from '../../src/sim/state';

const L = 1;
const R = 2;
const U = 4;
const D = 8;
const J = 16;
const A = 64;

/** Body numbers (tuning: body 40 x 80). */
const HALF_W = 20;

interface Flame {
  i: number;
  id: string;
  x: number;
  y: number;
}

/**
 * A first-timer's hands (all off = the perfect player): `react` frames before a new tell is acted on,
 * `naive` = it does not know the sim's safe point, only the band drawn on the floor (it runs to the
 * nearer clear end), `miss` = the chance a timed press (the jump over a lunge, a pogo, a kick at a
 * ring's height) comes `late` frames off.
 */
export interface BotHands {
  react?: number;
  naive?: boolean;
  miss?: number;
  late?: number;
  seed?: number;
}

export class WeaverBot {
  readonly notes: string[] = [];
  finished = false;
  private f = 0;
  private readonly hands: Required<BotHands>;
  private rng: number;
  private tellKey = '';
  private tellF = 0;
  /** This tell's roll: does the timed press come late? */
  private sloppy = false;

  constructor(hands: BotHands = {}) {
    this.hands = { react: 0, naive: false, miss: 0, late: 10, seed: 1, ...hands };
    this.rng = this.hands.seed >>> 0 || 1;
  }

  /** 0..1, seeded (mulberry32). */
  private roll(): number {
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Has she taken in the tell now showing (`react` frames since it began)? Rolls this tell's slip once. */
  private seen(s: GameState): boolean {
    const b = s.boss;
    const key = b?.tell ? `${b.tell}:${b.phase}:${b.drop}:${b.tellX0}:${b.tellX1}` : '';
    if (key !== this.tellKey) {
      this.tellKey = key;
      this.tellF = this.f;
      this.sloppy = this.roll() < this.hands.miss;
    }
    return this.f - this.tellF >= this.hands.react;
  }
  private prev = 0;
  /** The current manoeuvre and the frame it began. */
  private plan = '';
  private planF = 0;
  private planTarget = '';
  private lastKick = -99;
  private lastAttack = -99;

  private begin(plan: string, target = ''): void {
    if (this.plan === plan && this.planTarget === target) return;
    this.plan = plan;
    this.planF = this.f;
    this.planTarget = target;
  }

  private since(): number {
    return this.f - this.planF;
  }

  /** A press of `bit` this frame (released first if it was held, so it is an edge). */
  private tap(mask: number, bit: number): number {
    return (this.prev & bit) !== 0 ? mask & ~bit : mask | bit;
  }

  decide(s: GameState, scene: Scene): number {
    const m = this.choose(s, scene);
    this.prev = m;
    this.f++;
    return m;
  }

  private choose(s: GameState, scene: Scene): number {
    const b = s.boss;
    const spec = scene.boss;
    const p = s.player;
    if (!b || !spec) return 0;
    if (b.stage === 'down') {
      this.finished = true;
      return 0;
    }
    if (p.faded > 0 || p.hp <= 0) return 0;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    // Held by a lure or a strand: beat free (a ring: with the blade, so the press after the last beat cuts it).
    if (p.grab >= 0) return this.tap(0, J);
    if (p.lure >= 0) {
      const id = scene.lures?.[p.lure]?.id ?? '';
      const ring = spec.rings.includes(id);
      if (ring) return this.tap(0, A);
      // The heart: jump presses, the throw bent away from it (down and toward the arena's open side).
      const away = cx < (scene.lures?.[p.lure]?.x ?? 0) ? L : R;
      return this.tap(away | D, J);
    }
    if (b.stage === 'wait') return this.toX(cx, spec.arena.x + spec.arena.w - 400, 0, p.grounded);
    if (b.stage === 'intro' || b.stage === 'end') return 0;
    const spider = s.enemies.find((e) => e.id === spec.creature) ?? null;
    if (b.phase === 1) return this.p1(s, scene, cx, cy);
    if (b.phase === 2) return this.p2(s, scene, cx, cy, spider);
    if (b.phase === 3) return this.p3(s, scene, cx, cy, spider);
    if (b.phase === 4) return this.p4(s, scene, cx, cy);
    return 0;
  }

  // --- Shared moves.

  /** Run toward x on the ground (hold until within `tol`). */
  private toX(cx: number, x: number, tol: number, grounded: boolean): number {
    void grounded;
    if (Math.abs(x - cx) <= Math.max(4, tol)) return 0;
    return x < cx ? L : R;
  }

  /**
   * A burning flame a cut started now would meet (the real slash boxes, at where she will be over the
   * next few active frames): the buttons that cut it (0 = none). Forward first, then up, then down.
   */
  private cutNear(s: GameState, flames: Flame[], cx: number, cy: number): number {
    const p = s.player;
    if (p.attack !== 'none' || p.attackCd > 0 || this.f - this.lastAttack < 3) return 0;
    const r = 20;
    const hits = (bx: number, by: number, bw: number, bh: number, x: number, y: number) =>
      x + r > bx && x - r < bx + bw && y + r > by && y - r < by + bh;
    for (const fl of flames) {
      if ((s.lures.hp[fl.i] ?? 0) <= 0) continue;
      for (const k of [1, 2, 3]) {
        const px = cx + (p.vx + p.pullX) * k;
        const py = cy + p.vy * k;
        const face = fl.x < px ? -1 : 1;
        // fwd: 14 behind to 110 ahead, 88 tall centred 8 up.
        const fx = face > 0 ? px - 14 : px - 110;
        if (hits(fx, py - 8 - 44, 124, 88, fl.x, fl.y)) {
          this.lastAttack = this.f;
          return this.tap(face < 0 ? L : R, A) | (face < 0 ? L : R);
        }
        if (hits(px - 50, py - 124, 100, 124, fl.x, fl.y)) {
          this.lastAttack = this.f;
          return this.tap(U, A) | U;
        }
        if (!p.grounded && hits(px - 50, py, 100, 120, fl.x, fl.y)) {
          this.lastAttack = this.f;
          return this.tap(D, A) | D;
        }
      }
    }
    return 0;
  }

  private flames(s: GameState, scene: Scene, ids: string[]): Flame[] {
    const out: Flame[] = [];
    for (const id of ids) {
      const i = (scene.lures ?? []).findIndex((l) => l.id === id);
      const l = scene.lures?.[i];
      if (!l) continue;
      const live = s.lures.live;
      out.push({ i, id, x: l.x + (live?.dx[i] ?? 0), y: l.y + (live?.dy[i] ?? 0) });
    }
    return out;
  }

  // --- P1: the ring.

  private p1(s: GameState, scene: Scene, cx: number, cy: number): number {
    const spec = scene.boss;
    if (!spec) return 0;
    const p = s.player;
    const rings = this.flames(s, scene, spec.rings);
    const burning = (id: string) => rings.some((r) => r.id === id && (s.lures.hp[r.i] ?? 0) > 0);
    const cut = this.cutNear(s, rings, cx, cy);
    if (cut) return cut;
    // Order: the outer rings from the floor, then the inner ones from the columns, ring 3 last.
    const order = ['ring-1', 'ring-5', 'ring-2', 'ring-4', 'ring-3'].filter(burning);
    const next = order[0];
    const ring = rings.find((r) => r.id === next);
    if (!ring) return 0;
    const floorY = spec.floor ?? 2176;
    const onFloor = p.grounded && p.y + p.h === floorY;
    if (next === 'ring-1' || next === 'ring-5') {
      if (this.plan === 'jumpcut' && this.planTarget === next) {
        const t = this.since();
        if (t > 50 || (t > 5 && p.grounded)) this.begin('');
        else return (t < 20 ? J : 0) | (t >= 8 && t < 10 ? U | A : 0);
      }
      if (!p.grounded) return ring.x < cx ? L : R;
      if (Math.abs(ring.x - cx) > 6) return this.toX(cx, ring.x, 6, p.grounded);
      if (Math.abs(p.vx) > 0.5) return 0;
      this.begin('jumpcut', next);
      return J;
    }
    // A column ring: C1's east face for ring 2 (and ring 3), C2's west face for ring 4.
    const west = next === 'ring-2' || next === 'ring-3';
    const face = west ? 672 : 1504;
    const toward = west ? L : R;
    const away = west ? R : L;
    const standX = west ? face + 28 : face - 28;
    const branchY = 1920;
    const targetY = next === 'ring-3' ? 1250 : ring.y + 60;
    if (p.mode === 'wallSlide') {
      if (cy > targetY) {
        this.begin('climb', next);
        if (this.f - this.lastKick > 4) {
          this.lastKick = this.f;
          return this.tap(toward, J);
        }
        return toward;
      }
      // Kick out at the flame; ring 3: glide to it.
      this.begin('kick', next);
      this.lastKick = this.f;
      return this.tap(away, J);
    }
    if (this.plan === 'kick' && this.planTarget === next) {
      const t = this.since();
      if (p.grounded || t > 120) this.begin('');
      else if (next === 'ring-3') return away | J;
      else return t < 10 ? away : t < 40 ? away | J : 0;
    }
    if (this.plan === 'climb' && this.planTarget === next) {
      // Between kicks: lean back to the face.
      if (p.grounded || this.since() > 240) this.begin('');
      else return toward;
    }
    if (this.plan === 'face' && this.planTarget === next) {
      const t = this.since();
      if (t > 60 || (t > 4 && p.grounded)) this.begin('');
      else {
        const beside = p.y + p.h < 1728 + 40;
        return (t < 22 ? J : 0) | (beside ? toward : 0);
      }
    }
    if (this.plan === 'branch' && this.planTarget === next) {
      const t = this.since();
      if (t > 60 || (t > 4 && p.grounded)) this.begin('');
      else return t < 18 ? J : 0;
    }
    if (!p.grounded) return 0;
    if (onFloor) {
      // Onto the branch under the face.
      if (Math.abs(standX - cx) > 8) return this.toX(cx, standX, 8, true);
      if (Math.abs(p.vx) > 0.5) return 0;
      this.begin('branch', next);
      return J;
    }
    if (p.y + p.h === branchY) {
      if (Math.abs(standX - cx) > 6) return this.toX(cx, standX, 6, true);
      if (Math.abs(p.vx) > 0.5) return 0;
      this.begin('face', next);
      return J;
    }
    return 0;
  }

  // --- P2: the drops.

  private p2(s: GameState, scene: Scene, cx: number, cy: number, e: EnemyState | null): number {
    void cy;
    const b = s.boss;
    const spec = scene.boss;
    const p = s.player;
    if (!b || !spec || !e) return 0;
    if (!p.grounded) return 0;
    const ex = e.x + e.w / 2;
    const danger = e.mode === 'windup' || e.mode === 'dive' || e.mode === 'swing';
    if (danger && b.safeX >= 0 && this.seen(s)) {
      const inBand = cx + HALF_W > b.tellX0 - 30 && cx - HALF_W < b.tellX1 + 30;
      let safe = b.safeX;
      if (this.hands.naive) {
        // Only the band on the floor: the nearer clear end of it.
        const west = b.tellX0 - 60;
        const east = b.tellX1 + 60;
        const okW = west > spec.arena.x + HALF_W;
        const okE = east < spec.arena.x + spec.arena.w - HALF_W;
        safe = okW && (!okE || Math.abs(cx - west) < Math.abs(cx - east)) ? west : east;
      }
      if (inBand) return this.toX(cx, safe, 8, true);
      return 0;
    }
    if (e.mode === 'recover') {
      // In and cut while it hangs open.
      const dx = ex - cx;
      const want = 70;
      if (Math.abs(dx) > want + 30) return dx < 0 ? L : R;
      const face = dx < 0 ? L : R;
      if (p.attack === 'none' && p.attackCd === 0 && this.f - this.lastAttack > 2) {
        this.lastAttack = this.f;
        return this.tap(face, A);
      }
      return Math.abs(dx) < want - 20 ? (dx < 0 ? R : L) : 0;
    }
    // Waiting for the next drop: the middle of the floor of the side it will not drop on is unknown, so wait centre-ish.
    return 0;
  }

  // --- P3: the floor.

  private p3(s: GameState, scene: Scene, cx: number, cy: number, e: EnemyState | null): number {
    const b = s.boss;
    const spec = scene.boss;
    const p = s.player;
    if (!b || !spec || !e || e.gone) return 0;
    const ex = e.x + e.w / 2;
    const dx = ex - cx;
    const x0 = spec.arena.x + 60;
    const x1 = spec.arena.x + spec.arena.w - 60;
    // A pogo on its winded abdomen.
    if (e.mode === 'recover' && !e.pogoed) {
      if (!p.grounded) {
        const above = p.y + p.h < e.y + 4;
        // (A slip: the press comes on the way up, too early.)
        const ready = this.sloppy ? p.vy > -14 : p.vy > -6;
        if (
          Math.abs(dx) <= (this.sloppy ? 70 : 40) &&
          above &&
          ready &&
          p.attack === 'none' &&
          p.attackCd === 0
        )
          return this.tap((dx < 0 ? L : R) | D, A) | D;
        return Math.abs(dx) > 6 ? (dx < 0 ? L : R) : 0;
      }
      if (Math.abs(dx) < 150) return this.tap(dx < 0 ? L : R, J);
      return dx < 0 ? L : R;
    }
    if (e.mode === 'windup' && b.tell === 'lunge' && this.seen(s)) {
      const inPath = cx + HALF_W > b.tellX0 && cx - HALF_W < b.tellX1;
      if (inPath) {
        // Out of its run if there is room, else over it.
        const out = b.dir > 0 ? b.tellX1 + 40 : b.tellX0 - 40;
        if (out > x0 && out < x1 && Math.abs(out - cx) < 200) return out < cx ? L : R;
        const at = this.sloppy ? 8 - this.hands.late : 8;
        if (p.grounded && Math.abs(dx) < 130 && b.tellFrames < at) return this.tap(0, J);
        return 0;
      }
      return 0;
    }
    if (e.mode === 'charge') {
      if (this.sloppy && this.f - this.tellF < this.hands.react + this.hands.late) return 0;
      if (p.grounded && Math.abs(dx) < 140 && Math.sign(dx) === -b.dir) return this.tap(0, J);
      return p.grounded ? 0 : J;
    }
    if (e.mode === 'windup' && b.tell === 'drop' && this.seen(s)) {
      const away = b.landX < cx ? b.landX + 220 : b.landX - 220;
      const go = Math.max(x0, Math.min(x1, away));
      if (Math.abs(b.landX - cx) < 140) return go < cx ? L : R;
      return 0;
    }
    if (e.mode === 'dive') return 0;
    // Keep about a lunge and a body away while it stands.
    if (e.mode === 'hunt') {
      const keep = 330;
      if (Math.abs(dx) < keep - 40) {
        const go = dx > 0 ? cx - 60 : cx + 60;
        if (go > x0 && go < x1) return go < cx ? L : R;
      } else if (Math.abs(dx) > keep + 80) return dx < 0 ? L : R;
      return 0;
    }
    void cy;
    // It is away (skitter, climb): the middle.
    return this.toX(cx, (x0 + x1) / 2, 200, p.grounded);
  }

  // --- P4: the heart.

  private p4(s: GameState, scene: Scene, cx: number, cy: number): number {
    const spec = scene.boss;
    if (!spec) return 0;
    const p = s.player;
    const heart = this.flames(s, scene, [spec.heart]);
    const h = heart[0];
    if (!h) return 0;
    const cut = this.cutNear(s, heart, cx, cy);
    if (cut) return cut | (this.plan === 'hop' && this.since() < 22 ? J : 0);
    if (this.plan === 'hop') {
      const t = this.since();
      if (t > 4 && p.grounded) this.begin('');
      else return t < 22 ? J : 0;
    }
    if (!p.grounded) return 0;
    if (Math.abs(h.x - cx) > 6) return this.toX(cx, h.x, 6, true);
    this.begin('hop');
    return J;
  }
}

/**
 * Plays the fight in the page with real keys (memory/debug-api.md: one rAF loop that reads
 * `__game.state()` and dispatches KeyboardEvents). Resolves when it is beaten or after `seconds`.
 *   eval "(async () => (await import('/tools/playtest/weaver-bot.ts')).playLive())()"
 */
export function playLive(
  seconds = 300,
): Promise<{ won: boolean; frames: number; hurts: number; fades: number }> {
  const KEYS: Array<[number, string, string]> = [
    [L, 'ArrowLeft', 'ArrowLeft'],
    [R, 'ArrowRight', 'ArrowRight'],
    [U, 'ArrowUp', 'ArrowUp'],
    [D, 'ArrowDown', 'ArrowDown'],
    [J, 'KeyZ', 'z'],
    [A, 'KeyC', 'c'],
  ];
  const w = window as unknown as {
    __game: {
      state(): GameState;
      scene(): unknown;
      resume(): void;
      pause(): void;
      events(n: number): Array<{ type: string }>;
    };
  };
  const g = w.__game;
  const bot = new WeaverBot();
  let held = 0;
  let last = g.state().frame;
  const start = last;
  let hurts = 0;
  let fades = 0;
  const press = (mask: number): void => {
    for (const [bit, code, key] of KEYS) {
      const now = (mask & bit) !== 0;
      const was = (held & bit) !== 0;
      if (now !== was)
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
      const done = st.boss?.stage === 'down' || st.frame - start > seconds * 60;
      if (done) {
        press(0);
        resolve({ won: st.boss?.stage === 'down', frames: st.frame - start, hurts, fades });
        return;
      }
      press(bot.decide(st, g.scene() as Scene));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * In a paused page (`?manual`): steps the bot `n` frames through the debug API's input script (one
 * frame at a time), stopping early when `stop` says so. For stills of each tell:
 *   const m = await import('/tools/playtest/weaver-bot.ts'); window.bot = new m.WeaverBot();
 *   m.stepBot(window.bot, 3000, (s) => s.boss?.tell === 'swing')
 */
export function stepBot(bot: WeaverBot, n: number, stop?: (s: GameState) => boolean): number {
  const g = (
    window as unknown as {
      __game: { state(): GameState; scene(): unknown; input(s: string): void; step(n: number): unknown };
    }
  ).__game;
  const letters: Array<[number, string]> = [
    [L, 'L'],
    [R, 'R'],
    [U, 'U'],
    [D, 'D'],
    [J, 'J'],
    [A, 'A'],
  ];
  for (let i = 0; i < n; i++) {
    const m = bot.decide(g.state(), g.scene() as Scene);
    const k = letters.filter(([b]) => (m & b) !== 0).map(([, c]) => c);
    g.input(`${k.length ? k.join('+') : '.'}1`);
    g.step(1);
    if (stop?.(g.state())) return i + 1;
  }
  return n;
}
