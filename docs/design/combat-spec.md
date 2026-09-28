# Combat spec: Phase 2 greybox (*Tallage*)

Status: **draft, ready to build after L3** (the Seize/Levy traversal experiment). Owner: combat design. Date: 2026-09-28.
Scope: PLAN §7 Phase 2, rewritten for *Tallage* (PLAN §2, `docs/concepts/raw-L1-p4.md` Concept A, with the grafts in `critique-L1-A.md` and `critique-L1-B.md`).
Conventions: units, the 60 Hz tick, the 40×80 body, 64 px tiles and the per-frame order are the ones in `docs/design/movement-spec.md`. Every number here is a starting value and lives in `tuning.ts` (`combat` group) or in data files (`content/moves.json`, `content/enemies/*.json`), never inline.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| C1 | **Boxing kit, not a nail.** Jab, Cross (the 1-2), Uppercut, Overhand (the pogo). Short reach, fast startup, and you can walk while punching. | A boxer's reach is short, so her tools are speed, footwork and the slip. This reads differently from a sword at a glance and in the hands. |
| C2 | **Seize is the grab, Levy is the throw, Slip is the dash.** Seize only takes a sound from an enemy that is **open** (telegraphing, recovering, rattled by a jab, or down). | Boxing wisdom says the jab sets everything up. It keeps the jab relevant and makes Seize a read, not a delete button (critique A's "never forced" rule). |
| C3 | **Catch is the parry.** A Seize that lands during an enemy's **telegraph** takes the sound behind that attack, cancels the attack and staggers the enemy. There is no block button. | This is original, and it's the pitch's own boss counter ("seize *going twice* out of the air"). Unlike a Sekiro or Nine Sols deflect, you act *before* the hit, during a telegraph of at least 15 frames, so it's readable. |
| C4 | **Slip has i-frames from the start**, and a **clean slip** (i-frames overlapping a live hitbox) opens a 30-frame **Counter**: the next punch does double damage and knocks the enemy down. | Slip-and-counter is the heart of boxing, and it's Punch-Out's core loop (dodge, then punish the stun). |
| C5 | **The Count is the finisher.** Knocked-down enemies can **only be seized**, because hitting a man when he's down is a foul. A Seize during the ten-beat Count **repossesses** the enemy: it dies at once, pays double, and gives you its voice. | This ties the signature verb to every kill that matters, and makes the "take it, throw it back, take it for good" loop the fast route. |
| C6 | **One resource noun: sounds in the bag.** The bag (3 slots, FIFO, emptied when you leave a room) is your ammunition (Levy), your weight class, and your healing (**Swallow**, which works on *voices* only). There is **no soul or Resonance meter.** | The critics' main warning was over-stacked systems. A single noun gives Hollow Knight's heal-or-spell tension, but with items that have a colour and a mass. See §3.4. |
| C7 | **Ringing** (a one-pip rally): the pip you just lost rings for 2 s, and landing a Seize or a Counter wins it back. | Bloodborne and Dead Cells show that rally makes players aggressive. Tinnitus is on-theme for a city made of sound. |
| C8 | **Death is Counted Out, then Distrained.** Once per Corner (our Rest), you can **Beat the Count** by paying the referee with your bag. After that you're counted out, and a Receiver's **Runner** takes your Poundage and puts a **Lien** on one Chin pip. You get both back by **catching** the Runner (a chase, not a fight). | We own the shade loop but change its three weak points: it's a chase that uses your verbs, the penalty is legible (−1 max Chin), and there's a second wind in the boxing idiom. |
| C9 | **Fever is world tempo, not a player meter.** A fever level from 0 to 4 sets the Count's beat and enemy "hot" variants. Bosses may raise a *room* fever as one of their mechanics. | It keeps the HUD to Chin, bag and Poundage. You hear fever as BPM, and it's testable as an integer. |
| C10 | **Global hitstop, integer frame data, data-driven enemies** (telegraph, active and recovery lengths validated by Zod: every telegraph ≥ 15 frames), and **attack tokens** (at most 2 enemies attacking at once). | Determinism, agent-verifiable fairness, and the PLAN §1 bar of telegraphs ≥ 250 ms. Tokens are DOOM (2016)'s tool for crowd fairness. |

---

## 1. Player verbs

### 1.1 Buttons

| Action (sim `ACTIONS`) | Verb | Pad | Keys (arrows / WASD layouts) | DSL |
|---|---|---|---|---|
| `jump` | Jump | South | Z / J | `J` |
| `dash` | **Slip** | RT / RB | X / Shift | `X` |
| `attack` | **Jab** (and Cross, Uppercut, Overhand) | West | C / K | `A` |
| `seize` (new bit) | **Seize** | North | V / L | `S` |
| `levy` (new bit) | **Levy** | East | B / ; | `V` |
| `special` | **Swallow** (heal) | LT / LB | A / Q | `H` |

Direction comes from the held d-pad or stick **on the frame the move starts** (not on the press frame), so a buffered punch still turns around. The directions are forward (facing, or held L/R), Up, and Down (airborne only). Down on the ground is treated as forward.

### 1.2 Frame conventions

- **Frame 1** is the step that consumes the press. The action state and the `moveStart` event appear on frame 1; the A1 target is ≤ 6.
- **Startup S** means the first active frame is S+1. **Total** = S + A + R.
- **Hitboxes** are `(x, y, w, h)` in px, relative to the player box's top-left **when facing right**. For facing left, mirror with `x' = 40 − x − w`. The player box is `(0, 0, 40, 80)`.
- The **player hurtbox** is `(6, 8, 28, 68)`. It's smaller than the collision box, which is the same leniency Hollow Knight uses.
- Each move instance keeps a **hit list**, so a given target is hit at most once per instance.
- **Movement during moves.** You keep full run and air control during Jab, Uppercut, Overhand, Seize and Levy. Cross plants you (`MAX_RUN × 0.5`). Swallow roots you on the ground. Facing is locked from frame 1 to the end of active frames. This satisfies critique gate A3 (≥ 80% of momentum kept) and "no action roots for more than 12 frames", except Swallow, which is a deliberate commitment.

### 1.3 Frame data (preset `opus`)

| Move | Input | S | A | R | Total | Hitbox (facing right) | Dmg | Cancels (from frame) |
|---|---|---|---|---|---|---|---|---|
| **Jab** | `A` | 4 | 3 | 10 | 17 | `(28, 16, 80, 32)`, reaching 68 px (1.06 tiles) past the front edge | 2 | Cross, Seize, Levy, Jump, Slip from frame 8. Slip can also cancel startup (a **feint**). |
| **Cross** | `A` during a Jab (buffered from Jab frame 2) | 6 | 3 | 14 | 23 | `(28, 12, 100, 36)`, reach 88 px | 3 | Seize, Levy, Jump, Slip from frame 12. Starts on Jab frame 11 at the earliest. |
| **Uppercut** | `U+A` | 5 | 4 | 12 | 21 | `(-16, -64, 72, 96)` | 3 | Jump, Slip from frame 10. Launches light enemies upward. |
| **Overhand** (pogo) | `D+A`, airborne | 2 | 8 | 6 | 16 | `(-12, 56, 64, 72)`, 48 px below the feet | 2 | Slip from frame 11. On contact it calls `player.bounce(POGO_V, {refill, cutDisabled})`. |
| **Seize** | `S` (forward, `U+S` up, `D+S` down when airborne) | 5 | 3 | 6 on a take / 10 on a whiff or guard | 14 / 18 | Forward `(28, 8, 64, 48)`, reach 52 px. Up `(-8, -48, 56, 56)`. Down `(-8, 64, 56, 56)`. | 1 (always a hit) | Levy, Jump, Slip from recovery frame 1. Jab from recovery frame 3. |
| **Levy** | `V` + direction | 3 | spawn on frame 4 | 6 | 10 | Projectile spawns at `(44, 24)` going forward, `(12, -24)` going up, `(12, 80)` going down | by colour (§1.5) | Jump or Slip from frame 6. With an empty bag it's a **dry levy**: 6 frames, no effect, and emits `levyDry`. |
| **Swallow** | `H` | channel: violet 16 / pink 24 / brown 40 | commits on the last channel frame | 6 | 22 / 30 / 46 | — | heals (§3.4) | Slip cancels the channel and keeps the sound. Violet can be swallowed in the air; other colours need the ground. |
| **Slip** | `X` | movement-spec dash: 2 freeze + 12 move | i-frames on frames 1–10 | — | 14 (cooldown 24 from the press) | — | — | movement spec §2.7 (dash-jump cancel). A **clean slip** refunds the cooldown. |
| **Counter** | any Jab, Cross or Uppercut within 30 f of a clean slip | same as the base move | | | | same, ×1.25 size | ×2, plus a **knockdown** on non-bosses | as the base move |
| **Stand** (recover) | after hurt | — | — | 12 frames of control lock | — | — | — | Slip from lock frame 8 (a "roll with it"). |

**How this compares.**
- Hollow Knight's nail runs 0.35 s per attack, with a 0.41 s cooldown (about 21 and 25 frames).
- Our Jab is 17 frames with a 67 ms first active frame. It's faster and shorter than the nail, and the Cross gives the 1-2 a heavier second beat.
- Seize meets critique gate A2 (a 14-frame total on a take). A whiff costs 4 more frames, but you can still move, so it never roots you.

**Input buffering and cancels.**
- `ACTION_BUFFER_FRAMES = 8`. A press of `A`, `S`, `V` or `H` made while busy fires on the first legal frame, provided that frame is at most 8 frames after the press. Only the newest buffered action is kept.
- Jump and Slip use the movement buffers (6 frames each).
- Presses are latched during hitstop (movement spec §2.2 step 1), so a punch mashed during a freeze comes out on the first frame after it.
- The cancel graph is data (`content/moves.json`: `cancels: [{into, fromFrame}]`), not code.

**Weight class modifiers.** Weight class is derived from the bag (critique A graft): 0 brown sounds is **feather**, 1 is **middle**, 2 or more is **heavy**.

| | Feather | Middle | Heavy |
|---|---|---|---|
| Jab and Cross recovery | −2 f | ±0 | ±0 |
| Punch damage (Jab, Cross, Overhand) | ±0 | ±0 | +1 |
| Knockback taken | ×1.25 | ×1 | ×0 (i-frames still apply) |
| Slip | cooldown 18 | cooldown 24 | speed ×0.75, cooldown 24 |
| Overhand | pogo | pogo | pogo plus a landing **Drop** shockwave `(-44, 72, 128, 16)`, 2 dmg, breaks cracked floor |

### 1.4 Seize rules

1. **Targets.** A Seize can land on three kinds of thing:
   - **sound sources**: humming objects and armed enemy voices;
   - **in-flight enemy projectiles**, because every projectile carries its owner's sound;
   - **downed enemies** (§4.5).
   
   White static is never seizable. A Seize against white emits `seizeRefused`, and the target flashes white.
2. **Open vs guarded.** An enemy's voices are **open** during:
   - its telegraph (this makes the Seize a **Catch**);
   - its recovery;
   - stagger, launch, knockdown or the Count;
   - `RATTLED_FRAMES = 30` after taking any punch.
   
   Otherwise the enemy is **guarded**: the Seize does 1 damage, whiff recovery applies, and it emits `seizeGuarded`. Humming objects are always open.
3. **Which sound is taken.** A Catch takes the sound behind the telegraphed attack. Otherwise the Seize takes the first armed sound in the enemy's `seizeOrder`.
4. **What a take does.**
   - The sound leaves as a coloured ribbon, and the owner's attacks tied to it are **disabled** on the same frame (critique gate D1).
   - The owner enters **RETRIEVE** (§4.3).
   - The Seize applies 1 damage plus the `seizeTake` hitstop.
   - A **Catch** also cancels the attack and applies `STAGGER_FRAMES = 36` (a boss's data sets its own value).
5. **Bag FIFO.** Taking a 4th sound pushes the **oldest** one back to its source. This emits `bagPush`, and the source re-arms at once.
   - If the source is a humming object, it re-solidifies only when the player's box doesn't overlap it. Until then it stays a ghost and retries every frame, so it can never crush the player.
6. **Ringing.** A take or a Catch recovers the Ringing pip (§3.2).

### 1.5 Levy by colour (combat side; traversal behaviour is L3's)

Levy always throws the **newest** sound in the bag.

| Colour | Flight | Damage | Hitstop class | On landing | Downward Levy in the air |
|---|---|---|---|---|---|
| **Brown** (slab) | Arc: `vx 8`, `vy −10`, gravity `G_UP × 1.2` | 6, and knocks down non-heavy enemies | heavy | A 64×48 **solid slab**. It blocks enemy projectiles and line of sight (§5), and presses plates. | Falls straight at 24 px/f. Kid recoil-hops 176 px. |
| **Pink** (spring) | Lob: `vx 6`, `vy −12` | 2, and **launches** the enemy (`vy −14`; it can't attack for 30 f while airborne) | medium | A 64×16 **spring pad**. Bounces the player 240 px and enemies up too. | Spring spawns under your feet. Recoil hop 128 px. |
| **Violet** (dart) | Straight at 20 px/f, drifting up 0.5 px/f² | 3, pierces 2 enemies, ricochets once off a solid | medium | Despawns after 60 f and flies home to its owner | Dart goes down. Recoil hop 96 px. |

**Return to sender.** A levied sound that hits **its own owner** does ×1.5 damage (rounded up) and always knocks the owner down (a boss staggers for 90 f instead). The owner re-absorbs the sound, but it's now down and open for the Count.
- This **Seize → Return → Repossess** loop is the signature combat sentence.

---

## 2. Feedback stack per hit class

All of this is driven by sim events. **Hitstop and knockback happen in the sim.** Flash, camera, particles and sound happen in render and audio, which only read the sim.

- **Hitstop is global.** `state.hitstop = max(current, new)`, capped at 16, and hits on the same frame take the max, not the sum.
- During the freeze, input is latched, the renderer shakes the target sprite ±3 px (the Smash-style vibration), and the camera keeps decaying trauma.

| Class | Triggers | Hitstop | Flash | Enemy knockback (`× kbScale`) | Kid recoil | Trauma | Particles | Sound event |
|---|---|---|---|---|---|---|---|---|
| **light** | Jab, Overhand, guarded Seize | 4 | target white 3 f | 6 px/f, decays 1/f | −4 px/f for 4 f on the ground, −6 in the air, 0 when heavy | 0.10 | 4 sparks in the hit direction | `hit.light` |
| **medium** | Cross, Uppercut, violet or pink Levy | 6 | 4 f | 10 px/f (Uppercut: `vy −12`) | −5 px/f for 4 f | 0.18 | 8 sparks plus a ring | `hit.medium`, `levy.hit.{colour}` |
| **heavy** | brown Levy, Return to sender, heavy Drop | 10 | 6 f plus a 2 f screen tint in the colour | 14 px/f, plus knockdown | 0 | 0.35 | 14 motes in the colour, 2 dust slabs | `hit.heavy`, `levy.hit.brown` |
| **seizeTake** | Seize takes a sound | 5 | target's outline goes to **dashed** on the same frame | 4 px/f toward Kid (a tug) | 0 | 0.12 | ribbon in the colour flies from the target to the bag HUD over 12 f | `seize.take.{colour}` |
| **catch** | Seize during a telegraph | 10 | 6 f, plus Kid flashes gold | stagger | 0 | 0.30 | burst plus ribbon | `seize.catch` (a hard "clack" and the stolen wind-up cut short) |
| **counter** | a punch inside the Counter window | 12 | 6 f, plus 1 f of whole-screen inversion | 16 px/f, plus knockdown | 0 | 0.40 | star burst of 10 | `hit.counter` |
| **repossess** | Seize on a downed enemy | 16 | target desaturates to an outline | none (it sits down) | 0 | 0.30, plus a 3% render zoom punch | the ledger stamp in red ink, and the Poundage burst | `count.repossess` |
| **hurt** | Kid is hit | 8 | Kid flashes 3×, then 78 f of flicker; a vignette pulse | — | Kid: `vx ±10` decaying 1/f, `vy −8`, and a 12 f control lock | 0.45 | 6 sparks, then the Ringing pip halo | `hurt`, `ring.start` |
| **knockdown** | an enemy goes down | (the triggering class) | — | — | — | +0.1 | dust on landing | `down`, then `count.tick` on each beat |

**Event names.** These go in the `SimEvent` union and are also the keys in `content/audio/sfx.json`.

- **Moves:** `moveStart{move,dir}`, `hit{cls,move,target,dmg,x,y,dir}`, `whiff{move}`.
- **Seize:** `seizeTake{soundId,colour,owner}`, `seizeGuarded`, `seizeRefused`, `catch{attackId}`.
- **Levy:** `levyThrow{colour,dir}`, `levyLand{colour}`, `levyDry`, `recoilHop`.
- **Slip and counter:** `slipStart`, `slipClean`, `counterOpen`, `counterHit`.
- **Damage:** `hurt{dmg,src}`, `ringStart`, `ringRecover`, `ringLost`.
- **Swallow:** `swallowStart{colour}`, `swallowCommit`, `swallowSpill`.
- **Bag:** `bagPush{soundId}`, `bagLeak`, `snatch{soundId}`.
- **Enemies:** `telegraph{enemy,attackId,colour,frames}`, `attackActive{enemy,attackId}`, `down{enemy}`, `countTick{enemy,beat}`, `repossess{enemy}`, `rise{enemy}`, `ko{enemy}`.
- **Kid's own count:** `kidDown`, `beatCountTick`, `beatCountRise`, `countedOut`.
- **Death loop:** `distrained`, `redistrained`, `poundage{amount}`.

---

## 3. Health, damage, economy, death

### 3.1 Chin (health)

- **Chin** is your health, in pips. You start with **5** (Hollow Knight's starting mask count). Upgrades are deferred.
- Most enemy hits do 1 pip, and heavy attacks do 2. Hazards (spikes, static pits) do 1 pip, then respawn you at your **last safe ground**. This pulls the movement spec's deferred "last safe ground" respawn into Phase 2; see §9.
- Enemy bodies deal 1 pip on contact, except when the enemy is downed, staggered, repossessed or absorbing a sound.
- **After a hit:** 8 frames of global hitstop, a 12-frame control lock, and **78 frames (1.3 s) of i-frames**, the same as Hollow Knight's base invulnerability. Slip may cancel the control lock from frame 8.
- **Resolution order within a frame**, fixed and deterministic:
  1. player moves resolve against enemies;
  2. enemies resolve in ascending id order;
  3. enemy hitboxes resolve against the player;
  4. projectiles resolve;
  5. hitstop is applied (the max of that frame's requests).
  
  A Catch or stagger in step 1 cancels that enemy's hitboxes for step 3. On a same-frame trade, the player wins, which is the lenient choice.

### 3.2 Ringing (rally)

- The pip lost to the most recent hit **rings** for `RING_FRAMES = 120`. The HUD shows it vibrating.
- A Seize take, a Catch, a Counter hit or a repossession during that window restores it and emits `ringRecover`.
- A new hit while a pip is ringing loses the ringing pip for good, and the new pip starts ringing.
- Hazard damage doesn't ring.

Bloodborne's rally gives a 5 s window; Dead Cells refunds a portion of each damaging hit. Ours is one discrete pip, recovered only by the signature verbs. It's "answering back" in the boxing idiom, and it pays the Seize, not the button-mash.

### 3.3 Bag (3-slot FIFO, room-local)

- **Filling:** Seize fills the bag.
- **Spending:**
  - Levy throws the newest sound.
  - Swallow eats the newest sound.
  - A Snatch (§4.3) removes that specific sound.
  - Leaving the room returns every sound to its source (critique A's room-local regeneration).
  - White-static zones leak the oldest sound every 180 frames.
- **Weight class** is derived from the bag (§1.3).
- **Voices and deeds.** Sounds taken from creatures are **voices**. Sounds taken from objects are **deeds**. Only voices can be swallowed; trying to swallow a deed plays a 6-frame refusal and emits `swallowRefused`. The fiction: a hum is a title to *property*, while a voice is a title to *life*. Kid re-titles her own body with a voice, never with a wall.
- **Revoicing.** An enemy voice that isn't back with its owner after `REVOICE_FRAMES = 480` regrows at the owner, and the copy in the bag or in the world fades out (`bagLeak`). Sounds are conserved, so there are never duplicates. Deeds never regrow while you're in the room.

### 3.4 Swallow (heal), and why the economy looks like this

| Swallowed voice | Heals | Channel | Where |
|---|---|---|---|
| Violet | +1 pip | 16 f | ground or air |
| Pink | +1 pip | 24 f | ground |
| Brown | +2 pips | 40 f | ground |

- A **hit during the channel** spills the sound: it lands at your feet as a levied object of its colour, and its owner can reclaim it. You don't heal.
- A **Slip** cancels the channel and keeps the sound.
- Swallowing a voice makes its owner **Hoarse**: that attack stays gone until the room resets, and the owner stops retrieving and turns aggressive with its remaining attacks (speed ×1.2).

**Justification.**
1. **In the fiction:** a sound is a title deed, so being hit knocks the ringing out of you (Chin, Ringing), and healing means taking a voice into yourself. Kid is a bailiff who pays herself in what she seizes. "Poundage" is the real fee bailiffs charge on distrained goods.
2. **One noun, three tensions.** Every sound you take has three uses:
   - **Throw it** (damage, a knockdown, or a route).
   - **Keep it** (mass: heavy means no knockback and more damage, but you're slower).
   - **Eat it** (health, and it disarms the owner for good).
   
   That is Hollow Knight's heal-versus-spell choice, but each choice also changes the *enemy* (disarmed, chasing, or Hoarse) and your *body* (weight). It's a tempo trade, not a bank balance.
3. **Healing costs risk, not waiting.** You get voices by grabbing an *open* enemy at 52 px, which is as close as the game gets. It resembles Silksong's move toward "attack to earn the heal", but here the heal item *is* the enemy's weapon.
4. **Room-local bags stop hoarding.** You arrive at every fight with only your Chin. Attrition across rooms stays (Hollow Knight's exploration tension), and no carried resource can softlock the solver.
5. **Colour gives the heal texture.** Brown is big and slow, so you do it after a knockdown. Violet is quick and works in the air, as a panic heal. Choosing *which* enemy to seize becomes a decision.
6. **Currency: Poundage.** A KO pays ×1 and a repossession pays ×2, so the signature route earns more, which is Dead Cells' lesson about designing for how players optimise. It's spent at Phase 3 shops, maps and the like.

### 3.5 Death: Beat the Count, then Distrained

1. **Down.** When Chin reaches 0, Kid falls (`kidDown`) and a Count ring starts over her: 10 beats × `COUNT_BEAT_FRAMES`.
2. **Beat the Count.** This works once per Corner visit, and only if the bag holds at least 1 voice.
   - Press `J` within ±5 frames of any beat tick from 3 to 8. It's one press, never a mash.
   - Kid rises with 1 pip and 90 frames of i-frames.
   - **Every sound in the bag is paid to the referee**: all of them return to their owners at once, re-arming the room.
   - An assist toggle does this automatically. Punch-Out and Fight Night both let a downed boxer rise; ours is paid for out of the economy.
3. **Counted Out.** If Kid misses, has no voice, or has already used her count, she's out.
   - The screen fades on the tenth bell. She respawns at the last **Corner** (a Rest: the stool and bucket where the cutman patches you up) with full Chin, minus any Lien.
   - Enemies in the room reset.
4. **Distrained.**
   - A **Runner** (a Receiver's clerk) now holds all your Poundage and a **Lien** on 1 Chin pip: max Chin −1 until you redistrain. The Lien is shown as a pip with a red wax seal.
   - The Runner waits in the room where you went down. When you enter, it **flees**: runs at 7 px/f, turns at walls, jumps gaps, and slips your first two Seizes with a 12-frame hop. It has no attacks.
   - **Catching it** with a Seize (a jab knocks it down for 60 frames) returns everything (`redistrained`).
   - If you're counted out again before that, the old Runner's haul is **sold at auction** and gone, and a new Runner takes over. Only one Lien exists at a time.
   - Fleeing across the whole map, and redeeming at a pawnbroker, are deferred.

**Why this beats a plain shade.**
- You recover your loss with the same verbs you fight with (chase, open, grab). You don't fight a copy of yourself.
- The penalty is a legible body cost, a Lien, like Blasphemous's Guilt, not an invisible meter cap.
- The second wind comes from boxing and costs your bag, so the economy decides whether you get up.

**Fallback A/B** (tuning flag `death.mode`): `'runner'` (default) or `'garnish'`. With `'garnish'` there's no corpse run: lost Poundage becomes a debt paid from 50% of future earnings. The playtest decides.

---

## 4. Enemy framework

### 4.1 Data schema (`content/enemies/<id>.json`, Zod in `src/sim/ai/schema.ts`)

```ts
Enemy = {
  id, body: {w,h}, hurtbox: AABB, hp: int, contactDmg: int, kbScale: 0..1.5, poundage: int,
  flying: bool, class: 'fodder'|'elite'|'boss',
  sounds: [{ id, colour: 'brown'|'pink'|'violet'|'white', seizable: bool }],   // white ⇒ seizable:false (refined)
  seizeOrder: soundId[],
  attacks: { [id]: {
     sound: soundId,                       // the attack is armed only while this sound is home
     trigger: { range: AABB|'los', cooldown: int, weight: int },
     telegraph: int /* ≥15, Zod .min(15) */, active: int, recovery: int,
     hitboxes: [{ fromFrame, toFrame, box: AABB }] | { projectile: ProjectileDef },
     motion?: [{ fromFrame, toFrame, vx, vy }], dmg: int, stagger?: int,
     cue: { tint: colour, audio: string, aimLockFrame?: int } } },
  movement: { patrolSpeed, chaseSpeed, aggroRange, jump? },
  furious: { speedMult, telegraphDelta /* result still clamped ≥15 */ },
}
```

- **Runtime state per enemy:** `{state, stateFrame, hp, facing, sounds: {id: 'home'|'bag'|'levied'|'flight'|'consumed'}, rattled, token}`.
- **Hitboxes** are per frame range, which covers PLAN §4.3's "per animation frame".
- **Random choices** use `state.rng`, a weighted pick with no immediate repeat. There's **no `Math.sin`**: hover and bob use a 64-entry integer sine table in `src/sim/math/`, as `memory/sim-architecture.md` requires.

### 4.2 State machine (generic, in `src/sim/ai/enemy.ts`)

```
IDLE/PATROL ─aggro─▶ CHASE ─trigger && token─▶ TELEGRAPH ─▶ ACTIVE ─▶ RECOVERY ─▶ CHASE
   any ─seizeTake─▶ RETRIEVE ─(reclaimed)─▶ CHASE            TELEGRAPH ─catch─▶ STAGGER
   any ─knockdown─▶ DOWN(12f) ─▶ COUNT(10 beats) ─seize─▶ REPOSSESSED ; ─beat 10─▶ RISE(furious)
   any ─hp≤0─▶ KO (fodder)  |  DOWN+COUNT (elite/boss: phase end)
   STAGGER(n) / LAUNCHED(30f) ─▶ CHASE      swallowed voice ─▶ Hoarse flag (no RETRIEVE for it)
```

- **Attack tokens.** At most `MAX_ATTACK_TOKENS = 2` enemies can be in TELEGRAPH or ACTIVE at once. An enemy takes a token when it enters TELEGRAPH and releases it on RECOVERY.
- **No off-screen starts.** An attack may only begin if the enemy's hurtbox intersects the camera view rectangle, which the sim takes as an input from the room and camera bounds.

### 4.3 Owner-chase rule (RETRIEVE)

**What it chases.** The target is wherever the sound is:

| Where the sound is | Target |
|---|---|
| In the bag | Kid's centre |
| Levied | the object |
| In flight | the projectile's position |

**How it chases.**
- It moves at `chaseSpeed × RETRIEVE_SPEED_MULT` (1.25), dropping its current behaviour. Flyers go straight there; walkers path along the ground.
- Its other armed attacks may still fire, but RETRIEVE takes priority.

**How it gets the sound back.**
- **Levied object:** the owner touches it, **absorbs** it for 8 frames (open and unable to attack), and re-arms.
- **In the bag: Snatch.** Every enemy has this generic attack, with its own data entry:
  - telegraph 16, active 4, recovery 24;
  - hitbox = body + 24 px in front;
  - **0 damage**, removes that sound from the bag, pushes Kid back 8 px/f and grants no i-frames.
- **Unreachable:** if the owner can't get to the sound, revoicing (§3.3) settles it after 480 frames.
- **Herding and bait:** levy a sound across a gap and its owner follows it.

### 4.4 The four archetypes

Every telegraph cue tints the enemy's hum outline in the attack's colour and plays a wind-up sound that rises in pitch toward the active frame.

**Barker** (walker): a bowler-hatted guard dog chained to a pawnshop.
- Body 72×48, hurtbox `(4, 4, 64, 44)`, HP 8, kbScale 1, 3 Poundage.
- Patrols at 2.5 px/f and chases at 5 px/f. Its aggro range is 8 tiles.
- Sounds: **Bark** (pink).

| Attack | Sound | Trigger | Tele | Active | Rec | Hitbox | Dmg | Telegraph read | Punish |
|---|---|---|---|---|---|---|---|---|---|
| Lunge | Bark | within 4 tiles on x, ±1 tile on y | 18 | 12 (vx 14) | 26 | `(40, 4, 48, 40)` | 1 | Crouches back 8 px, three pink pulses, "rrr-" | 26 f of skid: jab, jab, then seize |
| Snatch | — | retrieving | 16 | 4 | 24 | generic | 0 | Ears up, pink outline flicker | |

**Stock Gull** (flyer): a ticker-tape gull that screams prices.
- Body 56×40, HP 6, kbScale 1.2, 3 Poundage.
- Hovers 3–4 tiles above Kid on a sine-table bob (±16 px, 90 f period).
- Sounds: **Screech** (violet).

| Attack | Sound | Tele | Active | Rec | Hitbox / motion | Dmg | Telegraph read | Punish |
|---|---|---|---|---|---|---|---|---|
| Dive | Screech | 24 (aim locks on frame 16) | 20 frames at 16 px/f along the locked vector, or until it hits a solid | 30, or 45 if beak-stuck in the floor | whole body | 1 | Rises 32 px, folds its wings, crescendo; a violet aim line for the last 8 f | Beak-stuck 45 f: Overhand pogo it, or seize the Screech |

**Grinder** (charger): a knife-grinder's cart with an engine for a heart.
- Body 112×112, hurtbox `(8, 8, 96, 104)`, HP 18, kbScale 0.25, class `elite`, 8 Poundage.
- Walks at 1.5 px/f.
- Sounds: **Growl** (brown) and **Whet** (violet). `seizeOrder` is Growl first, then Whet.

| Attack | Sound | Trigger | Tele | Active | Rec | Hitbox | Dmg | Telegraph read | Punish |
|---|---|---|---|---|---|---|---|---|---|
| Charge | Growl | within 10 tiles, line of sight | 28 (backs up 24 px) | up to 60 at 15 px/f; stops at a wall or ledge edge | 36; 60 if it hits a wall (stun) | `(100, 8, 40, 96)` | 2 | Engine revs, brown hum swells, sparks at the wheels | Wall stun: 60 f open |
| Sparks | Whet | within 2 tiles | 20 | 10 | 24 | `(96, 48, 96, 64)`, a low cone | 1 | Wheel spins up, violet hiss | 24 f |

Because Grinder is an elite, a knockdown on it starts the Count; at 0 HP it's a KO.

**Clerk** (ranged): a Receiver's clerk with a rubber stamp and a pocket tannoy.
- Body 48×88, HP 10, kbScale 0.75, 5 Poundage.
- Keeps 5–8 tiles away. If Kid comes within 3 tiles, it hops back 2 tiles (a 12-frame move, not an attack).
- Sounds: **Thump** (brown) and **Tannoy** (white, not seizable).

| Attack | Sound | Tele | Active | Rec | Hitbox / projectile | Dmg | Telegraph read | Punish / counter |
|---|---|---|---|---|---|---|---|---|
| Stamp | Thump | 22 | Mortar: a 48×32 ballistic shot, lands within 90 f; on landing, a shockwave `96×24` for 6 f | 34 | projectile | 1 | Stamp raised overhead; a brown landing mark on the floor for the whole telegraph | **Catch the stamp in flight** (Seize): Stamp is disabled and the Clerk comes to you (RETRIEVE) |
| Tannoy | Tannoy (white) | 20 | 8 | 30 | a radius-96 ring around the Clerk | 1 | Tannoy raised; a white static ring grows | Unseizable: slip through it or step back. It teaches the white rule. |

**The Pit roster** (critique A's combat room) is 2 Barkers and 1 Grinder. It's the first Phase 2 test room, and it can be built in L3 from this schema.

### 4.5 Knockdown and the Count

**What knocks an enemy down:**
- a Counter hit;
- a Return to sender;
- a brown Levy on a non-heavy enemy (kbScale > 0.5);
- a Drop;
- for elites and bosses, reaching 0 HP.

**How the Count runs.**
- DOWN lasts 12 frames, then COUNT runs for 10 beats. `COUNT_BEAT_FRAMES = [12, 11, 10, 9, 8][fever]`, so at fever 0 the Count lasts 120 frames.
- A downed enemy has **no punch hurtbox, only a seize hurtbox**. Punches pass through it and emit `whiff{reason:'down'}`, and the ring flashes a small "no" tick.

**How it ends.**
- A **Seize during the Count repossesses** the enemy: it's removed, pays ×2 Poundage, restores the Ringing pip, and its first armed voice goes into your bag.
- If the Count reaches beat 10, the enemy **rises Furious**: its `furious` modifiers apply (speed ×1.2, telegraphs −4 frames, clamped ≥ 15), and its HP is unchanged.

**Fodder** at 0 HP is simply a KO, with no Count.

---

## 5. Greybox boss: The Auctioneer (2 phases)

**Arena** (30×17 tiles, `content/rooms/boss-auction.json`). The sketch below is not to scale; the loader pads it with solid tiles.

```
##############################
#............................#
#............................#
#.........====....====.......#   one-ways (gallery)
#............................#
#..........[rostrum].........#   Auctioneer home: x 13-16, on a 4-tile lectern (solid)
#............######..........#
#............................#
#............................#
#.LLL.LLL.LLL.LLL.LLL.LLL.LL.#   8 floor lots (L): humming, not seizable by Kid ("under the hammer")
#wwwwwwwwwwwwwwwwwwwwwwwwwwww#   static pit (w): 1 pip + safe-ground respawn
##############################
```

- **Body** 128×192. **HP:** phase 1 is 36, phase 2 is 44. kbScale 0, class `boss`.
- **Boss exceptions to §4:**
  - Bosses never RETRIEVE. A seized boss sound **revoices after 240 frames**.
  - Return to sender **staggers him for 90 frames** instead of knocking him down.
  - He is never guarded. His voices are open whenever he's in telegraph, recovery or stagger, as usual.
- **Room fever** starts at 0. It rises by 1 with each successful SOLD, to a maximum of 3, and drops by 1 when you seize "Twice". Fever shortens his patter interval and the Count beat.

**Phase 1: "Lots on the floor"**

| Move | Sound (colour) | Tele | Active | Rec | Dmg | Read | Counters and punish window |
|---|---|---|---|---|---|---|---|
| **Patter** | Patter (violet) | 24 | 5 darts, one every 10 f, aimed at Kid's position when each is fired; each 24×12 at 9 px/f | 30 | 1 each | Lectern glows violet, "rat-a-tat" rising | **Catch** one dart: the volley ends and he's flustered for 40 f. Or slip the stream. |
| **Gavel** | Gavel (brown) | 22 (gavel raised high) | 6, with hitbox `(128, 32, 160, 96)` in front | 40 | 2 | Brown glow, a wood creak | Catch during the telegraph: stagger 60 f, and you hold the Gavel (brown). Return it: 9 dmg and stagger 90. Or punish the 40 f recovery. |
| **Going once… twice… SOLD** | Cadence (pink) | beat 1 (30 f): a lot is marked. Beat 2 (30 f): a pink **TWICE** word object hangs 2 tiles above the marked lot. | SOLD (frame 61): the marked lot ghosts for 300 f, and a floor shockwave 32 tall runs outward at 12 px/f | 45 | 1 | Three-beat call; the lot outline flashes on each beat | **Seize TWICE**: cadence broken, stunned 90 f, fever −1. **Or levy brown onto the marked lot** ("outbid"): the sale fails and he's stunned 45 f. Or jump the wave and punish the 45 f recovery. |
| **Hop** | none | 16 (crouch) | moves to the other end of the rostrum | 12 | contact only | — | — |

- **Move selection:** a weighted random pick, with Cadence forced on every 3rd action. Gavel is only chosen when Kid is within 3 tiles.
- **Phase change:** at 0 HP he's **knocked down**, and the Count starts.
  - **Seize during the Count:** you repossess the **Gavel**. It goes to your bag, and phase 2 loses both Gavel and the SOLD shockwave (lots still sell).
  - **Count runs out:** he rises Furious, with his full kit.

**Phase 2: "Today's lot: your bag"**

- Room fever +1.
- Patter interval: fever 1 → 9 f, 2 → 8 f, 3 → 7 f.
- Cadence beats shorten to 26 f at fever 2 and 22 f at fever 3, so the total telegraph is still ≥ 44 f and every beat is ≥ 15 f.

| Move | Sound | Tele | Active | Rec | Dmg | Read | Counters and punish window |
|---|---|---|---|---|---|---|---|
| Patter | violet | 24 | darts as above, at the faster interval | 30 | 1 | as phase 1 | as phase 1 |
| Cadence (2 lots) | pink | 2 beats | as phase 1, but two lots | 45 | 1 | two lots marked | as phase 1 |
| **Selling Your Bag** | Cadence (pink) | 2 beats; the TWICE word hangs **above Kid's head** and follows her with a 20 f lag | SOLD (one frame). If Kid has a sound, is in his line of sight (an integer DDA ray from the lectern to her centre, blocked by solids and brown slabs) and has no i-frames, her **oldest** sound becomes his. If her bag is empty, it costs 1 pip. | 45 | 0 or 1 | a coin-drop "ding" on each beat | **Up-Seize TWICE** (stun 90). **Slip on the SOLD beat.** **Hide behind a slab** (break line of sight). Or empty your bag first. |
| **Uses what he bought** (next action) | the sound he took | 20 | Brown: a slab drops on Kid's x, with a 20 f shadow first. Pink: he springs to the far end. Violet: a 3-dart fan. | 30 | 2 / 0 / 1 | the bought colour glows on the lectern | Catch the brown slab in the telegraph and take it back |
| Gavel | brown | 22 | as phase 1, only if it wasn't repossessed | 40 | 2 | | |

**Final knockdown.**
- At 0 HP he goes down and the Count starts. **Seize = win** (`repossess{boss}`).
- If the Count runs out, he rises with 25% of phase-2 HP and fever +1: "one more round".
- Boss-as-machinery (the Gavel as a hub lift) is deferred to Phase 3.

**Punish windows** (frames in which Kid can act freely and he's open):
- Gavel recovery: 40
- Cadence recovery: 45
- TWICE stun: 90
- Outbid stun: 45
- Catch stagger: 60
- Return-to-sender stagger: 90
- Patter fluster: 40
- The Count: 120 at fever 0, 80 at fever 3

**What the fight tests:**
- a Catch on a projectile and on a melee telegraph;
- Levy as terrain (the outbid);
- Levy as cover (line of sight);
- the FIFO bag as a liability;
- the Count as the phase gate;
- Ringing;
- Swallow under pressure, using violet darts you caught.

---

## 6. Objective verification

Everything runs headless on the sim, then gets confirmed in the running game with `playwright-cli` (`state().combat`, and screenshots of the Count ring and the bag HUD).

### 6.1 Unit tests (Vitest, `tests/unit/combat/`)

| # | Test | Pass |
|---|---|---|
| U1 | Frame data: for each move in `content/moves.json`, drive the input and assert the frames of `moveStart`, first active, last active and return to NORMAL | Exact |
| U2 | Mirror: every hitbox, facing left and right, gives mirrored overlaps against a grid of target boxes | Exact |
| U3 | Buffer: a press made 8 frames before the move becomes legal fires; one made 9 frames before doesn't. Presses during hitstop fire on the first free frame. | Exact |
| U4 | Cancels: every edge in the cancel graph fires on its `fromFrame` and never one frame before | Exact |
| U5 | Seize: guarded → `seizeGuarded` and 1 damage. Open → take. A take disables the tied attack on the same frame and puts the owner in RETRIEVE within 10 f (critique D1). | Exact |
| U6 | FIFO: a 4th take pushes the oldest back, and its owner re-arms on the same frame. The bag never holds more than 3. | Exact |
| U7 | Hitstop merge: two hits on one frame give the max, not the sum. The cap is 16. | Exact |
| U8 | i-frames: every hit during 78 f of i-frames is ignored. Hazards still register. | Exact |
| U9 | Count: a punch on a downed enemy never hits. A Seize on beat k (for k from 1 to 10) repossesses. Beat 10 plus 1 frame → RISE. | Exact |
| U10 | Beat the Count: a press within ±5 f of beats 3–8 rises (once per Corner). Mashing counts as one press. No voice means no rise. | Exact |
| U11 | Revoice: after 480 f the voice is home, the bag copy is gone, and the number of sounds is conserved | Exact |

### 6.2 Data lint (Zod plus a `npm run lint:combat` script)

- **T1.** Every enemy attack has `telegraph ≥ 15`, including after `furious` and fever modifiers are applied.
- **T2.** Every attack names a `sound`. Every sound with `seizable: true` is non-white, and every white sound is not seizable.
- **T3.** Every telegraph has a `cue.tint` equal to its sound's colour, plus an audio cue.

### 6.3 Trace checks (run over every tape and bot fight)

- **T4.** Every `attackActive` is preceded by a `telegraph` for the same enemy and attack, at least 15 sim frames earlier. Hitstop frames don't count toward the 15.
- **T5.** No attack starts with the enemy outside the camera view.
- **T6.** At most 2 attack tokens are held at once.
- **T7.** Every `hit`, `seizeTake`, `catch`, `counterHit`, `repossess` and `hurt` is accompanied on the same frame by a hitstop request and the matching sound event (critique A4). This must hold 100% of the time.

### 6.4 Fairness bots (extending `tools/bot/`)

**Policies.** These are scripted reactive policies over `__game.snapshot()`, seeded. Each run is saved as a replay.

| Policy | What it does |
|---|---|
| `competent` | Reaction 12 f. Slips or catches correctly 95% of the time. Uses jab → seize → levy → Count. |
| `sloppy` | Reaction 24 f. 25% wrong choice, and never Catches. |
| `jabOnly` | `competent`, but never seizes or levies. |
| `signature` | `competent`, preferring the Catch/Return/Repossess loop. |
| `reactor` | Reaction exactly 15 f. Only evades, never attacks. |

**Metrics** (50 seeds each):

| # | Metric | Target |
|---|---|---|
| F1 | **Reactability:** the `reactor` avoids each attack in 1v1 isolation, per attack | ≥ 95% of attacks avoided |
| F2 | **No unavoidable damage:** for each attack, from 100 sampled positions, BFS over evasive macros starting at telegraph + 15 f finds an escape | 100% |
| F3 | **Time to kill, `competent` + `signature`** | Barker ≤ 150 f; Gull ≤ 180; Grinder ≤ 360; Clerk ≤ 300; The Pit ≤ 900; Auctioneer ≤ 120 s |
| F4 | **Signature dominance:** TTK(`signature`) / TTK(`jabOnly`), per enemy and for The Pit | **0.50–0.75**: at least 25% faster (critique D2) but no more than 2× faster, so the jab still matters. `jabOnly` must win 100% of the time. |
| F5 | **Damage taken, `competent`** | The Pit ≤ 1 pip; Auctioneer ≤ 2 pips (after Ringing refunds) |
| F6 | **Damage taken, `sloppy`** | The Pit: wins ≥ 80%, ≤ 3 pips on average. Auctioneer: wins ≥ 30% (a first boss should be hard for a sloppy player, not impossible). |
| F7 | **Economy flow per minute** (`signature`): takes, levies, swallows, Ringing recoveries | ≥ 1 swallow available per 30 s of fighting; Ringing recovered on ≥ 50% of hits |
| F8 | **Verb density:** in The Pit's `signature` tape, the longest stretch with no punch, seize, levy or slip | ≤ 60 f |

**Theoretical damage rates** (frames of pure uptime). They are recomputed by `feel:report` from the data, so F4 has a baseline to compare against:

| Loop | Damage / frames | Damage per second |
|---|---|---|
| Jab spam | 2 / 17 | 7.1 |
| Jab → Cross | 5 / 34 | 8.8 |
| Jab → Seize → brown Levy on another enemy | 9 / 41 | 13.2 |
| Jab → Seize → Return to sender → Count Seize | kill in about 75 f | (any HP) |
| Clean slip → Counter Cross → Count Seize | kill in about 55 f | (any HP) |

**Tuning levers if F4 misses:**
- `RATTLED_FRAMES`
- the Return multiplier
- the brown Levy damage
- enemy HP

### 6.5 Determinism

- **D1.** Every fight replay, run 3 times, gives the same state hash at every 60th frame.
- **D2.** Node and Chrome (via `playwright-cli eval`) give the same final hash for The Pit and Auctioneer tapes.
- **D3.** 500 seeded random-input runs × 3600 frames in The Pit and the boss room:
  - no NaN;
  - the bag never holds more than 3;
  - no levied entity sits inside a solid;
  - Chin stays between 0 and its max;
  - every enemy ends in a legal state;
  - the number of sounds is conserved.
- **D4.** A lint forbids `Math.random`, `Date.now` and `Math.sin`/`cos` in `src/sim/ai` and `src/sim/combat` (this already exists for the sim; extend it).

### 6.6 For the human (queued, never blocking)

- Does the Jab feel quick enough without nail reach?
- Does a Catch feel like stealing a punch?
- Does the Count feel like a finisher, or like a chore?
- Is the Swallow-or-Levy choice felt in the moment?
- Blind A/B on hitstop (4/6/10 vs 3/5/8) and on death mode (`runner` vs `garnish`).

---

## 7. What L3 (the Seize/Levy traversal experiment) must build so combat can reuse it

L3 is building Seize and Levy. It should build them **as the combat versions**, with enemies stubbed, not as one-off traversal code.

| L3 must build | Shape it must have | Reused by |
|---|---|---|
| **Move table** `content/moves.json`, plus a generic action state machine in `src/sim/player/moves.ts` | Startup, active and recovery, per-frame hitboxes, cancels, buffer. Seize and Levy are entries, and a Jab entry exists (critique A's plain jab). | Every Phase 2 move |
| **Hitbox/hurtbox module** `src/sim/combat/boxes.ts` | Generic overlap, hit lists, facing mirror, resolution order (§3.1) | Enemies, boss, projectiles |
| **Sound model** `src/sim/sound.ts` | `Sound {id, colour, kind: 'voice'\|'deed', owner, status}`. Status goes home → bag → levied/flight → home/consumed. Conservation invariant. | Seize, Levy, Swallow, RETRIEVE, revoice, FIFO push-back |
| **Sound-source component** | One component for humming walls, furnaces **and** enemies: `{soundIds, open(): bool, onSeize, onReturn}`. Objects are always open. | Enemy voices, boss lots |
| **Bag** | 3-slot FIFO, newest-out, oldest pushed on overflow, room-exit return, derived weight class | Economy, weight modifiers |
| **Levied entities** | Brown slab (a Solid), pink spring, violet dart, as Actors on the movement physics. **Damage fields and `owner` go on them now**, even if nothing reads them yet. | Levy damage, Return to sender, line-of-sight blocking |
| **Global hitstop** `state.hitstop` with max-merge, and input latching (movement spec §2.2) | | Every hit class |
| **Events** with the §2 names (`seizeTake`, `levyThrow`, `bagPush`…) | | Render and audio feedback stack |
| **`player.bounce`** used by the downward Levy recoil hop | | Overhand, pogo |
| **Enemy schema stub** | Barker and Grinder built from `content/enemies/*.json` with TELEGRAPH, ACTIVE and RECOVERY plus RETRIEVE, even if L3 only needs "seize disables the lunge" | The whole of §4 |
| **Input bits** `seize` and `levy`, and DSL letters `S` and `V` | | Everything |
| **Debug API** `state().combat = {chin, bag, weight, hitstop, iframes}`, `state().enemies`, `__game.spawn(type, x, y)` | Keep `step`, `state`, `input` and `load` intact | Bots, playwright checks |
| **Humming and dashed outline shader**, plus the bag HUD with ribbons | | Every feedback row |

**Anti-rework rule.** No `if (target is wall)` branches. Walls, enemies and projectiles all go through the sound-source component and the box module.

---

## 8. Deferred

| Item | When |
|---|---|
| Hook, body shot, charged haymaker, combos longer than 1-2 | After the human signs off on feel |
| Corner Satchel colour combos, Standing Count, Writ (ranged seize and grapple) | Ability phase (critique A's cut list) |
| Passive-voice riding of enemy sounds | Mid-game ability (critique B graft 1) |
| Weigh-in gates, heavy sinking in water | Phase 3 world |
| The Runner fleeing across rooms, pawnbroker redemption | Phase 3 (needs the world graph) |
| Chin upgrades, charm-equivalents ("sponsorships"), shops | Phase 3 / 6 |
| The world fever clock tied to story beats (critique B graft 4) | Phase 3. Phase 2 only has `fever` as a debug integer and a boss room variable. |
| Boss-as-machinery (repossessed Gavel as a hub lift) | Phase 3 |
| White-static enemies, enemy friendly fire, enemy variants | Phase 6 |
| 8-way Levy aim, gamepad rumble, accessibility (slow mode, auto-Catch) | Phase 7. The auto Beat-the-Count assist ships now. |
| Rigged animation. Hitboxes stay per frame range until a rig exists. | Phase 4/5 |

## 9. Changes to PLAN and the movement spec

1. **PLAN §7 Phase 2** says "nail-style slash in 4 directions" and "Resonance for healing and one spell". This spec replaces them with the boxing kit (§1) and **the bag as the only resource**: Swallow is the heal and Levy is the "spell". There's no Resonance meter.
2. **PLAN §3.3**, "11 per hit, heal 33": not used. The equivalent pacing target is F7, at least one swallow available per 30 s.
3. **Movement spec §9** deferred "last safe ground" respawn to Phase 3. It's **pulled into Phase 2**, because hazard damage in fights needs it.
4. **Movement spec §2.7** pogo probe `48×64 / 8 f` becomes the Overhand hitbox `64×72`, active 8. It uses the same `player.bounce` path.
5. **New input bits:** `seize` and `levy`. `special` becomes Swallow.
6. **Attack tokens** (at most 2) are a new rule, added to PLAN §4.3's enemy line.

---

## Sources

- **Hollow Knight:**
  - Nail duration 0.35 s, cooldown 0.41 s, i-frames 1.3 s, recoil 0.2 s: [Stalwart Shell (wiki)](https://hollowknight.fandom.com/wiki/Stalwart_Shell), [Quick Slash](https://hollowknight.wiki/w/Quick_Slash).
  - Focus is 33 soul and 1.141 s for the first mask: [Focus](https://hollowknight.fandom.com/wiki/Focus).
  - Soul gain of 11 per hit: `HeroController` ([decompiled](https://github.com/nickc01/WeaverCore/blob/master/Hollow%20Knight/HeroController.cs)).
  - [Knockback analysis](https://atomicbobomb.home.blog/2019/02/05/hollow-knight-knockback/).
- **Silksong:** Bind heals 3 masks for 9 silk, a faster heal earned by attacking: [Bind](https://hollowknight.wiki/w/Bind).
- **Punch-Out!!:**
  - Dodge-then-counter stun, stars earned by counter-timed hits and lost when hit, hearts drained by being hit or blocked, knockdowns and get-ups: [Punch-Out!! (NES)](https://en.wikipedia.org/wiki/Punch-Out!!_(1987_video_game)).
  - "Puzzlebox fighter" pattern learning: [Game Developer deep dive](https://www.gamedeveloper.com/business/reworking-punch-out-for-mobile-an-extremely-deep-dive-into-election-year-knockout).
- **Thrill of the Fight:** no health bar; each punch is judged individually, by velocity: [official guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1780809608), [UploadVR on TotF 2](https://www.uploadvr.com/the-thrill-of-the-fight-2-ian-fitz-interview-early-access-impressions/).
- **Fight Night Champion:** stamina scales power and speed, and recovery happens between rounds (our Corner): [manual](https://eaassets-a.akamaihd.net/eahelp/manuals/fight-night-champion-manuals_Microsoft%20XBOX360.pdf).
- **Sifu:** structure as stance-breaking; aging as a death cost with a fictional reason: [combat](https://blog.playstation.com/2021/11/18/how-sifus-kung-fu-combat-works/), [death and aging](https://blog.playstation.com/2021/11/18/how-sifus-death-and-aging-system-functions/).
- **Nine Sols:** precise and imprecise parry, one Qi per parry, talisman burst, internal damage: [Combat (wiki)](https://ninesols.wiki.gg/wiki/Combat).
- **Blasphemous:** Guilt Fragments cut max fervour until recovered: [Guilt](https://blasphemous.wiki.gg/wiki/Guilt).
- **Rally:**
  - Bloodborne's rally gives a 5 s window to win back health by attacking: [Rally](https://bloodborne.wiki.fextralife.com/Rally).
  - Dead Cells' recovery bar: [Mechanics](https://deadcells.wiki.gg/wiki/Mechanics).
- **Dead Cells**, on designing for how players optimise: [GDC 2019](https://media.gdcvault.com/gdc2019/presentations/Benard-Sebastian-DeepCells.pdf).
- **Frame data:** [Dustloop, Using Frame Data](https://www.dustloop.com/wiki/index.php/Using_Frame_Data), [SuperCombo, Frame Data](https://wiki.supercombo.gg/w/Frame_Data).
- **Hitstop:** [critpoints](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/). **Camera trauma:** [Eiserloh GDC 2016](https://www.gdcvault.com/play/1023557/Math-for-Game-Programmers-Juicing).
- **Telegraphs:** [Enemy attacks and telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing).
- **Attack tokens:** [DOOM (2016) GDC, "Embracing Push Forward Combat"](https://www.gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in), [The AI of DOOM](https://www.gamedeveloper.com/design/cyber-demons-the-ai-of-doom-2016-).
- **Prior art checked:** Guacamelee! 2, a luchador brawler metroidvania, is the nearest neighbour ([Wikipedia](https://en.wikipedia.org/wiki/Guacamelee!_2)). We found no shipped metroidvania built on a boxing kit where the grab steals the enemy's attack.
