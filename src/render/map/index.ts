/**
 * Map v1 (docs/design/tech.md §4, memory/world.md): an overlay drawn from the rooms' collision and
 * the save, greybox style. It shows the rooms she has visited (their solids and one-ways, scaled to
 * fit), where she is, the moon patches she has seen (the one she last rested at ringed), the lamps she
 * has seen still burning (warm dots; put out: dim rings), glades not taken, and exits she has seen but
 * not gone through (green ticks: the way on). No map art: the map draws itself from the world.
 *
 * Tab opens and closes it (main.ts pauses the game while it is open). Screen space, over the HUD.
 * Reads the game; never writes it.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../game';
import type { Room } from '../../scene/room';
import type { WorldRoom } from '../../sim/world';
import { SAFE_H, SAFE_W, type ViewSize } from '../contract';

/** Map colours: the greybox palette's family (src/render/greybox/palette.ts), a step darker. */
const MAP = {
  backdrop: 0x0b0e14,
  backdropAlpha: 0.95,
  room: 0x1a2030,
  roomEdge: 0x4a5468,
  here: 0xc6d1e6,
  solid: 0x7d889e,
  oneWay: 0xaab5ca,
  exit: 0x5fd38a,
  patch: 0xa8c8ff,
  lamp: 0xffc45a,
  husk: 0x6b7385,
  glade: 0xffffff,
  player: 0xffffff,
  label: 0x9aa6bd,
  /** Margin round the map inside the safe area, logical px. */
  margin: 120,
  /** The map is never drawn bigger than this many logical px per world px. */
  maxScale: 1 / 8,
  /** Seconds between redraws while open (the player marker pulses). */
  redraw: 1 / 30,
} as const;

export class MapOverlay {
  readonly layer = new Container({ label: 'map' });
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private readonly texts = new Map<string, Text>();
  private readonly title: Text;
  private since = 1;
  open = false;

