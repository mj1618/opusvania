# Signature mechanic (L3: Seize / Levy / bag / weight) — sim side

Brief: docs/design/seize-levy-experiment.md. Verdict: `npm run l3:verdict` (docs/reports/L3-verdict.md).

- **Step order**: see memory/sim-architecture.md (L4 added shots, Kid's Count and hazards; Chin 0
  is no longer a reload but her Count, memory/combat.md).
- **Room-local state** `state.local` is rebuilt by every `loadRoom` (= regeneration). `nextId` lives
  IN `local` so a reload deep-equals a fresh load (the fuzzer asserts this).
- **One sound-source component** (`src/sim/sources.ts`): `local.sources[]` holds objects, enemies AND
  levied objects; seize asks a per-kind handler for a priority and delegates the take. Owner of a
  sound = source id (not enemy id). Repossessed/KO enemies stay in `local.enemies` (inert).
- **Dynamic solids** (`src/sim/world/dynamic.ts`): module scratch Int32Array rebuilt each step from
  state; `dynSolidAt(x,y,w,h,exclude)`. Plates are solid TILES (always solid); sources, gates, enemy
  spawns load as empty tiles. A slab that materialises mid-step calls `addDynSolid` so enemies moving
  later in the same step can't walk into it (the fuzzer caught that).
- **Bounces applied outside the controller** (levy recoil before movement, springs after it) use
  `launchPlayer`: vy = -(speedForHeight(g, px) + g), so after the next gravity tick it is the exact
  jump integrator (spring = 448 px exactly; a plain vy = -v loses v px).
- **Levy spawn**: fwd offset (44,24) is the thrown box's TOP-LEFT (mirrored); up/down are centred.
  A projectile doesn't move on its spawn step (`born`), so point-blank throws hit-test where they
  appear — this is what makes Return-to-sender work on the 48-px Barker.
- Springs launch Kid every contact, but each spring launches a given enemy only once (else a slow
  Grinder trampolines for seconds). Chasers stop at a body gap (`combat.chaseGapPx`), and Barkers
  hop only toward a GROUNDED Kid (otherwise every dodge-jump became a contact hit).
- **Weight** is derived only while `abilities.seize` (gym rooms keep their debug profile). Rooms
  with seize start at `feather` (= the L2 base, `profiles.feather = {}`).
- Movement is never blocked by a move; a jump/dash only ENDS the move once `cancels` allows it.
- **Fingerprint**: `tools/lib/build-info.ts` hashes `src/sim/**` plus `content/gym`, `content/enemies`
  and `content/moves.json`, so a frame-data edit reads as "older build", not a determinism bug.
- **Tapes**: expert tapes are hand-scripted (a local search over segment lengths, same optimiser for
  Lot 7 and the control), then `npm run tape -- trim`. The verdict's integrity guard re-trims.
- **Tools**: `npm run fuzz -- --room R [--no-verbs]`, `npm run policy -- --policy signature --seeds 1-20`,
  `npm run clip -- --tape X --skip N --frames M --study` (L3 events are sheet keyframes).
- **Findings**: Lot 7 flows (route A 290 f vs control 280 f, 0% stillness). Pit policies are chaotic:
  small behaviour changes swing clear times 2x; contact damage + a 12-step reaction delay dominate.
- L4: the forward Seize box reaches the floor ([28,8,64,72]) so a spring thrown short can be taken
  back on foot (the novice's soft-lock); the verdict tapes still pass.
