/**
 * Character concept gallery: http://localhost:5180/concepts.html (?only=<id> for one design).
 * Each file in ./designs/ default-exports a Concept; they are picked up automatically.
 * Per design the card shows: a large idle, run and jump poses, the black silhouette, and the
 * character at in-game size (zoom 1) on a ground line.
 */
import { Application, ColorMatrixFilter, Container, FillGradient, Graphics, Text } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from './types';

const modules = import.meta.glob<{ default: Concept }>('./designs/*.ts', { eager: true });
const query = new URLSearchParams(location.search);
const only = query.get('only');
/** The owner's shortlist (2026-10-13). `?all` shows every design. */
const FINALISTS = ['moth', 'wick', 'yako'];
const showAll = query.has('all');
const concepts = Object.values(modules)
  .map((m) => m.default)
  .filter((c) => c && (only ? c.id === only : showAll || FINALISTS.includes(c.id)))
  .sort((a, b) => a.id.localeCompare(b.id));

const CARD_W = only ? 1500 : 620;
const CARD_H = 900;
const cols = only ? 1 : Math.max(1, Math.min(concepts.length, Math.floor(window.innerWidth / CARD_W) || 1));
const rows = Math.max(1, Math.ceil(concepts.length / cols));

const app = new Application();
await app.init({
  width: Math.max(cols * CARD_W, 400),
  height: Math.max(rows * CARD_H, 300),
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
  background: 0x061a24,
});
document.getElementById('stage')?.appendChild(app.canvas);

const instances: ConceptInstance[] = [];

function place(
  card: Container,
  c: Concept,
  pose: ConceptPose,
  x: number,
  y: number,
  scale: number,
  label: string,
  black = false,
): void {
  const inst = c.create(pose);
  const holder = new Container();
  holder.position.set(x, y);
  holder.scale.set(scale);
  holder.addChild(inst.view);
  if (black) {
    const f = new ColorMatrixFilter();
    f.matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
    f.resolution = (window.devicePixelRatio || 1) * 2;
    holder.filters = [f];
  }
  card.addChild(holder);
  instances.push(inst);
  const t = new Text({
    text: label,
    style: { fill: black ? 0x35505a : 0x6f9a9a, fontSize: 13, fontFamily: 'system-ui' },
  });
  t.anchor.set(0.5, 0);
  t.position.set(x, y + 14);
  card.addChild(t);
}

concepts.forEach((c, i) => {
  const card = new Container();
  card.position.set((i % cols) * CARD_W, Math.floor(i / cols) * CARD_H);
  app.stage.addChild(card);

  // Backdrop: the scene's misty teal, with a mossy ground band, so values read as in game.
  const bg = new Graphics();
  const grad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
  });
  grad.addColorStop(0, 0x0b2a33);
  grad.addColorStop(0.55, 0x2f6f78);
  grad.addColorStop(1, 0x12323a);
  bg.rect(8, 8, CARD_W - 16, CARD_H - 16).fill(grad);
  bg.rect(8, 560, CARD_W - 16, 10).fill(0x3f8f5e);
  bg.rect(8, 570, CARD_W - 16, CARD_H - 578).fill(0x081c24);
  // Light panel for the silhouette test.
  bg.roundRect(CARD_W - 250, 610, 220, 250, 10).fill(0xbfd8d2);
  bg.rect(30, 838, CARD_W - 300, 4).fill(0x3f8f5e);
  card.addChild(bg);

  const title = new Text({
    text: c.name,
    style: { fill: 0xe8f3ef, fontSize: 26, fontFamily: 'Georgia, serif' },
  });
  title.position.set(28, 22);
  card.addChild(title);
  const blurb = new Text({
    text: c.blurb,
    style: {
      fill: 0x9fc4c0,
      fontSize: 14,
      fontFamily: 'system-ui',
      wordWrap: true,
      wordWrapWidth: CARD_W - 60,
    },
  });
  blurb.position.set(28, 58);
  card.addChild(blurb);

  const big = only ? 5.5 : 4.2;
  place(card, c, 'idle', CARD_W * (only ? 0.2 : 0.3), 560, big, 'idle');
  place(card, c, 'run', CARD_W * (only ? 0.5 : 0.74), 560, only ? big : 3, 'run');
  if (only) place(card, c, 'jump', CARD_W * 0.8, 500, big, 'jump');
  else place(card, c, 'jump', CARD_W * 0.74, 300, 2.4, 'jump');
  // In-game size (zoom 1).
  place(card, c, 'idle', 70, 838, 1, 'game size');
  place(card, c, 'run', 180, 838, 1, '');
  place(card, c, 'jump', 290, 800, 1, '');
  // Silhouette.
  place(card, c, 'idle', CARD_W - 140, 820, 2, 'silhouette', true);
});

if (concepts.length === 0) {
  const t = new Text({
    text: 'No concepts yet (src/concepts/designs/*.ts)',
    style: { fill: 0x9fc4c0, fontSize: 18 },
  });
  t.position.set(24, 24);
  app.stage.addChild(t);
}

let clock = 0;
app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  clock += dt;
  for (const inst of instances) inst.update(clock, dt);
});
