import { defineConfig } from 'vitest/config';

// GitHub Pages serves the production build at https://mj1618.github.io/opusvania/.
// `vite preview` reports command 'serve', so check isPreview too or preview 404s every asset.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/opusvania/' : '/',
  build: { target: 'es2023', sourcemap: true },
  server: { port: 5180 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Sim sweeps (e.g. critical-path's 60-start-time arrivals) take 6-10 s on the CI runner.
    testTimeout: 30_000,
  },
}));
