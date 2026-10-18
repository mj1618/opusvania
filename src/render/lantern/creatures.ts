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
}

const P: Pose = { spread: 0, rot: 0, walk: 0, flip: 0, tell: 0, dark: 0 };

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
): void {
  const cs = Math.cos(pose.rot);
  const sn = Math.sin(pose.rot);
  // Local frame: +v down along the body (head end), +u across.
  const at = (u: number, v: number): [number, number] => [x + u * cs - v * sn, y + u * sn + v * cs];
  const dark = pose.dark;
  const alpha = 1 - dark * 0.8;
  const body = mix(SPIDER.body, SPIDER.open, pose.flip * 0.55 + pale);
  const leg = mix(SPIDER.leg, SPIDER.open, pose.flip * 0.35 + pale * 0.8);
  // Legs: four a side, from the cephalothorax, each a knee and a foot.
  const cy = s * 0.95;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const base = at(side * s * 0.25, cy - s * 0.25 + i * s * 0.17);
      const fan = (i - 1.5) * 0.42;
      const step = pose.walk ? Math.sin(pose.walk + i * 1.7 + (side > 0 ? 0 : Math.PI)) * 0.25 : 0;
      const curl = pose.flip;
      // Gathered: knees up over the body, feet tucked in; splayed: reaching out and down.
      const reach = s * (1.25 + 0.9 * pose.spread) * (1 - 0.35 * curl);
      const ka = side * (1.1 + 0.4 * pose.spread) + fan * 0.6 + step;
      const knee = at(
        side * reach * Math.abs(Math.sin(ka)) * 0.9,
        cy + reach * -Math.cos(ka) * 0.8 - s * 0.6 * (1 - pose.spread) - curl * s * 0.8,
      );
      const foot = at(
        side * reach * (0.7 + 0.6 * pose.spread) * (1 - 0.5 * curl),
        cy + reach * (0.35 + 0.4 * pose.spread + fan * 0.5) * (1 - 2 * curl) + step * s,
      );
      g.moveTo(base[0], base[1]).lineTo(knee[0], knee[1]).lineTo(foot[0], foot[1]);
    }
  }
  g.stroke({ color: leg, width: Math.max(1.2, s * 0.13), alpha, join: 'round', cap: 'round' });
  // The light catching the upper leg segments (the lamp's glint on them, even in the dark).
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i += 2) {
      const base = at(side * s * 0.25, cy - s * 0.25 + i * s * 0.17);
      const reach = s * (1.25 + 0.9 * pose.spread);
      const ka = side * (1.1 + 0.4 * pose.spread);
      const knee = at(
        side * reach * Math.abs(Math.sin(ka)) * 0.9,
        cy + reach * -Math.cos(ka) * 0.8 - s * 0.6 * (1 - pose.spread),
      );
      g.moveTo(base[0], base[1]).lineTo(knee[0], knee[1]);
    }
  }
  g.stroke({ color: SPIDER.legLit, width: Math.max(0.8, s * 0.05), alpha: 0.6 * (1 - dark * 0.6) });
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
  // Eyes: a little cluster at the head end; they kindle with the tell (the hunt colour) and always glint.
  const eyeC = pose.tell > 0 ? mix(SPIDER.eye, SPIDER.hunt, Math.min(1, pose.tell * 1.5)) : SPIDER.eye;
  for (let k = 0; k < 4; k++) {
    const e = at((k - 1.5) * s * 0.16, cy + s * 0.32 + (k === 0 || k === 3 ? -s * 0.06 : 0));
    g.circle(e[0], e[1], Math.max(1, s * 0.07)).fill({ color: eyeC, alpha: 0.95 });
  }
  const eyes = at(0, cy + s * 0.3);
  const glint = 0.12 + 0.5 * pose.tell + 0.45 * dark + 0.06 * Math.sin(clock * 3 + seed);
  glow.add(
    eyes[0],
    eyes[1],
    s * (0.5 + pose.tell * 0.8 + dark * 0.3),
    pose.tell > 0 ? SPIDER.hunt : SPIDER.eye,
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

  /** The Gloamweaver: body, thread, its tells; P1's dark shield; exposed, pale and belly-up. */
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
    // The thread from its pivot (P2) or from the hub (climbing back).
    if (b.thread) {
      g.moveTo(b.pivotX, b.pivotY).lineTo(ex, e.y);
      g.stroke({ color: SPIDER.silk, width: 2.4, alpha: 0.6 });
    }
    // P2's tell: the arc it will swing, in glinting silk, and the floor it sweeps, a faint ember wash.
    const W = tuning.weaverBoss;
    let tell = 0;
    if (b.tell === 'swing' || b.tell === 'drop' || b.tell === 'lunge') {
      const of =
        b.tell === 'swing' ? W.tellFrames + W.dropFrames : b.tell === 'lunge' ? W.lungeTell : W.dropTell;
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
      const x0 = b.tellX0;
      const x1 = b.tellX1;
      for (let k = 0; k < 6; k++) {
        const x = x0 + ((x1 - x0) * (k + 0.5)) / 6;
        glow.add(x, floor - 6, (x1 - x0) / 6, SPIDER.hunt, 0.05 + 0.14 * tell, 16);
      }
    }
    const pose = P;
    pose.tell = tell;
    pose.flip = 0;
    pose.walk = 0;
    pose.rot = 0;
    pose.spread = 0.6;
    pose.dark = 0;
    const m = e.mode;
    if (b.phase === 1 && (m === 'hunt' || m === 'sit')) {
      // On its orb in the dark: upright on the web (head toward the hub), walking, shielded.
      pose.dark = 1;
      pose.walk = Math.hypot(e.vx, e.vy) > 0.2 ? clock * 10 : 0;
      pose.rot = Math.atan2(-((b as { ux?: number }).ux ?? 0), (b as { uy?: number }).uy ?? 1);
      pose.spread = 0.85;
    } else if (m === 'recover' && b.thread) {
      // Winded on its thread: hanging limp and open (the window).
      pose.spread = 0.75 + 0.05 * Math.sin(clock * 3);
      pose.rot = Math.sin(clock * 1.4) * 0.12;
    } else if (m === 'recover') {
      pose.flip = 1;
      pose.walk = clock * 12;
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
    spider(g, glow, ex, ey, s, pose, 0, clock, 7);
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
