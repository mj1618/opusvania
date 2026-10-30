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
import {
  backEdgeShade,
  backMask,
  drawDeepBack,
  drawMidBack,
  INTERIOR,
  type InteriorPlan,
  interiorPlan,
} from '../lib/interior';
import { massCore, massTone } from '../lib/pf-mass';
import { chaikin, hash1, wobble } from '../lib/pf-shape';
import { LOOK } from '../lib/room-look';

/** How far the mass beyond the room's edges reaches (px): past the widest view and the parallax. */
const BEYOND = 3200;
/** The boss's snuffed lamp (review r4 #5): seconds the dark takes to spread, how much it takes off the back and off
 * the room's bake, and how far round the lamp the growth's light goes out with it (px). */
const SNUFF = { secs: 1.5, back: 0.36, near: 0.16, reach: 700 };
/** The share of the room its backs must cover for the wood to close in past its edges. */
const ENCLOSED = 0.35;

export class InteriorLayer implements EnvModule {
  private plan: InteriorPlan | null = null;
  private readonly deep = new Graphics({ label: 'interior-deep' });
  private readonly mask = new Graphics({ label: 'interior-mask' });
  private readonly mid = new Graphics({ label: 'interior-mid' });
  private readonly midMask = new Graphics({ label: 'interior-mid-mask' });
  private readonly beyond = new Graphics({ label: 'interior-beyond' });
  private readonly edge = new Graphics({ label: 'interior-edge' });
  private readonly edgeMask = new Graphics({ label: 'interior-edge-mask' });
  private readonly beads = new Graphics({ label: 'interior-beads' });
  /** The worms' beads near a boss's lamp (they go out with it) and the dark that spreads when it is snuffed. */
  private readonly beadsNear = new Graphics({ label: 'interior-beads-near' });
  private readonly darkBack = new Graphics({ label: 'interior-snuff-back' });
  private readonly darkNear = new Graphics({ label: 'interior-snuff-near' });
  /** The lamp a boss puts out as its last phase begins (`snuffs`): its index and x; the dark's render time. */
  private snuff: { i: number; x: number; y: number } | null = null;
  private snuffT = 0;
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
    // The mid plane (review r5 #7), masked to the same backs.
    const padMid = Math.max(W, H) * (1 - INTERIOR.midParallax) + 240;
    drawMidBack(this.mid, plan, LOOK.seed, padMid, massTone(room).body);
    ctx.layers.get('interiorMid').addChild(this.mid);
    for (const m of polys) this.midMask.poly(m).fill({ color: 0xffffff });
    airBack.addChild(this.midMask);
    this.mid.mask = this.midMask;
    // The torn edge falls into shadow (review r3 #2: where a back met open air its hard mask edge cut flat pale shapes
    // out of the night: the Grove's and the hub's "mint"): bands following the edge inward (inside only: a twin mask).
    for (const m of polys) this.edgeMask.poly(m).fill({ color: 0xffffff });
    for (const band of backEdgeShade(plan, LOOK.seed))
      this.edge.poly(band.pts).fill({ color: plan.tone.grain, alpha: band.alpha });
    airBack.addChild(this.edgeMask, this.edge);
    this.edge.mask = this.edgeMask;

    // Beyond the room: the wood's body all round, a dark way on through each exit. (Only in a room that is mostly
    // enclosed: a glade with a back for one pocket keeps its sky past the edges.)
    const backArea = plan.backs.reduce((a, b) => a + b.w * b.h, 0);
    if (backArea >= ENCLOSED * W * H) this.paintBeyond(ctx, plan);

