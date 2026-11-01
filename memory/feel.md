# Feel: shake, kick and the answers to blows (render side, 2026-10-17)

From the chunk-1 feel review (docs/design/regions/reviews/chunk1-feel-r1.md, problems 1-5, 7, 8, 10). The sim
side (hurt hitstop 8 / last light 14, kill bonus +3, `slashTerrain`, the lure throw) is in combat.md / lures.md.

## Screen shake: one trauma value (`src/render/camera/shake.ts`)
- Render-side like the kick: an offset added to the view at draw time (stage.ts), the follow camera never sees it.
  Offset = `shake.max` 30 world px x trauma^`power` 1.5 (r2: 22 x trauma² left a kill at 2 px), smooth value noise at `freq` 24 Hz on the shake's own render clock
  (no wall clock, no Math.random: a capture shakes the same every time). Trauma drains `decay` 1.8 / s, capped at 1.
  A `spawn` (teleport, re-form, room entry) zeroes it.
- **The budget** (`cameraTuning.shake.budget`, loudest first; keep this order when adding a beat):

| event | trauma | peak px |
|---|---|---|
| her last light (`hurt` with hp 0) | 0.6 | 13.9 |
| her hurt | 0.5 | 10.6 |
| snuff (`lureSnuff`) | 0.45 | 9.1 |
| the old burrback's death (`bigKill`) | 0.55 | 12.2 |
| kill (0.3 until canopy r22) | 0.34 | 5.9 |
| crack (`enemyCrack`), a ram into a wall, a bark break | 0.3 | 4.9 |
| hard landing (`land.hard`) | 0.2 | 2.7 |
| the finisher (`impact` power 2) | 0.12 | 1.2 |
| a nest's door opening (`gateOpen` id `nest-door`, r22) | 0.3 | 4.9 |
| a clang (`enemyBlock` not a down cut, `kitClang`), a cap bounce | 0.1 | 0.9 |
| a cut into a wall (`slashTerrain`) | 0.05 | 0.3 |

  Small beats are near nothing on their own on purpose (trauma² is the point: they only add up with others);
  the kick carries the cuts.
- **The kick** (`kick.ts`) now 6 px a cut, 11 the finisher (was 3.5 / 7: invisible at 1080p), x1.6 on a kill (x1.4 until
  canopy r22), the finisher's kill also **punches the zoom in** x1.035 (`kick.punch`, home in ~0.2 s on `punchOmega` 24;
  `CameraKick.zoom`, multiplied into the view in stage.ts, debug override views too), and a
  snuff kicks as a killing finisher (15 px) whatever cut put it out. Her hurt kicks 12 px the way she is thrown
  (and 4 down).
- **Accessibility**: `FEEL.shake` off stops the shake AND the kick. `?shake=off` / `?noshake`, remembered in
  localStorage `lampfall.shake`, `__game.debug.shake(on?)`. No key or menu yet (no options screen exists).

## Her hurt
- **No white on her body.** The review asked for HK's two-frame white flash on her; character-vesper.md "Health"
  records that the owner dislikes any brightness on her (round 21 removed a two-frame tone flip for turning her
  pale lavender), so she keeps going DARK (`Painter.dimK`). The white is put where the blow met her instead: a
  white 8-point star and a ring at `hurt.hitX, hitY` (greybox, creatures.ts; painted rooms have no creatures
  that hit yet). Ask Matt before putting white on her.
- On screen (`camera/hurt-fx.ts`, r2: the old dark vignette only darkened edges already near black): a 2-frame
  dark flash over the whole view (0.4), then a red edge round it (0.35, out over 0.3 s); her last light 0.6 and
  held 0.25 s. Nothing white anywhere near her.
- The shake (0.5 / 0.6). With the sim's 8-frame hold the star and the vignette land inside the freeze.

## Creatures, motes and the snuff: greybox only (memory/greybox.md)

## Catches and thorn returns: no black (plan r3 item 9, 2026-10-18)
`room.catchDepth` is 0 and a `fallReturn` glides the view with no dip (`ReformShot.reform(..., dark=false)`). She
fades instead (`CharacterSkin.fade`, character/index.ts): out over the sim's hold (`fallCatch.frames` /
`thornHit.frames`, at most 0.18 s), in over `fallReturn.fadeIn`. A real death's reform keeps its (lighter) dip.

