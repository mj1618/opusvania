import { AudioDirector } from './audio/index';
import { installDebugApi } from './debug/api';
import { TuningPanel } from './debug/tuning-panel';
import { Game } from './game';
import { InputSampler } from './input/index';
import { FixedStepLoop } from './loop';
import { createApp } from './render/app';
import { GREYBOX } from './render/greybox/index';
import { MapOverlay } from './render/map/index';
import { RenderStage } from './render/stage';
import { clearSave, PROGRESS_EVENTS, pageStore, readSave, writeSave } from './save/storage';
import { getRoom, ROOM_IDS, worldIdOf } from './scene/index';
import type { Room } from './scene/room';
import { getWorld, mapWorld, validateWorld } from './scene/world';
import { ABILITIES } from './sim/abilities';
import { tuning } from './sim/tuning';

/** A prototype world's own save slot: the same store with its keys suffixed (`lampfall.save.proto-1`). */
function slotOf(store: ReturnType<typeof pageStore>, id: string): ReturnType<typeof pageStore> {
  if (!store) return store;
  return {
    getItem: (k: string) => store.getItem(`${k}.${id}`),
    setItem: (k: string, v: string) => store.setItem(`${k}.${id}`, v),
    removeItem: (k: string) => store.removeItem(`${k}.${id}`),
  };
}

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
 * Boot. Without ?room= the page is the game: it continues from the save slot (memory/save.md: at the
 * last moon patch, with everything earned) or starts a new game at content/world.json's start
 * (wood-hatch), and autosaves on every progress event. ?fresh = a new game (the slot is emptied).
 * ?room=<id> is a test boot: a new game in that room (`test-grove` is the old demo level), the slot
 * neither read nor written. The world links every room either way (memory/world.md).
 * Other params: ?abilities=all|none|glide,wallJump,doubleJump,dash, ?seed=<n>, ?manual (start
 * paused; drive via __game.step), ?hitboxes,
 * ?nopickups (the scene without its glints, lumen pods, enemies, lanterns and heart, so without the HUD: clean plates
 * for the look tools), ?audio (sound on for review; ?audio=0 off).
 * Keys: arrows/WASD move, Z/Space/K jump, X/L/Shift dash, Down+Jump drops through branches,
 * Tab map, F2 collision overlay, G greybox labels, ` tuning panel, R restart (the game: back to the last
 * save), M sound on / off (muted by default: src/audio),
 * Enter (or a double-click on the picture) full screen on / off.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 1) >>> 0;
  const input = new InputSampler();
  const roomParam = params.get('room');
  // `?world=<id>`: a prototype level's own world (content/worlds/<id>.json; Lanternroot is `proto-1`). A `?room=`
  // of such a world plays in it (its exits lead on).
  const worldId = params.get('world') ?? (roomParam ? worldIdOf(roomParam) : 'game');
  const base = getWorld(worldId);
  const strip = (r: Room): Room =>
    params.has('nopickups')
      ? { ...r, pickups: [], pods: [], enemies: [], lanterns: [], lamps: [], heart: undefined }
      : r;
  const world = params.has('nopickups') ? mapWorld(base, strip) : base;
  for (const problem of validateWorld(base)) console.warn(`[world] ${problem}`);
  // The game (no ?room=) keeps a save; a test boot leaves the slot alone. A prototype world keeps its own slot.
  const session = roomParam === null;
  const store = session ? (worldId === 'game' ? pageStore() : slotOf(pageStore(), worldId)) : null;
  if (params.has('fresh')) clearSave(store);
  const saved = session ? readSave(store) : null;
  const room = strip(getRoom(roomParam ?? world.start));
  // The key legend is for the test bed; the game shows no text (H still brings it up).
  if (room.id === 'test-grove') document.getElementById('hint')?.classList.remove('quiet');
  const game = new Game(
    tuning,
    (world.rooms[room.id]?.scene as Room) ?? room,
    seed,
    () => input.sample(),
    abilitiesParam(params.get('abilities')),
    {
      world,
      save: saved,
    },
  );
  if (params.has('manual')) game.mode = 'manual';
  if (session)
    game.afterStep.add((events) => {
      if (events.some((e) => PROGRESS_EVENTS.has(e.type) && !(e.type === 'roomEnter' && e.from === 'load')))
        writeSave(store, game.state.save);
    });

  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const ga = await createApp(root);
  const stage = new RenderStage(ga, game);
  // The map (Tab): over the HUD, under the debug overlay. The game stands still while it is open.
  const map = new MapOverlay();
  ga.root.addChildAt(map.layer, ga.root.getChildIndex(stage.overlay.layer));
  stage.afterUpdate.add((dt) => map.update(dt, stage.clock, game, ga.view()));
  let modeBeforeMap = game.mode;
  const toggleMap = (on = !map.open): void => {
    if (on === map.open) return;
    map.toggle(on);
    if (on) {
      modeBeforeMap = game.mode;
      if (game.mode === 'realtime') game.mode = 'frozen';
    } else if (game.mode === 'frozen' && modeBeforeMap === 'realtime') game.mode = 'realtime';
    if (game.mode === 'manual') {
      stage.update(0, 1);
      stage.present();
    }
  };
  // R: back to the last moon patch of this run, its progress kept (`Game.restartAtPatch`); a test page restarts.
  const restart = (): void => {
    if (session) game.restartAtPatch();
    else game.reset();
  };
  const panel = new TuningPanel(tuning, restart, {
    room: game.scene.id,
    // (Every room of the world being played too: a prototype world's rooms are not in world.json, and a list
    // without the room in play snapped the panel back to its first room on any refresh, `setTuning` included.)
    rooms: [
      ...ROOM_IDS,
      ...Object.values(base.rooms)
        .filter((r) => r.placed && !ROOM_IDS.includes(r.id))
        .map((r) => r.id),
    ],
    // She goes there, the save kept (the renderers rebuild for the room).
    onRoom: (id) => game.goto(id),
  });
  stage.onRoom.add((id) => panel.setRoom(id));
  if (params.has('hitboxes')) stage.overlay.toggle(true);
  // Sound reads the sim and the camera like render does (read-only).
  const audio = new AudioDirector(game, params);
  audio.install();
  stage.afterUpdate.add(() => audio.update(stage.clock, stage.view));
  panel.addAudio(() => audio.applyVolumes());
  installDebugApi({
    game,
    ga,
    stage,
    panel,
    audio,
    store: pageStore(),
    autosave: session,
    map: { toggle: toggleMap, open: () => map.open },
  });
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
    } else if (e.code === 'Tab') {
      toggleMap();
      e.preventDefault();
    } else if (e.code === 'KeyR') restart();
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
