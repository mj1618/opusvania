# Audio (src/audio)

Brief: `docs/audio-direction.md` (the rules) and `docs/design/look-and-sound.md` §6 (the plan). **On by default
since 5736e23: Matt approved the first pass's taste 2026-10-31** (M toggles, a remembered M wins; `?manual` pages
stay quiet unless `?audio`; `?audio=0` off). Web Audio only, no samples, no dependencies. The greybox-era pass (2026-10-18) is what plays in the wood and the labs; the
test grove keeps its old lantern / giving sounds.

## How it fits
- `AudioDirector` (index.ts), built in main.ts. Reads `game.afterStep` (events + state) and `stage.afterUpdate`
  (camera, render clock); render never imports audio, audio never touches the sim (e2e `smoke.spec.ts`: hashes
  match muted vs unmuted).
- `router.ts` is pure: `route(event)` -> cues (play is in **route-play.ts**, the grove's lanterns / giving in
  router.ts, and giving sounds only in `senses: 'wallet'` rooms), `ambient(snap)` -> the world's own cues per sim
  frame (drips, far voice, ants, claws: dice are `hash01(seed, frame, salt)`, never a stream, so one tape = one
  audio), `layers(snap, cam, clock)` -> targets for the continuous voices. `snapOf(state, scene, tuning)` is all
  the state sound reads (`AudioSnap`, plain JSON: what a tape records), incl. the room id, a story hold, hitstop,
  stagger, the fling she aims (`fling`, `aim` 0..1) and the burning lamps (`lures`: flame, kind, reach).
- The conductor sets `ctx.events` to the step's events, so sounds of many at once can share (three embers going
  out on one landing = one chime phrase, one rush). Rate limits in conductor.ts `GAP` (wings 80 ms, pads, ticks,
  one crack per 30 ms, slowIn 50 ms).
- `conductor.ts` is shared by live and offline; `engine.ts` + `graph.ts` + `voices/`. Buses **world** (the bed),
  **hero**, **combat**, **lantern** (bowls, lamps, moths), **creatures**; each with room and far sends; roll-off
  9 kHz (lantern 15 kHz); `graph.duck` (the bed's gain: held moments) and `graph.muffle` (a low-pass over all but
  the lantern bus: her hurt, the aim) are layer targets; the master goes through a glue compressor and a limiter (round 13, below).
- `bake.ts` (+ `bake-lib.ts` helpers, **`bake-play.ts`** the greybox-era recipes): every one-shot in plain JS,
  1-8 seeded variants, peak 0.9, a 2 ms fade, all but glass rolled off above 7 kHz; ~350 ms to bake at 48 kHz now
  (in idle callbacks live). **`creak` / `rear` variants are lengths** (`CREAK_S`, `REAR_S`): the router picks the
  one nearest the tell, so the creak lasts as long as the brace.
- `tuning.ts` (`AUDIO`): every level; **one-shot levels are peaks, layer levels are RMS** (pre-master; master
  +10). `BEDS` = each room's bed; `LAMP_HZ` / `LAMP_BEAT` = the lamps' pitches.
- **The fling's events and round 7's `slashHit.weight` / `lureSnuff.fling` are read loosely** (route-play.ts
  `FlingEvent`, `Loose`; snapOf casts `player.fling`): the sound built against a sim with and without them while
  they landed. Tighten once the sim's are committed.

## What each sound is made of (2026-10-18 pass)
- **Her moves (hero bus).** Jump = wing (noise BP 1.8 kHz -> 700 Hz in 90 ms + low push); double jump = two wings
  + a whoosh panned across; **wall kick** = wing + `kick` (claw scuff: two catches of BP 1.3-1.8 kHz noise, a wood
  knock 300 / 660 Hz, a push); **glide open** = `wingOpen` (pink BP 420 -> 1.5 kHz unfurl, a membrane snap at
  ~90 ms, a push) every glide, plus the old deep `catch` out of a fall; **glide fold** (let go in the air) =
  `wingFold` (BP 1.3 kHz -> 520 Hz, 0.14 s); dash, land (dust puff + thump on a hard landing, by impact speed) as
  before; **steps** = `pad` on earth (LP 320-460 Hz felt thud + 2-4 litter grains, -40) or the wood `tick` (-42).
