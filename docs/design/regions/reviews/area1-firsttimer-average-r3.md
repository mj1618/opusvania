# Area 1 first-timer playtest: average player, round 3

2026-10-18. Persona: an average player who has finished Hollow Knight and Ori and liked them both. I play attentively and explore a bit. All I knew was the controls I'd been told. During play I read only the "First-timer agent" section of `memory/playtest-harness.md`. After I had stopped, I opened the first lines of another review in this folder, only to copy its layout. That happened after the session, so it changed nothing I did or felt.

**Session:** build `b42de7f` (pinned), `playtest-reports/2026-10-17T17-45-45-firsttimer-average3/`. That folder has journal.md (every act and note with its screenshot), report.md, the heatmaps, trace.json and `shots/`. Every screenshot path below is relative to `.../shots/`.

**Result:** I got hard stuck in **the burrow** (the 4th room) and stopped at **3:27 of game time**. The only way on is a shaft at the burrow's bottom right. A hatched, barred block with smoke rising through it (I'll call it "the grate") covers that shaft, and nothing I tried opened it. Game time is short because the game pauses between my turns. I made about 150 separate attempts, about 110 of them in the burrow, so a real player would have spent 15+ wall-clock minutes stuck there. Harness numbers: 11 hits taken, 1 death, 1 kill, 11 lamp catches, 0 lights lit or put out, 0 moths freed, 0 abilities, 0 pickups.

## 1. Timeline (game time)

- **0:00–0:04, the cocoon.** A black screen and nothing to read. The first press seemed to do nothing; the second broke me out. I hatch hanging under a branch among other cocoons.
- **0:04–0:21, the hatching branch.** Wow. A painted moonlit branch, a big moon, and a swarm of moths lifting off toward it, with a little moth walking behind me. I understood at once that I'm a newborn moth and my swarm is leaving, so I should follow it. I walked off the first gap without jumping and was "put back" with no damage, which was kind. After that the gaps were easy. *Felt: delighted, oriented.* (`0005-after.png`, `0007-after.png`, `0010-after.png`)
- **0:21–0:34, the second room (greybox).** A long downhill run with the swarm streaming overhead. At about 0:30 **LAMPFALL** appeared over the moon. It's a real "the game begins" moment, like Hollow Knight's title over the King's Pass. I seemed to slow down a lot under the title (only about 270 px in 2.5 s), which felt like being held back. It wasn't bad, but I noticed it. *Felt: great.* (`0029-after.png`, `0032-after.png`)
- **0:34–0:45, the first wicks.** A health bar of 4 flame drops appeared. There were glowing lamps with big faint rings, and moths from the swarm were circling them instead of flying on. At 0:40 a lamp grabbed me. I saw three dots and a dotted arc, I mashed jump on instinct, and it flung me onto a ledge without hurting me. *I read it as: lights trap moths, but I can use them.* That's a strong idea. (`0039-caught-by-a-lamp.png`, `0041-after.png`)
- **0:45–1:10, the burrow, first look.** There's a hatched block with three dots and smoke rising from it, with a lamp in a sealed chamber underneath. I pressed attack and saw no slash (the screenshots missed it), so for a minute I thought I had **no attack yet**. A small grey-and-red block on the floor hit me (3/4). I'd taken it for a prop or switch, but it was a "juvenile burrback". The map showed rooms in a line going right and down. Near the far right I found a pale shaft of light next to the little moth. I **held ↓ by accident and "rested… saved"**, healing to 4/4. (`0046-after.png`, `0052-hit-by-juvenileBurrback-3-4-left-.png`, `0062-rested-at-a-moon-patch.png`)
- **1:10–1:35, the grate.** The map shows the exit as a green gap at the bottom of a shaft, right under the second grate. I found my attack does exist: a down-slash arc. Pogoing the grate does nothing, standing on it does nothing, and slashing it from the side does nothing. I tried holding jump in its smoke in case it's an updraft. Nothing. (`0067-opened-the-map.png`, `0070-burst.png`, `0072-burst.png`)
- **1:35–2:05, the burrback.** I went to watch the big beetle in case its ram breaks the grate. My first three exchanges cost me 3 HP (down to 1/4). It got a green outline and a yellow dot, and I had no idea what either meant. Then I **read it**: a red outline and a red line along the floor are the tell, I jump, it rams under me, it goes green, and a pogo on it kills it. *Felt: proper HK "learn the tell" satisfaction.* (`0123-burst.png`, `0125-burst.png`, `0130-killed-a-burrback.png`)
- **2:05–2:15.** I pogoed the juvenile and bounced up into the lamp right above it. The lamp grabbed me, and when I broke free I fell back onto the juvenile and took a hit. (`0137-after.png`, `0139-after.png`)
- **2:15–2:28.** I went back to the first wicks for a path I'd missed. A **dead moth** lay in the pit under the lamps: sad and clear. I couldn't reach the upper lamp's core; it only tugs me sideways. The upper green lines I'd seen were just where I'd come in. (`0161-after.png`, `0169-after.png`)
- **2:28–3:27, back in the burrow, hard stuck.** The burrback had respawned. I tried more on the grates: holding attack for 1.5 s, holding ↓, ↓+jump to drop through, and being flung from a lamp so I land on the grate (its landing marker sat right on it), with a pogo as I came down. Then I mashed random keys on it, the way a stuck player does (O, Enter, up-slash). Nothing worked. The burrback hit me five more times, mostly when I **landed on it after jumping its ram**. At 3:25 I faded, then "re-formed" at the moon patch in about 2 s with 4/4 and no penalty I could see. I stopped there. (`0236-burst.png`, `0270-burst.png`, `0296-hit-by-burrback-0-4-left-.png`, `0300-after.png`)

