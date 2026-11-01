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
import { thornFamilies } from '../scene/lib/families';
import { mix, wind } from '../scene/lib/look';
import { MASS_PATCHES } from '../scene/lib/mass-patches';
import { LOOK } from '../scene/lib/room-look';
import { hash01 } from './config';
import type { GlowPool } from './glow';
import { breachPlug, PerchSprings, tornPerch } from './torn-perch';

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
  /** Rotten heartwood in the wood: its face over the mass, rot blooms, the crack's lit lip, chips, a cut's dust. */
  rot: {
    face: 0x1e120c,
    soft: 0x2e1c12,
    bloom: 0x8a7458,
    lit: 0xb08a5a,
    chip: 0x3a2618,
    dust: 0x9a8468,
    /** Light through its crack (r16): warm, from the space behind. */
    leak: 0xffb060,
    /** A teaching wall's punky face, its beetle holes and shelf fungus (r16). */
    punk: 0x6e5236,
    hole: 0x140a06,
    shelf: 0xd8c49a,
  },
  /** A shut root door (a side shortcut, the Canopy r16): roots, their lit edge, grain, the silk lashing and its stake. */
  door: {
    root: 0x2a1c14,
    rootLit: 0x8a6a48,
    grain: 0x120a06,
    silk: 0xd8d0bc,
    /** The stake its bands are wound round, this far out from the door on the side that opens it (r19). */
    stakeOff: 20,
    /** On that side and this near (px), the ties' tails stir. */
    stirPx: 520,
  },
  /** Seconds a cut's dust hangs. */
  dust: 0.6,
  /**
   * Seconds a shut root door answers a knock (the Canopy r17: "no response at all"): it shudders, dust falls from its
   * head, its bands strain toward the stake beyond and the ties jerk, for this long. (r19, review r18: r17-r18's lit
   * seams, light spilt at her feet and rings at the knots read as interface; they went.)
   */
  doorKnock: 2.6,
  heart: { body: 0x2c1410, ring: 0x401c14, ringLit: 0x6a3020, scar: 0xc8a888, sheen: 0x9a5a40 },
  thorn: {
    cane: 0x1a0e12,
    caneLit: 0x4a2a2a,
    tip: 0xe0d0c0,
    /** The barbs (review r4 #8: thin dark twigs on dark faces did not read): bone and rust, a warm rim. */
    bone: 0xe8dcc4,
    rust: 0xb8573a,
    barbDark: 0x3a1a14,
    rim: 0xffa868,
    mat: 0x120a0c,
    /** Dead stems off a bed (no barbs: only the strip hurts). */
    stem: 0x5a4a3c,
    /** A long run (canopy review r7 #10: a hairline of barbs read as a texture): a bed of tangle this tall over the
     *  strip (px), from runs this long, canes arching off its ends, one warm glint on its barbs per `glintEvery` px. */
    bed: [48, 96] as readonly number[],
    bedMin: 640,
    glintEvery: 200,
    glint: 0xffd9a0,
  },
  silk: { strand: 0xd8dce6, sheen: 0xf2f4ff },
  cover: { body: 0x040302, root: 0x120c08, edge: 0x2a1c12 },
  /** The wood's leaf cover: the canopy clumps' near-black blue-green, a lighter tone inside, moonlit leaf tips. */
  leafCover: { body: 0x070d14, mid: 0x0d1822, lit: 0x2e4a5c },
  sign: { stone: 0x26262c, stoneLit: 0x5a5c68, carve: 0x0c0c10, flash: 0xffc070, glyph: 0x9fd8e0 },
  bell: {
    cap: 0xd8ceb8,
    capShade: 0x8a8070,
    gill: 0x5a5040,
    ring: 0xffcf80,
    dull: 0x8a8a8a,
    stalk: 0xb8ae98,
  },
  /**
   * `bench`: a moon patch's light in a bench room (the Canopy r20: a fade goes back to the last one she RESTED at, and
   * ft20a / ft20b never saw the well's or the Grove's): 1.6 x the plain one before she has rested there.
   */
  moon: { beam: 0xb8d0f0, pool: 0xdce8ff, mote: 0xe8f0ff, bench: 1.6 },
  moss: { scar: 0x8aa8a0, lit: 0xa8d8cc, body: 0x24403c, glow: 0x88c8c0 },
  /** The Downwood's great lamp seen from above (`glow` marks) and the Split Oak's lightning seam (`scar`). */
  great: { wash: 0xff9a40, core: 0xffd890 },
  scar: { char: 0x0a0605, burn: 0x3a2418, seam: 0xdfe8ff, light: 0xb8d0f0 },
  /** The Downwood's moonseeds and the sockets of the doors that count them. */
  seed: {
    body: 0xf2ecd8,
    wing: 0xc8d8f0,
    glow: 0xdfe8ff,
    rim: 0x8a8070,
    /** A door's sockets (r19): seed-shaped, this far apart, pressed into its face this far under its top. */
    socketGap: 56,
    /** A socket's cut face, all round it (the lit lip is `rim`, under it). */
    cut: 0x52463a,
    socketDown: 30,
  },
  /** Bounce caps: a dark teal dome with cyan glow spots, pale gills, a pale stalk (the wood's living light). */
  cap: {
    top: 0x14283a,
    topMid: 0x24485a,
    topLit: 0x5a8aa0,
    rim: 0x9fd8e8,
    gill: 0x0c1820,
    gillLit: 0x8fd8e4,
    stalk: 0x1e2a34,
    stalkLit: 0x6a8494,
    spot: 0xb8f6ff,
    glow: 0x9ff3ff,
  },
  /** The wood's tall gate: the hole, roots woven over it, the posts and lintel, the moonlight beyond. */
  gate: { hole: 0x02050a, root: 0x16222e, rootLit: 0x6a8aa0, post: 0x0c141c, light: 0xb8d0f0 },
  /** Seconds a gate takes to fall away, a cover to thin, a cut's shake. */
  gateFall: 0.8,
  /** Seconds an arena's root gate takes to grow shut (`gateShut`) and to draw back open in the wood (canopy review
   *  r7 #8: about 40 frames; it popped). */
  gateGrow: 40 / 60,
  gateWithdraw: 40 / 60,
  /** Seconds a standing lid trembles and knits tighter when its room's ambush is set off. */
  knit: 1.1,
  coverEase: 3,
  shake: 0.25,
} as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Hit {
  t: number;
  dir: number;
}

