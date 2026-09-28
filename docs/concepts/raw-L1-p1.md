# Raw concepts: L1, pack 1

Seed pack: Wercklea (Malvaceae genus), Cumnock and Doon Valley (Scottish district, 1975–1996, coalfield), Aeroflot Flight 601 (crashed on approach, pilot error). Words: astatize, wagonway, pycnosporic, behatted, gimcrackery, hexiological. Lens: cooperation with enemies is required. Mood: dread.

---

## 1. Associations (pushed past the first idea)

1. **Cumnock and Doon Valley.** The first idea is "a lost place". The better one is that the district was a legal fiction that lasted 21 years. Its hills stayed where they were, but it stopped *existing*. In a world built on that, ground is real only while someone has authority over it, and borders are laws of physics that can be redrawn.
2. **The Doon Valley coalfield.** The obvious idea is a dark mine. The structural idea is that a pit village is one long vertical economy. Pit ponies stabled underground for years, the pit hooter and the shift pattern set the rhythm of life. "The weight coming on" was miners' slang for the roof starting to settle.
3. **Wagonway.** The obvious idea is minecarts. The deeper one is the *self-acting incline*: a full tub going down hauls an empty one up on the same rope, with no engine. Descent pays for ascent. The two tubs pass each other at a loop halfway along. A cooperative mechanism is built into the machinery itself.
4. **Flight 601 crashed *on approach*.** The obvious idea is a crash survivor, but a coma or purgatory story is a cliché, so that's out. The better reading is that the danger is in the *arrival*, not the journey, and that "pilot error" means trusting the wrong instrument or a false light. The flight's destination, Leshukonskoye, recalls the *leshy*, the forest spirit that leads travellers astray. That points to will-o'-the-wisps, which folk science explained as marsh gas, which is the same thing as firedamp.
5. **Astatize.** To make a magnetic needle astatic, so the Earth's field has no net pull on it. It then has no preferred direction and no allegiance. That suggests a protagonist the local laws can't hold, or a tool that makes something weightless or loyal to nothing.
6. **Behatted.** Authority is something you *wear*: the hat of office, the constable's helmet, the provost's tricorn. Take the hat off and the power goes with it. The law lives in the hat, not the person.
7. **Gimcrackery.** Cheap, showy trinkets. Chains of office, rosettes and enamel badges are bureaucratic gimcracks that nonetheless *mean something*. They make a good currency or charm system, where tacky things carry real power.
8. **Hexiological.** The study of organisms' habits and habitats. A protagonist who wins by learning what enemies *do*, and when, rather than by grinding. The bestiary becomes a field notebook, and enemies run on schedules like shifts.
9. **Pycnosporic** (densely spored). Coal really is compressed Carboniferous plant matter, and some seams are almost entirely spores. A coal seam is a dense archive of something that once rose (a forest) and has now sunk. Alternatively, a swarm made of many tiny identical things.
10. **Wercklea / Malvaceae.** A genus named after a person (Wercklé), so naming brings a category into being. The mallow family also gives us jute and cotton fibre (rope!), kapok floss (seeds that ride the wind) and mucilage (sticky marshmallow sap). Rope made from a plant ties this seed back to the wagonway.
11. **Loch Doon + aircraft.** Loch Doon was the site of a failed WWI aerial gunnery school. The valley's one link to flight was a costly failure. That's a quiet echo between two unrelated seeds, and it fits the dread.
12. **"Overwind."** A real mining accident: the winding engine hauls the cage past the landing and smashes it into the headgear. This is Flight 601 again, a crash *on arrival*.

## 2. Clichés to steer away from

1. A silent knight in a fallen, corrupted kingdom, restoring it by killing the rot in each biome.
2. A forest spirit or guardian bringing light and life back to a dying tree or world.
3. A lone explorer (usually a robot or suit) on an alien planet full of precursor technology.
4. The protagonist is dead, dreaming or in a coma, and the world is purgatory or a mind-palace. **Flight 601 invites this one, and it is explicitly rejected here.**
5. A cute world gone hostile, where you "cleanse" each area and its boss was a friend all along.
6. (Bonus) A time loop in which you die, keep your knowledge and restart the day.

---

