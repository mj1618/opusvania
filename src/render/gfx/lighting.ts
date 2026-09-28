/**
 * 2D lighting (PLAN §3.6 light-map pass). Each frame the visible lights are drawn additively as
 * tinted radial sprites into a low-res light map, cleared to the room's ambient colour. The
 * LightingFilter on the lit layers multiplies the scene by it. The map stores light / LIGHT_SCALE,
 * so lights can over-brighten up to LIGHT_SCALE x (lamp pools read as light, not just "less dark").
 *
 * Lights come from three places: the room (dressing file + auto lights from entities and lamps),
 * the player's carried light, and providers registered by other render code (sound sources etc.).
 */
import {
  Container,
  Filter,
  type FilterSystem,
  GlProgram,
  Matrix,
  type Renderer,
  type RenderSurface,
  RenderTexture,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import { VIEW_H, VIEW_W } from '../camera/index';
import type { RenderClock } from './clock';
import { hexToRgb, noise1 } from './color';

export const LIGHT_SCALE = 2;

export interface Light {
  /** World px (centre). */
  x: number;
  y: number;
  /** Falloff radius, px. */
  radius: number;
  color: number;
  /** 1 = a lamp; the map saturates at LIGHT_SCALE. */
  intensity: number;
  /** 0..1, keyed to the render clock (sim frame), so deterministic. */
  flicker?: number;
  /** Decorrelates flicker between lights. */
  seed?: number;
}

/** Called once per drawn frame; push lights (world px) for this frame. Must not touch the sim. */
export type LightProvider = (out: Light[], clock: RenderClock) => void;

/** Soft radial falloff texture, generated once. */
function makeFalloffTexture(): Texture {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      // Smooth inverse-square-ish falloff that reaches exactly 0 at the radius.
      const k = (1 - d * d) ** 2 * (0.35 + 0.65 / (1 + 12 * d * d));
      const i = (y * n + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(k * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(c);
}

/** Same falloff as the texture, for CPU sampling (particles). */
export function falloff(d: number): number {
  if (d >= 1) return 0;
  return (1 - d * d) ** 2 * (0.35 + 0.65 / (1 + 12 * d * d));
}

export function flickerFactor(l: Light, t: number): number {
  const f = l.flicker ?? 0;
  if (f <= 0) return 1;
  const s = l.seed ?? 0;
  const n = 0.6 * noise1(t * 0.07, s) + 0.4 * noise1(t * 0.29, s + 3);
  // Rare deep gutters on strongly flickering lights.
  const gutter = f > 0.5 && noise1(t * 0.021, s + 9) > 0.82 ? 0.45 : 1;
  return (1 - f * 0.55 * n) * gutter;
}

export class LightSystem {
  /** Static lights for the current room (world px). */
  roomLights: Light[] = [];
  readonly providers = new Set<LightProvider>();
  /** The player's carried light; position is set every frame. */
  player: Light = { x: 0, y: 0, radius: 460, color: 0xffe6c8, intensity: 0.7 };
  playerLightOn = true;
  ambient = { color: 0xffffff, level: 0.6 };
  /** Lights drawn last frame (after culling), for particle lighting and the debug API. */
  frameLights: Light[] = [];
  /** Sprite showing the light map at screen size; filters map through it (not rendered). */
  readonly screenSprite: Sprite;
  private rt: RenderTexture;
  private readonly scene = new Container();
  private readonly pool: Sprite[] = [];
  private readonly tex: Texture;
  private res = 0.5;

  constructor(private readonly renderer: Renderer) {
    this.tex = makeFalloffTexture();
    this.rt = this.makeRt(this.res);
    this.screenSprite = new Sprite(this.rt);
    this.screenSprite.width = VIEW_W;
    this.screenSprite.height = VIEW_H;
    this.screenSprite.renderable = false;
    this.screenSprite.label = 'lightmap';
  }

  get texture(): RenderTexture {
    return this.rt;
  }

  private makeRt(res: number): RenderTexture {
    return RenderTexture.create({
      width: Math.round(VIEW_W * res),
      height: Math.round(VIEW_H * res),
      resolution: 1,
      antialias: false,
    });
  }

  /** Called with the new light map texture when it is recreated (filters rebind it). */
  readonly onTexture = new Set<(rt: RenderTexture) => void>();

  setResolution(res: number): void {
    if (res === this.res) return;
    this.res = res;
    const old = this.rt;
    this.rt = this.makeRt(res);
    this.screenSprite.texture = this.rt;
    this.screenSprite.width = VIEW_W;
    this.screenSprite.height = VIEW_H;
    // Rebind before destroying, or Pixi warns that a bound texture was destroyed.
    for (const fn of this.onTexture) fn(this.rt);
    old.destroy(true);
  }

  /** Renders the light map for a view whose top-left is (camX, camY). */
  render(clock: RenderClock, camX: number, camY: number): void {
    const out: Light[] = [];
    for (const l of this.roomLights) out.push(l);
    if (this.playerLightOn) out.push(this.player);
    for (const p of this.providers) p(out, clock);
    const vis = out.filter(
      (l) =>
        l.x + l.radius > camX &&
        l.x - l.radius < camX + VIEW_W &&
        l.y + l.radius > camY &&
        l.y - l.radius < camY + VIEW_H,
    );
    this.frameLights = vis;
    const k = this.res;
    while (this.pool.length < vis.length) {
      const s = new Sprite(this.tex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.pool.push(s);
      this.scene.addChild(s);
    }
    this.pool.forEach((s, i) => {
      const l = vis[i];
      s.visible = !!l;
      if (!l) return;
      s.position.set((l.x - camX) * k, (l.y - camY) * k);
      const size = (l.radius * 2 * k) / 128;
      s.scale.set(size);
      s.tint = l.color;
      // Additive sprites in an 8-bit map: intensity above 1 is spread over alpha.
      s.alpha = Math.min(1, (l.intensity * flickerFactor(l, clock.t)) / LIGHT_SCALE);
    });
    const [r, g, b] = hexToRgb(this.ambient.color);
    const a = this.ambient.level / LIGHT_SCALE;
    this.renderer.render({
      container: this.scene,
      target: this.rt,
      clear: true,
      clearColor: [r * a, g * a, b * a, 1],
    });
  }

  /** Approximate brightness (0..LIGHT_SCALE, luma-ish) at a world point, from last frame's lights. */
  sample(x: number, y: number, t: number): number {
    let v = this.ambient.level;
    for (const l of this.frameLights) {
      const dx = x - l.x;
      const dy = y - l.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= l.radius * l.radius) continue;
      v += l.intensity * flickerFactor(l, t) * falloff(Math.sqrt(d2) / l.radius);
    }
    return Math.min(LIGHT_SCALE, v);
  }

  destroy(): void {
    this.rt.destroy(true);
    this.tex.destroy(true);
    this.scene.destroy({ children: true });
  }
}

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLightUv;
out vec2 vScreen;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uLightMatrix;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vLightUv = (uLightMatrix * vec3(vTextureCoord, 1.0)).xy;
    vScreen = aPosition;
}
`;

/** Shared by the lighting and post filters: maps filter coords to light-map UVs. */
export const LIGHTMAP_VERTEX = VERTEX;

const LIGHT_FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vLightUv;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLightTexture;
uniform float uLightScale;

void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    vec3 L = texture(uLightTexture, vLightUv).rgb * uLightScale;
    finalColor = vec4(c.rgb * L, c.a);
}
`;

/**
 * Multiplies its container by the light map. Put it on a container whose filterArea is the whole
 * screen; the light-map sprite handles the coordinate mapping (like Pixi's DisplacementFilter).
 */
export class LightingFilter extends Filter {
  constructor(private readonly lights: LightSystem) {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: LIGHT_FRAGMENT, name: 'opus-lighting' }),
      resources: {
        lightUniforms: new UniformGroup({
          uLightMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uLightScale: { value: LIGHT_SCALE, type: 'f32' },
        }),
        uLightTexture: lights.texture.source,
      },
    });
    lights.onTexture.add((rt) => {
      this.resources.uLightTexture = rt.source;
    });
  }

  override apply(fm: FilterSystem, input: Texture, output: RenderSurface, clear: boolean): void {
    const u = this.resources.lightUniforms.uniforms as { uLightMatrix: Matrix };
    fm.calculateSpriteMatrix(u.uLightMatrix, this.lights.screenSprite);
    this.resources.uLightTexture = this.lights.texture.source;
    fm.applyFilter(this, input, output, clear);
  }
}
