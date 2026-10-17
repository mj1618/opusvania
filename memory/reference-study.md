# Reference study: the Grove vs Ori / Hollow Knight (second teardown, 2026-10-13)

Ours (Vesper, with pickups, enemies and HUD) against 71 official Steam store screenshots (Ori BF:DE
387290, Ori WotW 1057090, Hollow Knight 367520, Silksong 1030300), all 1920x1080. Captures live in
`shots/reference/` (gitignored, with `sources.txt`); never commit them. Luma = Rec.709 on sRGB bytes,
0-255. Re-measure with `npm run look:stats` (same definitions).

## The owner's taste (outranks every number here)
Darker and subtler than the references on purpose: "it's just too bright in general, it looked better
when it wasn't so bright"; "the highlights on the character are a bit annoying and make it look washed
out and blurry". Never chase mean luma, hero glow, hero rim or bloom upward. Improve the picture through
value structure, silhouette, local contrast, colour separation and where light is placed.

## How to capture (fixed stops hide problems)
The seven `npm run shots` stops stand on bare ground; a glare bubble was missed that way. Also walk the
ground route (a frame every 250 px, idle and running), stand on every island and ledge, pan the camera
along the top band (`cam({x, y: 540})`), and shoot zoom-2 sequences of run, somersault, glide, slash
chain, pod and glint line, with pickups on. One Playwright script on `tools/lib/browser.ts` does it in
20 s; the page can reload under you when other agents save files.

## Measured
"Dark refs" = the 21 reference frames with mean luma under 40 (the comparable ones).
| | ours, 46 ground-walk frames | ours, 7 stops | dark refs | all 71 refs |
|---|---|---|---|---|
| mean luma | 29 (26-34) | 31 | 29 | 57 |
| near-black area (luma < 15) | 37% | 33% | 48% | 27% |
| dark grey area (15-38) | 37% | 39% | 27% | 23% |
| low-mid area (38-80) | 21% | 22% | 17% | 24% |
| area above 150 | 0.5% | 1.0% | 2.0% | 9% |
| near-white area (> 217) | 0.04% | 0.1% | 0.5% | 1.8% |
| brightest 0.1% of pixels (p99.9) | 189 | 187 | 237 | 245 |
| mean chroma (max - min channel) | 21 | 22 (left 30, centre 18, right 21) | 34 | 49 (Ori 53-59) |
| outer border luma | - | 20 | - | 36 |
| top quarter / bottom quarter luma | 28 / 14 | 25 / 23 | - | 45 / 49 |
| corners / centre | - | 0.35 | - | 0.34 |
| dominant hue share | - | left 72-81%, centre 35-42%, right 40% | - | 63% (Ori 70-95%) |
| hero p10 / p90 | 21 / 116 (run frames) | 27 / 108 | - | Ori p90 254, HK 17-61 / 244+ |
| hero p90 / surround | 4.0 (2.8-6.0) | 3.9 | - | 1.4-4.3 |
| hero height, feet line | 8-9%, 72% | same | - | 4-16%, 48-81% |
| pixels changing by > 6 luma within 1 s, hero idle | 7% (top third 5%) | - | - | - |

## Principles (ours to keep)
- **Dark is a range, not a level.** We match the dark references' mean exactly but sit in the middle
  of their range: 10 points less true black, 10 points more dark grey, and our brightest pixels stop
  at ~188 where theirs reach ~237 on half a percent of the frame. Deepen the big masses and let a few
  tiny lights be really light; never lift the whole.
- **A dark figure needs a paler stage behind it.** Every dark reference puts a pool of mist or glow
  directly behind the walk line (luma 50-90), so hero, enemies and plants read as silhouettes. This
  is how to make Vesper findable without lighting her.
- **One hue family per place, one complement accent.** The left glade commits; the centre is olive
  and thin (chroma 18); the right is violet with emerald foliage and reads best.
- **Frame closes at the edges.** Done; do not open it again.
- **Ground is a form, not a section.** It falls to black now, but the walk line is ruler-straight and
  the steps are boxes; the bottom quarter of every ground frame is an empty slab.
- **Focus is a depth cue.** Done: only the playfield band is crisp.
- **Big simple shapes, tiny rich details.** One authored form per screen at 300-500 px; our props are
  90-130 px and the lumen pods (80-90 px, twelve of them) are louder than they are.
- **Everything breathes.** In the references background foliage, fog, shafts and foreground all move.
  Ours moves only in the playfield strip.
- **Small lights have a hierarchy.** Brightest: the thing the player should look at next. Today the
  white moth flock and 20-30 idle glints per screen (luma 190-215) outrank the hero's face (~110).
- **Effects are the one place for white.** HK's nail slash is a fat pure-white wedge for 3-4 frames
  with a flash on the target; ours is a thin grey crescent (peak ~170) and the target does not flash.
- HUD: top-left, small, leaves the centre and walk line clear. Ours does.

## Scorecard of the first study's gaps (2026-10-13, second pass)
1. Key too high (mean 95): closed (31).
2. Hero mid-value on mid-value: closed by a different road (dark figure, pale face, ratio 3.9); she is
   not the brightest thing, by the owner's choice.
3. Too little near-black (7%): closed (33-37%), still short of the dark references' 48%.
4. Too much near-white (6%): closed and past it (0.04%); no real highlights left anywhere.
5. Zone hue commitment: left closed, centre and right improved (35-42%, 40%).
6. Frame edges open: closed (border 20, top quarter 25, corners/centre 0.35).
7. Ground as a textured section: improved (falls to black); the line and the steps are still boxes.
8. Equal sharpness everywhere: closed.
9. Detail spread evenly: improved (huge trunks), still even along the walk line.
10. No story props: improved (stone, cocoon lantern, shrine), all too small to be landmarks.
11. Motes too big and too many: closed; idle glints have taken over the "sparkle everywhere" role.
12. HUD placement: closed.
13. Hero size (8%): unchanged, acceptable.
14. Feet line (71%): unchanged (72%), acceptable; what is under it is the problem.
15. Islands as slabs: closed (the island family).

## Defects found on the way (still open when this was written)
- Pale stair-stepped rectangles in the far layer of the left zone, world x ~1700-2100, seen from the
  upper route and the top of a glide.
- A huge hard-edged disc and straight-edged facets in the centre zone's warm sky opening, seen from the
  high ledge and trunk B.
- Resizing the window after boot leaves the far/sky composite at the old size; reload after resizing.
