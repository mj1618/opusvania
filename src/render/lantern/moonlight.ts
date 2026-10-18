/**
 * Real moonlight getting into the giant (proto-1 §8 best moment 1: "from silver quiet into a hall of warm lamps"):
 * a shaft down from every moon-hole (`marks.moonholes`; as wide as the ceiling exit it sits in, else a crack) to the
 * first top under it. Silver against the amber, the contrast the hall is built on.
 *
 *   beam    a soft trapezoid of light, rays striated across it, brightest at the opening, behind the terrain and
 *           her (`airBack`); a fainter veil of it over everything (`air`) so the light stands in the air
 *   motes   dust drifting in the beam, lit only inside it
 *   pool    where it lands: a pool of silver on the floor and a point light, so the terrain under it turns silver
 *
 * A room with a boss keeps the moon-hole nearest its hub plugged until its fight's `bossCue moonhole` (P3), and
 * open for good once the boss flag is saved. Render only.
 */
import { type Container, MeshSimple, Sprite, Texture } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { CameraView, SimView } from '../contract';
import { shareTexture } from '../lifecycle';
import type { LightRegistry } from '../lights';
import type { LayerTree } from '../scene/layer-tree';
import { softTexture } from '../scene/lib/bg-bake';
import { landingY, moonHoles } from '../scene/lib/lr-back';
import type { LanternBand } from '../scene/lib/room-look';
import type { GlowPool } from './glow';

export const MOON = {
  color: 0xb8d0f4,
  core: 0xe4eeff,
  /** Beam alpha behind (per band) and the veil over everything (share of it). */
  alpha: { hall: 0.62, cache: 0.5, roots: 0.42, night: 0.3 } as Record<LanternBand, number>,
  veil: 0.28,
  /** How much wider the beam is where it lands, and its lean (px across per px down). */
  spread: 1.45,
  slant: 0.1,
  /** Dust motes per 100 px of beam width. */
  motes: 14,
  /** The pool on the floor and its point light: radius per px of width, the least, intensity. */
  pool: 1.5,
  poolMin: 240,
  light: 1.0,
  /** Silver lying on the backdrop behind the shaft (far2, mid): alpha each. */
  wash: { far: 0.2, mid: 0.14 },
} as const;

let beamTex: Texture | null = null;

/** The beam: across it a soft bell with rays striated in it; down it, brightest at the top. */
function beamTexture(): Texture {
  if (beamTex) return beamTex;
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c2 = canvas.getContext('2d');
  if (c2) {
    const img = c2.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const down = (1 - 0.6 * v) * Math.min(1, v * 14 + 0.3);
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1);
        const bell = Math.exp(-(((u - 0.5) / 0.3) ** 4));
        // Rays: a few soft stripes along the beam, drifting apart toward the bottom.
        const ray =
          0.72 +
          0.18 * Math.sin((u - 0.5) * (18 + 6 * v) + 1.3) +
          0.1 * Math.sin((u - 0.5) * (41 - 9 * v) + 0.4);
        const a = Math.max(0, Math.min(1, bell * ray * down));
        const i = (y * W + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    c2.putImageData(img, 0, 0);
  }
  beamTex = shareTexture(Texture.from(canvas));
  return beamTex;
}

interface Shaft {
  x: number;
  y: number;
  w: number;
  land: number;
  back: MeshSimple;
  front: MeshSimple;
  /** The boss's moon-hole: shut until its cue. */
  boss: boolean;
  open: number;
  id: string;
  /** The wash on the backdrop: sprite, parallax. */
  wash: Array<{ s: Sprite; f: number; a: number }>;
}

export class Moonlight {
  private readonly shafts: Shaft[] = [];
  private flood = -1;

  constructor(
    scene: SimView['scene'],
    private readonly layers: LayerTree,
    private readonly lights: LightRegistry,
    private readonly band: LanternBand,
  ) {
    const room = scene;
    const holes = moonHoles(room);
    const hub = (room.boss as { hub?: { x: number } } | undefined)?.hub;
    let bossHole = -1;
    if (hub) {
      let best = Number.POSITIVE_INFINITY;
      holes.forEach((h, i) => {
        if (Math.abs(h.x - hub.x) < best) {
          best = Math.abs(h.x - hub.x);
          bossHole = i;
        }
      });
    }
    const tex = beamTexture();
    holes.forEach((h, i) => {
      const land = landingY(room, h.x, h.y);
      const mk = (parent: Container, alpha: number): MeshSimple => {
        const m = new MeshSimple({
          texture: tex,
          vertices: new Float32Array(8),
          uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });
        m.tint = MOON.color;
        m.blendMode = 'add';
        m.alpha = alpha;
        parent.addChild(m);
        return m;
      };
      const a = MOON.alpha[band];
      const s: Shaft = {
        x: h.x,
        y: h.y,
        w: h.w,
        land,
        back: mk(layers.get('airBack'), a),
        front: mk(layers.air, a * MOON.veil),
        boss: i === bossHole,
        open: i === bossHole ? 0 : 1,
        id: `lr-moon-${i}`,
        wash: [],
      };
      for (const [parent, f, wa] of [
        [layers.far[2], 0.42, MOON.wash.far],
        [layers.mid, 0.68, MOON.wash.mid],
      ] as const) {
        if (!parent) continue;
        const w = new Sprite(softTexture());
        w.anchor.set(0.5, 0.15);
        w.setSize(Math.max(160, h.w * 1.6), (land - h.y) * 1.4 + 200);
        w.tint = MOON.color;
        w.blendMode = 'add';
        w.alpha = 0;
        parent.addChild(w);
        s.wash.push({ s: w, f, a: wa * Math.min(1, Math.max(0.35, h.w / 220)) });
      }
      this.place(s);
      this.shafts.push(s);
    });
  }

