/**
 * Shared by tools/shots.ts and tools/clip.ts: launches headless Chromium on the real GPU where
 * possible and opens the game paused in manual mode (nothing moves except through __game).
 */
import { type Browser, chromium, type Page } from '@playwright/test';

export const DEFAULT_URL = process.env.GAME_URL ?? 'http://localhost:5180';

export async function launch(opts: { gpu?: boolean } = {}): Promise<Browser> {
  // Headless Chromium defaults to SwiftShader (software GL), even on macOS. The look is
  // shader-heavy, so ask for the real GPU; --no-gpu falls back to software.
  const args =
    opts.gpu === false
      ? []
      : process.platform === 'darwin'
        ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
        : ['--enable-gpu', '--ignore-gpu-blocklist'];
  return chromium.launch({ args });
}

export async function openGame(
  browser: Browser,
  url: string,
  viewport: { width: number; height: number },
  deviceScaleFactor = 1,
): Promise<Page> {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console error]', m.text());
  });
  // A url that already carries a query (e.g. ?char=yako) keeps it.
  const target = url.includes('?') ? `${url}&manual` : `${url.replace(/\/?$/, '/')}?manual`;
  try {
    await page.goto(target);
  } catch (e) {
    throw new Error(
      `Could not open ${target}. Is the dev server running (npm run dev)? Or pass --url. (${String(e).split('\n')[0]})`,
    );
  }
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' || !!document.body.dataset.error,
    null,
    { timeout: 30_000 },
  );
  const error = await page.evaluate(() => document.body.dataset.error);
  if (error) throw new Error(`The game failed to boot: ${error}`);
  // Only the canvas belongs in pictures.
  await page.addStyleTag({ content: '#hint, .tp-dfwv { display: none !important; }' });
  return page;
}
