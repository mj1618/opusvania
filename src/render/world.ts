import { type Application, Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../game';
import type { SimEvent } from '../sim/events';
import { tuning } from '../sim/tuning';
import { getRoom, type Room, Tile, tileAt } from '../sim/world/rooms';
import { type CameraState, createCamera, stepCamera, VIEW_H, VIEW_W } from './camera/index';
import { fxTuning, Juice } from './fx';

/** Greybox palette (movement-spec §5). */
const COLORS = {
  sky: 0x141824,
  grid: 0x1c2233,
  tile: 0x2b3142,
  tileEdge: 0x55607a,
  /** Exposed side/bottom faces (L2 playtest: vertical faces read weakly against the sky). */
  tileSide: 0x444d64,
  apron: 0x232838,
  oneWay: 0x8a93a8,
  spike: 0xe0475b,
  orb: 0xffd84a,
  door: 0x0d1018,
  doorFrame: 0x6d7894,
  goal: 0x4cff9a,
  optional: 0xffc94a,
  respawn: 0x7aa2ff,
  player: 0xe8e4d8,
  playerDash: 0x8fd3ff,
  playerEye: 0x141824,
  dashReady: 0x3fa7ff,
  dashUsed: 0x4a5064,
  deathFlash: 0xffffff,
  deathBody: 0xff5a6e,
};

const render = {
  /** Frames of fade-in after a room loads (fade-out is the sim's transition freeze). */
  fadeInFrames: 12,
  /** Spikes are drawn a little taller than their lenient 32 px hitbox. */
  spikeDrawH: 40,
  /** Lit edge thickness on exposed tops, and on exposed sides/bottoms. */
  edgeTop: 6,
  edgeSide: 4,
};

/**
 * Draws the room and player from sim state with code-drawn shapes, and owns the camera and juice
 * (both stepped once per sim step via game.afterStep). Read-only with respect to the sim.
 */
export class WorldRenderer {
  /** Moved by the camera; debug overlays add children to `overlay` to draw in world space. */
  readonly world = new Container();
  readonly overlay = new Container();
  /** Screen-space layer (HUD, fades). */
  readonly screen = new Container();
  private readonly bg = new Graphics();
  private readonly tiles = new Graphics();
  private readonly labels = new Container();
  private readonly fxBack = new Graphics();
  private readonly player = new Graphics();
  private readonly fxFront = new Graphics();
  private readonly fade = new Graphics();
  private readonly flash = new Graphics();
  private readonly hud: Text;
  /** Extra HUD line set by main (e.g. blind A/B slot). */
  hudExtra = '';
  camera: CameraState;
  private prevCam: CameraState;
  readonly juice = new Juice();
  /** The player position as last drawn (interpolated, before rounding). */
  drawnPlayer = { x: 0, y: 0 };
  private builtRoomVersion = -1;
  private fadeIn = 0;

  constructor(
    readonly app: Application,
    private readonly game: Game,
  ) {
    app.stage.addChild(this.world, this.screen);
    this.world.addChild(
      this.bg,
      this.tiles,
      this.labels,
      this.fxBack,
      this.player,
      this.fxFront,
      this.overlay,
    );
    this.hud = new Text({
      text: '',
      style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, fill: 0xaab3c8 },
    });
    this.hud.position.set(24, 18);
    this.screen.addChild(this.flash, this.fade, this.hud);
    const room = getRoom(game.state.roomId);
    this.camera = createCamera(game.state, room);
    this.prevCam = { ...this.camera };
    game.afterStep.add((evs) => this.onStep(evs));
  }

  /** One sim step happened: step camera and juice (deterministic, per sim frame). */
  private onStep(events: readonly SimEvent[]): void {
    const s = this.game.state;
    const room = getRoom(s.roomId);
    this.syncRoom(room);
    this.prevCam = { ...this.camera };
    stepCamera(this.camera, s, room, events);
    if (events.some((e) => e.type === 'roomEnter')) {
      this.prevCam = { ...this.camera };
      this.fadeIn = render.fadeInFrames;
    } else if (this.fadeIn > 0) this.fadeIn--;
    this.juice.step(s, events);
  }

  private syncRoom(room: Room): void {
    if (this.builtRoomVersion === this.game.roomVersion) return;
    this.buildRoom(room);
    this.builtRoomVersion = this.game.roomVersion;
    this.camera = createCamera(this.game.state, room);
    this.prevCam = { ...this.camera };
    this.juice.reset();
  }

  private buildRoom(room: Room): void {
    const ts = tuning.world.tileSize;
    const W = room.width * ts;
    const H = room.height * ts;
    const apron = 2 * ts;
    this.bg
      .clear()
      .rect(-apron, -apron, W + 2 * apron, H + 2 * apron)
      .fill(COLORS.apron)
      .rect(0, 0, W, H)
      .fill(COLORS.sky);
    for (let x = ts; x < W; x += ts) this.bg.rect(x, 0, 2, H);
    for (let y = ts; y < H; y += ts) this.bg.rect(0, y, W, 2);
    this.bg.fill(COLORS.grid);

    const g = this.tiles.clear();
    for (const c of this.labels.removeChildren()) c.destroy();
    const solid = (tx: number, ty: number) => tileAt(room, tx, ty) === Tile.solid;
    for (let ty = 0; ty < room.height; ty++) {
      for (let tx = 0; tx < room.width; tx++) {
        const t = tileAt(room, tx, ty);
        const x = tx * ts;
        const y = ty * ts;
        if (t === Tile.solid) {
          g.rect(x, y, ts, ts).fill(COLORS.tile);
          const e = render.edgeSide;
          if (!solid(tx - 1, ty)) g.rect(x, y, e, ts).fill(COLORS.tileSide);
          if (!solid(tx + 1, ty)) g.rect(x + ts - e, y, e, ts).fill(COLORS.tileSide);
          if (!solid(tx, ty + 1)) g.rect(x, y + ts - e, ts, e).fill(COLORS.tileSide);
          if (!solid(tx, ty - 1)) g.rect(x, y, ts, render.edgeTop).fill(COLORS.tileEdge);
        } else if (t === Tile.oneWay) {
          g.rect(x, y, ts, 10).fill(COLORS.oneWay);
          g.rect(x + 8, y + 10, 4, 14).fill({ color: COLORS.oneWay, alpha: 0.5 });
          g.rect(x + ts - 12, y + 10, 4, 14).fill({ color: COLORS.oneWay, alpha: 0.5 });
          // Downward chevron: "you can drop through this" (Down+Jump).
          const cx = x + ts / 2;
          g.poly([cx - 10, y + 14, cx + 10, y + 14, cx, y + 24]).fill({ color: COLORS.oneWay, alpha: 0.6 });
        } else if (t >= Tile.spikeUp && t <= Tile.spikeRight) {
          this.drawSpikes(g, t, x, y, ts);
        } else if (t === Tile.orb) {
          const cx = x + ts / 2;
          const cy = y + ts / 2;
          g.circle(cx, cy, tuning.pogo.orbSize / 2).fill({ color: COLORS.orb, alpha: 0.25 });
          g.circle(cx, cy, tuning.pogo.orbSize / 2 - 8).fill(COLORS.orb);
          g.circle(cx, cy, 6).fill(COLORS.sky);
        }
      }
    }
    for (const e of room.entities) {
      const x = e.tx * ts;
      const y = e.ty * ts;
      if (e.kind === 'goal') {
        g.rect(x + 20, y - ts + 8, 24, 2 * ts - 8).fill({ color: COLORS.goal, alpha: 0.25 });
        g.rect(x + 26, y - ts + 14, 12, 2 * ts - 20).fill(COLORS.goal);
      } else if (e.kind === 'optionalGoal') {
        g.star(x + ts / 2, y + ts / 2, 5, 22, 10).fill(COLORS.optional);
      } else if (e.kind === 'respawn') {
        g.rect(x + 28, y + 8, 6, ts - 8).fill(COLORS.respawn);
        g.poly([x + 34, y + 8, x + 58, y + 18, x + 34, y + 28]).fill(COLORS.respawn);
      } else if (e.kind === 'door') {
        g.rect(x + 4, y - ts + 8, ts - 8, 2 * ts - 8).fill(COLORS.doorFrame);
        g.rect(x + 12, y - ts + 16, ts - 24, 2 * ts - 16).fill(COLORS.door);
        const target = e.to ? getRoomSafe(e.to) : undefined;
        const label = new Text({
          text: `${e.to?.replace('gym-', '') ?? '?'}\n${target?.name ?? ''}`,
          style: {
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 16,
            fill: 0xc9d1e4,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: 150,
          },
        });
        label.anchor.set(0.5, 1);
        label.position.set(x + ts / 2, y - ts - 6);
        this.labels.addChild(label);
      }
    }
  }

  private drawSpikes(g: Graphics, t: number, x: number, y: number, ts: number): void {
    const h = render.spikeDrawH;
    const half = ts / 2;
    for (let i = 0; i < 2; i++) {
      const o = i * half;
      let pts: number[];
      if (t === Tile.spikeUp) pts = [x + o, y + ts, x + o + half / 2, y + ts - h, x + o + half, y + ts];
      else if (t === Tile.spikeDown) pts = [x + o, y, x + o + half / 2, y + h, x + o + half, y];
      else if (t === Tile.spikeRight) pts = [x, y + o, x + h, y + o + half / 2, x, y + o + half];
      else pts = [x + ts, y + o, x + ts - h, y + o + half / 2, x + ts, y + o + half];
      g.poly(pts).fill(COLORS.spike);
    }
  }

  /** Draws the frame. alpha interpolates between the previous and current sim state. */
  draw(alpha: number): void {
    const { prev, state } = this.game;
    const room = getRoom(state.roomId);
    this.syncRoom(room);
    const p = state.player;
    const q = prev.player;
    const teleported = prev.roomId !== state.roomId || Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 200;
    const a = teleported ? 1 : alpha;
    const px = lerp(q.x, p.x, a);
    const py = lerp(q.y, p.y, a);
    this.drawnPlayer = { x: px, y: py };

    const c0 = this.prevCam;
    const c1 = this.camera;
    const camX = lerp(c0.x + c0.shakeX, c1.x + c1.shakeX, alpha);
    const camY = lerp(c0.y + c0.shakeY, c1.y + c1.shakeY, alpha);
    this.world.position.set(-Math.round(camX), -Math.round(camY));

    this.drawPlayer(px, py);
    this.drawFx();
    this.drawScreen(alpha);
  }

  private drawPlayer(px: number, py: number): void {
    const p = this.game.state.player;
    const g = this.player.clear();
    if (p.state === 'dead') {
      this.drawDeathPop();
      return;
    }
    this.player.visible = true;
    const w = p.w;
    const h = p.h;
    const body = p.state === 'dash' ? COLORS.playerDash : COLORS.player;
    g.roundRect(-w / 2, -h, w, h, 10).fill(body);
    // Dash-ready band (Celeste's hair-colour trick): blue when an air dash is available.
    if (p.abilities.dash) {
      const ready = p.grounded || p.airDash > 0;
      g.rect(-w / 2, -h * 0.55, w, 10).fill(ready ? COLORS.dashReady : COLORS.dashUsed);
    }
    const eyeX = p.facing > 0 ? w / 2 - 14 : -w / 2 + 6;
    g.rect(eyeX, -h + 18, 8, 12).fill(COLORS.playerEye);
    this.player.position.set(Math.round(px + w / 2), Math.round(py + h));
    this.player.scale.set(this.juice.sx, this.juice.sy);
  }

  /** Canvas-px rects of L3 things as last drawn (for the E readability checks). */
  rects(): import('../debug/api').RenderRect[] {
    return [];
  }

  /** Death: the body flashes white, turns red and swells for the hold, then pops (juice burst). */
  private drawDeathPop(): void {
    const d = this.juice.death;
    this.player.visible = d !== null;
    if (!d) return;
    const white = d.age < fxTuning.deathFlashFrames;
    const k = 1 + (fxTuning.deathPopScale - 1) * (d.age / fxTuning.deathHoldFrames);
    this.player
      .clear()
      .roundRect(-d.w / 2, -d.h / 2, d.w, d.h, 10)
      .fill(white ? COLORS.deathFlash : COLORS.deathBody);
    this.player.position.set(Math.round(d.x + d.w / 2), Math.round(d.y + d.h / 2));
    this.player.scale.set(k, k);
  }

  private drawFx(): void {
    const back = this.fxBack.clear();
    const front = this.fxFront.clear();
    for (const ai of this.juice.afterimages) {
      const t = ai.age / fxTuning.afterimageLife;
      back.roundRect(ai.x, ai.y, ai.w, ai.h, 10).fill({ color: COLORS.playerDash, alpha: 0.45 * (1 - t) });
    }
    for (const q of this.juice.particles) {
      const t = q.age / q.life;
      const alpha = 1 - t;
      const s = q.size * (1 - t * 0.5);
      if (q.shape === 'streak') front.rect(q.x - s, q.y - 2, s * 2, 4).fill({ color: q.color, alpha });
      else back.rect(q.x - s / 2, q.y - s / 2, s, s).fill({ color: q.color, alpha });
    }
  }

  private drawScreen(alpha: number): void {
    const s = this.game.state;
    const room = getRoom(s.roomId);
    let fade = 0;
    if (s.transition) fade = 1 - (s.transition.timer - alpha) / tuning.world.transitionFrames;
    else if (this.fadeIn > 0) fade = (this.fadeIn - alpha) / render.fadeInFrames;
    fade = Math.min(1, Math.max(0, fade));
    this.flash.clear();
    if (this.juice.screenFlash > 0)
      this.flash.rect(0, 0, VIEW_W, VIEW_H).fill({ color: COLORS.deathFlash, alpha: this.juice.screenFlash });
    this.fade.clear();
    if (fade > 0) this.fade.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: fade });
    const ab = Object.entries(s.player.abilities)
      .filter(([, on]) => on)
      .map(([k]) => k)
      .join(' ');
    const stats = s.roomStats;
    const text = `${room.id}  ${room.name}   [${ab || 'no abilities'}]   deaths ${stats.deaths}${
      stats.goal ? '   GOAL' : ''
    }${stats.optional ? '  +g' : ''}${this.hudExtra ? `   ${this.hudExtra}` : ''}`;
    if (this.hud.text !== text) this.hud.text = text;
  }
}

function getRoomSafe(id: string): Room | undefined {
  try {
    return getRoom(id);
  } catch {
    return undefined;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
