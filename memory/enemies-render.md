# Enemies, render side: the burrback and the lampwing (`src/render/enemies/`)

Rules and state fields: enemies.md. **Start with the last two sections (playtest 5, playtest 6 round 2): the
tell, the hit tone, the winded pose, the whole lampwing, the curl, the top clang and the scurry are there; older
sections are right only where they do not contradict them.** Current sheets: `shots/enemr6/{path,rise,shaft}/*.png`
(curl / clang / scurry / wall stun), `shots/enemr5/{burr,lamp}/*.png`, clip `clips/enemr5-*`. Older: `shots/enemr3/*.png` (the ram: brace, block, ram, spent,
punished, dead, in the centre and right zones at 3x and play zoom; the wall jolt; the reset; the lampwing's
tell and tumble) and `clips/enemr3-*.mp4`; `shots/enemr2/*.png` (per zone: before / after, notice, calm,
touch); older: `shots/lamp2`, `shots/burr2`.

## Wiring
- Two layers, two meshes (`painter`, `front`; `paint.ts` is a copy of Vesper's painter with
  caller-set bounds). `enemies` (before `character`): bodies, so she and the glints pass in front and
  the grass fringe crosses a shell's lower edge. `enemiesFront` (after `playfieldFront`): burrback
  legs from the rim line down (same geometry, clipped at `rig.y - rimH + 2`), dust, chips, plates,
  wing scales. Not in the hero matte: they take the zone grade and her light like the plants.
- `EnemyRenderer.update(dt, clock, cam, sim)` from stage.ts dispatches on `e.kind`; rigs are per
  kind, by enemy index. Reads `sim.enemies`, `sim.frame`, `sim.alpha`, `sim.player`, `sim.goal` (lit
  lanterns, `gathered`): a hit is a new `hitFrame`, death is `mode: 'dead'`, its touch is `alert` with
  `knockVx != 0`, so `load()` and re-form just show. From `sim.events` (`react()`): why a burrback
  turns (`enemyTurn` cause `lantern` / `wary`), `enemyBlock` (`rig.block`, sparks), `enemyRecover` (`rig.spent(cause)`),
  `enemyReset` (`rig.reset`), and a lampwing's `enemyGiveUp` cause `calm`. Dev handle
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

## The lampwing: a ghost-moth (`lampwing.ts`, `LAMP`) (look superseded by the last section; the wing / beat / death mechanics still hold)
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
  30-frame pauses. No burrback in the grove stands that way now (every far end is > 320 px from a lip).
- **Touch**: seen once per mode start. Squash along the shove (`rig.sqDir`, not `hitDir`, which is stale),
  rock back, burrs and fringe bristle on a spring, legs skid while `knockVx` > 0.5, pale dust (a blow's
  dark dust is invisible on dark ground without the flash: `dustPale`, 2.1x denser), lights jump. The
  sim flips `facing` at once; drawn, it holds 11 frames, then head and body come round by frame 29.
- **Face**: plate 9.6 x 6.9 (was 7.4 x 5.3), eyes r 1.6 (was 1.15), paler warm, each with a faint halo
  (0.11, only on the over-the-brow pass). Two lights now read at play zoom in all three zones. Brighter
  halos (0.2) read as headlights.
- **Lampwing, left zone**: membrane 0x3b4763 / tip 0x1a2236 (was 0x5c6c80: paler than the blue fog behind
  it, so it washed out), wing alpha 0.9. Right next to a lit lantern the light mask still lifts it pale.

## Reading at play zoom (playtest 2, 2026-10-14; `shots/enemr2/`)
Measured with the enemy meshes on / off in one eval (`painter.mesh.visible`, `front.mesh.visible`):
the changed pixels are the creature, the same pixels without it are its background (linear luminance).
The sizes and tones in the sections above are the earlier ones where this section differs.
- **Burrback was dark on dark**: its mean was 0.03-0.07 on a 0.05-0.15 ground and little on it was pale
  (brightest 5% of its pixels +0.04..0.17 over their background). Now: shell 30 x 27 on a 13 rim (drawn
  ~50 px tall with the burrs for a 34 px box; the head sits at 16 so it clears the grass), a **bone
  crown line** just inside the top of the outline (`BURR.crest`, `crestColor` per zone) and bone tips on
  horn and burrs (`SH_HORN` runs shell -> `hornTip`). Brightest 5% now +0.14..0.23 left, +0.28..0.39
  centre, +0.15..0.26 right.
- `crestColor` is one SOURCE per zone because the grades differ: the same bone came out near-white in
  the centre and right and dull in the left (mist in front, crushed mid-tones). Left is 0xf2ecdc and
  1.35x wider and is still the weakest zone; there the fog-lit plum dome against dark blue carries it.
