/**
 * Node side of src/debug/build-info.ts: computes the git SHA and the src/sim fingerprint.
 * vite.config.ts injects them with `define`; tsx tools call installBuildInfo() at startup.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export function gitSha(): string {
  const sha = git(['rev-parse', '--short=10', 'HEAD']) || 'unknown';
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  return dirty ? `${sha}-dirty` : sha;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (/\.(ts|json)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * sha1 over every src/sim source file plus the gameplay content the sim bundles (rooms, move
 * table, enemy data; L3 brief §2.7), path + contents, first 10 hex chars. Without the content a
 * frame-data edit would read as "SAME sim build" on a golden mismatch.
 */
export function simFingerprint(): string {
  const h = createHash('sha1');
  const files = [
    ...listFiles(join(ROOT, 'src/sim')),
    ...listFiles(join(ROOT, 'content/gym')),
    ...listFiles(join(ROOT, 'content/enemies')),
    join(ROOT, 'content/moves.json'),
    join(ROOT, 'content/world.compiled.json'),
  ];
  for (const f of files) {
    h.update(relative(ROOT, f).replaceAll('\\', '/'));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 10);
}

export function buildDefines(): Record<string, string> {
  return {
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __SIM_FINGERPRINT__: JSON.stringify(simFingerprint()),
  };
}

/** For tsx tools (no Vite define): exposes the same values on globalThis. */
export function installBuildInfo(): void {
  (globalThis as { __OPUS_BUILD__?: unknown }).__OPUS_BUILD__ = { sha: gitSha(), sim: simFingerprint() };
}
