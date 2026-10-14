/**
 * Shot 1, "The breath" (0-14 s). Black. Centre frame a soft pale light the size Umber's head will
 * be, breathing (in 2.5 s, out 2.5 s), a faint cloud of threads inside it. A huge out-of-focus warm
 * blur comes in from the left and rests against it (a palm, but we cannot tell); the light leans
 * toward it, warms a little and its breath slows. The warmth lifts away out of frame. The light
 * breathes on, then stutters: two flickers, a burst of grey grain, a breath that does not finish.
 * Hold. Black.
 *
 * One full-frame shader (the light, the threads, the palm, the static) under the world kit's post
 * (bloom, grade). Night 4 widens this exact frame into the lab, so the light is the dish's cloud
 * (`DISH` in world/bodies.ts) seen small.
 */
import type { Composer } from '../world/compose';
import { VIEW_H, VIEW_W } from '../world/layer';
import type { ShaderPlane } from '../world/plane';
import { BREATH } from './script';
import { envelope, integrate, window01 } from './track';

/**
 * uP0 light centre xy, radius px, intensity; uP1 lean (unit xy toward the warmth), lean amount px,
 * warmth taken 0..1; uP2 breath 0..1, unused, static over the frame, static at the light;
 * uP3 palm centre xy, scale px, opacity; uP4.x palm rotation, uP4.y frame number (static seed).
 */
const BODY = /* glsl */ `
float sdSeg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// A palm laid flat, fingers up, in units of its width (about 1), centre of the palm at 0.
float palm(vec2 q) {
  vec2 b = abs(q - vec2(0.0, 0.08)) - vec2(0.36, 0.42);
  float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.14;
  d = smin(d, sdSeg(q, vec2(-0.36, -0.36), vec2(-0.46, -0.92), 0.105), 0.08);
  d = smin(d, sdSeg(q, vec2(-0.12, -0.42), vec2(-0.14, -1.12), 0.11), 0.08);
  d = smin(d, sdSeg(q, vec2(0.12, -0.42), vec2(0.15, -1.08), 0.108), 0.08);
  d = smin(d, sdSeg(q, vec2(0.34, -0.34), vec2(0.44, -0.86), 0.095), 0.08);
  d = smin(d, sdSeg(q, vec2(0.42, 0.24), vec2(0.78, -0.12), 0.12), 0.1);
  return d;
}
vec4 paint() {
  vec2 p = vPx;
  float fr = uP[4].y;
  // Night: the faintest cold floor, never pure black.
  vec3 col = vec3(0.006, 0.008, 0.014) * (1.0 - 0.5 * smoothstep(300.0, 1100.0, length(p - vec2(960.0, 540.0))));

  // --- The warmth: a palm so out of focus it is only a warm blur with a few soft lobes.
  vec2 lc = uP[0].xy;
  if (uP[3].w > 0.001) {
    vec2 q = p - uP[3].xy;
    float cr = cos(uP[4].x), sr = sin(uP[4].x);
    q = vec2(cr * q.x + sr * q.y, -sr * q.x + cr * q.y) / uP[3].z;
    float d = palm(q) * uP[3].z;
    float blur = 0.3 * uP[3].z;
    float a = smoothstep(blur, -blur * 1.2, d) * uP[3].w;
    float inner = smoothstep(-blur * 3.5, blur * 0.5, d);
    // Skin lit from the pale light it rests on: a warm glow at the edge nearest it, dark within.
    float near = exp(-length(p - lc) / 300.0);
    vec3 warm = mix(vec3(0.07, 0.028, 0.014), vec3(0.2, 0.085, 0.035), inner);
    warm += vec3(0.62, 0.34, 0.15) * near * (0.35 + 0.65 * inner);
    warm *= 0.85 + 0.15 * fbm3(p / 260.0 + 3.0);
    col = mix(col, warm, a);
  }

  // --- The light. Leans toward the warmth; breathes.
  float b = uP[2].x;
  float r = uP[0].z * (1.0 + 0.07 * b);
  vec2 lean = uP[1].xy * uP[1].z;
  vec2 lp = p - lc - lean * 0.5;
  // Pulled a little toward the warmth: longer that way.
  float along = dot(lp, uP[1].xy);
  float stretch = 1.0 + uP[1].z / max(r, 1.0) * 0.6;
  vec2 lq = lp - uP[1].xy * along * (1.0 - 1.0 / stretch);
  float d = length(lq);
  float I = uP[0].w;
  vec3 pale = mix(vec3(0.85, 0.81, 0.77), vec3(1.0, 0.88, 0.74), uP[1].w * 0.3);
  // A soft body, a halo, a far haze.
  float body = smoothstep(r, r * 0.25, d);
  float halo = exp(-d / (r * 1.1)) * 0.5 + exp(-d / (r * 3.2)) * 0.16 + exp(-d / (r * 10.0)) * 0.05;
  // Threads inside it: the dish's cloud seen small.
  vec2 tq = lq / r;
  float t = uT.x;
  vec2 w = vec2(fbm3(tq * 1.4 + t * 0.05), fbm3(tq * 1.4 + 4.0 - t * 0.04)) - 0.5;
  float th = 1.0 - abs(vnoise((tq + w) * vec2(4.2, 6.5)) * 2.0 - 1.0);
  float th2 = 1.0 - abs(vnoise((tq - w * 0.8) * vec2(7.0, 10.0) + 3.0) * 2.0 - 1.0);
  th = pow(th, 6.0) + 0.55 * pow(th2, 8.0);
  float cloud = smoothstep(0.25, 0.8, fbm(tq * 1.9 + w * 1.3));
  float inside = body * (0.16 + 0.22 * cloud + 0.75 * th * (0.4 + cloud));
  col += pale * I * (0.3 + 0.7 * b) * (inside * 0.85 + halo * 0.7);

  // --- Static: grey grain, over the frame and clinging to the light.
  float g = hash12(floor(p / 2.0) + vec2(fr * 7.13, fr * 3.71)) - 0.5;
  float g2 = hash12(floor(p / 5.0) + vec2(fr * 1.7, 9.0)) - 0.5;
  float sAll = uP[2].z;
  float sNear = uP[2].w * exp(-d / (r * 4.0));
  float s = (g * 0.7 + g2 * 0.5) * (sAll + sNear);
  col += vec3(0.62, 0.62, 0.64) * max(s, -0.02) * 0.9;
  // Scan bands in the worst of it.
  col += vec3(0.4) * sAll * 0.25 * step(0.82, hash12(vec2(floor(p.y / 3.0), fr)));
  return vec4(max(col, 0.0), 1.0);
}`;

