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
- [Playfield](playfield.md) — baked lit terrain (albedo + relief), plant meshes and bend field, pool; config knobs, the front-of-character container, bake gotchas
- [Post, air and foreground](post-and-air.md) — post pipeline and its knobs, light mask, shafts/motes/mist, foreground bake, GLSL and filter gotchas, how to time the GPU
- [Character](character.md) — Ember's design and rejected looks, 2.5D rig, pose blending, foot planting, chains, the one-mesh painter, gotchas
- [Character: Yako](character-yako.md) — the dark fox skin: forward-frame rig + base matrix, cel painter, squash-through turn, 240 px lope, chain stiffness gotcha
- [Character skin: Vesper](character-vesper.md) — moth skin: owl-disc face and no-scarf decisions, lope run (256 px cycle), wing strand states and beat, wing/drag gotchas, shots URL workaround
- [Character skin: Nova](character-nova.md) — star-runner acrobat skin: somersault as whole-rig rotation on a spring, hand/foot follow-through springs, relative-speed light trails, shots/clip URL workaround
- [Character skin: Wick](character-wick.md) — lantern-bearer skin: mirrored 2.5D rig, glaive on a screen-space angular spring, lantern pendulum, somersault double jump, cloth tricks, gotchas
