# Progression validator report

Generated 2026-09-28 09:25 by `npm run progression` (full mode) on build 4647c8a1ec-dirty, engine d3f836ab18. 8 search workers, default budget 300000 nodes. Tool: `tools/progression/`; how to read it: `memory/progression.md`.

## Summary

| Check | World semantics (Phase 3: abilities persist) | Gym semantics (today: each room sets them) |
|---|---|---|
| Rooms reachable from the start | 19/19 | 19/19 |
| Exits (doors, G) reached | 35/36 | 35/36 |
| Softlocks (proven / suspected) | 0 / 1 | 0 / 1 |
| States explored | 35 | 19 |

- **Gate audit:** 3 annotated gates, 1 failing, 0 warning (full-kit bypass only).
- **Trap probes:** 271 ledges probed, 0 proven traps, 0 suspected.
- **Findings:** 6 errors (6 not in the baseline `tests/progression/baseline.json`), 1 warnings.
- **Run time:** extract 0.0 s, solve 8.3 s, audit 44.4 s, probes 31.0 s, design 0.0 s, total 83.7 s.

![World graph](progression.svg)

Green: reached (world semantics). Red: not reached. Orange: a softlock or trap in the room. Purple border: a failing gate. Dashed edge: exit never reached.

## Findings

| Level | Baseline | Finding |
|---|---|---|
| error | **NEW** | [world] exit stairwell/G never reached: not found in 300000 nodes |
| error | **NEW** | [world] suspected softlock: stairwell at spawn:default with {wallJump, dash, doubleJump, pogo, seize, levy} can't get back to the start or a Rest (path: hub/exit:S) |
| error | **NEW** | [gym] exit stairwell/G never reached: not found in 300000 nodes |
| error | **NEW** | [gym] suspected softlock: stairwell at spawn:default with {seize, levy} can't get back to the start or a Rest (path: hub/exit:S) |
| error | **NEW** | gate lot-7/lock:spring-hall: G7 minus levy {wallJump, dash, doubleJump, pogo, seize} bypasses it; minimal: {wallJump, seize} or {doubleJump, seize} |
| error | **NEW** | diff tests/progression/gym-world.json: blocked: stairwell-G stairwell -> hub (stairwell/G): the solver never reached stairwell/G (unknown) |
| warning |  | design docs/design/world-design.md: every non-stub room reachable from start: X3: unreachable |

## Gate audit

