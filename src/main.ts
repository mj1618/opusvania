import { AudioDirector } from './audio/index';
import { installDebugApi } from './debug/api';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { GREYBOX } from './render/greybox/index';
import { RenderStage } from './render/stage';
import { DEFAULT_ROOM, getRoom, ROOM_IDS } from './scene/index';
import { ABILITIES } from './sim/abilities';
import { tuning } from './sim/tuning';

/** Longest render-time step fed to the renderers, so a stall never explodes a spring. */
const MAX_RENDER_DT = 0.1;

/**
 * `?abilities=all | none | glide,dash,...`: what she owns instead of the room's starting kit (null = the kit).
 */
function abilitiesParam(v: string | null): string[] | null {
  if (v === null) return null;
  if (v === 'all' || v === '') return [...ABILITIES];
  if (v === 'none') return [];
  return v.split(',').map((s) => s.trim());
}

/**
 * Boot. URL params: ?room=<id> (default content/world.json's start: wood-hatch; `test-grove` is the
 * old demo level), ?abilities=all|none|glide,wallJump,doubleJump,dash, ?seed=<n>, ?manual (start
 * paused; drive via __game.step), ?hitboxes,
 * ?nopickups (the scene without its glints, lumen pods, enemies, lanterns and heart, so without the HUD: clean plates
 * for the look tools), ?audio (sound on for review; ?audio=0 off).
 * Keys: arrows/WASD move, Z/Space/K jump, X/L/Shift dash, Down+Jump drops through branches,
 * F2 collision overlay, G greybox labels, ` tuning panel, R restart, M sound on / off (muted by default: src/audio),
 * Enter (or a double-click on the picture) full screen on / off.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const input = new InputSampler();
  const room = getRoom(params.get('room') ?? DEFAULT_ROOM);
  // The key legend is for the test bed; the game shows no text (H still brings it up).
  if (room.id === 'test-grove') document.getElementById('hint')?.classList.remove('quiet');
  const scene = params.has('nopickups')
    ? { ...room, pickups: [], pods: [], enemies: [], lanterns: [], lamps: [], heart: undefined }
    : room;
  const game = new Game(tuning, scene, seed, () => input.sample(), abilitiesParam(params.get('abilities')));
  if (params.has('manual')) game.mode = 'manual';

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const ga = await createApp(root);
  const stage = new RenderStage(ga, game);
  const panel = new TuningPanel(tuning, () => game.reset(), {
    room: room.id,
    rooms: ROOM_IDS,
    // Switching room reloads the page with ?room= (the renderers are built once per room).
    onRoom: (id) => {
      const q = new URLSearchParams(location.search);
      q.set('room', id);
      location.search = q.toString();
    },
  });
  if (params.has('hitboxes')) stage.overlay.toggle(true);
  // Sound reads the sim and the camera like render does (read-only).
  const audio = new AudioDirector(game, params);
  audio.install();
  stage.afterUpdate.add(() => audio.update(stage.clock, stage.view));
  panel.addAudio(() => audio.applyVolumes());
  installDebugApi({ game, ga, stage, panel, audio });
  const soundKey = document.getElementById('sound-key');
  const showSound = (muted: boolean) => {
    if (soundKey) soundKey.textContent = muted ? 'M sound' : 'M mute';
  };
  showSound(audio.muted);
  audio.onChange = showSound;

  // Full screen: the page (canvas and key hint), so the picture refits like any window (render/app.ts).
  const toggleFullscreen = (): void => {
    const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else if (req) void req({ navigationUI: 'hide' }).catch(() => {});
  };
  ga.app.canvas.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      toggleFullscreen();
      e.preventDefault();
    } else if (e.code === 'Backquote') panel.toggle();
    else if (e.code === 'F2') {
      stage.overlay.toggle();
      e.preventDefault();
    } else if (e.code === 'KeyR') game.reset();
    else if (e.code === 'KeyG') GREYBOX.labels = !GREYBOX.labels;
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
