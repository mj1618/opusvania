import json, sys, math
from PIL import Image, ImageDraw, ImageFont
A = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
S = 8  # our px per image px
maxx = max(r['rect'][0] + r['rect'][2] for r in A['rooms']) + 400
maxy = max(r['rect'][1] + r['rect'][3] for r in A['rooms']) + 400
W, H = maxx // S, maxy // S
im = Image.new('RGB', (W, H), (236, 232, 222))
d = ImageDraw.Draw(im)
try:
    F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
    FB = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
    FS = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 11)
except Exception:
    F = FB = FS = ImageFont.load_default()
def p(xy): return (xy[0] / S, xy[1] / S)

# room rects (light), labels later
for r in A['rooms']:
    x, y, w, h = r['rect']
    d.rectangle([x / S, y / S, (x + w) / S, (y + h) / S], outline=(150, 175, 210) if r['onCriticalPath'] else (200, 200, 200), width=1)
def dashed(pts, fill, width=2, dash=6):
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        L = math.dist(a, b); n = max(1, int(L / dash))
        for k in range(0, n, 2):
            t0, t1 = k / n, min(1, (k + 1) / n)
            d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=fill, width=width)
for t in A['terrain']:
    pts = [p(q) for q in t['poly']]
    if t['kind'] == 'solid':
        d.polygon(pts, fill=(52, 52, 60), outline=(52, 52, 60))
for t in A['terrain']:
    pts = [p(q) for q in t['poly']]
    k = t['kind']
    if k == 'hazard': d.polygon(pts, fill=(220, 30, 30), outline=(220, 30, 30))
    elif k in ('breakable', 'secretWall'): dashed(pts, (230, 140, 0), 2, 4)
    elif k == 'door': d.polygon(pts, fill=(60, 140, 230), outline=(60, 140, 230))
    elif k == 'oneway': d.line(pts[:2], fill=(90, 90, 90), width=2)

# critical path
for seg in A['criticalPathLine']:
    d.line([p(q) for q in seg], fill=(0, 150, 255), width=4, joint='curve')
segs = A['criticalPathLine']
for a, b in zip(segs, segs[1:]):
    dashed([p(a[-1]), p(b[0])], (0, 150, 255), 2, 10) if False else None
    s, e = p(a[-1]), p(b[0]); L = math.dist(s, e); n = max(1, int(L / 12))
    for k in range(0, n, 2):
        t0, t1 = k / n, (k + 1) / n
        d.line([(s[0] + (e[0] - s[0]) * t0, s[1] + (e[1] - s[1]) * t0), (s[0] + (e[0] - s[0]) * t1, s[1] + (e[1] - s[1]) * t1)], fill=(0, 150, 255), width=2)

# exits that leave the area
for r in A['rooms']:
    for e in r['exits']:
        if e['to'].startswith('OUT:'):
            x, y = p(e['at'])
            d.polygon([(x - 7, y - 7), (x + 7, y - 7), (x, y + 7)], fill=(120, 60, 160))
            d.text((x + 9, y - 8), 'to ' + e['to'][4:] + (f" [{e['gate']}]" if e.get('gate') else ''), fill=(120, 60, 160), font=FS, stroke_width=2, stroke_fill=(255, 255, 255))
        elif e.get('gate'):
            x, y = p(e['at'])
            g = e['gate'].split(' ')[0]
            col = {'ability': (200, 0, 160), 'boss': (200, 0, 0), 'shortcut': (0, 140, 70), 'lever': (140, 110, 0), 'arena': (200, 0, 0)}.get(g, (100, 100, 100))
            d.rectangle([x - 4, y - 4, x + 4, y + 4], outline=col, width=2)
            d.text((x + 6, y + 2), g + (':' + e['gate'].split('(')[1].split(')')[0][:22] if '(' in e['gate'] else ''), fill=col, font=FS, stroke_width=2, stroke_fill=(255, 255, 255))

COL = {'save': (0, 170, 60), 'pickup-major': (230, 170, 0), 'pickup-minor': (240, 210, 60), 'lore': (90, 90, 220), 'npc': (0, 140, 140),
       'shop': (0, 140, 140), 'boss': (200, 0, 0), 'arena': (200, 0, 0), 'landmark': (110, 110, 110), 'lever': (140, 110, 0), 'shortcut': (0, 140, 70), 'breakable': (230, 140, 0)}
