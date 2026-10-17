# Chunk 1 first-timer playtest: impatient, round 1

2026-10-17. I played as a first-timer who knows only the controls. I like action games, I push right and I don't read
the scenery. I used the first-timer tool (`npm run firsttimer`) against the clean build on :5197 (`?fresh`), from the
cocoon in `wood-hatch` to the old burrback in `wood-well`. I stopped at **5:24 of game time** after 4 deaths and a 5th
on the way. There were two walls in a row. On one side was a boss I could not read (3 attempts, 1 hit landed). On the
other was a room I could not get into (`wood-lantern`, boxed in behind a pillar). The tool could not press Tab, so I
never saw the map. I did not read any design docs, room files or code. The greybox rooms do show the designers'
labels on screen, though, and I couldn't help seeing some of them. Where a label gave something away, I say so.

- Session folder: `playtest-reports/2026-10-17T14-39-52-firsttimer-impatient/` (gitignored, local only)
- Journal (every act and note with its screenshot): `playtest-reports/2026-10-17T14-39-52-firsttimer-impatient/journal.md`
- Tool report (metrics, room times, heatmaps, trace): `playtest-reports/2026-10-17T14-39-52-firsttimer-impatient/report.md`
- Screenshots below are in `…/shots/`.

What the tool's report recorded: 4 fades, 7 fall catches and 23 hits taken (old burrback 10, the thorn branch 8). I
killed 0 creatures, snuffed 4 lamps and freed 20 moths. It logged 98.6 s with no progress (in 6 stretches) and 120 s of
backtracking. The sim logged `enemyBlock` ×17 and `enemyFeint` ×8. From my side I saw neither, not once.

---

## 1. Timeline (game time)

| time | where | what I did / understood / felt |
|---|---|---|
| 0:00–0:08 | hatch, cocoon | Black screen, then a cocoon. Jump and Right did nothing for about 6 s, and nothing on screen said to press anything. Mashing attack and dash broke me out. I also thought the hooded critter on the branch was me. **lost** (`0001-look.png`, `0003-after.png`, `0007-after.png`) |
| 0:08–0:26 | hatch | Beautiful painted branch run. The branch bends down into a U, and I fell through the bend twice, because it looks like walkable branch. I was put back fast. After that the gaps were readable and it felt good. **unfair, then ok** (`0014-after.png`, `0016-after.png`) |
| 0:26 | hatch → chase | The branch ends over mist and nothing says "drop". I dropped and it worked. In the chase room the labels told me I was "running after the swarm". The moths in the sky in room 1 never read to me as something to follow. |
| 0:27–0:39 | chase | I ran right and fell into the first gap because I didn't jump. I was put back. Fine. |
| 0:39–0:48 | first wicks | Orange lights with big rings. One pulled me against a bump with a thread. I hit attack and it popped: "lamp put out, 5 moths freed". The pop was nice, but on screen I barely saw anything get freed. **fun** (`0050-put-out-a-lamp-5-moths-freed-.png`) |
| 0:48–0:56 | burrow | First enemy (a small box). I traded hits with it, 4 → 2 hearts in 3 s, and couldn't tell when it was hittable. I jumped past it. **unfair** (`0062-hit-by-burrback-3-4-left-.png`, `0065-…png`) |
| 0:56–1:52 | burrow, seed-case pit | I fell into a pit I couldn't jump out of (the right wall is just too high). There were two orange rings over it, so down+attack, I guessed. I needed about 10 tries and about 50 s of "walk left, climb two steps, hop, miss, fall". The lamp above the ledge pulls my hop upward, so I kept sailing past ring 1. It finally worked when I held Right through the down-cut: two bounces in a row felt great. **stuck** (`0089-after.png`, `0105-burst.png`, `0116-burst.png`, `0132-after.png`) |
| 1:52 | burrow | A moon beam healed me to full. The hooded critter was there again, with no way to talk to it. |
| 1:54–2:00 | glade | I fell down a long hollow and got **"Your wings have dried. Hold jump to glide."** plus "rested · saved". A clear line, the first real reward, after about 2 min. I glided the big gap and it felt great. **fun** (`0139-gained-glide.png`, `0145-burst.png`) |
| 2:00–2:24 | glidewalk, try 1 | I walked off the first ledge before I knew it was a gap and fell into a rung pit. I climbed out and glided on. The wicks let me past. Then there's a thorn block hanging in the air. I pressed jump to glide (the game told me "hold jump"), and the jump arc runs straight into the block. A thorn hit knocked me into the floor thorns, the game put me back, I was still holding jump+right, so I re-jumped into the same block. **3 hearts in about 3 s.** I died on the next try. **unfair** (`0166-…png`, `0170-…png`, `0173-hit-by-thorns-0-4-left-.png`) |
| 2:24–2:45 | glade → glidewalk, try 2 | Back at the glade save, so I redid the glide. A short walk-off glide put me back twice. Caught by a lamp mid-glide: **3 pips appeared, I mashed, it flung me forward onto the platform.** That's when the cocoon made sense to me. **fun** (`0199-caught-by-a-lamp.png`, `0202-after.png`). Then the thorn block again: same held-input chain, 3 hearts, dead. **unfair** (`0204-…png`, `0206-…png`, `0208-…png`) |
| 2:45–3:16 | glade → glidewalk, try 3 | I redid it all for a 3rd time and let go of glide too early, so back into the rung pit. The thorns took 2 more hearts the same way. Then I made it under the block. A lamp grabbed me over a burrback and I took a hit. I cut the lamp: moths freed, 1 heart back, and the burrback went grey and slept. A neat combo. I cut through a hatched wall. **fun** (`0242-…png`, `0247-after.png`) |
| 3:16–3:26 | hollow (hub) | Moon patch, healed. Exits left, down, up and right, no goal, the critter says nothing. I'd have opened the map here. I went right. **lost** (`0258-after.png`) |
| 3:26–3:44 | hawker | A flier with a laser-pointer line. I flailed, got 2 cuts and popped its lamp, and it left. I broke a bark mound into a little alcove with a lamp. The lamp grabbed me twice before I put it out. **ok** (`0268-burst.png`, `0284-after.png`) |
| 3:44–4:07 | first lantern | The door puts me in a pocket between the wall and a floor-to-ceiling pillar. I can't jump it or cut it, and the spawn marker is drawn inside the pillar. I left and came back: same. I decided it was a lock and backtracked through two rooms. **stuck** (`0296-after.png`, `0299-after.png`) |
| 4:07–4:28 | well, old burrback #1 | I dropped into an arena with a big burrback. Boss! I rushed it and slashed, with no visible effect. It goes pink, then red with a red line (ram), then green. I took a contact hit jumping over it when it wasn't even ramming, and other hits from what looks like a body-length gap. **Died.** **unfair** (`0343-…png`, `0364-hit-by-oldBurrback-0-4-left-.png`) |
| 4:28–5:02 | well, #2 | It waddles over very slowly (about 8 s to cross), so I stood at a wall waiting. **bored** (`0381-after.png`–`0387-after.png`). I jumped the ram too early because the wind-up is long, landed on it, got hit. **Died** having landed exactly one cut, after a ram while it was green (`0426-…png`). |
| 5:02–5:24 | well, #3 | I dodged one ram cleanly with a jump-glide, and it felt good (`0447-after.png`). By the time I ran back, it wasn't green any more. I got clipped on the take-off of the next one and on a walk-in slash. **Stopped**, 2/4 hearts. **stuck** |

