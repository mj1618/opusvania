# Playtest: giving (2026-10-14, HEAD ce37480, `?skipprologue`)

The first playtest of the GIVING loop (giving.md, giving-render.md). Frozen build of HEAD on :5187 (another agent was
editing prologue/render), 1600x900, an in-page rAF bot pressing real keys (playtest.md method; `bot.js` + `pol.js`
with `window.__mode = natural | giver | ghost`, in `shots/playtest-giving/bots/`, logs in `logs/`, frames there too).
60 fps throughout (p99 17.8 ms). My bot's hands fail the shaft climb now and then: a logged `RESCUE` teleport after
25 s stuck, and stuck time is called out below rather than blamed on the game.

## The three runs
| | natural (never presses V) | giver (offers instead of cutting) | ghost (no pods, lays light down) |
|-|-|-|-|
| tally time | **1:08** | 2:21 (~55 s of it my bot failing the shaft) | 1:52 (~25 s my bot standing) |
| hits / fades / kills | 5 / 1 / 3 | 2 / 0 / 0 | **0 / 0 / 0** |
| gifts to creatures (calmed) | 0 | 14 (6) | 12 (8) |
| offered at the heart / tier | 34 / tier 1 | 10 / tier 0 | 3 / tier 0 |
| frames at seen 0/1/2/3/4 | 18 / 12 / 5 / 19 / **46 %** | 10 / 8 / 14 / **57** / 11 % | **31 / 33 / 32** / 4 / 0 % |

## 1. Is Offer / the seen rule discovered without being told? No.
- The only teacher is the grey 12 px legend (`00-open.png`), the second-last item on a two-line footer, gone 12 s
  after the first key. A natural player meets the first creature at 6-9 s (burr-path or lamp-glade), eyes on it,
  not on the footer. **The legend never states the seen rule**: it says what V does, not that light makes you seen.
- Nothing in the world prompts V (prompts.ts teaches only glide and kick). The natural run pressed V zero times.
- A curious key-masher who hits F at the start (F sits next to D) gets `offerMiss empty`: a small look into her hands
  (`01-first-F-empty-hands.png`); at 1x it reads as an idle twitch. No text, sound is muted: it teaches nothing.
- **The seen rule cannot be felt by contrast in natural play.** The spawn line gives ~11 glints in the first 5 s,
  so every creature is met already carrying: burr-path aware at L1 165 px (f749), lamp-glade at L3 308 px. She is
  level 4 from 25 s on (46 % of the run). Empty-handed moments (after a kindle) never meet a creature.
- Wallet 0 vs 40 at burr-path, same spot (`02-seen-pair-0-vs-40.png`): at 0 it walks past 94 px from her without a
  flicker; at 40 it is aware. The picture difference at 1x is "a bit warmer round her", not a beacon; the orbiting
  glints are hard to see. No HUD cue for the level; the number under the health is the only reliable read.
- The prologue teaches *hold* give (it streams to Sorrel). In the Grove holding V gives ONE glint (tested: 1 s held
  = 1 offer), so a prologue player who tries the taught gesture on a lantern sees almost nothing happen.

## 2. Is giving fun?
- **Yes, at its best moments**: a glint arcing to a diving lampwing and it peeling away dimmed (`09`); a burrback
  given a glint in its tell and stopping mid-charge (ghost f2640 -> gift f2650, no hit). These are the most
  "this game is not Hollow Knight" beats in the scene. Laying light into a lamp until it catches (`13`) is quiet and
  nice once, but 8-12 separate taps is a chore when standing would charge it anyway.
- **The tension of carrying is invisible, so it reads as punishment.** The natural player sits at L4 with 34-49 she
  cannot spend, and the far-lantern climb is where it bites: wing-rise sees her at 344-376 px and hits her 4 times in
  16 s (f2703, f3024, f3408, f3690) -> fade (`04`, `05`). She has no idea it is because she shines.
- **Reasons to pick up glints**: lanterns 12 x 3 and lamps 8 x 4; but glints wake within 84 px and fly to her, so
  picking up is not a choice. Pods are optional: the ghost skipped all 12 and still lit 3 lanterns and 2 lamps.
