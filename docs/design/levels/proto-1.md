# Prototype level 1: Lanternroot

2026-10-18. A brief for one prototype level. It tests the direction Matt set on 2026-10-18: **an Animal Well-style
secrets-and-puzzle metroidvania, with our graphics and our skills, keeping real combat.** The closest model is
*Tunic in 2D*:
- dense, layered secrets and curious puzzles;
- combat that matters;
- creatures that double as puzzle pieces;
- the blade as a tool;
- a small light economy.

This is a test bed, like the test grove. It constrains the real game only where Matt says it worked.

**Build on the orchestrator branch's HEAD** (`claude/incremental-game-dev-strategy-e420e7`, 7722f1f or later). That
branch has:
- the fling (e284ebf: Lamp near a flame slows the moment, aim, release; embers);
- `sharpWings` and `longBreath`;
- combat round 7 (832cf6a);
- the audio pass (4916b64).

Everything below assumes them. Older notes in `memory/lures.md` about the catch and the beat-free are stale.

**Matt's hard rules, which this brief is built on:**
1. **Density.** At any moment 2–3+ different things are within reach.
2. **Discovery and challenge over guidance.** No hint gets added because an agent got stuck.
3. **The player keeps control.** No grabs and no held beats.
4. **Painted, not greybox.**
5. **Movement stays good.**

---

## 1. The pitch

**Lanternroot** is a fallen giant at the wood's edge, where the bowl opens to the valley. The last firefly filled its
hollow trunk with its first collection of lamps, and moths circle them by the hundred. Under the trunk, in the drowned
roots where no lamp hangs, sits a row of cold glass buds that only moonlight can light.

Wing goes down through the giant in three layers:
- the moonlit crown on top;
- the lamp-hall inside the trunk;
- the black roots below.

She finds **Kindle** (she gives her own light to the moonwicks) and **Gust** (a wingbeat that snuffs at range). With
them, every screen she has already seen opens again.

It's fun because each screen is a small, dense machine:
- something to fight that pays light;
- something to collect;
- something to cut;
- a lamp to fling from;
- a secret whose tell is honest.

Light is the one currency. It heals you, it opens the world, and you earn it with the blade.

---

## 2. The space

### Rooms and camera (decided)

**Three painted rooms, one per layer, plus one secret room behind a door.** I chose this over one tall room for three
reasons.

**1. Each layer is one look, and one room per look is what the renderer already supports.**
- The night layer is silver, and is the wood kit at canopy height.
- The hall is amber lamplight inside bark.
- The roots are near-black, lit by moonmoss, glowworms and water.

Per-room looks (`setRoomLook`, `memory/rooms.md`) work today. Mood zones only vary along x.

**2. Bake limits.** A room 3 screens tall (3240 px) would push mid's bake below scale 1.2 and put three looks in one
bake. A room of 5760 × 1536 is under the 7450 px width limit (`memory/rooms.md`) and the 4096-texel height limit.

**3. The drop between layers is a natural act break.** The crossing's 0.3 s carry (`room.transitionFrames` 18) hides
a painted rebuild of ~150 ms (`memory/world.md`).

Each room is 5760 × 1536: three chambers of 1920 × 1536. At 16:9, 456 px of each chamber's height is ceiling, floor
or vertical play. On taller windows it shows (Vert+, cap 1536), so nothing important sits in the outer 230 px.

**The camera: chambers, not flip-screen.**
- Every chamber is a camera zone with `lock`. The view keeps inside the chamber horizontally and follows her
  vertically within it.
- Crossing a chamber edge slides the view in **20 frames**. This needs a per-zone `frames` field (S).
- The boss arena is a fully locked 1920 × 1080 zone at zoom 1. Painted rooms can't show zoom < 1 yet
  (`memory/level-kit.md`).

Why not true flip-screen as in Animal Well: she runs at 576 px/s and one fling carries her ~680 px. A hard cut every
3 s, and in the middle of an aimed arc, would break the movement Matt likes. Chambers give the same composed,
readable tableau per screen (puzzles read whole, art is composed per screen, a solver reasons per chamber), and the
motion stays continuous.

**Hiding things.**
- On 21:9 the view shows ~300 px of the next chamber (Hor+, cap 2592). Secrets therefore sit at least 360 px from
  a chamber edge, or under a **cover**.
- A cover is HK's secret mask: a painted foreground root mass over the hidden space. It fades when her body enters
  or when the bark in front of it breaks. Data: `marks.covers: [{id, x, y, w, h, opens?: "room:bark-id"}]`, render
  only.

**World file.** The level gets its own world: `content/worlds/proto-1.json`, with its own `start`, `rooms` and
`areas`. It is loaded with `?world=proto-1`, and `validateWorld` checks each world file (S). The game world stays
untouched: the wood's world check needs one connected graph.

### The map

```
 world x: 0                  1920                 3840                 5760
          ┌────────────────────┬────────────────────┬────────────────────┐
 NIGHT    │ A1 THE CROWN FALL  │ B1 THE TRUNK'S BACK│ C1 THE ROOT PLATE  │──► east: the valley (end)
 lr-night │ start · patch      │ the answering cap  │ the vista · patch  │
 y 0      │ [H1 hollow log]◄bark│ the ember run (opt)│   ▲ chimney top    │
 silver   │ M-a1 ▸ crow's nest │ brambles · hawker  │   ╲ drop west ─► B1│
          │                    │ [knot ► CACHE door]│                    │
          └─────╥ split ───────┴──────╥ knot panel ─┴───────╥ chimney ───┘
                ║ (two-way)           ║ (down only)         ║ (curtain: Gust)
          ┌─────╨──────────────┬──────╨─────────────┬───────╨────────────┐
 HALL     │ A2 THE SPLIT       │ B2 THE LAMP HALL   │ C2 THE WICK GALLERY│
 lr-hall  │ first lamps · moths│ HUB · patch        │ cold moonwicks     │
 y 1536   │ moth-stone shelf   │ the seal (M-s1+s2) │ the guarded set    │
 amber    │ danglers · juvs    │ [H2 loft ▸ sharp   │ the vault (3-set)  │
          │                    │      wings]        │ grille lamp+curtain│
          └──╥ hole ─────╥ stair┴──────╥ seal ──────┴──╥ shaft ──────────┘
             ║ (down)    ║ (moss)      ║ (down)        ║ (gate; opens from below too)
          ┌──╨───────────╨─────┬───────╨────────────┬──╨─────────────────┐
 ROOTS    │ A3 THE DROWNED     │ B3 THE GLOAM       │ C3 THE CISTERN     │
 lr-roots │    ROOTS           │ mini-boss arena    │ burrback · danglers│
 y 3072   │ black · glowworms  │ (locked 1920×1080) │ root column up     │
 black    │ KINDLE hollow·patch│ east door ═════════│ [H3 heartwood ▸    │
          │ first light (moss) │   (opens on win)   │  moon-drop, S3]    │
          └────────────────────┴────────────────────┴────────────────────┘
          + lr-cache (1920 × 1536, through the knot door on B1): the firefly's cache
```

