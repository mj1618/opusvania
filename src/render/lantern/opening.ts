/**
 * The opening, staged (the Canopy r12, docs/design/levels/canopy-moments.md moment 1, "Last to hatch"; the room's
 * `marks.stage.open` and `marks.stage.lights`). What the camera (camera/open-cam.ts), the black (room-fade.ts), the
 * river (swarm/: its tail leaves at `hatchTail`) and the kin (character/tatter.ts) do not:
 *
 *   title     LAMPFALL fades in under the moon `titleAfter` frames after the hatch, as the river's tail crosses it, in
 *             screen space: a player who breaks out and runs still sees it (canopy review r12 #6).
 *
 * (The swarm's shadows over the branch before the hatch were cut in r13: they read as dark birds in the sky, not
 * shadows on the bark: review r12 #5.)
 *   valley    the valley's false lights far below the promise lip (`stage.lights`, at the far plane's parallax), each
 *             with a spinning knot of moths round it; while the river still flows, a stream peels off it and pours
 *             down into them. The knots stay: the moths there are caught.
 *
 * Render only: reads the sim view (events, the hatch, her place), never writes it.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { CameraView, SimView } from '../contract';
import type { SceneContext } from '../scene/index';
import type { LayerTree } from '../scene/layer-tree';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';

export const OPENING = {
  /** The title: size (safe px), letter spacing, alpha, its fade (s: in, hold, out), gap under the moon's disc. */
  title: { size: 76, spacing: 26, alpha: 0.86, in: 1.6, hold: 3.6, out: 2.2, under: 64, color: 0xdfe6f2 },
  /** The valley: the far plane's parallax, each light's glow and its knot (moths, orbit px, size px). */
  valley: {
    parallax: 0.4,
    /** Where their middle sits on screen from the lip's camera (safe px), and how far their rect is spread (x). */
    at: [1180, 830] as const,
    spread: 0.38,
    lamp: 0xffb35e,
    core: 0xfff0c8,
    knot: 22,
    orbit: [18, 46] as const,
    size: [2.6, 4.2] as const,
    moth: 0xf2e6cc,
    /** The pour: moths in it, where it peels off the river (screen px from the lit lights' middle). */
    pour: 70,
    from: [-520, -420] as const,
  },
};

interface Open {
  black?: number;
  title?: string;
  titleAfter?: number;
  hatchTail?: number;
}

export class Opening {
  private readonly open: Open;
  private readonly lights: { x: number; y: number; w: number; h: number; count: number } | null;
  private readonly front = new Graphics();
  private readonly far = new Graphics();
  private readonly farGlow = new GlowPool('opening-far-glow');
  private readonly title: Text | null = null;
  private readonly titleBox = new Container({ label: 'opening-title' });
  /** Render seconds since the `hatch` event (-1 = not yet: shut in). */
  private since = -1;
  private readonly layers: LayerTree;
  /** The promise lip's camera (`marks.camera` promise): where the valley is framed from. */
  private readonly lip: { x: number; y: number };

  /** The opening's pieces for this room, or null (no `stage.open` and no valley lights). */
  static for(ctx: SceneContext): Opening | null {
    if (LOOK.kit !== 'wood') return null;
    const st = ctx.scene.marks?.stage as { open?: Open; lights?: unknown } | undefined;
    return st?.open || st?.lights ? new Opening(ctx) : null;
  }

