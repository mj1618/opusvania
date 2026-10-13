/**
 * The air: everything that floats between the eye and the forest.
 *
 *   layers.airBack (behind terrain and character)   the strong light shafts, a flock of moths
 *   layers.air     (in front of the character)      faint front shafts + ground mist (one shader
 *                                                   pass), motes, fireflies, falling leaves
 *
 * Shafts, mist and motes are stateless functions of the render clock evaluated on the GPU
 * (lib/fx-air-shaders.ts); fireflies, leaves and moths are a few dozen sprites moved on the CPU.
 * Nothing uses Math.random: layout comes from seeded PRNGs, motion from the clock, so shots
 * reproduce. Everything is confined to the camera view: the volume quads are fitted to it, the
 * motes wrap around it, sprites outside it are hidden.
 *
 * Colours and densities come in threes: [left glade, light well, right stand] (lib/fx-zones.ts),
 * blended by world x so the mood changes along the scene without a seam.
 */
import {
  Buffer,
  BufferUsage,
  Container,
  Geometry,
  GlProgram,
  Graphics,
  Matrix,
  Mesh,
  RenderTexture,
  Shader,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type { Scene } from '../../../sim/scene';
import type { PointLight } from '../../lights';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import type { LayerRect } from '../layer-tree';
import {
  AIR_LIGHTS,
  MAX_SHAFT_GROUPS,
  MOTES_FRAG,
  MOTES_VERT,
  VOLUME_FRAG,
  VOLUME_VERT,
} from '../lib/fx-air-shaders';
import { fxDebug } from '../lib/fx-debug';
import { GroundProfile } from '../lib/fx-ground';
import { playfieldMaskTexture } from '../lib/fx-mask';
import { noiseTexture } from '../lib/fx-noise';
import { zoneColor, zoneMix, zoneWeights } from '../lib/fx-zones';
import { KEY_LIGHT, mix, PALETTE, prng, wind } from '../lib/look';

type Three<T> = readonly [T, T, T];
/** Size of the two volume targets (shafts, mist): half the logical view. */
const VOLUME_SIZE = [960, 540] as const;
const SPORE = 0xb9a2ff;

/** Tunables. Distances in world px, times in seconds, colours 0xRRGGBB. */
export const AIR = {
  shafts: {
    /** Per zone: colour and strength. Cool moonlight, gold, thin violet dusk. */
    color: [0xbfe6ee, mix(PALETTE.keyWarm, PALETTE.keyGold, 0.3), 0xd9c4f2] as Three<number>,
    zoneStrength: [0.7, 0.6, 0.7] as Three<number>,
    /** Strength of the shafts behind the playfield and of the veil in front of the character. */
    back: 0.42,
    front: 0.06,
    /** How much solid playfield hides the front veil (1 = beams pass fully behind it). */
    frontOcclusion: 0.9,
    /** Extra strength high up among the canopy (fades out toward the ground). */
    highBoost: 0,
    /** The canopy moves: each beam slowly brightens and dims by this fraction, at this rate. */
    breathe: 0.3,
    breatheRate: 0.11,
    /** With that, each opening widens and narrows by this fraction of its width. */
    breatheWidth: 0.14,
    /** A quicker, small flicker of each beam's strength (fraction) with this period in seconds. */
    shimmer: 0.1,
    shimmerPeriod: 5,
    /**
     * The beams, two or three to a screen: where each passes through y = KEY_LIGHT.entryY, its
     * half width across, strength, and reach (1 = touches the ground). A beam that reaches the
     * ground ends in a pool of light there (`pool`: its strength as a point light for the post
     * stage, which lands it on ground and plants only).
     */
    beams: [
      { x: 1180, halfWidth: 55, strength: 0.45, reach: 0.7, pool: 0 },
      { x: 1560, halfWidth: 75, strength: 0.7, reach: 1, pool: 0.4 },
      { x: 2290, halfWidth: 90, strength: 0.75, reach: 1, pool: 0.45 },
      { x: 3080, halfWidth: 150, strength: 0.8, reach: 1, pool: 0.4 },
      { x: 3720, halfWidth: 230, strength: 1, reach: 1, pool: 0.5 },
      { x: 4060, halfWidth: 120, strength: 0.6, reach: 0.6, pool: 0 },
      { x: 4800, halfWidth: 110, strength: 0.6, reach: 1, pool: 0.35 },
      { x: 5560, halfWidth: 130, strength: 0.45, reach: 1, pool: 0.35 },
    ],
    /** The pool of light where a beam lands: radius as a multiple of the beam's half width. */
    poolRadius: 1.6,
    poolColor: [0xbfe6ff, PALETTE.keyWarm, 0xe6ccff] as Three<number>,
  },
  mist: {
    /** Per zone: tint and opacity. */
    color: [0x6fb7c9, mix(PALETTE.fogFar, PALETTE.keyWarm, 0.3), 0x7f8fc4] as Three<number>,
    opacity: [0.3, 0.22, 0.34] as Three<number>,
    /** Scale height above the ground, and how fast it fades below the surface line. */
    height: 120,
    underground: 30,
    /** How much a shaft crossing the mist lights it up, and how much point lights do. */
    litByShaft: 0.5,
    litByLights: 0,
    /** Point lights reach this many times their radius through the mist. */
    lightReach: 2.1,
    /** Extra mist lying over the pool: centre x, half width, how many times thicker. */
    poolX: 1696,
    poolWidth: 300,
    poolBoost: 1.6,
    /** The character parts the mist: radius and amount. */
    partRadius: 190,
    partAmount: 0.96,
    /**
     * Sheets of mist hanging between the canopy tiers, behind the playfield: they give the high
     * platforms something pale to stand against and catch the shafts.
     */
    sheets: [
      { y: 330, thickness: 120, opacity: 0.14 },
      { y: 760, thickness: 130, opacity: 0.08 },
    ],
    sheetLitByShaft: 0.8,
    /** How far the wind's wave pushes the sheets as it passes. */
    gust: 70,
  },
  motes: {
    count: 420,
    /** The tile the motes wrap in (bigger than the view so the wrap is never seen). */
    tile: [2800, 1640] as const,
    /** Small sharp points: 2-4 px across. */
    minRadius: 1.1,
    maxRadius: 2.4,
    baseBrightness: 0.55,
    litBrightness: 3.2,
    driftX: 16,
    driftY: -7,
    swirl: 26,
    /** How far the wind's wave carries a mote back and forth: gusts are seen travelling through. */
    windSway: 85,
    /** They gather over the pool (centre x, half width) and low over the ground. */
    poolX: 1700,
    poolWidth: 420,
    hugGround: 0.6,
    /** A few big out-of-focus discs right in front of the lens: how many, radius range, brightness. */
    bokeh: 5,
    bokehRadius: [16, 30] as const,
    bokehBrightness: 0.045,
    /** Per zone: a mote in shade, a mote in a shaft, how many there are, how bright in shade. */
    cool: [PALETTE.glowCyan, mix(PALETTE.fogFar, PALETTE.keyWarm, 0.6), SPORE] as Three<number>,
    warm: [0xd8f4ff, PALETTE.keyWarm, 0xf1d9ff] as Three<number>,
    density: [0.9, 1, 0.75] as Three<number>,
    shade: [1.1, 0.8, 1] as Three<number>,
  },
  fireflies: {
    /** Per zone: how many, their colours, and the x of the spots they gather around. */
    count: [12, 4, 8] as Three<number>,
    colors: [
      [PALETTE.glowCyan, 0xbdf7ff, 0xbdf7a0, 0x8fe9ff],
      [0xffe9a0, 0xd9ff8f, 0xffd58a],
      [0xd7b0ff, 0x9fd0ff, 0xffc9f0, SPORE],
    ] as Three<readonly number[]>,
    spots: [[760, 1660], [2760], [4380, 5250]] as Three<readonly number[]>,
    spread: 210,
    /** Hover band above the ground. */
    minAbove: 36,
    maxAbove: 230,
    wander: 60,
    /** Sprite size, px: the core is ~7% of it (a 2 px pinpoint), the rest a faint halo. */
    size: 26,
    /** Peak opacity (the blink); the resting glow is about half of it. */
    peak: 0.85,
    fleeRadius: 170,
    fleePush: 900,
    spring: 2.2,
    damping: 2.6,
  },
  leaves: {
    count: 14,
    fallSpeed: 58,
    sway: 64,
    size: 11,
    /** Seconds a leaf lies where it landed before it fades. */
    rest: 9,
    colors: [
      PALETTE.foliage,
      PALETTE.foliageLit,
      PALETTE.foliageSun,
      PALETTE.keyGold,
      PALETTE.glowViolet,
    ] as const,
  },
  /**
   * A soft cool glow in the air behind the hero (behind the playfield too), so a dark figure on a
   * dark ledge has something paler to stand against. Additive and faint: against a bright
   * background it disappears by itself. Per zone: colour and strength.
   */
  backGlow: {
    radius: 300,
    color: [0x7fd0ee, 0xcfe8d0, 0xb7a8f0] as Three<number>,
    alpha: [0, 0, 0] as Three<number>,
    /** Extra strength with the camera high in the canopy, where everything behind is dark. */
    high: 0,
  },
  moths: {
    count: 6,
    /** The flock crosses the whole scene at this speed, then again from the start. */
    speed: 120,
    height: 800,
    size: 7,
    /**
     * Per zone: the wings' colour. Dusky, in the zone's own hue at about 60% value: the flock is
     * life in the background, never brighter than the hero's face.
     */
    color: [0x6f9aa6, 0x9c9468, 0x8478a8] as Three<number>,
    glow: 0.07,
  },
};

const rgbOf = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

/** Three zone colours plus a fourth component each, packed for a `vec4[3]` uniform. */
function pack3(out: Float32Array, colors: Three<number>, w: Three<number>): void {
  for (let i = 0; i < 3; i++) out.set([...rgbOf(colors[i] as number), w[i] as number], i * 4);
}

type U<T> = { uniforms: T };
const vec4 = (n = 1) => ({ value: new Float32Array(4 * n), type: 'vec4<f32>' as const, size: n });

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
      uMask: playfieldMaskTexture().source,
      airShared: shared,
      volume: {
        uRect: vec4(),
        uView: vec4(),
        uShaftColors: vec4(3),
        uMistColors: vec4(3),
        uVolume: vec4(),
        uMist: vec4(),
        uPlayer: vec4(),
        uBands: vec4(2),
        uPoolMist: vec4(),
        uBandLook: vec4(),
        uLightPos: vec4(AIR_LIGHTS),
        uLightCol: vec4(AIR_LIGHTS),
      },
    },
  });
  return new Mesh({ geometry, shader });
}

