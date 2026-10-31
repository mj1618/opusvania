/**
 * The Keeper's fight played headless by the den's fight controller (tools/playtest/fight.ts `the den`: the bots' and
 * route-video's), from the balcony's patch: she walks off the balcony, fights until it is down (fades re-form her on
 * the balcony, the fight starts over), then cuts the fallen cage open. Prints the fight's numbers: time, phases,
 * hits, fades, moths saved / eaten. The Canopy r12, src/sim/boss/keeper.ts.
 *   npx tsx tools/playtest/keeper-run.ts [--lead=0] [--catch] [--cage] [--minutes=6] [--trace]
 * `--lead`: a person's lag (frames); `--catch`: she jumps for falling moths; `--cage`: in P3 she cuts the fallen cage
 * in its sweeps.
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
import { fightTactics } from './fight';
import type { Line } from './lines';

export interface KeeperRun {
  won: boolean;
  released: boolean;
  frames: number;
  lockAt: number;
  phaseAt: Record<number, number>;
  hurts: number;
  fades: number;
  saved: number;
  eaten: number;
  freed: number;
  hurtBy: Record<string, number>;
  game: Game;
  events: Array<SimEvent & { f: number }>;
}

/** Plays the den from the balcony; `catches` / `cage` add a person's choices to the den's controller. */
export function runKeeper(
  opts: { lead?: number; lag?: number; catches?: boolean; cage?: boolean; frames?: number } = {},
): KeeperRun {
  const t = cloneTuning(defaultTuning);
  const world = getWorld('canopy');
  const room = getRoom('cn-den');
  const save = newSave(['wallJump', 'glide'] as never);
  save.patch = { room: 'cn-den', id: 'p-den' };
  save.visited.push('cn-den');
  // (The firefly's sighting and the intro have played: the fight is the test.)
  save.flags.push('cn-firefly-den');
  const g = new Game(t, room, 1, () => 0, null, { world, save });
  g.mode = 'manual';
  let ev: readonly SimEvent[] = [];
  g.afterStep.add((e) => {
    ev = e;
  });
  const events: Array<SimEvent & { f: number }> = [];
  const phaseAt: Record<number, number> = {};
  let hurts = 0;
  const hurtBy: Record<string, number> = {};
  // (`lag`: she decides from the state that many frames old, as keeper-live.ts does in the page.)
  const seen: GameState[] = [];
  let fades = 0;
  let lockAt = -1;
  let f = 0;
  const push = (m: number) => {
    g.queueInput([m]);
    g.stepOnce();
    f++;
    for (const e of ev) {
      if (e.type === 'hurt') {
        hurts++;
        const b = g.state.boss;
        const k = g.state.enemies.find((q) => q.id === 'old-burr');
        const why = b && b.sweepHit > 0 ? 'claws' : k?.waveHit ? 'wave' : (k?.mode ?? '?');
        const key = `P${b?.phase ?? 0}:${why}`;
        hurtBy[key] = (hurtBy[key] ?? 0) + 1;
      }
      if (e.type === 'fade') fades++;
      if (e.type === 'bossLock' && lockAt < 0) lockAt = f;
      if (e.type === 'bossPhase') phaseAt[e.phase] = f;
      events.push({ ...e, f });
    }
  };
  const max = opts.frames ?? 6 * 3600;
  const i = (room.enemies ?? []).findIndex((e) => e.id === 'old-burr');
  let line: Line | null = null;
  let k = 0;
  let prev = 0;
  const { right: R, left: L, jump: J, attack: A, up: U } = ActionBit;
  while (f < max) {
    const s = g.state;
    const b = s.boss;
    const p = s.player;
    if (!b) break;
    if (b.stage === 'end' || b.stage === 'down') break;
    // On the balcony (or re-formed there): off it, east, down into the arena.
    if (p.y + p.h < 1100 && b.stage === 'wait') {
      push(R);
      line = null;
      continue;
    }
    const e = s.enemies[i];
    const px = p.x + p.w / 2;
    // A person's choices: a moth falling within a jump, she goes for it.
    if (opts.catches && b.phase <= 2 && b.moth === 2 && e && e.mode !== 'windup' && e.mode !== 'charge') {
      const dx = b.mothX - px;
      if (Math.abs(dx) < 320 && b.mothY > p.y - 200) {
        let m = Math.abs(dx) > 12 ? (dx < 0 ? L : R) : 0;
        if (p.grounded && b.mothY < p.y && !(prev & J)) m |= J;
        else if (!p.grounded && prev & J && p.vy < 0) m |= J;
        prev = m;
        push(m);
        continue;
      }
    }
    // P3: in its sweep (open, head down by the cage), cut the cage first while it has cuts to give.
    if (opts.cage && b.phase === 3 && b.cageCuts < t.keeper.cageCuts && e?.mode === 'eat') {
      const dx = b.cageX - px;
      if (Math.abs(dx) > 70) {
        prev = dx < 0 ? L : R;
        push(prev);
        continue;
      }
      prev = prev & A ? 0 : A | U;
      push(prev);
      continue;
    }
    if (!line || k > 900) {
      const tac = fightTactics(g.scene, i, 1, opts.lead ?? 0).find((q) => q.name === 'the den');
      line = tac?.make() ?? null;
      k = 0;
    }
    seen.push(opts.lag ? cloneState(s) : s);
    while (seen.length > (opts.lag ?? 0) + 1) seen.shift();
    const m = line ? line.act(seen[0] ?? s, k++, prev) : 0;
    prev = m;
    push(m);
  }
  const won = g.state.boss?.stage === 'end' || g.state.boss?.stage === 'down';
  // The cage: up-cuts standing under it until it is out.
  let released = false;
  if (won) {
    for (let n = 0; n < 1200 && !released; n++) {
      const s = g.state;
      const b = s.boss;
      const p = s.player;
      const px = p.x + p.w / 2;
      const dx = (b?.cageX ?? 0) - px;
      released = s.save.flags.includes('cn-den-freed');
      if (Math.abs(dx) > 60) push(dx < 0 ? L : R);
      else push(n % 8 === 0 ? A | U : 0);
    }
    for (let n = 0; n < 600; n++) push(0);
  }
  const b = g.state.boss;
  return {
    won,
    released,
    frames: f,
    lockAt,
    phaseAt,
    hurts,
    fades,
    saved: b?.saved ?? 0,
    eaten: b?.eaten ?? 0,
    freed: g.state.save.moths,
    hurtBy,
    game: g,
    events,
  };
}

