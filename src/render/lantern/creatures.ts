/**
 * Lanternroot's spiders, painted (memory/lanternroot-art.md; the rules are memory/creatures.md and bosses.md):
 *
 *  - **The dangler** (and the Gloamweaver's spiderlings, its smaller, paler young): a hunched orb-weaver
 *    hanging head-down on its silk, legs gathered. Its tell is its eyes kindling red and its thread shown to
 *    where it will drop; the drop splays its legs; the swing trails them; hanging open it bobs, legs loose;
 *    cut down it tumbles and lies on its back, legs curled.
 *  - **Webs**: silk strands that catch the light along their length, dew beads at the joins; a cut strand is gone.
 *  - **The Gloamweaver**: the same body, three times the size, a pale pattern on its great abdomen. In P1 it is
 *    the dark itself: only its eyes and the lamp's glint on its legs show (it is shielded). Exposed it falls
 *    belly-up and pale, open. Its P2 tells are painted where the danger will be: the arc in glinting silk,
 *    a faint ember wash on the floor it sweeps. The sealed doors are sheets of old silk.
 *
 * The bodies are drawn behind her (`back`), the eyes' glow in the additive pool. Render time only.
 */
import type { Graphics } from 'pixi.js';
import { cycleSine } from '../../sim/paths';
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import { mix } from '../scene/lib/look';
import type { GlowPool } from './glow';

export const SPIDER = {
  body: 0x1c1218,
  bodyLit: 0x4a3440,
  pattern: 0x9a8a78,
  leg: 0x140c12,
  legLit: 0x5a4450,
  eye: 0xf2e6d8,
  hunt: 0xff5a3c,
  open: 0xd8d0c4,
  silk: 0xdfe4ee,
  dew: 0xf4f8ff,
  /** Spiderlings: size and how much paler. */
  young: 0.62,
  youngPale: 0.3,
  /** The Gloamweaver's size against a dangler's body. */
  great: 3.3,
  /** The Gloamweaver: its body near-black (a silhouette against the light), eyes cold and bright, legs longer. */
  greatBody: 0x0c080c,
  greatLeg: 0x0a060a,
  greatEye: 0xd8ffe8,
  greatEyeGlow: 2.2,
  /** Rim light from a burning moonwick (silver) and the Gloam lamp (warm): reach px, strength. */
  rimWick: 0xd4e4ff,
  rimLamp: 0xffb070,
  rimReach: 760,
  rimK: 1.1,
} as const;

interface Pose {
  /** 0 legs gathered .. 1 splayed. */
  spread: number;
  /** Body rotation (rad; 0 = head down, hanging). */
  rot: number;
  /** Walking: a phase that moves the legs; 0 = still. */
  walk: number;
  /** 1 = on its back (cut down, exposed), legs curled up. */
  flip: number;
  /** The tell: 0..1, the eyes kindle. */
  tell: number;
  /** Dark shield (the Gloamweaver in P1): 0 = seen, 1 = only its eyes. */
  dark: number;
  /** 0..1: the body inked toward the Gloamweaver's near-black (a silhouette, its rims carry it). */
  ink: number;
}

const P: Pose = { spread: 0, rot: 0, walk: 0, flip: 0, tell: 0, dark: 0, ink: 0 };

/** Light catching one side of a spider: direction toward the light (unit, world), colour, strength 0..1. */
export interface Rim {
  dx: number;
  dy: number;
  color: number;
  k: number;
}

