/**
 * GLSL for the air layer (WebGL2; Pixi adds the #version line). Everything is highp in both
 * stages so uniforms shared between vertex and fragment link.
 *
 * Shafts live in "light space": u runs across the beams, v along them (KEY_LIGHT.dir). The beam
 * pattern is noise in u only, so beams are perfectly straight and parallel like real sunlight; a
 * sum of soft windows in u (the "groups") says where the canopy lets light through.
 */

import { PROFILE_RANGE, PROFILE_Y0 } from './fx-ground';
import { KEY_LIGHT } from './look';

export const MAX_SHAFT_GROUPS = 4;

const f = (n: number): string => n.toFixed(4);

/** Shared by the volume fragment shader and the motes vertex shader. */
const SHAFT_GLSL = /* glsl */ `
uniform sampler2D uNoise;
uniform sampler2D uGround;
uniform vec4 uGroups[${MAX_SHAFT_GROUPS}]; // centre u, half width, strength, reach (0..1 of the way to the ground)
uniform vec4 uAir;       // time, ground u scale, ground u offset, unused
const vec2 LIGHT_D = vec2(${f(KEY_LIGHT.dirX)}, ${f(KEY_LIGHT.dirY)});
const vec2 LIGHT_N = vec2(${f(KEY_LIGHT.dirY)}, ${f(-KEY_LIGHT.dirX)});

float groundY(float x) {
  return ${f(PROFILE_Y0)} + textureLod(uGround, vec2(x * uAir.y + uAir.z, 0.5), 0.0).r * ${f(PROFILE_RANGE)};
}

float shaftAt(vec2 p) {
  float u = dot(p, LIGHT_N);
  float v = dot(p, LIGHT_D);
  float env = 0.0;
  float reach = 0.0;
  for (int i = 0; i < ${MAX_SHAFT_GROUPS}; i++) {
    vec4 g = uGroups[i];
    float d = (u - g.x) / g.y;
    float e = g.z * exp(-d * d);
    env += e;
    reach += e * g.w;
  }
  if (env < 0.004) return 0.0;
  reach /= env;
  float t = uAir.x;
  // Broad beams, split into finer streaks, both drifting very slowly across.
  float broad = textureLod(uNoise, vec2(u / 1500.0 + t * 0.0021, 0.37), 0.0).r;
  float fine = textureLod(uNoise, vec2(u / 420.0 - t * 0.0047, 0.71), 0.0).g;
  float beams = smoothstep(0.3, 0.7, broad) * (0.35 + 0.65 * smoothstep(0.25, 0.8, fine));
  // Slow shimmer travelling down the length, and each streak dies at its own height above the ground.
  float shimmer = textureLod(uNoise, vec2(u / 900.0, v / 3200.0 - t * 0.016), 0.0).b;
  beams *= 0.62 + 0.76 * shimmer;
  float gy = groundY(p.x);
  float end = gy - mix(620.0, 30.0, reach) + (fine - 0.5) * 260.0;
  beams *= 1.0 - smoothstep(end - 520.0, end, p.y);
  return env * beams;
}
`;

const MESH_HEAD = /* glsl */ `
precision highp float;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
`;

/** A quad stretched over the visible part of the layer; vWorld is the layer-space position. */
export const VOLUME_VERT = /* glsl */ `
${MESH_HEAD}
in vec2 aPosition;
out vec2 vWorld;
uniform vec4 uRect;
void main(void) {
  vWorld = uRect.xy + aPosition * uRect.zw;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(vWorld, 1.0)).xy, 0.0, 1.0);
}
`;

/**
 * Shafts (additive) and ground mist (alpha) in one pass. Output is premultiplied: additive light
 * goes into rgb without alpha.
 */
export const VOLUME_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;
${SHAFT_GLSL}
uniform vec4 uShaftColor;  // rgb, strength
uniform vec4 uMistColor;   // rgb, opacity
uniform vec4 uMist;        // height, underground fade, lit-by-shaft amount, unused
uniform vec4 uPlayer;      // x, y, parting radius, parting amount

