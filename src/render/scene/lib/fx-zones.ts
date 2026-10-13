/**
 * The scene's three moods along x (see the background layers): a cool, moonlit, bioluminescent
 * glade on the left, the golden light well in the centre, an older violet-dusk stand on the right.
 * Air and post blend their colours with these weights so the change is never a visible line: air
 * by the world x of each pixel or particle, post by the camera's x.
 */
export const ZONE_EDGES = { left: [1500, 2400], right: [3500, 4400] } as const;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** [left, centre, right], summing to 1. */
export function zoneWeights(x: number): [number, number, number] {
  const l = 1 - smooth(ZONE_EDGES.left[0], ZONE_EDGES.left[1], x);
  const r = smooth(ZONE_EDGES.right[0], ZONE_EDGES.right[1], x);
  return [l, 1 - l - r, r];
}

/** Blend of three numbers by zone weights. */
export function zoneMix(v: readonly [number, number, number], w: readonly [number, number, number]): number {
  return v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
}

/** Blend of three 0xRRGGBB colours by zone weights, as 0..1 floats written to `out[0..2]`. */
export function zoneColor(
  c: readonly [number, number, number],
  w: readonly [number, number, number],
  out: Float32Array | number[],
): void {
  for (let k = 0; k < 3; k++) {
    const sh = 16 - k * 8;
    out[k] = (((c[0] >> sh) & 255) * w[0] + ((c[1] >> sh) & 255) * w[1] + ((c[2] >> sh) & 255) * w[2]) / 255;
  }
}

/** The same weights in GLSL: `vec3 zoneAt(float x)`. */
export const ZONE_GLSL = /* glsl */ `
vec3 zoneAt(float x) {
  float l = 1.0 - smoothstep(${ZONE_EDGES.left[0].toFixed(1)}, ${ZONE_EDGES.left[1].toFixed(1)}, x);
  float r = smoothstep(${ZONE_EDGES.right[0].toFixed(1)}, ${ZONE_EDGES.right[1].toFixed(1)}, x);
  return vec3(l, 1.0 - l - r, r);
}
`;
