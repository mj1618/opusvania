/**
 * The Keeper (the Canopy's boss, docs/design/levels/canopy-moments.md moment 6; memory/canopy.md "The Keeper"): the
 * old burrback of the den is not guarding the great cage, it is eating from it. Its creature is the den's
 * `oldBurrback` (its brace, ram, slam and taproot rules in src/sim/enemies/burrback.ts, `keep` = 1: this module
 * drives its phases); its `heart` is the great cage (a trap `wick`, 120 moths).
 *
 *  - **The intro** (before the lock, on her first landing on the balcony): as the firefly leaves, one exhausted moth
 *    drops out of the cage's orbit and the sleeping shape heaves up and takes it (`enemyFeed`).
 *  - **P1, under the light** (to `p2Hp`): its rams as ever; every ~8 s a moth falls from the cage (`cageDrop`). It
 *    breaks off and goes for it (`feed`). She can catch it first (`mothSaved`: it clings to her), or let it eat
 *    (`mothEaten`) and cut it while it stands head down (`eat`, open for `eatOpenHits`).
 *  - **P2, the swinging light** (to `p3Hp`): the big slam tears the cage's east root and it swings (`cageSwing`). It
 *    sees her only in the cage's light (`keeperSight`); blind, it goes for where it saw her last, and a cut from
 *    behind it lands. Moths still fall, thrown wider.
 *  - **P3, the fallen cage**: it rips the cage down (`cageFall`: the den's lamp out, the cage on the floor, its guard
 *    off). The moths circle low; between rams it sweeps the cloud (`keeperEat` sweep, then `mothEaten` 3), open
 *    while it does. Each of `cageCuts` cuts on the cage frees a third of what is in it (`cageRelease`).
 *  - **The end**: its death (the old burrback's long hold and roll) saves `cn-den-down`; the cage is cuttable once
 *    more and frees every moth saved (`lureSnuff.moths` = saved + left). The release sets `cn-den-freed` (the roof's
 *    gate); then the roof gives (`denCollapse` groan / dust / rubble / settle: the fallback, no hazards; `collapse`
 *    flag: the rubble's gates shut into a slope up to the roof).
 *  - **A fade** restarts the fight with the cage full and hung (`resetBoss` -> `init`).
 *
 * Pure: plain data, + - * / floor round min max abs.
 */
import { keeperPhase } from '../enemies/burrback';
import { frames, type StepInfo, setMode } from '../enemies/common';
import { fireflyFrames } from '../firefly';
import { lureHpMax } from '../lures';
import { cycleSine } from '../paths';
import type { EnemyState } from '../state';
import { type BossCtx, type BossRules, defeat, enemyIndex, finish, lureIndex, setPhase, shift } from './core';

function creature(c: BossCtx): EnemyState | undefined {
  return c.state.enemies[enemyIndex(c.scene, c.spec.creature)];
}

/** A creature step's context for the creature's own rules (the phase changes). */
function stepInfo(c: BossCtx): StepInfo {
  return { state: c.state, scene: c.scene, t: c.t, events: c.events, stir: '', first: c.events.length };
}

/** The cage's lure index and its scene point. */
function cage(c: BossCtx): { i: number; x: number; y: number; moths: number } {
  const i = lureIndex(c.scene, c.spec.heart);
  const l = c.scene.lures?.[i];
  return { i, x: l?.x ?? 0, y: l?.y ?? 0, moths: Math.max(0, Math.round(l?.moths ?? 0)) };
}

/** Moves the cage's flame to (x, y) (the boss's `live` offsets: every lure rule reads them). */
function putCage(c: BossCtx, x: number, y: number): void {
  const g = cage(c);
  const live = c.state.lures.live;
  c.boss.cageX = Math.round(x);
  c.boss.cageY = Math.round(y);
  if (!live || g.i < 0) return;
  live.dx[g.i] = c.boss.cageX - g.x;
  live.dy[g.i] = c.boss.cageY - g.y;
}

/** The den's floor, the arena's x span (a moth lands inside it). */
function floorY(c: BossCtx): number {
  return c.spec.floor ?? c.spec.arena.y + c.spec.arena.h;
}
function clampX(c: BossCtx, x: number): number {
  const a = c.spec.arena;
  return Math.max(a.x + 80, Math.min(a.x + a.w - 80, Math.round(x)));
}

