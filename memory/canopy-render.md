# The Canopy, render side (rounds 3-8, 2026-10-30 / 31)

What the wood kit draws in `?world=canopy` beyond the mass painter (memory/canopy.md "Render"); reviews that drove it:
docs/design/levels/reviews/canopy-r2.md, canopy-r3.md. Shots: `shots/canopy-r3/`, round 4 before / after in
`shots/canopy-r4-render/before|after|after-21x9/<room>/`.

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

## Round 4 (review r3 #2, #3, #4/#9, #5)
- **Standables are drawn** (`lib/wood-claims.ts`, pure): `unclaimedStandables(room)` mirrors who paints what (mass,
  solid tree, stretch, a small solid under a limb's end) and `shelfFor` says how a one-way ledge is drawn: a root shelf
  out of the wall beside it, or a knot of twisting roots hung from the roof / limb over it (`paintShelves`, pf-mass.ts).
  `tests/unit/wood-standables.test.ts` walks every wood room. A new solid tag or ledge kind needs a painter and a line.
- **Masses** (pf-mass.ts): edges are merged into runs across rects (`mergeRuns`: one face down two stacked rects, no
  seam). **Tapers** (`findTapers`: rects narrowing up from a floor = the generator's `burl`, narrowing down from a roof
  = `hang`, base <= 900 wide) are painted as ONE shape (`paintTaper`): a root flare whose roots fan out onto the floor,
  or a bundle of vertical roots ending in ragged tips; tiers stay collision, their tops keep a little moss and their
  stretches. Undersides are **root mats** (`matSag` lumps, `rootMat` clumps, no beam, no ceiling brackets: `cornerFill`);
  an underside's free outer corners round on `underRound` (scaled down on narrow posts: a 64 px post's lumps made a
  baluster). A **lift** toward `#0f2a36` and bark **plates** within `liftReach` of every lit top / face. Over a face
  >= 420 tall the top's free end rolls further (`roundTall`) and gets `brokenTop` (torn rim, moss curtain, split).
  Faces with `kick: false` may bulge `looseBulge` more; faces that take the claws stay within ~12 px.
