/**
 * Lanternroot's level kit, painted (memory/level-kit.md for the rules, memory/lanternroot-art.md for the look):
 *
 *   bark        a plug of rotten bark: fibrous plates, a fungus skin on top, one more crack per cut taken, a shake
 *               and chips on every cut; floor panels lie flat. Heartwood is dense, dark, close-ringed, with fresh
 *               ram scars and splinters at beetle height (an honest tell that something else must break it).
 *   thorns      brambles: dark woody canes weaving through the rect, pale thorn tips catching the light
 *   gates       a silk curtain (tall) or a root-silk seal (flat) that sways; open, it falls away and is gone
 *   covers      a mass of near-black roots in front of a hidden space (`marks.covers`); it thins while she is
 *               inside and is gone once the bark it hides behind breaks (`opens`)
 *   signs       a half-buried firefly stone: a carved firefly and its phrase, which it flashes now and then
 *               while she is near (the deep secret's phrase can be learned by eye: proto-1 §5)
 *   bells       the answering cap: a pale bell-cap whose gill rings light one per counted strike
 *   hollows     a shaft of moonlight in the hidden place, a token in it until taken
 *   patches     a small pool of real moonlight on the ground, motes rising; brighter once she rests there
 *   glades      a tall column of moonlight (an ability), hidden until its flag
 *   doors, moth-stones, bounce caps, seed-cases, shortcuts
 *   moonmoss    faint lichen scars while cold; lit by a burning moonwick, pale silver ledges with a lit lip
 *
 * Render only: reads the scene, `sim.kit`, `sim.save`, `sim.rest`, `sim.light`, events.
 */
