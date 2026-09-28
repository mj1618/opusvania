import { type Application, Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../game';
import type { SimEvent } from '../sim/events';
import { tuning } from '../sim/tuning';
import { getRoom, type Room } from '../sim/world/rooms';
import { type CameraState, createCamera, stepCamera, VIEW_H, VIEW_W } from './camera/index';
import { CombatLayer } from './combat';
import { FX_COLORS, fxTuning, Juice } from './fx';
import { makeClock } from './gfx/clock';
import { GfxPipeline } from './gfx/pipeline';
import { BagHud } from './hud';
import { KidRenderer } from './kid';
import { SignatureRenderer } from './signature';

/** Player and screen colours (terrain colours live in src/render/gfx/terrain.ts and palette.ts). */
const COLORS = {
  player: 0xe8e4d8,
  playerDash: 0x8fd3ff,
  playerEye: 0x141824,
  dashReady: 0x3fa7ff,
  dashUsed: 0x4a5064,
  deathFlash: 0xffffff,
  deathBody: 0xff5a6e,
};

/** Juice particle colours that glow (emissive) rather than being lit like dust. */
const GLOWING_FX = new Set<number>([FX_COLORS.dash, FX_COLORS.death, FX_COLORS.pogo, FX_COLORS.ring]);

const render = {
  /** Frames of fade-in after a room loads (fade-out is the sim's transition freeze). */
  fadeInFrames: 12,
  /** Chromatic aberration on hits: camera trauma below this does nothing (small bumps stay clean). */
  hitTraumaFloor: 0.35,
};

/**
 * Draws the room and player from sim state with code-drawn shapes, and owns the camera and juice
 * (both stepped once per sim step via game.afterStep). The layered pipeline (backdrop, lighting,
 * bloom, post, particles) is `gfx` (src/render/gfx/pipeline.ts). Read-only with respect to the sim.
 */
export class WorldRenderer {
  /** Moved by the camera, lit by the light map: terrain, door labels, dust (actors: gfx.layers.actors). */
  readonly world = new Container({ label: 'world' });
  /** World-space debug overlays (unlit, un-graded). */
  readonly overlay = new Container({ label: 'debug-overlay' });
  /** Screen-space layer (HUD, fades). */
  readonly screen = new Container({ label: 'screen' });
  readonly gfx: GfxPipeline;
  private readonly tiles = new Graphics();
  private readonly labels = new Container();
  private readonly fxBack = new Graphics();
  private readonly player = new Graphics();
  private readonly fxFront = new Graphics();
  /** Kid's gloves, Seize hand, Levy arm, Swallow ring, Count (over her body). */
  private readonly kidFront = new Graphics();
  private readonly kidGlow = new Graphics({ label: 'kid-glow' });
  /** Prompts, lots, poofs (world) and screen beats (CLEARED, flashes). */
  private readonly combatFront = new Graphics();
  private readonly combatGlow = new Graphics({ label: 'combat-glow' });
  private readonly combatScreen = new Graphics();
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
  /** L3 signature-mechanic readability layer (sources, levied, enemies, bag HUD). */
  readonly sig: SignatureRenderer;
  readonly bagHud: BagHud;
  readonly kid: KidRenderer;
  readonly combat: CombatLayer;
  private builtRoomVersion = -1;
  private fadeIn = 0;

  constructor(
    readonly app: Application,
    private readonly game: Game,
  ) {
    this.gfx = new GfxPipeline(app, this.world);
    this.sig = new SignatureRenderer(game);
    this.bagHud = new BagHud(game);
    this.kid = new KidRenderer(game);
    this.combat = new CombatLayer(game);
    // Terrain, labels and dust are lit; the L3 readability layer, the player and front juice are
    // unlit actors (a hum or a telegraph must never depend on a lamp), and sources glow.
    this.world.addChild(this.tiles, this.labels, this.fxBack);
    this.gfx.layers.actors.addChild(
      this.sig.back,
      this.sig.enemyLayer,
      this.player,
      this.kidFront,
      this.fxFront,
      this.sig.front,
      this.combatFront,
    );
    this.gfx.layers.emissive.addChild(this.sig.glow, this.kidGlow, this.combatGlow);
    this.gfx.lights.providers.add((out) => this.sig.lights(out));
    this.gfx.layers.overlay.addChild(this.overlay);
    this.gfx.layers.ui.addChildAt(this.screen, 0);
    this.hud = new Text({
      text: '',
      style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, fill: 0xaab3c8 },
    });
    this.hud.position.set(24, 18);
    this.screen.addChild(this.bagHud.container, this.combatScreen, this.flash, this.fade, this.hud);
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
    this.sig.step(events);
    this.kid.step(events);
    this.combat.step(events);
    this.bagHud.step(events);
    this.gfx.step();
  }

  private syncRoom(room: Room): void {
    if (this.builtRoomVersion === this.game.roomVersion) return;
    this.buildRoom(room);
    this.builtRoomVersion = this.game.roomVersion;
    this.camera = createCamera(this.game.state, room);
    this.prevCam = { ...this.camera };
    this.juice.reset();
    this.sig.reset();
    this.kid.reset();
    this.combat.reset();
    this.bagHud.reset();
  }

  private buildRoom(room: Room): void {
    const ts = tuning.world.tileSize;
    // Terrain, lights, backdrop, particles: the gfx pipeline (src/render/gfx).
    this.gfx.buildRoom(room, this.tiles.clear());
    for (const c of this.labels.removeChildren()) c.destroy();
    for (const e of room.entities) {
      if (e.kind !== 'door') continue;
      const x = e.tx * ts;
      const y = e.ty * ts;
      const target = e.to ? getRoomSafe(e.to) : undefined;
      const label = new Text({
        text: `${e.to?.replace('gym-', '') ?? '?'}\n${target?.name ?? ''}`,
        style: {
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 16,
          fill: 0xe4dccb,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 150,
        },
      });
      label.anchor.set(0.5, 1);
      label.position.set(x + ts / 2, y - ts - 22);
      this.labels.addChild(label);
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
    const cx = Math.round(camX);
    const cy = Math.round(camY);
    // gfx.draw sets this too; set it first so the bag HUD and rects() see this frame's camera.
    this.world.position.set(-cx, -cy);

    this.drawPlayer(px, py);
    this.sig.draw(alpha, { x: px, y: py });
    this.kidFront.clear();
    this.kidGlow.clear();
    this.kid.draw(this.kidFront, this.kidGlow, { x: px, y: py });
    this.combatFront.clear();
    this.combatGlow.clear();
    this.combat.draw(this.combatFront, this.combatGlow);
    this.bagHud.draw(this.world.position);
    this.drawFx();
    this.drawScreen(alpha);
    const dead = p.state === 'dead';
    const trauma = Math.max(c0.trauma, c1.trauma);
    this.gfx.draw({
      clock: makeClock(state.frame, alpha, this.gfx.framesInRoom),
      camX: cx,
      camY: cy,
      player: {
        x: px + p.w / 2,
        y: py + p.h * 0.4,
        dashing: p.state === 'dash',
        visible: !dead || this.juice.death !== null,
      },
      hit: Math.max(
        (trauma - render.hitTraumaFloor) / (1 - render.hitTraumaFloor),
        this.juice.screenFlash / fxTuning.deathScreenFlash,
      ),
    });
  }

  private drawPlayer(px: number, py: number): void {
    const p = this.game.state.player;
    const g = this.player.clear();
    const glow = this.gfx.playerGlow.clear();
    if (p.down) {
      // Down for her Count: lying on the floor (KidRenderer draws the ring over her).
      this.player.visible = true;
      this.player.alpha = 1;
      this.kid.drawDown(g, p);
      this.player.position.set(Math.round(px + p.w / 2), Math.round(py + p.h));
      this.player.scale.set(1, 1);
      return;
    }
    if (p.state === 'dead') {
      this.drawDeathPop();
      return;
    }
    this.player.visible = true;
    const w = p.w;
    const h = p.h;
    const [kx, ky] = this.sig.kidScale();
    const body =
      this.kid.tint() ?? this.sig.kidTint() ?? (p.state === 'dash' ? COLORS.playerDash : COLORS.player);
    g.roundRect(-w / 2, -h, w, h, 10).fill(body);
    // Dash-ready band (Celeste's hair-colour trick): blue when an air dash is available. It is
    // emissive (glows through bloom), so dash readiness reads even in dark rooms.
    if (p.abilities.dash) {
      const ready = p.grounded || p.airDash > 0;
      g.rect(-w / 2, -h * 0.55, w, 10).fill(ready ? COLORS.dashReady : COLORS.dashUsed);
      if (ready) glow.rect(-w / 2, -h * 0.55, w, 10).fill({ color: COLORS.dashReady, alpha: 0.7 });
    }
    if (p.state === 'dash')
      glow.roundRect(-w / 2, -h, w, h, 10).fill({ color: COLORS.playerDash, alpha: 0.35 });
    const eyeX = p.facing > 0 ? w / 2 - 14 : -w / 2 + 6;
    g.rect(eyeX, -h + 18, 8, 12).fill(COLORS.playerEye);
    for (const n of [this.player, this.gfx.playerGlow]) {
      n.position.set(Math.round(px + w / 2), Math.round(py + h));
      n.scale.set(this.juice.sx * kx, this.juice.sy * ky);
    }
    this.player.alpha = this.sig.kidAlpha() * this.kid.alpha();
  }

  /** Canvas-px rects of L3 things as last drawn (for the E readability checks). */
  rects(): import('../debug/api').RenderRect[] {
    const ox = this.world.position.x;
    const oy = this.world.position.y;
    const out = this.sig
      .worldRects()
      .filter((r) => r.kind !== 'plate')
      .map((r) => ({ ...r, x: Math.round(r.x + ox), y: Math.round(r.y + oy) }));
    return [...out, ...this.bagHud.slotRects().map((r) => ({ ...r }))];
  }

  /** Death: the body flashes white, turns red and swells for the hold, then pops (juice burst). */
  private drawDeathPop(): void {
    const d = this.juice.death;
    this.player.visible = d !== null;
    this.player.alpha = 1;
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
    // Energetic juice (dash, death, pogo, rings) also draws into the emissive layer so it glows;
    // dust stays matte and lit.
    const glow = this.gfx.fxGlow.clear();
    for (const ai of this.juice.afterimages) {
      const t = ai.age / fxTuning.afterimageLife;
      back.roundRect(ai.x, ai.y, ai.w, ai.h, 10).fill({ color: COLORS.playerDash, alpha: 0.45 * (1 - t) });
      glow.roundRect(ai.x, ai.y, ai.w, ai.h, 10).fill({ color: COLORS.playerDash, alpha: 0.25 * (1 - t) });
    }
    for (const q of this.juice.particles) {
      const t = q.age / q.life;
      const alpha = 1 - t;
      const s = q.size * (1 - t * 0.5);
      const g = GLOWING_FX.has(q.color) ? glow : null;
      if (q.shape === 'streak') {
        front.rect(q.x - s, q.y - 2, s * 2, 4).fill({ color: q.color, alpha });
        g?.rect(q.x - s, q.y - 2, s * 2, 4).fill({ color: q.color, alpha: alpha * 0.6 });
      } else {
        back.rect(q.x - s / 2, q.y - s / 2, s, s).fill({ color: q.color, alpha });
        g?.rect(q.x - s / 2, q.y - s / 2, s, s).fill({ color: q.color, alpha: alpha * 0.6 });
      }
    }
  }

  private drawScreen(alpha: number): void {
    const s = this.game.state;
    const room = getRoom(s.roomId);
    let fade = 0;
    if (s.transition) fade = 1 - (s.transition.timer - alpha) / tuning.world.transitionFrames;
    else if (this.fadeIn > 0) fade = (this.fadeIn - alpha) / render.fadeInFrames;
    fade = Math.min(1, Math.max(0, fade, this.kid.screenDim()));
    this.combatScreen.clear();
    this.combat.drawScreen(this.combatScreen);
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
    const text = `${room.id}  ${room.name}   [${ab || 'no abilities'}]   deaths ${s.run.deaths}${
      stats.goal ? '   GOAL' : ''
    }${stats.optional ? '  +g' : ''}${this.hudExtra ? `   ${this.hudExtra}` : ''}`;
    if (this.hud.text !== text) this.hud.text = text;
    this.hud.visible = this.gfx.toggles.ui;
    this.bagHud.container.visible = this.gfx.toggles.ui && s.player.abilities.seize;
    this.labels.visible = this.gfx.toggles.ui;
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
