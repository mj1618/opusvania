/**
 * Runs the Weaver bot headless in lab-weaver and prints the fight's timeline (memory/bosses.md):
 *   npx tsx tools/playtest/weaver-run.ts [--seconds 300] [--retry] [--trace]
 * `--retry` starts with the save's `met` flag (the short first phase). `--trace` prints her and the
 * Weaver every 10 frames.
 */
import { Game } from '../../src/game';
import { getRoom, worldIdOf } from '../../src/scene/index';
import { GAME_WORLD, getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import { newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { WeaverBot } from './weaver-bot';

export interface FightResult {
  won: boolean;
  /** Frames from the lock to the defeat (or the end). */
  frames: number;
  /** Frames from the lock to each phase. */
  phaseAt: Record<number, number>;
  hurts: number;
  fades: number;
  hurtsBy: Record<string, number>;
  log: string[];
  /** The fight's boss events and her hurts, with the frame (`f`) they fired on. */
  events: Array<SimEvent & { f: number }>;
  game: Game;
}

/** The state and scene moved by (-ox, -oy): what the bot would see in lab-weaver. */
function labView(st: GameState, sc: Scene, ox: number, oy: number): [GameState, Scene] {
  const mv = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: o.x - ox, y: o.y - oy });
  const b = st.boss;
  const view = {
    ...st,
    player: mv(st.player),
    enemies: st.enemies.map(mv),
    boss: b
      ? {
          ...b,
          tellX0: b.tellX0 - ox,
          tellX1: b.tellX1 - ox,
          safeX: b.safeX >= 0 ? b.safeX - ox : b.safeX,
          landX: b.landX - ox,
        }
      : b,
  } as GameState;
  const spec = sc.boss;
  const scene = {
    ...sc,
    lures: (sc.lures ?? []).map(mv),
    boss: spec
      ? {
          ...spec,
          arena: mv(spec.arena),
          ...(spec.floor !== undefined ? { floor: spec.floor - oy } : {}),
          ...(spec.canopy !== undefined ? { canopy: spec.canopy - oy } : {}),
        }
      : spec,
  } as Scene;
  return [view, scene];
}

export function runFight(
  opts: {
    seconds?: number;
    retry?: boolean;
    trace?: boolean;
    tuning?: Tuning;
    bot?: WeaverBot;
    room?: string;
  } = {},
): FightResult {
  const t = opts.tuning ?? cloneTuning(defaultTuning);
  // (Another room with the same arena, the Downwood's `dw-weaver`, runs in its own world.)
  const room = getRoom(opts.room ?? 'lab-weaver');
  const world = opts.room ? getWorld(worldIdOf(opts.room)) : GAME_WORLD;
  // A retry: the save has met it (and rests at the boss door's patch, where a fade re-forms her).
  const save = newSave(room.abilities ?? []);
  save.patch = { room: room.id, id: room.patches?.[0]?.id ?? '' };
  save.visited.push(room.id);
  if (opts.retry && room.boss) save.flags.push(room.boss.met);
  const g = new Game(t, room, 1, () => 0, null, { world, save });
  g.mode = 'manual';
  let ev: readonly SimEvent[] = [];
  g.afterStep.add((e) => {
    ev = e;
  });
  const bot = opts.bot ?? new WeaverBot();
  // (The bot knows lab-weaver's coordinates: another room with the same arena is shown to it moved back.)
  const ox = (room.boss?.arena.x ?? 128) - 128;
  const oy = (room.boss?.canopy ?? 1088) - 1088;
  const events: Array<SimEvent & { f: number }> = [];
  const log: string[] = [];
  const phaseAt: Record<number, number> = {};
  let lockF = -1;
  let hurts = 0;
  let fades = 0;
  const hurtsBy: Record<string, number> = {};
  const max = Math.round((opts.seconds ?? 300) * 60);
  let won = false;
  for (let f = 0; f < max; f++) {
    g.queueInput([
      ox || oy ? bot.decide(...labView(g.state, g.scene, ox, oy)) : bot.decide(g.state, g.scene),
    ]);
    g.stepOnce();
    const st = g.state;
    const at = lockF >= 0 ? f - lockF : -1;
    for (const e of ev) {
      if (e.type.startsWith('boss') || e.type === 'hurt' || e.type === 'fade' || e.type === 'gateOpen')
        events.push({ ...e, f });
      if (e.type === 'bossLock') {
        lockF = f;
        log.push(`${f} lock retry=${e.retry}`);
      } else if (e.type === 'bossPhase') {
        phaseAt[e.phase] = at;
        log.push(`${f} (+${(at / 60).toFixed(1)}s) phase ${e.phase} ${e.name}`);
      } else if (e.type === 'hurt') {
        hurts++;
        const k = `P${st.boss?.phase}:${e.source.kind}:${st.enemies.find((x) => x.id === e.source.id)?.mode ?? ''}:${st.boss?.tell ?? ''}`;
        hurtsBy[k] = (hurtsBy[k] ?? 0) + 1;
        log.push(`${f} HURT hp=${e.hp} by ${k}`);
      } else if (e.type === 'fade') {
        fades++;
        log.push(`${f} FADE`);
      } else if (e.type === 'lureSnuff') log.push(`${f} snuff ${e.id}`);
      else if (e.type === 'bossDefeat') {
        log.push(`${f} DEFEAT time=${(e.time / 60).toFixed(1)}s`);
        won = true;
      } else if (e.type === 'bossReset') log.push(`${f} reset rings=${e.rings}`);
      else if (e.type === 'lureCaught') log.push(`${f} caught ${e.id}`);
      else if (e.type === 'grab') log.push(`${f} grabbed`);
      else if (e.type === 'bossThreadCut') log.push(`${f} thread cut`);
      else if (e.type === 'bossOpen') log.push(`${f} open ${e.how}`);
    }
    if (opts.trace && f % (Number(process.env.EVERY) || 10) === 0) {
      const p = st.player;
      const w = st.enemies.find((x) => x.kind === 'weaverBoss');
      log.push(
        `  ${f} her ${Math.round(p.x + 20)},${Math.round(p.y + 80)} ${p.mode}${p.grounded ? ' g' : ''} lure${p.lure} | W ${w?.mode} ${w ? `${w.x + 36},${w.y + 28}` : ''} hp${w?.hp} | ${st.boss?.stage} P${st.boss?.phase} ${st.boss?.tell}`,
      );
    }
    if (st.boss?.stage === 'down') break;
  }
  const frames = lockF >= 0 ? g.state.frame - lockF : 0;
  return { won, frames, phaseAt, hurts, fades, hurtsBy, log, events, game: g };
}