  /** The trapezoid: the opening's width at the top, wider and leaning where it lands. */
  private place(s: Shaft): void {
    const len = s.land - s.y;
    const top = s.y - 20;
    const wb = s.w * MOON.spread;
    const dx = len * MOON.slant;
    const v = [
      s.x - s.w / 2,
      top,
      s.x + s.w / 2,
      top,
      s.x + dx + wb / 2,
      s.land + 8,
      s.x + dx - wb / 2,
      s.land + 8,
    ];
    for (const m of [s.back, s.front]) {
      m.autoUpdate = false;
      m.vertices = new Float32Array(v);
      m.geometry.getBuffer('aPosition').update();
    }
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      const ev = e as unknown as { type: string; cue?: string };
      if (ev.type === 'bossCue' && ev.cue === 'moonhole') this.flood = 0;
      if (ev.type === 'spawn' && events.some((o) => o.type === 'roomEnter')) this.flood = -1;
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView, glow: GlowPool, front: GlowPool): void {
    const spec = sim.scene.boss;
    const down = !!spec && sim.save.flags.includes(spec.flag);
    if (this.flood >= 0) this.flood += dt;
    const halfW = cam.w / 2 / cam.zoom + 400;
    for (const s of this.shafts) {
      s.open = s.boss ? (down ? 1 : this.flood >= 0 ? Math.min(1, this.flood / 1.2) : 0) : 1;
      const breathe = 0.9 + 0.07 * Math.sin(clock * 0.5 + s.x * 0.01) + 0.03 * Math.sin(clock * 1.7 + s.x);
      // A crack's thread of light is fainter than a wide opening's flood.
      const a = MOON.alpha[this.band] * s.open * breathe * Math.min(1, Math.max(0.35, s.w / 220));
      s.back.alpha = a;
      s.front.alpha = a * MOON.veil;
      s.back.visible = s.front.visible = s.open > 0.001;
      // The wash behind it on the backdrop, where the wall behind the hole is from this camera.
      const an = this.layers.anchor;
      for (const w of s.wash) {
        w.s.position.set(s.x - (1 - w.f) * (cam.x - an.x), s.y - (1 - w.f) * (cam.y - an.y));
        w.s.alpha = w.a * s.open * breathe;
      }
      const len = s.land - s.y;
      const dx = len * MOON.slant;
      const lx = s.x + dx;
      const r = Math.max(MOON.poolMin, s.w * MOON.pool);
      const near = Math.abs(lx - cam.x) < halfW + r;
      if (s.open > 0.001 && near) {
        // The pool where it lands, and the light that turns the floor silver.
        const wb = s.w * MOON.spread;
        glow.add(lx, s.land - 4, wb * 0.62, MOON.core, 0.2 * s.open * breathe, 22);
        glow.add(lx, s.land - 30, wb * 0.5, MOON.color, 0.1 * s.open, 60);
        const l = this.lights.get(s.id);
        const k = MOON.light * s.open * breathe;
        if (l) {
          l.x = lx;
          l.y = s.land - 60;
          l.radius = r;
          l.intensity = k;
        } else this.lights.set(s.id, { x: lx, y: s.land - 60, radius: r, color: MOON.color, intensity: k });
        // Dust in the beam: lit only inside it, drifting down slowly, a few lifting.
        const n = Math.round((s.w / 100) * MOON.motes);
        for (let j = 0; j < n; j++) {
          const h1 = ((j * 0.618034) % 1) as number;
          const h2 = ((j * 0.414214 + 0.3) % 1) as number;
          const sp = 0.012 + 0.02 * h2;
          const t = (((h1 + clock * sp * (h2 < 0.2 ? -1 : 1)) % 1) + 1) % 1;
          const wAt = s.w + (s.w * MOON.spread - s.w) * t;
          const across = (h2 - 0.5) * 0.8 + 0.12 * Math.sin(clock * (0.3 + h1) + j);
          const mx = s.x + dx * t + across * wAt;
          const my = s.y + len * t;
          const tw = 0.6 + 0.4 * Math.sin(clock * (1.3 + h2 * 2) + j * 1.7);
          front.add(
            mx,
            my,
            3 + 3 * h1,
            MOON.core,
            0.5 * s.open * tw * Math.sin(Math.PI * t) * (1 - Math.abs(across) * 1.6),
          );
        }
      } else if (this.lights.get(s.id)) this.lights.remove(s.id);
    }
  }

  destroy(): void {
    for (const s of this.shafts) {
      this.lights.remove(s.id);
      s.back.destroy();
      s.front.destroy();
      for (const w of s.wash) w.s.destroy();
    }
  }
}
