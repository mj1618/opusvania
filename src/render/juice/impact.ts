/**
 * The impact director: turns combat events into the render-side feedback stack (combat-spec §2,
 * pushed hard for "fun"): directional hit sparks, star flashes, shockwave rings, comic words, anime
 * speed lines and impact frames, a sprung directional camera kick plus trauma shake, a zoom punch,
 * chromatic aberration, and slow motion on finishers.
 *
 * Pure TS (no Pixi): stepped once per sim step from state + events (Game.afterStep), randomness from
 * its own seeded RNG, reseeded by reset(). So clips and screenshot tests stay deterministic, and it
 * never writes the sim. Slow motion is render time dilation only: the sim still takes the same
 * steps with the same inputs; the real-time loop just feeds it less wall time (see timeScale()).
 */
import type { HitClass, SimEvent } from '../../sim/events';
import type { GameState } from '../../sim/index';
import { VIEW_H, VIEW_W } from '../camera/index';
import { IMPACT, type ImpactSpec, JUICE } from './tuning';

export interface JSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  width: number;
}

export interface JStar {
  x: number;
  y: number;
  r: number;
  points: number;
  rot: number;
  age: number;
  life: number;
  color: number;
}

export interface JRing {
  x: number;
  y: number;
  r1: number;
  age: number;
  life: number;
  color: number;
  width: number;
  delay: number;
}

export interface JWord {
  text: string;
  x: number;
  y: number;
  age: number;
  life: number;
  color: number;
  size: number;
  angle: number;
  dir: number;
  /** Priority: a lower one never talks over a higher one (the boss phase line). */
  pri: number;
}

export interface JLines {
  x: number;
  y: number;
  age: number;
  life: number;
  color: number;
  seed: number;
}

export interface JInk {
  x: number;
  y: number;
  age: number;
  blobs: { dx: number; dy: number; r: number }[];
}

type SlowKind = keyof typeof JUICE.slowmo;

/** Enemy states that count as "a fight is on" for the combat framing. */
const ENGAGED = new Set([
  'CHASE',
  'TELEGRAPH',
  'ACTIVE',
  'RECOVERY',
  'FLINCH',
  'STAGGER',
  'LAUNCHED',
  'DOWN',
  'COUNT',
  'RETRIEVE',
  'HOP',
  'ABSORB',
]);

export class ImpactDirector {
  sparks: JSpark[] = [];
  stars: JStar[] = [];
  rings: JRing[] = [];
  words: JWord[] = [];
  lines: JLines[] = [];
  inks: JInk[] = [];
  /** Sprung camera kick (world px) and its velocity. */
  kx = 0;
  ky = 0;
  private kvx = 0;
  private kvy = 0;
  trauma = 0;
  private t = 0;
  /** Zoom punch: current and previous-step values (the renderer interpolates), focus (world). */
  zoom = 1;
  prevZoom = 1;
  focusX = 0;
  focusY = 0;
  private zoomPeak = 1;
  private zoomAge = 99;
  /** Impact frame: steps left and its tint. */
  impactFrames = 0;
  impactColor = 0xffffff;
  /** 0..1 chromatic aberration kick (decays). */
  aberration = 0;
  /** Slow motion in progress (null = none). `age` counts steps after the hitstop ended. */
  slow: { kind: SlowKind; age: number; frames: number; scale: number; zoom: number } | null = null;
  /**
   * Combat framing: while enemies are engaged near Kid the view eases in (a fight fills the
   * screen); focus in world px, eased. Previous-step values for interpolation.
   */
  czoom = 1;
  prevCzoom = 1;
  cfx = 0;
  cfy = 0;
  private cfInit = false;
  private rng = 0x51f00d;

  reset(): void {
    this.czoom = this.prevCzoom = 1;
    this.cfInit = false;
    this.sparks = [];
    this.stars = [];
    this.rings = [];
    this.words = [];
    this.lines = [];
    this.inks = [];
    this.kx = this.ky = this.kvx = this.kvy = 0;
    this.trauma = 0;
    this.t = 0;
    this.zoom = this.prevZoom = 1;
    this.zoomPeak = 1;
    this.zoomAge = 99;
    this.impactFrames = 0;
    this.aberration = 0;
    this.slow = null;
    this.rng = 0x51f00d;
  }

