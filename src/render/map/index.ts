/**
 * The map (docs/design/tech.md §4, memory/world.md; drawn in the game's hand since the Canopy r10, review r9 #4: it
 * was the greybox debug overlay with room ids). The rooms she has visited as their carved air, washed in moonlight on
 * a sheet of dark bark (paint.ts bakes it); where she is, the moon patches she has seen (the one she last rested at
 * ringed), the lamps she has seen (warm points; a freed trap lamp a cool ring, a spent one a husk), glades not taken,
 * moth-stones she has read, and exits she has seen but not gone through (small chevrons: the way on). A moth-stone she
 * has read (memory/level-kit.md) draws its whole area: rooms she has not been in show faint, with a faint warm ring
 * for each of the area's lamps she has not seen. The region's name is the only text.
 *
 * Tab opens and closes it (main.ts pauses the game while it is open). Screen space, over the HUD. It unrolls from the
 * top (`MAP.unroll`). A map station (`mapStation`: resting at the hub's patch, the Canopy r9) shows it for a few
 * seconds without pausing (`MAP.flash`): it unrolls over the scene, holds, and fades out; Tab during it opens it for
 * good. Reads the game; never writes it.
 */
import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game } from '../../game';
import { WORLD_FILES } from '../../scene/index';
import { upgradesOwned } from '../../sim/upgrades';
import type { WorldRoom } from '../../sim/world';
import { SAFE_H, SAFE_W, type ViewSize } from '../contract';
import { bakeMap, isTrap, MAP_RES, type MapFrame, type MapRoom, mapTally, mothPath } from './paint';

const MAP = {
  backdrop: 0x050403,
  backdropAlpha: 0.9,
  /** Margin round the rooms inside the safe area, logical px; the sheet reaches `sheetPad` past the rooms. */
  margin: 150,
  sheetPad: 64,
  /** Room for the region's name over the rooms, logical px. */
  nameRoom: 40,
  /** The map is never drawn bigger than this many logical px per world px. */
  maxScale: 1 / 8,
  /** Seconds between redraws of what moves while open (her mark pulses). */
  redraw: 1 / 30,
  /** Seconds the sheet takes to unroll from the top. */
  unroll: 0.4,
  /** A map station's glimpse: seconds in, held, out, and the backdrop's alpha (the scene shows through a little). */
  flash: { in: 0.4, hold: 2.6, out: 0.8, backdrop: 0.78 },
} as const;

/** A world's name on its map, by its file's id (src/scene/index.ts `WORLD_FILES`). */
const NAMES: Record<string, string> = {
  canopy: 'The Canopy',
  game: 'The Wood',
  'proto-1': 'Lanternroot',
  downwood: 'The Downwood',
};

/** Every area of every world file (a moth-stone names its area by id; ids are unique across worlds). */
const AREAS = Object.values(WORLD_FILES).flatMap((f) => f.areas);

export class MapOverlay {
  readonly layer = new Container({ label: 'map' });
  private readonly back = new Graphics();
  /** The sheet and everything on it (masked while it unrolls). */
  private readonly sheet = new Container({ label: 'map-sheet' });
  private readonly baked = new Sprite();
  private readonly live = new Graphics();
  private readonly roll = new Graphics();
  private readonly mask = new Graphics();
  private bakeKey = '';
  private since = 1;
  /** Seconds since it began to unroll. */
  private opened = 0;
  open = false;
  /** A map station opens the map by itself; not in `?manual` (captures, look:check: it covered their frames). */
  glimpse = true;
  /** A map station's glimpse: seconds since it began (null: none). */
  private flashT: number | null = null;
  private hooked: Game | null = null;

  constructor() {
    this.sheet.addChild(this.baked, this.live);
    this.sheet.mask = this.mask;
    this.layer.addChild(this.back, this.sheet, this.mask, this.roll);
    this.layer.visible = false;
    this.layer.eventMode = 'none';
    try {
      this.glimpse = !new URLSearchParams(window.location.search).has('manual');
    } catch {
      this.glimpse = false;
    }
  }

  toggle(on = !this.open): boolean {
    this.open = on;
    this.layer.visible = on;
    this.layer.alpha = 1;
    // (Tab over a station's glimpse keeps it open as it is: it does not unroll again.)
    if (on && this.flashT === null) this.opened = 0;
    this.flashT = null;
    this.since = 1;
    return on;
  }

