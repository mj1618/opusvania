# Signature-mechanic rendering (L3 readability, brief §5)

Code-drawn Pixi Graphics; render only reads sim state/events.

- **Files:** `src/render/palette.ts` (colour tokens, per-colour vibration, draw constants `SIG`,
  colour maths + `paletteChecks()`; pure TS so tests import it), `src/render/outline.ts` (one draw fn
  per source status: `drawHumming` / `drawGhost` / `drawPending` / `drawStatic`, dashes, hum waves,
  `rngFor(frame,id)` render RNG), `src/render/signature.ts` (world layer: plates, gates, object
  sources, levied, enemies, tethers, count ring, sparks, feather motes; `kidTint/kidScale/kidAlpha`),
  `src/render/hud.ts` (bag slots, NEXT caret, weight needle, Chin pips, take/push/snatch ribbons).
- **Hooks in world.ts**: `sig.back`, the player, `fxFront` and `sig.front` live in the unlit
  `gfx.layers.actors` (above the lit terrain); `sig.glow` is in `gfx.layers.emissive`;
  `sig.lights(out)` is a `gfx.lights` provider. `bagHud.container` in `screen` (hidden with
  `gfx.set({ui:false})`, since its Text differs across machines in goldens). `sig.step`/`bagHud.step`
  in onStep, `reset()` in syncRoom, `draw` after drawPlayer (before `gfx.draw`, which renders lights).
- **Atmosphere (after the gfx merge):** humming object sources, humming levied and armed enemy voices
  draw an emissive copy (outline + faint fill; bloomed) and push a light in `NOISE_COLOURS[c].light`;
  a winding-up telegraph's glow rises to `SIG.glowTeleAlpha`. Ghost, pending and white static get
  neither. `NOISE_COLOURS.core` *is* the `PALETTE` token (unit test), so outline, glow and light
  can't drift. Lit, the sources went to ~40% brightness and E1 failed (ghost ratio 1.17, brown
  contrast 1.6:1): readability-critical shapes must stay out of the LightingFilter.
- **Determinism:** feedback state (flashes, shake target, sparks, ribbons, needle, gate-open frame) is
  stepped in onStep. Vibration, speckle and motes are functions of `state.frame` (Math.sin is fine
  in render). Hit/catch sparks moved to the impact director (combat-juice.md), which animates through the hitstop; ribbons don't freeze (they are UI).
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
- L4 combat render (src/render): `kid.ts` (now only the Seize hand from her glove, Swallow ring, Count ring, sparks; her body/gloves/strikes are the rig, memory/rig.md),
  `enemies.ts` (posed bodies, voice rings: open = marching dashes, the attacking voice dominates a
  wind-up), `combat.ts` (Count ring, REPOSSESSED stamp, Kid's Count, CLEARED), `shots.ts`,
  `glyphs.ts` (keycap prompts from `room.prompts`), `sparks.ts`; HUD adds chinMax, Lien seals,
  Ringing pip, Poundage, boss bar + fever. Study-clip lesson: stacked voice rings of one colour
  family hide which attack is coming, so the non-attacking rings go thin during a telegraph.
