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
`{id, width: 5760, height: 1600, spawn: {x, y}, ceilingY?: -420, edgeKick?: false (the scene's side edges take no wall slide / kick), solids: [{tag, x, y, w, h, kick?: false (the same for one solid)}], oneWays: [{tag, x, y, w}],
pickups: [{id, kind: glint|great, x, y}], pods: [{id, x, y, mount: sit|hang, hp?: 1-3}],
enemies: [{id, kind: burrback, x, y (feet centre), facing: -1|1, radius? (its own range, box centre from its start)} | {id, kind: lampwing, x, y (home: box centre, in open
air), facing, radius?}], lanterns: [{id, x, y (foot, on solid ground), cost?}], lamps: [the same: wayside lamps, goal.md], heart: {x, y (on solid ground)}}`
(burrbacks first; pickups.md, combat.md, enemies.md, goal.md),
validated by Zod in `src/scene/index.ts` (exports `GROVE`), typed in `src/sim/scene.ts`. Tags are for
artists (`ground | pool | ledge | trunk | floating | root | branch`); the sim ignores them, except that
`pool` is never safe ground to re-form on. The left, right and bottom scene edges are solid (**and, in the grove, not
climbable: `edgeKick: false`, playtest 4**; every real climb face is a plain solid); the top
has a soft ceiling at `ceilingY` (the canopy: the top of her box never rises above it; it may be above the scene top). One-ways block only a falling body; Down+Jump
drops through. Nothing is lethal; burrbacks and lampwings hurt (enemies.md).

