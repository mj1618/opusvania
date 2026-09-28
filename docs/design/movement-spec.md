# Movement spec: Phase 1 greybox

Status: **ready to build** (L2 candidate). Owner: gameplay design. Date: 2026-09-28.
Scope: PLAN §7 Phase 1, the movement greybox. It is written so that **one engineer agent can build it in one loop**, and other agents can **verify it without a human playing**. Human feel sign-off goes to the queue and never blocks.

Every number here is a starting value. Feel tuning will change them, and the tests are built to survive that (see §7.3).

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| D1 | Keep **64 px tiles at 1080p**. The player hitbox is **40×80 px** (0.625×1.25 tiles). The view is 30×16.9 tiles. | The player fills 7.4% of the screen height. Hollow Knight's Knight collider is 0.5×1.28 units; Celeste is 6.1%. See §1.1. |
| D2 | Jump constants are **derived from a jump shape** (height and frames to apex, after Pittman), not copied from Celeste ×8. | Closed-form derivation means tests can assert exact apex height and frame. Our values sit between Celeste and Hollow Knight (see §3.3). |
| D3 | Variable jump uses **gravity multipliers** (release ×4, fall ×1.6, apex hang ×0.5) as the default. Optional `sustainFrames`, `minJumpFrames` and `releaseMode` exist so presets can reproduce Celeste and Hollow Knight faithfully. | We get one model plus faithful reference presets for blind A/B tests. |
| D4 | **Short acceleration** by default: 3 frames on the ground, 4 in the air. Hollow Knight-style instant response is one preset away. | Movement still starts on frame 1 (3.2 px). It gives weight, readable turns and natural momentum carry after a dash or wall jump. §2.3 has the details. |
| D5 | **Every assist has a boolean toggle**, and the whole tuning set has **presets `opus` / `celeste` / `hk`** with a blind A/B hotkey. | Supports PLAN §1's "blind comparison" bar and the Deepnight-style A/B. |
| D6 | The gym uses an **ASCII-in-JSON room format** now. The **LDtk importer moves to Phase 3** and targets the same Zod `RoomData`. | Agents can write, diff and review ASCII, and it needs no editor. LDtk is still the world editor. See §6.1. |
| D7 | The sim is **exact and deterministic**: integer positions, float64 velocities, only `+ − × ÷ √` in the sim, and **round-half-away-from-zero** for sub-pixel moves. | This makes tests exact to the frame and makes left/right mirror symmetry testable. |
| D8 | The camera is a **pure TS module stepped at 60 Hz** (`src/render/camera/`, no Pixi imports). It is unit-tested headless and shakes with a **render-side seeded RNG**. | Clips stay deterministic, and camera behaviour can be asserted as numbers. |
| D9 | The **search bot** (best-first over macro-actions, using sim snapshots) proves each room can be completed and writes its solution out as a replay. | It is the seed of the Phase 3 progression validator. |
| D10 | Placeholder SFX use **vendored ZzFX** (MIT, about 1 KB) rather than jsfxr or an npm dependency. | Matches PLAN §4.0; it is code-only and costs no dependency. |

---

## 1. Physics model

### 1.1 Units, scale and the tile-size sanity check

