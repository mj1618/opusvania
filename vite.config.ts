import { defineConfig } from 'vitest/config';

// GitHub Pages serves the production build at https://mj1618.github.io/opusvania/.
// `vite preview` reports command 'serve', so check isPreview too or preview 404s every asset.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/opusvania/' : '/',
  build: { target: 'es2023', sourcemap: true },
  server: { port: 5180 },
  // Each checkout (and each extra dev server, via VITE_CACHE_DIR) keeps its own dependency cache. Snapshot
  // worktrees symlink node_modules, so the default node_modules/.vite was shared by every server, and they
  // overwrote each other's optimized deps ("Failed to fetch dynamically imported module …/.vite/deps/…").
  cacheDir: process.env.VITE_CACHE_DIR ?? '.vite',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Sim sweeps (e.g. critical-path's 60-start-time arrivals) take 6-10 s on the CI runner.
    testTimeout: 30_000,
  },
}));
