// biome-ignore-all lint/style/noNonNullAssertion: path maths over arrays indexed in range
/**
 * The Mouth's material: grown root and folded tissue, drawn as tapered strips (one mesh per batch).
 * Every strip carries its own length coordinate, so the shader can lay fibres along it, creases
 * across it, light it as a tube and glow from its core; and the vertex stage swells it with the
 * world's breath (a ripple that travels along every root toward its tip).
 *
 * Kinds: 0 root (fibres, few creases), 1 tissue (deep folds, fleshy), 2 pod membrane (translucent,
 * veined, a sheen at the rim), 3 bark (dark, no inner light: the forest's wood), 4 stalk (thin,
 * smooth, pale).
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Rectangle, Shader, UniformGroup } from 'pixi.js';
import { NOISE_GLSL } from './plane';

export type Pt = [number, number];

const FLOATS = 15;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
in vec2 aOff;
in vec3 aUV;
in vec4 aCol;
in vec4 aPar;
out vec3 vUV;
out vec4 vCol;
out vec4 vPar;
out float vWave;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uT;    // time, breath, swell, ripple speed (rad/s)
void main() {
  float wave = 0.5 + 0.5 * sin(uT.x * uT.w - aUV.x * 0.007 + aPar.y * 6.283);
  float sw = 1.0 + uT.z * (0.65 * uT.y + 0.35 * wave);
  // The forest's wood does not breathe.
  if (aPar.z > 2.5 && aPar.z < 3.5) sw = 1.0;
  vec2 p = aPos + aOff * sw;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(p, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vCol = aCol;
  vPar = vec4(aPar.xyz, aPar.w * sw);
  vWave = wave;
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 vUV;
in vec4 vCol;
in vec4 vPar;
in float vWave;
out vec4 finalColor;
uniform vec4 uT;
uniform vec4 uGlow;   // inner light colour, strength
uniform vec4 uRim;    // rim colour, strength
uniform vec4 uSss;    // subsurface colour, strength
${NOISE_GLSL}
void main() {
  float v = vUV.y;
  float ax = abs(v);
  float cyl = sqrt(max(0.0, 1.0 - v * v));
  float hw = max(vPar.w, 0.5);
  // Pattern scale: big strips get more detail, not magnified detail (no wood grain on a giant).
  float hs = min(hw, 22.0);
  float u = vUV.x;
  float seed = vPar.y;
  float kind = vPar.z;
  float lsgn = sign(vUV.z + 1e-4);
  // Facing the light: +1 on the lit edge, -1 on the far edge. Painted as two big values (a lit
  // plane and a shadow plane) with a soft, broken terminator, not a smooth CG cylinder.
  float facing = v * vUV.z;
  float tn = fbm3(vec2(u / (hs * 2.2 + 9.0), v * 1.3 + seed * 17.0)) - 0.5;
  float lit = smoothstep(-0.32, 0.42, facing + 0.22 * cyl + tn * 0.55);
  vec3 base = vCol.rgb;
  float a = vCol.a;
  float g = vPar.x * uGlow.a * (0.5 + 0.5 * vWave) * (0.55 + 0.45 * uT.y);
  float core = cyl * cyl * cyl;
  // Thin flesh lets light through: warm where the strip is narrow, and along its outline.
  float thin = 1.0 - smoothstep(2.0, 16.0, hw);
  float edgeT = smoothstep(0.62, 1.0, ax);
  vec3 cool = vec3(0.74, 0.8, 1.1);
  vec3 c;
  // Creases: ridged noise, warped along the strip and bent round it (they wrap the form).
  float warp = fbm3(vec2(u / (hs * 4.0 + 24.0), seed * 9.0)) * 2.4;
  float wrapU = u / (hs * 1.15 + 5.0) + warp + v * v * 0.45 * lsgn;
  float r1 = 1.0 - abs(vnoise(vec2(wrapU, seed * 5.0 + v * 0.55)) * 2.0 - 1.0);
  float r2 = 1.0 - abs(vnoise(vec2(wrapU * 2.3 + 3.1, seed * 11.0 + v * 1.4)) * 2.0 - 1.0);
  float spk = vnoise(vec2(u / (hs * 0.6 + 2.5), v * 3.2 + seed * 21.0));
  if (kind < 0.5) {
    // Root: long fibres along it, a few creases, warm at the core.
    float streak = fbm3(vec2(u / (hs * 6.0 + 30.0), v * 2.2 + seed * 13.0));
    float fine = vnoise(vec2(u / (hs * 1.4 + 4.0), v * 8.0 + seed * 7.0));
    float cr = smoothstep(0.86, 0.98, r1) * (0.4 + 0.6 * cyl);
    vec3 sh = base * 0.36 * cool;
    c = mix(sh, base, lit);
    c *= 0.8 + 0.36 * streak - 0.08 * fine;
    c *= 1.0 - 0.14 * cr;
    c *= mix(1.0, 0.72, edgeT * (1.0 - lit));
    c += uGlow.rgb * g * core * (0.4 + 0.6 * streak);
    float sheen = smoothstep(0.84, 0.97, spk) * smoothstep(0.3, 0.85, facing) * (1.0 - cr);
    c += vec3(0.92, 0.94, 1.0) * sheen * 0.16;
  } else if (kind < 1.5) {
    // Tissue: soft lobes folded against each other; dark irregular creases, lit bulges between.
    float cr = smoothstep(0.74, 0.97, r1) * 0.7 + 0.3 * smoothstep(0.86, 0.99, r2);
    float bulge = smoothstep(0.15, 0.6, 1.0 - r1);
    vec3 sh = base * 0.34 * cool;
    c = mix(sh, base * 1.04, lit);
    c *= 1.0 - 0.36 * cr * (0.45 + 0.55 * cyl);
    c += base * 0.16 * bulge * lit;
    c *= mix(1.0, 0.66, edgeT * (1.0 - lit));
    c += uGlow.rgb * g * core * (0.35 + 0.65 * (1.0 - cr));
    float sheen = smoothstep(0.86, 0.98, spk) * smoothstep(0.35, 0.9, facing) * bulge;
    c += vec3(0.95, 0.94, 1.0) * sheen * 0.2;
  } else if (kind < 2.5) {
    // Pod membrane: thin and lit from within; veins; thicker (more opaque) toward the rim.
    float vein = abs(sin(v * 5.5 * max(1.0, hw / 30.0) + fbm3(vec2(u / (hs * 1.8), seed * 3.0)) * 4.0));
    float veinK = smoothstep(0.93, 1.0, vein) * (1.0 - ax * 0.5);
    c = mix(base * 0.5 * cool, base, 0.35 + 0.65 * lit);
    c += uGlow.rgb * g * (0.45 + 0.55 * core) * 1.3;
    c *= 1.0 - 0.3 * veinK;
    c += uRim.rgb * uRim.a * smoothstep(0.72, 0.97, ax);
    float sheen = smoothstep(0.8, 0.95, spk) * smoothstep(0.4, 0.9, facing);
    c += vec3(1.0) * sheen * 0.12;
    a *= 0.42 + 0.58 * pow(ax, 2.2);
  } else if (kind < 3.5) {
    // Bark: dark wood with deep fissures along the grain; no light of its own.
    float grain = vnoise(vec2(u / (hs * 4.0 + 20.0), v * 3.2 + seed * 5.0));
    float fis = smoothstep(0.62, 0.8, vnoise(vec2(u / (hs * 2.2 + 8.0), v * 4.5 + seed * 11.0)));
    c = mix(base * 0.45 * cool, base * 1.1, lit);
    c *= 0.82 + 0.3 * grain;
    c *= 1.0 - 0.45 * fis;
    c *= mix(1.0, 0.7, edgeT * (1.0 - lit));
  } else {
    // Stalk: smooth, pale, a fine line of light down its middle.
    c = mix(base * 0.45 * cool, base, lit);
    c += uGlow.rgb * g * core * 0.8;
  }
  // Light through thin flesh (not wood).
  float flesh = 1.0 - step(2.5, kind) * step(kind, 3.5);
  c += uSss.rgb * uSss.a * flesh * (thin * 0.55 + edgeT * 0.45 * (1.0 - lit * 0.6)) * (0.6 + 0.4 * uT.y);
  // The rim: a thin line of the key light on the lit edge; a faint cold bounce on the other.
  float rimLit = smoothstep(0.72, 0.98, v * lsgn) * max(0.0, abs(vUV.z));
  float rimBack = smoothstep(0.8, 1.0, -v * lsgn);
  c += uRim.rgb * uRim.a * (0.5 * rimLit + 0.1 * rimBack) * step(kind, 3.5);
  // A painted edge: soft, and a little broken.
  float en = vnoise(vec2(u / 5.0, seed * 31.0));
  float edge = smoothstep(1.0, 1.0 - (1.4 + 1.6 * en) / hw, ax);
  a *= edge;
  finalColor = vec4(max(c, 0.0) * a, a);
}`;

export interface StripStyle {
  /** Base colour 0xRRGGBB. */
  color: number;
  alpha?: number;
  /** Inner light 0..1. */
  glow?: number;
  kind?: number;
  seed?: number;
}

