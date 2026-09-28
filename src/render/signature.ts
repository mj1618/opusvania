import { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { type AttackDef, enemyDef } from '../sim/ai/schema';
import type { Colour, SimEvent } from '../sim/events';
import type { Enemy, Levied, Sound, Source } from '../sim/state';
import { tuning } from '../sim/tuning';
import {
  dashedRect,
  drawGhost,
  drawHumming,
  drawPending,
  drawStatic,
  humWaves,
  type Rect,
  rngFor,
  vibration,
} from './outline';
import { colourHex, PALETTE, SIG } from './palette';

/** A drawn L3 thing (world px here; WorldRenderer.rects() converts to canvas px). */
export interface SigRect {
  id: number;
  kind: string;
  colour: string;
  status: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: number;
  ring?: boolean;
}

/**
 * World-space readability rendering for the signature mechanic (L3 brief §5): sound sources
 * (humming / ghost / pending / white static), levied slabs and springs, enemies with their voice
 * outlines and cues, plates and gates, plus the deterministic feedback (hit flashes, hitstop
 * shake, sparks). Everything here only reads sim state and events; `step` runs once per sim step.
 */
export class SignatureRenderer {
  /** Under the player: plates, gates, sources, levied, enemies. */
  readonly back = new Graphics();
  /** Over the player: tethers, count rings, sparks, weight motes. */
  readonly front = new Graphics();

  // Deterministic feedback state (stepped per sim frame).
  private flash = new Map<number, number>();
  private refused = new Map<number, number>();
  private kidGold = 0;
  private shakeId = -1;
  private gateOpened = new Map<string, number>();
  private sparks: Spark[] = [];
  private stepCount = 0;
  private drawn: SigRect[] = [];

  constructor(private readonly game: Game) {}

  reset(): void {
    this.flash.clear();
    this.refused.clear();
    this.kidGold = 0;
    this.shakeId = -1;
    this.gateOpened.clear();
    this.sparks = [];
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    this.stepCount++;
    for (const [k, v] of this.flash) v <= 1 ? this.flash.delete(k) : this.flash.set(k, v - 1);
    for (const [k, v] of this.refused) v <= 1 ? this.refused.delete(k) : this.refused.set(k, v - 1);
    if (this.kidGold > 0) this.kidGold--;
    const rnd = rngFor(this.stepCount, 7);
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const f = SIG.hitFlash[e.cls] ?? 3;
          if (f > 0) this.flash.set(e.target, f);
          this.shakeId = e.target;
          const n = e.cls === 'heavy' ? 14 : e.cls === 'medium' ? 8 : 4;
          const col = e.cls === 'heavy' ? PALETTE.brown : 0xfff3c4;
          for (let i = 0; i < n; i++) {
            const a = (rnd() - 0.5) * (e.cls === 'heavy' ? Math.PI * 2 : 1.2);
            const sp = 5 + rnd() * 7;
            this.sparks.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * sp * (e.dir || 1),
              vy: Math.sin(a) * sp - 1,
              age: 0,
              life: 14 + Math.floor(rnd() * 8),
              size: e.cls === 'heavy' ? 9 : 6,
              color: col,
            });
          }
          if (e.cls !== 'light') this.sparks.push(ringAt(e.x, e.y, 0xffffff));
          break;
        }
        case 'catch':
          this.kidGold = SIG.catchGoldFrames;
          this.flash.set(e.enemy, SIG.hitFlash.catch ?? 6);
          this.shakeId = e.enemy;
          this.sparks.push(ringAt(e.x, e.y, PALETTE.gold));
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.sparks.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 9,
              vy: Math.sin(a) * 9,
              age: 0,
              life: 16,
              size: 7,
              color: PALETTE.gold,
            });
          }
          break;
        case 'repossess':
          this.flash.set(e.enemy, SIG.hitFlash.repossess ?? 6);
          this.shakeId = e.enemy;
          this.sparks.push(ringAt(e.x, e.y, PALETTE.furious));
          break;
        case 'seizeTake':
          this.shakeId = e.owner;
          break;
        case 'seizeRefused':
          this.refused.set(e.target, SIG.refusedFlashFrames);
          for (let i = 0; i < 6; i++)
            this.sparks.push({
              x: e.x + (rnd() - 0.5) * 60,
              y: e.y - 20,
              vx: (rnd() - 0.5) * 6,
              vy: -3 - rnd() * 4,
              age: 0,
              life: 14,
              size: 4,
              color: PALETTE.white,
            });
          break;
        case 'levyLand':
          for (let i = 0; i < 6; i++)
            this.sparks.push({
              x: e.x + (rnd() - 0.5) * 50,
              y: e.y + 10,
              vx: (rnd() - 0.5) * 8,
              vy: -2 - rnd() * 3,
              age: 0,
              life: 16,
              size: 6,
              color: colourHex(e.colour),
            });
          break;
        case 'springBounce':
          this.sparks.push(ringAt(e.x, e.y, PALETTE.pink));
          break;
        case 'gateOpen':
          this.gateOpened.set(e.char, s.frame);
          break;
        default:
          break;
      }
    }
    if (s.hitstop > 0 && !events.some((e) => e.type === 'hitstop')) return;
    for (const p of this.sparks) {
      p.age++;
      if (p.ring) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.9;
      p.vy = p.vy * 0.9 + 0.35;
    }
    this.sparks = this.sparks.filter((p) => p.age < p.life);
  }

  /** Kid body tint override (catch gold), or null. */
  kidTint(): number | null {
    return this.kidGold > 0 ? PALETTE.gold : null;
  }

  /** Kid silhouette scale by weight class (render only; the collision box is unchanged). */
  kidScale(): readonly [number, number] {
    const p = this.game.state.player;
    if (!p.abilities.seize) return [1, 1];
    if (p.profile === 'heavy') return SIG.heavyScale;
    if (p.profile === 'middle') return SIG.middleScale;
    return [1, 1];
  }

  /** Hurt i-frame flicker. */
  kidAlpha(): number {
    const p = this.game.state.player;
    return p.iframes > 0 && Math.floor(p.iframes / 4) % 2 === 1 ? 0.35 : 1;
  }

  /** World-px rects as last drawn. */
  worldRects(): readonly SigRect[] {
    return this.drawn;
  }

  draw(alpha: number, kid: { x: number; y: number }): void {
    const s = this.game.state;
    const prev = this.game.prev;
    const L = s.local;
    const frame = s.frame;
    const g = this.back.clear();
    const f = this.front.clear();
    this.drawn = [];
    const soundOf = (id: number) => L.sounds.find((x) => x.id === id);
    const shake = s.hitstop > 0 ? (s.hitstop % 2 === 0 ? 1 : -1) * SIG.hitstopShakePx : 0;
    const ts = tuning.world.tileSize;

    // Plates: an inset bar in the floor; pressed drops 8 px and a lamp lights.
    for (const pl of L.plates) {
      let minX = Infinity;
      let maxX = -Infinity;
      let y0 = 0;
      for (let i = 0; i < pl.tiles.length; i += 2) {
        const x = (pl.tiles[i] as number) * ts;
        y0 = (pl.tiles[i + 1] as number) * ts;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + ts);
        g.rect(x + 2, y0, ts - 4, 24).fill(PALETTE.plateSlot);
        g.rect(x + 6, y0 + 2 + (pl.pressed ? SIG.plateDrop : 0), ts - 12, 12).fill(PALETTE.plateBar);
      }
      const cx = (minX + maxX) / 2;
      if (pl.pressed) g.circle(cx, y0 + 42, 18).fill({ color: PALETTE.lampOn, alpha: 0.3 });
      g.circle(cx, y0 + 42, 9).fill(pl.pressed ? PALETTE.lampOn : PALETTE.lampOff);
      g.circle(cx, y0 + 42, 9).stroke({ width: 2, color: PALETTE.plateBar, alpha: 0.8 });
      this.drawn.push({
        id: -1,
        kind: 'plate',
        colour: '',
        status: pl.pressed ? 'pressed' : 'up',
        x: minX,
        y: y0,
        w: maxX - minX,
        h: ts,
      });
    }

    // Gates: vertical bars; open = dashed for 10 f, then gone.
    for (const gt of L.gates) {
      const r = tileBounds(gt.tiles, ts);
      if (gt.open) {
        const at = this.gateOpened.get(gt.char);
        if (at !== undefined && frame - at < SIG.gateDashedFrames) dashedRect(g, r, 3, PALETTE.gate, 0.8);
        continue;
      }
      g.rect(r.x, r.y, r.w, 8).fill(PALETTE.gate);
      g.rect(r.x, r.y + r.h - 8, r.w, 8).fill(PALETTE.gate);
      for (let x = r.x + 6; x < r.x + r.w - 4; x += 16) g.rect(x, r.y, 7, r.h).fill(PALETTE.gate);
      g.rect(r.x, r.y, r.w, r.h).fill({ color: PALETTE.gate, alpha: 0.1 });
    }

    // Object sources (humming walls, furnaces, white static).
    for (const src of L.sources) {
      if (src.kind !== 'object') continue;
      const colour = sourceColour(src, soundOf);
      const sh = this.shakeId === src.id ? shake : 0;
      const r = { x: src.x + sh, y: src.y, w: src.w, h: src.h };
      let status: string;
      if (colour === 'white') {
        status = 'white';
        drawStatic(g, r, frame, src.id, this.refused.has(src.id));
      } else if (src.pendingSolid) {
        status = 'pending';
        drawPending(g, r, colour, frame);
      } else if (src.ghost) {
        status = 'ghost';
        drawGhost(g, r, colour);
      } else {
        status = 'humming';
        drawHumming(g, r, colour, frame, this.flash.has(src.id));
      }
      this.drawn.push({ id: src.id, kind: 'object', colour, status, x: src.x, y: src.y, w: src.w, h: src.h });
    }

    // Levied objects (brown slab, pink spring, violet dart): they hum like a source.
    for (const l of L.levied) {
      const q = prev.local.levied.find((o) => o.id === l.id);
      const x = q ? lerp(q.x, l.x, alpha) : l.x;
      const y = q ? lerp(q.y, l.y, alpha) : l.y;
      const src = L.sources.find((o) => o.kind === 'levied' && o.ent === l.id);
      const status = drawLevied(g, l, x, y, frame);
      this.drawn.push({
        id: src?.id ?? l.id,
        kind: 'levied',
        colour: l.colour,
        status,
        x,
        y,
        w: l.w,
        h: l.h,
      });
    }

    // Enemies.
    for (const e of L.enemies) {
      if (e.state === 'KO') continue;
      const q = prev.local.enemies.find((o) => o.id === e.id);
      const far = !q || Math.abs(q.x - e.x) + Math.abs(q.y - e.y) > 200;
      let x = far ? e.x : lerp(q.x, e.x, alpha);
      const y = far ? e.y : lerp(q.y, e.y, alpha);
      if (this.shakeId === e.id || this.shakeId === e.source) x += shake;
      const src = L.sources.find((o) => o.id === e.source);
      const voices = (src?.soundIds ?? []).map(soundOf).filter((v): v is Sound => !!v);
      const status = this.drawEnemy(g, f, e, x, y, voices, frame);
      const colour = voices[0]?.colour ?? '';
      this.drawn.push({ id: src?.id ?? e.id, kind: 'enemy', colour, status, x, y, w: e.w, h: e.h });

      // RETRIEVE / STAGGER with a target: a thin tether to where its sound is.
      if (e.target && (e.state === 'RETRIEVE' || e.state === 'STAGGER' || e.state === 'ABSORB')) {
        const snd = soundOf(e.target);
        let to: { x: number; y: number } | null = null;
        if (snd?.status === 'bag') to = { x: kid.x + s.player.w / 2, y: kid.y + s.player.h / 2 };
        else if (snd && (snd.status === 'levied' || snd.status === 'flight')) {
          const lv = L.levied.find((o) => o.id === snd.at);
          if (lv) to = { x: lv.x + lv.w / 2, y: lv.y + lv.h / 2 };
        }
        if (snd && to) {
          const c = colourHex(snd.colour);
          const x0 = x + e.w / 2;
          const y0 = y + e.h / 2;
          f.moveTo(x0, y0).lineTo(to.x, to.y).stroke({ width: 2, color: c, alpha: SIG.tetherAlpha });
          for (let i = 0; i < 3; i++) {
            const u = (((frame * 0.04 + i / 3) % 1) + 1) % 1;
            // Beads travel from the sound back toward its owner (it wants it back).
            f.circle(to.x + (x0 - to.x) * u, to.y + (y0 - to.y) * u, 4).fill({ color: c, alpha: 0.7 });
          }
        }
      }
    }

    // Feather: two small rising motes (render only).
    const p = s.player;
    if (p.abilities.seize && p.profile === 'feather' && p.state !== 'dead') {
      for (let i = 0; i < 2; i++) {
        const ph = ((frame + i * 22) % 44) / 44;
        const mx = kid.x + p.w / 2 + (i === 0 ? -16 : 16) + Math.sin(ph * 7 + i) * 3;
        const my = kid.y + p.h * 0.55 - ph * 60;
        f.circle(mx, my, 3.5).fill({ color: 0xdff1ff, alpha: 0.85 * (1 - ph) });
      }
    }

    for (const sp of this.sparks) {
      const t = sp.age / sp.life;
      if (sp.ring) {
        f.circle(sp.x, sp.y, 12 + t * 46).stroke({ width: 4 * (1 - t) + 1, color: sp.color, alpha: 1 - t });
        continue;
      }
      const sz = sp.size * (1 - t * 0.5);
      f.rect(sp.x - sz / 2, sp.y - sz / 2, sz, sz).fill({ color: sp.color, alpha: 1 - t });
    }

    const kr = { x: kid.x, y: kid.y, w: p.w, h: p.h };
    this.drawn.push({ id: 0, kind: 'player', colour: '', status: p.profile, ...kr });
  }

  private drawEnemy(
    g: Graphics,
    f: Graphics,
    e: Enemy,
    x: number,
    y: number,
    voices: Sound[],
    frame: number,
  ): string {
    const def = enemyDef(e.type);
    const W = e.w;
    const H = e.h;
    const face = e.facing;
    // Local (facing right) -> world x for a span [lx, lx + lw].
    const X = (lx: number, lw = 0) => (face > 0 ? x + lx : x + W - lx - lw);

    if (e.state === 'REPOSSESSED') {
      // Desaturated to an outline: it has nothing left to say.
      g.roundRect(x, y, W, H, 12).stroke({ width: 3, color: PALETTE.repossessed, alpha: 0.7 });
      dashedRect(g, { x: x - 4, y: y - 4, w: W + 8, h: H + 8 }, 2, PALETTE.repossessed, 0.4);
      return 'repossessed';
    }

    const attack: AttackDef | undefined = e.attackId ? def.attacks[e.attackId] : undefined;
    let k = 0;
    if (e.state === 'TELEGRAPH') k = Math.min(1, e.stateFrame / Math.max(1, e.timer));
    else if (e.state === 'ACTIVE') k = 1;
    const tint = attack ? colourHex(attack.cue.tint) : PALETTE.enemyBody;
    const pulses = e.state === 'TELEGRAPH' && attack ? attack.cue.pulses : 0;
    const pulse = pulses > 0 ? (0.5 - 0.5 * Math.cos(2 * Math.PI * pulses * k)) ** 2 : 0;
    const flashing = this.flash.has(e.id);
    const downed = e.state === 'DOWN' || e.state === 'COUNT';
    // Generic attacks (Snatch, no voice of their own) tint half as much as voiced ones.
    let body = mix(PALETTE.enemyBody, tint, k * SIG.teleTint * (attack?.sound === null ? 0.5 : 1));
    if (flashing) body = PALETTE.flash;

    // Voice outlines (one ring per voice, innermost first). Armed = solid + vibrating; taken = dashed.
    const width = SIG.teleOutline0 + (SIG.teleOutline1 - SIG.teleOutline0) * k + 3 * pulse;
    let armedAny = false;
    voices.forEach((v, i) => {
      const pad = SIG.enemyOutlinePad + i * 7;
      const c = colourHex(v.colour);
      const r = { x: x - pad, y: y - pad, w: W + 2 * pad, h: H + 2 * pad };
      if (v.status === 'home') {
        armedAny = true;
        const { dx, dy } = vibration(v.colour, frame);
        const oc = mix(c, 0xffffff, pulse * 0.7);
        g.roundRect(r.x - dx + 1, r.y - dy + 1, r.w - 2, r.h - 2, 12).stroke({
          width: 2,
          color: c,
          alpha: 0.35,
        });
        g.roundRect(r.x + dx + width / 2, r.y + dy + width / 2, r.w - width, r.h - width, 12).stroke({
          width,
          color: oc,
          alpha: 1,
        });
      } else {
        dashedRect(g, r, Math.max(2, width * 0.5), c, e.state === 'TELEGRAPH' ? 0.9 : SIG.ghostOutlineAlpha);
      }
    });
    // A voiceless enemy's telegraph still winds up visibly. A disarmed one keeps its dashed ring
    // (thickening above): a solid ring here would read as "armed again" (Pit clip review).
    if (voices.length === 0 && e.state === 'TELEGRAPH' && attack) {
      const pad = SIG.enemyOutlinePad + voices.length * 7;
      g.roundRect(x - pad, y - pad, W + 2 * pad, H + 2 * pad, 12).stroke({
        width: 2 + 4 * k,
        color: tint,
        alpha: 0.5 + 0.5 * k,
      });
    }

    const dark = PALETTE.enemyDark;
    const eye = e.furious ? PALETTE.furious : dark;
    const bodyAlpha = downed ? 0.8 : 1;
    let mouth: [number, number];
    if (e.type === 'grinder') {
      g.roundRect(x + 4, y + 10, W - 8, H - 10, 16).fill({ color: body, alpha: bodyAlpha });
      const wx = X(78);
      const wy = y + 58;
      g.circle(wx, wy, 25).fill(dark);
      const spin = (e.state === 'TELEGRAPH' || e.state === 'ACTIVE' ? 0.5 : 0.08) * frame * face;
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        g.moveTo(wx, wy).lineTo(wx + Math.cos(a) * 21, wy + Math.sin(a) * 21);
      }
      g.stroke({ width: 3, color: body, alpha: 0.9 });
      g.rect(X(84, 12), y + 22, 12, 9).fill(downed ? { color: dark, alpha: 0.5 } : eye);
      g.rect(X(58, 50), y + 90, 50, 14).fill(dark);
      for (let i = 0; i < 5; i++) {
        const tx = X(60 + i * 10, 8);
        g.poly([tx, y + 90, tx + 8, y + 90, tx + 4, y + 97]).fill(body);
      }
      mouth = [X(100), y + 97];
    } else {
      g.roundRect(X(2, 54), y + 16, 54, 30, 10).fill({ color: body, alpha: bodyAlpha });
      g.roundRect(X(40, 32), y + 6, 32, 28, 9).fill({ color: body, alpha: bodyAlpha });
      g.rect(X(8, 10), y + 42, 10, 6).fill({ color: body, alpha: bodyAlpha });
      g.rect(X(40, 10), y + 42, 10, 6).fill({ color: body, alpha: bodyAlpha });
      // Bowler hat.
      g.rect(X(40, 30), y + 2, 30, 5).fill(dark);
      g.roundRect(X(46, 18), y - 10, 18, 14, 6).fill(dark);
      if (downed) g.rect(X(58, 9), y + 16, 9, 3).fill(dark);
      else g.rect(X(60, 6), y + 13, 6, 6).fill(eye);
      g.rect(X(62, 10), y + 26, 10, 3).fill(dark);
      mouth = [X(67), y + 27];
    }
    if (e.furious && !downed) {
      const ex = e.type === 'grinder' ? X(90) : X(63);
      f.circle(ex, y + (e.type === 'grinder' ? 26 : 16), 9).fill({ color: PALETTE.furious, alpha: 0.35 });
    }

    // Taken voice: a small "X" at the mouth, in the voice's colour.
    const taken = voices.find((v) => v.status !== 'home');
    if (taken) {
      const c = colourHex(taken.colour);
      const [mx, my] = mouth;
      const s = 9;
      f.moveTo(mx - s, my - s)
        .lineTo(mx + s, my + s)
        .moveTo(mx + s, my - s)
        .lineTo(mx - s, my + s)
        .stroke({ width: 5.5, color: PALETTE.bg, alpha: 0.9 });
      f.moveTo(mx - s, my - s)
        .lineTo(mx + s, my + s)
        .moveTo(mx + s, my - s)
        .lineTo(mx - s, my + s)
        .stroke({ width: 3, color: c, alpha: 1 });
    }

    // DOWN / COUNT: a ring of 10 ticks overhead, filling with the beat.
    if (downed) {
      const cx = x + W / 2;
      const cy = y - 34;
      const R = SIG.countRingR;
      const n = SIG.countTicks;
      const filled = e.state === 'COUNT' ? e.beat : 0;
      f.circle(cx, cy, R + 7).fill({ color: PALETTE.bg, alpha: 0.6 });
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const on = i < filled;
        f.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6))
          .lineTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3))
          .stroke({ width: on ? 5 : 3, color: on ? PALETTE.gold : PALETTE.hudDim, alpha: 1 });
      }
    }

    if (e.state === 'TELEGRAPH') return 'telegraph';
    if (downed) return e.state === 'COUNT' ? 'count' : 'down';
    return armedAny ? 'humming' : 'ghost';
  }
}

