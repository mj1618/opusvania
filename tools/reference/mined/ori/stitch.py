import sys; sys.path.insert(0, sys.argv[1]+'/tools')
from PIL import Image
import glob, os
T=sys.argv[1]+'/tiles'
tx0,tx1,ty0,ty1=29,54,37,46
im=Image.new('RGBA',((tx1-tx0+1)*256,(ty1-ty0+1)*256),(0,0,0,255))
for tx in range(tx0,tx1+1):
    for ty in range(ty0,ty1+1):
        f=f'{T}/{tx}_{ty}.png'
        if os.path.getsize(f)==0: continue
        im.paste(Image.open(f).convert('RGBA'),((tx-tx0)*256,(ty-ty0)*256))
im.save(sys.argv[1]+'/stitched.png')
print(im.size)
im.convert('RGB').resize((im.width//4,im.height//4)).save(sys.argv[1]+'/stitched_q.png')
