import { installDebugApi } from './debug/api';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { RenderStage } from './render/stage';
import { GROVE } from './scene/index';
import { tuning } from './sim/tuning';

/** Longest render-time step fed to the renderers, so a stall never explodes a spring. */
const MAX_RENDER_DT = 0.1;

/**
 * Boot. URL params: ?seed=<n>, ?manual (start paused; drive via __game.step), ?hitboxes,
 * ?nopickups (the scene without its glints, lumen pods and so without the counter: clean plates for the
 * look tools).
 * Keys: arrows/WASD move, Z/Space/K jump, X/L/Shift dash, Down+Jump drops through branches,
 * F2 collision overlay, ` tuning panel, R restart.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const input = new InputSampler();
  const scene = params.has('nopickups') ? { ...GROVE, pickups: [], pods: [] } : GROVE;
  const game = new Game(tuning, scene, seed, () => input.sample());
  if (params.has('manual')) game.mode = 'manual';

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const ga = await createApp(root);
  const stage = new RenderStage(ga, game);
  const panel = new TuningPanel(tuning, () => game.reset());
  if (params.has('hitboxes')) stage.overlay.toggle(true);
  installDebugApi({ game, ga, stage, panel });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.repeat) return;
    if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F2') {
      stage.overlay.toggle();
      e.preventDefault();
    } else if (e.code === 'KeyR') game.reset();
  });

  const loop = new FixedStepLoop(1000 / 60);
  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    const resized = ga.fitWindow();
    if (resized) stage.resize();
    const dt = Math.min(loop.snap(elapsed) / 1000, MAX_RENDER_DT);
    if (game.mode === 'realtime') {
      const n = loop.advance(elapsed);
      for (let i = 0; i < n; i++) game.stepOnce();
      stage.update(dt, loop.alpha);
      stage.present();
    } else {
      loop.reset();
      input.flush();
      if (game.mode === 'frozen') {
        stage.update(dt, 1);
        stage.present();
      } else if (resized) {
        // Manual: the debug API draws on step()/tick(); only a resize needs a redraw here.
        stage.update(0, 1);
        stage.present();
      }
    }
    requestAnimationFrame(frame);
  };
  stage.update(0, 1);
  stage.present();
  requestAnimationFrame(frame);
  document.body.dataset.ready = 'true';
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