```
x:  0        1000       2000       3000       4000       5000     5760
 0 ┌──────────────────────────────────────────────────────────────────┐
                                                 ┌┐╌bough (192, to 3904)
448                               ┌ledge┬╌╌╌┬┐   ││ ╌catch (448)          │
                           ▬F5    └─────┘   ││   ││          ▬F7          │
608                 ▬F4            (branch) ││   ││                       │
704            ▬F3                 trunk A →││   ││← trunk B   ▬F6   ┌far─┤
832         ▬F2                             ││   ││  ╌──branch (912) │bluff
960     ▬F1          ╌branch (1024) ┌bluff┐ ││   ││                  │768 │
1088┌bank┐                          │ 960 └terr.┐└┘ ││         ┌──rise┴────┤
1280│    └────ground───┐    ┌───────┘     1152  └well─shaft┴┘┐ ▄root─ground┘│
1408│                  └pool┘                                └hollow 1376   │
1600└────────────────────────────────────────────────────────────────────────┘
```
(Trunk A ends at 1168: a 112 px doorway under it. Trunk B stands on the floor.)
- Ground tops, west to east: bank 1088 (0-384) | 1280 (384-1536) | pool floor 1408 (1536-1856) | 1280
  (1856-2432) | **bluff 960 (2432-2624)** | terrace 1152 (2624-3072) | 1280 (3072-3744: the well 3072-3200, under
  trunk A, the shaft floor 3328-3584, **trunk B on it 3584-3712**, a 32 px strip) | **hollow 1376
  (3744-3968)** | 1280 (3968-4608, the root 3968-4160 at 1184 on its west end) | right rise 1088 (4608-5472) |
  **far bluff 768 (5472-5760)**: the old far ledge, solid down to the rise; **its top was at 448 until playtest 4** (the
  heart's wake was off the bottom of the picture from the far lantern: goal.md). Collision changed there: the solid is
  `{5472, 768, 288, 832}`; on it `lantern-far` 5524, `great-far` 5600 (y 710), `pod-far` 5690; `far-1..3` now step down
  from F7 to its lip (5290, 540 / 5360, 580 / 5430, 660), `cliff-1/2` at 5432, 980 / 860.
- **The lanterns are the critical path** (playtest 3, 2026-10-14: both naive players ran the floor under the
  shaft to a sleeping heart with 1 of 3). Every wall on it is climbed the same way by anyone: jump at it,
  press again while sliding (a wall kick rises its full 272 px however short the press: movement-controller.md).
  - **Trunk B stands on the floor** (h 1088; it had a doorway). The floor path east ends inside the shaft at
    its bark, with `great-arch` at its foot and `pod-shaft` on the way; back out west is the doorway under trunk
    A. Holding right and pressing jump when blocked climbs trunk B's west face to its top, where `lantern-crown`
    stands (4-5 kicks, 3.2-4.2 s for any hand: taps of 4-6 frames, holds, slow and quick beats); wall to wall is
    3-5 kicks to trunk A's top (`lamp-high`).
  - **East from the summit without wings**: holding right walks summit -> bough (192) -> catch branch (448) ->
    right branch (912, now 4256-4608, flush with the rise's face) -> the right rise at ~4770, 0 hits at 60 start
    times. A tap or a held jump off any of those edges lands on the next one or on the rise, never on
    burr-root's ground (4160-4608). `lamp-glide-1` moved to (4620, 200): at (4470, 270) a held jump off the
    bough's or the catch branch's end fell straight through it (55 of 60).
  - **The far bluff** (5472-5760, top 768, solid to the rise: 320 px of face like the first bluff's, 260 px past the
    heart) carries `lantern-far`. From the heart, hold right and press when blocked: 1-2 kicks, under 2 s. Its top is the
    old far ledge, 320 px lower (same lantern, glide landing; F7 is 176 px over it now, a drop onto it). **F7 is 5056-5232** (was 5120-5344): a kick's swing off the face is
    145 px, and a 224 px F7 at 5120 bumped her head from below for ever, and caught a walk off the bluff's lip.
  - **The way back west**: trunk B's east face from the hollow (`back-1/2` on it), up through the bough to the
    summit (4-5 kicks, 3-4 s), then down the shaft (out under trunk A) or along trunk A's top and the high ledge.
  - **The bark of trunk A is a way up out of the well** (it was a chimney that dead-ended under the high
    ledge: a "kick when sliding" player looped there for ever). The high ledge is solid only 2816-2976 now; from
    there to trunk A it is a **one-way branch (2976-3200, y 448)**: floor to walk on, open from below (3 kicks
    from the well). `well-1/2` hang on the bark. Rule learned: **nothing solid may overhang a wall face within 150 px of it** (the swing of
    a one-wall climb), or the climb bumps its head and loops.
- **The floor is not a corridor** (2026-10-14, after the playtest's 8 s hold-right run): the bluff's west
  face is 320 px, more than a jump (272). Up it: the branch (a jump from the path, then 64 px up and a 128 px
  gap), a double jump, or two presses at the wall (a jump, then a kick out of the slide). Its east side is a
  192 px step down to the terrace. The hollow is 96 deep (deeper than she is tall), 192 up to the root on its
  east side. Holding right and jumping on a slow rhythm still stops at the bluff (`scene.test.ts`).
- From the bluff's top: F5 is a jump + double jump straight up-left (432 px, 32 to spare: a short cut to the
  high ledge for a sure hand); a held jump off the **west** lip is "the way home" (glide over burr-path and
  the whole pool to the first lantern: movement-controller.md, `layout-pilot.test.ts`; **F4 moved 96 px west
  to 1760-2016**, the jump used to snag its east end for 23 frames); a held jump off the
  east lip floats over the terrace into trunk A's bark and slides down it into the well: **the leap**
  (movement-controller.md).
- Left route up: bank → F1..F5 → high ledge (y 448) → its branch → trunk A top → trunk B top (192, the highest point).
- The trunk pair (gap 256 px, x 3328-3584) is the wall-jump shaft: three held wall jumps from the ground to 448.
  Six glints zigzag wall to wall up it and a seventh hangs on trunk B's side above trunk A's height. Trunk A
  comes down to y 1168 (a doorway 112 px high: she is 80; a jump in it bumps 32 px up, nobody takes it for a
  way up). From anywhere on the shaft floor a jump toward either trunk held 14 frames or more ends in a wall
  slide, and so does a running jump at trunk A from the terrace or at trunk B from the east
  (`layout-pilot.test.ts`). The terrace stops at 3072, 128 px short of trunk A: **the well**,
  where a walker drops in front of the doorway, a glide off the bluff slides down trunk A's bark, and
  `lamp-trunk` stands (3160). West out of the well is one jump.
- **The summit is 320 px to land on** (it was trunk B's 128): a bough (one-way, 3712-3904, y 192) runs east
  from the top, and a catch branch (one-way, 3808-4128, y 448) hangs a jump below it. Of 720 jump + double jump
  arrivals from trunk A (start, both holds, the gap between presses, steering) none falls east any more
  (110 did): ~460 land on the top or the bough, ~9 on the catch branch (one held jump back up through the
  bough), the rest came up short into the shaft, which is three kicks. The summit glide takes off from the
  lantern or the bough alike.
- Right route up: root → branch → F6 → F7 → down onto the far bluff's top (768).
- Pickups may hang above the scene top, up to 40 px under `ceilingY` (the sky line over the right zone).
- `tests/unit/scene.test.ts` pilots every route; if you move a rect, it tells you what became unreachable.
  Reach numbers are in movement-controller.md.
- **Encounters on the critical path (playtest 4), each with a light before it**: `burr-path` on the floor before the
  bluff (2004-2316; lantern-stone behind her) | `burr-shaft` on the shaft floor (3378-3522; `lamp-trunk` in the well
  before the doorway) | `lamp-sky` on the summit glide's line (5180, 105; the crown lantern at the take-off) |
  `burr-rise` before the heart (4914-5106; `lamp-rise` 154 px before its patch since playtest 6). The walker meets path and rise, the
  shaft-floor player all three, the glider path (or flies it) and the sky. Rules and fairness: enemies.md.
- Lanterns: 1448, 1280 (moth-stone) / 3684, 192 (trunk B's top) / 5524, 768 (the far bluff's top); the heart: 5212, 1088
  (the shrine). Wayside lamps: 3160, 1280 (the well) / **4350**, 1280 (the floor before the right rise's step) / 3264, 448 (trunk
  A's top) / **4760**, 1088 (the rise, before the heart). Validated: on a solid top that is not the pool, the whole trigger box supported and clear,
  lanterns 300 px from the spawn, a heart needs lanterns. Pilots that play the whole scene from the spawn:
  `tests/unit/goal-pilot.test.ts` (a goal-directed run with the glide), `naive-pilot.test.ts` (the tapper and
  the holder of playtest 3, who only react), `critical-path.test.ts` (each wall and stair on its own): move a
  rect and they name the leg that broke.

## Collision and placement changed in playtest 5 (2026-10-14)
- **A root step at the bank's foot**: `{root, 384, 1184, 64, 96}`. The bank's 192 px wanted a held jump or a
  kick; a 6-frame tap is 136 px, so two taps now. It is also the last stair down from F1 (F3 -> F2 -> F1 ->
  the step, holding left). Painted by the `root` painter as it stands. Tests that took `tag === 'root'` for
  THE root now ask for `x === 3968`.
- **Trunk A's west bark is no climb**: `kick: 'east'` on the solid (new: `kick: false | 'east' | 'west'`, the
  one flank that takes a slide and a kick; `kickableAt` decides by which side of the solid her box is on).
  The well leads through the doorway into the shaft (burr-shaft); a kicker used to go up the bark and miss
  lamp-trunk and burr-shaft. The leap off the bluff now ends with a plain drop along the bark into the mouth
  of the doorway, a step past lamp-trunk (it was a slide onto it). The shaft's own wall (the east face) and
  the wall-to-wall climb are unchanged. `well-1 / well-2` moved into the doorway (3236 / 3292, 1236).
- `great-ember` (1500, 650) over F3: the summit lantern's key (goal.md). 73 pickups, worth 101.
- burr-ledge at 3090 (fenced, r 60), `wing-rise` at 5090, 900, burr-path `hp: 4`, lamp-sky `sight: 500`
  (enemies.md). Scene fields new: enemy `hp`, burrback `fenced`, lampwing `sight`, lantern `key`.

## Placement changed in playtest 6 (2026-10-14; no solid moved)
| what | was | is | why |
|---|---|---|---|
| `lamp-rise` | 4860, 1088 | **4760**, 1088 (100 px west) | 54 px from burr-rise's patch: the fight ran into its light, and wing-rise dived at one who stood at it. Now 154 px before the patch, 330 px from wing-rise's home (never noticed there). The painted boulder (4712) is 48 px west of it |
| `lamp-root` | 4566, 1280 (at the rise's wall) | **4350**, 1280 (216 px west) | burr-root paces that wall now: the lamp is the rest before its patch (156 px), not inside it |
| `burr-root` | feet 4476, r 110 (box 4340-4608) | feet **4572**, r 40, facing -1 (box **4506-4608**) | every tap jump from the root's lip (lands 4283-4473, slides to 4478) and a walk off the rise's west lip (4436) land west of it |
| `great-crown` | 3648, 134 (on trunk B's top, 36 px west of the lantern) | **3768**, 134 (over the summit bough, 84 px east of it; pod-bough 82 px further) | the bud and the ember's socket mark shared 40 px |
| `lamp-ledge` | sight 260 (default) | `sight: 400` | it saw no one on F5 or the high ledge |
`lamp-trunk` (3160) did not move: it is 218 px from burr-shaft's patch. `wing-rise` did not move (5090, 900): the
lamp left its sight instead, and its dives end where she fights burr-rise (enemies.md).

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
- **The last kindle** (`goal/camera.ts`): when the third lantern catches and it and the heart fit one view
  (zoom >= 0.9; no zoom-out has been needed or tested) the view eases to hold both for the wake (1.1 s in,
  2.5 s held, 1.4 s back), then a soft pull keeps the awake heart 150 px inside the frame while she is near.
  Render-side offsets like the kick; her position comes through `camLink`. goal-render.md, round 6.
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
- `npm run shots` (dev server on 5180, or `--url`): `shots/wide-*.png` (1920x1080 at 13 camera stops; 8 = the bluff, 9 = the hollow, 10 = the shaft floor, 11 = the
  summit bough, 12 = the catch branch, 13 = the foot of the far bluff),
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
