/**
 * The air: everything that floats between the eye and the forest.
 *
 *   layers.airBack (behind terrain and character)   the strong light shafts
 *   layers.air     (in front of the character)      faint front shafts + ground mist (one shader
 *                                                   pass), motes, fireflies, falling leaves
 *
 * Shafts, mist and motes are stateless functions of the render clock evaluated on the GPU
 * (lib/fx-air-shaders.ts); fireflies and leaves are a few dozen sprites moved on the CPU. Nothing
 * uses Math.random: layout comes from seeded PRNGs, motion from the clock, so shots reproduce.
 * Everything is confined to the camera view: the volume quads are fitted to it, the motes wrap
 * around it, sprites outside it are hidden.
 */
import {
  Buffer,
  BufferUsage,
  Container,
  Geometry,
  GlProgram,
  Graphics,
  Mesh,
  Shader,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import type { LayerRect } from '../layer-tree';
import { MAX_SHAFT_GROUPS, MOTES_FRAG, MOTES_VERT, VOLUME_FRAG, VOLUME_VERT } from '../lib/fx-air-shaders';
import { fxDebug } from '../lib/fx-debug';
import { GroundProfile } from '../lib/fx-ground';
import { noiseTexture } from '../lib/fx-noise';
import { KEY_LIGHT, mix, PALETTE, prng, wind } from '../lib/look';

/** Tunables. Distances in world px, times in seconds, colours 0xRRGGBB. */
export const AIR = {
  shafts: {
    color: mix(PALETTE.keyWarm, PALETTE.keyGold, 0.25),
    /** Strength of the shafts behind the playfield and of the veil in front of the character. */
    back: 0.55,
    front: 0.15,
    /**
     * Where the canopy lets light through: entry point (the shaft passes through it), half width
     * across the beam, strength, and reach (0 = dies high in the air, 1 = almost touches the ground).
     */
    groups: [
      { x: KEY_LIGHT.entryX, y: KEY_LIGHT.entryY, halfWidth: 560, strength: 1, reach: 0.9 },
      { x: 1560, y: KEY_LIGHT.entryY, halfWidth: 240, strength: 0.6, reach: 0.6 },
      { x: 5650, y: KEY_LIGHT.entryY, halfWidth: 270, strength: 0.65, reach: 0.65 },
    ],
  },
  mist: {
    color: mix(PALETTE.fogMid, PALETTE.fogFar, 0.55),
    opacity: 0.55,
    /** Scale height above the ground, and how fast it fades below the surface line. */
    height: 120,
    underground: 30,
    /** How much a shaft crossing the mist lights it up. */
    litByShaft: 2.2,
    /** The character parts the mist: radius and amount. */
    partRadius: 150,
    partAmount: 0.6,
  },
  motes: {
    count: 620,
    /** The tile the motes wrap in (bigger than the view so the wrap is never seen). */
    tile: [2800, 1640] as const,
    minRadius: 1.5,
    maxRadius: 6.5,
    baseBrightness: 0.16,
    litBrightness: 2.6,
    driftX: 16,
    driftY: -7,
    swirl: 26,
    windSway: 34,
    cool: mix(PALETTE.fogFar, PALETTE.glowCyan, 0.5),
    warm: PALETTE.keyWarm,
  },
  fireflies: {
    count: 44,
    /** Hover band above the ground. */
    minAbove: 36,
    maxAbove: 250,
    wander: 78,
    size: 62,
    fleeRadius: 170,
    fleePush: 900,
    spring: 2.2,
    damping: 2.6,
    colors: [0xd9ff8f, 0xbdf7a0, PALETTE.glowCyan] as const,
  },
  leaves: {
    count: 10,
    fallSpeed: 62,
    sway: 70,
    size: 11,
    colors: [
      PALETTE.foliage,
      PALETTE.foliageLit,
      PALETTE.foliageSun,
      PALETTE.keyGold,
      PALETTE.glowViolet,
    ] as const,
  },
};

const rgbOf = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

type U<T> = { uniforms: T };

function volumeMesh(shared: UniformGroup, ground: Texture): Mesh<Geometry, Shader> {
  const geometry = new Geometry({
    attributes: {
      aPosition: {
        buffer: new Buffer({ data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), usage: BufferUsage.VERTEX }),
        format: 'float32x2',
      },
    },
    indexBuffer: new Buffer({ data: new Uint32Array([0, 1, 2, 0, 2, 3]), usage: BufferUsage.INDEX }),
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex: VOLUME_VERT, fragment: VOLUME_FRAG, name: 'air-volume' }),
    resources: {
      uNoise: noiseTexture().source,
      uGround: ground.source,
      airShared: shared,
      volume: {
        uRect: { value: new Float32Array(4), type: 'vec4<f32>' },
        uShaftColor: { value: new Float32Array(4), type: 'vec4<f32>' },
        uMistColor: { value: new Float32Array(4), type: 'vec4<f32>' },
        uMist: { value: new Float32Array(4), type: 'vec4<f32>' },
        uPlayer: { value: new Float32Array(4), type: 'vec4<f32>' },
      },
    },
  });
  return new Mesh({ geometry, shader });
}

