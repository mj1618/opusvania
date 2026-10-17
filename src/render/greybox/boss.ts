/**
 * A boss fight in greybox (memory/bosses.md, memory/greybox.md): the sealed doors, the Weaver's thread
 * and body, every tell drawn where its danger will be (P2's whole swing as an arc and a band on the
 * floor, P3's lunge as a line along the floor and its drop's landing, P1's count), the phase label with
 * its pips, the name card and the beats of the defeat. Reads the sim (`state.boss`, the creature, its
 * events); never changes it. Animation runs on render time.
 */
import { type Container, Graphics, type Text } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { cycleSine } from '../../sim/paths';
import type { BossState, EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { GB } from './palette';
import { label } from './static';

/** The tell colours: the hunt colour (danger), the pale silk of a thread, the open (punish) colour. */
const HUNT = 0xff4a3c;
const SILK = 0xe6ecf5;
const OPEN = 0x7dff9a;

interface Flash {
  kind: 'card' | 'phase' | 'ring' | 'defeat' | 'relight' | 'cut' | 'lock';
  x: number;
  y: number;
  t: number;
  life: number;
  text: Text | null;
}

export class BossView {
  /** Under her: doors, threads, tells on the floor. */
  readonly back = new Graphics();
  /** Over her: the body's marks (eyes, legs), the label, flashes. */
  readonly front = new Graphics();
  private readonly flashes: Flash[] = [];
  private phaseText: Text | null = null;
  private phaseKey = '';
  /** Render time since the current tell began (its flashes quicken). */
  private tellT = 0;
  private tellKey = '';

  constructor(private readonly texts: Container) {}

  onEvents(events: readonly SimEvent[], sim: SimView): void {
    const spec = sim.scene.boss;
    if (!spec) return;
    const a = spec.arena;
    const top = a.y + 150;
    for (const e of events) {
      if (e.type === 'bossCue' && e.cue === 'name')
        this.add('card', a.x + a.w / 2, top + 120, 2.5, spec.name, 64);
      else if (e.type === 'bossLock') this.add('lock', a.x + a.w / 2, top + 190, 1.4, 'the doors seal', 22);
      else if (e.type === 'bossPhase' && e.phase > 1)
        this.add('phase', a.x + a.w / 2, top + 120, 1.6, `${e.name}`, 40);
      else if (e.type === 'bossRing') this.add('ring', e.x, e.y, 0.6, null, 0);
      else if (e.type === 'bossThreadCut') this.add('cut', e.x, e.y, 0.5, 'cut!', 22);
      else if (e.type === 'bossDefeat')
        this.add('defeat', a.x + a.w / 2, top + 120, 3.5, 'the great lamp is out', 44);
      else if (e.type === 'bossRelight')
        this.add('relight', e.x, e.y, 2.2, 'a small warm light relit it', 20);
      else if (e.type === 'bossUnlock' && e.how === 'reset') this.clear();
      else if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) this.clear();
    }
  }

  private add(
    kind: Flash['kind'],
    x: number,
    y: number,
    life: number,
    text: string | null,
    size: number,
  ): void {
    const t = text === null ? null : label(text, x, y, kind === 'card' ? 0xffffff : GB.label, size);
    if (t) this.texts.addChild(t);
    this.flashes.push({ kind, x, y, t: 0, life, text: t });
  }

  private clear(): void {
    for (const f of this.flashes) f.text?.destroy();
    this.flashes.length = 0;
  }

  draw(dt: number, clock: number, sim: SimView): void {
    const g = this.back.clear();
    const fr = this.front.clear();
    const spec = sim.scene.boss;
    const b = sim.boss;
    if (!spec || !b) {
      if (this.phaseText) this.phaseText.visible = false;
      return;
    }
    const e = sim.enemies.find((x) => x.id === spec.creature) ?? null;
    // Sealed doors: pale silk, hatched.
    if (b.locked) {
      for (const d of spec.lock) {
        g.rect(d.x, d.y, d.w, d.h).fill({ color: SILK, alpha: 0.55 });
        for (let y = d.y + 12; y < d.y + d.h; y += 18) g.moveTo(d.x, y).lineTo(d.x + d.w, y - 10);
        g.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
      }
    }
    if (b.tell !== this.tellKey) {
      this.tellKey = b.tell;
      this.tellT = 0;
    } else this.tellT += dt;
    if (e && !e.gone && b.stage !== 'down') this.drawWeaver(g, fr, b, e, clock, sim);
    this.drawLabel(sim, b, e);
    // Flashes.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i] as Flash;
      f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) {
        f.text?.destroy();
        this.flashes.splice(i, 1);
        continue;
      }
      if (f.text) f.text.alpha = u < 0.15 ? u / 0.15 : u > 0.75 ? (1 - u) / 0.25 : 1;
      if (f.kind === 'ring')
        fr.circle(f.x, f.y, 30 + 120 * u).stroke({ color: SILK, width: 3, alpha: 1 - u });
      else if (f.kind === 'cut')
        fr.circle(f.x, f.y, 10 + 50 * u).stroke({ color: SILK, width: 4, alpha: 1 - u });
      else if (f.kind === 'relight')
        fr.circle(f.x, f.y, 20 + 200 * u).stroke({ color: GB.flame, width: 4, alpha: 1 - u });
      else if (f.kind === 'defeat' && u < 0.3) {
        const a = spec.arena;
        fr.rect(a.x, a.y, a.w, a.h).fill({ color: 0xffffff, alpha: 0.25 * (1 - u / 0.3) });
      }
    }
  }

  /** The thread, the tells and the body's marks. */
  private drawWeaver(
    g: Graphics,
    fr: Graphics,
    b: BossState,
    e: EnemyState,
    clock: number,
    sim: SimView,
  ): void {
    const spec = sim.scene.boss;
    if (!spec) return;
    const W = tuning.weaverBoss;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const floor = spec.floor ?? spec.arena.y + spec.arena.h;
    // How urgent the tell is: 0 at its start, 1 as it goes live (flashes quicken).
    const of =
      b.tell === 'swing'
        ? W.tellFrames + W.dropFrames
        : b.tell === 'lunge'
          ? W.lungeTell
          : b.tell === 'drop'
            ? W.dropTell
            : W.biteCount;
    const k = Math.max(0, Math.min(1, 1 - b.tellFrames / Math.max(1, of)));
    const blink = Math.sin(this.tellT * (6 + 30 * k)) > 0 ? 1 : 0.35;
    // The thread from its pivot to its back.
    if (b.thread) g.moveTo(b.pivotX, b.pivotY).lineTo(ex, e.y).stroke({ color: SILK, width: 3, alpha: 0.85 });
    if (b.tell === 'swing') {
      // The whole swing: the arc it will travel (pale), and the floor band it sweeps (hunt colour).
      const n = 32;
      for (let i = 0; i <= n; i++) {
        const u = 0.25 + (0.5 * i) / n;
        const dx = b.side * b.reach * cycleSine(u);
        const x = b.pivotX + dx;
        const y = b.pivotY + Math.sqrt(Math.max(0, b.len * b.len - dx * dx));
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color: SILK, width: 4, alpha: 0.35 + 0.4 * k });
      // Its two ends (where it drops to first is the brighter).
      const end = (s: number) => ({
        x: b.pivotX + s * b.reach,
        y: b.pivotY + Math.sqrt(b.len * b.len - b.reach * b.reach),
      });
      const a0 = end(b.side);
      const a1 = end(-b.side);
      g.moveTo(b.pivotX, b.pivotY)
        .lineTo(a0.x, a0.y)
        .stroke({ color: SILK, width: 2, alpha: 0.3 + 0.5 * k });
      g.circle(a0.x, a0.y, 30).stroke({ color: HUNT, width: 3, alpha: blink });
      g.circle(a1.x, a1.y, 22).stroke({ color: SILK, width: 2, alpha: 0.5 });
      this.floorBand(g, b.tellX0, b.tellX1, floor, k, blink);
      if (b.safeX >= 0) this.safeMark(g, b.safeX, floor);
    } else if (b.tell === 'lunge') {
      this.floorBand(g, b.tellX0, b.tellX1, floor, k, blink);
      const x1 = b.dir > 0 ? b.tellX1 : b.tellX0;
      g.moveTo(ex, floor - 6)
        .lineTo(x1, floor - 6)
        .stroke({ color: HUNT, width: 4, alpha: blink });
    } else if (b.tell === 'drop') {
      // The short thread it will ride down, and where it lands.
      g.moveTo(b.pivotX, b.pivotY).quadraticCurveTo(b.pivotX, floor - 40, b.landX, floor - e.h / 2);
      g.stroke({ color: SILK, width: 2, alpha: 0.4 + 0.5 * k });
      this.floorBand(g, b.tellX0, b.tellX1, floor, k, blink);
    }
    // The body: legs and eyes over its box (the box itself is the overlay's: src/debug/overlay.ts).
    const open = e.mode === 'recover';
    const legC = open ? OPEN : e.mode === 'windup' ? HUNT : 0xd8c8f0;
    const sway = Math.sin(clock * 9) * 4;
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 4; i++) {
        const ly = ey - 14 + i * 10;
        const kx = ex + s * (e.w / 2 + 10 + (i === 1 || i === 2 ? 8 : 0));
        const fy = ly + (open ? -26 : 22) + (i % 2 ? sway : -sway);
        fr.moveTo(ex + (s * e.w) / 4, ly)
          .lineTo(kx, ly - 12)
          .lineTo(kx + s * 12, fy);
      }
    }
    fr.stroke({ color: legC, width: 3, alpha: 0.9 });
    // Abdomen up in P3's window: the pale belly to pogo.
    if (open && !e.stunned && e.span === 3)
      fr.ellipse(ex, e.y + 6, e.w / 2 - 6, 12).fill({ color: OPEN, alpha: e.pogoed ? 0.2 : 0.7 });
    // Eyes: the hunt colour while aware, counting down in quickening flashes during a tell.
    const eyeC = b.tell !== '' ? HUNT : e.aware > 0 ? 0xffe14c : 0x8a7aa0;
    const eyeA = b.tell !== '' ? blink : 1;
    const fx = e.facing > 0 ? 10 : -10;
    for (let i = -1; i <= 1; i += 2)
      fr.circle(ex + fx + i * 7, ey - 10, 4).fill({ color: eyeC, alpha: eyeA });
    // Open: a ring that empties as the window closes.
    if (open && e.timer > 0) {
      const len = e.stunned ? W.stunFrames : e.span === 3 ? W.lungeWinded : W.windedFrames;
      const u = Math.max(0, Math.min(1, e.timer / Math.max(1, len)));
      fr.moveTo(ex + 46, ey)
        .arc(ex, ey, 46, 0, Math.PI * 2 * u)
        .stroke({ color: OPEN, width: 4, alpha: 0.85 });
    }
  }

  /** A tell's danger on the floor: a band in the hunt colour, filling as it comes. */
  private floorBand(g: Graphics, x0: number, x1: number, floor: number, k: number, blink: number): void {
    g.rect(x0, floor - 18, x1 - x0, 18).fill({ color: HUNT, alpha: (0.15 + 0.35 * k) * blink });
    g.moveTo(x0, floor - 18)
      .lineTo(x0, floor - 70)
      .moveTo(x1, floor - 18)
      .lineTo(x1, floor - 70);
    g.stroke({ color: HUNT, width: 3, alpha: 0.8 });
  }

  /** Where the attack never reaches: a small open-colour mark on the floor. */
  private safeMark(g: Graphics, x: number, floor: number): void {
    g.moveTo(x - 30, floor - 4)
      .lineTo(x + 30, floor - 4)
      .stroke({ color: OPEN, width: 4, alpha: 0.6 });
  }

  /** The phase label at the arena's top: the name, the phase, its pips. */
  private drawLabel(sim: SimView, b: BossState, e: EnemyState | null): void {
    const spec = sim.scene.boss;
    if (!spec) return;
    const a = spec.arena;
    const names = ['the ring', 'the drops', 'the floor', 'the heart'];
    const key =
      b.stage === 'down'
        ? `${spec.name}: beaten`
        : b.stage === 'wait' || b.stage === 'intro'
          ? `${spec.name}${b.retry ? ' (a retry: three ring flames)' : ''}`
          : `${spec.name} · P${b.phase} ${names[b.phase - 1] ?? ''}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.phaseText?.destroy();
      this.phaseText = label(key, a.x + a.w / 2, a.y + 70, GB.label, 26);
      this.texts.addChild(this.phaseText);
    }
    if (this.phaseText) this.phaseText.visible = true;
    // Pips: what is left of this phase.
    const fr = this.front;
    let left = 0;
    let of = 0;
    if (b.phase === 1 && b.stage !== 'down') {
      of = spec.rings.length;
      for (const id of spec.rings) {
        const i = (sim.scene.lures ?? []).findIndex((l) => l.id === id);
        if ((sim.lures.hp[i] ?? 0) > 0) left++;
      }
    } else if ((b.phase === 2 || b.phase === 3) && e) {
      of = e.hpMax;
      left = Math.max(0, e.hp);
    } else if (b.phase === 4) {
      const i = (sim.scene.lures ?? []).findIndex((l) => l.id === spec.heart);
      of = tuning.lures.kinds.great.hp;
      left = sim.lures.hp[i] ?? 0;
    }
    for (let i = 0; i < of; i++) {
      const x = a.x + a.w / 2 + (i - (of - 1) / 2) * 26;
      fr.circle(x, a.y + 90, 8).fill({ color: i < left ? GB.flame : GB.husk, alpha: 0.95 });
    }
  }

  destroy(): void {
    this.clear();
    this.phaseText?.destroy();
    this.phaseText = null;
  }
}
