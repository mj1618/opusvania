"""Decode hallownest-calculator's map-walk masks (in-game map drawings, map units) into scene-unit grids."""
import json
import numpy as np
SP = "/private/tmp/claude-501/-Users-matt-code-worktrees-opusvania-game-design-rain-world-metroidvania-a8d617/d53ed2b7-ba9c-4e7b-b710-4c887df84277/scratchpad/"
M = json.load(open(SP + "dl/calc/map.json")); W = json.load(open(SP + "dl/calc/map-walk.json"))
SO = json.load(open(SP + "dl/calc/scene-objects.json"))
CELL = float(W["CELL"]); RLE = W["RLE64"]


def mask(scene):
    """-> (ground bool array [rows top->bottom, cols], x0, y0 (map units, bottom-left), cell)"""
    if scene not in W["MASKS"]:
        return None
    x0, y0, w, h, runs = W["MASKS"][scene]
    g = np.zeros(w * h, bool)
    k = 0; on = False
    for ch in runs:
        n = RLE.index(ch)
        if on:
            g[k:k + n] = True
        k += n; on = not on
    return g.reshape(h, w), x0, y0


def scene_ground(scene):
    """ground grid resampled to 1-unit cells in scene coords: array [H rows (y from top), W cols]"""
    m = mask(scene)
    b = M["BOXES"].get(scene); sz = SO["SIZES"].get(scene)
    if m is None or not b or not sz:
        return None
    g, x0, y0 = m
    h, w = g.shape
    Wd, Hd = sz
    out = np.zeros((Hd, Wd), bool)
    ys = np.arange(Hd) + 0.5; xs = np.arange(Wd) + 0.5
    for j, sy in enumerate(ys):           # sy: scene y from the bottom
        my = b[1] + (sy / Hd) * b[3]
        row = int((y0 + h * CELL - my) / CELL)
        if not (0 <= row < h):
            continue
        mx = b[0] + (xs / Wd) * b[2]
        col = ((mx - x0) / CELL).astype(int)
        ok = (col >= 0) & (col < w)
        out[Hd - 1 - j, ok] = g[row, col[ok]]
    return out


if __name__ == "__main__":
    import sys
    from PIL import Image
    for sc in sys.argv[1:]:
        g = scene_ground(sc)
        Image.fromarray((g * 255).astype(np.uint8)).resize((g.shape[1] * 6, g.shape[0] * 6), Image.NEAREST).save(SP + f"seg/mask_{sc}.png")
        print(sc, g.shape, g.mean())