**The links.** Every edge exit is a 256 px span (4 tiles), equal on both sides (`memory/world.md` §5.5).

| exit | span (room x) | from → to | how |
|---|---|---|---|
| `split` | 1088–1344 | night A1 ↔ hall A2 | two-way: a drop; back up the split's kick faces |
| `knot` | 2624–2880 | night B1 → hall B2 | a bark floor panel in the trunk's back, cut from above. In the hall it's a ceiling hole: a shortcut down, never up |
| `chimney` | 5056–5312 | hall C2 ↔ night C1 | a silk curtain held by the grille lamp (§5, Gust). Up the root plate's chimney to the crest |
| `hole` | 576–832 | hall A2 → roots A3 | one-way: rotten floor into the dark |
| `stair` | 1408–1664 | roots A3 ↔ hall A2 | the moonmoss stair (needs Kindle; a `keep` wick makes it permanent). From the hall it's a second drop |
| `seal` | 2816–3072 | hall B2 → roots B3 | the root-silk seal: a gate on flag `seal-open` (puzzle 2). It drops her into the arena |
| `shaft` | 4480–4736 | hall C2 ↔ roots C3 | a gate on flag `shaft-open` (puzzle 3). A trigger under it sets the flag from below, so after the boss she can come up from C3 |
| east door | roots x 3840 | B3 ↔ C3 | the arena's east lock door: shut until `gloam-down`, then a shortcut |
| `door` cache | night B1 x 3560 | B1 ↔ lr-cache | a door behind a gate on flag `answer` (the deep secret) |
| `valley` | night east edge | C1 → (end) | the level's end |

