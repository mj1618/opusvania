/**
 * One mesh for every glint and every bit of light they throw off: quads with a kind, drawn by one
 * fragment shader. The CPU refills the vertex buffer each frame with what is on screen (a few
 * dozen quads), so there is one draw call and no per-frame allocation.
 *
 * Output is premultiplied: light is added (alpha 0), and a glint's small amber body is laid over
 * what is behind it (alpha > 0), which is what keeps a gold light readable against the pale fog of
 * the light well as well as against the dark stands.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Rectangle, Shader } from 'pixi.js';

/** Quad kinds (aData.x). */
export const K_GLINT = 0;
export const K_GREAT = 1;
export const K_SPARK = 2;
export const K_RIBBON = 4;
export const K_FLARE = 5;
export const K_CHIP = 6;
/** A sleeping glint: a small cut star, cool and pale in a dark seat (energy = presence, phase = twinkle 0..1, extra = warmth 0 cold .. 1 gold). */
export const K_STAR = 7;
/**
 * The ember (the summit lantern's key): a squat coal, dark crust over a red heart, light in its
 * cracks. energy = presence, phase = its own clock offset, extra = heat: 1 alive and breathing,
 * 0 a cold hollow of the same shape (the socket that waits for it).
 */
export const K_COAL = 8;

const FLOATS = 8;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aUv;
in vec4 aData;
out vec2 vUv;
out vec4 vData;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aUv;
  vData = aData;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vData;   // kind, energy, phase, extra (glint: dormancy 0..1)
out vec4 o;
uniform vec4 uGlint;  // clock, glint quad half-size px, great quad half-size px, gain

const vec3 HOT = vec3(1.0, 0.96, 0.84);
const vec3 GOLD = vec3(1.0, 0.68, 0.24);
const vec3 AMBER = vec3(1.0, 0.44, 0.09);
const vec3 DEEP = vec3(0.42, 0.15, 0.02);
const vec3 UMBER = vec3(0.16, 0.06, 0.015);

float gauss(float d, float s) { return exp(-(d * d) / (s * s)); }

// One arm pair of a star: along x, length L px, width w px at the centre, tapering to a point.
float arm(vec2 p, float L, float w) {
  float along = max(0.0, 1.0 - abs(p.x) / L);
  return along * along * exp(-abs(p.y) / (w * (0.25 + 0.75 * along)));
}

// A drop of light: p in px from its centre, R = bead radius, e = energy, ph = phase 0..1.
// Returns added light in rgb and the body's coverage in a (body colour comes back in 'body').
vec3 bead(vec2 p, float R, float e, float t, float ph, out vec3 body, out float a) {
  float d = length(p);
  float pulse = 0.5 + 0.5 * sin(t * 2.0 + ph * 6.283);
  float k = mix(0.8, 1.0, pulse) * e;
  // The body: an amber droplet, darker toward its lower rim, with a pocket of shade round it.
  float disc = smoothstep(R + 0.9, R - 0.9, d);
  float shade = 0.44 * gauss(d, R * 3.0) * min(e, 1.0);
  a = max(disc * 0.55, shade) * min(e, 1.0);
  body = mix(UMBER, mix(DEEP, AMBER * 0.75, clamp(0.5 - p.y / (R * 2.0), 0.0, 1.0)), disc);
  vec3 add = vec3(0.0);
  // Refracted rim: brighter along the lower edge, where a drop gathers light.
  float rim = smoothstep(R * 0.45, R, d) * disc * (0.55 + 0.45 * clamp(p.y / R, -1.0, 1.0));
  add += AMBER * rim * 0.3 * k;
  // The spark held inside.
  add += HOT * gauss(d, R * 0.4) * 1.45 * k;
  add += GOLD * gauss(d, R * 0.95) * 0.3 * k;
  // Specular on the upper left.
  add += vec3(1.0, 0.98, 0.92) * gauss(length(p - vec2(-0.34, -0.38) * R), R * 0.17) * 0.55 * min(e, 1.2);
  return add;
}

