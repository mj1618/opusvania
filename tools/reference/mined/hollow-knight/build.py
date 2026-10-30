"""Build area.json for Hollow Knight's first area.
usage: build.py <out area.json> [dumps dir]   (no dumps dir = mined-only mode)"""
import collections, heapq, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from lj import lj

DATA = "/Users/matt/code/worktrees/opusvania/nifty-bhaskara-28e244/shots/reference/maps/hollow-knight/data/"
SP = "/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/"
OUT = sys.argv[1]
DUMPS = sys.argv[2] if len(sys.argv) > 2 else None
TM = json.load(open(DATA + "rooms-tmv.json"))
TR = json.load(open(DATA + "hk-rando-transitions.json"))
LT = {t["Name"]: t for t in lj(DATA + "hk-rando-logic-transitions.json")}
WIKI = json.load(open(SP + "dl/enemy-wiki.json"))
PX = 64.0  # our px per HK unit (HK view 30 x 16.875 u = 1920 x 1080 of ours)

ROOMS = ["Tutorial_01", "Town"] + sorted(r for r in TM if r.startswith("Crossroads") and r not in (
    "Crossroads_10_preload", "Crossroads_46b", "Crossroads_49b", "Crossroads_50")) + [
    "Room_temple", "Room_ruinhouse", "Room_Charm_Shop", "Mines_33", "Fungus1_01", "Fungus1_01b"]
INSET = ["Crossroads_ShamanTemple", "Room_temple", "Room_Charm_Shop", "Room_ruinhouse"]
EXIT_ONLY = {"Fungus1_01", "Fungus1_01b", "Mines_33"}  # boundary rooms: drawn, not counted in the area metrics
NAMES = {"Tutorial_01": "King's Pass", "Town": "Dirtmouth", "Crossroads_01": "Well", "Crossroads_02": "Outside Black Egg",
         "Crossroads_03": "Outside Stag (shaft)", "Crossroads_04": "Salubra & Gruz Mother", "Crossroads_07": "Platforms (shaft)",
         "Crossroads_08": "Aspid arena", "Crossroads_09": "Brooding Mawlek", "Crossroads_10": "False Knight arena",
         "Crossroads_11_alt": "Baldur gate (to Greenpath)", "Crossroads_22": "Glowing Womb", "Crossroads_27": "Outside Tram",
         "Crossroads_30": "Hot Springs", "Crossroads_31": "Spike-pogo grub", "Crossroads_33": "Cornifer",
         "Crossroads_36": "Above Mawlek", "Crossroads_38": "Grubfather", "Crossroads_45": "Myla", "Crossroads_46": "Tram",
         "Crossroads_47": "Stag station", "Crossroads_48": "Guarded grub", "Crossroads_49": "Lift", "Crossroads_ShamanTemple": "Ancestral Mound",
         "Room_temple": "Black Egg Temple", "Room_ruinhouse": "Sly's hut", "Room_Charm_Shop": "Salubra's shop",
         "Mines_33": "Dark toll (Crystal Peak)", "Fungus1_01": "Greenpath entry", "Fungus1_01b": "Greenpath bench",
         "Crossroads_06": "Outside Ancestral Mound", "Crossroads_37": "Vessel fragment", "Crossroads_35": "Acid grub",
         "Crossroads_52": "Goam journal", "Crossroads_13": "Goam mask shard", "Crossroads_19": "Gruz junction", "Crossroads_18": "To Fungal Wastes",
         "Crossroads_21": "Below Glowing Womb", "Crossroads_14": "East junction", "Crossroads_05": "Centre grub", "Crossroads_12": "To acid grub",
         "Crossroads_25": "Mawlek upper", "Crossroads_42": "Goam corridor", "Crossroads_43": "To lift", "Crossroads_15": "To tram",
         "Crossroads_16": "Lever corridor", "Crossroads_39": "East corridor", "Crossroads_40": "Centre corridor"}