  private constructor(ctx: SceneContext) {
    const st = ctx.scene.marks?.stage as {
      open?: Open;
      lights?: { x: number; y: number; w: number; h: number; count: number };
    };
    this.open = st.open ?? {};
    this.lights = st.lights ?? null;
    this.layers = ctx.layers;
    const marks = ctx.scene.marks as { camera?: Array<{ id: string; x: number; y: number }> } | undefined;
    const pm = marks?.camera?.find((c) => c.id === 'promise');
    this.lip = pm ? { x: pm.x, y: pm.y } : { x: this.lights?.x ?? 0, y: this.lights?.y ?? 0 };
    ctx.layers.air.addChild(this.front, this.titleBox);
    ctx.layers.get('swarmFar').addChild(this.farGlow.container, this.far);
    if (this.open.title) {
      const T = OPENING.title;
      this.title = new Text({
        text: this.open.title,
        style: {
          fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
          fontSize: T.size,
          fill: T.color,
          letterSpacing: T.spacing,
          dropShadow: { color: 0x05070b, alpha: 0.6, blur: 10, distance: 0, angle: 0 },
        },
        resolution: 2,
      });
      this.title.anchor.set(0.5, 0.5);
      this.titleBox.addChild(this.title);
      this.titleBox.visible = false;
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    // (The hatch's state is not in the view: its events and the save's flag say it.)
    const sets = sim.scene.hatch?.sets;
    for (const e of sim.events) {
      if (e.type === 'hatch') this.since = 0;
      else if (e.type === 'spawn') {
        this.since = sets && sim.save.flags.includes(sets) ? 99 : -1;
      }
    }
    if (this.since >= 0) this.since += dt;
    // A teleport or a load past the hatching: it is over.
    if (this.since < 0 && sets && sim.save.flags.includes(sets)) this.since = 99;
    this.front.clear();
    this.far.clear();
    this.farGlow.begin();
    this.drawTitle(cam, sim.scene.id);
    if (this.lights) this.drawValley(clock, cam);
    this.farGlow.end();
  }

  /** LAMPFALL under the moon, `titleAfter` frames after the hatch (screen space, carried in the air layer). */
  private drawTitle(cam: CameraView, room: string): void {
    const t = this.title;
    if (!t) return;
    const T = OPENING.title;
    const at = (this.open.titleAfter ?? 150) / 60;
    const u = this.since - at;
    const k =
      this.since < 0 || u < 0 || u > T.in + T.hold + T.out
        ? 0
        : u < T.in
          ? smooth(u / T.in)
          : u < T.in + T.hold
            ? 1
            : 1 - smooth((u - T.in - T.hold) / T.out);
    this.titleBox.visible = k > 0.003;
    if (!this.titleBox.visible) return;
    // The moon is fixed in the sky's screen space (`art.moon`, safe-area px): under its disc, whatever the zoom.
    const m = LOOK.moon ?? { x: 1420, y: 190, r: 88 };
    const sx = m.x;
    const sy = m.y + (m.r ?? 88) + T.under;
    this.titleBox.position.set(cam.x + (sx - 960) / cam.zoom, cam.y + (sy - 540) / cam.zoom);
    this.titleBox.scale.set(1 / cam.zoom);
    // (Canopy review r12 #6: it went with the moon's disc, and a player who ran east at once never saw it. The moon
    // keeps its place on screen; so does the title, whether or not the canopy has closed over the disc.)
    void room;
    t.alpha = T.alpha * k;
  }

  /** The valley's false lights far below, each with its knot of moths, and the pour off the river into them. */
  private drawValley(clock: number, cam: CameraView): void {
    const V = OPENING.valley;
    const L = this.lights as { x: number; y: number; w: number; h: number; count: number };
    const tree = this.layers;
    const p = tree.parallax('swarmFar');
    const A = tree.anchor;
    // Far below the promise: seen from the lip's camera (`marks.camera` promise) the lights sit `at` (safe px) on
    // screen, spread `spread` x their rect, and they drift at the far plane's parallax as the camera moves off it.
    const cx = A.x + (cam.x - A.x) * p;
    const cy = A.y + (cam.y - A.y) * p;
    const lip = this.lip;
    const rx = L.x + L.w / 2;
    const ry = L.y + L.h / 2;
    const place = (wx: number, wy: number): [number, number] => [
      cx + (V.at[0] - 960) / cam.zoom + (wx - rx) * V.spread + (lip.x - cam.x) * V.parallax,
      cy + (V.at[1] - 540) / cam.zoom + (wy - ry) * V.spread + (lip.y - cam.y) * V.parallax,
    ];
    const g = this.far;
    let mx = 0;
    let my = 0;
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i < L.count; i++) {
      const wx = L.x + hash01('vl', i * 2) * L.w;
      const wy = L.y + hash01('vl', i * 2 + 1) ** 0.7 * L.h;
      const [x, y] = place(wx, wy);
      // Farther down (higher y) is nearer: bigger.
      const near = (wy - L.y) / L.h;
      pts.push([x, y, near]);
      mx += x / L.count;
      my += y / L.count;
    }
    const halfW = cam.w / 2 / cam.zoom + 200;
    if (pts.every(([x]) => Math.abs(x - cx) > halfW)) return;
    for (let i = 0; i < pts.length; i++) {
      const [x, y, near] = pts[i] as [number, number, number];
      const fl = 0.8 + 0.2 * Math.sin(clock * (1.7 + hash01('vf', i)) + i);
      const r = 3.5 + 3.5 * near;
      // Warm and low: a wide wash on the mist, a hot halo, the point.
      this.farGlow.add(x, y + 10, r * 26, V.lamp, 0.16 * fl, r * 14);
      this.farGlow.add(x, y, r * 8, V.lamp, 0.5 * fl);
      g.circle(x, y, r).fill({ color: V.core, alpha: 0.9 * fl });
      // The knot: moths spinning round it tight and fast, caught.
      const n = Math.round(V.knot * (0.7 + 0.6 * near));
      for (let k = 0; k < n; k++) {
        const h = hash01(`kn${i}`, k);
        const orb = (V.orbit[0] + (V.orbit[1] - V.orbit[0]) * h) * (0.7 + 0.5 * near);
        const sp = (2.2 + 2.5 * hash01(`ks${i}`, k)) * (hash01(`kd${i}`, k) < 0.75 ? 1 : -1);
        const a = clock * sp + h * 40;
        const mxk = x + Math.cos(a) * orb;
        const myk = y + Math.sin(a) * orb * 0.55 - 4;
        const s = (V.size[0] + (V.size[1] - V.size[0]) * hash01(`kz${i}`, k)) * (0.8 + 0.4 * near);
        const lit = Math.max(0, 1 - orb / (V.orbit[1] * 1.2));
        moth(
          g,
          mxk,
          myk,
          s,
          Math.abs(Math.sin(clock * 18 + k)),
          Math.sin(a) * sp > 0 ? 1 : -1,
          mix(V.moth, V.lamp, lit * 0.5),
          0.85,
        );
      }
    }
    // The pour: while the river flows (from the pass to its tail + the moths still on the way), a stream peels off
    // high on the left and falls into the lights, each moth to one of them.
    const tail = (this.open.hatchTail ?? 480) / 60;
    const pourK =
      this.since < 0 ? 0 : smooth((this.since - 6) / 3) * (1 - smooth((this.since - tail - 7) / 4));
    if (pourK <= 0.01) return;
    const sx = mx + V.from[0];
    const sy = my + V.from[1];
    for (let k = 0; k < V.pour; k++) {
      const h = hash01('pr', k);
      const u = (clock * (0.16 + 0.1 * h) + h) % 1;
      if (hash01('pk', k) > pourK) continue;
      const [tx, ty] = pts[k % pts.length] as [number, number, number];
      // A falling arc out of the river toward its light, the moths speeding up as they are pulled in.
      const e = u * u * (3 - 2 * u);
      const bow = Math.sin(Math.PI * u) * (60 + 80 * hash01('pb', k));
      const x = sx + (tx - sx) * e + (hash01('px', k) - 0.5) * 40 * (1 - u);
      const y = sy + (ty - sy) * e - bow * 0.4;
      moth(
        g,
        x,
        y,
        3.2,
        Math.abs(Math.sin(clock * 16 + k)),
        1,
        V.moth,
        0.8 * Math.min(1, (1 - u) * 6) * pourK,
      );
    }
  }
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
