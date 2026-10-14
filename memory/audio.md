# Audio (src/audio): milestone 1

Brief and plan: `docs/audio-direction.md`. **Muted by default; the owner has not approved any of it yet.**
Web Audio only, no samples, no dependencies. Milestone 1 = the Grove's ambience, Wing's movement, the
lantern bowls. No slash, glints, creatures or score yet: those events route to nothing.

## How it fits
- `AudioDirector` (index.ts), built in main.ts. Reads `game.afterStep` (events + state) and
  `stage.afterUpdate` (camera, render clock): a generic hook in stage.ts, render never imports audio.
  It never touches the sim: hashes match muted vs unmuted (e2e `smoke.spec.ts`).
- `router.ts` is pure: `route(event)` -> cues, `ambient(snap)` -> the world's own cues per sim frame
  (drips, far voice, the Hush's knock, wall-slide claws: dice are `hash01(seed, frame, salt)`, never a
  stream, so one tape = one audio), `layers(snap, cam, clock)` -> targets for the continuous voices.
  `snapOf(state)` is all the state the sound reads (`AudioSnap`, plain JSON: what a tape records).
- `conductor.ts`: shared by live and offline; plays cues, aims layers (every 1/30 s of render time),
  rate limits (wingbeats 80 ms). Muted it still routes: `__game.audio.cues(n)`.
- `engine.ts` + `graph.ts` + `voices/`: buses world / hush / hero / lantern, each with its own room
  and far sends (so muting a bus mutes its reverb: the A/B), roll-off 9 kHz (lantern bus 15 kHz),
  fader (start fade, prologue silence), master, a limiter at -2 dB that a normal mix never reaches
  (Web Audio adds make-up gain for it: `trim` removes it).
- `bake.ts`: every one-shot in plain JS (dsp.ts), 1-8 seeded variants, all peak 0.9, a 2 ms fade to
  zero, everything but glass rolled off above 7 kHz. Long bowls bake at 1/4 rate (`SLOW`). ~110 ms in
  all at 48 kHz, in idle callbacks of <= 12 ms (the biggest piece ~17 ms).
- `clock.ts`: `hushPhase(frame)`: pulse 252 frames (4.2 s), breath 1080 (18 s), pure, for render too.
- `tuning.ts` (`AUDIO`): every level. **One-shot levels are peaks, layer levels are RMS** (pre-master).
  `voices/util.ts band()` trims each filtered noise bed to unit RMS by running the same cookbook
  filters over 2 s of it, so the numbers mean what they say. Master +10 dB puts the clip at ~-20 LUFS.

## What each sound is made of
- Wind: pink noise, roar = HP 90 / BP 350 / LP 1.4k, one bed per ear; leaf hiss = BP 3.6k (blue) /
  2.4k (amber) / 3k (violet) Q 0.55, two beds panned +-0.75, each driven by `wind()` from
  `render/scene/lib/look.ts` sampled at camera x -+ 620 px (so a wave is heard crossing), the roar by the
  same function's gust term, both times a slow seeded drift (sines of 11/17/29 s).
- The Hush (hush bus, low-passed 420 Hz = the soil, 150 Hz near a lit lantern): breath = brown noise
  through F1/F2 band-passes gliding oo<->aa on the 18 s breath; pulse = D2 + detuned 2nd/3rd partials,
  tanh-saturated, LP 330, gain = cos^2 of the 4.2 s pulse; knock = 4 wood modes ~160 Hz, panned -+0.22
  alternately at each swell top. A lit lantern within 640 px of her: soil LP down, breath flattened.
- Forest: drips every ~2.6 s on average (leaf: 2 soft modes ~500 Hz + paper noise; bark: 3 modes
  ~1.5 kHz; pool plink: a 1.1-1.5 kHz partial bending up 5% + click, only near the pool), deeper ones
  quieter, duller (LP to 1.4 kHz) and in the far reverb. Far voice: owl-like B3 -> A3, FM index
  0.15-0.65, droop, onset breath, LP 1.3k, every 21-46 s, never within 0.9 s of a knock. Pool lap
  (brown, BP 260 + 540), root steam (amber, HP 2.6k), glass air (violet, E5/B5 at Q 45).
