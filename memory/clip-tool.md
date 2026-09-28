# Clip tool (`npm run clip`)

Captures gameplay as mp4 + GIF + contact sheet into `clips/` (gitignored). One frame per sim step,
driven through `window.__game` in manual mode, so clips are deterministic and independent of machine speed.

```
npm run clip -- --script "right*40 right+jump*22 right*30 _*30" --name run-jump
npm run clip -- --room hall --spawn a --script "left*90" --hitboxes
npm run clip -- --replay replay.json --name bug-12        # a __game.replay.stop() dump
npm run clip -- --url https://mj1618.github.io/opusvania/ --script "jump*20 _*30"
```

Options: `--seed` (1), `--pre` settle steps before recording (10), `--scale` of the 1920x1080 canvas (0.5),
`--gif-width` (640), `--gif-fps` (30), `--keep-frames` (keeps `clips/.frames-<name>/*.png`).

- Outputs `clips/<name>.mp4` (60fps), `<name>.gif`, `<name>-sheet.png` (6x4 grid, every Nth frame; N is printed).
  **Agents can't watch video: read the sheet PNG, or `--keep-frames` and read individual frames.**
- Prints the final state and hash as JSON, so a clip doubles as a state check.
- Without `--url` it starts its own Vite dev server on a free port (no need to run `npm run dev`).
- Speed: ~150 frames in ~9s. Most of the cost is PNG encode + base64 transfer; lower `--scale` if slow.
- Script syntax is the same as `__game.input()` (see debug-api.md).
- Contact-sheet thumbnails are small; motion between tiles is easy to misread, so check a couple of full frames.
