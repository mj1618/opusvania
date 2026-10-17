/**
 * The level kit in greybox (memory/level-kit.md, memory/greybox.md): thorns red with teeth, seed-cases
 * an amber ring, rotten bark a hatched panel with drifting spores (the secret language: the same look
 * wherever a wall or floor gives), gates a pale silk curtain, triggers a dashed plate, camera zones a
 * dashed violet frame. Reads the scene, the save and `sim.kit`; the beats come from the kit's events.
 * Render time only (`clock`), no randomness: shots are reproducible.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import type { Room } from '../../scene/room';
import type { SimEvent } from '../../sim/events';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { GB } from './palette';
import { label } from './static';

/** The kit's colours (the hazard red and the warm amber are the greybox palette's own). */
const KC = {
  thorn: GB.hazard,
  thornTooth: 0xff7a80,
  seed: 0xffb347,
  seedCore: 0x8a6a3a,
  bark: 0x5e4a33,
  barkHatch: 0x9c7b52,
  barkEdge: 0xc9a46c,
  spore: 0xd9e8a0,
  silk: 0xdcdcf0,
  trigger: 0x5cc8e0,
  zone: 0xb48cff,
  cap: 0xc77fd6,
  capTop: 0xf0c8f5,
  stone: 0x7d8aa6,
  stoneGlyph: 0xe8ecf6,
  sign: 0xffd27a,
  hollow: 0xd8e6ff,
} as const;

/** A bounce cap taking her: px its top sinks for three frames, then it rings back (feel review r2). */
const CAP_SQUASH = { dip: 14 };

/** Seconds one pass of a sign's rhythm takes, and the rest between its two passes. */
function rhythmLen(rhythm: string): number {
  let at = 0;
  for (const ch of rhythm) at += (ch === '-' ? 0.45 : 0.15) + 0.2;
  return at;
}
const RHYTHM_REST = 0.9;

/**
 * A sign's flashes: `.` short, `-` long (seconds lit), with a dark gap between; played twice with a rest
 * between (the firefly's call, as the grove's far flicker will repeat it).
 */
function rhythmLit(rhythm: string, t0: number): boolean {
  const pass = rhythmLen(rhythm) + RHYTHM_REST;
  if (t0 >= 2 * pass) return false;
  const t = t0 % pass;
  let at = 0;
  for (const ch of rhythm) {
    const on = ch === '-' ? 0.45 : 0.15;
    if (t >= at && t < at + on) return true;
    at += on + 0.2;
  }
  return false;
}

interface Fx {
  kind: 'chip' | 'break' | 'clang' | 'pogo' | 'gate' | 'flag' | 'thorn' | 'bounce' | 'stone' | 'grant';
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
  life: number;
}

const LIFE: Record<Fx['kind'], number> = {
  chip: 0.3,
  break: 0.8,
  clang: 0.3,
  pogo: 0.3,
  gate: 1.0,
  flag: 0.9,
  thorn: 0.4,
  bounce: 0.35,
  stone: 1.2,
  grant: 3.5,
};

/** A small stable number in [0, 1) from a string (spores and shakes differ per piece, the same every run). */
function hash01(s: string, k: number): number {
  let h = 2166136261 ^ k;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** Diagonal hatch lines (slope 1, every `gap` px) clipped to a rect: path only (the caller strokes). */
function hatch(g: Graphics, x: number, y: number, w: number, h: number, gap: number): void {
  for (let c = x - y - h; c <= x + w - y; c += gap) {
    const xa = Math.max(x, y + c);
    const xb = Math.min(x + w, y + h + c);
    if (xb <= xa) continue;
    g.moveTo(xa, xa - c).lineTo(xb, xb - c);
  }
}

function dashed(g: Graphics, x: number, y: number, w: number, h: number, dash = 16, gap = 10): void {
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len <= 0) return;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}

