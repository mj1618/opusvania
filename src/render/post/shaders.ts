/**
 * GLSL for the post pipeline (WebGL2). Pixi adds `#version 300 es` itself. Fragments declare highp
 * and never redeclare Pixi's own filter uniforms (their precision would have to match the vertex
 * shader's): everything they need from them arrives as a varying.
 */
import { MAX_LIGHTS } from './config';

/** For passes into our own targets: the quad fills the whole target whatever its size. */
export const PASS_VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vPos;
out vec4 vClamp;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  gl_Position = vec4(aPosition.x * 2.0 - 1.0, (aPosition.y * 2.0 - 1.0) * uOutputTexture.z, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vPos = aPosition;
  vClamp = uInputClamp;
}
`;

/** For the last pass, into whatever the filter system hands us (usually the canvas). */
export const FINAL_VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vPos;
out vec4 vClamp;
out vec2 vUvScale;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vUvScale = uOutputFrame.zw * uInputSize.zw;
  vTextureCoord = aPosition * vUvScale;
  vPos = aPosition;
  vClamp = uInputClamp;
}
`;

/** Scene -> first bloom level: box downsample, keeping only what is brighter than the threshold. */
export const PREFILTER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec4 vClamp;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uTap;
uniform vec3 uCurve;
uniform float uSaturation;
uniform float uBoost;

vec3 bright(vec2 uv) {
  vec3 c = texture(uTexture, clamp(uv, vClamp.xy, vClamp.zw)).rgb;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uCurve.x + uCurve.y, 0.0, 2.0 * uCurve.y);
  soft = soft * soft * uCurve.z;
  // Saturated light (glow plants, the ember) blooms harder than pale light (fog, sky).
  float sat = (b - min(c.r, min(c.g, c.b))) / max(b, 1e-4);
  return c * (max(soft, b - uCurve.x) / max(b, 1e-4)) * (1.0 + uBoost * sat);
}

void main(void) {
  vec3 a = bright(vTextureCoord + uTap * vec2(-1.0, -1.0));
  vec3 b = bright(vTextureCoord + uTap * vec2(1.0, -1.0));
  vec3 c = bright(vTextureCoord + uTap * vec2(-1.0, 1.0));
  vec3 d = bright(vTextureCoord + uTap * vec2(1.0, 1.0));
  // Weighting each tap by 1 / (1 + luma) stops a single hot texel from flickering (Karis average).
  vec4 w = 1.0 / (1.0 + vec4(dot(a, vec3(0.3, 0.5, 0.2)), dot(b, vec3(0.3, 0.5, 0.2)),
                             dot(c, vec3(0.3, 0.5, 0.2)), dot(d, vec3(0.3, 0.5, 0.2))));
  vec3 col = (a * w.x + b * w.y + c * w.z + d * w.w) / (w.x + w.y + w.z + w.w);
  float l = dot(col, vec3(0.3, 0.5, 0.2));
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  finalColor = vec4(col, 1.0);
}
`;

/** Dual-filter downsample: centre + four diagonal taps. `uTexel` = one input texel in uv. */
export const DOWN_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uTexel;
void main(void) {
  vec2 uv = vTextureCoord;
  vec3 col = texture(uTexture, uv).rgb * 4.0;
  col += texture(uTexture, uv + uTexel * vec2(-1.0, -1.0)).rgb;
  col += texture(uTexture, uv + uTexel * vec2(1.0, -1.0)).rgb;
  col += texture(uTexture, uv + uTexel * vec2(-1.0, 1.0)).rgb;
  col += texture(uTexture, uv + uTexel * vec2(1.0, 1.0)).rgb;
  finalColor = vec4(col * 0.125, 1.0);
}
`;

/**
 * Dual-filter upsample of the wider level (uTexture), blended with this level's own detail
 * (uBase). `uTexel` = one input (wider level) texel in uv times the radius knob.
 */
