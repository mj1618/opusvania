import { Application, Container } from 'pixi.js';
import { SAFE_H, SAFE_W, type ViewSize, viewSizeFor } from './contract';

/**
 * The Pixi v8 app (WebGL2). The canvas fills the window, whatever its shape, and is backed at full
 * device resolution (CSS size x devicePixelRatio). `root` is scaled and placed so that everything
 * under it works in logical units with the 16:9 safe area at 0..SAFE_W x 0..SAFE_H, centred in the
 * canvas; the view extends past it to the window's edges (contract.ts `ViewSize`, memory/view-size.md).
 * Past VIEW_MAX_W x VIEW_MAX_H (wider than 2.4:1, taller than 5:4) the rest is the clear colour, a
 * dark letterbox. We drive rendering ourselves (no Pixi ticker).
 */
export interface GameApp {
  app: Application;
  /** Child of the stage, scaled so 1 unit = 1 logical view px, the safe area's top-left at 0, 0. */
  root: Container;
  /** Device pixels per logical view px. */
  viewScale(): number;
  /** The logical view now. */
  view(): ViewSize;
  /** Refits the canvas to the window. Returns true if the size changed. */
  fitWindow(): boolean;
}

/** The letterbox past the widest / tallest view, and what shows under a frame before it is drawn. */
const CLEAR = '#061a24';

export async function createApp(parent: HTMLElement): Promise<GameApp> {
  const app = new Application();
  await app.init({
    width: SAFE_W,
    height: SAFE_H,
    resolution: 1,
    autoDensity: true,
    antialias: true,
    background: CLEAR,
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
  let cssH = 0;
  let res = 0;
  let view = viewSizeFor(SAFE_W, SAFE_H);
  const fitWindow = (): boolean => {
    const w = Math.max(160, Math.floor(window.innerWidth));
    const h = Math.max(90, Math.floor(window.innerHeight));
    const dpr = window.devicePixelRatio || 1;
    if (w === cssW && h === cssH && dpr === res) return false;
    cssW = w;
    cssH = h;
    res = dpr;
    app.renderer.resize(w, h, dpr);
    view = viewSizeFor(w, h);
    root.scale.set(view.scale);
    // The safe area centred in the canvas (the view around it reaches the edges, or the letterbox).
    root.position.set((w - SAFE_W * view.scale) / 2, (h - SAFE_H * view.scale) / 2);
    return true;
  };
  fitWindow();
  return { app, root, fitWindow, view: () => view, viewScale: () => view.scale * res };
}
