// biome-ignore-all lint/style/noNonNullAssertion: course arrays indexed in range
/**
 * The prologue's director, v2 "The first night" (docs/story/scenes/prologue-v2.md): the harness
 * side of the opening (render/prologue draws it). It owns:
 *
 *  - the beats and their clocks (render time, never wall time): the breath, the hatching, the
 *    played first night, the hollow (with a played escape), the summit, the title and the next night;
 *  - what the player may press (`mask`): nothing in the cinematic beats; in the first night walk
 *    and jump, then dash once Sorrel has dashed, then the glide once he has opened his wings, and
 *    the give button where it is asked for; in the hollow's escape walk and give (held = fold);
 *  - the scene the sim runs: the Grove without its creatures, glints and pods until the next night,
 *    then the whole Grove with one glint where she wakes (the one he would not take);
 *  - Sorrel the guide (guide.ts: his own body on the real sim, recorded clips, waiting at marks);
 *  - the glint of the first night (it drifts down, is held, given, tossed, bumped, lands on the fox);
 *  - an autopilot for captures and tests (`autopilot = true`): it plays her part by queuing
 *    scripted input (and places her at the start of each of his clips, a small cut).
 *
 * It writes `plan` (render/prologue/plan.ts) for the renderer. It never changes the sim except
 * through the Game harness (teleport, the scene to run, queued input), like the debug API.
 *
 * Boot (src/main.ts): it plays unless `?skipprologue` or `?manual` (the capture tools and tests);
 * `?prologue` plays it anyway, also under `?manual`, where it does not touch the run mode:
 * `__game.prologue.advance(n)` steps it. Escape skips it.
 */
import type { Game } from '../game';
import { parseInputScript } from '../input/script';
import { PrologueRenderer } from '../render/prologue/index';
import { newPlan, type ProloguePlan } from '../render/prologue/plan';
import { BEATS, type BeatId, COURSE, FOX_DRINK, HATCH, HOLLOW, MOSS, WAKE } from '../render/prologue/script';
import type { RenderStage } from '../render/stage';
import { ActionBit, type InputFrame } from '../sim/input';
import type { Scene } from '../sim/scene';
import { tuning } from '../sim/tuning';
import { Guide } from './guide';

const L = ActionBit.left;
const R = ActionBit.right;
const J = ActionBit.jump;
const X = ActionBit.dash;
const O = ActionBit.offer;
/** The glint's fall in keep-it-up, px per frame^2, and its fastest fall. */
const G = 0.075;
const G_MAX = 2.2;
/** F4: where they play keep-it-up (x from, x to, top). */
const F4 = { x0: 1760, x1: 2016, y: 608 };

export class PrologueDirector {
  readonly plan: ProloguePlan = newPlan();
  readonly renderer: PrologueRenderer;
  done = false;
  /** Plays her part (captures, tests): see the header. */
  autopilot = false;
  private beatIdx = 0;
  private prevBt = 0;
  private readonly guide: Guide;
  private readonly proScene: Scene;
  private lastFrame = -1;
  /** Keep-it-up: the glint's velocity, px/f. */
  private gvx = 0;
  private gvy = 0;
  /** The sail: from where, and frames into it. */
  private sail = { x: 0, y: 0, f: 0 };
  private hopT = 0;
  /** Seconds she has been below him without coming up (he goes back for her after `COURSE.lagBack`). */
  private lagT = 0;
  /** Where he will start leading again when he has gone back for her. */
  private backTo: (typeof COURSE.levels)[number] | null = null;
  /** Keep-it-up: whose turn it is to bump it. */
  private toward: 'her' | 'him' = 'her';
  private botLeg = -1;
  private botSail = false;

  constructor(
    private readonly game: Game,
    private readonly stage: RenderStage,
    /** true: it sets the run mode itself (frozen, then realtime). false under ?manual. */
    private readonly drive: boolean,
    /** The scene to hand over at the end. */
    private readonly fullScene: Scene,
  ) {
    this.proScene = { ...fullScene, enemies: [], pickups: [], pods: [] };
    game.useScene(this.proScene);
    this.guide = new Guide(tuning, this.proScene, game.seed);
    this.renderer = new PrologueRenderer(stage.ctx, stage.scene.layers, this.plan);
    stage.attachPrologue(this.renderer, (dt) => this.update(dt));
    game.afterStep.add(this.onStep);
    if (drive) game.mode = 'frozen';
  }

  /** The sim runs (the breath is over). */
  get simOn(): boolean {
    return this.done || this.beatIdx > 0;
  }

  get beat(): BeatId {
    return BEATS[this.beatIdx]!.id;
  }

