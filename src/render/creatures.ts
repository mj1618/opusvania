/**
 * Enemy bodies with personality (code-drawn, local coords: origin = feet centre, x = -W/2, y = -H;
 * the caller poses the Graphics). Each creature has an idle (breathing, blinking, fidgets), a walk
 * cycle keyed to its x (feet don't slide), anticipation poses that telegraph clearly (crouch, lean
 * back, mouth opening, a glow building in the attack's colour), a hurt face, and a sprawl when down.
 *
 *   Barker     a bowler-hatted bulldog in a pink collar (its Bark is the deed on the tag)
 *   Stock Gull a monocled ticker-tape gull
 *   Grinder    a knife-grinder's cart come alive: furnace-door jaw, lamp eye, grindstone
 *   Clerk      a stick-thin Receiver's clerk: eyeshade, spectacles, rubber stamp, pocket tannoy
 *   Runner     the clerk who ran off with your Poundage, ledger under an arm, sweating
 *   Auctioneer a showman behind his podium: top hat, moustache, tailcoat, gavel
 *
 * Render only; every animation is a function of the sim frame and state.
 */
import type { Graphics } from 'pixi.js';
import type { Enemy } from '../sim/state';
import { PALETTE } from './palette';

export interface BodyFx {
  frame: number;
  /** Telegraph progress 0..1. */
  k: number;
  /** Hit flash / flinch: the hurt face. */
  hurt: boolean;
  downed: boolean;
  ko: boolean;
  /** Body colour (already tinted toward the attack colour by the wind-up / white on a hit flash). */
  body: number;
  eye: number;
  /** 0..1 how deflated (repossessed): eyes shut, colour drained. */
  deflate: number;
}

/** Mouth and eye in local coords (for the taken-voice X, voice arcs and the telegraph glint). */
export interface BodyPoints {
  mouth: [number, number];
  eye: [number, number];
}

const INK = 0x1a1d26;
const TEETH = 0xf3ecd8;
const TONGUE = 0xe0607a;

/** Per-type base colours (desaturated, so the voice outlines stay the loudest colour). */
export const CREATURE_BODY: Record<string, number> = {
  barker: 0xb3a590,
  gull: 0xdfe3ea,
  grinder: 0x7a808e,
  clerk: 0x6a7388,
  runner: 0x6a7388,
  auctioneer: 0x4a3a5c,
};

