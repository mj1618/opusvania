# Giving, render side (the offer, being seen, a calmed creature, paid prices)

Rules: giving.md. First pass 2026-10-14. Sheets: `shots/giving/` (`burr-sheet.png` the offer into a brace,
`lan-sheet.png` gifts into lantern-stone + a rest that costs, `lw-sheet.png` a lampwing given a glint,
`seen-sheet.png` / `seen-pair.png` wallet 0 / 1 / 8 / 20 / 40, `pose-sheet.png` her hands). Clip: `clips/giving-m1.mp4`.

## Where it lives
- `src/render/giving/` (`GivingRenderer`, knobs `GIVING` in config.ts, dev `window.__giving`): one `GlintBatch` in
  `layers.pickups` (over her and the creatures) + one `SurfaceLight` (goal/surface.ts) first in the `goal` layer
  (behind her). Built and updated in stage.ts right after the goal renderer (it asks `GoalRenderer.glass(lamp, i)`
  / `heartCore()` where a glass hangs this frame). Seeded xorshift, no Math.random.
- Her side is in the vesper skin: `rig.ts` (`OFFER` / `OPEN_HANDS` poses, `ACT.offer` timings, `giveK`, `emptyK`,
  events `offer` / `offerMiss`) and `index.ts` (`SEEN` table). `__vesper.act` has `seen`, `giveK`, `emptyK`.
- The price crown's given flames: goal/index.ts (`Lamp.base` = whole price, `Lamp.cost` = what is still asked,
  `base - LanternState.given`, set every frame; `GIVEN_TINT`; `GOAL.refuse.giftHold`).
- Burrback awareness: burrback.ts noticing now = `e.aware > 0` (the old 420 px render-only rule is gone, so an
  empty-handed moth never stirs one); standing, it turns to her side (`faceHer`, render only). Lampwing: its
  awareness IS its tell / dive / climb, already drawn; `enemyGiveUp` cause `gift` = `rig.shy` away from her.

## What is drawn
- **The offer**: hands out in 0.07 s, whole gesture 0.62 s; standing = whole body (leans in, hips forward, head
  inclined, wings folded forward `fold` 0.5, antennae tipped forward), aimed up/down at the target; running or in
  the air only the forelegs. The glint leaves from `vesperLink.offerX/Y` (her near hand: `offerK` includes `giveK`).
- **The glint in flight**: K_GLINT at energy 0.62 + a small flare + a 42% ribbon trail on a quadratic arc lifted
  10 px + 22% of the distance; driven by the sim's `giftTimer` (u = (n - timer - 1 + alpha) / (n - 1)), ends on
  the live target (creature box centre, the glass, the heart's core). The tail runs 0.16 s into the target.
- **Received**: a bloom (30 px, 0.42 s) that stays on the creature, and 7 motes that are PULLED IN (spring to the
  point): received, not burst. Lantern 0.8, lamp 0.6, heart 0.9 of that.
- **A calmed creature keeps the glint**: while `gift > 0` an amber flare in it (e 0.34 x share^0.7, breathing),
  a small core, a warm `SurfaceLight` pool on its own ground, and an amber mote rising every ~1.2 s. The
  burrback's own calm look (enemies-render.md) does the lowering and gold lights; together they read at play zoom.
- **Empty hands** (`offerMiss` empty): hands out, then `OPEN_HANDS` (looks down into them, antennae droop, eyes
  dim), 1.15 s; three dull specks fall. `none` (nothing in reach): a shorter hold-out, nothing leaves.
- **Seen**: `SEEN` in vesper/index.ts scales her lantern-tip / eye glow, `eyeLit`, her point light and radius,
  and the gold dust by level (level 2 = the tuned look); giving/ lays a warm pool on the surfaces round her
  (`GIVING.pool`: none at 0-1, a breath at 2, wide at 4). Measured mean luma round her at x 2850: 58 / 63 / 68 /
  72 / 77 for wallets 0 / 1 / 8 / 20 / 40. **A scene without glints (`?nopickups`, the clean plates) keeps level 2.**
- **Price paid by hand**: the crown still shows the whole price; given flames first, a deeper amber, 1.14x, with
  a steady glow; then her wallet; a gift pops its flame, beats the glass and holds the crown 2.4 s. Streaming,
  `canPay` and the charge use what is still asked.
- **Rest = give**: `lanternRest/lampRest` with `cost > 0`: that many glints (max 8) arc from her chest into the
  glass 0.13 s apart, each landing small; the goal renderer's light still flows back into her.
- **giftReturn**: a dull glint arcs back to her (not staged: needs a creature cut down in the 10 frames).

## Capture
- `scratchpad/giving/{burr,lantern,lamp,seen,pose}.js` (`playwright-cli -s=giving run-code --filename ...`) and
  `sheet.py` (the session scratchpad may be gone: the recipes are short). Burrback: load, `giving(8)`, teleport
  (1960, 1280), walk right until burr-path's `windup` (6 frames), O: offer at +8 of the tell, lands at +18, no hit.
  Clip: `npm run clip -- --pickups --setup "g.giving(8)" --at 1960,1280 --zoom 1.7 --size 1280x720 --script "R10 .3 O1 .150" --name giving-m1`.
- lamp-glade: stand on the glade ledge (760, 960) with 8; it dives at ~150 px; an offer then is too late to stop
  that dive's touch (she is hit; then it goes home calmed).

## Weak / not done
- The hold-out is small at play zoom (17 px arms, she stands 3/4 to us); it reads at 2x, at 1x the glint is the read.
- The seen pool reads as "lighter round her" more than "warm" in the green centre zone; no HUD cue for the level.
- Lampwing given a glint: shy + calm look only; the lamp is not turned away on its own.
- Kept vs wallet flames in the crown are still close in tone at 1x.
