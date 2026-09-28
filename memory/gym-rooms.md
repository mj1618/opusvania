# Gym rooms and golden replays

- **Format decision**: ASCII-in-JSON now (`content/gym/*.json`, Zod `RoomFileSchema` in
  `src/sim/world/rooms.ts`); the Phase 3 LDtk importer must emit the same room data. Agents can write
  and diff ASCII; no editor needed.
- Legend: `#` solid, `=` one-way, `^ v < >` spikes (point direction; hitbox = base half, inset), `o`
  pogo orb, `P` spawn, `R` respawn marker, `G` goal, `g` optional goal. Door chars are declared in
  `doors` (hub uses 1-9, A-E) and are entered with Up. `next` = where G leads (the gym chains
  01 -> 14 -> hub). Rooms under 30x17 are padded with solid (centred), which shifts tile coords.
- Room JSON has `abilities` (granted on load) and `claims` (for the bot: `with` / `without`).
- **Goldens**: `tests/replays/gym-*.json` tapes (see replays-and-tapes.md). Behavioural checks always
  run; exact hashes go stale (skip) when the preset tuning changes. `npm run replays:update` re-records;
  `npm run tape -- update --resolve` re-solves tapes that stop reaching G with the bot.
- The first L2 tapes came from a throwaway best-first search (4- or 2-frame macros). It needed staged
  targets for gym-05/06/13 because the distance heuristic fights detours. Bot tapes are valid but
  not "intended" routes: gym-13's tape walks off the one-way ends instead of dropping through, and
  pogos off spikes (spikes are pogo-able by design).
- "Without" claims checked in L2 (not found within 200k expansions): 07 wallJump, 10 dash,
  11 doubleJump, 12 pogo, 13 wallJump.
- L2 fix pass: gym-01 has 7 air rows (60×9; full jumps used to bonk), gym-04 stepping stones are
  2 wide, gym-09 `G` sits beside the landing (a `G` in the fall line fires before the hard landing),
  gym-14's lock zone is 28 tiles (one tile narrower than the view each side so the body never pokes
  off-screen before release) and the clampY zone was widened to meet it.
- gym-07: the spawn shaft is cols 1–5 and closed by the col-6 pillar; scripted probes jump left first.
- gym-14 (camera lab) is laid out by us (spec gave a schematic): g sits 11 tiles above the start ledge
  so it is only in view with Look-Up; the spikes under the one-way ledge only with Look-Down.
- L3 schema: `sources` {char: {sound, colour}} (each 4-connected component = one source), `plates`
  {char: {pressedBy}}, `gates` {char: {opensOn: plate|clear}}, `enemies` {char: type}; abilities gain
  optional `seize`/`levy`; claims may set `info: true` (the `with` search is informational) and
  `budget`, and claim keys may be targets like `rect:x,y,w,h`. L3 rooms (lot-7, lot-7-control,
  the-pit, stairwell) hang off the hub's right-hand doors L K T S (hub widened to 62 tiles).
- L4 schema: `prompts` [{at: sketch tile, keys: [up, seize...], until?: `move:<id>:<dir>` or an event
  type, near?: tiles}] = render-only in-world key glyphs; `hazard: death|pip` (pip = combat rooms:
  spikes cost Chin, respawn at the last safe ground); `spawnGrace` (frames before enemies aggro or
  attack); source `locked: true` (hums, can't be seized: the Auctioneer's lots); `+` = a Corner
  (entity `corner`, spawn `corner`; the hub's stool, where a Counted Out Kid wakes).
- L4 rooms off the hub's right doors: Y yard (aims tutorial: jump + Up+Seize a bar, Down+Levy over
  a pit; bars sit 5 tiles up so neither a jump nor a slab + jump can mount them), T the-pit (spawn on
  the left one-way platform, 120 f grace), W/X/Z/Q ring-barker/gull/grinder/clerk (1v1; the exit alcove
  is sealed above the clear gate: random fuzz input jumped over a 4-tile gate), U auction (boss).
  Hub is 87 wide.
- Progression annotations (L4, all optional, no sim behaviour yet): `pickups` {char: {grants, id?}} and
  `rests` {char: {name?}} load as empty tiles with `pickup`/`rest` entities; `gates.<c>.requires` +
  `hold`; `locks` {name: {target, requires, hold, teachGate, from?, region?, note?}}. Lot 7 has gate D
  requires [seize] and lock `spring-hall` requires [levy]; Stairwell has lock `top`. The validator reads them
  (progression.md). Rooms' `abilities` are still SET on load (gym semantics); Phase 3 pickups will add instead.