type VolumeU = {
  uRect: Float32Array;
  uShaftColor: Float32Array;
  uMistColor: Float32Array;
  uMist: Float32Array;
  uPlayer: Float32Array;
};
const volumeU = (m: Mesh<Geometry, Shader>): VolumeU =>
  ((m.shader as Shader).resources.volume as U<VolumeU>).uniforms;

/** Fireflies: lazy wandering lights that shy away from the character and drift back. */
class Fireflies {
  readonly view = new Container({ label: 'fireflies' });
  private readonly flies: Array<{
    s: Sprite;
    hx: number;
    hy: number;
    ph: number;
    rate: number;
    r: number;
    ox: number;
    oy: number;
    vx: number;
    vy: number;
    scale: number;
  }> = [];

  constructor(ground: GroundProfile) {
    const cfg = AIR.fireflies;
    const tex = glowTexture();
    const rnd = prng(0xf1ef1e);
    for (let i = 0; i < cfg.count; i++) {
      // Spread along the scene in loose clumps: jittered slots, pulled toward a few gathering spots.
      const slot = ((i + rnd()) / cfg.count) * ground.width;
      const hx = Math.min(ground.width - 60, Math.max(60, slot + (rnd() - 0.5) * 380));
      const hy = ground.top(hx) - cfg.minAbove - rnd() ** 1.6 * (cfg.maxAbove - cfg.minAbove);
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = cfg.colors[Math.floor(rnd() * cfg.colors.length)] as number;
      this.view.addChild(s);
      this.flies.push({
        s,
        hx,
        hy,
        ph: rnd() * 6.283,
        rate: 0.5 + rnd() * 0.7,
        r: cfg.wander * (0.5 + rnd()),
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        scale: 0.7 + rnd() * 0.6,
      });
    }
  }

  update(frame: SceneFrame, vis: LayerRect): void {
    const cfg = AIR.fireflies;
    const t = frame.clock;
    const dt = Math.min(frame.dt, 0.05);
    const p = frame.sim.player;
    const margin = cfg.size + cfg.wander * 2;
    for (const f of this.flies) {
      if (f.hx < vis.x - margin || f.hx > vis.x + vis.w + margin) {
        f.s.visible = false;
        f.ox *= 0.9;
        f.oy *= 0.9;
        continue;
      }
      const a = t * f.rate * 0.35 + f.ph;
      const wx = (Math.sin(a) + 0.5 * Math.sin(a * 2.3 + f.ph * 2)) * f.r + wind(f.hx, t, f.ph) * 10;
      const wy = (Math.sin(a * 1.31 + f.ph * 0.7) * 0.5 + 0.3 * Math.sin(a * 2.9 + 1.1)) * f.r * 0.7;
      let x = f.hx + wx + f.ox;
      let y = f.hy + wy + f.oy;
      // Shy away from the character, spring back when it has gone.
      const dx = x - p.cx;
      const dy = y - p.cy;
      const d = Math.hypot(dx, dy);
      let ax = -f.ox * cfg.spring - f.vx * cfg.damping;
      let ay = -f.oy * cfg.spring - f.vy * cfg.damping;
      if (d < cfg.fleeRadius && d > 0.01) {
        const push = (1 - d / cfg.fleeRadius) ** 2 * cfg.fleePush;
        ax += (dx / d) * push;
        ay += (dy / d) * push - push * 0.25;
      }
      f.vx += ax * dt;
      f.vy += ay * dt;
      f.ox += f.vx * dt;
      f.oy += f.vy * dt;
      x = f.hx + wx + f.ox;
      y = f.hy + wy + f.oy;
      // Slow breathing glow with a brighter blink now and then.
      const breathe = 0.5 + 0.5 * Math.sin(t * f.rate * 1.7 + f.ph * 3);
      const blink = Math.max(0, Math.sin(t * f.rate * 0.9 + f.ph * 5)) ** 6;
      const glow = 0.3 + 0.45 * breathe + 0.5 * blink;
      f.s.visible = true;
      f.s.position.set(x, y);
      f.s.scale.set(((cfg.size * f.scale) / f.s.texture.width) * (0.8 + 0.3 * glow));
      f.s.alpha = Math.min(1, glow);
    }
  }
}