- Eyes r 2 with halo 0.11; halo 0.14 fused the two into one blob.
- Flank lights: larger (r 1.7-2.35), and walking they run front to back as a chaser, one pass per 66 px
  walked (`spots.walk / low / high`, on `rig.dist`, so it stops when the creature does). Centre zone
  lights are ember red-orange (0xff6a24), not amber: amber could not be told from the calm tone.
- **Notice** (`BURR.notice`, render only, the sim never chases): she is lit, within 420 px and 150 px
  of its level. One start (burrs kicked up on the spring, a perk, lights flash), then burrs stay raised
  0.95, eyes on her and wide, no blink, feelers up and quivering, lights x1.6. At play zoom the raised
  pale burrs and the feelers are what shows; the flash is small.
- **Calm**: the dome itself sags (`calm.flat` 20%, `spread`), burrs lie back and halve, so the silhouette
  goes from ~50 px tall to ~35 and flat; lights one pale gold (0xffc070) breathing together at depth 0.8.
  `K_SLEEP` motes (pale disc r ~2 + halo, one per 0.75 s, 2.3 s, a lazy S) lift from its head end: clear
  in 1:1 crops in all zones, faint in a full frame 700 px away. Posture and the light colour are the read.
- **Touch**: `K_PUFF` = solid pale discs (not `soft`) thrown in a low fan where the two met, braking hard,
  swelling 3 frames then shrinking to nothing in 0.26-0.42 s, plus pale grit (`K_GRIT`, the chip physics).
  The old haze stays under it at 1.3x (was 2.1x).
- **Lampwing hunt** (`LAMP.hunt`): in `curious` the beat STOPS: all four wings thrown wide and high in an X
  and held on a fine shiver (`rig.hold`, in 20 /s, released at 11 /s into the first stroke), the ringed
  wing spots open as two lit eyes, lamp, eyes and spots go to one hunt colour in every zone (coral
  0xff4630; it grades pinker in the right zone). In pursuit: spots stay lit dimmer, lamp x1.7 and larger,
  stroke x1.15, the tail curls toward her. Seen in the centre and right zones; the left one would not
  notice her where it was staged (not seen there).
- Staging calm on any burrback: on the live record set `calm = 120, mode = 'pause', timer = 120,
  turning = false, vx = 0` every 18 frames (what `calmEnemies` does). A real kindle at lantern-stone
  calms burr-path ~850 px away, at the frame edge.

## The ram, acted (2026-10-14; `BURR.ram`, sheets `shots/enemr3/`, clips `clips/enemr3-*`)
The sim's `windup` / `charge` / `recover` (enemies.md) used to be a standstill. One language for "it is
coming": **its lights go to one red (0xff3c26) and count down in quickening flashes** (the lampwing's tell
now counts the same way, in its coral).
- **Brace** (26 frames): a wedge. Front pitched down 0.32 rad so the rear stands high on its legs, head
  under the shell (two red eyes in the slit), the brow plate pushed out 9 px (`rimPt`: the outline's front is
  displaced; `gDown` is clamped so the pitched front stops at the ground), a bone line down the plate's edge
  (2.5 px: what reads as "armoured" at play zoom), the horn levelled at her, burrs laid back, weight coiling
  back 7 -> 13 px with a tremble that grows, rear feet scraping in turn (3 strokes) with a kick of dust, a
  glint at the horn's tip on each beat. Five beats at frames 0, 8, 13.5, 18, 22 (`beats`, `countPow` 1.4).
  The first frame already has the red lights, the tucked head and the stamp; the wedge is there by frame 3.
- **Block**: the cross is the character's. Ours: the shell shudders (2.4 px at 15 Hz, dying at 8 /s), the
  plate flashes pale where it took the cut (`p.glow`), the bone edge goes white and wider, a swelling runs
  along the crown line brow to tail ("the plates ring"), burrs rattle, 9 hot chips (`K_SPARK`: a streak along
  its flight) fly back at her. No dark tone (dark = damage).
