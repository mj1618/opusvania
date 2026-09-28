import { AlphaFilter, Container, Graphics } from 'pixi.js';
import type { Game } from '../../game';
import { boxAt, type Rect } from '../../sim/combat/boxes';
import type { SimEvent } from '../../sim/events';
import { moveDef } from '../../sim/player/moves';
import type { MoveState, PlayerState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { colourHex, PALETTE } from '../palette';
import { anchors, type BodyExtras, buildKid, type Glow } from './body';
import { Chain } from './chain';
import { ANIM, BODY, CHAINS, KID } from './look';
import { add, clamp01, rot, scale, type V2, v } from './math';
import { followPose, LONG_AGO, mixPose, movePhase, newMem, type Pose, type RigMem, targetPose } from './pose';
import { type Prim, Prims, paint } from './prims';
import { dirToWorld, type Joints, solve, toWorld, type Xf } from './skeleton';

/** Per-draw inputs from WorldRenderer (all render-side). */
export interface RigDrawOpts {
  /** Interpolated top-left of Kid's box (world px). */
  kid: V2;
  alpha: number;
  /** Juice squash (src/render/fx.ts) and the weight-class silhouette scale. */
  squash: readonly [number, number];
  weight: readonly [number, number];
  /** Flat tint flash (clean slip white, catch gold), or null. */
  tint: number | null;
  /** Opacity multiplier (hurt i-frame flicker, respawn shimmer). */
  opacity: number;
  /** Gym death pop: age in frames, or null. */
  deathAge: number | null;
  deathHold: number;
  deathPopScale: number;
}

interface Ghost {
  list: Prim[];
  age: number;
}

interface Orb {
  colour: number;
  from: V2;
  age: number;
}

interface FlyingCap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  facing: number;
  age: number;
}

const CAP_PTS: V2[] = [
  v(-11, -1),
  v(-12, -5.5),
  v(-8, -10.5),
  v(0, -12.8),
  v(8.5, -11.8),
  v(14, -7.8),
  v(18.6, -1.8),
  v(6, -1.4),
  v(-4, -2),
];

/**
 * Kid Tallow's cutout rig (PLAN §5.3): a code-drawn skeleton posed procedurally from sim state and
 * move frame data, with verlet secondary motion (coat tails, cap feather, the sack), glove trails,
 * strike smears that cover the real hitbox, Slip afterimages, and emissive eyes/sack/feather.
 *
 * Render only: it reads `game.state` and step events and never writes the sim. Everything that
 * changes over time is stepped once per sim step (`step`) and reset with the room, so clips and
 * restored snapshots redraw identically; `draw` only interpolates between the last two steps.
 */
export class KidRig {
  /** Actors-layer node: ghosts, trails, body, flash, front smears. */
  readonly node = new Container({ label: 'kid-rig' });
  private readonly ghostLayer = new Container({ label: 'kid-ghosts' });
  private readonly back = new Graphics({ label: 'kid-trails' });
  private readonly body = new Graphics({ label: 'kid-body' });
  private readonly flash = new Graphics({ label: 'kid-flash' });
  private readonly front = new Graphics({ label: 'kid-smears' });
  private readonly ghostPool: Graphics[] = [];

  private mem: RigMem = newMem();
  private cur: Pose | null = null;
  private prev: Pose | null = null;
  private readonly chains = {
    tail: new Chain(CHAINS.tail),
    tailFar: new Chain(CHAINS.tailFar),
    feather: new Chain(CHAINS.feather),
    sack: new Chain(CHAINS.sack),
  };
  private trailF: V2[] = [];
  private trailB: V2[] = [];
  private ghosts: Ghost[] = [];
  private orb: Orb | null = null;
  private cap: FlyingCap | null = null;
  private sackPulse = 0;
  /** Steps of white hit flash left (counts through hitstop, unlike the pose clocks). */
  private hurtFlash = 0;
  private lastFacing = 0;
  private dashFrames = 0;
  private hazardFlash: { list: Prim[]; age: number } | null = null;
  private lastList: Prim[] = [];
  private frozen = false;
  /** World joints as last drawn (for overlays: the Seize hand starts at her glove). */
  hands = { F: v(0, 0), B: v(0, 0), head: v(0, 0), mouth: v(0, 0) };

