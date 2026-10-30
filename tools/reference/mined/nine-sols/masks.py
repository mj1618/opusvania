import numpy as np, cv2, json, sys
NS='/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/ns'
im=cv2.imread(NS+'/stitch15.png')[:,:,::-1].astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
bg=np.array([2,23,38]); d=np.abs(im-bg).sum(2)
teal=(g-r>50)&(b-g<=8)
grey=(np.abs(g-r)<30)&(r>30)
blue=(b-g>8)&(r<100)&(g-r<120)&(g>=r-5)
boxes={'AFM':(700,2040,2860,2600,'teal'),'AFE':(2880,2440,4440,3180,'teal'),'CH':(2700,1060,4740,1720,'grey'),'FSP':(4200,120,6120,760,'grey'),'CTH':(4000,1480,6160,3200,'blue')}
cls={'teal':teal,'grey':grey,'blue':blue}
out={}
full=np.zeros(d.shape,np.uint8)
for k,(x0,y0,x1,y1,c) in boxes.items():
    m=np.zeros(d.shape,np.uint8)
    sel=(d>30)&cls[c]
    m[y0:y1,x0:x1]=sel[y0:y1,x0:x1]
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_RECT,(5,5)))
    # keep components > 400 px
    n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    keep=np.zeros_like(m)
    for i in range(1,n):
        if st[i,4]>400: keep[lab==i]=1
    # fill tiny holes (<60px) = line artefacts
    inv=(1-keep).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(inv,4)
    for i in range(1,n):
        if st[i,4]<60: keep[lab==i]=1
    np.save(f'{NS}/work/air_{k}.npy',keep[y0:y1,x0:x1])
    full[keep>0]=255
    ys,xs=np.nonzero(keep)
    out[k]=dict(box=[x0,y0,x1,y1],bbox=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())],area=int(keep.sum()))
    print(k,out[k])
cv2.imwrite(NS+'/work/air_all.png',cv2.resize(full,(full.shape[1]//3,full.shape[0]//3)))
json.dump(out,open(NS+'/work/scenes.json','w'))
