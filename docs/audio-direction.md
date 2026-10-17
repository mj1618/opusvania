# Audio direction

Sound is made in code with the Web Audio API: no samples, no libraries. Like the visuals it is dark,
quiet and sparse. The owner "really hated the sound effect" of the old game (ZzFX blips sliding in pitch,
a *boop* per jump), so restraint comes first: most events make no sound, and nothing ships unmuted until
he has listened and said yes.

The hero is **Wing** (code id `vesper`). **Story note (2026-10-16):** this doc was written for the dropped
"Kept World" story. The sounds in §1 describe what the demo level plays today, so they stay. "The Hush" is
that story's antagonist and survives here only as the name of an audio layer. The new story is in `memory/story.md`
(false lights hung by the last firefly; the dark is safety). When audio work resumes, re-aim the rules at it. For
example, "regular is the enemy" could become the lamps' steady hum against the forest's irregular life.

## 0. Three rules

1. **Mouths breathe; Wing doesn't.** Things with mouths (the Hush, burrbacks, Tallow) make breath and vowel
   sounds. Wing never vocalises: no gasp, no cry, and none of her instruments is blown. Her sounds are
   touched, plucked and fluttered. Formants, the vowel resonances of a voice, belong only to things that eat.
2. **Regular is the enemy.** The Hush keeps one slow, exact clock. The forest never repeats. Where root
   has reached, the forest's sounds drift into step with the Hush. Things turning regular is how the
   player hears the root arrive.
3. **Depth is atmosphere.** Farther sounds are duller, wetter and wider; nearer ones drier. The foreground
   is almost silent, the way it is almost black.

## 1. The sound of the world

### The Hush
**Its breath**: a very slow swell, about 9 s in and 9 s out. Band-passed brown noise through two formant
filters gliding between *oo* and *aa*, too low and soft to read as a voice: felt more than heard. In the
Grove it is under the soil, low-passed, as faint as the root steam you see.

**Its one pulse**: two low tones 0.24 Hz apart (D2) beat once every 4.2 s, a swell with no envelope to
click. Each swell carries a soft wooden knock, panned a touch left, then a touch right. **Left, right: the bat-and-ball game, slowed by forty
years.** Nobody is told; at the midpoint the screen in the lab plays the same two knocks fast (§2).

**The world breathes with it.** Where root has spread, ambience is gently modulated by the breath: gusts
swell on the in-breath, drips cluster on it, steam hiss rises. In clean forest that depth is zero; in the
overrun Grove it is strong and the forest sounds mechanical.

Laptop speakers can't play D2: soft saturation harmonics (110–330 Hz) carry it and the ear fills in the
fundamental.

### The forest
The opposite: irregular and giving.
- **Wind** in two bands (canopy roar, leaf hiss), driven by **the same wind function that sways the grass
  in render**, sampled at the camera. When a wave crosses the screen, you hear it cross.
- **Drips** after rain: rare, seeded, at canopy positions, filtered by depth; leaf tap, bark tick, pool
  plink, each a tiny modal resonator, not a sine chirp.
- **One far voice**: a two-note owl- or frog-like call (low-index FM, not a cricket), never on a beat.
  The forest's own mind; it goes quiet when root is near.
- **Zones** by camera x: the blue left cold and airy, the amber centre warm with root steam under the
  light-well, the violet right glassy. The pool laps faintly.

### Wing
She is light, so she is quiet, and every movement sound is unpitched: air, felt, scale-dust.
- **Wingbeat** (jump): one soft *fff*, noise band-passed from 1.8 kHz down to 700 Hz in 90 ms. Double
  jump: two beats and a whoosh that pans across her as she turns.
- **Glide**: the *catch* as the wings open, scaled by the `glideStart` fall speed (a soft deep *whumpf*
  out of a long fall, almost nothing after an apex), then a near-silent airflow following `vx`, released
  at `glideEnd`, never cut.
- **Dash**: the two wind-up frames are silent (the hold *is* the sound), then a short tearing gust.
- **Land**: a puff of scale-dust; a `hard` landing adds a low thump in the ground's material. Steps are
  silent on moss, the faintest tick on wood. **Wall slide**: a sparse scrape of claws on bark.
- **Thorn slash**: a thin dry hiss, filter shifted per combo step, the finisher fuller. **A hit** is a
  wooden-glass tick whose ring is *held for the hitstop frames*, freezing with the picture.
