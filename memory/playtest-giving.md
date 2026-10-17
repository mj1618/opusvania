# Playtest: giving (2026-10-14/15, three rounds, `?skipprologue`)

Playtests of the GIVING loop (giving.md, giving-render.md). Each round: a frozen build of HEAD on its own port, 1600x900,
an in-page rAF bot pressing real keys (playtest.md method). Modes in `shots/playtest-giving/bots/pol-r3.js`
(`window.__mode`): `natural` (Hollow Knight grammar, never presses V, cuts what it meets), `curious` (natural, but
presses V 250-450 ms after the V cap shows; after its first gift gives to ~65% of creatures and walks past a sleeper),
`giver` (gives instead of cutting, holds V at a light it can't afford), `ghost` (no pods, gives everything away).
`order summit` = right first (ignores the moths after lantern 1). Logs `logs/`, frames `NN-*`, `r2-*`, `r3-*`.
My bot's hands fail the shaft climb sometimes: a logged `RESCUE` teleport after 25 s stuck; stuck time is named.

## Method notes
- `go.sh <mode> <outdir> [order]` (bots/): clears localStorage, opens the frozen build, imports `bot.js` + `pol.js`,
  polls `window.__result`, dumps log + JPEG snaps. Build: `git archive <sha>` into the scratchpad, symlink
  node_modules, `vite build --outDir`, `vite preview --port N --outDir`. **Use a uniquely named outDir**: the session
  scratchpad is shared with other agents and one rebuilt my `dist3` (with `--emptyOutDir`) mid-run.
- Offer timing / sleep onset staged in `?manual` with `G.input('O1' | 'R1')` + `step(1)`; `giving(n)` sets the wallet.

# Round 1 (HEAD ce37480): Offer and the seen rule undiscovered
natural 1:08, 5 hits, 1 fade, tier 1, L4 46% of the run, never pressed V / giver 0 kills, 2 hits, tier 0 /
ghost 0 hits, tier 0. Found: the 12 s grey legend was the only teacher and never stated the seen rule (`00`); every
creature was met carrying (spawn line); wallet 0 vs 40 read as "a bit warmer" (`02`); holding V gave one glint
(prologue teaches hold); a lampwing dive could not be stopped (offer landed 2 frames after the touch); a pod cut broke a
calm (`12`); the 10 s calm re-taxed the shaft; tally showed `0/13 creatures` for a pacifist (`07`). All of round 1's
top 3 were built (ab4429a, fc6a972): contrast at burr-path, a V cap, hold to pour, landable lampwing gifts, gifts
count at the heart, a calmed row in the tally, seen4 45.

# Round 2 (fc6a972): Offer taught by the V cap in 10-13 s; seen rule still invisible
natural 1:19-1:23, 5-9 hits + a fade, tier 2 / curious 2 hits, tier 1-2 / giver 0 hits, tier 1 / ghost 2 hits.
Mixing was best: no dominant strategy. Pour reads well (`r2-07`); the tally shows calmed (`r2-08`). Bugs then: the cap
showed for awareness, not for a landable gift (two misses, `r2-11`); the calm still ended when she climbed the
shaft; an unseen burrback looked like a patrolling one (`r2-05`) and HK players cut it. Top 3 were built in round 3.

# Round 3 (2026-10-15, HEAD 93d0512: sim a37f5de, render 623e5bc, audio 93d0512 muted; frozen build on :5189)
| run | time | hits / fades / kills | gifts (calmed) | offered / tier | seen 0/1/2/3/4 % |
|-|-|-|-|-|-|
| natural, ember first | 0:57 | 3 / 0 / 2 | 0 | 34 / 1 | 30/5/15/50/0 |
| natural, right first | 2:08 (~50 s bot in shaft) | 6 / 1 / 4 | 0 | 56 / 2 | 15/2/1/10/72 |
| curious, ember first | 1:22 (one rescue) | 1 / 0 / 0 | 5 (5) | 25 / 1 | 22/3/9/66/0 |
| curious, right first | 1:37 | 3 / 0 / 1 | 5 (5) | 52 / 2 | 18/3/1/47/31 |
| giver | **0:51** | **0** / 0 / 0 | 6 (5) | 16 / 0 | 37/4/36/23/0 |
| ghost (no pods) | lantern-far 2 short at 92 s (pod-far, 3, is 190 px away; the bot won't cut it) | 2 / 0 / 0 | 7 | - | - |

## 1. Does a first-timer get the SEEN rule now? On the right-first road, in ~11 s, if they don't swing first
- **Right first, curious** (`logs/R3F`): burr-path lies down as she passes with 1 glint (f624), she walks by, picks up
  the terrace glints, and burr-shaft catches her at 21 (f823: thread + V cap, `r3-04`), first gift f875 (11.4 s). Dark:
  it sleeps; lit: it wakes. That's the whole rule, and it reads as a story.
- **But the HK player swings at the sleeper**: natural right-first cut burr-path 3 frames after it lay down (f627),
  woke it and learned nothing about light. At 1x the sleeper is a dark lump with lights out and one pale mote
  (`r3-01`, zoom `r3-01b`); it reads as "harmless", not clearly as "asleep because I'm dark".
- **Ember first (the road the moths lead): no burrback ever sleeps** (0 doze events in R3A and R3D). The first creature
  is lamp-f3 at 2-3 glints (V cap, `r3-05`), then burrbacks met at L2-3 with the thread. These players learn Offer,
  and see the thread, but never the contrast.
- **The thread works, but quietly**: from its eyes to her ring of glints, 1-2 px dotted, gone in 0.45 s (`r3-02`,
  zoom `r3-03`); her glints flare. At 1x it's easy to miss in motion; the in-breath that goes with it is muted.
- The ghost (wallet 0) saw burr-path sleep from 331 px and burr-rise from 168: the rule reads perfectly for someone
  already playing it.

## 2. Fun, dominance, punishment
- **Giving now edges toward dominant for a first-timer**: giver fastest (0:51) with 0 hits; the only cost is the tier
  (16 offered, tier 0, `r3-07b`), shown at the very end. Natural 3-6 hits; curious (mix) 1-3 hits, tier 1-2. Fighting
  is now only done by players who don't know V; once known, cutting has no reason except the tier.
- **Carrying is explained a little now**: each notice draws a thread to her glints and the V cap answers it. Still,
  natural right-first sat at L4 for 72% of the run and burr-rise + wing-rise took 4 lights and a fade (f6524-f7031).
- Good moments: the sleep-then-catch sequence (right first); the red lampwing turning pale to a quick streak; the pour.

## 3. Bugs
- **The V cap's fade-out still eats the first presses**: cap up at f700 (lamp-f3 aware), lamp-f3 gives up (`/calm`) at
  f717, presses at f721 and f749 miss (`r3-06`). The cap lived 0.28 s before its target left; its fade tail invites
  the press. Hide it on the frame `offerTarget` goes null, or let a press within ~0.4 s go to that creature.
- **A lamp steals an offer meant for a bracing burrback**: burr-rise in windup at gap 137/130, two presses, both went
  to lamp-rise (`lampGift`, f3753/f3773); rammed at f3784 (`r3-09`). Same in the giver (f2123). The creature is
  just outside 150 px, the lamp is in reach.
- **The sleep waits for a turn pause**: in both right-first runs burr-path was in `pause` and lay down only at
  104-113 px (staged from the pool: 316-324 px). Lying down 0.1 s before she arrives reads as cowering.
- Ghost walking back west with 6 (terrace glints, for the ember) lands in burr-path's ram (f1030, f1121); mostly my
  bot's 3 s "watch" stance. A no-pod ghost ends 2 short at lantern-far; pod-far is the answer but nothing hints at it.

## 4. Top 3 next changes (ranked)
1. **Put the contrast on the moths' road.** Most first-timers follow the moths to the ember and never see a burrback
   sleep. Give the lampwings the same read: a lampwing that doesn't see her roosts (wings folded, lamp at ~15%, a
   slow mote) and lights up with the thread when she carries 2+; or put a sleeping burrback on F3 / the bank before
   the ember. The first creature each route meets should sleep when she's dark.
2. **Tie the thread to the number and make it read at 1x**: thread 2-3 px and held ~0.8 s; when it lands the glint
   count in the HUD flares; the sleeper gets larger, slower "zzz" motes (2x) and lies down from the edge of `dozePx`
   even mid-pause. Then the corner number IS what they see. (And unmute the notice in-breath once Matt approves.)
3. **Make the offer target what the player means**: prefer an aware or bracing creature within ~200 px over a
   dormant light, and drop the V cap the instant `offerTarget` is null. Each costs a first-timer a hit or a
   "V does nothing".
