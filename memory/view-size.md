# View size: any window shape, no black edges

The rule (CLAUDE.md): the game fills any window, full screen or not, with no letterbox. Done the usual
way (2026-10-17):

- **The safe area** is 16:9, `SAFE_W x SAFE_H` = 1920x1080 logical units (`src/render/contract.ts`). It is
  always fully on screen; the logical scale fits it to the window (`viewSizeFor`).
- **The view extends past it**: a wider window sees more to the sides (Hor+), a narrower or taller one more
  above and below (Vert+). 2560x1080 -> a 2560x1080 view; 1920x1200 -> 1920x1200; 1440x1080 -> 1920x1440.
- **Caps**: `VIEW_MAX_W x VIEW_MAX_H` = 2592x1536 (2.4:1 and 5:4). Past those the view stops growing and the
  rest is the clear colour, a dark letterbox (32:9 monitors, portrait windows). Why there: 21:9 monitors
  are 2.37-2.39; 5:4 is the tallest common monitor; both rooms' camera range (grove 2140, hatch 2048 tall)
  holds a 1536 view, and every bake that cannot be redrawn covers the cap shape (cost below).

## Coordinates (what to use)
- Logical coordinates keep the safe area at **0..1920 x 0..1080**. The view centre is always (960, 540);
  the visible view runs from `(view.left, view.top)` (<= 0) to `(left + w, top + h)`. So code that centres
  on 960, 540 (worldToView, placeLayer, anything centred in the HUD) is right on every shape unchanged.
- `ctx.view()` (`RenderContext`, `GameApp.view()`): `{ w, h, left, top, scale }`. `CameraView` carries `w`,
  `h` too: cull with `cam.w / 2 / cam.zoom`, never `VIEW_W / 2` (`inView(cam, x, y, pad)` in contract.ts).
- `VIEW_W / VIEW_H` still exist but mean the **safe area** (kept so old code compiles). Use `SAFE_W/H` for
  what must fit on every screen (a centred summary, the goal camera's two-shot, framing), the view for
  anything that covers or culls.
- Anything that covers the screen covers `left..left+w x top..top+h` (dip, room fade, far composite).
  Corner HUD sits at the real corner (the cluster's container is offset by left, top); centred HUD stays
  in the safe area.

## Who does what
- `app.ts`: canvas = window, root scaled by `view.scale` and placed so the safe area is centred.
- Camera (`camera/index.ts`): `CameraState.vw/vh` = the real view; the clamp to the scene uses it, the
  framing (feet line `anchorY`, the vertical window) is measured inside the safe area, so she is framed the
  same on every shape. `resizeCamera()` re-clamps on a resize without touching the springs.
- Layer tree: `visible()` is the real view; `coverage()` (and bg-bake `coverRect`) is the most the camera
  can show **at the cap shape**. far / mid bakes are built from it once: **over-provisioned, no re-bake on
  resize**. Cost: those bakes grew (~+25% each axis at parallax 0.12) and their seeded fill reshuffled
  (the plan walks rect.x..; any rect change moves every tree), so the far / mid trees in 16:9 shots moved
  on 2026-10-17. Foreground at parallax 1.35 reaches furthest with the 16:9 view (a wider view stops the
  camera sooner), so its pieces did not change; its top plants hang from the real top edge.
- Sky: shaded over the cap rect always (`SKY_RECT`, quarter size, texels on the same grid as before).
- Post: filter area = the view; bloom / light targets are the config's 16:9 sizes stretched by the view's
  shape, the hero matte is the view's size, all rebuilt when the shape changes (`PostStage.resize` /
  `stale`). Light positions and radii are in safe-area heights (1080 px) from the view's top-left
  (`uFrame` = view size / 1080), so lights and the hero pocket are the same size on every shape; the
  vignette is the 16:9 ellipse stretched over the frame. The playfield mask (480x270) covers the view.

## Fullscreen, tools, tests
- **Enter** or a double-click on the picture toggles full screen (Fullscreen API on the page).
- `npm run shots -- --size 2560x1080` (also 1920x1200, 1440x1080): default out `shots/<W>x<H>/`.
  `npm run clip -- --size WxH` (any shape; even numbers for the mp4).
- `__game.info().view` / `.safe`; `__game.debug.post(on)`, `__game.debug.clearColor(rgb)`.
- Guard: `tests/e2e/view-shapes.spec.ts` boots each room at one shape, resizes to the others (16:10,
  21:9, 4:3), sets a magenta clear colour and asserts no magenta on the edge ring or a 16 px grid, post on
  and off, and no dark band at the edges. It fails if the filter area or the view stops extending.