  /** Redraws while open (render time `dt`, `clock` s); runs a map station's glimpse. */
  update(dt: number, clock: number, game: Game, v: ViewSize): void {
    // (Listens for the station on the game's steps: read only.)
    if (this.hooked !== game) {
      this.hooked = game;
      game.afterStep.add((events) => {
        if (this.glimpse && !this.open && events.some((e) => e.type === 'mapStation')) {
          this.flashT = 0;
          this.opened = 0;
          this.since = 1;
        }
      });
    }
    if (!this.open && this.flashT !== null) {
      const F = MAP.flash;
      this.flashT += dt;
      const t = this.flashT;
      const a = t < F.in + F.hold ? 1 : 1 - (t - F.in - F.hold) / F.out;
      if (a <= 0) {
        this.flashT = null;
        this.layer.visible = false;
        this.layer.alpha = 1;
        return;
      }
      this.layer.visible = true;
      this.layer.alpha = a * a * (3 - 2 * a);
      this.opened += dt;
      this.since += dt;
      if (this.since < MAP.redraw && dt > 0 && this.opened > MAP.unroll) return;
      this.since = 0;
      this.draw(clock, game, v, F.backdrop);
      return;
    }
    if (!this.open) return;
    this.opened += dt;
    this.since += dt;
    if (this.since < MAP.redraw && dt > 0 && this.opened > MAP.unroll) return;
    this.since = 0;
    this.draw(clock, game, v);
  }

  /** The rooms to draw: visited, and those a read moth-stone drew. */
  private plan(game: Game): { rooms: MapRoom[]; areas: Set<string> } {
    const save = game.state.save;
    const world = game.world;
    const here = game.state.room;
    const areas = new Set<string>();
    for (const r of Object.values(world?.rooms ?? {}))
      for (const m of r.scene.mothStones ?? []) if (save.taken.includes(`${r.id}:${m.id}`)) areas.add(m.area);
    const revealed = new Set(AREAS.filter((a) => areas.has(a.id)).flatMap((a) => a.rooms));
    const known = (r: WorldRoom) => save.visited.includes(r.id) || r.id === here;
    let rooms: WorldRoom[] = world
      ? Object.values(world.rooms).filter((r) => r.placed && (known(r) || revealed.has(r.id)))
      : [];
    // A room outside the world (a test room): just that room, unless a stone has drawn an area.
    if (!rooms.some((r) => r.id === here) && revealed.size === 0) rooms = [];
    if (rooms.length === 0) rooms.push({ id: here, x: 0, y: 0, placed: false, scene: game.scene });
    return { rooms: rooms.map((r) => ({ r, known: known(r) })), areas };
  }

  private name(game: Game): string {
    const start = game.world?.start;
    for (const [id, f] of Object.entries(WORLD_FILES)) if (f.start === start) return NAMES[id] ?? '';
    return '';
  }