## Concept A: ONSETTER

**Hook:** In the Doon pit nothing rises unless something falls, and the only counterweights heavy enough are the things hunting you.

### Premise and world logic
The Doon Workings are a colliery sunk so deep that it has its own draughts, weather and ecology. It was built on self-acting wagonways, and over generations the incline principle stopped being engineering and became the pit's *physics*. Down here, big vertical travel is a transaction. You can walk, jump and drop normally. But the great shafts and inclines can only be crossed by rope, over sheaves (pulley wheels) set into the rock. A rope moves only when the two ends are unequal: the heavier end descends and the lighter end ascends.

You are the **onsetter**, the pit-bottom worker whose job is to hook loads onto the rope. At the end of the last shift the cage went up full of miners and came back down carrying the counterweight the surface sent to pay for their ascent. You unloaded it. Now the headgear is silent. The main shaft needs something enormous to go down before anything can come up. The heaviest things in the pit are what came down in that last cage and what grew in the dark around it.

**Why it's a metroidvania:** the pit is a single interconnected vertical system. Early on, drops are *one-way commitments*: you can always go down, but you can't come back up until you've found or tamed a counterweight on that rope. That creates dread with a structure. Every drop makes you wonder whether you'll ever get back up. Shortcuts open when you permanently balance a rope, for example by sprag-locking a heavy tub on the far end. The map is a ledger of balanced and unbalanced ropes.

**The pit's ecology (hexiology):** creatures have **heft**, a signed weight class from −3 to +4.
- **Sinkers** (+): pit-horses, tub-crawlers, blackdamp pools, "the weight" (the roof itself).
- **Risers** (−): firedamp wisps, which are lighter than air, gather under roofs and mimic safety lamps.

Everything runs on a **shift pattern** driven by the frame count and signalled by a distant hooter. At shift change, sinkers migrate down to the sump and risers drift up to the roofs. Which counterweights are available in a room depends on the shift, and the field notebook records each creature's habits and heft.

### Signature mechanic 1: the Clip (shared-fate rope)
You carry a coil of jute rope with an iron clip. Strike and hold to **clip** your rope's other end to any hefted body: an enemy, a tub or a rock. You can clip either directly or through the nearest sheave.
- **Over a sheave:** a classic counterweight. If you have heft 2 and clip a heft-3 tub-crawler, it sinks and you rise. The speed depends on the weight difference, looked up in a table (integer-friendly, with no rope simulation: a rope is a length constraint between two points on a sheave graph).
- **Direct tether to a riser:** it floats you upward like a leashed balloon, drifting where the draughts go.
- **Direct tether to a sinker:** it becomes an anchor you can swing from like a pendulum.

**The shared fate is where the dread and the cooperation come from.** When you ride against an enemy, you're both on one rope, and it's alive:
- **The Tug.** A sinker on the far end can *climb its rope* hand over hand. Climbing its side lowers you. You feel it in the controller (rumble and a rope-creak audio cue) before you see it, because the far end hangs down in the dark. You have to choose: cut and fall, strike the rope to shake it off, or add ballast to win the tug.
- **The Passing.** As on every real incline, the two loads pass at the midpoint. For one second you and your counterweight are side by side in the shaft. Some creatures lunge and some pass by indifferently. Learning which is which is hexiology.
- **The Approach.** This is the Flight 601 seed. Arriving is the dangerous part. A heavy counterweight means a fast ascent, and a fast arrival is an **overwind**: you're smashed into the headgear and take damage or get knocked back down. You must brake (sprag) or shed advantage in the last few metres, reading the rope speed from the pit's gauges.

**In combat**, clipping *is* your crowd control. Clip a charging crawler to a heavy tub over a sheave and it's hauled up and out of the fight. Clip a wisp to a sinker and it's dragged down into blackdamp, where it gutters out. Clip two enemies to each other (with the Tail Rope) and they seesaw, fighting the rope instead of you.

### Signature mechanic 2: false lights
Firedamp wisps imitate the pit's safety lamps, which are the game's save points and landing markers. The **deputy's lamp** is a real gas-testing flame lamp: its flame grows a blue "cap" near firedamp. It is your only instrument, and it can be fooled when several wisps cluster together. Following a false light onto a rope ride can end in a crash on approach, or with you tethered to a riser that is about to meet your lamp's flame. It's a small, constant layer of instrument-trust dread, and it doubles as an encounter design tool.