export function mix(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

type Xf = (lx: number, lw?: number) => number;

/** Eyes: open (pupil looking forward), blinking, hurt "><", shut (down), or angry with a brow. */
function eyeAt(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  face: number,
  mode: 'open' | 'blink' | 'hurt' | 'shut' | 'dead',
  brow: number,
  color: number = INK,
): void {
  if (mode === 'hurt') {
    g.moveTo(cx - r, cy - r * 0.8)
      .lineTo(cx + r * 0.6, cy)
      .lineTo(cx - r, cy + r * 0.8)
      .stroke({ width: Math.max(2, r * 0.45), color: INK, cap: 'round', join: 'round' });
    return;
  }
  if (mode === 'dead') {
    g.moveTo(cx - r, cy - r)
      .lineTo(cx + r, cy + r)
      .moveTo(cx + r, cy - r)
      .lineTo(cx - r, cy + r)
      .stroke({ width: Math.max(2, r * 0.4), color: INK, cap: 'round' });
    return;
  }
  if (mode === 'shut' || mode === 'blink') {
    g.moveTo(cx - r, cy)
      .lineTo(cx + r, cy)
      .stroke({ width: Math.max(2, r * 0.4), color: INK, cap: 'round' });
    return;
  }
  g.circle(cx, cy, r).fill(0xfdfbf3);
  g.circle(cx + face * r * 0.35, cy + r * 0.1, r * 0.55).fill(color);
  g.circle(cx + face * r * 0.2, cy - r * 0.2, r * 0.18).fill(0xffffff);
  if (brow !== 0) {
    // Angry brow slanting down toward the front.
    g.moveTo(cx - face * r * 1.3, cy - r * 1.35 - brow * r * 0.4)
      .lineTo(cx + face * r * 1.2, cy - r * 0.75 + brow * r * 0.2)
      .stroke({ width: Math.max(2.5, r * 0.5), color: INK, cap: 'round' });
  }
}

function eyeMode(e: Enemy, fx: BodyFx): 'open' | 'blink' | 'hurt' | 'shut' | 'dead' {
  if (fx.ko || fx.deflate > 0.3) return 'dead';
  if (fx.downed) return 'shut';
  if (fx.hurt) return 'hurt';
  if (e.state !== 'TELEGRAPH' && e.state !== 'ACTIVE' && (fx.frame + e.id * 37) % 140 < 6) return 'blink';
  return 'open';
}

/** Walk phase from x (so feet never slide) and whether it's moving. */
function walk(e: Enemy, rate: number): { ph: number; moving: boolean } {
  const moving = Math.abs(e.vx) > 0.3 || e.state === 'CHASE' || e.state === 'FLEE';
  return { ph: e.x * rate, moving };
}

export function drawCreature(g: Graphics, e: Enemy, x: number, y: number, X: Xf, fx: BodyFx): BodyPoints {
  switch (e.type) {
    case 'grinder':
      return grinder(g, e, x, y, X, fx);
    case 'gull':
      return gull(g, e, y, X, fx);
    case 'clerk':
    case 'runner':
      return clerk(g, e, y, X, fx);
    case 'auctioneer':
      return auctioneer(g, e, y, X, fx);
    default:
      return barker(g, e, y, X, fx);
  }
}

// ---------------------------------------------------------------------------------------------
function barker(g: Graphics, e: Enemy, y: number, X: Xf, fx: BodyFx): BodyPoints {
  const f = fx.frame;
  const face = e.facing;
  const body = fx.body;
  const dark = mix(body, INK, 0.55);
  const tele = e.state === 'TELEGRAPH';
  const lunge = e.state === 'ACTIVE' && e.attackId === 'lunge';
  const k = fx.k;
  const { ph, moving } = walk(e, 0.18);
  const breath = Math.sin(f * 0.1 + e.id) * (fx.downed ? 0.5 : 1.2);
  // Legs (back pair darker): a trotting cycle, braced wide in a wind-up.
  const legY = y + 38;
  const legs: [number, number, number][] = [
    [10, ph, 1],
    [22, ph + Math.PI, 0],
    [44, ph + Math.PI, 1],
    [56, ph, 0],
  ];
  for (const [lx, p, near] of legs) {
    const sw = moving && !tele ? Math.sin(p) * 5 : tele ? (lx < 30 ? -3 : 4) * k : 0;
    const lift = moving && !tele ? Math.max(0, Math.cos(p)) * 3 : 0;
    g.roundRect(X(lx + sw, 9), legY - lift, 9, 12, 3).fill(near ? body : dark);
    g.roundRect(X(lx + sw - 1, 11), legY + 8 - lift, 11, 4, 2).fill(INK);
  }
  // Tail stub: wags idle, stiff and high in a wind-up.
  const wag = tele || lunge ? -1 : Math.sin(f * 0.5 + e.id);
  const tx = X(4);
  g.moveTo(tx, y + 20)
    .lineTo(X(-6 - (tele ? 2 : 0)), y + 10 - (tele ? 10 * k : 0) + wag * 3)
    .stroke({ width: 6, color: body, cap: 'round' });
  // Barrel body (chest heaves).
  g.ellipse(X(30), y + 26 - breath * 0.5, 29, 15 + breath * 0.6).fill(body);
  g.ellipse(X(30), y + 33, 20, 7).fill({ color: mix(body, 0xffffff, 0.25), alpha: 0.6 });
  // Head: a big jowly block at the front; drops lower and forward in a wind-up.
  const hx = 40 + (lunge ? 6 : 3 * k);
  const hy = y + 2 + (tele ? 7 * k : 0) + (lunge ? 4 : 0);
  g.roundRect(X(hx, 32), hy + 4, 32, 30, 11).fill(body);
  // Jowls.
  g.ellipse(X(hx + 24), hy + 28, 10, 8).fill(mix(body, INK, 0.12));
  // Ear (back of head).
  g.poly([X(hx + 2), hy + 8, X(hx - 6), hy + 20, X(hx + 8), hy + 16]).fill(dark);
  // Collar in its voice colour, with the deed tag.
  g.roundRect(X(hx - 2, 10), hy + 18, 10, 18, 3).fill(PALETTE.pink);
  g.circle(X(hx + 2), hy + 38, 4).fill(PALETTE.gold);
  // Mouth: opens through the wind-up (teeth show), wide in the lunge.
  const open = lunge ? 1 : tele ? k * 0.8 : 0;
  const mx = X(hx + 22);
  const my = hy + 26;
  if (open > 0.05) {
    const mh = 4 + open * 14;
    g.poly([X(hx + 14), my - 2, X(hx + 34), my - 4 - mh * 0.3, X(hx + 34), my + mh, X(hx + 14), my + 3]).fill(
      INK,
    );
    g.poly([X(hx + 18), my - 2, X(hx + 21), my + 4, X(hx + 24), my - 3]).fill(TEETH);
    g.poly([X(hx + 26), my - 3, X(hx + 29), my + 3, X(hx + 32), my - 4]).fill(TEETH);
    g.ellipse(X(hx + 26), my + mh - 3, 5, 3).fill(TONGUE);
  } else if (fx.hurt || fx.downed || fx.ko) {
    g.ellipse(X(hx + 26), my + 5, 5, 4).fill(TONGUE);
    g.moveTo(X(hx + 16), my + 2)
      .lineTo(X(hx + 33), my + 2)
      .stroke({ width: 3, color: INK });
  } else {
    // A grumpy underbite.
    g.moveTo(X(hx + 16), my + 3)
      .lineTo(X(hx + 33), my + 1)
      .stroke({ width: 3, color: INK, cap: 'round' });
    g.poly([X(hx + 29), my + 1, X(hx + 31), my - 4, X(hx + 33), my + 1]).fill(TEETH);
  }
  // Nose.
  g.roundRect(X(hx + 28, 7), hy + 12, 7, 6, 2).fill(INK);
  // Eye with a scowling brow.
  const ex = X(hx + 20);
  const ey = hy + 14;
  eyeAt(g, ex, ey, 4.5, face, eyeMode(e, fx), tele || lunge ? 1 : 0.5);
  // Bowler hat: lifts off the head as it winds up, pops off when hit.
  const pop = fx.hurt ? 10 : 0;
  const lift = (tele ? 8 * k : 0) + pop + (lunge ? 4 : 0);
  const tilt = fx.hurt ? -face * 5 : 0;
  const hatX = X(hx + 8, 22);
  g.roundRect(hatX - 3 + tilt, hy + 3 - lift, 28, 4, 2).fill(INK);
  g.roundRect(hatX + tilt, hy - 10 - lift, 22, 14, 9).fill(INK);
  g.rect(hatX + tilt, hy - 1 - lift, 22, 3).fill(PALETTE.pink);
  return { mouth: [mx, my], eye: [ex, ey] };
}

// ---------------------------------------------------------------------------------------------
function gull(g: Graphics, e: Enemy, y: number, X: Xf, fx: BodyFx): BodyPoints {
  const f = fx.frame;
  const face = e.facing;
  const body = fx.body;
  const tele = e.state === 'TELEGRAPH';
  const diving = e.state === 'ACTIVE';
  const stuck = e.state === 'RECOVERY' && e.stateFrame < 40 && e.attackId === 'dive';
  const k = fx.k;
  const cy = y + 22;
  const wingDark = 0x4a5064;
  // Ticker-tape tail streamers, fluttering.
  for (let i = 0; i < 3; i++) {
    const wv = Math.sin(f * 0.35 + i * 2) * 5;
    g.moveTo(X(8), cy + 1 + i * 4)
      .lineTo(X(-8), cy + 3 + i * 6 + wv)
      .lineTo(X(-22), cy + 1 + i * 9 - wv)
      .stroke({ width: 3, color: PALETTE.stampPaper, alpha: 0.85 });
    // Price marks on the tape.
    g.rect(X(-14, 3), cy + 2 + i * 7 + wv * 0.4, 3, 2).fill({ color: PALETTE.violet, alpha: 0.9 });
  }
  // Wings: big flaps; raised high and quivering in the wind-up; folded in the dive.
  const flap = tele || diving || fx.downed || stuck ? 0 : Math.sin(f * 0.42 + e.id) * 16;
  const raise = tele ? 26 * k + Math.sin(f * 1.4) * 3 * k : 0;
  const tip: [number, number] = diving ? [X(-2), cy - 4] : [X(4), cy - 26 - flap - raise];
  g.poly([X(16), cy - 2, tip[0], tip[1], X(24), cy - 18 - flap * 0.5 - raise * 0.6, X(38), cy - 2]).fill(
    mix(body, 0x9aa3b5, 0.5),
  );
  g.poly([tip[0], tip[1], X(12), cy - 18 - flap * 0.8 - raise * 0.8, X(16), cy - 12 - flap * 0.6]).fill(
    wingDark,
  );
  // Body: plump, leaning back in the wind-up (anticipation), stretched in the dive.
  const lean = tele ? -4 * k : diving ? 4 : 0;
  g.ellipse(X(28 + lean), cy, diving ? 26 : 22, diving ? 10 : 13).fill(body);
  g.ellipse(X(30 + lean), cy + 5, 14, 6).fill({ color: 0xffffff, alpha: 0.55 });
  const hx = X(46 + lean);
  const hy = cy - 7 - (tele ? 3 * k : 0);
  g.circle(hx, hy, 11).fill(body);
  // Beak: opens in the wind-up (a screech), stuck shut in the floor.
  const bo = tele ? k * 6 : 0;
  g.poly([X(54 + lean), hy - 4, X(70 + lean), hy - 1 - bo * 0.3, X(54 + lean), hy + 1]).fill(PALETTE.beak);
  g.poly([X(54 + lean), hy + 2, X(66 + lean), hy + 3 + bo, X(54 + lean), hy + 5]).fill(
    mix(PALETTE.beak, INK, 0.2),
  );
  // Monocle eye.
  const ex = X(48 + lean);
  const ey = hy - 2;
  eyeAt(g, ex, ey, 3.8, face, eyeMode(e, fx), tele ? 1 : 0);
  if (!fx.hurt && !fx.downed) {
    g.circle(ex, ey, 6.5).stroke({ width: 1.5, color: PALETTE.gold });
    g.moveTo(ex, ey + 6)
      .lineTo(ex - face * 2, cy + 8)
      .stroke({ width: 1, color: PALETTE.gold, alpha: 0.8 });
  }
  // Feet: dangling, tucked in the dive.
  if (!diving) {
    g.moveTo(X(24), cy + 11)
      .lineTo(X(22), cy + 20)
      .stroke({ width: 3, color: PALETTE.beak });
    g.moveTo(X(32), cy + 11)
      .lineTo(X(32), cy + 20)
      .stroke({ width: 3, color: PALETTE.beak });
  }
  return { mouth: [X(64 + lean), hy], eye: [ex, ey] };
}

// ---------------------------------------------------------------------------------------------
function grinder(g: Graphics, e: Enemy, x: number, y: number, X: Xf, fx: BodyFx): BodyPoints {
  const f = fx.frame;
  const W = e.w;
  const H = e.h;
  const face = e.facing;
  const body = fx.body;
  const k = fx.k;
  const tele = e.state === 'TELEGRAPH';
  const active = e.state === 'ACTIVE';
  const charging = (tele || active) && e.attackId === 'charge';
  const whetting = (tele || active) && e.attackId === 'sparks';
  const rev = charging ? (active ? 1 : k) : 0;
  const shake = charging && tele ? Math.sin(f * 2.3) * 2 * k : 0;
  const idle = Math.sin(f * 0.12 + e.id) * 1.5;
  const wood = mix(PALETTE.wood, body, 0.25);
  // Back wheel (small) and the big front wheel, both spinning with its travel.
  const spin = (e.x * 0.05 + (charging ? f * 0.6 * rev : 0)) * face;
  const wheel = (cx: number, cy: number, r: number) => {
    g.circle(cx, cy, r).fill(INK);
    g.circle(cx, cy, r - 4).stroke({ width: 3, color: mix(wood, 0xffffff, 0.15) });
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI) / 3;
      g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    }
    g.stroke({ width: 3, color: mix(wood, 0xffffff, 0.15) });
    g.circle(cx, cy, 4).fill(PALETTE.gold);
  };
  wheel(X(22), y + H - 16, 16);
  // Cart body: a squat furnace-box on the chassis; leans forward as it revs.
  const lean = charging ? 4 * rev : 0;
  const top = y + 20 + shake + idle * 0.5;
  g.roundRect(x + 6 + lean * face, top, W - 12, H - 44, 14).fill(body);
  g.roundRect(x + 6 + lean * face, top + H - 58, W - 12, 12, 4).fill(wood);
  // Rivets.
  for (let i = 0; i < 4; i++) g.circle(X(18 + i * 22), top + 8, 2.5).fill(mix(body, INK, 0.4));
  // Exhaust stack at the back (puffs are world-space particles).
  g.rect(X(8, 12), y - 6 + shake, 12, 30).fill(INK);
  g.rect(X(6, 16), y - 10 + shake, 16, 6).fill(mix(INK, body, 0.3));
  // Grindstone on top: spins hard when whetting.
  const gs = { x: X(58), y: top - 6 };
  g.circle(gs.x, gs.y, 15).fill(mix(0x9aa3b5, body, 0.3));
  g.circle(gs.x, gs.y, 15).stroke({ width: 2, color: INK });
  const ga = f * (whetting ? 0.9 : 0.05) * face;
  g.moveTo(gs.x + Math.cos(ga) * 13, gs.y + Math.sin(ga) * 13)
    .lineTo(gs.x - Math.cos(ga) * 13, gs.y - Math.sin(ga) * 13)
    .stroke({ width: 3, color: INK });
  if (whetting)
    g.circle(gs.x, gs.y, 17 + Math.sin(f * 1.5) * 2).stroke({
      width: 3,
      color: PALETTE.violet,
      alpha: 0.4 + 0.5 * k,
    });
  // Face: a lamp eye and a furnace-door jaw full of teeth (glows brown as it revs).
  const ex = X(W - 30);
  const ey = top + 22;
  const mode = eyeMode(e, fx);
  g.circle(ex, ey, 12).fill(INK);
  if (mode === 'open') {
    g.circle(ex, ey, 9).fill(mix(0xfff2c0, PALETTE.brown, rev));
    g.circle(ex + face * 3, ey, 4).fill(INK);
    // Heavy brow plate.
    g.poly([
      X(W - 46),
      ey - 10 - 3 * rev,
      X(W - 14),
      ey - 16 + 4 * rev,
      X(W - 14),
      ey - 20,
      X(W - 46),
      ey - 16,
    ]).fill(mix(body, INK, 0.5));
  } else eyeAt(g, ex, ey, 7, face, mode, 0);
  const jawY = top + 40;
  const jawOpen = charging ? 6 + 8 * rev : fx.hurt ? 10 : 3;
  g.roundRect(X(W - 58, 50), jawY, 50, 20 + jawOpen, 6).fill(INK);
  g.rect(X(W - 54, 42), jawY + 4, 42, jawOpen + 8).fill({ color: PALETTE.brown, alpha: 0.35 + 0.6 * rev });
  for (let i = 0; i < 5; i++) {
    const tx = X(W - 56 + i * 10, 8);
    g.poly([tx, jawY, tx + 8, jawY, tx + 4, jawY + 8]).fill(TEETH);
    g.poly([tx, jawY + 20 + jawOpen, tx + 8, jawY + 20 + jawOpen, tx + 4, jawY + 12 + jawOpen]).fill(TEETH);
  }
  // Front wheel over the body.
  wheel(X(W - 30), y + H - 22, 22);
  return { mouth: [X(W - 30), jawY + 10], eye: [ex, ey] };
}

