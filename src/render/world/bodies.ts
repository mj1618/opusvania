/**
 * Fragment bodies for ShaderPlane (see plane.ts for what is in scope). Each documents its params.
 */

/**
 * Night sky over a horizon.
 *   uP0 top rgb, uP1 middle rgb, uP2 horizon rgb, uP3.x horizon y px, uP3.y star amount
 *   uP4 glow centre xy, radius, unused; uP5 wide glow rgb; uP6 core glow rgb; uP7 cloud-lit rgb, cloud amount
 */
export const SKY = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  float horY = uP[3].x;
  vec3 c = mix(uP[0].rgb, uP[1].rgb, smoothstep(0.0, horY * 0.75, p.y));
  c = mix(c, uP[2].rgb, smoothstep(horY - 380.0, horY + 40.0, p.y));
  vec2 g = uP[4].xy;
  float gr = uP[4].z;
  float d = length((p - g) * vec2(0.75, 1.35));
  float b = uT.y;
  c += uP[5].rgb * exp(-d / gr) * (0.86 + 0.14 * b);
  c += uP[6].rgb * exp(-d / (gr * 0.32)) * (0.8 + 0.2 * b);
  float n = fbm(vec2(p.x / 1100.0 + uT.x * 0.003, p.y / 120.0 + 3.0));
  float n2 = fbm3(vec2(p.x / 380.0 - uT.x * 0.002, p.y / 60.0));
  float band = smoothstep(0.42, 0.78, n * 0.75 + n2 * 0.25) * smoothstep(horY + 20.0, horY - 520.0, p.y);
  vec3 lit = uP[7].rgb * (0.35 + exp(-d / (gr * 1.2)));
  c = mix(c, c * 0.72 + lit * 0.16, band * uP[7].a);
  float s = hash12(floor(p / 2.0));
  float tw = 0.6 + 0.4 * sin(uT.x * 1.3 + s * 80.0);
  c += vec3(0.55, 0.58, 0.72) * step(0.9988, s) * smoothstep(horY - 120.0, 80.0, p.y) * uP[3].y * tw;
  return vec4(c, 1.0);
}`;

/**
 * The mountain of folded tissue: a union of soft lobes, folds that follow its contours, lit from a
 * core at its foot; swells with the breath. Lobes uP0..uP7 (cx, cy, rx, ry; rx 0 = unused),
 * uP8 core (x, y, light radius, swell), uP9 bone rgb, uP10 crease rgb, uP11 glow rgb, uP12 haze rgb + amount,
 * uP13.x horizon y below which it fades into the land, uP13.y edge softness, uP13.z fold scale
 */
export const MOUNTAIN = /* glsl */ `
float sdE(vec2 p, vec4 e) {
  vec2 q = (p - e.xy) / e.zw;
  return (length(q) - 1.0) * min(e.z, e.w);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float gyri(vec2 q) {
  float s = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    float n = 1.0 - abs(vnoise(q) * 2.0 - 1.0);
    s += a * n * n;
    q = q * 2.13 + vec2(3.1, 1.7);
    a *= 0.45;
  }
  return s;
}
float folds(vec2 ps, float d) {
  // Domain-warped ridges, stretched along the slope so they read as tissue folded down the mass.
  vec2 w = vec2(fbm3(ps * 0.0035), fbm3(ps * 0.0035 + 5.2)) - 0.5;
  vec2 q = ps * vec2(0.0105, 0.0062) * uP[13].z + w * 2.6 + vec2(0.0, d * 0.004);
  return gyri(q);
}
vec4 paint() {
  vec2 p = vPx;
  vec2 c0 = uP[8].xy;
  float sw = 1.0 + uP[8].w * uT.y;
  vec2 ps = c0 + (p - c0) / sw;
  vec2 wp = ps + (vec2(fbm3(ps * 0.004), fbm3(ps * 0.004 + 7.0)) - 0.5) * 60.0;
  float d = 1e5;
  for (int i = 0; i < 8; i++) {
    vec4 e = uP[i];
    if (e.z <= 0.0) continue;
    d = smin(d, sdE(wp, e), 80.0);
  }
  d += (fbm(ps * 0.02) - 0.5) * 10.0;
  float soft = uP[13].y;
  float a = smoothstep(soft, -soft, d);
  a *= smoothstep(uP[13].x + 70.0, uP[13].x - 20.0, p.y);
  if (a <= 0.001) return vec4(0.0);
  float r = folds(ps, d);
  float rx = folds(ps + vec2(2.0, 0.0), d);
  float ry = folds(ps + vec2(0.0, 2.0), d);
  vec3 n = normalize(vec3((r - rx) * 9.0, (r - ry) * 9.0, 1.0));
  // The moon from above; the core's light from inside, below.
  float moon = clamp(dot(n, normalize(vec3(0.2, -0.8, 0.55))), 0.0, 1.0);
  float dl = length((p - c0) * vec2(0.8, 1.0));
  float L = exp(-dl / uP[8].z) * (0.7 + 0.3 * uT.y);
  float ridge = smoothstep(0.25, 0.75, r);
  float crease = 1.0 - smoothstep(0.08, 0.35, r);
  vec3 col = uP[10].rgb;
  col = mix(col, uP[9].rgb, (0.12 + 0.55 * moon) * (0.35 + 0.65 * ridge));
  // Light leaks through the thin creases near the core.
  col += uP[11].rgb * L * (0.25 + 0.75 * crease) * 0.85;
  col += uP[11].rgb * L * L * 0.4;
  // Toward the edge it thins into the haze; deep inside it is darker.
  col = mix(col, uP[12].rgb, smoothstep(-70.0, 0.0, d) * 0.6);
  col = mix(col, uP[12].rgb, uP[12].a);
  return vec4(col * a, a);
}`;

/**
 * Fog sheet: drifting fbm in a vertical band.
 *   uP0 rgb, alpha; uP1 x scale, y scale, x drift px/s-ish, y drift; uP2 band (in from, in to, out from, out to) in y px;
 *   uP3 threshold lo, hi, breath response, floor (density everywhere in the band); uP4 x mask (from, to, fade) or 0;
 *   uP5 a light inside it (x, y, radius, strength) and uP6 its rgb: the fog takes its colour near it
 */
export const FOG = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  float t = uT.x;
  float n = fbm(vec2(p.x / uP[1].x + t * uP[1].z, p.y / uP[1].y + t * uP[1].w));
  float n2 = fbm3(vec2(p.x / (uP[1].x * 0.35) - t * uP[1].z * 1.6, p.y / (uP[1].y * 0.45) + 4.0));
  float band = smoothstep(uP[2].x, uP[2].y, p.y) * (1.0 - smoothstep(uP[2].z, uP[2].w, p.y));
  float d = (uP[3].w + (1.0 - uP[3].w) * smoothstep(uP[3].x, uP[3].y, n * 0.72 + n2 * 0.28)) * band;
  if (uP[4].z > 0.0) d *= smoothstep(uP[4].x - uP[4].z, uP[4].x, p.x) * (1.0 - smoothstep(uP[4].y, uP[4].y + uP[4].z, p.x));
  float a = d * uP[0].a * (1.0 + uP[3].z * (uT.y - 0.5));
  vec3 col = uP[0].rgb;
  if (uP[5].z > 0.0) {
    float l = exp(-length((p - uP[5].xy) * vec2(0.7, 1.4)) / uP[5].z) * uP[5].w * (0.8 + 0.2 * uT.y);
    col = mix(col, uP[6].rgb, clamp(l, 0.0, 1.0));
    a *= 1.0 + l;
  }
  return vec4(col * a, a);
}`;

