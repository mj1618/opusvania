# Signature-mechanic rendering (L3 readability, brief §5)

Code-drawn Pixi Graphics; render only reads sim state/events.

- **Files:** `src/render/palette.ts` (colour tokens, per-colour vibration, draw constants `SIG`,
  colour maths + `paletteChecks()`; pure TS so tests import it), `src/render/outline.ts` (one draw fn
  per source status: `drawHumming` / `drawGhost` / `drawPending` / `drawStatic`, dashes, hum waves,
  `rngFor(frame,id)` render RNG), `src/render/signature.ts` (world layer: plates, gates, object
  sources, levied, enemies, tethers, count ring, sparks, feather motes; `kidTint/kidScale/kidAlpha`),
  `src/render/hud.ts` (bag slots, NEXT caret, weight needle, Chin pips, take/push/snatch ribbons).
- **Hooks in world.ts** (kept minimal for the parallel post-FX work): `sig.back` sits under fxBack,
  `sig.front` over fxFront, `bagHud.container` in `screen`; `sig.step`/`bagHud.step` in onStep,
  `reset()` in syncRoom, `draw` after drawPlayer; drawPlayer multiplies scale/tint/alpha from `sig`.
- **Determinism:** feedback state (flashes, shake target, sparks, ribbons, needle, gate-open frame) is
  stepped in onStep. Vibration, speckle and motes are functions of `state.frame` (Math.sin is fine
  in render). Sparks freeze during hitstop; ribbons don't (they are UI).
- **Status rules:** object `ghost` flag → dashed; `pendingSolid` → blinking dashed; white → static.
  Enemy outline per voice (solid+vibrating if home, dashed + mouth "X" if away); a disarmed enemy's
  Snatch telegraph must NOT draw a solid ring (it read as re-armed in the Pit clip). Slab `solid`
  false → dashed (it is non-solid for a few frames after landing while Kid overlaps it).
- **`__game.render.rects()`** = `WorldRenderer.rects()`: canvas px (world + `world.position`) as last
  drawn. Ids are **source ids** for objects, levied and enemies (enemy `id` = `enemy.source`), slot
  index for `kind:'slot'`; also a `kind:'player'` rect (used to mask Kid out of pixel samples).
  Statuses: humming | ghost | pending | white | flight | telegraph | down | count | repossessed;
  slots empty | full | next.
- **E checks** (`tests/e2e/signature.spec.ts` → `progress/l3/e-checks.json` + PNGs): checkpoint
  frames are planned with `__game.headless({start: save(), inputs})` (no rendering), then reached
  with one `step(n)` each (CI renders ~1 fps). cp1–3 use `tests/replays/lot-7.slab.json`; cp4 spawns a
  Barker at (1150, 960) in the-pit and catches it (`R1 .72 S1`). Violet has no L3 source, so E1 uses
  its token. E3: the take starts a 5 f hitstop, so "next step" = first step Kid moves (6th).
- Pit script without spawn that catches the floor Barker (good for clips): `L30 .84 L+S1 .200`.
