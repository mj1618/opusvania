/**
 * Playfield terrain, code-drawn: the highest-contrast layer (PLAN §5.1). Solid masses fade from a
 * textured surface colour to near-black with depth, exposed top edges get a bright lit rim, and
 * hazards/goals draw an emissive copy so they glow through bloom and stay readable in the dark.
 * Also derives the room's automatic lights (entities, hanging lamps).
 */
import type { Graphics } from 'pixi.js';
import { tuning } from '../../sim/tuning';
import { type Room, Tile, tileAt } from '../../sim/world/rooms';
import { mix, RenderRng } from './color';
import type { Dressing, LightDef } from './dressing';
import type { Light } from './lighting';

/** Gameplay-object colours (readability first: these do not follow the district palette). */
export const PLAYFIELD_COLORS = {
  spike: 0xe8485e,
  spikeGlow: 0xff2a48,
  orb: 0xffd84a,
  orbGlow: 0xffb020,
  goal: 0x4cff9a,
  optional: 0xffc94a,
  respawn: 0x7aa2ff,
  door: 0x07080c,
};

const SPIKE_DRAW_H = 40;
const EDGE_TOP = 6;
const EDGE_SIDE = 5;

/** Tiles of solid between each solid tile and the nearest non-solid tile (1 = surface), capped. */
export function solidDepth(room: Room, cap = 5): Uint8Array {
  const { width: w, height: h } = room;
  const d = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      if (tileAt(room, tx, ty) !== Tile.solid) continue;
      const exposed = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => {
        const nx = tx + dx;
        const ny = ty + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && tileAt(room, nx, ny) !== Tile.solid;
      });
      if (exposed) {
        d[i] = 1;
        queue.push(i);
      }
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q] ?? 0;
    const di = d[i] ?? 0;
    if (di >= cap) continue;
    const tx = i % w;
    const ty = (i - tx) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (d[j] !== 0 || tileAt(room, nx, ny) !== Tile.solid) continue;
      d[j] = di + 1;
      queue.push(j);
    }
  }
  for (let i = 0; i < d.length; i++) if (d[i] === 0 && room.tiles[i] === Tile.solid) d[i] = cap;
  return d;
}

export interface TerrainOut {
  lights: Light[];
  /** Hanging lamps, for the debug API. */
  lamps: number;
}