# ---------------------------------------------------------------- gates (from the randomizer logic, start kit = nail+focus)
START_ITEMS = set()
ABIL = {"ANYCLAW": "claw", "LEFTCLAW": "claw", "RIGHTCLAW": "claw", "WINGS": "wings", "LEFTDASH": "dash", "RIGHTDASH": "dash",
        "LEFTSUPERDASH": "crystal heart", "RIGHTSUPERDASH": "crystal heart", "ACID": "isma's tear", "LANTERN": "lantern",
        "SWIM": "isma's tear", "Defeated_False_Knight": "boss", "Defeated_Brooding_Mawlek": "boss", "Defeated_Gruz_Mother": "boss",
        "Defeated_Crossroads_Baldur": "spell", "Opened_Mawlek_Wall": "breakable", "Opened_Shaman_Pillar": "breakable",
        "Rescued_Sly": "key", "Rescued_Bretta": "key", "Dirtmouth_Stag": "key", "JIJIUNLOCK": "key", "Nightmare_Lantern_Lit": "key",
        "Upper_Tram": "key", "Left_Elevator": "key", "Can_Stag": "key", "INFECTED": "story"}


# read by hand from the randomizer logic printout (what each door needs when you arrive from the room's usual entrance)
GATES = {("Tutorial_01", "top2"): "claw", ("Town", "left1"): "claw", ("Town", "right1"): "wings+crystal heart",
         ("Town", "door_sly"): "key", ("Town", "door_bretta"): "key", ("Town", "door_jiji"): "key", ("Town", "door_station"): "key",
         ("Town", "room_divine"): "key", ("Town", "room_grimm"): "key",
         ("Crossroads_04", "door1"): "boss", ("Crossroads_04", "door_Mender_House"): "boss", ("Crossroads_04", "door_charmshop"): "boss",
         ("Crossroads_04", "right1"): "claw+wings", ("Crossroads_09", "left1"): "boss", ("Crossroads_09", "right1"): "boss",
         ("Crossroads_10", "left1"): "boss", ("Crossroads_10", "right1"): "boss", ("Crossroads_11_alt", "left1"): "spell",
         ("Crossroads_21", "top1"): "claw", ("Crossroads_33", "left1"): "breakable", ("Crossroads_33", "right1"): "breakable",
         ("Crossroads_35", "bot1"): "isma's tear", ("Crossroads_49", "left1"): "key", ("Mines_33", "right1"): "lantern",
         ("Crossroads_46", "tram"): "key", ("Crossroads_02", "door1"): None}


def gate_of(scene, door):
    return GATES.get((scene, door))


def gate_of_logic(scene, door):
    t = LT.get(f"{scene}[{door}]")
    if not t:
        return None
    lg = t["logic"]
    # the door is free if some alternative needs only room access tokens
    alts = [a.strip() for a in re.split(r"\|(?![^()]*\))", lg)]
    best = None
    for a in alts:
        toks = re.findall(r"[A-Za-z_'$]+(?:\[[^\]]*\])?", a)
        needs = [ABIL[x] for x in toks if x in ABIL]
        other = [x for x in toks if x not in ABIL and not re.match(r"^(Crossroads|Town|Tutorial|Room|Mines|Fungus|Bench)", x) and x != "NONE"]
        if not needs and not other:
            return None
        if needs and (best is None or len(needs) < len(best)):
            best = needs
    return best[0] if best else None


# ---------------------------------------------------------------- room sources
def mined_room(r):
    t = TM[r]
    doors = {k: (d["x"], d["y"]) for k, d in t.get("transitions", {}).items() if d.get("x") is not None}
    xs = [p[0] for p in doors.values()] + [d["x"] for d in t.get("items", {}).values() if d.get("x") is not None] + [b["x"] for b in t.get("benches", [])]
    ys = [p[1] for p in doors.values()] + [d["y"] for d in t.get("items", {}).values() if d.get("x") is not None] + [b["y"] for b in t.get("benches", [])]
    rights = [p[0] for k, p in doors.items() if k.startswith("right")]
    tops = [p[1] for k, p in doors.items() if k.startswith("top")]
    W = (max(rights) - 0.5) if rights else max(xs + [0]) + 4
    H = (max(tops) - 0.5) if tops else max(ys + [0]) + 8
    src = "estimate"
    if r in SO["SIZES"]:
        W, H = SO["SIZES"][r]; src = "mined"
    room = {"W": W, "H": H, "doors": doors, "terrain": [], "things": [], "enemies": [], "src": src}
    room["terrain"] = envelope(r, W, H) + secrets_terrain(r)
    room["enemies"] = mined_enemies(r)
    return room


