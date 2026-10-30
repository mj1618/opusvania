/**
 * Map v1 (docs/design/tech.md §4, memory/world.md): an overlay drawn from the rooms' collision and
 * the save, greybox style. It shows the rooms she has visited (their solids and one-ways, scaled to
 * fit), where she is, the moon patches she has seen (the one she last rested at ringed), the lamps she
 * has seen still burning (warm dots; put out: dim rings), glades not taken, and exits she has seen but
 * not gone through (green ticks: the way on). No map art: the map draws itself from the world.
 * A moth-stone she has read (memory/level-kit.md) draws its whole area: rooms she has not been in show
 * faint (their shape only), with the area's count of lamps she has not seen.
 *
 * Tab opens and closes it (main.ts pauses the game while it is open). Screen space, over the HUD.
 * A map station (`mapStation`: resting at the hub's patch, the Canopy r9) shows it for a few seconds without pausing
 * (`MAP.flash`): it fades in over the scene, holds, and fades out; Tab during it opens it for good.
 * Reads the game; never writes it.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../game';
import { WORLD } from '../../scene/index';
import type { Room } from '../../scene/room';
import { upgradesOwned } from '../../sim/upgrades';
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
  /** A map station's glimpse: seconds in, held, out, and the backdrop's alpha (the scene shows through a little). */
  flash: { in: 0.4, hold: 2.6, out: 0.8, backdrop: 0.82 },
} as const;