- **Reasons to fight**: almost none. A kill pays 4-6 and makes her MORE seen; a gift costs 1 and is safe at once.
  The tally only counts kills (`creatures 0/13` for the giver, `07`); calmed creatures are not shown anywhere.
- **Dominant strategy: give to every burrback.** 1 glint, one press, ~0 risk (giver 0 kills, 2 hits, both from
  quirks below; ghost 0 hits) vs 4-6 s and real risk to fight. Offer-spam is not needed: one press does it.
  "Always empty" is impossible (auto-pickup), "carry little" is easy (lay light into the next light) and safest.
  The only price is the heart's tier (10 / 3 offered vs 34), which the player meets only in the tally.

## 3. Moments
Great: the lampwing gift arc (`09`); the stopped ram; walking past a dozing burrback in the dark (ghost, wallet 0);
the moth going dark when emptied (`02`), when you notice it.
Bad / confusing / bugs:
- **A lampwing dive cannot be stopped by an offer if she stands still** (lamp-glade staged, `?manual`, wallet 8 at
  760,960; dive at +36): a press up to dive+10 is `offerMiss none` (out of the 150 px reach), dive+15 is in reach but
  the glint lands at +26, the touch at +24. Every offer lands after the hit. In its tell (the big red glow, `08`) it
  is ~190 px off: out of reach exactly when a player wants to give.
- **A pod cut breaks a calm**: giver gave burr-rise a glint (f7262), then cut pod-row-1 beside it (f7473): the slash
  hit burr-rise, roused it, she was hurt 12 frames later (`12`). Paid a glint and got hit for it.
- **The 10 s calm is a tax on anyone who struggles**: my giver slid back down the shaft six times and paid burr-shaft
  7 glints (f1477-f6207), each time it was aware again. A person failing the shaft climb pays the same.
- **The ghost lays everything into lantern-far 5 short** and stands empty at a dead end with no glints near: a lantern
  given part of its price says nothing about where the rest is.
- Tally (`06`, `07`): no row for calmed or gifted; the pacifist reads as `0/13 creatures`, tier 0.

## 4. Round 1's top 3 (all built in ab4429a / fc6a972; see Round 2)
Teach by contrast + a V prompt + hold to pour; lampwing gifts landable; giving counted at the heart and a calmed
row in the tally (plus: pod cuts skip calmed creatures, seen4 45, calm held while she stays, promised lanterns).

## Method notes
- `go.sh <mode> <outdir>` (bots/): clears localStorage, opens `/opusvania/?skipprologue` on the frozen build,
  imports `bot.js` then `pol.js`, polls `window.__result`, dumps log + JPEG snaps. Build: `git archive HEAD` into the
  scratchpad, symlink node_modules, `vite build --outDir`, `vite preview --port 5187 --outDir`.
- Offer timing is staged in `?manual` with `G.input('O1')` + `step(1)`; `giving(n)` sets the wallet.

# Round 2 (2026-10-14, HEAD fc6a972: sim ab4429a + render fc6a972; frozen build on :5188)
Same bot, plus `curious` (plays like natural, presses V 250-450 ms after the V prompt shows; after its first gift
it gives to ~65% of creatures, fights the rest) and a right-first variant (`order summit`) of natural and curious.
Bot `bots/pol-r2.js`, logs `logs/R2*.txt`, frames `r2-*`. Stuck time is my bot's shaft climb (named).
| run | time | hits / fades / kills | gifts (calmed) | offered / tier | seen 0/1/2/3/4 % |
|-|-|-|-|-|-|
| natural, ember first | 1:23 | 5 / 1 / 2 | 0 | 52 / **2** | 22/2/6/42/27 |
| natural, right first | 1:19 | 9 / 1 / 3 | 0 | 63 / 2 | 22/4/1/14/59 |
| curious, ember first | 2:12 (~65 s bot in shaft) | 2 / 0 / 1 | 10 (4) | 41 / 1 | 15/2/4/78/0 |
| curious, right first | 1:34 | 2 / 0 / 2 | 6 (5) | 57 / 2 | 22/3/2/38/35 |
| giver | 1:27 (25 s rescue) | **0** / 0 / 0 | 8 (6) | 30 / 1 | 24/2/10/64/0 |
| ghost (no pods, pours) | 1:42 (2 rescues) | 2 / 0 / 0 | 11 (8) | 11 / 0 | 41/15/21/23/0 |

