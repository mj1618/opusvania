"""Look references from the installed Hollow Knight (outside the repo; nothing here is committed but this script).

usage: python -I render_look.py <.../Resources/Data> <out dir> <scene:cx:cy[,scene:cx:cy...]> [sprites=40]

For each view it draws the scene's enabled SpriteRenderers (objects active at load) as the game camera sees them:
perspective, FOV 24 deg, camera at (cx, cy, -38.1), 1920 x 1080; each sprite at its world matrix, tinted by its colour,
sorted by sorting layer, order, then depth (far first). Not drawn: tk2d meshes, particles, the tile map mesh, lights,
post effects and blend modes (all sprites are drawn alpha-over), so it is the layout of the art, not the final frame.
Also saves the N most-used environment sprites of those scenes as PNGs (sprites/), largest first."""
import collections, math, os, sys

import numpy as np
import UnityPy
from PIL import Image

DATA, OUT, VIEWS = sys.argv[1], sys.argv[2], sys.argv[3]
NSPR = int(sys.argv[4]) if len(sys.argv) > 4 else 40
os.makedirs(os.path.join(OUT, "sprites"), exist_ok=True)
CAMZ, FOV, WPX, HPX = 38.1, 24.0, 1920, 1080
PPU0 = HPX / (2 * CAMZ * math.tan(math.radians(FOV / 2)))   # screen px per unit at z = 0

ggm = UnityPy.load(os.path.join(DATA, "globalgamemanagers"))
scenes = []
for o in ggm.objects:
    if o.type.name == "BuildSettings":
        scenes = [s.split("/")[-1].replace(".unity", "") for s in o.read().scenes]
layer_order = {}
for o in ggm.objects:
    if o.type.name == "TagManager":
        d = o.parse_as_dict()
        for i, l in enumerate(d.get("m_SortingLayers", [])):
            layer_order[l["uniqueID"]] = i


def load(sc):
    env = UnityPy.load(os.path.join(DATA, f"level{scenes.index(sc)}"))
    f = list(env.files.values())[0]
    for e in f.externals:
        p = os.path.join(DATA, e.path)
        if os.path.exists(p):
            env.load_file(p, name=e.path)
    return env, f


def deref(f, pp):
    if pp["m_FileID"] == 0:
        return f.objects[pp["m_PathID"]]
    ext = f.externals[pp["m_FileID"] - 1].path.rsplit("/")[-1].lower()
    for k, v in f.environment.files.items():
        if k.rsplit("/")[-1].lower() == ext:
            return v.objects[pp["m_PathID"]]
    raise KeyError(ext)


def quat(q):
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def sprites_of(sc):
    env, f = load(sc)
    tr, gos = {}, {}
    for pid, o in f.objects.items():
        if o.type.name == "Transform":
            tr[pid] = o.parse_as_dict()
        elif o.type.name == "GameObject":
            gos[pid] = o.parse_as_dict()
    mat, parent = {}, {}
    for pid, d in tr.items():
        fa = d["m_Father"]["m_PathID"]
        if fa in tr:
            parent[d["m_GameObject"]["m_PathID"]] = tr[fa]["m_GameObject"]["m_PathID"]

    def world(pid):
        if pid not in mat:
            d = tr[pid]
            M = np.eye(4)
            s = d["m_LocalScale"]
            M[:3, :3] = quat(d["m_LocalRotation"]) @ np.diag([s["x"], s["y"], s["z"]])
            p = d["m_LocalPosition"]
            M[:3, 3] = [p["x"], p["y"], p["z"]]
            fa = d["m_Father"]["m_PathID"]
            mat[pid] = (world(fa) @ M) if fa in tr else M
        return mat[pid]

    def active(gid):
        while gid:
            if not gos[gid]["m_IsActive"]:
                return False
            gid = parent.get(gid)
        return True

    def path_of(gid):
        n = []
        while gid:
            n.append(gos[gid]["m_Name"])
            gid = parent.get(gid)
        return "/".join(n)

    out = []
    for gid, g in gos.items():
        if not active(gid):
            continue
        tp = None
        srd = None
        for c in g["m_Component"]:
            if c["component"]["m_FileID"]:
                continue
            o = f.objects.get(c["component"]["m_PathID"])
            if o is None:
                continue
            if o.type.name == "Transform":
                tp = o.path_id
            elif o.type.name == "SpriteRenderer":
                srd = o.parse_as_dict()
        if srd is None or tp is None or not srd["m_Enabled"] or not srd["m_Sprite"]["m_PathID"]:
            continue
        if any(k in path_of(gid).lower() for k in ("mask", "msk", "darkness", "blanker")):   # dark covers over unvisited parts
            continue
        out.append({"name": g["m_Name"], "M": world(tp), "sr": srd})
    return f, out