- **Hurt**: no voice; a crackle of scales and a quarter-second low-pass on the whole mix. **Fade**: her
  sounds stop; the world goes on. **Re-form**: the lantern's bowl swells and gives her back.

### Glints, lanterns, creatures
- **Glints** are glass: small modal bells pitched from the forest's chord, with a long tail. `pickupWake`
  is a barely audible shimmer. In a combo pitches climb the chord and then *fall back*, so a run is a
  phrase, not an arcade ladder.
- **Lanterns** are cocoons hardened like glass: singing bowls. `lanternNotice`: the dormant bowl rings
  faintly *at the pitch of the light she carries*. Channel: a rubbed rim swelling. Kindle: the bowl blooms
  into the forest's chord. Rest: a low steady hum. Refuse: the rubbing stops on a hollow knock. **A lit
  lantern muffles the Hush** (low-passed, breath modulation gone): safety is audible. Wayside lamps are
  smaller, higher, single-partial bowls.
- **Burrbacks** were badgers and have mouths: they huff, and **their gait falls on the Hush's clock**.
  The brace is a rising creak of root (the creak *is* the countdown); the ram a low rumble; a wall stun a
  thud and a ringing shell. Calmed, they breathe slower, *out of step* with the pulse.
- **Lampwings** were fireflies, now its eyes: a fast exact wing hum and a thin glassy lamp tone. The
  **tell** narrows and raises the tone; the dive is a darkening swoop; on `enemyNotice` the tone snaps to
  the pitch of her carried light.

## 2. The score

### Pitch world
Home is **D**, modal. The forest is in just intonation; the Hush is detuned so it beats.
- **The Hush: D falling to A.** A falling fourth alternating at the pulse: the rally, its only game.
- **Wing: A rising to D, then E, F, back to E.** Her motif *starts with the Hush's interval turned upward*
  (the same two notes, going somewhere) and stops on E, unresolved. She never reaches home on her own.
- **Sorrel: a 3/4 lilt circling her top notes** (F E F A, G F E), a third above her when they play
  together, so the two in canon make the moths' dance. His is the only music you could dance to.
- **The forest: a chord, not a tune.** Stacked fifths (D A E B), open and generous; every glint is one of
  its notes. Now and then, far off in glass, it quotes Wing's first three notes: it carved a moth in stone
  and knows her kind.

### Instruments (all synthesis)
- **Wing**: plucked strings (Karplus-Strong, felt excitation, like a small harp) and struck glass. Never
  blown, never voiced. **Sorrel**: the same strings, brighter and hammered, with a wing tremolo.
- **The Hush**: breath and pipe: formant-filtered noise, a low blown pipe (noise into a tuned comb), the
  beating tones. From the lab on, the breath carries a metal resonance: the throat is pipe.
- **The forest**: modal glass bells, rubbed glass (noise-excited resonators), granular seeded noise.
- **The maker**: the only human-made timbre, one warm, slightly out-of-tune low FM note.

## 3. What the player learns from sound alone

- **Carried light makes a tone.** While she holds glints a faint chord of their pitches hangs around her,
  louder the more she carries (the ember adds a warm crackle): "it sees only mouths and light", made
  audible. Dark and empty, she is silent. Hiding, her flaw, is the quiet.
- **The Hush listens.** When she carries light near root, the pulse *slows* and its breath holds at the
  top; lampwings' tones snap to her pitch. A dragging pulse means danger.
- **Regular means root; muffled means safe; on the beat means a servant.** Dun's turn is heard (its breath
  off the beat) before it is understood. The midpoint recasts the whole soundtrack: the pulse was a game.
- **Tells are audible**, so a player who listens plays better.

## 4. Technical plan

### Where it lives
A new directory, **`src/audio/`**, a peer of `src/render/` under the same contract: it reads sim state and
events, never changes the sim, never imports Pixi; render never imports it. (CLAUDE.md's directory list
and a `memory/audio.md` need adding when it lands.)
- `index.ts`: `AudioDirector`, built in `main.ts` beside `RenderStage`. It takes events from
  `game.afterStep` (as `stage.ts` does) and a per-frame `update(dt, clock, view)` with the interpolated
  player and camera, for panning, distance and zones.