/** A spider: abdomen up toward its thread, head down; `s` = abdomen radius. */
function spider(
  g: Graphics,
  glow: GlowPool,
  x: number,
  y: number,
  s: number,
  pose: Pose,
  pale: number,
  clock: number,
  seed: number,
  rims: readonly Rim[] = [],
  eyeIdle: number = SPIDER.eye,
  eyeGlow = 1,
): void {
  const cs = Math.cos(pose.rot);
  const sn = Math.sin(pose.rot);
  // Local frame: +v down along the body (head end), +u across.
  const at = (u: number, v: number): [number, number] => [x + u * cs - v * sn, y + u * sn + v * cs];
  const dark = pose.dark;
  const alpha = 1 - dark * 0.8;
  const body = mix(mix(SPIDER.body, SPIDER.open, pose.flip * 0.55 + pale), SPIDER.greatBody, pose.ink);
  const leg = mix(mix(SPIDER.leg, SPIDER.open, pose.flip * 0.35 + pale * 0.8), SPIDER.greatLeg, pose.ink);
  // Legs: four a side, radiating from the cephalothorax like a star (front pair toward the head, back pair toward
  // the abdomen), each femur out from the body to a high knee, the tibia bending back in toward the head end.
  const cy = s * 0.95;
  const legs: Array<[number, number, number, number, number, number]> = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const step = pose.walk ? Math.sin(pose.walk + i * 1.7 + (side > 0 ? 0 : Math.PI)) * 0.22 : 0;
      const curl = pose.flip;
      // Angle from the head direction (+v) round toward this side: 0.45 rad for the front pair, 2.5 for the back.
      const theta = 0.45 + (i / 3) * 2.05 + step - (1 - pose.spread) * 0.15 * (i < 2 ? -1 : 1);
      const L1 = s * (1.05 + 0.55 * pose.spread) * (1 - 0.4 * curl) * (i === 0 || i === 3 ? 1.12 : 1);
      const L2 = s * (1.15 + 0.6 * pose.spread) * (1 - 0.45 * curl) * (i === 0 ? 1.15 : 1);
      const bend = (0.95 - 0.55 * pose.spread + 0.9 * curl) * side;
      const bu = side * s * 0.28;
      const bv = cy - s * 0.12 + (i - 1.5) * s * 0.13;
      const ku = bu + side * Math.sin(theta) * L1;
      const kv = bv + Math.cos(theta) * L1;
      const fu = ku + side * Math.sin(theta - bend * side) * L2 * 0.95;
      const fv = kv + Math.cos(theta - bend * side) * L2;
      const B = at(bu, bv);
      const K = at(ku, kv);
      const F = at(fu, fv);
      legs.push([B[0], B[1], K[0], K[1], F[0], F[1]]);
    }
  }
  // Femurs thick, tibiae fine: a spider's legs taper to the tips.
  // (The Gloamweaver's are heavier: a silhouette has to carry it in the dark.)
  const heavy = 1 + 0.45 * pose.ink;
  for (const [bx, by, kx, ky] of legs) g.moveTo(bx, by).lineTo(kx, ky);
  g.stroke({ color: leg, width: Math.max(1.4, s * 0.15 * heavy), alpha, join: 'round', cap: 'round' });
  for (const [, , kx, ky, fx, fy] of legs) g.moveTo(kx, ky).lineTo(fx, fy);
  g.stroke({ color: leg, width: Math.max(1, s * 0.08 * heavy), alpha, join: 'round', cap: 'round' });
  // The light catching each femur's upper edge (the lamp's glint on them, even in the dark), and the knees.
  for (const [bx, by, kx, ky] of legs) g.moveTo(bx, by - 1).lineTo(kx, ky - 1);
  g.stroke({ color: SPIDER.legLit, width: Math.max(0.8, s * 0.045), alpha: 0.6 * (1 - dark * 0.5) });
  for (const [, , kx, ky] of legs) g.circle(kx, ky, Math.max(1, s * 0.07)).fill({ color: leg, alpha });
  // Rim light on the legs: each segment's edge toward the light.
  for (const rm of rims) {
    if (rm.k <= 0.01) continue;
    const o = Math.max(0.8, s * 0.075);
    for (const [bx, by, kx, ky, fx, fy] of legs) {
      g.moveTo(bx + rm.dx * o, by + rm.dy * o)
        .lineTo(kx + rm.dx * o, ky + rm.dy * o)
        .lineTo(fx + rm.dx * o * 0.5, fy + rm.dy * o * 0.5);
    }
    g.stroke({
      color: rm.color,
      width: Math.max(0.8, s * 0.03),
      alpha: Math.min(1, rm.k * 0.8),
      join: 'round',
      cap: 'round',
    });
  }
  // Abdomen (up) and cephalothorax (down).
  const ab = at(0, -s * 0.15);
  g.ellipse(ab[0], ab[1], s, s * 1.12).fill({ color: body, alpha });
  // A rim of light on the upper right of the abdomen.
  g.ellipse(ab[0] + s * 0.25 * cs, ab[1] - s * 0.3, s * 0.6, s * 0.7).fill({
    color: SPIDER.bodyLit,
    alpha: alpha * 0.35,
  });
  // Its pattern: a pale chevron row down the back (the Gloamweaver's is the clearest thing on it in the dark).
  for (let k = 0; k < 4; k++) {
    const p0 = at(-s * 0.4 * (1 - k * 0.18), -s * 0.75 + k * s * 0.38);
    const p1 = at(0, -s * 0.55 + k * s * 0.38);
    const p2 = at(s * 0.4 * (1 - k * 0.18), -s * 0.75 + k * s * 0.38);
    g.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]).lineTo(p2[0], p2[1]);
  }
  g.stroke({
    color: SPIDER.pattern,
    width: Math.max(1, s * 0.09),
    alpha: (0.55 + 0.3 * pose.flip) * (1 - dark * 0.7),
  });
  const ce = at(0, cy);
  g.ellipse(ce[0], ce[1], s * 0.48, s * 0.5).fill({ color: mix(body, 0x000000, 0.15), alpha });
  // Rim light on the abdomen and the head: a crescent on the side toward each light.
  for (const rm of rims) {
    if (rm.k <= 0.01) continue;
    const a = Math.atan2(rm.dy, rm.dx);
    g.arc(ab[0], ab[1], s * 1.04, a - 1.05, a + 1.05);
    g.stroke({ color: rm.color, width: Math.max(1.2, s * 0.07), alpha: Math.min(1, rm.k) });
    g.arc(ce[0], ce[1], s * 0.5, a - 0.9, a + 0.9);
    g.stroke({ color: rm.color, width: Math.max(1, s * 0.05), alpha: Math.min(1, rm.k) * 0.8 });
    glow.add(ab[0] + rm.dx * s, ab[1] + rm.dy * s, s * 0.9, rm.color, 0.08 * rm.k);
  }
  // Eyes: a little cluster at the head end; they kindle with the tell (the hunt colour) and always glint.
  const eyeC = pose.tell > 0 ? mix(eyeIdle, SPIDER.hunt, Math.min(1, pose.tell * 1.5)) : eyeIdle;
  // Two rows of eyes, the middle pair largest (an orb-weaver's), each a small wet glint.
  for (let k = 0; k < 8; k++) {
    const row = k < 4 ? 0 : 1;
    const c = (k % 4) - 1.5;
    const big = Math.abs(c) < 1 ? 1 : 0.7;
    const e = at(c * s * 0.14 * (row ? 0.8 : 1), cy + s * (0.24 + row * 0.13) - Math.abs(c) * s * 0.03);
    g.circle(e[0], e[1], Math.max(0.8, s * 0.055 * big)).fill({ color: eyeC, alpha: 0.6 + 0.35 * big });
  }
  const eyes = at(0, cy + s * 0.3);
  const glint = (0.12 + 0.5 * pose.tell + 0.45 * dark + 0.06 * Math.sin(clock * 3 + seed)) * eyeGlow;
  glow.add(
    eyes[0],
    eyes[1],
    s * (0.5 + pose.tell * 0.8 + dark * 0.3),
    pose.tell > 0 ? mix(eyeIdle, SPIDER.hunt, Math.min(1, pose.tell * 1.5)) : eyeIdle,
    glint,
  );
}