/**
 * Steam rising off root: vertical wisps from a ground line, breathing.
 *   uP0 rgb, alpha; uP1 ground y, height px, rise px/s, column scale px; uP2 x from, x to, edge fade
 */
export const STEAM = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  float t = uT.x;
  float h = (uP[1].x - p.y) / uP[1].y;
  if (h < -0.1 || h > 1.0) return vec4(0.0);
  float cols = fbm3(vec2(p.x / uP[1].w, 1.7));
  float n = fbm(vec2(p.x / (uP[1].w * 0.5) + sin(p.y * 0.01 + t * 0.2) * 0.4, (p.y + t * uP[1].z) / 90.0));
  float d = smoothstep(0.45, 0.85, n * 0.7 + cols * 0.5) * smoothstep(-0.1, 0.15, h) * (1.0 - smoothstep(0.25, 1.0, h));
  d *= smoothstep(uP[2].x, uP[2].x + uP[2].z, p.x) * (1.0 - smoothstep(uP[2].y - uP[2].z, uP[2].y, p.x));
  float a = d * uP[0].a * (0.55 + 0.45 * uT.y);
  return vec4(uP[0].rgb * a, a);
}`;

/**
 * A soft light beam/cone, lit dust inside.
 *   uP0 rgb, alpha; uP1 apex x, apex y, half-angle (rad), length; uP2 dust amount, flicker
 */
export const BEAM = /* glsl */ `
vec4 paint() {
  vec2 p = vPx - uP[1].xy;
  float len = uP[1].w;
  float y = p.y;
  if (y <= 0.0) return vec4(0.0);
  float ang = abs(atan(p.x, y));
  float edge = 1.0 - smoothstep(uP[1].z * 0.55, uP[1].z, ang);
  float fall = exp(-y / (len * 0.45)) * (1.0 - smoothstep(len * 0.7, len, y));
  float dust = fbm(vec2(p.x / 40.0, p.y / 40.0 - uT.x * 0.15));
  float k = edge * fall * (1.0 + uP[2].x * (dust - 0.5));
  float fl = 1.0 - uP[2].y * (0.5 + 0.5 * sin(uT.x * 13.0) * sin(uT.x * 7.3));
  float a = k * uP[0].a * fl;
  return vec4(uP[0].rgb * a, 0.0);
}`;

/**
 * Slanted light shafts through air (additive).
 *   uP0 rgb, alpha; uP1 beam direction (x, y), beam spacing px, drift; uP2 x fade (fade from, gone at; gone at < from
 *   means it fades out to the right); uP3 y (fade in from, full at, fade out from, gone at)
 */
export const SHAFTS = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  vec2 d = normalize(uP[1].xy);
  vec2 nrm = vec2(d.y, -d.x);
  float u = dot(p, nrm);
  float v = dot(p, d);
  float beams = fbm3(vec2(u / uP[1].z, uT.x * uP[1].w));
  float b = smoothstep(0.52, 0.86, beams);
  float fine = vnoise(vec2(u / 14.0, v / 700.0 - uT.x * 0.04));
  b *= 0.7 + 0.3 * fine;
  float mx = smoothstep(uP[2].y, uP[2].x, p.x);
  float my = smoothstep(uP[3].x, uP[3].y, p.y) * (1.0 - smoothstep(uP[3].z, uP[3].w, p.y));
  float a = b * mx * my * uP[0].a * (0.9 + 0.1 * sin(uT.x * 0.7));
  return vec4(uP[0].rgb * a, 0.0);
}`;

