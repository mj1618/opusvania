/**
 * A whole area played start to finish as ONE deterministic input tape, for a review video (the Canopy first).
 *
 *   npx tsx tools/playtest/route-video.ts plan [--out dir]        # headless: legs -> tape.txt + legs.json
 *   npx tsx tools/playtest/route-video.ts render --out dir [--url http://localhost:5230]   # raw.mp4, then finish
 *   npx tsx tools/playtest/route-video.ts finish --out dir    # captions (.ass) burnt in -> <name>.mp4, chapters.md
 *
 * `plan` drives the `Game` (the page's harness, world `canopy`, fresh save from cn-hatch) leg by leg: each leg is a
 * goal (an exit, a find, an ability, a flag) reached by the explorer (tools/solve/explore.ts: moves in the real sim,
 * **creatures in**, lamps as they are, her glow as it is), so the found tape is exactly what the Game then plays.
 * When no line avoids a creature, or the leg says so, she fights (tools/playtest/fight.ts: the look-ahead tactics;
 * the old burrback by the den's plan). Between macros a smoothing pass drops the explorer's settle stops where the
 * next move still lands on the same node. `render` replays the tape in the page (follow camera, zoom 1, pickups and
 * HUD on), one picture per 2 sim frames (30 fps, real time), skips long still stretches, and burns the room name in
 * a corner (ffmpeg + an .srt), then writes chapters.md.
 *
 * v3 (2026-10-30): the route is the v3 layout's (27 rooms). A `warp` leg is a harness teleport for where play
 * cannot go on (a level bug); it is saved in legs.json (`warps`), replayed by `render` at the same sim frame and
 * captioned. An `optional` fight leaves the creature be when time runs out. `--title`, `--layout` and the commit
 * (git) head chapters.md.
 *
 * v4 (2026-10-30): the v4 layout's route (chimneys of alternate thorns, plugs, the Grove's wave, the den without a
 * teleport, moon shards, the bower's save). The explorer gets the chimney macros (`zig`) and counts bark cuts left
 * (`barkHp`), as the Canopy's proofs do; captions for shards, plugs, the wave, the save and the den's snuffed lamp.
 *
 * v5 (2026-10-31): the v7 layout's route (the well's three legs and mid rest, the ambush on its trigger, the Grove's
 * arena behind root gates, fling lines, the hub's high chamber, the ledge after the boss). `optional` exit / goal legs
 * are detours (one look; the route goes on without them); a fight's `until` waits out the gap between a wave's
 * beats; a fight target not hurt in 10 s is left a while for another (a lampwing hovering out of reach). Flings out
 * of fights are captioned. The den's plan in fight.ts walks off a solid shelf and out from under one.
 *
 * v6 (2026-10-31): the v9 layout's route (the well's two climbing legs, then the gallery walked and jumped: the
 * landing's floor, the terraces, the bough and the stair to the hollow; the hollow lamp's fling to the shard after the
 * ambush; the gap's three-lamp chain down to the pod garden and out by the fork; the tunnel's glide onto the den's
 * warning, its two beats, then the den).
 *
 * v7 (2026-10-31, video v9): a rest at the hub's map station (the kin's lamp, `p-crossing`) after the high chamber,
 * captioned with the map and the hung moth-stones; a fight never picks a tactic whose look-ahead cuts a lamp down with
 * the blade (out for good in the save: the ambush lampwing's dives cut the hollow lamp, the shard's only way up).
 *
 * v8 (2026-10-31, the v11 layout, review r10's staging): every cage cut open (a `cage` leg: a small closed loop that
 * walks under the cage, or to a run-up, and cuts until it is out: the explorer's node key keeps a cage's cuts as one
 * state, so it never chains three): the hub's under the landing limb first, the Grove's after the wave, the
 * warning's (hung by the firefly once the warning is cleared) from the knuckle under it, the great cage over the
 * old burrback from a jump off the west shelf; both firefly sightings (the gap's on the chain's first fling, the
 * warning's), and the den's way out up through its roof to the clifftop's vista.
 *
 * v9 (2026-10-31, video v12): `render --audio` records the game's sound (src/audio, memory/audio.md) with the
 * picture: the page (`?audio`) records the audio director's tape from the first step, and every `AUDIO_CHUNK` sim
 * frames renders a window of it offline (`__game.audio.render({ from, to })`: the steps before the window run the
 * conductor silently, so the score and the creatures' memory carry over; `AUDIO_WARM` audible frames before it fill
 * the reverb and held notes). The windows are cross-faded into one sim-time track (frame f's sound at f/60 s), which
 * is then cut exactly as the pictures were (a skipped still stretch is skipped in the sound, with a 5 ms cross-fade),
 * so sound is on the frame: picture i, at i/30 s, shows frame kept[i] and plays the sound from kept[i]/60. raw.mp4
 * and the captioned mp4 carry AAC; audio.wav is kept. Without `--audio` nothing changes (silent, as before).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Game } from '../../src/game';
import { parseInputScript } from '../../src/input/script';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { chimneyMacros, type ExploreNode, explore, feet, glideClimbMacros, pathTo } from '../solve/explore';
import { fightScore, fightTactics, hostile } from './fight';
import type { Line } from './lines';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'playtest-reports/canopy-video' },
    url: { type: 'string', default: 'http://localhost:5230' },
    upto: { type: 'string' },
    from: { type: 'string' },
    size: { type: 'string', default: '1280x720' },
    still: { type: 'string', default: '90' },
    frames: { type: 'string' },
    name: { type: 'string', default: 'canopy-playthrough' },
    crf: { type: 'string', default: '25' },
    title: { type: 'string', default: 'The Canopy: a complete playthrough (review video)' },
    layout: { type: 'string' },
    /** render: record the game's sound too (v9). */
    audio: { type: 'boolean', default: false },
  },
});

// (v4's den needed \`DEN_HOLD=1\` (wait by the taproot in phase 3: its shelves stopped a ram drawn mid-arena); v5 raised
// the shelves to 256 over the floor, so the den's plan draws the rams again. Set it in the environment if needed.)
const WORLD = 'canopy';
const START = 'cn-hatch';
const tuning = cloneTuning(defaultTuning);
const world = getWorld(WORLD);

// ---- the route

type Leg =
  /** `optional`: a detour; if no line gets there, the route goes on from where she stands. */
  | { name: string; kind: 'exit'; exit: string; max?: number; optional?: boolean }
  | { name: string; kind: 'goal'; test: (s: GameState) => boolean; max?: number; optional?: boolean }
  /**
   * `until`: the fight is over only when this holds (a wave whose next beat appears after the last one dies: the
   * named creatures not yet woken are `gone`); between beats she waits.
   */
  | {
      name: string;
      kind: 'fight';
      ids: string[];
      seconds?: number;
      optional?: boolean;
      until?: (s: GameState) => boolean;
    }
  | { name: string; kind: 'script'; script: string }
  /** A harness teleport (feet at x, y), only where play cannot go on (a level bug): captioned in the video. */
  | { name: string; kind: 'warp'; x: number; y: number; why: string }
  /** A harness edit of a save flag (the debug API's `flag(name)`), only where play cannot go on: captioned. */
  | { name: string; kind: 'flag'; flag: string; why: string }
  | { name: string; kind: 'settle' }
  /**
   * A cage cut open (v8): she walks under lure `lure` (or to `run[0]`, then runs to `run[1]` and jumps toward it) and
   * up-cuts until it is out.
   */
  | { name: string; kind: 'cage'; lure: string; run?: [number, number]; optional?: boolean };

const taken = (id: string) => (s: GameState) => s.save.taken.includes(id);
/** A pickup of the room she is in has been touched (its timer runs: woken, flying to her or taken). */
const picked = (room: string, id: string) => {
  const k = (getRoom(room).pickups ?? []).findIndex((p) => p.id === id);
  return (s: GameState) => s.room === room && (s.pickups.timers[k] ?? 0) !== 0;
};
/** She has rested at a patch (stood still in it or pressed up: whole again, saved), not only passed it (a mark). */
const rested = (room: string, id: string) => {
  const k = (getRoom(room).patches ?? []).findIndex((p) => p.id === id);
  return (s: GameState) => s.room === room && s.rest.done && s.rest.at === k;
};
const owns = (a: string) => (s: GameState) => (s.save.abilities as readonly string[]).includes(a);
const flag = (f: string) => (s: GameState) => s.save.flags.includes(f);
const near =
  (x: number, y: number, r = 120) =>
  (s: GameState) => {
    const f = feet(s);
    return Math.abs(f.x - x) < r && Math.abs(f.y - y) < 60;
  };
