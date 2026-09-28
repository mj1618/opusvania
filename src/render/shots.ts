import type { Graphics } from 'pixi.js';
import type { Shot } from '../sim/state';
import { tuning } from '../sim/tuning';
import { type Room, Tile, tileAt } from '../sim/world/rooms';
import { NOISE_COLOURS } from './gfx/palette';
import { rotRect, strokeText } from './glyphs';
import { vibration } from './outline';
import { colourHex, PALETTE, SIG } from './palette';

/**
 * Enemy shots (state.local.shots; combat-spec §4.4-§5): darts (violet chevrons), the Clerk's mortar
 * (a spinning stamp) and its blast (a brown shock ring), the Auctioneer's floor wave (pink), the
 * TWICE word (pink, humming) and the bought slab (brown, hanging with a floor shadow, then falling).
 * Seizable shots hum like a source (a vibrating outline in their colour).
 */
export function drawShots(
  g: Graphics,
  gl: Graphics,
  shots: readonly Shot[],
  prev: readonly Shot[],
  alpha: number,
  frame: number,
  room: Room,
): { id: number; kind: string; colour: string; x: number; y: number; w: number; h: number }[] {
  const out: { id: number; kind: string; colour: string; x: number; y: number; w: number; h: number }[] = [];
  for (const s of shots) {
    const q = prev.find((o) => o.id === s.id && o.kind === s.kind);
    const x = q ? q.x + (s.x - q.x) * alpha : s.x;
    const y = q ? q.y + (s.y - q.y) * alpha : s.y;
    const c = colourHex(s.colour);
    const cx = x + s.w / 2;
    const cy = y + s.h / 2;
    const hanging = s.kind === 'slab' && s.vy === 0 && s.gravity === 0;
    switch (s.kind) {
      case 'dart': {
        const a = Math.atan2(s.vy, s.vx);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const P = (u: number, v: number) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
        const L = s.w / 2 + 4;
        const pts = [...P(L, 0), ...P(-L, -s.h * 0.7), ...P(-L * 0.35, 0), ...P(-L, s.h * 0.7)];
        g.poly(pts).fill(c);
        g.poly(pts).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
        gl.poly(pts).fill({ color: NOISE_COLOURS.violet.core, alpha: 0.7 });
        // Short trail.
        const [tx, ty] = P(-L - 18, 0);
        g.moveTo(cx, cy)
          .lineTo(tx as number, ty as number)
          .stroke({ width: 3, color: c, alpha: 0.4 });
        break;
      }
      case 'mortar': {
        // A rubber stamp, spinning end over end.
        const a = s.age * 0.35;
        g.poly(rotRect(cx, cy, s.w, s.h * 0.55, a)).fill(c);
        g.poly(rotRect(cx, cy, s.w, s.h * 0.55, a)).stroke({ width: 3, color: mix(c, 0x000000, 0.45) });
        const hx = cx - Math.sin(a) * s.h * 0.45;
        const hy = cy + Math.cos(a) * s.h * 0.45;
        g.poly(rotRect(hx, hy, 12, s.h * 0.5, a)).fill(PALETTE.woodDark);
        gl.circle(cx, cy, s.w * 0.5).fill({ color: NOISE_COLOURS.brown.core, alpha: 0.35 });
        break;
      }
      case 'blast': {
        const t = Math.min(1, s.age / Math.max(1, s.landFrames));
        const rx = s.w / 2;
        const ry = s.h;
        g.ellipse(cx, y + s.h, rx * (0.6 + 0.4 * t), ry * (0.8 + 0.6 * t)).stroke({
          width: 6 * (1 - t) + 2,
          color: c,
          alpha: 1 - t * 0.5,
        });
        g.ellipse(cx, y + s.h, rx, ry * 0.5).fill({ color: c, alpha: 0.35 * (1 - t) });
        gl.ellipse(cx, y + s.h, rx, ry).fill({ color: NOISE_COLOURS.brown.core, alpha: 0.4 * (1 - t) });
        break;
      }
      case 'wave': {
        // A pink crest running along the floor, leaning the way it travels.
        const dir = s.vx >= 0 ? 1 : -1;
        const bot = y + s.h;
        const front = dir > 0 ? x + s.w : x;
        const back = dir > 0 ? x : x + s.w;
        const pts = [back, bot, front - dir * 8, y + 2, front, bot];
        g.poly(pts).fill({ color: c, alpha: 0.85 });
        g.poly(pts).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
        gl.poly(pts).fill({ color: NOISE_COLOURS.pink.core, alpha: 0.6 });
        for (let i = 1; i <= 3; i++)
          g.moveTo(back - dir * i * 12, bot - 4 - i * 3)
            .lineTo(back - dir * (i * 12 + 10), bot - 4)
            .stroke({ width: 2, color: c, alpha: 0.6 / i });
        break;
      }
      case 'word': {
        // TWICE: a pink word plate, humming (it is seizable).
        const { dx, dy } = vibration('pink', frame);
        g.roundRect(x, y, s.w, s.h, 8).fill({ color: PALETTE.bg, alpha: 0.75 });
        g.roundRect(x + dx + 2, y + dy + 2, s.w - 4, s.h - 4, 8).stroke({
          width: SIG.hummingOutline,
          color: c,
        });
        strokeText(g, 'TWICE', cx + dx, cy + dy, s.h * 0.42, { color: c, width: 5 });
        gl.roundRect(x, y, s.w, s.h, 8).stroke({ width: 6, color: NOISE_COLOURS.pink.core, alpha: 0.8 });
        break;
      }
      case 'slab': {
        if (hanging) {
          // Shadow on the floor under it, growing as the drop nears; a rope up to the gallery.
          const fy = floorBelow(room, cx, y + s.h);
          const k = Math.min(1, s.age / 20);
          g.ellipse(cx, fy - 2, s.w * (0.4 + 0.3 * k), 7).fill({ color: 0x000000, alpha: 0.35 + 0.3 * k });
          g.ellipse(cx, fy - 2, s.w * (0.4 + 0.3 * k), 7).stroke({
            width: 2,
            color: c,
            alpha: 0.5 + 0.4 * k,
          });
          g.moveTo(cx, y)
            .lineTo(cx, y - 60)
            .stroke({ width: 2, color: PALETTE.hudDim, alpha: 0.8 });
        }
        g.rect(x, y, s.w, s.h).fill({ color: c, alpha: SIG.slabFillAlpha });
        g.rect(x + 3, y + 3, s.w - 6, s.h - 6).stroke({ width: 6, color: mix(c, 0x000000, 0.45) });
        gl.rect(x, y, s.w, s.h).fill({ color: NOISE_COLOURS.brown.core, alpha: 0.3 });
        break;
      }
      default:
        g.rect(x, y, s.w, s.h).fill({ color: c, alpha: 0.8 });
    }
    if (s.seizable && s.kind !== 'word') {
      const { dx, dy } = vibration(s.colour, frame);
      const pad = 5;
      g.roundRect(x - pad + dx, y - pad + dy, s.w + 2 * pad, s.h + 2 * pad, 6).stroke({
        width: 2,
        color: c,
        alpha: 0.9,
      });
    }
    out.push({ id: s.id, kind: `shot:${s.kind}`, colour: s.colour, x, y, w: s.w, h: s.h });
  }
  return out;
}

/** World y of the first solid tile top below (x, y). */
function floorBelow(room: Room, x: number, y: number): number {
  const ts = tuning.world.tileSize;
  const tx = Math.floor(x / ts);
  for (let ty = Math.floor(y / ts); ty < room.height; ty++) {
    const t = tileAt(room, tx, ty);
    if (t !== Tile.empty && t !== Tile.orb) return ty * ts;
  }
  return room.height * ts;
}

function mix(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - u) + ((b >> sh) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