  constructor(private readonly game: Game) {
    this.node.addChild(this.ghostLayer, this.back, this.body, this.flash, this.front);
    // Supersample: the canvas has no MSAA, so render her at 2x and filter down (soft edges at 80 px).
    this.node.filters = [new AlphaFilter({ alpha: 1, resolution: 2, antialias: 'on' })];
  }

  reset(): void {
    this.mem = newMem();
    this.cur = null;
    this.prev = null;
    for (const c of Object.values(this.chains)) c.reset();
    this.trailF = [];
    this.trailB = [];
    this.ghosts = [];
    this.orb = null;
    this.cap = null;
    this.sackPulse = 0;
    this.hurtFlash = 0;
    this.lastFacing = 0;
    this.dashFrames = 0;
    this.hazardFlash = null;
    this.lastList = [];
    this.frozen = false;
  }

  // --- stepping (once per sim step) ---

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const p = s.player;
    const m = this.mem;
    m.frame = s.frame;
    this.frozen = s.hitstop > 0 && !events.some((e) => e.type === 'hitstop');
    const tick = (k: keyof RigMem): void => {
      const val = m[k];
      if (typeof val === 'number' && val < LONG_AGO) (m[k] as number) = val + 1;
    };
    if (!this.frozen) {
      for (const k of [
        'landT',
        'jumpT',
        'wallJumpT',
        'djT',
        'pogoT',
        'hurtT',
        'riseT',
        'flexT',
        'spillT',
        'turnT',
        'tickT',
      ] as const)
        tick(k);
    }
    let snapChains = this.cur === null;
    for (const e of events) {
      switch (e.type) {
        case 'land':
          m.landT = 0;
          m.landK = clamp01(0.35 + Math.max(0, e.vy) / tuning.jump.fastFallMax) * (e.hard ? 1.25 : 1);
          break;
        case 'jump':
          m.jumpT = 0;
          if (e.kind === 'wall') m.wallJumpT = 0;
          if (e.kind === 'double') m.djT = 0;
          break;
        case 'pogo':
          m.pogoT = 0;
          break;
        case 'hurt':
          m.hurtT = 0;
          this.hurtFlash = 4;
          break;
        case 'beatCountRise':
          m.riseT = 0;
          break;
        case 'swallowCommit':
          m.flexT = 0;
          this.sackPulse = 1;
          break;
        case 'swallowSpill':
          m.spillT = 0;
          break;
        case 'kidDown':
        case 'beatCountTick':
          m.tickT = 0;
          break;
        case 'moveStart': {
          m.took = false;
          m.levyColour = null;
          if (e.move === 'levy') {
            const id = s.local.bag[s.local.bag.length - 1];
            const snd = s.local.sounds.find((q) => q.id === id);
            m.levyColour = snd ? snd.colour : null;
          }
          break;
        }
        case 'seizeTake':
          m.took = true;
          this.orb = { colour: colourHex(e.colour), from: { ...this.hands.F }, age: -3 };
          break;
        case 'levyThrow':
          m.levyColour = null;
          this.sackPulse = 1;
          break;
        case 'death':
          m.hurtT = 0;
          this.launchCap(p, 1);
          break;
        case 'hazard':
          this.hazardFlash = { list: this.lastList, age: 0 };
          break;
        case 'respawn':
        case 'roomEnter':
          snapChains = true;
          this.cap = null;
          this.ghosts = [];
          this.trailF = [];
          this.trailB = [];
          m.hurtT = LONG_AGO;
          break;
        default:
          break;
      }
    }
    if (faceOf(p) !== this.lastFacing) {
      if (this.lastFacing !== 0) m.turnT = 0;
      this.lastFacing = faceOf(p);
    }
    const still = p.grounded && Math.abs(p.vx) < 0.5 && !p.move && p.state === 'normal';
    m.idleT = still ? m.idleT + 1 : 0;
    if (p.grounded && !this.frozen) m.runDist += Math.abs(p.vx);
    if (this.hurtFlash > 0) this.hurtFlash--;
    if (this.sackPulse > 0) this.sackPulse = Math.max(0, this.sackPulse - 1 / ANIM.sackPulseFrames);
    if (this.hazardFlash && ++this.hazardFlash.age > 10) this.hazardFlash = null;
    this.stepCap();
    this.stepOrb();
    for (const g of this.ghosts) g.age++;
    this.ghosts = this.ghosts.filter((g) => g.age < ANIM.afterimageLife);

