# Chunk 1 first-timer playtest: casual player, round 2

2026-10-17. Persona: a casual player. I've played some Celeste on assist and a bit of Ori. My timing is loose, and repeated deaths and not knowing where to go put me off. All I knew was the controls I'd been told. I read no docs, rooms, reviews or code.

**Sessions** (journal, report, heatmaps and screenshots are in each folder):
- S1, build `377cba9`: `playtest-reports/2026-10-17T15-53-23-firsttimer-casual2/` (journal.md, report.md). It ended after I pressed R; see the harness bug at the bottom. Its report.md metrics after 2:42 are corrupted.
- S2, build `a31bad7` (HEAD moved between sessions): `playtest-reports/2026-10-17T16-09-24-firsttimer-casual2/` (journal.md, report.md).

**Result:** I got stuck in **The burrow** (wood-burrow) both times and never left it. I never got past the tall ledge where the other moth sits. Game time was about 4 minutes in total (S1 2:44, S2 1:17). That is short because the game is paused between my turns. I made about 150 separate attempts, roughly 100 of them in the burrow, so a real player would have spent well over 10 wall-clock minutes stuck there. I stopped when I had run out of ideas.

## 1. Timeline (game time)

**S1 (build 377cba9)**
- **0:00–0:15, the hatching branch.** A black screen with nothing to read. The first press did nothing visible; the second broke the cocoon. Then: wow. Moonlit branch, drifting moths, another little moth behind me. The gaps were easy. Fun.
- **0:15–0:25, The chase (greybox).** A swarm of dots flew off right and down, so I followed it. The **LAMPFALL** title card came up as I ran under the moon. A great moment.
- **0:25–0:39, The first wicks.** A lamp grabbed me in mid-air. Three dots and an arrow appeared, and I didn't know what they meant. Mashing jump fills the dots and lets me go, but it caught me again straight away. I fell into a little pit with a dead moth in it. I understood: these lamps kill moths. Creepy, and good.
- **0:39–1:34, The burrow.** A beetle (a "burrback") hit me three times in about 10 s while I slashed at it. My hits made sparks but it never died: 4/4 down to 1/4. A lamp caught me, and breaking free dropped me onto the beetle. Then came the pit: two orange rings floating at the top of my jump, and a tall right ledge with the other moth sitting on it by a beam of light. I opened the map: the only exit is beyond that ledge. I tried jumping into the rings, up-slashing them, and down-slashing onto them from the left block. I tried wall jumps and the hatch near the entrance. Nothing reacted.
- **1:34, died.** I came down on the beetle with ↓+C, as the controls say ("↓ on something bounces you"). It hurt me and I faded.
- **1:36, re-formed** at the room entrance with 2/4. I hadn't noticed it was a save spot (the little ^ marker).
- **1:40–2:20.** Holding a direction while a lamp holds me turns its arrow. I aimed up-right and broke free, but only got a small hop. I tried the lamp above the pit and could not reach its glow.
- **2:21–2:30.** Went back to The first wicks to look for a path I'd missed. There isn't one.
- **2:30–2:44.** Back in the burrow. The beetle hit me twice more, once from what looked like a body-length away. I pressed R and came back at the burrow entrance with 4/4. (The harness broke here.)

**S2 (build a31bad7, fresh start)**
- **0:00–0:30, the hatching branch.** I fell **11 times** in 30 s: 5 at the first raised branch and 6 at the gap by the big trunk. The trunk standing in front of the gap read as a wall, and I only got across by jumping from the very tip. Being "put back" each time is kind, but this was the opening of the game and I was already failing.
- **0:30–0:50, chase and wicks.** Quick. A lamp-to-lamp fling in the wicks room only dropped me down and to the right.
- **0:50–1:17, The burrow again.** The beetle hit me on landing when I jumped over it (it slides to where I land): 3/4. The beetle stays near the lamp, which hit me twice more on the way back in: 1/4.
- **0:56, the best discovery of the session:** if I *keep jump held* through the break-free, the lamp flings me hard along the arrow. Fun! But aimed up-right, the fling slams into the side of the block before the pit. From the block's top, my best jump bumps the underside of the high platform, just under the upper lamp's glow. It never catches me. I stopped at 1:17.

