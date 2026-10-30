# Reading Unity games (HK, 2026-10-30)

How the Hollow Knight first area was read from Matt's install (`tools/reference/mined/hollow-knight/`); the same
traps apply to Nine Sols, Silksong, Ori.

- Venv with `UnityPy TypeTreeGeneratorAPI Pillow numpy`; run `python -I` from outside the game folder; never write there.
- Scene N is `level<N>` (N = index in globalgamemanagers' BuildSettings). Load its `externals` (sharedassets,
  globalgamemanagers.assets, resources.assets) into the same environment or every script / sprite pointer fails
  ("invalid m_FileID").
- Builds ship without MonoBehaviour type trees: generate them from `Managed/*.dll` (`TypeTreeGenerator`, then
  `obj.parse_as_dict(nodes)`). The generator types `List<string>` as `string` + Array, which UnityPy reads as one string:
  retype those nodes to `vector` (`extract.py: script_nodes`). Without it every PlayMakerFSM fails to parse.
- First-visit state: active-at-load, minus parents that switch on later progress (HK: `Activate Infected`,
  `DeactivateIfPlayerdataFalse`), plus battle groups (inactive until the fight; wave enemies wait off-screen).
- Tile maps (tk2d) give collision as edge loops per 32 x 32 chunk; holes are loops too, so fill cells even-odd per
  chunk before drawing (filling each loop separately paints the air black).
- Scale: read the gameplay camera, not the art's pixels-per-unit. HK: perspective FOV 24 deg at z -38.1 -> 28.8 x
  16.2 u in view -> 1 u = 66.7 of our px (the art is 64 px/u). Knight 0.5 x 1.28 u, run 8.3 u/s, jump ~5.3 u.
- Sprite renders: per sprite an affine (sprite px -> local units -> world matrix -> perspective scale at its z),
  sorted by sorting layer, order, then far-first; skip the dark masks over unvisited pockets.
