# The moth swarm (src/render/swarm/, 2026-10-17)

Scene 1's river of moths: Wing's kind, leaving without her (docs/design/scenes/01-look-target.md §5).

## How it works
- **Three instanced meshes**, one per depth layer, each in its own layer-tree container: `swarmFar` (parallax 0.4,
  drawn just after `mid` so the big trunks never hide the river), `swarmMid` (0.75), `swarmNear` (1.2, before
  `foreground`: blurred moths that pass in front of her). Real GL instancing: a 4-vertex quad + per-instance
  `aA` (phase, speed, lateral, rank) and `aB` (seeds, size), `instanceCount` on the Geometry (Pixi 8 supports
  it; name the corner attribute `aPosition` so Pixi's bounds code finds it). 700 / 260 / 9 moths.
- **Everything about a moth is a pure function in the vertex shader** of its seeds, `tau` (seconds since the
  swarm started) and the render clock: no CPU per moth, reproducible stills. A moth runs along the path
  (`w = fract(phase + tau * rate)`); each trip is a "cycle"; it is alive on a cycle only if its rank (re-rolled
  per cycle) is under the **feed** at the time that cycle entered the path. So the river's head flows in from
  the back, gaps and knots travel with the flow, and the tail dries up from the back: nothing pops on screen.
  On top: two travelling density waves (1.5x the flow), a band that breathes (knots and necks), lateral
  wander, darts (5%), loops (3.5%), stragglers (8%: band edge, slower), flutter, a glide now and then.
  Heading = velocity of the smooth motion (two evaluations, 0.06 s apart).
- **The CPU runs a behaviour** (`paths.ts`), which decides the **frame point** (world px) the path is drawn
  around, the **formation blend**, and the release time. A formation = 8 control points in frame space (view
  px from screen centre at zoom 1; the moon is at frame (460, -350)) + band half width + a speed weight
  (low = moths dwell there). Catmull-Rom through them; a time table makes the speed weights real.
  Each layer places the frame at its own parallax: `layerPos = anchor + (F - anchor) * p + offset`.
- **Scene 1's behaviour, `river`**: `pass` (head into view ~1.2 s after `hatch`, arcs across the moon, densest
  ~3-7 s) blends to `lead` (6.5-11 s: a thinner stream ahead and above, x 0.6-0.95) and, once her x passes
  `promise.x0 - 760` (or the drifting frame does), to `cross` (anchored on the room's `promise` camera mark:
  dips over the gap toward the far branch, climbs away east) while the feed dries up. The frame follows the
  camera with a spring that also takes the camera's speed (no lag at her 576 px/s run), never goes back, and
  drifts on at 55 px/s when she stands still: it never waits for her. After the release + a slowest trip it
  stops drawing.
- **Events**: `hatch` starts it; `roomEnter` (or a fresh state, frame count going back) stops it until the
  next hatch; a teleport (`spawn` mid-run: the capture tools) starts it late (`lateStart` 14 s, the thin
  lead stream) or snaps the frame. A room without `marks.swarm` has no swarm; without `hatch`, it starts late.
- **Look**: silhouettes, side-on-ish wingbeat (`flap.tilt` 0.95: both wings up, then both down; the far wing
  sits 0.09 back so two show). Shapes are implicit functions AA'd with `fwidth` at any size (far moths come out
  as specks that flicker with the beat; a min dot radius keeps them from vanishing). Moon-side rim (1 px,
  never on antennae), a sheen on the moon-side half of the wings that comes and goes with the beat (only away
  from the moon: backlit they stay dark), a faint membrane light on the halo, a rare glint. Never warm.

## Knobs (`SWARM` in config.ts, live as `__fx.swarm`)
`period`, `spread`, `feed` (headStart, rampIn, peakEnd, decline, tail, releaseFade), `gaps`, `waves`, `neck`,
`blend`, `follow` (drift, omegaX/Y), `release` (before, omega), `dart` / `loop` / `straggle` / `wander`,
`flap` (amp, tilt), `sheen` (gain, floor, rim), `colors`, `halo`, per layer: count, size, speed, band, dx/dy,
flutter, beat, blur, haze, alpha, rim, peak/tail. Formations: `FORMATIONS` in paths.ts.

## Debug
- `__swarm.info()` (tau, release, frame, cpuMs); `__swarm.start(tau, hold)` restarts it `tau` s in (0 = head
  coming into view); `hold` = never release (look at the pass under the moon anywhere: e.g. `g.cam({x:2700,
  y:800}); sw.start(0, true); g.step(360)`).
- `__fx.swarm.debug.lineup = true` puts every moth of each layer still in a grid round the view centre: hide
  the other layers, set `colors.body` pale, zoom 4-8, and look at the shape and the beat frame by frame.
- Counting moths on screen: hide every layer but `swarm*`, post off, body / sky / rim colours pure red, and
  count connected red blobs (a scratch numpy script). Peak pass ~230-300 blobs (a few are split moths).

## Cost (M5 Pro, 3840x2160, all ~970 moths, pass peak)
GPU: frame time with the swarm on vs off differs by <= 0.1 ms (the timer's resolution; method in
post-and-air.md "Timing"). CPU: < 0.1 ms (uniforms only). Budget was 0.3 ms GPU / 0.1 ms CPU.

## Gotchas
- A thin shape is "all rim" if the rim is a shifted-coverage test: keep the rim 1 px and constant; a
  halo-boosted rim made the moths near the moon pale paper scraps.
- Lit wings in front of the moon are wrong: the moon is behind them. Silhouettes there, light only away.
- Top-down wing shapes (bow ties) read as arrowheads / mantas at 15 px; the side-on beat reads as a moth.
- `SAFE_W/2, SAFE_H/2` in index.ts is the view centre on every window shape, not a cull: nothing is culled,
  and every formation reaches past the widest view (VIEW_MAX_W 2592 -> +-1296 from centre).
- The release can come before the `lead` blend finishes: she runs the branch in ~5 s.

## Adding a behaviour (lamp swarms, freed moths later)
Add a formation (8 points; a closed loop works the same, with the first and last points meeting) and a class
like `RiverBehaviour` that returns a `SwarmPlan` (frame point, path, tau, release). For many swarms at once,
give each its own mesh set or move the plan into per-instance attributes (a behaviour id + its own frame).

## Weak (judged harshly, 2026-10-17)
1. It does not yet read as a river at a glance in the current wood: the sky behind the path is mostly dark
   canopy, and the moths read by rim only. Needs the opened sky / moon of the wood background, then a retune
   (more mid moths on the bright sky, maybe a faint haze band along the river's core).
2. The moon crossing is only seen with a camera override today (the opening frame's canopy hides the moon).
3. Far specks can look like rain or sparks (1 px rim slashes) rather than moths.