/** The kit's labels (with the room's other labels: G toggles them). */
export function kitLabels(room: Room, into: Container): void {
  for (const r of room.thorns ?? [])
    into.addChild(label(`thorns ${r.id}`, r.x + r.w / 2, r.y - 10, KC.thornTooth, 15));
  for (const c of room.seedCases ?? []) into.addChild(label(`seed-case ${c.id}`, c.x, c.y - 40, KC.seed, 15));
  for (const b of room.bark ?? []) {
    const hp = b.hp ?? tuning.kit.bark.hp;
    const what = b.floor ? `floor bark ${b.id} (${hp} down cuts)` : `bark ${b.id} (${hp} cuts)`;
    into.addChild(label(what, b.x + b.w / 2, b.y - 10, KC.barkEdge, 15));
  }
  for (const g of room.gates ?? [])
    into.addChild(label(`gate ${g.id}: until "${g.flag}"`, g.x + g.w / 2, g.y - 10, KC.silk, 15));
  for (const t of room.triggers ?? [])
    into.addChild(label(`trigger ${t.id}: sets "${t.sets}"`, t.x + t.w / 2, t.y - 10, KC.trigger, 15));
  for (const c of room.caps ?? [])
    into.addChild(
      label(`cap ${c.id} (${c.height ?? c.tier ?? 'small'})`, c.x + c.w / 2, c.y - 64, KC.capTop, 15),
    );
  for (const m of room.mothStones ?? [])
    into.addChild(label(`moth-stone ${m.id}: area ${m.area}`, m.x, m.y - 140, KC.stoneGlyph, 15));
  for (const sg of room.signs ?? [])
    into.addChild(label(`firefly sign ${sg.id}`, sg.x, sg.y - 190, KC.sign, 15));
  for (const h of room.hollows ?? [])
    into.addChild(label(`hollow ${h.id}: ${h.upgrade}`, h.x + h.w / 2, h.y - 10, KC.hollow, 15));
  for (const z of room.camera?.zones ?? []) {
    const how = [z.fit ? 'fit' : `zoom ${z.zoom ?? 1}`, z.lock ? 'lock' : '', z.bounds ? 'bounds' : '']
      .filter(Boolean)
      .join(', ');
    into.addChild(label(`camera ${z.id} (${how})`, z.x + z.w / 2, z.y + 28, KC.zone, 16));
  }
}

export class KitView {
  private readonly fx: Fx[] = [];
  /** Per bark id: seconds since its last cut (the panel shakes for a moment). */
  private readonly shake = new Map<string, number>();
  /** Per cap id: seconds since it last threw her (it squashes); per sign id: seconds since it was read. */
  private readonly squash = new Map<string, number>();
  private readonly reading = new Map<string, number>();
  /** Under her: thorns, seed-cases, bark, gates, triggers, zones, caps, finds. */
  readonly back = new Graphics();
  /** Over her: the beats (`fg`) and a hollow's line. */
  readonly front = new Container({ label: 'greybox-kit-front' });
  private readonly fg = new Graphics();
  private line: Text | null = null;

