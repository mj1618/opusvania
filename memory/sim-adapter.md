# Sim adapter: the seam between tools and the controller

`src/debug/sim-adapter.ts` is the ONLY place the verification tools (trace, headless runner, tapes, bot,
feel report, clip trail, hitbox overlay) read controller-specific things. When the controller, tuning
or room format changes, fix it here, then run `npm run check`, `npm run bot:all` and `npm run feel:report`.

What it probes, spec-first with a Phase 0 fallback:
- **Units:** `LEGACY_CONTROLLER` = tuning has `player.runSpeed` (px/s) → velocities ÷ 60. Spec tuning is px/f.
- **Player view:** `state` (string, normalised to camelCase: `wallSlide`, `dash`, `dead`), `wallDir`,
  `airDash`/`airDashes`, `dj`/`doubleJumps`, `dashCd` or `timers.dashCd`, `dead`. Missing → neutral defaults.
- **Bot key:** `botKey()`; add any new discrete state that changes what inputs can do (e.g. drop-through timer).
- **Events:** `normEvent` gives `{type, kind}`; Phase 0 `jump.coyote` → kind `coyote|ground`. Marker letters
  for overlays come from `eventMarker()` (expects spec names `dashStart`, `cornerCorrect`, `death`...).
- **Assists:** `tuning.assists.<name>` booleans (spec `ASSISTS`); Phase 0 maps coyote / jumpBuffer /
  variableJump onto frame counts (1 = off, since 0 disables jumping there).
- **Abilities:** `state.player.abilities` or `state.abilities` objects; room `abilities`; room `claims`.
- **Presets:** optional export `PRESETS` in `src/sim/tuning.ts` (full or partial tunings), and its
  `presetTuning(name)` when present, read with `Reflect.get(namespace, name)` so it compiles before it
  exists. Not `Object.getOwnPropertyDescriptor(ns).value`: Vitest and rolldown build module namespaces
  from getters, so `.value` is undefined there (works in tsx only; cost an hour).
- **Claims:** `room.claims` or `room.file.claims`; only entries with a `with` list are claims; `without`
  may name an ability (removed) or an assist (switched off), e.g. gym-03 `variableJump`.
- **Rooms/targets:** `ROOMS`/`getRoom`/`isSolidTile`; goals from `goals`/`triggers`/`entities` (`G`, `g`,
  kind `goal`/`optionalGoal`), doors as `exit:<char>`, plus every spawn as `spawn:<name>`.
  `registerTestRoom(id, rows)` = `buildRoom({id, rows, abilities: none})` then `registerRoom` (spec) or
  `ROOMS.set` (Phase 0). Test rooms: only `# . P`, one `P`, at least 30×17 (the spec loader pads smaller
  rooms, which shifts `tile:x,y` targets).
- Verified before merge by overlaying the controller's in-progress `src/sim` + `content/` on a scratch copy
  of the tools branch: all tool tests pass on both controllers.
- **Sim calls:** `newState` / `stepState` wrap `createState` / `step`.

The live-game tap (`src/debug/event-log.ts`) wraps `game.bus.emitAll` and `game.stepOnce` on the
instance to see every event and step without changing Game. If Game is restructured, fix it there.
