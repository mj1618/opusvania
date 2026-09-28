# L3 novice playtest: Seize / Levy played blind

Date: 2026-09-28. Build: https://mj1618.github.io/opusvania/ (live). Driver: `playwright-cli -s=novice`, real key presses, screenshots every step, `__game.state()` only to confirm things I already believed. Nothing in the repo was read before play except this file's own rules; the design brief (`docs/design/seize-levy-experiment.md`) was read afterwards for the comparison in §7.

Total blind time about 28 minutes. Rooms in order: Lot 7 (three entries), the control room (one entry, part way), The Pit (one entry, about eight deaths), Stairwell (one entry, stuck after the first bar).

## 1. What the screen taught me, in order

1. **Hub.** The bottom strip lists every key, including `V seize · B levy`. So controls were taught; I never needed the input source. Two strip problems: `Shift+1-4 rooms` jumps to gyms 11–14, not the L3 rooms (I pressed Shift+1 hoping for Lot 7 and landed in "Double jump"), and the strip does not mention that Seize and Levy take Up/Down aims, although it does say `Down+C pogo` for the jab.
2. **Door labels** do most of the teaching: "Lot 7 (seize / levy)", "Lot 7 control (jumps only)", "The Pit (2 Barkers, 1 Grinder)", "Stairwell (never land)". Entering a door needs you to stand almost exactly on it; I overshot doors seven times in the session and entered the control room by accident twice.
3. **Lot 7 first frame.** A HUD with three dashed squares, the word FEATHER with a dial, five pips; a pink wavy wall blocking the corridor; a grey speckled block under the floor; an orange wavy block on a ledge above. My reading: the pips are health, the squares are an inventory of three, FEATHER is some kind of size or weight, and the wavy things are "sounds" because wavy lines mean vibration.
4. **First Seize (about 45 s in).** Walked into the pink wall (solid), jabbed it (nothing), pressed V beside it. The wall became a dashed outline, a pink zigzag puck appeared in slot 1 with a NEXT caret. That was the moment: V takes the thing's sound and the thing stops being solid. I understood it from one press with no text.
5. **First Levy (about 1 min 10 s).** Walked through the ghost to the far wall and pressed B out of curiosity. The pink puck left the bag, hit the wall at my feet and became a zigzag spring that launched me straight up the wall onto the ledge. Pink = bounce landed immediately, and it was the best moment of the session.
6. **Weight.** Seizing the small orange block turned FEATHER into MIDDLE, the tall one into HEAVY; the dial swung each time. Standing on the two-piece plate while HEAVY sank it, lit its lamp and the barred gate vanished. Stepping off did not close it. So: orange sounds are heavy, weight is a resource, plates want weight.
7. **Heavy jump.** At the exit step my jump barely left the ground, with a dust puff and a screen shake. Read instantly as "too heavy to jump". Throwing an orange (B) made a one-tile crate at my feet and dropped me to MIDDLE; the crate plus a MIDDLE jump reached the exit.
8. **Room clear.** Touching the green bar warps you to the hub with no message. I did not know I had finished until I looked around the hub (and confirmed via room frames in state). A "cleared" beat is missing.

## 2. Lot 7: attempts and routes

| Attempt | Result | Verbs and roughly how many actions |
|---|---|---|
| 1 | Cleared, about 3 min | seize pink, levy pink at the wall (accidental "spring under my feet"), seize both oranges, stand on plate (HEAVY), fail the step, levy one orange, jump. About 14 actions, 5 verbs. This is the brief's Route B (heavy). |
| 2 | Abandoned (soft-lock) | Threw the pink into open floor 4 tiles short of the wall. The spring launches you on contact, so I could never stand beside it to seize it back: V while bouncing, V while adjacent facing it, mashing V ten times, all nothing. Bounce-and-steer to the ledge fell short twice. Reset via H. |
| 3 | Cleared, about 2 min | seize pink, levy at wall, bounce, seize small orange, throw it away, seize tall orange, stand on plate at MIDDLE (**nothing happens**), lob the orange onto the plate: lamp lights, gate opens, FEATHER jump clears the step. This is Route A (slab). |