GL = {'save': 'S', 'pickup-major': 'M', 'pickup-minor': '$', 'lore': 'L', 'npc': 'N', 'shop': '#', 'boss': 'B', 'arena': 'A', 'landmark': '*', 'lever': 'H', 'shortcut': '>', 'breakable': 'x'}
labels = []
for t in A['things']:
    x, y = p(t['at']); c = COL.get(t['kind'], (0, 0, 0))
    r = 9 if t['kind'] in ('save', 'pickup-major', 'boss') else 7
    if t['kind'] == 'save':
        d.rectangle([x - r, y - r, x + r, y + r], fill=c)
    elif t['kind'].startswith('pickup'):
        d.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], fill=c, outline=(80, 60, 0))
    else:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    d.text((x - 4, y - 7), GL.get(t['kind'], '?'), fill='white', font=FS)
    lab = t['value'].split(':')[0][:28] if t['kind'] not in ('pickup-minor',) else t['value'][:12]
    if t.get('later'): lab += ' (later)'
    labels.append((x + r + 2, y - 6, lab, c))
for e in A['enemies']:
    x, y = p(e['at']); r = 3 + 3 * e['difficulty']
    col = (170, 0, 0) if not e.get('later') else (200, 120, 120)
    d.polygon([(x, y - r), (x + r, y + r * 0.8), (x - r, y + r * 0.8)], fill=col, outline=(60, 0, 0))
    short = {'Blade Trooper': 'BT', 'Bolt Warrior': 'BW', 'Spear Vanguard': 'SV', 'Armored Spear Vanguard': 'ASV', 'Feral Beast': 'FB', 'Blade Commander': 'BC',
             'Skycleaver Soldier': 'SK', 'Swift Crossbow Cannon': 'TU', 'Maul Corporal': 'MC'}.get(e['kind'], e['kind'].split(':')[-1].strip())
    labels.append((x + r + 1, y + 2, f"{short} {e['hp']}", col))
for x, y, s, c in labels:
    d.text((x, y), s, fill=c, font=FS, stroke_width=2, stroke_fill=(255, 255, 255))
for r in A['rooms']:
    x, y, w, h = r['rect']
    d.text((x / S + 3, y / S + 2), r['id'], fill=(40, 70, 130) if r['onCriticalPath'] else (110, 110, 110), font=F, stroke_width=2, stroke_fill=(255, 255, 255))

# scale box: hero + view, bottom-left corner
ox, oy = 30, H - 200
d.rectangle([ox - 10, oy - 40, ox + 1920 / S + 300, H - 10], fill=(255, 255, 255), outline=(0, 0, 0))
d.rectangle([ox, oy, ox + 1920 / S, oy + 1080 / S], outline=(0, 0, 0), width=2)
hb = A['hero']['box']
d.rectangle([ox + 20, oy + 1080 / S - hb[1] / S, ox + 20 + hb[0] / S, oy + 1080 / S], fill=(0, 120, 255))
d.rectangle([ox + 40, oy + 1080 / S - 80 / S, ox + 40 + 40 / S, oy + 1080 / S], fill=(255, 120, 0))
d.text((ox, oy - 32), 'Nine Sols, first zone. 1 px = 8 our px. Box: our 1920x1080 view.', fill=(0, 0, 0), font=F)
d.text((ox, oy - 17), 'Blue = Yi sprite (60x116), orange = our hero box (40x80)', fill=(0, 0, 0), font=FS)
lx = ox + 1920 / S + 10
leg = ['solid: dark  hazard: red  door: blue  breakable/secret: dashed orange', 'blue line = critical path (dashes = scene transition)',
       'S save  M major pickup  $ jin chest  L lore  N npc  # shop', 'H lever/console  > shortcut  A arena  B boss  * landmark',
       'triangle = enemy (size = difficulty 1-5), label = kind HP', 'pale = needs a later ability',
       'BT Blade Trooper  BW Bolt Warrior  SV Spear Vanguard', 'FB Feral Beast  SK Skycleaver  TU turret  BC Blade Commander', 'MC Maul Corporal  ASV Armored Spear Vanguard']
for i, s in enumerate(leg):
    d.text((lx, oy + i * 15), s, fill=(0, 0, 0), font=FS)
d.text((20, 15), 'Nine Sols: Apeman Facility (Monitoring, Elevator) > Central Hall > Four Seasons Pavilion > Central Transport Hub (to Tai-Chi Kick). Drawn from area.json only.', fill=(0, 0, 0), font=FB)
im.save(OUT + '/map.png')
print(im.size)
crops = {'afm': ('afm-',), 'afe': ('afe-',), 'ch': ('ch-',), 'fsp': ('fsp-',), 'cth': ('cth-',)}
for name, pre in crops.items():
    rs = [r for r in A['rooms'] if r['id'].startswith(pre)]
    x0 = min(r['rect'][0] for r in rs) / S - 40; y0 = min(r['rect'][1] for r in rs) / S - 40
    x1 = max(r['rect'][0] + r['rect'][2] for r in rs) / S + 160; y1 = max(r['rect'][1] + r['rect'][3] for r in rs) / S + 40
    im.crop((int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1)))).save(f'{OUT}/map-{name}.png')
