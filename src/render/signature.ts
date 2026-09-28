import { Container, Graphics } from 'pixi.js';
import type { Game } from '../game';
import type { Colour, SimEvent } from '../sim/events';
import type { Levied, Sound, Source } from '../sim/state';
import { tuning } from '../sim/tuning';
import { getRoom } from '../sim/world/rooms';
import { drawEnemy, type EnemyFx, enemyPose } from './enemies';
import type { Light } from './gfx/lighting';
import { NOISE_COLOURS } from './gfx/palette';
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
import { CBT, colourHex, PALETTE, SIG } from './palette';
import { drawShots } from './shots';
import { SparkSet } from './sparks';

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
  /** Emissive copies (gfx.layers.emissive): humming sources, levied, armed voices, telegraphs. */
  readonly glow = new Graphics({ label: 'sig-glow' });
  /** Enemy bodies, one posed Graphics each (under the player, over `back`). */
  readonly enemyLayer = new Container({ label: 'sig-enemies' });
  private readonly pool: Graphics[] = [];
  /** Lights for this frame (gfx light provider), filled by draw(). */
  private frameLights: Light[] = [];

  // Deterministic feedback state (stepped per sim frame).
  private flash = new Map<number, number>();
  private refused = new Map<number, number>();
  private kidGold = 0;
  private shakeId = -1;
  private gateOpened = new Map<string, number>();
  private sparks: Spark[] = [];
  private stepCount = 0;
  private drawn: SigRect[] = [];
  // L4 per-enemy feedback (keyed by enemy id).
  private guard = new Map<number, { frames: number; x: number; y: number }>();
  private enemyRefused = new Map<number, number>();
  private countPulse = new Map<number, number>();
  private countNo = new Map<number, number>();
  private koAge = new Map<number, number>();
  private repoAge = new Map<number, number>();
  /** Exhaust puffs and similar body-attached particles. */
  private readonly puffs = new SparkSet(17);

  constructor(private readonly game: Game) {}

  reset(): void {
    this.flash.clear();
    this.refused.clear();
    this.kidGold = 0;
    this.shakeId = -1;
    this.gateOpened.clear();
    this.sparks = [];
    this.guard.clear();
    this.enemyRefused.clear();
    this.countPulse.clear();
    this.countNo.clear();
    this.koAge.clear();
    this.repoAge.clear();
    this.puffs.clear();
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    this.stepCount++;
    for (const [k, v] of this.flash) v <= 1 ? this.flash.delete(k) : this.flash.set(k, v - 1);
    for (const [k, v] of this.refused) v <= 1 ? this.refused.delete(k) : this.refused.set(k, v - 1);
    if (this.kidGold > 0) this.kidGold--;
    for (const [k, v] of this.guard) v.frames <= 1 ? this.guard.delete(k) : v.frames--;
    for (const m of [this.enemyRefused, this.countPulse, this.countNo])
      for (const [k, v] of m) v <= 1 ? m.delete(k) : m.set(k, v - 1);
    for (const m of [this.koAge, this.repoAge]) for (const [k, v] of m) m.set(k, v + 1);
    const rnd = rngFor(this.stepCount, 7);
    const prnd = this.puffs.rng();
    const kp = s.player;
    for (const e of events) {
      switch (e.type) {
        case 'seizeGuarded': {
          const en = s.local.enemies.find((o) => o.id === e.target);
          if (en) {
            // Contact point: the enemy's edge facing Kid, at her hand height.
            const kx = kp.x + kp.w / 2;
            const x = kx < en.x + en.w / 2 ? en.x : en.x + en.w;
            const y = Math.max(en.y + 12, Math.min(en.y + en.h - 12, kp.y + 34));
            this.guard.set(e.target, { frames: CBT.guardFrames, x, y });
          }
          break;
        }
        case 'countTick':
          this.countPulse.set(e.enemy, CBT.countPulseFrames);
          break;
        case 'down':
          this.countPulse.set(e.enemy, CBT.countPulseFrames);
          for (let i = 0; i < 8; i++)
            this.sparks.push({
              x: e.x + (rnd() - 0.5) * 80,
              y: e.y + 20,
              vx: (rnd() - 0.5) * 8,
              vy: -1 - rnd() * 2,
              age: 0,
              life: 18,
              size: 10,
              color: PALETTE.dust,
            });
          break;
        case 'whiff':
          if (e.reason === 'down') {
            const en = s.local.enemies.find(
              (o) => e.x >= o.x - 8 && e.x <= o.x + o.w + 8 && e.y >= o.y - 8 && e.y <= o.y + o.h + 8,
            );
            if (en) this.countNo.set(en.id, 8);
          }
          break;
        case 'ko':
          this.koAge.set(e.enemy, 0);
          break;
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
          this.repoAge.set(e.enemy, 0);
          this.flash.set(e.enemy, SIG.hitFlash.repossess ?? 6);
          this.shakeId = e.enemy;
          this.sparks.push(ringAt(e.x, e.y, PALETTE.furious));
          break;
        case 'seizeTake':
          this.shakeId = e.owner;
          break;
        case 'seizeRefused':
          this.refused.set(e.target, CBT.refusedFrames);
          if (s.local.enemies.some((o) => o.id === e.target))
            this.enemyRefused.set(e.target, CBT.refusedFrames);
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
    // Grinder: exhaust puffs while it backs up to charge (every 3rd step).
    if (this.stepCount % 3 === 0)
      for (const en of s.local.enemies) {
        if (en.type !== 'grinder' || en.state !== 'TELEGRAPH' || en.attackId !== 'charge') continue;
        const ex = en.facing > 0 ? en.x + 10 : en.x + en.w - 10;
        this.puffs.burst(prnd, ex, en.y - 10, 2, 0x8a8f9c, {
          speed: 2,
          size: 10,
          life: 20,
          kind: 'puff',
          spread: 0.8,
          dir: en.facing > 0 ? -2.2 : -0.9,
          gravity: -0.12,
        });
      }
    this.puffs.step();
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
    const gl = this.glow.clear();
    this.drawn = [];
    this.frameLights = [];
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
        this.glowHum(gl, r, colour, frame);
        // Refused (a locked lot: "under the hammer"): white flash and static crackle over it.
        if (this.refused.has(src.id)) drawStatic(g, r, frame, src.id, true);
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
      if (status === 'humming') this.glowHum(gl, { x, y, w: l.w, h: l.h }, l.colour, frame);
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

    // Enemies: each body is its own posed Graphics (lean, crouch, tip over); cues are world-space.
    let used = 0;
    const kidC = { x: kid.x + s.player.w / 2, y: kid.y + s.player.h / 2 };
    for (const e of L.enemies) {
      const ko = this.koAge.get(e.id) ?? -1;
      if (e.state === 'KO' && (ko < 0 || ko >= CBT.koFrames)) continue;
      const q = prev.local.enemies.find((o) => o.id === e.id);
      const far = !q || Math.abs(q.x - e.x) + Math.abs(q.y - e.y) > 200;
      let x = far ? e.x : lerp(q.x, e.x, alpha);
      const y = far ? e.y : lerp(q.y, e.y, alpha);
      if (this.shakeId === e.id || this.shakeId === e.source) x += shake;
      const src = L.sources.find((o) => o.id === e.source);
      const voices = (src?.soundIds ?? []).map(soundOf).filter((v): v is Sound => !!v);
      const gd = this.guard.get(e.id);
      const fx: EnemyFx = {
        frame,
        flash: this.flash.has(e.id),
        guard: gd?.frames ?? 0,
        guardAt: gd ? { x: gd.x, y: gd.y } : null,
        refused: this.enemyRefused.get(e.id) ?? 0,
        countPulse: (this.countPulse.get(e.id) ?? 0) / CBT.countPulseFrames,
        countNo: (this.countNo.get(e.id) ?? 0) / 8,
        koAge: ko,
        repoAge: this.repoAge.get(e.id) ?? -1,
        kid: kidC,
        shots: L.shots,
      };
      const body = this.enemyGraphics(used++);
      const pose = enemyPose(e, fx);
      const { status } = drawEnemy(body, f, gl, e, x, y, voices, fx, pose, (lx, ly, r, c, i) =>
        this.light(lx, ly, r, c, i),
      );
      const piv = pose.centre ? e.h / 2 : 0;
      body.pivot.set(0, -piv);
      body.position.set(Math.round(x + e.w / 2 + pose.dx), Math.round(y + e.h - piv + pose.dy));
      body.rotation = pose.rot;
      body.scale.set(pose.sx, pose.sy);
      body.alpha = pose.alpha;
      if (e.state === 'KO') continue;
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

    for (let i = used; i < this.pool.length; i++) (this.pool[i] as Graphics).visible = false;

    // Enemy shots (darts, mortars, waves, words, slabs).
    for (const r of drawShots(f, gl, L.shots, prev.local.shots, alpha, frame, getRoom(s.roomId)))
      this.drawn.push({ ...r, status: 'shot' });
    this.puffs.draw(f);

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

  /** The i-th pooled enemy body graphics (cleared, visible). */
  private enemyGraphics(i: number): Graphics {
    let g = this.pool[i];
    if (!g) {
      g = new Graphics();
      this.pool.push(g);
      this.enemyLayer.addChild(g);
    }
    g.visible = true;
    return g.clear();
  }

  /** A light for this frame's provider call (world px). */
  private light(x: number, y: number, radius: number, colour: Colour, intensity: number): void {
    this.frameLights.push({ x, y, radius, color: NOISE_COLOURS[colour].light, intensity });
  }

  /** Emissive copy of a humming thing (outline + faint fill) and its light. */
  private glowHum(gl: Graphics, r: Rect, colour: Colour, frame: number): void {
    const n = NOISE_COLOURS[colour];
    const { dx, dy } = vibration(colour, frame);
    const w = SIG.hummingOutline;
    gl.rect(r.x, r.y, r.w, r.h).fill({ color: n.glow, alpha: SIG.glowFillAlpha });
    gl.rect(r.x + dx + w / 2, r.y + dy + w / 2, r.w - w, r.h - w).stroke({
      width: w,
      color: n.core,
      alpha: SIG.glowOutlineAlpha,
    });
    this.light(
      r.x + r.w / 2,
      r.y + r.h / 2,
      SIG.lightRadius + Math.max(r.w, r.h) / 2,
      colour,
      SIG.lightIntensity,
    );
  }

  /** Light provider (gfx.lights.providers): the lights of the last drawn frame. */
  lights(out: Light[]): void {
    for (const l of this.frameLights) out.push(l);
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
