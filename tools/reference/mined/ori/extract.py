"""Ori and the Blind Forest DE: the first area (Sunken Glades + Spirit Caverns) read from the game files.

usage (Python venv with UnityPy TypeTreeGeneratorAPI Pillow numpy scipy shapely opencv-python-headless scikit-image;
run with `python -I` from outside the game folder; DATA = .../steamapps/content/app_387290/depot_387291/oriDE_Data;
WORK = a scratch folder of your own; nothing is ever written to the game folder):
  python -I extract.py dump      DATA WORK/scenes ALL                  # every scene -> JSON (objects, colliders, fields)
  python -I extract.py hero      DATA resources.assets --class SeinJump,SeinRun,SpiritFlame,CameraController,CameraOffsetController WORK/hero.json
  python -I extract.py terrain   WORK/scenes WORK/terrain.json [WORK/terrain.png]
  python -I extract.py exits     WORK/scenes WORK/terrain.json WORK/exits.json
  python -I extract.py build     WORK/scenes WORK/terrain.json WORK/exits.json docs/design/reference-levels/ori/area.json
  python -I extract.py analyse   docs/design/reference-levels/ori/area.json          # the README's numbers
  python -I extract.py textures  DATA 3,9,8,6,33,10,31,5,32,36,35,34,38,37,23,24 WORK/textures.json
  python -I extract.py texexport DATA WORK/textures.json WORK/tex 'sunkenGladesTextures|spiritTree'
  python -I extract.py refs_textures WORK/tex ~/code/opusvania-refs/ori/textures
  [NOFG=1.5] python -I extract.py render DATA out.png CX CY LEVELS [WIDTH]  # a look render of one spot

Method and pitfalls: docs/design/reference-levels/ori/EXTRACTED.md and memory/unity-extraction.md.
"""
import json, math, os, re, struct, sys
import numpy as np
# ---------------------------------------------------------------- shared: the area's scenes and collider geometry
from shapely.geometry import Polygon, LineString, MultiPolygon, box, Point
from shapely.ops import unary_union, linemerge, polygonize
from shapely.validation import make_valid

AREA = ["sunkenGladesRunaway", "sunkenGladesIntroSplitB", "sunkenGladesIntroSplitA", "sunkenGladesEnemyIntroductionC",
        "sunkenGladesOriRoom", "sunkenGladesSpiritCavernSaveRoomB", "sunkenGladesWaterhole", "upperGladesBelowSpiritTree",
        "sunkenGladesObstaclesIntroductionStreamlined", "sunkenGladesSpiritCavernLaser", "sunkenGladesRunning",
        "sunkenGladesSpiritCavernB", "sunkenGladesSpiritCavernWalljumpB", "sunkenGladesSpiritCavernsPushBlockIntroduction",
        "spiritTreeRefined", "westGladesOverworldForestA", "sunkenGladesLaserStomp"]


def mesh_poly(v, tri):
    v = np.array(v)[:, :2]
    tri = np.array(tri)
    a = v[tri[:, 0]]; b = v[tri[:, 1]]; c = v[tri[:, 2]]
    ar = 0.5 * np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1]))
    big = ar > 1e-4
    if big.sum() >= max(1, 0.3 * len(tri)):
        return unary_union([Polygon([a[i], b[i], c[i]]) for i in np.where(big)[0]]).buffer(0)
    # side-wall extrusion: xy edges form closed outlines; fill even-odd
    segs = set()
    for t in tri:
        for i, j in ((0, 1), (1, 2), (2, 0)):
            p, q = tuple(np.round(v[t[i]], 3)), tuple(np.round(v[t[j]], 3))
            if p != q:
                segs.add((min(p, q), max(p, q)))
    faces = list(polygonize([LineString(s) for s in segs]))
    if not faces:
        return Polygon()
    # even-odd: a face is solid if it is inside an odd number of faces' outer rings (itself included)
    rings = [Polygon(f.exterior) for f in faces]
    out = []
    for f in faces:
        pt = f.representative_point()
        n = sum(1 for r in rings if r.contains(pt))
        if n % 2 == 1:
            out.append(f)
    return unary_union(out).buffer(0)


def col_poly(c):
    if c["t"] == "MeshCollider":
        if "v" not in c:
            return None
        return mesh_poly(c["v"], c["tri"])
    if c["t"] == "BoxCollider":
        if "pts8" in c:  # a box turned out of the plane (water volumes): its shadow on the plane
            from shapely.geometry import MultiPoint
            h = MultiPoint(c["pts8"]).convex_hull
            if h.area > 1e-3:
                return h
        return Polygon(c["pts"]).buffer(0)
    if c["t"] == "SphereCollider":
        return Point(c["c"]).buffer(c["r"], 12)
    if c["t"] == "CapsuleCollider":
        r, h = c["r"], c["h"]
        x, y = c["c"]
        if c.get("dir") == 0:
            return LineString([(x - max(0, h / 2 - r), y), (x + max(0, h / 2 - r), y)]).buffer(r, 8)
        return LineString([(x, y - max(0, h / 2 - r)), (x, y + max(0, h / 2 - r))]).buffer(r, 8)
    return None


KIND = {10: "solid", 19: "oneway", 16: "hazard", 17: "hazard", 18: "pushblock", 4: "water"}



# ---------------------------------------------------------------- dump
def cmd_dump(argv):
    """Dump Ori DE scenes to JSON: GameObjects (world transform, layer, active), 3D colliders in world space (mesh
    vertices + triangles, boxes, spheres, capsules), MonoBehaviour fields (typetrees generated from Managed DLLs; cross-file
    references resolved to names), and the SceneRoot's SceneMetaData (scene bounds).
    usage: python -I dump.py <oriDE_Data> <out dir> <idx|name,...|ALL>
    Read-only on the game folder."""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import json, math, os, struct, sys
    import numpy as np
    import UnityPy
    from UnityPy.helpers.MeshHelper import MeshHandler
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

    DATA, OUT, WANT = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(OUT, exist_ok=True)
    ggm = UnityPy.load(os.path.join(DATA, "globalgamemanagers"))
    scenes = []
    for o in ggm.objects:
        if o.type.name == "BuildSettings":
            scenes = [s.split("/")[-1].replace(".unity", "") for s in o.read().scenes]
    json.dump(scenes, open(os.path.join(OUT, "_buildscenes.json"), "w"))
    gen = TypeTreeGenerator("5.3.2f1")
    gen.load_local_dll_folder(os.path.join(DATA, "Managed"))
    want = list(range(len(scenes))) if WANT == "ALL" else [int(w) if w.isdigit() else scenes.index(w) for w in WANT.split(",")]

    # MonoBehaviours with no level-design content (animation, VFX, sound): class name only
    SKIP = {"InteractionRotationModifier", "InteractionPunchModifier", "InteractionLightModifier", "ParticleSuspender",
            "TransparencyAnimator", "DisableGameObjectWhenOutOfFrustrum", "DisableRendererWhenOutOfFrustrum", "SoundSource",
            "TransformAnimator", "RotationAnimator", "ScaleAnimator", "ScaleAxisAnimator", "BaseAnimatorSerializer",
            "ShurikenParticleAnimator", "SpriteAnimator", "UberShaderAnimator", "LegacyTransformAnimator",
            "LegacyRotateAnimator", "LegacyScaleAnimator", "LegacyColorAnimator", "LegacyTranslateAnimator",
            "ParticleEmitterSuspender", "WindMovement", "TransparencyAnimatorGroup"}


    def quat_mat(q):
        x, y, z, w = q.x, q.y, q.z, q.w
        return np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


    def r3(x):
        return round(float(x), 3)


    def dump_scene(idx):
        sc = scenes[idx]
        LV = f"level{idx}"
        lvl = os.path.join(DATA, LV)
        env0 = UnityPy.load(lvl)
        ext = [os.path.basename(e.path) for e in list(env0.objects)[0].assets_file.externals]
        env = UnityPy.load(lvl, *[os.path.join(DATA, f) for f in ext if os.path.exists(os.path.join(DATA, f))])
        env.typetree_generator = gen
        allobj, scripts, afile = {}, {}, {}
        for o in env.objects:
            fn = os.path.basename(o.assets_file.name)
            afile[fn] = o.assets_file
            allobj[(fn, o.path_id)] = o
            if o.type.name == "MonoScript":
                d = o.read_typetree()
                scripts[(fn, o.path_id)] = (d["m_AssemblyName"].replace(".dll", ""), d["m_Namespace"], d["m_ClassName"])
        objs = {pid: o for (fn, pid), o in allobj.items() if fn == LV}

        def deref(fid, pid, frm=LV):
            if fid == 0:
                return allobj.get((frm, pid))
            ex = afile[frm].externals
            if fid - 1 >= len(ex):
                return None
            return allobj.get((os.path.basename(ex[fid - 1].path), pid))

        def mono_class(o):
            # UnityPy's MonoBehaviour head node misreads m_Script for 5.3 files; read the pptr from the raw bytes
            raw = o.get_raw_data()
            fid, pid = struct.unpack_from("<iq", raw, 16)
            fn = os.path.basename(o.assets_file.name)
            if fid != 0:
                ex = o.assets_file.externals
                fn = os.path.basename(ex[fid - 1].path) if fid - 1 < len(ex) else "?"
            return scripts.get((fn, pid))

        def mono_tree(o):
            sc_ = mono_class(o)
            if not sc_:
                return None, None
            nodes = gen.get_nodes_up(sc_[0], (sc_[1] + "." if sc_[1] else "") + sc_[2])
            return sc_[2], o.read_typetree(nodes, check_read=False)

        name_cache = {}

        def pname(fid, pid, frm=LV):
            k = (fid, pid, frm)
            if k in name_cache:
                return name_cache[k]
            o = deref(fid, pid, frm)
            n = None
            if o is not None:
                try:
                    t = o.type.name
                    if t == "GameObject":
                        n = "GO:" + o.read().m_Name
                    elif t == "MonoBehaviour":
                        sc_ = mono_class(o)
                        raw = o.get_raw_data()
                        gf, gp = struct.unpack_from("<iq", raw, 0)
                        g = deref(gf, gp, os.path.basename(o.assets_file.name))
                        n = f"{sc_[2] if sc_ else '?'}@" + (g.read().m_Name if g is not None else "")
                    else:
                        n = f"{t}:" + str(getattr(o.read(), "m_Name", ""))
                except Exception as e:
                    n = f"err:{str(e)[:30]}"
            name_cache[k] = n
            return n

        def scal(v, depth=0):
            if isinstance(v, (int, str, bool)) or v is None:
                return v
            if isinstance(v, float):
                return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
            if isinstance(v, (bytes, bytearray)):
                return None
            if isinstance(v, dict):
                if depth > 5:
                    return None
                if set(v.keys()) >= {"m_FileID", "m_PathID"}:
                    if not v["m_PathID"]:
                        return None
                    if v["m_FileID"] == 0:
                        return {"ref": v["m_PathID"]}
                    return {"ext": pname(v["m_FileID"], v["m_PathID"])}
                d = {}
                for k, x in v.items():
                    s_ = scal(x, depth + 1)
                    if s_ is not None and s_ != {} and s_ != []:
                        d[k] = s_
                return d
            if isinstance(v, list):
                if len(v) > 80:
                    return {"len": len(v)}
                if depth > 5:
                    return None
                return [s_ for s_ in (scal(x, depth + 1) for x in v) if s_ is not None]
            return None

        tr, gos = {}, {}
        for pid, o in objs.items():
            if o.type.name in ("Transform", "RectTransform"):
                tr[pid] = o.read()
            elif o.type.name == "GameObject":
                gos[pid] = o.read()
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

        go_tr = {d.m_GameObject.path_id: pid for pid, d in tr.items()}
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
            # the scene's root object is saved inactive and switched on when the scene streams in: skip it
            while gid and gid in parent_go:
                if gid in gos and not gos[gid].m_IsActive:
                    return False
                gid = parent_go.get(gid)
            return True

        mesh_cache = {}

        def mesh_tris(pp):
            key = (pp.m_FileID, pp.m_PathID)
            if key not in mesh_cache:
                try:
                    m = pp.read()
                    mh = MeshHandler(m)
                    mh.process()
                    v = np.array(mh.m_Vertices, dtype=float).reshape(-1, 3)
                    t = [tri for sub in mh.get_triangles() for tri in sub]
                    mesh_cache[key] = (v, np.array(t, dtype=int).reshape(-1, 3), m.m_Name)
                except Exception as e:
                    mesh_cache[key] = (None, None, f"err:{str(e)[:60]}")
            return mesh_cache[key]

        out, meta = [], None
        for gid, g in gos.items():
            tp = go_tr.get(gid)
            M = world(tp) if tp else np.eye(4)
            rec = {"id": gid, "name": g.m_Name, "path": path(gid), "layer": g.m_Layer,
                   "active": bool(g.m_IsActive), "activeH": active_h(gid),
                   "pos": [r3(M[0, 3]), r3(M[1, 3]), r3(M[2, 3])],
                   "scale": [r3(np.linalg.norm(M[:3, 0])), r3(np.linalg.norm(M[:3, 1]))],
                   "comps": [], "col": [], "mono": {}}

            def W(pts):
                P = np.c_[pts, np.ones(len(pts))] @ M.T
                return P[:, :3]

            for c in g.m_Component:
                cp = c[1] if isinstance(c, (tuple, list)) else (c.component if hasattr(c, "component") else c)
                co = objs.get(cp.path_id)
                if co is None:
                    continue
                t = co.type.name
                if t == "Transform":
                    continue
                try:
                    if t in ("MeshCollider", "BoxCollider", "SphereCollider", "CapsuleCollider"):
                        d = co.read()
                        cd = {"t": t, "trig": bool(d.m_IsTrigger), "en": bool(d.m_Enabled)}
                        if t == "MeshCollider":
                            v, tri, mn = mesh_tris(d.m_Mesh)
                            cd["mesh"] = mn
                            if v is not None and len(tri):
                                wv = W(v)
                                cd["z"] = [r3(wv[:, 2].min()), r3(wv[:, 2].max())]
                                cd["v"] = [[r3(a), r3(b), r3(z)] for a, b, z in wv]
                                cd["tri"] = tri.tolist()
                        elif t == "BoxCollider":
                            cx, cy, cz = d.m_Center.x, d.m_Center.y, d.m_Center.z
                            sx, sy, sz = d.m_Size.x / 2, d.m_Size.y / 2, d.m_Size.z / 2
                            corners = np.array([[cx - sx, cy - sy, cz], [cx + sx, cy - sy, cz], [cx + sx, cy + sy, cz], [cx - sx, cy + sy, cz]])
                            wv = W(corners)
                            cd["pts"] = [[r3(a), r3(b)] for a, b, _ in wv]
                            c8 = W(np.array([[cx + i * sx, cy + j * sy, cz + k * sz] for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]))
                            cd["z"] = [r3(c8[:, 2].min()), r3(c8[:, 2].max())]
                            cd["pts8"] = [[r3(a), r3(b)] for a, b, _ in c8]
                        else:
                            wv = W(np.array([[d.m_Center.x, d.m_Center.y, d.m_Center.z]]))
                            cd["c"] = [r3(wv[0, 0]), r3(wv[0, 1])]
                            cd["z"] = [r3(wv[0, 2]), r3(wv[0, 2])]
                            cd["r"] = r3(d.m_Radius * rec["scale"][0])
                            if t == "CapsuleCollider":
                                cd["h"] = r3(d.m_Height * rec["scale"][1])
                                cd["dir"] = d.m_Direction
                        rec["col"].append(cd)
                        rec["comps"].append(t)
                    elif t == "MonoBehaviour":
                        sc_ = mono_class(co)
                        name = sc_[2] if sc_ else "?"
                        rec["comps"].append(name)
                        if sc_ and name not in SKIP:
                            _, tt = mono_tree(co)
                            rec["mono"][name] = scal({k: v for k, v in tt.items() if not k.startswith("m_")})
                            if name == "SceneRoot":
                                md = tt.get("MetaData") or {}
                                mo = deref(md.get("m_FileID", 0), md.get("m_PathID", 0))
                                if mo is not None:
                                    _, mt = mono_tree(mo)
                                    meta = {k: scal(mt.get(k), -9) for k in mt if not k.startswith("m_") and k not in ("InitialValues",)}
                    else:
                        rec["comps"].append(t)
                except Exception as e:
                    rec["comps"].append(f"{t}!err:{str(e)[:80]}")
            out.append(rec)
        json.dump({"scene": sc, "level": idx, "meta": meta, "objects": out}, open(os.path.join(OUT, f"{sc}.json"), "w"))
        print(sc, LV, len(out), "objects", "meta" if meta else "NO META", flush=True)


    for idx in want:
        try:
            dump_scene(idx)
        except Exception as e:
            print("FAIL", idx, scenes[idx], str(e)[:200], flush=True)


