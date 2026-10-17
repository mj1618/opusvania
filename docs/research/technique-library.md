# Technique library: what to take from other games

Research, 2026-10-17. Twenty-three games outside the Ori / Hollow Knight / Silksong / Nine Sols set, studied for
techniques we can build with code-drawn art (Pixi meshes, GLSL, procedural animation, our deterministic sim). Design
lessons by problem are already in `memory/reference-games.md`. This file is about **how things are made to look and
feel**, and how we would make each one.

**Frames.** Every frame cited is in `shots/reference/extra/` (gitignored, so it is local only; `sources.txt` there lists the
URLs). `rain-world/05` means `shots/reference/extra/rain-world/05.jpg`, a Steam store screenshot. `neva/t1-05` is
frame 5 of 9 pulled from `neva/trailer-1.mp4`. Numbers in square brackets point to the sources at the end. Anything
without a source comes from looking at the frames, and is labelled as our reading.

---

## Per game

### Rain World: bodies as chains, rooms as depth slices
- **Bodies are points joined by fixed distances, with a "paper doll" of parts drawn on top** [1][2]. The slugcat is two
  round body chunks held at a fixed distance, so it can tumble and roll. Its limbs and tail are animated by code from its
  inputs [1]. *Build:* we already have verlet chains (`vesper/chain.ts`). The cocoon, the silk it hangs from, Tatter's torn
  wing and every creature in `creatures.md`'s "chain" and "strands" families are point chains with distance constraints.
  Render draws a tapered mesh along the points. The rule we take from Rain World: animate the *constraints and targets*,
  never the drawing.
