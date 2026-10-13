# Enemies, render side: the burrback and the lampwing (`src/render/enemies/`)

Rules and state fields: enemies.md. Current sheets: `shots/lamp2/*.png`, `shots/burr2/*.png`.

## Wiring
- Two layers, two meshes (`painter`, `front`; `paint.ts` is a copy of Vesper's painter with
  caller-set bounds). `enemies` (before `character`): bodies, so she and the glints pass in front and
  the grass fringe crosses a shell's lower edge. `enemiesFront` (after `playfieldFront`): burrback
  legs from the rim line down (same geometry, clipped at `rig.y - rimH + 2`), dust, chips, plates,
  wing scales. Not in the hero matte: they take the zone grade and her light like the plants.
- `EnemyRenderer.update(dt, clock, cam, sim)` from stage.ts dispatches on `e.kind`; rigs are per
  kind, by enemy index. Reads `sim.enemies`, `sim.frame`, `sim.alpha`, `sim.player`, `sim.goal` (lit
  lanterns, `gathered`): a hit is a new `hitFrame`, death is `mode: 'dead'`, its touch is `alert` with
  `knockVx != 0`, so `load()` and re-form just show. Only two things come from `sim.events`: why a
  burrback turns (`enemyTurn` cause `lantern` / `wary`) and a lampwing's `enemyGiveUp` cause `calm`. Dev handle
  `window.__enemies` (`cfg` = `BURR`; `LAMP` is in config.ts too; `cpuMs`, `drawn`, `verts`).
- `?nopickups` empties `scene.enemies` (src/main.ts): shots / clip are clean plates; `--pickups` shows them.
- Cost (CPU fill, M-series, one on screen): lampwing ~0.04 ms / ~1100 vertices, burrback ~0.055 ms
  / ~2400; nothing on screen ~0.006 ms (springs only).
- Drawn position = box centre + `rx / ry`, interpolated by `sim.alpha` (integer `x` alone stutters).

## Staging and capture (what worked)
- Open-loop input scripts whiff. Drive it closed-loop in ONE `playwright-cli eval`: each step read
  `__game.state()`, decide the input like the pilots in `tests/unit/lampwing-pilot.test.ts` /
  `enemies-pilot.test.ts`, `input('<token>1')`, `step(1)`. `slashBox` is importable in the page:
  `await import('/src/sim/index.ts')`. The sim is deterministic after `load()`: do a dry run to find
  the event frames, then the same run again capturing windows around them.
- A cell: `cam({x, y, zoom})`, `render()`, `drawImage` the middle of the WebGL canvas into a 2D grid;
  return one data URL per sheet. Other agents' edits reload the page: re-install helpers in the same eval.
- To stage a rare state (a body that lands), wrap `__enemies.update` to grab its `sim` argument:
  `sim.enemies[i]` is the live record and can be moved / set to 1 hp (staging only).
- A finisher kill: three up slashes started when the pursuing lampwing's underside is ~150-290 px above
  her centre (search the start distance; the first two must whiff).

## The burrback
- `gait.ts` is pure and tested (`tests/unit/enemies-render.test.ts`): tripod, stance 58% of a 30 px
  cycle, 6 px lift; a planted foot's offset shrinks 1 px per px walked, so it cannot slide. Legs run
  on `stride + rx * facing`.
- Turn factor `d` (-1..1): it always turns AWAY from the camera; the head (`dHead`, leads) ducks
  behind the shell. Flank things fade by `|d|`. `setBody`: squash, then rotation about mid-height, so
  the death roll lays the dome on the ground; planted feet are world points and skip it.
- Silhouette (`SPIKES`): short upturned brow horn, three blunt ridge burrs, a tail lip, drawn under
  the shell. Thin pointed ones read as a sea mine. Rim 12 / dome 22 (rim 14 = a spider).
- Face (`drawHead`, twice: under the shell with the feelers, and over the brow once the head has
  come round, `faceK`): a SMALL DARK flat plate (7.4 x 5.3, 0x41363b) under the horn with two dim
  glints (r 1.15, 0xb0a794) that slide toward what it watches (`rig.lookX/Y`), widen when wary,
  blink. Rejected: pupils (a toy); a pale plate (an egg); the large pale-grey bulb with white oval
  eyes (a cartoon bug mask).
- Death: dark / pale snap, cracks wide, roll onto its back by frame 6 (22 px hop), legs curl, lights
  wink out, burst at frame 9: 8 plates (10 and x1.45 further for a finisher), dust, motes. Not drawn
  after the burst (the sim keeps the body 30 frames).
- Flank lights need deep saturated sources (0x1fb4d8 / 0xf0a030 / 0x8a4cf0); paler went near-white.
  Hit pop: 2 dark frames then ~2 frames 55% toward 0x7d6873. `nearHero`: 20% darker beside her.
  Fringe: 17 narrow dark tufts (11 wide = teeth). At most four thin cracks (more = a tortoise).

## The lampwing: a ghost-moth (`lampwing.ts`, `LAMP`)
- Front view, back painter. Slim body: narrow thorax, a long tapering abdomen drawn as a ribbon that
  trails the flight (`lagX`), thin hanging legs, a small DARK head with two dim pinprick eyes that
  slide toward `lookX/Y` (dimmer until it has seen her), two long thin antennae.
