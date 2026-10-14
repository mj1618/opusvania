# Giving: the game plays like giving (seen, offer, rest = give)

Why: the analysis (docs/story/uniqueness.md "The biggest lever", locked.md "Distinctness guardrails") found the
story distinct but the PLAY Hollow Knight's grammar. The fix: carrying light makes you seen, empty-handed you slip
through, Offer calms what you would cut, healing is paid by giving. Story rules it follows (current/mouthless.md
section 2): "Give warmth, don't fight", "Moths go unseen... once she warms one of them, it knows her", "Lampwings see
light... any light a moth carries". The slash and the pogo stay; no new creatures.

Sim: `src/sim/seen.ts` (levels), `src/sim/giving.ts` (the offer), `enemies.ts` (`giftEnemy`, awareness, contact),
`enemies/burrback.ts` / `lampwing.ts` (`sees`, `gift`), `goal.ts` (rest = give, `LanternState.given`,
`heartGiven`). Numbers: `tuning.giving` (+ `burrback.noticePx`). State version 20.
Tests: `tests/unit/giving.test.ts` (rules, the lamp-glade case), `naive-pilot.test.ts` "giving" (natural, ghost,
laying ghost, hoarder, offer pilots). **Round 2 (after memory/playtest-giving.md) is the section below; where it
contradicts the older text further down, round 2 wins.**

## Round 3 (2026-10-14, after playtest-giving round 2)
- **`player.offerTarget`** (`{kind, id}` | null, `markOfferTarget` at the end of every step): what a press would land
  on this frame, by the offer's own rules (null: empty hands, out of control, the run over, nothing in reach). The
  HUD's V cap (`hud/prompts.ts`) shows only while it is a creature that is aware of her: a press under the cap
  always lands (test: every 3rd frame of the lamp-glade staging). A showing = the cap rising from nothing; after
  `offerShows` 5 unanswered (no `offer` / `offerMiss` between) it rests until her next `fade`. (Was: armed by an
  `enemyAware` within 260, shown while any creature within 340 was aware: the curious bot pressed under it twice
  and missed, lamp-f3 had already given up.)
- **The calm holds through the shaft**: "her ground" is `|her x - its home x| <= giftStayPx` (520) at ANY height.
  Staged: gift burr-shaft, 11 s at the summit (3700, 192) or the ledge (3000, 448), back on the floor: still calm,
  not aware. The pilots now pay burr-shaft again only after the ember fetch (she went 1900 px west: really gone).
  Not chosen: "until she lights the next light" (it would also hold through the climb, but a player who buys no
  lamp and is short at the crown keeps a calm for the whole grove; side-to-side distance reads as "its ground").
- **An unseen burrback sleeps** (`EnemyState.dozing`, `burrback.dozePx` 340): she is within 340 px (centres), carries
  less than `seen1`, and it is not in a fight (not roused, stirred, braced, curled, shoved): it stands where it is,
  no patrol, no rest schedule; it wakes the step she carries 2. Seen-but-not-yet-aware (a carrier 250 px off) still
  patrols: a sleep there stopped every staged fight's approach. The natural tapper finds burr-path asleep (1 glint)
  before she cuts it; the ghost finds all three road burrbacks asleep. Tests of lanterns / sanctuary that watch a
  burrback walk while she stands spent use `waking()` (helpers.ts: `dozePx` 0).
- **The bluff's west end holds no glint**: `pool-1, pool-2` moved to the terrace (2905 / 2965, 1110); `pool-3` stays
  over the east lip (2652, 955). A ghost coming back west no longer lights up right over burr-path's ram.
- For render: `e.dozing` (draw the sleep: shut lids, no stride: `stride` stops), `player.offerTarget`.

| pilot | time | hits / fades | notes |
|---|---|---|---|
| natural tapper / holder | 50.0 / 57.6 s | 6 / 2, 6 | burr-path asleep at wallet 1 before her cut |
| giver tapper / holder | 38.7 / 47.3 s | 1 / 0 | burr-shaft paid once per visit (again only after the ember fetch) |
| ghost (no glints), 3 hands | 23.6-27.9 s to the heart | 0 | all three road burrbacks slept as she passed; never noticed |
| laying ghost tapper / holder | 36.9 s / finishes | 1-2 / 0 | |
| careful reader | 60.5 s | 2 / 0 | unchanged |