    if (this.frozen) {
      // Hitstop: hold everything (no interpolation drift either).
      if (this.cur) this.prev = this.cur;
      return;
    }

    const res = targetPose({ p, mem: m, maxRun: tuning.run.maxSpeed, maxFall: tuning.jump.maxFall }, (mv) =>
      this.reach(p, mv),
    );
    const next = this.cur ? followPose(this.cur, res.pose, res.rate, res.snap) : res.pose;
    this.prev = this.cur ?? next;
    this.cur = next;

    // Chains and trails live in world space at the step position.
    const feet = v(p.x + p.w / 2, p.y + p.h);
    const xf = this.xfFor(next, feet, faceOf(p), [1, 1]);
    const j = solve(next);
    this.stepChains(j, xf, next, p, snapChains);
    const rel = (q: V2): V2 => ({ x: q.x - feet.x, y: q.y - feet.y });
    const gF = toWorld(xf, j.haF);
    const gB = toWorld(xf, j.haB);
    this.trailF.push(gF, rel(gF));
    this.trailB.push(gB, rel(gB));
    const keep = ANIM.trailLen * 2;
    if (this.trailF.length > keep) this.trailF.splice(0, this.trailF.length - keep);
    if (this.trailB.length > keep) this.trailB.splice(0, this.trailB.length - keep);

