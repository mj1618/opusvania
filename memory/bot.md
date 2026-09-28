# Search bot (`npm run bot`, `tools/bot/`)

Finds an input tape from a spawn to a target on the headless sim; the reachability oracle for the
Phase 3 progression validator (`search()` in `tools/bot/search.ts`).

```
npm run bot -- --room gym-10 --target G --abilities dash         # abilities: comma list, all, none
npm run bot -- --room gym-03 --target G --assists-off variableJump
npm run bot -- --room gym-04 --target G --save tests/replays/gym-04.json
npm run bot:all                                                    # every room's `claims` (spec §6.1)
```
Options: `--budget` child nodes (300k), `--k` frames per macro (4), `--weight` (1.5), `--max-frames` (3600).

- Algorithm (spec §8, amended): weighted A* over 13 macros (`. L R J LJ RJ DJ X LX RX DA LDA RDA`) held
  k frames. `DJ` (Down+Jump) is not in the spec's list but one-way drop-through (gym-06/13) needs it.
  Priority = frames + weight × flow distance / 12 px/f. Dedup key = `botKey()` in the sim adapter.
  Deaths prune. Found paths are re-run from scratch (`verified`).
- **Heuristic = flow field, not straight line.** Distance to the target through non-solid tiles (BFS,
  8-connected, ignoring gravity/body size). With euclidean distance gym-05/06/08/13 were "not found"
  even at 1M nodes (stuck against the wall nearest the goal); with the flow field they solve in
  0.1–2 s. `heuristic: 'euclid'` is still available in `search()`.
- **Abilities:** macros needing dash (`X`) or pogo (`DA`) are dropped when the ability is off, and the
  sim adapter sets the controller's ability flags (needed for wallJump/doubleJump, which use `J`).
  Default abilities = the room's declared `abilities`. Claims' `without` may name an assist.
- **Results:** `found`, or `exhausted` (every reachable deduped state expanded: truly unreachable for this
  macro set), or neither = "not found within budget" (not a proof). Exhaustion is rare outside tiny rooms
  (gym-03 without variableJump did exhaust), so `without X` claims normally read "not found in budget",
  and each costs the full budget (~6 s on the spec controller).
- **Deterministic:** heap ties break on insertion order; same inputs give the same tape and node counts.
- Speed, single-threaded: Phase 0 controller ~1.8M sim frames/s. The spec controller steps ~200k
  frames/s in Node (clone ~1M/s and key ~5M/s are not the bottleneck; the step is). L2 merged tree:
  all 23 gym claims PASS, `bot:all` ~23 s total (after the L2 fix pass); found paths 5 ms–1.3 s (docs/reports/L2-bot.md).
- `k=4` means jump holds come in multiples of 4 frames; precise short hops may need `--k 2`.
- Solutions are not human-like (hopping, jitter): use them for reachability and golden tapes, not feel.
  Clip them with `npm run clip -- --tape <file> --trail` to see the route.
- L3: macros `S US DS LS RS V UV DV LV RV RJS RJV` (need seize/levy). `botKey` adds bag colours,
  source ghost bits, levied (colour, phase, x>>3, y>>3), plate/gate bits, move+frame>>1, hitstop and
  enemy (state, x>>3, y>>3). The bot can't solve Lot 7 with the verbs in 1M nodes (flow field thinks
  the gate is open; the plate needs a timed levy), so those claims are `info`. `bot:all` is ~140 s now.
- `bounds` (px rect): prunes states that leave it and switches to reachable-set closure (no maxFrames, a
  key closes on first visit), so a small region can EXHAUST (proof). The progression validator
  (progression.md) calls `search()` through `tools/progression/job.ts`, in worker threads, with a cache.
- `search({forbid: ['seize:up']})` prunes any state where that aimed move started (`moveStart` move:dir);
  the progression audit's aim checks use it. The bot is weak at aim puzzles (it can't do the Yard's B or C
  with the aims either): prove leaks with a scripted sweep instead.