/**
 * Two skies side by side, split along a wavering line: left the forest's (teal dusk, an amber bloom),
 * right the Mouth's (cold violet, a pale glow on the horizon).
 *   uP0..2 left top / mid / low rgb; uP3 left bloom xy, radius, strength; uP4 bloom rgb
 *   uP5..7 right top / mid / low rgb; uP8 right glow xy, radius, strength; uP9 glow rgb
 *   uP10 split x, slope (px per px of y), wave amp, softness; uP11.x horizon y
 */
export const SPLIT_SKY = /* glsl */ `
vec3 sky3(vec3 a, vec3 b, vec3 c, float y, float hor) {
  vec3 k = mix(a, b, smoothstep(0.0, hor * 0.7, y));
  return mix(k, c, smoothstep(hor * 0.7, hor + 60.0, y));
}
vec4 paint() {
  vec2 p = vPx;
  float hor = uP[11].x;
  vec3 L = sky3(uP[0].rgb, uP[1].rgb, uP[2].rgb, p.y, hor);
  float dl = length((p - uP[3].xy) * vec2(0.8, 1.0));
  L += uP[4].rgb * exp(-dl / uP[3].z) * uP[3].w;
  L += uP[4].rgb * exp(-dl / (uP[3].z * 0.3)) * uP[3].w * 0.6;
  float mist = fbm(vec2(p.x / 700.0 + uT.x * 0.004, p.y / 160.0));
  L *= 0.85 + 0.3 * mist;
  vec3 R = sky3(uP[5].rgb, uP[6].rgb, uP[7].rgb, p.y, hor);
  float dr = length((p - uP[8].xy) * vec2(0.7, 1.4));
  R += uP[9].rgb * exp(-dr / uP[8].z) * uP[8].w * (0.85 + 0.15 * uT.y);
  float sx = uP[10].x + (p.y - 540.0) * uP[10].y + sin(p.y * 0.006) * uP[10].z + (fbm3(vec2(p.y / 200.0, 3.0)) - 0.5) * uP[10].z;
  float k = smoothstep(sx - uP[10].w, sx + uP[10].w, p.x);
  return vec4(mix(L, R, k), 1.0);
}`;

/**
 * The dish's cloud: grey threads in a unit ellipse, breathing with the world, with a little static
 * (additive).
 *   uP0 centre xy (plane px), radii; uP1 rgb, strength; uP2 static amount, thread scale
 */
export const DISH = /* glsl */ `
vec4 paint() {
  vec2 q = (vPx - uP[0].xy) / uP[0].zw;
  float r = length(q);
  if (r > 1.0) return vec4(0.0);
  float edge = smoothstep(1.0, 0.8, r);
  float t = uT.x;
  vec2 w = vec2(fbm3(q * 1.6 + t * 0.03), fbm3(q * 1.6 + 4.0 - t * 0.025)) - 0.5;
  float s = uP[2].y;
  float th = 1.0 - abs(vnoise((q + w * 0.9) * vec2(7.0, 14.0) * s) * 2.0 - 1.0);
  float th2 = 1.0 - abs(vnoise((q - w * 0.7) * vec2(13.0, 22.0) * s + 3.0) * 2.0 - 1.0);
  th = pow(th, 7.0) + 0.6 * pow(th2, 9.0);
  float cloud = fbm(q * 2.4 + w * 1.5);
  float dens = smoothstep(0.3, 0.75, cloud) * (1.0 - r * 0.55);
  float pulse = 0.5 + 0.5 * uT.y;
  float st = (hash12(floor(vPx / 2.0) + floor(t * 20.0)) - 0.5) * uP[2].x;
  float v = (dens * 0.45 + th * (0.3 + dens) * 1.1) * pulse + st * (0.3 + dens);
  v = max(v, 0.0) * edge;
  return vec4(uP[1].rgb * v * uP[1].a, 0.0);
}`;

/**
 * An old monitor: a cold grey picture, scanlines, two bats and a bead. Nobody plays; one bat
 * follows the bead by itself.
 *   uP0 rgb, strength
 */
