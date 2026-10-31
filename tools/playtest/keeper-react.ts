/**
 * The Keeper played by a crude reactive controller (the Canopy r14; review r13's "controller runs"), not the den's plan:
 * it knows only what the burrbacks teach (jump a ram, cut what is open or eating, keep some distance, catch a moth that
 * falls near, cut the fallen cage when the Keeper is far) and decides from a state `--lag` frames old. It does not know
 * P2's lit rule or the slam's wave: what it cannot read from a pose it treats as "keep away". It does step out of the
 * sweep's arc (render draws it on the floor through the tell: `boss.tellX0..X1`).
 * `--jump=start` jumps a ram as it starts to charge; `--jump=tell` jumps in its brace. `--learn`: it jumps on the
 * charge until it has seen the P1 beat (`keeperRage`), then in the tell (the lesson the beat is there to teach).
 *   npx tsx tools/playtest/keeper-react.ts [--lag=15] [--jump=start|tell] [--learn] [--minutes=5] [--seed=1]
 */
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { GameState } from '../../src/sim/state';
import { newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

export interface ReactRun {
  won: boolean;
  seconds: number;
  phaseAt: Record<number, number>;
  hurts: number;
  fades: number;
  hurtBy: Record<string, number>;
  rage: number;
}

export function runReact(
  o: {
    lag?: number;
    jump?: 'start' | 'tell';
    learn?: boolean;
    frames?: number;
    trace?: boolean;
    /** r15: it reads the slam's wave (`keeperWave`, render's crack): hops a front it sees coming, `lag` frames late. */
    wave?: boolean;
  } = {},
): ReactRun {
  const t = cloneTuning(defaultTuning);
  const room = getRoom('cn-den');
  const save = newSave(['wallJump', 'glide'] as never);
  save.patch = { room: 'cn-den', id: 'p-den' };
  save.visited.push('cn-den');
  save.flags.push('cn-firefly-den');
  const g = new Game(t, room, 1, () => 0, null, { world: getWorld('canopy'), save });
  g.mode = 'manual';
  let ev: readonly SimEvent[] = [];
  g.afterStep.add((e) => {
    ev = e;
  });
  const { right: R, left: L, jump: J, attack: A, up: U } = ActionBit;
  const lag = o.lag ?? 15;
  const seen: GameState[] = [];
  const phaseAt: Record<number, number> = {};
  const hurtBy: Record<string, number> = {};
  let hurts = 0;
  let fades = 0;
  let lockAt = -1;
  let rage = -1;
  let f = 0;
  let prev = 0;
  let jumpUntil = -1;
  const max = o.frames ?? 5 * 3600;
  while (f < max) {
    const now = g.state;
    const b0 = now.boss;
    if (!b0 || b0.stage === 'end' || b0.stage === 'down') break;
    seen.push(cloneState(now));
    while (seen.length > lag + 1) seen.shift();
    const s = seen[0] as GameState;
    const b = s.boss;
    const p = now.player;
    const px = p.x + p.w / 2;
    const e = s.enemies.find((q) => q.id === 'old-burr');
    let m = 0;
    if (p.y + p.h < 1100 && now.boss?.stage === 'wait') m = R;
    else if (e && b) {
      const ex = e.x + e.w / 2;
      const d = Math.sign(ex - px) || 1;
      const dist = Math.abs(ex - px);
      const toward = d > 0 ? R : L;
      const away = d > 0 ? L : R;
      const mode = e.mode as string;
      const tellJump = o.learn ? rage >= 0 : o.jump === 'tell';
      const coming = Math.sign(e.vx) === -d;
      const arc = b.tell === 'sweep' || b.sweepHit > 0;
      // (r15: the wave's fronts where it saw them, run on `lag` frames: one about to reach her is hopped.)
      const W = t.oldBurrback.slamWaveSpeed;
      const run = e.wave > 0 ? e.wave + W * lag : e.waveWait > 0 ? Math.max(0, lag - e.waveWait) * W : -1;
      const toFront = Math.abs(px - e.waveX) - run;
      if (o.wave && run >= 0 && p.grounded && toFront > -W && toFront < W * 5) m = prev & J ? 0 : J;
      else if (arc && px > b.tellX0 - 40 && px < b.tellX1 + 40) {
        // (The sweep's lit arc on the floor, as render draws it: out of it, the nearer way.)
        m = px < (b.tellX0 + b.tellX1) / 2 ? L : R;
      } else if (mode === 'windup' && tellJump && dist < 700) m = prev & J ? 0 : J;
      else if (mode === 'charge' && (coming || dist < 300)) m = dist < 330 ? (prev & J ? 0 : J) : 0;
      else if (mode === 'windup') m = dist < 250 ? away : 0;
      else if ((mode === 'eat' || e.stunned) && e.mode !== 'dead') {
        // Open (or eating): in and cut.
        if (dist > 120) m = toward;
        else if (p.facing !== d) m = toward;
        else m = prev & A ? 0 : A;
      } else if (b.phase <= 2 && b.moth === 2 && Math.abs(b.mothX - px) < 260) {
        // A moth falling near: under it, a jump.
        const dx = b.mothX - px;
        m = Math.abs(dx) > 16 ? (dx < 0 ? L : R) : 0;
        if (p.grounded && b.mothY < p.y && b.mothY > p.y - 260 && !(prev & J)) m |= J;
      } else if (
        b.phase === 3 &&
        (now.lures.live?.free[(room.lures ?? []).findIndex((l) => l.id === 'trap-den')] ?? 0) === 1 &&
        Math.abs(ex - b.cageX) > 700
      ) {
        // The cage free, the Keeper far: cut it.
        const dx = b.cageX - px;
        m = Math.abs(dx) > 60 ? (dx < 0 ? L : R) : prev & A ? 0 : A | U;
      } else {
        // Anything else (walking, feeding, rearing, a pose it does not know): a ram's length off, facing it.
        m = dist < 300 ? away : dist > 420 ? toward : 0;
      }
    }
    if (m & J && p.grounded && f >= jumpUntil) jumpUntil = f + 20;
    if (f < jumpUntil) m |= J;
    prev = m;
    g.queueInput([m]);
    g.stepOnce();
    f++;
    for (const q of ev) {
      if (q.type === 'hurt') {
        hurts++;
        const bb = g.state.boss;
        const k = g.state.enemies.find((z) => z.id === 'old-burr');
        const why = bb && bb.sweepHit > 0 ? 'claws' : k?.waveHit ? 'wave' : (k?.mode ?? '?');
        const key = `P${bb?.phase ?? 0}:${why}`;
        hurtBy[key] = (hurtBy[key] ?? 0) + 1;
      }
      if (q.type === 'fade') fades++;
      if (
        o.trace &&
        (q.type === 'hurt' || q.type === 'enemyWindup' || q.type === 'enemyCharge' || q.type === 'keeperRage')
      ) {
        const k = g.state.enemies.find((z) => z.id === 'old-burr');
        console.log(
          f,
          q.type,
          JSON.stringify(q).slice(0, 140),
          'her',
          Math.round(g.state.player.x),
          g.state.player.grounded,
          'it',
          k ? Math.round(k.x + k.w / 2) : '-',
          k?.mode,
        );
      }
      if (q.type === 'bossLock' && lockAt < 0) lockAt = f;
      if (q.type === 'bossPhase') phaseAt[q.phase] = Math.max(phaseAt[q.phase] ?? 0, f);
      if (q.type === 'keeperRage' && q.phase === 'slam' && rage < 0) rage = f;
    }
  }
  const won = g.state.boss?.stage === 'end' || g.state.boss?.stage === 'down';
  return { won, seconds: (f - Math.max(0, lockAt)) / 60, phaseAt, hurts, fades, hurtBy, rage };
}

if (process.argv[1]?.endsWith('keeper-react.ts')) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1];
  const r = runReact({
    lag: Number(arg('lag') ?? 15),
    jump: (arg('jump') ?? 'tell') as 'start' | 'tell',
    learn: process.argv.includes('--learn'),
    frames: Number(arg('minutes') ?? 5) * 3600,
    trace: process.argv.includes('--trace'),
    wave: process.argv.includes('--wave'),
  });
  const ph = Object.entries(r.phaseAt)
    .map(([n, at]) => `P${n} at ${(at / 60).toFixed(1)} s`)
    .join(', ');
  console.log(
    `${r.won ? 'WON' : 'not down'} after ${r.seconds.toFixed(1)} s (${ph}); hits ${r.hurts}, fades ${r.fades}; hurt by ${JSON.stringify(r.hurtBy)}; rage beat at ${r.rage >= 0 ? (r.rage / 60).toFixed(1) : '-'} s`,
  );
}
