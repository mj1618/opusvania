<!-- `npm run feel:report -- --all-presets` on main after the L2 merge. Definitions: memory/feel-report.md. -->

# Feel report (2026-09-28)

Build 08ad71347d, sim 9020d2324b. Envelope = [min, max] of Celeste and Hollow Knight (movement-spec §3.4); **OUT** = outside by more than 15%, near = outside by up to 15%.

## Preset `opus` (70 ms)

| Metric | Value | Celeste | HK | spec opus | Verdict |
|---|---|---|---|---|---|
| Full jump height (tiles) | 4.31 | 3.35 | 5.6 | 4.31 | in |
| Full jump height (bodies) | 3.45 | 2.4 | 4.4 | 3.45 | in |
| Time to apex (s) | 0.43 | 0.35 | 0.52 | 0.43 | in |
| Air time, flat full jump (s) | 0.85 | 0.65 | 1.02 | 0.85 | in |
| Tap / full height (ratio) | 0.28 | 0.25 | 0.23 | 0.28 | near (+3%) |
| Apex dwell (within 10% of apex) (f) | 18 | 13 | 18 | 18 | in |
| Effective fall/rise gravity (ratio) | 1.73 | 3 | 1.6 | 1.73 | in |
| Run speed (tiles/s) | 9 | 11.25 | 8.3 | 9 | in |
| Frames to full run speed (f) | 3 | 5 | 0 | 3 | in |
| Flat running jump distance / height (ratio) | 1.78 | 2.2 | 1.5 | 1.8 | in |
| Dash distance (tiles) | 4.5 | 4.5 | 5 | 4.5 | in |
| Dash duration (s) | 0.22 | 0.15 | 0.25 | 0.2 | in |
| Dash speed / run speed (×) | 2.5 | 2.7 | 2.4 | 2.5 | in |
| Max fall (tiles/s) | 20 | 20 | 20 | 20 | in |
| Coyote time (ms) | 100 | 100 | 40 | 100 | in |
| Jump buffer (ms) | 100 | 80 | 40 | 100 | **OUT** (+25%) |

Other: stop distance 10 px, turn-around 5 f, full jump 276 px in 26 f, tap jump 76 px, player height 80 px.

**Forgiveness** (press-timing windows while running; a wider window = more forgiving):

| Jump | Assists on | Assists off | Gain |
|---|---|---|---|
| run-up jump across a 6-tile pit (max flat jump 7.7 tiles) | 19 f (317 ms; steps 100–118) | 10 f (167 ms; steps 104–113) | 9 f |
| running jump over a 2-tile pit onto a 4-tile ledge (max jump 4.31 tiles) | 32 f (533 ms; steps 73–104) | 21 f (350 ms; steps 79–99) | 11 f |

**Flags:** Jump buffer.

## Preset `celeste` (47 ms)

| Metric | Value | Celeste | HK | spec opus | Verdict |
|---|---|---|---|---|---|
| Full jump height (tiles) | 3.56 | 3.35 | 5.6 | 4.31 | in |
| Full jump height (bodies) | 2.85 | 2.4 | 4.4 | 3.45 | in |
| Time to apex (s) | 0.35 | 0.35 | 0.52 | 0.43 | in |
| Air time, flat full jump (s) | 0.68 | 0.65 | 1.02 | 0.85 | in |
| Tap / full height (ratio) | 0.25 | 0.25 | 0.23 | 0.28 | in |
| Apex dwell (within 10% of apex) (f) | 13 | 13 | 18 | 18 | in |
| Effective fall/rise gravity (ratio) | 3 | 3 | 1.6 | 1.73 | in |
| Run speed (tiles/s) | 11.25 | 11.25 | 8.3 | 9 | in |
| Frames to full run speed (f) | 6 | 5 | 0 | 3 | **OUT** (+20%) |
| Flat running jump distance / height (ratio) | 2.16 | 2.2 | 1.5 | 1.8 | in |
| Dash distance (tiles) | 4.5 | 4.5 | 5 | 4.5 | in |
| Dash duration (s) | 0.18 | 0.15 | 0.25 | 0.2 | in |
| Dash speed / run speed (×) | 2.67 | 2.7 | 2.4 | 2.5 | in |
| Max fall (tiles/s) | 20 | 20 | 20 | 20 | in |
| Coyote time (ms) | 100 | 100 | 40 | 100 | in |
| Jump buffer (ms) | 83 | 80 | 40 | 100 | near (+4%) |

Other: stop distance 27 px, turn-around 11 f, full jump 228 px in 21 f, tap jump 56 px, player height 80 px.

**Forgiveness** (press-timing windows while running; a wider window = more forgiving):

| Jump | Assists on | Assists off | Gain |
|---|---|---|---|
| run-up jump across a 6-tile pit (max flat jump 7.7 tiles) | 15 f (250 ms; steps 80–94) | 7 f (117 ms; steps 85–91) | 8 f |
| running jump over a 2-tile pit onto a 3-tile ledge (max jump 3.56 tiles) | 26 f (433 ms; steps 59–84) | 19 f (317 ms; steps 63–81) | 7 f |

**Flags:** Frames to full run speed.

## Preset `hk` (76 ms)

| Metric | Value | Celeste | HK | spec opus | Verdict |
|---|---|---|---|---|---|
| Full jump height (tiles) | 5.56 | 3.35 | 5.6 | 4.31 | in |
| Full jump height (bodies) | 4.45 | 2.4 | 4.4 | 3.45 | near (+1%) |
| Time to apex (s) | 0.5 | 0.35 | 0.52 | 0.43 | in |
| Air time, flat full jump (s) | 1 | 0.65 | 1.02 | 0.85 | in |
| Tap / full height (ratio) | 0.22 | 0.25 | 0.23 | 0.28 | near (-1%) |
| Apex dwell (within 10% of apex) (f) | 18 | 13 | 18 | 18 | in |
| Effective fall/rise gravity (ratio) | 1.42 | 3 | 1.6 | 1.73 | near (-11%) |
| Run speed (tiles/s) | 8.3 | 11.25 | 8.3 | 9 | in |
| Frames to full run speed (f) | 1 | 5 | 0 | 3 | in |
| Flat running jump distance / height (ratio) | 1.49 | 2.2 | 1.5 | 1.8 | near (-1%) |
| Dash distance (tiles) | 5 | 4.5 | 5 | 4.5 | in |
| Dash duration (s) | 0.23 | 0.15 | 0.25 | 0.2 | in |
| Dash speed / run speed (×) | 2.41 | 2.7 | 2.4 | 2.5 | in |
| Max fall (tiles/s) | 20 | 20 | 20 | 20 | in |
| Coyote time (ms) | 50 | 100 | 40 | 100 | in |
| Jump buffer (ms) | 50 | 80 | 40 | 100 | in |

Other: stop distance 0 px, turn-around 1 f, full jump 356 px in 30 f, tap jump 80 px, player height 80 px.

**Forgiveness** (press-timing windows while running; a wider window = more forgiving):

| Jump | Assists on | Assists off | Gain |
|---|---|---|---|
| run-up jump across a 7-tile pit (max flat jump 8.3 tiles) | 17 f (283 ms; steps 108–124) | 14 f (233 ms; steps 108–121) | 3 f |
| running jump over a 2-tile pit onto a 5-tile ledge (max jump 5.56 tiles) | 35 f (583 ms; steps 76–110) | 30 f (500 ms; steps 78–107) | 5 f |

No metric is outside the envelope by more than 15%.

