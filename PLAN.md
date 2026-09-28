# Opusvania: Master Plan

A browser metroidvania built almost entirely by AI agents, including code, art, animation and audio. The target is the feel and atmosphere of Hollow Knight and Ori.

This document covers the vision, the research behind our decisions, the technical plan, the asset pipeline, how agents will work, and a phased roadmap with exit criteria for each phase. It is a living document: when we change a decision, we update the doc and record the reason.

---

## 0. TL;DR

- **Stack (decided; see §4.0).** TypeScript (strict), Vite, and PixiJS v8 with WebGL2 as the default renderer. WebGPU is optional.
  - Physics is our own integer AABB tile physics, in the style of Celeste.
  - Levels are built in LDtk.
  - Audio uses the Web Audio API directly.
  - Testing uses Vitest and Playwright.
- **The core architectural rule: simulation and rendering are separate.**
  - The game simulation is deterministic, uses a fixed timestep and runs headless in Node.
  - This is what lets AI agents test game feel, combat and level reachability without looking at the screen.
- **Art strategy: play to AI's strengths and design around its weaknesses.**
  - AI does well at painted backgrounds, lighting, particles and shaders.
  - AI does poorly at consistent frame-by-frame character animation.
  - So characters are rigged cutouts animated in code, mostly silhouettes with glowing accents. Atmosphere comes from layered parallax, 2D lighting and particles.
- **Order of work: feel first.**
  1. Greybox movement until it feels as good as Celeste or Hollow Knight.
  2. Then combat.
  3. Then world structure.
  4. Then an art-direction spike.
  5. Then one polished vertical-slice biome.
  6. Only then, scale out.
- **The human's role.** The user is the creative director and the playtester. Agents build, test and propose. The human approves art direction, tunes feel, and says whether something is good.

---

## 1. What "Hollow Knight / Ori quality" actually means

"High quality" is too vague to build toward, so we break it into pillars. Each pillar has a concrete, checkable bar.

| Pillar | What the reference games do | Our bar |
|---|---|---|
| **Movement feel** | Celeste-style assists (coyote time, jump buffer, apex hang, corner correction). Hollow Knight uses no-acceleration Mega Man X-style control. Ori tuned in greybox for months. | Every Celeste assist is implemented and tunable. Input-to-response time is under 100ms. The human says it "feels great" in blind comparison. |
| **Combat feel** | Hitstop, knockback on both sides, white flash, directional shake, sparks, a heavy sound effect, readable wind-up telegraphs, 1.3s of invincibility after a hit. | Every hit triggers the full feedback stack. Every enemy attack has a telegraph of at least 250ms and a clear counter. |
| **World design** | A world designed first, then progression layered on top. Ability gates, shortcuts, optional sequence breaks, map and bench systems, areas that change on revisit. | Every lock and key is checked automatically by a graph solver. The world has no softlocks and every area is reachable. At least one intended sequence break exists. |
| **Atmosphere** | A distinct palette per area, 3 to 5 parallax layers, foreground occluders, blurred and desaturated distant layers, a glowing readable hero, dense particles. | Every room has at least a background, a mid layer, the playfield and a foreground layer. Area palettes are locked in the art bible. Lighting is active in every room. |
| **Audio** | Each area has its own lead instrument. Music has full and sparse layers. Leitmotifs. Music changes are triggered by place or story, not by combat. | Every area has two layers of adaptive music, full spatial sound effects and a looping ambience bed. |
| **Polish** | No jank: seamless room transitions, stable 60fps, readable UI, forgiving checkpoints. | 60fps on a mid-range 2020 laptop. Room transitions under 300ms. No visible pop-in. |
| **Cohesion** | Every asset looks like it belongs in the same world. | A style bible and a LoRA or reference set, plus an automated palette and value check on every asset. |

**What will limit quality:** the code will not be the ceiling. Art consistency and character animation will be. Most of the art strategy exists to route around that.

---

## 2. Game concept

**Current direction (L1, provisional): *Tallage*.** Pitched as DISTRAINT, but that name belongs to a 2015 game. "Opusvania" stays as the project codename.

It was chosen from 12 concepts generated with randomised seeds (random Wikipedia articles, dictionary words, forced lenses, trope bans; see `tools/ideation/seeds.mjs`, `docs/concepts/`). Two independent critics on different models both ranked it first.

- **Premise.** In the feverish boomtown of Tallage, a thing's sound is its title deed. Kid Tallow, a disgraced featherweight turned bailiff, works her way up the chain of creditors to redistrain her own championship belt.
- **Signature verbs.**
  - **Seize**: a jab-grab that strips a sound from an object or enemy and un-makes what it held up.
  - **Levy**: throw a carried sound. Its noise colour decides what it becomes: brown is heavy, pink is springy, violet is light and fast. White static can't be seized.
  - **Weigh-in**: bag weight sets your weight class, and your weight class changes your moveset.
