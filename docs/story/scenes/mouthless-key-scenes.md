# Mouthless: the key scenes, shot by shot

The story as it will be seen. Every shot is in-engine, side-on, 16:9, in the Grove's language (`docs/art-direction.md`):
dark teal-indigo shadow, a few small precious lights, atmosphere for depth. Times are in seconds. **CONTROL** is what
the player holds. **SOUND** marks where music or sound would carry the beat later; every beat must also work silent,
as it must today. **BUILD** is what must be drawn that does not exist yet. The three biggest beats have variants,
marked **[VARIANT]**, with my pick after each; `choices.md` has them on one page.

## The colour script

- **The forest gives amber:** glints, lanterns, the heart, the ember (`#ffb36b`, `#ffd9a0`).
- **The Mouth is pale:** milk-and-bone root (`#d9cfc4` lit from inside), always steaming, never saturated, never
  brighter than Vesper. Its own light is a cold, flickering grey-white: static.
- **Lampwing coral** (`#ff7a6a`) is the Mouth looking.
- The turn of the story is a colour change: **the first time amber enters the dish** (Night 4). The last frame of the
  game is the mountain lit amber from inside.

**Reused, not rebuilt:** the Grove, Vesper, lanterns and the kindling stream, the heart's wake, burrbacks, lampwings,
glints and the wallet's pour, ambient moths, the fade and re-form, `GoalCamera`, and the frozen fox skin **Yako**
(the vixen and, small, her cubs). **One new piece of tech everything needs:** a keyframed camera track (pan, zoom,
hold, ease) over the `__game.cam` override, and a dip to black in post.

---

## 1. The prologue (about 90 s)

One rule for the whole sequence: **the camera never looks at the Mouth up close.** We see what it does from very high
or very low, so the player's first idea of it is a myth.

### Shot 1. The opening image [VARIANT] (0–14 s)

**A. "The breath" (as in the storyline).** Black. Centre frame, a soft pale light the size Vesper's head will be,
pulsing: in 2.5 s, out 2.5 s. Inside it, a faint cloud of threads. At 5 s a huge, out-of-focus warm blur comes in from
the left and rests against it; we can't tell it is a palm. The light leans toward it and its pulse slows. At 9 s the
warmth lifts away out of frame. The light pulses on, then **stutters**: two flickers, a burst of grey grain, a breath
that doesn't finish. Hold 3 s. Black.
*Lands as:* a small light that was touched, and then wasn't.

**B. "The rally".** Black. A tiny pale bead crosses left, touches a dim stroke, crosses right, touches another. Tok,
tok: a firefly between two reeds. It misses, and the frame floods with harsh grey grain for half a second. It rallies
again, faster, steadier, and the grain stays away, until the bead is a line. Black. On Night 4 the player meets the
same bead on a screen.
*Lands as:* something learning, afraid of the noise.

**C. "Two lights".** Black. Two lights a hand's width apart breathing in step: the pale one, and an amber one inside
silk (a cocoon). The warm blur rests on the pale one, then lifts; the pale one stutters out of rhythm. The amber one
keeps breathing. The camera pulls back fast and the gap opens into miles: the pale light is the mountain's core, the
amber one a cocoon in the Grove.
*Lands as:* hero and antagonist as two seeds, one tended and one left.

**Pick: A.** The simplest and most mysterious (seed? egg? heart?), and it pays three times: Night 4 widens this exact
frame into the lab, and the final image answers it. B gives the technical truth away too early; C explains the
parallel instead of letting the player find it.
**BUILD:** the dish-light shader (reused in the lab and ending), one soft hand silhouette, never sharp until Night 4.
**SOUND:** a breath, not music; one low note under the warm blur that stops when it lifts, and static hiss with the
stutter.

### Shot 2. The world from very high (14–42 s)

Night from very high: a curved dark horizon, the land near-black teal. In the middle distance a mountain whose shape
is wrong, folded and too smooth, with the pale light from Shot 1 pulsing small at its core.
- **14–22 s.** From its foot, pale root spreads across the land **like frost across glass**, branching on a wavefront,
  steam rising where it passes. Slow drift right, no cuts.
- **22–30 s.** Warm points (towns) sit in its path. As the frost reaches each, it fades out, covered. Dozens, then
  hundreds.
- **30–36 s.** *The deer, redrawn so we can make it:* no herd. On a near ridge, one stag in silhouette against the
  sky. The frost reaches it. It doesn't run: it sinks straight down until only the antlers stand above the ground,
  and **the antlers are the shape of the root.** Root grows on from their tips.
- **36–42 s.** Through it all, a few pale moth-flecks cross the frost line on their own paths, untouched. The camera
  picks one and follows it down.

