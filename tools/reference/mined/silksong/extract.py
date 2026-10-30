"""Hollow Knight: Silksong first-area extractor (2026-10-30). Reads the installed Mac build read-only; writes nothing
into the game folder and ships no game data. Output of `build` is docs/design/reference-levels/silksong/area.json.

usage: python -I extract.py <command> [args]      (a venv with UnityPy>=1.25, Pillow, numpy, dnfile; run outside the game folder)
  D="$HOME/Library/Application Support/Steam/steamapps/common/Hollow Knight Silksong/Hollow Knight Silksong.app/Contents/Resources/Data"
  A="$D/StreamingAssets/aa/StandaloneOSX"
  python -I extract.py cabindex "$A" cabindex.json
  python -I extract.py dump "$D" scenes Tut_01,Tut_01b,Tut_02,Tut_03,Aspid_01,Bonetown,Bonegrave,Bellway_01,Bone_01,Bone_01b,Bone_01c,Bone_02,Bone_03,Bone_04,Bone_05,Bone_05_boss,Bone_05_bellway,Bone_05b,Bone_06,Bone_07,Bone_08,Bone_09,Bone_10,Bone_11,Bone_11b,Bone_12,Bone_14,Bone_15,Bone_16,Bone_17,Bone_18,Bone_19,Bellshrine,Mosstown_01,Mosstown_02,Mosstown_02c,Bonetown_boss,Bellway_01_boss
  python -I extract.py build scenes "$A" cabindex.json out/area.json
  python -I extract.py render "$A" cabindex.json Tut_01 16 tut_01.png

Notes: Unity 6000.0.50f1 strips the version string from the bundles, so UnityPy.config.FALLBACK_UNITY_VERSION is set.
Scenes are Addressables bundles (scenes_scenes_scenes/<scene>.bundle); typetrees are included; MonoScript names come from
*_monoscripts.bundle; cross-bundle pointers resolve through the CAB index. Each command below is the script as it was run,
kept verbatim and executed with its own globals.
"""
import sys, types

COMMON = r'''"""shared helpers for the Silksong reference build (reads the dumps written by dump.py)"""
import json, os, re
AREA = {  # scene -> (sub-area, zone)
    "Tut_01": "Moss Grotto", "Tut_01b": "Moss Grotto", "Tut_02": "Moss Grotto", "Aspid_01": "Moss Grotto (upper shaft)",
    "Tut_03": "Bone Bottom (the chapel)", "Bonetown": "Bone Bottom", "Bonegrave": "Bone Bottom", "Bellway_01": "Bone Bottom",
    "Bone_01": "The Marrow", "Bone_01c": "The Marrow", "Bone_02": "The Marrow", "Bone_03": "The Marrow", "Bone_05": "The Marrow",
    "Bone_06": "The Marrow", "Bone_07": "The Marrow", "Bone_08": "The Marrow", "Bone_09": "The Marrow", "Bone_10": "The Marrow",
    "Bone_12": "The Marrow", "Bone_14": "The Marrow", "Bone_15": "The Marrow", "Bone_16": "The Marrow", "Bone_17": "The Marrow",
    "Bone_18": "The Marrow", "Bone_19": "The Marrow", "Bellshrine": "The Marrow",
    "Bone_01b": "Mosshome", "Bone_04": "Mosshome", "Bone_05b": "Mosshome", "Bone_11": "Mosshome", "Bone_11b": "Mosshome",
    "Mosstown_01": "Mosshome", "Mosstown_02": "Mosshome", "Mosstown_02c": "Mosshome",
}
ADDITIVE = {"Bone_05_boss": "Bone_05", "Bonetown_boss": "Bonetown", "Bone_05_bellway": "Bone_05", "Bellway_01_boss": "Bellway_01"}
def load(dumpdir, scene):
    d = json.load(open(os.path.join(dumpdir, scene.lower() + ".json")))
    gp = os.path.join(dumpdir, scene.lower() + ".grid.json")
    d["grid"] = json.load(open(gp)) if os.path.exists(gp) else None
    return d

def activity(gos):
    """fresh-game (Act 1) activity: an object counts if every ancestor is active, where 'Normal World' groups (the
    Act 1-2 side of a Black Thread switch) and battle/boss waves count as active and 'Black Thread World' never does"""
    by_path = {}
    for g in gos: by_path.setdefault(g["path"], g)
    res = {}
    for g in gos:
        parts = g["path"].split("/")
        ok = True
        for i in range(1, len(parts) + 1):
            name = parts[i - 1]
            if name == "Black Thread World" or name.startswith("Act3") or name.startswith("Act 3"): ok = False; break
            a = by_path.get("/".join(parts[:i]))
            if a is None: continue
            if name == "Normal World" or re.match(r"^(Wave \d+|Battle Scene|Boss Scene|Bosses|Battle End|Active After Battle)", name): continue
            if not a["active"]: ok = False; break
            m = a["mono"]
            if "DeactivateIfPlayerdataFalse" in m: ok = False; break
        res[id(g)] = ok
    return res
'''

# ---- enums: read enum names/values from Managed/Assembly-CSharp.dll: enums <dll> MapZone,HazardType
ENUMS = r'''import sys, dnfile
pe = dnfile.dnPE(sys.argv[1])
md = pe.net.mdtables
want = set(sys.argv[2].split(","))
consts = {}
for c in md.Constant.rows:
    try: consts[str(c.Parent.row.Name), c.Parent.row_index] = c.Value
    except Exception: pass
for td in md.TypeDef.rows:
    if str(td.TypeName) in want:
        vals = []
        for f in td.FieldList:
            v = consts.get((str(f.row.Name), f.row_index))
            if hasattr(v, 'value'): v = v.value
            if isinstance(v, (bytes, bytearray)) and len(v) <= 8: v = int.from_bytes(v, "little", signed=True)
            vals.append((str(f.row.Name), v))
        print(str(td.TypeName), vals)
'''

# ---- cabindex: map CAB names to bundles from UnityFS headers: cabindex <aa dir> <out cabindex.json>
CABINDEX = r'''"""Map CAB-xxxx names to bundle files by reading only each UnityFS header. usage: cabindex.py <aa/StandaloneOSX> <out.json>"""
import os, sys, json, struct
from UnityPy.helpers import CompressionHelper
root = sys.argv[1]; idx = {}
def cstr(f):
    b = b""
    while True:
        c = f.read(1)
        if c in (b"\0", b""): return b.decode()
        b += c
for dp, dn, fn in os.walk(root):
    for n in fn:
        if not n.endswith(".bundle"): continue
        p = os.path.join(dp, n)
        with open(p, "rb") as f:
            if cstr(f) != "UnityFS": continue
            ver = struct.unpack(">I", f.read(4))[0]; cstr(f); cstr(f)
            size, csz, usz, flags = struct.unpack(">qIII", f.read(20))
            if ver >= 7: f.seek((f.tell() + 15) // 16 * 16)
            if flags & 0x80:
                f.seek(size - csz)
            data = f.read(csz)
            comp = flags & 0x3F
            if comp == 0: bi = data
            elif comp in (2, 3): bi = CompressionHelper.decompress_lz4(data, usz)
            elif comp == 1: bi = CompressionHelper.decompress_lzma(data)
            else: continue
            off = 16; nb = struct.unpack(">i", bi[off:off+4])[0]; off += 4 + nb * 10
            nn = struct.unpack(">i", bi[off:off+4])[0]; off += 4
            for _ in range(nn):
                off += 20; e = bi.index(b"\0", off); name = bi[off:e].decode(); off = e + 1
                idx[name] = os.path.relpath(p, root)
json.dump(idx, open(sys.argv[2], "w")); print(len(idx))
'''

