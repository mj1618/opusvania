import type { Graphics } from 'pixi.js';
import { type AttackDef, type EnemyDef, enemyDef } from '../sim/ai/schema';
import { boxAt } from '../sim/combat/boxes';
import type { Colour } from '../sim/events';
import type { Enemy, Shot, Sound } from '../sim/state';
import { tuning } from '../sim/tuning';
import { type BodyPoints, CREATURE_BODY, drawCreature } from './creatures';
import { NOISE_COLOURS } from './gfx/palette';
import { drawHand, drawKeycap, drawShield, drawStamp, strokeText } from './glyphs';
import { drawVoiceArcs } from './juice/soundviz';
import { JUICE } from './juice/tuning';
import { dashPath, rngFor, vibration } from './outline';
import { CBT, colourHex, PALETTE, SIG } from './palette';

/** Per-enemy feedback state the signature renderer steps from events (render-only). */
export interface EnemyFx {
  frame: number;
  /** Hit flash: white body. */
  flash: boolean;
  /** Guarded Seize: frames left of the white outline flash, and the contact point (world). */
  guard: number;
  guardAt: { x: number; y: number } | null;
  /** Refused Seize (white-only enemy): frames left of static crackle. */
  refused: number;
  /** Count tick pulse 0..1, and a "no" (punch on a downed enemy) flash 0..1. */
  countPulse: number;
  countNo: number;
  /** Frames since KO / repossess (-1 = not). */
  koAge: number;
  repoAge: number;
  /** Frames since RISE started (for the get-up pose), -1 = not rising. */
  kid: { x: number; y: number };
  /** The enemy's shots (for the Clerk's landing mark while its mortar flies). */
  shots: readonly Shot[];
}

export interface Pose {
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
  dx: number;
  dy: number;
  /** Rotate about the body centre (flyers) instead of the feet. */
  centre: boolean;
}

/** States in which the voices are open to a Seize (mirror of the sim's OPEN set). */
const OPEN = new Set(['TELEGRAPH', 'RECOVERY', 'STAGGER', 'LAUNCHED', 'FLINCH', 'DOWN', 'COUNT']);

export function isOpen(e: Enemy): boolean {
  return OPEN.has(e.state) || e.rattled > 0;
}

/** Telegraph progress 0..1 (1 = the active frame). */
export function teleK(e: Enemy): number {
  if (e.state === 'TELEGRAPH') return Math.min(1, e.stateFrame / Math.max(1, e.timer));
  if (e.state === 'ACTIVE') return 1;
  return 0;
}

const DOWN_POSE: Record<string, { rot: number; sy: number }> = {
  barker: { rot: 0.3, sy: 0.72 },
  gull: { rot: 1.2, sy: 0.8 },
  grinder: { rot: 0.18, sy: 0.88 },
  clerk: { rot: Math.PI / 2, sy: 1 },
  runner: { rot: Math.PI / 2, sy: 1 },
  auctioneer: { rot: 0.5, sy: 0.82 },
};

