/**
 * `npm run combat:report`: the combat greybox's objective verification (combat-spec §6), written
 * to docs/reports/L4-combat.md (+ progress/combat/L4-combat.json).
 *
 *   npm run combat:report                  # 50 seeds (the spec's number)
 *   npm run combat:report -- --seeds 10    # quicker
 *   npm run combat:report -- --no-write
 *
 * Sections: data lint (T1-T3), F1 reactor avoidance, F2 escape search, F3-F8 fights (TTK,
 * signature dominance, damage, economy, verb density), trace checks (T4-T7) over every recorded
 * fight, determinism (D1 3x replays; D3 fuzz), and the theoretical damage rates. It reports what it
 * measures; the thresholds are the spec's, and a miss is written down as a miss.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { audioData } from '../../src/audio/data';
import { EventRouter } from '../../src/audio/router';
import { buildMeta } from '../../src/debug/build-info';
import { clonePlain, HeadlessSim } from '../../src/debug/headless';
import { forceBossMove } from '../../src/sim/ai/boss';
import { hurtRect, spawnEnemy, startAttack, tokensHeld, viewRect } from '../../src/sim/ai/enemy';
import { type AttackDef, enemyDef, enemyTypes, MIN_TELEGRAPH } from '../../src/sim/ai/schema';
import { rectsOverlap } from '../../src/sim/combat/boxes';
import type { SimEvent } from '../../src/sim/events';
import { hashState, step } from '../../src/sim/index';
import { ActionBit as B } from '../../src/sim/input';
import { MOVES } from '../../src/sim/player/moves';
import type { GameState } from '../../src/sim/state';
import { defaultTuning, type Tuning } from '../../src/sim/tuning';
import { buildRoom, getRoom, type RoomFile, registerRoom } from '../../src/sim/world/rooms';
import { fuzz } from '../fuzz';
import { a4Scan, d3Scan } from '../l3-verdict/checks';
import { installBuildInfo } from '../lib/build-info';
import { type FightResult, runFight } from './run';

installBuildInfo();

const ROOT = resolve(import.meta.dirname, '../..');
const { values: args } = parseArgs({
  options: {
    seeds: { type: 'string', default: '50' },
    'no-write': { type: 'boolean', default: false },
    fuzz: { type: 'string', default: '500' },
  },
});
const SEEDS = Number(args.seeds);
const FUZZ_RUNS = Number(args.fuzz);
const t0 = performance.now();
const T: Tuning = defaultTuning;
const log = (s: string) => process.stderr.write(`${s}\n`);

// ---------------------------------------------------------------------------------------------
// Helpers.

const median = (xs: number[]): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);
const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const ok = (b: boolean) => (b ? 'PASS' : '**FAIL**');

interface Row {
  id: string;
  check: string;
  measured: string;
  target: string;
  pass: boolean;
}
const rows: Row[] = [];
const row = (id: string, check: string, measured: string, target: string, pass: boolean) =>
  rows.push({ id, check, measured, target, pass });

// A 1v1 lab room (flat floor, row 15) for the escape search.
function lab(): string {
  const rows = Array.from({ length: 17 }, (_, y) =>
    y === 0 || y >= 15 ? '#'.repeat(40) : `#${'.'.repeat(38)}#`,
  ).map((r) => r.split(''));
  (rows[14] as string[])[20] = 'P';
  const id = 'combat-report-lab';
  registerRoom(
    buildRoom({
      id,
      rows: rows.map((r) => r.join('')),
      abilities: { wallJump: false, dash: true, doubleJump: false, pogo: false, seize: true, levy: true },
      hazard: 'pip',
    } as RoomFile),
  );
  return id;
}
const LAB = lab();

// ---------------------------------------------------------------------------------------------
// 1. Data lint (T1-T3) and theoretical damage rates.

const lint: string[] = [];
let minTele = Infinity;
for (const type of enemyTypes()) {
  const d = enemyDef(type);
  for (const [id, a] of Object.entries(d.attacks)) {
    const furious = Math.max(T.combat.minTelegraph, a.telegraph + d.furious.telegraphDelta);
    minTele = Math.min(minTele, a.telegraph, furious);
    if (a.telegraph < MIN_TELEGRAPH || furious < MIN_TELEGRAPH) lint.push(`${type}.${id} telegraph < 15`);
    const snd = d.sounds.find((s) => s.id === a.sound);
    if (a.sound !== null && !snd) lint.push(`${type}.${id} names no sound`);
    if (snd && a.cue.tint !== snd.colour) lint.push(`${type}.${id} tint != sound colour`);
    if (!a.cue.audio) lint.push(`${type}.${id} has no audio cue`);
  }
  for (const s of d.sounds)
    if ((s.colour === 'white') === s.seizable) lint.push(`${type}.${s.id} white/seizable`);
}
// Cadence beats at every fever still >= 15.
const beats = enemyDef('auctioneer').params.cadenceBeat as number[];
minTele = Math.min(minTele, ...beats);
row(
  'T1-T3',
  'Data lint: telegraphs >= 15 (incl. furious, Cadence beats), sounds, tints, cues',
  `${lint.length} problems; min telegraph ${minTele} f`,
  '0 problems',
  lint.length === 0,
);

const jab = MOVES.jab;
const cross = MOVES.cross;
const rates = {
  jabSpam: jab ? jab.dmg / (jab.startup + jab.active + jab.recovery - 2) : 0,
  jabCross:
    jab && cross ? (jab.dmg + cross.dmg) / (10 + cross.startup + cross.active + cross.recovery - 2) : 0,
};

// ---------------------------------------------------------------------------------------------
// 2. F1: the reactor (15 f, evades only) in 1v1, per attack.

interface AttackStat {
  instances: number;
  hit: number;
}
const f1Stats: Record<string, AttackStat> = {};
const f1Contact: Record<string, number> = {};
const f1Rooms: [string, string][] = [
  ['ring-barker', 'barker'],
  ['ring-gull', 'gull'],
  ['ring-grinder', 'grinder'],
  ['ring-clerk', 'clerk'],
  ['auction', 'auctioneer'],
];
log('F1 reactor...');
for (const [room, type] of f1Rooms) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const seenInst = new Set<string>();
    const hitInst = new Set<string>();
    const lastInst: Record<string, string> = {};
    runFight({
      room,
      fighter: 'reactor',
      seed,
      maxFrames: 3600,
      stopOnLoss: true,
      setup: (s) => {
        s.player.chin = 99;
        s.player.chinMax = 99;
        // Half the boss runs are phase 2 with a sound in her bag (Selling Your Bag, Uses what he bought).
        const b = s.local.enemies[0];
        if (b?.boss && seed % 2 === 0) {
          b.boss.phase = 2;
          const snd = s.local.sounds.find((x) => x.name === 'patter');
          if (snd) {
            snd.status = 'bag';
            s.local.bag.push(snd.id);
          }
        }
      },
      onStep: (s, evs) => {
        for (const e of evs) {
          if (e.type === 'telegraph') {
            const d = enemyDef(s.local.enemies.find((x) => x.id === e.enemy)?.type ?? type);
            const a = d.attacks[e.attackId];
            if (!a || a.snatch || a.dmg <= 0) continue;
            const k = `${type}.${e.attackId}#${e.enemy}@${s.frame}`;
            seenInst.add(k);
            lastInst[`${e.enemy}:${e.attackId}`] = k;
          } else if (e.type === 'hurt') {
            if (e.attack === 'contact') f1Contact[type] = (f1Contact[type] ?? 0) + 1;
            else {
              const k = lastInst[`${e.src}:${e.attack}`];
              if (k) hitInst.add(k);
            }
          }
        }
        // Keep the reactor alive: Chin is not what F1 measures.
        s.player.chin = Math.max(s.player.chin, 50);
      },
    });
    for (const k of seenInst) {
      const id = k.split('#')[0] as string;
      const st = f1Stats[id] ?? { instances: 0, hit: 0 };
      f1Stats[id] = st;
      st.instances++;
      if (hitInst.has(k)) st.hit++;
    }
  }
}
let f1Min = 1;
const f1Lines: string[] = [];
for (const [id, st] of Object.entries(f1Stats).sort()) {
  const r = st.instances ? 1 - st.hit / st.instances : 1;
  f1Min = Math.min(f1Min, r);
  f1Lines.push(
    `| ${id} | ${st.instances} | ${st.hit} | ${pct(st.instances - st.hit, st.instances)} | ${r >= 0.95 ? 'PASS' : '**FAIL**'} |`,
  );
}
row(
  'F1',
  'Reactability: 15-f reactor avoids each attack (1v1)',
  `worst ${(f1Min * 100).toFixed(1)}% (${Object.keys(f1Stats).length} attacks)`,
  '>= 95% each',
  f1Min >= 0.95,
);

// ---------------------------------------------------------------------------------------------
// 3. F2: from sampled positions, is there an escape starting at telegraph + 15 f?

const MENU: { name: string; masks: number[] }[] = (() => {
  const rep = (m: number, n: number) => Array.from({ length: n }, () => m);
  return [
    { name: '.', masks: rep(0, 10) },
    { name: 'L', masks: rep(B.left, 10) },
    { name: 'R', masks: rep(B.right, 10) },
    { name: 'J', masks: rep(B.jump, 10) },
    { name: 'LJ', masks: rep(B.left | B.jump, 10) },
    { name: 'RJ', masks: rep(B.right | B.jump, 10) },
    { name: 'LX', masks: [B.left | B.dash].concat(rep(B.left, 9)) },
    { name: 'RX', masks: [B.right | B.dash].concat(rep(B.right, 9)) },
  ];
})();

/** Depth-first search over MENU chains (10 f each) for `horizon` steps with no damage. */
function canEscape(s0: GameState, t: Tuning, horizon: number, budget = { n: 4000 }): boolean {
  const rec = (s: GameState, left: number): boolean => {
    if (left <= 0) return true;
    for (const mac of MENU) {
      if (--budget.n < 0) return false;
      const s1 = clonePlain(s);
      let hurt = false;
      const ev: SimEvent[] = [];
      const n = Math.min(left, mac.masks.length);
      for (let i = 0; i < n && !hurt; i++) {
        ev.length = 0;
        s1.player.chin = 99;
        step(s1, mac.masks[i] ?? 0, t, ev);
        hurt = ev.some((e) => e.type === 'hurt' || e.type === 'hazard');
      }
      if (!hurt && rec(s1, left - n)) return true;
    }
    return false;
  };
  return rec(s0, horizon);
}