- **Why it fits our pillars.** The signature verb *is* a hit, so it gets the full combat-feel stack. Noise colours are procedural Web Audio, and ghosted and humming outlines are code-drawn, so it suits our no-art constraint.
- **Main risk.** It could slow into pick-up-and-place puzzling. The L3 greybox experiment has kill criteria for this (`docs/concepts/critique-L1-A.md` §2).
- **Fallbacks, in order:** THE DISSOLUTION ROLLS, ONSETTER, UREDO. The ideas bank is `docs/ideas.md`.
- **Superseded:** *The Unfinished Opus*, a music-themed default idea. Dropped for being too close to what models produce by default.

## 3. Research summary

The full research is condensed here, with source links in the appendix.

### 3.1 Movement reference numbers

These are Celeste's values from its released `Player.cs`, at 8px tiles, 60fps and in px/s.

| Parameter | Value |
|---|---|
| Gravity | 900 |
| Max fall speed / fast-fall speed | 160 / 240 |
| Max run speed | 90 |
| Run acceleration / deceleration | 1000 / 400 |
| Air control multiplier | 0.65 |
| Jump speed | −105 |
| Variable jump hold time | 0.2s |
| Coyote time | 0.1s |
| Jump buffer | ~0.08s |
| Apex hang | gravity ×0.5 while holding jump and \|vy\| < 40 |
| Corner correction | 4px |
| Wall jump grace distance | 3px |
| Forced horizontal speed after wall jump | 0.16s at 130 |
| Dash | 240 for 0.15s, then 160; 0.2s cooldown; ~3-frame freeze on start |

**Hollow Knight differs from Celeste.** It has no acceleration and full air control. It also has 1.3s of invincibility and 0.2s of recoil after taking a hit, knockback on both sides for every nail hit, and a pogo on down-slash.

**Hitstop.** Use about 4 to 5 frames (60 to 80ms) for normal hits and about 10 frames for heavy hits. Freeze both the attacker and the target, keep buffering input during the freeze, and shake the sprite.

**Designing a jump by its shape (Kyle Pittman, GDC 2016).** Choose the jump height *h*, horizontal speed *vx* and horizontal distance to the apex *xh*, then derive:
- Initial velocity: v₀ = 2h·vx/xh
- Gravity: g = −2h·vx²/xh²

Use higher gravity after the apex or when jump is released. Integrate with velocity Verlet.

**Our starting point.** Our tiles are 64px at a 1080p reference resolution, so Celeste's distances scale by ×8. We start from those scaled values and then tune by feel. Every constant lives in a single `tuning.ts` that can be edited live from an in-game panel.

### 3.2 Camera

Based on Itay Keren's "Scroll Back":
- The camera is bounded to each room, so no space beyond the room is shown until the player arrives.
- Horizontally it looks ahead in the facing direction (dual forward focus) and smooths with lerp.
- Vertically it moves only when the player lands on a platform (platform snapping), except when falling fast.
- The player can hold up or down for a short look.
- Camera zones and attractors lock the view for boss arenas and frame reveals.

### 3.3 Combat and economy

Hollow Knight uses 5 to 9 masks. Soul fills at 11 per hit up to 99, and healing costs 33. Spells draw from the same pool, which forces a real choice.

Rules for bosses:
- 3 to 5 moves, each with a clear telegraph.
- A phase change at around 50% health.
- A punish window after big attacks.
- A Rest nearby, so a retry is quick.

Keep the critical path light on bosses and put most of them in optional content. That is what Silksong does.

Dead Cells' lesson: design for how players will actually optimize, not how you hope they will play.

### 3.4 World design

- **World first, progression second.** Team Cherry did not work from formulas.
- **Pacing follows Mark Brown's analysis of Silksong:** start with a linear U-bend opening, then open up the middle, then mix the two.
- **A movement unlock should open locks all over the map**, not just one door.
- **The map is a design system in its own right:**
  - You buy a partial map for each area.
  - The map only updates when you rest.
  - Unexplored exits are always shown.
- **Revisited areas should change.** Hollow Knight's Forgotten Crossroads becoming the Infected Crossroads is the model.

### 3.5 Scope reality check

| Game | Team | Time | Content |
|---|---|---|---|
| Hollow Knight | 3–4 | ~3.5 years | ~15 areas, ~47 bosses (with DLC), ~7 traversal abilities |
| Silksong | 4 + contractors | ~7 years | 12 main areas, 43+ bosses |
| Ori: Blind Forest | ~20 | ~4 years | — |
| Celeste | 5–7 core | ~2 years (after the jam) | — |
| Dead Cells | small co-op | ~2.5 years | — |

AI speeds up code a great deal and art generation somewhat. It does not speed up *taste*, iteration on feel, or cohesion. **We aim for a small game made to Hollow Knight's quality bar, not Hollow Knight's size.**

### 3.6 Tech landscape (late 2026)

- **PixiJS v8 (8.20.x) is the renderer.**
  - It only renders, so we keep control of the loop, physics and camera.
  - It supports WebGL2 and WebGPU.
  - It has an official set of AI-agent skills (`npx skills add https://github.com/pixijs/pixijs-skills`).