// ---------------------------------------------------------------------------------------------
function clerk(g: Graphics, e: Enemy, y: number, X: Xf, fx: BodyFx): BodyPoints {
  const f = fx.frame;
  const W = e.w;
  const H = e.h;
  const face = e.facing;
  const body = fx.body;
  const runner = e.type === 'runner';
  const k = fx.k;
  const a = e.attackId;
  const tele = e.state === 'TELEGRAPH';
  const active = e.state === 'ACTIVE';
  const hop = e.state === 'HOP';
  const stampUp = (tele || active) && a === 'stamp';
  const tannoyUp = (tele || active) && a === 'tannoy';
  const { ph, moving } = walk(e, runner ? 0.12 : 0.1);
  const fleeing = e.state === 'FLEE';
  const stride = moving ? Math.sin(ph) * (fleeing ? 11 : 7) : 0;
  const bob = moving ? Math.abs(Math.cos(ph)) * -3 : Math.sin(f * 0.09 + e.id) * 1.2;
  // Lean: back as the stamp winds up (anticipation), forward when running.
  const lean = stampUp && tele ? -6 * k : fleeing ? 8 : stampUp && active ? 6 : 0;
  const legH = runner ? 22 : 28;
  const legY = y + H - legH;
  const trouser = mix(body, INK, 0.45);
  // Legs (thin, with spats).
  const leg = (sx: number, sw: number) => {
    g.poly([X(sx), legY, X(sx + 5), legY, X(sx + 4 + sw), y + H - 3, X(sx - 1 + sw), y + H - 3]).fill(
      trouser,
    );
    g.roundRect(X(sx - 3 + sw, 11), y + H - 5, 11, 5, 2).fill(INK);
  };
  if (hop) {
    leg(W / 2 - 9, -4);
    leg(W / 2 + 2, 4);
  } else {
    leg(W / 2 - 9, stride);
    leg(W / 2 + 2, -stride);
  }
  const top = y + (runner ? 24 : 30) + bob;
  // Jacket: narrow, hunched.
  g.roundRect(X(W / 2 - 13 + lean * 0.5, 26), top, 26, legY - top + 4, 7).fill(body);
  // Waistcoat stripe and sleeve garter.
  g.rect(X(W / 2 - 2 + lean * 0.5, 4), top + 4, 4, legY - top - 4).fill(PALETTE.stampPaper);
  // Head: long, with spectacles and a green eyeshade.
  const hx = X(W / 2 + 3 + lean);
  const hy = y + (runner ? 12 : 15) + bob + (stampUp && tele ? 3 * k : 0);
  g.ellipse(hx, hy, runner ? 9 : 10, runner ? 12 : 13).fill(mix(0xe6cfb0, body, 0.25));
  // Nose.
  g.poly([hx + face * 7, hy - 2, hx + face * 14, hy + 4, hx + face * 6, hy + 5]).fill(
    mix(0xe6cfb0, INK, 0.2),
  );
  const ex = hx + face * 4;
  const ey = hy - 1;
  eyeAt(g, ex, ey, 3, face, eyeMode(e, fx), tele ? 1 : 0);
  if (!fx.downed && !fx.ko) g.circle(ex, ey, 5).stroke({ width: 1.5, color: INK });
  g.poly([
    hx - face * 10,
    hy - 8,
    hx + face * 10,
    hy - 8,
    hx + face * 20,
    hy - 3,
    hx - face * 8,
    hy - 3,
  ]).fill(PALETTE.eyeshade);
  // Mouth: puffed for the tannoy, tongue out concentrating on the stamp, gasping when running.
  const mx = hx + face * 7;
  const my = hy + 7;
  if (tannoyUp) g.circle(mx, my, 3 + 2 * k).fill(INK);
  else if (stampUp && tele) {
    g.moveTo(mx - 4, my)
      .lineTo(mx + 3, my)
      .stroke({ width: 2, color: INK });
    g.ellipse(mx + face * 2, my + 2, 2.5, 2).fill(TONGUE);
  } else if (fleeing || fx.hurt) g.ellipse(mx, my, 3, 4).fill(INK);
  else
    g.moveTo(mx - 4, my + 1)
      .lineTo(mx + 3, my - 1)
      .stroke({ width: 2, color: INK });
  if (runner) {
    // The ledger under its arm (violet: it holds your Poundage), and sweat.
    const lx = X(W / 2 - 16 + lean * 0.5, 18);
    g.rect(lx, top + 10, 18, 24).fill(PALETTE.violet);
    g.rect(lx, top + 10, 18, 24).stroke({ width: 2, color: INK });
    g.rect(lx + 3, top + 14, 12, 2).fill(PALETTE.stampPaper);
    if (fleeing)
      for (let i = 0; i < 2; i++) {
        const u = (((f * 0.05 + i * 0.5) % 1) + 1) % 1;
        g.circle(hx - face * (10 + u * 14), hy - 10 + u * 12, 3 * (1 - u) + 1).fill({
          color: 0xbfe4ff,
          alpha: 1 - u,
        });
      }
    return { mouth: [mx, my], eye: [ex, ey] };
  }
  // Stamp arm (back hand): tapping the palm idle; raised high overhead in its wind-up.
  const shX = X(W / 2 - 10 + lean * 0.5);
  const shY = top + 6;
  const tap = Math.max(0, Math.sin(f * 0.18 + e.id)) * 6;
  const hand = stampUp
    ? tele
      ? { x: X(W / 2 - 12 + lean), y: y - 22 - 10 * k }
      : { x: X(W / 2 + 24), y: top + 26 }
    : { x: X(W / 2 + 4), y: top + 22 - tap };
  g.moveTo(shX, shY).lineTo(hand.x, hand.y).stroke({ width: 6, color: body, cap: 'round' });
  const glow = stampUp && tele ? k : 0;
  g.rect(hand.x - 3, hand.y - 12, 6, 12).fill(PALETTE.woodDark);
  g.roundRect(hand.x - 12, hand.y - 1, 24, 9, 2).fill(mix(PALETTE.brown, 0xffffff, 0.35 * glow));
  if (glow > 0)
    g.roundRect(hand.x - 14, hand.y - 3, 28, 13, 3).stroke({ width: 2, color: PALETTE.brown, alpha: glow });
  // Tannoy (front hand): at its mouth in the wind-up.
  const tx = X(W / 2 + 10 + lean * 0.5);
  const ty = top + 8;
  const th = tannoyUp ? { x: hx + face * 12, y: hy + 5 } : { x: X(W / 2 + 14), y: top + 28 };
  g.moveTo(tx, ty).lineTo(th.x, th.y).stroke({ width: 6, color: body, cap: 'round' });
  const bl = tannoyUp ? 22 + 6 * k : 16;
  g.poly([th.x, th.y - 4, th.x + face * bl, th.y - 12, th.x + face * bl, th.y + 12, th.x, th.y + 4]).fill(
    tannoyUp ? mix(PALETTE.white, 0xffffff, k) : PALETTE.white,
  );
  return { mouth: [tannoyUp ? th.x + face * bl : mx, tannoyUp ? th.y : my], eye: [ex, ey] };
}