- **The blade (combat bus, at the target, never quieter for distance).** Swish per combo step: `slash1` (air
  torn along a band sweeping 650 Hz -> 3.4-4 kHz in 65 ms + a Q 14 resonant "edge" riding at 0.82 of the top +
  a low push), `slash2` (the same falling, the return cut), `slash3` (finisher: 380 -> 2.5 kHz -> 900 Hz, 0.26 s,
  a heavier push, 3 dB up); up +150 cents, down -200; a throw-cut plays slash3 +3. **A blow** = `hitCrack` (the
  meat: modes 96 / 152 / 232 / 365 Hz, a felt LP thud, a 1.7-2.3 kHz crack, a 5 kHz click, a falling squelch
  900 -> 450 Hz, through tanh 1.8) + `hitTick` (the pitch: a wood-glass tick at ~1.45 kHz with 2.32x and 3.91x
  partials, a 75 ms beating ring) pitched per step (0, +204, finisher -498 cents) and by `weight` (light +150,
  heavy -300 and +3 dB). Pogo = `pogo` (membrane bop gliding 92 -> 165 Hz + an air thwip 500 Hz -> 2.3 kHz) + a
  softer crack and tick. **Kill** = `crunch` (a pop gliding 230 -> 80 Hz, 34-44 grains of shell grit 0.9-3.3 kHz
  bunched at the front, a body, tanh) + `killTail` a beat after the hitstop (a falling pink breath 1.5 kHz -> 320
  Hz with sparse settling bits); a big creature adds a `slam`. **Clang** (braced shell, seed-case) = chitin
  modes 790 Hz x 1, 1.47, 2.63, 3.9, 5.2 with beats, a click, a small 165 Hz knock. **Hurt** (her; no voice) =
  `hurt` (a muffled LP 900 blow, a click, a 64 / 102 / 158 Hz thump, a crackle of scales 2-4.4 kHz, tanh) and the
  mix low-passes to 650 Hz for the stagger. `thock` = the blade biting wood (wall, bark, thorns); `bounce` = a
  cap's membrane bwomp; `silkSnap` = a Karplus-Strong pluck ~900 Hz (web cut, a dangler's thread).
