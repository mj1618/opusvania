# Progression validator (`npm run progression`, `tools/progression/`)

Proves the world has no softlocks and every gate holds (PLAN §4.3, world-design.md §3.2 G7).

```
npm run progression                      # full run: progress/progression/progression.{md,json,dot,svg} + evidence tapes, refreshes the cache
npm run progression -- --out docs/reports/progression.md
npm run progression -- --check           # the npm run check subset: cache-backed, read-only, fails on errors not in the baseline
npm run progression -- --design <file.md|file.json>   # repeatable; default tests/progression/gym-world.json + docs/design/world-design.md
```
Options: `--budget` (300k; check 150k), `--combo-budget` (2×budget), `--workers`, `--semantics world,gym`,
`--no-probes`, `--no-cache`, `--trust-stale`, `--baseline`, `--json`, `--quiet`.

World rooms with `draft: true` (content/world.compiled.json) are skipped. Edge exits (`edge` entities)
are exits like doors: target `exit:<side><from>`, arrival spawn `edge-<side><from>` (level-authoring.md).

## Pieces
- `world.ts` extracts the graph through `roomLayout()` in the sim adapter: exits (doors; G → `next`), entries
  (spawns other rooms arrive at + `default`), pickups (explicit `pickups` + each room's `abilities` as an
  implicit `grant:<room>` pickup at the entry), Rests, gates/locks, palette (seizable source colours + enemy
  voices), hazards. Also the static **gravity-free flood fill**: an over-approximation, so "not in the fill"
  is a proof of unreachability (sources are solid without Seize, white always; a plate gate stays shut
  without Seize, or Seize+Levy for slab-only plates).
- `oracle.ts`: "from spawn/tile, with abilities A, can you reach target T?" → yes (tape) / no (proof) /
  unknown (not found in budget). Order: static proof → cache → committed tapes (`tests/replays`, same
  start + seed, abilities ⊆ A) → bot search in worker threads (`pool.ts`, `job.ts`, `worker.ts`).
- **Monotonicity axiom:** extra abilities never remove options (a player can choose not to use them), so a
  yes with S ⊆ A answers A (the tape is replayed with S), and an exhausted no with S ⊇ A answers A. This is
  what makes world-semantics queries (full kit, 25 macros) nearly free after the gym ones.
- `solver.ts`: BFS over states (room, location, abilities). `world` semantics = Phase 3 (abilities persist,
  grants add); `gym` = today's sim (a room SETS the abilities). Room "kit" = abilities held when taking the
  exit into it. Softlock = reachable state that can't reach the start room or a Rest; **proven** only when
  nothing in its forward closure was merely "not found in budget". `strip` removes abilities from every
  grant (G7).
- `audit.ts` (gate audit): per key K of each gate/lock, G7 kits = the maximal kits in that room when K is
  removed from the game (teachGate: the minimal = earliest-visit kits); plus "full kit minus K" as a
  warning-level future-proof check. Bypasses get minimal ability combos (level by level, skipping supersets
  of known bypasses; static proofs prune most) and evidence tapes in `<out>-evidence/`.
- `probes.ts` (in-room traps / one-way drops): every ledge (2 free tiles over ground) statically reachable
  from an entry that reaches an exit: can it get back to the entry spawn or any exit? If not and it's
  reachable → trap. Starts from a fresh room load placed on the ledge (`placePlayer`), an approximation.
- `intended.ts`: the design graph = **world-design.md §4.8 JSON** (version 1 or 2). Symbolic solve over
  abilities × flags × fever; checks reachability (rooms behind abilities nothing grants are "later returns",
  info), goals with and without sanctioned breaks, Corner softlocks, teachGate-guards-a-grant (if the gate
  leaked, would any grant come with a smaller kit?), Corner spacing, reach-edge `proof` arithmetic against
  `reach-table.json` (§3.1 numbers; a palette only counts with Seize AND Levy), and the G7 plan. Then the
  diff against built rooms (same ids): missing/unplanned links, G7 bypasses of ability-keyed edges (built
  kits, bot evidence), blocked links, sequence breaks (built kit smaller than every designed kit incl.
  sanctioned breaks) and harder-than-designed rooms.

## Design-graph format and our interpretations
- Tokens: `ability:x`, `flag:x` (ids may contain colons), `fever>=N`, `local:<colour>`, `weight:<class>`
  (heavy/middle need brown in the palette), `trick:x` (only on `sanctionedBreak` edges). Room `grants`:
  `ability:x`, `flag:x`, `fever:N`, `item:x`, collected on entry. `opens` sets a flag on traversal.
  Corner = `corner: true` or purpose `rest`; stubs count as safe. `zoneOf` nodes aren't rooms.
- `local:`/`weight:` on the reverse of a `both` edge accept either room's palette (lenient; no false softlocks).
- A reach gate's palette = `gate.roomPalette` / `gate.approachPalette` if given, else the FROM room's.
  Say which when the gated span is in the to-room or a sound-free segment.