## Camera zones by a room edge (plan r3, the oak's trunk-foot zone, 2026-10-18)
- A zone zooming out by a wall: the edge clamp moving in met her free view head-on (+11 -> -18 px/f in a frame).
  `place()` now clamps softly while the zoom is off 1 (`zones.edgeKnee` 220 px, blended in over `kneeBlend` 0.15 of
  zoom): 17.8 -> 4.9 px/f^2. At zoom 1 the hard clamp is untouched (a soft clamp everywhere broke 7 camera tests).
  A filter on the clamped view was worse (it overshoots the edge, then the hard clamp bites).
- The floor-exit seam look-through opened on a hop over a roofed floor exit (the oak's root mesh): it now needs
  nothing under her (`landBelow`) before the room's floor. That was the 20-34 px/f^2 lurch in wood-camera's hollow run.

## Gaps read honestly (round 4, 2026-10-18)
`camera/index.ts gapAhead` + `gapLook`: at a lip (no ground 40 px past her toes) the view leads half way to the first
ground across (at most 560 px); in a glide it leads to where her path (speed, sink) meets the world, and the view's
feet line goes down to it (at most 520 px) on a tighter spring (10). A first-timer glided 15 times into the face of
R10's pillar: now the pillar's top is seen above her the whole glide. The usual lead counts toward it.

## Hits that answer (round 4)
Blocked cuts (`enemyBlock`, greybox/creatures.ts `BLOCK_FX`): a 56 px clink star, a ring, five sparks thrown back,
a dust puff off her feet the recoil's way; shake budget `clang` 0.18. Bark: every `barkHit` chips; a cut whose box
came within 28 px of unbroken bark in its live frames and hit nothing ticks and shakes the panel ("tink").
The dangler's tell draws its swing: dashes down the drop, then round the arc toward her side to its end.

## Round 5 (2026-10-18)
- **Throw-cut** (the sim's `slash.heavy`): its hits draw a wide white sweep about her along the cut, a 70 px star and
  a ring (`HEAVY_FX`); `throwCut` adds shake `heavy` 0.25.
- **The first catch** shows "hold a direction" and a four-way mark beside the arc's 3rd point, once a page load
  (`AIM_HINT`), only before any lamp is out.
- **HUD "x / 60"**: the moth count shows `/ next` and a thin bar to it from `mothMilestone(tuning, moths)`; a
  `healthUp` pops it, holds it longer, and two rings go out from her.
- **Hollow grants felt** (greybox/kit.ts `GRANT_FELT`): moonlight closes into her; keen blade flashes its new reach,
  quick wings flick her wings, night eyes sends a wave that makes every burning lamp in the room glint. The map
  draws unseen burning lamps as pulsing rings once night eyes is owned.

## First-timer r6 (2026-10-18)
- **Strike now**: beating free of a lamp (`lureFree` how `beat`) closes a bright ring on the flame with four ticks
  over the throw's launch (`lures.throwFrames`), the window where a cut snuffs it.
- **Item lines** never show a code name (`itemLine`): night eyes has its line; `healthUp` says "A new light kindles."
- **The boss's open window** is loud: a pulsing green glow round the flipped old burrback and a thicker bar.
- **Small creatures at a wide frame** (carriers): drawn up to 2.2x as the zoom drops below 1.1, a pale rim under them.
- **"A moment"** in a held beat (HUD `MOMENT`): the frame's edges darken softly and a pale crescent breathes in the
  lower right corner, with the HUD fade, her look and the camera's drift.

## The attack, after Matt's play (2026-10-18)
Greybox motes.ts: every slash draws a filled crescent (the nail slash's shape: outer edge at its reach, the inner edge
swelling in at the middle, needle ends), swept out over a third of its 0.13 s, then thinning; every `slashHit` throws
7 sparks (11 on the finisher) the way the cut went, as streaks, and a bright slash mark across the blow. Every landed
blow shakes a little (`hit` 0.07; the finisher 0.16). The creatures agent is overhauling the attack itself.

## The fling (Matt's play, 2026-10-18; the sim's `player.fling`, `flingStart`, `fling`, `lureEmber`, `lureRelight`)
greybox/lures.ts: while she aims off a flame, a ring tightens on it, an arrow points from it along `lureAimX/Y`, and
`lureArc` is drawn as bright dots to a landing ring; the launch flashes a ring; a flame flung from smoulders as a red
ember with smoke until `lureSnuff` (or bursts back alight on `lureRelight`). HUD `FLING_SLOW`: the world dims and its
edges darken while she aims, with clear holes round her and the flame. Read loosely (casts) until the sim's fields
are in every build. The old catch's pips/arc code only runs while `player.lure` >= 0 (never, with the fling).

## Hit juice (canopy r22, Matt: "attacking them could be more satisfying"; `render/enemies/hitfx.ts`, `flung.ts`)
The sim's rhythm (hitstop 5 / kill +6, the kick, the shake) was kept; what changed is what the eye and ear get at
contact and death. Every kind gets it from events alone (`slashHit` with `weight` = a creature; `enemyDie` with no
killing `slashHit` in the batch = a kill by something else), so kinds other builders add are covered. Details, knobs
and rejected looks: enemies-render.md "The hit layer".
- **On the creature**: its first 3 frames go near white (`BURR.hit.white` 0.88 / `LAMP.hit.white` 0.85 toward
  `flashColor`, `whiteFrames` 3), then the old dark hold and pop; and hitfx lays a warm glow over the struck body for
  those frames (`HITFX.cut.flash*`), behind her: **still no white on her**.
- **A cut streak** through the body along the slash, **ichor** thrown along the blow that lands and splats, **a kill
  burst** (flash + fast ring), and **light fodder (juveniles, carriers) is batted away dead**, tumbles, bounces and
  lies on its back 2 s before fading.
- Lanternroot's fx (`render/lantern/fx.ts`) lost its creature cut line and kill ring + motes (hitfx draws those now in
  every non-greybox room); it keeps the contact flash, the sparks, the clangs.
- **Tried and kept out: more shove on light fodder.** `juvenileBurrback.knockScale` 1.75 / 1.8 / 1.9 (was 1.6) all
  broke "two standing cuts kill a juvenile" (creatures.test.ts): the first cut throws it out of the second's reach.
  The launched corpse carries "it flies" instead. Don't raise it without moving that rule.
- Cost: hitfx 0.04 ms mean, 0.2 ms peak on a finisher kill (M-series, 1920x1080); ~20 drops and ~30 splats at most in
  a three-cut chain.

## Gotchas
- Pixi v8 `Graphics.poly(points)` keeps the array (`new Polygon(flat)` does not copy): a scratch array reused for
  two polys redraws both as the last. creatures.ts `Xf.map` returns a new array every call for this reason.
- Render time keeps running through a sim hitstop: the hit stars, the vignette and the shake play inside the
  freeze, as in HK. Count flashes in render frames at 60 Hz, not sim frames.

## What is still weak
- The burrback (52 x 34) and hawker (52 x 24) are still small next to her at zoom 1; drawn honest to the hitbox
  (the hawker's wings reach past it, they never hurt). A real silhouette pass belongs to the art stage.
- The hero's own crescent covers the creature on the contact frame, so the creature's white reads on frames 2-3, as a
  pale body rather than HK's pure white (the zone grade and the shell's rims pull it down). The cut streak (hitfx) is
  hard to tell from her crescent at play zoom when the two lie along the same angle (canopy r22).


## Round 22, after the first-timer ("ordinary hits are small orange sparks")
Ordinary hits got more: `HITFX.drops` light 8 / medium 10 / heavy 14 (was 5 / 7 / 11), drop radius 1.8-3.6, the cut streak
5 px wide for 4 frames, the body flash 0.8 for 5 frames; `shake.budget.hit` 0.1 (was 0.07). A nest's door opening
shakes (`nestOpen` 0.3): first-timers missed gates opening off screen.
