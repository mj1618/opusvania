# L2 movement greybox: playtest report

Date: 2026-09-28. Build: `main` @ 127788a (exported to a scratch tree and served on :5191; the working tree was mid-merge). Driven with `playwright-cli -s=playtest` through `window.__game` in manual mode, one frame per step, so every number below is exact and reproducible. Evidence (clips, contact sheets, screenshots, per-frame traces) is in `clips/L2-playtest/` (gitignored). Frame numbers are the `state().frame` values printed in the trace files there.

Scope: opus / celeste / hk presets; jump, run, wall, dash, double jump, corrections, forgiveness; camera; juice; all 14 gym rooms via their golden tapes; greybox readability.

## Verdict

**Solid base, one blocker.** The controller does what the spec says, to the pixel: jump shape, tap/hold range, apex hang, coyote, buffer, corner correction and ledge pop all measure correctly and the corrections are genuinely invisible. Zero-frame input response. The three presets are clearly distinct, so the blind A/B is meaningful.

But **do not build Seize/Levy on it until the wall-jump bug (P0) is fixed**: wall speed retention cancels any wall jump made within 4 frames of touching a wall and glues the player to walls. That is the most common wall-jump rhythm, it affects all three presets, and it makes gym-07/08/13 feel broken in real play (the golden tapes happen to avoid it). It is a small fix (3 lines in `player.ts`). After it, plus the camera-zone fix (P1) and a juice amplitude pass (P1), this is a base I would happily iterate feel on rather than rebuild. No architectural change is needed.

Recommendation: one short fix loop (P0, both P1s, and the P2 tuning suggestions as an A/B), then a second playtest of wall-jump chains only.

## Ranked issues

### P0. Wall speed retention cancels wall jumps and makes walls sticky (all presets)

**What happens.** Touch a wall with horizontal speed, then wall jump within 4 frames: the jump fires (vx = +13.44) and one frame later vx is overwritten with the *pre-contact* speed (−9.6), the player is pulled back onto the wall and sits there with vx = 0 for 6 more frames because `forceTimer` freezes vx.

**Evidence.** `clips/L2-playtest/trace-walljump-retention-probe.txt`, section (a) (gym-07, left wall at x = 64, hop toward the wall, press R+J `delay` frames after first airborne contact); key lines:

```
[opus] delay=0 R+J | pre: x64 vy-2.7 wd-1 retainVx=-9.6 retainTimer=3
  +1:x77,vx13.4,vy-21.8  +2:x68,vx-9.6,vy-20.9  +3:x64,vx0.0,wd-1  +4:x64,vx0.0  ... +8:x64,vx0.0  +9:x66,vx2.4
[opus] delay=1 R+J | same: +1 x77 vx13.4 -> +2 x68 vx-9.6 -> +3..+8 x64 vx0
[opus] delay=2 R+J | clean: +1 x77 13.4, +2 x91, +3 x104, +4 x118 ... (retainTimer had expired)
[opus] delay=0 J   | neutral jump: +1 x77 vx13.4 -> +2 x69 vx-8.4 -> +3..+10 x64 vx0 (never leaves the wall)
[opus] delay=0 R+J wallSpeedRetain=false | clean
[celeste] delay=0 | +1 x81 vx17.3 -> +2 x69 vx-12.0 -> +3..+10 x64 vx0
[hk]      delay=0 | +1 x81 vx17.1 -> +2 x72 vx-8.8  -> +3..+6 x64 vx0
```
Clip: `clips/L2-playtest/walljump-retention-bug-sheet.png` / `.mp4` (gym-07, `L+J1 L+J5 L4 R+J10 R30`): the player kicks off the wall and is snapped back onto it on the next frame, then rides the wall down. `trace-walljump-chain-policy.txt` shows a wall-jump-chain policy (jump the frame after contact, the natural rhythm) managing exactly 1 wall jump in all three presets and ending back on the floor.

A second symptom without a jump: holding *away* from a wall you just touched oscillates x 64→66→64→66 for up to 7 frames (opus) or the whole rise (celeste, whose air accel 1.44 never beats the restored −10.9). On the ground, reversing off a wall has a one-frame hitch (x 67→69→74).

**Cause.** `src/sim/player/player.ts` `updatePlayer` restores `retainVx` whenever the wall is gone, regardless of the sign of the current `vx`; nothing clears `retainTimer` on a jump/wall jump/dash; and `horizontal()` returns early while `forceTimer > 0`, so once the restore has zeroed vx against the wall nothing can move it for 8 frames. Celeste's `Player.cs` has the missing check: `if (Math.Sign(Speed.X) == -Math.Sign(wallSpeedRetained)) wallSpeedRetentionTimer = 0;`.

