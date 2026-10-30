# The Canopy: the first area built to the reference numbers (2026-10-30)

Design and measurements: docs/design/levels/first-area.md; the reference data: docs/design/reference-levels/.
Open: `?world=canopy&fresh` (rooms `cn-*`: hatch, hub, west, grove, canopy, den).

## How it is made
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json` writes
  content/worlds/canopy-rooms.json and canopy.json (registered in src/scene/index.ts). Edit the generator, never the JSON.
- Wood kit with the level's pieces: `art.kit: 'wood'` + `art.pieces: true` (render/scene/index.ts adds Lanternroot's
  `LanternPieces`: bark, gates, covers, seeds, patches, glades, lamps, hawker, dangler). Covers in a wood room draw as
  a leaf clump (`leafCover` in render/lantern/kit.ts), not a black box.
- `Wood.limb()` makes a stretch: rolling `branch` rects (steps <= 12) + a `marks.stretches` entry with a height band
  (`y0`/`y1`, new: limbs stacked over the same x stay apart in pf-branch). `tree()` = a `marks.trees` entry (solid =
  a wall; `kick` for a claw climb).
- Placement helpers, each fixing a rule the scene check enforces: `pad()` levels the limb under a walker (its whole box
  on one top), `spot()` for pods (a rect no lower than its neighbours), `barkWall()` (foot on the highest top under
  it), `finish()` lifts glints out of rolling tops, `flat` ranges for patches and glades, `skip` cuts holes exactly.
- Danglers need a solid underside within 48 px above them; a claw face needs nothing overhanging it within ~150 px
  (a limb that abuts the face's top makes her bump: leave a hop gap).

## Proofs
`npx tsx tools/solve/canopy.ts` (~8 min): 16 claims, reach and locks, explorer in the real sim, glades left out of
lock claims. **A placed player carries the tuning's double jump until she lands** (`createPlayer` sets `dj` from
tuning, not the kit): the harness zeroes it. The sim bug is real (spawn, fall return, re-form all give a free air
jump); clamping `dj` to the kit in `step` breaks two wood-rooms tests (wood-burrow's pocket hop-out after a teleport,
wood-well's claw shaft, which only climbs with it). Not fixed yet.

## Measuring
`npx tsx tools/reference/export-area.ts canopy` then `area-svg.ts` / `metrics.ts` (docs/design/reference-levels/README.md).
`CRITICAL` in export-area.ts holds the world's critical path.