Each key ability K of a gate must be necessary. **G7** (governs): the target must be unreachable with every kit the player can still have in that room when K is removed from the game (the bag empties on room exit, so the kit is abilities plus the room's own palette, which the bot sim contains). **Full kit**: every sim ability except K (future-proofing). **G3/G8**: a reach gate may not share a room with pink unless pink is the key, and then it must be a teachGate.

### lot-7/gate:D: **PASS**

- Tile gate D (opens on plate), sealed; requires {seize}; target `rect:2560,448,128,320` from spawn default (far side of gate D: tiles x 40-41, y 7-11).
- Room palette: {brown, pink}.

| Key removed | Basis | Kit | Result | Minimal bypass combos (evidence) |
|---|---|---|---|---|
| seize | G7 | {wallJump, dash, doubleJump, pogo, levy} | holds: unreachable (static proof) |  |

### lot-7/lock:spring-hall: **FAIL**

- Lock "spring-hall", reach, teachGate; requires {levy}; target `rect:1536,512,64,256` from spawn default.
- Room palette: {brown, pink}. Note: The 6-tile hall is climbed on a pink levy spring (L3 brief §4.2); the upper corridor must need Levy (L3 audit item 3).

| Key removed | Basis | Kit | Result | Minimal bypass combos (evidence) |
|---|---|---|---|---|
| levy | G7 | {wallJump, dash, doubleJump, pogo, seize} | **BYPASSED** (166 f) | {wallJump, seize} 166 f [tape](progression-evidence/lot-7.lock.spring-hall.wallJump+seize.json); {doubleJump, seize} 156 f [tape](progression-evidence/lot-7.lock.spring-hall.doubleJump+seize.json) (22 combos tried) |

<details><summary>Bypass tapes (input DSL)</summary>

- {wallJump, seize}: `R+J8 R4 R+J4 R12 R+J8 R4 R+J4 R+S4 .4 R8 R+J20 R4 .4 R+J20 R8 R+J4 J4 R+J20 R4 J4 R+J4 R10`
- {doubleJump, seize}: `R+J8 R12 R+J12 .4 R4 R+J4 R+J+S4 J8 R+J8 R4 R+J12 R8 R+J4 R4 R+J4 R4 R+J4 R8 R+J4 J4 R+J4 J4 R4 J4 R+J4 J4 R+J4 R4`

</details>

### stairwell/lock:top: **PASS**

- Lock "top", reach, teachGate; requires {seize, levy}; target `G` from spawn default.
- Room palette: {pink}. Note: Expression room: the climb is the up-seize / down-levy spring chain.

| Key removed | Basis | Kit | Result | Minimal bypass combos (evidence) |
|---|---|---|---|---|
| seize | G7 | {wallJump, dash, doubleJump, pogo, levy} | holds: unreachable (static proof) |  |
| levy | G7 | {wallJump, dash, doubleJump, pogo, seize} | holds: not found in 300000 nodes |  |

## Reachability: world semantics

Abilities persist and only grow. A room's declared `abilities` are an implicit pickup (`grant:<room>`) collected on entry; explicit `pickups` where they stand. Kit = abilities held when taking the exit into the room.

| Room | Reached | Kit on arrival (minimal) | Exits (evidence) |
|---|---|---|---|
| hub | ✓ | {none} | exit:1→gym-01 ✓ (cache)<br>exit:2→gym-02 ✓ (cache)<br>exit:3→gym-03 ✓ (cache)<br>exit:4→gym-04 ✓ (cache)<br>exit:5→gym-05 ✓ (cache)<br>exit:6→gym-06 ✓ (cache)<br>exit:7→gym-07 ✓ (cache)<br>exit:8→gym-08 ✓ (cache)<br>exit:9→gym-09 ✓ (cache)<br>exit:A→gym-10 ✓ (cache)<br>exit:B→gym-11 ✓ (cache)<br>exit:C→gym-12 ✓ (cache)<br>exit:D→gym-13 ✓ (cache)<br>exit:E→gym-14 ✓ (cache)<br>exit:L→lot-7 ✓ (cache)<br>exit:K→lot-7-control ✓ (cache)<br>exit:T→the-pit ✓ (cache)<br>exit:S→stairwell ✓ (cache) |
| gym-01 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-02 ✓ (tape: tests/replays/gym-01.none.json) |
| gym-02 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-03 ✓ (tape: tests/replays/gym-02.none.json) |
| gym-03 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-04 ✓ (tape: tests/replays/gym-03.none.json) |
| gym-04 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-05 ✓ (tape: tests/replays/gym-04.none.json) |
| gym-05 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-06 ✓ (tape: tests/replays/gym-05.none.json) |
| gym-06 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-07 ✓ (tape: tests/replays/gym-06.none.json) |
| gym-07 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-08 ✓ (tape: tests/replays/gym-07.wallJump.json) |
| gym-08 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-09 ✓ (tape: tests/replays/gym-08.wallJump.json) |
| gym-09 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-10 ✓ (tape: tests/replays/gym-09.none.json) |
| gym-10 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-11 ✓ (tape: tests/replays/gym-10.dash.json) |
| gym-11 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-12 ✓ (tape: tests/replays/gym-11.doubleJump.json) |
| gym-12 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-13 ✓ (tape: tests/replays/gym-12.pogo.json) |
| gym-13 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-14 ✓ (tape: tests/replays/gym-13.all.json) |
| gym-14 | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/gym-14.all.json) |
| lot-7 | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/lot-7.heavy.json) |
| lot-7-control | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/lot-7-control.json) |
| the-pit | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/the-pit.jabOnly.s1.json) |
| stairwell | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✗ not found in 300000 nodes |

**Softlocks:**

- Suspected: stairwell at spawn:default with {wallJump, dash, doubleJump, pogo, seize, levy}; path hub/exit:S.

## Reachability: gym semantics

What the sim does today: entering a room sets the abilities to the room's declared set.

