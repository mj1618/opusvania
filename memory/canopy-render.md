# The Canopy, render side (rounds 3-7, 2026-10-30 / 31)

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