## 2. Moments

### Best 3
1. **Opening on the branch under the moon:** `…15-53-23…/shots/0003-after.png`, `0005-after.png`. I'd keep playing just for this.
2. **The LAMPFALL title card while running under the moon:** `…15-53-23…/shots/0022-after.png`.
3. **The held-jump lamp fling:** `…16-09-24…/shots/0066-burst.png`. When I found it, it felt great, like Ori's Bash.

Honourable mention: the dead moth in the pit under the first lamp, `…15-53-23…/shots/0036-after.png`. It tells the story with no words.

### Worst 5
1. **The burrow's tall ledge is just out of reach**, and nothing says what reaches it. My head clears the lip and my feet don't (`…15-53-23…/shots/0194-burst.png`, `0066-burst.png`). It reads as "you should make this", so I kept trying the same jump.
2. **The beetle is the first enemy and it can't be read.** I slashed it from the front and got hurt. I down-slashed onto it and died (`…15-53-23…/shots/0124-hit-by-burrback-0-4-left-.png`). Hit from a distance (`…16-09-24…/shots/0092-hit-by-burrback-1-4-left-.png`). Its outline goes red, then green, and I never learned what either means (`…15-53-23…/shots/0165-burst.png`). It stays under a lamp, so dodging it by jumping gets me caught, and breaking free drops me back next to it (`…15-53-23…/shots/0058-hit-by-burrback-1-4-left-.png`).
3. **Orange rings and a three-dot hatch that look interactive and do nothing.** I jumped through them, slashed up and down at them, flung near them: no sound, no wobble (`…15-53-23…/shots/0087-look.png`, `0117-burst.png`). The hatch's three dots look exactly like the lamp's three dots, so I expected it to work the same way.
4. **The lamp fling exists but nothing teaches it.** Holding jump through the break-free decides whether the fling is weak or strong, and I found that by accident in my second session. The aimed fling then hits the block's side wall (`…16-09-24…/shots/0090-burst.png`).
5. **The first gaps in the new build** (`…16-09-24…/shots/0028-burst.png`, `0030-after.png`): 11 falls in the first 30 seconds of the game.

### Every time lost or stuck
- S1 0:28–0:32, wicks: caught by the lamp, unsure what the three dots meant (short).
- S1 0:50–2:44, burrow pit and ledge: stuck for the rest of the session (the report logs 67 s of "lost" time in 4 stretches; the rest was trying things).
- S2 0:05–0:27, hatching branch: two gaps, 11 falls.
- S2 0:56–1:17, burrow: stuck again at the same ledge (the report logs 13.8 s lost).

### Every death
- **S1 1:34, burrow, faded on the beetle while down-slashing it. Unfair:** I did exactly what the controls say a down-slash does. Before that, three of my four hits came from the same beetle in my first 10 seconds in the room, and one came straight after a lamp released me onto it. **Unfair.**
- I had no other deaths. I did lose 7 of my 8 masks to the same beetle across both sessions; with 4 masks, two encounters with it is a death.

### When I'd have quit
For real: at S1 ~2:00, in the burrow pit, after the third idea for the rings failed. If I'd come back for a second try, I'd have quit at S2 ~1:10, when the fling I'd just discovered hit the block wall. I came back only because of how the opening looked.

## 3. What the game is about / what I was supposed to do
I'm a newly hatched moth in a moonlit forest. A swarm of moths flies toward the moon and I'm meant to follow it. On the way there are lamps that trap moths, and the dead moth under one shows what they do. Another little moth, a friend, keeps waiting ahead of me. I think the idea is that the lamps are false lights: they grab you, and you have to break free (and later use them to fling yourself). The moon is the real light to follow. In the burrow I was presumably meant to reach the friend on the high ledge and drop to the exit beyond. I never worked out how. I suspect the rings (wicks?) light up somehow, or the lamps fling you there, but I couldn't make either happen.

