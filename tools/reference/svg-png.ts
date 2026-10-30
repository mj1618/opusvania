/** Rasterise SVGs (from area-svg.ts) to PNG with Playwright's Chromium: npx tsx tools/reference/svg-png.ts a.svg [b.svg ...] */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
for (const path of process.argv.slice(2)) {
  const svg = readFileSync(path, 'utf8');
  const w = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 800);
  const h = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 600);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const out = path.replace(/\.svg$/, '.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out} (${w}x${h})`);
}
await browser.close();