- **WebGPU is not supported in every browser.** It still isn't available in Firefox on Linux and Android, or on Intel Macs, so WebGL2 must be our default path. Custom filters need GLSL for WebGL and WGSL for WebGPU, so we write shaders in GLSL first.
- **Phaser 4 was the runner-up** and has a good new renderer. We rejected it because it is WebGL only and its built-in physics is not precise enough.
- **Godot, Unity and Defold web exports** are larger and slower to load, and harder for an agent to inspect.
- **Rapier (WASM)** is only for optional decorative physics such as chains and debris. It is never used for the player.
- **LDtk 1.5.3** has GridVania world layouts, entity references for doors, IntGrid collision, auto-layer rules, and an option to save each level to its own file for streaming. Its JSON is easy for agents to generate and validate. Its development is slow, but it is stable.
- **Spine 4.3** has a strong Pixi v8 runtime, but it needs a paid license. We defer it and start with our own lightweight rig system.
- **Lighting uses a light-map pass.**
  - Render the scene and the lights into separate buffers, multiply them together, and optionally apply normal maps.
  - `pixijs-light2d` does this; we'll vet it and fork it if needed.
  - For bloom, god rays and glow we use `pixi-filters`.
  - For particles we use v8's `ParticleContainer`.
- **Audio.**
  - Web Audio directly, with music stems scheduled against the AudioContext clock and switches landing on bar boundaries.
  - GainNode crossfades between layers, and low-pass filters for underwater and pause.
  - Files are Opus with an AAC fallback for Safari.
  - Audio is unlocked on the first user gesture.
- **Assets.**
  - Textures are KTX2/Basis: UASTC for hero art, ETC1S for backgrounds.
  - AssetPack builds the bundles.
  - Each room streams in with its atlas, and neighbouring rooms are prefetched.
  - Budgets: first load under 15MB (brotli), and resident GPU memory under about 500MB, because iOS Safari kills tabs at roughly 1 to 1.5GB.

### 3.7 AI asset tools (late 2026)

Everything in the pipeline must be callable from scripts through an API. Midjourney and Suno are excluded because they have no usable API or their terms of service forbid automation.

| Need | Primary | Backup |
|---|---|---|
| Style-locked 2D art | **Scenario.gg** (REST API, custom LoRA from 20–50 approved images) | **FLUX.2** multi-reference via fal or Replicate; **Gemini "Nano Banana" Pro** (up to 14 reference images, strong at editing) |
| Transparent sprites | gpt-image-2 transparent-background preview (has alpha and halo quirks) | Any model on a chroma background, then **rembg + BiRefNet**, then a 1px alpha erode and colour-spill cleanup |
| Parallax layers | Generate each layer separately with the same style references and a per-layer "fog/value" prompt | **Qwen-Image-Layered** splits an image into RGBA layers |
| Tileable textures | Latent rolling (DiT models) or circular padding (SDXL) | An offset-seam check in code |
| UI and icons | **Recraft** (SVG output, custom style id) | Hand-written SVG from an agent |
| Character animation | **Our code-driven cutout rigs** (see §5.3) | Video-to-sprite for a few hero moves: Kling 3.0 or Veo 3.1 → ffmpeg → matting → packing with locked pivots |
| Music | **ElevenLabs Music** (composition plans, stems, instrumental) | Stable Audio 2.5/3.0 |
| Sound effects and ambience | **ElevenLabs SFX v2** (`loop=true` for ambience) | ZzFX or jsfxr for placeholders, and procedural Web Audio |

**Legal hygiene:**
- Never put real game or artist names in prompts. For example, never write "in the style of Hollow Knight".
- Keep provenance watermarks such as SynthID.
- Use tools trained on licensed data for audio.
- Check commercial terms for each tier.
- Keep a record of human selection and editing for every asset. It improves copyright standing and it's good practice anyway.
- Steam requires a disclosure for AI-generated content that players see or hear.

---

## 4. Technical architecture

### 4.0 Chosen stack (decided 2026-09-28)

| Concern | Choice | Notes / rejected alternatives |
|---|---|---|
| Language / runtime | **TypeScript (strict)** on Node 24 LTS, npm | — |
| Build / dev server | **Vite 8** | — |
| Rendering | **PixiJS v8**, WebGL2 by default | WebGPU is opt-in later. Write shaders in GLSL. Rejected: Phaser 4, Three.js, and Godot/Unity/Defold web exports. |
| Physics | **Custom** deterministic integer-AABB Actor/Solid physics (Celeste model) | No physics engine for gameplay. Rapier may come later for decorative physics only. |
| Levels | **LDtk** (levels saved as separate files) | Rejected: Tiled, a custom editor |
| Content data | JSON/TS data validated with **Zod** | — |
| Animation | **Custom cutout-rig runtime** plus atlas frame animation | Spine 4.3 is a licensed fallback |
| Lighting / FX | Custom light-map pass, **pixi-filters**, v8 `ParticleContainer` | Vet or fork `pixijs-light2d` rather than depend on it blindly |
| Audio | **Web Audio API** with our own thin wrapper | Placeholders use ZzFX. Rejected: Howler, FMOD |
| Asset build | **AssetPack** (atlases, KTX2/Basis) | — |
| Debug / tuning | **Tweakpane** tuning panel, and the `window.__game` debug API | — |
| Unit tests | **Vitest** | — |
| E2E / regression | **Playwright Test** (screenshot diffs, replays) | — |
| Agent browser control | **playwright-cli** | — |
| Lint / format | **Biome** | One fast tool instead of ESLint plus Prettier |
| CI | GitHub Actions | — |

