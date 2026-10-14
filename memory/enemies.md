# Enemies and health: the burrback, the lampwing, being hurt, fade and re-form

Sim: `src/sim/enemies.ts` (the framework: hits, hurt / die, glint spill, contact) with one module per
kind in `src/sim/enemies/` (`burrback.ts`, `lampwing.ts`, shared helpers in `common.ts`),
`src/sim/player/player.ts` (`hurtPlayer`, `trackSafeGround`, `reformPlayer`), step order in
`src/sim/index.ts`. Numbers: `tuning.burrback`, `tuning.lampwing`, `tuning.enemies`, `tuning.health`.
Tests: `tests/unit/enemies.test.ts`, `enemies-pilot.test.ts` (burrback), **`burrback-ram.test.ts` (the ram,
the masher and the reader)**, `lampwing.test.ts`, `lampwing-pilot.test.ts`. Both are drawn by
`src/render/enemies/` (enemies-render.md).

## The framework (adding a kind)
- A kind is a `KindRules` record (`enemies/common.ts`) in `KINDS` of `enemies.ts`: its box and
  numbers (`hp`, `hurtFrames`, `hurtSafeFrames`, `contactDamage`, `deadFrames`, `value`), `place`
  (start position from the scene's `x, y`), `update` (one step: movement, modes, what it notices;
  returns false when its touch cannot hurt, e.g. a dead body), `shove` (how a blow knocks it), and
  optionally `prepare` (once per step before anyone moves), `touched` (its own reaction when its
  touch hurt her) and `homeClear` (extra room safe ground keeps from its home).
- Shared and identical for every kind: one hit per slash (`hitBy`), hit points, the hitstop, `hurt` /
  `dead`, `slashHit` / `enemyHit` / `enemyDie` / `impact`, the no-hitting-through-ground line test,
  the glint spill queue (`spill / spillTimer / spillGap`), contact and its exclusions, the pogo.
- `EnemyState` is ONE flat record for all kinds (plain JSON; a field a kind does not use keeps its
  start value). `homeX, homeY` = the centre of its box at the start, for every kind. The state
  version is 18 (enemies.test pins it). `KindRules.blocks` (optional): a blow glances off (the burrback's
  braced shell): the framework fires `enemyBlock`, takes nothing, and the slash is spent on it.
- Scene data: `enemies` is a Zod union on `kind`; burrbacks first, lampwings after (the burrback
  grove tests index the first six). `EnemySpawn.y` means feet for a burrback, home centre for a lampwing.
- No `Math.sin` in the sim: the lampwing's bob is a two-parabola wave (`wave()`), its wander a hash
  of its id (`mix`), like the burrback's rests.

## Step order (matters)
re-form if a fade just ended → `updatePlayer` (her slash is resolved inside it, against where the
enemies stood) → `updateEnemies` (move, modes, flinch; returns who touches her) → contact →
`hurtPlayer` → `trackSafeGround` → pods → pickups. So a slash and a touch on the same frame: the slash
wins (the creature is staggered and harmless before contact is tested).

## Playtest 6 (2026-10-14): two tells a fight, the ember is safe, fair arrivals at burr-root
- **A lit wayside lamp no longer shortens the fight beside it** (it stopped the ram and took the brace of one
  shoved into its light: the careful pilot saw one tell at burr-shaft and burr-rise, wing-rise never dived). A
  lamp's sanctuary is its own standing spot and only while she is AT it (goal.md, `sanctuary.ts`); lanterns as before.
  Shrinking it to 64 px alone was not enough: two cuts after a ram shoved burr-rise the 120 px into it.
- **A ram does not run in under a doorway, nor does a shove carry it there** (`roofAhead` in `burrback.ts`: a
  solid lower than `strikeHeadroomPx` 136 over its ground; the ram ends `enemyRecover` cause `ledge`). Why:
  burr-shaft's first ram is always westward (she comes in by the doorway and hops east), it ended in the
  doorway, her cuts pushed it on under trunk A, and she followed into the doorway, where it does not brace
  at her: one tell. Now it pulls up at the mouth (box x 3328) and the second brace comes. `fenced` was tried
  instead: with its 46 px range the ram was 14 px long and she landed on it.
