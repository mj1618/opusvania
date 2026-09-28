# L3 brief: the Seize / Levy greybox experiment (*Tallage*)

Status: **ready to build**. Owner: systems design. Date: 2026-09-28.
Decides whether the signature mechanic (Seize, Levy, weight classes) survives. Kill criteria come from `docs/concepts/critique-L1-A.md` §2 and are restated in §6 as a decision rule that an agent can compute.
Inputs: PLAN §2, `raw-L1-p4.md` Concept A, both critiques, `docs/design/combat-spec.md` (especially §7), `docs/design/movement-spec.md`, and the memory notes. Where those sources disagree, this brief resolves it; see §8.
Conventions follow the movement spec: 60 Hz, 64 px tiles, the 40×80 body, px/f, frames, and an integer-AABB Actor model. Every number below is a starting value. Numbers go in `tuning.ts` or in `content/*.json`, never inline.

---

## 0. One-paragraph goal

Build Seize, Levy, the 3-slot bag and derived weight classes **as the combat versions** (combat-spec §7), on the shared foundations Phase 2 will reuse. Then build the rooms and measurements that answer one question: **does the signature verb keep you moving, or does it turn play into pick-up-and-place?** The answer comes from `npm run l3:verdict`, which prints PASS / IMPROVE / KILL. Reviewer agents confirm the result by re-running it, and nobody has to play the game.

**Build order (kill-relevant first).** If the loop runs out of time, M1 alone still settles the kill question (checks B and C).

| Milestone | Contents | Checks it unlocks |
|---|---|---|
| **M1: sim core and traversal** | Sound model, sound sources, bag, Seize, Levy (brown and pink), levied entities, weight profiles, global hitstop, dynamic solids, plates and gates, input bits and DSL, Lot 7, the control room, tapes, `tape trim`, bot and fuzz extensions | A1–A5, B1–B3, C1–C3, F1 |
| **M2: The Pit** | Box module, move table (Jab), Chin/hurt/i-frames, enemy framework (Barker, Grinder), RETRIEVE/Snatch/revoice, knockdown and the Count, attack tokens, `signature` and `jabOnly` policies | D1–D3 |
| **M3: readability** | Outline renderer, levied entities, enemy cues, bag HUD, `__game.render.rects()`, the E checks e2e test | E1–E3 |
| **M4: verdict and polish** | `l3:verdict`, audio router cases, clip markers, Stairwell (stretch), trailer tape | the decision |

---

## 1. Scope: build now vs defer

### 1.1 Build now (shared foundations; nothing here gets rebuilt in Phase 2)

| Combat-spec §7 item | L3 builds | Notes |
|---|---|---|
| **Move table** `content/moves.json` plus `src/sim/player/moves.ts` (a generic action state machine) | Entries for `jab`, `seize` and `levy` only. Covers startup, active and recovery; per-direction hitboxes; the `cancels` graph; `ACTION_BUFFER_FRAMES` 8; and "direction is read on the start frame". Uses combat-spec §1.3 numbers. | Cross, Uppercut, Overhand and Swallow are later entries in the same table. |
| **Box module** `src/sim/combat/boxes.ts` | Overlap, per-instance hit lists, the facing mirror `x' = 40 − x − w`, and the resolution order (§2.5) | Used by jab, seize, enemies and levied objects |
| **Sound model** `src/sim/sound.ts` | `Sound {id, colour, kind: voice\|deed, owner, status, at, awayFrames}`. Statuses: home → bag → levied/flight → home. Conservation invariant. Revoice after 480 f (voices only). | `consumed` exists in the type but only Swallow (deferred) uses it. |
| **Sound-source component** | **One** component for humming walls, furnaces, static, enemies **and levied objects**: `{id, soundIds, open(), onSeize, onReturn}` | Anti-rework rule: no `if (target is wall)`. Every seize target goes through it. |
| **Bag** | 3-slot FIFO: newest out, oldest pushed back on overflow (`bagPush`), returned on room exit, weight class derived from it | Leak zones are deferred (no static *zones* in L3 rooms). |
| **Levied entities** | Brown **slab** (becomes a Solid once landed) and pink **spring**, both Actors on the movement physics. `owner`, `dmg` and `hitList` are set now. | Violet **dart**: the colour exists in the enum and data, but L3 rooms have no violet source. |
| **Global hitstop** | `state.hitstop`, max-merge, cap 16. During it, presses latch into the movement buffers and the action buffer, and nothing else runs. | This generalises the movement spec's dash freeze. |
| **Events** | The combat-spec §2 names, subset in §2.4 | Render and audio use only these. |
| **`player.bounce`** | Used for the spring bounce and the down-Levy recoil hop | The existing pogo path |
| **Enemy framework** `src/sim/ai/{schema,enemy}.ts`, `content/enemies/*.json` | Generic FSM: PATROL, CHASE, TELEGRAPH, ACTIVE, RECOVERY, RETRIEVE, ABSORB, STAGGER, LAUNCHED, DOWN, COUNT, REPOSSESSED, RISE, KO. Attack tokens (max 2). Zod `telegraph ≥ 15`. | **Barker** (Lunge plus Snatch) and **Grinder** (Charge plus Snatch) |
| **Kid combat** | Jab; Chin 5; hurt with knockback, a 12 f lock and 78 f i-frames; contact damage; the dash gets i-frames on frames 1–10 (Slip). At 0 Chin: the existing `death` → reload the room. | |
| **Input** | `seize` and `levy` bits (appended), DSL letters `S` and `V`, bindings (§3) | |
| **Debug API** | `state().combat = {chin, bag, weight, hitstop, iframes}`, `state().enemies`, `state().sounds`, `__game.spawn(type, x, y)` (a Game method that **records a replay op**), and `__game.render.rects()` (new, for the E checks). `step`, `state`, `input` and `load` stay intact. | |
| **Outline renderer** | One draw function per status (humming, ghost, pending) used by walls, enemies and levied objects; plus the bag HUD with ribbons (§5) | Pixi Graphics is fine for now. The GLSL "hum" filter can replace it later behind the same function. |

### 1.2 Defer (and where it goes)

