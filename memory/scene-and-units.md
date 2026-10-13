# Scene, units, layers, ownership

## Units
- **Sim px** (= "world px") everywhere. The logical view is **1920x1080** (16:9) at zoom 1
  (`VIEW_W/VIEW_H`, `src/render/contract.ts`). One "tile" is **64 px** (`TILE`, `src/scene/index.ts`):
  a layout grid only, the sim has no tiles.
- The player's collision box is **40x80** (`tuning.body`); `(x, y)` is its top-left, integers. The
  drawn character is ~1.3 tiles (ears overhang the box). "Feet" = bottom-centre `(x + w/2, y + h)`:
  events, `teleport` and the scene's `spawn` all use it.
- Velocities are px per sim frame (x60 = px/s); the sim runs at 60Hz. y grows downward.
- **Rendering is at full device resolution**: the canvas fills the window letterboxed to 16:9, backed
  at CSS size x devicePixelRatio, and the stage root is scaled (`src/render/app.ts`). Everything under
  it works in logical units, so draw vectors/meshes and they stay crisp; nothing is upscaled. Shaders
  that need device pixels use `ctx.viewScale()`. Camera and player are interpolated between sim frames.

## The scene: `content/scene/grove.json`
`{id, width: 5760, height: 1600, spawn: {x, y}, ceilingY?: -420, solids: [{tag, x, y, w, h}], oneWays: [{tag, x, y, w}],
pickups: [{id, kind: glint|great, x, y}], pods: [{id, x, y, mount: sit|hang, hp?: 1-3}],
enemies: [{id, kind: burrback, x, y (feet centre), facing: -1|1, radius? (its own range, box centre from its start)} | {id, kind: lampwing, x, y (home: box centre, in open
air), facing, radius?}], lanterns: [{id, x, y (foot, on solid ground), cost?}], heart: {x, y (on solid ground)}}`
(burrbacks first; pickups.md, combat.md, enemies.md, goal.md),
validated by Zod in `src/scene/index.ts` (exports `GROVE`), typed in `src/sim/scene.ts`. Tags are for
artists (`ground | pool | ledge | trunk | floating | root | branch`); the sim ignores them, except that
`pool` is never safe ground to re-form on. The left, right and bottom scene edges are solid; the top
has a soft ceiling at `ceilingY` (the canopy: the top of her box never rises above it; it may be above the scene top). One-ways block only a falling body; Down+Jump
drops through. Nothing is lethal; burrbacks and lampwings hurt (enemies.md).

```
x:  0        1000       2000       3000       4000       5000     5760
 0 ┌──────────────────────────────────────────────────────────────────┐
                                                 ┌┐ trunk B (top 192)
448                               ┌ledge─────┬┐  ││             ┌ledge┤
                           ▬F5    └──────────┤│  ││        ▬F7  └─────┤
608                  ▬F4                     ││  ││
704            ▬F3                 trunk A → ││  ││     ▬F6
832         ▬F2                              ││  ││  ╌branch
960     ▬F1          ╌branch (1024) ┌bluff┐  └┘  └┘ (both end at 1024: walk under)
1088┌bank┐                          │ 960 └terrace┐            ┌──raised ground──┤
1280│    └────ground───┐    ┌───────┘     1152    └─ground┐ ▄root──ground──┘     │
1408│                  └pool┘                             └hollow 1376           │
1600└────────────────────────────────────────────────────────────────────────────┘
```
- Ground tops, west to east: bank 1088 (0-384) | 1280 (384-1536) | pool floor 1408 (1536-1856) | 1280
  (1856-2432) | **bluff 960 (2432-2624)** | terrace 1152 (2624-3200) | 1280 (3200-3744) | **hollow 1376
  (3744-3968)** | 1280 (3968-4608, the root 3968-4160 at 1184 on its west end) | right rise 1088 (4608-5760).