# ---- dump: dump scenes to JSON (+ tile grids): dump <Data dir> <out dir> scene,scene,...
DUMP = r'''"""Dump Silksong scene bundles to JSON (GameObjects, world transforms, layers, colliders, MonoBehaviour scalars).
usage: python -I dump.py <Data dir> <out dir> scene[,scene...]"""
import json, math, os, sys, warnings
import numpy as np
import UnityPy
warnings.filterwarnings("ignore")
UnityPy.config.FALLBACK_UNITY_VERSION = "6000.0.50f1"
DATA, OUT, WANT = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
AA = os.path.join(DATA, "StreamingAssets/aa/StandaloneOSX")
os.makedirs(OUT, exist_ok=True)
ms = UnityPy.load(os.path.join(AA, [f for f in os.listdir(AA) if f.endswith("_monoscripts.bundle")][0]))
SCRIPT = {}
for o in ms.objects:
    if o.type.name == "MonoScript":
        tt = o.read_typetree()
        SCRIPT[o.path_id] = (tt.get("m_Namespace") or "") and tt["m_Namespace"] + "." + tt["m_ClassName"] or tt["m_ClassName"]

def qmat(q):
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def scal(v, depth=0):
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v if not (isinstance(v, str) and len(v) > 300) else v[:300]
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
    if isinstance(v, dict):
        if depth > 3: return None
        if set(v.keys()) >= {"m_FileID", "m_PathID"}:
            return {"pptr": [v["m_FileID"], v["m_PathID"]]} if v["m_PathID"] else None
        d = {}
        for k, x in v.items():
            s = scal(x, depth + 1)
            if s is not None and s != {} and s != []: d[k] = s
        return d
    if isinstance(v, list):
        if len(v) > 64 or depth > 3: return None
        return [s for s in (scal(x, depth + 1) for x in v) if s is not None]
    if isinstance(v, (bytes, bytearray)): return None
    return None

def fsm_summary(tt):
    f = tt.get("fsm") or {}
    out = {"name": f.get("name") or tt.get("fsmName"), "template": scal(tt.get("fsmTemplate"))}
    out["states"] = [s.get("name") for s in f.get("states", [])][:80]
    out["events"] = [e.get("name") for e in f.get("events", [])][:80]
    var = f.get("variables") or {}
    vv = {}
    for kind in ("floatVariables", "intVariables", "boolVariables", "stringVariables", "vector2Variables", "vector3Variables"):
        for x in var.get(kind, []) or []:
            val = x.get("value")
            if isinstance(val, dict): val = [round(val.get(c, 0), 3) for c in ("x", "y", "z") if c in val]
            elif isinstance(val, float): val = round(val, 4)
            vv[x.get("name")] = val
    out["vars"] = vv
    acts = {}
    for s in f.get("states", [])[:80]:
        ad = s.get("actionData") or {}
        names = [n.split(".")[-1] for n in ad.get("actionNames", [])]
        fp = ad.get("fsmFloatParams") or []
        floats = [round(p.get("value", 0), 3) for p in fp if not p.get("useVariable")]
        sp = [p.get("value") for p in (ad.get("fsmStringParams") or []) if not p.get("useVariable") and p.get("value")]
        acts[s.get("name")] = {"a": names[:30], "f": floats[:30], "s": sp[:20]}
    out["actions"] = acts
    return out

def tile_grid(tt):
    """solid tiles of the first tilemap layer: rows bottom-up (row 0 = y 0..1), '#' = tile, '.' = none"""
    W, H = tt["width"], tt["height"]
    L = tt["layers"][0]; nc, dx, dy = L["numColumns"], L["divX"], L["divY"]
    g = np.full((L["numRows"] * dy, nc * dx), -1)
    for i, c in enumerate(L["spriteChannel"]["chunks"]):
        if c["spriteIds"]:
            r, cc = divmod(i, nc)
            g[r*dy:(r+1)*dy, cc*dx:(cc+1)*dx] = np.array(c["spriteIds"]).reshape(dy, dx)
    g = g[:H, :W]
    return {"w": W, "h": H, "rows": ["".join("#" if v >= 0 else "." for v in row) for row in g]}

for sc in WANT:
    fn = os.path.join(AA, "scenes_scenes_scenes", sc.lower() + ".bundle")
    if not os.path.exists(fn):
        print("no scene", sc); continue
    env = UnityPy.load(fn)
    objs = {o.path_id: o for o in env.objects}
    tr, gos = {}, {}
    for pid, o in objs.items():
        t = o.type.name
        if t in ("Transform", "RectTransform"): tr[pid] = o.read_typetree()
        elif t == "GameObject": gos[pid] = o.read_typetree()
    mat = {}
    def world(pid):
        if pid in mat: return mat[pid]
        d = tr[pid]; p, q, s = d["m_LocalPosition"], d["m_LocalRotation"], d["m_LocalScale"]
        M = np.eye(4); M[:3, :3] = qmat(q) @ np.diag([s["x"], s["y"], s["z"]]); M[:3, 3] = [p["x"], p["y"], p["z"]]
        f = d["m_Father"]["m_PathID"]
        if f and f in tr: M = world(f) @ M
        mat[pid] = M; return M
    go_tr = {d["m_GameObject"]["m_PathID"]: pid for pid, d in tr.items()}
    parent_go = {}
    for pid, d in tr.items():
        f = d["m_Father"]["m_PathID"]
        if f and f in tr: parent_go[d["m_GameObject"]["m_PathID"]] = tr[f]["m_GameObject"]["m_PathID"]
    def path(gid):
        n = []
        while gid:
            n.append(gos[gid]["m_Name"] if gid in gos else "?"); gid = parent_go.get(gid)
        return "/".join(reversed(n))
    def active_h(gid):
        while gid:
            if gid in gos and not gos[gid]["m_IsActive"]: return False
            gid = parent_go.get(gid)
        return True
    out = []
    grids = []
    for gid, g in gos.items():
        tp = go_tr.get(gid)
        M = world(tp) if tp else np.eye(4)
        rec = {"id": gid, "name": g["m_Name"], "path": path(gid), "layer": g["m_Layer"], "tag": g.get("m_Tag"),
               "active": bool(g["m_IsActive"]), "activeH": active_h(gid),
               "pos": [round(float(M[0, 3]), 3), round(float(M[1, 3]), 3), round(float(M[2, 3]), 3)],
               "sx": round(float(np.linalg.norm(M[:3, 0])) * (1 if M[0, 0] >= 0 else -1), 3),
               "sy": round(float(np.linalg.norm(M[:3, 1])) * (1 if M[1, 1] >= 0 else -1), 3),
               "comps": [], "col": [], "mono": {}}
        def W(x, y):
            v = M @ np.array([x, y, 0, 1.0]); return [round(float(v[0]), 3), round(float(v[1]), 3)]
        for c in g["m_Component"]:
            cp = c["component"]
            co = objs.get(cp["m_PathID"])
            if co is None or cp["m_FileID"] != 0: continue
            t = co.type.name
            if t in ("Transform", "RectTransform"): continue
            try:
                if t.endswith("Collider2D"):
                    d = co.read_typetree()
                    cd = {"t": t, "trig": bool(d.get("m_IsTrigger")), "en": bool(d.get("m_Enabled"))}
                    off = d.get("m_Offset", {"x": 0, "y": 0})
                    if t == "BoxCollider2D":
                        sx, sy = d["m_Size"]["x"] / 2, d["m_Size"]["y"] / 2
                        cd["pts"] = [W(off["x"]-sx, off["y"]-sy), W(off["x"]+sx, off["y"]-sy), W(off["x"]+sx, off["y"]+sy), W(off["x"]-sx, off["y"]+sy)]
                    elif t == "PolygonCollider2D":
                        cd["paths"] = [[W(p["x"]+off["x"], p["y"]+off["y"]) for p in pp] for pp in d["m_Points"]["m_Paths"]]
                    elif t == "EdgeCollider2D":
                        cd["pts"] = [W(p["x"]+off["x"], p["y"]+off["y"]) for p in d["m_Points"]]
                    elif t == "CircleCollider2D":
                        cd["c"] = W(off["x"], off["y"]); cd["r"] = round(d["m_Radius"] * abs(rec["sx"]), 3)
                    else:
                        cd["raw"] = scal({k: v for k, v in d.items() if k not in ("m_GameObject",)})
                    rec["col"].append(cd); rec["comps"].append(t)
                elif t == "MonoBehaviour":
                    tt = co.read_typetree()
                    if "partitionSizeX" in tt and tt.get("layers"):
                        grids.append(tile_grid(tt))
                    sp = tt.get("m_Script", {})
                    name = SCRIPT.get(sp.get("m_PathID"), "?%s" % sp.get("m_PathID"))
                    rec["comps"].append(name)
                    if name.endswith("PlayMakerFSM"):
                        rec["mono"].setdefault("PlayMakerFSM", []).append(fsm_summary(tt))
                    else:
                        rec["mono"].setdefault(name, scal({k: v for k, v in tt.items() if not k.startswith("m_")}))
                elif t == "SpriteRenderer":
                    d = co.read_typetree()
                    rec["comps"].append(t)
                    rec["sr"] = {"en": bool(d["m_Enabled"]), "order": d["m_SortingOrder"], "layer": d["m_SortingLayerID"],
                                 "sprite": [d["m_Sprite"]["m_FileID"], d["m_Sprite"]["m_PathID"]],
                                 "color": [round(d["m_Color"][k], 3) for k in "rgba"], "flip": [d.get("m_FlipX"), d.get("m_FlipY")],
                                 "mat": [[m["m_FileID"], m["m_PathID"]] for m in d.get("m_Materials", [])][:2]}
                elif t == "MeshRenderer":
                    d = co.read_typetree(); rec["comps"].append(t)
                    rec["mr"] = {"en": bool(d["m_Enabled"]), "order": d["m_SortingOrder"], "layer": d["m_SortingLayerID"]}
                else:
                    rec["comps"].append(t)
            except Exception as e:
                rec["comps"].append(f"{t}!err:{str(e)[:80]}")
        out.append(rec)
    if grids:
        json.dump(grids[0], open(os.path.join(OUT, f"{sc}.grid.json"), "w"))
    main = max({id(o.assets_file): o.assets_file for o in env.objects}.values(), key=lambda f: len(f.objects))
    json.dump({"scene": sc, "externals": [e.path for e in main.externals], "gos": out},
              open(os.path.join(OUT, f"{sc}.json"), "w"))
    print(sc, len(out), "objects")
'''