### 4.1 Core principles

1. **Simulation and rendering are separate.**
   - `sim/` is pure TypeScript and does not import Pixi, the DOM or audio.
   - It advances at a fixed 60Hz and is deterministic given its inputs and a seed.
   - `render/` reads the simulation state and interpolates between steps.
   - `audio/` reacts to events the simulation emits.
2. **Everything is data-driven.** Tuning constants, enemy definitions, ability definitions, animation clips, rooms (from LDtk) and the progression graph all live as typed data files that agents can edit and validate.
3. **Everything can be observed.** The game exposes `window.__game` with:
   - `step(n)`, which advances the simulation deterministically
   - `state()`, which returns the state as JSON
   - `input(script)`, which injects input
   - `screenshot()`
   - `load(roomId, spawn)`
   - `seed()`
   
   Agents can inspect anything without guessing from pixels.
4. **Everything can be replayed.** An input log plus a seed reproduces a session exactly. Every bug report becomes a replay, and every replay becomes a regression test.

### 4.2 Proposed layout

```
src/
  sim/            # deterministic game logic (no Pixi/DOM)
    physics/      # integer AABB, Actor/Solid, tile collision, one-ways, slopes (later)
    player/       # state machine, abilities, tuning.ts
    combat/       # hitboxes/hurtboxes, damage, hitstop, knockback, resonance economy
    ai/           # enemy behaviour (state machines / behaviour trees, data-driven)
    world/        # rooms, transitions, save data, map knowledge, progression flags
    events.ts     # typed event bus → render/audio
    input.ts      # action bitmask, edge detection, input buffering (in sim so it replays exactly)
    tuning.ts     # all gameplay numbers (one file for now; split per system when it grows)
    replay.ts     # replay record/playback, rng.ts, hash.ts
  game.ts         # runtime harness: prev/current state, scripted input, recorder, event dispatch (no DOM)
  loop.ts         # fixed-step accumulator
  render/         # Pixi scene graph, camera, parallax, lighting, particles, post-fx
    rig/          # cutout skeletal animation runtime
  audio/          # music director (stems, bar-quantised transitions), SFX, ambience
  ui/             # HUD, map screen, menus, inventory (DOM or Pixi, TBD)
  input/          # keyboard + Gamepad API, buffering, remapping
  debug/          # overlays (hitboxes, state), tweak panel, replay recorder
  main.ts
content/
  world.ldtk      # LDtk project (levels saved to separate files)
  enemies/*.json  abilities/*.json  anims/*.json  audio/*.json
assets/           # generated + approved source assets, with manifest
tools/            # asset pipeline, validators, graph solver, bots
tests/
  unit/           # Vitest, sim-level
  replays/        # recorded input logs + expected outcomes
  e2e/            # Playwright: screenshot diffs, smoke, perf
docs/             # design bible, art bible, audio bible, decisions log
```

*Phase 0 deviations (L1):* `tuning.ts` sits at `src/sim/` rather than `sim/player/` because it also holds world and FX numbers. Input buffering lives in `src/sim/input.ts`, not `src/input/`, because buffered presses must be derived inside the sim to replay deterministically; `src/input/` only maps devices to the action bitmask. `src/game.ts` and `src/loop.ts` were added as the DOM-free harness around the sim.

### 4.3 Key systems and how we make them good

- **Physics.**
  - Follow Maddy Thorson's Actors and Solids model: integer positions, sub-pixel remainders, and movement resolved one pixel at a time.
  - Solids carry or push actors.
  - Supports one-way platforms and hazards.
  - Slopes are optional and come later, because Hollow Knight has almost none.
- **Player controller.**
  - Hierarchical state machine: ground, air, wall, dash, attack, hurt, heal, cutscene.
  - Every Celeste assist is implemented, each behind a toggle for A/B feel comparison, in the spirit of Deepnight's game-feel demo.
- **Combat.**
  - Hitboxes are defined per animation frame.
  - A hit applies hitstop, flash, knockback and shake, and emits events.
  - Enemies are data-driven state machines with explicit telegraph, active and recovery phases.
- **Camera.** Room bounds, look-ahead, platform snapping, camera zones, shake (trauma-based, using Perlin noise), and a small zoom for bosses.
- **Rooms.**
  - LDtk levels with door entities that link to each other.
  - Transitions: fade or slide, keeping momentum. The player spawns at the matching door.
  - Neighbouring rooms are preloaded.
- **Save system.** Versioned JSON saved to localStorage and IndexedDB, with an export/import option. It stores flags, abilities, map knowledge, Rest position and collectibles.
- **Map.** Generated automatically from LDtk room geometry. It tracks what has been explored and only updates at a Rest, and it has markers and pins.
- **Progression validator.**
  - A tool builds a graph of rooms, doors and gates from LDtk, with ability requirements on each edge.
  - It proves everything is reachable, finds softlocks, and lists sequence breaks.
  - Runs in CI.
