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
