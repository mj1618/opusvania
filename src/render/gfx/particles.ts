/**
 * Draws the ambient particle model (ambient.ts) with Pixi ParticleContainers: motes glint only in
 * lamplight, embers flicker, soot drifts; nothing is drawn over solid terrain.
 */
import { ParticleContainer, Particle as PixiParticle, Texture } from 'pixi.js';
import { AmbientField } from './ambient';

function dotTexture(soft: boolean): Texture {
  const n = 32;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const grad = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(soft ? 0.25 : 0.55, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, n, n);
  return Texture.from(c);
}

export interface AmbientColors {
  mote: number;
  ember: number;
  soot: number;
}

/**
 * Draws an AmbientField: motes and embers additively (glow), soot with normal blending.
 * `light(x, y)` returns the scene light at a screen point so motes glint near lamps.
 */
export class AmbientView {
  readonly glow = new ParticleContainer({
    dynamicProperties: { position: true, color: true, vertex: false, rotation: false, uvs: false },
  });
  readonly soot = new ParticleContainer({
    dynamicProperties: { position: true, color: true, vertex: false, rotation: false, uvs: false },
  });
  private readonly softTex = dotTexture(true);
  private readonly hardTex = dotTexture(false);
  private sprites: PixiParticle[] = [];
  private field: AmbientField | null = null;

  constructor() {
    this.glow.blendMode = 'add';
    this.glow.label = 'ambient-glow';
    this.soot.label = 'ambient-soot';
  }

  setField(field: AmbientField, colors: AmbientColors): void {
    this.field = field;
    this.glow.removeParticles();
    this.soot.removeParticles();
    this.sprites = field.particles.map((q) => {
      const s = new PixiParticle({
        texture: q.kind === 'soot' ? this.hardTex : this.softTex,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: q.size / 8,
        scaleY: (q.kind === 'soot' ? q.size * 0.6 : q.size) / 8,
        tint: colors[q.kind],
      });
      (q.kind === 'soot' ? this.soot : this.glow).addParticle(s);
      return s;
    });
    // Scale is static per particle: upload vertices once.
    this.glow.update();
    this.soot.update();
  }

  /** `hidden(sx, sy)`: true where a particle would sit over solid terrain (it is not drawn there). */
  draw(
    camX: number,
    camY: number,
    t: number,
    light: (sx: number, sy: number) => number,
    hidden: (sx: number, sy: number) => boolean,
  ): void {
    const f = this.field;
    if (!f) return;
    f.particles.forEach((q, i) => {
      const s = this.sprites[i];
      if (!s) return;
      const p = AmbientField.screen(q, camX, camY);
      s.x = p.x;
      s.y = p.y;
      if (hidden(p.x, p.y)) s.alpha = 0;
      else if (q.kind === 'mote') {
        // Motes are only visible where there is light: dust in a lamp's beam.
        const L = light(p.x, p.y);
        s.alpha = Math.min(1, Math.max(0, (L - 0.55) * 0.9)) * (0.6 + 0.4 * Math.sin(q.phase + t * 0.05));
      } else if (q.kind === 'ember') {
        s.alpha = 0.55 + 0.45 * Math.sin(q.phase * 3 + t * q.freq * 4);
      } else {
        s.alpha = 0.55;
      }
    });
  }

  get count(): number {
    return this.field?.count ?? 0;
  }

  destroy(): void {
    this.glow.destroy({ children: true });
    this.soot.destroy({ children: true });
    this.softTex.destroy(true);
    this.hardTex.destroy(true);
  }
}
