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

## Pass 2 (coordinator review: "seen must be felt")
- **Seen, pushed** (`SEEN` in vesper/index.ts, `GIVING.pool / carried`): level 0 = `Painter.dimK` 0.62 (her colours
  go to a cool dark grey, every light down), glow 0.1, point light 0.04, no dust: a near-silhouette. Level 4 = glow
  1.75, point light 2.6x at 1.65x radius, a strong surface pool (380 x 250 px, e 0.95) that lights grass and trunk
  bark, a warm air halo from level 3. **The carried glints are drawn**: round(1.6 x sqrt(wallet)) motes (max 11) on
  tilted orbits round her chest, lagging her when she runs (wallet 1: one, 6: four, 15: six, 40: ten). Strip:
  `shots/giving/seen-strip.png` (blue / green / amber zones x wallet 0 / 1 / 6 / 15 / 40, play zoom). Level 2 is the
  tuned look plus its motes.
- **Unbothered** (`BURR.doze`): she within 340 px, it not aware: lids 62% down, the calm's slow breath, eyes down,
  a sleepy mote every 1.5 s. At 1x the read is its lights going dim while she passes; the motes are small.
- **Aware**: burrback eye halos flare x3.4 on the notice flash and stay x1.6 (`notice.eyeFlare / eyeKeep`), plus
  its lights and turning to her side. Lampwing: `enemyAware` -> `rig.spot` (lamp x2.8, halo x2.4 for 0.7 s) and the
  body kicked toward her (`LAMP.gift`).
- **Lampwing given a glint**: on `enemyGift` (not only the give-up: a dive that touched her first gives up as
  `touch`) a full shy away from her and `giftDim` (lamp down 85%, back over 3 s).
- **Offer**: bolder pose (hips 5 px forward, lean 0.3, curl 0.16, hands 16 px out), wings fold forward (`fold`
  1.1), 0.7 s; a small warm light at her hands/face for 0.3 s (`GIVING.face`; at 30 px / 0.75 it blew out).
- Clip `clips/giving-m1.mp4` (10 s, 1280x720): wallet 0 past burr-path (it never stirs), cut, `load()`, wallet 15 at
  (3150, 1280): burr-shaft aware at 260 px (frame 9), she waits 45 frames (it turns to her), walks on, it braces,
  she offers 5 frames into the tell, it calms. Frames from `scratchpad/giving/clip.js` (run-code, one screenshot
  per step, offline) + ffmpeg: `tools/clip.ts` cannot change the wallet mid-script. Without the `load()` before
  part B, burr-shaft had wandered and rammed her.

## Round 2 sim (ab4429a) follow-ups
- The flight is `player.giftFrames` (3 to a lampwing after her, 8 to a light, 10 to a creature), not
  `offerFlightFrames`; under `flight.streakAt` (8) frames the trail covers the whole arc from her hands: a streak.
- **Pour** (`GIVING.pour`): two offers to the same light / heart within 0.3 s = held V. Drawn as one ribbon hand ->
  glass with 5 beads running down it, a steady glow at the glass and her hands; the per-glint landing shrinks to
  half and the crown fills flame by flame (given flames deeper amber). A lamp of 8 takes ~1.1 s. `shots/giving/pour-sheet.png`.
- The tally's "calmed" icon: its kept glint is amber now (a pale core read grey on the dark shell). The V prompt
  (hud/prompts.ts) matches the other key caps; left as it is. `shots/giving/tally-zoom.png`, `prompt-v-crop.png`.
