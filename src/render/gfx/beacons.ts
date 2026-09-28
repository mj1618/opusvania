/**
 * Beacons (north-star §2.2, §2.3 "beacon in frame"): landmark entities flagged `beacon` draw a
 * code-drawn silhouette in the backdrop of every room near them, at their true world position and
 * a parallax depth, so the player can orient from the neighbouring rooms. Parallax-correct: a
 * beacon of depth f sits at screen `VIEW_W/2 + (bx - viewCentreX) * f * zoom`, so it lines up with
 * its real footprint when the view is centred on it, and drifts at f x the camera speed elsewhere.
 * Drawn live (few shapes), in front of the far layers and behind the mid layer; unlit, like the
 * backdrop, with their own glow so they read at night.
 */
import { Container, Graphics } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../camera/index';
import { desaturate, mix } from './color';
import type { Palette } from './palette';
import { allBeacons, type Beacon } from './worldspace';

interface Placed {
  b: Beacon;
  node: Container;
}

export class BeaconLayer {
  readonly container = new Container({ label: 'beacons' });
  private placed: Placed[] = [];

  build(p: Palette): void {
    for (const c of this.container.removeChildren()) c.destroy({ children: true });
    // Farthest first, so nearer beacons draw over farther ones.
    const bs = [...allBeacons()].sort((a, b) => a.depth - b.depth);
    this.placed = bs.map((b) => {
      const node = new Container({ label: `beacon:${b.name}` });
      const g = new Graphics();
      const glow = new Graphics();
      glow.blendMode = 'add';
      drawBeacon(g, glow, b, p);
      node.addChild(g, glow);
      this.container.addChild(node);
      return { b, node };
    });
  }

  get count(): number {
    return this.placed.length;
  }

  /** Beacons on screen last frame (debug API / tests). */
  visible(): string[] {
    return this.placed.filter((q) => q.node.visible).map((q) => q.b.name);
  }

  /** `cx, cy`: view centre in world px (not room px). */
  place(cx: number, cy: number, zoom: number): void {
    for (const { b, node } of this.placed) {
      const f = b.depth;
      const bx = b.rect.x + b.rect.w / 2;
      const by = b.rect.y + b.rect.h / 2;
      const sx = VIEW_W / 2 + ((bx - cx) * f - b.rect.w / 2) * zoom;
      const sy = VIEW_H / 2 + ((by - cy) * f - b.rect.h / 2) * zoom;
      const w = b.rect.w * zoom;
      const h = b.rect.h * zoom;
      const halo = 0.6 * Math.max(w, h);
      node.visible = sx + w + halo > 0 && sx - halo < VIEW_W && sy + h + halo > 0 && sy - halo < VIEW_H;
      node.position.set(Math.round(sx), Math.round(sy));
      node.scale.set(zoom);
    }
  }
}