| Deferred | When |
|---|---|
| Cross, Uppercut, Overhand (the D+A airborne pogo keeps the movement pogo path), Counter, clean slip | Phase 2 |
| Swallow, Hoarse, Ringing, Beat the Count, the Runner and Lien, Poundage | Phase 2 |
| Violet dart gameplay, Stock Gull, Clerk, the Grinder's Sparks (Whet, violet) | Phase 2 (they need violet) |
| White-static **leak zones** (`bagLeak` every 180 f) | Phase 2 / Static Flats |
| "No off-screen attack starts" (T5: the sim needs the camera rect) | Phase 2. Both L3 combat rooms are one screen. |
| Fever, Furious rise modifiers beyond `speedMult` and `telegraphDelta` | Phase 2 |
| Weigh-in gates as a world system, water sinking, the Corner Satchel, the Writ, the Standing Count, Passive voice | Phase 3+ (combat-spec §8) |
| Hazard damage with safe-ground respawn (L3 rooms have no spikes) | Phase 2 |

---

## 2. Data model and sim architecture

### 2.1 Files

```
src/sim/sound.ts               Sound model, bag ops (take, pushOldest, returnAll), conservation check
src/sim/sources.ts             sound-source component; builds object sources from room chars
src/sim/levied.ts              levied Actors: flight, landing, materialise-when-clear, spring bounce
src/sim/combat/boxes.ts        hitbox/hurtbox overlap, mirror, hit lists, resolution order
src/sim/combat/hitstop.ts      request(cls) -> max-merge; the per-step freeze
src/sim/combat/kid.ts          Chin, hurt, i-frames, knockback, Slip i-frames
src/sim/player/moves.ts        action state machine over content/moves.json (jab, seize, levy)
src/sim/player/weight.ts       brown count -> class -> setProfile (emits profileChange)
src/sim/ai/schema.ts, enemy.ts Zod enemy schema (combat-spec §4.1) and the generic FSM
src/sim/world/gates.ts         plates, gates, room-clear
content/moves.json, content/enemies/{barker,grinder}.json, content/gym/{lot-7,lot-7-control,the-pit,stairwell}.json
```
`src/sim/index.ts#step` orchestrates the order in §2.5. `updatePlayer` stays the movement controller. Its collider gains dynamic solids (§2.6) and nothing else.

### 2.2 State (`GameState.version` becomes 3)

Everything below is plain JSON: arrays sorted by `id`, integer ids from `state.nextId`, no Maps or Sets.

| Path | Shape | Notes |
|---|---|---|
| `hitstop` | int | Frames of global freeze left |
| `nextId` | int | Entity and sound ids |
| `local` | `{sources, sounds, levied, enemies, bag, plates, gates, clear}` | **Room-local.** `loadRoom` rebuilds it from the room data every time, which gives regeneration and C3's "re-entry" for free. |
| `local.sources[]` | `{id, kind: 'object'\|'enemy'\|'levied', rect, soundIds, solidWhenArmed, ghost, pendingSolid}` | Object sources come from connected components of one source char. A levied object is a source too, so a spring or slab can be re-seized. |
| `local.sounds[]` | `{id, colour: 'brown'\|'pink'\|'violet'\|'white', kind: 'voice'\|'deed', owner, status: 'home'\|'bag'\|'levied'\|'flight', at, awayFrames}` | `at` is the levied entity id when levied. White is never seizable. |
| `local.bag` | `number[]` (sound ids, oldest first) | Length ≤ `bag.slots` |
| `local.levied[]` | Actor `{id, soundId, colour, owner, x, y, rx, ry, w, h, vx, vy, phase: 'flight'\|'landed', solid, dmg, hitList}` | |
| `local.enemies[]` | `{id, type, x, y, rx, ry, vx, vy, facing, state, stateFrame, hp, attackId, rattled, stagger, beat, token, target, hitList}` | Sound status lives in `local.sounds`, not duplicated here. |
| `local.plates[]`, `local.gates[]`, `local.clear` | `{char, tiles, pressed, by}`, `{char, tiles, open, opensOn}`, bool | Plates latch for the room visit. |
| `player.move` | `{id, frame, dir: 'fwd'\|'up'\|'down', facing, outcome: 'none'\|'take'\|'whiff'\|'guard'\|'refused', hitList} \| null` | `frame` 1 is the press-consuming step. |
| `player.actBuf` | `{id, frames} \| null` | Only the newest buffered action is kept |
| `player.chin, iframes, hurtLock` | int | |
| `player.profile` | `'feather'\|'middle'\|'heavy'` | Derived from the bag each step via `setProfile` (it emits `profileChange`). `base` stays valid for tests. |

### 2.3 Tuning keys (`src/sim/tuning.ts`; new groups are added to `VALUE_GROUPS` so the panel edits them)

