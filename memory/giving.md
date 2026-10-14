# Giving: the game plays like giving (seen, offer, rest = give)

Why: the analysis (docs/story/uniqueness.md "The biggest lever", locked.md "Distinctness guardrails") found the
story distinct but the PLAY Hollow Knight's grammar. The fix: carrying light makes you seen, empty-handed you slip
through, Offer calms what you would cut, healing is paid by giving. Story rules it follows (current/mouthless.md
section 2): "Give warmth, don't fight", "Moths go unseen... once she warms one of them, it knows her", "Lampwings see
light... any light a moth carries". The slash and the pogo stay; no new creatures.

Sim: `src/sim/seen.ts` (levels), `src/sim/giving.ts` (the offer), `enemies.ts` (`giftEnemy`, awareness, contact),
`enemies/burrback.ts` / `lampwing.ts` (`sees`, `gift`), `goal.ts` (rest = give, `LanternState.given`,
`heartGiven`). Numbers: `tuning.giving` (+ `burrback.noticePx`). State version 20.
Tests: `tests/unit/giving.test.ts` (rules), `naive-pilot.test.ts` "giving" (ghost, hoarder, offer pilots).

## 1. Seen: the light she carries
- `seenLevel(count)`: 0 with an empty wallet; 1 from `seen1` (1), 2 from `seen2` (6), 3 from `seen3` (15),
  4 from `seen4` (30). Each level scales the creatures' own notice ranges by `scale1..4` = 0.75 / 1 / 1.2 / 1.45.
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
- **To a creature** (`giftEnemy`): `calm` and `gift` = `giftCalmFrames` 600 (10 s); `roused` / `stirred` cleared.
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
