# Toolchain notes and gotchas

- **Ports:** dev server is 5180 (`npm run dev`); 5173 is often taken by other local projects.
  E2E builds and serves `vite preview` on a per-run port (20000 + pid % 20000, `E2E_PORT` overrides)
  and never reuses a running server, so a stale preview can't be tested by mistake.
- **`vite preview` needs `isPreview`**: preview runs with `command === 'serve'`, so `base` must check
  `isPreview` too or every asset 404s under `/opusvania/` (see `vite.config.ts`).
- **TypeScript 7 (native tsc)** works with our config. `structuredClone` is not in the ES lib, so src/sim
  (typechecked without DOM via `tsconfig.sim.json`) clones with JSON instead.
- **Biome 2.5**: `biome migrate` rewrote `rules.recommended: true` to `preset: "none"` (turning lint off).
  Correct value is `"preset": "recommended"`.
- **Sim purity** is enforced three ways: `tsconfig.sim.json` (no DOM lib), a Biome override for `src/sim/**`
  (restricted imports/globals), and `tests/unit/sim-purity.test.ts` (Math.random incl. `Math['random']`,
  Date, globals reached via `globalThis` casts, eval/Function, Intl/toLocale*, approximated Math,
  imports leaving src/sim incl. side-effect imports). It's regex-based: a determined bypass is possible.
- **Pushing workflow changes:** the `gh` HTTPS token lacks the `workflow` scope, so a push that touches
  `.github/workflows/` is rejected. Push over SSH instead: `git push git@github.com:mj1618/opusvania.git main`.
- **CI/Pages:** `ci.yml` runs `npm run check` (WebGL works in headless Chromium on ubuntu runners);
  `pages.yml` deploys `main` only after CI succeeds (workflow_run), or on manual dispatch.
- **Biome and worktrees**: agent worktrees live in `.claude/worktrees/` (untracked); Biome found their
  `biome.json` as nested roots and refused to run, so `biome.json` excludes `.claude`.
- **JSON imports need `with { type: 'json' }`**: Playwright loads specs as native Node ESM, which rejects
  bare JSON imports (Vite and tsx don't care). `src/scene/index.ts` imports `content/scene/grove.json` this way.
- **Tweakpane rewrites bound values on refresh**: it clamps to a binding's min/max
  and snaps to its `step` grid (`setTuning('jump.gravity', 1234)` read back 1233.9967).
  Number bindings in the tuning panel have neither.
- **`tsx` + `page.evaluate`:** tsx (esbuild keepNames) wraps named inner functions in `__name()`, which
  doesn't exist in the page, so a `const f = () => ...` inside an evaluate callback throws
  `ReferenceError: __name`. Keep tool evaluate callbacks flat, or pass a string.
- **Why these deps:** `zod` validates the scene JSON; `tweakpane` is the tuning panel (backquote);
  `@tweakpane/core` is a dev dep only because tweakpane's .d.ts files import it; `tsx` runs `tools/*.ts`.
  Playwright Test's `chromium` is reused by `tools/shots.ts` and `tools/clip.ts`, so there is one browser
  install (`npx playwright install chromium`). `playwright-cli` keeps its files in `.playwright-cli/` (gitignored).
- **`npm run check` takes ~6 s**: typecheck, Biome, Vitest (~0.2 s), then 3 e2e smoke tests against a fresh
  production build. Looks are never asserted in check; they are judged from `npm run shots`.
- **CI renders with software GL** (very slow per frame): e2e must not step-and-render hundreds of frames.
- **`npm run look:stats -- <dir|files>`** (`tools/look-stats.ts`) prints the numbers of memory/reference-study.md
  for PNGs with the same definitions (Rec.709 luma on sRGB bytes): mean, median, near-black/dark/near-white %,
  border, top and bottom quarter, corners/centre, dominant hue share; `--hero=x,y,w,h` (or a `<png>.hero.json`
  sidecar) adds hero p10/p90 and p90 / mean of the 300 px around. `--stops[=dir]` shoots the seven wide stops
  with hero boxes and measures them in one go (stop list duplicated from tools/shots.ts: keep in step).
  `--only=wide`, `--json`. Decodes with ffmpeg/ffprobe, no extra dependency.