export const UP_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBase;
uniform vec2 uTexel;
uniform float uSpread;
void main(void) {
  vec2 uv = vTextureCoord;
  vec2 h = uTexel * 0.5;
  vec3 col = texture(uTexture, uv + vec2(-h.x * 2.0, 0.0)).rgb;
  col += texture(uTexture, uv + vec2(h.x * 2.0, 0.0)).rgb;
  col += texture(uTexture, uv + vec2(0.0, -h.y * 2.0)).rgb;
  col += texture(uTexture, uv + vec2(0.0, h.y * 2.0)).rgb;
  col += texture(uTexture, uv + vec2(-h.x, h.y)).rgb * 2.0;
  col += texture(uTexture, uv + vec2(h.x, h.y)).rgb * 2.0;
  col += texture(uTexture, uv + vec2(-h.x, -h.y)).rgb * 2.0;
  col += texture(uTexture, uv + vec2(h.x, -h.y)).rgb * 2.0;
  col /= 12.0;
  finalColor = vec4(mix(texture(uBase, uv).rgb, col, uSpread), 1.0);
}
`;

/**
 * The light map. rgb: the point lights as they land on surfaces, i.e. multiplied by the playfield
 * mask (lib/fx-mask.ts), softened a little. a: a wider, fainter halo for the glow hanging in the
 * air around each light, unmasked. Positions and radii are in view heights.
 */
export const LIGHTS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uMask;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec4 uLightColors[${MAX_LIGHTS}];
uniform int uLightCount;
uniform vec4 uShape;  // aspect, falloff, halo radius factor, light reaching non-playfield
uniform vec2 uMaskTexel;
uniform float uDim;
uniform float uDirection;
void main(void) {
  vec2 p = vec2(vPos.x * uShape.x, vPos.y);
  vec3 sum = vec3(0.0);
  float halo = 0.0;
  vec2 toward = vec2(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec2 d = (p - l.xy) / l.z;
    float r2 = dot(d, d);
    float q = clamp(1.0 - r2, 0.0, 1.0);
    // A smooth window that reaches zero at the radius, with a brighter core.
    float f = pow(q, uShape.y) * (0.5 + 0.5 * q * q);
    sum += uLightColors[i].rgb * (f * l.w);
    toward -= d * (f * l.w);
    float h = clamp(1.0 - r2 / (uShape.z * uShape.z), 0.0, 1.0);
    halo += h * h * h * l.w;
  }
  float mask = 0.0;
  if (halo > 0.0005) {
    // Nine taps: a soft mask (no hard edge where a cliff face ends) and its gradient.
    vec2 t = uMaskTexel * 3.0;
    vec4 c = texture(uMask, vPos);
    vec4 e = texture(uMask, vPos + vec2(t.x, 0.0));
    vec4 w = texture(uMask, vPos - vec2(t.x, 0.0));
    vec4 n = texture(uMask, vPos - vec2(0.0, t.y));
    vec4 s = texture(uMask, vPos + vec2(0.0, t.y));
    vec4 dg = texture(uMask, vPos + t * 0.7) + texture(uMask, vPos - t * 0.7)
            + texture(uMask, vPos + vec2(t.x, -t.y) * 0.7) + texture(uMask, vPos + vec2(-t.x, t.y) * 0.7);
    vec4 m = c * 0.2 + (e + w + n + s) * 0.12 + dg * 0.08;
    mask = m.a;
    // The mask's gradient is a cheap normal at silhouettes: edges that face the light catch it,
    // edges that face away fall off. Flat interiors sit in between.
    vec2 normal = vec2(w.a - e.a, n.a - s.a);
    float edge = min(length(normal) * 2.5, 1.0);
    float facing = dot(normalize(normal + 1e-5), normalize(toward + 1e-5));
    sum *= clamp(0.82 + uDirection * facing * edge, 0.15, 1.6);
    // Where the place is bright already (the light well) the hero's light matters less.
    float ambient = dot(m.rgb, vec3(0.3, 0.55, 0.15)) / max(m.a, 0.05);
    sum *= mix(1.0, uDim, smoothstep(0.22, 0.6, ambient));
  }
  finalColor = vec4(sum * mix(uShape.w, 1.0, mask), halo);
}
`;

