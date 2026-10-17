# Prologue v2: "The first night" (story-led, about 2 min 50 s)

Supersedes section 1 of [mouthless-key-scenes.md](mouthless-key-scenes.md) (the 90 s montage, kept for reference).
Why: the owner watched the montage and said "it's lacking a bit of story to it". Ori's prologue works because it is
a small complete story with characters before the game starts. This one is too: **two moths are born, he teaches her
to fly, they play, they watch the thing that takes the world take their fox, they hide, they see how big it is, and
they want different things.** Wordless. The opening image A ("The breath") stays.

**What the player should know at the title** (the test every shot answers to):
- **Who:** Sorrel, her brother, quick and showy, who waited for her and taught her to fly; Wing, quiet and
  watchful, the one who notices what is wrong and will not leave what is hurt.
- **What they want:** he wants the dance (and the silver-edged moth in it); she wants the fox back, and him to stay.
- **The threat:** something pale under the ground takes whatever drinks or eats and keeps it asleep in a case. It
  looks with coral lamps. It is everywhere outside the wood and already inside it.
- **The rules, felt in play:** moths are passed over (they have no mouths); carried light gets you seen; you hide it
  under a wing. The prologue teaches *hiding*; the game will teach *giving* (her flaw is that she hides).
- **Why care:** the brother is leaving, she is left holding the light he would not take, and the wood is next.

Conventions as in the key-scenes file: side-on, 16:9, the Grove's language (`docs/art-direction.md`). Times in
seconds; the played stretch is player-paced, with a target. **CINE** = no control. **PLAY** = control. Camera zoom is
given relative to play framing (1x = the follow camera). Staging in world px (`memory/scene-and-units.md`; the pool
is 1536-1856, the west moss 384-1536 at 1280, the root step 384-448 at 1184, the bank 0-384 at 1088, F1 640-896 at
960, F2 1024-1248 at 832, F3 1344-1600 at 704, F4 1760-2016 at 608, the lampwing `lamp-f3` home 1470,420, the dance
ring 1760,420). Everything lives in the left third of the Grove, so Night 1 still has the rest to discover.

| # | Beat | Kind | Time (target) | The one image |
|---|---|---|---|---|
| 1 | The breath | CINE | 0:00-0:10 | a small light touched, and then not |
| 2 | Hatching | CINE | 0:10-0:38 | two moths under one wing, in frost, a sleeping fox behind |
| 3 | The first night | PLAY | 0:38-1:35 (player-paced) | two moths batting a glint back and forth under the dance |
| 4 | The hollow | CINE, a short PLAY | 1:35-2:15 | Wing's wing folded over the fox's cold case, a coral light coming down on her |
| 5 | The summit | CINE | 2:15-2:40 | two small moths on a twig: one looks up at the dance, one down at a pale point in the wood |
| 6 | Title, then the next night | CINE, then PLAY | 2:40-2:52 | alone by the pool; two empty husks and the fox's case |

---

## 1. The breath (CINE, 0-10 s)

The locked image A, cut from 14 s to 10 s, otherwise as built (`breath.ts`).
- **0-1** fade up: the pale light, a cloud of threads inside, breathing 2.5 in / 2.5 out.
- **3.5-4.8** the warm blur slides in from the left and rests; the light leans and warms; its breath slows.
- **6.8-7.8** the blur lifts away up-left.
- **7.9-9** two 4-frame flickers, the burst of grey grain, a breath that does not finish.
- **9.3-10** black.

CAMERA: locked off. SOUND: the breath; one low note under the blur that stops when it lifts; static on the stutter.
*Image:* a small light that was touched, and then wasn't. (Night 4 widens this frame; the ending answers it.)

## 2. Hatching (CINE, 10-38 s)

