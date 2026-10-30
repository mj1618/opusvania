import sys,json; sys.path.insert(0,'/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ns')
from load import load
D='/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ns/dl/'
C=load(D+'connections.jsonc'); L=load(D+'locations.jsonc')
SCOPE=('AF (Monitoring)','AF (Elevator)','Central Hall','FSP - Root Node','FSP - Roof','CTH')
def ok(req,items,regs):
    if req is None: return False
    for r in req:
        if not sat(r,items,regs): return False
    return True
def sat(r,items,regs):
    if isinstance(r,list): return all(sat(x,items,regs) for x in r)
    if 'item' in r: return r['item'] in items
    if 'region' in r: return r['region'] in regs
    if 'anyOf' in r: return any(sat(x,items,regs) for x in r['anyOf'])
    if 'count' in r: return False
    if 'option' in r: return sat(r.get('false',[]) and r['false'] or [],items,regs) if r.get('false') else True
    return False
def reach(items, start='AF (Monitoring) - Root Node'):
    regs={start}
    ch=True
    while ch:
        ch=False
        for c in C:
            if c['from'] in regs and c['to'] not in regs and c['to'].startswith(SCOPE) and ok(c['requires'],items,regs):
                regs.add(c['to']); ch=True
    locs=[l['name'] for l in L if l.get('region') in regs and ok(l.get('requires',[]),items,regs)]
    return regs,locs
base={'Wall Climb','Grapple','Ledge Grab'}
kits=[('start',base),('+Nymph',base|{'Mystic Nymph: Scout Mode'}),('+Nymph+Kick',base|{'Mystic Nymph: Scout Mode','Tai-Chi Kick'}),('+all',base|{'Mystic Nymph: Scout Mode','Tai-Chi Kick','Air Dash','Cloud Leap','Charged Strike','Unbounded Counter'})]
allregs=set(c['from'] for c in C if c['from'].startswith(SCOPE))|set(c['to'] for c in C if c['to'].startswith(SCOPE))
print('scope regions',len(allregs))
out={}
prev=set();prevl=set()
for n,k in kits:
    r,l=reach(k)
    l=[x for x in l if x.startswith(('AF (Monitoring)','AF (Elevator)','Central Hall','CTH','FSP: Half','FSP: Fully','FSP: Receive'))]
    print(n,len(r),'regions',len(l),'locations')
    print('   new regions:',sorted(r-prev)); print('   new locs:',sorted(set(l)-prevl))
    prev=r;prevl=set(l)
    out[n]=dict(regions=sorted(r),locations=sorted(l))
json.dump(out,open('/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ns/work/reach.json','w'),indent=1)