- **The careful pilot** (18-frame reaction; `naive-pilot.test.ts` asks for two tells at each): burr-path braces
  3.6 / 5.3 s, down 6.2 (2.8 s from her first cut); burr-shaft 12.1 / 13.6, down 14.6 (3.2 s); burr-rise 49.8 /
  51.4 with wing-rise's dive at 51.8, down 52.8 (3.3 s). 58.6 s, 1 hit (burr-ledge, off the path), 0 fades.
  Still ~3 s a fight for a robot: no number was changed (hp, winded times as before). Its kills are plain
  cuts now, not the finisher (the opening cut it gets for free leaves 1 hp for the tired window's first cut).
- **The mashers**: 8 hits and 3 fades each (tapper 53 s, holder 57 s), still finish; the tapper no longer kills
  burr-rise (it was the lamp's light that let her): she wounds it, fades, and its ram carries it past her.
- **A calmed lampwing notices nothing** (`e.calm === 0` in its hover): it used to start a tell while calmed
  and give up a frame later.
- **Taking the ember calms everything within 600 px** from the step it wakes until 60 frames after (goal.md).
- **lamp-ledge `sight: 400`**: it sees F5's east end and the whole high ledge (not burr-ledge's patch east of
  3005 from its home); its tell is on screen from both (`playtest6.test.ts`). It now joins the burr-ledge fight
  when that drifts west (the careful pilot: seen 23.5 s, dive 24.1).
- **wing-rise stays at (5090, 900)**; `lamp-rise` moved out of its sight instead (4760: 330 px from its home,
  260 + its 50 px territory = 310). One who stands at the lamp, dark or lit, is never noticed; its dives end
  where she fights burr-rise (stalls 100+ px east of the post). Moving it 150 px east (5240) would have put
  it over the heart and out of sight of the west half of burr-rise's patch: the pair fight would be lost.
- **burr-root paces the foot of the rise's step only** (feet 4572, `radius` 40: box 4506-4608; it was
  4340-4608). Measured landings on its floor: off the root 4283, tap jumps from the root's lip 4283-4473 (a
  3 to 8 frame press, at the lip or up to 120 px before it; she slides on to 4478), a walk off the rise's west
  lip 4436, a tap jump off it 4330. All west of 4498 (her box), so 60 start times each: 0 hits. **Left**: a
  press of 10-30 frames from the root's lip comes down in its patch or against the wall over it, and stepping
  off the rise's lip and letting go lands on it (4546): the whole floor is somebody's landing; this strip is
  the one no plain move ends in. It cannot be run at from the east (no ground there): from the east she drops
  off the rise beyond it. `lamp-root` moved west out of its patch (4350).

## The burrback's ram, with a second beat (playtest 5: "every fight is one beat, ~2 s; the masher pays 1 light a burrback and wins")
The rule in one line: **stand and mash loses, read the tell and punish wins, and one punish is not a kill.**
- **Brace** (`mode: 'windup'`, `enemyWindup {dir, frames 26, px 180, speed 10}`): she is in front of it, on its
  ground (feet from 56 over to 8 under its own), within 130 px box to box (`strikePx`), nothing solid between.
  26 frames (`windupFrames`: the tell), out of a walk, a rest, a turn or a flinch.
- **Ram** (`charge`, `enemyCharge`): 180 px straight on at 10 px/f. Walls, the brink of a ledge, a lit lantern's
  ground and (if `fenced`) the end of its range stop it.
- **Winded** (`recover`, `enemyRecover {cause: spent|wall|ledge|lantern|touch, frames, cooldown 12, tired, broken}`):
  open to every cut, **its touch does nothing**. How long: **30 frames the first time** (`recoverFrames`: about
  two cuts; the third meets a fresh brace), **66 every time after** (`recoverTiredFrames`, `tired: true`: the
  whole chain lands, so **the kill is usually the finisher**), **90 when a wall stopped the ram**
  (`recoverWallFrames`: stunned; five cuts fit). `strikeCooldown` 12 more and it may brace again (`strikeCd`
  counts both; hitstop frames do not count, so each cut that lands adds ~5). A stagger that ends inside the
  winded time puts it back in `recover` for the rest (no second event): it never walks into her mid-combo.
