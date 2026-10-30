import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from crs import g2p
from PIL import Image
import numpy as np, colorsys
a=np.asarray(Image.open(sys.argv[1]+'/stitched.png').convert('RGB')).astype(int)
OX,OY=29*256,37*256
for name,x,y in [('mainpool',5,-238),('grenpool',30,-275),('poolneck',-20,-240),('blueair',30,-205),('blueair2',150,-205),('tanair',-200,-230),('green',200,-150),('stree',-90,-120),('valleywater',-300,-95)]:
    px,py=g2p(x,y); v=a[int(py-OY)-3:int(py-OY)+4,int(px-OX)-3:int(px-OX)+4].reshape(-1,3).mean(0)
    h,s,vv=colorsys.rgb_to_hsv(*(v/255)); print(name, v.round(), 'h%.2f s%.2f v%.2f'%(h,s,vv))