    // The lamp a boss snuffs (the den's taproot wick, review r4 #5: phase 3's dark did not show).
    const named = (room.enemies ?? []).find((e) => (e as { snuffs?: string }).snuffs);
    const lures = (room as { lures?: Array<{ id: string; x: number; y: number }> }).lures ?? [];
    const li = named ? lures.findIndex((l) => l.id === (named as { snuffs?: string }).snuffs) : -1;
    const lure = lures[li];
    if (lure) this.snuff = { i: li, x: lure.x, y: lure.y };
    // The glow worms' beads (their threads are baked).
    for (const l of plan.lights) {
      if (l.kind !== 'worm') continue;
      const g = this.snuff && Math.abs(l.x - this.snuff.x) < SNUFF.reach ? this.beadsNear : this.beads;
      const n = 3 + Math.floor(hash1(l.seed, 3) * 4);
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 0.5);
        g.circle(l.x + Math.sin(t * 5 + l.seed) * 2, l.y + l.s * t, 2.2 + 1.2 * (1 - t)).fill({
          color: l.violet ? 0xe8d0ff : 0xd8fcff,
          alpha: 0.95,
        });
      }
    }
    this.root.addChild(this.glow.container, this.beads, this.beadsNear);
    ctx.layers.get('goal').addChildAt(this.root, 0);
    if (this.snuff) {
      airBack.addChild(this.darkBack);
      ctx.layers.get('goal').addChildAt(this.darkNear, 0);
    }
    // (In front of the room's bake, so its ragged lip overhangs the back; under the light and everything alive.)
    ctx.layers.get('goal').addChildAt(this.beyond, 0);
  }

  /** The wood beyond the room's edges (see the module comment). */
  private paintBeyond(ctx: SceneContext, plan: InteriorPlan): void {
    const room = ctx.scene;
    const W = room.width;
    const H = room.height;

    const g = this.beyond;
    // (Canopy r8: the core, not the body: the wood beyond the edge is the same near-black as deep in its masses.)
    const body = massCore(massTone(room));
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
    // The snuff: once the boss's lamp is out, the dark spreads out from it over SNUFF.secs.
    let dk = 0;
    const sn = this.snuff;
    if (sn) {
      const out = (frame.sim.lures.hp[sn.i] ?? 1) <= 0;
      this.snuffT = out ? this.snuffT + frame.dt : 0;
      dk = Math.min(1, this.snuffT / SNUFF.secs);
      this.paintSnuff(frame, dk);
    }
    this.glow.begin();
    for (const l of plan.lights) {
      if (Math.abs(l.x - cam.x) > hw + l.len || Math.abs(l.y - cam.y) > hh + l.len) continue;
      if (sn && dk > 0 && Math.abs(l.x - sn.x) < SNUFF.reach && l.kind !== 'sap') {
        // (Near the lamp the growth's light goes with it; the shafts and spores dim.)
        if (l.kind === 'worm' || l.kind === 'fungus' || l.kind === 'moss') {
          if (dk >= 1) continue;
        }
      }
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
        // (A clump's light, not a dot: small cores scattered up and down it.)
        for (let k = 0; k < 5; k++)
          this.glow.add(
            l.x + l.dir * l.s * (0.2 + 0.4 * hash1(l.seed + k, 21)),
            l.y + (hash1(l.seed + k, 23) * 2 - 1) * l.s * 1.3,
            10 + 8 * hash1(l.seed + k, 25),
            col,
            0.45 * breathe,
            8,
          );
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

  /**
   * The den in its last phase: the back darkens by `SNUFF.back` and the room's bake by `SNUFF.near`, spreading out from
   * the snuffed lamp (strips, each dark once the front has passed it); the beads near the lamp fade out.
   */
  private paintSnuff(frame: SceneFrame, dk: number): void {
    const sn = this.snuff;
    if (!sn) return;
    const room = frame.sim.scene;
    const W = room.width;
    const H = room.height;
    this.darkBack.clear();
    this.darkNear.clear();
    this.beadsNear.alpha = 1 - dk;
    if (dk <= 0) return;
    const front = dk * Math.max(sn.x, W - sn.x) * 1.15;
    const st = 64;
    for (let x = -400; x < W + 400; x += st) {
      const d = Math.abs(x + st / 2 - sn.x);
      const k = Math.max(0, Math.min(1, (front - d) / 500 + 0.15 * dk));
      if (k <= 0) continue;
      // (Deepest near the lamp: its light is what left.)
      const near = 1 + 0.35 * Math.max(0, 1 - d / SNUFF.reach);
      this.darkBack
        .rect(x, -400, st, H + 800)
        .fill({ color: 0x020304, alpha: Math.min(0.75, SNUFF.back * k * near) });
      this.darkNear
        .rect(x, -400, st, H + 800)
        .fill({ color: 0x020304, alpha: Math.min(0.5, SNUFF.near * k * near) });
    }
  }

  destroy(): void {
    this.deep.mask = null;
    this.mid.mask = null;
    this.edge.mask = null;
  }
}