  private rand(): number {
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Render time scale for the real-time loop (1 = normal). Only < 1 during slow motion. */
  timeScale(hitstop = 0): number {
    const s = this.slow;
    if (!s || hitstop > 0) return 1;
    const u = Math.min(1, s.age / s.frames);
    return s.scale + (1 - s.scale) * u * u;
  }

  /** 0..1 how "slow" the moment is (drives desaturation and the letterbox). */
  drama(): number {
    const s = this.slow;
    if (!s) return 0;
    const u = Math.min(1, s.age / s.frames);
    return 1 - u * u * u;
  }

  /** Screen-space shake offset from trauma (px). */
  shake(): { x: number; y: number } {
    const a = JUICE.shakePx * this.trauma * this.trauma;
    const u = this.t * 0.9;
    return { x: a * Math.sin(u * 2.1 + Math.sin(u * 0.7) * 2), y: a * Math.cos(u * 1.7 + 1.3) * 0.8 };
  }

  /** Fire the full stack for one impact at (x, y) along `dir` (-1/1, 0 = radial). */
  impact(spec: ImpactSpec, x: number, y: number, dir: number, colour: number, dirY = 0): void {
    const c = spec.color ?? colour;
    const base = dir === 0 && dirY === 0 ? null : Math.atan2(dirY, dir);
    for (let i = 0; i < spec.sparks; i++) {
      const a =
        base === null
          ? (i / spec.sparks) * Math.PI * 2 + this.rand() * 0.5
          : base + (this.rand() - 0.5) * spec.spread;
      const sp = spec.sparkSpeed * (0.45 + this.rand() * 0.8);
      const [l0, l1] = JUICE.sparkLife;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        age: 0,
        life: l0 + Math.floor(this.rand() * (l1 - l0)),
        color: i % 3 === 0 ? 0xffffff : c,
        width: 3 + this.rand() * 3,
      });
    }
    if (spec.star > 0)
      this.stars.push({
        x,
        y,
        r: spec.starR,
        points: spec.star,
        rot: this.rand() * Math.PI,
        age: 0,
        life: spec.starFrames,
        color: c,
      });
    for (let i = 0; i < spec.rings; i++)
      this.rings.push({
        x,
        y,
        r1: spec.ringR * (1 - i * 0.25),
        age: 0,
        life: JUICE.ringLife + i * 3,
        color: i === 0 ? 0xffffff : c,
        width: 10 - i * 3,
        delay: i * 3,
      });
    if (spec.word) this.word(spec.word, x, y - 80, c, dir || 1, 1);
    if (spec.speedLines > 0)
      this.lines.push({ x, y, age: 0, life: spec.speedLines, color: c, seed: Math.floor(this.rand() * 1e6) });
    if (spec.kick > 0) {
      const d = base === null ? 0 : base;
      this.kvx += Math.cos(d) * spec.kick * (base === null ? 0 : 1);
      this.kvy += Math.sin(d) * spec.kick * (base === null ? 0 : 1) + (base === null ? spec.kick * 0.4 : 0);
    }
    this.trauma = Math.min(1, this.trauma + spec.trauma);
    if (spec.zoom > 1) this.punch(spec.zoom, x, y);
    if (spec.impactFrames > this.impactFrames) {
      this.impactFrames = spec.impactFrames;
      this.impactColor = c;
    }
    this.aberration = Math.max(this.aberration, spec.aberration);
  }

  word(text: string, x: number, y: number, color: number, dir: number, scale: number, pri = 1): void {
    // One shout at a time: older words get out of the way fast, unless a bigger beat is speaking.
    if (this.words.some((w) => w.pri > pri && w.age < w.life - 5)) return;
    for (const w of this.words) w.age = Math.max(w.age, w.life - 5);
    this.words.push({
      text,
      x,
      y,
      age: 0,
      life: JUICE.wordLife,
      color,
      size: JUICE.wordSize * scale,
      pri,
      angle: (this.rand() - 0.5) * 0.3 - dir * 0.06,
      dir,
    });
  }

  private punch(z: number, x: number, y: number): void {
    if (z >= this.zoom || this.zoomAge > 3) {
      this.zoomPeak = Math.max(z, this.zoomAge > 3 ? 1 : this.zoomPeak);
      this.zoomAge = 0;
      this.focusX = x;
      this.focusY = y;
    }
  }

  private startSlow(kind: SlowKind, x: number, y: number): void {
    const S = JUICE.slowmo[kind];
    if (this.slow && this.slow.frames - this.slow.age > S.frames) return;
    this.slow = { kind, age: 0, frames: S.frames, scale: S.scale, zoom: S.zoom };
    this.focusX = x;
    this.focusY = y;
  }

  /** One sim step. `colourOf` maps a hit's target/sound to its noise colour hex. */
  step(s: GameState, events: readonly SimEvent[], colourOf: (e: SimEvent) => number): void {
    this.t++;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const cls: HitClass = e.cls;
          const sp = IMPACT[cls] ?? IMPACT.light;
          // A knockdown or KO on the same step shouts its own word; don't stack two.
          const loud = events.some((o) => o.type === 'down' || o.type === 'ko');
          this.impact(loud ? { ...sp, word: '' } : sp, e.x, e.y, e.dir || 1, colourOf(e));
          break;
        }
        case 'catch':
          this.impact(IMPACT.catch, e.x, e.y, 0, colourOf(e));
          this.startSlow('catch', e.x, e.y);
          break;
        case 'seizeTake': {
          const p = s.player;
          const dx = p.x + p.w / 2 - e.x;
          this.impact(IMPACT.seizeTake, e.x, e.y, dx >= 0 ? 1 : -1, colourOf(e));
          break;
        }
        case 'repossess': {
          // The REPOSSESSED stamp is the word: clear the stage for it.
          for (const w of this.words) w.age = Math.max(w.age, w.life - 4);
          this.impact(IMPACT.repossess, e.x, e.y, 0, colourOf(e));
          this.startSlow('repossess', e.x, e.y);
          this.inks.push({ x: e.x, y: e.y - 20, age: 0, blobs: this.blobs(9, 70) });
          break;
        }
        case 'hurt': {
          const dir = s.player.vx >= 0 ? 1 : -1;
          this.impact(IMPACT.hurt, e.x, e.y, dir, 0xff5a6e);
          break;
        }
        case 'down':
          this.trauma = Math.min(1, this.trauma + 0.25);
          this.rings.push({
            x: e.x,
            y: e.y + 20,
            r1: 110,
            age: 0,
            life: 18,
            color: 0xc9c2b0,
            width: 8,
            delay: 0,
          });
          {
            // Beside it, away from Kid (the Count ring sits over its head).
            const side = e.x >= s.player.x + s.player.w / 2 ? 1 : -1;
            this.word('DOWN!', e.x + side * 130, e.y - 10, 0xffd84a, side, 1);
          }
          break;
        case 'ko':
          this.trauma = Math.min(1, this.trauma + 0.3);
          this.word('K.O.!', e.x, e.y - 90, 0xffffff, 1, 1.3);
          break;
        case 'roomClear':
          this.startSlow('clear', e.x, e.y);
          break;
        case 'bossPhase':
          this.startSlow('bossPhase', e.x, e.y);
          this.impactFrames = 3;
          this.impactColor = 0xff3b3b;
          this.trauma = 1;
          this.aberration = 1;
          for (let i = 0; i < 3; i++)
            this.rings.push({
              x: e.x,
              y: e.y,
              r1: 260 + i * 60,
              age: 0,
              life: 26,
              color: 0xff4fa3,
              width: 12,
              delay: i * 5,
            });
          this.word('NO RESERVE!', e.x, e.y - 150, 0xff3b3b, 1, 1.6, 3);
          {
            const w = this.words[this.words.length - 1];
            if (w) w.life = 80;
          }
          this.lines.push({ x: e.x, y: e.y, age: 0, life: 24, color: 0xff3b3b, seed: 99 });
          break;
        case 'sold':
          this.trauma = Math.min(1, this.trauma + 0.35);
          this.rings.push({ x: e.x, y: e.y, r1: 140, age: 0, life: 18, color: 0xff4fa3, width: 8, delay: 0 });
          break;
        case 'attackActive':
          // Heavy attacks land with weight: the Gavel and the Grinder's charge shake the room.
          if (e.attackId === 'gavel') {
            this.trauma = Math.min(1, this.trauma + 0.45);
            this.rings.push({
              x: e.x,
              y: e.y + 90,
              r1: 240,
              age: 0,
              life: 18,
              color: 0xe8a23a,
              width: 10,
              delay: 0,
            });
          } else if (e.attackId === 'charge') this.trauma = Math.min(1, this.trauma + 0.2);
          break;
        case 'shotLand':
          if (e.kind === 'mortar') this.trauma = Math.min(1, this.trauma + 0.3);
          break;
        case 'levyThrow':
          this.kvx -= (s.player.facing || 1) * 4;
          break;
        default:
          break;
      }
    }

    this.frameCombat(s);

    // Zoom: punch in over 2 steps, ease back; slow-mo holds its own zoom.
    this.prevZoom = this.zoom;
    this.zoomAge++;
    let z = 1;
    if (this.zoomPeak > 1) {
      const a = this.zoomAge;
      z =
        a <= 2
          ? 1 + (this.zoomPeak - 1) * (a / 2)
          : 1 + (this.zoomPeak - 1) * Math.max(0, 1 - (a - 2) / JUICE.zoomBack) ** 2;
      if (a > JUICE.zoomBack + 2) this.zoomPeak = 1;
    }
    const sl = this.slow;
    if (sl) {
      const u = Math.min(1, sl.age / sl.frames);
      const hold = 1 + (sl.zoom - 1) * (1 - u * u * u);
      z = Math.max(z, s.hitstop > 0 && sl.age === 0 ? 1 + (sl.zoom - 1) * 0.6 : hold);
      if (s.hitstop === 0) sl.age++;
      if (sl.age >= sl.frames) this.slow = null;
    }
    this.zoom = z;

    // Kick spring (keeps going through hitstop: the camera recoils while the world is frozen).
    this.kvx = (this.kvx - this.kx * JUICE.kickPull) * JUICE.kickDamp;
    this.kvy = (this.kvy - this.ky * JUICE.kickPull) * JUICE.kickDamp;
    this.kx += this.kvx;
    this.ky += this.kvy;
    this.trauma = Math.max(0, this.trauma - JUICE.traumaDecay);
    this.aberration = Math.max(0, this.aberration - 0.08);
    if (this.impactFrames > 0) this.impactFrames--;

    // Everything keeps animating through the hitstop: the spark blooming while the world is frozen
    // is what sells the weight (fighting-game hit sparks do the same).
    for (const w of this.words) w.age++;
    this.words = this.words.filter((w) => w.age < w.life);
    for (const l of this.lines) l.age++;
    this.lines = this.lines.filter((l) => l.age < l.life);
    for (const k of this.inks) k.age++;
    this.inks = this.inks.filter((k) => k.age < 90);
    for (const st of this.stars) st.age++;
    this.stars = this.stars.filter((st) => st.age < st.life);
    for (const r of this.rings) r.age++;
    this.rings = this.rings.filter((r) => r.age < r.life + r.delay);
    const D = JUICE.sparkDrag;
    for (const p of this.sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= D;
      p.vy = p.vy * D + JUICE.sparkGravity;
      p.age++;
    }
    this.sparks = this.sparks.filter((p) => p.age < p.life);
  }

  /** Eases the combat zoom toward JUICE.combatZoom while a fight is on near Kid. */
  private frameCombat(s: GameState): void {
    const p = s.player;
    const kx = p.x + p.w / 2;
    const ky = p.y + p.h / 2;
    // The fight's bounding box: Kid plus every engaged enemy near her.
    let x0 = kx - p.w;
    let x1 = kx + p.w;
    let y0 = ky - p.h;
    let y1 = ky + p.h;
    let n = 0;
    for (const e of s.local.enemies) {
      if (!ENGAGED.has(e.state)) continue;
      const ex = e.x + e.w / 2;
      const ey = e.y + e.h / 2;
      if (Math.abs(ex - kx) > JUICE.combatRange || Math.abs(ey - ky) > JUICE.combatRange * 0.7) continue;
      n++;
      x0 = Math.min(x0, e.x);
      x1 = Math.max(x1, e.x + e.w);
      y0 = Math.min(y0, e.y);
      y1 = Math.max(y1, e.y + e.h);
    }
    const on = n > 0 && p.state !== 'dead';
    // Zoom in as far as the whole fight (plus a margin) still fits, up to combatZoom.
    const fit = Math.min(
      VIEW_W / (x1 - x0 + 2 * JUICE.combatPadX),
      VIEW_H / (y1 - y0 + 2 * JUICE.combatPadY),
    );
    const target = on ? Math.max(1, Math.min(JUICE.combatZoom, fit)) : 1;
    const tx = on ? (x0 + x1) / 2 : kx;
    const ty = on ? (y0 + y1) / 2 : ky;
    if (!this.cfInit) {
      this.cfx = tx;
      this.cfy = ty;
      this.cfInit = true;
    }
    this.cfx += (tx - this.cfx) * JUICE.combatFocusLerp;
    this.cfy += (ty - this.cfy) * JUICE.combatFocusLerp;
    this.prevCzoom = this.czoom;
    const rate = target > this.czoom ? JUICE.combatZoomIn : JUICE.combatZoomOut;
    this.czoom += Math.max(-rate, Math.min(rate, (target - this.czoom) * 0.08));
  }

  private blobs(n: number, R: number): { dx: number; dy: number; r: number }[] {
    const out: { dx: number; dy: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = R * (0.3 + this.rand() * 0.8);
      out.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.6, r: 5 + this.rand() * 12 });
    }
    return out;
  }
}