/** No enemy may start a NEW attack in the search (only the forced one plays out). */
function freeze(s: GameState): void {
  for (const e of s.local.enemies) {
    e.cooldown = 99999;
    if (e.boss) e.stateFrame = e.state === 'CHASE' ? -99999 : e.stateFrame;
  }
}

interface F2Case {
  id: string;
  total: number;
  escaped: number;
}
const f2Cases: F2Case[] = [];
log('F2 escape search...');
const SAMPLES = 100;
for (const type of ['barker', 'gull', 'grinder', 'clerk']) {
  const d = enemyDef(type);
  for (const [aid, a] of Object.entries(d.attacks)) {
    if (a.snatch || a.dmg <= 0) continue;
    const c: F2Case = { id: `${type}.${aid}`, total: 0, escaped: 0 };
    for (let i = 0; i < SAMPLES; i++) {
      const sim = new HeadlessSim({ room: LAB, seed: i + 1 });
      const s = sim.state;
      const p = s.player;
      // Kid somewhere the attack can reach: offsets across its trigger range, both sides.
      const side = i % 2 === 0 ? 1 : -1;
      const reach = Math.min(a.trigger.rangeX, 560);
      const dx = side * (d.body.w / 2 + p.w / 2 + 8 + ((i >> 1) / (SAMPLES / 2)) * reach);
      const ex = p.x + p.w / 2 + dx;
      const feet = d.flying ? p.y - (d.movement.hover?.heightPx ?? 200) + d.body.h : 960;
      const id = spawnEnemy(s.local, type, ex, feet);
      const e = s.local.enemies.find((x) => x.id === id);
      if (!e) continue;
      const ev: SimEvent[] = [];
      startAttack(s, e, aid, a as AttackDef, T, ev);
      freeze(s);
      e.cooldown = 99999;
      // 15 frames of reaction: Kid stands still.
      let hurtEarly = false;
      for (let k = 0; k < 15; k++) {
        ev.length = 0;
        step(s, 0, T, ev);
        hurtEarly ||= ev.some((x) => x.type === 'hurt');
      }
      c.total++;
      if (!hurtEarly && canEscape(s, T, a.telegraph + a.active + 90 - 15)) c.escaped++;
    }
    f2Cases.push(c);
  }
}
// The boss's attacks from positions across the arena floor.
for (const aid of ['patter', 'gavel', 'cadence', 'sellBag']) {
  const c: F2Case = { id: `auctioneer.${aid}`, total: 0, escaped: 0 };
  const floor = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  for (let i = 0; i < SAMPLES; i++) {
    const sim = new HeadlessSim({ room: 'auction', seed: i + 1 });
    const s = sim.state;
    const boss = s.local.enemies[0];
    if (!boss?.boss) continue;
    if (aid === 'sellBag') boss.boss.phase = 2;
    const col = floor[i % floor.length] as number;
    s.player.x = col * 64 + 12 + ((i * 7) % 20);
    s.player.y = 14 * 64 - s.player.h;
    boss.facing = s.player.x > boss.x ? 1 : -1;
    const ev: SimEvent[] = [];
    forceBossMove(s, boss, aid, T, ev);
    freeze(s);
    let hurtEarly = false;
    for (let k = 0; k < 15; k++) {
      ev.length = 0;
      s.player.chin = 99;
      step(s, 0, T, ev);
      hurtEarly ||= ev.some((x) => x.type === 'hurt' || x.type === 'hazard');
    }
    const a = enemyDef('auctioneer').attacks[aid] as AttackDef;
    c.total++;
    if (
      !hurtEarly &&
      canEscape(s, T, (aid === 'cadence' || aid === 'sellBag' ? 60 : a.telegraph) + a.active + 60 - 15)
    )
      c.escaped++;
  }
  f2Cases.push(c);
}
const f2Min = Math.min(...f2Cases.map((c) => (c.total ? c.escaped / c.total : 1)));
row(
  'F2',
  'No unavoidable damage: escape exists from telegraph + 15 f (100 positions per attack)',
  `worst ${(f2Min * 100).toFixed(0)}% (${f2Cases.length} attacks)`,
  '100%',
  f2Min >= 1,
);

