/**
 * The inside of the wood, live (canopy review r2 #1, #2, #3; the layout and painters are lib/interior.ts):
 *
 *   interiorDeep   the deep back: heartwood grain or earth strata, a fog band, at parallax 0.86, masked to the room's
 *                  backs (torn where a back meets open air), so a carved room has depth and never shows the forest
 *   goal (bottom)  the mass beyond the room's edges (a camera that sees past the room box sees wood, not sky), with
 *                  a tunnel's dark where an exit goes on
 *   goal (bottom)  the light of the glowing growth: moss on the tops, fungus on the faces, glow worms' beads under
 *                  the undersides, moonlight shafts through a root room's ceiling, spores drifting in dark cells
 *
 * Only in a wood room with `marks.backs` (an enclosed room). Render time only; reads the scene, never the sim.
 */
import { Container, Graphics } from 'pixi.js';
import { GlowPool } from '../../lantern/glow';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { backMask, drawDeepBack, INTERIOR, type InteriorPlan, interiorPlan } from '../lib/interior';
import { MASS } from '../lib/pf-mass';
import { chaikin, hash1, wobble } from '../lib/pf-shape';
import { LOOK } from '../lib/room-look';

/** How far the mass beyond the room's edges reaches (px): past the widest view and the parallax. */
const BEYOND = 3200;
/** The share of the room its backs must cover for the wood to close in past its edges. */
const ENCLOSED = 0.35;

export class InteriorLayer implements EnvModule {
  private plan: InteriorPlan | null = null;
  private readonly deep = new Graphics({ label: 'interior-deep' });
  private readonly mask = new Graphics({ label: 'interior-mask' });
  private readonly beyond = new Graphics({ label: 'interior-beyond' });
  private readonly edge = new Graphics({ label: 'interior-edge' });
  private readonly edgeMask = new Graphics({ label: 'interior-edge-mask' });
  private readonly beads = new Graphics({ label: 'interior-beads' });
  private readonly glow = new GlowPool('interior-glow');
  private readonly root = new Container({ label: 'interior-light' });

