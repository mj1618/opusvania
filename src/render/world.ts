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
import { drawImpacts } from './juice/draw';
import { ImpactDirector } from './juice/impact';
import { SoundViz } from './juice/soundviz';
import { JUICE } from './juice/tuning';
import { KidRenderer } from './kid';
import { colourHex } from './palette';
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
  /** Combat juice (src/render/juice): over everything in the world, and its emissive copy. */
  private readonly juiceFront = new Graphics({ label: 'juice' });
  private readonly juiceGlow = new Graphics({ label: 'juice-glow' });
  /** Screen-space juice: letterbox bars in slow motion, the impact-frame fallback without post. */
  private readonly juiceScreen = new Graphics({ label: 'juice-screen' });
  /** The impact director (hit sparks, kick, zoom, impact frames, slow motion). */
  readonly impact = new ImpactDirector();
  /** Sound made visible (tear ribbons, levy trails). */
  readonly soundViz = new SoundViz();
  /** Last drawn render zoom (rects() maps world px through it): screen = unzoomed * z + o. */
  private lastZoom = { z: 1, ox: 0, oy: 0 };
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
      this.juiceFront,
    );
    this.gfx.layers.emissive.addChild(this.sig.glow, this.kidGlow, this.combatGlow, this.juiceGlow);
    this.gfx.lights.providers.add((out) => this.sig.lights(out));
    this.gfx.layers.overlay.addChild(this.overlay);
    this.gfx.layers.ui.addChildAt(this.screen, 0);
    this.hud = new Text({
      text: '',
      style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, fill: 0xaab3c8 },
    });
    this.hud.position.set(24, 18);
    this.screen.addChild(
      this.juiceScreen,
      this.bagHud.container,
      this.combatScreen,
      this.flash,
      this.fade,
      this.hud,
    );
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
    this.impact.step(s, events, (e) => this.colourOf(e));
    this.soundViz.step(s, events);
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
    this.impact.reset();
    this.soundViz.reset();
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
    // Combat juice: the sprung kick jolts the view along the hit, trauma adds a shake on top.
    const im = this.impact;
    const sh = im.shake();
    const camX = lerp(c0.x + c0.shakeX, c1.x + c1.shakeX, alpha) - im.kx + sh.x;
    const camY = lerp(c0.y + c0.shakeY, c1.y + c1.shakeY, alpha) - im.ky + sh.y;
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
    const zoom = this.composeZoom(alpha, cx, cy, px + p.w / 2, py + p.h / 2);
    this.lastZoom = zoom;
    this.bagHud.draw(this.world.position, zoom);
    this.drawFx();
    this.juiceFront.clear();
    this.juiceGlow.clear();
    this.soundViz.draw(
      this.juiceFront,
      this.juiceGlow,
      state,
      { x: px, y: py },
      state.frame,
      this.rig.hands.sack,
    );
    drawImpacts(this.juiceFront, this.juiceGlow, im);
    const impactOn = im.impactFrames > 0 ? 1 : 0;
    this.drawJuiceScreen(impactOn && !this.gfx.postOn ? im.impactColor : -1);
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
        im.aberration,
      ),
      impact: impactOn,
      impactColor: im.impactColor,
      drama: im.drama(),
      zoom,
    });
  }

  /**
   * The render zoom this frame: combat framing (about a focus that keeps Kid in frame) composed
   * with the hit punch / slow-mo zoom (about the impact). Zooming in about a point inside the view
   * never shows past the camera's room clamp.
   */
  private composeZoom(
    alpha: number,
    cx: number,
    cy: number,
    kidX: number,
    kidY: number,
  ): { z: number; ox: number; oy: number } {
    const im = this.impact;
    const z1 = lerp(im.prevCzoom, im.czoom, alpha);
    const z2 = lerp(im.prevZoom, im.zoom, alpha);
    const m = JUICE.combatMargin;
    const clampF = (f: number, k: number, W: number) => {
      if (z1 <= 1.0005) return f;
      const lo = (k * z1 - (W - m)) / (z1 - 1);
      const hi = (k * z1 - m) / (z1 - 1);
      return Math.max(0, Math.min(W, Math.max(lo, Math.min(hi, f))));
    };
    const ksx = kidX - cx;
    const ksy = kidY - cy;
    const f1x = clampF(im.cfx - cx, ksx, VIEW_W);
    const f1y = clampF(im.cfy - cy, ksy, VIEW_H);
    // The punch focus, as it sits after the combat zoom.
    const f2x = Math.max(0, Math.min(VIEW_W, f1x + (im.focusX - cx - f1x) * z1));
    const f2y = Math.max(0, Math.min(VIEW_H, f1y + (im.focusY - cy - f1y) * z1));
    return {
      z: z1 * z2,
      ox: f1x * z2 * (1 - z1) + f2x * (1 - z2),
      oy: f1y * z2 * (1 - z1) + f2y * (1 - z2),
    };
  }

  /** Render time scale for the real-time loop: < 1 during slow motion (the sim is unchanged). */
  timeScale(): number {
    return this.impact.timeScale(this.game.state.hitstop);
  }

  /** The noise colour (hex) of whatever an event hit or took, for sparks and stars. */
  private colourOf(e: SimEvent): number {
    const L = this.game.state.local;
    if ('colour' in e && typeof e.colour === 'string') return colourHex(e.colour);
    const id = e.type === 'hit' ? e.target : 'enemy' in e ? e.enemy : -1;
    const en = L.enemies.find((o) => o.id === id);
    const src = en ? L.sources.find((o) => o.id === en.source) : undefined;
    const snd = src ? L.sounds.find((o) => src.soundIds.includes(o.id) && o.status === 'home') : undefined;
    return snd ? colourHex(snd.colour) : 0xfff3c4;
  }

  /** Letterbox bars while slow motion runs; a flat impact frame when the post filter is off. */
  private drawJuiceScreen(fallbackImpact: number): void {
    const g = this.juiceScreen.clear();
    const d = this.impact.drama();
    if (d > 0.01) {
      const h = Math.round(VIEW_H * 0.085 * Math.min(1, d * 1.6));
      g.rect(0, 0, VIEW_W, h).fill({ color: 0x000000, alpha: 0.92 });
      g.rect(0, VIEW_H - h, VIEW_W, h).fill({ color: 0x000000, alpha: 0.92 });
    }
    if (fallbackImpact >= 0) g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: fallbackImpact, alpha: 0.55 });
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
    // Through the render zoom (identity unless a punch or slow-mo is on).
    const { z, ox: zx, oy: zy } = this.lastZoom.z > 1.0005 ? this.lastZoom : { z: 1, ox: 0, oy: 0 };
    const out = this.sig
      .worldRects()
      .filter((r) => r.kind !== 'plate')
      .map((r) => ({
        ...r,
        x: Math.round((r.x + ox) * z + zx),
        y: Math.round((r.y + oy) * z + zy),
        w: Math.round(r.w * z),
        h: Math.round(r.h * z),
      }));
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
