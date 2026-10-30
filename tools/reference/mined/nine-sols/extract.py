"""Nine Sols first area, extracted from the installed game (Mac build, Unity 2022.3.62f3, Mono). Scripts only: no game
data is kept in the repo. Work in a scratch dir outside the game folder; run with python -I; never write to the install.

usage: python -I extract.py <step> <args...>
  unpack   <Data/data.unity3d> <raw dir>                 unpack the player bundle's inner files (scenes = levelN)
  dump     <raw dir> <Managed dir> <dump dir> level8,level9,level15,level54,level55
                                                         every GameObject: world transform, colliders, sprites,
                                                         tilemaps, selected MonoBehaviour fields (+ monster stats)
  classify <dump dir> <ent dir> <levels>                 terrain / things / enemies / props in Unity units
  camzones <dump dir> <ent dir> <levels>                 the designers' camera zones (CamBound groups)
  render   <ent/levelN.json> <out.png> [px per unit] [rooms.json]   collider render for drawing rooms
  build    <dump dir> <ent dir> <old area.json> <out area.json>     area.json in our px (rooms are hand-drawn here)
  stats    <area.json>                                   the level-design numbers in EXTRACTED.md
  look     <raw dir> <levelN> <out dir> <prefix> <n sprites> [name:cx:cy[:zoom] ...]   look references
Scenes: level8 A1_S1_HumanDisposal_Final (AFM), level9 A1_S2_ConnectionToElevator_Final (AFE), level15
A2_S6_LogisticCenter_Final (CTH), level54 AG_S1_SenateHall (CH), level55 AG_S2_YiBase (FSP).
Needs: pip install UnityPy TypeTreeGeneratorAPI Pillow numpy. See docs/design/reference-levels/nine-sols/EXTRACTED.md.
"""
import sys


def step_unpack():
    import sys, os, UnityPy
    env=UnityPy.load(sys.argv[1]); out=sys.argv[2]
    b=list(env.files.values())[0]
    for name,f in b.files.items():
        p=os.path.join(out,name.replace('/','__'))
        if hasattr(f,'save'):
            data=f.save() if not hasattr(f,'bytes') else None
        try:
            r=f.reader if hasattr(f,'reader') else f
            r.Position=0
            data=r.bytes
        except Exception as e:
            data=f.save()
        open(p,'wb').write(data)
    print('done',len(b.files))



def step_dump():
    import json, math, os, sys, time
    import numpy as np
    import UnityPy
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

    RAW, MANAGED, OUT, WANT = sys.argv[1:5]
    os.makedirs(OUT, exist_ok=True)

    # MonoBehaviours whose fields we keep (others: class name only)
    KEEP = {
        'MonsterCore', 'StealthGameMonster', 'Health', 'MonsterBase', 'SceneConnectionPoint', 'GameLevel', 'SavePoint',
        'DebrisBreakable', 'BreakableGlass', 'LootSpawner', 'LootProvider', 'DropItem', 'DropPickable', 'ItemProvider',
        'PickItemAction', 'HiddenPathTrigger', 'DangerZoneNoSafeGround', 'DamageDealer', 'TrapWithoutTeleportProvider',
        'HackInteraction', 'WoodDoor', 'MovePlatformBase', 'MonsterPoolObjectWrapper', 'ChangeSceneTrigger',
        'GameLevelBoundaryHelper', 'GameLevel_LocalBoundary_Helper', 'CameraBoundWalls', 'LevelMapViewer', 'Chest',
        'TreasureChest', 'LootChest', 'InteractableArea', 'GeneralInteraction', 'MonsterStat', 'EffectDealer',
        'ProCamera2D', 'ProCamera2DNumericBoundaries', 'PlayerSensor', 'Elevator', 'ElevatorController',
        'RespawnRule', 'MonsterInitPreset', 'LevelDesign_WanderingGroup', 'EngagingToken', 'ScannableFinder',
        'SceneConnections', 'DummyPlayerAutoReplacePlayer', 'MapNameTrigger', 'PushAwayWall', 'PathArea',
    }
    KEEP_SUB = ('Chest', 'Loot', 'Treasure', 'Pickable', 'Item', 'Save', 'Trap', 'Spike', 'Laser', 'Hazard', 'Danger',
                'Elevator', 'Door', 'Breakable', 'Boss', 'Monster', 'Hack', 'Hidden', 'Secret', 'Lever', 'Switch',
                'Connection', 'Teleport', 'Platform', 'Rope', 'Grapple', 'Hook', 'Climb', 'Jade', 'Money', 'Shop',
                'Npc', 'NPC', 'Lore', 'Database', 'Scroll')
    SKIP = {'MonsterStateGroup', 'MonsterStateSequenceWeight', 'MonsterStateGroupSequence', 'MonsterDeadState',
            'MonsterHurtInterrupt', 'MonsterKnockbackSetting', 'MonsterDecreasePostureReceiver', 'MonsterFollowBehavior',
            'MonsterEngagingArea', 'MonsterJumpEnterState', 'MonsterBehaviourToolHelper', 'MonsterPushAway',
            'MonsterHitWallOrOnCliff', 'BossGeneralState', 'BossPhaseChangeState'}

    ggm = UnityPy.load(os.path.join(RAW, 'globalgamemanagers'))
    scenes, ver = [], None
    for o in ggm.objects:
        if o.type.name == 'BuildSettings':
            scenes = list(o.read().scenes)
            ver = o.assets_file.unity_version
    gen = TypeTreeGenerator(ver)
    gen.load_local_dll_folder(MANAGED)


    def quat_mat(q):
        x, y, z, w = q.x, q.y, q.z, q.w
        return np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


    def scal(v, depth=0):
        if isinstance(v, (int, float, str, bool)) or v is None:
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return None
            if isinstance(v, float):
                return round(v, 4)
            return v
        if isinstance(v, dict):
            if depth > 3:
                return None
            if set(v.keys()) >= {'m_FileID', 'm_PathID'}:
                return {'pptr': [v['m_FileID'], v['m_PathID']]} if v['m_PathID'] else None
            d = {}
            for k, x in v.items():
                s = scal(x, depth + 1)
                if s is not None and s != {} and s != []:
                    d[k] = s
            return d
        if isinstance(v, (list, tuple)):
            if len(v) > 60 or depth > 3:
                return {'len': len(v)}
            return [s for s in (scal(x, depth + 1) for x in v) if s is not None]
        return None


    for lvl in WANT.split(','):
        t0 = time.time()
        idx = int(lvl.replace('level', ''))
        sc = scenes[idx]
        env = UnityPy.load(os.path.join(RAW, lvl), os.path.join(RAW, 'globalgamemanagers.assets'),
                           os.path.join(RAW, 'resources.assets'))
        byname = {os.path.basename(k): f for k, f in env.files.items()}
        sf_level = byname[lvl]

        def resolve(pp):
            # pp: typetree pptr dict -> (file, object reader) or None
            fid, pid = pp.get('m_FileID', 0), pp.get('m_PathID', 0)
            if not pid:
                return None
            f = sf_level if fid == 0 else byname.get(os.path.basename(sf_level.externals[fid - 1].path))
            if f is None:
                return None
            return f.objects.get(pid)

        def deref_fields(tt):
            out = {}
            for key in ('_monsterStat', 'flag', 'pickItemData', 'overrideHealthStat', 'dropTable', 'statData'):
                v = tt.get(key)
                if isinstance(v, dict) and v.get('m_PathID'):
                    ob = resolve(v)
                    if ob is None:
                        continue
                    try:
                        d2 = ob.read_typetree()
                        out[key] = {k: scal(x) for k, x in d2.items() if isinstance(x, (int, float, str)) or
                                    (isinstance(x, dict) and ('BaseValue' in x or 'mTerm' in x))}
                    except Exception as e:
                        out[key] = {'err': str(e)[:80]}
            for key in ('additionalDropItems',):
                v = tt.get(key)
                if isinstance(v, list):
                    names = []
                    for pp in v:
                        ob = resolve(pp) if isinstance(pp, dict) else None
                        if ob is not None:
                            try:
                                gg = ob.read(check_read=False)
                                names.append(getattr(gg, 'm_Name', None) or ob.type.name)
                            except Exception:
                                names.append('?')
                    out[key + '_names'] = names
            return out
        env.typetree_generator = gen
        objs = {o.path_id: o for o in env.objects if o.assets_file.name == lvl}
        tr, gos = {}, {}
        for pid, o in objs.items():
            if o.type.name in ('Transform', 'RectTransform'):
                tr[pid] = o.read()
            elif o.type.name == 'GameObject':
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

        def gpath(gid):
            n = []
            while gid:
                n.append(gos[gid].m_Name if gid in gos else '?')
                gid = parent_go.get(gid)
            return '/'.join(reversed(n))

        def active_h(gid):
            while gid:
                if gid in gos and not gos[gid].m_IsActive:
                    return False
                gid = parent_go.get(gid)
            return True

        script_cache = {}

        def script_name(co):
            env.typetree_generator = None
            try:
                mb = co.read(check_read=False)
            finally:
                env.typetree_generator = gen
            sp = mb.m_Script
            k = (sp.file_id, sp.path_id)
            if k not in script_cache:
                try:
                    s = sp.deref_parse_as_object(co.assets_file)
                    script_cache[k] = s.m_ClassName
                except Exception:
                    script_cache[k] = '?'
            return script_cache[k], bool(getattr(mb, 'm_Enabled', True))

        out, tilemaps = [], []
        for gid, g in gos.items():
            tp = go_tr.get(gid)
            M = world(tp) if tp else np.eye(4)
            rec = {'id': gid, 'name': g.m_Name, 'path': gpath(gid), 'layer': g.m_Layer, 'active': bool(g.m_IsActive),
                   'activeH': active_h(gid),
                   'pos': [round(float(M[0, 3]), 3), round(float(M[1, 3]), 3), round(float(M[2, 3]), 3)],
                   'sx': round(float(np.linalg.norm(M[:3, 0])) * (1 if M[0, 0] >= 0 else -1), 3),
                   'sy': round(float(np.linalg.norm(M[:3, 1])), 3),
                   'comps': [], 'col': [], 'mono': {}}

            def W(x, y):
                v = M @ np.array([x, y, 0, 1.0])
                return [round(float(v[0]), 3), round(float(v[1]), 3)]

            for c in g.m_Component:
                cp = c.component if hasattr(c, 'component') else c
                co = objs.get(cp.path_id)
                if co is None:
                    continue
                t = co.type.name
                if t in ('Transform', 'RectTransform'):
                    continue
                try:
                    if t in ('BoxCollider2D', 'PolygonCollider2D', 'EdgeCollider2D', 'CircleCollider2D',
                             'CompositeCollider2D', 'CapsuleCollider2D'):
                        d = co.read()
                        cd = {'t': t, 'trig': bool(d.m_IsTrigger), 'en': bool(d.m_Enabled),
                              'comp': bool(getattr(d, 'm_UsedByComposite', False)),
                              'eff': bool(getattr(d, 'm_UsedByEffector', False))}
                        off = d.m_Offset
                        if t == 'BoxCollider2D':
                            sx, sy = d.m_Size.x / 2, d.m_Size.y / 2
                            cd['pts'] = [W(off.x - sx, off.y - sy), W(off.x + sx, off.y - sy), W(off.x + sx, off.y + sy),
                                         W(off.x - sx, off.y + sy)]
                        elif t == 'CapsuleCollider2D':
                            sx, sy = d.m_Size.x / 2, d.m_Size.y / 2
                            cd['pts'] = [W(off.x - sx, off.y - sy), W(off.x + sx, off.y - sy), W(off.x + sx, off.y + sy),
                                         W(off.x - sx, off.y + sy)]
                        elif t == 'PolygonCollider2D':
                            cd['paths'] = [[W(p.x + off.x, p.y + off.y) for p in pth] for pth in d.m_Points.m_Paths]
                        elif t == 'EdgeCollider2D':
                            cd['pts'] = [W(p.x + off.x, p.y + off.y) for p in d.m_Points]
                        elif t == 'CompositeCollider2D':
                            cd['paths'] = [[W(p.x + off.x, p.y + off.y) for p in pth] for pth in d.m_CompositePaths.m_Paths]
                            cd['geom'] = int(d.m_GeometryType)
                        else:
                            cd['c'] = W(off.x, off.y)
                            cd['r'] = round(d.m_Radius * abs(rec['sx']), 3)
                        rec['col'].append(cd)
                        rec['comps'].append(t)
                    elif t == 'MonoBehaviour':
                        name, en = script_name(co)
                        rec['comps'].append(name if en else name + '(off)')
                        if name not in SKIP and (name in KEEP or any(s in name for s in KEEP_SUB)):
                            try:
                                tt = co.read_typetree()
                                rec['mono'][name] = scal({k: v for k, v in tt.items()
                                                          if k not in ('m_GameObject', 'm_Script', 'm_Name')})
                                rec['mono'][name].update(deref_fields(tt))
                            except Exception as e:
                                rec['mono'][name] = {'err': str(e)[:120]}
                    elif t == 'SpriteRenderer':
                        d = co.read()
                        sr = {'en': bool(d.m_Enabled), 'layer': d.m_SortingLayerID, 'order': d.m_SortingOrder,
                              'sprite': [d.m_Sprite.file_id, d.m_Sprite.path_id],
                              'color': [round(d.m_Color.r, 3), round(d.m_Color.g, 3), round(d.m_Color.b, 3),
                                        round(d.m_Color.a, 3)],
                              'flip': [bool(d.m_FlipX), bool(d.m_FlipY)], 'draw': int(d.m_DrawMode),
                              'size': [round(d.m_Size.x, 3), round(d.m_Size.y, 3)],
                              'm': [round(float(x), 5) for x in M[:2, :2].flatten()] + [round(float(M[0, 3]), 4),
                                                                                       round(float(M[1, 3]), 4),
                                                                                       round(float(M[2, 3]), 4)]}
                        rec['sr'] = sr
                        rec['comps'].append(t)
                    elif t == 'Tilemap':
                        d = co.read_typetree()
                        cells = [[int(k['first']['x']), int(k['first']['y'])] if isinstance(k, dict) else None
                                 for k in []]
                        tiles = d.get('m_Tiles') or []
                        cells = []
                        for kv in tiles:
                            k = kv[0] if isinstance(kv, (list, tuple)) else kv.get('first')
                            cells.append([int(k['x']), int(k['y'])])
                        tilemaps.append({'go': gid, 'path': rec['path'], 'layer': g.m_Layer,
                                         'cell': [d['m_TileAnchor']['x'], d['m_TileAnchor']['y']],
                                         'm': [round(float(x), 5) for x in M[:2, :2].flatten()] +
                                              [round(float(M[0, 3]), 4), round(float(M[1, 3]), 4)],
                                         'cells': cells})
                        rec['comps'].append(t)
                    elif t == 'Grid':
                        dd = co.read_typetree()
                        rec['grid'] = scal(dd.get('m_CellSize'))
                        rec['comps'].append(t)
                    elif t == 'Camera':
                        d = co.read()
                        dd = co.read_typetree()
                        rec['cam'] = {'ortho': bool(dd.get('orthographic')), 'size': dd.get('orthographic size'),
                                      'fov': dd.get('field of view'), 'near': dd.get('near clip plane'),
                                      'en': bool(dd.get('m_Enabled'))}
                        rec['comps'].append(t)
                    else:
                        rec['comps'].append(t)
                except Exception as e:
                    rec['comps'].append(f'{t}!err:{str(e)[:80]}')
            out.append(rec)
        json.dump({'scene': sc, 'level': lvl, 'objects': out, 'tilemaps': tilemaps},
                  open(os.path.join(OUT, f'{lvl}.json'), 'w'))
        print(sc, lvl, len(out), 'objects', len(tilemaps), 'tilemaps', round(time.time() - t0, 1), 's', flush=True)



