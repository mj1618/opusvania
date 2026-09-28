# Fixed-step loop: vsync snapping

`src/loop.ts` `FixedStepLoop` snaps rAF deltas within 0.5 ms of a whole number of 60Hz steps (×0.5, 1,
2, 3, 4) to exactly that before accumulating (Tyler Glaiel, "How to make your game run at 60fps").

- Why: real 60Hz rAF deltas jitter (16.3–17.1 ms; Firefox/Safari clamp timers to 1 ms). With a raw
  accumulator sitting near a step boundary, jitter gives 0 steps one frame and 2 the next: visible
  stutter although the average rate is right. `tests/unit/loop.test.ts` shows both behaviours.
- Cost: on a 59.94Hz or 60.2Hz display the sim runs ~0.3% off wall time. Nobody can see that. Deltas
  outside the tolerance (144Hz, 75Hz, dropped frames, stalls) pass through unchanged; stalls still cap at 5 steps.
- `floor(acc/step + 1e-6)` guards against 0.99999 after snapping; `alpha` is clamped below 1.
- With snapping the interpolation alpha stays constant (whatever phase the session started in), so the
  render shows prev→current at a fixed blend: up to one frame of display lag, but steady.
