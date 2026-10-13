# Enemies and health: the burrback, being hurt, fade and re-form

Sim: `src/sim/enemies.ts` (creature, slash hits, glint spill), `src/sim/player/player.ts`
(`hurtPlayer`, `trackSafeGround`, `reformPlayer`), step order in `src/sim/index.ts`. Numbers:
`tuning.burrback`, `tuning.enemies`, `tuning.health`. Tests: `tests/unit/enemies.test.ts`,
`tests/unit/enemies-pilot.test.ts`. Nothing draws the creature, the hurt or the health yet.

## Step order (matters)
re-form if a fade just ended → `updatePlayer` (her slash is resolved inside it, against where the
enemies stood) → `updateEnemies` (move, modes, flinch; returns who touches her) → contact →
`hurtPlayer` → `trackSafeGround` → pods → pickups. So a slash and a touch on the same frame: the slash
wins (the creature is staggered and harmless before contact is tested).

## The burrback
- Scene data `enemies: [{id, kind: 'burrback', x, y, facing}]`, `x, y` = feet centre. Validated: unique
  id (also against pickups and pods), whole box on one surface, clear of solids, at least 300 px from
  the spawn. Box 52 x 34, 3 hp. `state.enemies[i]` belongs to `scene.enemies[i]`.
- Walks 1.6 px/f. A step is refused when a solid is in the way (`wall`) or its leading edge would be
  over nothing (`ledge`): it flips `facing` at once, stands 24 frames (`mode: 'pause'`, `turning`),
  walks back. Its whole box stays on its surface. No gravity: it cannot fall. One-way branches are
  floor to it. Enemies do not collide with each other (one per surface in the grove).
- Rests mid-walk every 150-330 frames of walking for 20-34 frames (`pause`, `turning` false): an
  integer hash of its id and how many rests it has taken. No RNG, so `state.rng` is untouched.
- Flinch: a `land` or `slash` event of hers within 160 px (box to box) while it walks or rests:
  `mode: 'alert'` for 18 frames, then it walks on. At most one per 45 frames after the last ended, so
  mashing next to it does not freeze it. It never turns to her or chases.
- Hit by a slash (once per slash, `hitBy`): loses the step's `power` (1, 1, 2). Held for the same
  hitstop as her (2 / 2 / 3: `enemies.hitstopFrames` + the step's bonus), then `hurt` for 14 frames
  while the shove plays: `knockVx` = the slash's `knockback` (6 / 11 px/f) fading 1 per frame = 21 px
  for a cut, 66 for the finisher, along a forward cut; an up or down cut shoves it sideways away from
  her at half strength. The shove stops at walls and at the brink of a ledge (at most `teeterPx` 10 of
  it hangs over; `teeter` = that side until it walks again; it then turns round and comes back).
- A full chain kills on the finisher; finisher + one cut kills; three pogo bounces kill.
- Death: `mode: 'dead'`, still shoved, body removed (`gone`) 30 frames after the hitstop. It spills 4
  glints (6 if the finisher killed it) into `state.pickups.count`, the first 16 frames after the
  blow, then 5 apart (3 apart for 6): `pickup` events with the enemy's id and `enemy: true` (NOT
  `pod`; the pickup renderer ignores them until someone draws them). Dead until restart.
- **No hitting through ground**: the line from her body centre to the centre of the part of the
  creature inside the hit area must not cross a solid's inside. Under a 48 px platform an up slash
  does nothing; a one-way branch does not block. It also means a creature at the lip of a step above
  her cannot be reached from below. Pods have no such test.

## Contact and health
- 4 lights (`health.max`). Her box overlapping a living burrback costs 1, unless: she is invulnerable
  (`invuln > 0`), she has faded, or the creature is in the first 8 frames of its `hurt` (plus the
  hitstop). **Chosen: harmless for 8 of the 14 stagger frames, not all of them.** A cut at point
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
  last safe ground with full health and 90 frames of `invuln`, same facing, `attackSeq` kept: `reform
  {x, y, fromX, fromY, hp, hpMax, invuln}` and, right after it, `spawn` (so cameras and springs snap
  today; a renderer that wants a pan can look for `reform` in the same step).
