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
