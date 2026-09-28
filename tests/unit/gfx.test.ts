/**
 * Render pipeline, pure parts (memory/render-pipeline.md): dressing data, the ambient particle
 * model, light maths and terrain depth. The Pixi side is covered by tests/e2e/gfx.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { AmbientField, FIELD_H, FIELD_W } from '../../src/render/gfx/ambient';
import { hashString, mix, RenderRng } from '../../src/render/gfx/color';
import {
  DressingFileSchema,
  dressingFiles,
  getDressing,
  parseDressingFiles,
  resolveDressing,
  roomFamily,
} from '../../src/render/gfx/dressing';
import { falloff, flickerFactor } from '../../src/render/gfx/light-model';
import { PALETTES } from '../../src/render/gfx/palette';
import { solidDepth } from '../../src/render/gfx/terrain';
import { getRoom, ROOMS, Tile } from '../../src/sim/world/rooms';

describe('room dressing (content/rooms-dressing)', () => {
  it('every file parses, and every id is default, a family or a real room', () => {
    const files = dressingFiles();
    expect(files.has('default')).toBe(true);
    const families = new Set([...ROOMS.keys()].map(roomFamily));
    for (const id of files.keys()) expect(id === 'default' || ROOMS.has(id) || families.has(id)).toBe(true);
  });

  it('every room resolves to a full dressing with a known palette', () => {
    for (const id of ROOMS.keys()) {
      const d = getDressing(id, hashString(id));
      expect(Object.values(PALETTES)).toContain(d.palette);
      expect(d.sources[0]).toBe('default');
      expect(d.ambient.level).toBeGreaterThan(0);
    }
  });

  it('merges default -> family -> room section by section', () => {
    const files = parseDressingFiles({
      'x/default.json': { id: 'default', district: 'brown', particles: { motes: 10, soot: 5 } },
      'x/gym.json': { id: 'gym', district: 'violet', particles: { motes: 20 } },
      'x/gym-03.json': { id: 'gym-03', ambient: { level: 0.3 }, lights: [{ at: [2, 3] }] },
    });
    const d = resolveDressing(files, 'gym-03', 7);
    expect(d.sources).toEqual(['default', 'gym', 'gym-03']);
    expect(d.district).toBe('violet');
    expect(d.particles.motes).toBe(20);
    expect(d.particles.soot).toBe(5);
    expect(d.ambient).toEqual({ color: PALETTES.violet.ambient.color, level: 0.3 });
    expect(d.lights[0]).toMatchObject({ at: [2, 3], radius: 320, intensity: 1, flicker: 0, lamp: false });
    expect(d.seed).toBe(7);
  });

  it('rejects typos, bad colours and ids that do not match the file name', () => {
    expect(DressingFileSchema.safeParse({ id: 'a', partciles: {} }).success).toBe(false);
    expect(DressingFileSchema.safeParse({ id: 'a', ambient: { color: 'red' } }).success).toBe(false);
    expect(DressingFileSchema.safeParse({ id: 'a', district: 'green' }).success).toBe(false);
    expect(() => parseDressingFiles({ 'x/gym-01.json': { id: 'gym-02' } })).toThrow(/match the file name/);
  });
});

describe('ambient particles', () => {
  const cfg = { motes: 30, embers: 10, soot: 20, wind: 0.3 };

  it('is deterministic for a seed and differs between seeds', () => {
    const a = new AmbientField(cfg, 5);
    const b = new AmbientField(cfg, 5);
    const c = new AmbientField(cfg, 6);
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
      c.step();
    }
    expect(JSON.stringify(a.particles)).toBe(JSON.stringify(b.particles));
    expect(JSON.stringify(a.particles)).not.toBe(JSON.stringify(c.particles));
  });

  it('scales counts by quality and keeps particles inside the wrapping field', () => {
    const f = new AmbientField(cfg, 1, 0.5);
    expect(f.count).toBe(30);
    for (let i = 0; i < 1000; i++) f.step();
    for (const q of f.particles) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThan(FIELD_W);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThan(FIELD_H);
    }
  });

  it('parallax: a particle moves on screen by camera delta times its depth', () => {
    const f = new AmbientField(cfg, 1);
    const q = f.particles[0];
    if (!q) throw new Error('no particle');
    const p0 = AmbientField.screen(q, 0, 0);
    const p1 = AmbientField.screen(q, 10, 0);
    const dx = (p0.x - p1.x + FIELD_W) % FIELD_W;
    expect(dx).toBeCloseTo(10 * q.depth, 6);
  });
});

describe('light maths', () => {
  it('falloff is 1-ish at the centre, monotonic, and exactly 0 at the radius', () => {
    expect(falloff(0)).toBeCloseTo(1, 6);
    let prev = falloff(0);
    for (let d = 0.05; d <= 1; d += 0.05) {
      const v = falloff(d);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(falloff(1)).toBe(0);
    expect(falloff(1.5)).toBe(0);
  });

  it('flicker is keyed to the render clock: same t, same value; steady lights never flicker', () => {
    const l = { x: 0, y: 0, radius: 100, color: 0xffffff, intensity: 1, flicker: 0.8, seed: 3 };
    const vals = Array.from({ length: 300 }, (_, t) => flickerFactor(l, t));
    expect(Array.from({ length: 300 }, (_, t) => flickerFactor(l, t))).toEqual(vals);
    expect(Math.min(...vals)).toBeLessThan(0.8);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    expect(flickerFactor({ ...l, flicker: 0 }, 42)).toBe(1);
  });
});

describe('terrain depth and helpers', () => {
  it('surface solids are depth 1 and depth grows into the mass', () => {
    const room = getRoom('gym-01');
    const d = solidDepth(room);
    for (let ty = 0; ty < room.height; ty++)
      for (let tx = 0; tx < room.width; tx++) {
        const i = ty * room.width + tx;
        if (room.tiles[i] !== Tile.solid) expect(d[i]).toBe(0);
        else expect(d[i]).toBeGreaterThanOrEqual(1);
      }
    // The padded rows above the ceiling get deeper the further they are from the air.
    expect(Math.max(...d)).toBeGreaterThan(2);
  });

  it('colour mix and render RNG behave', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    const r = new RenderRng(9);
    const xs = Array.from({ length: 100 }, () => r.next());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(new RenderRng(9).next()).toBe(xs[0]);
  });
});
