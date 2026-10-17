# The wood, paper design: review 1

2026-10-18. An independent review of `docs/design/regions/wood.md` (draft 1), done before any room is greyboxed.
I simulated three players through it (a first-timer, an explorer and a speedrunner/breaker), checked every exit
against the world placement table, and re-ran the reach numbers against `memory/movement-controller.md` and
`memory/combat.md`. I compared it with Hollow Knight's King's Pass, Dirtmouth and Forgotten Crossroads, and with
Ori's Sunken Glades and Hollow Grove. Room ids are the doc's (R1–R12).

**Summary.** The skeleton is good. The opening is tight, the lamp verb is taught by consequence, the room budget is
honest, and all eleven room seams line up in world px (I checked every one). But on paper it does not yet pass
four of the six exit criteria that paper can judge. The four biggest problems: the hub's one-way well sits on the
walkway and breaks wall jump's ladder for half the players; the pogo is never taught but it is the only damage
source in the Weaver's last phase; R8 brings in a new creature and a new lamp kind in the same room; and the glide
gaps are measured on a trajectory the reach table doesn't describe.

---

## 1. Exit criteria: can each one pass on paper?

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | Bots finish, no softlock, the breaker skips no hard gate | **No** | Four hard gates that §10 lists can be skipped with first-run kit (§4 below): R5's lip (via W4's beat-free onto ledge M), the hub crown's far branch (via the room's west edge, which can be kicked by default), and R8's and R11's DJ ledges (wall jump + glide). The naive bot can loop forever at R2's vista lip. Postgame reachability (25 moths) depends on a "way back up" from the valley that nobody has designed yet |
| 2 | No one lost > 2 min, ≤ 60 s at the hub | **Conditional** | The pull-back table is good. The open risks are the R5 tapper (unbounded, and admitted in the doc), the R2 lip loop, and the hub well on the walkway (falling in is a commitment, not getting lost, but it reads as lost) |
| 3 | Median 35–45 min, rooms within ±30% | **No, the doc contradicts itself** | The §9 room ranges add up to 21:45–40:30, with a midpoint of about 31 min. Playing every room at its midpoint misses the region target. Either the room ranges or the region target has to move |
| 4 | Purpose tags, lock lead times, laddered abilities, introduced alone before paired | **No** | Wall jump's "≥ 8 min" lead fails for players who take the well first (about 3.5 min). R8 introduces the hawker and the lantern together. The pogo is never laddered. R4 and R6 each carry 3–4 new ideas |
| 5 | Weaver fair, 60 s first-attempt survival, 1–3 deaths, run back < 15 s | **Partial** | P1 can be survived and the run back is fine. P2's pendulum can't exist as specified (§4). Every retry replays 60–90 s of P1, so P3 deaths cost about 2.5 min each |
| 6 | Lintable rules | **Yes, with one note** | Doors open into the dark, the threat budget holds, and dead ends pay. Note: W4's field covers R5's required glide line (§4) |
| 7 | Matt says it's fun | n/a | Can't be judged on paper |

---

## 2. The 8 most important problems, ranked

### 1. The hub's well is a one-way pit on the walkway, and "soft order" breaks wall jump's ladder
**What a first-timer does.** They come in from R6 at the hub's west door and rest at P3 (x 1280). Then they walk
east toward the gold arch, and the well (1792–2048) is a hole **in the floor between the patch and the arch**.
Anyone who walks without jumping drops one way into a mini-boss at minute ~10. They haven't seen a hawker or the R8
east shaft yet. Even players who notice the well are pulled to it: a moonlit shaft is exactly the glade language R5
just taught ("moonlight = power"), while warm gold has just been taught as danger. I expect most first-timers to go
well-first. The consequences:
- Wall jump's lock-before-key falls to about 3.5 min (the hub up-shaft at 9:30, the key at about 13). That fails
  exit criterion 4, and the R8 shaft lock (step 0) is never seen as a lock.