- **The floor is not a corridor** (2026-10-14, after the playtest's 8 s hold-right run): the bluff's west
  face is 320 px, more than a jump (272). Up it: the branch (a jump from the path, then 64 px up and a 128 px
  gap), or a double jump. Its east side is a 192 px step down to the terrace. The hollow is 96 deep (deeper
  than she is tall), 192 up to the root on its east side. Holding right and jumping when blocked now stops
  at the bluff (`scene.test.ts`).
- From the bluff's top: F5 is a jump + double jump straight up-left (432 px, 32 to spare: a short cut to the
  high ledge for a sure hand); a held jump off the **west** lip is "the way home" (glide over burr-path and
  the whole pool to the first lantern: movement-controller.md, `layout-pilot.test.ts`); a held jump off the
  east lip floats over the terrace into trunk A's bark and slides under it.
- Left route up: bank → F1..F5 → high ledge (y 448) → trunk A top → trunk B top (192, the highest point).
- The trunk pair (gap 256 px, x 3328-3584) is the wall-jump shaft: three wall jumps from the ground to 448.
  Six glints zigzag wall to wall up it (at the three kick points and between them), the first at head
  height on the floor.
- Right route up: root → branch → F6 → F7 → far ledge (448).
- Pickups may hang above the scene top, up to 40 px under `ceilingY` (the sky line over the right zone).
- `tests/unit/scene.test.ts` pilots every route; if you move a rect, it tells you what became unreachable.
  Reach numbers are in movement-controller.md.
