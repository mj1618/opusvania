"""Dump Hollow Knight scenes to JSON: every GameObject with world transform, layer, components,
2D colliders in world space, and the scalar fields of every MonoBehaviour (typetrees from Managed DLLs).
usage: python -I dump.py <Data dir> <out dir> <scene,scene,...|ALL>
Read-only on the game folder."""
import json, math, os, sys
import numpy as np
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

DATA, OUT, WANT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

ggm = UnityPy.load(os.path.join(DATA, "globalgamemanagers"))
ver = None
scenes = []
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


def quat_mat(q):
    x, y, z, w = q.x, q.y, q.z, q.w
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def scal(v, depth=0):
    """keep JSON-able scalars, small lists, and shallow dicts"""
    if isinstance(v, (int, float, str, bool)) or v is None:
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    if isinstance(v, dict):
        if depth > 2:
            return None
        if set(v.keys()) >= {"m_FileID", "m_PathID"}:
            return {"pptr": v["m_PathID"]} if v["m_PathID"] else None
        d = {}
        for k, x in v.items():
            s = scal(x, depth + 1)
            if s is not None and s != {} and s != []:
                d[k] = s
        return d
    if isinstance(v, list):
        if len(v) > 40 or depth > 2:
            return None
        return [s for s in (scal(x, depth + 1) for x in v) if s is not None]
    return None


def fsm_summary(tt):
    f = tt.get("fsm") or {}
    out = {"name": f.get("name")}
    out["states"] = [s.get("name") for s in f.get("states", [])][:60]
    out["events"] = [e.get("name") for e in f.get("events", [])][:60]
    var = f.get("variables") or {}
    vv = {}
    for kind in ("floatVariables", "intVariables", "boolVariables", "stringVariables", "vector2Variables", "vector3Variables"):
        for x in var.get(kind, []) or []:
            val = x.get("value")
            if isinstance(val, dict):
                val = [round(val.get(c, 0), 3) for c in ("x", "y", "z") if c in val]
            vv[x.get("name")] = val
    out["vars"] = vv
    # action data: keep the float params of each state's actions (speeds, timings) compactly
    acts = {}
    for s in f.get("states", []):
        ad = s.get("actionData") or {}
        names = [n.split(".")[-1] for n in ad.get("actionNames", [])]
        fp = ad.get("fsmFloatParams") or []
        floats = [round(p.get("value", 0), 3) for p in fp if not p.get("useVariable")]
        acts[s.get("name")] = {"a": names[:30], "f": floats[:30]}
    out["actions"] = acts
    return out


for sc in want:
    if sc not in scenes:
        print("no scene", sc)
        continue
    idx = scenes.index(sc)
    env = UnityPy.load(os.path.join(DATA, f"level{idx}"))
    env.typetree_generator = gen
    objs = {}
    for o in env.objects:
        objs[o.path_id] = o
    tr = {}  # transform path_id -> data
    gos = {}
    by_go = {}
    for pid, o in objs.items():
        t = o.type.name
        if t in ("Transform", "RectTransform"):
            d = o.read()
            tr[pid] = d
        elif t == "GameObject":
            gos[pid] = o.read()
    # world matrices
    mat = {}

    def world(pid):
        if pid in mat:
            return mat[pid]
        d = tr[pid]
        p, q, s = d.m_LocalPosition, d.m_LocalRotation, d.m_LocalScale
        M = np.eye(4)
        M[:3, :3] = quat_mat(q) @ np.diag([s.x, s.y, s.z])
        M[:3, 3] = [p.x, p.y, p.z]
        f = d.m_Father.path_id
        if f and f in tr:
            M = world(f) @ M
        mat[pid] = M
        return M

    go_tr = {}
    for pid, d in tr.items():
        go_tr[d.m_GameObject.path_id] = pid
    parent_go = {}
    for pid, d in tr.items():
        f = d.m_Father.path_id
        if f and f in tr:
            parent_go[d.m_GameObject.path_id] = tr[f].m_GameObject.path_id

    def path(gid):
        n = []
        while gid:
            n.append(gos[gid].m_Name if gid in gos else "?")
            gid = parent_go.get(gid)
        return "/".join(reversed(n))

    def active_h(gid):
        while gid:
            if gid in gos and not gos[gid].m_IsActive:
                return False
            gid = parent_go.get(gid)
        return True

    out = []
    script_cache = {}
    for gid, g in gos.items():
        tp = go_tr.get(gid)
        M = world(tp) if tp else np.eye(4)
        rec = {"id": gid, "name": g.m_Name, "path": path(gid), "layer": g.m_Layer, "tag": g.m_Tag,
               "active": bool(g.m_IsActive), "activeH": active_h(gid),
               "pos": [round(float(M[0, 3]), 3), round(float(M[1, 3]), 3), round(float(M[2, 3]), 3)],
               "sx": round(float(np.linalg.norm(M[:3, 0])) * (1 if M[0, 0] >= 0 else -1), 3),
               "comps": [], "col": [], "mono": {}}

        def W(x, y):
            v = M @ np.array([x, y, 0, 1.0])
            return [round(float(v[0]), 3), round(float(v[1]), 3)]

        comps = g.m_Component if hasattr(g, "m_Component") else g.m_Components
        for c in comps:
            cp = c.component if hasattr(c, "component") else c
            co = objs.get(cp.path_id)
            if co is None:
                continue
            t = co.type.name
            if t in ("Transform",):
                continue
            try:
                if t in ("BoxCollider2D", "PolygonCollider2D", "EdgeCollider2D", "CircleCollider2D"):
                    d = co.read()
                    cd = {"t": t, "trig": bool(d.m_IsTrigger), "en": bool(d.m_Enabled)}
                    off = d.m_Offset
                    if t == "BoxCollider2D":
                        sx, sy = d.m_Size.x / 2, d.m_Size.y / 2
                        cd["pts"] = [W(off.x - sx, off.y - sy), W(off.x + sx, off.y - sy), W(off.x + sx, off.y + sy), W(off.x - sx, off.y + sy)]
                    elif t == "PolygonCollider2D":
                        cd["paths"] = [[W(p.x + off.x, p.y + off.y) for p in path_] for path_ in d.m_Points.m_Paths]
                    elif t == "EdgeCollider2D":
                        cd["pts"] = [W(p.x + off.x, p.y + off.y) for p in d.m_Points]
                    else:
                        cd["c"] = W(off.x, off.y)
                        cd["r"] = round(d.m_Radius * abs(rec["sx"]), 3)
                    rec["col"].append(cd)
                    rec["comps"].append(t)
                elif t == "MonoBehaviour":
                    tt = co.read_typetree()
                    sp = tt.get("m_Script", {}).get("m_PathID")
                    name = None
                    try:
                        so = co.read().m_Script.read()
                        name = so.m_ClassName
                    except Exception:
                        name = "?"
                    rec["comps"].append(name)
                    if name == "PlayMakerFSM":
                        rec["mono"].setdefault("PlayMakerFSM", []).append(fsm_summary(tt))
                    else:
                        d = scal({k: v for k, v in tt.items() if not k.startswith("m_")})
                        rec["mono"][name] = d
                else:
                    rec["comps"].append(t)
                    if t == "SpriteRenderer":
                        d = co.read()
                        rec["sr"] = {"en": bool(d.m_Enabled), "order": d.m_SortingOrder}
            except Exception as e:
                rec["comps"].append(f"{t}!err:{str(e)[:80]}")
        out.append(rec)
    json.dump(out, open(os.path.join(OUT, f"{sc}.json"), "w"))
    print(sc, f"level{idx}", len(out), "objects")
