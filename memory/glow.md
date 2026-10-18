# Glow: Lanternroot's light economy (2026-10-18)

The brief is docs/design/levels/proto-1.md §3. Code: `src/sim/light.ts` (+ `light-state.ts`, `light-events.ts`), the
Lamp button's verbs in `src/sim/player/player.ts` `lampVerb`, numbers `tuning.glow`. **Only rooms with `glow: true`
play it** (Lanternroot's four): the wood, the grove and the labs are untouched (their Lamp press is the fling alone).

## The meter
`player.glow` (integer sparks, kept through rooms, not saved: a Continue starts empty). Max `glow.max` 18 (6 pips of
3); the gallery vault's **vessel** (`glowVessel`) makes it 24. `__game.glow(n)` sets it (debug-api.md).

| gain (`glowGain {n, from}`) | sparks | read from the step's own events (`payGlow`, last in the step) |
|---|---|---|
| a blade hit on a creature (`slashHit`, any creature kind, the bosses too) | `hit` 3 | not pods, flames, kit pieces, webs |
| a kill (`slashHit.kill`) | `kill` 3 more | |
| a warm lamp out (`lureSnuff`: a cut, a fling's embers committing, a gust) | `snuff` 6 | not moonwicks or great lamps |
| a glint (`pickup`: a scene glint, a pod's, a dropped cluster's) | `glint` 1 per value | a great glint is 5 |

Spends (`glowSpend {n, for}`): **Mend** `mendCost` 6 for 1 light; **Kindle** `kindleCost` 6 (Bright Kindle: 3).
In a glow room a lamp out heals nothing (`healOnSnuff` is off there): healing is Mend's.

## Mend (HK's focus)
Lamp held with nothing in reach: from `tapFrames` 12 the channel shows (`mendStart`, only if grounded, still, hurt
and holding 6), it lands at `mendFrames` 36 (`mend {hp, glow}`); held on, the next starts over. Any other input, the
air, a hurt, full health or too little glow breaks it (`mendBreak {why}`), nothing spent. `player.mend` = frames in.

## The fade
All her glow drops where she lay (`dropGlow`: a `GlintDrop` with `glow: true`, the same `glintsDrop` event); walking
back into it brings it home as glow (the wallet, `pickups.count`, is not touched). The wallet's 1/3 drop is off in
glow rooms.

## Glints are saved
A scene glint taken in a glow room goes into `save.taken` (`room:id`) and is gone for good (`initTaken` on entry):
completion. Pod and creature glints are not saved (pods regrow: `pods[].regrow`, 1200 frames by default in the
generator, the arena's 600).

## Why these numbers (the brief's)
Three kindles or three mends at most from a full meter: no stockpiling past a fight. A juvenile pays 9 (two cuts and
the kill) = one and a half kindles; a lamp out pays a kindle. The vault's three wicks are exactly a full meter (18).

## Gotchas
- One button, four verbs (`lampVerb`, after `fling`): a burning flame in reach is a fling; a cold moonwick in reach
  is a kindle (refused with too little glow: `kindleRefuse`); else a hold is a mend and a tap a gust. So **a gust is
  impossible within a flame's or a cold bud's reach** (110 px): place gust spots ≥ 110 from any wick (the vault's
  S2 has its gust spot at the shelf's far end).
- The tap's aim is the direction held during the tap or at its release (kept in `lureAimX/Y` while held).