## 2. Moments

**Best 3**
1. **The hatch and the swarm under the moon** (`0007-after.png`, `0010-after.png`). In ten seconds I knew who I was, what my people were doing and which way to go, without a word of text.
2. **The LAMPFALL title card over the moon on the downhill run** (`0029-after.png`). A confident, earned opening.
3. **Killing the burrback once I'd read its tell** (`0125-burst.png`, then `0130-killed-a-burrback.png`). Red line, jump, green, pogo. A close 4th is the first lamp catch and fling (`0039`, `0041`): a fresh traversal idea that matches the story.

**Worst 5**
1. **The grate: hard stuck with no hint** (`0236-burst.png`, `0153-after.png`, map `0186-opened-the-map.png`). The map tells me the exit is under it. It has three dots (the same symbol as the lamp catch), bars, and smoke. It never reacts to anything: no rattle, no spark, no sound, no dot lighting up. Was I close? Is it the wrong tool? Is it for later? I can't tell, and I can't go back past the one-way drops to look for something else.
2. **The juvenile burrback reads as a prop** (`0052-hit-by-juvenileBurrback-3-4-left-.png`). It's a small grey block in the floor's grey with a red side, and it hit me the first time I walked past.
3. **Jumping the burrback's ram correctly still hurts** (`0248-hit-by-burrback-3-4-left-.png`, `0296-hit-by-burrback-0-4-left-.png`). The ram stops right where I land, so landing on its green back hurts unless my pogo is frame-tight. Twice I had ↓+slash held as I came down and still took the hit.
4. **Lamps hung over enemies** (`0099-caught-by-a-lamp.png`, `0137-after.png`, `0139-after.png`). Every jump near an enemy turns into a grab, then a random fling or a fall back onto the enemy. Lamp rings also tug my jumps sideways during ordinary platforming (`0089-after.png`, `0169-after.png`).
5. **I couldn't control the lamp aim** (`0262-after.png`, then `0265-after.png`). The arc swings round as I orbit. Holding ← sometimes keeps it pointing left, but the fling still went right or landed short of its own marker.

**Lost and stuck stretches.** I was effectively stuck from 1:10 to the end at 3:27, on the one problem of the grate. The harness logged no progress for 10 s or more at 1:40 (10.8 s), 2:45 (22.6 s) and 3:08 (11.9 s), plus 82.5 s of backtracking.

**Unfair hits (my judgement).**
- 0:50: the juvenile I took for a prop.
- 1:52–1:55: the burrback's green or yellow-dot state still hurts on contact, and I didn't know what it meant (3 hits).
- 2:07: the lamp grab dropped me onto the juvenile.
- 2:41: I jumped the ram, it stopped under me, and I took a hit on landing.
- 3:02: same again.
- 3:19: a juvenile at a lamp's edge.
- 3:25: same as 2:41; this was the death.

