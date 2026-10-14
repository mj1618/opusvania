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