/** A rotten wall or panel of the room she is in is broken (its key in save.opened). */
const opened = (id: string) => (s: GameState) => s.save.opened.some((o) => o === id || o.endsWith(`:${id}`));

export const ROUTE: Leg[] = [
  // v6 (the v9 layout): the well's gallery, the hollow's shard, the gap's chain, the den's warning (below).
  // v5 video (build 3e924ff, the v7 layout): the critical path from a fresh save, every fight (the well's ambush on
  // its trigger, the Grove's arena wave, the old burrback), the well's three legs with leg 3's mid rest and its
  // lampwing, and detours to the new things: the well's landing niche (a moon shard), the limbs' fling line to the
  // niche, the hub's high chamber (a moon shard behind a rotten wall), the Grove pit's wall (a moon shard), the gap's
  // roost, the hub's wings shelf (flung off the lampoak's socket), the ledge after the boss. (The Elder is shut from the well's side
  // since v6: its door opens from the Elder's room.)
  // The hatch: the cocoon listens after the fade up; three presses break it.
  { name: 'cn-hatch: the hatching', kind: 'script', script: '.170 J2 .10 J2 .10 J2 .10 J2 .90' },
  { name: 'cn-hatch: down to the drop', kind: 'exit', exit: 'drop', max: 12000 },
  // v8 (the v11 layout): the first release, in the landing's frame: the cage under the landing limb, cut standing.
  { name: 'cn-hub: under the cage', kind: 'goal', test: near(6300, 1600, 60), max: 9000 },
  { name: 'cn-hub: the cage cut open (the first release)', kind: 'cage', lure: 'trap-crossing' },
  // The Crossing (8,000 wide since v6) reads west: the root floor through the moonlit clearing to the giant's mouth.
  { name: 'cn-hub: the lit way west', kind: 'exit', exit: 'trunk', max: 20000 },
  { name: 'cn-trunk: the rotten wall', kind: 'goal', test: opened('giant-wall'), max: 12000 },
  { name: 'cn-trunk: the seed behind it', kind: 'goal', test: flag('seeds:1'), max: 12000 },
  { name: 'cn-trunk: down to the well', kind: 'exit', exit: 'well', max: 12000 },
  { name: 'cn-well: the claws at the bottom', kind: 'goal', test: owns('wallJump'), max: 12000 },
  {
    name: "cn-well: the claws' prize on the face",
    kind: 'goal',
    test: picked('cn-well', 'claw-prize'),
    max: 12000,
    optional: true,
  },
  // The well's bottom is a start: the one way out is up, two climbing legs, then the gallery (v9).
  {
    name: "cn-well: leg 1, up the shaft to the giant's mouth",
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && s.player.grounded && feet(s).y <= 3200 && feet(s).y > 2900,
    max: 16000,
  },
  {
    name: 'cn-well: leg 2, the chimney to the landing',
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && s.player.grounded && feet(s).y <= 2440 && feet(s).y > 2300,
    max: 16000,
  },
  // v9: the gallery, a switchback walked and jumped through the hollowed west wall: west along the landing's floor
  // (a burrback, a bramble pit), up two root terraces, east along a bough (a lampwing), up the stair to the hollow.
  {
    name: "cn-well: the gallery's burrback",
    kind: 'fight',
    ids: ['burr-gallery'],
    seconds: 30,
    optional: true,
  },
  {
    name: 'cn-well: the gallery, west and up the root terraces',
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && s.player.grounded && feet(s).y <= 2060 && feet(s).y > 1900,
    max: 16000,
  },
  {
    name: "cn-well: the gallery's bough",
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && s.player.grounded && feet(s).y <= 1870 && feet(s).y > 1700,
    max: 16000,
  },
  {
    name: "cn-well: the bough's lampwing",
    kind: 'fight',
    ids: ['wing-gallery'],
    seconds: 30,
    optional: true,
  },
  {
    name: 'cn-well: the stair to the hollow',
    kind: 'goal',
    test: (s) => s.room === 'cn-well' && s.player.grounded && feet(s).y <= 1160 && feet(s).y > 900,
    max: 16000,
  },
  // v7: the ambush wakes on a trigger over the hollow's floor (not the claws).
  {
    name: "cn-well: into the hollow (the ambush's trigger)",
    kind: 'goal',
    test: flag('cn-well-ambush'),
    max: 12000,
  },
  { name: 'cn-well: the ambush', kind: 'fight', ids: ['burr-am-1', 'burr-am-2', 'wing-am'], seconds: 120 },
  // v9: the ambush pays. The hollow lamp's up-left fling onto the west wall's root shelf (a moon shard).
  {
    name: "cn-well: the hollow lamp's fling to the shard",
    kind: 'goal',
    test: taken('cn-well:shard-well'),
    max: 12000,
    optional: true,
  },
  { name: 'cn-well: out to the upper limbs', kind: 'exit', exit: 'limbs', max: 12000 },
  // A fling line: off the second limb's lamp up into the niche over it.
  {
    name: 'cn-limbs: the fling to the niche',
    kind: 'goal',
    test: picked('cn-limbs', 'niche-2'),
    max: 12000,
    optional: true,
  },
  { name: 'cn-limbs: the jump over the thorns', kind: 'exit', exit: 'hub', max: 12000 },
  // The hub's high chamber: a rotten wall high in the block's east face (the claws), a moon shard inside.
  {
    name: "cn-hub: the high chamber's wall",
    kind: 'goal',
    test: opened('high-wall'),
    max: 16000,
    optional: true,
  },
  {
    name: "cn-hub: the high chamber's shard",
    kind: 'goal',
    test: taken('cn-hub:shard-high'),
    max: 12000,
    optional: true,
  },
  // v7 (the v9 layout's map station): the kin's lamp in the clearing. A rest there shows the map and hangs the
  // moth-stones she has read (the well's west stone by now).
  {
    name: "cn-hub: a rest at the kin's lamp (the map station)",
    kind: 'goal',
    test: rested('cn-hub', 'p-crossing'),
    max: 20000,
    optional: true,
  },
  { name: 'cn-hub: east to the fork', kind: 'exit', exit: 'fork', max: 20000 },
  { name: 'cn-fork: the claw climb to the Grove', kind: 'exit', exit: 'grove', max: 12000 },
  // The Grove: landing in the pit shuts the root gates; both open when the wave is down.
  { name: 'cn-grove: down into the pit', kind: 'goal', test: flag('cn-grove-wave'), max: 12000 },
  {
    name: 'cn-grove: the wave',
    kind: 'fight',
    ids: ['burr-pit-w', 'burr-pit-e', 'juv-wave-w', 'juv-wave-e', 'dang-wave', 'wing-wave'],
    seconds: 240,
    until: flag('cn-grove-clear'),
  },
  // v8: the pit's west lamp is a cage (cut standing from the floor under it).
  { name: "cn-grove: under the pit's cage", kind: 'goal', test: near(1760, 1600, 60), max: 12000 },
  { name: "cn-grove: the pit's cage cut open", kind: 'cage', lure: 'trap-grove' },
  {
    name: "cn-grove: the pit's rotten wall",
    kind: 'goal',
    test: taken('cn-grove:shard-grove'),
    max: 12000,
    optional: true,
  },
  { name: 'cn-grove: the keen hollow', kind: 'goal', test: flag('upgrade:keenBlade'), max: 16000 },
  { name: 'cn-grove: the seed', kind: 'goal', test: flag('seeds:2'), max: 16000 },
  { name: 'cn-grove: through the gate to the Spire', kind: 'exit', exit: 'spire', max: 16000 },
  { name: "cn-spire: the climb through the hawker's orbit", kind: 'exit', exit: 'bower', max: 16000 },
  // (Standing in the bower's patch, then a press of up: a rest, not only the mark a pass leaves.)
  {
    name: 'cn-bower: the save',
    kind: 'goal',
    test: (s) =>
      s.room === 'cn-bower' && s.player.grounded && Math.abs(feet(s).x - 3800) < 52 && feet(s).y === 1408,
    max: 6000,
  },
  { name: 'cn-bower: a rest', kind: 'script', script: 'U4 .40' },
  { name: 'cn-bower: the kin climb to the crown', kind: 'exit', exit: 'crown', max: 12000 },
  { name: 'cn-crown: the glide', kind: 'goal', test: owns('glide'), max: 12000 },
  { name: 'cn-crown: back down', kind: 'exit', exit: 'bower', max: 12000 },
  { name: 'cn-bower: west to the gap', kind: 'exit', exit: 'gap', max: 12000 },
  { name: 'cn-gap: the glide to the far seed', kind: 'goal', test: flag('seeds:3'), max: 12000 },
  // The roost hidden in the hanging root clump (its glints; the shelf's lamps fling into its mouth).
  {
    name: "cn-gap: the roost's glints",
    kind: 'goal',
    test: picked('cn-gap', 'roost-2'),
    max: 16000,
    optional: true,
  },
  // v9: the gap's chain, three lamps down to the pod garden (the third past a slick hanging root), then out by the
  // fork and back west into the Crossing.
  {
    name: "cn-gap: the three lamps' chain down to the pod garden",
    kind: 'goal',
    // (Down there by the chain, flung: v8 (the v11 layout) reads the firefly's flag, which only a fling off the chain
    // sets; the third lamp out was the test, but the firefly relights it behind her now.)
    test: (s) =>
      s.room === 'cn-gap' &&
      s.player.grounded &&
      feet(s).y >= 1990 &&
      Math.abs(feet(s).x - 2944) < 400 &&
      s.save.flags.includes('cn-firefly-gap'),
    max: 16000,
    optional: true,
  },
  { name: 'cn-gap: down to the fork', kind: 'exit', exit: 'fork', max: 16000 },
  { name: 'cn-fork: back into the Crossing', kind: 'exit', exit: 'hub', max: 16000 },
  // The wings shelf off the high block's top: only the glide reaches it.
  {
    name: "cn-hub: the wings shelf's great",
    kind: 'goal',
    test: picked('cn-hub', 'shelf-great'),
    max: 16000,
    optional: true,
  },
  { name: 'cn-hub: the seed door', kind: 'exit', exit: 'door', max: 20000 },
  // v9: the glide over the thorn pit (its hawker strikes mid-glide) lands on the den's warning: two beats, the lid opens.
  { name: 'cn-tunnel: the glide over the thorn pit', kind: 'goal', test: flag('cn-tunnel-wave'), max: 16000 },
  {
    name: "cn-tunnel: the den's warning",
    kind: 'fight',
    ids: ['wing-warn-1', 'wing-warn-2', 'juv-warn', 'juv-warn-2', 'burr-warn'],
    seconds: 240,
    until: flag('cn-tunnel-clear'),
  },
  // v8: the firefly's second sighting (her input held while it comes out of the tube's shaft and hangs a cage before
  // the den's mouth), then the cage, cut standing on the root knuckle under it.
  { name: 'cn-tunnel: the firefly hangs a cage over the mouth', kind: 'script', script: '.240' },
  {
    name: 'cn-tunnel: onto the knuckle under the cage',
    kind: 'goal',
    test: near(7552, 1632, 50),
    max: 16000,
  },
  { name: "cn-tunnel: the warning's cage cut open", kind: 'cage', lure: 'trap-warn' },
  { name: 'cn-tunnel: down through the lid to the den', kind: 'exit', exit: 'den', max: 16000 },
  {
    name: 'cn-den: down into the arena',
    kind: 'goal',
    test: (s) => s.room === 'cn-den' && s.player.grounded && feet(s).y >= 1300,
    max: 9000,
  },
  // v9 (r12): the Keeper (the old burrback on the boss framework: the falling moths, the swinging light, the fallen
  // cage); the cage it ripped down lies on the floor, cut open standing. v10 (r14): the roof gives and the escape is
  // on (the rocks, the earth rising under her): up the torn roots, east under the falling roof, the claws up the wall
  // over the heap, out onto the clifftop (the vista). The column's ~3.5 s first, nothing moving.
  { name: 'cn-den: the Keeper', kind: 'fight', ids: ['old-burr'], seconds: 300 },
  { name: 'cn-den: the great cage cut open', kind: 'cage', lure: 'trap-den' },
  { name: 'cn-den: the column, then the roof gives', kind: 'script', script: '.240' },
  { name: 'cn-den: the escape', kind: 'goal', test: flag('cn-den-escaped'), max: 16000 },
  { name: 'cn-den: out onto the clifftop', kind: 'exit', exit: 'out', max: 6000 },
  { name: 'cn-out: the vista', kind: 'script', script: '.200' },
  // The ledge after the boss: down the chimney, a rotten wall in the way out's foot, a great in the room behind it.
  { name: 'cn-out: down the chimney', kind: 'goal', test: near(1088, 1856, 200), max: 12000, optional: true },
  { name: 'cn-out: the rotten wall to the ledge', kind: 'exit', exit: 'ledge', max: 12000, optional: true },
  {
    name: 'cn-ledge: the great',
    kind: 'goal',
    test: picked('cn-ledge', 'ledge-great'),
    max: 12000,
    optional: true,
  },
  { name: 'cn-ledge: back out', kind: 'exit', exit: 'out', max: 12000, optional: true },
  // The way back up: the chimney's three legs, its rotten plug cut from a cling, the clifftop, the glide over the valley.
  {
    name: 'cn-out: the plug and the chimney',
    kind: 'goal',
    test: opened('out-plug'),
    max: 16000,
    optional: true,
  },
  {
    name: 'cn-out: up to the clifftop',
    kind: 'goal',
    test: (s) => s.room === 'cn-out' && s.player.grounded && feet(s).y <= 400,
    max: 16000,
  },
  { name: 'cn-out: the glide over the valley', kind: 'goal', test: flag('cn-area-end'), max: 16000 },
  { name: 'end: hold', kind: 'script', script: '.240' },
];
void near;

