"""Draw area.json at 1 px = 8 of our px. usage: render.py area.json out_dir"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont
Image.MAX_IMAGE_PIXELS = None
A = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
S = 8.0
PAD = 40
xs = [r["rect"][0] for r in A["rooms"]] + [r["rect"][0] + r["rect"][2] for r in A["rooms"]]
ys = [r["rect"][1] for r in A["rooms"]] + [r["rect"][1] + r["rect"][3] for r in A["rooms"]]
X0, Y0, X1, Y1 = min(xs), min(ys), max(xs), max(ys)
W = int((X1 - X0) / S) + 2 * PAD
H = int((Y1 - Y0) / S) + 2 * PAD + 260
im = Image.new("RGB", (W, H), (236, 232, 222))
d = ImageDraw.Draw(im)
try:
    F = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 11)
    FB = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
    FS = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 9)
except Exception:
    F = FB = FS = ImageFont.load_default()


def P(x, y):
    return ((x - X0) / S + PAD, (y - Y0) / S + PAD)


def dashed(pts, fill, width=2, dash=4):
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, int(L / dash))
        for i in range(0, n, 2):
            t0, t1 = i / n, min(1, (i + 1) / n)
            d.line([(ax + (bx - ax) * t0, ay + (by - ay) * t0), (ax + (bx - ax) * t1, ay + (by - ay) * t1)], fill=fill, width=width)


# rooms
for r in A["rooms"]:
    x, y, w, h = r["rect"]
    col = (250, 247, 240) if r.get("onCriticalPath") else (244, 240, 230)
    d.rectangle([P(x, y), P(x + w, y + h)], fill=col, outline=(190, 182, 168))
# terrain
for t in A["terrain"]:
    pts = [P(*p) for p in t["poly"]]
    if len(pts) < 2:
        continue
    k = t["kind"]
    closed = len(pts) > 2 and t.get("closed", True)
    if k == "solid":
        if closed:
            d.polygon(pts, fill=(52, 50, 58))
        else:
            d.line(pts, fill=(52, 50, 58), width=2)
    elif k == "oneway":
        d.line(pts, fill=(60, 90, 160), width=2)
    elif k == "hazard":
        d.polygon(pts, fill=(214, 40, 40)) if closed else d.line(pts, fill=(214, 40, 40), width=3)
    elif k == "water":
        d.polygon(pts, fill=(120, 170, 120)) if closed else d.line(pts, fill=(120, 170, 120), width=3)
    elif k in ("breakable", "secretWall"):
        dashed(pts + ([pts[0]] if closed else []), (230, 140, 20) if k == "breakable" else (170, 60, 200), 2)
    elif k == "door":
        d.line(pts, fill=(30, 150, 160), width=3)
# room labels
for r in A["rooms"]:
    x, y, w, h = r["rect"]
    d.text((P(x, y)[0] + 3, P(x, y)[1] + 2), f'{r["id"].replace("Crossroads_", "C")} {r.get("name", "")}'[:40], fill=(120, 110, 95), font=FS)
# critical path
cp = A.get("criticalPathPoints")
if cp:
    d.line([P(*p) for p in cp], fill=(20, 140, 60), width=4, joint="curve")
# things
GL = {"pickup-major": ((240, 190, 20), "diamond"), "pickup-minor": ((200, 170, 60), "dot"), "breakable": ((230, 140, 20), "x"),
      "lever": ((30, 150, 160), "square"), "shortcut": ((30, 150, 160), "square"), "save": ((40, 120, 230), "square"),
      "npc": ((90, 60, 160), "dot"), "shop": ((90, 60, 160), "square"), "lore": ((110, 90, 70), "square"),
      "boss": ((180, 0, 0), "diamond"), "arena": ((180, 0, 0), "x"), "landmark": ((100, 100, 100), "dot")}
for t in A["things"]:
    x, y = P(*t["at"])
    c, g = GL.get(t["kind"], ((0, 0, 0), "dot"))
    r = 5 if t["kind"] in ("pickup-major", "boss", "save") else 3
    if g == "diamond":
        d.polygon([(x, y - r - 2), (x + r + 2, y), (x, y + r + 2), (x - r - 2, y)], fill=c, outline=(0, 0, 0))
    elif g == "square":
        d.rectangle([x - r, y - r, x + r, y + r], fill=c, outline=(0, 0, 0))
    elif g == "x":
        d.line([x - r, y - r, x + r, y + r], fill=c, width=2); d.line([x - r, y + r, x + r, y - r], fill=c, width=2)
    else:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c, outline=(0, 0, 0) if t.get("hidden") else None)
    if t["kind"] not in ("pickup-minor",) or t.get("hidden"):
        d.text((x + r + 2, y - 6), t.get("label", t["id"])[:22], fill=c if t["kind"] != "pickup-major" else (150, 110, 0), font=FS)
# enemies
for e in A["enemies"]:
    x, y = P(*e["at"])
    r = 2 + 2 * e.get("difficulty", 1)
    if e.get("firstVisit") is False or e.get("spawned"):
        d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(150, 150, 150))
        continue
    d.ellipse([x - r, y - r, x + r, y + r], fill=(200, 40, 90), outline=(90, 0, 30))
    pt = e.get("patrol")
    if isinstance(pt, list):
        a, b = P(pt[0], e["at"][1]), P(pt[1], e["at"][1])
        d.line([a, b], fill=(200, 40, 90), width=1)
    d.text((x + r + 1, y + 1), e["kind"][:16] + (f' x{e["count"]}' if e.get("count", 1) > 1 else ""), fill=(150, 20, 60), font=FS)
# legend and scale
ly = H - 230
d.text((PAD, ly), f'{A["game"]}: {A["area"]}  (1 px = 8 px of ours; north up)', fill=(0, 0, 0), font=FB)
vx, vy = PAD, ly + 24
d.rectangle([vx, vy, vx + 1920 / S, vy + 1080 / S], outline=(40, 120, 230), width=2)
d.text((vx + 4, vy + 4), "our view 1920x1080", fill=(40, 120, 230), font=F)
hb = A["hero"]["box"]
d.rectangle([vx + 260, vy + 135 - hb[1] / S, vx + 260 + hb[0] / S, vy + 135], fill=(0, 0, 0))
d.rectangle([vx + 270, vy + 135 - 80 / S, vx + 270 + 40 / S, vy + 135], fill=(40, 120, 230))
d.text((vx + 285, vy + 120), "hero box: theirs (black), ours 40x80 (blue)", fill=(0, 0, 0), font=F)
lx = vx + 560
items = [("solid", (52, 50, 58)), ("hazard", (214, 40, 40)), ("water/acid", (120, 170, 120)), ("breakable (dashed)", (230, 140, 20)),
         ("secret wall (dashed)", (170, 60, 200)), ("critical path", (20, 140, 60)), ("enemy (size=difficulty; grey ring = infected-only/spawned)", (200, 40, 90)),
         ("major pickup", (240, 190, 20)), ("bench/save", (40, 120, 230)), ("npc/shop", (90, 60, 160)), ("lore", (110, 90, 70)), ("boss", (180, 0, 0))]
for i, (n, c) in enumerate(items):
    cx, cy = lx + (i // 4) * 380, vy + (i % 4) * 22
    d.rectangle([cx, cy, cx + 14, cy + 14], fill=c)
    d.text((cx + 20, cy), n, fill=(0, 0, 0), font=F)
im.save(os.path.join(OUT, "map.png"))
print("map", im.size)