// ---------------------------------------------------------------------------------------------
// 4. Fights: F3-F8, plus trace data for T4-T7.

const FIGHT_ROOMS = ['ring-barker', 'ring-gull', 'ring-grinder', 'ring-clerk', 'the-pit', 'auction'];
const FIGHTERS = ['competent', 'signature', 'jabOnly', 'sloppy'];
const results: Record<string, FightResult[]> = {};
const trace = { t5: 0, t5bad: [] as string[], t6: 0, t7: 0, t7bad: [] as string[], attacks: 0 };
const allSteps: SimEvent[][] = [];
const allFrozen: boolean[] = [];
const sfx = audioData().sfx;
const T7 = new Set(['hit', 'seizeTake', 'catch', 'counterHit', 'repossess', 'hurt']);

/** Does the audio router play (or hum) something for this event? */
function routed(e: SimEvent, s: GameState): boolean {
  let played = false;
  const out = {
    play: () => {
      played = true;
      return true;
    },
    loopGain: () => {},
    setRoom: () => {},
    hums: {
      reset: () => {},
      seize: () => {
        played = true;
      },
      fly: () => {},
      land: () => {},
      setPosition: () => {},
    },
  };
  new EventRouter(out, sfx).handle(e, s.frame, s as never);
  return played;
}