# ---------------------------------------------------------------- hallownest-calculator data (extracted from the game files by its author)
SO = json.load(open(SP + "dl/calc/scene-objects.json"))
from mapmask import scene_ground


def envelope(r, W, H):
    """solid = rock in the game's own map drawing of the room (1-unit cells, merged to rectangles). Stylised: no
    interior platforms, smoothed outlines. kind solid, tagged envelope."""
    g = scene_ground(r)
    if g is None:
        return []
    g = fit_shift(r, g)
    Hd, Wd = g.shape
    rects = []
    open_ = {}
    for j in range(Hd + 1):
        runs = []
        if j < Hd:
            row = ~g[j]
            i = 0
            while i < Wd:
                if row[i]:
                    k = i
                    while k < Wd and row[k]:
                        k += 1
                    runs.append((i, k)); i = k
                else:
                    i += 1
        new = {}
        for run in runs:
            new[run] = open_.pop(run, j)
        for (a, b), j0 in open_.items():
            rects.append((a, j0, b, j))
        open_ = new
    out = []
    for (a, j0, b, j1) in rects:
        y_top, y_bot = Hd - j0, Hd - j1   # scene y (up)
        out.append({"kind": "solid", "pts": [(a, y_bot), (b, y_bot), (b, y_top), (a, y_top)], "closed": True, "name": "map-envelope"})
    return out


import numpy as np
FIT = {}


def fit_shift(r, g):
    """The map drawing is stylised and sometimes offset (Dirtmouth's floor is ~9 u high). Shift it (dx +-4, dy +-14 u) so
    floor things (benches, geo rocks, grubs, totems, walkers, doors) stand in air with rock 1-3 u below them."""
    Hd, Wd = g.shape
    t = TM.get(r, {})
    air, floor = [], []
    for k, d in t.get("transitions", {}).items():
        if d.get("x") is None or k in ("tram", "elevator", "elev_entrance"): continue
        x, y = d["x"], d["y"]
        if k.startswith("left"): x += 1.5
        if k.startswith("right"): x -= 1.5
        if k.startswith("top"): y -= 2
        if k.startswith("bot"): y += 2
        air.append((x, y))
        if k.startswith(("door", "room")): floor.append((x, y - 1))
    for d in t.get("items", {}).values():
        if d.get("x") is None: continue
        air.append((d["x"], d["y"] + 0.3))
        if d.get("randPool") in ("Rock", "Grub", "Soul", "Boss_Geo"): floor.append((d["x"], d["y"]))
    for b in t.get("benches", []):
        air.append((b["x"], b["y"] + 0.5)); floor.append((b["x"], b["y"]))
    for jid, n, x, y in SO["ENEMIES"].get(r, []):
        if jid in ("Crawler", "ZombieRunner", "ZombieHornhead", "ZombieLeaper", "ZombieBarger", "ZombieShield", "ZombieGuard", "Roller", "Blocker", "Mawlek") and n == 1:
            air.append((x, y)); floor.append((x, y))
    if not air:
        return g
    def at(gg, x, y):
        i, j = int(x), Hd - 1 - int(y)
        return bool(gg[j, i]) if 0 <= i < Wd and 0 <= j < Hd else True
    best = (-1, 0, 0)
    for dy in range(-14, 15):
        for dx in range(-4, 5):
            sc = sum(at(g, x - dx, y - dy) for x, y in air)
            sc += sum(any(not at(g, x - dx, y - dy - k) for k in (1, 2, 3)) for x, y in floor)
            sc -= 0.2 * (abs(dx) + abs(dy))
            if sc > best[0]:
                best = (sc, dx, dy)
    _, dx, dy = best
    FIT[r] = (dx, dy, round(best[0], 2), len(air) + len(floor))
    out = np.zeros_like(g)
    ys, xs = np.nonzero(g)
    ys2, xs2 = ys - dy, xs + dx
    ok = (ys2 >= 0) & (ys2 < Hd) & (xs2 >= 0) & (xs2 < Wd)
    out[ys2[ok], xs2[ok]] = True
    return out


SECRET_KIND = {"wall": "breakable", "floor": "breakable", "oneway": "breakable", "hidden": "secretWall"}


