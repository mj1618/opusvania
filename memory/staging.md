# Story staging in greybox (2026-10-18, plan chunk1-plan-r1 item 12)

Greybox stand-ins for the wood's set pieces (docs/design/regions/wood.md, journey.md's staging rule: a place she
flies into, the player in control, input never held; the camera may lift, widen or look).

## Data: `room.marks.stage` (src/scene/stage.ts, Zod; render only)
`moon {x,y,r}`, `lights {x,y,w,h,count}` (far warm points), `stream {points, count?, speed?}` (the swarm as specks),
`vista {flag?, zone?, x, y, zoom?, hold, title?, parallax?}`, `stragglers {count, path}`, `circlers [{lure, count, r}]`,
`props [{kind: 'deadMoth', x, y, facing?}]`, `glimpse {flag?, zone?, x, y, zoom?, secs, path, away}`,
`bask {x, y, zoom?, secs}`, `twitch {x, y, r, catches}`. Also `marks.tatter.want [x, y]`.
- **Cues**: a beat starts on the `flagSet` of its `flag` (a trigger's `sets`), so it plays once a save. `zone` is a
  stand-in until a trigger exists: the first entry into that camera zone this visit (skipped if the flag is saved).
  The bask starts on the room's `gladeGrant`; the twitch counts `fallCatch`es this visit.
- Written in: wood-chase (moon, lights, stream, vista on `wood-vista` / zone `vista`, stragglers), wood-wicks (W1
  circlers, the dead moth in the dip), wood-glade (bask, twitch at the lip after 2 catches), wood-hollow (glimpse on
  `wood-firefly-glimpse`; Tatter under the root shelf with `want` its top). R2 still needs a trigger setting
  `wood-vista` on V2 (zone stand-in meanwhile). P7 (Tatter in the grove) waits for R13.

## Code
- `camera/stage-cam.ts` `StageCamera` (stage.ts): the vista hold, the glimpse look-up, the bask framing as an offset
  and zoom factor on the follow view (like the goal camera; not under a debug override, so clip them `--wide`).
  `STAGE_BEATS` = seconds into each beat (-1 none, `DONE` done in an earlier visit); a restart (`roomEnter`) re-reads
  the save. Ease in / out `STAGE_CAM`; the glimpse's hold is `secs` - 1.5 (r2: 3 s in all; the title comes in 0.1-0.55 s).
- `greybox/staging.ts` `StagingView`: far things in the sky layer (screen space, under the terrain) with parallax
  about the vista point (`toScreen`), so the moon and the stream show through the sky and the lamps through the gap
  past the lip; the title is a Pixi Text over the moon. Back: props, the twitch's wings (behind her). Front:
  stragglers, circlers (they scatter on the lure's snuff), the firefly (in, hang, two pulses, dart), bask motes.
  Knobs `STAGING`.
- `greybox/lures.ts`: a lure with `after` (the glow-cap) is not drawn while the glimpse is before its first pulse:
  the firefly hangs it.
- `character/tatter.ts`: with `want` it gazes at it, turns to her as she nears, and its one try (the swarm try's
  timeline, timed from her arrival within `TATTER.want.arrive` 420 px) is aimed at the want. It is the painted
  rig in greybox rooms too (Cast builds it wherever `marks.tatter` exists).
- Old burrback health: cracks in its shell, one per hp lost, drawn through the body transform (upright and on its
  back); `enemyCrack` (each third) throws shell chips and a star and shakes 0.3 (`shake.budget.crack`). The
  sim's dome contact uses domeHeight 0.86 / domeShoulder 0.62: keep creatures.ts's dome in step.
- Firefly signs (kit.ts): the read plays the rhythm twice with a rest, the ring of caps and one call light blinking.

## Gotchas / weak
- Far things follow the camera at parallax 0.25: the moon is in the sky all along R2 (wanted); keep `lights` where
  only open air is under them at the vista (they draw behind solids, so elsewhere they hide).
- The twitch is an overlay, not the rig's acting: a real wings cue belongs in the Vesper rig later.
- The bask and vista do not hold input (render can't); if a held beat is wanted it is a sim trigger (<= 3 s).

## The curious first-timer's render items (2026-10-18)
- **Moth count** (`hud/moths.ts`, in the HUD under the lights, real top-left corner): `save.moths`; on a snuff up
  to 8 small moths leave the flame's place on screen and fly into it, each arrival ticks it (the HUD gets the
  drawn camera view from the stage to place the flame). Shown on a snuff, a stone read or a rest, then away. After
  an area's moth-stone is read, a line under it: `lamps out / all` of that area (`WORLD.areas`, `save.snuffed`).
- **Item line** (`hud/item-line.ts`): a grant's line (glade or hollow) in screen space, centred in the safe area
  at 0.8 of its height, so no view shape or camera position cuts it (it hung over her in the world and was clipped
  off the left edge by the glade's west wall). Glide now says "Hold jump as you fall to glide." (the held-jump rule:
  a hold from the take-off only opens the wings once she drops). The world views draw only the burst now.
- **Tatter at a rest**: a `patchRest` within 700 px turns its look to her, lifts it a little and stirs its wings
  once for ~3 s (`TATTER.rest`), at P1, P3 and wherever it sits.
- Story-camera framings are clamped inside the room at the beat's zoom (the glade's bask showed past its west wall).

## The root ladder and Tatter ahead (2026-10-18, level round 1 fe620a4)
- `marks.tatter.when` / `until` (story flags): Tatter is drawn only once / until the flag is in the save
  (`Tatter.present`, checked every frame through `CharacterRenderer.update(..., flags)`). The hub's Tatter is
  `until: wood-root-ladder`, its `want` the first bracket cap (96, 2656); after the ladder it is ahead of her at
  R8's p-dark, R10's P4 and R11's P5 (`when: wood-root-ladder`).
- `stage.rootFall` (R14 wood-caps): on the flag's `flagSet` (the trigger west of the cut root) the root falls
  away down the chute. `stage.ladders` (hub): roots hanging as ladders once the flag is saved (shelf face, and
  shelf up to the bracket cap).
- Floor bark (kit.ts): moonlight wells up through it (pale slits, a faint breathing column over it), so a dead
  end over a floor panel reads as a door (R9).

## Round 2 (feel review r2)
- The sim's held story beat (a trigger's `hold`, daccfee, memory/level-kit.md) is wired: on `storyHold` the beat
  that trigger's flag just started holds its framing as long as her input is held, and eases back on
  `storyHoldEnd` (stage-cam.ts). Still owed by the level (chunk redesign): the R2 vista trigger where she stops,
  with `hold`; the hub glimpse trigger's `hold`; ~250 px more ground under the hub floor.
