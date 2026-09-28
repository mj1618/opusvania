/**
 * Offline audio render: runs the game headless, renders audio scenarios (src/audio/scenarios.ts)
 * with OfflineAudioContext via window.__game.audio.render(), writes WAVs to clips/audio/, prints a
 * level table (peak / RMS / loudest 50ms window, clipped samples, silence) and encodes the combined
 * demo to mp3 + ogg with ffmpeg so a human can listen.
 *
 *   npm run audio:render                      # everything
 *   npm run audio:render -- sfx/ hum/brown    # a prefix ('sfx/', 'levy/*') or exact names
 *   npm run audio:render -- --list
 *   npm run audio:render -- --strict          # exit 1 if anything clips or is silent
 *
 * See memory/audio.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { OfflineResult } from '../src/audio/offline';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    url: { type: 'string' },
    'no-encode': { type: 'boolean', default: false },
  },
});

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'clips', 'audio');
const ffmpeg = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';

const fmt = (db: number) => (Number.isFinite(db) ? db.toFixed(1).padStart(6) : '  -inf');

async function main(): Promise<void> {
  let server: ViteDevServer | undefined;
  let baseUrl = args.url;
  if (!baseUrl) {
    server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false } });
    await server.listen();
    baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error('vite did not report a URL');
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e));
    await page.goto(`${baseUrl.replace(/\/?$/, '/')}?manual`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game?.audio);

    if (args.list) {
      console.log((await page.evaluate(() => window.__game.audio.scenarios())).join('\n'));
      return;
    }
    // Filter in Node: tsx (esbuild keepNames) wraps named inner functions in __name(), which
    // doesn't exist in the page, so keep page.evaluate callbacks free of named function consts.
    const all = await page.evaluate(() => window.__game.audio.scenarios());
    const q = positionals;
    const names = all.filter(
      (n) =>
        q.length === 0 ||
        q.some((p) => (p.endsWith('/') || p.endsWith('*') ? n.startsWith(p.replace(/\*$/, '')) : n === p)),
    );
    if (names.length === 0) throw new Error(`no scenarios match ${positionals.join(' ')}`);

    mkdirSync(OUT, { recursive: true });
    const rows: OfflineResult[] = [];
    for (const name of names) {
      const [r] = await page.evaluate((n) => window.__game.audio.render([n], { wav: true }), name);
      if (!r?.wavBase64) throw new Error(`render failed: ${name}`);
      const file = join(OUT, `${name.replace(/\//g, '-')}.wav`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(r.wavBase64, 'base64'));
      rows.push({ ...r, wavBase64: undefined });
    }

    console.log(`\n${'scenario'.padEnd(22)}  peakdB   rmsdB  maxWin  clipped  flag`);
    let bad = 0;
    for (const r of rows) {
      const s = r.stats;
      const flag = s.clipped > 0 ? 'CLIP' : s.silent ? 'SILENT' : s.peakDb > -1 ? 'hot' : '';
      if (s.clipped > 0 || s.silent) bad++;
      console.log(
        `${r.name.padEnd(22)} ${fmt(s.peakDb)}  ${fmt(s.rmsDb)}  ${fmt(s.maxWindowRmsDb)}  ${String(s.clipped).padStart(7)}  ${flag}`,
      );
    }
    console.log(`\nWAVs in ${OUT}`);

    if (names.includes('demo') && !args['no-encode']) {
      const wav = join(OUT, 'demo.wav');
      for (const [ext, codec] of [
        ['mp3', ['-c:a', 'libmp3lame', '-q:a', '2']],
        ['ogg', ['-c:a', 'libvorbis', '-q:a', '6']],
      ] as const) {
        const out = join(OUT, `demo.${ext}`);
        const res = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', wav, ...codec, out]);
        if (res.status !== 0) throw new Error(`ffmpeg ${ext} failed: ${res.stderr}`);
        console.log(`demo: ${out}`);
      }
    }
    if (args.strict && bad > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