**Fix.** (1) In the retention restore, skip and clear when `p.vx !== 0 && sign(p.vx) !== sign(p.retainVx)`. (2) Set `p.retainTimer = 0` in `wallJump()`, `jumpCommon()` and `startDash()`. (3) Keep the assist; it is right for dash-clipped corners. Add a V-test: "wall jump on frame 1 after contact travels the same distance as on frame 5" for all presets.

### P1. Camera zone transitions cut instead of blending when the target is beyond the room bound

**Evidence.** gym-14 golden tape, `trace-corner-zones-slide-spikes.txt` section (2), frames 18835→18838: view x 3520 → 3912 → 3986 → 4224 (steps of 392, 74 and 238 px in three consecutive frames) as the player dashes out of lock zone C and into bounds zone B. Entering zone C (frames 18716–18730) blends nicely (72, 66, 61 ... px per frame), so the blend itself works.

**Cause.** `src/render/camera/index.ts`: on a zone change `offX = before.x − after.x` is computed from *clamped* views, but `place()` adds `offX` to the *unclamped* target and clamps afterwards. Whenever the free-follow target is past the room bound (here fx ≈ 4536 vs bound 4224) the 300–400 px difference appears in one frame.

**Fix.** Compute `after` from the unclamped target (or clamp the target *before* adding the offset in `place()`, then clamp again). Add a C-test: max view step ≤ 40 px on any zone change along the gym-14 tape.

Minor, same room: lock zone C is exactly one view wide, so the player's body pokes 20 px off-screen at its edges before the zone releases (f18835: player x 5436..5476, view ends at 5440). Make lock zones 1 tile narrower than the view on each side, or release the lock when the body leaves the view.

### P1. Juice amplitudes: landing, hard landing and death are under-sold

**Evidence.** `clips/L2-playtest/crop-hardland-p0.png`, `crop-hardland-p2.png` (gym-09, 575 px fall, `hard: true`): the squash reads (good), but the "8-particle big puff" is two 4-px specks under the feet. Trauma after the hard landing = 0.27, so the shake amplitude is 24 × 0.27² = **1.75 px**, i.e. invisible (`camera().shakeX` = 0.05, −0.31 on the two frames after). `crop-death.png`: the 16-particle death burst is a single red blob 20 px across; no flash, no freeze on screen. `crop-jump-p1.png`: takeoff stretch (0.7 × 1.3) reads well with one dust chip. Wall-slide dust (`juice-wallslide.png`) is two 3-px dots. Dash (`juice-dash-p7.png`) is the one effect that lands: 3 afterimages + streaks + the dash-ready band.

Compared with Celeste (landing: wide puff plus side streaks, screen shake you feel) and Hollow Knight (soft dust cloud two bodies wide, a 0.8 s hard-land stun we deliberately skipped, so the visual has to carry it), this is a 2/5.

**Fix (fx.ts / camera tuning).** `traumaHardLand 0.3 → 0.55` (7 px) and `traumaDeath 0.5 → 0.8` (15 px), or raise `shakeMaxPx` to 40. Landing dust: speed ×2.5 with `spread 2.5`, size 10–22, 12 particles on hard land, and 2 horizontal streaks. Death: radial burst speed 6–10, 24 particles, plus a 2-frame white sprite flash and a 6-frame hold before the fade. Wall slide: one 6-px chip every 2 frames with a downward drift.

### P2. Effective camera look-ahead is ~1 tile, not 2.5; camera drifts after stopping

**Evidence.** `trace-dash-dj-camera.txt`, "camera X" section: running right at 9.6 px/f the player's left edge settles at screen x = 866 (centre 886), i.e. only 74 px ahead of centre. The lerp (0.10) has a steady-state lag of v/lerp = 96 px, which eats most of the 160 px lead. When the player stops (f15129), the camera keeps travelling 96 px. On reversal the focus flips after 48 px (correct) and the view then swings 320 px at up to 35 px/frame (f15136: 683 → 648).

Hollow Knight and Ori keep the player visibly behind centre while running; ours reads as centred. Not jittery (0 non-monotonic frames), just timid.

**Fix.** `lerpX 0.10 → 0.15` and `lookaheadX 160 → 200` gives a 136 px effective lead and a 64 px stop-drift; or make the target `feet.x + focusDir·lookahead + vx·8` so the lead scales with speed. Cap the reversal pan at ~24 px/frame.

### P2. Wall slide is slow and sticky

**Evidence.** `trace-corner-zones-slide-spikes.txt` (4): slide reaches its 4 px/f cap (3.75 tiles/s) within 4 frames and stays there; a 17-tile shaft takes 4.5 s to slide down. Hollow Knight slides at 8 u/s; Celeste ramps 2.5 → 20 tiles/s. Combined with neutral-hold keeping the slide (good, HK-like), the player feels glued.

