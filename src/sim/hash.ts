/**
 * Stable state hash: canonical JSON (object keys sorted) run through cyrb53.
 * Same state => same hash on any JS engine. Returns 14 hex chars.
 * Throws on NaN/Infinity: JSON turns them into null, so they would silently hash like null and
 * break replays (the start state is stored as JSON).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value, '$'));
}

function sortKeys(value: unknown, path: string): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Non-finite number ${value} at ${path} (state must be plain JSON)`);
  }
  if (Array.isArray(value)) return value.map((v, i) => sortKeys(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k], `${path}.${k}`);
    }
    return out;
  }
  return value;
}

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashState(value: unknown): string {
  return cyrb53(canonicalJson(value)).toString(16).padStart(14, '0');
}