The west moss by the pool, blue hour, **frost on everything** (the Grove's grade a step colder, frost feathers on the
moss and the cocoons). Two pale cocoons hang on threads, Sorrel's at 1240,1060 and Wing's at 1400,1080 (both moved
west of the pool from v1's 1400/1700, so nothing happens over water). **Under them a fox sleeps curled on the moss
at 1320**, its tail tip glowing a faint ember, its flank rising and falling.

- **10-13** Match cut out of black: an amber light breathing in the dark at the same frame position and the same
  rhythm as the breath, but warm. It is inside a cocoon (zoom 4x on Sorrel's). Pull out to 2x: two cocoons, the fox
  below. (No one is told the two lights rhyme.)
- **13-17** Sorrel's cocoon splits (v1's split). He tumbles out, lands in the fox's fur, shakes himself out (v1's
  `shake` cue on his skin), and is up and bright in a second. High above, the dance glitters through the canopy; he
  looks up at it, a long look.
- **17-20** He looks at the other cocoon. Frost is creeping up it. He drops back to the moss under it and **waits**,
  antennae up. (Held long enough to say *he chose to wait*.)
- **20-24** Hers splits. **Wing drops into the frost** beside the fox's paw, and lies there: wings stuck shut,
  shivering (the `shake` shiver without the flare), her eyes dim. She tries to open her wings; they don't.
- **24-31** Sorrel walks to her and **folds his wing over hers**. Camera pushes in to 3x, low, the fox's breathing
  flank filling the background. They shiver together. Her eyes brighten; her wings unstick and open.
- **31-34** **He taps her wingtip with his.** Once. (Their habit; it returns at the summit, on Night 2, and in the
  last moments of the Spin ending.)
- **34-38** He hops back, ready, looking west: *come on*. Before she follows, **she looks at the fox** a beat longer
  than she needs to (her first act: she notices). The camera eases out to the follow framing on her (no cut).

SOUND: frost crackle, two small heartbeats of wings, the fox's slow breath; the theme's first two notes on the tap.
*Image:* two moths under one wing in frost, a sleeping fox behind.

## 3. The first night (PLAY, 0:38-1:35, player-paced; target 45-75 s)