  constructor() {
    this.title = new Text({
      text: 'MAP   (Tab to close)',
      style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: 20, fill: MAP.label },
      resolution: 2,
    });
    this.layer.addChild(this.g, this.labels, this.title);
    this.layer.visible = false;
    this.layer.eventMode = 'none';
  }

  toggle(on = !this.open): boolean {
    this.open = on;
    this.layer.visible = on;
    this.since = 1;
    return on;
  }

  /** Redraws while open (render time `dt`, `clock` s). */
  update(dt: number, clock: number, game: Game, v: ViewSize): void {
    if (!this.open) return;
    this.since += dt;
    if (this.since < MAP.redraw && dt > 0) return;
    this.since = 0;
    this.draw(clock, game, v);
  }

  private label(id: string, text: string): Text {
    let t = this.texts.get(id);
    if (!t) {
      t = new Text({
        text,
        style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: 14, fill: MAP.label },
        resolution: 2,
      });
      t.anchor.set(0, 0);
      this.texts.set(id, t);
      this.labels.addChild(t);
    }
    return t;
  }

  private draw(clock: number, game: Game, v: ViewSize): void {
    const g = this.g.clear();
    g.rect(v.left, v.top, v.w, v.h).fill({ color: MAP.backdrop, alpha: MAP.backdropAlpha });
    this.title.position.set(MAP.margin / 2, MAP.margin / 3);
    for (const t of this.texts.values()) t.visible = false;
    const save = game.state.save;
    const world = game.world;
    const here = game.state.room;
    const rooms: WorldRoom[] = world
      ? Object.values(world.rooms).filter((r) => r.placed && (save.visited.includes(r.id) || r.id === here))
      : [];
    // A room outside the world (a test room): just that room.
    if (rooms.length === 0) rooms.push({ id: here, x: 0, y: 0, placed: false, scene: game.scene });
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of rooms) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.scene.width);
      y1 = Math.max(y1, r.y + r.scene.height);
    }
    const k = Math.min(
      MAP.maxScale,
      (SAFE_W - 2 * MAP.margin) / (x1 - x0),
      (SAFE_H - 2 * MAP.margin) / (y1 - y0),
    );
    const ox = SAFE_W / 2 - ((x0 + x1) / 2) * k;
    const oy = SAFE_H / 2 - ((y0 + y1) / 2) * k;
    const X = (r: WorldRoom, x: number) => ox + (r.x + x) * k;
    const Y = (r: WorldRoom, y: number) => oy + (r.y + y) * k;
    const seen = (r: WorldRoom, id: string) => save.seen.includes(`${r.id}:${id}`);
    for (const r of rooms) {
      const s = r.scene as Room;
      g.rect(X(r, 0), Y(r, 0), s.width * k, s.height * k)
        .fill({ color: MAP.room })
        .stroke({ color: r.id === here ? MAP.here : MAP.roomEdge, width: r.id === here ? 2 : 1 });
      for (const q of s.solids) g.rect(X(r, q.x), Y(r, q.y), Math.max(1, q.w * k), Math.max(1, q.h * k));
      g.fill({ color: MAP.solid, alpha: 0.9 });
      for (const o of s.oneWays) g.rect(X(r, o.x), Y(r, o.y), Math.max(1, o.w * k), 1.5);
      g.fill({ color: MAP.oneWay });
      // Shortcuts still shut are solid.
      for (const c of s.shortcuts ?? [])
        if (!save.opened.includes(`${r.id}:${c.id}`))
          g.rect(X(r, c.x), Y(r, c.y), Math.max(2, c.w * k), Math.max(2, c.h * k)).fill({ color: 0xffb347 });
      const t = this.label(r.id, r.id);
      t.visible = true;
      t.position.set(X(r, 0) + 6, Y(r, 0) + 4);
      // Exits she has seen and not gone through: the way on.
      for (const e of s.exits ?? []) {
        // (An arrival-only opening, the far side of a one-way drop, is no way on.)
        if (!seen(r, e.id) || save.crossed.includes(`${r.id}:${e.id}`)) continue;
        if (world?.links[`${r.id}#${e.id}`] === null) continue;
        const mid = (e.from + e.to) / 2;
        const len = Math.max(6, (e.to - e.from) * k);
        if (e.edge === 'n' || e.edge === 's')
          g.rect(X(r, mid) - len / 2, Y(r, e.edge === 'n' ? 0 : s.height) - 2, len, 4);
        else g.rect(X(r, e.edge === 'w' ? 0 : s.width) - 2, Y(r, mid) - len / 2, 4, len);
      }
      g.fill({ color: MAP.exit });
      for (const p of s.patches ?? []) {
        if (!seen(r, p.id)) continue;
        g.circle(X(r, p.x), Y(r, p.y - 40), 6).fill({ color: MAP.patch });
        if (save.patch?.room === r.id && save.patch.id === p.id)
          g.circle(X(r, p.x), Y(r, p.y - 40), 10).stroke({ color: MAP.patch, width: 2 });
      }
      for (const gl of s.glades ?? []) {
        if (!seen(r, gl.id) || save.taken.includes(`${r.id}:${gl.id}`)) continue;
        const cx = X(r, gl.x + gl.w / 2);
        const cy = Y(r, gl.y + gl.h / 2);
        g.moveTo(cx, cy - 7)
          .lineTo(cx + 7, cy)
          .lineTo(cx, cy + 7)
          .lineTo(cx - 7, cy)
          .closePath()
          .fill({ color: MAP.glade });
      }
      for (const l of s.lures ?? []) {
        if (!seen(r, l.id)) continue;
        const out = save.snuffed.includes(`${r.id}:${l.id}`);
        if (out) g.circle(X(r, l.x), Y(r, l.y), 4).stroke({ color: MAP.husk, width: 1.5 });
        else g.circle(X(r, l.x), Y(r, l.y), 5).fill({ color: MAP.lamp });
      }
    }
    // Where she is.
    const cur = rooms.find((r) => r.id === here);
    if (cur) {
      const p = game.state.player;
      const px = X(cur, p.x + p.w / 2);
      const py = Y(cur, p.y + p.h / 2);
      const pulse = 0.5 + 0.5 * Math.sin(clock * 4);
      g.circle(px, py, 5).fill({ color: MAP.player });
      g.circle(px, py, 9 + 4 * pulse).stroke({
        color: MAP.player,
        width: 1.5,
        alpha: 0.4 + 0.4 * (1 - pulse),
      });
    }
  }

  destroy(): void {
    this.layer.destroy({ children: true, context: true });
    this.texts.clear();
  }
}
