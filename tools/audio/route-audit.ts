/**
 * What the Canopy sounds like, room by room, by numbers (agents can't hear): replays a route tape
 * (tools/playtest/route-video.ts `plan` -> tape.json) headless through the Game and the audio conductor
 * (muted: it routes cues without sound) and prints, per room, the seconds spent, the cues by sound, the sim
 * events that made no sound at all, and the score's moods (src/audio/score.ts).
 *
 *   npx tsx tools/audio/route-audit.ts --tape <dir>/tape.json [--legs <dir>/legs.json] [--json out.json]
 *
 * The camera is taken as her position (no render here): placement and distance are approximate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Conductor } from '../../src/audio/conductor';
import { snapOf } from '../../src/audio/router';
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const { values: args } = parseArgs({
  options: {
    tape: { type: 'string' },
    legs: { type: 'string' },
    json: { type: 'string' },
    world: { type: 'string', default: 'canopy' },
    start: { type: 'string', default: 'cn-hatch' },
  },
});
if (!args.tape) {
  console.log('npx tsx tools/audio/route-audit.ts --tape <dir>/tape.json [--legs <dir>/legs.json]');
  process.exit(1);
}
const tape = JSON.parse(readFileSync(args.tape, 'utf8')) as number[];
const warps = args.legs
  ? ((
      JSON.parse(readFileSync(args.legs, 'utf8')) as {
        warps?: Array<{ f: number; x: number; y: number; flag?: string }>;
      }
    ).warps ?? [])
  : [];
const tuning = cloneTuning(defaultTuning);
const world = getWorld(args.world ?? 'canopy');
const game = new Game(tuning, getRoom(args.start ?? 'cn-hatch'), 1, () => 0, null, { world });
game.mode = 'manual';
const conductor = new Conductor({ scene: game.scene, seed: game.seed });

interface RoomLog {
  frames: number;
  cues: Record<string, number>;
  silentEvents: Record<string, number>;
  moods: Record<string, number>;
}
const rooms: Record<string, RoomLog> = {};
const log = (room: string): RoomLog => {
  rooms[room] ??= { frames: 0, cues: {}, silentEvents: {}, moods: {} };
  return rooms[room] as RoomLog;
};
let last: readonly SimEvent[] = [];
game.afterStep.add((ev) => {
  last = ev;
});
const moodTimeline: Array<{ f: number; room: string; mood: string }> = [];
for (let f = 0; f < tape.length; f++) {
  for (const w of warps) {
    if (w.f !== f) continue;
    if (w.flag) game.state.save.flags.push(w.flag);
    else game.teleport(w.x, w.y);
  }
  game.queueInput([tape[f] as number]);
  game.stepOnce();
  conductor.ctx.scene = game.scene;
  const snap = snapOf(game.state, game.scene, tuning);
  const cam = { x: snap.hero.x, y: snap.hero.y - 120, zoom: 1 };
  const cues = conductor.step(last, snap, cam, f / 60, false);
  const r = log(game.state.room);
  r.frames++;
  for (const c of cues) r.cues[c.sound] = (r.cues[c.sound] ?? 0) + 1;
  for (const t of conductor.unrouted) r.silentEvents[t] = (r.silentEvents[t] ?? 0) + 1;
  const mood = (conductor as { mood?: () => string }).mood?.() ?? 'none';
  r.moods[mood] = (r.moods[mood] ?? 0) + 1;
  const prev = moodTimeline[moodTimeline.length - 1];
  if (!prev || prev.mood !== mood || prev.room !== game.state.room)
    moodTimeline.push({ f, room: game.state.room, mood });
}

const fmt = (o: Record<string, number>, scale = 1) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${scale === 1 ? v : (v / scale).toFixed(1)}`)
    .join(', ');
for (const [id, r] of Object.entries(rooms)) {
  console.log(`\n## ${id}: ${(r.frames / 60).toFixed(0)} s`);
  console.log(`cues: ${fmt(r.cues) || '(none)'}`);
  console.log(`moods (s): ${fmt(r.moods, 60)}`);
  console.log(`events with no sound: ${fmt(r.silentEvents)}`);
}
console.log('\n## mood timeline');
for (const m of moodTimeline)
  console.log(`${(m.f / 60).toFixed(1).padStart(6)} s  ${m.room.padEnd(14)} ${m.mood}`);
if (args.json) writeFileSync(args.json, JSON.stringify({ rooms, moodTimeline }, null, 1));
