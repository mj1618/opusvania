import sys; sys.path.insert(0, "/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ori/tools")
import sys, os, subprocess
from crs import g2p
x0,y0=g2p(-380,-70); x1,y1=g2p(340,-345)
tx0,tx1=int(x0//256),int(x1//256); ty0,ty1=int(y0//256),int(y1//256)
print(tx0,tx1,ty0,ty1,(tx1-tx0+1)*(ty1-ty0+1))
out=sys.argv[1]
for tx in range(tx0,tx1+1):
    for ty in range(ty0,ty1+1):
        f=f'{out}/{tx}_{ty}.png'
        if os.path.exists(f) and os.path.getsize(f)>0: continue
        subprocess.run(['curl','-s','-f','-o',f,f'https://ori-tracker.firebaseapp.com/images/ori-map/7/{tx}/{ty}.png'])
