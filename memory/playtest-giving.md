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

# Round 3 (93d0512): the seen rule learnable on the right-first road only
Right-first curious: burr-path asleep at 1 glint, burr-shaft catches her at 21 (thread + cap), first gift 11.4 s.
The HK player cut the sleeper; ember-first players never met one; the thread was 1-2 px for 0.45 s; the cap's fade
tail ate presses; a lamp stole an offer meant for a bracing burrback; sleepers lay down late in a turn pause; giver
0:51, 0 hits, tier 0. All addressed in round 4 (7d3e392, 3da504f). Frames `r3-*`, logs `logs/R3*`.

# Round 4 (2026-10-15, HEAD 3da504f: sim 7d3e392, render 3da504f; frozen build `playtest-giving-r4-dist` on :5191)
"Ember" = kindles the stone, watches the moths, follows them west (islands F1-F3) to the ember. Times are the tally's;
"loop" = my bot circling the shaft / high route (no rescue fired because it kept moving). Logs `logs/R4*.txt`.
| run | time | hits / fades / kills | gifts (calmed) | offered / tier |
|-|-|-|-|-|
| natural, ember (A4) | 0:58 | 3 / 0 / 3 | 0 | 43 / 1 |
| natural, ember (A3) | 1:40 (loop ~45 s) | 4 / 0 / 4 | 0 | 66 / 2 |
| natural, stone -> burr-path -> ember (A2) | 2:04 (loop) | 5 / 0 / 5 | 0 | 69 / 2 |
| natural, right first (E) | 1:19 | 6 / 0 / 3 | 0 | 65 / 2 |
| curious, ember (D2) | **0:56** | 1 / 0 / 1 | 3 (3) | 26 / 1 |
| curious, right first (F) | 1:17 | 3 / 0 / 1 | 6 (5) | 52 / 2 |
| giver (B) | 1:28 (loop ~50 s) | **0** / 0 / 0 | 6 (6) | 33 / 1 |
| ghost, no pods (C) | 2:20 (loop + 1 rescue) | 0 / 0 / 0 | 10 (7) | 10 / 0 |

## 1. Ember-first: the contrast is there, but it doesn't land as cause and effect
- What a first-timer on the moths' road meets (A3, A4, D2 alike): **lamp-glade roosting** as she hops past it with
  1 glint (f602-f725, `r4-03`; zoom `r4-04`: wings folded, lamp dim, a mote: reads at 1x as "resting"). It **wakes
  silently** when she picks up her 2nd glint, by then 242-324 px past it (no thread: it never sees her). **0.5 s later
  lamp-f3 catches her** at 3 glints with a bright, solid thread to her glints, the count flaring, and the V cap
  (`r4-05`: the best "you are seen" frame yet). So the pieces are all there, but on two different creatures, and the
  roost is behind her. Likely read: "lampwings notice me", not "they notice my light".
- **The first V caps on this road are flickers**: lamp-f3's lasted 10, 4, 13 and 15 frames (A3, A4, D2). At level 1 its
  reach is its sight x 0.75 (~195 px); she is moving away, and it gives up `/calm` 50 frames after noticing (lantern-
  stone's circle). The curious player couldn't answer them; it first gave at lamp-ledge (cap 21 frames, pressed at
  ~20) at **16.0 s** (D2, `r4-06`). Burrback caps last 70-165 frames: plenty.
- No burrback sleeps on this road for my players (burr-bank, the round-4 sleeper, is only met going WEST from the
  spawn before the stone; following the moths after the stone never passes it).

## 2. Does the natural player still swing at sleepers? Yes, where it meets one
- burr-path asleep from 323-339 px (full range now, `r4-01`, zoom `r4-02`), asleep 0.2-2.5 s by the time she reaches
  it; the natural cut it every time (A, A2 f803/f806, E f736), it woke (`r4-01c`), and the kill paid 4-6 glints.
  (My natural bot always swings; the picture gives a human no reason not to: a dim beetle with one mote, in the way.)
- Ember-road naturals met no sleeper, so they had nothing to swing at.

## 3. Fun and dominance
- **Fixed and good**: no press under the cap missed (0 in all runs), no lamp stole an offer meant for a creature (0),
  the thread + count flare read at 1x, the curious ember run is the cleanest yet (0:56, 1 hit).
- **No single dominant line**: giver 0 hits, tier 1; natural 3-6 hits (no fades), tier 1-2; curious 1-3 hits, tier 1-2.
  Fighting is the greedy line (kills feed the tier), giving the safe one. Carrying still bites the natural at L4
  (30-60% of its run) on the far climb, but every notice now shows its cause on screen.

## 4. Bugs
- **Roost flicker at the edge of range**: wing-rise roost/wake toggled 8 times in 22 s with the ghost at 254-339 px
  (C, f7009-f8319); lamp-glade roost -> wake -> roost in 7 frames at 118 px (A4 f718-f726, D2 f719-f725). Each wake
  snaps the wings open: a visible flap-flap. Needs hysteresis (wake at 380 px, or only on wallet >= 2).
- Lampwing caps at level 1 live 4-15 frames (above): accurate, but too short to answer.
- (Bot, not game: the ghost's held V misses while jumping at lantern-far, 4 `offerMiss none`.)

## 5. Top 3 next changes (ranked)
1. **Make the ember-road wake causal**: put the 2nd glint where lamp-glade still sees her (inside its ~195 px sight
   at level 1, e.g. on F1 under it), so picking it up wakes it AND draws its thread at once: "I took that, it saw me".
   Add roost hysteresis while there.
2. **Give lamp-f3's first notice room to be answered**: keep a lampwing that noticed her offerable for its whole tell
   + dive (at least ~0.6 s of cap), and don't let lantern-stone's circle call off lamp-f3 50 frames after it notices.
3. **Make the sleeper argue against the swing**: a sleeping burrback curls into its shell (the existing clang on top:
   a cut glances, no damage, it wakes grumpy), or lies just off the walking line. Then "walk past, it's asleep"
   is what the screen says, and the HK reflex teaches the rule instead of skipping it.
