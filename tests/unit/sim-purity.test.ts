import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * src/sim must stay pure and deterministic. tsconfig.sim.json (no DOM lib) and the biome override
 * catch most of this; this test catches the rest (Math.random, Date.now, forbidden imports).
 */
const SIM_DIR = join(__dirname, '../../src/sim');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : [],
  );
}

const FORBIDDEN_CODE: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'Math.random (use src/sim/rng.ts)'],
  [/\bDate\.now\b|\bnew Date\b/, 'Date (use the frame count)'],
  [/\bperformance\.now\b/, 'performance.now (use the frame count)'],
  [
    /\b(window|document|navigator|localStorage|requestAnimationFrame|setTimeout|setInterval)\b/,
    'browser globals',
  ],
  [/\b(AudioContext|HTMLElement|HTMLCanvasElement)\b/, 'DOM/audio APIs'],
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
      for (const [re, what] of FORBIDDEN_CODE) {
        expect(re.test(code), `${rel} uses ${what}`).toBe(false);
      }
    });

    it(`${rel} imports only sim modules or zod`, () => {
      const code = readFileSync(file, 'utf8');
      const specs = [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(
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