| Room | Reached | Kit on arrival (minimal) | Exits (evidence) |
|---|---|---|---|
| hub | ✓ | {none} | exit:1→gym-01 ✓ (cache)<br>exit:2→gym-02 ✓ (cache)<br>exit:3→gym-03 ✓ (cache)<br>exit:4→gym-04 ✓ (cache)<br>exit:5→gym-05 ✓ (cache)<br>exit:6→gym-06 ✓ (cache)<br>exit:7→gym-07 ✓ (cache)<br>exit:8→gym-08 ✓ (cache)<br>exit:9→gym-09 ✓ (cache)<br>exit:A→gym-10 ✓ (cache)<br>exit:B→gym-11 ✓ (cache)<br>exit:C→gym-12 ✓ (cache)<br>exit:D→gym-13 ✓ (cache)<br>exit:E→gym-14 ✓ (cache)<br>exit:L→lot-7 ✓ (cache)<br>exit:K→lot-7-control ✓ (cache)<br>exit:T→the-pit ✓ (cache)<br>exit:S→stairwell ✓ (cache) |
| gym-01 | ✓ | {wallJump, dash, doubleJump, pogo} | G→gym-02 ✓ (tape: tests/replays/gym-01.none.json) |
| gym-02 | ✓ | {none} | G→gym-03 ✓ (tape: tests/replays/gym-02.none.json) |
| gym-03 | ✓ | {none} | G→gym-04 ✓ (tape: tests/replays/gym-03.none.json) |
| gym-04 | ✓ | {none} | G→gym-05 ✓ (tape: tests/replays/gym-04.none.json) |
| gym-05 | ✓ | {none} | G→gym-06 ✓ (tape: tests/replays/gym-05.none.json) |
| gym-06 | ✓ | {none} | G→gym-07 ✓ (tape: tests/replays/gym-06.none.json) |
| gym-07 | ✓ | {none} | G→gym-08 ✓ (tape: tests/replays/gym-07.wallJump.json) |
| gym-08 | ✓ | {wallJump} | G→gym-09 ✓ (tape: tests/replays/gym-08.wallJump.json) |
| gym-09 | ✓ | {wallJump} | G→gym-10 ✓ (tape: tests/replays/gym-09.none.json) |
| gym-10 | ✓ | {none} | G→gym-11 ✓ (tape: tests/replays/gym-10.dash.json) |
| gym-11 | ✓ | {dash} | G→gym-12 ✓ (tape: tests/replays/gym-11.doubleJump.json) |
| gym-12 | ✓ | {doubleJump} | G→gym-13 ✓ (tape: tests/replays/gym-12.pogo.json) |
| gym-13 | ✓ | {pogo} | G→gym-14 ✓ (tape: tests/replays/gym-13.all.json) |
| gym-14 | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/gym-14.all.json) |
| lot-7 | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/lot-7.heavy.json) |
| lot-7-control | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/lot-7-control.json) |
| the-pit | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✓ (tape: tests/replays/the-pit.jabOnly.s1.json) |
| stairwell | ✓ | {wallJump, dash, doubleJump, pogo} | G→hub ✗ not found in 300000 nodes |

**Softlocks:**

- Suspected: stairwell at spawn:default with {seize, levy}; path hub/exit:S.

## In-room trap probes

271 (room, entry, kit, ledge) probes: 270 ledges get back to their entry or an exit, 1 stuck ledges are not reachable anyway, 0 traps. 31.0 s.


## World graph (extracted from room data)

| Room | Grant | Entries | Exits | Pickups / Rests | Gates | Palette | Hazards |
|---|---|---|---|---|---|---|---|
| hub | {wallJump, dash, doubleJump, pogo} | default | exit:1→gym-01, exit:2→gym-02, exit:3→gym-03, exit:4→gym-04, exit:5→gym-05, exit:6→gym-06, exit:7→gym-07, exit:8→gym-08, exit:9→gym-09, exit:A→gym-10, exit:B→gym-11, exit:C→gym-12, exit:D→gym-13, exit:E→gym-14, exit:L→lot-7, exit:K→lot-7-control, exit:T→the-pit, exit:S→stairwell | - | - | {none} | - |
| gym-01 | {none} | default | G→gym-02 | - | - | {none} | - |
| gym-02 | {none} | default | G→gym-03 | - | - | {none} | - |
| gym-03 | {none} | default | G→gym-04 | - | - | {none} | 45 spikes |
| gym-04 | {none} | default | G→gym-05 | - | - | {none} | 24 spikes |
| gym-05 | {none} | default | G→gym-06 | - | - | {none} | - |
| gym-06 | {none} | default | G→gym-07 | - | - | {none} | - |
| gym-07 | {wallJump} | default | G→gym-08 | - | - | {none} | - |
| gym-08 | {wallJump} | default | G→gym-09 | - | - | {none} | 10 spikes |
| gym-09 | {none} | default | G→gym-10 | - | - | {none} | 8 spikes |
| gym-10 | {dash} | default | G→gym-11 | - | - | {none} | 15 spikes |
| gym-11 | {doubleJump} | default | G→gym-12 | - | - | {none} | 10 spikes |
| gym-12 | {pogo} | default | G→gym-13 | - | - | {none} | 28 spikes, 5 orbs |
| gym-13 | {wallJump, dash, doubleJump, pogo} | default | G→gym-14 | - | - | {none} | 23 spikes, 2 orbs |
| gym-14 | {wallJump, dash, doubleJump, pogo} | default | G→hub | - | - | {none} | 12 spikes |
| lot-7 | {seize, levy} | default | G→hub | - | gate:D {seize} sealed, lock:spring-hall {levy} reach | {brown, pink} | - |
| lot-7-control | {none} | default | G→hub | - | - | {none} | - |
| the-pit | {dash, seize, levy} | default | G→hub | - | - | {brown, pink} | barker barker grinder |
| stairwell | {seize, levy} | default | G→hub | - | lock:top {seize, levy} reach | {pink} | - |