# ---- build: build area.json from the dumps: build <dump dir> <aa dir> <cabindex.json> <out area.json>
BUILD = r'''"""Build docs/design/reference-levels/silksong/area.json from the scene dumps.
usage: python -I build.py <dump dir> <aa dir> <cabindex.json> <out area.json>"""
import json, math, os, re, sys, warnings
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import AREA, ADDITIVE, load, activity
DUMP, AA, CABS, OUT = sys.argv[1:5]
K = 1080 / (2 * 38.1 * 0.21255656)  # = 66.68 our px per unit: view 16.197 u tall (FOV 24 at z -38.1) -> 1080 px, 28.79 u wide -> 1920

# ---------- sprite sizes (for secret masks) ----------
import UnityPy
warnings.filterwarnings("ignore"); UnityPy.config.FALLBACK_UNITY_VERSION = "6000.0.50f1"
cabidx = json.load(open(CABS)); bcache = {}
def sprite_size(ext, pptr):
    fid, pid = pptr
    if not fid or not pid: return None
    b = cabidx.get(ext[fid - 1].split("/")[-1])
    if not b: return None
    if b not in bcache: bcache[b] = {o.path_id: o for o in UnityPy.load(os.path.join(AA, b)).objects}
    o = bcache[b].get(pid)
    if o is None or o.type.name != "Sprite": return None
    t = o.read_typetree(); ppu = t["m_PixelsToUnits"]
    return (t["m_Rect"]["width"] / ppu, t["m_Rect"]["height"] / ppu, t["m_Pivot"]["x"], t["m_Pivot"]["y"])

scenes = {}
ADDITIVE = {k: v for k, v in ADDITIVE.items() if k != 'Bonetown_boss'}  # the Skull Tyrant's raid on Bone Bottom is a later event
for sc in list(AREA) + list(ADDITIVE):
    d = load(DUMP, sc)
    d["act"] = activity(d["gos"])
    scenes[sc] = d
for add, host in ADDITIVE.items():  # additive scenes share the host's coordinates
    for g in scenes[add]["gos"]: g["_from"] = add
    scenes[host].setdefault("extra", []).append(add)

def objs(sc):
    out = [(g, scenes[sc]) for g in scenes[sc]["gos"]]
    for a in scenes[sc].get("extra", []): out += [(g, scenes[a]) for g in scenes[a]["gos"]]
    return out
def active(g, d): return d["act"][id(g)]
def cen(g):
    for c in g["col"]:
        if "pts" in c and c["pts"]: return [sum(p[0] for p in c["pts"]) / len(c["pts"]), sum(p[1] for p in c["pts"]) / len(c["pts"])]
    return g["pos"][:2]

# ---------- rooms: playable box = bounding box of the air tiles (+1 tile of wall), gates included ----------
rooms = {}
for sc in AREA:
    d = scenes[sc]; gr = d["grid"]
    rows = gr["rows"]; W, H = gr["w"], gr["h"]
    air = np.array([[c == "." for c in r] for r in rows])
    ys, xs = np.where(air)
    gates = []
    for g in d["gos"]:
        tp = g["mono"].get("TransitionPoint")
        if tp and d["act"][id(g)] or (tp and g["name"].startswith("door")):
            c = cen(g)
            gates.append({"name": g["name"].split(" ")[0] if not g["name"].startswith("door") else g["name"], "full": g["name"], "c": c, "to": tp.get("targetScene") or "", "entry": tp.get("entryPoint") or "", "door": bool(tp.get("isADoor")), "active": d["act"][id(g)]})
    gx = [q["c"][0] for q in gates if not q["door"]]; gy = [q["c"][1] for q in gates if not q["door"]]
    x0 = max(0, min(list(xs) + gx) - 1); x1 = min(W, max(list(xs) + gx) + 2)
    y0 = max(0, min(list(ys) + gy) - 1); y1 = min(H, max(list(ys) + gy) + 2)
    x0, y0 = math.floor(x0), math.floor(y0); x1, y1 = math.ceil(x1), math.ceil(y1)
    rooms[sc] = {"box": [x0, y0, x1, y1], "W": W, "H": H, "gates": gates, "air": int(air[y0:y1, x0:x1].sum())}

# ---------- layout by gate alignment (least squares over every non-door link inside the area) ----------
ids = list(AREA); ix = {s: i for i, s in enumerate(ids)}
eqs = []
for s in ids:
    for g in rooms[s]["gates"]:
        if g["door"] or g["to"] not in rooms: continue
        other = [q for q in rooms[g["to"]]["gates"] if q["name"] == g["entry"] or q["full"] == g["entry"]]
        if not other: continue
        o = other[0]
        eqs.append((s, g["to"], g["c"][0] - o["c"][0], g["c"][1] - o["c"][1]))
pos = {}
for dim in (0, 1):
    A = []; b = []
    for s, t, dx, dy in eqs:
        row = np.zeros(len(ids)); row[ix[t]] = 1; row[ix[s]] = -1; A.append(row); b.append(dx if dim == 0 else dy)
    row = np.zeros(len(ids)); row[ix["Tut_01"]] = 1; A.append(row * 100); b.append(0)
    sol, *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
    for s in ids: pos.setdefault(s, [0, 0])[dim] = float(sol[ix[s]])
resid = [abs((pos[t][0] - pos[s][0]) - dx) + abs((pos[t][1] - pos[s][1]) - dy) for s, t, dx, dy in eqs]
linked = set([e[0] for e in eqs] + [e[1] for e in eqs])
# door-only rooms: put them beside the door that leads in, below the host room's box
for s in ids:
    if s in linked: continue
    for h in ids:
        for g in rooms[h]["gates"]:
            if g["to"] == s and h in linked:
                bx = rooms[s]["box"]; hb = rooms[h]["box"]
                pos[s] = [pos[h][0] + g["c"][0] - (bx[0] + bx[2]) / 2, pos[h][1] + hb[1] - bx[3] - 6]
                linked.add(s); break
        if s in linked: break
print("links", len(eqs), "max residual (u)", round(max(resid), 2), "mean", round(sum(resid) / len(resid), 2))

# world (native, y up) -> ours (px, y down, origin top-left of everything)
top = max(pos[s][1] + rooms[s]["box"][3] for s in ids); left = min(pos[s][0] + rooms[s]["box"][0] for s in ids)
def P(s, x, y): return [round((pos[s][0] + x - left) * K), round((top - (pos[s][1] + y)) * K)]
def poly(s, pts): return [P(s, x, y) for x, y in pts]

# ---------- terrain ----------
terrain = []
seen_h = set()
def rects_from_grid(rows, box):
    x0, y0, x1, y1 = box
    used = set(); out = []
    for y in range(y0, y1):
        x = x0
        while x < x1:
            if rows[y][x] == "#" and (x, y) not in used:
                xe = x
                while xe < x1 and rows[y][xe] == "#" and (xe, y) not in used: xe += 1
                ye = y + 1
                while ye < y1 and all(rows[ye][k] == "#" and (k, ye) not in used for k in range(x, xe)): ye += 1
                for yy in range(y, ye):
                    for k in range(x, xe): used.add((k, yy))
                out.append((x, y, xe, ye)); x = xe
            else: x += 1
    return out
BREAK_RE = re.compile(r"^(Breakable Wall|Breakable Floor|break_wall|Bone_face_shortcut|bone_gate|Bone Gate|Great Bone Gate|Song_Gate_set|Song_Gate_small|Moss Vine Cluster|Collapse|One Way Wall)", re.I)
for s in ids:
    d = scenes[s]; box = rooms[s]["box"]
    for (x, y, xe, ye) in rects_from_grid(d["grid"]["rows"], box):
        terrain.append({"roomId": s, "kind": "solid", "poly": poly(s, [(x, y), (xe, y), (xe, ye), (x, ye)]), "src": "files: tk2dTileMap tiles"})
    for g, dd in objs(s):
        if not active(g, dd): continue
        top_name = g["path"].split("/")[0]
        for c in g["col"]:
            if c["trig"] or not c["en"]: continue
            pts = c.get("pts") or (c.get("paths") or [[]])[0]
            if len(pts) < 2 or "Scenemap/Chunk" in g["path"]: continue
            if g["layer"] == 8 and BREAK_RE.match(top_name):
                kind = "secretWall" if any("Mask" in q["path"] and q["path"].startswith(top_name + "/") for q, _ in [(q, dd) for q in dd["gos"]] if "Unmasker" in q["comps"] or "Remasker" in q["comps"]) else ("door" if re.match(r"Song_Gate|bone_gate|Bone Gate|Great Bone", top_name) else "breakable")
                terrain.append({"roomId": s, "kind": kind, "poly": poly(s, pts), "src": f"files: {top_name}"})
            elif g["layer"] == 8 and "HealthManager" not in g["mono"] and "Breakable" not in g["mono"]:
                terrain.append({"roomId": s, "kind": "solid", "poly": poly(s, pts), "src": f"files: {g['name'][:40]} collider"})
        for c in g["col"]:
            if "SurfaceWaterRegion" in g["comps"] and ("pts" in c):
                terrain.append({"roomId": s, "kind": "water", "poly": poly(s, c["pts"]), "src": "files: SurfaceWaterRegion"})
        dh = g["mono"].get("DamageHero")
        if dh and g["col"]:
            anc = g["path"].split("/")
            enemy_part = any("HealthManager" in q["mono"] for q in dd["gos"] if q["path"] in ["/".join(anc[:i]) for i in range(1, len(anc) + 1)])
            ht = dh.get("hazardType", 1)
            trap = re.search(r"Spike|Trap|Stalactite|Boulder|Lava|spikes|Squasher", g["path"])
            grp = re.match(r"^(.*?(Bone_Boulder[^/]*|Pilgrim Trap Spike[^/]*|Lava Box[^/]*|Spike Collider[^/]*|Bone Spikes[^/]*))", g["path"])
            key = (s, grp.group(1) if grp else g["path"])
            if not enemy_part and "Boss Scene" not in g["path"] and key not in seen_h and (ht >= 2 or (trap and g["layer"] == 17)):
                seen_h.add(key)
                c = g["col"][0]; pts = c.get("pts") or (c.get("paths") or [[]])[0]
                if c["t"] == "CircleCollider2D":
                    r = c["r"]; cx, cy = c["c"]; pts = [(cx - r, cy - r), (cx + r, cy - r), (cx + r, cy + r), (cx - r, cy + r)]
                if len(pts) >= 3:
                    terrain.append({"roomId": s, "kind": "hazard", "poly": poly(s, pts), "src": f"files: DamageHero hazardType {ht} ({g['path'][:50]})", "damage": dh.get("damageDealt")})

# ---------- secret regions: sprites under Unmasker/Remasker objects ----------
secrets = {s: [] for s in ids}
for s in ids:
    for g, dd in objs(s):
        if not active(g, dd) or "sr" not in g: continue
        anc = g["path"].split("/")
        masked = [q for q in dd["gos"] if ("Unmasker" in q["comps"] or "Remasker" in q["comps"] or "MaskerBase" in q["comps"]) and g["path"].startswith(q["path"])]
        if not masked: continue
        sz = sprite_size(dd["externals"], g["sr"]["sprite"])
        if not sz: continue
        w, h = sz[0] * abs(g["sx"]), sz[1] * abs(g["sy"])
        if w * h < 4: continue
        cx = g["pos"][0] + (0.5 - sz[2]) * sz[0] * g["sx"]; cy = g["pos"][1] + (0.5 - sz[3]) * sz[1] * g["sy"]
        secrets[s].append({"rect": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], "by": masked[0]["path"][:60]})
def in_secret(s, x, y):
    for r in secrets[s]:
        a = r["rect"]
        if a[0] <= x <= a[2] and a[1] <= y <= a[3]: return r
    return None

json.dump({"rooms": rooms, "pos": pos, "secrets": secrets, "left": left, "top": top}, open(os.path.join(os.path.dirname(OUT) or ".", "layout.json"), "w"))
json.dump({"terrain": terrain}, open(OUT + ".terrain.json", "w"))
print("terrain", len(terrain), {k: sum(1 for t in terrain if t["kind"] == k) for k in set(t["kind"] for t in terrain)})
print("secret regions", sum(len(v) for v in secrets.values()))

# ---------- things ----------
def resolve_name(ext, pptr):
    fid, pid = pptr
    b = cabidx.get(ext[fid - 1].split("/")[-1]) if fid else None
    if not b: return None
    if b not in bcache: bcache[b] = {o.path_id: o for o in UnityPy.load(os.path.join(AA, b)).objects}
    o = bcache[b].get(pid)
    try: return o.read_typetree().get("m_Name") if o else None
    except Exception: return None
MINOR_ITEMS = re.compile(r"^(Rosary|Tool Metal|Shell Shard)")
things = []; tid = 0
def add(s, kind, x, y, value, src, g=None):
    global tid
    for t in things:  # one thing per place
        if t["roomId"] == s and t["kind"] == kind and t.get("value") == value and abs(t["_u"][0] - x) < 2.5 and abs(t["_u"][1] - y) < 2.5: return
    tid += 1
    t = {"id": f"{s}:{kind}:{tid}", "roomId": s, "kind": kind, "at": P(s, x, y), "value": value, "src": src, "_u": [x, y]}
    sec = in_secret(s, x, y)
    if sec and kind not in ("save", "npc", "shop", "landmark", "boss", "arena"): t["hidden"] = {"how": f"behind a mask that lifts when entered ({sec['by'].split('/')[0]})"}
    things.append(t)
for s in ids:
    for g, dd in objs(s):
        m = g["mono"]; x, y = g["pos"][:2]; nm = g["name"]; pth = g["path"]
        if g.get("_from") == "Bonetown_boss": continue
        if not active(g, dd): continue
        if "CollectableItemPickup" in m:
            it = resolve_name(dd["externals"], m["CollectableItemPickup"]["item"]["pptr"]) if (m["CollectableItemPickup"] or {}).get("item") else None
            if it: add(s, "pickup-minor" if MINOR_ITEMS.match(it) else "pickup-major", x, y, it, "files: CollectableItemPickup.item")
        if "PersistentEnemyItemDrop" in m:
            add(s, "pickup-minor", x, y, "Rock Rollers (carried by the Rock Roller)", "files: PersistentEnemyItemDrop")
        if nm == "Silk Spool" and "PersistentBoolItem" in m: add(s, "pickup-major", x, y, "Spool Fragment (silk spool piece)", "files: 'Silk Spool' object")
        if nm == "Shrine Weaver Ability": add(s, "pickup-major", x, y, "Silk Spear (first silk skill; FSM state 'Set Silkspear' sets hasNeedleThrow)", "files: Ability Scene FSM")
        if nm.startswith("Bone Chest") and "PersistentBoolItem" in m: add(s, "pickup-minor", x, y, "bone chest (rosaries)", "files: Chest Control FSM")
        if nm == "Flea Rescue Branches": add(s, "pickup-major", x, y, "lost flea (rescue)", "files: Flea Rescue Branches")
        for k in ("RosaryCacheString", "RosaryCacheHanging", "RosaryCacheShrine", "RosaryCache"):
            if k in m and not nm.startswith("rosary_string_empty"): add(s, "pickup-minor", x, y, "rosary " + ("string" if "String" in k else "shrine" if "Shrine" in k else "cache"), f"files: {k}")
        if "GeoRock" in m: add(s, "pickup-minor", x, y, "rosary rock", "files: GeoRock")
        if nm.startswith("Shell Shard Fossil") and g["path"].count("/") <= 1: add(s, "pickup-minor", x, y, "shell shard fossil", "files: Shell Shard Fossil object")
        if ("RestBench" in m or "BellBench" in m) and not any(t["roomId"] == s and t["kind"] == "save" and abs(t["_u"][0] - x) < 10 for t in things): add(s, "save", x, y, "bench" + (" (bell bench)" if "bell" in pth.lower() else ""), "files: RestBench")
        if "ShopOwner" in m: add(s, "shop", x, y, {"Mapper NPC": "Shakra (maps)", "Bonechurch_Shop": "Pebb (shop)"}.get(nm, nm), "files: ShopOwner")
        if ("PlayMakerNPC" in m or "BasicNPC" in m) and "ShopOwner" not in m and nm not in ("Shrine Weaver Ability",):
            if "Inspect Region" in nm: add(s, "lore", x, y, "lore plaque / inspect" , "files: BasicNPC inspect region")
            elif not re.search(r"Prompt|Travel|toll|Dummy|Corpse", nm):
                base = re.sub(r" NPC.*| \(\d+\)| (Basement|Intro Scene|Bench Repair|Bone Gate|Bell Beast)$", "", nm)
                base = "Caravan troupe" if base.startswith("Caravan Troup") else base
                if not any(t["roomId"] == s and t["kind"] == "npc" and t["value"] == base for t in things): add(s, "npc", x, y, base, "files: PlayMakerNPC")
        if "Lever" in m or "Lever_tk2d" in m: add(s, "lever", x, y, nm, "files: Lever")
        if "BattleScene" in m and "Boss" not in nm and "Black Thread" not in pth: add(s, "arena", *cen(g), "battle (gates close, waves)", "files: BattleScene")
        if nm == "Death Respawn Marker Init": add(s, "landmark", x, y, "START (new-game respawn marker)", "files: RespawnMarker + PlayerData.respawnScene")
        if nm == "Silk Heart Memory Return": add(s, "landmark", x, y, "Bellway station (opens after the Bell Beast)", "files")
        if "Breakable" in m and m["Breakable"] and (m["Breakable"].get("megaFlingGeo") or 0) and "Bone_house" in nm: pass
# bosses (placed at their fight)
BOSS = {"Mossbone Mother": ("Moss Mother", "first boss: the chapel under Bone Bottom"), "Bone Beast": ("Bell Beast", "first major boss; opens the Bellway (fast travel)"), "Skull King": ("Skull Tyrant", "optional boss")}

# ---------- enemies ----------
TABLE = {  # kind: (name in play [estimate], behaviour, difficulty, why)
    "MossBone Crawler": ("Mossgrub", "crawls along floors and walls, turns at edges", 1, "2 needle hits, slow, harmless if watched"),
    "MossBone Crawler Summon": ("Mossgrub (summoned)", "spawned by the Moss Mother", 1, "2 hits"),
    "MossBone Fly": ("Mossmir", "hovers, drifts towards Hornet once it sees her", 1, "3 hits, slow drift"),
    "Bone Thumper": ("Skull Brute-like thumper (Moss Grotto side cave)", "ground bruiser, slams", 3, "45 hp = 9 hits, hits for 2 masks"),
    "Bone Goomba": ("Skull Scuttler", "walks, charges when it sees Hornet", 2, "3 hits, charges"),
    "Bone Goomba Large": ("Skull Brute", "heavy walker, charges, 2 masks", 3, "6 hits, hits for 2 masks"),
    "Bone Circler": ("Skull circler (flying)", "circles a point in the air, dives", 2, "3 hits, hard to pin in the air"),
    "Bone Flyer": ("Bone flyer", "flies, swoops at Hornet when in sight", 2, "3 hits, swoops"),
    "Bone Flyer Return": ("Bone flyer", "flies, swoops, returns to its perch", 2, "3 hits"),
    "Bone Crawler": ("Bone crawler", "crawls walls and ceilings", 2, "4 hits, comes from odd angles"),
    "Aspid Collector": ("Aspid (berry collector)", "flies, keeps distance, spits", 2, "3 hits, ranged"),
    "Pilgrim 01": ("Pilgrim", "walks a beat, attacks when it sees Hornet", 2, "4 hits, telegraphed swing"),
    "Pilgrim 03": ("Pilgrim (spear)", "walks a beat, lunges", 2, "4 hits, lunge reach"),
    "Pilgrim 04": ("Pilgrim (variant)", "walker", 2, "4 hits"),
    "Pilgrim 05": ("Pilgrim (heavy)", "walker, heavier attack", 3, "6 hits"),
    "Pilgrim Moss Spitter": ("Moss spitter pilgrim", "stands, spits moss", 2, "4 hits, ranged"),
    "Pilgrim Fly": ("Flying pilgrim", "flies, dives", 2, "4 hits"),
    "Bone Roller": ("Bone roller", "curls and rolls along the floor", 2, "3 hits, fast roll"),
    "Rock Roller": ("Rock roller", "a shy carrier that rolls away; drops its 'Rock Rollers' load when killed", 1, "no contact damage in data; 95 hp but runs"),
    "Dock Worker": ("Dock worker", "walker with a hammer (Deep Docks fauna at the Marrow's edge)", 3, "6 hits"),
    "Dock Flyer": ("Dock flyer", "flier", 3, "6 hits"),
    "Mossbone Mother": ("Moss Mother", "boss: flies, dives, summons Mossgrubs", 3, "120 hp = 24 hits, 1 mask hits, summons"),
    "Bone Beast": ("Bell Beast", "boss: burrows and charges through the arena", 4, "150 hp in data (phases/armour may scale it), 2-mask hits"),
    "Skull King": ("Skull Tyrant", "optional boss: charges, slams, boulders fall", 5, "450 hp = 90 hits, 2-mask hits"),
}
enemies = []
for s in ids:
    for g, dd in objs(s):
        hm = g["mono"].get("HealthManager")
        if not hm or not active(g, dd) or hm.get("hp", 0) >= 9999 or g.get("_from") == "Bonetown_boss": continue
        anc = g["path"].split("/")
        hpaths = {q["path"] for q in dd["gos"] if "HealthManager" in q["mono"]}
        if any("/".join(anc[:i]) in hpaths for i in range(1, len(anc))): continue
        kind = g["name"].split(" (")[0]
        if kind == "MossBone Cocoon": continue
        dmg = [q["mono"]["DamageHero"].get("damageDealt") or 0 for q in dd["gos"] if "DamageHero" in q["mono"] and (q is g or q["path"].startswith(g["path"] + "/"))]
        x, y = g["pos"][:2]
        if kind == "Bone Beast": y = 5.0  # it waits under the arena floor
        name, beh, dif, why = TABLE.get(kind, (kind, "?", 2, "estimate"))
        e = {"id": f"{s}:{kind}:{len(enemies)}", "roomId": s, "kind": kind, "name": name, "at": P(s, x, y), "hp": hm["hp"],
             "hits": math.ceil(hm["hp"] / 5), "contactDamage": max(dmg) if dmg else 0, "behaviour": beh, "difficulty": dif,
             "difficultyWhy": why, "shellShards": hm.get("shellShardDrops"), "src": "files: HealthManager.hp, DamageHero.damageDealt; name/behaviour/difficulty: estimate"}
        if "Wave" in g["path"] or "Battle Scene" in g["path"] or "Boss Scene" in g["path"]: e["arena"] = True
        sec = in_secret(s, x, y)
        if sec: e["inSecret"] = True
        enemies.append(e)
        if kind in BOSS: add(s, "boss", x, y, BOSS[kind][0] + ": " + BOSS[kind][1], "files: HealthManager")

# ---------- rooms + exits ----------
SIDE = lambda n: "left" if n.startswith("left") else "right" if n.startswith("right") else "top" if n.startswith("top") else "bottom" if n.startswith("bot") else "door"
GATES = {
    ("Tut_01", "top1"): "shortcut (Tutorial Blocker + Fixer bridge: dropped later from Bone Bottom)",
    ("Tut_01", "left3"): "breakable (moss vine cluster: cut it)", ("Tut_01", "left1"): "breakable (moss vine cluster: cut it)",
    ("Tut_01b", "right1"): "ability: Needolin (song gate to Weavenest Atla)",
    ("Tut_03", "door2"): "story (sanctum door, later act)",
    ("Bonetown", "left2"): "flag (bone gate: bonegraveOpen)",
    ("Bone_01", "right1"): "breakable (secret wall)", ("Bone_01", "right2"): "arena (Great Bone Gate: a battle, then it opens)",
    ("Bone_01", "top2"): "lever (chain platform, from above)", ("Bone_01b", "left1"): "breakable (secret wall)",
    ("Bone_03", "left1"): "lever (Bellshrine gate, opened from the shrine side)", ("Bellshrine", "right1"): "lever (shrine lever opens the gate)",
    ("Bone_04", "top1"): "lever (bone gate + bone lever)", ("Bone_04", "left2"): "flag (trapdoor the Rock Roller opens)",
    ("Bone_06", "left1"): "breakable (shortcut wall, from the Mosstown_03 side)", ("Bone_10", "door2"): "story (caravan, later)",
    ("Mosstown_02", "left1"): "breakable (secret wall)", ("Mosstown_02", "bot1"): "breakable/lever (wall + lever)",
    ("Mosstown_01", "bot1"): "lever (pulley gate)", ("Bonegrave", "left1"): "story (inactive gate)",
}
room_list = []
CRIT = ["Tut_01", "Tut_02", "Tut_03", "Bonetown", "Bone_01", "Bone_01c", "Bone_02", "Bone_03", "Bone_04", "Bone_05"]
for s in ids:
    r = rooms[s]; b = r["box"]
    a = P(s, b[0], b[3]); c = P(s, b[2], b[1])
    w, h = c[0] - a[0], c[1] - a[1]
    exits = []
    for g in r["gates"]:
        if not g["active"] and (s, g["name"]) not in GATES: continue
        if not g["to"]: continue
        e = {"to": g["to"], "side": SIDE(g["name"]), "at": P(s, *g["c"]), "gate_name": g["full"]}
        if (s, g["name"]) in GATES: e["gate"] = GATES[(s, g["name"])]
        if g["door"]: e["door"] = True
        exits.append(e)
    ar = w * h / (1920 * 1080)
    shape = "hub" if len(exits) >= 5 else "shaft" if h > 1.6 * w else "hall" if w > 2.2 * h and ar > 2 else "corridor" if ar < 1.6 else "pocket" if len(exits) <= 1 else "hall"
    if s in ("Tut_03", "Bone_05", "Bone_15"): shape = "setpiece"
    if s == "Bonetown": shape = "hub"
    room_list.append({"id": s, "name": f"{s} ({AREA[s]})", "rect": [a[0], a[1], w, h], "screens": round(ar, 2), "shape": shape,
                      "onCriticalPath": s in CRIT, "exits": exits, "native": {"tilemap": [r["W"], r["H"]], "box": b, "origin": [round(pos[s][0], 2), round(pos[s][1], 2)]},
                      "zone": AREA[s]})
for t in things: t.pop("_u", None)
area = {
    "game": "Hollow Knight: Silksong",
    "area": "Moss Grotto, Bone Bottom, the Marrow and Mosshome (start to the Bell Beast and Silk Spear; Moss Mother first)",
    "sources": [
        "files: the installed Mac build (Unity 6000.0.50f1, Addressables scene bundles scenes_scenes_scenes/*.bundle), read with UnityPy 1.25 (typetrees are in the bundles); script names from the monoscripts bundle; enums (MapZone, HazardType) from Managed/Assembly-CSharp.dll metadata",
        "files: tk2dTileMap tile ids (solid tiles), 2D colliders on the Terrain layer, TransitionPoint gates, HealthManager / DamageHero, CollectableItemPickup items (resolved across bundles), benches, shops, NPCs, levers, secret masks (Unmasker/Remasker sprites)",
        "files: camera (tk2dCamera FOV 24 at z -38.1; CameraController limits), HeroController constants, hero BoxCollider2D, Physics2D gravity, fixed timestep",
        "estimate: enemy common names, behaviour lines and difficulty, gate descriptions read from nearby objects, critical-path order inside Moss Grotto, play minutes",
    ],
    "units": {"native": "unity units", "pxPerUnit": K, "viewNative": [28.79, 16.2],
              "how": "tk2dCamera is perspective, FOV 24 deg (vertical) at z -38.1 to the gameplay plane: view height 2*38.1*tan(12 deg) = 16.197 u, width at 16:9 = 28.79 u (CameraController's default limits, sceneWidth - xLimit = 14.45, agree within 0.4%). Our view is 1920 px wide, so 1 Silksong unit = 1920/28.79 = 66.68 of our px, the same camera as Hollow Knight's."},
    "hero": {
        "box": [round(0.5 * K), round(2.079 * K)], "boxSrc": "files: Hero_Hornet BoxCollider2D 0.5 x 2.079 u",
        "run": round(8.25 * K), "runSrc": "files: HeroController.RUN_SPEED 8.25 u/s",
        "jump": round(5.86 * K), "jumpSrc": "derived from files: JUMP_SPEED 18.6 u/s held JUMP_STEPS 8 x 0.02 s (2.98 u), then gravity 60 u/s^2 (18.6^2/120 = 2.88 u)",
        "startAbilities": ["needle (5 damage: wiki; slash side/up, a diagonal down-strike that bounces off enemies and spikes)",
                           "bind (heal 3 masks for a full silk spool of 9; silk from needle hits)", "5 masks (wiki)",
                           "run 548 px/s, jump ~389 px, ledge clamber (mantle); no dash, no wall jump, no double jump, no glide"],
        "abilityOrder": [
            {"ability": "Silk Spear (first silk skill)", "where": "Mosshome, the weaver shrine in Mosstown_02 (off the path to the Bell Beast)", "roomId": "Mosstown_02", "minuteGuess": 40, "src": "files (place), estimate (minute)"},
            {"ability": "Bellway (fast travel) after the Bell Beast", "where": "Bone_05", "roomId": "Bone_05", "minuteGuess": 45, "src": "files (place), estimate (minute)"},
            {"ability": "Swift Step (dash) - next, outside this area", "where": "Deep Docks (through Bone_09)", "minuteGuess": 75, "src": "estimate"},
        ],
    },
    "firstPlayMinutes": {"criticalPath": 45, "full100": 120, "src": "estimate"},
    "rooms": room_list, "terrain": terrain, "things": things, "enemies": enemies, "criticalPath": CRIT,
    "notes": ["Room rect = the bounding box of the room's air tiles plus one tile of wall (Silksong tilemaps carry solid filler: Tut_01's map is 120 x 120 u but its air spans ~92 u); 'native.tilemap' keeps the full size.",
              "Rooms are placed by aligning each pair of linked gates (least squares over all 'left/right/top/bot' links; mean misfit 4 u, max 15 u). Door-only rooms sit under the door that leads in.",
              "State = a fresh game in Act 1: 'Normal World' children of Black Thread switches count, 'Black Thread World' (Act 3) does not, objects hidden by DeactivateIfPlayerdataFalse do not, battle waves do.",
              "Enemies: one per HealthManager root; hits = hp / 5 (base needle damage, wiki). MossBone Cocoons (hp 1, no damage) are left out.",
              "Bonetown_boss (the Skull Tyrant's raid on Bone Bottom) is a later event and left out."],
}
def write(area, path):
    """readable top, one terrain / thing / enemy per line"""
    lines = ["{"]
    keys = list(area)
    for i, k in enumerate(keys):
        v = area[k]; end = "," if i < len(keys) - 1 else ""
        if k in ("terrain", "things", "enemies", "rooms"):
            lines.append(f' "{k}": [')
            lines += ["  " + json.dumps(x, separators=(",", ":")) + ("," if j < len(v) - 1 else "") for j, x in enumerate(v)]
            lines.append(" ]" + end)
        else:
            lines.append(f' "{k}": ' + json.dumps(v, indent=1).replace("\n", "\n ") + end)
    lines.append("}")
    open(path, "w").write("\n".join(lines) + "\n")
write(area, OUT)
print("rooms", len(room_list), "things", len(things), "enemies", len(enemies), "hidden", sum(1 for t in things if t.get("hidden")))
import collections
print(collections.Counter(t["kind"] for t in things))
'''