| Group.key | Start value | Source |
|---|---|---|
| `combat.hitstop.{light,medium,heavy,seizeTake,catch,repossess,hurt}` | 4, 6, 10, 5, 10, 16, 8 | spec §2 |
| `combat.hitstopCap` | 16 | |
| `combat.actionBufferFrames`, `rattledFrames`, `staggerFrames` | 8, 30, 36 | |
| `combat.enemyKb.{light,medium,heavy,seizeTug}`, `enemyKbDecay` | 6, 10, 14, 4 px/f; 1 | |
| `combat.kidRecoil.{groundLight,airLight,medium,frames}` | −4, −6, −5, 4 | |
| `combat.maxAttackTokens`, `retrieveSpeedMult`, `absorbFrames`, `revoiceFrames` | 2, 1.25, 8, 480 | |
| `combat.downFrames`, `countBeats`, `countBeatFrames` | 12, 10, 12 | fever 0 |
| `combat.returnMult`, `launchVy`, `launchFrames` | 1.5, −14, 30 | |
| `combat.eliteRiseHpFrac` | 0.25 | §8 #6 |
| `kid.{chin,contactDmg,iframes,hurtLock,hurtVx,hurtVy,slipIframesTo}` | 5, 1, 78, 12, 10, −8, 10 | |
| `bag.slots` | 3 | |
| `levy.brown.{vx,vy,gravityMult,dmg,w,h,dropVy,recoilPx}` | 8, −10, 1.2, 6, 64, 48, 24, 176 | spec §1.5 |
| `levy.pink.{vx,vy,gravityMult,dmg,w,h,springPx,recoilPx,enemyLaunchVy}` | 6, −12, 1, 2, 64, 16, **448**, 128, −14 | springPx deviates from spec (§8 #4) |
| `levy.violet.*` | spec values | Not exercised in L3 |
| `weight.middleAt`, `weight.heavyAt` | 1, 2 brown sounds | |
| `weight.kbTaken.{feather,middle,heavy}`, `weight.heavyPunchBonus`, `weight.featherJabRecovery` | 1.25, 1, 0; 1; −2 | |
| `plate.minOverlapPx` | 16 | |
| `profiles.feather` | `{}` (**identical to the L2-tuned base**) | Replaces the placeholder |
| `profiles.middle` | `shape {jumpHeightPx: 224, apexFrames: 22}`, `scale {'jump.fallMult': 1.1, 'run.maxSpeed': 0.95}` | 3.5 tiles |
| `profiles.heavy` | `shape {jumpHeightPx: 160, apexFrames: 20}`, `scale {'jump.fallMult': 1.3, 'run.maxSpeed': 0.85, 'wall.slideMax': 1.5}` | 2.5 tiles |

- **Frame data** (startup, active, recovery, hitboxes, cancels) goes in `content/moves.json`. **Enemy data** goes in `content/enemies/*.json`. Both are validated with Zod.
- The spring and recoil launch speeds come from `speedForHeight(g, px)` (uses `sqrt`, which is exact). They're computed once per step in the params resolver, never with `pow`.

### 2.4 Events (added to the `SimEvent` union; names from combat-spec §2)

| Event | Fields | Consumers |
|---|---|---|
| `moveStart` | `move, dir, x, y` | render pose, A1 |
| `whiff` | `move, reason?` (`'down'` = a punch on a downed enemy) | audio, B3 |
| `hit` | `cls, move, target, dmg, x, y, dir` | flash, sparks, audio `hit` |
| `hitstop` | `frames, cls` | A4/T7 (new; makes the check event-only) |
| `seizeTake` | `soundId, colour, kind, owner, x, y` | ribbon, ghost outline, **audio `hum.seize(soundId)`** |
| `seizeGuarded`, `seizeRefused` | `target, x, y` | white flash; audio `seizeRefused` |
| `catch` | `enemy, attackId, x, y` | gold flash |
| `ghost` | `source, on` (source went ghost or re-solidified) | outline swap (new) |
| `levyThrow` | `soundId, colour, dir, x, y` | audio `hum.fly` |
| `levyLand` | `soundId, colour, x, y` | audio `levyLand<Colour>`, dust |
| `levyDry`, `recoilHop` | `x, y` / `colour, x, y` | |
| `bagPush` | `soundId, colour, owner` | ribbon back to the source; audio re-hum at source |
| `snatch`, `absorb`, `revoice`, `retrieve` | `soundId, enemy` | tether line; D1 (`retrieve` is new) |
| `hurt` | `dmg, src, x, y` | |
| `telegraph` | `enemy, attackId, colour, frames` | tint and pulses; D3/T4 |
| `attackActive`, `down`, `countTick{beat}`, `repossess`, `rise`, `ko` | `enemy` | Count ring |
| `plate` | `char, by: 'slab'\|'heavy'` | C2 |
| `gateOpen`, `roomClear` | `char` / — | |
| `profileChange` (existing) | `from, to` | weight glyph, silhouette, audio thud |

**Audio contract.** The audio module (commit `231dc3d`, currently on a worktree branch) exposes `HumVoice` (`seize`, `levy`, `setPosition`, `stop`; status `humming | carried | flying | stopped`), `content/audio/hums.json` per colour (with `land` → `levyLand{Brown,Pink,Violet,White}`), and the sfx `seize` and `seizeRefused`. Its router doesn't handle these events yet. L3 adds these router cases, and they only read the sim:
- `roomEnter`: one `HumVoice` per `local.sounds` entry whose status is `home`, with id = soundId, at the source centre.
- `seizeTake`: `hum.seize(player)`. `seizeRefused`: play `seizeRefused` at the target.
- `levyThrow`: a new `hum.fly()` (whoosh, status `flying`); `update()` then positions it from `state.local.levied`.
- `levyLand`: a new `hum.land()` (the colour's `land` sfx, then re-hum).
- `bagPush`, `snatch`, `absorb`, `revoice`: re-hum at the owner.
- Sound names stay the audio module's camelCase names. The dotted names in combat-spec §2 are descriptive only.
- The existing `HumVoice.levy(target)` stays for `__game.audio`.
- If the audio branch hasn't merged when L3 starts, skip this. No check below depends on audio.

### 2.5 Per-step order (normative)

1. **Transition.** As now.
2. **Hitstop.** If `hitstop > 0`: decrement it, latch presses (movement buffers, plus `actBuf` with its counter **not** decremented), and return. No timers run (including i-frames and awayFrames). Nothing moves.
3. **Rebuild the derived solid list** (§2.6).
4. **Kid action.**
   - A new press (or `actBuf`) starts a move if it's legal: not busy, or a cancel from the `cancels` graph.
   - Otherwise the move advances one frame. Direction is read on the start frame.
   - Levy spawns its projectile on frame 4.
5. **Movement.** `updatePlayer` (the unchanged L2 controller). During `hurtLock`, `inX = 0` and jump and dash aren't accepted.
6. **Levied entities.** Update in id order: flight integrates (gravity × `gravityMult`) → landing → becomes `landed`. A slab becomes `solid` only when it overlaps no actor ("materialise when clear"; retried every frame). A pink spring anchors on the first top-surface contact, or instantly under Kid's feet for a down-Levy in the air.
7. **Enemies.** Ascending id: FSM, movement (Actors on tiles, one-ways and dynamic solids), token acquire and release.
8. **Resolution** (combat-spec §3.1):
   1. Kid's active hitboxes vs enemies, then sources, then levied objects.
   2. Enemy hitboxes vs Kid. A Catch in step 1 cancels them.
   3. Levied projectiles vs enemies.
   4. Spring contacts (Kid and enemies).
   5. Plates, then gates, then `roomClear`.
9. **Hitstop.** Apply the max of this step's requests (cap 16). Emit one `hitstop` event.
10. **Weight.** Derive the weight class from the bag and call `setProfile`. The new profile applies from the next step.
11. **Bookkeeping.** Revoice counters, `rattled`, `iframes`, `stateFrame`s. Then `prevInput` and `frame++`.

**Seize target priority** when several targets overlap the box:
1. An enemy in TELEGRAPH (a Catch).
2. An open enemy.
3. A downed enemy (repossess).
4. A levied object.
5. An object source.

Ties go to the nearest centre, then the lowest id.

White targets give `seizeRefused` (whiff recovery). A guarded enemy gives `seizeGuarded` (1 dmg, light hitstop, whiff recovery). A take ghosts the source **on the same step**: `ghost` fires and its solid rect leaves the list at step 3 of the next step. Collision has already changed before the player next moves.

### 2.6 Dynamic solids and collision

- Room tiles are immutable (`Room.tiles` is shared and not in state). Source chars (`H`, `F`, `W`), gate chars and plates load as **empty** tiles. Their solidity lives in state.
- Each step, rebuild a flat module-level scratch array `solidRects` from state. It holds:
  - armed sources with `solidWhenArmed && !ghost`;
  - landed slabs with `solid`;
  - closed gates;
  - plate tiles (always solid).
- The array is a pure function of state, is never persisted, and is allocation-free (reuse the buffer).
- `Ctx.blockedX`, `blockedY` and `groundAt` call `solidAt(...) || dynSolidAt(solidRects, x, y, w, h)`. Enemies and levied objects use the same function.
- **No closures in this path** (bot throughput; see memory/movement-controller.md).
- Sources re-solidify (FIFO push-back, re-absorb) only when no actor overlaps them. Until then `pendingSolid` is set and retried each step, so nothing is ever crushed.
- One-ways (`=`) behave for enemies exactly as for Kid.

### 2.7 Determinism rules (on top of memory/sim-architecture.md)

- No `sin`, `cos`, `pow`, `**`, `exp` or `atan2` under `src/sim` (the purity test already bans them). Use `sqrt` via `speedForHeight`. No bobbing flyers in L3.
- Iterate arrays in id order. Never use object-key order for gameplay order. Emit events in resolution order.
- Randomness comes only from `state.rng`. Enemy attack picks are a weighted pick with no immediate repeat. Tools such as the fuzzer and policies use their own seeded RNG *outside* the sim.
- **Append** the `seize` and `levy` bits to `ACTIONS` (bits 10 and 11), so every existing tape mask keeps its meaning.
- **Build fingerprint:** extend `tools/lib/build-info.ts` so `sim` hashes `src/sim/**` **and** the gameplay content (`content/gym`, `content/moves.json`, `content/enemies`). Otherwise a frame-data edit shows up as "SAME sim build, determinism bug".
- `__game.spawn` and any debug state edit go through a `Game` method that records a replay op.
- Re-record the gym goldens after the tuning and state changes (`npm run replays:update`). Their **behavioural** expects must pass unchanged. That is the movement regression check. `feel:report` for `opus` at feather must equal the L2 table.

---

## 3. Input mapping

| Action (sim bit) | Verb | Keyboard, arrows layout | Keyboard, WASD layout | Pad (standard mapping) | DSL |
|---|---|---|---|---|---|
| `jump` | Jump | Z / Space | K | South (0) | `J` |
| `dash` | Slip | X / Shift | L / Shift | RB, RT (5, 7) | `X` |
| `attack` | Jab (D+A airborne = pogo, the existing path) | C | J | West (2) | `A` |
| `seize` (bit 10, new) | Seize | **V** | **I** | **North (3)** | **`S`** |
| `levy` (bit 11, new) | Levy | **B** | **O** | **East (1)** | **`V`** |
| `special` | Swallow (deferred) | Q | Q | LB, LT (4, 6) | `H` (later) |

- **Aim** (combat-spec §1.1): read the held d-pad or stick on the move's **start** frame. Held Up → `up`. Held Down while airborne → `down`. Otherwise `fwd` (held L/R, or facing). Down on the ground counts as `fwd`.
- The stick uses the existing deadzone rules. 8-way Levy is deferred.
- DSL examples: `S1` seize forward, `U+S1` up-seize, `R+J12 D+V1` jump then down-levy. Pressing the same button twice needs a gap (`S1 .1 S1`).
- Bot macros (added): `S US DS LS RS V UV DV LV RV RJS RJV`. Macros that need an ability are dropped when the room or claim removes `seize` or `levy`.
- `Abilities` gains `seize` and `levy`, both optional in Zod and defaulting to `false`. Gym rooms are unchanged. The L3 rooms set them to `true`.

---

## 4. Rooms

### 4.1 Schema additions (`RoomFileSchema`, keeping the ASCII-in-JSON format)

New optional maps, keyed by single characters (like `doors`). The characters must not clash with tiles or doors.

```jsonc
"sources": { "H": {"sound": "partition", "colour": "pink"},      // each connected component = 1 deed source
             "F": {"sound": "furnace",   "colour": "brown"},
             "W": {"sound": "static",    "colour": "white"} },   // solid, hums, never seizable
"plates":  { "_": {"pressedBy": ["slab", "heavy"]} },            // solid tile; latches for the visit
"gates":   { "D": {"opensOn": "plate"} },                         // or "clear" (all enemies KO/repossessed)
"enemies": { "b": "barker", "q": "grinder" },                     // content/enemies/<id>.json; feet on this tile's floor
"abilities": { ..., "seize": true, "levy": true },
"claims":  { "G": {"with": ["seize","levy"], "without": ["seize","levy"]} }   // each `without` checked separately
```

**Plate rule.** A plate is pressed when either:
- a landed slab's bottom rests on plate tiles with horizontal overlap ≥ `plate.minOverlapPx` (`by: 'slab'`); or
- Kid is grounded on plate tiles with profile `heavy` (`by: 'heavy'`).

Any pressed plate opens every `plate` gate in the room.

### 4.2 Lot 7 (`lot-7`): traversal, 48×20 tiles (about 1.6 × 1.2 screens)

```
################################################
################################################
################################################
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################...............FF......D....G.#
#################...............FF......D...####
#################..........FF...FF......D...####
#################..........FF...FF......D...####
#################.......############__##########
#################.......########################
#.........HH............########################
#.........HH............########################
#.........HH............########################
#.P.......HH............########################
#####WWW########################################
################################################
```

Abilities: all movement abilities off, `seize` and `levy` on. Sources: `H` pink partition, `F` brown furnace (two components, so two sounds), `W` white static. Plate `_`, gate `D` (on plate).

| Beat | Geometry | What it tests |
|---|---|---|
| Start | `P` on the lower corridor; `W` floor strip at x 5–7 | White looks like a sound but gives `seizeRefused` (the one-rule lesson) |
| Partition | `H` x 10–11 fills the 4-tile corridor | Seize un-makes. Run-through is possible because the take ghosts on active frame 6 and you never stop. |
| Hall | Upper floor is **6 tiles** (384 px) above the hall floor | Feather jump 272 (+16 ledge pop) can't reach it. Pink spring bounce 448 can. **Levy is forced** (critique B #6). |
| Upper corridor | 4 tiles tall. `F` #2 (x 27–28, 2×2) is jumpable and optional. `F` #1 (x 32–33) fills the corridor. | #1 must be seized (brown, so middle). #2 is the bulk-up option. |
| Plate and gate | `_` x 36–37, `D` x 40 | **Route A (slab):** levy the brown onto `_`. **Route B (heavy):** seize both furnaces, walk onto `_`. |
| Exit step | A 3-tile step (192 px) at x 44–46, with `G` on top | Feather (272) and middle (224) clear it. **Heavy (160 + 16 pop) can't.** Route B must cut weight: levy anything, or jump then down-levy for the 176 px recoil hop. This is critique B #4 ("felt within one jump"). |

Intended expert lines:
- **A (slab), 4 verbs:** seize H, then in the hall jump and down-levy pink (the spring anchors under your feet, recoil, bounce 448), seize F1, levy brown onto `_`, jump the step.
- **B (heavy), 5 verbs:** seize H, down-levy pink, seize F2, seize F1, walk onto `_`, jump plus down-levy brown at the step.

### 4.3 Control room (`lot-7-control`): jumps only, same size and route polyline

```
################################################
################################################
################################################
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################.......################.......#
#################............................G.#
#################...........................####
#################..........##...##..........####
#################..........##...##..........####
#################....##.########################
#################.......########################
#.......................########################
#.................##....########################
#.........##............########################
#.P.......##............########################
################################################
################################################
```

- Abilities: all off, including `seize` and `levy`.
- Each gate is replaced by a jump of similar cost:
  - the partition becomes a 2-tall hurdle;
  - the spring climb becomes two 3-tile ledges;
  - F1 becomes a hurdle;
  - the plate and gate become open floor.
- **Equal-path check:** the control tape's centre-path polyline length ÷ Lot 7 route A's must be in **0.90–1.10**. If it misses, change the control geometry, never Lot 7.

### 4.4 The Pit (`the-pit`): combat, 30×17 (one screen)

```
##############################
#..........................###
#..........................###
#..........................###
#..........................###
#..........................###
#..........................###
#..........................###
#..........................###
#....................b.....###
#....=====.........=====...###
#..........................D.#
#..........................D.#
#..........................D.#
#..b.........P..........q..DG#
##############################
##############################
```

- Two one-way platforms. Barkers at `b` (floor left, right platform), the Grinder at `q`.
- `D` is `opensOn: "clear"`, so tapes target `G` as usual.
- The Grinder's Charge wall-stuns on the left wall or on the closed gate.
- Abilities: `dash` (Slip) plus `seize` and `levy`. Keep the Jab.

| Enemy (L3 subset of combat-spec §4.4) | Sounds | Attacks |
|---|---|---|
| **Barker**: 72×48, HP 8, kbScale 1, fodder; patrol 2.5, chase 5, aggro 8 tiles; hops (`movement.jump`) if Kid is up to 3 tiles higher and within 3 tiles | Bark (pink voice) | **Lunge**: tele 18, active 12 at vx 14, rec 26, hitbox `(40,4,48,40)`, 1 dmg. **Snatch** (generic): 16/4/24, 0 dmg. |
| **Grinder**: 112×112, HP 18, kbScale 0.25, elite; walk 1.5 | Growl (brown voice) | **Charge**: tele 28 (backs up 24 px), up to 60 f at 15 px/f, stops at a wall or ledge, rec 36 (60 on wall stun), hitbox `(100,8,40,96)`, 2 dmg. **Snatch.** |

These rules are implemented as written in combat-spec §1.4, §1.5, §4.2, §4.3 and §4.5:
- open vs guarded, Catch (stagger 36), RETRIEVE toward bag, levied object or flight;
- absorb 8 f, Snatch, revoice 480;
- Return to sender (×1.5, always knocks down);
- brown Levy knocks down enemies with kbScale > 0.5; pink launches;
- DOWN 12 → COUNT 10 × 12 f (punches `whiff{reason:'down'}`); a Seize repossesses;
- tokens ≤ 2.

**Rule change (§8 #6):** if the Count runs out on an enemy knocked down **at 0 HP**, it is **KO'd** (counted out). If it had HP left, it rises Furious (speed ×1.2, telegraph −4, clamped to ≥ 15).

### 4.5 Expression room (stretch, only after M3): `stairwell`, 30×34

```
##############################
##############################
##############################
##############################
##############################
##########..........##########
##########..........##########
##########..........##########
##########........G.##########
##########......##############
##########..........##########
##########..........##########
##########HHHHHHHHHH##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########HHHHHHHHHH##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########HHHHHHHHHH##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########.P........##########
##############################
```

- Three pink partitions, 7 tiles apart, and nothing to stand on.
- The expert line never lands:
  1. Jump and up-seize the partition.
  2. Down-levy (spring under your feet, recoil).
  3. Bounce, and **down-seize the spring you just left**.
  4. Up-seize the next partition, and repeat.
- It tests the Middle-voice graft (the throw inside airborne movement).
- Tune the spacing with the bot until one chain reaches each partition.
- Informational metrics: airborne frames ≥ 70% and verbs per second in the expert tape. Not part of the verdict.

---

## 5. Rendering rules (readability)

**Palette tokens** (in `src/render/palette.ts`, pre-checked against E1):

| Token | Hex | Hue | Contrast vs bg `#12141A` | vs solid `#3A4150` |
|---|---|---|---|---|
| brown | `#E8A23A` | 36° | 8.5 : 1 | 4.7 : 1 |
| pink | `#FF4FA3` | 331° | 6.1 : 1 | 3.4 : 1 |
| violet | `#9D84FF` | 252° | 6.3 : 1 | 3.5 : 1 |
| white static | `#D8DCE6` (saturation < 10%) | — | 13 : 1 | 7 : 1 |

Minimum hue gap: 65° (brown–pink). Colour is never the only cue: each colour has its own vibration and its own levied shape.

| Element | Humming / armed | Seized / ghost | Other states |
|---|---|---|---|
| Object source (H, F) | Fill in its colour at α 0.35. 4 px outline at α 1. **Vibration** by colour: brown ±2 px at 5 Hz, pink ±1.5 px at 9 Hz, violet ±1 px at 15 Hz. Driven by the frame number (render-side). | Fill α ≤ 0.10 (≤ 40% of humming). 2 px **dashed** outline (10 on, 6 off) at α 0.55. No vibration. The swap is drawn on the `seizeTake` frame. | `pendingSolid`: the dashed outline blinks at 4 Hz |
| White static (W) | Grey fill with per-frame speckle (render RNG) and a jittery 1 px outline | Never changes. On `seizeRefused` it flashes white for 3 f. | |
| Enemy | Neutral body `#9AA3B5`, outline in each **armed** voice's colour, vibrating | That voice's outline goes dashed. A small "X" at the mouth. | **Telegraph:** outline thickens and the body tints toward the attack colour over the wind-up, with 3 pulses (Barker). **RETRIEVE:** a thin tether (α 0.4) from the enemy to its sound's position. **COUNT:** a ring of 10 ticks overhead. **Furious:** red eye. |
| Levied slab (brown) | A 64×48 block at α 0.85 with a heavy border. It hums like a source. | When re-seized, it's removed with a ribbon | A slab waiting to materialise is dashed |
| Levied spring (pink) | 64×16 zigzag. It compresses for 4 f on a bounce. | as above | |
| Plate and gate | Plate: an inset bar in the floor. Gate: vertical bars. | Pressed plate: drops 8 px and a lamp lights. Open gate: dashed for 10 f, then gone. | |
| Feedback | `hit` flash (white, 3–6 f by class). `catch`: Kid flashes gold. Target shakes ±3 px during hitstop. Sparks and motes per class (combat-spec §2). | | |

**Bag HUD** (top-left, screen space):
- Three 48 px slots, oldest on the left and newest on the right. A **"next" caret** marks the newest slot, which is what Levy throws.
- Each puck is its colour plus a glyph: brown square, pink zigzag, violet chevron. An empty slot is a dashed ring.
- On `seizeTake`, a 12-frame **ribbon** flies from the target to the slot. On `bagPush`, a ribbon flies from the slot to the source.
- Under the bag: the weight plate reads **FEATHER / MIDDLE / HEAVY**, with a 3-position scale needle. On `profileChange` the needle swings over 8 f.
- Kid's silhouette changes (render only; the collision box is unchanged):
  - heavy: drawn 72 tall with a wider stance;
  - feather: 2 small rising motes.
- Chin: 5 pips below the weight plate.

`__game.render.rects()` returns `[{id, kind, colour, status, x, y, w, h}]` in canvas px for every source, levied object, enemy and HUD slot. The E checks sample pixels there.

---

## 6. Verification plan

### 6.1 Tools to add or extend (all headless unless marked e2e)

| Tool | Change |
|---|---|
| `src/debug/sim-adapter.ts` | `playerView` gains `move, moveFrame, bag, weight, chin`. `botKey` gains: bag colours in order; source ghost bits; levied `(colour, phase, x>>3, y>>3)`; plate and gate bits; `move` plus `frame>>1`; `hitstop>0`; enemy `(state, x>>3, y>>3)`. `eventMarker` letters: `S` take, `s` refused/guarded, `K` catch, `V` throw, `v` land, `T` telegraph, `!` hurt, `C` repossess. `registerTestRoom` accepts a partial `RoomFile` (sources, enemies). |
| `tools/bot` | New macros (§3). `without: seize/levy` drops them. Budget flag unchanged. |
| `src/debug/tape.ts` | `expect.events: [{type, match?: {...}, min?, max?}]` |
| `tools/tape.ts trim <file>` | Greedy trimmer: repeatedly shortens each DSL segment by 1 f (and drops `.` segments) while `expect` still passes, until nothing changes. **Every expert tape is trimmed by this same tool.** |
| `tools/fuzz.ts` (`npm run fuzz`) | Seeded random input: holds of 1–30 f over the room's allowed action set. Runs × frames. Checks the invariants in C3. |
| `tools/bot/policies/{signature,jabOnly}.ts` | Reactive policies (combat-spec §6.4). A 12 f reaction delay (they act on a snapshot from 12 steps back). Seeded. Output is recorded as a tape. |
| `tools/feel-report` | A **weight and verbs** section per class: jump height (tiles), apex frame, run speed, spring apex, recoil heights, and seize and levy frame timings |
| `tests/e2e/signature.spec.ts` (e2e) | Loads checkpoint tapes, calls `render.rects()`, and does the pixel sampling **in the page** (canvas `getImageData`, no new dependency). Saves PNGs to `progress/l3/`. |
| `npm run l3:verdict` (`tools/l3-verdict/cli.ts`) | Runs every headless check, reads the e2e JSON if present, and writes `progress/l3/verdict.{md,json}`: one row per check (value, threshold, PASS/FAIL), then the decision. |

### 6.2 Tapes to author

| Tape (`tests/replays/`) | How | Expect |
|---|---|---|
| `lot-7.slab.json` | Hand-scripted DSL (iterate with `npm run sim -- --trace`), then `tape trim` | `target G`, `events: plate{by:'slab'} ≥ 1` |
| `lot-7.heavy.json` | Hand-scripted, then trimmed | `target G`, `plate{by:'heavy'} ≥ 1` |
| `lot-7-control.json` | Hand-scripted, then trimmed. **Guard:** its frames must be ≤ 1.05 × the bot's best (`--weight 1`, 1M budget); otherwise the bot tape replaces it. | `target G` |
| `lot-7.bot.json` | Bot on `lot-7` with `--weight 1` and a 2M budget | Informational (B1′). May not be found. |
| `the-pit.signature.s1.json`, `the-pit.jabOnly.s1.json` | Policy runs on seed 1, recorded | `target G`, `maxDeaths 0` |
| `stairwell.json` (stretch), `l3-trailer.json` | Hand-scripted. The trailer does Lot 7 route B with flourish, for the human's clip. | `target G` |
| Unit scenarios (`tests/unit/signature/*.test.ts`) | Lab rooms via `registerTestRoom` | A1–A3, D1, frame data, FIFO, conservation |

### 6.3 Checks (critique A's A1–F1, with each measurement named)

Unless stated otherwise, "frames" means sim steps, and hitstop frames count.

| # | Check | Tool and method | Pass | Kill |
|---|---|---|---|---|
| **A1** | Responsiveness | Unit scenario: press `S` with a source in reach; measure frames to `moveStart` and to `seizeTake` | `moveStart` on frame 1; `seizeTake` ≤ 6 | |
| **A2** | Durations | Unit: `move` non-null frames, **excluding hitstop steps** (hitstop is measured as its own feel constant) | Seize take ≤ 14; whiff ≤ 18; Levy ≤ 10. Frames with horizontal input ignored during any move = 0 (nothing roots for > 12). | |
| **A3** | Momentum | Unit: Right held at full air speed; aerial `S`, `V`, `D+V`; compare vx 10 steps later with vx at the press | ≥ 80% | |
| **A4** | Feedback | Verdict tool over **all** L3 tapes and the fuzz runs: every `seizeTake`, `catch`, `hit` and `repossess` has a `hitstop` event on the same step with frames ≥ its class value, and the event carries colour and position (render and audio keys) | 100% | |
| A5 | Weight felt (critique B #4) | Feel report | Feather equals the L2 `opus` table exactly. Adjacent classes differ by ≥ 15% in jump height and by ≥ 2 f in apex. | |
| **B1** | Flow ratio | Verdict: frames(`lot-7.slab`) ÷ frames(`lot-7-control`), both trimmed, with the control guard applied. Also reports `min(slab, heavy)` and B1′ (bot ÷ bot) as information. | ≤ 1.35 | **> 1.6** |
| **B2** | Stillness | Verdict: in `lot-7.slab`, the share of non-hitstop steps that are grounded with \|vx\| < 0.5 | ≤ 10% | **> 20%** |
| **B3** | Verb density | Verdict: count of seize and levy `moveStart`s; longest run of still frames (B2's definition) before any verb | ≥ 3 uses, no pause > 20 f | |
| **C1** | Gate integrity | `npm run bot:all`. `lot-7` claims `G` without `seize` and without `levy` (checked separately), 1M budget each, plus the target `rect` of the upper corridor mouth without `levy`. `npm run fuzz -- --room lot-7 --no-verbs --runs 500 --frames 3600`. | Never reached (exhausted, or not found in budget) | **Any bypass in the submitted room** |
| **C2** | Expression | The two tapes above both pass, and they differ in `plate.by` | ≥ 2 distinct solutions | |
| **C3** | Robustness | `npm run fuzz -- --room lot-7`, then `--room the-pit`, 500 runs × 3600 f, all verbs. Invariants **every step**: no levied or enemy box inside a solid (tiles or dynamic); bag ≤ 3; sounds conserved (each id is in exactly one place); Chin within [0, max]; no NaN (`hashState` throws); every enemy in a legal state; tokens ≤ 2. **After each run:** `loadRoom` and assert `local` deep-equals a fresh load. Every 50th run, replay the expert tape from that state and reach `G`. | 0 violations | |
| **D1** | Disarm | Unit, plus a trace check over the Pit tapes: when a Barker's Bark is taken, Lunge is never `attackActive` until `absorb` or `snatch`, and `retrieve` happens ≤ 10 f after `seizeTake` | 100% | |
| **D2** | Signature dominance | Verdict: both policies on the-pit, seeds 1–20, frames to `roomClear`. Ratio of the medians. | `signature ÷ jabOnly ≤ 0.75`; **both** clear 20/20 within 3600 f with 0 deaths. A ratio < 0.50 prints a Phase 2 tuning warning. | |
| **D3** | Telegraphs | Zod `min(15)` on the data, plus trace check T4 over every Pit run: each `attackActive` comes ≥ 15 **non-hitstop** steps after its `telegraph` | 100% | |
| **E1** | Readability | e2e. 4 checkpoints: (1) Lot 7 start, H humming; (2) 20 f after the H take; (3) spring and slab landed, F1 ghost; (4) the-pit with one Barker telegraphing and one disarmed. Sample the interior (inset 8 px) of each rect. | Ghost's mean \|pixel − bg\| ≤ 40% of humming's. Hue gap between brown, pink and violet ≥ 60°. Each colour ≥ 3:1 luminance contrast vs bg. | |
| **E2** | Silhouettes | e2e. The same H rect at checkpoints 1 and 2, downscaled to 25% in-page | ≥ 15% of bbox pixels differ (any channel > 16/255) | |
| E3 | Muting reads in one frame (critique B #2) | e2e: step to the `seizeTake` frame and read `render.rects()` status for the source; the next sim step shows Kid's box overlapping the old wall rect without being blocked | Status `ghost` on the same frame; passable on the next step | |
| **F1** | Determinism | `npm run check` (replays run each tape; existing cross-runtime e2e extended to the L3 tapes). The verdict re-runs each L3 tape 3× and compares the 60-frame hash sequences. | Identical; `check` green | |

**Visual confirmation for reviewers** (not scored):
- `npm run clip -- --tape tests/replays/lot-7.slab.json --study` and the same for `the-pit.signature.s1.json`. The event keyframe sheet must show the dashed outline on the `S`-marked tile, and the ribbon and weight glyph change.
- A `playwright-cli` screenshot of the running dev build at checkpoint 3.

### 6.4 Decision rule (computed by `l3:verdict`; reviewers re-run it and read the JSON)

1. **KILL (concept slows play)** if any of these hold:
   - B1 > 1.6;
   - B2 > 20%;
   - C1 finds a bypass in the submitted room.
   
   Next step: go to the fallback (DISSOLUTION ROLLS, PLAN §2).
2. **PASS** if every A (A1–A4), C, E and F check passes, **and** B1 ≤ 1.35 or B2 ≤ 10%.
   - D failures don't block a PASS. They're recorded as Phase 2 tuning debt.
   - D2 with signature *slower* than jabOnly is flagged for the human.
3. **IMPROVE** otherwise: no kill trigger fired, but a pass condition failed.
   - Allow one tuning or room-fix pass in L4, then re-run.
   - An IMPROVE outcome on the B checks twice in a row counts as KILL.
4. **Integrity guards.** The verdict is **void** (it prints INVALID) if any of these fail:
   - a tape's `tuningHash` differs from the current tuning;
   - a tape carries tuning overrides;
   - the control-tape guard or the path-length check (0.90–1.10) fails;
   - an expert tape wasn't produced by `tape trim` (its frame count changes when re-trimmed).

### 6.5 Definition of done for the engineer

- `npm run check` passes.
- `npm run l3:verdict` prints a non-INVALID decision.
- A1–A4 are verified in the running game with playwright-cli (`-s=l3`):
  - `eval "window.__game.traceText(30, 'R10 S1 R19')"`;
  - `state().combat`;
  - a screenshot at checkpoint 3.
- `memory/` has a new `signature-mechanic.md` covering: step order, dynamic solids, the fingerprint change, gotchas, and the tuning findings. Update `sim-architecture.md` (events), `gym-rooms.md` (schema), `bot.md` (macros and key) and `debug-api.md`.

---

## 7. Queue for the human (`progress/user-inbox.md`, non-blocking)

Attach `clips/l3-trailer.mp4`, the route A and route B sheets, and a live build link to each item.

1. **Tooltip test:** in Lot 7 cold, do you try to seize everything within 2 minutes? Did you need any text?
2. **Punch:** does the moment a wall goes silent land like a hit? Blind A/B of seizeTake hitstop 5 vs 8.
3. **Weight:** does heavy feel like power or like encumbrance? Is feather→middle felt in one jump?
4. **Bag:** do you always know what Levy will throw (the caret and the queue)?
5. **Put-back:** do you levy for fun, or only when forced? (This is critique B's "delete-button" risk.)
6. **Disarm:** when a Barker loses its bark, can you *see* that it can't lunge, and that it's chasing its sound?
7. **Sound:** are the brown and pink hums pleasant over 10 minutes, and does the seize "cut" sell *sound = existence*?
8. **Base movement:** is the control room fun on its own (critique B #7)?
9. **Palette:** is it readable for you, including a colour-vision-deficiency filter pass if you have one?

---

## 8. Contradictions found and how this brief resolves them

| # | Conflict | Resolution |
|---|---|---|
| 1 | Grinder: critique A has a "slam, brown, ≥ 20 f", while combat-spec has Charge (Growl, brown, 28 f) plus Sparks (Whet, violet) | Charge only. Sparks and violet are deferred to Phase 2. |
| 2 | Colours: critique A ships 3, critique B says 2 first, combat-spec uses 3, audio has 5 (including blue) | L3 rooms use brown and pink. Violet is in the data model and stubbed. White is unseizable terrain. |
| 3 | The concept makes middleweight "standard", but derived weight (0 brown = feather) makes feather the default; the `profiles.feather` placeholder jumps 320 | **Feather is exactly the L2-tuned base.** Middle and heavy are heavier variants (224 and 160 px). |
| 4 | Combat-spec's pink spring bounces 240 px, less than a normal jump (272), so it can't serve critique A's "ledge too high for any jump" | Kid's spring bounce is **448 px** (`levy.pink.springPx`). The enemy launch is unchanged. |
| 5 | Critique A's C2 "heavy landing vs brown levy", but heavy needs ≥ 2 brown | Lot 7 has two furnaces, a latching plate, and a heavy-proof exit step, so both routes need both verbs. |
| 6 | Combat-spec says a 0-HP elite goes DOWN, then rises with "HP unchanged", and punches can't hit a downed enemy, so jab-only could never finish the Grinder (breaks D2 and F4, "jab-only must win") | **Count out at 0 HP means KO** (boxing's actual rule). A Seize during the Count still repossesses for ×2. |
| 7 | A1 ≤ 6 versus Seize startup 5, and A2 ≤ 14 versus the 5 f seize hitstop | A1 is measured to `seizeTake` (= 6, passes exactly). A2 excludes hitstop steps. B1 and B2 include or exclude them as stated in §6.3. |
| 8 | Critique A's pass rule ignores D; combat-spec F4 adds a 0.50 floor | D failures mean IMPROVE (tuning debt), not KILL. The 0.50 floor is a warning. |
| 9 | Combat-spec keys: WASD J = jump, K = jab, L = seize, "A/Q" = Swallow. These clash with L2 bindings (K jump, J attack, L dash), and A = left is bound at the same time. | Keep L2's bindings. Seize V/I, Levy B/O, Swallow Q. Pad North/East per the spec. `special` moves to LB/LT. |
| 10 | Combat-spec's dotted sfx keys (`seize.take.{colour}`) vs the audio module's camelCase sounds and router mapping | Sim event names follow spec §2 (camelCase). The audio names stay as they are. The router maps between them (§2.4). |
| 11 | The build fingerprint hashes only `src/sim/**`, but frame data moves to `content/` | Fold the gameplay content into the fingerprint (§2.7). |