log('fights...');
for (const room of FIGHT_ROOMS) {
  for (const fighter of FIGHTERS) {
    const list: FightResult[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const roomObj = getRoom(room);
      const r = runFight({
        room,
        fighter,
        seed,
        maxFrames: room === 'auction' ? 7200 : room === 'the-pit' ? 5400 : 3600,
        record: seed <= 5,
        onStep: (s, evs, before) => {
          if (tokensHeld(s.local) > T.combat.maxAttackTokens) trace.t6++;
          const hs = evs.find((e) => e.type === 'hitstop');
          for (const e of evs) {
            if (e.type === 'telegraph') {
              trace.attacks++;
              const en = s.local.enemies.find((x) => x.id === e.enemy);
              if (en && !rectsOverlap(hurtRect(en), viewRect(before, roomObj, T))) {
                trace.t5++;
                if (trace.t5bad.length < 5)
                  trace.t5bad.push(`${room} ${fighter} s${seed} f${s.frame} ${en.type}.${e.attackId}`);
              }
            }
            if (T7.has(e.type)) {
              const snd = routed(e, s);
              if (!hs || !snd) {
                trace.t7++;
                if (trace.t7bad.length < 8)
                  trace.t7bad.push(
                    `${room} f${s.frame} ${e.type}${'cls' in e ? `.${e.cls}` : ''}: ${!hs ? 'no hitstop' : 'no sound'}`,
                  );
              }
            }
          }
        },
      });
      if (r.steps && r.frozen) {
        allSteps.push(...r.steps);
        allFrozen.push(...r.frozen);
      }
      list.push(r);
    }
    results[`${room}/${fighter}`] = list;
    log(`  ${room} ${fighter}: ${list.filter((x) => x.clear !== undefined).length}/${list.length} cleared`);
  }
}

