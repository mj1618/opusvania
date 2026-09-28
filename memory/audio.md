# Audio (src/audio, content/audio)

Procedural Web Audio only (no files yet). Everything tunable is in `content/audio/*.json`, Zod-validated
by `src/audio/data.ts` (typos in ZzFX param names fail; event→sound refs are cross-checked).

- **Map:** `engine.ts` graph/buses/voices/duck/muffle, `zzfx.ts` vendored synth, `noise.ts` colours,
  `hum.ts` Tallage hum voice (seize/levy), `ambience.ts` room bed, `music.ts` + `music-clock.ts` director,
  `router.ts` sim events/state → sounds, `index.ts` AudioSystem + `__game.audio`, `offline.ts` + `scenarios.ts` renders.
- **Why vendored ZzFX** (movement spec D10): MIT, ~150 lines, no npm dep. Ported to TS with named params,
  sample-rate param and injected RNG. Sounds are built once per context with no jitter; per-play
  variation is playbackRate (±`pitchVar` semitones) and gain (±`volVarDb`).
- **Event contract:** `router.ts` takes the sim's typed `SimEvent` (all events via `bus.onAny`; names in
  sim-architecture.md). jump by `kind` (double/wall/dashJump have their own sounds), `land` uses the sim's
  `hard` flag and scales volume by `vy`, `step` = footstep, `dashStart`, `headBump`, `pogo`, `death`,
  `respawn` via `sfx.json events.simple`; the wall-slide loop is open between `wallSlideStart`/`End` and
  its level follows `player.vy`. No sounds are derived from player state any more (the pre-merge Phase 0
  fallbacks were removed at the L2 merge). `tests/unit/audio-router.test.ts` runs every golden tape plus a
  spike death through the real sim and asserts each movement sound fires. New event → add to `events.simple`.
- Ambience beds match the room id, then its family (`gym-05` → `gym`), then `default`.
- Sim stays untouched: the router only reads; e2e records a replay with audio live and verifies it headless.

## Offline render (how agents "listen")
`npm run audio:render [-- sfx/ hum/brown demo --strict --list]` renders scenarios with
OfflineAudioContext in headless Chromium, writes `clips/audio/*.wav`, prints peak/RMS/loudest-50ms-window
dBFS + clipped count, and encodes `demo.wav` to `demo.mp3`/`demo.ogg`. Add scenarios in `scenarios.ts`.
For a time envelope (where a peak happens), read the WAV with Python's `wave` module in 50ms windows.
Current mix targets: SFX peaks -8..-20 dBFS (loudest window -18..-25), hums ≈ -21..-31, ambience ≈ -27,
music ≈ -21, demo peak ≈ -4, nothing clips.

## Web Audio gotchas
- Create the AudioContext **inside** the first gesture handler (pointerdown/keydown/touchend, capture) to
  avoid Chrome's autoplay warning. `__game.audio.unlock()` from a script is not a gesture; drive a real
  one with `playwright-cli press Space` or a click. `stats().state` is `'locked'` until then.
- `OfflineAudioContext.suspend(t)`: times must be distinct, > 0 and on 128-frame render quanta. Run t=0
  actions before `startRendering()`. Inside the callback `currentTime == t`, so live scheduling code works.
- StereoPanner on a mono source is equal-power: centre is -3 dB per channel, hard-ish pan adds up to
  +3 dB on one side. DynamicsCompressor adds automatic makeup gain (~+2 dB with our limiter settings).
  Both show up in rendered levels.
- Automation: `cancelScheduledValues(t)` then `setValueAtTime(p.value, t)` before a ramp, or it jumps.
  `exponentialRampToValueAtTime` can't reach 0 (use 1e-4). Reading `.value` mid-automation is fine in Chrome.
- Brown noise loops click at the seam unless crossfaded (`makeNoise` does an equal-power crossfade).
  Narrow band-passes lose energy: scale band gain by √Q (the murmur does).