## 2. Moments

### Best 3
1. **The glide**, at 1:54 and 2:00. A plain instruction, the wings open, and a long float over a gap I could see from
   the start. It's the one moment where "I'm a moth" clicked. (`shots/0139-gained-glide.png`, `shots/0145-burst.png`)
2. **Caught by a lamp, mash to break free, flung forward**, at 2:41. The 3 pips are instantly readable, and the throw
   lands you where you wanted to go. It also explained the cocoon after the fact. (`shots/0199-caught-by-a-lamp.png`,
   `shots/0202-after.png`)
3. **Snuffing the lamp the enemy guards**, at 3:12. One cut freed the moths, gave a heart back and put the burrback
   to sleep. It made me think "lamps are the enemies' power", which is the most interesting idea I saw.
   (`shots/0247-after.png`). Honourable mention: the double pogo across the seed-case gap, once it finally worked
   (`shots/0132-after.png`).

### Worst 5
1. **The thorn block on the glidewalk (2:19–3:08): 8 hits, 2 deaths.** "Hold jump to glide" teaches you to press jump,
   and the block sits exactly on the jump-glide arc. The real killer is that after a thorn put-back I'm still holding
   jump+right, so I instantly re-jump into the same block. That cost 3 hearts in about 3 s, twice.
   (`shots/0170-hit-by-thorns-1-4-left-.png`, `shots/0173-hit-by-thorns-0-4-left-.png`, `shots/0206-hit-by-thorns-1-4-left-.png`,
   `shots/0237-after.png`)
2. **The old burrback (4:07–5:24, unresolved).** No health bar and no visible hit or block feedback. Its hurt area
   feels bigger than the drawn box, and I got hit on take-off and at a gap. Its green window is shorter than the run
   back to it. The long red wind-up punished the early jump. The sim logged 17 blocks and 8 feints, and I saw neither.
   (`shots/0343-hit-by-oldBurrback-2-4-left-.png`, `shots/0364-hit-by-oldBurrback-0-4-left-.png`, `shots/0401-hit-by-oldBurrback-2-4-left-.png`)
3. **The `wood-lantern` entry pocket (3:44).** I walked in and was boxed in by a floor-to-ceiling pillar, with the
   spawn marker inside it. Nothing said "not yet". It was a dead end with no tell. (`shots/0299-after.png`)
4. **The seed-case pogo pit (0:56–1:52, ~10 tries).** A miss costs about 10 s of climbing back. The lamp above pulls
   the hop off-line, a whiff gives no feedback, and the first pogo teach asks for a hold-right-through-the-down-cut you
   haven't learned. (`shots/0105-burst.png`, `shots/0116-burst.png`)