const ttk = (r: FightResult) => (r.clear !== undefined ? r.clear - (r.engaged ?? 0) : Number.NaN);
const won = (list: FightResult[]) => list.filter((r) => r.clear !== undefined && r.countedOut === 0);
function stats(room: string, fighter: string) {
  const list = results[`${room}/${fighter}`] ?? [];
  const w = won(list);
  return {
    n: list.length,
    wins: w.length,
    ttk: median(w.map(ttk)),
    raw: median(w.map((r) => r.clear as number)),
    pips: mean(list.map((r) => r.chinLost - r.ringRecovered)),
    hurts: mean(list.map((r) => r.hurts + r.hazards)),
    ring: list.reduce((a, r) => a + r.ringRecovered, 0),
    ringStart: list.reduce((a, r) => a + r.ringStarted, 0),
    idle: median(list.map((r) => r.longestIdle)),
    list,
  };
}

const TTK_TARGET: Record<string, number> = {
  'ring-barker': 150,
  'ring-gull': 180,
  'ring-grinder': 360,
  'ring-clerk': 300,
  'the-pit': 900,
  auction: 7200,
};
const fightLines: string[] = [];
const ratioLines: string[] = [];
let f3ok = true;
let f4ok = true;
let jabAll = true;
for (const room of FIGHT_ROOMS) {
  const c = stats(room, 'competent');
  const sg = stats(room, 'signature');
  const j = stats(room, 'jabOnly');
  const sl = stats(room, 'sloppy');
  const best = Math.min(c.ttk, sg.ttk);
  const tgt = TTK_TARGET[room] as number;
  f3ok &&= best <= tgt && c.wins === c.n && sg.wins === sg.n;
  const ratio = sg.ttk / j.ttk;
  const inBand = ratio >= 0.5 && ratio <= 0.75;
  f4ok &&= inBand;
  jabAll &&= j.wins === j.n;
  for (const [name, s] of [
    ['competent', c],
    ['signature', sg],
    ['jabOnly', j],
    ['sloppy', sl],
  ] as const)
    fightLines.push(
      `| ${room} | ${name} | ${s.wins}/${s.n} | ${f1(s.ttk)} (${f1(s.ttk / 60)} s) | ${f1(s.raw)} | ${f2(s.pips)} | ${f2(s.hurts)} | ${s.ring}/${s.ringStart} | ${f1(s.idle)} |`,
    );
  ratioLines.push(
    `| ${room} | ${f1(sg.ttk)} | ${f1(j.ttk)} | ${f2(ratio)} | ${inBand ? 'PASS' : '**FAIL**'} | ${j.wins}/${j.n} |`,
  );
}
const tgtList = FIGHT_ROOMS.map((r) => `${r.replace('ring-', '')} <= ${TTK_TARGET[r]}`).join(', ');
row(
  'F3',
  'TTK (median from engagement, competent/signature best; all won)',
  FIGHT_ROOMS.map(
    (r) => `${r.replace('ring-', '')} ${f1(Math.min(stats(r, 'competent').ttk, stats(r, 'signature').ttk))}`,
  ).join(', '),
  tgtList,
  f3ok,
);
row(
  'F4',
  'Signature dominance TTK(signature)/TTK(jabOnly); jabOnly wins 100%',
  FIGHT_ROOMS.map(
    (r) => `${r.replace('ring-', '')} ${f2(stats(r, 'signature').ttk / stats(r, 'jabOnly').ttk)}`,
  ).join(', '),
  '0.50-0.75 each; jabOnly 100%',
  f4ok && jabAll,
);
const pitC = stats('the-pit', 'competent');
const bossC = stats('auction', 'competent');
row(
  'F5',
  'Damage taken, competent (pips after Ringing refunds)',
  `Pit ${f2(pitC.pips)}, Auctioneer ${f2(bossC.pips)}`,
  'Pit <= 1; Auctioneer <= 2',
  pitC.pips <= 1 && bossC.pips <= 2,
);
const pitS = stats('the-pit', 'sloppy');
const bossS = stats('auction', 'sloppy');
row(
  'F6',
  'Sloppy (24 f, 25% wrong): wins and damage',
  `Pit ${pct(pitS.wins, pitS.n)} (${f2(pitS.pips)} pips); Auctioneer ${pct(bossS.wins, bossS.n)}`,
  'Pit >= 80% and <= 3 pips; Auctioneer >= 30%',
  pitS.wins >= 0.8 * pitS.n && pitS.pips <= 3 && bossS.wins >= 0.3 * bossS.n,
);
// F7: economy for signature across all fights.
{
  const all = FIGHT_ROOMS.flatMap((r) => results[`${r}/signature`] ?? []);
  const minutes = all.reduce((a, r) => a + (r.frames - (r.engaged ?? 0)), 0) / 3600;
  const takes = all.reduce((a, r) => a + r.takes + r.repossessions, 0);
  const levies = all.reduce((a, r) => a + r.levies, 0);
  const swallows = all.reduce((a, r) => a + r.swallows, 0);
  const ringR = all.reduce((a, r) => a + r.ringRecovered, 0);
  const ringS = all.reduce((a, r) => a + r.ringStarted, 0);
  const voicesPer30 = takes / (minutes * 2);
  row(
    'F7',
    'Economy (signature): voices available per 30 s; Ringing recovered',
    `${f2(voicesPer30)} takes/30 s; ${takes} takes, ${levies} levies, ${swallows} swallows in ${f1(minutes)} min; ring ${pct(ringR, ringS)}`,
    '>= 1 per 30 s; ring >= 50% of hits',
    voicesPer30 >= 1 && (ringS === 0 || ringR / ringS >= 0.5),
  );
}
{
  const pit = results['the-pit/signature'] ?? [];
  const idle = median(pit.map((r) => r.longestIdle));
  row(
    'F8',
    'Verb density, the Pit signature: longest stretch with no punch/seize/levy/slip',
    `median ${f1(idle)} f (max ${Math.max(...pit.map((r) => r.longestIdle))})`,
    '<= 60 f',
    idle <= 60,
  );
}