- Wing (hero bus): wing = white noise BP sweeping 1.65-2k -> 0.62-0.78k in 80-100 ms + low push;
  double jump = wing + wing 85 ms later + whoosh (pink BP 380 -> 1.1k -> 380 bell, panned across her);
  glide catch = LP noise whumpf + membrane snap, level by `glideStart.vy` (nothing under 3 px/f, full
  at 21); glide air = pink BP 480-900 Hz by speed, released over 0.35 s; dash = noise BP up to 1.75k and
  back with a 3 ms random "tear", after the wind-up frames; land = noise puff BP ~1k + scale-dust grains,
  by impact speed; hard land adds thump (moss: modes 56-415 Hz + LP thud) or thumpWood; pool = splash;
  steps silent on moss, a faint tick on wood; wall slide = sparse 2-4-catch claw grains, ~9/s.
- Lanterns (lantern bus): notice = a 2-partial bowl at A3 (her light's pitch); channel = rubbed rim
  (pink double BP Q 40 at D3 + two sines 0.45% apart) swelling with `progress^1.5`; kindle = D3 bowl
  struck (partials 1, 2.76, 5.4, 8.93 in beating pairs) blooming into rubbed A3, E4, B4, D4 entering at
  0.14-0.9 s, panned across, 9 s; refuse = damped D3 bowl + a hollow 236 Hz knock; rest = rubbed D3 + A3
  hum; a lit one hums faintly within 520 px. Lamps: one partial, an octave up, 4 dB down.

## Review clip and measured levels (2026-10-14)
`npm run clip -- --audio --ab --pickups --wide --script "<route>" --name audio-m1`: records a tape while
stepping (muted), renders it in an OfflineAudioContext (`__game.audio.render`), muxes, measures
(`tools/lib/levels.ts`: ffmpeg EBU R128 + our FFT). `--ab` adds `-nohush`. The route (idle 12 s in the
blue, run left, somersault + hard landing, refused at the stone lantern, glide catch over the pool, splash,
air dash, pod, kindle, 18 s in its light) was made by a closed-loop sim pilot; enemies move with time, so
re-check for `hurt` if the sim changes. Clips in progress get killed by Vite HMR reloads when others
edit files: build to a scratch dir and `vite preview` it, then `--url http://localhost:<port>/opusvania/`.
Measured on clips/audio-m1.wav (41.3 s): integrated -20.2 LUFS, LRA 5.0 LU, true peak -7.9 dBTP, 0 clipped
samples, centroid 518 Hz, energy <150 Hz 18%, 2-4 kHz 2.8%, 4-9 kHz 1.8%, >9 kHz ~0; momentary loudness
rides -25..-17 LUFS with the gusts (the kindle tops it at -17); HF per 5 ms never more than 8 dB over its
median (no clicks). Without the Hush: -20.6 LUFS, -8.6 dBTP. Per bus alone (before the +10 master, from
the lab run): world -30 LUFS, hush -39, hero -41 (peaks -24 dBFS), lantern -34 (peak -19).
Offline render 41 s in 2.6 s, bake ~110 ms. Cues in the clip: 9 knocks, 20 drips, 1 far voice, 7 wingbeats,
2 whooshes, 2 dust, 1 thump, 1 catch, 1 splash, 1 dash, 2 notices, 2 refusals, 1 kindle.

## Gotchas
- Offline render cost is the two convolvers (~2 of 2.7 s for a 41 s clip; without them 0.8 s). IRs are
  1.8 s (room) and 2.8 s (far) for that reason; 60 s renders in ~3.8 s on a busy laptop (budget 3 s).
- Web Audio low/high-pass Q is in dB, band-pass Q is linear: `band()` converts.
- `game.scene` can change (`useScene`, the prologue): the director re-reads it every step.
- In `manual` / `frozen` the context is suspended; live listening needs realtime (`?audio&skipprologue`,
  then any key: browsers allow no context before a gesture).
- Agents can't hear: the numbers catch loud, harsh, dense and clicky (`clicks` = HF energy per 5 ms vs
  its median), not ugly. The owner's ear is the gate.