export function drawTerrain(g: Graphics, glow: Graphics, room: Room, d: Dressing): TerrainOut {
  const ts = tuning.world.tileSize;
  const p = d.palette;
  const depth = solidDepth(room);
  const depthColor = [
    p.terrain,
    p.terrain,
    mix(p.terrain, p.terrainDeep, 0.45),
    mix(p.terrain, p.terrainDeep, 0.75),
  ];
  const colorAt = (dd: number) => depthColor[dd] ?? p.terrainDeep;
  const solid = (tx: number, ty: number) => tileAt(room, tx, ty) === Tile.solid;
  const mortar = mix(p.terrain, p.terrainDeep, 0.55);

  // Solid fill, run-length merged per row by depth colour.
  for (let ty = 0; ty < room.height; ty++) {
    let run = -1;
    let runColor = 0;
    for (let tx = 0; tx <= room.width; tx++) {
      const isSolid = tx < room.width && solid(tx, ty);
      const c = isSolid ? colorAt(depth[ty * room.width + tx] ?? 5) : -1;
      if (run >= 0 && c !== runColor) {
        g.rect(run * ts, ty * ts, (tx - run) * ts, ts).fill(runColor);
        run = -1;
      }
      if (isSolid && run < 0) {
        run = tx;
        runColor = c;
      }
    }
  }
  // Deep rock: faint large blocks so big solid masses are not flat black.
  const block = mix(p.terrain, p.terrainDeep, 0.25);
  for (let ty = 0; ty < room.height; ty++) {
    for (let tx = (ty % 2) * 1; tx < room.width; tx += 2) {
      const dd = depth[ty * room.width + tx] ?? 0;
      if (dd < 3 || !solid(tx, ty) || !solid(tx + 1, ty)) continue;
      const hsh = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const a = 0.2 + ((hsh % 100) / 100) * 0.3;
      g.rect(tx * ts + 3, ty * ts + 3, 2 * ts - 6, ts - 6).fill({ color: block, alpha: a });
    }
  }
  // Masonry courses on the surface tiles (subtle), then lit rims on exposed faces.
  for (let ty = 0; ty < room.height; ty++) {
    for (let tx = 0; tx < room.width; tx++) {
      if (!solid(tx, ty)) continue;
      const dd = depth[ty * room.width + tx] ?? 5;
      if (dd > 2) continue;
      const x = tx * ts;
      const y = ty * ts;
      const a = dd === 1 ? 0.55 : 0.3;
      for (let k = 1; k < 3; k++) g.rect(x, y + (ts * k) / 3 - 1, ts, 2);
      for (let k = 0; k < 3; k++) {
        const off = ((ty * 3 + k) % 2) * (ts / 2);
        g.rect(x + off + 14, y + (ts * k) / 3, 2, ts / 3);
      }
      g.fill({ color: mortar, alpha: a });
    }
  }
  const rimHi = mix(p.rim, 0xffffff, 0.35);
  const side = mix(p.rimSide, p.rim, 0.3);
  for (let ty = 0; ty < room.height; ty++) {
    for (let tx = 0; tx < room.width; tx++) {
      if (!solid(tx, ty)) continue;
      const x = tx * ts;
      const y = ty * ts;
      if (!solid(tx - 1, ty)) g.rect(x, y, EDGE_SIDE, ts).fill(side);
      if (!solid(tx + 1, ty)) g.rect(x + ts - EDGE_SIDE, y, EDGE_SIDE, ts).fill(side);
      if (!solid(tx, ty + 1))
        g.rect(x, y + ts - EDGE_SIDE, ts, EDGE_SIDE).fill(mix(p.rimSide, p.terrainDeep, 0.35));
      if (!solid(tx, ty - 1)) {
        g.rect(x, y + EDGE_TOP, ts, 8).fill({ color: p.rim, alpha: 0.22 });
        g.rect(x, y + EDGE_TOP + 8, ts, 10).fill({ color: p.rim, alpha: 0.08 });
        g.rect(x, y, ts, EDGE_TOP).fill(p.rim);
        g.rect(x, y, ts, 2).fill(rimHi);
      }
    }
  }

  const lights: Light[] = [];
  const auto = d.autoLights;
  const entityLight = (l: Light) => {
    if (auto.entities) lights.push({ ...l, intensity: l.intensity * auto.intensity });
  };
  const C = PLAYFIELD_COLORS;
  // Tiles: one-ways, spikes, orbs.
  let spikeRun = 0;
  for (let ty = 0; ty < room.height; ty++) {
    for (let tx = 0; tx < room.width; tx++) {
      const t = tileAt(room, tx, ty);
      const x = tx * ts;
      const y = ty * ts;
      if (t === Tile.oneWay) {
        const plank = mix(p.rimSide, p.rim, 0.5);
        g.rect(x + 8, y + 10, 5, 16).fill({ color: plank, alpha: 0.55 });
        g.rect(x + ts - 13, y + 10, 5, 16).fill({ color: plank, alpha: 0.55 });
        g.rect(x, y, ts, 11).fill(plank);
        g.rect(x, y, ts, 3).fill(p.rim);
        const cx = x + ts / 2;
        g.poly([cx - 10, y + 15, cx + 10, y + 15, cx, y + 25]).fill({ color: p.rim, alpha: 0.55 });
      } else if (t >= Tile.spikeUp && t <= Tile.spikeRight) {
        const pts = spikePolys(t, x, y, ts);
        for (const poly of pts) {
          g.poly(poly).fill(C.spike);
          glow.poly(poly).fill({ color: C.spikeGlow, alpha: 0.5 });
        }
        if (spikeRun++ % 3 === 0)
          entityLight({ x: x + ts / 2, y: y + ts / 2, radius: 170, color: C.spikeGlow, intensity: 0.35 });
      } else if (t === Tile.orb) {
        const cx = x + ts / 2;
        const cy = y + ts / 2;
        const r = tuning.pogo.orbSize / 2;
        g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.35 });
        glow.circle(cx, cy, r).fill({ color: C.orbGlow, alpha: 0.3 });
        glow.circle(cx, cy, r - 8).fill(C.orb);
        g.circle(cx, cy, 6).fill(0x1a1208);
        entityLight({ x: cx, y: cy, radius: 230, color: C.orbGlow, intensity: 0.7 });
      }
    }
  }
  // Entities.
  for (const e of room.entities) {
    const x = e.tx * ts;
    const y = e.ty * ts;
    if (e.kind === 'goal') {
      g.rect(x + 16, y + ts - 10, 32, 10).fill(mix(p.rimSide, p.rim, 0.3));
      glow.rect(x + 18, y - ts + 8, 28, 2 * ts - 8).fill({ color: C.goal, alpha: 0.28 });
      glow.rect(x + 26, y - ts + 14, 12, 2 * ts - 20).fill(C.goal);
      entityLight({ x: x + ts / 2, y: y, radius: 360, color: C.goal, intensity: 0.9 });
    } else if (e.kind === 'optionalGoal') {
      glow.star(x + ts / 2, y + ts / 2, 5, 28, 12).fill({ color: C.optional, alpha: 0.3 });
      glow.star(x + ts / 2, y + ts / 2, 5, 22, 10).fill(C.optional);
      entityLight({ x: x + ts / 2, y: y + ts / 2, radius: 240, color: C.optional, intensity: 0.7 });
    } else if (e.kind === 'respawn') {
      g.rect(x + 28, y + 8, 6, ts - 8).fill(mix(p.rimSide, p.rim, 0.4));
      glow.poly([x + 34, y + 8, x + 58, y + 18, x + 34, y + 28]).fill(C.respawn);
      entityLight({ x: x + 40, y: y + 18, radius: 200, color: C.respawn, intensity: 0.5 });
    } else if (e.kind === 'door') {
      const frame = mix(p.rimSide, p.rim, 0.35);
      g.rect(x + 2, y - ts + 4, ts - 4, 2 * ts - 4).fill(frame);
      g.rect(x + 12, y - ts + 16, ts - 24, 2 * ts - 16).fill(C.door);
      // Warm spill at the threshold and a lamp over the lintel.
      glow.rect(x + 12, y + ts - 22, ts - 24, 22).fill({ color: p.lamp, alpha: 0.12 });
      drawLampBulb(glow, x + ts / 2, y - ts - 2, p.lamp, 0.8);
      g.rect(x + ts / 2 - 14, y - ts - 12, 28, 8).fill(p.terrainDeep);
      entityLight({ x: x + ts / 2, y: y - ts + 10, radius: 300, color: p.lamp, intensity: 0.75, seed: e.tx });
    }
  }

  // Hanging lamps: seeded, under ceilings with enough headroom.
  const rng = new RenderRng(d.seed ^ 0x2545f491);
  let lamps = 0;
  if (auto.lamps) {
    const spacing = auto.lampSpacing;
    let next = Math.floor(rng.range(2, spacing));
    for (let tx = 1; tx < room.width - 1; tx++) {
      if (tx < next) continue;
      // Lowest ceiling tile in this column with >= 5 air tiles below it and a floor within 12.
      let placed = false;
      for (let ty = 0; ty < room.height - 6 && !placed; ty++) {
        if (!solid(tx, ty)) continue;
        let air = 0;
        while (ty + 1 + air < room.height && tileAt(room, tx, ty + 1 + air) === Tile.empty) air++;
        if (air >= 5 && air <= 14 && !solid(tx - 1, ty + 1) && !solid(tx + 1, ty + 1)) {
          const hang = rng.range(0.6, 1.6) * ts;
          const lx = tx * ts + ts / 2;
          const ly = (ty + 1) * ts + hang;
          drawLamp(g, glow, lx, (ty + 1) * ts, hang, p.lamp, p.terrainDeep);
          lights.push({
            x: lx,
            y: ly + 18,
            radius: rng.range(420, 560),
            color: p.lamp,
            intensity: rng.range(0.95, 1.25) * auto.intensity,
            flicker: rng.chance(0.25) ? rng.range(0.3, 0.8) : rng.range(0, 0.12),
            seed: tx * 7 + ty,
          });
          lamps++;
          placed = true;
        }
      }
      if (placed) next = tx + Math.floor(spacing * rng.range(0.7, 1.3));
    }
  }
  // Explicit lights from the dressing file.
  for (const l of d.lights) lights.push(dressingLight(g, glow, room, l, d, ts));
  return { lights, lamps };
}

