// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Tatter (memory/hatch-and-tatter.md; docs/design/journey.md): a moth of her kind, the other late
 * hatchling, one wing torn short, sat on the branch at the room's `marks.tatter`. It is Wing's rig,
 * wings and painter (vesper/), smaller, re-paletted a step greyer (`Painter.grade`), unarmed, its
 * light nearly out, and its near wing torn (`Secondary.tear`). Render only: no sim body.
 *
 * What it does (all from what render can see: the hatching, her, the clock):
 *   rest      sat hunched, breathing slow, antennae moving, the torn wing twitching wrong;
 *   watch     its head on her cocoon while she is shut in, on her as she breaks out and runs by;
 *   the swarm looks up as it passes, up off its heels, its wings lift to fly and cannot, it sinks back;
 *   after     stays behind: looks the way she went now and then.
 *
 * The kin's three beats in the Canopy (round 9; each mark has a `marks.notes` line saying which, read here):
 *   away      (the hub, 1/3) watches her come into the clearing; as she nears it turns its back and hunches, and
 *             turns to watch again once she has gone on;
 *   keep      (the bower, 2/3) sits facing the small light it keeps (`light` landmark), head low over it; when she
 *             breaks in (a `barkBreak`) or comes near, it looks up, then turns to her;
 *   wait      (the way out, 3/3) waits on the cliff facing the way she comes; when she reaches it, it goes on ahead
 *             of her along the top it stands on, walking, and stops at its end to wait again.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Room } from '../../scene/room';
import { createPlayer } from '../../sim/player/player';
import { tuning } from '../../sim/tuning';
import type { PlayerView, RenderContext } from '../contract';
import { LOOK } from '../scene/lib/room-look';
import { SWARM_PASS, swarmPassFocus, swarmPassWeight } from '../swarm/timing';
import { clamp, lerp, noise1, sat, smoothstep } from './math';
import { drawMothWing, flapWind, TORN, WHOLE, type WingPose } from './tatter-wing';
import { drawVesper, type View } from './vesper/draw';
import { Painter, rgb } from './vesper/paint';
import { J_COLLAR, Rig } from './vesper/rig';
import { Secondary } from './vesper/wings';

