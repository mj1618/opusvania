# First-timer playtest: explorer, round 2

A Hollow Knight / Ori player who likes to explore, playing chunk 1 for the first time. I read only the first-timer section of `memory/playtest-harness.md`. I did not read docs, room files, reviews or code.

**Sessions (journals, shots, reports; gitignored, local only):**
- `playtest-reports/2026-10-17T15-53-15-firsttimer-explorer2/`: build 377cba9, fresh game, hatch to glade, 2:07. Shots after `0207` are duplicates from the R bug (see Tool notes).
- `playtest-reports/2026-10-17T16-07-35-firsttimer-explorer2b/`: build a31bad7, `--room wood-glade --abilities glide`, 0:13. Soft-locked, then R.
- `playtest-reports/2026-10-17T16-09-27-firsttimer-explorer2c/`: build a31bad7, same start, glade to the top of the hub, 5:16.

**Total play:** about 7.5 game minutes, plus re-runs after deaths. The bot plays much faster than a person would, so a human would take roughly 3-4 times as long. I got as far as beating the old burrback, getting wall-jump, climbing the well back into the hub and taking the high route east. I stopped when I was lost on that route.

## 1. Timeline (cumulative game time)

| time | where | what I did / understood / felt |
|---|---|---|
| 0:00 | hatching branch | Black screen, press a button, and I break out of a cocoon among dozens of hanging cocoons. Full moon. **Not greybox, and gorgeous.** A smaller moth hatches beside me. I'm the antennaed child. |
| 0:06 | branch | I walked off the end of a branch and got put back with no damage, which is kind. I jumped at a big trunk expecting to cling and walked straight through it, because trunks are scenery. A flock of moths streams toward the moon. |
| 0:20 | The chase | Hard cut to greybox. An orange lamp sits in the wall at the start. Slashing it did nothing. Long stairs down, with the flock diving ahead. |
| 0:36 | chase, end | Standing in a cyan circle, **LAMPFALL** fades in over the moon while single moths peel off and swoop past. Lovely title beat, HK-style. Orange sparks drift in the pit ahead. |
| 0:39 | The first wicks | Lamps hang with moths circling them, and a dead moth lies under one. I jumped and up-slashed. The lamp grabbed me in a gold ring, I broke out, it went dark, "5 moths freed", and they followed me with a counter at 5. **Understood: lamps trap moths, so I put them out.** |
| 0:52 | wicks | The second lamp caught me and showed **three pips and an arrow**. I pressed attack and dropped out, but it stayed lit. Another slash put it out. *I don't know the rules of being caught* (mood: lost). |
| 1:00 | wicks | The map is clean and shows lit lamps as yellow dots. One lamp in a cage hangs above my jump height, so I read it as "come back later". My moth counter vanished on the way back. Did the lamp take them? |
| 1:15 | The burrow | A lamp sits under a floor grate marked with three dots, and an orange ring floats in the air. Neither reacted to my slashes or standing down-slashes (lost). |
| 1:25 | burrow | First burrback. The red outline plus a red floor line reads as "charge coming". I took one hit trading slashes, then jumped, down-slashed and killed it. Fair. |
| 1:33 | burrow | Lamp three: caught, mashed out, launched upward, down-slashed on the fall and it went out. Freed moths **healed me to 4/4**, and the counter showed 10, then 15. A satisfying loop. |
| 1:40 | burrow | From the pit floor I couldn't get above the rings. From the high block I could: **down-slash on the ring = a big pogo** that carried me over the wall. HK feel, great. A lamp on a floating slab was unreachable after two tries. |
| 1:45 | burrow | A pale beam is a **moon patch** ("rested · saved"), and the little moth is sitting right next to it. |
| 1:59 | Glade 1: wings | Dropped down a moonbeam shaft: "Your wings have dried. Hold jump as you fall to glide." **Best ability moment so far.** I glided over a red pit to the exit, then went back for an alcove lamp on the left wall by pressing R (tool bug, see below). |
| 2:07-2:20 | glade (session 2) | I walked off the ledge and slashed the alcove lamp as I fell past. It went straight out and I landed in the alcove. **Soft-lock.** The alcove opens only onto the hazard pit. Its floor is barely higher than the exit ledge 640 px away, so a running jump plus glide sinks halfway, and the pit puts me back *in the alcove* every time. The ledge above is too high. R was the only way out (stuck). |
| 2:25 | The glidewalk (session 3) | Two lamps float over a gap, with a ceiling staircase above. I fell into a thorn pit (-1) and was put back. **Cracked the rule:** if my body touches the lamp it catches me, if only my blade reaches it, it goes out. A short hop plus up-slash worked first try. |
| 2:45 | glidewalk | Walked off the moon-patch block into thorns (-1, my fault). Glided to a ledge with a burrback, a lamp, a tall 3-dot gate and a 3-dot floor grate. **Three slashes broke the gate: the three dots mean three hits.** Three timed airborne down-slashes broke the grate, and there was a buried lamp under it, a small secret. |
| 3:06 | The hollow: the hub | Huge room, a camera that zooms in and out, pink spring pads, a moon patch, and **the little moth again**, waiting ahead of me like a guide. I dropped off the entrance ledge and **couldn't get back up**: the ledge is just above my jump and the pads start from it. I couldn't drop through a ticked plank between two pillars either (lost). |
| 3:31 | The hawker | A hawker hovers, turns red, paints a red ring under me and dives. I sidestepped, slashed it 2-3 times, dead, no damage. **A lamp caught me and I worked out the slingshot:** I orbit the lamp, the arrow is my tangent, each press fills a pip, and the third press flings me along the arrow. I flung myself up-right and down-slashed the hawker. Three lamps out, gate broken. |
| 4:10 | The first lantern | A vertical room with a big **two-dot lamp** that drags me in from far below, a **dangler** firing an aimed beam, and a burrback on the same plank. I traded at point-blank and dropped to 2/4 (unfair: three threats, and no read on the dangler). I broke a 3-dot floor grate at the bottom right and fell through. |
| 4:37 | The well: the old burrback | I landed on a moon patch, healed and saved. The run west is four glide gaps between tall pillars over hazard. One under-jump each time cost a put-back. |
| 5:00 | well, boss | The old burrback. I died at 5:20 (jumped over it, slashed its back, it spun and lunged instantly) and again at 6:03 with its bar nearly empty. **It seems to hold its red wind-up while I'm in the air and lunge the moment I land in front of it.** The run back from the patch is ~25 s and deterministic, which is fine. |
| 6:32 | boss | **Killed it** on the third try. What worked: stand just outside its red floor line, let it lunge and stop pale, step in for 2-3 slashes, step out. Its damage carried over between my deaths. The kill was quiet: particles, gone, no sting. |
| 6:36 | well | Bars lifted. A moonbeam says "Your claws have hardened. Jump at a wall to climb." **Wall-jump: a boss guarding an ability, perfect.** That beam didn't heal me the way other patches do. |
| 6:55 | well shaft | Wall-jumped up the shaft (hold into the wall and tap jump, very good) and came up **through the ticked plank in the hub**: the well loops back to the hub. But I **ping-ponged across the hub/well seam 12 times**, each time a fade to black and back. |
| 7:27 | hub top | Climbed the hub's pillar shaft with wall-jump and put out a lamp at the top. Took the high exit east across the top of the hawker room, glided off its far end and dropped all the way to the hawker floor. I couldn't tell where that route was meant to go, so I stopped there (lost). |