- Lanterns: 1448, 1280 (moth-stone) / 3684, 192 (trunk B's top) / 5524, 448 (far ledge); the heart: 5212, 1088
  (the shrine). Validated: on a solid top that is not the pool, the whole trigger box supported and clear,
  lanterns 300 px from the spawn, a heart needs lanterns. `tests/unit/goal-pilot.test.ts` plays the whole scene
  from the spawn to the heart: move a rect and it names the leg that broke.

## Layer tree (`src/render/scene/layer-tree.ts`), back to front
| layer | parallax | what |
|---|---|---|
| `sky` | screen space | sky glow; 0..1920 x 0..1080, never moves |
| `far[0..2]` | 0.12, 0.25, 0.42 | far forest silhouettes, `far[0]` farthest |
| `mid` | 0.68 | big trunks, roots, vines, fog sheets |
| `goalLight` | 1 | additive warm light behind the terrain: heart waking, ending (`src/render/goal/`) |
| `playfield` | 1 | terrain, moss, plants, pool: the skin of the collision rects |
| `pickupsBack` | 1 | the buds of great glints, behind the character |
| `goal` | 1 | moth-lanterns and the heart, behind the character (`src/render/goal/`) |
| `enemies` | 1 | the creatures' bodies (`src/render/enemies/`), just behind the character |
| `character` | 1 | the character |
| `pickups` | 1 | glints and the sepals cupping a great one (`src/render/pickups/`), over the character |
| `playfieldFront` | 1 | grass fringe and the pool's surface, over the character (owned by `layers/playfield.ts`) |
| `enemiesFront` | 1 | the creatures' lower legs, dust and debris, over the grass fringe |
| `foreground` | 1.35 | dark blurred leaves and branches |
| `air` | 1 | god rays, motes, fireflies, mist |

Then the post stage wraps the whole tree; the HUD (`src/render/hud/`, the glint count) and the debug
overlay are outside it. World layers are authored
in world px and line up with the playfield when the camera centre is at `layers.anchor` (scene centre
x, the camera's lowest resting y); elsewhere they scroll at `parallax` x camera speed. `layers.visible(name,
cam)` = the on-screen part in layer coordinates; `layers.coverage(name)` = the most the follow camera can
show (draw at least that), which includes the camera's headroom ABOVE the scene top (below). far.ts and mid.ts
build from it and fill it; foreground.ts and air.ts size themselves from the scene and happen to cover it.
Zoom scales every world layer about the view centre.

## Camera (`src/render/camera/`, knobs in `tuning.ts`, tests in `tests/unit/camera.test.ts`)
- `index.ts` is the deterministic follow camera, stepped once per sim frame. Render-side offsets are added on
  top in `stage.ts` and never touch its state: `kick.ts` (a blow), `goal/camera.ts` (heart wake lean, ending
  zoom), `reform.ts` (the re-form pan). `__game.cam().follow` is the follow view without them.
- **Headroom**: the view's top may go to `viewTop(scene)` = `ceilingY - headroom` (120), i.e. y -540 for the
  grove's ceiling of -420 (view centre y 0). On the summit (feet 192) she stands at 68% of the view height;
  at the very top of a double jump her box is 120 px under the top edge. The same function feeds
  `layers.coverage`, so moving `ceilingY` moves both. Nothing but background, foreground and air is up there.
- The vertical spring rests at the clamp (`place`), so the view answers at once when she drops from the top.
- **Vertical rules**, in order: a real fall (`vy > fallFollowVy` AND feet `fallBelow` under the resting line:
  coming down from a jump is not one, it used to dip the view at every landing) leads below; wall slide or
  feet outside the window retarget; a landing retargets only outside the landing band (`landUp` 136 above /
  `landDown` 64 below the line) or after `settleFrames` on the ground, so hops between islands of about the
  same height do not bob the view (before the headroom the top clamp hid all of this on the high routes).
- **Glide**: look-ahead grows by `glide.extraX` (she ends ~200 px behind the view centre in travel direction)
  and the target leads `lookDown` below her feet, downward only. Measured: the spring's lag eats ~90 px of
  it at her sink rate, so 240 gives ~150 on screen. The look-down runs out with the glide share after
  landing, which keeps a chain of glides on one line.
- **Standing at a lantern / the heart** (`rest`): after 24 still frames within 260 x 150 px the view goes half
  way toward it (max 130) and 56 up. A wider reach (420) pulled the view off the spawn toward the moth-stone.
- **Fade / re-form** (`reform.ts`, `dip.ts`): the follow camera holds while `faded > 0`; on `reform` the
  follow state snaps as before and `ReformShot` adds (old view - new view) as an offset eased to zero in
  0.6-0.9 s (smootherstep), at most `panCap` 2400 px (further = the rest is cut under a full dip). The dark
  dip (a soft vignette sprite over the post-processed picture, under the HUD) comes on in the last 0.3 s of
  the fade and lifts by the end of the pan. Under 200 px: a 0.45 s ease, no dip. `load()` / R (a new state
  object) = cut + dip lifting over 0.5 s; a teleport clears pan and dip so captures are never darkened.

## Who owns what
| path | owner |
|---|---|
| `src/render/scene/layers/<layer>.ts` (+ `scene/lib/` for shared helpers) | environment, one agent per file |
| `src/render/character/` | character (replace the placeholder wholesale; keep the class name, constructor and `update`) |
| `src/render/post/` | post (keep `PostStage`'s constructor, `update`, `resize`) |
| `src/render/contract.ts`, `stage.ts`, `lights.ts`, `app.ts`, `camera/`, `scene/index.ts`, `scene/layer-tree.ts` | orchestrator: ask before changing |
| `src/sim/`, `content/scene/` | orchestrator |

Interfaces are documented at the top of `scene/index.ts`, `character/index.ts`, `post/index.ts`,
`lights.ts` and `contract.ts`. The driver order per render frame is in `stage.ts`.

## Shots and clips
- `npm run shots` (dev server on 5180, or `--url`): `shots/wide-*.png` (1920x1080 at 9 camera stops; 8 = the bluff, 9 = the hollow),
  `shots/closeup-*.png` (character at 4x in 12 situations) and `shots/closeup-strip.png`. `--only=wide|closeup`,
  `--out=dir`, `--ambient=N` (render frames to run before shooting), `--hitboxes`, `--no-gpu`. ~1.5 s.
  Deterministic: same code, same pictures. Parallel agents: use different `--out` dirs.
- Both tools open the game with `?nopickups` (no glints, no counter: a clean plate; so does `look:stats`).
  Pass `--pickups` to see them. `tools/lib/browser.ts` `openGame(..., pickups)`.
- `npm run clip -- --script "R40 R+J22 R30 .30" --name x` → `clips/x.mp4` + `.gif`, one picture per sim
  step. `--zoom 2` (centred on the character) or `--wide`; `--at x,y`; `--ambient N` for the scene
  animating with the sim frozen. Needs ffmpeg.
- Both launch headless Chromium on the real GPU (`--use-angle=metal` on macOS); both read the stops and
  situations from the top of `tools/shots.ts`, so add a stop there when the scene gains a landmark.
