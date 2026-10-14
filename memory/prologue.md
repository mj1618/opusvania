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
  every 3 s. Chosen over a render-side puppet so every move he shows is a move she can copy with the same physics.
  The clips were found on the pure sim headless; `tests/unit/prologue-course.test.ts` fails if a sim change stops a
  leg landing on its mark. Gaps: he does not come back for her if she falls off; he just waits and hops.
- **Moves unlocked as he shows them** (the mask): walk and jump from the start of the first night; dash from the frame
  his body dashes; the glide from the frame his body glides (before that, a jump held while falling is let go);
  give only when asked; the blade never. In the hollow's escape: walk and give (held = fold). Elsewhere nothing.
- **The two moths are stand-ins** (grove.ts): two `VesperCharacter`s, each with its own acting cues
  (`VesperOptions.cine`, link.ts `CineCues`: hold, look, shake, fold, huddle, tap, lookUp) and own light registry,
  `link: false` so they leave `vesperLink` to the player's skin. Hers is fed the sim's player in played stretches and a
  staged pose (`Stand`) in cinematic ones; his the guide's body or a staged pose. The real character layer stays
  hidden for the whole prologue. His moth flight wings (`drawSorrelWings`) draw whenever he is in the air.
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
   camera tilts up and holds on it). Played 28-35: get her into the ferns and hold give (fold). Still on the case at
   33.2: Sorrel tackles her in. 35-40: two silhouettes in the ferns, the coral wash crosses, stops, moves on.
5. **The summit (bt 0-25).** The land with no towns, root fanned across it stopped just short of the wood, the
   mountain small on the horizon breathing, the pale point of the case in the canopy and a faint line out to the
   root's front, the dance above, two moths on a twig against the horizon glow. He looks up, she looks down; the
   silver moth circles him; she holds the glint out; it is folded back; the tap; he lifts off into the dance.
6. **Title, the next night (bt 0-12).** WING / THE KEPT WORLD over the mountain, black, she wakes under a leaf by the
   pool (husks, the case breathing, no fox, no Sorrel), the item text, the HUD with one glint, control.

## What is weak / known gaps
- The fox is drawn simply (curled it reads; standing it is a stiff, plain canine; the walk is a shuffle).
- The case's fox inside is faint; the hollow's root lips are strokes.
- The summit is dark and small: two silhouettes on a twig, a lot of black land.
- Sorrel's skin wings still show beside his drawn flight wings in the air.
- The autopilot places her at the start of each of his legs (small cuts in captures) and on the moss after the dive.
- The item text is shown by the prologue (bottom left, fading at hand-over), not by a HUD item system.