## 1. Discovery: yes for Offer, still no for the seen rule
- **The V prompt teaches Offer within 10-13 s.** Ember-first: lamp-f3 tells at 10.5 s, the cap shows beside her
  (`r2-01`, `r2-03`: small, same style as the kick cap), the press at 13.1 s lands and the red lampwing goes pale and
  peels off (`r2-02`): cause and effect read at 1x. Right-first: first gift on burr-path at 9.8 s.
- **But the first presses can miss**: curious (ember first) pressed twice at f850 / f882 with the cap up and got
  `offerMiss none` (`r2-11`): lamp-f3 had already given up (`/calm`, f843) and the cap stayed while it was still
  "aware". First impression: "V does nothing". The cap is shown for awareness, not for an offer that would land.
- **The seen rule is still not discovered.** The contrast works in the sim (burr-path passed at wallet 1, not aware,
  both right-first runs) but **does not read**: at 1x the unseen burrback is a patrolling beetle with orange eyes
  (`r2-04`, `r2-05`), and both HK-grammar players cut it on sight (f628, f737), which rouses it. Ember-first players
  never meet burr-path on its ground. A ghost coming back WEST off the bluff carries the moved pool glints (6, L2) and
  lands in burr-path's ram (f962, `r2-06`). The prompt teaches "V calms"; nothing teaches "your light woke it".

## 2. Fun now
- **A real choice now, no single dominant strategy.** Giver: 0 hits, tier 1. Natural: 5-9 hits and a fade, tier 2.
  Curious (mix): 2 hits, tier 1-2: mixing is best, which is healthy. The tally shows it (`r2-08`: calmed 6/13 beside
  creatures 0/13, offered 30 with a star).
- **Pour is good**: held V draws one ribbon into the glass, flames fill (`r2-07`); a lamp in ~1.3 s (ghost f1936-f2009).
- **Carrying is still felt as punishment by non-givers**: wing-rise on the far climb at L4 (52-80 in hand) hit the
  natural 4 times + fade in BOTH natural runs (f3524-f4484; f3594-f4310) (`r2-09`). The difference now: the V cap is
  up during it (`r2-10`), and the curious player took 1 hit there. The answer is on screen; the cause still is not.
- Glints: still a reason (lights, tiers; gifts count). Fighting: a reason (kills feed the tier), at a price (hits).

## 3. New bugs
- **Prompt without a target** (above): show the cap only when `offerTarget` would return a creature now.
- **The calm still re-taxes the shaft**: `giftStayPx` 520 is measured as a distance, so climbing the shaft ends it.
  Staged (`?manual`, wallet 20, gift burr-shaft, teleport): to the summit (3700,192) or the ledge (3000,448) for 660
  frames -> gift 0, back on the floor it is aware again (45); on the floor 3150 / 3800 it holds at 1. Runs: curious
  paid burr-shaft 6 glints (f1465-f5368), giver 3, ghost 3.
- **The prompt nags a non-giver all run** (natural: shown 7 and 13 times, never pressed). Not harmful, a bit loud.
- The ghost still stands empty at lantern-far after pouring it short (no glints near); the promise rule is right,
  but nothing points to where the rest is. Minor.

## 4. Top 3 next changes (ranked)
1. **Make the seen rule visible at the moment it flips.** On `enemyAware`, a thin warm thread / glance line from the
   creature to her glow for ~0.4 s and the wallet number pulses; when she is unseen within 340 px, the burrback stops
   and sleeps (stands, lids fully shut, a slow "z"-like mote), not patrols. Then "it woke when I picked those up" and
   "it sleeps while I'm dark" are both seen. Keep the bluff glints off the westward drop too (burr-path from the east).
2. **The V cap only when an offer would land** (`offerTarget` returns a creature), and it stops after ~5 unanswered
   showings until the next fade. No first press should miss.
3. **Calm holds through the shaft**: `giftStayPx` on x only (|dx| < 520), or the calm lasts until she lights the
   next light. A struggling player should not pay the same creature six times.
