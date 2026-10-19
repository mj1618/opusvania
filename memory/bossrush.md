# The boss rush demo (2026-10-19)

The design, how to play it and the verdict are in `docs/design/demos/bossrush.md`. Boot it with
`?world=demo-bossrush&fresh`. The rooms come from `tools/levels/bossrush.ts`: edit the generator, not the JSON.

## What was added to the shared framework (it works for any boss)
- `boss.grant {ability?, upgrade?, text}`: `defeat()` adds it to the save and pushes `bossGrant`. When a spec has a
  grant, the final blow also holds her and the boss for `bossRush.finalHold` frames.
- `boss.checkpoint` (a patch id): the lock sets `save.patch` to it, so a fade re-forms her, whole, at the arena door.
  Death to the fight takes about 3 s.
- `boss.hitX/Y/W/H`: a blade box separate from the body. `bossBlade` in `src/sim/index.ts` hurts her with it.
  Clear it every step (`clearHit`) or it hurts after the move has ended.
- **Moonstep** (`upgrade:moonstep`): while `player.mode === 'dash'`, contact and blade hurts are skipped, and
  `bossDodge` fires at most once per `bossRush.dodgeGap` frames.
- `lures[].lit`: a moonwick that burns for good from the start (`initWicks`).
- `boss.rush` (the Gloamweaver alone):
  - the rest after a lunge is open (`rushOpen`, `rushCuts`);
  - lunges come every `rushEvery`;
  - P2 swings ignore silver light;
  - P3 is P1's hunt run faster (`rushP3*`).
- The painted Weaver is in `lantern/creatures.ts` (`weaver()`). The boss HUD for painted rooms is
  `render/bossrush/hud.ts`; greybox rooms keep `greybox/boss.ts`. The hub's door marks are in `render/bossrush/hub.ts`.
- `routeLantern` (audio) gives every room with `region: 'bossrush'` the Gloamweaver's boss sounds.

## Gotchas found
- **Permanent silver light softlocked the Gloamweaver.** After a dazzle it climbed back onto its orb inside a lit
  wick's reach. The hunt never steps into silver and never lunges from it, so it sat there for ever. Now it climbs
  out of the light first (`hunt`).
- **Silver stops a P2 swing early** (it hangs winded where the light begins). With wicks that burn for good, that
  was always at y ~600, out of reach. The rush ignores silver in P2.
- A `Game` built with a `save` starts at the save's patch, or the world's start if it has none. Tests that want a
  boss room set `save.patch` to that room's patch.
- Rooms without `senses: 'lamp'` play the test grove's giving: rings of "being seen" round every creature. The rush
  rooms set `senses: 'lamp'`.
- `boss.id` must differ from every creature id in the room (`the-mantis`, not `mantis`).

## Numbers (bot, `npx tsx tools/playtest/rush-run.ts`)
- The Mantis with a bot that reacts in 18 frames and has the Moonstep: won in about 118 s with no hurts. At 30
  frames, without the Moonstep: won in about 69 s with 2 hurts. At 24 frames the bot lost (cornered against the
  wall by flurries, and hitting the guard's front).
- The Gloamweaver: won in about 42 s with 0–1 hurts. P1 falls after two dazzles.