function dressingLight(g: Graphics, glow: Graphics, room: Room, l: LightDef, d: Dressing, ts: number): Light {
  const x = (l.at[0] + room.padX) * ts;
  const y = (l.at[1] + room.padY) * ts;
  const color = l.color ?? d.palette.lamp;
  if (l.lamp) drawLamp(g, glow, x, y - l.hang, l.hang, color, d.palette.terrainDeep);
  return {
    x,
    y: l.lamp ? y + 18 : y,
    radius: l.radius,
    color,
    intensity: l.intensity,
    flicker: l.flicker,
    seed: Math.round(x + y),
  };
}

function drawLampBulb(glow: Graphics, x: number, y: number, color: number, k: number) {
  glow.circle(x, y + 6, 16).fill({ color, alpha: 0.25 * k });
  glow.ellipse(x, y + 5, 9, 6).fill({ color: mix(color, 0xffffff, 0.5), alpha: k });
}

/** Cable from (x, top) down `hang` px, a conical shade, and a glowing bulb under it. */
function drawLamp(
  g: Graphics,
  glow: Graphics,
  x: number,
  top: number,
  hang: number,
  color: number,
  dark: number,
) {
  const y = top + hang;
  g.rect(x - 1.5, top, 3, hang).fill(dark);
  g.poly([x - 8, y - 4, x + 8, y - 4, x + 22, y + 12, x - 22, y + 12]).fill(dark);
  glow.poly([x - 20, y + 12, x + 20, y + 12, x + 14, y + 15, x - 14, y + 15]).fill({ color, alpha: 0.6 });
  drawLampBulb(glow, x, y + 10, color, 1);
}

function spikePolys(t: number, x: number, y: number, ts: number): number[][] {
  const h = SPIKE_DRAW_H;
  const half = ts / 2;
  const out: number[][] = [];
  for (let i = 0; i < 2; i++) {
    const o = i * half;
    if (t === Tile.spikeUp) out.push([x + o, y + ts, x + o + half / 2, y + ts - h, x + o + half, y + ts]);
    else if (t === Tile.spikeDown) out.push([x + o, y, x + o + half / 2, y + h, x + o + half, y]);
    else if (t === Tile.spikeRight) out.push([x, y + o, x + h, y + o + half / 2, x, y + o + half]);
    else out.push([x + ts, y + o, x + ts - h, y + o + half / 2, x + ts, y + o + half]);
  }
  return out;
}
