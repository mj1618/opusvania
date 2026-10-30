import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from crs import g2p
from PIL import Image, ImageDraw
S=sys.argv[1]
im=Image.open(S+'/overlay.png'); d=ImageDraw.Draw(im)
OX,OY=29*256,37*256
for gx in range(-380,341,10):
    x=g2p(gx,0)[0]-OX; d.line([(x,0),(x,im.height)],fill=(90,90,90) if gx%50 else (200,60,200),width=1 if gx%50 else 2)
    if gx%50==0:
        for gy in range(-330,-60,50): d.text((x+2,g2p(0,gy)[1]-OY+2),f'{gx},{gy}',fill=(255,120,255))
for gy in range(-350,-60,10):
    y=g2p(0,gy)[1]-OY; d.line([(0,y),(im.width,y)],fill=(90,90,90) if gy%50 else (200,60,200),width=1 if gy%50 else 2)
im.save(S+'/grid.png')
def crop(x0,y0,x1,y1,out,scale=1):
    a=g2p(x0,y1); b=g2p(x1,y0); c=im.crop((int(a[0]-OX),int(a[1]-OY),int(b[0]-OX),int(b[1]-OY)))
    c.resize((int(c.width*scale),int(c.height*scale))).save(out)
crop(-370,-330,-120,-110,S+'/g_west.png',0.8)
crop(-130,-300,110,-80,S+'/g_mid.png',0.8)
crop(100,-320,340,-80,S+'/g_east.png',0.8)
