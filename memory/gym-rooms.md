# Gym rooms and golden replays

- **Format decision**: ASCII-in-JSON now (`content/gym/*.json`, Zod `RoomFileSchema` in
  `src/sim/world/rooms.ts`); the Phase 3 LDtk importer must emit the same room data. Agents can write
  and diff ASCII; no editor needed.
- Legend: `#` solid, `=` one-way, `^ v < >` spikes (point direction; hitbox = base half, inset), `o`
  pogo orb, `P` spawn, `R` respawn marker, `G` goal, `g` optional goal. Door chars are declared in
  `doors` (hub uses 1-9, A-E) and are entered with Up. `next` = where G leads (the gym chains
  01 -> 14 -> hub). Rooms under 30x17 are padded with solid (centred), which shifts tile coords.
- Room JSON has `abilities` (granted on load) and `claims` (for the bot: `with` / `without`).
- **Goldens**: `tests/replays/gym-NN.<abilities>.json` = tape (spec DSL) + expected goal frame, end
  position, hash every 60 f, tuningHash. Behavioural checks always run; exact ones skip (stale) when
  the opus preset tuning changes. `npm run replays:update` re-records; tapes that stop completing
  need a new tape from the bot (`tools/bot`, stream B).
- The L2 tapes came from a throwaway best-first search (4- or 2-frame macros). It needed staged
  targets for gym-05/06/13 because the distance heuristic fights detours. Bot tapes are valid but
  not "intended" routes: gym-13's tape walks off the one-way ends instead of dropping through, and
  pogos off spikes (spikes are pogo-able by design).
- "Without" claims checked in L2 (not found within 200k expansions): 07 wallJump, 10 dash,
  11 doubleJump, 12 pogo, 13 wallJump.
- gym-14 (camera lab) is laid out by us (spec gave a schematic): g sits 11 tiles above the start ledge
  so it is only in view with Look-Up; the spikes under the one-way ledge only with Look-Down.