img_cache = {}


def sprite_img(f, pp):
    key = (f.name, pp["m_FileID"], pp["m_PathID"])
    if key not in img_cache:
        try:
            so = deref(f, pp)
            sp = so.read()
            im = sp.image.convert("RGBA")
            ppu = sp.m_PixelsToUnits
            w, h = sp.m_Rect.width / ppu, sp.m_Rect.height / ppu
            px, py = sp.m_Pivot.x, sp.m_Pivot.y
            img_cache[key] = (sp.m_Name, im, (-px * w, -py * h, (1 - px) * w, (1 - py) * h))
        except Exception:
            img_cache[key] = None
    return img_cache[key]


usage = collections.Counter()
keep = {}
for view in VIEWS.split(","):
    sc, cx, cy = view.split(":")
    cx, cy = float(cx), float(cy)
    f, items = sprites_of(sc)
    canvas = Image.new("RGBA", (WPX, HPX), (12, 14, 18, 255))
    items.sort(key=lambda it: (layer_order.get(it["sr"]["m_SortingLayerID"], 0), it["sr"]["m_SortingOrder"], -it["M"][2, 3]))
    drawn = 0
    for it in items:
        z = it["M"][2, 3]
        if z <= -CAMZ + 1:
            continue
        s = PPU0 * CAMZ / (CAMZ + z)            # px per unit at this depth
        got = sprite_img(f, it["sr"]["m_Sprite"])
        if not got:
            continue
        name, im, (x0, y0, x1, y1) = got
        usage[name] += 1
        keep.setdefault(name, im)
        M = it["M"]
        # image px (u, v) -> local (x0 + u * (x1-x0)/W, y1 - v * (y1-y0)/H) -> world -> screen
        iw, ih = im.size
        A = np.array([[(x1 - x0) / iw, 0, x0], [0, -(y1 - y0) / ih, y1], [0, 0, 1]])
        if it["sr"]["m_FlipX"]:
            A = np.array([[-1, 0, x0 + x1], [0, 1, 0], [0, 0, 1]]) @ A
        if it["sr"]["m_FlipY"]:
            A = np.array([[1, 0, 0], [0, -1, y0 + y1], [0, 0, 1]]) @ A
        Wm = np.array([[M[0, 0], M[0, 1], M[0, 3]], [M[1, 0], M[1, 1], M[1, 3]], [0, 0, 1]])
        S = np.array([[s, 0, WPX / 2 - s * cx], [0, -s, HPX / 2 + s * cy], [0, 0, 1]])
        T = S @ Wm @ A
        corners = [T @ np.array([u, v, 1]) for u, v in ((0, 0), (iw, 0), (iw, ih), (0, ih))]
        bx0, by0 = math.floor(min(c[0] for c in corners)), math.floor(min(c[1] for c in corners))
        bx1, by1 = math.ceil(max(c[0] for c in corners)), math.ceil(max(c[1] for c in corners))
        if bx1 < 0 or by1 < 0 or bx0 > WPX or by0 > HPX or bx1 - bx0 > 6 * WPX or by1 - by0 > 6 * HPX:
            continue
        cx0, cy0, cx1, cy1 = max(bx0, 0), max(by0, 0), min(bx1, WPX), min(by1, HPX)
        if cx1 - cx0 < 1 or cy1 - cy0 < 1:
            continue
        inv = np.linalg.inv(np.array([[1, 0, -cx0], [0, 1, -cy0], [0, 0, 1]]) @ T)
        col = it["sr"]["m_Color"]
        src = im
        if (col["r"], col["g"], col["b"], col["a"]) != (1, 1, 1, 1):
            a = np.asarray(im).astype(np.float32)
            a *= np.array([col["r"], col["g"], col["b"], col["a"]], np.float32)
            src = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
        piece = src.transform((cx1 - cx0, cy1 - cy0), Image.AFFINE, tuple(inv[:2].flatten()), resample=Image.BILINEAR)
        canvas.alpha_composite(piece, (cx0, cy0))
        drawn += 1
    p = os.path.join(OUT, f"view-{sc}-{int(cx)}-{int(cy)}.png")
    canvas.convert("RGB").save(p)
    print(p, drawn, "sprites")

skip = ("msk", "mask", "light", "glow", "shadow", "black", "white", "fade", "blur", "particle", "dot", "vignette")
cands = [(usage[n] * keep[n].size[0] * keep[n].size[1], n) for n in keep if not any(s in n.lower() for s in skip)]
for _, n in sorted(cands, reverse=True)[:NSPR]:
    keep[n].save(os.path.join(OUT, "sprites", f"{n}.png"))
print("sprites", min(NSPR, len(cands)))
