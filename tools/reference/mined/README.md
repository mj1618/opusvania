# The researchers' scripts (2026-10-30)

How each `docs/design/reference-levels/<game>/area.json` was built from mined community data (see each game's
README there for sources). Kept for reproducing or extending the data; their paths point at the session scratchpad
and the earlier study's downloads (`nifty-bhaskara-28e244/shots/reference/maps/`), so repoint them before running.
Hollow Knight is now read from the installed game: `hollow-knight/extract.py` (UnityPy dump of each scene) ->
`rooms.py` (rooms in scene units) -> `build.py` (area.json), and `render_look.py` (look references, outside the repo);
usage in `docs/design/reference-levels/hollow-knight/README.md`.
Silksong is read from the installed game by `silksong/extract.py` (one file: `cabindex`, `dump`, `build`, `measure`,
`render`, `enums`; usage in its docstring), method in `docs/design/reference-levels/silksong/EXTRACTED.md`.
Ori DE is read from the Windows depot by `ori/extract.py` (one file: `dump`, `hero`, `terrain`, `exits`, `build`,
`analyse`, `textures`, `texexport`, `refs_textures`, `render`; usage in its docstring), method in
`docs/design/reference-levels/ori/EXTRACTED.md`; the other `ori/*.py` are the earlier mined pipeline.
Run Python on downloaded data with `-I`.