// ---- the driver

interface LegLog {
  name: string;
  room: string;
  start: number;
  end: number;
  ok: boolean;
  note: string;
}

class Driver {
  game: Game;
  tape: number[] = [];
  /** Per frame: the room and events worth a chapter line. */
  rooms: string[] = [];
  events: Array<{ f: number; e: SimEvent }> = [];
  log: LegLog[] = [];
  /** Harness edits: before sim frame `f` (the tape's length then), feet at (x, y), or a save flag set. */
  warps: Array<{ f: number; x: number; y: number; why: string; flag?: string }> = [];
  private last: readonly SimEvent[] = [];

  constructor() {
    this.game = new Game(tuning, getRoom(START), 1, () => 0, null, { world });
    this.game.mode = 'manual';
    this.game.afterStep.add((ev) => {
      this.last = ev;
    });
  }

  get s(): GameState {
    return this.game.state;
  }

  push(m: number): readonly SimEvent[] {
    this.tape.push(m);
    this.game.queueInput([m]);
    this.game.stepOnce();
    this.rooms.push(this.game.state.room);
    for (const e of this.last) if (KEEP.has(e.type)) this.events.push({ f: this.tape.length, e });
    return this.last;
  }

  play(tape: readonly number[]): void {
    for (let k = 0; k < tape.length; k++) {
      const m = tape[k] as number;
      if (!this.flung && m & ActionBit.lamp && !(this.s.prevInput & ActionBit.lamp))
        this.firstFling(m, tape, k);
      else this.push(m);
    }
  }

  /** Whether she has pressed the Lamp at a flame yet (the first fling's lesson, below). */
  private flung = false;

  /**
   * The first fling (v7): the explorer presses the Lamp the frame a flame comes into reach, before the Lamp prompt
   * (hud/prompts.ts: in reach `flingAfter`) can show. So the first press waits while the flame stays in reach (up to 5
   * frames, 2 short of its last), and the aim is held a beat longer (time stands still while she aims).
   */
  private firstFling(m: number, tape: readonly number[], k: number): void {
    this.flung = true;
    const before = this.s.prevInput & ~ActionBit.lamp;
    if (flingTarget(this.s, this.game.scene, tuning) >= 0) {
      const probe = cloneState(this.s);
      let reach = 0;
      for (; reach < 12; reach++) {
        step(probe, before, tuning, this.game.scene, [], world);
        if (flingTarget(probe, this.game.scene, tuning) < 0) break;
      }
      for (let d = 0; d < Math.min(5, reach - 2); d++) this.push(before);
    }
    this.push(m);
    if (this.s.player.fling >= 0 && tape[k + 1] === m) for (let h = 0; h < 36; h++) this.push(m);
  }