export class Kit {
  /** Bark shaking from a cut (by index). */
  private readonly hits = new Map<number, Hit>();
  /**
   * A shut shortcut knocked from the side that does not open it (the Canopy r16: `shortcutShut`, or a cut into it):
   * seconds since, the side she is on.
   */
  private readonly knock = new Map<string, { t: number; side: number }>();
  /**
   * A door that counts moonseeds cut at (the Canopy r17, first-timer ft17a: "cut it, cut down on it, pressed the Lamp:
   * no response at all"): seconds since, by gate index. Its sockets answer one after another, the empty ones ringing.
   */
  private readonly seedKnock = new Map<number, number>();
  /** Gates opening while she watches (seconds since, by index). */
  private readonly opening = new Map<number, number>();
  private readonly perches = new PerchSprings();
  /** Gates growing shut: seconds since their `gateShut`. */
  private readonly closing = new Map<number, number>();
  /**
   * A lid that stands from the start (no `shut`: the tunnel's `den-lid`) knits tighter when its room's ambush is set
   * off (a trigger's `flagSet`): seconds since. It trembles and dust shakes out of it.
   */
  private readonly knit = new Map<number, number>();
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
        this.closing.clear();
        this.bellT.clear();
        this.readT.clear();
        this.knock.clear();
        continue;
      }
      // A cut made standing on a door that counts moonseeds (a floor: the blade meets no face, so no `slashTerrain`).
      if (ev.type === 'slash') {
        const p = sim.player;
        (S.gates ?? []).forEach((g, gi) => {
          if (!g.flag.startsWith('seeds:') || this.seedKnock.has(gi)) return;
          if (p.x + p.w > g.x && p.x < g.x + g.w && Math.abs(p.y + p.h - g.y) < 24) this.seedKnock.set(gi, 0);
        });
      }
      switch (ev.type) {
        case 'shortcutShut':
          this.knock.set(ev.id ?? '', { t: 0, side: (e as { side?: number }).side ?? 1 });
          break;
        case 'slashTerrain': {
          // A cut into a shut shortcut from either side: it shudders too (the push's answer, by the blade).
          const q = e as { x: number; y: number };
          (S.gates ?? []).forEach((g, gi) => {
            if (!g.flag.startsWith('seeds:') || this.seedKnock.has(gi)) return;
            if (q.x >= g.x - 16 && q.x <= g.x + g.w + 16 && q.y >= g.y - 40 && q.y <= g.y + g.h + 16)
              this.seedKnock.set(gi, 0);
          });
          // (r19: r18's answer to a cut under a rotten wall (chips falling from its sill) went: ft19a cut the column
          // under the giant's rot door for 2 min, "sure it would break", and review r18 counted it among the answers
          // that read as interface. The wall answers a cut into itself.)
          for (const sc of S.shortcuts ?? []) {
            if (sim.save.opened.includes(`${S.id}:${sc.id}`)) continue;
            if (q.x >= sc.x - 12 && q.x <= sc.x + sc.w + 12 && q.y >= sc.y - 12 && q.y <= sc.y + sc.h + 12)
              this.knock.set(sc.id, { t: 0, side: sim.player.cx < sc.x + sc.w / 2 ? -1 : 1 });
          }
          break;
        }
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
          if (i >= 0) {
            // (Opened while still growing shut: it draws back from where it got to.)
            const c = this.closing.get(i);
            const done = c === undefined ? 1 : Math.min(1, c / KIT.gateGrow);
            this.opening.set(i, (1 - done) * KIT.gateWithdraw);
            this.closing.delete(i);
          }
          break;
        }
        case 'flagSet': {
          const fl = (e as { flag?: string }).flag;
          if (fl && (S.triggers ?? []).some((t) => t.sets === fl))
            (S.gates ?? []).forEach((g, i) => {
              if (g.shut === undefined && g.w > g.h && !(sim.kit.gates[i] ?? 0)) this.knit.set(i, 0);
            });
          break;
        }
        case 'gateShut': {
          const i = (S.gates ?? []).findIndex((g) => g.id === ev.id);
          if (i >= 0) {
            this.closing.set(i, 0);
            this.opening.delete(i);
          }
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
      if (h.t > Math.max(KIT.shake + 0.2, KIT.dust)) this.hits.delete(k);
    }
    for (const [k, t] of this.opening) this.opening.set(k, t + dt);
    for (const [k, t] of this.closing) this.closing.set(k, t + dt);
    for (const [k, t] of this.knit) {
      if (t > KIT.knit) this.knit.delete(k);
      else this.knit.set(k, t + dt);
    }
    for (const [k, b] of this.bellT) {
      b.t += dt;
      if (b.t > 3) this.bellT.delete(k);
    }
    for (const [k, t] of this.readT) this.readT.set(k, t + dt);
    for (const [k, n] of this.knock) {
      n.t += dt;
      if (n.t > KIT.doorKnock) this.knock.delete(k);
    }
    for (const [k, t] of this.seedKnock) {
      if (t > KIT.doorKnock) this.seedKnock.delete(k);
      else this.seedKnock.set(k, t + dt);
    }
    for (const [k, t] of this.capT) {
      if (t > 0.6) this.capT.delete(k);
      else this.capT.set(k, t + dt);
    }

    // Moon patches and glades first (the light lies behind everything else of the kit).
    (S.patches ?? []).forEach((p, i) => {
      if (!seen(p.x - 100, p.y - 400, 200, 420)) return;
      const rested = sim.rest.at === i && sim.rest.done;
      const mine = sim.save.patch?.room === room && sim.save.patch?.id === p.id;
      const base = S.bench ? KIT.moon.bench : 1;
      this.moonPool(back, glow, p.x, p.y, base + (mine ? 0.25 : 0) + (rested ? 0.35 : 0), clock, i);
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

    // Bounce caps: a fat glowing fungus over its rect, its stalk down into the wood; a bounce squashes it.
    (S.caps ?? []).forEach((c, i) => {
      if (!seen(c.x, c.y, c.w, c.h + 260)) return;
      const t = this.capT.get(i);
      const sq = t === undefined ? 0 : Math.sin(Math.min(1, t / 0.5) * Math.PI) * Math.exp(-t * 4);
      this.cap(back, glow, c.x, c.y, c.w, c.h, sq, clock, t, `cap${i}${c.x}`);
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
      const patch = MASS_PATCHES.get(`bark:${b.id}`);
      if (patch) patch.visible = left > 0;
      if (left <= 0 || !seen(b.x, b.y, b.w, b.h)) return;
      const hit = this.hits.get(i);
      const shake = hit ? Math.max(0, 1 - hit.t / KIT.shake) : 0;
      const ox = shake * Math.sin(hit ? hit.t * 90 : 0) * 6 * (hit?.dir || 1);
      const max = (b as { hp?: number }).hp ?? 3;
      // In the wood the wall is the mass it sits in (baked: mass-patches.ts); only a faint seam and its cuts show.
      if (patch) {
        patch.x = ox;
        // (The wall a room teaches with reads a little stronger than a secret, never a different shape.)
        const teach = (
          (S as { marks?: { landmarks?: Array<{ id: string; kind: string }> } }).marks?.landmarks ?? []
        ).some((l) => l.kind === 'teach' && l.id === b.id);
        this.rot(back, b.x + ox, b.y, b.w, b.h, b.floor === true, teach ? 1 : 0.7, b.id);
        this.seam(back, b.x + ox, b.y, b.w, b.h, b.floor === true, max - left, b.id);
        // (The Canopy r16, first-timer ft16a: the giant's wall "looked like a solid post"; cuts there gave "no shake,
        // no mark". Warm light leaks through its crack from the space behind, a thread of it on a teaching wall before
        // any cut, more with each cut taken: the wall is thin, and it is giving.)
        const leak = (teach ? 0.12 : 0) + (0.22 * (max - left)) / Math.max(1, max) + (hit ? 0.35 * shake : 0);
        if (leak > 0.01 && !b.floor)
          for (let q = 0; q < 4; q++)
            glow.add(b.x + ox + b.w * 0.5, b.y + b.h * (0.2 + 0.2 * q), 26 + 14 * leak, KIT.rot.leak, leak);
        if (hit && hit.t < KIT.dust)
          this.dust(back, b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, hit.t / KIT.dust, b.id);
        return;
      }
      if ((b as { heartwood?: boolean }).heartwood) this.heartwood(back, b.x + ox * 0.4, b.y, b.w, b.h, b.id);
      else this.bark(back, b.x + ox, b.y, b.w, b.h, b.floor === true, max - left, b.id);
    });

    // Shortcuts (closed): a root door lashed shut, its knot on the side that opens it (the Canopy r16: a bark plug
    // read as a wall to cut, and from the well's floor nothing said which side opened). Knocked, it shudders.
    for (const sc of S.shortcuts ?? []) {
      if (sim.save.opened.includes(`${room}:${sc.id}`) || !seen(sc.x, sc.y, sc.w, sc.h)) continue;
      if (sc.w > sc.h * 1.5) {
        this.bark(back, sc.x, sc.y, sc.w, sc.h, true, 0, sc.id);
        continue;
      }
      this.rootDoor(
        back,
        sc.x,
        sc.y,
        sc.w,
        sc.h,
        sc.opens,
        sc.id,
        this.knock.get(sc.id),
        clock,
        sim.player.cx,
      );
    }

    // Thorns: brambles.
    for (const t of S.thorns ?? []) {
      if (!seen(t.x, t.y, t.w, t.h)) continue;
      this.bramble(back, glow, t.x, t.y, t.w, t.h, t.id, clock, S.solids);
    }

    // Gates: silk curtains and seals; open, they fall away.
    // (The den's rubble steps are drawn together as one heap after the loop.)
    const heap: Array<{ x: number; y: number; w: number; h: number; fall: number; id: string }> = [];
    let heapLit = false;
    (S.gates ?? []).forEach((g, i) => {
      const open = (sim.kit.gates[i] ?? 0) > 0;
      const t = this.opening.get(i);
      const wood = LOOK.kit === 'wood';
      const away = wood ? KIT.gateWithdraw : KIT.gateFall;
      if (open && (t === undefined || t > away)) return;
      if (!seen(g.x, g.y, g.w, g.h)) return;
      // In the wood a gate grows shut over `gateGrow` (an arena's door: canopy review r7 #8) and draws back open over
      // `gateWithdraw`; `fall` is how far gone it is (0 standing, 1 gone).
      const c = this.closing.get(i);
      const fall = open
        ? t !== undefined
          ? t / away
          : 0
        : wood && c !== undefined
          ? 1 - Math.min(1, c / KIT.gateGrow)
          : 0;
      if (fall >= 1) return;
      // (A lid knitting tighter as the ambush comes: a tremble that dies away and dust shaken out of it.)
      const kt = this.knit.get(i);
      const kk = kt === undefined ? 0 : 1 - kt / KIT.knit;
      const kx = kk * kk * 3 * Math.sin((kt ?? 0) * 70);
      // (The den's ending, the Canopy r12: the taproot is a gate the collapse opens; standing, the bake's column is it
      // (pf-mass `paintTaproot`). The rubble is the collapse's slope: earth and broken roots, not a lattice.)
      if (wood && g.id === 'taproot') return;
      // (The Canopy r14: the taproot's top half left hanging from the roof after the collapse, broken off.)
      if (wood && g.id === 'rubble-root') {
        this.brokenRoot(back, g.x, g.y, g.w, g.h, 1 - fall, g.id);
        return;
      }
      // (The Canopy r15: the den's east wall torn open by the collapse, `*-breach`: earth like the wall round it, cracked,
      // that falls out in clods as it opens. A root gate there read as a door before the roof came down.)
      if (wood && g.id.endsWith('breach')) {
        breachPlug(back, glow, g.x, g.y, g.w, g.h, fall, clock, g.id);
        return;
      }
      if (wood && g.id.startsWith('rubble')) {
        // (Moonlit once the roof's shaft is open: canopy review r12 #3, "a moonlit rubble face".)
        const roof = (S.gates ?? []).findIndex((q) => q.id.endsWith('roof'));
        heapLit = roof >= 0 && (sim.kit.gates[roof] ?? 0) > 0;
        // (The Canopy r14: a thin rubble gate is a slab of the roof come down, wedged as a ledge on the way out; only
        // the ones on the floor are the heap.)
        if (g.h <= 96) {
          // (Its torn roots run up to the roof over it: a perch hung there, not a dish in the air.)
          let over = -1e9;
          for (const q of S.solids)
            if (q.x <= g.x + g.w / 2 && q.x + q.w >= g.x + g.w / 2 && q.y + q.h <= g.y && q.y + q.h > over)
              over = q.y + q.h;
          // (The Canopy r15: drawn as torn roots that sag and sway as she lands; review r14 #1, "clean slabs".)
          const p = sim.player;
          const on = p.grounded && Math.abs(p.feetY - g.y) <= 6 && p.cx >= g.x - 12 && p.cx <= g.x + g.w + 12;
          const load = this.perches.update(dt, g.id, on, p.vy);
          tornPerch(
            back,
            g.x,
            g.y,
            g.w,
            g.h,
            fall,
            heapLit,
            g.id,
            over > -1e8 ? over : g.y - 260,
            clock,
            load,
          );
        } else heap.push({ x: g.x, y: g.y, w: g.w, h: g.h, fall, id: g.id });
      } else if (g.h >= g.w && wood) this.rootGate(back, glow, g.x, g.y, g.w, g.h, clock, fall, g.id);
      else if (g.h >= g.w) this.curtain(back, glow, g.x, g.y, g.w, g.h, clock, fall, g.id);
      else if (wood) this.rootMat(back, glow, g.x + kx, g.y, g.w, g.h, clock, 1 - fall, g.id);
      else this.seal(back, g.x, g.y, g.w, g.h, clock, fall, g.id);
      // Dust shaken out of the wood while it moves.
      if (wood && kk > 0)
        motes(back, g.x + g.w / 2, g.y + g.h + 90, g.w / 2, 140, clock, 16, KIT.rot.dust, 0.8 * kk);
      if (wood && fall > 0)
        motes(
          back,
          g.x + g.w / 2,
          g.y + g.h + 90,
          g.w / 2,
          140,
          clock,
          14,
          KIT.rot.dust,
          0.7 * Math.sin(Math.PI * fall),
        );
      // A door that counts moonseeds (the Downwood): its sockets in a row over it, one lit for each seed held.
      if (g.flag.startsWith('seeds:') && !open) {
        const want = Number(g.flag.slice(6));
        const held = seedsHeld(sim.save.flags);
        for (let k = 0; k < want; k++) {
          // (The Canopy r19: three round dark dots over the door read as a count of moon shards, "one of three". A
          // socket is a moonseed's own shape pressed into the door's face: the seed and its wing, hollow, rimmed.)
          const sx = g.x + g.w / 2 + (k - (want - 1) / 2) * KIT.seed.socketGap;
          const sy = g.y + KIT.seed.socketDown;
          this.seedShape(back, sx, sy, 1.5, KIT.seed.rim, 0.75, 3);
          // Cut at: each socket in turn rings out (the empty ones a pale ring opening: "a seed goes here").
          const st = this.seedKnock.get(i);
          if (st !== undefined) {
            const u = (st - k * 0.22) / 0.9;
            if (u > 0 && u < 1) {
              // (r19, review r18: the rings of light read as interface. The carving answers as wood: dust shaken out
              // of each socket in turn, its lip flashing pale for a moment.)
              this.seedShape(front, sx, sy, 1.5, KIT.seed.body, 0.7 * (1 - u), 3);
              for (let q = 0; q < 4; q++) {
                const a = hash01(`sk${k}`, q) * Math.PI;
                front
                  .circle(
                    sx + Math.cos(a) * 26 * u,
                    sy - 6 - Math.sin(a) * 18 * u + 30 * u * u,
                    2.4 * (1 - u) + 0.6,
                  )
                  .fill({ color: KIT.rot.dust, alpha: 0.8 * (1 - u) });
              }
            }
          }
          if (k < held) {
            this.seedShape(back, sx, sy, 1.2, KIT.seed.body, 1);
            glow.add(sx, sy, 26, KIT.seed.glow, 0.5 + 0.1 * Math.sin(clock * 2 + k));
          }
        }
      }
    });
    if (heap.length) this.rubbleHeap(back, heap, heapLit);

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
      // A cover in the wood is the mass it sits in (baked: mass-patches.ts).
      const patch = MASS_PATCHES.get(`cover:${c.id}`);
      if (patch) {
        patch.alpha = k;
        patch.visible = k >= 0.01;
        return;
      }
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

  /**
   * A rotten wall in the wood (its body is the baked mass): the faint seam where the rot meets the sound wood, and a
   * crack for every cut taken. Found by a sharp eye or a blade, as in the references.
   */
  private seam(
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
    const line: number[] = [];
    if (floor) for (let k = 0; k <= 8; k++) line.push(x + (w * k) / 8, y + 10 + (hash01(id, k) - 0.5) * 6);
    else
      for (let k = 0; k <= 10; k++)
        line.push(x + w * 0.5 + (hash01(id, k) - 0.5) * w * 0.5, y + 12 + ((h - 24) * k) / 10);
    g.moveTo(line[0] as number, line[1] as number);
    for (let k = 2; k < line.length; k += 2) g.lineTo(line[k] as number, line[k + 1] as number);
    g.stroke({ color: 0x02050a, width: 1.6, alpha: 0.55 });
    for (let c = 0; c < cracks; c++) {
      const sx = floor ? x + w * (0.2 + 0.6 * hash01(id, c + 40)) : x + w * (0.3 + 0.4 * hash01(id, c + 40));
      const sy = floor ? y + 2 : y + h * (0.15 + 0.25 * c);
      g.moveTo(sx, sy);
      let cx = sx;
      let cy = sy;
      for (let k = 0; k < 5; k++) {
        cx += (hash01(id, c * 9 + k) - 0.5) * (floor ? 22 : 18);
        cy += floor ? h / 6 : h / 9;
        g.lineTo(cx, cy);
      }
      g.stroke({ color: B.crack, width: 2.6, alpha: 0.9 });
    }
  }

  /**
   * Rotten heartwood in the wood (review r3 #9: the teaching wall read as a post): over the baked mass, a darker,
   * softer, warmer face with pale rot blooms, a lit crack running across it on the slant, loose chips at its foot.
   */
  private rot(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    floor: boolean,
    k: number,
    id: string,
  ): void {
    const R = KIT.rot;
    g.poly(ragged(x + 3, y + 3, w - 6, h - 6, `${id}r`, 6)).fill({ color: R.face, alpha: 0.55 * k });
    // (The Canopy r16, first-timer ft16a: the teaching wall "looked like a solid post" through two first-timers. A wall
    // the room teaches with is punky, pale rot over its whole face: soft wood gone to fungus, bored by beetles, shelf
    // fungus on its edges. A secret's stays a faint seam.)
    if (k >= 1 && !floor) {
      g.poly(ragged(x + 2, y + 6, w - 4, h - 12, `${id}p`, 5)).fill({ color: R.punk, alpha: 0.85 });
      for (let q = 0; q < 9; q++) {
        const bx = x + w * (0.2 + 0.6 * hash01(id, q + 200));
        const by = y + h * (0.08 + 0.84 * hash01(id, q + 210));
        g.ellipse(bx, by, 2.5 + 2 * hash01(id, q + 220), 3 + 2.5 * hash01(id, q + 230)).fill({
          color: R.hole,
          alpha: 0.9,
        });
      }
      for (let q = 0; q < 4; q++) {
        const side = q % 2 ? 1 : -1;
        const fx = side > 0 ? x + w - 2 : x + 2;
        const fy = y + h * (0.2 + 0.18 * q + 0.05 * hash01(id, q + 240));
        const fw = 10 + 8 * hash01(id, q + 250);
        g.ellipse(fx + side * fw * 0.45, fy, fw * 0.55, 4.5).fill({ color: R.shelf, alpha: 0.95 });
        g.moveTo(fx, fy + 2)
          .lineTo(fx + side * fw, fy + 2)
          .stroke({ color: R.face, width: 1.2, alpha: 0.6 });
      }
    }
    g.poly(ragged(x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.7, `${id}q`, 5)).fill({
      color: R.soft,
      alpha: 0.4 * k,
    });
    // Blooms of rot: pale soft spots.
    for (let q = 0; q < 5; q++) {
      const bx = x + w * (0.15 + 0.7 * hash01(id, q + 60));
      const by = y + h * (0.1 + 0.8 * hash01(id, q + 70));
      g.ellipse(bx, by, 3 + 5 * hash01(id, q + 80), 2 + 4 * hash01(id, q + 90)).fill({
        color: R.bloom,
        alpha: 0.35 * k,
      });
    }
    // The crack: corner to corner on the slant, dark with a lit lip.
    const pts: number[] = [];
    for (let q = 0; q <= 6; q++) {
      const u = q / 6;
      const j = (hash01(id, q + 100) - 0.5) * (floor ? 10 : 12);
      if (floor) pts.push(x + w * (0.05 + 0.9 * u), y + h * (0.2 + 0.6 * u) + j);
      else pts.push(x + w * (0.15 + 0.7 * u) + j, y + h * (0.06 + 0.88 * u));
    }
    g.moveTo(pts[0] as number, pts[1] as number);
    for (let q = 2; q < pts.length; q += 2) g.lineTo(pts[q] as number, pts[q + 1] as number);
    g.stroke({ color: KIT.bark.crack, width: 3.2, alpha: 0.85 * k });
    g.moveTo((pts[0] as number) + 2, (pts[1] as number) - 1);
    for (let q = 2; q < pts.length; q += 2) g.lineTo((pts[q] as number) + 2, (pts[q + 1] as number) - 1);
    g.stroke({ color: R.lit, width: 1.2, alpha: 0.6 * k });
    // Chips fallen at its foot (a wall's; a floor panel's sit round its edges).
    for (let q = 0; q < 6; q++) {
      const cx = floor ? x + w * hash01(id, q + 120) : x - 10 + (w + 20) * hash01(id, q + 120);
      const cy = floor ? y - 2 : y + h - 2;
      const sz = 3 + 4 * hash01(id, q + 130);
      g.poly([cx, cy, cx + sz, cy - sz * 0.6, cx + sz * 1.4, cy + 1]).fill({
        color: R.chip,
        alpha: 0.85 * k,
      });
    }
  }

  /**
   * A shut root door (a side shortcut): three roots stood side by side, lashed with two bands of silk whose knot sits
   * on the side that opens it (`opens`), lit; moonlight leaks between the roots from the far side. `knock`: it
   * shudders (a damped shake) and dust falls from its head.
   */
  private rootDoor(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    opens: string,
    id: string,
    knock: { t: number; side: number } | undefined,
    clock: number,
    /** Her body centre's x: on the side that opens it, its ties stir (a thing to cut). */
    herX: number,
  ): void {
    const D = KIT.door;
    const kt = knock?.t ?? 9;
    const shake = knock ? Math.exp(-kt * 6) * Math.sin(kt * 55) * 7 * -knock.side : 0;
    // (r17: the answer that stays: the far side's light and the knots flare and ebb over `doorKnock` s; r18 longer and
    // brighter, a hot first flash.)
    const flare = knock ? Math.min(1, kt * 12) * Math.max(0, 1 - kt / KIT.doorKnock) ** 1.1 : 0;
    const twang = knock ? Math.exp(-kt * 5) * Math.sin(kt * 38) * 9 * -knock.side : 0;
    const open = opens === 'w' ? -1 : 1;
    // (The Canopy r19, review r18: r18's lit seams read as "a slab with two light slits", its knock's blaze and the
    // rings at the knots as glowing interface. No light of its own now: roots, bark, rope. A knock is answered by the
    // wood and the rope: it shudders, dust falls, the bands strain toward the stake beyond and the ties jerk.)
    for (let k = 0; k < 3; k++) {
      const rw = w / 3 + 6;
      const cx = x + (w * (k + 0.5)) / 3 + shake * (0.6 + 0.2 * k);
      const lean = (hash01(id, k + 300) - 0.5) * 10;
      const pts: number[] = [];
      const n = 8;
      for (let j = 0; j <= n; j++) {
        const yy = y - 6 + ((h + 12) * j) / n;
        const bulge = 1 + 0.18 * Math.sin(j * 1.7 + k * 2.3 + hash01(id, k) * 6);
        pts.push(cx + lean * (j / n - 0.5) - (rw / 2) * bulge, yy);
      }
      for (let j = n; j >= 0; j--) {
        const yy = y - 6 + ((h + 12) * j) / n;
        const bulge = 1 + 0.18 * Math.sin(j * 1.3 + k * 1.1 + hash01(id, k + 9) * 6);
        pts.push(cx + lean * (j / n - 0.5) + (rw / 2) * bulge, yy);
      }
      g.poly(pts).fill(D.root);
      // Its lit edge on the side that opens it, a dark seam on the other.
      g.moveTo(cx + (open * rw) / 2 - open * 3, y)
        .lineTo(cx + lean * 0.5 + (open * rw) / 2 - open * 3, y + h)
        .stroke({ color: D.rootLit, width: 2, alpha: 0.55 });
      // Grain.
      for (let j = 0; j < 3; j++) {
        const gx = cx + (hash01(id, k * 7 + j) - 0.5) * rw * 0.5;
        g.moveTo(gx, y + h * 0.1).quadraticCurveTo(gx + 3, y + h * 0.5, gx - 2, y + h * 0.9);
      }
      g.stroke({ color: D.grain, width: 1, alpha: 0.5 });
    }
    // Two bands of silk across, wound round a stake on the side that opens it and tied off there (the Canopy r19:
    // every r18 first-timer read the old round knots as "two round lights behind bars, maybe they need lighting").
    // A tie is a lashing, not a light: three turns round the stake, a bow, two loose tails, no glow of its own. Knocked
    // from the shut side the bands strain toward the stake and the ties jerk (what holds it is over there); from the
    // side that opens it, near, the tails stir in her draught.
    const near = (open > 0 ? herX > x + w : herX < x) && Math.abs(herX - (x + w / 2)) < D.stirPx;
    const stake = (open > 0 ? x + w + D.stakeOff : x - D.stakeOff) + shake;
    // The stake: a peg of root driven into the floor beside the door, taller than the lashings.
    g.poly([
      stake - 8,
      y + h,
      stake - 6,
      y + h * 0.16,
      stake,
      y + h * 0.08,
      stake + 6,
      y + h * 0.16,
      stake + 8,
      y + h,
    ]).fill(D.root);
    g.moveTo(stake + open * 3, y + h * 0.16)
      .lineTo(stake + open * 4, y + h)
      .stroke({ color: D.rootLit, width: 1.6, alpha: 0.5 });
    for (const [bi, by] of [0.3, 0.68].entries()) {
      const yy = y + h * by;
      // (r18: knocked, the silk pulls taut toward its stake: the tie is what holds it, and it is over there.)
      const tug = open * 8 * flare;
      const jerk = knock ? Math.exp(-kt * 4) * Math.sin(kt * 30 + bi) * 5 : 0;
      const stir = near ? Math.sin(clock * 3.1 + bi * 1.7) * 3 : 0;
      const far = open > 0 ? x - 4 : x + w + 4;
      g.moveTo(far + shake, yy - 4)
        .quadraticCurveTo(
          x + w / 2 + shake + twang + tug,
          yy + 4 + Math.abs(twang) * 0.5 - 3 * flare,
          stake,
          yy - 3,
        )
        .stroke({ color: D.silk, width: 6, alpha: 0.85 });
      // Three turns round the stake (dark-edged so they read as wound cord, not a glow).
      for (let k = 0; k < 3; k++) {
        const ty = yy - 9 + k * 6 + jerk * 0.3;
        g.moveTo(stake - 10, ty + 3)
          .lineTo(stake + 10, ty - 3)
          .stroke({ color: D.grain, width: 5.4, alpha: 0.8 })
          .moveTo(stake - 9, ty + 3)
          .lineTo(stake + 9, ty - 3)
          .stroke({ color: D.silk, width: 3.2, alpha: 0.95 });
      }
      // The bow off the stake's far side: two small loops and two tails hanging.
      const bx = stake + open * 10 + jerk * open;
      const by2 = yy + 5;
      for (const sgn of [-1, 1]) {
        g.moveTo(bx, by2)
          .quadraticCurveTo(bx + open * 18, by2 + sgn * 14, bx + open * 5, by2 + sgn * 4)
          .stroke({ color: D.grain, width: 4.6, alpha: 0.7 })
          .moveTo(bx, by2)
          .quadraticCurveTo(bx + open * 18, by2 + sgn * 14, bx + open * 5, by2 + sgn * 4)
          .stroke({ color: D.silk, width: 2.6, alpha: 0.95 });
      }
      g.moveTo(bx, by2)
        .quadraticCurveTo(bx + open * (6 + stir), by2 + 18, bx + open * (3 + stir * 1.5 + jerk), by2 + 36)
        .moveTo(bx, by2)
        .quadraticCurveTo(bx + open * (14 + stir), by2 + 10, bx + open * (18 + stir * 2 - jerk), by2 + 30)
        .stroke({ color: D.silk, width: 2.2, alpha: 0.85 });
      if (flare > 0.02) {
        // The strain: the band's last stretch to the stake pulled tight, a taut second strand over it.
        g.moveTo(x + w / 2 + shake, yy - 1)
          .lineTo(stake, yy - 4)
          .stroke({ color: D.silk, width: 2.4, alpha: 0.8 * flare });
      }
    }
    // Knocked: dust shaken out of its head.
    if (knock && kt < 0.9) this.dust(g, x + w / 2, y + 10 + 60 * kt, w * 1.6, 20, kt / 0.9, `${id}k`);
  }

  /** A puff of rot dust from a cut (t: 0..1 of its life), and (r16) chips of rot thrown out of it, falling. */
  private dust(g: Graphics, cx: number, cy: number, w: number, h: number, t: number, id: string): void {
    for (let q = 0; q < 8; q++) {
      const a = Math.PI * (0.15 + 0.7 * hash01(id, q + 170)) + (q % 2 ? 0 : Math.PI);
      const v = 60 + 140 * hash01(id, q + 180);
      const px = cx + Math.cos(a) * v * t * 0.6;
      const py = cy - Math.abs(Math.sin(a)) * v * t * 0.5 + 260 * t * t;
      const sz = 3 + 4 * hash01(id, q + 190);
      g.poly([px, py, px + sz, py - sz * 0.7, px + sz * 1.3, py + sz * 0.4]).fill({
        color: KIT.rot.bloom,
        alpha: 0.9 * (1 - t),
      });
    }
    for (let q = 0; q < 7; q++) {
      const a = hash01(id, q + 150) * 6.28;
      const d = (10 + 40 * hash01(id, q + 160)) * t;
      g.circle(cx + Math.cos(a) * d * (w > h ? 2 : 1), cy + Math.sin(a) * d - 14 * t, 4 + 10 * t).fill({
        color: KIT.rot.dust,
        alpha: 0.35 * (1 - t),
      });
    }
  }

  /**
   * A moonseed's silhouette, as the seeds in the world are drawn (a pale seed, its wing swept up behind it): filled; with
   * `rim` px carved into wood (a dark hollow, its lower lip catching the light in `color`). `s` scales it (1 = the
   * seed's own size).
   */
  private seedShape(
    g: Graphics,
    x: number,
    y: number,
    s: number,
    color: number,
    alpha: number,
    rim = 0,
  ): void {
    const shape = (k: number, c: number, a: number): void => {
      // The wing: a blade from the seed's shoulder, up and back, tapering to a point.
      g.poly([
        x - 3 * s,
        y - 6 * s - k,
        x - 12 * s - k,
        y - 14 * s - k,
        x - 24 * s - k * 1.4,
        y - 15 * s - k,
        x - 16 * s,
        y - 8 * s + k,
        x - 5 * s + k,
        y - 1 * s + k,
      ]).fill({ color: c, alpha: a * 0.9 });
      g.ellipse(x, y, 7 * s + k, 10 * s + k).fill({ color: c, alpha: a });
    };
    if (rim > 0) {
      // Carved: the cut's lower edge catches the light (the shape set down and right by `rim`), the hollow over it.
      const ox = x;
      const oy = y;
      shape(rim * 0.9, KIT.seed.cut, 1);
      x = ox + rim * 0.5;
      y = oy + rim * 0.8;
      shape(0, color, alpha);
      x = ox;
      y = oy;
      shape(0, 0x0c0a10, 1);
    } else shape(0, color, alpha);
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

  /**
   * Thorns: a dark bramble mat along the strip and, out of it, a row of barbs pointing into the open air (away from
   * the wood it grows on), bone-pale and rust, 24-40 px, with a faint warm rim (review r4 #8: a hazard shape nothing
   * else in the wood shares, the brightest thing on its face).
   */
  private bramble(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    w: number,
    h: number,
    id: string,
    clock: number,
    solids: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  ): void {
    const T = KIT.thorn;
    const solidAt = (px: number, py: number) =>
      solids.some((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
    // Which way is out: away from the wood beside it (a floor strip points up, a wall strip into the shaft).
    const along = w >= h;
    let nx = 0;
    let ny = -1;
    if (along) {
      if (solidAt(x + w / 2, y - 10) && !solidAt(x + w / 2, y + h + 10)) ny = 1;
    } else {
      ny = 0;
      nx = solidAt(x - 10, y + h / 2) || !solidAt(x + w + 10, y + h / 2) ? 1 : -1;
    }
    const len = along ? w : h;
    const depth = along ? h : w;
    // A point on the strip: u along it, v out from its wood side (0) to its air side (depth).
    const at = (u: number, v: number): [number, number] => {
      if (along) return [x + u, ny < 0 ? y + h - v : y + v];
      return [nx > 0 ? x + v : x + w - v, y + u];
    };
    // (Review r6 #8: the same 64 px tray in 20 rooms.) Each bed is a family (scene/lib/families.ts): its mat, its
    // barbs, what grows off it; and its own outline: it spills over the strip's ends by its own amounts (no barbs
    // there: only the strip hurts).
    const [matK, barbK, extraK] = (thornFamilies().get(`${LOOK.roomId}:${id}`) ?? 'mat-spike-creep').split(
      '-',
    );
    const spillA = 14 + 46 * hash01(id, 201);
    const spillB = 14 + 46 * hash01(id, 202);
    // The mat: a lumpy dark tangle along the wood side (low and even, a thin coil, or a tall ragged thicket).
    const mat: number[] = [];
    const [m0, m1] = matK === 'coil' ? [0.25, 0.15] : matK === 'thicket' ? [0.55, 0.45] : [0.45, 0.25];
    for (let u = -spillA; u <= len + spillB; u += 12) {
      const edge = Math.min(1, (u + spillA) / 40, (len + spillB - u) / 40);
      const [px, py] = at(u, depth * (m0 + m1 * hash01(id, Math.round(u) + 3)) * Math.max(0.2, edge));
      mat.push(px, py);
    }
    for (let u = len + spillB; u >= -spillA; u -= 24) {
      const [px, py] = at(u, -4);
      mat.push(px, py);
    }
    // A long run's bed: a tall tangle with a thorny silhouette over the strip, canes arching off its ends.
    const long = len >= T.bedMin;
    if (long) {
      const [b0, b1] = T.bed as [number, number];
      const H = (u: number) =>
        lerpN(
          b0,
          b1,
          0.5 + 0.35 * Math.sin(u * 0.011 + hash01(id, 300) * 6) + 0.15 * Math.sin(u * 0.037 + 1.3),
        );
      const bed: number[] = [];
      let q = 0;
      for (let u = -spillA * 0.6; u <= len + spillB * 0.6; u += 9, q++) {
        const edge = Math.min(1, (u + spillA * 0.6) / 70, (len + spillB * 0.6 - u) / 70);
        // Spiky: every other point a thorn's tip standing off the tangle, of its own length.
        const spike = q % 2 ? 6 + 16 * hash01(id, 400 + q) : -4 * hash01(id, 700 + q);
        const [px, py] = at(u, (H(u) + spike) * Math.max(0.15, edge));
        bed.push(px, py);
      }
      for (let u = len + spillB * 0.6; u >= -spillA * 0.6; u -= 24) {
        const [px, py] = at(u, -4);
        bed.push(px, py);
      }
      g.poly(bed).fill({ color: T.mat, alpha: 0.97 });
      // Canes looping through it, lit on top now and then.
      for (let c = 0; c < Math.round(len / 50); c++) {
        const u0 = hash01(id, 500 + c) * len;
        const span = 60 + 120 * hash01(id, 520 + c);
        const [ax, ay] = at(u0, H(u0) * 0.2);
        const [bx, by] = at(u0 + span * 0.5, H(u0) * (0.75 + 0.35 * hash01(id, 540 + c)));
        const [ex, ey] = at(u0 + span, H(u0) * 0.3);
        g.moveTo(ax, ay).quadraticCurveTo(bx, by, ex, ey);
        g.stroke({
          color: c % 4 === 0 ? T.caneLit : T.cane,
          width: 3 + 3 * hash01(id, 560 + c),
          cap: 'round',
        });
      }
      // Canes arching up off each end and over, thorned.
      for (const [end, sgn] of [
        [-spillA * 0.5, -1],
        [len + spillB * 0.5, 1],
      ] as const) {
        for (let c = 0; c < 2; c++) {
          const reach = 70 + 110 * hash01(id, 600 + c + (sgn > 0 ? 10 : 0));
          const tall = H(end) * (1.2 + 0.8 * hash01(id, 620 + c + (sgn > 0 ? 10 : 0)));
          const [ax, ay] = at(end - sgn * 30, H(end) * 0.3);
          const [mx, my] = at(end + sgn * reach * 0.35, tall);
          const [ex, ey] = at(end + sgn * reach, H(end) * 0.25);
          const sw = wind(ax, clock, c) * 2;
          g.moveTo(ax, ay).quadraticCurveTo(mx + sw, my, ex + sw, ey);
          g.stroke({ color: T.cane, width: 5 - c * 1.5, cap: 'round' });
          for (let q2 = 1; q2 < 5; q2++) {
            const t = q2 / 5;
            const qx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * (mx + sw) + t * t * (ex + sw);
            const qy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * ey;
            g.moveTo(qx, qy)
              .lineTo(qx + sgn * 7, qy - 8)
              .stroke({ color: T.barbDark, width: 2, cap: 'round' });
          }
        }
      }
    }
    g.poly(mat).fill({ color: T.mat, alpha: 0.95 });
    // A few canes through the mat (lit now and then); a coil's loop over and back.
    const nc = Math.max(2, Math.round(len / (matK === 'thicket' ? 40 : 60)));
    for (let c = 0; c < nc; c++) {
      const u0 = hash01(id, c * 3) * (len + spillA + spillB) - spillA;
      const u1 = u0 + 40 + hash01(id, c * 3 + 1) * 90;
      const [ax, ay] = at(u0, depth * 0.15);
      const [bx, by] = at((u0 + u1) / 2, depth * (matK === 'coil' ? 0.9 : 0.5 + 0.3 * hash01(id, c * 3 + 2)));
      const [ex, ey] = at(u1, depth * 0.2);
      const sw = wind(ax, clock, hash01(id, c)) * 1.5;
      g.moveTo(ax, ay).quadraticCurveTo(bx + sw, by + sw, ex, ey);
      g.stroke({ color: c % 3 === 0 ? T.caneLit : T.cane, width: 3 + hash01(id, c + 40) * 3, cap: 'round' });
      if (matK === 'coil' && c % 2 === 0) {
        const [lx, ly] = at((u0 + u1) / 2, depth * 0.7);
        g.circle(lx + sw, ly, 9 + 8 * hash01(id, c + 60)).stroke({ color: T.cane, width: 2.5 });
      }
    }
    // What grows off it: canes creeping over the lips and up a wall beside it, or a tuft of dead stems.
    if (extraK === 'creep') {
      for (const [end, sgn] of [
        [-spillA, -1],
        [len + spillB, 1],
      ] as const) {
        const climb = 40 + 120 * hash01(id, 210 + sgn);
        const [ax, ay] = at(end - sgn * 10, depth * 0.2);
        // Up the wood beside the end if there is any, else along the ground past it.
        const wall = along && solidAt(ax + sgn * 16, ay - 24 * (ny < 0 ? 1 : -1));
        const ex = wall ? ax + sgn * 6 : ax + sgn * climb * 0.8;
        const ey = wall ? ay + (ny < 0 ? -climb : climb) : ay + (ny < 0 ? -6 : 6);
        g.moveTo(ax, ay).quadraticCurveTo((ax + ex) / 2 + sgn * 14, (ay + ey) / 2, ex, ey);
        g.stroke({ color: T.caneLit, width: 3, cap: 'round' });
        for (let q = 1; q < 4; q++) {
          const t = q / 4;
          const qx = lerpN(ax, ex, t);
          const qy = lerpN(ay, ey, t);
          g.moveTo(qx, qy)
            .lineTo(qx + sgn * 8, qy - 7)
            .stroke({ color: T.cane, width: 2, cap: 'round' });
        }
      }
    } else {
      const ns = 3 + Math.floor(hash01(id, 220) * 4);
      for (let q = 0; q < ns; q++) {
        const u = hash01(id, 221 + q) * len;
        const sl = 30 + 60 * hash01(id, 230 + q);
        const [sx, sy] = at(u, depth * 0.3);
        const lean = (hash01(id, 240 + q) - 0.5) * 0.6;
        const dx = along ? lean : nx;
        const dy = along ? (ny < 0 ? -1 : 1) : lean;
        const tx = sx + dx * sl + wind(sx, clock, q) * 2;
        const ty = sy + dy * sl;
        g.moveTo(sx, sy).lineTo(tx, ty).stroke({ color: T.stem, width: 2, cap: 'round', alpha: 0.85 });
        g.moveTo(lerpN(sx, tx, 0.6), lerpN(sy, ty, 0.6))
          .lineTo(lerpN(sx, tx, 0.6) + dy * 10, lerpN(sy, ty, 0.6) - dx * 10 - 6)
          .stroke({ color: T.stem, width: 1.5, cap: 'round', alpha: 0.85 });
      }
    }
    // The barbs: straight spikes, hooks (the tip bent along the strip) or pairs splayed from one base.
    let u = 6 + hash01(id, 90) * 10;
    let k = 0;
    while (u < len - 4) {
      const r1 = hash01(id, k * 5 + 100);
      const r2 = hash01(id, k * 5 + 101);
      const [bx, by] = at(u, depth * 0.3);
      const pale = k % 3 !== 1;
      const one = (spread: number, blen: number, base: number, hook: number): void => {
        // Direction: out, turned by the spread (along the strip).
        const ax = along ? spread : nx;
        const ay = along ? (ny < 0 ? -1 : 1) : spread;
        const n = Math.hypot(ax, ay);
        const dx = ax / n;
        const dy = ay / n;
        const px = -dy;
        const py = dx;
        // A hook's tip bends sideways over its last third.
        const tx = bx + dx * blen + px * hook;
        const ty = by + dy * blen + py * hook;
        const mx = bx + dx * blen * 0.65;
        const my = by + dy * blen * 0.65;
        g.poly([
          bx + px * base,
          by + py * base,
          mx + px * base * 0.4,
          my + py * base * 0.4,
          tx,
          ty,
          bx - px * base,
          by - py * base,
        ]).fill(T.barbDark);
        g.poly([
          bx + dx * blen * 0.35 + px * base * 0.55,
          by + dy * blen * 0.35 + py * base * 0.55,
          tx,
          ty,
          bx + dx * blen * 0.35 - px * base * 0.3,
          by + dy * blen * 0.35 - py * base * 0.3,
        ]).fill(pale ? T.bone : T.rust);
        // The warm rim on the barb's lit edge.
        g.moveTo(bx + dx * blen * 0.3 + px * base * 0.6, by + dy * blen * 0.3 + py * base * 0.6)
          .lineTo(tx, ty)
          .stroke({ color: T.rim, width: 1.2, alpha: 0.6 });
      };
      if (barbK === 'pair') {
        one(-0.45 + (r2 - 0.5) * 0.3, (22 + 12 * r1) * 0.85, 4 + 3 * r2, 0);
        one(0.45 + (r2 - 0.5) * 0.3, (22 + 12 * r1) * 0.8, 4 + 3 * r2, 0);
      } else if (barbK === 'hook') {
        one((r2 - 0.5) * 0.5, 26 + 14 * r1, 5 + 4 * r2, (k % 2 ? 1 : -1) * (6 + 6 * r1));
      } else one((r2 - 0.5) * 0.9, 24 + 16 * r1, 5 + 4 * r2, 0);
      u += (barbK === 'pair' ? 26 : 18) + 16 * hash01(id, k * 5 + 102);
      k++;
    }
    // A long run's warm glints on its barbs: the danger reads in the dark.
    if (long) {
      const ng = Math.max(2, Math.round(len / T.glintEvery));
      for (let q = 0; q < ng; q++) {
        const u = ((q + 0.2 + 0.6 * hash01(id, 800 + q)) * len) / ng;
        const [gx, gy] = at(u, depth * 0.3 + 18 + 14 * hash01(id, 820 + q));
        const tw = 0.7 + 0.3 * Math.sin(clock * (1.6 + hash01(id, 840 + q)) + q * 1.7);
        g.circle(gx, gy, 2.4).fill({ color: T.glint, alpha: 0.95 * tw });
        glow.add(gx, gy, 26, T.rim, 0.4 * tw);
      }
    }
    // A faint warm glow along the strip, so it reads against any back.
    const nGlow = Math.max(1, Math.round(len / 120));
    for (let q = 0; q < nGlow; q++) {
      const [gx, gy] = at(((q + 0.5) * len) / nGlow, depth * 0.8);
      const rr = Math.min(70, len / nGlow / 1.6 + 20);
      glow.add(gx, gy, along ? rr : 30, T.rim, 0.1 + 0.03 * Math.sin(clock * 1.3 + q), along ? 30 : rr);
    }
  }

  /**
   * A bounce cap in the wood (canopy review r2 #7): a fat dome of fungus, dark on top with pale gills under its lip
   * and cyan glow spots, a curved stalk rooted down into the wood. It breathes; a bounce squashes it and flashes.
   */
  private cap(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    w: number,
    h: number,
    sq: number,
    clock: number,
    t: number | undefined,
    id: string,
  ): void {
    const C = KIT.cap;
    const cx = x + w / 2;
    const breathe = 1 + 0.015 * Math.sin(clock * 1.3 + hash01(id, 1) * 6);
    const rx = w * 0.62 * (1 + sq * 0.18) * breathe;
    const top = y - h * 0.15 + sq * 8;
    const lip = y + h * 0.75 + sq * 4;
    const lean = (hash01(id, 2) - 0.5) * 30;
    // The stalk: tapered, curved, flaring into the wood below.
    // (Short: it roots into the top under it; the wood hides the rest.)
    const sb = y + h + 26;
    g.moveTo(cx - w * 0.1, lip)
      .bezierCurveTo(
        cx - w * 0.14 + lean * 0.3,
        lip + 70,
        cx - w * 0.2 + lean,
        sb - 60,
        cx - w * 0.3 + lean,
        sb,
      )
      .lineTo(cx + w * 0.26 + lean, sb)
      .bezierCurveTo(cx + w * 0.14 + lean, sb - 60, cx + w * 0.1 + lean * 0.3, lip + 70, cx + w * 0.09, lip)
      .closePath()
      .fill(C.stalk);
    g.moveTo(cx + w * 0.02, lip + 10)
      .bezierCurveTo(
        cx + w * 0.04 + lean * 0.3,
        lip + 70,
        cx + w * 0.06 + lean,
        sb - 60,
        cx + w * 0.1 + lean,
        sb,
      )
      .stroke({ color: C.stalkLit, width: 3, alpha: 0.45 });
    // Under the lip: the gills, glowing faintly.
    g.ellipse(cx, lip - 2, rx * 0.94, h * 0.32).fill(C.gill);
    for (let k = -6; k <= 6; k++) {
      const gx = cx + (k / 6.5) * rx * 0.86;
      g.moveTo(cx + (k / 6.5) * rx * 0.2, lip + h * 0.18).lineTo(gx, lip - 2);
    }
    g.stroke({ color: C.gillLit, width: 1.6, alpha: 0.55 });
    glow.add(cx, lip + 6, rx * 1.1, C.glow, 0.16 + 0.1 * sq, h * 0.5);
    // The dome: a dark body, a lit crown, a pale rim along the lip.
    const domeH = h * 0.95 * (1 - sq * 0.3);
    g.moveTo(cx - rx, lip)
      .bezierCurveTo(cx - rx * 1.02, lip - domeH * 0.75, cx - rx * 0.55, top, cx, top)
      .bezierCurveTo(cx + rx * 0.55, top, cx + rx * 1.02, lip - domeH * 0.75, cx + rx, lip)
      .quadraticCurveTo(cx, lip + h * 0.22, cx - rx, lip)
      .fill(C.top);
    g.ellipse(cx - rx * 0.12, top + domeH * 0.32, rx * 0.62, domeH * 0.3).fill({
      color: C.topMid,
      alpha: 0.75,
    });
    g.ellipse(cx - rx * 0.22, top + domeH * 0.2, rx * 0.34, domeH * 0.13).fill({
      color: C.topLit,
      alpha: 0.5,
    });
    g.moveTo(cx - rx * 0.96, lip - 2).quadraticCurveTo(cx, lip + h * 0.2, cx + rx * 0.96, lip - 2);
    g.stroke({ color: C.rim, width: 3, alpha: 0.7 });
    // Glow spots: the cyan of the wood's living light (art direction: bioluminescence), brighter as it is struck.
    const flash = t === undefined ? 0 : Math.exp(-t * 6);
    for (let k = 0; k < 7; k++) {
      const u = hash01(id, 10 + k);
      const v = hash01(id, 20 + k);
      const px = cx + (u - 0.5) * rx * 1.5;
      const py = top + domeH * (0.18 + 0.55 * v) * (1 - Math.abs(u - 0.5) * 0.6);
      const r = 3 + 5 * hash01(id, 30 + k);
      g.ellipse(px, py, r, r * 0.7).fill({ color: C.spot, alpha: 0.85 });
      glow.add(px, py, r * 4, C.glow, 0.22 + 0.5 * flash + 0.05 * Math.sin(clock * 2 + k));
    }
    glow.add(cx, top + domeH * 0.5, rx * 1.6, C.glow, 0.08 + 0.3 * flash, domeH * 1.1);
  }

  /**
   * A tall gate in the wood (the den's root gate, review r2 #3): a dark arch in the wood barred by woven roots, thick
   * posts either side and a lintel root over it, moonlight seeping through the weave from beyond. Opening, the roots
   * draw up into the lintel and the light pours out.
   */
  /**
   * The taproot's top half (the Canopy r14, `rubble-root`): left hanging from the roof once the collapse snapped it, a
   * twisted bundle of strands thinning down to a splintered break, the splinters pale where they tore.
   */
  private brokenRoot(g: Graphics, x: number, y: number, w: number, h: number, a: number, id: string): void {
    if (a <= 0.01) return;
    const cx = x + w / 2;
    const h1 = (k: number): number => hash01(id, k);
    for (let k = 0; k < 4; k++) {
      const ph = k * 1.7 + h1(k) * 2;
      const pts: number[] = [];
      const back: number[] = [];
      const end = h * (0.82 + 0.18 * h1(k + 10));
      for (let q = 0; q <= 14; q++) {
        const v = q / 14;
        const yy = y - 30 + (end + 30) * v;
        const wd = (w * 0.34 + 10) * (1 - 0.55 * v) * (k === 0 ? 1.4 : 1);
        const xx = cx + Math.sin(v * 5 + ph) * w * 0.22 + (k - 1.5) * w * 0.14 * (1 - v);
        pts.push(xx - wd / 2, yy);
        back.unshift(xx + wd / 2, yy);
      }
      g.poly([...pts, ...back]).fill({
        color: k === 0 ? 0x0e0a07 : mix(0x140e0a, 0x2a1f16, h1(k + 20)),
        alpha: a,
      });
      // A dull lit edge on the moon's side.
      g.poly(pts, false).stroke({ color: 0x4a3a2c, width: 2, alpha: 0.6 * a });
    }
    // The break: splinters, torn pale.
    for (let k = 0; k < 7; k++) {
      const sx = cx + (h1(k + 30) - 0.5) * w * 0.9;
      const sy = y + h * (0.78 + 0.12 * h1(k + 40));
      const len = 18 + 36 * h1(k + 50);
      const ang = Math.PI / 2 + (h1(k + 60) - 0.5) * 0.8;
      g.moveTo(sx, sy)
        .lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len)
        .stroke({ color: k % 2 ? 0x8a7458 : 0x2a1f16, width: 3 + 3 * h1(k + 70), cap: 'round', alpha: a });
    }
  }

  /**
   * The collapse's rubble (the Canopy r12, moment 7's slope): a heap of earth clods and broken roots filling the gate's
   * rect, its top lumpy and dusted pale (it is walked), dropping in from above as it shuts (`fall` 1 -> 0).
   */
  /**
   * The collapse's rubble (the Canopy r12 moment 7's slope, redrawn r13): the rubble gates' steps as ONE heap of earth,
   * never their boxes: a near-black body whose risers slump into diagonals, clods only in its outer band, broken roots
   * out of it, a dusty walked lip on each step (moonlit once the roof's shaft is open). Each step drops in from above
   * as it shuts (`fall` 1 -> 0).
   */
  private rubbleHeap(
    g: Graphics,
    steps: Array<{ x: number; y: number; w: number; h: number; fall: number; id: string }>,
    lit: boolean,
  ): void {
    const S = [...steps].sort((p, q) => p.x - q.x);
    const id = S[0]?.id ?? 'rubble';
    const h1 = (k: number): number => hash01(id, k);
    const drop = (st: { fall: number }): number => st.fall * st.fall * 260;
    const bottom = Math.max(...S.map((st) => st.y + st.h)) + 12;
    // The outline: up the first step's slumped west foot, then each top, each riser leaning back into the step below.
    const surf: number[] = [];
    let k = 0;
    const first = S[0] as (typeof S)[number];
    surf.push(first.x - 70, bottom - 12);
    S.forEach((st, i) => {
      const top = st.y - drop(st);
      const prevTop = i === 0 ? bottom - 12 : (S[i - 1] as (typeof S)[number]).y - drop(S[i - 1] as never);
      // The riser: from the step below's top a little before this one, bulging, up to this top.
      const r0x = st.x - (i === 0 ? 60 : 20);
      for (let q = 1; q <= 4; q++) {
        const v = q / 4;
        surf.push(
          r0x + (st.x + 10 - r0x) * v + Math.sin(Math.PI * v) * -10 + (h1(k++) - 0.5) * 8,
          prevTop + (top - prevTop) * v,
        );
      }
      const n = Math.max(3, Math.round(st.w / 24));
      for (let q = 1; q <= n; q++)
        surf.push(st.x + 10 + ((st.w - 10) * q) / n, top + 2 + (h1(k++) - 0.5) * 9);
    });
    const last = S[S.length - 1] as (typeof S)[number];
    // (Its east side slumps too: a vertical edge read as a box, the r14 slab most of all.)
    const lastTop = last.y - drop(last);
    const body = [
      ...surf,
      last.x + last.w + 14,
      lastTop + 26,
      last.x + last.w + 40,
      lastTop + (bottom - lastTop) * 0.55,
      last.x + last.w + 70,
      bottom,
      first.x - 70,
      bottom,
    ];
    const a = Math.max(...S.map((st) => 1 - st.fall));
    if (a <= 0.01) return;
    g.poly(body).fill({ color: 0x0b0806, alpha: a });
    // Clods along the outer band (just inside the surface), earth tones, overlapping; lit shoulders.
    const nP = surf.length / 2;
    for (let q = 0; q < nP - 1; q++) {
      const x0 = surf[q * 2] as number;
      const y0 = surf[q * 2 + 1] as number;
      const x1 = surf[q * 2 + 2] as number;
      const y1 = surf[q * 2 + 3] as number;
      const len = Math.hypot(x1 - x0, y1 - y0);
      for (let t = 0; t < len; t += 16) {
        const u = t / Math.max(1, len);
        const r = 7 + 9 * h1(1000 + q * 31 + t);
        const cx = x0 + (x1 - x0) * u + 4;
        const cy = y0 + (y1 - y0) * u + r * 0.7 + 3;
        g.ellipse(cx, cy, r, r * 0.66).fill({
          color: mix(0x14100c, 0x2c2219, h1(2000 + q * 7 + t)),
          alpha: a,
        });
        g.ellipse(cx - r * 0.25, cy - r * 0.32, r * 0.5, r * 0.16).fill({
          color: lit ? 0x8ea4c4 : 0x3a2e22,
          alpha: (lit ? 0.45 : 0.6) * a,
        });
        // A few deeper in, darker (the band fades into the core).
        if (h1(3000 + q * 13 + t) < 0.4)
          g.ellipse(cx + 6, cy + r * 1.4, r * 0.8, r * 0.5).fill({ color: 0x120e0a, alpha: a });
      }
    }
    // Broken roots out of the heap, splintered ends lit.
    S.forEach((st, i) => {
      if (i % 2) return;
      const ang = -Math.PI * (0.62 + 0.25 * h1(400 + i));
      const bx0 = st.x + 20 + 40 * h1(410 + i);
      const by0 = st.y - drop(st) + 40 + 30 * h1(420 + i);
      const len = 50 + 50 * h1(430 + i);
      const ex = bx0 + Math.cos(ang) * len;
      const ey = by0 + Math.sin(ang) * len;
      g.moveTo(bx0, by0).lineTo(ex, ey).stroke({ color: 0x241a12, width: 8, cap: 'round', alpha: a });
      g.circle(ex, ey, 3).fill({ color: lit ? 0xb8cce6 : 0x8a7458, alpha: 0.8 * a });
    });
    // The taproot came down with it (the Canopy r14's heap against the east wall): broken trunks of it jutting out of
    // the heap's top, splintered and pale where they tore.
    for (const st of S) {
      if (st.h < 300) continue;
      const top = st.y - drop(st);
      for (let k = 0; k < 3; k++) {
        // (Leaning out over its west slope, short: upright stubs on the walked top read as posts to stand on.)
        const bx = st.x + st.w * (0.04 + 0.12 * k + 0.06 * h1(700 + k));
        const by = top + 40 + 70 * k + 30 * h1(710 + k);
        const ang = -Math.PI * (0.78 + 0.1 * h1(720 + k));
        const len = 50 + 40 * h1(730 + k);
        const wd = 34 - 8 * k;
        const ex = bx + Math.cos(ang) * len;
        const ey = by + Math.sin(ang) * len;
        g.moveTo(bx, by).lineTo(ex, ey).stroke({ color: 0x140e09, width: wd, cap: 'butt', alpha: a });
        g.moveTo(bx + 4, by)
          .lineTo(ex + 4, ey)
          .stroke({ color: 0x3e3024, width: 3, alpha: 0.6 * a });
        for (let q = 0; q < 4; q++) {
          const sa = ang + (h1(740 + k * 7 + q) - 0.5) * 0.9;
          const sl = 14 + 18 * h1(750 + k * 7 + q);
          g.moveTo(ex + (q - 1.5) * wd * 0.22, ey)
            .lineTo(ex + Math.cos(sa) * sl + (q - 1.5) * wd * 0.22, ey + Math.sin(sa) * sl)
            .stroke({ color: q % 2 ? 0x8a7458 : 0x241a12, width: 4, cap: 'round', alpha: a });
        }
      }
    }
    // The walked lips: dust along each top (moonlit once the shaft is open).
    S.forEach((st, i) => {
      const top = st.y - drop(st);
      const lip: number[] = [];
      const n = Math.max(3, Math.round(st.w / 20));
      for (let q = 0; q <= n; q++)
        lip.push(st.x + 6 + ((st.w - 6) * q) / n, top - 1 + (h1(500 + i * 40 + q) - 0.5) * 6);
      for (let q = n; q >= 0; q--)
        lip.push(st.x + 6 + ((st.w - 6) * q) / n, top + 6 + 3 * h1(600 + i * 40 + q));
      g.poly(lip).fill({ color: lit ? 0xb4c6e0 : 0x6a5c4c, alpha: (lit ? 0.7 : 0.5) * (1 - st.fall) });
    });
  }

  private rootGate(
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
    const G = KIT.gate;
    const a = 1 - fall * 0.7;
    // (The arch fades in and out with the tangle: a gate that grows shut or draws back never pops.)
    const archA = 1 - fall;
    const cx = x + w / 2;
    const R = w / 2 + 18;
    const archTop = y - 26;
    // The hole: an arch (round at the top, never a box) and the light beyond it.
    const hole: number[] = [x - 12, y + h + 4];
    for (let k = 0; k <= 16; k++) {
      const t = Math.PI + (Math.PI * k) / 16;
      hole.push(cx + Math.cos(t) * (R - 6), archTop + R + Math.sin(t) * R * 0.9);
    }
    hole.push(x + w + 12, y + h + 4);
    g.poly(hole).fill({ color: G.hole, alpha: 0.95 * archA });
    const pulse = 0.85 + 0.15 * Math.sin(clock * 0.8 + hash01(id, 1) * 6);
    glow.add(cx, y + h * 0.55, w * 0.9, G.light, (0.24 + 0.5 * fall) * pulse, h * 0.6);
    glow.add(cx, y + h - 8, w * 1.6, G.light, 0.12 + 0.3 * fall, 24);
    // The tangle across it (review r3 #2: even bars read as a bird-cage): roots of uneven weight grown from both sides
    // and down from the crown, crossing on the slant and sagging; opening, each draws back toward where it grew.
    const keep = 1 - fall * fall;
    const n = Math.max(5, Math.round(h / 34));
    for (let k = 0; k < n; k++) {
      const r1 = hash01(id, k + 3);
      const r2 = hash01(id, k + 77);
      const fromW = k % 2 === 0;
      const ya = y + h * (0.05 + 0.9 * r1);
      const yb = Math.min(y + h, ya + (r2 - 0.35) * h * 0.7);
      const xa = fromW ? x - 6 : x + w + 6;
      const xb = fromW ? x + w + 6 : x - 6;
      const sag = 20 + 40 * r2;
      const ex = lerp(xa, xb, keep);
      const ey = lerp(ya, yb, keep);
      if (keep < 0.05) continue;
      g.moveTo(xa, ya).quadraticCurveTo((xa + ex) / 2 + (r1 - 0.5) * 30, (ya + ey) / 2 + sag * keep, ex, ey);
      g.stroke({ color: G.root, width: 5 + 9 * r2 * (1 - 0.5 * fall), alpha: a, cap: 'round' });
      g.moveTo(xa, ya - 3).quadraticCurveTo(
        (xa + ex) / 2 + (r1 - 0.5) * 30,
        (ya + ey) / 2 + sag * keep - 3,
        ex,
        ey - 3,
      );
      g.stroke({ color: G.rootLit, width: 1.6, alpha: 0.4 * a, cap: 'round' });
    }
    // A few long roots hanging from the crown, swaying.
    for (let k = 0; k < 4; k++) {
      const r = hash01(id, k + 140);
      const sx = x + w * (0.15 + 0.7 * r);
      const len = h * (0.5 + 0.45 * hash01(id, k + 150)) * keep;
      if (len < 6) continue;
      g.moveTo(sx, archTop + 18);
      for (let s2 = 1; s2 <= 6; s2++) {
        const u = s2 / 6;
        g.lineTo(sx + Math.sin(u * 4 + r * 9) * 10 + wind(sx, clock, r) * 3 * u, archTop + 18 + len * u);
      }
      g.stroke({ color: G.root, width: 8 + r * 6, alpha: a, cap: 'round' });
    }
    // The arch: on each side two great roots twisting round each other out of a flared foot, over the top to meet in
    // a knot; lit on their moon side.
    for (const side of [-1, 1] as const) {
      for (let q = 0; q < 2; q++) {
        const ph = q * Math.PI;
        const path: Array<[number, number]> = [];
        for (let k = 0; k <= 14; k++) {
          const u = k / 14;
          // Up the side (u < 0.6), then over the crown to the middle.
          const t = u < 0.6 ? 0 : (u - 0.6) / 0.4;
          const baseX = cx + side * (R + 4);
          const px =
            u < 0.6
              ? baseX + side * 26 * (1 - u / 0.6) ** 2
              : cx + side * Math.cos((t * Math.PI) / 2) * (R + 4);
          const py =
            u < 0.6
              ? lerp(y + h + 8, archTop + R, u / 0.6)
              : archTop + R - Math.sin((t * Math.PI) / 2) * R * 0.9;
          const tw = Math.sin(u * 9 + ph) * 9;
          path.push([px + tw * (u < 0.6 ? 1 : 0.6), py + (u < 0.6 ? 0 : tw * 0.5)]);
        }
        const wd = q ? 26 : 34;
        g.moveTo(path[0]?.[0] ?? 0, path[0]?.[1] ?? 0);
        for (const [px, py] of path.slice(1)) g.lineTo(px, py);
        g.stroke({ color: G.post, width: wd, cap: 'round', join: 'round', alpha: archA });
        g.moveTo((path[0]?.[0] ?? 0) - side * 6, (path[0]?.[1] ?? 0) - 4);
        for (const [px, py] of path.slice(1)) g.lineTo(px - side * wd * 0.28, py - wd * 0.2);
        g.stroke({ color: G.rootLit, width: 2.2, alpha: 0.45 * archA, cap: 'round', join: 'round' });
      }
      // The foot: roots spreading out over the floor.
      for (let q = 0; q < 3; q++) {
        const fx = cx + side * (R + 10);
        const reach = 50 + 40 * q + 30 * hash01(id, q + (side > 0 ? 200 : 210));
        g.moveTo(fx, y + h - 30 - q * 10).quadraticCurveTo(
          fx + side * reach * 0.5,
          y + h - 6,
          fx + side * reach,
          y + h + 6,
        );
        g.stroke({ color: G.post, width: 18 - q * 4, cap: 'round', alpha: archA });
      }
    }
    // The knot where they meet, and cyan moss beads along the crown: the gate is a place, found in the dark.
    g.ellipse(cx, archTop + R * 0.1, 30, 22).fill({ color: G.post, alpha: archA });
    g.ellipse(cx - 4, archTop + R * 0.1 - 6, 14, 6).fill({ color: G.rootLit, alpha: 0.25 * archA });
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6;
      const t = Math.PI + Math.PI * u;
      const bx = cx + Math.cos(t) * (R + 22);
      const by = archTop + R + Math.sin(t) * R * 0.9 - 14;
      g.circle(bx, by, 3.5).fill({ color: KIT.cap.spot, alpha: 0.9 * archA });
      glow.add(bx, by, 18, KIT.cap.glow, (0.3 + 0.08 * Math.sin(clock * 1.7 + k)) * archA);
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

  /**
   * A flat gate in the wood (the Grove's arena roof, canopy review r7 #8: flat grey planks that popped): a mat of roots
   * grown across the hole from both sides, `grow` 0 (none) to 1 (shut). Each root reaches out of the wood on its own
   * side, thinning to its growing tip, at its own delay; rootlets hang under the mat once it has closed. Drawing back
   * is the same played in reverse.
   */
  private rootMat(
    g: Graphics,
    glow: GlowPool,
    x: number,
    y: number,
    w: number,
    h: number,
    clock: number,
    grow: number,
    id: string,
  ): void {
    const G = KIT.gate;
    if (grow <= 0) return;
    // (The dark between the roots only once they have knit: a full-width hole under a half-grown mat read as a lens.)
    const hole = smooth01((grow - 0.55) / 0.45);
    if (hole > 0)
      g.ellipse(x + w / 2, y + h * 0.55, w / 2 + 10, h * 0.5).fill({ color: G.hole, alpha: 0.85 * hole });
    const n = 5 + Math.round(w / 80);
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < n; k++) {
      const fromW = k % 2 === 0;
      const r = hash01(id, k * 7 + 1);
      const r2 = hash01(id, k * 7 + 2);
      const ya = y + h * (0.1 + 0.8 * hash01(id, k * 7 + 3));
      const yb = y + h * (0.1 + 0.8 * hash01(id, k * 7 + 4));
      const xa = fromW ? x - 30 - r * 40 : x + w + 30 + r * 40;
      const xb = fromW ? x + w + 20 + r2 * 30 : x - 20 - r2 * 30;
      const sag = (hash01(id, k * 7 + 5) - 0.4) * h * 1.1;
      const th = 8 + 18 * hash01(id, k * 7 + 6) ** 1.5;
      const amp = 5 + 12 * hash01(id, k * 7 + 9);
      const freq = 1.2 + 2.2 * hash01(id, k * 7 + 10);
      const ph = 6.28 * hash01(id, k * 7 + 11);
      // Its own share of the growth: some start late, all are across by the end.
      const d = 0.35 * hash01(id, k * 7 + 8);
      const u = smooth01((grow - d) / (1 - d));
      if (u <= 0.01) continue;
      const N = 24;
      const m = Math.max(2, Math.ceil(N * u));
      pts.length = 0;
      for (let i = 0; i <= m; i++) {
        const t = Math.min(u, i / N);
        // A sinuous root, sagging, wandering across the hole's depth (straight parallel strokes read as pipes).
        const px = lerp(xa, xb, t);
        const py =
          lerp(ya, yb, t) +
          sag * Math.sin(Math.PI * t) +
          amp * Math.sin(t * freq * 6.28 + ph) +
          Math.sin(clock * 1.3 + k + t * 4) * 1.2 * t;
        pts.push([px, py]);
      }
      // One tapered ribbon: thick where it leaves the wood, thinning to the tip (where it is growing).
      const L: number[] = [];
      const Rr: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = pts[i] as [number, number];
        const [qx, qy] = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
        const [ox, oy] = pts[Math.max(0, i - 1)] as [number, number];
        const tx = qx - ox;
        const ty = qy - oy;
        const tl = Math.hypot(tx, ty) || 1;
        const f = (1 - (i / (pts.length - 1)) * (0.85 - 0.45 * u)) * (1 + 0.15 * Math.sin(i * 1.7 + k));
        const hw = (th * f) / 2;
        L.push(px - (ty / tl) * hw, py + (tx / tl) * hw);
        Rr.push(px + (ty / tl) * hw, py - (tx / tl) * hw);
      }
      const poly = L.slice();
      for (let i = Rr.length / 2 - 1; i >= 0; i--) poly.push(Rr[i * 2] as number, Rr[i * 2 + 1] as number);
      g.poly(poly).fill({ color: 0x070d13 });
      // The moon on the upper edge, in broken lengths.
      for (let i = 1; i < pts.length; i++) {
        if (Math.sin(i * 0.9 + k * 2.1) < 0.1) continue;
        g.moveTo(Rr[(i - 1) * 2] as number, (Rr[(i - 1) * 2 + 1] as number) + 1.5).lineTo(
          Rr[i * 2] as number,
          (Rr[i * 2 + 1] as number) + 1.5,
        );
      }
      g.stroke({ color: G.rootLit, width: 1.4, alpha: 0.32, cap: 'round' });
    }
    // Rootlets under the closed mat, longer as it settles; a breath of moonlight through the weave.
    const hang = smooth01((grow - 0.6) / 0.4);
    if (hang > 0) {
      const m = Math.round(w / 26);
      for (let k = 0; k < m; k++) {
        const xx = x + (k + hash01(id, 90 + k)) * (w / m);
        const l = (12 + 50 * hash01(id, 120 + k) ** 2) * hang;
        g.moveTo(xx, y + h * 0.85).quadraticCurveTo(
          xx + 4 + wind(xx, clock, 0.4) * 2,
          y + h + l * 0.5,
          xx + (hash01(id, 150 + k) - 0.5) * 14 + wind(xx, clock, 0.4) * 4,
          y + h + l,
        );
      }
      g.stroke({ color: 0x0e1820, width: 2.6, alpha: 0.85, cap: 'round' });
      glow.add(x + w / 2, y + h * 0.5, w * 0.5, G.light, 0.1 * hang, h * 0.8);
    }
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
    if (LOOK.kit === 'wood') {
      // The wood's seal (review r5 #6: crossed diagonal strands read as a timber truss): a mat of roots grown across
      // the hole, each running on into the wood at both sides, wavy, over and under each other, of uneven weight,
      // the moon on their upper edges, rootlets hanging under; it sinks as it opens.
      const dy = fall * fall * 140;
      const yy = y + dy;
      g.ellipse(x + w / 2, yy + h * 0.55, w / 2 + 10, h * 0.62).fill({ color: 0x050a10, alpha: a });
      const n = 4 + Math.round(w / 90);
      for (let k = 0; k < n; k++) {
        const r = hash01(id, k * 7 + 1);
        const r2 = hash01(id, k * 7 + 2);
        const y0 = yy + h * (0.12 + 0.76 * hash01(id, k * 7 + 3));
        const y1 = yy + h * (0.12 + 0.76 * hash01(id, k * 7 + 4));
        const xa = x - 24 - r * 30;
        const xb = x + w + 24 + r2 * 30;
        const sag = (hash01(id, k * 7 + 5) - 0.3) * h * 0.5;
        const th = 9 + 14 * hash01(id, k * 7 + 6);
        const path = () =>
          g
            .moveTo(xa, y0)
            .bezierCurveTo(
              x + w * (0.2 + 0.2 * r),
              y0 + sag,
              x + w * (0.6 + 0.2 * r2),
              y1 - sag * 0.6,
              xb,
              y1,
            );
        path();
        g.stroke({ color: 0x0e1820, width: th + 4, alpha: a, cap: 'round' });
        path();
        g.stroke({ color: 0x1c2a36, width: th, alpha: a, cap: 'round' });
        g.moveTo(xa, y0 - th * 0.3).bezierCurveTo(
          x + w * (0.2 + 0.2 * r),
          y0 + sag - th * 0.3,
          x + w * (0.6 + 0.2 * r2),
          y1 - sag * 0.6 - th * 0.3,
          xb,
          y1 - th * 0.3,
        );
        g.stroke({ color: 0x4a6274, width: 1.6, alpha: 0.5 * a, cap: 'round' });
      }
      // Rootlets under the mat.
      for (let k = 0; k < Math.round(w / 22); k++) {
        const xx = x + (k + hash01(id, 90 + k)) * (w / Math.round(w / 22));
        const l = 10 + 46 * hash01(id, 120 + k) ** 2;
        g.moveTo(xx, yy + h * 0.85).quadraticCurveTo(
          xx + 4,
          yy + h + l * 0.5,
          xx + (hash01(id, 150 + k) - 0.5) * 14,
          yy + h + l,
        );
      }
      g.stroke({ color: 0x0e1820, width: 2.4, alpha: 0.8 * a, cap: 'round' });
      return;
    }
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

  /**
   * The wood's cover (a wood room with `art.pieces`): a clump of leaves in front of the hidden space, like the
   * canopy's own clumps (no box: overlapping leaf blobs whose edge breaks into single leaves that stir).
   */
  private leafCover(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    k: number,
    id: string,
    clock: number,
  ): void {
    const L = KIT.leafCover;
    // A dark core inset from the edge (so nothing shows through), then leaves over all of it, denser at the rim.
    g.roundRect(x + 18, y + 14, w - 36, h - 28, Math.min(w, h) * 0.4).fill({
      color: L.body,
      alpha: 0.98 * k,
    });
    const inner = Math.round((w * h) / 900);
    for (let c = 0; c < inner; c++) {
      const px = x + 10 + hash01(id, c + 900) * (w - 20);
      const py = y + 8 + hash01(id, c + 1900) * (h - 16);
      const a = hash01(id, c + 2900) * Math.PI * 2 + Math.sin(clock * 0.6 + c * 0.3) * 0.06;
      const len = 22 + 18 * hash01(id, c + 3900);
      const wd = len * 0.42;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tone = hash01(id, c + 4900);
      g.poly([
        px,
        py,
        px + ca * len * 0.5 - sa * wd,
        py + sa * len * 0.5 + ca * wd,
        px + ca * len,
        py + sa * len,
        px + ca * len * 0.5 + sa * wd,
        py + sa * len * 0.5 - ca * wd,
      ]).fill({ color: tone < 0.3 ? L.mid : L.body, alpha: 0.98 * k });
    }
    // Single leaves round the edge, stirring a little: the clump's outline is leaves, never a line.
    const n = Math.round((w + h) / 14);
    for (let c = 0; c < n; c++) {
      const u = hash01(id, c + 200);
      const side = c % 4;
      const px = side < 2 ? x + u * w : side === 2 ? x - 6 : x + w + 6;
      const py = side === 0 ? y - 6 : side === 1 ? y + h + 4 : y + u * h;
      const a = hash01(id, c + 300) * Math.PI * 2 + Math.sin(clock * 0.9 + c) * 0.15;
      const len = 14 + 14 * hash01(id, c + 400);
      const wd = len * 0.38;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      g.poly([
        px,
        py,
        px + ca * len * 0.5 - sa * wd,
        py + sa * len * 0.5 + ca * wd,
        px + ca * len,
        py + sa * len,
        px + ca * len * 0.5 + sa * wd,
        py + sa * len * 0.5 - ca * wd,
      ]).fill({
        color: hash01(id, c + 500) < 0.2 ? L.lit : L.body,
        alpha: 0.95 * k,
      });
    }
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
    if (LOOK.kit === 'wood') {
      this.leafCover(g, x, y, w, h, k, id, clock);
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

/** Smoothstep of t clamped to 0..1. */
function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerpN(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
