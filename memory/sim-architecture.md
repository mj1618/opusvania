# Sim / runtime architecture

- `src/sim/` pure: `step(state, inputMask, tuning, events)` mutates a plain-JSON `GameState` and appends
  `SimEvent`s. `hashState` = cyrb53 over key-sorted JSON. RNG state (`state.rng`, mulberry32) is in the state.
- `src/game.ts` (`Game`) is the harness: keeps `prev` + `state` for render interpolation (JSON-cloned
  every step; fine while state is tiny, revisit if it grows), scripted input queue, replay recorder, and
  dispatches events on an `EventBus`. No DOM, so it runs in Vitest.
- `src/loop.ts` fixed-step accumulator (max 5 steps/frame, then drops time; snaps near-60Hz frame
  times, see loop-timing.md). `src/main.ts` wires rAF.
- Input edge detection and buffering live in the sim (`src/sim/input.ts`, `prevInput` in state), not in
  `src/input/`, so buffered presses replay exactly. `src/input/` only turns devices into a bitmask.
- Tuning is a mutable module object (`src/sim/tuning.ts`) passed into `step`. Replays snapshot it at the
  start and the recorder diffs it before every step (records a `tuning` op), so live tweaks replay exactly.
  Anything else that mutates state outside `step()` must go through a `Game` method that records a
  replay op (see `load`/`reseed`/`setState` in `src/game.ts`), or replays silently diverge.
- `hashState` throws on NaN/Infinity (JSON would turn them into null and hash them like null).
- No engine-approximated Math in the sim (`sin/cos/atan2/exp/log/pow/**`...): V8, SpiderMonkey and JSC
  can differ in the last bit, so a replay from Firefox/Safari would diverge in Node. Add a deterministic
  helper in `src/sim` (lookup table or polynomial) when needed. `sqrt/floor/round/abs/min/max` are exact.
- Live keyboard is sampled on every step even when scripted input wins (and flushed while in manual
  mode), so taps made during a script or pause don't fire later.
- Render never runs its own clock: `Game.afterStep` calls render once per sim step with that step's
  events, and the camera (`src/render/camera/`) and juice (`src/render/fx.ts`) step there. Both are pure
  TS with a render-side seeded RNG, so clips are deterministic and camera tests run headless.
- Rooms are JSON in `content/gym/` (+ the compiled LDtk world, `content/world.compiled.json`) bundled by `src/sim/world/content.ts` (the one place the sim imports
  outside `src/sim`; the purity test allows `content/**.json`). See gym-rooms.md.
- Per-step params: `step()` calls `resolveParams(tuning, player.profile)` (src/sim/player/params.ts),
  which applies the movement profile and turns disabled assists into 0/false. The controller never
  reads `tuning` directly.
- Room transitions are sim state (`state.transition`): touching G (or Up at a door) freezes the player
  for `world.transitionFrames`, then `loadRoom` runs inside `step`, so replays and hashes cover them.
  Edge exits (level-authoring.md) set `transition.offset` and arrive via `enterRoomAt`, which keeps the
  player state and translates the body.

## Sim events (for audio/render; defined in `src/sim/events.ts`)
Positions are the player's feet centre unless noted. `dir` is -1/1.
- `jump {kind: ground|coyote|buffered|wall|double|dashJump, dir}`: wall `dir` = away from the wall.
- `land {vy, fallPx, hard}`: `vy` = impact speed; `hard` = fallPx >= misc.hardLandFallPx or vy >= maxFall.
- `step` (footstep every misc.footstepPx grounded), `skid {dir}` (ground turn-around starts).
- `wallSlideStart/End {dir = wall side}`: slide volume can follow `state.player.vy` while sliding.
- `dashStart {dir, air}`, `dashEnd {dir}`, `headBump` (y = head), `cornerCorrect {kind: head|ledge|dash, dx, dy}`.
- `dropThrough`, `pogo {target: orb|spike}` (no `jump` event for a pogo), `death` (y = body centre),
  `respawn`, `checkpoint` (touched an R marker).
- `goal {kind: main|optional, roomId}`, `roomExit {roomId, to}` (fade-out starts), `roomEnter {roomId}`,
  `profileChange {from, to}`.
- L3 (src/sim/events.ts; positions = the target's centre): `moveStart{move,dir}`, `whiff{move,reason?}`,
  `hit{cls,move,target,dmg,dir}`, `hitstop{frames,cls}` (one per step, the max request), `seizeTake
  {soundId,colour,kind,owner}`, `seizeGuarded`, `seizeRefused`, `catch{enemy,attackId}`, `ghost{source,on}`,
  `levyThrow{soundId,colour,dir,levied}`, `levyLand`, `levyDry`, `recoilHop`, `springBounce{levied,target}`,
  `bagPush`, `snatch`, `absorb`, `revoice`, `retrieve`, `hurt{dmg,src}`, `telegraph{enemy,attackId,colour,frames}`,
  `attackActive`, `down`, `countTick{beat}`, `repossess`, `rise`, `ko`, `plate{char,by}`, `gateOpen`, `roomClear`.
  Audio hums follow seizeTake/levyThrow/levyLand/bagPush/snatch/absorb/revoice (src/audio/router.ts).
- L4 (combat-spec §2): `hurt{dmg,src,attack}` (attack id or 'contact'), `hit.cls` adds 'counter',
  `flinch`, `slipStart`, `slipClean`, `counterOpen`, `counterHit`, `ringStart|Recover|Lost`, `hazard`,
  `swallowStart|Commit|Spill|Refused`, `bagLeak`, `hoarse`, `shot{kind}`, `shotLand`, `hop`,
  `runnerSlip`, `kidDown`, `beatCountTick{beat,canRise}`, `beatCountRise{paid}`, `countedOut`,
  `corner`, `distrained`, `redistrained`, `auctioned`, `poundage{amount}`, boss: `lotMarked{lot,beat}`,
  `sold`, `soldBag`, `outbid`, `bossPhase`, `fever{level}`.
- Step order since L4 (src/sim/index.ts): transition → hitstop → sold lots, pending sources, dynamic
  solids → Kid action (or her Count while down) → movement → levied → shots → enemies → Kid's hits →
  enemy hits and shots on Kid (clean Slips) → levied hits → springs → plates/gates → static leak →
  hitstop apply → weight → bookkeeping. `state.run` survives room loads; `state.local` doesn't.
