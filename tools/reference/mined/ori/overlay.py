import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from crs import g2p
from PIL import Image, ImageDraw
import re
S=sys.argv[1]
im=Image.open(S+'/stitched.png').convert('RGB'); d=ImageDraw.Draw(im)
OX,OY=29*256,37*256
L=open('/Users/matt/code/worktrees/opusvania/nifty-bhaskara-28e244/shots/reference/maps/ori/logic/bf-areas.ori').read().splitlines()
for l in L:
    m=re.match(r'loc: (\S+) (-?\d+) (-?\d+) (\S+)',l)
    if m:
        x,y=g2p(int(m[2]),int(m[3])); x-=OX; y-=OY
        if 0<x<im.width and 0<y<im.height:
            d.ellipse([x-5,y-5,x+5,y+5],outline=(255,0,0),width=2); d.text((x+6,y-6),m[1][:14]+' '+m[4],fill=(255,255,0))
    m=re.match(r'home: (\S+) (-?\d+) (-?\d+)',l)
    if m:
        x,y=g2p(int(m[2]),int(m[3])); x-=OX; y-=OY
        if 0<x<im.width and 0<y<im.height:
            d.rectangle([x-4,y-4,x+4,y+4],outline=(0,255,255),width=2); d.text((x+6,y+4),m[1][:16],fill=(0,255,255))
im.save(S+'/overlay.png')
for i,(a,b) in enumerate([(0,3400),(3200,6656)]):
    im.crop((a,0,b,2560)).resize(((b-a)//2,1280)).save(S+f'/overlay_{i}.png')