## Round 2 (2026-10-14, after playtest-giving)
- **Teach by contrast, in the level**: `pool-1..3` moved onto the bluff's top (2452 / 2496, 918; 2652, 955 over its east
  lip) and `pool-arc-1..5` down its east side to the terrace (2660-2855): she wakes none of them before burr-path.
  **`seen1` is 2** (one glint is too small a light to find her), so the first lantern's kindle (13 in, 12 out) leaves
  her one glint and **unseen**: burr-path dozes as she passes; carrying 20 at the shaft, burr-shaft lifts its head.
  Tried first: lantern-stone `cost: 13` (empties her). Rejected: it moved the careful pilot's arrival at the shaft by
  0.3 s and its second tell went (one cut from behind out of the doorway), and pinned 12s across six test files.
  The pool's "way home" trail (layout-pilot) is gone with it.
- **The offer prompt** (`src/render/hud/prompts.ts`, lesson `offer`): armed by the first `enemyAware` within
  `offerPx` 260 while she carries; the offer key's cap (V, or the one she uses) tapped beside her while a creature
  within 340 px is aware of her and she has something; gone for good at her first `enemyGift`.
- **Hold to stream** (as the prologue teaches): a press gives one; held past `offerStreamDelayFrames` 16, one every
  `offerStreamFrames` 8 into a dormant light or the heart (`offerTarget(..., lights = true)`), never a creature (one
  per press, however long held). A glint to a light flies `offerLightFlightFrames` 8 (= the gap: one in flight).
  A lamp of 8 from a held V: about 1.1 s.
- **A lampwing gift is landable**: one in its tell / dive / stall / climb is in reach as far off as it sees her (its
  sight x her scale, at least 150), and a glint to it lands in `offerWingFlightFrames` 3. The playtest's lamp-glade
  case (8 glints at 760, 960: tell at 0, dive at 36, touch at 60) is a test: a press at any frame 0..51 stops it,
  untouched. (It was: a press up to dive+10 out of reach, dive+15 landed after the touch.)
- **A gift's calm lasts until she leaves its ground**: `gift` counts down `giftCalmFrames` (the warmth fades; render
  and sound read the share) and then holds at 1 while her body centre is within `giftStayPx` 520 of its home; it
  ends once she is further. No re-tax for sliding back down the shaft (the playtest bot paid burr-shaft 7 glints).
- **Reward giving**: glints given to creatures count in the heart's offering and tier at `gather` (`offered` =
  wallet + `heartGiven` + `gifted`; still `spent` in the glint tally, never counted twice). The tally
  (`src/render/hud/summary.ts`) has a **calmed n / 13** entry (icon: a shell the right way up with a warm glint)
  beside creatures; creatures' gold flourish when felled + calmed = all.
- **A cut aimed at a pod passes over a creature she has calmed** (`slashEnemies`: a closed pod in the hit area ->
  gift-calmed creatures are skipped for the whole slash). With no pod in reach a cut still lands and ends the calm.
