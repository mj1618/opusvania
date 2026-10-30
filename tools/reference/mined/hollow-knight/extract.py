"""Dump Hollow Knight scenes (the installed Mac build, Unity 6000.0) to JSON, read-only on the game folder.

usage: python -I extract.py <.../hollow_knight.app/Contents/Resources/Data> <out dir> <scene,scene,...|ALL>
needs: a venv with UnityPy, TypeTreeGeneratorAPI, numpy (MonoBehaviour fields come from type trees generated
from Managed/*.dll; the build ships without type trees).

Per scene it writes <out>/<scene>.json: every GameObject with its path, layer, active flags, world position /
rotation / scale (parents composed), 2D colliders in world space, SpriteRenderers (sprite pptr, sorting layer, order,
colour, flips, world matrix) and the fields of each MonoBehaviour (scalars and short lists; PlayMakerFSMs summarised to
name, states, events and variables). Also <out>/_buildscenes.json.
Run with `-I` and from outside the game folder; it never writes there."""
import json, math, os, sys

import numpy as np
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode

DATA, OUT, WANT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

ggm = UnityPy.load(os.path.join(DATA, "globalgamemanagers"))
ver, scenes = None, []
for o in ggm.objects:
    if o.type.name == "BuildSettings":
        bs = o.read()
        scenes = [s.split("/")[-1].replace(".unity", "") for s in bs.scenes]
        ver = o.assets_file.unity_version
json.dump(scenes, open(os.path.join(OUT, "_buildscenes.json"), "w"))
print("unity", ver, "scenes", len(scenes))
want = scenes if WANT == "ALL" else WANT.split(",")

gen = TypeTreeGenerator(ver)
gen.load_local_dll_folder(os.path.join(DATA, "Managed"))


NODES = {}


def script_nodes(assembly, fullname):
    """The generated type tree for a script, fixed for UnityPy: the generator types a List<string> as `string` with an
    Array child, which UnityPy then reads as one string (PlayMakerFSM's actionNames broke every FSM). Retype those to
    `vector`."""
    key = (assembly, fullname)
    if key not in NODES:
        base = gen.get_nodes(assembly if assembly.endswith(".dll") else assembly + ".dll", fullname)
        out = []
        for i, n in enumerate(base):
            t = n.m_Type
            # string -> Array -> (int size, data): data is `char` for a real string, `string` for List<string>
            if t == "string" and i + 3 < len(base) and base[i + 1].m_Type == "Array" and base[i + 3].m_Level == n.m_Level + 2 \
                    and base[i + 3].m_Type != "char":
                t = "vector"
            out.append(TypeTreeNode(n.m_Level, t, n.m_Name, 0, 0, m_MetaFlag=n.m_MetaFlag))
        NODES[key] = TypeTreeNode.from_list(out) if out else None
    return NODES[key]


def quat_mat(q):
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def scal(v, depth=0, maxlist=40):
    """keep JSON-able scalars, short lists and shallow dicts; pointers become {pptr: [file, path]}"""
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
    if isinstance(v, dict):
        if set(v.keys()) == {"m_FileID", "m_PathID"}:
            return {"pptr": [v["m_FileID"], v["m_PathID"]]} if v["m_PathID"] else None
        if depth > 3:
            return None
        d = {}
        for k, x in v.items():
            s = scal(x, depth + 1, maxlist)
            if s is not None and s != {} and s != []:
                d[k] = s
        return d
    if isinstance(v, list):
        if len(v) > maxlist or depth > 3:
            return {"len": len(v)}
        return [s for s in (scal(x, depth + 1, maxlist) for x in v) if s is not None]
    return None


def fsm_summary(tt):
    f = tt.get("fsm") or {}
    out = {"name": f.get("name"), "fsmName": tt.get("fsmName") or f.get("name")}
    out["states"] = [s.get("name") for s in f.get("states", [])][:80]
    out["events"] = [e.get("name") for e in f.get("events", [])][:80]
    var = f.get("variables") or {}
    vv = {}
    for kind in ("floatVariables", "intVariables", "boolVariables", "stringVariables", "vector2Variables", "vector3Variables",
                 "gameObjectVariables"):
        for x in var.get(kind, []) or []:
            val = x.get("value")
            if isinstance(val, dict):
                if "m_PathID" in val:
                    val = {"pptr": [val["m_FileID"], val["m_PathID"]]} if val["m_PathID"] else None
                else:
                    val = [round(val.get(c, 0), 3) for c in ("x", "y", "z") if c in val]
            elif isinstance(val, float):
                val = round(val, 4)
            vv[x.get("name")] = val
    out["vars"] = vv
    # per state: action type names + literal params (strings, floats, ints, bools) so item ids / PlayerData keys show
    acts = {}
    for s in f.get("states", []):
        ad = s.get("actionData") or {}
        names = [n.split(".")[-1] for n in ad.get("actionNames", [])]
        fl = [round(p.get("value", 0), 3) for p in (ad.get("fsmFloatParams") or []) if not p.get("useVariable")]
        it = [p.get("value") for p in (ad.get("fsmIntParams") or []) if not p.get("useVariable")]
        st = [p.get("value") for p in (ad.get("fsmStringParams") or []) if not p.get("useVariable") and p.get("value")]
        bl = [p.get("value") for p in (ad.get("fsmBoolParams") or []) if not p.get("useVariable")]
        strs = [x for x in (ad.get("stringParams") or []) if x]
        acts[s.get("name")] = {"a": names[:40], "f": fl[:40], "i": it[:20], "s": (st + strs)[:40], "b": bl[:20]}
    out["actions"] = acts
    return out