void main(void) {
  vec2 p = vWorld;
  float t = uAir.x;
  float s = uShaftColor.a > 0.0 ? shaftAt(p) : 0.0;
  vec3 rgb = uShaftColor.rgb * (s * uShaftColor.a);
  float a = 0.0;
  if (uMistColor.a > 0.0) {
    float gy = groundY(p.x);
    float above = gy - p.y;
    if (above > -uMist.y * 3.0 && above < uMist.x * 4.0) {
      // Two sheets sliding past each other at different speeds.
      float n1 = texture(uNoise, vec2(p.x / 1900.0 - t * 0.0065, p.y / 620.0 + t * 0.002)).r;
      float n2 = texture(uNoise, vec2(p.x / 760.0 + t * 0.0105, p.y / 330.0 - 0.3)).g;
      float n = smoothstep(0.22, 0.85, n1 * 0.65 + n2 * 0.35);
      // Thick sheets rise higher, so the top of the mist is ragged; it thins out again right at
      // the surface line so it never draws the ground's outline.
      float h = uMist.x * (0.25 + 1.35 * n);
      float fall = exp(-max(above, 0.0) / h) * smoothstep(-uMist.y, uMist.y * 1.6, above + n * uMist.y);
      vec2 dp = (p - uPlayer.xy) / uPlayer.z;
      float part = 1.0 - uPlayer.w * exp(-dot(dp, dp));
      a = uMistColor.a * fall * (0.12 + 0.88 * n) * part;
      rgb = rgb * (1.0 - a) + uMistColor.rgb * a + uShaftColor.rgb * (s * a * uMist.z);
    }
  }
  finalColor = vec4(rgb, a);
}
`;

/**
 * Motes: stateless particles. Each lives in a tile that wraps around the camera, with its own
 * depth (parallax, size, brightness), and lights up when it drifts through a shaft.
 */
export const MOTES_VERT = /* glsl */ `
${MESH_HEAD}
in vec2 aPosition;
in vec4 aSeed;
out vec2 vCorner;
out vec4 vColor;
${SHAFT_GLSL}
uniform vec4 uCam;        // view centre x, y, tile w, tile h
uniform vec4 uMoteLook;   // min radius, max radius, base brightness, lit brightness
uniform vec4 uMoteMove;   // drift x, drift y, swirl, wind sway
uniform vec4 uCool;       // rgb
uniform vec4 uWarm;       // rgb

float windAt(float x, float clock, float phase) {
  float t = clock * 0.9 - x * 0.0016 + phase * 6.283;
  float gust = 0.5 + 0.5 * sin(clock * 0.23 - x * 0.0005);
  return sin(t) * (0.35 + 0.45 * gust) + sin(t * 2.7 + 1.3) * 0.14;
}

void main(void) {
  float t = uAir.x;
  float z = aSeed.z;
  float ph = aSeed.w * 6.2832;
  float r1 = fract(aSeed.w * 7.31);
  float r2 = fract(aSeed.w * 13.77);
  float par = mix(0.72, 1.4, z);
  vec2 tile = uCam.zw;
  vec2 p = aSeed.xy * tile;
  p += vec2(uMoteMove.x * (0.4 + z), uMoteMove.y * (r1 - 0.35)) * t;
  p += vec2(sin(t * 0.31 + ph) + 0.5 * sin(t * 0.83 + ph * 2.0),
            cos(t * 0.27 + ph * 1.7) + 0.5 * sin(t * 0.71 + ph)) * uMoteMove.z * (0.5 + z);
  vec2 rel = mod(p - uCam.xy * par, tile) - tile * 0.5;
  vec2 world = uCam.xy + rel;
  world.x += windAt(world.x, t, r2) * uMoteMove.w * (0.5 + z);

  float lit = shaftAt(world);
  // Nothing floats inside the ground.
  float airborne = smoothstep(-6.0, 30.0, groundY(world.x) - world.y);
  float twinkle = 0.55 + 0.45 * sin(t * (1.2 + 3.0 * r1) + ph * 3.0);
  float radius = mix(uMoteLook.x, uMoteLook.y, z * z) * (0.75 + 0.5 * r2);
  // The nearest ones are out of focus: bigger and fainter.
  float focus = mix(1.0, 0.4, smoothstep(0.72, 1.0, z));
  float bright = (uMoteLook.z * (0.5 + 0.5 * sin(t * 0.4 + ph)) + lit * uMoteLook.w * twinkle) * mix(0.55, 1.0, z) * focus * airborne;
  vColor = vec4(mix(uCool.rgb, uWarm.rgb, clamp(lit * 4.0, 0.0, 1.0)) * bright, 0.0);
  vCorner = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(world + aPosition * radius, 1.0)).xy, 0.0, 1.0);
}
`;

export const MOTES_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vCorner;
in vec4 vColor;
out vec4 finalColor;
void main(void) {
  float d = dot(vCorner, vCorner);
  float a = clamp(1.0 - d, 0.0, 1.0);
  finalColor = vColor * (a * a);
}
`;
