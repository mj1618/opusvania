# The Canopy, review round 9 (2026-10-31)

Reviewer brief: judge the Canopy v9 / v9b (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`) against
the first areas of Hollow Knight, Silksong, Ori and Nine Sols. It covers 6ffd96e..6cbf4de and the deployed snapshot
0543745 (canopy-play, the same as live). Say what changed since round 8 (`canopy-r8.md`), write the round-10 spec, and
step back once: after nine rounds, what is the biggest thing between this and the references?

Sources:
- the docs: `first-area.md` (v9, v9b and both weak lists), `memory/canopy.md`, `memory/canopy-render.md`,
  `art-direction.md`, `memory/story.md`, the reference README and the four `EXTRACTED.md`, and Matt's notes (density
  of choice, paths not places, "bland, monotone, over-signposted", "strengths: feel; weakness: levels");
- 49 wide shots with pickups at 16:9 over eight rooms (the hatch, hub, well, limbs, fork, Grove, tunnel and gap),
  from the release worktree on port 5214, with the mean luma and the near-black share (< 16) measured on each;
- `canopy-furniture.ts --check --rooms --route` on 0543745 (`round 9's bar met`) and v9's `metrics.ts` table;
- **Wing driven live on the GPU** (a scratch Playwright server over `window.__game`, `launch({gpu: true})`;
  headless playwright-cli ran at ~3 steps a second, so I switched), with prompts switched on
  (`__prompts.enabled = true`, the `?manual` page turns them off):
  - the hatch from the cocoon, walking it as a new player: the fall at the first gap, the jumps, the lip, the first
    fling with its prompt, traced frame by frame;
  - the hub west from the drop: the block, the map station at a run and at rest, the kin;
  - the well: its bottom, the landing, the gallery (the bramble pit, its burrback), the hollow, the ambush's arrival
    and fight (four tries), the up-left fling at the shard, the door to the limbs;
  - the fork's claw face into the Grove, the pit's wave (gates, zoom, arrivals);
  - the tunnel from the hub's door: the hump, a running jump into the pit, the glide past the hawker, the den's
    warning's two beats, a fade in it and where she came back.

What I could not do:
- Play with hands. Scripted presses find what breaks and what a moment shows, not whether it is fun.
- Win the hollow's ambush or the warning's second beat with my scripted fighter: it lost to braced burrbacks every
  time (it swings at the front). The bots and the builder have cleared both. I judge those fights by their frames
  and timings, not their difficulty.
- Fight the den's boss. Nobody has, in any round (see the step back).
- Hear it. Audio ships muted.

All coordinates are room-local px, as in the generator.

## The short version

**7 / 10.** Unchanged, and that is the finding. Round 9 did what round 8 asked, and did it well:
- **The well is no longer a sink.** Two climbing legs, then a walked gallery through the west wall with a burrback
  and a bramble pit. Climbing from the hub to the Grove is 18% of the path. The door is two plain jumps east of the
  stair: I went from the hollow's floor to `cn-limbs` in 180 frames, first try.
- **The frames lost their black slabs.** In my well shots, near-black is 32-51% of the frame (r8: 52-65%). The air is
  a cold teal, not a lightbox (mean luma 33-40).
- **The tunnel's crossing is a real glide problem.** A running jump falls in. The hawker notices her, tells for 30
  frames and strikes mid-glide.
- **The den's warning comes in two beats.** The second beat climbs out of the den's mouth.
- **Glints are down to 23.**

But a person still can't get through the first minute without help, and the gap to the references is no longer in
the numbers this loop measures:
- **The first lesson does not work** (#1). From a running jump off the hatch's lip, `wick-first` is in reach for **8
  frames**. The Lamp cap fades in on frame 5, reaches 0.67 alpha by frame 8, and is gone. Then the **glide** cap (Z
  with wings) shows over the fall, though she has no glide. A standing jump never reaches the lamp. A Lamp key held
  down before the window doesn't count. A new player who doesn't know the Lamp key gets a 67 ms hint, then a wrong
  one.
- **The area has no story in play** (the step back). Over the whole route, `lures().freed` stayed 0. Every lamp
  relights. The firefly never appears. The kin moves, but nothing happens between them. The boss has never been
  fought. Audio is muted. The game's whole idea (false lights trap the swarm, Wing frees it) isn't in its first area.
- **The new hollows read as windows and cabinets** (#5). The well's walls, the hub's under-floor and its floating
  block are panels framed by chains of knobs: picture frames, aquarium glass, a planter.
- **The den's warning is a scuffle on a bench** (#6). Its trio arrives 25-35 px tall in umber, on an arched knuckle at
  0.85 zoom. If she fades there, she comes back west of the pit (x 5,752), behind the glide and the hawker.

The gate is still the same: **Matt plays from the hatch to the Grove.** Fix #1 first. Without it, his first minute is
the 8-frame window.

What works, and should be kept:
- **The gallery.** It is the best new place in the area: teal, lit from above, a burrback on a root terrace, a bramble
  pit a run-jump clears with room to spare, and an arch. It's a path with things on it, not a shaft.
- **The well's door.** Moonlight pours in from the top right of the hollow's frame. Two jumps get her out. It reads
  without a sign.
- **The tunnel's glide and its hawker.** A jump falls short, a glide crosses, and the hawker is a mid-air threat with
  a fair tell. This is the area's first moment that combines verbs.
- **The Grove's pit.** Still the area's best set piece. Gates shut, the camera pulls to 0.81-0.84, the pair walks in
  from 1,000 px, and two warm lamps hang with their moths.
- **The hatch's walk.** Calm, moonlit, the swarm over the moon, a fall that catches her kindly. The first minute's
  mood is right.
- **Teal well, umber den.** The two grey looks of r8 now have a hue.

## Since round 8, fix by fix

| r8 # | fix | v9 / v9b | status |
|---|---|---|---|
| 1 | the well's door and climb | two legs + the gallery; leg 2's strip moved to the gallery's pit; a root step under the door; `door-notice` zone; the door lit; the shard behind the hollow lamp's fling | **done.** The door is the hollow's brightest gap and two plain jumps (driven). The shard: my up-left fling off `wick-hollow` (pressed 6 frames into reach) landed her on the floor at x 636, not the shelf. The fling probe finds it, but it's a narrow aim found only mid-fight. Bots: none reached the limbs, chasing that shelf. |
| 2 | less solid in frame | `sealDeep` carves mass > 256 px from air into sealed hollows; every wide stop ≤ 30% deep solid | **done by the numbers** (well median 4%). It created #5: the hollows are drawn as framed recesses. |
| 3 | edges, not boxes | the wrap (faces, undersides, hanging clumps), the core 112-220 px in | **half.** Undersides hang beards and icicles (the well's ceilings read well). Long faces still bulge only ±24 px. The well's walls are columns of stacked discs, and the fork's face is beaded lime. |
| 4 | the second peak on the path | the warning as a two-beat arena, the hawker on the glide line, peaks along the route | **done in the sim** (route peaks: the Grove 11.5 a screen = 3.8×, the warning 9.0 = 3.0×). **On screen it's small** (#6). |
| 5 | glints | 51 → 23 | **done.** Still worth nothing: the trade is Matt's. |
| 6 | air and hue by look | shaft teal (air 46-70), den umber, `look:check` air ≤ 85 and chroma | **done.** The den is now one flat brown plane with darker ovals: hue, but no depth (#6). |
| 7 | the gap's chain as three | `wick-gap-3` moved, a hanging root, a buffered press | **done** (builder-driven). The root is dressed now. |
| 8 | every set piece framed | `fit` zones on the hollow and the warning; `wing-am` by the lamp | **done, barely visible.** The hollow's fit is 0.94-0.95, so the frame hardly changes. The warning is a set 0.85 over the mouth's corner. |
| 9 | a reason to stop in the hub | the map station, hung moth-stones | **done as a mechanism.** It opens the map only if she stands still on the patch. The map is a greybox overlay with room ids (`cn-hatch`, `cn-hub`) (#4). With no stones read, the crook is bare. |
| 10 | objects out | ridged Grovemother plates, rooted mounts, lichen smears, bracket fungi | **done.** The Grovemother reads as a trunk. New objects took the old ones' place: the hollows' knob frames and the warning's arched knuckle (#5, #6). |

## The numbers against the four references

`canopy-furniture.ts --check --rooms --route` on 0543745; the majors / minors / hidden / enemies rows from v9's
`metrics.ts` table (`first-area.md`). Silksong ×0.58 and Nine Sols ×0.8 where hero-scaled.

| measure | HK | Silksong | Ori | Nine Sols | Canopy v8 | **Canopy v9b** | read |
|---|---|---|---|---|---|---|---|
| air screens (hero) | 132 | 44 | 48 | 56 | 46.5 | **46.7** | Ori's size |
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | 0.55 | **0.59** | in range |
| things per box screen | 0.28 | 0.17 | 0.80 | 0.42 | 1.48 | **1.21** | still the busiest, 1.5× Ori |
| majors / minors | 17 / 4 | 8 / 41 | 23 / 11 | 16 / 13 | 23 / 51 | **23 / 23** | in range |
| hidden share | 0.35 | 0.22 | 0.18 | 0.26 | 0.27 | **0.30** | in range |
| room density mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.40 / 2.16 | 2.51 / 1.69 | 2.32 / 1.69 | **2.18 / 1.69** | Nine Sols' shape |
| spread (CV) | 1.10 | 0.96 | 0.59 | 1.08 | 0.89 | **0.83** | in range |
| quiet rooms | 16 / 48 | 9 / 34 | 2 / 17 | 7 / 39 | 5 / 27 | **5 / 27** | in range |
| busiest ÷ median | 8.9 | 5.4 | 2.6 | 7.7 | 5.8 | **5.3** | in range |
| hazard px per air screen (hero) | 340 | 877 | 328 | 374 | 228 | **228** | **under every reference** |
| hazard runs ≥ 640 (share) | 0.71 | 0.55 | 0.34 | 0.71 | 0.78 | **0.79** | in range |
| route: path screens / peaks (no glints) | | | | | | **37.4 / 3.8× and 3.0×** | two peaks |
| route: up ÷ across | | | 0.22 | | | **0.17 (up 9,790, down 14,464, across 55,984)** | horizontal, as fact 11 asks |
| saves | 7 | 7 | 2 | 5 | 8 | **8** | generous |

**The look** (my 49 frames, whole frame at 480 px wide, near-black = luma < 16):

| room | mean luma | near-black | r8 near-black | read |
|---|---|---|---|---|
| the hatch | 56-69 | 12-23% | 12-23% | the moonlit opening, unchanged |
| the gap | 45-61 | 18-36% | 17-35% | the root is dressed now |
| the limbs | 45-50 | 29-41% | - | |
| the fork | 38-60 | 21-50% | 21-53% | the face is a lime-beaded wall |
| the Grove | 33-51 | 36-48% | 37-50% | |
| the well | 33-40 | **32-51%** | **52-65%** | the round's clearest gain |
| the tunnel | 29-39 | 33-51% | 29-51% | umber now, but one flat plane |
| the hub | 32-57 | 25-65% | 26-65% | the under-floor hollow and the slab stops still 57-65% |

Silksong's compare tiles are 25-28% near-black, HK's 55% (r8). The well is now between them. The hub's slab stops
are not.

**What the numbers can no longer tell us.** Every bar the loop set is met: density, spread, peaks along the route,
climbing share, deep solid, air mean and chroma, glints. Since r6, the score has moved half a point per round while
the measures went green. The two biggest things I found this round (an 8-frame lesson and no story in play) are
invisible to every measure we have.

## What I played, and what it felt like

- **The hatch.** Three presses, and she's out. Walking right, she falls at the first gap (x 1,972): caught, and back
  on the limb in 50 frames. A running jump carries the gaps. At the lip (x 3,452), standing jumps from x 3,475 and
  3,546 never put `wick-first` (3,700 × 660, reach 240) in reach. A running jump does, at (3,582, 603), for **8
  frames** (f 1,281-1,288). Frame by frame:
  - f 1,285: the Lamp lesson starts (`flingAfter` 0.08 s), alpha 0.17;
  - f 1,288: alpha 0.67, last frame in reach;
  - f 1,289: lesson `glide`, alpha 0.83 → 1.0, and it stays the whole fall. `abilities().owned` is `[]`.

  The cap itself is right: a small "V" beside the flame with a breathing ring. It's shown for 4 frames, half-faded,
  and then replaced. A Lamp key held down from the jump's start doesn't fling (it wants a fresh press in the window).
  Once the press lands in the window, the fling is lovely: time stops, she aims, and lands on the far limb. The lamp
  relights 90 frames later. Into the hub at f 2,605.
- **The hub.** West from the drop: a 48 px block (a jump), the three-seed lock on the root bridge, then
  `patchMark:p-crossing` at a run. Nothing opens while she runs. Back, standing still: `patchRest` and `mapStation`
  fire together. The map fades in over the scene: two grey rooms with dev ids in the corners, her dot and three orange
  dots. It is the debug map. The kin stands by its lamp under a crook with nothing on it. The floating block above
  the clearing is a hollow framed in amber knobs: a picture frame in the sky. The moon is in about 16 of my 24 hatch, hub,
  fork and gap stops, the same disc each time.
- **The well's bottom.** Teal, tall, quiet, a lamp with moths. The east wall is a panel with a ruled top and knob
  rows: a cabinet. The west wall is a stack of discs. There's an amber-striped post by the east wall that reads as a
  placeholder.
- **The gallery.** West from the landing: a bramble pit (`thorn-w2`, 256 wide). Walking into it costs a hit.
  A run-jump from x 1,566 lands at 1,150, 64 px clear. The burrback dies in two combos, after one blow taken on the
  approach. A pleasant walk with a choice in it.
- **The hollow and the ambush.** Into the trigger at x 1,322: the flag, and 36 frames later both burrbacks show at
  x 363 / 417 and walk in over 1,000 px. The lampwing drops to its post by the lamp. The camera eases to 0.94: no
  visible change of frame. The beetles are ~40 px wide in a 1,920 frame. My fighter lost every time (it swings at a
  braced front, which the beetles block). On a fade, the wave rearms and walks in again from the far wall, as
  designed.
- **The shard.** Six frames into `wick-hollow`'s reach, an up-left fling put her on the floor at x 636, among the
  burrbacks. The probe has the aim that works. A person sees the shard's glow on the high shelf and has to find that
  aim mid-fight.
- **The door.** From x 1,750, three running jumps: (2,192, 880), (2,634, 688), then `cn-limbs`. Clean.
- **The fork into the Grove.** The face is one-wall kicks: eight taps up, in the Grove at f 9,431. Holding right
  through the Grove's drop: the flag, three `gateShut`s on one step, the zoom to 0.81, the pair from the far floor.
  Holding right into the arena walks her into `thorn-p1` four times (each return puts her back on the same floor
  facing the bed), then a fade, and the whole wave resets.
- **The tunnel.**
  - From the hub's door, a jump onto the hump, then a running jump into the pit: one thorn hit, back on the hump.
  - From the take-off, a jump held into a glide: the hawker sees her at 806 px, `curious` for 30 frames, and dives.
    It hits her at x 6,922, mid-glide. She keeps the glide and lands at 7,238 with a light lost.
  - The warning: `flagSet`, and 36 frames later both lampwings arrive from the roof. Beat 1 dies to plain up-cuts.
    Beat 2 (two juveniles and a burrback) climbs out of the den's mouth along the passage floor, up the step, onto
    the arena.
  - My fighter faded on the burrback, and she came back at **x 5,752, west of the pit**. Every retry of the warning
    is the walk, the hump, the glide and the hawker again.
- **The `juv-pile` turn loop** (r8's note) is still there: `enemyTurn:juv-pile` every 25 frames while she is 1,700 px
  away.

## The 10 most important problems, ranked

### 1. [render + level] The first fling's lesson lasts 8 frames, then teaches a move she doesn't have
**What.**
- `wick-first` is in reach only on a running jump's arc, for 8 frames (f 1,281-1,288). No standing jump from the lip
  reaches it.
- The Lamp cap needs `flingAfter` (0.08 s = 5 frames) of reach, then fades in. It peaks at 0.67 alpha on the last
  frame in reach and goes.
- The next frame, the **glide** lesson shows (cap Z with wings) for the rest of the fall. The glide lesson
  (`prompts.ts`, `want = 'glide'`) never checks that she owns the glide. In the hatch, `owned` is `[]`.
- A Lamp key held down before the window doesn't fling. It must be pressed fresh inside it.

**Why it matters.**
- This is the area's verb, required at minute one, with no way around it. Ori teaches Bash with time slowed and a
  prompt that stays up until it is used. HK's first prompts wait for you.
- Matt's run is the gate. As built, he either knows the key already or sees a hint for 67 ms, then a wrong hint, and
  falls.

**Fix.**
- **Render (prompts.ts):**
  - Every lesson checks the ability (`save.abilities` for glide, wall jump and dash); the fling's, that a flame is
    there.
  - The fling's cap shows on the **first frame** of reach (`flingAfter` 0 for the first lesson) at full alpha within
    4 frames.
  - It lingers 0.6 s after reach is lost, and comes back on every later approach until the first `fling`.
  - The glide lesson can't take over while the fling's is showing.
- **Level / sim:**
  - Widen the window. `wick-first` low enough, or its reach long enough, that a **standing** full jump from the lip's
    last 128 px is in reach for ≥ 20 frames, and a running jump's arc for ≥ 24.
  - Or, for the first fling only, a lesson hang: while `cn-first-fling` is unset and `wick-first` is in reach, the
    sim's gravity on her is 0.3× (deterministic, a tuning number) until the reach ends or Lamp is pressed.
  - Accept a Lamp key held down when the reach starts as a press (`flingBufferFrames` for the first lamp from the
    jump).
- **Check.** `canopy-r10.test.ts`:
  - from a standing jump and a running jump at three lip positions, `flingTarget` finds `wick-first` for ≥ 20 frames;
  - in a prompts unit test, the fling lesson's alpha is ≥ 0.9 for ≥ 15 of those frames;
  - the glide lesson never shows with glide not owned.

### 2. [level] The story's verb is missing from the first area: no moth is freed, every lamp relights
**What.**
- Over my whole route (the hatch, hub, well, fork, Grove, tunnel and warning), `lures()` reported `freed: 0`,
  `snuffed: 0`.
- `wick-first` relights after 90 frames. The well's, the Grove's and the warning's lamps all burn on.
- The lamps are springboards with moths drawn around them. Nothing she does changes them, and nothing in the area
  says the moths are trapped.
- The firefly never appears. No moth is seen dying or freed. The kin's beats are poses.

**Why it matters.**
- `story.md`: lamps are first traps, then slingshots, then things she snuffs, and "every lamp she puts out frees a
  cloud of moths... The count of freed moths is completion".
- The references' first areas each carry their premise:
  - HK: the Crossroads' husks and the Elderbug's warning;
  - Ori: Kuro's shadow and the dead forest;
  - Silksong: Hornet taken, and the pilgrims;
  - Nine Sols: the Apeman facility's prisoners.
- Ours is a pretty forest with lamps. This is where "a sense of place and story" fails, and it's the step back below.

**Fix (one beat, end to end, in round 10):**
- **Three trap lamps on the route** (`trap: true` lures, a sim kind on the existing snuff): the hub's clearing lamp,
  one of the Grove's two (the west), and the warning's `wick-warn-2`. Each has a dense moth cloud (2× `ROOM_LAMPS`
  moths, spiralling in) and a few fallen moths under it.
  - A snuff (the cut or the fling's `lureSnuff {fling}`) puts one out **for good**: no relight; saved in
    `save.snuffed`.
  - The freed cloud streams up and toward the moon (render: `swarm` behaviour `freed`, the hatch's river reversed).
  - It is counted (`lures().freed`, the HUD's moth count next to the lights).
- **The springboards stay.** Lamps the level needs for flings (`wick-first`, the gap's chain, `wick-pit`) are plain
  `relight` lamps with sparse moths, drawn as the firefly's hung lights (warm, small cloud). Two kinds the player
  can tell apart: what to use and what to free.
- **The firefly once.** At the gap, a light that moves:
  - on her first visit, a flicker leaves the far lamps as she lands on the shelf (`stage` cue on the shelf's
    landing);
  - it crosses to the moon's side and relights the third lamp behind her;
  - 4 s, no text, no control lost (Kuro's first pass in Ori).
- **The hub keeps the count.** Freed moths settle on the clearing's big tree, a visible patch per freed lamp (the
  hub changes, as Dirtmouth's windows do). The kin turns to them.
- **Check.**
  - `canopy-r10.test.ts`: the three trap lamps snuff and stay out through a room re-entry and a reload; `freed`
    rises by each lamp's moths.
  - The route plan snuffs all three.
  - A `place:` claim that each trap lamp is reachable to snuff without new abilities.

### 3. [level] A failed fight sends her back behind the hard part
**What.**
- Faded in the den's warning, she re-forms at x 5,752: west of the 960 px pit, behind the glide and the hawker. Each
  retry costs the walk, the hump, a glide past a strike (a light lost if held straight), then the warning from
  scratch.
- In the Grove, thorn returns in the arena put her back on the floor facing the same bed. Four in a row fade her, and
  the wave resets.

**Why it matters.**
- README fact 9: Silksong's bench sits 1.45 view widths before the first boss.
- HK and Nine Sols re-place you at the room's door for an arena, not two set pieces back.
- A retry loop that repeats a passed challenge makes the warning feel like a tax, and the warning is the area's
  second peak.

**Fix.**
- **A patch on the warning's west lip** (x ~7,100, the glide's landing), `markOnPass` so the glide's landing is a
  re-form point. It is not a save (keep the hub's), just the nearest light, as the rules already say.
- **Thorn returns inside an arena** go to the safe ground farthest from the bed that is still inside the gates
  (`safeX` excluding the last 160 px before a hazard edge).
- **Check.**
  - Faded in the warning after crossing once, she re-forms east of x 7,040.
  - In the Grove's pit, a thorn return never puts her within 160 px of the bed facing it.

### 4. [render] The map is the debug map
**What.**
- The hub's map station opens a greybox overlay: flat grey room boxes, room ids printed in their corners (`cn-hatch`,
  `cn-hub`), orange dots, her ring.
- It is round 9's "reason to stop", and it looks like a tool.
- HK's map (Cornifer's parchment, the area's colour and pins) and Ori's (painted, the area's landmarks) are part of the
  area's look.

**Fix.**
- The map drawn in the game's own hand:
  - rooms as their carved air (the export's shapes: `CANOPY_MAP`) in pale moonlit ink on a dark bark ground;
  - rock as solid dark;
  - the walked edge lit, the unwalked faint where a moth-stone has drawn the area;
  - no ids; landmark glyphs (the hub's tree, the Grove's lamps, the den's mouth, the moon over the gap);
  - lamps as warm points; freed lamps (#2) as cool rings.
- The station's opening: the hung stones swing and the map unrolls from the crook (0.4 s), not a fade over the
  scene.
- **Check.** A shot of the map at three stages (hub only; the well and limbs; the whole path) in the r10 sheet. No
  text but a region name.

### 5. [render] The hollows read as windows, cabinets and picture frames
**What.** Sealed air is drawn as a recess the shape of its rect group, lined with knobs:
- the hub's floating block: an amber knob frame round a dark panel, a planter in the sky;
- the hub's under-floor: a long dark glass tank with rows of knobs top and bottom;
- the well's east block at the bottom: a ruled panel with a knob row along its foot, a cabinet;
- the well's walls: columns of stacked discs.

The knobs were HK's stacked lumps for walkable lips. On a hollow's rim, they draw a frame.

**Why it matters.**
- Art direction: "Collision is boxes; the picture must never show it."
- The level side carved the slabs (right). The render side then drew the carving's rectangles, so the boxes came back
  as frames.
- HK's thick walls are black with a few lumps and roots inside, not lit rooms.

**Fix.**
- **Hollows are pockets, not panels.**
  - Each sealed group becomes 1-4 irregular cavities inset 80-200 px from the group's edges, by noise.
  - Between them, wood bridges 60-160 px thick, at angles.
  - The core between cavity and wall stays near-black (≤ 12).
- **No knob chains on a hollow's rim.** A broken lip of 2-5 roots crossing at angles, and the dim inner glow.
- **Discs off long walls.** On faces over 600 px tall, the lobe chain varies in size 2:1 and spacing, with runs of
  plain bark between.
- Long faces bulge ±40-80 px where `kick: false`; claw faces keep ±24 but get root and lichen breakup.
- **Check.**
  - `look:check`'s hollow class adds: the hollow's outline longest straight run ≤ 200 px, and its outline ≥ 80 px
    from the sealed rect's edges over 70% of its length.
  - The prop test bans a knob chain on a sealed rim.
  - The hub's floating block and the well's bottom in the before / after sheet.

### 6. [level + render] The den's warning reads as a scuffle on a bench
**What.**
- At the set zoom 0.85, the arena is the right third of the frame: an arched knuckle (two hoops over a hump) on a
  short floor, with lamps above.
- The left 60% is the pit and a flat umber plane with darker ovals.
- The second beat is two juveniles and a burrback, 25-35 px tall, dark on umber. I had to read their coordinates to
  follow them.
- The den's mouth they climb out of is below the frame's middle, a dark smear.

**Why it matters.**
- It is the second peak on the path and the gate to the boss. The Grove's pit works because the arena fills the frame,
  the gates grow shut in view and the lamps frame the fight.

**Fix.**
- **Level:**
  - The warning's floor 1,024 px of flat ground to the lid, with no knuckle in its middle. Lamps on the walls over it.
  - The den's mouth a visible arch in the arena's back wall, at mid-height of the frame, not at the floor's edge.
  - The set zoom 1.0 over the floor and the mouth. The pit's far lip stays on the left edge.
- **Render:**
  - The den look gets depth: two haze planes with shapes in them (the den's banks as silhouettes at 0.9 and 0.95),
    not one plane of ovals.
  - A warm glow from the mouth (the r8 spec's red-amber), so the arrivals come out of light.
  - Creatures in the den get a rim from the mouth's light and eye glints, so they read at 30 px.
- **Check.** A scripted capture of beat 2's arrival at 16:9 and 21:9:
  - every creature ≥ 40 px tall on screen;
  - its luma contrast against the ground behind it ≥ 25;
  - the mouth in the frame's middle third.

### 7. [level] The den's boss: make it the area's payoff, and prove it
**What.**
- The old burrback (three phases: slam, roll, taproot) is the area's only boss and the end of the critical path.
- No reviewer, bot or person has fought it in the Canopy in nine rounds. The route video stops at the warning's
  clear.
- Nothing before the den foreshadows it, except the warning's den mouth.

**Why it matters.**
- README fact 9: the first fight is a set piece; Silksong's first boss is at ~6 min and gates the town.
- HK's False Knight ends its first area. Its approach (the Husk Guard, the arena's chains) tells you something big is
  coming.
- An unplayed boss is an unknown at the exact place the area has to land.

**Fix.**
- Extend `route-video.ts plan` through the den to the boss's defeat and the way out. Record it with the human-like
  average bot and as a clip.
- **Foreshadow it twice:**
  - in the tunnel's run, shed shells the size of the boss's back, and claw scrapes 4× a burrback's;
  - at the warning, the lid's tremble on the flag (render has it), plus one deep slam heard and felt (a camera shake
    at 0.3 trauma) when beat 2 starts.
- A bench (patch) one view width before the den's gate, as Silksong's.
- **Check.**
  - The route plan wins the boss with ≤ 3 retries.
  - `bosses.md`'s first-timer estimate for the old burrback is in the doc.
  - The clip is in the r10 sheet.

### 8. [render] One moon, everywhere; neon moss
**What.**
- **The moon.** The same full disc, at the same size, is in about 16 of my 24 hatch, hub, fork and gap stops. It is behind
  the hub's clearing, beside the fork's block, over the gap and under the hub's hanging roots. It has stopped being an
  event and become a sticker.
- **The moss.** The lime family (hatch, limbs, fork, Grove) is a saturated pea-green in chains of round beads: the
  fork's face and the Grove's undersides look like bubble wrap or slime.

**Why it matters.**
- Art direction: "the mountain under the moon is seen at vistas", "small precious lights".
- Story: the real moon is the one constant, and showing it everywhere spends it.
- Silksong's moss is lime but broken into fronds and tufts with dark gaps. Its value sits just under the lit lip, not
  over it.

**Fix.**
- **The moon in three places only:** the hatch, the gap and the hub's clearing stop. Elsewhere, the canopy's near
  layer covers its disc, and moonlight comes as shafts and a cool key. `MOON_WINDOW` by room and stop.
- **Lime moss:**
  - chroma 0.6× and value 0.85×;
  - beads replaced by fronds and tufts of 3-7 blades, in clumps with gaps;
  - a face's lime wrap ≤ 40% of the face's length;
  - the lit lip stays the brightest line.
- **Check.**
  - The moon disc is in ≤ 4 of the wide stops of the area.
  - `look:check` per look: the moss's mean saturation ≤ the art direction's foliage family (`#6fbf6a`'s 0.45) and
    its luma ≤ the lit lip's.

### 9. [level] The hub: a long floor with a lamp, crossed three times
**What.**
- The hub is 8.9 screens at 1.35 things a screen. On the path: a 48 px block, the seed lock, the patch and the kin's
  lamp, all on one flat floor. The floating block overhead (the shard chamber) has no visible way up.
- The map station only fires if she stops on the patch.
- The kin's crook is bare until stones are read, and none are on the main path before the hub's second crossing.

**Why it matters.**
- README fact 10: hubs are quiet, but Dirtmouth and Bone Bottom are places with things to see on every return.
- Matt: "density of choice", "paths, not places". The hub is a corridor with a bench.

**Fix (with #2):**
- **The hub's trap lamp** (#2) in the clearing, with its moth cloud visible from the drop. The first thing to do in
  the hub is free it, and the kin turns toward the freed moths.
- **One more beat per return:**
  - the first return (from the limbs) shows the shard chamber's way up: a claw face lit by the freed moths;
  - the second (from the Grove) shows the seed lock with one seed's glow;
  - the hub's tree fills with freed moths.
- **The station** opens the map on a pass too (its first time), then on rest.
- **Check.** A `place:` claim per return beat. The hub's route stretch ≥ 1.5 things a screen without glints, still
  under the median.

### 10. [level] Get the human run (the gate), and record it
**What.**
- Nine rounds, no person. The bots reach the limbs at best. My scripted play finds bugs, not fun.
- #1 is exactly the kind of thing a person finds in thirty seconds and nine reviews didn't (the prompt was invisible
  until round 9, then 8 frames).

**Fix.**
- Before round 10's review, Matt plays from the hatch to the Grove (or a person he picks), with audio on if he
  approves the taste.
- Record it (screen and the `__game` event log: `events()` dumped every 600 frames to a file). The review reads the
  recording first and the numbers second.
- Until then, round 10's builder runs `npm run firsttimer` (the sub-agent with real keys and a journal) from the hatch
  with no knowledge of the keys beyond the in-game prompts. That is the closest proxy for #1.
- **Check.** The recording exists. The review quotes three moments from it.

## Smaller notes
- **The shard's fling** is the hollow's prize, but the aim is narrow (my up-left landed on the floor) and it is
  tried mid-fight. Give it a second line that's wider (any up aim from the lamp's west half) or a visible hint (the
  shelf's root points along the arc).
- **The hollow's fit** is 0.94-0.95, too slight to read as a frame. Either 0.85 or none.
- **`juv-pile`'s turn loop** (25 frames, for the whole visit) is still there from r8. Check that it isn't a stuck
  state.
- **The amber-striped post** at the well's bottom by the east wall reads as a placeholder.
- **Glints buy nothing** (23, in range now). The trade is still Matt's. If #2 lands, the freed-moth count is the
  completion number, and glints can stay a minor currency.
- **Audio** is muted while waiting on Matt's taste call. The references' first areas are remembered with their music
  (Crossroads, Ori's Glades). Ask him this round.
- My files: `rev9/` in the session scratchpad (`shots/` with the sheets, `live/` with the play frames, `srv.mts`, the
  GPU play server: a Playwright page over `window.__game` on port 5299, with `e.sh` and `shot.sh`). It is far faster
  than headless playwright-cli for driving her.

## The step back: after nine rounds, what is the biggest gap?

**Not tuning. The area has no story in play, and no event that makes it memorable.** Nine rounds measured and moved:
- the room sizes, the density and its spread, the peaks along the route;
- the climbing share, the solid in frame, the air's luma and chroma;
- the glints, the lessons, the arrivals.

Every bar is met. The score went 6 → 6 → 6.5 → 7 → 7.

The references are not remembered for their numbers. Their first areas each have three or four authored events that
carry the premise:
- **HK:** the Elderbug in an empty town, a husk that was a person, the False Knight crashing through the floor.
- **Ori:** Naru's death and the forest dying around you, Sein's arrival, Kuro's shadow over the Glades.
- **Silksong:** Hornet dragged in, the Moss Mother at minute six, Bone Bottom's pilgrims.
- **Nine Sols:** the facility's captive Apemen, Shennong, the first Sol.

Each event is built from the same kit the rest of the area uses, with a creature, a light and a camera.

The Canopy has the opening (the hatch, the swarm over the moon) and then nothing that is about anything:
- its lamps are tools that relight;
- no moth is ever freed or seen dying;
- the firefly is absent;
- the kin is a pose;
- the boss is unplayed;
- it is silent.

The things the loop isn't touching, in order of weight:
1. **The premise as play:** trap lamps, freed moths, the count (#2). It's the game's verb and its completion number,
   and it's not in the first area.
2. **Authored beats:** the firefly's pass, the boss's foreshadowing and fight, the kin's want answered (#2, #7).
3. **Music:** muted for nine rounds. The art direction promises small precious lights; the score is half of that
   feeling.
4. **The map:** the debug overlay (#4).
5. **Creature variety and scale:** 9 kinds against 9-23. They mostly read as small dark beetles (#6).

**Recommendation for the loop.** Round 10 spends half its effort on #1 and #2 (the lesson and the premise, end to end,
in the hatch, hub, Grove and warning), and the rest on #3-#7. Stop adding bars. The next score should be set by Matt's
run, not by a measure.

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | r5 | r6 | r7 | r8 | **r9** | one line |
|---|---|---|---|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | 6.5 | 7 | 7 | 7 | **7.5** | the well's gallery and lit door; the hub still a corridor |
| density | 4 | 5 | 6 | 6.5 | 6 | 6 | 7 | 7 | **7** | two route peaks (3.8×, 3.0×), a quiet fork; choices thin outside the Grove and gallery |
| combat | 3 | 4 | 5 | 5.5 | 6 | 6 | 6.5 | 7 | **7** | the hawker on the glide is new and good; the warning small, its retry behind the pit |
| traversal | - | - | 4 | 4.5 | 6 | 6 | 6.5 | 7 | **7** | the glide-only crossing; the first fling's lesson is 8 frames, then a wrong cap |
| secrets | 2 | 5 | 6 | 6.5 | 6.5 | 6.5 | 6.5 | 6.5 | **6.5** | glints 23; the shard behind a narrow fling; nothing new hidden |
| readability / look | 5 | 4 | 5 | 6 | 6.5 | 6.5 | 7 | 7 | **7** | teal well, umber den, less black; hollows as frames, the moon as a sticker, neon moss |
| pacing | 3 | 5 | 5 | 4.5 | 5.5 | 5.5 | 6 | 6.5 | **7** | 18% climbing to the Grove, the well a place; the retry loop at the warning |
| **story and place in play** (new) | | | | | | | | | **4** | a beautiful opening, then nothing about anything: no freed moth, no firefly, no boss played, silent |

**Overall: 7 / 10 against the references** (r1 3.5, r2 4.5, r3 5.5, r4 5.5, r5 6, r6 6, r7 6.5, r8 7).

The level dimensions went up. I added the eighth row because it is what the references have and we don't, and it
holds the total. Fix #1 and Matt can play it. Fix #2 and it becomes the moths' road and not a forest gym.

**What improved since round 8:**
- the well: two legs and a walked gallery, a lit door two jumps away;
- 32-51% near-black in the well (was 52-65%);
- the tunnel's glide-only crossing with a hawker that hunts and tells;
- the warning's two beats out of the den's mouth;
- glints 51 → 23;
- the Lamp prompt exists (r8: never shown in the Canopy);
- teal shaft, umber den;
- ridged Grovemother;
- the gap's root dressed.

**What didn't:**
- no person;
- the first lesson's window;
- the glide prompt for an unowned glide;
- the hollows' frames;
- the warning's scale and retry;
- the debug map;
- the bare hub;
- the boss unplayed;
- no freed moth, no firefly, no sound.

## Round 10: the ten fixes, ranked by impact

Gate: Matt's run from the hatch to the Grove, after #1 lands.
1. **[render + level] The first fling's lesson:** prompts check the ability (no glide cap without the glide); the
   Lamp cap from the first frame of reach at full alpha, lingering 0.6 s, back on every approach until the first
   fling; `wick-first`'s reach ≥ 20 frames from a standing jump at the lip and ≥ 24 from a running one (or a 0.3×
   lesson hang); a Lamp key held down when the reach starts counts as a press.
2. **[level] The premise as play:** three trap lamps on the route (the hub's clearing, the Grove's west, `wick-warn-2`)
   that snuff for good, saved, freeing a moth cloud that streams to the moon and is counted on the HUD; springboard
   lamps drawn and stocked differently; the firefly's 4 s pass at the gap relighting the third lamp; freed moths
   gather on the hub's tree.
3. **[level] Retries in front of the hard part:** a re-form patch on the warning's west lip (x ~7,100, mark on pass);
   thorn returns inside an arena land away from the bed; checks: a fade in the warning re-forms east of 7,040.
4. **[render] A drawn map:** carved air in pale ink on dark bark, rock solid, walked edges lit, landmark glyphs, warm
   lamps and freed rings, no ids; the station unrolls it from the crook.
5. **[render] Hollows as pockets:** 1-4 noise-inset cavities per sealed group with angled wood bridges, near-black
   core between; no knob chains on hollow rims; varied lobes and plain runs on tall walls, ±40-80 bulges on
   `kick: false` faces; `look:check` bans straight hollow runs over 200 px.
6. **[level + render] The warning as an arena:** 1,024 px of flat floor, the den's mouth an arch mid-frame, set zoom
   1.0; two haze planes with shapes in the den look, a warm glow from the mouth, rims and eye glints on den
   creatures; every arrival ≥ 40 px tall and ≥ 25 luma off its ground in a scripted capture.
7. **[level] The boss as the payoff:** the route plan and a clip through the old burrback's defeat; shells and scrapes
   in the tunnel and a felt slam at beat 2 as foreshadowing; a bench a view width before the den's gate.
8. **[render] The moon at three vistas, the moss tamed:** the moon disc only at the hatch, the gap and the hub's
   clearing (≤ 4 wide stops), shafts elsewhere; lime moss at 0.6× chroma and 0.85× value, fronds not beads, ≤ 40% of
   a face.
9. **[level] A hub that changes:** its trap lamp freed on the first visit, one new visible beat per return (the shard
   chamber's lit way up, the seed lock's glow, the tree filling with moths), the station's map on its first pass.
10. **[level] The human run:** Matt (or a person he picks) from the hatch to the Grove, recorded with an event log,
    audio on if approved; until then `npm run firsttimer` from the hatch with only the in-game prompts. The review
    reads the recording first.
