/**
 * The wood kit's playfield painter (rooms with `art.kit: 'wood'`, room-look.ts): the skin of a room
 * high in the canopy, painted from its own rects. A first, plain base for the art agents to build
 * on; the test grove keeps `paintTerrain` (pf-terrain.ts) with all its hand-tuned forms.
 *
 *   trunk   a great round bole of bark (the scene edge's trunk the branch grows from)
 *   branch  a round limb whose top is the collision top, moss along it; a free end tapers (only
 *           its underside: the walk line stays true) and leafs out
 *   others  (ground, ledge, ...) painted as a limb too, until the kit needs more
 *
 * One-ways are thin limbs. Returns the same TerrainInfo as paintTerrain, so pf-plants grows moss,
 * ferns and hanging vines on it and pf-bake lights it.
 */
import type { Scene, SolidRect } from '../../../sim/scene';
import { limb, type Wood } from './pf-islands';
import { Paint } from './pf-paint';
import { blob, clamp, rngFor, smoothstep, wobble } from './pf-shape';
import { mossCap, type TerrainInfo } from './pf-terrain';

export const WOOD = {
  /** Bark of the limbs and the bole: cool, moon-silvered on the lit side. */
  bark: { col: 0x1c3240, lit: 0x4a6470, dark: 0x0a1822 } as Wood,
  /** The limb's underside reaches this share of its rect's height below the collision bottom. */
  belly: 0.35,
  /** A free end tapers over this many px. */
  taper: 150,
  /** Relief height of the limbs (0..1) and of the bole. */
  limbH: 0.55,
  boleH: 0.42,
} as const;

/** True if a solid's side at `x` meets another solid (a trunk or the next limb), so it is not a free end. */
function joined(scene: Scene, s: SolidRect, x: number): boolean {
  return (
    x <= 0 ||
    x >= scene.width ||
    scene.solids.some(
      (o) => o !== s && x >= o.x - 1 && x <= o.x + o.w + 1 && s.y >= o.y - 8 && s.y <= o.y + o.h,
    )
  );
}

function paintBole(p: Paint, s: SolidRect, seed: number): void {
  const cx = s.x + s.w / 2;
  const line: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = s.y - 40 + ((s.h + 80) * i) / 24;
    line.push(cx + wobble(y, seed, 300) * 10, y);
  }
  // A little wider than the collision so its round flank reads past the edge.
  limb(p, line, () => s.w + 36, WOOD.bark, WOOD.boleH, 0.18, seed, { bark: 1, grain: 9, lit: 0.35 });
}

function paintLimb(
  p: Paint,
  scene: Scene,
  s: SolidRect,
  info: TerrainInfo,
  seed: number,
  thin = false,
): void {
  const x0 = s.x;
  const x1 = s.x + s.w;
  const freeL = !joined(scene, s, x0);
  const freeR = !joined(scene, s, x1);
  const r = rngFor(seed, s.x, s.y);
  const depth = thin ? 22 : s.h * (1 + WOOD.belly);
  // Full width of the limb along x: tapered at a free end, swelling a little in the middle.
  const width = (x: number): number => {
    const tl = freeL ? smoothstep(x0 - 10, x0 + WOOD.taper, x) : 1;
    const tr = freeR ? smoothstep(x1 + 10, x1 - WOOD.taper, x) : 1;
    // Not a slab: the limb bellies down in the middle of its span, thins toward its ends, and
    // swells and pinches along the way (knots, forks).
    const u = clamp((x - x0) / Math.max(1, x1 - x0), 0, 1);
    const belly = 0.72 + 0.4 * Math.sin(Math.PI * u) ** 0.8;
    const swell = 1 + 0.16 * wobble(x, seed + 5, 260) + 0.07 * wobble(x, seed + 6, 70);
    return Math.max(10, depth * belly * Math.min(tl, tr) ** 0.7 * swell);
  };
  // The centre line keeps the top on the collision top: y = top + width / 2.
  const line: number[] = [];
  const a = x0 - (freeL ? 12 : 30);
  const b = x1 + (freeR ? 12 : 30);
  const n = Math.max(8, Math.ceil((b - a) / 40));
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    line.push(x, s.y + width(clamp(x, x0, x1)) / 2 + wobble(x, seed + 1, 90) * 1.2);
  }
  const ws: number[] = [];
  for (let i = 0; i <= n; i++) ws.push(width(clamp(line[i * 2] as number, x0, x1)));
  const wd = (t: number): number => ws[Math.min(n, Math.round(t * n))] as number;
  limb(p, line, wd, WOOD.bark, WOOD.limbH, 0.2, seed, { bark: 1, grain: thin ? 1 : 3, lit: 0.45 });
  // Knots: a few dark burls on the flank.
  const knots = thin ? 0 : Math.floor(s.w / 420);
  for (let i = 0; i < knots; i++) {
    const x = x0 + (s.w * (i + 0.5 + (r() - 0.5) * 0.5)) / Math.max(1, knots);
    p.solid(
      blob(x, s.y + width(x) * 0.62, 11 + r() * 8, 7 + r() * 4, seed + i, 0.25, 12),
      WOOD.bark.dark,
      0.5,
      {
        bark: 1,
      },
    );
  }
  mossCap(p, x0, x1, s.y, {
    seed: seed + 11,
    drapeL: freeL ? 22 : 0,
    drapeR: freeR ? 22 : 0,
    read: 1,
    bare: 0.25,
    thick: thin ? 6 : 10,
  });
  info.tops.push({ x0, x1, y: s.y, kind: 'branch', freeL, freeR });
  const under = (x: number): number => s.y + width(clamp(x, x0, x1)) - 4;
  info.unders.push({ x0: x0 + 20, x1: x1 - 20, y: under, kind: 'branch', trail: 'mixed', reach: 220 });
  if (freeR) info.twigs.push({ x: x1 + 6, y: s.y + width(x1) / 2, angle: 0.15, lit: true });
  if (freeL) info.twigs.push({ x: x0 - 6, y: s.y + width(x0) / 2, angle: Math.PI - 0.15, lit: true });
}

export function paintWoodTerrain(scene: Scene, seed: number): { paint: Paint; info: TerrainInfo } {
  const p = new Paint(scene.width, scene.height);
  const tops = [...scene.solids, ...scene.oneWays.map((o) => ({ ...o, h: 0 }))];
  const info: TerrainInfo = {
    tops: [],
    unders: [],
    faces: [],
    twigs: [],
    ivy: [],
    keepClear: [],
    clearSpots: [],
    covered: [],
    lee: [],
    lanterns: [],
    noGlow: [],
    calm: [],
    hangers: [],
    pockets: [],
    mist: [],
    pool: null,
    // The highest top over x (the room has no ground: below the branches is the drop).
    groundY: (x: number): number => {
      let y = scene.height;
      for (const q of tops) if (x >= q.x && x < q.x + q.w && q.y < y) y = q.y;
      return y;
    },
  };
  for (const s of scene.solids) {
    if (s.tag === 'trunk') {
      paintBole(p, s, seed + s.x);
      info.faces.push({ x: s.x + s.w, y0: s.y, y1: s.y + s.h, dir: 1, kind: 'trunk' });
    }
  }
  for (const s of scene.solids) if (s.tag !== 'trunk') paintLimb(p, scene, s, info, seed + s.x * 7 + s.y);
  for (const o of scene.oneWays)
    paintLimb(p, scene, { tag: o.tag, x: o.x, y: o.y, w: o.w, h: 16 }, info, seed + o.x * 7 + o.y, true);
  return { paint: p, info };
}