- Kept: glints, open pods, dead enemies. Reset: every living enemy, to its start with full hp.
- **Last safe ground** (`player.safeX/safeY`, feet centre): updated every frame once she has been, for
  30 frames in a row, grounded in mode `normal`, in control, with her centre over a solid that is not
  tagged `pool` (so not on a one-way branch, not in the pool), and no living enemy within 200 px of
  her centre, measured to where it is AND to where it starts (they go home when she re-forms). Starts
  as the scene spawn. If at re-form a living enemy's start is within 200 px of it anyway, the scene
  spawn is used. `teleport` keeps the old safe spot (being placed somewhere does not make it safe)
  and her health.
- The sim's first use of a scene tag: `pool`.

## What render gets
- `state.enemies[i]` (`EnemyState`, exported from `src/sim/index.ts`; not yet in `SimView`): `id`,
  `kind`, `x, y, w, h` (top-left, integers), `vx` (px/f this step: walk, shove, or 0), `facing`,
  `hp`, `hpMax`, `mode` (`walk | pause | alert | hurt | dead`), `modeFrames` (0 on the change; holds
  during `hitstop`), `timer` (frames left of the mode), `turning`, `stride` (px walked, never the
  shove: drive the legs with it), `knockVx`, `hitstop`, `hitBy`, `hitDir`, `hitPower`, `hitFrame`
  (sim frame of the last hit, -1 = never: flash from `sim.frame - hitFrame`), `teeter`, `gone`.
- Events (enemy events: `x, y` = centre of its box): `enemyTurn {id, kind, dir, cause: ledge|wall,
  frames}`, `enemyAlert {id, kind, facing, dir (her side), cause: land|slash, frames}`, `enemyHit {id,
  kind, facing, slash, dir, power, hpLeft, hpMax, knockback, hitstop, frames}`, `enemyDie {..., value,
  glintFrames, stagger, frames}`; `slashHit` / `impact` fire for enemies too, `target: {kind:
  'burrback', id}`.
- Player: `hp`, `hpMax`, `invuln`, `stagger`, `faded`, `hurtDir` (the way she was thrown), `hurtSeq`
  (hits taken), `safeX`, `safeY`. `motion` is not extended: during `stagger` it reads `rise` / `fall`,
  while faded `fall` then `idle`; key the poses off `stagger > 0` and `faded > 0`.
- `hurt {x, y, dir, hp, hpMax, damage, source: {kind, id}, hitX, hitY, stagger, invuln}`, `fade {x,
  y, frames}`, `reform` (above).

## Where they are (6)
| id | feet x, y | surface (patrol range) | why |
|---|---|---|---|
| burr-bank | 200, 1088 | left bank (0-384) | guards the great glint on the bank |
| burr-path | 2330, 1280 | ground right of the pool (1856-2560) | walks over pod-path-2 (3 hits): deal with it first |
| burr-rise | 3000, 1152 | mid rise (2560-3200) | by pod-rise |
| burr-ledge | 3000, 448 | high ledge + trunk A top (2816-3328) | by pod-ledge, the big one |
| burr-root | 4400, 1280 | between the root and the right rise (4160-4608) | under the right branch and its pod |
| burr-far | 5620, 448 | far ledge (5472-5760) | guards the great glint at the end of the right route |

None on the spawn ground (384-1536: the whole run would be its patrol, the spawn included, and the
close-up shots start there), none under the trunks (the wall-slide close-ups start at 3456, 1280),
none on the right rise (the pogo row). `?nopickups` does NOT remove enemies.

## Audit
- A burrback never blocks a route: one plain jump clears it from either side (piloted for all six).
- A hit can knock her off a ledge or into the pool; she lands, keeps control, and no edge of the
  scene can be crossed. Nothing can trap her: at worst four hits, then she re-forms 200+ px from
  every living enemy.
- The route pilots of scene.test / pickups-pilot / pods-pilot pass with the burrbacks in place.
