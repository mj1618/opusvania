# Combat bots and the combat report

`npm run combat:report [-- --seeds 50 --fuzz 500 --no-write]` → docs/reports/L4-combat.md and
progress/combat/L4-combat.json (~4 min at 50 seeds). `npm run fight -- --room X --fighter Y --seeds 1-5
[--save tests/replays/X.Y.sN.json]` runs/saves single fights. Code: tools/combat/{fighter,run,report,cli}.ts.

- **One parameterised fighter** (competent, signature, jabOnly, sloppy, reactor). World seen
  `delay` steps late, own body current. Evasion forks the delayed snapshot, **then steps the fork
  `delay` frames with Kid held in place so its clock matches hers** (without that the fork thought
  she had 15 extra frames and F1 read 62–94% on the gavel/dive; with it 100%), forbids new attack
  starts in the fork (no precognition), and tries 9 macros for 45 f. Her *intended* input is the
  baseline: a move for 3 f (checking "idle" instead made her walk into bodies and off ledges into
  the boss's waves), an action press for 1 f then idle (holding the press's facing direction for
  3 f walked her into the rising boss, so she never dared Seize his Count). She also knows her
  own effects at once (a Catch/stagger/knockdown she caused replaces the stale enemy).
- Offense is geometry (strike boxes vs extrapolated hurtboxes), not search. jabOnly may Seize the
  boss on his final Count (the only win condition).
- TTK counts from engagement (first telegraph/hit/hurt/Seize), not the room load.
- Results are **sensitive to bot details** (e.g. the intent check moved the Pit ratio 0.50 → 0.92);
  treat F3/F4 as "this bot" numbers. Change the game with the spec's levers (HP, rattled frames,
  return multiplier, brown damage), not the bot, to move them, and write down every bot change.
- F2 (escape search) is separate: forced telegraph, 15 idle frames, DFS over 8 macros × 10 f.
- The boss F1 runs alternate phase 2 with a sound in the bag (Selling Your Bag only happens then).
- Contact damage (bodies) was the main source of damage for every bot in the Pit, not attacks.
- Old L3 Pit policies (tools/bot/policies) and `npm run l3:verdict` are historical: the Pit changed.
- Final 50-seed numbers (docs/reports/L4-combat.md): 13/16; misses F3 Gull 217 f, F4 fodder
  ratios 0.88-1.00 (Grinder 0.53 is the only one in band), F8 158 f. jabOnly wins 50/50 everywhere.
