// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 3. The last lamp. A dead city at night, swallowed and dark to the sky, and one old street lamp
 * that still burns. Moths come to it from everywhere; the root has drawn back from its pool of
 * light and stops at its edge like a tide line. Umber glides in among the moths, a dark shape
 * against the halo with her own small warm light. The one permitted neon-ish moment: warm, small.
 *
 * Depth, back to front: sky; the mountain, a smudge far left; three ranks of ruined towers, each
 * paler and softer than the one in front, with fog sheets between; the street's own buildings
 * (the one behind the lamp takes its light); the lamp, the pavement and the root's tide line; the
 * wet road below, holding the lamp in a long broken streak; dark out-of-focus root at the edges.
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { BEAM, FOG, MOUNTAIN, REFLECT, SKY, STEAM } from '../../render/world/bodies';
import type { Composer } from '../../render/world/compose';
import { curtain, donePods, MOUTH, mixHex, pod, podLayers, WARM } from '../../render/world/kit';
import { VIEW_H, VIEW_W } from '../../render/world/layer';
import { blob, glow, vgrad } from '../../render/world/paint';
import { drape, grip, ruin, windowGlows } from '../../render/world/ruin';
import { type Pt, smoothPath, taper, wander } from '../../render/world/tissue';
import type { WorldFrame } from '../types';

/** Pavement top, kerb foot (the road starts there). */
const PAVE = 850;
const ROAD = 878;
/** The lamp: post foot x, lantern centre. */
const LAMP = { x: 1180, head: { x: 1122, y: 404 } };
const SODIUM = 0xffa458;
const SODIUM_HOT = 0xffd6a0;
const SODIUM_PINK = 0xff7a5c;
const POD_GLOW = 0xd8b8c0;

interface Moth {
  rx: number;
  ry: number;
  speed: number;
  ph: number;
  flap: number;
  size: number;
  tilt: number;
  /** Resting on the glass instead of flying. */
  rest: Pt | null;
}

