/**
 * The den's escape as a person plans it (the Canopy r14, moment 7): a pure controller over the sim state, used headless
 * (tools/levels/escape-probe.ts) and live in the page (tools/playtest/escape-live.ts). Her moves are planned (she
 * knows where she jumps); `careful` waits for a rock telling or falling over the next stand, seen only `lag` frames
 * after its grit starts; a kick waits `delay` frames on the wall. No Node imports: it runs in the page.
 */
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';

const { jump: J, right: R, left: L } = ActionBit;

interface Stand {
  x0: number;
  x1: number;
  top: number;
}

export class EscapePlan {
  private readonly stands: Stand[] = [];
  private next = 0;
  private jumped = -1;
  private dj = false;
  private wallT = -1;
  private prev = 0;
  private f = 0;

  constructor(
    private readonly scene: Scene,
    private readonly o: { lag?: number; delay?: number; careful?: boolean } = {},
  ) {
    // The stands she goes by, in order: the west shelf, the perches, the heap, the passage's floor.
    const gate = (id: string) => (scene.gates ?? []).find((g) => g.id === id);
    this.stands.push({ x0: 1152, x1: 1536, top: 1088 });
    for (let i = 1; gate(`rubble-${i}`); i++) {
      const g = gate(`rubble-${i}`);
      if (g) this.stands.push({ x0: g.x, x1: g.x + g.w, top: g.y });
    }
    const heap = gate('rubble-heap');
    if (heap) this.stands.push({ x0: heap.x, x1: heap.x + heap.w, top: heap.y });
    this.stands.push({ x0: 3264, x1: 3840, top: 384 });
  }

  /** The input for this frame (call once a sim frame). */
  act(s: GameState): number {
    const f = this.f++;
    const o = this.o;
    const lag = Math.max(0, o.lag ?? 0);
    const delay = Math.max(0, o.delay ?? 0);
    const stands = this.stands;
    const last = stands.length - 1;
    const E = this.scene.escape;
    const p = s.player;
    const cx = p.x + p.w / 2;
    const fy = p.y + p.h;
    if (p.grounded)
      for (let k = last; k >= 0; k--) {
        const q = stands[k];
        if (q && Math.abs(fy - q.top) <= 4 && cx >= q.x0 - 8 && cx <= q.x1 + 8) {
          this.next = k === last ? k : k + 1;
          break;
        }
      }
    const g = stands[this.next] as Stand;
    const gx = this.next === last ? 4000 : (g.x0 + g.x1) / 2;
    const dir = gx < cx ? -1 : 1;
    const H = dir < 0 ? L : R;
    let m = 0;
    if (s.caught) m = 0;
    else if (p.grounded) {
      this.dj = false;
      m = H;
      if (o.careful && E) {
        const esc = s.kit.escape;
        for (let i = 0; i < E.rocks.length; i++) {
          const r = E.rocks[i];
          const st = esc.rock[i] ?? 0;
          const seen = st === 2 || (st === 1 && (esc.rockT[i] ?? 0) >= lag);
          if (r && seen && r.x + r.w / 2 > g.x0 && r.x - r.w / 2 < g.x1 && r.y1 <= g.top + 4) m = 0;
        }
      }
      const near = dir > 0 ? g.x0 - cx : cx - g.x1;
      const here = stands[Math.max(0, this.next - 1)];
      const lip = here && Math.abs(fy - here.top) <= 4 ? (dir > 0 ? here.x1 - cx : cx - here.x0) : 999;
      if (m && f - this.jumped > 12 && (near < 150 || lip < 24) && this.next < last) {
        m |= J;
        this.jumped = f;
      }
      // (Off the heap: at the den's east wall, a jump into it, then the claws up it.)
      if (this.next === last && fy > 500) {
        m = R;
        if (cx > 3180 && f - this.jumped > 12) {
          m |= J;
          this.jumped = f;
        }
      }
    } else {
      const over = cx >= g.x0 && cx <= g.x1;
      m = Math.abs(cx - gx) < 16 ? 0 : cx < gx ? R : L;
      if (this.next === last) {
        m = R;
        if (p.wallDir === 1 || p.mode === 'wallSlide') {
          if (this.wallT < 0) this.wallT = f;
          if (f - this.wallT >= delay && !(this.prev & J)) {
            m |= J;
            this.jumped = f;
            this.wallT = -1;
          }
        } else this.wallT = -1;
      }
      if (f - this.jumped < 22) m |= J;
      if (!this.dj && p.vy > 0 && (fy > g.top - 16 || this.next === last) && !over) {
        m |= J;
        this.dj = true;
      }
      if (this.dj && p.vy < 0) m |= J;
    }
    this.prev = m;
    return m;
  }
}
