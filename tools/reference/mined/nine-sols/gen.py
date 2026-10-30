import json, sys, os
import numpy as np, cv2
NS = '/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ns'
sys.path.insert(0, NS + '/work')
from defs import SCENES, ROOMS, EXITS, CRITICAL, PATH, THINGS, EXTRA_TERRAIN

OUTDIR = sys.argv[1]
K = 9.6          # our px per z15 map px (view 1920 our px = 200 map px)
OX, OY = 740, 170  # area origin in stitched px
def P(x, y): return [int(round((x - OX) * K)), int(round((y - OY) * K))]

sc = json.load(open(NS + '/work/scenes.json'))
H, W = 3584, 7168
air = {}
airall = np.zeros((H, W), np.uint8)
for k, v in sc.items():
    x0, y0, x1, y1 = v['box']
    a = np.zeros((H, W), np.uint8)
    a[y0:y1, x0:x1] = np.load(f'{NS}/work/air_{k}.npy')
    air[k] = a
    airall |= a

# ---- room ownership of air pixels (first rect wins, in ROOMS order) ----
owner = np.full((H, W), -1, np.int16)
for i, r in enumerate(ROOMS):
    x0, y0, x1, y1 = r[3]
    sub = owner[y0:y1, x0:x1]
    m = (air[r[1]][y0:y1, x0:x1] > 0) & (sub < 0)
    sub[m] = i
unowned = (airall > 0) & (owner < 0)
# assign leftovers to the nearest room rect of the same scene
ys, xs = np.nonzero(unowned)
for y, x in zip(ys, xs):
    best, bd = -1, 1e9
    for i, r in enumerate(ROOMS):
        if not air[r[1]][y, x]: continue
        x0, y0, x1, y1 = r[3]
        d = max(x0 - x, 0, x - x1) + max(y0 - y, 0, y - y1)
        if d < bd: bd, best = d, i
    owner[y, x] = best
np.save(NS + '/work/owner.npy', owner)
roomAir = {r[0]: int((owner == i).sum()) for i, r in enumerate(ROOMS)}