So yes, two routes, found without hints: carry the weight, or throw the weight. The MIDDLE-fails / crate-succeeds contrast was the second best moment of the session; the plate reads as a scale rather than a switch.

Things that did not work and why I tried them:
- Jab on the pink wall (it is the obvious first key; no feedback at all).
- Seize from three tiles away, twice: no whiff animation, no sound, no hint that range matters.
- Seize on the grey speckled block from above (V and Down+V): nothing, no refusal flash. I never learned what it was.
- Re-seizing a misplaced spring (see attempt 2). This is the one real soft-lock a novice will hit, because the natural first Levy is "throw it and see", not "throw it at a wall".
- Walking over the speckled block expecting a crumble.

**Tooltip test: yes.** By about 90 s in Lot 7 I was pressing V on everything (wall, crate, tall crate, speckled block, then the spring), and later in The Pit on every enemy the moment it was adjacent. No text was needed for the objects. The habit is strong enough that it hurt me later: I kept pressing V on enemies that would not take it.

## 3. Control room (jumps only)

Same silhouette with plain blocks. I entered it twice by accident. With no abilities it is a floating-block staircase; I bonked the first block from below, overshot it three times and gave up after eight jumps. Part of that is the CLI's coarse timing, but the comparison still stands: the seize/levy version was cleared first try and the jumps-only version was not, mainly because the springs are forgiving and the block staircase is not.

## 4. The Pit

Not readable and not fun for a newcomer. About eight deaths in five minutes, zero enemy seizes, room never cleared.

- **Spawn.** You appear in the Grinder's lane. Its outline fills orange and it charges within about 1.2 s; if you stand still to read the room you take 2 of 5 health before you have done anything. On every respawn the same thing happens, so learning time is about a second per life.
- **Telegraphs.** The fill-colour telegraph exists and I did notice it (Grinder fills orange, Barker fills pink before a lunge), but there is no back-up step I could see, no pulse I could count, and the fill happens so close to the hit that "filled" means "already too late". The Barker's lunge from off-screen-left arrived while I was still looking at the Grinder.
- **Which sound does what.** The colours match Lot 7 (pink outline on Barkers, orange on the Grinder) so I guessed pink dog = spring, orange box = crate. I never got to test it: V next to a lunging Barker, V next to a recovering Grinder (twice), V while mashing during a sandwich; nothing happened and no refusal flash told me why. I ended the room believing seize does not work on enemies. State later showed a `rattled` counter and a `source` on each enemy, so there is a rule (probably "hit it first" or "aim") that the screen never showed.
- **The Count.** Never saw it. No knockdown, no ring, no tether. No enemy health or hit reaction visible either: five jabs on a Barker looked identical to zero jabs.
- **Death feedback.** A red speck burst and an instant reset. `deaths` shows 1 for one frame and is then reset to 0 with the room, so the HUD reports zero deaths after eight. That is a bug.
- **Did I use seize/levy naturally?** I tried seize constantly and it never worked; I never had a sound to levy; I fell back to jabbing and then to running. The room is the opposite of the tooltip test: it trains you that V is useless on things that move.

## 5. Stairwell

A shaft with full-width pink bars. Jump-and-V at the apex missed by a few pixels; Up+V at the apex took the first bar (this was the third best moment: the aim modifier exists and works). Then I dropped the spring with B, bounced, and the bounce apex was clearly below the second bar. Tried: repeated bounces (constant height), holding jump on contact, pogo on the spring, drifting. Stuck after about six minutes. I never thought to throw the spring while airborne or to seize the spring from above while falling, because nothing had told me aims exist for Levy at all.

## 6. Delight, confusion, frustration, bugs

Delight: the first ghosted wall with the puck ribboning into the bag; the spring launch; the weight words and the swinging needle; the heavy thud and camera shake; the crate landing on the plate and the gate dissolving; Up+V catching a bar mid-air.

Confusion: silent room-clear warp; the speckled block; seize with no reach feedback; whether seize can hit enemies; what "never land" wants; `Shift+1-4` label.