- **Limbs search for grip.** Each leg picks a foothold near where the body is going and steps to it when it falls too far
  behind. There are no gait cycles [3] (`rain-world/02` shows the vulture's wing fingers, `rain-world/t2-05` the lizard).
  *Build:* generalise `enemies/gait.ts` into "reach for the nearest surface point within r, step when past threshold". It
  stays stateless from sim state plus springs.
- **Creatures have needs, not patrols** [2]: food, a den and fear. They keep living off screen, and level shape steers
  them. *Build:* for scene 1, ambient moths and beetles get one need each (rest on the bark, flee Wing, go home). It is cheap
  and makes the branch feel inhabited.
- **Depth as stacked slices fading into one fog colour.** The near walls are almost black and every slice behind them is
  paler and closer to the room's single fog hue (`rain-world/01`, `/05`, `/t1-01`, `/t2-05`). Modding notes say rooms are
  baked from about 30 depth layers and coloured at runtime by a small palette image, so a palette swap re-moods a room
  (community knowledge, unverified). *Build:* our bake pipeline already stores depth (the `ATM` objects). A per-room palette
  texture indexed by (depth, lit) in the atmosphere shader would give us the same one-uniform re-mood that
  `look-and-sound.md` §1.1 wants for "the night clearing".
- **Height fog on tall forms.** Pillars get darker at the top and dissolve into fog at the bottom (`rain-world/t2-05`). This
  reads as depth below. *Build:* in the far/mid shader, mix toward the fog colour by `smoothstep` on world y. The branch
  scene needs it: the drop below the branch should fade to blue-black fog, never end in a floor.

### Celeste: forgiveness, and teaching with the first room
We already have coyote time (6 f), jump buffer (6 f), apex hang (half gravity while held) and corner correction
(`src/sim/tuning.ts`), all from Thorson's list [4]. What else to take:
- **Momentum from moving ground is kept for a few frames after it stops** [4]. *Build:* if a branch section sways or
  bounces under her, add its velocity to the jump and keep it for about 4 frames. That makes a swaying twig a toy, not a
  hazard.
- **Generous range on the hard verbs.** A wall jump works 2 px from the wall, and a super wall jump 5 px [4]. *Build:*
  when the wall jump arrives, give it a 3–4 px range, and give pogo a generous hitbox below her.
- **Wind made visible as streaks** (`celeste/09`). Thin horizontal lines move at the wind's speed, so the player reads
  its direction and strength before it pushes them. *Build:* a stateless streak layer in `air` driven by the same
  `wind()` as the grass. Scene 1 uses it to show the swarm's air current.
- **A screen-shake budget.** Shake is rare and short, saved for impacts. The talk everyone cites for shake as a tuned
  quantity is Nijman's "The Art of Screenshake" [21]. *Build:* one camera trauma value, `trauma²` → offset, decaying in
  render time. The hatch gets one small shake and nothing else in scene 1 does.
- **Assist mode as a setting, not a difficulty**: game speed, invincibility and extra air moves, offered without
  judgement. *Build:* our sim has a fixed step, so a slower game speed is just fewer sim steps per second. It costs almost
  nothing and is worth a slot in the options menu later.
- **Physics as integer actors and solids** [5]. That is the same model as ours, which confirms it.

### Inside: animation weight, light that tells you where to go
- **Bounce light, local volumes and dither** [6]. Every lit area has a soft volume around the light, and banding is
  killed with dither (`inside/05`, `/09`, `/t1-04`). *Build:* we have shafts. Add a per-light additive cone or ellipse
  volume in post, and add blue-noise dither (±0.5/255) at the end of the grade. Our dark gradients will band without it.
- **Layered fog planes in rain** (`inside/04`, `/t1-01`). A crop field is three or four flat silhouettes, each one step
  paler. *Build:* exactly our far layers, but with fewer of them and bigger value steps between them.
- **The hero is the only colour** (red shirt). *Build:* Wing's gold eyes are our version. Keep everything near her
  desaturated, so the eyes are the brightest saturated pixels on screen after the lamps.
- **Breathing as the only voice.** In Limbo the breathing blends from calm to panic in real time, and the boy's chest rise
  is driven by the breathing audio data [8]. Inside ties breath to run speed [8]. *Build:* drive Wing's idle chest/thorax
  scale and a muted breath sound from one `effort` value (recent speed, landings, hatching). Her first breath after
  the hatch is the birth beat.
- **Physical acting built from animation and soft-body physics** [7]. *Build:* her hatch pose is a few springs settling
  under gravity, never a canned clip.

### Limbo: silhouette and lens
- **Pure value design.** Black near, grey far, white light, and nothing else (`limbo/01`, `/04`, `/09`). If a frame reads in
  Limbo's palette it will read in ours. *Build:* add a "Limbo check" to `npm run shots`: a luma-only version of each shot
  with the hero's mask, to measure figure-to-ground contrast.
- **Depth of field by layer.** The near foreground is huge, black and blurred, and far layers are soft too (`limbo/04`,
  `/10`). *Build:* we blur the foreground already. Blur the farthest layer at bake time too, and keep the playfield sharp.
- **A heavy vignette and film grain.** They make every frame feel like an old lens. *Build:* our post has both. Limbo
  shows they can be much stronger in dark scenes than we would dare in bright ones.
- **The spider: a creature drawn almost only as legs** (`limbo/01`, `/05`). *Build:* a scene-2 predator can be drawn as
  four jointed lines and a dark mass off screen. That is the cheapest scary thing there is.

### Gris: colour as progress, watercolour edges
- **Colour unlocked chapter by chapter**, starting grey, as the core mechanic [9] (`gris/10` grey, then `/01`, `/04`,
  `/09`). *Build:* `look-and-sound.md`'s "night clearing" uniform. Gris shows it works even as the main reward.
- **Watercolour textures through shaders.** They tried scanned pencil strokes, paper texture and watercolour stains,
  layered in shaders [9]. Skies are several layers of wet-edged wash (`gris/02`, `/07`). *Build:* a domain-warped noise
  edge mask (edge darkening, "pooling") on our big background fills. Use it lightly; we want a painterly hint, not Gris.
- **One huge circle as the composition** (`gris/01`, `gris/t1-07`): a sun or moon disc bigger than the hero by 50x,
  with a dark form cutting it. See Neva below.

### Neva: flat shapes, one fog hue per scene, the moon as a stage
- **A flat silhouette per layer, tinted by one strong fog hue** (`neva/01` green, `/06` mauve, `/05` blue, `/07` pink).
  Each scene picks one hue and every layer is a value step of it. Detail lives only at edges (flower dots, leaf tips). *Build:*
  this is the cheapest look to reach with code-drawn art, and the one closest to ours. Push our far layers toward flat
  fills with edge detail, and let the room's moon tint do the colour work.
- **The moon as backlight for a giant silhouette** (`neva/11`). The hero is tiny on a flat bar, and a huge dark shape
  crosses a glowing moon with a soft halo. *Build:* a moon disc plus a two-radius halo (additive), placed so the swarm
  crosses it at the scene-1 "look up" beat.
- **Cave mouths framing night sky** (`neva/12`). This is the cave region's vista template.
- **Mirror reflections in still water** (`neva/13`, `neva/t1-06`). *Build:* the existing pool reflection, used as a
  composition tool at vistas.
- **The game is hand-made on purpose.** Visible brush marks [10] tell the player it was made by people. Our grain and
  edge noise do the same job.
- **They chose a wolf over a bird** because players bond with it, even though a bird was easier to build [10]. That
  matters for Tatter: she must be one of Wing's own kind, readable at once.

### Journey: one goal on the horizon, a flock, cloth and glitter
- **The goal is always in view.** The mountain with its light beam sits behind every vista (`journey/03`, `/07`). *Build:*
  `look-and-sound.md`'s vista painter. In scene 1, the moon and the swarm's direction play that role.
- **Flying cloth creatures as a loose ribbon** (`journey/03`, `/06`). The flock is a stream of small dark shapes with
  gaps. It is not a dense blob. *Build:* see "moth river" in the scene-1 list.
- **Sparkle on sand from a specular glitter term**, plus "non-physical" lighting chosen for looks [11]. *Build:* a
  hash-based glint in the moss shader, lit by the moon's direction, gives moon-dew on the branch.
- **The scarf is energy** (it grows, glows and lets you fly). Shared cloth carries both story and ability [11]. *Build:*
  Wing's antennae or wing-edge glow can show her flight energy later (glide, Moonflight), so there's no HUD bar.
- **The emotional arc was designed first and the music was prototyped first** [11]. Our order is the same: beats table,
  then pictures.

### ABZÛ: thousands of fish
- **Each fish is a static mesh bent in the vertex shader** with a few cosine motions: side-to-side, pivot, a travelling
  wave and a twist. Thousands are instanced on the GPU with no bones [12]. *Build:* exactly the moth plan in
  `look-and-sound.md` §1.4. One quad (or a 6-vertex wing pair) per moth, flap = `sin(t*f + id)` on the wing vertices,
  path from a pure function.
- **Schools have shapes**: a ball (`abzu/03`), a tunnel around the camera (`abzu/t1-07`), a river (`abzu/07`). *Build:*
  give the swarm a few named formations (river, ball around a lamp, column into the cave) and blend between them.

### Flower and Sky: wind, trails, light you leave behind
Sky's art and lighting talks [16] treat light as both the look and the theme.
- **Grass as a field the wind writes on.** Petals and the player's passage make visible waves (`flower/02`, `/05`), with
  hundreds of thousands of blades [23]. *Build:* our bend field plus `wind()`. Add a gust that travels as a visible band.
- **Light left in your wake.** At night, grass lights up where the petal stream passes and fades slowly (`flower/03`).
  Sky leaves light trails on sand (`sky/t1-07`). *Build:* render keeps a ring buffer of Wing's last ~2 s of positions
  (render state, not sim). The plant and moss shaders read it as up to 16 points and add a decaying glow. Glow caps already
  brighten near her; this makes them *remember* her.
- **A swarm of paper-white flyers around a figure** (`sky/01`). *Build:* the moth ball formation.
- **Warm light carried into the dark is the safe pocket** (`sky/t1-04`). Red reserved for the dark creatures
  (`sky/t1-08`). That is our two-light rule reversed, which is a warning: Sky's warm means safe. Players coming from it
  will read warm lamps as friendly, so our lamps need the pull, the orbiting swarm and the husks to say otherwise.

### Planet of Lana: layered parallax and near-black framing
- **Foreground masses in near-black navy frame every shot** (`planet-of-lana/01`, `/08`, `/11`), so the eye goes to the
  lit middle. It is a hand-painted look, with hand-painted lighting [17]. *Build:* we have this. Lana shows how much
  frame area the foreground can take (often 30–40%).
- **Light shafts inside a dark forest with a lit clearing** (`planet-of-lana/03`, `/t1-07`): one shaft, one lit floor
  patch, the hero in it. *Build:* the moon patch in `look-and-sound.md` is exactly this. It should be a floor pool
  plus one shaft, never a general lift.
- **Creatures in the dark shown only by glowing eyes and a rim** (`planet-of-lana/t1-08`). That is the predator rule from
  §1.3 of look-and-sound.
- **Searchlight cones as readable danger** (`planet-of-lana/t1-06`). A hard-edged cone with a bright source shows where
  the danger is. *Build:* a lamp's light ending at its pull radius uses the same idea.
- **A big planet/moon arc in the sky** (`planet-of-lana/01`, `/05`): the scale cue at vistas.

### Ender Lilies and Ender Magnolia: a grey world with one reserved hue
- **A desaturated world where saturated red is reserved for blight and threat** (`ender-lilies/06`, `/t1-05`, `/t1-06`).
  The heroine is white, her spirits are pale and the world is grey-brown. It's the same rule as our warm-for-lamps, and
  it proves a whole metroidvania can hold it. Okabe says they leaned on 2D anime art to stand apart from Hollow Knight [19].
- **Glowing cyan butterflies at the rest point** (`ender-lilies/02`). Flat translucent wing shapes with bright edges on a
  dark purple ground. *Build:* our resting moths in a moon patch. Brighten the wing-edge alpha, not the fill.
- **Snow-capped rocks as lit tops with god rays** (`ender-magnolia/05`). White caps make every walkable top read. It's
  our lit-moss-rim rule in another material, and a good model for the pass region's frost.
- **Text over ink-wash blots** for the intro (`ender-lilies/t1-02`). We have no text, but the ink-wash transition is a nice
  fade between rooms.

### Child of Light: a painting you walk in, a light companion
- **Painted art placed unedited**, worked out by trial and error toward watercolour (GDC 2014 [15]). For us the lesson is
  the *foreground*: black cut-paper silhouettes along the frame bottom, sharp and decorative (`child-of-light/02`, `/06`).
- **A glowing light companion (Igniculus)** lights up and slows things (`child-of-light/07`). *Build:* a possible later
  verb for freed moths: a few follow Wing and light the dark near her.
- **Hair as a long flowing ribbon** (`child-of-light/04`). Same as Wing's cape strands.

### Hyper Light Drifter: dash and palette
- **A dash so fast it reads as a blink, with afterimages** (`hyper-light-drifter/04`). Dash chains are the core of combat
  [20]. *Build:* when Wing gets the dash, draw 3–4 ghost copies of her silhouette at the previous frames' poses, in her
  own pale silver. Render keeps the last poses.
- **Complementary palettes per region** (magenta vs teal: `hyper-light-drifter/01`, `/02`). Every region keeps one key
  pair. That supports the per-region palette records in `look-and-sound.md` §2.
- **Light shafts in a top-down view** (`hyper-light-drifter/07`). Soft diagonal bands work at any camera.

### Animal Well: a few small things that add up
- **Lights are defined in front layers and light the layers behind; flat art gets hand-drawn normal maps; background
  shapes are raymarched SDFs; a dedicated layer runs a real fluid sim for water and smoke** [13] (`animal-well/02`,
  `/11`). *Build:* we can't hand-paint normals, but our relief bake (`pf-bake.ts`) is the same idea. A small fluid sim
  layer is in reach later (a 128×72 stable-fluids texture in render) for mist that parts around Wing. It is
  render-only, so determinism is safe.
- **Bioluminescence as many tiny points on near-black** (`animal-well/10`). It looks like hanging glowworm threads.
  *Build:* cheap and lovely under the branch: vertical silk threads with a few glowing beads, swaying with `wind()`.

### Little Nightmares: scale and the doll's-house camera
- **A tiny hero in a huge room** (`little-nightmares/07`, `/10`). Everything is sized for something bigger. It grew out
  of a "dollhouse" tech demo [18], and its unease comes from light against dark [18]. *Build:* moth scale is our version.
  Keep a few objects at real-world size in every shot (a leaf as big as a door, a raindrop as big as her head).
- **One hanging bulb as the only light** (`little-nightmares/03`, `/09`). Like a lamp, it swings, and its pool moves.

### Blasphemous: sunset silhouettes
- **Pixel art against a big soft gradient sky**, with the platforms as flat dark silhouettes (`blasphemous/06`, `/11`).
  The two-value read is stronger than any detail. *Build:* a reminder that the branch should, at some moments, be pure
  silhouette against the moon sky.
- **Huge statues fading into pale fog** for scale (`blasphemous/14`).

### Dead Cells: moon behind a bridge, readable combat
- **A full moon behind a bridge, with rim-lit edges** (`dead-cells/03`) and a fog band between layers (`dead-cells/05`).
- **Animation made in 3D and rendered to small pixel art** so it can be changed without redrawing [14]. The lesson for
  us: our rig is the source of truth, and everything is re-renderable. Keep it that way.

### Owlboy: flight
- **Flight came from asking "what if a tap made you rise?"** after Mario 3's raccoon tail and Kid Icarus [22]. Critics
  split: some found it precise, and others found it weightless, with nothing stopping you flying forever (`owlboy/01`,
  `/05`). *Build:* Moonflight needs a cost or a pull (in our design, light drains it), plus mass: banking, a lag in the
  wing strands, a sag between beats.

### Tunic, Spiritfarer, Alba
- **Tunic: dappled light.** Moving leaf-shadow cookies on the ground (`tunic/06`), and a tilt-shift blur. *Build:* a
  scrolling, wind-warped noise mask multiplied into the moon light on the branch top. A lit path that shimmers like leaf
  shade is our "lit moss rim" in motion. Tunic's in-world manual pages (`tunic/08`) are knowledge as progression.
- **Spiritfarer: the hug** (`spiritfarer/03`). Its tenderness comes from two figures leaning into each other, and from a
  reflection on still red water. That's a staging model for Wing and Tatter's last moment.
- **Alba: wildlife that reacts** (`alba/05`). Birds flush as you approach. *Build:* ambient moths and beetles on the
  branch startle and scatter (a flee need, as in Rain World). It's cheap life for scene 1.

---

## Grouped by what we need

### (a) Scene 1: the moonlit branch, the hatching, the swarm, the run
1. **The moth river** (ABZÛ, Journey, Sky): instanced quads with a vertex-shader flap. Each moth's position is a pure
   function of (id, clock) along a spline river, with ±noise, density bands and gaps. It has a few named formations
   (river, ball, column) and goes to dots in the far layers. One ribbon crosses the moon. Frames: `abzu/03`, `abzu/t1-07`,
   `journey/03`, `sky/01`.
2. **Moon as backlight stage** (Neva, Dead Cells, Limbo): a large disc and a two-radius halo behind the branch. The branch,
   Tatter and the cocoons go to silhouette with a thin cool rim where they cross it. Frames: `neva/11`, `dead-cells/03`.
3. **One-hue depth fog with big value steps, a black blurred foreground and height fog into the drop** (Neva, Limbo,
   Rain World, Planet of Lana). Frames: `neva/06`, `limbo/04`, `rain-world/t2-05`, `planet-of-lana/08`.
4. **Wind you can see** (Celeste, Flower): streaks and a travelling gust band from the one `wind()`, which also bends the
   moss, shakes the cocoons and bends the swarm's path. Frames: `celeste/09`, `flower/02`.
5. **Light that remembers her** (Flower, Sky): a ring buffer of her recent positions makes glow caps and moss dew light
   up and fade over ~2 s. Frames: `flower/03`, `sky/t1-07`.
6. **Chains for the cocoon, the silk and Tatter's wing** (Rain World): the cocoon hangs on a 4–6 point verlet thread. Each
   jump press is an impulse. The break-out is a constraint snapping, and husk flakes are particles with drag. Tatter's
   torn wing is a chain with a missing segment that flutters wrong. Frames: `rain-world/02`.
7. **Dappled moonlight on the path** (Tunic, Planet of Lana): a wind-warped leaf-shadow mask on the branch top, so the
   lit rim shimmers. Frames: `tunic/06`, `planet-of-lana/03`.
8. **The first breath** (Inside, Limbo): one `effort` value drives her chest scale, a breath sound (muted) and idle sway.
   It peaks at the hatch and settles as she stands. Frames: `inside/04` (the mood), `limbo/09`.

Also for scene 1: a single shake at the hatch (Celeste), searchlight-style clarity for the far warm afterglow
(keep it a dim band on the horizon, `blasphemous/11`), and wildlife on the branch that flushes (Alba, Rain World).

### (b) Movement feel
- Keep Celeste's forgiveness, which is in already. Add lift momentum from swaying twigs, generous wall-jump and pogo
  ranges, an assist-mode game-speed slider later, and a single trauma value for shake (Celeste, Vlambeer [4][21]).
- The dash reads as a blink, with afterimages (Hyper Light Drifter).
- Flight needs mass and a cost (Owlboy's lesson). Moonflight: banking, strand lag, sag between beats, drain in light.
- Weight in idle and landings comes from breath and springs, never clips (Inside).

### (c) Creatures
- Bodies as chains of points with distance constraints, parts drawn on top, and limbs that reach for grip (Rain World).
- Needs, not patrols: rest, flee, go home (Rain World, Alba).
- Fear from economy: the Limbo spider is legs and a shadow, and Planet of Lana's monster is eyes and a rim. It is cheaper
  and scarier than a full body.
- Crowds as one instanced mesh with formations (ABZÛ). That covers the bat colony, freed moths and lamp swarms.

### (d) Light and atmosphere
- One fog hue per room, with depth as value steps (Neva, Rain World's palette idea).
- Height fog on tall forms; a black, blurred foreground; far layers blurred at bake time (Rain World, Limbo, Lana).
- Local light volumes plus blue-noise dither so our dark gradients don't band (Inside).
- A reserved hue for the false light (Ender Lilies proves it holds across a whole game). Watch Sky's opposite convention.
- Dappled cookies, glitter dew, and light that remembers (Tunic, Journey, Flower).
- Later: a small render-only fluid layer for mist that parts around her (Animal Well).

### (e) Wordless storytelling
- A goal always on the horizon (Journey's mountain, our moon and the swarm's direction).
- Colour as progress, done by one uniform (Gris).
- The relationship is a bond players feel at once: the wolf over the bird (Neva). Tatter must read as her kind.
- Breathing is the voice (Inside, Limbo).
- Staging at scale: a tiny figure under a huge moon (Neva, Little Nightmares). Two figures leaning together, mirrored in
  water (Spiritfarer).

---

## Sources
1. Unity blog, "Exploring procedural design in Rain World": https://unity.com/en/blog/exploring-procedural-design-rain-world
2. Game Developer, "Crafting the complex, chaotic ecosystem of Rain World": https://www.gamedeveloper.com/design/crafting-the-complex-chaotic-ecosystem-of-i-rain-world-i-
3. GDC 2016 Animation Bootcamp, "The Rain World Animation Process" (Jakobsson, Therrien), listed at
   https://www.gameanim.com/category/learn/presentations/page/7/
4. Maddy Thorson's game-feel thread (March 2020), summarised by Gigazine:
   https://gigazine.net/gsc_news/en/20200317-celeste-action-feel-things and GameSpot:
   https://www.gamespot.com/articles/celeste-dev-explains-how-they-made-their-game-feel/1100-6474775/
5. Maddy Thorson, "Celeste & TowerFall Physics": https://maddymakesgames.com/articles/celeste_and_towerfall_physics
6. GDC 2016, "Low Complexity, High Fidelity: INSIDE Rendering" (Gjøl, Svendsen): https://gdcvault.com/play/1023002/Low-Complexity-High-Fidelity-INSIDE
7. GDC 2017, the INSIDE "huddle" talk (soft bodies, procedural animation): https://gdconf.com/news/gdc-2017-youll-see-insides-final-surprise-made
8. MCV, Martin Stig Andersen on Limbo's breathing system: https://mcvuk.com/?p=68239 ; INSIDE audio and breathing:
   https://www.thesoundarchitect.co.uk/inside-game-audio-review/
9. MCV, "50 shades of Gris": https://www.mcvuk.com/development/50-shades-of-gris-how-nomada-studio-created-a-game-that-evolves-visually-not-only-mechanically
10. Audiokinetic, "The sounds of Neva": https://audiokinetic.com/ko/blog/the-sounds-of-neva ; MobileSyrup, Adrián Cuevas
    interview: https://mobilesyrup.com/2024/12/20/neva-nomada-studio-adrian-cuevas-interview/
11. GDC 2013, "Sand Rendering in Journey" (John Edwards): https://gdcvault.com/play/1017742/Sand-Rendering-in ; Alan
    Zucconi's breakdown: https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/ ; GDC 2013 "Designing Journey":
    https://gdcvault.com/play/1017700/Designing
12. Godot docs, "Animating thousands of fish" (the ABZÛ technique): https://docs.godotengine.org/en/3.5/tutorials/performance/vertex_animation/animating_thousands_of_fish.html
13. PlayStation Blog, how Animal Well renders: https://blog.playstation.com/?p=367113
14. 80.lv, Dead Cells character art pipeline: https://80.lv/articles/case-study-dead-cells-character-art-pipeline/
15. GDC 2014, "The Art of Child of Light" (Plourde): https://gamedeveloper.com/art/video-discovering-the-art-direction-for-i-child-of-light-i-
16. GDC 2020, "Art of Sky: Children of the Light": https://gdcvault.com/play/1026812/Art-of-Sky-Children-of ; GDC 2026,
    dynamic environment lighting in Sky: https://gamedev.net/news/994-dynamic-environment-lighting-in-sky-children-of-the-light-gdcrewind-gdc2026/
17. Film Stories, Planet of Lana preview (hybrid 3D and sprites, hand-painted lighting): https://filmstories.co.uk/features/planet-of-lana-2023s-prettiest-sci-fi-platformer/
18. Unreal Engine interview, Little Nightmares II: https://www.unrealengine.com/en-US/developer-interviews/how-little-nightmares-ii-plumbs-the-depths-of-adolescent-angst ;
    Bandai Namco, "From big dreams to Little Nightmares": https://en.bandainamcoent.eu/news/big-dreams-little-nightmares
19. AUTOMATON, Ender Lilies and Ender Magnolia's director: https://automaton-media.com/en/news/ender-lilies-and-ender-magnolia-were-inspired-by-the-director-desire-for-a-new-vanillaware-game/
20. Game Developer, "Road to the IGF: Hyper Light Drifter": https://gamedeveloper.com/design/road-to-the-igf-heart-machine-s-i-hyper-light-drifter-i-
21. Jan Willem Nijman, "The Art of Screenshake" (2013), listed at https://kenney.nl/learn/must-see-videos-for-indie-developers
22. Owlboy, D-Pad Studio interview: https://alternativemagazineonline.co.uk/2017/12/05/interview-in-conversation-with-d-pad-studio-creators-of-owlboy/
23. Flower (blade counts): https://en.wikipedia.org/wiki/Flower_(video_game)
