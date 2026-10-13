/**
 * GLSL for the post pipeline (WebGL2). Pixi adds `#version 300 es` itself. Fragments declare highp
 * and never redeclare Pixi's own filter uniforms (their precision would have to match the vertex
 * shader's): everything they need from them arrives as a varying.
 */
import { MAX_LIGHTS, MAX_RECTS } from './config';

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
 * Sum of the point lights into a small target (rgb), plus "how much playfield is here" (alpha): a
 * soft mask made from the collision rects, reaching a little above their tops to catch the grass.
 * Post has no depth buffer; this is what lets the ember light the ground it stands on and not the
 * fog a hundred metres behind. Positions, radii and rects are in view heights.
 */
export const LIGHTS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPos;
out vec4 finalColor;
uniform vec4 uLights[${MAX_LIGHTS}];
uniform vec4 uLightColors[${MAX_LIGHTS}];
uniform int uLightCount;
uniform vec4 uRects[${MAX_RECTS}];
uniform int uRectCount;
uniform vec4 uShape;  // aspect, falloff, edge feather, reach above the tops
void main(void) {
  vec2 p = vec2(vPos.x * uShape.x, vPos.y);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec2 d = (p - l.xy) / l.z;
    float q = clamp(1.0 - dot(d, d), 0.0, 1.0);
    // A smooth window that reaches zero at the radius, with a brighter core.
    float f = pow(q, uShape.y) * (0.55 + 0.45 * q * q);
    sum += uLightColors[i].rgb * (f * l.w);
  }
  float mask = 0.0;
  if (dot(sum, vec3(1.0)) > 0.001) {
    float e = uShape.z;
    for (int i = 0; i < ${MAX_RECTS}; i++) {
      if (i >= uRectCount) break;
      vec4 r = uRects[i];
      float mx = smoothstep(e, -e, max(r.x - p.x, p.x - r.z));
      float top = smoothstep(uShape.w, -e, r.y - p.y);
      float bottom = smoothstep(e, -e, p.y - r.w);
      mask = max(mask, mx * top * bottom);
    }
  }
  finalColor = vec4(sum, mask);
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
uniform vec4 uMix;        // bloom intensity, light gain, light haze, chroma
uniform vec4 uTone;       // exposure, shoulder, contrast, pivot
uniform vec4 uShadow;     // rgb tint, lift
uniform vec4 uHighlight;  // rgb tint, warmth
uniform vec4 uVignette;   // inner, outer, strength, tint amount
uniform vec4 uVignetteTint; // rgb, saturation
uniform vec4 uGrain;      // amplitude, time, aspect, unused
uniform vec4 uLightBack;  // how much of a light reaches what is not playfield, unused x3

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
  vec2 off = c * vUvScale * (uMix.w * r2);
  vec3 col;
  col.g = texture(uTexture, vTextureCoord).g;
  col.r = texture(uTexture, clamp(vTextureCoord - off, vClamp.xy, vClamp.zw)).r;
  col.b = texture(uTexture, clamp(vTextureCoord + off, vClamp.xy, vClamp.zw)).b;

  // Point lights: mostly a gain on what is there (so terrain lifts into its own colour, warmed),
  // plus a breath of haze in the air.
  // Dark surfaces get relatively more than pale fog behind them (and things that already glow get
  // nothing: a firefly next to the ember must not blow out), and the surface colour is pulled
  // part-way to grey first so the light's own colour shows.
  vec4 lit = texture(uLight, vPos);
  vec3 light = lit.rgb;
  float ll = dot(col, LUMA);
  vec3 albedo = mix(vec3(ll), col, 0.6);
  float lift = uMix.y * 0.35 / (0.2 + ll) * (1.0 - smoothstep(0.3, 0.85, ll));
  col += albedo * light * (lift * mix(uLightBack.x, 1.0, lit.a)) + light * uMix.z;

  // Bloom.
  col += texture(uBloom, vPos).rgb * uMix.x;

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