  init(ctx: SceneContext): void {
    const room = ctx.scene;
    this.plan = interiorPlan(room, LOOK.seed);
    const plan = this.plan;
    if (!plan) return;
    const W = room.width;
    const H = room.height;
    // The deep back, padded by what the parallax can shift it (the room's size times 1 - p).
    const pad = Math.max(W, H) * (1 - INTERIOR.deepParallax) + 240;
    drawDeepBack(this.deep, plan, LOOK.seed, pad);
    ctx.layers.get('interiorDeep').addChild(this.deep);
    const polys = backMask(plan, LOOK.seed);
    for (const m of polys) this.mask.poly(m).fill({ color: 0xffffff });
    const airBack = ctx.layers.get('airBack');
    airBack.addChild(this.mask);
    this.deep.mask = this.mask;
    // The torn edge falls into shadow (review r3 #2: where a back met open air its hard mask edge cut flat pale shapes
    // out of the night: the Grove's and the hub's "mint"): dark bands along it, inside only (masked by a twin).
    for (const m of polys) {
      this.edgeMask.poly(m).fill({ color: 0xffffff });
      for (const [w, a] of [
        [360, 0.22],
        [220, 0.28],
        [110, 0.34],
      ] as const)
        this.edge.poly(m).stroke({ color: plan.tone.grain, width: w, alpha: a, join: 'round' });
    }
    airBack.addChild(this.edgeMask, this.edge);
    this.edge.mask = this.edgeMask;

    // Beyond the room: the wood's body all round, a dark way on through each exit. (Only in a room that is mostly
    // enclosed: a glade with a back for one pocket keeps its sky past the edges.)
    const backArea = plan.backs.reduce((a, b) => a + b.w * b.h, 0);
    if (backArea >= ENCLOSED * W * H) this.paintBeyond(ctx, plan);

    // The glow worms' beads (their threads are baked).
    for (const l of plan.lights) {
      if (l.kind !== 'worm') continue;
      const n = 3 + Math.floor(hash1(l.seed, 3) * 4);
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 0.5);
        this.beads.circle(l.x + Math.sin(t * 5 + l.seed) * 2, l.y + l.s * t, 2.2 + 1.2 * (1 - t)).fill({
          color: l.violet ? 0xe8d0ff : 0xd8fcff,
          alpha: 0.95,
        });
      }
    }
    this.root.addChild(this.glow.container, this.beads);
    ctx.layers.get('goal').addChildAt(this.root, 0);
    // (In front of the room's bake, so its ragged lip overhangs the back; under the light and everything alive.)
    ctx.layers.get('goal').addChildAt(this.beyond, 0);
  }

  /** The wood beyond the room's edges (see the module comment). */
  private paintBeyond(ctx: SceneContext, plan: InteriorPlan): void {
    const room = ctx.scene;
    const W = room.width;
    const H = room.height;

    const g = this.beyond;
    const body = MASS.body;
    const exits = (room as { exits?: Array<{ edge: string; from: number; to: number }> }).exits ?? [];
    const gaps = (edge: string): Array<[number, number]> =>
      exits.filter((e) => e.edge === edge).map((e) => [e.from, e.to] as [number, number]);
    const band = (edge: 'n' | 's' | 'w' | 'e'): void => {
      const along = edge === 'n' || edge === 's' ? W : H;
      const cuts = gaps(edge).sort((a, b) => a[0] - b[0]);
      let a = -BEYOND;
      const segs: Array<[number, number]> = [];
      for (const [c0, c1] of cuts) {
        segs.push([a, c0]);
        a = c1;
      }
      segs.push([a, along + BEYOND]);
      for (const [s0, s1] of segs) {
        if (s1 <= s0) continue;
        if (edge === 'n') g.rect(s0, -BEYOND, s1 - s0, BEYOND);
        else if (edge === 's') g.rect(s0, H, s1 - s0, BEYOND);
        else if (edge === 'w') g.rect(-BEYOND, s0, BEYOND, s1 - s0);
        else g.rect(W, s0, BEYOND, s1 - s0);
      }
      g.fill({ color: body });
      // Through an exit: the way goes on into the dark (the tone of the back, fading to the body).
      for (const [c0, c1] of cuts) {
        // The deep back's tone down the way (it reads as space, not as a hole in the page), darkening as it goes.
        if (edge === 'n') g.rect(c0, -BEYOND, c1 - c0, BEYOND);
        else if (edge === 's') g.rect(c0, H, c1 - c0, BEYOND);
        else if (edge === 'w') g.rect(-BEYOND, c0, BEYOND, c1 - c0);
        else g.rect(W, c0, BEYOND, c1 - c0);
        g.fill({ color: plan.tone.deep });
        // (The way narrows as it goes and the dark closes over it: a tunnel's mouth, not a lit slot.)
        for (let k = 0; k < 12; k++) {
          const d = k * 40;
          const a2 = Math.min(1, 0.45 + k * 0.06);
          const pinch = Math.min((c1 - c0) * 0.45, k * k * 1.6);
          const lo = c0 + pinch;
          const hi = c1 - pinch;
          const strip = (u0: number, u1: number, d0: number, dd: number): void => {
            if (edge === 'n') g.rect(u0, -d0 - dd, u1 - u0, dd);
            else if (edge === 's') g.rect(u0, H + d0, u1 - u0, dd);
            else if (edge === 'w') g.rect(-d0 - dd, u0, dd, u1 - u0);
            else g.rect(W + d0, u0, dd, u1 - u0);
          };
          strip(lo, hi, d, 40);
          g.fill({ color: body, alpha: a2 });
          strip(c0, lo, d, 40);
          strip(hi, c1, d, 40);
          g.fill({ color: body });
        }
        if (edge === 'n') g.rect(c0, -BEYOND, c1 - c0, BEYOND - 480);
        else if (edge === 's') g.rect(c0, H + 480, c1 - c0, BEYOND);
        else if (edge === 'w') g.rect(-BEYOND, c0, BEYOND - 480, c1 - c0);
        else g.rect(W + 480, c0, BEYOND, c1 - c0);
        g.fill({ color: body });
      }
    };
    band('n');
    band('s');
    band('w');
    band('e');
    // Where the room's edge is open air (no mass on it), the wood beyond overhangs it raggedly: no ruled line.
    const solids = room.solids.filter((q) => q.tag === 'root' || q.tag === 'ground');
    const solidAt = (x: number, y: number) =>
      solids.some((q) => x >= q.x - 2 && x <= q.x + q.w + 2 && y >= q.y - 2 && y <= q.y + q.h + 2);
    const inGap = (edge: string, v: number) => gaps(edge).some(([a, b]) => v > a - 40 && v < b + 40);
    const lip = (edge: 'n' | 's' | 'w' | 'e'): void => {
      const along = edge === 'n' || edge === 's' ? W : H;
      const st = 16;
      const at = (v: number, d: number): [number, number] =>
        edge === 'n' ? [v, d] : edge === 's' ? [v, H - d] : edge === 'w' ? [d, v] : [W - d, v];
      // Runs of open edge; each gets one smooth hanging lip (lumps and a few long drips).
      let run: number[] = [];
      const flush = (): void => {
        if (run.length >= 4) {
          const v0 = run[0] as number;
          const v1 = run[run.length - 1] as number;
          const pts: number[] = [...at(v0, -4)];
          for (const v of run) {
            const lump =
              16 + 34 * Math.max(0, wobble(v, LOOK.seed + 3, 140)) + 22 * wobble(v, LOOK.seed + 9, 50) ** 2;
            const ease = Math.min(1, (v - v0) / 60, (v1 - v) / 60);
            pts.push(...at(v, Math.max(0, lump * ease)));
          }
          pts.push(...at(v1, -4));
          g.poly(chaikin(pts, 2)).fill({ color: body });
        }
        run = [];
      };
      for (let v = 0; v <= along; v += st) {
        const [px, py] = at(v, 1);
        if (solidAt(px, py) || inGap(edge, v)) flush();
        else run.push(v);
      }
      flush();
    };
    lip('n');
    lip('s');
    lip('w');
    lip('e');
    // (The corners.)
    g.rect(-BEYOND, -BEYOND, BEYOND, BEYOND).rect(W, -BEYOND, BEYOND, BEYOND);
    g.rect(-BEYOND, H, BEYOND, BEYOND).rect(W, H, BEYOND, BEYOND);
    g.fill({ color: body });
  }

  update(frame: SceneFrame): void {
    const plan = this.plan;
    if (!plan) return;
    const { clock, camera: cam } = frame;
    const hw = cam.w / 2 / cam.zoom + 400;
    const hh = cam.h / 2 / cam.zoom + 400;
    const I = INTERIOR;
    this.glow.begin();
    for (const l of plan.lights) {
      if (Math.abs(l.x - cam.x) > hw + l.len || Math.abs(l.y - cam.y) > hh + l.len) continue;
      const ph = hash1(l.seed, 7) * 6.28;
      const breathe = 0.85 + 0.15 * Math.sin(clock * (0.7 + hash1(l.seed, 9) * 0.6) + ph);
      const col = l.violet ? I.violet : plan.look === 'shaft' ? I.frost : I.cyan;
      if (l.kind === 'sap') {
        // Amber beads: a small warm glow, steady (sap, not a lamp: no pull, no moths).
        this.glow.add(l.x - l.dir * 6, l.y, l.s * 2.2, I.sap, 0.22 * breathe, l.s * 2.6);
        this.glow.add(l.x - l.dir * 6, l.y, l.s * 0.7, 0xffd8a0, 0.35 * breathe, l.s * 0.9);
      } else if (l.kind === 'larva') {
        this.glow.add(l.x, l.y, l.s * 2.4, I.larva, 0.2 * breathe, l.s * 1.8);
        this.glow.add(l.x, l.y, l.s * 0.9, 0xf4f8d8, 0.35 * breathe, l.s * 0.6);
      } else if (l.kind === 'beam') {
        // The moonlit shaft's key: one tall cold beam, motes turning slowly in it.
        const mx = l.x;
        const my = l.y + l.len * 0.5;
        this.glow.add(mx, my, l.s * 0.5, I.moon, 0.14 * breathe, l.len * 0.52, l.dir);
        this.glow.add(mx, my, l.s * 0.2, 0xe8f2ff, 0.12 * breathe, l.len * 0.5, l.dir);
        if (Math.abs(cam.y - my) < hh + l.len * 0.5)
          for (let k = 0; k < 30; k++) {
            const u = (hash1(l.seed + k, 13) + clock * (0.01 + 0.01 * hash1(k, 17))) % 1;
            const y = l.y + l.len * u;
            if (Math.abs(y - cam.y) > hh) continue;
            const across = (hash1(l.seed + k, 19) - 0.5) * l.s * 0.7 + Math.sin(clock * 0.4 + k) * 10;
            this.glow.add(l.x + across, y, 3, 0xeef4ff, 0.55 * Math.sin(u * Math.PI * 7) ** 2, 3);
          }
      } else if (l.kind === 'trail') {
        // The ants' trail: a dotted line of pale light walking along the floor.
        const n = Math.floor(l.len / 26);
        for (let k = 0; k < n; k++) {
          const u = (((k / n + clock * 0.012) % 1) + 1) % 1;
          const x = l.x + l.len * u;
          if (Math.abs(x - cam.x) > hw) continue;
          const tw = 0.5 + 0.5 * Math.sin(clock * 3 + k * 1.3);
          this.glow.add(x, l.y - 3, 4, I.larva, 0.45 * tw, 2.5);
        }
      } else if (l.kind === 'moss') {
        this.glow.add(l.x, l.y - 6, l.s * 2.6, I.cyanDeep, 0.3 * breathe, l.s * 1.3);
        this.glow.add(l.x, l.y - 4, l.s * 1.2, col, 0.38 * breathe, l.s * 0.5);
      } else if (l.kind === 'fungus') {
        this.glow.add(
          l.x + l.dir * l.s * 0.8,
          l.y,
          l.s * 4.5,
          l.violet ? I.violet : I.cyanDeep,
          0.28 * breathe,
          l.s * 3.5,
        );
        this.glow.add(l.x + l.dir * l.s * 0.5, l.y + 4, l.s * 1.6, col, 0.55 * breathe, l.s * 0.9);
      } else if (l.kind === 'worm') {
        this.glow.add(l.x, l.y + l.s * 0.55, 34, col, 0.2 * breathe, l.s * 0.7);
        const n = 3 + Math.floor(hash1(l.seed, 3) * 4);
        for (let k = 0; k < n; k++) {
          const t = (k + 1) / (n + 0.5);
          const tw = 0.6 + 0.4 * Math.sin(clock * 2.1 + k * 1.7 + ph);
          this.glow.add(l.x, l.y + l.s * t, 12, col, 0.5 * tw, 12);
        }
      } else if (l.kind === 'shaft') {
        // A long soft beam slanting down from the crack, a pool where it lands, motes turning in it.
        const ang = l.dir;
        const mx = l.x + Math.sin(-ang) * l.len * 0.5;
        const my = l.y + l.len * 0.5;
        this.glow.add(mx, my, l.s * 0.5, I.moon, 0.16 * breathe, l.len * 0.55, ang);
        this.glow.add(mx, my, l.s * 0.22, I.moon, 0.14 * breathe, l.len * 0.5, ang);
        this.glow.add(l.x, l.y + 30, l.s * 0.6, I.moon, 0.3, 40);
        this.glow.add(l.x + Math.sin(-ang) * l.len, l.y + l.len - 10, l.s * 1.4, I.moon, 0.14 * breathe, 30);
        for (let k = 0; k < 10; k++) {
          const u = (hash1(l.seed + k, 13) + clock * (0.02 + 0.02 * hash1(k, 17))) % 1;
          const across = (hash1(l.seed + k, 19) - 0.5) * l.s * 0.6;
          this.glow.add(
            l.x + Math.sin(-ang) * l.len * u + across,
            l.y + l.len * u,
            3,
            0xeef4ff,
            0.6 * Math.sin(u * Math.PI),
            3,
          );
        }
      } else if (l.kind === 'spore') {
        this.glow.add(l.x, l.y, l.s * 1.4, I.cyanDeep, 0.08 * breathe, l.s);
        for (let k = 0; k < 14; k++) {
          const a = hash1(l.seed + k, 23) * 6.28 + clock * (0.1 + 0.1 * hash1(k, 29));
          const rr = l.s * (0.3 + 0.7 * hash1(l.seed + k, 31));
          const x = l.x + Math.cos(a) * rr;
          const y = l.y + Math.sin(a * 0.7) * rr * 0.6 - ((clock * 8 + k * 30) % 60);
          const tw = 0.5 + 0.5 * Math.sin(clock * 1.5 + k * 2.3);
          this.glow.add(x, y, 7, I.cyan, 0.5 * tw, 7);
        }
      }
    }
    this.glow.end();
  }

  destroy(): void {
    this.deep.mask = null;
    this.edge.mask = null;
  }
}
