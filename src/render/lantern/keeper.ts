/**
 * The Keeper's den, staged (the Canopy r12, docs/design/levels/canopy-moments.md moment 6; the sim's names in
 * memory/canopy.md "The Keeper"): everything in the den that is the fight's light and the moths' story, not the
 * creature's body (enemies/: its coat, its death roll, its carcass) and not the cage itself (lamps.ts).
 *
 *   light     the great cage is the den's one light: a warm pool on the back, and every root column, shelf, the
 *             Keeper and her thrown onto the banks behind them, displaced away from it (shadow = point + (point -
 *             light) x `shadow.k`). Hung (P1) the shadows are faint; swinging (P2: `boss.swingT`) they sweep the
 *             back every swing and the den goes dark outside the light (the dark is safe: it must read); on the
 *             floor (P3: `cageFall`) the den is lit from below and the shadows climb the roof.
 *   moth      the falling moth (`boss.moth`: 1 the flutter out of the orbit, 2 the fall, 3 on the floor): a pale
 *             fleck spiralling down 600 px; `enemyFeed` (the snap from the dark) takes it; saved moths
 *             (`mothSaved`) cling round her; `mothEaten` a puff of scales.
 *   low       P3's low cloud: the spilled moths circling dazed over the floor round the fallen cage, `boss.left`
 *             of them (the count is the density); a cut's third (`cageRelease`) rises out of reach to the roof.
 *   column    the great release: the cloud rises in a column straight up to the roof's root gate and out up the
 *             shaft (not the swirl round her: lamps.ts hands its moths over).
 *   moonbeam  the roof's gate open (`den-roof`): moonlight down the shaft onto the floor, motes in it; the den's first
 *             real light, for good after.
 *   collapse  the ending's fallback (`denCollapse`): grit pouring off the roof's edges, the rubble's dust.
 *
 * Render only: reads the sim view (`sim.boss` as the Keeper's fields, read loosely: the sim lane lands them), never
 * writes it.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { flameAt } from '../../sim/lures';
import type { Lure } from '../../sim/scene';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import { sweepRead } from '../enemies/keeper-tells';
import type { LightRegistry, PointLight } from '../lights';
import type { SceneContext } from '../scene/index';
import { type LarderRoot, oldCage, wingPts } from '../scene/lib/den-larder';
import { type DenColumn, denColumnsOf, interiorPlan, larderRootsOf } from '../scene/lib/interior';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';
import { releaseGreat } from './release';

export const KEEPER = {
  /**
   * A cut it shrugs off (`keeperGlance`, any reason; r15 fixes: ~15 cuts at its gates read as cuts that vanished): a
   * white-hot clang star where the blade met the shell (`rays` px long, gone in `star` s), `sparks` thrown back the
   * way the blade came, a short pale ring. With the rig's pale outline (burrback.ts `shellFlash`) and her hitstop it
   * reads as a glance: the blade rang off.
   */
  glance: { star: 0.13, rays: 74, core: 22, sparks: 12, sparkSpeed: 520, ring: 0.26, haze: 0.2 },
  /** The cage's light on the back: its colour, the pool's reach (px) and strength by phase (hung, swinging, fallen). */
  light: { color: 0xffb06a, reach: 760, pool: [0.1, 0.2, 0.26] as const },
  /**
   * The shadows: how far behind its caster the back is (shadow = P + (P - L) * k), how dark by phase (hung, swinging,
   * fallen), the penumbra's spread (x the caster's width), and how far from the light a caster still throws one.
   */
  shadow: {
    k: 0.55,
    alpha: [0.3, 0.62, 0.55] as const,
    soft: 0.6,
    reach: 1900,
    color: 0x0a0604,
    /** The larder's roots (den-larder.ts): a rib lies on the wall (its shadow stays close), a hanging root swings. */
    rib: 0.12,
    hang: 0.4,
  },
  /**
   * The floor's litter (canopy review r12 #3, story litter): a drift of dead wings under the cage (`wings` of them in
   * `spread` px either side, up to `mound` px deep at its middle), gnawed husks along the floor, an old cage on its
   * side by each wall. Colours: the wings' ash and dark, the husks.
   */
  // (r14, review r13 #8: at play zoom the litter was a line of grit. The drift is 300+ px wide and a few wings deep with
  // wings 10-24 px, and a heap of old cages (`heap` of them, `heapH` px) stands by the west wall: a larder's floor.)
  litter: {
    wings: 260,
    spread: 380,
    mound: 26,
    wingL: [10, 24] as const,
    heap: 3,
    heapH: [150, 230] as const,
    heapAt: 150,
    ash: 0x7c6e5e,
    dark: 0x2e241c,
    husks: 7,
    husk: 0x241a14,
    huskLit: 0x6a5240,
  },
  /**
   * The dark outside the light (P2 / P3): behind the playfield and over it (so she, the Keeper and the floor fall
   * into it too, less), the hole's radius round the cage (px; fallen: wider than tall, from the floor), in / out (s).
   */
  dark: { back: 0.62, front: 0.3, r: 720, fallen: [1100, 820] as const, in: 1.2, out: 2.5, color: 0x050208 },
  /** The falling moth: its size (px half span), pale; the tell's flutter (px), the saved moths' orbit (px). */
  // (Review r12 #10: at 9 px it was a fleck easy to miss against the lit cage: 15, and a pale trail behind its fall.)
  moth: { size: 15, color: 0xe8e0cc, tell: 26, saved: [46, 30] as const, savedMax: 14, trail: 5 },
  /** P3's low cloud: drawn moths at most, its ellipse round the fallen cage (px), how low over the floor. */
  low: { max: 90, rx: 520, ry: 110, over: 110, size: [6, 10] as const, color: 0xf0d8b0 },
  /**
   * The column (canopy review r13 #1: "a thin dotted diagonal"): the great release rises STRAIGHT UP off the fallen
   * cage into the moonbeam through the roof over it, a dense column `w` px wide narrowing to `funnel` at the roof.
   * At least `n` moths whatever the count (a density floor; more with more saved, up to `max`), launched over
   * `launch` s, rising at `speed` px/s with a slow helix (`helix` px): in frame >= 3 s. Gold out of the cage, silvered
   * in the beam. A partial release (P3's `cageRelease`) rises the same way, thinner, to the roof.
   */
  column: {
    n: 170,
    max: 240,
    launch: 2.8,
    speed: [230, 320] as const,
    w: 250,
    funnel: 110,
    helix: 22,
    /** Near moths (`near` of them): wings `size` px, beating `beat` rad/s; the rest are `speck` px, deep in it. */
    size: [13, 19] as const,
    speck: [5, 8] as const,
    near: 0.62,
    beat: [10, 15] as const,
    color: 0xffe9c4,
    cool: 0xe6ecff,
  },
  /**
   * After the kill (review r13 #1, "the cage hidden under the carcass, nothing points"): the fallen cage's light swells
   * back to its P1 brightness and beckons (a slow pulse), and what is left of its moths lifts to head height and
   * circles it, tighter. `pool` / `beacon` alpha, the pulse's rate, the cloud's height over the floor and its radius.
   */
  after: { pool: 0.24, beacon: 0.2, pulse: 2.2, over: 210, rx: 230, in: 1.4 },
  /**
   * The anchor's moonlight (review r13 #1: "the moonbeam is at the far east, over the rubble, not over the cloud"): the
   * roots that held the cage's chain in the roof part as it is freed, a ragged hole opens over the cage (`hole` px wide,
   * the night's sky in it) and moonlight falls straight down it onto the column and the floor: the real light where the
   * false one hung. Opens `at` s after the release, grows in over `in` s; for good after (`cn-den-freed`).
   */
  anchor: {
    at: 0.5,
    in: 1.6,
    hole: 300,
    /** How far up into the roof the torn hole reaches (px), its sky, the moonlit cloud and how fast it drifts (px/s). */
    deep: 150,
    w0: 220,
    w1: 480,
    sky: 0x17243f,
    skyMid: 0x5f78a4,
    skyCore: 0xdce6ff,
    cloud: 0x8696b4,
    cloudDrift: 9,
    roots: 8,
    /** The beam's three nested bands (additive alpha), how much they fade down its length, its glow, the floor's pool. */
    bands: [0.06, 0.07, 0.09] as const,
    fade: 0.6,
    glow: 0.1,
    pool: 0.2,
    /** How far a moth in it is silvered (0..1): the moths stay warm-pale and brighter than the beam. */
    silver: 0.35,
  },
  /** The moonbeam down the shaft: its colour, alpha, width at the gate and at the floor (px), the light's reach. */
  // (Review r12 #7: at 0.15 a faint pale band that read as fog. Now the den's brightest thing once the roof is open: a
  // cool shaft with a hard core, dust lit in it, the slope it lands on washed with it, the column silvered in it.)
  moon: {
    color: 0xcfe0ff,
    core: 0xeef4ff,
    alpha: 0.22,
    shaft: [0.1, 0.13, 0.2] as const,
    w0: 190,
    w1: 420,
    light: 1300,
    intensity: 1.15,
    in: 2.2,
    motes: 60,
    /** The wash down the slope it lands on (px west of the shaft, how far down), its alpha. */
    wash: [900, 700] as const,
    washA: 0.14,
  },
  /**
   * P3's sweep told (review r13 #2: its tell was the eat pose): its claws raised over its reared front, rimmed amber,
   * trembling (`len` x its drawn height, `rim`); a lit arc on the floor where they will land (the sim's claw box),
   * raked by three scores, brightening through the tell; dust lifting off the floor in it (`dust` a second).
   */
  sweep: { len: 0.95, rim: 0xffa040, dark: 0x0e0806, arc: 0xff9a40, dust: 40, drawK: 1.3 },
  /**
   * The slam's floor wave (review r13 #6: "unreadable in the dark"): a lit crack runs along the floor behind each front
   * at the wave's speed (`color`, brightest at the front, fading `fade` s after), dust kicked up off the front, and the
   * floor's rim flashes across the arena for `flash` s as it lands.
   */
  /** The floor wave: its colours, fade (s), the landing's flash; r15: the tell's red rim, the front's lip height (px). */
  wave: {
    color: 0xffb060,
    hot: 0xffe0a0,
    fade: 1.1,
    flash: 0.2,
    flashA: 0.3,
    dust: 70,
    tell: 0xff4a30,
    lip: 34,
    /**
     * The seam (r15 fixes: the tell's fissures read as a dashed line at play zoom, and the 12-frame delay as the slam
     * being over): one continuous glowing split along the floor over the wave's whole reach, from the rear until the
     * fronts have run it, light travelling out along it (`pulse` px apart, `pulseSpeed` px/s; through the delay and
     * ahead of the fronts it races), dust kicked up off it (`dust` puffs/s over its length).
     */
    seam: {
      width: 8,
      halo: 26,
      glowR: 70,
      glowA: 0.55,
      glowStep: 48,
      pulse: 260,
      pulseSpeed: 520,
      raceSpeed: 1500,
      dust: 120,
    },
  },
  /** The ending's dust: grains per second along the roof while it groans, their colour. */
  dust: { rate: 60, color: 0x6a5a48 },
};

/** The Keeper's fields on the boss state (the sim lane's names; absent until it lands them). */
interface KeeperBoss {
  phase: number;
  stage: string;
  left: number;
  saved: number;
  eaten: number;
  caught: number;
  moth: number;
  mothX: number;
  mothY: number;
  mothT: number;
  landY: number;
  cageX: number;
  cageY: number;
  swingT: number;
  pivotX: number;
  pivotY: number;
  lit: number;
  collapse: number;
  /** r14: the sweep's span through its tell, P1's anger, the phase's gate. */
  tellX0: number;
  tellX1: number;
  angry: number;
  gated: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  s: number;
  seed: number;
}

