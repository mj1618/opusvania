import { installDebugApi } from './debug/api';
import { HitboxOverlay } from './debug/overlay';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { WorldRenderer } from './render/world';
import { applyPreset, PRESET_NAMES, type PresetName, tuning } from './sim/tuning';
import { GYM_ROOMS } from './sim/world/rooms';

/**
 * Boot. URL params: ?seed=<n> &room=<id> &spawn=<name> &preset=<opus|celeste|hk>
 * &manual (start paused; drive via __game.step).
 * Keys: 1-9 / 0 load gym-01..10, Shift+1-4 gym-11..14, H hub, B blind A/B swap, F1/F2 hitboxes,
 * ` tuning panel.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const preset = params.get('preset');
  if (preset && (PRESET_NAMES as string[]).includes(preset)) applyPreset(tuning, preset as PresetName);
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

  const drawn = { x: 0, y: 0, frame: 0 };
  const render = (alpha: number) => {
    renderer.draw(alpha);
    overlay.draw();
    app.render();
    drawn.x = renderer.drawnPlayer.x;
    drawn.y = renderer.drawnPlayer.y;
    drawn.frame = game.state.frame;
  };
  installDebugApi({ game, app, render, overlay, panel, renderer, drawn });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F1' || e.code === 'F2') {
      overlay.toggle();
      e.preventDefault();
    } else if (e.code === 'KeyB' && !e.repeat) {
      renderer.hudExtra = `A/B slot ${panel.swapAB()}`;
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
      input.flush();
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