export const SCREEN = /* glsl */ `
vec4 paint() {
  vec2 uv = vUV;
  float t = uT.x * 0.45;
  float scan = 0.8 + 0.2 * sin(vPx.y * 3.14159);
  float vig = smoothstep(0.85, 0.25, length((uv - 0.5) * vec2(1.0, 1.2)));
  float bx = abs(fract(t) * 2.0 - 1.0);
  float by = abs(fract(t * 0.71 + 0.3) * 2.0 - 1.0);
  vec2 bead = vec2(mix(0.13, 0.87, bx), mix(0.15, 0.85, by));
  float aspect = uT.z / uT.w;
  float b = smoothstep(0.035, 0.02, length((uv - bead) * vec2(aspect, 1.0)));
  float batL = step(abs(uv.x - 0.08), 0.014) * step(abs(uv.y - bead.y), 0.11);
  float batR = step(abs(uv.x - 0.92), 0.014) * step(abs(uv.y - (0.5 + 0.3 * sin(t * 1.7))), 0.11);
  float n = hash12(floor(vPx / 2.0) + floor(uT.x * 24.0)) * 0.12;
  float k = 0.22 + 0.78 * max(b, max(batL, batR)) + n;
  vec3 c = uP[0].rgb * k * scan * vig * uP[0].a;
  return vec4(c, 1.0);
}`;

/**
 * Wet ground: lights smeared into long vertical streaks below them, broken by ripples, over a dark
 * sheen that takes a little of the sky (additive).
 *   uP0..5 lights (x px, half-width px, strength, length px); uP6..11 their rgb
 *   uP12 water top y, ripple amount, sheen strength, unused; uP13 sheen rgb
 */
