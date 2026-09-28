# Clip tool (`npm run clip`)

Captures gameplay as mp4 + GIF + contact sheet + per-frame trace into `clips/` (gitignored). One frame
per sim step, driven through `window.__game` in manual mode, so clips are deterministic and independent
of machine speed.

```
npm run clip -- --script "R40 R+J22 R30 .30" --name run-jump
npm run clip -- --script "R40 R+J22 R30 .30" --name run-jump --study    # for playtester critiques
npm run clip -- --room hub --spawn 5 --script "left*90" --hitboxes
npm run clip -- --replay replay.json --name bug-12        # a __game.replay.stop() dump
npm run clip -- --tape tests/replays/x.json --trail       # a golden tape (e.g. a bot solution)
npm run clip -- --url https://mj1618.github.io/opusvania/ --script "jump*20 _*30"
```

Options: `--seed` (1), `--pre` settle steps before recording (10), `--scale` of the 1920x1080 canvas (0.5),
`--gif-width` (640), `--gif-fps` (30), `--keep-frames` (keeps `clips/.frames-<name>/*.png`).

- Outputs `clips/<name>.mp4` (60fps), `<name>.gif`, `<name>-sheet.png`, `<name>-trace.txt` (the
  `traceText` table: frame, input, x, y, vx, vy, grounded, state, events). The JSON printed at the end
  lists which frame each sheet tile shows and why (event name), plus the final state and hash.
  **Agents can't watch video: read the sheet PNG, the trace, or `--keep-frames` and read single frames.**
- Every frame has its sim frame number burned in top-left (`f123`, same numbering as the trace); `--no-label` removes it.
- **Motion trail** (`--trail`, or `__game.debug.trail(true)` live): a ghost hitbox + dot every 2 frames for the
  last 60, the current hitbox (green grounded / red airborne), velocity vector (×4), and event markers with
  their frame: `J` jump, `Jc` coyote jump, `W` wall jump, `2` double jump, `L` land, `D`/`d` dash start/end,
  `C` corner correction, `H` head bump, `P` pogo, `X` death. Dot spacing shows speed: dense = slow (apex hang).
- **Sheets:** `--sheet uniform` (default; every Nth frame, `--every N`) or `--sheet events` (keyframes: each
  jump/land/dash/wall-slide/corner/death event frame, apexes, then frames −3/−1/+2/+4 around them, up to
  `--max-tiles` 24). `--cols` 6, `--tile-width` (320 uniform, 480 events).
- `--study` = `--trail --hitboxes --sheet events`: the movement-spec §7.6 playtester setup.
- Without `--url` it starts its own Vite dev server on a free port (no need to run `npm run dev`).
- Speed: ~150 frames in ~9s. Most of the cost is PNG encode + base64 transfer; lower `--scale` if slow.
- Script syntax is the same as `__game.input()` (see debug-api.md).
- `--keep-frames` PNGs are numbered from the first *recorded* frame, so file `N` = sim frame `N + pre`
  (default pre 10; `--tape` clips with `--pre 0` line up). Read the burned-in `f123` label to be sure.
- Thumbnails at 320px are too small for marker letters; use `--sheet events` (480px) or read full frames.