### Abilities (all read as pit equipment)
1. **Deputy's Lamp** (early). Reveals the heft of any body (a number glyph in the flame), tells true lights from false, and dies inside blackdamp, which warns you to hold your breath.
2. **Sprag.** In real wagonways this was a wooden stake jammed into tub wheels. Here it locks any rope mid-ride. It turns a moving counterweight into a static platform or ledge, freezes a clipped enemy in place, and prevents overwinds. It also *permanently* balances ropes, which is how shortcuts open.
3. **Ballast Satchel.** Pick up and drop coal lumps to change your own heft from 1 to 4. With it you can win tugs and ride against lighter counterweights. It's also a combat trade-off: heavy means slower but you can't be knocked back.
4. **Tail Rope.** A second clip that you don't hold yourself. Tie any two bodies together, whether enemy to enemy, enemy to tub or tub to wall. This enables remote counterweights, seesaw traps and puzzles solved at a distance.
5. **Snatch Block.** A portable sheave you can bolt into specific roof anchors. It creates counterweight systems where the level has none. This is the big mid-game gate, comparable to getting the grapple.
6. **Brattice.** A cloth screen that redirects mine draughts. Risers drift along draughts, so when you're tethered to one, the brattice is your steering. It works as a reskinned "glide with direction control".
7. **Astatic Clip** (late). Makes a clipped body weightless on the rope. You can drag a heavy enemy horizontally as a floating shield, or neutralise an impossible counterweight so you can climb its rope by hand. This is the astatize seed: the needle stops caring which way is down.

### Biomes
1. **Pit Bottom (Onsetting).** Tutorial. Cages, tubs, sheaves. Teaches heft with inanimate tubs before you ever clip anything that bites.
2. **The Wagonway Levels.** Long galleries of slanted self-acting inclines. Runaway tubs are both a hazard and a way to ride. Momentum and horizontal clip-riding along rails.
3. **The Goaf.** The collapsed, worked-out area, where "the weight is coming on": sections of roof are slow, enormous sinkers. You counterweight *against the ceiling*, and every ride lowers the roof a little further. It's a dread biome built on creaks and dust.
4. **Blackdamp Sump.** Heavy gas pools in low places and your lamp dies inside it. You traverse on a breath timer and escape by clipping onto risers. Sinkers rest here between shifts.
5. **Firedamp Roofs.** Risers gather under ceilings, so platforming here is inverted, from tether to tether. Your pick-strikes spark, so combat can set off chain ignitions. This is also where the false lights are densest.
6. **The Heapstead Shaft.** The main shaft, an enormous vertical climb made as a series of counterweight rides against the heaviest heft in the pit. The finale.

### Example boss: The Galloway
Galloway ponies were the pit ponies of south-west Scotland. This one has been stabled below for longer than anyone remembers. It's huge, blind and hefty, and it hunts by the creak of rope.

- **Arena:** one tall shaft with a single sheave at the top, and blackdamp at the bottom.
- **Phase 1:** a normal floor fight. It charges and bucks, and you learn its tells.
- **Phase 2:** it clips *itself* to the rope. The Galloway is a sinker, so whenever you're clipped to the other end you rise. The fight becomes a tug-of-war. It climbs to drag you down, you add ballast or sprag to hold, and you strike it at each Passing.
- **Phase 3:** you can't kill it outright, because falling into the sump only rests it. The win is to sprag the rope with the Galloway at the bottom, then tail-rope its harness to the shaft's main drum. From then on it is the *permanent counterweight* of that shaft. The shortcut you open is literally a defeated enemy put to work. The cooperation lens holds: you didn't beat it, you enlisted it.
- **Late game:** the Heapstead finale asks what you'll ride up against, and what will ride up with you.