if (process.argv[1]?.endsWith('weaver-run.ts') && !process.argv.includes('--first')) {
  const arg = (k: string) => process.argv.includes(k);
  const sec = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 300;
  const ri = process.argv.indexOf('--room');
  const r = runFight({
    seconds: sec,
    retry: arg('--retry'),
    trace: arg('--trace'),
    ...(ri >= 0 ? { room: process.argv[ri + 1] as string } : {}),
  });
  console.log(r.log.join('\n'));
  console.log(
    JSON.stringify({
      won: r.won,
      time: (r.frames / 60).toFixed(1),
      phaseAt: r.phaseAt,
      hurts: r.hurts,
      fades: r.fades,
      hurtsBy: r.hurtsBy,
    }),
  );
}

/**
 * First-timer estimates: `n` runs of a bot with a first-timer's hands (seeded), from a fresh save, each
 * until it wins or `seconds` run out. Attempts = fades + 1.
 *   npx tsx tools/playtest/weaver-run.ts --first [--n 20] [--react 20] [--miss 0.35]
 */
export function firstTimers(
  n: number,
  hands: { react: number; miss: number; naive: boolean },
  seconds = 900,
) {
  const rows: Array<{
    seed: number;
    won: boolean;
    attempts: number;
    minutes: number;
    hurts: number;
    perAttempt: number[];
  }> = [];
  for (let seed = 1; seed <= n; seed++) {
    const r = runFight({ seconds, bot: new WeaverBot({ ...hands, seed }) });
    const locks = r.events.filter((e) => e.type === 'bossLock').map((e) => e.f);
    const ends = [...r.events.filter((e) => e.type === 'fade' || e.type === 'bossDefeat').map((e) => e.f)];
    const per = locks.map((l, i) => ((ends[i] ?? l) - l) / 60);
    rows.push({
      seed,
      won: r.won,
      attempts: r.fades + 1,
      minutes: r.frames / 3600,
      hurts: r.hurts,
      perAttempt: per,
    });
  }
  return rows;
}

if (process.argv[1]?.endsWith('weaver-run.ts') && process.argv.includes('--first')) {
  const num = (k: string, d: number) =>
    process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d;
  const rows = firstTimers(num('--n', 20), {
    react: num('--react', 20),
    miss: num('--miss', 0.35),
    naive: true,
  });
  for (const r of rows)
    console.log(
      `seed ${r.seed}: ${r.won ? 'won' : 'LOST'} attempts ${r.attempts} hurts ${r.hurts} ${r.minutes.toFixed(1)} min; per attempt ${r.perAttempt.map((x) => x.toFixed(0)).join(', ')} s`,
    );
  const won = rows.filter((r) => r.won);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
  console.log(
    `won ${won.length}/${rows.length}; median attempts ${med(rows.map((r) => r.attempts))}; median ${med(rows.map((r) => r.minutes)).toFixed(1)} min; hurts median ${med(rows.map((r) => r.hurts))}`,
  );
}
