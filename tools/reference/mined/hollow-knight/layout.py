"""Place HK rooms in one world frame by chaining matched doors (scene-local Unity units, y up).
B.offset = A.offset + A.door - B.door, nudged so the two room edges touch (doors sit 0.5 u outside the room).
usage: layout.py <rooms-tmv.json> <out.json> [sizes.json]"""
import json, sys, collections
TM = json.load(open(sys.argv[1]))
ROOMS = ["Tutorial_01", "Town"] + [r for r in TM if r.startswith("Crossroads") and r not in (
    "Crossroads_10_preload", "Crossroads_46b", "Crossroads_49b", "Crossroads_50")] + [
    "Room_temple", "Room_ruinhouse", "Room_Charm_Shop", "Mines_33", "Fungus1_01", "Fungus1_01b"]
INTERIOR = {"Room_temple", "Room_ruinhouse", "Room_Charm_Shop", "Crossroads_ShamanTemple"}
off = {"Town": (0.0, 0.0)}
q = collections.deque(["Town"])
edges = []
while q:
    a = q.popleft()
    for dn, d in TM[a].get("transitions", {}).items():
        to = d.get("to")
        if not to or d.get("x") is None:
            continue
        b, bd = to.split("[")
        bd = bd.rstrip("]")
        if b not in ROOMS:
            continue
        db = TM[b]["transitions"].get(bd)
        if not db or db.get("x") is None:
            continue
        edges.append((a, dn, b, bd))
        if b in off:
            continue
        # door-type rooms (interiors) are placed beside, not chained by door coordinates
        nx = off[a][0] + d["x"] - db["x"]
        ny = off[a][1] + d["y"] - db["y"]
        if dn.startswith("right"): nx -= 1
        if dn.startswith("left"): nx += 1
        if dn.startswith("top"): ny -= 1
        if dn.startswith("bot"): ny += 1
        if dn.startswith("door") or bd.startswith("door"):
            continue  # interior rooms: kept out of the world layout
        off[b] = (nx, ny)
        q.append(b)
json.dump({"offset": off, "edges": edges, "rooms": ROOMS}, open(sys.argv[2], "w"), indent=0)
print(len(off), "placed of", len(ROOMS), "missing", [r for r in ROOMS if r not in off])