def secrets_terrain(r):
    out = []
    for kind, name, x, y in SO["SECRETS"].get(r, []):
        if kind == "hidden":
            w, h = 6, 5     # a Secret Mask: the dark cover over a hidden room; real size unknown here
        elif kind == "floor":
            w, h = 4 if "Small" in name or "Quake" in name else 6, 1
        else:
            w, h = 1, 4
        out.append({"kind": SECRET_KIND[kind], "pts": [(x - w / 2, y - h / 2), (x + w / 2, y - h / 2), (x + w / 2, y + h / 2), (x - w / 2, y + h / 2)],
                    "closed": True, "name": f"{kind}: {name} (size estimated, centre mined)"})
    return out


# journal id -> (name, wiki page, behaviour key, difficulty 1-5, why, first-visit?)
EN = {
    "Crawler": ("Crawlid", "Crawlid", 1, "8 HP, walks a ledge, never attacks", True),
    "Buzzer": ("Vengefly", "Vengefly", 2, "8 HP flier that homes in once it sees you", True),
    "Climber": ("Tiktik", "Tiktik", 1, "8 HP, crawls round its platform, wall and ceiling", True),
    "ZombieRunner": ("Wandering Husk", "Wandering_Husk", 2, "15 HP (3 hits), charges when it sees you", True),
    "ZombieHornhead": ("Husk Hornhead", "Husk_Hornhead", 2, "15 HP, fast head-down charge", True),
    "ZombieLeaper": ("Leaping Husk", "Leaping_Husk", 2, "15 HP, leaps at you", True),
    "ZombieBarger": ("Husk Bully", "Husk_Bully", 2, "15 HP, short lunge", True),
    "ZombieShield": ("Husk Warrior", "Husk_Warrior", 3, "15 HP but blocks with a shield, 3-hit combo", True),
    "ZombieGuard": ("Husk Guard", "Husk_Guard", 4, "70 HP (14 hits), club slam for 2 masks + shockwaves", True),
    "ZombieMiner": ("Husk Miner", "Husk_Miner", 2, "Myla (an NPC) turns hostile late; first visit she is friendly", False),
    "Spitter": ("Aspid Hunter", "Aspid_Hunter", 3, "15 HP flier, spits arcing acid from range", True),
    "Hatcher": ("Aspid Mother", "Aspid_Mother", 3, "20 HP, births hatchlings up to 15", True),
    "Hatchling": ("Aspid Hatchling", "Aspid_Hatchling", 1, "5 HP, spawned by mothers", True),
    "Bouncer": ("Gruzzer", "Gruzzer", 1, "8 HP, bounces on a fixed line, never aims", True),
    "Roller": ("Baldur", "Baldur", 2, "15 HP, rolls at you, bounces off walls", True),
    "Blocker": ("Elder Baldur", "Elder_Baldur", 3, "60 HP but invulnerable when curled: a wall that needs Vengeful Spirit", True),
    "Mawlek": ("Brooding Mawlek", "Brooding_Mawlek", 5, "300 HP optional boss: spit arcs, leaps, slashes", True),
    "BigFly": ("Gruz Mother", "Gruz_Mother", 4, "90 HP optional boss: charge and wall-to-wall slam; 7-8 gruzzers burst out", True),
    "FalseKnight": ("False Knight", "False_Knight", 5, "first required boss: 3x65 armour + 4x40 head = 355 HP, leaps, slams for 2, falling barrels", True),
    "PrayerSlug": ("Maggot", "Maggot", 1, "harmless, flees", True),
    "MenderBug": ("Menderbug", "Menderbug", 1, "harmless, 2% chance to appear, flies away", True),
    "AngryBuzzer": ("Furious Vengefly", None, 3, "infected-Crossroads variant", False),
    "BurstingZombie": ("Violent Husk", None, 3, "infected-Crossroads variant", False),
    "SpittingZombie": ("Slobbering Husk", None, 3, "infected-Crossroads variant", False),
    "BurstingBouncer": ("Volatile Gruzzer", None, 2, "infected-Crossroads variant", False),
    "EggSac": ("Rancid egg sac", None, 1, "a pickup holder, not a fighter", False),
    "CrystalCrawler": ("Glimback", "Glimback", 2, "35 HP armoured walker (Crystal Peak toll room)", True),
    "MossWalker": ("Mosscreep", "Mosscreep", 1, "10 HP bush walker", True),
    "MossmanRunner": ("Mosskin", None, 2, "Greenpath husk", True),
    "MossmanShaker": ("Volatile Mosskin", None, 2, "Greenpath husk", True),
    "Pigeon": ("Maskfly", None, 1, "harmless platform flier", True),
    "SnapperTrap": ("Fool Eater", "Fool_Eater", 2, "16 HP hidden snapping plant", True),
}
HP_OVERRIDE = {"FalseKnight": 355, "Goam": None, "Mawlek": 300, "BigFly": 90, "ZombieMiner": 15, "MossmanRunner": 10, "MossmanShaker": 10, "Pigeon": 1,
               "AngryBuzzer": 18, "BurstingZombie": 20, "SpittingZombie": 15, "BurstingBouncer": 8}
