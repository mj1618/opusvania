# Memory index

Shared project knowledge. One topic per file, one line per file here: `- [Title](file.md) — hook`.
Keep entries current; delete stale ones.

<!-- entries below -->
- [Scene and units](scene-and-units.md) — units, view size, scene format and layout (**the lanterns are the critical path: trunk B on the floor, the stair east, the far bluff, the bark of trunk A**), layer tree, who owns which directory, shots and clips
- [Debug API](debug-api.md) — `window.__game`: step/tick/freeze time model, input DSL, teleport, camera override, URL params
- [Sim architecture](sim-architecture.md) — how sim, Game harness, loop and render driver fit together; player state for animators; **sim event list**
- [Movement controller](movement-controller.md) — order of ops, rounding, feature notes, jump/dash reach numbers; **wall kicks rise in full on a tap (one wall is enough to climb)**, what a hard landing is
- [Pixi gotchas](pixi-gotchas.md) — Pixi v8 filter, resolution, GLSL and headless-GPU traps
- [Loop timing](loop-timing.md) — why the fixed-step loop snaps near-60Hz frame times
- [Toolchain](toolchain.md) — ports, vite preview base gotcha, TS7/Biome quirks, why each dev dep exists
- [Background layers](background-layers.md) — sky/far/mid pipeline (compose → bake → atmosphere shader → LayerView with fog + rustle), composition map, config knobs, gotchas
- [Playfield](playfield.md) — baked lit terrain (albedo + relief), the island family per zone, `paintRock` / `limb()` painters, plant meshes and bend field, pool; knobs, bake gotchas, shapes that failed
- [Post, air and foreground](post-and-air.md) — post pipeline and its knobs, light mask, shafts/motes/mist, foreground bake, GLSL and filter gotchas, how to time the GPU
- [Character](character.md) — Ember's design and rejected looks, 2.5D rig, pose blending, foot planting, chains, the one-mesh painter, gotchas
- [Character: Yako](character-yako.md) — the dark fox skin: forward-frame rig + base matrix, cel painter, squash-through turn, 240 px lope, chain stiffness gotcha
- [Character skin: Vesper](character-vesper.md) — the hero: look rules (dark, flat, soft pale face), the bounding run (288 px cycle, streaming cape, what was rejected), standing pose, air, somersault, glide, slash, hurt, acting at the lanterns / heart / ending (and the `link.ts` hand-off with the goal renderer), capture and silhouette method
- [Character skin: Nova](character-nova.md) — star-runner acrobat skin: somersault as whole-rig rotation on a spring, hand/foot follow-through springs, relative-speed light trails, shots/clip URL workaround
- [Character skin: Wick](character-wick.md) — lantern-bearer skin: mirrored 2.5D rig, glaive on a screen-space angular spring, lantern pendulum, somersault double jump, cloth tricks, gotchas
- [Reference study](reference-study.md) — measured table of our stops vs Ori/HK Steam frames (key, near-black, hero size and contrast, hue commitment) and the principles to hold the look to; resize gotcha
- [Combat](combat.md) — thorn slash (three-step combo table, lunge, air hang, hitstop, recoil, pogo), lumen pods (toughness, payout, placement list), what render reads
- [Pickups: glints](pickups.md) — collectible rule and timing (wake/flight/stagger/combo), events, one-mesh renderer, bud holder, pods, enemy glints, the HUD cluster (health lanterns + count), placement list, look decisions and gotchas
- [Enemies, render side](enemies-render.md) — how the burrback and the lampwing (a ghost-moth) are drawn and wired, cost per creature, closed-loop staging and capture method, death timelines, look decisions and rejected looks
- [The goal: lanterns and the heart](goal.md) — the scene's objective: kindling rules (cost, channel, refuse, **pledge**), the wallet, rest and re-form points (**a re-form is not a rest**), calming, the heart and the ending hold, positions and why, economy audit, the full-run and the **naive pilots**, exactly what render gets; `lanternNotice`, the pod at the first lantern, four wayside lamps, pods on the critical path
- [The goal, render side](goal-render.md) — how lanterns, heart, wake, ending, HUD pips / drain / summary are drawn and wired; ember-moth guides and their route waypoints, the crook that turns its glass away, cold lamps, hold / tap key prompts, the fade's sting; look decisions, what is weak, capture recipe
- [Enemies and health](enemies.md) — the enemy framework (one module per kind), the burrback (patrol, flinch, hits, death), the lampwing (flyer: hover, notice, pursue, give up, pogo chain; not drawn yet), placement of both, contact damage, knockback and i-frames, fade / re-form and last safe ground, what render reads
- [Playtests 2026-10-14](playtest.md) — three start-to-finish reviews as a player. Playtest 3 (the brief for the critical-path round): naive players dead-end at a sleeping heart, burr-root, the missed first kindle, a fade without a sting, idle glints; **and what the sim / layout round after it changed, with what to replay**; method notes (frozen build, real keys)
