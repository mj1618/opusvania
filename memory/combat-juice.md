# Combat juice (src/render/juice, src/render/creatures.ts)

Render/audio only; no sim change. Numbers: `src/render/juice/tuning.ts` (`IMPACT` per hit class, `JUICE`).

- **Impact director** (`juice/impact.ts`, pure TS, stepped in `WorldRenderer.onStep`, reseeded by
  `reset()`): streak sparks, star flash, rings, comic words, speed lines, ink splat, sprung
  directional kick + trauma shake (added to the camera in world.ts; the camera module has no hit
  trauma of its own), zoom punch, impact frames, aberration, slow motion. Sparks/stars keep
  animating through the hitstop on purpose (a frozen spark reads as a still).
- **Impact frame** = `uImpact.x` in the post shader: two-tone negative (bright -> ink, dark -> hit
  colour) for 1-3 steps on heavy/counter/catch/repossess/bossPhase. `uImpact.y` = slow-mo drama
  (desaturate + contrast). Without post (low tier) a flat colour flash is drawn instead.
- **Render zoom**: `gfx.zoomRoot` holds the light-map sprite, the scene and the overlay, so lights
  and filters stay registered when it scales (UI is outside). `FrameInput.zoom = {z, ox, oy}`
  (screen = unzoomed * z + o). `rects()` and the bag HUD map through it. Two zooms compose:
  **combat framing** (eases to fit Kid + engaged enemies within 900 px, max 1.6; Kid is clamped
  160 px inside the frame) and the **punch** (about the impact). Zooming in about a point inside
  the view never shows past the camera's room clamp, so no void.
- **Slow motion** is render time dilation: `renderer.timeScale()` scales the wall time fed to the
  fixed-step loop (main.ts); the sim takes the same steps. It starts only after the hitstop ends.
  In manual mode nothing changes; `npm run clip -- --slowmo` renders extra interpolated frames
  (`screenshot(scale, {alpha})`), so frame files outnumber sim steps.
- **Sound made visible** (`juice/soundviz.ts`): tear ribbon on seizeTake (reverse on bagPush/
  snatch), hum rings (stateless, per colour), voice arcs from the mouth (speed up with a wind-up),
  levy trails, white static crackle. Tear life is 19 steps: at 24 the ribbon was still over the
  ghost at E1's cp2 (20 f after the take) and the ghost ratio rose 0.34 -> 0.395 (limit 0.4).
- **Creatures** (`creatures.ts`): per-type body colour, walk phase keyed to x, blink, hurt face,
  anticipation poses; `drawEnemy` takes a `toWorld` (the posed body transform) for mouth/eye cues
  (voice arcs, telegraph glint, dizzy stars). REPOSSESSED = deflate pose + drained colour + stamp.
  The Auctioneer's patter words are stateless (every 26 f, 3 lanes); they stop when his Patter
  voice is taken or he's down. Words have priority: the boss phase line isn't talked over.
- **Audio**: sounds may set `reverb` (send 0..1) for tails; `PlayOpts.delay` sequences one-shots
  (sack pop 0.25 s after the rip, the coin shower). Hits are thump + crack + body + tail layers.
- **Clips with sound**: `npm run clip -- --audio` records each step's events + a slim state and
  renders them offline through the real router (`renderTrack` in src/audio/offline.ts), then muxes.
  `--setup "<js>"` runs with `g` = `__game` before the script (spawns). Showcase:
  `tools/showcase.sh [scale]` -> clips/showcase/combat-juice.mp4 from the golden fight tapes.
- Looking at frames: clip `--keep-frames`, then crop/tile with `magick` (`montage` needs
  ghostscript fonts, which aren't installed; use `+append`/`-append`).