- The §2 curve (hawkers 10:30–13:30, then the mini-boss at 15) describes only the minority route.
- The wall-jump payoff (the crown wick) sits **behind** the player. The grate puts them out next to the R8 east
  shaft, so the look back means walking back west on purpose after the R10 vista. Few first-timers will do it.
  Feeling 3 ("changes how she moves through rooms she has already seen") then rests on one optional wick that most
  people skip.
- The "choice" isn't a real one. A one-way drop the player doesn't know is one-way isn't a decision. HK's Dirtmouth
  well is a deliberate destination at the end of town, and you can climb back up it. The Crossroads' branches can
  all be walked back.

**Fix (preferred).** Make the order hawkers → well, and make the key's exit the old lock:
- Move the well mouth off the W–E floor line, into a side niche behind P3 (west of x 1280, for example a root ledge
  you step down from on purpose). The hub floor stays unbroken from the W door to the E arch, and Tatter faces the
  arch.
- Mirror R9 and move it west, so that glade 2's climb-out shaft comes up **through a grate in the hub floor at the
  foot of the up-shaft (hub x 2560–2944) and carries straight on up it**. The shaft she couldn't climb at 9:30 is
  now the second half of the climb that taught her the move. The crown wick lands within about 30 s of the key
  (Ori's Sunken Glades does this: the area you just crossed opens up as soon as the ability arrives). Then the R8
  east shaft is the forward test, about 10 s east.
- R8's floor grate goes, or it becomes a plain moonlit vent (a sightline down to glade 2 with no exit). The hub
  grate is now the far-side shortcut.

*Cheap fallback:* keep the doc's geometry, move only the well mouth into the niche, and add a wall-jump-only lamp in
R8 west (see problem 7), so that well-first players get a back payoff on the way out of the grate.

### 2. The pogo is never taught, but it is the only way to hurt the Weaver in P3
§6 says "a pogo on the abdomen lands" and front cuts glance off. Decision 9 says the pogo is learned on the
burrback's braced shell (free bounces, optional) and on L1 (optional), "and it is required only in the Weaver's P3".
That makes the first required down-cut of the game the last exam of the first boss, with no safe, combine or test
step before it. That's the exact ladder violation the doc forbids for abilities. A player who never found the
down-cut is stuck at minute 33 with no idea why their cuts clang, and each retry replays P1 and P2 (problem 5).
HK gets away with an optional early pogo because no early boss requires it.

**Fix:** ladder it like an ability.
- **Intro (R4):** the first burrback braces on a 3-hit combo. A down cut on the braced top bounces her
  (`enemyBlock` + `pogoBounce` already exist). Put a 192 px root step right beside its patrol so that a jump over a
  ram falls onto its shell.
- **Safe (R6 or R8):** one required pogo over a safe floor. Two pod-like targets 290 px apart (combat.md spacing)
  over a gap the glide can't take because a ceiling blocks it. A miss drops her to a floor, never onto thorns
  (decision 9 holds: this comes after minute 3).
- **Combine (R9):** while braced, the old burrback blocks forward cuts and only takes pogos (add this to its spec,
  "10 hp" alone doesn't say it).
- **Test:** Weaver P3, as written.

### 3. R8 is the most overloaded room in the region and breaks the doc's own creature rule
R8 holds: a new creature (the hawker), a **new lamp kind** (the lantern), the burrback's twist (under a moving
lamp), a second hawker, the wall-jump lock, the grate lock, a secret wall (S1) and a postgame DJ ledge. §6 says
"never a new creature and a new lamp kind in the same room", and so does craft §3. The first lantern also arrives
with a hawker parked 128 px over its pivot and a burrback under its platform, so the first time a player meets a
swinging 2-hit flame is also a 3-threat fight. A jump from P puts her head through the flame's core at the apex
(P y 1408, flame y 1128–1152, jump 272), so the "first lantern" lesson is usually "Caught, with a hawker diving".

**Fix:** split R8 into two rooms (13 total; world.md's 12 is a plan, not a budget):
- `wood-hawkers` (about 3 screens, east of the hub): W7 and the lone hawker over a safe flat floor, and S1. Its
  east half is dark (the alternation comes back).
- `wood-lantern` (about 3 screens): L1 **with only the burrback** below (an old creature), the east shaft and the
  DJ ledge.
- Cut `hawk-lantern` (it's already cut-list item 3). The hawker meets a lamp at R10's top (develop), and the lantern
  meets walls in R10's chamber (twist), as already written.

### 4. Glide gaps are measured on a trajectory the reach table doesn't describe
The doc quotes "763 / 1185 / 1745 / 2167 for drops of 192 / 384 / 640 / 832". In movement-controller.md those are
**held jumps off the lip**: a 272 px rise first, with the wings opening 16 px below launch. The jump hump is worth
about 340 px of the total (1185 − 384 × 2.2 ≈ 340). But the doc then works out clearances on a straight 2.2:1 line
from the lip. Both models are wrong somewhere:
- **R6 gaps 2 and 3 (896 px, drop 384).** A walk-off glide (jump already held) carries about 384 × 2.2 ≈ 845 px, so
  it **falls ~50 px short** onto thorns. Only the jump-glide makes it. Gap 1 (768) passes either way, so the ladder
  quietly changes technique between gaps 1 and 2 without teaching it.
- **W5 (2304, 1000).** On the jump-glide she is still near launch height at x + 448, with her feet at about 912–960
  and W5 40–90 px under her feet. She passes through or right next to the core, not "~80 px over the line".
- **R6 stump (top 1536).** The jump-glide crosses x 3584–3712 at about launch height (y ~1290), roughly 240 px over
  the stump. The test is toothless for the normal technique and impossible (a short landing) for the walk-off.
- **R5 W4 (2080, 1760).** The required lip → Z glide passes about 210 px from W4 by the doc's own line, inside its
  R 360 field. The **lock room's first ever glide is pulled by a lamp**, so step 2 is already step 4.
- **R5 bypass.** A plain jump off the lip carries about 700 px. W4 pulls her into Caught, and beating free throws
  her outward, east, onto M (2112–2304, y 2048, right under W4). M → Z is a 192 px hop. A player who never holds
  jump gets through the glide's lock room, then fails R6 gap 1 forever. The tapper problem has only moved.

**Fix:** re-derive every glide clearance from `tests/unit/glide.test.ts` traces (both the jump-glide and the
walk-off), and add the trace overlay to the room lint. Concretely:
- R5: remove W4 and M (cut-list item 4, promoted). The first glide is unpulled, and its first lamp moves to R6's
  T2 landing.
- R6: gap 1 stays 768. Gaps 2 and 3 become 1024 wide with a 512 drop, so both techniques work: walk-off ~1125,
  jump-glide ~1465. Put W5 on the jump-glide's measured line (the combine). For the test, replace the stump below
  with a thorn branch hanging **over** the jump's hump (underside ~200 px above T3, x + 200–500). Then "hold the
  line" means choosing the low walk-off glide under it, which is a real decision with a pip at stake.

### 5. The Weaver: P1 is a sticky slog, every retry replays it, and P2 can't be built as written
- **P1 is mostly strands.** The spoke from the heart (1088, 1536) to ring-1 (320, 1792) runs 171–288 px above B1,
  right through the jump arc from B1 to ring-1. The ring-1 ↔ ring-2 rim crosses x 672 at y ~1528, the line from
  C1's face to ring-2. Every approach touches a strand, and every touch is a 3-press Caught. On top of that, the
  heart's R 1100 field covers the whole arena, so every kick and glide is bent. "Glide between crossing pulls"
  becomes "get stuck, press, get stuck". A gentle P1 is right, but gentle should mean *clear*, not sticky.
- **The retry loop.** A death resets to P1 (60–90 s), so a P3 death costs P1 + P2, about 2.5 min, before the next
  P3 attempt. That doubles or triples the fight's real length for a 1–3 death first-timer. HK's first bosses restart
  at full speed. The 15 s run back is wasted if the fight's first 90 s is a chore.
- **P2's pendulum is geometrically impossible.** With a canopy pivot (y 1088) and the weaver at the floor band
  (y ~2100), the thread is about 1010 px. Reaching "the far side" means swinging ±60° or more, and the ends then
  rise about 500 px, to y ~1550: **inside C1/C2's span (1088–1728), the "safe" places**. A pendulum can't sweep a
  flat 280 px band end to end.
- **"Cling" doesn't exist.** The sim has a wall slide (2.5 → 6.5 px/f), not a hold. Staying above the band for
  about 78 f means kicking up to the canopy and sliding, and that should be tested, not assumed.

**Fix:**
- P1 web = spokes only (no rims). Spokes go from the heart to the ring flames, so they never cross the ring
  approaches.
- The heart's field in P1 is R 700, and grows to R 1100 only in P3.
- On a retry, P1 has 3 ring flames (rings 2–4 already burning low and out on the first cut), about 30 s.
- P2: the weaver drops on a thread from three pivots and swings **half the arena** (±40°, rise ~240). Each drop's
  danger arc is drawn by the thread tell. The safe place is the *opposite* column or trunk, never the near one.
  Write the slide-time budget into the spec (tell 45 f + drop 18 + swing 60 = 123 f, and a slide from the canopy
  covers about 500 px in that time, which is enough).

### 6. Wall jump's ladder is flattened by "one wall is enough", and the 18–25 min stretch is four shafts in a row
movement-controller.md: a kick throws her 145 px out and she lands back on the *same* wall 230 px higher, so every
face is a ladder. Read against that, the doc's steps don't escalate:
- **Safe (R9):** two walls 384 apart. She only ever uses one.
- **Test (R10 upper):** one kickable wall, thorns 384 px away. A kick goes 145 px out, so the thorns are about 240
  px from her and never in play unless she holds away. The "test" is the safe step again with scenery.
- **Failure cost.** R9's climb-out is 2304 px, about 10 kicks, with no ledge. A slip near the top costs the whole
  climb, not "seconds".
- **Monotony.** Climb-out 2304 + R8 shaft 1792 + R10 chamber 1448 + R10 upper 1152 ≈ 6700 px of the same rhythm
  back to back, broken only by walking. It's the doc's own "longest novelty gap". Ori's wall-jump stretches mix
  horizontal glides between short climbs. HK's Mantis Village mixes walls with fights.

**Fix:**
- R9 climb-out: 1280 px with a rest ledge at 640 (and with problem 1's fix, it carries on up the hub shaft as an
  optional extension).
- R8/lantern east shaft: replace it with a **broken face**: kickable bark, then a 320 px thorn band on the same face,
  then kickable bark on the *opposite* face. She has to kick off, glide across and catch the other wall. That is the
  real new skill, the combine with glide.
- R10 upper (test): two broken faces with alternating thorn bands, the hawker's dive lane crossing the shaft's top
  third, and L2's field bending the cross-shaft glides.
- Put one horizontal glide room beat between R9 and R10 (the R8 split gives you one: `wood-hawkers` is flat).

### 7. R1–R4 are sealed forever, lamps there can be missed for good, and the abilities reopen almost nothing
- Every way out of R1–R4 is one way (drop, drop, the hole). W1 ("snuff after beating free") and W3 ("fight *or*
  snuff") are optional in practice, so a first-timer can miss 10 moths **permanently**, in a game whose ending
  vista shows every missed lamp still burning. HK and Ori almost never strand a collectible.
- Glide reopens nothing (decision 7 admits it). Wall jump reopens one wick, which sits behind the player (problem 1).
  So feeling 3's "each one changes how she moves through rooms she has already seen" isn't delivered by play. In
  Sunken Glades, Ori's first ability turns the area you just walked through into a page of reachable cells.
- The explorer has nothing to find until S1 at about minute 12: no side pocket, no secret and no optional branch in
  R1–R6 except W4 (which problem 4 removes). King's Pass, two minutes long, already has a hidden alcove.

**Fix:**
- Make R5's 1600 px hollow shaft kickable (it's dark, so no thorns are needed), so that **with wall jump the hole
  back into R4 opens from below**. Add one glide + wall jump lamp in R4 (a ledge high over F3, glide from the hole's
  rim) and one in R3 (above the dip, needs a kick off the shaft wall). That gives both abilities a back payoff and
  makes W1/W3 recoverable. It's an optional backtrack of about 2.5 min from the hub: offer it, don't require it.
- If that's too expensive: force W1 and W3. Put W1 *over* the dip's only exit lip so that beating free always ends
  in snuff range, and put W3 on the step-up to F3, so a walk past means a cut.
- Put one rotten-bark pocket in R6, right after the critical-path bark wall. A second wall of the same kind a few
  metres on, holding a wick, is the "you've learned the language, use it" beat. It also gives the explorer a find
  at minute 8.

### 8. The story beats don't hold up in play: Tatter teleports, the glimpse is a backdrop, the relight is optional
- **Tatter can't walk to P3, P5 or P7.** P3 is past a glide-only chasm. P5 is at the top of a wall-jump climb. P7
  is behind a silk curtain that fell **seconds ago**, when the boss died. Decision 15 already excludes the glades
  "which it can't reach". The same logic excludes these three. Players notice when a walking companion keeps
  arriving at places only flight reaches, and that undercuts the ending's "it walked".
- **The firefly glimpse is a far-layer prop in R6**, but the lamp it hangs (W-ff) is a real lamp in the hub's canopy
  gap, about 1000 px east and 2500 px up. The best version of this beat sits in plain sight in the doc: the player
  arrives at the hub, looks up through the canopy gap, and watches the warm light hang W-ff **on the real branch**.
  W-ff then burns over the hub all region as a visible lock (lit, out of reach). This also removes a third job from
  R6.
- **The relight is optional and in the wrong place.** Ring-1 is by the west entry, the firefly flees east, the
  curtain opens east, and the moment comes right after the region's biggest payoff. Many players will follow the
  light east and never re-snuff. The Kuro beat only works if the player feels the undo.

**Fix:**
- Tatter: drop P5. P3 stays, because it's a hub and players accept a hub companion. At P7, **Tatter walks in
  through the fallen curtain after her** while she rests, so her victory opened the road for it. It costs one walk
  path and is the best Tatter beat in the region.
- Move the glimpse to the hub's first visit (camera look-up from P3, input free, 4 s).
- Put the relit flame **on the chimney** (2176–2560) halfway up the way out, with the five moths pulled back into
  it, so the re-snuff is on the critical path and the firefly is seen leaving over the edge as she tops out.

---

## 3. What's strong (keep)

- **The opening's causal chain.** Hatch → chase → vista and title → the stragglers spiral into W1 *before* she does
  (the etecoon method) → Caught with the cocoon's own input → snuff from a root lip. Control at 8 s, the first lamp
  at about 1:45, no pips before 3:00. This is King's Pass-grade.
- **The W1 "teach" row and the W2 root knob.** They solve "make the first catch certain, make the first snuff safe"
  with data, not prompts.
- **One secret language, taught on the critical path** where the freed moths slip through the crack. That's exactly
  craft §2.5.
- **The orb web room** takes "runs to where she touches" out of the boss, and the pre-cut sector shows the answer
  without text.
- **The great lamp as one burst** (ring moths feed the heart), with the first health milestone moved onto it. One
  enormous payoff at the climax instead of six small ones.
- **Data discipline.** The purpose tags, threat points per lit screen, the lost table with cheapest-first
  pull-backs, the novelty count, the ordered cut list and the never-cut list. The world placement is consistent: I
  checked all eleven seams and every floor height lines up in world px.
- **Far-side shortcut opened from below** (the grate), and the instinct for Dread's leash. Keep the idea, move where
  it comes out (problem 1).
- **R8's DJ ledge on a `kick: false` stalk.** It's the right kind of thinking about breaks. It just needs applying
  everywhere (§4).
- **The Weaver's fallback list** (cut P2, keep a fixed graph) and the fairness list (no pits, no hit during re-form,
  arena fully on screen).

---

## 4. Reach and geometry errors

| Where | Error | Fix |
|---|---|---|
| R1 → R2 | The hatch exit spans chase-local x 384–1664, but A ends at 1600, and her run speed is kept. Falling 704 px at 9.6 px/f carries about 290 px, so a player leaving the hatch's east end lands on B or in the A–B gap catch, not on A | Extend A to 2048, or start B at 1600 |
| R2 vista | The jump-at-every-gap rhythm the chase teaches carries a jump off V's lip (drop 512) about 700 px, to x ~6460. That hits the room's east edge (6400) and lands at x ~6340, outside the S exit (5888–6144), in the end catch, which returns her to V. **The naive bot loops forever** | Make the whole floor east of x 5760 the S exit, or put the exit span at 5760–6400 |
| R3 W2 | A 24 px knob is a wall (step-up is 12), and the top of the knob is only 32 px wide, so the ground drag pulls her off it toward W2. Standing west of the knob, her front is ~144 px from W2 (reach 110) | State W2's hit-box radius (≥ 40), or widen the knob top to 96 px |
| R4 W3 | The "jump-cut, 240 px up" brings her feet to y ~1072 at the apex, level with the flame (1104). She reaches the core before the cut, so the snuff option is almost always Caught over the awake burrback. Fine if intended, but it's the first predator room | Teach the short hop + up-cut, or lower W3 to ~200 px and put a root step under it |
| R5 | W4's field covers the required glide line, and its beat-free throws her onto M (a glide bypass) | Problem 4 |
| R6 | Gaps 2 and 3 can't be crossed with a walk-off glide (~845 < 896). W5 and stump clearances are wrong by up to ~150 px | Problem 4 |
| R7 crown | `edgeKick` isn't set. With the default, the room's west edge can be kicked from the hub floor to the far branch at y 512 (one wall is enough), so W-ff and L-gap fall to wall jump + glide on the first run. L-gap's R 520 field also slingshots a jump from the crown lip toward the branch without fling (core §3's free gravity assist) | `edgeKick: false` on the hub, plus a measured fling-free slingshot test from the crown lip |
| R8 DJ ledge | The east shaft's west face (4480) can be kicked above y 1088. Kick out 145 px and glide down ~190 px, about 560 px of reach, which is more than the 512 px to the ledge's east end (3968). Reachable with wall jump + glide | Make the shaft's west face `kick: false` above y 1300, or move the ledge ≥ 800 px from the shaft |
| R8 grate exit | It opens 24 px outside W7's field and ~400 px from the hawker's home | Only matters if the grate stays (problem 1). Otherwise move W7 east by 200 |
| R9 | W8 is "snuffable after the boss", but it hangs 320 px over the pit floor, which a jump-cut reaches mid-fight, and snuffing it blinds a sight hunter. The mechanism isn't specified | Either allow it (a dark-is-mine twist: it makes feeling 2 playable), or hang W8 out of reach until the root gate opens |
| R10 | The R8 shaft's walls arrive at R10-local x 0 and 384, but the lower chamber's west wall is at 64. The leaf curtain (~1100) sits inside the upper shaft's mouth (896–1280) | Line the walls up. Move the curtain to ~1400 |
| R11 DJ ledge | The approach trunk (3200) isn't capped. Kicking up it past y 640 and gliding 384 px east reaches the DJ ledge (3584–3840) with first-run kit | Top the trunk at y 1024 with an overhang, or make it `kick: false` above the shelf |
| R12 | The chimney climbs ~960 px (1600 → 640), not ~700. The P2 pendulum can't exist as written | Problem 5 |
| §9 | The room time ranges add up to 21:45–40:30 (midpoint ~31 min) against a 35–45 min target | Re-time the rooms after the splits, or set the target to 30–40 |
| Postgame | The 25 postgame moths are reached only by re-entering via R12's edge from the valley, so they depend on the valley's undesigned "way back up" | Make the valley doc's landing → R12 edge route an exit criterion of *this* region's postgame count (tier honesty, world.md §3.7) |
