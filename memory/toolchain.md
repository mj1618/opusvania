# Toolchain notes and gotchas

- **Ports:** dev server is 5180 (`npm run dev`); 5173 is often taken by other local projects.
  E2E builds and serves `vite preview` on a per-run port (20000 + pid % 20000, `E2E_PORT` overrides)
  and never reuses a running server, so a stale preview can't be tested by mistake (fixed in L2).
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
- **Headless tools** (`npm run sim | bot | feel:report | tape`) run the sim in Node through
  `src/debug/headless.ts`; they import only pure modules (no Pixi) and start in under 0.5 s.
- `vite.config.ts` imports `tools/lib/build-info.ts` for the build-stamp `define`s. Vite warns that
  extensionless config imports won't work with `configLoader: 'native'`; harmless for now.
- **Why these deps:** `tsx` runs `tools/*.ts` directly (clip, sim, bot, feel report, tape). `@tweakpane/core` is a dev dep only
  because `tweakpane`'s .d.ts files import it without declaring it.
- Playwright Test's `chromium` export is reused by the clip tool, so there's one browser install
  (`npx playwright install chromium`). `playwright-cli` keeps its own files in `.playwright-cli/` (gitignored).
- **Pushing workflow changes:** the `gh` HTTPS token lacks the `workflow` scope, so a push that touches
  `.github/workflows/` is rejected. Push over SSH instead: `git push git@github.com:mj1618/opusvania.git main`.
- **CI/Pages:** `ci.yml` runs `npm run check` (WebGL works in headless Chromium on ubuntu runners);
  `pages.yml` deploys `main` only after CI succeeds (workflow_run), or on manual dispatch.
- **Biome and worktrees**: agent worktrees live in `.claude/worktrees/` (untracked); Biome found their
  `biome.json` as nested roots and refused to run, so `biome.json` excludes `.claude`.
- **JSON imports need `with { type: 'json' }`**: Playwright loads specs as native Node ESM, which rejects
  bare JSON imports (Vite and tsx don't care). Anything the sim imports from `content/` must carry it.
- **Tweakpane rewrites bound values on refresh**: it clamps to a binding's min/max (hk's 999 accelerations
  became 12.8) and snaps to its `step` grid (`setTuning('jump.gravity', 1234)` read back 1233.9967).
  Number bindings in the tuning panel have neither.
- **CI renders at ~1 fps** (software GL on the ubuntu runner; local headless ~30 fps). E2E tests must not
  step-and-render hundreds of frames or reload pages per case: verify sim hashes with
  `__game.replay.verify` (no rendering), and manual mode only redraws when the state changed.
  Timing tests (latency) skip themselves below 20 fps.
- **`tsx` + `page.evaluate`:** tsx (esbuild keepNames) wraps named inner functions in `__name()`, which
  doesn't exist in the page, so a `const f = () => ...` inside an evaluate callback throws
  `ReferenceError: __name`. Keep tool evaluate callbacks flat, or pass a string.