### Why it's not generic (self-critique)
- **Closest games:** Ori's Bash (using enemies as traversal), grapple games (Bionic Commando, the Worms ninja rope), Limbo and Inside counterweight puzzles, and Teslagrad's physics-gimmick metroidvania. Deepnest has a similar dark-cave mood.
- **How it differs:** Bash is a momentary launch, whereas the Clip creates a *persistent two-body bond* that has its own events (Tug, Passing, Approach). Enemies are not obstacles or springboards. They are *weights with habits and schedules*, and bosses become permanent parts of the map's machinery.
- **Honest weakness:** an underground mine with a lamp is close to the "dark cave" default. The originality lives entirely in the rope economy. If that isn't fun, what's left is a generic cave game. The mining setting also has real grief behind it (Ayrshire pit closures), so it needs to be fictionalised and handled with respect, never used as grim-dark decoration.

### Greybox test (about 1 hour)
**Setup:** one tall room (about 3 screens high) with a sheave at the ceiling and a ledge at the top. The player has heft 2. The room holds a heft-1 crate, a heft-3 crate and one heft-3 crawler that walks toward the player and swipes. The rope is a straight-line render between clip points. Speed comes from a lookup table indexed by the heft difference.

**Things to try:**
1. Clip the crate and ride up.
2. Clip the crawler mid-fight and ride it.
3. Script the crawler's Tug, where it climbs its end so you drop.
4. Add a Passing lunge.
5. Add an overwind if the arrival is too fast.

**Signal:** after 5 minutes, do testers *choose* to clip the crawler rather than kill it? Does the Tug produce a flinch? Are the weights readable without a tutorial? If riding against an enemy feels like just a slower elevator, the concept is dead.

### Risks
- **Pacing.** Puzzle-heavy counterweight rooms could slow the Hollow Knight-style flow of movement. Rides must be fast, cancellable and chainable.
- **Readability.** Players must be able to read heft at a glance. That needs a strict silhouette language (sinkers bottom-heavy, risers top-heavy) plus the lamp readout.
- **Physics scope.** Keep ropes as rigid constraints on a sheave graph and never simulate verlet rope for gameplay. Deterministic integer weights map well to our physics.
- **Palette.** A coal mine can look monotonous in browns and blacks. Rely on lamp cones, firedamp blue and the sick amber of blackdamp to break it up.
- **Hostile clips.** Players must never lose control for long.