- **The lamps (lantern bus).** The nearest burning flame **hums** (voices/lamp.ts): two sines `LAMP_BEAT` Hz apart
  (wick 1.3, lantern 0.9, great 0.6) at **38 cents sharp** of the forest (wick over A4 = 450 Hz, lantern over D4,
  great over D3), faint 2.003x / 3.01x partials, a Q 60 rubbed edge; heard out to 1.6x its pull radius, louder
  with nearness squared, its low-pass opening 380 -> 2600 Hz; the swarm = a 2.3 kHz wing band shivering at 23 Hz,
  panned round at 0.55 Hz; nearing it ducks the bed a little. **Fling**: `slowIn` on the snap (a pink band
  falling 2 kHz -> 280 Hz over a low glide 140 -> 70 Hz: time dropping away), then while she aims a held swell
  (a band rising from half the hum's pitch with the aim, a sine an octave under the hum), the bed ducked to -10 dB
  and the rest muffled (4 kHz -> 1.4 kHz with the aim), the hum 3 dB up; the launch = `launch` (pink rush 300 Hz ->
  1.8 kHz in 60 ms back to 650, a wing snap, a push, panned the way she goes) + a wing; **the ember** (the flame
  going out as she leaves) = `snuff` (its own two tones falling an octave in 0.3 s, into a soft pink *pff*),
  repitched per kind; **the snuff on landing** = the moths: `glintNote` chimes climbing the forest's chord in tune
  (D5 E5 A5 B5 D6 E6 A6 B6 D7, 0.11 s apart; a chain's flames share one phrase) and one `mothRush` (70 small wing
  grains rising 900 Hz -> 2.6 kHz, panned away); a cut-out flame plays the snuff first. Relit embers: a soft
  `slowIn` a fifth up.
- **Creatures (creatures bus, placed in the world).** Beetle brace = `creak` (stick-slip catches speeding up
  50 -> 12 ms apart and rising 45%, each ringing wood modes ~200 Hz x 1 / 2.37 / 4.1; the old burrback 500 cents
  down and louder, a juvenile up); ram = `rumble` (LP 150 noise + scrabbling legs); a ram into a wall = thumpWood +
  a low clang. Hawker / lampwing tell (`enemyNotice`) = `buzzUp` (wingbeat pulses 38 -> 70 a second through a body
  band, swelling); dive = `dive` (pink swoop 2 kHz -> 350 Hz with the beat fading). Dangler tell = `silkTense` (a
  thin tone rising 35% catching 26 times a second + a rubbed edge) and `drop` (a zip 2.6 kHz -> 600 Hz) when the
  tell ends. Old burrback: `rear` (a deep creak ~95 Hz + an in-breath; it has a mouth) for the slam's tell, `slam`
  (modes 38-150 Hz, a long thud, debris), roll = rumble low, bounce, unroll / feint thumps, phase = a sinking
  breath. Ants = `skitter` (3-6 tiny clicks 2.5-4 kHz) about 2.2 a second each while walking within 520 px.
  A hawker snatching a circling moth = one falling chime.
- **The bed (world bus).** The Hush is retired (voice, knock, clock: dropped story); the grove's amber / violet
  zones play only where `BEDS[room].zones`. Wind = the two-band roar / leaf hiss driven by render's `wind()` as
  before (5 dB lower than milestone 1), drips, the far owl; per room `BEDS`: offsets, hiss band, drip rate, owl or
  not (airy in the hatch and canopy, hushed in the hollow, the well and the roots, no owl underground).

## Lanternroot (2026-10-18, memory/lanternroot-art.md "Sound")
`bake-lr.ts` / `route-lr.ts` (called first in `route`): her light is glass and air (glow chime up the chord by fill,
a bell when full, kindle swell, gutter ticks quickening, frost, fan, moss shimmer once per step, gust whump), the
cap's chime pitched per ring and its muffled knock, the answer's chord, the signs' phrase (`signNotes` in `ambient`,
on the sim clock, agreeing with render's `phraseLit`), mend drawn in / landing. `AUDIO.lr` levels, `BEDS['lr-*']`.
Moonwicks are left out of `snap.lures` (no lamp hum). A hall fight: -24.9 LUFS, -4.2 dBTP.
The Gloamweaver's fight (review r1 B5: it was the quietest stretch, -29.8 LUFS; `gloamweaver` was in none of
route-play's creature sets, so its hits made no crack and its tells no sound): `AUDIO.gloam`, a heartbeat `pulse`
under the fight by phase, `hiss` on its rear, the boss events routed in route-lr only for a `gloamweaver` boss. The
driver tape: -21.5 LUFS, peak -1 dBFS, LRA 8.5. A new kind needs adding to route-play's `CREATURES` (and `BIG`).

## Review clips and levels (2026-10-18)
Made from `lab-feel` (the fling toy room) with a closed-loop probe in the sim (a scratch script that steps
`getRoom('lab-feel')` from the same `--at` and prints the DSL), so the page replays it exactly:
- `clips/audio-fight.mp4` (6.7 s): `npm run clip -- --room lab-feel --pickups --at 10900,1700 --pre 0 --audio --ab
  --name audio-fight --script "R33 A1 .99 R+J25 L+A1 J4 L17 J2 L+A1 J6 D+A1 J23 R+A1 J1 .1 J11 R6 J4 R+A1 J23 L+A1
  J15 .8 L+A1 .10 L6 .7 L+A1 .33 .60"`: the beetle braces (creak), a cut glances (clang), its ram hits her (hurt),
  a second brace, she jumps it, three blows from behind (crack + tick), the kill (crunch + tail). -24.3 LUFS,
  -5.3 dBTP (the kill), hits peak -7..-9 dBFS, the bed ~-37 dBFS RMS; 0 clipped.
- `clips/audio-lamps.mp4` (6.0 s): `--at 2400,1700 --script ".40 .10 R20 R+J14 R10 R+B24 U+R2 R30 R+B24 D+R2 R18
  R+B24 U+R2 R50 .90"`: the hum nearing station 2, three flings (snap, held swell, launch, ember), the landing
  frees 15 moths (one 9-chime phrase + rush). -24.3 LUFS, -7.1 dBTP.
- `-nobed` takes (`--ab`): the same without the world bus. A bed alone (wood-hatch, 5 s): -26.6 LUFS.
- Offline render ~4% of real time (6.7 s in 0.26 s), bake ~350 ms.

## Gotchas
- **`?nopickups` strips enemies too**: a clip of a fight needs `--pickups`. Use `--pre 0` so the page's frames
  match a sim probe that starts at `placePlayer`.
- Clips in progress get killed by Vite HMR reloads when others edit files: `vite build --outDir <scratch>` and
  `vite preview --outDir <scratch> --port <p>`, then `--url http://localhost:<p>/opusvania/`.
- Integrated LUFS gates out a quiet bed: with the bed ~12 dB under play, `-nobed` measures the same.
- Web Audio low/high-pass Q is in dB, band-pass Q linear (`band()` converts). An `AudioParam.value` read while
  scheduling ahead (offline) is not the automated value: keep the last target yourself (engine.ts `muffled`).
- The convolver is most of the render cost (one shared, 2.2 s IR). Voices are made only when first needed
  (engine.ts `LAZY`: glide air, pool, steam, glass air, bowls, chord, the lamp hum).
- In `manual` / `frozen` the context is suspended; live listening needs realtime (`?audio`, then any key).
- Agents can't hear: the numbers catch loud, harsh, dense and clicky, not ugly. Matt's ear is the gate.

## The test grove's older sounds (kept while the grove exists)
Lantern bowls (notice A3, rubbed channel, kindle D3 blooming into A3 E4 B4 D4, rest, refuse; lamps an octave up),
the pool, root steam and violet glass air, and giving (memory/giving.md): offer = rubbed glass A4, a creature's
breath answers (exhale / settle), calm breaths slowing, sleep breaths, the carried chord (A4 E5 B5 D5 by seen
level) and its catch, rest notes falling. Git history (e31bab6 .. 875ba79) has the prologue's score.

## The release (the Canopy r11, route-play.ts `release`)
A trap's `lureSnuff` (`trap`): `cageBreak` on the cut (in the hold: 9 brittle inharmonic rings 1.7-4.3 kHz in 25 ms
over a 150 / 318 Hz knock, a pink breath 600 -> 2.1 kHz, 12 tinks of bars landing over 1.3 s), `releaseSwell` once the
hold lets go (D4 A4 D5 E5 coming in 0.32 s apart, in tune, a rising air band 380 -> 1.9 kHz, 3.4 s), one `glintNote`
per count tick (thinned to 16, the great cage 28), climbing `MOTH_CENTS` then up an octave, each 0.35 dB under the
last, and a `mothRush` panned toward the moon as they leave her (two for the great cage, all an octave / 500 cents
down). Timed by render/lantern/release.ts (audio reads it, render never imports audio). Levels `AUDIO.lamp.release`.
The hub's release with the bed: -25.7 LUFS, -7.9 dBTP, 0 clipped (`clips/r11-release-hub-audio.mp4`).

