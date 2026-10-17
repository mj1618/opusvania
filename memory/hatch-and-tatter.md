# The hatch, the cocoon row and Tatter (render, `src/render/character/`; round 1, 2026-10-17)

Scene 1's acting (docs/design/scenes/01-hatching-branch.md). Sim side: memory/rooms.md (`state.hatch`, `hatchStir`, `hatch`).

## Files and wiring
- `cast.ts` `Cast`: owned by `CharacterRenderer`; `stage.ts` passes `this.game.state.hatch` as the 5th arg of
  `character.update` (the only stage hook). Per frame: `cast.link()` (writes `hatch-link.ts`), the skin, `cast.update()`.
- `hatch-link.ts` `hatchLink {inside, birthT, x, y}`: `inside` = shut in (hero not drawn, her light 0); `birthT` = render
  s since the `hatch` event (0 inside; 99 = no break seen: a teleport, a `spawn`, a room without a cocoon).
- `cocoons.ts` `CocoonRow` (+ `COCOON` knobs): one `Pod` per `marks.cocoons`. Two Wing painters (vesper/paint.ts):
  `back` (husks, the inside of hers) is child 0 of the character layer, Tatter child 1, the hero after, `front`
  (her shell, threads, flakes, silk, flash) re-added on top after every skin select.
- `tatter.ts` `Tatter` (+ `TATTER` knobs): Wing's `Rig` + `Secondary` + `drawVesper` in its own Painter, mesh scaled
  0.86 about its feet, `Painter.grade` (re-palette), `View.unarmed`, `View.tips` (no light on the snapped antenna).

## How it moves
- A pod = a pendulum `Spring` (swing, driven by `wind(x, clock, phase)` from scene/lib/look.ts, the plants' wind)
  + a bend spring that lags the swing + a squash spring. The cocoons hang off the branch's NEAR lip (hang y 1030 is
  6 px under the walk line): they lie over the bark face, in front of the playfield.
- Hers, shut in: twitches on every `hatchStir` (press 0.55 + 0.25 per press; auto 0.32 + 0.4 x late) and on its own
  every 2.6 -> 0.85 s (hash-scheduled on render time), harder with `hatch.frames / 720`. A stir = swing + bend kick,
  a bulge where she pushes, a squash, the threads shiver, light leaks through the seam (silver).
- The break: halves crack (`crack`), she pushes them wide 0.13 s later (`pushKick`), they settle at `gape`; 2 of 3
  threads snap and recoil (pinned verlet strands); 22 flakes (tumbling `flake()`s, moon-lit when face-on, drag + wind
  + flutter, fall the whole drop); 5 silk wisps; a 0.24 s silver flash (r 34). Husks shed a wisp every ~5.5 s.
- **Half rotation gotcha**: y is down, so `half()` rotates by `-ang`: a negative `halfL` swings the left half OUT.
  With the sign wrong the halves cross over each other (round 1's first take).

## The birth (vesper `rig.ts` `BIRTH`, `index.ts emerge()`)
- While inside the rig is held at `birthT = 0` (curled `CURLED` pose) so its springs are settled at the reveal.
- 0-0.05 s only the crack and flash (`BIRTH.seen`); she is drawn `drop` 80 px lower (inside the husk, behind its
  front halves) and pulled up from 0.14 over 0.5 s; first breath 0.38-0.98 (chest, head up), eyes open 0.5-0.82,
  wings open ONCE 0.62-1.28 (`soar` 0.46 + `raise` 32, a drying shiver), stands 0.85-1.4, `birthW` gone by 1.5.
  Her light (`birthLight`) comes on 0.45-1.3; until then she is dimmed (`BIRTH_DARK`) and her thorn is faded out
  (`View.thornA = 1 - birthW`: curled, the sheath stuck out of the husk). The damp wings fill 0.72 -> 1 (`wingFill`).
- Any step or jump ends it (`birthGone`; the drop lets go at 9/s). Unit test: character-vesper.test.ts.
- `__vesper.birth` reads `{t, w, light, fill, drop}`.

## Tatter
- `rig.perch` (`PERCH`: sat low, hunched, antennae drooped), `rig.strain` (`STRAIN`: up off its heels, chin up),
  `rig.tryWings` (both wings lift: `CAST_SPREAD` / `CAST_RAISE`), `rig.look {x, y, w}` (generic head/eyes/antennae
  look, over the shoulder when behind), `rig.antExtra / antCurlExtra`. `Secondary.tear` (strands shortened unevenly
  + `TEAR.droop` fan + a stutter flutter), `Secondary.hold` (the torn wing held off its back, 34 deg),
  `Secondary.antLen` (far antenna 0.5).
- Timeline (render s after the break): watches her cocoon while she is inside (stirs make it sit up a little); a
  small rise at the break; looks at her while she is within 900 px; the swarm look-up 1.1-6.2 s along a point crossing
  from x-700 to x+900 at the room's swarm path height (**fallback**: render/swarm is screen-framed and exports no
  state; if it ever does, follow it instead); strains 1.6-5.6, the wings' try 2.5-4.0; sinks and looks down 5.6-7.4;
  then a glance the way she went every 7.5 s.
- Gotcha: lowering the chin LIFTS the antennae into rods (the head pitch turns them); Tatter adds `antExtra` 34 when
  it looks down.

## Her light (round 1)
Antenna tips, wing eye-spots, scale dust, trails, fx dust and her point light are pale silver-cream (`LAMP*` in
draw.ts, fx.ts `GOLD*` now hold silver values, `LIGHT` 0xd9dbd3). Eyes and catchlights stay gold.

## Capture
`tools/.cap-hatch.ts`-style scratch script (kept out of the repo: Biome lints `tools/`): open `?manual&nopickups`,
`step(200)`, `input('J1 .20 J1 .20 J1')` = the break at frame 243, `cam({x: 870, y: 1060, zoom: 2.5})` for the
cocoon, `(1150, 990, 3)` for Tatter. A teleport ends the hatching silently (the shots tool shows an open husk).
Clip: `npm run clip -- --script ".170 J1 .20 J1 .20 J1 .130" --zoom 1.5 --name hatch-r1`.

## Weak (round 1)
- Tatter at play zoom reads as "a small dark Wing"; the torn wing is a spike behind it, not yet an obvious ragged wing.
- The husks are evenly spaced (the marks) and alike in silhouette: dark seeds with a slit, not peeled shells.
- Her pull-up out of the husk is a translation of a curled pose: no hands reaching for the lip.