export class Creatures {
  /** Per enemy: the last tell seen and render time since it began (the eyes kindle over it). */
  private readonly tellT = new Map<number, number>();

  draw(
    dt: number,
    clock: number,
    sim: SimView,
    cam: CameraView,
    back: Graphics,
    front: Graphics,
    glow: GlowPool,
  ): void {
    const list = sim.enemies;
    const spawns = sim.scene.enemies ?? [];
    const hw = cam.w / 2 / cam.zoom + 300;
    const hh = cam.h / 2 / cam.zoom + 300;
    // Webs first: the spiders walk on them.
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const sp = spawns[i];
      if (e?.kind !== 'web' || !sp?.strands) continue;
      this.web(back, glow, e, sp.strands, clock);
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.gone) continue;
      const ex = e.x + e.w / 2;
      const ey = e.y + e.h / 2;
      if (Math.abs(ex - cam.x) > hw || Math.abs(ey - cam.y) > hh) continue;
      if (e.kind === 'dangler') this.dangler(i, e, dt, clock, sim, back, glow);
      else if ((e.kind as string) === 'gloamweaver') this.gloam(e, clock, sim, back, front, glow);
    }
  }

  private dangler(
    i: number,
    e: EnemyState,
    dt: number,
    clock: number,
    sim: SimView,
    g: Graphics,
    glow: GlowPool,
  ): void {
    const sp = sim.scene.enemies?.[i];
    const young =
      (sp as { fight?: boolean } | undefined)?.fight === true ||
      (sp as { respawn?: number } | undefined)?.respawn !== undefined;
    const s = 13 * (young ? SPIDER.young : 1);
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const m = e.mode;
    const t = (this.tellT.get(i) ?? 0) + dt;
    this.tellT.set(i, m === 'windup' ? t : 0);
    // The thread from its tie point to its back (gone once cut).
    if (!e.broken && m !== 'fall' && m !== 'recover' && m !== 'leave' && m !== 'dead') {
      g.moveTo(e.fromX, e.fromY).lineTo(ex, e.y + 2);
      g.stroke({ color: SPIDER.silk, width: 1.2, alpha: 0.55 });
      // A glint running down it.
      const u = (clock * 0.6 + i * 0.37) % 1;
      glow.add(e.fromX + (ex - e.fromX) * u, e.fromY + (e.y - e.fromY) * u, 6, SPIDER.dew, 0.3);
    }
    // The tell: the silk to where it will drop, shown faint, and its eyes kindling.
    let tell = 0;
    if (m === 'windup') {
      tell = Math.min(1, t / (tuning.dangler.tellFrames / 60));
      g.moveTo(ex, e.y + e.h).lineTo(e.targetX, e.targetY);
      g.stroke({ color: SPIDER.silk, width: 1, alpha: 0.18 + 0.3 * tell });
      glow.add(e.targetX, e.targetY, 22, SPIDER.hunt, 0.12 * tell);
    }
    const pose = P;
    pose.tell = tell;
    pose.dark = 0;
    pose.ink = 0;
    pose.flip = 0;
    pose.walk = 0;
    pose.rot = 0;
    pose.spread = 0.15;
    if (m === 'drop') pose.spread = 1;
    else if (m === 'swing') {
      pose.spread = 0.7;
      pose.rot = Math.atan2(ex - e.fromX, e.y - e.fromY) * -0.8;
    } else if (m === 'hang' || m === 'stall') pose.spread = 0.45 + 0.1 * Math.sin(clock * 4);
    else if (m === 'climb') pose.walk = clock * 14;
    else if (m === 'fall') {
      pose.spread = 0.9;
      pose.rot = clock * 9;
    } else if (m === 'recover' || m === 'dead') {
      pose.flip = 1;
      pose.walk = m === 'recover' ? clock * 18 : 0;
    } else if (m === 'leave') {
      pose.walk = clock * 22;
      pose.rot = (Math.PI / 2) * (e.facing || 1);
    }
    const fade = m === 'dead' ? Math.max(0, 1 - e.modeFrames / 40) : 1;
    if (fade <= 0) return;
    spider(g, glow, ex, ey, s, pose, young ? SPIDER.youngPale : 0, clock, i);
  }

  private web(
    g: Graphics,
    glow: GlowPool,
    e: EnemyState,
    strands: ReadonlyArray<[number, number, number, number]>,
    clock: number,
  ): void {
    const slack = e.dispersed;
    for (let k = 0; k < strands.length; k++) {
      if (e.cut.charCodeAt(k) !== 48) continue;
      const s = strands[k] as [number, number, number, number];
      // A strand sags with its length (silk is not a ruler), the sag stirring a little, and catches the light.
      const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const flat = Math.abs(s[2] - s[0]) / Math.max(1, len);
      const mx = (s[0] + s[2]) / 2 + Math.sin(clock * 0.7 + k) * len * 0.01;
      const my =
        (s[1] + s[3]) / 2 + len * (slack ? 0.25 : 0.035 + 0.04 * flat) + Math.sin(clock * 0.9 + k * 1.3) * 2;
      g.moveTo(s[0], s[1]).quadraticCurveTo(mx, my, s[2], s[3]);
    }
    g.stroke({ color: SPIDER.silk, width: 1, alpha: slack ? 0.12 : 0.24 });
    // Dew at the ends of strands, glinting slowly.
    for (let k = 0; k < strands.length; k += 2) {
      if (e.cut.charCodeAt(k) !== 48) continue;
      const s = strands[k] as [number, number, number, number];
      const tw = 0.5 + 0.5 * Math.sin(clock * 1.7 + k * 2.3);
      glow.add(s[2], s[3], 5, SPIDER.dew, 0.15 + 0.25 * tw);
    }
  }

  /**
   * The Gloamweaver: a great near-black silhouette whose legs and back catch the light of every burning wick near it
   * (silver) and of its Gloam lamp (warm), its eyes cold and bright in the dark. Its tells: the eyes flaring red as
   * it rears, a thread of silk to where its lunge will land and an ember wash on that floor; the lunge itself a run
   * along that line with its legs thrown forward; at rest after it, crouched; exposed, pale and belly-up.
   */
  private gloam(
    e: EnemyState,
    clock: number,
    sim: SimView,
    g: Graphics,
    front: Graphics,
    glow: GlowPool,
  ): void {
    const b = sim.boss;
    const spec = sim.scene.boss;
    if (!b || !spec || b.stage === 'down') return;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const s = 13 * SPIDER.great * Math.max(1, e.w / 72);
    const floor = spec.floor ?? spec.arena.y + spec.arena.h;
    // The thread from its pivot (P2's drops; P1 hunts on its orb with none).
    if (b.thread && b.stage === 'fight' && b.phase >= 2) {
      g.moveTo(b.pivotX, b.pivotY).lineTo(ex, e.y);
      g.stroke({ color: SPIDER.silk, width: 2.4, alpha: 0.6 });
    }
    const W = tuning.weaverBoss;
    const G = (tuning as unknown as { gloam?: { lungeTell?: number } }).gloam;
    let tell = 0;
    if (b.tell === 'swing' || b.tell === 'drop' || b.tell === 'lunge') {
      const of =
        b.tell === 'swing'
          ? W.tellFrames + W.dropFrames
          : b.tell === 'lunge'
            ? (G?.lungeTell ?? W.lungeTell)
            : W.dropTell;
      tell = Math.max(0, Math.min(1, 1 - b.tellFrames / Math.max(1, of)));
      if (b.tell === 'swing') {
        const n = 28;
        for (let k = 0; k <= n; k++) {
          const u = 0.25 + (0.5 * k) / n;
          const dx = b.side * b.reach * cycleSine(u);
          const x = b.pivotX + dx;
          const y = b.pivotY + Math.sqrt(Math.max(0, b.len * b.len - dx * dx));
          if (k === 0) front.moveTo(x, y);
          else front.lineTo(x, y);
          if (k % 4 === 0) glow.add(x, y, 10, SPIDER.dew, 0.2 + 0.3 * tell);
        }
        front.stroke({ color: SPIDER.silk, width: 2, alpha: 0.2 + 0.35 * tell });
      }
      if (b.tell === 'lunge' && !b.thread) {
        // The line it will run: a thread of silk shot ahead to the floor where it lands, beaded with light.
        const tx = b.pivotX;
        const ty = b.pivotY;
        front.moveTo(ex, ey).lineTo(tx, ty + e.h / 2);
        front.stroke({ color: SPIDER.silk, width: 1.4, alpha: 0.15 + 0.45 * tell });
        for (let k = 1; k <= 6; k++) {
          const u = (k / 6 + clock * 0.8) % 1;
          glow.add(ex + (tx - ex) * u, ey + (ty + e.h / 2 - ey) * u, 9, SPIDER.hunt, 0.25 * tell);
        }
      }
      const x0 = b.tellX0;
      const x1 = b.tellX1;
      for (let k = 0; k < 6; k++) {
        const x = x0 + ((x1 - x0) * (k + 0.5)) / 6;
        glow.add(x, floor - 6, (x1 - x0) / 6, SPIDER.hunt, 0.08 + 0.22 * tell, 18);
      }
    }
    // The lights that catch it: the burning wicks near it (silver) and the Gloam lamp (warm).
    const rims: Rim[] = [];
    const lures = sim.scene.lures ?? [];
    for (let i = 0; i < lures.length; i++) {
      const l = lures[i];
      if (!l || (sim.lures.hp[i] ?? 0) <= 0) continue;
      const wick = (l.kind as string) === 'moonwick';
      const lamp = (l.kind as string) === 'gloam' || l.id === spec.heart;
      if (!wick && !lamp) continue;
      const dx = l.x - ex;
      const dy = l.y - ey;
      const d = Math.hypot(dx, dy);
      const reach = SPIDER.rimReach * (lamp ? 1.3 : 1);
      if (d > reach || d < 1) continue;
      rims.push({
        dx: dx / d,
        dy: dy / d,
        color: wick ? SPIDER.rimWick : SPIDER.rimLamp,
        k: SPIDER.rimK * (1 - d / reach) ** 1.2,
      });
    }
    rims.sort((a, c) => c.k - a.k);
    rims.length = Math.min(rims.length, 2);
    // Her own light finds it when she is close (the dark never quite hides it from her).
    const p = sim.player;
    const pd = Math.hypot(p.cx - ex, p.cy - ey);
    if (pd < 420 && pd > 1)
      rims.push({
        dx: (p.cx - ex) / pd,
        dy: (p.cy - ey) / pd,
        color: SPIDER.rimWick,
        k: 0.5 * (1 - pd / 420),
      });
    const pose = P;
    pose.tell = tell;
    pose.flip = 0;
    pose.walk = 0;
    pose.rot = 0;
    pose.spread = 0.6;
    pose.dark = 0;
    pose.ink = 1;
    const m = e.mode;
    const heading = (hx: number, hy: number): number => Math.atan2(-hx, hy);
    if (b.phase === 1 && (m === 'hunt' || m === 'sit')) {
      // On its orb in the dark: upright on the web (head toward the hub), walking.
      pose.walk = Math.hypot(e.vx, e.vy) > 0.2 ? clock * 10 : 0;
      pose.rot = Math.atan2(-((b as { ux?: number }).ux ?? 0), (b as { uy?: number }).uy ?? 1);
      pose.spread = 0.85;
    } else if (m === 'windup' && b.tell === 'lunge') {
      // Rearing at her: head toward where it will land, legs thrown wide, a shiver.
      pose.rot = heading(b.pivotX - ex, b.pivotY - ey) + Math.sin(clock * 40) * 0.04 * tell;
      pose.spread = 0.7 + 0.3 * tell;
    } else if (m === 'dive' && !b.thread) {
      // The lunge: a run down the line, legs thrown forward.
      pose.rot = heading(b.pivotX - ex, b.pivotY - ey);
      pose.spread = 1;
      pose.walk = clock * 30;
      for (let k = 1; k <= 3; k++) {
        const hx = Math.sin(pose.rot);
        const hy = -Math.cos(pose.rot);
        front
          .moveTo(ex + hx * s * (0.6 + k * 0.5) - k * 6, ey + hy * s * (0.6 + k * 0.5))
          .lineTo(ex + hx * s * (1.4 + k * 0.7) - k * 6, ey + hy * s * (1.4 + k * 0.7));
      }
      front.stroke({ color: SPIDER.silk, width: 1.2, alpha: 0.3 });
    } else if (m === 'stall' && !b.thread) {
      // Crouched where it landed, gathering itself.
      pose.spread = 0.5 + 0.05 * Math.sin(clock * 5);
    } else if (m === 'recover' && b.thread) {
      // Winded on its thread: hanging limp and open (the window).
      pose.spread = 0.75 + 0.05 * Math.sin(clock * 3);
      pose.rot = Math.sin(clock * 1.4) * 0.12;
      pose.ink = 0.4;
    } else if (m === 'recover') {
      pose.flip = 1;
      pose.walk = clock * 12;
      pose.ink = 0.3;
    } else if (m === 'fall') {
      pose.spread = 1;
      pose.rot = Math.sin(clock * 6) * 0.6;
    } else if (m === 'dive' || m === 'swing') {
      pose.spread = 0.9;
      pose.rot = b.thread ? Math.atan2(ex - b.pivotX, e.y - b.pivotY) * -0.8 : 0;
    } else if (m === 'perch') {
      // Wrapped round the Gloam lamp at the hub: legs gathered round it.
      pose.spread = 0.3;
    } else if (m === 'climb') pose.walk = clock * 12;
    spider(g, glow, ex, ey, s, pose, 0, clock, 7, rims, SPIDER.greatEye, SPIDER.greatEyeGlow);
    // Exposed: open, a pale glow on its belly so the window reads; the moon's light on it.
    if (m === 'recover') glow.add(ex, ey, s * 1.6, SPIDER.open, 0.18 + 0.06 * Math.sin(clock * 6));
    // Sealed doors: sheets of old silk.
    if (b.locked) {
      for (const d of spec.lock) {
        for (let k = 0; k < Math.max(6, d.w / 6); k++) {
          const x = d.x + (k * d.w) / Math.max(6, d.w / 6);
          g.moveTo(x, d.y).lineTo(x + Math.sin(clock + k) * 3, d.y + d.h);
        }
        g.stroke({ color: SPIDER.silk, width: 1, alpha: 0.45 });
        g.rect(d.x, d.y, d.w, d.h).fill({ color: SPIDER.silk, alpha: 0.12 });
      }
    }
  }
}
