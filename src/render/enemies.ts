import type { Graphics } from 'pixi.js';
import { type AttackDef, type EnemyDef, enemyDef } from '../sim/ai/schema';
import { boxAt } from '../sim/combat/boxes';
import type { Colour } from '../sim/events';
import type { Enemy, Shot, Sound } from '../sim/state';
import { tuning } from '../sim/tuning';
import { NOISE_COLOURS } from './gfx/palette';
import { drawHand, drawKeycap, drawShield, drawStamp, rotRect, strokeText } from './glyphs';
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
    const t = Math.min(1, fx.koAge / 10);
    P.rot = back * (Math.PI / 2) * t * t;
    P.alpha = 1 - Math.max(0, fx.koAge - 10) / (CBT.koFrames - 10);
    P.dy = -Math.abs(Math.sin(P.rot)) * (Math.min(e.w, e.h) / 2);
    P.centre = false;
    return P;
  }
  if (e.state === 'DOWN' || e.state === 'COUNT' || e.state === 'REPOSSESSED') {
    const t = e.state === 'DOWN' ? Math.min(1, (e.stateFrame + 1) / 6) : 1;
    P.rot = back * dp.rot * t;
    P.sy = 1 - (1 - dp.sy) * t;
    P.dy = -Math.abs(Math.sin(P.rot)) * (e.w / 2);
    P.centre = false;
    if (e.state === 'REPOSSESSED') P.alpha = 0.9;
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
    P.rot = dir * lean;
    P.sx = 1.06;
    P.sy = 0.93;
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
  if (e.type === 'barker') {
    if (e.state === 'TELEGRAPH') {
      P.sy = 1 - 0.18 * k;
      P.sx = 1 + 0.1 * k;
      P.rot = back * 0.06 * k;
    } else if (e.state === 'ACTIVE' && e.attackId === 'lunge') {
      P.sx = 1.14;
      P.sy = 0.9;
    }
  } else if (e.type === 'grinder') {
    if (e.state === 'TELEGRAPH' && e.attackId === 'charge') {
      P.dx = Math.sin(fx.frame * 2.1) * 2.5 * k;
      P.rot = back * 0.05 * k;
    }
  } else if (e.type === 'gull' && a?.dive !== undefined) {
    if (e.state === 'ACTIVE') {
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

  if (e.state === 'KO') {
    // Tipping over and fading (no voices: it's out).
    drawBody(g, e, x, y, X, PALETTE.enemyBody, frame, 0, true);
    return { status: 'ko' };
  }
  if (e.state === 'REPOSSESSED') {
    // Desaturated to an outline: it has nothing left to say; the ledger stamp says why.
    g.roundRect(x, y, W, H, 12).stroke({ width: 3, color: PALETTE.repossessed, alpha: 0.8 });
    g.roundRect(x + 6, y + 6, W - 12, H - 12, 10).fill({ color: PALETTE.repossessed, alpha: 0.12 });
    const t = fx.repoAge;
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
      const size = 22;
      drawStamp(f, 'REPOSSESSED', wx + W / 2, wy - 30, size, -0.14, PALETTE.stampRed, a, k);
    }
    return { status: 'repossessed' };
  }

  const attack: AttackDef | undefined = e.attackId ? d.attacks[e.attackId] : undefined;
  const k = teleK(e);
  const telegraphing = e.state === 'TELEGRAPH';
  const tint = attack ? colourHex(attack.cue.tint) : PALETTE.enemyBody;
  const pulses = telegraphing && attack ? (attack.cue.pulses ?? 0) : 0;
  const pulse = pulses > 0 ? (0.5 - 0.5 * Math.cos(2 * Math.PI * pulses * k)) ** 2 : 0;
  const downed = e.state === 'DOWN' || e.state === 'COUNT';
  let body = mix(PALETTE.enemyBody, tint, k * SIG.teleTint * (attack?.sound === null ? 0.5 : 1));
  if (fx.flash) body = PALETTE.flash;
  const open = isOpen(e) && !telegraphing && !downed;
  const guardK = fx.guard / CBT.guardFrames;

  // Voice outlines (one ring per voice, innermost first). Armed = solid + vibrating; open = the ring
  // breaks into marching dashes (a Seize will take it now); taken = sparse dashes.
  const width = SIG.teleOutline0 + (SIG.teleOutline1 - SIG.teleOutline0) * k + 3 * pulse;
  let armedAny = false;
  voices.forEach((v, i) => {
    const pad = SIG.enemyOutlinePad + i * 7;
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
          color: oc,
          alpha: 1,
        });
      }
      if (upright) {
        const gwx = wx - pad;
        const gwy = wy - pad;
        gl.roundRect(gwx + dx + width / 2, gwy + dy + width / 2, r.w - width, r.h - width, 12).stroke({
          width,
          color: NOISE_COLOURS[v.colour].core,
          alpha: SIG.glowVoiceAlpha + (SIG.glowTeleAlpha - SIG.glowVoiceAlpha) * Math.max(k, pulse),
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
  const mouth = drawBody(g, e, x, y, X, body, frame, k, false, eye, downed);

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
  if (taken && mouth) {
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
    const [ex, ey] = mouth ?? [0, y + 16];
    g.circle(ex, ey - 10, 9).fill({ color: PALETTE.furious, alpha: 0.35 });
  }

  // World-space cues: telegraph reticle, per-attack reads, open hand, the Count.
  drawCues(f, gl, e, d, attack, wx, wy, k, fx, voices);

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

/** The body silhouette by type (local coords). Returns the mouth point (for the taken-voice X). */
function drawBody(
  g: Graphics,
  e: Enemy,
  x: number,
  y: number,
  X: (lx: number, lw?: number) => number,
  body: number,
  frame: number,
  k: number,
  ko: boolean,
  eye: number = PALETTE.enemyDark,
  downed = false,
): [number, number] | null {
  const W = e.w;
  const H = e.h;
  const dark = PALETTE.enemyDark;
  const face = e.facing;
  const shut = downed || ko;
  const ba = downed ? 0.85 : 1;
  switch (e.type) {
    case 'grinder': {
      g.roundRect(x + 4, y + 10, W - 8, H - 10, 16).fill({ color: body, alpha: ba });
      // Exhaust pipe at the back.
      g.rect(X(4, 12), y - 8, 12, 22).fill(dark);
      const wx = X(78);
      const wy = y + 58;
      g.circle(wx, wy, 25).fill(dark);
      const spin = (e.state === 'TELEGRAPH' || e.state === 'ACTIVE' ? 0.5 : 0.08) * frame * face;
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        g.moveTo(wx, wy).lineTo(wx + Math.cos(a) * 21, wy + Math.sin(a) * 21);
      }
      g.stroke({ width: 3, color: body, alpha: 0.9 });
      g.rect(X(84, 12), y + 22, 12, 9).fill(shut ? { color: dark, alpha: 0.5 } : eye);
      g.rect(X(58, 50), y + 90, 50, 14).fill(dark);
      for (let i = 0; i < 5; i++) {
        const tx = X(60 + i * 10, 8);
        g.poly([tx, y + 90, tx + 8, y + 90, tx + 4, y + 97]).fill(body);
      }
      return [X(100), y + 97];
    }
    case 'gull': {
      const tele = e.state === 'TELEGRAPH';
      const diving = e.state === 'ACTIVE';
      const flap = tele || diving || shut ? 0 : Math.sin(frame * 0.45) * 12;
      const cy = y + 22;
      // Ticker-tape tail streamers.
      for (let i = 0; i < 2; i++) {
        const wv = Math.sin(frame * 0.3 + i * 2) * 4;
        g.moveTo(X(8), cy + 2 + i * 5)
          .lineTo(X(-6), cy + 4 + i * 6 + wv)
          .lineTo(X(-16), cy + 2 + i * 8 - wv)
          .stroke({ width: 3, color: PALETTE.stampPaper, alpha: 0.8 });
      }
      // Wings: spread and flapping; folded back in a telegraph / dive.
      const wingTip = tele || diving ? [X(2), cy - 6] : [X(10), cy - 22 - flap];
      g.poly([X(18), cy - 4, wingTip[0] as number, wingTip[1] as number, X(38), cy - 2]).fill({
        color: mix(body, 0xffffff, 0.25),
        alpha: ba,
      });
      g.ellipse(X(28), cy, 22, 12).fill({ color: body, alpha: ba });
      g.circle(X(46), cy - 6, 10).fill({ color: body, alpha: ba });
      // Beak.
      g.poly([X(52), cy - 9, X(66), cy - 4, X(52), cy - 1]).fill(PALETTE.beak);
      if (shut) g.rect(X(44, 7), cy - 10, 7, 2).fill(dark);
      else g.rect(X(46, 5), cy - 11, 5, 5).fill(eye);
      // Far wing (over the body) when spread.
      if (!tele && !diving)
        g.poly([X(22), cy - 2, X(16), cy - 20 + flap * 0.6, X(34), cy]).fill({
          color: mix(body, 0x000000, 0.15),
          alpha: ba,
        });
      g.rect(X(22, 3), cy + 10, 3, 8).fill(dark);
      g.rect(X(32, 3), cy + 10, 3, 8).fill(dark);
      return [X(58), cy - 4];
    }
    case 'clerk':
    case 'runner': {
      const runner = e.type === 'runner';
      const hop = e.state === 'HOP';
      const legH = runner ? 20 : 24;
      const legY = y + H - legH;
      const stride =
        e.state === 'FLEE' || (e.state === 'CHASE' && Math.abs(e.vx) > 0.5) ? Math.sin(frame * 0.6) * 7 : 0;
      if (hop) {
        g.rect(X(W / 2 - 13, 10), legY, 10, legH - 8).fill(dark);
        g.rect(X(W / 2 + 3, 10), legY, 10, legH - 8).fill(dark);
      } else {
        g.poly([
          X(W / 2 - 10),
          legY,
          X(W / 2 - 2),
          legY,
          X(W / 2 - 4 + stride),
          y + H,
          X(W / 2 - 12 + stride),
          y + H,
        ]).fill(dark);
        g.poly([
          X(W / 2 + 2),
          legY,
          X(W / 2 + 10),
          legY,
          X(W / 2 + 12 - stride),
          y + H,
          X(W / 2 + 4 - stride),
          y + H,
        ]).fill(dark);
      }
      const top = y + (runner ? 22 : 26);
      g.roundRect(x + 4, top, W - 8, legY - top + 4, 8).fill({ color: body, alpha: ba });
      // Collar and tie.
      g.poly([X(W / 2 - 6), top, X(W / 2 + 6), top, X(W / 2), top + 12]).fill(PALETTE.stampPaper);
      const hx = X(W / 2 + 2);
      const hy = y + (runner ? 12 : 14);
      g.circle(hx, hy, runner ? 10 : 12).fill({ color: body, alpha: ba });
      // Green eyeshade.
      g.poly([
        X(W / 2 - 10),
        hy - 6,
        X(W / 2 + 12),
        hy - 6,
        X(W / 2 + 22),
        hy - 1,
        X(W / 2 - 8),
        hy - 1,
      ]).fill(PALETTE.eyeshade);
      if (shut) g.rect(X(W / 2 + 6, 6), hy + 1, 6, 2).fill(dark);
      else g.rect(X(W / 2 + 7, 4), hy - 1, 4, 5).fill(eye);
      if (runner) {
        // The ledger under its arm (violet: it holds your Poundage).
        g.rect(X(W / 2 - 16, 16), top + 12, 16, 22).fill(PALETTE.violet);
        g.rect(X(W / 2 - 16, 16), top + 12, 16, 22).stroke({ width: 2, color: dark });
        return [X(W / 2 + 10), hy + 6];
      }
      const a = e.attackId;
      const tele = e.state === 'TELEGRAPH';
      const stampUp = (tele || e.state === 'ACTIVE') && a === 'stamp';
      const tannoyUp = (tele || e.state === 'ACTIVE') && a === 'tannoy';
      // Stamp arm (back hand): raised overhead in its telegraph.
      const sx = X(W / 2 - 14);
      const sy = top + 8;
      const hand = stampUp ? { x: X(W / 2 - 2), y: y - 18 - 6 * k } : { x: X(W / 2 - 18), y: legY - 2 };
      g.moveTo(sx, sy).lineTo(hand.x, hand.y).stroke({ width: 6, color: body, cap: 'round' });
      g.rect(hand.x - 3, hand.y - (stampUp ? 14 : 12), 6, 12).fill(PALETTE.woodDark);
      g.rect(hand.x - 12, hand.y + (stampUp ? -2 : 0), 24, 9).fill(
        stampUp ? mix(PALETTE.brown, 0xffffff, 0.2 * k) : PALETTE.brown,
      );
      // Tannoy (front hand): at its mouth in the Tannoy telegraph.
      const tx = X(W / 2 + 12);
      const ty = top + 10;
      const th = tannoyUp ? { x: X(W / 2 + 18), y: hy + 4 } : { x: X(W / 2 + 18), y: top + 30 };
      g.moveTo(tx, ty).lineTo(th.x, th.y).stroke({ width: 6, color: body, cap: 'round' });
      const bell = [
        th.x,
        th.y - 5,
        X(W / 2 + 18 + 18),
        th.y - 12,
        X(W / 2 + 18 + 18),
        th.y + 12,
        th.x,
        th.y + 5,
      ];
      g.poly(bell).fill(tannoyUp ? mix(PALETTE.white, 0xffffff, k) : PALETTE.white);
      return [X(W / 2 + 10), hy + 6];
    }
    case 'auctioneer':
      return drawAuctioneer(g, e, y, X, body, frame, k, shut, eye);
    default: {
      // Barker: a bowler-hatted guard dog.
      g.roundRect(X(2, 54), y + 16, 54, 30, 10).fill({ color: body, alpha: ba });
      g.roundRect(X(40, 32), y + 6, 32, 28, 9).fill({ color: body, alpha: ba });
      g.rect(X(8, 10), y + 42, 10, 6).fill({ color: body, alpha: ba });
      g.rect(X(40, 10), y + 42, 10, 6).fill({ color: body, alpha: ba });
      // Tail: up while it winds up.
      const tailUp = e.state === 'TELEGRAPH' ? -10 : 0;
      g.moveTo(X(4), y + 22)
        .lineTo(X(-8), y + 12 + tailUp)
        .stroke({ width: 5, color: body, cap: 'round' });
      g.rect(X(40, 30), y + 2, 30, 5).fill(dark);
      g.roundRect(X(46, 18), y - 10, 18, 14, 6).fill(dark);
      if (shut) g.rect(X(58, 9), y + 16, 9, 3).fill(dark);
      else g.rect(X(60, 6), y + 13, 6, 6).fill(eye);
      // Mouth: open in a lunge.
      if (e.state === 'ACTIVE' && e.attackId === 'lunge')
        g.poly([X(62), y + 24, X(74), y + 22, X(74), y + 32, X(62), y + 28]).fill(dark);
      else g.rect(X(62, 10), y + 26, 10, 3).fill(dark);
      return [X(67), y + 27];
    }
  }
}

function drawAuctioneer(
  g: Graphics,
  e: Enemy,
  y: number,
  X: (lx: number, lw?: number) => number,
  body: number,
  frame: number,
  k: number,
  shut: boolean,
  eye: number,
): [number, number] {
  const W = e.w;
  const H = e.h;
  const dark = PALETTE.enemyDark;
  const b = e.boss;
  const p2 = b?.phase === 2;
  const a = e.attackId;
  const tele = e.state === 'TELEGRAPH';
  const active = e.state === 'ACTIVE';
  // Legs.
  g.rect(X(W / 2 - 26, 20), y + H - 52, 20, 52).fill(dark);
  g.rect(X(W / 2 + 6, 20), y + H - 52, 20, 52).fill(dark);
  // Tailcoat (phase 1) or shirt-sleeves and a red waistcoat (phase 2: the jacket is off).
  if (!p2) {
    g.poly([
      X(14),
      y + 64,
      X(W - 14),
      y + 64,
      X(W - 8),
      y + H - 36,
      X(W / 2),
      y + H - 60,
      X(8),
      y + H - 30,
    ]).fill(body);
  }
  g.roundRect(X(26, W - 52), y + 62, W - 52, 86, 12).fill(p2 ? mix(body, 0xffffff, 0.35) : body);
  g.poly([X(W / 2 - 22), y + 66, X(W / 2 + 22), y + 66, X(W / 2 + 18), y + 140, X(W / 2 - 18), y + 140]).fill(
    p2 ? PALETTE.furious : mix(body, 0x000000, 0.35),
  );
  for (let i = 0; i < 4; i++) g.circle(X(W / 2), y + 82 + i * 14, 3).fill(PALETTE.gold);
  // Head, moustache, top hat (askew and steaming in phase 2).
  const hx = X(W / 2 + 6);
  const hy = y + 40;
  g.circle(hx, hy, 24).fill(body);
  g.rect(X(W / 2 + 14, 8), hy - 8, 8, 8).fill(shut ? { color: dark, alpha: 0.4 } : eye);
  g.poly([X(W / 2 + 4), hy + 8, X(W / 2 + 34), hy + 4, X(W / 2 + 30), hy + 12, X(W / 2 + 18), hy + 11]).fill(
    dark,
  );
  const tilt = p2 ? 8 : 0;
  g.poly([
    X(W / 2 - 16),
    hy - 20 - tilt,
    X(W / 2 + 26),
    hy - 20 + tilt,
    X(W / 2 + 22),
    hy - 58 + tilt,
    X(W / 2 - 12),
    hy - 58 - tilt,
  ]).fill(dark);
  g.poly([
    X(W / 2 - 28),
    hy - 18 - tilt,
    X(W / 2 + 38),
    hy - 18 + tilt,
    X(W / 2 + 38),
    hy - 13 + tilt,
    X(W / 2 - 28),
    hy - 13 - tilt,
  ]).fill(dark);
  g.poly([
    X(W / 2 - 15),
    hy - 28 - tilt,
    X(W / 2 + 25),
    hy - 28 + tilt,
    X(W / 2 + 25),
    hy - 23 + tilt,
    X(W / 2 - 15),
    hy - 23 - tilt,
  ]).fill(p2 ? PALETTE.furious : PALETTE.brown);
  if (p2)
    for (let i = 0; i < 2; i++) {
      const u = (((frame * 0.03 + i * 0.5) % 1) + 1) % 1;
      g.circle(X(W / 2 + 4 + i * 12), hy - 64 - u * 30, 5 + u * 6).fill({
        color: PALETTE.white,
        alpha: 0.4 * (1 - u),
      });
    }
  // Gavel arm (front): raised high in the Gavel telegraph, slammed down in its active frames.
  const sh = { x: X(W - 30), y: y + 74 };
  let hand = { x: X(W - 6), y: y + 128 };
  let head = 0;
  if (a === 'gavel' && tele) {
    hand = { x: X(W - 22), y: y + 6 - 18 * k };
    head = -Math.PI / 2;
  } else if (a === 'gavel' && active) {
    hand = { x: X(W + 30), y: y + 110 };
    head = Math.PI / 2;
  } else if (tele && (a === 'cadence' || a === 'sellBag')) {
    hand = { x: X(W + 6), y: y + 44 };
    head = -Math.PI / 4;
  }
  g.moveTo(sh.x, sh.y)
    .lineTo(hand.x, hand.y)
    .stroke({ width: 12, color: p2 ? mix(body, 0xffffff, 0.35) : body, cap: 'round' });
  const noGavel = b?.noGavel;
  if (!noGavel) {
    const ang = head + (e.facing > 0 ? 0 : Math.PI);
    const hl = 34;
    const gx = hand.x + Math.cos(ang - (e.facing > 0 ? 0.6 : -0.6)) * hl;
    const gy = hand.y + Math.sin(ang - (e.facing > 0 ? 0.6 : -0.6)) * hl;
    g.moveTo(hand.x, hand.y).lineTo(gx, gy).stroke({ width: 5, color: PALETTE.woodDark });
    const glowing = a === 'gavel' && tele;
    g.poly(rotRect(gx, gy, 16, 34, ang + Math.PI / 2 - 0.6)).fill(
      glowing ? mix(PALETTE.brown, 0xffffff, 0.3 * k) : PALETTE.wood,
    );
  }
  // Patter: an open mouth.
  if ((tele || active) && a === 'patter')
    g.circle(X(W / 2 + 24), hy + 14, 5 + 3 * Math.abs(Math.sin(frame * 0.8))).fill(dark);
  return [X(W / 2 + 22), hy + 14];
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
    if (aid === 'patter') {
      for (let i = 0; i < 3; i++) {
        const u = (((frame * 0.06 + i / 3) % 1) + 1) % 1;
        const mx = wx + W / 2 + face * (30 + u * 60);
        const my = wy + 54;
        f.poly([mx, my - 8, mx + face * 10, my, mx, my + 8], false).stroke({
          width: 3,
          color: PALETTE.violet,
          alpha: (1 - u) * (0.4 + 0.6 * k),
        });
      }
    }
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
