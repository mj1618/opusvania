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
import { KidRig } from './rig/index';
import { SignatureRenderer } from './signature';

/** Screen colours (Kid's look lives in src/render/rig/look.ts; terrain in src/render/gfx). */
const COLORS = {
  deathFlash: 0xffffff,
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
  /** Kid Tallow's cutout rig (src/render/rig): body, secondary motion, smears, glow. */
  readonly rig: KidRig;
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
    this.rig = new KidRig(game);
    this.combat = new CombatLayer(game);
    // Terrain, labels and dust are lit; the L3 readability layer, the player and front juice are
    // unlit actors (a hum or a telegraph must never depend on a lamp), and sources glow.
    this.world.addChild(this.tiles, this.labels, this.fxBack);
    this.gfx.layers.actors.addChild(
      this.sig.back,
      this.sig.enemyLayer,
      this.rig.node,
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
    this.rig.step(events);
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
    this.rig.reset();
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

    this.drawPlayer(px, py, a);
    this.sig.draw(alpha, { x: px, y: py });
    this.kidFront.clear();
    this.kidGlow.clear();
    this.kid.draw(this.kidFront, this.kidGlow, { x: px, y: py }, this.rig.hands);
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

  private drawPlayer(px: number, py: number, alpha: number): void {
    const d = this.juice.death;
    this.rig.draw(this.gfx.playerGlow.clear(), {
      kid: { x: px, y: py },
      alpha,
      squash: [this.juice.sx, this.juice.sy],
      weight: this.sig.kidScale(),
      tint: this.kid.tint() ?? this.sig.kidTint(),
      // No i-frame flicker while she's down for her Count: the pose must read.
      opacity: this.game.state.player.down ? 1 : this.sig.kidAlpha() * this.kid.alpha(),
      deathAge: d ? d.age : null,
      deathHold: fxTuning.deathHoldFrames,
      deathPopScale: fxTuning.deathPopScale,
    });
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

  private drawFx(): void {
    const back = this.fxBack.clear();
    const front = this.fxFront.clear();
    // Energetic juice (dash, death, pogo, rings) also draws into the emissive layer so it glows;
    // dust stays matte and lit.
    const glow = this.gfx.fxGlow.clear();
    // Slip afterimages are Kid's own silhouette, drawn by the rig.
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