/**
 * A moth seen from behind as it climbs (the column, r15): a dark body, fore and hind wings either side whose span
 * opens and closes with the beat (never to nothing: a wing edge-on still shows), tilted `tilt` rad. Reads as a
 * wingbeat at play size where the side-view triangle flickered as a sparkle.
 */
function flutter(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  beat: number,
  color: number,
  alpha: number,
  tilt: number,
): void {
  const open = 0.22 + 0.78 * (0.5 + 0.5 * Math.cos(beat));
  const lift = Math.sin(beat) * w * 0.18;
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const P = (px: number, py: number): [number, number] => [x + px * c - py * sn, y + px * sn + py * c];
  const dark = mix(color, 0x1a1420, 0.5);
  for (const side of [-1, 1]) {
    const fw = w * 0.62 * open;
    const fore = [
      P(side * w * 0.06, -w * 0.12),
      P(side * fw, -w * 0.42 + lift),
      P(side * fw * 1.05, -w * 0.05 + lift * 0.5),
      P(side * w * 0.08, w * 0.06),
    ];
    const hind = [
      P(side * w * 0.05, w * 0.02),
      P(side * fw * 0.8, w * 0.12 + lift * 0.4),
      P(side * fw * 0.55, w * 0.38),
      P(side * w * 0.04, w * 0.22),
    ];
    g.poly(hind.flat()).fill({ color: mix(color, dark, 0.45), alpha: alpha * 0.9 });
    g.poly(fore.flat()).fill({ color, alpha });
  }
  const [bx, by] = P(0, w * 0.04);
  g.ellipse(bx, by, w * 0.07, w * 0.24).fill({ color: dark, alpha });
}

interface Riser {
  /** Start (the cage's floor), seconds since launch (< 0 waiting), px/s up, its lane across the column (-1..1). */
  x0: number;
  y0: number;
  t: number;
  speed: number;
  lane: number;
  seed: number;
  s: number;
  /** Out through the roof's hole (the great release), else it spreads under the roof and fades (a partial one). */
  out: boolean;
}

/**
 * A soft hole: clear in the middle, opaque at the edge (the dark outside the light). One per sprite, never cached across rooms: the room's teardown, lifecycle.ts `destroyTree`, destroys every sprite's
 * texture source; a cached one came back destroyed in the next den: `addressModeU` of null.
 */
