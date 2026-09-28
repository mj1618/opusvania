/**
 * Perf HUD (F4) and counters: FPS from frame intervals, CPU frame time (sim steps + draw + submit),
 * WebGL draw calls per frame (counted by wrapping the context's draw functions), particle and light
 * counts. Wall-clock timing is only used for display and the benchmark, never for rendering.
 */
import { Container, Graphics, Text } from 'pixi.js';

const WINDOW = 120;

export interface PerfSnapshot {
  fps: number;
  /** Median / p95 CPU time of a whole frame (sim steps + draw + GL submit), ms. */
  cpuMs: number;
  cpuP95: number;
  /** Median / p95 interval between frames, ms. */
  frameMs: number;
  frameP95: number;
  drawCalls: number;
  samples: number;
}

export class PerfMonitor {
  private cpu: number[] = [];
  private intervals: number[] = [];
  private lastStart = 0;
  private start = 0;
  private calls = 0;
  /** Draw calls in the last completed frame. */
  drawCalls = 0;

  /** Wraps a WebGL context's draw functions to count calls. Idempotent. */
  instrument(gl: WebGL2RenderingContext | WebGLRenderingContext): void {
    const ctx = gl as unknown as Record<string, unknown> & { __opusCounted?: boolean };
    if (ctx.__opusCounted) return;
    ctx.__opusCounted = true;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const fn = ctx[name];
      if (typeof fn !== 'function') continue;
      ctx[name] = (...args: unknown[]) => {
        this.calls++;
        return (fn as (...a: unknown[]) => unknown).apply(gl, args);
      };
    }
  }

  begin(now: number): void {
    if (this.lastStart > 0) push(this.intervals, now - this.lastStart);
    this.lastStart = now;
    this.start = now;
    this.calls = 0;
  }

  end(now: number): void {
    push(this.cpu, now - this.start);
    this.drawCalls = this.calls;
  }

  reset(): void {
    this.cpu = [];
    this.intervals = [];
    this.lastStart = 0;
  }

  snapshot(): PerfSnapshot {
    const frameMs = pct(this.intervals, 0.5);
    return {
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      cpuMs: pct(this.cpu, 0.5),
      cpuP95: pct(this.cpu, 0.95),
      frameMs,
      frameP95: pct(this.intervals, 0.95),
      drawCalls: this.drawCalls,
      samples: this.cpu.length,
    };
  }
}

function push(xs: number[], v: number): void {
  xs.push(v);
  if (xs.length > WINDOW) xs.shift();
}

export function pct(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
}

/** The on-screen panel. `extra` supplies the gfx counters (particles, lights, quality). */
export class PerfHud {
  readonly container = new Container({ label: 'perf-hud' });
  private readonly bg = new Graphics();
  private readonly text: Text;
  private lastText = '';
  private every = 0;

  constructor() {
    this.text = new Text({
      text: '',
      style: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 20, fill: 0xd8e0f0, lineHeight: 26 },
    });
    this.text.position.set(18, 12);
    this.container.addChild(this.bg, this.text);
    this.container.position.set(1920 - 420, 60);
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  set visible(on: boolean) {
    this.container.visible = on;
  }

  update(p: PerfSnapshot, extra: Record<string, string | number>): void {
    if (!this.container.visible) return;
    // Text re-layout is not free: refresh 4x a second at 60 fps.
    if (this.every++ % 15 !== 0) return;
    const lines = [
      `fps     ${p.fps.toFixed(0).padStart(4)}   frame ${p.frameMs.toFixed(1)} ms`,
      `cpu     ${p.cpuMs.toFixed(2)} ms  p95 ${p.cpuP95.toFixed(2)}`,
      `draws   ${p.drawCalls}`,
      ...Object.entries(extra).map(([k, v]) => `${k.padEnd(8)}${v}`),
    ];
    const text = lines.join('\n');
    if (text === this.lastText) return;
    this.lastText = text;
    this.text.text = text;
    this.bg
      .clear()
      .roundRect(0, 0, 400, lines.length * 26 + 24, 10)
      .fill({ color: 0x05060a, alpha: 0.72 });
  }
}