SPAWNED = {"Hatchling", "Bouncer@Crossroads_04"}


def mined_enemies(r):
    out = []
    groups = list(SO["ENEMIES"].get(r, []))
    if r == "Crossroads_10":
        groups += [g for g in SO["ENEMIES"].get("Crossroads_10_boss", []) if g[0] == "FalseKnight"]
    for jid, n, x, y in groups:
        name, page, diff, why, first = EN.get(jid, (jid, None, 2, "unknown", True))
        w = WIKI.get(page or "", {})
        hp = HP_OVERRIDE.get(jid) or (int(w["hp"]) if w.get("hp", "").isdigit() else None)
        e = {"id": f"{r}-{jid}", "kind": name, "journalId": jid, "count": n, "x": x, "y": y, "atIsGroupCentre": n > 1,
             "hp": hp, "contactDamage": 1, "behaviour": (w.get("beh") or why).split("\n")[0][:300],
             "difficulty": diff, "difficultyWhy": why, "firstVisit": first,
             "spawned": jid in SPAWNED or f"{jid}@{r}" in SPAWNED,
             "src": "mined (count and group centre: hallownest-calculator scene-objects.js, from the game files); hp+behaviour: wiki"}
        if jid in ("ZombieGuard", "FalseKnight"):
            e["attack"] = "club/mace slam deals 2 masks; shockwave 1"
        elif jid in ("Spitter", "Mawlek"):
            e["attack"] = "ranged acid blobs, 1 mask each"
        if jid == "Mawlek":
            e["respawns"] = False
        if jid in ("Crawler", "Buzzer", "Climber", "Bouncer", "ZombieRunner"):
            e["respawns"] = True
        out.append(e)
    return out


def dumped_room(r):
    p = os.path.join(DUMPS, r + ".json")
    if not os.path.exists(p):
        return None
    return json.load(open(p))


# ---------------------------------------------------------------- things from TMV (exact positions, mined)
POOL = {"Grub": ("pickup-major", "grub"), "Mask": ("pickup-major", "mask shard"), "Vessel": ("pickup-major", "vessel fragment"),
        "Charm": ("pickup-major", "charm"), "Skill": ("pickup-major", "ability"), "Key": ("pickup-major", "key item"),
        "Map": ("pickup-major", "map"), "Relic": ("pickup-major", "relic"), "Stag": ("save", "stag station"),
        "Rock": ("breakable", "geo rock"), "Soul": ("breakable", "soul totem"), "Lore": ("lore", "lore tablet"),
        "Cocoon": ("pickup-minor", "lifeblood cocoon"), "Root": ("pickup-minor", "whispering root (needs dream nail)"),
        "Geo": ("pickup-major", "geo chest"), "Boss_Geo": ("pickup-minor", "boss geo"), "Egg": ("pickup-minor", "rancid egg"),
        "Ore": ("pickup-major", "pale ore"), "Essence_Boss": ("boss", "dream boss (late)"), "Cursed": ("landmark", "tutorial prompt"),
        "CursedNail": ("landmark", "tutorial prompt"), "Flame": ("pickup-minor", "grimmkin flame (late DLC)")}
# how each thing is hidden: logic needs (randomizer logic) + the nearest secret object (scene-objects SECRETS) in its room
LOCLOGIC = {l["name"]: l["logic"] for l in lj(DATA + "hk-rando-logic-locations.json")}
NEED = [("ANYCLAW|LEFTCLAW|RIGHTCLAW|FULLCLAW", "claw"), ("WINGS", "wings"), ("ANYDASH|LEFTDASH|RIGHTDASH", "dash"),
        ("SUPERDASH", "crystal heart"), ("ACID|SWIM", "isma's tear"), ("DREAMNAIL", "dream nail"), ("UPWALLBREAK", "nail: break a wall from below/up-slash"),
        ("ENEMYPOGOS|BACKGROUNDPOGOS", "pogo (down-slash bounce)"), ("TAKEDAMAGE", "take a hit (damage boost)"),
        ("Quake_Floor", "desolate dive"), ("Defeated_", "boss/miniboss"), ("GRIMMCHILD", "grimmchild (DLC, late)"), ("TRAM", "tram pass")]