## 2. Moments

**Best 3**
1. **The LAMPFALL title card** over the moon, with moths peeling off the flock past me. `explorer2/shots/0045-after.png`
2. **"Your wings have dried"** while floating down a moonbeam, then gliding the red pit. That growth beat (hatch, then wings, then claws) is the spine of the game for me. `explorer2/shots/0189-gained-glide.png`, plus later `explorer2c/shots/0509-gained-wallJump.png`
3. **The lamp slingshot** once I understood it: orbit, aim, fling into a down-slash. It's Ori's Bash with a moth-and-flame meaning. Also the ring pogo in the burrow. `explorer2c/shots/0316-after.png`, `explorer2/shots/0155-burst.png`

**Worst 5**
1. **Glade alcove soft-lock.** Being thorough trapped me with no exit but R. `explorer2b/shots/0033-after.png`
2. **The old burrback's tells.** I took 9 boss hits and died twice. The wind-up holds while I'm airborne, and the pale "green" state looked like an opening but still hurt on contact. The kill had no payoff moment. `explorer2c/shots/0363-hit-by-oldBurrback-1-4-left-.png`, `0374-hit-by-oldBurrback-0-4-left-.png`, `0402-hit-by-oldBurrback-3-4-left-.png`
3. **The lamp capture rules are untaught.** Pips, a swinging arrow, and three presses to escape. Is it body contact or the glow radius that pulls me in? It took me ~10 lamps to piece together. `explorer2/shots/0067-after.png`, `explorer2c/shots/0235-after.png`
4. **The lantern-room pile-up.** A big lamp tethers me from far below while the dangler beams and a burrback charges, all on one plank. `explorer2c/shots/0235-after.png`, `0249-after.png`
5. **The hub/well seam ping-pong**, plus an **entrance ledge in the hub I couldn't climb back to** before wall-jump. `explorer2c/shots/0564-burst.png`, `0573-after.png`, `0127-burst.png`

