import sys, os, re, json, math, colorsys, collections
S = sys.argv[1]; REPO = sys.argv[2]
sys.path.insert(0, S + '/tools')
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from crs import g2p, p2g
from data import AREA, ROOMS, EXITS, CRITICAL, START, PICKUP_INFO
from data2 import PICKUP_REQ, GATE_REQ, THINGS, ENEMIES, HAZARDS, BREAKABLES, DOORS, ROUTE

DOCS = REPO + '/docs/design/reference-levels/ori'; SHOTS = REPO + '/shots/reference-levels/ori'
os.makedirs(DOCS, exist_ok=True); os.makedirs(SHOTS, exist_ok=True)

# ---- units: camera code defaults (CameraOffsetController.DefaultZoom=20, CameraController.FieldOfView=60, 16:9)
ZOOM, FOV = 20.0, 60.0
VIEW_H = 2 * ZOOM * math.tan(math.radians(FOV / 2)); VIEW_W = VIEW_H * 16 / 9
K = 1920 / VIEW_W  # our px per game unit
X0, YT = AREA['x0'], AREA['ytop']
def P(gx, gy): return [round((gx - X0) * K), round((YT - gy) * K)]
AW = round((AREA['x1'] - X0) * K); AH = round((YT - AREA['ybot']) * K)

# ---- map art (in-game map, ori-tracker tiles, zoom 7)
OX, OY = 29 * 256, 37 * 256
art = Image.open(S + '/stitched.png').convert('RGB')
ax0, ay0 = g2p(AREA['x0'], AREA['ytop']); ax1, ay1 = g2p(AREA['x1'], AREA['ybot'])
ax0, ay0, ax1, ay1 = int(ax0 - OX), int(ay0 - OY), int(ax1 - OX), int(ay1 - OY)
crop = art.crop((ax0, ay0, ax1, ay1)); a = np.asarray(crop).astype(np.float32)
H, W = a.shape[:2]
def m2g(px, py): return p2g(px + ax0 + OX, py + ay0 + OY)
def g2m(gx, gy): x, y = g2p(gx, gy); return x - OX - ax0, y - OY - ay0
MPU = abs(g2m(1, 0)[0] - g2m(0, 0)[0])  # map px per unit