/** Draws a beacon in local px (0..w, 0..h of its footprint): silhouette in `g`, lights in `glow`. */
function drawBeacon(g: Graphics, glow: Graphics, b: Beacon, p: Palette): void {
  const { w, h } = b.rect;
  // Depth fog like the backdrop layers (0.42 ~ far2), a touch darker so it stands off the skyline.
  const fog = Math.min(0.75, 0.62 * (1 - b.depth) + 0.08);
  const body = desaturate(mix(mix(p.silhouette, 0x000000, 0.25), p.fog, fog), 0.2);
  const trim = desaturate(mix(p.rimSide, p.fog, fog), 0.2);
  const light = mix(p.lamp, 0xffffff, 0.15);
  // A soft halo so the beacon reads as a place even when it is small.
  const cx = w / 2;
  const halo = 14;
  for (let i = 0; i < halo; i++) {
    const r = Math.max(w, h) * (0.75 - (i * 0.6) / halo);
    glow.ellipse(cx, h * 0.35, r, r * 0.8).fill({ color: p.glow, alpha: 0.016 });
  }
  switch (b.kind) {
    case 'bell': {
      // A clock-and-bell tower: shaft, belfry with a backlit arch and a dark bell, spire, clock.
      const tw = w * 0.46;
      const tx = (w - tw) / 2;
      const belfryY = h * 0.2;
      g.rect(tx, belfryY, tw, h - belfryY).fill(body);
      g.rect(tx - w * 0.05, belfryY, tw + w * 0.1, h * 0.025).fill(trim);
      g.rect(tx - w * 0.04, h * 0.5, tw + w * 0.08, h * 0.018).fill(trim);
      g.poly([tx - w * 0.06, belfryY, cx, 0, tx + tw + w * 0.06, belfryY]).fill(body);
      // Belfry arch, lit from inside (the lamp behind the bell).
      const ow = tw * 0.6;
      const oy = belfryY + h * 0.04;
      const oh = h * 0.17;
      glow.rect(cx - ow / 2, oy + ow / 2, ow, oh - ow / 2).fill({ color: light, alpha: 0.55 });
      glow.circle(cx, oy + ow / 2, ow / 2).fill({ color: light, alpha: 0.55 });
      glow.circle(cx, oy + oh * 0.6, ow).fill({ color: light, alpha: 0.12 });
      // The bell, in silhouette against the light, with a warm rim.
      const bw = ow * 0.7;
      const top = oy + oh * 0.3;
      const bot = oy + oh * 0.9;
      const bell = [
        cx - bw * 0.28,
        top,
        cx + bw * 0.28,
        top,
        cx + bw * 0.42,
        bot - oh * 0.12,
        cx + bw / 2,
        bot,
        cx - bw / 2,
        bot,
        cx - bw * 0.42,
        bot - oh * 0.12,
      ];
      glow.poly(bell).stroke({ width: 5, color: light, alpha: 0.8 });
      g.poly(bell).fill(mix(body, 0x000000, 0.3));
      g.circle(cx, top, bw * 0.28).fill(mix(body, 0x000000, 0.3));
      // Clock face: a pale ring with hands.
      const cr = tw * 0.2;
      const cy = h * 0.42;
      glow.circle(cx, cy, cr).fill({ color: p.window, alpha: 0.3 });
      glow.circle(cx, cy, cr).stroke({ width: 4, color: p.window, alpha: 0.7 });
      g.rect(cx - 2, cy - cr * 0.75, 4, cr * 0.75).fill(body);
      g.rect(cx - 2, cy - 2, cr * 0.55, 4).fill(body);
      // A few lit windows down the shaft.
      for (let y = h * 0.58; y < h - 40; y += h * 0.1)
        glow.rect(cx - 6, y, 12, 22).fill({ color: p.window, alpha: 0.5 });
      break;
    }
    case 'board': {
      // The Board: a huge departure-board of numerals on stilts, rows of lit cells.
      const bh = h * 0.62;
      g.rect(w * 0.12, bh, w * 0.05, h - bh).fill(body);
      g.rect(w * 0.83, bh, w * 0.05, h - bh).fill(body);
      g.rect(0, 0, w, bh).fill(body);
      g.rect(0, 0, w, bh).stroke({ width: 6, color: trim });
      const rows = Math.max(2, Math.floor(bh / 40));
      const cols = Math.max(4, Math.floor(w / 34));
      const cw = (w - 24) / cols;
      const rh = (bh - 24) / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const on = (r * 7 + c * 13 + b.name.length) % 5 !== 0;
          if (!on) continue;
          glow
            .rect(12 + c * cw + 3, 12 + r * rh + 4, cw - 6, rh - 8)
            .fill({ color: r % 2 ? p.window : light, alpha: 0.75 });
        }
      break;
    }
    case 'scale': {
      // A colossal balance: post, beam, chains and two pans; the fulcrum glows.
      const beamY = h * 0.18;
      g.rect(cx - w * 0.04, beamY, w * 0.08, h - beamY).fill(body);
      g.poly([cx - w * 0.2, h, cx + w * 0.2, h, cx + w * 0.08, h * 0.85, cx - w * 0.08, h * 0.85]).fill(body);
      g.rect(w * 0.05, beamY - h * 0.02, w * 0.9, h * 0.04).fill(body);
      for (const px of [w * 0.12, w * 0.88]) {
        g.moveTo(px, beamY)
          .lineTo(px - w * 0.08, h * 0.55)
          .moveTo(px, beamY)
          .lineTo(px + w * 0.08, h * 0.55);
        g.stroke({ width: 4, color: trim });
        g.ellipse(px, h * 0.56, w * 0.1, h * 0.03).fill(body);
      }
      glow.circle(cx, beamY, w * 0.05).fill({ color: light, alpha: 0.9 });
      break;
    }
    case 'glow': {
      // A column of light (a lamp stack, a hatch shaft): just light.
      for (let i = 0; i < 8; i++) {
        const k = 1 - i / 8;
        glow.rect(cx - (w / 2) * k, 0, w * k, h).fill({ color: light, alpha: 0.06 });
      }
      glow.rect(cx - 4, 0, 8, h).fill({ color: light, alpha: 0.7 });
      break;
    }
  }
}
