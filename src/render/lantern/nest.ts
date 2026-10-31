/**
 * The firefly's nest (the Canopy r13, docs/design/levels/canopy-moments.md moment 4, "into the nest"): the pocket the
 * chase ends in (a pass with `chase.end`), drawn as its collection. Behind the pocket's cover (it lifts as she goes
 * in), so it is only seen from inside:
 *
 *   cages    empty cages hung on threads up the shaft's walls, waiting to be hung (the cause, shown);
 *   husks    glow-caps stripped of their light, stumps on the floor and the walls (where its light comes from);
 *   thread   a coil of its silk on the floor and loose threads strung across the shaft;
 *   light    its cold-gold light while it is in there (the chase's `nest` and `call`), then only a dim memory of it.
 *
 * The flight, the alarm, the kindles and the call are acts.ts's (the firefly itself). Render only: reads the scene, the
 * firefly's kit state and events.
 */
import { Graphics } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { LightRegistry, PointLight } from '../lights';
import type { SceneContext } from '../scene/index';
import { oldCage } from '../scene/lib/den-larder';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';

export const NEST = {
  /** Empty cages up the walls: how many, their height (px), how far apart up the shaft (px). */
  cages: 5,
  cageH: [44, 64] as const,
  rise: 150,
  /** Husks on the floor and walls, and the coil's turns. */
  husks: 7,
  coil: 5,
  /** Its light inside: colour, radius (px), strength while it is there; what is left after it has gone. */
  light: 0xd8ff7a,
  r: 360,
  on: 0.5,
  after: 0.06,
  silk: 0xc8d0a0,
  cap: 0x48405a,
  capLit: 0x8a80a0,
};

interface Pocket {
  x0: number;
  x1: number;
  floor: number;
  top: number;
  endX: number;
  endY: number;
}

export class FireflyNest {
  private readonly stuff = new Graphics({ label: 'nest' });
  private readonly glow = new GlowPool('nest-glow');
  private readonly light: PointLight = { x: 0, y: 0, radius: 0, color: NEST.light, intensity: 0 };
  /** 0..1: how much its light fills the nest now. */
  private litK = 0;
  private gone = false;

  static for(ctx: SceneContext, lights: LightRegistry): FireflyNest | null {
    if (LOOK.kit !== 'wood') return null;
    const ffs = (
      ctx.scene as {
        fireflies?: Array<{ id: string; path: Array<[number, number]>; chase?: { end: [number, number] } }>;
      }
    ).fireflies;
    const i = (ffs ?? []).findIndex((f) => f.chase?.end);
    const f = ffs?.[i];
    if (!f?.chase) return null;
    const pocket = pocketOf(ctx.scene, f.chase.end, f.path[f.path.length - 1] as [number, number]);
    return pocket ? new FireflyNest(ctx, lights, pocket, i) : null;
  }

  private constructor(
    ctx: SceneContext,
    private readonly lights: LightRegistry,
    private readonly p: Pocket,
    private readonly pass: number,
  ) {
    this.paint();
    // (In `goal`: in front of the bake, behind the pocket's cover in `playfieldFront`, which lifts as she goes in.)
    const goal = ctx.layers.get('goal');
    goal.addChild(this.glow.container, this.stuff);
    lights.set('nest', this.light);
  }