BOSSDROP = {"City_Crest": "dropped by False Knight", "Mask_Shard-Brooding_Mawlek": "reward for the optional Brooding Mawlek",
            "200_Geo-False_Knight_Chest": "chest behind the False Knight arena", "Boss_Geo-Gruz_Mother": "dropped by Gruz Mother",
            "Crossroads_Map": "sold by Cornifer, found by following his paper trail", "Boss_Essence-Failed_Champion": "late dream boss"}


def hidden_of(r, name, x, y):
    lg = LOCLOGIC.get(name, "")
    if lg.startswith("*"):
        lg = LOCLOGIC.get(lg[1:], "")
    alts = [a.strip() for a in re.split(r"\|(?![^()\[]*[)\]])", lg)] if lg else []
    # the easiest alternative: fewest special needs
    needs = None
    for a_ in alts:
        n = sorted({lab for pat, lab in NEED if re.search(pat, a_)})
        if needs is None or len(n) < len(needs):
            needs = n
    needs = needs or []
    near = None
    for kind, sname, sx, sy in SO["SECRETS"].get(r, []):
        d = math.hypot(sx - x, sy - y)
        if d <= 15 and (near is None or d < near[0]):
            near = (d, kind, sname)
    how = []
    if name in BOSSDROP: how.append(BOSSDROP[name])
    if near: how.append(f"{near[1]} secret '{near[2]}' {near[0]:.0f} u away")
    if not how and not needs:
        return None
    return {"how": "; ".join(how) or "in the open, out of reach without the ability", "needs": (("one of: " if len(needs) > 1 else "") + ", ".join(needs)) or "nail",
            "src": "mined (randomizer logic; secret objects from scene-objects.js); how is inferred from proximity"}


def mined_things(r):
    out = []
    t = TM[r]
    for k, d in t.get("items", {}).items():
        if d.get("x") is None:
            continue
        pool = d.get("randPool")
        kind, label = POOL.get(pool, ("pickup-minor", pool))
        if r == "Room_Charm_Shop":
            kind, label = "shop", "charm (bought)"
        if r == "Crossroads_38":
            kind, label = "pickup-major", "grub reward"
        th = {"id": k, "kind": kind, "label": label, "x": d["x"], "y": d["y"], "src": "mined"}
        if d.get("geo"):
            th["value"] = f'{d["geo"]} geo'
        h = hidden_of(r, k, d["x"], d["y"])
        if h:
            th["hidden"] = h
        out.append(th)
    for b in t.get("benches", []):
        if r == "Crossroads_01":
            continue  # TangledMapView lists a bench here; the game has none (not in the randomizer's bench waypoints)
        out.append({"id": f"bench-{r}", "kind": "save", "label": "bench", "x": b["x"], "y": b["y"], "src": "mined"})
    if r == "Room_temple":
        out.append({"id": "bench-Room_temple", "kind": "save", "label": "bench", "x": 22.0, "y": 4.6,
                    "src": "estimate: the bench beside the World Sense tablet just inside the temple (wiki); x/y guessed"})
    for dn, d in t.get("transitions", {}).items():
        if dn.startswith("door_") or dn == "door1" or dn.startswith("room_"):
            to = d.get("to") or ""
            if d.get("x") is None:
                continue
            kind = "shop" if any(s in to for s in ("Room_shop", "Room_mapper", "Charm_Shop")) else "npc" if "Room" in to else "landmark"
            out.append({"id": f"{r}-{dn}", "kind": kind, "label": NAMES.get(to.split('[')[0], to.split('[')[0] or dn), "x": d["x"], "y": d["y"], "src": "mined"})
    return out


# ---------------------------------------------------------------- assemble rooms (local units, y up)
R = {}
for r in ROOMS:
    m = mined_room(r)
    if DUMPS:
        d = dumped_room(r)
        if d:
            m = d
            m["doors"] = mined_room(r)["doors"]
    if not DUMPS or "things" not in m or not m.get("things"):
        m["things"] = mined_things(r)
    R[r] = m