if (process.argv[1]?.endsWith('keeper-run.ts')) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}`));
  const val = (k: string, d: number) => Number(arg(k)?.split('=')[1] ?? d);
  const r = runKeeper({
    lead: val('lead', 0),
    lag: val('lag', 0),
    catches: !!arg('catch'),
    cage: !!arg('cage'),
    frames: val('minutes', 6) * 3600,
  });
  if (arg('trace'))
    for (const e of r.events)
      if (
        [
          'bossPhase',
          'cageDrop',
          'mothSaved',
          'mothEaten',
          'cageSwing',
          'cageFall',
          'cageRelease',
          'keeperEat',
          'hurt',
          'fade',
          'bossDefeat',
          'denCollapse',
          'lureSnuff',
          'bossLock',
          'keeperGlance',
          'keeperLunge',
          'keeperGuard',
          'cageGuard',
          'keeperSweep',
        ].includes(e.type)
      )
        console.log(e.f, JSON.stringify(e));
  const ph = Object.entries(r.phaseAt)
    .map(([n, at]) => `P${n} ${((at - r.lockAt) / 60).toFixed(1)} s`)
    .join(', ');
  console.log(
    `${r.won ? 'WON' : 'lost'} in ${((r.frames - r.lockAt) / 60).toFixed(1)} s from the lock (${ph}); hits ${r.hurts}, fades ${r.fades}; moths saved ${r.saved}, eaten ${r.eaten}, freed in all ${r.freed}${r.released ? ' (released)' : ''}; hurt by ${JSON.stringify(r.hurtBy)}`,
  );
}