/** A soft dot with a hot core, for anything small that glows. */
function glowTexture(): Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.07, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.16, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.36, 'rgba(255,255,255,0.13)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.03)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
}

/** Falling leaves and petals: sparse, tumbling, each a stateless loop of the clock. */
class Leaves {
  readonly view = new Container({ label: 'leaves' });
  private readonly leaves: Array<{ g: Graphics; seed: number; period: number; ph: number; size: number }> =
    [];

  constructor(
    private readonly ground: GroundProfile,
    private readonly sceneHeight: number,
  ) {
    const cfg = AIR.leaves;
    const rnd = prng(0x1eaf);
    for (let i = 0; i < cfg.count; i++) {
      const size = cfg.size * (0.7 + rnd() * 0.7);
      // Mostly greens, a few gold, a rare violet petal.
      const pick = rnd();
      const color = cfg.colors[
        pick < 0.3 ? 0 : pick < 0.58 ? 1 : pick < 0.78 ? 2 : pick < 0.94 ? 3 : 4
      ] as number;
      const g = new Graphics();
      g.moveTo(-size, 0)
        .quadraticCurveTo(-size * 0.2, -size * 0.62, size, 0)
        .quadraticCurveTo(-size * 0.2, size * 0.62, -size, 0)
        .fill(mix(color, PALETTE.shadow, 0.35));
      g.moveTo(-size, 0)
        .quadraticCurveTo(-size * 0.2, -size * 0.62, size, 0)
        .lineTo(-size, 0)
        .fill({ color, alpha: 0.9 });
      this.view.addChild(g);
      this.leaves.push({
        g,
        seed: i * 977 + 13,
        period: (sceneHeight + 300) / (cfg.fallSpeed * (0.75 + rnd() * 0.6)),
        ph: rnd(),
        size,
      });
    }
  }

  update(frame: SceneFrame, vis: LayerRect): void {
    const cfg = AIR.leaves;
    const t = frame.clock;
    for (const l of this.leaves) {
      const turn = t / l.period + l.ph;
      const cycle = Math.floor(turn);
      const k = turn - cycle;
      // A new random lane every fall.
      const rnd = prng(l.seed + cycle * 7919);
      const x0 = rnd() * this.ground.width;
      const a = t * (0.7 + rnd() * 0.5) + rnd() * 6.283;
      const y = -200 + k * (this.sceneHeight + 300);
      const x =
        x0 +
        Math.sin(a) * cfg.sway +
        Math.sin(a * 0.43 + 1) * cfg.sway * 0.6 +
        k * 240 +
        wind(x0, t, l.ph) * 30;
      const floor = this.ground.top(x) - 4;
      const g = l.g;
      if (y > floor || x < vis.x - 40 || x > vis.x + vis.w + 40 || y < vis.y - 40 || y > vis.y + vis.h + 40) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(x, y);
      // Rocking like a falling leaf, with the long axis foreshortening as it tumbles.
      g.rotation = Math.cos(a) * 0.9 + Math.sin(a * 0.43) * 0.5 + rnd() * 6.283;
      g.scale.set(1, 0.35 + 0.65 * Math.abs(Math.cos(a * 1.7 + l.ph * 9)));
      g.alpha = Math.min(1, k * 12, (floor - y) / 50);
    }
  }
}

export class AirLayer implements EnvModule {
  private ctx!: SceneContext;
  private shared!: UniformGroup;
  private back!: Mesh<Geometry, Shader>;
  private front!: Mesh<Geometry, Shader>;
  private motes!: Mesh<Geometry, Shader>;
  private fireflies!: Fireflies;
  private leaves!: Leaves;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const ground = new GroundProfile(ctx.scene);
    const groundTex = ground.texture();
    this.shared = new UniformGroup({
      uGroups: { value: new Float32Array(MAX_SHAFT_GROUPS * 4), type: 'vec4<f32>', size: MAX_SHAFT_GROUPS },
      uAir: { value: new Float32Array([0, ...ground.uMap, 0]), type: 'vec4<f32>' },
    });