    // Slip afterimages: her silhouette, every few frames.
    if (p.state === 'dash' && p.freeze === 0) {
      if (this.dashFrames % ANIM.afterimageEvery === 0) {
        const pr = new Prims(xf);
        buildKid(pr, j, next, this.extras(p, this.chainPts(1, v(0, 0))), { circles: [], lines: [] });
        this.ghosts.push({ list: pr.list, age: 0 });
      }
      this.dashFrames++;
    } else this.dashFrames = 0;
  }

  private xfFor(pose: Pose, feet: V2, facing: number, extra: readonly [number, number]): Xf {
    return {
      x: feet.x,
      y: feet.y,
      facing,
      sx: pose.sx * extra[0],
      sy: pose.sy * extra[1],
      spin: pose.spin,
      drop: pose.drop,
    };
  }

  /** Rig-space point a strike's glove aims at: the far end of the move's hitbox. */
  private reach(p: PlayerState, m: MoveState): V2 {
    const b = this.box(p, m, p.x, p.y);
    if (!b) return v(30, -50);
    const cx = p.x + p.w / 2;
    const feetY = p.y + p.h;
    const r = BODY.gloveR;
    const toRig = (wx: number, wy: number): V2 => v((wx - cx) * m.facing, wy - feetY);
    if (m.dir === 'up') return toRig(b.x + b.w / 2 + m.facing * 6, b.y + r);
    if (m.dir === 'down') return toRig(b.x + b.w / 2 + m.facing * 4, b.y + b.h - r);
    const far = m.facing > 0 ? b.x + b.w : b.x;
    return toRig(far - m.facing * r, b.y + b.h / 2);
  }

  private box(p: PlayerState, m: MoveState, x: number, y: number): Rect | null {
    const d = moveDef(m.id);
    const b = d.hitboxes[m.dir] ?? d.hitboxes.fwd;
    if (!b) return null;
    const r = boxAt(x, y, p.w, m.facing, b);
    if (m.counter) {
      const k = tuning.kid.counterBoxScale;
      const gx = Math.round((r.w * (k - 1)) / 2);
      const gy = Math.round((r.h * (k - 1)) / 2);
      return { x: r.x - gx, y: r.y - gy, w: r.w + 2 * gx, h: r.h + 2 * gy };
    }
    return r;
  }

  private stepChains(j: Joints, xf: Xf, pose: Pose, p: PlayerState, snap: boolean): void {
    const a = anchors(j);
    const floor = (p.grounded && pose.spin === 0) || p.down ? xf.y + 1 : null;
    const air = !p.grounded;
    const flutter = air ? Math.sin(this.mem.frame * 0.9) * 0.35 : 0;
    const back = (x: number, y: number): V2 => dirToWorld(xf, rotLean(v(x, y), pose.lean * 0.5));
    const wind = v(-p.vx * 0.04, -Math.min(0, p.vy) * 0.02 + flutter);
    this.chains.tail.step(toWorld(xf, a.tail), back(-0.42, 0.9), floor, wind, snap);
    this.chains.tailFar.step(toWorld(xf, a.tailFar), back(-0.5, 0.86), floor, wind, snap);
    const fd = dirToWorld(xf, rotLean(v(-0.72, -0.7), pose.lean + pose.head));
    this.chains.feather.step(toWorld(xf, a.feather), fd, null, v(wind.x * 0.5, 0), snap);
    this.chains.sack.step(toWorld(xf, a.sack), back(-0.3, 0.95), floor, v(wind.x * 0.5, 0), snap);
  }

  /** Chain points for drawing, interpolated and shifted so each root sits on its anchor. */
  private chainPts(alpha: number, shift: V2): Record<keyof KidRig['chains'], V2[]> {
    const out = {} as Record<keyof KidRig['chains'], V2[]>;
    for (const [k, c] of Object.entries(this.chains) as [keyof KidRig['chains'], Chain][]) {
      const pts: V2[] = [];
      for (let i = 0; i < c.spec.n; i++) pts.push(add(c.at(i, alpha), shift));
      out[k] = pts;
    }
    return out;
  }

  private extras(p: PlayerState, ch: Record<keyof KidRig['chains'], V2[]>): BodyExtras {
    const L = this.game.state.local;
    const bag: number[] = [];
    for (const id of L.bag) {
      const snd = L.sounds.find((q) => q.id === id);
      if (snd) bag.push(colourHex(snd.colour));
    }
    const ready = p.grounded || p.airDash > 0;
    const m = p.move;
    const levyHeld =
      m && moveDef(m.id).kind === 'levy' && this.mem.levyColour && movePhase(m).stage === 'startup'
        ? colourHex(this.mem.levyColour)
        : null;
    return {
      tail: ch.tail,
      tailFar: ch.tailFar,
      feather: ch.feather,
      sack: [ch.sack[0] as V2, ch.sack[1] as V2],
      bag,
      bagSlots: tuning.bag.slots,
      sackPulse: this.sackPulse,
      featherColour: p.abilities.dash ? (ready ? KID.featherDash : KID.featherUsed) : KID.feather,
      gloveRim: p.counter > 0 ? KID.gold : null,
      heldOrb: levyHeld,
      frame: this.mem.frame,
    };
  }

  private launchCap(p: PlayerState, k: number): void {
    const x = p.x + p.w / 2;
    const y = p.y + 8;
    this.cap = {
      x,
      y,
      vx: -p.facing * 3 * k,
      vy: -9 * k,
      rot: 0,
      vr: -p.facing * 0.28,
      facing: p.facing,
      age: 0,
    };
  }

  private stepCap(): void {
    const c = this.cap;
    if (!c) return;
    c.age++;
    c.vy += 0.55;
    c.x += c.vx;
    c.y += c.vy;
    c.vx *= 0.985;
    c.rot += c.vr;
    if (c.age > 70) this.cap = null;
  }

  private stepOrb(): void {
    const o = this.orb;
    if (!o) return;
    o.age++;
    if (o.age >= ANIM.seizeOrbFrames) {
      this.orb = null;
      this.sackPulse = 1;
    }
  }

  // --- drawing ---

  draw(glowG: Graphics, o: RigDrawOpts): void {
    const s = this.game.state;
    const p = s.player;
    const body = this.body.clear();
    const back = this.back.clear();
    const front = this.front.clear();
    const flash = this.flash.clear();
    this.flash.alpha = 1;
    const feet = v(o.kid.x + p.w / 2, o.kid.y + p.h);
    this.drawGhosts();
    this.drawCap(body, glowG);
    if (this.hazardFlash) {
      const t = this.hazardFlash.age / 10;
      paint(flash, this.hazardFlash.list, {
        rim: 0,
        rimW: 0,
        rimAlpha: 0,
        flat: t < 0.2 ? KID.hurt : PALETTE.furious,
        alpha: 1 - t,
      });
    }
    const dead = p.state === 'dead' && !p.down;
    if ((dead && o.deathAge === null) || !this.cur || !this.prev) {
      this.node.alpha = 1;
      return;
    }
    const a = this.frozen ? 1 : o.alpha;
    let pose = mixPose(this.prev, this.cur, a);
    if (Math.abs(this.cur.spin - this.prev.spin) > Math.PI) pose = { ...pose, spin: this.cur.spin };
    const mix = ANIM.juiceSquashMix;
    const sq: [number, number] = [
      (1 + (o.squash[0] - 1) * mix) * o.weight[0],
      (1 + (o.squash[1] - 1) * mix) * o.weight[1],
    ];
    let popK = 1;
    if (dead && o.deathAge !== null) popK = 1 + (o.deathPopScale - 1) * (o.deathAge / o.deathHold);
    sq[0] *= popK;
    sq[1] *= popK;
    const xf = this.xfFor(pose, feet, faceOf(p), sq);
    const j = solve(pose);
    // Chains interpolate like the body; their roots are then pinned to this frame's anchors.
    const ch = this.chainPts(a, v(0, 0));
    this.pinChains(ch, j, xf);
    const glow: Glow = { circles: [], lines: [] };
    const pr = new Prims(xf);
    buildKid(pr, j, pose, this.extras(p, ch), glow);
    this.lastList = pr.list;
    const shake = this.frozen && s.hitstop > 0 ? (s.hitstop % 2 === 0 ? 1.5 : -1.5) : 0;
    const counter = p.counter > 0;
    const rim = counter ? KID.gold : KID.rim;
    const rimW = counter ? 2.4 : 1.5;
    this.drawTrails(back, glowG, feet, p);
    if (dead) {
      // Gym death: white flash, then red and swelling until the juice pops her into the burst.
      const white = (o.deathAge ?? 0) < 2;
      paint(body, pr.list, {
        rim: 0,
        rimW: 0,
        rimAlpha: 0,
        flat: white ? KID.hurt : PALETTE.furious,
        alpha: 1,
        dx: shake,
      });
      this.node.alpha = 1;
      return;
    }
    paint(body, pr.list, { rim, rimW, rimAlpha: KID.rimAlpha, alpha: 1, dx: shake });
    const tint = o.tint ?? (this.hurtFlash > 0 ? KID.hurt : null);
    if (tint !== null)
      paint(flash, pr.list, { rim: 0, rimW: 0, rimAlpha: 0, flat: tint, alpha: 1, dx: shake });
    this.flash.alpha = this.hurtFlash > 0 ? 0.85 : 0.55;
    for (const c of glow.circles)
      glowG.circle(c.x + shake, c.y, c.r).fill({ color: c.c, alpha: c.a * o.opacity });
    for (const l of glow.lines) {
      const q = l.pts;
      if (q.length < 2) continue;
      glowG.moveTo((q[0] as V2).x, (q[0] as V2).y);
      for (let i = 1; i < q.length; i++) glowG.lineTo((q[i] as V2).x, (q[i] as V2).y);
      glowG.stroke({ width: l.w, color: l.c, alpha: l.a * o.opacity, cap: 'round', join: 'round' });
    }
    if (counter) {
      const k = 0.6 + 0.4 * Math.sin(s.frame * 0.6);
      for (const h of [j.haF, j.haB]) {
        const w = toWorld(xf, h);
        glowG.circle(w.x, w.y, 13).fill({ color: KID.gold, alpha: 0.55 * k });
      }
    }
    this.drawSmear(front, glowG, p, o.kid, xf, j);
    this.drawOrb(front, glowG);
    if (p.down) this.drawStars(front, glowG, xf, j);
    this.hands = {
      F: toWorld(xf, j.haF),
      B: toWorld(xf, j.haB),
      head: toWorld(xf, j.head),
      mouth: toWorld(xf, add(j.head, rot(v(8, 4), j.headAng))),
    };
    this.node.alpha = o.opacity;
  }

  /** Nudges each chain so its root sits on this frame's anchor (interpolation can drift it). */
  private pinChains(ch: Record<keyof KidRig['chains'], V2[]>, j: Joints, xf: Xf): void {
    const a = anchors(j);
    for (const k of Object.keys(ch) as (keyof KidRig['chains'])[]) {
      const pts = ch[k];
      const root = pts[0];
      if (!root) continue;
      const want = toWorld(xf, a[k]);
      const d = v(want.x - root.x, want.y - root.y);
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const fall = 1 - (i / n) * 0.5;
        pts[i] = add(pts[i] as V2, scale(d, fall));
      }
    }
  }

  private drawGhosts(): void {
    const n = this.ghosts.length;
    while (this.ghostPool.length < n) {
      const g = new Graphics();
      this.ghostPool.push(g);
      this.ghostLayer.addChild(g);
    }
    for (let i = 0; i < this.ghostPool.length; i++) {
      const g = (this.ghostPool[i] as Graphics).clear();
      const gh = this.ghosts[i];
      g.visible = !!gh;
      if (!gh) continue;
      const t = gh.age / ANIM.afterimageLife;
      g.alpha = 0.55 * (1 - t) ** 1.5;
      paint(g, gh.list, { rim: 0, rimW: 0, rimAlpha: 0, flat: KID.dashGhost, alpha: 1 });
    }
  }

  private drawTrails(g: Graphics, glow: Graphics, feet: V2, p: PlayerState): void {
    // Only on deliberate swings (moves, the flip): pose blends shouldn't streak.
    if (!p.move && this.mem.djT >= ANIM.djFrames) return;
    const levyC =
      p.move && moveDef(p.move.id).kind === 'levy'
        ? this.mem.levyColour
          ? colourHex(this.mem.levyColour)
          : null
        : null;
    for (const [tr, isB] of [
      [this.trailF, false],
      [this.trailB, true],
    ] as const) {
      const n = tr.length / 2;
      if (n < 3) continue;
      // Speed relative to her body over the last two steps.
      const r1 = tr[tr.length - 1] as V2;
      const r0 = tr[tr.length - 3] as V2;
      const sp = Math.hypot(r1.x - r0.x, r1.y - r0.y);
      if (sp < ANIM.trailMinSpeed) continue;
      const k = clamp01((sp - ANIM.trailMinSpeed) / 10);
      const col = isB && levyC !== null ? levyC : KID.smear;
      // Draw relative points re-anchored to this frame's feet, so the trail rides with her.
      let prev: V2 | null = null;
      for (let i = 0; i < n; i++) {
        const rel = tr[i * 2 + 1] as V2;
        const q = v(feet.x + rel.x, feet.y + rel.y);
        if (prev) {
          const u = i / (n - 1);
          const w = BODY.gloveR * 2.2 * u;
          g.moveTo(prev.x, prev.y)
            .lineTo(q.x, q.y)
            .stroke({ width: w, color: col, alpha: 0.3 * k * u, cap: 'round' });
          glow
            .moveTo(prev.x, prev.y)
            .lineTo(q.x, q.y)
            .stroke({ width: w * 1.3, color: col, alpha: 0.12 * k * u, cap: 'round' });
        }
        prev = q;
      }
    }
  }

  /** A strike's smear: a pressure cone or crescent that covers the move's real hitbox. */
  private drawSmear(g: Graphics, glow: Graphics, p: PlayerState, kid: V2, xf: Xf, j: Joints): void {
    const m = p.move;
    if (!m) return;
    const d = moveDef(m.id);
    if (d.kind !== 'strike') return;
    const ph = movePhase(m);
    let a: number;
    if (ph.stage === 'active') a = ph.n === 1 ? 0.95 : 0.7;
    else if (ph.stage === 'recovery' && ph.n <= 3) a = 0.45 - ph.n * 0.12;
    else return;
    const box = this.box(p, m, kid.x, kid.y);
    if (!box) return;
    const col = m.counter ? KID.gold : KID.smear;
    const f = m.facing;
    const hand = m.id === 'cross' || m.id === 'uppercut' ? j.haB : j.haF;
    const hw = toWorld(xf, hand);
    if (m.dir === 'fwd') {
      // A smear of the glove stretched to the far edge of the box, and a crescent whoosh front.
      const far = f > 0 ? box.x + box.w : box.x;
      const cy = box.y + box.h / 2;
      const r0 = BODY.gloveR * 0.9;
      const tipX = far - f * 5;
      const pts = [hw.x, hw.y - r0, tipX, cy - 3, tipX + f * 2, cy, tipX, cy + 3, hw.x, hw.y + r0];
      g.poly(pts, true).fill({ color: m.counter ? KID.gold : KID.glove, alpha: a * 0.35 });
      g.poly(pts, true).fill({ color: col, alpha: a * 0.22 });
      const R = box.h * 0.55;
      const arc: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = -0.9 + (1.8 * i) / 8;
        arc.push(far - f * R + f * Math.cos(t) * R, cy + Math.sin(t) * R);
      }
      for (let i = 8; i >= 0; i--) {
        const t = -0.9 + (1.8 * i) / 8;
        const rr = R - 5 * Math.cos(t * 1.7);
        arc.push(far - f * R + f * Math.cos(t) * rr, cy + Math.sin(t) * rr);
      }
      g.poly(arc, true).fill({ color: col, alpha: a * 0.8 });
      glow.poly(arc, true).fill({ color: col, alpha: a * 0.25 });
      // Speed lines trailing the glove.
      for (let i = -1; i <= 1; i++) {
        const y = hw.y + i * 6;
        const l = 18 + 8 * (1 - Math.abs(i));
        g.moveTo(hw.x - f * 10, y)
          .lineTo(hw.x - f * (10 + l), y)
          .stroke({ width: 1.6, color: col, alpha: a * 0.7 });
      }
      if (ph.stage === 'active' && ph.n === 1) {
        g.star(far - f * 4, cy, 5, 12, 5).fill({ color: m.counter ? KID.gold : PALETTE.flash, alpha: 0.95 });
        glow.star(far - f * 4, cy, 5, 12, 5).fill({ color: col, alpha: 0.45 });
      }
      return;
    }
    // Uppercut / overhand: a crescent along the fist's own arc (radius = the arm), then a smear of
    // the glove stretched on to the box's far edge, so the drawn reach is the real hitbox.
    const sh = toWorld(xf, m.id === 'uppercut' ? j.shB : j.shF);
    const tgt = m.dir === 'up' ? v(box.x + box.w / 2, box.y + 4) : v(box.x + box.w / 2, box.y + box.h - 4);
    const R = Math.hypot(hw.x - sh.x, hw.y - sh.y);
    const aEnd = Math.atan2(hw.y - sh.y, hw.x - sh.x);
    const sweep = 1.5;
    // Sweep from where the fist came from (low-forward for the uppercut, overhead for the overhand).
    const dirSign = m.dir === 'up' ? f : -f;
    const a0 = aEnd + dirSign * sweep;
    const N = 10;
    const outer: number[] = [];
    const inner: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const ang = a0 + (aEnd - a0) * u;
      const th = 2 + 10 * u;
      outer.push(sh.x + Math.cos(ang) * (R + 6), sh.y + Math.sin(ang) * (R + 6));
      inner.push(sh.x + Math.cos(ang) * (R + 6 - th), sh.y + Math.sin(ang) * (R + 6 - th));
    }
    const band: number[] = [...outer];
    for (let i = inner.length - 2; i >= 0; i -= 2) band.push(inner[i] as number, inner[i + 1] as number);
    g.poly(band, true).fill({ color: col, alpha: a * 0.6 });
    glow.poly(band, true).fill({ color: col, alpha: a * 0.2 });
    const r0 = BODY.gloveR * 0.9;
    const sm = [hw.x - r0, hw.y, tgt.x - 3, tgt.y, tgt.x + 3, tgt.y, hw.x + r0, hw.y];
    g.poly(sm, true).fill({ color: m.counter ? KID.gold : KID.glove, alpha: a * 0.35 });
    g.poly(sm, true).fill({ color: col, alpha: a * 0.25 });
    const fr: number[] = [];
    const Rf = box.w * 0.5;
    const cyF = tgt.y + (m.dir === 'up' ? Rf : -Rf);
    for (let i = 0; i <= 8; i++) {
      const t = -0.9 + (1.8 * i) / 8;
      const ang = (m.dir === 'up' ? -Math.PI / 2 : Math.PI / 2) + t;
      fr.push(tgt.x + Math.cos(ang) * Rf, cyF + Math.sin(ang) * Rf);
    }
    for (let i = 8; i >= 0; i--) {
      const t = -0.9 + (1.8 * i) / 8;
      const ang = (m.dir === 'up' ? -Math.PI / 2 : Math.PI / 2) + t;
      const rr = Rf - 5 * Math.cos(t * 1.7);
      fr.push(tgt.x + Math.cos(ang) * rr, cyF + Math.sin(ang) * rr);
    }
    g.poly(fr, true).fill({ color: col, alpha: a * 0.8 });
    glow.poly(fr, true).fill({ color: col, alpha: a * 0.25 });
    if (ph.stage === 'active' && ph.n === 1) {
      g.star(tgt.x, tgt.y, 5, 12, 5).fill({ color: m.counter ? KID.gold : PALETTE.flash, alpha: 0.95 });
      glow.star(tgt.x, tgt.y, 5, 12, 5).fill({ color: col, alpha: 0.45 });
    }
  }

  /** A seized sound flying from her hand into the sack. */
  private drawOrb(g: Graphics, glow: Graphics): void {
    const o = this.orb;
    const sack = this.chains.sack;
    if (!o || o.age < 0) return;
    const t = o.age / ANIM.seizeOrbFrames;
    const to = { x: sack.x[1] as number, y: sack.y[1] as number };
    const mid = v((o.from.x + to.x) / 2, Math.min(o.from.y, to.y) - 40);
    const u = t * t;
    const q = v(
      (1 - u) * (1 - u) * o.from.x + 2 * (1 - u) * u * mid.x + u * u * to.x,
      (1 - u) * (1 - u) * o.from.y + 2 * (1 - u) * u * mid.y + u * u * to.y,
    );
    const r = 6 * (1 - 0.5 * t);
    g.circle(q.x, q.y, r).fill({ color: o.colour, alpha: 1 });
    g.circle(q.x, q.y, r * 0.45).fill({ color: 0xffffff, alpha: 0.9 });
    glow.circle(q.x, q.y, r * 2.4).fill({ color: o.colour, alpha: 0.8 });
  }

  private drawCap(g: Graphics, glow: Graphics): void {
    const c = this.cap;
    if (!c) return;
    const a = c.age > 55 ? 1 - (c.age - 55) / 15 : 1;
    const pts: number[] = [];
    for (const q of CAP_PTS) {
      const r = rot(v(q.x * c.facing, q.y), c.rot);
      pts.push(c.x + r.x, c.y + r.y);
    }
    g.poly(pts, true).stroke({ width: 3, color: KID.rim, alpha: 0.9 * a, join: 'round' });
    g.poly(pts, true).fill({ color: KID.cap, alpha: a });
    const tip = rot(v(-10 * c.facing, -8), c.rot);
    glow.circle(c.x + tip.x, c.y + tip.y, 3).fill({ color: KID.feather, alpha: 0.4 * a });
  }

  /** Down for the Count: little stars wheel round her head. */
  private drawStars(g: Graphics, glow: Graphics, xf: Xf, j: Joints): void {
    const h = toWorld(xf, j.head);
    const f = this.mem.frame;
    for (let i = 0; i < 3; i++) {
      const ang = f * 0.12 + (i * Math.PI * 2) / 3;
      const x = h.x + Math.cos(ang) * 16;
      const y = h.y - 16 + Math.sin(ang) * 5;
      const s = 3.5 + 1.2 * Math.sin(ang);
      g.star(x, y, 5, s + 1.8, s * 0.45).fill({ color: KID.gold, alpha: 0.95 });
      glow.circle(x, y, s + 3).fill({ color: KID.gold, alpha: 0.5 });
    }
  }
}

function rotLean(d: V2, a: number): V2 {
  return rot(d, a);
}

/** She faces the way her move goes (the stick can turn `facing` mid-move; the move keeps its own). */
function faceOf(p: PlayerState): number {
  return p.move ? p.move.facing : p.facing;
}