- **Rendering pipeline for each frame:**
  1. Parallax background layers (blurred and desaturated with depth).
  2. The playfield.
  3. Characters.
  4. The foreground occluder layer.
  5. The light-map composite.
  6. Post-processing: bloom, vignette, colour-grading LUT per area, and fog or god rays where appropriate.
  7. Particles in their own layers.
- **Performance.** Atlases everywhere, batched sprites, and pooled particles. Every frame's timing is logged in a perf HUD, and CI fails if a benchmark room drops below budget.

---

## 5. Art and animation pipeline

### 5.1 Art direction target: "luminous silhouette"

- **Characters.**
  - Near-black or deep-value silhouettes with strong, readable shapes.
  - Emissive accents such as eyes, the lantern core and the weapon edge.
  - Rim lighting from the scene's lights.
- **Environments.**
  - Painted in layers, with a palette locked per biome.
  - The playfield has the most contrast, and value and saturation fall off with depth.
  - Foreground occluders are dark and out of focus.
- **Light is the star.** The hero glows and lights the scene around them, the way Ori does. Particles are the "music made visible": notes, dust, embers and spores.
- **Why this direction.**
  - Silhouettes make cutout rigs look deliberate rather than cheap.
  - They hide small differences between generated assets.
  - They put the visual work into shaders and particles, which agents can build and check directly.

### 5.2 Asset generation pipeline (fully scripted)

```
art bible (docs/art/) → prompt template + style refs/LoRA
  → tools/gen-image.ts (Scenario / FLUX.2 / Nano Banana via API)
  → tools/cutout.ts (rembg+BiRefNet, alpha erode, spill cleanup)
  → tools/validate-asset.ts (palette/value histogram vs biome, halo check on darkest bg,
                              size/pivot/seam checks)
  → contact sheet → HUMAN APPROVE/REJECT (quick review UI)
  → assets/ + manifest.json (prompt, model, seed, refs, approver, status)
  → AssetPack → KTX2 atlases
```

- **Build a style LoRA early.** Once the art-direction spike (Phase 4) yields 20 to 50 images the human likes, train a LoRA on them.
- **One manifest for every asset.** Nothing reaches the game without an entry in the manifest.

### 5.3 Character animation strategy (the hardest problem)

We use three layers of approach, in order of preference.

1. **Code-driven cutout rigs. This is the default.**
   - Generate each body part as its own transparent image from one reference character sheet: head, torso, cloak panels, limbs, weapon.
   - A small bone hierarchy is animated from JSON keyframes, with easing curves.
   - On top of that, procedural layers add squash and stretch, secondary motion (cloak and antenna springs, via verlet chains), look-at, breathing, and aim.
   - Agents can write, tune and screenshot-check all of this without outside tools.
   - Ori's trick applies: author gameplay animations at a higher internal frame rate and scale their speed to match the player's input.
2. **Shader and effect animation.** Hit flash, dissolve, glow pulses, smears or motion trails on attacks, and afterimages on dashes. Most of what makes an attack feel good is here.
3. **Frame-by-frame from video, for a few hero moments only.** Examples are special attacks and boss intros.
   - The steps: approved keyframe → image-to-video with first- and last-frame control → frame extraction → matting → packing with a locked scale and pivot.
   - Automated checks for identity drift and loop seams.

If the cutout rigs hit a quality ceiling, we evaluate Spine 4.3 (licensed) together with AI-assisted rigging.

### 5.4 Audio pipeline

- **Placeholders.** ZzFX or jsfxr for sound effects from day one, so feel work always has sound.
- **Final sound effects.**
  - Generated with the ElevenLabs SFX API from a spec in `content/audio/sfx.json`: prompt, duration, loop, variations.
  - Each sound gets 3 to 5 variations, played with random pitch and volume so repeats don't sound identical.
- **Music.**
  - ElevenLabs Music composition plans for each biome: a full layer, a sparse layer, and a boss variant, all sharing one key and tempo.
  - A music director crossfades layers and switches sections on bar boundaries.
  - Leitmotifs: an Opus theme recurs across biomes, each time played by that biome's lead instrument.
- **Mixing.** Buses for music, sound effects, ambience and UI. Music ducks under big hits. Low-pass filtering for pause, underwater and low health.

---

## 6. How the AI agents work

### 6.1 Repo conventions

- **`CLAUDE.md`** is short: commands, architecture rules (for example, sim never imports render), a definition of done, and a "never do" list.
- **`docs/`** holds:
  - `design-bible.md`, covering pillars, abilities, the world graph and the enemy roster
  - `art-bible/`, with reference images, palettes and prompt templates
  - `audio-bible.md`
  - `decisions.md`, an append-only log of architecture decision records
- **`progress/features.json`** is a structured backlog. Each feature has an id, a spec, acceptance criteria, a status and verification notes.
- **`progress/log.md`** is a running log for each session, so the next agent knows where things stand.

