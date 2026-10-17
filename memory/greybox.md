# Greybox render mode (2026-10-17)

STUDIO.md: regions are designed and played in grey before any art. A room whose JSON says
`"art": { "mode": "greybox", "labels": true }` is drawn by `src/render/greybox/` instead of the painted layers
(`kit` / `seed` are then not needed; a painted room still must have both: `parseScene` checks). Example:
`content/rooms/lab-lamps.json`.

## How it plugs in
- `src/render/scene/index.ts`: for a greybox room `SceneRenderer.init` builds only `GreyboxLayer` (one
  `EnvModule`) instead of sky / far / mid / playfield / foreground / air. Nothing painted is baked: in the e2e (software GL) the
  lab boots and passes its three window shapes in ~3 s; wood-hatch and the grove take 20-27 s.
- `src/render/stage.ts`: for a greybox room `POST.enabled = false` (no bloom / grade) and the painted creature
  layers (`enemies`, `enemiesFront`) are hidden. Wing keeps her real rig. Pickups, goal, giving, HUD renderers
  run as usual (they draw what the room has).
- `isGreybox(room)` lives in `src/scene/room.ts` (render can import it without Zod).
- Layers used: `sky` (screen space: a 24-band vertical gradient over `ctx.view()`, redrawn when the view's
  shape changes, so any window shape is covered), `playfield` (static, drawn once), `goal` (lures, the snuff's
  dark, creatures' bodies: behind her), `air` (creatures' danger parts / tells / blows, motes, lure effects,
  freed moths, labels: over her).

## What is drawn (palette: `palette.ts`)
- A 256 px world grid at 6% (on a flat background it is the only thing that shows speed).
- Solids: flat `#434b5a` with a 4 px light top (the walkable line); faces with `kick: false` / `east` / `west`
  get a dark band on the faces that take no kick. Tag `pool` = hazard, red. One-ways: a light line with ticks.
- Catch zones: red wash, dashed rim. Exits: a green bar on the open span (label says `one way`). Rest points
  (lanterns, lamps): cyan pillar; the heart: violet box. The spawn: a chevron.
- The world's things (`greybox/world.ts`, memory/world.md): a moon patch is a pale stacked shaft (brighter while
  she stands in it; a filled moon over it once it is her save patch, a ring when she rests, "rested · saved");
  a glade a tall pale pillar (dim once taken; the grant flashes and its item line, the wood's own: "Your wings have dried. Hold jump to glide." / "Your claws have hardened. Jump at a wall to climb." (5 s),
  rides over her); a shortcut amber while shut with a white bar on the side that opens it, an outline once
  open; a door a green arch.
- Creatures (`greybox/creatures.ts`, 2026-10-17, feel review problems 2, 7, 8; F2 still draws the boxes):
  filled shapes at their hitbox, body under her, **danger part over her** (her rig hid the outlines at melee range).
  Burrback an earthen dome (`#7b6b5c`) with a dim-red shell-front plate; braced: the dome reddens, the plate goes
  white with a red rim, the ram's reach is a red line on the ground, the draining bar over it. Old burrback a bigger
  ridged dome; braced and not yet pogoed its shell top is the **seed-case amber** ("pogo me"), grey once
  `pogoed`; a wall stun turns it on its back (pale, legs kicking, a green bar for the open time); a clang: a white
  8-point star at `hitX, hitY` and a 4-frame shiver. Hawker a slate body, wings past its box, a beak / talons that
  point where it looks; the tell swells it 1.3x, flashes it in the hunt colour `#ff4a3c` (quicker as it nears),
  closes a hunt ring round it, and puts a **reticle on the ground under the point it will dive at** (tightens over
  the last 12 frames) with a dashed line; the dive leaves a 6-frame smear, the reticle stays on the committed point.
  Any hit: white for the hitstop + 2 frames, squash 1.15 x 0.85 relaxing over 4. A kill: a white silhouette for the
  kill's hitstop, then 8 shards and a ring, no body. Weaver / dangler / others: a filled box with a red front half.
  The weaver boss's body is boss.ts's; here only its hit flash. Yellow dot = aware, grey dash = asleep (as before).
- Motes (`greybox/motes.ts`, problem 10): landing dust scaled by `land.vy` (2-6 puffs; hard adds a flat ring),
  jump puffs (a wall kick's off the wall; a double jump a thin ring), wall-slide dust at her hand, sparks and a tick
  on `slashTerrain`. Painted rooms keep the painted field's dust (pf-field); these are greybox only.
- The snuff (`greybox/lures.ts`, problem 4): two frames of hot white on the flame, then a flat dark disc grows to the
  old pull radius over 0.5 s (peak 0.42) and settles to a lasting 0.2 wash: a cleared room looks darker, safe. A lure
  out before she came in has the wash only. Freed moths are 12 px chevrons now.
- Lures: memory/lures.md "Render".
- Labels (Pixi `Text`, monospace, world space): lure ids + kind + spin arrow under the core, exits, catch zones,
  rest points, creature ids at home, the spawn, and the room's `marks.notes` (`[{x, y, text}]`: designer notes,
  e.g. the lab's station letters). Toggle: **G** key, `__game.debug.labels(on?)`, `art.labels` at boot.

## Gotchas
- Pixi v8 `Graphics.arc()` continues the current path: `moveTo` the arc's start first, or every arc is joined
  to the previous point by a long line.
- Wing is dark: the background must stay a step above black (`skyTop #2e3542`, `skyBottom #1c2029`) or she
  disappears; solids are a step lighter still and she stands on a bright top.
- `?nopickups` keeps lures (they are not pickups).
