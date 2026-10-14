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

/**
 * A stand-in for Vite's client with no hot reload: a long capture is not thrown away when someone
 * else saves a file mid-run (the page keeps the code it booted with). CSS-in-JS helpers are no-ops.
 */
const NO_HMR_CLIENT = `
const hot = { accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {}, data: {} };
export function createHotContext() { return hot; }
export function injectQuery(url) { return url; }
export function updateStyle(id, css) {
  let el = document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!el) { el = document.createElement('style'); el.setAttribute('data-vite-dev-id', id); document.head.appendChild(el); }
  el.textContent = css;
}
export function removeStyle(id) { document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove(); }
export class ErrorOverlay {}
`;

/** Serves the page without Vite's hot reload (see NO_HMR_CLIENT). */
export async function freezeCode(page: Page): Promise<void> {
  await page.route('**/@vite/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: NO_HMR_CLIENT }),
  );
}

export async function openGame(
  browser: Browser,
  url: string,
  viewport: { width: number; height: number },
  deviceScaleFactor = 1,
  /** false (default) opens the scene without glints (`?nopickups`): a clean plate for judging the look. */
  pickups = false,
): Promise<Page> {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  await freezeCode(page);
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console error]', m.text());
  });
  // A url that already carries a query (e.g. ?char=yako) keeps it.
  const flags = pickups ? 'manual' : 'manual&nopickups';
  const target = url.includes('?') ? `${url}&${flags}` : `${url.replace(/\/?$/, '/')}?${flags}`;
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
