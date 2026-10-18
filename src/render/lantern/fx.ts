/**
 * The blade's answer and her light's verbs in Lanternroot (docs/design/levels/proto-1.md §6 "What makes the attack
 * satisfying", memory/lanternroot-art.md). Render only: everything here is born of a sim event and lives on render
 * time, so it plays inside the sim's hitstop (as in HK) and every capture repeats.
 *
 *  - **A blow lands** (`slashHit` on a creature): a flash of white-gold where the blade met it (the blow lights the
 *    struck side), a bright cut line across it, sparks thrown the way the cut went.
 *  - **It pays** (`glowGain`): sparks of the creature's light streak from the contact into her, staggered, and her
 *    aura steps up a pip (`player.glow`: her light's reach 140 -> 260 px, a cool point light).
 *  - **A kill pops** (`enemyDie`): a ring and a burst in the creature's colour, a puff of motes.
 *  - **Clangs** (`enemyBlock`, `kitClang`): a cold white star and sparks thrown back; heartwood answers duller, with
 *    wood chips. A cut into a wall (`slashTerrain`): sparks off the face. Bark: chips and spore dust; broken, a
 *    shower of plates.
 *  - **Pogo**: a ring under her feet. **Hurt**: a star where the blow met her (never white on her).
 *  - **Kindle**: her light pours out of her into the bud. **Mend**: light drawn into her while she holds, a pulse when
 *    it lands. **Gust**: a crescent of air with motes in it flying along the puff, a flare where it meets something.
 */
import type { Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { SimView } from '../contract';
import type { LightRegistry } from '../lights';
import { mix } from '../scene/lib/look';
import { hash01 } from './config';
import type { GlowPool } from './glow';

export const FX = {
  flash: 0xfff2d8,
  spark: 0xffe6b8,
  silver: 0xdfeaff,
  glow: 0xbfe0ff,
  clang: 0xe8f0ff,
  wood: 0xb08050,
  chip: 0x5a3a24,
  hurt: 0xffffff,
  gust: 0xd8e6f2,
  /** A creature's colour for its kill burst (by kind). */
  kill: {
    burrback: 0xffb070,
    juvenileBurrback: 0xffc080,
    dangler: 0xd0a0ff,
    hawker: 0xa8d0ff,
    gloamweaver: 0xffd090,
  } as Record<string, number>,
  /** Her aura: reach (px) empty and full, colour, strength. */
  aura: { r0: 140, r1: 260, color: 0xbcd4f4, k: 0.55 },
  /** A spark's flight into her (s), and the stagger between them. */
  flight: 0.3,
  stagger: 0.05,
} as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: number;
  kind: 'spark' | 'chip' | 'mote' | 'home' | 'ring' | 'star' | 'line' | 'flash' | 'pour' | 'puff' | 'link';
  /** Ring / line: radius / angle; home: delay before it flies. */
  a: number;
  b: number;
}

const MAX = 600;

export class Fx {
  private readonly list: Particle[] = [];
  private seq = 0;
  /** Her aura, eased toward her glow. */
  private aura = -1;
  private readonly lightId = 'lr-aura';
  /** Seconds since the moon-hole opened in this fight (-1: shut). */
  private moonflood = -1;

  /** The arena's moon-hole (the room's `moonholes` mark nearest the boss's hub). */
  private moonholeOf(sim: SimView): { x: number; y: number } {
    const holes =
      (sim.scene.marks as { moonholes?: Array<{ x: number; y: number }> } | undefined)?.moonholes ?? [];
    const hub = (sim.scene.boss as { hub?: { x: number; y: number } } | undefined)?.hub ?? { x: 0, y: 0 };
    let best = holes[0] ?? { x: hub.x, y: 0 };
    for (const h of holes) if (Math.abs(h.x - hub.x) < Math.abs(best.x - hub.x)) best = h;
    return best;
  }

  constructor(private readonly lights: LightRegistry) {}

