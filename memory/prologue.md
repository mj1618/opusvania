# The prologue, v2 "The first night"

The script is `docs/story/scenes/prologue-v2.md` (two moths born, he teaches her to fly, they play, the hollow takes
their fox, they hide, they see how big it is, he leaves for the dance). About 2 min 50 s with a human; 2 min 17 s
with the autopilot (it plays the first night fast). The hero is **Wing** (code id `vesper`). Every number of the cut
is in `src/render/prologue/script.ts` (beats, staging, Sorrel's course).

## Run and capture
- Plays by default; `?skipprologue` skips it; `?manual` (tools, tests) skips it; `?prologue` forces it, also under
  `?manual`. Escape skips to the next night.
- `__game.prologue`: `state()` → `{t, done, simOn, beat, bt, phase, leg}`; `autopilot(on)` plays her part (captures,
  tests); `advance(n)`, `seek(t)` (global seconds, forward only), `skip()`.
- Frame sheet: `npm run prologue` (autopilot on, every 2 s → `shots/prologue/frames/`, `sheet.png` and `sheet.jpg`,
  each frame labelled with its beat). Motion: `npm run clip -- --prologue --fps 30 --name prologue`.
- **Judge from `sheet.jpg` or the frames**: an image preview turns the big PNG into a palette and the dark gradients
  look banded when they are not.
- The capture tools serve the page with a stub of Vite's client (`freezeCode` in tools/lib/browser.ts), so a file
  saved by another agent mid-run no longer reloads the page and throws the capture away.

## Architecture (the choices)
- **Director, harness side** (`src/prologue/index.ts`): the beat machine and clocks (render time), the input mask,
  teleports, the scene the sim runs, the first night's glint, the autopilot. It writes a plain `plan`
  (`src/render/prologue/plan.ts`) that render reads. The sim is untouched.
- **The scene swap** (`Game.useScene`, src/game.ts): the sim runs the Grove **without creatures, glints or pods**
  for the whole prologue (the script wants them absent; nothing can hurt her), then at the next night the whole
  Grove plus one extra glint (`sorrels-glint`) where she wakes, so the HUD comes up with one real glint. The stage's
  renderers keep the full scene in `ctx.scene`; they index enemies and pickups by the state, so the empty state draws
  nothing.
- **Sorrel the guide** (`src/prologue/guide.ts`): a second body on the real sim, his own `GameState` stepped with the
  same pure `step()` and tuning (in the same creature-less Grove), in lockstep with hers (`game.afterStep`). He plays
  recorded clips (the input DSL, `COURSE.legs`), then waits at each mark until she is within 120 px, hopping "come on"
  every 3 s. If she is below him and has not come up for 4 s (`COURSE.lagBack`), he goes back for her: walks down
  (off the branch) and over to her, then to the start of the leg from her level (`COURSE.levels`) and leads it again.
  Chosen over a render-side puppet so every move he shows is a move she can copy with the same physics.
  The clips were found on the pure sim headless; `tests/unit/prologue-course.test.ts` fails if a sim change stops a
  leg landing on its mark. Gaps: he does not come back for her if she falls off; he just waits and hops.
- **Moves unlocked as he shows them** (the mask): walk and jump from the start of the first night; dash from the frame
  his body dashes; the glide from the frame his body glides (before that, a jump held while falling is let go);
  give only when asked; the blade never. In the hollow's escape: walk and give (held = fold). Elsewhere nothing.
- **The two moths are stand-ins** (grove.ts): two `VesperCharacter`s, each with its own acting cues
  (`VesperOptions.cine`, link.ts `CineCues`: hold, look, shake, fold, huddle, tap, lookUp) and own light registry,
  `link: false` so they leave `vesperLink` to the player's skin. Hers is fed the sim's player in played stretches and a
  staged pose (`Stand`) in cinematic ones; his the guide's body or a staged pose. The real character layer stays
  hidden for the whole prologue. In the air his skin's own wings are left out (`VesperCharacter.hideWings` →
  draw.ts `noWings`) and his moth flight wings (sorrel.ts `drawFlightWings`) are drawn instead.
- **Staged creatures on the game's painters**: the lampwing over the pool is a second `EnemyRenderer` on a fake
  one-spawn scene and a made-up state, its lamp scaled by `LampRig.cine.lit` (dark until the Hush looks through it).
  `BurrRig.cine` (v1) is still there, unused.
