"""Measurements from area.json (any game in the shared schema). usage: metrics.py area.json"""
import collections, json, math, sys
A = json.load(open(sys.argv[1]))
VIEW = 1920 * 1080
rooms = {r["id"]: r for r in A["rooms"] if not r.get("boundary")}
CP = [r for r in A["criticalPath"] if r in rooms]
scr = {k: r["rect"][2] * r["rect"][3] / VIEW for k, r in rooms.items()}
M = {}
M["rooms"] = len(rooms)
M["screens"] = round(sum(scr.values()), 1)
M["criticalPathRooms"] = len(CP)
M["criticalPathScreens"] = round(sum(scr[r] for r in CP), 1)
M["criticalPathShare"] = {"rooms": round(len(CP) / len(rooms), 2), "screens": round(sum(scr[r] for r in CP) / M["screens"], 2)}
M["criticalPathLengthPx"] = A.get("criticalPathPx")
M["shapes"] = dict(collections.Counter(r["shape"] for r in rooms.values()))
# graph
adj = collections.defaultdict(set)
ext = collections.Counter()
for k, r in rooms.items():
    for e in r["exits"]:
        if e["to"] in rooms:
            adj[k].add(e["to"]); adj[e["to"]].add(k)
        ext[k] += 1
deg = {k: len(adj[k]) for k in rooms}
M["exitsPerRoom"] = {"mean": round(sum(ext.values()) / len(rooms), 2), "dist": dict(sorted(collections.Counter(ext[k] for k in rooms).items()))}
E = sum(len(v) for v in adj.values()) // 2
M["loops(cycleRank)"] = E - len(rooms) + 1
dead = [k for k in rooms if deg[k] == 1]
th = collections.defaultdict(list)
for t in A["things"]:
    th[t["roomId"]].append(t)
en = collections.defaultdict(list)
for e in A["enemies"]:
    en[e["roomId"]].append(e)
M["deadEnds"] = {k: sorted(set(t.get("label", t["kind"]) for t in th[k] if t["kind"] not in ("landmark",))) or [e["kind"] for e in en[k]] for k in dead}
# loops: find cycles through BFS-tree non-tree edges, report length in rooms
par = {}; depth = {}
root = "Town"
q = collections.deque([root]); par[root] = None; depth[root] = 0
while q:
    a = q.popleft()
    for b in adj[a]:
        if b not in par:
            par[b] = a; depth[b] = depth[a] + 1; q.append(b)
seen = set(); loops = []
for a in rooms:
    for b in adj[a]:
        if a < b and par.get(a) != b and par.get(b) != a and a in par and b in par:
            x, y = a, b; pa, pb = [x], [y]
            while x != y:
                if depth[x] >= depth[y]:
                    x = par[x]; pa.append(x)
                else:
                    y = par[y]; pb.append(y)
            cyc = pa + pb[-2::-1]
            loops.append({"rooms": len(cyc) - 1, "via": [c.replace("Crossroads_", "C") for c in cyc]})
M["loops"] = loops
# hops from critical path
dist = {r: 0 for r in CP}
q = collections.deque(CP)
while q:
    a = q.popleft()
    for b in adj[a]:
        if b not in dist:
            dist[b] = dist[a] + 1; q.append(b)
# enemies
live = [e for e in A["enemies"] if e["roomId"] in rooms and e.get("firstVisit", True) and not e.get("spawned")]
n = lambda es: sum(e.get("count", 1) for e in es)
M["enemies"] = {"individuals": n(live), "perScreen": round(n(live) / M["screens"], 2),
                "onCriticalPath": n([e for e in live if e["roomId"] in CP]),
                "perScreenOnCriticalPath": round(n([e for e in live if e["roomId"] in CP]) / M["criticalPathScreens"], 2),
                "roomsWithNone": sum(1 for k in rooms if not [e for e in live if e["roomId"] == k]),
                "infectedOnlyOrSpawnedExcluded": n([e for e in A["enemies"] if e["roomId"] in rooms]) - n(live)}
kinds = collections.Counter()
hp = {}
for e in live:
    kinds[e["kind"]] += e.get("count", 1); hp[e["kind"]] = (e.get("hp"), e.get("difficulty"))