- **The second tell**: `roused` (300 frames from any cut that lands) = it comes round to her when ready
  (`enemyTurn` cause `hit`, frames 0) and braces from 150 px (`provokedPx`), **in its range or not**.
  `stirred` (300 past the winded time, set by every ram) = it comes round and braces at one **inside its
  range**; one beyond it (at the bluff's foot working out the climb) is left alone. Both end on a calm.
  A plain walk-into-her touch does not stir it (it turns away as before).
- **A blow that breaks the brace** (from behind, or a down slash from above, during `windup` or `charge`): it
  staggers, then stands winded where it is (`enemyRecover {cause: 'spent', broken: true}`), no ram. `e.broken`.
- **Braced**, a forward cut from its front glances off (`enemyBlock`; she holds **6** frames now,
  `enemies.blockHitstopFrames`, was 3, and is thrown back ~27 px). A clang late in the tell leaves no time to hop.
- **Hit points 5** (`burrback.hp`), or the scene's `hp` (burr-path 4: the teaching one).
- **The reader** (hops the ram 15-18 frames after the tell, cuts it winded): exchange 1 = cut, cut (5 -> 3), the
  third cut clangs on the new brace; exchange 2 (tired) = cut, cut, finisher: dead. 0 hits, ~4 s from the first
  tell for the bot (burr-path, 4 hp: 3.2 s live with real keys; it was 1.3-2.5 s). **The masher**: clang,
  rammed, two cuts, clang, rammed, then it dies in the tired window: **2 hits a burrback** (live: path 2,
  shaft 2 = a fade at the second). Never inside her 70 frames of safety (hit to hit >= 80).
- **Mashing three in a row is a fade**, and after it **living creatures keep their wounds** (`resetEnemies`:
  home, calm, not healed; `enemyReset.healed` is always 0). Why: re-formed at 2 lights against a healed 4-5 hp
  burrback the masher faded for ever (piloted: a hand that glided over burr-path the first time looped there).
  With wounds kept every attempt counts; the price is the fade's (a third of the wallet, the walk back).
- **`fenced: true`** (scene, with a `radius`): neither ram nor shove takes it out of its range. burr-ledge
  only: hopping its ram used to end off the ledge's west end, on the floor.
- **What it never does**: brace at one with a solid lower than 136 px over her ground (the doorway under
  trunk A: from there she gets a free cut or two when it paces near); brace while calmed, in a lit lantern's
  sanctuary (a lit wayside lamp's only while she stands at it: playtest 6 above),
  while she kindles, after `gather`, within 600 px of the woken heart.
- **The shaft**: its west wall has the doorway in it, so a ram westward runs its length into the well; the
  wall-stun is the ram EAST into trunk B's bark, i.e. the second exchange (she has hopped it and stands east).
- Numbers tried: `recoverFrames` 40 + cooldown 14 let the finisher land in exchange 1 (5 -> 1: a plain cut
  finished it); 45 / 150 was the one-beat fight. Rousing on a plain touch rammed an idle hero every 100 frames.
- Pilots: `burrback-ram.test.ts` (`RAM_TRACE=1`), `naive-pilot.test.ts` (`NAIVE_TRACE=1`: mashers and the
  careful first-timer over the whole grove), `enemies-pilot.test.ts`.
- `burrback.strikePx = 0` switches the ram off (the older rule tests do, and pin 3 hp: `noRam()`, `still()`).

## The burrback
- Scene data `enemies: [{id, kind: 'burrback', x, y, facing}]`, `x, y` = feet centre. Validated: unique
  id (also against pickups and pods), whole box on one surface, clear of solids, at least 300 px from
  the spawn. Box 52 x 34, 3 hp. `state.enemies[i]` belongs to `scene.enemies[i]`.
- Walks 1.6 px/f. A step is refused when a solid is in the way (`wall`), its ground ends ahead
  (`ledge`), a lit lantern's sanctuary is ahead (`lantern`, goal.md) or she is under the edge ahead
  (`wary`): it flips `facing` at once, stands 24 frames (`mode: 'pause'`, `turning`), walks back. Its
  whole box stays on its surface. No gravity: it cannot fall. One-way branches are floor to it.
  Enemies do not collide with each other (one per surface in the grove).
- **Lips** (`span()` measures its ground every step: walls / scene edges vs drops). Where its ground
  ends in a drop it turns `lipClear` (96) short of the edge; walls and the scene's edges it walks
  right up to. A platform too short for that keeps `minPatrol` (48) px of walk, the clearance shared
  between its lips. Shoved past the turning point (to the brink, `teeter`), it walks back in. Reason:
  it used to walk to the lip and pause exactly there, so a jump up onto any ledge landed in it (the
  first hit of every naive run). A careful hop lands 40-75 px in: traced at all six lips, 0 hits
  in 60 start times each.
- **Wary**: while she is below it (feet more than 24 px lower) and within 200 px sideways of one of
  its lips, it will not walk toward that lip inside 320 px of it: facing it, it turns its back
  (`enemyTurn` cause `wary`); stopped at the other end, it stands (30-frame pauses, no turn) rather
  than come back; under both lips it stands. So standing in the pool or on F7 clears the landing.
- Rests mid-walk every 150-330 frames of walking for 20-34 frames (`pause`, `turning` false): an
  integer hash of its id and how many rests it has taken. No RNG, so `state.rng` is untouched.
  Never within `restLipClear` (120) of a lip: a rest due there is taken once it has walked clear.
- Flinch: a `land` or `slash` event of hers within 160 px (box to box) while it walks or rests:
  `mode: 'alert'` for 18 frames, then it walks on. At most one per 45 frames after the last ended, so
  mashing next to it does not freeze it. It never turns to her or chases.
- **Its touch is one hit**: when its touch hurts her (or meets her kindling) it is shoved back from
  her at 8.5 px/f fading 1 a frame (41 px; stops at walls and the brink), flinches 30 frames (`alert`,
  `enemyAlert` cause `touch`) and **turns away from her**. With her own 55 px throw they end ~95 px
  apart with its back to her. Standing still in its patrol she is hit once per round of the patrol
  (traced in the grove: frames 21, 409, 865; live 128, 753) instead of every 70 frames (the moment
  her safety ran out, it was still on her). Her knockback (7 / 7) did not need raising.
- Hit by a slash (once per slash, `hitBy`): loses the step's `power` (1, 1, 2). Held for the same
  hitstop as her (**4 / 4 / 7**: `enemies.hitstopFrames` + the step's `hitstopFoe`; 2 on a pogo), then
  `hurt` for 14 frames while the shove plays: `knockVx` = the slash's `knockback` x `knockScale` 1.25
  (**7.5 / 13.75 px/f**) fading 1 per frame = **32 px for a cut, 102 for the finisher** (it was 21 / 66:
  "nothing is felt"), along a forward cut; an up or down cut shoves it sideways away from her at half
  strength. The shove stops at walls and at the brink of a ledge (at most `teeterPx` 10 of
  it hangs over; `teeter` = that side until it walks again; it then turns round and comes back).
- A full chain kills on the finisher; finisher + one cut kills; three pogo bounces kill.
- Death: `mode: 'dead'`, still shoved, body removed (`gone`) 30 frames after the hitstop. It spills 4
  glints (6 if the finisher killed it) into `state.pickups.count`, the first 16 frames after the
  blow, then 5 apart (3 apart for 6): `pickup` events with the enemy's id and `enemy: true` (NOT
  `pod`; the pickup renderer flies them from `spill / spillTimer / spillGap`: pickups.md). Dead until restart.
- **No hitting through ground**: the line from her body centre to the centre of the part of the
  creature inside the hit area must not cross a solid's inside. Under a 48 px platform an up slash
  does nothing; a one-way branch does not block. It also means a creature at the lip of a step above
  her cannot be reached from below. Pods have no such test.

## The lampwing (the first flyer)
A small pale moth-wisp, box 36 x 30 (drawn ~40 px), **3 hp**, drawn to her light. **Its dive is its attack**
(playtest 5); its touch hurts while it hovers, late in the tell, in the dive and in the climb.
- Scene data `{id, kind: 'lampwing', x, y, facing, radius?}`: `x, y` = its **home**, the centre of
  its box and of its territory (`radius`, default 120); `facing` mirrors its wander path. Validated:
  a box of twice its size clear of solids, under the canopy, 350 px from the spawn
  (`LAMPWING_SPAWN_CLEAR`), and its territory 100 px clear of every pod and great glint
  (`LAMPWING_PRIZE_CLEAR`: radius + 100 from home to the thing).
- **No gravity, no ground.** Float velocity, integer box, moved 1 px at a time per axis
  (`lampwingBlocked`): solids and scene edges stop it (the stopped axis loses its speed, so it
  slides along surfaces), it never rises above `ceilingY` (0 if the scene has none), never gets
  nearer than 12 px to the water of a `pool` solid (water = 50 px over the pool floor,
  `poolDepth`: the same number as the playfield's `waterDepth`, keep them equal); one-way branches
  are open air.
- `hover`: steers (0.03 px/f²) at 0.7 px/f toward a wander point inside 80% of its radius (x) and
  48% (y), in plain view of its home, a new one every 90-200 frames or on arrival; plus a bob of
  0.16 px/f on an 84-frame cycle. It stays inside its radius (tested for a minute, every grove one).
- **Notice**: her body centre within 260 px of its centre (`noticePx`; a scene `sight` replaces it: lamp-sky
  500) AND a clear segment between the two AND she is lit AND inside its leash. Then `curious` **36 frames**:
  it turns to her, brakes, rises 0.5 px/f: the tell (`enemyNotice`). **Its touch does nothing in the first 20
  frames of the tell.**
- **The dive (playtest 5: "110 frames of drift, no swoop, not an event")**. When the tell ends it commits:
  `dive`, `enemyDive {x, y (start), tx, ty (her body centre at that moment), frames, dive (1..)}`: an arc from
  where it hangs to where she stood, down first and then along (a quadratic bend, `diveBend` 0.75), eased
  (slow out, ~1.5 x the average through the middle, slow in), **5.4 px/f on average** (`diveSpeed`; 20-52
  frames, at most 340 px). **Dodgeable by moving on** (away from the side it comes from: its body sweeps the
  near side of the arc); a hero who stands is touched about three fifths of the way in, ~1.1 s after the tell
  began. A **gliding** hero is led (`diveLeadGlide` 1: it aims where her glide will have carried her).
  `state: fromX, fromY, targetX, targetY, span (its length), timer, dives`.
- **Stall** (`stall`, `enemyStall {frames 34, cause: done|wall}`): it hangs at the bottom of the arc, **open
  and harmless**: her opening. Then **`pursue` = the climb** (`enemyClimb {tx, ty}`): up at 3.4 px/f to a
  perch 170 px over her and 110 px to its side (harmless for the first 12 frames), and it tells again
  (a fresh `enemyNotice`). **Three dives** (`maxDives`) and it has had enough (`enemyGiveUp` cause `tired`).
  A whole cycle is ~2.3 s. Tried: 6.5 px/f reached one who began to run 18 frames into the dive (live).
- **Hit points 3**. cut + cut in one stall leaves it at 1 and it climbs to come again; the whole chain in
  one stall kills it (the tumble holds it there); a cut timed to its arrival lands too (the dive is no shield).
- **Gives up** (`enemyGiveUp {cause}`): `far` (she is more than 520 px from its HOME when a stall or a climb
  ends), `lost` (not seen for 90 frames of the climb), `tired` (three dives), `dark` (she faded), `touch` (its
  dive hit her: it bounces off), `calm` (a lantern was kindled near it, she stands in a lit lantern's light
  as the tell ends, or the run ended). Then `rest` 60 frames, `return` home at 1.8 px/f, and **it notices
  nothing until it is back**. **`rest` and `return` are harmless** (a body left hanging in a fight after it
  has hit her hit her again 70 frames later, twice, in the pair fight).
- `return` goes round what is in the way: stopped dead for 20 frames, it aims for the nearer end of
  the face it is against (`detour`), then home again.
- **Contact**: the shared rules (1 light, the same throw, stagger, i-frames). It also bounces off
  her: 5 px/f away from her centre, braking at 0.14 (30-60 px), and gives up (`touch`). So hit to hit
  is ~240 frames, not the burrback's 70. Chosen: the i-frames end long before it is back, so a second
  hit is never "it was still inside me".
- **Harmless through its whole tumble** (**24 frames** + hitstop; the burrback: 8 of 14; it was 16:
  a glider who cut `lamp-sky` from the end of her reach met it again exactly as it righted itself, 9 of
  24 flights; 24 + 4 frames is 290 px of glide, more than her reach and its shove). Reason: the
  glide. A gliding hero cannot stop; with 8 safe frames a mid-glide cut was always followed by
  flying into the thing she had just cut (traced: hurt on the first unsafe frame). Now one cut on the
  way in lets her fly on through it, which is the answer the design asks for.
- **Hits**: 3 hp (the rule tests pin 2). Cut, cut, cut; cut + finisher; three pogos. Hitstop as the burrback's
  (4 / 4 / 7; 2 on a pogo). Knockback = the slash's `knockback` x 1.1 **along the cut** (forward: sideways; up cut: up;
  down cut: down), fading 0.75 a frame: 32 px in 9 frames for a cut (the burrback: 21), 104 for the
  finisher (it is dead then: the body flies). Stops at solids, the canopy, the water. `hitDir` is
  still the side (-1 / 1), as for the burrback.
- After the tumble: it climbs to a perch and tells again if it can see her and she is inside its leash, else home.
- **Pogo**: a down slash bounces her exactly as off a pod (`vy -15.5`, dash + double jump back) and
  costs it 1 hp; it is batted 32 px down. Two in a row, ~300 px apart at the same height, are a chain.
- **Death**: `dead` for at most 40 frames after the hitstop: the knockback carries on, gravity 0.45
  px/f² up to 9 px/f (the only time it has any), one-ways do not catch it. If it comes down on
  something first: `landed`, it lies 6 frames. Then `gone`. Spills 3 glints (5 from the finisher)
  through the burrback's queue: the first 16 frames after the blow, then 5 apart, from wherever the
  body is; `pickup {enemy: true}`.
- **Calm** (`KindRules.calm`, `calmEnemies` in `enemies.ts`; goal.md): a lantern kindled within 900 px, or the
  end of the run (every creature), settles them: a burrback stands (`pause`, not a turn) for the given frames; a
  lampwing that is `curious` / `pursue` gives up with cause `calm`. From `gather` on no lampwing notices her and
  contact does nothing.
- Two lampwings closer than 72 px (centres) push apart (up to 0.3 px/f²): on top of the same hero
  they stay more than 20 px apart, not stacked. Burrbacks and lampwings ignore each other.
- Re-form: living ones are back at home, hovering, **wounds kept**; dead ones stay dead. Restart brings all back.

## Contact and health
- 4 lights (`health.max`). Her box overlapping a living enemy costs 1, unless: she is invulnerable
  (`invuln > 0`), she has faded, or the creature is in the first `hurtSafeFrames` of its `hurt` (plus the
  hitstop): burrback 8 of 14, lampwing all 16. **Chosen: harmless for 8 of the 14 stagger frames, not all of them.** A cut at point
  blank is never punished on the spot, but running on through the creature she just hit is (she
  reaches it about 10 frames after the hit): spacing is still the lesson. Its body never blocks her.
- Hurt: thrown away from the creature's centre, `vx = +-7`, `vy = -7`: a hop of 55 px back and 24 px
  up, landing 13 frames later. `stagger` 12 frames: buttons are ignored (nothing is buffered); `vx`
  fades by 0.3 a frame; in the last 3 frames left / right count again (air control), so a held
  direction shortens or lengthens the tail. Then full control. Slash, glide, dash and wall slide end
  (`slashEnd` / `glideEnd` reason `hurt`, `dashEnd`, `wallSlideEnd`); the combo starts over.
- `invuln` 70 frames from the hit (so 58 after control returns): hit to hit is exactly 70 frames if
  she stays inside it. She walks through enemies meanwhile.
- 7 / 7 are the orchestrator's starting numbers and the only ones traced (not compared against
  others): she lands 55 px away with the creature's edge ~30 px from her, and it needs the rest of
  her safety to walk that, so standing still after a hit means a second hit exactly as the safety
  ends. On the 288 px far ledge a hit near the edge drops her off it.
- Landing from the throw is a `land` event next to the creature, so it flinches: a free beat to
  recover. Kept on purpose.

## Fade and re-form
- At 0: `hurt` (hp 0) then `fade`. `faded` 50 frames: no control, the body takes the throw, falls and
  lies there; enemies cannot touch her. Then, at the start of the step after, a fresh player at the
  last safe ground with **2 of 4 lights** (`health.reformHp`) and 90 frames of `invuln`, same facing,
  `attackSeq` kept: `reform {x, y, fromX, fromY, hp, hpMax, invuln}` and, right after it, `spawn`.
- **A fade costs** (it used to be a better heal than resting: full health, nothing lost). Besides
  the 2 lights, a third of her wallet (`health.fadeDrop`, rounded down; nothing under 3 glints) is
  left as a cluster where her body lay (settled onto the ground under it): `glintsDrop` in the
  re-form step, `pickups.drops` / `lost` (pickups.md). It waits there until she touches it; a second
  fade adds a second cluster. Chosen: a third, not all (Hollow Knight's shade takes everything: too
  hard for a gentle scene, and with 12-glint lanterns losing 4 of 12 already means another trip);
  2 lights, not 1 (one touch from fading again on the walk back would make a death spiral) and not
  3 (then a fade next to a lit lantern is still the quickest heal). At a lit lantern the 45-frame
  rest makes her whole: resting is the heal now.
- Kept: two thirds of her glints (the rest lies in the cluster), open pods, dead enemies, lit lanterns, **and every living creature's wounds** (playtest 5, above). Reset: every living enemy goes to its start.
- With a lantern lit she re-forms at the lit lantern she last stood at instead (goal.md), whatever is near it.
- **`enemyReset {id, kind, x, y, fromX, fromY, hp, hpMax, healed (0 now)}`** right after `reform` / `spawn`, one for
  each LIVING creature that was away from its start (none for one that stood whole at home):
  playtest 4 "burrbacks heal to full when she fades; not shown".
- **Last safe ground** (`player.safeX/safeY`, feet centre): updated every frame once she has been, for
  30 frames in a row, grounded in mode `normal`, in control, with her centre over a solid that is not
  tagged `pool` (so not on a one-way branch, not in the pool), and no living enemy within 200 px of
  her centre, measured to where it is AND to where it starts (they go home when she re-forms); for a
  lampwing the home distance is its radius + 260 (its territory and its sight), so nothing notices
  her the moment she is back: F1, the left of F2 and of F3, and the left end of the high ledge are
  not safe ground while their lampwing lives. Starts
  as the scene spawn. If at re-form a living enemy's start is within 200 px of it anyway, the scene
  spawn is used. `teleport` keeps the old safe spot (being placed somewhere does not make it safe)
  and her health.
- The sim's first use of a scene tag: `pool`.

## What render gets
- `state.enemies[i]` (`EnemyState`, exported from `src/sim/index.ts`; in `SimView.enemies`). Every
  kind: `id`, `kind`, `x, y, w, h` (top-left, integers), `vx, vy` (px/f this step), `facing`, `hp`,
  `hpMax`, `mode`, `modeFrames` (0 on the change; holds during `hitstop`), `timer` (frames left of a
  timed mode), `homeX, homeY`, `knockVx, knockVy`, `hitstop`, `hitBy`, `hitDir` (side, -1 / 1),
  `hitPower`, `hitFrame` (sim frame of the last hit, -1 = never: flash from `sim.frame - hitFrame`),
  `gone`, and the spill queue `spill, spillTimer, spillGap`.
- Burrback: `mode` `walk | pause | alert | hurt | dead`, `turning`, `stride` (px walked, never the
  shove: drive the legs with it), `teeter`; `vy` and `knockVy` are always 0.
- **Lampwing**: `mode` `hover | curious | dive | stall | pursue (the climb) | rest | return | hurt | dead`.
  Events `enemyDive`, `enemyStall`, `enemyClimb` (above); `dives`, `span`, `fromX, fromY`, `sight`; `flap` runs
  0.03 beats/frame in the dive (wings folded), 0.07 stalled.
  - `vx, vy`: its own flight while it flies; while `hurt` / `dead` the knockback (and the fall); 0
    in a hitstop. `facing`: the way it looks: its drift while hovering / returning (flips past 0.2
    px/f), her side while curious / pursuing; unchanged while resting, tumbling, dead.
  - `targetX, targetY`: what it is drawn to: the wander point (`hover`), her body centre or where it
    last saw her (`curious`), where she stood when the tell ended (`dive`, `stall`), its perch (`pursue`), its home (`return`; a detour corner for a moment). `lookX,
    lookY`: the unit vector from its centre to that (kept from before while `rest` / `hurt` / `dead`).
  - `flap`: wing-beat phase in [0, 1), one unit = one beat, advanced by the sim every step it is not
    held or dead: 0.10 beats/frame in a still hover (6 Hz) rising with speed to 0.17 at full pursuit
    (10 Hz), 0.21 while curious (the flutter of the tell), 0.04 while tumbling. Each starts out of
    step with the others. No render clock needed; interpolate it like a position (mind the wrap).
  - `timer`: frames left of `curious` (30), `rest` (60), `hurt` (16), `dead` (40, or 6 once
    `landed`). `chase`: frames of this climb (of 70). `lost`: frames since it last saw her.
    `landed`: the dead body lies on something. `radius`: its territory.
  - A hit is `hitFrame`; the tumble is `mode: 'hurt'` with `knockVx / knockVy` fading; a kill is
    `mode: 'dead'` (the body then moves by `vx, vy` each step until `gone`).
- **Burrback's ram** (above): `mode` `windup | charge | recover` as well; `timer` = frames left of
  `windup` (26) and `recover` (30 / 66 tired / 90 at a wall, or what is left of it after a stagger); `rams`, `roused`, `stirred`, `broken`, `fenced`; `braced` (shell forward: windup + charge); `chargeLeft` (px left of the
  ram, 180 from the brace); `strikeCd` (frames until it may brace again). `vx` = +-10 in the ram, the
  bounce off her inside `recover`. `stride` counts the ram's px too (legs).
- Events (enemy events: `x, y` = centre of its box): `enemyWindup {id, kind, dir, frames, px, speed}`,
  `enemyCharge {dir, px, frames}`, `enemyRecover {dir, cause, frames, cooldown}`, `enemyBlock {hitX, hitY,
  facing, slash, dir (the cut's way), step, hitstop, recoil, mode, frames}`, `enemyReset` (after a
  re-form), `enemyTurn` cause `hit` (frames 0); `enemyTurn {id, kind, dir, cause: ledge|wall,
  frames}`, `enemyAlert {id, kind, facing, dir (her side), cause: land|slash, frames}` (burrback);
  `enemyNotice {id, kind, x, y, dir (its new facing = her side), frames (30)}`, `enemyGiveUp {id,
  kind, x, y, facing, cause: far|lost|tired|dark|touch, frames (60, the rest)}` (lampwing; `enemyNotice.frames` is 36 now);
  `enemyHit {id, kind, facing, slash, dir, power, hpLeft, hpMax, knockback, hitstop, frames}`,
  `enemyDie {..., value, glintFrames, stagger, frames}` (lampwing: `knockback` = 6.6 / 12.1, the
  shove goes along `slash`; `frames` 16 / 40); `slashHit` / `impact` fire for enemies too, `target:
  {kind, id}`; `hurt.source.kind` says who touched her.
- The pickup renderer flies a dead lampwing's glints unchanged (it reads `spill / spillTimer /
  spillGap`, `hitDir` and the body's box by index; `enemyDie.slash` shapes the fan).
- Player: `hp`, `hpMax`, `invuln`, `stagger`, `faded`, `hurtDir` (the way she was thrown), `hurtSeq`
  (hits taken), `safeX`, `safeY`. `motion` is not extended: during `stagger` it reads `rise` / `fall`,
  while faded `fall` then `idle`; key the poses off `stagger > 0` and `faded > 0`.
- `hurt {x, y, dir, hp, hpMax, damage, source: {kind, id}, hitX, hitY, stagger, invuln}`, `fade {x,
  y, frames}`, `reform` (above).

## Where the burrbacks are (6: three on the critical path, each a different fight since playtest 5)
**burr-path** (4 hp, open ground, alone: the teaching fight) | **burr-shaft** (5 hp, 256 px between the doorway
and trunk B: bait the ram into the bark; **on the main line now**: trunk A's west bark takes no kick
(`kick: 'east'`), so the well leads through the doorway and every climber meets it; `lamp-trunk` before it) |
**burr-rise** (5 hp, **under `wing-rise`**: two tells to manage, the last and the hardest; `lamp-rise` before it).
| id | feet x, y | surface (its box's range over a minute) | why |
|---|---|---|---|
| burr-bank | 200, 1088 | left bank 0-384: **0-288** (wall, lip) | guards the great glint on the bank |
| burr-path | 2160, 1280 | ground right of the pool 1856-2432: **2004-2316** (`radius` 130) | the first fight, under the branch. Clear of the pool's landing (it starts 52 px further out) and of the bluff's foot: it used to walk right up to that wall and hit a first-timer three times while she worked out the climb |
| burr-ledge | **3090**, 448 | the branch by trunk A: **3004-3176** (`radius` 60, **`fenced`**; it was 2936, r 48: hopping its ram ended off the ledge's west end. Nothing rises through the branch any more) | by pod-ledge (3050), the big one. East of 2976 the ledge is a branch she comes up through from the well (the bark of trunk A, her swing reaches 3015-3200): with its old range (to 3232) it stood on her as she rose through it |
| burr-root | **4572**, 1280 | the foot of the right rise's step: **4506-4608** (`radius` 40; the rise's wall) | playtest 6 (above): east of every tap jump from the root and of a walk off the rise. `lamp-root` (4350) is the rest before it. It was 4340-4608 (playtest 3: 4160-) |

| **burr-shaft** | 3450, 1280 | the shaft floor: **3378-3522** (`radius` 46) | playtest 4: guards `pod-shaft` and the way to trunk B's foot (`great-arch`). 50 px inside the shaft from the doorway (in the doorway she cannot jump: it does not brace at her there), 62 px short of trunk B's bark where she stands to start the climb. A 256 px arena with a wall each side: its ram always ends at a wall, a wall kick clears it |
| **burr-rise** | 5010, 1088 | the right rise between `lamp-rise` (4760 since playtest 6) and the heart: **4914-5106** (`radius` 70, lamp lit or not) | playtest 4: the walker's last fight, on 550 px of flat ground. 140 px past where the stair from the summit sets her down (4770), 58 px short of the heart's box. `pod-row-1` (5060) is in its patch. A glider who lands on the far bluff comes to the heart from the east and never meets it: her encounter is `lamp-sky` |

- **`radius` on a burrback** (scene data, optional, 40-2000): its box centre stays within that of where it
  started, where its ground would let it go further; the end of the range turns it like a wall (`enemyTurn`
  cause `wall`, 24 frames). burr-path has one (above).
- **No burrback on the terrace** (the old burr-rise there is gone, 2026-10-14; the name is the rise's now): every way off the bluff's east lip comes
  down somewhere on it (a walk off 170 px out, a tap jump 300, a jump held from the branch 200-230, a held
  run-off glides its whole length), so no patrol there was fair, like the far ledge. A sixth ground with
  the same problem is the spawn ground: a patrol that reaches the first lantern walks through the spawn
  point (tried and removed).
- **Turn pauses**: `turnPauseFrames` 24 at a wall, a lip or the end of its range; `turnPauseShyFrames` 36
  when it shies from a lit lantern (`lantern`) or from an edge she is under (`wary`): room for the acting.
- **burr-far is gone** (was 5620, 448 on the far ledge). No home for it was fair: on the 288 px far ledge
  every spot is under F7's full jump (55 of 60) or the glide's landing; on the right rise a jump up from
  the root's flat lands 220 px in, on anything short of the pogo row, and the row is kept clear on
  purpose; in the hollow (224 px) running in hit it 48 times in 60. The far lantern's guard is
  lamp-glide-2 now (goal.md). A sixth burrback needs a new stretch of ground, not a new spot.

**burr-root's arrivals** (`critical-path.test.ts`, 60 start times each, then 45 frames standing): running off
the root (lands 4283), out of the hollow with a held jump (4280) or with taps and off the root, walking off
the catch branch (she lands on the right branch at 4420, not on its ground), stepping off it and letting go
(4185), a tap jump (4516 on the branch) or a held jump off the catch branch or the bough (over everything),
walking off the right branch westward (onto the root), **and since playtest 6 a tap jump from the root's lip
(3, 5, 8 frames; at the lip, 40 and 80 px before it), a walk and a tap jump off the rise's west lip**: 0 hits
in every one. Not fair, and left so: running on 20 frames after landing (that is walking into it), and the
two named under playtest 6 above.

Landing audit (`tests/unit/burrback-lips.test.ts`: five minutes, with her standing under each lip in
turn): no burrback box ever enters 1856-1952 (out of the pool), the whole terrace, 288-384 (onto the
bank), 2816-2912 (F5 -> high ledge), the well and the doorway (3072-3340), trunk B's foot (3540-3744), the
rise where the stair sets her down and its lamp (4608-4910), the heart and the ground east of it
(5164-5472), the far bluff's top. The pool's left side has no burrback at all. (A ram can carry one out
of its patch, but it only braces at one who is inside the patch or has cut it.)

None on the spawn ground (384-1536: the whole run would be its patrol, the spawn included, and the
close-up shots start there), none on the terrace, none on the far bluff's top. `?nopickups` removes the
enemies too (clean plates; the close-ups at 3456, 1280 are in burr-shaft's patch otherwise).

## Where the lampwings are (7)
`wing-rise` (5090, 900, r 50): over burr-rise, under F7's west end, 188 px over the rise. It does not see the
stair's landing (4770) nor `lamp-rise` (4760). Not `lamp-...` (those ids are also the wayside lamps'). A simple pilot that only
fights the burrback takes its dives; the careful one steps out of them and cuts it in its stall.
| id | home x, y | radius | where | why |
|---|---|---|---|---|
| lamp-glade | 800, 690 | 100 | over F1, in the glade | the first one met: it sees her as she jumps from the bank and comes down to her on F1, where she has footing |
| lamp-f3 | **1470, 420** | 60 | high over F3's middle | playtest 4: at (1290, 480) it sat IN the arc of the F2 -> F3 jump (hit 0.2 s after its tell, twice). Now 90 px east of that arc: the jump is noticed, and it comes down to her on F3's 256 px of footing. A hero standing under it on F3 is noticed too (244 px) |
| lamp-ledge (`sight` 400 since playtest 6) | 2700, 150 | 90 | over the F5 -> high ledge gap | a plain jump passes just under it (a double jump meets it); comes down to the ledge with burr-ledge and the big pod; the mid-glide kill off trunk A |
| lamp-glide-1 | 4620, 200 | 60 | under the summit glide line. **Not at (4470, 270)**: a held jump off the bough's end or the catch branch's end (the walker's road east since playtest 3) falls through (4460-4500, 250-350) before the wings open, and it sat there (hit 55 of 60, both). At 4620, 200 both arcs pass 140+ px under it (0 of 60), nothing on the bough, the catch branch, the right branch or F6 is noticed, the full summit glide passes 300 px over it | the first bounce of the pogo chain |
| lamp-glide-2 | 4900, 250 | 60 | 280 px on (the pogo chain still holds: lampwing-pilot) | the second bounce; and the far lantern's guard: 646 px from it, inside its leash (520) + the sanctuary edge, so it follows the summit glide (which passes 200 px over it) to the lantern and gives up at the light. Not nearer: at (4960, 330) it noticed her on F7 |

| **lamp-sky** (`sight` 500: it sees the glider coming and dives where her glide will be; a flight that only holds is hit, a forward cut on the way in still clears it; it also sees one who stands on F7) | 5180, 105 | 50 | ON the summit glide's line (her body passes x 5180 at y ~107) | playtest 4: the crossing's encounter. She sees it 1.8 s ahead; it notices her 230 px out and a flight that only holds the button flies into it 21 frames after its tell (22 of 24 start times). **One forward cut on the way in, wings open, and she flies on through its tumble** (24 of 24 untouched), or she closes her wings under it. More than its sight east of the pogo chain's second bounce, so the chain does not wake it; a jump on F7 does |

- None over the pool: `glide.test.ts` dives into it from (1696, 900) and anything within ~300 px of
  that column meets her. None near the spawn ground or under the trunks (the close-up shots).
- The two glide ones have small territories on purpose: their height is the route. From trunk B's
  top: jump, double jump, glide right; close the wings to come down on each, down slash, glide on.
  One pass leaves both at 1 hp; a second pass kills both.
- A lampwing home must not have a solid straight above or below it within reach (it would have to
  detour every time it goes home); all five are in clear columns.

## Audit
- A burrback never blocks a route: one plain jump clears it from either side (piloted for all six).
- A hit can knock her off a ledge or into the pool; she lands, keeps control, and no edge of the
  scene can be crossed. Nothing can trap her: at worst four hits, then she re-forms 200+ px from
  every living enemy.
- The route pilots of scene.test / pickups-pilot / pods-pilot pass with the burrbacks in place.
- Lampwings (piloted in `lampwing-pilot.test.ts`): each can be killed with real inputs (two from
  their islands with cuts and no scratch, one in mid-glide with a forward cut then an up cut from
  under it: 24 of 25 start times, 17 untouched; two by pogo + pogo over two summit runs). A pursuit is
  never more than three dives (under 10 s) and is followed by at least 100 frames without one. A hero who stands on an
  island and never fights is knocked along it a hit at a time and finally off it, to ground she can
  leave; a hit in mid-glide over the right zone drops her between the root and the right rise, one
  jump from either. The route, pickup, pod and burrback pilots pass with them in place.
- Gotcha found here: `placePlayer` (teleport) used to reset `attackSeq`, so after a teleport the
  first slash could pass through whatever slash 1 had hit before (`hitBy`). It keeps the count now.
