# Draw map.png from area.json only (1 px = 8 of our px), plus crops; and terrain-native.png from the map art.
import sys, json, math, os
S = sys.argv[1]; REPO = sys.argv[2]
sys.path.insert(0, S + '/tools')
from PIL import Image, ImageDraw, ImageFont
A = json.load(open(REPO + '/docs/design/reference-levels/ori/area.json'))
OUT = REPO + '/shots/reference-levels/ori'
SC = 8
xs = [p[0] for t in A['terrain'] for p in t['poly']] + [r['rect'][0] + r['rect'][2] for r in A['rooms']]
ys = [p[1] for t in A['terrain'] for p in t['poly']] + [r['rect'][1] + r['rect'][3] for r in A['rooms']]
W, H = max(xs) // SC + 40, max(ys) // SC + 200
im = Image.new('RGB', (W, H), (178, 178, 178)); d = ImageDraw.Draw(im, 'RGBA')
def F(sz): return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', sz)
f9, f11, f14, f20 = F(9), F(11), F(14), F(20)
q = lambda p: (p[0] / SC, p[1] / SC)

# rooms: tint
for r in A['rooms']:
    x, y, w, h = [v / SC for v in r['rect']]
    d.rectangle([x, y, x + w, y + h], fill=(248, 238, 214) if r['onCriticalPath'] else (222, 232, 244),
                outline=(150, 140, 120))
# terrain
for t in A['terrain']:
    pts = [q(p) for p in t['poly']]
    if t['kind'] == 'solid': d.polygon(pts, fill=(43, 45, 52))
for t in A['terrain']:
    pts = [q(p) for p in t['poly']]
    k = t['kind']
    if k == 'water': d.polygon(pts, fill=(70, 130, 220, 150))
    elif k == 'hazard': d.polygon(pts, fill=(220, 30, 30, 220))
    elif k in ('breakable', 'secretWall'):
        col = (240, 150, 20) if k == 'breakable' else (230, 60, 200)
        loop = pts + [pts[0]]
        for i in range(len(loop) - 1):
            (x0, y0), (x1, y1) = loop[i], loop[i + 1]; L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L / 3))
            for k2 in range(0, n, 2):
                d.line([(x0 + (x1 - x0) * k2 / n, y0 + (y1 - y0) * k2 / n), (x0 + (x1 - x0) * (k2 + 1) / n, y0 + (y1 - y0) * (k2 + 1) / n)], fill=col, width=2)
    elif k == 'door': d.polygon(pts, fill=(140, 60, 220, 230))
# room labels
for r in A['rooms']:
    x, y, w, h = [v / SC for v in r['rect']]
    d.text((x + 2, y + 1), r['id'], font=f11, fill=(120, 70, 0) if r['onCriticalPath'] else (40, 80, 140))
# critical route
route = [q(p) for p in A['criticalRoutePath']]
d.line(route, fill=(255, 170, 0, 230), width=3, joint='curve')
for p in A['criticalRoute']:
    if p.get('minuteGuess') is not None:
        x, y = q(p['at']); d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 170, 0))
        d.text((x + 4, y - 14), f"{p['minuteGuess']}'", font=f9, fill=(160, 90, 0))
# exits to other areas
for r in A['rooms']:
    for e in r['exits']:
        if e['to'] not in {x['id'] for x in A['rooms']}:
            x, y = q(e['at']); d.polygon([(x - 6, y - 6), (x + 6, y), (x - 6, y + 6)] if e['side'] in 'E' else
                                          [(x + 6, y - 6), (x - 6, y), (x + 6, y + 6)] if e['side'] == 'W' else
                                          [(x - 6, y + 6), (x, y - 6), (x + 6, y + 6)], fill=(20, 150, 60))
            d.text((x + 6, y + 4), '-> ' + e['to'] + (' [' + e['gate'].split(':')[0] + ']' if e.get('gate') else ''), font=f9, fill=(20, 110, 40))
# things
COL = {'pickup-major': (40, 200, 255), 'pickup-minor': (250, 220, 60), 'save': (60, 230, 120), 'landmark': (255, 255, 255),
       'lever': (200, 200, 200), 'breakable': (240, 150, 20), 'shortcut': (120, 255, 200)}