- **Level 4 is 45 glints** (`seen4`), not 30.
- **Laying light down never strands her**: a LANTERN given part of its price by hand is *promised*: it catches
  (`lanternKindle {away: true}`) the step her wallet covers the rest, wherever she is (the pledge's rule). Lamps are
  optional and wait for her. The laying ghost (below: no pods, gives every creature a glint, holds V at every dormant
  light it reaches) finished only after this: before, the holder laid 3 into the stone, glided over it with the
  ember and never came back (heart asleep "1 of 3" at 152 s).
- **For render** (not mine to change, src/render/giving): `offer.frames` / new `player.giftFrames` is the flight now
  (3 / 8 / 10); `GivingRenderer` still divides by `tuning.giving.offerFlightFrames` (10), so the 3-frame glint to a
  lampwing starts two thirds along its arc. The calm-breath sound reads `gift` as a countdown: it still is.

| pilot (naive tapper / holder unless named) | time | hits / fades | gifts (calmed) | kills | offered / tier |
|---|---|---|---|---|---|
| natural (masher, never presses V) | 50.0 / 59.2 s | 6 / 2 (tapper), 8 (holder) | 0 | 2 | 43 / 1 (tapper) |
| natural: burr-path on first approach | wallet 1, not aware (contrast holds) | | | | |
| giver (`offer`) | 38.7 / 47.3 s | 1 / 0 | 6 (4) | 0 | 36 / **1** |
| ghost (no glints at all, hops them) | 18.5-21.4 s to the heart | 0 | 0 | 0 | never noticed |
| laying ghost (no pods, `offer` + `lay`) | 36.8 / 41.7 s | 1-2 / 0 | 5-6 (4-5) | 0 | 9 / 0 |
| careful reader | 60.5 s | 2 / 0 | 0 | all on the road | |

## 1. Seen: the light she carries
- `seenLevel(count)`: 0 under `seen1` (2: empty-handed or one glint); 1 from 2, 2 from `seen2` (6), 3 from `seen3`
  (15), 4 from `seen4` (45). Each level scales the creatures' own notice ranges by `scale1..4` = 0.75 / 1 / 1.2 / 1.45.
  **Level 2 (a handful: about half a lantern) is exactly the old tuned fight**; every fight and placement was tuned
  at scale 1, so a carrier of 6-14 meets the grove as before.
- Burrback: brace reach `strikePx` 130 x scale = 98 / 130 / 156 / 189 (box to box); awareness `noticePx` 220 x
  scale = 165 / 220 / 264 / 319 (centre to centre, clear line). Its range (`radius`) rule is unchanged: it still
  braces unprovoked only at one inside its range, so a far range mostly shows as awareness, not an earlier ram.
- Lampwing: its sight (`noticePx` 260 or the scene's `sight`) x scale. lamp-sky (500) at level 4 sees 725, but its
  leash (520 from home) still bounds it.
- **Level 0 (she carries nothing)**: no brace, no flinch, no awareness; a lampwing does not see her at all (`lit`
  is false: one already after her gives up `dark` the moment her wallet empties). **And a creature that does not
  see her does her no harm**: contact is skipped unless it is in a fight with her (`braced`, `roused`, `stirred`).
  Chosen so empty-handed means "slip through" (the brief), not "bump into blind armour". It cannot be farmed: glints
  wake and fly to her on their own, so she is empty only just after giving everything away.
- **A creature she cuts knows her** (`roused` 300 frames): it braces from `provokedPx` 150 and its touch hurts
  whatever she carries (rule 3: "once she warms one of them, it knows her"; here: once she cuts one).
- `player.seenLevel` (0-4) and `player.seen` (0..1 = level / 4) are set at the end of every step (`markSeen`); the
  creatures read the wallet as it stands when they move.
- **Awareness** (`EnemyState.aware`, frames left, `giving.awareFrames` 45 after it last saw her; `enemyAware` on the
  rising edge with `level` and `px`): a burrback that sees her (above), a lampwing in its tell / dive / stall /
  climb, any creature in a fight. Never while calmed. It changes nothing in their behaviour; it is the "she is
  seen" signal for render and the HUD.
- Rejected: turning a burrback toward her when it becomes aware (it would always face her: no free cut from
  behind, every fight rewritten). Kept the brace rules; awareness is only the lifted head.

## 2. Offer (the `offer` action, bit 128; keys V / F / I, pad Y / Triangle; DSL `O`)
- A press (buffered `offerBufferFrames` 16, one every `offerCooldownFrames` 14, not in a dash, a stagger, a fade,
  a hitstop, nor after `gather`) gives ONE glint to what is in reach (`offerReachPx` 150 from her body centre to the
  nearest point of its box, clear line): the nearest creature not already calmed by a gift; else the nearest
  dormant lantern / lamp with price left; else the heart. She turns to it. The glint leaves the wallet at the press
  (`spent` + 1, `gifted` + 1 for a creature; the heart's goes to `offered` / `goal.heartGiven`) and arrives
  `offerFlightFrames` (10) later. Nothing in reach / empty hands: `offerMiss {reason: none | empty}`, nothing spent
  (she still opens her hands: `offering`).
- **To a creature** (`giftEnemy`): `calm` and `gift` = `giftCalmFrames` 600, then held while she stays near (round 2); `roused` / `stirred` cleared.
  A burrback stops whatever it was doing (brace, ram, winded, curl), lowers and stands `giftStandFrames` 60, then
  walks its round harmless and braces at nothing; a lampwing that is after her gives up (`enemyGiveUp` cause `gift`)
  and goes home, noticing nothing while the calm lasts (a staggered one goes home after its tumble). A cut ends the
  gift's calm at once (and rouses a burrback). If it died before the glint arrived: `giftReturn`, refunded.
- Timing: a burrback's tell is 26 frames; the glint lands 10 after the press, so a press up to ~15 frames into the
  tell stops the ram (the offer pilot does it mid-brace). A ram in flight is stopped too (the gift lands on it).
- **To a dormant lantern / lamp**: `LanternState.given` + 1 (kept for the run); its price (`need` in every event) is
  less by that much. Given its whole price (and it has its key) it catches wherever she is (`lanternKindle {cost: 0,
  away}`). Why: she can lay her light down where it is going and walk on carrying less.
- **To the heart** (asleep or awake, until `gather`): counts in the offering. At `gather`, `offered` = her wallet +
  `heartGiven`, the tier from that; tiers already reached by hand fire in the hold even with nothing in her hands.
- Cost: one glint calms a burrback for 10 s; killing one pays 4. So cutting is richer and makes her more seen;
  giving makes her poorer and less seen. That tension is the loop.

## 3. Rest = give
- A rest at a lit lantern / lamp (45 still frames, hurt) lifts her free up to `health.reformHp` (2), then buys each
  further light for `giving.restCost` (1) glint, as far as her wallet goes. `lanternRest {healed, free, cost,
  wallet, short}`; `short` = not whole (nothing left to give); a visit rests once (out and back for another).
- Coherence with the fade: a fade re-forms her at 2 lights with a third of her wallet dropped; an empty-handed rest
  gives the same 2, so a fade is never a better heal than a rest, and a rest is never worse than a fade. A full heal
  from 2 is 2 glints: generous (the path yields 70-120).

## Pilots (2026-10-14)
- **Ghost** (the grove without glints or pods, holds right, hops a burrback in her way, three hands): spawn to the
  heart in 18.5-21.4 s, 0 hits, 0 pickups, **no `enemyAware` / tell / brace / flinch from any creature**, passing
  burr-path at 0-70 px, burr-shaft 0-84, burr-rise 61-100 on their own ground (box to box).
- **Hoarder** (80 in hand, never stops at a light) vs a handful (8), same road: aware of her from burr-shaft 305 vs
  210 px, burr-rise 307 vs 215, wing-rise's tell 371 vs 250 px (1.45 x). Both meet burr-shaft's ram out of the
  doorway (it braces as she comes out from under the low roof, gap 0).
- **Offer** (the naive tapper / holder; gives each burrback in her way a glint instead of cutting it, no cut beside
  a creature): ends in 39 / 48.5 s, 3 lanterns, **1 hit, 0 fades, no burrback struck or killed**, 6-7 gifts (path
  three + burr-ledge and burr-bank on the ember fetch), 85-86 glints. The masher on the same road: 6-8 hits, 2-3
  fades, ~50-60 s. The careful reader: 60.5 s, 2 hits, 0 fades (unchanged in kind).
- The mashers carry 40-70 (level 4) most of the run: they never spend, so they are seen from far. That is the point.

## Staged tests and light
Every staged fight was written with an empty wallet; creatures would not see her now. `tests/unit/helpers.ts`
`LIGHT` (6 = level 2, the old ranges) and `litSim` / `carrying`: the fight files import `litSim as newSim`. Contact
tests that start empty give her 2 (under 3: a fade drops nothing).

## What render / HUD can read (drawn: giving-render.md)
- Player: `seen`, `seenLevel`, `offering` (frames left of the hold-out pose, from `offerPoseFrames` 16), `offerSeq`,
  `giftTo` / `giftIndex` / `giftTimer` / `giftX, giftY` (the glint in flight).
- Enemy: `aware`, `gift`, `gifts`, `calm`. Lantern: `given`. Goal: `heartGiven`, `ending.gifted`, `ending.calmed`.
- Events: `enemyAware`, `offer`, `offerMiss`, `enemyGift`, `lanternGift`, `lampGift`, `heartGift`, `giftReturn`,
  `enemyGiveUp` cause `gift`, `lanternRest` / `lampRest` `{free, cost, wallet, short}`, `gather {gifted, calmed}`.
- Debug: `__game.giving(wallet?)` (level, reach per kind, the offer target now, the glint in flight, who is aware).

## Known / left
- `homeClear` (safe ground, dark-lamp re-form) still uses a lampwing's base sight: a hoarder (30+) re-forming near
  one may be seen at once. Not met in the pilots.
- The careful pilot does not offer; a careful giver (reads the tell, offers in it) is the next pilot to write.
- "Shiver" (rule 2: give her own warmth when out of glints) is not built.
