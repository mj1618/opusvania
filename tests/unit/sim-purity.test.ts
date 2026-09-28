import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * src/sim must stay pure and deterministic. tsconfig.sim.json (no DOM lib) and the biome override
 * catch most of this; this test catches the rest (Math.random, Date, host globals reached via casts,
 * engine-approximated Math, locale APIs, imports that leave src/sim including side-effect imports).
 */
const SIM_DIR = join(__dirname, '../../src/sim');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

const FORBIDDEN_CODE: Array<[RegExp, string]> = [
  [/\bMath\s*\.\s*random\b|\bMath\s*\[|=\s*Math\s*[;,\n]/, 'Math.random (use src/sim/rng.ts)'],
  [/\bDate\b/, 'Date (use the frame count)'],
  [/\bperformance\b/, 'performance.now (use the frame count)'],
  [
    /\b(globalThis|window|self|document|navigator|localStorage|sessionStorage|requestAnimationFrame|setTimeout|setInterval|queueMicrotask|fetch|process|crypto)\b/,
    'host globals',
  ],
  [/\b(AudioContext|HTMLElement|HTMLCanvasElement)\b/, 'DOM/audio APIs'],
  [/\beval\s*\(|\bFunction\s*\(|\brequire\s*\(|\bimport\.meta\b/, 'eval/Function/require/import.meta'],
  [/\bIntl\b|\.toLocale\w*\s*\(|\.localeCompare\s*\(/, 'locale-dependent APIs'],
  // The spec lets engines approximate these, so results can differ between V8, SpiderMonkey and
  // JavaScriptCore and a replay recorded in one browser would diverge in another. sqrt, floor,
  // round, abs, min, max, sign, trunc, imul, fround are exact and fine.
  [
    /\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\*\*/,
    'engine-approximated Math (add a deterministic helper in src/sim)',
  ],
];

const ALLOWED_IMPORT = /^(\.{1,2}\/|zod$)/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('src/sim purity', () => {
  const simFiles = files(SIM_DIR);

  it('finds sim files', () => {
    expect(simFiles.length).toBeGreaterThan(5);
  });

  for (const file of simFiles) {
    const rel = relative(SIM_DIR, file);
    it(`${rel} uses no forbidden globals`, () => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const found = FORBIDDEN_CODE.filter(([re]) => re.test(code)).map(([, what]) => what);
      expect(found, `${rel} uses forbidden APIs`).toEqual([]);
    });

    it(`${rel} imports only sim modules or zod`, () => {
      const code = readFileSync(file, 'utf8');
      const specs = [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)].map(
        (m) => m[1] ?? m[2] ?? '',
      );
      for (const spec of specs) {
        expect(ALLOWED_IMPORT.test(spec), `${rel} imports "${spec}"`).toBe(true);
        if (spec.startsWith('.')) {
          const target = join(file, '..', spec);
          expect(target.startsWith(SIM_DIR), `${rel} imports outside src/sim: "${spec}"`).toBe(true);
        }
      }
    });
  }
});
