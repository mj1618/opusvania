# L4 combat greybox: expert critique

Reviewer: expert4 (action-combat design pass). Date: 2026-09-28. Build: working tree at f5a4cf3 (dev server :5193).
Inputs: combat-spec, L4-combat.md, memory/combat*.md, content/moves.json, content/enemies/*, src/sim/ai/*, src/sim/combat/*,
the four clips, and my own runs (scripted policies in ring-barker and the Pit, a replay of `npm run fight -- --room auction --fighter competent --seeds 1` with the boss state tallied per frame).

## Verdict in one paragraph

The foundation is sound. The frame data is honest, the fairness tooling (telegraph lint, F1/F2 escape search, tokens, determinism) is better than most shipped games have, and the kit (jab, 1-2, Catch, Slip-counter, the Count) has a real identity. The failures are **structural, not numeric**. (1) Every route into the signature loop has to be *given* by the enemy, and the payoff is spent flinging the enemy out of reach. (2) The boss can be stun-locked. (3) The health economy leaks from three places, so taking damage barely matters and Swallow has no job. HP tweaks will not fix any of these. **Do a short, time-boxed L5 of mechanic changes (items 1–6 below, about a week of agent time plus one human session), then build the vertical slice and do all number tuning inside it.**

## What I measured myself

| Test (ring-barker, point blank, scripted) | Frames from first contact to kill |
|---|---|
| Jab-Cross, Jab-Cross (2+3+2+3 = 10 HP) | 57 f (f130 → f187) |
| Jab → Seize (take) → Levy Return → Count Seize | 45 f (0.79×) |
| Catch → Levy Return → Count Seize | 38 f from the Catch (0.67×) |

- **The loop is fast to execute but slow to access.** The bots' 0.88–1.00 comes from waiting for a telegraph and walking, not from the loop itself. The signature route also pays 31 f of its own hitstop (seizeTake 5 + heavy 10 + repossess 16), against 20 f for four punches.
- **The Auctioneer (competent bot, seed 1, 1265 f):**
  - He spent **592/1320 frames (45%) in STAGGER** and started only **4 attacks** in 21 s (patter, hop, cadence, hop). The Gavel never swung.
  - There were **0 Catches** and 0 Counters. The whole fight was 6 takes and 6 Returns. The bot's tape is `R+S1 .22 R+S1 .22 …`: it spams guarded Seizes through the Return stagger.
  - Why that works: a guarded Seize calls `damageEnemy`, which sets `rattled = 30`. So the moment `guardT` expires he is open again, and the next Seize takes the Gavel during his 36-frame idle, **before any telegraph can start** (`idleFrames 36` > Seize startup 5).
  - The L4 "a stagger can't be extended" fix only moved the lock. It did not remove it. The pitch's own boss verb, seizing TWICE out of the air, never happens.
- **Free heal after every fight.** Tested: repossess the last enemy, the room clears, the voice is still in the bag, so Swallow heals (+1, f234–f257). Every fight that ends on a repossession refunds a pip. With Ringing refunding 70% of hits, attrition is close to zero.
- **Contact:** the idle Kid in the Pit went 5 → 1 Chin in about 160 f, mostly from bodies and the Grinder's charge lane. With short reach, she lives inside the body band.

## 1. Frame data and feel

**Jab: 4/3/10.** First active frame at 67 ms, a 17 f cycle (15 f when feather), 68 px past the front edge.
- That's snappier than Hollow Knight's nail, which cycles in about 25 f with a longer reach.
- It's right for a boxer: in Punch-Out the jab is a tempo tool, not the damage dealer. Keep it.

**The 1-2 cadence is a little lazy.** The Cross can start only on Jab frame 11, so its first active frame comes 12 f (200 ms) after the jab's.
- A Punch-Out-style 1-2 reads crisper at about 8–9 f.
- Change: `cross` chainFrom frame 11 → 9, and startup 6 → 5. The Cross is still punishable because of its 14 f recovery and the plant.

**Cancel graph is good.**
- Seize, Levy, Jump and Slip are available from Jab frame 8 (the first recovery frame).
- Slip can cancel the Jab's startup (a feint). That's a genuinely expert-friendly touch.

**Hitstop ladder: 4 / 6 / 10 / 12 / 16.**
- Hollow Knight barely freezes on ordinary nail hits. It sells impact with enemy recoil, a white flash and the sound, and saves its freeze for player damage and kills.
- Punch-Out freezes hard only on stars and knockdowns.
- Your ladder is in the Smash/Punch-Out family, which is fine for a boxer. Two corrections:
  - **Scale by outcome, not only class.** Add +4 on the lethal or knockdown blow, and use 3 f on a jab that neither flinches nor kills. The 4th jab on a Barker then feels different from the 1st.
  - **Don't stack a heavy freeze before a finisher freeze.** A Return (10) followed by a repossess (16) is 26 f of stop in a 38 f sequence. Cut the Return on a *downable* target to 8, and keep the repossess at 16 as the payoff.

**Knockback works against the finisher.**
- A jab pushes the enemy about 21 px and recoils Kid 16 px. That's good HK-style push-apart.
- But a Return (heavy 14 px/f, about 105 px) and a Counter (16 px/f, about 136 px) fling the downed enemy **past the 52 px Seize reach**. The finisher then needs a walk.
- See change 3.

**Crunch.**
- The greybox can't judge crunch yet: 72×48 enemies in a 1920 frame, no animation.
- The event stack (flash, spark, ribbon, sound, hitstop on 1244/1244 events) is complete.
- **The biggest feel gain left is animation and enemy hit-reaction poses, not numbers.** Don't retune hitstop against rectangles.

## 2. Risk and reward: root causes

1. **The signature has to be handed to you.**
   - A take needs an *open* enemy: a telegraph, recovery, or rattle.
   - A Catch needs you inside 52 px during a telegraph of 15–28 f.
   - So optimal play is to wait, which explains the F8 miss (158 f) and the Gull's F3 miss. Jabbing is always available, so jabbing wins on tempo.
   - Hollow Knight works because the proactive verb (the nail) and the reactive verb (the dash) are both good. Here the proactive path (jab → rattled → Seize) exists, but it only *ties* the jab on fodder.
2. **Fodder dies faster than the loop can pay off.**
   - A Barker dies in about 57 f of 1-2s. Even a perfect loop, 38–45 f including 31 f of its own hitstop, can't reach 0.50–0.75 by any margin a bot can find.
   - **F4 is the wrong metric for fodder.** The Grinder, the only enemy with jab resistance (flinch 0, kbScale 0.25), is also the only one in band. That's the tell: the **signature dominates where the jab is resisted**, so design resistance in on purpose.
3. **The payoff scatters the target.** Knockdowns fling the enemy 105–136 px, so every repossess costs a walk.
4. **Nothing carries forward.**
   - A repossess gives a voice, but a levied voice does only 2–6 damage to a *different* enemy.
   - So the loop doesn't chain across a crowd, which is exactly where a signature should shine (Katana Zero or Dead Cells throw chains).
5. **The boss is lockable.** Rattle outlives the guard, and his idle time is longer than Seize startup (see above).
6. **Health doesn't matter**, so Swallow has no job (§4).
7. **Contact damage punishes the kit's own range.** A boxer fights at 24–68 px, and walkers chase to a 24 px gap. Bodies are the main source of damage in the Pit for every bot.

## 3. Enemies and encounters

- **Roles are distinct on paper.** The Barker rushes, the Gull dives, the Grinder is heavy, and the Clerk keeps away with artillery and a white-rule ring.
- **But they pose one question: "wait for the telegraph, then Catch or Slip, then punish."** None of them poses a question that only a signature verb answers, the way Hollow Knight's shielded Husk Guard, Silksong's parry-bait enemies or Nine Sols' unblockables do. Each archetype needs one **lock**:
  - **Barker: Bristle.** After taking 3 punches within 60 f it bristles for 40 f. Jabs bounce off (0 damage, Kid recoil ×2), but it is open to Seize. Seizing its Bark disarms it for good (a harmless dog). This teaches jab → Seize without forcing it.
  - **Clerk.** Its hop-back makes jab-chasing slow, which is fine. Make the **Caught Stamp** the answer: a Catch of the mortar pulls the Clerk into RETRIEVE toward Kid, delivering it to punch range. Also make a Return on the Clerk's own Thump knock it down *where it stands*.
  - **Gull.** Its 224 px hover is out of reach until it dives, which caused the F3 miss. Two changes:
    - Up-Seize reach `[-8,-48,56,56]` → `[-8,-120,56,128]` (a hooked hand up).
    - A dive Catch pins the Gull to the floor (beak-stuck 45 f, open).
    
    Air enemies should showcase the Up-Seize and the pogo.
  - **Grinder: already right.** Keep the armour. It's the template.
- **Telegraphs read well.** The bracket reticle, tint and pulses are readable at full size (checked by screenshot in the Pit). The 15 f floor is honest (T4: min gap 16).
  - The one worry: the **Gull's aim lock at frame 16 of 24** is fine at 1v1, but with 2 tokens and a Barker lunge on screen, the violet aim line is the only cue that survives. Give it a sound sting at the lock frame.
- **The Pit** is 2 Barkers and a Grinder on a flat floor with two one-way platforms and a 120 f grace period. It's a DPS check, not an encounter.
  - Textbook pincers force priority: a rusher plus artillery (Barker + Clerk), or a diver plus a heavy (Gull + Grinder).
  - Add one terrain feature Levy interacts with: a gap Barkers must hop, or a ledge where a brown slab becomes cover from the mortar.
  - Use 2 waves (3 enemies, then 2) so verb density comes from the room, not from bot behaviour.

## 4. Economy and death loop

- **"One noun, three uses" is the best idea in the spec, but in play only one use exists: throw it back.**
  - **Throw:** a Return is always correct (a knockdown is a guaranteed kill).
  - **Keep:** weight needs 2 browns, and the Pit has only one brown voice (Growl), so heavy almost never happens in combat.
  - **Eat:** Swallow is never needed mid-fight (Ringing refunds 70%, and competent play takes 0.02 pips). It's free after the fight (the leftover repossessed voice).
- **Fixes: make HP matter, then Swallow has a job.**
  - Voices go home on `roomClear`. That removes the free post-fight heal.
  - Ringing is recovered only by a **Catch, Counter or Repossess**, not by an ordinary take.
  - Revisit F5 once these land.
- **Make "keep" real.**
  - Weight: count voices of any colour, 3 = heavy. Or give each colour a held perk while in the bag: violet makes the jab 1 f faster, pink raises the jump, brown is the current heavy.
  - Then holding 2 sounds through a fight is a stance choice, not an accident.
- **Death loop.** Beat the Count (rhythm press, paid with the bag) and the Runner chase are both good in concept, but no human has touched them. Keep them as they are until the slice has real rooms between Corners. You can't judge a corpse run in one arena.

## 5. Top risks to reaching Hollow Knight-level combat

1. **The signature verb stays optional.** Players jab through the game and never learn the Catch. That's the game's identity lost.
2. **Boss design depth.** A static boss that can be locked, beaten in 21 s by a bot that never Catches. Hollow Knight's Hornet 1 is about 60–90 s for a skilled player, with 4–5 moves read and punished per phase.
3. **Tuning to bots.** The Pit ratio moved from 0.50 to 1.07 on bot details alone. F3 and F4 are bot numbers, and no human has played the combat yet.
4. **Stakes.** Leaky health means no tension, and without tension Ringing and Swallow are decoration.
5. **Feel can't be judged without animation.** Hit-reaction poses, anticipation frames and enemy recoil sprites carry most of Hollow Knight's crunch.

## 6. Ranked changes

Impact: H/M/L. Effort: S (under a day of agent time), M (1–3 days), L (more than 3 days).

| # | Change | Mechanic and values | Impact | Effort |
|---|---|---|---|---|
| 1 | **Close the boss lock** | Bosses are never `rattled` (open only in telegraph, recovery, a Catch stagger or the Count). Return stagger 90 → 45. `idleFrames` 36 → 20. After any stagger, his next action starts at once and is a "reserve price" variant with a white, unseizable 20 f telegraph: Slip or punish only. Add an anti-hug **Lectern Stomp** (white ring r=160, telegraph 20) if Kid stays within 2 tiles for 90 f. He hops between 3 rostrum spots (hop weight 1 → 3). Target: expert 60–90 s, at least 6 Catches per clear, a first clear in 3–6 human attempts. | H | M |
| 2 | **Catch opens the Counter** | A Catch sets `p.counter = 30` (same as a clean Slip). Catch → Counter Cross = 6 dmg plus a knockdown, then the Count. This makes the Catch the premier verb: a Sekiro deflect into a deathblow. Keep the Slip-counter for white attacks. | H | S |
| 3 | **Knockdowns stay in reach / claim reach** | Knockdown kb × 0.25 (Return and Counter travel ≤ 30 px), **and** a Seize on a downed enemy reaches 160 px with a 6 f pounce (Kid is carried to it). "The Count is a claim, not a grab." | H | S |
| 4 | **Levies chain through crowds** | Any levied *voice* knocks down fodder (not just brown). A repossess always yields a voice. So: repossess A, throw at B, B goes down, repossess B, and so on. This is where the signature beats jabbing (target: 3-fodder crowd TTK ≤ 0.6× jab-only), while 1v1 fodder stays jab-friendly. | H | S |
| 5 | **Plug the health leaks** | Voices go home on `roomClear`. Ringing is recovered only by a Catch, Counter or Repossess, and its window goes 120 → 90. Then re-measure F5, and add F7b: sloppy players swallow at least once per 2 fights. | H | S |
| 6 | **Bodies shove, attacks hurt** | Contact damage only from bodies in ACTIVE (charges, dives) and from bosses. Other bodies push Kid 6 px/f for 4 f with 0 damage. A boxer must be safe at 24 px. | H | S |
| 7 | **A lock per archetype** | Barker Bristle (3 punches in 60 f → 40 f jab-proof, Seize-open). Up-Seize reach 128. A Stamp Catch pulls the Clerk in. The Grinder is unchanged. | M-H | M |
| 8 | **Re-author the Pit as an encounter** | Two waves: Barker + Clerk + Barker, then Gull + Grinder. A gap plus a ledge for slab cover. Grace 120 → 60 f. F8 comes from the room. | M | S |
| 9 | **Make "keep" a stance** | Weight counts any voice (3 = heavy), or add per-colour held perks (above). | M | M |
| 10 | **Feel polish** | 1-2 chain from Jab frame 9, Cross startup 5. Hitstop +4 on the lethal or knockdown blow, 3 on a non-flinch jab. Return 8 on downable targets. Gull aim-lock sting. | M | S |
| 11 | **Fix the metrics** | F4 measured on mixed encounters (fodder 1v1 exempt; crowds and elites 0.5–0.75). Add "Catch share of boss damage ≥ 30%". Fix the bot's guarded-Seize spam (it should punch in a guarded stagger). **One human session before closing L5.** | M | S |

## 7. Recommendation

**A short L5 now: items 1–6 and 11, time-boxed to about a week of agent time, ending with one human playtest on the Pit and the Auctioneer. Then move to the vertical slice, and do items 7–10 plus all HP and TTK tuning inside it.**

- **Why not skip to the slice:**
  - Items 1–6 change *rules* that every future enemy and room is authored against: what's open, what a Catch grants, contact damage, where downed bodies land, and when the bag clears.
  - Retrofitting them across 20 enemies and a dozen rooms costs far more than changing 4 enemy files now.
  - The boss lock and the free heal are also exploits a first human would find within minutes.
- **Why not a long L5:**
  - Numbers tuned against bots in empty arenas won't survive real rooms, animation and humans.
  - Hollow Knight's combat was tuned inside its world, not in a gym.