CONTROL: none. **BUILD:** the world-from-high set (horizon, mountain, a growing branching line field, light points),
one stag. It returns on Night 4 and, run backwards, in the ending. **SOUND:** music enters with a slow pulse matched
to the light; each town going out drops a note from the chord until it is thin.

### Shot 3. The burrback and the caterpillar (42–60 s)

Down through the canopy into the Grove's blue zone at play framing. A caterpillar on a low twig. A burrback walks in,
root growing in its shell seams, swings its head over the caterpillar, mouth-plate opening. The caterpillar **spins**,
a pale blur of silk, and is a cocoon in two seconds. The burrback sniffs, loses interest, walks on. The game's rule,
shown once: *what doesn't eat, it doesn't see.*
CONTROL: none. **BUILD:** the caterpillar and its spin (a short silk ribbon), root seams on the burrback (shared with
Dun). **SOUND:** the burrback's breath; the spin a dry rustle.

### Shot 4. Two cocoons, a glint, the title (60–90 s)

- **60–66 s.** Two cocoons hang over the pool, amber breathing in each. One splits: **Sorrel**, quick and bright,
  flies straight up toward a glittering ring of moths in the canopy (the brood's dance). He doesn't look back.
- **66–74 s.** The other splits. Vesper drops to the moss, stands, shakes out her cape. CONTROL: **walk only**; she
  is the player's now.
- **74–82 s.** A glint drifts down in front of her, the forest's first gift. She raises it to her face; the camera
  pushes in slowly on a pale face with no mouth, lit amber from below. She can't use it. She holds it.
- **82–90 s.** She looks past it, and the camera follows her eyes past the last trunks: outside the Grove, pale root
  **steams in the frost**, quietly, a few metres from the trees. The title, faint, in the sky above it.
*Lands as:* a face with no mouth lit by a gift it can't use, and beyond it the thing that only takes.
**BUILD:** Sorrel (a Vesper skin variant: lighter plum, longer brighter antennae, quicker idle; no new rig), the dance
(ambient moths on an orbit), cocoons. **SOUND:** the music thins to one voice for her; the title lands on silence.

---

## 2. Night 2: Sorrel becomes the brightest thing in the field (about 40 s)

The orchards at night: rows of dead fruit trees, moonlit tall grass, the vixen's den in a bank. The Dun fight is
gameplay; this is its last minute.

1. **The pin (0–4 s).** Dun's ram connects. Doubled hitstop, then the camera eases in 15% to ground level: Vesper on
   her back under Dun's front shell, her glints spilled round her in a loose ring, the only warm things on screen.
   CONTROL: she can struggle; it rocks her a few pixels and changes nothing.
2. **It sees the light (4–7 s).** Dun's head swings to the glints, mouth-plate opening over them and her. Far off, a
   lampwing's coral lamp turns this way. She is lit, so she is seen.
3. **Sorrel (7–10 s).** A streak from frame top: he drops between Dun's jaw and the glints, the shell clipping his
   wing, and scoops: the glints stream to him (the kindling stream reversed) and he **blazes**. The field gets a
   moving amber key light.
4. **The decoy (10–18 s).** He darts off low across the field, slow enough to be chased, the grass lighting in a
   wave under him. Dun rears off Vesper and turns after him. Camera: one long pan with Sorrel, then it **stops dead**
   and lets him cross the screen alone, Dun crashing after him, its root-leash tearing a furrow. The frame: a dark
   field, one burning moth drawing a line through it, a dark mass following the line, and in the foreground grass,
   small and dim, Vesper sitting up.
5. **The vixen (18–24 s).** CONTROL: full; she carries nothing, so she is invisible again. The vixen (Yako, thinner,
   greyer) slips from the den, looks straight at Vesper for one beat, the first animal ever to look at her, and runs.
6. **After (player-paced).** The furrow leads to the orchard's end. Sorrel sits on a branch, dark, every glint spent
   as a decoy behind him; Dun far off, nosing one in the grass. He drops beside her, does his somersault, showing off,
   then holds still and lets her lean on him. Two seconds; their first touch.

**SOUND:** the pin has only her wingbeats; Sorrel's blaze is the theme, full and fast; the decoy run is Dun's feet,
receding; the vixen is silent. **BUILD:** Dun (burrback at 2x, shell half root, a trailing root leash), the orchard
(the far-trunk painter with bare limbs), the vixen (Yako). The blaze and reverse stream are parameters on existing
systems.

---

## 3. Night 4: the lab, the reveal, the gift (about 3 minutes)

The room at the mountain's heart breaks the palette on purpose: for the first time, **straight lines** (doorframe,
desk, screen, shelves), every edge softened by pale folded tissue. Light is cold: the screen's grey glow and the
dish's pulse. No amber except what Vesper carries.