# ---------------------------------------------------------------- layout by door chaining with exact edges
edges = []
for k, v in TR.items():
    a, b = v["SceneName"], (v["VanillaTarget"] or "").split("[")[0]
    if a in R and b in R:
        ad, bd = v["DoorName"], v["VanillaTarget"].split("[")[1].rstrip("]")
        edges.append((a, ad, b, bd, v["Sides"]))
off = {"Town": (0.0, 0.0)}
q = collections.deque(["Town"])
while q:
    a = q.popleft()
    for (x, ad, b, bd, sides) in edges:
        if x != a or b in off or b in INSET or ad.startswith(("door", "room")):
            continue
        if ad not in R[a]["doors"] or bd not in R[b]["doors"]:
            continue
        pa, pb = R[a]["doors"][ad], R[b]["doors"][bd]
        ox, oy = off[a]
        if ad.startswith("right"):
            nx, ny = ox + R[a]["W"], oy + pa[1] - pb[1]
        elif ad.startswith("left"):
            nx, ny = ox - R[b]["W"], oy + pa[1] - pb[1]
        elif ad.startswith("top"):
            nx, ny = ox + pa[0] - pb[0], oy + R[a]["H"]
        else:
            nx, ny = ox + pa[0] - pb[0], oy - R[b]["H"]
        off[b] = (nx, ny)
        q.append(b)
missing = [r for r in R if r not in off and r not in INSET]
# insets: a row under the map, each tagged
minx = min(o[0] for o in off.values()); miny = min(o[1] - 0 for o in off.values())
ix = minx
for r in INSET:
    off[r] = (ix, miny - R[r]["H"] - 20)
    ix += R[r]["W"] + 12
TOPY = max(off[r][1] + R[r]["H"] for r in off)
LEFTX = min(off[r][0] for r in off)


def W2P(r, x, y):
    ox, oy = off[r]
    return [round((ox + x - LEFTX) * PX), round((TOPY - (oy + y)) * PX)]


# ---------------------------------------------------------------- shapes
def shape(r, W, H):
    sw, sh = W / 30.0, H / 16.875
    nd = len([d for d in R[r]["doors"] if not d.startswith(("door", "room", "tram", "elev"))])
    if r in ("Crossroads_10", "Crossroads_09", "Crossroads_04", "Crossroads_08", "Crossroads_22", "Crossroads_38"):
        return "setpiece"
    if nd >= 4:
        return "hub"
    if sh >= 1.8 and sh >= 1.5 * sw:
        return "shaft"
    if sw >= 1.8 and sw >= 1.5 * sh:
        return "corridor" if sh <= 1.25 else "hall"
    if sw <= 1.3 and sh <= 1.3:
        return "pocket"
    return "hall"


# ---------------------------------------------------------------- graph + critical path
G = collections.defaultdict(list)
for (a, ad, b, bd, sides) in edges:
    if a in off and b in off:
        g = gate_of(a, ad)
        G[a].append((b, ad, bd, g))
START = "Tutorial_01"
GOAL = "Crossroads_ShamanTemple"


def door_px(r, d):
    return W2P(r, *R[r]["doors"][d]) if d in R[r]["doors"] else W2P(r, R[r]["W"] / 2, R[r]["H"] / 2)


def shortest(start, goal, allowed):
    # Dijkstra over (room, entry door) by px distance inside rooms
    pq = [(0, start, None, [start])]
    seen = set()
    while pq:
        dist, r, entry, path = heapq.heappop(pq)
        if (r, entry) in seen:
            continue
        seen.add((r, entry))
        if r == goal:
            return path, dist
        ep = door_px(r, entry) if entry else W2P(r, *R[r]["doors"].get("top1", (34.5, 93.5)))
        for (b, ad, bd, g) in G[r]:
            if g and g not in allowed:
                continue
            xp = door_px(r, ad)
            heapq.heappush(pq, (dist + math.dist(ep, xp), b, bd, path + [b]))
    return None, None


cp, cpd = shortest(START, GOAL, {"boss", "story"})
CP = set(cp or [])

