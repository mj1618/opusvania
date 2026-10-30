import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from crs import g2p
from PIL import Image
import numpy as np, re
S=sys.argv[1]
a=np.asarray(Image.open(S+'/stitched.png').convert('RGB')).astype(int)
print('bg sample', a[2400,100], a[5,3000])
mx=a.max(axis=2)
openm=mx>45
print('open frac', openm.mean())
OX,OY=29*256,37*256
pts=[]
for l in open('/Users/matt/code/worktrees/opusvania/nifty-bhaskara-28e244/shots/reference/maps/ori/logic/bf-areas.ori'):
    m=re.match(r'loc: (\S+) (-?\d+) (-?\d+) (\S+) (\d)',l)
    if m:
        x,y=g2p(int(m[2]),int(m[3])); x-=OX; y-=OY
        if 45<x<a.shape[1]-45 and 45<y<a.shape[0]-45: pts.append((m[1],x,y))
print(len(pts))
best=[]
for dx in range(-40,41,2):
  for dy in range(-40,41,2):
    s=sum(openm[int(y+dy),int(x+dx)] for _,x,y in pts)
    best.append((s,dx,dy))
best.sort(reverse=True); print(best[:10])
for dx,dy in [(0,0),(best[0][1],best[0][2])]:
    print(dx,dy,[n for n,x,y in pts if not openm[int(y+dy),int(x+dx)]])
import cv2
dist=cv2.distanceTransform((~openm).astype(np.uint8),cv2.DIST_L2,5)
res=[]
for dx in range(-40,41,2):
  for dy in range(-40,41,2):
    d=[dist[int(y+dy),int(x+dx)] for _,x,y in pts]
    res.append((np.median(d),np.mean(np.minimum(d,30)),dx,dy))
res.sort(key=lambda r:r[1]); print(res[:8])
print('at 0,0 per pickup dist(px):', sorted([(round(float(dist[int(y),int(x)]),1),n) for n,x,y in pts],reverse=True)[:15])