### The room (CONTROL: full)

She enters from a dry pipe at floor level; the camera pulls out to its widest framing yet and holds, Vesper tiny at
bottom left. Crossing it, she finds:
- **The sign**, half grown over: *No one goes hungry*, readable only when her glints light it.
- **The poster:** a hand lifting a small light out of a drawn head into a dish. *Grown from us, to feed us.*
- **The screen:** two bats and a bouncing bead; nobody plays; one bat follows the bead by itself. Tok, tok.
- **The chair:** a case grown round it, translucent where thin; inside, the silhouette of a seated woman, head bowed,
  jars in her lap. The Mouth's oldest stalk, worn smooth, runs from the dish into her case.
- **The dish,** centre, on a pedestal of tissue: cracked glass, dry tubes, a grey cloud pulsing at the prologue's
  rhythm, and on the glass a handprint in old dust.

### The memory (CONTROL: none, 40 s)

1. **(0–3 s)** She touches the stalk. Dip to black.
2. **(3–12 s)** The prologue's first frame, exactly. Then the camera **pulls back**: the light is the cloud in this
   dish, on a clean desk, and the warm blur is **a hand** on the glass, now in focus. Behind it, soft, a young woman
   (silhouette) leans in.
3. **(12–22 s)** The screen in its old clean colours. Each miss floods the cloud with grain; rally after rally, it
   stops. After a long rally her hand pats the glass once.
4. **(22–32 s)** Amber evening, an emptied room. Her silhouette in the doorway, hand on the switch. She looks back at
   the dish, 2 s. Switches off. Goes. The feed light turns red, the grain floods back and does not stop.
5. **(32–40 s)** The present, same framing: the grey dish and her case side by side, Vesper between them.

### The world breathes (CONTROL: none, 15 s)

Cut to **the prologue's world from high**, same angle. Light runs outward along every root on earth, and every case
on the land, a grey bead, **swells once, slowly, like breath**. *It has been feeding them.* The beads she burned on
the old road are a line of dark holes in the pattern, and they stay dark.
**SOUND:** the one place the score swells for the Mouth, a long chord with the wavefront, cut to static hiss as we
return to the dish.

### Dun's offering (CONTROL: none, 15 s)

Dun shoulders in, the vixen limp in its jaws, walks past Vesper without seeing her, lays the vixen in the dish's
tubes and backs off, head low: it has done this all its life. Pale threads lift toward the vixen.

### The turning moment [VARIANT] (about 25 s)

CONTROL: the hold-to-give prompt from the heart appears at the rim. The game waits as long as the player does.
Holding pours **every glint she carries**; she can't pour some. The threads round the vixen go slack and drop her.

**A. "Her shape on every wall" (as in the storyline).** Every root in the room swivels toward Vesper, a slow
sunflower turn, and from the tissue of every wall her shape rises in pale relief, dozens of moths with open wings,
the pose of the carving on the Grove's stone. The camera pulls back to the widest frame and holds: a cathedral of her.
*Lands as:* seen everywhere at once, in the same picture the forest made of a friend.

**B. "The cloud draws a moth".** Extreme close-up over the dish (zoom ~2.5x), glints falling in like coals into
water. For the first time **amber enters the dish**: the cloud warms from the edges in and the grain stops, entirely,
the stillest second of the game. Then its threads draw together into a shape: **a moth, wings open,** made of its own
lit cells, the first picture it has ever made. Hold 3 s. The camera rises to Vesper's face reflected in the glass,
and behind her every root in the room turning toward her.
*Lands as:* inside a brain made by people, the first thing it ever pictures is her.

**C. "Every lamp turns".** Silence. Then every lampwing hanging dark in the high room lights its coral lamp at once
and turns it on her. Cut wide to the world from high: across the dark land coral points open, thousands, like eyes.
Cut to the Grove's dance: one lampwing over the brood turns its lamp, slowly, onto Sorrel.
*Lands as:* the moment of love read as the moment of being hunted.

