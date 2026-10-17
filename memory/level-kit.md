# The level kit (2026-10-18)

Generic, data-driven level pieces any room can use, built for the wood (docs/design/regions/wood.md §7 "Terrain the
sim doesn't have yet"). Sim: `src/sim/kit.ts` (+ `kit-data.ts` types, `kit-events.ts`), `src/sim/paths.ts`
(pendulum); data: `src/scene/kit.ts` (Zod + placement rules, spread into `parseScene`); render:
`src/render/greybox/kit.ts`, `src/render/camera/zones.ts`; overlay: `src/debug/kit-overlay.ts`. Lab:
`?room=lab-kit` (a test room, every ability; stations A-F, G caps / stone / sign, H a hollow behind bark). Tests:
`tests/unit/kit.test.ts`, `tests/unit/kit-finds.test.ts`.

## Room JSON
| field | shape | what |
|---|---|---|
| `thorns` | `[{id, x, y, w, h}]` | hazard rect, not a solid (sit it on / against a solid) |
| `seedCases` | `[{id, x, y}]` centre | static pogo target, box `kit.seedCase.size` 56 square, never breaks, never blocks |
| `bark` | `[{id, x, y, w, h, floor?, hp?, kick?}]` | rotten bark: a solid until `hp` (default 3) cuts; `floor: true` = a floor panel (down cuts only) |
| `gates` | `[{id, x, y, w, h, flag, kick?}]` | a solid while `save.flags` lacks `flag` (the silk curtain) |
| `triggers` | `[{id, x, y, w, h, sets, hold?}]` | her box centre inside sets the flag `sets`, once; **`hold`** (frames, <= `kit.storyHoldMax` 180: journey.md's 3 s) makes it a held story beat: from the next step no input for `hold` frames, untouchable, `storyHold {id, frames}` / `storyHoldEnd {id}`, a button still held at the end is not a press (feel review round 2, problem 8: for the staging's vista and glimpse) |
| `lures[].swing` | `{length, reach?, period?, phase?}` | the lure hangs `length` under a pivot over its `x, y` (the bottom of the arc), swings `reach` px each side, one swing there and back per `period` frames |
| `camera.zones` | `[{id, x, y, w, h, zoom?, fit?, lock?, bounds?}]` | render only: inside the rect (her body centre) the view eases to `zoom` (`fit`: the frame inside the 16:9 safe area) and keeps inside `bounds` (`lock`: the zone itself) |
| `routes[].flags` | `string[]` | the world check: the way needs these flags |
| `caps` | `[{id, x, y, w, h, tier?: small/mid/big, height?, kick?}]` | bounce cap: a solid (`kit: 'cap'`, never safe ground) whose top throws her up `kit.caps.tiers[tier]` px (or `height`) |
| `mothStones` | `[{id, x, y (foot on a top), area}]` | touched: draws `area` (world.json `areas`) on the map |
| `signs` | `[{id, x, y (foot on a top), flag?, rhythm?}]` | firefly sign: read by standing still beside it; `rhythm` `.`/`-` for render |
| `hollows` | `[{id, x, y, w, h, upgrade}]` | moonlit hollow: body centre inside grants `upgrade` (an id of `UPGRADE_IDS`) |
| world.json `areas` | `[{id, rooms: [placed ids]}]` | the areas a moth-stone can draw; each room in one area |
| `lures[].after` | flag | the lure burns only once the flag is set (out before, lit the step it appears, out for good once snuffed: the firefly's glow-cap W-ff after the glimpse) |
| `oneWays[].noDrop` | bool | down + jump does not drop through it (still passable from below): the hub's root mesh over R10's climb-out, whose drop-through skipped the pit (sim: `noDropUnder` in physics/aabb.ts, checked in `tryJump`) |
| `enemies[].sets` | flag | set when the creature dies (`flagSet` by its id): a flag gate opens behind it (the old burrback's root gate). The world check cannot see it: leave it out of `routes[].flags` |
| `reform` | `{x, y}` | where a fade re-forms her in this room while no moon patch is saved (no light either), instead of her last safe ground beside whatever faded her (`src/sim/index.ts`) |
Ids share the room's id space (`two things are called`). Bark / gate must not overlap a solid (they ARE the solid);
a swinging lure's core must be clear along the whole arc and its pivot inside the room.

## Rules and why
- **Thorns = Hollow Knight's spike rule**: 1 light (`hurt`, source `{kind: 'thorns'}`), then she is held
  `holdFrames` 30 (it reuses `state.caught`: no input, no exits; `catchHold` gives the thorn's length) and put back
  on her last safe ground (`fallReturn` id `thorns:<id>`, `returnPoint`'s inset), `returnInvuln` 60. Chosen over the
  enemy rule (throw and play on) because a throw off thorns lands in more thorns and a bed can't be "spaced".
  **Thorns ignore i-frames** (a creature's blow never carries her across a bed for free). The last light is a
  fade instead (no hold). Safe ground is never within `safeMargin` 96 of a thorn rect (48 put her back one
  step from the bed: walking on re-entered it) nor on a kit solid (`SolidRect.kit`).
- **Returns never chain** (impatient first-timer, 2026-10-17: put back on R6's T3 with jump + right still held, she
  re-jumped into the thorn branch: 3 hearts in ~3 s, twice; `placePlayer` zeroes `prevInput`, so a held jump read as
  a press). After any `fallReturn` (thorns or a fall catch) and any `reform`: an 18-frame fade-in (`room.returnFadeIn`:
  no input, untouchable; `fallReturn.fadeIn`, `reform.fadeIn`), and no button held as she came back is a press until
  it is let go (`player.inputLock`, OR-ed into the controller's previous input). Its hold still acts: held right + jump
  she walks off the lip with the wings open (the walk-off line), never a jump by itself. And the return spot
  (src/sim/return.ts `clearOfThorns`) steps back from the lip she left `room.returnProbeStep` 40 px at a time until a
  jump held toward that lip (and the glide after it) meets no thorns within `returnProbeFrames` 180: a short run of the
  real controller on a copy of the state, once per return. On the first-timer's gap 3 (branch at 1112-1272) she went
  back 72 px from the lip, where every jump-glide meets the branch; now 312 px, where a standing jump-glide lands on
  T4. Tests: `tests/unit/hazard-return.test.ts` (a copy of that gap: R6's branch has since been raised to 920).
- **Pogo**: a down cut in the air on thorns / a seed-case / standing bark bounces (`pogoBounce`, refills) with the
  pogo's hitstop 2 (the rhythm). The step a down cut lands on thorns, their touch is forgiven.
- **Seed-case clang**: forward / up cut = `kitClang`, hitstop 6, thrown back 8 px/f (the burrback glance's numbers).
- **Bark**: one hit a cut whatever its power (the doc says "3 cuts"; a finisher must not make it 2). Hitstop 4 (a
  creature's) per cut, 8 for the break (near a snuff's 9: a find). The break writes `room:id` into
  **`save.opened`** (the shortcuts' list: no save-format change, no migration) and the solid is gone from the next
  step. The cut that breaks a floor panel does **not** bounce: she drops through. Partial cuts are room-local
  (`state.kit.bark`), so a half-cut wall heals when she leaves.
- **Gates**: `withShortcuts` (src/sim/world.ts) adds standing bark and shut gates to the solids (cached by key);
  `gateOpen` fires when the flag appears however it was set (trigger, debug, a boss later).
- **Grate from below**: already expressible: a `shortcuts` entry with `opens: 's'` opens when her head meets its
  underside (a kick climb, a double jump). Lab station D shows it; no new code.
- **Swing**: `paths.ts` `swingOffset(swing, frame)`: dx = reach x sin (Bhaskara's rational sine, within 0.2%: no
  engine trig in the sim), dy = the arc's rise. `lureAt(l, frame)` is used by every lure rule (pull, core, orbit,
  flame box, events), so pull, catch and orbit follow the flame. Pure in the frame: render calls it with
  `sim.frame - 2 + alpha`. Defaults `tuning.lures.swing` {reach 120, period 150}. Drifters can add a path kind.
- **Camera zones**: `CameraState.zoom` and an eased shift `ox, oy` (springs, `cameraTuning.zones` {frames 30,
  zoomFrames 30}); the clamp and the feet line use the zoomed view; `lerpCamera` interpolates the zoom. Lab arena
  2176 x 1280 -> fit 0.844 (the Weaver's 2176 x 1216 -> 0.88). A wider window sees more around, still centred.

- **Bounce caps** (`kit.caps` {tiers small 320 / mid 448 / big 640, heldScale 1.2}): landing on a cap's top
  (grounded on it, not dashing, not in hitstop) or a pogo off it throws her the tier's rise. Jump held as she
  meets it = `heldScale` x (a pogo counts as held). The speed is exact for the integrator: `speedForHeight(g, h)
  + g` (set after the step's move, so the next step takes one g off first: without the + g every bounce was 24-34
  px short). The press that meets a cap is spent on it (`jumpBuf`, `djBuf` cleared: else the buffered double jump
  fired a frame later and killed the bounce). Refills like a pogo. Works with glide (jump held: the wings open
  after the apex). One cap hit a slash (`capHitBy`).
- **Finds** (`src/sim/finds.ts`, run from `updateKit`): all once ever, kept in **`save.taken`** as `room:id` (the
  glades' list: no save-format change). A **moth-stone**: her box touching `finds.stoneWidth` 96 x `stoneHeight`
  160 over its foot. A **sign**: grounded, no direction, not moving, not slashing, `signFrames` 40 inside
  `signWidth` 200 x `signHeight` 200 over its foot; sets its `flag`. A **hollow**: body centre inside; sets the
  flag `upgrade:<id>`.
- **Upgrades** (`src/sim/upgrades.ts`): flags `upgrade:<id>`; `step` starts with `t = withUpgrades(base, save)` (a
  shallow copy of the changed groups, only when one is owned; else the same object), so `resolveParams` and every
  rule read upgraded numbers. Render / debug that show a number (the beat pips, `lures().caught.of`) call it too.
  The list (numbers in `tuning.upgrades`): **quickWings** (beat free in 2, not 3; the wood's hollow), **keenBlade**
  (flame hit box +20 px). The rest of core.md §6's list waits for the abilities they change.
- **The map** (`src/render/map/`): a read stone's area shows every room of it, unvisited ones faint (shape only),
  with `<area>: N lamps unseen` (lures not in `seen`, not snuffed). Kit solids (caps, standing bark, shut gates) are
  drawn too. In a test room with a stone read, the map shows the drawn area instead of the test room.
- **The world check**: finds never add abilities; a route can name a find (`kitNodes`), and every find must be
  reached (in a room with routes, name it in one: `find "room:id" cannot be reached`). Areas name placed rooms, a
  room is in one area, a stone's area exists (`validateWorld(world, areas)`; areas default to world.json's for
  the game world only).

## Events (`x, y` = the piece's centre unless said)
`thornHit {id, x, y (her feet), hp, damage, frames}`, `barkHit {id, dir, hpLeft, hpMax, floor}`, `barkBreak {id, w, h,
dir, floor}`, `kitClang {id, kind: 'seedCase', hitX, hitY, dir, hitstop, recoil}`, `flagSet {flag, by}`,
`gateOpen {id, flag, w, h}`, `capBounce {id, x, y (feet), vy, height, pogo, held}`, `stoneRead {id, room, area}`,
`signRead {id, room, flag, rhythm}`, `hollowGrant {id, upgrade}`; `slashHit.target.kind` `thorns | seedCase | bark |
cap`; `hurt.source.kind` `thorns`.

## Greybox look
Thorns red with teeth; seed-case an amber ring; bark a brown hatched panel with cut pips and spores rising from
its seams (the one secret language), a ghost outline once broken; a gate a pale silk curtain that drops on
`gateOpen`; a trigger a dashed cyan plate; a camera zone a dashed violet frame; a swinging lure its chain and
pivot. Labels with G. **Painted rooms draw none of the kit yet.** Room-fade dips over a thorn's hold.

## Not done / gaps
- A zoom < 1 in a PAINTED room shows past the bakes' coverage (they cover the cap view at zoom 1); greybox only.
- Hurt audio / character art for thorns use the generic `hurt`; no kit sounds yet.
