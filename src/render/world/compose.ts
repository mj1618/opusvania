/**
 * A frame under construction: its root, its depth planes, the shader planes, root batches and mote
 * fields inside them, the scene lights that relight the planes, and Umber. `update` drives them
 * all from one clock and the shared breath.
 */
import { Container, type Renderer } from 'pixi.js';
import { type MoteSpec, Motes } from './air';
import { Hero, type HeroSpec } from './hero';
import { type AtmosSpec, Plane, type SceneLight } from './layer';
import { ShaderPlane } from './plane';
import type { GradeSpec } from './post';
import { breath } from './time';
import { type BatchStyle, TissueBatch } from './tissue';

export type Hook = (t: number, breath: number, dt: number) => void;

export class Composer {
  readonly root = new Container();
  readonly lights: SceneLight[] = [];
  hero: Hero | null = null;
  grade: GradeSpec = { shadow: 0x0b0c22, shadowK: 0.02, deep: 0x03040c, deepK: 0.7 };
  private readonly planes: Plane[] = [];
  private readonly shaders: ShaderPlane[] = [];
  private readonly batches: TissueBatch[] = [];
  private readonly motes: Motes[] = [];
  private readonly hooks: Hook[] = [];

  constructor(readonly renderer: Renderer) {}

  plane(name: string, spec: AtmosSpec, parent: Container = this.root): Plane {
    const p = new Plane(name, spec);
    parent.addChild(p.view);
    this.planes.push(p);
    return p;
  }

  shader(
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    body: string,
    parent: Container,
  ): ShaderPlane {
    const s = new ShaderPlane(name, x, y, w, h, body);
    parent.addChild(s.mesh);
    this.shaders.push(s);
    return s;
  }

  batch(name: string, style: BatchStyle, parent: Container): TissueBatch {
    const b = new TissueBatch(name, style);
    parent.addChild(b.mesh);
    this.batches.push(b);
    return b;
  }

  mote(rng: () => number, spec: MoteSpec, parent: Container): Motes {
    const m = new Motes(rng, spec);
    parent.addChild(m.view);
    this.motes.push(m);
    return m;
  }

  addHero(spec: HeroSpec, parent: Container): Hero {
    this.hero = new Hero(this.renderer, spec);
    parent.addChild(this.hero.view);
    return this.hero;
  }

  light(l: SceneLight): SceneLight {
    this.lights.push(l);
    return l;
  }

  on(h: Hook): void {
    this.hooks.push(h);
  }

  update(t: number, dt: number): void {
    const b = breath(t);
    this.hero?.update(t, dt);
    for (const h of this.hooks) h(t, b, dt);
    for (const s of this.shaders) s.tick(t, b);
    for (const k of this.batches) k.tick(t, b);
    for (const m of this.motes) m.update(t);
    for (const p of this.planes) p.atmos.setLights(this.lights);
  }

  destroy(): void {
    this.hero?.destroy();
    this.root.destroy({ children: true });
  }
}