export class MapOverlay {
  readonly layer = new Container({ label: 'map' });
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private readonly texts = new Map<string, Text>();
  private readonly title: Text;
  private since = 1;
  open = false;
  /** A map station's glimpse: seconds since it began (null: none). */
  private flashT: number | null = null;
  private hooked: Game | null = null;

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
    this.layer.alpha = 1;
    this.flashT = null;
    this.title.text = 'MAP   (Tab to close)';
    this.since = 1;
    return on;
  }

  /** Redraws while open (render time `dt`, `clock` s); runs a map station's glimpse. */
  update(dt: number, clock: number, game: Game, v: ViewSize): void {
    // (Listens for the station on the game's steps: read only.)
    if (this.hooked !== game) {
      this.hooked = game;
      game.afterStep.add((events) => {
        if (!this.open && events.some((e) => e.type === 'mapStation')) {
          this.flashT = 0;
          this.since = 1;
        }
      });
    }
    if (!this.open && this.flashT !== null) {
      const F = MAP.flash;
      this.flashT += dt;
      const t = this.flashT;
      const a = t < F.in ? t / F.in : t < F.in + F.hold ? 1 : 1 - (t - F.in - F.hold) / F.out;
      if (a <= 0) {
        this.flashT = null;
        this.layer.visible = false;
        this.layer.alpha = 1;
        return;
      }
      this.layer.visible = true;
      this.layer.alpha = a * a * (3 - 2 * a);
      this.title.text = 'MAP';
      this.since += dt;
      if (this.since < MAP.redraw && dt > 0) return;
      this.since = 0;
      this.draw(clock, game, v, F.backdrop);
      return;
    }
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

  private draw(clock: number, game: Game, v: ViewSize, backdrop: number = MAP.backdropAlpha): void {
    const g = this.g.clear();
    g.rect(v.left, v.top, v.w, v.h).fill({ color: MAP.backdrop, alpha: backdrop });
    this.title.position.set(MAP.margin / 2, MAP.margin / 3);
    for (const t of this.texts.values()) t.visible = false;
    const save = game.state.save;
    const nightEyes = upgradesOwned(save).includes('nightEyes');
    const world = game.world;
    const here = game.state.room;
    // Areas drawn by a moth-stone she has read (in any room, a test room's too).
    const areas = new Set<string>();
    for (const r of Object.values(world?.rooms ?? {}))
      for (const m of r.scene.mothStones ?? []) if (save.taken.includes(`${r.id}:${m.id}`)) areas.add(m.area);
    const revealed = new Set(WORLD.areas.filter((a) => areas.has(a.id)).flatMap((a) => a.rooms));
    const known = (r: WorldRoom) => save.visited.includes(r.id) || r.id === here;
    const rooms: WorldRoom[] = world
      ? Object.values(world.rooms).filter((r) => r.placed && (known(r) || revealed.has(r.id)))
      : [];
    // A room outside the world (a test room): just that room, unless a stone has drawn an area.
    const inWorld = rooms.some((r) => r.id === here);
    if (!inWorld && revealed.size === 0) rooms.length = 0;
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
    // A drawn area's rooms she has not been in: their shape only, faint.
    for (const r of rooms) {
      if (known(r)) continue;
      const s = r.scene as Room;
      g.rect(X(r, 0), Y(r, 0), s.width * k, s.height * k)
        .fill({ color: MAP.room, alpha: 0.5 })
        .stroke({ color: MAP.roomEdge, width: 1, alpha: 0.4 });
      for (const q of s.solids) g.rect(X(r, q.x), Y(r, q.y), Math.max(1, q.w * k), Math.max(1, q.h * k));
      g.fill({ color: MAP.solid, alpha: 0.3 });
    }
    // Each drawn area: its count of lamps she has not seen (still burning), over its top-left room.
    for (const a of WORLD.areas) {
      if (!areas.has(a.id)) continue;
      const inA = rooms.filter((r) => a.rooms.includes(r.id));
      if (inA.length === 0) continue;
      let unseen = 0;
      for (const r of inA)
        for (const l of r.scene.lures ?? [])
          if (!save.seen.includes(`${r.id}:${l.id}`) && !save.snuffed.includes(`${r.id}:${l.id}`)) unseen++;
      const top = inA.reduce((b, r) => (r.y < b.y || (r.y === b.y && r.x < b.x) ? r : b));
      const t = this.label(`area:${a.id}`, '');
      t.text = `${a.id}: ${unseen} lamp${unseen === 1 ? '' : 's'} unseen`;
      t.visible = true;
      t.position.set(X(top, 0), Y(top, 0) - 22);
    }
    for (const r of rooms) {
      if (!known(r)) continue;
      const s = r.scene as Room;
      g.rect(X(r, 0), Y(r, 0), s.width * k, s.height * k)
        .fill({ color: MAP.room })
        .stroke({ color: r.id === here ? MAP.here : MAP.roomEdge, width: r.id === here ? 2 : 1 });
      for (const q of s.solids) g.rect(X(r, q.x), Y(r, q.y), Math.max(1, q.w * k), Math.max(1, q.h * k));
      // (Sealed air, the Canopy v9, is rock to the map: she can never be there.)
      for (const q of s.marks?.sealed ?? [])
        g.rect(X(r, q.x), Y(r, q.y), Math.max(1, q.w * k), Math.max(1, q.h * k));
      g.fill({ color: MAP.solid, alpha: 0.9 });
      for (const o of s.oneWays) g.rect(X(r, o.x), Y(r, o.y), Math.max(1, o.w * k), 1.5);
      g.fill({ color: MAP.oneWay });
      // The level kit's solids: caps, bark not broken, gates still shut (memory/level-kit.md).
      for (const c of s.caps ?? []) g.rect(X(r, c.x), Y(r, c.y), Math.max(2, c.w * k), Math.max(2, c.h * k));
      for (const b of s.bark ?? [])
        if (!save.opened.includes(`${r.id}:${b.id}`))
          g.rect(X(r, b.x), Y(r, b.y), Math.max(2, b.w * k), Math.max(2, b.h * k));
      for (const q of s.gates ?? [])
        if (!save.flags.includes(q.flag))
          g.rect(X(r, q.x), Y(r, q.y), Math.max(2, q.w * k), Math.max(2, q.h * k));
      g.fill({ color: MAP.solid, alpha: 0.6 });
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
        if (!seen(r, l.id)) {
          // Night eyes (the oak's hollow): the lamps she has not seen, still burning, as pulsing rings to hunt.
          if (nightEyes && !save.snuffed.includes(`${r.id}:${l.id}`))
            g.circle(X(r, l.x), Y(r, l.y), 5 + 1.5 * Math.sin(clock * 3 + l.x * 0.01)).stroke({
              color: MAP.lamp,
              width: 1.5,
              alpha: 0.75,
            });
          continue;
        }
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