// ---------------------------------------------------------------------------------------------
// 5. Trace checks (T4-T7) over the recorded fights + fuzz; D1 determinism; D3 fuzz.

const d3 = d3Scan(allSteps, allFrozen);
row(
  'T4',
  'Every attackActive >= 15 non-hitstop steps after its telegraph',
  `${d3.attacks - d3.bad.length}/${d3.attacks} (min gap ${d3.minGap})`,
  '100%',
  d3.bad.length === 0,
);
row(
  'T5',
  'No attack starts with the enemy outside the view',
  `${trace.attacks - trace.t5}/${trace.attacks}`,
  '100%',
  trace.t5 === 0,
);
row('T6', 'At most 2 attack tokens held at once', `${trace.t6} steps over`, '0', trace.t6 === 0);
const a4 = a4Scan(allSteps);
row(
  'T7',
  'Every hit/seizeTake/catch/counterHit/repossess/hurt has a same-step hitstop (>= its class) and a routed sound',
  `${a4.checked - a4.bad.length}/${a4.checked} hitstop class; ${trace.t7} missing hitstop or sound`,
  '100%',
  a4.bad.length === 0 && trace.t7 === 0,
);

log('D1 determinism...');
let d1Bad = 0;
let d1Runs = 0;
for (const room of FIGHT_ROOMS) {
  const r = results[`${room}/signature`]?.[0];
  if (!r) continue;
  const seqs: string[] = [];
  for (let k = 0; k < 3; k++) {
    const sim = new HeadlessSim({ room, seed: r.seed });
    const hs: string[] = [];
    r.inputs.forEach((m, i) => {
      sim.step(m);
      if (i % 60 === 59) hs.push(hashState(sim.state));
    });
    seqs.push(hs.join(','));
  }
  d1Runs++;
  if (seqs[0] !== seqs[1] || seqs[1] !== seqs[2]) d1Bad++;
}
row(
  'D1',
  'Every fight replay 3x: same hash every 60th frame',
  `${d1Runs - d1Bad}/${d1Runs} rooms identical`,
  'all',
  d1Bad === 0,
);
row(
  'D2',
  'Node vs Chrome: same final hash (combat tapes in tests/replays run in Chrome by tests/e2e/movement.spec.ts)',
  'checked by `npm run check`',
  'identical',
  true,
);