openm = a.max(axis=2) > 45
openm = cv2.morphologyEx(openm.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
hsv = cv2.cvtColor((a).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)  # H 0..180
hue = hsv[..., 0] / 180; sat = hsv[..., 1] / 255; val = hsv[..., 2] / 255
water = openm & (hue > 0.64) & (hue < 0.86) & (sat > 0.2) & (val < 0.5)
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
_wx0, _wy0 = g2m(135, -170); _wx1, _wy1 = g2m(310, -226)
water[int(_wy0):int(_wy1), int(_wx0):int(_wx1)] = False  # the start glade's violet light is not water

# room union mask (rects + 2 u)
union = np.zeros((H, W), bool)
for rid, name, x0, x1, yb, yt, shape, crit in ROOMS:
    mx0, my0 = g2m(x0 - 2, yt + 2); mx1, my1 = g2m(x1 + 2, yb - 2)
    union[max(0, int(my0)):int(my1), max(0, int(mx0)):int(mx1)] = True

# pickups from the rando logic
pick = {}
for l in open('/Users/matt/code/worktrees/opusvania/nifty-bhaskara-28e244/shots/reference/maps/ori/logic/bf-areas.ori'):
    m = re.match(r'loc: (\S+) (-?\d+) (-?\d+) (\S+) (\d) (\S+)', l)
    if m and m[1] in PICKUP_INFO: pick[m[1]] = dict(x=int(m[2]), y=int(m[3]), code=m[4], diff=int(m[5]), zone=m[6])
assert len(pick) == len(PICKUP_INFO), set(PICKUP_INFO) - set(pick)

# secrets not on the map art: carve a pocket and record the wall between it and the nearest mapped space
dist_open, lab = None, None
inv = (~openm).astype(np.uint8)
dt, labels = cv2.distanceTransformWithLabels(inv, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.nonzero(~inv.astype(bool)); lab2pt = {}
lab_at = labels[ys, xs]; lab2pt = dict(zip(lab_at.tolist(), zip(xs.tolist(), ys.tolist())))
secret_walls = []
for n, p in pick.items():
    mx, my = g2m(p['x'], p['y'] + 0.8)
    mx, my = int(mx), int(my)
    if 0 <= mx < W and 0 <= my < H and dt[my, mx] > 1.5 * MPU:
        qx, qy = lab2pt[labels[my, mx]]
        cv2.circle(openm.view(np.uint8), (mx, my), int(2.2 * MPU), 1, -1)
        gq = m2g(qx, qy); gp = (p['x'], p['y'] + 0.8)
        secret_walls.append((n, gp, gq, dt[my, mx] / MPU))
        # keep the pocket separate from the cave: wall = the gap between them, drawn as its own polygon
openm = openm.astype(bool)

solid = (~openm) & union
# cut every enclosed air region upward so solids are simple polygons (cut width 1 map px = 0.11 u)
for it in range(6):
    nonsolid = (~solid).astype(np.uint8)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(nonsolid, connectivity=4)
    cuts = 0
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if x == 0 or y == 0 or x + w >= W or y + h >= H: continue
        cols = np.nonzero(lbl[y] == i)[0]; cx = int(cols[len(cols) // 2])
        yy = y - 1
        while yy >= 0 and solid[yy, cx]: solid[yy, cx] = False; yy -= 1
        cuts += 1
    if cuts == 0: break

def contours(mask, eps_u=0.12, min_area_u=1.0):
    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < min_area_u * MPU * MPU: continue
        c = cv2.approxPolyDP(c, eps_u * MPU, True)[:, 0, :]
        out.append([P(*m2g(float(x), float(y))) for x, y in c])
    return out

terrain = []
room_of = lambda gx, gy: min(([((r[3]-r[2])*(r[5]-r[4]), r[0]) for r in ROOMS if r[2] <= gx <= r[3] and r[4] <= gy <= r[5]] or [(0, None)]))[1]
def poly_room(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    gx = X0 + (sum(xs) / len(xs)) / K; gy = YT - (sum(ys) / len(ys)) / K
    return room_of(gx, gy) or 'between'
for poly in contours(solid):
    terrain.append(dict(roomId=poly_room(poly), kind='solid', poly=poly, src='mined: in-game map art traced (ori-tracker tiles), +-1 u'))
for poly in contours(water & union, 0.15, 2.0):
    terrain.append(dict(roomId=poly_room(poly), kind='water', poly=poly, src='mined: purple water fill in the map art'))
def rect(x0, x1, y0, y1): return [P(x0, y1), P(x1, y1), P(x1, y0), P(x0, y0)]
for rid, kind, x0, x1, y0, y1, lab_ in HAZARDS:
    terrain.append(dict(roomId=rid, kind=kind, poly=rect(x0, x1, y0, y1), label=lab_, src='estimate: walkthrough text'))
for rid, kind, x0, x1, y0, y1, lab_ in BREAKABLES:
    terrain.append(dict(roomId=rid, kind=kind, poly=rect(x0, x1, y0, y1), label=lab_, src='estimate: walkthrough text'))
for rid, x0, x1, y0, y1, gid in DOORS:
    terrain.append(dict(roomId=rid, kind='door', poly=rect(x0, x1, y0, y1), label=gid, src='mined anchor, estimated extent'))
for n, gp, gq, d in secret_walls:
    # a 1.2-unit-thick wall slab along the segment from the mapped cave to the hidden pocket
    (x0, y0), (x1, y1) = gq, gp
    L = math.hypot(x1 - x0, y1 - y0) or 1; nx, ny = -(y1 - y0) / L * 0.9, (x1 - x0) / L * 0.9
    mx, my = x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35; ex, ey = x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * 0.6
    poly = [P(mx + nx, my + ny), P(ex + nx, ey + ny), P(ex - nx, ey - ny), P(mx - nx, my - ny)]
    terrain.append(dict(roomId=room_of(*gp) or poly_room(poly), kind='secretWall', poly=poly, label='hidden way into ' + n,
                        src='estimate: pocket is off the map art; placed on the line to the nearest mapped space'))

# snap estimated positions (enemies, non-pickup things) that fall in rock to the nearest open map pixel
inv2 = (~openm).astype(np.uint8)
dt2, lab2 = cv2.distanceTransformWithLabels(inv2, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys2, xs2 = np.nonzero(openm); l2p = dict(zip(lab2[ys2, xs2].tolist(), zip(xs2.tolist(), ys2.tolist())))
snapped = []
def snap(gx, gy, name):
    mx, my = g2m(gx, gy); mx, my = int(mx), int(my)
    if not (0 <= mx < W and 0 <= my < H) or openm[my, mx]: return gx, gy
    qx, qy = l2p[lab2[my, mx]]
    # step 0.6 u further into the air so the glyph sits clear of the wall
    gq = m2g(qx, qy); d_ = math.hypot(gq[0] - gx, gq[1] - gy) or 1
    nx, ny = gq[0] + (gq[0] - gx) / d_ * 0.6, gq[1] + (gq[1] - gy) / d_ * 0.6
    snapped.append((name, round(d_, 1))); return nx, ny
ENEMIES[:] = [(e[0], e[1], e[2], *snap(e[3], e[4], e[0]), *e[5:]) for e in ENEMIES]
THINGS[:] = [(t[0], t[1], t[2], *snap(t[3], t[4], t[0]), *t[5:]) if t[2] not in ('save',) and not t[0].startswith('tree') else t for t in THINGS]
print('snapped', snapped)

# ---- rooms
SCREEN = 1920 * 1080
rooms = []
for rid, name, x0, x1, yb, yt, shape, crit in ROOMS:
    r = P(x0, yt); w = round((x1 - x0) * K); h = round((yt - yb) * K)
    ex = []
    for to, side, x, y, gate, one in EXITS.get(rid, []):
        e = dict(to=to, side=side, at=P(x, y))
        if one: e['oneWay'] = True
        if gate: e['gate'] = gate
        ex.append(e)
    rooms.append(dict(id=rid, name=name, rect=[r[0], r[1], w, h], screens=round(w * h / SCREEN, 2), shape=shape,
                      onCriticalPath=crit, exits=ex))

# ---- things
things = []
for n, p in pick.items():
    kind, label, value, how, needs = PICKUP_INFO[n]
    t = dict(id=n, roomId=room_of(p['x'], p['y']) or room_of(p['x'], p['y'] + 3), kind=kind, label=label, at=P(p['x'], p['y']), value=value,
             src='mined: Ori DE randomizer logic (bf-areas.ori) pickup coordinate, integer game units')
    if how: t['hidden'] = dict(how=how, **({'needs': needs} if needs else {}))
    things.append(t)
for tid, rid, kind, x, y, label, src, hid in THINGS:
    t = dict(id=tid, roomId=rid, kind=kind, label=label, at=P(x, y), src=src)
    things.append(t)

enemies = []
for eid, rid, kind, x, y, beh, att, dif, why, patrol, resp in ENEMIES:
    e = dict(id=eid, roomId=rid, kind=kind, at=P(x, y), behaviour=beh, attack=att, difficulty=dif, why=why,
             src='estimate: count and kind from wiki/walkthrough text, position placed by hand; HP and damage not mined')
    if patrol: e['patrol'] = [P(patrol[0], y)[0], P(patrol[1], y)[0]]
    if resp: e['respawns'] = True
    enemies.append(e)

# ---- hero
hero = dict(box=[round(1.0 * K), round(1.5 * K)], boxNative=[1.0, 1.5],
            boxSrc='estimate: TAS convention says 1 unit = hitbox width; height guessed from sprite proportions',
            run=round(11.67 * K), runNative=11.67, runSrc='mined: TASVideos (airborne max speed ~11.67 u/s; ground run assumed equal)',
            jump=round(3.0 * K), jumpNative=3.0,
            jumpSrc='files-equivalent: SeinJump.FirstJumpHeight = 3 (decompiled Assembly-CSharp, code default; second/third chained jumps 3.75/4.5 u)',
            health='3 life cells (12 internal HP; 1 cell = 4)', energy='0 energy cells',
            attack='Spirit Flame 2 damage per hit, 0.2 s between shots, 2 shots then 0.5 s cooldown (SDA wiki); auto-targets within 8 u (SeinStandardSpiritFlameAbility.SpiritFlameRange)',
            startAbilities=['run', 'jump (3 u; chained jumps 3.75 / 4.5 u)', 'crouch', 'swim (but the Glades water is polluted and hurts until the Ginso Tree is cleansed, hours later)',
                            'Soul Link: place a save anywhere for 1 energy (needs energy cell 1, found at ~minute 2)'],
            abilityOrder=[
                dict(ability='Spirit Flame (Sein)', where='big log at the west end of the ram tunnel', roomId='ram', minuteGuess=4),
                dict(ability='Wall Jump', where="Fil's Ancestral Tree, bottom-left of the area", roomId='walljump', minuteGuess=15),
                dict(ability='Charge Flame (next area)', where='Hollow Grove side, under the Spirit Tree', roomId='attic', minuteGuess=40)])

crit_rooms = []
for r in CRITICAL:
    if not crit_rooms or crit_rooms[-1] != r: crit_rooms.append(r)

# ---- measurements
def poly_len(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
import heapq
# route the walked path through open space: A* on a 1-unit grid of the map art (8-connected)
gw, gh = int(W / MPU), int(H / MPU)
grid = cv2.resize(openm.astype(np.float32), (gw, gh), interpolation=cv2.INTER_AREA) > 0.45
def gcell(gx, gy):
    mx, my = g2m(gx, gy); cx, cy = int(mx / MPU), int(my / MPU)
    if grid[cy, cx]: return cx, cy
    ys_, xs_ = np.nonzero(grid[max(0, cy - 6):cy + 7, max(0, cx - 6):cx + 7])
    if len(xs_) == 0: return None
    i = np.argmin((xs_ + max(0, cx - 6) - cx) ** 2 + (ys_ + max(0, cy - 6) - cy) ** 2)
    return int(xs_[i] + max(0, cx - 6)), int(ys_[i] + max(0, cy - 6))
def astar(a, b):
    if a is None or b is None: return None
    openq = [(0, a)]; came = {a: None}; g = {a: 0}
    while openq:
        _, c = heapq.heappop(openq)
        if c == b: break
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if not dx and not dy: continue
                n = (c[0] + dx, c[1] + dy)
                if not (0 <= n[0] < gw and 0 <= n[1] < gh) or not grid[n[1], n[0]]: continue
                ng = g[c] + (1.414 if dx and dy else 1)
                if ng < g.get(n, 1e9):
                    g[n] = ng; came[n] = c; heapq.heappush(openq, (ng + math.hypot(n[0] - b[0], n[1] - b[1]), n))
    if b not in came: return None
    path = []; c = b
    while c: path.append(c); c = came[c]
    return path[::-1]
def cell2px(c):
    gx, gy = m2g((c[0] + 0.5) * MPU, (c[1] + 0.5) * MPU); return P(gx, gy)
route_px = []; routed_legs = 0
for i in range(len(ROUTE) - 1):
    (x0, y0, _, _), (x1, y1, _, _) = ROUTE[i], ROUTE[i + 1]
    path = astar(gcell(x0, y0), gcell(x1, y1))
    leg = [P(x0, y0)] + ([cell2px(c) for c in path] if path else []) + [P(x1, y1)]
    if path: routed_legs += 1
    if route_px: leg = leg[1:]
    route_px += leg
route_simpl = cv2.approxPolyDP(np.array(route_px, np.float32).reshape(-1, 1, 2), 0.6 * K, False)[:, 0, :].round().astype(int).tolist()
route_full = route_px; route_px = route_simpl
print('routed legs', routed_legs, 'of', len(ROUTE) - 1, 'route points', len(route_full), '->', len(route_simpl))
hor = sum(abs(route_px[i + 1][0] - route_px[i][0]) for i in range(len(route_px) - 1))
ver = sum(abs(route_px[i + 1][1] - route_px[i][1]) for i in range(len(route_px) - 1))
total_route = poly_len(route_px)
room_area = {r['id']: r['rect'][2] * r['rect'][3] for r in rooms}
# union screens (rects overlap a little)
um = np.zeros((AH // 16 + 1, AW // 16 + 1), bool)
for r in rooms:
    x, y, w, h = r['rect']; um[y // 16:(y + h) // 16, x // 16:(x + w) // 16] = True
area_screens = float(um.sum()) * 256 / SCREEN
cm = np.zeros_like(um)
for r in rooms:
    if r['onCriticalPath']:
        x, y, w, h = r['rect']; cm[y // 16:(y + h) // 16, x // 16:(x + w) // 16] = True
crit_screens = float(cm.sum()) * 256 / SCREEN
# open-space screens (air in the map art inside rooms)
air_screens = float((openm & union).sum()) / (MPU * MPU) * K * K / SCREEN

shapes = collections.Counter(r['shape'] for r in rooms)
exits_per_room = {r['id']: len(r['exits']) for r in rooms}
inner = {r['id'] for r in rooms}
deg_inner = {r['id']: len({e['to'] for e in r['exits'] if e['to'] in inner}) for r in rooms}
dead_ends = [r for r in rooms if deg_inner[r['id']] == 1 and len(r['exits']) == 1]
edges = set()
for r in rooms:
    for e in r['exits']:
        if e['to'] in inner: edges.add(frozenset((r['id'], e['to'])))
cyclomatic = len(edges) - len(inner) + 1

# reachability by stage (rooms + pickups), with keys and energy counted from collected pickups
ROOMS_BY = {r[0]: r for r in ROOMS}
def reach(have):
    seen = {'wake'}; used = set(); keys = energy = 0
    while True:
        got = [t for t in things if t['roomId'] in seen and t['id'] in pick and PICKUP_REQ.get(t['id'], set()) <= have]
        keys = sum(1 for t in got if pick[t['id']]['code'] == 'KS'); energy = sum(1 for t in got if pick[t['id']]['code'] == 'EC')
        changed = False
        for r in rooms:
            if r['id'] not in seen: continue
            for e in r['exits']:
                if e['to'] in seen or e['to'] not in inner: continue
                req = GATE_REQ.get((r['id'], e['to']), {})
                if req.get('ability', set()) - have: continue
                if req.get('energy', 0) > energy and 'AllEnergy' not in have: continue
                if req.get('keys'):
                    spent = sum(GATE_REQ[(a, b)]['keys'] for a, b in used)
                    if keys - spent < req['keys']: continue
                    used.add((r['id'], e['to']))
                seen.add(e['to']); changed = True
        if not changed: return seen, got, keys, energy
stages = [('start', set()), ('+Spirit Flame', {'SpiritFlame'}), ('+Wall Jump', {'SpiritFlame', 'WallJump'}),
          ('+Charge Flame, Double Jump, Bash, Charge Jump, Light Burst, clean water (late game)',
           {'SpiritFlame', 'WallJump', 'ChargeFlame', 'DoubleJump', 'Bash', 'ChargeJump', 'LightBurst', 'Water', 'AllEnergy'})]
reach_tab = []
for name, have in stages:
    seen, got, keys, energy = reach(have)
    sm = np.zeros_like(um)
    for r in rooms:
        if r['id'] in seen:
            x, y, w, h = r['rect']; sm[y // 16:(y + h) // 16, x // 16:(x + w) // 16] = True
    scr = float(sm.sum()) * 256 / SCREEN
    reach_tab.append(dict(stage=name, rooms=len(seen), screens=round(scr, 1), pickups=len(got), keystones=keys, energy=energy))

kinds = collections.Counter(t['kind'] for t in things)
pick_kinds = collections.Counter(pick[n]['code'] for n in pick)
crit_set = set(crit_rooms)
en_crit = sum(1 for e in enemies if e['roomId'] in crit_set)
# secrets: distance (route px) from each hidden pickup to the nearest route point
def seg_dist(p, a, b):
    ax_, ay_ = a; bx, by = b; px, py = p
    dx, dy = bx - ax_, by - ay_; L2 = dx * dx + dy * dy or 1
    t = max(0, min(1, ((px - ax_) * dx + (py - ay_) * dy) / L2))
    return math.hypot(px - ax_ - t * dx, py - ay_ - t * dy)
def route_dist(p): return min(seg_dist(p, route_px[i], route_px[i + 1]) for i in range(len(route_px) - 1))
secrets = []
for t in things:
    if 'hidden' in t:
        secrets.append(dict(id=t['id'], how=t['hidden']['how'], needs=t['hidden'].get('needs'), fromRoutePx=round(route_dist(t['at']))))
# longest stretch of the route with no thing or enemy within 6 u
pts = [t['at'] for t in things] + [e['at'] for e in enemies]
R = 6 * K; best = cur = 0; step = 16
for i in range(len(route_px) - 1):
    a_, b_ = route_px[i], route_px[i + 1]; L = math.hypot(b_[0] - a_[0], b_[1] - a_[1]); n = max(1, int(L / step))
    for k in range(n):
        x = a_[0] + (b_[0] - a_[0]) * k / n; y = a_[1] + (b_[1] - a_[1]) * k / n
        if any(math.hypot(x - q[0], y - q[1]) < R for q in pts): cur = 0
        else: cur += L / n; best = max(best, cur)
saves = [t for t in things if t['kind'] == 'save']
# save-to-save along the route
def route_index(p):
    return min(range(len(route_px)), key=lambda i: math.hypot(route_px[i][0] - p[0], route_px[i][1] - p[1]))
i1, i2 = route_index(saves[0]['at']), route_index(saves[1]['at'])
save_gap = poly_len(route_px[min(i1, i2):max(i1, i2) + 1])
start_to_save = poly_len(route_px[:i1 + 1])

metrics = dict(
    pxPerUnit=round(K, 3), view_native=[round(VIEW_W, 2), round(VIEW_H, 2)], areaPx=[AW, AH],
    rooms=len(rooms), screens_roomUnion=round(area_screens, 1), screens_air=round(air_screens, 1),
    criticalScreens_roomUnion=round(crit_screens, 1), shapes=dict(shapes), exitsPerRoom=exits_per_room,
    meanExits=round(sum(exits_per_room.values()) / len(rooms), 2),
    deadEnds=[(r['id'], [t['label'] for t in things if t['roomId'] == r['id']]) for r in dead_ends],
    cyclomatic=cyclomatic, enemies=len(enemies), enemiesCrit=en_crit,
    enemiesPerScreen=round(len(enemies) / area_screens, 2), enemiesPerCritScreen=round(en_crit / crit_screens, 2),
    enemyKinds=dict(collections.Counter(e['kind'].split(' (')[0] for e in enemies)),
    pickupCodes=dict(pick_kinds), thingKinds=dict(kinds), pickupsPerScreen=round(len(pick) / area_screens, 2),
    secrets=secrets, routePx=round(total_route), routeScreensWide=round(total_route / 1920, 1), horizontalPx=hor, verticalPx=ver,
    longestEmptyStretchPx=round(best), saveGapPx=round(save_gap), startToFirstSavePx=round(start_to_save),
    reach=reach_tab, secretWalls=[(n, round(float(d), 1)) for n, _, _, d in secret_walls])
json.dump(metrics, open(S + "/metrics.json", "w"), indent=1, default=float)

area = dict(
    game='Ori and the Blind Forest: Definitive Edition',
    area='Sunken Glades with the Spirit Caverns, from the start through the Wall Jump tree to the Spirit Tree and the way out to the Hollow Grove',
    sources=[
        'Ori DE randomizer logic bf-areas.ori (sparkle-preference/ori_rando_server seedbuilder/areas.ori): pickup and anchor coordinates in game units',
        'In-game world map tiles used by the rando tracker: https://ori-tracker.firebaseapp.com/images/ori-map/7/{x}/{y}.png, georeferenced with ori_rando_server map/src/shared_map.js getMapCrs (8.77 map px per unit)',
        'Decompiled Assembly-CSharp.dll from sigmasin/OriDERandomizer (code defaults: camera DefaultZoom 20, FieldOfView 60, SeinJump heights, Spirit Flame range)',
        'Ori fandom wiki (Sunken Glades, Enemies of Nibel, Life Cell, Spirit Light Container) via api.php',
        'Speed Demos Archive Ori/Skills_and_Abilities (via the Wayback Machine): Spirit Flame 2 damage',
        'TASVideos forum post 441231: Ori speeds in units/s',
        'Walkthroughs: ludo.guide sunken-glades, gamerwalkthroughs.com sunken-glades (order of play, enemy groups; low confidence)'],
    units=dict(native='unity units (y up in the game; here y down)', pxPerUnit=round(K, 3), viewNative=[round(VIEW_W, 2), round(VIEW_H, 2)],
               how='camera code defaults from the decompiled Assembly-CSharp: perspective camera, FieldOfView 60 deg (CameraController), DefaultZoom 20 u (CameraOffsetController) => view height 2*20*tan(30) = 23.09 u, width 41.06 u at 16:9 = 1920 px. Scenes can override the zoom (CameraOffsetZone / scene default zoom); not checked against the game files.',
               originNative=[X0, YT], mapArtPxPerUnit=round(MPU, 3)),
    hero=hero, rooms=rooms, terrain=terrain, things=things, enemies=enemies, criticalPath=crit_rooms,
    criticalRoute=[dict(at=P(x, y), event=ev, minuteGuess=mi) for x, y, ev, mi in ROUTE],
    criticalRoutePath=route_simpl,
    firstPlayMinutes=dict(criticalPath=33, full100=70,
                          note='guesses; the Glades are also revisited later for 11 of the 30 pickups (Light Burst, Bash, Charge Jump, clean water)'),
    notMined=['enemy HP and contact damage (prefab data; needs the game files)', 'exact enemy count and positions',
              'small spirit-light orbs from plants/enemies', 'one-way platforms (the map art does not separate them)',
              'secret rooms that the map art does not draw (approximated as pockets)'])
json.dump(area, open(DOCS + "/area.json", "w"), indent=1, default=float)
print(json.dumps({k: v for k, v in metrics.items() if k not in ('exitsPerRoom',)}, indent=1))
print('terrain polys', collections.Counter(t['kind'] for t in terrain), 'points', sum(len(t['poly']) for t in terrain))
np.save(S + '/openm.npy', openm)
