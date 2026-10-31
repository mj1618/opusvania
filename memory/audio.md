# Audio (src/audio)

Brief: `docs/audio-direction.md` (the rules) and `docs/design/look-and-sound.md` §6 (the plan). **Muted by default;
Matt has not approved any of it yet** (M toggles, kept in localStorage; `?audio` on, `?audio=0` off). Web Audio
only, no samples, no dependencies. The greybox-era pass (2026-10-18) is what plays in the wood and the labs; the
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
  the lantern bus: her hurt, the aim) are layer targets; a limiter at -2 dB a normal mix never reaches.
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

## The release (the Canopy r11, route-play.ts `release`, still muted)
A trap's `lureSnuff` (`trap`): `cageBreak` on the cut (in the hold: 9 brittle inharmonic rings 1.7-4.3 kHz in 25 ms
over a 150 / 318 Hz knock, a pink breath 600 -> 2.1 kHz, 12 tinks of bars landing over 1.3 s), `releaseSwell` once the
hold lets go (D4 A4 D5 E5 coming in 0.32 s apart, in tune, a rising air band 380 -> 1.9 kHz, 3.4 s), one `glintNote`
per count tick (thinned to 16, the great cage 28), climbing `MOTH_CENTS` then up an octave, each 0.35 dB under the
last, and a `mothRush` panned toward the moon as they leave her (two for the great cage, all an octave / 500 cents
down). Timed by render/lantern/release.ts (audio reads it, render never imports audio). Levels `AUDIO.lamp.release`.
The hub's release with the bed: -25.7 LUFS, -7.9 dBTP, 0 clipped (`clips/r11-release-hub-audio.mp4`).

## The score and the Canopy (2026-10-31, round 1; still muted, Matt has not judged it)
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
- **Not yet** (round 13 in the plan): the chase cue, the capture (wings falling into the hum's beat: `trapFill`), the
  crown's duet (`kinSit`), the collapse's escape; the hub's music is the cage's hum and the bed only (the director's
  plan, not the original brief's "theme at the hub").