  private paint(): void {
    const N = NEST;
    const { x0, x1, floor, top } = this.p;
    const g = this.stuff;
    const w = x1 - x0;
    const bronze = { col: 0x2a2018, dark: 0x0e0b08, lit: 0x8a7a50 };
    // Empty cages up the shaft, hung from pegs in the walls, alternating sides, each on its thread.
    for (let k = 0; k < N.cages; k++) {
      const left = k % 2 === 0;
      const h = N.cageH[0] + (N.cageH[1] - N.cageH[0]) * hash01('nc', k);
      const x = left ? x0 + 24 + h * 0.3 : x1 - 24 - h * 0.3;
      const y = floor - 170 - k * N.rise - 30 * hash01('ny', k);
      if (y - h < top + 40) break;
      const ty = y - h / 2 - 50 - 40 * hash01('nt', k);
      const tx = left ? x0 + 4 : x1 - 4;
      g.moveTo(tx, ty)
        .quadraticCurveTo((tx + x) / 2, ty + 18, x, y - h / 2)
        .stroke({
          color: N.silk,
          width: 1.2,
          alpha: 0.55,
        });
      g.circle(tx, ty, 3).fill({ color: 0x1a140e });
      oldCage(g, x, y, h, (hash01('na', k) - 0.5) * 0.25, 0, bronze, 900 + k * 7, false);
    }
    // Loose threads strung across the shaft.
    for (let k = 0; k < 4; k++) {
      const y0 = floor - 120 - k * 210 - 60 * hash01('ns', k);
      const y1 = y0 + (hash01('ns2', k) - 0.5) * 90;
      g.moveTo(x0, y0)
        .quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + 30, x1, y1)
        .stroke({ color: N.silk, width: 0.9, alpha: 0.3 });
    }
    // Stripped glow-caps: stumps with torn rims, no light left in them (floor and walls).
    for (let k = 0; k < N.husks; k++) {
      const onFloor = k < 4;
      const x = onFloor ? x0 + 20 + (w - 40) * hash01('nh', k) : k % 2 ? x0 + 6 : x1 - 6;
      const y = onFloor ? floor + 2 : floor - 260 - 220 * hash01('nhy', k);
      const s = 9 + 7 * hash01('nhs', k);
      const dir = onFloor ? -Math.PI / 2 : k % 2 ? 0 : Math.PI;
      const ca = Math.cos(dir);
      const sa = Math.sin(dir);
      const P = (u: number, v: number): [number, number] => [x + u * ca - v * sa, y + u * sa + v * ca];
      // Stalk, then the torn cap (a ragged half dome), its gills grey: the light was taken out.
      const stalk = [
        ...P(0, -s * 0.22),
        ...P(s * 1.2, -s * 0.16),
        ...P(s * 1.2, s * 0.16),
        ...P(0, s * 0.22),
      ];
      g.poly(stalk).fill({ color: N.cap, alpha: 0.95 });
      const capPts: number[] = [];
      for (let q = 0; q <= 8; q++) {
        const a = -Math.PI / 2 + (Math.PI * q) / 8;
        const rr = s * (0.9 + 0.3 * (q % 2 ? hash01('nr', k * 9 + q) : 1));
        capPts.push(...P(s * 1.2 + Math.cos(a) * rr * 0.5, Math.sin(a) * rr));
      }
      g.poly(capPts).fill({ color: N.cap, alpha: 0.95 });
      g.poly([...P(s * 1.2, -s * 0.8), ...P(s * 1.25, s * 0.8), ...P(s * 1.05, 0)]).fill({
        color: N.capLit,
        alpha: 0.35,
      });
    }
    // A coil of its silk on the floor.
    const cx = x0 + w * 0.62;
    const cy = floor - 4;
    for (let t = 0; t < N.coil * Math.PI * 2; t += 0.25) {
      const r0 = 4 + t * 1.6;
      const r1 = 4 + (t + 0.25) * 1.6;
      g.moveTo(cx + Math.cos(t) * r0, cy + Math.sin(t) * r0 * 0.35)
        .lineTo(cx + Math.cos(t + 0.25) * r1, cy + Math.sin(t + 0.25) * r1 * 0.35)
        .stroke({ color: N.silk, width: 1.1, alpha: 0.5 });
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    void cam;
    const N = NEST;
    const ff = (sim.kit as unknown as { firefly?: { pass: number; beat?: number; x: number; y: number } })
      .firefly;
    for (const e of sim.events) if ((e.type as string) === 'fireflyHide') this.gone = true;
    const inside = !!ff && ff.pass === this.pass && (ff.beat ?? 0) >= 4 && !this.gone;
    this.litK += ((inside ? 1 : 0) - this.litK) * Math.min(1, dt * (inside ? 3 : 0.8));
    const { x0, x1, floor } = this.p;
    const fx = inside && ff ? ff.x : (x0 + x1) / 2;
    const fy = inside && ff ? ff.y : floor - 300;
    const pulse = 0.85 + 0.15 * Math.sin(clock * 1.7 * Math.PI * 2);
    const k = N.after + (N.on - N.after) * this.litK * pulse;
    this.glow.begin();
    this.glow.add(fx, fy, N.r, N.light, 0.25 * k, N.r * 1.4);
    this.glow.add((x0 + x1) / 2, floor - 60, (x1 - x0) * 0.8, N.light, 0.18 * k, 50);
    this.glow.end();
    this.light.x = fx;
    this.light.y = fy;
    this.light.radius = N.r * 1.6;
    this.light.intensity = 0.9 * k;
  }

  destroy(): void {
    this.lights.remove('nest');
  }
}

/** The pocket the chase ends in: the walls either side of its end, the floor under the path's last point. */
function pocketOf(scene: SimView['scene'], end: [number, number], mouth: [number, number]): Pocket | null {
  let floor = Number.POSITIVE_INFINITY;
  for (const s of scene.solids)
    if (end[0] >= s.x && end[0] <= s.x + s.w && s.y > mouth[1] - 300 && s.y < floor) floor = s.y;
  if (!Number.isFinite(floor)) return null;
  const yw = floor - 400;
  let x0 = end[0] - 200;
  let x1 = end[0] + 200;
  for (const s of scene.solids) {
    if (yw < s.y || yw > s.y + s.h) continue;
    if (s.x + s.w <= end[0] && s.x + s.w > x0) x0 = s.x + s.w;
    if (s.x >= end[0] && s.x < x1) x1 = s.x;
  }
  return { x0, x1, floor, top: end[1], endX: end[0], endY: end[1] };
}