  constructor() {
    this.front.addChild(this.fg);
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) {
        this.fx.length = 0;
        this.shake.clear();
        this.squash.clear();
        this.reading.clear();
        this.line?.destroy();
        this.line = null;
      } else if (e.type === 'barkHit') {
        this.shake.set(e.id, 0);
        this.add('chip', e.x, e.y, 0, 0);
      } else if (e.type === 'barkBreak') this.add('break', e.x, e.y, e.w, e.h);
      else if (e.type === 'capBounce') {
        this.squash.set(e.id, 0);
        this.add('bounce', e.x, e.y, 0, 0);
      } else if (e.type === 'stoneRead') this.add('stone', e.x, e.y - 60, 0, 0);
      else if (e.type === 'signRead') this.reading.set(e.id, 0);
      else if (e.type === 'hollowGrant') {
        // (Its line is the HUD's item line, hud/item-line.ts.)
        this.add('grant', e.x, e.y, 0, 0);
      } else if (e.type === 'kitClang') this.add('clang', e.hitX, e.hitY, 0, 0);
      else if (e.type === 'slashHit' && (e.target.kind === 'seedCase' || e.target.kind === 'thorns'))
        this.add('pogo', e.x, e.y, 0, 0);
      else if (e.type === 'gateOpen') this.add('gate', e.x, e.y, e.w, e.h);
      else if (e.type === 'flagSet') this.add('flag', e.x, e.y, 0, 0);
      else if (e.type === 'thornHit') this.add('thorn', e.x, e.y - 40, 0, 0);
    }
  }

  private add(kind: Fx['kind'], x: number, y: number, w: number, h: number): void {
    this.fx.push({ kind, x, y, w, h, t: 0, life: LIFE[kind] });
  }

  /** `designer`: draw the designer's marks too (camera zones, trigger plates): with the labels (G), not in play. */
  draw(dt: number, clock: number, sim: SimView, designer = true): void {
    const room = sim.scene;
    const save = sim.save;
    const g = this.back.clear();
    // Camera zones: a dashed frame (the play reads the zoom; this says where it starts).
    for (const z of designer ? (room.camera?.zones ?? []) : []) {
      dashed(g, z.x, z.y, z.w, z.h, 28, 18);
      g.stroke({ color: KC.zone, width: 2, alpha: 0.35 });
    }
    // Triggers: a dashed plate, dim once its flag is set.
    for (const t of designer ? (room.triggers ?? []) : []) {
      const set = save.flags.includes(t.sets);
      g.rect(t.x, t.y, t.w, t.h).fill({ color: KC.trigger, alpha: set ? 0.03 : 0.08 });
      dashed(g, t.x, t.y, t.w, t.h);
      g.stroke({ color: KC.trigger, width: 2, alpha: set ? 0.25 : 0.7 });
    }
    // Thorns: red with teeth along the faces she meets (the top of a bed, the sides of a band).
    for (const r of room.thorns ?? []) {
      g.rect(r.x, r.y, r.w, r.h).fill({ color: KC.thorn, alpha: 0.55 });
      const tooth = 16;
      if (r.w >= r.h) {
        for (let x = r.x; x + tooth <= r.x + r.w + 0.5; x += tooth)
          g.moveTo(x, r.y)
            .lineTo(x + tooth / 2, r.y - 12)
            .lineTo(x + tooth, r.y);
        if (r.h > 48)
          for (let x = r.x; x + tooth <= r.x + r.w + 0.5; x += tooth)
            g.moveTo(x, r.y + r.h)
              .lineTo(x + tooth / 2, r.y + r.h + 12)
              .lineTo(x + tooth, r.y + r.h);
      } else {
        for (let y = r.y; y + tooth <= r.y + r.h + 0.5; y += tooth) {
          g.moveTo(r.x, y)
            .lineTo(r.x - 12, y + tooth / 2)
            .lineTo(r.x, y + tooth);
          g.moveTo(r.x + r.w, y)
            .lineTo(r.x + r.w + 12, y + tooth / 2)
            .lineTo(r.x + r.w, y + tooth);
        }
      }
      g.fill({ color: KC.thornTooth, alpha: 0.9 });
    }
    // Seed-cases: an amber ring, hard and shut.
    const half = tuning.kit.seedCase.size / 2;
    for (const c of room.seedCases ?? []) {
      g.circle(c.x, c.y, half - 3).fill({ color: KC.seedCore, alpha: 0.8 });
      g.circle(c.x, c.y, half - 3).stroke({ color: KC.seed, width: 6 });
      g.circle(c.x, c.y, half * 0.35).stroke({ color: KC.seed, width: 2, alpha: 0.6 });
    }
    // Rotten bark: a hatched panel, its cuts left as pips, spores drifting from its seams; once broken a ghost outline.
    (room.bark ?? []).forEach((b, i) => {
      const left = sim.kit.bark[i] ?? 0;
      if (left <= 0 || save.opened.includes(`${room.id}:${b.id}`)) {
        dashed(g, b.x, b.y, b.w, b.h, 10, 10);
        g.stroke({ color: KC.barkEdge, width: 1, alpha: 0.25 });
        return;
      }
      const since = this.shake.get(b.id);
      let sx = 0;
      if (since !== undefined) {
        const k = Math.max(0, 1 - since / 0.25);
        sx = Math.sin(since * 90) * 5 * k;
        this.shake.set(b.id, since + dt);
      }
      const x = b.x + sx;
      g.rect(x, b.y, b.w, b.h).fill({ color: KC.bark });
      hatch(g, x, b.y, b.w, b.h, 14);
      g.stroke({ color: KC.barkHatch, width: 2, alpha: 0.8 });
      g.rect(x, b.y, b.w, b.h).stroke({ color: KC.barkEdge, width: 2, alpha: 0.9 });
      if (b.floor) {
        g.rect(x, b.y, b.w, GB.topPx).fill({ color: GB.solidTop, alpha: 0.6 });
        // Moonlight welling up through a floor panel (a dead end that is a door): pale slits in the bark and
        // a faint rising glow over it that breathes, the moon patches' light from below.
        const breath = 0.75 + 0.25 * Math.sin(clock * 1.1 + hash01(b.id, 3) * 6);
        for (let k = 1; k < 5; k++) {
          const sxk = x + (b.w * k) / 5 + Math.sin(k * 2.3) * 6;
          g.moveTo(sxk, b.y + 6).lineTo(sxk + 4, b.y + b.h - 6);
        }
        g.stroke({ color: KC.hollow, width: 2, alpha: 0.45 * breath });
        for (let k = 0; k < 5; k++) {
          const hgt = 40 + k * 34;
          g.rect(x + k * 8, b.y - hgt, b.w - k * 16, hgt).fill({ color: KC.hollow, alpha: 0.035 * breath });
        }
      }
      const max = b.hp ?? tuning.kit.bark.hp;
      for (let k = 0; k < max; k++) {
        const px = b.x + b.w / 2 + (k - (max - 1) / 2) * 14;
        const py = b.floor ? b.y + b.h / 2 : b.y + 18;
        if (k < left) g.circle(px, py, 4).fill({ color: KC.barkEdge });
        else g.circle(px, py, 4).stroke({ color: KC.barkEdge, width: 1, alpha: 0.5 });
      }
      // Spores: motes rising out of the panel and fading (the "something gives here" tell).
      const n = Math.max(3, Math.min(10, Math.round((b.w + b.h) / 60)));
      for (let k = 0; k < n; k++) {
        const ph = (clock * 0.22 + k / n + hash01(b.id, k)) % 1;
        const ox = b.floor ? hash01(b.id, k + 31) * b.w : hash01(b.id, k + 31) < 0.5 ? -6 : b.w + 6;
        const oy = b.floor ? 0 : hash01(b.id, k + 57) * b.h;
        const mx = b.x + ox + Math.sin(clock * 1.3 + k) * 6;
        const my = b.y + oy - ph * 90;
        g.circle(mx, my, 2.5).fill({ color: KC.spore, alpha: 0.7 * (1 - ph) });
      }
    });
    // Gates: shut = a pale silk curtain of strands; open = a faint outline.
    (room.gates ?? []).forEach((gt, i) => {
      const open = (sim.kit.gates[i] ?? 0) > 0 || save.flags.includes(gt.flag);
      if (open) {
        dashed(g, gt.x, gt.y, gt.w, gt.h, 8, 12);
        g.stroke({ color: KC.silk, width: 1, alpha: 0.2 });
        return;
      }
      g.rect(gt.x, gt.y, gt.w, gt.h).fill({ color: KC.silk, alpha: 0.28 });
      for (let x = gt.x + 6; x < gt.x + gt.w; x += 12) {
        const sway = Math.sin(clock * 0.8 + x * 0.05) * 3;
        g.moveTo(x, gt.y).lineTo(x + sway, gt.y + gt.h);
      }
      g.stroke({ color: KC.silk, width: 2, alpha: 0.75 });
    });
    this.drawCapsAndFinds(g, dt, clock, sim);
    // The beats, over her.
    const f = this.fg.clear();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i] as Fx;
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      const a = 1 - k;
      if (e.kind === 'chip')
        f.circle(e.x, e.y, 20 + 50 * k).stroke({ color: KC.barkEdge, width: 3, alpha: a });
      else if (e.kind === 'break') {
        // The panel flies apart: chunks thrown out from its centre, falling.
        for (let c = 0; c < 10; c++) {
          const ang = (c / 10) * Math.PI * 2 + 0.3;
          const sp = 220 + (140 * ((c * 37) % 7)) / 7;
          const cx = e.x + Math.cos(ang) * sp * e.t;
          const cy = e.y + Math.sin(ang) * sp * e.t + 600 * e.t * e.t;
          f.rect(cx - 7, cy - 7, 14, 14).fill({ color: KC.barkHatch, alpha: a });
        }
        f.rect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h).stroke({ color: 0xffffff, width: 3, alpha: a * 0.8 });
      } else if (e.kind === 'clang') {
        // The clang star the old burrback's shell uses (feel review r2: "three ticks" did not read).
        const sr = 34 * (0.75 + 0.5 * (1 - (1 - k) * (1 - k)));
        const star: number[] = [];
        for (let c = 0; c < 16; c++) {
          const ang = (c / 16) * Math.PI * 2 + 0.2;
          const rr = c % 2 === 0 ? sr : sr * 0.3;
          star.push(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr);
        }
        f.poly(star).fill({ color: 0xffffff, alpha: 1 - k * k });
        for (let c = 0; c < 6; c++) {
          const ang = (c / 6) * Math.PI * 2;
          const r0 = 8 + 30 * k;
          f.moveTo(e.x + Math.cos(ang) * r0, e.y + Math.sin(ang) * r0).lineTo(
            e.x + Math.cos(ang) * (r0 + 16),
            e.y + Math.sin(ang) * (r0 + 16),
          );
        }
        f.stroke({ color: 0xffffff, width: 3, alpha: a });
      } else if (e.kind === 'pogo')
        f.circle(e.x, e.y, 16 + 40 * k).stroke({ color: KC.seed, width: 3, alpha: a });
      else if (e.kind === 'gate') {
        // The curtain falls: strands dropping out of the frame.
        for (let x = e.x - e.w / 2 + 6; x < e.x + e.w / 2; x += 12) {
          const y0 = e.y - e.h / 2 + 900 * e.t * e.t;
          f.moveTo(x, y0).lineTo(x, Math.min(y0 + e.h, e.y + e.h / 2 + 400));
        }
        f.stroke({ color: KC.silk, width: 2, alpha: a });
      } else if (e.kind === 'flag') {
        // A trigger firing is a designer's mark too (labels only).
        if (designer) f.circle(e.x, e.y, 30 + 140 * k).stroke({ color: KC.trigger, width: 3, alpha: a });
      } else if (e.kind === 'bounce')
        f.circle(e.x, e.y, 20 + 60 * k).stroke({ color: KC.capTop, width: 3, alpha: a });
      else if (e.kind === 'stone') {
        f.circle(e.x, e.y, 40 + 500 * k).stroke({ color: KC.stoneGlyph, width: 4, alpha: a });
        f.circle(e.x, e.y, 20 + 260 * k).stroke({ color: KC.stoneGlyph, width: 2, alpha: a * 0.6 });
      } else if (e.kind === 'grant') {
        const burst = Math.min(1, e.t / 0.6);
        f.circle(e.x, e.y - 120, 50 + 300 * burst).stroke({ color: 0xffffff, width: 4, alpha: 1 - burst });
        if (this.line) {
          this.line.position.set(sim.player.cx, sim.player.feetY - 160);
          this.line.alpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        }
        if (e.t >= e.life) {
          this.line?.destroy();
          this.line = null;
        }
      } else f.circle(e.x, e.y, 30 + 60 * k).stroke({ color: KC.thorn, width: 4, alpha: a });
      if (e.t >= e.life) this.fx.splice(i, 1);
    }
  }

  /** Bounce caps (a squashing dome), moth-stones (a carved slab), firefly signs (glow-caps), hollows (a shaft). */
  private drawCapsAndFinds(g: Graphics, dt: number, clock: number, sim: SimView): void {
    const room = sim.scene;
    const taken = (id: string) => sim.save.taken.includes(`${room.id}:${id}`);
    for (const c of room.caps ?? []) {
      const since = this.squash.get(c.id);
      let dip = 0;
      if (since !== undefined) {
        // Squashed flat for three frames as it takes her, then it springs back past itself and settles.
        dip =
          since < 3 / 60
            ? CAP_SQUASH.dip
            : CAP_SQUASH.dip * Math.exp(-(since - 0.05) * 9) * Math.cos((since - 0.05) * 26);
        if (since > 0.6) dip = 0;
        this.squash.set(c.id, since + dt);
      }
      const r = Math.min(c.h, c.w / 2, 28);
      g.roundRect(c.x, c.y + dip, c.w, c.h - dip, r).fill({ color: KC.cap });
      g.roundRect(c.x, c.y + dip, c.w, Math.min(10, c.h), 5).fill({ color: KC.capTop });
      for (let k = 0; k < Math.max(1, Math.floor(c.w / 60)); k++)
        g.circle(c.x + 24 + k * 60, c.y + dip + c.h * 0.55, 5).fill({ color: KC.capTop, alpha: 0.7 });
      // The tier as chevrons over it (one small, two mid, three big).
      const n = c.tier === 'big' ? 3 : c.tier === 'mid' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const y = c.y - 22 - k * 12 - 4 * Math.sin(clock * 3);
        g.moveTo(c.x + c.w / 2 - 12, y + 8)
          .lineTo(c.x + c.w / 2, y)
          .lineTo(c.x + c.w / 2 + 12, y + 8);
      }
      g.stroke({ color: KC.capTop, width: 3, alpha: 0.7 });
    }
    for (const m of room.mothStones ?? []) {
      const read = taken(m.id);
      g.roundRect(m.x - 34, m.y - 120, 68, 120, 14).fill({ color: KC.stone });
      // The carving: a moth (two wings and a body).
      const cy = m.y - 70;
      g.moveTo(m.x, cy)
        .lineTo(m.x - 22, cy - 18)
        .lineTo(m.x - 18, cy + 12)
        .closePath();
      g.moveTo(m.x, cy)
        .lineTo(m.x + 22, cy - 18)
        .lineTo(m.x + 18, cy + 12)
        .closePath();
      g.fill({ color: KC.stoneGlyph, alpha: read ? 0.95 : 0.35 + 0.1 * Math.sin(clock * 1.5) });
      g.rect(m.x - 2, cy - 14, 4, 30).fill({ color: KC.stoneGlyph, alpha: read ? 0.95 : 0.45 });
    }
    for (const sg of room.signs ?? []) {
      const read = taken(sg.id);
      const t = this.reading.get(sg.id);
      let lit = false;
      if (t !== undefined) {
        lit = rhythmLit(sg.rhythm ?? '...-', t);
        this.reading.set(sg.id, t + dt);
      }
      // A ring of glow-caps the firefly hung: dim unread, soft once read, bright on its flashes.
      for (let k = 0; k < 6; k++) {
        const a = Math.PI + (k / 5) * Math.PI;
        const x = sg.x + Math.cos(a) * 60;
        const y = sg.y - 120 + Math.sin(a) * 40;
        const alpha = lit ? 1 : read ? 0.55 : 0.2 + 0.1 * Math.sin(clock * 2 + k);
        g.circle(x, y, lit ? 9 : 6).fill({ color: KC.sign, alpha });
      }
      // The call itself: one warm light over the ring that blinks the rhythm (the firefly's signal).
      if (t !== undefined && t < 2 * (rhythmLen(sg.rhythm ?? '...-') + RHYTHM_REST)) {
        const cx = sg.x;
        const cy = sg.y - 215;
        g.circle(cx, cy, lit ? 34 : 14).fill({ color: KC.sign, alpha: lit ? 0.16 : 0.05 });
        g.circle(cx, cy, lit ? 8 : 4).fill({ color: KC.sign, alpha: lit ? 1 : 0.35 });
      }
      g.moveTo(sg.x - 60, sg.y - 120)
        .lineTo(sg.x - 60, sg.y)
        .stroke({ color: KC.sign, width: 1, alpha: 0.25 });
    }
    for (const h of room.hollows ?? []) {
      const got = taken(h.id);
      for (let k = 0; k < 4; k++)
        g.rect(h.x + k * 8, h.y - 200, h.w - k * 16, h.h + 200).fill({
          color: KC.hollow,
          alpha: got ? 0.015 : 0.04,
        });
      g.rect(h.x, h.y, h.w, h.h).stroke({ color: KC.hollow, width: 2, alpha: got ? 0.15 : 0.6 });
      if (!got)
        g.star(h.x + h.w / 2, h.y + h.h / 2, 4, 10, 4).fill({
          color: KC.hollow,
          alpha: 0.6 + 0.3 * Math.sin(clock * 2),
        });
    }
  }
}