/** Knobs (seconds of render time, world px). */
export const TATTER = {
  /** Its size next to hers (canopy review r6 #10: at 0.82 and her value it read as a second Wing). */
  scale: 0.7,
  /**
   * The re-palette: saturation and value of its solids and of its lights, a tint, and `lift` toward a pale of it: an
   * old dusty ash-pale moth against her dark one (review r6 #10: a different value, not only a greyer one).
   */
  grade: { sat: 0.3, val: 0.95, tint: rgb(0xe6ddd0), lightSat: 0.4, lightVal: 0.55, lift: 0.42 },
  /** Its lantern tips are nearly out; its eyes are dim. */
  glow: 0.28,
  eyes: 0.62,
  /** How torn the near wing is (0..1), and how far it is held off its back (degrees: it cannot fold it). */
  tear: 1,
  hold: 0,
  /**
   * The torn wing is held half open at a wrong angle (of the glide's spread), raised off its back
   * (degrees, negative = up) so its bitten outline shows against the pale stage over the branch.
   */
  splay: 0.9,
  droop: 25,
  /** Its try at the air: a hop off the branch (px) at the wings' peak, and how hard it lands back (it crumples). */
  hop: 44,
  /**
   * Its moth wings (tatter-wing.ts), angles of the span on screen for a moth facing west (rad, y down:
   * negative = raised): the good wing at rest and at the top of its try, the torn one drooping and how
   * little it lifts; spans in px (the torn one shorter).
   */
  wings: {
    good: -0.85,
    goodTry: -1.45,
    torn: 0.34,
    tornTry: 0,
    goodSpan: 33,
    tornSpan: 25,
    goodOpen: -0.95,
    // (Review r13 #4: at -0.15 the torn one lay along its back, out of sight: half up beside the good one.)
    tornOpen: -0.6,
  },
  /** Its snapped antenna's length (of a whole one). */
  antenna: 0.5,
  /**
   * The swarm (render/swarm/timing.ts: `SWARM_PASS`, `swarmPassWeight`, `swarmPassFocus`): it looks up
   * `swarmLead` s ahead of the pass weight, at the pass's focus (the moon, view px) taken into the world
   * round where the camera would be with her (`camDy` above her feet), drifting `swarmDx` across it.
   */
  swarmLead: 0.6,
  swarmDx: [-260, 320],
  camDy: -238,
  /**
   * Its try at the air, in s relative to the pass (`SWARM_PASS`): up off its heels from `in` + strain[0]
   * to `full` + strain[1]; the wings lift from `full` + tryWings[0..2]; it sinks back and looks down from
   * `hold` + sink[0..1]. (The crumple after its hop holds it low until the sink lets go.)
   */
  strain: [-0.4, 0, -1.0],
  tryWings: [0.3, 0.9, 1.8],
  sink: [-1.0, 0.8],
  /** She is "near" within this many px (it watches her); further, it lets go and only glances her way. */
  near: 900,
  /** After she has gone: a glance the way she went about every `glanceEvery` s. */
  glanceEvery: 7.5,
  glanceLen: 2.6,
  /**
   * Its want (`marks.tatter.want`, the hub's root shelf it cannot climb; wood.md rescope 7): it waits gazing
   * at it; when she first comes within `arrive` px it starts (a jolt), turns to her, then makes its one try
   * at the shelf (the swarm's try, timed from her arrival by `tryAt` s) and fails.
   */
  want: { arrive: 420, tryAt: 0.9, gaze: 0.6 },
  /**
   * She rests at the patch beside it (`patchRest` within `near` px): it turns its head to her and lifts a
   * little, its wings stirring once, for `secs` (the first-timer: "the moth companion needs one reaction").
   */
  rest: { near: 700, secs: 3.2, lift: 0.3, wings: 0.35 },
  /** The hub's beat: it turns its back inside `px`, turns back past `back`; how low it hunches (perch). */
  away: { px: 380, back: 680, hunch: 0.25 },
  /** The bower's beat: she is noticed inside `px`; how long it looks up before it turns to her (s). */
  keep: { px: 620, look: 0.9, jolt: 0.45 },
  /** The way out's beat: she joins it inside `join`; it walks `lead` px ahead of her at up to `speed` px/s. */
  wait: { join: 320, lead: 240, speed: 150, edge: 40 },
  /**
   * Its answer when the cage it wants is cut open (the Canopy r12, canopy-moments.md moment 2): it watches the cloud
   * rise (`watch` s), takes three steps after it (`steps`, `stepPx` each, over `stepT` s from `stepAt`), opens its
   * wings once (`wingsAt` .. +`wingsT`: the torn one shows), and one freed moth comes down and sits on its head
   * (`mothAt` .. +`mothT`), opens its wings and goes; then it turns to her (`turnAt`).
   */
  answer: {
    watch: 1.4,
    stepAt: 1.5,
    steps: 3,
    stepPx: 30,
    stepT: 1.5,
    wingsAt: 3.1,
    wingsT: 1.5,
    mothAt: 3.4,
    mothT: 2.2,
    turnAt: 5.6,
    moth: 0xf2ead6,
  },
  /**
   * Moonlight for two (the Canopy r13, canopy-moments.md moment 3; `kinSit`): it shuffles over to sit `side` px beside
   * her (over `walk` s, small steps), turns up to the moon (`lookAt`), opens its wings to it as she did (`openAt` ..
   * `open` s, held; the torn one only half opens: the try's droop), folds them and leans against her (`leanAt`, `lean`
   * rad toward her). If she goes (`leave` px), it stays, looking at the moon.
   */
  // (Review r13 #4: "the kin is a 35 px lump; no wing opening visible". Open for 6 s now (fully ~4.4 s), the good wing
  // spanning `openSpan` x its rest span (over twice its body), the torn one `tornSpan` and only half up, both edged
  // with the moon (`rim`); the lean after, held while she stays.)
  sit: {
    side: 62,
    walk: 2.4,
    lookAt: 2.6,
    openAt: 3.2,
    open: 6,
    leanAt: 9.4,
    lean: 0.16,
    leave: 360,
    openSpan: 2.3,
    tornSpan: 1.45,
    rim: 1,
  },
} as const;
const T_SIT = TATTER.sit;
/** The wings' grade while they are open to the moon (set per frame from `TATTER.grade`). */
const WING_GRADE: {
  sat: number;
  val: number;
  tint: typeof TATTER.grade.tint;
  lightSat: number;
  lightVal: number;
  lift: number;
} = {
  ...TATTER.grade,
};

type Beat = 'away' | 'keep' | 'wait' | null;

/** The moon's place on screen (`art.moon`, safe px) in this room, if it has one. */
const LOOK_MOON_X = (): number | undefined => (LOOK.moon as { x: number } | undefined)?.x;

/** Which of the kin's beats a mark plays: the `marks.notes` line beside it (the level's words for it). */
function beatOf(room: Room, x: number, y: number): Beat {
  const notes =
    (room.marks as { notes?: Array<{ x: number; y: number; text: string }> } | undefined)?.notes ?? [];
  for (const n of notes) {
    if (Math.abs(n.x - x) > 300 || Math.abs(n.y - y) > 300 || !/\bkin\b/.test(n.text)) continue;
    if (/turns away/.test(n.text)) return 'away';
    if (/keeps a/.test(n.text)) return 'keep';
    if (/waits/.test(n.text)) return 'wait';
  }
  return null;
}