5. **The first 20 seconds.** A black screen, a cocoon that ignores Jump and Right with no prompt, and a U-bend in the
   branch that looks like floor and drops you into the void twice. (`shots/0001-look.png`, `shots/0005-after.png`,
   `shots/0014-after.png`)

### Every time I was lost or stuck
| when | how long | why | what got me out |
|---|---|---|---|
| 0:00 cocoon | ~6 s | no prompt; Jump and Right didn't count, or I didn't press enough | mashing attack and dash |
| 0:12 U-bend | ~5 s, 2 falls | the bent branch looks walkable | jumping the whole U from the flat |
| 0:56 seed-case pit | ~55 s, ~10 falls | can't jump out; pogo timing; lamp pull | holding Right through the down-cut |
| 2:19–3:08 glidewalk thorns | ~50 s, 2 deaths | jump arc hits the block; held input re-jumps after put-back | walking off the edge, then pressing glide |
| 3:16 hub | ~10 s | no goal, the NPC says nothing, no map (the tool can't press Tab) | picking right |
| 3:44 lantern pocket | ~25 s incl. backtrack | pillar to the floor at the door | giving up and taking the well |
| 4:07–5:24 old burrback | ~80 s, 2 deaths, unresolved | unreadable vulnerability and hurt area | nothing; I stopped |

### Every hit that felt cheap
- The burrow burrback, twice (0:51–0:54). It traded hits, and I couldn't see when it could be hurt.
- The thorn chain ×8 (2:19–3:08). The re-jump after a put-back, as above.
- The burr-ledge (3:12). A lamp grabbed me and held me in front of it.
- The old burrback ×10. Contact on take-off and at a gap, plus a long wind-up that baits an early jump.

### Every moment I was bored
- Waiting for the old burrback to waddle across the arena (~8 s per approach, 4:33–4:41).
- Redoing glade → glidewalk three times after the thorn deaths (2:24–3:08), about 45 s of repeats.
- Climbing back up to the seed-case ledge for every attempt (~5 s × 10).

## 3. What I think the game is about

I'm a moth girl who hatched late. The other moths flew off (the swarm in the sky), and I'm chasing them east through
a forest at night. Lamps and wicks catch moths. When I cut one, the trapped moths go free and follow me, and the
creatures near a lamp seem to feed on it: snuff it and they sleep or leave. The moon patches heal and save. The
hooded critter shows up at the rests, but I don't know who it is. The labels told me a bit more ("swarm", "the dark
half", "glade"). Without them I'd only have "go right, cut lights".

I thought I was supposed to keep heading east and free moths. After the hub I had no idea what my actual goal was or
which exit was the main road. A real player would open the map there, but my tool couldn't press Tab.

## 4. Top 5 changes I'd ask for

1. **Hazard respawns must not chain.** After a thorn or fall put-back, ignore held inputs until they're released and
   pressed again, and give a short invulnerable fade-in. Then a thorn hit costs 1 heart, not 3. Also move the
   glidewalk thorn block off the natural press-jump-then-hold arc, or show the walk-off line. *Celeste* respawns you
   at the screen start with input cleared. *Hollow Knight*'s hazard respawn costs one mask, fades you in with control
   locked for a beat, and never re-drops you into the same spikes. Neither game lets one mistake cost three hits.
2. **Make the burrbacks readable, the boss above all.** Show a hit spark or flash on every slash that lands and a
   loud "clank" on the armoured front. Show the boss's health, or show damage as visible cracks. Make "green" read
   as open. Make the stun window long enough to reach from where the ram leaves you. Match the hurt area to the drawn
   body. Don't feint with the same tell as the real ram on a first boss. *Hollow Knight*'s False Knight staggers,
   the armour cracks open, and every hit has a sound and a flinch: you always know you're winning.
3. **Teach the pogo where a miss is cheap.** The seed-case gap should have a floor 1 jump below, with an instant walk
   back, and no lamp pulling the hop. The first ring should give a bounce spark even when you're slightly off. *Hollow
   Knight* teaches the pogo on spikes over a safe floor with a 2-second retry. *Ori*'s first bash/launch rooms are
   forgiving loops, not one-shot falls into a pit.
4. **Never let the player walk into a dead end with no tell.** Either the `wood-lantern` door shouldn't let me in from
   the west before I can pass the pillar, or the pillar should read as a lock from the hawker side, or the spawn
   should be past it if it's meant to be passable. At the hub, the critter should say one line, or the map should
   mark the way. *Hollow Knight* shows locks as locks (a too-high ledge you can see from the floor). Elderbug and
   Cornifer point you somewhere. *Ori* has Sein tell you the next goal.
5. **Fix the first minute.** Prompt the cocoon ("press Z or C") and accept Jump. Don't open on a black screen. Make
   the U-bend clearly not floor, or make it floor. Make the swarm leaving read as "follow them": a camera beat on the
   swarm, then on Vesper. *Ori*'s opening is a hand-held walk with an obvious goal. *Celeste* shows the button the
   first time it matters. Here the first 20 s were me confused and falling into the void.