  private draw(clock: number, game: Game, v: ViewSize, backdrop: number = MAP.backdropAlpha): void {
    const save = game.state.save;
    const here = game.state.room;
    const { rooms, areas } = this.plan(game);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const { r } of rooms) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.scene.width);
      y1 = Math.max(y1, r.y + r.scene.height);
    }
    const k = Math.min(
      MAP.maxScale,
      (SAFE_W - 2 * MAP.margin) / (x1 - x0),
      (SAFE_H - 2 * MAP.margin - MAP.nameRoom) / (y1 - y0),
    );
    const ox = SAFE_W / 2 - ((x0 + x1) / 2) * k;
    const oy = SAFE_H / 2 + MAP.nameRoom / 2 - ((y0 + y1) / 2) * k;
    const pad = MAP.sheetPad;
    const f: MapFrame = {
      k,
      ox,
      oy,
      x0: Math.max(v.left + 24, ox + x0 * k - pad),
      y0: Math.max(v.top + 24, oy + y0 * k - pad - MAP.nameRoom),
      x1: Math.min(v.left + v.w - 24, ox + x1 * k + pad),
      y1: Math.min(v.top + v.h - 24, oy + y1 * k + pad),
    };
    // Never narrower than a third of the view (a single small room's map is still a sheet).
    const minW = SAFE_W * 0.42;
    if (f.x1 - f.x0 < minW) {
      const c = (f.x0 + f.x1) / 2;
      f.x0 = c - minW / 2;
      f.x1 = c + minW / 2;
    }

    const key = [
      here,
      v.w,
      v.h,
      v.left,
      v.top,
      save.visited.length,
      save.seen.length,
      save.taken.length,
      save.snuffed.length,
      save.opened.length,
      save.crossed.length,
      save.flags.length,
      save.patch ? `${save.patch.room}:${save.patch.id}` : '',
    ].join('|');
    if (key !== this.bakeKey && typeof document !== 'undefined') {
      this.bakeKey = key;
      const unseen: Array<{ x: number; y: number; n: number }> = [];
      for (const a of AREAS) {
        if (!areas.has(a.id)) continue;
        const inA = rooms.filter((m) => a.rooms.includes(m.r.id)).map((m) => m.r);
        if (inA.length === 0) continue;
        let n = 0;
        for (const r of inA)
          for (const l of r.scene.lures ?? [])
            if (!save.seen.includes(`${r.id}:${l.id}`) && !save.snuffed.includes(`${r.id}:${l.id}`)) n++;
        const top = inA.reduce((b, r) => (r.y < b.y || (r.y === b.y && r.x < b.x) ? r : b));
        if (n > 0) unseen.push({ x: ox + top.x * k + 10, y: oy + top.y * k + 10, n });
      }
      const c = bakeMap({
        rooms,
        frame: f,
        save,
        here,
        w: v.w,
        h: v.h,
        left: v.left,
        top: v.top,
        name: this.name(game),
        tally: mapTally(Object.values(game.world?.rooms ?? {}), save.snuffed) ?? undefined,
        unseen,
      });
      const old = this.baked.texture;
      const source = new CanvasSource({ resource: c, resolution: MAP_RES });
      source.scaleMode = 'linear';
      this.baked.texture = new Texture({ source });
      if (old && old !== Texture.EMPTY) old.destroy(true);
      this.baked.position.set(v.left, v.top);
    }

    this.back.clear().rect(v.left, v.top, v.w, v.h).fill({ color: MAP.backdrop, alpha: backdrop });

    // Unrolling from the top: the sheet shows down to a rolled edge (a dark rod with a moonlit lip).
    const u = Math.min(1, this.opened / MAP.unroll);
    const e = 1 - (1 - u) ** 3;
    const ry = f.y0 - 10 + (f.y1 - f.y0 + 20) * e;
    this.mask
      .clear()
      .rect(v.left, v.top, v.w, ry - v.top)
      .fill(0xffffff);
    this.roll.clear();
    if (u < 1) {
      const rx0 = f.x0 - 6;
      const rx1 = f.x1 + 6;
      this.roll
        .roundRect(rx0, ry - 7, rx1 - rx0, 14, 7)
        .fill({ color: 0x1d1610 })
        .moveTo(rx0 + 6, ry - 3)
        .lineTo(rx1 - 6, ry - 3)
        .stroke({ color: 0xdce7e4, width: 1, alpha: 0.35 });
      this.roll.alpha = 1 - u * u;
    }

    // What moves: the trap lamps' moths, the night eyes' rings, her mark.
    const g = this.live.clear();
    const nightEyes = upgradesOwned(save).includes('nightEyes');
    for (const { r, known } of rooms) {
      if (!known && !nightEyes) continue;
      for (const l of r.scene.lures ?? []) {
        const lx = ox + (r.x + l.x) * k;
        const ly = oy + (r.y + l.y) * k;
        const out = save.snuffed.includes(`${r.id}:${l.id}`);
        if (!save.seen.includes(`${r.id}:${l.id}`)) {
          // Night eyes (the oak's hollow): the lamps she has not seen, still burning, as pulsing rings to hunt.
          if (nightEyes && !out)
            g.circle(lx, ly, 5 + 1.5 * Math.sin(clock * 3 + l.x * 0.01)).stroke({
              color: 0xffc45a,
              width: 1.5,
              alpha: 0.75,
            });
          continue;
        }
        if (out || !isTrap(l)) continue;
        // A trap lamp still burning: a few moths circling it.
        for (let i = 0; i < 4; i++) {
          const a = clock * (1.6 + i * 0.25) + i * 1.7;
          const rr = 6 + (i % 2) * 2.5;
          g.circle(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr * 0.7, 0.9).fill({
            color: 0xf2e6cc,
            alpha: 0.8,
          });
        }
      }
    }
    const cur = rooms.find((m) => m.r.id === here)?.r;
    if (cur) {
      const p = game.state.player;
      const px = ox + (cur.x + p.x + p.w / 2) * k;
      const py = oy + (cur.y + p.y + p.h / 2) * k;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
      g.circle(px, py, 10 + 5 * pulse).fill({ color: 0xdce7e4, alpha: 0.08 + 0.08 * (1 - pulse) });
      g.circle(px, py, 12 + 6 * pulse).stroke({ color: 0xdce7e4, width: 1, alpha: 0.25 + 0.3 * (1 - pulse) });
      // Wing: a small pale moth, its wings beating slowly.
      const beat = 0.8 + 0.2 * Math.sin(clock * 5);
      for (const q of mothPath(px, py, 4.2)) {
        const pts = q.map((c, i) => (i % 2 === 0 ? px + (c - px) * beat : c));
        g.poly(pts).fill({ color: 0xf4f8f8 });
      }
      g.circle(px, py - 0.4, 0.9).fill({ color: 0x6fd6ff });
    }
  }

  destroy(): void {
    if (this.baked.texture !== Texture.EMPTY) this.baked.texture.destroy(true);
    this.layer.destroy({ children: true, context: true });
  }
}