/** How the body is posed this frame (render-only transform of the body graphics). */
export function enemyPose(e: Enemy, fx: EnemyFx): Pose {
  const d = enemyDef(e.type);
  const P: Pose = { rot: 0, sx: 1, sy: 1, alpha: 1, dx: 0, dy: 0, centre: d.flying };
  const back = -e.facing;
  const k = teleK(e);
  const dp = DOWN_POSE[e.type] ?? { rot: 0.3, sy: 0.8 };
  if (e.state === 'KO') {
    // Knocked clean out: launched up and back, spinning, then it pops (the poof is world-space).
    const t = fx.koAge;
    P.centre = true;
    P.rot = back * t * 0.32;
    P.dx = back * t * 5;
    P.dy = -e.h / 2 - 16 * t + 0.9 * t * t;
    P.sx = P.sy = 1 + Math.min(0.15, t * 0.01);
    P.alpha = 1 - Math.max(0, t - 20) / (CBT.koFrames - 20);
    return P;
  }
  if (e.state === 'REPOSSESSED') {
    // Deflates as its sound is taken: squashes flat with a wobble, spreading at the base.
    const t = Math.min(1, Math.max(0, fx.repoAge) / JUICE.deflateFrames);
    const ease = 1 - (1 - t) ** 3;
    const wob = Math.sin(Math.max(0, fx.repoAge) * 0.9) * 0.08 * (1 - t);
    const dpz = DOWN_POSE[e.type] ?? { rot: 0.3, sy: 0.8 };
    P.rot = back * dpz.rot * (1 - ease);
    P.sy = (1 - (1 - JUICE.deflateSy) * ease) * (1 + wob);
    P.sx = (1 + 0.35 * ease) * (1 - wob);
    P.centre = false;
    P.alpha = 1 - 0.35 * ease;
    return P;
  }
  if (e.state === 'DOWN' || e.state === 'COUNT') {
    const t = e.state === 'DOWN' ? Math.min(1, (e.stateFrame + 1) / 6) : 1;
    P.rot = back * dp.rot * t;
    P.sy = 1 - (1 - dp.sy) * t;
    P.dy = -Math.abs(Math.sin(P.rot)) * (e.w / 2);
    P.centre = false;
    return P;
  }
  if (e.state === 'RISE') {
    const t = 1 - Math.min(1, e.stateFrame / Math.max(1, tuning.combat.riseFrames));
    P.rot = back * dp.rot * t;
    P.sy = 1 - (1 - dp.sy) * t;
    P.dy = -Math.abs(Math.sin(P.rot)) * (e.w / 2);
    P.centre = false;
    return P;
  }
  if (e.state === 'FLINCH' || Math.abs(e.kb) > 3) {
    const dir = e.kb !== 0 ? Math.sign(e.kb) : back;
    const lean = CBT.flinchLean + Math.min(0.2, Math.abs(e.kb) * CBT.kbLeanPer);
    // The first frames of a flinch snap hard (squash away from the blow), then settle.
    const snap = fx.flash ? 1 : 0;
    P.rot = dir * lean * (1 + 0.6 * snap);
    P.sx = 1.06 + 0.1 * snap;
    P.sy = 0.93 - 0.08 * snap;
    return P;
  }
  if (e.state === 'STAGGER') {
    P.rot = Math.sin(fx.frame * 0.45) * 0.1;
    P.sy = 0.94;
    return P;
  }
  if (e.state === 'LAUNCHED') {
    P.rot = back * 0.35;
    return P;
  }
  if (e.state === 'HOP') {
    P.sy = 0.86;
    P.sx = 1.06;
    return P;
  }
  const a = e.attackId ? d.attacks[e.attackId] : undefined;
  // Idle breathing (walkers squash a touch on the in-breath).
  if (!d.flying && (e.state === 'PATROL' || e.state === 'CHASE' || e.state === 'RETRIEVE')) {
    const br = Math.sin(fx.frame * 0.1 + e.id * 1.7);
    P.sy = 1 + 0.025 * br;
    P.sx = 1 - 0.015 * br;
  }
  if (e.type === 'barker') {
    if (e.state === 'TELEGRAPH') {
      // Coils down and back on its haunches, shivering as the bark builds.
      P.sy = 1 - 0.22 * k;
      P.sx = 1 + 0.12 * k;
      P.rot = back * 0.1 * k;
      P.dx = back * 6 * k + Math.sin(fx.frame * 2.2) * 1.5 * k;
    } else if (e.state === 'ACTIVE' && e.attackId === 'lunge') {
      P.sx = 1.22;
      P.sy = 0.86;
      P.rot = -back * 0.08;
    }
  } else if (e.type === 'grinder') {
    if (e.state === 'TELEGRAPH' && e.attackId === 'charge') {
      P.dx = Math.sin(fx.frame * 2.1) * 2.5 * k;
      P.rot = back * 0.05 * k;
    }
  } else if (e.type === 'gull' && a?.dive !== undefined) {
    if (e.state === 'TELEGRAPH') {
      // Rears back and shivers before the dive.
      P.rot = back * 0.25 * k + Math.sin(fx.frame * 1.8) * 0.04 * k;
    } else if (e.state === 'ACTIVE') {
      const th = Math.atan2(e.aimY, e.aimX);
      P.rot = e.facing > 0 ? th : th - Math.PI;
    } else if (e.state === 'RECOVERY' && e.timer === a.stuckRecovery) {
      // Beak stuck in the floor, tail up, wiggling.
      P.rot = e.facing * 1.25 + Math.sin(fx.frame * 1.3) * 0.06;
      P.dy = 10;
    }
  } else if (e.type === 'runner' && e.state === 'FLEE') {
    P.rot = e.facing * 0.18;
  } else if (e.type === 'auctioneer' && e.state === 'TELEGRAPH' && e.attackId === 'hop') {
    P.sy = 1 - 0.12 * k;
    P.sx = 1 + 0.05 * k;
  } else if (e.type === 'clerk' && e.state === 'TELEGRAPH' && e.attackId === 'stamp') {
    P.sy = 1 + 0.06 * k;
    P.sx = 1 - 0.04 * k;
  }
  return P;
}

export interface EnemyDraw {
  status: string;
}

/**
 * Draws one enemy. `g` is the enemy's own graphics (local coords: origin = feet centre, posed by the
 * caller); `f` (front) and `gl` (emissive) are world-space. (wx, wy) = world top-left as drawn.
 */