export const REFLECT = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  float y0 = uP[12].x;
  if (p.y < y0) return vec4(0.0);
  float dy = p.y - y0;
  float t = uT.x;
  // Ripples: smooth horizontal bands that drift; the streak breaks into dashes along them.
  float rip = (fbm3(vec2(p.x / 60.0 + t * 0.05, dy / 5.0 + t * 0.3)) - 0.5) * uP[12].y * (10.0 + dy * 0.16);
  float brk = smoothstep(0.3, 0.75, fbm3(vec2(p.x / 22.0, dy / 2.6 - t * 0.4)));
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 L = uP[i];
    if (L.z <= 0.0) continue;
    float w = L.y * (1.0 + dy * 0.004);
    float x = (p.x + rip - L.x) / w;
    float k = exp(-x * x) * exp(-dy / L.w) * L.z * (0.35 + 0.65 * brk);
    c += uP[6 + i].rgb * k;
  }
  float sheen = fbm3(vec2(p.x / 300.0, dy / 30.0 + 2.0)) * exp(-dy / 140.0) * uP[12].z;
  c += uP[13].rgb * sheen * (0.5 + 0.5 * brk);
  return vec4(c, 0.0);
}`;

/**
 * A case seen big: a membrane that sits on what holds it (fuller, flatter below), lit from inside by
 * the sleeper's breathing glow; the sleeper's curled shape a soft shadow in it; veins that branch;
 * thick (opaque) at its rim and thin (glowing) in its middle; a moon rim on top.
 *   uP0 centre xy, radii xy; uP1 x: base squareness (2 = ellipse, 3+ flatter), yz: a torn hole's centre
 *   (0 = none), w: breath swell
 *   uP2..7 the sleeper: ellipses (x, y, rx, ry); uP8 rotations of 2..5, uP9.xy rotations of 6..7,
 *   uP9.zw a y below which it fades out (0 = never), fade width
 *   uP10 glow centre xy, radius, strength; uP11 glow rgb; uP12 membrane rgb; uP13 vein rgb, amount
 *   uP14 rim rgb, amount; uP15 sleeper softness px, sleeper darkness, vein scale, hole radius px
 */
export const CASE = /* glsl */ `
float sdEl(vec2 p, vec4 e, float rot) {
  float c = cos(rot);
  float s = sin(rot);
  vec2 d = p - e.xy;
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  return (length(d / e.zw) - 1.0) * min(e.z, e.w);
}
float smin2(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
vec4 paint() {
  vec2 p = vPx;
  float sw = 1.0 + uP[1].w * uT.y;
  vec2 q = (p - uP[0].xy) / (uP[0].zw * vec2(sw, 1.0));
  float e = q.y > 0.0 ? uP[1].x : 2.0;
  float d = pow(pow(abs(q.x), e) + pow(abs(q.y), e), 1.0 / e) - 1.0;
  float dpx = d * min(uP[0].z, uP[0].w) + (fbm3(p * 0.03) - 0.5) * 4.0;
  float a = smoothstep(1.5, -1.5, dpx);
  if (uP[9].z > 0.0) a *= smoothstep(uP[9].z, uP[9].z - uP[9].w, p.y);
  float holeEdge = 0.0;
  if (uP[15].w > 0.0) {
    vec2 hq = (p - uP[1].yz) * vec2(0.62, 1.0);
    float hd = length(hq) - uP[15].w + (fbm(p * 0.035) - 0.5) * uP[15].w * 0.7;
    a *= smoothstep(-2.0, 2.0, hd);
    holeEdge = 1.0 - smoothstep(0.0, 18.0, hd);
  }
  if (a <= 0.001) return vec4(0.0);
  float thick = max(smoothstep(-0.4, 0.0, d), holeEdge);
  float qq = min(1.0, dot(q, q));
  vec3 n = normalize(vec3(q.x, q.y * 0.9, sqrt(max(0.03, 1.0 - qq))));
  float key = clamp(dot(n, normalize(vec3(0.25, -0.85, 0.45))), 0.0, 1.0);
  // The sleeper inside.
  float rots[6] = float[6](uP[8].x, uP[8].y, uP[8].z, uP[8].w, uP[9].x, uP[9].y);
  float sd = 1e5;
  for (int i = 0; i < 6; i++) {
    vec4 el = uP[2 + i];
    if (el.z <= 0.0) continue;
    sd = smin2(sd, sdEl(p, el, rots[i]), 24.0);
  }
  float sl = smoothstep(uP[15].x, -uP[15].x, sd) * uP[15].y;
  float gl = exp(-length((p - uP[10].xy) * vec2(0.9, 1.0)) / uP[10].z) * uP[10].w * (0.7 + 0.3 * uT.y);
  vec3 col = uP[12].rgb * (0.22 + 0.5 * key) * (0.45 + 0.55 * thick);
  col += uP[11].rgb * gl * (1.0 - sl) * (1.0 - thick * 0.75);
  col *= 1.0 - sl * 0.3;
  // Veins: domain-warped ridges, branching rather than gridded.
  vec2 w = p * uP[15].z + (vec2(fbm3(p * 0.004), fbm3(p * 0.004 + 3.7)) - 0.5) * 140.0;
  float v1 = 1.0 - abs(vnoise(w * 0.012) * 2.0 - 1.0);
  float v2 = 1.0 - abs(vnoise(w * 0.031 + 7.0) * 2.0 - 1.0);
  float vein = smoothstep(0.94, 0.99, v1) + 0.55 * smoothstep(0.95, 0.995, v2);
  col = mix(col, uP[13].rgb * (0.4 + 0.8 * gl), clamp(vein * uP[13].a, 0.0, 1.0));
  // Soft vertical folds where it settles.
  float fold = sin(p.x * 0.05 + fbm3(p * 0.008) * 6.0) * smoothstep(0.2, 0.9, q.y);
  col *= 1.0 + 0.12 * fold;
  col += uP[14].rgb * uP[14].a * smoothstep(-0.1, 0.0, d) * key;
  float spec = smoothstep(0.8, 0.95, vnoise(p * 0.05)) * pow(key, 4.0) * (1.0 - thick * 0.5);
  col += vec3(0.9, 0.9, 1.0) * spec * 0.12;
  float al = a * mix(0.82, 1.0, thick);
  return vec4(col * al, al);
}`;

/**
 * Silk thrown over a figure: the figure is a few ellipsoid bumps (head, shoulders, back, knees); the
 * silk lies on them and falls straight down from them to the floor, folding more the further it
 * falls; lit by one key light, thin (and lit through) at its edges.
 *   uP0..5 bumps (x, y, rx, ry); uP6 rotations of 0..3, uP7.xy rotations of 4..5
 *   uP8 floor y, fall length px, fold frequency, fold depth
 *   uP9 key direction (x, y, z), intensity; uP10 key rgb; uP11 ambient rgb; uP12 silk rgb
 *   uP13 rim rgb, amount; uP14 rgb of light through the thin silk, amount
 */
export const SHROUD = /* glsl */ `
float bumpH(vec2 p, vec4 e, float rot) {
  float c = cos(rot);
  float s = sin(rot);
  vec2 d = p - e.xy;
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / e.zw;
  float r2 = dot(d, d);
  return r2 >= 1.0 ? -1.0 : sqrt(1.0 - r2) * min(e.z, e.w);
}
float bodyH(vec2 p) {
  float rots[6] = float[6](uP[6].x, uP[6].y, uP[6].z, uP[6].w, uP[7].x, uP[7].y);
  float h = -1.0;
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 e = uP[i];
    if (e.z <= 0.0) continue;
    float b = bumpH(p, e, rots[i]);
    if (b > 0.0) acc += exp(b / 10.0);
  }
  return acc > 0.0 ? 10.0 * log(acc) : -1.0;
}
float silkH(vec2 p, out float fall) {
  // The silk at p rests on the figure, or hangs from the highest point of it above p.
  float best = bodyH(p);
  fall = 0.0;
  float drop = uP[8].y;
  for (int k = 1; k <= 10; k++) {
    float dy = float(k) / 10.0 * drop;
    if (p.y > uP[8].x + 6.0) break;
    float h = bodyH(p - vec2(0.0, dy));
    if (h <= 0.0) continue;
    // Hanging cloth lies flatter than cloth on a form: it reads as a sheet, not a tube.
    float hang = h * (0.45 - float(k) * 0.025) - 2.0;
    if (hang > best) {
      best = hang;
      fall = dy / drop;
    }
  }
  if (p.y > uP[8].x) best = -1.0;
  return best;
}
vec4 paint() {
  vec2 p = vPx;
  float fall;
  float h = silkH(p, fall);
  float edgeN = (fbm3(p * 0.05) - 0.5) * 3.0;
  float a = smoothstep(-0.5, 2.0, h + edgeN);
  if (a <= 0.001) return vec4(0.0);
  float sw = 1.0 + 0.004 * uT.y;
  float f1;
  float hx = silkH(p + vec2(2.0, 0.0), f1);
  float hy = silkH(p + vec2(0.0, 2.0), f1);
  float folds = uP[8].w * (0.25 + fall) * sin(p.x * uP[8].z + fbm3(p * 0.01) * 5.0 + p.y * 0.004);
  float foldsX = uP[8].w * (0.25 + fall) * sin((p.x + 2.0) * uP[8].z + fbm3((p + vec2(2.0, 0.0)) * 0.01) * 5.0 + p.y * 0.004);
  vec3 n = normalize(vec3((h - hx) * 0.5 + (folds - foldsX) * 0.5, (h - hy) * 0.5, 1.0 * sw));
  float key = clamp(dot(n, normalize(uP[9].xyz)), 0.0, 1.0);
  vec3 col = uP[12].rgb * (uP[11].rgb + uP[10].rgb * key * uP[9].w);
  // Thin at its edges and at the hem: light comes through.
  float thin = 1.0 - smoothstep(0.0, 14.0, h);
  col += uP[14].rgb * uP[14].a * thin;
  col += uP[13].rgb * uP[13].a * smoothstep(0.55, 0.9, key) * (1.0 - fall);
  float grain = vnoise(vec2(p.x * 0.6, p.y * 0.04)) - 0.5;
  col *= 1.0 + grain * 0.08;
  return vec4(col * a, a);
}`;

/**
 * Ground at moth scale: concrete (or tarmac) seen from just above it, in true perspective, so every
 * stone, pit, lichen and crack shrinks toward the horizon. World coords W: eye height = 1 unit,
 * rotated so W.x runs across the street and W.y along it (the kerb is a line W.x = const).
 *   uP0 horizon y, top y (nothing above), focal px, centre x
 *   uP1 kerb: x at top y, slope (px of x per px of y), jag px, street angle (rad)
 *   uP2 base rgb, stain amount; uP3 stone rgb, share of cells with a stone; uP4 pit rgb, share
 *   uP5 sage lichen rgb, share; uP6 rust lichen rgb, share; uP7 moss rgb, amount
 *   uP8 cut: nothing left of x and above y (what stands in front); uP9 joints: along W.x, across W.y, half width, kerb joint W.x
 *   uP10 kerb stone rgb, speckle; uP11 side (1 keep left of the kerb, -1 right), eye height, near dark, cracks
 *   uP12 painted line: W.x, half width, amount; uP13 line rgb, wear
 *   uP14 lip rgb, width px; uP15 scales: stones, pits, lichen, stray moss amount
 */
export const PAVE = /* glsl */ `
vec2 h22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 vor(vec2 g, out vec2 rr) {
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  float best = 9.0;
  vec2 bc = vec2(0.0);
  rr = vec2(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = gi + vec2(float(i), float(j));
      vec2 r = vec2(float(i), float(j)) + 0.15 + h22(c) * 0.7 - gf;
      float d = dot(r, r);
      if (d < best) { best = d; bc = c; rr = r; }
    }
  return vec3(sqrt(best), hash12(bc + 0.37), hash12(bc + 17.3));
}
vec4 paint() {
  vec2 p = vPx;
  float dy = p.y - uP[0].x;
  if (p.y < uP[0].y - 1.0 || dy < 3.0) return vec4(0.0);
  float side = uP[11].x;
  float kx = uP[1].x + (p.y - uP[0].y) * uP[1].y + (fbm3(vec2(p.y / 23.0, 5.1)) - 0.5) * uP[1].z;
  if (p.x < uP[8].x && p.y < uP[8].y) return vec4(0.0);
  float ka = side > 0.0 ? smoothstep(kx + 1.0, kx - 1.0, p.x) : smoothstep(kx - 1.0, kx + 1.0, p.x);
  if (ka <= 0.0) return vec4(0.0);
  float eye = uP[11].y;
  float cs = cos(uP[1].w);
  float sn = sin(uP[1].w);
  vec2 C = vec2((p.x - uP[0].w) / dy, uP[0].z / dy) * eye;
  vec2 W = vec2(C.x * cs - C.y * sn, C.x * sn + C.y * cs);
  float px = eye / dy;
  vec2 rr;
  // Concrete: stains, damp, wear.
  float st = fbm(W * 0.9 + 3.0);
  float st2 = fbm3(W * 4.0 + 11.0);
  vec3 col = uP[2].rgb * (1.0 + (st - 0.5) * uP[2].a * 2.0 + (st2 - 0.5) * uP[2].a);
  // Aggregate: stones set in it, worn flat on top, lit from the far side.
  vec3 v = vor(W * uP[15].x, rr);
  float rad = (0.12 + 0.3 * v.y * v.y) * (1.0 + 0.35 * (vnoise(rr * 3.0 / max(0.1, 0.2 + 0.3 * v.y) + v.z * 40.0) - 0.5));
  float has = step(1.0 - uP[3].a, v.z);
  float fw = px * uP[15].x * 1.2;
  float stone = has * smoothstep(rad + fw, rad - fw, v.x) * (0.55 + 0.45 * v.y);
  vec2 nr = -rr / rad;
  float hgt = sqrt(max(0.0, 1.0 - dot(nr, nr)));
  float lit = clamp(dot(normalize(vec3(nr, hgt * 1.2)), normalize(vec3(-0.35, 0.7, 0.6))), 0.0, 1.0);
  vec3 sc = uP[3].rgb * mix(0.65, 1.3, v.y) * mix(vec3(1.0), vec3(1.12, 0.95, 0.88), step(0.6, v.z));
  col = mix(col, sc * (0.5 + 0.8 * lit), stone);
  col *= 1.0 - 0.4 * has * smoothstep(rad * 1.6, rad, v.x) * (1.0 - stone) * smoothstep(0.0, -0.4, nr.y);
  // Pits: air holes, their near wall catching the light.
  vec3 q = vor(W * uP[15].y + 7.7, rr);
  float pr = 0.1 + 0.14 * q.y;
  float fp = px * uP[15].y * 1.2;
  float pit = step(1.0 - uP[4].a, q.z) * smoothstep(pr + fp, pr - fp, q.x);
  col = mix(col, uP[4].rgb * (0.6 + 1.2 * clamp(rr.y / pr, 0.0, 1.0)), pit);
  // The kerb stone: speckled granite, no aggregate.
  float onK = side > 0.0 ? smoothstep(uP[9].w - px, uP[9].w + px, W.x) : 0.0;
  if (onK > 0.0) {
    float s1 = vnoise(W * 60.0);
    float s2 = vnoise(W * 150.0 + 5.0);
    vec3 g = uP[10].rgb * (0.85 + 0.3 * st2);
    g = mix(g, g * 0.45, smoothstep(0.62, 0.7, s2) * uP[10].a);
    g = mix(g, g * vec3(1.5, 1.3, 1.35), smoothstep(0.72, 0.8, s1) * uP[10].a);
    g = mix(g, vec3(0.75, 0.74, 0.8), smoothstep(0.86, 0.9, s2) * uP[10].a * 0.6);
    col = mix(col, g, onK);
  }
  // Lichen: rosettes with a lobed, brighter growing rim.
  vec3 lv = vor(W * uP[15].z + 3.3, rr);
  float lr = 0.22 + 0.24 * lv.y;
  float an = atan(rr.y, rr.x);
  float lob = lr * (1.0 + 0.16 * sin(an * 7.0 + lv.z * 20.0) + 0.14 * (vnoise(vec2(an * 2.0 + lv.y * 9.0, 1.0)) - 0.5));
  float lf = uP[15].z * px * 1.5;
  float h1 = step(1.0 - uP[5].a, lv.z);
  float h2 = step(1.0 - uP[6].a, fract(lv.z * 7.13)) * (1.0 - h1);
  float lich = (h1 + h2) * smoothstep(lob + lf, lob - lf, lv.x);
  float ring = 0.72 + 0.3 * smoothstep(lob * 0.6, lob * 0.95, lv.x) + 0.1 * sin(lv.x / lob * 18.0);
  float tex = 0.75 + 0.5 * vnoise(W * 110.0 + lv.y * 30.0);
  vec3 lc = h1 > 0.5 ? uP[5].rgb : uP[6].rgb;
  col = mix(col, lc * ring * tex, lich * 0.9);
  // Cracks: a few, long, thin.
  vec2 wq = W * 0.8 + vec2(fbm3(W * 0.6), fbm3(W * 0.6 + 4.0)) * 1.6;
  float rdg = 1.0 - abs(vnoise(wq * 2.0) * 2.0 - 1.0);
  float cm = smoothstep(0.48, 0.6, fbm3(W * 0.45 + 9.0)) * uP[11].w;
  float fr = fwidth(rdg);
  float crack = smoothstep(0.972 - fr * 1.5, 0.972 + fr * 0.5, rdg) * cm;
  float crackLip = smoothstep(0.93 - fr, 0.96, rdg) * cm * (1.0 - crack);
  col *= 1.0 - 0.85 * crack;
  col *= 1.0 + 0.25 * crackLip;
  // Joints between slabs: a dark gap, moss cushioned in and spilling out of it.
  float jn = (fbm3(W * vec2(0.6, 2.5)) - 0.5) * 0.06;
  float dL = abs(W.x - uP[9].x + jn);
  float dC = abs(W.y - uP[9].y + (fbm3(W * vec2(2.5, 0.6) + 2.0) - 0.5) * 0.06);
  float dK = side > 0.0 ? abs(W.x - uP[9].w + jn * 0.5) : 9.0;
  float dj = min(min(dL, dC), dK);
  float jw = uP[9].z;
  float joint = smoothstep(jw + px * 1.2, jw - px * 1.2, dj);
  float mz = fbm3(W * 5.0 + 1.3);
  float fib = vnoise(W * 150.0) * 0.6 + vnoise(W * 320.0) * 0.4;
  float spill = jw + 0.02 + 0.13 * mz * mz;
  float moss = smoothstep(spill + px * 2.0, spill - px * 2.0, dj - 0.03 * fib) * uP[7].a;
  float stray = smoothstep(0.7, 0.74, fbm3(W * 1.8 + 5.0) + 0.04 * fib) * uP[15].w;
  moss = max(moss, stray);
  vec3 mc = uP[7].rgb * (0.45 + 0.95 * fib) * (0.7 + 0.6 * mz);
  col = mix(col, vec3(0.012, 0.012, 0.024), joint);
  col = mix(col, mc, moss * (1.0 - joint * 0.5));
  // A painted line, worn.
  if (uP[12].z > 0.0) {
    float ld = abs(W.x - uP[12].x);
    float ln = smoothstep(uP[12].y + px, uP[12].y - px, ld);
    ln *= uP[12].z * (1.0 - uP[13].a * smoothstep(0.4, 0.7, fbm3(W * 3.0)));
    col = mix(col, uP[13].rgb, ln);
  }
  // The kerb's lip: the rounded edge catches the fog beyond.
  if (side > 0.0) {
    float rw = uP[14].w * dy / 300.0;
    float lip = smoothstep(kx - rw, kx - 1.0, p.x);
    col = mix(col, uP[14].rgb * (0.8 + 0.4 * fib), lip * 0.85);
  }
  col *= mix(1.0, uP[11].z, smoothstep(uP[0].y, 1080.0, p.y));
  return vec4(col * ka, ka);
}`;

/**
 * A dome of grown tissue over a light: a lumpy outline, ribs that run from its crown down to its
 * foot (ridged noise, never a regular sine: that reads as candy stripes), thin glowing membrane
 * between them, thick and opaque at its silhouette, sick pink in its deepest creases, torn open at
 * the crown with a lit, ragged lip.
 *   uP0 base centre xy, radii xy (height); uP1 lump amplitude px, lump frequency, rib frequency, rib depth
 *   uP2 tear centre xy, radius px (0 = none), raggedness; uP3 inner light xy, radius, strength
 *   uP4 light rgb; uP5 membrane rgb; uP6 crease rgb, amount; uP7 rim rgb, amount
 *   uP8 y where it fades out (its foot), fade width, alpha of the thin membrane; uP9.x 0 = the inner
 *   back wall (no tear, lit from inside), 1 = the front
 */
export const DOME = /* glsl */ `
vec4 paint() {
  vec2 p = vPx;
  float sw = 1.0 + 0.008 * uT.y;
  vec2 q = (p - uP[0].xy) / (uP[0].zw * vec2(sw, sw));
  float ang = atan(q.x, -q.y);
  float r = length(q);
  float mn = min(uP[0].z, uP[0].w);
  float lump = (fbm3(vec2(ang * uP[1].y + 1.7, 3.1)) - 0.5) * uP[1].x / mn;
  float d = r - (1.0 + lump);
  float a = smoothstep(1.5, -1.5, d * mn);
  a *= smoothstep(uP[8].x, uP[8].x - uP[8].y, p.y);
  float front = uP[9].x;
  float holeEdge = 0.0;
  if (front > 0.5 && uP[2].z > 0.0) {
    vec2 hq = (p - uP[2].xy) * vec2(0.62, 1.0);
    float hd = length(hq) - uP[2].z + (fbm(p * 0.035) - 0.5) * uP[2].z * uP[2].w;
    a *= smoothstep(-2.0, 2.0, hd);
    holeEdge = 1.0 - smoothstep(0.0, 22.0, hd);
  }
  if (a <= 0.001) return vec4(0.0);
  float thick = max(smoothstep(-0.3, 0.0, d), holeEdge);
  float rr = min(1.0, r);
  vec3 n = normalize(vec3(q.x, q.y * 0.9, sqrt(max(0.03, 1.0 - rr * rr))));
  float key = clamp(dot(n, normalize(vec3(0.3, -0.8, 0.5))), 0.0, 1.0);
  // Ribs from the crown to the foot: ridged noise around the dome, wandering as they run down.
  vec2 w = vec2(ang * uP[1].z, r * 1.6 + (fbm3(q * 2.2) - 0.5) * 1.8);
  float rib = 1.0 - abs(vnoise(w) * 2.0 - 1.0);
  float rib2 = 1.0 - abs(vnoise(vec2(ang * uP[1].z * 2.6 + 5.0, r * 4.0 + fbm3(q * 5.0))) * 2.0 - 1.0);
  float ribs = pow(rib, 2.5) * 0.7 + pow(rib2, 3.0) * 0.3;
  float crease = smoothstep(0.35, 0.0, rib) * uP[1].w;
  float gl = exp(-length((p - uP[3].xy) * vec2(0.9, 1.0)) / uP[3].z) * uP[3].w * (0.7 + 0.3 * uT.y);
  vec3 col = uP[5].rgb * (0.16 + 0.32 * key) * (0.55 + 0.45 * thick) * (0.55 + 0.9 * ribs);
  // Light through: strongest where it is thin (between ribs, away from the silhouette).
  float thin = (1.0 - thick * 0.75) * (1.0 - ribs * 0.55);
  col += uP[4].rgb * gl * thin * (front > 0.5 ? 1.0 : 0.7);
  col = mix(col, uP[6].rgb * (0.25 + 0.9 * gl), clamp(crease * uP[6].a, 0.0, 1.0));
  col += uP[7].rgb * uP[7].a * smoothstep(-0.08, 0.0, d) * key;
  col += uP[4].rgb * holeEdge * (0.35 + 0.5 * gl);
  // Fibre: fine streaks along the ribs.
  col *= 0.86 + 0.28 * fbm3(p * 0.06);
  float al = a * (front > 0.5 ? mix(uP[8].z, 1.0, max(thick, ribs * 0.6)) : 1.0);
  return vec4(col * al, al);
}`;
