// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 5. The kept street at moth scale. The same bus stop as frame 1, seen from Umber's height. The
 * pavement is a land in true perspective: stones set in the concrete are boulders, air holes are
 * craters, lichen rosettes are fields, the slab joints are ravines with moss cushioned in them and a
 * forest of moss stalks along their lips. The bench is a vast iron lattice overhead, its green paint
 * peeling off rust, the case on it as big as a building and breathing pink light down through the
 * lattice. A dropped feed jar lies on its side, its mouth a cave, its glass beaded with condensation.
 * A dead leaf the size of a boat lies on the kerb stone with a beetle on it, a firefly over it. Root
 * crosses the plain like rivers with rootlets, and pours over the kerb, a cliff with a bite broken
 * out of it, the road lost in fog far below. Umber, small and warm, at the cave's mouth.
 */
import { BlurFilter, Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { CASE, FOG, MOUNTAIN, PAVE, SHAFTS, SKY, STEAM } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import { braid, curtain, MOUTH, mixHex, pour, WARM } from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { blob, glow, hgrad, vgrad } from '../lib/paint';
import { drape, ruin, windowGlows } from '../lib/ruin';
import { helix, type Pt, smoothPath, type TissueBatch, taper } from '../lib/tissue';
import { beads, rust } from '../lib/wear';
import type { WorldFrame } from '../types';

/** The plain: far edge (against the glass) and where Umber stands. */
const FAR = 770;
const STAND = 880;
const HORIZON = 600;
/** The ground in perspective: focal px; the street runs toward a vanishing point at x 1430. */
const FOCAL = 900;
const STREET = Math.atan2(1430 - 960, FOCAL);
const CS = Math.cos(STREET);
const SN = Math.sin(STREET);
/** The street's vanishing point x. */
const VPX = 960 + FOCAL * Math.tan(STREET);
/**
 * The kerb: the line W.x = KX on the pavement. The camera hangs a little out over the road, so the
 * kerb's face turns toward us: a cliff KERB_H (eye heights) down to the road.
 */
const KX = -0.9;
const KERB_H = 1.5;
const KERB_SLOPE = KX / CS;
const kerbX = (y: number): number => VPX + KERB_SLOPE * (y - HORIZON);
/** Where the face meets the road, below the kerb's top at screen y. */
const kerbFoot = (y: number): number => HORIZON + (y - HORIZON) * (1 + KERB_H);
/** Pavement world point (W.x across the street, W.y along it, z up; eye height 1) to screen px. */
function toScreen(wx: number, wy: number, z = 0): Pt {
  const cx = wx * CS + wy * SN;
  const cy = -wx * SN + wy * CS;
  const dy = FOCAL / cy;
  return [960 + cx * dy, HORIZON + dy - z * dy];
}
function toWorld(x: number, y: number): Pt {
  const dy = y - HORIZON;
  const cx = (x - 960) / dy;
  const cy = FOCAL / dy;
  return [cx * CS - cy * SN, cx * SN + cy * CS];
}
/** Joints: a slab joint along the street, one across it, and the kerb stone's joint. */
const JOINT_X = -3.6;
const JOINT_Y = 3.0;
const KERB_JOINT = KX - 1.2;
const POD_GLOW = 0xd8b8c0;
/** The jar, lying on its side: mouth (left) ellipse centre, body to the right. */
const JAR = { mx: 640, my: 730, ry: 146, rx: 42, len: 400 };
/** Umber's feet. */
const HX = 560;
/** The bench: seat lip, underside back edge, the leg. */
const SEAT = 300;
const LIP_T = SEAT - 40;
const LIP_B = SEAT + 18;
const UNDER_B = SEAT + 128;
const SX1 = 1330;
/** The shelter's glass ends at its post, on the pavement just short of the kerb. */
const POST = 1206;
const POST_W = 40;
const LEG = 1140;
/** The firefly: where it hovers. */
const FLY = { x: 1330, y: 790 };

function build(c: Composer): void {
  const rng = prng(5507);
  const R = c.root;
  c.grade = {
    shadow: 0x0c0a24,
    shadowK: 0.035,
    deep: 0x030312,
    deepK: 0.8,
    saturation: 1.18,
    contrast: 1.14,
    grain: 0.03,
    vignette: 0.32,
    vignetteSoft: 0.55,
    bloom: [0.5, 0.75, 0.7],
  };
  const breathers: ((b: number) => void)[] = [];

  // --- Sky, the street beyond the shelter, the mountain far off: all small, through the gap at right.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SKY, R);
  sky
    .c(0, 0x020308)
    .c(1, 0x0a0b20)
    .c(2, 0x24203e)
    .p(3, HORIZON, 0.5)
    .p(4, 1640, HORIZON, 300)
    .c(5, 0x342440)
    .c(6, 0x6a4058)
    .c(7, 0x50404e, 0.5);
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [1660, 500, 110, 96],
    [1560, 548, 90, 56],
    [1770, 540, 100, 64],
    [1620, 440, 56, 50],
    [1700, 450, 54, 46],
  ];
  for (const [i, l] of lobes.entries()) mtn.p(i, ...l);
  mtn
    .p(8, 1660, HORIZON, 170, 0.008)
    .c(9, 0xc0a4a4)
    .c(10, 0x2c2440)
    .c(11, 0xf0b0a8)
    .c(12, 0x30304e, 0.4)
    .p(13, HORIZON + 6, 3, 1.6);
  const core = new Container();
  core.blendMode = 'add';
  R.addChild(core);
  const coreG = glow(1660, HORIZON - 6, 50, 0xffd0c8, 0.4);
  core.addChild(glow(1660, HORIZON - 20, 220, 0xa86888, 0.16), coreG);

  // The far side of the street: tiny houses at the horizon, under haze.
  const far = c.plane('far', {
    fog: 0x2e3054,
    fogK: 0.6,
    ramp: [500, HORIZON, -0.05, 0.15],
    mottle: 0.08,
    blur: 1.6,
    lit: 0.3,
    seed: 1,
    edge: [6, 0.2, 0, 0],
  });
  const farG = new Graphics();
  far.view.addChild(farG);
  const farLit: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = POST + 20; x < VIEW_W + 20; ) {
    const w = 30 + rng() * 50;
    const r = ruin(rng, farG, {
      x,
      w,
      top: HORIZON - 30 - rng() * 60,
      bottom: HORIZON + 6,
      color: 0x181a32,
      sky: 0x3a3c5c,
      lean: (rng() - 0.5) * 8,
      peak: rng() < 0.4 ? 10 : 0,
      breaks: [Math.floor(rng() * 2), 14],
      storey: 14,
      cols: Math.max(2, Math.round(w / 14)),
      win: [4, 5],
      lit: 0.2,
      bricked: 0.2,
      broken: 0.1,
      weather: 0.2,
    });
    farLit.push(...r.lit);
    x += w + rng() * 10;
  }
  const farWg = windowGlows(rng, farG, farLit, POD_GLOW, 0.4);
  far.view.addChild(farWg.view);
  breathers.push(farWg.update);

  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x2e3154, 0.55)
    .p(1, 700, 90, 0.006, 0)
    .p(2, HORIZON - 160, HORIZON - 20, HORIZON + 60, HORIZON + 200)
    .p(3, 0.25, 0.85, 0.3, 0.35)
    .p(5, 1660, HORIZON, 260, 0.9)
    .c(6, 0x9a6678);

  // --- Through the shelter's glass: the street as blurred shapes, a hanging case's pink, a lamp.
  const beyond = c.plane('beyond', {
    fog: 0x1e2042,
    fogK: 0.22,
    mottle: 0.06,
    blur: 9,
    lit: 0.2,
    seed: 8,
  });
  const byG = new Graphics();
  beyond.view.addChild(byG);
  byG.rect(-20, -20, POST + 30, FAR + 30).fill(
    vgrad([
      [0, 0x0e0e22],
      [0.55, 0x1e1c3c],
      [1, 0x2c2850],
    ]),
  );
  // Building masses across the road, a lamp post, a slung root with a case on it.
  for (const [x, w, top] of [
    [-20, 260, 120],
    [300, 180, 220],
    [560, 300, 60],
    [930, 220, 180],
    [1180, 200, 90],
  ] as const)
    byG.poly(blob(rng, x + w / 2, top + 400, w * 0.6, 420, 0.08, 20).flat()).fill(0x0a0a1c);
  byG.rect(860, 40, 22, FAR).fill(0x0c0c1c);
  byG.moveTo(-20, 160).bezierCurveTo(300, 260, 700, 260, 1360, 140).stroke({ color: 0x1a1628, width: 26 });
  const beyondGlow = new Container();
  beyondGlow.blendMode = 'add';
  beyond.view.addChild(beyondGlow);
  for (const [x, y, r, col, a] of [
    [250, 300, 90, 0xd07898, 0.32],
    [1010, 260, 70, 0xc87090, 0.28],
    [870, 40, 120, 0xb8a0d8, 0.2],
    [720, 520, 140, 0x8a5aa0, 0.18],
    [120, 600, 160, 0x5a5aa0, 0.16],
    [1240, 520, 110, 0x9a6aa8, 0.16],
  ] as const)
    beyondGlow.addChild(glow(x, y, r, col, a));

  // --- The shelter's glass: grime, condensation beaded and running, a torn timetable, its rail.
  const wall = c.plane('glass', {
    fog: 0x262a46,
    fogK: 0.08,
    mottle: 0.1,
    blur: 1.2,
    lit: 0.7,
    seed: 6,
    brush: [0.06, 120, 1.4, 10],
  });
  const glassG = new Graphics();
  wall.view.addChild(glassG);
  glassG.rect(-20, -20, POST + 30, FAR + 30).fill(
    vgrad([
      [0, 0x2a2848, 0.25],
      [0.6, 0x3a3660, 0.3],
      [0.85, 0x4a4060, 0.55],
      [1, 0x3a3048, 0.85],
    ]),
  );
  // Grime splashed up from the pavement: streaks rising from the rail.
  for (let i = 0; i < 70; i++) {
    const x = rng() * POST;
    const h = 30 + rng() ** 2 * 160;
    glassG
      .poly([x, FAR - 40, x + 6 + rng() * 14, FAR - 40, x + 4, FAR - 40 - h])
      .fill({ color: rng() < 0.6 ? 0x2a2434 : 0x5a5068, alpha: 0.18 + rng() * 0.2 });
  }
  // Reflections: long slanted sheens.
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 300 + rng() * 80;
    glassG.poly([x, -20, x + 60, -20, x - 160, FAR, x - 220, FAR]).fill({ color: 0x8a88b0, alpha: 0.05 });
  }
  // The torn timetable: paper stuck to the glass, half gone, print as grey bars.
  {
    const tx = 880;
    const ty = 450;
    const paper: Pt[] = [
      [tx, ty],
      [tx + 190, ty + 6],
      [tx + 184, ty + 90],
      [tx + 150, ty + 120],
      [tx + 170, ty + 170],
      [tx + 110, ty + 200],
      [tx + 60, ty + 182],
      [tx + 8, ty + 210],
    ];
    glassG.poly(paper.flat()).fill({ color: 0x6e6a80, alpha: 0.75 });
    for (let k = 0; k < 9; k++)
      glassG
        .rect(tx + 16, ty + 22 + k * 18, 60 + rng() * 90 - k * 4, 5)
        .fill({ color: 0x2a2838, alpha: 0.55 });
    glassG.rect(tx + 14, ty + 8, 110, 9).fill({ color: 0x8a3a3a, alpha: 0.6 });
    // A peeled corner curling off the glass.
    glassG
      .poly([tx + 150, ty + 120, tx + 196, ty + 132, tx + 176, ty + 166])
      .fill({ color: 0x8a86a0, alpha: 0.8 });
  }
  // Condensation, denser and bigger low on the glass.
  beads(rng, glassG, 0, POST, 260, FAR - 46, 420, 7);
  // Root climbing the glass from the rail: the Hush feeling its way up the pane.
  const glassRoots = c.batch(
    'glass-roots',
    { glow: MOUTH.inner, glowK: 0.4, rim: 0xa8b8e0, rimK: 0.3, swell: 0.03, sss: POD_GLOW, sssK: 0.15 },
    wall.view,
  );
  for (const x of [40, 300, 470, 820, 1100, 1300])
    pour(
      rng,
      glassRoots,
      x + rng() * 40,
      FAR - 40,
      -Math.PI / 2 + (rng() - 0.5) * 0.7,
      180 + rng() * 280,
      3 + rng() * 3,
      mixHex(MOUTH.boneShadow, MOUTH.boneMoon, rng()),
      0.4,
      2,
      -0.004,
    );
  glassRoots.done();
  // The rail at the glass's foot: an aluminium channel, dull, grit drifted against it.
  glassG.poly([-20, FAR - 44, POST, FAR - 46, POST, FAR + 2, -20, FAR + 4]).fill(
    vgrad([
      [0, 0x8a88a4],
      [0.08, 0x4a4864],
      [0.5, 0x2a2840],
      [1, 0x1a1828],
    ]),
  );
  for (let i = 0; i < 40; i++)
    glassG
      .poly(blob(rng, rng() * POST, FAR - 30 + rng() * 26, 6 + rng() * 30, 3 + rng() * 6, 0.4, 10).flat())
      .fill({ color: rng() < 0.5 ? 0x14121e : 0x3a3448, alpha: 0.5 });
  // The steel post at the glass's edge: paint gone at the foot, a sticker's ghost.
  glassG.rect(POST, -20, POST_W, FAR + 30).fill(
    hgrad([
      [0, 0x1a1a2c],
      [0.3, 0x3a3a58],
      [1, 0x101020],
    ]),
  );
  glassG.rect(POST + 6, FAR - 160, POST_W - 12, 160).fill({ color: 0x4a2a22, alpha: 0.5 });
  glassG.rect(POST + 8, 380, POST_W - 14, 50).fill({ color: 0x6a6a7a, alpha: 0.4 });
  // The crack.
  {
    let x = 200;
    let y = 120;
    glassG.moveTo(x, y);
    for (let i = 0; i < 14; i++) {
      x += 40 + rng() * 60;
      y += (rng() - 0.35) * 70;
      glassG.lineTo(x, y);
    }
    glassG.stroke({ color: 0xc8c6e8, width: 2, alpha: 0.3 });
  }

  // --- The case: its own plane, so its inner light is not dimmed with the bench's steel.
  const casePl = c.plane('case', {
    fog: 0x1a1c34,
    fogK: 0.06,
    mottle: 0.06,
    lit: 0.3,
    seed: 7,
    edge: [10, 0.1, 0, 0],
    sat: 1.15,
  });
  const caseC: Pt = [470, 90];
  const caseS = c.shader('case', 0, -300, 820, 640, CASE, casePl.view);
  {
    const o = 300; // plane y origin offset: plane px = screen px + 300 in y
    caseS
      .p(0, 470, 40 + o, 300, 282)
      .p(1, 3.4, 0, 0, 0.012)
      .p(2, 480, 110 + o, 104, 150)
      .p(3, 392, -24 + o, 62, 66)
      .p(4, 380, 216 + o, 126, 58)
      .p(5, 318, 276 + o, 56, 44)
      .p(6, 430, 120 + o, 96, 30)
      .p(7, 540, 250 + o, 90, 50)
      .p(8, 0.25, 0.3, -0.2, 0.1)
      .p(9, 0.7, 0)
      .p(10, 470, 80 + o, 300, 1.5)
      .c(11, 0xffb8b0)
      .c(12, 0xb8a0b8)
      .c(13, 0x7a3c58, 0.7)
      .c(14, 0xc8d0f0, 0.25)
      .p(15, 12, 0.8, 1, 0);
  }

  // --- The bench: a vast iron ledge overhead, a lattice seat, green paint peeling off rust.
  const bench = c.plane('bench', {
    fog: 0x14162c,
    fogK: 0.12,
    ramp: [200, 800, 0, 0.12],
    amb: 0x8890b8,
    sat: 1.1,
    mottle: 0.16,
    mottleScale: 200,
    lit: 0.9,
    seed: 2,
    edge: [12, 0.08, 0.1, 0],
    rim: 0x7a7aa8,
    rimK: 0.3,
    rimDir: [0.5, -0.86],
    rimW: 5,
    rimLights: 0.8,
    brush: [0.1, 70, 0.0, 8],
    paint: 2,
  });
  const benchG = new Graphics();
  bench.view.addChild(benchG);
  // The underside: the lattice, seen from below, the case's pink coming through its holes.
  const UF = LIP_B - 2;
  benchG.poly([-40, UF + 4, SX1 + 10, UF - 2, SX1 - 30, UNDER_B - 8, -40, UNDER_B]).fill(
    hgrad([
      [0, 0x2a2240],
      [0.12, 0x8a4a68],
      [0.3, 0xc06a84],
      [0.45, 0x9a5070],
      [0.62, 0x3a2a4a],
      [1, 0x1c1c34],
    ]),
  );
  const underGlow = new Container();
  underGlow.blendMode = 'add';
  bench.view.addChild(underGlow);
  const underG = glow(470, UF + 50, 380, 0xe08098, 0.22);
  underGlow.addChild(underG);
  // Rows recede toward the back edge (compressed), and toward the street's middle a little.
  const uy = (v: number): number => UF + (UNDER_B - UF) * (1 - (1 - v) ** 1.6);
  const ux = (s: number, v: number): number => 960 + (s - 960) * (1 - 0.18 * v);
  const lattice = new Graphics();
  bench.view.addChild(lattice);
  const latMask = new Graphics()
    .poly([-40, UF + 4, SX1 + 10, UF - 2, SX1 - 30, UNDER_B - 8, -40, UNDER_B])
    .fill(0xffffff);
  bench.view.addChild(latMask);
  lattice.mask = latMask;
  for (const dir of [1, -1])
    for (let s = -700; s < SX1 + 700; s += 58) {
      for (let k = 0; k < 10; k++) {
        const v0 = k / 10;
        const v1 = (k + 1) / 10;
        lattice
          .moveTo(ux(s + dir * v0 * 250, v0), uy(v0))
          .lineTo(ux(s + dir * v1 * 250, v1), uy(v1))
          .stroke({ color: 0x0a1412, width: 15 * (1 - 0.45 * v0), cap: 'round' });
      }
    }
  // Cross bars and the frame.
  for (const v of [0.35, 0.7]) {
    lattice
      .moveTo(ux(-40, v), uy(v))
      .lineTo(ux(SX1, v), uy(v))
      .stroke({ color: 0x0e1816, width: 14 - v * 8 });
  }
  lattice
    .poly([-40, UNDER_B - 6, SX1 - 30, UNDER_B - 14, SX1 - 30, UNDER_B, -40, UNDER_B + 10])
    .fill(0x0c1412);
  // The lip: a steel edge as thick as she is tall; green paint peeling off rust, bolts like boulders.
  benchG.poly([-40, LIP_T + 6, SX1, LIP_T, SX1 + 10, LIP_B - 4, -40, LIP_B + 4]).fill(
    vgrad([
      [0, 0x5a8a74],
      [0.1, 0x2e5448],
      [0.5, 0x1c3a34],
      [1, 0x0e201e],
    ]),
  );
  const peel = new Graphics();
  bench.view.addChild(peel);
  const rustPatch = (x: number, y: number, w: number, h: number) => rust(rng, peel, x, y, w, h);
  for (let i = 0; i < 22; i++) {
    const x = rng() * SX1;
    const y = LIP_T + 12 + rng() * (LIP_B - LIP_T - 22);
    rustPatch(x, y, 4 + rng() ** 2 * 40, 2 + rng() * 6);
  }
  for (let x = 90; x < SX1; x += 220) {
    const by = (LIP_T + LIP_B) / 2;
    peel.circle(x, by + 4, 12).fill({ color: 0x050808, alpha: 0.6 });
    peel.circle(x, by, 11).fill(0x1c3430);
    peel.circle(x - 3, by - 4, 5).fill(0x7aa090);
    peel.circle(x, by, 11).stroke({ color: 0x7a3a20, width: 2, alpha: 0.8 });
    peel
      .poly([x - 2, by + 10, x + 3, by + 10, x + 1, by + 30 + rng() * 30])
      .fill({ color: 0x7a3a20, alpha: 0.7 });
  }
  // The leg: square cast iron, green over rust, streaked, a foot plate bolted down.
  benchG.poly([LEG - 34, UNDER_B - 20, LEG + 34, UNDER_B - 24, LEG + 38, FAR + 14, LEG - 38, FAR + 18]).fill(
    hgrad([
      [0, 0x0a1210],
      [0.5, 0x163028],
      [0.78, 0x2e5a4a],
      [1, 0x0e1a18],
    ]),
  );
  for (let i = 0; i < 14; i++) {
    const x = LEG - 28 + rng() * 56;
    const y = UNDER_B + rng() * (FAR - UNDER_B - 40);
    rustPatch(x, y, 4 + rng() * 14, 4 + rng() * 10);
  }
  for (let i = 0; i < 10; i++) {
    const x = LEG - 30 + rng() * 60;
    peel.rect(x, UNDER_B + rng() * 100, 2, 60 + rng() * 220).fill({ color: 0x6a3420, alpha: 0.35 });
  }
  benchG.poly([LEG - 74, FAR + 8, LEG + 74, FAR + 4, LEG + 84, FAR + 26, LEG - 84, FAR + 30]).fill(
    vgrad([
      [0, 0x3a5a4e],
      [0.3, 0x1a2a26],
      [1, 0x0c1412],
    ]),
  );
  for (const bx of [LEG - 56, LEG + 56]) {
    peel.circle(bx, FAR + 13, 7).fill(0x2a3a34);
    peel.circle(bx - 2, FAR + 11, 3).fill(0x7a9a8a);
  }
  // Root climbs the leg, spreads under the seat and hangs from its lip.
  const benchRoots = c.batch(
    'bench-roots',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.35, swell: 0.04, sss: POD_GLOW, sssK: 0.16 },
    bench.view,
  );
  {
    const hx = helix(LEG, UNDER_B - 20, FAR + 16, 40, 2.4, 0.6);
    for (const s of hx.front) benchRoots.strip(s, () => 9, { color: MOUTH.boneMoon, glow: 0.5, seed: rng() });
    braid(
      rng,
      benchRoots,
      smoothPath(
        [
          [LEG + 10, FAR + 20],
          [LEG + 24, 600],
          [LEG + 6, 470],
          [LEG - 40, UNDER_B - 30],
          [LEG - 360, UNDER_B - 50],
          [LEG - 700, UNDER_B - 40],
        ],
        16,
      ),
      24,
      8,
      [MOUTH.boneMoon, MOUTH.boneShadow, 0xb4a6a4],
      0.5,
      5,
    );
    curtain(rng, benchRoots, 760, 1300, LIP_B - 2, [16, 70], [2.5, 6], MOUTH.boneShadow, 0.5, [30, 90]);
  }
  // The case has grown onto the seat: a heavy fold of its foot along the lip, gripping over it.
  {
    const lipTop: Pt[] = [];
    for (let x = 150; x <= 790; x += 20) lipTop.push([x, LIP_T + 2 + Math.sin(x * 0.02) * 2]);
    drape(
      rng,
      benchRoots,
      {
        roof: lipTop,
        outline: lipTop,
        lit: [],
        roofAt: () => LIP_T,
        wallAt: (_y: number, side: -1 | 1) => (side < 0 ? 150 : 790),
      },
      {
        color: 0xe0a8a8,
        shadow: 0xa07888,
        glow: 0.8,
        fold: [7, 22],
        pours: 0,
        pourLen: [0, 0],
        pourW: 0,
        lobes: 1.6,
      },
    );
  }
  benchRoots.done();

  // Light falling through the lattice: soft pink blades in the air under the seat.
  const blades = new Container();
  blades.blendMode = 'add';
  R.addChild(blades);
  const bladeG = new Graphics();
  blades.addChild(bladeG);
  for (const [x, w, a] of [
    [210, 60, 0.07],
    [380, 40, 0.09],
    [560, 80, 0.06],
    [720, 36, 0.05],
  ] as const) {
    bladeG.poly([x, UNDER_B - 4, x + w, UNDER_B - 4, x + w * 1.6 + 70, FAR + 40, x + 40, FAR + 40]).fill(
      vgrad([
        [0, 0xe08aa0, a],
        [0.6, 0xc07890, a * 0.3],
        [1, 0xc07890, 0],
      ]),
    );
  }
  bladeG.filters = [new BlurFilter({ strength: 10, quality: 3 })];

  // Shafts of the case's pink coming down through the lattice, dust lit in them.
  const shafts = c.shader('lattice-shafts', 0, 0, VIEW_W, VIEW_H, SHAFTS, R);
  shafts
    .c(0, 0xf0a0c0, 0.44)
    .p(1, 0.22, 1, 54, 0.02)
    .p(2, 640, 1000)
    .p(3, UNDER_B - 10, UNDER_B + 50, FAR - 80, FAR + 60);
  shafts.mesh.blendMode = 'add';
  const shaftDust = c.mote(
    rng,
    {
      count: 70,
      x: 60,
      y: UNDER_B,
      w: 860,
      h: FAR - UNDER_B,
      vx: 2,
      vy: 6,
      wobble: 10,
      size: [2, 7],
      alpha: [0.2, 0.7],
      color: [0xffc0d8, 0xffd8e8, 0xe8a8c8],
      twinkle: 0.6,
    },
    R,
  );
  void shaftDust;

  // --- Mist low on the plain.
  const mist = c.shader('mist', 0, 0, VIEW_W, VIEW_H, FOG, R);
  mist
    .c(0, 0x2a2c4c, 0.5)
    .p(1, 600, 60, 0.01, 0)
    .p(2, FAR - 60, FAR, FAR + 40, FAR + 120)
    .p(3, 0.3, 0.8, 0.4, 0.3)
    .p(5, caseC[0], FAR, 400, 0.5)
    .c(6, 0x9a6a80);

  // --- The road far below the kerb: tarmac with an old double line, lost in fog.
  const road = c.plane('road', {
    fog: 0x2a2c50,
    fogK: 0.05,
    ramp: [HORIZON, HORIZON + 160, 0.85, 0.1],
    mottle: 0.08,
    blur: 2.5,
    lit: 0.4,
    seed: 9,
  });
  const roadS = c.shader('road-tarmac', 0, 0, VIEW_W, VIEW_H, PAVE, road.view);
  roadS
    .p(0, HORIZON, HORIZON + 4, FOCAL, 960)
    .p(1, kerbX(FAR), KERB_SLOPE, 4, STREET)
    .c(2, 0x101018, 0.3)
    .c(3, 0x2e2e3c, 0.6)
    .c(4, 0x08080e, 0.3)
    .c(5, 0x000000, 0)
    .c(6, 0x000000, 0)
    .c(7, 0x2a3a24, 0)
    .p(8, POST + POST_W, FAR + 4, 0)
    .p(9, 99, 99, 0.01, 99)
    .p(11, -1, 2.5, 0.8, 0.5)
    .p(12, 1.1, 0.06, 0.5)
    .c(13, 0xb0943c, 0.55)
    .p(15, 14, 30, 1, 0);

  // Far below on the road: a drain in the gutter, a puddle with the mountain in it, a bottle cap the
  // size of a pond, root crossing the tarmac.
  const roadG = new Graphics();
  road.view.addChild(roadG);
  const onRoad = (wx: number, wy: number): Pt => toScreen(wx, wy, -KERB_H);
  const quad = (x0: number, x1: number, y0: number, y1: number): number[] => [
    ...onRoad(x0, y0),
    ...onRoad(x1, y0),
    ...onRoad(x1, y1),
    ...onRoad(x0, y1),
  ];
  roadG.poly(quad(KX + 0.05, KX + 1.0, 3.2, 4.6)).fill(0x08080e);
  for (let k = 1; k < 9; k++) {
    const wx = KX + 0.05 + k * 0.105;
    const a = onRoad(wx, 3.2);
    const b = onRoad(wx, 4.6);
    roadG.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color: 0x3a3a4c, width: 3 });
  }
  const pud: number[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    pud.push(...onRoad(2.6 + Math.cos(a) * 1.1 * (1 + 0.15 * Math.sin(a * 3)), 8 + Math.sin(a) * 1.6));
  }
  roadG.poly(pud).fill({ color: 0x8a7a9c, alpha: 0.55 });
  {
    const [x, y] = onRoad(1.9, 4.2);
    const r = (y - HORIZON) * 0.12;
    roadG.ellipse(x, y, r, r * 0.3).fill(0x5a2024);
    roadG.ellipse(x, y - r * 0.12, r * 0.9, r * 0.24).fill(0x8a3a34);
    roadG.ellipse(x - r * 0.2, y - r * 0.18, r * 0.4, r * 0.08).fill({ color: 0xc8a0a0, alpha: 0.5 });
  }
  const roadRoots = c.batch('road-roots', { glow: MOUTH.inner, glowK: 0.45, swell: 0.03 }, road.view);
  for (const [wy0, wy1, w] of [
    [3.0, 5.5, 14],
    [6.5, 7.6, 9],
  ] as const) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      pts.push(onRoad(KX + t * 7, wy0 + (wy1 - wy0) * t + Math.sin(t * 9) * 0.2));
    }
    const sp = smoothPath(pts, 3);
    roadRoots.strip(sp, (t) => w * (1 - 0.7 * t), { color: MOUTH.boneMoon, glow: 0.45, seed: rng() });
  }
  roadRoots.done();

  // --- The drop beyond the kerb: fog all the way down.
  const drop = c.shader('drop', 0, 0, VIEW_W, VIEW_H, FOG, R);
  drop
    .c(0, 0x6e62a0, 0.95)
    .p(1, 420, 110, 0.008, -0.012)
    .p(2, 800, 960, VIEW_H + 100, VIEW_H + 200)
    .p(3, 0.35, 0.75, 0.2, 0.35)
    .p(4, 1000, 2400, 200)
    .p(5, 1620, 1060, 360, 0.9)
    .c(6, 0xc0a0d8);
  const drop2 = c.shader('drop-wisps', 0, 0, VIEW_W, VIEW_H, FOG, R);
  drop2
    .c(0, 0x8a88b8, 0.5)
    .p(1, 260, 40, 0.02, 0)
    .p(2, 780, 840, 900, 980)
    .p(3, 0.45, 0.8, 0.3, 0)
    .p(4, 1150, 2400, 120);
  const dropGlow = new Container();
  dropGlow.blendMode = 'add';
  R.addChild(dropGlow);
  dropGlow.addChild(glow(1640, 1060, 520, 0x7a70b0, 0.35));

  // Root's courses over the plain, each ending at the kerb where it pours over.
  const courses: Pt[][] = [
    [
      [-40, 960],
      [240, 930],
      [520, 960],
      [700, 1020],
      [kerbX(1046) - 6, 1046],
    ],
    [
      [-40, FAR + 40],
      [200, FAR + 52],
      [420, FAR + 40],
      [600, FAR + 70],
      [JAR.mx - 60, STAND + 30],
      [JAR.mx + 200, STAND + 50],
      [900, STAND + 62],
      [kerbX(STAND + 76) - 6, STAND + 76],
    ],
  ];
  const courseW = [44, 30];

  // --- The cliff: the kerb's face, granite dropping to the road, fog rising in the canyon below.
  const cliff = c.plane('cliff', {
    fog: 0x3a3a60,
    fogK: 0.04,
    mottle: 0.22,
    mottleScale: 90,
    lit: 1.1,
    seed: 10,
    edge: [8, 0.06, 0.1, 0],
    rim: 0x9a98d0,
    rimK: 0.25,
    rimDir: [0.5, -0.85],
    rimW: 4,
    rimLights: 0.9,
    brush: [0.12, 50, -0.6, 4],
    paint: 2,
  });
  const cliffG = new Graphics();
  cliff.view.addChild(cliffG);
  /** A point on the face: at the kerb top's screen y `y`, fraction f of the way down. */
  const faceAt = (y: number, f: number): Pt => [kerbX(y), HORIZON + (y - HORIZON) * (1 + KERB_H * f)];
  const faceBand = (f0: number, f1: number, y0 = FAR - 2, y1 = 1120): number[] => {
    const out: number[] = [];
    for (let y = y0; y <= y1; y += 8) out.push(...faceAt(y, f0));
    for (let y = y1; y >= y0; y -= 8) out.push(...faceAt(y, f1));
    return out;
  };
  cliffG.poly(faceBand(0, 1)).fill(0x2c2a40);
  // The rounded lip, then the stone darkening down the face.
  for (const [f0, f1, col] of [
    [0, 0.05, 0x7a7896],
    [0.05, 0.1, 0x4a4864],
    [0.1, 0.3, 0x363450],
    [0.55, 1, 0x22203a],
  ] as const)
    cliffG.poly(faceBand(f0, f1)).fill(col);
  // Strata running along it toward the vanishing point, chips, feldspar speckles.
  for (let i = 0; i < 14; i++) {
    const f = 0.1 + i * 0.06 + rng() * 0.03;
    const pts: number[] = [];
    for (let y = FAR; y <= 1120; y += 10) {
      const [x, yy] = faceAt(y, f + (rng() - 0.5) * 0.012);
      pts.push(x, yy);
    }
    cliffG.moveTo(pts[0]!, pts[1]!);
    for (let k = 2; k < pts.length; k += 2) cliffG.lineTo(pts[k]!, pts[k + 1]!);
    cliffG.stroke({ color: i % 2 ? 0x0c0c16 : 0x5a5874, width: 1.2 + rng() * 2.2, alpha: 0.55 });
  }
  for (let i = 0; i < 70; i++) {
    const y = FAR + rng() ** 0.7 * 330;
    const [x, yy] = faceAt(y, 0.06 + rng() * 0.8);
    const r = (y - HORIZON) * (0.01 + rng() * 0.03);
    cliffG
      .poly(blob(rng, x, yy, r * 0.5, r, 0.4, 10).flat())
      .fill({ color: rng() < 0.6 ? 0x0e0e1a : 0x5a5878, alpha: 0.7 });
  }
  for (let i = 0; i < 260; i++) {
    const y = FAR + rng() ** 0.7 * 330;
    const [x, yy] = faceAt(y, rng());
    cliffG.circle(x + (rng() - 0.5) * 4, yy, 0.6 + (y - HORIZON) * 0.006 * rng()).fill({
      color: rng() < 0.5 ? 0xc8a0b0 : 0x08080e,
      alpha: 0.55,
    });
  }
  // The joint between two kerb stones: a dark vertical seam with moss in it.
  {
    const t = toScreen(KX, 4.4);
    const b = toScreen(KX, 4.4, -KERB_H);
    cliffG.moveTo(t[0], t[1]).lineTo(b[0], b[1]).stroke({ color: 0x06060c, width: 6 });
    for (let k = 0; k < 10; k++) {
      const yy = t[1] + (b[1] - t[1]) * rng() * 0.6;
      cliffG
        .poly(blob(rng, t[0] + 3, yy, 6 + rng() * 6, 4 + rng() * 6, 0.5, 10).flat())
        .fill(mixHex(0x1a2420, 0x34442c, rng()));
    }
  }
  // Moss hanging off the lip.
  for (let i = 0; i < 30; i++) {
    const y = FAR + rng() * 330;
    const [x, yy] = faceAt(y, 0.02);
    const w = (y - HORIZON) * (0.03 + rng() * 0.04);
    cliffG
      .poly(blob(rng, x - w * 0.2, yy + w * 0.3, w * 0.5, w * 0.9, 0.5, 12).flat())
      .fill(mixHex(0x1a2020, 0x2e3a2c, rng()));
  }
  const cliffRoots = c.batch(
    'cliff-roots',
    { glow: MOUTH.inner, glowK: 0.5, rim: 0xa8b8e0, rimK: 0.45, swell: 0.045, sss: POD_GLOW, sssK: 0.2 },
    cliff.view,
  );
  /** Root pouring over the lip at kerb-top y and down the face, thinning, branching a little. */
  const pourDown = (y: number, w: number, col: number) => {
    const [x, y0] = faceAt(y, 0);
    const y1 = kerbFoot(y) + 20;
    const lean = (rng() - 0.3) * 30;
    const pts = smoothPath(
      [
        [x - 16, y0 - 6],
        [x + 2, y0 + 4],
        [x + 8 + lean * 0.3, y0 + (y1 - y0) * 0.35],
        [x + lean, y1],
      ],
      12,
    );
    cliffRoots.strip(pts, taper(w, Math.max(1, w * 0.25), 0.4, rng()), {
      color: col,
      glow: 0.5,
      seed: rng(),
    });
    if (w > 4)
      for (let k = 0; k < 2; k++) {
        const i0 = Math.floor(pts.length * (0.2 + rng() * 0.4));
        const [bx, by] = pts[i0]!;
        const side = rng() < 0.5 ? -1 : 1;
        cliffRoots.strip(
          smoothPath(
            [
              [bx, by],
              [bx + side * w * 2, by + 20],
              [bx + side * w * 3 + lean * 0.3, by + (y1 - by) * 0.7],
            ],
            10,
          ),
          taper(w * 0.4, 0.8, 0.3, rng()),
          { color: MOUTH.boneShadow, glow: 0.45, seed: rng() },
        );
      }
  };
  for (const [i, course] of courses.entries()) {
    const [, ey] = course[course.length - 1]!;
    const w = (courseW[i]! * (0.15 + 0.85 * ((ey - FAR) / (VIEW_H - FAR)))) / 1.3;
    pourDown(ey - 4, w, MOUTH.boneMoon);
    pourDown(ey + 6, w * 0.6, MOUTH.boneShadow);
    pourDown(ey + 14, w * 0.4, 0x7a6a74);
  }
  // The leg's root goes straight on over the edge; and lone strands all along the lip.
  pourDown(FAR + 22, 10, MOUTH.boneMoon);
  pourDown(FAR + 30, 6, MOUTH.boneShadow);
  for (let i = 0; i < 9; i++)
    pourDown(FAR + 10 + rng() * 300, 1.5 + rng() * 4, rng() < 0.5 ? MOUTH.boneShadow : 0x7a6a74);
  cliffRoots.done();
  // Fog rising in the canyon, over the face's foot.
  const cliffFog = new Graphics();
  cliff.view.addChild(cliffFog);
  for (let f = 0.2; f < 1; f += 0.04)
    cliffFog
      .poly(faceBand(f, f + 0.04))
      .fill({ color: 0x5e5c88, alpha: Math.min(1, 1.1 * ((f - 0.2) / 0.65) ** 1.3) });

  // --- The plain: the pavement as land, in perspective.
  const plain = c.plane('plain', {
    fog: 0x16183a,
    fogK: 0.03,
    ramp: [FAR, 900, 0.4, 0],
    amb: 0x9a9ac8,
    sat: 1.05,
    mottle: 0.12,
    mottleScale: 160,
    lit: 1,
    seed: 3,
    rim: 0x5a5a88,
    rimK: 0.15,
    rimDir: [0.3, -1],
    rimW: 3,
    rimLights: 0.9,
  });
  const pave = c.shader('pavement', 0, 0, VIEW_W, VIEW_H, PAVE, plain.view);
  pave
    .p(0, HORIZON, FAR, FOCAL, 960)
    .p(1, kerbX(FAR), KERB_SLOPE, 22, STREET)
    .c(2, 0x3e3a52, 0.45)
    .c(3, 0x6a6478, 0.38)
    .c(4, 0x0c0a14, 0.16)
    .c(5, 0x6a7a68, 0.2)
    .c(6, 0x8a5a34, 0.08)
    .c(7, 0x3a5a2c, 1)
    .p(8, 0, 0, 0)
    .p(9, JOINT_X, JOINT_Y, 0.035, KERB_JOINT)
    .c(10, 0x6a5e70, 0.9)
    .p(11, 1, 1, 0.35, 0.8)
    .p(12, 0, 0, 0)
    .c(13, 0, 0)
    .c(14, 0xa8a4c8, 10)
    .p(15, 11, 26, 1.4, 0.5);
  const plainG = new Graphics();
  plain.view.addChild(plainG);
  // Contact shadows: the jar, the leg's foot.
  plainG
    .ellipse(JAR.mx + JAR.len / 2, JAR.my + JAR.ry + 4, JAR.len / 2 + 50, 18)
    .fill({ color: 0x020206, alpha: 0.7 });
  plainG.ellipse(LEG, FAR + 26, 120, 10).fill({ color: 0x020206, alpha: 0.6 });
  // Sand grains as boulders: lit on their far side, a shadow toward us; quartz ones glint.
  const glints = new Container();
  glints.blendMode = 'add';
  const glintList: { s: ReturnType<typeof glow>; ph: number; a: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const wy = 1.95 + rng() ** 1.3 * 3.2;
    const wx = -6 + rng() * 6.2;
    const [x, y] = toScreen(wx, wy);
    if (y < FAR + 4 || x > kerbX(y) - 20 || x < -20) continue;
    const ppu = y - HORIZON;
    const r = (0.012 + rng() ** 2 * 0.05) * ppu;
    const quartz = rng() < 0.3;
    plainG.ellipse(x + r * 0.2, y + r * 0.35, r * 1.3, r * 0.45).fill({ color: 0x020206, alpha: 0.6 });
    plainG
      .poly(blob(rng, x, y - r * 0.5, r, r * 0.75, 0.3, 12).flat())
      .fill(quartz ? 0x8a88a8 : mixHex(0x2a2638, 0x5a4a58, rng()));
    plainG
      .poly(blob(rng, x - r * 0.15, y - r * 0.85, r * 0.6, r * 0.35, 0.3, 10).flat())
      .fill({ color: quartz ? 0xd8d8f0 : 0x8a80a0, alpha: 0.6 });
    if (quartz) {
      const s = glow(x - r * 0.2, y - r * 0.9, 3 + r * 0.6, 0xe8e8ff, 0.5);
      glints.addChild(s);
      glintList.push({ s, ph: rng() * 6.28, a: 0.25 + rng() * 0.5 });
    }
  }
  // Moss stalks along the joints' lips: a forest of setae, each with its capsule.
  const setae = new Graphics();
  plain.view.addChild(setae);
  const stalksAlong = (pts: Pt[], n: number) => {
    for (let i = 0; i < n; i++) {
      const [wx, wy] = pts[Math.floor(rng() * pts.length)]!;
      const ox = wx + (rng() - 0.5) * 0.14;
      const oy = wy + (rng() - 0.5) * 0.14;
      const [x, y] = toScreen(ox, oy);
      if (y < FAR + 2 || y > VIEW_H + 10 || x > kerbX(y) - 10 || x < -10) continue;
      const ppu = y - HORIZON;
      const h = (0.07 + rng() * 0.14) * ppu;
      const lean = (rng() - 0.5) * h * 0.5;
      const tx = x + lean;
      const ty = y - h;
      setae
        .moveTo(x, y)
        .quadraticCurveTo(x + lean * 0.2, y - h * 0.6, tx, ty)
        .stroke({ color: rng() < 0.6 ? 0x7a3a2a : 0x8a6a34, width: Math.max(0.8, ppu * 0.004), alpha: 0.9 });
      const cr = Math.max(1.4, ppu * (0.008 + rng() * 0.006));
      const an = Math.atan2(lean, h) + 0.6 + rng() * 0.6;
      const capX = tx + Math.sin(an) * cr;
      const capY = ty + Math.cos(an) * cr * 0.4;
      setae.ellipse(capX, capY, cr * 1.5, cr * 0.8).fill(0x5a5a2a);
      setae.circle(capX - cr * 0.4, capY - cr * 0.3, cr * 0.5).fill({ color: 0xc8c070, alpha: 0.7 });
    }
  };
  const along = (fixed: 'x' | 'y', v: number, a0: number, a1: number): Pt[] => {
    const out: Pt[] = [];
    for (let k = 0; k <= 60; k++) {
      const a = a0 + ((a1 - a0) * k) / 60;
      out.push(fixed === 'x' ? [v, a] : [a, v]);
    }
    return out;
  };
  stalksAlong(along('x', JOINT_X, 1.9, 5.6), 90);
  stalksAlong(along('y', JOINT_Y, -7, KERB_JOINT), 120);
  stalksAlong(along('x', KERB_JOINT, 1.9, 5.6), 50);
  // Moss cushions against the glass's rail.
  for (let i = 0; i < 26; i++) {
    const x = rng() * POST;
    const w = 14 + rng() * 40;
    plainG
      .poly(blob(rng, x, FAR + 2, w, 6 + rng() * 6, 0.5, 14).flat())
      .fill(mixHex(0x2a3a20, 0x4a6a34, rng()));
  }
  plain.view.addChild(glints);

  // Rivers of root over the plain, with rootlets that run off and grip.
  const rivers = c.batch(
    'rivers',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.45, swell: 0.045, sss: POD_GLOW, sssK: 0.16 },
    plain.view,
  );
  const persp = (y: number): number => 0.15 + 0.85 * ((y - FAR) / (VIEW_H - FAR));
  const river = (pts: Pt[], w: number, col: number, b: TissueBatch = rivers) => {
    const ws = pts.map(([, y]) => w * persp(y));
    b.strip(
      pts,
      (t) => {
        const i = Math.min(ws.length - 1, Math.round(t * (ws.length - 1)));
        return Math.max(0.8, ws[i]! * (0.8 + 0.3 * Math.sin(t * 23 + w)));
      },
      { color: col, glow: 0.5, seed: rng() },
    );
  };
  /** A rootlet that wanders over the ground in world space (so it foreshortens) and forks. */
  const rootlet = (wx: number, wy: number, head: number, len: number, w0: number, depth: number) => {
    const pts: Pt[] = [];
    const ws: number[] = [];
    let x = wx;
    let y = wy;
    let h = head;
    const steps = Math.max(4, Math.round(len / 0.03));
    for (let k = 0; k <= steps; k++) {
      const p = toScreen(x, y);
      if (p[1] < FAR + 2 || p[0] > kerbX(p[1]) - 4) break;
      pts.push(p);
      ws.push(Math.max(0.5, w0 * (1 - k / steps) ** 0.8 * ((p[1] - HORIZON) / 300)));
      h += (rng() - 0.5) * 0.5;
      x += Math.cos(h) * 0.03;
      y += Math.sin(h) * 0.03;
      if (depth > 0 && k > 3 && rng() < 0.06)
        rootlet(x, y, h + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.5), len * 0.5, w0 * 0.55, depth - 1);
    }
    if (pts.length > 2)
      rivers.strip(pts, ws, { color: rng() < 0.5 ? MOUTH.boneShadow : 0x7a6a74, glow: 0.45, seed: rng() });
  };
  for (const [i, course] of courses.entries()) {
    const sp = smoothPath(course, 14);
    river(sp, courseW[i]!, i === 1 ? MOUTH.boneMoon : 0x6a6074);
    river(
      sp.map(([x, y], k) => [x + Math.sin(k * 0.2) * 6, y - 6 * persp(y) + Math.cos(k * 0.15) * 4] as Pt),
      courseW[i]! * 0.4,
      MOUTH.boneShadow,
    );
    // Rootlets: thin, long, forking, pressed to the ground.
    for (let k = 0; k < 9; k++) {
      const p = sp[Math.floor(sp.length * (0.05 + rng() * 0.9))]!;
      if (p[1] < FAR + 6) continue;
      const [wx, wy] = toWorld(p[0], p[1]);
      const side = rng() < 0.5 ? 0 : Math.PI;
      rootlet(wx, wy, side + (rng() - 0.5) * 1.2 + Math.PI / 2, 0.4 + rng() * 0.7, 5 + rng() * 4, 2);
    }
  }
  rivers.done();

  // --- The leaf: a dead plane leaf the size of a boat on the kerb stone, its near edge curled up to
  // show its paler underside, tar spots and holes; a beetle on its far edge.
  const leafPl = c.plane('leaf', {
    fog: 0x16183a,
    fogK: 0.05,
    ramp: [FAR, 900, 0.18, 0],
    amb: 0xd0c8e0,
    sat: 0.95,
    mottle: 0.2,
    mottleScale: 70,
    lit: 1.1,
    seed: 12,
    edge: [6, 0.04, 0.12, 0],
    rim: 0x8a88c0,
    rimK: 0.22,
    rimDir: [0.3, -1],
    rimW: 3,
    rimLights: 0.9,
    brush: [0.1, 24, 0.4, 4],
    paint: 2,
  });
  const leafG = new Graphics();
  leafPl.view.addChild(leafG);
  {
    const LC: Pt = [-3.15, 1.62];
    const L = 1.25;
    const phi = Math.PI + 0.55;
    const d: Pt = [Math.cos(phi), Math.sin(phi)];
    const n: Pt = [-d[1], d[0]];
    const halfW = (u: number) => {
      const base = Math.sin(Math.PI * Math.min(1, u ** 0.8)) ** 0.85;
      const lobes = 1 + 0.12 * Math.sin(u * Math.PI * 5 + 0.6) * Math.sin(Math.PI * u);
      return 0.38 * base * lobes * (1 + 0.04 * Math.sin(u * 70));
    };
    // v > 0 is toward us (smaller W.y): find which side of the midrib that is.
    const nearSign = n[1] < 0 ? 1 : -1;
    const P = (u: number, v: number): Pt => {
      const w = halfW(u);
      const wx = LC[0] + d[0] * (u - 0.5) * L + n[0] * v * w * nearSign;
      const wy = LC[1] + d[1] * (u - 0.5) * L + n[1] * v * w * nearSign;
      const near = Math.max(0, v);
      // Past the kerb's edge it has nothing under it: it droops over the drop.
      const over = Math.max(0, wx - KX);
      const z = 0.012 + 0.07 * near ** 3 + 0.05 * Math.max(0, -v) ** 2 - 0.9 * over * over;
      return toScreen(wx, wy, z);
    };
    const edge = (v: number, u0 = 0, u1 = 1, n = 40): Pt[] => {
      const out: Pt[] = [];
      for (let k = 0; k <= n; k++) out.push(P(u0 + ((u1 - u0) * k) / n, v));
      return out;
    };
    // Its shadow on the stone.
    const shadow: Pt[] = [];
    for (let k = 0; k <= 30; k++) {
      const u = k / 30;
      const w = halfW(u);
      shadow.push(
        toScreen(
          Math.min(KX, LC[0] + d[0] * (u - 0.5) * L + n[0] * w * 1.05),
          LC[1] + d[1] * (u - 0.5) * L + n[1] * w - 0.05,
        ),
      );
    }
    for (let k = 30; k >= 0; k--) {
      const u = k / 30;
      const w = halfW(u);
      shadow.push(
        toScreen(
          Math.min(KX, LC[0] + d[0] * (u - 0.5) * L - n[0] * w * 1.05),
          LC[1] + d[1] * (u - 0.5) * L - n[1] * w - 0.05,
        ),
      );
    }
    leafG.poly(shadow.flat()).fill({ color: 0x020206, alpha: 0.7 });
    // The upper surface.
    const upper = [...edge(-1), ...edge(0.82).reverse()];
    leafG.poly(upper.flat()).fill(0x5a3e2a);
    // Blotches of colour: rust, ochre, a sick green near the stem.
    for (let i = 0; i < 26; i++) {
      const u = 0.08 + rng() * 0.84;
      const v = -0.9 + rng() * 1.6;
      const [x, y] = P(u, v);
      const r = 8 + rng() * 26;
      leafG
        .poly(blob(rng, x, y, r * 1.6, r * 0.6, 0.4, 14).flat())
        .fill({ color: [0x7a5030, 0x6a4a34, 0x3a2a20, 0x4a4a2c][Math.floor(rng() * 4)]!, alpha: 0.55 });
    }
    // Tar spots: black blotches with yellow halos.
    for (let i = 0; i < 6; i++) {
      const [x, y] = P(0.15 + rng() * 0.7, -0.7 + rng() * 1.3);
      const r = 5 + rng() * 9;
      leafG.ellipse(x, y, r * 2.2, r * 0.9).fill({ color: 0x8a7a3a, alpha: 0.45 });
      leafG.poly(blob(rng, x, y, r * 1.3, r * 0.55, 0.4, 10).flat()).fill(0x0a0808);
    }
    // Veins: pale midrib, side veins pressed into the blade.
    const mid = edge(0, 0, 1, 30);
    leafG.moveTo(mid[0]![0], mid[0]![1]);
    for (const p of mid) leafG.lineTo(p[0], p[1]);
    leafG.stroke({ color: 0xb08a5a, width: 5, alpha: 0.9 });
    for (let u = 0.08; u < 0.92; u += 0.075)
      for (const s of [-1, 0.8]) {
        const a = P(u, 0);
        const b = P(u + 0.06, s * 0.5);
        const e = P(u + 0.1, s * 0.95);
        leafG
          .moveTo(a[0], a[1])
          .quadraticCurveTo(b[0], b[1], e[0], e[1])
          .stroke({ color: 0x3a2414, width: 2.5, alpha: 0.75 });
        leafG
          .moveTo(a[0], a[1] - 2)
          .quadraticCurveTo(b[0], b[1] - 2, e[0], e[1] - 2)
          .stroke({ color: 0xa07a50, width: 1, alpha: 0.4 });
      }
    // Holes eaten through it.
    for (const [u, v, r] of [
      [0.32, -0.4, 11],
      [0.55, 0.2, 7],
      [0.7, -0.55, 9],
    ] as const) {
      const [x, y] = P(u, v);
      leafG.poly(blob(rng, x, y, r * 1.8, r * 0.7, 0.35, 12).flat()).fill(0x06060a);
      leafG
        .poly(blob(rng, x, y - 1, r * 1.9, r * 0.8, 0.35, 12).flat())
        .stroke({ color: 0x3a2414, width: 2 });
    }
    // The near edge curled up: its underside, paler, ribbed.
    const curl = [...edge(0.82, 0.04, 0.97), ...edge(1, 0.04, 0.97).reverse()];
    leafG.poly(curl.flat()).fill(0x7a5e40);
    for (let u = 0.08; u < 0.95; u += 0.05) {
      const a = P(u, 0.84);
      const b = P(u + 0.02, 0.99);
      leafG.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color: 0x5a4430, width: 1.5, alpha: 0.35 });
    }
    const rimE = edge(1, 0.04, 0.97);
    leafG.moveTo(rimE[0]![0], rimE[0]![1]);
    for (const p of rimE) leafG.lineTo(p[0], p[1]);
    leafG.stroke({ color: 0xb89a70, width: 2, alpha: 0.6 });
    // The stalk, lifted off the stone.
    const st0 = P(0, 0);
    const stE = toScreen(LC[0] - d[0] * (0.5 * L + 0.16), LC[1] - d[1] * (0.5 * L + 0.16), 0.05);
    leafG
      .moveTo(st0[0], st0[1])
      .quadraticCurveTo((st0[0] + stE[0]) / 2, Math.min(st0[1], stE[1]) - 16, stE[0], stE[1])
      .stroke({ color: 0x4a3420, width: 6 });
    // The beetle, on the leaf's far side, walking toward the tip: in profile, as tall as she is.
    const [bx, by] = P(0.62, -0.45);
    const bk = 1.0;
    const bt = new Graphics();
    bt.position.set(bx, by - 2);
    bt.scale.set(bk);
    // Legs: three on this side, jointed, to the leaf.
    for (const [hx, kx, ky, fx] of [
      [-14, -26, -14, -36],
      [0, -2, -16, 4],
      [14, 26, -14, 36],
    ] as const) {
      bt.moveTo(hx, -12)
        .lineTo(kx, ky - 8)
        .lineTo(fx, 0)
        .stroke({ color: 0x050508, width: 3.2 });
    }
    // Elytra, pronotum, head, antennae.
    bt.ellipse(6, -26, 34, 18).fill(0x07080e);
    bt.ellipse(-30, -24, 13, 12).fill(0x07080e);
    bt.ellipse(-44, -20, 8, 7).fill(0x07080e);
    bt.moveTo(-48, -24).quadraticCurveTo(-62, -48, -76, -50).stroke({ color: 0x07080e, width: 2 });
    bt.moveTo(-47, -25).quadraticCurveTo(-56, -52, -66, -60).stroke({ color: 0x07080e, width: 2 });
    // The sheen on its back: iridescent, green into violet.
    bt.moveTo(-14, -40).quadraticCurveTo(10, -46, 34, -36).stroke({ color: 0x4a8a7a, width: 3, alpha: 0.7 });
    bt.moveTo(-6, -42).quadraticCurveTo(12, -45, 28, -39).stroke({ color: 0x9a7ad0, width: 1.5, alpha: 0.6 });
    bt.moveTo(4, -44).lineTo(6, -9).stroke({ color: 0x1a1c28, width: 1.5 });
    leafPl.view.addChild(bt);
  }

  // --- The jar on its side: green glass beaded with condensation, a peeling label; its mouth a cave.
  const jarPl = c.plane('jar', {
    fog: 0x16183a,
    fogK: 0.04,
    edge: [6, 0.08, 0, 0],
    mottle: 0.08,
    lit: 1.1,
    seed: 11,
    sat: 1.1,
    rimLights: 0.9,
    rimW: 4,
    rim: 0x8a8ac0,
    rimK: 0.2,
    rimDir: [0.3, -1],
    paint: 3,
  });
  const jarG = new Graphics();
  jarPl.view.addChild(jarG);
  const J = JAR;
  const top = J.my - J.ry;
  const bot = J.my + J.ry;
  // Inside, seen through the green glass: dark, a crust of dried feed along the bottom.
  jarG.rect(J.mx, top, J.len, bot - top).fill(
    vgrad([
      [0, 0x2a4440, 0.7],
      [0.25, 0x10201e, 0.78],
      [0.75, 0x0a1414, 0.82],
      [1, 0x1a2a26, 0.85],
    ]),
  );
  jarG.ellipse(J.mx + J.len, J.my, J.rx, J.ry).fill({ color: 0x0c1816, alpha: 0.85 });
  jarG
    .poly([
      J.mx,
      bot - 34,
      J.mx + J.len * 0.4,
      bot - 30,
      J.mx + J.len,
      bot - 44,
      J.mx + J.len,
      bot - 4,
      J.mx,
      bot - 4,
    ])
    .fill({ color: 0x3a2c22, alpha: 0.85 });
  for (let i = 0; i < 30; i++)
    jarG
      .circle(J.mx + 20 + rng() * (J.len - 30), bot - 10 - rng() * 30, 2 + rng() * 6)
      .fill({ color: rng() < 0.5 ? 0x4a3424 : 0x2a1e16, alpha: 0.8 });
  // Inside, in the feed: a moth's wing, all that is left of one who went in before her.
  {
    const wx = J.mx + 250;
    const wy = bot - 34;
    const ca = Math.cos(-0.25);
    const sa = Math.sin(-0.25);
    const W = (pts: readonly number[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < pts.length; i += 2)
        out.push(wx + pts[i]! * ca - pts[i + 1]! * sa, wy + pts[i]! * sa + pts[i + 1]! * ca);
      return out;
    };
    jarG.poly(W([0, 0, 70, -58, 96, -40, 84, -6, 40, 6])).fill({ color: 0x9a8a80, alpha: 0.75 });
    jarG.poly(W([30, 2, 64, -40, 80, -30, 70, -4])).fill({ color: 0x6a5a54, alpha: 0.6 });
    const [ex, ey] = W([66, -22]) as [number, number];
    jarG.circle(ex, ey, 7).fill({ color: 0x2a2026, alpha: 0.8 });
    jarG.circle(ex, ey, 3).fill({ color: 0xc8b8a8, alpha: 0.7 });
    for (const end of [
      [70, -58],
      [92, -38],
      [84, -10],
    ] as const) {
      const [x0, y0, x1, y1] = W([4, 0, end[0], end[1]]) as [number, number, number, number];
      jarG.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0x4a3c3a, width: 1.2, alpha: 0.6 });
    }
  }
  // The label, half torn: paper with a bowl and spoon, its torn edge ragged.
  const LX0 = J.mx + 150;
  const LX1 = J.mx + 300;
  // The label wraps the glass, so its edges are the cylinder's cross-section: half-ellipses bowed
  // toward us. Torn away below on the left.
  const sect = (x: number, a: number): Pt => [x - J.rx * 0.9 * Math.cos(a), J.my + (J.ry - 4) * Math.sin(a)];
  const lab: Pt[] = [];
  for (let k = 0; k <= 16; k++) lab.push(sect(LX1, -Math.PI / 2 + (Math.PI * k) / 16));
  for (let k = 0; k <= 10; k++) {
    const [x, y] = sect(LX1 - ((LX1 - LX0) * k) / 10, Math.PI / 2);
    lab.push([x, y - (k > 4 ? (k - 4) * 14 + rng() * 18 : rng() * 8)]);
  }
  for (let k = 16; k >= 0; k--) {
    const a = -Math.PI / 2 + (Math.PI * k) / 16;
    if (a > 0.3) continue;
    lab.push(sect(LX0, a));
  }
  jarG.poly(lab.flat()).fill({ color: 0x3a3440, alpha: 0.92 });
  for (let i = 0; i < 14; i++)
    jarG
      .poly(
        blob(
          rng,
          LX0 + 10 + rng() * (LX1 - LX0),
          top + 30 + rng() * (bot - top - 90),
          8 + rng() * 26,
          8 + rng() * 20,
          0.4,
          12,
        ).flat(),
      )
      .fill({ color: rng() < 0.5 ? 0x24202c : 0x4a3c3a, alpha: 0.4 });
  // A band of faded red at its top edge, the bowl and spoon, two lines of print: all bowed with it.
  const bowBand = (y0: number, y1: number, col: number, a: number, xa = LX0 + 4, xb = LX1 - 4) => {
    const pts: Pt[] = [];
    const a0 = Math.asin((y0 - J.my) / (J.ry - 4));
    const a1 = Math.asin((y1 - J.my) / (J.ry - 4));
    pts.push(sect(xa, a0), sect(xb, a0), sect(xb, a1), sect(xa, a1));
    jarG.poly(pts.flat()).fill({ color: col, alpha: a });
  };
  bowBand(top + 8, top + 30, 0x6a2c34, 0.75);
  bowBand(J.my + 26, J.my + 32, 0x1e1a24, 0.5, LX0 + 30, LX0 + 140);
  bowBand(J.my + 44, J.my + 49, 0x1e1a24, 0.4, LX0 + 30, LX0 + 100);
  {
    const [cx, cy] = sect((LX0 + LX1) / 2 + 10, -0.1);
    jarG.ellipse(cx, cy, 44, 16).stroke({ color: 0x1e1a24, width: 4, alpha: 0.55 });
    jarG
      .moveTo(cx - 54, cy - 38)
      .lineTo(cx - 4, cy - 8)
      .stroke({ color: 0x1e1a24, width: 4, alpha: 0.55 });
  }
  // The glass: highlights along the top, the far end's rim, the neck's threads, the mouth's lip.
  jarG
    .moveTo(J.mx + 30, top + 14)
    .lineTo(J.mx + J.len - 10, top + 14)
    .stroke({ color: 0xf0c8d0, width: 6, alpha: 0.38 });
  jarG
    .moveTo(J.mx + 60, top + 32)
    .lineTo(J.mx + J.len - 60, top + 32)
    .stroke({ color: 0xd8f0e8, width: 2, alpha: 0.22 });
  jarG
    .moveTo(J.mx + 40, bot - 18)
    .lineTo(J.mx + J.len - 30, bot - 22)
    .stroke({ color: 0x8ab0a0, width: 3, alpha: 0.25 });
  jarG.ellipse(J.mx + J.len, J.my, J.rx, J.ry).stroke({ color: 0xa8c8c0, width: 3, alpha: 0.2 });
  jarG
    .moveTo(J.mx, top)
    .lineTo(J.mx + J.len, top)
    .stroke({ color: 0x9abab0, width: 2.5, alpha: 0.35 });
  jarG
    .moveTo(J.mx, bot)
    .lineTo(J.mx + J.len, bot)
    .stroke({ color: 0x5a7870, width: 2, alpha: 0.5 });
  for (let k = 0; k < 3; k++)
    jarG
      .ellipse(J.mx + 18 + k * 14, J.my, J.rx * 0.95, J.ry * 0.97)
      .stroke({ color: 0xa8c8c0, width: 2, alpha: 0.1 });
  // The glass mirrors the pale wall behind as a soft band along its length.
  jarG.rect(J.mx + 20, top + 40, J.len - 30, 34).fill({ color: 0xb8b0d8, alpha: 0.07 });
  jarG.rect(J.mx + 20, top + 50, J.len - 30, 10).fill({ color: 0xd8d0f0, alpha: 0.06 });
  // Condensation on the cold upper glass: beads that catch the light.
  beads(rng, jarG, J.mx + 50, J.mx + J.len - 10, top + 4, J.my + 30, 160, 6);
  // The mouth: a cave. Black inside, a lip of glass catching her light.
  jarG.ellipse(J.mx, J.my, J.rx, J.ry).fill(0x030308);
  jarG.ellipse(J.mx, J.my, J.rx, J.ry).stroke({ color: 0xc8dcd8, width: 4, alpha: 0.45 });
  jarG.ellipse(J.mx - 2, J.my, J.rx - 8, J.ry - 8).stroke({ color: 0x8aa8a0, width: 2, alpha: 0.3 });

  // --- Umber at the cave's mouth.
  const hero = c.addHero({ x: HX, y: STAND, scale: 0.62, pose: 'stand', facing: 1 }, R);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(HX, STAND, 170, WARM.gold, 0.16);
  const herHalo = glow(HX, STAND - 40, 70, WARM.key, 0.14);
  // Her light inside the mouth, on the glass.
  const herCave = glow(J.mx + 18, J.my + 50, 150, WARM.gold, 0.2);
  const herLip = glow(J.mx - 10, J.my + 100, 90, WARM.key, 0.18);
  her.addChild(herPool, herHalo, herCave, herLip);

  // --- Life: a firefly over the leaf with its trail, a spider's thread with dew, a seed adrift.
  const life = new Container();
  R.addChild(life);
  const flyBody = new Graphics();
  flyBody.ellipse(0, 0, 7, 3.5).fill(0x0a0a10);
  flyBody.ellipse(-6, -1, 3, 3).fill(0x0a0a10);
  flyBody.moveTo(-2, -2).lineTo(-8, -10).lineTo(-2, -4).fill({ color: 0x8a88a8, alpha: 0.4 });
  flyBody.moveTo(2, -2).lineTo(10, -12).lineTo(4, -3).fill({ color: 0x8a88a8, alpha: 0.4 });
  const flyGlow = new Container();
  flyGlow.blendMode = 'add';
  const flyCore = glow(0, 0, 9, 0xfff0b0, 0.95);
  const flyMid = glow(0, 0, 54, 0xffd060, 0.5);
  const flyWide = glow(0, 0, 260, 0xe8a840, 0.2);
  const trail: ReturnType<typeof glow>[] = [];
  for (let k = 0; k < 24; k++) {
    const s = glow(0, 0, 7 - k * 0.2, 0xffd878, 0);
    trail.push(s);
    flyGlow.addChild(s);
  }
  flyGlow.addChild(flyWide, flyMid, flyCore);
  life.addChild(flyGlow, flyBody);
  const flyAt = (t: number): Pt => [
    FLY.x + 46 * Math.sin(t * 0.55) + 14 * Math.sin(t * 1.7),
    FLY.y + 22 * Math.sin(t * 0.9 + 1) + 8 * Math.sin(t * 2.3),
  ];
  // The thread: from the lattice down to just above the leaf, beaded with dew that holds the pink.
  const silk = new Graphics();
  life.addChild(silk);
  const SILK = { x: 1040, y0: UNDER_B - 6, y1: 790 };
  const dew: { y: number; r: number }[] = [];
  for (let y = SILK.y0 + 30; y < SILK.y1; y += 24 + rng() * 40) dew.push({ y, r: 1.5 + rng() * 3 });
  // The seed: a dandelion clock's parachute drifting in the gap, moonlit.
  const seed = new Graphics();
  seed.moveTo(0, 0).lineTo(0, 70).stroke({ color: 0xc8c4d8, width: 1.4, alpha: 0.8 });
  seed.ellipse(0, 82, 3, 12).fill(0x6a6070);
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2;
    const ex = Math.cos(a) * 58;
    const ey = -18 + Math.sin(a) * 12;
    seed.moveTo(0, 0).lineTo(ex, ey).stroke({ color: 0xe0dcf0, width: 0.9, alpha: 0.5 });
    for (let j = 1; j < 4; j++) {
      const t = 0.4 + j * 0.18;
      seed
        .moveTo(ex * t, ey * t)
        .lineTo(ex * t + Math.cos(a + 0.6) * 6, ey * t - 3)
        .stroke({ color: 0xe0dcf0, width: 0.6, alpha: 0.3 });
    }
  }
  const seedC = new Container();
  seedC.addChild(seed);
  seedC.addChild(glow(0, -10, 80, 0x8a88c0, 0.12));
  life.addChild(seedC);
  const seed2 = new Graphics();
  seed2.moveTo(0, 0).lineTo(0, 24).stroke({ color: 0xa8a4c8, width: 1, alpha: 0.6 });
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    seed2
      .moveTo(0, 0)
      .lineTo(Math.cos(a) * 20, -6 + Math.sin(a) * 4)
      .stroke({ color: 0xa8a4c8, width: 0.7, alpha: 0.4 });
  }
  life.addChild(seed2);

  // Fog breathing up out of the drop.
  const rise = c.shader('drop-rise', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  rise.c(0, 0x9a98c8, 0.22).p(1, 960, 260, 10, 120).p(2, 1150, 1980, 120);

  // --- Air: steam off the rivers, spores as big as she is.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x6a6080, 0.16)
    .p(1, FAR + 80, 220, 12, 160)
    .p(2, -40, 1500, 80);
  c.mote(
    rng,
    {
      count: 70,
      x: 0,
      y: 80,
      w: VIEW_W,
      h: 900,
      vx: 4,
      vy: -5,
      wobble: 18,
      size: [5, 20],
      alpha: [0.05, 0.24],
      color: [0xd8ccd8, 0xe8c0c8, 0xb8bcd0],
      twinkle: 0.4,
    },
    R,
  );

  // --- Foreground: grass blades and a weed stem out of focus at the edges, grit at the bottom.
  const fg = c.plane('fg', {
    fog: 0x04040c,
    fogK: 0.05,
    mottle: 0.1,
    blur: 10,
    lit: 0.7,
    seed: 4,
    rimLights: 0.8,
    rimW: 10,
    rim: 0x4a4a80,
    rimK: 0.25,
    rimDir: [0.6, -0.8],
  });
  const fgG = new Graphics();
  fg.view.addChild(fgG);
  const blade = (pts: Pt[], w0: number, w1: number, col: number) => {
    const sp = smoothPath(pts, 16);
    const L: number[] = [];
    const Rr: number[] = [];
    for (let k = 0; k < sp.length; k++) {
      const p = sp[k]!;
      const q = sp[Math.min(sp.length - 1, k + 1)]!;
      const o = sp[Math.max(0, k - 1)]!;
      const tx = q[0] - o[0];
      const ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1;
      const w = w0 + (w1 - w0) * (k / (sp.length - 1)) ** 0.8;
      L.push(p[0] - (ty / tl) * w, p[1] + (tx / tl) * w);
      Rr.push(p[0] + (ty / tl) * w, p[1] - (tx / tl) * w);
    }
    const pts2: number[] = [...L];
    for (let k = Rr.length - 2; k >= 0; k -= 2) pts2.push(Rr[k]!, Rr[k + 1]!);
    fgG.poly(pts2).fill(col);
  };
  // A grass blade rising at the left and bowing over, another at the right against the fog.
  blade(
    [
      [-140, 1140],
      [-40, 760],
      [70, 420],
      [230, 170],
      [380, 120],
      [470, 200],
    ],
    96,
    8,
    0x06070e,
  );
  blade(
    [
      [2000, 1140],
      [1880, 860],
      [1820, 600],
      [1720, 400],
      [1620, 380],
      [1570, 440],
    ],
    64,
    6,
    0x05050a,
  );
  for (const [x, y, rx, ry] of [
    [300, 1110, 240, 90],
    [-40, 1020, 120, 120],
    [1180, 1130, 160, 70],
    [1560, 1120, 120, 60],
  ] as const)
    fgG.poly(blob(rng, x, y, rx, ry, 0.25, 30).flat()).fill(0x05050b);
  // Near spores: big soft discs right at the lens.
  const bokeh = new Container();
  bokeh.blendMode = 'add';
  R.addChild(bokeh);
  for (const [x, y, r, a] of [
    [180, 240, 60, 0.07],
    [1720, 880, 80, 0.06],
    [880, 1010, 50, 0.05],
  ] as const)
    bokeh.addChild(glow(x, y, r, 0xd8c8e8, a));

  // --- Lights: her, the firefly, the case through the lattice, the mountain's core, the drop's fog.
  const L = c.light({ x: 0, y: 0, radius: 300, color: WARM.gold, intensity: 0.9, scatter: 0.5 });
  const flyL = c.light({ x: FLY.x, y: FLY.y, radius: 300, color: 0xffcf6a, intensity: 0.8, scatter: 0.55 });
  const caseL = c.light({
    x: caseC[0],
    y: SEAT - 140,
    radius: 700,
    color: 0xe8b4c0,
    intensity: 0.3,
    scatter: 0.3,
  });
  const underL = c.light({
    x: 470,
    y: UNDER_B + 140,
    radius: 520,
    color: 0xe08ca8,
    intensity: 0.2,
    scatter: 0.25,
  });
  c.light({ x: 1660, y: HORIZON, radius: 500, color: 0xb89aa8, intensity: 0.3, scatter: 0.3 });
  c.light({ x: 1760, y: 980, radius: 520, color: 0x9a98d8, intensity: 0.35, scatter: 0.3 });
  c.on((t, b) => {
    for (const f of breathers) f(b);
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.6 * hero.light.k;
    herHalo.position.set(hero.light.x, hero.light.y);
    herHalo.alpha = 0.16 * hero.light.k;
    herPool.alpha = 0.15 + 0.02 * Math.sin(t * 3.1);
    caseL.intensity = 0.22 + 0.14 * b;
    underL.intensity = 0.14 + 0.12 * b;
    underG.alpha = 0.16 + 0.12 * b;
    coreG.alpha = 0.3 + 0.25 * b;
    // The firefly: hovering, its glow pulsing on its own slow rhythm (not the Hush's).
    const [fx, fy] = flyAt(t);
    const pulse = 0.65 + 0.35 * Math.sin(t * 2.2) ** 2;
    flyBody.position.set(fx, fy);
    flyBody.rotation = 0.25 * Math.sin(t * 0.55 + 1.2);
    flyCore.position.set(fx + 4, fy + 1);
    flyMid.position.set(fx + 4, fy + 1);
    flyWide.position.set(fx + 4, fy + 1);
    flyCore.alpha = 0.95 * pulse;
    flyMid.alpha = 0.5 * pulse;
    flyWide.alpha = 0.2 * pulse;
    for (const [k, s] of trail.entries()) {
      const [tx, ty] = flyAt(t - (k + 1) * 0.06);
      s.position.set(tx + 4, ty + 1);
      s.alpha = 0.45 * (1 - k / trail.length) ** 1.5;
    }
    flyL.x = fx;
    flyL.y = fy;
    flyL.intensity = 0.8 * pulse;
    // The silk sways a little; its dew holds the case's pink.
    const sway = 6 * Math.sin(t * 0.7);
    silk.clear();
    silk
      .moveTo(SILK.x, SILK.y0)
      .quadraticCurveTo(SILK.x + sway * 0.6, (SILK.y0 + SILK.y1) / 2, SILK.x + sway, SILK.y1);
    silk.stroke({ color: 0xd8c8e0, width: 1, alpha: 0.35 });
    for (const dw of dew) {
      const k = (dw.y - SILK.y0) / (SILK.y1 - SILK.y0);
      const x = SILK.x + sway * (k * k * 0.4 + k * 0.6);
      silk.circle(x, dw.y, dw.r).fill({ color: 0x3a2a40, alpha: 0.5 });
      silk.circle(x - dw.r * 0.3, dw.y - dw.r * 0.3, dw.r * 0.5).fill({ color: 0xffd8e8, alpha: 0.8 });
    }
    silk.circle(SILK.x + sway, SILK.y1 + 4, 4).fill(0x0a0a10);
    // Seeds adrift.
    seedC.position.set(1560 + 30 * Math.sin(t * 0.15) + t * 3, 330 + 16 * Math.sin(t * 0.4));
    seedC.rotation = 0.12 * Math.sin(t * 0.5);
    seed2.position.set(1720 + 20 * Math.sin(t * 0.2 + 2), 240 + 10 * Math.sin(t * 0.33));
    for (const gl of glintList) gl.s.alpha = gl.a * Math.max(0, Math.sin(t * 1.3 + gl.ph)) ** 6;
  });
}

const frame: WorldFrame = {
  key: 5,
  id: 'moth',
  title: 'The kept street, at moth scale',
  tests:
    'The same bus stop from Umber’s height: a lattice bench as a sky, a case as big as a building, a jar as a cave, a leaf as a boat, moss as a forest, the kerb a cliff. Does smallness read, and is it still the kept street?',
  build,
};
export default frame;