export function drawEnemy(
  g: Graphics,
  f: Graphics,
  gl: Graphics,
  e: Enemy,
  wx: number,
  wy: number,
  voices: Sound[],
  fx: EnemyFx,
  pose: Pose,
  light: (x: number, y: number, r: number, c: Colour, i: number) => void,
  toWorld: (lx: number, ly: number) => [number, number] = (lx, ly) => [wx + e.w / 2 + lx, wy + e.h + ly],
): EnemyDraw {
  const d = enemyDef(e.type);
  const W = e.w;
  const H = e.h;
  const x = -W / 2;
  const y = -H;
  const frame = fx.frame;
  const face = e.facing;
  const X = (lx: number, lw = 0) => (face > 0 ? x + lx : x + W - lx - lw);
  const upright = Math.abs(pose.rot) < 0.03 && pose.alpha >= 1;
  const base = CREATURE_BODY[e.type] ?? PALETTE.enemyBody;

  if (e.state === 'KO') {
    // Launched and spinning (pose), eyes crossed out: it's out.
    drawCreature(g, e, x, y, X, {
      frame,
      k: 0,
      hurt: true,
      downed: false,
      ko: true,
      body: fx.koAge < 3 ? PALETTE.flash : base,
      eye: PALETTE.enemyDark,
      deflate: 0,
    });
    return { status: 'ko' };
  }
  if (e.state === 'REPOSSESSED') {
    // Deflating as its sound is taken (pose squashes it), colour draining to the ledger grey;
    // the ledger stamp slams on above it.
    const t = Math.max(0, fx.repoAge);
    const drain = Math.min(1, t / JUICE.deflateFrames);
    drawCreature(g, e, x, y, X, {
      frame: fx.repoAge >= 0 ? frame - t : frame,
      k: 0,
      hurt: false,
      downed: true,
      ko: false,
      body: fx.flash ? PALETTE.flash : mix(base, PALETTE.repossessed, 0.4 + 0.6 * drain),
      eye: PALETTE.enemyDark,
      deflate: Math.max(0.31, drain),
    });
    g.roundRect(x, y, W, H, 12).stroke({ width: 3, color: PALETTE.repossessed, alpha: 0.5 * drain });
    // The last of its air escaping: small puffs rising off it for the first beats.
    if (t < JUICE.deflateFrames)
      for (let i = 0; i < 3; i++) {
        const u = (((t * 0.06 + i / 3) % 1) + 1) % 1;
        f.circle(wx + W / 2 + (i - 1) * W * 0.3, wy + H * 0.4 - u * 50, 5 + u * 9).fill({
          color: PALETTE.dust,
          alpha: 0.55 * (1 - u) * (1 - drain),
        });
      }
    if (t >= 0) {
      const slam = CBT.stampSlamFrames;
      let k = 1;
      if (t < slam) {
        const u = t / slam;
        k =
          u < 0.6
            ? CBT.stampStartScale + (0.88 - CBT.stampStartScale) * (u / 0.6)
            : 0.88 + 0.12 * ((u - 0.6) / 0.4);
      }
      const a = t < slam ? Math.min(1, 0.3 + t / 4) : 1;
      drawStamp(f, 'REPOSSESSED', wx + W / 2, wy - 30, 24, -0.14, PALETTE.stampRed, a, k);
      if (t >= 5 && t < 12) {
        // The slam lands: an ink ring bursts out from the stamp.
        const u = (t - 5) / 7;
        f.ellipse(wx + W / 2, wy - 30, 90 + 90 * u, 30 + 30 * u).stroke({
          width: 6 * (1 - u) + 1,
          color: PALETTE.stampRed,
          alpha: 1 - u,
        });
      }
    }
    return { status: 'repossessed' };
  }

  const attack: AttackDef | undefined = e.attackId ? d.attacks[e.attackId] : undefined;
  const k = teleK(e);
  const telegraphing = e.state === 'TELEGRAPH';
  const tint = attack ? colourHex(attack.cue.tint) : base;
  const pulses = telegraphing && attack ? (attack.cue.pulses ?? 0) : 0;
  const pulse = pulses > 0 ? (0.5 - 0.5 * Math.cos(2 * Math.PI * pulses * k)) ** 2 : 0;
  const downed = e.state === 'DOWN' || e.state === 'COUNT';
  let body = mix(base, tint, k * SIG.teleTint * (attack?.sound === null ? 0.5 : 1));
  if (fx.flash) body = PALETTE.flash;
  const open = isOpen(e) && !telegraphing && !downed;
  const guardK = fx.guard / CBT.guardFrames;

  // Voice outlines (one ring per voice, innermost first). Armed = solid + vibrating; open = the ring
  // breaks into marching dashes (a Seize will take it now); taken = sparse dashes.
  const widthAll = SIG.teleOutline0 + (SIG.teleOutline1 - SIG.teleOutline0) * k + 3 * pulse;
  let armedAny = false;
  voices.forEach((v, i) => {
    const pad = SIG.enemyOutlinePad + i * 7;
    // While it winds up, the voice behind the attack dominates; its other voices go thin and dim
    // (the Auctioneer's pink ring used to outshine a violet Patter wind-up: L4 boss clip).
    const quiet = telegraphing && !!attack?.sound && v.name !== attack.sound;
    const width = quiet ? SIG.teleOutline0 * 0.5 : widthAll;
    let c = colourHex(v.colour);
    if (guardK > 0) c = mix(c, PALETTE.flash, guardK);
    const r = { x: x - pad, y: y - pad, w: W + 2 * pad, h: H + 2 * pad };
    if (v.status === 'home') {
      armedAny = true;
      const { dx, dy } = vibration(v.colour, frame);
      const oc = mix(c, 0xffffff, pulse * 0.7);
      if (open && v.colour !== 'white') {
        // Open: bright marching dashes whose gaps breathe.
        const gap = 7 + 5 * (0.5 + 0.5 * Math.sin(frame * 0.35));
        const w2 = Math.max(4, width);
        const pts = [
          r.x + w2 / 2,
          r.y + w2 / 2,
          r.x + r.w - w2 / 2,
          r.y + w2 / 2,
          r.x + r.w - w2 / 2,
          r.y + r.h - w2 / 2,
          r.x + w2 / 2,
          r.y + r.h - w2 / 2,
        ];
        dashPath(g, pts, true, 14, gap, frame * 1.5);
        g.stroke({ width: w2, color: mix(c, 0xffffff, 0.25), alpha: 1, cap: 'butt' });
      } else {
        g.roundRect(r.x - dx + 1, r.y - dy + 1, r.w - 2, r.h - 2, 12).stroke({
          width: 2,
          color: c,
          alpha: 0.35,
        });
        g.roundRect(r.x + dx + width / 2, r.y + dy + width / 2, r.w - width, r.h - width, 12).stroke({
          width,
          color: quiet ? c : oc,
          alpha: quiet ? 0.45 : 1,
        });
      }
      if (upright) {
        const gwx = wx - pad;
        const gwy = wy - pad;
        gl.roundRect(gwx + dx + width / 2, gwy + dy + width / 2, r.w - width, r.h - width, 12).stroke({
          width,
          color: NOISE_COLOURS[v.colour].core,
          alpha: quiet
            ? SIG.glowVoiceAlpha * 0.4
            : SIG.glowVoiceAlpha + (SIG.glowTeleAlpha - SIG.glowVoiceAlpha) * Math.max(k, pulse),
        });
      }
      if (i === 0)
        light(wx + W / 2, wy + H / 2, SIG.enemyLightRadius + W / 2, v.colour, SIG.enemyLightIntensity);
    } else {
      const pts = [
        r.x + 1,
        r.y + 1,
        r.x + r.w - 1,
        r.y + 1,
        r.x + r.w - 1,
        r.y + r.h - 1,
        r.x + 1,
        r.y + r.h - 1,
      ];
      dashPath(g, pts, true);
      g.stroke({
        width: Math.max(2, width * 0.5),
        color: c,
        alpha: telegraphing ? 0.9 : SIG.ghostOutlineAlpha,
        cap: 'butt',
      });
    }
  });
  if (voices.length === 0 && telegraphing && attack) {
    const pad = SIG.enemyOutlinePad;
    g.roundRect(x - pad, y - pad, W + 2 * pad, H + 2 * pad, 12).stroke({
      width: 2 + 4 * k,
      color: tint,
      alpha: 0.5 + 0.5 * k,
    });
  }

  const eye = e.furious ? PALETTE.furious : PALETTE.enemyDark;
  const hurt = fx.flash || e.state === 'FLINCH' || e.state === 'STAGGER' || Math.abs(e.kb) > 3;
  const pts: BodyPoints = drawCreature(g, e, x, y, X, {
    frame,
    k,
    hurt,
    downed,
    ko: false,
    body,
    eye,
    deflate: 0,
  });
  const mouth = pts.mouth;

  // Guarded: white shield at the contact point. Refused (white only): static crackle over it.
  if (fx.guard > 0 && fx.guardAt) {
    const t = 1 - guardK;
    const s = 34 * (t < 0.3 ? 1.4 - (t / 0.3) * 0.4 : 1);
    drawShield(f, fx.guardAt.x, fx.guardAt.y, s, PALETTE.flash, Math.min(1, guardK * 2));
  }
  if (fx.refused > 0) {
    const rnd = rngFor(frame, e.id + 7);
    const a = fx.refused / CBT.refusedFrames;
    f.rect(wx, wy, W, H).stroke({ width: 3, color: PALETTE.flash, alpha: a });
    for (let i = 0; i < 26; i++)
      f.rect(wx + rnd() * (W - 4), wy + rnd() * (H - 4), 4, 4).fill({ color: PALETTE.flash, alpha: a });
  }

  // Taken voice: a small "X" at the mouth, in the voice's colour (local, moves with the body).
  const taken = voices.find((v) => v.status !== 'home' && v.colour !== 'white');
  if (taken) {
    const c = colourHex(taken.colour);
    const [mx, my] = mouth;
    const s = 9;
    for (const [w, col, al] of [
      [5.5, PALETTE.bg, 0.9],
      [3, c, 1],
    ] as const)
      g.moveTo(mx - s, my - s)
        .lineTo(mx + s, my + s)
        .moveTo(mx + s, my - s)
        .lineTo(mx - s, my + s)
        .stroke({ width: w, color: col, alpha: al });
  }
  if (e.furious && !downed) {
    const [ex, ey] = pts.eye;
    g.circle(ex, ey, 8).fill({ color: PALETTE.furious, alpha: 0.35 });
    // Steam of rage.
    for (let i = 0; i < 2; i++) {
      const u = (((frame * 0.05 + i * 0.5) % 1) + 1) % 1;
      g.circle(ex - face * 6 + i * 8, y - 4 - u * 24, 3 + u * 5).fill({
        color: 0xffffff,
        alpha: 0.4 * (1 - u),
      });
    }
  }

  // Sound made visible: the armed voice leaves its mouth as arcs; a wind-up speeds them up.
  if (!downed && e.state !== 'STAGGER') {
    const speaking =
      (telegraphing && attack?.sound ? voices.find((v) => v.name === attack.sound) : undefined) ??
      voices.find((v) => v.status === 'home' && v.colour !== 'white');
    if (speaking && speaking.status === 'home') {
      const [mwx, mwy] = toWorld(mouth[0], mouth[1]);
      const boost = telegraphing && attack?.sound === speaking.name ? k : 0;
      drawVoiceArcs(f, gl, mwx + face * 6, mwy, face, speaking.colour, frame, e.id, boost);
    }
  }
  // Telegraph glint: a star flashes on its eye the moment it commits (Sekiro's perilous glint).
  if (telegraphing && e.stateFrame < JUICE.glintFrames && attack) {
    const [gx, gy] = toWorld(pts.eye[0], pts.eye[1]);
    const u = e.stateFrame / JUICE.glintFrames;
    const sz = JUICE.glintSize * (u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7);
    const c = tint;
    drawGlint(f, gx, gy, sz, c, frame);
    drawGlint(gl, gx, gy, sz * 1.4, c, frame);
  }
  // Knocked down: dizzy stars circling where its head is.
  if (downed) {
    const [hx, hy] = toWorld(pts.eye[0], pts.eye[1]);
    for (let i = 0; i < JUICE.dizzyStars; i++) {
      const a = frame * 0.12 + (i / JUICE.dizzyStars) * Math.PI * 2;
      const sx = hx + Math.cos(a) * JUICE.dizzyR;
      const sy = hy - 22 + Math.sin(a) * JUICE.dizzyR * 0.35;
      drawStar5(f, sx, sy, 7 + 2 * Math.sin(a), Math.sin(a) > 0 ? PALETTE.gold : 0xffffff);
    }
  }

  // World-space cues: telegraph reticle, per-attack reads, open hand, the Count.
  drawCues(f, gl, e, d, attack, wx, wy, k, fx, voices, toWorld(mouth[0], mouth[1]));

  if (downed) drawCount(f, gl, e, wx, wy, fx);
  else if (open && voices.some((v) => v.status === 'home' && v.colour !== 'white') && d.class !== 'boss') {
    // "Now it can be taken": a small open hand over its head.
    const bob = Math.sin(frame * 0.3) * 3;
    const a = 0.65 + 0.35 * Math.sin(frame * 0.5);
    drawHand(f, wx + W / 2, wy - 26 + bob, 22, -Math.PI / 2, PALETTE.seizeHand, a, 1);
  }

  if (telegraphing) return { status: 'telegraph' };
  if (downed) return { status: e.state === 'COUNT' ? 'count' : 'down' };
  return { status: armedAny ? 'humming' : 'ghost' };
}

