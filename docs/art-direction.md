# Art direction: the Grove

One scene, three screens wide (the demo level). The goal is that a screenshot or a
ten-second clip could sit next to Ori and the Blind Forest / Hollow Knight and not look out of place.
Everything is drawn in code (vector shapes, meshes, GLSL). No image assets.

## The place
An old-growth forest at blue hour, just after rain. Trunks wider than the screen, roots like bridges,
hanging moss, ferns, fat mushrooms, a still pool. Somewhere above the canopy a low warm sun or moon
breaks through in a few slanted shafts. Small plants glow.

## Value and colour (the thing that makes it read)
- **Depth by atmosphere.** Farther = paler, bluer, lower contrast, softer edges. Nearer = darker, more
  saturated, sharper. The foreground (in front of the player) is almost black, out of focus, and moves
  fastest. Never break this ordering.
- **Shadow family:** deep teal to indigo (`#061a24`, `#0b2a33`, `#12233f`). Never pure black, never grey.
- **Foliage family:** emerald to moss (`#0f4a3c`, `#1f7a55`, `#6fbf6a`), yellowing where light hits.
- **Light:** one warm key, peach-gold (`#ffd9a0`, `#ffb36b`) in shafts and rims, against cool fill.
- **Bioluminescence:** cyan-white (`#9ff3ff`) and a rare magenta-violet accent (`#c58bff`). Small, sparse,
  blooming. These are the brightest things after the character.
- The player's path must always read: platform tops carry a lit moss rim and are the highest local
  contrast in the playfield. Background shapes never look like platforms.

## Layers, back to front
1. Sky glow: vertical gradient with a soft warm bloom where the light enters.
2. Far forest (3+ layers): trunk silhouettes fading into fog, each with its own parallax factor.
3. Mid forest: big detailed trunks, roots, vines, hanging moss, fern masses. Fog sheets between layers.
4. Playfield: terrain, moss caps, grass, flowers, mushrooms, glow plants, the pool.
5. Character.
6. Foreground: dark, blurred leaves/branches/grass at the frame edges and bottom, strong parallax.
7. Air: god rays, drifting motes/pollen, fireflies, falling leaves, mist at ground level.
8. Post: bloom, colour grade, soft vignette, very light grain. No pixelation, no hard outlines.

## Shape language
Organic, tapered, hand-cut. Curves and asymmetric clumps; nothing tiled, nothing rectangular, no
visible repetition. Collision is boxes; the picture must never show it. Every edge is a painted
silhouette, with a lighter inner gradient and a rim on the light side.

## Motion
Nothing is ever fully still. Wind travels across the scene as a wave (grass, ferns, vines, hanging moss
and canopy all sway with phase offset by x). Plants bend when the character passes and spring back.
Glow plants brighten near the character. Motes drift, shafts shimmer slowly, water ripples and
reflects. Camera is soft: look-ahead, gentle vertical dead zone, no snapping.

## The character: Wing (chosen 2026-10-13)
The owner picked **Wing, the moth** (`src/render/character/vesper/`, memory/character-vesper.md) from
four playable candidates. All character work goes into her; the other candidate skins were deleted on 2026-10-17 (git history
has them). What follows is the history of
the brief; the tone and "more from the owner" paragraphs still apply to her.

### History: the first brief (Ember)
Original design, not Ori (white spirit) and not the Knight (horned mask). A small forest spirit about
1.3 tiles tall.

**Tone (owner, 2026-10-13): serious, not a jester.** Quiet, solemn, a little melancholy and noble,
like Ori or the Knight: a lone wanderer in a vast old place. Nothing may read as a jester, clown, elf
or mascot: no floppy two-point "hat" ears, no ruff/collar of leaf points, no bell-like bobble on a
string, no bouncy or cheeky acting. Simple, elegant, restrained: few shapes, long calm lines, a muted
palette with one light. Where the list below conflicts with this, the tone wins.

**More from the owner (2026-10-13):** serious does not mean sad or old. The hero must be **cool**, have
**an aura like Ori** (it carries or is partly made of light: glowing eyes, light spilling onto the
world, light left behind in motion), look **agile** (light build, free legs, springy athletic poses:
it sprints, leaps, dashes, wall-jumps), and have **real arms with gripping hands** to grab ledges and
hold weapons. **Movement is effortless and relaxed, like Ori's**: a light, floaty, gliding run that
never looks strained or determined, loose arms, calm level head, everything overlapping and easing;
nothing robotic (no joints moving as plain sines in lockstep). The final design is Wing (above); the
feature list below is the superseded first design.
- Dark indigo-plum body, slim, slightly oversized head, short limbs, readable hands and feet.
- A pale, soft mask-like face with two large warm amber glowing eyes. No mouth.
- Two long leaf-shaped ears that trail and react to motion.
- A cloak of layered leaves over the shoulders that flares on jumps and settles on landing.
- A long tail ending in a small ember: a warm glowing bulb that is a real light source. It lights nearby
  ground and plants and leaves a faint trail when moving fast.
- Silhouette test: the pose must read as a solid black shape at 64 px tall.

### Animation bar
Fluid above all. Driven by sim state plus springs, never by popping between poses.
- Idle: breathing, weight shifts, ear flicks, glances, tail sway.
- Run: a real cycle with contact/passing/up poses, foot IK on the ground, body lean with acceleration,
  ears and tail streaming. Skid and turn-around with overshoot.
- Jump: anticipation squash, stretch on rise, tuck at apex, reach on fall, squash and recover on land
  scaled by impact speed. Cloak and tail lag and overshoot.
- Every secondary part (ears, cloak, tail) is simulated (verlet or spring chains) and follows through.
- Smooth shading: soft gradients, a rim from the key light, a glow halo. Anti-aliased at any zoom.

## The world: the moths' road (2026-10-17)
The old "overgrown ruin" world went with the dropped story. The new story (`memory/story.md`) is a night
migration through wild country, and every region is natural, so the forest kit carries the whole game.
- **Keep the rendering:** painterly, layered atmospheric depth, dark and subtle, small precious lights.
- **Moth scale, at night.** The world is seen at Wing's size: ferns are trees, moss is a meadow, a mushroom is a building.
  The game lives at dusk and night, under moonlight.
- **Two kinds of light, always told apart.** The **real moon** is cool, pale and high, the one constant in the sky. The
  **false lights** (the firefly's lamps) are warm, close, low and hungry: they pull. Swarms of moths circling a lamp
  are the signature image. The dark between lights is safety.
- **The mountain under the moon** is seen at vistas (canopy gaps, clifftops, each time a lamp goes out), and it gets
  closer region by region.
- **The road, in order:** the wood (the Grove), the valley of lamps, the marsh, the pass, and the cave. The cave is the
  brightest place in the world, lit by the firefly's whole collection, until the end.
- **No human buildings and no cyberpunk.** If people appear at all, it's at the far edge of the frame.