- **Ram**: stretched 15% long and low, legs swept back and paddling (`ramK`), each light drags a 28 px
  streak, pale dust off the heels every 0.022 s. **Stop**: `wall | ledge | lantern` = a jolt (squashed 34%
  against it, thrown back off it on the `back` spring, puffs both ways, grit); `spent` = a skid (it rides
  ~10 px on over the `back` spring, legs scrabbling 7 frames, dust ploughed ahead); `touch` = the bump
  (the old touch path, now also for `recover` with `knockVx`; it holds its facing 22 frames before the
  sim's turn away is drawn).
- **Spent** (45 frames): reared back off its front legs (`tip` 0.3, `sit` 0.35: sitting it flat on its
  belly hid everything under the grass), the brow plate lifted, **the seams gape pale** (the read at play
  zoom: pale ribs on a dark shell = open), a soft mauve belly under the lifted front (visible at 3x only),
  head hung out, eyes half shut and rolling, lights down to 20%, panting (10.5 rad/s, a small breath puff
  every second pant), a slow daze sway. It gathers itself over its last 10 frames (`gather`): that is the
  "window closing" tell.
- **Cannot brace yet** (`strikeCd`, `rig.cdK`): head kept in a little, eyes on her, and its lights come
  back one by one, tail first; the front one relights as the 150 frames run out.
- **Hits with the 4 / 4 / 7 hold**: the squash is pinned and the creature dark and shuddering for exactly
  `e.hitstop`, the pale pop and a kick of pale puffs come as the shove starts (`rig.held / rel / released`);
  the slide's dust is the pale dense kind now. The death timeline is unchanged and still pays off: 7 dark
  frames, then the roll and burst ~90 px down the shove.
- **`enemyReset`**: armed until it is next on screen, then 1.7 s: a beat (her re-form is still fading up),
  burrs kicked up and a shake with dust off its back, lights back one by one. Subtle on purpose.
- **Lampwing**: the 36-frame tell builds instead of holding (wings creep 0.14 rad higher / 0.2 wider, shiver
  x2.6, five quickening flashes of lamp and wing spots, a 3.5 px sink and a last lift before the stroke);
  the 24-frame tumble has eyes shut and the lamp guttering; its hit tone follows the hold like the burrback's.
- Gotchas: the crisp pale puffs (`K_PUFF`) pile into cotton balls when more than ~4 leave one spot: use
  `dust()` (soft) for volume and 1-4 puffs for the accent. In the right zone every bone source comes out
  near-white: the levelled horn at 1.55x was a lance, 1.3x is right. A wake that starts when she re-forms
  plays in the dark of the fade-up.
- Capture: `scratchpad/enemr3/harness.js` was a `playwright-cli run-code --filename` script (no `require`
  in there): one `page.evaluate` that loads, teleports, runs the masher / reader pilot of
  `burrback-ram.test.ts` closed-loop, draws labelled cells into sheets, leaves data URLs on `window.__out`
  (fetched with `eval --filename`), and returns the inputs as a DSL script: **that script replays in
  `npm run clip -- --pickups --at x,y --script "..."`** if the harness also stepped 30 frames after the
  teleport (`--pre`). A hot reload between the two calls loses `__out`: wait 2 s after an edit.

## Playtest 5 round (2026-10-14; sheets `shots/enemr5/`, knobs `BURR.ram`, `BURR.hit`, `LAMP.dive`, `LAMP.hit`)
Sim side of the same round: burrback hp 5, winded 30 / tired 66 / wall 90 frames, `strikeCooldown` 12, `roused`;
lampwing hp 3 with `curious` -> `dive` -> `stall` -> `pursue` (a climb to a perch) -> `curious` again.
- **The green leaf triangles on every cut are not ours.** They are the playfield's clippings:
  `src/render/scene/layers/playfield.ts` `onSlash` (fires on every `slash` event, hit or not, `PLAYFIELD.clippings`
  20 per full box of grass, colours `CLIP_COOL / WARM / DEEP`: green in every zone) drawn by
  `src/render/scene/lib/pf-clippings.ts` (`CLIPPINGS.life` 0.85 s) in the `playfieldFront` layer, i.e. over the hero.
- **Our chips**: `BURR.hit.chips` 3 (5 for a finisher), `chipLife` 0.13-0.19 s, thrown along `hitDir` off the far
  side, in the shell's sheen lifted toward `plateIn`. `K_FRAG` and `K_SCALE` particles go into the BACK painter
  (with the bodies, behind the hero and her crescent); everything else stays in front of the grass. Lampwing hit
  scales: 4 / 5, `scaleLife` 0.26 s.
- **The brace's count is the rim** (was four 3 px lights): the whole dome outline is a line in the ram's red, on
  each of the five beats and falling off between, `rimW` 1.25 px + `rimGrow` 0.65 per beat (x1.4 in the left
  zone), going to `rimPale` at the top of a beat, with a red halo behind the shell that also grows per beat
  (`rimHalo` 30 + 9 px). On the frame the ram starts: one pale flash (`flashR` 70, gone in ~4 frames). The line
  stays on, thinner, through the ram (it is still armoured). `rig.beatN / beatNew / relT`.
  Silhouette: `pitch` 0.42 and `tall` 0.17 (stretched up from the ground, so the rear stands ~10 px higher), the
  plate `out` 14 with its bone edge 3.3 px and never under 72% lit. Each beat the front feet kick puffs and dust
  TOWARD her (`kick`, more per beat); the rear scrape still throws behind.
- Measured (changed pixels with the enemy meshes on / off, linear luminance, 1920x1080 play zoom): the tell's
  footprint is 3650-3930 px against 2040-2630 walking; brightest 5% of its pixels vs their background: left
  0.17 (peak 0.22) on 0.07, centre 0.28 (0.39) on 0.07, right 0.36 (0.42) on 0.10. The mean |creature - bg| hardly
  moves (left 0.04, centre 0.07, right 0.11): the read is the red line and the bigger shape, not overall value.
  Left stays the weakest zone.
- **Hit tone** (both kinds): frames 0-2 of the hold = a pale outline (`flashW` 1.7 px `flashColor`, the same
  ribbon as the rim count; the lampwing's wing edges) on a fill that has not changed; the rest of the hold = 62%
  toward `struck` 0x2f2a34, a flat desaturated dusk (NOT a multiply toward black: that vanished on dark ground),
  outline on at 42%; then the `pop` (0.42; lampwing 0.3). `tone()` mixes toward `C.struck`; the near-hero dimming
  is `nearDim` now, not part of `toneDark`. 0x4a434f for `struck` read as a pale ghost next to her light.
- **Winded** (`recover`): rolled back, `tip` 0.62 rad with the body lifted so the rear rim rests on the ground
  (`sitUp`: the rotation is about mid-height and would sink it), front legs off the ground pawing, head hanging
  4.5 px lower, a pale wedge of underside between the lifted rim and the ground (drawn AFTER the fringe; drawn
  before the shell it was hidden), one slow deep breath (`pant` 7.4 rad/s, depth 0.12), three tiny pale motes
  circling over it. `enemyRecover.broken` (a blow broke its brace): no skid, it drops where it stands. `recover`
  can start again after a `hurt` with no event: the rig keeps the last cause.
- **Wall stun** (`cause: 'wall'` only, the sim's 90 frames): `stunTip` 0.95 (nearly on its back against the
  wall), all six legs in the air, wider faster rock, five motes. Ledge / lantern stops are the jolt, then plain winded.
- Cracks scale with `hpMax` now (hp 5: 1, 2, 3, 4 cracks at 4, 3, 2, 1). Clamp the index: at hp 0 the formula gives 5.
- **Lampwing, the look**: larger (fore 31 / hind 20: ~55 px across; the box is still 36 x 30), DARK body and
  membrane with the pale edge, a hooked (sickle) fore-wing apex with a notch under it, a long tail streamer on
  each hind wing, a 21 px abdomen with the lamp as a bulb at its END (r 2.6, pale core, halo x4). Centre zone
  membrane is a warm brown (0x7c5c3a): the dark one was invisible on dark green (weakest zone still).
- **Lampwing, the dive** (`phaseOf(mode)` maps sim modes to tell / swoop / open / climb by NAME, so a renamed
  mode needs one line there): tell = the old X hold plus it rears back from her, the lamp grows (x1.55) and a thin
  line of light runs from the lamp toward `targetX/Y`; swoop (`dive`) = the body turns head-first along its
  velocity (`rig.head`, straight down goes over on the side it faces), stretched 20%, wings swept back to the
  tail (`sweep` -0.85) and narrow, the lamp trailing a streak; open (`stall`, `rest`) = wings flat and wide on a
  slow beat, membrane 70% toward the pale edge (pale = soft, the same language as the burrback's underside),
  lamp at 28%, eyes half shut; climb (`pursue`, `return`) = deep strokes (x1.3), hunt colour kept in `pursue`.
  `enemyStall` cause `wall`: a lean kick and four scales (not seen: no wall met in the staged runs).
- Capture: `scratchpad/e5/{page.js, go.sh}`: `go.sh <dir> '<js>'` installs the harness and runs the staging in ONE
  `run-code`, returning the sheets as data URLs in the result (another agent's edit reloads the page between two
  calls and loses anything kept on `window`). Plans: `reader`, `masher`, `watch`, `up`, `dodge` (steps out from
  under the dive, cuts in the stall), `stand`. A lampwing with no footing in its sight is staged by moving its
  live record and home (`move: {x, y}`: wrap `__enemies.update` for one step to get the sim). `H.contrast()` is the
  mesh on / off measurement. `npm run clip` at 1920x1080 takes ~1 minute and dies on any hot reload: retry.

## Playtest 6 round 2 (2026-10-14; `BURR.curl`, `BURR.clang`, `BURR.scurry`; sheets `shots/enemr6/`)
Sim side: enemies.md "Playtest 6, round 2" (`tuck`, `enemyBlock` slash `down`, `enemyTurn` cause `drop`, the carried ram).
- **Curled** (`e.tuck > 0`, not in windup / charge): `rig.curlK` in at 24 /s. Right down (`crouch` 1.3), shorter and
  taller, and the lower sides of the outline PINCHED in under it (`gPinch` / `pinch(sn)` in `rimPt`, the belly, burrs,
  crown and sheen): a ball, not a dome on a rim; without the pinch it read as the calm "settled" pose. Legs folded
  to half their stance (hidden), head 7 px further in and the face plate off, horn bent under (`horn` 0.5: at 0.35
  it stuck out at the ground like a beak), fringe in, burrs up a little, a slow rock (`rockRate`) that runs faster
  when it is moved (`waddle`: the sim walks a curled one at 1.6 px/f and shoves it; without it the ball slid).
  The row of lights goes OUT (`lights` 0: at 0.06 four dim dots still showed) and one slit (`slitW` x `slitH`, the
  zone light 35% toward the eye colour, faint glow) sits low at its front. Curl overrides the winded pose (a pogo
  on a winded or wall-stunned one: no open seams, no lifted front). A landed pogo's held squash is a flattening
  (`curl.pound`, `rig.pogo` set from `enemyHit` slash `down`), not the sideways shunt.
- **Uncurl into the brace**: when `windup` starts with `curlK` > 0.3 there is no plant flattening; it is stretched
  up, rolled forward (`unrollRoll`), the plate thrown out, burrs kicked, while `curlK` falls at 11 /s. Every
  frame (`rise/3x-uncurl-everyframe.png`): the first red beat lands on the still-round ball, legs out by frame 2,
  the wedge by frame 3-4. Reads as one motion. Uncurled on the timer: a shake-out (`shake` on the bristle spring).
- **Top clang** (`enemyBlock` slash `down`: braced, curled, also a ramming one): `rig.blockTop(u)` (u = hitX along
  the shell), NOT `block()`. Pounded flat (`squash` +0.14) and a fast vertical ring (`bounce` px, `pound` share at
  `hz`), tipped away from the strike; the crown line goes pale and a swelling runs OUT BOTH WAYS from the struck
  point; a small pale bloom there; the seams catch light. Chips: `sparksUp()` in index.ts, `chips` 6 K_SPARK in a
  narrow fan straight UP + 2 grit, thrown after the creature is drawn (it needs the drawn crown point:
  `topHit`, exported from burrback.ts; `rig.topNew` is cleared when off screen). Her own slash cross dominates
  the hit frame at play zoom; ours is the after-ring (chips up, pale crown) for ~6 frames. Dark and subtle on purpose.
- **Scurry**: on when `walk` at >= `minVx` 2.5 px/f, or when she is dropping onto it (index.ts `dropping()`, the
  sim's rule + near sideways) and it walks or stands. Low (`crouch` 0.8), leaning in, feet lifted less, head 4 px
  further in, burrs laid back, feelers streaming back, eyes on her and rolled to the top of the plate (`eyeUp`),
  head tilted up (`tilt`) on the `glance` (from `startle()` on `enemyTurn` cause `drop`, or the scurry's start),
  dust off its heels. **At play zoom the summit drop's scurry is off screen**: the camera follows her and the
  shaft floor comes into view only ~3 frames before she lands (`shaft/play.png`); it reads at 3x only.
- **Wall stun after a carried ram** (`shaft/3x-carry-wallstun-curl.png`, pogo spammer at burr-shaft from x 3530:
  the 2nd ram runs 20 frames into trunk B's bark): the jolt, then the stun tip and legs up, unchanged and right.
  A pogo on the stunned one curls it for the rest of the 90 frames.
- Capture: `scratchpad/e6/{page.js, go.sh}` (the session scratchpad is wiped on a restart: e5 was lost; page.js is
  e5's `H.stage` cut down + plans `pogo` (the spammer of `playtest6-fights.test.ts`) and `dropL` (teleport to
  3640, 192, hold left `hold` frames; `pre` 170 / hold 14 gives a `drop` turn at frame 13, landing 67), `capFrom /
  capTo` to skip capture on dry runs. `playwright-cli -s=<s> resize 1920 1080` first: the default canvas is 1280x720.