- The dangler and the weaver are spiders in greybox (creatures.ts `spider`): abdomen, head, eight legs that tuck
  on the tell and splay in the drop, fangs as the danger part; the dangler's silk and its drop line in the tell.

## The director's area 1: moths to the oak, the crown cloud (2026-10-18, 5e31bee)
Contract with the builders (room data, render only; none placed yet):
- `marks.stage.oak {x, y, top, w?}` in **every room the moths should head for it from**, in that room's coordinates
  (outside the room is fine): `x` the trunk's middle, `y` the column's foot, `top` the crown ring, `w` the hollow's
  width (default 320). Freed moths (greybox/moths.ts `TO_OAK`) follow her 2.4 s, then steer to the trunk at up to
  520 px/s, climb the column spiralling and are gone at `top`; to an oak out of the room they fly toward it and fade
  over 5 s. Without an oak mark: the old follow-6-s-then-up-east. Where the oak stands in the room (the hub), the
  staging draws her freed moths climbing the column all the time (a quarter of `save.moths`, at most 48).
- `marks.stage.cloud {x, y, r, flag, to}` (the crown room): every moth she freed (`save.moths`, at most 600 specks,
  every ninth with wings) waits breathing in an ellipse `r` at (x, y); on `flagSet` of `flag` they lift off toward
  `to` along a rising curve over ~6-8 s. Once the flag is saved the cloud is gone. Give the trigger a `hold` and a
  `stage.vista`-style framing if the view should hold (stage-cam reads `storyHold`).