# ---------------------------------------------------------------- emit
rooms, terrain, things, enemies = [], [], [], []
for r in R:
    if r not in off:
        continue
    W, H = R[r]["W"], R[r]["H"]
    x0, y0 = W2P(r, 0, H)
    ex = []
    for (b, ad, bd, g) in G[r]:
        e = {"to": b, "side": re.sub(r"\d+$", "", ad), "at": door_px(r, ad)}
        tr = TR.get(f"{r}[{ad}]", {})
        if tr.get("Sides") == "OneWayOut":
            e["oneWay"] = True
        if g:
            e["gate"] = g
        ex.append(e)
    for dn, (dx, dy) in R[r]["doors"].items():
        if not any(e["at"] == door_px(r, dn) for e in ex) and not dn.startswith(("door", "room", "elev", "tram")):
            tr = TR.get(f"{r}[{dn}]", {})
            tgt = (tr.get("VanillaTarget") or "outside").split("[")[0]
            e = {"to": tgt, "side": re.sub(r"\d+$", "", dn), "at": door_px(r, dn), "outOfArea": True}
            if tr.get("Sides") == "OneWayOut":
                e["oneWay"] = True
            g = gate_of(r, dn)
            if g:
                e["gate"] = g
            ex.append(e)
    rooms.append({"id": r, "name": NAMES.get(r, TM.get(r, {}).get("name") or r), "rect": [x0, y0, round(W * PX), round(H * PX)],
                  "screens": round(W * H / (30 * 16.875), 2), "shape": shape(r, W, H), "onCriticalPath": r in CP,
                  "inset": r in INSET, "boundary": r in EXIT_ONLY, "sizeSrc": R[r].get("src", "files"), "exits": ex})
    for t in R[r].get("terrain", []):
        terrain.append({"roomId": r, "kind": t["kind"], "poly": [W2P(r, *p) for p in t["pts"]], "closed": t.get("closed", True),
                        **({"name": t["name"]} if t.get("name") else {})})
    for t in R[r]["things"]:
        o = {k: v for k, v in t.items() if k not in ("x", "y")}
        o["roomId"] = r
        o["at"] = W2P(r, t["x"], t["y"])
        things.append(o)
    for e in R[r].get("enemies", []):
        o = {k: v for k, v in e.items() if k not in ("x", "y", "px0", "px1")}
        o["roomId"] = r
        o["at"] = W2P(r, e["x"], e["y"])
        if "px0" in e:
            o["patrol"] = [W2P(r, e["px0"], e["y"])[0], W2P(r, e["px1"], e["y"])[0]]
        enemies.append(o)

# critical path polyline through the doors used
cpp = []
if cp:
    for a, b in zip(cp, cp[1:]):
        if b in INSET:
            break
        for (x, ad, bd, g) in G[a]:
            if x == b:
                cpp.append(door_px(a, ad)); cpp.append(door_px(b, bd)); break
area = json.load(open(SP + "hk/area-head.json"))
area["notes"] = ["enemies: one entry per Hunter's-Journal type per room with count; 'at' is the group's centre when count > 1 (individual spots not in the mined data)",
                 "enemies with firstVisit false are the Infected-Crossroads variants (after Monarch Wings or a Dreamer); spawned true = hatchlings / Gruz Mother's brood",
                 "terrain 'solid' rectangles named map-envelope come from the game's own map drawing of each room (1-unit cells): outer walls, floors and ceilings of the cave; interior platforms, slopes and spikes are NOT in it",
                 "breakable/secretWall boxes: centre mined, size estimated",
                 "insets: Ancestral Mound, Black Egg Temple, Salubra's shop and Sly's hut are entered by background doors; they are drawn in a row below the map, not in place",
                 "boundary rooms (Greenpath x2, Crystal Peak toll) are drawn but excluded from the metrics"]
area.update({"rooms": rooms, "terrain": terrain, "things": things, "enemies": enemies, "criticalPath": cp,
             "criticalPathPoints": cpp, "criticalPathPx": round(cpd or 0)})
json.dump(area, open(OUT, "w"), indent=1)
print("rooms", len(rooms), "terrain", len(terrain), "things", len(things), "enemies", len(enemies), "unplaced", missing)
print("envelope shifts (dx, dy, score, probes)", {k: v for k, v in FIT.items() if v[:2] != (0, 0)})
print("critical path", cp, round(cpd or 0), "px")