**Time lost**
- Wicks, caged lamp: ~15 s. Out of reach. I left it, assuming a later ability.
- Burrow, rings and grate: ~15 s. I didn't know rings were pogo targets until I happened to hit one from above. The grate ignored my standing down-slashes, and later I learned only airborne hits count.
- Burrow, slab lamp: ~15 s. Two failed pogo-to-lamp attempts, given up.
- Glade alcove: soft-lock, needed R and a whole new session.
- Hub entrance ledge: ~10 s. I couldn't climb back and went the other way.
- Hub ticked plank: ~8 s. It's one-way from below, and I only found that out from the well side much later.
- Lantern room: ~25 s, ending at 2/4. I fled down the grate.
- Old burrback: ~100 s, 2 deaths. The tool's report counts one 31.5 s stretch of no progress.
- Hub/well seam: ~10 s of fades.
- High route east: ~10 s, then stopped. I couldn't find where it goes.

**Unfair hits**
- The lantern plank: three simultaneous threats, and the dangler has no tell I could read before the beam.
- The old burrback lunging the instant I land after a jump-over. Jumping over a charger is the genre's answer, and here it's a trap.
- The burrbacks' "green" phase dealing contact damage. I read green as "open".
- The thorn pits were fair (visible), though one came right off a moon-patch ledge.

**Boredom:** none really. The four glide gaps on each run back to the boss got samey on the third run, but they're short.

## 3. Secrets and finds

**Found**
- **Ring pogo** in the burrow, by accident: down-slashing from above.
- **The 3-dot rule** for gates and grates: three hits. I learned it on the glidewalk gate when the dots dimmed.
- **Buried lamp under the glidewalk floor grate**, by seeing a lamp glow under the floor.
- **Gated lamp alcove** in the hawker room, by seeing the lamp behind a 3-dot gate.
- **The lantern-room floor grate into the well** (probably the main path), from a 3-dot grate in a dead-end corner.
- **The alcove lamp in glade 1**, from the map's yellow dot. Reaching it trapped me.
- **The well loops back up into the hub** through the ticked plank.

**What I think I missed**
- The caged lamp high in the wicks.
- The slab lamp in the burrow.
- The chase-room starting lamp.
- The glidewalk's second floating lamp and its ceiling staircase.
- The thin ledges down the glidewalk's left wall into a lower pit.
- Two lamps in the lantern room, including the two-dot one.
- The barred lamp next to the well gate.
- The hub's pink-pad climb to its top-left.
- Wherever the hub's high east route actually leads.

