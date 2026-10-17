import { AudioDirector } from './audio/index';
import { installDebugApi } from './debug/api';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { PrologueDirector } from './prologue';
import { createApp } from './render/app';
import { RenderStage } from './render/stage';
import { GROVE } from './scene/index';
import { tuning } from './sim/tuning';

/** Longest render-time step fed to the renderers, so a stall never explodes a spring. */
const MAX_RENDER_DT = 0.1;

/**
 * Boot. URL params: ?seed=<n>, ?manual (start paused; drive via __game.step), ?hitboxes,
 * ?nopickups (the scene without its glints, lumen pods, enemies, lanterns and heart, so without the HUD: clean plates
 * for the look tools), ?skipprologue (straight into the Grove; also implied by ?manual), ?prologue (play the opening
 * even under ?manual: then `__game.prologue.advance(n)` drives it), ?audio (sound on for review; ?audio=0 off).
 * Keys: arrows/WASD move, Z/Space/K jump, X/L/Shift dash, Down+Jump drops through branches,
 * F2 collision overlay, ` tuning panel, R restart, M sound on / off (muted by default: src/audio).
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const input = new InputSampler();
  const scene = params.has('nopickups')
    ? { ...GROVE, pickups: [], pods: [], enemies: [], lanterns: [], lamps: [], heart: undefined }
    : GROVE;
  const manual = params.has('manual');
  const playPrologue = params.has('prologue') || (!params.has('skipprologue') && !manual);
  let prologue: PrologueDirector | null = null;
  // While the prologue plays it decides what she may press (nothing in its cinematic beats; the moves Sorrel has shown).
  const game = new Game(tuning, scene, seed, () => {
    const i = input.sample();
    return prologue && !prologue.done ? prologue.mask(i) : i;
  });
  if (manual) game.mode = 'manual';

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const ga = await createApp(root);
  const stage = new RenderStage(ga, game);
  const panel = new TuningPanel(tuning, () => game.reset());
  if (params.has('hitboxes')) stage.overlay.toggle(true);
  if (playPrologue) prologue = new PrologueDirector(game, stage, !manual, scene);
  // Sound reads the sim and the camera like render does; it scores the prologue from the director's plan (read-only).
  const audio = new AudioDirector(game, params);
  audio.prologue = () => (prologue ? { plan: prologue.plan, done: prologue.done } : null);
  audio.install();
  stage.afterUpdate.add(() => audio.update(stage.clock, stage.view, !!prologue && !prologue.done));
  panel.addAudio(() => audio.applyVolumes());
  installDebugApi({ game, ga, stage, panel, prologue, audio });
  // The key legend waits for the prologue to hand over.
  const hint = document.getElementById('hint');
  if (prologue && hint) hint.style.opacity = '0';
  const soundKey = document.getElementById('sound-key');
  const showSound = (muted: boolean) => {
    if (soundKey) soundKey.textContent = muted ? 'M sound' : 'M mute';
  };
  showSound(audio.muted);
  audio.onChange = showSound;

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.repeat) return;
    if (e.code === 'Escape' && prologue && !prologue.done) prologue.skip();
    else if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F2') {
      stage.overlay.toggle();
      e.preventDefault();
    } else if (e.code === 'KeyR') game.reset();
    else if (e.code === 'KeyM') audio.toggle();
  });

  const loop = new FixedStepLoop(1000 / 60);
  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = now - last;
    last = now;
    const resized = ga.fitWindow();
    if (resized) stage.resize();
    const dt = Math.min(loop.snap(elapsed) / 1000, MAX_RENDER_DT);
    if (prologue?.done && hint?.style.opacity === '0') hint.style.opacity = '';
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