The tutorial is the relationship: **he shows, she copies.** Sorrel runs ahead, does a move once where she can see it,
then waits at the next mark facing her, with a "come on" hop every 3 s. When she reaches the mark he goes on. If she
falls behind or off, he comes back to her. Nothing hurts; the scene's own burrbacks and lampwings are absent for the
whole prologue (the beat 4 lampwing is a cine actor). Moves unlock as he shows them (the director's input mask): walk
and jump with the double jump; then dash; then glide. The blade stays locked (it is the forest's gift on Night 1). No
prompts except the give prompt in 3c.

**The pale is already here, and it is shown before the glint ever touches the fox:** from the hatching on, a thin pale
thread of root lies in the moss at the pool's west lip (1500), steaming faintly. From F3 and F4 it is in frame below,
the only cold-white thing in the picture.

- **3a. Follow and somersault. ~12 s.** He runs west a little way along the moss and double-jumps up to F1 (640-896,
  960), somersaulting at the top (the skin's existing spin). Waits on F1. She copies. CAMERA: the follow camera,
  leading west so he is in frame ahead of her.
- **3b. The race (dash). ~15 s.** On F1 he crouches, looks at her, and **bolts**: F2, F3, F4, east toward the dance.
  Halfway he **dashes** past her (a cheat), looks back, and on the next gap she can dash too. Below, the fox wakes,
  stretches and pads to the pool's west lip, beside the pale thread, and drinks. **On F4, right under the dance, he
  stops racing.** He stares up at the ring; one moth in it has a silver edge, and it sweeps low past him. She
  overtakes him and wins. He doesn't notice. CAMERA: the follow camera widens to 0.8x on F3-F4 so the dance ring sits
  in the top of frame and the pool's lip at the bottom.
- **3c. The glint. ~10 s.** A glint drifts down between them on F4, the first warm thing either has seen. She catches
  it (any overlap; the pickup is scripted). CINE for 3 s: the existing `hold` cue, she raises it to her face, lit amber
  from below, and can do nothing with it. Control returns, and **the give prompt** (the heart's hold-to-give glyph)
  appears over Sorrel. She holds it and the glint streams to him (the kindling stream, one glint). He raises it to his
  face. He can't either. He looks at her. He **tosses it up.**
- **3d. Keep it up. ~8 s.** The glint floats down slowly; she jumps into it and it bounces to him; he bumps it back
  (scripted); twice. The one moment of play between them; it needs no rule, only a jump. On the third bump it sails
  long, west, and drifts down off F4 toward the pool.
- **3e. The glide. ~10 s.** He **dives after it with his wings open** (the glide, shown); the glide unlocks as he opens
  his wings, and she copies. The glint falls onto **the fox's nose** as it drinks; **the fox sneezes**, the glint pops
  up and Wing catches it as she lands on the fox's back. Sorrel lands beside her and burrows into the warm fur. Control
  ends when she is within 160 px of the fox (she is placed on its back).

SOUND: the theme in its quick, light form under the race; the glint's bump a bright tick; the sneeze.
*Image:* two moths batting a glint back and forth under the dance.

## 4. The hollow (CINE 1:35-2:03, PLAY 2:03-2:10, CINE to 2:15)

The Hush up close, but only its smallest parts: a hollow, a root, a case, a lamp. The camera never looks *into* it.

- **0-6** Low and close (2.5x): the fox shakes its head after the sneeze and goes back to the water. **It drinks. It
  drinks again.** On the second drink the pale thread at its paws stirs, and the moss round its forepaws turns pale,
  like frost but softer. Steam. Sorrel is half asleep in the fur. **Wing sees it** and goes still.
- **6-12** **The ground opens under the fox**: a pale hollow, lips of root, steaming. The fox sinks into it slowly,
  not struggling, its eyes closing as if very tired. The moths flutter up and hang a hand's width above the hollow.
  **A root tip rises out of it to them, a hand's width from Wing's face, pauses, and sinks back.** It looked, and did
  not see them. (The rule: it takes what drinks; moths have no mouths, so it passes them over.)
- **12-16** The hollow closes, and **a case rises on a pale stalk** where the fox was: a cocoon the colour of bone,
  translucent, and inside it the fox curled as it slept at the hatching, breathing. Its tail tip's ember goes grey.
- **16-24** **Wing lands on the case and folds her wing over it**, the exact pose Sorrel used to warm her at the
  hatching, and shivers. It stays cool. She shivers harder. Her glint, held against the case, is the brightest thing
  on screen. Sorrel hovers behind her, not landing; he looks round. (Her first want, acted; it rhymes with the
  hatching, and it is the ending of the game in miniature: warm the cold thing.)
- **24-28** **The lights round the pool dim**: the glow plants close, the fireflies go out, the pool goes black. A
  pulse runs up the case's stalk into the dark overhead, and there, where nothing was, **a lamp lights coral**: a
  lampwing hanging over the pool (`lamp-f3`'s home, 1470,420) wakes as the case closes (the Hush looking; the
  lampwing is its eye, not a separate predator). Its lamp swings toward the one light left: the glint in Wing's hands.
- **28-35 (PLAY).** A coral wash starts down the bark toward her. **Control returns.** Sorrel is in the black
  foreground ferns 200 px west, beckoning, then darting out to tug at her. **The player has to make her leave the
  case.** Walk off it into the ferns and fold (the give button, held, now folds her wing over the glint: the only
  input, prompt-free, shown by Sorrel doing it beside her). If she stays on the case, the wash reaches her, the lamp
  begins to dive, and Sorrel tackles her into the ferns (no fail state; the beat goes on either way, but the player who
  stayed has felt it).
- **35-40 (CINE).** In the ferns, two silhouettes; her wing folded over the glint. The coral wash crosses the ferns,
  slows over them, stops. One thread of amber leaks from under her wing; she folds tighter. The wash moves on, back to
  the case, rests on it a moment, and goes dark. *First lesson: carried light gets you seen. Hide it.* Sorrel looks up:
  the dance, still glittering, far above.

CAMERA: locked low 0-24 (no follow), a slow tilt up with the stalk's pulse to the lamp 24-28, the follow camera at
1.5x for the played escape, a drop into the foreground layer 35-40 (the two moths as silhouettes against the coral).
SOUND: the fox's lapping; then the hollow's breath (low, slow, beat 1's rhythm); static under the case; her shiver;
silence for the dimming; the lamp as a faint rising hum that stops dead when the wash moves on.
*Image:* Wing's wing folded over the fox's cold case, a coral light coming down on her.

## 5. The summit (CINE, 2:15-2:40)

Hard cut from the ferns (no climb: the cut itself says they went up, and Night 1's own climb stays undiscovered).

- **0-10** **The world from high becomes what they see.** The v1 world-from-high set, re-angled: the camera behind
  them, two moths small on a twig in the bottom-left foreground, out beyond the crown the whole dark land. **Every town
  is dark** (no warm points left). On the horizon **the mountain breathes**, pale, in the rhythm of beat 1's light.
  **Pale root fans across the land toward the wood**, its front a line of steam just beyond the forest's edge. And
  **below them in the dark canopy, one small pale point**: the fox's case by the pool. A faint pale line runs from it
  out under the trees to the root's front: the thing in the wood and the thing on the horizon are one thing. Above the
  twig, against the stars, the dance turns.
- **10-14** **Sorrel looks up at the dance. Wing looks down at the pale point, then out along the line to the
  mountain.** Hold on the two of them looking in two directions. (The whole game in one frame.)
- **14-16** The silver-edged moth leaves the ring and circles low round Sorrel, once, and goes back up.
- **16-21** He turns to go. **She holds the glint out to him** (the give pose, no prompt): take it; or, stay. He looks
  at it, then folds her hands back over it with his wing. **He taps her wingtip** (the habit, seen twice now, so it
  reads as theirs) and lifts off into the dance. He does not look back. She does.
- **21-25** Alone, she unfolds her hands. The glint lights her, a small amber point on the twig, the only warm light
  in the frame, facing the pale mountain. Fade.

SOUND: wind; the dance's soft wings; the mountain's breath (beat 1's breath, huge and slow); the theme thins to one
voice on her alone.
*Image:* two small moths on a twig: one looks up at the dance, one down at a pale point in the wood.

## 6. Title, then the next night (CINE 2:40-2:52, PLAY from 2:52)

- **2:40-2:45** The summit frame, one moth, one amber point. **WING / THE KEPT WORLD** fades up in the sky over the
  mountain (`titleCard()`), holds 2 s, fades. Black. (The title lands on silence.)
- **2:45-2:52** Fade up on the west moss by the pool, the next night, no frost now. Wing wakes under a leaf where
  the fox slept. **Two empty husks** hang on their threads. **The fox's case** stands on its stalk at the water's
  edge, breathing; the pale root steams in the moss beside it. No Sorrel. High above, the dance glitters, far, at the
  Grove's crown. The nearest lantern (`lantern-stone`, 1448) stands dark beside the case.
- **2:52** The follow camera; control (every move he showed her; the blade comes later); the HUD fades in with **one
  glint**, the one he would not take, with its item text, the one place mouthlessness is named: *"Warmth the forest
  grows to give away. A moth has no mouth to keep it."* The ember-moths rise from the dark lantern.

*Where's Sorrel?* At the dance, up there. Night 1 is going up to find him, and the first thing she can do is give the
glint he would not take to the lantern beside the fox, and watch the pale root by the case shrink back a little. The
case does not open. (So the first act of play is the opposite of the prologue's lesson: she hid the light; now she
gives it.)
*Image:* alone by the pool; two empty husks and the fox's case.

---

## What is reused, what is new

**Reused (built):** the breath shader (cut shorter); the Grove and its post; the cocoons and their split; Sorrel's
skin, flight wings and brightening; Wing's `hold`, `look`, `shake` cues; the dance ring; glints, the give prompt and
the kindling stream; the world-from-high set (as the summit view, towns all out, a foreground twig added); the title
card; `Track` and the keyframed camera blending into the follow camera; the lampwing renderer; ember-moths; the
lanterns.

**New, kept as small as possible:**
1. **The fox (four-legged)**, built from the Yako skin's head, ears, tail chain, colours and cel painter on a simple
   body; poses: sleep-curl, walk, drink, sneeze, sink. Needed anyway for Night 2's vixen and cubs. (The
   biggest new drawing. Fallback if it cannot be made to read: keep it mostly in shadow, its ember tail tip and ears
   carrying it.)
2. **The hollow and the case**: pale root lips and steam (the strokes and steam from `outside.ts`), and the case as
   the cocoon drawing recoloured bone, thickened stalk, the fox's sleep-curl inside as a silhouette that breathes. The
   case is the game's case everywhere (Night 2's orchard, the city), so this is its first build.
3. **Sorrel as a guide**: a second sim body driven by recorded input (the walk DSL), so every move he shows is one she
   can copy; it plays a clip, then waits at a mark until she is within ~120 px. Owned by the director (harness side),
   not the sim or render.
4. **A wing-fold cue** (one wing folded over another moth, a case, or a held glint): used at the hatching, on the
   fox's case, in the hide and at the summit, and later wherever the habit returns. In the played hide, the give
   button held = fold (no new input).
5. **The bumped glint** (a director-owned glint that drifts down and bounces on overlap, aimed at the other moth).
6. **A lampwing look cue** (lamp lit from dark, aimed at a point, with a soft coral wash), like `BurrRig.cine`,
   and a pulse running up the case's stalk.
7. **The silver-edged moth**: one dance-ring moth with a silver rim.
8. A **frost grade** for beat 2 (a colder post setting and frost feathers on the moss and cocoons).

**Retired from v1 (code kept):** the world from high as the opening (it moves to the summit), the burrback and the
caterpillar beat (the caterpillar's spin belongs to Night 5; the burrback cine stays available), the "outside" plate
(the summit frame replaces it).

## Proposed changes to locked decisions (for the orchestrator)
- **Night 1** loses "racing Sorrel up the trunks, she learns his somersault, dash and glide" (now in the prologue)
  and opens alone; it ends with her finding him at the summit dancing with his partner while she watches from the dark
  (as now). Sorrel is with her again on Nights 2-3 as written.
- The prologue's fox is the **vixen's mate**: Night 2's vixen is the one left behind, and in the Spin epilogue his
  case opens with the rest and the spring cubs are theirs.
- The "camera never looks at the Mouth up close" rule of v1 becomes: we see the Hush's smallest parts up close (a
  hollow, a root, a case, a lamp), never the mountain or the dish, until Night 4.

## Critic pass (2026-10-14)

A narrative director (Ori, Hollow Knight, Nine Sols) asked "do I know who these two are, what they want, what the
threat is, and do I care?" of the first draft. Verdict: *"a story with a real brother, but the hero has no wants and
the main threat can be misread."* Sorrel: yes on all counts. Wing: a passenger. The threat: misreadable (the glint
lands on the fox, then the ground eats it, so "our light drew it"; the moths' escape read as luck; the lampwing read
as a separate predator). Structure close to Ori's prologue; the sibling is what makes it ours.
Revised once from it:
- **Wing acts and wants:** she notices the fox at the hatching, sees the pale first, lands on the case and folds her
  wing over it (the hatching pose) and shivers, and will not leave it; that is why the lamp finds her and why Sorrel
  has to drag her. At the summit she offers him the glint (take it, or stay); he folds it back into her hands and goes.
- **The rules can't be misread:** the pale thread is in the moss from the start and in frame during the race; the fox
  drinks twice after the sneeze before the moss turns; a root tip rises to her face, pauses, and sinks back (it looked,
  and did not see); the lamp lights *because* the case closed (a pulse up the stalk), so it is the Hush's eye.
- **The hide is played:** the player has to make her leave the case.
- **Cut:** the separate jump lesson (3a+3b merged), the summit climb, and 3 s of title hold. About 3:15 → 2:50.
- **Summit:** the fox's case is a pale point in the canopy below, joined by a pale line to the root's front, so her
  look has an object (the fox, then everything), not only fear.
- **Kept on purpose:** the wing-fold over the newborn (now rhymed on the case, which makes it ours). Sorrel is not
  taken or killed (Ori's carer dies; this brother leaves for love), so the prologue ends on a choice, not a loss.
- **Not taken:** "a week to live" is not shown in the prologue; it is better learned in play (Night 1's dawn) than
  told before the title.