import type { Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import { tuning } from '../../sim/tuning';
import type { CameraView, SimView } from '../contract';
import { mix, wind } from '../scene/lib/look';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import type { GlowPool } from './glow';

/** Colours and knobs. */
export const KIT = {
  bark: {
    body: 0x2a1a10,
    plate: 0x4a3222,
    plateLit: 0x7a5636,
    crack: 0x080504,
    skin: 0x5a4a30,
    skinLit: 0xa08a5a,
  },
  heart: { body: 0x2c1410, ring: 0x401c14, ringLit: 0x6a3020, scar: 0xc8a888, sheen: 0x9a5a40 },
  thorn: { cane: 0x1a0e12, caneLit: 0x4a2a2a, tip: 0xe0d0c0 },
  silk: { strand: 0xd8dce6, sheen: 0xf2f4ff },
  cover: { body: 0x040302, root: 0x120c08, edge: 0x2a1c12 },
  sign: { stone: 0x26262c, stoneLit: 0x5a5c68, carve: 0x0c0c10, flash: 0xffc070, glyph: 0x9fd8e0 },
  bell: {
    cap: 0xd8ceb8,
    capShade: 0x8a8070,
    gill: 0x5a5040,
    ring: 0xffcf80,
    dull: 0x8a8a8a,
    stalk: 0xb8ae98,
  },
  moon: { beam: 0xb8d0f0, pool: 0xdce8ff, mote: 0xe8f0ff },
  moss: { scar: 0x8aa8a0, lit: 0xa8d8cc, body: 0x24403c, glow: 0x88c8c0 },
  /** The Downwood's great lamp seen from above (`glow` marks) and the Split Oak's lightning seam (`scar`). */
  great: { wash: 0xff9a40, core: 0xffd890 },
  scar: { char: 0x0a0605, burn: 0x3a2418, seam: 0xdfe8ff, light: 0xb8d0f0 },
  /** The Downwood's moonseeds and the sockets of the doors that count them. */
  seed: { body: 0xf2ecd8, wing: 0xc8d8f0, glow: 0xdfe8ff, rim: 0x8a8070 },
  cap: { top: 0x6a4a6a, topLit: 0xb08ab0, gill: 0x2a1a2a, stalk: 0x8a7a70 },
  /** Seconds a gate takes to fall away, a cover to thin, a cut's shake. */
  gateFall: 0.8,
  coverEase: 3,
  shake: 0.25,
} as const;

interface Hit {
  t: number;
  dir: number;
}

export class Kit {
  /** Bark shaking from a cut (by index). */
  private readonly hits = new Map<number, Hit>();
  /** Gates opening while she watches (seconds since, by index). */
  private readonly opening = new Map<number, number>();
  /** Covers: how visible each is now (eased). */
  private readonly coverK: number[] = [];
  /** Moonmoss: how lit each piece is now (eased). */
  private readonly mossK: number[] = [];
  /** Bells: a pulse per strike (seconds since), dull flashes, the answer. */
  private readonly bellT = new Map<number, { t: number; kind: 'hit' | 'dull' | 'answer' }>();
  /** Signs being read: seconds since. */
  private readonly readT = new Map<number, number>();
  /** Caps squashed by a bounce (seconds since). */
  private readonly capT = new Map<number, number>();

  onEvents(events: readonly SimEvent[], sim: SimView): void {
    const S = sim.scene;
    for (const e of events) {
      const ev = e as unknown as { type: string; id?: string; dir?: string };
      if (e.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) {
        this.hits.clear();
        this.opening.clear();
        this.bellT.clear();
        this.readT.clear();
        continue;
      }
      switch (ev.type) {
        case 'barkHit': {
          const i = (S.bark ?? []).findIndex((b) => b.id === ev.id);
          if (i >= 0) this.hits.set(i, { t: 0, dir: ev.dir === 'fwd' ? sim.player.facing : 0 });
          break;
        }
        case 'kitClang': {
          const i = (S.bark ?? []).findIndex((b) => b.id === ev.id);
          if (i >= 0) this.hits.set(i, { t: 0.12, dir: sim.player.facing });
          break;
        }
        case 'gateOpen': {
          const i = (S.gates ?? []).findIndex((g) => g.id === ev.id);
          if (i >= 0) this.opening.set(i, 0);
          break;
        }
        case 'bellHit':
        case 'bellDull':
        case 'bellAnswer': {
          const bells = (S as { bells?: Array<{ id: string }> }).bells ?? [];
          const i = bells.findIndex((b) => b.id === ev.id);
          if (i >= 0)
            this.bellT.set(i, {
              t: 0,
              kind: ev.type === 'bellHit' ? 'hit' : ev.type === 'bellDull' ? 'dull' : 'answer',
            });
          break;
        }
        case 'signRead': {
          const i = (S.signs ?? []).findIndex((s) => s.id === ev.id);
          if (i >= 0) this.readT.set(i, 0);
          break;
        }
        case 'capBounce': {
          const i = (S.caps ?? []).findIndex((c) => c.id === ev.id);
          if (i >= 0) this.capT.set(i, 0);
          break;
        }
      }
    }
  }

  /** Behind her: bark, thorns, gates, signs, bells, patches, hollows, doors, stones, caps, moss. Over her: covers. */
  draw(
    dt: number,
    clock: number,
    sim: SimView,
    cam: CameraView,
    back: Graphics,
    front: Graphics,
    glow: GlowPool,
    glowFront: GlowPool,
  ): void {
    const S = sim.scene;
    const room = S.id;
    const hw = cam.w / 2 / cam.zoom + 200;
    const hh = cam.h / 2 / cam.zoom + 200;
    const seen = (x: number, y: number, w = 0, h = 0): boolean =>
      x + w > cam.x - hw && x < cam.x + hw && y + h > cam.y - hh && y < cam.y + hh;
    for (const [k, h] of this.hits) {
      h.t += dt;
      if (h.t > KIT.shake + 0.2) this.hits.delete(k);
    }
    for (const [k, t] of this.opening) this.opening.set(k, t + dt);
    for (const [k, b] of this.bellT) {
      b.t += dt;
      if (b.t > 3) this.bellT.delete(k);
    }
    for (const [k, t] of this.readT) this.readT.set(k, t + dt);
    for (const [k, t] of this.capT) {
      if (t > 0.6) this.capT.delete(k);
      else this.capT.set(k, t + dt);
    }

    // Moon patches and glades first (the light lies behind everything else of the kit).
    (S.patches ?? []).forEach((p, i) => {
      if (!seen(p.x - 100, p.y - 400, 200, 420)) return;
      const rested = sim.rest.at === i && sim.rest.done;
      const mine = sim.save.patch?.room === room && sim.save.patch?.id === p.id;
      this.moonPool(back, glow, p.x, p.y, 1 + (mine ? 0.25 : 0) + (rested ? 0.35 : 0), clock, i);
    });
    for (const gl of S.glades ?? []) {
      const open = !gl.when || sim.save.flags.includes(gl.when);
      if (!open || !seen(gl.x, gl.y - 300, gl.w, gl.h + 300)) continue;
      const taken = sim.save.taken.includes(`${room}:${gl.id}`);
      this.moonPool(back, glow, gl.x + gl.w / 2, gl.y + gl.h, taken ? 0.6 : 2.2, clock, 7, gl.w);
    }

    // Hollows: a shaft of moonlight in the hidden place, its token hanging in it until taken.
    for (const h of S.hollows ?? []) {
      if (!seen(h.x, h.y, h.w, h.h)) continue;
      const taken = sim.save.flags.includes(`upgrade:${h.upgrade}`);
      const cx = h.x + h.w / 2;
      glow.add(cx, h.y + h.h * 0.45, h.w * 0.55, KIT.moon.beam, taken ? 0.12 : 0.3, h.h * 0.7);
      glow.add(cx, h.y + h.h - 6, h.w * 0.6, KIT.moon.pool, taken ? 0.1 : 0.25, 16);
      if (!taken) {
        const bob = Math.sin(clock * 1.6) * 4;
        glow.add(cx, h.y + h.h * 0.5 + bob, 26, KIT.moon.mote, 0.55);
        back.poly(diamond(cx, h.y + h.h * 0.5 + bob, 6, 10)).fill({ color: 0xf4f8ff, alpha: 0.95 });
      }
      motes(back, cx, h.y + h.h, h.w * 0.4, h.h, clock, taken ? 3 : 7, KIT.moon.mote, 0.6);
    }

    // Doors: a knot-hole in the wood, dark inside, its lip lit.
    for (const d of S.doors ?? []) {
      if (!seen(d.x - 60, d.y - 150, 120, 150)) continue;
      back.ellipse(d.x, d.y - 62, 40, 64).fill(0x0a0706);
      back.ellipse(d.x, d.y - 58, 32, 56).fill(0x020101);
      back.ellipse(d.x, d.y - 62, 40, 64).stroke({ color: 0x5a4028, width: 3, alpha: 0.6 });
    }

    // Moth-stones: a standing stone, moth wings carved on its face.
    for (const m of S.mothStones ?? []) {
      if (!seen(m.x - 60, m.y - 140, 120, 140)) continue;
      const read = sim.save.taken.includes(`${room}:${m.id}`);
      back.poly(stone(m.x, m.y, 38, 110, hash01(m.id, 1))).fill(KIT.sign.stone);
      back
        .poly(stone(m.x + 4, m.y - 4, 28, 100, hash01(m.id, 2)))
        .fill({ color: KIT.sign.stoneLit, alpha: 0.35 });
      wings(back, m.x, m.y - 64, 16, KIT.sign.carve, 0.9);
      if (read) glow.add(m.x, m.y - 64, 40, KIT.moon.beam, 0.2 + 0.05 * Math.sin(clock * 1.3));
    }

    // Firefly signs: a slab half sunk in the ground, a firefly carved on it, and its phrase.
    (S.signs ?? []).forEach((s, i) => {
      if (!seen(s.x - 80, s.y - 120, 160, 120)) return;
      const r = hash01(s.id, 3);
      back.poly(stone(s.x, s.y + 4, 46, 70, r)).fill(KIT.sign.stone);
      back.poly(stone(s.x + 3, s.y, 36, 62, r + 0.3)).fill({ color: KIT.sign.stoneLit, alpha: 0.28 });
      back.poly(stone(s.x, s.y + 4, 46, 70, r)).stroke({ color: KIT.sign.stoneLit, width: 1.5, alpha: 0.5 });
      // Its carvings hold a faint glow of their own (pale lichen in the cuts): found in the dark, not shouted.
      glow.add(s.x, s.y - 34, 30, KIT.sign.glyph, 0.12 + 0.04 * Math.sin(clock * 0.9 + i));
      // The firefly: a body, two wings, a lit tail.
      const fx = s.x;
      const fy = s.y - 44;
      back.ellipse(fx, fy, 3, 9).fill(KIT.sign.carve);
      back.ellipse(fx - 7, fy - 4, 7, 3.5).fill(KIT.sign.carve);
      back.ellipse(fx + 7, fy - 4, 7, 3.5).fill(KIT.sign.carve);
      // The phrase as carved marks under it: dots for short gaps, bars for long.
      const rhythm = s.rhythm ?? '';
      const n = rhythm.length;
      for (let k = 0; k < n; k++) {
        const mx = s.x + (k - (n - 1) / 2) * 11;
        if (rhythm[k] === '-') back.roundRect(mx - 4, s.y - 22, 8, 3, 1.5).fill(KIT.sign.carve);
        else back.circle(mx, s.y - 20.5, 1.8).fill(KIT.sign.carve);
      }
      // It flashes its phrase while she is near: the tail lights for each beat (short / long), a pause, again.
      const near = Math.hypot(sim.player.cx - s.x, sim.player.cy - s.y) < 520;
      const read = this.readT.get(i);
      if (near || read !== undefined) {
        // (On the sim's clock, so the sound's chimes keep time: audio/route-lr.ts `signNotes`.)
        const on = phraseLit(rhythm, sim.frame / 60 + i * 1.7);
        glow.add(fx, fy + 8, 14 + 12 * on, KIT.sign.flash, 0.15 + 0.7 * on);
        back.circle(fx, fy + 8, 3).fill({ color: mix(KIT.sign.carve, KIT.sign.flash, on), alpha: 1 });
      }
    });

    // Bells: the answering cap. Its gill rings light, one per counted strike.
    const bells = (S as { bells?: Array<{ id: string; x: number; y: number; rhythm: string }> }).bells ?? [];
    bells.forEach((b, i) => {
      if (!seen(b.x - 80, b.y - 80, 160, 240)) return;
      const n = sim.light?.bells?.[i]?.n ?? 0;
      const of = Math.max(1, b.rhythm.length + 1);
      const pulse = this.bellT.get(i);
      const answered = sim.save.flags.includes((b as { sets?: string }).sets ?? '\u0000');
      this.bell(back, glow, b.x, b.y, n, of, pulse, answered, clock, S);
    });

    // Bounce caps: a mushroom cap over its rect, the stalk under it; a bounce squashes it.
    (S.caps ?? []).forEach((c, i) => {
      if (!seen(c.x, c.y, c.w, c.h + 200)) return;
      const t = this.capT.get(i);
      const sq = t === undefined ? 0 : Math.sin(Math.min(1, t / 0.5) * Math.PI) * Math.exp(-t * 4);
      const cx = c.x + c.w / 2;
      const top = c.y + sq * 6;
      back.roundRect(cx - c.w * 0.12, c.y + c.h * 0.5, c.w * 0.24, 140, 6).fill(KIT.cap.stalk);
      back.ellipse(cx, c.y + c.h * 0.7, c.w * 0.5 * (1 + sq * 0.15), c.h * 0.4).fill(KIT.cap.gill);
      back
        .ellipse(cx, top + c.h * 0.45, c.w * 0.55 * (1 + sq * 0.15), c.h * 0.55 * (1 - sq * 0.3))
        .fill(KIT.cap.top);
      back
        .ellipse(cx + c.w * 0.1, top + c.h * 0.3, c.w * 0.3, c.h * 0.22)
        .fill({ color: KIT.cap.topLit, alpha: 0.5 });
      glow.add(cx, top + c.h * 0.4, c.w * 0.7, KIT.cap.topLit, 0.08);
    });

    // Seed-cases: a hard ridged seed.
    for (const s of S.seedCases ?? []) {
      if (!seen(s.x - 30, s.y - 30, 60, 60)) continue;
      back.ellipse(s.x, s.y, 20, 24).fill(0x2a2420);
      for (let k = -2; k <= 2; k++)
        back.moveTo(s.x + k * 6, s.y - 22).quadraticCurveTo(s.x + k * 9, s.y, s.x + k * 6, s.y + 22);
      back.stroke({ color: 0x5a4a3a, width: 1.4, alpha: 0.7 });
    }

    // Bark: rotten plugs and panels; heartwood.
    (S.bark ?? []).forEach((b, i) => {
      const left = sim.kit.bark[i] ?? 0;
      if (left <= 0 || !seen(b.x, b.y, b.w, b.h)) return;
      const hit = this.hits.get(i);
      const shake = hit ? Math.max(0, 1 - hit.t / KIT.shake) : 0;
      const ox = shake * Math.sin(hit ? hit.t * 90 : 0) * 3 * (hit?.dir || 1);
      const max = (b as { hp?: number }).hp ?? 3;
      if ((b as { heartwood?: boolean }).heartwood) this.heartwood(back, b.x + ox * 0.4, b.y, b.w, b.h, b.id);
      else this.bark(back, b.x + ox, b.y, b.w, b.h, b.floor === true, max - left, b.id);
    });

    // Shortcuts (closed): a plug like bark, the side that opens a shade lighter.
    for (const sc of S.shortcuts ?? []) {
      if (sim.save.opened.includes(`${room}:${sc.id}`) || !seen(sc.x, sc.y, sc.w, sc.h)) continue;
      this.bark(back, sc.x, sc.y, sc.w, sc.h, sc.w > sc.h * 1.5, 0, sc.id);
    }

    // Thorns: brambles.
    for (const t of S.thorns ?? []) {
      if (!seen(t.x, t.y, t.w, t.h)) continue;
      this.bramble(back, t.x, t.y, t.w, t.h, t.id, clock);
    }

    // Gates: silk curtains and seals; open, they fall away.
    (S.gates ?? []).forEach((g, i) => {
      const open = (sim.kit.gates[i] ?? 0) > 0;
      const t = this.opening.get(i);
      if (open && (t === undefined || t > KIT.gateFall)) return;
      if (!seen(g.x, g.y, g.w, g.h)) return;
      const fall = open && t !== undefined ? t / KIT.gateFall : 0;
      if (g.h >= g.w) this.curtain(back, glow, g.x, g.y, g.w, g.h, clock, fall, g.id);
      else this.seal(back, g.x, g.y, g.w, g.h, clock, fall, g.id);
      // A door that counts moonseeds (the Downwood): its sockets in a row over it, one lit for each seed held.
      if (g.flag.startsWith('seeds:') && !open) {
        const want = Number(g.flag.slice(6));
        const held = seedsHeld(sim.save.flags);
        for (let k = 0; k < want; k++) {
          const sx = g.x + g.w / 2 + (k - (want - 1) / 2) * 34;
          const sy = g.y - 18;
          back.circle(sx, sy, 11).fill(0x0c0a10);
          back.circle(sx, sy, 11).stroke({ color: KIT.seed.rim, width: 2, alpha: 0.8 });
          if (k < held) {
            back.ellipse(sx, sy, 5, 7).fill(KIT.seed.body);
            glow.add(sx, sy, 26, KIT.seed.glow, 0.5 + 0.1 * Math.sin(clock * 2 + k));
          }
        }
      }
    });

    // The Downwood's marks: the great lamp's warm glow rising through a grate or a shaft (`glow`), and the lightning
    // split down the Split Oak (`scar`): a jagged seam of moonlight with a charred lip.
    for (const l of S.marks?.landmarks ?? []) {
      if (l.kind === 'glow') {
        if (!seen(l.x - 600, l.y - 600, 1200, 1200)) continue;
        const b = 0.9 + 0.1 * Math.sin(clock * 0.7);
        glow.add(l.x, l.y, 560, KIT.great.wash, 0.34 * b, 380);
        glow.add(l.x, l.y + 40, 260, KIT.great.core, 0.42 * b, 140);
        motes(back, l.x, l.y + 80, 260, 520, clock, 10, KIT.great.core, 0.7);
      } else if (l.kind === 'scar') {
        const h = (l.h ?? 1800) as number;
        if (!seen(l.x - 300, l.y, 600, h)) continue;
        const pts: number[] = [];
        for (let k = 0, y = l.y; y <= l.y + h; k++, y += 70)
          pts.push(l.x + (hash01(`scar${k}`, 5) - 0.5) * 90, y);
        back.poly(pts, false).stroke({ color: KIT.scar.char, width: 34, alpha: 0.85 });
        back.poly(pts, false).stroke({ color: KIT.scar.burn, width: 12, alpha: 0.7 });
        back.poly(pts, false).stroke({ color: KIT.scar.seam, width: 3, alpha: 0.55 });
        for (let i = 0; i + 1 < pts.length; i += 2)
          glow.add(
            pts[i] as number,
            pts[i + 1] as number,
            70,
            KIT.scar.light,
            0.12 + 0.05 * Math.sin(clock * 1.1 + i),
          );
      }
    }

    // Moonseeds (the Downwood's keys): a pale seed with a silver wing, bobbing in its own light until taken.
    for (const sd of S.moonseeds ?? []) {
      if (!seen(sd.x - 60, sd.y - 60, 120, 120)) continue;
      if (sim.save.taken.includes(`${room}:${sd.id}`)) continue;
      const bob = Math.sin(clock * 1.4 + sd.x * 0.01) * 6;
      const y = sd.y + bob;
      glow.add(sd.x, y, 70, KIT.seed.glow, 0.42 + 0.08 * Math.sin(clock * 2.3));
      glow.add(sd.x, y, 22, KIT.moon.mote, 0.6);
      const tilt = Math.sin(clock * 0.9) * 0.25;
      back.ellipse(sd.x - 10 + tilt * 8, y - 8, 14, 5).fill({ color: KIT.seed.wing, alpha: 0.8 });
      back.ellipse(sd.x, y, 7, 10).fill(KIT.seed.body);
      back.ellipse(sd.x - 2, y - 3, 3, 4).fill({ color: 0xffffff, alpha: 0.85 });
      motes(back, sd.x, y + 30, 50, 80, clock, 4, KIT.moon.mote, 0.5);
    }

    // Moonmoss: lichen scars cold; pale lit ledges near a burning moonwick.
    const moss =
      (S as { moonmoss?: Array<{ id: string; x: number; y: number; w: number; h: number }> }).moonmoss ?? [];
    moss.forEach((m, i) => {
      const on = (sim.light?.moss?.[i] ?? 0) > 0 ? 1 : 0;
      const k0 = this.mossK[i] ?? on;
      const k = k0 + (on - k0) * Math.min(1, dt * 8);
      this.mossK[i] = k;
      if (!seen(m.x, m.y, m.w, m.h)) return;
      this.moss(back, glow, m.x, m.y, m.w, m.h, k, clock, m.id);
    });

    // Covers: the root mass in front of a hidden space (over her).
    const covers =
      (
        S.marks as
          | { covers?: Array<{ id: string; x: number; y: number; w: number; h: number; opens?: string }> }
          | undefined
      )?.covers ?? [];
    covers.forEach((c, i) => {
      const p = sim.player;
      const inside = p.cx > c.x && p.cx < c.x + c.w && p.cy > c.y && p.cy < c.y + c.h;
      // `opens` names what lifts it for good: broken bark / an opened shortcut (`save.opened`), a find taken or a
      // hollow's upgrade had (`h2`), or a story flag (`vault-open`).
      const key = c.opens ? (c.opens.includes(':') ? c.opens : `${room}:${c.opens}`) : '';
      const bare = key.slice(key.indexOf(':') + 1);
      const hollow = (S.hollows ?? []).find((h) => `${room}:${h.id}` === key);
      const opened =
        key !== '' &&
        (sim.save.opened.includes(key) ||
          sim.save.taken.includes(key) ||
          sim.save.flags.includes(bare) ||
          (hollow !== undefined && sim.save.flags.includes(`upgrade:${hollow.upgrade}`)));
      const want = opened ? 0 : inside ? 0.12 : 1;
      const k0 = this.coverK[i] ?? want;
      const k = k0 + (want - k0) * Math.min(1, dt * KIT.coverEase);
      this.coverK[i] = k;
      if (k < 0.01 || !seen(c.x, c.y, c.w, c.h)) return;
      this.cover(front, c.x, c.y, c.w, c.h, k, c.id, clock);
    });
    void glowFront;
  }

  // --- painters ---------------------------------------------------------------------------------

  private moonPool(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    k: number,
    clock: number,
    seed: number,
    w = 90,
  ): void {
    const breathe = 0.9 + 0.1 * Math.sin(clock * 0.8 + seed);
    glow.add(x, y - 170, w * 0.6, KIT.moon.beam, 0.16 * k * breathe, 230);
    glow.add(x, y - 4, w * 0.75, KIT.moon.pool, 0.3 * k * breathe, 14);
    g.ellipse(x, y - 1, w * 0.42, 4).fill({ color: KIT.moon.pool, alpha: 0.22 * k });
    motes(g, x, y, w * 0.35, 260, clock, Math.round(4 + 3 * k), KIT.moon.mote, 0.55 * Math.min(1.4, k));
  }

  private bark(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    floor: boolean,
    cracks: number,
    id: string,
  ): void {
    const B = KIT.bark;
    g.poly(ragged(x, y, w, h, id, 4)).fill(B.body);
    // Fibrous plates: vertical on a wall plug, along it on a floor panel.
    const n = floor ? Math.max(2, Math.round(h / 14)) : Math.max(2, Math.round(w / 12));
    for (let k = 0; k < n; k++) {
      const r = hash01(id, k + 10);
      const lit = r > 0.6;
      if (floor) {
        const yy = y + 4 + ((h - 8) * (k + 0.5)) / n;
        g.poly([
          x + 4 + r * 10,
          yy - 2.5,
          x + w - 6 - r * 8,
          yy - 1.5,
          x + w - 10,
          yy + 2.5,
          x + 8,
          yy + 2,
        ]).fill(lit ? B.plateLit : B.plate);
      } else {
        const xx = x + 4 + ((w - 8) * (k + 0.5)) / n;
        g.poly([xx - 3, y + 6 + r * 8, xx + 2.5, y + 4, xx + 3, y + h - 6, xx - 2, y + h - 3 - r * 10]).fill(
          lit ? B.plateLit : B.plate,
        );
      }
    }
    // A fungus skin along the top.
    g.poly(ragged(x - 2, y - 3, w + 4, 8, `${id}s`, 2)).fill(B.skin);
    g.rect(x + 2, y - 3, w - 4, 2).fill({ color: B.skinLit, alpha: 0.7 });
    // One crack per cut taken, spreading down (or along) the panel.
    for (let c = 0; c < cracks; c++) {
      const r = hash01(id, c + 40);
      const sx = floor ? x + w * (0.2 + 0.6 * r) : x + w * (0.3 + 0.4 * r);
      const sy = floor ? y + 2 : y + h * (0.15 + 0.25 * c);
      const pts: number[] = [sx, sy];
      let cx = sx;
      let cy = sy;
      for (let k = 0; k < 5; k++) {
        cx += floor ? (hash01(id, c * 9 + k) - 0.5) * 18 : (hash01(id, c * 9 + k) - 0.5) * 14;
        cy += floor ? h / 6 : h / 9;
        pts.push(cx, cy);
      }
      g.moveTo(pts[0] as number, pts[1] as number);
      for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k] as number, pts[k + 1] as number);
      g.stroke({ color: B.crack, width: 2.4, alpha: 0.9 });
      g.moveTo((pts[0] as number) + 1.5, pts[1] as number);
      for (let k = 2; k < pts.length; k += 2) g.lineTo((pts[k] as number) + 1.5, pts[k + 1] as number);
      g.stroke({ color: B.plateLit, width: 0.8, alpha: 0.5 });
    }
  }

  private heartwood(g: Graphics, x: number, y: number, w: number, h: number, id: string): void {
    const H = KIT.heart;
    g.poly(ragged(x, y, w, h, id, 2)).fill(H.body);
    // Close rings seen side on: tight curved grain lines across the panel (dense, old wood).
    for (let yy = y + 5; yy < y + h - 3; yy += 5 + hash01(id, Math.round(yy)) * 3) {
      const bow = (hash01(id, Math.round(yy) + 7) - 0.5) * 8;
      g.moveTo(x + 2, yy).quadraticCurveTo(x + w / 2, yy + bow, x + w - 2, yy + bow * 0.3);
    }
    g.stroke({ color: H.ring, width: 1.4, alpha: 0.6 });
    // A dull sheen down its upper face, like polished wood.
    g.rect(x + w * 0.62, y + 6, w * 0.12, h - 12).fill({ color: H.sheen, alpha: 0.18 });
    // Fresh ram scars at beetle height (24-60 px up its face) and splinters at its foot.
    for (let k = 0; k < 4; k++) {
      const yy = y + h - 26 - k * 9 - hash01(id, k) * 6;
      const xx = x + 3 + hash01(id, k + 5) * 6;
      g.moveTo(xx, yy).lineTo(xx + w * 0.4, yy - 6 - hash01(id, k + 9) * 6);
    }
    g.stroke({ color: H.scar, width: 1.6, alpha: 0.75 });
    for (let k = 0; k < 5; k++) {
      const sx = x - 14 + hash01(id, k + 20) * 22;
      g.poly([sx, y + h, sx + 6, y + h - 2, sx + 9, y + h - 1]).fill({ color: H.scar, alpha: 0.7 });
    }
  }

  private bramble(g: Graphics, x: number, y: number, w: number, h: number, id: string, clock: number): void {
    const T = KIT.thorn;
    // Canes arch out of the tangle's foot (and its sides when it is tall), cross and droop: never a lattice.
    const n = Math.max(4, Math.min(34, Math.round((w * h) / 2600)));
    for (let c = 0; c < n; c++) {
      const r1 = hash01(id, c * 3);
      const r2 = hash01(id, c * 3 + 1);
      const r3 = hash01(id, c * 3 + 2);
      const tall = h > w * 0.8;
      const fromSide = tall && r3 < 0.5;
      const sx = fromSide ? (r1 < 0.5 ? x : x + w) : x + r1 * w;
      const sy = fromSide ? y + h * (0.2 + 0.8 * r2) : y + h + 4;
      const dir = fromSide ? (sx === x ? 1 : -1) : r2 < 0.5 ? -1 : 1;
      const reachX = dir * (0.3 + 0.7 * r3) * Math.min(w, 220);
      const peakY = fromSide ? sy - (0.2 + 0.5 * r1) * h : y + (0.05 + 0.5 * r3) * h;
      const ex = Math.max(x - 10, Math.min(x + w + 10, sx + reachX));
      const ey = Math.min(y + h, peakY + (0.3 + 0.5 * r1) * h * 0.6);
      const sw = wind(sx, clock, r1) * 3;
      const cx1 = sx + reachX * 0.15;
      const cy1 = peakY - 10;
      const cx2 = sx + reachX * 0.75 + sw;
      const cy2 = peakY - 6 + sw;
      g.moveTo(sx, sy).bezierCurveTo(cx1, cy1, cx2, cy2, ex + sw, ey);
      const lit = c % 4 === 0;
      g.stroke({ color: lit ? T.caneLit : T.cane, width: 2.4 + r2 * 2.6, cap: 'round' });
      // Thorns along the cane: hooked, dark, the tips pale.
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        const it = 1 - t;
        const px = it * it * it * sx + 3 * it * it * t * cx1 + 3 * it * t * t * cx2 + t * t * t * (ex + sw);
        const py = it * it * it * sy + 3 * it * it * t * cy1 + 3 * it * t * t * cy2 + t * t * t * ey;
        const side = k % 2 === 0 ? -1 : 1;
        const len = 5 + hash01(id, c * 17 + k) * 5;
        const tx = px + side * len * 0.6 * dir;
        const ty = py - len * 0.8;
        g.poly([px - 2, py + 1, px + 2, py - 1, tx, ty]).fill(T.cane);
        g.circle(tx, ty, 0.9).fill({ color: T.tip, alpha: 0.75 });
        // Now and then a small dark leaf.
        if (hash01(id, c * 23 + k) < 0.12) g.ellipse(px + dir * 5, py + 3, 5, 2.4).fill(0x14100c);
      }
    }
  }

  private curtain(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    w: number,
    h: number,
    clock: number,
    fall: number,
    id: string,
  ): void {
    const C = KIT.silk;
    const a = 1 - fall;
    const n = Math.max(6, Math.round(w / 3));
    for (let k = 0; k < n; k++) {
      const r = hash01(id, k);
      const sx = x + (w * (k + 0.5)) / n;
      const len = h * (1 - fall * (0.4 + 0.6 * r));
      const drop = fall * fall * h * 0.6 * r;
      g.moveTo(sx, y + drop);
      for (let s = 1; s <= 8; s++) {
        const u = s / 8;
        g.lineTo(sx + wind(sx, clock, r) * 6 * u + Math.sin(u * 7 + r * 9) * 1.5, y + drop + len * u);
      }
      g.stroke({ color: C.strand, width: 1.1, alpha: (0.3 + 0.25 * r) * a });
    }
    // A sheen band that drifts down the silk, and the light the curtain holds.
    const sy = y + ((clock * 60) % h);
    g.rect(x, sy, w, 16).fill({ color: C.sheen, alpha: 0.08 * a });
    glow.add(x + w / 2, y + h / 2, w * 1.4, C.sheen, 0.05 * a, h * 0.55);
  }

  private seal(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    clock: number,
    fall: number,
    id: string,
  ): void {
    const a = 1 - fall;
    // Roots woven across, silk binding them.
    for (let k = 0; k < 5; k++) {
      const r = hash01(id, k);
      const yy = y + h * (0.2 + 0.6 * (k / 4)) + fall * fall * 120 * r;
      g.moveTo(x - 8, yy + Math.sin(r * 6) * 4).bezierCurveTo(
        x + w * 0.3,
        yy - 8,
        x + w * 0.7,
        yy + 8,
        x + w + 8,
        yy,
      );
      g.stroke({ color: 0x2a1c12, width: 6 + r * 4, alpha: a, cap: 'round' });
    }
    for (let k = 0; k < Math.round(w / 14); k++) {
      const xx = x + k * 14 + 7;
      g.moveTo(xx, y + fall * 60).lineTo(xx + wind(xx, clock, 0.3) * 3, y + h + fall * 80);
    }
    g.stroke({ color: KIT.silk.strand, width: 1, alpha: 0.45 * a });
  }

  private moss(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
    clock: number,
    id: string,
  ): void {
    const M = KIT.moss;
    // Cold: faint lichen scars along where the ledge would be (honest, easy to miss).
    const scar = 1 - k;
    if (scar > 0.02) {
      for (let s = 0; s < Math.round(w / 9); s++) {
        const r = hash01(id, s);
        const sx = x + 4 + r * (w - 8);
        g.ellipse(sx, y + 3 + hash01(id, s + 50) * Math.min(h, 10), 2 + r * 3, 1.2).fill({
          color: M.scar,
          alpha: 0.2 * scar,
        });
      }
    }
    if (k < 0.02) return;
    // Lit: a soft lichen shelf, its lip silver, a fringe hanging under it.
    g.poly(ragged(x, y, w, Math.max(10, h), id, 3)).fill({ color: M.body, alpha: 0.92 * k });
    // Lichen rosettes on its face, a few paler.
    for (let s2 = 0; s2 < Math.round(w / 14); s2++) {
      const r = hash01(id, s2 + 140);
      g.ellipse(
        x + 4 + r * (w - 8),
        y + 4 + hash01(id, s2 + 141) * Math.max(4, h - 6),
        3 + r * 4,
        2 + r * 2,
      ).fill({
        color: r < 0.4 ? M.lit : mix(M.body, M.lit, 0.45),
        alpha: 0.5 * k,
      });
    }
    g.poly(ragged(x - 1, y - 2, w + 2, 4, `${id}l`, 1.5)).fill({ color: M.lit, alpha: 0.9 * k });
    for (let s = 0; s < Math.round(w / 7); s++) {
      const r = hash01(id, s + 90);
      const fx = x + 3 + r * (w - 6);
      const len = 4 + 10 * hash01(id, s + 91);
      g.moveTo(fx, y + Math.max(10, h) - 2).lineTo(
        fx + wind(fx, clock, r) * 2,
        y + Math.max(10, h) + len * k,
      );
    }
    g.stroke({ color: M.lit, width: 1, alpha: 0.5 * k });
    glow.add(x + w / 2, y, w * 0.7, M.glow, 0.22 * k, 18);
  }

  private bell(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    n: number,
    of: number,
    pulse: { t: number; kind: 'hit' | 'dull' | 'answer' } | undefined,
    answered: boolean,
    clock: number,
    S: SimView['scene'],
  ): void {
    const B = KIT.bell;
    // The stalk down to whatever it grows from.
    let ground = y + 160;
    for (const s of S.solids) if (x >= s.x && x <= s.x + s.w && s.y > y && s.y < ground) ground = s.y;
    g.poly([x - 6, y + 14, x + 6, y + 14, x + 9, ground, x - 9, ground]).fill(B.stalk);
    // The bell: a tall pale cap, shaded on the side away from the moon.
    g.poly(bellCap(x, y, 34, 30)).fill(B.cap);
    g.poly(bellCap(x - 6, y + 2, 22, 26)).fill({ color: B.capShade, alpha: 0.35 });
    // Gill rings on its underside: one lit per counted strike; all, softly, once it has answered.
    const hitK = pulse && pulse.kind === 'hit' ? Math.max(0, 1 - pulse.t / 0.6) : 0;
    const dullK = pulse && pulse.kind === 'dull' ? Math.max(0, 1 - pulse.t / 0.4) : 0;
    const ans = answered ? 1 : pulse && pulse.kind === 'answer' ? Math.min(1, pulse.t / 0.5) : 0;
    for (let k = 0; k < of; k++) {
      const rr = 30 - k * (22 / of);
      const lit = ans > 0 || k < n ? 1 : 0;
      const last = k === n - 1 ? hitK : 0;
      g.moveTo(x - rr, y + 14 + k * 3).quadraticCurveTo(x, y + 20 + k * 3, x + rr, y + 14 + k * 3);
      g.stroke({ color: lit ? B.ring : B.gill, width: 2, alpha: lit ? 0.6 + 0.4 * last : 0.7 });
      if (lit) glow.add(x, y + 16 + k * 3, rr * 1.1, B.ring, 0.12 + 0.3 * last + 0.1 * ans, 8);
    }
    if (dullK > 0) glow.add(x, y, 40, B.dull, 0.3 * dullK);
    if (ans > 0) glow.add(x, y, 90, B.ring, 0.25 * ans * (0.85 + 0.15 * Math.sin(clock * 2)));
  }

  /**
   * A fallen limb over the hidden space: a rounded log body (its ends tapered and broken), bark plates running along
   * it with moonlit upper edges, moss on its back, the broken end showing its rings. It thins as she goes in.
   */
  private logCover(g: Graphics, x: number, y: number, w: number, h: number, k: number, id: string): void {
    const a = 0.97 * k;
    const top = y - 12;
    const bot = y + h + 6;
    const pts: number[] = [];
    // Its outline: a long rounded body, the west end running on out of the room, the east end broken off.
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const xx = x - 40 + (w + 40) * t;
      pts.push(xx, top + 8 * Math.sin(t * 9 + hash01(id, 1) * 6) - 10 * Math.sin(Math.PI * t));
    }
    for (let i = 0; i <= 10; i++) {
      // The broken end: jagged splinters.
      const t = i / 10;
      pts.push(x + w + 6 + (i % 2 ? -14 : 6) * hash01(id, 10 + i), top + (bot - top) * t);
    }
    for (let i = 24; i >= 0; i--) {
      const t = i / 24;
      pts.push(x - 40 + (w + 40) * t, bot + 6 * Math.sin(t * 7 + 2));
    }
    g.poly(pts).fill({ color: LOG.bark, alpha: a });
    // Bark plates along it, their upper edges catching the moon.
    for (let row = 0; row < 5; row++) {
      const yy = top + 18 + row * ((bot - top - 30) / 5);
      let xx = x - 30 + hash01(id, 20 + row) * 40;
      let n = 0;
      while (xx < x + w - 30) {
        const len = 60 + 120 * hash01(id, 40 + row * 13 + n);
        const x1 = Math.min(x + w - 24, xx + len);
        g.poly([xx, yy, x1, yy + 2, x1 - 6, yy + 10, xx + 4, yy + 9]).fill({
          color: LOG.plate,
          alpha: a * 0.9,
        });
        g.moveTo(xx + 3, yy).lineTo(x1 - 3, yy + 1.5);
        g.stroke({ color: LOG.lit, width: 1.2, alpha: a * (0.5 - row * 0.08) });
        xx = x1 + 6 + 20 * hash01(id, 70 + n++);
      }
    }
    // Moss on its back.
    g.moveTo(x - 40, top + 2);
    for (let i = 0; i <= 20; i++) g.lineTo(x - 40 + ((w + 30) * i) / 20, top + 2 - 3 * hash01(id, 90 + i));
    g.stroke({ color: LOG.moss, width: 4, alpha: a });
    // The broken end: rings round the dark heart (the hollow inside).
    const cx = x + w - 6;
    const cy = (top + bot) / 2;
    const ry = (bot - top) / 2 - 6;
    for (let r = 3; r >= 1; r--)
      g.ellipse(cx, cy, 10 + r * 6, ry * (0.35 + r * 0.2)).stroke({ color: LOG.ring, width: 2, alpha: a });
    g.ellipse(cx, cy, 10, ry * 0.32).fill({ color: 0x020304, alpha: a });
  }

  private cover(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
    id: string,
    clock: number,
  ): void {
    const C = KIT.cover;
    if (LOOK.band === 'night') {
      this.logCover(g, x, y, w, h, k, id);
      return;
    }
    // A curtain of roots in front of the hidden space: a dark mass, its lower edge breaking into hanging strands
    // that sway a little, a few lit fibres on the edge (it is a thing, not a hole in the picture).
    g.poly(ragged(x - 16, y - 16, w + 32, h + 8, id, 18)).fill({ color: C.body, alpha: 0.97 * k });
    const n = Math.max(8, Math.round(w / 9));
    for (let c = 0; c < n; c++) {
      const r = hash01(id, c);
      const sx = x - 10 + (c / (n - 1)) * (w + 20);
      const len = 30 + 90 * hash01(id, c + 40);
      const sway = Math.sin(clock * 0.8 + c * 0.7) * 3;
      const wd = 3 + 6 * hash01(id, c + 80);
      const by = y + h - 10;
      g.poly([
        sx - wd,
        by,
        sx + wd,
        by,
        sx + sway + wd * 0.2,
        by + len,
        sx + sway - wd * 0.3,
        by + len * 0.9,
      ]).fill({
        color: r < 0.3 ? C.root : C.body,
        alpha: 0.97 * k,
      });
    }
    // Root cords across the mass, and its lit fringe.
    for (let c = 0; c < Math.round((w + h) / 60); c++) {
      const r = hash01(id, c + 200);
      const sx = x + r * w;
      g.moveTo(sx, y - 10).bezierCurveTo(
        sx + (r - 0.5) * 70,
        y + h * 0.35,
        sx - (r - 0.5) * 50,
        y + h * 0.7,
        sx + (r - 0.5) * 30,
        y + h,
      );
    }
    g.stroke({ color: C.root, width: 5, alpha: k, cap: 'round' });
    for (let c = 0; c < Math.round(w / 30); c++) {
      const sx = x + hash01(id, c + 300) * w;
      const by = y + h - 4;
      g.moveTo(sx, by).lineTo(sx + Math.sin(clock + c) * 2, by + 20 + 30 * hash01(id, c + 310));
    }
    g.stroke({ color: C.edge, width: 1.2, alpha: 0.5 * k });
  }
}