function drawLevied(g: Graphics, l: Levied, x: number, y: number, frame: number): string {
  const c = colourHex(l.colour);
  const { dx, dy } = vibration(l.colour, frame);
  if (l.colour === 'pink') {
    // Spring: 64x16 zigzag between two plates; compresses while squash > 0.
    const h = l.squash > 0 ? SIG.springSquashH : l.h;
    const top = y + l.h - h;
    const bot = y + l.h;
    g.rect(x, bot - 4, l.w, 4).fill(c);
    g.rect(x + dx, top + dy, l.w, 4).fill(c);
    const pts: number[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const px = x + 4 + ((l.w - 8) * i) / n + dx * (1 - i / n);
      pts.push(px, i % 2 === 0 ? bot - 4 : top + 4 + dy);
    }
    g.poly(pts, false).stroke({ width: 3, color: c, alpha: 1, join: 'miter' });
    g.rect(x - 2, top - 2, l.w + 4, bot - top + 4).stroke({ width: 1, color: c, alpha: 0.35 });
    return l.phase === 'landed' ? 'humming' : 'flight';
  }
  if (l.colour === 'brown') {
    const r = { x, y, w: l.w, h: l.h };
    if (!l.solid) {
      // Waiting to materialise (or in flight): dashed.
      g.rect(x, y, l.w, l.h).fill({ color: c, alpha: 0.3 });
      dashedRect(g, r, 3, c, 0.95);
      return l.phase === 'landed' ? 'pending' : 'flight';
    }
    g.rect(x, y, l.w, l.h).fill({ color: c, alpha: SIG.slabFillAlpha });
    humWaves(g, r, 'brown', frame, 0.6);
    const b = SIG.slabBorder;
    g.rect(x + dx + b / 2, y + dy + b / 2, l.w - b, l.h - b).stroke({
      width: b,
      color: mix(c, 0x000000, 0.45),
      alpha: 1,
    });
    g.rect(x + dx + b, y + dy + b, l.w - 2 * b, l.h - 2 * b).stroke({
      width: 2,
      color: 0xffe0a8,
      alpha: 0.7,
    });
    return 'humming';
  }
  // Violet dart (no L3 source yet): a chevron in flight.
  const cx = x + l.w / 2;
  const cy = y + l.h / 2;
  g.poly([cx - l.w / 2, cy - l.h / 2, cx + l.w / 2, cy, cx - l.w / 2, cy + l.h / 2, cx - l.w / 4, cy]).fill(
    c,
  );
  return l.phase === 'landed' ? 'humming' : 'flight';
}

function sourceColour(src: Source, soundOf: (id: number) => Sound | undefined): Colour {
  for (const id of src.soundIds) {
    const s = soundOf(id);
    if (s) return s.colour;
  }
  return 'white';
}

function tileBounds(tiles: readonly number[], ts: number): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < tiles.length; i += 2) {
    const x = (tiles[i] as number) * ts;
    const y = (tiles[i + 1] as number) * ts;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + ts);
    y1 = Math.max(y1, y + ts);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function ringAt(x: number, y: number, color: number): Spark {
  return { x, y, vx: 0, vy: 0, age: 0, life: 14, size: 0, color, ring: true };
}

export function mix(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