# ---- measure: print the README measurements: measure <area.json> <layout.json written by build>
MEASURE = r'''import json, sys, statistics as st, collections, math
a = json.load(open(sys.argv[1])); L = json.load(open(sys.argv[2]))
SC = 1920 * 1080
rooms = {r["id"]: r for r in a["rooms"]}
air = {s: L["rooms"][s]["air"] * 66.68**2 / SC for s in rooms}
print("rooms", len(rooms), "box screens", round(sum(r["screens"] for r in a["rooms"]), 1), "air screens", round(sum(air.values()), 1))
for r in sorted(a["rooms"], key=lambda r: -r["screens"]):
    en = [e for e in a["enemies"] if e["roomId"] == r["id"]]
    th = [t for t in a["things"] if t["roomId"] == r["id"]]
    hz = [t for t in a["terrain"] if t["roomId"] == r["id"] and t["kind"] == "hazard"]
    print(f'{r["id"]:12s} box {r["screens"]:5.1f} air {air[r["id"]]:5.1f} {r["rect"][2]}x{r["rect"][3]} {r["shape"]:8s} crit {int(r["onCriticalPath"])} exits {len(r["exits"])} en {len(en):2d} ({round(len(en)/max(air[r["id"]],.1),2)}/air-screen) things {len(th)} hidden {sum(1 for t in th if t.get("hidden"))} hazards {len(hz)}  {[t["value"][:25] for t in th if t["kind"] in ("pickup-major","save","boss","shop")]}')
sz = [r["screens"] for r in a["rooms"]]; az = list(air.values())
print("box screens min/med/max", min(sz), st.median(sz), max(sz), " air min/med/max", round(min(az),2), round(st.median(az),2), round(max(az),2))
print("shapes", collections.Counter(r["shape"] for r in a["rooms"]))
ex = [len([e for e in r["exits"] if e["to"]]) for r in a["rooms"]]; print("exits mean", round(st.mean(ex),2), collections.Counter(ex))
crit = set(a["criticalPath"]); ce = [e for e in a["enemies"] if e["roomId"] in crit]
print("enemies", len(a["enemies"]), "per air screen", round(len(a["enemies"]) / sum(air.values()), 2), "crit", len(ce), "per crit air screen", round(len(ce) / sum(air[s] for s in crit), 2))
print("no-enemy rooms", sum(1 for r in rooms if not any(e["roomId"] == r for e in a["enemies"])))
k = collections.Counter(e["kind"] for e in a["enemies"]); print("kinds", k.most_common())
print("hp", collections.Counter(e["hp"] for e in a["enemies"]), "dmg", collections.Counter(e["contactDamage"] for e in a["enemies"]))
print("diff", collections.Counter(e["difficulty"] for e in a["enemies"]))
print("things", collections.Counter(t["kind"] for t in a["things"]))
print("hidden", [(t["roomId"], t["value"][:30]) for t in a["things"] if t.get("hidden")])
print("hazards by src", collections.Counter(t["src"].split("(")[0] for t in a["terrain"] if t["kind"] == "hazard"))
print("breakable/secret/door terrain", [(t["roomId"], t["kind"], t["src"][:40]) for t in a["terrain"] if t["kind"] in ("breakable","secretWall","door")])
print("gated exits", [(r["id"], e["to"], e["gate"]) for r in a["rooms"] for e in r["exits"] if e.get("gate")])
# critical path length via exits
cp = a["criticalPath"]; tot = 0; vert = horiz = 0
def cen(r): x, y, w, h = r["rect"]; return (x + w / 2, y + h / 2)
for p, q in zip(cp, cp[1:]):
    (x1, y1), (x2, y2) = cen(rooms[p]), cen(rooms[q]); horiz += abs(x2 - x1); vert += abs(y2 - y1)
print("crit centre path horiz", round(horiz), "vert", round(vert), "ratio", round(vert / horiz, 2))
saves = [t for t in a["things"] if t["kind"] == "save"]
print("saves", [(t["roomId"], t["at"]) for t in saves])
for t in saves:
    d = min((math.dist(t["at"], u["at"]) for u in saves if u is not t), default=0); print("  nearest bench from", t["roomId"], round(d / 1920, 1), "view widths")
# dead ends
for r in a["rooms"]:
    if len(r["exits"]) == 1: print("dead end", r["id"], [t["value"][:30] for t in a["things"] if t["roomId"] == r["id"]])
st_ = [t for t in a["things"] if t["kind"] == "landmark" and "START" in t["value"]][0]
print("start", st_["at"])
'''