function hole(): Texture {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const a = u < 0.3 ? 0 : ((u - 0.3) / 0.7) ** 1.6;
    grad.addColorStop(u, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  return Texture.from(c);
}

/** The dark round a hole: the soft hole sprite and four rects out past the view. */
class Dark {
  readonly container = new Container({ label: 'keeper-dark' });
  private readonly sprite = new Sprite(hole());
  private readonly rest = new Graphics();
  constructor(color: number) {
    this.sprite.anchor.set(0.5);
    this.sprite.tint = color;
    this.container.addChild(this.sprite, this.rest);
    this.color = color;
    this.container.visible = false;
  }
  private readonly color: number;
  draw(x: number, y: number, rx: number, ry: number, alpha: number, cam: CameraView): void {
    this.container.visible = alpha > 0.003;
    if (!this.container.visible) return;
    this.container.alpha = alpha;
    this.sprite.position.set(x, y);
    this.sprite.setSize(rx * 2, ry * 2);
    const hw = cam.w / 2 / cam.zoom + 600;
    const hh = cam.h / 2 / cam.zoom + 600;
    const X0 = cam.x - hw;
    const X1 = cam.x + hw;
    const Y0 = cam.y - hh;
    const Y1 = cam.y + hh;
    const g = this.rest.clear();
    // Above, below, left, right of the hole's square (the overlap is nil: the square is the sprite's own).
    if (y - ry > Y0) g.rect(X0, Y0, X1 - X0, y - ry - Y0);
    if (y + ry < Y1) g.rect(X0, y + ry, X1 - X0, Y1 - (y + ry));
    if (x - rx > X0) g.rect(X0, y - ry, x - rx - X0, ry * 2);
    if (x + rx < X1) g.rect(x + rx, y - ry, X1 - (x + rx), ry * 2);
    g.fill({ color: this.color });
  }
}

/** The den's great cage: the trap holding RELEASE.great moths or more, in a room with an old burrback. */
function greatCage(scene: SimView['scene']): number {
  const lures = scene.lures ?? [];
  const keeper = (scene.enemies ?? []).some((e) => e.kind === 'oldBurrback');
  if (!keeper) return -1;
  return lures.findIndex((l) => l.trap === true && releaseGreat(l.moths ?? 0));
}

export class KeeperStage {
  private readonly cage: number;
  private readonly lure: Lure;
  private readonly columns: DenColumn[];
  private readonly roots: LarderRoot[];
  private readonly litter = new Graphics({ label: 'keeper-litter' });
  /** Shadow casters that are the room's own ledges and narrow solids in the arena. */
  private readonly ledges: Array<{ x: number; y: number; w: number; h: number }> = [];
  private readonly shadows = new Graphics();
  private readonly pool = new GlowPool('keeper-pool');
  private readonly darkBack = new Dark(KEEPER.dark.color);
  private readonly darkFront = new Dark(KEEPER.dark.color);
  private readonly front = new Graphics();
  private readonly glowFront = new GlowPool('keeper-glow');
  private readonly beam = new GlowPool('keeper-beam');
  /** The moonbeam's shaft: nested slanted bands, added. */
  private readonly shaft = new Graphics({ label: 'keeper-shaft' });
  /** Where the beam lands: the floor, or the collapse's rubble under the shaft once it has come down. */
  private readonly rubble: Array<{ x: number; y: number; w: number; h: number; id: string }> = [];
  /** 0..1 eased: how much the swing's / the floor's dark is in. */
  private darkK = 0;
  private fallenK = 0;
  private swingK = 0;
  /** Seconds since the roof's gate opened (-1 = shut); the shaft (gate rect) it lets moonlight down. */
  private moonT = -1;
  private readonly gate: { x: number; y: number; w: number; h: number; id: string } | null;
  private readonly floorY: number;
  private arenaX0 = 0;
  private readonly risers: Riser[] = [];
  /** The roof over the cage (the underside of the solid above it), the chain's anchor's x, and the hole's clock. */
  private readonly roofY: number;
  private readonly anchorX: number;
  private anchorT = -1;
  private readonly crack = new Graphics({ label: 'keeper-anchor' });
  private readonly anchorShaft = new Graphics({ label: 'keeper-anchor-shaft' });
  /** 0..1 eased: the fight is won and the cage still burns (its light beckons, its moths lift). */
  private downK = 0;
  private readonly puffs: Mote[] = [];
  private readonly dust: Mote[] = [];
  private groanT = -1;
  private readonly glances: Array<{
    x: number;
    y: number;
    t: number;
    lit: boolean;
    gate: boolean;
    dir: number;
  }> = [];
  /** Sparks scraped along the floor at a gate's shrug. */
  private readonly sparks: Mote[] = [];
  private gateK = 0;
  private readonly sweeps: Array<{ x0: number; x1: number; y: number; t: number; secs: number }> = [];
  private feedT = -1;
  private readonly sweepR = { tell: -1, strike: -1 };
  private sweepK = 0;
  private sweepDust = 0;
  /** The slam's crack: where it started, how far each way it has run, seconds since the wave ended (-1 running). */
  private crackX = 0;
  private crackL = 0;
  private crackR = 0;
  private crackT = -2;
  /**
   * The Canopy r15 (review r14 #2, the wave the one unfair hit): the sim's `keeperWave` tell (it rears: the floor over
   * the wave's reach lit ahead of it) and slam (a crack opening at its feet through the fronts' delay).
   */
  private waveTell: { x: number; y: number; x0: number; x1: number; t: number; frames: number } | null = null;
  private waveSlam: { x: number; y: number; x0: number; x1: number; t: number; frames: number } | null = null;
  /** The last slam's reach and floor (the seam ahead of its fronts until they have run it). */
  private waveReach: { x0: number; x1: number; y: number } | null = null;
  private seamDust = 0;
  private flashT = -1;
  private waveDust = 0;
  private feedX = 0;
  private feedY = 0;
  private readonly lightCage: PointLight = { x: 0, y: 0, radius: 0, color: KEEPER.light.color, intensity: 0 };
  private readonly lightMoon: PointLight = { x: 0, y: 0, radius: 0, color: KEEPER.moon.color, intensity: 0 };
  private readonly lightAnchor: PointLight = {
    x: 0,
    y: 0,
    radius: 0,
    color: KEEPER.moon.color,
    intensity: 0,
  };

  /** A stage for this room, or null (no great cage over a keeper). */
  static for(ctx: SceneContext, lights: LightRegistry): KeeperStage | null {
    if (LOOK.kit !== 'wood') return null;
    const i = greatCage(ctx.scene);
    return i < 0 ? null : new KeeperStage(ctx, lights, i);
  }

  private constructor(
    ctx: SceneContext,
    private readonly lights: LightRegistry,
    cage: number,
  ) {
    this.cage = cage;
    const scene = ctx.scene;
    this.lure = (scene.lures ?? [])[cage] as Lure;
    const plan = interiorPlan(scene, LOOK.seed);
    this.columns = plan ? denColumnsOf(plan, LOOK.seed + 5) : [];
    this.roots = plan ? larderRootsOf(plan, LOOK.seed + 5) : [];
    // The ledges she fights round (one-ways) and the narrow solids standing in the den's air (the taproot).
    for (const o of scene.oneWays) this.ledges.push({ x: o.x, y: o.y, w: o.w, h: 44 });
    for (const s of scene.solids)
      if (s.w <= 260 && s.h >= 200 && s.y > 200 && s.y + s.h < scene.height - 60) this.ledges.push({ ...s });
    const gates =
      (scene as { gates?: Array<{ id: string; x: number; y: number; w: number; h: number }> }).gates ?? [];
    const g = gates.find((q) => q.id.endsWith('roof')) ?? null;
    this.gate = g ? { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h } : null;
    for (const q of gates) if (q.id.startsWith('rubble')) this.rubble.push({ ...q });
    // The arena's floor: the highest solid top under the cage.
    let fy = scene.height;
    for (const s of scene.solids)
      if (this.lure.x >= s.x && this.lure.x <= s.x + s.w && s.y > this.lure.y && s.y < fy) fy = s.y;
    this.floorY = fy;
    let ry = 0;
    for (const s of scene.solids)
      if (this.lure.x >= s.x && this.lure.x <= s.x + s.w && s.y + s.h <= this.lure.y && s.y + s.h > ry)
        ry = s.y + s.h;
    this.roofY = ry;
    this.anchorX = this.lure.x;
    const arena = (scene as { boss?: { arena?: { x: number } } }).boss?.arena;
    this.arenaX0 = arena?.x ?? Math.max(200, this.lure.x - 1000);
    this.drawLitter(scene.width);
    ctx.layers.get('pickupsBack').addChild(this.litter);
    const back = ctx.layers.get('airBack');
    back.addChild(this.darkBack.container, this.pool.container, this.shadows);
    this.shaft.blendMode = 'add';
    this.anchorShaft.blendMode = 'add';
    ctx.layers.air.addChild(
      this.darkFront.container,
      this.crack,
      this.shaft,
      this.anchorShaft,
      this.beam.container,
      this.front,
      this.glowFront.container,
    );
    lights.set('keeper-cage', this.lightCage);
    lights.set('keeper-moon', this.lightMoon);
    lights.set('keeper-anchor', this.lightAnchor);
  }

  /**
   * The floor's story (`KEEPER.litter`): what it ate and dropped. Drawn once, on the walked line in front of the
   * bake; never higher than a moth's wing pile (a background shape must not read as a ledge).
   */
  private drawLitter(roomW: number): void {
    const T = KEEPER.litter;
    const g = this.litter;
    const fy = this.floorY + 3;
    const cx = this.lure.x;
    // The drift: densest under the cage's rest, a low mound of wings, the dark ones under, the ash ones on top.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < T.wings; i++) {
        const h = hash01(`lw${pass}`, i);
        const gauss = (hash01('lg1', i + pass * 999) + hash01('lg2', i) + hash01('lg3', i + pass)) / 3 - 0.5;
        const x = cx + gauss * 2 * T.spread * 1.6;
        const m = Math.max(0, 1 - Math.abs(x - cx) / T.spread);
        const y = fy - T.mound * m * m * (3 - 2 * m) * (0.3 + 0.7 * hash01('lm', i)) + 2;
        const l = T.wingL[0] + (T.wingL[1] - T.wingL[0]) * hash01('ll', i + pass * 7) ** 1.5;
        const a = h * Math.PI * 2;
        const col = pass === 0 ? T.dark : mix(T.ash, T.dark, 0.5 * hash01('lc', i));
        g.poly(wingPts(x, y, l, a, hash01('lf', i) < 0.5 ? 1 : -1)).fill({
          color: col,
          alpha: pass === 0 ? 0.9 : 0.85,
        });
      }
    // Gnawed husks: a moth's body, hollowed, broken at one end, lying along the floor.
    for (let i = 0; i < T.husks; i++) {
      const u = hash01('hk', i);
      const x = Math.min(roomW - 200, Math.max(200, cx + (u - 0.5) * 2200));
      const len = 18 + 14 * hash01('hl', i);
      const a = (hash01('ha', i) - 0.5) * 0.5;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pts: number[] = [];
      for (let q = 0; q <= 10; q++) {
        const t = q / 10;
        const half = len * 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
        pts.push(x + (t - 0.5) * len * ca + half * sa, fy - half - 1 + (t - 0.5) * len * sa);
      }
      for (let q = 10; q >= 0; q--) {
        const t = q / 10;
        pts.push(x + (t - 0.5) * len * ca, fy + 1 + (t - 0.5) * len * sa);
      }
      g.poly(pts).fill({ color: T.husk, alpha: 0.95 });
      // Its segments, a dull rim, the bitten end open.
      for (let q = 1; q < 4; q++) {
        const sx = x + (q / 4 - 0.5) * len * ca;
        g.rect(sx - 0.6, fy - len * 0.2, 1.2, len * 0.18).fill({ color: T.huskLit, alpha: 0.5 });
      }
      g.circle(x + 0.5 * len * ca, fy - 2, len * 0.12).fill({ color: 0x080504, alpha: 0.9 });
    }
    // A heap of old cages by the west wall (emptied, thrown aside, piled), one on its side by the east wall.
    const C = { col: 0x2a1c12, dark: 0x0e0907, lit: 0x9a744e };
    const wx = this.arenaX0 + T.heapAt;
    for (let k = 0; k < T.heap; k++) {
      const h = T.heapH[0] + (T.heapH[1] - T.heapH[0]) * hash01('hh', k);
      const x = wx + (k - 1) * h * 0.55 + (hash01('hx', k) - 0.5) * 40;
      const up = k === 1 ? h * 0.42 : 0;
      oldCage(
        g,
        x,
        fy - h * 0.18 - up,
        h,
        (hash01('ht', k) - 0.5) * 2.4 + (k === 1 ? 0.4 : 1.5),
        0.3,
        C,
        71 + k * 7,
      );
    }
    oldCage(g, cx + 640, fy - 30, 160, -1.75, 0.45, C, 73);
  }

  /** The great cage's lure id (lamps.ts hands its release's moths to the column). */
  get cageId(): string {
    return this.lure.id;
  }

  private boss(sim: SimView): Partial<KeeperBoss> | null {
    return sim.boss as unknown as Partial<KeeperBoss> | null;
  }

  onEvents(sim: SimView): void {
    for (const e0 of sim.events) {
      const e = e0 as unknown as Record<string, unknown> & { type: string; x?: number; y?: number };
      switch (e.type) {
        case 'keeperWave': {
          const w = {
            x: e.x ?? 0,
            y: e.y ?? this.floorY,
            x0: (e.x0 as number) ?? (e.x ?? 0) - 900,
            x1: (e.x1 as number) ?? (e.x ?? 0) + 900,
            t: 0,
            frames: Math.max(1, (e.frames as number) ?? 30),
          };
          if (e.phase === 'tell') this.waveTell = w;
          else {
            this.waveTell = null;
            this.waveSlam = w;
            this.waveReach = { x0: w.x0, x1: w.x1, y: w.y };
          }
          break;
        }
        case 'enemyFeed':
          this.feedT = 0;
          this.feedX = e.x ?? 0;
          this.feedY = e.y ?? 0;
          this.scales(this.feedX, this.feedY - 30, 14, 0.9);
          break;
        case 'keeperGlance': {
          // (Review r12 #10: a blocked cut was unreadable. The dome's crust flashes amber where the blade met it;
          // in P2's light the flash is the cage's own colour: it saw her.)
          const hx = (e.hitX as number) ?? e.x ?? 0;
          const hy = (e.hitY as number) ?? e.y ?? 0;
          const why = e.why as string;
          const dir = hx >= (e.x ?? hx) ? 1 : -1;
          this.glances.push({ x: hx, y: hy, t: 0, lit: why === 'lit', gate: why === 'gate', dir });
          this.scales(hx, hy, 5, 0.4);
          // Sparks thrown back off the shell the way the blade came (it rang off: nothing went in).
          const G = KEEPER.glance;
          for (let i = 0; i < G.sparks; i++) {
            const h = hash01(`gl${this.sparks.length}`, i);
            const a = -0.35 - 1.1 * hash01('gla', i + this.sparks.length);
            const sp = G.sparkSpeed * (0.45 + 0.55 * h);
            this.sparks.push({
              x: hx,
              y: hy,
              vx: dir * Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              t: 0,
              life: 0.22 + 0.22 * h,
              s: 1.6 + 1.2 * h,
              seed: h,
            });
          }
          // At its gate it shrugs the blow off: its claws scrape the floor (sparks along it), plates flare pale.
          if (why === 'gate') this.scrape(e.x ?? hx, this.floorY);
          break;
        }
        case 'keeperRage':
          // P1's rage (review r13 #3): its slam lands with the floor's flash (no wave).
          if ((e.phase as string) === 'slam') {
            this.crackX = e.x ?? this.crackX;
            this.flashT = 0;
            this.burstDust(e.x ?? 0, this.floorY - 260, 18, 1.4);
          }
          break;
        case 'keeperSweep':
          // P3's sweep: its claws through the low cloud, a pale arc of dust along the floor it reaches.
          this.sweeps.push({
            x0: (e.x0 as number) ?? 0,
            x1: (e.x1 as number) ?? 0,
            y: e.y ?? this.floorY,
            t: 0,
            secs: Math.max(0.3, ((e.frames as number) ?? 20) / 60),
          });
          break;
        case 'mothEaten':
          this.scales(e.x ?? 0, e.y ?? 0, 6 + 4 * ((e.n as number) ?? 1), 0.8);
          break;
        case 'cageRelease':
          if ((e.lure as string) === this.lure.id)
            this.rise(e.x ?? 0, e.y ?? 0, (e.moths as number) ?? 30, false);
          break;
        case 'lureSnuff':
          if ((e.id as string) === this.lure.id) {
            this.rise(e.x ?? 0, e.y ?? 0, (e.moths as number) ?? 0, true);
            this.anchorT = 0;
          }
          break;
        case 'gateOpen':
          if (this.gate && (e.id as string) === this.gate.id) this.moonT = 0;
          break;
        case 'denCollapse': {
          const ph = e.phase as string;
          if (ph === 'groan') this.groanT = 0;
          if (ph === 'dust' || ph === 'rubble')
            this.burstDust(e.x ?? 0, e.y ?? 0, ph === 'rubble' ? 40 : 14, ph === 'rubble' ? 1.6 : 1);
          if (ph === 'settle') this.groanT = -1;
          break;
        }
      }
    }
  }

  /**
   * Moths rising straight up from (x, y): the great release (`great`: a dense column of at least `column.n`, out
   * through the roof's hole) or a partial one (P3's third: thinner, to under the roof).
   */
  private rise(x: number, y: number, n: number, great: boolean): void {
    const C = KEEPER.column;
    const count = great
      ? Math.round(Math.min(C.max, Math.max(C.n, n * 1.8)))
      : Math.round(Math.min(C.n * 0.5, Math.max(14, n * 1.2)));
    const launch = great ? C.launch : 0.9;
    const base = this.risers.length;
    for (let i = 0; i < count; i++) {
      const j = base + i;
      const seed = hash01('rise', j);
      // Denser in the middle: a sum of three draws.
      const lane = (hash01('rl1', j) + hash01('rl2', j) + hash01('rl3', j)) / 1.5 - 1;
      this.risers.push({
        x0: x,
        y0: y - 10 - 40 * hash01('ry', j),
        t: -(i / count) * launch - 0.12 * hash01('rd', j),
        speed: C.speed[0] + (C.speed[1] - C.speed[0]) * hash01('rv', j),
        lane,
        seed,
        // (r15, review r14 #8 "a glitter stream": most are near moths with wings big enough to beat; the rest specks
        // deep in it.)
        s:
          hash01('rn', j) < C.near
            ? C.size[0] + (C.size[1] - C.size[0]) * hash01('rs', j)
            : C.speck[0] + (C.speck[1] - C.speck[0]) * hash01('rs', j),
        out: great,
      });
    }
  }

  private scales(x: number, y: number, n: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const a = hash01(`sc${this.puffs.length}`, i) * Math.PI * 2;
      const sp = 40 + 140 * hash01('scs', i + this.puffs.length);
      this.puffs.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 50,
        t: 0,
        life: life * (0.6 + 0.6 * hash01('scl', i)),
        s: 1.5 + 2 * hash01('scz', i),
        seed: hash01('scd', i),
      });
    }
  }

  private burstDust(x: number, y: number, n: number, k: number): void {
    for (let i = 0; i < n; i++) {
      const h = hash01(`du${this.dust.length}`, i);
      this.dust.push({
        x: x + (h - 0.5) * 220 * k,
        y,
        vx: (hash01('dvx', i) - 0.5) * 50 * k,
        vy: 30 + 80 * hash01('dvy', i),
        t: 0,
        life: 1.4 + 1.2 * hash01('dl', i),
        s: 2 + 5 * hash01('ds', i) * k,
        seed: h,
      });
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    const S = KEEPER;
    const kb = this.boss(sim);
    const f = sim.frame - 2 + sim.alpha;
    const at = flameAt(sim.lures, this.cage, this.lure, f, tuning, { x: 0, y: 0 });
    const fake = keeperFake(at, clock, this.lure, this.floorY);
    const burning = (sim.lures.hp[this.cage] ?? 0) > 0;
    const swinging = burning && ((kb?.swingT ?? -1) >= 0 || fake?.phase === 2);
    const fallen = burning && ((kb?.phase ?? 0) >= 3 || at.y > this.lure.y + 260 || fake?.phase === 3);
    const ease = (k: number, on: boolean, tin: number, tout: number): number =>
      on ? Math.min(1, k + dt / tin) : Math.max(0, k - dt / tout);
    this.swingK = ease(this.swingK, swinging && !fallen, S.dark.in, S.dark.out);
    this.fallenK = ease(this.fallenK, fallen, S.dark.in, S.dark.out);
    const fightOn = ((kb?.stage ?? '') !== 'down' && (kb?.stage ?? 'wait') !== 'wait') || !!fake?.phase;
    this.darkK = ease(this.darkK, (swinging || fallen) && fightOn, S.dark.in, S.dark.out);
    // Won, the cage still burning: its light swells back and beckons, its moths lift (review r13 #1).
    const won =
      burning &&
      ((kb?.stage ?? '') === 'down' || (kb?.stage ?? '') === 'end' || sim.save.flags.includes('cn-den-down'));
    this.downK = ease(this.downK, won, S.after.in, 0.6);
    const phaseK = (arr: readonly number[]): number =>
      lerp3(arr[0] as number, arr[1] as number, arr[2] as number, this.swingK, this.fallenK);

    this.shadows.clear();
    this.front.clear();
    this.pool.begin();
    this.glowFront.begin();
    this.beam.begin();

    // --- The light: its pool on the back and the shadows it throws.
    const L = { x: at.x, y: at.y };
    if (burning) {
      const flick = 1 + 0.06 * Math.sin(clock * 8.3) + 0.04 * Math.sin(clock * 21.7);
      const pool = phaseK(S.light.pool) * flick;
      if (this.fallenK > 0.01) {
        // On the floor: a wide warm wash up the back from below, brightest at its foot.
        this.pool.add(L.x, L.y - 60, 1150, S.light.color, pool * this.fallenK, 520);
        this.pool.add(L.x, L.y - 300, 700, S.light.color, 0.6 * pool * this.fallenK, 700);
      }
      this.pool.add(
        L.x,
        L.y + 40,
        S.light.reach,
        S.light.color,
        pool * (1 - this.fallenK),
        S.light.reach * 0.85,
      );
      this.lightCage.x = L.x;
      this.lightCage.y = L.y + (this.fallenK > 0 ? -80 : 60);
      this.lightCage.radius = 900 + 500 * Math.max(this.swingK, this.fallenK);
      this.lightCage.intensity = (0.35 + 0.45 * Math.max(this.swingK, this.fallenK)) * flick;
      if (this.downK > 0.01) {
        // The beckon: a slow swell (the "come here" without a sign), lit up off the floor round the cage.
        const pulse = 0.75 + 0.25 * Math.sin(clock * S.after.pulse);
        const dk = this.downK * pulse;
        this.pool.add(L.x, L.y - 160, 980, S.light.color, S.after.pool * dk, 760);
        this.glowFront.add(L.x, L.y - 50, 190, 0xffd6a0, S.after.beacon * dk, 150);
        this.lightCage.intensity += 0.4 * dk;
        this.lightCage.radius += 300 * this.downK;
      }
      this.drawShadows(L, sim, phaseK(S.shadow.alpha));
    } else this.lightCage.intensity = 0;

    // --- The dark outside the light (the swing's, the floor's).
    if (this.darkK > 0.003 && burning) {
      const rx = lerpN(S.dark.r, S.dark.fallen[0], this.fallenK);
      const ry = lerpN(S.dark.r, S.dark.fallen[1], this.fallenK);
      const cy = L.y + (this.fallenK > 0 ? -ry * 0.35 * this.fallenK : 80);
      const k = this.darkK * this.darkK * (3 - 2 * this.darkK);
      this.darkBack.draw(L.x, cy, rx, ry, S.dark.back * k, cam);
      this.darkFront.draw(L.x, cy, rx * 1.15, ry * 1.15, S.dark.front * k, cam);
    } else {
      this.darkBack.draw(0, 0, 1, 1, 0, cam);
      this.darkFront.draw(0, 0, 1, 1, 0, cam);
    }

    // --- The falling moth (the intro's, and P1-2's drops), the snap, the saved ones round her.
    this.drawMoth(dt, clock, sim, kb, L);
    // --- P3's low cloud.
    if (fallen && kb && typeof kb.left === 'number') this.drawLow(clock, L, kb.left);
    // --- The column, the moonbeam, the dust, the scales.
    this.drawAnchor(dt, clock, sim);
    this.drawRisers(dt, clock);
    this.drawMoon(dt, clock, sim, cam);
    this.drawDust(dt);
    this.drawPuffs(dt);
    this.drawGlances(dt);
    this.drawSweepTell(dt, clock, sim, kb);
    this.drawWaveCrack(dt, clock, sim);
    this.drawGate(dt, clock, sim, kb);
    this.pool.end();
    this.glowFront.end();
    this.beam.end();
  }

  /** Every caster thrown onto the back, displaced away from the light, softer and fainter far from it. */
  private drawShadows(L: { x: number; y: number }, sim: SimView, alpha: number): void {
    const S = KEEPER.shadow;
    const g = this.shadows;
    let k = S.k;
    const P = (x: number, y: number): [number, number] => [x + (x - L.x) * k, y + (y - L.y) * k];
    const near = (x: number, y: number): number => Math.max(0, 1 - Math.hypot(x - L.x, y - L.y) / S.reach);
    // A band from a to b, `w` wide at a and `w1` at b, in three soft layers (the penumbra, then the core).
    const band = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      w0: number,
      w1: number,
      a: number,
    ): void => {
      if (a <= 0.004) return;
      const [pax, pay] = P(ax, ay);
      const [pbx, pby] = P(bx, by);
      const dx = pbx - pax;
      const dy = pby - pay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      for (const [grow, ak] of [
        [1 + S.soft, 0.35],
        [1 + S.soft * 0.45, 0.35],
        [1, 0.45],
      ] as const) {
        const ha = (w0 * (1 + k) * grow) / 2;
        const hb = (w1 * (1 + k) * grow) / 2;
        g.poly([
          pax + nx * ha,
          pay + ny * ha,
          pbx + nx * hb,
          pby + ny * hb,
          pbx - nx * hb,
          pby - ny * hb,
          pax - nx * ha,
          pay - ny * ha,
        ]).fill({
          color: S.color,
          alpha: a * ak,
        });
      }
    };
    for (const c of this.columns) {
      const mx = (c.x + c.lean * 0.3 + c.x) / 2;
      const a = alpha * near(mx, (c.top + c.y) / 2);
      // Upper and lower halves (the column bows): the flare at both ends.
      const midX = c.x + c.lean * 0.55;
      const midY = (c.top + c.y) / 2;
      band(c.x + c.lean * 0.3, c.top - 20, midX, midY, c.w * 1.4, c.w * 0.7, a);
      band(midX, midY, c.x, c.y, c.w * 0.7, c.w * 1.3, a);
    }
    // The larder's roots: a rib lies on the wall, so its shadow is a near twin sliding along beside it; a hanging
    // root is out in the air and its shadow swings wide across the wall.
    for (const rt of this.roots) {
      k = rt.kind === 'rib' ? S.rib : S.hang;
      const n = rt.pts.length / 2;
      for (let j = 0; j + 2 < n; j += 2) {
        const ax = rt.pts[j * 2] as number;
        const ay = rt.pts[j * 2 + 1] as number;
        const bx = rt.pts[Math.min(n - 1, j + 2) * 2] as number;
        const by = rt.pts[Math.min(n - 1, j + 2) * 2 + 1] as number;
        const t0 = j / (n - 1);
        const t1 = Math.min(1, (j + 2) / (n - 1));
        const wAt = (t: number): number =>
          rt.kind === 'rib'
            ? Math.max(rt.w1, rt.w0 * (1 - t) ** 0.6)
            : Math.max(rt.w1, rt.w0 * (1 - t) ** 0.8);
        band(ax, ay, bx, by, wAt(t0), wAt(t1), alpha * near((ax + bx) / 2, (ay + by) / 2) * 0.9);
      }
    }
    k = S.k;
    for (const r of this.ledges) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const a = alpha * near(cx, cy) * 0.85;
      if (r.w >= r.h) band(r.x, cy, r.x + r.w, cy, r.h, r.h, a);
      else band(cx, r.y, cx, r.y + r.h, r.w, r.w, a);
    }
    // The Keeper (its bulk, the darkest thing thrown) and her.
    for (const e of sim.enemies) {
      if (e.gone || e.kind !== 'oldBurrback') continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h * 0.45;
      const [sx, sy] = P(cx, cy);
      const a = alpha * near(cx, cy) * 1.1;
      for (const [grow, ak] of [
        [1.35, 0.4],
        [1.1, 0.4],
        [0.9, 0.5],
      ] as const)
        g.ellipse(sx, sy, e.w * 0.62 * (1 + k) * grow, e.h * 0.55 * (1 + k) * grow).fill({
          color: S.color,
          alpha: Math.min(0.9, a * ak),
        });
    }
    const p = sim.player;
    if (p.faded === 0) {
      const [sx, sy] = P(p.cx, p.cy);
      const a = alpha * near(p.cx, p.cy);
      g.ellipse(sx, sy, 16 * (1 + k), 34 * (1 + k)).fill({ color: S.color, alpha: a * 0.6 });
    }
  }

  private drawMoth(
    dt: number,
    clock: number,
    sim: SimView,
    kb: Partial<KeeperBoss> | null,
    L: { x: number; y: number },
  ): void {
    const M = KEEPER.moth;
    const g = this.front;
    const st = kb?.moth ?? 0;
    if (st > 0 && kb) {
      let x = kb.mothX ?? L.x;
      let y = kb.mothY ?? L.y;
      const t = (kb.mothT ?? 0) / 60;
      if (st === 1) {
        // The tell: it falters out of the orbit, beating hard, wobbling, dropping a little and catching.
        x += Math.sin(clock * 7.3) * M.tell + Math.sin(clock * 13.1) * 6;
        y += Math.abs(Math.sin(clock * 3.7)) * 18;
      } else if (st === 2) {
        // The fall: a tight spiral, the wings hardly beating, a pale fleck.
        x += Math.sin(t * 9 + 1) * (14 + 10 * Math.min(1, t));
      }
      const flap =
        st === 3
          ? 0.1 + 0.15 * Math.abs(Math.sin(clock * 4))
          : st === 2
            ? 0.3
            : Math.abs(Math.sin(clock * 22));
      // Falling: a trail of paler, smaller ghosts up its spiral, so the eye finds it against the cage.
      if (st === 2)
        for (let k = 1; k <= M.trail; k++) {
          const tk = Math.max(0, t - k * 0.05);
          const gx = (kb.mothX ?? L.x) + Math.sin(tk * 9 + 1) * (14 + 10 * Math.min(1, tk));
          const gy = y - k * 0.05 * 60 * 3.2;
          this.glowFront.add(gx, gy, 16 - k * 2, 0xfff4dc, 0.16 * (1 - k / (M.trail + 1)));
        }
      moth(g, x, y, M.size, flap, Math.sin(clock * 2.3) > 0 ? 1 : -1, M.color, 0.95);
      this.glowFront.add(x, y, 30, 0xfff0d0, st === 3 ? 0.12 : 0.22);
    }
    // The snap out of the dark: a gust of dust and the fleck gone (the body's heave is the rig's, enemies/).
    if (this.feedT >= 0) {
      this.feedT += dt;
      const u = this.feedT / 0.6;
      if (u < 1)
        this.glowFront.add(this.feedX, this.feedY - 40, 120 * (0.6 + u), 0xff5a30, 0.12 * (1 - u), 60);
      else this.feedT = -1;
    }
    // Saved: they cling round her, a little ring of pale wings that comes with her to the end.
    const n = Math.min(M.savedMax, Math.max(0, kb?.caught ?? 0));
    const p = sim.player;
    for (let i = 0; i < n; i++) {
      const a = clock * (1.3 + 0.3 * hash01('sv', i)) + (i / Math.max(1, n)) * Math.PI * 2;
      const x = p.cx + Math.cos(a) * M.saved[0];
      const y = p.cy - 10 + Math.sin(a) * M.saved[1] + Math.sin(clock * 3 + i) * 5;
      moth(g, x, y, 6, Math.abs(Math.sin(clock * 16 + i * 1.7)), Math.cos(a) > 0 ? -1 : 1, 0xf0ead8, 0.9);
    }
  }

  /** P3: the spilled moths circling dazed low over the floor round the fallen cage; `left` is how many. */
  private drawLow(clock: number, L: { x: number; y: number }, left: number): void {
    const C = KEEPER.low;
    const g = this.front;
    const n = Math.min(C.max, Math.round(left * 0.75));
    const fy = Math.min(this.floorY, L.y + 120);
    // Won: they lift to her head's height and circle the cage closer.
    const dk = this.downK;
    const over = C.over + (KEEPER.after.over - C.over) * dk;
    const rx = C.rx + (KEEPER.after.rx - C.rx) * dk;
    for (let i = 0; i < n; i++) {
      const h = hash01('low', i);
      const sp = (0.6 + 0.9 * hash01('lsp', i)) * (h < 0.5 ? -1 : 1);
      const a = clock * sp + h * 40;
      const r = 0.35 + 0.65 * hash01('lr', i);
      const x = L.x + Math.cos(a) * rx * r + Math.sin(clock * 2.1 + i) * 14;
      const y =
        fy -
        over * (0.3 + 0.7 * hash01('ly', i)) +
        Math.sin(a) * C.ry * r * 0.5 +
        Math.sin(clock * 5 + i) * 8;
      const s = C.size[0] + (C.size[1] - C.size[0]) * hash01('ls', i);
      moth(
        g,
        x,
        y,
        s,
        Math.abs(Math.sin(clock * (14 + 6 * h) + i)),
        Math.sin(a) * sp > 0 ? 1 : -1,
        C.color,
        0.85,
      );
    }
    this.glowFront.add(L.x, fy - 70, C.rx * 0.9, 0xffc890, 0.05 + 0.08 * Math.min(1, left / 60), C.ry);
  }

  /**
   * The column: each moth rises straight up off the cage, the column narrowing toward the hole in the roof over it
   * (`anchorX`, `roofY`), a slow helix in it; out through the hole (or, a partial release, spreading under the roof).
   */
  private drawRisers(dt: number, clock: number): void {
    const C = KEEPER.column;
    const A = KEEPER.anchor;
    const g = this.front;
    const ak = this.anchorK();
    for (let i = this.risers.length - 1; i >= 0; i--) {
      const r = this.risers[i] as Riser;
      r.t += dt;
      if (r.t < 0) continue;
      // A start off the floor (slower for the first half second), then its own speed.
      const dist = r.speed * (r.t - 0.22 * (1 - Math.exp(-r.t / 0.22)));
      const top = r.out ? this.roofY - 70 : this.roofY + 70;
      const total = Math.max(200, r.y0 - top);
      const u = dist / total;
      if (u >= 1) {
        this.risers.splice(i, 1);
        continue;
      }
      const e = u * u * (3 - 2 * u);
      const half = (C.w / 2) * (1 - e) + (C.funnel / 2) * e;
      const cx = r.x0 + (this.anchorX - r.x0) * e;
      const helix = Math.sin(r.t * (2.2 + r.seed * 1.6) + r.seed * 40) * C.helix * (1 - 0.6 * u);
      let x = cx + r.lane * half + helix + Math.sin(clock * (4 + r.seed * 5) + r.seed * 30) * 6;
      const y = r.y0 - dist;
      // A partial release spreads out under the roof as it arrives (it cannot leave yet).
      if (!r.out && u > 0.75) x += r.lane * 260 * ((u - 0.75) / 0.25) ** 1.5;
      const fade = Math.min(1, r.t / 0.25) * (u > 0.9 ? (1 - u) / 0.1 : 1);
      // Gold out of the cage, cooling as they climb; silvered and lit inside the moonbeam.
      let col = mix(C.color, C.cool, Math.min(1, u * 1.3));
      const beamHalf =
        (A.w0 + (A.w1 - A.w0) * Math.max(0, (y - this.roofY) / (this.floorY - this.roofY))) * 0.42;
      const lit = ak * (Math.abs(x - this.anchorX) < beamHalf ? 1 : 0);
      if (lit > 0) {
        col = mix(col, KEEPER.moon.core, A.silver * lit);
        if (i % 7 === 0) this.glowFront.add(x, y, 30, 0xffffff, 0.08 * fade * lit);
      }
      const near = r.s >= C.size[0];
      const beat = clock * (C.beat[0] + (C.beat[1] - C.beat[0]) * r.seed) + r.seed * 9;
      if (near) flutter(g, x, y, r.s, beat, col, 0.95 * fade, Math.sin(r.t * 1.7 + r.seed * 20) * 0.35);
      else moth(g, x, y, r.s, Math.abs(Math.sin(beat)), r.seed > 0.5 ? 1 : -1, col, 0.6 * fade);
      if (!near && i % 6 === 0) this.glowFront.add(x, y, 26, col, 0.1 * fade);
    }
    void dt;
  }

  /** 0..1: the anchor's hole and its moonlight are in (eased). */
  private anchorK(): number {
    const A = KEEPER.anchor;
    if (this.anchorT < A.at) return 0;
    const k = Math.min(1, (this.anchorT - A.at) / A.in);
    return k * k * (3 - 2 * k);
  }

  /**
   * The anchor's moonlight: the roots that held the chain part, a ragged hole opens in the roof over the cage with the
   * night in it, and moonlight falls straight down onto the column and the floor (the real light where the false one
   * hung), dust lit in it.
   */
  private drawAnchor(dt: number, clock: number, sim: SimView): void {
    const A = KEEPER.anchor;
    const M = KEEPER.moon;
    const freed = sim.save.flags.includes(`${(this.lure as { sets?: string }).sets ?? '-'}`);
    if (this.anchorT < 0 && freed) this.anchorT = 99;
    const g = this.crack.clear();
    if (this.anchorT < 0) {
      this.lightAnchor.intensity = 0;
      return;
    }
    const before = this.anchorT;
    this.anchorT += dt;
    // The roots give: a fall of earth from the roof as the hole opens.
    if (before < A.at && this.anchorT >= A.at) {
      this.burstDust(this.anchorX, this.roofY + 6, 46, 1.2);
      this.scales(this.anchorX, this.roofY + 20, 10, 1.2);
    }
    const k = this.anchorK();
    if (k <= 0) return;
    const x0 = this.anchorX;
    const y0 = this.roofY;
    const y1 = this.floorY;
    const breathe = 0.9 + 0.1 * Math.sin(clock * 0.6 + 1.3);
    // The hole (r15, review r14 #4: "a blue star glyph"): the roof torn open through its depth, the night beyond it
    // (dark blue, moonlit cloud drifting, a few stars), its lips raw earth with strata, torn roots hanging across it
    // as silhouettes on the sky, clods still dropping off its edges.
    const hw = (A.hole / 2) * (0.45 + 0.55 * k);
    const H = A.deep * (0.35 + 0.65 * k);
    const out: number[] = [];
    const N = 14;
    // Asymmetric, leaning east, each lip torn in its own steps (a symmetric taper read as a jar).
    const lean = hw * 0.35;
    // (Smooth bites with a little grit: per-point jitter drew lightning bolts.)
    const lipW = (side: number, v: number, q: number): number =>
      hw *
      (1 - (side < 0 ? 0.5 : 0.32) * v) *
      (1 +
        0.16 * Math.sin(v * (side < 0 ? 7.3 : 5.9) + (side < 0 ? 1 : 4)) +
        0.05 * (hash01(side < 0 ? 'ahl' : 'ahr', q) - 0.5));
    for (let q = 0; q <= N; q++) {
      const v = q / N;
      out.push(x0 + lean * v - lipW(-1, v, q), y0 + 6 - H * v);
    }
    for (let q = 1; q < 5; q++) {
      const u = q / 5;
      const xa = x0 + lean - lipW(-1, 1, N);
      const xb = x0 + lean + lipW(1, 1, N);
      out.push(xa + (xb - xa) * u, y0 - H - 8 - 22 * Math.sin(u * Math.PI) * (0.6 + 0.4 * hash01('aht', q)));
    }
    for (let q = N; q >= 0; q--) {
      const v = q / N;
      out.push(x0 + lean * v + lipW(1, v, q), y0 + 6 - H * v * 0.92);
    }
    g.poly(out).fill({ color: A.sky, alpha: k });
    // The night in it: brighter toward its top (the moon is up there), cloud lit along its edges, stars.
    const drift = clock * A.cloudDrift;
    g.ellipse(x0 + lean, y0 - H * 0.85, hw * 0.5, H * 0.3).fill({ color: A.skyMid, alpha: 0.28 * k });
    for (let q = 0; q < 5; q++) {
      const cx = x0 + lean * 0.6 + (((((hash01('acx', q) + drift / (hw * 2)) % 1) + 1) % 1) - 0.5) * hw * 1.3;
      const cy = y0 - H * (0.3 + 0.55 * hash01('acy', q));
      const cw = hw * (0.3 + 0.35 * hash01('acw', q));
      for (let k2 = 0; k2 < 3; k2++)
        g.ellipse(
          cx + (k2 - 1) * cw * 0.3,
          cy + (k2 - 1) * 4,
          cw * (0.7 - 0.15 * Math.abs(k2 - 1)),
          3 + 2 * k2,
        ).fill({
          color: k2 === 0 ? A.skyCore : A.cloud,
          alpha: (k2 === 0 ? 0.22 : 0.18) * k,
        });
    }
    for (let q = 0; q < 9; q++) {
      const tw = 0.6 + 0.4 * Math.sin(clock * (1.5 + hash01('ast', q) * 2) + q);
      g.circle(
        x0 + (hash01('as', q) - 0.5) * hw * 0.9,
        y0 - H * (0.25 + 0.65 * hash01('asy', q)),
        1 + 0.9 * hash01('asr', q),
      ).fill({ color: 0xffffff, alpha: 0.8 * k * tw });
    }
    // Its lips: raw earth, backlit by the sky on the inner edge; strata across them.
    // (Open polylines: a stroke closed along the underside drew a lit line across the hole's mouth.)
    g.poly(out, false).stroke({ color: 0x0c0806, width: 64, alpha: 0.35 * k, join: 'round' });
    g.poly(out, false).stroke({ color: 0x0c0806, width: 26, alpha: k, join: 'round' });
    g.poly(out, false).stroke({ color: 0x241a12, width: 8, alpha: 0.9 * k, join: 'round' });
    // (Backlit by the sky in bits only: a lit outline the whole way round read as a drawn glyph.)
    for (let q = 0; q < out.length / 2 - 3; q += 4) {
      if (hash01('abl', q) < 0.6) continue;
      g.poly(out.slice(q * 2, q * 2 + 6), false).stroke({
        color: A.skyMid,
        width: 2,
        alpha: 0.45 * k,
        cap: 'round',
      });
    }
    for (let q = 0; q < 6; q++) {
      const side = q % 2 === 0 ? -1 : 1;
      const v = 0.15 + 0.7 * hash01('asl', q);
      const lx = x0 + side * hw * (1 - 0.42 * v);
      const ly = y0 + 8 - H * v;
      g.moveTo(lx + side * 2, ly)
        .lineTo(lx + side * (30 + 26 * hash01('asw', q)), ly + (hash01('asd', q) - 0.5) * 8)
        .stroke({ color: 0x1e1610, width: 3, alpha: 0.9 * k });
    }
    // Torn roots: some hanging from the lips into the den, some spanning the hole, black on the sky.
    const sway = Math.max(0, 1 - (this.anchorT - A.at) / 3);
    for (let q = 0; q < A.roots; q++) {
      const h = hash01('ar', q);
      const side = q % 2 === 0 ? -1 : 1;
      const rx = x0 + side * hw * (0.55 + 0.45 * h);
      const len = (50 + 130 * hash01('al', q)) * k;
      const sw = Math.sin(clock * 3 + q * 1.7) * 14 * sway + side * 10 + Math.sin(clock * 0.9 + q) * 3;
      g.moveTo(rx, y0 + 4)
        .quadraticCurveTo(rx + sw * 0.4 + side * 6, y0 + len * 0.5, rx + sw, y0 + len)
        .stroke({ color: 0x0b0806, width: 6 - 3 * h, alpha: 0.95, cap: 'round' });
    }
    for (let q = 0; q < 1; q++) {
      const v = 0.3 + 0.5 * hash01('arc', q);
      const ya = y0 + 8 - H * v;
      const wa = hw * (1 - 0.42 * v);
      const sag = 20 + 40 * hash01('ars', q) + Math.sin(clock * 1.1 + q) * 3;
      g.moveTo(x0 + lean * v - wa, ya)
        .quadraticCurveTo(x0 + lean * v, ya + sag, x0 + lean * v + wa * 0.7, ya - H * 0.25)
        .stroke({ color: 0x0b0806, width: 4 + 3 * hash01('arw', q), alpha: k, cap: 'round' });
    }
    // Clods still dropping off its lips (many as it tears, then now and then).
    const since = this.anchorT - A.at;
    for (let q = 0; q < 8; q++) {
      const rate = 0.5 + hash01('acr', q);
      const ph = (since * rate + hash01('acp', q)) % 1;
      const busy = since < 4 || hash01('acb', q + Math.floor(since * rate)) < 0.25;
      if (!busy) continue;
      const cx = x0 + (q % 2 ? -1 : 1) * hw * (0.6 + 0.4 * hash01('acq', q));
      const cy = y0 + ph * ph * 520;
      const r = 3 + 5 * hash01('acs', q);
      g.ellipse(cx, cy, r, r * 0.8).fill({ color: 0x1a120c, alpha: k * (1 - ph) });
    }
    // The beam: straight down, a hard core in a wider soft band (moonlight, not a lamp: it starts at the roof, long).
    const sh = this.anchorShaft.clear();
    const yEnd = y0 + (y1 - y0) * Math.min(1, k * 1.25);
    // (Uniform bands read as a lit tube with the column lost in it: it fades down its length, and the moths in it stay
    // the brightest things.)
    const SEG = 12;
    A.bands.forEach((a, i) => {
      const wk = 1 - i * 0.3;
      for (let q = 0; q < SEG; q++) {
        const t0 = q / SEG;
        const t1 = (q + 1) / SEG;
        const ya = y0 + (yEnd - y0) * t0;
        const yb = y0 + (yEnd - y0) * t1;
        const ha = ((A.w0 + (A.w1 - A.w0) * t0) * wk) / 2;
        const hb = ((A.w0 + (A.w1 - A.w0) * t1) * wk) / 2;
        const fall = 1 - A.fade * ((t0 + t1) / 2);
        sh.poly([x0 - ha, ya, x0 + ha, ya, x0 + hb, yb, x0 - hb, yb]).fill({
          color: i === 2 ? M.core : M.color,
          alpha: a * k * breathe * fall,
        });
      }
    });
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = y0 + (yEnd - y0) * t;
      const w = A.w0 + (A.w1 - A.w0) * t;
      this.beam.add(x0, y, w * 0.55, M.color, A.glow * breathe * k * (1 - 0.5 * t), 130, 0);
    }
    this.beam.add(x0, y1 - 6, A.w1 * 0.8, M.core, A.pool * k * breathe, 34);
    this.lightAnchor.x = x0;
    this.lightAnchor.y = (y0 + y1) / 2 + 120;
    this.lightAnchor.radius = M.light;
    this.lightAnchor.intensity = M.intensity * k;
    // Dust drifting down through it, lit.
    for (let i = 0; i < M.motes; i++) {
      const h = hash01('am', i);
      const u = (clock * (0.02 + 0.03 * h) + h) % 1;
      const y = y0 + (y1 - y0) * u;
      if (y > yEnd) continue;
      const half = (A.w0 + (A.w1 - A.w0) * u) * 0.45;
      const x = x0 + Math.sin(clock * 0.5 + i * 2.3) * half * (hash01('amx', i) - 0.5) * 2;
      this.glowFront.add(x, y, 2.5 + 3 * h, 0xf2f6ff, 0.6 * k * Math.sin(Math.PI * u));
    }
  }

  /** The roof's gate open: moonlight down the shaft onto the floor, motes in it; for good once the cage is out. */
  private drawMoon(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    const G = this.gate;
    if (!G) return;
    const gi = ((sim.scene as { gates?: Array<{ id: string }> }).gates ?? []).findIndex((q) => q.id === G.id);
    const open = gi >= 0 && (sim.kit.gates[gi] ?? 0) > 0;
    const freed = sim.save.flags.includes(`${(this.lure as { sets?: string }).sets ?? '-'}`);
    if (this.moonT < 0 && (open || freed)) this.moonT = 99;
    if (this.moonT < 0) {
      this.lightMoon.intensity = 0;
      return;
    }
    this.moonT += dt;
    const M = KEEPER.moon;
    const k = Math.min(1, this.moonT / M.in);
    const kk = k * k * (3 - 2 * k);
    const x0 = G.x + G.w / 2;
    const y0 = G.y + G.h;
    // It lands on the floor, or on the rubble under the shaft once the slope has come down (shut rubble gates).
    const scene = sim.scene as { gates?: Array<{ id: string }> };
    const shut = (id: string): boolean => {
      const i = (scene.gates ?? []).findIndex((q) => q.id === id);
      return i >= 0 && (sim.kit.gates[i] ?? 0) <= 0 && sim.save.flags.includes('cn-den-collapse');
    };
    let y1 = this.floorY;
    for (const r of this.rubble) if (x0 >= r.x && x0 <= r.x + r.w && r.y < y1 && shut(r.id)) y1 = r.y;
    const breathe = 0.88 + 0.12 * Math.sin(clock * 0.7);
    const slant = -30;
    const x1 = x0 + slant;
    // The shaft: three nested bands, the core narrow and nearly white.
    const g = this.shaft.clear();
    // (Landing on the rubble just under the gate it is short: a hard-edged band there read as a lampshade; glow only.)
    const long = y1 - y0 > 380;
    M.shaft.forEach((a, i) => {
      if (!long) return;
      const wk = 1 - i * 0.3;
      const ha = (M.w0 * wk) / 2;
      const hb = (M.w1 * wk) / 2;
      const yEnd = y0 + (y1 - y0) * kk;
      g.poly([x0 - ha, y0 - 40, x0 + ha, y0 - 40, x1 + hb, yEnd, x1 - hb, yEnd]).fill({
        color: i === 2 ? M.core : M.color,
        alpha: a * kk * breathe,
      });
    });
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = y0 + (y1 - y0) * t * kk;
      const w = M.w0 + (M.w1 - M.w0) * t;
      this.beam.add(x0 + slant * t, y, w * 0.5, M.color, M.alpha * breathe * kk * (1 - 0.35 * t), 120, 0);
    }
    // Where it lands: a bright pool, and its wash down the slope westward (the rubble's tops catch it).
    this.beam.add(x1, y1 - 6, M.w1 * 0.7, M.core, 0.3 * kk * breathe, 36);
    if (y1 < this.floorY - 40)
      for (const r of this.rubble) {
        if (!shut(r.id) || r.x > x0 + M.w1) continue;
        const d = Math.max(0, x0 - (r.x + r.w / 2));
        const fall = Math.max(0, 1 - d / M.wash[0]) * Math.max(0, 1 - (r.y - y1) / M.wash[1]);
        if (fall > 0.02) this.beam.add(r.x + r.w / 2, r.y + 10, r.w * 0.8, M.color, M.washA * fall * kk, 34);
      }
    this.lightMoon.x = x1 - 120;
    this.lightMoon.y = (y0 + y1) / 2 + 160;
    this.lightMoon.radius = M.light;
    this.lightMoon.intensity = M.intensity * kk;
    // Dust drifting through it, lit.
    for (let i = 0; i < M.motes; i++) {
      const h = hash01('mm', i);
      const u = (clock * (0.025 + 0.03 * h) + h) % 1;
      const y = y1 - (y1 - y0) * u;
      const t = (y - y0) / Math.max(1, y1 - y0);
      const half = (M.w0 + (M.w1 - M.w0) * t) * 0.45;
      const x = x0 + slant * t + Math.sin(clock * 0.6 + i * 2.3) * half * (hash01('mx', i) - 0.5) * 2;
      this.glowFront.add(x, y, 2.5 + 3 * h, 0xf2f6ff, 0.6 * kk * Math.sin(Math.PI * u));
    }
    void cam;
  }

  private drawDust(dt: number): void {
    // While the roof groans, grit keeps pouring off its edges (the fallback's collapse).
    if (this.groanT >= 0 && this.gate) {
      this.groanT += dt;
      const n = Math.floor(KEEPER.dust.rate * dt + hash01('dg', Math.floor(this.groanT * 60)));
      for (let i = 0; i < n; i++) {
        const h = hash01(`dg${Math.floor(this.groanT * 600)}`, i);
        this.burstDust(this.gate.x - 1800 * h, this.gate.y + 10, 1, 0.5);
      }
    }
    const g = this.front;
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i] as Mote;
      d.t += dt;
      if (d.t > d.life || d.y > this.floorY) {
        this.dust.splice(i, 1);
        continue;
      }
      d.vy += 380 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      g.circle(d.x, d.y, d.s).fill({ color: KEEPER.dust.color, alpha: 0.7 * (1 - d.t / d.life) });
      // A trail of finer grit behind each.
      g.rect(d.x - 0.6, d.y - d.vy * 0.05, 1.2, d.vy * 0.05).fill({ color: KEEPER.dust.color, alpha: 0.35 });
    }
  }

  /** A glance off the dome (an amber flash and a short arc) and the sweep's arc of dust along the floor. */
  private drawGlances(dt: number): void {
    for (let i = this.glances.length - 1; i >= 0; i--) {
      const q = this.glances[i] as (typeof this.glances)[number];
      q.t += dt;
      const u = q.t / 0.28;
      if (u >= 1) {
        this.glances.splice(i, 1);
        continue;
      }
      const col = q.gate ? 0xfff2dc : q.lit ? 0xffc070 : 0xffa040;
      const G = KEEPER.glance;
      // (The gate's own look, review r13 #7: the plates flare pale over the dome; r15 fixes: softer, it read as smoke.)
      if (q.gate) this.glowFront.add(q.x, q.y + 20, 150 * (0.7 + 0.5 * u), col, G.haze * (1 - u), 90);
      this.glowFront.add(q.x, q.y, 70 * (0.6 + u), col, 0.55 * (1 - u));
      // The clang: a white-hot star where the blade met the shell, its long rays along the blade's line.
      const st = q.t / G.star;
      if (st < 1) {
        const k = 1 - st;
        const L = G.rays * (0.55 + 0.45 * k);
        const g = this.front;
        for (let r = 0; r < 6; r++) {
          const a = (r * Math.PI) / 3 + 0.2 * q.dir;
          const len = L * (r % 3 === 0 ? 1 : 0.5);
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          g.moveTo(q.x - cx * len, q.y - cy * len)
            .lineTo(q.x + cx * len, q.y + cy * len)
            .stroke({ color: r % 3 === 0 ? 0xffffff : col, width: (r % 3 === 0 ? 4.6 : 2.6) * k, alpha: k });
        }
        g.circle(q.x, q.y, G.core * 0.35 * (0.6 + 0.4 * k)).fill({ color: 0xffffff, alpha: k });
        this.glowFront.add(q.x, q.y, G.core * 2.4, 0xfff6e8, 0.8 * k);
      }
      // A short ring off the shell, and the arc it rang along.
      const ru = q.t / G.ring;
      if (ru < 1)
        this.front
          .circle(q.x, q.y, 18 + 46 * ru)
          .stroke({ color: 0xfff6e8, width: 2.4 * (1 - ru), alpha: 0.8 * (1 - ru) });
      this.front
        .arc(q.x, q.y, 26 + 30 * u, -Math.PI * 0.9, -Math.PI * 0.1)
        .stroke({ color: col, width: 3 * (1 - u), alpha: 0.9 * (1 - u) });
    }
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const w = this.sweeps[i] as (typeof this.sweeps)[number];
      w.t += dt;
      const u = w.t / w.secs;
      if (u >= 1.6) {
        this.sweeps.splice(i, 1);
        continue;
      }
      const a = u < 1 ? Math.sin(Math.PI * Math.min(1, u * 1.4)) : Math.max(0, 1.6 - u) / 0.6;
      const reach = w.x0 + (w.x1 - w.x0) * Math.min(1, u * 1.3);
      for (let x = Math.min(w.x0, reach); x < Math.max(w.x0, reach); x += 26) {
        const h = hash01('sw', Math.round(x));
        this.front.ellipse(x, w.y - 8 - 10 * h, 18 + 10 * h, 7).fill({ color: 0xcfc4ae, alpha: 0.32 * a });
      }
    }
  }

  /** The sweep's tell and strike (keeper-tells.ts): raised claws over it, the arc on the floor, dust off the floor. */
  private drawSweepTell(dt: number, clock: number, sim: SimView, kb: Partial<KeeperBoss> | null): void {
    const W = KEEPER.sweep;
    const e = sim.enemies.find((q) => q.kind === 'oldBurrback' && !q.gone);
    if (!e) return;
    const rd = sweepRead(sim.boss, e, tuning.keeper, this.sweepR);
    const on = rd.tell >= 0 || rd.strike >= 0 ? 1 : 0;
    this.sweepK = on ? Math.min(1, this.sweepK + dt / 0.12) : Math.max(0, this.sweepK - dt / 0.35);
    if (this.sweepK <= 0.003) return;
    const k = this.sweepK;
    const u = rd.strike >= 0 ? 1 : Math.max(0, rd.tell);
    const g = this.front;
    const f = e.facing;
    const H = e.h * W.drawK;
    const feet = e.y + e.h;
    const cx = e.x + e.w / 2;
    // --- The arc on the floor where the claws will land (the sim's box: the cage's x +- sweepHitPx).
    const ax0 = typeof kb?.tellX0 === 'number' && kb.tellX1 !== kb.tellX0 ? kb.tellX0 : null;
    const cageX = ax0 !== null ? (ax0 + (kb?.tellX1 as number)) / 2 : (kb?.cageX ?? this.lure.x);
    const reach = ax0 !== null ? Math.abs((kb?.tellX1 as number) - ax0) / 2 : tuning.keeper.sweepHitPx;
    const fy = this.floorY;
    const pulse = 0.75 + 0.25 * Math.sin(clock * (10 + 14 * u));
    const ak = k * (0.35 + 0.65 * u) * pulse * (rd.strike >= 0 ? 1.4 : 1);
    for (let i = 0; i <= 6; i++) {
      const x = cageX - reach + (2 * reach * i) / 6;
      this.glowFront.add(x, fy - 6, reach * 0.42, W.arc, 0.12 * ak, 22);
    }
    for (let s2 = 0; s2 < 3; s2++) {
      const off = (s2 - 1) * 26;
      const lift = 34 + 10 * s2;
      g.moveTo(cageX - reach + off * 0.3, fy - 2)
        .quadraticCurveTo(cageX + off, fy - lift, cageX + reach + off * 0.3, fy - 2)
        .stroke({ color: W.arc, width: 2.5, alpha: Math.min(1, 0.85 * ak), cap: 'round' });
    }
    // Dust lifting off the floor in the box (the claws' wind).
    this.sweepDust += dt * W.dust * k * (0.4 + u);
    while (this.sweepDust >= 1) {
      this.sweepDust -= 1;
      const h = hash01('swd', this.puffs.length + Math.floor(clock * 60));
      this.puffs.push({
        x: cageX - reach + 2 * reach * h,
        y: fy - 4,
        vx: (hash01('swx', Math.floor(clock * 97)) - 0.5) * 40,
        vy: -90 - 120 * hash01('swy', Math.floor(clock * 61)),
        t: 0,
        life: 0.9,
        s: 2 + 2.5 * h,
        seed: h,
      });
    }
    // --- The claws: two scythes off the reared front (the far one darker, behind), raised, trembling; struck, down
    // through the floor's arc.
    const S = H / 150;
    for (const far of [1, 0]) {
      const bx = cx + f * (e.w * 0.42 - far * 26);
      const by = feet - H * (0.42 + 0.4 * u) - far * 10;
      const shake = (1 - far * 0.4) * u * 5 * Math.sin(clock * 47 + far * 2);
      let tx: number;
      let ty: number;
      if (rd.strike >= 0) {
        const v = rd.strike;
        tx = cx + f * (H * (0.8 + 0.5 * v) - far * 34);
        ty = fy - 30 - 50 * (1 - v);
      } else {
        tx = bx + f * H * W.len * (0.45 - 0.1 * far) + shake;
        ty = by - H * W.len * (0.35 + 0.35 * u) + shake;
      }
      // The elbow bows back over it: a mantis's raised foreleg.
      const ex = (bx + tx) / 2 - f * 26 * S;
      const ey = Math.min(by, ty) - 26 * S;
      // The blade: a hooked sickle hanging off the tip, its point down and forward, the inner edge serrated.
      const L = 62 * S;
      const ang = rd.strike >= 0 ? 0.25 : 0.95 - 0.25 * u;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const P = (x: number, y: number): [number, number] => [
        tx + f * (x * ca - y * sa),
        ty + x * sa + y * ca,
      ];
      const blade: number[] = [];
      const outer: Array<[number, number]> = [
        [-4, -6],
        [0.35 * L, -12 * S],
        [0.75 * L, -6 * S],
        [L, 6 * S],
        [1.05 * L, 18 * S],
      ];
      const inner: Array<[number, number]> = [
        [0.85 * L, 8 * S],
        [0.7 * L, 6 * S],
        [0.62 * L, 10 * S],
        [0.5 * L, 4 * S],
        [0.42 * L, 9 * S],
        [0.3 * L, 3 * S],
        [0.1 * L, 7 * S],
        [-4, 8],
      ];
      for (const [x, y] of [...outer, ...inner]) blade.push(...P(x, y));
      g.moveTo(bx, by)
        .quadraticCurveTo(ex, ey, tx, ty)
        .stroke({ color: W.dark, width: (20 - far * 5) * S, alpha: 0.97 * k, cap: 'round' });
      g.poly(blade).fill({ color: W.dark, alpha: 0.97 * k });
      if (!far) {
        g.poly(blade).stroke({ color: W.rim, width: 3, alpha: (0.5 + 0.5 * u) * k });
        g.moveTo(bx, by)
          .quadraticCurveTo(ex, ey, tx, ty)
          .stroke({ color: W.rim, width: 2.5, alpha: (0.3 + 0.45 * u) * k, cap: 'round' });
        const [px, py] = P(1.05 * L, 18 * S);
        this.glowFront.add(px, py, 30 + 26 * u, W.rim, (0.2 + 0.35 * u) * k);
      }
    }
  }

  /** The slam's wave along the floor: a crack lit behind each front, dust off the fronts, the floor's flash. */
  private drawWaveCrack(dt: number, clock: number, sim: SimView): void {
    const V = KEEPER.wave;
    this.drawWaveTell(dt, clock);
    const e = sim.enemies.find((q) => q.kind === 'oldBurrback' && !q.gone);
    const fy = this.floorY;
    if (e && e.wave > 0) {
      if (this.crackT !== -1) {
        // A new slam: the floor flashes, the crack starts under it.
        this.crackX = e.waveX;
        this.crackL = this.crackR = 0;
        this.flashT = 0;
      }
      this.crackT = -1;
      this.crackL = Math.max(this.crackL, e.wave);
      this.crackR = Math.max(this.crackR, e.wave);
      // Dust kicked up at each front.
      this.waveDust += dt * V.dust;
      while (this.waveDust >= 1) {
        this.waveDust -= 1;
        for (const side of [-1, 1]) {
          const h = hash01('wd', this.puffs.length + side);
          this.puffs.push({
            x: e.waveX + side * e.wave - side * 20 * h,
            y: fy - 3,
            vx: side * (40 + 60 * h),
            vy: -120 - 160 * hash01('wdy', this.puffs.length),
            t: 0,
            life: 0.8 + 0.5 * h,
            s: 2.5 + 3 * h,
            seed: h,
          });
        }
      }
      // The floor ahead of each front stays lit: it is still coming (r15 fixes).
      const R = this.waveReach;
      if (R) {
        const sk = Math.max(0, 1 - e.wave / Math.max(1, Math.max(e.waveX - R.x0, R.x1 - e.waveX)));
        this.seam(
          dt,
          clock,
          e.waveX,
          e.wave,
          R.x0,
          R.x1,
          R.y,
          V.color,
          0.38 + 0.22 * sk,
          KEEPER.wave.seam.raceSpeed,
        );
      }
    } else if (this.crackT === -1) {
      this.crackT = 0;
      this.waveReach = null;
    } else if (this.crackT >= 0) this.crackT += dt;
    // The floor's flash as it lands.
    if (this.flashT >= 0) {
      this.flashT += dt;
      const u = this.flashT / V.flash;
      if (u >= 1) this.flashT = -1;
      else
        for (let i = -6; i <= 6; i++)
          this.glowFront.add(
            this.crackX + i * 220,
            fy - 4,
            200,
            V.hot,
            V.flashA * (1 - u) * (1 - Math.abs(i) / 8),
            14,
          );
    }
    if (this.crackT === -2 || this.crackT > V.fade) return;
    const fade = this.crackT < 0 ? 1 : 1 - this.crackT / V.fade;
    const g = this.front;
    for (const side of [-1, 1]) {
      const reach = side < 0 ? this.crackL : this.crackR;
      if (reach < 8) continue;
      // A jagged lit line along the floor's lip, brightest at the front, a dark split under it.
      const n = Math.max(2, Math.ceil(reach / 24));
      const pts: number[] = [];
      for (let q = 0; q <= n; q++) {
        const d = (q / n) * reach;
        const jag = q === 0 || q === n ? 0 : (hash01('ck', q * side + 500) - 0.5) * 7;
        pts.push(this.crackX + side * d, fy + 2 + jag);
      }
      g.poly(pts, false).stroke({ color: 0x050302, width: 8, alpha: 0.85 * fade });
      for (let q = 0; q < n; q++) {
        const u = (q + 0.5) / n;
        const a = (0.25 + 0.75 * u * u) * fade;
        g.moveTo(pts[q * 2] as number, (pts[q * 2 + 1] as number) - 1)
          .lineTo(pts[q * 2 + 2] as number, (pts[q * 2 + 3] as number) - 1)
          .stroke({ color: u > 0.85 ? V.hot : V.color, width: 4, alpha: a });
        // Light leaking up out of the split.
        if (q % 3 === 0)
          this.glowFront.add(pts[q * 2] as number, fy - 14, 22, V.color, 0.3 * a, 40 + 30 * hash01('cj', q));
      }
      const fx = this.crackX + side * reach;
      if (this.crackT < 0) {
        // (r15: a bright lip at the front, taller than she can ignore: a tongue of light and grit thrown up off it.)
        const lip = V.lip * (0.85 + 0.15 * Math.sin(clock * 37 + side));
        g.poly([
          fx - side * 46,
          fy,
          fx - side * 12,
          fy - lip * 0.7,
          fx + side * 2,
          fy - lip,
          fx + side * 10,
          fy,
        ]).fill({
          color: V.hot,
          alpha: 0.85 * fade,
        });
        g.poly([fx - side * 80, fy, fx - side * 30, fy - lip * 0.4, fx - side * 10, fy]).fill({
          color: V.color,
          alpha: 0.6 * fade,
        });
        this.glowFront.add(fx, fy - 24, 110, V.hot, 0.55 + 0.1 * Math.sin(clock * 40), 70);
        this.glowFront.add(fx - side * reach * 0.3, fy - 4, reach * 0.4, V.color, 0.2, 16);
      } else
        this.glowFront.add(this.crackX + side * reach * 0.5, fy - 2, reach * 0.5, V.color, 0.1 * fade, 8);
    }
  }

  /**
   * The glowing seam along the floor (r15 fixes) from `x` out both ways to `x0` / `x1`, starting `from` px out (the
   * fronts' reach: behind them the crack draws itself), continuous, light travelling outward at `speed` px/s, dust kicked
   * up off it at `dustK` of `seam.dust`.
   */
  private seam(
    dt: number,
    clock: number,
    x: number,
    from: number,
    x0: number,
    x1: number,
    fy: number,
    color: number,
    k: number,
    speed: number,
    dustK = 0.5,
  ): void {
    const Q = KEEPER.wave.seam;
    const g = this.front;
    let span = 0;
    for (const side of [-1, 1]) {
      const len = side < 0 ? x - x0 : x1 - x;
      if (len <= from + 8) continue;
      span += len - from;
      const n = Math.max(2, Math.ceil((len - from) / 24));
      let px = x + side * from;
      let py = fy - 1;
      for (let q = 1; q <= n; q++) {
        const d = from + ((len - from) * q) / n;
        const qx = x + side * d;
        const qy = fy - 1 + (hash01('sm', Math.round(d / 24) * side + 700) - 0.5) * 4;
        const wave = 0.5 + 0.5 * Math.cos(((d - clock * speed) / Q.pulse) * Math.PI * 2);
        const fall = 1 - 0.45 * (d / len);
        const a = k * fall * (0.5 + 0.5 * wave * wave);
        // A soft halo band over the floor's lip, then the split itself.
        g.moveTo(px, py - Q.halo * 0.3)
          .lineTo(qx, qy - Q.halo * 0.3)
          .stroke({ color, width: Q.halo * (0.6 + 0.4 * wave), alpha: Math.min(1, 0.22 * a) });
        g.moveTo(px, py)
          .lineTo(qx, qy)
          .stroke({ color, width: Q.width * (0.7 + 0.5 * wave), alpha: Math.min(1, a), cap: 'round' });
        // A white core where the light is passing.
        if (wave > 0.7)
          g.moveTo(px, py)
            .lineTo(qx, qy)
            .stroke({ color: 0xfff4dc, width: 3, alpha: Math.min(1, a * (wave - 0.7) * 3) });
        if (q % Math.max(1, Math.round(Q.glowStep / 24)) === 0)
          this.glowFront.add(qx, fy - 14, Q.glowR * (0.7 + 0.5 * wave), color, Q.glowA * a, 34);
        px = qx;
        py = qy;
      }
    }
    // Dust kicked up off it, where the light is passing.
    this.seamDust += dt * Q.dust * dustK * Math.min(1, span / 2000);
    while (this.seamDust >= 1) {
      this.seamDust -= 1;
      const h = hash01('sd', this.puffs.length + Math.round(clock * 60));
      const side = h < 0.5 ? -1 : 1;
      const len = side < 0 ? x - x0 : x1 - x;
      if (len <= from + 8) continue;
      const d = from + (len - from) * hash01('sdx', this.puffs.length + Math.round(clock * 97));
      this.puffs.push({
        x: x + side * d,
        y: fy - 3,
        vx: side * (20 + 50 * h),
        vy: -90 - 140 * hash01('sdy', this.puffs.length),
        t: 0,
        life: 0.6 + 0.5 * h,
        s: 2.5 + 3 * h,
        seed: h,
      });
    }
  }

  /**
   * The wave told on the floor (r15): while it rears, the floor over the wave's whole reach takes a red rim that
   * quickens to the slam and a dark shadow thrown ahead of the rear (a player facing away sees it on the ground in front
   * of her); slammed, a hot crack splits open at its feet through the fronts' delay.
   */
  private drawWaveTell(dt: number, clock: number): void {
    const V = KEEPER.wave;
    const g = this.front;
    const T = this.waveTell;
    if (T) {
      T.t += dt;
      const u = Math.min(1, (T.t * 60) / T.frames);
      if (u >= 1.3) this.waveTell = null;
      const fy = T.y;
      // One continuous split glowing along the floor over the wave's whole reach (r15 fixes: short fissures with gaps
      // read as a dashed line at play zoom), brightening and quickening to the slam, light running out along it.
      const quick = KEEPER.wave.seam.pulseSpeed * (0.6 + 1.2 * u);
      this.seam(dt, clock, T.x, 0, T.x0, T.x1, fy, V.tell, 0.45 + 0.55 * u, quick, 0.4 * u);
      for (const side of [-1, 1]) {
        // Its shadow thrown ahead along the floor as it rises.
        g.ellipse(T.x + side * 160 * u, fy + 2, 120 + 260 * u, 10).fill({ color: 0x000000, alpha: 0.35 * u });
      }
    }
    const S = this.waveSlam;
    if (S) {
      S.t += dt;
      const u = (S.t * 60) / S.frames;
      if (u >= 1.4) this.waveSlam = null;
      else {
        // The crack opening at its feet, hot, until the fronts run.
        const w = 30 + 90 * Math.min(1, u);
        const a = u < 1 ? 1 : 1 - (u - 1) / 0.4;
        g.poly([S.x - w, S.y, S.x, S.y - 10 - 18 * Math.min(1, u), S.x + w, S.y, S.x, S.y + 6]).fill({
          color: V.hot,
          alpha: 0.85 * a,
        });
        this.glowFront.add(S.x, S.y - 20, 90 + 60 * Math.min(1, u), V.hot, 0.5 * a, 50);
        // Through the delay the whole split burns hot, light racing out along it to where the wave will reach, dust
        // kicked up off it: the floor is not done (r15 fixes: a dash in after the slam met the fronts).
        if (u < 1) this.seam(dt, clock, S.x, 0, S.x0, S.x1, S.y, V.hot, 1, KEEPER.wave.seam.raceSpeed, 1);
      }
    }
  }

  /** A gate's shrug: its claws scrape the floor under it, sparks thrown along it. */
  private scrape(x: number, fy: number): void {
    for (let i = 0; i < 16; i++) {
      const h = hash01(`sp${this.sparks.length}`, i);
      const side = i % 2 === 0 ? -1 : 1;
      this.sparks.push({
        x: x + side * (60 + 80 * h),
        y: fy - 3,
        vx: side * (180 + 260 * hash01('spv', i)),
        vy: -80 - 160 * hash01('spy', i + this.sparks.length),
        t: 0,
        life: 0.35 + 0.3 * h,
        s: 1.5 + h,
        seed: h,
      });
    }
  }

  /** The sparks of a scrape, and while it is gated a slow pale sheen breathing over its dome (it cannot be hurt now). */
  private drawGate(dt: number, clock: number, sim: SimView, kb: Partial<KeeperBoss> | null): void {
    const g = this.front;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const q = this.sparks[i] as Mote;
      q.t += dt;
      if (q.t > q.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y = Math.min(this.floorY - 2, q.y + q.vy * dt);
      const a = 1 - q.t / q.life;
      g.moveTo(q.x, q.y)
        .lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03)
        .stroke({ color: 0xffd080, width: q.s, alpha: a });
    }
    const on = (kb?.gated ?? 0) > 0;
    this.gateK = on ? Math.min(1, this.gateK + dt / 0.4) : Math.max(0, this.gateK - dt / 0.6);
    if (this.gateK <= 0.01) return;
    const e = sim.enemies.find((q) => q.kind === 'oldBurrback' && !q.gone && q.mode !== 'dead');
    if (!e) return;
    const br = 0.5 + 0.5 * Math.sin(clock * 3.1);
    this.glowFront.add(
      e.x + e.w / 2,
      e.y + e.h * 0.25,
      e.w * 0.75,
      0xe8e4f0,
      0.1 * this.gateK * br,
      e.h * 0.55,
    );
  }

  private drawPuffs(dt: number): void {
    const g = this.front;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i] as Mote;
      q.t += dt;
      if (q.t > q.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      q.vx *= 1 - 2.5 * dt;
      q.vy = q.vy * (1 - 2.5 * dt) + 60 * dt;
      q.x += q.vx * dt + Math.sin(q.t * 9 + q.seed * 20) * 12 * dt;
      q.y += q.vy * dt;
      g.ellipse(q.x, q.y, q.s, q.s * 0.5).fill({ color: 0xd8ccb0, alpha: 0.8 * (1 - q.t / q.life) });
    }
  }

  destroy(): void {
    this.lights.remove('keeper-cage');
    this.lights.remove('keeper-moon');
    this.lights.remove('keeper-anchor');
  }
}

const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * A look probe (`window.__keeper = {phase: 2 | 3, x?, y?}`): moves the great cage's drawn flame (`at`, in place) to a
 * phase's place before the sim drives it (P2 a 4 s swing, P3 on the floor), and says which phase. Never set in play.
 */
export function keeperFake(
  at: { x: number; y: number },
  clock: number,
  lure: { x: number; y: number },
  floorY: number,
): { phase?: number } | undefined {
  const fake = (globalThis as { __keeper?: { phase?: number; x?: number; y?: number } }).__keeper;
  if (!fake?.phase) return undefined;
  if (fake.phase === 2) {
    const a = Math.sin((clock * Math.PI * 2) / 4) * 0.75;
    at.x = fake.x ?? lure.x - 300 + Math.sin(a) * 1000;
    at.y = fake.y ?? lure.y - 500 + Math.cos(a) * 640;
  }
  if (fake.phase === 3) {
    at.x = fake.x ?? at.x;
    at.y = fake.y ?? floorY - 60;
  }
  return fake;
}
/** Hung -> swinging by `s`, then -> fallen by `f`. */
const lerp3 = (a: number, b: number, c: number, s: number, f: number): number => lerpN(lerpN(a, b, s), c, f);
