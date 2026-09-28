# Kid's cutout rig (src/render/rig)

Kid Tallow is code-drawn: no sprites. Render only; stepped once per sim step in `WorldRenderer.onStep`,
reset with the room (so clips and restored snapshots redraw identically).

- **Files:** `look.ts` (colours, body sizes, chain specs, `ANIM` timings: tune here), `pose.ts` (pure
  `targetPose(state, memory)`: one function per state/move, blended with `mixPose`, smoothed by
  `followPose`), `skeleton.ts` (IK solve, rig space -> world: squash, spin, mirror), `body.ts` (paint
  order + emissive accents), `prims.ts` (primitive list, rim-outline pass then fills), `chain.ts`
  (verlet: coat tails, feather, ponytail, sack), `index.ts` (`KidRig`: events -> memory clocks, chains,
  glove trails, strike smears, Slip afterimages, death cap, Count stars).
- **Rig space:** origin = feet centre, +x = facing, +y down; hitbox is x -20..20, y -80..0. Unit test
  (`tests/unit/rig.test.ts`) keeps the core inside it and each strike's glove inside its hitbox.
- **Honesty rule:** a strike's glove aims at the far end of the move's real hitbox (`KidRig.reach`),
  the arm stretches up to `ANIM.armStretch` on hot frames, and the smear + whoosh front cover the rest
  of the box. Timing is `movePhase(move)` from content/moves.json, so frame data changes animate right.
- **Facing gotcha:** the stick can flip `player.facing` mid-move; the move keeps `move.facing`. The rig
  uses `move.facing` while a move runs (the jab once punched backwards through her own body).
- **Hitstop:** pose clocks and chains freeze (no `hitstop` event this step = frozen); the hit flash
  has its own counter (`hurtFlash`) so it doesn't last the whole freeze and hide the recoil pose.
- **Silhouette paint:** every body shape goes in a `Prims` list; `paint` draws one rim pass (cream
  outline, gold during a Counter) under all fills, which is what makes her read on dark districts.
  The same list paints flat for afterimages (pooled Graphics with node alpha, so overlaps don't
  stack), the hurt/catch tint, the gym death swell and the hazard flash.
- **Anti-aliasing:** the canvas has no MSAA, so `rig.node` has an `AlphaFilter({resolution: 2,
  antialias: 'on'})` (2x supersample of a small area). Cost ~+0.5 ms on high in the bench.
- **Glow budget:** anything in the emissive layer blooms a lot. First passes (cone smears, sack
  glow r 1.6R, held orb r 9) turned into white bars and pink balloons; keep glow shapes small and
  let the fills carry the shape.
- **Dash-ready light** moved from the old blue band into the cap feather (blue = air dash ready).
- **Review tool:** `npm run rig:shots` (tools/rig-shots.ts): close-up follow-cam frames, sheet, log
  (`clips/rig/<name>-log.txt`: state, move frame, events per file) and optional mp4. Options:
  `--tape`, `--setup js`, `--hook "N:js"` (edit state mid-clip, e.g. put a voice in the bag while
  down), `--skip`, `--crop WxH --zoom`, `--follow`. Rise-from-the-Count recipe in ring-barker:
  setup `chin=1`, hook a home sound into the bag + `down.canRise=true`, press J on beat 4.