- Still to come: the throw arc while caught (the sim agent exposes the predicted arc on the player state).
- The glide reminder (hud/item-line.ts `REMIND`): in a room with `stage.twitch`, once she owns glide, the
  `twitch.catches`-th fall catch there and every third after show "Hold jump as you fall to glide." again (a
  human-like run looped R5's chasm 14 times in 21 s).

## Area 1 plan r3, render (2026-10-18)
- **The oak far** (staging.ts `drawOakFar`, `STAGING.oakFar`): in every room whose `stage.oak` lies outside it, a dark
  trunk + crown + pale ring in the sky layer, projected toward the real oak (nearer = bigger), x kept `margin` inside
  the frame, the crown's top kept in the sky part (`marginY`, `skyK`: the tree slides, height kept). In-room oaks skip it.
- **The finale**: `cloud.secs` (default 9) paces the lift; `cloud.view {x,y,zoom}` starts a `finale` stage-cam shot
  for those seconds, unless a `vista` shares the cloud's flag (builder 2's oak uses the vista, hold 9: fine). Either
  may frame up to `STAGE_CAM.skyAbove` (1600 px) over the room's top. The cloud's specks grow up to 2.5x as the view
  widens (else 1 px at zoom 0.5). MothCount holds on screen while `STAGE_BEATS.finale` runs.
- **Wing carpet** `stage.carpet {x0, x1, y, count?}`: hashed still wing chevrons on a floor (R10's pit).
- **Snatch** (`enemySnatch {lure}` from the rhythm hawker): one circler fewer at that lamp, 3 wing scales fall.
  Only shows where the lamp has `stage.circlers`.
- **Glide-lip assist** (`player.wingsHeld`, the sim opened her wings): a moonlit cup of air rises under her wings,
  then faint updraft streaks while held (`STAGING.wingsAssist`). An outline of the wings read as an X over her: no.
- **Cocoon pips** (character/cast.ts `COCOON_PIPS`): the three presses as the lure catch's pips, under the cocoon
  (the branch is over it), from 1.2 s; fade out after she breaks out.
- **Attack glyph** (greybox/lures.ts `LURE_GLYPH`): before her first snuff, 1.5 s in reach of a flame without a
  slash shows a "C" key cap over it, once a page load; gone on a slash, after 4 s or 0.8 s out of reach.
- **More than one Tatter** (`stage.tatters[]`, like `marks.tatter` plus `climb {path, lead?, speed?}`; character/cast.ts
  `TATTER_CLIMB`): the oak's second Tatter (from `wood-root-ladder`) climbs the root in pulls, ~420 px above her feet
  as she climbs (never back down), and sits by P5 at the path's end. It keeps its perched pose (no climbing rig yet).
- **The hatching tree far** (`stage.hatchTree {x, y, top, w?}`, oak coordinates of wood-hatch's trunk): a trunk, its
  long branch east with the cocoons, a crown, through the same projection as the far oak (`farPlace`); the crown's
  wide frame shows it on the west horizon.
- The glimpse holds for the trigger's whole `storyHold` (measured: zoom 0.5 from ~0.9 s to ~3.3 s after the
  trigger at hold 180); a `storyHold` only stretches a beat started the same frame.

## Area 1 round 4, render (2026-10-18)
- **Tatter leads** (`stage.tatters[].climb`): progress is her nearest point along the path plus `lead` (a floor path
  walks, a root path climbs in pulls); `vanish: true` fades it out at the path's end (a door) and it stays gone this
  session. The oak's first visit: builder 2's floor path to the east arch. R8's "walks into the dark way" needs the
  builders' mark (a path ending in the tunnel's door, `vanish`).
- **Tatter's halo**: below camera zoom 0.8 a pale disc behind it (full at 0.55), so it reads as someone among the
  moths in the finale. The hatching tree far is drawn only below zoom 0.8 (it hung in the hollow at play zoom).
- **The finale frame** (oak vista): x 3100, y -60, zoom 0.6; a sky beat may look `skyAbove` px past the room's top and
  sides, so the valley east of the rim is in frame; the valley's lights moved past the rim (x 3920-4560, y 620).
- **The crowd at the far oak's crown** (`STAGING.crowd`, `areaShare`): the area's freed share of moths as specks
  round the far oak's ring, which brightens with it. In the oak itself the crown cloud is `save.moths`.