### 6.2 The working loop, one feature per session

This is the inner loop for a single sub-agent. The outer studio loop (orchestrator, review, plan revision) is in `STUDIO.md`.

The loop follows Anthropic's harness for long-running agents.

1. Read `progress/`, pick the next feature, and read its spec.
2. Implement it, with unit tests at the simulation level.
3. Verify end to end. Drive the real game with Playwright through `window.__game`, take screenshots, and assert on the state.
4. Record a replay for the feature, if it applies, and add it to `tests/replays/`.
5. Run the full check, `npm run check`: typecheck, lint, unit tests, replays, the progression validator, the perf benchmark and screenshot diffs.
6. Commit, and update `features.json` and `log.md`.

A feature is not done until it has been checked in the running game. Passing tests alone doesn't count.

### 6.3 Feedback loops for agents

| Question | Tool |
|---|---|
| Does the controller behave correctly? | Unit tests on the simulation: "a jump reaches height h ± 1px", "coyote jump succeeds at frame 5 and fails at frame 7" |
| Did something regress? | Input replays with asserted end state, plus screenshot diffs of canonical rooms (pixelmatch with tolerance) |
| Can the player finish the game? | Graph solver on the LDtk data, plus a scripted bot that routes between Rests using known inputs |
| Is combat fair? | Bot fights: time-to-kill and damage taken for a scripted "competent" and "sloppy" player; every attack has a telegraph |
| Does it look right? | Playwright screenshots given to the agent (it can see them), contact sheets, palette and value histograms |
| Is it fast? | A perf HUD, plus a CI benchmark room that asserts frame time and draw calls |
| Does it *feel* good? | **The human.** The tuning panel, A/B toggles and recorded clips go to the user for judgement. |

### 6.4 Multi-agent use

- Run parallel agents in separate git worktrees on independent areas, for example:
  - the audio director
  - the map UI
  - an enemy
  - the asset pipeline
- Avoid parallel agents on the player controller or core physics. Those need one owner and tight iteration.
- Use a reviewer agent for code review and adversarial "try to break this" testing before each milestone merge.
- Content can be generated in batches, such as enemy variants, room dressing and sound-effect variations. Human review of contact sheets is the gate.

### 6.5 The human's job

- Approve concept, art direction, palettes and music direction. Taste can't be delegated.
- Playtest every milestone, and tune feel through the live tuning panel. Agents write the chosen values back to `tuning.ts`.
- Approve or reject generated assets from contact sheets.
- Break ties on design questions.

---

## 7. Roadmap

Each phase has exit criteria. We do not move on until they are met. The phases are ordered from highest risk and highest leverage to lowest.

### Phase 0: Foundations
- Vite, TypeScript strict, and a PixiJS v8 app. Biome, Vitest and Playwright set up, with CI through GitHub Actions.
- A fixed-timestep loop with interpolation, a seeded RNG, and the typed event bus.
- Input layer: keyboard and gamepad, with buffering and remapping stubbed in.
- Debug layer: `window.__game`, hitbox overlay, Tweakpane tuning panel, replay record and playback.
- `CLAUDE.md`, `docs/` skeleton, `progress/features.json`.
- **Exit criteria:** `npm run check` is green in CI. A Playwright test boots the game, steps 60 frames and reads the state back.

### Phase 1: Movement greybox (the most important phase)
- Integer AABB physics and tile collision. Gym rooms use an ASCII-in-JSON room schema; LDtk moves to Phase 3 (the schema is designed to convert cheaply). Full spec: `docs/design/movement-spec.md`.
- Run, variable jump, all Celeste assists, fast-fall, and wall slide and wall jump. Every constant goes in `tuning.ts` with an A/B toggle.
- Camera: room bounds, look-ahead, platform snapping, look up and down, shake.
- Dash, double jump and pogo, built as ability modules behind flags.
- A greybox "gym" of 10 to 15 rooms that tests every movement tech. Rooms are simple coloured rectangles, but with placeholder squash and stretch, dust particles and jsfxr sounds.
- **Exit criteria:**
  - Objective gates pass: exact frame and pixel tests, the bot proves every gym room completable, and feel metrics fall inside the Celeste–Hollow Knight range. This lets the project move on *provisionally*.
  - The human plays the gym with a gamepad and keyboard and signs off that it feels as good as or better than Hollow Knight or Celeste. This sign-off is queued in the inbox, not waited on.
  - Replays cover every movement tech.
  - Input-to-response time is under 100ms.

### Phase 2: Combat greybox
Per `docs/design/combat-spec.md`, which replaces the Hollow Knight-style nail and soul model with Tallage's own:
- A boxing kit (jab, cross, uppercut, overhand pogo).
- Seize doubles as a telegraph-window catch/parry, and the Count is the finisher.
- The bag of sounds is the only resource (throw it, keep it for weight, or swallow it to heal).
- Ringing is a one-pip rally.
- "Last safe ground" hazard respawn moves here from Phase 3.

