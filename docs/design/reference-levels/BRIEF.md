# Reference levels: the brief (2026-10-30)

Matt: "get a complete mapping of the 3 reference games' first level: the exact layout, where everything is hidden, the
skills you have at the start, where all enemies are and their difficulties. Find a way to get this; I'm happy if you go
to extreme lengths like downloading the original games and inspecting their code."

The earlier study (`docs/design/reference-maps/`) measured these games at room-graph level. This one goes to the
ground truth: every collider, every pickup, every enemy, at true scale, in one schema for all three games, so a level
designer (an AI) can lay our level next to theirs and copy proportions, densities and tricks by number.

## The games and their first area
- **Hollow Knight**: King's Pass, Dirtmouth, and the Forgotten Crossroads (all of it, including what needs later
  abilities), up to and including the False Knight and Vengeful Spirit. Greenpath's first rooms only as the exit.
- **Ori and the Blind Forest: Definitive Edition**: the Sunken Glades (from the Spirit Tree / the first save to the
  Wall Jump tree and the way out to the Hollow Grove), plus the prologue's playable stretch if it is in the same space.
- **Nine Sols**: the first explorable zone after the prologue: the Four Seasons Pavilion (the hub) and the Central
  Hall / Apeman Facility (Monitoring) up to the first major boss and the first new skill. Decide the boundary from the
  data and say why.

## Sources, best first
1. **The game files.** Steam installs land under `~/Library/Application Support/Steam/steamapps/common/<Game>/` (Mac
   builds: Hollow Knight, Nine Sols) or `~/Library/Application Support/Steam/steamapps/content/app_387290/depot_387291/`
   (Ori, Windows depot), possibly `/Applications/Steam.app/Contents/MacOS/steamapps/content/...`. All three are Unity.
   A Python venv with UnityPy, Pillow and numpy is at
   `/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/tools/.venv/bin/python`
   (run it with `-I`; keep scripts outside the game folder). Read scenes: GameObjects + Transforms (world positions:
   compose parent transforms), Collider2D / MeshCollider geometry for terrain and hazards, MonoBehaviours for enemies
   (HP, damage, behaviour fields), pickups, breakable/secret walls, benches/saves, doors, levers, NPCs. The scripts'
   field names come from `Managed/Assembly-CSharp.dll` (UnityPy can build type trees from the managed DLLs; or read
   the DLL with `monodis`/`ilspycmd` if installed or installable via `dotnet tool`). Never modify the install.
2. **Data mined by the modding / randomizer communities** (exact for what they cover): randomizer door and item tables
   with coordinates, logic files, map-viewer data, stitched in-game terrain maps, wiki stat tables (enemy HP/damage are
   datamined on the wikis). The earlier study already downloaded many: images and data under
   `/Users/matt/code/worktrees/opusvania/nifty-bhaskara-28e244/shots/reference/maps/<game>/` (read its `sources.txt`),
   and its write-ups in `docs/design/reference-maps/<game>.md`.
3. Walkthrough text and video only to fill gaps (mark these as lower confidence).

If the game files are not there when you start, do everything from (2) and (3) first, then check again before you
finish. Every number says where it came from (`src: files | mined | wiki | estimate`).

## Units
Report native units and **our px**: our view is 1920 x 1080 px, our hero box 40 x 80 px, tile 64 px, run 576 px/s,
jump ~272 px high (`memory/scene-and-units.md`, `memory/movement-controller.md`). Convert the game's units to ours by
**the camera's view width = 1920 px** at its normal gameplay zoom (say how you measured the view), and also report the
hero's box, run speed and jump height in those px, so we can see if the scaling also matches the body and the moves.

## What to produce (only these paths; don't edit anything else, don't commit)
`docs/design/reference-levels/<game>/` where `<game>` is `hollow-knight`, `ori`, `nine-sols`:
- `area.json`, the canonical data, one schema for all three:
  ```
  { game, area, sources: [..], units: { native: "unity units", pxPerUnit, viewNative: [w,h], how },
    hero: { box: [w,h], run, jump, startAbilities: [..], abilityOrder: [{ ability, where, roomId, minuteGuess }] },
    rooms: [{ id, name, rect: [x,y,w,h] (world px, y down), screens, shape: pocket|hall|shaft|setpiece|hub|corridor,
              onCriticalPath, exits: [{ to, side, at: [x,y], oneWay?, gate?: "ability|key|lever|breakable|boss|..." }] }],
    terrain: [{ roomId, kind: solid|oneway|hazard|water|breakable|secretWall|door, poly: [[x,y],..] }],
    things: [{ id, roomId, kind, at: [x,y], value?, hidden?: { how, needs? }, src }],
       // kind: pickup-major (ability, health/energy upgrade, key item, charm, relic, map) | pickup-minor (currency,
       //       small orbs) | breakable | lever | shortcut | save | npc | shop | lore | boss | arena | landmark
    enemies: [{ id, roomId, kind, at: [x,y], hp, contactDamage, attack?, behaviour, patrol?: [x0,x1] | radius,
                respawns?, difficulty: 1-5 with a one-line why, src }],
    criticalPath: [roomId...], firstPlayMinutes: { criticalPath, full100 } }
  ```
  Positions in our px with the world origin at the area's top-left. If a field is unknowable, leave it out and say so.
- `map.png` (and crops if huge) under `shots/reference-levels/<game>/` (gitignored): the area drawn from `area.json`
  only, at one fixed scale for all three games (**1 px = 8 of our px**): solids dark, one-ways a line, hazards red,
  breakable/secret walls dashed, the critical path as a line, things and enemies as labelled glyphs (enemy glyph size
  by difficulty), our hero box and a 1920x1080 view rectangle drawn in a corner for scale. Plus `terrain-native.png`
  if you have real terrain art or collider renders. Look at what you drew and fix it until it is right.
- `README.md` in the docs folder: sources and confidence; what you could and couldn't get; a plain description of the
  area as a player meets it (minute by minute for the first 10 minutes); and **measurements**, every one as a number:
  screens (area of rooms / view area), critical-path screens, rooms by shape, exits per room, dead ends and what each
  holds, loops and their length, enemies per screen (all / on the critical path), enemy kinds and how many of each,
  HP and damage relative to the hero's attack and health, pickups per screen by kind, secrets (count, how each is
  hidden, how far from the critical path), saves/benches and the distance between them, gates seen before opened,
  vertical vs horizontal travel, the longest stretch without a thing or enemy, and how the first new ability changes
  the reachable space. End with the **12 most useful facts for an AI building a first area**, each with its number.

Report back: the paths, what came from the game files vs mined data, the coverage (what is missing), and your 12 facts.