  /** Replays a saved tape with its teleports (a resumed plan). */
  replay(tape: readonly number[], warps: Driver['warps']): void {
    for (const m of tape) {
      for (const w of warps)
        if (w.f === this.tape.length) {
          if (w.flag) this.setFlag(w.flag, w.why);
          else this.warp(w.x, w.y, w.why);
        }
      this.push(m);
    }
    this.flung = this.events.some(({ e }) => e.type === 'fling');
  }

  warp(x: number, y: number, why: string): void {
    this.game.teleport(x, y);
    this.warps.push({ f: this.tape.length, x, y, why });
  }

  setFlag(flag: string, why: string): void {
    if (!this.s.save.flags.includes(flag)) this.s.save.flags.push(flag);
    this.warps.push({ f: this.tape.length, x: 0, y: 0, why, flag });
  }

  settle(max = 180): void {
    for (let i = 0; i < max; i++) {
      const p = this.s.player;
      if (p.grounded && p.hitstop === 0 && p.contactFrames >= 2 && Math.abs(p.vx) < 1 && p.fling < 0) return;
      this.push(0);
    }
  }

  /** The explorer from where she stands to an exit or a goal; null if no line (creatures in) gets there. */
  search(goalExit: string | undefined, goal: ((s: GameState) => boolean) | undefined, max: number) {
    const a = this.search1(goalExit, goal, max, 'time');
    if (a.tape) return a;
    const b = this.search1(goalExit, goal, max, 'moves');
    return { ...b, nodes: a.nodes + b.nodes };
  }

  search1(
    goalExit: string | undefined,
    goal: ((s: GameState) => boolean) | undefined,
    max: number,
    order: 'time' | 'moves',
  ) {
    const s0 = cloneState(this.s);
    const res = explore({
      scene: this.game.scene,
      tuning,
      start: [s0],
      world,
      maxNodes: max,
      keepLamps: false,
      glow: null,
      creatures: true,
      order,
      more: [...glideClimbMacros(), ...chimneyMacros()],
      barkHp: true,
      ...(goalExit ? { goalExit } : {}),
      ...(goal ? { goal } : {}),
    });
    if (goalExit) {
      const x = res.exits.get(goalExit);
      if (!x) return { tape: null, nodes: res.nodes.size, truncated: res.truncated };
      return {
        tape: [...pathTo(res, x.from).tape, ...x.tape],
        nodes: res.nodes.size,
        truncated: res.truncated,
      };
    }
    let best: ExploreNode | null = null;
    for (const n of res.nodes.values()) if (goal?.(n.state) && (!best || n.frames < best.frames)) best = n;
    if (!best) return { tape: null, nodes: res.nodes.size, truncated: res.truncated };
    return { tape: pathTo(res, best).tape, nodes: res.nodes.size, truncated: res.truncated };
  }

  /** Fight creature ids (or the nearest hostile) until they are down or `frames` pass. */
  fight(ids: string[] | null, frames: number, until?: (s: GameState) => boolean): string {
    let line: Line | null = null;
    let k = 0;
    let name = '';
    let prev = 0;
    let fi = -1;
    const t0 = this.tape.length;
    let hurts = 0;
    let approachFails = 0;
    let lastDeal = t0;
    const skip = new Map<string, number>();
    while (this.tape.length - t0 < frames) {
      const s = this.s;
      // A target she has not hurt in 10 s (a lampwing hovering out of reach) is left for 8 s for another one.
      if (fi >= 0 && this.tape.length - lastDeal > 600) {
        skip.set(s.enemies[fi]?.id ?? '', this.tape.length + 480);
        lastDeal = this.tape.length;
        line = null;
      }
      const i = this.pickFoe(ids, skip, this.tape.length);
      if (i < 0 && until && !until(s)) {
        // (Between beats: the next ones are not woken yet.)
        prev = 0;
        this.push(0);
        continue;
      }
      if (i < 0) return `down in ${((this.tape.length - t0) / 60).toFixed(1)} s, ${hurts} hits taken`;
      const e = s.enemies[i] as GameState['enemies'][number];
      const boss = (e.kind as string) === 'oldBurrback';
      const f = feet(s);
      const dx = Math.abs(e.x + e.w / 2 - f.x);
      const dy = e.y + e.h - f.y;
      const flyer = (e.kind as string) === 'lampwing';
      const far = dx > 480 || (flyer ? dy > 120 || dy < -700 : Math.abs(dy) > 200);
      if (!boss && far && approachFails < 3 && s.player.grounded) {
        // Out of reach: walk there (the explorer, creatures in), a few seconds at a time (it moves).
        const id = e.id;
        const goal = (q: GameState) => {
          const x = q.enemies.find((z) => z.id === id);
          if (!x) return true;
          const ff = feet(q);
          return Math.abs(x.x + x.w / 2 - ff.x) < 300 && Math.abs(x.y + x.h - ff.y) < (flyer ? 700 : 90);
        };
        this.settle();
        const r = this.search(undefined, goal, 5000);
        if (r.tape && r.tape.length > 0) {
          this.play(r.tape.slice(0, 300));
          line = null;
          continue;
        }
        approachFails++;
      }
      if (!boss && far && approachFails >= 3 && s.player.grounded && dy > 200) {
        // (v6: the explorer, creatures in, found no unhurt line down to it (the Grove's wave: she stood on a ledge
        // 440 px over the pit floor for 240 s). Walk off toward it and fight on the floor.)
        const dir = e.x + e.w / 2 < f.x ? ActionBit.left : ActionBit.right;
        for (let n = 0; n < 40 && (n < 4 || !this.s.player.grounded); n++) this.push(dir);
        approachFails = 0;
        line = null;
        continue;
      }
      if (i !== fi || !line || (!boss && k >= 20)) {
        const tactics = fightTactics(this.game.scene, i, 1, 0);
        const cand = boss
          ? (tactics.find((q) => q.name === 'the den') ?? (tactics[0] as (typeof tactics)[number]))
          : this.choose(tactics, i, name);
        if (!(boss && line && i === fi)) {
          line = cand.make();
          k = 0;
          name = cand.name;
        }
        fi = i;
      }
      const m = (line as Line).act(s, k++, prev);
      prev = m;
      const ev = this.push(m);
      if (ev.some((x) => x.type === 'hurt')) hurts++;
      if (
        ev.some(
          (x) => (x.type === 'enemyHit' || x.type === 'enemyDie') && ids?.includes((x as { id: string }).id),
        )
      )
        lastDeal = this.tape.length;
    }
    const up = (ids ?? [])
      .map((id) => this.s.enemies.find((q) => q.id === id))
      .filter((q) => q && q.mode !== 'dead' && !q.gone)
      .map(
        (q) =>
          `${q?.id} ${q?.mode} at ${Math.round((q?.x ?? 0) + (q?.w ?? 0) / 2)},${Math.round((q?.y ?? 0) + (q?.h ?? 0))}`,
      );
    return `not down after ${frames / 60} s (${hurts} hits taken; she is at ${Math.round(feet(this.s).x)},${Math.round(feet(this.s).y)} (${this.s.player.mode}${this.s.player.grounded ? ', standing' : ''}${this.s.player.fling >= 0 ? ', aiming' : ''}); up: ${up.join(', ') || 'none'})`;
  }

