import { defineConfig, devices } from '@playwright/test';

// E2E runs against a fresh production build (vite preview) so it also checks the /opusvania/ base
// path. It never reuses a running server: a stale preview left on a fixed port (another worktree,
// an earlier run) would silently test an old build. Each run picks its own port from the pid;
// the main process sets E2E_PORT before workers start, and they inherit it, so all agree.
// If the port is somehow taken, Playwright fails loudly instead of reusing it.
process.env.E2E_PORT ??= String(20000 + (process.pid % 20000));
const PORT = Number(process.env.E2E_PORT);

export default defineConfig({
  testDir: 'tests/e2e',
  // Screenshot goldens (tests/e2e/gfx.spec.ts) are shared across platforms: headless Chromium
  // renders with SwiftShader both locally and on CI, and the tests compare with a tolerance.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI renders with software GL at ~1 fps: boot/gfx tests took 24-30 s of the default 30 s and
  // flaked (memory/toolchain.md). Local runs keep the default.
  timeout: process.env.CI ? 90_000 : 30_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/opusvania/`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --strictPort --port ${PORT}`,
    url: `http://localhost:${PORT}/opusvania/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
