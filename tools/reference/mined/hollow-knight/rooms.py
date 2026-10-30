"""Turn extract.py's scene dumps into per-room data in each scene's own units (y up), for build.py.

usage: python -I rooms.py <dumps dir> <out rooms.json>

Per room: W, H (the scene's tk2dTileMap, which is also the camera's bounds), doors (TransitionPoints: name ->
centre, target, entry, isADoor), terrain (solid = enabled, non-trigger colliders on layer 8 "Terrain" of objects
active at load; breakable = walls / floors / collapsers by their FSM; secretWall = the dark masks over hidden rooms
(unmasker FSMs: the mask sprite's bounds, else its trigger); hazard = DamageHero hazardType 2 spikes / 3 acid),
things (by component / FSM, first-visit state), enemies (HealthManager objects present on a first visit, incl. battle
waves; hp, contact damage from DamageHero), camera locks, hazard respawn points. Every value is from the files."""
import collections, json, math, os, re, sys

DUMPS, OUT = sys.argv[1], sys.argv[2]

ROOMS = ["Tutorial_01", "Town", "Crossroads_01", "Crossroads_02", "Crossroads_03", "Crossroads_04", "Crossroads_05",
         "Crossroads_06", "Crossroads_07", "Crossroads_08", "Crossroads_09", "Crossroads_10", "Crossroads_11_alt",
         "Crossroads_12", "Crossroads_13", "Crossroads_14", "Crossroads_15", "Crossroads_16", "Crossroads_18",
         "Crossroads_19", "Crossroads_21", "Crossroads_22", "Crossroads_25", "Crossroads_27", "Crossroads_30",
         "Crossroads_31", "Crossroads_33", "Crossroads_35", "Crossroads_36", "Crossroads_37", "Crossroads_38",
         "Crossroads_39", "Crossroads_40", "Crossroads_42", "Crossroads_43", "Crossroads_45", "Crossroads_46",
         "Crossroads_47", "Crossroads_48", "Crossroads_49", "Crossroads_52", "Crossroads_ShamanTemple", "Room_temple",
         "Room_ruinhouse", "Room_Charm_Shop", "Mines_33", "Fungus1_01", "Fungus1_01b"]
ADDITIVE = {"Crossroads_10": ["Crossroads_10_boss"]}   # the False Knight fight is loaded into the arena additively

# object name (numbers stripped) -> journal id (build.py's EN table has names, difficulty, why)
JOURNAL = {"Crawler": "Crawler", "Buzzer": "Buzzer", "Climber": "Climber", "Fly": "Bouncer", "Spitter": "Spitter",
           "Hatcher": "Hatcher", "Hatcher NP": "Hatcher", "Roller": "Roller", "Blocker": "Blocker",
           "Zombie Runner": "ZombieRunner", "Zombie Hornhead": "ZombieHornhead", "Zombie Leaper": "ZombieLeaper",
           "Zombie Barger": "ZombieBarger", "Zombie Shield": "ZombieShield", "Zombie Guard": "ZombieGuard",
           "Giant Fly": "BigFly", "Mawlek Body": "Mawlek", "False Knight New": "FalseKnight", "Mender Bug": "MenderBug",
           "Angry Buzzer": "AngryBuzzer", "Bursting Zombie": "BurstingZombie", "Spitting Zombie": "SpittingZombie",
           "Bursting Bouncer": "BurstingBouncer", "Crystal Crawler": "CrystalCrawler", "Moss Walker": "MossWalker",
           "Mossman_Runner": "MossmanRunner", "Mossman_Shaker": "MossmanShaker", "Pigeon": "Pigeon",
           "Plant Trap": "SnapperTrap", "Worm": "Goam", "Zombie Myla": "ZombieMiner", "Prayer Slug": "PrayerSlug"}
NOT_FIGHTERS = {"Hatcher Baby Spawner", "Head", "Egg Sac", "Zombie Myla", "Prayer Slug", "Crawler Fixed"}
BREAK_FSM = {"breakable_wall_v2": "breakable wall", "break_floor": "breakable floor", "quake_floor": "dive floor (Desolate Dive)",
             "collapse small": "collapsing floor", "collapse tute": "collapsing floor (tutorial)", "Break": "breakable wall"}
