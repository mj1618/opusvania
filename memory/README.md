# Memory index

Shared project knowledge. One topic per file, one line per file here: `- [Title](file.md) — hook`.
Keep entries current; delete stale ones.

<!-- entries below -->
- [Scene and units](scene-and-units.md) — units, view size, scene format and layout, layer tree, who owns which directory, shots and clips
- [Debug API](debug-api.md) — `window.__game`: step/tick/freeze time model, input DSL, teleport, camera override, URL params
- [Sim architecture](sim-architecture.md) — how sim, Game harness, loop and render driver fit together; player state for animators; **sim event list**
- [Movement controller](movement-controller.md) — order of ops, rounding, feature notes, jump/dash reach numbers
- [Pixi gotchas](pixi-gotchas.md) — Pixi v8 filter, resolution, GLSL and headless-GPU traps
- [Loop timing](loop-timing.md) — why the fixed-step loop snaps near-60Hz frame times
- [Toolchain](toolchain.md) — ports, vite preview base gotcha, TS7/Biome quirks, why each dev dep exists
- [Background layers](background-layers.md) — sky/far/mid pipeline (compose → bake → atmosphere shader → LayerView with fog + rustle), composition map, config knobs, gotchas
- [Playfield](playfield.md) — baked lit terrain (albedo + relief), the island family per zone, `paintRock` / `limb()` painters, plant meshes and bend field, pool; knobs, bake gotchas, shapes that failed
- [Post, air and foreground](post-and-air.md) — post pipeline and its knobs, light mask, shafts/motes/mist, foreground bake, GLSL and filter gotchas, how to time the GPU
- [Character](character.md) — Ember's design and rejected looks, 2.5D rig, pose blending, foot planting, chains, the one-mesh painter, gotchas
- [Character: Yako](character-yako.md) — the dark fox skin: forward-frame rig + base matrix, cel painter, squash-through turn, 240 px lope, chain stiffness gotcha
- [Character skin: Vesper](character-vesper.md) — the hero: look rules (dark, flat, soft pale face), the bounding run (288 px cycle, streaming cape, what was rejected), standing pose, air, somersault, glide, slash, hurt, capture and silhouette method
- [Character skin: Nova](character-nova.md) — star-runner acrobat skin: somersault as whole-rig rotation on a spring, hand/foot follow-through springs, relative-speed light trails, shots/clip URL workaround
- [Character skin: Wick](character-wick.md) — lantern-bearer skin: mirrored 2.5D rig, glaive on a screen-space angular spring, lantern pendulum, somersault double jump, cloth tricks, gotchas
- [Reference study](reference-study.md) — measured table of our stops vs Ori/HK Steam frames (key, near-black, hero size and contrast, hue commitment) and the principles to hold the look to; resize gotcha
- [Combat](combat.md) — thorn slash (three-step combo table, lunge, air hang, hitstop, recoil, pogo), lumen pods (toughness, payout, placement list), what render reads
- [Pickups: glints](pickups.md) — collectible rule and timing (wake/flight/stagger/combo), events, one-mesh renderer, bud holder, pods, enemy glints, the HUD cluster (health lanterns + count), placement list, look decisions and gotchas
- [Enemies, render side](enemies-render.md) — how the burrback and the lampwing (a ghost-moth) are drawn and wired, cost per creature, closed-loop staging and capture method, death timelines, look decisions and rejected looks
- [The goal: lanterns and the heart](goal.md) — the scene's objective: kindling rules (cost, channel, refuse), the wallet, rest and re-form points, calming, the heart and the ending hold, positions and why, economy audit, the full-run pilot, exactly what render gets
- [The goal, render side](goal-render.md) — how lanterns, heart, wake, ending, HUD pips / drain / summary are drawn and wired; look decisions, what is weak, capture recipe
- [Enemies and health](enemies.md) — the enemy framework (one module per kind), the burrback (patrol, flinch, hits, death), the lampwing (flyer: hover, notice, pursue, give up, pogo chain; not drawn yet), placement of both, contact damage, knockback and i-frames, fade / re-form and last safe ground, what render reads