- Rotten walls are passed to `paintMasses` as `ghosts` (mass for the neighbours' edges, not painted): a post under a
  wall got a lip and moss at the seam. Wall patches mask to their rect; covers to their painted outline (`poly`).
- **Root bases** (pf-branch.ts `rootBase`): a tree whose foot is in the room flares into the floor under it; trees
  standing on its foot (the Grovemother's stilts) are not painted, the base draws them as arching roots with the
  trunk's underside an arch between.
- **Five looks** (lib/looks.ts `lookOf`; round 5 below): `art.look` (schema, src/scene) wins; then `ROOM_LOOKS` (every
  Canopy room, by region); then carriers = nest, old burrback or `ground` = den, h >= 1.7 w = shaft, a deep mood =
  heartwood, else canopy.
  Material per look (`MAT`): heartwood `grain` (panels along the trunk, splits, knots weeping sap; rings and horizontal
  grain in the deep), shaft `root` fibres + one `beam` light + frost moss, nest `earth` + tunnel mouths, seed caches,
  `larva` cells, ant `trail` lights, canopy `leaf` (bark strips, leaf mats, dark ragged gaps to the night in the deep),
  den `earth` + shed shells and claw scrapes. Lights: `sap`, `larva`, `beam`, `trail` (layers/interior.ts).
- **The mint was the warm tone's deep back cut by a torn mask** under the lamps' wash. Warm variants are dark grey-green
  now, the fog bands thinner, and the mask's edge is shaded inward (`edge` + its twin mask in airBack).
- A **cover's hollow is a back** (inset 48 px, edges closed) in a room that has backs: the hub's bank hollow showed sky.
- **Gates** (kit.ts `rootGate`): an arch of two twisted roots per side out of a flared foot, a tangle of uneven roots
  across (drawn back toward where each grew as it opens), roots hanging from the crown. Even bars read as a cage.
- **Rot** (kit.ts `rot`, `dust`): a wood wall's patch gets a darker warm face, rot blooms, a lit slanted crack, chips at
  its foot and dust on a cut; a wall named by a `teach` landmark is a step stronger.
- **The wood's vista** (lantern/vista.ts `WoodVista`): from a `vista` landmark (fades in from 1100 px west of it), on
  far2: a range whose peak stands under the moon when the moon is in the 1920 view (else where `mountain` puts it), its
  west flanks shaded and one snow cap per peak on the moon side (per-step slivers read as stripes), a near ridge with
  firs, the valley's false lights in clusters with mist. Near screen-fixed (`parallax` 0.05).
- Gotchas: narrow spikes over an edge read as thorns; pale alpha blobs in a back read as smoke or ghosts; a lit
  sinusoidal width on a short column reads as turned wood. Debug a look: `look` in `interiorPlan(room)`.

## Round 5 (review r4 #3, #4, #5/#6, #7, #8 render items)
Shots: round 5 before / after in `shots/canopy-r5-render/before|after/<room>/`.
- **Looks by region, with hue** (lib/looks.ts): `ROOM_LOOKS` names every Canopy room (heartwood = hub, trunk, rot,
  crawl, webs; shaft = well, Elder; nest = cellar, galleries, larder; canopy = the high band, its pockets, the way out
  and ledge; den = tunnel, burrow, den). The level builder can override with `art.look`. Tones (lib/interior.ts
  `TONES`): heartwood amber-brown, shaft cold white-blue, nest ochre-grey, canopy green-teal, den umber.
- **Three levers carry a look; all three are needed** (the backs alone moved nothing: masses fill 55-73% of an
  enclosed room): the near / deep back tones; the **mass tone** (pf-mass.ts `MassTone`, `massTone(room)`: body, veins,
  lift, `liftReach` doubled, plates, a `crust` wash over faces and tops so the bark takes the hue); and the **post grade
  per look** (post/config.ts `WOOD_LOOK_GRADE`, chosen by `LOOK.inside`). All three apply only to an enclosed room
  (`gradeLookOf`: backs cover >= half of it); rooms open to the sky (hub, fork, Grove, gap, way out) keep the cool night.
  The beyond-the-edge fill (layers/interior.ts) uses the same body, or the room's edge shows a seam.
- **Mean luma** (`magick -colorspace Gray` of the wide shots, same metric before / after): trunk 12 -> 25, rot 12 -> 23,
  crawl 12 -> 23, cellar 13 -> 26, galleries 16 -> 29; the open rooms unchanged (20-27). The well went 27 -> 49 (pale
  chimney, dark faces: the faces read).
- **Shaft: no fibre posts** (`shaftNear`, mat `frost`): fine broken grain strands, faint washes, frost lichen,
  knotholes. Nothing stands proud.
- **No ruled bands in a deep back** (review r4 #6, the checker): it was straight vertical grain ribbons crossed by the
  fog's stacked rects (a plaid). Now grain wanders and breaks into runs; fog and light are wavering gradients
  (`wavyBand`, `softGrad`). `tests/unit/wood-looks.test.ts` fails if `drawDeepBack` fills any rect but the base.
- **Edges open by the sample** (`BackEdges.at`, `backBite`): a back's edge tears only where the air past it is open,
  smoothed; a **cover's hollow back gets the same test** (the fork's cellar cover spans the corridor: its closed top
  was the ruled seam across the fork's entry).
- **The Grove's "flaps" were the edge shade**: 110-360 px strokes with round joins along the jagged mask polygon drew
  fans and torn paper. Now `backEdgeShade`: filled bands following the bite inward.
- **A big lift needs tapered ends**: at 400 px a lift band of even depth ending square drew lighter boxes in the mass.
  Its inner edge wanders by a third of the reach and it tapers off at the run's ends.
- **Cover patches feathered** (layers/playfield.ts `featherMask`): baked alone, a cover's lift and the light round it
  differ from the mass it sits in; a hard mask drew its rect (the well's niche).
- **Masses as wood** (pf-mass.ts): plates and long lit-lipped fissures across any mass >= 260 px; a root running
  down across every free face >= 600 px, inside the collision; underside corners are knuckles (uneven radii, a lobe)
  not quarter circles.
- **Props** (`paintTaper`): a burl's foot slides aside (the top stays on the collision), each flank flares its own
  amount, roots at 40-140 px spacing that wrap (top lane != foot lane), 2-3 roots split off across the floor, 1-3
  knobs, a broken top of splinters. A hang (`hangClump`): a dark core torn into points, 3-7 strands (widest <= 40% of
  the clump) twisting, tips at very different heights; no hem. A narrow mass hung from the room's top: 4-9 uneven
  twisting strands (one every 12 px fanned evenly was the organ pipes). `brokenTop`: few uneven splinters, gaps.
- **The roost** (`paintRoost`): a wide front cover hung from the top over air is a ragged pouch of roots and old leaves,
  shown past its rect.
- **Thorns** (lantern/kit.ts `bramble`): a dark mat on the wood side, bone and rust barbs 24-40 px pointing into the
  air (out = away from the solid beside it), a warm rim line and a faint warm glow along the strip. No moss / fungus /
  sap / worm light within 64 px of a strip (`interiorPlan`).
- **The snuff** (layers/interior.ts `SNUFF`): when the lamp an enemy `snuffs` is out, a dark spreads out from it over
  1.5 s (back 0.36, bake 0.16, deepest near the lamp) and the growth's light near it goes. Den mean luma 23 -> ~12.
  To see it: `phased = true` + `oldBurrback.p2At / p3At` 1, then **`step`** (not `tick`: tick is render only).
- **The vista** (lantern/vista.ts `WoodVista`): five peaks (`WOOD_VISTA.peaks`, the main off-centre under the moon),
  concave flanks with shoulders, a shadow face and a faint lit face per peak split down a spur, snow from the crest to
  a ragged snowline (never floating), dark valley walls converging on its foot over a valley floor, a soft river of
  mist, lamps at three depths (the near ones with moths) and a lamp tree on the drop. `half` 1900 for 21:9.
- Gotchas: a pale flat quad at low alpha reads as a slab of glass; a thin straight lit line reads as a wire.

## Round 6 (review r5 #4, #6, #7, #8: the render items)
Shots: `shots/canopy-r6-render/before|after/<room>/` (after also `cn-out-21x9`, `cn-hub-16x10`); against the references at
matched hero scale (Wing 80 px = Knight 85 = Hornet 139, all drawn at 40 px a hero): `compare/r6-vs-refs.png` (rows: our
well chimney | Silksong Tut_01; our hub door | HK King's Pass 75-42; our Grove pit | Silksong Tut_02; ours left) and
`compare/before-after.png`. ImageMagick here has no font (no labels: `-annotate` fails) and `montage` is broken: build
sheets with `-resize` + `+append` / `-append`.
- **Edges, not insides** (`lib/pf-edge.ts`, used by pf-mass.ts). `edgeModel(masses, sides, seed, skip)` merges the free
  runs and gives every face / underside a chain of lobes (`EDGE.claw` +-12 px, `EDGE.loose` for `kick: false`,
  `EDGE.under` hangs below the collision only); the body's `outline` and the painters read the same lobes. A face is
  lobed knobs (seam on part of the inner side, a lit crescent, moss on the upper arc, overhanging moss cushions / root
  stubs off some crests); an underside lobes + `paintFringe` (moss drips, roots, 60-200 px every 40-120); a walk top
  `paintTopBand` (30-60 px of moss, its depth wandering, tongues; `EDGE.bandLow/High` are albedo: the bake multiplies,
  so mossDark came out as a dark band) over a half-thickness great root (the full one read as a plank). Inside a mass
  further than `EDGE.inner` from an edge, veins / plates / fissures keep `innerK` of their alpha.
  `tests/unit/wood-edges.test.ts`: no face or underside edge straight (within 3 px) over 300 px, claw faces within 12,
  undersides never above the collision. `massEdgeLines(room)` is what it walks.
- Gotchas: lobes on both faces of a narrow post read as a string of beads: rects under `MASS.lobeMinW` (220) keep the
  bark column (3a) and lobe at half. Full seam rings read as coins. Even scallops under a top read as a valance.
- **Prop families** (pf-mass.ts): `propFamilies()` gives each taper a family (burls `stump`, `split`, `knee`, `fungus`,
  `fallen`; hangs `talon`, `beard`, `curtain`, `pod`), rooms in id order, the least-used family not yet in the room.
  `tests/unit/wood-props.test.ts`: none twice in a room, none in more than 3 Canopy rooms (13 burl rooms needed a fifth
  family). `findTapers` skips a hang wider than `hangMaxW` (360: the roof's own mass) or shorter than `hangMinH`, and any
  stack whose claw face runs over `clawTaper` (400: the fork's face was a pleated fan). `paintMasses` takes `roomId`.
- **Shelves** (`shelfFor` now gives `near` (a mass face within 256 px) and `floor`): a root from that wall rising under
  the ledge below the walk (so the walk visibly ends), else a braided root rising from the floor, leaning in from one
  side (straight under the middle read as a table on a stem); hung only with nothing else. No ropes.
- The seed door (kit.ts `seal`, wood): a mat of wavy roots running into the wood at both ends (crossed diagonals were a
  truss). The den's taproot: `paintTaproot` (pf-branch calls it) over the column, 160-220 thick, twisting, 3-4 roots
  at the foot, a sap-lit scar at the wick.
- **Backs** (lib/interior.ts): a mid plane `drawMidBack` in its own layer `interiorMid` (0.93, masked like the deep),
  value `midValue` from the mass body to the fog (+0.18 in the shaft: mid-grey on the pale fog read as cut-outs),
  `midCover` of the back, shapes per look. Heartwood: grain in diagonal panels at `heartAngle(plan)` (deep, near and mid
  agree), light from above, no rings. Den: cool umber-grey (TONES, MASS_TONES, `WOOD_LOOK_GRADE.den`), fungus light from
  below, dark roots hanging (ribbed shell domes read as wheels). Canopy posts: 480-900 apart, width 30-150, lean +-8
  degrees, a third forked, leaf clumps on them.
- **The vista** (`WoodVista`): `ridge` is one body (a shared base falling off at the ends, a soft max that fills the
  saddles); faces opaque, lowest peak first, each clipped to where it is the top, closing on a slant (square bottoms read
  as blocks); a mid range; four hill bands (`hillY`, `hills`) with mist in the folds and fir clumps (none on the
  farthest: tiny even firs read as a fence); lamps set on the crests; a lamp tree (trunk, three limbs, lobed crown).
- Standing silhouettes on mass walks (pf-branch-flora.ts `standing`: fiddleheads, seed stalks, grass blades, live in
  the wind), `BRANCH_FLORA.standGap / standH`.
- Weak still: claw faces at +-12 px still read near-straight at play distance; our moss band and fiddleheads are a
  fraction of Silksong's (thinner, dimmer); the big masses' insides are still the largest dark planes on screen (HK's
  insides are drawn shapes).

## Round 7: figure-ground (the value rule)
Shots: `shots/canopy-r7-render/before|after|after-16x10|after-21x9/<room>/` (after-16x10 / 21x9 from the first pass;
`look-check/<WxH>/` is the final at all three); `compare/r7-vs-refs.png` (same rows and
reference crops as r6), `compare/before-after.png` (hub, Grove, den, way out, hatch, fork).
- **The measure** (scratch scripts, not in the repo: shoot each wide stop, save `cam()`, `info().view`, `scene().solids`
  and the player box, split the frame by the collision): air = pixels outside solids and her box; solid = inside solids
  more than 48 px from their edge; rim = air 0-40 px above a solid. References (no collision): Silksong Tut_01/02 air
  40-55, HK King's Pass 25-80, solid 0-5. Ours before -> after (16:9 means): hub air 16 -> 44, Grove 29 -> 62, fork
  27 -> 58, den 35 -> 53, way out 38 -> 70, hatch 31 -> 68, well 106 -> 111; solid 5-11 -> 6-11; rim 53 -> 86; Wing's
  body vs the median round her 36 -> 67. Same at 16:10 and 21:9.
- **The veil** (layers/veil.ts, layer `veil`, screen space, between `interiorMid` and `airBack`): one gradient rect,
  `blendMode = 'screen'` over everything behind the playfield. Screen lifts the darks most and leaves the moon and the
  shafts nearly where they were; the post's exposure roughly doubles what it adds. Colour per `gradeLookOf` (open rooms
  `night`), `VEIL`. Gotchas: flat strips overlapping by a pixel draw lines (screened twice): use a `FillGradient`, and
  destroy it. The den's is half the others' (at the same value its fog lenses went to a flat grey sheet).
- **The walk's moss** (`BRANCH.walkDeep / walkMoss / walkLit`, used only on walks and claw faces so nothing else reads
  as a ledge; `WOOD_BAKE.mossKey` yellow-green): `mossBlanket` thicker (14-40 px, tufts 8-18 up); `paintTopBand` is
  built of cushions (an opaque deep body 44-84 px, a row of foot cushions with drip clumps, a stipple of puffs, crest
  domes up to `EDGE.dome` 9 px over the line with lit caps). It returns the crest profile: the mass top's stretch
  `top()` follows it, so the live rim (pf-rim.ts, greener, wider) and the growth sit on the domes. On mass tops the
  blanket is painted first, the band over it. Gotchas: a band at 0.85 alpha let the root's grain through as glass;
  a wavy hem with tongues read as icing with teeth; drips tapering to a point read as thorns / icicles, a ball on a
  stalk as a lollipop (wide almost to the end, then round).
- **Claw faces**: `EDGE.claw` notch -24, peak 6-18, lobes 100-280 long (the test allows 24); face moss along 75-100%
  of each lobe's arc, cushions 5-22 px every ~20 px, half with a lit cap (evenly sized ones spaced out read as beads).
  The shaft look has none (frost).
- **Insides**: a few great knuckles per big mass (`MASS.knuckleArea`, `knuckleR`): only an upper arc, a dark seam, a
  lit lip at 0.4-0.6 of `veinLit`, a breath of `lift` under it. Still the darkest plane.
- **The review's check** (r6 #2, #5): `npm run look:check -- --rooms=... --url=...` shoots every wide stop at 16:9,
  16:10 and 21:9 (into `shots/look-check/<WxH>/<room>/`), 480 px wide luma: near-black (< 16) <= 50%, mid (50-150)
  >= 20%, largest flat region (one 12-luma bin, 4-connected) <= 35%, `MIN_MEAN` per named stop (the hub's clearing
  25). The seven review rooms: 133 of 135 pass (the den's balcony 50.4% near-black: the dark beyond its roof; the
  well's shaft at 21:9 mid 18%: walls at luma 16-30 against a fog over 150; lifting them would make the solid as
  light as the air).
- **Sub-masses** (pf-mass.ts step 1c, `MASS.subCell / subR / subLift`, `MassTone.sub` for the night, whose lift is too
  dark to leave the body's luma bin): overlapping lobed shapes at two values over each big mass's body, each with a
  dark seam and a lit lip on its upper arc, largest first (HK's stacked rock). Colour only: the bake clips a tint to
  the body. The hub's veil is `nightDeep` (`VEIL_ROOMS`).
- **Face fungus as clumps** (interior.ts: `fungusEvery` 1100, size 30-52, 4-8 shelves on a cushion; the live light 5
  small scattered cores): at 560 px with one core each it was a dotted line of LEDs; three stacked cores read as a
  glowing capsule.
- **Mid plane shapes** (r6 #9, `drawMidBack`): the shaft's far walls are columns of lobed moss mounds (`mossMound`)
  and thick hanging roots (`hangRoot`), darker than the fog (pale arches read as brush marks; mounds floating free
  read as clouds); the canopy's are leaf masses and fiddleheads (`fernCurl`). Gotcha: when editing a look's branch,
  search from `drawMidBack`'s index: `drawDeepBack` has the same `plan.look === 'canopy'` branches above it.
- **Furniture families** (r6 #8, lib/families.ts, pure; `tests/unit/wood-props.test.ts`): a one-way's family by its
  mount (`shelfMount`): wall `bracket` / `tiers` (shelf fungi, `paintBracket`) / `stub`; a mass in reach `elbow` /
  `knuckle` / `braid` / `fork` (`paintNearMount`); floor `snag` / `fallen` / `burl` / `arch` / `stump` (only over a
  drop <= `STUMP_MAX_H`: higher it is a column) / `heap` (`paintFloorMount`); hung `clump` / `beard`. Never a
  free-standing stalk (the birdbath). Thorn beds (lantern/kit.ts `bramble`): 18 families, mat (`mat` / `coil` /
  `thicket`) x barbs (`spike` / `hook` / `pair`) x extra (`creep` canes over the lips and up a wall / dead `stems`),
  each spilling past its strip by its own amount; barbs only on the strip (only the strip hurts). Rooms in id order,
  least-used family not yet in the room; the test allows a room to repeat a family only once it has used all of its
  kind (the level builder's tunnel has five hangs).
- **The kin** (character/tatter.ts, r6 #10): scale 0.7, an ash-pale dusty grade (`Painter.grade.lift` mixes the solids
  toward a pale of the tint): at Wing's value it read as a second Wing.
- **The headless room-change error** (stage.ts `teardown`): `TexturePool.clear(true)` destroyed textures Pixi's filter
  stack still held as each slot's last input, read before the slot is refilled; the stale refs are nulled with the pool.
- Weak still: the Grove's Grovemother trunk is a flat dark rectangle; the well's lobed shaft walls stack like pillows;
  the den's back is flat grey fog lenses; the moss is smooth next to Silksong's stippled clumps; the thorn families
  differ mostly up close (a bed is 32-64 px deep); the burl mount is still an egg at a distance.

## Round 8: ground as silhouette, moss by look (review r7 #3, #6, #8, #10, the hub's moon)
Shots: `shots/canopy-r8-render/look-check/<WxH>/<room>/` (all rooms, three sizes), `compare/r8-vs-refs.png` (same rows
and reference crops as r6 / r7; the reference crops live in the session scratchpad `cmp/p01|p11|p21.png`, never in the
repo).
- **The core** (pf-mass.ts step 2c, `paintCore`, `MASS.core / coreA / coreWob / coreK`, `massCore(tone)`): deeper than
  28-136 px from a free edge (`distToRuns` over the merged runs, so neighbouring rects and the room's edge do not
  count) a mass sinks to its near-black core in ten wavering steps of strips 4 px tall (one fill per step: strips share
  edges, the multisampled bake draws no seams). Every rect, however thin (a 128 px rect left out showed as a lit
  ruled band). The bake multiplies its light by the albedo, so the diagonal streaks go with it. The wood beyond the
  room (layers/interior.ts `paintBeyond`) is the same core. Solid interior 10-25 -> 3-8 luma.
- **look:check measures figure-ground** (tools/look-check.ts `splitByCollision`, `figureGround`; `--masks` writes
  each frame's split as a PGM): solid interior = inside the solids more than 96 px from their edge, mean <= 12; air
  (outside the solids, the room's box and her box) median >= 4x that. **The frame bars (near-black, mid, flat) are
  measured over the air**: a black ground is the point, and HK's King's Pass is 50-56% near-black over the whole frame,
  flat 28-50% (Silksong Tut_03 75% / 56%), so whole-frame bars failed the references themselves (and over "all but
  the deep interior" the black outer band and the wood beyond the room still failed the crawl, the fork's face, the
  way out's foot).
- **Moss by look** (lib/top-growth.ts): `TOP_FAMILY` canopy lime, heartwood amber lichen, shaft frost, den fungus caps on
  earth, nest straw; `setTopFamily` is set by `paintBranchTerrain` for the room, and `mossBlanket` / `paintTopBand`
  hand over to `paintGrowth` while it is (null: the old band, other kits). `growthRuns`: a coverage per top in the
  family's range (40-85% overall), runs and breaks of uneven length, thickness 10-60 by run length. Dots over a dark
  body with a shadowed underside. The live rim (`Rim(plan, RIM_FAMILY[fam])`) is the thin lit lip on every top, in
  the family's colour; face moss `FACE_FAMILY`. `tests/unit/wood-moss.test.ts`. Gotchas: relief moss 1 takes the
  moon's yellow-green key, so lichens use moss 0.15-0.25; saturated amber discs read as cheese; small pale caps read
  as snow (caps 9-24 px with stalks, clusters 80-200 apart).
- **Gates grow** (lantern/kit.ts `rootMat`, `KIT.gateGrow / gateWithdraw` 40 frames; `closing` map on `gateShut`): a
  flat wood gate is sinuous tapered root ribbons reaching across from both sides, each its own delay; rootlets once
  knit; dust motes while it moves; `gateShut` adds trauma (`budget.gateShut`). The tall root gate's arch fades with
  its tangle. Straight parallel strokes with round caps read as pipes; a full-width hole under a half-grown mat as a lens.
- **The Grovemother** (pf-branch.ts `greatTrunk`, solid trunks >= `BRANCH.greatTrunkW`): torn squarish plates
  (`plateShape`, smooth ovals read as scales), a lit ridge (`ridgeLit`), climbing roots, a hollow.
- **Mounds -> ribs** (shaft mid plane): ribs running off the back's top and bottom with a frost edge, root curtains;
  `mossMound` is gone. Claw lobes 100-400 px (more short than long), knobs a breath lighter, roots across seams.
- **Mounts**: burl = a bundle of roots that parts under the ledge (three legs to a slab read as a stool); arch = a root
  surfacing far off and diving in past the ledge with a tangle under its span.
- **Thorn beds** (`bramble`, runs >= `KIT.thorn.bedMin` 640): a 48-96 px tangle with a thorny silhouette, canes
  looping and arching off the ends, a warm glint every 200 px. **The den's back**: banks with burrow mouths low in
  them (a round mound with a mouth and a lit crescent read as a face), shed half-shells (crescents, never domes), no
  strata lenses.
- **The moon** (layers/far.ts `initMoonWindow`, `MOON_WINDOW`): the far composite (one opaque sprite in far2, sky
  included) hid the hub's moon; a soft window over it samples `SKY_OUTPUT.texture` round `art.moon`. Hiding a far
  layer to debug skips the composite (far.ts), so "hide far2 and the moon shows" proves nothing about far2's content.
- Headless playwright-cli (no GPU) crashes in `AlphaMaskPipe` (`_resolution` of null) when a cover patch is in view:
  capture with `tools/lib/browser` `launch({ gpu: true })` + `openGame` (a scratch `.mts` script) instead.
- Weak still: see the round's report (docs/design/levels/first-area.md when the orchestrator files it).

## Round 9: the v8 features drawn, the wrap, air and hue by look (review r8 #3, #6, #10)
Shots: `shots/canopy-r9-render/look-check/<WxH>/<room>/` (342 of 342 pass), `compare/r9-vs-refs.png` (same rows and
reference crops as r6-r8), `compare/before-after.png` (well chimney, hub door, tunnel run, burrow nest: r8 | r9).
- **The Lamp prompt** (hud/prompts.ts, lesson `fling`): the Lamp key's cap HELD on the flame's far side from her, a thin
  ring breathing round the flame, while the sim's `flingTarget` (called over the render view) finds a flame and she has
  never flung; gone for good on `fling`. **`hudLink` was only set by the goal renderer after its "no lanterns, no
  heart" early return: in the Canopy no prompt (glide, kick) had ever shown.** It is set first now. To see one in a
  `?manual` capture: `__prompts.enabled = true; __prompts.reset()`, and a running jump off the hatch's lip (a fall
  past a flame is in reach for ~10 frames: `flingAfter` 0.08 s).
- **lantern/acts.ts** (`Acts`, wood kit only): the first fling's stream (pale moonlit moths off `wick-first` to the
  nearest top on the side away from the one she stands on; dark moths were lost among the night's falling leaves), the
  arrivals' tells (from `sim.light.hidden / respawn` and the spawn's `arrive` list, picked as the sim picks) and events
  (`arriveWay`: drop = grit, a shadow growing on the floor, a landing burst; wall = a ragged hole in the wall's foot with
  a lit crumbled rim, a dark earth cloud, clods over the crawler's back; ground = a mound in front while it heaves out;
  fly = shaken dust), the patch flare on `patchMark`, the kin's kept lights (`light` landmarks: a split seed husk, a
  low steady flame, a warm point light `kept-<id>`). Gotcha: a dark oval for a burrow mouth read as a black disc
  stuck on the wall; a hole needs a lit rim on its open side.
- **enemies/arrive.ts** `arrivalView`: the creature drawn on an eased path (drop = t², wall = out, a look, a scurry;
  ground = rises 35% then scurries), a beetle's stride running with the distance. The sim's box slides evenly.
- **Audio**: `enemyArrive` (route-play.ts): a short rumble for a beetle (higher for a juvenile), a thump on a drop's
  landing, a flutter for a flyer.
- **The kin's beats** (tatter.ts `beatOf` reads the `marks.notes` line beside the mark: "turns away" / "keeps a" /
  "waits"): away = turns its back and hunches inside 380 px (after its want's try), back at 680; keep = faces its light,
  head low, looks up on a `barkBreak` or inside 620 px, turns to her; wait = faces her, walks ahead along its own top
  (never off it) when she joins. The way out's mark sits at its top's east end: it has nowhere to walk to.
- **The den lid** (kit.ts `knit`): a standing flat gate (no `shut`) trembles and sheds dust for 1.1 s on its room's
  trigger `flagSet` (the wave coming); it was already a root mat that withdraws on `gateOpen`.
- **The burrow is `nest`** (looks.ts), **the Spire's root column** `paintRootColumns` (pf-mass.ts: a <= 96 px rect hung
  beside a face, nothing over or under it: a wound bundle out of the bark with ragged tips; also the hub's at 6,976).
- **The wrap** (top-growth.ts `WRAP`, `paintFaceWrap`, `paintUnderWrap`; pf-mass step 7 over every free face and
  underside along the painted lobes `em.faceAt / underAt`; pf-branch under every limb): the family's growth from the
  face's top down over 45-90% (thickest where it comes round the corner), a band under undersides with clumps hanging
  (lime beards wide to the end then round, amber lichen strands, frost feathers, fungus rootlets with caps, straw tufts).
  The limbs' beards are what made the Grove read lush; the face wrap only adds where FACE_FAMILY moss was thin.
- **The core starts 112-220 px in** (`MASS.core`); look:check's `solidDeep` is 200 to match (interior <= 12 there).
- **Air and hue** (review r8 #6): the shaft a cold teal (TONES / MASS_TONES / grade / veil; air 46-70, was 91-113), the
  den warm umber (#2e1f15 -> #5a4330, warmth 0.18: at 0.3 and rich saturation 1.12 it went terracotta), the nest
  ochre, canopy exposure 1.06 and heartwood 1.24 (the pockets were 86-92 at 21:9). **look:check** adds the air's mean
  <= 85 and its HSV saturation >= 0.12 (fail), and deep solid (> 96 px in) <= 30% a stop / room median <= 20%
  (reported; `--share-fails` fails): the well 40-51%, the cellar 43-50%, rot / crawl / elder ~40% today.
- **Objects** (review r8 #10): the Grovemother's plates are fissured ridges 3-5x taller than wide, overlapping
  (round-topped plates half a column wide read as scales); every floor-mounted ledge gets 3-4 roots fanning from below
  the mount's middle into the pad's ends (the stalk-and-disc read); amber lichen at half its chroma, in tilted smears;
  face fungus 2-5 brackets, the first about twice the rest, tilted, overlapping.
- Capture note: `npm run clip` follows her; a fixed camera is easier with a scratch script (`launch({gpu:true})` +
  `openGame` + `g.cam({x, y, zoom})` + `g.step(n)` + canvas screenshots). `?nopickups` removes the enemies too.
- Weak still: claw faces' lobes stay +-24 (the review asks +-40-80 on long faces: it would move the drawn wall off her
  hand); the deep-solid share is geometry (the level builder's hollowing); the arrivals are small at play zoom.

## Round 9b: sealed air, the well's door, the map station, the gap's root, the den's warning
Shots: `shots/canopy-r9b-render/before|after/<room>/` (16:9), the before / after sheet `shots/canopy-r9b-render/sealed-before-after.png`
(each row: before | after), `look-check/<WxH>/<room>/`.
- **Sealed air** (`marks.sealed`, level side memory/canopy.md v9) is a hollow INSIDE the wood (lib/sealed.ts). Every
  environment painter sees it as mass: `withSealedMass(room)` appends the rects to the solids (after the real ones:
  kit indices unchanged) in `SceneRenderer.init` (the env modules' `ctx.scene` only; enemies, character, goal keep
  the sim's scene), in `paintBranchTerrain`, `propFamilies` and `shelfFamilies` (they must agree on tapers / shelves).
  `interiorPlan` leaves sealed rects out of the backs (**their deep / mid backs at parallax 0.86 / 0.93 were drawn
  per rect and showed displaced, as the ruled light rectangles in the well's gallery; in the hub as the sky's
  hills**) and drops lights inside them. `paintSealed` (baked after the masses) cuts the hollow back in per group of
  touching rects (`sealedGroups`, union edges `sealedEdges`): a far wall (`HOLLOW` per grade look, `night` for open
  rooms: albedo 3-4x the luma it comes out at, the bake's interior term takes a covered plane to about a third),
  grain along the long axis in broken fibres (full-length even ribbons read as planks), shadow bands in from every
  lip (deepest under the ceiling), a haze in the middle depth, roots across (behind the lips), rootlets, a dim glow
  per ~1100 px; the lips as **knobs** (HK's stacked lumps, a lit crescent strongest on the floor lip) over a band
  that sinks into the core (a lighter band all the way out drew a picture frame with a ruled outer edge); corner
  fillets; the family's under-wrap / face-wrap, dull cushions on the floor lip (never the walk band: nothing in a
  hollow may read as a ledge). Groups whose largest rect is under 150 both ways stay wood.
- **look:check** gives sealed air its own class (4): out of the air bars and the solid interior, and its mean must
  stay under 0.8x the air's median (`hollowK`: a hollow as light as the air reads as a space to fall into). Hollow
  means 5-25 luma against air medians 40-70.
- **The map** (render/map): sealed rects draw as rock; a `mapStation` event (a step's events, via `game.afterStep`,
  hooked lazily in `update`) shows the map for 0.4 + 2.6 + 0.8 s over the scene (backdrop 0.82) without pausing;
  Tab during it opens it for good.
- **Acts** (lantern/acts.ts): `door` landmarks (the well's `door-limbs`): moonlight glowing in the opening, a beam of
  16 rotated soft ellipses spilling down and in to a pool on the floor, motes drawn up out of the hollow along it and
  out, a point light `door-<id>`. `stones`: a map station's `hangs` on a tapering crook over the kin's husk, each
  hung flag a slab with a moth cut pale on it (two dark wings read as a mask), swinging and glinting on `stoneHung`.
  Arrivals: a way `mouth` (start within 260 px of a side edge at an exit's height: the den's warning's beat 2 out of
  the den passage): dust breathing out and **eyes in the dark** as the tell, nested soft ovals of dark over the mouth
  while they come (strips read as a curtain), and the path runs along the passage floor, hops the step its ground
  stands on (`stepX`), then scurries (the straight line went through the arena's floor block).
- **The gap's root** (pf-mass `hangingRoot`, a hang longer than `MASS.longHang` 900): a wound bundle thinning with
  the tiers (no steps), ragged tips, and life down it: lopsided slanting moss drapes with beards (a round cushion
  with one beard read as a mushroom; an even band as a ring), leaf pairs close on the bark, lichen, glow beads.
- **Arena knuckles** (families `hump`, never picked by the spread: a floor-mounted ledge in a `fit` zone of a den or
  nest room): a lumpy body under the ledge with an **open belly** (to the floor it read as a loaf she would bump),
  two roots running over it from beyond the shoulders into the crown, knobs at the crown's ends, earth at the feet.
  (Two thick arches crossing read as croquet hoops.)
- Weak still: see the round's reply (hollows are flat bake, no parallax of their own; the den's mouth sits on the
  `fit` frame's bottom edge so the arrivals come in at the edge of the picture: a camera-zone change, level side).

## Round 10: the premise drawn, the lesson's cap, a drawn map, pockets, the moon at vistas (review r9 #1 #4 #5 #6 #8)
Shots: `shots/canopy-r10-render/` (`before|after/<room>/`, `map/` three stages + 21:9 + 16:10, `premise/` cage,
snuff sheet, roosts, firefly sheet, `den/` before / after, `look-check/`); clips `clips/r10-trap-snuff-hub.mp4`,
`clips/r10-firefly-gap.mp4` (scratch Playwright scripts over `__game`: `input('J3 U+J+A1 U+J20 .18')` under a trap
three times frees it; a teleport into the gap's floor trigger starts the firefly).
- **Prompts** (hud/prompt-logic.ts, pure + `tests/unit/prompts.test.ts` drives the real sim off the hatch's lip):
  every lesson checks `save.abilities` (`LESSON_NEEDS`: glide, wallJump); the fling's cap is full on the first frame
  of reach (`flingAfter` 0, `fadeStep` with fadeIn 0), lingers `lingerFling` 0.6 s by the flame (the cap and ring
  track the last flame, not her), and the glide's lesson never takes over while it is up. `paintCap` returns a blank
  texture with no DOM (node tests).
- **The map** (render/map/paint.ts bakes a 2D canvas per change of the save; index.ts draws her moth and what moves
  live): rooms as carved air (room rects less rock grown by their wobble, so touching rects open no sliver), washed by
  look, the ink line only where air meets rock (open sides fade over 26 px: an open room is not a box), no ids, the
  region's name (`NAMES` by world file). Unrolls from the top in 0.4 s (a mask and a rod). **It used `WORLD.areas`
  (the game world's), so a Canopy moth-stone revealed nothing**: now every world file's areas. Trap lamps by
  `Lure.trap`: warm with circling moths, freed = a cool ring. The station's stones swing on `mapStation` (acts.ts).
- **Hollows are pockets** (sealed.ts `hollowCavities`, pure, tested: no straight run > 200 px, >= 80 px from the
  mass over 70%): 1-4 noisy superellipses a rect along its long axis, slanted bridges 60-160 px, long sides wave
  (`cavityWave`; a long gentle superellipse edge is straight to the eye and to the test), no knobs: a broken lit floor
  edge, a broken dark ceiling seam, 2-5 roots across the lips at angles. Thin groups (the hub's 320 px under-floor)
  become slits. Tall faces (`EDGE.plainAfter` 600) break the knob chain into clusters of 1-3 with plain bark runs
  (`Lobe.plain`: outline swells, no knob drawn). A small block free on all sides (`MASS.floatMax` 560 x 360) gets no
  face lift / knobs / wrap: the hub's clearing block was a picture frame. Not done: +-40-80 bulges on `kick: false`
  faces (the drawn wall would stand in front of her when she walks into it).
- **The moon** (scene/lib/moon-vistas.ts `moonShown(room, camX, camY)`, tested): Canopy rooms show the disc only in
  their `MOON_VISTAS` boxes (the hatch's opening, the hub's clearing, the crown, the way out over the valley: 6 of 117
  wide stops); sky.ts scales `uDisc.y` and the halo (`hiddenHalo` 0.35), far.ts the moon window's alpha. A room not in
  the table outside the Canopy is unchanged. The disc fades over a box's `fade` px: a long fade reads as a ghost moon.
- **Lime moss** (top-growth.ts): 0.6x chroma, 0.85x value, relief moss 0.7; `tuft()` (3-7 tapered blades) replaces
  the beads on tops (`limeCushions`: clumps of 2-5 with gaps), faces (`facePieces`) and face lobes (`EdgeTone.fronds`,
  `FACE_FAMILY.lime` now a dull frond green: the face lobes' cushions used the walk's own green, the fork's neon).
  Face cover 24-40%.
- **The premise** (sim: memory/canopy.md "The premise"): lantern/lamps.ts `TRAP`: a trap is a cage of 9 warm bars
  (`cage`, one breaks per cut, it shudders on `lureHit`, a flash and sparks), a 2.4x cloud, 8 dead moths on the
  ground under it; springboards in `cn-*` keep 0.3x the cloud. A trap's `lureSnuff` draws 36 moths that orbit her
  2.2-4.6 s each (`Freed.follow`), then stream off up toward the moon's side (`LOOK.moon.x`). acts.ts `PREMISE`: the
  firefly (`kit.firefly`, `fireflyAt`: a dark speck with a cold-gold tail light pulsing, a 14-point trail, a thread of
  light to each `fireflyRelight`), the roosts (`roostsLit`: 22-70 pale moths at rest on the rect opening and closing,
  8 in the air, a cool glow; they settle in over ~3 s the first time). The HUD's count was already there (hud/moths.ts,
  `save.moths`).
- **The den's warning** (#6): interior.ts `denBanks` (two ranks in the den's deep back: far pale in the fog, near dark
  with burrow mouths and a lit crest), the lid's red-amber breath (acts `drawDenMouth`: gates whose id ends `lid`),
  beetles in a den look drawn `DEN_READ.scale` 1.22 with a warm backlight glow behind the dome (enemies/index.ts; the
  sim box unchanged). The mid plane's big translucent bank ovals are still flat (the weakest part).