void main() {
  float kind = floor(vData.x + 0.5);
  float e = vData.y;
  float ph = vData.z;
  float ex = vData.w;
  float t = uGlint.x;
  float r = length(vUv);
  vec3 add = vec3(0.0);
  vec3 body = vec3(0.0);
  float a = 0.0;

  if (kind < 0.5) {
    // --- Glint.
    float H = uGlint.y;
    vec2 p = vUv * H;
    float d = r * H;
    float win = clamp(1.0 - r, 0.0, 1.0);
    add = bead(p, 4.6, e, t, ph, body, a);
    float pulse = 0.5 + 0.5 * sin(t * 2.0 + ph * 6.283);
    // Halo: small, so that it stays a point of light after the bloom.
    add += AMBER * exp(-d / 7.0) * 0.13 * e * win * win * mix(0.8, 1.0, pulse);
    // The glint itself: a four-point star, tall and narrow, breathing with the pulse and
    // stretching while it is excited. This is the silhouette that says "not a firefly". Every few
    // seconds it catches the light: the arms flash longer and whiter and a short diagonal pair shows.
    float flash = pow(max(0.0, sin(t * 1.7 + ph * 37.0)), 28.0);
    float tw = (0.84 + 0.16 * sin(t * 3.1 + ph * 17.0)) * (0.75 + 0.3 * e) * mix(0.92, 1.05, pulse);
    tw *= 1.0 + 0.55 * flash;
    float st = arm(p.yx, 19.0 * tw, 1.05) + arm(p, 12.0 * tw, 0.95) * 0.85;
    vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    st += (arm(q, 7.0 * tw, 0.8) + arm(q.yx, 7.0 * tw, 0.8)) * (0.12 + 0.5 * flash);
    add += mix(GOLD, HOT, clamp(st * 1.3 + flash * 0.6, 0.0, 1.0)) * st * (1.15 + 0.6 * flash) * e;
    // Two motes: one circling on a tilted orbit (dimmer behind), one rising and fading.
    float a1 = t * (1.1 + ph * 0.5) + ph * 40.0;
    vec2 m1 = vec2(cos(a1) * 12.0, sin(a1) * 5.0 - cos(a1) * 2.5);
    add += GOLD * gauss(length(p - m1), 1.1) * (0.36 + 0.26 * sin(a1)) * min(e, 1.3);
    float c2 = fract(t * 0.34 + ph * 3.7);
    vec2 m2 = vec2(sin(c2 * 9.0 + ph * 30.0) * 3.0 + (ph - 0.5) * 8.0, 5.0 - c2 * 24.0);
    add += HOT * gauss(length(p - m2), 1.0) * sin(c2 * 3.1416) * 0.4 * min(e, 1.3);
    // ex = how dormant it is (0 awake .. 1): a soft knee takes the white heat out of its heart, so
    // far from her it is a dim gold mote and not a point of pure white.
    float peak = max(add.r, max(add.g, add.b));
    add /= 1.0 + ex * 5.0 * peak;
  } else if (kind < 1.5) {
    // --- Great glint. ex = how far its ceremony has opened it (0 resting .. 1).
    float H = uGlint.z;
    vec2 p = vUv * H;
    float d = r * H;
    float win = clamp(1.0 - r, 0.0, 1.0);
    float ang = atan(p.y, p.x);
    add = bead(p, 8.4, e, t, ph, body, a);
    float pulse = 0.5 + 0.5 * sin(t * 1.5 + ph * 6.283);
    add += AMBER * exp(-d / 13.0) * 0.16 * e * win * win * mix(0.82, 1.0, pulse);
    // A corolla of light: five soft petals turning slowly, unfolding as the ceremony opens it.
    float L = mix(24.0, 46.0, ex) * mix(0.93, 1.0, pulse);
    float pet = pow(abs(cos(2.5 * (ang + t * 0.17))), 4.0);
    float len = smoothstep(L, L * 0.2, d) * smoothstep(5.0, 11.0, d);
    add += GOLD * pet * len * (0.15 + 0.1 * ex) * e;
    // The same star as the small ones, larger and slower.
    float flash = pow(max(0.0, sin(t * 1.3 + ph * 37.0)), 22.0);
    float tw = (0.86 + 0.14 * sin(t * 2.3 + ph * 11.0)) * (0.8 + 0.25 * e) * (1.0 + 0.4 * flash);
    float st = arm(p.yx, 30.0 * tw, 1.3) + arm(p, 19.0 * tw, 1.15) * 0.85;
    add += mix(GOLD, HOT, clamp(st * 1.6 + flash, 0.0, 1.0)) * st * (1.1 + 0.5 * flash) * e;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float a1 = t * (0.7 + fi * 0.23) + fi * 2.1 + ph * 9.0;
      float rr = 17.0 + fi * 6.0 + 22.0 * ex;
      vec2 m = vec2(cos(a1) * rr, sin(a1) * rr * 0.42 - cos(a1) * rr * 0.18);
      add += GOLD * gauss(length(p - m), 1.3) * (0.4 + 0.3 * sin(a1)) * min(e, 1.4);
    }
  } else if (kind < 2.5) {
    // --- Spark: ex = heat (1 fresh and white-hot, 0 a dying ember).
    vec3 c = mix(AMBER, HOT, clamp(ex, 0.0, 1.0));
    add = c * (gauss(r, 0.34) * 1.5 + gauss(r, 0.75) * 0.28) * e * clamp(1.0 - r, 0.0, 1.0);
  } else if (kind < 4.5) {
    // --- Ribbon: uv.x runs head (0) to tail (1), uv.y across.
    float across = 1.0 - vUv.y * vUv.y;
    float soft = across * sqrt(max(across, 0.0));
    float core = pow(max(across, 0.0), 7.0);
    add = (mix(GOLD, AMBER, smoothstep(0.0, 0.7, vUv.x)) * soft * 0.8 + HOT * core * 0.9 * (1.0 - vUv.x)) * e;
  } else if (kind > 7.5) {
    // --- The ember: a coal. Read by shape (a squat faceted lump, wider than tall: no star, no
    // drop, no bead) and by colour (red under the gold of everything else that glows).
    vec2 p = vUv / 0.6;
    float wob = 0.06 * sin(p.x * 4.3 + ph * 21.0) * sin(p.y * 3.7 + 1.3 + ph * 9.0);
    float s = pow(abs(p.x), 1.45) + pow(abs(p.y) / 0.76, 1.45) + wob;
    float aa = max(fwidth(s), 0.03);
    float lump = smoothstep(1.0 + aa, 1.0 - aa, s);
    float heat = clamp(ex, 0.0, 1.0);
    float k = clamp(e, 0.0, 1.0);
    float breath = 0.5 + 0.5 * sin(t * 1.7 + ph * 6.283);
    float glowK = heat * e * (0.72 + 0.28 * breath);
    // Cracks: two crossing veins that wander, widest at the heart.
    float c1 = abs(p.y - 0.16 * sin(p.x * 2.6 + ph * 12.0) + 0.05);
    float c2 = abs(p.x * 0.8 + p.y * 0.9 - 0.12 * sin(p.y * 4.0 + ph * 5.0));
    float crack = max(smoothstep(0.13, 0.0, c1), smoothstep(0.1, 0.0, c2) * 0.8) * smoothstep(1.0, 0.45, s);
    float heartG = gauss(length(p - vec2(0.04, 0.1)), 0.52);
    vec3 RED = vec3(1.0, 0.27, 0.04);
    vec3 crust = mix(vec3(0.09, 0.028, 0.02), vec3(0.42, 0.1, 0.02), heartG * heat);
    // Cold: the same lump as a hollow, a pale rim round a dark well.
    float rim = smoothstep(0.5, 0.9, s) * lump;
    vec3 hollow = mix(vec3(0.015, 0.03, 0.06), vec3(0.5, 0.7, 0.86), rim * 0.85);
    float seat = 0.5 * gauss(r, 0.62) * clamp(1.5 - 1.5 * r, 0.0, 1.0);
    a = max(lump * 0.97, seat) * k;
    body = mix(vec3(0.02, 0.012, 0.02), mix(hollow, crust, heat), lump);
    vec2 hp = p - vec2(0.04, 0.1);
    add = (mix(RED, GOLD, 0.35 + 0.5 * crack) * crack * 1.5 + mix(RED, GOLD, 0.3) * heartG * 0.85
      + HOT * gauss(length(hp), 0.24) * (0.7 + 0.5 * breath)) * lump * glowK;
    // Its glow: red-gold, tight, lying a little under it (a coal lights what it sits in).
    add += mix(RED, GOLD, 0.25) * gauss(length(vUv - vec2(0.0, 0.06)), 0.55) * 0.34 * glowK * clamp(1.0 - r, 0.0, 1.0);
  } else if (kind > 6.5) {
    // --- Sleeping glint. Found by shape and by temperature, not by brightness: a tall four-point star
    // with hollow flanks, pale and cool (every mote in the air is a warm round dot), cut out of a dark
    // seat so that it stands as clearly against the amber light well as against the canopy, with a
    // dark pip at its heart (a mote is brightest there). ph = its twinkle: it swells, whitens and
    // throws four fine rays for a moment. ex warms it to gold as she comes near.
    float tw = clamp(ph, 0.0, 1.0);
    vec2 q = abs(vUv) / (1.0 + 0.3 * tw);
    float s = pow(q.x / 0.37, 0.6) + pow(q.y / 0.6, 0.6);
    float aa = max(fwidth(s), 0.02);
    float star = smoothstep(1.0 + aa, 1.0 - aa, s);
    float seat = smoothstep(1.62, 1.08, s) * 0.72 + 0.3 * gauss(r, 0.55);
    float pip = smoothstep(0.34 + aa, 0.34 - aa, s) * (1.0 - tw);
    float win = smoothstep(1.0, 0.8, r);
    vec3 cool = mix(vec3(0.56, 0.8, 0.93), vec3(0.84, 0.96, 1.0), tw);
    vec3 warm = mix(vec3(0.95, 0.66, 0.26), vec3(1.0, 0.9, 0.66), tw);
    vec3 fill = mix(cool, warm, clamp(ex, 0.0, 1.0)) * (0.82 + 0.18 * (1.0 - q.y / 0.6));
    vec3 dark = vec3(0.02, 0.035, 0.08);
    float k = clamp(e, 0.0, 1.0);
    a = max(star, min(seat, 0.8)) * k * win;
    body = mix(dark, mix(fill, dark, pip * 0.8), star);
    // The twinkle's rays: fine, short, added.
    vec2 pp = vUv * 20.0;
    float rays = arm(pp.yx, 19.0, 0.7) + arm(pp, 12.0, 0.6) * 0.8;
    add = mix(vec3(0.62, 0.86, 1.0), GOLD, clamp(ex, 0.0, 1.0)) * rays * tw * 0.5 * k * win;
  } else if (kind > 5.5) {
    // --- Chip: a fleck of husk, opaque (laid over, not added). ph = its tone between the zones'
    // cool and warm leaf colours, e = how much is left of it.
    float m = max(abs(vUv.x) * 0.8 + abs(vUv.y) * 0.5, abs(vUv.y));
    a = smoothstep(1.0, 0.72, m) * clamp(e, 0.0, 1.0);
    body = mix(vec3(0.03, 0.11, 0.12), vec3(0.11, 0.13, 0.05), ph) * (0.8 + 0.5 * vUv.y);
    add = vec3(1.0, 0.62, 0.22) * smoothstep(0.2, -0.9, vUv.y) * 0.12 * a * ex;
  } else {
    // --- Flare: a soft bloom of light, ex = how white its heart is.
    float win = clamp(1.0 - r, 0.0, 1.0);
    add = (GOLD * gauss(r, 0.52) * 0.8 + HOT * gauss(r, 0.2) * ex) * e * win;
  }
  add *= uGlint.w;
  o = vec4(add + body * a, a);
}`;

export class GlintBatch {
  readonly mesh: Mesh<Geometry, Shader>;
  /** clock, glint quad half-size, great quad half-size, gain. */
  readonly uniform = new Float32Array([0, 46, 128, 1]);
  private readonly verts: Float32Array;
  private readonly vbuf: Buffer;
  private n = 0;
  private last = 0;
  private high = 1;

  constructor(readonly maxQuads: number) {
    this.verts = new Float32Array(maxQuads * 4 * FLOATS);
    const indices = new Uint16Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.vbuf = new Buffer({ data: this.verts, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const stride = FLOATS * 4;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.vbuf, format: 'float32x2', stride, offset: 0 },
        aUv: { buffer: this.vbuf, format: 'float32x2', stride, offset: 8 },
        aData: { buffer: this.vbuf, format: 'float32x4', stride, offset: 16 },
      },
      indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST }),
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'glints' }),
      resources: { glint: { uGlint: { value: this.uniform, type: 'vec4<f32>' } } },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = 'glints';
    // Bounds would otherwise be scanned from the whole vertex buffer; nothing here is hit-tested.
    this.mesh.boundsArea = new Rectangle(-1e6, -1e6, 2e6, 2e6);
  }

  begin(): void {
    this.n = 0;
  }

  get count(): number {
    return this.n;
  }

  /** An axis-aligned quad of half-size (hw, hh) centred on (x, y). */
  quad(kind: number, x: number, y: number, hw: number, hh: number, e: number, ph: number, ex: number): void {
    if (this.n >= this.maxQuads || e <= 0.001) return;
    const v = this.verts;
    let o = this.n++ * 4 * FLOATS;
    o = put(v, o, x - hw, y - hh, -1, -1, kind, e, ph, ex);
    o = put(v, o, x + hw, y - hh, 1, -1, kind, e, ph, ex);
    o = put(v, o, x + hw, y + hh, 1, 1, kind, e, ph, ex);
    put(v, o, x - hw, y + hh, -1, 1, kind, e, ph, ex);
  }

  /** A quad of half-size (hw, hh) turned by `rot` radians about its centre (x, y). */
  quadRot(
    kind: number,
    x: number,
    y: number,
    hw: number,
    hh: number,
    rot: number,
    e: number,
    ph: number,
    ex: number,
  ): void {
    if (this.n >= this.maxQuads || e <= 0.001) return;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const ux = c * hw;
    const uy = s * hw;
    const vx = -s * hh;
    const vy = c * hh;
    const v = this.verts;
    let o = this.n++ * 4 * FLOATS;
    o = put(v, o, x - ux - vx, y - uy - vy, -1, -1, kind, e, ph, ex);
    o = put(v, o, x + ux - vx, y + uy - vy, 1, -1, kind, e, ph, ex);
    o = put(v, o, x + ux + vx, y + uy + vy, 1, 1, kind, e, ph, ex);
    put(v, o, x - ux + vx, y - uy + vy, -1, 1, kind, e, ph, ex);
  }

  /**
   * One piece of a ribbon between two cross-sections: (ax, ay) and (bx, by) are centre points,
   * (anx, any) / (bnx, bny) their half-width offsets, u0..u1 the position along the ribbon,
   * e0 / e1 the brightness at each end.
   */
  segment(
    ax: number,
    ay: number,
    anx: number,
    any: number,
    bx: number,
    by: number,
    bnx: number,
    bny: number,
    u0: number,
    u1: number,
    e0: number,
    e1: number,
  ): void {
    if (this.n >= this.maxQuads) return;
    const v = this.verts;
    let o = this.n++ * 4 * FLOATS;
    o = put(v, o, ax - anx, ay - any, u0, -1, K_RIBBON, e0, 0, 0);
    o = put(v, o, bx - bnx, by - bny, u1, -1, K_RIBBON, e1, 0, 0);
    o = put(v, o, bx + bnx, by + bny, u1, 1, K_RIBBON, e1, 0, 0);
    put(v, o, ax + anx, ay + any, u0, 1, K_RIBBON, e0, 0, 0);
  }

  /** Uploads what was drawn since `begin`. */
  end(clock: number): void {
    const per = 4 * FLOATS;
    // Quads left over from a fuller frame collapse to nothing.
    if (this.last > this.n) this.verts.fill(0, this.n * per, this.last * per);
    this.last = this.n;
    // Always the fullest frame so far: the upload happens when the mesh is next drawn, and several
    // updates can pass before that (`__game.step(n)`), so a shrinking size would leave stale quads
    // on the GPU beyond it.
    this.high = Math.max(this.high, this.n, 1);
    this.vbuf.update(this.high * per * 4);
    this.uniform[0] = clock;
  }

  destroy(): void {
    this.mesh.destroy();
  }
}

function put(
  v: Float32Array,
  o: number,
  x: number,
  y: number,
  u: number,
  w: number,
  kind: number,
  e: number,
  ph: number,
  ex: number,
): number {
  v[o] = x;
  v[o + 1] = y;
  v[o + 2] = u;
  v[o + 3] = w;
  v[o + 4] = kind;
  v[o + 5] = e;
  v[o + 6] = ph;
  v[o + 7] = ex;
  return o + 8;
}