## 4. Top 5 changes (with how HK / Ori / Celeste handle the same moment)

1. **Teach the fling before it's needed, in a safe place, with a preview.** In Ori, Bash is learned on lanterns with nothing dangerous nearby. The direction arrow and the result are obvious, and the first required use is a single clean target. Do the same here: in The first wicks (no enemy), have one lamp whose only exit is an obvious up-right fling to a ledge. While a lamp holds you, draw the fling's arc, Ori-style (or at least its length). Make break-free launch strongly by default rather than only when jump stays held, or show "hold" on the dots. *Assist idea:* the lamp holds you until you choose a direction, with no mash count.

2. **Make the first enemy readable and fair, and move it away from the lamp.** HK's first enemies (Crawlids, Tiktiks) are harmless walkers you can hit or pogo. Wanderers need a clear wind-up before they're dangerous. Here the burrback should: (a) die in 2–3 hits, or show clearly that only its back is vulnerable (HK's armored enemies flash and clank, and play a "tink" sound when hit on the armor); (b) bounce you when you down-slash it, as the told controls promise; (c) have a hitbox no bigger than its body; (d) not slide to where you'll land. Also make red and green mean one thing each and keep them consistent. Never put it under a lamp in its first encounter. *Assist:* longer i-frames after a hit, or an "enemies deal half damage" option.

3. **Everything that looks interactive should respond, and the told controls should be true.** In HK, things you can hit react: the "tink", a wobble, or a spark. In Celeste, every object you can use looks like a family of objects that behave the same way. The orange rings and the three-dot hatch did nothing for any of my inputs, with no feedback at all. Give them a reaction (a flicker, a dim note) that hints at what they need ("needs a flame"? "hit me from a lamp fling"?). If the ↓ bounce isn't available yet, take it out of the controls I'm given, or put an obvious pogo target (HK's thorns or Celeste's bumpers) in the first room where it matters.

4. **No near-miss ledges on the critical path.** In Celeste, a ledge is either clearly reachable or clearly not. Corner correction and coyote frames make near-misses succeed, and the edge of what you can reach is visible. The burrow's right ledge sits a few pixels above max jump height, so it looks like a timing problem when it's really a missing mechanic. Make it clearly too tall (a full extra tile and a different surface), or give a ledge-grab or mantle when your head clears the lip. *Assist:* Celeste-style options such as an extra mid-air jump, slower game speed, or invincibility.

5. **Make the first minute forgiving and the save spots obvious.** Ori's opening gaps are generous, and HK's first benches glow and play a sound. In S2's build, the gap by the trunk took me 6 falls, and the trunk in front of it looks like a wall. Widen it, or lower the far branch, or move the trunk behind the gameplay plane and darken it. Make the ^ save marker announce itself when you touch it (a chime or a glow). Refill health on re-form, or at least say why I came back with 2/4. Also: the cocoon start needs one visible prompt. I pressed twice and got nothing on screen the first time.

## Harness notes (for the tool, not the game)
- **`{R}` in `act` breaks the session:** every later `act` re-reports the whole session's events from the start. That's about 1,100 duplicate screenshots per `act` (S1 has ~2,850 PNGs, most of them `…shots/0198+`), and report.md gets bogus totals (157 deaths, 785 hits, 11,304 jumps). It looks like the played-frame counter reset on restart (status shows "played 1.5 s"). I stopped S1 and started S2 to keep playing.
- The pinned build moved between my two `start`s (377cba9 → a31bad7), so the hatching branch played differently in S2.
- S2's report counts "lights seen / lit: 7 / 0", which suggests lights *can* be lit. As a player I found no way to light any of them.