// --- shape helpers ---------------------------------------------------------------------------------

/** How many moonseeds the save holds (its `seed:` flags). */
function seedsHeld(flags: readonly string[]): number {
  let n = 0;
  for (const f of flags) if (f.startsWith('seed:')) n++;
  return n;
}

/** The night's covers: a fallen limb lying over the hidden space (H1's hollow log), not a dark box. */
const LOG = { bark: 0x0c1218, plate: 0x16202a, lit: 0x6a8aa8, ring: 0x1c2630, moss: 0x2a4a48 } as const;

/** A rect with ragged, slightly rounded edges (`r` px of rag). */
function ragged(x: number, y: number, w: number, h: number, id: string, r: number): number[] {
  const out: number[] = [];
  const step = Math.max(6, Math.min(w, h) / 3);
  const jit = (k: number): number => (hash01(id, k) - 0.5) * 2 * r;
  let k = 0;
  for (let xx = x; xx < x + w; xx += step) out.push(xx, y + jit(k++));
  for (let yy = y; yy < y + h; yy += step) out.push(x + w + jit(k++), yy);
  for (let xx = x + w; xx > x; xx -= step) out.push(xx, y + h + jit(k++));
  for (let yy = y + h; yy > y; yy -= step) out.push(x + jit(k++), yy);
  return out;
}