export interface BatchStyle {
  glow: number;
  glowK: number;
  rim?: number;
  rimK?: number;
  /** How far roots swell with the breath (fraction of their width). */
  swell?: number;
  /** Light direction in screen space (unit, y down), toward the light. */
  light?: Pt;
  /** Light through thin flesh: colour and strength (default: the glow colour, 0.12). */
  sss?: number;
  sssK?: number;
}

/** One mesh of strips. Build it with `strip` / helpers, then `done()` once. */
export class TissueBatch {
  readonly mesh: Mesh<Geometry, Shader>;
  private v: number[] = [];
  private i: number[] = [];
  private readonly u: { uT: Float32Array; uGlow: Float32Array; uRim: Float32Array; uSss: Float32Array };
  private readonly vbuf: Buffer;
  private readonly ibuf: Buffer;
  private readonly lx: number;
  private readonly ly: number;

  constructor(name: string, style: BatchStyle) {
    const rgb = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
    const group = new UniformGroup({
      uT: { value: new Float32Array([0, 0, style.swell ?? 0.05, 0.9817]), type: 'vec4<f32>' },
      uGlow: { value: new Float32Array([...rgb(style.glow), style.glowK]), type: 'vec4<f32>' },
      uRim: { value: new Float32Array([...rgb(style.rim ?? 0xffffff), style.rimK ?? 0]), type: 'vec4<f32>' },
      uSss: {
        value: new Float32Array([...rgb(style.sss ?? style.glow), style.sssK ?? 0.12]),
        type: 'vec4<f32>',
      },
    });
    this.u = group.uniforms as unknown as TissueBatch['u'];
    const l = style.light ?? [0.35, -0.94];
    const ll = Math.hypot(l[0], l[1]) || 1;
    this.lx = l[0] / ll;
    this.ly = l[1] / ll;
    this.vbuf = new Buffer({
      data: new Float32Array(FLOATS * 4),
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
    });
    this.ibuf = new Buffer({ data: new Uint32Array(6), usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    const stride = FLOATS * 4;
    const geometry = new Geometry({
      attributes: {
        aPos: { buffer: this.vbuf, format: 'float32x2', stride, offset: 0 },
        aOff: { buffer: this.vbuf, format: 'float32x2', stride, offset: 8 },
        aUV: { buffer: this.vbuf, format: 'float32x3', stride, offset: 16 },
        aCol: { buffer: this.vbuf, format: 'float32x4', stride, offset: 28 },
        aPar: { buffer: this.vbuf, format: 'float32x4', stride, offset: 44 },
      },
      indexBuffer: this.ibuf,
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'wc-tissue' }),
      resources: { tissue: group },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = name;
    this.mesh.boundsArea = new Rectangle(-4000, -4000, 8000, 8000);
  }

  /**
   * A strip along `pts` with half-width `hw[i]` at each point (or a function of 0..1 along it).
   * `u0` offsets the length coordinate (so a branch continues its parent's pattern).
   */
  strip(pts: readonly Pt[], hw: readonly number[] | ((t: number) => number), s: StripStyle, u0 = 0): void {
    const n = pts.length;
    if (n < 2) return;
    const col = s.color;
    const r = ((col >> 16) & 255) / 255;
    const g = ((col >> 8) & 255) / 255;
    const b = (col & 255) / 255;
    const a = s.alpha ?? 1;
    const glow = s.glow ?? 0;
    const kind = s.kind ?? 0;
    const seed = s.seed ?? 0;
    const base = this.v.length / FLOATS;
    let len = u0;
    for (let k = 0; k < n; k++) {
      const p = pts[k]!;
      const p0 = pts[Math.max(0, k - 1)]!;
      const p1 = pts[Math.min(n - 1, k + 1)]!;
      let tx = p1[0] - p0[0];
      let ty = p1[1] - p0[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      if (k > 0) len += Math.hypot(p[0] - pts[k - 1]![0], p[1] - pts[k - 1]![1]);
      const w = typeof hw === 'function' ? hw(k / (n - 1)) : (hw[k] ?? hw[hw.length - 1] ?? 1);
      const nl = nx * this.lx + ny * this.ly;
      for (const side of [1, -1]) {
        this.v.push(p[0], p[1], nx * w * side, ny * w * side, len, side, nl, r, g, b, a, glow, seed, kind, w);
      }
      if (k < n - 1) {
        const q = base + k * 2;
        this.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }

  done(): this {
    const vd = new Float32Array(this.v);
    const id = new Uint32Array(this.i);
    this.vbuf.data = vd;
    this.ibuf.data = id;
    this.v = [];
    this.i = [];
    return this;
  }

  tick(t: number, breathK: number): void {
    this.u.uT[0] = t;
    this.u.uT[1] = breathK;
  }
}

// ------------------------------------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------------------------------------

/** Catmull-Rom through the control points, `per` samples per segment. */
export function smoothPath(ctrl: readonly Pt[], per = 8): Pt[] {
  const out: Pt[] = [];
  const n = ctrl.length;
  if (n < 2) return ctrl.slice() as Pt[];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(n - 1, i + 2)]!;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([ctrl[n - 1]![0], ctrl[n - 1]![1]]);
  return out;
}

export interface WanderSpec {
  x: number;
  y: number;
  /** Heading in radians (0 = +x, PI/2 = down). */
  ang: number;
  len: number;
  step?: number;
  /** Heading noise per step (radians). */
  curl?: number;
  /** Pull of the heading toward straight down (gravity) per step, 0..1. */
  droop?: number;
  /** Pull toward a target heading (`towardAng`) per step. */
  toward?: number;
  towardAng?: number;
}

/** A root that grows by itself: a random walk with a heading that wanders smoothly. */
export function wander(rng: () => number, s: WanderSpec): Pt[] {
  const step = s.step ?? 8;
  const n = Math.max(2, Math.round(s.len / step));
  const pts: Pt[] = [[s.x, s.y]];
  let x = s.x;
  let y = s.y;
  let a = s.ang;
  let da = 0;
  for (let i = 1; i <= n; i++) {
    da = da * 0.8 + (rng() - 0.5) * (s.curl ?? 0.12);
    a += da;
    if (s.droop) a += angDiff(a, Math.PI / 2) * s.droop;
    if (s.toward && s.towardAng !== undefined) a += angDiff(a, s.towardAng) * s.toward;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Root taper: thick at the base, a long thin tail; `bulge` adds a slow swelling along it. */
export function taper(w0: number, w1: number, bulge = 0, seed = 0): (t: number) => number {
  return (t) => {
    const k = (1 - t) ** 0.85;
    // Thickness wanders a lot: slow swells, knots, pinches; never a clean cone.
    const b =
      1 +
      bulge *
        (0.6 * Math.sin(t * 9 + seed * 6.28) +
          0.4 * Math.sin(t * 23 + seed * 17.1) * Math.sin(t * 5 + seed * 3)) *
        (1 - t * 0.7);
    return Math.max(0.4, (w1 + (w0 - w1) * k) * b * (t > 0.97 ? (1 - t) / 0.03 : 1) + 0.4);
  };
}

export interface BranchSpec extends WanderSpec {
  w0: number;
  w1?: number;
  style: StripStyle;
  /** Child roots per parent and how deep. */
  kids?: number;
  depth?: number;
  bulge?: number;
}

/** A root with branches that split off and wander on their own; returns the trunk path. */
export function branchRoot(batch: TissueBatch, rng: () => number, s: BranchSpec): Pt[] {
  const pts = wander(rng, s);
  const w1 = s.w1 ?? 0.6;
  const tp = taper(s.w0, w1, s.bulge ?? 0.12, rng());
  batch.strip(pts, tp, { ...s.style, seed: s.style.seed ?? rng() });
  const depth = s.depth ?? 0;
  if (depth <= 0) return pts;
  const kids = s.kids ?? 2;
  for (let k = 0; k < kids; k++) {
    const t = 0.18 + rng() * 0.6;
    const idx = Math.floor(t * (pts.length - 1));
    const p = pts[idx]!;
    const q = pts[Math.min(pts.length - 1, idx + 1)]!;
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.7);
    branchRoot(batch, rng, {
      ...s,
      x: p[0],
      y: p[1],
      ang,
      len: s.len * (0.35 + rng() * 0.35),
      w0: tp(t) * 0.62,
      w1: w1 * 0.7,
      depth: depth - 1,
      kids: Math.max(1, kids - 1),
      style: { ...s.style, seed: rng() },
    });
  }
  return pts;
}

/**
 * A root that winds round a vertical post (x = cx) from yTop down to yBot. Returns the parts in
 * front of the post and behind it, so the caller can draw the back ones before the post.
 */
export function helix(
  cx: number,
  yTop: number,
  yBot: number,
  radius: number,
  turns: number,
  phase: number,
): { front: Pt[][]; back: Pt[][] } {
  const n = Math.max(8, Math.round(turns * 28));
  const front: Pt[][] = [];
  const back: Pt[][] = [];
  let cur: Pt[] = [];
  let curFront: boolean | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = phase + t * turns * Math.PI * 2;
    const p: Pt = [cx + Math.sin(th) * radius, yTop + (yBot - yTop) * t + Math.cos(th) * radius * 0.18];
    const isFront = Math.cos(th) > 0;
    if (curFront === null) curFront = isFront;
    if (isFront !== curFront) {
      cur.push(p);
      (curFront ? front : back).push(cur);
      cur = [cur[cur.length - 2] ?? p, p];
      curFront = isFront;
    } else cur.push(p);
  }
  if (cur.length > 1) (curFront ? front : back).push(cur);
  return { front, back };
}
