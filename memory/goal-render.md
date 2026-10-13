# The goal, render side (lanterns, heart, ending)

Rules are in goal.md. Code: `src/render/goal/` (`index.ts` GoalRenderer, `lantern.ts`, `heart.ts`,
`camera.ts`, `config.ts` = `GOAL` knobs, `logic.ts` pure helpers, tested in `tests/unit/goal-render.test.ts`),
HUD parts in `src/render/hud/` (`progress.ts` pips, `summary.ts`, wallet drain in `index.ts`).
Dev handle `__goal` (`.cfg`, `.cpuMs`). Sheets of every moment: `shots/goal/`.

## How it is built
- Layers: `goalLight` (after `airBack`, behind the playfield: additive waves), `goal` (after `pickupsBack`,
  behind the hero: objects + their lights), and the front batch is a child of `layers.pickups` (over her).
- Objects are Pixi Graphics drawn once (crisp at zoom 6); all light is quads in `GlintBatch` meshes
  (`K_SPARK` bead / motes, `K_FLARE` halo / waves). A fourth batch sits between the heart's rear and
  front straps so a shut bud leaks light only through its seams.
- Everything reconciles from `sim.goal` each frame (restart, state jump = no ceremony); events only start
  the moments. A lit lantern registers light `lantern<i>` (radius 240, intensity 1), the catch a second
  light `lanternSwell` that grows 200 -> 600 px and dies in 1.25 s, the heart `heart`.
- Kindling: `streamCount(channel, of, cost)` glints have left her by frame n (all by 72% of the channel);
  the HUD subtracts the same number from the count, so the wallet drains in step and lands exactly on
  the sim's value when it catches. A cancel just lets the count tick back up.
- Camera (`GoalCamera`, added in stage.ts next to the kick, follow camera only: a `__game.cam` override is
  left alone): wake = a lean of up to 54 px toward the heart for 1.9 s; ending = zoom 1.045, 30 px up,
  6% toward the heart, driven by `goal.ending.frames`. Clamped inside the scene.
- `?nopickups` now also drops `lanterns` and `heart` (main.ts): clean plates have none of this.

## Look decisions (learned by looking)
- Lantern = shepherd's crook + hanging seed of glass (the HUD health light's shape, 1.42x). Lit, the
  nested amber fills read as a flame inside dark glass; filling the whole seed made an orange blob.
- A dark object on a dark stand turns into a wire drawing of its own rim strokes: the fill must be
  clearly darker (centre zone: near-black green) or clearly lighter than what is behind, and rims thin.
  First heart bud (pale straps with grain lines, as tall as her) read as a line-art onion: now 0.8 size,
  three fill tones (rear / flank / front), no grain, one faint edge per strap.
- She stands in front of the bud at the ending and hides its light, so the light lifts out of it
  (`heart.lift` 172 px) and settles in the moth carving of the shrine. Keep that number with the statue.
- The wake's wave (`heart.wave`) is two tall flares behind the playfield moving at 2300 px/s: at gain
  0.11 nobody could see it, 0.3 tinted the whole mist stage, 0.24 stands.
- The far ledge's camera already shows the shrine, so the wake is seen directly there; from the other
  two lanterns the wave, the drifting motes and the camera lean carry it.
- HUD pips are standing line crooks, half the size of the hanging health seeds, in their own row
  under the count, then a bud for the heart: never confused with health at 1280x720.
- Cost: CPU under timer resolution, frame time +0.05-0.2 ms at 1920x1080 with all three lit (noise level).

## Not done / weak
- `heartSleep` is quiet: she covers the bud while touching it; the wicks carry it.
- Vesper has no kindling, resting or ending pose yet (`player.kindling`, `goal.lanterns[i].rest`,
  `goal.gathered`); the glints leave from `cy - 8`.
- Dormant glints are not woken by a lit lantern (they belong to the pickup renderer); at the ending a
  soft flare is laid over the waiting ones in view.

## Capturing
`playwright-cli -s=<name> eval` with one async function that steps and `drawImage`s the canvas into a
sheet canvas, returning data URLs. Wallet: teleport onto waiting pickups (`p.x, p.y + 40`, `step(3)`
each), then `step(80)`. Stand within 24 px of a lantern's x or her box misses the 48 px trigger.
