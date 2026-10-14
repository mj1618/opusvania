/**
 * World mood frames: http://localhost:5180/world-concepts.html
 *
 * Five still compositions of the "overgrown ruin" world (docs/art-direction.md), at 1920x1080, in
 * the Grove's rendering language, with Umber small in frame for scale. Not the game: nothing here
 * touches the sim or the scene.
 *
 *   1-5 / ?frame=N   switch frame
 *   ?t=SECONDS       freeze render time there (stepped from 0 in 1/60 s steps: same picture every time)
 *   ?clean           no caption (for captures)
 *
 * `window.__wc` = { frame, ready, show(n) } for tools.
 */
import { Application } from 'pixi.js';
import edge from './frames/edge';
import lab from './frames/lab';
import lamp from './frames/lamp';
import moth from './frames/moth';
import street from './frames/street';
import { Composer } from '../render/world/compose';
import { VIEW_H, VIEW_W } from '../render/world/layer';
import { Post } from '../render/world/post';
import type { WorldFrame } from './types';

const FRAMES: WorldFrame[] = [street, edge, lamp, lab, moth];

const q = new URLSearchParams(location.search);
const fixedT = q.has('t') ? Number(q.get('t')) : null;
const clean = q.has('clean');

const app = new Application();
await app.init({
  width: VIEW_W,
  height: VIEW_H,
  resolution: 1,
  antialias: true,
  background: 0x000000,
  preference: 'webgl',
});
const stage = document.getElementById('stage');
stage?.appendChild(app.canvas);

const caption = document.getElementById('caption');
if (caption && clean) caption.style.display = 'none';

const post = new Post(app.renderer);
app.stage.addChild(post.display);

let current: Composer | null = null;
let index = 0;
let clock = 0;

const api = { frame: 0, ready: false, show };
(window as unknown as { __wc: typeof api }).__wc = api;

function show(n: number): void {
  const f = FRAMES[n - 1];
  if (!f) return;
  api.ready = false;
  current?.destroy();
  const c = new Composer(app.renderer);
  f.build(c);
  current = c;
  index = n;
  api.frame = n;
  post.set(c.grade);
  clock = 0;
  if (fixedT !== null) {
    // Step render time up to the asked moment so every chain and spring is where it would be.
    const steps = Math.round(fixedT * 60);
    for (let i = 0; i < steps; i++) c.update(i / 60, 1 / 60);
    clock = fixedT;
  }
  if (caption) caption.innerHTML = `<b>${f.key}. ${f.title}</b><span>${f.tests}</span>`;
  const url = new URL(location.href);
  url.searchParams.set('frame', String(n));
  history.replaceState(null, '', url);
  requestAnimationFrame(() => requestAnimationFrame(() => (api.ready = true)));
}

window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= FRAMES.length && n !== index) show(n);
});

app.ticker.add((tk) => {
  if (!current) return;
  const dt = fixedT !== null ? 0 : Math.min(tk.deltaMS / 1000, 0.05);
  clock += dt;
  current.update(clock, dt);
  post.render(current.root, clock);
});

show(Math.max(1, Math.min(FRAMES.length, Number(q.get('frame') ?? 1) || 1)));