- `router.ts`: **pure** `(SimEvent, state) → Cue[]`, no AudioContext, unit-tested over real sim tapes.
- `graph.ts`: buses (`world`, `hero`, `creatures`, `score`), one shared reverb send plus a "far" send, a
  gentle limiter. `voices/`: one file per family (wind, hush, wings, glass, bowl).
- `bake.ts`: one-shots rendered into `AudioBuffer`s at boot in plain JS (Karplus-Strong, modal glass,
  wingbeat variants, a seeded ~2.4 s reverb impulse). Plain JS sidesteps Web Audio's 128-frame minimum
  delay in feedback loops, which caps live Karplus-Strong near 375 Hz.
- `tuning.ts`: every level, period and pitch. `clock.ts`: `hushPhase(frame)`, pure, so render can later
  make root steam and veins breathe in time.

**Continuous layers are state-driven; one-shots are event-driven**, so unmuting mid-play or after a
`teleport` is right at once. In `manual` and `frozen` modes the context is suspended.

### Determinism
No `Math.random`: everything generative uses a mulberry32 stream seeded from the scene seed and keyed by
sim frame and event index, so one tape always gives the same audio. That enables offline review:
`npm run clip -- --audio` renders through an `OfflineAudioContext` and muxes it in (as git `5356f7b` once
did). Agents check peak, loudness, spectral centroid and sounds per second; the owner listens.

### Mute, volume, debug
**Default: muted.** `M` toggles (kept in `localStorage`); `?audio=1` overrides for clips. While muted **no
AudioContext exists**, so it costs nothing; the context is made in the first real gesture after unmuting.
Master and per-bus volume in Tweakpane. `__game.audio`: `state()`, `mute(bool)`, `volume(bus, v)`,
`cues(n)` (the last cues routed, so tests need no sound).

### CPU budget
Under 3% of one core on a mid laptop: at most 12 continuous voices and 16 one-shots (stolen by priority
and distance), one-shots as baked buffers, two convolvers, no `ScriptProcessorNode`, no AudioWorklet in
the first milestone, baking under 150 ms in idle callbacks. Check: 60 s renders offline in under 3 s.
Tests: the router's mapping and its determinism over golden tapes; e2e confirms muted by default.

**No new dependencies.** Tone.js and the like add weight, and their stock synths *are* the cheap-synth
sound; ZzFX is what the owner hated.

### First milestone
1. **The Grove's ambience**: two-band wind from render's wind function, seeded drips by depth, the three
   zones, the pool, the far voice, the Hush faint under the soil.
2. **Wing's movement**: wingbeat, double-jump flutter, glide catch and airflow, dash, landing puff (soft and
   hard), wall-slide scrape; moss footsteps silent. No slash, glints or creatures yet.
3. **The lantern kindle**: notice, channel, kindle, rest, refuse, and the lit lantern muffling the Hush.

All behind the mute toggle, **default muted**. Deliverable for the owner: a 40–60 s clip with audio of a
scripted run (idle in the blue zone, run, jump, glide, dash, a hard landing, kindle the first lantern) and
a take without the Hush layer, for an A/B. The default flips only when he approves.

## 5. Risks, and how to avoid "cheap synth"

- **Raw oscillators** (a bare sine or saw with an ADSR) sound like toys. Every tone is filtered, slightly
  inharmonic or detuned, has noise in its attack and goes through the reverb.
- **Pitched blips on movement**, the old game's sound: banned. Movement is air, felt and dust.
- **Repetition.** 4–8 baked variants per sound, round-robin, seeded ±1 dB and ±40 cents; per-family rate
  limits (wingbeats at least 80 ms apart).
- **Too much.** Most events are silent. Movement peaks −26 to −20 dBFS, ambience near −32, the mix below
  −6. When in doubt, cut it.
- **Harshness and clicks.** Roll off above 9 kHz except glass; keep 2–4 kHz gentle. Every gain change ramps
  at least 5 ms; exponential ramps never target zero.
- **Fatigue from the pulse.** Keep it below conscious level with long near-absences; it should be noticed
  when it *changes*.
- **The generic "fantasy pad"** of big detuned saws: use rubbed glass, breath and string instead.
- **Agents can't hear.** Measurements catch loud, harsh and dense, not ugly. The owner's ear is the gate:
  every milestone ends in a short A/B clip for him, never in "it passes the checks".
