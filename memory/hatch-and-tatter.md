# The hatch, the cocoon row and Tatter (render, `src/render/character/`; rounds 1-2, 2026-10-17)

Scene 1's acting (docs/design/scenes/01-hatching-branch.md). Sim side: memory/rooms.md (`state.hatch`, `hatchStir`, `hatch`).

## Files and wiring
- `cast.ts` `Cast`: owned by `CharacterRenderer`; `stage.ts` passes `this.game.state.hatch` as the 5th arg of
  `character.update` (the only stage hook). Per frame: `cast.link()` (writes `hatch-link.ts`), the skin, `cast.update()`.
- `hatch-link.ts` `hatchLink {inside, birthT, x, y}`: `inside` = shut in (hero not drawn, her light 0); `birthT` = render
  s since the `hatch` event (0 inside; 99 = no break seen: a teleport, a `spawn`, a room without a cocoon).
- `cocoons.ts` `CocoonRow` (+ `COCOON` knobs): one `Pod` per `marks.cocoons`. Two Wing painters (vesper/paint.ts):
  `back` (husks, the inside of hers) is child 0 of the character layer, Tatter child 1, the hero after, `front`
  (her shell, threads, flakes, silk, flash) re-added on top after every skin select.
- `tatter.ts` `Tatter` (+ `TATTER` knobs): Wing's `Rig` + `Secondary` + `drawVesper` in its own Painter, mesh scaled
  0.86 about its feet, `Painter.grade` (re-palette), `View.unarmed`, `View.tips` (no light on the snapped antenna).

## How it moves
- **They hang UNDER the branch** (round 2, review 01-round-1 problem 4: "beans pinned to the bark"): `marks.cocoons`
  y is the underside (wood-hatch 1120-1148); a hang y inside a solid is moved to that solid's bottom (fallback).
  Each `Pod` = silk `thread` (husks 20-56 px by hash, hers 30) + a body (husks `len - thread`, >= 40; hers
  82-94). A pendulum `Spring` (swing, driven by `wind(x, clock, phase)` from scene/lib/look.ts) + a bend spring
  that lags + a squash spring.
- **Husk kinds** cycle along the branch (`KINDS`): `peeled` (halves open, curled out), `bell` (wide, bottom torn
  open: `cut` ~0.75), `torn` (one half gone, hangs crooked from one thread), `shrivel` (narrow, dented: `crumple`).
  A half is a RIBBON (centre line + half widths), not a fan: curled halves are crescents and a fan from one centre
  folds over itself. Its torn seam stops short of the spine (a dark slit) and carries a silk edge (`SH_EDGE`) that
  catches the moon; the torn end narrows unevenly (teeth). Hers is paler new silk with wound fibres: the focal one.
- Hers, shut in: twitches on every `hatchStir` (press 0.55 + 0.25 per press; auto 0.32 + 0.4 x late) and on its own
  every 2.6 -> 0.85 s (hash-scheduled on render time), harder with `hatch.frames / 720`. A stir = swing + bend kick,
  a bulge where she pushes, a squash, the threads shiver, light leaks through the seam (silver).
- The break: the halves crack (`crack`), she pushes them wider 0.13 s later (`pushKick`), they settle at `gape`
  (0.24 / 0.2); 2 of 3 threads snap and recoil (pinned verlet strands); 24 flakes (tumbling `flake()`s, half of
  them moon-lit face-on, drag + wind + flutter, fall the whole drop); 5 silk wisps that FALL (gravity 150-230,
  drag 1.3; shed wisps off the husks drift at 26 / 2.4); a 0.22 s silver flash at 0.16 (never the brightest
  thing: the moon and her eyes are). Her pulls and the scramble jerk the empty husk (`BIRTH.pulls`, `hop`).
- **Half rotation gotcha**: y is down, so a half turns by `-ang`: a negative `halfL` swings the left half OUT.

## The birth (vesper `rig.ts` `BIRTH`, `index.ts emerge()`; 3 s, any step or jump ends it)
- While inside the rig is held at `birthT = 0` (curled `CURLED`) so its springs are settled at the reveal; the skin
  is not drawn and her light is 0 (`hatchLink.inside`).