/** Scene + lights + bloom, then the grade, vignette and grain. */
export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vPos;
in vec4 vClamp;
in vec2 vUvScale;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uLight;
uniform sampler2D uMatte;
uniform vec4 uProtect;    // hero matte strength, lit-surface luminance cap, bloom cut on the hero, unused
uniform vec4 uMix;        // bloom intensity, light gain, light haze, chroma
uniform vec4 uTone;       // exposure, shoulder, contrast, pivot
uniform vec4 uShadow;     // rgb tint, lift
uniform vec4 uHighlight;  // rgb tint, warmth
uniform vec4 uVignette;   // inner, outer, strength, tint amount
uniform vec4 uVignetteTint; // rgb, saturation
uniform vec4 uGrain;      // amplitude, time, aspect, unused
uniform vec4 uLightBack;  // bloom cut on pale brights, glint, warm add, leaf light wrap
uniform vec4 uHalo;       // rgb: the lights' mean colour
uniform vec4 uLit;        // light colour tint 0..1, chroma gain, per-channel ceiling, unused
uniform vec4 uHero;       // x, y (view heights), pocket radius, darkening
uniform vec4 uHero2;      // inner radius left untouched, desaturation, luminance ceiling, pull toward it

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 shoulder(vec3 x, float k) {
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}