- `clips/giving-m2.mp4`: a natural run replayed from a pilot tape (a copy of naive-pilot's `naive(5, 9, {offer,
  lay})` with offers only to AWARE creatures and laying only into lamps, its masks through `formatInputScript`,
  replayed in the page with `__prompts.enabled = true` + `reset()`; the page sim matches node frame for frame).
  Windows: 100-260 (lantern-stone leaves her 1, burr-path below her), 330-470 (burr-shaft aware at 359, the V
  prompt), 620-760 (burr-ledge: aware 646, given 700), then a cut to lamp-root (4285, 1280) holding V 150 frames.
  On the natural route she passes burr-path from the islands above, not on its ground: the "dozes" read is far.

## Round 3 (re-playtest: the seen rule was invisible)
- **Asleep** (`e.dozing`, the sim's: an unseen burrback within `dozePx` 340 stops where it stands): `rig.dozeK` drives
  the calm's lie (crouch, flat dome, burrs down, head low, slow deep breath) WITHOUT the gift's warm lights; lids fully
  shut (`BURR.doze.lids` 1), its row of lights down 82% and breathing, a column of pale sleep motes (every 0.42 s,
  1.5x the calm's size: a "zzz" that reads at 1x). The render-only doze rule of pass 2 is gone.
- **Caught** (`enemyAware`, `GIVING.caught`): a thin warm thread from its eyes (burrback: 6 px in from its front on
  her side, 18 px up) shoots to the ring of her carried glints in 0.11 s, holds, fades from its own end by 0.45 s;
  its eyes and her light flare; her glints draw in 35%, jitter 2.5 px and flare x2.4 over 0.6 s.
- **Lost** (`BURR.lose`, `rig.lostT / lostK`): `aware` falls while it is not calmed / dead / hurt: over 1.1 s its
  eyes close 85%, lights fall 60%, it settles 70% of the calm's lie; gone by 2.6 s (a dozing one sleeps on).
- Sheets: `shots/giving/r3-strip.png` (wallet 0 near / beside / past / asleep; wallet 20 caught +4 / +12 / seen /
  lost), `r3-asleep.png`, `r3-asleep-1x-zoom.png`, `m3-sheet.png`, `m3-lose.png`. Clip `clips/giving-m3.mp4` (10 s,
  fixed camera at 2330, 1195 zoom 1.75): wallet 0 she runs past burr-path asleep, stops by the wall at 2400; wallet
  20: the thread, it watches; she stands at the edge of its sight and it loses her (eyes close, settles); she tries
  the wall, drops back and is caught again. (The wall at 2432 has no way up on foot; a staged "walk away" needs
  another spot.)

## Round 4 (playtest 3: the thread easy to miss, the sleeper read as "a dark lump")
- **Thread**: `GivingRenderer.thread()` (even width and brightness, a soft body + a hot core), 2.6 px half-width,
  0.95 s, a bead (`caught.bead`) runs it from its eyes to her glints in 0.3 s, then sits pulsing in her light.
- **HUD answers** (`HUD.seenAt / seenHold / seenPop / seenFlash`, hud/index.ts reads `enemyAware` itself): when the
  bead lands the count shows, its digits swell x1.66 and the glint icon flashes warm and large, dying at 3.2 /s.
- **Sleeper** (`BURR.doze`): motes 2.3x the calm's, slower and longer-lived, every 0.6 s (a column); the shut eyes
  drawn as pale lid lines (`lidW / lidH / lidAlpha`; at 1x a few px: the motes carry it); the shell rises and
  falls deeper (`rise`); its lights swell `glowPulse` with each breath (peaceful, not dead).
- **Roost** (`LAMP.roost`, sim `e.roosting`): wings folded (the hurt/dead `fold` to 0.95), beat stopped, lamp to
  ~15% breathing, a slow pale mote; on waking it snaps open at 16 /s and `enemyAware` flares the lamp (`gift.spot`)
  with the thread from its body to her glints.
- Sheets: `r4-strip.png` (asleep a / b, thread mid-travel, holding), `r4-zoom.png` (motes, HUD flare),
  `roost-sheet.png` (roosting, waking + thread). Clip `clips/giving-m4.mp4` (10 s, follow camera zoom 1.3): wallet
  1 on island A under lamp-glade roosting; she hops A -> B -> C (jump at the islands' east ends, the bot in
  `scratchpad/giving/bot4.js`), gathers 2 + 2 glints: lamp-f3 sees her (thread, count flares), gives up; she takes
  the ember (wallet 10): it sees her again, she offers 14 frames later, the 3-frame glint lands, it dims and goes.

## Capture
- `scratchpad/giving/{burr,lantern,lamp,seen,pose}.js` (`playwright-cli -s=giving run-code --filename ...`) and
  `sheet.py` (the session scratchpad may be gone: the recipes are short). Burrback: load, `giving(8)`, teleport
  (1960, 1280), walk right until burr-path's `windup` (6 frames), O: offer at +8 of the tell, lands at +18, no hit.
  Clip: `npm run clip -- --pickups --setup "g.giving(8)" --at 1960,1280 --zoom 1.7 --size 1280x720 --script "R10 .3 O1 .150" --name giving-m1`.
- lamp-glade: stand on the glade ledge (760, 960) with 8; it dives at ~150 px; an offer then is too late to stop
  that dive's touch (she is hit; then it goes home calmed).

## Weak / not done
- Pass 2 left: level 0 eyes are still fairly bright (draw.ts clamps the eye core at 0.6); the doze motes are small
  at 1x; the blue zone's level-4 pool goes a little cream on pale bark.
- The hold-out is small at play zoom (17 px arms, she stands 3/4 to us); it reads at 2x, at 1x the glint is the read.
- The seen pool reads as "lighter round her" more than "warm" in the green centre zone; no HUD cue for the level.
- Lampwing given a glint: shy + calm look only; the lamp is not turned away on its own.
- Kept vs wallet flames in the crown are still close in tone at 1x.
