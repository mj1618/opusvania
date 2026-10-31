/**
 * The escape as a person plans it (the Canopy r14, moment 7; r15: the den's floor run, then the clifftop's chimney): a
 * pure controller over the sim state, used headless (tools/levels/escape-probe.ts) and live in the page
 * (tools/playtest/escape-live.ts). Her moves are planned (she knows where she jumps); `careful` waits on the ground she
 * stands on while a rock tells or falls over where she goes next, seen only `lag` frames after its grit starts; a kick
 * waits `delay` frames on the wall. No Node imports: it runs in the page.
 *
 *  - **The den** (`cn-den`): east along the floor, a hop over the fallen roof's mound, through the breach and the corridor.
 *  - **The way out** (`cn-out`): east off the pocket's floor down its shaft, along the low passage to the chimney's foot,
 *    then its three legs as `tools/levels/climbs.ts` plays them (out-1 the east face to rest E, out-2 the west face to
 *    rest W, out-3 the east face over the top), and onto the clifftop.
 */
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';

const { jump: J, right: R, left: L } = ActionBit;
const DIR = (d: number) => (d > 0 ? R : L);

/** A chimney leg: from a stand, walk to `jumpAt` (if given), jump toward face `first`, kick up it to the goal. */
interface Leg {
  id: string;
  /** The stand she starts from: feet y, x range. */
  y: number;
  x0: number;
  x1: number;
  first: -1 | 1;
  jumpAt?: number;
  /** Where a rock that makes a careful player wait falls (x range; anything over her feet). */
  ahead: [number, number];
}

/** The way out's legs (cn-out; the room's numbers: tools/levels/canopy.ts `out()`). */
const LEGS: Leg[] = [
  { id: 'out-1', y: 1856, x0: 896, x1: 1280, first: 1, ahead: [1152, 1536] },
  { id: 'out-2', y: 1344, x0: 1152, x1: 1536, first: -1, jumpAt: 1232, ahead: [576, 1024] },
  { id: 'out-3', y: 832, x0: 576, x1: 1024, first: 1, jumpAt: 992, ahead: [896, 1280] },
];

export class EscapePlan {
  private jumped = -1;
  private wallT = -1;
  private prev = 0;
  private f = 0;
  /** The leg under way (index in `LEGS`), -1 = none; its face; the frame it jumped. */
  private leg = -1;
  private h = 1;

  constructor(private readonly o: { lag?: number; delay?: number; careful?: boolean } = {}) {}

  /** A rock she has seen telling (`lag` frames in) or falling, over x range [`x0`, `x1`] above feet `fy`. */
  private rockOver(s: GameState, scene: Scene, x0: number, x1: number, fy: number): boolean {
    const E = scene.escape;
    if (!E || !this.o.careful) return false;
    const lag = Math.max(0, this.o.lag ?? 0);
    const esc = s.kit.escape;
    for (let i = 0; i < E.rocks.length; i++) {
      const r = E.rocks[i];
      const st = esc.rock[i] ?? 0;
      const seen = st === 2 || (st === 1 && (esc.rockT[i] ?? 0) >= lag);
      if (r && seen && r.x + r.w / 2 > x0 && r.x - r.w / 2 < x1 && r.y0 < fy) return true;
    }
    return false;
  }

  /** The input for this frame (call once a sim frame) in room `scene`. */
  act(s: GameState, scene: Scene): number {
    const f = this.f++;
    if (s.caught || s.exit) {
      this.leg = -1;
      this.prev = 0;
      return 0;
    }
    const m = scene.id === 'cn-out' ? this.out(s, scene, f) : this.den(s, scene, f);
    this.prev = m;
    return m;
  }

  /** The den: east along the floor, a hop over the mound, out through the breach. */
  private den(s: GameState, scene: Scene, f: number): number {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    const mound = (scene.gates ?? []).find((g) => g.id === 'rubble-mound');
    if (p.grounded) {
      // (A rock telling over her own spot: on out from under it; one ahead: stop short and watch it land.)
      if (this.rockOver(s, scene, cx - 40, cx + 40, fy)) return R;
      if (this.rockOver(s, scene, cx + 40, cx + 420, fy)) return 0;
      let m = R;
      const near = mound ? mound.x - cx : 999;
      if (near > 0 && near < 150 && Math.abs(fy - 1344) <= 4 && f - this.jumped > 12) {
        m |= J;
        this.jumped = f;
      }
      return m;
    }
    return R | (f - this.jumped < 22 ? J : 0);
  }

  /** The way out: the pocket, the shaft, the passage, the chimney's three legs, the clifftop. */
  private out(s: GameState, scene: Scene, f: number): number {
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    const delay = Math.max(0, this.o.delay ?? 0);
    // On top: on along the clifftop.
    if (fy <= 400) return R;
    if (p.grounded) {
      this.wallT = -1;
      // Which stand is she on?
      const k = LEGS.findIndex((q) => Math.abs(fy - q.y) <= 4 && cx >= q.x0 - 8 && cx <= q.x1 + 8);
      if (k < 0) {
        // The pocket, the shaft's foot, the low passage: east to the chimney.
        this.leg = -1;
        return R;
      }
      const q = LEGS[k] as Leg;
      // (The foot: into the chimney's middle first.)
      if (k === 0 && cx < 1000) return R;
      if (this.rockOver(s, scene, q.ahead[0], q.ahead[1], fy)) return 0;
      if (q.jumpAt !== undefined && (q.first < 0 ? cx > q.jumpAt : cx < q.jumpAt)) return DIR(q.first);
      if (f - this.jumped <= 12) return DIR(q.first);
      this.leg = k;
      this.h = q.first;
      this.jumped = f;
      return DIR(q.first) | J;
    }
    if (this.leg < 0) return R;
    // In the air on a leg: hold toward the face; kick up it (still holding into it) on each touch after `delay`.
    let m = DIR(this.h);
    if (p.mode === 'wallSlide' || p.wallDir === this.h) {
      if (this.wallT < 0) this.wallT = f;
      if (f - this.wallT >= delay && !(this.prev & J)) {
        m |= J;
        this.wallT = -1;
        this.jumped = f;
      }
    } else {
      this.wallT = -1;
      if (f - this.jumped < 20 && this.prev & J) m |= J;
    }
    return m;
  }
}