### Seeds used
- **Wagonway (core).** The self-acting incline became world physics, and the Passing mid-ride event comes from it.
- **Cumnock and Doon Valley.** The coalfield setting, Galloway pit ponies, "the weight coming on" and the shift pattern.
- **Flight 601.** Danger on approach (overwind), false lights and trusting instruments (deputy's lamp versus wisps), and the leshy leading travellers astray.
- **Hexiological.** Enemies with heft, habits and shift schedules, and a field-notebook bestiary.
- **Astatize.** The Astatic Clip.
- **Light uses.** Malvaceae gives the jute rope. Pycnosporic gives the coal seams as dense spore archives, which are used as ballast.

---

## Concept B: THE DISSOLUTION ROLLS

**Hook:** Your district is being abolished at midnight. The ground exists only where some hostile official's hat says it does, so you have to keep your enemies alive to have anywhere to stand.

### Premise and world logic
**The world.** The Valley District was created by an act and is being abolished by another. That's the Cumnock and Doon Valley seed taken literally. Here, jurisdiction is physics. Every official wears a **hat of office**, and within the hat's radius its **bylaw** is physically true. That includes the most basic bylaw of all: *there is ground here*. As the **Boundary Commission** redraws the map, the land between jurisdictions becomes **unincorporated**. It's blank survey-paper void with no floor, no gravity guarantee and no echo.

**You.** You are the **Enumerator**, a census-taker sent by the successor authority to count everything in the valley before the Dissolution. Anything uncounted at midnight will not carry over into the new register. The district's officials are still behatted and still enforcing their bylaws. They see you as the enemy, the agent of their abolition. You are *astatic*: unregistered, so no hat will stay on your head and you can never carry law yourself. You depend entirely on theirs.

**Dread** comes from process rather than monsters. Notices appear on walls ("The following parishes are transferred…"). You hear the **Surveyor**, a vast faceless figure dragging a Gunter's chain along the boundary. Each time it moves, the map redraws, and after each boss, regions you know are annexed and changed. There is no real-time clock. The creeping reassignment is story-driven.

**Why it's a metroidvania:** jurisdictions are the gates. A region is traversable only if you bring or lure the right kind of official into it. The world map is literally the district map you're filling in, and its borders shift between acts, which reopens old areas with new rules.

### Signature mechanic 1: the law is in the hat
Every behatted enemy projects a circular field around its **hat**, not its body, and inside that field its bylaw holds:
- *Ground Here*: solid floor at the hat's level, extending out into the void.
- *No Falling*: you hover at the height you entered.
- *Keep Left*: a horizontal current.
- *No Loitering*: you can't stand still, so you're forced to keep moving, which works as a dash bridge.
- *Quiet Hours*: nobody can attack, including you.
- *Right of Way*: walls owned by this parish become passable.

**Moment to moment,** you strike with the **brim strike** to knock hats off. A knocked-off hat flies, lands and keeps projecting its field wherever it lies. Its hatless official *always* goes to retrieve it; that's the hexiology, their overriding habit. So you **herd enemies by kicking their hats**:
- kick a Ground Here hat out over a chasm, and the official walks onto the ground its own hat creates to fetch it, while you cross behind;
- kick a Quiet Hours hat into a crowd to shut down a fight;
- kick two hats together so their fields overlap into a **disputed zone** that alternates between the two bylaws on a rhythm you can learn.

**Combat and cooperation are the same act.** Killing an official destroys its hat. Then its field is gone, and if you were standing on it you fall. Late areas are islands of ground carried around by angry clerks, and you have to keep them alive, near you, and pointed where you need to go.

### Signature mechanic 2: gimcracks
Officials carry cheap insignia: rosettes, lanyards, enamel badges and chains of office. Each is small, tacky and genuinely powerful. When you knock one loose and pin it to *another* official's hat, it amends that hat's bylaw (bigger radius, a reversed sign, a longer duration). This doubles as the build and charm system: you're never allowed to wear authority, but you can vandalise it creatively.

### Abilities
1. **Brim Strike.** The base attack knocks hats in 8 directions, and it gets charged and upgraded later.
2. **Astatize.** Briefly shrug off the field you're in. You can drop through No Falling, step through Keep Left or strike during Quiet Hours. It's the needle that ignores the field.
3. **Frank.** Stamp a hat onto a wall to pin its field in place. Its official is left stuck, trying to peel it off. This creates static fields for building routes.
4. **Surveyor's Chain.** Snap a taut line between two hats, which becomes walkable ground *between* two jurisdictions. It's a tightrope and a bridge across the void, and it gates long horizontal crossings.
5. **Appeal.** Invert the bylaw of a field you're standing in: No Falling becomes Only Rising, and Ground Here becomes Ground Above, giving you a ceiling to walk on. This is the big late gate, a reskinned gravity flip.
6. **Tally.** Chalk census marks on a patch of void. Counted ground persists for a few seconds after its field leaves, which is enough to cover a gap. It's a reskinned "coyote-time" and double-jump extension.
7. **Specimen Label.** Adapted from the Herbarium. Naming a plant makes it solid for the rest of that visit.

### Biomes
1. **Burgh Chambers.** The town hall and tutorial. Ground is complete, bylaws are gentle, and hat-kicking is taught on a single porter.
2. **The Herbarium and Allotments.** This is the Wercklea and Malvaceae seed. Plants are solid only if catalogued, so unnamed flora are uncollidable silhouettes. A Botanist-official's *Specimens Only* field makes labelled plants real. Kapok floss clouds become rideable when labelled.
3. **The Struck-Off Rows.** Demolished pit villages that have been removed from the register. Houses are half-existent, with doors that open onto void. Ground only exists where a lone rent collector patrols.
4. **The Marches.** The boundary line itself, a tall narrow strip where two authorities overlap. Everything is a disputed zone, flickering between two bylaws on a beat. It's a rhythm-platforming biome, and the Surveyor walks here.
5. **The Rates Archive.** Vertical canyons of filing drawers. Pycnosporic clerks move in dense swarms of tiny stampers. Each carries a thimble-hat with a tiny field, but together they form a moving mass of ground, like a school of fish you can stand on.
6. **The Unincorporated.** Late game. There is nothing but void, and ground exists only inside the fields you're herding. It's the full expression of the mechanic.

### Example boss: The Provost
The district's highest office. His hat is a vast tricorn, and his field covers the whole arena. Each phase he unrolls a scroll and reads a new bylaw aloud: *No Ascending*, *Keep Off the Walls*, *Silence* (which cuts your audio cues). You can't kill him, because if his hat falls the arena becomes unincorporated and you fall with it.

To win, you knock the tricorn off during the brief gap between readings, then kick it, one strike at a time, across the Surveyor's chalk line into the successor authority. The Provost follows his hat across and gets counted. He is enumerated rather than slain, and he reappears later as a reluctant, hatless source of lore. The fight is a mix of dodging, herding and keeping the floor from vanishing under you.

### Why it's not generic (self-critique)
- **Closest games:** Mario Odyssey's Cappy (hats and enemies), Baba Is You (rules as objects), Control (bureaucratic dread), Papers, Please (administrative tone) and Kafka generally.
- **How it differs from Cappy:** there's no possession. You *never* wear the hat or control the enemy. The enemy keeps its will and fights you while you exploit its law. It's closer to herding sheep that bite than to taking over a body. Rule-fields as physical, mobile, enemy-carried *terrain* in a real-time action platformer is, as far as I know, new.
- **Honest weakness:** the dread may slide into dry comedy (hat-kicking is funny). Bureaucracy is a tonal minefield, since it quickly becomes Terry Gilliam satire. The fiction is also more abstract, so players could ask "why does a hat make ground?" and get only "because it's the law".

### Greybox test (about 1 hour)
**Setup:** one room with a 12-tile void gap between two ledges. On the left ledge is one porter enemy with a Ground Here hat: a 4-tile-radius field that renders a floor wherever the hat is. The porter patrols, chases the player and swipes. When the brim strike hits the hat, it flies about 6 tiles on an arc. The hatless porter walks to its hat, can't attack while hatless, and puts it back on.

**Goal:** reach the right ledge.

**Signal:** do players discover within about 3 minutes that they can kick the hat into the gap and follow the porter across? Is herding satisfying, or is it fiddly waiting? Add a second enemy with a No Falling hat and see whether players start combining fields unprompted. If people just wait for the porter, the herding AI needs more urgency. If it still isn't fun, the concept fails.

### Risks
- **Legibility.** Six-plus bylaws need an iconic visual language (field shaders and hat silhouettes) that reads instantly in combat.
- **AI.** Herding AI must be deterministic and predictable, or it's frustrating.
- **Control.** The "keep your enemy alive" rule could feel like an escort mission. Enemies must stay aggressive and entertaining, never fragile.
- **Tone.** Maintaining dread under inherently comic verbs is hard.
- **Map shifts.** The redraws between acts are content-expensive.

### Seeds used
- **Cumnock and Doon Valley (core).** A district that exists by statute and is abolished by statute; jurisdiction as physics; struck-off villages; the Boundary Commission.
- **Behatted (core).** The law lives in the hat, and the whole combat and traversal verb is built on hats.
- **Astatize.** An unregistered protagonist who can't hold law, plus the Astatize ability.
- **Hexiological.** Officials' fixed habits (always retrieve the hat) are what make herding possible.
- **Gimcrackery.** Tacky insignia that amend bylaws, used as the charm and build system.
- **Wercklea / Malvaceae.** Naming makes things exist: the Herbarium, the Specimen Label and kapok floss.
- **Pycnosporic.** The dense swarm of clerks that forms a living floor.

---

## Verdict
**ONSETTER is the stronger foundation.** It has a single, physical, intuitive mechanic, the rope shared with the thing that wants you dead, and that mechanic naturally produces traversal, combat, gating, shortcuts and dread all at once. It suits our deterministic integer physics well: heft is just small integers and a lookup table. It also suits code-driven visuals: a lamp cone, a taut line vanishing down into black, and firedamp blue under the roofs.

**THE DISSOLUTION ROLLS is the more original premise** and its hat-herding verb is delightful, but its dread is fragile and its rules are abstract. Worth keeping from it: "the law is in the hat / enemies retrieve their hats" could be a single enemy family inside a larger game.