type VolumeU = Record<
  | 'uRect'
  | 'uView'
  | 'uBands'
  | 'uPoolMist'
  | 'uBandLook'
  | 'uShaftColors'
  | 'uMistColors'
  | 'uVolume'
  | 'uMist'
  | 'uPlayer'
  | 'uLightPos'
  | 'uLightCol',
  Float32Array
>;
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
    for (let z = 0; z < 3; z++) {
      const n = cfg.count[z] as number;
      const colors = cfg.colors[z] as readonly number[];
      const spots = cfg.spots[z] as readonly number[];
      for (let i = 0; i < n; i++) {
        // Small gatherings around a few spots, denser toward the middle of each.
        const spot = spots[i % spots.length] as number;
        const off = (rnd() + rnd() + rnd() - 1.5) * cfg.spread;
        const hx = Math.min(ground.width - 60, Math.max(60, spot + off));
        const hy = ground.top(hx) - cfg.minAbove - rnd() ** 1.6 * (cfg.maxAbove - cfg.minAbove);
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = colors[Math.floor(rnd() * colors.length)] as number;
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
      const wx = (Math.sin(a) + 0.5 * Math.sin(a * 2.3 + f.ph * 2)) * f.r + wind(f.hx, t, f.ph) * 16;
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
      f.s.alpha = Math.min(1, glow) * cfg.peak;
    }
  }
}

