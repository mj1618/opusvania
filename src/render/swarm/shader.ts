/**
 * The swarm's GLSL (memory/swarm.md). One instanced quad per moth; everything about a moth is a
 * pure function of its seeds, the swarm clock (`tau`, since the swarm started) and render time:
 *
 *   vertex   where it is on the path (cycle, feed, density waves, band, wander, darts, loops,
 *            flutter), which way it heads (the velocity of its smooth motion), its wingbeat (two
 *            wing tips seen from a little below and to the side), the moon's direction and halo.
 *   fragment the silhouette as implicit shapes (body, head, fore and hind wings on both sides,
 *            antennae), anti-aliased with fwidth at any size: far moths come out as soft dark
 *            specks that flicker with the beat, near ones as blurred moths. A moon-side rim in
 *            cool silver, moonlight through the wings on the halo, a rare glint. Premultiplied.
 */

/** Uniforms and helpers shared by the moths and the river's haze (one uniform group per layer). */
const COMMON = /* glsl */ `
uniform vec4 uPath[8];  // layer px x, y, band half width, share of the trip before this point
uniform vec4 uClock;    // render clock, tau, base rate (trips/s), release tau
uniform vec4 uFeed;     // ramp in, peak end, decline, tail level
uniform vec4 uFeed2;    // release fade, peak level, gap depth, gap rate
uniform vec4 uFeed3;    // head start, unused x3
uniform vec4 uWaves;    // k1, amp1, k2, amp2
uniform vec4 uWaves2;   // wave speed (x flow), neck amp, neck k, neck rate
uniform vec4 uLook;     // size min, size max, flutter px, blur px
uniform vec4 uBeat;     // beat Hz min, max, detail 0/1, layer alpha
uniform vec4 uView;     // layer camera x, y, zoom, device px per logical px
uniform vec4 uScreen;   // view half w, half h, moon x, moon y (logical view px)
uniform vec4 uMoon;     // disc radius (view px at zoom 1), halo reach (x radius), rim gain, haze
uniform vec4 uBeh;      // dart share, loop share, straggle share, wander amp
uniform vec4 uBeh2;     // dart every min, max, dur, reach
uniform vec4 uBeh3;     // loop every min, max, dur, speed spread
uniform vec4 uBeh4;     // loop radius min, max, straggle lateral, straggle slow
uniform vec4 uBeh5;     // wander rate, heading swing, glint share, glint every
uniform vec4 uBeh6;     // glint dur, glint gain, view tilt (rad: 0 from below, pi/2 side on), flap amplitude (rad)
uniform vec4 uDebug;    // lineup 0/1 (every moth in a still row in front of the camera: shape work), spacing px, unused x2
uniform vec4 uShape;    // per layer: view tilt (rad), body scale, wing-phase waves along the path, share of the beat in that wave

const float TAU = 6.2831853;

float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float noise1(float x) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}

// The feed's envelope (no gaps), 0..1: ramp in, the peak, the thinner tail, dried up after the release.
float feedEnvelope(float tc) {
  if (tc < -uFeed3.x) return 0.0;
  float d = smoothstep(-uFeed3.x, uFeed.x - uFeed3.x, tc);
  d *= 1.0 - (1.0 - uFeed.w / max(uFeed2.y, 1e-3)) * smoothstep(uFeed.y, uFeed.y + uFeed.z, tc);
  d *= 1.0 - smoothstep(uClock.w, uClock.w + uFeed2.x, tc);
  return d;
}

// The feed: how full the stream is for moths entering the path at time tc (0..1).
float feed(float tc) {
  float d = feedEnvelope(tc);
  // Gaps and knots: whole stretches of the river thin out together.
  float g = noise1(tc * uFeed2.w + 17.0) * 0.65 + noise1(tc * uFeed2.w * 2.7 + 3.0) * 0.35;
  d *= 1.0 - uFeed2.z * smoothstep(0.38, 0.72, g);
  return d * uFeed2.y;
}

// The path at trip share w: position, band half width, unit tangent.
vec2 pathAt(float w, out float hw, out vec2 tang) {
  int k = 0;
  for (int i = 1; i < 7; i++) {
    if (w >= uPath[i].w) k = i;
  }
  vec4 p1 = uPath[k];
  vec4 p2 = uPath[k + 1];
  vec2 p0 = k > 0 ? uPath[k - 1].xy : 2.0 * p1.xy - p2.xy;
  vec2 p3 = k < 6 ? uPath[k + 2].xy : 2.0 * p2.xy - p1.xy;
  float f = clamp((w - p1.w) / max(p2.w - p1.w, 1e-5), 0.0, 1.0);
  float f2 = f * f;
  float f3 = f2 * f;
  vec2 pos = 0.5 * ((2.0 * p1.xy) + (-p0 + p2.xy) * f + (2.0 * p0 - 5.0 * p1.xy + 4.0 * p2.xy - p3) * f2
             + (-p0 + 3.0 * p1.xy - 3.0 * p2.xy + p3) * f3);
  vec2 d = 0.5 * ((-p0 + p2.xy) + 2.0 * (2.0 * p0 - 5.0 * p1.xy + 4.0 * p2.xy - p3) * f
             + 3.0 * (-p0 + 3.0 * p1.xy - 3.0 * p2.xy + p3) * f2);
  tang = normalize(d + vec2(1e-4, 0.0));
  hw = mix(p1.z, p2.z, f);
  return pos;
}

`;

