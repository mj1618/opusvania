# The level kit (2026-10-18)

Generic, data-driven level pieces any room can use, built for the wood (docs/design/regions/wood.md §7 "Terrain the
sim doesn't have yet"). Sim: `src/sim/kit.ts` (+ `kit-data.ts` types, `kit-events.ts`), `src/sim/paths.ts`
(pendulum); data: `src/scene/kit.ts` (Zod + placement rules, spread into `parseScene`); render:
`src/render/greybox/kit.ts`, `src/render/camera/zones.ts`; overlay: `src/debug/kit-overlay.ts`. Lab:
`?room=lab-kit` (a test room, every ability; stations A-F). Tests: `tests/unit/kit.test.ts`.

## Room JSON
| field | shape | what |
|---|---|---|
| `thorns` | `[{id, x, y, w, h}]` | hazard rect, not a solid (sit it on / against a solid) |
| `seedCases` | `[{id, x, y}]` centre | static pogo target, box `kit.seedCase.size` 56 square, never breaks, never blocks |
| `bark` | `[{id, x, y, w, h, floor?, hp?, kick?}]` | rotten bark: a solid until `hp` (default 3) cuts; `floor: true` = a floor panel (down cuts only) |
| `gates` | `[{id, x, y, w, h, flag, kick?}]` | a solid while `save.flags` lacks `flag` (the silk curtain) |
| `triggers` | `[{id, x, y, w, h, sets}]` | her box centre inside sets the flag `sets`, once |
| `lures[].swing` | `{length, reach?, period?, phase?}` | the lure hangs `length` under a pivot over its `x, y` (the bottom of the arc), swings `reach` px each side, one swing there and back per `period` frames |
| `camera.zones` | `[{id, x, y, w, h, zoom?, fit?, lock?, bounds?}]` | render only: inside the rect (her body centre) the view eases to `zoom` (`fit`: the frame inside the 16:9 safe area) and keeps inside `bounds` (`lock`: the zone itself) |
| `routes[].flags` | `string[]` | the world check: the way needs these flags |
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

## Events (`x, y` = the piece's centre unless said)
`thornHit {id, x, y (her feet), hp, damage, frames}`, `barkHit {id, dir, hpLeft, hpMax, floor}`, `barkBreak {id, w, h,
dir, floor}`, `kitClang {id, kind: 'seedCase', hitX, hitY, dir, hitstop, recoil}`, `flagSet {flag, by}`,
`gateOpen {id, flag, w, h}`; `slashHit.target.kind` `thorns | seedCase | bark`; `hurt.source.kind` `thorns`.

## Greybox look
Thorns red with teeth; seed-case an amber ring; bark a brown hatched panel with cut pips and spores rising from
its seams (the one secret language), a ghost outline once broken; a gate a pale silk curtain that drops on
`gateOpen`; a trigger a dashed cyan plate; a camera zone a dashed violet frame; a swinging lure its chain and
pivot. Labels with G. **Painted rooms draw none of the kit yet.** Room-fade dips over a thorn's hold.

## Not done / gaps
- The map does not draw bark or gates (a broken-bark doorway shows as open air there).
- A zoom < 1 in a PAINTED room shows past the bakes' coverage (they cover the cap view at zoom 1); greybox only.
- Hurt audio / character art for thorns use the generic `hurt`; no kit sounds yet.