- **Post looks for a cinematic** (`POST_CINE` in render/post/config.ts): `frost` (the hatching: colder, paler, less
  saturated) and `dim` (the hollow: the wood's lights go down). 0 in play.
- Plates (the world kit at 1920x1080 with its own post, shown as one sprite): `breath.ts` (beat 1), `summit.ts`
  (beat 5 and the title; the world-from-high pieces exported from world.ts: the land shader, the mountain).

## The beats
1. **The breath (0-10).** v1's shader, cut to 10 s.
2. **Hatching (bt 0-28).** Match cut out of black onto the amber in his cocoon at zoom 4 (both breathe on the
   breath's 5 s), pull out to 2x: two cocoons, the fox asleep curled below (fox.ts), frost (grade + rime). 3.2 his
   splits, he lands, shakes out, looks up at the dance; walks back under hers and waits; 10 hers splits, she lies in
   the frost (huddle cue); 14-21 he folds his wing over her (fold cue, camera in to 3.6x); her wings open (shake);
   21.2 the tap; he hops west, ready; she looks back at the fox; the camera blends into the follow camera.
3. **The first night (played).** Legs: moss → F1 (double jump), F1 → F3, F3 → F4 (his dash). On F4 he stops under
   the dance (the silver-edged moth sweeps past him) and she wins. A glint drifts down to her; 3 s she holds it to her
   face; the give prompt (a key cap, a ring filling) over him: hold give → it streams to him; he holds it up, looks at
   her, tosses it. Keep it up: her body bumps it to him, his hop sends it back (turns, so one jump is one bump); on
   her third it sails west; he dives after it gliding; it lands on the fox's nose, the fox sneezes, it hangs over the
   fox's back; within reach of the fox the played stretch ends. The fox woke when the race began and went to drink.
4. **The hollow (bt 0-40).** On the fox's back; it drinks, drinks again; the moss pales; the hollow opens (root lips,
   steam), the fox sinks asleep; the moths flutter up; a root tip rises to her face, pauses, sinks; the case rises on
   its stalk (a lens of bone skin with the fox asleep inside, its ember grey); she lands against it and folds her wing
   over it; the lights dim; a pulse runs up the stalk to the lamp; the lamp lights coral and turns to her glint (the
   camera tilts up and holds on it, then follows the wash down). Played 28.6-35.6: get her into the ferns and hold give
   (fold; she cannot run on past the ferns out of the picture). Still on the case at 33.8: Sorrel tackles her in.
   35.6-43: two silhouettes in the ferns; the coral wash crosses, stops over them searching (held ~2.4 s), moves on.
5. **The summit (bt 0-15), the peak.** Close on the two of them on a twig at the top of the wood (their own
   skins at 2.3x, moonlit; plate exposure 1.35 and a moon wash), the world from high below (no towns, the root's fan,
   the mountain breathing on the horizon, the case's pale point and its line), the dance close above (one moth edged
   silver). He looks up at the dance, she looks out; the silver moth circles him; he turns to her and offers (a hand,
   then up: come); she hesitates and folds her wing over the glint (she hides); he taps her wingtip and flies up into
   the dance (his flight wings); she watches him there, the glint leaking amber from under her wing.
6. **Title, the next night (bt 0-13).** WING / THE KEPT WORLD large in the left sky (scale 1.9, ~4 s held), black, she wakes under a leaf by the
   pool (husks, the case breathing, no fox, no Sorrel), the item text, the HUD with one glint, control.

## What is weak / known gaps
- The fox is drawn in flat shapes (a lithe body on a curved spine, tapered legs, a brush, a four-beat walk, the dip to
  drink); it has no shading beyond fur tufts. The hollow's root lips are strokes.
- On the summit the twig is dark on the dark canopy; only its moonlit top edge separates it.
- The autopilot places her at the start of each of his legs (small cuts in captures) and on the moss after the dive.
- The item text is shown by the prologue (bottom left, fading at hand-over), not by a HUD item system.

## Pass 3 (after the blind review, docs/story/reviews/prologue-v2-pass2.md)
The review's diagnosis: every failed beat was acting at play scale. The fix is held close-ups (camera zoom) on every
acting beat, and two siblings who cannot be confused.
- **The siblings** (`looks.ts`): Sorrel lighter (ColorMatrix brightness 1.3, a warmer hue), 1.12x, wings habitually
  half open (`CineCues.wings` +); Wing darker (0.76), 0.9x, wings held shut (`wings` -). Her look eases back to the
  game's own over the wake, so the hand-over is seamless. Size is a pivot-scale of the stand-in layer about the feet.
- **Hatching** at ~3-3.9x, each beat held: he looks up at the dance, waits under her cocoon, she lies in frost and
  tries to open her wings (a weak shake), he folds over her (~4 s), her eyes brighten (huddle eases off), her wings
  open, the tap, she looks back at the fox. Beat length 26 s.
- **The dance** (`dance.ts`, shared by the Grove and the summit): soft pale-gold rounded wings, no dark marks (two
  dark marks read as owl eyes), a fading light trail per moth, the silver one swoops past Sorrel's face on F4.
- **The hollow**: the fox's muzzle goes into the water (rings), twice; the hollow's rim is soft rolled lips and
  curling tendrils (never teeth: the de-mouthing rule); a tapered swaying root tip rises to her face and sinks; the
  case (`case.ts`) is cold bone-white with the fox asleep inside greying from warm to grey; she lands ON the case in
  his fold; the moths' warm lights are kept low there so the case reads cold. The camera follows a pulse up the stalk
  to the lamp (no cut). In the hide Sorrel pulls her in and folds over her.
- **The summit** follows the shot list: he looks up, she looks down at the case's point (brighter, with a bead of light
  running along its line to the root's front) then out; the silver moth circles him; he turns to go; SHE holds the
  glint out (`give` cue); he folds her hands back over it; the tap; he goes without looking back; she watches; alone
  she unfolds her hands and the glint lights her, held ~2.7 s; then the title (~4 s). Camera on the plate (`CAM`):
  wide, in to 1.9x for the offer/fold/tap, out to see him go, in on her alone. 16.5 s.
- **Play** framed at ~1.4x (closer for the glint, the bumps and the sneeze; eased, not snapped).
- **After the hand-over** `remains.ts` keeps the case breathing by the pool, the root thread and the two husks (render
  only, owned by the stage).
- Beat ids are unchanged (breath, hatch, play, hollow, summit, wake); lengths changed: hatch 26, hollow 43, summit 16.5,
  wake 13 (the audio agent scores by beat name).

## Pass 4 (after the second blind review, docs/story/reviews/prologue-v2-pass3.md)
Lesson: a beat that exists in code but is 30 px on screen does not exist. Verify each beat in frames from the clip
at phone size before claiming it (`ffmpeg -ss <t> -i clips/prologue.mp4 -frames:v 1`), not from the cue values.
- **The wing-fold** is drawn, not posed (`wrap.ts` `drawWrap`): a broad wing from the shoulder, its leading edge
  arching over the thing and its tip down on the far side, pale hem, one eye-spot. The same function draws his over
  her (r 30, his colour) and hers over the case (r 62, her colour): the rhyme is one silhouette. The skin's own
  cape-wing pose could not read at this size. Drawn in world px in `actors`, not inside the scaled stand-in layers.
- **Her in the frost**: a pale frost bed behind her (her dark shape on it), the stand-in layer rotated ~1.35 rad about her feet (lying on her side), rime dots on her,
  a hoarfrost crust and feathers along the moss, rime on the fox's back, a stronger frost grade.
- **The tap**: a flash ring at the midpoint of their hand points (hatch and summit).
- **The fox drinks** with its muzzle in the pool: the head travels (`DRINK_REACH`) and tips (`DRINK_PITCH`), nose at
  (1632, 1356) = `COURSE.nose`, ripples at `WATER`. The fox and the moths draw in `playfieldFront` so the muzzle is in
  front of the bank's edge; the fox's ground clip only applies while it sinks (it hid the muzzle before).
- **The sneeze**: the played stretch ends with a 3 s held close-up (no control; the camera gets there during the sail) of the fox drinking as the glint lands, rests 0.8 s (`sneezeWait`), and the sneeze sprays drops and pops it up
  on its nose and pops up; the hollow begins from where they were (`plan.from`, the play camera blends into the
  hollow's: no cut).
- **The lamp** is no longer the lampwing creature: a pale bulb on a pale thread from the case's top, kindling coral,
  with a narrow coral cone toward her. The pulse is a bright bead climbing the stalk and the thread (2.5 s), the
  camera tilting with it.
- **Summit**: silhouettes (backs to us, a ColorMatrix dim: `tint` does not reach through the layer's filter) for the
  looks, lit for the offer and for her alone; his brightening off there (his pale face blew out); the silver-edged
  moth is drawn as a moth (swept silver forewings, antennae) and swoops to him, waits, and leads him up; dead towns
  (dark rimed blocks, LAND `uP[3].x`) so the land reads as land; the mound's core light and dark creases toned down
  (it read as a face with one eye); the case's point sits under the twig.
- **Husks**: the torn lip is a soft rolled ring (the flap strokes read as fangs).
- Beat lengths: breath 10, hatch 30, play (player-paced; ~24 s autopilot), hollow 46, summit 20, wake 13.