export const SWARM_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;      // quad corner, -1..1
in vec4 aA;             // phase on the path, speed 0..1, lateral -1..1, rank 0..1
in vec4 aB;             // seeds 0..1, size 0..1
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

${COMMON}
out vec2 vLocal;        // moth units: 1 = half the wingspan; x forward, y across
out vec4 vFlap;         // upper tip, lower tip, glint, alpha
out vec4 vMoon;         // moon direction (local), halo, on the disc
out vec4 vLook;         // device px per unit, blur in device px, haze, detail
out float vSheen;       // how squarely the wings face the moon this instant (the beat), 0..1
out float vBody;        // body scale (near moths: a fat body)

// A pulse of length dur every [every.x, every.y] s (per moth), as 0..1 progress or -1 when idle.
float pulse(float tau, vec2 every, float dur, float s) {
  float per = mix(every.x, every.y, s);
  float ph = fract(tau / per + s * 7.13) * per;
  return ph < dur ? ph / dur : -1.0;
}

// The moth's smooth motion (no flutter) at swarm time tau. Also returns its trip share and alpha.
vec2 smoothPos(float tau, float rate, float lat, out float w, out float alive, out vec2 tang) {
  float cyc = aA.x + tau * rate;
  float c = floor(cyc);
  w = cyc - c;
  float tc = (c - aA.x) / rate;
  float rank = fract(aA.w + c * 0.6180339);
  alive = step(rank, feed(tc));
  // Density waves travel along the river faster than the flow: knots and necks that move.
  float om = uWaves2.x * uClock.z * TAU;
  float k1 = uWaves.x;
  float k2 = uWaves.z;
  float ws = w + uWaves.y / (TAU * k1) * sin(TAU * k1 * w - om * k1 * tau)
               + uWaves.w / (TAU * k2) * sin(TAU * k2 * w - om * k2 * tau + 1.7);
  ws = clamp(ws, 0.0, 1.0);
  float hw;
  vec2 pos = pathAt(ws, hw, tang);
  vec2 nrm = vec2(-tang.y, tang.x);
  // The band breathes (knots and necks), and each moth wanders across it.
  float neck = 1.0 + uWaves2.y * sin(TAU * (uWaves2.z * ws - uWaves2.w * tau) + aB.x);
  float wander = uBeh.w * (sin(TAU * uBeh5.x * (0.6 + 0.8 * aB.y) * tau + TAU * aB.z)
                 + 0.5 * sin(TAU * uBeh5.x * 2.3 * tau + TAU * aB.x));
  pos += nrm * (lat + wander) * hw * neck;
  vec2 up = vec2(tang.y, -tang.x);
  // Darts: one in twenty shoots off sideways and forward, then falls back in.
  if (aB.x < uBeh.x) {
    float p = pulse(tau, uBeh2.xy, uBeh2.z, aB.y);
    if (p >= 0.0) {
      float b = sin(3.14159 * p);
      b *= b;
      pos += (tang * 0.7 + up * (aB.z < 0.5 ? 0.7 : -0.7)) * uBeh2.w * b;
    }
  } else if (aB.x < uBeh.x + uBeh.y) {
    // Loops: a few curl up and back over the stream and rejoin.
    float p = pulse(tau, uBeh3.xy, uBeh3.z, aB.z);
    if (p >= 0.0) {
      float th = TAU * smoothstep(0.0, 1.0, p);
      float r = mix(uBeh4.x, uBeh4.y, aB.y);
      pos += -tang * r + (cos(th) * tang + sin(th) * up) * r;
    }
  }
  return pos;
}