function build(c: Composer): void {
  const rng = prng(9113);
  const R = c.root;
  c.grade = {
    shadow: 0x0a0a1e,
    shadowK: 0.035,
    deep: 0x010208,
    deepK: 0.8,
    saturation: 1.04,
    contrast: 1.06,
    grain: 0.03,
    vignette: 0.28,
    vignetteSoft: 0.6,
    bloom: [0.58, 0.6, 0.65],
  };
  const H = LAMP.head;
  const breathers: ((b: number) => void)[] = [];

  // --- Sky: a dead night, a little lighter low down where the city's haze holds the mountain's glow.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SKY, R);
  sky
    .c(0, 0x020309)
    .c(1, 0x0a0f26)
    .c(2, 0x1e2648)
    .p(3, 780, 0.7)
    .p(4, 300, 720, 360)
    .c(5, 0x2a2238)
    .c(6, 0x3a2c40)
    .c(7, 0x3a3450, 0.6);
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [300, 640, 130, 90],
    [200, 690, 100, 50],
    [410, 690, 110, 44],
    [300, 580, 60, 50],
  ];
  for (const [i, l] of lobes.entries()) mtn.p(i, ...l);
  mtn
    .p(8, 300, 720, 150, 0.01)
    .c(9, 0x9a8a90)
    .c(10, 0x34304a)
    .c(11, 0xd8a8a0)
    .c(12, 0x262a48, 0.5)
    .p(13, 740, 3, 1.8);

  // --- Three ranks of towers. Each rank: ruins with lean, sag and bites; root over their crowns.
  const rank = (
    name: string,
    o: {
      fog: number;
      fogK: number;
      col: number;
      sky: number;
      tops: [number, number];
      w: [number, number];
      gap: [number, number];
      bottom: number;
      blur: number;
      storey: number;
      lit: number;
      seed: number;
      skip?: (x: number) => boolean;
      drapeK: number;
    },
  ) => {
    const pl = c.plane(name, {
      fog: o.fog,
      fogK: o.fogK,
      ramp: [300, o.bottom, -0.08, 0.3],
      mottle: 0.1,
      blur: o.blur,
      lit: 0.35,
      seed: o.seed,
      edge: [8, 0.22, 0.05, 0],
      brush: [0.12, 90, 1.57, 9],
    });
    const g = new Graphics();
    pl.view.addChild(g);
    const roots = c.batch(
      `${name}-roots`,
      { glow: MOUTH.inner, glowK: 0.3, swell: 0.03, sss: POD_GLOW, sssK: 0.1 },
      pl.view,
    );
    const lit: { x: number; y: number; w: number; h: number }[] = [];
    for (let x = -60 + rng() * 40; x < VIEW_W + 40; ) {
      const w = o.w[0] + rng() * (o.w[1] - o.w[0]);
      if (o.skip?.(x + w / 2)) {
        x += w * 0.6;
        continue;
      }
      const top = o.tops[0] + rng() * (o.tops[1] - o.tops[0]);
      const r = ruin(rng, g, {
        x,
        w,
        top,
        bottom: o.bottom,
        color: o.col,
        sky: o.sky,
        lean: (rng() - 0.5) * 30,
        sag: rng() * 14,
        breaks: [1 + Math.floor(rng() * 3), 20 + rng() * 60],
        storey: o.storey,
        win: [w / Math.max(2, Math.round(w / 34)) / 2.6, o.storey * 0.4],
        cols: Math.max(2, Math.round(w / 34)),
        bricked: 0.3,
        broken: 0.15,
        lit: o.lit,
        weather: 0.5,
        clutter: 2,
      });
      lit.push(...r.lit);
      if (rng() < o.drapeK)
        drape(rng, roots, r, {
          color: MOUTH.boneShadow,
          shadow: 0x3a3444,
          glow: 0.3,
          fold: [2, 6],
          lobes: 0.5,
          pours: 1 + Math.floor(rng() * 3),
          pourLen: [60, 300],
          pourW: 4,
          from: rng() * 0.4,
          span: 0.3 + rng() * 0.6,
        });
      x += w + o.gap[0] + rng() * (o.gap[1] - o.gap[0]);
    }
    roots.done();
    const wg = windowGlows(rng, g, lit, POD_GLOW, 0.22);
    pl.view.addChild(wg.view);
    breathers.push(wg.update);
    return pl;
  };
  rank('far3', {
    fog: 0x2e3866,
    fogK: 0.72,
    col: 0x141a36,
    sky: 0x3a4472,
    tops: [90, 380],
    w: [70, 150],
    gap: [-30, 30],
    bottom: 800,
    blur: 3.6,
    storey: 34,
    lit: 0.02,
    seed: 0,
    drapeK: 0.5,
    skip: (x) => x > 200 && x < 420,
  });
  const fogA = c.shader('fog-a', 0, 0, VIEW_W, VIEW_H, FOG, R);
  fogA
    .c(0, 0x2a3260, 0.6)
    .p(1, 700, 120, 0.004, 0)
    .p(2, 200, 520, 780, 860)
    .p(3, 0.35, 0.8, 0.15, 0.15)
    .p(5, H.x, H.y + 100, 380, 0.5)
    .c(6, 0x6a4a3a);
  rank('far2', {
    fog: 0x161c3a,
    fogK: 0.5,
    col: 0x0a0c1a,
    sky: 0x1e2444,
    tops: [180, 470],
    w: [110, 220],
    gap: [10, 90],
    bottom: 810,
    blur: 2,
    storey: 46,
    lit: 0.03,
    seed: 1,
    drapeK: 0.75,
    skip: (x) => x > 180 && x < 360,
  });
  const fogB = c.shader('fog-b', 0, 0, VIEW_W, VIEW_H, FOG, R);
  fogB
    .c(0, 0x1a1c36, 0.55)
    .p(1, 900, 140, 0.004, 0)
    .p(2, 440, 680, 800, 880)
    .p(3, 0.28, 0.85, 0.2, 0.3)
    .p(5, H.x, H.y + 260, 420, 0.75)
    .c(6, 0x6a3a28);

  // --- The street's own buildings: two dark flanks leaning in (each its own plane, rimmed by the
  // corridor's haze on its inner edge) and a low block behind the lamp that takes its light.
  const block = (
    name: string,
    f: { x: number; w: number; top: number; col: number; lean: number; sag: number; storey: number },
    rimDir: [number, number],
    gripSide: -1 | 1 | 0,
    podsAt: readonly (readonly [number, number])[],
  ) => {
    const pl = c.plane(name, {
      fog: 0x0c0e22,
      fogK: 0.14,
      ramp: [420, 880, 0, 0.22],
      amb: 0x707aa8,
      sat: 0.85,
      mottle: 0.22,
      mottleScale: 170,
      lit: 0.9,
      seed: 2 + f.x * 0.01,
      edge: [12, 0.14, 0.14, 0],
      rim: 0x46507e,
      rimK: 0.3,
      rimDir,
      rimW: 6,
      rimLights: 0.8,
      brush: [0.16, 50, 1.5, 7],
      paint: 3,
    });
    const g = new Graphics();
    pl.view.addChild(g);
    const roots = c.batch(
      `${name}-roots`,
      { glow: MOUTH.inner, glowK: 0.35, rim: 0x8a96c0, rimK: 0.25, swell: 0.04, sss: POD_GLOW, sssK: 0.12 },
      pl.view,
    );
    const r = ruin(rng, g, {
      x: f.x,
      w: f.w,
      top: f.top,
      bottom: PAVE,
      color: f.col,
      sky: 0x2c2a44,
      lean: f.lean,
      sag: f.sag,
      breaks: [2, 90],
      storey: f.storey,
      clutter: 3,
      cols: Math.round(f.w / 80),
      win: [28, 42],
      winColor: 0x050409,
      bricked: 0.25,
      broken: 0.16,
      lit: 0.05,
      weather: 0.8,
      shop: true,
    });
    drape(rng, roots, r, {
      color: MOUTH.boneShadow,
      shadow: 0x3a3444,
      glow: 0.4,
      fold: [5, 22],
      pours: 4,
      pourLen: [120, 520],
      pourW: 9,
      from: gripSide === 0 ? 0.6 : 0,
      span: gripSide === 0 ? 0.4 : 1,
    });
    if (gripSide !== 0)
      grip(rng, roots, r, gripSide, {
        color: MOUTH.boneShadow,
        shadow: 0x3a3444,
        glow: 0.35,
        w: 26,
        arms: 5,
        bottom: PAVE,
      });
    curtain(
      rng,
      roots,
      r.roof[0]![0] + 10,
      r.roof[r.roof.length - 1]![0] - 10,
      (x) => r.roofAt(x) + 8,
      [20, 200],
      [3, 8],
      MOUTH.boneShadow,
      0.35,
      [40, 110],
    );
    const pods = podLayers(c, pl.view, 0.3, null);
    for (const [x, st] of podsAt)
      pod(rng, pods, {
        x,
        y: r.roofAt(x) + 6,
        stalk: st,
        len: 52 + rng() * 16,
        w: 16,
        glow: 0.3,
        color: 0x7a6e78,
      });
    roots.done();
    donePods(pods);
    const wg = windowGlows(rng, g, r.lit, POD_GLOW, 0.2);
    pl.view.addChild(wg.view);
    breathers.push(wg.update);
  };
  block(
    'mid-back',
    { x: 720, w: 720, top: 560, col: 0x1e1719, lean: -4, sag: 22, storey: 74 },
    [0.3, -1],
    0,
    [],
  );
  block(
    'mid-left',
    { x: -90, w: 500, top: 10, col: 0x131016, lean: 46, sag: 10, storey: 84 },
    [1, -0.15],
    1,
    [
      [120, 300],
      [250, 150],
    ],
  );
  block(
    'mid-right',
    { x: 1470, w: 520, top: 70, col: 0x120f15, lean: -52, sag: 8, storey: 84 },
    [-1, -0.15],
    -1,
    [
      [1660, 220],
      [1780, 380],
      [1900, 120],
    ],
  );

  // --- The light: a cone down from the lantern, lit dust in it.
  const beam = c.shader('beam', 0, 0, VIEW_W, VIEW_H, BEAM, R);
  beam
    .c(0, SODIUM, 0.34)
    .p(1, H.x, H.y + 20, 0.6, 520)
    .p(2, 0.6, 0.04);
  beam.mesh.blendMode = 'add';

  // --- Near: the pavement and kerb, the lamp, a railing; root carpets everything outside the light.
  const near = c.plane('near', {
    fog: 0x07081a,
    fogK: 0.04,
    mottle: 0.16,
    mottleScale: 140,
    lit: 1.15,
    seed: 3,
    edge: [6, 0.04, 0.1, 0],
    rimLights: 0.9,
    rimW: 3,
    brush: [0.08, 30, 0.1, 5],
  });
  const ground = new Graphics();
  near.view.addChild(ground);
  // Pavement slab, its kerb face, the road below (dark; its wet light is drawn on top).
  ground.poly([-20, PAVE - 3, VIEW_W + 20, PAVE - 1, VIEW_W + 20, ROAD, -20, ROAD]).fill(
    vgrad([
      [0, 0x2c2a40],
      [0.25, 0x17162a],
      [0.7, 0x0f0e1e],
      [1, 0x07070f],
    ]),
  );
  ground.rect(-20, ROAD - 6, VIEW_W + 40, 6).fill({ color: 0x3a3650, alpha: 0.5 });
  ground.rect(-20, ROAD, VIEW_W + 40, VIEW_H - ROAD).fill(
    vgrad([
      [0, 0x0a0a16],
      [0.4, 0x06060e],
      [1, 0x030308],
    ]),
  );
  // In the pool, the paving shows: stones, worn, warm.
  for (let x = LAMP.x - 300; x < LAMP.x + 300; x += 34 + rng() * 10) {
    const k = 1 - Math.abs(x - LAMP.x) / 300;
    ground.rect(x, PAVE - 2, 2, ROAD - PAVE - 8).fill({ color: 0x05050c, alpha: 0.5 * k });
  }
  const nearRoots = c.batch(
    'near-roots',
    { glow: MOUTH.inner, glowK: 0.4, rim: 0xa0a8d0, rimK: 0.35, swell: 0.05, sss: 0xe0b0a0, sssK: 0.14 },
    near.view,
  );
  // The tide line: root comes from both sides along the pavement, piles up, and stops short of the
  // light, its tips curled back from it. Thick at the far ends, thinning toward the pool.
  const clear = 270;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const xs = LAMP.x + sgn * (clear + 120 + rng() * 900);
      const pts = wander(rng, {
        x: xs,
        y: PAVE + 2 + rng() * 14,
        ang: sgn > 0 ? Math.PI : 0,
        len: 200 + rng() * 600,
        step: 8,
        curl: 0.1,
        toward: 0.06,
        towardAng: sgn > 0 ? Math.PI : 0,
      });
      const stop = clear - 30 + rng() * 60;
      const keep: Pt[] = [];
      for (const p of pts) {
        if (Math.abs(p[0] - LAMP.x) < stop) break;
        keep.push(p);
      }
      // Curl back at the tip, away from the light.
      if (keep.length > 3) {
        const [tx, ty] = keep[keep.length - 1]!;
        for (let k = 1; k <= 4; k++) keep.push([tx - sgn * -1 * 0 + sgn * k * 2.5, ty - k * 3]);
      }
      for (const p of keep) p[1] = PAVE + 4 + (p[1] - PAVE - 4) * 0.18;
      if (keep.length > 3)
        nearRoots.strip(keep, taper(1.6 + rng() * 3.6, 0.8, 0.5, rng()), {
          color: rng() < 0.7 ? MOUTH.boneMoon : MOUTH.boneShadow,
          glow: 0.4 * rng(),
          seed: rng(),
        });
    }
    // A heaped fold at the line, where the root has piled against the light.
    const fx = LAMP.x + sgn * (clear + 40);
    nearRoots.strip(
      smoothPath(
        [
          [fx + sgn * 260, PAVE + 6],
          [fx + sgn * 120, PAVE - 8],
          [fx + sgn * 20, PAVE - 14],
          [fx - sgn * 20, PAVE - 2],
        ],
        10,
      ),
      taper(9, 2.5, 0.6, rng()),
      { color: MOUTH.boneMoon, kind: 1, glow: 0.5, seed: rng() },
    );
  }
  // Root crossing the road toward us, in perspective: thin at the kerb, fat by the time it reaches
  // the bottom of the frame; it keeps out of the lamp's streak.
  for (let i = 0; i < 16; i++) {
    const sgn = i % 2 ? 1 : -1;
    const x0 = LAMP.x + sgn * (clear + 60 + rng() * 820);
    const x1 = x0 + (x0 - 1110) * (0.5 + rng() * 0.9);
    const ph = rng() * 6;
    const pts: Pt[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const y = ROAD - 2 + (VIEW_H + 30 - ROAD) * t * t;
      pts.push([x0 + (x1 - x0) * t * t + Math.sin(t * 7 + ph) * 18 * t, y]);
    }
    const w = 0.6 + rng() * 1.2;
    nearRoots.strip(pts, (t) => (1 + t * t * 16 * w) * (0.8 + 0.3 * Math.sin(t * 11 + ph)), {
      color: rng() < 0.5 ? 0x3a3444 : 0x2a2634,
      glow: 0.25,
      seed: rng(),
    });
  }
  nearRoots.done();
  // The lamp: an old cast-iron post with a crook and a lantern.
  const lampG = new Graphics();
  near.view.addChild(lampG);
  const iron = 0x0c0c16;
  const ironLit = 0x4a3428;
  lampG
    .poly([LAMP.x - 22, PAVE, LAMP.x - 14, PAVE - 60, LAMP.x + 14, PAVE - 60, LAMP.x + 22, PAVE])
    .fill(iron);
  lampG.rect(LAMP.x - 16, PAVE - 70, 32, 10).fill(iron);
  lampG.poly([LAMP.x - 8, PAVE - 70, LAMP.x - 5, 470, LAMP.x + 5, 470, LAMP.x + 8, PAVE - 70]).fill(
    vgrad([
      [0, ironLit],
      [0.3, iron],
      [1, iron],
    ]),
  );
  for (const y of [PAVE - 180, 600, 500]) lampG.rect(LAMP.x - 9, y, 18, 6).fill(iron);
  const crook = smoothPath(
    [
      [LAMP.x, 478],
      [LAMP.x - 4, 400],
      [LAMP.x - 26, 352],
      [H.x + 8, 344],
      [H.x - 2, 366],
    ],
    12,
  );
  {
    const f = crook.flat();
    lampG.moveTo(f[0]!, f[1]!);
    for (let i = 2; i < f.length; i += 2) lampG.lineTo(f[i]!, f[i + 1]!);
    lampG.stroke({ color: iron, width: 8, cap: 'round' });
    lampG
      .moveTo(LAMP.x - 4, 420)
      .quadraticCurveTo(LAMP.x - 34, 420, LAMP.x - 28, 388)
      .stroke({ color: iron, width: 3 });
  }
  lampG.poly([H.x - 26, H.y - 30, H.x + 26, H.y - 30, H.x + 12, H.y - 46, H.x - 12, H.y - 46]).fill(iron);
  lampG.rect(H.x - 3, H.y - 54, 6, 10).fill(iron);
  lampG.poly([H.x - 22, H.y - 30, H.x + 22, H.y - 30, H.x + 16, H.y + 22, H.x - 16, H.y + 22]).fill(0xffc890);
  lampG.poly([H.x - 12, H.y - 28, H.x + 12, H.y - 28, H.x + 9, H.y + 20, H.x - 9, H.y + 20]).fill(0xfff0d8);
  lampG.rect(H.x - 1.5, H.y - 30, 3, 52).fill({ color: iron, alpha: 0.8 });
  lampG.poly([H.x - 18, H.y + 22, H.x + 18, H.y + 22, H.x + 8, H.y + 34, H.x - 8, H.y + 34]).fill(iron);
  // A railing along the pavement on the left, bent where something fell on it.
  for (let x = 90; x < 640; x += 26) {
    const bend = Math.max(0, x - 430) * 0.16;
    lampG.rect(x + bend * 0.3, PAVE - 50 + bend, 3, 50 - bend).fill(iron);
  }
  lampG
    .poly([80, PAVE - 52, 430, PAVE - 52, 640, PAVE - 18, 640, PAVE - 14, 430, PAVE - 47, 80, PAVE - 47])
    .fill(iron);
  // A bin on its side by the right flank, a fallen sign.
  lampG.poly([1600, PAVE, 1606, PAVE - 4, 1740, PAVE - 42, 1736, PAVE - 34]).fill(iron);
  lampG.roundRect(1730, PAVE - 78, 70, 44, 3).fill(0x14141f);

  // --- Wet road: the lamp in a long broken streak, the pod-lit windows in faint cold ones.
  const wet = c.shader('wet', 0, 0, VIEW_W, VIEW_H, REFLECT, R);
  wet
    .p(0, H.x, 26, 0.55, 260)
    .p(1, H.x, 90, 0.16, 180)
    .p(2, 280, 60, 0.05, 120)
    .p(3, 1110, 300, 0.26, 320)
    .c(9, 0x4a5490)
    .c(6, SODIUM_HOT)
    .c(7, SODIUM)
    .c(8, 0x8a7aa0)
    .p(12, ROAD + 2, 1, 0.4)
    .c(13, 0x2a2c4a);
  wet.mesh.blendMode = 'add';

  // --- The glow of the lantern itself (additive, under the moths).
  const lampGlow = new Container();
  lampGlow.blendMode = 'add';
  R.addChild(lampGlow);
  const g1 = glow(H.x, H.y - 4, 32, SODIUM_HOT, 0.6);
  const g2 = glow(H.x, H.y, 120, SODIUM, 0.32);
  const g3 = glow(H.x, H.y + 20, 420, SODIUM_PINK, 0.12);
  const g4 = glow(H.x + 10, PAVE + 6, 320, SODIUM, 0.4);
  g4.scale.y *= 0.16;
  lampGlow.addChild(g3, g2, g1, g4);

  // --- Moths: a swarm on orbits round the lantern; a few rest on the glass.
  const moths: Moth[] = [];
  for (let i = 0; i < 46; i++) {
    const r = 30 + rng() ** 1.6 * 300;
    moths.push({
      rx: r,
      ry: r * (0.45 + rng() * 0.5),
      speed: (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6) * (80 / (r + 40)),
      ph: rng() * 6.28,
      flap: 14 + rng() * 10,
      size: 6 + rng() * 6,
      tilt: (rng() - 0.5) * 0.8,
      rest: null,
    });
  }
  for (const [dx, dy] of [
    [-10, -8],
    [8, 6],
    [-4, 14],
  ] as const)
    moths.push({
      rx: 0,
      ry: 0,
      speed: 0,
      ph: rng() * 6,
      flap: 3,
      size: 5,
      tilt: 0,
      rest: [H.x + dx, H.y + dy],
    });
  const mothG = new Graphics();
  R.addChild(mothG);
  const mothGlow = new Container();
  mothGlow.blendMode = 'add';
  R.addChild(mothGlow);
  const specks = moths.map(() => {
    const s = glow(0, 0, 10, SODIUM, 0.2);
    mothGlow.addChild(s);
    return s;
  });

  // --- Umber, gliding in among them: a dark shape against the halo, her own warm light.
  const hero = c.addHero({ x: H.x - 230, y: H.y + 120, scale: 0.6, pose: 'glide', facing: 1 }, R);

  // --- Air: dust in the light, a little steam off the root.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x3a3450, 0.18)
    .p(1, PAVE + 6, 180, 10, 110)
    .p(2, -40, VIEW_W + 40, 80);
  const dust = c.mote(
    rng,
    {
      count: 90,
      x: H.x - 300,
      y: H.y,
      w: 600,
      h: PAVE - H.y,
      vx: 2,
      vy: 5,
      wobble: 10,
      size: [2, 6],
      alpha: [0.1, 0.5],
      color: [SODIUM_HOT, SODIUM],
      twinkle: 0.5,
    },
    R,
  );
  dust.view.alpha = 0.9;

  // --- Foreground: big dark root out of focus at the corners; a case hanging top left.
  const fg = c.plane('fg', {
    fog: 0x030308,
    fogK: 0.3,
    mottle: 0.1,
    blur: 12,
    lit: 0.25,
    seed: 4,
    rimLights: 0.4,
    rimW: 6,
  });
  const fgG = new Graphics();
  fg.view.addChild(fgG);
  for (const [x, y, rx, ry] of [
    [80, 1080, 360, 140],
    [-40, 980, 160, 160],
    [1860, 1060, 300, 170],
    [1990, 920, 140, 220],
  ] as const)
    fgG.poly(blob(rng, x, y, rx, ry, 0.2, 40).flat()).fill(0x050409);
  const fgRoots = c.batch(
    'fg-roots',
    { glow: MOUTH.inner, glowK: 0.15, rim: 0x8a6a60, rimK: 0.35, swell: 0.05 },
    fg.view,
  );
  for (let i = 0; i < 4; i++) {
    const pts = wander(rng, {
      x: -60,
      y: 940 + rng() * 120,
      ang: -0.2 + rng() * 0.2,
      len: 400 + rng() * 300,
      step: 10,
      curl: 0.12,
    });
    fgRoots.strip(pts, taper(34 + rng() * 14, 4, 0.5, rng()), { color: 0x241f28, glow: 0.15, seed: rng() });
  }
  for (let i = 0; i < 3; i++) {
    const pts = wander(rng, {
      x: 1990,
      y: 900 + rng() * 140,
      ang: Math.PI + 0.25 - rng() * 0.3,
      len: 360 + rng() * 260,
      step: 10,
      curl: 0.12,
    });
    fgRoots.strip(pts, taper(36 + rng() * 12, 4, 0.5, rng()), { color: 0x241f28, glow: 0.15, seed: rng() });
  }
  const hang = smoothPath(
    [
      [-60, 40],
      [140, 30],
      [320, -40],
    ],
    12,
  );
  fgRoots.strip(hang, taper(34, 22, 0.4, 0.2), { color: 0x241f28, glow: 0.15, seed: 0.4 });
  const fgPods = podLayers(c, fg.view, 0.2, null);
  pod(rng, fgPods, {
    x: 110,
    y: 40,
    stalk: 70,
    len: 190,
    w: 56,
    color: 0x2a2632,
    sleeperColor: 0x08070c,
    sleeperAlpha: 0.7,
    glow: 0.2,
  });
  fgRoots.done();
  donePods(fgPods);

  // --- Lights: the lamp (strong, warm, a little pink), its pool, Umber.
  const lampL = c.light({ x: H.x, y: H.y, radius: 560, color: SODIUM, intensity: 1.0, scatter: 0.9 });
  const poolL = c.light({
    x: H.x + 10,
    y: PAVE - 10,
    radius: 320,
    color: SODIUM,
    intensity: 0.9,
    scatter: 0.8,
  });
  const L = c.light({ x: 0, y: 0, radius: 200, color: WARM.gold, intensity: 0.6, scatter: 0.4 });
  c.on((t, b) => {
    for (const f of breathers) f(b);
    // It buzzes: a sodium lamp at the end of its life, steady with the odd catch.
    const catchK = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3)) > 0.82 ? 0.85 : 1;
    const fl = (0.97 + 0.03 * Math.sin(t * 31)) * catchK;
    lampL.intensity = 1.0 * fl;
    poolL.intensity = 0.9 * fl;
    g1.alpha = 0.6 * fl;
    g2.alpha = 0.32 * fl;
    g3.alpha = 0.12 * fl;
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.6 * hero.light.k;
    mothG.clear();
    moths.forEach((m, i) => {
      let x: number;
      let y: number;
      let open: number;
      let dir = 1;
      if (m.rest) {
        [x, y] = m.rest;
        open = 0.4 + 0.2 * Math.sin(t * m.flap + m.ph);
      } else {
        const a = m.ph + t * m.speed;
        const wob = Math.sin(t * 2.3 + m.ph * 3) * 12;
        x = H.x + Math.cos(a) * m.rx + wob;
        y =
          H.y +
          10 +
          Math.sin(a) * m.ry * Math.cos(m.tilt) +
          Math.cos(a) * m.rx * Math.sin(m.tilt) +
          Math.sin(t * 3.1 + m.ph) * 8;
        dir = -Math.sin(a) * m.speed >= 0 ? 1 : -1;
        open = Math.abs(Math.sin(t * m.flap + m.ph));
      }
      const d = Math.hypot(x - H.x, y - H.y);
      const lit = Math.max(0, 1 - d / 420);
      const wing = mixHex(0x3a2e30, 0xffe0b8, Math.min(1, lit * 1.3));
      const wing2 = mixHex(0x261c20, 0xd8a070, lit);
      const sz = m.size;
      const k = 0.25 + 0.75 * open;
      // Fore and hind wing each side, swept back, as the flap opens and closes them.
      for (const sgn of [-1, 1]) {
        const ax = x + sgn * sz * 0.15;
        mothG
          .poly([
            ax,
            y - sz * 0.15,
            ax + sgn * sz * 1.15 * k - dir * sz * 0.25,
            y - sz * 0.75,
            ax + sgn * sz * 1.25 * k,
            y - sz * 0.05,
          ])
          .fill(wing);
        mothG
          .poly([
            ax,
            y + sz * 0.05,
            ax + sgn * sz * 0.8 * k,
            y + sz * 0.15,
            ax + sgn * sz * 0.45 * k,
            y + sz * 0.55,
          ])
          .fill(wing2);
      }
      mothG.ellipse(x, y, sz * 0.18, sz * 0.5).fill(mixHex(0x120c10, 0x6a4a3a, lit));
      const s = specks[i]!;
      s.position.set(x, y);
      s.alpha = 0.04 + 0.35 * lit * lit;
    });
  });
}

const frame: WorldFrame = {
  key: 3,
  id: 'lamp',
  title: 'The last lamp',
  tests:
    'The one permitted neon-ish moment: a dead city dark to the sky, one warm lamp, moths from everywhere, root drawn back from its light. Does it stay warm and small, not cyberpunk?',
  build,
};
export default frame;
