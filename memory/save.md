# The save (tech stage 1, 2026-10-17)

## In the sim (`state.save`, src/sim/state.ts `SaveState`; state v22)
| field | what |
|---|---|
| `abilities` | owned, `ABILITIES` order (glades add; `resolveParams` gates the moves) |
| `snuffed` | `room:lure` put out: `createLures` starts them out (hp 0, `out` 1) |
| `moths` | freed in all (counted once per lure) |
| `taken` | `room:glade` (and later one-time items) |
| `flags` | free-form story beats (nothing writes it yet) |
| `opened` | `room:shortcut` |
| `visited` | room ids, first visit first (the map; the hatching plays only in a room not visited) |
| `seen` | `room:id` of lures / exits / doors / patches / glades she has had in view (the map) |
| `crossed` | `room:exit` gone through either way (both sides of a link) |
| `patch` | `{room, id}` last moon patch rested at: re-form point and Continue, or null |
| `time` | sim frames played, every step |
Everything else in `GameState` besides `player`, `frame`, `seed`, `rng`, `prevInput`, `room` is the room's own
(`RoomLocal`: pickups, pods, lures, enemies, goal, exit, caught, hatch, rest), rebuilt by `createLocal(scene, t,
save, firstVisit)` on every entry. (They stay top-level fields, not under `local`, so ~580 references did not move.)
`createState(seed, t, scene, events, abilities?, save?)`; `continueState(seed, t, world, save)` stands her at the
save's patch (the world start's spawn if none), no hatching once anything was visited; `newSave`, `cloneSave`.

## The slot (src/save/storage.ts)
- localStorage `lampfall.save` = `{version: 1, save}` (`SAVE_VERSION`, not the sim's state version). Zod-checked on
  read; `MIGRATIONS[v]` lifts v -> v+1 (none yet: add one when `SaveState` changes, bump `SAVE_VERSION`). A slot
  that cannot be read moves to `lampfall.save.bad` and the game starts new. A few hundred bytes.
- **Boot** (main.ts): no `?room=` = the game: Continue from the slot, else a new game at world.json's `start`;
  autosave on every `patchRest`, `gladeGrant`, `lureSnuff`, `shortcutOpen` and `roomEnter` (not `from: 'load'`).
  `?fresh` empties the slot first. **`?room=<id>` = a test boot: new game there, slot never read or written** (so the
  tools and tests, which all pass `?room=`, never touch a player's save).
- R in a game page = back to the last save (`continueFrom`); in a test page = `reset()` as before.
- Debug: `__game.save()` -> `{save, stored, autosave}`, `__game.clearSave()`; tests seed a slot with
  `page.addInitScript` (tests/e2e/world.spec.ts).
