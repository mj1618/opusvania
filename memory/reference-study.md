# Reference study: the Grove vs Ori / Hollow Knight (2026-10-13)

Side-by-side of our seven wide stops (`npm run shots`, Vesper) against 20 official Steam store
screenshots (Ori BF:DE 387290, Ori WotW 1057090, Hollow Knight 367520, Silksong 1030300), all at
1920x1080. Captures live in `shots/reference/` (gitignored, with `sources.txt`); never commit them.
Luma = Rec.709 on sRGB bytes, 0-255. Re-measure after a look change with the same definitions.

## Measured (group averages)
| | ours | Ori BF | Ori WotW | HK | Silksong |
|---|---|---|---|---|---|
| mean luma | **95** (62-135) | 51 | 48 | 59 | 58 |
| median luma | 78 | 45 | 35 | 40 | 48 |
| near-black area (luma < 15) | **7%** (0-19) | 28% | 30% | 29% | 19% |
| dark area (luma < 38) | 26% | 55% | 54% | 51% | 41% |
| near-white area (luma > 217) | **6%** (up to 17) | 0.7% | 1.2% | 2.9% | 0.4% |
| corners / centre luma | 0.42 | 0.37 | 0.21 | 0.21 | 0.20 |
| outer 10% border luma | 72 | 36 | 28 | 29 | 33 |
| top quarter luma | 96 | 51 | 41 | 31 | 49 |
| hero height, % of frame | 8% | 4-6.5% | 4.5-6.5% | 11-12% | 12-16% |
| hero brightest part (p90 luma) | 215-237 | 244-254 | 254 | 244-255 | 233-251 |
| hero darkest part (p10 luma) | 74-174 | - | - | 17-61 | 18-22 |
| hero peak / surround mean | 1.2-2.0 | 2.3-4.3 | 1.7-3.0 | 1.4-2.8 | 2.0-4.1 |
| feet line, % down the frame | 71% (ground stops) | 55-71% | 48-67% | 54-72% | 54-81% |
| gradient energy (detail everywhere) | 14.8 | 6.1 | 10.2 | 15.6 | 13.9 |
| warm-hue share, warmest frame | 22% (centre zone) | 33% | 92-99% | - | - |

Dominant hue bins (30 degree bins, weighted by chroma): ours is azure/cyan in the left zone AND the
right zone (azure 58%, violet < 3%), and cyan/teal with 11-19% yellow in the "golden" centre. Ori
frames commit: one hue family holds 70-95% of the chroma and the accent is its complement.

## Principles (ours to keep)
- **Low key, small lights.** The references are half as bright as us and a quarter of every frame is
  near-black. Light is scarce, so it means something. We are a high-key picture: sky and fog are the
  brightest and largest things, so nothing can glow against them.
- **The hero owns the top of the value range.** Ori and the Knight's mask are the only pure white on
  screen. Either the hero is the brightest thing (Ori) or carries the full range inside itself, black
  next to white (HK). Vesper is mid-value on mid-value with no black and no white.
- **One hue family per place, one complement accent.** Zone identity comes from committing the whole
  frame (shadows included) to the family, not from tinting a cyan picture.
- **Frame closes at the edges.** Top is canopy or ceiling, bottom is silhouette, corners are a fifth
  of the centre. The bright area is one shape in the middle third, behind the walk line.
- **Ground is a form, not a section.** Ori's ground is a lit top plane rolling into a shadowed side
  that is lost in darkness within ~150 px; HK's is flat but black below. Neither shows a textured
  cutaway. A ruler-straight grass line across the screen is the strongest "tile platformer" tell.
- **Focus is a depth cue.** Ori blurs both far background and foreground heavily; only the playfield
  band is crisp. HK inks the playfield and blurs everything else. Equal sharpness everywhere reads flat.
- **Big simple shapes, tiny rich details.** One or two huge forms per screen, then detail clustered
  where light falls and absent in shadow. Detail spread evenly reads as noise.
- **Set dressing tells something.** Reference screens each hold one object with a story (a well, a
  shrine, a cage, a lamp, a bench). Plants alone are not a place.
- **Motes are small.** 2-5 px sharp points clustered in shafts and near water, plus a few big soft
  bokeh ones in front; not dozens of 12-16 px bloomed blobs spread evenly.
- HUD: HK top-left (x 6-28%, y 6-19%); Ori a thin strip bottom-centre (y ~95%). Both leave the
  centre and the walk line clear.

## Gotcha found on the way
Resizing the window after boot (playwright `resize` on an open page) leaves the far/sky composite at
the old size: a hard black rectangle right of x~1283 and below y~720 behind the mid layer. Reload
after resizing; worth a real fix in the far target's resize path.