export class Tatter {
  readonly mesh;
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly view: View;
  private readonly me: PlayerView;
  private readonly x: number;
  private readonly y: number;
  private facing: number;
  /** The kin's beat here (`beatOf`), its light (keep), the top it may walk (wait: x from..to). */
  private readonly beat: Beat;
  private readonly keptAt: { x: number; y: number } | null = null;
  private readonly walk: [number, number] = [0, 0];
  /** Beat state: turned away (0..1), she has been noticed (s since, -1 not yet), joined (s since, -1 not yet). */
  private awayK = 0;
  private noticeT = -1;
  private joinT = -1;
  private aheadDir = 1;
  private walkX = 0;
  private broke = false;
  private readonly swarmY: number;
  /** Where the swarm's pass is densest (view px), or null. */
  private readonly focus: { x: number; y: number } | null;
  private started = false;
  private lookW = 0;
  private lookX = 0;
  private lookY = 0;
  /** Render time she has been out of its sight (for the glances after she is gone). */
  private goneT = 0;
  /** What it wants and cannot reach (world px), and seconds since she arrived (-1 = not yet). */
  private readonly want: readonly [number, number] | null;
  /** It is here only once / until these story flags are set. */
  private readonly when: string | null;
  private readonly until: string | null;
  private wantT = -1;
  /**
   * Its try at the air on a story beat (`stage.tatters[].tryOn`, the crown: wings open, the torn one too, one
   * beat, a hop, it lands and looks at her): seconds since the beat (-1 = none). Set by `Cast`.
   */
  tryT = -1;
  /** Its answer to the cage it wants going out (`TATTER.answer`): seconds since (-1 = none). Set by `Cast`. */
  answerT = -1;
  /** Moonlight for two (`TATTER.sit`): seconds since `kinSit` (-1 = none), where she sat. Set by `Cast`. */
  sitT = -1;
  sitAt: { x: number; y: number } | null = null;
  private sitFrom = 0;
  /** 0..1: its wings held open to the moon (the sit): spread out flat, not beating; the torn one only half. */
  private spreadK = 0;
  private leanK = 0;
  /** The cage (or anything) it wants, world px (null without a want). */
  get wants(): readonly [number, number] | null {
    return this.want;
  }
  /** The moth on its head (`answer`): drawn over it. */
  readonly answerG = new Graphics({ label: 'tatter-answer' });
  /** Where it has climbed to (world px from its mark; `Cast` moves it along a `climb` path). */
  ox = 0;
  oy = 0;
  /** Seconds since she rested near it (large = not lately). */
  private restT = 1e6;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
    room: Room,
    at: { x: number; y: number; facing: -1 | 1; want?: [number, number]; when?: string; until?: string },
  ) {
    this.want = at.want ?? null;
    this.when = at.when ?? null;
    this.until = at.until ?? null;
    this.x = at.x;
    this.y = at.y;
    this.facing = at.facing;
    this.beat = beatOf(room, at.x, at.y);
    if (this.beat === 'keep') {
      const lms = (room.marks as { landmarks?: Array<{ kind: string; x: number; y: number }> } | undefined)
        ?.landmarks;
      let best: { x: number; y: number } | null = null;
      for (const l of lms ?? [])
        if (l.kind === 'light' && (!best || Math.abs(l.x - at.x) < Math.abs(best.x - at.x))) best = l;
      this.keptAt = best;
      // It sits facing what it keeps.
      if (best) this.facing = best.x < at.x ? -1 : 1;
    }
    if (this.beat === 'wait') {
      // The top under its feet: how far it runs either way (it never steps off).
      const top = room.solids.find((r) => r.x <= at.x && r.x + r.w >= at.x && Math.abs(r.y - at.y) < 8);
      let x0 = top ? top.x : at.x;
      let x1 = top ? top.x + top.w : at.x;
      for (let grow = true; grow && top; ) {
        grow = false;
        for (const r of room.solids)
          if (Math.abs(r.y - top.y) < 8) {
            if (r.x < x0 && r.x + r.w >= x0) {
              x0 = r.x;
              grow = true;
            }
            if (r.x + r.w > x1 && r.x <= x1) {
              x1 = r.x + r.w;
              grow = true;
            }
          }
      }
      this.walk[0] = x0 + TATTER.wait.edge;
      this.walk[1] = x1 - TATTER.wait.edge;
    }
    const st = createPlayer(at.x, at.y, tuning, room);
    st.facing = this.facing as -1 | 1;
    const feetY = st.y + st.h;
    this.me = { ...st, cx: st.x + st.w / 2, cy: st.y + st.h / 2, feetY } as PlayerView;
    // The swarm's height over it (the room's swarm path), for the look up.
    const path = room.marks?.swarm ?? [];
    let sy = at.y - 560;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if (at.x >= a[0] && at.x <= b[0]) sy = lerp(a[1], b[1], (at.x - a[0]) / Math.max(1, b[0] - a[0]));
    }
    this.swarmY = sy;
    this.focus = swarmPassFocus(room);
    const p = this.painter;
    p.mesh.label = 'tatter';
    this.mesh = p.mesh;
    // Pinned at its feet, so it can be drawn smaller than she is.
    p.mesh.pivot.set(this.me.cx, feetY);
    p.mesh.position.set(this.me.cx, feetY);
    p.mesh.scale.set(TATTER.scale);
    this.torn = this.facing < 0 ? 1 : 0;
    this.sec.tear[this.torn] = TATTER.tear;
    this.sec.splay[this.torn] = TATTER.splay;
    // ... and one antenna snapped short (the far one: it shows over its head).
    this.sec.antLen[this.torn === 1 ? 0 : 1] = TATTER.antenna;
    this.rig.perch = 1;
    this.view = {
      wings: this.sec.wings,
      antennae: this.sec.antennae,
      open: 0,
      hairX: 0,
      hairY: 0,
      hair2X: 0,
      hair2Y: 0,
      glow: TATTER.glow,
      tuck: 0,
      wall: 0,
      wallDir: 1,
      soar: 0,
      pale: 0.66,
      soarW: this.sec.soarW,
      back: [0, 0],
      glintT: 9,
      glintK: 0,
      slashW: 0,
      bladeAng: 0,
      bladeLen: 1,
      bladeOver: false,
      bladeFront: false,
      swordSide: 0,
      hop: 0,
      spot: 0,
      stream: 0,
      eyeLit: TATTER.eyes,
      unarmed: true,
      wingsHidden: true,
      // (no lantern balls: its light is out)
      tips: [0, 0],
    };
  }

  /**
   * `her`: Wing as drawn (null = not drawn: still inside), `cocoon` her cocoon's hang point,
   * `sinceBreak` render seconds since the break (large = none seen), `stirred` a stir this frame.
   */
  /** Is it here, by the save's story flags? (The root ladder: it leaves the hub, and is ahead of her after.) */
  present(flags: readonly string[]): boolean {
    if (this.when && !flags.includes(this.when)) return false;
    if (this.until && flags.includes(this.until)) return false;
    return true;
  }

  update(
    dt: number,
    clock: number,
    her: PlayerView | null,
    cocoon: { x: number; y: number } | null,
    sinceBreak: number,
    stirred: boolean,
    rested = false,
    broke = false,
  ): void {
    const T = TATTER;
    const rig = this.rig;
    if (broke) this.broke = true;
    this.beats(dt, her);
    // With a want, its try is timed from her arrival instead of the hatching's break.
    const want = this.want;
    if (want && this.wantT < 0 && her && Math.hypot(her.cx - this.x, her.feetY - this.y) < T.want.arrive)
      this.wantT = 0;
    else if (this.wantT >= 0) this.wantT += dt;
    if (this.tryT >= 0) this.tryT += dt;
    const t =
      this.tryT >= 0
        ? this.tryT + T.want.tryAt
        : want
          ? this.wantT >= 0
            ? this.wantT + T.want.tryAt
            : 1e6
          : sinceBreak;
    if (rested && her && Math.hypot(her.cx - this.x, her.feetY - this.y) < T.rest.near) this.restT = 0;
    else this.restT += dt;
    /** 0..1: how much of the rest reaction is on (in fast, out slowly). */
    const rk = smoothstep(0, 0.35, this.restT) * (1 - smoothstep(T.rest.secs - 1, T.rest.secs, this.restT));
    this.lastT = t;
    const headY = this.y - 46;
    // --- What it looks at, and how firmly.
    let lx = want ? want[0] : this.x + this.facing * 200;
    let ly = want ? want[1] : this.y - 30;
    let lw = want ? T.want.gaze : 0.25;
    if (!her && cocoon) {
      // Shut in: its eyes on her cocoon, and on every stir.
      lx = cocoon.x;
      ly = cocoon.y + 50;
      lw = 0.75;
    } else if (her) {
      const d = Math.abs(her.cx - this.x);
      const near = 1 - smoothstep(T.near * 0.6, T.near, d);
      lx = her.cx;
      ly = her.feetY - 50;
      lw = 0.3 + 0.7 * near;
      if (want) {
        // It waits gazing at what it wants; as she comes close it turns to her.
        lx = lerp(want[0], her.cx, near);
        ly = lerp(want[1], her.feetY - 50, near);
        lw = lerp(T.want.gaze, 1, near);
      }
      if (want) this.goneT = 0;
      else if (near < 0.05) this.goneT += dt;
      else this.goneT = 0;
      // She has gone: it looks the way she went now and then, and otherwise at the branch before it.
      if (this.goneT > 1.5) {
        const g = (this.goneT % T.glanceEvery) / T.glanceLen;
        const k = g < 1 ? Math.sin(Math.PI * g) ** 2 : 0;
        lx = lerp(this.x + this.facing * 80, her.cx, k);
        ly = lerp(this.y + 10, headY - 20, k);
        lw = 0.35 + 0.55 * k;
      }
    }
    // The swarm passing over the moon: its head comes up and follows it across the sky.
    const P = SWARM_PASS;
    const sw = swarmPassWeight(t + T.swarmLead);
    if (sw > 1e-3) {
      const u = sat((t - P.in) / (P.out - P.in));
      const camX = Math.max(960, her?.cx ?? this.x);
      const camY = (her?.feetY ?? this.y) + T.camDy;
      const f = this.focus;
      const sx = want ? want[0] : f ? camX + (f.x - 960) : this.x + 300;
      const sy = want ? want[1] : f ? camY + (f.y - 540) : this.swarmY;
      lx = lerp(lx, sx + (want ? 0 : lerp(T.swarmDx[0], T.swarmDx[1], u)), sw);
      ly = lerp(ly, sy, sw);
      lw = lerp(lw, 1, sw);
    }
    // ... and after it, a look down at the branch: it stays.
    const sink =
      t < P.hold + T.sink[1] + 1
        ? smoothstep(P.hold + T.sink[0], P.hold + T.sink[0] + 0.5, t) *
          (1 - smoothstep(P.hold + T.sink[1] - 0.6, P.hold + T.sink[1], t))
        : 0;
    if (sink > 1e-3) {
      lx = lerp(lx, this.x + this.facing * 70, sink);
      ly = lerp(ly, this.y + 30, sink);
      lw = lerp(lw, 0.9, sink);
    }
    // She rests beside it: it looks at her.
    if (rk > 1e-3 && her) {
      lx = lerp(lx, her.cx, rk);
      ly = lerp(ly, her.feetY - 60, rk);
      lw = lerp(lw, 1, rk);
    }
    // The kin's beats (`beats`): where it looks.
    const bl = this.beatLook(her, headY);
    if (bl) {
      lx = lerp(lx, bl.x, bl.w);
      ly = lerp(ly, bl.y, bl.w);
      lw = lerp(lw, bl.firm, bl.w);
    }
    // Its answer to the freed cage: up after the cloud, then at the moth on its head, then at her.
    const al = this.answerLook(dt, her, headY);
    if (al) {
      lx = lerp(lx, al.x, al.w);
      ly = lerp(ly, al.y, al.w);
      lw = lerp(lw, al.firm, al.w);
    }
    // Moonlight for two: over to her, up at the moon, its wings, the lean.
    const sl = this.sitLook(dt, her, headY);
    if (sl) {
      lx = lerp(lx, sl.x, sl.w);
      ly = lerp(ly, sl.y, sl.w);
      lw = lerp(lw, sl.firm, sl.w);
    }
    // Looking down, the antennae droop with the head (a lowered chin alone lifts them into rods).
    rig.antExtra = 34 * sink;
    rig.antCurlExtra = 0.12 * sink;
    // The look moves like a head, not a cursor.
    if (!this.started) {
      this.lookX = lx;
      this.lookY = ly;
      this.lookW = lw;
    }
    const k = 1 - Math.exp(-6 * dt);
    this.lookX += (lx - this.lookX) * k;
    this.lookY += (ly - this.lookY) * k;
    this.lookW += (lw - this.lookW) * (1 - Math.exp(-4 * dt));
    rig.look.x = this.lookX;
    rig.look.y = this.lookY;
    rig.look.w = this.lookW;
    // --- Its body: up off its heels for the swarm (and a little at her break), the wings' one try.
    const brk = t < 2 ? smoothstep(0, 0.25, t) * (1 - smoothstep(0.9, 1.8, t)) * 0.35 : 0;
    const strain =
      t < P.hold + T.strain[2] + 1
        ? smoothstep(P.in + T.strain[0], P.full + T.strain[1], t) *
          (1 - smoothstep(P.hold + T.strain[2] - 0.9, P.hold + T.strain[2], t))
        : 0;
    const stir = stirred ? 1 : 0;
    this.stirK = Math.max(this.stirK * Math.exp(-3 * dt), stir);
    rig.strain = Math.max(brk, strain, 0.18 * this.stirK, T.rest.lift * rk, this.beatStrain());
    rig.perch = 1 - 0.75 * rig.strain;
    if (this.beat === 'away') rig.perch = Math.min(1, rig.perch + T.away.hunch * this.awayK);
    const tw =
      t < P.full + T.tryWings[2]
        ? smoothstep(P.full + T.tryWings[0], P.full + T.tryWings[1], t) *
          (1 - smoothstep(P.full + T.tryWings[1], P.full + T.tryWings[2], t))
        : 0;
    // The try: two beats of the wings (the torn one barely lifts), a hop off the branch, and it fails.
    const beats = Math.sin(Math.PI * 2.4 * Math.max(0, t - P.full - T.tryWings[0])) ** 2;
    const A = T.answer;
    const aw =
      this.answerT >= A.wingsAt && this.answerT < A.wingsAt + A.wingsT
        ? Math.sin((Math.PI * (this.answerT - A.wingsAt)) / A.wingsT) ** 2
        : 0;
    // Its wings to the moon (the sit): open, held a breath, folded.
    const S = T.sit;
    const su = this.sitT >= 0 ? (this.sitT - S.openAt) / S.open : -1;
    const sw2 = su > 0 && su < 1 ? smoothstep(0, 0.14, su) * (1 - smoothstep(0.86, 1, su)) : 0;
    rig.tryWings = Math.max(
      tw * (0.5 + 0.5 * beats) * (0.9 + 0.1 * noise1(clock * 9, 171)),
      T.rest.wings * rk * Math.sin(Math.PI * Math.min(1, this.restT / 1.2)) ** 2,
      aw,
      sw2 * (0.92 + 0.08 * Math.sin(clock * 1.3)),
    );
    if (sw2 > 0) rig.strain = Math.max(rig.strain, 0.7 * sw2);
    this.spreadK = sw2;
    // (Leaning against her, it sits low.)
    if (this.leanK > 0) rig.perch = Math.min(1, rig.perch + 0.25 * this.leanK);
    // (Up off its heels as it watches the cloud and opens its wings.)
    if (this.answerT >= 0 && this.answerT < A.turnAt)
      rig.strain = Math.max(
        rig.strain,
        0.6 * Math.min(1, this.answerT / 0.4) * (1 - 0.5 * sat((this.answerT - A.watch) / 1)),
        0.8 * aw,
      );
    const hu = (t - (P.full + T.tryWings[1] - 0.15)) / 0.5;
    this.hopY = hu > 0 && hu < 1 ? -T.hop * Math.sin(Math.PI * hu) ** 1.5 : 0;
    // ... and lands back hard: a crumple (lower, head down) that lets go slowly.
    const crumple =
      hu >= 1 && t < P.hold + T.sink[1] ? 1 - smoothstep(P.hold + T.sink[0], P.hold + T.sink[1], t) : 0;
    rig.strain *= 1 - crumple;
    rig.perch = Math.min(1, rig.perch + crumple);
    // The torn wing hangs splayed and limp, twitching now and then; in the try it lifts only a little.
    this.sec.hold[this.torn] = TATTER.hold;
    this.sec.splay[this.torn] = TATTER.splay;
    this.sec.droop[this.torn] =
      TATTER.droop * (1 + 0.06 * noise1(clock * 0.7, 181)) * (1 - 0.45 * Math.max(tw, aw, sw2));
    rig.update(dt, clock, this.me, []);
    const fresh = !this.started;
    if (fresh) this.sec.reset();
    this.sec.update(dt, clock, rig, rig.frame, this.me);
    const v = this.view;
    v.open = this.sec.open;
    v.soar = Math.max(this.sec.soar, this.sec.soarW[0], this.sec.soarW[1]);
    v.hairX = noise1(clock * 0.6, 61) * 0.4;
    v.hairY = noise1(clock * 0.8, 63) * 0.3;
    v.hair2X = noise1(clock * 1.1, 65) * 0.6;
    v.hair2Y = noise1(clock * 1.3, 67) * 0.5;
    v.wallDir = rig.frame.s[0]! >= 0 ? 1 : -1;
    // Its light: almost out; a little stronger while it strains toward the swarm.
    v.glow = T.glow * (1 + 0.6 * strain) * (0.92 + 0.08 * Math.sin(clock * 1.1));
    v.eyeLit = rig.eyeLit * T.eyes * (1 + 0.25 * sw);
    this.started = true;
    this.draw(clock);
    this.drawAnswerMoth(clock);
  }

  private stirK = 0;

  /** Steps the kin's beat: turning away, noticing her, going on ahead (it moves its own `me` along the top). */
  private beats(dt: number, her: PlayerView | null): void {
    const T = TATTER;
    const me = this.me as { -readonly [K in keyof PlayerView]: PlayerView[K] };
    me.vx = 0;
    if (!this.beat || !her) return;
    const d = Math.hypot(her.cx - me.cx, her.feetY - me.feetY);
    if (this.beat === 'away') {
      // (After its try at the shelf, if it has one: the try is what it does as she arrives.)
      const tried = !this.want || this.wantT > 5;
      const want = tried && (d < T.away.px || (this.awayK > 0.5 && d < T.away.back)) ? 1 : 0;
      this.awayK += (want - this.awayK) * (1 - Math.exp(-(want ? 2.2 : 1.2) * dt));
      const toHer = her.cx < me.cx ? -1 : 1;
      this.facing = this.awayK > 0.5 ? -toHer : this.awayK < 0.2 && d < 1400 ? toHer : this.facing;
    } else if (this.beat === 'keep') {
      if (this.noticeT < 0 && (this.broke || d < T.keep.px)) this.noticeT = 0;
      else if (this.noticeT >= 0) this.noticeT += dt;
      if (this.noticeT > T.keep.look) this.facing = her.cx < me.cx ? -1 : 1;
    } else if (this.beat === 'wait') {
      if (this.joinT < 0 && d < T.wait.join) {
        this.joinT = 0;
        this.aheadDir = her.cx < me.cx ? 1 : -1;
      } else if (this.joinT >= 0) this.joinT += dt;
      if (this.joinT >= 0) {
        // Ahead of her by `lead`, along its top, never faster than a walk; at the end it turns to wait for her.
        const goal = Math.min(this.walk[1], Math.max(this.walk[0], her.cx + this.aheadDir * T.wait.lead));
        const gap = goal - me.cx;
        const step = Math.sign(gap) * Math.min(Math.abs(gap), T.wait.speed * dt);
        const going = Math.abs(gap) > 6 && this.joinT > 0.5 && Math.sign(gap) === this.aheadDir;
        if (going) {
          me.grounded = true;
          me.cx += step;
          me.x += step;
          me.vx = step / Math.max(1e-3, dt * 60);
          this.walkX += step;
          this.facing = this.aheadDir;
        } else this.facing = her.cx < me.cx ? -1 : 1;
      } else this.facing = her.cx < me.cx ? -1 : 1;
    }
    me.facing = this.facing as -1 | 1;
  }

  /**
   * Its answer (`TATTER.answer`): steps its `me` after the cloud (three steps, a walk's bob from the rig), and says
   * where it looks: up after the rising cloud, at the moth on its head (up and close), then at her.
   */
  private answerLook(
    dt: number,
    her: PlayerView | null,
    headY: number,
  ): { x: number; y: number; firm: number; w: number } | null {
    if (this.answerT < 0) return null;
    this.answerT += dt;
    const A = TATTER.answer;
    const t = this.answerT;
    const want = this.want ?? [this.me.cx + this.facing * 200, this.me.feetY - 200];
    const me = this.me as { -readonly [K in keyof PlayerView]: PlayerView[K] };
    const dir = want[0] >= me.cx ? 1 : -1;
    // Three steps after it: a walk at the step's pace, a stop between.
    if (t >= A.stepAt && t < A.stepAt + A.stepT) {
      const u = (t - A.stepAt) / A.stepT;
      const ph = (u * A.steps) % 1;
      const v = Math.sin(Math.PI * ph) ** 2;
      const step = dir * ((A.steps * A.stepPx) / A.stepT) * dt * v * 2;
      me.grounded = true;
      me.cx += step;
      me.x += step;
      me.vx = step / Math.max(1e-3, dt * 60);
      this.facing = dir;
      me.facing = dir as -1 | 1;
    }
    if (t >= A.turnAt && her) {
      this.facing = her.cx < me.cx ? -1 : 1;
      me.facing = this.facing as -1 | 1;
    }
    // Where it looks: up after the cloud as it rises (to the moon's side), at the moth on it, then at her.
    if (t < A.mothAt + 0.3) {
      const u = Math.min(1, t / A.watch);
      return { x: want[0] + dir * 120 * u, y: want[1] - 120 - 520 * u, firm: 1, w: Math.min(1, t / 0.3) };
    }
    if (t < A.mothAt + A.mothT) return { x: me.cx + this.facing * 30, y: headY - 80, firm: 0.9, w: 1 };
    if (her && t < A.turnAt + 3)
      return { x: her.cx, y: her.feetY - 50, firm: 1, w: 1 - sat((t - A.turnAt - 2) / 1) };
    if (t > A.turnAt + 4) this.answerT = -2;
    return null;
  }

  /**
   * The sit (`TATTER.sit`): steps its `me` over to her side, and says where it looks (her, then the moon); sets the
   * lean. If she leaves, the lean goes and it stays looking at the moon.
   */
  private sitLook(
    dt: number,
    her: PlayerView | null,
    headY: number,
  ): { x: number; y: number; firm: number; w: number } | null {
    if (this.sitT < 0 || !this.sitAt) {
      this.mesh.rotation = 0;
      return null;
    }
    const S = TATTER.sit;
    if (this.sitT === 0) this.sitFrom = this.me.cx;
    this.sitT += dt;
    const t = this.sitT;
    const me = this.me as { -readonly [K in keyof PlayerView]: PlayerView[K] };
    // Its side of her: the side it came from.
    const side = this.sitFrom >= this.sitAt.x ? 1 : -1;
    const tx = this.sitAt.x + side * S.side;
    // The shuffle: small steps, a stop between, there by `walk`.
    if (t < S.walk) {
      const u = t / S.walk;
      const target = lerp(this.sitFrom, tx, smoothstep(0, 1, u));
      const ph = (u * 5) % 1;
      const step = (target - me.cx) * Math.min(1, dt * 14) * (0.3 + 0.7 * Math.sin(Math.PI * ph) ** 2);
      me.cx += step;
      me.x += step;
      me.grounded = true;
      me.vx = step / Math.max(1e-3, dt * 60);
      this.facing = tx >= this.sitFrom ? 1 : -1;
      me.facing = this.facing as -1 | 1;
    }
    const moonDir = (LOOK_MOON_X() ?? 960) < 960 ? -1 : 1;
    const gone = !her || Math.hypot(her.cx - me.cx, her.feetY - me.feetY) > S.leave;
    if (t >= S.lookAt) {
      this.facing = moonDir;
      me.facing = moonDir as -1 | 1;
    }
    // The lean: against her once its wings are folded, while she stays.
    const leanOn = t >= S.leanAt && !gone ? 1 : 0;
    this.leanK += (leanOn - this.leanK) * Math.min(1, dt * (leanOn ? 1.2 : 2));
    const toHer = her ? (her.cx >= me.cx ? 1 : -1) : 0;
    this.mesh.rotation = toHer * S.lean * this.leanK;
    if (t < S.lookAt && her) return { x: her.cx, y: her.feetY - 50, firm: 1, w: Math.min(1, t / 0.3) };
    // Up at the moon (a little down at her as it leans).
    const mx = me.cx + moonDir * 600;
    const my = headY - 520;
    return {
      x: lerp(mx, her?.cx ?? mx, 0.25 * this.leanK),
      y: lerp(my, (her?.feetY ?? my) - 60, 0.3 * this.leanK),
      firm: 1,
      w: 1,
    };
  }

  /** The freed moth that comes down onto its head, sits opening and closing its wings, and goes. */
  private drawAnswerMoth(clock: number): void {
    const g = this.answerG.clear();
    const A = TATTER.answer;
    const t = this.answerT - A.mothAt;
    if (this.answerT < 0 || t < 0 || t > A.mothT) return;
    const hx = this.me.cx + this.ox + this.facing * 3;
    const hy = this.me.feetY + this.oy + this.hopY * TATTER.scale - 64 * TATTER.scale + 6;
    // Down onto it (0.5 s), on it, then off up and away (0.6 s).
    const inU = Math.min(1, t / 0.5);
    const outU = Math.max(0, (t - (A.mothT - 0.6)) / 0.6);
    const x =
      hx +
      (1 - inU) * -this.facing * 60 +
      outU * this.facing * 90 +
      Math.sin(clock * 9) * 3 * (1 - inU + outU);
    const y = hy - (1 - inU * inU) * 90 - outU * outU * 140;
    const sitting = inU >= 1 && outU <= 0;
    // Sitting, its wings open slowly once and fold (one breath); flying, they beat.
    const flap = sitting
      ? 0.15 + 0.85 * Math.sin(Math.PI * Math.min(1, (t - 0.5) / 1.1)) ** 2
      : Math.abs(Math.sin(clock * 20));
    const w = 7;
    const up = -w * (0.2 + 0.9 * flap);
    for (const side of [-1, 1]) {
      g.poly([
        x,
        y,
        x + side * w * 1.1,
        y + up,
        x + side * w * 1.25,
        y + up * 0.3 + 2,
        x + side * w * 0.4,
        y + 2,
      ]).fill({
        color: A.moth,
        alpha: 0.95,
      });
    }
    g.ellipse(x, y + 1, 1.6, 3.2).fill({ color: 0x5a5046, alpha: 0.95 });
  }

  /** Where the beat wants it to look (and how firmly, how much of the old look it takes over), or null. */
  private beatLook(
    her: PlayerView | null,
    headY: number,
  ): { x: number; y: number; firm: number; w: number } | null {
    const me = this.me;
    if (this.beat === 'away' && this.awayK > 0.01)
      return { x: me.cx + this.facing * 160, y: me.feetY + 20, firm: 0.8, w: this.awayK };
    if (this.beat === 'keep' && this.keptAt) {
      if (this.noticeT < 0) return { x: this.keptAt.x, y: this.keptAt.y - 12, firm: 0.95, w: 1 };
      // Looks up at her (or at the broken wall as she comes through), then holds on her.
      const k = Math.min(1, this.noticeT / 0.35);
      return her ? { x: her.cx, y: her.feetY - 50, firm: 1, w: k } : null;
    }
    if (this.beat === 'wait' && her && this.joinT >= 0 && Math.abs(me.vx) > 0.2)
      return { x: me.cx + this.facing * 220, y: headY + 10, firm: 0.7, w: 0.8 };
    return null;
  }

  /** How far up off its heels the beat holds it: the bower's start as she breaks in. */
  private beatStrain(): number {
    if (this.beat !== 'keep' || this.noticeT < 0) return 0;
    const T = TATTER.keep;
    return T.jolt * Math.exp(-this.noticeT * 2.5) * Math.min(1, this.noticeT / 0.08);
  }

  private readonly goodPose: WingPose = { x: 0, y: 0, ang: 0, span: 1, lead: -1 };
  private readonly tornPose: WingPose = { x: 0, y: 0, ang: 0, span: 1, lead: -1 };

  /** A wing angle authored for a moth facing west (span pointing back = east) turned to its facing. */
  private angFor(a: number, back: number): number {
    return back > 0 ? a : Math.PI - a;
  }
  private lastT = 99;

  /** For tools (`__tatter`): what it is doing now. */
  get info(): Record<string, number> {
    const r = this.rig;
    return {
      t: this.lastT,
      perch: r.perch,
      strain: r.strain,
      tryWings: r.tryWings,
      soar: r.soar,
      soarW0: this.sec.soarW[0],
      soarW1: this.sec.soarW[1],
      hopY: this.hopY,
      lookW: r.look.w,
    };
  }
  /** The hop of its try, px (up = negative). */
  private hopY = 0;
  /** Which wing is torn (the near one as it sits). */
  private readonly torn: 0 | 1;

  private draw(clock: number): void {
    const p = this.painter;
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale() * TATTER.scale);
    p.fw = clamp(1 / scale, 0.06, 1.5);
    p.lx = 0.42;
    p.ly = -0.91;
    p.coolK = 0;
    p.keyK = 0.3;
    p.l2k = 0;
    p.grade = TATTER.grade;
    p.outline = 1.5;
    p.outlineColor = [0.03, 0.025, 0.045];
    p.outlineAlpha = 0.95;
    p.mesh.pivot.set(this.me.cx, this.me.feetY);
    p.mesh.position.set(this.me.cx + this.ox, this.me.feetY + this.oy + this.hopY * TATTER.scale);
    p.begin();
    // Its own moth wings (tatter-wing.ts): the good one behind it, the torn one over it.
    const j = this.rig.frame.j;
    const rx = j[J_COLLAR * 2]!;
    const ry = j[J_COLLAR * 2 + 1]!;
    const back = -this.facing;
    const W = TATTER.wings;
    const tryK = this.rig.tryWings;
    const beat = Math.sin(clock * 9.5);
    const good = this.goodPose;
    good.x = rx + back * 1.5;
    good.y = ry - 1;
    good.ang = this.angFor(W.good + (W.goodTry - W.good) * tryK * (0.65 + 0.35 * beat), back);
    // Held open to the moon (the sit): out flat and still, the span a little longer for it.
    const sp = this.spreadK;
    good.ang = good.ang + (this.angFor(W.goodOpen, back) - good.ang) * sp;
    good.span = W.goodSpan * (1 + (T_SIT.openSpan - 1) * sp);
    good.lead = back > 0 ? -1 : 1;
    const torn = this.tornPose;
    const tremble = 0.5 + 0.5 * Math.max(0, noise1(clock * 1.3, 191));
    torn.x = rx + back * 0.5;
    torn.y = ry + 1;
    torn.ang = this.angFor(
      W.torn +
        0.05 * Math.sin(clock * 1.1) +
        0.03 * tremble * Math.sin(clock * 17) +
        (W.tornTry - W.torn) * tryK * (0.5 + 0.5 * beat),
      back,
    );
    torn.ang = torn.ang + (this.angFor(W.tornOpen, back) - torn.ang) * sp;
    torn.span = W.tornSpan * (1 + (T_SIT.tornSpan - 1) * sp);
    torn.lead = back > 0 ? -1 : 1;
    const fw = flapWind(this.x, clock);
    p.outline = 1.2;
    // Open to the moon they are seen against its light: the membrane darker (less of the ash lift), the edge silver.
    const G = TATTER.grade;
    WING_GRADE.lift = (G.lift ?? 0) * (1 - 0.8 * sp);
    WING_GRADE.val = G.val * (1 - 0.25 * sp);
    p.grade = WING_GRADE;
    drawMothWing(p, good, WHOLE, clock, 0, fw, sp * T_SIT.rim);
    p.grade = TATTER.grade;
    p.outline = 1.5;
    drawVesper(p, this.rig.frame, this.view, clock);
    p.outline = 1.2;
    p.grade = WING_GRADE;
    drawMothWing(p, torn, TORN, clock, tremble, fw, sp * T_SIT.rim);
    p.grade = TATTER.grade;
    p.outline = 0;
    p.end(this.me.cx, this.me.feetY - 40);
  }

  destroy(): void {
    this.painter.mesh.destroy();
    this.answerG.destroy();
  }
}