    this.back = volumeMesh(this.shared, groundTex);
    this.back.label = 'shafts-back';
    ctx.layers.get('airBack').addChild(this.back);

    this.front = volumeMesh(this.shared, groundTex);
    this.front.label = 'shafts-front+mist';
    this.motes = this.buildMotes(groundTex);
    this.leaves = new Leaves(ground, ctx.scene.height);
    this.fireflies = new Fireflies(ground);
    ctx.layers.air.addChild(this.front, this.leaves.view, this.motes, this.fireflies.view);
    fxDebug('air', AIR);
  }

  private buildMotes(groundTex: Texture): Mesh<Geometry, Shader> {
    const n = AIR.motes.count;
    const rnd = prng(0x907e5);
    const corners = new Float32Array(n * 8);
    const seeds = new Float32Array(n * 16);
    const indices = new Uint32Array(n * 6);
    const quad = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let i = 0; i < n; i++) {
      const s = [rnd(), rnd(), rnd(), rnd()];
      for (let v = 0; v < 4; v++) {
        corners[i * 8 + v * 2] = quad[v * 2] as number;
        corners[i * 8 + v * 2 + 1] = quad[v * 2 + 1] as number;
        seeds.set(s, i * 16 + v * 4);
      }
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: new Buffer({ data: corners, usage: BufferUsage.VERTEX }), format: 'float32x2' },
        aSeed: { buffer: new Buffer({ data: seeds, usage: BufferUsage.VERTEX }), format: 'float32x4' },
      },
      indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX }),
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: MOTES_VERT, fragment: MOTES_FRAG, name: 'air-motes' }),
      resources: {
        uNoise: noiseTexture().source,
        uGround: groundTex.source,
        airShared: this.shared,
        motes: {
          uCam: { value: new Float32Array(4), type: 'vec4<f32>' },
          uMoteLook: { value: new Float32Array(4), type: 'vec4<f32>' },
          uMoteMove: { value: new Float32Array(4), type: 'vec4<f32>' },
          uCool: { value: new Float32Array(4), type: 'vec4<f32>' },
          uWarm: { value: new Float32Array(4), type: 'vec4<f32>' },
        },
      },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.label = 'motes';
    return mesh;
  }

  update(frame: SceneFrame): void {
    const vis = this.ctx.layers.visible('air', frame.camera);
    const { shafts, mist, motes } = AIR;

    // Shared: clock and shaft groups (entry point -> position across the beams).
    const su = this.shared.uniforms as { uGroups: Float32Array; uAir: Float32Array };
    su.uAir[0] = frame.clock;
    su.uGroups.fill(0);
    shafts.groups.slice(0, MAX_SHAFT_GROUPS).forEach((g, i) => {
      su.uGroups[i * 4] = g.x * KEY_LIGHT.dirY - g.y * KEY_LIGHT.dirX;
      su.uGroups[i * 4 + 1] = g.halfWidth;
      su.uGroups[i * 4 + 2] = g.strength;
      su.uGroups[i * 4 + 3] = g.reach;
    });
    this.shared.update();

    const p = frame.sim.player;
    for (const [mesh, strength, withMist] of [
      [this.back, shafts.back, false],
      [this.front, shafts.front, true],
    ] as const) {
      const u = volumeU(mesh);
      u.uRect.set([vis.x, vis.y, vis.w, vis.h]);
      u.uShaftColor.set([...rgbOf(shafts.color), strength]);
      u.uMistColor.set([...rgbOf(mist.color), withMist ? mist.opacity : 0]);
      u.uMist.set([mist.height, mist.underground, mist.litByShaft, 0]);
      u.uPlayer.set([p.cx, p.feetY - 20, mist.partRadius, mist.partAmount]);
    }

    const mu = ((this.motes.shader as Shader).resources.motes as U<Record<string, Float32Array>>).uniforms;
    (mu.uCam as Float32Array).set([frame.camera.x, frame.camera.y, motes.tile[0], motes.tile[1]]);
    (mu.uMoteLook as Float32Array).set([
      motes.minRadius,
      motes.maxRadius,
      motes.baseBrightness,
      motes.litBrightness,
    ]);
    (mu.uMoteMove as Float32Array).set([motes.driftX, motes.driftY, motes.swirl, motes.windSway]);
    (mu.uCool as Float32Array).set([...rgbOf(motes.cool), 1]);
    (mu.uWarm as Float32Array).set([...rgbOf(motes.warm), 1]);

    this.fireflies.update(frame, vis);
    this.leaves.update(frame, vis);
  }
}