def PPtrDeref(sf, pp):
    """resolve a {m_FileID, m_PathID} dict from serialized file sf to an ObjectReader"""
    if pp["m_FileID"] == 0:
        return sf.objects[pp["m_PathID"]]
    ext = sf.externals[pp["m_FileID"] - 1].path.rsplit("/")[-1].lower()
    for k, v in sf.environment.files.items():
        if k.rsplit("/")[-1].lower() == ext:
            return v.objects[pp["m_PathID"]]
    raise KeyError(ext)


def load_scene(idx):
    env = UnityPy.load(os.path.join(DATA, f"level{idx}"))
    f = list(env.files.values())[0]
    for e in f.externals:   # the scene's external asset files, so script / sprite pointers resolve
        p = os.path.join(DATA, e.path)
        if os.path.exists(p):
            env.load_file(p, name=e.path)
    env.typetree_generator = gen
    return env, f


def dump_scene(sc, idx):
    env, f = load_scene(idx)
    objs = f.objects
    tr, gos = {}, {}
    for pid, o in objs.items():
        t = o.type.name
        if t in ("Transform", "RectTransform"):
            tr[pid] = o.parse_as_dict()
        elif t == "GameObject":
            gos[pid] = o.parse_as_dict()
    mat = {}

    def world(pid):
        if pid in mat:
            return mat[pid]
        d = tr[pid]
        p, q, s = d["m_LocalPosition"], d["m_LocalRotation"], d["m_LocalScale"]
        M = np.eye(4)
        M[:3, :3] = quat_mat(q) @ np.diag([s["x"], s["y"], s["z"]])
        M[:3, 3] = [p["x"], p["y"], p["z"]]
        fa = d["m_Father"]["m_PathID"]
        if fa and fa in tr:
            M = world(fa) @ M
        mat[pid] = M
        return M

    go_tr, parent_go = {}, {}
    for pid, d in tr.items():
        go_tr[d["m_GameObject"]["m_PathID"]] = pid
    for pid, d in tr.items():
        fa = d["m_Father"]["m_PathID"]
        if fa and fa in tr:
            parent_go[d["m_GameObject"]["m_PathID"]] = tr[fa]["m_GameObject"]["m_PathID"]

    def path(gid):
        n = []
        while gid:
            n.append(gos[gid]["m_Name"] if gid in gos else "?")
            gid = parent_go.get(gid)
        return "/".join(reversed(n))

    def active_h(gid):
        while gid:
            if gid in gos and not gos[gid]["m_IsActive"]:
                return False
            gid = parent_go.get(gid)
        return True

    script_cache = {}
    sprite_cache = {}

    def sprite_info(pp):
        """name and local bounds (units) of a Sprite asset: [name, x0, y0, x1, y1]"""
        key = (pp["m_FileID"], pp["m_PathID"])
        if not key[1]:
            return None
        if key not in sprite_cache:
            try:
                sd = PPtrDeref(f, pp).parse_as_dict()
                ppu = sd["m_PixelsToUnits"]
                w, h = sd["m_Rect"]["width"] / ppu, sd["m_Rect"]["height"] / ppu
                px, py = sd["m_Pivot"]["x"], sd["m_Pivot"]["y"]
                sprite_cache[key] = [sd["m_Name"], round(-px * w, 3), round(-py * h, 3), round((1 - px) * w, 3), round((1 - py) * h, 3), ppu]
            except Exception:
                sprite_cache[key] = None
        return sprite_cache[key]

    def script_of(o):
        h = o.parse_monobehaviour_head()
        key = (h.m_Script.m_FileID, h.m_Script.m_PathID)
        if key not in script_cache:
            try:
                so = h.m_Script.deref().parse_as_object()
                full = f"{so.m_Namespace}.{so.m_ClassName}" if so.m_Namespace else so.m_ClassName
                script_cache[key] = (so.m_ClassName, script_nodes(so.m_AssemblyName, full))
            except Exception:
                script_cache[key] = ("?", None)
        return script_cache[key]

    out = []
    for gid, g in gos.items():
        tp = go_tr.get(gid)
        M = world(tp) if tp else np.eye(4)
        sx = float(np.linalg.norm(M[:3, 0])) * (1 if M[0, 0] >= 0 else -1)
        sy = float(np.linalg.norm(M[:3, 1])) * (1 if M[1, 1] >= 0 else -1)
        rec = {"id": gid, "name": g["m_Name"], "path": path(gid), "layer": g["m_Layer"], "tag": g["m_Tag"],
               "active": bool(g["m_IsActive"]), "activeH": active_h(gid),
               "pos": [round(float(M[0, 3]), 3), round(float(M[1, 3]), 3), round(float(M[2, 3]), 3)],
               "rot": round(math.degrees(math.atan2(M[1, 0], M[0, 0])), 2), "sx": round(sx, 3), "sy": round(sy, 3),
               "comps": [], "col": [], "mono": {}}

        def W(x, y):
            v = M @ np.array([x, y, 0, 1.0])
            return [round(float(v[0]), 3), round(float(v[1]), 3)]

        for c in g["m_Component"]:
            cp = c["component"]
            if cp["m_FileID"] != 0:
                continue
            co = objs.get(cp["m_PathID"])
            if co is None:
                continue
            t = co.type.name
            if t in ("Transform", "RectTransform"):
                continue
            try:
                if t in ("BoxCollider2D", "PolygonCollider2D", "EdgeCollider2D", "CircleCollider2D", "CompositeCollider2D"):
                    d = co.parse_as_dict()
                    cd = {"t": t, "trig": bool(d.get("m_IsTrigger")), "en": bool(d.get("m_Enabled"))}
                    off = d.get("m_Offset", {"x": 0, "y": 0})
                    if t == "BoxCollider2D":
                        hx, hy = d["m_Size"]["x"] / 2, d["m_Size"]["y"] / 2
                        ox, oy = off["x"], off["y"]
                        cd["pts"] = [W(ox - hx, oy - hy), W(ox + hx, oy - hy), W(ox + hx, oy + hy), W(ox - hx, oy + hy)]
                    elif t == "PolygonCollider2D":
                        cd["paths"] = [[W(p["x"] + off["x"], p["y"] + off["y"]) for p in pa] for pa in d["m_Points"]["m_Paths"]]
                    elif t == "EdgeCollider2D":
                        cd["pts"] = [W(p["x"] + off["x"], p["y"] + off["y"]) for p in d["m_Points"]]
                    elif t == "CircleCollider2D":
                        cd["c"] = W(off["x"], off["y"])
                        cd["r"] = round(d["m_Radius"] * abs(sx), 3)
                    else:
                        cd["paths"] = [[W(p["X"] / 1e6, p["Y"] / 1e6) for p in pa] for pa in d.get("m_CompositePaths", {}).get("m_Paths", [])] \
                            if d.get("m_CompositePaths") else []
                    rec["col"].append(cd)
                    rec["comps"].append(t)
                elif t == "MonoBehaviour":
                    name, nodes = script_of(co)
                    rec["comps"].append(name)
                    try:
                        tt = co.parse_as_dict(nodes, check_read=False)
                    except Exception as e:
                        rec["mono"][name] = {"err": str(e)[:80]}
                        continue
                    if name == "PlayMakerFSM":
                        rec["mono"].setdefault("PlayMakerFSM", []).append(fsm_summary(tt))
                    elif name in ("tk2dTileMap",):
                        rec["mono"][name] = {k: tt.get(k) for k in ("width", "height", "partitionSizeX", "partitionSizeY")}
                    else:
                        rec["mono"][name] = scal({k: v for k, v in tt.items() if not k.startswith("m_")})
                elif t == "SpriteRenderer":
                    d = co.parse_as_dict()
                    rec["comps"].append(t)
                    sp = d["m_Sprite"]
                    rec["sr"] = {"en": bool(d["m_Enabled"]), "layer": d["m_SortingLayerID"], "layerV": d["m_SortingLayer"],
                                 "order": d["m_SortingOrder"], "sprite": [sp["m_FileID"], sp["m_PathID"]], "si": sprite_info(sp),
                                 "color": [round(d["m_Color"][k], 3) for k in "rgba"], "flip": [d["m_FlipX"], d["m_FlipY"]],
                                 "M": [round(float(x), 5) for x in M[:3, :].flatten()]}
                elif t == "MeshRenderer":
                    d = co.parse_as_dict()
                    rec["comps"].append(t)
                    rec["mr"] = {"en": bool(d["m_Enabled"]), "layer": d["m_SortingLayerID"], "order": d["m_SortingOrder"],
                                 "mats": [[m["m_FileID"], m["m_PathID"]] for m in d["m_Materials"]],
                                 "M": [round(float(x), 5) for x in M[:3, :].flatten()]}
                elif t == "MeshFilter":
                    d = co.parse_as_dict()
                    rec["comps"].append(t)
                    rec["mesh"] = [d["m_Mesh"]["m_FileID"], d["m_Mesh"]["m_PathID"]]
                else:
                    rec["comps"].append(t)
            except Exception as e:
                rec["comps"].append(f"{t}!err:{str(e)[:80]}")
        out.append(rec)
    return out


for sc in want:
    if sc not in scenes:
        print("no scene", sc)
        continue
    idx = scenes.index(sc)
    out = dump_scene(sc, idx)
    json.dump(out, open(os.path.join(OUT, f"{sc}.json"), "w"))
    print(sc, f"level{idx}", len(out), "objects")
