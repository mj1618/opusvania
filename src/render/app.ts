import { Application, Container } from 'pixi.js';
import { VIEW_H, VIEW_W } from './contract';

/**
 * The Pixi v8 app (WebGL2). The canvas fills the window letterboxed to 16:9 and is backed at full
 * device resolution (CSS size x devicePixelRatio). `root` is scaled so that everything under it
 * works in logical view units (VIEW_W x VIEW_H): shapes stay crisp at any window size, nothing is
 * rendered small and upscaled. We drive rendering ourselves (no Pixi ticker).
 */
export interface GameApp {
  app: Application;
  /** Child of the stage, scaled so 1 unit = 1 logical view px. */
  root: Container;
  /** Device pixels per logical view px (canvas pixel width / VIEW_W). */
  viewScale(): number;
  /** Refits the canvas to the window. Returns true if the size changed. */
  fitWindow(): boolean;
}

export async function createApp(parent: HTMLElement): Promise<GameApp> {
  const app = new Application();
  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    resolution: 1,
    autoDensity: true,
    antialias: true,
    background: '#061a24',
    preference: 'webgl',
    autoStart: false,
    sharedTicker: false,
  });
  app.ticker.stop();
  app.canvas.id = 'game';
  parent.appendChild(app.canvas);
  const root = new Container({ label: 'root' });
  app.stage.addChild(root);

  let cssW = 0;
  let res = 0;
  const fitWindow = (): boolean => {
    const w = Math.max(160, Math.floor(Math.min(window.innerWidth, (window.innerHeight * VIEW_W) / VIEW_H)));
    const dpr = window.devicePixelRatio || 1;
    if (w === cssW && dpr === res) return false;
    cssW = w;
    res = dpr;
    app.renderer.resize(w, Math.round((w * VIEW_H) / VIEW_W), dpr);
    root.scale.set(w / VIEW_W);
    return true;
  };
  fitWindow();
  return { app, root, fitWindow, viewScale: () => (cssW * res) / VIEW_W };
}
