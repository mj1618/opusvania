/**
 * Per-room time targets from the region design docs (`docs/design/regions/*.md`, STUDIO.md's paper
 * design). Any markdown table with a column whose header says "room" and one whose header says
 * "target", "time", "min" or "minutes" counts; a row whose room cell names a room id (with or
 * without backticks) gives that room's target. Times read: `90 s`, `1:30`, `2 min`, `1.5 min`,
 * `1-2 min`, `60-90 s` (a range keeps both ends).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Target {
  /** Seconds: the low and high end (equal for a single number). */
  lo: number;
  hi: number;
  source: string;
}

/** Seconds from a time cell, or null. */
export function parseTime(cell: string): { lo: number; hi: number } | null {
  const c = cell.replace(/[`*~]/g, '').trim().toLowerCase();
  const clock = /^(\d+):(\d{2})(?:\s*[-–]\s*(\d+):(\d{2}))?/.exec(c);
  if (clock) {
    const lo = Number(clock[1]) * 60 + Number(clock[2]);
    const hi = clock[3] ? Number(clock[3]) * 60 + Number(clock[4]) : lo;
    return { lo, hi };
  }
  const m =
    /^(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*(s|sec|secs|seconds?|m|min|mins|minutes?)\b/.exec(c);
  if (!m) return null;
  const k = m[3]?.startsWith('m') ? 60 : 1;
  const lo = Number(m[1]) * k;
  const hi = m[2] ? Number(m[2]) * k : lo;
  return { lo, hi };
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((s) => s.trim());
}

/** Targets found in markdown text for the given room ids. */
export function targetsFromMarkdown(
  md: string,
  roomIds: readonly string[],
  source = '',
): Record<string, Target> {
  const out: Record<string, Target> = {};
  const lines = md.split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    const head = lines[i] ?? '';
    const sep = lines[i + 1] ?? '';
    if (!head.includes('|') || !/^\s*\|?\s*:?-{3,}/.test(sep)) continue;
    const hs = cells(head).map((h) => h.toLowerCase());
    const rc = hs.findIndex((h) => /\broom\b/.test(h));
    const tc = hs.findIndex((h, k) => k !== rc && /target|time|\bmin|minutes|duration/.test(h));
    if (rc < 0 || tc < 0) continue;
    for (let j = i + 2; j < lines.length && (lines[j] ?? '').includes('|'); j++) {
      const row = cells(lines[j] ?? '');
      const roomCell = (row[rc] ?? '').replace(/[`*]/g, '');
      const id = roomIds.find((r) =>
        new RegExp(`(^|[^\\w-])${r.replace(/[-]/g, '\\-')}([^\\w-]|$)`).test(roomCell),
      );
      const t = parseTime(row[tc] ?? '');
      if (id && t) out[id] = { ...t, source };
    }
  }
  return out;
}

/** Every target in docs/design/regions/. */
export function loadTargets(roomIds: readonly string[], dir = 'docs/design/regions'): Record<string, Target> {
  if (!existsSync(dir)) return {};
  const out: Record<string, Target> = {};
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()) {
    const path = join(dir, f);
    Object.assign(out, targetsFromMarkdown(readFileSync(path, 'utf8'), roomIds, path));
  }
  return out;
}