- Wings: narrow triangles with a pointed apex and a notched, tattered outer margin (`FORE_RAW`,
  `HIND_RAW`, rounded once by Catmull-Rom; fan centre given per outline since they are not convex).
  Dusky translucent membrane (alpha 0.82, darker toward the tip), pale edge and pale veins, one
  ringed spot on each fore wing (the hero's eye-spot family). The pale edge costs no geometry: for
  the wings the painter's key / cool colours are set to `edge` with `coolWrap` 1 (restored after).
- Beat: angle = mid + amp x sin(2 pi flap); hind pair lags 0.13 beat and hangs lower; chord narrows
  on the upstroke; body bobs. `flap` is interpolated the short way round its wrap.
- Lamp: small (r 1.15), dim, slow pulse (1.1 rad/s, depth 0.55), core 30% toward the body tone;
  x1.25 in pursuit, x2.4 with a wider halo only in the `curious` tell (`rig.flare`); flickers at 1 hp;
  gutters out in 12 frames when it dies.
- Hit: dark through the hold, then ~3 frames 60% toward 0xcfc9be (reads above an up cut's mark and
  in the gap of a forward one); one end-over-end turn through the 16-frame tumble with wings 70%
  folded; 6 scales (10 for a finisher) thrown in a 0.6 rad fan ALONG the knockback (`knockVx/Vy`).
- Death (like the burrback, shorter than the sim's 40 frames): the blow tears the hind wings off
  (10 more scales, wide fan), the body is flung spinning and sheds a scale every 0.05 s, thins over
  5 frames and goes to 16 scales (24) at frame 18 (`death.dissolve`); `rig.dissolved` stops the
  drawing. If it lands first it lies crumpled its 6 frames, then the same dissolve.
- Scales (`K_SCALE`, front painter): slivers ~4 x 1 px that brake hard (7/s), then sink at 46 px/s
  with a flutter, 0.3-0.75 s. Rejected: large diamonds (a static checker cluster hanging in the air).
- Tints are mid-values per zone (membrane 0x5c6c80 / 0x968a6e / 0x73698a); ~0xb0 came out
  near-white. The centre zone's green grade needs warmer, lighter sources than the other two.
- Rejected looks: round pale wings with dusky margins + bead eyes + bright cyan tail (cute, a
  butterfly); a round dark face with 0.85 px eyes (a cartoon bee); feathery thick antennae (rabbit ears).

## Acting out the sim's gentler rules (2026-10-14; sheets `shots/enemr/*.png`)
Knobs: `BURR.calm / shy / peer / touch`, `LAMP.calm / shy` (config.ts).
- **Calm** (`calmK`, both kinds): on while `e.calm > 0`, lifting over its last 26 frames, and also while it
  is harmless for a lasting reason (burrback inside a lit lantern's 110 px, lampwing inside the 160 px
  ring, `goal.gathered`), computed in index.ts with the sim's numbers. Burrback: belly down, deep slow
  breath (phase is integrated: a rate change must not jump), feelers laid on the ground, lids 70% shut,
  the four lights go to ONE warm tone (0xffb260) breathing together, the shell rim takes the same warmth,
  a tiny mote lifts off every 0.7 s. Lampwing: the drawn beat is 55% of the sim's (rig keeps its own
  phase, advanced by the sim's rate), smaller stroke with the wings held higher, a slow swell, drooped
  antennae and tail, eyes shut, lamp warm. The colour change is the read at play zoom; in the centre zone
  the lights are amber already, so there the pose, lids and unison breathing carry it (weakest zone).
- Gotcha: a calmed burrback is not always standing (one walking out of a sanctuary): the settle only
  applies where it stands, or it slides on its belly.
- **Sanctuary**: burrback, first 42% of the 24-frame turn = the flinch (flatten, duck, head in, rocked back,
  kicked 4 px off the light on a spring, eyes narrowed and turned away, feelers thrown back, lights down
  50%), the turn itself in what is left, head stays tucked ~1.3 s. Lampwing: `shy()` kicks a render-only
  offset spring away from the lantern, wings half shut, lean away, lamp dipped; then the calm look while
  inside the ring. **No lampwing in the grove can reach a lit lantern** (every home is 780+ px from one,
  leash 520): that give-up was only seen staged (live record moved next to lantern-stone).
- **Wary**: the turn starts with a 10-frame peer at the edge (head craned out and down, weight back).
  The stand: whenever it stands with her feet 24+ px lower and within 640 px, it turns (render only) to
  her side and peers; `standing` also covers the one frame of `walk` with `vx 0` between the sim's
  30-frame pauses. In the grove only burr-far ever stands (the others' far end is > 320 px from the lip).
- **Touch**: seen once per mode start. Squash along the shove (`rig.sqDir`, not `hitDir`, which is stale),
  rock back, burrs and fringe bristle on a spring, legs skid while `knockVx` > 0.5, pale dust (a blow's
  dark dust is invisible on dark ground without the flash: `dustPale`, 2.1x denser), lights jump. The
  sim flips `facing` at once; drawn, it holds 11 frames, then head and body come round by frame 29.
- **Face**: plate 9.6 x 6.9 (was 7.4 x 5.3), eyes r 1.6 (was 1.15), paler warm, each with a faint halo
  (0.11, only on the over-the-brow pass). Two lights now read at play zoom in all three zones. Brighter
  halos (0.2) read as headlights.
- **Lampwing, left zone**: membrane 0x3b4763 / tip 0x1a2236 (was 0x5c6c80: paler than the blue fog behind
  it, so it washed out), wing alpha 0.9. Right next to a lit lantern the light mask still lifts it pale.
