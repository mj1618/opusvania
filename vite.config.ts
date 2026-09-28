import { defineConfig } from 'vitest/config';
import { buildDefines } from './tools/lib/build-info';

// GitHub Pages serves the production build at https://mj1618.github.io/opusvania/.
// `vite preview` reports command 'serve', so check isPreview too or preview 404s every asset.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/opusvania/' : '/',
  // Build SHA + src/sim fingerprint, stamped into replays and tapes (src/debug/build-info.ts).
  define: buildDefines(),
  build: { target: 'es2023', sourcemap: true },
  server: { port: 5180 },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/replays/**/*.test.ts'],
    environment: 'node',
  },
}));