- `emerge()` moves her render position (x and y; the sim body already stands on the walk line) from the cocoon's
  geometry in `hatchLink` (`x`, `y` the silk's tie, `tipY`, `botY`): curled in the husk (bottom - 8) -> hanging
  from the silk (`HANG`: hands gripped at face height, legs dangling, feet at tip + 60) over `emerge` -> two
  hand-over-hand `pulls` (each: the haul to `PULL` over 60% of it, then the reach and a 3 px sag) up to the
  underside + 48 -> the `hop`: a scramble up the bark onto the lip with one beat of the damp wings (`hopSpread`
  0.34, `hopRaise` 14), a 16 px arc -> crouched on the lip (`CURLED`), first breath, wings open ONCE
  (`unfold`, spread 0.46 raised 32: the review's favourite moment), stands by 2.9 s.
- Her rig cannot put hands over her head (arms 17 px, head 20): a hang is hands at face height, body below.
- Dark and damp until her light comes on (`light` 1.5-2.5 s, `BIRTH_DARK`), thorn faded in at the stand
  (`View.thornA`), no contact shadow while she hangs (`View.shadowA`), damp wings fill 0.72 -> 1 (`wingFill`).
- `__vesper.birth` reads `{t, w, light, fill, drop}`. Unit tests in character-vesper.test.ts.

## Tatter
- Wing's rig at 0.82 her size, re-paletted (`Painter.grade`), unarmed (`View.unarmed`), sat low and hunched
  (`PERCH`), antennae drooped, the far antenna snapped (`Secondary.antLen` 0.5, no tip light: `View.tips`).
- **The torn wing** (round 2, review: "reads as her little sibling"): `Secondary.tear` shortens its strands
  unevenly (a ragged hem), `Secondary.splay` 0.5 holds it open on its own (behind it, it cannot fold it) and
  `Secondary.droop` 62 deg lowers it (100 hung it as an ordinary cape: the tear stopped showing), a stutter flutter; in its try it lifts only a little.
- Timeline (render s after the break): watches her cocoon while she is inside (a stir makes it sit up); a small
  rise at the break; looks at her within 900 px. **The swarm** (render/swarm/timing.ts: `SWARM_PASS` in 2.4 /
  full 3.8 / hold 8.0 / out 9.5, `swarmPassWeight`, `swarmPassFocus` = the moon in view px): it looks up 0.6 s
  ahead of the pass weight at the moon taken into the world round where the camera would be with her
  (`max(960, her x)`, her feet - 238: an approximation, the cast gets no camera) drifting -260..+320 px; strains
  from `in` - 0.4; **the try** `full` + 0.3..1.8: two beats (the good wing opens wide, the torn one barely), a
  16 px hop off the branch at `full` + 0.75, lands and crumples (head down, low) until it sinks `hold` - 1 ..
  + 0.8; then a glance the way she went every 7.5 s. Live knobs: `__tatter.knobs`, state `__tatter.info`.
- `rig.look {x, y, w}`, `rig.perch / strain / tryWings`, `rig.antExtra / antCurlExtra`. Lowering the chin LIFTS
  the antennae into rods; Tatter adds `antExtra` 34 when it looks down. `window.__tatter.info` for tools.

## Her light and her darkness
Antenna tips, wing eye-spots, scale dust, trails, fx dust and her point light are pale silver-cream (`LAMP*` in
draw.ts, fx.ts `GOLD*` hold silver values, `LIGHT` 0xd9dbd3). Eyes and catchlights stay gold. Round 2 (review:
body p50 45 > 30): her dark body colours are scaled by `BODY_K` 0.48 in draw.ts (wings, tunic, sleeves, legs,
crown) and the hem band by 0.5; the face, hands and feet keep their tone.
- Measuring her: render the frame, then hide every layer but `character` (and the cast meshes) for a "solo"
  frame and `__vesper.hidden` for a "bare" one; her pixels = |solo - bare| summed over RGB > 12 (post lifts the
  empty frame to ~9, so a small threshold catches her bloom, a large one keeps only her pale parts). On the full
  frame at (1400, 1024) standing: the whole figure p50 ~26, the lower 55% (body) p50 ~20 (was 23 at 0.66).

## Capture
`tools/.cap-hatch.ts`-style scratch script (kept out of the repo: Biome lints `tools/`): open `?manual&nopickups`,
`step(200)`, `input('J1 .20 J1 .20 J1')` = the break at frame 243, `cam({x: 870, y: 1060, zoom: 2.5})` for the
cocoon, `(1150, 990, 3)` for Tatter. A teleport ends the hatching silently (the shots tool shows an open husk).
Clip: `npm run clip -- --script ".170 J1 .20 J1 .20 J1 .130" --zoom 1.5 --name hatch-r1`.

## Weak (round 2)
- The husks are better shapes (peeled, bell, torn, shrivelled) but still read a little as pairs of dark leaves;
  no thickness to the shell, no inside light.
- The scramble from under the branch onto the lip crosses the whole bark face in 0.33 s: it reads as a flutter-hop,
  not a climb; there is no grip on the lip.
- Tatter's try and crumple read at zoom 3; at zoom 1 it is ~60 px and the torn wing is a few dark px.