# ---- terrain: each scene's bounding box minus its air is solid, split in bands so no polygon has holes ----
SHELL = 24
claimed = airall.copy()
terrain = []
def band_polys(mask, y0, y1, roomfn):
    band = mask[y0:y1]
    if band.sum() == 0: return
    cs, hier = cv2.findContours(band, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is not None and (hier[0][:, 3] >= 0).any() and y1 - y0 > 2:
        mid = (y0 + y1) // 2
        band_polys(mask, y0, mid, roomfn); band_polys(mask, mid, y1, roomfn); return
    for c in cs:
        if cv2.contourArea(c) < 6: continue
        c = cv2.approxPolyDP(c, 0.8, True)
        pts = [(int(p[0][0]), int(p[0][1]) + y0) for p in c]
        if len(pts) < 3: continue
        cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
        terrain.append({'roomId': roomfn(cx, cy), 'kind': 'solid', 'poly': [P(x, y) for x, y in pts]})

def nearest_room(scene):
    idx = [i for i, r in enumerate(ROOMS) if r[1] == scene]
    def f(x, y):
        best, bd = None, 1e18
        for i in idx:
            x0, y0, x1, y1 = ROOMS[i][3]
            d = max(x0 - x, 0, x - x1) ** 2 + max(y0 - y, 0, y - y1) ** 2
            if d < bd: bd, best = d, ROOMS[i][0]
        return best
    return f

for k in ['AFM', 'AFE', 'CH', 'FSP', 'CTH']:
    bx0, by0, bx1, by1 = sc[k]['bbox']
    sh = np.zeros((H, W), np.uint8); sh[by0 - 8:by1 + 9, bx0 - 8:bx1 + 9] = 1   # the scene's bounding box: everything not air is solid
    solid = ((sh > 0) & (claimed == 0)).astype(np.uint8)
    claimed |= solid
    ys = np.nonzero(solid.any(1))[0]
    f = nearest_room(k)
    for y0 in range(ys.min(), ys.max() + 1, 32):
        band_polys(solid, y0, min(y0 + 32, ys.max() + 1), f)
np.save(NS + '/work/solid.npy', claimed & (~airall.astype(bool)).astype(np.uint8))

for rid, kind, (x0, y0, x1, y1), note in EXTRA_TERRAIN:
    terrain.append({'roomId': rid, 'kind': kind, 'poly': [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], 'note': note, 'src': 'estimate (position), mined (existence)'})

# ---- enemies ----
R = json.load(open(NS + '/research_enemies.json'))
types = {t['name']: t for t in R['enemyTypes']}
def room_at(x, y, scene=None):
    xi, yi = int(x), int(y)
    if 0 <= yi < H and 0 <= xi < W and owner[yi, xi] >= 0:
        return ROOMS[owner[yi, xi]][0]
    best, bd = None, 1e18
    for r in ROOMS:
        if scene and SCENES[r[1]][0][:5] != scene[:5]: continue
        x0, y0, x1, y1 = r[3]
        d = max(x0 - x, 0, x - x1) ** 2 + max(y0 - y, 0, y - y1) ** 2
        if d < bd: bd, best = d, r[0]
    return best
def snap(x, y):
    xi, yi = int(x), int(y)
    if airall[yi, xi]: return xi, yi
    for r in range(1, 60):
        for dy in range(-r, r + 1):
            for dx in (-r, r):
                if airall[yi + dy, xi + dx]: return xi + dx, yi + dy
        for dx in range(-r, r + 1):
            for dy in (-r, r):
                if airall[yi + dy, xi + dx]: return xi + dx, yi + dy
    return xi, yi

DIFF = {
    'Bolt Warrior': (1, '72 HP (~4 sword hits); 20-dmg parryable bolts from range; backs off'),
    'Swift Crossbow Cannon': (1, '25 HP wall turret; parryable 25-dmg bolts; can be ignored'),
    'Skycleaver Soldier': (2, '60 HP flyer; 30-dmg dash stab, dodge so it hits the wall'),
    'Feral Beast': (2, '92 HP, fast 30-dmg pounces, joins fights from off-screen'),
    'Blade Trooper': (2, '136 HP (~7 hits), one telegraphed parryable 25-dmg slash: the parry teacher'),
    'Spear Vanguard': (3, '160 HP, 30-dmg thrust, rolls past Yi to attack from behind'),
    'Armored Spear Vanguard': (3, '160 HP, front shield blocks hits; needs parry or attack from behind'),
    'Blade Commander': (4, '400 HP (~20 hits), 35x2 combos and the first unparryable crimson attack'),
    'Maul Corporal': (4, '800 HP, 35x3 slams, knockdown, crimson charge countered only by Tai-Chi Kick'),
    'Red Tiger Elite: Baichang': (5, '1160 HP (~58 sword hits; the fight is won by parry + talisman), 35x3 / 35x2 / 61 crimson'),
    'Red Tiger Elite: Yanren': (5, '1300 HP, Baichang moves plus fire trails that hurt even through a parry'),
}
def canon(kind):
    k = kind
    for name in ['Armored Spear Vanguard', 'Blade Commander', 'Blade Trooper', 'Bolt Warrior', 'Spear Vanguard', 'Feral Beast',
                 'Skycleaver Soldier', 'Swift Crossbow Cannon', 'Maul Corporal', 'Red Tiger Elite: Baichang', 'Red Tiger Elite: Yanren']:
        if k.startswith(name) or name in k: return name
    if k.startswith('unknown Red Tiger grunt (Blade Trooper'): return 'Blade Trooper'
    if k.startswith('unknown Red Tiger grunt (Bolt Warrior'): return 'Bolt Warrior'
    return None
bosses = {b['name']: b for b in R['bosses']}
enemies = []
cnt = {}
for p in R['placements']:
    name = canon(p['kind'])
    if not name: continue
    if 'Council Statue' in p['kind']: continue
    x, y = snap(p['x'], p['y'])
    if name not in ('Skycleaver Soldier', 'Swift Crossbow Cannon'):
        y0 = y
        while y - y0 < 150 and airall[y + 1, x]: y += 1   # feet on the floor below
        if y - y0 >= 150: y = y0
    rid = room_at(x, y, p['scene'])
    cnt[name] = cnt.get(name, 0) + 1
    t = types.get(name) or {}
    b = bosses.get(name)
    e = {'id': f"{rid}-{name.split(':')[-1].strip().lower().replace(' ', '-')}-{cnt[name]}", 'roomId': rid, 'kind': name, 'at': P(x, y)}
    if b:
        e['hp'] = b['hp']; e['attack'] = '; '.join(f"{a['name']}: {a['damage']}" for a in b['attacks']); e['behaviour'] = b['behaviour']
        e['respawns'] = False
    else:
        e['hp'] = t.get('hp')
        e['attack'] = '; '.join(f"{a['name']}: {a['damage']}" for a in t.get('attacks', []))
        e['behaviour'] = t.get('behaviour', '')
        e['respawns'] = not any(s in p['kind'] + p['why'] for s in ['no respawn', 'gauntlet', 'ambush'])
    d = DIFF[name]
    e['difficulty'] = d[0]; e['difficultyWhy'] = d[1]
    note = p['kind'] if p['kind'] != name else ''
    e['src'] = f"wiki (stats: ninesols.wiki.gg Enemy_Characteristics); position: estimate ({p['confidence']}) from walkthrough text: {p['why'][:160]}"
    if note: e['note'] = note
    if 'optional' in p['kind'] or 'Brute' in p['kind'] or '2nd visit' in p['kind'] or 'Yanren' in name or 'after Tai-Chi' in p['kind']:
        e['later'] = True
    enemies.append(e)

# ---- rooms ----
outs = {}
for fr, to, side, at, ex in EXITS:
    d = {'to': to, 'side': side, 'at': P(*at)}
    d.update(ex)
    outs.setdefault(fr, []).append(d)
VIEW = 200 * 112.5
rooms = []
for i, (rid, scene, name, (x0, y0, x1, y1), shape, crit) in enumerate(ROOMS):
    rooms.append({'id': rid, 'scene': SCENES[scene][0], 'name': name, 'rect': P(x0, y0) + [int(round((x1 - x0) * K)), int(round((y1 - y0) * K))],
                  'screens': round((x1 - x0) * (y1 - y0) / VIEW, 2), 'filledScreens': round(roomAir[rid] / VIEW, 2),
                  'shape': shape, 'onCriticalPath': crit, 'exits': outs.get(rid, [])})

things = []
for tid, rid, kind, at, ex in THINGS:
    d = {'id': tid, 'roomId': rid, 'kind': kind, 'at': P(*at)}
    d.update(ex)
    if 'later' not in d and ('needs' in d.get('hidden', {}) and any(s in d['hidden']['needs'] for s in ['Kick', 'Unbounded', 'Seed', 'seed', 'Nymph + Tai'])):
        d['later'] = True
    things.append(d)

yi = R['yi']
area = {
    'game': 'Nine Sols',
    'area': 'First zone after the prologue: Apeman Facility (Monitoring, Elevator) + Baichang, New Kunlun Central Hall, Four Seasons Pavilion (hub), Central Transport Hub up to Tai-Chi Kick',
    'boundary': 'From the elevator down out of Peach Blossom Village (end of the prologue) to the Anomalous Root Node in the Central Transport Hub where Lear teaches Tai-Chi Kick. The zone boss is Red Tiger Elite Baichang (first boss-bar fight, gates the zone); the first new skills are Mystic Nymph (Pavilion) and Tai-Chi Kick (CTH). The first Sol (General Yingzhao) is 4 more scenes and ~1 h further (Power Reservoir E/C, Radiant Pagoda) and is left out, as its own zone.',
    'sources': [
        'ninesolsmap.com: zoom-15 tiles of the in-game map (https://map.ninesolsmap.com/map/15/{x}/{y}.png) and /api/markers (364 markers)',
        "Ixrec/NineSolsArchipelagoRandomizer + Ixrec/Archipelago (worlds/nine_sols): regions/connections/locations logic (connections.jsonc, locations.jsonc), Unity scene names (PortalData.cs), tracker map positions (ut_map_page)",
        'jakobhellermann/NineSols-DebugModPlus (MapTeleportModule: the map image is linear in world position per scene)',
        'ninesols.wiki.gg: Enemy_Characteristics, enemy pages, Combat, Talisman, Medicine_Pipe, Skill_Tree, Baichang, Yanren',
        'Steam guides 3457329455 (100% text walkthrough) and 3268452563 (100% video timestamps); intoindiegames.com walkthrough parts 1-3 (screenshots used for scale)',
        'Steam store screenshots (Yingzhao arena) for Yi-to-screen scale',
    ],
    'units': {'native': 'ninesolsmap zoom-15 map px (the in-game map image; Unity units unknown without the game files)', 'pxPerUnit': K,
              'viewNative': [200, 112.5],
              'how': 'Two gameplay screenshots at normal zoom (intoindiegames, AF Monitoring) show a corridor that is 46 map px tall filling 0.41 of the view height, so view height = 112 map px, width 200; cross-check: in the Baichang screenshot (camera zoomed out 1.41x, Yi 0.076 vs 0.107 of view height) the elevator door frame (60 map px) is 0.21 of the view width, giving 285 map px = 200 x 1.41. +-15%. Scenes are placed as on the in-game world map; transitions between scenes (elevators, doors) are not physical distances.',
              'originStitched': [OX, OY], 'stitchedToGlobalZ15': [10752, 1792]},
    'hero': {'box': [60, 116], 'boxNote': 'sprite bounds incl. ears at normal zoom (0.107 of view height), not the collider; collider unknown',
             'moveNote': 'run speed and jump height unknown (no datamined values; game files absent). Dash: ~0.27 s, i-frames 0.4-0.5 s, cooldown 1 s (wiki Combat)',
             'hp': yi['maxHP']['value'], 'attack': {'combo': yi['swordDamage']['groundCombo'], 'air': 20, 'talisman': '32 + 32x(Qi used+1)', 'pipe': '2 charges x 60 HP'},
             'startAbilities': ['Triple Slash combo (20/20/40) + air slashes', 'Parry (deflect)', 'Talisman / Qi Blast', 'Immortal Dash (ground dash with i-frames)',
                                'Grapple (at grapple points)', 'Wall Climb (on climbable walls) + wall jump', 'Ledge Grab', 'Rope climb', 'Medicine Pipe x2', 'Console hacking (in person)'],
             'abilityOrder': [
                 {'ability': 'Stasis Jade (first jade)', 'where': 'Baichang drop', 'roomId': 'afe-baichang', 'minuteGuess': 25},
                 {'ability': 'Mystic Nymph: Scout Mode (remote hack drone)', 'where': 'Pavilion, far-right room', 'roomId': 'fsp-east', 'minuteGuess': 30},
                 {'ability': 'Jade system', 'where': 'Pavilion, Ruyi', 'roomId': 'fsp-hall', 'minuteGuess': 35},
                 {'ability': 'Fusang Horn (fast travel) + skill tree', 'where': 'Pavilion root node, Lear', 'roomId': 'fsp-hall', 'minuteGuess': 42},
                 {'ability': 'Tai-Chi Kick (counter-kick off unblockable attacks; bounce)', 'where': 'Anomalous Root Node, Transport Hub', 'roomId': 'cth-node', 'minuteGuess': 60},
                 {'ability': '(next zone) Azure Bow', 'where': 'Pavilion after Yingzhao', 'roomId': None, 'minuteGuess': 150},
             ], 'src': 'wiki (HP, damage) / mined (kit: randomizer VanillaAbilities.cs + RemovedAbilities.cs) / estimate (minutes)'},
    'rooms': rooms,
    'terrain': terrain,
    'things': things,
    'enemies': enemies,
    'criticalPath': CRITICAL,
    'criticalPathLine': [[P(x, y) for x, y in seg] for seg in PATH],
    'firstPlayMinutes': {'criticalPath': 60, 'full100': 95, 'how': 'estimate: an experienced 100% video run takes ~33 min from village exit to Tai-Chi Kick (Steam guide 3268452563); first play x1.8. full100 counts only time spent in these 5 scenes, including returns for items gated by later abilities'},
}
def strip(o):
    if isinstance(o, dict): return {k: strip(v) for k, v in o.items() if v is not None}
    if isinstance(o, list): return [strip(v) for v in o]
    return o
area = strip(area)
json.dump(area, open(OUTDIR + '/area.json', 'w'), indent=1)
print('rooms', len(rooms), 'terrain', len(terrain), 'things', len(things), 'enemies', len(enemies))
print('area json bytes', os.path.getsize(OUTDIR + '/area.json'))