NAIL = 5
M["enemyKinds"] = {k: {"n": v, "hp": hp[k][0], "nailHits": (math.ceil(hp[k][0] / NAIL) if hp[k][0] else None), "difficulty": hp[k][1]} for k, v in kinds.most_common()}
# things
tk = collections.Counter()
for t in A["things"]:
    if t["roomId"] in rooms:
        tk[(t["kind"], t.get("label", ""))] += 1
M["thingsByKind"] = {f"{k[0]}:{k[1]}": v for k, v in sorted(tk.items())}
maj = [t for t in A["things"] if t["roomId"] in rooms and t["kind"] == "pickup-major"]
M["perScreen"] = {"pickup-major": round(len(maj) / M["screens"], 2),
                  "geoRocks": round(sum(1 for t in A["things"] if t["roomId"] in rooms and t.get("label") == "geo rock") / M["screens"], 2),
                  "allThings": round(sum(1 for t in A["things"] if t["roomId"] in rooms) / M["screens"], 2)}
# secrets
sec = [t for t in A["terrain"] if t["roomId"] in rooms and t["kind"] in ("breakable", "secretWall")]
M["secrets"] = {"breakableWallsFloors": sum(1 for t in sec if t["kind"] == "breakable"), "hiddenRoomMasks": sum(1 for t in sec if t["kind"] == "secretWall"),
                "hopsFromCriticalPath": dict(sorted(collections.Counter(dist.get(t["roomId"], -1) for t in sec).items())),
                "hiddenThings": [(t["id"], t["hidden"]["how"]) for t in A["things"] if t.get("hidden") and t["roomId"] in rooms]}
# saves
sv = [t for t in A["things"] if t["kind"] == "save" and t.get("label") == "bench" and t["roomId"] in rooms]
M["benches"] = {"n": len(sv), "rooms": [t["roomId"] for t in sv], "hopsFromCP": {t["roomId"]: dist.get(t["roomId"]) for t in sv}}
cpb = [t for t in sv if t["roomId"] in CP]
# gates
gates = collections.Counter(e["gate"] for r in rooms.values() for e in r["exits"] if e.get("gate"))
M["gatedExits"] = dict(gates)
M["exitsOutOfArea"] = sum(1 for r in rooms.values() for e in r["exits"] if e.get("outOfArea"))
# travel along CP polyline
pts = A.get("criticalPathPoints") or []
dx = sum(abs(b[0] - a[0]) for a, b in zip(pts, pts[1:])); dy = sum(abs(b[1] - a[1]) for a, b in zip(pts, pts[1:]))
M["criticalPathTravel"] = {"horizontalPx": dx, "verticalPx": dy, "vertical:horizontal": round(dy / max(dx, 1), 2),
                           "screensWide": round(dx / 1920, 1), "screensTall": round(dy / 1080, 1)}
# longest stretch on the CP polyline with nothing (thing or live enemy) within 960 px
objs = [t["at"] for t in A["things"] if t["kind"] not in ("landmark",)] + [e["at"] for e in live]
best = cur = 0
for a, b in zip(pts, pts[1:]):
    L = math.dist(a, b); steps = max(1, int(L / 64))
    for i in range(steps):
        p = (a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps)
        if any(math.dist(p, o) < 960 for o in objs):
            cur = 0
        else:
            cur += L / steps; best = max(best, cur)
M["longestEmptyStretchOnCPpx"] = round(best)
# reachability by ability
G = collections.defaultdict(list)
for k, r in rooms.items():
    for e in r["exits"]:
        if e["to"] in rooms:
            G[k].append((e["to"], e.get("gate"), e.get("oneWay")))


def reach(allowed):
    s = {"Tutorial_01"}; q = collections.deque(s)
    while q:
        a = q.popleft()
        for b, g, ow in G[a]:
            if (g is None or g in allowed) and b not in s:
                s.add(b); q.append(b)
    return s


r0 = reach({"boss", "breakable"}); r1 = reach({"boss", "breakable", "spell"})
M["reach"] = {"startKitRooms": len(r0), "startKitScreens": round(sum(scr[k] for k in r0), 1),
              "withVengefulSpiritRooms": len(r1), "withVengefulSpiritScreens": round(sum(scr[k] for k in r1), 1),
              "unreachableUntilLater": sorted(set(rooms) - r1)}
print(json.dumps(M, indent=1))