The original bullets:
- Hitbox and hurtbox system, a nail-style slash in 4 directions, and pogo on enemies and spikes.
- The full feedback stack: hitstop, flash, knockback, shake, sparks and sound.
- Player health, invincibility frames, and Resonance used for healing and one spell.
- 4 archetype enemies (walker, flyer, charger, ranged) and 1 greybox boss with 2 phases.
- Death and respawn at a Rest, with currency recovered from a "shade" equivalent.
- **Exit criteria:**
  - The human signs off on how combat feels.
  - The bot-fight metrics fall within target ranges.
  - Every telegraph is at least 250ms.

### Phase 3: World structure and tooling
- LDtk integration: multi-room world, doors, transitions, and room streaming with neighbour prefetch.
- Save and load, Rests, the progression-flags system, ability pickups.
- A map screen with explored tracking and a Copyist purchase.
- The progression validator (graph solver) in CI.
- A 25 to 40 room greybox world across 2 biomes. It must include a hub, 3 ability gates, shortcut loops and one intended sequence break.
- **Exit criteria:**
  - The validator is green, meaning no softlocks and everything reachable.
  - The bot can route from start to boss.
  - The human playtests the whole greybox loop, about 30 to 45 minutes, and finds it fun without any art.

### Phase 4: Art direction spike (can run in parallel with Phases 2 and 3)
- Lock the concept and name.
- Moodboard exploration: generate about 100 images across 3 to 4 direction variants. The human picks one.
- Art bible: palettes for each biome, value rules, silhouette rules, prompt templates, and 20 to 50 approved reference images. Then train the style LoRA.
- Build the full asset pipeline in `tools/` and the approval UI.
- The rig runtime, and one fully rigged hero with idle, run, jump, fall, land, slash and dash.
- Lighting and post-processing: light map, bloom, grading LUTs, and a particle system.
- **Exit criteria:** one "beauty room", a single room at final quality with the hero animated, lit and with particles. The human says it would fit in a screenshot next to Hollow Knight or Ori.

### Phase 5: Vertical slice, one polished biome
- Bring biome 1 (about 15 to 20 rooms) to final quality: art, lighting, ambience, two-layer music, final sound effects.
- Final art and animation for 4 enemies, a mini-boss and a boss.
- HUD, map, pause and menus, title screen, settings (remapping, audio, accessibility), and a loading flow.
- Performance pass and a size budget check on low-end hardware and on Safari on iOS and macOS.
- **Exit criteria:**
  - 20 to 30 minutes of play that we would show publicly.
  - An external playtest with 3 to 5 people. We watch without helping, record their sessions, and measure where they get lost or die.

### Phase 6: Production
Scale out using the patterns proven in the slice:
- 4 to 6 biomes
- 6 to 8 abilities
- 8 to 12 bosses (most of them optional)
- 25 to 35 enemy types
- collectibles such as mask shards and charm-equivalents
- NPCs and light lore
- an ending

Each biome goes through the same stages: greybox → validator → playtest → art → audio → polish.

- **Target length:** 5 to 8 hours for a first playthrough.

