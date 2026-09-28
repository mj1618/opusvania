import { Application } from 'pixi.js';
import { VIEW_H, VIEW_W } from './camera';

/**
 * Creates the Pixi app at the 1920x1080 reference resolution. The canvas is scaled to fit the
 * window by CSS (see index.html), letterboxed. We drive rendering ourselves (no Pixi ticker).
 */
export async function createApp(parent: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    background: '#0b0d12',
    preference: 'webgl',
    autoStart: false,
    sharedTicker: false,
  });
  app.ticker.stop();
  app.canvas.id = 'game';
  parent.appendChild(app.canvas);
  return app;
}
