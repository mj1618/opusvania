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
import type { LightRegistry, PointLight } from '../lights';
import type { SceneContext } from '../scene/index';
import { type DenColumn, denColumnsOf, interiorPlan } from '../scene/lib/interior';
import { mix } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import { GlowPool } from './glow';
import { moth } from './lamps';
import { releaseGreat } from './release';

export const KEEPER = {
  /** The cage's light on the back: its colour, the pool's reach (px) and strength by phase (hung, swinging, fallen). */
  light: { color: 0xffb06a, reach: 760, pool: [0.1, 0.2, 0.26] as const },
  /**
   * The shadows: how far behind its caster the back is (shadow = P + (P - L) * k), how dark by phase (hung, swinging,
   * fallen), the penumbra's spread (x the caster's width), and how far from the light a caster still throws one.
   */
  shadow: { k: 0.55, alpha: [0.3, 0.62, 0.55] as const, soft: 0.6, reach: 1900, color: 0x0a0604 },
  /**
   * The dark outside the light (P2 / P3): behind the playfield and over it (so she, the Keeper and the floor fall
   * into it too, less), the hole's radius round the cage (px; fallen: wider than tall, from the floor), in / out (s).
   */
  dark: { back: 0.62, front: 0.3, r: 720, fallen: [1100, 820] as const, in: 1.2, out: 2.5, color: 0x050208 },
  /** The falling moth: its size (px half span), pale; the tell's flutter (px), the saved moths' orbit (px). */
  moth: { size: 9, color: 0xe8e0cc, tell: 26, saved: [46, 30] as const, savedMax: 14 },
  /** P3's low cloud: drawn moths at most, its ellipse round the fallen cage (px), how low over the floor. */
  low: { max: 90, rx: 520, ry: 110, over: 110, size: [6, 10] as const, color: 0xf0d8b0 },
  /** The column: moths drawn, seconds to rise, its width (px), where it goes once through the gate (up the shaft). */
  column: {
    n: 140,
    secs: [3.6, 6] as const,
    w: 170,
    size: [7, 12] as const,
    color: 0xf4ecd8,
    cool: 0xd8e6ff,
  },
  /** The moonbeam down the shaft: its colour, alpha, width at the gate and at the floor (px), the light's reach. */
  moon: { color: 0xcfe0ff, alpha: 0.15, w0: 190, w1: 520, light: 900, in: 2.2 },
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

interface Riser {
  /** Start (the cage), the gate, then up the shaft and east along the passage. */
  x0: number;
  y0: number;
  t: number;
  secs: number;
  seed: number;
  s: number;
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
  /** Shadow casters that are the room's own ledges and narrow solids in the arena. */
  private readonly ledges: Array<{ x: number; y: number; w: number; h: number }> = [];
  private readonly shadows = new Graphics();
  private readonly pool = new GlowPool('keeper-pool');
  private readonly darkBack = new Dark(KEEPER.dark.color);
  private readonly darkFront = new Dark(KEEPER.dark.color);
  private readonly front = new Graphics();
  private readonly glowFront = new GlowPool('keeper-glow');
  private readonly beam = new GlowPool('keeper-beam');
  /** 0..1 eased: how much the swing's / the floor's dark is in. */
  private darkK = 0;
  private fallenK = 0;
  private swingK = 0;
  /** Seconds since the roof's gate opened (-1 = shut); the shaft (gate rect) it lets moonlight down. */
  private moonT = -1;
  private readonly gate: { x: number; y: number; w: number; h: number; id: string } | null;
  private readonly floorY: number;
  private readonly risers: Riser[] = [];
  private readonly puffs: Mote[] = [];
  private readonly dust: Mote[] = [];
  private groanT = -1;
  private feedT = -1;
  private feedX = 0;
  private feedY = 0;
  private readonly lightCage: PointLight = { x: 0, y: 0, radius: 0, color: KEEPER.light.color, intensity: 0 };
  private readonly lightMoon: PointLight = { x: 0, y: 0, radius: 0, color: KEEPER.moon.color, intensity: 0 };

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
    // The ledges she fights round (one-ways) and the narrow solids standing in the den's air (the taproot).
    for (const o of scene.oneWays) this.ledges.push({ x: o.x, y: o.y, w: o.w, h: 44 });
    for (const s of scene.solids)
      if (s.w <= 260 && s.h >= 200 && s.y > 200 && s.y + s.h < scene.height - 60) this.ledges.push({ ...s });
    const gates =
      (scene as { gates?: Array<{ id: string; x: number; y: number; w: number; h: number }> }).gates ?? [];
    const g = gates.find((q) => q.id.endsWith('roof')) ?? null;
    this.gate = g ? { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h } : null;
    // The arena's floor: the highest solid top under the cage.
    let fy = scene.height;
    for (const s of scene.solids)
      if (this.lure.x >= s.x && this.lure.x <= s.x + s.w && s.y > this.lure.y && s.y < fy) fy = s.y;
    this.floorY = fy;
    const back = ctx.layers.get('airBack');
    back.addChild(this.darkBack.container, this.pool.container, this.shadows);
    ctx.layers.air.addChild(
      this.darkFront.container,
      this.beam.container,
      this.front,
      this.glowFront.container,
    );
    lights.set('keeper-cage', this.lightCage);
    lights.set('keeper-moon', this.lightMoon);
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
        case 'enemyFeed':
          this.feedT = 0;
          this.feedX = e.x ?? 0;
          this.feedY = e.y ?? 0;
          this.scales(this.feedX, this.feedY - 30, 14, 0.9);
          break;
        case 'mothEaten':
          this.scales(e.x ?? 0, e.y ?? 0, 6 + 4 * ((e.n as number) ?? 1), 0.8);
          break;
        case 'cageRelease':
          if ((e.lure as string) === this.lure.id)
            this.rise(e.x ?? 0, e.y ?? 0, (e.moths as number) ?? 30, 0.5);
          break;
        case 'lureSnuff':
          if ((e.id as string) === this.lure.id) this.rise(e.x ?? 0, e.y ?? 0, KEEPER.column.n, 1);
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

  /** Moths rising from (x, y) to the roof's gate and up the shaft (`k` of the column's count, scaled by `n`). */
  private rise(x: number, y: number, n: number, k: number): void {
    const C = KEEPER.column;
    const count = Math.round(Math.min(C.n, Math.max(12, n * 1.15)) * (k < 1 ? 0.6 : 1));
    for (let i = 0; i < count; i++) {
      const seed = hash01(`rise${this.risers.length}`, i);
      this.risers.push({
        x0: x + (hash01('rx', i + this.risers.length) - 0.5) * 120,
        y0: y + (hash01('ry', i) - 0.5) * 60,
        t: -i * 0.012 - 0.3 * hash01('rd', i),
        secs: C.secs[0] + (C.secs[1] - C.secs[0]) * seed,
        seed,
        s: C.size[0] + (C.size[1] - C.size[0]) * hash01('rs', i),
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
    this.drawRisers(dt, clock);
    this.drawMoon(dt, clock, sim, cam);
    this.drawDust(dt);
    this.drawPuffs(dt);
    this.pool.end();
    this.glowFront.end();
    this.beam.end();
  }

  /** Every caster thrown onto the back, displaced away from the light, softer and fainter far from it. */
  private drawShadows(L: { x: number; y: number }, sim: SimView, alpha: number): void {
    const S = KEEPER.shadow;
    const g = this.shadows;
    const k = S.k;
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
    for (let i = 0; i < n; i++) {
      const h = hash01('low', i);
      const sp = (0.6 + 0.9 * hash01('lsp', i)) * (h < 0.5 ? -1 : 1);
      const a = clock * sp + h * 40;
      const r = 0.35 + 0.65 * hash01('lr', i);
      const x = L.x + Math.cos(a) * C.rx * r + Math.sin(clock * 2.1 + i) * 14;
      const y =
        fy -
        C.over * (0.3 + 0.7 * hash01('ly', i)) +
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

  /** The column: each moth rises from the cage to the roof's gate, then up the shaft and out of sight. */
  private drawRisers(dt: number, clock: number): void {
    const C = KEEPER.column;
    const g = this.front;
    const gx = this.gate ? this.gate.x + this.gate.w / 2 : this.lure.x;
    const gy = this.gate ? this.gate.y + this.gate.h : 0;
    for (let i = this.risers.length - 1; i >= 0; i--) {
      const r = this.risers[i] as Riser;
      r.t += dt;
      if (r.t < 0) continue;
      const u = r.t / r.secs;
      if (u >= 1) {
        this.risers.splice(i, 1);
        continue;
      }
      // A column: straight up off the cage to under the roof, then along under it to the gate, narrowing; then up the
      // shaft and away.
      const yMid = gy + 260;
      const spread = C.w * (r.seed - 0.5);
      const wob = Math.sin(clock * (3 + r.seed * 4) + r.seed * 30) * 18;
      let x: number;
      let y: number;
      if (u < 0.5) {
        const v = u / 0.5;
        const e = v * v * (3 - 2 * v);
        x = r.x0 + spread * (1 - 0.3 * e) + wob;
        y = r.y0 + (yMid - r.y0) * e;
      } else if (u < 0.82) {
        const v = (u - 0.5) / 0.32;
        const e = v * v * (3 - 2 * v);
        x = r.x0 + spread * 0.7 * (1 - e) + (gx - r.x0) * e + wob;
        y = yMid + (gy - yMid) * e - Math.sin(Math.PI * v) * 60;
      } else {
        const v = (u - 0.82) / 0.18;
        x = gx + spread * 0.3 + Math.sin(clock * 5 + r.seed * 20) * 10;
        y = gy - 280 * v;
      }
      const e = Math.min(1, u * 1.2);
      const fade = Math.min(1, r.t / 0.2) * (u > 0.9 ? (1 - u) / 0.1 : 1);
      // Gold out of the cage, cooling as they climb toward the moon.
      const col = mix(C.color, C.cool, Math.min(1, e * 1.2));
      moth(
        g,
        x,
        y,
        r.s,
        Math.abs(Math.sin(clock * (13 + r.seed * 7) + r.seed * 9)),
        r.seed > 0.5 ? 1 : -1,
        col,
        0.92 * fade,
      );
      if (i % 6 === 0) this.glowFront.add(x, y, 34, col, 0.14 * fade);
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
    const y1 = this.floorY;
    const breathe = 0.85 + 0.15 * Math.sin(clock * 0.7);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = y0 + (y1 - y0) * t * kk;
      const w = M.w0 + (M.w1 - M.w0) * t;
      // (The beam slants a little west, the moon's side.)
      const x = x0 - 30 * t;
      this.beam.add(x, y, w * 0.5, M.color, M.alpha * breathe * kk * (1 - 0.45 * t), 120, 0);
    }
    this.beam.add(x0 - 30, y1 - 10, M.w1 * 0.6, M.color, 0.22 * kk * breathe, 40);
    this.lightMoon.x = x0 - 80;
    this.lightMoon.y = (y0 + y1) / 2 + 120;
    this.lightMoon.radius = M.light;
    this.lightMoon.intensity = 0.7 * kk;
    // Motes drifting up through it.
    for (let i = 0; i < 26; i++) {
      const h = hash01('mm', i);
      const u = (clock * (0.03 + 0.03 * h) + h) % 1;
      const y = y1 - (y1 - y0) * u;
      const x =
        x0 -
        120 * (1 - u) +
        Math.sin(clock * 0.8 + i) * (M.w0 * 0.3 + 60 * (1 - u)) * (hash01('mx', i) - 0.5) * 2;
      this.glowFront.add(x, y, 3 + 2 * h, 0xeaf2ff, 0.35 * kk * Math.sin(Math.PI * u));
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