  private add(p: Omit<Particle, 'age'>): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ ...p, age: 0 });
  }

  private r(): number {
    return hash01('fx', this.seq++);
  }

  onEvents(events: readonly SimEvent[], sim: SimView): void {
    const p = sim.player;
    if (
      events.some((e) => e.type === 'roomEnter') ||
      events.some((e) => (e as { type: string }).type === 'bossUnlock')
    )
      this.moonflood = -1;
    for (const e of events) {
      const ev = e as unknown as Record<string, unknown> & { type: string };
      switch (ev.type) {
        case 'slashHit': {
          const kind = (ev.target as { kind?: string } | undefined)?.kind ?? '';
          if (
            kind === 'pod' ||
            kind === 'lure' ||
            kind === 'thorns' ||
            kind === 'bark' ||
            kind === 'seedCase'
          )
            break;
          const x = ev.x as number;
          const y = ev.y as number;
          // Where the blade met it: on its side toward her.
          const dx = (ev.px as number) - x;
          const dy = (ev.py as number) - y;
          const d = Math.hypot(dx, dy) || 1;
          const cx = x + (dx / d) * 18;
          const cy = y + (dy / d) * 14;
          const heavy = (ev.power as number) > 1 || ev.weight === 'heavy';
          const kill = ev.kill === true;
          this.add({
            kind: 'flash',
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: 0.09,
            size: heavy ? 70 : 52,
            color: FX.flash,
            a: 0,
            b: 0,
          });
          const dir = ev.dir as string;
          const facing = (ev.facing as number) || 1;
          const ang = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : facing > 0 ? 0 : Math.PI;
          // The cut line: across the struck body, along the swing.
          this.add({
            kind: 'line',
            x,
            y,
            vx: 0,
            vy: 0,
            life: 0.12,
            size: heavy ? 80 : 58,
            color: FX.flash,
            a: ang + (dir === 'fwd' ? -0.5 * facing : 0.3),
            b: 0,
          });
          const n = heavy ? 12 : 8;
          for (let k = 0; k < n; k++) {
            const a = ang + (this.r() - 0.5) * 1.3;
            const sp = 380 + this.r() * 520;
            this.add({
              kind: 'spark',
              x: cx,
              y: cy,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - 60,
              life: 0.16 + this.r() * 0.16,
              size: 1.6 + this.r() * 1.4,
              color: this.r() < 0.5 ? FX.spark : FX.silver,
              a: 0,
              b: 0,
            });
          }
          if (ev.pogo)
            this.add({
              kind: 'ring',
              x: p.cx,
              y: p.feetY + 6,
              vx: 0,
              vy: 0,
              life: 0.28,
              size: 46,
              color: FX.silver,
              a: 0,
              b: 0,
            });
          if (kill) {
            const c = FX.kill[kind] ?? FX.spark;
            this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.4, size: 110, color: c, a: 0, b: 0 });
            for (let k = 0; k < 18; k++) {
              const a = this.r() * Math.PI * 2;
              const sp = 160 + this.r() * 360;
              this.add({
                kind: 'mote',
                x,
                y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 80,
                life: 0.5 + this.r() * 0.5,
                size: 2 + this.r() * 2.5,
                color: mix(c, 0xffffff, this.r() * 0.5),
                a: 0,
                b: 0,
              });
            }
          }
          break;
        }
        case 'glowGain': {
          // Sparks of light from where it came from into her, one per spark gained (a few at most).
          const n = Math.min(6, (ev.n as number) || 1);
          const x = (ev.x as number) ?? p.cx;
          const y = (ev.y as number) ?? p.cy;
          const from = ev.from as string;
          const c = from === 'snuff' ? 0xffc080 : from === 'glint' ? FX.silver : FX.glow;
          for (let k = 0; k < n; k++) {
            const a = this.r() * Math.PI * 2;
            this.add({
              kind: 'home',
              x: x + Math.cos(a) * 10,
              y: y + Math.sin(a) * 10,
              vx: Math.cos(a) * 260,
              vy: Math.sin(a) * 260 - 120,
              life: FX.flight + k * FX.stagger + 0.25,
              size: 2.6,
              color: c,
              a: k * FX.stagger,
              b: 0,
            });
          }
          break;
        }
        case 'enemyBlock': {
          const x = ev.hitX as number;
          const y = ev.hitY as number;
          this.clang(x, y, -(((ev.dir as number) || 1) as number), FX.clang, false);
          break;
        }
        case 'kitClang': {
          const heart = ev.kind === 'heartwood';
          this.clang(
            ev.hitX as number,
            ev.hitY as number,
            -(p.facing || 1),
            heart ? FX.wood : FX.clang,
            heart,
          );
          break;
        }
        case 'slashTerrain': {
          const x = ev.x as number;
          const y = ev.y as number;
          const nx = ev.nx as number;
          const ny = ev.ny as number;
          for (let k = 0; k < 6; k++) {
            const a = Math.atan2(ny, nx) + (this.r() - 0.5) * 1.6;
            const sp = 200 + this.r() * 300;
            this.add({
              kind: 'spark',
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0.14 + this.r() * 0.1,
              size: 1.4,
              color: FX.spark,
              a: 0,
              b: 0,
            });
          }
          for (let k = 0; k < 4; k++) {
            const a = Math.atan2(ny, nx) + (this.r() - 0.5) * 2;
            this.add({
              kind: 'chip',
              x,
              y,
              vx: Math.cos(a) * 160,
              vy: Math.sin(a) * 160 - 100,
              life: 0.5,
              size: 2.4,
              color: FX.chip,
              a: this.r() * 6,
              b: 0,
            });
          }
          break;
        }
        case 'barkHit': {
          const x = ev.x as number;
          const y = ev.y as number;
          for (let k = 0; k < 7; k++) {
            const a = -Math.PI / 2 + (this.r() - 0.5) * 2.6;
            const sp = 120 + this.r() * 260;
            this.add({
              kind: 'chip',
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0.55 + this.r() * 0.3,
              size: 2 + this.r() * 3,
              color: this.r() < 0.5 ? FX.chip : FX.wood,
              a: this.r() * 6,
              b: 0,
            });
          }
          for (let k = 0; k < 4; k++)
            this.add({
              kind: 'puff',
              x: x + (this.r() - 0.5) * 30,
              y: y + (this.r() - 0.5) * 30,
              vx: (this.r() - 0.5) * 40,
              vy: -20 - this.r() * 30,
              life: 0.7,
              size: 14,
              color: 0x8a7a5a,
              a: 0,
              b: 0,
            });
          break;
        }
        case 'barkBreak': {
          const x = ev.x as number;
          const y = ev.y as number;
          const w = (ev.w as number) || 60;
          const h = (ev.h as number) || 120;
          for (let k = 0; k < 26; k++) {
            const px = x - w / 2 + this.r() * w;
            const py = y - h / 2 + this.r() * h;
            this.add({
              kind: 'chip',
              x: px,
              y: py,
              vx: (this.r() - 0.5) * 260,
              vy: -80 - this.r() * 200,
              life: 0.9 + this.r() * 0.4,
              size: 3 + this.r() * 5,
              color: this.r() < 0.5 ? FX.chip : FX.wood,
              a: this.r() * 6,
              b: 0,
            });
          }
          for (let k = 0; k < 8; k++)
            this.add({
              kind: 'puff',
              x: x - w / 2 + this.r() * w,
              y: y - h / 2 + this.r() * h,
              vx: (this.r() - 0.5) * 60,
              vy: -30 - this.r() * 40,
              life: 1.1,
              size: 30,
              color: 0x7a6a4a,
              a: 0,
              b: 0,
            });
          break;
        }
        case 'hurt': {
          const x = (ev.hitX as number) ?? p.cx;
          const y = (ev.hitY as number) ?? p.cy;
          this.add({ kind: 'star', x, y, vx: 0, vy: 0, life: 0.18, size: 34, color: FX.hurt, a: 0, b: 0 });
          this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.3, size: 70, color: 0xffd0c0, a: 0, b: 0 });
          break;
        }
        case 'lureKindle': {
          // Her light pours out of her into the bud.
          for (let k = 0; k < 16; k++)
            this.add({
              kind: 'pour',
              x: p.cx,
              y: p.cy - 10,
              vx: ev.x as number,
              vy: ev.y as number,
              life: 0.38,
              size: 2.4 + this.r() * 1.5,
              color: FX.silver,
              a: k * 0.012,
              b: (this.r() - 0.5) * 60,
            });
          break;
        }
        case 'mend': {
          this.add({
            kind: 'ring',
            x: p.cx,
            y: p.cy,
            vx: 0,
            vy: 0,
            life: 0.45,
            size: 90,
            color: FX.glow,
            a: 0,
            b: 0,
          });
          this.add({
            kind: 'flash',
            x: p.cx,
            y: p.cy,
            vx: 0,
            vy: 0,
            life: 0.25,
            size: 90,
            color: FX.glow,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'gust': {
          this.add({
            kind: 'ring',
            x: ev.x as number,
            y: ev.y as number,
            vx: 0,
            vy: 0,
            life: 0.25,
            size: 40,
            color: FX.gust,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'gustHit': {
          this.add({
            kind: 'flash',
            x: ev.x as number,
            y: ev.y as number,
            vx: 0,
            vy: 0,
            life: 0.18,
            size: 50,
            color: FX.gust,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'mendBreak': {
          // The light she was drawing in scatters back out.
          for (let k = 0; k < 8; k++) {
            const a = this.r() * Math.PI * 2;
            this.add({
              kind: 'mote',
              x: p.cx,
              y: p.cy - 8,
              vx: Math.cos(a) * 140,
              vy: Math.sin(a) * 140,
              life: 0.35,
              size: 1.6,
              color: FX.glow,
              a: 0,
              b: 0,
            });
          }
          break;
        }
        case 'wickSet': {
          // A set burned whole: a ring out of every wick of it, and a thread of light between them.
          const ids = (ev.wicks as string[] | undefined) ?? [];
          const lures = sim.scene.lures ?? [];
          let px = Number.NaN;
          let py = Number.NaN;
          for (const id of ids) {
            const l = lures.find((q) => q.id === id);
            if (!l) continue;
            this.add({
              kind: 'ring',
              x: l.x,
              y: l.y,
              vx: 0,
              vy: 0,
              life: 0.9,
              size: 160,
              color: FX.silver,
              a: 0,
              b: 0,
            });
            this.add({
              kind: 'flash',
              x: l.x,
              y: l.y,
              vx: 0,
              vy: 0,
              life: 0.5,
              size: 90,
              color: FX.silver,
              a: 0,
              b: 0,
            });
            if (!Number.isNaN(px))
              this.add({
                kind: 'link',
                x: px,
                y: py,
                vx: l.x,
                vy: l.y,
                life: 1.2,
                size: 2,
                color: FX.silver,
                a: 0,
                b: 0,
              });
            px = l.x;
            py = l.y;
          }
          break;
        }
        case 'enemyShy': {
          // Silver light holds it off: a cold glint on it, a small flinch of light.
          this.add({
            kind: 'ring',
            x: ev.x as number,
            y: ev.y as number,
            vx: 0,
            vy: 0,
            life: 0.4,
            size: 40,
            color: FX.silver,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'enemyRespawn': {
          // A spiderling drops back in on its thread: a puff of silk dust where it appears.
          for (let k = 0; k < 6; k++) {
            const a = this.r() * Math.PI * 2;
            this.add({
              kind: 'puff',
              x: ev.x as number,
              y: ev.y as number,
              vx: Math.cos(a) * 30,
              vy: Math.sin(a) * 30,
              life: 0.6,
              size: 8,
              color: 0xc8ccd8,
              a: 0,
              b: 0,
            });
          }
          break;
        }
        case 'podRegrow': {
          // A glow pod's bud is back: a small warm-green bloom.
          this.add({
            kind: 'flash',
            x: ev.x as number,
            y: ev.y as number,
            vx: 0,
            vy: 0,
            life: 0.5,
            size: 50,
            color: 0x9fe8c8,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'bossOpen': {
          this.add({
            kind: 'ring',
            x: ev.x as number,
            y: ev.y as number,
            vx: 0,
            vy: 0,
            life: 0.5,
            size: 120,
            color: FX.flash,
            a: 0,
            b: 0,
          });
          break;
        }
        case 'bossCue': {
          if (ev.set !== 'p3') break;
          if (ev.cue === 'moonhole') {
            // The plug falls out of the moon-hole: bark rains down, and the moon floods the arena (kept).
            this.moonflood = 0;
            const mh = this.moonholeOf(sim);
            for (let k = 0; k < 24; k++)
              this.add({
                kind: 'chip',
                x: mh.x + (this.r() - 0.5) * 120,
                y: mh.y + this.r() * 40,
                vx: (this.r() - 0.5) * 200,
                vy: 40 + this.r() * 160,
                life: 1.6,
                size: 4 + this.r() * 6,
                color: this.r() < 0.5 ? FX.chip : FX.wood,
                a: this.r() * 6,
                b: 0,
              });
          } else {
            // Thrown off the lamp by a throw-cut: a hard white flash on it.
            this.add({
              kind: 'star',
              x: ev.x as number,
              y: ev.y as number,
              vx: 0,
              vy: 0,
              life: 0.2,
              size: 60,
              color: FX.flash,
              a: 0,
              b: 0,
            });
            this.add({
              kind: 'ring',
              x: ev.x as number,
              y: ev.y as number,
              vx: 0,
              vy: 0,
              life: 0.45,
              size: 140,
              color: FX.flash,
              a: 0,
              b: 0,
            });
          }
          break;
        }
        case 'gustEnd': {
          for (let k = 0; k < 8; k++) {
            const a = this.r() * Math.PI * 2;
            this.add({
              kind: 'mote',
              x: ev.x as number,
              y: ev.y as number,
              vx: Math.cos(a) * 120,
              vy: Math.sin(a) * 120,
              life: 0.4,
              size: 1.6,
              color: FX.gust,
              a: 0,
              b: 0,
            });
          }
          break;
        }
      }
    }
  }

  private clang(x: number, y: number, back: number, c: number, wood: boolean): void {
    this.add({
      kind: 'star',
      x,
      y,
      vx: 0,
      vy: 0,
      life: wood ? 0.12 : 0.16,
      size: wood ? 30 : 46,
      color: c,
      a: 0,
      b: 0,
    });
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.22, size: wood ? 34 : 50, color: c, a: 0, b: 0 });
    for (let k = 0; k < (wood ? 4 : 7); k++) {
      const a = (back > 0 ? 0 : Math.PI) + (this.r() - 0.5) * 1.8;
      const sp = 260 + this.r() * 380;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        life: 0.18 + this.r() * 0.12,
        size: 1.5,
        color: c,
        a: 0,
        b: 0,
      });
    }
    if (wood)
      for (let k = 0; k < 6; k++) {
        const a = (back > 0 ? 0 : Math.PI) + (this.r() - 0.5) * 2;
        this.add({
          kind: 'chip',
          x,
          y,
          vx: Math.cos(a) * 200,
          vy: Math.sin(a) * 200 - 120,
          life: 0.6,
          size: 3,
          color: FX.wood,
          a: this.r() * 6,
          b: 0,
        });
      }
  }

  draw(dt: number, clock: number, sim: SimView, front: Graphics, glow: GlowPool): void {
    const p = sim.player;
    // Her aura: her light grows with what she carries (render only), and draws in while she mends.
    const loose = p as unknown as { glow?: number; mend?: number };
    const max = 18;
    const want = Math.max(0, Math.min(1, (loose.glow ?? 0) / max));
    this.aura = this.aura < 0 ? want : this.aura + (want - this.aura) * Math.min(1, dt * 6);
    if ((sim.scene as { glow?: boolean }).glow === true) {
      const A = FX.aura;
      const r = A.r0 + (A.r1 - A.r0) * this.aura;
      const l = this.lights.get(this.lightId);
      if (l) {
        l.x = p.cx;
        l.y = p.cy;
        l.radius = r;
        l.intensity = A.k * (0.6 + 0.4 * this.aura);
      } else this.lights.set(this.lightId, { x: p.cx, y: p.cy, radius: r, color: A.color, intensity: A.k });
      glow.add(p.cx, p.cy - 6, 40 + 50 * this.aura, A.color, 0.04 + 0.08 * this.aura);
    }
    // In silver light (a burning moonwick near): a faint cold halo about her, the light that shields her.
    const moonlit = (p as unknown as { moonlit?: number }).moonlit ?? 0;
    if (moonlit > 0) glow.add(p.cx, p.cy - 6, 70, FX.silver, 0.1 * Math.min(1, moonlit));
    // The moon-hole open (P3's set, and for good once the Gloamweaver is down): a shaft of moonlight to the floor.
    const spec = sim.scene.boss;
    if (spec) {
      const down = sim.save.flags.includes(spec.flag);
      if (this.moonflood >= 0) this.moonflood += dt;
      const k = down ? 1 : this.moonflood >= 0 ? Math.min(1, this.moonflood / 1.2) : 0;
      if (k > 0) {
        const mh = this.moonholeOf(sim);
        const floor = (spec as { floor?: number }).floor ?? spec.arena.y + spec.arena.h;
        const len = floor - mh.y;
        const breathe = 0.9 + 0.1 * Math.sin(clock * 0.7);
        glow.add(mh.x, mh.y + len / 2, 130, 0xb8d0f0, 0.22 * k * breathe, len * 0.55);
        glow.add(mh.x, mh.y + len / 2, 60, 0xdce8ff, 0.18 * k * breathe, len * 0.5);
        glow.add(mh.x, floor - 6, 220, 0xdce8ff, 0.25 * k, 22);
        for (let j = 0; j < 14; j++) {
          const t = (clock * (0.04 + 0.03 * ((j * 7) % 5)) + j / 14) % 1;
          front
            .circle(mh.x + Math.sin(j * 2.1 + clock * 0.3) * 90, floor - t * len, 1.4)
            .fill({ color: 0xe8f0ff, alpha: 0.5 * k * Math.sin(Math.PI * t) });
        }
      }
    }
    // Mending: motes of light drawn into her from round about.
    if ((loose.mend ?? 0) > 0) {
      const k = Math.min(1, (loose.mend ?? 0) / 36);
      for (let i = 0; i < 10; i++) {
        const u = (clock * 1.6 + i / 10) % 1;
        const a = i * 2.39 + clock * 0.5;
        const rr = 90 * (1 - u);
        front
          .circle(p.cx + Math.cos(a) * rr, p.cy - 8 + Math.sin(a) * rr * 0.8, 1.8)
          .fill({ color: FX.glow, alpha: 0.8 * u * k });
      }
      glow.add(p.cx, p.cy - 8, 50 + 40 * k, FX.glow, 0.12 + 0.2 * k);
    }
    // The gust in flight: a crescent of air with motes in it.
    const gust = sim.light?.gust;
    if (gust) {
      const a = Math.atan2(gust.dy, gust.dx);
      const r = 34;
      front.moveTo(gust.x + Math.cos(a - 1.2) * r, gust.y + Math.sin(a - 1.2) * r);
      front.quadraticCurveTo(
        gust.x + Math.cos(a) * r * 1.6,
        gust.y + Math.sin(a) * r * 1.6,
        gust.x + Math.cos(a + 1.2) * r,
        gust.y + Math.sin(a + 1.2) * r,
      );
      front.stroke({ color: FX.gust, width: 3, alpha: 0.55 });
      for (let k = 0; k < 6; k++) {
        const t = (clock * 4 + k / 6) % 1;
        const off = (k - 2.5) * 9;
        front
          .circle(
            gust.x - Math.cos(a) * t * 40 - Math.sin(a) * off,
            gust.y - Math.sin(a) * t * 40 + Math.cos(a) * off,
            1.6,
          )
          .fill({ color: FX.gust, alpha: 0.7 * (1 - t) });
      }
      glow.add(gust.x, gust.y, 46, FX.gust, 0.14);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i] as Particle;
      q.age += dt;
      if (q.age >= q.life) {
        this.list.splice(i, 1);
        continue;
      }
      const u = q.age / q.life;
      switch (q.kind) {
        case 'flash':
          glow.add(q.x, q.y, q.size * (0.6 + 0.6 * u), q.color, 0.95 * (1 - u));
          front.circle(q.x, q.y, q.size * 0.18 * (1 - u)).fill({ color: 0xffffff, alpha: 1 - u });
          break;
        case 'line': {
          const L = q.size * (0.7 + 0.5 * u);
          const c = Math.cos(q.a);
          const s = Math.sin(q.a);
          const w = 5 * (1 - u) + 0.5;
          front
            .poly([
              q.x - c * L,
              q.y - s * L,
              q.x - s * w,
              q.y + c * w,
              q.x + c * L,
              q.y + s * L,
              q.x + s * w,
              q.y - c * w,
            ])
            .fill({ color: q.color, alpha: 0.95 * (1 - u) });
          break;
        }
        case 'spark': {
          q.vy += 900 * dt;
          q.vx *= 1 - dt * 4;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          const l = 0.03;
          front.moveTo(q.x, q.y).lineTo(q.x - q.vx * l, q.y - q.vy * l);
          front.stroke({ color: q.color, width: q.size * (1 - u * 0.5), alpha: 1 - u, cap: 'round' });
          break;
        }
        case 'chip': {
          q.vy += 900 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.a += dt * 14;
          const c = Math.cos(q.a) * q.size;
          const s = Math.sin(q.a) * q.size;
          front
            .poly([q.x + c, q.y + s, q.x - s * 0.5, q.y + c * 0.5, q.x - c, q.y - s])
            .fill({ color: q.color, alpha: Math.min(1, (1 - u) * 2) });
          break;
        }
        case 'mote': {
          q.vx *= 1 - dt * 3;
          q.vy = q.vy * (1 - dt * 3) - 30 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          front.circle(q.x, q.y, q.size * (1 - u * 0.5)).fill({ color: q.color, alpha: 1 - u });
          if (u < 0.5) glow.add(q.x, q.y, q.size * 4, q.color, 0.3 * (1 - u * 2));
          break;
        }
        case 'puff':
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          front.circle(q.x, q.y, q.size * (0.5 + u)).fill({ color: q.color, alpha: 0.18 * (1 - u) });
          break;
        case 'ring':
          front
            .circle(q.x, q.y, q.size * (0.3 + 0.7 * (1 - (1 - u) * (1 - u))))
            .stroke({ color: q.color, width: 3 * (1 - u) + 0.5, alpha: 0.9 * (1 - u) });
          break;
        case 'star': {
          const r = q.size * (0.6 + 0.4 * u);
          const pts: number[] = [];
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 + 0.2;
            const rr = k % 2 === 0 ? r : r * 0.28;
            pts.push(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr);
          }
          front.poly(pts).fill({ color: q.color, alpha: 1 - u });
          glow.add(q.x, q.y, r * 1.5, q.color, 0.5 * (1 - u));
          break;
        }
        case 'home': {
          // Out from the blow a little, then homing into her (a curve, quickening).
          if (q.age < q.a) break;
          const t = Math.min(1, (q.age - q.a) / FX.flight);
          q.x += q.vx * dt * (1 - t);
          q.y += q.vy * dt * (1 - t);
          const tx = p.cx;
          const ty = p.cy - 8;
          const k = t * t;
          const x = q.x + (tx - q.x) * k;
          const y = q.y + (ty - q.y) * k;
          front.circle(x, y, q.size).fill({ color: 0xffffff, alpha: 0.95 });
          glow.add(x, y, 16, q.color, 0.6);
          if (t >= 1) {
            glow.add(tx, ty, 50, q.color, 0.35);
            q.age = q.life;
          }
          break;
        }
        case 'link': {
          const k = Math.sin(Math.PI * u);
          front
            .moveTo(q.x, q.y)
            .lineTo(q.vx, q.vy)
            .stroke({ color: q.color, width: 1.4, alpha: 0.6 * k });
          for (let j = 0; j < 4; j++) {
            const t = (u * 2 + j / 4) % 1;
            glow.add(q.x + (q.vx - q.x) * t, q.y + (q.vy - q.y) * t, 12, q.color, 0.4 * k);
          }
          break;
        }
        case 'pour': {
          if (q.age < q.a) break;
          const t = Math.min(1, (q.age - q.a) / (q.life - q.a));
          const sx = p.cx;
          const sy = p.cy - 10;
          const x = sx + (q.vx - sx) * t + Math.sin(t * Math.PI) * q.b;
          const y = sy + (q.vy - sy) * t - Math.sin(t * Math.PI) * 40;
          front.circle(x, y, q.size).fill({ color: 0xffffff, alpha: 0.9 });
          glow.add(x, y, 14, q.color, 0.5);
          break;
        }
      }
    }
  }

  destroy(): void {
    this.lights.remove(this.lightId);
  }
}
