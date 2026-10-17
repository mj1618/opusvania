# Feel: shake, kick and the answers to blows (render side, 2026-10-17)

From the chunk-1 feel review (docs/design/regions/reviews/chunk1-feel-r1.md, problems 1-5, 7, 8, 10). The sim
side (hurt hitstop 8 / last light 14, kill bonus +3, `slashTerrain`, the lure throw) is in combat.md / lures.md.

## Screen shake: one trauma value (`src/render/camera/shake.ts`)
- Render-side like the kick: an offset added to the view at draw time (stage.ts), the follow camera never sees it.
  Offset = `shake.max` 22 world px x trauma², smooth value noise at `freq` 24 Hz on the shake's own render clock
  (no wall clock, no Math.random: a capture shakes the same every time). Trauma drains `decay` 1.8 / s, capped at 1.
  A `spawn` (teleport, re-form, room entry) zeroes it.
- **The budget** (`cameraTuning.shake.budget`, loudest first; keep this order when adding a beat):

| event | trauma | peak px |
|---|---|---|
| her last light (`hurt` with hp 0) | 0.6 | 7.9 |
| her hurt | 0.5 | 5.5 |
| snuff (`lureSnuff`) | 0.45 | 4.5 |
| kill (`enemyDie`), a ram into a wall (`enemyRecover` cause wall), a bark break | 0.3 | 2 |
| hard landing (`land.hard`) | 0.2 | 0.9 |
| the finisher (`impact` power 2) | 0.12 | 0.3 |
| a clang (`enemyBlock` not a down cut, `kitClang`) | 0.1 | 0.2 |
| a cut into a wall (`slashTerrain`) | 0.05 | 0.06 |

  Small beats are near nothing on their own on purpose (trauma² is the point: they only add up with others);
  the kick carries the cuts.
- **The kick** (`kick.ts`) now 6 px a cut, 11 the finisher (was 3.5 / 7: invisible at 1080p), x1.4 on a kill, and a
  snuff kicks as a killing finisher (15 px) whatever cut put it out.
- **Accessibility**: `FEEL.shake` off stops the shake AND the kick. `?shake=off` / `?noshake`, remembered in
  localStorage `lampfall.shake`, `__game.debug.shake(on?)`. No key or menu yet (no options screen exists).

## Her hurt
- **No white on her body.** The review asked for HK's two-frame white flash on her; character-vesper.md "Health"
  records that the owner dislikes any brightness on her (round 21 removed a two-frame tone flip for turning her
  pale lavender), so she keeps going DARK (`Painter.dimK`). The white is put where the blow met her instead: a
  white 8-point star and a ring at `hurt.hitX, hitY` (greybox, creatures.ts; painted rooms have no creatures
  that hit yet). Ask Matt before putting white on her.
- A dark vignette pulse (`camera/hurt-fx.ts`, every room): a radial dark (a breath of red) over the view's edges,
  in 0.04 s, out over 0.3 s, peak 0.55; her last light peaks 0.85 and holds 0.25 s first. Over the picture, under
  the dip / HUD.
- The shake (0.5 / 0.6). With the sim's 8-frame hold the star and the vignette land inside the freeze.

## Creatures, motes and the snuff: greybox only (memory/greybox.md)

## Gotchas
- Pixi v8 `Graphics.poly(points)` keeps the array (`new Polygon(flat)` does not copy): a scratch array reused for
  two polys redraws both as the last. creatures.ts `Xf.map` returns a new array every call for this reason.
- Render time keeps running through a sim hitstop: the hit stars, the vignette and the shake play inside the
  freeze, as in HK. Count flashes in render frames at 60 Hz, not sim frames.

## What is still weak
- The burrback (52 x 34) and hawker (52 x 24) are still small next to her at zoom 1; drawn honest to the hitbox
  (the hawker's wings reach past it, they never hurt). A real silhouette pass belongs to the art stage.
- No sound on any of it (audio is muted by default anyway).
