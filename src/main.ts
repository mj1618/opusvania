import { AudioSystem } from './audio/index';
import { installDebugApi } from './debug/api';
import { HitboxOverlay } from './debug/overlay';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { VIEW_H, VIEW_W } from './render/camera';
import { WorldRenderer } from './render/world';
import { tuning } from './sim/tuning';

/**
 * Boot. URL params: ?seed=<n> &room=<id> &spawn=<name> &manual (start paused; drive via __game.step).
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
  const overlay = new HitboxOverlay(game);
  renderer.overlay.addChild(overlay.g);
  const panel = new TuningPanel(tuning, () => game.load(game.state.roomId));
  // Audio listens at the camera centre (the world container is offset by -camera).
  const audio = new AudioSystem({
    bus: game.bus,
    state: () => game.state,
    listener: () => ({ x: -renderer.world.x + VIEW_W / 2, y: -renderer.world.y + VIEW_H / 2 }),
  });

  const render = (alpha: number) => {
    renderer.draw(alpha);
    overlay.draw();
    app.render();
    audio.update();
  };
  installDebugApi({ game, app, render, overlay, panel, audio: audio.debug });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F2') {
      overlay.toggle();
      e.preventDefault();
    }
  });

  const loop = new FixedStepLoop(1000 / 60);
  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    let alpha = 1;
    if (game.mode === 'realtime') {
      const n = loop.advance(elapsed);
      for (let i = 0; i < n; i++) game.stepOnce();
      alpha = loop.alpha;
    } else {
      loop.reset();
    }
    render(alpha);
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