void main(void) {
  vec2 c = vPos - 0.5;
  vec2 cv = vec2(c.x * uGrain.z, c.y);
  float r2 = dot(cv, cv);

  // Scene, with the red and blue channels pulled apart a little toward the corners.
  vec3 col = texture(uTexture, vTextureCoord).rgb;
  if (uMix.w > 0.0) {
    vec2 off = c * vUvScale * (uMix.w * r2);
    col.r = texture(uTexture, clamp(vTextureCoord - off, vClamp.xy, vClamp.zw)).r;
    col.b = texture(uTexture, clamp(vTextureCoord + off, vClamp.xy, vClamp.zw)).b;
  }

  // A pocket of calm around the hero: what lies around them (not on them) goes a little darker
  // and greyer, so a small figure separates from a busy, glowing forest without an outline.
  vec2 hd = cv - (uHero.xy - vec2(0.5 * uGrain.z, 0.5));
  float h2 = dot(hd, hd);
  float pocket = exp(-h2 / (uHero.z * uHero.z)) * (1.0 - exp(-h2 / (uHero2.x * uHero2.x)));
  // Bright surroundings are pulled down hardest (toward the ceiling in uHero2.z); dark ones are
  // left nearly alone, so the pocket never reads as a grey disc.
  float pl = dot(col, LUMA);
  // Small lights (glints, glow caps, fireflies) keep their full value inside the pocket.
  float pmx = max(col.r, max(col.g, col.b));
  float psat = (pmx - min(col.r, min(col.g, col.b))) / max(pmx, 1e-4);
  pocket *= 1.0 - smoothstep(0.55, 0.85, pmx) * smoothstep(0.3, 0.6, psat);
  float over = max(pl - uHero2.z, 0.0);
  float keep = 1.0 - pocket * (uHero.w + uHero2.w * over / max(pl, 1e-3));
  col = mix(col, vec3(pl), pocket * uHero2.y) * keep;

  // Big pale bright areas (sky, lit fog) are bright enough already: they take little bloom
  // themselves, so the glow budget goes to halos around small, coloured lights.
  float mx = max(col.r, max(col.g, col.b));
  float pale = smoothstep(0.5, 0.9, mx) * (1.0 - (mx - min(col.r, min(col.g, col.b))) / max(mx, 1e-4));

  // Point lights. On surfaces the light is a gain on the surface's own colour: hue and the
  // light-to-dark shading of the thing survive (a lit blade of grass is a brighter, richer blade,
  // not a paler one). Chroma is raised with the gain, the light's own colour tints only a little,
  // and the result is kneed by luminance with the colour scaled as a whole, so nothing drifts
  // toward white. Bright wet spots glint. In the air: a wide faint halo.
  vec4 lit = texture(uLight, vPos);
  // The hero is not lit by their own light (it would lift their dark body more than anything
  // else, being nearest): the matte takes the light, the halo and most of the bloom off them.
  float hero = smoothstep(0.08, 0.6, texture(uMatte, vPos).a) * uProtect.x;
  float ll = dot(col, LUMA);
  float lm = max(lit.r, max(lit.g, lit.b));
  if (lm > 0.002) {
    vec3 tint = mix(vec3(1.0), lit.rgb / lm, uLit.x);
    float g = lm * uMix.y * (1.0 - smoothstep(0.55, 1.0, ll));
    // A floor under the gain so near-black soil still shows a little of the pool.
    vec3 lc = (col + vec3(uLightBack.z) * min(g, 1.0)) * (1.0 + g) * tint;
    float sl = dot(lc, LUMA);
    lc = mix(vec3(sl), lc, 1.0 + uLit.y * min(g, 1.5));
    lc = max(lc, 0.0);
    // Knee on luminance, applied to the whole colour.
    sl = dot(lc, LUMA);
    float knee = uProtect.y * 0.6;
    if (sl > knee) lc *= (knee + (uProtect.y - knee) * (1.0 - exp(-(sl - knee) / (uProtect.y - knee)))) / sl;
    // No channel may clip: scale back instead, which keeps the hue.
    float top = max(lc.r, max(lc.g, lc.b));
    if (top > uLit.z) lc *= uLit.z / top;
    lc += lit.rgb * (ll * ll * uLightBack.y);
    col = mix(col, lc, 1.0 - hero);
  }
  col += uHalo.rgb * (lit.a * uMix.z * (1.0 - hero));

  // Bloom.
  vec3 bloom = texture(uBloom, vPos).rgb;
  // Light wrap: dark foliage right next to a bright opening takes some of that light through its
  // edge, in its own colour brightened toward yellow-green, like backlit leaves.
  float wrap = dot(bloom, LUMA) * (1.0 - smoothstep(0.12, 0.5, ll)) * uLightBack.w * (1.0 - hero);
  col += (col * 3.0 + vec3(0.05, 0.085, 0.025)) * bloom * wrap;
  col += bloom * (uMix.x * (1.0 - uLightBack.x * pale) * (1.0 - hero * uProtect.z));

  // Tone: exposure, a soft shoulder instead of clipping, an S-curve around the pivot.
  col = shoulder(col * uTone.x, uTone.y);
  float l = dot(col, LUMA);
  float lc = clamp(l, 1e-4, 1.0);
  float curved = lc < uTone.w
    ? uTone.w * pow(lc / uTone.w, 1.0 + uTone.z)
    : 1.0 - (1.0 - uTone.w) * pow((1.0 - lc) / (1.0 - uTone.w), 1.0 + uTone.z);
  col *= curved / lc;

  // Split tone: shadows lift toward teal-indigo, highlights lean warm.
  l = dot(col, LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.45, l);
  col += uShadow.rgb * (sh * sh * uShadow.a);
  float hi = smoothstep(0.35, 0.95, l);
  col *= mix(vec3(1.0), uHighlight.rgb, hi * uHighlight.a);

  // Saturation.
  l = dot(col, LUMA);
  col = mix(vec3(l), col, uVignetteTint.a);

  // Vignette: darker, cooler corners.
  float v = smoothstep(uVignette.x, uVignette.y, sqrt(r2));
  col *= mix(vec3(1.0), uVignetteTint.rgb, v * uVignette.w) * (1.0 - v * uVignette.z);

  // Grain: triangular noise, new every frame, a touch stronger in the mid-darks.
  vec2 gp = gl_FragCoord.xy + fract(uGrain.y * vec2(7.13, 3.71)) * 517.0;
  float n = hash12(gp) + hash12(gp + 71.7) - 1.0;
  col += n * uGrain.x * (1.0 - 0.5 * smoothstep(0.3, 1.0, l));

  finalColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
