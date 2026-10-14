# The prologue (wordless opening, ~90 s)

The script is `docs/story/scenes/mouthless-key-scenes.md` section 1 (opening image A, "The breath"). It plays when
the game boots, then hands Umber to the player in the Grove. Timings and staging positions live in one tuning file:
`src/render/prologue/script.ts`.

## Run and capture
- Plays by default. `?skipprologue` goes straight to the Grove; `?manual` (tools, tests) also skips it; `?prologue`
  forces it, even under `?manual`. Escape skips it while it plays.
- Debug API: `__game.prologue` (null when not played): `state()` → `{t, done, simOn}`, `advance(n)` (n frames of
  1/60 s; the sim steps too once she is out of her cocoon), `seek(t)` (forward only), `skip()`.
- Frame sheet: `npm run prologue` (every 1.5 s → `shots/prologue/frames/*.png` + `sheet.png`; `--from --to --every
  --walk "<input DSL>"`). Motion: `npm run clip -- --prologue --fps 30 --name prologue` (→ `clips/prologue.mp4/.gif`;
  `--from/--to` for a window; `--script` is what the player presses from 66 s). Both default to a short walk LEFT:
  walking right from the drop point puts her in the pool (it is 40 px away).
- Capture is deterministic: everything runs on the prologue clock (render time), no wall clock, no Math.random.

## How it is built
- **Director** `src/prologue.ts` (harness side, not render): owns the clock `t` (advanced by the stage's render `dt`,
  hooked in through `RenderStage.attachPrologue`), sets the run mode (frozen until 66 s, then realtime; not under
  `?manual`), masks input (nothing → left/right only from 66 s → nothing from 75.2 s, when the glint arrives), and
  at 66 s teleports Umber under her cocoon (in the air: the sim drops her onto the moss). At 90 s it detaches; the HUD
  and the glints fade in over ~1.2 s.
- **Renderer** `src/render/prologue/index.ts`: a layer over the game's layers (under the dip and HUD) with the plates
  and a black for fades; while a plate covers the frame the Grove's layers are hidden. It hides Umber (and zeroes her
  `ember` light) until her cocoon splits, and hides the Grove's glints so the first she sees is the one sent to her.
- **Plates** (`plate.ts`): a world-kit `Composer` + the kit's `Post`, rendered into a 1920x1080 texture shown as one
  sprite, so the kit's screen-space maths holds at any window size. `breath.ts` (shot 1, one shader: light, threads,
  palm SDF, static), `world.ts` (shot 2), `outside.ts` (end of shot 4 + title).
- **Grove actors** `grove.ts`: everything shots 3-4 add to the game's own layers (so it takes the Grove's post):
  the keyframed camera (`Track` values x, y, zoom, her-weight, dx, dy, game-weight: the last key blends into the game's
  follow camera, so the hand-off has no cut), the twig + caterpillar + spin, a burrback (a second `EnemyRenderer` on a
  fake scene with one spawn, driven by a made-up `EnemyState`; it restores `window.__enemies` after construction) with
  pale root strokes in its shell seams, the two cocoons, Sorrel (a second Vesper skin on its own `LightRegistry`,
  brightened/desaturated by a ColorMatrixFilter, clock x1.25, on a made-up gliding `PlayerState`), the dance ring,
  the glint, and Umber's acting cue.
- **Umber's acting**: `vesperLink.cine = {hold, look}` → rig cue → `HOLD` / `PAST` poses in `actPose`; `hold` also
  drives `offerK`, so `vesperLink.offerX/Y` is her hand and the glint sits in it.
- **Track** (`track.ts`, unit-tested): keys `{t, v[], ease}`; `integrate()` gives a breath whose period changes
  without a phase jump (shot 1 slows from 5 s to 7.4 s while touched).

## The shots
1. **0-14 the breath.** Black; a pale light (~40 px) breathing 2.5 in / 2.5 out with a cloud of threads inside; at
   4.6 a huge warm blur (a palm SDF blurred by 0.3 of its size, so it never reads as a hand) slides in from the left and
   rests; the light leans and warms a little and slows; 9-10.4 it lifts away up-left; two 4-frame flickers, a burst of
   grey grain, a breath that collapses, a dim tremor, black.
2. **14-42 the world from high.** One `LAND` shader: curved horizon, land in perspective with eye height 3 (eye 1
   squashed every pattern into horizontal streaks), towns as clustered warm points that go out as the frost's
   distance field passes them, frost veins = noise ridges in (angle x 14/34/80, radius) about the mountain's foot so
   they fan out and seem to branch. The mountain is `MOUNTAIN` at z 14 with its own 5 s pulse. A ridge at z 16 on the
   right with the stag: frost strokes climb it, the stag sinks 72 px behind the ridge's crest, its antlers (drawn with
   the same branching `grow()` as the root) turn pale and root grows on from their tips. The camera drifts right,
   leans in on the stag (28.5-39), then closes on one moth-fleck and dips to black.
3. **42-60 the burrback and the caterpillar.** Down through the canopy over the left glade to (820, 1130), then in to
   zoom ~5 on a twig at (760, 1210) standing above the grass. The burrback walks in from x 400, stops, `alert` turns
   it toward the caterpillar (the face comes round to camera), the caterpillar spins into a pale cocoon (51.1-53.1),
   it waits, walks on east; the camera pans with it to the pool.
4. **60-90 cocoons, glint, title.** Two pale cocoons on threads over the pool's west edge (1500 / 1700), amber
   breathing in each. 62.2 Sorrel's splits (a dark torn mouth, flaps); he glides straight up to the ring of moths at
   (1760, 420); the camera tilts up after him. 66 hers splits, she drops to the moss; walk only. 74 the glint drifts
   down in front of her; 77 she holds it at her chin, the camera pushes in to zoom 6.6 on her face lit from below;
   81.6 she looks past it and the camera turns her way; 83.6-89.2 a plate: the Grove's last trunks, frost, pale root
   lying across it steaming, the mountain small on the horizon, the title faint in the sky; 88.6-90 back to her and
   the follow camera; control returns at 90.

## What is weak / known gaps
- Shot 3: the burrback "head swing, plate opening" is only its `alert` turn to face the caterpillar; no real reach.
  The caterpillar is tiny even at zoom 5 (22 px long in world px).
- Shot 4: "stands, shakes out her cape" is just her landing; no shake. The look past the glint pans the way she
  faces, but the outside plate is one fixed composition (not mirrored).
- Shot 2 towns still read a little like an even carpet near the camera; no steam visible off the frost front at
  play size (the steam term is there but faint).
- Title text comes from `TITLE` in outside.ts (the game's title moved twice on 2026-10-14; check locked.md).
- `docs/story/current/mouthless.md` section 3 tells a different prologue (a vole, Sorrel shivering for her); this
  follows the key-scenes script, as asked.