# ---- render: assemble a room from its SpriteRenderers: render <aa dir> <cabindex.json> <Scene> <px/unit> <out.png> [x0 y0 x1 y1]; SPRITES=n SPRDIR=dir also saves the n most-used sprites
RENDER = r'''"""Assemble a room from its SpriteRenderers (orthographic, sorted by sorting layer, order, then z far-to-near).
usage: render.py <aa dir> <cabindex.json> <scene> <px per unit> <out.png> [x0 y0 x1 y1 in units]"""
import sys, os, json, math, warnings, re
import numpy as np, UnityPy
from PIL import Image
warnings.filterwarnings("ignore"); UnityPy.config.FALLBACK_UNITY_VERSION = "6000.0.50f1"
AA, CABS, SC, PPU, OUT = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), sys.argv[5]
crop = list(map(float, sys.argv[6:10])) if len(sys.argv) > 9 else None
cab = json.load(open(CABS))
LAYERS = [0, 3315419377, 1459018367, 4015848369, 2917268371, 1270309357, 3557629463, 3868594333, 3784110789, 31172181, 1017658613, 2577183099, 1038907033, 3945752401, 629535577, 59515797]
env = UnityPy.load(os.path.join(AA, "scenes_scenes_scenes", SC.lower() + ".bundle"))
main = max({id(o.assets_file): o.assets_file for o in env.objects}.values(), key=lambda f: len(f.objects))
objs = {o.path_id: o for o in env.objects}
tr = {pid: o.read_typetree() for pid, o in objs.items() if o.type.name == "Transform"}
gos = {pid: o.read_typetree() for pid, o in objs.items() if o.type.name == "GameObject"}
def qm(q):
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
mat = {}
def world(pid):
    if pid in mat: return mat[pid]
    d = tr[pid]; p, s = d["m_LocalPosition"], d["m_LocalScale"]
    M = np.eye(4); M[:3, :3] = qm(d["m_LocalRotation"]) @ np.diag([s["x"], s["y"], s["z"]]); M[:3, 3] = [p["x"], p["y"], p["z"]]
    f = d["m_Father"]["m_PathID"]
    if f in tr: M = world(f) @ M
    mat[pid] = M; return M
go_tr = {d["m_GameObject"]["m_PathID"]: pid for pid, d in tr.items()}
parent = {d["m_GameObject"]["m_PathID"]: tr[d["m_Father"]["m_PathID"]]["m_GameObject"]["m_PathID"] for d in tr.values() if d["m_Father"]["m_PathID"] in tr}
def active(gid):
    while gid:
        g = gos.get(gid)
        if g is None: return True
        if g["m_Name"] == "Black Thread World": return False
        if not g["m_IsActive"] and g["m_Name"] != "Normal World": return False
        gid = parent.get(gid)
    return True
bundles = {}; spr_cache = {}; mat_cache = {}
def load_ext(fid, pid):
    if fid == 0: return objs.get(pid)
    b = cab.get(main.externals[fid - 1].path.split("/")[-1])
    if b and b not in bundles: bundles[b] = {o.path_id: o for o in UnityPy.load(os.path.join(AA, b)).objects}
    return bundles[b].get(pid) if b else None
def mat_name(m):
    k = (m["m_FileID"], m["m_PathID"])
    if k not in mat_cache:
        try:
            o = load_ext(*k); t = o.read_typetree() if o else {}
            sh = t.get("m_Shader", {})
            so = load_ext(sh.get("m_FileID", 0), sh.get("m_PathID", 0)) if sh.get("m_PathID") else None
            shn = ""
            if so is not None:
                try: shn = so.read_typetree().get("m_ParsedForm", {}).get("m_Name", "")
                except Exception: shn = ""
            mat_cache[k] = (t.get("m_Name", "") + " | " + shn)
        except Exception: mat_cache[k] = ""
    return mat_cache[k]
def masked(gid):
    while gid:
        g = gos.get(gid)
        if g is None: return False
        n = g["m_Name"]
        if n.startswith(("msk", "Mask", "Secret Mask", "black_solid", "Masks", "Scene Border", "Vignette")): return True
        gid = parent.get(gid)
    return False
def sprite(fid, pid):
    key = (fid, pid)
    if key in spr_cache: return spr_cache[key]
    res = None
    try:
        if fid == 0: o = objs.get(pid)
        else:
            b = cab.get(main.externals[fid - 1].path.split("/")[-1])
            if b and b not in bundles: bundles[b] = {o.path_id: o for o in UnityPy.load(os.path.join(AA, b)).objects}
            o = bundles[b].get(pid) if b else None
        if o is not None and o.type.name == "Sprite":
            sp = o.read(); im = sp.image; im.info["sname"] = t0 = o.read_typetree()["m_Name"]
            t = o.read_typetree(); ppu = t["m_PixelsToUnits"]
            res = (im, ppu, t["m_Pivot"]["x"], t["m_Pivot"]["y"], t["m_Rect"]["width"], t["m_Rect"]["height"])
    except Exception as e:
        res = None
    spr_cache[key] = res; return res
def li_skip(d):
    return d["m_SortingLayerID"] % (1 << 32) in (1017658613, 1038907033, 3945752401, 629535577, 59515797)
items = []
for pid, o in objs.items():
    if o.type.name != "SpriteRenderer": continue
    d = o.read_typetree()
    if not d["m_Enabled"]: continue
    gid = d["m_GameObject"]["m_PathID"]
    if not active(gid) or gid not in go_tr or masked(gid): continue
    if li_skip(d): continue
    M = world(go_tr[gid])
    try: li = LAYERS.index(d["m_SortingLayerID"] % (1 << 32))
    except ValueError: li = 0
    items.append((li, d["m_SortingOrder"], -M[2, 3], M, d))
items.sort(key=lambda t: (t[0], t[1], t[2]))
if crop: x0, y0, x1, y1 = crop
else:
    tm = [o.read_typetree() for o in objs.values() if o.type.name == "MonoBehaviour"]
    tm = [t for t in tm if "partitionSizeX" in t]
    x0, y0, x1, y1 = 0, 0, tm[0]["width"], tm[0]["height"]
W, H = int((x1 - x0) * PPU), int((y1 - y0) * PPU)
canvas = Image.new("RGBA", (W, H), (12, 14, 18, 255))
n = 0; usage = {}
for li, order, nz, M, d in items:
    s = sprite(d["m_Sprite"]["m_FileID"], d["m_Sprite"]["m_PathID"])
    if not s: continue
    im, ppu, px, py, rw, rh = s
    if abs(M[2, 3]) > 40: continue
    # local quad corners (units) with pivot, flips
    w, h = rw / ppu, rh / ppu
    fx = -1 if d.get("m_FlipX") else 1; fy = -1 if d.get("m_FlipY") else 1
    corners = [(-px * w, -py * h), ((1 - px) * w, -py * h), ((1 - px) * w, (1 - py) * h), (-px * w, (1 - py) * h)]
    pts = [M @ np.array([cx * fx, cy * fy, 0, 1]) for cx, cy in corners]
    xs = [(p[0] - x0) * PPU for p in pts]; ys = [(y1 - p[1]) * PPU for p in pts]
    bx0, by0, bx1, by1 = min(xs), min(ys), max(xs), max(ys)
    if bx1 < 0 or by1 < 0 or bx0 > W or by0 > H or bx1 - bx0 < 1 or by1 - by0 < 1 or (bx1 - bx0) * (by1 - by0) > 4e7: continue
    # affine: map output pixel -> sprite pixel. sprite image pixel (u,v) with v down; corner0 = bottom-left of sprite
    A = np.array([[xs[1] - xs[0], xs[3] - xs[0]], [ys[1] - ys[0], ys[3] - ys[0]]])
    if abs(np.linalg.det(A)) < 1e-6: continue
    Ai = np.linalg.inv(A)  # out offset -> (s,t) in [0,1], s along width, t along height (up)
    iw, ih = im.size
    ox, oy = int(math.floor(bx0)), int(math.floor(by0))
    bw, bh = int(math.ceil(bx1)) - ox, int(math.ceil(by1)) - oy
    # PIL affine: input coords for output (x,y) in the bbox image
    a, b_ = Ai[0]; c_, d_ = Ai[1]
    # s = a*(X - xs0) + b*(Y - ys0); u = s*iw ; t likewise, v = (1 - t)*ih
    X0, Y0 = ox - xs[0], oy - ys[0]
    coeffs = (a * iw, b_ * iw, (a * X0 + b_ * Y0) * iw, -c_ * ih, -d_ * ih, (1 - (c_ * X0 + d_ * Y0)) * ih)
    src = im.convert("RGBA")
    col = d["m_Color"]
    if col["r"] < 0.99 or col["g"] < 0.99 or col["b"] < 0.99 or col["a"] < 0.99:
        arr = np.asarray(src).astype(np.float32) * np.array([col["r"], col["g"], col["b"], col["a"]]); src = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    piece = src.transform((bw, bh), Image.AFFINE, coeffs, resample=Image.BILINEAR)
    mn = mat_name(d["m_Materials"][0]) if d.get("m_Materials") else ""
    if re.search(r"add|light|glow|screen", mn, re.I) and not re.search(r"lit|Sprites-Default|Diffuse", mn):
        X0c, Y0c = max(0, ox), max(0, oy); X1c, Y1c = min(W, ox + bw), min(H, oy + bh)
        if X1c > X0c and Y1c > Y0c:
            p = np.asarray(piece).astype(np.float32)[Y0c - oy:Y1c - oy, X0c - ox:X1c - ox]
            c = np.asarray(canvas.crop((X0c, Y0c, X1c, Y1c))).astype(np.float32)
            c[..., :3] = np.minimum(255, c[..., :3] + p[..., :3] * (p[..., 3:4] / 255) * 0.5)
            canvas.paste(Image.fromarray(c.astype(np.uint8)), (X0c, Y0c))
        n += 1; continue
    canvas.alpha_composite(piece, (max(0, ox), max(0, oy)), (max(0, -ox), max(0, -oy)))
    usage.setdefault(im.info.get("sname", "?"), [0, im])[0] += (bx1 - bx0) * (by1 - by0)
    n += 1
canvas.convert("RGB").save(OUT)
print(SC, "drew", n, "of", len(items), "size", W, H)

NSPR = int(os.environ.get("SPRITES", "0"))
if NSPR:
    os.makedirs(os.environ.get("SPRDIR", "sprites"), exist_ok=True)
    top = sorted(usage.items(), key=lambda kv: -kv[1][0])
    k = 0
    for name, (area, im) in top:
        if im.size[0] * im.size[1] < 128 * 128 or re.search(r"msk|mask|black|blur|fog|glow|light|shadow|particle", name, re.I): continue
        im.save(os.path.join(os.environ.get("SPRDIR", "sprites"), f"{SC}__{name}.png")); k += 1
        if k >= NSPR: break
    print("saved", k, "sprites")
'''

COMMANDS = {"enums": ENUMS, "cabindex": CABINDEX, "dump": DUMP, "build": BUILD, "measure": MEASURE, "render": RENDER}

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__); sys.exit(1)
    mod = types.ModuleType("common"); exec(compile(COMMON, "common", "exec"), mod.__dict__); sys.modules["common"] = mod
    name = sys.argv[1]; sys.argv = [f"extract.py {name}"] + sys.argv[2:]
    g = {"__name__": "__main__", "__file__": __file__}
    exec(compile(COMMANDS[name], name, "exec"), g)

if __name__ == "__main__":
    main()
