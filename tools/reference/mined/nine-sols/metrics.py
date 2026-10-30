import json, sys, math
from collections import Counter, defaultdict
A = json.load(open(sys.argv[1]))
VIEW = 1920 * 1080
R = {r['id']: r for r in A['rooms']}
out = {}
def scr(a): return round(a / VIEW, 2)
rect_s = sum(r['rect'][2] * r['rect'][3] for r in A['rooms'])
fill_s = sum(r['filledScreens'] for r in A['rooms'])
crit = list(dict.fromkeys(A['criticalPath']))
out['rooms'] = len(A['rooms'])
out['screensRect'] = scr(rect_s); out['screensFilled'] = round(fill_s, 1)
out['critRooms'] = len(crit)
out['critScreensRect'] = round(sum(R[c]['screens'] for c in crit), 1)
out['critScreensFilled'] = round(sum(R[c]['filledScreens'] for c in crit), 1)
out['byScene'] = {}
for r in A['rooms']:
    s = out['byScene'].setdefault(r['scene'], [0, 0, 0])
    s[0] += 1; s[1] += r['screens']; s[2] += r['filledScreens']
out['byScene'] = {k: [v[0], round(v[1], 1), round(v[2], 1)] for k, v in out['byScene'].items()}
out['shapes'] = Counter(r['shape'] for r in A['rooms'])
# graph
adj = defaultdict(set)
for r in A['rooms']:
    for e in r['exits']:
        adj[r['id']].add(e['to'])
        if not e['to'].startswith('OUT:'): adj[e['to']].add(r['id'])
out['exitsPerRoom'] = round(sum(len(adj[r['id']]) for r in A['rooms']) / len(A['rooms']), 2)
out['exitsHist'] = Counter(len(adj[r['id']]) for r in A['rooms'])
things_by_room = defaultdict(list)
for t in A['things']: things_by_room[t['roomId']].append(t['value'][:40])
en_by_room = defaultdict(list)
for e in A['enemies']: en_by_room[e['roomId']].append(e['kind'])
out['deadEnds'] = {r['id']: things_by_room[r['id']] + en_by_room[r['id']] for r in A['rooms'] if len(adj[r['id']]) == 1}
# cycles (internal graph only)
nodes = [r['id'] for r in A['rooms']]
edges = set()
for a in nodes:
    for b in adj[a]:
        if b in R: edges.add(tuple(sorted((a, b))))
parent = {}
def find(x):
    while parent.get(x, x) != x: x = parent[x]
    return x
tree = defaultdict(set); extra = []
for a, b in sorted(edges):
    ra, rb = find(a), find(b)
    if ra == rb: extra.append((a, b))
    else: parent[ra] = rb; tree[a].add(b); tree[b].add(a)
def tpath(a, b):
    prev = {a: None}; q = [a]
    while q:
        x = q.pop(0)
        if x == b: break
        for y in tree[x]:
            if y not in prev: prev[y] = x; q.append(y)
    p = [b]
    while prev[p[-1]] is not None: p.append(prev[p[-1]])
    return p[::-1]
def center(rid):
    x, y, w, h = R[rid]['rect']; return (x + w / 2, y + h / 2)
loops = []
for a, b in extra:
    cyc = tpath(b, a) + [b]
    L = sum(abs(center(u)[0] - center(v)[0]) + abs(center(u)[1] - center(v)[1]) for u, v in zip(cyc, cyc[1:])
            if R[u]['scene'] == R[v]['scene'])
    loops.append({'rooms': cyc[:-1], 'lenOurPx': int(L), 'screenWidths': round(L / 1920, 1)})
out['loops'] = loops
# critical path polyline
pts = [q for seg in A['criticalPathLine'] for q in seg]
segs = A['criticalPathLine']
dx = sum(abs(b[0] - a[0]) for s in segs for a, b in zip(s, s[1:]))
dy = sum(abs(b[1] - a[1]) for s in segs for a, b in zip(s, s[1:]))
out['critTravel'] = {'horizontal': dx, 'vertical': dy, 'ratioVtoH': round(dy / dx, 2), 'lenScreensWide': round((dx + dy) / 1920, 1), 'sceneTransitions': len(segs) - 1}
# cumulative arclength sampler
samples = []
acc = 0
for si, s in enumerate(segs):
    for a, b in zip(s, s[1:]):
        L = math.dist(a, b); n = max(1, int(L / 40))
        for k in range(n):
            t = k / n; samples.append((acc + L * t, (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), si))
        acc += L
    samples.append((acc, tuple(s[-1]), si))