NPC_FIRST = {"Elderbug": "Elderbug", "Cornifer": "Cornifer (sells the map)", "Iselda": "Iselda (map shop)",
             "Charm Slug": "Salubra (charm shop)", "Sly Dazed": "Sly (rescue)", "Shaman Meeting": "Snail Shaman",
             "Quirrel": "Quirrel", "Miner": "Myla", "Stag": "Stag", "Tiso Bench NPC": None, "Sly Shop": "Sly (shop, after rescue)"}
SHOP_ROOMS = {"Room_Charm_Shop", "Room_mapper", "Room_shop"}
PERSISTENT_LATE = ("Zote", "Grimm", "Divine", "Charm Notch", "Mr Mushroom", "Cloth", "Nymm", "Bretta", "Ghost", "Hornet",
                   "Tiso", "Jiji", "Gravedigger", "Crazy", "Killed", "Trapped", "Dreamer", "Elderbug Grimm")


def base(n):
    return re.sub(r"\s*\(\d+\)$|\s\d+$", "", n).strip()


def bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def rect_pts(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def col_polys(r, trig=None):
    out = []
    for c in r["col"]:
        if trig is not None and c["trig"] != trig:
            continue
        if c.get("paths"):
            out += [(p, True, c) for p in c["paths"] if len(p) >= 2]
        elif c.get("pts"):
            closed = c["t"] == "BoxCollider2D" or (len(c["pts"]) > 2 and math.dist(c["pts"][0], c["pts"][-1]) < 1e-3)
            out.append((c["pts"], closed, c))
        elif c.get("c"):
            x, y = c["c"]; rr = c["r"]
            out.append(([[x + rr * math.cos(a * math.pi / 6), y + rr * math.sin(a * math.pi / 6)] for a in range(12)], True, c))
    return out


def inside(x, y, loops):
    """even-odd test against several closed loops"""
    c = False
    for L in loops:
        n = len(L)
        for i in range(n):
            (x1, y1), (x2, y2) = L[i], L[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                c = not c
    return c


def covered(pts, cells):
    """share of a polygon's 1-unit cells (by centre) that are tile-map solid already"""
    x0, y0, x1, y1 = bbox(pts)
    tot = hit = 0
    for j in range(math.floor(y0), math.ceil(y1)):
        for i in range(math.floor(x0), math.ceil(x1)):
            if inside(i + 0.5, j + 0.5, [pts]):
                tot += 1
                hit += (i, j) in cells
    return hit / tot if tot else 1.0


def tile_rects(chunks):
    """The tile map's collision: each 'Chunk i j' holds edge loops around its solid tiles (holes are loops too).
    Fill 1-unit cells by even-odd per chunk, then merge into rectangles (rows, then equal runs downwards)."""
    cells = set()
    for loops in chunks:
        pts = [p for L in loops for p in L]
        x0, y0 = math.floor(min(p[0] for p in pts)), math.floor(min(p[1] for p in pts))
        x1, y1 = math.ceil(max(p[0] for p in pts)), math.ceil(max(p[1] for p in pts))
        for j in range(y0, y1):
            for i in range(x0, x1):
                if inside(i + 0.5, j + 0.5, loops):
                    cells.add((i, j))
    rows = collections.defaultdict(list)
    for i, j in sorted(cells):
        rows[j].append(i)
    runs = {}
    for j, xs in rows.items():
        rr, a = [], xs[0]
        for k in range(1, len(xs) + 1):
            if k == len(xs) or xs[k] != xs[k - 1] + 1:
                rr.append((a, xs[k - 1] + 1))
                if k < len(xs):
                    a = xs[k]
        runs[j] = rr
    out, open_ = [], {}
    for j in sorted(runs) + [None]:
        cur = set(runs[j]) if j is not None else set()
        nxt = {}
        for run, (j0, jl) in open_.items():
            if run in cur and j == jl + 1:
                nxt[run] = (j0, j)
            else:
                out.append((run[0], j0, run[1], jl + 1))
        for run in cur:
            if run not in nxt:
                nxt[run] = (j, j)
        open_ = nxt
    return out, cells


def sprite_bounds(r):
    sr = r.get("sr")
    if not sr or not sr.get("si"):
        return None
    _, x0, y0, x1, y1, _ = sr["si"]
    M = sr["M"]
    pts = [[M[0] * x + M[1] * y + M[3], M[4] * x + M[5] * y + M[7]] for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    return bbox(pts)


def scene(sc):
    p = os.path.join(DUMPS, sc + ".json")
    return json.load(open(p)) if os.path.exists(p) else None


def context(objs):
    """per object: flags inherited from ancestors (INF infected-only, UNINF, BATTLE, needs:<bool>, gone:<bool>)"""
    bypath = {r["path"]: r for r in objs}
    out = {}
    for r in objs:
        tags = set()
        parts = r["path"].split("/")
        for i in range(1, len(parts) + 1):
            a = bypath.get("/".join(parts[:i]))
            if not a:
                continue
            for f in a["mono"].get("PlayMakerFSM", []):
                if f["name"] == "Activate Infected":
                    tags.add("INF" if f["vars"].get("Active If Bool True") else "UNINF")
                if f["name"] in ("Battle Scene", "Battle Control"):
                    tags.add("BATTLE")
            if "DeactivateIfPlayerdataFalse" in a["mono"]:
                tags.add("needs:" + a["mono"]["DeactivateIfPlayerdataFalse"].get("boolName", ""))
            if "DeactivateIfPlayerdataTrue" in a["mono"]:
                tags.add("gone:" + a["mono"]["DeactivateIfPlayerdataTrue"].get("boolName", ""))
            if "Battle Scene" in a["name"]:
                tags.add("BATTLE")
        out[r["id"]] = tags
    return out


def first_visit(r, tags):
    if "INF" in tags or any(t.startswith("needs:") and t != "needs:visitedDirtmouth" for t in tags):
        return False
    return r["activeH"] or ("BATTLE" in tags)


def fsms(r):
    return {f["name"]: f for f in r["mono"].get("PlayMakerFSM", [])}


def room(sc):
    objs = scene(sc)
    if objs is None:
        return None
    extra = []
    for a in ADDITIVE.get(sc, []):
        extra += scene(a) or []
    tm = [r["mono"]["tk2dTileMap"] for r in objs if "tk2dTileMap" in r["mono"]]
    W, H = (tm[0]["width"], tm[0]["height"]) if tm else (None, None)
    ctx = context(objs)
    ctx.update(context(extra))
    R = {"W": W, "H": H, "src": "files", "doors": {}, "doorInfo": {}, "terrain": [], "things": [], "enemies": [],
         "camLocks": 0, "hazardRespawns": 0}
    breaker_ids, mask_ids = set(), set()
    chunks = []
    for r in objs + extra:
        m, F, tags = r["mono"], fsms(r), ctx[r["id"]]
        nm, bn = r["name"], base(r["name"])
        # ---- transitions
        if "TransitionPoint" in m:
            tp = m["TransitionPoint"]
            cs = [c for c in col_polys(r)]
            if cs:
                x0, y0, x1, y1 = bbox(cs[0][0]); c = [(x0 + x1) / 2, (y0 + y1) / 2]
            else:
                c = r["pos"][:2]
            R["doors"][nm] = [round(c[0], 2), round(c[1], 2)]
            R["doorInfo"][nm] = {"target": tp.get("targetScene"), "entry": tp.get("entryPoint"), "isDoor": bool(tp.get("isADoor")),
                                 "activeAtLoad": r["activeH"]}
            continue
        if "CameraLockArea" in m:
            R["camLocks"] += 1
        if "HazardRespawnTrigger" in m:
            R["hazardRespawns"] += 1
        # ---- breakables and secret masks (terrain)
        bk = next((BREAK_FSM[k] for k in F if k in BREAK_FSM), None)
        if bk is None and bn in ("Break Wall", "Fk Break Wall", "One Way Wall", "full_wall_left", "sliding_wall"):
            bk = "breakable wall" if bn != "One Way Wall" else "one-way breakable wall (breaks from one side)"
        if bn == "One Way Wall":
            bk = "one-way breakable wall (breaks from one side)"
        if bk and r["layer"] == 8 and first_visit(r, tags | ({"BATTLE"} if r["activeH"] else set())):
            for pts, closed, c in col_polys(r):
                R["terrain"].append({"kind": "breakable", "pts": pts, "closed": True, "name": f"{bk}: {nm}",
                                     "hits": F.get("breakable_wall_v2", {}).get("vars", {}).get("Hits")})
            breaker_ids.add(r["id"])
            continue
        if "unmasker" in F and r["activeH"]:
            # the reveal trigger is the pocket you must step into; the mask sprite (a soft blob scaled up) overshoots
            b, how = None, "reveal trigger"
            cs = col_polys(r)
            if cs:
                b = bbox(cs[0][0])
            if b is None:
                how = "mask sprite"
                b = sprite_bounds(r)
            if b is None:   # children's sprites
                kids = [sprite_bounds(k) for k in objs if k["path"].startswith(r["path"] + "/")]
                kids = [k for k in kids if k]
                if kids:
                    b = (min(k[0] for k in kids), min(k[1] for k in kids), max(k[2] for k in kids), max(k[3] for k in kids))
            if b and "Sound" not in nm and "remask" not in nm.lower():
                R["terrain"].append({"kind": "secretWall", "pts": rect_pts(*b), "closed": True,
                                     "name": f"hidden area ({how}): {nm}"})
                mask_ids.add(r["id"])
            continue
        # ---- hazards
        if "DamageHero" in m and (m["DamageHero"].get("hazardType") or 0) >= 2 and r["activeH"]:
            ht = m["DamageHero"]["hazardType"]
            for pts, closed, c in col_polys(r):
                R["terrain"].append({"kind": "hazard", "pts": pts, "closed": True,
                                     "name": f"{'spikes' if ht == 2 else 'acid' if ht == 3 else 'hazard ' + str(ht)}: {nm}",
                                     "damage": m["DamageHero"].get("damageDealt")})
            continue
        # ---- solid terrain
        if r["layer"] == 8 and r["activeH"] and "INF" not in tags and bn.startswith("Chunk") and "TileMap" in r["path"]:
            loops = [pts for pts, closed, c in col_polys(r, trig=False) if c["en"] and closed]
            if loops:
                chunks.append(loops)
            for pts, closed, c in col_polys(r, trig=False):
                if c["en"] and not closed:
                    R["terrain"].append({"kind": "solid", "pts": pts, "closed": False, "name": nm + " (open edge)"})
            continue
        if r["layer"] == 8 and r["activeH"] and "INF" not in tags:
            for pts, closed, c in col_polys(r, trig=False):
                if c["en"]:
                    R["terrain"].append({"kind": "solid", "pts": pts, "closed": closed, "name": nm})
        # ---- enemies
        if "HealthManager" in m or bn == "Worm":
            if bn in NOT_FIGHTERS:
                continue
            fv = first_visit(r, tags) and "INF" not in tags
            spawned = r["pos"][1] < -2 or (W and (r["pos"][0] < -5 or r["pos"][0] > W + 5))
            dmg = m.get("DamageHero", {}).get("damageDealt")
            kid_dmg = [k["mono"]["DamageHero"].get("damageDealt") for k in objs + extra
                       if k["path"].startswith(r["path"] + "/") and "DamageHero" in k["mono"]]
            hp = m.get("HealthManager", {}).get("hp")
            R["enemies"].append({"name": nm, "jid": JOURNAL.get(bn, bn), "x": r["pos"][0], "y": r["pos"][1], "hp": hp,
                                 "contactDamage": dmg if dmg is not None else 1, "attackDamage": max(kid_dmg) if kid_dmg else None,
                                 "firstVisit": bool(fv), "spawned": bool(spawned), "battle": "BATTLE" in tags,
                                 "infected": "INF" in tags, "activeAtLoad": r["activeH"],
                                 "geo": [m.get("HealthManager", {}).get(k, 0) for k in ("smallGeoDrops", "mediumGeoDrops", "largeGeoDrops")]})
            continue
        # ---- things
        if not first_visit(r, tags):
            # boss drops / chest contents are inactive at load: kept by name below
            if not ("Shiny Control" in F and ("Key Giver" in r["path"] or "/Chest/" in r["path"] or "Grubsong" in nm)) \
                    and "SpellGetOrb" not in m:   # the spell's orbs play in the get-sequence
                continue
        if any(s in r["path"] for s in PERSISTENT_LATE) and bn not in NPC_FIRST:
            continue
        t = None
        if "Geo Rock" in F:
            v = F["Geo Rock"]["vars"]
            geo = (v.get("Hits") or 0) * (v.get("Geo Per Hit") or 0) + (v.get("Final Payout") or 0)
            t = {"kind": "breakable", "label": "geo rock", "value": f"{geo} geo ({v.get('Hits')} hits)"}
        elif "soul_totem" in F:
            t = {"kind": "breakable", "label": "soul totem", "value": f"{F['soul_totem']['vars'].get('Value')} refills"}
        elif "Bottle Control" in F:
            t = {"kind": "pickup-major", "label": "grub"}
        elif "Heart Container Control" in F:
            t = {"kind": "pickup-major", "label": "mask shard"}
        elif "Vessel Fragment Control" in F:
            t = {"kind": "pickup-major", "label": "vessel fragment"}
        elif "Chest Control" in F:
            v = F["Chest Control"]["vars"]
            geo = (v.get("Geo Small") or 0) * 1 + (v.get("Geo Med") or 0) * 5 + (v.get("Geo Large") or 0) * 25
            inner = [k for k in objs if k["path"].startswith(r["path"] + "/") and "Shiny Control" in fsms(k)]
            if inner:
                continue   # the chest's item is listed as the shiny
            t = {"kind": "pickup-major", "label": "geo chest", "value": f"{geo} geo"}
        elif "Shiny Control" in F:
            v = F["Shiny Control"]["vars"]
            if v.get("Charm"):
                t = {"kind": "pickup-major", "label": f"charm {v.get('Charm ID')} ({v.get('PD Bool Name')})"}
            elif v.get("PD Bool Name"):
                t = {"kind": "pickup-major", "label": f"key item ({v.get('PD Bool Name')})"}
            elif v.get("Trinket Num"):
                t = {"kind": "pickup-major", "label": f"relic (trinket {v.get('Trinket Num')})"}
            else:
                t = {"kind": "pickup-major", "label": "item"}
            if "/Chest/" in r["path"]:
                t["inChest"] = True
            if "Key Giver" in r["path"]:
                t["bossDrop"] = "False Knight"
        elif "HealthCocoon" in m:
            t = {"kind": "pickup-minor", "label": "lifeblood cocoon"}
        elif "DreamPlant" in m:
            t = {"kind": "pickup-minor", "label": "whispering root (needs the dream nail)"}
        elif "RestBench" in m:
            t = {"kind": "save", "label": "bench"}
        elif "Stag Control" in F:
            t = {"kind": "save", "label": "stag station"}
        elif "Switch Control" in F:
            t = {"kind": "lever", "label": f"lever ({F['Switch Control']['vars'].get('Player Data')})"}
        elif "Toll Machine" in F:
            t = {"kind": "landmark", "label": "toll machine"}
        elif "Tablet Control" in F or ("inspect" in F and re.search(r"tablet|lore|sign|plaque", nm, re.I)):
            t = {"kind": "lore", "label": "lore tablet"}
        elif "npc_control" in F and bn in NPC_FIRST and NPC_FIRST[bn]:
            t = {"kind": "shop" if sc in SHOP_ROOMS or bn == "Cornifer" else "npc", "label": NPC_FIRST[bn]}
        elif "SpellGetOrb" in m:
            if any(x["label"].startswith("ability") for x in R["things"]):
                continue
            t = {"kind": "pickup-major", "label": "ability: Vengeful Spirit"}
        if t:
            t.update({"x": r["pos"][0], "y": r["pos"][1], "obj": nm, "src": "files"})
            R["things"].append(t)
    rects, cells = tile_rects(chunks) if chunks else ([], set())
    R["tileCells"] = len(cells)
    # extra solid colliders that only repeat the tile map (slopes and trims stay)
    R["terrain"] = [t for t in R["terrain"] if not (t["kind"] == "solid" and t["closed"] and covered(t["pts"], cells) >= 0.9)]
    R["terrain"] += [{"kind": "solid", "pts": rect_pts(a, b, c, d), "closed": True, "name": "tilemap"} for a, b, c, d in rects]
    # bosses as things
    for e in R["enemies"]:
        if e["jid"] in ("FalseKnight", "BigFly", "Mawlek") and e["firstVisit"]:
            R["things"].append({"kind": "boss", "label": {"FalseKnight": "False Knight", "BigFly": "Gruz Mother",
                                                          "Mawlek": "Brooding Mawlek"}[e["jid"]], "x": e["x"], "y": e["y"], "src": "files"})
    return R


out = {}
for sc in ROOMS:
    r = room(sc)
    if r:
        out[sc] = r
        n = collections.Counter(t["kind"] for t in r["terrain"])
        print(sc, r["W"], r["H"], "doors", len(r["doors"]), dict(n), "things", len(r["things"]),
              "enemies", sum(e["firstVisit"] and not e["spawned"] for e in r["enemies"]), "/", len(r["enemies"]))
json.dump(out, open(OUT, "w"))