/** A wide, coreless falloff: light hanging in the air. */
function softTexture(): Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (let i = 0; i <= 8; i++) {
      const r = i / 8;
      grad.addColorStop(r, `rgba(255,255,255,${((1 - r * r) ** 2).toFixed(3)})`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return Texture.from(c);
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

/**
 * Falling leaves and petals: sparse. Each spirals down, settles where it lands (ground or water),
 * lies there a while and fades. A leaf's whole flight is a function of the clock; only the landing
 * moment is worked out once per flight.
 */
class Leaves {
  readonly view = new Container({ label: 'leaves' });
  private readonly leaves: Array<{
    g: Graphics;
    seed: number;
    period: number;
    ph: number;
    cycle: number;
    x0: number;
    a0: number;
    w: number;
    drift: number;
    land: number;
    landY: number;
    spin: number;
  }> = [];

  /** Everything a leaf can come to rest on: [x0, x1, top]. */
  private readonly surfaces: Array<[number, number, number]>;
  private readonly width: number;

  constructor(ground: GroundProfile, scene: Scene) {
    const sceneHeight = scene.height;
    this.width = scene.width;
    this.surfaces = [
      ...scene.solids.map((s): [number, number, number] => [
        s.x,
        s.x + s.w,
        s.tag === 'pool' ? ground.top(s.x + s.w / 2) : s.y,
      ]),
      ...scene.oneWays.map((o): [number, number, number] => [o.x, o.x + o.w, o.y]),
    ];
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
      g.moveTo(-size, 0)
        .lineTo(size, 0)
        .stroke({ color: mix(color, PALETTE.keyWarm, 0.4), width: 0.8, alpha: 0.6 });
      this.view.addChild(g);
      this.leaves.push({
        g,
        seed: i * 977 + 13,
        period: (sceneHeight + 200) / cfg.fallSpeed + cfg.rest + 4 + rnd() * 10,
        ph: rnd(),
        cycle: -1,
        x0: 0,
        a0: 0,
        w: 1,
        drift: 0,
        land: 0,
        landY: 0,
        spin: 0,
      });
    }
  }

  /** Where the leaf of this flight is `t` seconds after it let go. */
  private path(l: (typeof this.leaves)[number], t: number): [number, number] {
    const cfg = AIR.leaves;
    const a = l.a0 + t * l.w;
    return [
      l.x0 + l.drift * t + Math.sin(a) * cfg.sway + Math.sin(a * 0.43 + 1) * cfg.sway * 0.6,
      -160 + t * cfg.fallSpeed * (1 + 0.25 * Math.cos(a * 2)),
    ];
  }

  update(frame: SceneFrame, vis: LayerRect): void {
    const cfg = AIR.leaves;
    for (const l of this.leaves) {
      const turn = frame.clock / l.period + l.ph;
      const cycle = Math.floor(turn);
      const t = (turn - cycle) * l.period;
      if (cycle !== l.cycle) {
        // A new flight: a new lane, and find the moment it touches down.
        const rnd = prng(l.seed + cycle * 7919);
        l.cycle = cycle;
        l.x0 = rnd() * this.width;
        l.a0 = rnd() * 6.283;
        l.w = 0.7 + rnd() * 0.5;
        l.drift = 6 + rnd() * 14;
        l.spin = rnd() * 6.283;
        l.land = l.period;
        l.landY = 1e9;
        let prevY = -1e9;
        search: for (let s = 0; s < l.period; s += 0.1) {
          const [x, y] = this.path(l, s);
          for (const [x0, x1, top] of this.surfaces) {
            if (x >= x0 && x <= x1 && prevY < top - 3 && y >= top - 3) {
              l.land = s;
              l.landY = top - 3;
              break search;
            }
          }
          prevY = y;
        }
      }
      const g = l.g;
      const flying = t < l.land;
      const at = this.path(l, Math.min(t, l.land));
      const x = at[0];
      const y = Math.min(at[1], l.landY);
      const lain = t - l.land;
      if (
        lain > cfg.rest ||
        x < vis.x - 40 ||
        x > vis.x + vis.w + 40 ||
        y < vis.y - 40 ||
        y > vis.y + vis.h + 40
      ) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const a = l.a0 + Math.min(t, l.land) * l.w;
      if (flying) {
        // Rocking like a falling leaf, the long axis foreshortening as it tumbles; the wind's
        // wave carries it sideways as it passes.
        g.position.set(x + wind(x, frame.clock, l.ph) * 26, y);
        g.rotation = Math.cos(a) * 0.9 + Math.sin(a * 0.43) * 0.5 + l.spin;
        g.scale.set(1, 0.3 + 0.7 * Math.abs(Math.cos(a * 1.7 + l.ph * 9)));
        g.alpha = Math.min(1, t * 1.5);
      } else {
        // Settled: lying flat, eased down in the first half second, fading at the end.
        const ease = Math.min(1, lain * 2);
        const flat = Math.sin(l.spin) * 0.25;
        g.position.set(x, y + 2 * ease);
        g.rotation = flat + (Math.cos(a) * 0.9 + Math.sin(a * 0.43) * 0.5 + l.spin - flat) * (1 - ease) ** 2;
        g.scale.set(1, 0.3 + (0.3 + 0.7 * Math.abs(Math.cos(a * 1.7 + l.ph * 9)) - 0.3) * (1 - ease));
        g.alpha = Math.min(1, (cfg.rest - lain) / 2.5);
      }
    }
  }
}

/**
 * A small flock of pale moths that crosses the scene now and then, behind the playfield. Each is
 * two pairs of soft wings beating around a tiny body, with a faint glow so it reads against the
 * dark canopy.
 */
class Moths {
  readonly view = new Container({ label: 'moths' });
  private readonly moths: Array<{
    wings: Graphics;
    glow: Sprite;
    ph: number;
    ox: number;
    oy: number;
    rate: number;
  }> = [];

  private readonly rgb = [0, 0, 0];

  constructor(private readonly sceneWidth: number) {
    const cfg = AIR.moths;
    const rnd = prng(0x307b);
    const tex = glowTexture();
    for (let i = 0; i < cfg.count; i++) {
      const s = cfg.size * (0.8 + rnd() * 0.5);
      const wings = new Graphics();
      for (const side of [-1, 1]) {
        // Fore wing: broad, swept up and back. Hind wing: smaller, rounder, below it.
        wings
          .moveTo(0, 0)
          .bezierCurveTo(side * s * 0.5, -s * 1.5, side * s * 1.9, -s * 1.3, side * s * 1.7, -s * 0.2)
          .bezierCurveTo(side * s * 1.3, s * 0.3, side * s * 0.4, s * 0.2, 0, 0)
          .fill({ color: 0xffffff, alpha: 0.7 });
        wings
          .moveTo(0, s * 0.1)
          .bezierCurveTo(side * s * 0.9, s * 0.1, side * s * 1.2, s * 0.9, side * s * 0.7, s * 1.1)
          .bezierCurveTo(side * s * 0.3, s * 1.0, side * s * 0.1, s * 0.5, 0, s * 0.1)
          .fill({ color: 0xc4ccd0, alpha: 0.6 });
      }
      wings.ellipse(0, s * 0.2, s * 0.16, s * 0.55).fill({ color: 0x565a5c, alpha: 0.9 });
      const glow = new Sprite(tex);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.alpha = cfg.glow;
      glow.scale.set((s * 6) / tex.width);
      this.view.addChild(glow, wings);
      this.moths.push({
        wings,
        glow,
        ph: rnd() * 6.283,
        ox: (rnd() - 0.5) * 300,
        oy: (rnd() - 0.5) * 150,
        rate: 9 + rnd() * 5,
      });
    }
  }

  update(frame: SceneFrame, vis: LayerRect): void {
    const cfg = AIR.moths;
    const t = frame.clock;
    // The flock's centre runs the length of the scene and a margin, then starts again.
    const span = this.sceneWidth + 2400;
    const cx = ((t * cfg.speed + 900) % span) - 1200;
    const cy = cfg.height + Math.sin(t * 0.21) * 150 + Math.sin(t * 0.53 + 1) * 60;
    for (const m of this.moths) {
      // Moths do not fly straight: a loose bobbing path with quick little jinks.
      const x = cx + m.ox + Math.sin(t * 0.9 + m.ph) * 50 + Math.sin(t * 2.9 + m.ph * 2) * 16;
      const y = cy + m.oy + Math.cos(t * 1.1 + m.ph * 1.3) * 38 + Math.sin(t * 4.3 + m.ph) * 12;
      const on = x > vis.x - 40 && x < vis.x + vis.w + 40;
      m.wings.visible = on;
      m.glow.visible = on;
      if (!on) continue;
      m.wings.position.set(x, y);
      m.glow.position.set(x, y);
      zoneColor(cfg.color, zoneWeights(x), this.rgb);
      const tint =
        (Math.round((this.rgb[0] as number) * 255) << 16) |
        (Math.round((this.rgb[1] as number) * 255) << 8) |
        Math.round((this.rgb[2] as number) * 255);
      m.wings.tint = tint;
      m.glow.tint = tint;
      m.glow.alpha = cfg.glow;
      m.wings.rotation = Math.sin(t * 0.9 + m.ph) * 0.35 + 0.15;
      // Wing beat: the wings fold toward the body (narrower), with a short glide now and then.
      const glide = Math.max(0, Math.sin(t * 0.7 + m.ph * 3)) ** 8;
      const beat = Math.abs(Math.sin(t * m.rate + m.ph * 4));
      m.wings.scale.set(0.25 + 0.75 * (beat * (1 - glide) + glide), 1);
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
  private moths!: Moths;
  private backGlow!: Sprite;
  private readonly pools: Array<PointLight | undefined> = [];
  private backTarget!: RenderTexture;
  private frontTarget!: RenderTexture;
  private backView!: Sprite;
  private frontView!: Sprite;
  private readonly toTarget = new Matrix();
  private ground!: GroundProfile;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const ground = new GroundProfile(ctx.scene);
    this.ground = ground;
    const groundTex = ground.texture();
    this.shared = new UniformGroup({
      uGroups: { value: new Float32Array(MAX_SHAFT_GROUPS * 4), type: 'vec4<f32>', size: MAX_SHAFT_GROUPS },
      uAir: { value: new Float32Array([0, ...ground.uMap, 0]), type: 'vec4<f32>' },
    });

    // The two volume passes are soft by nature, so they are drawn at half the logical resolution
    // into their own targets and shown stretched over the view: a sixteenth of the pixels at 4K.
    const gl = (ctx.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    const float =
      !!gl?.getExtension('EXT_color_buffer_float') || !!gl?.getExtension('EXT_color_buffer_half_float');
    const target = (): RenderTexture =>
      RenderTexture.create({
        width: VOLUME_SIZE[0],
        height: VOLUME_SIZE[1],
        resolution: 1,
        format: float ? 'rgba16float' : 'rgba8unorm',
        antialias: false,
        scaleMode: 'linear',
      });
    AIR.shafts.beams.forEach((b, i) => {
      if (b.pool <= 0) return;
      const light: PointLight = { x: 0, y: 0, radius: 1, color: 0xffffff, intensity: 0 };
      this.pools[i] = light;
      ctx.lights.set(`shaft${i}`, light);
    });
    this.back = volumeMesh(this.shared, groundTex);
    this.backTarget = target();
    this.backView = new Sprite(this.backTarget);
    this.backView.label = 'shafts-back';
    this.moths = new Moths(ctx.scene.width);
    this.backGlow = new Sprite(softTexture());
    this.backGlow.anchor.set(0.5);
    this.backGlow.blendMode = 'add';
    this.backGlow.label = 'hero-back-glow';
    ctx.layers.get('airBack').addChild(this.backView, this.backGlow, this.moths.view);

    this.front = volumeMesh(this.shared, groundTex);
    this.frontTarget = target();
    this.frontView = new Sprite(this.frontTarget);
    this.frontView.label = 'shafts-front+mist';
    this.motes = this.buildMotes(groundTex);
    this.leaves = new Leaves(ground, ctx.scene);
    this.fireflies = new Fireflies(ground);
    ctx.layers.air.addChild(this.frontView, this.leaves.view, this.motes, this.fireflies.view);
    fxDebug('air', AIR);
    fxDebug('leaves', this.leaves);
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
          uCam: vec4(),
          uMoteLook: vec4(),
          uMoteMove: vec4(),
          uClusters: vec4(),
          uBokeh: vec4(),
          uCool: vec4(3),
          uWarm: vec4(3),
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
    const t = frame.clock;

    // Shared: clock and shaft groups (entry point -> position across the beams). Each opening
    // breathes on its own slow clock, as if the canopy above it were moving.
    const su = this.shared.uniforms as { uGroups: Float32Array; uAir: Float32Array };
    su.uAir[0] = t;
    su.uGroups.fill(0);
    const sceneH = this.ctx.scene.height;
    shafts.beams.slice(0, MAX_SHAFT_GROUPS).forEach((b, i) => {
      // Each beam breathes on its own slow clock, as if the canopy above it were moving.
      const open =
        Math.sin(t * shafts.breatheRate + i * 2.1) * 0.6 + Math.sin(t * shafts.breatheRate * 2.3 + i) * 0.4;
      // On top of that the leaves above flicker it a little, every few seconds.
      const w = (6.283 / shafts.shimmerPeriod) * (1 + 0.13 * Math.sin(i * 5.3));
      const flicker = Math.sin(t * w + i * 1.7) * 0.65 + Math.sin(t * w * 1.83 + i * 4.1) * 0.35;
      const strength = b.strength * (1 + shafts.breathe * open) * (1 + shafts.shimmer * flicker);
      su.uGroups[i * 4] = b.x * KEY_LIGHT.dirY - KEY_LIGHT.entryY * KEY_LIGHT.dirX;
      su.uGroups[i * 4 + 1] = b.halfWidth * (1 + shafts.breatheWidth * open);
      su.uGroups[i * 4 + 2] = strength;
      su.uGroups[i * 4 + 3] = b.reach;

      // Where the beam meets the ground it leaves a pool of light (a point light for the post
      // stage). Walk the centre line down to the ground profile.
      const pool = this.pools[i];
      if (!pool) return;
      let x = b.x;
      let y: number = KEY_LIGHT.entryY;
      for (let k = 0; k < 6; k++) {
        const gy = Math.min(sceneH, this.ground.top(Math.min(this.ground.width, Math.max(0, x))));
        x = b.x + ((gy - KEY_LIGHT.entryY) * KEY_LIGHT.dirX) / KEY_LIGHT.dirY;
        y = gy;
      }
      const zw = zoneWeights(x);
      const c = [0, 0, 0];
      zoneColor(shafts.poolColor, zw, c);
      pool.x = x;
      pool.y = y - 30;
      pool.radius = b.halfWidth * shafts.poolRadius;
      pool.color =
        (Math.round((c[0] as number) * 255) << 16) |
        (Math.round((c[1] as number) * 255) << 8) |
        Math.round((c[2] as number) * 255);
      pool.intensity = b.pool * (1 + shafts.breathe * open) * zoneMix(shafts.zoneStrength, zw);
    });
    this.shared.update();

    const p = frame.sim.player;
    for (const [mesh, strength, front, target, view] of [
      [this.back, shafts.back, false, this.backTarget, this.backView],
      [this.front, shafts.front, true, this.frontTarget, this.frontView],
    ] as const) {
      const u = volumeU(mesh);
      if (front && strength <= 0) {
        // Only mist to draw: fit the quad to the band above the ground that can hold any.
        const [lo, hi] = this.ground.range(vis.x - 100, vis.x + vis.w + 100);
        const y0 = Math.max(vis.y, lo - mist.height * 3.4);
        const y1 = Math.min(vis.y + vis.h, hi + mist.underground * 3);
        mesh.visible = y1 > y0;
        u.uRect.set([vis.x, y0, vis.w, Math.max(0, y1 - y0)]);
      } else {
        mesh.visible = true;
        u.uRect.set([vis.x, vis.y, vis.w, vis.h]);
      }
      u.uView.set([vis.x, vis.y, vis.w, vis.h]);
      pack3(u.uShaftColors, shafts.color, shafts.zoneStrength);
      pack3(u.uMistColors, mist.color, mist.opacity);
      u.uVolume.set([strength, front ? 1 : 0, front ? shafts.frontOcclusion : 0, mist.gust]);
      u.uMist.set([mist.height, mist.underground, mist.litByShaft, mist.litByLights]);
      u.uPlayer.set([p.cx, p.feetY - 20, mist.partRadius, mist.partAmount]);
      mist.sheets.forEach((b, i) => {
        u.uBands.set([b.y, b.thickness, b.opacity, 0], i * 4);
      });
      u.uBandLook.set([front ? 0 : 1, mist.sheetLitByShaft, shafts.highBoost, 0]);
      u.uPoolMist.set([mist.poolX, mist.poolWidth, mist.poolBoost, 0]);
      u.uLightPos.fill(0);
      if (front) {
        const lights = this.ctx.lights.list;
        for (let i = 0, n = 0; i < lights.length && n < AIR_LIGHTS; i++) {
          const l = lights[i];
          if (!l || l.intensity <= 0) continue;
          u.uLightPos.set([l.x, l.y, l.radius * mist.lightReach, l.intensity], n * 4);
          u.uLightCol.set([...rgbOf(l.color), 1], n * 4);
          n++;
        }
      }

      view.visible = mesh.visible;
      if (!mesh.visible) continue;
      const kx = VOLUME_SIZE[0] / vis.w;
      const ky = VOLUME_SIZE[1] / vis.h;
      this.toTarget.set(kx, 0, 0, ky, -vis.x * kx, -vis.y * ky);
      this.ctx.renderer.render({
        container: mesh,
        target,
        clear: true,
        clearColor: [0, 0, 0, 0],
        transform: this.toTarget,
      });
      view.position.set(vis.x, vis.y);
      view.width = vis.w;
      view.height = vis.h;
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
    (mu.uClusters as Float32Array).set([motes.poolX, motes.poolWidth, motes.hugGround, 0]);
    (mu.uBokeh as Float32Array).set([
      1 - motes.bokeh / motes.count,
      motes.bokehRadius[0],
      motes.bokehRadius[1],
      motes.bokehBrightness,
    ]);
    pack3(mu.uCool as Float32Array, motes.cool, motes.density);
    pack3(mu.uWarm as Float32Array, motes.warm, motes.shade);

    // The glow behind the hero.
    const bg = AIR.backGlow;
    const zw = zoneWeights(p.cx);
    const tint = [0, 0, 0];
    zoneColor(bg.color, zw, tint);
    const high = Math.min(1, Math.max(0, (sceneH - 540 - frame.camera.y) / Math.max(1, sceneH - 1080)));
    this.backGlow.position.set(p.cx, p.cy - 6);
    this.backGlow.scale.set((bg.radius * 2) / this.backGlow.texture.width);
    this.backGlow.tint =
      (Math.round((tint[0] as number) * 255) << 16) |
      (Math.round((tint[1] as number) * 255) << 8) |
      Math.round((tint[2] as number) * 255);
    this.backGlow.alpha = zoneMix(bg.alpha, zw) + bg.high * high;

    this.fireflies.update(frame, vis);
    this.leaves.update(frame, vis);
    this.moths.update(frame, this.ctx.layers.visible('airBack', frame.camera));
  }
}
