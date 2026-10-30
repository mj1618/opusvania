# The Canopy, render side (round 3, 2026-10-30)

What the wood kit draws in `?world=canopy` beyond the mass painter (memory/canopy.md "Render"); review that drove it:
docs/design/levels/reviews/canopy-r2.md. Shots: `shots/canopy-r3/` (21:9 in `shots/canopy-r3/21x9/`).

## Every creature has a renderer (kinds.ts)
- `src/render/enemies/kinds.ts` `creatureArt(kind, look)` says who draws a kind: `beetle` (burrback rig, scaled by
  `BEETLE_SCALE`), `moth` (lampwing art), `spider` (render/lantern/creatures.ts, needs `art.pieces` or Lanternroot),
  `greybox`. The enemy renderer dispatches on it. **Before r3 the wood kit drew only burrbacks and lampwings**: the
  old burrback, the juveniles and the hawkers in the Canopy were simulated and invisible.
- `tests/unit/creature-renderers.test.ts` walks every room in `content/` and fails on a kind nothing draws (it caught
  the orb `weaver` the day it was placed in `cn-webs`: now `orbWeaver` in render/lantern/creatures.ts). A new kind
  needs a line in `creatureArt` and a painter.

## The old burrback (the den's boss)
- The burrback rig at 4.4x (`rig.big`). Its brace / ram pitch is `BOSS.pitchK` of a burrback's (a full pitch drove
  the snout through the floor at that size). A contact shadow under it.
- Its own moves (config.ts `BOSS`): `rear` = up on its hind legs, lights red (`rearK`), trembling: the slam's tell;
  the slam lands **as the rear ends** (the sim's slam is an instant, not a mode); the floor wave
  (`e.wave` / `e.waveX`) is a pale crest + grit riding each front; `curl` = the closed dome; `roll` = a separate
  round ball (`ball()` in enemies/index.ts: the dome cannot turn over, half of it is belly), `BOSS.ballPx` across,
  turning with the ground covered.
- To see the phases without the data: in a page,
  `const m = await import('/src/scene/index.ts'); m.ROOMS['cn-den'].enemies[0].phased = true; g.setTuning('oldBurrback.p2At', 1); g.load('cn-den')`.
- Tall gates in the wood (`rootGate` in render/lantern/kit.ts): a dark arch, woven roots, root posts and a lintel with
  cyan beads, moonlight seeping through; opening, the roots draw up. Bounce caps (`cap`): dark teal domes, cyan
  spots, pale gills, a short stalk.

## Interiors (lib/interior.ts, layers/interior.ts)
- A wood room with `marks.backs` gets `InteriorLayer`. Material: `earth` for a `deep` mood or `ground` masses, else
  `root`; tone by mood (cool teal, warm moss green, deep umber under teal haze).
- Two planes: the **near back** baked with the playfield (`paintNearBacks`: root = twisting fibre bundles with gaps;
  earth = low soft lenses + root curtains hanging from every ceiling) and the **deep back** in its own layer
  `interiorDeep` (parallax 0.86, between mid and airBack), masked to the backs. A back edge in open air is torn: the
  fibres end ragged and the deep mask is drawn ~300 px in behind them (no straight seam: the bower).
- **Light that is not a lamp**, from geometry (`interiorPlan`): moss on exposed tops (~640 px), fungus shelves on
  faces (~560 px, 18% violet), glow worms under undersides (~420 px), moon shafts through a root room's ceiling,
  spores in any 1500 x 860 cell left dark. Shapes baked, light live (a GlowPool at the bottom of `goal`).
- Gotchas: anything that reads as a ledge behind her is wrong; solid round clumps read as boulders, lit-topped strata
  as logs, overlapping alpha blobs as smoke; plain vertical posts read as trunks to climb (hence twisting fibres).
- **Beyond the room**: a room whose backs cover >= 35% of it gets the wood's body painted past its edges (no sky at
  any aspect), a smooth hanging lip where its edge is open air, and a narrowing dark tunnel through each exit.

## Mass shape (pf-mass.ts)
- Square inner corners get a root buttress (`cornerRoot`: floor meets wall, ceiling meets wall); a tall pillar's faces
  flare at the foot (`MASS.flare`) and lean; a free top's lip is 4 px and rounds over (no flared capitals). Neither
  on a narrowing stack's short steps (`cornerMinFloor`, `cornerMinWall`, `pillarMinH`): a buttress or a flare at
  every step read as a pagoda.
- A narrow mass hanging from the room's top into open air is a clump of root strands with ragged tips; a front cover
  of that shape shows past its rect (`MassPatch.show`) so the tips are not cut square.

## Elsewhere
- Post: a light never darkens what it falls on (the grey disc on the crown's moon was her light's knee capping a
  pixel brighter than the cap, with a hard rim where its reach ended).
- `ROOM_LAMPS` (render/lantern/config.ts): per-room lamp size / light / moths; the Grove's are 1.9x with 2.2x moths and
  a warm wash.
