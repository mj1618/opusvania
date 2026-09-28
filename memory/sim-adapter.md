# Sim adapter: the seam between tools and the controller

`src/debug/sim-adapter.ts` is the ONLY place the verification tools (trace, headless runner, tapes, bot,
feel report, clip trail, hitbox overlay) read controller-specific things. When the controller, tuning
or room format changes, fix it here, then run `npm run check`, `npm run bot:all` and `npm run feel:report`.

Reads the controller's typed state/tuning directly (the Phase 0 duck-typed fallbacks were removed at
the L2 merge; git history has them). What it covers:
- **Player view:** `playerView()` (vx/vy px/f, `state`, `wallDir`, `airDash`, `doubleJump` = `dj`, `dashCooldown`).
- **Bot key:** `botKey()`; add any new discrete state that changes what inputs can do (e.g. drop-through timer).
- **Events:** `normEvent` gives `{type, kind}`. Marker letters for overlays come from `eventMarker()`
  (event names in sim-architecture.md).
- **Assists:** `tuning.assists.<name>` booleans (`ASSISTS`); unknown names are returned by `setAssists`.
- **Abilities:** `state.player.abilities`; room `abilities`; room `claims`.
- **Presets:** `PRESETS` / `presetTuning` from `src/sim/tuning.ts`; `'default'` is an alias for `opus`.
- **Claims:** `room.claims` or `room.file.claims`; only entries with a `with` list are claims; `without`
  may name an ability (removed) or an assist (switched off), e.g. gym-03 `variableJump`.
- **Rooms/targets:** `ROOMS`/`getRoom`/`isSolidTile`; goals from `goals`/`triggers`/`entities` (`G`, `g`,
  kind `goal`/`optionalGoal`), doors as `exit:<char>`, edge exits as `exit:<side><from>` (the span's border tiles), plus every spawn as `spawn:<name>`.
  `registerTestRoom(id, rows)` = `buildRoom({id, rows, abilities: none})` then `registerRoom`. Test rooms:
  only `# . P`, one `P`, at least 30×17 (the loader pads smaller rooms, which shifts `tile:x,y` targets).
- **Sim calls:** `newState` / `stepState` wrap `createState` / `step`. `placePlayer(state, tx, ty)` puts the
  player on a tile's floor (searches from a pickup or ledge).
- **Progression:** `roomLayout(id)` = tile classes, entities, spawns, sources, plates, gates (+ `requires`,
  `hold`), `locks`, enemies and the room **palette** (seizable colours incl. enemy voices) for tools/progression.

The live-game tap (`src/debug/event-log.ts`) subscribes with `game.bus.onAny` and `game.afterStep`.