  /** Advances the clock by `dt` render seconds (from the stage, before it draws). */
  update(dt: number): void {
    if (this.done) return;
    const P = this.plan;
    this.prevBt = P.bt;
    P.t += dt;
    P.bt += dt;
    if (P.beat === 'play') P.pt += dt;
    const len = BEATS[this.beatIdx]!.len;
    if (len !== null && P.bt >= len) this.nextBeat();
    this.timed();
  }

  /** Things that happen at a moment of a beat (crossings of `bt`). */
  private timed(): void {
    const P = this.plan;
    const at = (x: number): boolean => this.prevBt < x && P.bt >= x;
    if (P.beat === 'hatch') {
      if (at(HATCH.sorrelSplit)) this.guide.place(HATCH.sorrel.x, HATCH.sorrel.y + 40);
      if (at(HATCH.wingSplit)) this.game.teleport(HATCH.wing.x, HATCH.wing.y + 40);
    } else if (P.beat === 'hollow') {
      if (at(HOLLOW.play[0])) this.game.teleport(HOLLOW.x + 30 - HOLLOW.caseRx - 12, MOSS);
      // Still on the case when the lamp starts down: Sorrel tackles her into the ferns.
      if (at(HOLLOW.tackle[0]) && this.herX() > HOLLOW.ferns + 20) P.tackleAt = P.bt;
      if (P.tackleAt >= 0 && at(P.tackleAt + 0.9)) this.game.teleport(HOLLOW.ferns - 70, MOSS);
      // The hide is framed on the ferns: wherever she ran to, she is in them now.
      if (at(HOLLOW.hide[0]) && Math.abs(this.herX() - (HOLLOW.ferns - 70)) > 60)
        this.game.teleport(HOLLOW.ferns - 70, MOSS);
    } else if (P.beat === 'wake') {
      if (at(WAKE.fadeUp[0] - 0.4)) {
        // The next night: the whole Grove, and the glint he would not take where she wakes.
        this.game.useScene(this.nextNight());
        this.game.teleport(WAKE.at.x, WAKE.at.y);
      }
    }
  }

  private nextBeat(): void {
    const P = this.plan;
    this.beatIdx++;
    if (this.beatIdx >= BEATS.length) {
      this.finish();
      return;
    }
    P.beat = BEATS[this.beatIdx]!.id;
    P.bt = 0;
    this.prevBt = -1;
    if (P.beat === 'hatch') {
      // Out of the black onto the cocoons: the sim runs from here (her input masked).
      if (this.drive) this.game.mode = 'realtime';
      this.game.teleport(HATCH.wing.x, MOSS);
      this.guide.place(HATCH.sorrel.x, MOSS);
    } else if (P.beat === 'play') {
      P.phase = 'leg';
      P.pt = 0;
      P.leg = 0;
      P.can.jump = true;
      this.guide.play(COURSE.legs[0]!.clip);
    } else if (P.beat === 'hollow') {
      // Placed on the fox's back (drawn so); her body stands under it.
      this.game.teleport(FOX_DRINK, MOSS);
      P.glint.holder = 'wing';
    }
  }

  /** After every sim step of hers: his step, the played stretch, the autopilot. */
  private readonly onStep = (): void => {
    const f = this.game.state.frame;
    if (f === this.lastFrame || this.done) return;
    this.lastFrame = f;
    const P = this.plan;
    if (P.beat !== 'breath') this.guide.step(this.guideInput());
    if (P.beat === 'play') this.playStep();
    if (P.beat === 'hollow') this.hollowStep();
    P.sorrel = { prev: this.guide.prev.player, cur: this.guide.state.player };
    if (this.autopilot) this.bot();
  };

  /** His input this step when no clip is running: closed loop on where he must stand. */
  private guideInput(): InputFrame {
    const P = this.plan;
    const gx = this.guide.x;
    if (P.beat === 'hatch') {
      // He goes back under her cocoon to wait, then hops back west, ready.
      if (P.bt >= HATCH.wait[0] && P.bt < HATCH.wingSplit && gx < HATCH.wing.x - 40) return R;
      if (P.bt >= HATCH.ready[0] && gx > COURSE.start.x + 8) return L;
      return 0;
    }
    if (P.beat === 'play' && P.phase === 'back') {
      // Walking back for her (off the branch if need be), then to where the leg starts.
      const p = this.game.state.player;
      const hx = p.x + p.w / 2;
      const target = this.backTo && Math.abs(p.y + p.h - this.guide.y) < 10 ? this.backTo.from.x : hx;
      if (Math.abs(gx - target) > 10) return gx < target ? R : L;
      return 0;
    }
    if (P.beat === 'play' && P.phase === 'wait') {
      // "Come on": a hop every few seconds while she is not with him.
      this.hopT += 1 / 60;
      if (this.hopT >= COURSE.hopEvery) {
        this.hopT = 0;
        this.guide.play(COURSE.hop);
      }
    }
    return 0;
  }

