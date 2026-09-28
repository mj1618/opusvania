# Search bot (`npm run bot`, `tools/bot/`)

Finds an input tape from a spawn to a target on the headless sim; the reachability oracle for the
Phase 3 progression validator (`search()` in `tools/bot/search.ts`).

```
npm run bot -- --room gym-10 --target G --abilities dash         # abilities: comma list, all, none
npm run bot -- --room hall --target a --save tests/replays/hall-a.json
npm run bot -- --room gym --target tile:30,15 --json
npm run bot:all                                                    # every room's `claims` (spec §6.1)
```
Options: `--budget` child nodes (300k), `--k` frames per macro (4), `--weight` (1.5), `--max-frames` (3600).

- Algorithm (spec §8): weighted A* over 12 macros (`. L R J LJ RJ X LX RX DA LDA RDA`) held k frames.
  Priority = frames + weight × (px distance to target rect) / 12 px/f. Dedup key = `botKey()` in the sim
  adapter (x>>3, y>>3, round vx/vy in px/f, grounded, state, wallDir, airDash, dj, dash cooldown, held
  jump/dash/attack bits, rising). Deaths prune. Found paths are re-run from scratch (`verified`).
- **Abilities:** macros needing dash (`X`) or pogo (`DA`) are dropped when the ability is off, and the
  sim adapter also sets the controller's ability flags (needed for wallJump/doubleJump, which use `J`).
  Default abilities = the room's declared `abilities`.
- **Results:** `found`, or `exhausted` (every reachable deduped state expanded: truly unreachable for this
  macro set), or neither = "not found within budget" (not a proof). Exhaustion is rare outside tiny rooms:
  a 4×4-tile box already has ~50k distinct keys, so `without X` claims will normally read "not found in budget".
- **Deterministic:** heap ties break on insertion order; same inputs give the same tape and node counts.
- Speed (Phase 0 controller, M-series Mac): ~1.8M sim frames/s single-threaded; 300k nodes ≈ 0.7 s.
  Found paths cost 5–100 ms. Keep the sim state small and plain: the bot clones it for every child.
- `k=4` means jump holds come in multiples of 4 frames; precise short hops may need `--k 2` (slower).
- Solutions are not human-like (lots of hopping, jitter); use them for reachability and golden tapes, not
  for feel judgements. Clip them with `npm run clip -- --tape <file> --trail` to see the route.
- Phase 0 gym `spawn:b` is not found within 1M nodes (closest 36 px below the ledge): the placeholder
  jump (3.06 tiles) likely can't reach it. `hall` → `a` takes 260 frames.