**Fix (A/B).** `wall.slideMax 4 → 6.5` with a ramp: start at 2.5 and add 0.25/frame (Celeste's `WallSlideTime` feel), so a quick tap-and-jump is calm but a long slide gets out of the way.

### P2. The `celeste` preset stops 2.5× faster than Celeste

**Evidence.** Celeste's `RunReduce` is 400 px/s² (13.5 frames to stop from max run at our scale); the preset uses `groundDecel: 20/9` (the `RunAccel` 1000 value, 5.4 frames) and `airDecel: (20/9)·0.65`. Trace: run stop in the celeste preset takes 5 frames (`trace` batch 1, celeste run). The blind A/B is against a tighter Celeste than the real one.

**Fix.** `groundDecel: 8/9`, `airDecel: (8/9)·0.65` in `PRESETS.celeste`.

### P3. Look up/down takes almost a second to be useful

24-frame delay, then lerp 0.06: first movement at +23 f, 90 % of the offset at +57 f (`trace-dash-dj-camera.txt`, look sections). Suggest `lookDelay 12`, `lookLerp 0.12` (90 % at ~30 f). Offsets of 224/256 px (3.5/4 tiles) are fine.

### P3. Gym design notes

- **gym-01 (first room)**: only 5 air rows, and a full jump needs 5.5 (4.25 + 1.25 body). The first full jump a player makes bonks the ceiling (trace: apex cut at f19, y = 384, `headBump`). Raise to 7 rows unless the low corridor is the point.
- **gym-03**: hold 11 f survives, hold 12 f dies (rise 206 vs 209 px; spike hitbox 288 px up). A one-frame cliff with no `R` checkpoint. Fine as a test, harsh as a lesson; consider a 1-tile-lower spike band in a "teach" variant.
- **gym-04**: the buffered-rhythm section is 1-wide pillars over 2-tile spike pits (24 px of landing slack). That is Celeste B-side precision for a forgiveness tutorial; use 2-wide pillars.
- **gym-05**: corrections verified invisible: overhangs of 7 and 17 px are shifted (`+5:dx-7`, `dx-17`) and the player lands on the slab; 26 px bonks (limit 20). But the golden route never triggers one, so the room only "teaches" if you play sloppily. Good.
- **gym-07**: broken in real play by P0 (fast kick-offs fail). Layout note: the "4-wide chimney" is cols 7–10 but you must first climb the 5-wide left shaft; the pillar `g` is a good optional.
- **gym-09**: the room's payoff (hard landing at the bottom) never plays on the intended route: `G` fires ~50 px above the floor (tape ends at y = 2811 while still falling at 31 px/f; the floor is at y = 2864). Move `G` one tile aside or lower its trigger.
- **gym-13**: flows well (354 f par, `gym-13-gauntlet-sheet.png`); camera steps ≤ 35 px, feet stay within 16–86 %.
- **gym-14**: zone C exit cut (P1). Look-up `g` and look-down spikes work as designed.
- gym-06/07 spawn: the floor is one tile above the room edge, so the clamped camera puts the feet at 92–94 % of the view with 2 empty tiles of apron below. Cosmetic.

### P3. Greybox readability

- Solid (0x2b3142) vs air (0x141824) are both dark navy; only *tops* get the 6-px lit edge, so vertical faces (chimney walls, the gym-13 pillar) read weakly at a glance (`room-gym-13.png`, `juice-wallslide.png`). Lighten solids to ~0x3a4258 or edge every exposed face.
- One-ways (bar + two legs) read as platforms; nothing says "drop-through". The sealed goal box in gym-06 relies on the player knowing Down+Jump. Acceptable in a greybox; a chevron under the bar would fix it.
- Spikes: readable, and the hitbox (base half, 8-px inset, 32 of 40 drawn px) is pleasantly lenient: running into the first gym-03 spike kills at x = 481 (right edge 521, hitbox starts at 520).
- Player (cream capsule), goal (green), optional (yellow), respawn flag (blue), orbs and the dash-ready band all read instantly. The HUD line (room, abilities, deaths) is useful.

### P3. Small things

- Neutral wall jump: vx 13.44 decays to 0 in 11 frames (airDecel 1.2), about 100 px of travel, then drifts back. Right for Celeste-style neutral climbing (+1 tile per hop); document it.
- Double jump 2 frames after takeoff reaches 256 px total, less than a single full jump (276), because the first jump's release cut applies before the fixed 192 px DJ. HK behaves the same; worth a line in the spec so nobody "fixes" it.
- Dash-jump cancel with no direction held (`X1 .4 J1`) gives vx 12 that decays to 0 in 10 frames; with a direction held it carries. Fine, but the "modest long jump" only exists if you hold the direction.

## What feels good (keep)

- **Exactness and response.** Frame 1 of a press moves 3.2 px / launches at −21.76; there is no input latency in the sim. The whole gym is deterministic and my traces matched the spec tables (V03/V04 numbers) exactly.
- **Jump shape (opus).** Rise 276 px in 25 f, 51 f air time, 11 frames of |vy| < 3.4 at the apex (a visible hang), max fall reached 18 f after the apex. Tap = 76 px (28 %), and the ×4 release cut makes short hops snappy. Running jump covers 457 px (7.1 tiles) flat. It sits where the spec wanted it: between Celeste (228 px / 20 f) and HK (355 px / 30 f).
- **Run.** 3 frames to full speed, 3 frames to stop (10 px skid), 4 frames to reverse on the ground, 8 in the air. HK-tight on the ground with a little air momentum; the momentum carry after a dash (9.6 exit, 0.4/f overspeed decay) is nice.
- **Forgiveness.** Coyote 6 f (k = 0..5), buffer 5 f (opus, celeste), hk 3/2 as designed. Ledge pop 16 px and head-bump correction ≤ 20 px never show as a teleport (max shift seen 17 px).
- **Dash.** 2-frame freeze, 12 frames at 24 px/f, 288 px, cooldown 24 f from the press; afterimages + streaks read as one streak; the dash-ready band on the sprite is a great tell.
- **Wall slide semantics** (once P0 is fixed): neutral keeps the slide, 5-frame stick when holding away, wall-jump grace 20 px, refill on wall jump.
- **Presets differ for real.** celeste: 3.6-tile / 20 f jump, 12 px/f run with 5.4 f accel, sustain-style variable jump. hk: 5.6-tile / 30 f jump, instant run, minimum 5-frame jump (holds 1–4 f all give ~80–88 px). The `B` swap will show a human three genuinely different games.
- **Camera calm.** x is monotonic while running; y does not move on same-height jumps; fall-follow in gym-09 keeps the feet at 52–54 % all the way down; chimney climb (gym-07) keeps the feet within 19–49 % with only 2 direction reversals.
- **Gym as a tool.** Golden tapes + `?manual` + `step/state` made this whole review possible without a human; gym-13 is a convincing flow room.

## Checklist scores (movement-spec §7.6)

| Check | Score | Note |
|---|---|---|
| Arc legibility | 4 | Dense apex, faster fall; the trail overlay is on the merging branch, judged from traces + sheets |
| Anticipation and impact | 3 | Takeoff stretch and land squash read; dust/shake do not (P1) |
| Camera calm | 4 | Monotonic x, stable y; zone-exit cut in gym-14 (P1); look-ahead timid (P2) |
| Readability | 3 | Player/hazards/goals instant; solid-vs-air and one-way affordance weak (P3) |
| Correction invisibility | 5 | 7–17 px shifts unseen; 26 px bonks |
| Numbers | 5 | Every claim above cites frames from `clips/L2-playtest/trace-*.txt` |

## Reference comparison, concretely

- **Hollow Knight**: our opus run/stop is as tight as HK on the ground; our jump is 0.77× HK's height and 0.83× its apex time, so it feels lighter and quicker, closer to Celeste. Wall slide is half HK's speed. Look-down is slower than HK's. HK's wall jump is a decaying kick; ours is an 8-frame forced 13.44 then a 0.4/f decay to 9.6, which feels similar once P0 is fixed.
- **Celeste**: our tap/hold range and 4× release cut give Celeste-like hop control; the apex hang is longer than Celeste's (11 vs ~6 frames under 3 px/f); our fall/rise gravity ratio 1.6 vs Celeste's ~3 makes descents floatier. Dash length matches (4.5 tiles). Celeste's camera is near-centred with small lead, so ours is not worse than Celeste, just not Ori.
- **Ori**: Ori's camera leads hard and eases with velocity; ours will need P2 to get near that. Ori's landing/dash feedback is far louder than ours (P1).

## Notes for `memory/` (not written, per the no-edit instruction)

- Wall speed retention must cancel on opposite-sign vx and be cleared by jumps/dashes (Celeste does both); the L2 build did neither and it broke wall jumps.
- Camera zone blending must compute `before/after` and apply the offset on the same (clamped or unclamped) basis; otherwise room bounds turn blends into cuts.
- The gym-07 layout: the spawn shaft is cols 1–5, the "chimney" cols 7–10; scripted probes must jump left first.
- Trauma² with `shakeMaxPx 24` makes anything under trauma 0.45 invisible (< 5 px).
- `__game.input()` queues persist across `load()`; call `clearInput()` before every scripted probe.
- Golden tape inputs can be replayed with `input(tape.inputs)` after `load(room)`; abilities come from the room.