## Design graph: tests/progression/gym-world.json

19 rooms, 36 edges. Symbolic solve (abilities × flags × fever): 19 non-stub rooms reachable, 0 not. 1 ms.

Every design check passes.

**G7 plan** (kits each reach gate must fail against once built; the room palette is part of the kit):

| Edge | Key | Kits without the key (+ room palette) | Sim kits |
|---|---|---|---|
| stairwell-G stairwell→hub (teach) | seize | {dash, doubleJump, levy, pogo, wallJump} + {pink} | {wallJump, dash, doubleJump, pogo, levy} |
| stairwell-G stairwell→hub (teach) | levy | {dash, doubleJump, pogo, seize, wallJump} + {pink} | {wallJump, dash, doubleJump, pogo, seize} |

**Diff against the built rooms:**

| Level | Kind | Subject | Detail |
|---|---|---|---|
| error | blocked | stairwell-G stairwell -> hub (stairwell/G) | the solver never reached stairwell/G (unknown) |

## Design graph: docs/design/world-design.md

29 rooms, 38 edges. Symbolic solve (abilities × flags × fever): 23 non-stub rooms reachable, 1 not. 7 ms.

| Level | Check | Subject | Detail |
|---|---|---|---|
| error | every non-stub room reachable from start | X3 | unreachable |

**Sanctioned breaks:**

- e16: adds: B11 with {levy, seize, slip}; B12 with {levy, seize, slip}; B13 with {levy, seize, slip}; B14 with {levy, seize, slip, flag:boss, fever 1}; B15 with {levy, seize, slip, flag:boss, fever 1}; X2 with {levy, seize, slip, flag:boss, fever 1}; EX_FOUNDRY with {levy, seize, slip, flag:boss, fever 1}

**G7 plan** (kits each reach gate must fail against once built; the room palette is part of the kit):

| Edge | Key | Kits without the key (+ room palette) | Sim kits |
|---|---|---|---|
| e06 B2→B3 (teach) | levy | {seize} + {pink, white} | {pogo, seize} |
| e12 B6→B7 | slip | {levy, seize, flag:shortcut:storeLatch} + {brown, violet} | {pogo, seize, levy} |
| e20 B11→B12 | ropeSkip | {levy, seize, slip, flag:boss, flag:shortcut:dumbwaiter, flag:shortcut:storeLatch, fever 1} + {none} | {dash, pogo, seize, levy} |
| e28 T1→EX_ROW | ropes | {levy, ropeSkip, seize, slip, flag:boss, flag:shortcut:dumbwaiter, flag:shortcut:storeLatch, fever 1} + {none} | {dash, doubleJump, pogo, seize, levy} |
| e32 B15→EX_RECEIVERSHIP | hueAndCry | {levy, ropeSkip, seize, slip, flag:boss, flag:shortcut:dumbwaiter, flag:shortcut:storeLatch, fever 1} + {none} | key not in the sim yet |

<details><summary>Notes</summary>

- G7: e15: reach edge with no ability key (flag/fever/weight only): the bot proof needs the built room
- G7: e17: reach edge with no ability key (flag/fever/weight only): the bot proof needs the built room

</details>

**Diff against the built rooms:**

| Level | Kind | Subject | Detail |
|---|---|---|---|
| info | not-built | 24 rooms | T1, T2, T3, T4, B1, B2, B3, B4, B5, B6, B7, B8, B8a, B9, B10, B11, B12, B13, B14, B15, X1, X2, X3, X4 |
| info | not-designed | 19 rooms | built but not in the design: hub, gym-01, gym-02, gym-03, gym-04, gym-05, gym-06, gym-07, gym-08, gym-09, gym-10, gym-11, gym-12, gym-13, gym-14, lot-7, lot-7-control, the-pit, stairwell |

## Oracle and timings

Queries 511: static proofs 22, cache hits 191, inferred by monotonicity 164, committed tapes 79, bot searches 55 (83.6 s wall), tapes re-verified 123, stale records trusted 0.