def step_classify():
    import json, os, re, sys, collections

    DUMP, OUT, WANT = sys.argv[1:4]
    os.makedirs(OUT, exist_ok=True)
    SOLID, ONEWAY, ONEWAYSLOPE, TRAP, WALLRUN, WATER = 8, 9, 10, 6, 23, 4


    def base(n):
        return re.sub(r' ?\(\d+\)', '', n).strip()


    def bbox(pts):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return [min(xs), min(ys), max(xs), max(ys)]


    def box_poly(b):
        return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]


    def merge_boxes(boxes, tol=1.0):
        """merge axis-aligned boxes that touch along x (same y span), then along y (same x span)"""
        bs = [list(b) for b in boxes]
        for axis in (0, 1):
            changed = True
            while changed:
                changed = False
                bs.sort(key=lambda b: (b[1 - axis], b[3 - axis], b[axis]))
                out = []
                for b in bs:
                    if out:
                        a = out[-1]
                        same = abs(a[1 - axis] - b[1 - axis]) < tol and abs(a[3 - axis] - b[3 - axis]) < tol
                        if same and b[axis] <= a[axis + 2] + tol:
                            a[axis + 2] = max(a[axis + 2], b[axis + 2]); changed = True; continue
                    out.append(b)
                bs = out
        return bs


    def col_polys(o, c):
        if 'paths' in c:
            return c['paths']
        if 'pts' in c:
            return [c['pts']]
        if 'c' in c:
            x, y = c['c']; r = c['r']
            return [box_poly([x - r, y - r, x + r, y + r])]
        return []


    for lvl in WANT.split(','):
        d = json.load(open(os.path.join(DUMP, f'{lvl}.json')))
        O = d['objects']
        by_path = {o['path']: o for o in O}
        scene = d['scene'].split('/')[-1].replace('.unity', '')
        res = {'scene': scene, 'level': lvl, 'terrain': [], 'things': [], 'enemies': [], 'props': [], 'notes': []}

        def anc_names(o):
            p = o['path'].split('/')
            return p[:-1]

        def under(o, pat):
            return any(re.search(pat, n) for n in anc_names(o))

        # scene rect
        for o in O:
            if 'GameLevel' in o['mono']:
                g = o['mono']['GameLevel']
                res['sceneRect'] = g['SceneRectangle']; res['cameraRange'] = g['TheoryCameraRange']
                res['blocks'] = [g['BlockCountX'], g['BlockCountY']]

        # ---- terrain
        trap_boxes, water = [], []
        for o in O:
            if not o['activeH']:
                continue
            for c in o['col']:
                if not c['en']:
                    continue
                L = o['layer']
                is_trap = 'Trap' in o['comps'] or 'TrapDamageArea' in o['name']
                if is_trap:
                    for p in col_polys(o, c):
                        trap_boxes.append(bbox(p))
                    continue
                if c['t'] == 'CompositeCollider2D':
                    kind = {SOLID: 'solid', ONEWAY: 'oneway', ONEWAYSLOPE: 'oneway', WALLRUN: 'climbable'}.get(L)
                    if kind:
                        for p in c['paths']:
                            res['terrain'].append({'kind': kind, 'poly': p, 'src': 'tilemap'})
                    continue
                if c['comp']:
                    continue
                if 'BuoyancyEffector2D' in o['comps'] or L == WATER and c['trig']:
                    for p in col_polys(o, c):
                        res['terrain'].append({'kind': 'water', 'poly': p, 'src': o['name']})
                    continue
                if c['trig']:
                    continue
                if L in (SOLID, ONEWAY, ONEWAYSLOPE):
                    kind = 'solid' if L == SOLID else 'oneway'
                    if re.search('BreakableWall', o['path']):
                        kind = 'breakable'
                    elif re.search('(?i)door|gate', o['path']) and L == SOLID:
                        kind = 'door'
                    for p in col_polys(o, c):
                        res['terrain'].append({'kind': kind, 'poly': p, 'src': base(o['name']),
                                               'moving': bool(re.search('(?i)elevator|platform|move|bridge', o['path']))})
        for b in merge_boxes(trap_boxes):
            res['terrain'].append({'kind': 'hazard', 'poly': box_poly(b), 'src': 'Trap'})
        # hidden-path covers (areas masked until you enter)
        for o in O:
            if 'HiddenPathTrigger' in o['comps']:
                for c in o['col']:
                    for p in col_polys(o, c):
                        res['terrain'].append({'kind': 'secretWall', 'poly': p, 'src': 'HiddenPathTrigger:' + o['name'],
                                               'active': o['activeH']})
        # scene connections
        for o in O:
            if 'SceneConnectionPoint' in o['mono'] and '[CutScene]' not in o['path']:
                s = o['mono']['SceneConnectionPoint']
                polys = [col_polys(o, c) for c in o['col']]
                res['things'].append({'kind': 'door', 'at': o['pos'][:2], 'to': (s.get('scene') or {}).get('m_SceneName'),
                                      'id': s.get('connectionID'), 'active': o['activeH'], 'name': o['path'].split('/')[-2] + '/' + o['name'],
                                      'boxes': [bbox(p) for ps in polys for p in ps]})

        # ---- enemies
        for o in O:
            if 'MonsterPoolObjectWrapper' not in o['comps']:
                continue
            cls = next((k for k in o['mono'] if k.endswith('Monster') or k == 'MonsterBase'), None)
            m = o['mono'].get(cls, {}) if cls else {}
            st = m.get('_monsterStat', {})
            rr = o['mono'].get('RespawnRule', {})
            res['enemies'].append({'name': base(o['name']), 'cls': cls, 'at': o['pos'][:2], 'active': o['activeH'],
                                   'stat': st.get('m_Name'), 'hp': st.get('BaseHealthValue'),
                                   'atk': st.get('BaseAttackValue'), 'nameTag': (st.get('monsterName') or {}).get('mTerm'),
                                   'respawnType': rr.get('respawnType'), 'path': o['path']})

        # ---- things
        seen_chest_roots = set()
        for o in O:
            n, p = o['name'], o['path']
            if 'SavePoint' in o['comps']:
                res['things'].append({'kind': 'save', 'at': o['pos'][:2], 'name': n, 'active': o['activeH']})
            elif n == 'Interact_TreasureBox':
                root = p.rsplit('/', 1)[0]
                seen_chest_roots.add(root)
                label = next((x for x in reversed(p.split('/')) if re.search('Treasure|錢|金|寶箱|玉|元件', x) and x != n), '')
                res['things'].append({'kind': 'chest', 'at': o['pos'][:2], 'name': label, 'active': o['activeH'], 'path': p})
            elif n.startswith('Interact_StatueChest'):
                res['things'].append({'kind': 'statueChest', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
            elif 'LootProvider' in o['comps'] or 'DropPickable' in o['comps']:
                m = o['mono'].get('DropPickable', {})
                flag = (m.get('flag') or {}).get('m_Name')
                names = o['mono'].get('LootProvider', {}).get('additionalDropItems_names')
                res['things'].append({'kind': 'loot', 'at': o['pos'][:2], 'name': n, 'flag': flag, 'drops': names,
                                      'active': o['activeH'], 'path': p})
            elif n.startswith('Interact_') or 'HackInteraction' in o['comps']:
                res['things'].append({'kind': 'interact', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
            elif re.match('ElevatorSet', n):
                res['things'].append({'kind': 'lift', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
            elif re.search('PotionRecharge', n):
                res['things'].append({'kind': 'heal', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
            elif re.search('(?i)^(npc|[^/]*_npc)', n) and not under(o, '(?i)npc'):
                res['things'].append({'kind': 'npc', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
            elif re.match('BR_', n) and not re.search('Treasure', n):
                res['props'].append({'at': o['pos'][:2], 'name': base(n), 'active': o['activeH']})
            elif re.search('BreakableWall', n) and not under(o, 'BreakableWall'):
                res['things'].append({'kind': 'breakableWall', 'at': o['pos'][:2], 'name': n, 'active': o['activeH'], 'path': p})
        for o in O:
            if o['path'].endswith('/IssueList') or '/IssueList/' in o['path'] and o['path'].count('/') <= 3:
                if o['name'] != 'IssueList':
                    res['notes'].append({'at': o['pos'][:2], 'note': o['name']})

        json.dump(res, open(os.path.join(OUT, f'{lvl}.json'), 'w'))
        tk = collections.Counter(t['kind'] for t in res['terrain'])
        th = collections.Counter(t['kind'] for t in res['things'])
        en = collections.Counter((e['name'], e['active']) for e in res['enemies'])
        print(scene, res.get('sceneRect'), dict(tk), dict(th), 'enemies', len(res['enemies']), 'props', len(res['props']),
              'notes', len(res['notes']))



def step_camzones():
    import json, sys, os, re
    D, E, W = sys.argv[1:4]
    for lvl in W.split(','):
        d = json.load(open(os.path.join(D, lvl + '.json')))
        kids = {}
        for o in d['objects']:
            if '/' not in o['path']: continue
            par, nm = o['path'].rsplit('/', 1)
            kids.setdefault(par, {})[nm] = o
        zones = []
        for par, ch in kids.items():
            if all(k in ch for k in ('top', 'bottom', 'left', 'right')) and '[CutScene]' not in par:
                vb = kids.get(par + '/ViewBound', {})
                z = {'name': par.split('/', 1)[1], 'active': ch['top']['activeH'],
                     'trig': [ch['left']['pos'][0], ch['bottom']['pos'][1], ch['right']['pos'][0], ch['top']['pos'][1]]}
                if all(k + '_Bound' in vb for k in ('top', 'bottom', 'left', 'right')):
                    z['view'] = [vb['left_Bound']['pos'][0], vb['bottom_Bound']['pos'][1], vb['right_Bound']['pos'][0],
                                 vb['top_Bound']['pos'][1]]
                    z['viewUse'] = {k: vb[k + '_Bound']['activeH'] for k in ('top', 'bottom', 'left', 'right')}
                zones.append(z)
        ep = os.path.join(E, lvl + '.json'); e = json.load(open(ep)); e['camZones'] = zones; json.dump(e, open(ep, 'w'))
        print(lvl, len(zones))



def step_build():
    import json, math, os, re, sys, collections
    from PIL import Image, ImageDraw

    DUMP, ENT, OLD, OUTP = sys.argv[1:5]
    K = 1920 / (2 * 240 * math.tan(math.radians(34)) * 16 / 9)  # our px per Unity unit (view width 1920)
    A_OLD = 3.5  # old mined px per Unity unit (fitted, see EXTRACTED.md)
    CELL = 16  # tile size in units
    SCREEN = 1920 * 1080

    # Per scene: level file, key, and the placement fitted to the earlier world-map layout
    # (old_px = 3.5*u_x + b, old_py = -3.5*u_y + c; fitted on saves, chests and doors).
    SCENES = {
        'AFM': ('level8', 22756, 9550), 'AFE': ('level9', 26726, 11990), 'CH': ('level54', 19220, -5250),
        'FSP': ('level55', 26924, -12503), 'CTH': ('level15', 21430, -1560),
    }
    # Rooms in Unity units [x0, y0(bottom), x1, y1(top)], drawn by hand on the collider renders.
    ROOMS = [
        ('afm-entry', 'AFM', 'Monitoring: entry corridor and first root node', [-6512, -2816, -4672, -2528], 'corridor'),
        ('afm-upper', 'AFM', 'Monitoring: cell blocks, laser dip, Hibiscus console', [-4672, -2896, -3088, -2528], 'hall'),
        ('afm-east', 'AFM', 'Monitoring: east cells, ladders and stairs (Blade Commander, first chest)', [-3088, -3104, -720, -2432], 'hall'),
        ('afm-switchback', 'AFM', 'Monitoring: lower-east switchbacks (spearmen)', [-3088, -3552, -720, -3104], 'hall'),
        ('afm-cliff', 'AFM', 'Monitoring: cliff band (spearman ambush, breakable wall, shortcut lift)', [-4000, -3264, -3088, -2896], 'hall'),
        ('afm-vent', 'AFM', 'Monitoring: hidden vent pocket (chest)', [-4256, -3264, -4000, -2896], 'pocket'),
        ('afm-descent', 'AFM', 'Monitoring: descent rooms (Bolt Warriors, key item drop)', [-4000, -3904, -3088, -3264], 'shaft'),
        ('afm-exit', 'AFM', 'Monitoring: exit corridor', [-3088, -3984, -1216, -3552], 'corridor'),
        ('afe-entry', 'AFE', 'Elevator: upper entry and root node 1', [-1760, -3456, -304, -2960], 'corridor'),
        ('afe-gauntlet', 'AFE', 'Elevator: locked-arena gauntlet', [-304, -3456, 1040, -2960], 'setpiece'),
        ('afe-pagoda', 'AFE', 'Elevator: east hall under the pagoda roof (roof chests)', [1040, -3456, 2112, -2960], 'hall'),
        ('afe-lift', 'AFE', 'Elevator: east lift shaft', [2112, -3936, 2432, -3200], 'shaft'),
        ('afe-middle', 'AFE', 'Elevator: middle hall (floating blocks, drones)', [-1008, -4000, 2112, -3456], 'hall'),
        ('afe-west', 'AFE', 'Elevator: west lift shaft (hidden chest)', [-1760, -4640, -1008, -3456], 'shaft'),
        ('afe-lower', 'AFE', 'Elevator: lower hall, root node 2, electrified floor', [-1008, -4640, 1600, -4000], 'hall'),
        ('afe-baichang', 'AFE', 'Elevator: Baichang arena and heal machine', [1600, -4640, 2976, -4192], 'arena'),
        ('afe-bottom', 'AFE', 'Elevator: bottom-left (statue chest, spike floor, exit to the Depths)', [-1760, -4912, -512, -4640], 'corridor'),
        ('ch-west', 'CH', 'Central Hall: west wing (exit to Cortex Center)', [0, -5072, 1168, -4720], 'hall'),
        ('ch-council', 'CH', 'Central Hall: council rooms', [1168, -4896, 2336, -4592], 'hall'),
        ('ch-statue', 'CH', 'Central Hall: great statue hall', [2336, -4896, 3360, -4048], 'setpiece'),
        ('ch-memorial', 'CH', 'Central Hall: domed hall and the Pavilion door', [3360, -5024, 4512, -4624], 'hall'),
        ('ch-east', 'CH', 'Central Hall: east stairs (exits to Lake Yaochi and the Transport Hub)', [4512, -5056, 5472, -4576], 'hall'),
        ('ch-lower-west', 'CH', 'Central Hall: lower west (statue chest, Blade Commander)', [96, -5504, 1904, -5072], 'corridor'),
        ('ch-elevator', 'CH', 'Central Hall: elevator shaft down to the Transport Hub', [1904, -5584, 2160, -4896], 'shaft'),
        ('ch-lower-east', 'CH', 'Central Hall: lower east (Maul Corporal, spike pits)', [2160, -5504, 4608, -5008], 'corridor'),
        ('fsp-entry', 'FSP', 'Pavilion: entrance', [1712, -5136, 2560, -4448], 'corridor'),
        ('fsp-hall', 'FSP', 'Pavilion: main hall (root node, Shuanshuan, Ruyi, Lear)', [2560, -5136, 5632, -4048], 'hub'),
        ('fsp-east', 'FSP', 'Pavilion: east lab (Mystic Nymph room)', [5632, -5136, 7088, -4304], 'hall'),
        ('cth-entry', 'CTH', 'Transport Hub: entry corridor from Central Hall', [5000, -4416, 5968, -4160], 'corridor'),
        ('cth-shaft', 'CTH', 'Transport Hub: great lift shaft (ambush ride)', [5968, -7296, 6432, -4096], 'shaft'),
        ('cth-alcove', 'CTH', 'Transport Hub: alcove beside the shaft (chest, Blade Commander)', [6432, -6816, 6752, -6592], 'pocket'),
        ('cth-drop', 'CTH', 'Transport Hub: west drop (turrets, traps, console door)', [5168, -7296, 5968, -6560], 'hall'),
        ('cth-west-wing', 'CTH', 'Transport Hub: lower-left vents and moving platforms', [4560, -8096, 5600, -7296], 'hall'),
        ('cth-node', 'CTH', 'Transport Hub: root node and Anomalous Root Node (Tai-Chi Kick)', [5600, -8096, 6880, -7296], 'hall'),
        ('cth-east', 'CTH', 'Transport Hub: east hall (exits to the Research Center and the Laser Room)', [6432, -7296, 7904, -7008], 'hall'),
        ('cth-transporter', 'CTH', 'Transport Hub: transporter hall (to Power Reservoir East)', [6880, -8416, 7904, -7296], 'hall'),
        ('cth-bottom', 'CTH', 'Transport Hub: bottom corridor (shortcut door to Baichang, statue treasure)', [4320, -8416, 6880, -8096], 'corridor'),
        ('cth-elevator-west', 'CTH', 'Transport Hub: elevator drop from Central Hall and the west wing (exit to Galactic Dock)', [2928, -6896, 4096, -5232], 'hall'),
        ('cth-yanren', 'CTH', 'Transport Hub: Yanren arena', [4096, -6896, 5168, -6560], 'arena'),
    ]
    OLDMAP = {'afe-sw': 'afe-bottom'}
    CRIT = ['afm-entry', 'afm-upper', 'afm-east', 'afm-switchback', 'afm-cliff', 'afm-descent', 'afm-exit', 'afe-entry',
            'afe-gauntlet', 'afe-pagoda', 'afe-lift', 'afe-middle', 'afe-west', 'afe-lower', 'afe-baichang',
            'ch-elevator', 'ch-council', 'ch-statue', 'ch-memorial', 'fsp-entry', 'fsp-hall', 'fsp-east', 'fsp-hall',
            'fsp-entry', 'ch-memorial', 'ch-east', 'cth-entry', 'cth-shaft', 'cth-drop', 'cth-west-wing', 'cth-node']

    ENEMY = {  # prefab base name -> (wiki name, difficulty, why, behaviour)
        'StealthGameMonster_Minion': ('Blade Trooper', 2, 'parry teacher: one telegraphed 25-dmg slash'),
        'StealthGameMonster_Minion_Tutorial1': ('Blade Trooper', 1, 'tutorial dummy next to the first root node'),
        'StealthGameMonster_Minion_Tutorial2': ('Blade Trooper', 1, 'tutorial dummy (spawned by the tutorial)'),
        'StealthGameMonster_GunBoy': ('Bolt Warrior', 1, '72 HP, parryable 20-dmg bolts, backs off'),
        'StealthGameMonster_Spearman': ('Spear Vanguard', 3, 'rolls past Yi to stab from behind'),
        'StealthGameMonster_Minion_prefab_withShield': ('Armored Spear Vanguard', 3, 'front shield; parry or hit from behind'),
        'StealthGameMonster_SpearmanElite': ('Spear Vanguard elite', 4, '480 HP spear elite'),
        'StealthGameMonster_Elite': ('Blade Commander', 4, '400 HP, first crimson (unblockable) attack'),
        'StealthGameMonster_Sword Elite': ('Blade Commander', 4, '400 HP, crimson attacks'),
        'StealthGameMonster_FatGuy': ('Maul Corporal', 4, '800 HP heavy; knocks Yi down'),
        'StealthGameMonster_Samurai_General_Boss Variant': ('Red Tiger Elite: Baichang', 5, 'zone boss, 1160 HP'),
        'StealthMonster_GiantBlade_FireBlade': ('Red Tiger Elite: Yanren', 5, 'optional mini-boss, 1300 HP, fire trails'),
        'StealthGameMonster_Phoenix_AirDrone Dasher': ('Skycleaver Soldier', 2, 'flying dash-stab drone'),
        'StealthMonster_AirSpider_ReflectAndExplode': ('exploding air drone', 2, 'flies in, explodes; 40-dmg hit'),
        'GameMonster_AirTurrent_ReflectAndInstantKill': ('Swift Crossbow Cannon', 1, 'wall turret, parryable bolts'),
        'GameMonster_Turrent_Danger_Bullet': ('hackable turret', 2, 'turret with crimson (unparryable) shots'),
        'GameMonster_Turret_Danger_Bullet': ('hackable turret', 2, 'turret guarding a one-way door'),
        'TrapMonster_Robot_Crawler': ('crawler robot (trap monster)', 1, '60 HP; hack it to blow it up'),
        'TrapMonster_Mutant': ('broken robot (trap monster)', 1, '60 HP; hackable'),
        'TrapMonster_Mutant Mini': ('small broken robot (trap monster)', 1, '20 HP'),
        'TrapMonster_Broken Robot mini': ('small broken robot (trap monster)', 1, '20 HP'),
    }


    def wiki_name(n):
        n2 = re.sub(r' [一-鿿].*$', '', n).strip()
        for k in sorted(ENEMY, key=len, reverse=True):
            if n2 == k or n2.startswith(k):
                return ENEMY[k]
        return (n2, 2, 'unknown kind')


    old = json.load(open(OLD))
    ent = {k: json.load(open(os.path.join(ENT, v[0] + '.json'))) for k, v in SCENES.items()}
    dumps = {k: json.load(open(os.path.join(DUMP, v[0] + '.json'))) for k, v in SCENES.items()}


    def W(key, x, y):  # unity -> world units (y down)
        _, b, c = SCENES[key]
        return (x + b / A_OLD, -y + c / A_OLD)


    def to_old(key, x, y):
        _, b, c = SCENES[key]
        return (A_OLD * x + b, -A_OLD * y + c)


    # origin: top-left of all rooms
    allw = []
    for rid, key, name, r, shape in ROOMS:
        allw += [W(key, r[0], r[3]), W(key, r[2], r[1])]
    OX = min(p[0] for p in allw); OY = min(p[1] for p in allw)


    def PX(key, x, y):
        wx, wy = W(key, x, y)
        return [round((wx - OX) * K), round((wy - OY) * K)]


    # ---- rasters per scene: solid cells (tilemap composite, XOR-filled), 16-unit cells
    SUB = 4
    grids = {}
    for key, e in ent.items():
        r = e['sceneRect']
        gx0 = math.floor(r['x'] / CELL) * CELL; gy0 = math.floor(r['y'] / CELL) * CELL
        nx = math.ceil((r['x'] + r['width'] - gx0) / CELL); ny = math.ceil((r['y'] + r['height'] - gy0) / CELL)
        img = Image.new('L', (nx * SUB, ny * SUB), 0)
        for t in e['terrain']:
            if t['kind'] == 'solid' and t.get('src') == 'tilemap':
                m = Image.new('L', img.size, 0)
                ImageDraw.Draw(m).polygon([((p[0] - gx0) / CELL * SUB, (p[1] - gy0) / CELL * SUB) for p in t['poly']],
                                          fill=255)
                img = Image.fromarray(__import__('numpy').bitwise_xor(__import__('numpy').array(img), __import__('numpy').array(m)))
        small = img.resize((nx, ny), Image.BOX)
        import numpy as np
        solid = np.array(small) >= 128  # [row(y from gy0 upward), col]
        grids[key] = (gx0, gy0, nx, ny, solid)

    rooms_out, room_cells = [], {}
    for rid, key, name, r, shape in ROOMS:
        gx0, gy0, nx, ny, solid = grids[key]
        c0 = (r[0] - gx0) // CELL; c1 = (r[2] - gx0) // CELL; r0 = (r[1] - gy0) // CELL; r1 = (r[3] - gy0) // CELL
        c0, c1 = max(0, c0), min(nx, c1); r0, r1 = max(0, r0), min(ny, r1)
        room_cells[rid] = (key, c0, c1, r0, r1)
        air = int((~solid[r0:r1, c0:c1]).sum())
        tl = PX(key, r[0], r[3]); br = PX(key, r[2], r[1])
        w, h = br[0] - tl[0], br[1] - tl[1]
        rooms_out.append({'id': rid, 'scene': dumps[key]['scene'].split('/')[-1].replace('.unity', ''), 'name': name,
                          'rect': [tl[0], tl[1], w, h], 'screens': round(w * h / SCREEN, 2),
                          'filledScreens': round(air * (CELL * K) ** 2 / SCREEN, 2), 'shape': shape,
                          'onCriticalPath': rid in CRIT, 'exits': [], 'unity': r})

    byid = {r['id']: r for r in rooms_out}


    def room_at(key, x, y, scene_only=True):
        best, bd = None, 1e18
        for rid, k2, name, r, shape in ROOMS:
            if k2 != key:
                continue
            dx = max(r[0] - x, 0, x - r[2]); dy = max(r[1] - y, 0, y - r[3])
            dd = dx * dx + dy * dy
            if dd < bd:
                best, bd = rid, dd
        return best


    # ---- terrain
    terrain = []


    def add_rects(rid, key, rects_units, kind, **kw):
        for (x0, y0, x1, y1) in rects_units:
            a = PX(key, x0, y1); b = PX(key, x1, y0)
            terrain.append({'roomId': rid, 'kind': kind, 'poly': [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]],
                            **kw})


    for rid, (key, c0, c1, r0, r1) in room_cells.items():
        gx0, gy0, nx, ny, solid = grids[key]
        runs = {}
        for row in range(r0, r1):
            col = c0
            while col < c1:
                if solid[row, col]:
                    s = col
                    while col < c1 and solid[row, col]:
                        col += 1
                    runs.setdefault((s, col), []).append(row)
                else:
                    col += 1
        rects = []
        for (s, e2), rows in runs.items():
            rows.sort(); start = prev = rows[0]
            for rr in rows[1:] + [None]:
                if rr is not None and rr == prev + 1:
                    prev = rr; continue
                rects.append((gx0 + s * CELL, gy0 + start * CELL, gx0 + e2 * CELL, gy0 + (prev + 1) * CELL))
                if rr is not None:
                    start = prev = rr
        add_rects(rid, key, rects, 'solid', src='files: tilemap CompositeCollider2D (Solid layer), 16-unit cells')

    climbable = []
    for key, e in ent.items():
        for t in e['terrain']:
            xs = [p[0] for p in t['poly']]; ys = [p[1] for p in t['poly']]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            rid = room_at(key, cx, cy)
            r = byid[rid]['unity']
            inside = r[0] - 64 <= cx <= r[2] + 64 and r[1] - 64 <= cy <= r[3] + 64
            if t['kind'] == 'solid' and t.get('src') == 'tilemap':
                continue
            if not inside and t['kind'] != 'climbable':
                continue
            if t['kind'] == 'oneway':
                a = PX(key, min(xs), max(ys)); b = PX(key, max(xs), max(ys))
                # slopes keep their real ends
                if max(ys) - min(ys) > 20 and t.get('src') == 'tilemap':
                    p0 = min(t['poly'], key=lambda p: p[0]); p1 = max(t['poly'], key=lambda p: p[0])
                    a = PX(key, *p0); b = PX(key, *p1)
                terrain.append({'roomId': rid, 'kind': 'oneway', 'poly': [a, b], 'src': 'files: ' + t.get('src', '')})
            elif t['kind'] == 'climbable':
                if inside:
                    climbable.append({'roomId': rid, 'poly': [PX(key, *p) for p in t['poly']]})
            elif t['kind'] in ('hazard', 'water', 'breakable', 'secretWall', 'door', 'solid'):
                kind = t['kind']
                extra = {}
                if kind == 'solid' and t.get('moving'):
                    extra['moving'] = True
                if kind == 'secretWall':
                    extra['how'] = 'hidden-path cover: a foreground mask that hides the space until Yi enters it'
                terrain.append({'roomId': rid, 'kind': kind, 'poly': [PX(key, *p) for p in t['poly']],
                                'src': 'files: ' + str(t.get('src', '')), **extra})

    # ---- things: new objects, labelled from the old mined file by proximity
    oldthings = old['things']
    oldroom_scene = {r['id']: r['scene'] for r in old['rooms']}
    scene_key = {v: k for k, v in {'AFM': 'A1_S1_HumanDisposal_Final', 'AFE': 'A1_S2_ConnectionToElevator_Final',
                                   'CH': 'AG_S1_SenateHall', 'FSP': 'AG_S2', 'CTH': 'A2_S6_LogisticCenter_Final'}.items()}
    used_old = set()
    things = []


    def match_old(key, x, y, kinds, maxd=900):
        ox, oy = to_old(key, x, y)
        best, bd = None, maxd
        for t in oldthings:
            if t['id'] in used_old or t['kind'] not in kinds:
                continue
            if scene_key.get(oldroom_scene[t['roomId']]) != key:
                continue
            d = math.hypot(t['at'][0] - ox, t['at'][1] - oy)
            if d < bd:
                best, bd = t, d
        return best


    def covers(key):
        out = []
        for t in ent[key]['terrain']:
            if t['kind'] == 'secretWall':
                xs = [p[0] for p in t['poly']]; ys = [p[1] for p in t['poly']]
                out.append((min(xs), min(ys), max(xs), max(ys)))
        return out


    def jin_value(n):
        if '大' in n:
            return 'Jin chest (large)'
        if '中' in n:
            return 'Jin chest (medium)'
        if '小' in n:
            return 'Jin chest (small)'
        return 'Jin chest'


    seenpos = []
    for key, e in ent.items():
        cov = covers(key)
        for t in e['things']:
            x, y = t['at']
            if t['kind'] == 'door':
                continue
            if any(k2 == key and math.hypot(x - a, y - b) < 60 and kk in ('chest', 'loot', 'statueChest') and
                   t['kind'] in ('chest', 'loot', 'statueChest') and 'loot' in (kk, t['kind']) for (k2, a, b, kk) in seenpos):
                continue
            sr = e['sceneRect']
            if not (sr['x'] <= x <= sr['x'] + sr['width'] and sr['y'] <= y <= sr['y'] + sr['height']):
                continue
            if not t.get('active', True) and t['kind'] not in ('statueChest',):
                continue
            rid = room_at(key, x, y)
            kind, value, hidden, src = None, None, None, 'files'
            if t['kind'] == 'save':
                kind, value = 'save', 'Root Node'
                o = match_old(key, x, y, ('save',))
            elif t['kind'] == 'chest':
                n = t.get('name', '')
                kind, value = 'pickup-minor', jin_value(n)
                o = match_old(key, x, y, ('pickup-minor', 'pickup-major'), 1500)
                if o and o['kind'] == 'pickup-major':
                    kind = 'pickup-major'
            elif t['kind'] in ('loot', 'statueChest'):
                n = (t.get('name') or '') + ' ' + (t.get('path') or '')
                kind = 'pickup-major'
                if re.search('錢袋|大量金', n) and not re.search('玉|元件|文房', n):
                    kind, value = 'pickup-minor', 'Jin bag'
                o = match_old(key, x, y, ('pickup-major', 'pickup-minor', 'boss'))
                if o and o['kind'] == 'boss':
                    o = None
                value = value or {'刺蝟玉': 'Hedgehog Jade', '算力元件': 'Computing Unit', '文房四寶':
                                  'The Four Treasures of the Study', '定身玉': 'Stasis Jade',
                                  '大紅槿': 'Bloody Crimson Hibiscus'}.get(next((k for k in ['刺蝟玉', '算力元件', '文房四寶',
                                                                                  '定身玉', '大紅槿'] if k in n), ''), None)
                if t['kind'] == 'statueChest':
                    value = value or 'statue chest (opens after the council statues are solved)'
            elif t['kind'] == 'interact':
                kind = 'lever'; value = re.sub('^Interact_', '', t['name']).replace('_', ' ')
                if 'TreasureBox' in t['name']:
                    continue
                o = match_old(key, x, y, ('lever', 'shortcut'), 500)
            elif t['kind'] == 'lift':
                kind, value = 'shortcut', 'lift (moving platform)'
                o = match_old(key, x, y, ('shortcut', 'lever'), 700)
            elif t['kind'] == 'heal':
                kind, value = 'landmark', 'heal / pipe-refill machine'
                o = match_old(key, x, y, ('landmark',), 600)
            elif t['kind'] == 'npc':
                kind, value = 'npc', 'NPC'
                o = match_old(key, x, y, ('npc', 'shop'), 2500)
                value = 'NPC or talk point (unnamed in the files)'
            elif t['kind'] == 'breakableWall':
                kind, value = 'breakable', 'breakable wall'
                o = None
            else:
                continue
            if o:
                used_old.add(o['id'])
                value = o.get('value', value) if kind != 'pickup-minor' or 'Jin' not in (value or '') else value
                if o.get('hidden') and not o['hidden'].get('how', '').startswith('not hidden'):
                    hidden = o['hidden']
                if o['kind'] in ('npc', 'shop'):
                    kind = o['kind']
                src = 'files (position); mined (label: ' + o['id'] + ')'
            if any(c[0] - 8 <= x <= c[2] + 8 and c[1] - 8 <= y <= c[3] + 8 for c in cov) and kind.startswith('pickup'):
                hidden = dict(hidden or {})
                hidden['how'] = 'inside a hidden-path cover (looks like solid wall until entered)' + (
                    '; ' + hidden['how'] if hidden.get('how') and 'cover' not in hidden['how'] else '')
            th = {'id': f"{rid}-{kind}-{len(things)}", 'roomId': rid, 'kind': kind, 'at': PX(key, x, y), 'value': value,
                  'src': src}
            if hidden:
                th['hidden'] = hidden
            things.append(th)
            seenpos.append((key, x, y, t['kind']))

    # statues (parry / kick puzzles) from the monster list
    for key, e in ent.items():
        for m in e['enemies']:
            if 'Statue' in m['name']:
                x, y = m['at']
                o = match_old(key, x, y, ('lever',), 900)
                if o:
                    used_old.add(o['id'])
                v = 'council statue: parry it (Sword) or Tai-Chi Kick it (Spear), then hack' if not o else o['value']
                things.append({'id': f"{room_at(key, x, y)}-statue-{len(things)}", 'roomId': room_at(key, x, y),
                               'kind': 'lever', 'at': PX(key, x, y), 'value': v,
                               'src': 'files (position)' + ('; mined (label)' if o else ''),
                               **({} if m['active'] else {'note': 'inactive in the scene file (story state)'})})

    # old things not found in the files: keep, positions transformed from the mined map
    for t in oldthings:
        if t['id'] in used_old:
            continue
        nid = OLDMAP.get(t['roomId'], t['roomId'])
        key = scene_key[oldroom_scene[t['roomId']]]
        ux = (t['at'][0] - SCENES[key][1]) / A_OLD; uy = (SCENES[key][2] - t['at'][1]) / A_OLD
        rid = room_at(key, ux, uy)
        if t['kind'] == 'boss':  # snap to the boss enemy
            bo = [m for m in ent[key]['enemies'] if m['hp'] and m['hp'] >= 1000]
            if bo:
                ux, uy = min(bo, key=lambda m: math.hypot(m['at'][0] - ux, m['at'][1] - uy))['at']
                rid = room_at(key, ux, uy)
                things.append({**{k: v for k, v in t.items() if k not in ('at', 'roomId', 'src')}, 'roomId': rid,
                               'at': PX(key, ux, uy), 'src': 'files (position of the boss); mined (label)'})
                continue
        if t.get('hidden', {}).get('how', '').startswith('not hidden'):
            t = {k: v for k, v in t.items() if k != 'hidden'}
        things.append({**{k: v for k, v in t.items() if k not in ('at', 'roomId', 'src')}, 'roomId': rid,
                       'at': PX(key, ux, uy), 'src': 'mined (not matched to a scene object; position from the mined map, '
                       '+-200 px): ' + str(t.get('src', ''))})

    # ---- enemies
    enemies = []
    for key, e in ent.items():
        for m in e['enemies']:
            if 'Statue' in m['name'] or m['hp'] is None:
                continue
            x, y = m['at']
            kind, diff, why = wiki_name(m['name'])
            spawned = not m['active']
            beh = 'placed in the scene' if not spawned else 'spawned by an event (ambush, gauntlet or story); inactive in the scene file'
            enemies.append({'id': f"{room_at(key, x, y)}-{len(enemies)}", 'roomId': room_at(key, x, y), 'kind': kind,
                            'prefab': m['name'], 'at': PX(key, x, y), 'hp': m['hp'], 'contactDamage': 0,
                            'attack': f"base attack value {m['atk']:g}", 'behaviour': beh, 'spawned': spawned,
                            'respawns': m['respawnType'] == 0, 'difficulty': diff, 'difficultyWhy': why,
                            'src': f"files ({m['stat']}: BaseHealthValue, BaseAttackValue; position)"})

    # ---- exits: shared air across room borders (same scene), plus cross-scene links from the mined logic
    oldexits = {}
    for r in old['rooms']:
        for x in r['exits']:
            oldexits[(OLDMAP.get(r['id'], r['id']), OLDMAP.get(x['to'], x['to']))] = x
    for i, a in enumerate(ROOMS):
        for b in ROOMS[i + 1:]:
            if a[1] != b[1]:
                continue
            key = a[1]; gx0, gy0, nx, ny, solid = grids[key]
            ra, rb = a[3], b[3]
            crossings = []
            # vertical shared edge
            for (L, R, side) in ((ra, rb, 'right'), (rb, ra, 'left')):
                if abs(L[2] - R[0]) < 1:
                    yl, yh = max(L[1], R[1]), min(L[3], R[3])
                    col = int((L[2] - gx0) // CELL)
                    for yy in range(int(yl), int(yh), CELL):
                        row = int((yy - gy0) // CELL)
                        if 0 < col < nx and 0 <= row < ny and not solid[row, col - 1] and not solid[row, col]:
                            crossings.append((L[2], yy + 8, side if L is ra else ('left' if side == 'right' else 'right')))
            for (B, T, side) in ((ra, rb, 'top'), (rb, ra, 'bottom')):
                if abs(B[3] - T[1]) < 1:
                    xl, xh = max(B[0], T[0]), min(B[2], T[2])
                    row = int((B[3] - gy0) // CELL)
                    for xx in range(int(xl), int(xh), CELL):
                        col = int((xx - gx0) // CELL)
                        if 0 < row < ny and 0 <= col < nx and not solid[row - 1, col] and not solid[row, col]:
                            crossings.append((xx + 8, B[3], side if B is ra else ('bottom' if side == 'top' else 'top')))
            if len(crossings) >= 2:
                cx = sum(c[0] for c in crossings) / len(crossings); cy = sum(c[1] for c in crossings) / len(crossings)
                sa = collections.Counter(c[2] for c in crossings).most_common(1)[0][0]
                opp = {'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top'}[sa]
                for (frm, to, side) in ((a[0], b[0], sa), (b[0], a[0], opp)):
                    ex = {'to': to, 'side': side, 'at': PX(key, cx, cy), 'src': 'files (shared open border)'}
                    o = oldexits.get((frm, to))
                    if o:
                        for k in ('oneWay', 'gate'):
                            if k in o:
                                ex[k] = o[k]
                    byid[frm]['exits'].append(ex)
    # cross-scene and OUT exits: from the mined logic; 'at' from the scene's connection point when found
    conns = {k: [t for t in e['things'] if t['kind'] == 'door' and t['active']] for k, e in ent.items()}
    ROOMKEY = {r[0]: r[1] for r in ROOMS}
    for (frm, to), o in oldexits.items():
        if frm not in byid:
            continue
        if not to.startswith('OUT') and to in byid and ROOMKEY[to] == ROOMKEY[frm]:
            if not any(x['to'] == to for x in byid[frm]['exits']):
                ex = {'to': to, 'side': o['side'], 'src': 'mined (logic link not found as an open border)'}
                key = ROOMKEY[frm]; ux = (o['at'][0] - SCENES[key][1]) / A_OLD; uy = (SCENES[key][2] - o['at'][1]) / A_OLD
                ex['at'] = PX(key, ux, uy)
                for k in ('oneWay', 'gate'):
                    if k in o:
                        ex[k] = o[k]
                byid[frm]['exits'].append(ex)
            continue
        key = ROOMKEY[frm]
        r = byid[frm]['unity']
        near = [c for c in conns[key] if r[0] - 200 <= c['at'][0] <= r[2] + 200 and r[1] - 200 <= c['at'][1] <= r[3] + 200]
        ex = {'to': to, 'side': o['side']}
        for k in ('oneWay', 'gate'):
            if k in o:
                ex[k] = o[k]
        if near:
            c = min(near, key=lambda c: abs(c['at'][0] - (r[0] + r[2]) / 2))
            ex['at'] = PX(key, *c['at']); ex['src'] = f"files (connection point to {c['to']}); mined (link, gate)"
        else:
            ux = (o['at'][0] - SCENES[key][1]) / A_OLD; uy = (SCENES[key][2] - o['at'][1]) / A_OLD
            ex['at'] = PX(key, ux, uy); ex['src'] = 'mined'
        byid[frm]['exits'].append(ex)

    # ---- props (breakable decor) per room
    props = collections.Counter()
    for key, e in ent.items():
        for p in e['props']:
            if p['active']:
                props[room_at(key, *p['at'])] += 1

    for r in rooms_out:
        r.pop('unity')
        if props.get(r['id']):
            r['breakableProps'] = props[r['id']]

    hero = dict(old['hero'])
    hero.update({
        'box': [round(10 * K), round(30 * K)],
        'boxNote': "files: PPlayer BoxCollider2D 10 x 30 units (offset 0,15: feet at the origin) = 33 x 100 of our px; the sprite with ears is taller (~116 px)",
        'run': round(150 * K),
        'jump': round((255 * 0.1333 + 255 ** 2 / (2 * 830)) * K),
        'moveNote': "files (CatanaStat + MaxRun): MaxRun 150 u/s, RunAccel 650, JumpSpeed 255 u/s, VariableJumpTime 0.133 s, "
                    "Gravity 830, MaxFall 320 (fast fall 470), DashSpeed 300 u/s, WallRunSpeed 150, roll stamina 2. Jump height "
                    "= 255*0.133 + 255^2/(2*830) = 73 units = 244 px if the hold keeps full speed for the variable-jump time "
                    "(Celeste-style controller); about 39 units (131 px) on a tap. In our px: run 500 px/s, dash 1000 px/s.",
        'src': 'files (box, run, jump, gravity: resources.assets PPlayer, CatanaStat, MaxRun) / wiki (HP, damage) / '
               'mined (kit: randomizer) / estimate (minutes)',
    })
    vh = 2 * 240 * math.tan(math.radians(34))
    out = {
        'game': old['game'], 'area': old['area'], 'boundary': old['boundary'],
        'sources': ['files: the Mac build (Unity 2022.3.62f3, Mono). data.unity3d scenes level8 (A1_S1_HumanDisposal_Final), '
                    'level9 (A1_S2_ConnectionToElevator_Final), level15 (A2_S6_LogisticCenter_Final), level54 (AG_S1_SenateHall), '
                    'level55 (AG_S2_YiBase); resources.assets (PPlayer, CatanaStat, monster stats); read with UnityPy + '
                    'TypeTreeGeneratorAPI on Managed/*.dll (tools/reference/mined/nine-sols/extract.py)'] + old['sources'],
        'units': {'native': 'Unity units (1 tile = 16 units; positions in scene space)', 'pxPerUnit': round(K, 4),
                  'viewNative': [round(vh * 16 / 9, 1), round(vh, 1)],
                  'how': 'files: the gameplay SceneCamera is perspective, FOV 68 deg (vertical), 240 units in front of the play '
                         'plane (CameraCore z = -240; every CamBound trigger also sets FOV 68). Visible play plane = '
                         '2*240*tan(34 deg) = 323.8 units tall, 575.6 wide at 16:9, so 1920 px / 575.6 = 3.336 of our px per '
                         'unit. Cross-check: the earlier mined estimate (view = 200 map px; AFM 5888 units = 2067 map px) gives '
                         '570 units, 1% off. Scenes are placed as on the in-game world map: each scene shifted by an offset '
                         'fitted on saves, chests and doors against the mined map (+-50 px), with one scale for all scenes; '
                         'transitions between scenes are not physical distances.',
                  'tile': round(16 * K, 1)},
        'hero': hero, 'rooms': rooms_out, 'terrain': terrain, 'climbable': climbable, 'things': things,
        'enemies': enemies, 'criticalPath': CRIT, 'firstPlayMinutes': old['firstPlayMinutes'],
    }
    json.dump(out, open(OUTP, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('rooms', len(rooms_out), 'terrain', collections.Counter(t['kind'] for t in terrain), 'climbable', len(climbable))
    print('things', collections.Counter(t['kind'] for t in things), 'unmatched old', [t['id'] for t in oldthings if t['id'] not in used_old])
    print('enemies', len(enemies), 'placed', sum(not e['spawned'] for e in enemies))
    for r in rooms_out:
        print(f"{r['id']:18s} {r['screens']:6.2f} {r['filledScreens']:6.2f} exits {[x['to'] for x in r['exits']]}")



def step_look():
    import math, os, re, sys
    import numpy as np
    import UnityPy
    from PIL import Image

    RAW, LVL, OUT, PREFIX, NSPR = sys.argv[1:6]
    VIEWS = sys.argv[6:]
    os.makedirs(OUT, exist_ok=True)
    LAYERS = ['FxBackground', 'Background3', 'Background2', 'Background', 'DarksideColorFade', 'NPC', 'InteractionLayer',
              'ActorBack', 'Monster', 'Default', 'BlackCoverEffect', 'Effect', 'Foregound', 'Foregound2', 'MANGA', 'LightMask',
              'BubbleCamera']
    SKIP_LAYERS = {'DarksideColorFade', 'BlackCoverEffect', 'MANGA', 'LightMask', 'BubbleCamera', 'Effect'}
    CAMZ, HALFV = 240.0, math.tan(math.radians(34))

    ggm = UnityPy.load(os.path.join(RAW, 'globalgamemanagers'))
    layer_ids = {}
    for o in ggm.objects:
        if o.type.name == 'TagManager':
            for i, s in enumerate(o.read_typetree()['m_SortingLayers']):
                layer_ids[s['uniqueID']] = s['name']

    lvlenv = UnityPy.load(os.path.join(RAW, LVL))
    sf = list(lvlenv.files.values())[0]
    ext = [os.path.basename(e.path) for e in sf.externals]
    paths = [os.path.join(RAW, LVL)]
    for e in ext:
        for p in (e, e + '.resS'):
            if os.path.exists(os.path.join(RAW, p)):
                paths.append(os.path.join(RAW, p))
    env = UnityPy.load(*paths)
    files = {os.path.basename(k): f for k, f in env.files.items()}
    lvl = files[LVL]


    def deref(fid, pid):
        f = lvl if fid == 0 else files.get(ext[fid - 1])
        return None if f is None else f.objects.get(pid)


    sprite_cache = {}


    def sprite(fid, pid):
        k = (fid, pid)
        if k not in sprite_cache:
            try:
                ob = deref(fid, pid)
                s = ob.read()
                im = s.image.convert('RGBA')
                r = s.m_Rect
                sprite_cache[k] = (im, r.width, r.height, s.m_Pivot.x, s.m_Pivot.y, s.m_PixelsToUnits, s.m_Name)
            except Exception as e:
                sprite_cache[k] = None
        return sprite_cache[k]


    # transforms
    objs = {o.path_id: o for o in lvl.objects.values()}
    tr, gos = {}, {}
    for pid, o in objs.items():
        if o.type.name in ('Transform', 'RectTransform'):
            tr[pid] = o.read()
        elif o.type.name == 'GameObject':
            gos[pid] = o.read()
    go_tr = {d.m_GameObject.path_id: pid for pid, d in tr.items()}
    mat = {}


    def qm(q):
        x, y, z, w = q.x, q.y, q.z, q.w
        return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


    def world(pid):
        if pid in mat:
            return mat[pid]
        d = tr[pid]
        M = np.eye(4)
        M[:3, :3] = qm(d.m_LocalRotation) @ np.diag([d.m_LocalScale.x, d.m_LocalScale.y, d.m_LocalScale.z])
        M[:3, 3] = [d.m_LocalPosition.x, d.m_LocalPosition.y, d.m_LocalPosition.z]
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
        while gid:
            if gid in gos and not gos[gid].m_IsActive:
                return False
            gid = parent.get(gid)
        return True


    def gpath(gid):
        n = []
        while gid:
            n.append(gos[gid].m_Name if gid in gos else '?'); gid = parent.get(gid)
        return '/'.join(reversed(n))


    # collect drawables: (layerIdx, order, z, kind, data)
    draws = []
    for gid, g in gos.items():
        if not active(gid):
            continue
        p = None
        for c in g.m_Component:
            co = objs.get(c.component.path_id)
            if co is None:
                continue
            t = co.type.name
            if t not in ('SpriteRenderer', 'TilemapRenderer'):
                continue
            p = p or gpath(gid)
            if re.search(r'CameraCore|\[CutScene\]|LightMask|UI|Monster|Player|Fx|FX|Particle|Black|Cover|Mask|Hidden|黑', p):
                continue
            d = co.read()
            if not d.m_Enabled:
                continue
            lname = layer_ids.get(d.m_SortingLayerID, 'Default')
            if lname in SKIP_LAYERS:
                continue
            M = world(go_tr[gid])
            if M[2, 3] < -150:
                continue
            li = LAYERS.index(lname) if lname in LAYERS else 9
            if t == 'SpriteRenderer':
                if not d.m_Sprite.path_id:
                    continue
                col = (d.m_Color.r, d.m_Color.g, d.m_Color.b, d.m_Color.a)
                if col[3] < 0.02:
                    continue
                draws.append((li, d.m_SortingOrder, -M[2, 3], 'sr', (M, d.m_Sprite.file_id, d.m_Sprite.path_id, col,
                                                                      d.m_FlipX, d.m_FlipY, d.m_DrawMode, (d.m_Size.x, d.m_Size.y))))
            else:
                tmo = next((objs.get(c2.component.path_id) for c2 in g.m_Component
                            if objs.get(c2.component.path_id) is not None and objs[c2.component.path_id].type.name == 'Tilemap'), None)
                if tmo is None:
                    continue
                tt = tmo.read_typetree()
                draws.append((li, d.m_SortingOrder, -M[2, 3], 'tm', (M, tt)))
    draws.sort(key=lambda x: (x[0], x[1], x[2]))
    print(LVL, 'drawables', len(draws))


    def blit(canvas, im, quad):
        """draw RGBA image im with its (0,0),(w,0),(0,h) corners at screen points quad[0..2]"""
        (x0, y0), (x1, y1), (x2, y2) = quad
        x3, y3 = x1 + x2 - x0, y1 + y2 - y0
        bx0, by0 = math.floor(min(x0, x1, x2, x3)), math.floor(min(y0, y1, y2, y3))
        bx1, by1 = math.ceil(max(x0, x1, x2, x3)), math.ceil(max(y0, y1, y2, y3))
        W, H = canvas.size
        if bx1 < 0 or by1 < 0 or bx0 > W or by0 > H or bx1 - bx0 < 1 or by1 - by0 < 1:
            return
        if (bx1 - bx0) * (by1 - by0) > 4 * W * H:
            cx0, cy0, cx1, cy1 = max(bx0, 0), max(by0, 0), min(bx1, W), min(by1, H)
        else:
            cx0, cy0, cx1, cy1 = bx0, by0, bx1, by1
        w, h = im.size
        A = np.array([[(x1 - x0) / w, (x2 - x0) / h], [(y1 - y0) / w, (y2 - y0) / h]])
        if abs(np.linalg.det(A)) < 1e-9:
            return
        Ai = np.linalg.inv(A)
        # output (X,Y) in patch -> screen (X+cx0, Y+cy0) -> image = Ai @ (screen - p0)
        a, b = Ai[0]; d_, e = Ai[1]
        c = -(a * (x0 - cx0) + b * (y0 - cy0)); f = -(d_ * (x0 - cx0) + e * (y0 - cy0))
        patch = im.transform((cx1 - cx0, cy1 - cy0), Image.AFFINE, (a, b, c, d_, e, f), resample=Image.BILINEAR)
        canvas.alpha_composite(patch, (cx0, cy0)) if cx0 >= 0 and cy0 >= 0 and cx1 <= W and cy1 <= H else \
            canvas.paste(Image.alpha_composite(canvas.crop((cx0, cy0, cx1, cy1)), patch), (cx0, cy0))


    def render(name, cx, cy, zoom=1.0, W=1920, H=1080):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 255))
        k = W / (2 * CAMZ * HALFV * 16 / 9) / zoom

        def S(x, y, z):
            f = CAMZ / max(CAMZ + z, 1)
            return (W / 2 + (x - cx) * f * k, H / 2 - (y - cy) * f * k)

        n = 0
        for li, order, nz, kind, data in draws:
            if kind == 'sr':
                M, fid, pid, col, fx, fy, dm, size = data
                sp = sprite(fid, pid)
                if sp is None:
                    continue
                im, w, h, px, py, ppu, _ = sp
                sw, sh = (size if dm != 0 else (w / ppu, h / ppu))
                z = M[2, 3]

                def Wp(u, v):
                    lx = (u - px) * sw * (-1 if fx else 1); ly = (v - py) * sh * (-1 if fy else 1)
                    q = M @ np.array([lx, ly, 0, 1.0])
                    return S(q[0], q[1], z)
                img = im
                if col[:3] != (1, 1, 1) or col[3] < 1:
                    arr = np.array(img).astype(np.float32); arr *= np.array(col, dtype=np.float32)
                    img = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
                blit(canvas, img, (Wp(0, 1), Wp(1, 1), Wp(0, 0))); n += 1
            else:
                M, tt = data
                z = M[2, 3]
                anchor = tt.get('m_TileAnchor', {'x': 0.5, 'y': 0.5})
                sprites = tt.get('m_TileSpriteArray', [])
                cols = tt.get('m_TileColorArray', [])
                cell = 16.0
                for kv in tt.get('m_Tiles', []):
                    pos, td = (kv[0], kv[1]) if isinstance(kv, (list, tuple)) else (kv['first'], kv['second'])
                    si = td.get('m_TileSpriteIndex', 65535)
                    if si >= len(sprites):
                        continue
                    pp = sprites[si]['m_Data']
                    sp = sprite(pp['m_FileID'], pp['m_PathID'])
                    if sp is None:
                        continue
                    im, w, h, px, py, ppu, _ = sp
                    bx = (pos['x'] + anchor['x']) * cell; by = (pos['y'] + anchor['y']) * cell
                    q0 = M @ np.array([bx, by, 0, 1.0])
                    sx, sy = S(q0[0], q0[1], z)
                    f = CAMZ / max(CAMZ + z, 1) * k
                    ww, hh = w / ppu * f * M[0, 0], h / ppu * f * M[1, 1]
                    x0 = sx - px * ww; y0 = sy - (1 - py) * hh
                    if x0 > W or y0 > H or x0 + ww < 0 or y0 + hh < 0:
                        continue
                    ci = td.get('m_TileColorIndex', 65535)
                    img = im
                    if ci < len(cols):
                        c4 = cols[ci]['m_Data']
                        if (c4['r'], c4['g'], c4['b'], c4['a']) != (1, 1, 1, 1):
                            arr = np.array(img).astype(np.float32); arr *= np.array([c4['r'], c4['g'], c4['b'], c4['a']], dtype=np.float32)
                            img = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
                    blit(canvas, img, ((x0, y0), (x0 + ww, y0), (x0, y0 + hh))); n += 1
        canvas.convert('RGB').save(os.path.join(OUT, f'{PREFIX}-render-{name}.png'))
        print('render', name, n, 'draws')


    for v in VIEWS:
        parts = v.split(':')
        render(parts[0], float(parts[1]), float(parts[2]), float(parts[3]) if len(parts) > 3 else 1.0)

    # biggest environment sprites (background/foreground art), unique by name
    n = int(NSPR)
    if n > 0:
        seen, cand = set(), []
        for li, order, nz, kind, data in draws:
            if kind != 'sr':
                continue
            sp = sprite(data[1], data[2])
            if sp is None or sp[6] in seen:
                continue
            seen.add(sp[6]); cand.append((sp[1] * sp[2], sp[6], sp[0], LAYERS[li]))
        cand.sort(key=lambda c: -c[0])
        for area, nm, im, ln in cand[:n]:
            safe = re.sub(r'[^A-Za-z0-9_.-]+', '_', nm)[:60]
            im.save(os.path.join(OUT, f'{PREFIX}-sprite-{ln}-{safe}.png'))
            print('sprite', ln, nm, im.size)



def step_stats():
    import json, sys, math, collections, statistics as st
    a = json.load(open(sys.argv[1]))
    S = 1920 * 1080
    R = {r['id']: r for r in a['rooms']}
    crit = set(a['criticalPath'])
    print('rooms', len(R), 'rect screens', round(sum(r['screens'] for r in R.values()), 1), 'filled',
          round(sum(r['filledScreens'] for r in R.values()), 1), 'crit filled',
          round(sum(r['filledScreens'] for r in R.values() if r['id'] in crit), 1))
    fs = sorted(r['filledScreens'] for r in R.values())
    print('filled per room median', st.median(fs), 'quartiles', fs[len(fs) // 4], fs[3 * len(fs) // 4], 'max', fs[-1])
    placed = [e for e in a['enemies'] if not e['spawned']]
    spawned = [e for e in a['enemies'] if e['spawned']]
    F = sum(r['filledScreens'] for r in R.values())
    Fc = sum(r['filledScreens'] for r in R.values() if r['id'] in crit)
    print('enemies all', len(a['enemies']), 'placed', len(placed), 'spawned', len(spawned))
    print('placed per filled screen', round(len(placed) / F, 2), 'crit', round(sum(e['roomId'] in crit for e in placed) / Fc, 2),
          'all per filled', round(len(a['enemies']) / F, 2), 'per rect screen placed', round(len(placed) / sum(r['screens'] for r in R.values()), 2))
    per = collections.Counter(e['roomId'] for e in a['enemies'])
    perp = collections.Counter(e['roomId'] for e in placed)
    print('rooms with no enemy (all)', sum(1 for r in R if per[r] == 0), '/', len(R), 'no placed', sum(1 for r in R if perp[r] == 0))
    dens = sorted(((per[r] / R[r]['screens'], r, per[r]) for r in R), reverse=True)[:5]
    print('densest (rect screens)', [(round(d, 2), r, n) for d, r, n in dens])
    densf = sorted(((perp[r] / max(R[r]['filledScreens'], .3), r, perp[r]) for r in R), reverse=True)[:6]
    print('densest placed per filled', [(round(d, 2), r, n) for d, r, n in densf])
    print('kinds', collections.Counter(e['kind'] for e in a['enemies']).most_common())
    print('kinds placed', collections.Counter(e['kind'] for e in placed).most_common())
    print('difficulty', collections.Counter(e['difficulty'] for e in a['enemies']))
    print('mean difficulty placed', round(st.mean(e['difficulty'] for e in placed), 2))
    # clustering: enemies within 1 view width (1920) and same room -> groups
    def groups(es, d=900):
        es = list(es); seen = set(); gs = []
        for i, e in enumerate(es):
            if i in seen: continue
            g = [i]; seen.add(i); k = 0
            while k < len(g):
                for j, f in enumerate(es):
                    if j not in seen and math.dist(es[g[k]]['at'], f['at']) < d:
                        seen.add(j); g.append(j)
                k += 1
            gs.append(len(g))
        return gs
    g = groups(placed)
    print('placed groups (<900 px link)', len(g), 'sizes', collections.Counter(g), 'mean', round(st.mean(g), 2))
    nn = []
    for e in placed:
        ds = [math.dist(e['at'], f['at']) for f in placed if f is not e and f['roomId'][:3] == e['roomId'][:3]]
        if ds: nn.append(min(ds))
    print('nearest-neighbour distance placed px median', round(st.median(nn)), 'quartiles', round(sorted(nn)[len(nn) // 4]), round(sorted(nn)[3 * len(nn) // 4]))
    # hazards
    hz = [t for t in a['terrain'] if t['kind'] == 'hazard']
    def bb(p):
        xs = [q[0] for q in p]; ys = [q[1] for q in p]; return min(xs), min(ys), max(xs), max(ys)
    hw = [bb(t['poly'])[2] - bb(t['poly'])[0] for t in hz]; hh = [bb(t['poly'])[3] - bb(t['poly'])[1] for t in hz]
    print('hazards', len(hz), 'total width px', round(sum(hw)), 'median w', round(st.median(hw)), 'h', round(st.median(hh)),
          'on crit', sum(t['roomId'] in crit for t in hz), 'by room', collections.Counter(t['roomId'] for t in hz).most_common(8))
    ow = [t for t in a['terrain'] if t['kind'] == 'oneway']
    owl = [abs(t['poly'][1][0] - t['poly'][0][0]) for t in ow]
    print('oneways', len(ow), 'median length', round(st.median(owl)), 'quartiles', round(sorted(owl)[len(owl) // 4]), round(sorted(owl)[3 * len(owl) // 4]),
          'per filled screen', round(len(ow) / F, 2))
    cl = a.get('climbable', [])
    clh = [bb(t['poly'])[3] - bb(t['poly'])[1] for t in cl]
    print('climbable', len(cl), 'heights median', round(st.median(clh)), 'max', round(max(clh)), 'sum', round(sum(clh)))
    sw = [t for t in a['terrain'] if t['kind'] == 'secretWall']
    sws = [(bb(t['poly'])[2] - bb(t['poly'])[0], bb(t['poly'])[3] - bb(t['poly'])[1]) for t in sw]
    print('secretWall covers', len(sw), 'sizes', [(round(w), round(h)) for w, h in sws])
    # which covers contain a thing
    for t in sw:
        x0, y0, x1, y1 = bb(t['poly'])
        inside = [th['value'] for th in a['things'] if x0 - 30 <= th['at'][0] <= x1 + 30 and y0 - 30 <= th['at'][1] <= y1 + 30]
        ins_e = [e['kind'] for e in a['enemies'] if x0 - 30 <= e['at'][0] <= x1 + 30 and y0 - 30 <= e['at'][1] <= y1 + 30]
        print('   cover', t['roomId'], round(x1 - x0), 'x', round(y1 - y0), 'things', inside, 'enemies', ins_e)
    hid = [t for t in a['things'] if t.get('hidden')]
    print('hidden things', len(hid))
    for t in hid:
        print('   ', t['roomId'], t['kind'], (t.get('value') or '')[:40], '|', t['hidden'].get('how', '')[:90], '|', t['hidden'].get('needs', ''))
    print('things', collections.Counter(t['kind'] for t in a['things']))
    props = sum(r.get('breakableProps', 0) for r in R.values())
    print('breakable props', props, 'per filled screen', round(props / F, 2))
    solid = sum((bb(t['poly'])[2] - bb(t['poly'])[0]) * (bb(t['poly'])[3] - bb(t['poly'])[1]) for t in a['terrain'] if t['kind'] == 'solid')
    print('solid share of room rects', round(solid / sum(r['screens'] * S for r in R.values()), 2))
    for r in a['rooms']:
        print(f"  {r['id']:18s} {r['shape']:9s} rect {r['rect'][2]:6d}x{r['rect'][3]:5d} scr {r['screens']:5.2f} filled {r['filledScreens']:5.2f} en {per[r['id']]:2d} (placed {perp[r['id']]:2d}) things {sum(1 for t in a['things'] if t['roomId']==r['id'])} {'CRIT' if r['id'] in crit else ''}")
    saves = [t for t in a['things'] if t['kind'] == 'save']
    print('saves', [(t['roomId'], t['at']) for t in saves])



def step_render():
    import json, sys
    from PIL import Image, ImageDraw, ImageChops, ImageFont

    src, out = sys.argv[1], sys.argv[2]
    k = float(sys.argv[3]) if len(sys.argv) > 3 else 0.25
    rooms = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
    e = json.load(open(src))
    r = e['sceneRect']
    x0, y1 = r['x'] - 64, r['y'] + r['height'] + 64  # top-left in unity (y up)
    W = int((r['width'] + 128) * k); H = int((r['height'] + 128) * k)


    def P(x, y):
        return ((x - x0) * k, (y1 - y) * k)


    img = Image.new('RGB', (W, H), (236, 232, 222))
    solid = Image.new('1', (W, H), 0)
    for t in e['terrain']:
        if t['kind'] == 'solid' and t.get('src') == 'tilemap':
            m = Image.new('1', (W, H), 0)
            ImageDraw.Draw(m).polygon([P(*p) for p in t['poly']], fill=1)
            solid = ImageChops.logical_xor(solid, m)
    img.paste((40, 40, 44), mask=solid)
    d = ImageDraw.Draw(img)
    cr = e['cameraRange']
    d.rectangle([P(cr['x'], cr['y'] + cr['height']), P(cr['x'] + cr['width'], cr['y'])], outline=(150, 150, 220))
    col = {'solid': (70, 70, 80), 'oneway': (140, 110, 60), 'climbable': (60, 160, 200), 'door': (230, 160, 30),
           'breakable': (150, 100, 50), 'hazard': (220, 40, 40), 'secretWall': (180, 60, 200), 'water': (60, 120, 220)}
    for t in e['terrain']:
        if t['kind'] == 'solid' and t.get('src') == 'tilemap':
            continue
        pts = [P(*p) for p in t['poly']]
        c = col.get(t['kind'], (0, 0, 0))
        if t['kind'] in ('oneway',):
            d.line(pts + [pts[0]], fill=c, width=2)
        elif t['kind'] in ('climbable', 'secretWall'):
            d.line(pts + [pts[0]], fill=c, width=2)
        else:
            d.polygon(pts, fill=c if t['kind'] != 'solid' else (90, 90, 100), outline=c)
    font = ImageFont.load_default()
    tc = {'save': (20, 160, 80), 'chest': (220, 180, 0), 'statueChest': (230, 120, 0), 'loot': (130, 60, 210),
          'interact': (0, 140, 140), 'lift': (0, 90, 200), 'door': (230, 120, 0), 'npc': (0, 0, 0), 'heal': (20, 200, 120),
          'breakableWall': (150, 100, 50)}
    for t in e['things']:
        x, y = P(*t['at']); c = tc.get(t['kind'], (0, 0, 0))
        if t['kind'] == 'door':
            for b in t.get('boxes', []):
                d.rectangle([P(b[0], b[3]), P(b[2], b[1])], outline=c, width=2)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=c if t.get('active', True) else None, outline=c)
        lab = t['kind'][:5] + ':' + (t.get('flag') or t.get('to') or t.get('name') or '')[:22]
        d.text((x + 6, y - 6), lab, fill=c, font=font)
    for en in e['enemies']:
        x, y = P(*en['at'])
        c = (220, 30, 30) if en['active'] else (240, 150, 150)
        d.polygon([(x, y - 7), (x - 6, y + 5), (x + 6, y + 5)], fill=c)
        d.text((x + 6, y + 2), en['name'].replace('StealthGameMonster_', '').replace('StealthMonster_', '')[:14], fill=c,
               font=font)
    for p in e['props']:
        x, y = P(*p['at']); d.point((x, y), fill=(120, 90, 40))
    for i, z in enumerate(e.get('camZones', [])):
        a, b, c2, dd = z['trig']
        cc = (40, 170, 60) if z['active'] else (160, 200, 160)
        d.rectangle([P(a, dd), P(c2, b)], outline=cc, width=1)
        d.text(P(a + 4, dd - 4), str(i), fill=cc, font=font)
    if rooms:
        for rm in rooms:
            if rm.get('scene') != e['scene']:
                continue
            a, b, w, h = rm['u']
            d.rectangle([P(a, b + h), P(a + w, b)], outline=(0, 120, 255), width=2)
            d.text(P(a + 8, b + h - 8), rm['id'], fill=(0, 80, 220), font=font)
    # grid every 512 units
    for gx2 in range((int(r['x']) // 256) * 256, int(r['x'] + r['width']) + 1, 256):
        d.line([P(gx2, r['y']), P(gx2, r['y'] + r['height'])], fill=(200, 200, 255) if gx2 % 512 else (160, 160, 255), width=1)
    for gy2 in range((int(r['y']) // 256) * 256, int(r['y'] + r['height']) + 1, 256):
        d.line([P(r['x'], gy2), P(r['x'] + r['width'], gy2)], fill=(200, 200, 255) if gy2 % 512 else (160, 160, 255), width=1)
    gx = (int(r['x']) // 512) * 512
    while gx < r['x'] + r['width']:
        d.text(P(gx, r['y'] + r['height'] + 40), str(gx), fill=(120, 120, 120), font=font); gx += 512
    gy = (int(r['y']) // 512) * 512
    while gy < r['y'] + r['height']:
        d.text(P(r['x'] - 60, gy), str(gy), fill=(120, 120, 120), font=font); gy += 512
    img.save(out)
    print(out, W, H)



STEPS = {'unpack': step_unpack, 'dump': step_dump, 'classify': step_classify, 'camzones': step_camzones, 'build': step_build, 'look': step_look, 'stats': step_stats, 'render': step_render}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in STEPS:
        print(__doc__)
        sys.exit(1)
    step = sys.argv.pop(1)
    STEPS[step]()
