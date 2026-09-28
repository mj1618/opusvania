import type { GameState } from '../sim/index';

/**
 * Which build produced a replay/tape. `sha` is the git commit (+`-dirty` if the tree had
 * uncommitted changes); `sim` fingerprints the src/sim sources, so it changes whenever sim code
 * changes even without a commit. Both are injected by Vite `define` (browser, Vitest) or by
 * tools/lib/build-info.ts (tsx tools). See memory/replays-and-tapes.md.
 */
export interface BuildMeta {
  sha: string;
  sim: string;
  /** GameState.version (state schema). */
  stateVersion: number;
}

declare const __BUILD_SHA__: string | undefined;
declare const __SIM_FINGERPRINT__: string | undefined;

interface InjectedBuild {
  sha: string;
  sim: string;
}

export function buildMeta(stateVersion = 1): BuildMeta {
  const g = globalThis as { __OPUS_BUILD__?: InjectedBuild };
  const sha = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : (g.__OPUS_BUILD__?.sha ?? 'unknown');
  const sim =
    typeof __SIM_FINGERPRINT__ === 'string' ? __SIM_FINGERPRINT__ : (g.__OPUS_BUILD__?.sim ?? 'unknown');
  return { sha, sim, stateVersion };
}

export function metaFor(state: GameState): BuildMeta {
  return buildMeta(state.version);
}

/** True when two builds ran the same sim code (so hashes must agree). */
export function sameSim(a: BuildMeta | undefined, b: BuildMeta): boolean {
  return !!a && a.sim === b.sim && a.stateVersion === b.stateVersion && a.sim !== 'unknown';
}

/**
 * Explains a replay/tape hash mismatch. Mentions the build difference when there is one, so a
 * divergence caused by sim changes reads as "re-record", not as a determinism bug.
 */
export function explainMismatch(recorded: BuildMeta | undefined, current: BuildMeta = buildMeta()): string {
  if (!recorded)
    return 'Hash mismatch. The replay has no build info (recorded before L2), so it may come from an older build; re-record it if the sim changed since.';
  const parts: string[] = [];
  if (recorded.stateVersion !== current.stateVersion)
    parts.push(`state schema v${recorded.stateVersion} -> v${current.stateVersion}`);
  if (recorded.sim !== current.sim) parts.push(`sim code ${recorded.sim} -> ${current.sim}`);
  if (parts.length > 0)
    return `Replay from an older build (recorded at ${recorded.sha}, now ${current.sha}; ${parts.join(', ')}). The sim changed since it was recorded, so divergence is expected: re-record it (npm run tape -- update) if the change was intended.`;
  return `Hash mismatch on the SAME sim build (${current.sim}, recorded at ${recorded.sha}). This is a determinism bug or an unrecorded out-of-band state change, not an old replay.`;
}