The map shows 8 of 16 lamps snuffed in the last session. I have **no idea what moths are for** beyond healing: the counter climbed to 40 and nothing spent it.

## 4. What I think the game is about

I'm a moth child, just hatched. The **moon is the true light**: the flock flies toward it, and every **moon patch** is a shaft of moonlight that saves me and makes me grow ("wings have dried", "claws have hardened"). It's a metamorphosis told through abilities. **Lamps are false lights**: moths circle them, get stuck, and die beneath them (the dead moth under the first lamp). They grab me too, and when I put one out the moths come back to me and their light heals me. *Lampfall* means me putting out the lamps one by one. **The small moth** hatched beside me and keeps appearing ahead at moon patches, like a younger sibling or a guide who already knows the way and waits for me. I'd guess the end is leading the freed moths to the moon or somewhere safe. Nobody has spoken a word, and I like that, HK-style. But I'd love one beat where the small moth *does* something: follows me, points, or gets caught by a lamp itself.

## 5. Top 5 changes

1. **Teach the lamp slingshot on the first lamp, Ori-style.** Ori introduces Bash in a safe room with time slowing, a clear aim arrow and a single press to launch. Here, capture versus snuff depends on an invisible body/blade distinction, and escaping takes three presses while the arrow swings. Make the first wicks lamp always catch, slow time while caught, let one press launch along a player-aimed arrow (or label the three pips with the button), and draw the catch radius distinctly from the glow.
2. **Never put the player back somewhere they can't leave.** Celeste respawns are always on safe ground with an exit, and HK's hazard respawns sit before the hazard, not in a dead-end. The glade alcove resets you into a pocket the glide can't escape. Put the hazard respawn on the upper ledge, or add a lip or pogo ring in the alcove. Audit every put-back point the same way.
3. **Make the old burrback's tells honest and give the kill a moment.** In HK (False Knight, Hornet) the wind-up length is fixed, the post-attack window is visibly safe and contact damage is consistent, and a kill gets slow-mo, a sting and a reward. Don't hold the wind-up while the player is airborne. Make the pale post-lunge state harmless to touch, or recolour it. Use green for "open" everywhere (the small burrbacks too). Show the boss HP the same way all fight, and add a kill beat before the wall-jump beam.
4. **Smooth the hub's seams and its first visit.** HK upward transitions give a boost and place you clear of the boundary, and Celeste's do the same. The hub/well boundary under the ticked plank fades in and out repeatedly. Move the transition above the plank or give an upward kick. Before wall-jump, let players return to the hub's entrance ledge (a step or a pad), and keep the camera zoom steady so heights are readable.
5. **Signpost interactables and spread out threats.** HK's breakables crack on every hit, and its pogo targets have an obvious, consistent look. Here the burrow grate ignored grounded down-slashes, and the orange rings gave no hint that they bounce you. Show a crack or flash on every hit, including ones that don't count, and give the rings a bob or flash when you're above them. In the lantern room, introduce the dangler alone before stacking it with a dragging two-dot lamp and a burrback, the way HK introduces each enemy before mixing them.

Also: explain or use **moths**. A counter that only grows makes me wonder what I'm missing.

## Tool notes (for the harness, not the game)
- **`{R}` breaks the session.** After R, every `act` re-reports the entire history, writes hundreds to thousands of duplicate screenshots (3680 in `explorer2`), and resets "played" to 0. I had to restart sessions with `--room wood-glade --abilities glide`, which lost lamp and moth state from the earlier rooms. Deaths (re-form) did not trigger it.
- `--every 0.1` gave only about 0.2-0.3 s between burst shots, which is too coarse to react to a 0.25 s boss wind-up. Bursts are pre-planned, so reactive combat is much harder for the agent than for a human. Weigh my boss deaths accordingly.
- HEAD moved between sessions (377cba9, then a31bad7), so sessions 2-3 ran on a different build from session 1.
