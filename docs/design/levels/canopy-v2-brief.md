# The Canopy v2: builder brief (round 1 of the review loop, 2026-10-30)

Matt: "keep looping (implement, review, implement) until it's reference game level quality". Round 1's review scored
v1 3.5/10 (`docs/design/levels/reviews/canopy-r1.md`): read it whole, it is the spec for this round. Its verdict:
the references are **mass with rooms carved out**; v1 is open sky with logs, six rooms all on one road, the peak at
minute 2, visible and weak secrets, flat-log fights, one look everywhere, a flat end.

Read first: `CLAUDE.md`, `memory/canopy.md` (how v1 is built, every placement rule and gotcha), `memory/world.md`
(exits, linking, routes), `memory/level-kit.md` (bark, thorns, gates, caps, covers, triggers, catches),
`memory/creatures.md` (kinds, placement, `wakes`), `memory/movement-controller.md` "Reach", `docs/design/levels/first-area.md`,
`docs/design/reference-levels/README.md` (the numbers), `tools/levels/canopy.ts` (v1 generator: the `Wood` helpers),
`tools/solve/canopy.ts` (the proofs), `src/render/scene/lib/pf-mass.ts` (new).

## New since v1 (already in the tree)
- **Mass:** solids tagged `root` or `ground` in a wood room are painted as bulk (heartwood / root / packed earth: a
  mossy walkable top flush with the collision, lumpy flanks, roots, a ragged underside with hanging roots), not as
  limbs (`pf-mass.ts`, `isMass` in pf-branch.ts). Add a `mass(x, y, w, h, tag = 'root')` helper and use it to enclose
  space. It has never been seen on screen: shoot it early and fix pf-mass.ts until it looks like the wood kit's own
  painting (the art bar: `docs/design/art-direction.md`), not a box.
- Covers in wood rooms draw as a dense leaf mass (`leafCover` in render/lantern/kit.ts). The review wants a cover to
  look like the mass it sits in: where a cover sits in mass, paint it as that mass (a section of heartwood) instead.
- Rewards that matter: hollow upgrade `moonDrop` = one more light (health) per hollow (src/sim/upgrades.ts; also
  `glowVessel`, `moonstep`, `longBreath`: read what they do). Moth-stones draw the map (world `areas`).

## The build: do review problems #1 and #2 together, then #3-#10
Rewrite `tools/levels/canopy.ts` as v2 (keep `cn-` ids where a room keeps its role; the hatch `cn-hatch` stays as is).
Target, from the review and the reference numbers:
- **~20-24 rooms of 1.5-5 screens, at most 60% on the critical path**, 8-10 one-exit pockets each paying something
  that matters (moonDrop lights, a moth-stone, a seed, an upgrade, a big hoard behind a real wall). Generate exits
  from a link table (one place lists room pairs and the shared opening; the helper writes both mirrors with equal
  spans), as the Downwood generator did (`tools/levels/downwood.ts`), so twenty rooms stay consistent.
- **Mass everywhere but 2-3 vistas**: solid at least ~30% of room boxes (the references 35-50%); ceilings over
  fights, walls that hide secrets, root floors instead of free catches in at least half the rooms.
- A suggested plan (change it if you find better; keep the claws-then-glide order and the two shortcut loops):
  hub (seed door raised into view from the landing, ~y 1750; a socket lamp per seed; the high west limb reads as a
  lock) | west: the descent inside a fallen hollow trunk (thorns, the lampwing over them, seed 1 in a side alcove
  room), the rot hall (crawlspace pocket), the Elder well (claws, a pocket west of the Elder with a moonDrop), the claw
  ambush hollow (closed, burrback pair + lampwing within 600 px, woken by the claws, the claw face its way out), the
  upper limbs (gaps at the jump's edge, rises, a kick between trunks) back to the hub's high limb | east: an open
  fork room from the hub (juveniles; a bark floor down to a root-cellar pocket with a moonDrop; a mothstone pocket),
  the **Grove behind a claw climb** (option (a) of review #3) at grove density as a closed arena-pit with tiers, then
  the Spire approach (hawker patrolling the claw face) | canopy: the arrival bower (leaf/heartwood ceiling), the kin
  climb, the moon crown (glide glade, a dead end), the gap as **the** vista (far limb, seed 3, a hidden roost on the
  glide line), the drop to the hub | den: a 3-screen root-tunnel approach (burrback pair + dangler, a secret), a
  closed ~2-screen arena with a save balcony and a gate that seals behind, and the way out as a reveal room.
- **Secrets: 15-20**, one per 2-3 screens of route, hidden in mass so they look like the mass (no glints showing
  through a breakable; bark walls painted as trunk, not crates: fix the bark painter for wood rooms in
  render/lantern/kit.ts), at least 4 paying a real major.
- **Encounters:** 4+ authored fights where terrain matters (ceilings, thorns, tiers, caps, hazards), 3-5 hazard runs
  per room on average, no fight on a flat open log.
- **Travel:** every stretch over 1,500 px holds a 3-5 move problem tuned to the Reach table.
- **Look per room** (`art`: moon, afterglow, moods `cool|warm|deep`, anchors): the den underground (no sky, deep),
  the grove lamplit warm, the canopy the one cold-white moon room, the west dark, the hub glowing with seeds.
- Keep foreground leaves and covers 400 px from spawns and exits (review #10).

## Done means
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`; the world check passes
  (`validateWorld`); `tools/solve/canopy.ts` rewritten for v2 claims (reach + locks per room) and **all hold**.
- `npm run check` passes (typecheck, lint, unit, e2e). Dev server: http://localhost:5212 is running from this worktree.
- `npm run shots -- --room=<id> --only=wide --pickups --url=http://localhost:5212 --out=shots/canopy-v2/<id>` for
  every room, and you looked at them against `docs/design/art-direction.md` and fixed what is worst (mass painting
  first). Stack with `magick a.png b.png -resize 960x -append out.png` (montage is broken here).
- `npx tsx tools/reference/export-area.ts canopy` (update `CRITICAL` for v2), `area-svg.ts`, `svg-png.ts`, and
  `metrics.ts` against the three references: report the table.
- `docs/design/levels/first-area.md` and `memory/canopy.md` updated for v2; one commit on this branch (end the message
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Don't push.
- Report: what you built (room list with roles), the metrics table, what you could not do, and the 5 things you
  think are still weakest.