/** The light's breath 0..1 at `t`: 5 s, slowed while the warmth rests on it, then broken. */
export function breathAt(t: number): { b: number; k: number; grain: number; near: number } {
  const B = BREATH;
  const f = 1 / B.period;
  const s = 1 / B.slowPeriod;
  const [i0, i1] = B.touchIn;
  const [o0, o1] = B.touchOut;
  const phase = integrate(
    [
      [0, f],
      [i0 + 0.6, f],
      [i1 + 0.4, s],
      [o0 + 0.2, s],
      [o1, f],
    ],
    t,
  );
  // Starts out (dim) and breathes in first.
  let b = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
  let k = 1;
  let grain = 0;
  let near = 0.02;
  // Two flickers: four frames each, nearly out.
  for (const f0 of B.flickers) if (t >= f0 && t < f0 + 4 / 60) k = 0.12;
  // The burst of grey grain.
  const [g0, g1] = B.grain;
  if (t >= g0) {
    const burst = envelope(t, g0, g0 + 0.06, g1 - 0.2, g1);
    grain = 0.75 * burst;
    near = 0.02 + 1.4 * burst;
    k *= 1 - 0.55 * burst;
  }
  // The breath that does not finish: it starts to fill, then falls away at once, and the light stays low.
  const [r0, r1] = B.brokenBreath;
  if (t >= r0) {
    const rise = window01(t, r0, r1 - 0.25);
    const fall = window01(t, r1 - 0.25, r1 - 0.08);
    b = 0.12 + 0.5 * rise * (1 - fall);
    k *= 1 - 0.45 * window01(t, r1 - 0.25, r1 + 0.1);
    // After: a small irregular tremor and a little static that never quite stops.
    if (t > r1) {
      b = 0.1 + 0.06 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1);
      near = 0.12 + 0.1 * Math.max(0, Math.sin(t * 5.1) * Math.sin(t * 1.7));
    }
  }
  return { b, k, grain, near };
}

export function buildBreath(c: Composer): (t: number) => void {
  c.grade = {
    shadow: 0x05060c,
    shadowK: 0.01,
    deep: 0x000000,
    deepK: 0.85,
    saturation: 0.9,
    contrast: 1.05,
    grain: 0.022,
    vignette: 0.3,
    vignetteSoft: 0.55,
    bloom: [0.5, 0.75, 0.7],
  };
  const sh: ShaderPlane = c.shader('breath', 0, 0, VIEW_W, VIEW_H, BODY, c.root);
  const B = BREATH;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  return (t: number) => {
    const st = breathAt(t);
    const fade = window01(t, B.fadeIn[0], B.fadeIn[1]) * (1 - window01(t, B.fadeOut[0], B.fadeOut[1]));
    // The warmth: in from the left, resting against the light, lifted away up and out.
    const tin = window01(t, B.touchIn[0], B.touchIn[1]);
    const tout = window01(t, B.touchOut[0], B.touchOut[1]);
    const rest = { x: cx - 860, y: cy + 520 };
    const px = -900 + (rest.x + 900) * tin + -500 * tout;
    const py = rest.y + 140 * (1 - tin) - 1000 * tout;
    const touch = tin * (1 - tout);
    // A slow drift while it rests: a hand is never still.
    const dx = Math.sin(t * 0.7) * 6 * touch;
    const dy = Math.sin(t * 0.45 + 1) * 5 * touch;
    sh.p(3, px + dx, py + dy, 1500, 0.96 * Math.min(1, tin * 1.4) * (1 - tout * 0.6) * fade);
    sh.p(4, 0.22 - 0.25 * tout, Math.floor(t * 60));
    // Toward it: the light leans its way and warms.
    const lx = rest.x - cx;
    const ly = rest.y - 520 - cy;
    const ll = Math.hypot(lx, ly) || 1;
    sh.p(1, lx / ll, ly / ll, 7 * touch, touch);
    sh.p(0, cx, cy, 40, 0.95 * st.k * fade);
    sh.p(2, st.b, 0, st.grain * fade, st.near * fade);
  };
}
