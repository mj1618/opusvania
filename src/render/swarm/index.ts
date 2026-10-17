/**
 * The moth swarm (memory/swarm.md): Wing's kind, leaving without her. One instanced mesh per depth
 * layer (far specks, mid moths, a few blurred near ones), every moth moved and drawn on the GPU
 * from its seeds and the swarm clock (src/render/swarm/shader.ts). The CPU only runs the behaviour
 * (paths.ts: where the river's frame is, the formation blend, the feed) and sets uniforms.
 *
 * Reads the sim (events, her x) and never changes it. Starts on the `hatch` event, restarts with
 * the room (`roomEnter` / a fresh state); a teleport (the capture tools) starts it late, in the
 * thin lead stream. Rooms without a `marks.swarm` have no swarm.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';
import { type CameraView, type RenderContext, SAFE_H, SAFE_W, type SimView } from '../contract';
import type { LayerTree } from '../scene/layer-tree';
import { SKY } from '../scene/layers/sky';
import { fxDebug } from '../scene/lib/fx-debug';
import { LOOK } from '../scene/lib/room-look';
import { SWARM, type SwarmLayerCfg } from './config';
import {
  crossFromPolyline,
  PATH_POINTS,
  pathLength,
  RiverBehaviour,
  type SwarmPlan,
  timeTable,
} from './paths';
import { HAZE_FRAG, HAZE_VERT, SWARM_FRAG, SWARM_VERT } from './shader';

const vec4 = (n = 1) => ({ value: new Float32Array(4 * n), type: 'vec4<f32>' as const, size: n });

/** A seeded generator (mulberry32): the moths' seeds are the same every boot. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (c: number): [number, number, number] => [
  ((c >> 16) & 255) / 255,
  ((c >> 8) & 255) / 255,
  (c & 255) / 255,
];

interface SwarmLayer {
  cfg: SwarmLayerCfg;
  mesh: Mesh<Geometry, Shader>;
  u: Record<string, Float32Array>;
  parallax: number;
}

function buildMesh(
  cfg: SwarmLayerCfg,
  seed: number,
): { mesh: Mesh<Geometry, Shader>; u: Record<string, Float32Array>; group: UniformGroup } {
  const n = cfg.count;
  const rnd = prng(seed);
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // Lateral place in the band: a bell (mean of three uniforms), a dense core with a thin fringe.
    const lat = ((rnd() + rnd() + rnd()) / 3) * 2 - 1;
    a.set([rnd(), rnd(), lat, rnd()], i * 4);
    b.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const geometry = new Geometry({
    attributes: {
      aPosition: {
        buffer: new Buffer({
          data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
          usage: BufferUsage.VERTEX,
        }),
        format: 'float32x2',
      },
      aA: { buffer: new Buffer({ data: a, usage: BufferUsage.VERTEX }), format: 'float32x4', instance: true },
      aB: { buffer: new Buffer({ data: b, usage: BufferUsage.VERTEX }), format: 'float32x4', instance: true },
    },
    indexBuffer: new Buffer({ data: new Uint32Array([0, 1, 2, 0, 2, 3]), usage: BufferUsage.INDEX }),
    instanceCount: n,
  });
  const uniforms = {
    uPath: vec4(PATH_POINTS),
    uClock: vec4(),
    uFeed: vec4(),
    uFeed2: vec4(),
    uFeed3: vec4(),
    uWaves: vec4(),
    uWaves2: vec4(),
    uLook: vec4(),
    uBeat: vec4(),
    uView: vec4(),
    uScreen: vec4(),
    uMoon: vec4(),
    uBeh: vec4(),
    uBeh2: vec4(),
    uBeh3: vec4(),
    uBeh4: vec4(),
    uBeh5: vec4(),
    uBeh6: vec4(),
    uBody: vec4(),
    uSky: vec4(),
    uRim: vec4(),
    uMembrane: vec4(),
    uGlint: vec4(),
    uSheen: vec4(),
    uDebug: vec4(),
    uHaze: vec4(),
  };
  const group = new UniformGroup(uniforms);
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex: SWARM_VERT, fragment: SWARM_FRAG, name: `swarm-${cfg.layer}` }),
    resources: { swarm: group },
  });
  const mesh = new Mesh({ geometry, shader });
  mesh.label = cfg.layer;
  const u: Record<string, Float32Array> = {};
  for (const [k, v] of Object.entries(uniforms)) u[k] = v.value;
  return { mesh, u, group };
}

/** The river's haze: a strip of `HAZE_SEGMENTS` along the path, drawn under the far moths with their uniforms. */
const HAZE_SEGMENTS = 96;
function buildHaze(group: UniformGroup): Mesh<Geometry, Shader> {
  const n = HAZE_SEGMENTS;
  const pos = new Float32Array((n + 1) * 4);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i <= n; i++) pos.set([i / n, -1, i / n, 1], i * 4);
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  const geometry = new Geometry({
    attributes: {
      aPosition: { buffer: new Buffer({ data: pos, usage: BufferUsage.VERTEX }), format: 'float32x2' },
    },
    indexBuffer: new Buffer({ data: idx, usage: BufferUsage.INDEX }),
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex: HAZE_VERT, fragment: HAZE_FRAG, name: 'swarm-haze' }),
    resources: { swarm: group },
  });
  const mesh = new Mesh({ geometry, shader });
  mesh.label = 'swarmHaze';
  return mesh;
}

