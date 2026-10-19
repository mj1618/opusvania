// Inlines every skeleton (docs/design/skeletons/<n>-<slug>.json + .md) into compare.html, the page Matt picks from.
// Usage: node docs/design/skeletons/build-compare.mjs [outFile]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(dir, 'compare.html');
const skeletons = readdirSync(dir)
  .filter((f) => /^\d+-.*\.json$/.test(f))
  .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
  .map((f) => {
    const sk = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    try {
      sk.doc = readFileSync(join(dir, f.replace(/\.json$/, '.md')), 'utf8');
    } catch {}
    const ids = new Set((sk.regions ?? []).map((r) => r.id));
    const refs = [
      ...(sk.links ?? []).flatMap((l) => [l.from, l.to]),
      ...(sk.abilities ?? []).map((a) => a.region),
      ...(sk.landmarks ?? []).flatMap((l) => l.seenFrom ?? []),
      sk.boss?.region,
    ].filter(Boolean);
    const missing = [...new Set(refs.filter((r) => !ids.has(r)))];
    if (missing.length) console.warn(`${f}: unknown regions ${missing.join(', ')}`);
    return sk;
  });
const html = readFileSync(join(dir, 'compare.template.html'), 'utf8').replace(
  '/*__DATA__*/[]',
  JSON.stringify(skeletons).replace(/</g, '\\u003c'),
);
writeFileSync(out, html);
console.log(`${skeletons.length} skeletons → ${out}`);
