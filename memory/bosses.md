# Bosses: the framework and the Weaver (2026-10-18)

The wood's boss built in greybox from wood.md §6 (draft 2) and creatures.md §3/§5. Sim: `src/sim/boss/` (`core.ts`
shared pieces, `index.ts` the framework, `weaver.ts` the Weaver, `data.ts` the room block's types),
`src/sim/boss-events.ts`; data: `src/scene/boss.ts` (Zod + checks); render: `src/render/greybox/boss.ts`; lab
`?room=lab-weaver`; tests `tests/unit/boss.test.ts`; bot `tools/playtest/weaver-bot.ts`, runner `weaver-run.ts`.

## Room data (`boss` block; ids name the room's own lures and creatures)
```json
"boss": { "id": "the-weaver", "kind": "weaver", "name": "The Weaver",
  "arena": {x,y,w,h}, "lock": [{id,x,y,w,h}], "flag": "wood-weaver-down", "met": "wood-weaver-met",
  "creature": "weaver", "heart": "heart", "rings": ["ring-1",..."ring-5"], "retryOut": ["ring-1","ring-5"],
  "web": "spokes", "drops": [664,1512,1088], "canopy": 1088, "floor": 2176,
  "lowered": {x,y}, "relight": "wick-relit" }
```
- Lures: the heart `kind: "great"`, the rings `kind: "ring"` (a wick whose moths feed the heart: 0 each, the heart 60).
- Enemies: `{kind: "weaverBoss"}` at the heart's x, y (checked); the spokes `{kind: "web", strands: heart -> each ring,
  anchors: [[heartX, heartY]]}` (`anchors`: a point that holds strands like a solid: cut one spoke, only it falls).
- `arena` = the lock trigger (her WHOLE box inside); `lock` doors must sit on its edge, outside it. The lock is not a
  kit gate: `lockedScene` adds the doors as solids (`kit: 'gate'`) while `boss.locked`.
- `lab-weaver` puts the arena at wood-grove's exact coordinates (x 0-2176, y 1088-2304), so the level builder can
  copy the solids, lures, enemies and block. Differences: the lab's door is in the EAST trunk at floor level with an
  antechamber + patch behind it (wood-grove's entry is west, its patch P6 in wood-web); the lab's flags are
  `lab-weaver-*`. The curtain is an ordinary kit gate on `flag`.

## The framework (any boss)
- `state.boss` (room-local, `createBoss` in `createLocal`): `stage` wait -> intro -> fight / shift -> end -> down.
- **Lock**: her whole box in `arena` -> `bossLock`, `met` saved, `intro` cues. Doors open on defeat and on a fade.
- **Phase table**: `BossRules.phases` (name, exam) -> `bossPhase`. **Cue timelines**: tuning
  (`weaverBoss.cues.<set>.<cue>: frame`), fired in frame order (`bossCue`), handed to `BossRules.cue`.
- **Retry**: a fade re-forms her at the patch (src/sim/index.ts calls `resetBoss` after `resetEnemies`): the boss is
  rebuilt as on a fresh entry; `met` in the save makes it a retry (`retryOut` rings start as husks).
- **Defeat** (`defeat`): `flag` saved (+ `flagSet`), heart and rings into `save.snuffed`, their moths into
  `save.moths` (60), doors open, `defeat` cues; `done` -> `down` for good. Boss lures are NOT saved when snuffed
  mid-fight (`bossOwnsLure` in lures.ts), so a lost fight starts over.
- **Lures a boss drives**: `state.lures.live` (`row` = the tuning row it pulls by now, `dx/dy` = its flame moved,
  `shield` = the blade passes through). Every lure rule goes through `flameAt` / `lureRowNow`.
- The creature is an ordinary `KindRules` kind with two new hooks: `undying` (at 0 hp a hit, not a death: the fight
  decides) and `tough` (no stagger). `span` holds its phase (P3's blocks need it).
- Debug jumps: `jumpBoss(state, scene, t, n, events)` / `__game.boss({phase: n})`.

## The Weaver: phases, timings, tells (60 Hz; numbers in `tuning.weaverBoss`)
| phase | exam | what | tell -> live | open |
|---|---|---|---|---|
| P1 the ring | glide, climb | snuff 5 ring flames (3 on a retry: rings 2-4); each drops its spoke and heals 1; spokes are a gentle Caught (4 beats) | caught in the heart's core: eyes count 60 f -> bite 10 f, 1 dmg | none (it sits on the heart; every cut glances) |
| P2 the drops | read the arc, move | 3 pivots in turn (664, 1512, 1088); thread 1010, reach 650 (side pivots 500: the arc never enters a trunk); drops to the end away from the safe side, swings end to end and back to the bottom; `p2Hp` 6 cuts | arc + floor band 45 f, drop 18 f, swing 60 f (live from the drop) | winded 90 f hanging; a cut through the thread drops it stunned 120 f |
| P3 the floor | pogo | lunge to where she stands + 80 (240..560 px at 11 px/f); winded abdomen up 60 f: only a pogo lands, one a window; then skitters to the far trunk, climbs to y 1700, drops back onto her x on a thread; `p3Hp` 3 pogos | lunge band 30 f; drop landing band 30 f | winded 60 f (pogo) |
| P4 the heart | snuff | it flees; the heart lowers to (1088, 1792) over 90 f, unguarded, `greatWide` row (R 1100); 3 cuts | - | - |
Shifts (nothing attacks): p1end 130 f (spokes fall, it climbs), p2end 100 f (it falls; the heart flares at 40), p3end
130 f. Intro: name card at 20, fight at 80. Defeat: burst 12, curtain 90, relight 170, done 230.
- Contact is live only during bite / drop / swing / lunge / P3's standing and lunge tell; winded, stunned, climbing,
  skittering, perched and the shifts are harmless. The next P2 drop is always on the other side from where it last
  hung (the order does the forgiving).

## Why these numbers (measured headless; `npx tsx tools/playtest/weaver-run.ts [--trace] [--retry]`)
- **The heart's pull bites late** (`sharp` 4 on `great` / `greatWide`: depth k^8; 0.05 px/f² at 320 px, 0.3 at 200,
  1.5 at 100). At the spec's lantern profile (0.2 -> 2.3, R 700) her sideways drift saturated at 12 px/f (faster than
  her run) and no column face could even be reached from the branch; at k^4 she still could not return to C1 after a
  kick. `sharp` is a new per-row field (rows got `sharp: 1`).
- **Order teaches itself**: the ring-1 / ring-5 spokes cross the climbs from B1 / B2 to the columns (a grab), so the
  outer rings go first (from the floor: jump + up cut under them); rings 2 / 4 hang one kick out from the column
  faces: climbing kicks you into them, and a cut on the kick (or caught + mash the blade + cut on the way out) snuffs.
  Ring 3: kick-glide from high on a column.
- **Swings inside the arena**: at pivot 448 half the spec's ±40° arc was inside the west trunk; pivots 664 / 1512
  with the reach capped by the walls cover just over half each.
- **P3 lunge reaches** (wood.md had a flat 240): a player 300 px back was never touched and P3 was waiting.

## Results (2026-10-18)
- Perfect bot: wins in ~63 s from the lock (P2 at 20 s, P3 at 41 s, P4 at 56 s), 0 hits; a retry reaches P3 at 34 s.
- First-timer hands (`--first`: band-only reading, 35-40 % slips): react 20 f -> 0 hits; react 30 f -> median 2 hits,
  all won first attempt. The fight is forgiving to anyone who reads the tells; damage comes from misreads.
- Persona bots (`npm run playtest -- --room lab-weaver`): useless here (no climb, no lamp verb, no air targets): the
  planners give up on every flame in 5-10 s; naive walks into the antechamber's wall.

## Not done / weak
- No real character art; the spider is its box + leg lines. The P2 swing is fast at the bottom (~50 px/f).
- First-timer numbers are a bot's guess: needs the first-timer agent and Matt.
- The lab's door is east (wood-grove's is west): P2's first drop is on the far side from a west entry too.
- No audio cues for the tells (sound is muted until Matt approves anyway).