| Quantity | Value | Notes |
|---|---|---|
| World unit | 1 px = 1 pixel at the 1080p reference | Render scale = `screenHeight / 1080`. The camera snaps to device pixels. |
| Tile | 64 px | |
| View | 1920×1080 px = **30 × 16.875 tiles** | Rooms are at least 30×17 tiles. The loader pads smaller sketches with solid tiles. |
| Player hitbox | **40 × 80 px** (0.625 × 1.25 tiles) | The sprite may overhang the hitbox. The hurtbox comes in Phase 2. |
| Player / view height | 7.4% | Celeste 11/180 = 6.1%. Hollow Knight: Knight collider 0.5×1.28 u ([hkrl dump](https://github.com/Ramora0/hkrl)). |
| Full jump | 276 px = 4.3 tiles = 3.45 body heights = 26% of view height | Celeste is about 3.35 tiles (2.4 bodies); Hollow Knight about 5.6 u (4.4 bodies). |
| Tick | 60 Hz fixed, 1 frame = 1 f | Velocities are px/f (×60 gives px/s). |

**Verdict:** 64 px is right for a combat-first, Hollow Knight-like game: roughly 30 tiles of horizontal context and a readable character. We considered 48 px (40×22.5 tiles, closer to Celeste). It was rejected because the character would get too small for rig art and combat readability. At a 1/64-tile collision granularity (8× finer than Celeste), per-pixel stepping at up to 32 px/f costs at most about 64 grid probes per actor per frame, which is trivial.

### 1.2 Actor / Solid (after [Thorson](https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5))

```ts
interface AABB { x: number; y: number; w: number; h: number }  // integers, top-left origin, +y is down
class Actor { box: AABB; remX = 0; remY = 0;
  moveX(dx: number, onBlock?: (hit) => void): void;   // remX += dx; n = roundHalfAway(remX); remX -= n; step 1px at a time
  moveY(dy: number, onBlock?: (hit) => void): void;
}
roundHalfAway(r) = Math.sign(r) * Math.floor(Math.abs(r) + 0.5)   // symmetric; Math.round is NOT (−2.5 → −2)
```
- **Solids** come from the room's `TileGrid` for now. The `Solid` interface (`moveBy` with carry and push, per Thorson) is declared, and **moving solids are deferred** (§9).
- **Stepping:** move 1 px at a time. Before each step, test `collideAt(box shifted by 1)`. On a block, call `onBlock`, which may apply a correction (§2.4). If no correction applies, zero the remainder and stop.
- **Hazard check per pixel step** (not only at the end of the frame), so a 32 px/f fall cannot tunnel through a 32 px spike hitbox.
- **Determinism:** the sim uses only `+ − × ÷` and `Math.sqrt`, which are correctly rounded in IEEE 754, so Node and Chrome give identical results. No `Math.pow`, `sin`, `exp` or `Math.random` (CLAUDE.md).

### 1.3 Tile types

| ASCII | Type | Collision |
|---|---|---|
| `#` | solid | Full tile |
| `=` | one-way (jump-through) | Blocks only a **downward** 1 px step when the actor's bottom edge is exactly at the platform's top before the step, and the actor isn't dropping through. It counts as ground under the same rule. |
| `^ v < >` | spike (floor, ceiling, on a left-facing wall, on a right-facing wall) | Not solid. The hazard hitbox is the **base half** of the tile (32 px deep), inset 8 px on both sides. Any overlap kills. |
| `o` | pogo orb | Not solid. A 48×48 hitbox centred in the tile, pogo-able. |
| `P` `R` `G` `g` | spawn, respawn marker, goal, optional goal | Triggers, 64×64. |

- **Drop-through:** Down + Jump while standing on a one-way sets `dropTimer = 10` f. One-ways are ignored until the timer expires **or** the actor's top is below the platform. It does not jump.
- **Death and respawn:** overlapping a hazard emits `death`, freezes the player for 20 f, then respawns them at the last `R` they touched (or `P`) with velocity zero and abilities refilled. Automatic "last safe ground" respawn is deferred.

---

## 2. Player controller

### 2.1 States

```
NORMAL (sub-flags: grounded | airborne)  ──dash──▶ DASH ──end──▶ NORMAL
   │  ▲                                              
   ▼  │ (touch wall + hold toward, vy ≥ 0)           
WALL_SLIDE ──jump──▶ NORMAL(airborne, forced-x)      
any ──hazard──▶ DEAD ──20f──▶ NORMAL at respawn       
(POGO is an impulse inside NORMAL, not a state. ATTACK, HURT and HEAL are Phase 2 slots.)
```

### 2.2 Per-frame order (normative: the test numbers in §7 depend on it)

```
stepPlayer(p, in):                       // in = held bits + pressed/released edges latched since the last step
 1. if p.freeze > 0: p.freeze--; latch presses into buffers; return
 2. latch presses: jumpPressed → jumpBuf = JUMP_BUFFER_FRAMES; dashPressed → dashBuf = DASH_BUFFER_FRAMES
 3. state update:
    NORMAL:  a. horizontal accel (§2.3); while forceTimer>0, vx is held unchanged (no accel)
             b. vertical: gravity (§2.5)   (skipped on the frame a jump starts, because the jump overwrites vy)
             c. try dash (dashBuf>0 && canDash) → DASH (sets freeze)
             d. try jump (jumpBuf>0), priority:  grounded||coyote>0 → groundJump
                                             ▸ wall within WALLJUMP_CHECK_PX → wallJump
                                             ▸ canDoubleJump && !landingPreferred → doubleJump
             e. pogo check (Down+Attack in air, §2.7)
    WALL_SLIDE: §2.6.   DASH: §2.7.
 4. moveX(vx) then moveY(vy), with corrections (§2.4) and a hazard check per step
 5. post: decrement all timers (floor at 0); ground probe (1 px below, including the one-way rule);
          if grounded { coyote = COYOTE_FRAMES; refill air dash and double jump; emit land if it was airborne }
          wall probes; state transitions; facing; emit events
```
Timers are **used before they are decremented**, and a value N means N usable frames:
- **Coyote.** If the last frame that ended grounded is `g`, a ground jump can fire on frames `g+1 … g+COYOTE_FRAMES`. A jump sets `coyote = 0`, and so does a drop-through.
- **Buffer.** A press on frame `p` stays live on frames `p … p+JUMP_BUFFER_FRAMES−1`. If the landing frame is `Ld` (the first frame to end grounded), the buffered jump fires on `F = Ld+1` exactly when `F − p ≤ JUMP_BUFFER_FRAMES − 1`.
- **Sub-frame taps.** The input layer latches edges between sim steps, so a press-and-release inside one 16.7 ms window still counts as a 1-frame hold. When one rAF runs several catch-up steps, the edge applies to the first step only.

### 2.3 Horizontal: acceleration, not instant (D4)

```
target = inputX * MAX_RUN
a = grounded ? (inputX==0 ? GROUND_DECEL : sign(vx)==-inputX ? GROUND_TURN : GROUND_ACCEL)
             : (inputX==0 ? AIR_DECEL    : sign(vx)==-inputX ? AIR_TURN    : AIR_ACCEL)
if |vx| > MAX_RUN && sign(vx)==inputX:  a = grounded ? OVERSPEED_DECEL_GROUND : OVERSPEED_DECEL_AIR   // momentum carry
vx = approach(vx, target, a)
```
Why not Hollow Knight's instant velocity?
1. With 3.2 px on frame 1, response latency is still 0 frames.
2. Hollow Knight has to special-case its wall-jump lock (`WJLOCK_STEPS`, a decaying kick-off); acceleration gives that carry for free.
3. Starts, stops and skids become readable, and squash-and-stretch has something to hang on.
4. The `hk` preset sets every accel value to 999, which is truly instant, so the human can compare them blind.

### 2.4 Corrections (the "invisible" assists)

| Assist | Trigger | Action | Default |
|---|---|---|---|
| **Head-bump corner correction** | `moveY` blocked while `vy < 0` | Try horizontal shifts s = 1…`HEAD_CORRECT_PX`, nearest first. When `vx ≠ 0`, only in the `vx` direction; when `vx = 0`, both, with ties going toward facing. Take the first shift where `box(x±s, y−1)` is free, apply it and keep rising. Otherwise **bonk**: `vy = 0`, emit `headBump`. | 20 px (half the hitbox width; Celeste uses 4 of 8 = 50%) |
| **Ledge pop-up** (Hollow Knight's `CheckForBump`) | Airborne, `moveX` blocked, and the blocking tile's top is ≤ `LEDGE_POP_PX` above the feet | Raise the actor by that amount if the space is free, set `vy = min(vy, 0)` and continue the horizontal move. Emit `cornerCorrect{kind:'ledge'}`. | 16 px |
| **Dash corner correction** | During DASH, `moveX` blocked | Try vertical shifts ±1…`DASH_CORRECT_PX`, nearest first, up before down. | 24 px |
| **Wall speed retention** | `vx` zeroed by a wall | If the wall has gone within `WALL_RETAIN_FRAMES` (for example, a dash clipped a corner), restore the stored `vx`. Cancelled when `vx` has the opposite sign, and by any jump, wall jump or dash (Celeste does the same; without it a wall jump within 4 f of contact was undone, L2 playtest P0). | 4 f |

### 2.5 Vertical model

```
if frame is jump-start: vy = −V (set by the jump; no gravity this frame)
else:
  held = jumpHeld && !cutDisabled                             // cutDisabled: pogo bounce, until vy ≥ 0
  if vy < 0 && !held && fromJump: cut = true                  // persists until vy ≥ 0
  g = G_UP
  if vy ≥ 0:                    g = G_UP * FALL_MULT
  else if cut && releaseMode=='gravity':  g = G_UP * RELEASE_MULT
  if apexHang && held && |vy| < APEX_HANG_VY:  g *= APEX_HANG_MULT   // hang multiplies whichever g applies
  cap = (fastFall && downHeld && vy ≥ MAX_FALL) ? FAST_FALL_MAX : MAX_FALL
  vy = vy > cap ? approach(vy, cap, FAST_FALL_ACCEL) : min(vy + g, cap)
  // preset-only extras (all 0/off in opus):
  if sustain > 0: held ? (vy = min(vy, −V), sustain--) : sustain = 0   // Celeste VarJumpTime / HK JUMP_STEPS; jump sets sustain = sustainFrames
  if cut && releaseMode=='zero' && framesSinceJump ≥ minJumpFrames && vy < 0: vy = 0   // HK JumpReleased
```
- **Double jump:** `vy = −DJ_V`, regardless of the current vy. Variable height applies. One per airtime, refilled on ground, on wall jump (toggle) and on pogo.
  - By design, a double jump 2 frames after takeoff reaches *less* total height (256 px) than one full jump (276 px): the first jump's release cut applies before the fixed 192 px double jump. Hollow Knight behaves the same. Don't "fix" it.
- **Landing preference** (assist): in the air with no coyote and no wall in range, a jump press with double jump available is **buffered instead** if the ground is within `vy × JUMP_BUFFER_FRAMES` px below. That way a slightly early press becomes a ground jump, not a wasted double jump.

### 2.6 Wall slide and wall jump

- **Enter WALL_SLIDE:** airborne, `vy ≥ 0`, touching a wall (1 px probe) on side `d`, and `inputX == d`.
- **While sliding:** `cap = min(WALL_SLIDE_MAX, WALL_SLIDE_START_MAX + WALL_SLIDE_RAMP·slideFrames)`; `vy = vy > cap ? max(vy − WALL_SLIDE_DECEL, cap) : min(vy + G_UP*FALL_MULT, cap)`. Facing is `−d`. The ramp (Celeste's `WallSlideStartMax`/`WallSlideTime`) keeps a quick touch-and-jump calm while a long slide gets out of the way.
  - Neutral input keeps the slide (Hollow Knight-like; less thumb strain).
  - Holding away for more than `WALL_STICK_FRAMES` detaches. During the stick, `vx = 0`.
- **Exit:** grounded, lost contact, or unstuck. The air dash and double jump refill on **wall jump** (Hollow Knight's `DoWallJump`, toggle), not on slide contact.
- **Wall jump** fires on a jump press when airborne, with no coyote, and a solid within `WALLJUMP_CHECK_PX` on side `d`. This is the grace distance: it works while not touching the wall.
  - A **neutral** wall jump (no direction held) gets no force frames: vx 13.44 decays at `airDecel` to 0 in 11 f (~100 px), then drifts back. That is Celeste-style neutral climbing (+1 tile per hop on one wall), by design.
  - If both walls are in range, the nearer one wins; on a tie, the wall behind facing.
  - It sets `vx = −d·WALLJUMP_VX` and `vy = −JUMP_V` (variable height applies).
  - If `inputX ≠ 0`, `forceDir = −d` for `WALLJUMP_FORCE_FRAMES` (Celeste semantics). A neutral wall jump has no force, which enables Celeste's neutral-jump climbing.
  - **Consequence for level design:** with the wall-jump ability, **any wall is climbable**, whether single or chimney (like Hollow Knight's Mantis Claw). Each cycle gains about 4 tiles. Gates must assume this.

### 2.7 Dash, pogo and the jump-cancel

- **Dash:** horizontal only (Tempo Dash is Mothwing Cloak-like). The direction is `inputX`, or facing when there's no input.
  - The press frame emits `dashStart`, then `DASH_FREEZE_FRAMES` of freeze, then `DASH_FRAMES` at `vx = ±DASH_SPEED` and `vy = 0` with no gravity.
  - On exit, `vx = ±DASH_END_VX`.
  - Cooldown runs from the press. Air dashes: 1, refilled on ground, wall jump and pogo.
  - **Dash-jump cancel:** grounded or coyote plus jump during a dash → ground jump with `vx = ±DASH_JUMP_VX` (a modest long jump).
- **Pogo (placeholder hook for Phase 2):** Down+Attack in the air spawns a `48×64` probe under the feet for `POGO_ACTIVE_FRAMES`.
  - If it overlaps a pogo-able target (`o` orbs, **spikes**), then `vy = −POGO_V`, `cutDisabled = true` until the apex (a fixed-height bounce), refill the dash and double jump, and emit `pogo{target}`.
  - The API is `player.bounce(v, {refill, cutDisabled})`, so Phase 2's nail hitbox calls the same function.

### 2.8 Input

- Movement is digital (both reference games use digital input). A gamepad stick counts past 0.5 on an axis after a 0.25 radial deadzone. D-pad and keys are equal.
- Default keys: arrows or WASD to move, Z/Space jump, X/Shift dash, C attack/pogo.
- **Test and replay DSL** (used by `__game.input`, tests and the bot):
  - Grammar: `step (' ' step)*`, where `step = buttons frames`, `buttons = '.' | btn('+'btn)*` and `btn ∈ L R U D J X A`.
  - Example: `.10 R30 R+J12 R20 D+A1`. Edges come from held transitions. To press the same button again, insert `.1`.
- Debug API additions (keep `step`, `state`, `input`, `load` intact):
  - `__game.tuning.get()` and `__game.tuning.set(path, value)`
  - `__game.assists.set(name, bool)`
  - `__game.preset(name)`
  - `__game.snapshot()` and `__game.restore(s)`, which the bot needs
  - `state().player = {x,y,w,h,vx,vy,state,grounded,facing,wallDir,airDash,dj,timers,…}`
  - `state().events` holds the last frame's events
  - `state().camera` holds `{x, y, trauma, zone}`

---

## 3. Tuning (`src/sim/tuning.ts`)

**How this fits the Phase 0 scaffold.** The scaffold already has a single `src/sim/tuning.ts` (with a placeholder controller, px/s units and a Tweakpane "Copy JSON" button). Keep that file as the one tuning home. Phase 1 **replaces its `player` and `jump` groups** with the groups below and adds `assists`, `presets` and `shape`. The sim does its maths **per frame (px/f)**, so the exact tests in §7 hold; the panel can also display px/s. Wherever this spec says `src/sim/player/tuning.ts`, read it as the scaffold's tuning file.

### 3.1 Derivation (Pittman, discrete form)

Pittman's continuous form is `g = 2h/tₕ²` and `v₀ = 2h/tₕ` ([GDC 2016](https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building)). Our semi-implicit Euler (velocity first, then position; the jump frame has no gravity) gives an **exact** discrete version:

```
apex height after T frames:   H = g·T·(T+1)/2      ⇒   G_UP = 2H / (T(T+1)),   JUMP_V = G_UP·T
velocity for any other height h:  v(h) = G_UP·(−1 + √(1 + 8h/G_UP)) / 2       // double jump, pogo
```

```ts
export const SHAPE = { jumpHeightPx: 272, apexFrames: 24, doubleJumpHeightPx: 192, pogoHeightPx: 176 };
export function derive(s = SHAPE) { const g = 2*s.jumpHeightPx/(s.apexFrames*(s.apexFrames+1));
  const v = (h: number) => g*(-1+Math.sqrt(1+8*h/g))/2;
  return { G_UP: g, JUMP_V: g*s.apexFrames, DJ_V: v(s.doubleJumpHeightPx), POGO_V: v(s.pogoHeightPx) }; }
export const TUNING = { ...derive(), ...CONSTANTS };      // mutable; Tweakpane edits it and re-derives on SHAPE change
export const ASSISTS = { coyote: true, jumpBuffer: true, variableJump: true, apexHang: true, fastFall: true,
  headCorrect: true, ledgePop: true, dashCorrect: true, wallSpeedRetain: true, wallSlide: true,
  wallJumpGrace: true, wallJumpForce: true, landingPreference: true, dashJumpCancel: true, wallJumpRefill: true };
export const PRESETS = { opus: {...}, celeste: {...}, hk: {...} };   // §3.3
```
Every constant below lives here, and none is inline (CLAUDE.md). When an assist is off, its parameter is treated as 0 or false, so the code path is identical.

### 3.2 Constants (preset `opus`, the default)

| Group | Constant | px/f (or f) | px/s | Source / rationale |
|---|---|---|---|---|
| Body | `PLAYER_W × PLAYER_H` | 40 × 80 | | §1.1 |
| Jump | `SHAPE.jumpHeightPx / apexFrames` | 272 / 24 f | | 4.25 tiles: clears a 4-tile ledge by 20 px, but not 5 |
| | `G_UP` (derived) | 0.906667 | 3264 | |
| | `JUMP_V` (derived) | 21.76 | 1305.6 | |
| | `FALL_MULT` | 1.6 | | Pittman: heavier fall. Effective fall/rise gravity ratio 1.73 (Celeste ≈3.0, HK ≈1.6) |
| | `RELEASE_MULT` | 4.0 | | Tap = 76 px (28% of full). Celeste ≈25%, HK ≈23% |
| | `releaseMode / sustainFrames / minJumpFrames` | 'gravity' / 0 / 0 | | Presets only |
| | `APEX_HANG_VY / APEX_HANG_MULT` | 3.0 / 0.5 | 180 | Celeste: ×0.5 while \|vy\|<40 px/s with jump held |
| | `JUMP_H_BOOST` | 0 | | Celeste adds 40 px/s; off for predictable gaps |
| | `DJ_V` (derived, 192 px) | 18.211 | 1092.7 | +3 tiles; 6-tile ledges need a double jump |
| | `POGO_V` (derived, 176 px) | 17.42 | 1045 | Fixed height (`cutDisabled`) |
| Fall | `MAX_FALL` | 21.333 | 1280 | 20 tiles/s: Celeste 160×8 **and** HK 20 u/s agree |
| | `FAST_FALL_MAX / FAST_FALL_ACCEL` | 32 / 0.667 | 1920 / 2400 | Celeste 240 and 300, ×8 |
| Run | `MAX_RUN` | 9.6 | 576 | 9 tiles/s: Celeste 11.25, HK 8.3; crosses a screen in 3.3 s |
| | `GROUND_ACCEL / DECEL / TURN` | 3.2 / 3.2 / 4.8 | | 3 f to full, 3 f to stop (10 px skid), 5 f to full reverse |
| | `AIR_ACCEL / AIR_DECEL / AIR_TURN` | 2.4 / 1.2 / 2.4 | | 4 f to full; releasing in the air keeps the arc for 8 f |
| | `OVERSPEED_DECEL_GROUND / _AIR` | 1.6 / 0.4 | | Carries dash and wall-jump momentum |
| Assist | `COYOTE_FRAMES` | 6 | 100 ms | Celeste 0.1 s; HK about 0.04 s |
| | `JUMP_BUFFER_FRAMES` | 6 | 100 ms | Celeste 0.08 s |
| | `HEAD_CORRECT_PX` | 20 | | Celeste 4 px = 50% of body width |
| | `LEDGE_POP_PX` | 16 | | 0.25 tile |
| | `DASH_CORRECT_PX` | 24 | | Celeste 4 px ×8 would be 32; reduced for the narrower body |
| | `WALL_RETAIN_FRAMES` | 4 | | Celeste 0.06 s |
| Wall | `WALL_SLIDE_START_MAX → WALL_SLIDE_MAX` (+`WALL_SLIDE_RAMP`/f) / `WALL_SLIDE_DECEL` | 2.5 → 6.5 (+0.25/f) / 1.5 | 150 → 390 | 6.1 tiles/s after 16 f (L2 fix pass; was a flat 4.0); HK 8 u/s, Celeste 20→160 px/s ramp |
| | `WALL_STICK_FRAMES` | 5 | | HK `WALL_STICKY_STEPS` 3 (at 50 Hz) |
| | `WALLJUMP_VX` | 13.44 | 806 | 1.4× run: Celeste 1.44×, HK 1.93× decaying |
| | `WALLJUMP_FORCE_FRAMES` | 8 | | Celeste 0.16 s (10 f); HK lock 0.1–0.2 s |
| | `WALLJUMP_CHECK_PX` | 20 | | Celeste 3 px (37% of width) → 50% of ours |
| Dash | `DASH_SPEED × DASH_FRAMES` | 24 × 12 = **288 px** | 1440 | 4.5 tiles: Celeste 4.5 tiles, HK 5 u |
| | `DASH_FREEZE_FRAMES` | 2 | | Celeste 0.05 s (3 f); adds 33 ms of latency, so kept to 2 |
| | `DASH_END_VX / DASH_JUMP_VX` | 9.6 / 12 | | |
| | `DASH_COOLDOWN_FRAMES / DASH_BUFFER_FRAMES / AIR_DASHES` | 24 / 6 / 1 | | HK cooldown 0.6 s, Celeste 0.2 s |
| Misc | `DROP_THROUGH_FRAMES` | 10 | | |
| | `POGO_ACTIVE_FRAMES` | 8 | | |
| | `DEATH_FREEZE_FRAMES` | 20 | | |
| | `SPIKE_DEPTH_PX / SPIKE_INSET_PX` | 32 / 8 | | Lenient base-half hitbox |
| | `FOOTSTEP_PX` | 96 | | Emits `step` for audio |

### 3.3 Presets (for blind A/B testing; 1 tile = 8 px in Celeste and 1 unit in Hollow Knight, both mapped to 64 px)

| Param | `opus` | `celeste` (×8) | `hk` (1 u = 64 px, 50→60 Hz) |
|---|---|---|---|
| G_UP px/f² | 0.9067 | 2.0 | 0.8427 |
| JUMP_V px/f | 21.76 | 14.0 | 17.76 |
| sustainFrames / minJumpFrames / releaseMode | 0 / 0 / gravity×4 | 12 / 0 / 'gravity'×1 | 12 / 5 / 'zero' |
| FALL_MULT, apex hang | 1.6, on | 1.0, \|vy\|<5.33 ×0.5 | 1.0, off |
| MAX_RUN px/f | 9.6 | 12.0 | 8.853 |
| Ground / air accel | 3 f / 4 f | 5.4 f / ×0.65 (stop: `RunReduce`, 13.5 f) | instant / instant |
| Coyote / buffer (f) | 6 / 6 | 6 / 5 | 2 / 2 (DJ and dash queue 12) |
| Head / ledge correction | 20 / 16 | 32 / 0 | 0 / 16 |
| Wall slide cap px/f (start → max, ramp/f) | 2.5 → 6.5, 0.25 | 2.67 → 21.33, 0.26 | 8.53 (no ramp) |
| Wall-jump vx / force frames | 13.44 / 8 | 17.33 / 10 | 17.07 / 6 |
| Dash (speed × frames, freeze, cooldown) | 24×12, 2, 24 | 32×9, 3, 12 | 21.33×15, 0, 36 |

- **Celeste values** are from [`Player.cs`](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs): `Gravity 900`, `JumpSpeed −105`, `VarJumpTime .2`, `HalfGravThreshold 40`, `MaxRun 90`, `RunAccel 1000`, `AirMult .65`, `JumpGraceTime .1`, `UpwardCornerCorrection 4`, `WallJumpCheckDist 3`, `WallJumpForceTime .16`, `WallJumpHSpeed 130`, `DashSpeed 240`, `DashTime .15`, `Freeze(.05)` on dash.
- **Hollow Knight values** are from the decompiled `HeroController` ([constants dump](https://github.com/Jeffjewett27/AriadneAgent/blob/main/physics/hero_controller_constants.txt), [source](https://github.com/nickc01/WeaverCore/blob/master/Hollow%20Knight/HeroController.cs), physics at 50 Hz with `Physics2D.gravity.y = −60` ×0.79 per [hkrl](https://github.com/Ramora0/hkrl)): `RUN_SPEED 8.3`, `JUMP_SPEED 16.65`, `JUMP_STEPS 9`, `JUMP_STEPS_MIN 4`, release sets vy to 0, `MAX_FALL_VELOCITY 20`, `DASH_SPEED 20`, `DASH_TIME .25`, `DASH_COOLDOWN .6`, `WALLSLIDE_SPEED −8`, `WJ_KICKOFF_SPEED 16`, `LEDGE_BUFFER_STEPS 2`, `JUMP_QUEUE_STEPS 2`.
- **The Hollow Knight preset is approximate:** its wall-jump kick decays linearly, and its double jump has a 3-step pause, and neither is modelled.
- **Blind A/B:** the `F3` debug key (it was `B` until the L2 fix pass; L3 binds `B` to Levy) swaps between two preset slots chosen in Tweakpane. The HUD shows only "slot 1" or "slot 2", and the mapping is logged to the console for later reveal.

### 3.4 Reference feel envelope (computed with our integrator; used by `feel:report`, §7.5)

| Metric | Celeste | Hollow Knight | **opus** |
|---|---|---|---|
| Full jump height (tiles / body heights) | 3.35 / 2.4 | 5.6 / 4.4 | **4.31 / 3.45** |
| Time to apex (s) | 0.35 | 0.52 | **0.43** |
| Air time, flat full jump (s) | 0.65 | 1.02 | **0.85** |
| Tap / full height ratio | 0.25 | 0.23 | **0.28** |
| Apex dwell (frames within 10% of apex) | 13 | 18 | **18** |
| Effective fall/rise gravity ratio | 3.0 | 1.6 | **1.73** |
| Run (tiles/s), frames to full speed | 11.25, 5 | 8.3, 0 | **9.0, 3** |
| Flat jump distance / height | 2.2 | 1.5 | **1.8** |
| Dash (tiles, s, × run speed) | 4.5, 0.15, 2.7× | 5, 0.25, 2.4× | **4.5, 0.2, 2.5×** |
| Max fall (tiles/s) | 20 | 20 | **20** |
| Coyote / buffer (ms) | 100 / 80 | 40 / 40 | **100 / 100** |

---

## 4. Camera (`src/render/camera/`, pure TS)

Based on [Keren, "Scroll Back"](https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers), and [Eiserloh, "Juicing Your Cameras With Math"](https://www.gdcvault.com/play/1023557/Math-for-Game-Programmers-Juicing) for trauma shake.

**Stepping.**
- The camera steps once per sim frame from post-step sim state and keeps `prev` and `curr` states.
- The renderer interpolates **both** the camera and the player with the same alpha. Taking the camera from the raw player position while the sprite is interpolated is the classic jitter bug.
- The final view position is rounded to device pixels.
- Constants live in `src/render/camera/tuning.ts`. Render may import sim tuning, but never the reverse.

| Feature | Rule | Constants |
|---|---|---|
| Anchor | The player's feet sit at `ANCHOR_Y` of the view height; horizontally centred before look-ahead | `ANCHOR_Y 0.55` |
| Horizontal: dual forward focus | `targetX = px + facingFocus·LOOKAHEAD_X`. The focus flips only after the player moves `FOCUS_SWITCH_PX` in the new direction. `x += (targetX−x)·LERP_X` (`LERP_X_DASH` while dashing). | 200 px, 48 px, 0.15, 0.18 (effective lead ~136 px at full run; pan capped at max(24, 1.25·\|vx\|) px/f) |
| Vertical: platform snapping | `targetY` updates only on landing, during a wall slide, or when the feet leave the window `[WIN_TOP, WIN_BOT]` of the view. `y += (targetY−y)·LERP_Y`. A full jump from the anchor takes the feet to 0.294, so it stays inside the window. | 0.25 / 0.72, 0.08 |
| Fast-fall follow | When `vy > FALL_FOLLOW_VY`: `targetY = feet + FALL_LOOKAHEAD`, lerp `LERP_Y_FALL` | 12 px/f, 128 px, 0.22 |
| Look up / down | Grounded, no x input, holding U or D for `LOOK_DELAY` frames → offset by `LOOK_UP` or `LOOK_DOWN`, eased; released → back | 12 f, 224 / 256 px, 0.12 |
| Room bounds | Clamp after all offsets. If the room is smaller than the view on an axis, centre it. Shake is added **after** clamping, and rooms draw a 1-tile solid apron so shake never shows void. | |
| Trauma shake | `trauma ∈ [0,1]`; offset = `SHAKE_MAX_PX·trauma²·noise(seed, t)`, using 1-D value noise from the **render RNG**; decays by `TRAUMA_DECAY` each frame. Sources: hard land 0.55, death 0.8, (Phase 2: hits). Below trauma ~0.45 the shake is under 5 px, i.e. invisible. | 24 px, 18 Hz, 0.03/f |
| Dash kick | A directional impulse of `DASH_KICK_PX` in the dash direction, ×0.8 per frame (Celeste's `DirectionalShake`) | 10 px |
| Camera zones | Room data holds `{rect (tiles), mode: 'lock' \| 'clampX' \| 'clampY' \| 'bounds', value?}`. When the player's centre is inside, it overrides the target (lock = fixed centre; clampX/Y = fix one axis; bounds = sub-bounds). The last zone entered wins. Blend: the jump in (clamped) target decays by `ZONE_LERP`/frame, moving at most `ZONE_BLEND_MAX_PX`/frame; the offset is applied to the clamped target, then clamped again. | 0.10, 32 px |

---

## 5. Juice with placeholders (render and audio only, driven by sim events)

The sim emits typed events:
- `jump{kind: ground|coyote|buffered|wall|double|pogo|dashJump}`
- `land{vy, fallPx}`
- `wallSlideStart/End`, `dashStart{dir}`, `dashEnd`
- `headBump`, `cornerCorrect{kind,dx,dy}`
- `step`, `death`, `respawn`, `pogo`

The render RNG is seeded separately from the sim RNG (D8), so juice can never change the sim.

| Effect | Placeholder spec |
|---|---|
| Greybox | Tiles are flat colours: solid is a slate colour, one-way a thin bar, spikes red triangles, orbs yellow circles. The player is a rounded rectangle, 40×80, with an "eye" dot on the facing side. The hitbox overlay toggles with F1. |
| Squash & stretch (scale about the feet) | Jump (0.7, 1.3); double jump or wall jump (0.75, 1.25); land `s = min(vy/FAST_FALL_MAX, 1)` → (lerp 1→1.5, lerp 1→0.55); dash (1.35, 0.75); fast-fall stretch (0.8, 1.2); head bump (1.15, 0.85). Scale recovers toward 1 by 0.03 per frame. (Celeste: jump (.6, 1.4), land up to (1.6, .4), recovery 1.75/s.) |
| Dust (v8 `ParticleContainer`, pooled) | Values in `fxTuning` (src/render/fx.ts); raised ~2.5× after the L2 playtest. Jump: 6 upward. Land: 10 fast if `vy ≥ MAX_FALL/2`, else 5; hard land adds 12 big + 2 floor streaks. Turn-around skid: 4. Wall slide: a 6–9 px chip every 2 frames drifting down. Double jump: a ring of 8. Dash: an afterimage every 3 frames (fades over 12 frames) plus 6 streaks. Death: 2-frame white body flash, 6-frame swell, then a 24-particle pop, plus a brief white screen flash. |
| Landing impact | "Hard land" when `fallPx ≥ 320` or `vy ≥ MAX_FALL`: trauma 0.55, a big dust puff and the heavy SFX. **No stun** (Hollow Knight's 0.8 s hard-landing lock is deliberately not copied). |
| SFX ([ZzFX](https://github.com/KilledByAPixel/ZzFX), vendored as `src/audio/zzfx.ts`; definitions in `content/audio/sfx.json`) | jump (short rising square blip), double jump (two-note chirp, a fifth up), wall jump (noise-clicked blip), land-soft (low thump), land-hard (thump + noise + bitcrush), step (tick, pitch ±5%), wall-slide (looped filtered noise, gain ∝ vy), dash (downward noise sweep), head-bump (dull knock), pogo (bright ping), death (descending buzz), respawn (rising shimmer). Use `AudioContext({latencyHint:'interactive'})`, resumed on the first input. ZzFX randomness uses `Math.random`, which is fine because audio is outside the sim and clips are video only. |

---

## 6. Gym

### 6.1 Format decision: ASCII-in-JSON now, LDtk in Phase 3

| | ASCII JSON (`content/gym/gym-NN.json`) | LDtk now |
|---|---|---|
| Agent authoring and review | Hand-written, diffs line by line, and tests can print the room with the player's path overlaid | `.ldtk` JSON is verbose and IID-heavy; agents can't use the GUI |
| Cost this loop | A roughly 60-line loader | An importer plus hand-editing `.ldtk` roughly doubles the loop |
| Future | The same Zod `RoomData` (`{id, size, grid, entities, cameraZones, abilities}`) that the LDtk importer will output | — |

**Decision:** ASCII for the gym. The LDtk importer is Phase 3, and it must emit `RoomData`, so gym rooms can later be converted with a script (or LDtk's [Super Simple Export](https://ldtk.io/docs/general/super-simple-export/) IntGrid CSV maps straight onto the grid). This is a **PLAN change**: Phase 1 no longer says "then from LDtk". File shape:

```json
{ "id": "gym-04", "name": "Coyote & buffer", "abilities": {"wallJump": false, "dash": false, "doubleJump": false, "pogo": false},
  "rows": ["#####…", "…"], "cameraZones": [], "claims": {"G": {"with": [], "without": []}, "g": null}, "notes": "…" }
```
- `claims.G.with` lists the abilities the bot must complete the room with.
- `without` lists abilities whose removal must make `G` **not found** by the bot (§8).
- A room select uses number keys, `__game.load('gym-04')`, or `?room=gym-04`.
- The loader pads rooms to at least 30×17 with solid tiles and adds the 1-tile apron.
- Sketch coordinates are **intent**: if the bot shows a room is impossible or trivially skippable, the engineer adjusts it and notes why in the room's `notes`.

### 6.2 Rooms

Legend: `#` solid, `.` air, `=` one-way, `^ v < >` spikes (point direction), `o` pogo orb, `P` spawn, `R` respawn, `G` goal, `g` optional goal.
Key reach numbers:
- A full jump clears a **4-tile** ledge but not 5.
- A double jump clears **6** (and 7 barely).
- The largest flat gap is about **8.2 tiles**.
- Jump plus dash crosses about **12 tiles**.

| Room | Name | Abilities | Probes | Bot claims |
|---|---|---|---|---|
| gym-01 (60×9) | Run & stop | none | Accel, decel and skid (V01, V02 in situ); horizontal look-ahead and focus flip (C6, C7); footsteps. 1-tile bumps of width 1/2/3 need small hops. | G with: none |
| gym-02 (40×14) | Jump heights | none | Ledges 2/3/4 tiles from the floor, with G on the 4-tile ledge (a 20 px margin, so ledge pop-up fires on sloppy approaches). `g` is on a **5-tile** pillar, 15 tiles from anything, and needs a double jump. | G with: none · g with: doubleJump · g without: doubleJump |
| gym-03 (40×9) | Short hops | none | The ceiling spike hitbox is 288 px above the floor, so the head hits at a jump height ≥ 208: holds ≤ 10 f are safe and ≥ 12 f die. Floor spikes need ≥ 32 px of clearance across 88 px. Full jumps are punished. | G with: none · G without: variableJump (every jump is full, so it dies) |
| gym-04 (48×10) | Coyote & buffer | none | Two **7-tile** pits (max flat is about 8.2), so there's a window-sweep target for coyote. Then stepping stones: 2-wide pillars 1 tile tall with 2-tile spike pits between them (1-wide was B-side precision for a forgiveness room, L2 playtest), a rhythm where buffered presses fire on landing. | G with: none · window(coyote on) ≥ window(off)+5 · buffer adds ≥ 4 f |
| gym-05 (30×16) | Corner lab | none | Three 1-tile slabs with **1-tile holes** (64 px against the 40 px body gives 24 px of slack). There are 3 tiles of headroom and a 4-tile climb to each next level, and the holes are offset so the approach is imprecise and head-bump correction fires. | G with: none · robustness(headCorrect on) > robustness(off) |
| gym-06 (30×16) | One-ways | none | A one-way tower (+3 tiles per step, alternating sides) up to a bridge. The goal box is sealed by three **full-width** one-ways, so Down+Jump drop-through is required. | G with: none |
| gym-07 (30×30) | Chimney | wallJump | A 4-wide chimney, 21 tiles tall (vertical camera follow, wall-slide particles). `g` sits on a lone 17-tile pillar, so single-wall climbing (neutral jump) is required. | G with: wallJump · G without: wallJump · g with: wallJump |
| gym-08 (30×24) | Spiked zigzag | wallJump | A 6-wide shaft. Spike patches on alternating faces (`>` on the left wall, `<` on the right) force jumps to the opposite wall, testing wall-jump reach and forced frames. The spike floor punishes falls. | G with: wallJump |
| gym-09 (30×48) | Long fall | none | A 40-tile drop with alternating spiked ledges, testing lateral air control, fast fall, the camera fall-follow (C3) and hard-landing juice at the bottom. | G with: none · camera C3 |
| gym-10 (50×16) | Dash | dash | A 4-tile pit under a **2-tile ceiling** (a jump is capped at 48 px, so the gap needs a ground dash), then an **11-tile** open spike pit (jump + dash). | G with: dash · G without: dash |
| gym-11 (30×17) | Double jump | doubleJump | A **10-tile** pit (max flat 8.2), then a **6-tile** cliff (max single jump 4.3). | G with: doubleJump · G without: doubleJump |
| gym-12 (40×12) | Pogo | pogo | A 28-tile spike pit with orbs every 5 tiles. Down+Attack above an orb bounces 176 px and refills. | G with: pogo · G without: pogo |
| gym-13 (60×20) | Gauntlet | all | Chimney → jump+dash across an 11-tile gap onto a one-way → drop-through ×2 → pogo over a spike pit → double jump up a 6-tile cliff. It's the flow room for the clip reel and the human sign-off. Par = bot frames × 1.5. | G with: all · G without: wallJump (the other abilities are shortcuts here, not gates; the bot reports which ones it used) |
| gym-14 (96×34) | Camera lab | all | Camera zones and look up/down (schematic below) | G with: all · camera C5, C8 |



**gym-01: Run & stop**
```
############################################################
#..........................................................#
#..........................................................#
#..........................................................#
#..........................................................#
#..........................................................#
#..........................................................#
#.P.....................#.........##........###...........G#
############################################################
```

**gym-02: Jump heights**
```
########################################
#......................................#
#......................................#
#......................................#
#......................................#
#......................................#
#......................................#
#................................g.....#
#...............G...............##.....#
#..............##...............##.....#
#.........##...##...............##.....#
#....##...##...##...............##.....#
#.P..##...##...##...............##.....#
########################################
```

**gym-03: Short hops**
```
########################################
########################################
########################################
#vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv#
#......................................#
#......................................#
#......................................#
#.P.....^.....^.....^^....^.....^^....G#
########################################
```

**gym-04: Coyote & buffer**
```
################################################
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#............................................G.#
#.P...........R..........R......##..##..##..####
######.......####.......####....##..##..##..####
######^^^^^^^####^^^^^^^####^^^^##^^##^^##^^####
################################################
```

**gym-05: Corner lab**
```
##############################
#............................#
#............G...............#
###########.##################
#............................#
#............................#
#............................#
###.##########################
#............................#
#............................#
#............................#
#######################.######
#............................#
#............................#
#.P..........................#
##############################
```

**gym-06: One-ways**
```
##############################
#............................#
#............................#
#............................#
#.....#################......#
#.....................#......#
#.====................#......#
#.....................#======#
#.....................#......#
#.....====............#......#
#.....................#======#
#.....................#......#
#.====................#......#
#.....................#======#
#.P...................#...G..#
##############################
```

**gym-07: Chimney**
```
##############################
#............................#
#............................#
#............................#
#.....................G......#
#..........#....##############
#..........#....##############
#..........#....##############
#..........#....##############
#..........#....##############
#..........#....##############
#.....g....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#....#....##############
#.....#.........##############
#.....#.........##############
#.P...#.........##############
##############################
```

**gym-08: Spiked zigzag**
```
##############################
#............................#
#.......................G....#
############......############
############......############
############......############
############......############
############......############
############......############
############.....<############
############.....<############
############.....<############
############......############
############......############
############......############
############>.....############
############>.....############
############>.....############
############......############
############......############
############......############
############P.....############
##############^^^^############
##############################
```

**gym-09: Long fall**
```
##############################
##..................##########
##..................##########
##..................##########
##.P................##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########>.........##########
##########>.........##########
#############.......##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########.........<##########
##########.........<##########
##########.......#############
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########>.........##########
##########>.........##########
#############.......##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########.........<##########
##########.........<##########
##########.......#############
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########..........##########
##########.........G##########
##############################
##############################
```

**gym-10: Dash**
```
##################################################
################.................................#
################.................................#
################.................................#
################.................................#
################.................................#
################.................................#
################.................................#
################.................................#
################.................................#
#................................................#
#.P..............R............................G..#
########....########...........###################
########^^^^########^^^^^^^^^^^###################
##################################################
##################################################
```

**gym-11: Double jump**
```
##############################
#............................#
#............................#
#............................#
#............................#
#............................#
#............................#
#........................G...#
#...................##########
#...................##########
#...................##########
#...................##########
#...................##########
#.P..............R..##########
#####..........###############
#####^^^^^^^^^^###############
##############################
```

**gym-12: Pogo**
```
########################################
#......................................#
#......................................#
#......................................#
#......................................#
#......................................#
#......................................#
#........o....o....o....o....o.........#
#.P..................................G.#
######............................######
######^^^^^^^^^^^^^^^^^^^^^^^^^^^^######
########################################
```

**gym-13: Gauntlet**
```
############################################################
#######..............................##############........#
#######..............................##############........#
#######..............................##############........#
#######..............................##############........#
#######....##########................##############........#
#######....##########......................................#
#######....##########............R.........................#
#######....##########...........=====......................#
#######....##########......................................#
#######....##########......................................#
#######....##########...........=====...................G..#
#######....##########..............................#########
#..........##########..............................#########
#..........##########...........=====..............#########
#..........##########...................o....o.....#########
#..........##########..............................#########
#.P........##########^^^^^^^^^^^.....^^^^^^^^^^^^.R#########
############################################################
############################################################
```

**gym-14: Camera lab** (schematic, not tile-accurate; the engineer lays it out at 96×34 tiles)
```
+------------------------------------------------------------------+
|  g  <- 5 tiles above the ledge; visible only while Look-Up is held |
|                                                                  |
| P====ledge====   [A] clampY corridor: 40 tiles long, 3 tall      |
|     |           ##################################==###########  |
|     | 6-tile drop: spikes visible     [C] lock arena 30x17      |
|     v only while Look-Down is held        (zone centre)          |
| ^^^^^^^^          [B] bounds zone: 8-wide vertical shaft     G   |
+------------------------------------------------------------------+
```
Zones: A `clampY` (the camera's y is fixed while hopping in the corridor), B `bounds` (the view is clamped to the shaft), C `lock` (arena centre). Asserts: `g` enters the view only while Look-Up is held (C5); the lock is reached within 90 f (C8); no void is visible anywhere (C4).

---

## 7. Objective verification (the heart of this spec)

Every row is automatable. Tolerances are **exact** unless stated otherwise, because the sim is deterministic. Where a ±1 tolerance appears below, it covers only the rounding of derived float constants to integer pixels.

### 7.1 Unit tests (Vitest, headless sim, flat test grids built inline)

| ID | Test | Assertion (opus defaults) |
|---|---|---|
| V01 | Run from rest, holding R | vx on frames 1–4 = 3.2, 6.4, 9.6, 9.6; x moves on frame 1 |
| V02 | Stop / turn | Release: vx 6.4, 3.2, 0 (skid 10±1 px). Reverse from +9.6: vx 4.8, 0, −3.2, −6.4, −9.6 |
| V03 | Full jump, apexHang **off** | Apex **272 ±1 px** on frame **24 ±1**; lands frame 45 ±1 |
| V04 | Full jump, defaults | Apex **276 ±1** on frame **26 ±1**; lands frame **51 ±1** |
| V05 | Hold table (hold h frames) | h=1:76, 2:92, 3:108, 4:122, 6:150, 8:174, 10:196, 12:215, 16:245, 20:264 (each ±1); strictly increasing |
| V06 | Apex hang A/B | Frames with \|vy\| < 3 while held: on ≥ 2× off; apex +4±1 px |
| V07 | Fall | MAX_FALL 21.333 reached in 15±1 f from vy = 0; with Down held, 32 is reached and never exceeded; fastFall off → never above 21.333 |
| V08 | Coyote | Walk off a ledge (g = last grounded frame): press on g+1…g+6 → ground jump (`jump.kind==='coyote'`); on g+7 → none. Assist off: g+1 → none |
| V09 | Buffer | Fall onto the ground (F = first frame starting grounded): press at p with F−p = 0…5 → jump fires on F (`kind==='buffered'` when F−p > 0); F−p = 6 → no jump. Assist off: F−p = 1 → none |
| V10 | Buffered release | Press at F−3 and release at F−1 → short hop (apex = V05 h=1 ±2) |
| V11 | Head-bump correction | Rising into a ceiling-edge overlap of d px: d = 1…20 → passes and ends above; d = 21 → bonk (vy = 0, `headBump`). Both sides, mirrored. Assist off: d = 1 → bonk |
| V12 | Ledge pop-up | Airborne run into a ledge whose top is d px above the feet: d ≤ 16 → lands on top; d = 17 → blocked |
| V13 | Dash correction | Dash into a lip offset by d px: d ≤ 24 → passes; 25 → stops |
| V14 | Wall slide | Enter at vy = 21.3 → vy ≤ 4.0 within 12 f; neutral input keeps the slide; away for 5 f → still attached, 6 f → detached |
| V15 | Wall jump | Frames 1–8: vx = ±13.44 whatever the input; x displacement after 8 f = 108±1; vertical arc = V04 ±1 |
| V16 | Wall-jump grace | Solid at gap d = 1…20 px → wall jump; d = 21 → double jump (if available) or buffer |
| V17 | Neutral climb | A wall jump with no x input on the jump frame, then holding toward the wall, re-touches it on frame 13±1, higher by ≥ 180 px |
| V18 | Dash | Press on frame f: `dashStart` on f; x constant on f, f+1; x advances 24 px each frame f+2…f+13 (288 total); vy = 0; one air dash; refill on ground and wall jump; cooldown 24 f |
| V19 | Double jump | +192±1 above the start point (hang off); once per airtime; landing preference: press with ground ≤ vy·6 px below → ground jump on landing, double jump unused |
| V20 | One-way | Land from above; pass from below; D+J drops through; D alone doesn't |
| V21 | Hazard | Overlap → `death`; respawn at the last `R` after 20 f; a 32 px/f fall cannot pass through a spike hitbox |
| V22 | Mirror symmetry | For every gym room, replay the mirrored inputs in the mirrored room → the trajectory is mirrored exactly, every frame |
| V23 | Assist isolation | Each assist off changes only its own V-test outcome (the others still pass) |
| V24 | Tuning derivation | `derive()` round-trips: measured apex = SHAPE (V03) for 3 random shapes (H ∈ [128, 384], T ∈ [16, 32]) |

### 7.2 Latency (PLAN bar: under 100 ms)

- **Sim latency** (unit test): run, jump and pogo change `x`/`vy` on the **same frame** as the press (0 f). The dash moves at +2 f, but `dashStart` feedback is on the same frame.
- **End to end** (Playwright, `tests/e2e/latency.spec.ts`):
  - Hook `keydown` (`event.timeStamp`) and a rAF probe on the render-state player position (`__game.renderState()`).
  - Latency = the first rAF timestamp whose rendered position changed, minus the key timestamp.
  - 40 trials at seeded sub-frame offsets. **Assert p95 < 100 ms. Target p95 ≤ 50 ms.**
  - The loop must sample input right before stepping in the same rAF. If the accumulator yields 0 steps, the next rAF takes it (≤ 16.7 ms).
  - Display and compositor latency can't be measured headless. The report adds 1 vsync as an estimate.

### 7.3 Replays (`tests/replays/gym-NN.<abilities>.json`)

Format: `{room, seed, preset, tuningHash, assists, inputs: "<DSL>", expect}`.

Two levels of assertion:
1. **Behavioural** (survives tuning changes): reaches `G` within `expect.maxFrames`, zero deaths, and no state outside the allowed set.
2. **Golden** (only when `tuningHash` matches): the exact end `{x, y, frame}` and a state hash every 60 frames.
   - A tuning change marks goldens *stale* instead of failing.
   - `npm run replays:update` re-records them, using the bot (§8) for rooms whose old input no longer completes.
3. **Cross-runtime:** the same replay in Node (Vitest) and in Chrome (Playwright) must produce identical hash sequences.

### 7.4 Forgiveness metrics (the bot, assists A/B)

- **Window sweep:** for a named jump in a room (for example the gym-04 gap), shift the jump press across −12…+12 frames of the reference and count successes. Report `window(assist on)` versus `window(off)`.
  - Expected: coyote adds at least 5 frames to the gym-04 window.
  - The buffer adds at least 4 frames to the stepping-stone rhythm.
- **Humanised robustness:** perturb every input edge of a room's replay by a seeded ±2 frames. Over 200 trials, the success rate is the *room forgiveness score*.
  - Assists on must be ≥ assists off in every room.
  - Tracked over time in `feel:report`.

### 7.5 Feel report (`npm run feel:report` → `progress/feel/<date>.json` + markdown table)

- It measures, in the running sim, every metric in §3.4 for the active preset (plus stop distance, turn frames, wall-jump reach, and chimney climb rate in tiles/s).
- Each metric is compared against the Celeste–HK envelope, and anything **outside the envelope by more than 15%** is flagged.
- This is a sanity guard, not a definition of "good". The loop report includes the diff against the previous report whenever tuning changes.

### 7.6 Clips for the playtester agent (`npm run clip`)

LLM agents judge **stills** better than video, so ask the foundations agent's clip tool for these (or use per-frame PNG dumps as a fallback):
1. **Contact sheet:** every Nth frame (N=2) in a grid PNG with frame numbers.
2. **Motion-trail overlay mode:** the hitbox, a velocity vector, a ghost dot every 2 frames for the last 60, and event markers (J, L, D, C for corner correction).
3. **Event keyframes:** stills at takeoff, apex, landing and dash start/end.
4. A normal-speed mp4 or GIF for the human queue.

A playtester critiques one clip per gym room plus 3 motion studies (full jump, wall-jump chimney, dash + jump), and scores each 1–5 against this checklist:

| Check | Pass looks like |
|---|---|
| Arc legibility | The trail shows a smooth parabola, with visibly denser dots at the apex (hang) and a faster fall |
| Anticipation and impact | The squash on takeoff and landing is visible on the keyframes and scales with fall speed |
| Camera calm | Horizontal: no reversal jitter (the trail of the view centre is monotonic while running). Vertical: no motion during same-height jumps |
| Readability | The player never leaves the view window [15%, 85%]; the dash reads as a single streak |
| Correction invisibility | Corner-correction markers occur without a visible "teleport" (≤ 20 px lateral shift) |
| Numbers | For each clip, the critic also reads `state()` traces and cites frame numbers, not impressions |

Findings go to `progress/loops.md`. Taste calls go to `progress/user-inbox.md` as **non-blocking**, including "blind A/B of `opus` vs `celeste` vs `hk`, and does the 4.3-tile jump feel too high?".

### 7.7 Camera tests (headless, `camera.test.ts`)

| ID | Assertion |
|---|---|
| C1 | Jump and land at the same height: the camera's y is unchanged for the whole jump (platform snapping) |
| C2 | Land on a platform 3 tiles higher: y moves monotonically, with no overshoot, and settles within 60 f |
| C3 | Fall down gym-09: the player's feet stay within [15%, 85%] of the view every frame |
| C4 | The view never extends outside the room bounds, measured before shake is added |
| C5 | Hold Down 24 f → offset reaches ≥ 90% of `LOOK_DOWN` within 60 f; releasing returns it |
| C6 | Steady run: after 90 f, the player's screen x stays constant ±1 px (interpolation sanity) |
| C7 | Tap the opposite direction for 40 px: the focus doesn't flip (< 48) |
| C8 | Inside a `lock` zone: the view centre is at the zone value within 90 f |

---

## 8. Input bot (`tools/bot/`)

**Purpose:**
- Prove each room can be completed with the given abilities.
- Produce replays automatically.
- Measure forgiveness (§7.4).
- Later, become the edge oracle for the Phase 3 progression validator.

**Algorithm (best-first search over macro-actions):**
- **Node:** a full sim snapshot (`__game.snapshot()`, or the sim's `World.clone()` in Node). Snapshots must be cheap, meaning plain-data state.
- **Macro:** one of 12 input combos held for **k = 4 frames**: `. L R J LJ RJ X LX RX DA LDA RDA`. A jump that stays held across macros makes variable height emerge naturally.
- **Dedup key:** `(x>>3, y>>3, round(vx), round(vy), grounded, wallDir, airDash, dj, dashCd>0)`.
- **Priority:** `framesSoFar + euclid(player, goal)/MAX_SPEED_EST`, which is A*-like. Deaths are pruned.
- **Budget:** 300 k expansions (≈1.2 M sim frames) per query, run in Node, typically seconds per room.
- **Output:** the input DSL string, which is replayed from scratch to verify it (the bot's claims are only trusted after a clean replay). It is saved as a replay.

**Claims per room** (`claims` in the room JSON):
- `with`: the bot must find G.
- `without X`: with ability X removed, the bot must **not find** G within budget. The report words this as "not found within budget". It is not a proof. An analytic reach envelope arrives in Phase 3: precomputed landing offsets per ability set give a fast tile-graph check.

**CLI:**
- `npm run bot -- gym-10 --abilities dash --target G`
- `npm run bot:all` checks every room's claims (in CI, nightly, if it takes over 60 s).

---

## 9. Deferred (not in this loop)

| Item | Target |
|---|---|
| LDtk importer, doors, room transitions, neighbour preload | Phase 3 |
| Moving solids (carry and push), crumble or timed platforms | Phase 3, or a later Phase 1.5 loop if the gym needs rhythm |
| Slopes, crouch, ledge grab, swimming, glide ("Sustain") | Later; only if the concept needs them |
| 8-direction dash, down-dash, super dash | Revisit after the concept is locked |
| Real pogo (nail hitbox), knockback, hurt, i-frames, hitstop | Phase 2 (the hook exists: `player.bounce`) |
| Camera zoom for bosses, camera rotation shake | Phase 2 boss |
| Rig and animation (the placeholder is a rectangle with squash) | Phase 4/5 |
| Automatic "last safe ground" hazard respawn | Phase 3 (with the world) |
| Rumble, remapping UI, accessibility assist mode (game speed, infinite dash) | Phase 6 |
| Analytic reach envelopes for the progression validator | Phase 3 |

---

## 10. Build plan for the loop (for `progress/loops.md`)

**Milestones, in order. The cut line is after M4.**
1. **M1 (core):** grid, Actor, one-ways, hazards, the per-frame order, run and jump with all jump assists, `tuning.ts` with presets and the derivation, and V01–V11, V20–V24.
2. **M2:** wall slide and wall jump, dash, double jump, the pogo hook, and V12–V19.
3. **M3:** gym loader plus rooms 01–13, room select, greybox render, and hand-authored replays for 01–06.
4. **M4:** camera plus C1–C8, and the latency e2e test.
5. **M5:** juice, ZzFX SFX, Tweakpane panel and the blind A/B hotkey.
6. **M6:** the bot, `bot:all`, bot-generated replays for 07–14, forgiveness metrics and `feel:report`.

**Streams.**
- **A** (one agent) owns `src/sim/**` plus the tests. It is sequential and must never be shared (STUDIO §2.3).
- **B** (optional, parallel) owns `src/render/camera`, juice and `src/audio`, working against the `state()` and event contract in §2.8 and §5.
- **C** (after M2) owns `tools/bot` and `tools/feel`.

**Acceptance.**
- `npm run check` is green.
- V01–V24 and C1–C8 pass.
- Latency p95 < 100 ms.
- Every room 01–13 has a passing replay.
- `bot:all` claims hold.
- A playtester critique with contact sheets exists.
- `feel:report` has nothing outside the envelope, or anything outside it is justified.

**Kill criteria.** If exact frame tests prove brittle across runtimes (V22 or cross-runtime hashes fail for reasons other than bugs), fall back to fixed-point velocities: integers in 1/256 px/f.

**Memory entries to write:**
- the rounding rule and why
- the per-frame order
- the ZzFX vendoring reason
- the ASCII-now/LDtk-later decision
- any tuning changes, with feel-report evidence

**Human queue (non-blocking):**
- Blind A/B of the three presets on keyboard and gamepad.
- Is the jump height (4.3 tiles) right?
- Is acceleration versus instant response right?
- Feel sign-off on gym-13.

---

## 11. Disagreements with / changes to PLAN.md

1. **§7 Phase 1, "then from LDtk":** moved to Phase 3. The gym uses ASCII with the same `RoomData` schema (§6.1).
2. **§3.1, "Celeste distances scale by ×8":** a straight ×8 gives a 3.35-tile jump and 11.25 tiles/s of run. That is Celeste's small-sprite, big-world feel, and it is fast for a combat metroidvania. We **derive** from a jump shape that sits between Celeste and Hollow Knight, and keep Celeste ×8 as a preset.
3. **§3.1 variable jump:** Celeste's constant-speed hold (`VarJumpTime`) is replaced by default with Pittman gravity multipliers, so the closed form is exact. The hold remains available as `sustainFrames` for presets.
4. **§1 / §3.1, "Hollow Knight has no acceleration":** we default to 3-frame acceleration. Instant is the `hk` preset (D4).
5. **§3.1 dash freeze of about 3 frames:** 2 frames, because of the latency budget.
6. **§7 Phase 1, jsfxr:** use ZzFX per §4.0.
7. **§4.3, "Solids carry or push actors":** the interface only; moving solids are deferred.
8. **§7 Phase 1 exit criteria:** add objective gates (§10 acceptance) that let the orchestrator **move on provisionally** while human sign-off sits in the queue, in line with STUDIO §1b.
9. **Worth recording in PLAN §3.1:** Hollow Knight's real assists are much stingier than Celeste's (coyote and jump buffer are both about 40 ms, and there's no corner correction), but its double jump and dash queue are generous (about 0.2 s). Our defaults follow Celeste's generosity for jumps.

## Sources
- Celeste `Player.cs`: https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs
- Thorson, Celeste & TowerFall physics: https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5
- Thorson, game-feel/forgiveness thread: https://threadreaderapp.com/thread/1238338574220546049.html
- Hollow Knight `HeroController` constants: https://github.com/Jeffjewett27/AriadneAgent/blob/main/physics/hero_controller_constants.txt, decompiled source https://github.com/nickc01/WeaverCore/blob/master/Hollow%20Knight/HeroController.cs, and physics settings (gravity −60 ×0.79, 50 Hz, Knight collider 0.5×1.28) from https://github.com/Ramora0/hkrl (`analysis/specs/hero-motion.md`)
- Pittman, "Building a Better Jump" (GDC 2016): https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building
- Keren, "Scroll Back": https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers
- Eiserloh, "Juicing Your Cameras With Math" (GDC 2016): https://www.gdcvault.com/play/1023557/Math-for-Game-Programmers-Juicing
- Deepnight, game-feel demo: https://deepnight.net/games/game-feel/
- ZzFX: https://github.com/KilledByAPixel/ZzFX
- LDtk Super Simple Export: https://ldtk.io/docs/general/super-simple-export/