### The loops
- **A1 → A2 → B2 → (B1 by the night's top) → knot → B2:** the first loop, open from minute 1.
- **B2 → seal → B3 → east door → C3 → shaft → C2 → B2:** the boss loop.
- **C2 → chimney → C1 → drop west → B1 → knot → B2:** the exit loop.

**Patches** (rests; no predator in sight of one): A1 by the spawn, B2 the hub, A3 at the Kindle hollow, C1 at the
vista. The boss's retry patch is B2, right above the seal: re-form, drop, fight again in ~5 s.

### Geography (so it hangs together)
- **The giant fell west to east.** Its broken crown lies on the ridge (A1). Its trunk is so great that its back
  (B1) is a road above the canopy, and its hollow (the hall) is two screens long inside it. At the east end its root
  plate stands upright like a cliff (C), with its crest above everything (C1).
- **Under the trunk:** the drowned roots (A3) under the crown end, the spider's hollow (B3) under the hall's middle,
  and the cistern (C3), the water-filled crater the plate tore out.
- **Sightlines:**
  - From the ridge at the spawn: the trunk's back runs away east toward the root plate's dark crest against the moon.
    That's the end, seen first.
  - From the crow's nest (A1, high): the answering cap glows faintly on the trunk's back under the moon.
  - From the hall: the split's moonlight at the west end.
  - From the cistern: the boss's east door, seen before it opens.

---

## 3. The kit

### What Wing starts with
Run, jump, **double jump**, **glide**, **wall jump** (one face is enough to climb), the blade (round 7's three-step
chain, pogo, down cut), and **the fling** (Lamp near a burning flame: the slowed aim, the launch, embers). Also
**Mend** (below).

`abilities: ["glide", "wallJump", "doubleJump"]` on every room (the fling and the blade are always on).

**No dash.** It would make every gap and every guarded crossing trivial, and the level's locks are light locks, not
distance locks. Dash stays a later region's tool.

### The light economy: glow
Glow is the light she carries. **Hits charge it; it heals her and it opens the world.**

| | sparks | why |
|---|---|---|
| max | 18 (6 pips of 3) | three kindles or three mends at most: you can't stockpile your way past a fight |
| a blade hit on a creature | +3 (one pip) | every exchange pays at once (HK's soul) |
| a kill | +3 more | fodder pays well, so fights are worth seeking |
| a warm lamp out (cut, fling or gust) | +6 | rescue pays |
| a glint | +1 | the grove's collectible flow, now with a purpose |
| **Mend** (hold Lamp grounded, still, nothing in reach, 36 f) | −6 → +1 health | HK's focus: a choice between healing and opening |
| **Kindle** a moonwick | −6 | a door costs a fight |
| a fade | all of it drops where she fell, as a glint cluster | the grove's dropped clusters (`dropGlints`): walk back for it |

The glow vessel (a secret, §5) raises max to 24.

**Sim:**
- `player.glow` (integer sparks) and `tuning.glow {max, hit, kill, snuff, glint, mendCost, mendFrames, kindleCost}`.
- Events `glowGain {n, from}`, `glowSpend {n, for}`, `mendStart`, `mend`, `mendBreak`.
- Mend is broken by any hurt or any input but Lamp. The glow is spent only when the mend lands.
- Glints in these rooms are `scene.pickups` as in the grove. Each one is +1 spark, they're saved as taken
  (`save.taken`), and they count for completion. Size M.

**Glow pods** are lumen pods with `regrow` (frames, default 1200 = 20 s): a burst pod's bud re-forms. Each hit
spills glints (sparks) as pods do today. They're the renewable fuel, so no light puzzle can ever strand her. The
solver checks that every kindle has renewable fuel in its chamber (§9). Size S.

### Controls on one button
The Lamp button (V / I, pad Y / LB) picks the first that applies:
1. a burning flame in reach → **fling** (warm lamp or burning moonwick);
2. a cold moonwick in reach, Kindle owned, glow ≥ 6 → **kindle**;
3. nothing in reach, held ≥ 12 f, grounded → **mend**;
4. nothing in reach, a tap, Gust owned → **gust**.

A kindle with too little glow does nothing but make the bud flicker dimly once (`kindleRefuse`). There is no text.

### Tool 1: Kindle
**Found at about 10 minutes, in the Kindle hollow at the far west of A3.** It's a moonlit hollow (`hollows`, or a
glade granting the new ability id `kindle`) under a crack where one thread of moonlight reaches the drowned roots.
The pickup line is one item line, the only text: *"Kindle: give your light to a moonwick."*

**The moonwick** (`lures[].kind: "moonwick"`, a new row) is a pale glass bud, cold until she kindles it. The
firefly collected them but could never light them: they only take moonlight, and Wing's light is the moon's.

| knob | value | what |
|---|---|---|
| `fling` | 110 | a burning moonwick is a fling anchor like a wick |
| `burn` | 720 f (12 s) | then it gutters out |
| `gutter` | 120 f | the last 2 s it flickers (render and audio): a readable clock |
| `light` | 420 px | its silver light: reveals moonmoss, makes flyers shy |
| `keep` (spawn field) | bool | once kindled it burns for good (saved in `save.opened`): route lights |

- **It never embers.** Flinging from a burning moonwick leaves it burning. It's the reusable anchor, against the
  warm lamps' one use.
- **The blade passes through it.** You can't snuff your own light.
- **Silver light is not a false light.** `litAt` ignores moonwicks, so creatures never see her by them.
- **Wick sets** (`wickSets: [{id, wicks: [ids], sets: flag}]`): when every wick of a set burns on the same frame, the
  flag is set (saved), and those wicks become `keep`. Event `wickSet`.
- Events: `lureKindle`, `lureGutter`, `lureFan` (Gust).

Size M.

**Moonmoss** (`moonmoss: [{id, x, y, w, h, oneWay?}]`) is pale lichen ledges:
- They are solid (or one-way) only while their centre is within 420 px of a burning moonwick in the room.
- A piece that would appear inside her body waits until she is clear.
- One whose light gutters vanishes, and she falls.
- Unlit, render draws them as faint lichen scars, honest but easy to miss.
- Added to the solids like gates (`withShortcuts`), cached by the set of burning wicks. Events `mossOn` / `mossOff`.

Size M.

**Silver light makes flyers shy.**
- `player.moonlit` 0..1 is set the same way as `player.lit`, from burning moonwicks.
- A hawker or a dangler never *starts* a strike or a drop at her while she's moonlit, or at a point inside silver
  light. It holds its perch (`enemyShy`). A strike already committed finishes, so it stays fair.
- Beetles don't care: they're ground creatures, and they're how she gets fuel.

Size S.

**How Kindle reopens what she has seen.** The cold buds are visible from minute 1:
- **A1 `M-a1`**, beside the spawn, on a stone. Kindled, moss climbs the crown's dead limbs to **the crow's nest**
  (§5).
- **B2 `M-s1` / `M-s2`** flank the seal. A lock that reads as a lock from the first visit.
- **C2 `M-c1` / `M-c2`** flank the thorn shaft. The guarded set.
- **C2 `M-g1..3`** in the gallery's alcoves. Three of them, too far apart to light by hand within 12 s, so this
  waits for Gust.
- **The roots' `M-a3` / `M-a3b`.** Kindle's first use, the way out of the pit.

### Tool 2: Gust (the mini-boss's reward)
**Gust is a wingbeat: a puff of air that snuffs at range.** `core.md` already planned Gust as the wood boss's reward;
this is the same verb.
- **Input:** Lamp tapped (released within 12 f), nothing in reach.
- **The puff:** from her centre along the held 8-way direction (facing if none), 16 px/f for 30 f (480 px), a
  64 × 64 box, stopped by solids. Cooldown 30 f. Free: glow is for kindles and mends.

| it meets | effect |
|---|---|
| a warm lamp (not `great`) | snuffs it (`lureSnuff how: "gust"`: moths, +6 glow, its `sets` flag) |
| a burning moonwick | **fans** it: its burn starts over (`lureFan`). Keeping a set alive from afar |
| a hawker (tell, dive or stall) | knocked out of it and stalled 60 f, open |
| a hanging dangler | swung 200 px along the gust (stretch: its body breaks plain bark it swings into) |
| a burrback, a juvenile | shoved 12 px/f, no damage |
| silk strands | nothing |

- **Gust down in the air** is a small hop (vy −9), once an airtime, refilled on landing or a pogo. This is movement
  tech. Nothing on the main path needs it; the crow's nest's last ledge and the cache's high lamps reward it.
- **Lamp-held gates** (`lures[].sets: flag`): a warm lamp whose snuff sets a flag. The **grille lamp** in C2 hangs
  in a thorn crown that neither blade nor fling can reach (it's ≥ 200 px inside the thorns; fling reach is 110). Its
  light holds the silk curtain over the chimney. From minute 6 it is a lock that reads, and Gust is the key.
- The ability id is `gust`, granted by a glade where the boss's moon-hole light lands (§6).

Size M.

### Upgrades in the level (already built, except the vessel)
- **Long Breath** (H1): aim ×2.
- **Sharp Wings** (H2): her fling launch cuts the creatures and silk it meets.
- **Glow vessel** (the gallery vault): max 24. New: a `tuning.upgrades` row.
- **Bright Kindle** (the cache): a kindle costs 3. New: a row.
- **Moon-drops** (the ember run, H3): +1 max health each, 4 → 6. A hollow granting `moonDrop:<id>`; `step` adds one
  light per owned drop, like the moth milestones. S.

---

## 4. Density, screen by screen

**The rule.** From any standing spot on the main path, at least 3 different *kinds* of thing are in view, and at
least 2 are within 600 px. The kinds:
- creature;
- collectible (glint line, pod);
- breakable (bark, pod leaves);
- lamp or moonwick;
- a secret's tell;
- a route choice.

**Quiet on purpose**, for contrast: the first half of A3, the vista on C1, the patch alcoves, and the arena before
the lock.

Positions are in room coordinates (x, y), y down.

**A1 The Crown Fall** (night, x 0–1920). Spawn on the ridge (520, 1300). The moon is high in the east over the plate.
- **Creatures:** juvenile `J-a1` among the ferns at 1250. The first exchange: two cuts, +9 glow.
- **Collect:** 6 glints along a fallen limb in a jump's arc. Glow pod `P-a1` in a fern clump at 820: cutting the
  ferns spills it.
- **Break:** the hollow log's rotten bark seal, west (180, 1240).
- **Lamps:** warm `L-a1` hangs from a dead limb (1480, 980) over a thorn gully (1300–1650). The first fling:
  jump into reach, aim up-right, land on the trunk's crown end (1760, 1080). Cold `M-a1` on a stone at 900.
- **Secrets:** H1 (the log). The crow's nest (M-a1's moss, later).
- **Route choice:**
  - drop into the split (1088–1344) and the hall;
  - fling the gully up to the trunk's back and B1;
  - the wrong way west to the log.

**B1 The Trunk's Back** (night, x 1920–3840). The trunk's moss-backed top rolls at y ~880 over a sea of crowns,
with the moon above. Snapped branch stubs stand up from it.
- **Creatures:** hawker `H-b1` home over the stub (3150, 420), guarding `L-b1a`. It hunts flights.
- **Collect:** 8 glints over the trunk's rolling hops. A pod in a moss tuft (2300).
- **Break:** the knot panel at 2624–2880 (bark floor, 3 down cuts). The shortcut into the hub.
- **Lamps:**
  - the ember run's 5 warm lamps up the stub, `L-er1..5`, one of them swinging;
  - `L-b1a` and `L-b1b` inside a bramble crown on the stub's west shoulder, Gust only;
  - `L-b1c` low over the trunk, an easy fling.
- **Secrets:** the answering cap `C-b1` (3420, 880), a pale bell-cap under the moon. The sealed knot at 3560 (the
  cache door).
- **Optional hard:** the ember run (§5).
- **Route choice:** the knot down, the stub up, east to the plate's face. The face is honestly sheer: thorny roots,
  `kick: false`, and it reads as a wall.

**C1 The Root Plate** (night, x 3840–5760). The crest at y ~420, reached only by the chimney.
- **Quiet on purpose:**
  - the patch;
  - the last sign S4;
  - the view east over the valley's lamp field to the mountain under the moon;
  - a stream of every moth she freed, going east.
- A last glint arc on the crest. A drop west back onto B1 (glide).

**A2 The Split** (hall, x 0–1920). Moonlight pours down the split at 1088–1344 into amber lamplight. Moths circle
every lamp.
- **Creatures:**
  - juveniles `J-a2a` / `J-a2b` on the floor (fuel);
  - dangler `D-a2` over the cut spot under `L-a2c` (it hunts the stop).
- **Collect:** 10 glints. Pods `P-a2a`, `P-a2b` in leaf clumps on bracket fungi.
- **Break:** a bark pocket at 1720 (a glint hoard of 12: a surface find).
- **Lamps:**
  - `L-a2a`, `L-a2b` over the floor hole, a two-lamp chain;
  - `L-a2c`, `L-a2d`, `L-a2e`, a three-lamp chain up to the moth-stone shelf (300, 450). One-way forward, then a
    root rope drops back: v3's permanence rule.
- **Secrets:** the moth-stone (the map). The map reveals the hollows (§5).
- **Route choice:** the shelf chain, the hole down (A3), east into the hub, back up the split.

**B2 The Lamp Hall: the hub** (hall, x 1920–3840). The firefly's grand display: rows of warm lamps under the trunk's
inner vault.
- **Creatures:**
  - dangler `D-b2` over the `M-s2` shelf (where she stops to kindle);
  - two juveniles at the west mouth.
- **Collect:** 8 glints. Two pods.
- **Break:** the leaf curtains on the fungus shelves (pods).
- **Lamps:**
  - `L-b2a..f`, six warm lamps in two rows: flight paths across the vault. Every one put out darkens the hall, so
    the room shows her progress;
  - cold `M-s1` (2300, 1200, on a root knee) and `M-s2` (3450, 600, on a high shelf fungus) flank the seal (2816–3072).
- **Secrets:** H2 (the loft above the patch). The knot hole in the vault (opened from above).
- **Route choice:** five ways (west, east, the seal down, the knot, the loft).
- **The patch** sits in a quiet alcove at (2560, 1240), out of the danglers' sight.

**C2 The Wick Gallery** (hall, x 3840–5760). The hollow's root end, where the trunk meets the plate's inner face. It's
tall, and the plate's alcoves hold cold buds.
- **Creatures:**
  - hawker `H-c2` over the thorn shaft (4608, 700);
  - a juvenile pair on the gallery floor;
  - dangler `D-c2` under the vault ledge.
- **Collect:** 10 glints. Three pods (one by the shaft, for the guarded set's fuel).
- **Break:** an alcove bark wall at the top of a warm-lamp chain (`L-c2a..c`): a glint hoard.
- **Lamps:**
  - cold `M-c1` / `M-c2` on the shaft's two lips;
  - `M-g1` / `M-g2` / `M-g3` (the vault set);
  - the grille lamp `L-grille` in its thorn crown, holding the curtain over the chimney (5056–5312).
- **Secrets:** the vault (Gust).
- **Route choice:** the shaft down (puzzle 3), the chimney up (Gust), the alcove chain, back west.

**A3 The Drowned Roots** (roots, x 0–1920). She falls through the hole into black water to the shins (the floor at
1350, the pool shader). Glowworm threads hang from the roots; her own aura is the light.
- **The first half is quiet:** no creature, no lamp. A minute of drip and dark. Sign S2 glows in the black at 1100.
- **The second half:**
  - two juveniles by the hollow (fuel);
  - three glow pods in root knots (regrowing fuel);
  - the Kindle hollow (200, 1250) under the moon crack;
  - patch;
  - `M-a3` at the pit's foot;
  - `M-a3b` (`keep`) halfway up the wet wall;
  - the moss stair to the stair exit (1408–1664).
- The walls are wet, glistening and `kick: false`. Without Kindle there's no way up, and the tool is at the bottom.

**B3 The Gloam** (roots, x 1920–3840). The arena (§6).

**C3 The Cistern** (roots, x 3840–5760). A crater of still water under the plate, hung with silk.
- **Creatures:**
  - burrback `B-c3` (3 hp, `senses: always`) patrolling the cistern's shore;
  - danglers `D-c3a` / `D-c3b` (`senses: always`: there are no warm lamps down here).
- **Collect:** 8 glints. Two pods.
- **Break:** the heartwood wall (H3) at 5480.
- **Lamps:** none. Moonmoss lit by the shaft set's `keep` wicks climbs the first part of the root column. Below that
  it's kick faces.
- **Secrets:** H3.
- **Route choice:** up the root column to the shaft, H3, the boss's east door (shut until the win).

**The Cache** (lr-cache). The deep secret's room (§5).

---

## 5. Puzzles and secrets

### Five puzzles
Each one is discrete: switches are flags, light is a set of burning wicks with timers, and the creatures follow fixed
rules. The solver (§9) checks each one symbolically, and a scripted run proves it in the real sim.

| # | where | teaches | the setup | the solution | state the solver tracks |
|---|---|---|---|---|---|
| 1 | **First Light** (A3) | kindle, reveal, the timer, glow costs a fight | The hollow gives Kindle. The only way out is 1000 px up a wet wall | Kindle `M-a3` (−6). Moss appears within 420 px. Climb in 12 s to the ledge by `M-a3b`, kindle it (−6, `keep`). The upper stair appears for good. Fuel: the juveniles and three regrowing pods | wicks burning and time left; moss on; glow ≥ 6 at each kindle; fuel renewable in the chamber |
| 2 | **The Seal** (B2) | sets; a burning moonwick is a reusable anchor | `M-s1` low west and `M-s2` high east, 1150 px apart. The seal opens when both burn | Kindle `M-s1`, fling from it (it keeps burning) up-right to the fungus shelves, reach `M-s2` within 12 s and kindle it. `seal-open`. **`D-b2` hunts the stop at `M-s2`:** kill it first (+6 glow) or kindle and go | set; time; the dangler's state at the stop |
| 3 | **The Guarded Set** (C2) | silver light as a shield; flinging over thorns | `M-c1` / `M-c2` on the two lips of a 700 px thorn shaft, with `H-c2` hunting the air between | Kindle `M-c1`: the hawker can't strike inside its light. Fling from it across the thorns, landing within 420 px of `M-c2` where it can't strike either, then kindle `M-c2`. `shaft-open`; both `keep`; moss down the shaft. A mistimed fling outside silver light meets the hawker | set; the hawker's shy rule; the fling arc's landing |
| 4 | **The Ram** (C3, H3) | creatures as tools; the blade has limits | A wall of heartwood bark, not rotten (the blade clangs off, and so does a throw-cut). The burrback patrols the shore | Stand on the root step past the wall's face (feet 24–240 px up, within its strike range). It braces and rams the face (the built `stepRamPx` / `wallFlip` rule). **New: a ram into heartwood breaks it** (`barkBreak by: "ram"`). It lies belly-up, open: a free kill | the beetle's ram line; the step's height |
| 5 | **The Vault** (C2, after Gust) | Gust fans a moonwick; three-light timing | `M-g1..3` across the gallery, ~16 s apart by the best route, and they burn 12 s | Kindle `M-g1`, go, and on the way **gust `M-g1` from range** to restart its burn; kindle `M-g2`, fan again, kindle `M-g3`. The vault's silk drops: **the glow vessel**. Needs 18 glow (or a mid-way pod) | three timers; fan events; glow |

**The boss is a sixth puzzle** that combines them: kindle to expose, silver as a shield, flings off moonwicks, and a
set (§6).

### Three layers of secrets
**Nothing optional pays moths alone** (v3's rule). Every hidden thing changes the play, the map or the story.

**Layer 1, surface finds.** In plain sight but off the line:

| find | where | how | pays |
|---|---|---|---|
| glint lines (~100) | everywhere, in jump and fling arcs | the flow | glow; completion |
| glow pods (~16) | leaf clumps, root knots | cut them | glow, renewable |
| warm lamps (~30) | everywhere | fling or cut | moths (the rescue count), glow |
| the moth-stone | A2's shelf, by a three-lamp chain | look up | **the map** |
| bark hoards (2) | A2's pocket, C2's alcove | cut the wall at the top of a chain | 12 glints each |
| the crow's nest | A1, up the crown's dead limbs by `M-a1`'s moss (the last ledge wants a gust-hop or a perfect double jump) | kindle the bud by the spawn, after Kindle | a 20-glint hoard, and **the sightline to the cap** |
| the ember run | B1's stub | it's visible from the trunk's back | a **moon-drop** (§5, optional hard) |

**Layer 2, hidden rooms with honest, subtle tells.** Each one has at least two tells. None is a glow trail, a
moonlight whisper or a glyph; those were cut for being signposts.

| secret | where | the tells | pays |
|---|---|---|---|
| **H1, the hollow log** | A1, west of the spawn: a rotten-bark seal in the broken crown's hollow limb | (1) Freed moths always fly toward real moonlight. Those from `L-a1` fly *west* into the log, because its far end has a crack to the sky. (2) Its seal is rotten bark, the same look as every breakable in the game. (3) The moth-stone's map shows a hollow there | **Long Breath** + sign S1 (lore) |
| **H2, the moss loft** | B2, a recess high in the vault over the patch, behind a root curtain (a cover) | (1) Faint lichen scars on the dark vault: unlit moonmoss. (2) Puzzle 2 forces `M-s2` to burn, and in its light the loft's moss steps appear. A player who looks up sees them. (3) Moths freed in the hall gather at the recess (moonlight leaks there). (4) The map shows the hollow | **Sharp Wings** |
| **H3, behind the heartwood** | C3, the east wall | (1) The blade clangs off it with a different spark and sound: it's not rotten bark. (2) Fresh ram scars and splinters at beetle height on its face. (3) The burrback's patrol ends at it, and it bumps it now and then (dust falls). (4) The map shows a chamber | **a moon-drop** + **sign S3**: a stone carved with the cap's shape, which flashes **the cap's rhythm** |

**Layer 3, the deep secret: the Answer.** Fireflies flash to find each other. The cap on the trunk's back answers in
the firefly's language. It answers only in the dark, and only to the right phrase.

**What she has to put together across the level:**
1. **The phrase.** S3 (behind the heartwood) flashes `-..-` (long gap, short, short, long) and shows the cap carved
   above the flashes. S1, S2 and S4 flash other phrases (lore: the firefly calling, the moths' road, the empty sky),
   so the phrase is knowledge that has to be found, as in Tunic's manual.
2. **The dark.**
   - The cap (`bells: [{id, x, y, rhythm: "-..-", sets: "answer", dark: true}]`) counts strikes only while no warm
     lamp burns within 1200 px. Otherwise it chimes muffled and its gills stay dark: an honest "something is missing".
   - The lamps in range are `L-b1c` (cut it), the ember run's five (spent by doing the run, or cut on the way) and the
     bramble pair `L-b1a` / `L-b1b`, which only Gust reaches.
   - Putting out `L-b1a` also sends its guard, the hawker, away.
   - So the Answer is post-Gust by construction.
3. **The strike.** In the dark, hit the cap (any cut, or a pogo):
   - a short gap is 24 f or less;
   - a long gap is 36–90 f;
   - longer resets the count.

   Each strike lights one ring of its gills, so she can see her count. Five strikes with the gaps long, short, short,
   long → `bellAnswer`, flag `answer`. The knot at 3560 opens (a gate over the cache door).

Sim: `bells` is a slash target (cuts and pogos; pogo bounces off it), with events `bellHit {gap, n}`, `bellDull`,
`bellAnswer`. Size S.

**The Cache** (lr-cache, through the knot) is the firefly's first workshop:
- glow-caps strung but never hung;
- a ring of cold moonwicks in its flash pattern;
- in the middle, a lamp shaped like a firefly: the marsh's reveal, foreshadowed for those who look.

For the player it's a **fling playground**: moonwicks everywhere and no thorns, pure flow. Kindle the ring and every
wick burns at once (a set), and the room plays the firefly's phrase back. The firefly-lamp's jar holds the level's
biggest moth release (80). On the top shelf: **Bright Kindle**.

No hold. Nothing in the level tells you it exists.

**The map as a tell.** The moth-stone draws Lanternroot's true shape, *including* the hollows she hasn't found (H1,
H2, H3 and the cache's knot). A map-reader sees rock that isn't solid. That's an honest tell, and the map is earned
(HK's Cornifer): before the stone, Tab shows only visited chambers. If v3's withheld map isn't built yet, keep the
free map and just let the stone draw the hollows. Render, S.

### The optional hard part: the ember run (B1)
White-Palace-lite. No enemies but the hawker. A precise climb up the snapped stub over thorn faces, with five warm
lamps:
1. `L-er1`, `L-er2`: a generous two-lamp chain.
2. `L-er3`: an angle change mid-chain.
3. `L-er4` swings (`swing`), so the launch is timed.
4. `L-er5`: a fling into a glide across the stub's broken top to the crown, past the hawker's lane.

The existing embers rule is the retry: thorns or a fall relight every ember, and she's put back on the trunk's back
in about a second. The reward is a **moon-drop** on the broken crown.

Expected: 2–4 min for a skilled player, 10+ for an average one, and never required. It's visible from the first time
she walks the trunk.

---

## 6. Combat

### Creatures as fights and as puzzle pieces
All kinds are reused; the new behaviour hooks are marked.

| creature | fight | puzzle piece |
|---|---|---|
| **Juvenile beetle** (2 hp) | fodder: two cuts, +9 glow | **fuel**: wherever a kindle is needed, juveniles live nearby |
| **Burrback** (3 hp, ram) | the ram, the brace, the pogo (round 7) | **bait into walls**: its ram breaks heartwood (new rule) |
| **Dangler** (2 hp) | drops where she stops; cut its silk | it hunts **the kindle spot** (she stops to kindle). Silver light makes it shy (new). Gust swings it (stretch) |
| **Hawker** (3 hp) | strikes flights and stops | silver light makes it shy (new). Gust knocks it out of a dive. It guards lamps, and leaves when its lamp goes out |
| **Spiderlings** (the boss's, dangler kind, 1 hp, `respawn`) | pests on threads | **fuel inside the boss fight** |

Kinds unchanged. In the roots (no warm lamps), creatures that must see her are `senses: "always"`.

### What makes the attack satisfying
Round 7 gave the attack its rhythm and its hold. This level gives every cut a **purpose** and a **picture**.
1. **Every hit feeds her.** Sparks of the struck creature's light streak from the contact into Wing in the grove's
   glint flight (18 f, staggered). Her aura brightens one step per pip. You *see* the fight paying for the next door.
2. **The creature is lit by the blow:** a one-frame rim of light on the struck side. Plus the round-7 shove, so it's
   visibly batted.
3. **Kills pop:** the kill hitstop (+6), a burst of the creature's colour, a puff of the glints it was worth.
4. **A full meter has a sound:** a soft rising chime per spark, pitched by fill. The last pip rings like a bell, so
   "I can kindle now" is heard as much as seen.
5. **Sound, code-generated and muted by default** (M toggles; `docs/audio-direction.md`). On top of the existing pass:
   - glow chime;
   - kindle bloom (a slow glass swell);
   - moss shimmer;
   - gutter tick;
   - gust whump;
   - the cap's chime (pitched per ring, muffled when dull);
   - the signs' phrases as soft chimes, so the rhythm can be learned by ear too;
   - the hall's moth hum (it thins as lamps go out);
   - the boss's tells.

### The mini-boss: the Gloamweaver (B3)
**The fiction.** Predators gather where moths circle. This orb-weaver lives in the dark under the hall. It hangs the
firefly's warm lamps in its web as lures, and the moths that come down through the seal are its food. Its great lamp,
**the Gloam lamp**, sits at the web's hub. It's *not too hard but a good intro*: Matt liked the Weaver for exactly
that, and this is built on its code.

**The arena:**
- roots x 1920–3840, a locked zone y 300–1380, at zoom 1;
- the floor at 1300, with a skin of water;
- four ledges, each with a cold moonwick: `M-w1` west low (2050, 1050), `M-w2` west high (2150, 650), `M-w3` east
  high (3610, 650), `M-w4` east low (3710, 1050);
- the orb web, hub at (2880, 620), radius 520, `orb` data;
- the web strands **don't grab** (new `grab: false` on the web kind: the player keeps control);
- moonmoss ledges ring the hub at r ~300 and appear when the high wicks burn;
- two regrowing pods in root knots;
- the moon-hole: a bark plug in the arena's ceiling over the hub.

**Entry and retries.**
- She drops through the seal: HK's fall into False Knight's room, with control kept. Lock doors close the seal's
  mouth and the east door.
- The name card plays while she moves.
- A fade re-forms her at the hub patch right above. She drops in again, about 5 s from death to fighting.
- A retry starts with P1 half done (`retryOut`).

| phase | exam | what it does | how she wins it |
|---|---|---|---|
| **P1 Find it** | kindle to expose; read where it goes | It hunts on the web in the dark. Only its eyes and its lamp's glint on the silk show. Its body is **shielded in the dark** (`undying` + the blade passes). It walks the strands toward the sector over her (the Weaver's strand pathing) but **won't enter silver light** (lit strands cost ∞). It drops spiderlings on her | Kindle the wick nearest it. If it's within 420 px at the kindle frame, or cornered (every strand it could take lit), it's **exposed**: it falls to the floor flipped, open 150 f (4 cuts), then climbs its thread back. Two exposures (one on a retry). Spiderlings pay for the kindles |
| **P2 The drops** | read the arc; light is a shield | The Weaver's P2: three pivots (2300, 3460, 2880), thread drops and end-to-end swings, tells unchanged (arc + floor band 45 f, drop 18 f, swing 60 f). **Its swing stops at the edge of any silver light**: a burning wick near her is a safe pocket, and lit wicks shorten its arcs | Read the arc and stand in silver light, or cut it while it hangs winded (90 f). A cut through the thread drops it stunned 120 f. 6 cuts. With Sharp Wings, a fling through it cuts too |
| **P3 The Gloam lamp** | flinging off moonwicks + a set | It climbs to the hub and wraps the Gloam lamp (`great`, fling 0: no anchor). Its glare is armour. The hub hangs 680 px over the floor. Spiderlings drop every 4 s | Either (a) **light `M-w2` and `M-w3` together** (a set): the moon-hole plug falls, moonlight floods the arena, it drops exposed for its last 3 cuts; or (b) fling up by the moss ledges and the high wicks and **throw-cut** it off the lamp (2 throw-cuts), then 3 cuts on the floor |

**The end, with no hold.**
- The killing cut gets the kill hitstop and the death beat.
- The Gloam lamp gutters out, and its 60 moths spiral up through the moon-hole's shaft.
- Where the moonlight lands on the arena floor is a glade (`ability: "gust"`). She walks into it, and the moths'
  wingbeat is the gift.
- The east door opens (`gloam-down`): the shortcut to the cistern.

**Numbers to aim for** (`tools/playtest/weaver-run.ts`, adapted): a perfect bot wins in ~60 s with 0 hits.
First-timer hands (react 30 f) average 2–3 hits, and most win within 2 tries. A masher with no kindles never
exposes it, and that's the point: the tool is the key.

**Sim.** A `gloamweaver` kind on the Weaver's code: framework, phase table, cues, retry, P2 drops. New pieces:
- the dark shield and the exposure rule;
- strand costs in silver light;
- the arc clipped by silver;
- spiderling respawn (`enemies[].respawn` frames, a cap alive);
- the P3 set → moon-hole flag;
- `web.grab: false`.

Size L.

---

## 7. The arc

| min | where | beat | intensity |
|---|---|---|---|
| 0:00 | A1 | Silver quiet on the ridge. The trunk runs away east to the plate's crest against the moon. A juvenile, a glint arc, the first fling over the gully | 2 → 4 |
| 1:30 | A2 | **Down the split into amber.** Lamps in rows, moths by the hundred, danglers, juveniles. The first chain, the first snuff burst | 6 |
| 4:00 | B2 | The hub: the patch, the seal's two cold buds (a lock), the vault of lamps. Free a few and the hall darkens | 3 → 6 |
| 6:00 | C2 / B1 | Either the gallery (the hawker in the air, the thorn shaft, the grille lamp: two more locks) or up onto the trunk's back (the ember run seen, the cap chiming dull, the knot back down) | 5–7 |
| 9:00 | A3 | **The hole into black water.** A minute of drip and dark, her aura the only light, sign S2 glowing | 1–2 |
| 10:30 | A3 | The Kindle hollow under a thread of moonlight. **First Light**: silver blooms and moss steps climb the black | 3 → 5 |
| 12:00 | the web | The seal (puzzle 2), maybe the loft above it (H2), the guarded set (puzzle 3), the cistern's burrback and danglers, the ram (H3) | 5–8 |
| 18:00 | B3 | **The Gloam.** 60–120 s a try, 1–3 tries | 9–10 |
| 22:00 | B3 | The lamp dies, the moon-hole opens, the moths pour up the light. Gust | 1 |
| 23:00 | the web again | Gust reopens the curtain, the brambles, the vault. Maybe the Answer and the cache | 4–7 |
| 28:00 | C1 | **Up the chimney to the crest.** The valley's lamp field under the moon, the mountain far off, every freed moth streaming east | 1 |

- **Main path:** ~20–25 min for a first-timer.
- **Everything:** ~40 min (the ember run, H1–H3, the nest, the vault, the Answer, the cache).

**The best moments.**
1. **The split.** From silver quiet into a hall of warm lamps and circling moths: the first contrast hit. Then the
   first fling across it puts one out, and its moths burst free behind her.
2. **First Light.** In total black she gives her light to a glass bud. Silver floods out, and lichen ledges she never
   saw climb out of the dark: *the dark has a road*. Twelve seconds to climb it.
3. **The Gloam lamp dies.** The moon-hole opens and hundreds of moths spiral up the shaft of moonlight. She steps
   into it and learns their wingbeat.
4. *(For the few.)* **The Answer.** On the dark trunk under the moon she strikes the cap long, short, short, long.
   The rings of its gills light one by one, and the old knot opens.

---

## 8. Art

**Painted from the first build.** Each layer is one look, and light is the readable layer: platform tops read by
their lit rims under the moon, by lamp pools in the hall, and by moonmoss, glowworm beads, water glints and her own
aura in the roots. The bar is `docs/art-direction.md` and the wood-hatch look target.

### Reuse
| layer | reuse | from |
|---|---|---|
| night (lr-night) | the **wood kit** whole: canopy-height backgrounds (`bg-wood.ts`: crown seas, firs, giants, `layerY`), the moon with a face (`SKY.wood`), the wood's grade, air and foreground. `pf-branch.ts` paints the crown's dead limbs and **the trunk's back as a stretch**, with its growth and live moonlit rim (`pf-rim.ts`) | `memory/background-layers.md` "The wood", `memory/playfield.md` "The wood" |
| hall (lr-hall) | the bake pipeline (compose → bake → atmosphere shader, `LayerView`); `paintRock`, `limb()`; the grove's **bracket fungus island** (island 3) for shelves; glow plants; `MistFill` mist pools; point lights (≤ 12 on screen) and the light mask; **the swarm's instanced moths** (`src/render/swarm/`) for the clouds circling each lamp | grove playfield, post-and-air, swarm |
| roots (lr-roots) | **the pool shader** (`pf-water.ts`: surface, caustics, ripples, basin) for the drowned roots and the cistern; `paintRock`, `limb()` roots; the air layer's shafts for the moon cracks; the grove's cyan glow caps (sparse) | grove playfield, air |
| all | glints and pods (one-mesh renderer, bud holder), the HUD lanterns, the fling's aim UI (7d8800c), the attack's crescent / sparks / slash mark (a0d6421), the burrback and lampwing (hawker) art, the dropped-glint cluster | pickups, enemies-render, feel |

### New painting
| piece | what | size |
|---|---|---|
| **The lanternroot kit** | `art.kit: "lanternroot"`, `art.band: "night" \| "hall" \| "roots" \| "cache"` in `setRoomLook`. Decouple `paintTerrain`'s Grove-only data (`FIGHT_SPOTS`, landmarks) into `marks.calm` / `marks.landmarks` so the ground, strata, banks, rocks and plants paint any room | M |
| **The hall's inner bark** (background plan) | concentric ring grain and rotten fibre falling away into dark; cracks with silver moonlight; silk threads with trapped moths; warm light-map pools under every lamp row. The vault reads as *inside a tree* | L |
| **The roots' dark** (background plan) | roots in near-black parallax, wet highlights, **glowworm threads**: instanced silk with glowing beads, swaying with `wind()` (`docs/research/technique-library.md`, Animal Well) | M |
| **The great log** | `pf-branch` limbs top out at ~122 px thick; the trunk's back is a stretch hundreds of px thick: a girth variant with plates of bark, a moss crest and a dark flank | M |
| **Warm lamps, painted** | the firefly's seed-pod lamps (Physalis housings, `look-and-sound.md`), hung on silk or root threads. Burning, the ember (smoulder + smoke), out (husk). Moths circling | M |
| **Moonwicks and moonmoss** | the cold glass bud (dull, a faint inner frost), kindling (a 10 f silver bloom), burning (a cool point light, 420 px pool), guttering (a 2 s flicker), the fan (a flare). Moss: faint lichen scars unlit, silver-lit ledges with a lit rim when on, a fade on off | M |
| **Her aura and glow** | Wing's light grows with her pips (radius 140 → 260 px, a cool point light; render only). The sparks' flight into her on every hit. A small HUD row of 6 pips beside the health lanterns | S |
| **The kit, painted** | painted rooms draw no kit yet (`memory/level-kit.md`). Bramble thorns; rotten bark, floor panels and **heartwood** (dense, scarred); the silk curtain and the root-silk seal; the firefly signs with their flashes; the moonlit hollows; the moon patches; the cap (a pale bell-cap with gill rings); the covers | L |
| **Creatures** | the dangler (body, thread, swing; M); the juvenile (the burrback rig at 0.6, S); the **Gloamweaver** (a big orb-weaver silhouette, eyes in the dark, web strands, the Gloam lamp; L); spiderlings (the dangler small, S) | L |
| **Gust, kindle, mend** | the puff (a crescent of air with motes in it), the kindle (her light flowing out of her into the bud), the mend (light drawn inward) | M |
| **The vista** | C1's crest: the valley's lamp field and the mountain under the moon (the wood kit's far layers, plus a lamp field) | M |

**Rules.**
- At most 8 lamps and wicks in one chamber's view; small glows (pods, glints, glowworms) go in the ambient, not as
  point lights.
- Nothing lit rises above a top (playfield rule).
- Fight spots stay plain (`marks.calm`).
- Check every chamber at 16:9, 16:10 and 21:9 (`npm run shots -- --size`).

---

## 9. What gets built, and by whom

**One round, two agents, then a review loop.**
- **Step 0, in parallel with the layout:** the new verbs land in `lab-feel` stations (greybox) for a short Matt
  check (STUDIO's "feel first in a toy room"): kindle and moss, gust and fan, mend, the glow sparks. If a verb feels
  wrong, the level swaps the piece, not the room.
- Sizes: **S** ~ a few hours of agent work, **M** ~ half a day, **L** ~ a day.

### (a) Level + sim agent (`src/sim/`, `src/scene/`, `content/`, `tools/`, tests)
| # | item | size |
|---|---|---|
| 1 | `content/worlds/proto-1.json` + `?world=` + the world check per world file | S |
| 2 | Glow: meter, gains, mend, the fade cluster; glints as glow in these rooms (saved as taken) | M |
| 3 | Pods `regrow` | S |
| 4 | Moonwick kind: kindle, burn, gutter, fling without embers, `keep`, `wickSets`; `litAt` ignores moonwicks; abilities `kindle` and `gust` | M |
| 5 | Moonmoss | M |
| 6 | Silver light: `player.moonlit`, `enemyShy` for hawker and dangler | S |
| 7 | `lures[].sets` (lamp-held gates); heartwood bark and its ram break | S |
| 8 | Bells (the cap) with the dark rule | S |
| 9 | Gust: the puff and its table of effects, the air hop, the fan | M |
| 10 | The Gloamweaver on the Weaver's code; `web.grab: false`; spiderling respawn | L |
| 11 | The rooms: lr-night, lr-hall, lr-roots, lr-cache. Geometry, every placement in §4, chamber zones with `frames` 20, marks (`calm`, `landmarks`, `covers`, `moonholes` for the moths' flight, `places` for the solver), patches, links | L |
| 12 | **The solver** (`tools/solve/proto-1.ts`, `tests/unit/proto-1-solve.test.ts`), a BFS over (place, abilities, upgrades, flags, spent lamps), with `routes` extended by `light: [wick ids]` (needs kindles, so fuel) and `lamps: [lure ids]` (consumes them). Checks: every find and secret reachable; the order holds (no seal, shaft, boss or C3 without Kindle; no curtain, brambles, vault or Answer without Gust); removing a tool makes its locks unreachable; no softlock (from every reachable state a patch is reachable, *after every lamp on the way is spent*); every kindle has renewable fuel in its chamber. **Edge proofs:** each route carries an input script (the DSL) that the real sim runs from its place (as `tests/unit/fling-drive.ts` does). The breaker pass: the persona bots plus a skip-hunter (double jump + glide + fling combos at every lock) | M |

### (b) Render/art + combat feel + sound agent (`src/render/`, `src/audio/`)
In priority order. P0 must land this round.

| # | item | size | pri |
|---|---|---|---|
| 1 | The lanternroot kit and per-room looks; night on the wood kit (with the great log) | M + M | P0 |
| 2 | The hall's inner-bark background, the roots' dark with glowworm threads, the pool reused | L + M | P0 |
| 3 | Warm lamps painted (with moth clouds from the swarm), moonwicks, moonmoss, her aura and glow pips | M + M + S | P0 |
| 4 | The kit painted (thorns, bark, heartwood, curtain, seal, patches, hollows, signs and their flashes, the cap, covers) | L | P0 |
| 5 | Creatures: dangler, juvenile, spiderlings; hawker on the lampwing art | M | P0 |
| 6 | Combat picture: sparks into her, the blow's light, the kill pop | S | P0 |
| 7 | The Gloamweaver, its web and the Gloam lamp | L | P1 |
| 8 | Gust, kindle and mend visuals; the moths' flight to `moonholes` | M | P1 |
| 9 | Sound (muted by default): glow chime, kindle, moss, gutter, gust, cap and signs, the hall's hum, the boss's tells | M | P1 |
| 10 | The vista, the cache, the map's hollows | M | P2 |

**Cut-line if the round runs short:** the cache room (keep the knot and the Answer), the vault (keep the set's
gate), the dangler's gust swing and the crow's nest slip to round 2. The boss, Kindle, Gust, the three hidden rooms
and the painted look don't slip.

**Working rules** (`STUDIO.md`):
- Each agent commits only its own paths.
- HEAD builds after every commit.
- `npm run check`, `npm run shots` (dev server on 5180) and `npm run clip` for motion.
- `memory/` gets: `glow.md` (the economy); `lures.md` updated (moonwick, moss, gust, sets); `bosses.md` (the
  Gloamweaver); `levels.md` (proto-1's rooms and the solver).

---

## 10. Review criteria for the rounds

**AI testers judge bugs and solvability. They never judge fun or how much guidance a person needs, and nothing gets
signposted because an agent got stuck** (STUDIO, "Matt judges fun").

### What the reviewers check (each a pass or fail with evidence)
1. **Solvable and in order.**
   - The solver passes.
   - Every edge proof replays in the real sim.
   - The skip-hunter finds no way to the seal, the shaft, C3, the boss, the curtain, the brambles' darkness, the
     vault or the cache before its tool.
   - Any skip it finds is a bug to fix, unless it's a fun one, in which case it goes to Matt.
2. **No softlocks.**
   - Every chamber reaches a patch with the lamps on the way spent.
   - A fade anywhere re-forms somewhere sensible.
   - No moss vanishes into a state she can't leave (stuck under a ledge, sealed in).
   - Fuel is renewable at every kindle.
3. **Density lint.**
   - From the human-like bots' main-path traces (`npm run humanplay`), sampled every 120 px: kinds in view and kinds
     within 600 px.
   - The report is a strip per room. Gaps outside the quiet list fail.
4. **Fairness.**
   - Every strike is told (dangler 30 f, hawker 36 + 6 f, beetle brace).
   - Nothing strikes from off screen while she aims (`heldUnseen`).
   - Shy creatures never commit a strike into silver light.
   - The boss's unit tests run every phase with first-timer hands.
5. **Control.** No grab anywhere (the web included), no held beat, no input lock longer than the fling's own aim
   (36 f) or a thorn's return.
6. **The look.**
   - Shots of every chamber at 16:9, 16:10 and 21:9.
   - Tops readable (the lit rim is the highest local contrast); the light layer readable in the roots.
   - No black bars; no bake edges; ≤ 12 point lights in view.
   - Frame time: p99 under 17 ms on the dev machine; a room swap's rebuild inside the crossing's 0.3 s.
   - Checked against `docs/art-direction.md` by a reviewer who didn't paint it.
7. **Secrets are honest.**
   - Each layer-2 secret has the tells listed in §5, visible in shots.
   - No glow trails, glyphs or whispers have crept back.
   - The deep secret's phrase is shown by S3 and nowhere else.
8. **Regressions.** The wood's rooms, the test grove, the labs and `window.__game` still work (`npm run check`).

### What Matt judges, after round 1 (his notes outrank everything)
1. **Is it dense the way the grove is?** At every moment, is there something to fight, collect, cut, fling or find?
2. **Do the secrets feel like discoveries?** Did H1–H3 and the Answer feel found, not given?
3. **Is light a good economy?** Do fights feel worth it because they pay for doors and healing? Is mend against
   kindle a real choice?
4. **Kindle and Gust:** fun tools, or chores?
5. **The Gloamweaver:** a good intro boss like the Weaver?
6. **The attack:** better now that every cut feeds her and lights the creature?
7. **The contrast:** do A3's quiet and the vista land against the hall and the boss?
8. **The look:** does painted Lanternroot sit next to Ori and Hollow Knight?

The round's output is his notes. Round 2 is a redesign wherever they say so: no sunk cost.