export class SwarmRenderer {
  private readonly layers: SwarmLayer[] = [];
  private readonly river: RiverBehaviour | null;
  private haze: Mesh<Geometry, Shader> | null = null;
  private readonly times: number[] = [];
  private lastFrame = -1;
  private plan: SwarmPlan | null = null;
  /** CPU ms of the last update (debug). */
  cpuMs = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly tree: LayerTree,
  ) {
    const room = ctx.scene;
    const marks = room.marks;
    if (!marks?.swarm || marks.swarm.length < 2) {
      this.river = null;
      return;
    }
    const promise = marks.promise;
    const at = marks.camera?.find((c) => c.id === 'promise');
    const releaseX = promise ? promise.x0 - SWARM.release.before : room.width;
    const cross =
      at ?? (promise ? { x: (promise.x0 + promise.x1) / 2, y: promise.y - 100 } : { x: room.width, y: 0 });
    // The crossing follows the room's swarm polyline (the level agent moves it in the room file).
    this.river = new RiverBehaviour(
      releaseX,
      { x: cross.x, y: cross.y },
      crossFromPolyline(marks.swarm, cross),
    );
    const seed = (room.art?.seed ?? 1) * 7919;
    SWARM.layers.forEach((cfg, i) => {
      const { mesh, u, group } = buildMesh(cfg, seed + i * 1013);
      mesh.visible = false;
      // The haze goes under the first (farthest) layer's moths and shares its uniforms.
      if (i === 0) {
        this.haze = buildHaze(group);
        this.haze.visible = false;
        tree.get(cfg.layer).addChild(this.haze);
      }
      tree.get(cfg.layer).addChild(mesh);
      this.layers.push({ cfg, mesh, u, parallax: tree.parallax(cfg.layer) });
    });
    // Without a hatching the swarm is already under way.
    if (!room.hatch) this.pendingLate = true;
    fxDebug('swarm', SWARM);
    const g = globalThis as { __swarm?: unknown };
    g.__swarm = this;
  }

  private pendingLate = false;
  private pendingStart: number | null = null;

  /**
   * Debug / capture: start the swarm `tau` s in (0 = the head coming into view). `hold` keeps it from
   * letting go at the promise gap (to look at the pass anywhere in the room).
   */
  start(tau = 0, hold = false): void {
    this.pendingStart = tau;
    if (this.river) this.river.hold = hold;
  }

  /** Debug: what the behaviour planned last frame. */
  info(): {
    running: boolean;
    tau: number;
    releaseTau: number;
    fx: number;
    fy: number;
    cpuMs: number;
  } | null {
    const p = this.plan;
    if (!this.river || !p) return null;
    return {
      running: this.river.running,
      tau: p.tau,
      releaseTau: p.releaseTau,
      fx: p.fx,
      fy: p.fy,
      cpuMs: this.cpuMs,
    };
  }

  update(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const river = this.river;
    if (!river) return;
    const t0 = performance.now();
    // A fresh state (load) starts the frame count again: the hatching is to come.
    const fresh = sim.frame < this.lastFrame;
    this.lastFrame = sim.frame;
    for (const e of sim.events) {
      if (e.type === 'hatch') river.start(-SWARM.delay, view.x, view.y);
      else if (e.type === 'roomEnter') {
        if (this.ctx.scene.hatch) river.stop();
        else river.start(SWARM.lateStart, view.x, view.y);
      } else if (e.type === 'spawn' && !fresh && !sim.events.some((x) => x.type === 'roomEnter')) {
        // A teleport: the hatching is over without an event. Start late, or carry on from the new place.
        if (!river.running) river.start(SWARM.lateStart, view.x, view.y);
        else river.snap(view.x, view.y);
      }
    }
    if (fresh && this.ctx.scene.hatch) river.stop();
    if (this.pendingLate) {
      this.pendingLate = false;
      river.start(SWARM.lateStart, view.x, view.y);
    }
    if (this.pendingStart !== null) {
      river.start(this.pendingStart, view.x, view.y);
      this.pendingStart = null;
    }

    const plan = river.update({ dt, camX: view.x, camY: view.y, heroX: sim.player.cx });
    this.plan = plan;
    const on = SWARM.enabled && plan.active;
    for (const l of this.layers) l.mesh.visible = on;
    if (this.haze) this.haze.visible = on && SWARM.haze.strength > 0;
    if (!on) {
      this.cpuMs = performance.now() - t0;
      return;
    }
    this.setUniforms(plan, clock, view);
    this.cpuMs = performance.now() - t0;
  }

  private setUniforms(plan: SwarmPlan, clock: number, view: CameraView): void {
    const S = SWARM;
    const anchor = this.tree.anchor;
    timeTable(plan.path, this.times);
    const len = pathLength(plan.path);
    // The moon on screen, as sky.ts places it (view px at zoom 1, nearly screen-fixed).
    const moon = LOOK.moon;
    const mx0 = moon ? moon.x + (LOOK.keyEntryX - view.x) * SKY.wood.parallax : -1e4;
    const my0 = moon ? moon.y + (anchor.y - view.y) * SKY.glowParallaxY : -1e4;
    // The view centre is the safe area's centre on every window shape (memory/view-size.md); nothing is culled.
    const hw = SAFE_W / 2;
    const hh = SAFE_H / 2;
    const mx = hw + (mx0 - hw) * view.zoom;
    const my = hh + (my0 - hh) * view.zoom;
    const scale = this.ctx.viewScale();
    const c = S.colors;
    for (const l of this.layers) {
      const { cfg, u, parallax: p } = l;
      // The frame point in this layer's own coordinates, and where this layer's camera is.
      const fx = anchor.x + (plan.fx - anchor.x) * p + cfg.dx;
      const fy = anchor.y + (plan.fy - anchor.y) * p + cfg.dy;
      const cx = anchor.x + (view.x - anchor.x) * p;
      const cy = anchor.y + (view.y - anchor.y) * p;
      const path = u.uPath as Float32Array;
      plan.path.forEach((q, i) => {
        path.set([fx + q[0], fy + q[1], q[2] * cfg.band, this.times[i] ?? 0], i * 4);
      });
      const rate = (cfg.speed / S.period) * (3400 / Math.max(len, 1));
      const f = S.feed;
      set(u.uClock, clock, plan.tau, rate, plan.releaseTau);
      set(u.uFeed, f.rampIn, f.peakEnd, f.decline, f.tail * cfg.tail * cfg.peak);
      set(u.uFeed2, f.releaseFade, cfg.peak, S.gaps.depth, S.gaps.rate);
      // Every layer's head is equally far along at the start: slower layers were fed earlier.
      set(u.uFeed3, f.headStart / cfg.speed, 0, 0, 0);
      set(u.uWaves, S.waves.k[0], S.waves.amp[0], S.waves.k[1], S.waves.amp[1]);
      set(u.uWaves2, S.waves.speed, S.neck.amp, S.neck.k, S.neck.rate);
      set(u.uLook, cfg.size[0], cfg.size[1], cfg.flutter, cfg.blur);
      set(u.uBeat, cfg.beat[0], cfg.beat[1], cfg.detail ? 1 : 0, cfg.alpha);
      set(u.uView, cx, cy, view.zoom, scale);
      set(u.uScreen, hw, hh, mx, my);
      set(u.uMoon, moon ? moon.r : 0, S.halo, cfg.rim, cfg.haze);
      set(u.uBeh, S.dart.share, S.loop.share, S.straggle.share, S.wander.amp);
      set(u.uBeh2, S.dart.every[0], S.dart.every[1], S.dart.dur, S.dart.reach);
      set(u.uBeh3, S.loop.every[0], S.loop.every[1], S.loop.dur, S.spread);
      set(u.uBeh4, S.loop.radius[0], S.loop.radius[1], S.straggle.lateral, S.straggle.slow);
      set(u.uBeh5, S.wander.rate, S.heading.swing, S.glint.share, S.glint.every);
      set(u.uBeh6, S.glint.dur, S.glint.gain, S.flap.tilt, S.flap.amp);
      set(u.uBody, ...rgb(c.body), 1);
      set(u.uSky, ...rgb(c.sky), 1);
      set(u.uRim, ...rgb(c.rim), 1);
      set(u.uMembrane, ...rgb(c.membrane), 1);
      set(u.uGlint, ...rgb(c.glint), 1);
      set(u.uSheen, S.sheen.gain, S.sheen.floor, S.sheen.rim, 0);
      set(u.uDebug, S.debug.lineup ? 1 : 0, S.debug.spacing, 0, 0);
      set(u.uHaze, S.haze.strength, S.haze.width, S.haze.patches, 0);
    }
  }
}

function set(arr: Float32Array | undefined, a: number, b: number, c: number, d: number): void {
  arr?.set([a, b, c, d]);
}