  /** fight.ts's look-ahead choice, plus: never a tactic that drops her far below where she stands. */
  choose(
    cands: ReturnType<typeof fightTactics>,
    i: number,
    current: string,
  ): ReturnType<typeof fightTactics>[number] {
    let best = cands[0] as ReturnType<typeof fightTactics>[number];
    let bs = Number.POSITIVE_INFINITY;
    const y0 = feet(this.s).y;
    for (const c of cands) {
      const s = cloneState(this.s);
      const line = c.make();
      const id = s.enemies[i]?.id ?? '';
      const ev: SimEvent[] = [];
      const r = { dealt: 0, taken: 0, killed: false, faded: false, caught: 0, frames: 300, stunned: false };
      let prev = s.prevInput;
      let low = 0;
      let cut = false;
      for (let k = 0; k < 300; k++) {
        const m = line.act(s, k, prev);
        prev = m;
        ev.length = 0;
        step(s, m, tuning, this.game.scene, ev, world);
        for (const x of ev) {
          if (x.type === 'hurt') r.taken++;
          if (x.type === 'enemyHit' && x.id === id) r.dealt += (x as { power?: number }).power ?? 1;
          if (x.type === 'enemyDie' && x.id === id) r.killed = true;
          if (x.type === 'fade') r.faded = true;
          if (x.type === 'fallCatch' || x.type === 'roomExit') r.caught++;
          // (v7: a lamp cut down by the blade is out for good (the save keeps it): the well's hollow lamp, beside
          // the ambush lampwing's post, is the only way to the ambush's shard.)
          if (x.type === 'lureSnuff' && !(x as { fling?: boolean }).fling) cut = true;
        }
        low = Math.max(low, feet(s).y - y0);
        if (r.killed || r.faded) {
          r.frames = k;
          break;
        }
      }
      const sc =
        fightScore(r, c.name) - (c.name === current ? 300 : 0) + (low > 260 ? 5000 : 0) + (cut ? 8000 : 0);
      if (sc < bs) {
        bs = sc;
        best = c;
      }
    }
    return best;
  }

