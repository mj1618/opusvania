import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creatureArt, type LookKey } from '../../src/render/enemies/kinds';
import type { EnemyKind } from '../../src/sim/scene';

/** Every room JSON under content/ (single rooms and world bundles). */
function rooms(): Array<{ file: string; room: Record<string, unknown> }> {
  const out: Array<{ file: string; room: Record<string, unknown> }> = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const f = join(d, name);
      if (statSync(f).isDirectory()) walk(f);
      else if (name.endsWith('.json')) {
        const j = JSON.parse(readFileSync(f, 'utf8')) as unknown;
        const list = Array.isArray(j)
          ? j
          : Array.isArray((j as { rooms?: unknown }).rooms)
            ? ((j as { rooms: unknown[] }).rooms as unknown[])
            : [j];
        for (const r of list)
          if (r && typeof r === 'object' && 'enemies' in r)
            out.push({ file: f, room: r as Record<string, unknown> });
      }
    }
  };
  walk('content');
  return out;
}

describe('creature renderers (canopy review r2 #3: the invisible old burrback)', () => {
  it('every creature in every room has a renderer for that room look', () => {
    const missing: string[] = [];
    let n = 0;
    for (const { file, room } of rooms()) {
      const art = (room.art ?? {}) as { kit?: LookKey['kit']; pieces?: boolean; mode?: string };
      const kit = art.kit ?? 'grove';
      const look: LookKey = {
        kit,
        pieces: kit === 'lanternroot' || !!art.pieces,
        greybox: art.mode === 'greybox',
      };
      for (const e of (room.enemies as Array<{ id: string; kind: EnemyKind }>) ?? []) {
        n++;
        if (!creatureArt(e.kind, look))
          missing.push(`${file} ${String(room.id)} ${e.id} (${e.kind}, kit ${kit})`);
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(missing).toEqual([]);
  });

  it('carriers are ants and hawkers are dragonflies in painted rooms (Canopy r22), boxes in greybox', () => {
    const wood: LookKey = { kit: 'wood', pieces: true, greybox: false };
    expect(creatureArt('carrier', wood)).toBe('ant');
    expect(creatureArt('hawker', wood)).toBe('dragonfly');
    expect(creatureArt('lampwing', wood)).toBe('moth');
    expect(creatureArt('juvenileBurrback', wood)).toBe('beetle');
    expect(creatureArt('carrier', { ...wood, greybox: true })).toBe('greybox');
  });
});
