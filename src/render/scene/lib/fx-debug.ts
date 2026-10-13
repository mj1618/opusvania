/**
 * `window.__fx`: live handles on the look knobs for tuning from the console or playwright-cli,
 * e.g. `__fx.post.bloom.intensity = 1.2; __game.render()` or `__fx.layers.get('air').visible = false`.
 * Debug only: nothing in the game reads it.
 */
export function fxDebug(name: string, value: unknown): void {
  const g = globalThis as { __fx?: Record<string, unknown> };
  g.__fx ??= {};
  g.__fx[name] = value;
}