- Our extensions (ignored by the designer's grammar): `via` / `viaBack` (`door:<char>` | `G`) pin an edge
  to a built exit; `sim: {abilities: {design: sim}, base: [...]}` maps names (default slip→dash,
  ropeSkip→doubleJump, ropes→wallJump; `pogo` is base = the jab kit's down-jab). Unmapped abilities
  (writ, hueAndCry, satchel) are "not in the sim yet".
- `tests/progression/gym-world.json` is the gym + L3 rooms written in this format (strict: its findings
  are errors). The slice design only warns until its rooms are built.

## Room annotations (all optional; schema in `src/sim/world/rooms.ts`, see gym-rooms.md)
`gates.<c>.requires` / `hold` / `moves`; `locks: {name: {target, requires, moves, hold: reach|sealed, teachGate,
from, prelude, region, note}}`; `pickups: {c: {grants, id}}`; `rests: {c: {name}}`; a `+` Corner is a Rest.
- **Aim checks (`moves`, L4 merge):** `["seize:up"]` etc. = aimed moves (a `moveStart` move:dir) the gate
  should need. The audit asks for the target with the ROOM's own kit and that move forbidden (bot option
  `forbid`: prunes a state where it started; tapes that use it are rejected), plus a control query with
  nothing forbidden. "holds" with a failed control is only "the bot found nothing" (a note says so).
  The bot is weak at aim puzzles, so back a pass with a scripted sweep and put any bypass in
  `tests/replays` (committed tapes are evidence: see yard-bar-wall.fwd-seize).
- **`prelude`** = input DSL played from `from` before the search (the Yard's locks start after section A
  or B, else the bot never gets that far). With a prelude, committed tapes count only if they begin with it.
A tile gate's audit target is derived:
the tiles next to it that are cut off from the spawn when it's shut. `region` bounds the audit's bot so it can
EXHAUST (a proof; G7 asks for that): bounded searches compute the full reachable key set (no frame cap),
which costs ~250k nodes for a 6×9-tile pit, ~37k for a 1-tile well.

## Cache, check mode, baseline
- `tests/progression/cache.json` (committed): records keyed by room-file hash + start + target (+ region),
  each with the ability set, verdict, tape, budget and **engine** fingerprint (src/sim minus the room list,
  enemies, moves, sim-adapter, headless, input script, bot search, job.ts). Editing one room re-searches
  only that room. Another engine: yes records are re-verified by replaying their tape (ms); no/unknown are
  re-searched in full runs and trusted (counted "stale") in `--check`. Run `npm run progression` after
  changing rooms or sim code so check stays at ~0.3 s.
- `tests/progression/baseline.json`: accepted findings (id + reason). Check fails only on new errors; it
  prints "fixed?" for baseline entries it no longer finds.

## Combat rooms (L4 merge): how they are modelled
- A clear gate (`opensOn: clear`) is never a static blocker (the jab is free) and the search bot can't
  fight, so an arena's G is proven by the combat fighter's committed seed-1 tapes (`<room>.signature.s1`,
  `the-pit.jabOnly.s1`): they play the real fight, so "reached" = the sim's own room completion
  (`roomClear` opens the gate). Seed-2+ tapes are not evidence (the oracle runs seed 1). A new arena
  needs such a tape or its G reads unreached. gym-world.json marks these edges `soft: "combat"`.
- Counted Out (Chin 0 → the hub's Corner) is NOT modelled as an exit: softlock checks demand a real one.
- Locked lots (`locked: true`) are not in the palette and never block the static fill (the boss sells them).
- Trap probes start on the ledge tile nearest the middle that is free in a fresh room (the Auction's exit
  ledge spans the shut clear gate: starting inside it read as a proven trap).

## Results and timings (L4 merge, 25 rooms)
- Full run ~160 s cold on 8 workers (audit 66 s, probes 91 s); warm re-run and `--check` ~0.5 s.
- Everything reachable in both semantics, no softlocks; the arenas' G come from fight tapes.
- **Lot 7 spring hall FAILS G7** (world semantics): minimal bypasses {wallJump, seize} and {doubleJump,
  seize} (the L3 audit's finding, now systematic). Holds under gym semantics (the room sets {seize,levy}).
  Gate D holds by static proof (no Seize → no plate). Baselined.
- **Yard bar-wall FAILS its aim check** (baselined): a forward Seize at the top of a running jump takes bar 1,
  so section B doesn't need Up+Seize. Yard gate D holds (static); the ledge (Down+Levy) holds: a scripted
  sweep of 9.7k forward/up/neutral levy timings never reached G (control with Down+Levy: 22/2.4k).
- **Stairwell G is reachable, but frame-perfect**: tests/replays/stairwell.chain.json. The chain needs the
  spring retaken on the frame after it launches Kid (Down+Seize pressed exactly 4 frames before contact:
  one earlier takes it before the bounce, one later whiffs); without it the bounce apex is ~15 px short of
  bar 2. The bot (k=4 macros) can't hit that; the blind novice got stuck there. Design fix if wanted: bars
  6 tiles apart (then each bar is in Up+Seize reach from the previous spring's apex).
- Probes: the only traps left are "suspected" (budget) warnings in the Stairwell, Yard and Pit.
- The slice design (v2): X3/X5 are later returns (Writ, Ropes); e13's proof ignores B5's brown+violet
  (recoil hops add 4.5 tiles of gap) unless the span is in B6; e33 counts the Rostrum boss voices.
