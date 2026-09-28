import { AudioSystem } from './audio/index';
import { installDebugApi } from './debug/api';
import { HitboxOverlay } from './debug/overlay';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { VIEW_H, VIEW_W } from './render/camera/index';
import { isQualityName, QUALITY_NAMES } from './render/gfx/quality';
import { WorldRenderer } from './render/world';
import { PRESET_NAMES, type PresetName, tuning } from './sim/tuning';
import { GYM_ROOMS } from './sim/world/rooms';

/**
 * Boot. URL params: ?seed=<n> &room=<id> &spawn=<name> &preset=<opus|celeste|hk>
 * &manual (start paused; drive via __game.step) &quality=<low|med|high>.
 * Keys: 1-9 / 0 load gym-01..10, Shift+1-4 gym-11..14, H hub, F1/F2 hitboxes, F3 blind A/B swap
 * (debug-only; B is reserved for gameplay), F4 perf HUD (Shift+F4 cycles quality), ` tuning panel.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const input = new InputSampler();
  const game = new Game(
    tuning,
    { seed, roomId: params.get('room') ?? undefined, spawn: params.get('spawn') ?? undefined },
    () => input.sample(),
  );
  if (params.has('manual')) game.mode = 'manual';

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const app = await createApp(root);
  const renderer = new WorldRenderer(app, game);
  const gfx = renderer.gfx;
  const quality = params.get('quality');
  if (isQualityName(quality)) gfx.setQuality(quality);
  const overlay = new HitboxOverlay(game);
  renderer.overlay.addChild(overlay.g);
  const panel = new TuningPanel(tuning, {
    onRespawn: () => game.load(game.state.roomId),
    onProfile: (name) => {
      const s = JSON.parse(JSON.stringify(game.state)) as typeof game.state;
      s.player.profile = name;
      game.setState(s);
    },
    profiles: () => Object.keys(tuning.profiles),
    currentProfile: () => game.state.player.profile,
  });
  // Through the panel so it (and __game.preset()/info()) know the current preset.
  const preset = params.get('preset');
  if (preset && (PRESET_NAMES as string[]).includes(preset)) panel.applyPreset(preset as PresetName);
  // Audio listens at the camera centre (pre-shake view, so screen shake doesn't wobble panning).
  const audio = new AudioSystem({
    bus: game.bus,
    state: () => game.state,
    listener: () => ({ x: renderer.camera.x + VIEW_W / 2, y: renderer.camera.y + VIEW_H / 2 }),
  });

  const drawn = { x: 0, y: 0, frame: 0 };
  const render = (alpha: number) => {
    renderer.draw(alpha);
    overlay.draw();
    app.render();
    drawn.x = renderer.drawnPlayer.x;
    drawn.y = renderer.drawnPlayer.y;
    drawn.frame = game.state.frame;
    audio.update();
  };
  installDebugApi({ game, app, render, overlay, panel, renderer, drawn, audio: audio.debug });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F1' || e.code === 'F2') {
      overlay.toggle();
      e.preventDefault();
    } else if (e.code === 'F3') {
      e.preventDefault();
      if (!e.repeat) renderer.hudExtra = `A/B slot ${panel.swapAB()}`;
    } else if (e.code === 'F4') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.shiftKey) {
        const i = QUALITY_NAMES.indexOf(gfx.quality);
        gfx.setQuality(QUALITY_NAMES[(i + 1) % QUALITY_NAMES.length] ?? 'high');
        gfx.perfHud.visible = true;
      } else gfx.perfHud.visible = !gfx.perfHud.visible;
    } else if (e.code === 'KeyH' && !e.repeat) game.load('hub');
    else if (/^Digit\d$/.test(e.code) && !e.repeat) {
      const d = Number(e.code.slice(5));
      const n = e.shiftKey ? 10 + d : d === 0 ? 10 : d;
      const id = GYM_ROOMS[n - 1];
      if (id) game.load(id);
    }
  });

  const loop = new FixedStepLoop(1000 / 60);
  let last = performance.now();
  let lastDrawn = '';
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    if (game.mode === 'realtime') {
      gfx.perf.begin(performance.now());
      const n = loop.advance(elapsed);
      for (let i = 0; i < n; i++) game.stepOnce();
      render(loop.alpha);
      gfx.perf.end(performance.now());
      gfx.perfHud.update(gfx.perf.snapshot(), gfx.hudExtra());
    } else {
      loop.reset();
      input.flush();
      // Manual mode: the debug API renders on step()/screenshot(); only redraw here if something
      // changed (a software-GL CI runner takes ~1 s per frame, which starves page.evaluate).
      const key = `${game.state.frame}:${game.roomVersion}:${overlay.visible}:${panel.visible}`;
      if (key !== lastDrawn) {
        lastDrawn = key;
        render(1);
      }
    }
    requestAnimationFrame(frame);
  };
  render(1);
  requestAnimationFrame(frame);
  document.body.dataset.ready = 'true';
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
