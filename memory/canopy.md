# The Canopy: the first area built to the reference numbers (v2, 2026-10-30)

Design, room list and measurements: docs/design/levels/first-area.md; review that drove v2:
docs/design/levels/reviews/canopy-r1.md; the reference data: docs/design/reference-levels/.
Open: `?world=canopy&fresh` (24 rooms `cn-*`).

## How it is made (tools/levels/canopy.ts)
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`. Edit the generator,
  never the JSON.
- `PLACE`: each room's world rect. `LINKS`: room pairs and the shared opening (`at` = floor y on a side edge, west x
  on a top / bottom edge; `span`; `one` = the side she drops from); both mirrors written with equal spans, exit ids =
  the other room's short name unless `ida` / `idb`. The constructor carves 128 px into every opening.
- **Carve, then fill**: `air(x0, y0, x1, y1)` carves caves; pieces that are their own solid carve themselves
  (`bark`, `gate`, `cap`); then `fill()` turns the rest into `root` (or `ground`: `mass: 'ground'`) rects. After
  `fill`: `mass()` blocks, `limb()`, `tree()`, creatures, pickups (helpers read the tops). `air` after `fill` throws.
- `back: true` (room) / `back()` (a rect): a back wall (`marks.backs`) and `camera.headroom: 0` (no sky band over
  the view's top edge). Enclosed rooms have one; vistas (hub, gap, crown, the way out's top) do not.
- **Every solid face takes the claws** (sim default `kick` true; the room's `edgeKick: false` is only the room's
  edges). Locks are faces with nothing near; `noClaws(x, y0, y1)` marks a face that must refuse (the far limb's face
  in the gap, the den's balcony). `tree(..., solid, kick)` defaults kick to **false**: pass `true` for a climbable tree.
- Covers sit over the mass with ~64 px of margin into it (the patch hides the crusts that face the hidden space).

## Gotchas found building v2
- **A claw climb needs nothing over the kicks' reach**: a kick throws her ~140 px off the face, so a limb within ~150
  px of the face anywhere above (not only at the top) caps the climb (the Grovemother's crown limbs had to move 192
  px off it).
- **A shaft's walls must come down to within ~250 px of the floor** or she cannot reach them (the well, the tunnel's
  door shaft (root curtains), the burrow).
- **A top exit must span the whole chimney** she climbs, or she rises along the wall outside the opening.
- Thorns on the only face of a climb stop the explorer's one-wall macros; put them on alternate faces with a clean
  way (the Spire).
- A `gone` creature in the explorer can come back and be pogoed: the proofs drop `enemies` from the scene itself.
- Glints placed in mass are lifted by `finish()` only while they leave the solid within 640 px.

## Proofs (tools/solve/canopy.ts [room ...], ~45 s for all 35 claims)
Reach and locks per room, explorer in the real sim, creatures out, lamps spent, glades out unless claimed. The placed
player's free double jump is still zeroed by the harness (`createPlayer` sets `dj` from tuning; sim bug not fixed).

## Render (pf-mass.ts, mass-patches.ts)
- Masses are painted as one body: each rect's sides split into exposed and inner parts (`exposedSides`); a crust
  root (the kit's limb painter) under every exposed top with the walk's moss on it, bark columns down exposed faces,
  a root along undersides with roots hanging; crust inner edges fade into the body (`fadeInto`); tops join the
  stretches (rim, growth) and undersides the hangs.
- Covers and rotten bark in a wood room are baked as the mass they sit in (`paintMasses` with the rect added,
  masked to it): covers in `layers.air` faded by the kit, walls behind her hidden on break with a faint seam drawn
  live. The seed door's seal is woven roots in the wood.

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there) then `area-svg.ts` / `svg-png.ts` /
`metrics.ts` (now with `critRooms`, `critRoomShare`).