Frustration: the misplaced spring soft-lock; door precision in the hub; the Pit spawn lane; dying with no pause; the deaths counter lying.

Bugs or near-bugs:
1. `deaths` counter reset to 0 by the room reset (visible as 1 for a frame).
2. Death is an instant reset with no pause; hard to even notice you died.
3. No refusal feedback on a whiffed or refused seize (white static should flash per the brief; I saw nothing).
4. Spring under the player re-launches every contact, so the on-foot re-seize the brief assumes is impractical.
5. Twice a movement or jump input seemed to be dropped right after a landing or hit (could be tool timing; low confidence).
6. Room-clear has no on-screen event.

## 7. Intended vs experienced (after reading the brief)

| Brief intends | What happened |
|---|---|
| White static `W` teaches "not everything is a sound" via `seizeRefused` flash | The W strip is in the floor under the spawn. Seize aims forward, so it is never in reach; I saw no flash and learned nothing from it. Move it into the corridor at head height. |
| Levy is forced in the hall by the 6-tile drop; expert does "jump and down-levy" so the spring is under your feet | I got the same effect by accident by throwing at a wall. Down-levy was never discovered in 28 minutes. Neither Up nor Down aims are on the control strip. |
| Route A (slab on plate) and Route B (heavy) | Both found blind, B first, A on the third entry. The MIDDLE-does-nothing plate was the clearest teacher in the build. |
| "Heavy can't clear the step; levy anything or jump then down-levy" | Felt within one jump, exactly as hoped. Solved by throwing, not by the recoil hop. |
| Levied spring is a source and can be re-seized | Only from the air with Down+V, which a novice will not guess. On the ground it launches you first. |
| Pit: signature policy and jab-only both clear with 0 deaths (bot) | A novice dies about every 40 s. The verdict measures experts only; nothing in it would catch this room. |
| Barker telegraph with 3 pulses, Grinder backs up 24 px, tether during RETRIEVE, Count ring | I saw a colour fill and nothing else. No knockdown was ever reached, so the Count and tether were never on screen. |
| Seize on an enemy disarms it (open vs guarded, Catch) | Never succeeded; no visible reason. Whatever "open" means, it needs a visible state. |
| Stairwell: up-seize, down-levy, down-seize the spring you left, repeat; bars 7 tiles apart tuned so one chain reaches | Up-seize discovered; the rest not. Bounce apex from a floor spring did not visibly reach the next bar; either the spacing is off for a walk-on bounce or the recoil from a down-levy is required and I never had it. |
| Bag HUD: caret, pucks, weight plate, needle | All read correctly, no text needed. This part of the HUD is finished. |

## 8. Verdicts

- **Discoverable:** Seize and the bag, yes, in under a minute. Levy's colour rule, yes (pink = spring, orange = crate). Weight, yes. **Aims (Up/Down for Seize and Levy), no**, and every advanced beat in the brief (recoil hop, re-seizing a spring, the whole Stairwell) depends on them. Seize on enemies, no.
- **Fun:** Lot 7 is fun and surprisingly forgiving; the two-route plate is good design. The Pit is currently a wall. The Stairwell is a locked door until aims are taught.

## 9. Top five changes

1. Teach the aims: put `Up/Down+V seize`, `Down+B levy` on the strip, and make the first hall of Lot 7 impossible to throw at a wall so the down-levy is the discovery (or let a spring thrown short be re-seized on foot).
2. Give seize a whiff: a short reach animation and a refusal flash on everything that is not takeable, including enemies that are guarded. Say why with a state, not a text box.
3. Fix the Pit spawn: put the Kid on a platform or give a 2 s grace before the Grinder's first charge, make the Grinder's back-up step visible, and add a hit reaction plus a visible chin on enemies.
4. Death and clear beats: a 20-frame pause and a fade on death, a "cleared" flash before the hub warp, and stop resetting `deaths` with the room.
5. Doors and hotkeys: widen the door trigger to the full door width and label the L3 hotkeys correctly (or add Shift+5–8 for them).
