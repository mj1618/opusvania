import type { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { lots } from '../sim/ai/boss';
import type { SimEvent } from '../sim/events';
import { tuning } from '../sim/tuning';
import { getRoom, type PromptDef } from '../sim/world/rooms';
import { VIEW_H, VIEW_W } from './camera/index';
import { drawKeycap, drawPadlock, drawPlus, drawStamp, type KeyName, strokeText } from './glyphs';
import { CBT, PALETTE } from './palette';
import { SparkSet } from './sparks';

interface ScreenFlash {
  color: number;
  alpha: number;
  frames: number;
  age: number;
}

/**
 * The L4 combat feedback layer that isn't about one enemy or Kid's body: in-world prompt glyphs
 * (keycaps that teach the verbs, hidden once done), the Auction's lots (marks, SOLD, outbid),
 * KO poofs and the Corner sparkle (world), and screen beats (CLEARED stamp, counter/heavy
 * flashes, hurt vignette). Render only; stepped once per sim step.
 */
export class CombatLayer {
  private readonly sparks = new SparkSet(53);
  private promptAlpha: number[] = [];
  private promptDone: boolean[] = [];
  private promptRoom = '';
  private clearAge = -1;
  private flashes: ScreenFlash[] = [];
  private vignette = 0;
  private lotFlash = new Map<number, number>();
  private outbid = new Map<number, number>();

  constructor(private readonly game: Game) {}

  reset(): void {
    this.sparks.clear();
    this.promptRoom = '';
    this.clearAge = -1;
    this.flashes = [];
    this.vignette = 0;
    this.lotFlash.clear();
    this.outbid.clear();
  }

  private syncPrompts(): PromptDef[] {
    const s = this.game.state;
    const room = getRoom(s.roomId);
    const list = room.file.prompts;
    if (this.promptRoom !== s.roomId || this.promptAlpha.length !== list.length) {
      this.promptRoom = s.roomId;
      this.promptAlpha = list.map(() => 0);
      this.promptDone = list.map(() => false);
    }
    return list;
  }

  step(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const p = s.player;
    const rnd = this.sparks.rng();
    const list = this.syncPrompts();
    for (const e of events) {
      // Prompt glyphs retire once their `until` has happened (this visit).
      list.forEach((pr, i) => {
        if (!pr.until || this.promptDone[i]) return;
        if (pr.until.startsWith('move:')) {
          const [, mv, dir] = pr.until.split(':');
          if (e.type === 'moveStart' && e.move === mv && (!dir || e.dir === dir)) this.promptDone[i] = true;
        } else if (e.type === pr.until) this.promptDone[i] = true;
      });
      switch (e.type) {
        case 'roomClear':
          this.clearAge = 0;
          break;
        case 'goal':
          if (e.kind === 'main') this.clearAge = 0;
          break;
        case 'hit':
          if (e.cls === 'counter') this.flashes.push({ color: PALETTE.flash, alpha: 0.5, frames: 2, age: 0 });
          else if (e.cls === 'heavy')
            this.flashes.push({ color: PALETTE.brown, alpha: 0.22, frames: 3, age: 0 });
          break;
        case 'catch':
          this.flashes.push({ color: PALETTE.gold, alpha: 0.16, frames: 3, age: 0 });
          break;
        case 'repossess':
          this.flashes.push({ color: PALETTE.stampRed, alpha: 0.14, frames: 4, age: 0 });
          break;
        case 'hurt':
        case 'hazard':
          this.vignette = 1;
          break;
        case 'ko':
          this.sparks.ring(e.x, e.y, PALETTE.dust, 70, 18, 6);
          this.sparks.burst(rnd, e.x, e.y, 12, PALETTE.dust, {
            speed: 7,
            size: 16,
            life: 22,
            kind: 'puff',
            gravity: -0.06,
          });
          break;
        case 'corner':
          this.sparks.ring(e.x, e.y - 40, PALETTE.gold, 80, 20, 5);
          this.sparks.burst(rnd, e.x, e.y - 40, 14, PALETTE.gold, {
            speed: 5,
            size: 6,
            life: 26,
            gravity: -0.08,
          });
          break;
        case 'lotMarked':
          if (e.lot >= 0) this.lotFlash.set(e.lot, 12);
          break;
        case 'sold':
          this.lotFlash.set(e.lot, 16);
          this.sparks.burst(rnd, e.x, e.y, 10, PALETTE.pink, { speed: 7, size: 7 });
          break;
        case 'outbid':
          if (e.lot >= 0) this.outbid.set(e.lot, 30);
          this.sparks.ring(e.x, e.y, PALETTE.gold, 90, 18, 6);
          break;
        case 'redistrained':
          this.sparks.ring(e.x, e.y, PALETTE.violet, 90, 20, 6);
          this.sparks.burst(rnd, e.x, e.y, 12, PALETTE.coin, { speed: 8, size: 7 });
          break;
        default:
          break;
      }
    }
    // Prompt fades (deterministic: stepped, not timed).
    const kx = p.x + p.w / 2;
    const ky = p.y + p.h / 2;
    const room = getRoom(s.roomId);
    const ts = tuning.world.tileSize;
    list.forEach((pr, i) => {
      const [px, py] = promptCentre(pr, room.padX, room.padY, ts);
      const near = (pr.near ?? CBT.promptNearTiles) * ts;
      const want = !this.promptDone[i] && p.state !== 'dead' && Math.hypot(px - kx, py - ky) <= near ? 1 : 0;
      const a = this.promptAlpha[i] ?? 0;
      this.promptAlpha[i] =
        want > a ? Math.min(1, a + CBT.promptFade * 1.5) : Math.max(0, a - CBT.promptFade);
    });
    if (this.clearAge >= 0 && ++this.clearAge > CBT.clearFrames) this.clearAge = -1;
    for (const f of this.flashes) f.age++;
    this.flashes = this.flashes.filter((f) => f.age < f.frames);
    this.vignette = Math.max(0, this.vignette - 1 / 14);
    for (const [k, v] of this.lotFlash) v <= 1 ? this.lotFlash.delete(k) : this.lotFlash.set(k, v - 1);
    for (const [k, v] of this.outbid) v <= 1 ? this.outbid.delete(k) : this.outbid.set(k, v - 1);
    if (s.hitstop > 0 && !events.some((e) => e.type === 'hitstop')) return;
    this.sparks.step();
  }

  /** World layer: prompts, lots, poofs, sparkles. */
  draw(f: Graphics, gl: Graphics): void {
    const s = this.game.state;
    const frame = s.frame;
    const room = getRoom(s.roomId);
    const ts = tuning.world.tileSize;
    this.drawLots(f, gl, frame);
    const list = this.syncPrompts();
    list.forEach((pr, i) => {
      const a = this.promptAlpha[i] ?? 0;
      if (a <= 0.01) return;
      const [px, py] = promptCentre(pr, room.padX, room.padY, ts);
      drawPrompt(f, pr.keys as KeyName[], px, py + Math.sin(frame * 0.1 + i) * CBT.promptBob, a);
    });
    this.sparks.draw(f, gl);
  }

  private drawLots(f: Graphics, gl: Graphics, frame: number): void {
    const s = this.game.state;
    const all = lots(s);
    if (all.length === 0) return;
    const boss = s.local.enemies.find((e) => e.boss);
    const marked = boss?.boss?.lots ?? [];
    const beat = boss?.boss?.beat ?? 0;
    all.forEach((lot, i) => {
      const cx = lot.x + lot.w / 2;
      const sold = (lot.soldT ?? 0) > 0;
      if (!sold) drawPadlock(f, cx, lot.y - 16, 22, PALETTE.hudInk, 0.85);
      const isMarked = marked.includes(i);
      const fl = this.lotFlash.get(i) ?? 0;
      if (isMarked || fl > 0) {
        const k = Math.max(fl / 12, isMarked ? 0.45 + 0.35 * Math.sin(frame * 0.5) : 0);
        f.rect(lot.x - 6, lot.y - 6, lot.w + 12, lot.h + 12).stroke({
          width: 5,
          color: PALETTE.pink,
          alpha: Math.min(1, k),
        });
        gl.rect(lot.x - 6, lot.y - 6, lot.w + 12, lot.h + 12).stroke({
          width: 8,
          color: PALETTE.pink,
          alpha: Math.min(1, k) * 0.7,
        });
        if (fl > 0) f.rect(lot.x, lot.y, lot.w, lot.h).fill({ color: PALETTE.flash, alpha: (fl / 16) * 0.6 });
        if (isMarked && beat <= 1)
          strokeText(f, 'ONCE', cx, lot.y - 48, 18, { color: PALETTE.pink, width: 4, alpha: 0.9 });
      }
      if (sold) {
        const t = lot.soldT ?? 0;
        const a = Math.min(1, t / 30);
        const age = 300 - t;
        const k =
          age < CBT.stampSlamFrames
            ? CBT.stampStartScale - (CBT.stampStartScale - 1) * (age / CBT.stampSlamFrames)
            : 1;
        drawStamp(f, 'SOLD', cx, lot.y + lot.h / 2 - 8, 18, -0.18, PALETTE.stampRed, a, k);
      }
      const ob = this.outbid.get(i) ?? 0;
      if (ob > 0) drawStamp(f, 'OUTBID', cx, lot.y - 40, 16, 0.12, PALETTE.gold, Math.min(1, ob / 10));
    });
  }

  /** Screen layer (canvas px): hit flashes, hurt vignette, the CLEARED stamp. */
  drawScreen(g: Graphics): void {
    for (const f of this.flashes)
      g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: f.color, alpha: f.alpha * (1 - f.age / f.frames) });
    if (this.vignette > 0) {
      const a = this.vignette * 0.5;
      for (let i = 0; i < 4; i++) {
        const w = 70 - i * 16;
        g.rect(w / 2, w / 2, VIEW_W - w, VIEW_H - w).stroke({
          width: w,
          color: PALETTE.furious,
          alpha: a * (0.25 + i * 0.12),
        });
      }
    }
    if (this.clearAge >= 0) {
      const t = this.clearAge;
      const slam = CBT.stampSlamFrames;
      let k = 1;
      if (t < slam) {
        const u = t / slam;
        k =
          u < 0.6
            ? CBT.stampStartScale + (0.9 - CBT.stampStartScale) * (u / 0.6)
            : 0.9 + 0.1 * ((u - 0.6) / 0.4);
      }
      const fade = Math.min(1, (CBT.clearFrames - t) / 12);
      const a = Math.min(1, 0.3 + t / 4) * fade;
      g.rect(0, VIEW_H * 0.3 - 70, VIEW_W, 140).fill({ color: PALETTE.bg, alpha: 0.35 * a });
      drawStamp(g, 'CLEARED', VIEW_W / 2, VIEW_H * 0.3, 64, -0.08, PALETTE.stampRed, a, k);
    }
  }
}

function promptCentre(pr: PromptDef, padX: number, padY: number, ts: number): [number, number] {
  return [(pr.at[0] + padX) * ts + ts / 2, (pr.at[1] + padY) * ts + ts / 2];
}

/** Keycaps side by side with "+" between them, on a dark pill for contrast. */
function drawPrompt(g: Graphics, keys: KeyName[], cx: number, cy: number, alpha: number): void {
  const s = CBT.keySize;
  const gap = 30;
  const w = keys.length * s + (keys.length - 1) * gap;
  g.roundRect(cx - w / 2 - 12, cy - s / 2 - 10, w + 24, s + 26, 14).fill({
    color: PALETTE.bg,
    alpha: 0.6 * alpha,
  });
  keys.forEach((k, i) => {
    const x = cx - w / 2 + s / 2 + i * (s + gap);
    drawKeycap(g, k, x, cy, s, alpha);
    if (i > 0) drawPlus(g, x - s / 2 - gap / 2, cy + 3, 14, alpha);
  });
}