total = acc
out['critLenOurPx'] = int(total)
def proj(pt):
    best = min(samples, key=lambda s: math.dist(s[1], pt))
    return best[0], math.dist(best[1], pt)
# saves along the path
saves = [t for t in A['things'] if t['kind'] == 'save']
sv = sorted((proj(t['at'])[0], t['id'], int(proj(t['at'])[1])) for t in saves)
out['saves'] = sv
out['saveGaps'] = [int(b[0] - a[0]) for a, b in zip(sv, sv[1:])]
# secrets
hid = [t for t in A['things'] if 'hidden' in t and not t['hidden']['how'].startswith('not hidden')]
out['secrets'] = [{'id': t['id'], 'how': t['hidden']['how'], 'needs': t['hidden'].get('needs'), 'distFromPathPx': int(proj(t['at'])[1])} for t in hid]
# pickups
pk = Counter(t['kind'] for t in A['things'])
out['thingKinds'] = pk
out['pickupsPerScreen'] = {k: round(pk[k] / (fill_s), 3) for k in ['pickup-major', 'pickup-minor', 'lore', 'save']}
nowP = [t for t in A['things'] if t['kind'].startswith('pickup') and not t.get('later')]
out['pickupsFirstPass'] = Counter(t['kind'] for t in nowP)
# enemies
E = A['enemies']
first = [e for e in E if not e.get('later')]
out['enemiesAll'] = len(E); out['enemiesFirstPass'] = len(first)
out['enemyKinds'] = Counter(e['kind'] for e in E)
critset = set(crit)
ec = [e for e in first if e['roomId'] in critset]
out['enemiesOnCrit'] = len(ec)
out['enemiesPerScreenAll'] = round(len(E) / fill_s, 2)
out['enemiesPerScreenCrit'] = round(len(ec) / out['critScreensFilled'], 2)
out['enemiesPerSceneFirstPass'] = Counter(R[e['roomId']]['scene'] for e in first)
out['difficultyHist'] = Counter(e['difficulty'] for e in E)
# longest stretch without a thing/enemy within half a view height of the path
marks = [t['at'] for t in A['things'] if not t.get('later')] + [e['at'] for e in first]
near = [any(math.dist(s[1], m) < 960 for m in marks) for s in samples]
best = (0, 0, 0); start = None
for i, (sl, p, si) in enumerate(samples):
    if not near[i]:
        if start is None: start = i
    else:
        if start is not None:
            L = samples[i][0] - samples[start][0]
            if L > best[0]: best = (L, samples[start][1], samples[i][1])
        start = None
out['longestEmptyStretch'] = {'lenOurPx': int(best[0]), 'from': [int(v) for v in best[1]], 'to': [int(v) for v in best[2]]}
gaps = []
for i in range(len(samples)):
    pass
json.dump(out, open(sys.argv[2], 'w'), indent=1, default=str)
for k, v in out.items(): print(k, ':', v)
# extra: milestones along the path and the main loop
T = {t['id']: t for t in A['things']}
ms = {k: int(proj(T[k]['at'])[0]) for k in ['afm-root', 'afe-baichang', 'fsp-nymph', 'fsp-root', 'cth-anomalous']}
print('milestones (arclength our px):', ms)
loop_pts = [(4300, 3035), (4320, 2990)]  # Baichang
def P(x, y): return ((x - 740) * 9.6, (y - 170) * 9.6)
ch = [P(3465, 1690), P(3465, 1425), P(4720, 1460)]
cth = [P(4850, 1580), P(5180, 1580), P(5180, 2690), P(5000, 2600), P(4800, 2700), P(4780, 2860), P(5000, 2850), P(5241, 2803), P(5300, 2965), P(4450, 3030)]
def L(ps): return sum(math.dist(a, b) for a, b in zip(ps, ps[1:]))
print('main loop (walked part, excluding elevator/door rides): CH', int(L(ch)), 'CTH', int(L(cth)), 'total', int(L(ch) + L(cth)), 'screens wide', round((L(ch) + L(cth)) / 1920, 1))
print('elevator Baichang->CH on world map (not physical):', int(abs(3035 - 1700) * 9.6))