  private herX(): number {
    const p = this.game.state.player;
    return p.x + p.w / 2;
  }

  private herFeet(): number {
    const p = this.game.state.player;
    return p.y + p.h;
  }

  private setPhase(phase: ProloguePlan['phase']): void {
    this.plan.phase = phase;
    this.plan.phaseAt = this.plan.pt;
  }

  /** The played first night, one sim step. */
  private playStep(): void {
    const P = this.plan;
    const g = this.guide;
    const p = this.game.state.player;
    const hx = this.herX();
    const hy = this.herFeet();
    const gp = g.state.player;
    const since = P.pt - P.phaseAt;
    // Moves he shows become hers.
    if (gp.mode === 'dash') P.can.dash = true;
    if (gp.gliding) P.can.glide = true;
    switch (P.phase) {
      case 'leg':
        if (g.idle) {
          if (P.leg === COURSE.legs.length - 1) {
            this.setPhase('stop');
            P.stopAt = P.pt;
          } else {
            this.setPhase('wait');
            this.hopT = 0;
          }
        }
        break;
      case 'wait':
        if (g.idle && Math.hypot(hx - g.x, hy - g.y) < COURSE.near && p.grounded) {
          P.leg++;
          if (P.leg === 1 && P.raceAt < 0) P.raceAt = P.pt;
          g.play(COURSE.legs[P.leg]!.clip);
          this.setPhase('leg');
          break;
        }
        // She fell behind (below him) and has not come up for a while: he goes back for her.
        this.lagT = hy > g.y + 100 ? this.lagT + 1 / 60 : 0;
        if (this.lagT > COURSE.lagBack && g.idle) {
          this.lagT = 0;
          this.backTo = null;
          this.setPhase('back');
        }
        break;
      case 'back': {
        // Down to her level and over to her; then to the start of the leg from where she stands, and lead again.
        const level = COURSE.levels.find((l) => Math.abs(hy - l.y) < 6 || (l.y === MOSS && hy > MOSS - 6));
        const together = Math.abs(hx - g.x) < 140 && Math.abs(hy - g.y) < 10 && g.state.player.grounded;
        if (together && level && p.grounded) {
          this.backTo = level;
          if (Math.abs(g.x - level.from.x) < 14) {
            P.leg = level.leg;
            g.play(COURSE.legs[P.leg]!.clip);
            this.setPhase('leg');
          }
        }
        break;
      }
      case 'stop':
        // She overtakes him on F4 and wins; he does not notice. Then a glint comes down between them.
        if (since > 1.2 && p.grounded && Math.abs(hy - F4.y) < 3 && hx > F4.x0) {
          this.setPhase('glint');
          P.glint = { on: true, x: (hx + g.x) / 2, y: F4.y - 320, holder: 'free' };
        }
        break;
      case 'glint': {
        // It drifts down like a seed toward her face; it waits there for her if she is not under it.
        const u = Math.min(1, since / COURSE.glintFall);
        const tx = hx + Math.sin(P.pt * 2.2) * 22 * (1 - u);
        const ty = hy - 62;
        P.glint.x += (tx - P.glint.x) * 0.04;
        P.glint.y += (Math.max(ty, F4.y - 320 + 260 * u) - P.glint.y) * 0.06;
        if (this.touches(P.glint.x, P.glint.y, 4)) {
          P.glint.holder = 'wing';
          this.setPhase('hold');
        }
        break;
      }
      case 'hold':
        if (since >= COURSE.holdCine) {
          this.setPhase('give');
          P.prompt = true;
        }
        break;
      case 'give': {
        const held = (this.game.state.prevInput & O) !== 0;
        P.give = Math.max(0, Math.min(1, P.give + (held ? 1 : -2) / (COURSE.giveHold * 60)));
        if (P.give >= 1) {
          P.prompt = false;
          P.glint.holder = 'sorrel';
          this.setPhase('his');
        }
        break;
      }
      case 'his':
        if (since >= COURSE.toss) {
          // He tosses it up, toward her.
          P.glint = { on: true, x: g.x, y: g.y - 70, holder: 'free' };
          this.aim(hx, hy - 80, 80, 3.4);
          this.toward = 'her';
          this.setPhase('bumps');
        }
        break;
      case 'bumps':
        this.bumpStep(hx, hy);
        break;
      case 'sail': {
        // Long and west off F4, down to the fox's nose at the pool's lip.
        this.sail.f++;
        const u = Math.min(1, this.sail.f / 160);
        const N = COURSE.nose;
        const cx = (this.sail.x + N.x) / 2;
        const cy = Math.min(this.sail.y, N.y) - 260;
        const a = (1 - u) * (1 - u);
        const b = 2 * u * (1 - u);
        const c = u * u;
        P.glint.x = a * this.sail.x + b * cx + c * N.x;
        P.glint.y = a * this.sail.y + b * cy + c * N.y;
        if (u >= 1) {
          P.sneezeAt = P.pt;
          this.setPhase('nose');
        }
        break;
      }
      case 'nose': {
        // The sneeze pops it up; it hangs over the fox's back for her.
        const k = Math.min(1, since / 0.8);
        P.glint.x = COURSE.nose.x + (FOX_DRINK - 30 - COURSE.nose.x) * k;
        P.glint.y = COURSE.nose.y - 120 * Math.sin(Math.min(1, k) * Math.PI * 0.6) - 4 * Math.sin(P.pt * 3);
        if (Math.abs(hx - FOX_DRINK) < COURSE.foxReach + 60 && hy > 1100 && since > 0.6) {
          P.glint.holder = 'wing';
          this.setPhase('end');
          this.nextBeat();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Keep-it-up, one frame: the glint falls slowly; her body sends it to him, his hop sends it back. */
  private bumpStep(hx: number, hy: number): void {
    const P = this.plan;
    const g = this.guide;
    const gl = P.glint;
    this.gvy = Math.min(G_MAX, this.gvy + G);
    gl.x += this.gvx;
    gl.y += this.gvy;
    if (this.toward === 'her' && this.gvy > -1 && this.touches(gl.x, gl.y, 8)) {
      P.bumps++;
      this.toward = 'him';
      if (P.bumps > COURSE.bumps) {
        // Too hard: it sails long, west, off F4; he dives after it.
        this.sail = { x: gl.x, y: gl.y, f: 0 };
        this.setPhase('sail');
        this.guide.play(COURSE.dive.clip);
        return;
      }
      this.aim(g.x, g.y - 70, 70, 3.8);
      return;
    }
    // His bump: a hop under it as it comes down to him.
    if (
      this.toward === 'him' &&
      this.gvy > 0 &&
      Math.abs(gl.x - g.x) < 34 &&
      gl.y > g.y - 120 &&
      gl.y < g.y - 40
    ) {
      if (g.idle) g.play('J4 .1');
      this.aim(hx, hy - 80, 80, 3.6);
      this.toward = 'her';
      return;
    }
    // Missed: it lands soft on the branch and bounces up toward her; off the edge, it drifts back.
    if (gl.y > F4.y - 12 && gl.x > F4.x0 - 10 && gl.x < F4.x1 + 10) {
      gl.y = F4.y - 12;
      this.gvy = -2.4;
      this.gvx = Math.sign(hx - gl.x) * 0.8;
    } else if (gl.y > F4.y + 120) {
      gl.x = hx;
      gl.y = F4.y - 300;
      this.gvx = 0;
      this.gvy = 0;
    }
  }

  /** Sends the glint to (tx, ty) in `frames`, first rising by about `lift` px/f. */
  private aim(tx: number, ty: number, frames: number, lift: number): void {
    const gl = this.plan.glint;
    this.gvx = (tx - gl.x) / frames;
    this.gvy = (ty - gl.y) / frames - 0.5 * G * frames;
    if (this.gvy > -lift * 0.5) this.gvy = -lift * 0.5;
  }

  /** Her box, grown by `pad`, holds the point. */
  private touches(x: number, y: number, pad: number): boolean {
    const p = this.game.state.player;
    return x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad;
  }

  /** The hollow's played escape: in the ferns, the give button held folds her wing over the glint. */
  private hollowStep(): void {
    const P = this.plan;
    P.inFerns = this.herX() < HOLLOW.ferns + 20;
    const play = P.bt >= HOLLOW.play[0] && P.bt < HOLLOW.play[1];
    const held = (this.game.state.prevInput & O) !== 0;
    const want = (play && held && P.inFerns) || P.bt >= HOLLOW.play[1] ? 1 : 0;
    P.fold += (want - P.fold) * 0.12;
  }

  /** What the player may press now. */
  mask(input: InputFrame): InputFrame {
    if (this.done) return input;
    const P = this.plan;
    if (P.beat === 'hollow') {
      const play = P.bt >= HOLLOW.play[0] && P.bt < HOLLOW.play[1] && P.tackleAt < 0;
      if (!play) return 0;
      // Into the ferns, not on past them out of the picture.
      let m = input & (L | R | O);
      if (this.herX() < HOLLOW.ferns - 150) m &= ~L;
      return m;
    }
    if (P.beat !== 'play') return 0;
    if (P.phase === 'hold' || P.phase === 'his' || P.phase === 'end') return 0;
    let m = L | R;
    if (P.can.jump) m |= J;
    if (P.can.dash) m |= X;
    if (P.phase === 'give') m |= O;
    let out = input & m;
    // The glide is not hers until he has shown it: a jump held while falling is let go.
    const p = this.game.state.player;
    if (!P.can.glide && !p.grounded && p.vy > 0 && (this.game.state.prevInput & J) !== 0) out &= ~J;
    return out;
  }

  /** Her part, played for captures and tests: one frame of queued input at a time. */
  private bot(): void {
    const P = this.plan;
    const game = this.game;
    if (game.queuedInput > 0) return;
    const hx = this.herX();
    const hy = this.herFeet();
    const g = this.guide;
    const one = (i: InputFrame): void => {
      game.queueInput([i]);
    };
    if (P.beat === 'play') {
      if ((P.phase === 'leg' || P.phase === 'wait') && this.botLeg !== P.leg) {
        // Copy his leg from where he started it, a little behind him.
        this.botLeg = P.leg;
        // (A little behind him, so the two of them are not drawn one on the other.)
        const start = P.leg === 0 ? COURSE.start : COURSE.legs[P.leg - 1]!.mark;
        game.teleport(start.x + (P.leg === 0 ? 30 : -40), start.y);
        game.queueInput(parseInputScript(`.14 ${COURSE.legs[P.leg]!.clip}`));
        return;
      }
      if (P.phase === 'give') {
        one(O);
        return;
      }
      if (P.phase === 'bumps') {
        const gl = P.glint;
        const toward = Math.sign(gl.x - hx);
        const near = Math.abs(gl.x - hx) < 40;
        if (near && this.gvy > 0 && gl.y > hy - 190 && gl.y < hy - 110 && game.state.player.grounded) {
          game.queueInput(parseInputScript('J8'));
          return;
        }
        if (this.gvx * (hx - gl.x) > 0 && Math.abs(gl.x - hx) > 24) one(toward < 0 ? L : R);
        else one(0);
        return;
      }
      if (P.phase === 'sail' && !this.botSail && g.frame > 20) {
        this.botSail = true;
        game.teleport(F4.x1 - 52, F4.y);
        game.queueInput(parseInputScript(`.8 ${COURSE.dive.clip}`));
        return;
      }
      if (P.phase === 'nose') {
        // (Landed up on a branch: the autopilot just puts her down by the water.)
        if (hy < 1200 && game.state.player.grounded) {
          game.teleport(FOX_DRINK - 220, MOSS);
          return;
        }
        if (Math.abs(hx - FOX_DRINK) > COURSE.foxReach) {
          one(hx < FOX_DRINK ? R : L);
          return;
        }
        one(0);
        return;
      }
      one(0);
      return;
    }
    if (P.beat === 'hollow' && P.bt >= HOLLOW.play[0] + 0.6 && P.bt < HOLLOW.play[1]) {
      one(hx > HOLLOW.ferns - 60 ? L : O);
      return;
    }
    void hy;
  }

  /**
   * The Grove as it is handed over: the whole scene, with the glint he would not take where she
   * wakes, and the scene's own glints within reach of that spot left out (so she starts with ONE
   * glint, as the script asks: spawn-1..3 lay where the fox slept). A design call to confirm.
   */
  private nextNight(): Scene {
    const near = (p: { x: number; y: number }): boolean =>
      Math.abs(p.x - WAKE.at.x) < 200 && Math.abs(p.y - WAKE.at.y) < 140;
    const own = (this.fullScene.pickups ?? []).filter((p) => !near(p));
    return {
      ...this.fullScene,
      pickups: [...own, { id: 'sorrels-glint', kind: 'glint', x: WAKE.at.x + 6, y: WAKE.at.y - 36 }],
    };
  }

  /** Skip to the next night, now. */
  skip(): void {
    if (this.done) return;
    this.game.useScene(this.nextNight());
    this.game.teleport(WAKE.at.x, WAKE.at.y);
    this.finish();
  }

  private finish(): void {
    this.done = true;
    this.plan.t = Math.max(this.plan.t, 0);
    this.game.afterStep.delete(this.onStep);
    if (this.drive && this.game.mode !== 'realtime') this.game.mode = 'realtime';
    this.stage.detachPrologue();
  }
}
