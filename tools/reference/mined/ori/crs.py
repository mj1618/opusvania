# Ori rando tracker map CRS (from ori_rando_server map/src/shared_map.js getMapCrs), zoom-7 pixel <-> game units
gx1,gy1=109.90181,-257.681549; gx2,gy2=493.719818,-74.31961
mx1,my1=11897,11185; mx2,my2=15258,9587
R,B=20480,14592
L=gx2-(mx2/(mx2-mx1))*(gx2-gx1); T=gy2-(my2/(my2-my1))*(gy2-gy1)
Rg=R/mx1*(gx1-L)+L; Bg=B/my1*(gy1-T)+T
Z=7; TS=256
sX=TS/((2**Z*TS)/R*(Rg-L)); sY=TS/((2**Z*TS)/B*(Bg-T))
oX=(0-L)/(gx1-L)*mx1/2**Z; oY=(0+T)/(T-gy1)*my1/2**Z
A=sX+.0001; Bb=oX+0; C=sY-.0005; D=oY-.2
def g2p(x,y): return (2**Z*(A*x+Bb), 2**Z*(C*y+D))
def p2g(px,py): return ((px/2**Z-Bb)/A, (py/2**Z-D)/C)
if __name__=='__main__':
    print('px/unit x', 2**Z*A, 'y', 2**Z*C)
    print('glades tp', g2p(gx1,gy1), 'swamp tp', g2p(gx2,gy2))
