import { type Application, Container, Graphics } from 'pixi.js';
import type { Game } from '../game';
import type { SimEventOf } from '../sim/events';
import type { GameState } from '../sim/index';
import { tuning } from '../sim/tuning';
import { getRoom, isSolidTile, type Room } from '../sim/world/rooms';
import { clampCamera } from './camera';

const COLORS = {
  sky: 0x141824,
  tile: 0x2b3142,
  tileEdge: 0x55607a,
  player: 0xe8e4d8,
  playerEye: 0x141824,
  dust: 0xc9c2b0,
};

interface Puff {
  x: number;
  y: number;
  bornFrame: number;
  dir: number;
  size: number;
}

/**
 * Draws the room and player from sim state with code-drawn shapes. Read-only with respect to the
 * sim: it reads `game.prev`/`game.state` and listens to events.
 */
export class WorldRenderer {
  /** Moved by the camera; debug overlays add children here to draw in world space. */
  readonly world = new Container();
  readonly overlay = new Container();
  private readonly bg = new Graphics();
  private readonly tiles = new Graphics();
  private readonly player = new Graphics();
  private readonly fx = new Graphics();
  private builtRoomVersion = -1;
  private puffs: Puff[] = [];

  constructor(
    readonly app: Application,
    private readonly game: Game,
  ) {
    app.stage.addChild(this.world);
    this.world.addChild(this.bg, this.tiles, this.fx, this.player, this.overlay);
    game.bus.on('land', (e) => this.onDust(e, 6));
    game.bus.on('jump', (e) => this.onDust(e, 3));
  }

  private onDust(e: SimEventOf<'land'> | SimEventOf<'jump'>, count: number): void {
    const frame = this.game.state.frame;
    const variant = e.type === 'land' ? e.variant : 0;
    for (let i = 0; i < count; i++) {
      const dir = (i % 2 === 0 ? 1 : -1) * (0.6 + ((i * 7 + variant * 3) % 5) * 0.2);
      this.puffs.push({ x: e.x, y: e.y, bornFrame: frame, dir, size: 6 + ((i + variant) % 3) * 3 });
    }
  }

  private buildRoom(room: Room): void {
    const ts = tuning.world.tileSize;
    this.bg
      .clear()
      .rect(0, 0, room.width * ts, room.height * ts)
      .fill(COLORS.sky);
    const g = this.tiles.clear();
    for (let ty = 0; ty < room.height; ty++) {
      for (let tx = 0; tx < room.width; tx++) {
        if (!isSolidTile(room, tx, ty)) continue;
        g.rect(tx * ts, ty * ts, ts, ts).fill(COLORS.tile);
        if (!isSolidTile(room, tx, ty - 1)) g.rect(tx * ts, ty * ts, ts, 6).fill(COLORS.tileEdge);
      }
    }
    this.puffs = [];
  }

  /** Draws the frame. alpha interpolates between game.prev and game.state. */
  draw(alpha: number): void {
    const { prev, state } = this.game;
    const room = getRoom(state.roomId);
    if (this.builtRoomVersion !== this.game.roomVersion) {
      this.buildRoom(room);
      this.builtRoomVersion = this.game.roomVersion;
    }
    const a = prev.roomId === state.roomId ? alpha : 1;
    const px = lerp(prev.player.x, state.player.x, a);
    const py = lerp(prev.player.y, state.player.y, a);
    const p = state.player;

    const ts = tuning.world.tileSize;
    const cam = clampCamera(px + p.w / 2, py + p.h / 2, room.width * ts, room.height * ts);
    this.world.position.set(-cam.x, -cam.y);

    const eyeX = p.facing > 0 ? p.w - 14 : 6;
    this.player
      .clear()
      .roundRect(0, 0, p.w, p.h, 8)
      .fill(COLORS.player)
      .rect(eyeX, 18, 8, 10)
      .fill(COLORS.playerEye);
    this.player.position.set(Math.round(px), Math.round(py));

    this.drawFx(state, alpha);
  }

  private drawFx(state: GameState, alpha: number): void {
    const LIFE = 20;
    const now = state.frame - 1 + alpha;
    this.puffs = this.puffs.filter((d) => now - d.bornFrame < LIFE);
    const g = this.fx.clear();
    for (const d of this.puffs) {
      const t = Math.max(0, now - d.bornFrame) / LIFE;
      const x = d.x + d.dir * 60 * t;
      const y = d.y - 18 * t - d.size;
      const s = d.size * (1 - t * 0.5);
      g.rect(x - s / 2, y, s, s).fill({ color: COLORS.dust, alpha: 1 - t });
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