SHORT = {'KS': 'key', 'EC': 'energy', 'HC': 'life', 'AC': 'ability', 'MS': 'frag', 'map': 'MAP', 'ability': 'SKILL'}
for t in A['things']:
    x, y = q(t['at']); c = COL.get(t['kind'], (255, 255, 255))
    if t['kind'] == 'save': d.rectangle([x - 5, y - 5, x + 5, y + 5], fill=c, outline=(0, 0, 0))
    elif t['kind'] == 'landmark': d.polygon([(x, y - 6), (x + 5, y), (x, y + 6), (x - 5, y)], fill=c, outline=(0, 0, 0))
    else:
        rr = 5 if t['kind'] == 'pickup-major' else 3
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=c, outline=(0, 0, 0))
        if 'hidden' in t: d.ellipse([x - rr - 3, y - rr - 3, x + rr + 3, y + rr + 3], outline=(230, 60, 200), width=2)
    lab = t.get('value') if t['id'][0].isupper() else t['id']
    lab = SHORT.get(lab, lab) if lab else t['id']
    d.text((x + 6, y - 5), lab.replace(' (small)', ''), font=f9, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
# enemies
for e in A['enemies']:
    x, y = q(e['at']); r = 3 + 2 * e['difficulty']
    d.polygon([(x, y - r), (x + r, y + r), (x - r, y + r)], fill=(230, 40, 40), outline=(0, 0, 0))
    if 'patrol' in e: d.line([(e['patrol'][0] / SC, y + r + 2), (e['patrol'][1] / SC, y + r + 2)], fill=(230, 40, 40, 150), width=1)
    d.text((x + r + 1, y - 2), e['kind'].split(' (')[0], font=f9, fill=(255, 200, 200), stroke_width=2, stroke_fill=(60, 0, 0))
# scale legend (bottom-left)
ox, oy = 20, H - 180
d.rectangle([ox, oy, ox + 1920 / SC, oy + 1080 / SC], outline=(0, 0, 0), width=2)
d.text((ox + 4, oy + 4), '1920 x 1080 view (Ori: 41 x 23 u)', font=f11, fill=(0, 0, 0))
hb = A['hero']['box']
d.rectangle([ox + 20, oy + 100, ox + 20 + hb[0] / SC, oy + 100 + hb[1] / SC], fill=(255, 255, 255), outline=(0, 0, 0))
d.rectangle([ox + 40, oy + 100, ox + 40 + 40 / SC, oy + 100 + 80 / SC], fill=(255, 170, 0), outline=(0, 0, 0))
d.text((ox + 55, oy + 98), 'Ori box (white) vs our hero 40x80 (orange)', font=f9, fill=(0, 0, 0))
d.rectangle([ox + 20, oy + 120, ox + 20 + 64 / SC, oy + 120 + 64 / SC], outline=(0, 0, 0))
d.text((ox + 32, oy + 118), 'our 64 px tile', font=f9, fill=(0, 0, 0))
lx = ox + 280
items = [('solid', (43, 45, 52)), ('water', (70, 130, 220)), ('hazard', (220, 30, 30)), ('breakable (dashed)', (240, 150, 20)),
         ('secret wall (dashed)', (230, 60, 200)), ('gate / door', (140, 60, 220)), ('critical route, minute marks', (255, 170, 0)),
         ('pickup-major', (40, 200, 255)), ('pickup-minor', (250, 220, 60)), ('save (Spirit Well)', (60, 230, 120)),
         ('enemy (size = difficulty 1-5)', (230, 40, 40)), ('exit to another area', (20, 150, 60))]
for i, (n, c) in enumerate(items):
    yy = oy + (i % 6) * 22; xx = lx + (i // 6) * 260
    d.rectangle([xx, yy, xx + 14, yy + 14], fill=c, outline=(0, 0, 0)); d.text((xx + 20, yy), n, font=f11, fill=(0, 0, 0))
d.text((lx + 540, oy), 'Ori and the Blind Forest DE: Sunken Glades + Spirit Caverns -> Spirit Tree', font=f20, fill=(0, 0, 0))
d.text((lx + 540, oy + 28), '1 px = 8 of our px (1 Ori unit = 46.8 px). Terrain traced from the in-game map art; enemies estimated.', font=f14, fill=(0, 0, 0))
d.text((lx + 540, oy + 48), 'Pink ring = hidden pickup. Room tint: amber = on the critical path, blue = optional.', font=f14, fill=(0, 0, 0))
im.save(OUT + '/map.png')
# crops (same scale), three overlapping thirds
w3 = W // 3
for i, nm in enumerate(['west', 'middle', 'east']):
    im.crop((max(0, i * w3 - 100), 0, min(W, (i + 1) * w3 + 100), H)).save(OUT + f'/map-{nm}.png')
print('map', im.size)

# terrain-native: the in-game map art cropped to the area, at the same 1/8 scale, with room rects
from crs import g2p
art = Image.open(S + '/stitched.png').convert('RGB'); OX, OY = 29 * 256, 37 * 256
x0n, ytn = A['units']['originNative']; K = A['units']['pxPerUnit']
a0 = g2p(x0n, ytn); a1 = g2p(x0n + max(xs) / K, ytn - max(ys) / K)
c = art.crop((int(a0[0] - OX), int(a0[1] - OY), int(a1[0] - OX), int(a1[1] - OY)))
c = c.resize((int(max(xs) / SC), int(max(ys) / SC)))
dd = ImageDraw.Draw(c)
for r in A['rooms']:
    x, y, w, h = [v / SC for v in r['rect']]
    dd.rectangle([x, y, x + w, y + h], outline=(255, 200, 0) if r['onCriticalPath'] else (120, 180, 255))
    dd.text((x + 2, y + 1), r['id'], font=f11, fill=(255, 255, 255))
c.save(OUT + '/terrain-native.png'); print('native', c.size)