**Pick: B, ending on C's last shot.** B puts the turn where the gift goes, and one picture holds both readings (a mind
that loves her; a mind that has found a new food). It is also the cheapest: a shader state on the dish we already need.
A is gorgeous but costly, and its echo of the carving can be spent in Act III (her shape on the city's walls). The
locked beat says "through her, every moth", so after B cut once to the Grove and let one coral lamp settle on Sorrel:
4 s, the hook into Night 5.
**SOUND:** the pour is one bright note per glint; B's stillness is true silence, the static gone; the moth forming is
one held voice; the Grove cut is only the dance's wings.

### The chase (CONTROL: full)

The vixen wakes and bolts. Dun stares at its dropped offering, then at Vesper: the first time it sees her. The mountain
chases her down its veins; roots no longer part; lampwings track her dark. At the lantern where she re-forms she can
set the coal down, silently.

**BUILD (the most expensive night):** the lab (a new painter: straight-edged objects softened by growth), sign,
poster, screen and bead game, the chair and the woman's case (a translucent pod with a seated silhouette), the dish
and pedestal, the memory grades (the same room re-tinted, not redrawn), the young woman as a silhouette in two poses,
the hand in focus, Dun carrying the vixen. Variant B adds only a dish state.

---

## 4. Night 5: the lowest point (about 2 minutes)

**The Grove falls (CONTROL: full).** Blue hour. The camera frames the first lantern exactly as when it first burned.
A tide of pale root comes up out of the pool and over the bank, steaming, moving like slow surf, and **wraps** the
lantern: the amber dims through pale skin, like a town in the prologue. The left zone's grade drops to grey-teal; the
glow plants close.

**The dance breaks (CONTROL: full).** Lampwings dive into the brood's dance overhead; it scatters. Roots climb toward
next year's cocoons. The boss, three mouths in the ground, is staged so each opening is the only pale-lit thing in its
part of the frame: the player learns that pale means danger.

**Sorrel goes (CONTROL: none, 12 s).**
1. **(0–4 s)** The last mouth closes. Vesper lands on a high limb. Camera eases in.
2. **(4–8 s)** Across the gap Sorrel, alone; behind him the last of the dance scattering. He looks at her. Neither
   moves. A coral lamp sweeps between them and stops on her, not him.
3. **(8–12 s)** He turns and flies up and out of frame, as in the prologue. This time the camera does not follow.
   It stays on her.

**Dun (CONTROL: none, then full; 30 s).**
1. **(0–6 s)** Roots close on her branch; she fades and the camera follows her light to the nearest lantern, the right
   zone's, still burning, small in a field of creeping root.
2. **(6–10 s)** She re-forms beside it, dim, her last glints spilled round her.
3. **(10–18 s)** A shape blots out the mist: Dun, sent by the mountain, its root-leash running back into the dark. It
   stands over her. Hold 4 s; nothing moves but the steam off its shell and her antennae.
4. **(18–26 s)** Dun lowers its head and noses her glints, one at a time, into a heap against the lantern's stem. Then
   it lies down across the lantern's mouth, back curved round the glow, **facing out**. The leash pulls taut; Dun leans
   on it until it **snaps**.
5. **(26–30 s)** A wide, low frame. CONTROL returns, but the shot holds until she moves.
*Lands as:* a great dark back curled round one small lantern, facing a field of pale root, and a moth inside the curve.
**SOUND:** no music through Sorrel's leaving, only wind and fading wings; the leash snapping is the loudest sound of
the night; the theme returns once, slowed, on the wide hold.

**The caterpillar (CONTROL: full, the shiver tutorial).** Outside, a caterpillar keeps failing to spin on a frosted
twig; the silk breaks and blows away in the cold. Vesper wraps it and holds shiver: her glow drains into it, the HUD
lanterns cool, the silk holds. It spins. The ending, small, taught by doing.

**BUILD:** the root tide (the one root painter with a surf-like growth front), the overrun grade, Dun's lie-down and
nose-push poses, the snapping leash, shiver (a glow drain on existing light systems).

---

## 5. Night 7 and the Spin ending

**The cavern.** The fight against the Mouth ends in a cavern of breathing tissue: the grey dish at the bottom of a
deep round bowl, its rim a ring path Vesper can walk. Tallow kneels at the back by his sister's case.

1. **Full (0–10 s).** The last glint goes in. The dish glows amber all the way through. Every root stops. Cut to the
   world from high: the frost-root halts mid-branch everywhere. Back.
2. **Cold (10–25 s).** With nothing taken, nothing keeps it warm. Frost feathers creep over the glass from the rim
   inward (the root's branching shader, white). Pale strands rise to wrap it, sag, fall: too thin.
3. **The offer (25–45 s).** A root rises behind Sorrel, scaleless and dim at the rim, and grows a case round him,
   gently. Through its thin skin his colour returns, and projected on the inside like light through leaves, **the
   dance plays on overhead, forever.** A second case opens beside it, Vesper's size.

### Spin: the choice, played (CONTROL: walk; abilities lost one by one; about 90 s)

CONTROL returns, on foot. She can walk into the open case (Stay), drop the coal if she carried it (Burn), or walk the
rim. No prompt chooses for her.
- **Circuit 1.** Walking with shiver held pours her light into the frost; a band melts to amber behind her. At the
  lap's end her **glide** is gone: the next jump just drops. No text; the HUD icon dims.
- **Circuit 2.** **Jump** goes. Sorrel's case splits; he climbs out and **walks behind her**, shivering too.
- **Circuit 3.** **Dash** goes. The moths come: first from her lanterns, then the brood down the shaft, then from
  every crack, the moths of the world it never noticed, until the camera pulls back and back and the mountain's flank
  is **furred with shivering wings**, thousands of small amber points. She walks slower each lap, until she stops.
- **Let go.** Warmed, the threads do what the caterpillar did: they let go of the walls and **spin** the dish in silk.
  Cut to the world from high, the prologue's shot **run backwards**: every root draws back into the mountain, town
  lights return (not all, not in order), the stag's antlers sink, and the mountain folds shut into a cocoon.
**SOUND:** each lost ability drops a note from the theme until one voice remains; Sorrel adds a second; the moths are
a rising choir of wingbeats; the let-go is silence, then the full theme once, never louder.

### Epilogue (CONTROL: none; about 50 s, dissolves)

- **The street.** *Crowds redrawn so we can make them:* one silhouette street at grey dawn, a row of cases hanging
  from a dead arcade. One by one they split; stiff grey figures stand; one sits down at once in the road. **The fourth
  case doesn't open.** Hold on it. At most six figures, no faces.
- **Tallow** holds his sister. Her eyes open.
- **Dun** lies against the silk-wrapped dish to keep it warm.
- **The rim.** Two moths side by side, still, frost on their wings. 6 s; the camera does not hurry.
- **Spring.** The Grove, green: the brood's cocoons split and dozens of small moths rise; from the den, **fox cubs**,
  the first born in forty years.

### The final image [VARIANT] (12–20 s, then black)

**A. "It presses outward" (as in the storyline).** The mountain from the Grove's summit at dusk, wrapped in pale-gold
silk. A slow bulge pushes outward from inside, holds, sinks. Again, stronger. On the third push the silk thins to show
amber inside. Black before anything breaks through.
*Lands as:* something new is being born from the thing that ate the world, and we don't know what.

**B. "The breath turns warm".** The cubs play in the foreground grass. Far behind, the cocoon-mountain pulses once in
the prologue's exact rhythm, but **amber**, not pale. One breath. Black.
*Lands as:* the starving light of the first frame has been fed, and the world goes on in front of it.

**C. "The hand, returned".** The maker, old, alone, climbs the mountain's last slope at dusk, a small silhouette
against a wall of silk, and lays her palm flat on it. Insert: her hand on the silk, framed exactly like the prologue's
blur but from outside. A beat. Then **something presses back against her palm** from within. She doesn't lift it.
Black.
*Lands as:* in the prologue a hand lifted away and a mind starved; now one stays, and is answered.

**Pick: C, which contains A.** It closes the loop the prologue opens (a touch that left, a touch that stays), and
gives the maker, who came back and was taken before she could give, her gift at last. The press from within is A's
image, and stays open: love, or a new thing turning toward warmth like any shoot. B is the quieter fallback if C
feels too neat.
**SOUND:** wind on her climb; the prologue's low note returns at her touch; one heartbeat at the press; then 3 s of
silence over black before credits.

**BUILD (Night 7 and ending):** the cavern (the lab's tissue painter in a bowl), the dish's warm, frost and silk
states, the case with the projected dance, ability-loss HUD dimming, the moth swarm (ambient moth code instanced at
scale), the world-from-high set reversed, the street strip, the old maker (third pose of the same silhouette), the
cocoon-mountain.

---

## Everything new that must be drawn

- **Characters:** Sorrel (a Vesper skin variant), Dun (a burrback variant), the caterpillar, the vixen and cubs (the
  frozen Yako skin), the maker (one silhouette in three poses plus one hand asset, used three times). Tallow appears
  here only kneeling. No human is ever drawn with a face.
- **Sets:** the world from high (prologue, Night 4, ending; built once, run forwards and back), the orchard field, the
  lab, the cavern (the lab's painter), the street strip.
- **Systems:** one root painter (branching growth front, inner light, steam), cases (translucent pods with a
  silhouette), the dish shader (grain, warm, moth, frost, silk), the keyframed cinematic camera, dip to black.
- **Replaced to stay producible:** the deer herd became one stag whose antlers turn into root; waking crowds became
  one row of cases with one that doesn't open; the world's moths are instanced flecks, which we already draw.