// ---------------------------------------------------------------------------------------------
function auctioneer(g: Graphics, e: Enemy, y: number, X: Xf, fx: BodyFx): BodyPoints {
  const f = fx.frame;
  const W = e.w;
  const H = e.h;
  const face = e.facing;
  const body = fx.body;
  const b = e.boss;
  const p2 = b?.phase === 2;
  const a = e.attackId;
  const k = fx.k;
  const tele = e.state === 'TELEGRAPH';
  const active = e.state === 'ACTIVE';
  const gavelUp = a === 'gavel' && tele;
  const gavelDown = a === 'gavel' && active;
  const calling = tele && (a === 'cadence' || a === 'sellBag');
  const talking = !fx.downed && !fx.ko && fx.deflate === 0;
  // Showman's bounce on his heels; he rises on his toes while calling a lot.
  const bounce = Math.abs(Math.sin(f * 0.11)) * 3 + (calling ? 6 * k : 0);
  const lean = gavelUp ? -10 * k : gavelDown ? 12 : 0;
  const shirt = 0xf1ece0;
  const skin = mix(0xf0c8a0, PALETTE.furious, p2 ? 0.35 : 0);
  const top = y + 40 - bounce;
  // Tails of the coat behind (phase 1).
  if (!p2)
    g.poly([X(10), top + 60, X(40), top + 60, X(26), y + H - 30, X(4), y + H - 40]).fill(mix(body, INK, 0.3));
  // Torso.
  const tx = W / 2 - 30 + lean * 0.4;
  g.roundRect(X(tx, 60), top + 20, 60, 92, 18).fill(p2 ? shirt : body);
  // Shirt front, waistcoat, bow tie.
  g.poly([X(tx + 20), top + 24, X(tx + 40), top + 24, X(tx + 36), top + 90, X(tx + 24), top + 90]).fill(
    shirt,
  );
  if (p2) {
    g.roundRect(X(tx + 8, 44), top + 38, 44, 60, 10).fill(PALETTE.furious);
    // Rolled sleeves: braces.
    g.moveTo(X(tx + 14), top + 22)
      .lineTo(X(tx + 18), top + 100)
      .stroke({ width: 4, color: INK });
    g.moveTo(X(tx + 46), top + 22)
      .lineTo(X(tx + 42), top + 100)
      .stroke({ width: 4, color: INK });
  } else for (let i = 0; i < 3; i++) g.circle(X(tx + 30), top + 44 + i * 14, 3).fill(PALETTE.gold);
  g.poly([X(tx + 22), top + 20, X(tx + 30), top + 26, X(tx + 22), top + 32]).fill(PALETTE.furious);
  g.poly([X(tx + 38), top + 20, X(tx + 30), top + 26, X(tx + 38), top + 32]).fill(PALETTE.furious);
  // Head.
  const hx = X(W / 2 + 6 + lean);
  const hy = top - 2;
  g.circle(hx, hy, 25).fill(skin);
  // Cheek flush when he gets going.
  g.circle(hx + face * 12, hy + 8, 7).fill({ color: PALETTE.furious, alpha: p2 ? 0.5 : 0.25 });
  const ex = hx + face * 10;
  const ey = hy - 4;
  const mode = eyeMode(e, fx);
  eyeAt(g, ex, ey, 5, face, mode, gavelUp || calling ? 1 : 0.3);
  if (mode === 'open') {
    g.circle(ex, ey, 8).stroke({ width: 2, color: PALETTE.gold });
    g.moveTo(ex, ey + 8)
      .lineTo(ex - face * 6, hy + 30)
      .stroke({ width: 1.2, color: PALETTE.gold });
  }
  // Mouth: yapping (the patter never stops), wide on a call, and a handlebar moustache over it.
  const mx = hx + face * 16;
  const my = hy + 14;
  const yap = talking ? Math.abs(Math.sin(f * (a === 'patter' && tele ? 0.9 : 0.45))) : 0;
  const mo = calling ? 5 + 7 * k : 2 + yap * 5;
  g.ellipse(mx, my + 2, 6, mo).fill(INK);
  g.poly([
    hx + face * 2,
    hy + 8,
    hx + face * 30,
    hy + 5 - yap * 2,
    hx + face * 36,
    hy - 2,
    hx + face * 26,
    hy + 11,
    hx + face * 8,
    hy + 12,
  ]).fill(0x3a2a20);
  g.poly([
    hx + face * 6,
    hy + 10,
    hx - face * 12,
    hy + 4,
    hx - face * 16,
    hy - 3,
    hx - face * 6,
    hy + 12,
  ]).fill(0x3a2a20);
  // Sweat in phase 2.
  if (p2)
    for (let i = 0; i < 2; i++) {
      const u = (((f * 0.04 + i * 0.5) % 1) + 1) % 1;
      g.circle(hx - face * (14 - i * 6), hy - 12 + u * 30, 3.5 * (1 - u) + 1).fill({
        color: 0xbfe4ff,
        alpha: 1 - u,
      });
    }
  // Top hat (askew and steaming in phase 2).
  const tilt = p2 ? 9 : 0;
  const hatBase = hy - 18;
  g.poly([
    hx - 20,
    hatBase - tilt,
    hx + 22,
    hatBase + tilt,
    hx + 18,
    hatBase - 44 + tilt,
    hx - 16,
    hatBase - 44 - tilt,
  ]).fill(INK);
  g.poly([
    hx - 32,
    hatBase + 2 - tilt,
    hx + 34,
    hatBase + 2 + tilt,
    hx + 34,
    hatBase + 8 + tilt,
    hx - 32,
    hatBase + 8 - tilt,
  ]).fill(INK);
  g.poly([
    hx - 19,
    hatBase - 10 - tilt,
    hx + 21,
    hatBase - 10 + tilt,
    hx + 20,
    hatBase - 4 + tilt,
    hx - 18,
    hatBase - 4 - tilt,
  ]).fill(p2 ? PALETTE.furious : PALETTE.gold);
  if (p2)
    for (let i = 0; i < 3; i++) {
      const u = (((f * 0.03 + i / 3) % 1) + 1) % 1;
      g.circle(hx + (i - 1) * 12, hatBase - 50 - u * 34, 5 + u * 8).fill({
        color: PALETTE.white,
        alpha: 0.4 * (1 - u),
      });
    }
  // Back arm: gestures with the patter (palm up), points up while calling.
  const bs = { x: X(tx + 6), y: top + 30 };
  const wave = Math.sin(f * 0.2) * 12;
  const bh = calling ? { x: X(tx - 8), y: top - 40 - 10 * k } : { x: X(tx - 24), y: top + 40 + wave };
  g.moveTo(bs.x, bs.y)
    .lineTo(bh.x, bh.y)
    .stroke({ width: 11, color: p2 ? shirt : body, cap: 'round' });
  g.circle(bh.x, bh.y, 7).fill(0xfdfbf3);
  // PODIUM: the showman's lectern in front of his legs, with a brass LOT plate.
  const podTop = y + H - 78;
  g.poly([X(W / 2 - 50), podTop, X(W / 2 + 54), podTop, X(W / 2 + 46), y + H, X(W / 2 - 42), y + H]).fill(
    PALETTE.wood,
  );
  g.rect(X(W / 2 - 56, 116), podTop - 8, 116, 12).fill(PALETTE.woodDark);
  g.poly([
    X(W / 2 - 42),
    podTop + 14,
    X(W / 2 + 46),
    podTop + 14,
    X(W / 2 + 40),
    y + H - 8,
    X(W / 2 - 36),
    y + H - 8,
  ]).stroke({
    width: 3,
    color: PALETTE.woodDark,
  });
  g.roundRect(X(W / 2 - 16, 34), podTop + 26, 34, 18, 3).fill(PALETTE.gold);
  g.rect(X(W / 2 - 10, 22), podTop + 33, 22, 4).fill(PALETTE.woodDark);
  // Gavel arm (front): raised high with the whole body leaning back, then slammed on the podium.
  const sh = { x: X(tx + 52), y: top + 30 };
  let hand = { x: X(W - 4), y: podTop - 14 };
  let head = 0;
  if (gavelUp) {
    hand = { x: X(W - 30 + lean), y: y - 30 - 26 * k };
    head = -Math.PI / 2;
  } else if (gavelDown) {
    hand = { x: X(W + 20), y: podTop - 4 };
    head = Math.PI / 2;
  } else if (calling) {
    hand = { x: X(W + 6), y: top + 4 };
    head = -Math.PI / 4;
  }
  g.moveTo(sh.x, sh.y)
    .lineTo(hand.x, hand.y)
    .stroke({ width: 12, color: p2 ? shirt : body, cap: 'round' });
  g.circle(hand.x, hand.y, 7).fill(0xfdfbf3);
  if (!b?.noGavel) {
    const ang = head + (face > 0 ? 0 : Math.PI);
    const hl = 40;
    const off = face > 0 ? 0.6 : -0.6;
    const gx = hand.x + Math.cos(ang - off) * hl;
    const gy = hand.y + Math.sin(ang - off) * hl;
    g.moveTo(hand.x, hand.y).lineTo(gx, gy).stroke({ width: 6, color: PALETTE.woodDark });
    const hot = gavelUp ? k : 0;
    const pts = rot(gx, gy, 20, 40, ang + Math.PI / 2 - off);
    g.poly(pts).fill(mix(PALETTE.wood, 0xffe0a8, 0.6 * hot));
    g.poly(pts).stroke({ width: 3, color: PALETTE.gold, alpha: 0.9 });
  }
  return { mouth: [mx, my], eye: [ex, ey] };
}

function rot(cx: number, cy: number, w: number, h: number, a: number): number[] {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const out: number[] = [];
  for (const [px, py] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ] as const)
    out.push(cx + px * ca - py * sa, cy + px * sa + py * ca);
  return out;
}