function diamond(x: number, y: number, w: number, h: number): number[] {
  return [x, y - h, x + w, y, x, y + h, x - w, y];
}

/** A standing stone `w` wide, `h` tall, its foot at (x, y). */
function stone(x: number, y: number, w: number, h: number, r: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI + (k / 12) * Math.PI;
    const rr = 1 + 0.08 * Math.sin(k * 2.3 + r * 9);
    out.push(x + Math.cos(a) * w * 0.5 * rr, y + Math.sin(a) * h * rr * (k === 6 ? 1 : 0.98));
  }
  return out;
}

/** Moth wings carved on a face. */
function wings(g: Graphics, x: number, y: number, s: number, c: number, a: number): void {
  g.poly([x, y, x - s * 1.4, y - s * 0.9, x - s * 1.2, y + s * 0.4]).fill({ color: c, alpha: a });
  g.poly([x, y, x + s * 1.4, y - s * 0.9, x + s * 1.2, y + s * 0.4]).fill({ color: c, alpha: a });
  g.poly([x, y + 2, x - s * 0.8, y + s * 0.9, x - s * 0.3, y + s * 0.3]).fill({ color: c, alpha: a });
  g.poly([x, y + 2, x + s * 0.8, y + s * 0.9, x + s * 0.3, y + s * 0.3]).fill({ color: c, alpha: a });
  g.rect(x - 1.2, y - s * 0.4, 2.4, s * 1.2).fill({ color: c, alpha: a });
}

