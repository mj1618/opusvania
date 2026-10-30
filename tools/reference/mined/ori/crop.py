import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from crs import g2p
from PIL import Image
S=sys.argv[1]; x0,y0,x1,y1=map(float,sys.argv[2:6]); out=sys.argv[6]
im=Image.open(S+'/overlay.png')
OX,OY=29*256,37*256
a=g2p(x0,y1); b=g2p(x1,y0)
im.crop((int(a[0]-OX),int(a[1]-OY),int(b[0]-OX),int(b[1]-OY))).save(out)