/** A creature free to go for food: walking, standing, flinching (not braced, ramming, open, hurt, curled). */
function idle(e: EnemyState): boolean {
  return (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert') && !e.stunned && e.knockVx === 0;
}

/** Its mouth: the front of its box at its feet's height less half its height. */
function mouth(e: EnemyState): { x: number; y: number } {
  return { x: e.x + e.w / 2 + (e.facing * e.w) / 2, y: e.y + e.h / 2 };
}

/** A moth leaves the cage's orbit: the tell, then it falls to (`landX`, the floor). */
function startDrop(c: BossCtx, landX: number): void {
  const b = c.boss;
  const K = c.t.keeper;
  b.moth = 1;
  b.mothT = 0;
  b.mothX = b.cageX;
  b.mothY = b.cageY;
  b.landX = clampX(c, landX);
  b.landY = floorY(c);
  c.events.push({
    type: 'cageDrop',
    lure: c.spec.heart,
    x: b.cageX,
    y: b.cageY,
    frames: frames(K.dropTell, 1),
    landX: b.landX,
    landY: b.landY,
  });
}

/** The moth's flight one step: the tell at the cage, the spiralling fall, then on the floor. */
function mothStep(c: BossCtx): void {
  const b = c.boss;
  const K = c.t.keeper;
  if (b.moth === 0 || b.moth === 4) return;
  b.mothT++;
  if (b.moth === 1) {
    // (It flutters at the cage, out of the orbit: the cage may be swinging, it goes with it.)
    b.mothX = b.cageX;
    b.mothY = b.cageY + 24;
    if (b.mothT >= frames(K.dropTell, 1)) {
      b.moth = 2;
      b.mothT = 0;
      b.pivotX = b.mothX;
      b.pivotY = b.mothY;
    }
    return;
  }
  if (b.moth === 2) {
    // (It spirals down: its column eases from where it left the cage to `landX`, the sway narrowing as it falls.)
    const foot = b.landY - 8;
    b.mothY = Math.min(foot, Math.round(b.pivotY + K.fallSpeed * b.mothT));
    const k = Math.max(0, Math.min(1, (b.mothY - b.pivotY) / Math.max(1, foot - b.pivotY)));
    const sway = K.fallSway * cycleSine(b.mothT / Math.max(1, K.fallSwayFrames)) * (1 - k);
    b.mothX = Math.round(b.pivotX + (b.landX - b.pivotX) * k + sway);
    if (b.mothY >= foot) {
      b.mothX = b.landX;
      b.moth = 3;
      b.mothT = 0;
    }
  }
}

/** She touches the falling (or fallen) moth: it clings to her. Returns true if she caught it. */
function catches(c: BossCtx): boolean {
  const b = c.boss;
  const p = c.state.player;
  if (b.moth < 2 || b.moth > 3 || p.hp <= 0 || p.faded > 0) return false;
  const r = c.t.keeper.catchPx;
  if (b.mothX < p.x - r || b.mothX > p.x + p.w + r || b.mothY < p.y - r || b.mothY > p.y + p.h + r)
    return false;
  b.saved++;
  b.caught++;
  b.moth = 0;
  c.events.push({ type: 'mothSaved', x: b.mothX, y: b.mothY, saved: b.saved });
  return true;
}

/** It stands head down over its food (`eat`): open, `openHits` cuts. */
function eat(c: BossCtx, e: EnemyState, n: number, sweep: boolean): void {
  const B = c.t.oldBurrback;
  e.feedX = -1;
  e.vx = 0;
  e.rx = 0;
  e.braced = false;
  e.chargeLeft = 0;
  e.tuck = 0;
  setMode(e, 'eat', n);
  e.stunned = true;
  e.taken = 0;
  e.streak = Math.max(1, Math.round(c.t.keeper.eatOpenHits));
  e.strikeCd = n + frames(B.strikeCooldown);
  const m = mouth(e);
  c.events.push({ type: 'keeperEat', id: e.id, x: m.x, y: m.y, frames: n, sweep });
}

/** P1-2: the moths fall, it goes for them, she catches one or it eats. */
function moths(c: BossCtx, e: EnemyState): void {
  const b = c.boss;
  const K = c.t.keeper;
  const fighting = c.boss.stage === 'fight' && b.phase <= 2;
  if (b.moth === 0) {
    if (e.mode === 'feed') setMode(e, 'walk', 0);
    e.feedX = -1;
    if (!fighting || b.left <= 0) return;
    if (--b.nextDrop > 0) return;
    // (P2: thrown on along the swing, wider.)
    const g = cage(c);
    const fling = b.phase === 2 ? (b.cageX - g.x) * K.dropFling : 0;
    b.left--;
    startDrop(c, b.cageX + fling);
    return;
  }
  mothStep(c);
  if (catches(c)) {
    b.nextDrop = frames(b.phase === 2 ? K.dropEveryP2 : K.dropEvery, 1);
    if (e.mode === 'feed') setMode(e, 'walk', 0);
    e.feedX = -1;
    return;
  }
  if (b.moth < 2 || e.mode === 'dead') return;
  // It breaks off and goes for it (once it is free: a ram runs its length).
  if (e.mode !== 'feed' && idle(e)) {
    e.feedX = b.landX;
    e.blind = 0;
    setMode(e, 'feed', 0);
  }
  if (e.mode === 'feed') e.feedX = b.landX;
  const m = mouth(e);
  const near = Math.abs(e.x + e.w / 2 - b.mothX) <= e.w / 2 + K.eatReachPx;
  if (e.mode === 'feed' && near && b.mothY >= e.y - K.eatAbovePx) {
    e.facing = b.mothX < e.x + e.w / 2 ? -1 : 1;
    b.eaten++;
    b.moth = 0;
    b.nextDrop = frames(b.phase === 2 ? K.dropEveryP2 : K.dropEvery, 1);
    c.events.push({ type: 'mothEaten', enemy: e.id, x: m.x, y: m.y, n: 1, left: b.left });
    eat(c, e, frames(K.eatFrames, 1), false);
  }
}

/** The cage's point now: hung (P1), swinging (P2), fallen (P3). */
function cageStep(c: BossCtx): void {
  const b = c.boss;
  const K = c.t.keeper;
  const g = cage(c);
  if (b.phase >= 3 || (b.stage === 'shift' && b.cageY !== g.y && b.swingT < 0)) return;
  if (b.swingT < 0) {
    putCage(c, g.x, g.y);
    return;
  }
  b.swingT++;
  const s = cycleSine(b.swingT / Math.max(1, K.swingPeriod));
  // (It eases into its full reach over the first swing: the root tears, it does not leap.)
  const ease = Math.min(1, b.swingT / Math.max(1, K.swingPeriod));
  const dx = K.swingReach * s * ease;
  const dy = -K.swingLift * s * s * ease;
  putCage(c, g.x + dx, g.y + dy);
}

/** P2: does the cage's light fall on her (a cone from the cage down)? */
function inLight(c: BossCtx): boolean {
  const p = c.state.player;
  const K = c.t.keeper;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const dy = py - c.boss.cageY;
  const half = K.lightBase + Math.max(0, dy) * K.lightSpread;
  if (dy < 0) return Math.abs(px - c.boss.cageX) <= K.lightBase && -dy <= K.lightBase;
  return Math.abs(px - c.boss.cageX) <= half;
}

/** P2: it sees her only in the light; blind it goes for where it saw her last (or where a blow came from). */
function sight(c: BossCtx, e: EnemyState): void {
  const b = c.boss;
  const p = c.state.player;
  const lit = p.hp > 0 && p.faded === 0 && inLight(c) ? 1 : 0;
  const pc = Math.round(p.x + p.w / 2);
  if (lit !== b.lit) {
    b.lit = lit;
    if (!lit) e.seekX = pc;
    const m = mouth(e);
    c.events.push({ type: 'keeperSight', id: e.id, x: m.x, y: m.y, lit: lit === 1 });
  }
  e.blind = lit ? 0 : 1;
  if (lit) e.seekX = -1;
  // (Cut from behind in the dark: it knows where the blow came from.)
  else if (e.hitFrame === c.state.frame) e.seekX = pc;
}

/** P3: it sweeps the low cloud at the fallen cage between rams. */
function sweep(c: BossCtx, e: EnemyState): void {
  const b = c.boss;
  const K = c.t.keeper;
  if (b.moth === 4) {
    b.mothT++;
    // (Cut in its tell: the sweep comes to nothing.)
    if (e.mode !== 'eat') {
      b.moth = 0;
      b.sweepCd = frames(K.sweepEvery, 1);
      return;
    }
    if (b.mothT >= frames(K.sweepTell, 1)) {
      const n = Math.min(b.left, Math.max(0, Math.round(K.sweepEat)));
      b.left -= n;
      b.eaten += n;
      b.moth = 0;
      b.sweepCd = frames(K.sweepEvery, 1);
      const m = mouth(e);
      if (n > 0) c.events.push({ type: 'mothEaten', enemy: e.id, x: m.x, y: m.y, n, left: b.left });
    }
    return;
  }
  if (b.sweepCd > 0) {
    b.sweepCd--;
    return;
  }
  if (b.left <= 0 || e.mode === 'dead') return;
  if (e.mode !== 'feed' && idle(e)) {
    e.feedX = b.cageX;
    setMode(e, 'feed', 0);
  }
  if (e.mode !== 'feed') return;
  e.feedX = b.cageX;
  if (Math.abs(e.x + e.w / 2 - b.cageX) <= K.sweepReachPx) {
    e.facing = b.cageX < e.x + e.w / 2 ? -1 : 1;
    b.moth = 4;
    b.mothT = 0;
    eat(c, e, frames(K.sweepTell + K.sweepOpen, 1), true);
  }
}

/** P3: a cut on the fallen cage frees a third of what is in it (the lure's hp is the cut count's tell). */
function cageCuts(c: BossCtx): void {
  const b = c.boss;
  const K = c.t.keeper;
  const g = cage(c);
  const L = c.state.lures;
  const live = L.live;
  if (!live || g.i < 0 || live.free[g.i] !== 1) return;
  const full = Math.max(1, Math.round(K.cageCuts)) + 1;
  const hp = L.hp[g.i] ?? 0;
  if (hp >= full) return;
  const m = b.left > 0 ? Math.max(1, Math.round(b.left / Math.max(1, K.cutShare))) : 0;
  b.left -= m;
  b.saved += m;
  b.cageCuts++;
  c.events.push({ type: 'cageRelease', lure: c.spec.heart, x: b.cageX, y: b.cageY, moths: m, left: b.left });
  L.hp[g.i] = full;
  L.out[g.i] = 0;
  // (The bars hold again once it has taken its cuts: the last ones are for after.)
  if (b.cageCuts >= Math.round(K.cageCuts)) live.free[g.i] = 0;
}

/** The cage falls (P3): on the floor at `lowered`, its guard off, the low cloud. */
function fall(c: BossCtx): void {
  const b = c.boss;
  const g = cage(c);
  const at = c.spec.lowered ?? { x: g.x, y: floorY(c) - 64 };
  b.swingT = -1;
  b.lit = 1;
  putCage(c, at.x, at.y);
  const live = c.state.lures.live;
  if (live && g.i >= 0) {
    live.free[g.i] = 1;
    c.state.lures.hp[g.i] = Math.max(1, Math.round(c.t.keeper.cageCuts)) + 1;
  }
  c.events.push({ type: 'cageFall', lure: c.spec.heart, x: b.cageX, y: b.cageY });
}

/** Beaten: the cage takes one cut more and frees every moth saved; the boss waits for that release. */
function beaten(c: BossCtx): void {
  const b = c.boss;
  const g = cage(c);
  const live = c.state.lures.live;
  b.moth = 0;
  if (live && g.i >= 0 && (c.state.lures.hp[g.i] ?? 0) > 0) {
    live.free[g.i] = 1;
    live.moths[g.i] = b.saved + b.left;
    c.state.lures.hp[g.i] = 1;
  }
  defeat(c);
}

/** The intro, before the lock: as the firefly leaves, a moth drops and the sleeping shape takes it. */
function intro(c: BossCtx): void {
  const b = c.boss;
  const e = creature(c);
  if (b.intro >= 2 || !e || e.mode !== 'sleep') return;
  const K = c.t.keeper;
  if (b.intro === 0) {
    const fs = c.scene.fireflies ?? [];
    const k = fs.findIndex((f) => c.state.save.flags.includes(f.flag));
    const f = fs[k];
    if (!f) return;
    const ff = c.state.kit.firefly;
    if (ff.pass === k && ff.frame < fireflyFrames(f) - frames(K.introLead)) return;
    b.intro = 1;
    startDrop(c, mouth(e).x);
    return;
  }
  mothStep(c);
  if (b.moth >= 2 && b.mothY >= e.y - K.eatAbovePx && Math.abs(b.mothX - mouth(e).x) <= e.w / 2) {
    b.moth = 0;
    b.intro = 2;
    const m = mouth(e);
    c.events.push({ type: 'enemyFeed', id: e.id, x: m.x, y: m.y });
  }
}

export const keeperRules: BossRules = {
  phases: [
    {
      name: 'under the light',
      exam: 'bait the ram, cut it winded; catch the falling moth, or cut it while it eats',
    },
    {
      name: 'the swinging light',
      exam: 'it sees only in the light: move with the shadow, cut it from behind',
    },
    { name: 'the fallen cage', exam: 'kill it first, or cut the moths free' },
  ],

  cues: (t) => ({
    intro: { fight: t.oldBurrback.wakeFrames },
    p1end: { swing: t.keeper.swingIn, fight: t.oldBurrback.transFrames },
    p2end: { fall: t.keeper.cageFallFrames, fight: t.oldBurrback.transFrames },
    defeat: { still: t.oldBurrback.deadFrames },
    collapse: {
      groan: t.keeper.collapseGroan,
      dust0: t.keeper.collapseDust[0] ?? 150,
      dust1: t.keeper.collapseDust[1] ?? 200,
      dust2: t.keeper.collapseDust[2] ?? 260,
      rubble: t.keeper.collapseRubble,
      settle: t.keeper.collapseSettle,
    },
  }),

  init(c, retry, down) {
    const { state, scene, spec, boss } = c;
    const L = state.lures;
    const g = cage(c);
    boss.left = g.moths;
    boss.intro = retry || down ? 2 : 0;
    putCage(c, g.x, g.y);
    const freed = !!scene.lures?.[g.i]?.sets && state.save.flags.includes(scene.lures?.[g.i]?.sets ?? '');
    if (g.i >= 0 && !freed) {
      const l = scene.lures?.[g.i];
      if (l) L.hp[g.i] = lureHpMax(l, c.t);
      L.out[g.i] = 0;
    }
    const e = creature(c);
    if (e) e.keep = 1;
    // (A retry finds the den's lamp burning again: phase 3 plants it out.)
    const snuffs = scene.enemies?.find((q) => q.id === spec.creature)?.snuffs;
    const si = lureIndex(scene, snuffs);
    const sl = scene.lures?.[si];
    if (sl && si >= 0 && !down) {
      L.hp[si] = lureHpMax(sl, c.t);
      L.out[si] = 0;
    }
    // (Beaten, the cage not yet cut: it lies on the floor, one cut from the release.)
    if (down && !freed) {
      const at = spec.lowered ?? { x: g.x, y: floorY(c) - 64 };
      putCage(c, at.x, at.y);
      if (L.live && g.i >= 0) {
        L.live.free[g.i] = 1;
        L.hp[g.i] = 1;
      }
    }
    if (down && freed) boss.collapse = 1;
    L.snuffed = L.out.filter((o) => o > 0).length;
  },

  wait(c) {
    intro(c);
  },

  update(c) {
    const { boss: b } = c;
    const e = creature(c);
    if (!e) return;
    const K = c.t.keeper;
    if (b.stage === 'intro') {
      // (The intro's moth, if she came down before it was taken, is gone: the fight starts clean.)
      if (b.moth > 0 && b.intro < 2) b.moth = 0;
      b.intro = 2;
      cageStep(c);
      return;
    }
    if (b.stage === 'end') {
      // (The great release: the roof gives. The fallback: groan and dust, the rubble's slope, no hazards.)
      const l = c.scene.lures?.[cage(c).i];
      if (b.collapse < 0 && l?.sets && c.state.save.flags.includes(l.sets)) {
        b.collapse = 0;
        b.cueSet = '';
        startCollapse(c);
      }
      if (b.collapse >= 0) b.collapse++;
      return;
    }
    cageStep(c);
    if (b.stage === 'fight' && e.mode === 'dead') {
      beaten(c);
      return;
    }
    if (b.phase <= 2) moths(c, e);
    if (b.stage !== 'fight') return;
    if (b.phase === 2) sight(c, e);
    if (b.phase === 3) {
      sweep(c, e);
      cageCuts(c);
    }
    const info = stepInfo(c);
    if (b.phase === 1 && e.hp <= Math.round(K.p2Hp)) {
      keeperPhase(e, info, 2);
      shift(c, 'p1end');
    } else if (b.phase === 2 && e.hp <= Math.round(K.p3Hp)) {
      e.blind = 0;
      b.lit = 1;
      keeperPhase(e, info, 3);
      // (It climbs and rips the cage down: curled the whole beat, harmless.)
      e.timer = Math.max(e.timer, frames(c.t.oldBurrback.transFrames, 1));
      shift(c, 'p2end');
    }
  },

  cue(c, set, cue) {
    const { boss: b } = c;
    const K = c.t.keeper;
    if (set === 'intro' && cue === 'fight') {
      setPhase(c, 1);
      b.nextDrop = frames(K.dropFirst, 1);
    } else if (set === 'p1end' && cue === 'swing') {
      b.swingT = 0;
      const g = cage(c);
      c.events.push({
        type: 'cageSwing',
        lure: c.spec.heart,
        x: g.x,
        y: g.y,
        period: frames(K.swingPeriod, 1),
        reach: Math.round(K.swingReach),
      });
    } else if (set === 'p1end' && cue === 'fight') {
      setPhase(c, 2);
      b.nextDrop = frames(K.dropFirst, 1);
    } else if (set === 'p2end' && cue === 'fall') {
      b.moth = 0;
      fall(c);
    } else if (set === 'p2end' && cue === 'fight') {
      setPhase(c, 3);
      b.sweepCd = frames(K.sweepFirst, 1);
    } else if (set === 'collapse') {
      const a = c.spec.arena;
      const roofY = a.y;
      const at =
        cue === 'dust0'
          ? a.x + a.w * 0.25
          : cue === 'dust1'
            ? a.x + a.w * 0.6
            : cue === 'dust2'
              ? a.x + a.w * 0.85
              : a.x + a.w / 2;
      if (cue === 'groan')
        c.events.push({ type: 'denCollapse', phase: 'groan', x: Math.round(at), y: roofY });
      else if (cue.startsWith('dust'))
        c.events.push({ type: 'denCollapse', phase: 'dust', x: Math.round(at), y: roofY });
      else if (cue === 'rubble') {
        const flag = c.spec.collapse;
        if (flag && !c.state.save.flags.includes(flag)) {
          c.state.save.flags.push(flag);
          c.events.push({ type: 'flagSet', flag, by: c.spec.id, x: Math.round(at), y: roofY });
        }
        c.events.push({ type: 'denCollapse', phase: 'rubble', x: Math.round(at), y: roofY });
      } else if (cue === 'settle') {
        c.events.push({ type: 'denCollapse', phase: 'settle', x: Math.round(at), y: roofY });
        finish(c);
      }
    }
  },

  jump(c, n) {
    const e = creature(c);
    const b = c.boss;
    if (e && (e.mode === 'sleep' || e.mode === 'wake')) {
      setMode(e, 'walk', 0);
      e.dozing = false;
    }
    if (n <= 1) {
      setPhase(c, 1);
      b.nextDrop = frames(c.t.keeper.dropFirst, 1);
      return;
    }
    if (!e) return;
    const info = stepInfo(c);
    if (n === 2) {
      e.hp = Math.min(e.hp, Math.round(c.t.keeper.p2Hp));
      keeperPhase(e, info, 2);
      b.swingT = 0;
      setPhase(c, 2);
      b.nextDrop = frames(c.t.keeper.dropFirst, 1);
      return;
    }
    e.hp = Math.min(e.hp, Math.round(c.t.keeper.p3Hp));
    keeperPhase(e, info, 3);
    fall(c);
    setPhase(c, 3);
    b.sweepCd = frames(c.t.keeper.sweepFirst, 1);
  },
};

/** The collapse's cue timeline (its own set: the defeat's has run out by the release). */
function startCollapse(c: BossCtx): void {
  c.boss.cueSet = 'collapse';
  c.boss.cueFrames = -1;
  c.boss.cueNext = 0;
}
