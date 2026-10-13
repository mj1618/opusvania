# Character skin: Vesper, the moth (`src/render/character/vesper/`, `?char=vesper`)

Slender moth-person; wings worn as a cape. Imports `../hooded/math` and `../hooded/paint`; `chain.ts`
is a copy of the hooded chain plus a per-segment `extra` angle and a `dragK`.

## Design decisions (owner feedback, do not undo)
- **Face = a pale heart-shaped fur disc (barn-owl style) with two big gold eyes and nothing else.**
  No nose, mouth, brows, pupils, liner. Earlier tries that failed: a narrow pale face with chin tufts
  (skull with a beard); dark brow locks over the eyes (sunglasses / angry V). Outer eye corners are
  slightly *raised* (relaxed, sure); lowered corners read mournful, which the owner rejected.
- **No scarf.** Anything pale hanging by the torso reads as an arm. A short fur ruff at the neck only.
- Antennae are thin shafts with a narrow vane; comb barbs read as fishbones, wide vanes as rabbit ears.
- Pale colours must be authored dark (face 0x8c8490, fur 0x6f6978): bloom + the light mask near
  her own `ember` light push anything paler to white. Judge in `shots`, never by hex.

## How it works
- `rig.ts`: hooded-style 2.5D rig, retuned. Run = lope: `RUN_CYCLE` 256 px (a footfall per 128 px,
  NOT the sim's 96 px `step` event), stance 18% of the cycle, so both feet are off the ground ~60%
  of the time; feet still plant (tested). Lean, curl, head pitch and hip twist each chase the blended
  pose through their own spring (overlap down the spine); hands go through `Drag2` (world-space
  spring, soft-clamped) so they trail and overshoot on every start, stop, jump, landing.
- `wings.ts`: each wing = 5 strand chains (leading .. trailing edge), rest shape = folded cape.
  States are tables of per-strand lift (STREAM, RISE, APEX, GLIDE, DART, WALL_FREE, BEAT_UP/DOWN)
  blended by rig weights; roots slide from the shoulder line to down the back as `spread` rises.
  Ripple goes into the chains' `extra` rest angles (so the cloth filters it). Mid-turn the two wings
  splay to either side (`lat`). The far wing rides higher when open so fore/hind both read.
- `draw.ts`: wing = 13x13 `Painter.grid`; columns are re-sampled along their length for scallops
  and, with `open`, a fore/hind notch. The eye-spot is painted at a grid cell so it foreshortens.
- `fx.ts`: gold motes that rise (buoyant), short comet trails from antenna tips and wing hem
  (only when the point itself moves fast), land/skid dust. Light `ember` = midpoint of the lantern tips.

## Gotchas
- Wing strands have no body collision: a stiff, fast wingbeat throws them over the head and they
  come down in FRONT of the body. Keep the beat's stiffness boost low (0.5) and BEAT_UP <= ~-112 deg.
- Fast vertical motion: chain drag is relative to still air, so high drag blows wings straight
  up/down regardless of the rest shape. `dragK` is cut in the air and in the dash for that reason.
- Do not rotate the wing rest frame by the dash's 1.2 rad lean (`rot` is scaled by 1 - wDash).
- `tools/shots.ts` / `clip.ts` drop a query from `--url`; use `--url "http://localhost:5180/?char=vesper&z="`.
  Clips fail at random while other agents' edits trigger HMR reloads: retry.
