# Camera (src/render/camera)

- Pure TS, stepped once per sim frame via `Game.afterStep`; renderer interpolates prev/curr camera
  (view centre and zoom) with the same alpha as the player, then snaps to whole screen px. Constants
  in `src/render/camera/tuning.ts`.
- Pipeline: zoom (spring) -> x dual forward focus (flip after 48 px the other way) -> y platform
  snapping (target only updates when grounded, wall sliding, or feet outside [0.25, 0.72]) / fall
  follow (vy > 12) -> look up/down (376 px, ~35% of the view, north-star §3.1) -> seam bleed ->
  zone / declared shot -> clamp (room + bleed) -> (pre-shake view, used by tests) -> shake + kick.
- **Units:** room px. The view is `VIEW_W / zoom` x `VIEW_H / zoom` world px; `viewSize`,
  `viewCentre`, `inView` know the zoom (never use `cam.x + VIEW_W` for the centre: audio did).
- **Zone blending** is a decaying offset, not a lerp toward the zone view: at a framing change
  (zone change, shot start/release, seam) `rebase()` stores `view − clamped(new target)`, which
  decays by zoneLerp per frame, capped at `zoneBlendMaxPx`. Measure and apply it on the *clamped*
  target (L2 playtest P1: adding it to the unclamped target turned blends into 300–400 px cuts).
- **Horizontal follow** is capped at max(`panMaxX`, `panMaxVxMult`·|vx|). Effective lead at full run
  ≈ lookahead − vx/lerpX.
- **Trauma is squared**: trauma < 0.45 is under 5 px (invisible). Hard land 0.55, death 0.8.
- C3 (feet within [15%, 85%]) is checked only when room bounds didn't clamp y. C5: 90% of look within 32 f.
- Headless Chromium produces a frame right after timer tasks (no vsync), so the e2e latency test reads
  ~0 ms; it asserts the press is visible in the next rendered frame instead. Real displays add 1-2 vsyncs.
- Combat hits add no camera trauma here: the impact director (combat-juice.md) adds its own
  kick/shake and a render zoom (`zoomRoot`, zooms IN about a focus) on top of the camera's view.
  The two compose: world px * camera zoom - snapped offset = unzoomed screen px, then the render
  zoom (`FrameInput.camZoom` vs `FrameInput.zoom`; `composeZoom` takes the camera zoom).

## L6: seams, zoom, shots, beacons (tests: tests/unit/camera-world.test.ts)
- **Seams (edge exits):** while `state.transition.offset` is set the camera remembers it
  (`edgePending`); on arrival `crossSeam` translates every room-px field by −offset and rebases, so
  the view keeps its world position. `WorldRenderer.syncRoom(room, seam)` keeps the camera and
  translates `prevCam` too; edge transitions never fade (doors and deaths still do).
- **Bleed:** near an exit the bound on that side relaxes by `viewHalf + bleedPadPx − distance(player
  centre, exit span)`. Both rooms apply the same rule, so the target is the same on both sides of the
  seam. `bleedPadPx` must exceed lookaheadX and lookUp, or the bound bites at the seam.
- **Zoom:** `zoomTarget` = shot zoom, else zone zoom (`zoom` field, else open 0.9 / vista 0.8 / 1.0),
  floored at 0.9 while any enemy in the room has hp > 0, clamped 0.75–1.1. Critically damped spring
  (omega 0.1: ~95% in 50 f, no overshoot, exact snap at the end so a settled view is shimmer-free).
- **Render with zoom:** world layers are scaled by zoom and placed at `-round(cam * zoom)`
  (`snapView`): integer *screen* offsets, not integer world px, keep a zoomed view stable. Lights
  (`LightSystem.render(..., zoom)`), bloom (matrix scale), the bag HUD and `rects()` all take the scale.
- **Declared shots:** a zone's `shot` starts on entering the zone (once per session per
  `room#zone`, unless `repeat`; `shotsSeen` survives doors and loads), frames the shot centre at the
  shot zoom (default: fit the rect), counts `hold` frames once framed, then releases. The framing
  keeps Kid inside `shotPlayerMargin` of the view: a shot rect far from the mouth frames the edge
  nearest Kid, so author shots within ~0.4 view of where they trigger.
- **frame** zones pull the free view toward `value` by `weight` (no lock).

## World-anchored rendering (src/render/gfx: worldspace.ts, peek.ts, beacons.ts, backdrop.ts)
- **Neighbour peek:** every world room within 2 views is drawn at its world position (terrain, lamps,
  glow, lights). Terrain is drawn once per room into a `GraphicsContext` (`RoomViews`, LRU 16);
  crossing a seam swaps contexts, no re-tessellation. **Apron:** solid `terrainDeep` wherever no
  world room is, so a view past a seam is rock, never sky.
- **Backdrop:** generated over the room's *region* box (id prefix; seed = hash of the region), each
  room bakes only the window its camera can reach (texel-snapped). A layer point u lands at
  `VIEW_W/2 + (q(u) − viewCentreX·f)·zoom` (see `BackdropFrame`); for non-world rooms this reduces to
  the old `−camX·f − MARGIN`, so gym goldens are unchanged. Same region + district across a seam =
  identical picture (silent swap); otherwise the old backdrop crossfades out over 30 f.
- **Beacons:** landmark `beacon` kinds bell/board/scale/glow are drawn live in the bg (after far2,
  before mid, farthest first) at `VIEW_W/2 + (bx − viewCentreX)·depth·zoom`: true position when the
  view is centred on them, parallax elsewhere. Pick a small depth (0.1–0.15) for a far tower seen
  from many rooms, ~0.4 for a big near sign.
- Particles are a screen-space field keyed to the *world* camera and carry on across seams.
- **Camera lab:** draft rooms `camlab-lane | camlab-square (vista + shot + Board/Bell beacons) |
  camlab-pit (frame zone, n/s seam)` at world x 500..650 (moved +200 at the final merge: they
  overlapped the proof region). The section sheet is not in the repo: `npm run world -- section
  export camlab`.

## Open (not done in L6)
- Juice/sig/kid/combat renderers still `reset()` on every room change, so dust and FX vanish at a
  seam (their owners could translate by the camera's edge offset instead).
- Neighbour peek draws terrain only: no enemies, sources or door labels in the neighbour; ambient
  particles are hidden over the neighbour's air (solidAt only knows the current room).
- A seam into a new region rebuilds the backdrop synchronously (a hitch, unmeasured); prebake the
  neighbours' backdrops if it shows. Low tier does not cap zoom (it would break clip determinism).
- Speed-scaled lookahead for Slip chains (level-toolchain §5.4) and the world-PNG view rectangles
  per zone (§5.6) are not built; the PNG draws zone labels with zoom and the shot rect.
