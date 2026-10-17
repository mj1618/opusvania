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
  shape changes, so any window shape is covered), `playfield` (static, drawn once), `goal` (lures, behind her),
  `air` (creature boxes, lure effects, freed moths, labels: over her).

## What is drawn (palette: `palette.ts`)
- A 256 px world grid at 6% (on a flat background it is the only thing that shows speed).
- Solids: flat `#434b5a` with a 4 px light top (the walkable line); faces with `kick: false` / `east` / `west`
  get a dark band on the faces that take no kick. Tag `pool` = hazard, red. One-ways: a light line with ticks.
- Catch zones: red wash, dashed rim. Exits: a green bar on the open span. Rest points (lanterns, lamps): cyan
  pillar; the heart: violet box. The spawn: a chevron.
- Creatures: their hitboxes in the overlay's state colours (`drawEnemyBoxes`, exported from
  `src/debug/overlay.ts` and shared with F2).
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
