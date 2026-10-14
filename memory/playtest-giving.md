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

## 4. The three changes that would most improve the fun (ranked)
1. **Teach it in the level, by contrast.** (a) The kindle of lantern-stone already empties her (pledged: g0 at
   f377); only the pool's glints stand between it and burr-path (`pool-1..3` at 1630-1762 on her walk, `pool-arc-1..5`
   over it). Move them east of burr-path (past 2400): she meets it dark and it dozes as she passes, then she fills up
   and burr-shaft lifts its head at her. (b) An `offer` lesson in prompts.ts (the key cap over her, like
   glide / kick): the first time a creature becomes aware of her inside 260 px while she carries, until her first
   `enemyGift`. (c) Hold V streams (one glint every ~8 frames) as the prologue taught.
2. **Make a lampwing gift landable**: while a lampwing is in its tell or dive, offer reaches it at its sight (or
   `offerReachPx` 150 -> 260 for lampwings) and a glint to a diving one lands at once (`offerFlightFrames` 10 -> 0-3
   for an enemy in `dive`). Then "it saw my light, give it some" is the answer to the red glow, and the L4 harassment
   on the far climb has an answer a player can find.
3. **Pay giving back where the player looks**: the tally gets a `calmed` count next to creatures (calmed + kills /
   13), and glints given to creatures count toward the heart's offering (they went into the grove, not lost), so the
   giver is not tier 0 with `0/13`. Small extra: a cut aimed at a pod does not hit a calmed creature.
Honourable mentions: seen4 30 -> 45 (natural sits at L4 for half the run with nothing to spend on); a calm that
lasts until she leaves its ground (the story says "once she warms one of them, it knows her").

## Method notes
- `go.sh <mode> <outdir>` (bots/): clears localStorage, opens `/opusvania/?skipprologue` on the frozen build,
  imports `bot.js` then `pol.js`, polls `window.__result`, dumps log + JPEG snaps. Build: `git archive HEAD` into the
  scratchpad, symlink node_modules, `vite build --outDir`, `vite preview --port 5187 --outDir`.
- Offer timing is staged in `?manual` with `G.input('O1')` + `step(1)`; `giving(n)` sets the wallet.