The burrback hits I took before I'd learnt it (1:52, 2:42) felt fair once I knew the tell.

**Boredom.** The burrow is wide (about 10 s to cross), and the moon patch is at the far end from the left grate. Every experiment meant a long walk and a fight with a respawned burrback, which turned 2 game minutes of being stuck into a slog.

## 3. One journey, or a series of unrelated rooms?

**For the first 45 seconds, one journey. After that, a series of problems.** Hatch, follow the swarm to the moon, the title, then lamps trapping the swarm: each room handed me on to the next, and the swarm pulled me forward. In the first wicks the story got a twist I liked: the lights are traps, and a dead moth proves it. Then in the burrow **the swarm was gone.** Nothing pointed onward. The little moth reappeared by the moon patch and only sat there. The room became an isolated lock-and-key puzzle with no key, cut off from the thread that had pulled me so well.

What I thought the game was about: I'm a newborn moth trying to follow my swarm to the moon, and false lights pull moths in and kill them. I expected the game to be about freeing moths from lamps or putting them out ("Lampfall"). The game never let me act on that idea, so I never felt my verbs and the story meet.

(The tool output showed me room names, which the game doesn't show on screen. "The chase" made me expect something to chase me, and nothing did. That's harness-side, so it isn't counted against the game.)

## 4. Was it fun?

**Yes for the first 2 minutes, then no.** The best stretch was 0:00–0:45: the hatch, the title, and the first lamp fling. The second high was the burrback kill at about 2:03. The low was 2:30–3:27: the same grate, the same walk, the same respawned beetle, and no feedback telling me whether I was close. If I'd bought this, I'd have looked up a guide at about the 10-minute mark of real time.

## 5. Top 5 changes

1. **Make the burrow gate say what it wants, and teach the opener before you need it.** In HK, a breakable wall shakes, cracks and makes a hit sound on every strike, so you know you're on the right track; a wall you can't break yet doesn't even look breakable. In Ori, a gate shows the ability or orb icon it needs. Celeste introduces every new object in a safe single screen before it matters. The grate needs:
   - a visible reaction to the right kind of attempt (a rattle, or a dot lighting up);
   - a clearly different "not yet" look if it's for later, plus some other way on;
   - one safe, isolated earlier moment that teaches whatever opens it (lighting or snuffing a lamp, offering, a lamp-strike, the burrback ram), without a prompt.

   Note: after I stopped, report.md said I'd seen 9 lights and lit or put out 0, freed 0 moths, and had 3 "offerMiss" events. So a light, moth and offer system exists that I never found. Whatever it is, the game never showed it to me.
2. **Make lamps readable and let me aim the fling.** In Ori, Bash slows time and you aim freely with the stick along a clear arrow. Here the aim swings with the orbit, and holding a direction only half works. Let the held direction set the aim, keep the landing marker honest, and keep lamp rings away from enemies in the rooms where lamps are first taught. HK teaches its first enemy (the crawlid in King's Pass) on flat, open floor before mixing anything in.
3. **Make the burrback's answer fully reliable.** Contact during the green state should not hurt, or the pogo hitbox should be HK-generous. The ram should carry past where a correct jump lands, not stop under it. Explain the yellow dot or drop it. In HK the correct response to a tell is never punished. Celeste's hitboxes favour the player.
4. **Give first-time cues for resting and attacking, and make juveniles read as creatures.** HK shows "Rest" at a bench, and Ori shows the save prompt. A tiny "hold ↓" the first time I stand in moonlight would do. The juvenile should have eyes and an idle wiggle, not look like a floor block. My first slash should be impossible to miss (a target in front of me, as with HK's first crawlid).
5. **Keep something pulling me through the burrow, and shorten its loop.** Ori has Sein and the light to guide you; HK has the map maker's trail and other bugs pointing the way. Have the swarm, or the little moth, show the way on (moths drifting down the shaft under the grate, or the little moth flying to the thing that opens it). Put the moon patch nearer the problem, or add a shortcut. Then backtracking isn't a 10-second walk plus a respawned fight each time.