/** A bell-cap's outline: a tall rounded dome over (x, y) with a flared rim. */
function bellCap(x: number, y: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI + (k / 16) * Math.PI;
    out.push(x + Math.cos(a) * w * (1 - 0.15 * Math.sin((k / 16) * Math.PI)), y + 12 + Math.sin(a) * h * 1.2);
  }
  out.push(x + w * 1.05, y + 16, x - w * 1.05, y + 16);
  return out;
}

/** Motes rising through a column of light: stateless, from the clock. */
function motes(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  clock: number,
  n: number,
  c: number,
  a: number,
): void {
  for (let k = 0; k < n; k++) {
    const r = hash01('mote', k + Math.round(x));
    const u = (clock * (0.05 + 0.06 * r) + r) % 1;
    const mx = x + (r - 0.5) * 2 * w + Math.sin(clock * 0.7 + k) * 6;
    const my = y - u * h;
    g.circle(mx, my, 1 + r).fill({ color: c, alpha: a * Math.sin(Math.PI * u) });
  }
}

/** The signs' phrase timing in seconds, from the sim's tuning (`bells.sign`, in frames; the old seconds if absent). */
export function signTiming(): { beat: number; short: number; long: number; rest: number } {
  const S = (tuning as { bells?: { sign?: { beat: number; short: number; long: number; rest: number } } })
    .bells?.sign;
  return S
    ? { beat: S.beat / 60, short: S.short / 60, long: S.long / 60, rest: S.rest / 60 }
    : { beat: 0.18, short: 0.28, long: 0.7, rest: 2.2 };
}

/** 0..1: how lit a firefly's tail is now, flashing `rhythm` (`.` short gap, `-` long) and pausing, on loop. */
export function phraseLit(rhythm: string, clock: number): number {
  // The sign's timing is the sim's (`tuning.bells.sign`, frames): the cap counts against the same numbers.
  const T = signTiming();
  const beat = T.beat;
  const gaps = [...rhythm].map((c) => (c === '-' ? T.long : T.short));
  const total = gaps.reduce((a, b) => a + b, 0) + beat * (gaps.length + 1) + T.rest;
  let t = clock % total;
  for (let k = 0; k <= gaps.length; k++) {
    if (t < beat) return Math.sin((t / beat) * Math.PI);
    t -= beat;
    if (k < gaps.length) {
      if (t < (gaps[k] as number)) return 0;
      t -= gaps[k] as number;
    }
  }
  return 0;
}