# ---------------------------------------------------------------- hero
def cmd_hero(argv):
    """Dump a prefab's hierarchy (components, MonoBehaviour fields) from an asset file.
    usage: prefab.py <Data> <file> <rootGO pathId> <out.json> | prefab.py <Data> <file> --class <ClassName,..> <out.json>"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import sys, os, json, struct, math
    import UnityPy
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
    DATA, FN = sys.argv[1], sys.argv[2]
    env0 = UnityPy.load(os.path.join(DATA, FN))
    ext = [os.path.basename(e.path) for e in list(env0.objects)[0].assets_file.externals]
    env = UnityPy.load(os.path.join(DATA, FN), *[os.path.join(DATA, f) for f in ext if os.path.exists(os.path.join(DATA, f))])
    gen = TypeTreeGenerator("5.3.2f1"); gen.load_local_dll_folder(os.path.join(DATA, "Managed")); env.typetree_generator = gen
    allobj, scripts = {}, {}
    for o in env.objects:
        fn = os.path.basename(o.assets_file.name); allobj[(fn, o.path_id)] = o
        if o.type.name == "MonoScript":
            d = o.read_typetree(); scripts[(fn, o.path_id)] = (d["m_AssemblyName"].replace(".dll", ""), d["m_Namespace"], d["m_ClassName"])
    def mclass(o):
        fid, pid = struct.unpack_from("<iq", o.get_raw_data(), 16)
        fn = os.path.basename(o.assets_file.name)
        if fid: fn = os.path.basename(o.assets_file.externals[fid - 1].path)
        return scripts.get((fn, pid))
    def clean(v, d=0):
        if isinstance(v, float): return None if math.isnan(v) or math.isinf(v) else round(v, 4)
        if isinstance(v, dict):
            if "m_PathID" in v: return None
            return {k: clean(x, d + 1) for k, x in v.items() if d < 4}
        if isinstance(v, list): return [clean(x, d + 1) for x in v[:20]] if d < 4 else None
        if isinstance(v, (bytes, bytearray)): return None
        return v
    def mono(o):
        sc = mclass(o)
        if not sc: return "?", None
        nodes = gen.get_nodes_up(sc[0], (sc[1] + "." if sc[1] else "") + sc[2])
        try:
            return sc[2], clean({k: v for k, v in o.read_typetree(nodes, check_read=False).items() if not k.startswith("m_")})
        except Exception as e:
            return sc[2], {"err": str(e)[:80]}
    out = []
    if sys.argv[3] == "--class":
        want = set(sys.argv[4].split(","))
        for (fn, pid), o in allobj.items():
            if fn != FN or o.type.name != "MonoBehaviour": continue
            sc = mclass(o)
            if sc and sc[2] in want:
                nm, d = mono(o)
                out.append({"class": nm, "pid": pid, "name": getattr(o.read(), "m_Name", ""), "data": d})
        json.dump(out, open(sys.argv[5], "w"), indent=1); print(len(out)); sys.exit()
    root = allobj[(FN, int(sys.argv[3]))]
    def walk(go, path):
        g = go.read()
        rec = {"path": path + g.m_Name, "comps": {}}
        tr = None
        for c in g.m_Component:
            cp = c[1] if isinstance(c, (tuple, list)) else c
            co = allobj.get((FN, cp.path_id))
            if co is None: continue
            t = co.type.name
            if t == "Transform": tr = co.read(); rec["lpos"] = [round(tr.m_LocalPosition.x, 3), round(tr.m_LocalPosition.y, 3)]; continue
            if t == "MonoBehaviour":
                nm, d = mono(co); rec["comps"][nm] = d
            elif t in ("CapsuleCollider", "BoxCollider", "SphereCollider"):
                rec["comps"][t] = clean(co.read_typetree())
            else:
                rec["comps"][t] = None
        out.append(rec)
        if tr:
            for ch in tr.m_Children:
                cgo = allobj[(FN, ch.path_id)].read().m_GameObject
                walk(allobj[(FN, cgo.path_id)], rec["path"] + "/")
    walk(root, "")
    json.dump(out, open(sys.argv[4], "w"), indent=1)
    print(len(out), "objects")


# ---------------------------------------------------------------- terrain
def cmd_terrain(argv):
    """Terrain of the area from the collision strips: Ori's terrain colliders are open-sided strips (CageStructureToolCollider)
    along the walkable edges; the strip's winding puts the rock on the right of the vertex order. Rasterise the edges as
    walls, seed rock on the right and air on the left of every edge, fill each walled region by its seeds (nearest seed where
    a region has both), clip to the scenes' boundaries and trace polygons.
    usage: terrain.py <scenes dir> <out.json> [preview.png]"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import json, os, sys
    import numpy as np, cv2
    from scipy import ndimage
    from shapely.geometry import Polygon, box, LineString
    from shapely.ops import unary_union

    SD, OUTF = sys.argv[1], sys.argv[2]
    R = 0.2  # units per raster cell
    # walls that exist only in the trial build or in later acts of the story (world-event conditions)
    SKIPPATH = ("trialWall", "/*demo", "blockOffActOneWall", "blockOffActTwoWall")
    rects, segs, extra_solid, hazards, oneways, water = [], [], [], [], [], []
    sceneSegs, sceneRects = {}, {}
    for sc in AREA:
        d = json.load(open(os.path.join(SD, sc + ".json")))
        for r in d["meta"]["SceneBoundaries"]:
            rects.append(box(r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"]))
            sceneRects.setdefault(sc, []).append(rects[-1])
        for o in d["objects"]:
            if not o["activeH"] or any(k in o["path"] for k in SKIPPATH):
                continue
            isdmg = "DamageDealer" in o["comps"]
            if "WaterZone" in o["comps"]:  # WaterZone.Bounds = transform position +- lossyScale / 2 (WaterZone.Awake)
                (x, y), (sx, sy) = o["pos"][:2], o["scale"]
                dmg = o["mono"].get("WaterZone", {}).get("Damage")
                water.append((box(x - sx / 2, y - sy / 2, x + sx / 2, y + sy / 2), sc, o["path"] + f" (damage {dmg} a tick)"))
            for c in o["col"]:
                if not c["en"]:
                    continue
                z = c.get("z", [0, 0])
                if not (z[0] - 0.75 <= 0 <= z[1] + 0.75) and o["layer"] != 4:
                    continue
                L = o["layer"]
                if c.get("mesh") == "cageStructureToolCollider" and not c["trig"] and L == 10:
                    v = np.array(c["v"]); t = np.array(c["tri"])
                    for tr in t:
                        ks = sorted(set(i // 2 for i in tr))
                        if len(ks) == 2:
                            segs.append((v[2 * ks[0], :2], v[2 * ks[1], :2]))
                            sceneSegs.setdefault(sc, []).append(segs[-1])
                    continue
                if L == 4 and c["trig"]:
                    continue  # the water's surface renderer; the volume is the WaterZone
                if L in (16, 17) or (isdmg and L not in (9, 12, 13)):
                    p = col_poly(c)
                    if p is not None and not p.is_empty:
                        hazards.append((p, sc, o["path"]))
                    continue
                if c["trig"]:
                    continue
                if L == 19:
                    p = col_poly(c)
                    if p is not None and not p.is_empty:
                        oneways.append((p, sc, o["path"]))
                elif L == 10:
                    p = col_poly(c)
                    if p is not None and not p.is_empty:
                        extra_solid.append((p, sc, o["path"]))

    bounds = unary_union(rects)
    x0, y0, x1, y1 = bounds.bounds
    x0 -= 2; y0 -= 2; x1 += 2; y1 += 2
    W, H = int((x1 - x0) / R) + 1, int((y1 - y0) / R) + 1
    G = lambda p: (int(round((p[0] - x0) / R * 4)), int(round((y1 - p[1]) / R * 4)))  # cv2 shift=2 fixed point


    def classify(segs_, rects_):
        """rock/air raster for one scene: its edges plus its boundary rectangles as walls, filled from the seeds"""
        wall = np.zeros((H, W), np.uint8)
        seedS = np.zeros((H, W), np.uint8)
        seedA = np.zeros((H, W), np.uint8)
        rm = np.zeros((H, W), np.uint8)
        for g in rects_:
            pts = np.array([G(q) for q in g.exterior.coords], np.int32)
            cv2.fillPoly(rm, [pts], 1, cv2.LINE_8, 2)
            cv2.polylines(wall, [pts], True, 1, 1, cv2.LINE_8, 2)
        for a, b in segs_:
            cv2.line(wall, G(a), G(b), 1, 1, cv2.LINE_8, 2)
        for a, b in segs_:
            dd = b - a; Lg = np.hypot(*dd)
            if Lg < 1e-3:
                continue
            n = np.array([-dd[1], dd[0]]) / Lg  # left of the vertex order = air, right = rock
            for f in (0.25, 0.5, 0.75):
                m = a + dd * f
                for side, arr in ((1, seedA), (-1, seedS)):
                    q = m + side * n * (1.6 * R)
                    i, j = int((y1 - q[1]) / R), int((q[0] - x0) / R)
                    if 0 <= i < H and 0 <= j < W and not wall[i, j]:
                        arr[i, j] = 1
        lab, nl = ndimage.label(wall == 0)
        cs = ndimage.sum(seedS, lab, index=np.arange(nl + 1))
        ca = ndimage.sum(seedA, lab, index=np.arange(nl + 1))
        dS = ndimage.distance_transform_edt(seedS == 0)
        dA = ndimage.distance_transform_edt(seedA == 0)
        sol = ((cs > 0) & (ca == 0))[lab]
        mixed = ((cs > 0) & (ca > 0))[lab]
        sol |= mixed & (dS < dA)
        sol |= (wall > 0) & ndimage.binary_dilation(sol)
        return sol & (rm > 0), int(mixed.sum())


    solid = np.zeros((H, W), bool)
    for sc in sceneRects:
        sol, mx = classify(sceneSegs.get(sc, []), sceneRects[sc])
        solid |= sol
        print(sc, "mixed cells", mx, "rock", int(sol.sum()))
    rock = solid.copy()
    # extra solids (doors, invisible walls, solid polygons)
    for p, *_ in extra_solid:
        for g in (p.geoms if hasattr(p, "geoms") else [p]):
            if g.geom_type == "Polygon":
                cv2.fillPoly(solid.view(np.uint8), [np.array([G(q) for q in g.exterior.coords], np.int32)], 1, cv2.LINE_8, 2)
    # clip to scene bounds
    bm = np.zeros((H, W), np.uint8)
    for g in (bounds.geoms if hasattr(bounds, "geoms") else [bounds]):
        cv2.fillPoly(bm, [np.array([G(q) for q in g.exterior.coords], np.int32)], 1, cv2.LINE_8, 2)
    solid &= bm > 0
    solid = ndimage.binary_opening(solid, iterations=1)


    def trace(mask, eps=0.12):
        cnts, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        out = []
        if hier is None:
            return out
        for i, c in enumerate(cnts):
            if hier[0][i][3] != -1:
                continue
            ap = cv2.approxPolyDP(c, eps / R, True)[:, 0, :]
            if len(ap) < 3 or cv2.contourArea(c) * R * R < 0.3:
                continue
            holes = []
            k = hier[0][i][2]
            while k != -1:
                hp = cv2.approxPolyDP(cnts[k], eps / R, True)[:, 0, :]
                if len(hp) >= 3 and cv2.contourArea(cnts[k]) * R * R >= 0.3:
                    holes.append(hp)
                k = hier[0][k][0]
            U = lambda arr: [[round(x0 + (px + 0.5) * R, 2), round(y1 - (py + 0.5) * R, 2)] for px, py in arr]
            out.append({"ext": U(ap), "holes": [U(h) for h in holes]})
        return out


    def pj(p):
        gs = p.geoms if hasattr(p, "geoms") else [p]
        return [[[round(x, 2), round(y, 2)] for x, y in g.exterior.coords] for g in gs if g.geom_type == "Polygon"]


    res = {"grid": {"x0": x0, "y1": y1, "R": R, "W": W, "H": H}, "solid": trace(solid),
           "bounds": [[round(r.bounds[0], 2), round(r.bounds[1], 2), round(r.bounds[2], 2), round(r.bounds[3], 2)] for r in rects],
           "hazard": [{"scene": s, "path": pa, "polys": pj(p)} for p, s, pa in hazards],
           "oneway": [{"scene": s, "path": pa, "polys": pj(p)} for p, s, pa in oneways],
           "water": [{"scene": s, "path": pa, "polys": pj(p)} for p, s, pa in water],
           "extraSolid": [{"scene": s, "path": pa} for p, s, pa in extra_solid],
           "stats": {"segments": len(segs), "solidArea": float(solid.sum() * R * R), "boundsArea": float(bounds.area)}}
    np.save(OUTF.replace(".json", "_solid.npy"), solid)
    np.save(OUTF.replace(".json", "_rock.npy"), rock & (bm > 0))
    json.dump(res, open(OUTF, "w"))
    print(res["stats"], "solid polys", len(res["solid"]), "haz", len(hazards), "oneway", len(oneways), "water", len(water))
    if len(sys.argv) > 3:
        im = np.full((H, W, 3), (234, 241, 244), np.uint8)
        im[bm > 0] = (222, 228, 232)
        im[solid] = (40, 42, 43)
        for p, *_ in hazards:
            for g in pj(p):
                cv2.fillPoly(im, [np.array([G(q) for q in g], np.int32)], (44, 52, 208), cv2.LINE_8, 2)
        for p, *_ in water:
            for g in pj(p):
                cv2.polylines(im, [np.array([G(q) for q in g], np.int32)], True, (192, 143, 79), 2, cv2.LINE_8, 2)
        for p, *_ in oneways:
            for g in pj(p):
                cv2.fillPoly(im, [np.array([G(q) for q in g], np.int32)], (60, 110, 140), cv2.LINE_8, 2)
        cv2.imwrite(sys.argv[3], cv2.resize(im, (W // 2, H // 2), interpolation=cv2.INTER_AREA))


# ---------------------------------------------------------------- exits
def cmd_exits(argv):
    """Joins between scenes: open (non-rock) runs >= 1.5 u along shared boundary edges."""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import json, os, sys, numpy as np
    SD, TJ = sys.argv[1], sys.argv[2]
    T = json.load(open(TJ)); solid = np.load(TJ.replace(".json", "_solid.npy"))
    g = T["grid"]; x0, y1, R = g["x0"], g["y1"], g["R"]
    rects = {}
    for sc in AREA:
        rects[sc] = [(r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"]) for r in json.load(open(os.path.join(SD, sc + ".json")))["meta"]["SceneBoundaries"]]
    def openat(x, y):
        i, j = int((y1 - y) / R), int((x - x0) / R)
        if not (0 <= i < solid.shape[0] and 0 <= j < solid.shape[1]): return False
        return not solid[max(0, i - 2):i + 3, max(0, j - 2):j + 3].any()
    import glob
    other = {}
    for f in glob.glob(os.path.join(SD, "*.json")):
        n = os.path.basename(f)[:-5]
        if n.startswith("_") or n in rects: continue
        m = json.load(open(f)).get("meta") or {}
        if m.get("DependantScene"): continue
        rs = [(r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"]) for r in m.get("SceneBoundaries") or []]
        if rs: other[n] = rs
    out = []
    names = list(rects)
    # exits to scenes outside the area: open on the area side, 1 u inside the edge
    for A in names:
        for ra in rects[A]:
            for B, rbs in other.items():
                for rb in rbs:
                    for (ea, eb, vert, inward) in ((ra[2], rb[0], True, -1), (ra[0], rb[2], True, 1), (ra[3], rb[1], False, -1), (ra[1], rb[3], False, 1)):
                        if abs(ea - eb) > 0.6: continue
                        lo, hi = (max(ra[1], rb[1]), min(ra[3], rb[3])) if vert else (max(ra[0], rb[0]), min(ra[2], rb[2]))
                        if hi - lo < 1: continue
                        run = []; t = lo
                        while t <= hi + R:
                            p_ = (ea + inward * 1.0, t) if vert else (t, ea + inward * 1.0)
                            if t <= hi and openat(*p_): run.append(t)
                            else:
                                if run and run[-1] - run[0] >= 1.5:
                                    m_ = (run[0] + run[-1]) / 2
                                    out.append({"a": A, "b": B, "outside": True, "vertical": vert, "at": [ea, m_] if vert else [m_, ea], "width": round(run[-1] - run[0], 1)})
                                run = []
                            t += R
    for a in range(len(names)):
        for b in range(a + 1, len(names)):
            A, B = names[a], names[b]
            for ra in rects[A]:
                for rb in rects[B]:
                    segs = []
                    for (ea, eb, vert) in ((ra[2], rb[0], True), (rb[2], ra[0], True), (ra[3], rb[1], False), (rb[3], ra[1], False)):
                        if abs(ea - eb) > 0.6: continue
                        if vert:
                            lo, hi = max(ra[1], rb[1]), min(ra[3], rb[3]); c = ea
                        else:
                            lo, hi = max(ra[0], rb[0]), min(ra[2], rb[2]); c = ea
                        if hi - lo < 1: continue
                        run = []
                        t = lo
                        while t <= hi:
                            p = (c, t) if vert else (t, c)
                            if openat(*p): run.append(t)
                            else:
                                if run and run[-1] - run[0] >= 1.5: segs.append((vert, c, run[0], run[-1]))
                                run = []
                            t += R
                        if run and run[-1] - run[0] >= 1.5: segs.append((vert, c, run[0], run[-1]))
                    for vert, c, lo, hi in segs:
                        m = (lo + hi) / 2
                        out.append({"a": A, "b": B, "vertical": vert, "at": [c, m] if vert else [m, c], "width": round(hi - lo, 1)})
    for e in out: print(e["a"][12:] or e["a"], "<->", e["b"][12:] or e["b"], "V" if e["vertical"] else "H", [round(v, 1) for v in e["at"]], e["width"])
    json.dump(out, open(sys.argv[3], "w"))


# ---------------------------------------------------------------- build
def cmd_build(argv):
    """Build docs/design/reference-levels/ori/area.json from the scene dumps (dump.py), the terrain (terrain.py) and the
    scene joins (exits.py). Rooms = the game's own streaming scenes.
    usage: build.py <scenes dir> <terrain.json> <exits.json> <out area.json>"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import json, math, os, sys
    import numpy as np

    SD, TJ, EJ, OUTF = sys.argv[1:5]
    T = json.load(open(TJ))
    RANDO = [  # (location id, x, y, label, where, needs): the randomizer's table (sparkle-preference/ori_rando_server bf-areas.ori), via the earlier mined area.json
        ('FirstPickup', 92, -227, 'Small spirit light container (secret 1)', 'secret room behind the roots at the end of the log; not drawn on the map', None),
        ('FirstEnergyCell', -27, -256, 'Energy cell 1', None, None),
        ('FronkeyFight', -154, -271, 'Small spirit light container (secret 2, under the big log after the 3 Hoppers)', 'under the fallen log at the west end of the ram tunnel; off the map art', None),
        ('GladesKeystone1', 83, -222, 'Keystone (gate 1)', 'behind a boulder you pull aside, in a small cave', None),
        ('GladesKeystone2', -11, -206, 'Keystone (gate 1)', 'across two swinging logs above the pond', None),
        ('GladesGrenadePool', 59, -280, 'Large spirit light container in the grenade pool', 'underwater cave behind a barrier opened by lighting a torch', 'Light Burst + cleansed water'),
        ('GladesGrenadeTree', 82, -196, 'Ability cell (DE torch barrier)', 'upper section behind a barrier opened by lighting a torch', 'Light Burst (+ Charge Jump/Bash/WallJump+DoubleJump)'),
        ('GladesMainPool', 5, -241, 'Small spirit light container at the pond bottom', 'bottom of the pond', 'cleansed water'),
        ('GladesMainPoolDeep', -40, -239, 'Energy cell 3 (swim tunnel)', 'tunnel off the pond bottom', 'cleansed water'),
        ('FronkeyWalkRoof', 257, -199, 'Giant spirit light container above the start', 'high ledge above the start chamber', 'Charge Jump or Light Burst (DE)'),
        ('FourthHealthCell', -80, -189, 'Life cell 1 (mushroom hop)', 'up the giant mushrooms above the signpost', None),
        ('GladesMapKeystone', -59, -244, 'Keystone (gate 2)', None, None),
        ('WallJumpSkillTree', -316, -308, 'Wall Jump (Ancestral Tree)', None, None),
        ('LeftGladesHiddenExp', -283, -236, 'Small spirit light container (secret 3)', 'little cave at the very bottom under the swinging spikes; off the map art', None),
        ('GladesMap', -81, -248, 'Map stone (Sunken Glades)', 'pay one map stone fragment', 'map fragment'),
        ('AboveFourthHealth', -48, -166, 'Ability cell 3 (above the life cell)', 'upper portion reached by bashing off a Hopper', 'Bash'),
        ('WallJumpAreaExp', -245, -277, 'Large spirit light container above the Wall Jump hollow', "pocket above the ceiling before the drop to Fil's tree; off the map art", 'Charge Jump or Light Burst (DE)'),
        ('WallJumpAreaEnergyCell', -336, -288, 'Energy cell 2 (wall-jump up beside the tree)', 'on a ledge left of the tree, reached by the newly learned Wall Jump', 'Wall Jump'),
        ('LeftGladesExp', -247, -207, 'Small spirit light container (secret 4)', 'wall-jump up the tree left of the boulder ledge (keystone 2-2)', 'Wall Jump'),
        ('LeftGladesKeystone', -238, -212, 'Keystone (gate 2)', 'on a ledge reached by pushing the boulder past the swinging spikes', 'Wall Jump'),
        ('LeftGladesMapstone', -184, -227, 'Map stone fragment', 'jump east after pulling the lever that lowers a log', None),
        ('SpiritCavernsKeystone1', -182, -193, 'Keystone (gate 3)', 'after the first row of shooter flowers, wall-jump above the flower', 'Wall Jump'),
        ('SpiritCavernsKeystone2', -217, -183, 'Keystone (gate 3)', 'after the second row, above the flower to the left', 'Wall Jump'),
        ('SpiritCavernsTopRightKeystone', -177, -154, 'Keystone (gate 3)', 'cave under the Spirit Gate', 'Wall Jump'),
        ('SpiritCavernsTopLeftKeystone', -217, -146, 'Keystone (gate 3)', 'pit of thorns at the very top-left; wall-jump between its sides', 'Wall Jump'),
        ('SpiritCavernsAbilityCell', -216, -176, 'Ability cell (secret 6, bash a shooter projectile)', 'side pocket at the third shooter row; bash a projectile upward', 'Bash or Charge Jump'),
        ('GladesLaser', -155, -186, 'Energy cell 4 (laser and boulder)', 'behind the 4-energy gate: a Hopper breaks the floor, push the boulder to block the laser', 'Energy=4, Double Jump/Charge Jump'),
        ('GladesLaserGrenade', -165, -140, 'Ability cell 5 (hanging slugs)', 'pond above the laser cave; bash across hanging Consumed Crawlers', 'Light Burst + Bash'),
        ('ChargeFlameAreaExp', 4, -196, 'Large spirit light container behind the charge-flame wall', 'behind a breakable wall', 'Charge Flame or Light Burst'),
        ('SpiritTreeExp', -168, -104, 'Large spirit light container (hole a Hopper smashes near the Spirit Tree)', 'down a hole a Hopper breaks open, behind a pillar', 'Wall Jump (+ Charge Flame for the pillar)'),
        ('sein', -138, -262, 'Sein: Spirit Flame (story pickup on the big log)', None, None),
    ]

    PX = 1920 / (2 * 20 * math.tan(math.radians(30)) * 16 / 9)  # 46.765 px per unit (FOV 60, zoom 20, 16:9)
    OX, OY = -344.0, -64.5  # the area's top-left in game units (westmost scene edge, topmost scene edge)
    SW, SH = 1920, 1080
    BG = ["sunkenGladesBackgroundA", "sunkenGladesBackgroundB", "sunkenGladesBackgroundC", "sunkenGladesBackgroundD",
          "sunkenGladesIntroBackground"]


    def P(x, y):
        return [round((x - OX) * PX), round((OY - y) * PX)]


    SRC = "files: oriDE_Data level scene, extracted with UnityPy (tools/reference/mined/ori/extract.py)"

    # ---------------------------------------------------------------- rooms = scenes
    ROOM = {  # scene -> (id, name, shape, on critical path)
        "sunkenGladesRunaway": ("wake", "Waking glade (start) and the east ledge with the 4-energy door", "hall", True),
        "sunkenGladesIntroSplitB": ("well", "The drop, the spring and the first Spirit Well", "hall", True),
        "sunkenGladesIntroSplitA": ("crossing", "Pools, log crossing, swinging logs and Spirit Gate 1", "hall", True),
        "sunkenGladesEnemyIntroductionC": ("ram", "Ram tunnel (energy cell 1, the Rammer)", "corridor", True),
        "sunkenGladesOriRoom": ("sein", "Sein's hollow (Spirit Flame, the first fight)", "corridor", True),
        "sunkenGladesWaterhole": ("signpost", "Signpost hub and the giant mushrooms (life cell)", "hub", True),
        "upperGladesBelowSpiritTree": ("attic", "Below the Spirit Tree (Charge Flame tree, ability cell)", "pocket", False),
        "sunkenGladesSpiritCavernSaveRoomB": ("mapstone", "Map stone hall (keystone, map stone)", "corridor", True),
        "sunkenGladesObstaclesIntroductionStreamlined": ("leftglades", "Thorns, swinging spikes and Spirit Gate 2", "hall", True),
        "sunkenGladesSpiritCavernLaser": ("laser", "Laser cave behind the 4-energy gate", "pocket", False),
        "sunkenGladesRunning": ("laserpond", "Drop-slug pond above the laser cave", "pocket", False),
        "sunkenGladesSpiritCavernB": ("caverns", "Spirit Caverns: the shaft, the shooter rows, 4 keystones, Spirit Gate 3", "shaft", True),
        "sunkenGladesSpiritCavernWalljumpB": ("walljump", "Wall Jump hollow (Fil's tree)", "hall", True),
        "sunkenGladesSpiritCavernsPushBlockIntroduction": ("upperleft", "Push blocks and rotating lasers (keystone)", "hall", True),
        "westGladesOverworldForestA": ("porch", "Forest west of the Spirit Tree (fork to the Valley of the Wind)", "hall", False),
        "spiritTreeRefined": ("tree", "The Spirit Tree", "setpiece", True),
        "sunkenGladesLaserStomp": ("east", "Laser and stomp posts above the east ledge (reached from outside)", "pocket", False),
    }
    SC = {v[0]: k for k, v in ROOM.items()}
    meta = {sc: json.load(open(os.path.join(SD, sc + ".json")))["meta"] for sc in AREA}


    def rects_of(sc):
        return [(r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"]) for r in meta[sc]["SceneBoundaries"]]


    POS2SC = {}  # an object's own scene decides its room (positions on a seam would otherwise go to the neighbour)


    def room_at(x, y):
        sc = POS2SC.get((round(x, 3), round(y, 3)))
        if sc in ROOM:
            return ROOM[sc][0]
        for sc in AREA:
            for (a, b, c, d) in rects_of(sc):
                if a <= x <= c and b <= y <= d:
                    return ROOM[sc][0]
        best, bd = None, 1e9
        for sc in AREA:
            for (a, b, c, d) in rects_of(sc):
                dx = max(a - x, 0, x - c); dy = max(b - y, 0, y - d)
                if math.hypot(dx, dy) < bd:
                    bd, best = math.hypot(dx, dy), ROOM[sc][0]
        return best


    # exits: curated from exits.py (open runs >= 1.5 u along shared scene edges, measured on the collider terrain);
    # gates from the door / wall objects that sit at them. (a, b, x, y, gate, oneWay, note)
    OUTSIDE = {"MoonGrotto", "HollowGrove", "BlackrootBurrows", "ValleyOfTheWind"}
    EXITS = [
        ("wake", "well", 156.0, -206.2, None, False, "main band"),
        ("wake", "well", 156.0, -187.9, None, False, "upper ledge (the log you fall through)"),
        ("well", "crossing", 69.5, -257.0, None, False, "lower band"),
        ("well", "crossing", 69.5, -209.5, None, False, "upper band (swinging logs)"),
        ("crossing", "ram", -20.0, -255.0, None, False, ""),
        ("ram", "sein", -82.0, -260.0, "breakable: the Rammer smashes the rock (scripted; an invisible wall blocks it until then)", False, "added: the edge is closed by a scripted wall in the colliders"),
        ("crossing", "signpost", -20.0, -218.8, "key: 2 keystones (Spirit Gate 1, DoorWithSlots NumberOfOrbsRequired 2)", False, ""),
        ("crossing", "signpost", -20.0, -193.9, "breakable: Charge Flame wall (the nook's entrance, 19 u east of the edge)", False, "upper route through the charge-flame nook"),
        ("crossing", "mapstone", -20.0, -237.8, "water: polluted (WaterZone Damage 20 = 5 cells, lethal) until the Ginso Tree is cleansed", False, "swim tunnel"),
        ("leftglades", "sein", -155.5, -255.0, None, True, "a hole from Spirit Gate 2's ledge into Sein's hollow (13 u up from below: Wall Jump climbs it)"),
        ("mapstone", "leftglades", -111.0, -245.5, None, False, ""),
        ("signpost", "attic", -98.1, -174.0, None, False, "giant mushrooms"),
        ("signpost", "attic", -68.9, -174.0, None, False, ""),
        ("signpost", "leftglades", -111.0, -212.3, None, False, ""),
        ("signpost", "laser", -111.0, -186.6, None, False, ""),
        ("attic", "laser", -111.0, -165.9, None, False, ""),
        ("attic", "laserpond", -111.0, -149.2, "ability: Bash or Charge Jump (later)", False, ""),
        ("leftglades", "laser", -132.9, -200.0, None, False, ""),
        ("leftglades", "caverns", -171.5, -238.7, "breakable: thorn creeps (Spirit Flame, 3 HP each)", False, "down to the shaft"),
        ("leftglades", "caverns", -171.5, -213.8, "key: 2 keystones (Spirit Gate 2, DoorWithSlots NumberOfOrbsRequired 2)", False, ""),
        ("laser", "caverns", -171.5, -174.4, "energy: 4-energy gate (EnergyDoor AmountOfEnergyRequired 4)", False, ""),
        ("caverns", "walljump", -224.5, -290.0, None, False, ""),
        ("caverns", "upperleft", -224.5, -235.0, None, False, ""),
        ("caverns", "upperleft", -224.5, -219.1, "ability: Wall Jump", False, ""),
        ("caverns", "tree", -171.5, -128.9, "key: 4 keystones (Spirit Gate 3, DoorWithSlots NumberOfOrbsRequired 4)", False, ""),
        ("tree", "porch", -171.5, -113.0, "breakable: Charge Flame wall (ChargeFlameWall, 10 HP)", False, ""),
        ("wake", "MoonGrotto", 295.0, -202.5, "energy: 4-energy door (EnergyDoor AmountOfEnergyRequired 4)", False, ""),
        ("wake", "HollowGrove", 161.7, -174.0, "ability: later (Charge Jump / Double Jump)", False, ""),
        ("well", "BlackrootBurrows", 156.0, -246.1, "ability: Wall Jump", False, ""),
        ("well", "HollowGrove", 151.7, -174.0, "ability: later", False, ""),
        ("crossing", "HollowGrove", 26.8, -174.0, "breakable: Charge Flame wall (ChargeFlameWall, 10 HP)", False, ""),
        ("crossing", "BlackrootBurrows", 69.5, -289.8, "water: under the polluted pool", False, ""),
        ("attic", "HollowGrove", -20.0, -151.7, None, False, "how the Charge Flame tree is reached"),
        ("tree", "HollowGrove", -20.0, -96.8, None, False, "the way on"),
        ("porch", "ValleyOfTheWind", -274.5, -106.7, None, False, ""),
        ("porch", "ValleyOfTheWind", -263.8, -120.5, None, False, ""),
        ("east", "MoonGrotto", 295.0, -180.4, None, False, ""),
        ("east", "HollowGrove", 240.0, -160.5, None, False, ""),
    ]


    def side(room, x, y):
        a, b, c, d = bbox[room]
        dl, dr, dt, db = abs(x - a), abs(x - c), abs(y - d), abs(y - b)
        m = min(dl, dr, dt, db)
        return "left" if m == dl else "right" if m == dr else "top" if m == dt else "bottom"


    bbox = {}
    rooms = []
    for sc in AREA:
        rs = rects_of(sc)
        a, b = min(r[0] for r in rs), min(r[1] for r in rs)
        c, d = max(r[2] for r in rs), max(r[3] for r in rs)
        rid, name, shape, crit = ROOM[sc]
        bbox[rid] = (a, b, c, d)
        p0, p1 = P(a, d), P(c, b)
        exact = sum((r[2] - r[0]) * (r[3] - r[1]) for r in rs) * PX * PX / (SW * SH)
        rooms.append({"id": rid, "name": name, "scene": sc,
                      "rect": [p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]],
                      "sceneRects": [[*P(r[0], r[3]), round((r[2] - r[0]) * PX), round((r[3] - r[1]) * PX)] for r in rs],
                      "screens": round(exact, 2), "shape": shape, "onCriticalPath": crit, "exits": []})
    R = {r["id"]: r for r in rooms}
    for a, b, x, y, gate, one, note in EXITS:
        for frm, to in ((a, b), (b, a)):
            if frm not in R:
                continue
            e = {"to": to, "side": side(frm, x, y), "at": P(x, y)}
            if one:
                e["oneWay"] = True
                if frm == a:
                    e["note"] = "drop only: " + note
                else:
                    continue  # one-way: only from a to b
            if gate:
                e["gate"] = gate
            if note and "note" not in e:
                e["note"] = note
            R[frm]["exits"].append(e)

    # ---------------------------------------------------------------- scene objects
    objs = []
    for sc in AREA + BG:
        d = json.load(open(os.path.join(SD, sc + ".json")))
        for o in d["objects"]:
            o["scene"] = sc
            objs.append(o)
            POS2SC.setdefault((round(o["pos"][0], 3), round(o["pos"][1], 3)), sc)


    def first(cls):
        return [o for o in objs if cls in o["comps"]]


    things, enemies, terrain = [], [], []
    oldp = [{"id": r[0], "x": r[1], "y": r[2], "label": r[3], **({"hidden": {"how": r[4], **({"needs": r[5]} if r[5] else {})}} if r[4] else {})}
            for r in RANDO]


    def rando_id(x, y):
        """the randomizer's location for a pickup, matched by position (the randomizer stores integer units)"""
        best, bd = None, 3.0
        for t in oldp:
            dd = math.hypot(t["x"] - x, t["y"] - y)
            if dd < bd:
                best, bd = t, dd
        return best


    SECRET_BOXES = []  # TransparentWallB zones: foreground art that hides a pocket and fades when Ori enters
    for o in first("TransparentWallB"):
        for c in o["col"]:
            if c["t"] == "BoxCollider":
                xs = [p[0] for p in c["pts"]]; ys = [p[1] for p in c["pts"]]
                SECRET_BOXES.append((min(xs), min(ys), max(xs), max(ys), o["scene"]))


    def in_secret(x, y, pad=0.5):
        return any(a - pad <= x <= c + pad and b - pad <= y <= d + pad for a, b, c, d, _ in SECRET_BOXES)


    LATER = {  # what a pickup needs beyond the start kit, from the rando logic of the old mined file (still true)
    }
    COLL = {"smallExpOrb": ("pickup-minor", "spirit light container, small (EX15)"),
            "mediumExpOrb": ("pickup-minor", "spirit light container, medium (EX100)"),
            "largeExpOrb": ("pickup-minor", "spirit light container, large (EX200)"),
            "energyContainerPickup": ("pickup-major", "energy cell (EC)"),
            "healthContainerPickup": ("pickup-major", "life cell (HC)"),
            "skillPointOrb": ("pickup-major", "ability cell (AC)")}


    def add_thing(tid, kind, x, y, value, src=SRC, **kw):
        t = {"id": tid, "roomId": room_at(x, y), "kind": kind, "at": P(x, y), "value": value, "src": src}
        t.update({k: v for k, v in kw.items() if v is not None})
        things.append(t)
        return t


    # truly hidden: not visible from the route. Pockets under TransparentWallB art come from the files; the others are the
    # randomizer's notes (still true: the walls, barriers and pools they name are in the scene data).
    HIDDEN_OTHER = {"WallJumpAreaExp": "pocket above the ceiling before the drop to Fil's tree (off the map art)",
                    "ChargeFlameAreaExp": "behind a Charge Flame wall (ChargeFlameWall, 10 HP)",
                    "GladesLaser": "under a stompable floor a Hopper breaks, behind the 4-energy gate",
                    "GladesGrenadeTree": "behind a torch barrier (Light Burst, DE)",
                    "GladesGrenadePool": "underwater cave behind a torch barrier (Light Burst, DE)",
                    "GladesMainPool": "on the bottom of the polluted pond",
                    "GladesMainPoolDeep": "in a tunnel off the bottom of the polluted pond"}


    def hidden_for(x, y, old):
        if in_secret(x, y):
            return {"how": "pocket hidden behind foreground art that fades when Ori steps in (TransparentWallB zone)"}
        if old and old["id"] in HIDDEN_OTHER:
            return {"how": HIDDEN_OTHER[old["id"]]}
        return None


    def where(old):
        return old["hidden"]["how"] if old and old.get("hidden") else None


    def needs(old):
        return old["hidden"].get("needs") if old and old.get("hidden") else None


    n = 0
    for o in first("CollectablePlaceholder"):
        pref = (o["mono"]["CollectablePlaceholder"].get("Prefab") or {}).get("ext", "")[3:]
        if pref not in COLL:
            continue
        x, y = o["pos"][:2]
        if room_at(x, y) is None:
            continue
        kind, val = COLL[pref]
        old = rando_id(x, y)
        n += 1
        add_thing(old["id"] if old else f"{pref}{n}", kind, x, y, val, hidden=hidden_for(x, y, old),
                  label=old.get("label") if old else None, where=where(old), needs=needs(old),
                  note=("in the dependent art scene " + o["scene"]) if o["scene"] in BG else None)
    for o in first("ExpOrbPickup"):
        x, y = o["pos"][:2]
        old = rando_id(x, y)
        add_thing(old["id"] if old else "expOrb", "pickup-minor", x, y, "spirit light container, medium (EX100)",
                  hidden=hidden_for(x, y, old), label=old.get("label") if old else None, where=where(old), needs=needs(old))
    for i, o in enumerate(first("KeystonePickup")):
        x, y = o["pos"][:2]
        old = rando_id(x, y)
        after = "*allEnemiesKilled/activated" in o["path"]
        add_thing(old["id"] if old else f"keystone{i}", "pickup-major", x, y, "keystone (KS)",
                  label=old.get("label") if old else None, hidden=hidden_for(x, y, old), where=where(old), needs=needs(old),
                  note="appears only once Ori has Spirit Flame (parent switched on by SeinAbilityCondition SpiritFlame)" if after else None)
    for o in first("MapStonePickup"):
        x, y = o["pos"][:2]; old = rando_id(x, y)
        add_thing(old["id"] if old else "mapFragment", "pickup-major", x, y, "map stone fragment (MS)", label=old.get("label") if old else None)
    for o in first("MapStone"):
        x, y = o["pos"][:2]; old = rando_id(x, y)
        add_thing(old["id"] if old else "mapStone", "pickup-major", x, y, "map stone (pay 1 fragment: reveals the Glades map)", label=old.get("label") if old else None)
    ABIL = {3: "Wall Jump", 2: "Charge Flame"}
    for o in first("GetAbilityPedestal"):
        x, y = o["pos"][:2]; ab = o["mono"]["GetAbilityPedestal"]["Ability"]; old = rando_id(x, y)
        add_thing(old["id"] if old and ab == 3 else f"tree{ABIL[ab].replace(' ', '')}", "pickup-major", x, y,
                  f"ability: {ABIL[ab]} (Ancestral Tree, GetAbilityPedestal)",
                  needs="reached from the Hollow Grove after this area" if ab == 2 else None)
    for o in objs:
        if o["mono"].get("GetAbilityAction", {}).get("Ability") == 15:
            x, y = o["pos"][:2]
            add_thing("Sein", "pickup-major", x, y, "ability: Spirit Flame (Sein; GetAbilityAction in the finding-Ori sequence)")
    for i, o in enumerate(first("SavePedestal")):
        x, y = o["pos"][:2]
        add_thing(["wellGlades", "wellSpiritTree"][i] if i < 2 else f"well{i}", "save", x, y,
                  "Spirit Well (save, full heal, teleport)")
    for i, o in enumerate(first("Lever")):
        x, y = o["pos"][:2]
        add_thing(f"lever{i + 1}", "lever", x, y, "lever: lowers a log bridge (to the map fragment)")
    for i, o in enumerate(first("PushPullBlock")):
        x, y = o["pos"][:2]
        add_thing(f"boulder{i + 1}", "pushblock", x, y, "push/pull boulder")
    for i, o in enumerate(first("Spring")):
        x, y = o["pos"][:2]
        add_thing(f"spring{i + 1}", "spring", x, y, "spring plant (bounce up; freed by burning its thorns)")
    for i, o in enumerate([o for o in objs if o["name"] in ("orbBulb",)]):
        x, y = o["pos"][:2]
        add_thing(f"bulb{i + 1}", "breakable", x, y, "hanging orb bulb (5 HP; drops spirit light)",
                  note="appears once Ori has Spirit Flame")
    pl = [o for o in objs if o["name"] == "plant" and "EntityDamageReciever" in o["comps"]]
    for i, o in enumerate(pl):
        x, y = o["pos"][:2]
        hp = o["mono"]["EntityDamageReciever"].get("MaxHealth")
        kind = "energy" if "energyOrbPlant" in o["path"] else "spirit light"
        add_thing(f"plant{i + 1}", "breakable", x, y, f"orb plant ({kind}; {hp:g} HP)")
    # landmarks
    add_thing("spiritTree", "landmark", -95.7, -110.0, "the Spirit Tree", src="files: savePedestal position + scene bounds")
    add_thing("startSpot", "landmark", 189.0, -219.3, "where control begins (SeinPlaceholder of sunkenGladesRunaway)")

    # ---------------------------------------------------------------- enemies
    ENEMY = {  # placeholder class -> (kind, behaviour, attack)
        "JumperEnemyPlaceholder": ("Hopper (JumperEnemy)", "charges then leaps at Ori (jump 8 u, 10 u far), stomp on landing", "contact + stomp landing"),
        "StarSlugEnemyPlaceholder": ("Spiked slug (StarSlugEnemy)", "crawls along floors, walls and ceilings at 4 u/s", "contact; spikes"),
        "RammingEnemyPlaceholder": ("Rammer (armouredRammingEnemy)", "scripted: bursts out and charges; breaks the wall and is crushed", "charge"),
        "FishEnemyPlaceholder": ("Piranha (FishEnemy)", "swims in the polluted pool, lunges", "bite"),
        "SpitterEnemyPlaceholder": ("Spitter (SpitterEnemy)", "walks 3 u/s, charges at 10 u/s within 10 u, spits arcing shots", "contact; projectile 8"),
        "DashOwlEnemyPlaceholder": ("Swooping bird (DashOwlEnemy)", "perched; dashes 20 u at Ori", "dash"),
        "DropSlugEnemyPlaceholder": ("Drop slug (DropSlugEnemy)", "hangs from a ceiling, drops when Ori is below (alert 10 u), explodes", "drop + explosion"),
        "AcidSlugEnemyPlaceholder": ("Acid slug (AcidSlugEnemy)", "crawls at 3 u/s; Spirit Flame cannot hurt it from the top", "contact"),
    }


    def cells(dmg):
        return math.ceil(dmg / 4) if dmg else 0  # SeinDamageReciever: ceil(damage / 4) life cells (normal difficulty)


    def difficulty(hp, dmg, kind, gated):
        hits = math.ceil(hp / 2)  # Spirit Flame level A: 2 damage a hit
        s = 1 + (hits >= 5) + (hits >= 10) + (cells(dmg) >= 2) + (hits >= 16)
        return min(5, s)


    for cls, (kind, beh, att) in ENEMY.items():
        for o in first(cls):
            x, y = o["pos"][:2]
            m = o["mono"][cls]; st = m.get("Settings", {})
            hp, dmg = st.get("Health"), st.get("DamageOnTouch")
            gated = "*allEnemiesKilled/activated" in o["path"]
            hits = math.ceil(hp / 2)
            e = {"id": f"{kind.split(' (')[0].lower().replace(' ', '')}{sum(1 for q in enemies if q['kind'] == kind) + 1}",
                 "roomId": room_at(x, y), "kind": kind, "at": P(x, y), "hp": hp, "contactDamage": dmg,
                 "contactCells": cells(dmg), "hitsToKill": hits, "attack": att, "behaviour": beh,
                 "respawns": bool(m.get("RespawnOnTimeout")) and m.get("RespawnTime", 0) > 0,
                 "respawnSeconds": m.get("RespawnTime"), "spiritLightDrop": st.get("NumberOfExpOrbsToDrop"),
                 "difficulty": difficulty(hp, dmg, kind, gated), "src": SRC + f" ({cls}.Settings)"}
            extra = []
            if cls == "SpitterEnemyPlaceholder":
                e["projectileDamage"] = st.get("ProjectileDamage")
            if gated:
                extra.append("spawns only once Ori has Spirit Flame")
            if "JumpingZone" in m:
                extra.append("bounded jumping zone")
            if o["scene"] == "sunkenGladesOriRoom":
                extra.append("the first fight: 3 Hoppers that do not respawn; killing all 3 runs the story trigger")
            if "MaxDistanceFromStartPosition" in st:
                e["patrol"] = round(st["MaxDistanceFromStartPosition"] * PX)
            e["why"] = f"{hits} Spirit Flame hits, touch costs {cells(dmg)} of Ori's 3 life cells" + ("; " + "; ".join(extra) if extra else "")
            enemies.append(e)
    # stationary shooters: projectile plants (cannot be killed)
    for i, o in enumerate(first("ProjectileSpawner")):
        x, y = o["pos"][:2]
        m = o["mono"]["ProjectileSpawner"]
        enemies.append({"id": f"shooter{i + 1}", "roomId": room_at(x, y), "kind": "Shooter plant (ProjectileSpawner, pink plant)",
                        "at": P(x, y), "contactDamage": 4, "contactCells": 1, "invulnerable": True,
                        "attack": f"fires a slow orb at {m.get('Speed')} u/s along {[m.get('Direction', {}).get('x'), m.get('Direction', {}).get('y')]}",
                        "behaviour": "stationary, cannot be killed; a timing hazard in rows", "respawns": False,
                        "difficulty": 2, "why": "a timing hazard, 1 cell a hit", "src": SRC})

    # ---------------------------------------------------------------- terrain
    from shapely.geometry import Polygon as SPoly, LineString as SLine
    from shapely.ops import split as ssplit


    def no_holes(poly):
        """cut a polygon with holes by vertical lines through its holes until no piece has a hole (schema polys are simple)"""
        todo, done = [poly], []
        while todo:
            g = todo.pop()
            if hasattr(g, "geoms"):
                todo += list(g.geoms)
                continue
            if g.geom_type != "Polygon" or g.area < 1e-3:
                continue
            if not g.interiors:
                done.append(g)
                continue
            hx = SPoly(g.interiors[0]).centroid.x
            b = g.bounds
            parts = ssplit(g, SLine([(hx, b[1] - 1), (hx, b[3] + 1)]))
            todo += [q for q in parts.geoms]
        return done


    for p in T["solid"]:
        for g in no_holes(SPoly(p["ext"], p["holes"]).buffer(0)):
            xs, ys = g.exterior.xy
            rid = room_at(sum(xs) / len(xs), sum(ys) / len(ys))
            terrain.append({"roomId": rid, "kind": "solid", "poly": [P(x, y) for x, y in list(g.exterior.coords)[:-1]]})
    from shapely.geometry import box as sbox
    from shapely.ops import unary_union as sunion
    AREAB = sunion([sbox(*r) for sc in AREA for r in rects_of(sc)])
    for kind, key in (("hazard", "hazard"), ("oneway", "oneway"), ("water", "water")):
        for h in T[key]:
            polys = h["polys"]
            if kind == "water":  # clip the water volumes to the area's scenes
                polys = [list(g.exterior.coords)[:-1] for q in polys for g in no_holes(SPoly(q).intersection(AREAB))]
            for poly in polys:
                xs = [q[0] for q in poly]; ys = [q[1] for q in poly]
                t = {"roomId": room_at(sum(xs) / len(xs), sum(ys) / len(ys)), "kind": kind, "poly": [P(*q) for q in poly],
                     "what": h["path"].split("/", 1)[-1]}
                if kind == "water":
                    t["what"] += "; polluted until the Ginso Tree (a tick costs ceil(damage / 4) cells: 4 -> 1, 20 -> 5 = death)"
                terrain.append(t)


    def boxpoly(a, b, c, d):
        return [P(a, b), P(c, b), P(c, d), P(a, d)]


    for a, b, c, d, sc in SECRET_BOXES:
        terrain.append({"roomId": room_at((a + c) / 2, (b + d) / 2), "kind": "secretWall", "poly": boxpoly(a, b, c, d),
                        "what": "TransparentWallB: foreground art over a hidden pocket, fades when Ori enters"})
    for o in first("DoorWithSlots") + first("EnergyDoor"):
        x, y = o["pos"][:2]
        n_ = o["mono"].get("DoorWithSlots", {}).get("NumberOfOrbsRequired") or o["mono"].get("EnergyDoor", {}).get("AmountOfEnergyRequired")
        w = "keystone door" if "DoorWithSlots" in o["comps"] else "energy door"
        terrain.append({"roomId": room_at(x, y), "kind": "door", "poly": boxpoly(x - 1, y - 3, x + 1, y + 3), "what": f"{w}, {n_}"})
    for o in first("ChargeFlameWall") + first("StompableFloor") + [o for o in objs if o["name"] == "stompableFloorA" and "EntityDamageReciever" in o["comps"]]:
        x, y = o["pos"][:2]
        w = "Charge Flame wall (10 HP)" if "ChargeFlameWall" in o["comps"] else "stompable floor (Stomp)"
        if any(t.get("what") == w and t["poly"][0] == P(x - 2, y - 2) for t in terrain):
            continue
        terrain.append({"roomId": room_at(x, y), "kind": "breakable", "poly": boxpoly(x - 2, y - 2, x + 2, y + 2), "what": w})
    # thorn creep doors: groups of shootable thorn plants that block a passage until burnt
    groups = []  # cluster the thorns: within 4 u of a cluster member
    for o in objs:
        if "shootableCreepDoor" in o["path"] and o["col"] and "EntityDamageReciever" in o["comps"]:
            p = o["pos"][:2]
            for gp in groups:
                if any(math.hypot(p[0] - q[0], p[1] - q[1]) < 4 for q in gp):
                    gp.append(p)
                    break
            else:
                groups.append([p])
    for ps in groups:
        xs = [p[0] for p in ps]; ys = [p[1] for p in ps]
        terrain.append({"roomId": room_at(sum(xs) / len(xs), sum(ys) / len(ys)), "kind": "breakable",
                        "poly": boxpoly(min(xs) - 0.7, min(ys) - 0.7, max(xs) + 0.7, max(ys) + 0.7),
                        "what": f"thorn creep barrier: {len(ps)} shootable thorns (3 HP each, Spirit Flame), 2 cells on touch"})
    for o in first("LaserBeam"):
        x, y = o["pos"][:2]
        terrain.append({"roomId": room_at(x, y), "kind": "hazard", "poly": boxpoly(x - 0.6, y - 0.6, x + 0.6, y + 0.6),
                        "what": "laser emitter (" + ("rotating" if "rotating" in o["path"] else "blockable") + "; instant kill, damage 10000)"})

    # ---------------------------------------------------------------- critical path and the walked route
    crit = ["wake", "well", "crossing", "ram", "sein", "ram", "crossing", "well", "crossing", "signpost", "leftglades",
            "caverns", "walljump", "caverns", "upperleft", "caverns", "leftglades", "mapstone", "leftglades", "caverns", "tree"]
    WAY = [  # (x, y, event)
        (189.0, -219.3, "start (control begins)"), (110.0, -224.0, "drop through the log"), (-27.4, -256.3, "energy cell 1 (Soul Link)"),
        (-44.4, -260.5, "the Rammer bursts out"), (-164.6, -262.1, "Sein: Spirit Flame"), (-117.5, -267.3, "3 Hoppers, the first fight"),
        (92.0, -256.0, "burn the thorns around the spring"), (110.0, -257.4, "first Spirit Well"), (83.1, -222.3, "keystone"),
        (-11.1, -206.4, "keystone across the swinging logs"), (-13.3, -217.5, "Spirit Gate 1"), (-80.0, -215.0, "signpost hub"),
        (-168.5, -239.5, "burn the thorn barrier"), (-314.8, -306.1, "Wall Jump (Fil's tree)"), (-336.8, -288.2, "energy cell on the wall beside it"),
        (-238.3, -212.4, "keystone past the push blocks"), (-80.5, -247.2, "map stone"), (-59.4, -244.3, "keystone"),
        (-162.1, -215.5, "Spirit Gate 2"), (-184.9, -227.6, "map fragment (lever bridge)"), (-182.1, -194.0, "keystone (shooter row 1)"),
        (-217.4, -183.9, "keystone (shooter row 2)"), (-177.9, -154.5, "keystone under the gate"), (-217.5, -146.3, "keystone top-left"),
        (-177.1, -128.2, "Spirit Gate 3"), (-95.7, -120.0, "the Spirit Tree (second Spirit Well)"), (-20.0, -96.8, "east to the Hollow Grove"),
    ]
    rock = np.load(TJ.replace(".json", "_rock.npy"))
    g = T["grid"]
    from scipy import ndimage
    from skimage.graph import MCP_Geometric
    blocked = ndimage.binary_dilation(rock, iterations=1)
    cost = np.where(blocked, 1e6, 1.0)
    # scripted openings: the Rammer's wall (ram -> sein)
    for (x, y) in [(-82.0, -260.0), (-82.0, -258.0), (-82.0, -262.0)]:
        i, j = int((g["y1"] - y) / g["R"]), int((x - g["x0"]) / g["R"])
        cost[i - 6:i + 7, j - 6:j + 7] = 1.0


    def cell(x, y):
        i, j = int((g["y1"] - y) / g["R"]), int((x - g["x0"]) / g["R"])
        if blocked[i, j]:  # snap to the nearest open cell
            ii, jj = np.nonzero(~blocked[max(0, i - 25):i + 26, max(0, j - 25):j + 26])
            k = np.argmin((ii - 25) ** 2 + (jj - 25) ** 2)
            i, j = max(0, i - 25) + ii[k], max(0, j - 25) + jj[k]
        return (i, j)


    path, legs = [], []
    hx = vy = 0.0
    for (a, b) in zip(WAY, WAY[1:]):
        s, t = cell(a[0], a[1]), cell(b[0], b[1])
        m = MCP_Geometric(cost)
        m.find_costs([s], [t])
        tr = m.traceback(t)
        pts = [(g["x0"] + (j + 0.5) * g["R"], g["y1"] - (i + 0.5) * g["R"]) for i, j in tr]
        L = sum(math.hypot(p[0] - q[0], p[1] - q[1]) for p, q in zip(pts, pts[1:]))
        hx += sum(abs(p[0] - q[0]) for p, q in zip(pts, pts[1:]))
        vy += sum(abs(p[1] - q[1]) for p, q in zip(pts, pts[1:]))
        through_rock = sum(1 for i, j in tr if blocked[i, j])
        legs.append({"from": a[2], "to": b[2], "px": round(L * PX), "cellsThroughRock": through_rock})
        path += pts[::10]
    route = [{"at": P(x, y), "event": e} for x, y, e in WAY]
    total = sum(l["px"] for l in legs)

    # ---------------------------------------------------------------- the file
    hero = {
        "box": [round(0.68 * PX), round(1.15 * PX)], "boxNative": [0.68, 1.15],
        "boxSrc": "files: seinCharacter prefab (resources.assets) CapsuleCollider radius 0.34, height 1.15",
        "run": round(11.6666 * PX), "runNative": 11.6666,
        "runSrc": "files: seinCharacter/abilities/leftRightMovement CharacterLeftRightMovement.Settings.Ground.MaxSpeed 11.6666 (air the same; ground accel 60, decel 30 u/s^2)",
        "jump": round(3.0 * PX), "jumpNative": 3.0,
        "jumpSrc": "files: SeinJump prefab FirstJumpHeight 3, SecondJumpHeight 3, ThirdJumpHeight 3 (the code defaults 3.75 / 4.5 are overridden); gravity 26 u/s^2 (CharacterGravity), max fall 32 u/s",
        "wallJump": "files: SeinWallJump JumpStrength (6, 12) u/s; wall slide max fall 12 u/s",
        "health": "3 life cells (SeinHealthController MaxHealth 12 = 4 per cell). A hit costs ceil(damage / 4) cells (SeinDamageReciever, normal difficulty)",
        "energy": "0 energy cells at the start",
        "attack": "Spirit Flame (files): 2 damage a hit (standardSpiritFlameLevelA), combos of 3 shots 0.2 s apart, 0.5 s cooldown after a full combo, 0.3 s after a broken one; auto-targets within 12 u (SeinStandardSpiritFlameAbility.SpiritFlameRange 12 in the prefab; the code default is 8)",
        "startAbilities": ["run", "jump (3 u = 140 px; no chained-jump bonus in the prefab)", "crouch", "swim (the Glades water is polluted: WaterZone damage 4 a tick in the shallow pools, 20 = lethal in the deep ones, until the Ginso Tree)",
                           "Soul Link: place a save anywhere for 1 energy (needs energy cell 1, ~minute 2)"],
        "abilityOrder": [
            {"ability": "Spirit Flame (Sein)", "where": "Sein's hollow, the west end of the ram tunnel", "roomId": "sein", "minuteGuess": 4},
            {"ability": "Wall Jump", "where": "Fil's Ancestral Tree, the bottom-left hollow", "roomId": "walljump", "minuteGuess": 15},
            {"ability": "Charge Flame (next area)", "where": "Ancestral Tree below the Spirit Tree, reached from the Hollow Grove", "roomId": "attic", "minuteGuess": 40},
        ],
    }
    area = {
        "game": "Ori and the Blind Forest: Definitive Edition",
        "area": "Sunken Glades with the Spirit Caverns, from the start through the Wall Jump tree to the Spirit Tree and the way out to the Hollow Grove",
        "sources": [
            "files: the Windows depot of Ori DE (app 387290, depot 387291; Unity 5.3.2f1), read with UnityPy: 17 gameplay scenes + 5 dependent art scenes (scene bounds from each SceneRoot's SceneMetaData; colliders, placeholders and MonoBehaviour fields from the level files; hero and Spirit Flame from resources.assets)",
            "mined (kept): the randomizer's location names (sparkle-preference/ori_rando_server bf-areas.ori) for the pickup ids and what each pickup needs from later areas",
            "estimate: the order of play and the minutes (walkthroughs, as before)",
        ],
        "units": {"native": "unity units (y up in the game; here y down)", "pxPerUnit": round(PX, 3), "viewNative": [41.06, 23.09],
                  "how": "files: CameraController.FieldOfView 60 (prefab) and DefaultZoom 20 (CameraOffsetController prefab and every Glades scene's SceneSettingsComponent.DefaultCameraZoom) => view height 2*20*tan(30) = 23.09 u, width 41.06 u at 16:9 = 1920 px. Zones zoom to 18-21 u in a few spots (CameraOffsetAnimationZone)",
                  "originNative": [OX, OY]},
        "hero": hero,
        "rooms": rooms,
        "terrain": terrain,
        "things": things,
        "enemies": enemies,
        "criticalPath": crit,
        "criticalRoute": route,
        "criticalRoutePath": [P(x, y) for x, y in path],
        "criticalRouteLegs": legs,
        "criticalRouteTravel": {"px": total, "horizontalPx": round(hx * PX), "verticalPx": round(vy * PX),
                                "how": "shortest path through the open space of the collider terrain (rock grown by 0.2 u), waypoint to waypoint; it ignores gravity, so it is a lower bound on the walk"},
        "firstPlayMinutes": {"criticalPath": 33, "full100": 70, "note": "guesses (walkthroughs); the Glades are revisited later for the pickups that need later skills"},
        "notExtracted": ["the order of play and the minutes (no playthrough data in the files)",
                         "which later ability each pickup needs (kept from the randomizer logic, not re-derived from the colliders)",
                         "spirit light dropped by the thorn plants and the orb plants (prefab loot tables)",
                         "hazard damage of the swinging spike logs (physics props; their DamageDealer lives on prefabs)"],
    }
    import re
    txt = json.dumps(area, indent=1)
    txt = re.sub(r"\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]", r"[\1, \2]", txt)  # points on one line
    txt = re.sub(r"\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]", r"[\1, \2, \3, \4]", txt)  # rects
    open(OUTF, "w").write(txt + "\n")
    print("rooms", len(rooms), "things", len(things), "enemies", len(enemies), "terrain", len(terrain), "route px", total,
          "h/v", round(hx * PX), round(vy * PX), "secret boxes", len(SECRET_BOXES))
    for l in legs:
        if l["cellsThroughRock"]:
            print("  leg through rock:", l)


# ---------------------------------------------------------------- analyse
def cmd_analyse(argv):
    """Numbers for the README from area.json. usage: analyse.py <area.json>"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import json, sys, math, collections
    A = json.load(open(sys.argv[1])); PX = A["units"]["pxPerUnit"]; SCR = 1920 * 1080
    R = {r["id"]: r for r in A["rooms"]}
    print("rooms", len(R), "screens(exact)", round(sum(r["screens"] for r in A["rooms"]), 1), "bbox screens", round(sum(r["rect"][2] * r["rect"][3] for r in A["rooms"]) / SCR, 1))
    crit = set(A["criticalPath"])
    print("crit rooms", len(crit), "crit screens", round(sum(R[c]["screens"] for c in crit), 1))
    print("shapes", collections.Counter(r["shape"] for r in A["rooms"]))
    ex = {r["id"]: [e for e in r["exits"] if e["to"] in R] for r in A["rooms"]}
    exo = {r["id"]: [e for e in r["exits"] if e["to"] not in R] for r in A["rooms"]}
    print("exits per room (inside the area)", {k: len(v) for k, v in ex.items()}, "mean", round(sum(len(v) for v in ex.values()) / len(R), 2),
          "with outside", round(sum(len(r["exits"]) for r in A["rooms"]) / len(R), 2))
    nb = {k: {e["to"] for e in v} for k, v in ex.items()}
    print("neighbours", {k: len(v) for k, v in nb.items()})
    for k, v in nb.items():
        if len(v) == 1:
            print("  dead end", k, [t["value"] for t in A["things"] if t["roomId"] == k and t["kind"] in ("pickup-major", "pickup-minor", "save")], "outside exits", [e["to"] for e in exo[k]])
    E = len({tuple(sorted((a, b))) for a in nb for b in nb[a]}); print("graph E", E, "V", len(R), "loops", E - len(R) + 1)
    # enemies
    er = collections.Counter(e["roomId"] for e in A["enemies"])
    print("enemies", len(A["enemies"]), "per screen", round(len(A["enemies"]) / sum(r["screens"] for r in A["rooms"]), 2))
    mob = [e for e in A["enemies"] if not e.get("invulnerable")]
    print("killable", len(mob))
    critE = sum(er[c] for c in crit); print("on crit rooms", critE, "per crit screen", round(critE / sum(R[c]["screens"] for c in crit), 2))
    print("no-enemy rooms", [k for k in R if er[k] == 0], len([k for k in R if er[k] == 0]), "/", len(R))
    dens = sorted(((er[k] / R[k]["screens"], k, er[k]) for k in R), reverse=True); print("densest", [(round(a, 2), b, c) for a, b, c in dens[:5]])
    print("by room", dict(er))
    kinds = collections.defaultdict(list)
    for e in A["enemies"]:
        kinds[e["kind"]].append(e)
    for k, v in kinds.items():
        print(f"  {k}: {len(v)}  hp {sorted(set(e.get('hp') for e in v), key=lambda x: x or 0)} dmg {sorted(set(e['contactDamage'] for e in v))} cells {sorted(set(e['contactCells'] for e in v))} rooms {collections.Counter(e['roomId'] for e in v)}")
    print("difficulty", collections.Counter(e["difficulty"] for e in A["enemies"]), "mean", round(sum(e["difficulty"] for e in A["enemies"]) / len(A["enemies"]), 2))
    # things
    tk = collections.Counter((t["kind"], t["value"].split(" (")[0].split(":")[0]) for t in A["things"])
    for k, v in sorted(tk.items()): print("  thing", k, v)
    scr = sum(r["screens"] for r in A["rooms"])
    pk = [t for t in A["things"] if t["kind"].startswith("pickup")]
    print("pickups", len(pk), "per screen", round(len(pk) / scr, 2), "hidden", sum(1 for t in pk if t.get("hidden")))
    # route
    path = A["criticalRoutePath"]
    cum = [0]
    for p, q in zip(path, path[1:]): cum.append(cum[-1] + math.hypot(p[0] - q[0], p[1] - q[1]))
    def nearest(pt):
        best = min(range(len(path)), key=lambda i: math.hypot(path[i][0] - pt[0], path[i][1] - pt[1]))
        return best, math.hypot(path[best][0] - pt[0], path[best][1] - pt[1])
    print("route", A["criticalRouteTravel"])
    for t in pk:
        if t.get("hidden"):
            i, d = nearest(t["at"]); print(f"  secret {t['id']:28} {t['value'][:30]:30} room {t['roomId']:10} off route {round(d)} px ({d/1920:.2f} vw) | {t['hidden']['how'][:90]}")
    for t in A["things"]:
        if t["kind"] == "save":
            i, d = nearest(t["at"]); print("  save", t["id"], "route px", round(cum[i]), "off", round(d))
    # longest stretch with nothing within 6 u
    pts = [t["at"] for t in A["things"] if t["kind"] != "landmark"] + [e["at"] for e in A["enemies"]]
    R6 = 6 * PX
    busy = [any(math.hypot(p[0] - q[0], p[1] - q[1]) < R6 for q in pts) for p in path]
    best = cur = 0; start = bs = 0
    for i in range(1, len(path)):
        if not busy[i]:
            if busy[i - 1]: start = i
            cur = cum[i] - cum[start]
            if cur > best: best, bs = cur, start
    print("longest empty stretch px", round(best), "from", path[bs])
    for label, flt in (("pickups+enemies only", lambda t: t["kind"].startswith("pickup") or t["kind"] == "save"),):
        pts2 = [t["at"] for t in A["things"] if flt(t)] + [e["at"] for e in A["enemies"]]
        busy2 = [any(math.hypot(p[0] - q[0], p[1] - q[1]) < R6 for q in pts2) for p in path]
        best2 = 0; st2 = 0; bs2 = 0
        for i in range(1, len(path)):
            if not busy2[i]:
                if busy2[i - 1]: st2 = i
                if cum[i] - cum[st2] > best2: best2, bs2 = cum[i] - cum[st2], st2
        print("longest empty stretch", label, round(best2), "px from", path[bs2], "to", path[min(len(path)-1, bs2 + int(best2 // 20))])
    # majors per crit / dead ends
    print("majors by room", collections.Counter(t["roomId"] for t in A["things"] if t["kind"] == "pickup-major"))
    # reachability by stage
    def reach(open_gate):
        seen = {"wake"}; st = ["wake"]
        while st:
            k = st.pop()
            for e in ex[k]:
                if e["to"] in seen: continue
                if e.get("oneWay") is None and False: pass
                if open_gate(e.get("gate")):
                    seen.add(e["to"]); st.append(e["to"])
        return seen
    def stage(n):
        def f(g):
            if g is None: return True
            if g.startswith("breakable: the Rammer"): return True
            if n >= 1 and (g.startswith("breakable: thorn") or g.startswith("key: 2")): return True
            if n >= 2 and (g.startswith("ability: Wall Jump") or g.startswith("key: 4")): return True
            return False
        return f
    for n, name in ((0, "start"), (1, "+Spirit Flame"), (2, "+Wall Jump")):
        s = reach(stage(n)); print(name, len(s), "rooms", round(sum(R[k]["screens"] for k in s), 1), "screens", sum(1 for t in pk if t["roomId"] in s), "pickups in them,", sum(1 for t in pk if t["roomId"] in s and not t.get("needs")), "with no later-skill needs", sorted(s))
    # vertical vs horizontal
    tr = A["criticalRouteTravel"]; print("v:h", round(tr["verticalPx"] / tr["horizontalPx"], 2))
    # hero to screen
    print("hero", A["hero"]["box"], A["hero"]["run"], A["hero"]["jump"])


# ---------------------------------------------------------------- textures
def cmd_textures(argv):
    """List (and optionally export) Texture2D used by the area's scenes. usage: textures.py <Data> <levels,...> [outdir names-file]"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import sys, os, json, collections, UnityPy
    DATA, LV = sys.argv[1], [int(x) for x in sys.argv[2].split(",")]
    rows = {}
    for idx in LV:
        env0 = UnityPy.load(os.path.join(DATA, f"level{idx}"))
        ext = [os.path.basename(e.path) for e in list(env0.objects)[0].assets_file.externals]
        files = [f"level{idx}", f"sharedassets{idx}.assets"]
        for f in files:
            p = os.path.join(DATA, f)
            if not os.path.exists(p): continue
            env = UnityPy.load(p)
            for o in env.objects:
                if o.type.name == "Texture2D":
                    d = o.read()
                    rows[(f, o.path_id)] = (d.m_Name, d.m_Width, d.m_Height, idx)
    json.dump([[k[0], k[1], *v] for k, v in rows.items()], open(sys.argv[3], "w"))
    c = collections.Counter()
    for k, v in sorted(rows.items(), key=lambda kv: -kv[1][1] * kv[1][2])[:120]:
        print(k[0], k[1], v)


# ---------------------------------------------------------------- texexport
def cmd_texexport(argv):
    """Export the area's environment atlases (thumbnails + full size). usage: texexport.py <Data> <textures.json> <outdir> <name-regex>"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import sys, os, json, re, UnityPy
    DATA, TJ, OUT, RX = sys.argv[1:5]
    rows = json.load(open(TJ))
    want = [r for r in rows if re.search(RX, r[2])]
    byfile = {}
    for r in want: byfile.setdefault(r[0], []).append(r)
    for f, rs in byfile.items():
        env = UnityPy.load(os.path.join(DATA, f))
        ids = {r[1] for r in rs}
        for o in env.objects:
            if o.path_id in ids and o.type.name == "Texture2D":
                d = o.read()
                im = d.image
                im.save(os.path.join(OUT, f"{d.m_Name}.png"))
                print(d.m_Name, im.size, flush=True)


# ---------------------------------------------------------------- refs_textures
def cmd_refs_textures(argv):
    """Key and copy chosen atlases to the look-reference folder. usage: refs_tex.py <tex dir> <out dir>"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import sys, os, numpy as np
    from PIL import Image
    SRC, OUT = sys.argv[1:3]
    os.makedirs(OUT, exist_ok=True)
    names = [f"sunkenGladesTexturesUberScreenAtlas{i}" for i in range(0, 57, 2)] + \
            [f"spiritTreeTexturesUberScreenAtlas{i}" for i in (0, 1, 2, 3, 5, 6, 7, 9, 11, 13)] + ["sunkenGladesTexturesAtlas0"]
    for n in names[:40]:
        p = os.path.join(SRC, n + ".png")
        if not os.path.exists(p):
            print("missing", n); continue
        t = np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32) / 255
        if "UberScreen" in n:  # chroma-keyed pages: red, green and blue backgrounds -> transparent
            leans = [np.clip(t[..., k] - np.maximum(t[..., (k + 1) % 3], t[..., (k + 2) % 3]), 0, 1) for k in range(3)]
            a = np.clip(1 - 1.5 * np.maximum(np.maximum(leans[0], leans[1]), leans[2]), 0, 1)
            t = np.dstack([t[..., :3], a])
        im = Image.fromarray((t * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(OUT, n + ".png"))
    print(len(os.listdir(OUT)))


# ---------------------------------------------------------------- render
def cmd_render(argv):
    """Assemble a look-reference render of one spot from the scene's art meshes (approximate: no lighting, fog, post
    effects or animated shaders). The UberScreen atlases are chroma-keyed (material keyword SCREEN_RED/GREEN/BLUE).
    usage: render.py <oriDE_Data> <out.png> <cx> <cy> <level,level,...> [width=1920]"""
    _s = __import__("sys")
    _s.argv = [_s.argv[0]] + argv
    import math, os, struct, sys
    import numpy as np
    import UnityPy
    from UnityPy.helpers.MeshHelper import MeshHandler

    DATA, OUT = sys.argv[1], sys.argv[2]
    CX, CY = float(sys.argv[3]), float(sys.argv[4])
    LEVELS = [int(x) for x in sys.argv[5].split(",")]
    W = int(sys.argv[6]) if len(sys.argv) > 6 else 1920
    H = W * 9 // 16
    DIST = 20.0
    VIEW_W = 2 * DIST * math.tan(math.radians(30)) * 16 / 9
    PXU = W / VIEW_W


    def quat_mat(q):
        x, y, z, w = q.x, q.y, q.z, q.w
        return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


    import re
    SKIPNAME = re.compile(r"fog|mist|haze|smoke|gradient|shaft|flare|text|letter|vignette|blur|dust|darken|overlay|target|icon|placeholder", re.I)
    tex_cache = {}


    def texture(o):
        k = (o.assets_file.name, o.path_id)
        if k not in tex_cache:
            im = o.read().image.convert("RGBA")
            tex_cache[k] = np.asarray(im, dtype=np.float32)[::-1] / 255.0  # flip: uv origin bottom-left
        return tex_cache[k]


    def keyed(t, key):
        """chroma key: alpha from how far a pixel leans to the key primary; despill the colour. Textures without alpha
        (DXT1) and no keyword are keyed on whichever primary each pixel leans to."""
        if key is None:
            leans = [np.clip(t[..., k] - np.maximum(t[..., (k + 1) % 3], t[..., (k + 2) % 3]), 0, 1) for k in range(3)]
            lean = np.maximum(np.maximum(leans[0], leans[1]), leans[2])
            a = np.clip(1 - 1.5 * lean, 0, 1)
            rgb = t[..., :3].copy()
            for k in range(3):
                o = [(k + 1) % 3, (k + 2) % 3]
                rgb[..., k] = np.minimum(rgb[..., k], np.maximum(rgb[..., o[0]], rgb[..., o[1]]) + 0.15)
            return np.dstack([rgb, a * t[..., 3]])
        o = [c for c in range(3) if c != key]
        lean = np.clip(t[..., key] - np.maximum(t[..., o[0]], t[..., o[1]]), 0, 1)
        a = np.clip(1 - 1.5 * lean, 0, 1) * t[..., 3]
        rgb = t[..., :3].copy()
        rgb[..., key] = np.minimum(rgb[..., key], np.maximum(rgb[..., o[0]], rgb[..., o[1]]))
        return np.dstack([rgb, a])


    items = []
    for idx in LEVELS:
        lv = os.path.join(DATA, f"level{idx}")
        env0 = UnityPy.load(lv)
        ext = [os.path.basename(e.path) for e in list(env0.objects)[0].assets_file.externals]
        env = UnityPy.load(lv, *[os.path.join(DATA, f) for f in ext if os.path.exists(os.path.join(DATA, f))])
        allobj = {(os.path.basename(o.assets_file.name), o.path_id): o for o in env.objects}
        LV = f"level{idx}"
        objs = {pid: o for (fn, pid), o in allobj.items() if fn == LV}
        afile = {os.path.basename(o.assets_file.name): o.assets_file for o in env.objects}

        def deref(fid, pid, frm=LV):
            if fid == 0:
                return allobj.get((frm, pid))
            ex = afile[frm].externals
            return allobj.get((os.path.basename(ex[fid - 1].path), pid)) if fid - 1 < len(ex) else None

        tr, gos = {}, {}
        for pid, o in objs.items():
            if o.type.name == "Transform":
                tr[pid] = o.read()
            elif o.type.name == "GameObject":
                gos[pid] = o.read()
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

        parent = {}
        for pid, d in tr.items():
            f = d.m_Father.path_id
            if f and f in tr:
                parent[d.m_GameObject.path_id] = tr[f].m_GameObject.path_id

        def active(gid):
            while gid in parent:
                if not gos[gid].m_IsActive:
                    return False
                gid = parent[gid]
            return True

        for gid, g in gos.items():
            comps = {}
            tp = None
            for c in g.m_Component:
                cp = c[1] if isinstance(c, (tuple, list)) else c
                co = objs.get(cp.path_id)
                if co is None:
                    continue
                if co.type.name == "Transform":
                    tp = cp.path_id
                comps[co.type.name] = co
            if "MeshRenderer" not in comps or "MeshFilter" not in comps or tp is None or not active(gid):
                continue
            # leave out what a flat render cannot show: blurred / reflected copies, UI, map, depth-only layers, fog cards,
            # light shafts and on-screen text
            if g.m_Layer in (5, 8, 14, 20, 22, 25, 27, 28, 29) or SKIPNAME.search(g.m_Name):
                continue
            M = world(tp)
            if abs(M[0, 3] - CX) > 120 or abs(M[1, 3] - CY) > 80:
                continue
            try:
                rd = comps["MeshRenderer"].read_typetree()
                if not rd.get("m_Enabled", 1) or not rd["m_Materials"]:
                    continue
                mp = rd["m_Materials"][0]
                mo = deref(mp["m_FileID"], mp["m_PathID"])
                if mo is None:
                    continue
                md = mo.read_typetree()
                props = md["m_SavedProperties"]
                texs = {x[0]["name"]: x[1] for x in props["m_TexEnvs"]}
                cols = {x[0]["name"]: x[1] for x in props["m_Colors"]}
                flts = {x[0]["name"]: x[1] for x in props["m_Floats"]}
                if "_MainTex" not in texs or not texs["_MainTex"]["m_Texture"]["m_PathID"]:
                    continue
                tpp = texs["_MainTex"]["m_Texture"]
                to = deref(tpp["m_FileID"], tpp["m_PathID"], os.path.basename(mo.assets_file.name))
                if to is None or to.type.name != "Texture2D":
                    continue
                kw = md.get("m_ShaderKeywords", "")
                key = 0 if "SCREEN_RED" in kw else 1 if "SCREEN_GREEN" in kw else 2 if "SCREEN_BLUE" in kw else None
                mf = comps["MeshFilter"].read_typetree()["m_Mesh"]
                mesh = deref(mf["m_FileID"], mf["m_PathID"])
                if mesh is None:
                    continue
                mh = MeshHandler(mesh.read())
                mh.process()
                v = np.array(mh.m_Vertices, dtype=float).reshape(-1, 3)
                uv = np.array(mh.m_UV0, dtype=float).reshape(-1, 2) if mh.m_UV0 else None
                if uv is None or len(uv) != len(v):
                    continue
                vc = np.array(mh.m_Colors, dtype=float).reshape(-1, 4) if mh.m_Colors else None
                if vc is not None and vc.max() > 1.5:
                    vc = vc / 255.0  # colours stored as bytes
                tri = np.array([t for s in mh.get_triangles() for t in s], dtype=int).reshape(-1, 3)
                wv = (np.c_[v, np.ones(len(v))] @ M.T)[:, :3]
                atlas = cols.get("_MainTex_US_ATLAS")
                if atlas and (atlas["b"] > 0 or atlas["a"] > 0):
                    uv = np.c_[atlas["r"] + uv[:, 0] * atlas["b"], atlas["g"] + uv[:, 1] * atlas["a"]]
                col = cols.get("_Color", {"r": 1, "g": 1, "b": 1, "a": 1})
                add = flts.get("_UberShaderBlendModeDst", 10) == 1
                items.append({"name": g.m_Name, "layer": g.m_Layer, "z": float(wv[:, 2].mean()), "wv": wv, "uv": uv, "vc": vc, "tri": tri, "to": to, "key": key,
                              "col": np.array([col["r"], col["g"], col["b"], col["a"]]), "add": add})
            except Exception as e:
                continue
    print(len(items), "meshes")
    if os.environ.get("DIAG"):
        def area(it):
            z = it["wv"][:, 2]
            s_ = DIST / np.maximum(z + DIST, 0.5)
            sx = (it["wv"][:, 0] - CX) * s_ * PXU; sy = (it["wv"][:, 1] - CY) * s_ * PXU
            return (min(sx.max(), W / 2) - max(sx.min(), -W / 2)) * (min(sy.max(), H / 2) - max(sy.min(), -H / 2))
        for it in sorted(items, key=area, reverse=True)[:25]:
            print(round(area(it) / (W * H), 2), it["name"], it["layer"], round(it["z"], 1), it["add"], it["col"].round(2))

    img = np.zeros((H, W, 3), np.float32)
    img[:] = (0.05, 0.07, 0.09)
    items.sort(key=lambda it: -it["z"])
    keyed_cache = {}
    for it in items:
        z = it["wv"][:, 2]
        if (z <= -DIST + 0.5).any() or (os.environ.get("NOFG") and z.mean() < -float(os.environ["NOFG"])):
            continue
        s = DIST / (z + DIST)
        sx = W / 2 + (it["wv"][:, 0] - CX) * s * PXU
        sy = H / 2 - (it["wv"][:, 1] - CY) * s * PXU
        if sx.max() < 0 or sx.min() > W or sy.max() < 0 or sy.min() > H:
            continue
        kk = (it["to"].assets_file.name, it["to"].path_id, it["key"])
        if kk not in keyed_cache:
            keyed_cache[kk] = keyed(texture(it["to"]), None)  # key every primary: atlas pages mix red, green and blue keys
        T = keyed_cache[kk]
        th, tw = T.shape[:2]
        tu = it["uv"][:, 0] % 1.0001 * (tw - 1)
        tv = it["uv"][:, 1] % 1.0001 * (th - 1)
        tint = it["col"]
        for a, b, c in it["tri"]:
            xs = np.array([sx[a], sx[b], sx[c]]); ys = np.array([sy[a], sy[b], sy[c]])
            x0, x1 = max(0, int(xs.min())), min(W - 1, int(xs.max()) + 1)
            y0, y1 = max(0, int(ys.min())), min(H - 1, int(ys.max()) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(den) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
            l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
            l2 = 1 - l0 - l1
            m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
            if not m.any():
                continue
            u = (l0 * tu[a] + l1 * tu[b] + l2 * tu[c])[m].astype(int).clip(0, tw - 1)
            w_ = (l0 * tv[a] + l1 * tv[b] + l2 * tv[c])[m].astype(int).clip(0, th - 1)
            px = T[w_, u]
            rgb = px[:, :3] * tint[:3] * (2.0 if tint[3] <= 0.51 and tint[3] >= 0.49 else 1.0)
            al = px[:, 3] * (tint[3] if not (0.49 <= tint[3] <= 0.51) else 1.0)
            if it["vc"] is not None:
                vcc = it["vc"]
                vca = (l0 * vcc[a, 3] + l1 * vcc[b, 3] + l2 * vcc[c, 3])[m]
                vcr = np.stack([(l0 * vcc[a, k] + l1 * vcc[b, k] + l2 * vcc[c, k])[m] for k in range(3)], 1)
                rgb = rgb * vcr
                al = al * vca
            yy, xx = np.nonzero(m)
            yy += y0; xx += x0
            if it["add"]:
                img[yy, xx] += rgb * al[:, None]
            else:
                img[yy, xx] = img[yy, xx] * (1 - al[:, None]) + rgb * al[:, None]
    from PIL import Image
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    if len(sys.argv) < 2 or "cmd_" + sys.argv[1] not in globals():
        print(__doc__)
        sys.exit(1)
    globals()["cmd_" + sys.argv[1]](sys.argv[2:])
