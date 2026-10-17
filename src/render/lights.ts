/**
 * Light-provider hook: a tiny registry of dynamic point lights. Anything that glows registers a
 * light under a stable id and updates it every frame (the character's ember does); the environment
 * and post stages read `list` each frame and decide what a light means (ground tint, plant glow,
 * bloom seed...). It is plain data: no Pixi objects, nothing is drawn here.
 */
export interface PointLight {
  /** Centre in world px (playfield space, parallax 1). */
  x: number;
  y: number;
  /** Reach in world px: the light has faded to nothing at this distance. */
  radius: number;
  /** 0xRRGGBB. */
  color: number;
  /** 1 = nominal; flicker and pulses scale this. 0 = off. */
  intensity: number;
}

export class LightRegistry {
  private readonly byId = new Map<string, PointLight>();
  private cache: PointLight[] | null = null;

  /** Adds or replaces the light with this id. The object is kept: mutate it in place if you like. */
  set(id: string, light: PointLight): void {
    if (this.byId.get(id) !== light) {
      this.byId.set(id, light);
      this.cache = null;
    }
  }

  get(id: string): PointLight | undefined {
    return this.byId.get(id);
  }

  remove(id: string): void {
    if (this.byId.delete(id)) this.cache = null;
  }

  /** Every registered light, in registration order. Do not mutate the array. */
  get list(): readonly PointLight[] {
    this.cache ??= [...this.byId.values()];
    return this.cache;
  }
}
