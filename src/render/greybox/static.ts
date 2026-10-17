/**
 * What never moves in a greybox room, drawn once: the world grid, solids (flat fill, a bright
 * walkable top, darker faces where a wall takes no kick), one-ways as lines, hazards red, catch
 * zones, rest points, the spawn; and the labels (marker ids, the room's notes, and the designer's marks: catch
 * zones and exits).
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Room } from '../../scene/room';
import { GB } from './palette';

/** A label in world px: small, monospace, never scaled below legibility by the camera. */
export function label(text: string, x: number, y: number, color: number = GB.label, size = 18): Text {
  const t = new Text({
    text,
    style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: size, fill: color },
    resolution: 2,
  });
  t.anchor.set(0.5, 1);
  t.position.set(Math.round(x), Math.round(y));
  return t;
}

/** The grid, the terrain and the markers (Graphics). */
export function buildStatic(room: Room): Graphics {
  const g = new Graphics();
  const top = Math.min(0, room.ceilingY ?? 0) - 1200;
  // The grid: lines every gridPx over the room and the air above it.
  for (let x = 0; x <= room.width; x += GB.gridPx) g.moveTo(x, top).lineTo(x, room.height);
  for (let y = room.height; y >= top; y -= GB.gridPx) g.moveTo(0, y).lineTo(room.width, y);
  g.stroke({ color: GB.grid, width: 2, alpha: GB.gridAlpha });
  // Solids.
  for (const s of room.solids) {
    const hazard = s.tag === 'pool';
    g.rect(s.x, s.y, s.w, s.h).fill({ color: hazard ? GB.hazard : GB.solid, alpha: hazard ? 0.8 : 1 });
  }
  // Faces that take no wall slide / kick: a darker band down the face.
  for (const s of room.solids) {
    if (s.kick === undefined || s.kick === true) continue;
    const band = Math.min(10, s.w / 3);
    if (s.kick === false || s.kick === 'east') g.rect(s.x, s.y + GB.topPx, band, s.h - GB.topPx);
    if (s.kick === false || s.kick === 'west') g.rect(s.x + s.w - band, s.y + GB.topPx, band, s.h - GB.topPx);
  }
  g.fill({ color: GB.noKick });
  // The walkable tops (each rect of a rolling top gets its own).
  for (const s of room.solids) {
    if (s.tag === 'pool') continue;
    g.rect(s.x, s.y, s.w, GB.topPx);
  }
  g.fill({ color: GB.solidTop });
  // One-ways: a line with short ticks under it.
  for (const o of room.oneWays) {
    g.rect(o.x, o.y, o.w, 4);
    for (let x = o.x + 8; x < o.x + o.w - 4; x += 24) g.rect(x, o.y + 4, 2, 8);
  }
  g.fill({ color: GB.oneWay });
  // Rest points (lanterns, wayside lamps): a cyan pillar on the ground; the heart a violet box.
  for (const l of [...(room.lanterns ?? []), ...(room.lamps ?? [])]) {
    g.rect(l.x - 14, l.y - 96, 28, 96).stroke({ color: GB.rest, width: 3, alpha: 0.9 });
    g.circle(l.x, l.y - 110, 10).fill({ color: GB.rest, alpha: 0.9 });
  }
  if (room.heart)
    g.rect(room.heart.x - 60, room.heart.y - 160, 120, 160).stroke({ color: GB.heart, width: 3 });
  // The spawn: a small upturned chevron at her feet.
  const sp = room.spawn;
  g.moveTo(sp.x - 18, sp.y - 2)
    .lineTo(sp.x, sp.y - 20)
    .lineTo(sp.x + 18, sp.y - 2)
    .stroke({ color: GB.spawn, width: 3, alpha: 0.7 });
  return g;
}

/** The labels: lure ids, exits, catch zones, rest points and the room's notes. */
export function buildLabels(room: Room): Container {
  const c = new Container({ label: 'greybox-labels' });
  // Catch zones: a faint red wash with a dashed rim (a designer's mark: with the labels only, feel review r2).
  const cz = new Graphics();
  for (const z of room.catches ?? []) {
    cz.rect(z.x, z.y, z.w, z.h).fill({ color: GB.catchZone, alpha: 0.07 });
    dashRect(cz, z.x, z.y, z.w, z.h, 18, 12);
    cz.stroke({ color: GB.catchZone, width: 2, alpha: 0.45 });
  }
  // Exits: a green bar along the open span of the edge (a designer's mark: with the labels only, plan r3 item 2:
  // the trunk's top exit read as a green line in play).
  for (const e of room.exits ?? []) {
    const ns = e.edge === 'n' || e.edge === 's';
    const at = e.at ?? (e.edge === 's' ? room.height : e.edge === 'e' ? room.width : 0);
    if (ns) cz.rect(e.from, at - 3, e.to - e.from, 6);
    else cz.rect(at - 3, e.from, 6, e.to - e.from);
  }
  cz.fill({ color: GB.exit, alpha: 0.9 });
  c.addChild(cz);
  // Under the core (her orbit circles over it): id, kind and which way it swirls.
  for (const l of room.lures ?? [])
    c.addChild(label(`${l.id}  ${l.kind} ${l.spin === -1 ? '↺' : '↻'}`, l.x, l.y + 96, GB.label, 16));
  for (const e of room.exits ?? []) {
    const ns = e.edge === 'n' || e.edge === 's';
    const mid = (e.from + e.to) / 2;
    const at = e.at ?? (e.edge === 's' ? room.height : e.edge === 'e' ? room.width : 0);
    const x = ns ? mid : at + (e.edge === 'e' ? -80 : 80);
    const y = ns ? at + (e.edge === 's' ? -12 : 40) : mid;
    c.addChild(label(`exit ${e.id} (${e.edge}${e.oneWay ? ', one way' : ''})`, x, y, GB.exit));
  }
  for (const z of room.catches ?? [])
    c.addChild(label(`catch ${z.id}`, z.x + z.w / 2, z.y + 32, GB.catchZone, 16));
  for (const l of room.lanterns ?? []) c.addChild(label(`rest ${l.id}`, l.x, l.y - 128, GB.rest));
  for (const l of room.lamps ?? []) c.addChild(label(`rest ${l.id}`, l.x, l.y - 128, GB.rest));
  for (const e of room.enemies ?? []) c.addChild(label(`${e.id}  ${e.kind}`, e.x, e.y - 90, 0xff8cf4, 16));
  for (const n of room.marks?.notes ?? []) c.addChild(label(n.text, n.x, n.y, GB.note, 22));
  // The world's things (memory/world.md).
  for (const p of room.patches ?? []) c.addChild(label(`patch ${p.id}`, p.x, p.y - 250, 0xd8e6ff));
  for (const g of room.glades ?? [])
    c.addChild(label(`glade ${g.id}: ${g.ability}`, g.x + g.w / 2, g.y - 16, 0xffffff));
  for (const s of room.shortcuts ?? [])
    c.addChild(label(`shortcut ${s.id} (opens from ${s.opens})`, s.x + s.w / 2, s.y - 12, 0xffb347, 16));
  for (const d of room.doors ?? []) c.addChild(label(`door ${d.id} -> ${d.to}`, d.x, d.y - 176, GB.exit, 16));
  c.addChild(label('spawn', room.spawn.x, room.spawn.y - 26, GB.spawn, 14));
  return c;
}

/** A dashed rectangle outline (path only; the caller strokes). */
function dashRect(g: Graphics, x: number, y: number, w: number, h: number, dash: number, gap: number): void {
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
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