## The score and the Canopy (2026-10-31, round 1; Matt approved the taste)
Brief: docs/design/levels/canopy-moments.md §5 (the director's sound plan) over this file's rules. **Silence is the
default**: no music in a room walked. Clips: `playtest-reports/canopy-audio-r1/` (README there has the numbers).
- **score.ts**: a stateful director inside the conductor (live and offline alike; fed every step, muted or not;
  `__game.audio.score()` = the piece now). Pieces are bars of notes on a sim-frame grid (`AUDIO.score.beat` 56 f; the
  boss's `bossBeat` 60 f = a 4 s bar = the Keeper's swing, re-set from `cageSwing.period / 4`). Each bar's notes are
  cues on bus **`score`** (its own voice pool of 32, never muffled or ducked, its own 3.4 s hall `graph.hallIn`), with
  `dur` / `release` (oneshots.ts lets a held note go). A **cut** (`engine.cut('score', t)`) lets go of everything
  scheduled, even notes not yet started. Pieces: `opening` (on `hatch` + 120 f: Wing's motif A D E F E on harp over the
  forest chord D A E B in rubbed glass, held on E), `glade` (two bars of the theme on a find or a rest:
  `gladeGrant`/`hollowGrant`/`seedTaken`/`patchRest`/`stoneHung`/`healthUp`, at most every 45 s), `tension1/2` (an
  ambush: `snap.arena`; exact col legno 16ths, tremolo pedal D then E flat, the falling fourth D->A in the bass, a drum;
  level 2 adds a high cluster), `clear` (the chord back, the motif's first steps), `wake` / `boss1-3` (below),
  `greatRelease` (the forest chord swelling up two octaves, no motif), `vista` (on `cn-out-vista`: the theme whole,
  harmonised for the first time, 18 bars + the motif going home to D, then A over D, open; it survives room changes).
- **The theme** (`THEME` in score.ts): A = the motif twice over Dm9 Bbmaj7 Gm7 Asus->A / Dm9 Bbmaj7 C Asus->A; B = the
  moths' version (C F G A G: her shape in F) over Bbmaj7 F/A Gm7 A ...; then the motif once more, resolving. Felt left
  hand in eighths, harp melody, glass chords; the vista adds bowed strings.
- **The boss** (old burrback now; the round-12 Keeper's names attach loosely: `bossCue intro/p2/p3`, `cageSwing`,
  `cageFall`, `bossPhase`, the framework's stage): `snap.fight` (router.ts `fightSnap`: the framework's `state.boss`, or
  the old burrback's own phases; its `wake` mode comes back after blows, only a whole one is waking). P1 drum knocks +
  bass pedal + strings; P2 the pulse on the swing's ends, tremolo, her motif sinking chromatically (A D E F | E Eb | D |
  C#); P3 eighths, a cluster, the motif fast in felt octaves. On `cageSwing` the mix muffles in the cage's shadow
  (`player.lit`, `Score.shape`); on `cageFall` the great hum drops an octave. **The last hit** (stage fight -> down, or
  `enemyDie` of a boss kind): the score cut, the ring held 22 f, then `graph.hush` = 0 for 150 f (no bed, no hum), then
  its long breath out (`settle` -700 cents). The rams play the falling fourth on the score bus (route-canopy.ts).
- **Instruments** (bake-music.ts), baked as notes every 3 semitones and repitched <= 1.5: `felt` (modal felt-hammered
  string), `harp` (plucked), `strings` / `trem` / `marc` (5 wavetable voices with their own vibrato through a body),
  `celesta`, `glass` (rubbed: bake-lib `rubbed`), `drum`, `colLegno`. Tuned within ~2 cents (strings ~±6 by ensemble
  spread). **Cost**: ~0.7 s to bake (one idle step per note), ~38 MB of baked arrays (+ the AudioBuffers): the biggest
  thing in the audio; drop the arrays after OneShots copies them if memory bites.
- **The Canopy's world** (route-canopy.ts; `BEDS['cn-*']` with `insects`, `earth`, `echo`): far insects (a trill or
  rasps, never near), the den / roots' earth rumble (voices/canopy.ts `EarthVoice`) and trickles, the well's drip echo,
  the swarm over the hatch heard before it is seen (`RiverVoice`: out of the black over 3 s, closer per press, a breath
  of silence at the breakout then the rush overhead thinning over 8 s), the valley's false lights from the promise lip
  (`ValleyVoice`), lampwings' and hawkers' wings (`FlyerVoice`), burrbacks huffing as they hunt, freed moths stirring at
  lit roosts. The firefly: its call three short one long (`fireflyBlink` 0 = short, 2 = long, at the lamps' sharp
  pitch) on `fireflyStart`, slower on `fireflyEnd`, a blink every 48 f while it flies, `fireflyKindle` per relight, a
  thread and hook on `fireflyHang`. Gates thud shut / groan open; a guarded cage clangs; a cut cage's bar clinks; the
  warning's second beat is a deep slam from the den. The Keeper's `enemyFeed`, `cageDrop`, `mothEaten` (a chime cut
  off), `mothSaved`, `keeperEat`, `keeperSight`, `cageFall`, `cageRelease`, `denCollapse` have cues already.
- **Levels** (master 8.5 now, was 10): the route clips sit at -22.5 to -27.4 LUFS integrated, true peak -3.4 to -8.1
  dBTP but -2.2 in the well's ambush (a pile-up of existing combat sounds, the limiter's); 0 clipped. Score alone: ~-24
  LUFS at the vista, ~-28 in the boss, ~-32 under an ambush.
- **Tools**: `tools/audio/route-audit.ts --tape <dir>/tape.json` (headless: per room the cues, the events with no sound,
  the score's timeline) and `tools/audio/route-clips.ts --dir <route dir> --clip name:from:to` (mp4s with sound from a
  route-video tape; `--wav --stems` for the score / bed / rest alone). Plan the tape with `route-video.ts plan`, and
  build a frozen copy for the page (the level lane's WIP broke both the dev server and vitest mid-round).
  **A whole playthrough with sound** (2026-10-31, video v12): `route-video.ts plan --out <dir>`, then `render --out
  <dir> --url http://localhost:<port> --audio` (adds `?audio`, records the director's tape from step 1, renders it in
  2-minute windows with `__game.audio.render({ from, to })`, cross-fades them and cuts the sound where the still
  stretches were cut: sound within a sim frame of the picture). raw.mp4 and `<name>.mp4` carry AAC, `audio.wav` the
  track. The whole Canopy (6 min of sim) renders in ~15-25 min under load; the windows add seconds. Offline renders
  now switch the scene per room (`sceneOf`: materials, pools and lure kinds were the render-time room's before).
  Windows agree to -46..-56 dB where they overlap, except a bed whose noise phase hangs on when its engine was
  made (v12's first seam, in the fork: uncorrelated, so the 0.5 s cross-fade dips ~3 dB, not heard).
  **v15 video** (route-video v10, 6:19, frozen `vite build` + `vite preview` on its own port, url `.../opusvania`):
  -16.3 LUFS, -4.3 dBTP, 0 clipped; parts at crf 25 run ~0.2 MB/s, so <= ~85 s per part stays under 19 MB. The
  still-cut used to chop the column, the sit and the last hit's silence (it cut any 1.5 s where her box did not
  move): render now holds quiet moments, the sit, story holds and `boss.stage === 'end'`. The great cage's break
  sounds ~0.35 s after its picture when cut inside the hush (`silenceFrames`): the hush wins, by design.
- The hub's music is the cage's hum and the bed only (the director's plan, not the original brief's "theme at the hub").

## Round 13 (2026-10-31): loud enough, the Keeper retimed, the chase, the trap, the duet
Clips and numbers: `playtest-reports/canopy-audio-r13/README.md`.
- **Loudness.** A whole playthrough measured -24.4 LUFS integrated, -2.3 dBTP (too quiet on a phone). The master is
  now `AUDIO.master` 20 into a **glue compressor** (threshold -10 dBFS, 10 dB knee, 3:1, 12 ms / 300 ms) and a
  limiter (-1.5, 20:1, 1 ms / 100 ms), each one's automatic make-up taken back by `trim` (graph.ts `makeup`; it
  matches Chromium's within a dB), so the master alone sets the level. Whole route (6 min): -24.4 LUFS / -2.3 dBTP
  before, **-16.0 LUFS / -4.2 dBTP after** (LRA 8.3); clips -18..-14.6. The duet sits 5 dB under (`duetDb`).
  **How it was tuned without 6-minute renders**: render the route's WAV once (route-clips `--wav`), then run that
  WAV through candidate chains in Chromium's OfflineAudioContext (a plain-node playwright script: tsx's `__name`
  helper breaks `page.evaluate` of a typed arrow) and measure with ffmpeg `ebur128=peak=true`; the simulation
  agreed with the real render to ~0.8 LU. A glue threshold of -22 squashed (+9 dB of master bought +2.6 LU).
- **The last hit's silence** tails in: the ring held 22 f, then `hush` falls as (1-k)^2.2 over `tailFrames` 48 (the
  den, the hall and the room ringing out), silence to 150 f, the breath, the world back over `returnFrames` 50
  (score.ts `shape`, frame by frame; engine's hush glide is 0.05 s now).
- **The Keeper** (score.ts `boss`, retimed to 16 hp / P1 two drops / P2 >= 756 f / P3 three sweeps): P1 over a D
  pedal (Dm, Gm/D, Eb/D, A: the flat second's dread), growing with the bars (col legno eighths from bar 2,
  sixteenths from bar 5). P2's bar is one swing (`cageSwing.period` / 4 = 63 f): a **three-swing phrase**, her
  motif sinking A D E F | E Eb | D C# (strings, then felt octaves on the next cycle). P3 four bars, a bass ostinato
  from bar 5. **Seen** (`snap.seen` = `boss.lit`): `player.lit` is ~0 all through P2 even in the cone (measured on
  the keeper tape: seen 38% of P2's frames, 12 flips, `player.lit` > 0.3 on 16 frames), so the r12 muffle by
  `snap.lit` was dark the whole phase. Now the world's low-pass (`darkHz` 950) AND the score's own (`graph.scoreTone`,
  layer `scoreHz`, `darkScoreHz` 1700) close in the dark and open when it sees her; `keeperSight lit` stabs the
  score (drum, the D, a high E-F tremolo, Eb strings; one a `stabGap` 90 f). Events (route-canopy.ts):
  `keeperGlance` gate = a dull thump + snort, lit = a dull clang; `keeperLunge` = a sharp in-breath + scrape (+ the
  score's struck D; the windup's creak is route-play's); `keeperGuard` = a short rear + clang; `cageGuard` on =
  claws on bars, off = two bright clinks a fifth apart (now you can cut); `keeperEat sweep` = a creak sized to the
  tell; `keeperSweep` = a low dive, scrape and a panicked moth rush.
- **The chase** (piece `chase`, `chaseBeat` 24 f): the call's rhythm (three short, one long, twice a bar) in celesta
  38 cents sharp; while it flies a felt pulse in tune under it (D A D E), close (`chase.lead` < `chaseClosePx` 520)
  her harp runs the forest's chord; each `fireflyKindle` adds a held sharp glass tone of `CHASE_CHORD` (D A E B F#
  C#: the forest's fifths overreached) and plays it as the phrase's next note (score.ts `stings`); `wait` = the
  alarm alone. `fireflyChase` start = 7 bright pings, wait 3, go 2; **nest = a dead stop** (cut 0); `call` = one
  slow call. `snap.chase {beat, lead}`.
- **The trap** (`trapFill`, 40 moths over 180 f): each a wing flutter and a glintNote at the cage's sharp pitch,
  delayed onto the hum's beat grid (`LAMP_BEAT`), the grid coarsening 1/8 -> 1/4 -> 1/2 -> whole beats as it fills,
  the early ones jittered (irregular), the last exact; the far stream is the river voice at `streamDb`, thinning;
  a `clear` / `glade` gives way to silence on the first moth. `denStir` = the deep slam far below (moved from the
  `cn-tunnel-beat2` flag), a rumble, grit. `snap.fill`.
- **The duet** (piece `duet`, 3/4 at `duetBeat` 42, `Piece.meter`): on `kinSit` (once), the bed ducked to
  `duetDuckDb` -22; her motif on harp, the kin's line (F E F A G F E ...) on felt a bar behind, a third above, a note
  ~20 cents flat twice and one that catches and is struck again; ends on her E over its D; kept across a room
  change (it finishes). The kin's wings: `wingOpen` twice, the second cut short.
- **Grants** (piece `grant`, 4 bars): `gladeGrant` and every `hollowGrant` but a `moonShard` always get their moment
  (they bypass `gladeGapS` and cut a glade); a shard is a glade find.
- **Cheap fixes of the r1 weaknesses**: the theme's A section was i-VI-iv-V (the commonest minor progression): now D
  Dorian (G/B, the forest's B natural), Bbmaj7#11, and A with its second, not its C# (only the vista's last turn
  keeps a C#). The bowed section: a body of seven resonances instead of two formant bands, each player scooping into
  the note, drifting a few cents and leaning on the bow unevenly. Still wavetable saws underneath.
- **Gotcha: the gap's dark hooks were relit and put out again every frame** (`lureRelight` x5 a frame, 3,878 in the
  route before the chase: sim, `tickLures` vs the `after` lamps): 259 slowIn swells in 13 s. route-play now sounds
  a relight only if that flame is still burning in the step's snap.
- **Scratch dirs**: the orchestrator's scratchpad is shared by every agent: use a unique subdir (a `route/` there
  held another agent's stale head.txt / wip.diff).

## Round 14 (2026-10-31): the Keeper's tells, the column, the escape, the chase's return
Clips and numbers: `playtest-reports/canopy-audio-r14/README.md`. Tests: `tests/unit/audio-r14.test.ts`.
- **The sweep's tell is danger, not food** (review r13): `keeperSweepTell` = `sweepTell` (claws raked back over stone,
  scratches 110 -> 30 ms apart, a hiss through its teeth rising 1.8 -> 4.6 kHz; pitched to the tell's length) + the
  score's stab (a tremolo cluster Eb5 E5 Bb5 held for the tell over the bass's E flat). The claws (`keeperSweep`): the
  low swoop, scrape and panicked rush, a drum and the struck D. Only `keeperEat sweep: true` is wet now: three crunches
  and a breath out. (r13's creak on `keeperEat sweep` was the tell; the event moved.)
- **P1's rage beat** (`keeperRage`): `rear` = `roar` (it has a mouth: an in-breath, then a growl through two formants
  opening, beaten at ~31 Hz over a sub falling 78 -> 52 Hz, its plates grinding) + the rear creak, and **the score
  stops dead** (cut, no boss music until the slam: `rageHold`); `slam` = slam + `rockLand` + grit from the roof, a
  stinger (drum, low D, E flat against D) and boss1 starts again on it, **angry** (`fight.angry` >= 2: col legno
  sixteenths at once, the drum on every eighth, Eb5 E5 tremolo high, the bass in octaves). P2 / P3 are always angry.
- `keeperGate` on = a dull low knock and a snort (the shell clamps); off = a short creak up and a breath in.
  `keeperRoll` = a low grinding rumble, scrape, a thump where it stops (into the last hit's tail: it fades with it).
- **The column** (piece `column`, replaces r1's `greatRelease`; queued at the great cage's hold end): her motif
  carried home for the first time, 150 bpm (16th = 0.1 s): A D E F E over B flat and C (harp, the bowed section an
  octave under), then **D at 1.6 s** with the area's one major third (F#3 in the strings), the forest chord in the
  moon's register and the celesta climbing D6 E6 A6 B6 D7 after the moths. The great cage's `releaseSwell` sits 4 dB
  back under it; the roof's groan is far and low (it comes 1.1 s into the column). A great release in the last
  hit's silence ends the silence.
- **The escape** (piece `escape`, on `escapeStart`, loops; the column's last chord is not cut): the theme's heroic
  turn, D minor, B flat, C, A (then B flat, F/A, G minor, A), marcato eighths with octave pushes, a galloping drum,
  col legno 16ths, tremolo chords; her motif in octaves on the strings (bars 1-4), the moths' version (bars 5-8) with
  the harp running sixteenths (the cloud leading); felt doubles the tune from her first checkpoint; Eb6 E6 tremolo
  while the front is within `escapeNearPx` 380 under her. A checkpoint = a celesta bell climbing A5 D6 E6 A6 (and a
  glass chime pair in tune on the lantern bus); a hit muffles the score for its hold (it goes on where it was).
  `escapeEnd` -> piece `escaped` (kept across the room change): B flat, C, then the forest chord over D with her A on
  top, open; the vista's theme takes over at `cn-out-vista`.
- **Rocks heard where they fall** (`rockfall`, placed in the world at the rock's x, so panned): tell = `rootSnap` (a
  dry crack, splinters, sifting) + a creak sized to the tell + trickles spread over it and rising; fall = a swoop down
  + a smaller snap; land = `rockLand` (stone: a 52-140 Hz body, inharmonic knocks, gravel, dust).
- **The collapse front** (`CollapseVoice`, layers `collapse` / `collapseHz` / `collapsePan`, from `snap.escape` =
  `kit.escape` with `gap` = front minus her feet): brown-noise earth under a low-pass opening 110 -> 490 Hz as it
  nears and rises, a tumble band beaten unevenly, grit; `collapseDb` -27 RMS at its nearest. `collapseFront start`
  = a deep slam and a snap; it fades when the escape ends.
- **The chase's `back`**: a soft swell at the hook, a wing, the firefly's two pings; the piece never restarts: while
  `chase.hold` > 0 (she drifts at the hook) the bars play the waiting texture (alarm + the kindled chord), then the
  pulse again on the same grid. A chase begun again in the same room picks its bars up where they were
  (`chaseOff`) and keeps its kindled chord (r13 reset it to nothing).
- **Levels** (clips in the README): the whole fight + column + escape + vista (93 s) -15.2 LUFS / -4.5 dBTP, LRA 7;
  the column the loudest stretch (momentary -12.9 / -11.7), the escape -12.6..-14, the rage beat -17 -> -14; P3
  close-up -13.8; the chase with a fall -14.4. 0 clipped.
- **Clips**: `keeper-tape.ts --lag=15 --escape` then append `R30 .360` (walks into `out-vista`), `npm run clip --
  --room cn-den --at 300,320 --abilities wallJump,glide --pickups --wide --audio`; 93 s at 60 fps crf 16 is 72 MB:
  re-encode `-r 30 -crf 25` (14.8 MB). A frozen build (`vite build --outDir <scratch>`, `vite preview --strictPort`)
  kept HMR out of the 6,000-frame capture. The chase with a fall: chase-probe's plan, held past hook-6 once, then
  after `back` press Lamp again (the drift ignores a press until a few frames in: retry every 11 frames).
- **Gotcha**: a sting's 16th is `AUDIO.score.beat / 4` (0.23 s), not the piece's.
- **Weak still**: the roar and the rake are synthesis an agent cannot hear (Matt's ear); the escape's strings are the
  same wavetable section as the boss (it can sound like more boss music, not a new colour); the column's resolution
  comes 1.6 s in and the bot's quick cut can shorten the last hit's silence to ~1.9 s.

## Round 15 (2026-10-31): the wave, the escape fitted to the new way out, the catch, the sit's beats, quiet moments
Clips and numbers: `playtest-reports/canopy-audio-r15/README.md`. Tests: `tests/unit/audio-r15.test.ts`.
- **The slam's wave** (`keeperWave slam`; snap `waves` from `EnemyState.wave / waveX / waveWait / fromY`): at the slam
  `fissure` (the crack opening at its feet: splits coming faster over a swelling groan, 0.24 s = the 12-frame delay) and
  a low rumble; at `frames` / 60 the fronts tear out (`rockLand` -600 + `rootSnap` -900); then each front is heard where
  it runs: `waveGrit` (earth grinding, gravel, a shove; 0.16 s) every `waveEvery` 3 frames at x +- `wave` on the floor,
  placed in the world (it travels and pans), 9 dB down over 1,400 px of run. The tell (`phase: tell`) adds nothing: the
  rear's creak is route-play's.
- **The escape** in three sections (score.ts `escSec`, each from its own bar 0, `escFrom`): `run` in cn-den (r14's
  drive), `down` in cn-out before the front (no gallop: a D pedal ticking, a heartbeat drum, cellos sinking D C# C B,
  D + E flat held, her motif falling away in the harp), `climb` once the front is on (an A pedal held to the clifftop;
  her motif climbing in sequence A D E | F G A | B flat A G | A E; phrase 1 strings in octaves, 2 an octave up with felt
  and the harp running, 3 the long chromatic climb A B flat C C# with everything up; the phrase is max(by `rise` past
  `climbRise` [0.3, 0.62], by bars into the section / 4)). 'escape' is kept across the room change (r14 cut it). The
  scream (Eb6 E6) only when the front creeps under `escapeNearPx` 222 (it keeps ~240 and creeps to 200 while she
  lingers). The vista flag and `escapeEnd` land on the same frame at the chimney's mouth: `escaped` (3 bars: B flat,
  C, D) then the vista's theme (`vistaAfter`), never cut. Human-paced tape (pauses at each stand): run 7.8 s, down
  7.8 s, climb 10.7 s, escaped 4.8 s.
- **The front's rumble** narrower: `collapseNearPx` 170, `collapseFarPx` 330 (r14's 700 kept it at ~full the whole
  climb now the front holds ~240 under her); before the front (`escape` with `front` -1) the roof coming down behind
  her, `behindDb` -36, dull (95 Hz), panned to the den's side.
- **The catch** (`flingStart` on a `Lure.hook` while `snap.chase`): `hookPull` (air drawn in rising 350 -> 2.2 kHz over
  0.26 s, her wings snapping open on the flame, a push) + the score's sting on the chase's 16th: the harp up D4 A4 E5
  into the celesta's sharp note of the next chord tone (she meets its light). The air thickening as a hook comes into
  reach: `slowIn` +500 cents at `catchAirDb` on `hero.catchK` rising from 0 (router `creatureCues`). **Rests**: snap
  `chase.rest` (catchK > 0, the hook in reach is one of `chase.rests`): the bars play the waiting texture (the call
  and the chord, no pulse) and on arrival a breath (D4 A4 E5 glass, in tune, and her harp's A).
- **The sit's beats** (`kinBeat`; the duet's notes now come on the beats, `DUET_PHRASES`, the duet's 16th, `duetDb`
  under): `come` her motif on harp over the glass chord, `look` the moon in celesta, `open` the kin's F E F (felt) and
  its wings (wingOpen, the torn one cut short), `try` its reach for the A: a trem A5 35 cents flat straining + `kinTry`
  (a torn membrane fluttering, swelling, twice catching), `fail` the A gone, E caught and struck again flat, a low thud,
  wingFold -500 + scrape + pad, `turn` nothing but the air (a faint glass D A), `answer` (her 1) her motif rising
  quickly as her wings open + the kin's A5 reached **in tune**, `fold` G F E, `lean` her E over its D. Unanswered (her
  0): the kin's line alone, flat. `stay` ends the duet (notes ring). `kinSit` itself = three soft pads (it shuffles).
- **Quiet moments** (snap `quiet` = `kit.quiet.why`): the bed ducks `quietBedDb` (column -8, sit -12, vista -6; the
  duet's -22 still under it); a find's music (`grant`) never plays inside one: it waits (`grantWait`) and comes 60
  frames after; a grant begun just before `kinSit` (the glide at the crown ~3.7 s before the sit) gives way and comes
  back after the sit, with the HUD's line. No glade phrase in a quiet moment. The great cage's count chimes (they tick
  with the HUD's count, which steps out of the column) sit `quietChimeDb` -6 back.
- **Tapes**: a scratch copy of keeper-tape with `EscapePlan({careful, lag 15, delay 16})` and a pause of 150 + 25k
  frames at each chimney stand, 40 at the pocket, 50 in the den; after `escapeEnd` keep the plan 35 frames (she is in
  the air at the chimney's mouth: idle input drops her back down it) then idle. The chase: chase-probe `--beat=12` with
  80 idle frames at hook-3 / hook-5 (she hangs). The sit: cn-crown at 1900,1024, kit wallJump, `.20 R50 .20 L40
  .1250` (the grant at 31, kinSit at 254).
- **Gotcha**: the other lane's WIP can sit in the shared tree; a scratch `git worktree add --detach <dir> HEAD` with my
  src/audio copied in gives tapes and a frozen build against the committed sim.
- **Levels**: the Keeper -> vista clip -13.8 LUFS / -4.5 (sections -12.7..-15.5), the slam close-up -14.6, the chase
  -14.2, the sit -14.6 (mostly the grant's music around it). 0 clipped.
- **Weak still**: the wave's fronts (`waveDb` -21, world-placed) sit under P3's dense score and the glue: an agent
  cannot tell from the waveform that they read; if Matt can't hear them, raise `waveDb` / duck the score on the slam.
  The climb's strings are still the boss's wavetable section. The duet's beats are short (0.6-2 s): phrases overlap
  the next beat's by design, untested by a human ear.