/** A 4-point glint star (long vertical/horizontal rays). */
function drawGlint(g: Graphics, x: number, y: number, s: number, c: number, frame: number): void {
  if (s <= 0.5) return;
  const r = s * 0.16;
  const a = frame * 0.05;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const ang = a + (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? (i % 4 === 0 ? s : s * 0.55) : r;
    pts.push(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  g.poly(pts).fill({ color: c, alpha: 0.95 });
  g.circle(x, y, r * 1.4).fill({ color: 0xffffff, alpha: 1 });
}

function drawStar5(g: Graphics, x: number, y: number, r: number, c: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill({ color: c, alpha: 0.95 });
  g.poly(pts).stroke({ width: 1.5, color: PALETTE.enemyDark, alpha: 0.8 });
}

/** Per-attack telegraph reads and the "catch window" reticle (world space). */
function drawCues(
  f: Graphics,
  gl: Graphics,
  e: Enemy,
  d: EnemyDef,
  a: AttackDef | undefined,
  wx: number,
  wy: number,
  k: number,
  fx: EnemyFx,
  voices: Sound[],
  mouthW: [number, number] = [wx + e.w / 2, wy + 20],
): void {
  const W = e.w;
  const H = e.h;
  const frame = fx.frame;
  const face = e.facing;
  const cx = wx + W / 2;
  const cy = wy + H / 2;
  const tele = e.state === 'TELEGRAPH';
  if (tele && a) {
    const snd = a.sound ? voices.find((v) => v.name === a.sound) : undefined;
    const catchable = !!snd && snd.status === 'home' && snd.colour !== 'white';
    if (catchable) {
      // Catch window: gold corner brackets closing in on the body as the wind-up runs out.
      const pad = SIG.enemyOutlinePad + voices.length * 7 + 6 + (1 - k) * 46;
      const L = 18 + 10 * k;
      const al = 0.55 + 0.45 * k;
      const x0 = wx - pad;
      const y0 = wy - pad;
      const x1 = wx + W + pad;
      const y1 = wy + H + pad;
      for (const [px, py, sx, sy] of [
        [x0, y0, 1, 1],
        [x1, y0, -1, 1],
        [x1, y1, -1, -1],
        [x0, y1, 1, -1],
      ] as const) {
        f.moveTo(px + sx * L, py)
          .lineTo(px, py)
          .lineTo(px, py + sy * L);
      }
      f.stroke({ width: 5, color: PALETTE.gold, alpha: al, cap: 'round', join: 'round' });
    }
  }
  const aid = e.attackId;
  if (e.type === 'gull' && a?.dive !== undefined) {
    const lock = a.aimLockFrame ?? 16;
    if (tele && e.stateFrame >= lock - 8 && e.stateFrame < lock) {
      const u = (e.stateFrame - (lock - 8)) / 8;
      const pts = [cx, cy, fx.kid.x, fx.kid.y];
      dashPath(f, pts, false, 12, 10, frame * 2);
      f.stroke({ width: 3, color: PALETTE.violet, alpha: 0.35 + 0.5 * u });
    } else if (tele && e.stateFrame >= lock) {
      const len = (a.dive ?? 16) * a.active;
      const n = Math.hypot(e.aimX, e.aimY) || 1;
      const ex = cx + (e.aimX / n) * len;
      const ey = cy + (e.aimY / n) * len;
      f.moveTo(cx, cy).lineTo(ex, ey).stroke({ width: 4, color: PALETTE.violet, alpha: 0.95 });
      gl.moveTo(cx, cy).lineTo(ex, ey).stroke({ width: 8, color: PALETTE.violet, alpha: 0.6 });
      f.circle(ex, ey, 12).stroke({ width: 3, color: PALETTE.violet, alpha: 0.95 });
    }
    if (e.state === 'RECOVERY' && e.timer === a.stuckRecovery && e.stateFrame < 14) {
      // Dust where the beak went in.
      const t = e.stateFrame / 14;
      f.ellipse(cx, wy + H + 4, 20 + t * 30, 6).fill({ color: PALETTE.dust, alpha: 0.5 * (1 - t) });
    }
  }
  if (e.type === 'clerk') {
    // Stamp: a brown landing mark on the floor for the whole telegraph and while the mortar flies.
    const flying = fx.shots.some((s) => s.enemy === e.id && s.kind === 'mortar');
    if ((tele && aid === 'stamp') || flying) {
      const pr = d.attacks.stamp?.projectile;
      const w = pr?.land?.w ?? 96;
      const mx = e.aimX;
      const my = e.aimY;
      const shrink = tele ? 1.5 - 0.5 * k : 1;
      f.ellipse(mx, my - 3, (w / 2) * shrink, 9 * shrink).stroke({
        width: 3,
        color: PALETTE.brown,
        alpha: 0.9,
      });
      f.ellipse(mx, my - 3, w / 2, 9).fill({
        color: PALETTE.brown,
        alpha: 0.35 + 0.2 * Math.sin(frame * 0.5),
      });
      f.moveTo(mx, my - 150)
        .lineTo(mx, my - 118)
        .stroke({ width: 5, color: PALETTE.brown, alpha: 0.9 });
      f.poly([mx - 11, my - 124, mx + 11, my - 124, mx, my - 108]).fill({ color: PALETTE.brown, alpha: 0.9 });
      gl.ellipse(mx, my - 3, w / 2, 9).fill({ color: PALETTE.brown, alpha: 0.3 });
    }
    if ((tele || e.state === 'ACTIVE') && aid === 'tannoy') {
      const hb = d.attacks.tannoy?.hitboxes[0]?.box;
      if (hb) {
        const r = boxAt(e.x, e.y, e.w, face, hb);
        const R = (Math.min(r.w, r.h) / 2) * (tele ? k : 1);
        const ccx = r.x + r.w / 2;
        const ccy = r.y + r.h / 2;
        const rnd = rngFor(frame, e.id);
        const n = 28;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + rnd() * 0.2;
          const rr = R + (rnd() - 0.5) * 8;
          f.rect(ccx + Math.cos(ang) * rr - 4, ccy + Math.sin(ang) * rr - 4, 8, 8).fill({
            color: PALETTE.white,
            alpha: tele ? 0.5 + 0.4 * k : 1,
          });
        }
        f.circle(ccx, ccy, R).stroke({
          width: tele ? 3 : 8,
          color: PALETTE.white,
          alpha: tele ? 0.5 + 0.4 * k : 1,
        });
        gl.circle(ccx, ccy, R).stroke({
          width: tele ? 4 : 12,
          color: PALETTE.white,
          alpha: tele ? 0.3 * k : 0.7,
        });
      }
    }
  }
  if (e.type === 'grinder' && aid === 'charge' && tele) {
    // Rev lines over the engine.
    for (let i = 0; i < 3; i++) {
      const ox = cx + (i - 1) * 18 + Math.sin(frame * 1.7 + i) * 2;
      const oy = wy - 8 - i * 3;
      f.moveTo(ox - 6, oy)
        .lineTo(ox, oy - 10 - 6 * k)
        .lineTo(ox + 6, oy)
        .stroke({ width: 3, color: PALETTE.brown, alpha: 0.5 + 0.5 * k });
    }
  }
  if (e.type === 'grinder' && aid === 'sparks' && (tele || e.state === 'ACTIVE')) {
    const hb = d.attacks.sparks?.hitboxes[0]?.box;
    if (hb) {
      const r = boxAt(e.x, e.y, e.w, face, hb);
      const wxh = face > 0 ? wx + 78 : wx + W - 78;
      const why = wy + 58;
      const far = face > 0 ? r.x + r.w : r.x;
      const cone = [wxh, why, far, r.y, far, r.y + r.h];
      const al = tele ? 0.1 + 0.3 * k : 0.5;
      f.poly(cone).fill({ color: PALETTE.violet, alpha: al });
      f.poly(cone).stroke({ width: 2, color: PALETTE.violet, alpha: 0.4 + 0.5 * k });
      gl.poly(cone).fill({ color: PALETTE.violet, alpha: al * 0.8 });
    }
  }
  if (e.type === 'auctioneer' && (tele || e.state === 'ACTIVE') && a) {
    // Per-move glow on the lectern/body in the attack's colour.
    const c = colourHex(a.cue.tint);
    const pul = 0.5 + 0.5 * Math.sin(frame * 0.5);
    gl.roundRect(wx - 10, wy + H - 20, W + 20, 30, 10).fill({ color: c, alpha: 0.3 + 0.4 * k * pul });
    if (aid === 'patter' && tele) {
      // The patter winds up: the words pile out faster and brighter (they become the darts).
      for (let i = 0; i < 3; i++) {
        const u = (((frame * 0.06 + i / 3) % 1) + 1) % 1;
        const mx = mouthW[0] + face * (20 + u * 70);
        const my = mouthW[1] - u * 10;
        f.poly([mx, my - 8, mx + face * 10, my, mx, my + 8], false).stroke({
          width: 3,
          color: PALETTE.violet,
          alpha: (1 - u) * (0.4 + 0.6 * k),
        });
      }
    }
  }
  if (e.type === 'auctioneer') drawPatter(f, gl, e, voices, frame, mouthW, wx, wy);
}

/**
 * The Auctioneer's patter made visible: words tumble out of his mouth and float up the whole fight
 * (take his Patter voice and he goes quiet); calling a lot, "GOING ONCE / GOING TWICE" rise huge
 * over his head. Stateless (a function of the frame).
 */
function drawPatter(
  f: Graphics,
  gl: Graphics,
  e: Enemy,
  voices: Sound[],
  frame: number,
  mouth: [number, number],
  wx: number,
  wy: number,
): void {
  const quiet = ['DOWN', 'COUNT', 'STAGGER', 'KO', 'REPOSSESSED', 'LAUNCHED', 'RISE'].includes(e.state);
  const patter = voices.find((v) => v.name === 'patter');
  const face = e.facing;
  if (!quiet && patter?.status === 'home') {
    const every = JUICE.patterEvery;
    const life = JUICE.patterLife;
    const words = JUICE.patter;
    const newest = Math.floor(frame / every);
    for (let n = newest; n > newest - Math.ceil(life / every) - 1; n--) {
      const age = frame - n * every;
      if (age < 0 || age >= life) continue;
      const u = age / life;
      const rnd = rngFor(n, e.id + 5);
      const text = words[((n % words.length) + words.length) % words.length] as string;
      // Each word takes its own lane out and up from the mouth, so they don't pile up.
      const lane = ((n % 3) + 3) % 3;
      const x = mouth[0] + face * (40 + age * 2.2 + lane * 18);
      const y = mouth[1] - 24 - age * 1.5 - lane * 16 - rnd() * 8;
      const pop = age < 5 ? 0.6 + (age / 5) * 0.5 : 1.1 - 0.1 * u;
      const a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      const size = (15 + rnd() * 6) * pop;
      const ang = (rnd() - 0.5) * 0.35;
      strokeText(f, text, x + 2, y + 2, size, {
        color: PALETTE.bg,
        width: size / 3.5,
        alpha: a * 0.7,
        angle: ang,
      });
      strokeText(f, text, x, y, size, { color: PALETTE.violet, width: size / 5, alpha: a, angle: ang });
      strokeText(gl, text, x, y, size, {
        color: PALETTE.violet,
        width: size / 4,
        alpha: a * 0.35,
        angle: ang,
      });
    }
  }
  const b = e.boss;
  const a = e.attackId;
  if (e.state === 'TELEGRAPH' && b && (a === 'cadence' || a === 'sellBag')) {
    const text = a === 'sellBag' ? 'LOT: YOUR BAG!' : b.beat >= 2 ? 'GOING TWICE...' : 'GOING ONCE...';
    const k = teleK(e);
    const cx = wx + e.w / 2;
    const cy = wy - 130;
    const pul = 1 + 0.06 * Math.sin(frame * 0.5);
    const size = 40 * pul;
    strokeText(f, text, cx + 3, cy + 4, size, {
      color: PALETTE.bg,
      width: size / 3,
      alpha: 0.85,
      angle: -0.05,
    });
    strokeText(f, text, cx, cy, size, { color: PALETTE.pink, width: size / 4.5, alpha: 1, angle: -0.05 });
    strokeText(f, text, cx, cy, size, { color: 0xffffff, width: size / 14, alpha: 0.8, angle: -0.05 });
    strokeText(gl, text, cx, cy, size, {
      color: PALETTE.pink,
      width: size / 4,
      alpha: 0.4 + 0.4 * k,
      angle: -0.05,
    });
  }
}

/** The Count over a downed enemy: 10 ticks, the beat number, and the Seize key + open hand. */
function drawCount(f: Graphics, gl: Graphics, e: Enemy, wx: number, wy: number, fx: EnemyFx): void {
  const n = tuning.combat.countBeats;
  const cx = wx + e.w / 2;
  const R = CBT.countR * (1 + 0.18 * fx.countPulse);
  const cy = wy - CBT.countR - 34;
  const filled = e.state === 'COUNT' ? e.beat : 0;
  const no = fx.countNo;
  f.circle(cx, cy, R + 12).fill({ color: PALETTE.bg, alpha: 0.75 });
  f.circle(cx, cy, R + 12).stroke({
    width: 3,
    color: no > 0 ? PALETTE.furious : PALETTE.gold,
    alpha: 0.5 + 0.5 * Math.max(no, fx.countPulse),
  });
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const on = i < filled;
    f.moveTo(cx + Math.cos(a) * (R - 9), cy + Math.sin(a) * (R - 9))
      .lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4))
      .stroke({ width: on ? 7 : 4, color: on ? PALETTE.gold : PALETTE.hudDim, alpha: 1, cap: 'round' });
  }
  if (filled > 0) {
    strokeText(f, String(filled), cx, cy, CBT.countNum * (1 + 0.3 * fx.countPulse), {
      color: PALETTE.flash,
      width: 5,
    });
    gl.circle(cx, cy, R * 0.6).fill({ color: PALETTE.gold, alpha: 0.18 + 0.3 * fx.countPulse });
  }
  // SEIZE NOW: the open hand reaching in, and the Seize key.
  const pul = 0.5 + 0.5 * Math.sin(fx.frame * 0.45);
  const hs = CBT.countHandSize * (1 + 0.15 * pul);
  const hx = cx + R + 40;
  drawHand(f, hx, cy - 8, hs, Math.PI, PALETTE.seizeHand, 0.8 + 0.2 * pul, 0.6 + 0.4 * pul);
  gl.circle(hx, cy - 8, hs * 0.7).fill({ color: PALETTE.seizeHand, alpha: 0.2 * pul });
  drawKeycap(f, 'seize', hx, cy + 34, 30, 0.95);
  if (no > 0) strokeText(f, 'X', cx, cy, CBT.countNum * 1.4, { color: PALETTE.furious, alpha: no, width: 6 });
}

export function mix(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