void main(void) {
  float t = uClock.x;
  float tau = uClock.y;
  bool straggler = aB.x > 1.0 - uBeh.z;
  float rate = uClock.z * mix(1.0 - uBeh3.w, 1.0 + uBeh3.w, aA.y) * (straggler ? uBeh4.w : 1.0);
  float lat = aA.z * (straggler ? uBeh4.z : 1.0);

  float w;
  float alive;
  vec2 tang;
  vec2 pos = smoothPos(tau, rate, lat, w, alive, tang);
  float w0;
  float a0;
  vec2 t0;
  vec2 prev = smoothPos(tau - 0.06, rate, lat, w0, a0, t0);
  vec2 vel = pos - prev;
  // A moth that wrapped this frame would turn round: keep the path's heading instead.
  vec2 dir = (length(vel) > 0.5 && abs(w - w0) < 0.5) ? normalize(vel) : tang;

  float size = mix(uLook.x, uLook.y, pow(aB.w, 1.25));
  float unit = size * 0.5;
  // Flutter: sideways at 2-5 Hz, a bob with the beat. Neighbours never in step.
  vec2 nrm = vec2(-dir.y, dir.x);
  float fz = mix(2.0, 5.0, fract(aB.y * 13.7));
  float fl = sin(TAU * fz * t + TAU * aB.z) + 0.4 * sin(TAU * fz * 1.9 * t + TAU * aB.x);
  // One beat rate per layer (a little jitter) and a wing-phase wave travelling down the river: crests
  // move forward along the flow, so you see which way it goes (a murmuration's ripple).
  float beatHz = mix(uBeat.x, uBeat.y, fract(aB.x * 7.31));
  float beat = TAU * (beatHz * t - uShape.w * uShape.z * w + (1.0 - uShape.w) * aB.y);
  // Now and then a moth glides a few beats, wings held.
  float glide = smoothstep(0.62, 0.86, noise1(t * 0.45 + aB.z * 40.0));
  pos += nrm * uLook.z * (size / uLook.y) * fl * 0.5 + nrm * unit * 0.12 * sin(beat) * (1.0 - glide);
  float head = atan(dir.y, dir.x) + uBeh5.y * (0.6 * sin(TAU * 0.7 * t + TAU * aB.x) + 0.25 * fl);
  if (uDebug.x > 0.5) {
    // The lineup: moth i at a grid place round the layer camera, heading right, always alive.
    float i = float(gl_InstanceID);
    pos = uView.xy + vec2(mod(i, 10.0) - 4.5, floor(i / 10.0) - 2.0) * uDebug.y;
    head = 0.0;
    alive = 1.0;
    w = 0.5;
  }

  // The wingbeat, seen from a little below and to the side (beta): each tip's reach across the body.
  float th = uBeh6.w * sin(beat) * (1.0 - 0.75 * glide);
  float beta = uShape.x;
  float tipU = cos(th - beta);
  float tipL = cos(th + beta);

  // Fade at the ends of the path and while it is not fed.
  float ends = smoothstep(0.0, 0.035, w) * (1.0 - smoothstep(0.965, 1.0, w));
  float a = alive * ends * uBeat.w;

  // The rare glint under the wings.
  float gl = 0.0;
  if (aB.z < uBeh5.z) {
    float p = pulse(t, vec2(uBeh5.w * 0.7, uBeh5.w * 1.4), uBeh6.x, aB.x);
    if (p >= 0.0) gl = sin(3.14159 * p) * uBeh6.y;
  }

  float zoom = uView.z;
  float devUnit = unit * zoom * uView.w;
  float blurDev = uLook.w * zoom * uView.w;
  float pad = (blurDev * 1.5 + 2.0) / max(devUnit, 1e-3);
  vec2 ext = vec2(0.85 + pad, 1.2 + pad);
  vec2 local = aPosition * ext;
  vec2 fwd = vec2(cos(head), sin(head));
  vec2 side = vec2(-fwd.y, fwd.x);
  vec2 layerPos = pos + (fwd * local.x + side * local.y) * unit;

  // The moon: its direction in moth space, its halo here, and whether this moth is on the disc.
  vec2 screen = (pos - uView.xy) * zoom + uScreen.xy;
  vec2 dm = uScreen.zw - screen;
  float dist = length(dm);
  vec2 dn = dm / max(dist, 1e-3);
  float R = uMoon.x * zoom;
  float halo = exp(-pow(dist / (R * uMoon.y), 2.0));
  float disc = smoothstep(R + 3.0, R - 3.0, dist);

  vLocal = local;
  vFlap = vec4(tipU, tipL, gl, a);
  vMoon = vec4(dot(dn, fwd), dot(dn, side), halo, disc);
  vLook = vec4(devUnit, blurDev, uMoon.w, uBeat.z);
  vSheen = 0.5 + 0.5 * sin(beat + 0.9);
  vBody = uShape.y;

  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = a > 0.001 ? vec4((mvp * vec3(layerPos, 1.0)).xy, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const SWARM_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vFlap;
in vec4 vMoon;
in vec4 vLook;
in float vSheen;
in float vBody;
out vec4 o;

uniform vec4 uMoon;     // disc radius, halo reach, rim gain, haze
uniform vec4 uBody;
uniform vec4 uSky;
uniform vec4 uRim;
uniform vec4 uMembrane;
uniform vec4 uGlint;
uniform vec4 uSheen;    // wing sheen toward the moon: gain, floor (share lit when edge-on); rim strength, unused

// Exact distance to a convex quad (iq's polygon), negative inside.
float sdQuad(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
  vec2 v[4] = vec2[4](v0, v1, v2, v3);
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}

float sdEllipse(vec2 p, vec2 r) {
  return (length(p / r) - 1.0) * min(r.x, r.y);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// One side's wings in wing space: u across (0 at the body, 1 at the apex), v along (+ forward).
// A forewing like a swept triangle (straight leading edge, pointed apex, slanted outer margin) over
// a rounder hindwing lobe; the notch between them is what says "moth" at 15 px.
float wing(vec2 q) {
  // A broad forewing (straight costa, rounded apex out past the hindwing) over a smaller round
  // hindwing set back, so the notch between them and the abdomen past them show: a moth, not a fan.
  float fore = sdQuad(q, vec2(0.0, 0.17), vec2(0.96, 0.0), vec2(0.72, -0.34), vec2(0.0, -0.12)) - 0.08;
  vec2 h = q - vec2(0.24, -0.43);
  float c = 0.9;
  float sn = 0.44;
  float hind = sdEllipse(vec2(c * h.x + sn * h.y, -sn * h.x + c * h.y), vec2(0.27, 0.21));
  return min(fore, hind);
}

// The moth: distance-like value (negative inside) in moth units, whether it is wing, and how far out
// along the span this pixel is (0 at the body, 1 at the tip).
float moth(vec2 p, out float wingMask, out float span, out float antMask) {
  float tipU = sign(vFlap.x) * max(abs(vFlap.x), 0.14);
  float tipL = sign(vFlap.y) * max(abs(vFlap.y), 0.14);
  // Wing space: across = p.y / tip (the far side is mirrored), along = p.x. Scaled back to moth units.
  float du = wing(vec2(-p.y / tipU, p.x)) * min(abs(tipU), 1.0);
  // The far wing sits a little further back, so two wings show when they overlap.
  float dl = wing(vec2(p.y / tipL, p.x + 0.09)) * min(abs(tipL), 1.0);
  float dw = min(du, dl);
  span = max(-p.y / tipU, p.y / tipL);
  // Abdomen, thorax, head.
  float bw = vBody;
  // A long abdomen that shows past the hindwings, a thorax, a head.
  float body = sdEllipse(p - vec2(-0.32, 0.0), vec2(0.58, 0.085 * bw));
  body = min(body, sdEllipse(p - vec2(0.1, 0.0), vec2(0.17, 0.11 * bw)));
  body = min(body, length(p - vec2(0.31, 0.0)) - 0.075 * bw);
  if (vLook.w > 0.5) {
    // Feathered antennae, swept back a little.
    float ant = min(sdSeg(p, vec2(0.34, 0.03), vec2(0.6, 0.2)), sdSeg(p, vec2(0.34, -0.03), vec2(0.6, -0.2)));
    antMask = step(ant - 0.028, min(body, dw));
    body = min(body, ant - 0.028);
  } else {
    antMask = 0.0;
  }
  // Far moths: never smaller than a soft dot.
  float dot0 = length(p - vec2(-0.05, 0.0)) - 0.9 / max(vLook.x, 1e-3);
  body = min(body, dot0);
  wingMask = step(dw, body);
  return min(dw, body);
}

float coverage(float d, float blur) {
  float fw = max(fwidth(d), 1e-4);
  float edge = fw * (0.75 + blur);
  return smoothstep(edge, -edge, d);
}

void main(void) {
  if (vFlap.w <= 0.001) discard;
  float wm;
  float span;
  float am;
  float d = moth(vLocal, wm, span, am);
  float blur = vLook.y;
  float a = coverage(d, blur);
  if (a <= 0.002) discard;
  // The moon-side rim: inside the shape, where the next pixel toward the moon is outside.
  vec2 mdir = vMoon.xy;
  float rimW = (1.0 + blur * 0.6) / max(vLook.x, 1e-3);
  float wm2;
  float sp2;
  float am2;
  float d2 = moth(vLocal + mdir * rimW, wm2, sp2, am2);
  // No rim on the antennae: lit, they read as stray glyphs.
  float rim = a * (1.0 - coverage(d2, blur)) * (1.0 - am);
  float halo = vMoon.z;
  float disc = vMoon.w;
  float haze = vLook.z;

  vec3 col = mix(uBody.rgb, uSky.rgb, haze);
  // Moonlight through the thin outer wing, on the halo (not on the body; never above ~30 luma on the disc).
  col += uMembrane.rgb * wm * halo * clamp(span, 0.0, 1.0) * 0.12 * (1.0 - haze);
  // A thin silver edge, the same strength everywhere: near the moon the bright sky behind does the work.
  float rimK = uMoon.z * uSheen.z * (1.0 - 0.85 * disc) * (1.0 - 0.4 * halo);
  // The moon-side half of each wing catches the light as the beat turns it toward the moon.
  float lit = smoothstep(-0.15, 0.85, dot(vLocal, mdir)) * wm * mix(uSheen.y, 1.0, vSheen);
  // Backlit by the moon they stay silhouettes: the sheen is only for the dark sky away from it.
  float away = (1.0 - halo) * (1.0 - halo);
  col = mix(col, uRim.rgb, clamp(lit * uSheen.x * uMoon.z * away * (1.0 - 0.5 * haze), 0.0, 1.0));
  col = mix(col, uRim.rgb, clamp(rim * rimK, 0.0, 1.0));
  col = mix(col, uGlint.rgb, clamp(vFlap.z * wm * (1.0 - disc), 0.0, 1.0));
  float A = a * vFlap.w;
  o = vec4(col * A, A);
}
`;

/**
 * The river's haze: a strip along the path (aPosition = trip share 0..1, side -1..1), as bright as the
 * stream is full there right now (the feed at the time moths now at w entered the path), soft across,
 * patchy along. Moonlit scale dust: it is what lets the river's curve read as one shape against the
 * night sky where single moths are too dark to see. Uses the far layer's uniforms.
 */
export const HAZE_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
${COMMON}
uniform vec4 uHaze;     // strength, width (x band), patch scale, unused
out vec2 vRib;          // side -1..1, strength here

void main(void) {
  float w = aPosition.x;
  float hw;
  vec2 tang;
  vec2 pos = pathAt(w, hw, tang);
  float tau = uClock.y;
  float tc = tau - w / max(uClock.z, 1e-4);
  // The envelope, not the gaps: the veil is the river's bed; the moths make the knots.
  float full = feedEnvelope(tc);
  // Knots and necks, as the moths have them.
  float neck = 1.0 + uWaves2.y * sin(TAU * (uWaves2.z * w - uWaves2.w * tau));
  float ends = smoothstep(0.0, 0.08, w) * (1.0 - smoothstep(0.92, 1.0, w));
  pos += vec2(-tang.y, tang.x) * aPosition.y * hw * uHaze.y * neck;
  vRib = vec2(aPosition.y, full * ends * uHaze.x * (0.6 + 0.4 * noise1(w * uHaze.z - tau * 0.35)));
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(pos, 1.0)).xy, 0.0, 1.0);
}
`;

export const HAZE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vRib;
out vec4 o;
uniform vec4 uRim;
void main(void) {
  float a = exp(-vRib.x * vRib.x * 3.2) * vRib.y;
  o = vec4(uRim.rgb * a, a);
}
`;