### Phase 7: Polish and ship
- Accessibility: remapping, an assist mode, colourblind-safe telegraphs, screen-shake toggle.
- Gamepad feel on every major controller. Settings persist.
- A PWA with offline caching, save export, and optionally touch controls.
- Opt-in local telemetry for playtests (deaths, time per room). No third-party crash reporting (Sentry is out, per the user).
- Hosting: a static site on a CDN, with an itch.io build. Steam later, with its AI disclosure.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Character animation falls short of the quality bar | High | High | Silhouette art direction, cutout rigs plus heavy effects, video-to-sprite for hero moves, and Spine as a fallback |
| AI art looks inconsistent or generic | High | High | Art bible, LoRA, multi-reference prompting, automated palette and value validation, and a human approval gate |
| Movement feel is "fine" but not great | Medium | Very high | Phase 1 has no deadline, A/B toggles, reference numbers, human sign-off, and side-by-side comparison with Celeste |
| Scope creep | High | High | Vertical slice first. Every new feature must serve a pillar. Cut rather than go wide. |
| Agents degrade the codebase over time | Medium | High | Strict architectural rules in `CLAUDE.md`, the full check in CI, a reviewer agent, and periodic refactor phases |
| Browser performance or memory, especially iOS Safari | Medium | Medium | Budgets enforced in CI, KTX2, room streaming, and the WebGL2 default path |
| Third-party dependencies are thin (Pixi v8 plugins, LDtk's slow updates) | Medium | Low–Medium | Vendor and fork small plugins. LDtk JSON is simple enough to maintain ourselves. |
| AI tool APIs change or are shut down (Sora's API was shut down on Sep 24 2026) | Medium | Medium | Wrap providers behind `tools/providers/*` so each can be swapped. Keep every approved output. |
| Licensing and copyright questions | Low–Medium | Medium | Licensed-data audio tools, no names of existing works in prompts, provenance manifest, record of human curation |

---

## 9. Questions answered by the user (2026-09-28)

1. **Concept:** the orchestrator decides, but it must be unique. See §2.
2. **API budget:** no real artwork or paid generation APIs for now. Everything else proceeds with code-drawn visuals and procedural audio. Phases 4 and 5 art work is on hold.
3. **Platforms:** desktop browser first (orchestrator default).
4. **Spine:** not needed while there's no artwork.
5. **Distribution:** the repo is public, with builds on GitHub Pages at https://mj1618.github.io/opusvania/.
6. **Playtest cadence:** as often as the user can. Never block on it. See `STUDIO.md` §1b.

## Appendix: sources

**Movement and feel**
- Celeste `Player.cs`: https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs
- Celeste movement tech wiki: https://celeste.ink/wiki/Tech
- Maddy Thorson's game-feel thread: https://threadreaderapp.com/thread/1238338574220546049.html
- Celeste and TowerFall physics: https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5
- Kyle Pittman, "Math for Game Programmers: Building a Better Jump": https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building
- Hitstop: https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
- Deepnight's game-feel demo: https://deepnight.net/games/game-feel/
- Itay Keren, "Scroll Back": https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers

**Design**
- The making of Hollow Knight: https://gameinformer.com/2018/10/15/the-making-of-hollow-knight
- Hollow Knight knockback: https://atomicbobomb.home.blog/2019/02/05/hollow-knight-knockback/
- Mark Brown on Hollow Knight's world design: https://gmtk.substack.com/p/the-world-design-of-hollow-knight
- Dead Cells GDC 2019: https://media.gdcvault.com/gdc2019/presentations/Benard-Sebastian-DeepCells.pdf
- Dead Cells level design: https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/
- Enemy telegraphing: https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing
- Animating Ori (GDC 2015): https://zyzyz.github.io/en/2018/01/GDC2015-Animating-Ori/
- Hollow Knight's art: https://medium.com/3d-environmental-art/the-art-of-hollow-knight-f4c05dda3882
- Ori's 30,000 hand-painted light maps: https://www.thegamer.com/ori-and-the-will-of-the-wisps-artists-hand-painted-30000-light-maps/

**Tech**
- PixiJS releases: https://github.com/pixijs/pixijs/releases
- PixiJS ParticleContainer in v8: https://pixijs.com/blog/particlecontainer-v8
- PixiJS compressed textures: https://pixijs.com/8.x/guides/components/assets/compressed-textures
- WebGPU implementation status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- LDtk releases: https://github.com/deepnight/ldtk/releases
- Spine 4.3: https://en.esotericsoftware.com/blog/Spine-4.3-released
- pixijs-light2d: https://github.com/haiyoucuv/pixijs-light2d
- Rapier character controller: https://rapier.rs/docs/user_guides/javascript/character_controller/
- Vite 8: https://vite.dev/blog/announcing-vite8
- Vitest 4.1: https://vitest.dev/blog/vitest-4-1.html

**AI pipeline**
- Anthropic, effective harnesses for long-running agents: https://anthropic.com/engineering/effective-harnesses-for-long-running-agents
- OpenAI `develop-web-game` skill: https://skills.sh/openai/skills/develop-web-game
- Scenario LoRA training: https://docs.scenario.com/get-started/training/training-models
- Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- FLUX.2 developer guide: https://fal.ai/learn/devs/flux-2-developer-guide
- rembg: https://github.com/danielgatis/rembg
- Qwen-Image-Layered: https://huggingface.co/Qwen/Qwen-Image-Layered
- Pitfalls of the video-to-sprite pipeline: https://dev.to/framesprite/why-the-video-model-is-only-half-of-an-ai-sprite-animation-pipeline-2boc
- ElevenLabs Music composition plans: https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans
- ElevenLabs sound effects: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- US Copyright Office AI report, Part 2: https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf
- Steam's AI disclosure update: https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/

---

## Plan revisions

- **2026-09-28, L1.**
  - Phase 0 is done: harness, `window.__game`, replays, clip tool, CI, and the Pages deploy.
  - The concept is replaced by *Tallage* (§2), chosen through randomised ideation.
  - Movement spec written. Changes it made:
    - LDtk is deferred to Phase 3.
    - Jump values are derived from a target jump shape, not Celeste ×8. Celeste ×8 and Hollow Knight survive as presets.
    - Phase 1 gets objective exit gates, and the human sign-off is queued.
  - Art is on hold per the user. The build order is now: movement greybox (L2), then the Tallage signature-mechanic greybox experiment (L3), then combat.
  - Research note: Hollow Knight's coyote and buffer windows are only about 40 ms, with no corner correction. We default to Celeste's more generous ~100 ms.
- **2026-09-28, L2.**
  - The movement greybox is done and verified objectively: exact tests, bot reachability, feel report inside the reference ranges, and a playtester critique plus fix pass. Human feel sign-off is queued, not waited on.
  - The combat spec replaces nail and soul with a boxing kit and the bag economy (Phase 2).
  - The procedural audio foundation landed early, because sound is the concept's core.
  - Naming: keep **Tallage**.
  - Next: the L3 signature-mechanic experiment, with an atmosphere/lighting foundation in parallel. Code-drawn visuals only, since art is on hold.

