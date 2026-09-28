# Combat greybox (L4, Phase 2) — sim side

Spec: docs/design/combat-spec.md. Report: `npm run combat:report` (docs/reports/L4-combat.md; bots in
memory/combat-bots.md). Render/audio side: memory/signature-render.md, memory/audio.md.

- **Moves are data** (content/moves.json): `kind` (strike | seize | levy | swallow) picks the handler
  in src/sim/combat/kid.ts; `input` {button, aim, air?, chainFrom?} is resolved on the START frame by
  `resolveMove` (chained > aimed > plain). The buffer holds a BUTTON, not a move; a chained move's
  buffer doesn't expire while its source move runs (the 1-2: A during a jab fires the Cross on jab
  frame 11). `cls`, `runMult` (Cross plants), `root` (Swallow), `launch`, `pogo`, `counterable`,
  `heavyBonus`, `featherRecovery` are read from the entry; no code branches on move ids.
- **Hitstop request lives in `state.hitstopReq`** (cleared at the start of each free step and after
  apply). `requestHitstop(state, cls, t)`.
- **Seize priority** is `SeizePri` in src/sim/combat/priority.ts (catch 1 … refused 7); every
  source-kind handler (object, levied, enemy, shot) returns one.
- **Enemies are data** (content/enemies/*.json, schema src/sim/ai/schema.ts): movement kinds walk | fly
  (hover + integer sine bob, src/sim/math/sine.ts) | keepAway (Clerk hop-back) | flee (Runner) |
  static (boss); attacks may carry `projectile` (dart, mortar), `dive` + `aimLockFrame`,
  `teleRisePx`, `stuckRecovery`, `minX`. `flinchFrames` = hitstun outside attacks (telegraphs and
  swings have armour). The boss's move choice is scripted (src/sim/ai/boss.ts), numbers in `params`.
- **Shots** (`local.shots`, src/sim/ai/shots.ts) carry the attack's sound while it stays home; a
  seizable shot is a source (kind 'shot'): Seize = a Catch that takes the sound. Mortars land as a
  short blast. Boss words (TWICE) and the bought slab are shots too.
- **Kid**: Chin persists across rooms; `chinMax` = kid.chin − run.lien. Hurt: 8 f hitstop, 78
  i-frames and 12 f lock COUNTING the hit step (so the state shows 77/11 after it). Ringing: the
  last lost pip can be won back for 120 f by a take/Catch/Counter/repossess. Clean Slip = Slip
  i-frames over a live enemy hitbox or shot → 30 f Counter window (×2, knockdown, box ×1.25 grown
  by whole px each side so it stays mirror-exact), cooldown refunded. **Bodies deal no contact
  damage while Kid is dashing** (deviation: with i-frames on frames 1–10 of a 14-frame Slip she
  otherwise took contact damage right after slipping through a Barker).
- **Chin 0 → `player.down`** (KidCount; state 'dead', the controller doesn't run, the world does):
  ONE Jump press within ±5 f of beats 3–8 rises (needs a voice in the bag, once per Corner; the bag
  is paid). Otherwise Counted Out → `distrain` (Runner + Lien, or garnish debt) → transition to
  `run.corner` (the hub's `+`). A Runner spawns where she went down when that room loads.
- **Hazards in `hazard: 'pip'` rooms** cost 1 Chin (no ring), freeze 30 f, respawn at the last safe
  ground: grounded on the room's own tiles and NOT on a dynamic solid (a lot can be sold, a slab
  taken). If something landed there since, she respawns on top of it. Gym rooms keep L2 deaths.
- **Doors** trigger 3 tiles wide (world.doorTriggerTiles), nearest door wins. **G** holds a 45 f
  "cleared" beat before the warp (world.goalBeatFrames).
- **Spawn grace** is per room (`spawnGrace`, the Pit 120 f): enemies neither aggro nor attack before it ends.
- Numbers changed from the spec after the report (levers the spec names): HP Barker 10, Grinder 14,
  Clerk 14 (the Auctioneer keeps 36/44); Grinder backs up 48 px (24 was invisible); violet drift
  −0.05 px/f². Boss rules added: a Return-to-sender stagger can't be extended and guards his voices
  (else grab → throw → grab stagger-locks him), and a hit while he rises at 0 HP can't re-down him.
- Gotchas found by tests/fuzz: a slab landing on the safe spot put Kid inside a solid on respawn;
  the boss's hop used to snap x to its target (inside a slab); a fork of the fuzzer looped forever
  once Kid left the room (Counted Out) because the frame counter only advanced inside the room.