  pickFoe(ids: string[] | null, skip?: Map<string, number>, now = 0): number {
    if (skip?.size) {
      // (Skipped targets only while another one is there to fight.)
      const live = this.s.enemies.filter((e) => ids?.includes(e.id) && !e.gone && e.mode !== 'dead');
      if (live.some((e) => (skip.get(e.id) ?? 0) <= now)) {
        const i = this.pickFoe(ids);
        const others = live.filter((e) => (skip.get(e.id) ?? 0) <= now).map((e) => e.id);
        return others.includes(this.s.enemies[i]?.id ?? '') ? i : this.pickFoe(others);
      }
    }
    const s = this.s;
    const f = feet(s);
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    s.enemies.forEach((e, i) => {
      if (ids && !ids.includes(e.id)) return;
      // (A creature named for the fight counts while it lives, asleep or not: the boss sleeps until she is down.)
      if (ids ? e.gone || e.mode === 'dead' : !hostile(e) || (e.kind as string) === 'carrier') return;
      const d = Math.abs(e.x + e.w / 2 - f.x) + Math.abs(e.y + e.h - f.y);
      if (!ids && d > 1600) return;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /**
   * A cage cut open (v8): under it (or from the run-up `run`: walk to run[0], run to run[1], jump toward it), up cuts
   * until it is out (or 12 tries). The held release (a cage's `hold`) is waited out.
   */
  private cage(id: string, run?: [number, number]): string {
    const sc = this.game.scene;
    const k = (sc.lures ?? []).findIndex((l) => l.id === id);
    const l = sc.lures?.[k];
    if (!l) return `no ${id} in ${sc.id}`;
    const { left: Lb, right: Rb, jump: Jb, up: Ub, attack: Ab } = ActionBit;
    const walkTo = (x: number) => {
      for (let w = 0; w < 300; w++) {
        const fx = feet(this.s).x;
        if (Math.abs(fx - x) < 6 || !this.s.player.grounded) break;
        this.push(fx < x ? Rb : Lb);
      }
      for (let w = 0; w < 8; w++) this.push(0);
    };
    let tries = 0;
    let runY = 0;
    for (; tries < 12 && (this.s.lures.hp[k] ?? 0) > 0; tries++) {
      if (run) {
        // (Back onto the run-up's ground first: a missed jump falls to the floor under it.)
        const y0 = feet(this.s).y;
        if (tries === 0) runY = y0;
        const at = (q: GameState) =>
          q.player.grounded && Math.abs(feet(q).x - run[0]) < 60 && Math.abs(feet(q).y - runY) < 8;
        if (tries > 0 && !at(this.s)) {
          const r = this.search(undefined, at, 6000);
          if (r.tape) this.play(r.tape);
        }
        walkTo(run[0]);
        const d = run[1] > run[0] ? Rb : Lb;
        for (let w = 0; w < 60 && Math.sign(run[1] - feet(this.s).x) === (d === Rb ? 1 : -1); w++)
          this.push(d);
        for (let w = 0; w < 20; w++) this.push(Jb | d);
        this.push(Jb | Ub | Ab);
        for (let w = 0; w < 16; w++) this.push(Jb | Ub);
        for (let w = 0; w < 50; w++) this.push(0);
      } else {
        walkTo(l.x);
        this.push(Ub | Ab);
        for (let w = 0; w < 24; w++) this.push(Ub);
        for (let w = 0; w < 6; w++) this.push(0);
      }
    }
    for (let w = 0; w < 400 && this.s.kit.story > 0; w++) this.push(0);
    for (let w = 0; w < 60; w++) this.push(0);
    const at = `at ${Math.round(feet(this.s).x)}, ${Math.round(feet(this.s).y)}`;
    return (this.s.lures.hp[k] ?? 0) <= 0
      ? `freed in ${tries} tries`
      : `still caged after ${tries} tries (${at})`;
  }

  leg(L: Leg): LegLog {
    const start = this.tape.length;
    const room = this.s.room;
    let ok = false;
    let note = '';
    if (L.kind === 'script') {
      this.play(parseInputScript(L.script));
      ok = true;
    } else if (L.kind === 'warp') {
      this.warp(L.x, L.y, L.why);
      note = L.why;
      ok = true;
    } else if (L.kind === 'flag') {
      this.setFlag(L.flag, L.why);
      note = L.why;
      ok = true;
    } else if (L.kind === 'settle') {
      this.settle();
      ok = true;
    } else if (L.kind === 'cage') {
      note = this.cage(L.lure, L.run);
      ok = note.startsWith('freed') || L.optional === true;
    } else if (L.kind === 'fight') {
      note = this.fight(L.ids, (L.seconds ?? 120) * 60, L.until);
      // (An optional fight that runs out of time leaves the creature be: the route goes on.)
      ok = note.startsWith('down') || L.optional === true;
    } else {
      const test = L.kind === 'goal' ? L.test : undefined;
      const exit = L.kind === 'exit' ? L.exit : undefined;
      // (A detour gets one look: no waiting, no fighting for it.)
      const tries = L.optional ? 1 : 6;
      for (let attempt = 0; attempt < tries && !ok; attempt++) {
        this.settle();
        if (test?.(this.s)) {
          ok = true;
          break;
        }
        const t = Date.now();
        const r = this.search(exit, test, L.max ?? 6000);
        note += `[search ${r.nodes} nodes${r.truncated ? ' trunc' : ''} ${((Date.now() - t) / 1000).toFixed(1)}s ${r.tape ? `${r.tape.length} f` : 'none'}] `;
        if (r.tape) {
          const roomBefore = this.s.room;
          this.play(r.tape);
          for (let w = 0; w < 240 && this.s.exit; w++) this.push(0);
          if (exit && this.s.room !== roomBefore) {
            // Arrived (maybe in the air, rising out of a floor opening): onto ground in this room, not back out.
            const here = this.s.room;
            const sc = this.game.scene;
            // (Ground inside the room: not the lip of the opening she came through on its very edge.)
            const inside = (q: GameState) => {
              const f = feet(q);
              return f.x > 64 && f.x < sc.width - 64 && f.y > 96 && f.y < sc.height - 32;
            };
            const r2 = this.search1(
              undefined,
              (q) => q.room === here && q.player.grounded && inside(q),
              3000,
              'time',
            );
            if (r2.tape) this.play(r2.tape);
            note += `[land ${r2.tape ? `${r2.tape.length} f` : 'none'}] `;
          }
          ok = exit ? this.s.room !== roomBefore : !!test?.(this.s);
          if (!ok) note += '(replay missed!) ';
          break;
        }
        // No line past the creatures: wait a moment (they move), then fight the nearest one, then look again.
        if (attempt % 2 === 0) {
          for (let w = 0; w < 90; w++) this.push(0);
          note += 'wait; ';
          continue;
        }
        const i = this.pickFoe(null);
        if (i < 0) {
          note += 'no foe near; ';
          break;
        }
        note += `fight ${this.s.enemies[i]?.id}: ${this.fight([this.s.enemies[i]?.id as string], 40 * 60)}; `;
      }
    }
    const log = { name: L.name, room, start, end: this.tape.length, ok, note };
    this.log.push(log);
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${L.name} [${room} -> ${this.s.room}] ${((log.end - log.start) / 60).toFixed(1)} s (t ${(log.end / 60).toFixed(0)} s, hp ${this.s.player.hp}) ${note}`,
    );
    return log;
  }
}

const KEEP = new Set([
  'roomEnter',
  'gladeGrant',
  'hollowGrant',
  'seedTaken',
  'stoneRead',
  'hurt',
  'fade',
  'enemyDie',
  'barkBreak',
  'gateOpen',
  'patchRest',
  'mapStation',
  'stoneHung',
  'bossPhase',
  'flagSet',
  'enemyAware',
  'reform',
  'fallCatch',
  'shortcutOpen',
  'enemyPhase',
  'lureSnuff',
  'fling',
  'fireflyStart',
  'fireflyHang',
  'fireflyRelight',
]);

// ---- render

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  const out = resolve(args.out ?? 'playtest-reports/canopy-video');
  mkdirSync(out, { recursive: true });
  const cmd = positionals[0] ?? 'plan';
  if (cmd === 'plan') {
    const d = new Driver();
    const from = args.from ? Number(args.from) : 0;
    if (from > 0) {
      // Resume: replay the saved tape's first legs.
      const prev = JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as {
        legs: LegLog[];
        warps?: Driver['warps'];
      };
      const tape = JSON.parse(readFileSync(join(out, 'tape.json'), 'utf8')) as number[];
      const upto = prev.legs[from - 1]?.end ?? 0;
      d.replay(
        tape.slice(0, upto),
        (prev.warps ?? []).filter((w) => w.f < upto),
      );
      d.log.push(...prev.legs.slice(0, from));
      console.log(`resumed at leg ${from} (frame ${upto}, ${d.s.room})`);
    }
    const t0 = Date.now();
    for (let k = from; k < ROUTE.length; k++) {
      const L = ROUTE[k] as Leg;
      const log = d.leg(L);
      // (formatInputScript writes the lamp as `L+B*3`, which the parser refuses: the raw masks are the tape.)
      writeFileSync(join(out, 'tape.json'), JSON.stringify(d.tape));
      writeFileSync(
        join(out, 'legs.json'),
        JSON.stringify({ legs: d.log, hash: d.game.hash(), frames: d.tape.length, warps: d.warps }, null, 1),
      );
      if ((!log.ok && !('optional' in L && L.optional)) || L.name === args.upto) break;
    }
    writeFileSync(join(out, 'rooms.json'), JSON.stringify(compress(d.rooms)));
    writeFileSync(join(out, 'events.json'), JSON.stringify(d.events));
    console.log(
      `plan: ${d.tape.length} frames (${(d.tape.length / 60 / 60).toFixed(1)} min), ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  } else if (cmd === 'render') {
    await render(out);
    finish(out);
  } else if (cmd === 'finish') finish(out);
}

function compress(rooms: string[]): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  rooms.forEach((r, i) => {
    if (out.at(-1)?.[1] !== r) out.push([i, r]);
  });
  return out;
}

async function render(out: string): Promise<void> {
  const { launch, openGame } = await import('../lib/browser');
  const masks = JSON.parse(readFileSync(join(out, 'tape.json'), 'utf8')) as number[];
  const tape = masks;
  const [w = 1280, h = 720] = (args.size ?? '1280x720').split('x').map(Number);
  const shots = join(out, '.video');
  rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  // Still stretches longer than `still` frames are cut down to that (the sim still steps them).
  const stillMax = Number(args.still);
  const browser = await launch();
  let captures = 0;
  const kept: number[] = []; // sim frame of each capture
  const audio = !!args.audio;
  const url0 = args.url ?? 'http://localhost:5230';
  // (`?manual` keeps the sound off; `?audio` asks for it. The offline render needs no live context either way.)
  const url = !audio ? url0 : url0.includes('?') ? `${url0}&audio` : `${url0.replace(/\/?$/, '/')}?audio`;
  const audioDir = join(out, '.audio');
  const chunks: AudioChunk[] = [];
  if (audio) {
    rmSync(audioDir, { recursive: true, force: true });
    mkdirSync(audioDir, { recursive: true });
  }
  try {
    const page = await openGame(browser, url, { width: w, height: h }, 1, true, START);
    page.setDefaultTimeout(0);
    await page.evaluate(
      // (v7: the key prompts on, as a first-timer sees them: `?manual` turns them off for captures.)
      `(() => { const g = window.__game; g.cam(null); g.debug.labels?.(false); const pr = window.__prompts; if (pr) { pr.enabled = true; pr.reset(); } g.load(); g.input(${JSON.stringify(tape)}); ${audio ? 'g.audio.record(true);' : ''} })()`,
    );
    let done = 0;
    let chunkStart = 0;
    /** Renders the sound of sim frames [chunkStart, end) (plus its warm-up and overlap) to a WAV. */
    const renderChunk = async (end: number, last: boolean) => {
      const from = Math.max(0, chunkStart - AUDIO_WARM);
      const to = last ? done : end + AUDIO_POST;
      const r = (await page.evaluate(
        (o) =>
          (
            window as unknown as { __game: { audio: { render(o: unknown): Promise<unknown> } } }
          ).__game.audio.render(o),
        { from, to, offset: 0, tail: last ? 1.5 : 0.5, sampleRate: AUDIO_SR },
      )) as {
        wavBase64: string;
        renderMs: number;
        stats: { peakDb: number; rmsDb: number; clipped: number };
      };
      const file = join(audioDir, `${String(chunks.length).padStart(3, '0')}.wav`);
      writeFileSync(file, Buffer.from(r.wavBase64, 'base64'));
      chunks.push({ file, from, start: chunkStart, end: last ? Number.POSITIVE_INFINITY : end });
      console.log(
        `  sound ${(chunkStart / 3600).toFixed(1)}-${(end / 3600).toFixed(1)} min: peak ${r.stats.peakDb.toFixed(1)} dBFS, rms ${r.stats.rmsDb.toFixed(1)} dBFS, ${r.stats.clipped} clipped (rendered in ${(r.renderMs / 1000).toFixed(1)} s)`,
      );
      chunkStart = end;
    };
    const canvas = page.locator('#game');
    let still = 0;
    let lastPos = '';
    const t0 = Date.now();
    const total = args.frames ? Math.min(Number(args.frames), masks.length) : masks.length;
    const warps =
      (
        JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as {
          warps?: Array<{ f: number; x: number; y: number; flag?: string }>;
        }
      ).warps ?? [];
    while (done < total) {
      for (const w of warps)
        if (w.f === done && w.flag)
          await page.evaluate(
            (f) => (window as unknown as { __game: { flag(f: string): unknown } }).__game.flag(f),
            w.flag,
          );
        else if (w.f === done)
          await page.evaluate(
            ([x, y]) =>
              (window as unknown as { __game: { teleport(x: number, y: number): unknown } }).__game.teleport(
                x as number,
                y as number,
              ),
            [w.x, w.y],
          );
      const nextWarp = warps.find((w) => w.f > done)?.f ?? Number.POSITIVE_INFINITY;
      const n = Math.min(2, total - done, nextWarp - done);
      const st = (await page.evaluate((k) => {
        const g = (window as unknown as { __game: { step(n: number): unknown; state(): GameState } }).__game;
        g.step(k);
        const s = g.state();
        return { x: Math.round(s.player.x), y: Math.round(s.player.y), room: s.room, frame: s.frame };
      }, n)) as { x: number; y: number; room: string };
      done += n;
      if (audio && done >= chunkStart + AUDIO_CHUNK + AUDIO_POST)
        await renderChunk(chunkStart + AUDIO_CHUNK, false);
      const pos = `${st.room}:${st.x},${st.y}`;
      still = pos === lastPos ? still + n : 0;
      lastPos = pos;
      if (still > stillMax && done > 600 && done < total - 300) continue;
      const shot = await canvas.screenshot({ type: 'jpeg', quality: 88 });
      writeFileSync(join(shots, `${String(captures++).padStart(6, '0')}.jpg`), shot);
      kept.push(done);
      if (captures % 900 === 0)
        console.log(
          `  ${(done / 3600).toFixed(1)} of ${(masks.length / 3600).toFixed(1)} min (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
        );
    }
    if (audio) await renderChunk(done, true);
    const hash = String(await page.evaluate('window.__game.hash()'));
    const legs = JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as { hash: string };
    console.log(`replay ${hash === legs.hash ? 'matches' : `DIFFERS (${hash} vs ${legs.hash})`} the plan`);
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, 'kept.json'), JSON.stringify(kept));
  const wav = join(out, 'audio.wav');
  if (audio) spliceAudio(chunks, kept, wav);
  else rmSync(wav, { force: true });
  ffmpeg([
    '-framerate',
    '30',
    '-i',
    join(shots, '%06d.jpg'),
    ...(audio ? ['-i', wav, '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '24',
    '-preset',
    'slow',
    join(out, 'raw.mp4'),
  ]);
  console.log(`raw.mp4: ${captures} pictures (${(captures / 30 / 60).toFixed(1)} min)`);
}

// ---- the sound (render --audio)

const AUDIO_SR = 48000;
/** Sim frames of sound rendered at a time (the page's offline render of a window of the tape). */
const AUDIO_CHUNK = 7200;
/** Audible frames rendered before a window (reverb, held notes, the score's bar) and after it (the overlap). */
const AUDIO_WARM = 600;
const AUDIO_POST = 90;
/** The cross-fade between windows (samples each side of the seam) and at a cut still stretch (samples). */
const AUDIO_SEAM = AUDIO_SR / 4;
const AUDIO_SPLICE = AUDIO_SR / 200;
/** Samples per sim frame. */
const SPF = AUDIO_SR / 60;

type AudioChunk = { file: string; from: number; start: number; end: number };

/**
 * One track in sim time from the windows (frame f's sound at f / 60 s: a window from step `from` starts at frame
 * from + 1), then cut as the pictures were: picture i plays frames [kept[i], kept[i] + 2) of it.
 */
function spliceAudio(chunks: AudioChunk[], kept: number[], path: string): void {
  const read = (f: string) => {
    const b = readFileSync(f);
    return new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) >> 1);
  };
  const datas = chunks.map((c) => read(c.file));
  const startOf = (c: AudioChunk) => (c.from + 1) * SPF;
  const len = Math.max(...chunks.map((c, k) => startOf(c) + ((datas[k] as Int16Array).length >> 1)));
  const full = new Int16Array(len * 2);
  chunks.forEach((c, k) => {
    const d = datas[k] as Int16Array;
    const s0 = startOf(c);
    const a = c.start * SPF;
    const b = c.end * SPF;
    const first = k === 0;
    const last = k === chunks.length - 1;
    for (let i = 0; i < d.length >> 1; i++) {
      const at = s0 + i;
      // Weight: up across the seam at its start, down across the seam at its end.
      let wt = 1;
      if (!first) wt = Math.min(wt, Math.max(0, Math.min(1, (at - (a - AUDIO_SEAM)) / (2 * AUDIO_SEAM))));
      if (!last) wt = Math.min(wt, Math.max(0, Math.min(1, (b + AUDIO_SEAM - at) / (2 * AUDIO_SEAM))));
      if (wt <= 0) continue;
      for (let ch = 0; ch < 2; ch++) {
        const v = (full[at * 2 + ch] as number) + (d[i * 2 + ch] as number) * wt;
        full[at * 2 + ch] = Math.max(-32768, Math.min(32767, Math.round(v)));
      }
    }
  });
  const per = AUDIO_SR / 30;
  const outS = new Int16Array(kept.length * per * 2);
  const at = (s: number, ch: number) => (s >= 0 && s < len ? (full[s * 2 + ch] as number) : 0);
  let cuts = 0;
  kept.forEach((f, i) => {
    const src = f * SPF;
    const prev = i > 0 ? (kept[i - 1] as number) * SPF + per : src;
    const seam = prev !== src;
    if (seam) cuts++;
    for (let n = 0; n < per; n++)
      for (let ch = 0; ch < 2; ch++) {
        let v = at(src + n, ch);
        // A cut (a skipped still stretch): cross-fade from where the sound would have gone on.
        if (seam && n < AUDIO_SPLICE) {
          const u = n / AUDIO_SPLICE;
          v = v * u + at(prev + n, ch) * (1 - u);
        }
        outS[(i * per + n) * 2 + ch] = Math.round(v);
      }
  });
  const hdr = Buffer.alloc(44);
  const bytes = outS.length * 2;
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + bytes, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(AUDIO_SR, 24);
  hdr.writeUInt32LE(AUDIO_SR * 4, 28);
  hdr.writeUInt16LE(4, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(bytes, 40);
  writeFileSync(path, Buffer.concat([hdr, Buffer.from(outS.buffer, outS.byteOffset, bytes)]));
  console.log(
    `audio.wav: ${(kept.length / 30 / 60).toFixed(1)} min from ${chunks.length} windows, ${cuts} cuts (still stretches)`,
  );
}

// ---- finish: captions and chapters

const ABILITY: Record<string, string> = { wallJump: 'the claws (wall jump)', glide: 'the glide' };
const UPGRADE: Record<string, string> = {
  keenBlade: 'keen blade',
  quickWings: 'quick wings',
  longBreath: 'long breath',
  nightEyes: 'night eyes',
  moonDrop: 'a moonDrop (one more light)',
};
const BARK: Record<string, string> = {
  // v2
  'bank-wall': "Secret: the root clump's wall breaks",
  'cache-floor': 'Secret: a rotten floor breaks',
  'pit-panel': 'A rotten floor breaks',
  'ledge-wall': 'Secret: a rotten wall breaks',
  // v3
  'giant-wall': 'A rotten wall breaks: the way on',
  'rot-panel': 'Secret: a rotten floor breaks',
  'elder-plug': "Secret: the Elder's plug breaks",
  'rot-wall': 'A rotten wall breaks',
  'rot-cache': 'Secret: a rotten wall breaks',
  'crawl-panel': 'Secret: a rotten floor breaks',
  'cellar-panel': 'Secret: a rotten floor breaks',
  'nest-wall': "Secret: the nest's wall breaks",
  'pit-wall': 'Secret: a rotten wall breaks',
  'hollow-wall': 'Secret: a rotten wall breaks',
  'kin-wall': 'Secret: a rotten wall breaks',
  'burrow-panel': 'Secret: a rotten floor breaks',
  // v4
  'niche-wall': 'Secret: a rotten wall breaks',
  'elder-heart': 'The heartwood plug breaks',
  'out-plug': 'The rotten plug breaks: the way up',
  // v7
  'high-wall': 'Secret: a rotten wall breaks (the high chamber)',
  'rot-door': 'Secret: a rotten wall breaks',
};

function eventText(e: SimEvent): string | null {
  const x = e as SimEvent & Record<string, unknown>;
  switch (e.type) {
    case 'gladeGrant':
      return `Ability: ${ABILITY[x.ability as string] ?? x.ability}`;
    case 'seedTaken':
      return `Moonseed ${x.count} of 3`;
    case 'barkBreak':
      return BARK[x.id as string] ?? null;
    case 'hollowGrant':
      return x.upgrade === 'moonShard'
        ? 'Moon shard (three make a light)'
        : `Hollow: ${UPGRADE[x.upgrade as string] ?? x.upgrade}`;
    case 'patchRest':
      return x.room === 'cn-bower' ? 'A save: the bower' : null;
    case 'mapStation':
      return "A rest at the kin's lamp: the map";
    case 'stoneHung':
      return "A moth-stone hung on the kin's lamp";
    case 'lureSnuff':
      return x.id === 'wick-taproot'
        ? "The den's lamp goes out"
        : x.trap
          ? `A cage cut open: ${x.moths} moths freed (${x.total} in all)`
          : null;
    case 'fireflyStart':
      return x.id === 'firefly-gap'
        ? 'The firefly bolts: its hooks catch fire'
        : x.id === 'firefly-warn'
          ? 'The firefly, at the den'
          : x.id === 'firefly-den'
            ? 'The firefly, over the great cage'
            : null;
    case 'fireflyHang':
      return x.lure ? 'It hangs a cage over the mouth, and flees into the den' : null;
    case 'stoneRead':
      return 'Moth-stone: the map is drawn';
    case 'enemyDie':
      return x.id === 'old-burr'
        ? 'The Keeper is down'
        : x.id === 'wing-am' || /^burr-am|juv-am/.test(x.id as string)
          ? null
          : null;
    case 'enemyPhase':
      return x.phase === 2
        ? 'Phase 2: the cage swings; it sees only in its light'
        : x.phase === 3
          ? 'Phase 3: the cage torn down; it feeds on the spilled moths'
          : null;
    case 'gateOpen':
      return x.id === 'seed-door'
        ? 'The seed door opens'
        : x.id === 'den-roof'
          ? "The great cage is out: the den's roof opens"
          : null;
    case 'shortcutOpen':
      return 'A shortcut opens';
    case 'flagSet':
      return x.flag === 'cn-area-end'
        ? 'The way on: end of the Canopy'
        : x.flag === 'cn-grove-wave'
          ? 'The pit wakes: the gates shut'
          : x.flag === 'cn-grove-clear'
            ? 'The wave is down: the gates open'
            : x.flag === 'cn-first-fling'
              ? 'The first fling'
              : x.flag === 'cn-tunnel-wave'
                ? "The den's warning: the arena shuts"
                : x.flag === 'cn-tunnel-clear'
                  ? "The warning is down: the den's lid opens"
                  : x.flag === 'cn-out-vista'
                    ? 'The valley of lamps, the moon, the mountain'
                    : null;
    case 'escapeStart':
      return x.x === undefined ? null : 'The roof gives: out, ahead of it';
    case 'escapeEnd':
      return 'Out from under the den';
    case 'fireflyChase':
      return x.phase === 'back'
        ? 'A fall: back at her last hook'
        : x.phase === 'nest'
          ? 'Into the nest'
          : null;
    case 'fade':
      return 'She fades';
    default:
      return null;
  }
}

/** The commit the video was made from (chapters.md). */
function build(): string {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '?';
}

function finish(out: string): void {
  const kept = JSON.parse(readFileSync(join(out, 'kept.json'), 'utf8')) as number[];
  const rooms = JSON.parse(readFileSync(join(out, 'rooms.json'), 'utf8')) as Array<[number, string]>;
  const events = JSON.parse(readFileSync(join(out, 'events.json'), 'utf8')) as Array<{
    f: number;
    e: SimEvent;
  }>;
  const legs = (JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as { legs: LegLog[] }).legs;
  // Video time (s) of sim frame f: the first picture at or after it.
  const vt = (f: number): number => {
    let lo = 0;
    let hi = kept.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((kept[mid] as number) < f) lo = mid + 1;
      else hi = mid;
    }
    return lo / 30;
  };
  const end = kept.length / 30;
  const ts = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  };
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const title = (id: string) => {
    try {
      return getRoom(id).title ?? id;
    } catch {
      return id;
    }
  };
  // Ambush and boss lines from the leg names.
  const lines: Array<{ a: number; b: number; style: string; text: string }> = [];
  rooms.forEach(([f, id], k) => {
    const next = rooms[k + 1]?.[0];
    const a = vt(f);
    const b = next === undefined ? end : vt(next);
    lines.push({ a, b, style: 'Room', text: title(id) });
  });
  for (const { f, e } of events) {
    const text = eventText(e);
    if (!text) continue;
    const a = vt(f);
    lines.push({ a, b: Math.min(end, a + 3.5), style: 'Event', text });
  }
  const warps =
    (
      JSON.parse(readFileSync(join(out, 'legs.json'), 'utf8')) as {
        warps?: Array<{ f: number; why: string }>;
      }
    ).warps ?? [];
  for (const w of warps)
    lines.push({ a: vt(w.f), b: Math.min(end, vt(w.f) + 4), style: 'Event', text: w.why });
  // A fling: the first in each leg that is not a fight (a fight's flings are its own business).
  for (const L of legs)
    if (!L.note.startsWith('down') && !L.note.startsWith('not down')) {
      const fl = events.find(({ f, e }) => e.type === 'fling' && f >= L.start && f < L.end);
      if (fl)
        lines.push({
          a: vt(fl.f),
          b: Math.min(end, vt(fl.f) + 3),
          style: 'Event',
          text: 'A fling off the lamp',
        });
    }
  for (const L of legs)
    if (/ambush|old burrback|the wave/.test(L.name)) {
      const a = vt(L.start);
      const what = L.name.includes('ambush') ? 'ambush' : L.name.includes('wave') ? 'wave' : 'boss';
      if (what !== 'wave')
        lines.push({
          a,
          b: Math.min(end, a + 3),
          style: 'Event',
          text: what === 'ambush' ? 'Ambush!' : 'Boss: the Keeper',
        });
      if (what === 'ambush')
        lines.push({ a: vt(L.end), b: Math.min(end, vt(L.end) + 3), style: 'Event', text: 'Ambush cleared' });
    }
  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1280',
    'PlayResY: 720',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Room,Helvetica Neue,30,&H00F0F0F0,&H00F0F0F0,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,9,24,24,18,1',
    'Style: Event,Helvetica Neue,26,&H0080E8FF,&H0080E8FF,&H00000000,&H80000000,0,1,0,0,100,100,0,0,1,2,1,9,24,24,58,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines
      .filter((l) => l.b > l.a)
      .sort((p, q) => p.a - q.a)
      .map((l) => `Dialogue: 0,${ts(l.a)},${ts(l.b)},${l.style},,0,0,0,,${l.text}`),
  ].join('\n');
  writeFileSync(join(out, 'captions.ass'), `${ass}\n`);
  const name = args.name ?? 'canopy-playthrough';
  ffmpeg([
    '-i',
    join(out, 'raw.mp4'),
    '-vf',
    `ass=${join(out, 'captions.ass')}`,
    // (The sound, if raw.mp4 has it (render --audio), goes through as it is.)
    '-map',
    '0:v',
    '-map',
    '0:a?',
    '-c:a',
    'copy',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    args.crf ?? '25',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(out, `${name}.mp4`),
  ]);
  // Chapters: one row per leg (merged per room visit), with what happened.
  const rows: string[] = [];
  let lastRoom = '';
  for (const L of legs) {
    // (Detours that did not happen, or were done on the way to the leg before.)
    if (!L.ok || L.end === L.start) continue;
    const t = vt(L.start);
    const room = L.name.split(':')[0] ?? '';
    const what = L.name.slice(room.length + 1).trim();
    const inLeg = events.filter(({ f }) => f >= L.start && f < L.end);
    const evs = inLeg.map(({ e }) => eventText(e)).filter((x): x is string => !!x);
    if (!/^(not )?down/.test(L.note) && inLeg.some(({ e }) => e.type === 'fling'))
      evs.unshift('a fling off a lamp');
    const fightNote = L.note.startsWith('down') ? ` (${L.note})` : '';
    const roomCell = room === lastRoom ? '' : room.startsWith('cn-') ? `${title(room)} (\`${room}\`)` : room;
    lastRoom = room;
    rows.push(
      `| ${mmss(t)} | ${roomCell} | ${what}${fightNote}${evs.length ? `: ${[...new Set(evs)].join('; ')}` : ''} |`,
    );
  }
  writeFileSync(
    join(out, 'chapters.md'),
    [
      `# ${args.title}`,
      '',
      `\`${name}.mp4\`: ${mmss(end)}, 1280x720, 30 fps, real-time speed. Build ${build()}${args.layout ? ` (${args.layout})` : ''}, world \`canopy\` from a fresh save in \`cn-hatch\`; the follow camera at zoom 1, glints and HUD on. Played by a bot (tools/playtest/route-video.ts): one input tape, every ability, seed and flag earned in play, fights fought for real${warps.length ? ', except where marked' : ''}. Still stretches over 1.5 s are cut short.`,
      ...(warps.length
        ? [
            '',
            `Harness edits (captioned in the video): ${warps.map((w) => `${mmss(vt(w.f))} ${w.why}`).join('; ')}.${warps.some((w) => !(w as { flag?: string }).flag) ? ' A teleport re-creates her with the base maximum, so she can lose a light there.' : ''}`,
          ]
        : []),
      '',
      '| time | room | what happens |',
      '|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log(`${name}.mp4 and chapters.md written (${mmss(end)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