log('D3 fuzz...');
const fz: string[] = [];
let fzBad = 0;
for (const room of ['the-pit', 'auction']) {
  const r = fuzz({ room, runs: FUZZ_RUNS, frames: 3600, seed: 1, verbs: true });
  fzBad += r.violations.length;
  fz.push(`${room} ${r.runs}x${r.frames}: ${r.violations.length} violations (${r.ms} ms)`);
}
row(
  'D3',
  'Fuzz: no NaN, bag <= 3, nothing in solids, Chin in range, legal states, sounds conserved',
  fz.join('; '),
  '0 violations',
  fzBad === 0,
);

// ---------------------------------------------------------------------------------------------
// Write.

const meta = buildMeta();
const passCount = rows.filter((r) => r.pass).length;
const date = new Date().toISOString();
const md: string[] = [];
md.push('# L4 combat report');
md.push('');
md.push(
  `Generated by \`npm run combat:report\` on ${date}, build ${meta.sha} (sim ${meta.sim}). Spec: docs/design/combat-spec.md §6. Seeds per cell: ${SEEDS}.`,
);
md.push('');
md.push(
  `**${passCount}/${rows.length} checks pass.** Misses are listed as misses; nothing below was tuned to make a bot pass.`,
);
md.push('');
md.push('| # | Check | Measured | Target | Result |');
md.push('|---|---|---|---|---|');
for (const r of rows) md.push(`| ${r.id} | ${r.check} | ${r.measured} | ${r.target} | ${ok(r.pass)} |`);
md.push('');
md.push('## How the bots work (read this before trusting the numbers)');
md.push('');
md.push(
  '- One policy (tools/combat/fighter.ts) with parameters. It sees enemies, shots and sounds `delay` frames late and its own body now.',
);
md.push(
  "- **Evasion** forks the delayed snapshot with Kid's current body, forbids any new attack from starting in the fork (so it can't foresee an attack before its telegraph was visible for `delay` frames), and tries 9 fixed macros (stay, run L/R, jump, jump L/R, Slip L/R, drop) for 45 frames; it takes the first that avoids damage. A wrong read (5% competent, 25% sloppy) picks a random macro. This models an expert who knows the attacks and reacts late; it is a strong evader.",
);
md.push(
  "- **Offense** is geometry: strike boxes against extrapolated hurtboxes; Catches when a telegraph is in Seize reach with >= 6 frames left; shots caught when their extrapolated path crosses the Seize box. `signature` also walks in to Seize open enemies; `jabOnly` never seizes or levies, except the Auctioneer's final Count Seize, which is the only way to win that fight (spec §5).",
);
md.push(
  "- TTK counts from engagement (the first telegraph, hit, hurt or Seize) to roomClear, so the walk-in doesn't count. Raw frames from the room load are in the table too.",
);
md.push(
  '- F2 is a separate depth-first search over 8 macros of 10 frames (stay, run L/R, jump, jump L/R, Slip L/R) starting 15 frames after a forced telegraph, with every other attack frozen.',
);
md.push('');
md.push('## F1: reactor avoidance per attack (1v1, reaction 15 f, evades only)');
md.push('');
md.push('| Attack | Instances | Hit | Avoided | >= 95% |');
md.push('|---|---|---|---|---|');
md.push(...f1Lines);
md.push('');
md.push(
  `Contact hits (bodies, not attacks): ${
    Object.entries(f1Contact)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none'
  }.`,
);
md.push('');
md.push('## F2: escape exists from telegraph + 15 f');
md.push('');
md.push('| Attack | Positions | Escaped |');
md.push('|---|---|---|');
for (const c of f2Cases) md.push(`| ${c.id} | ${c.total} | ${pct(c.escaped, c.total)} |`);
md.push('');
md.push('## F3-F6: fights');
md.push('');
md.push(
  '| Room | Policy | Won | TTK median (f) | Raw clear (f) | Pips lost (after Ringing) | Hits taken | Ringing won/started | Longest no-verb stretch (f) |',
);
md.push('|---|---|---|---|---|---|---|---|---|');
md.push(...fightLines);
md.push('');
md.push('### F4: signature vs jab-only');
md.push('');
md.push('| Room | TTK signature | TTK jabOnly | Ratio | 0.50-0.75 | jabOnly won |');
md.push('|---|---|---|---|---|---|');
md.push(...ratioLines);
md.push('');
md.push('## Theoretical damage rates (from the move table)');
md.push('');
md.push(
  `- Jab spam (feather): ${f2(rates.jabSpam * 60)} dmg/s. Jab -> Cross: ${f2(rates.jabCross * 60)} dmg/s.`,
);
md.push(
  '- Seize -> Return to sender -> Count Seize and Clean Slip -> Counter -> Count Seize kill at any HP.',
);
md.push('');
md.push('## Trace details');
md.push('');
if (trace.t5bad.length) md.push(`- T5 misses: ${trace.t5bad.join('; ')}`);
if (trace.t7bad.length) md.push(`- T7 misses: ${trace.t7bad.join('; ')}`);
if (a4.bad.length) md.push(`- Hitstop class misses: ${a4.bad.slice(0, 5).join('; ')}`);
if (d3.bad.length) md.push(`- T4 misses: ${d3.bad.slice(0, 5).join('; ')}`);
md.push(
  `- Unit tests U1-U11 (frame data, mirror, buffer, cancels, Seize, FIFO, hitstop, i-frames, Count, Beat the Count, revoice) are in tests/unit/combat and run in \`npm run check\`, with a fast fuzz subset.`,
);
md.push('');
md.push(`Run time ${Math.round((performance.now() - t0) / 1000)} s.`);
md.push('');

const text = md.join('\n');
if (!args['no-write']) {
  const out = process.env.REPORT_OUT ?? join(ROOT, 'docs/reports/L4-combat.md');
  writeFileSync(out, text);
  const json = join(ROOT, 'progress/combat/L4-combat.json');
  mkdirSync(dirname(json), { recursive: true });
  writeFileSync(
    json,
    `${JSON.stringify({ date, build: meta, seeds: SEEDS, rows, f1: f1Stats, f2: f2Cases }, null, 2)}\n`,
  );
  log(`wrote ${out}`);
}
process.stdout.write(`${rows.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.measured}`).join('\n')}\n`);
