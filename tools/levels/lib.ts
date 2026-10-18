/**
 * A small builder for room JSON (content/rooms/<id>.json): the level generators (tools/levels/*.ts) describe a
 * room in code, piece by piece, and write it out; `parseScene` (src/scene/index.ts) checks it like any other
 * room. Hand edits to the JSON are lost on the next generation: edit the generator.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Kick = boolean | 'east' | 'west';
type Tag = 'ground' | 'pool' | 'ledge' | 'trunk' | 'floating' | 'root' | 'branch';

export interface Json {
  [k: string]: unknown;
}

export class RoomBuilder {
  readonly data: Json & {
    solids: Json[];
    oneWays: Json[];
    pickups: Json[];
    pods: Json[];
    enemies: Json[];
    lures: Json[];
  };

  constructor(id: string, width: number, height: number, spawn: [number, number], head: Json = {}) {
    this.data = {
      id,
      ...head,
      width,
      height,
      spawn: { x: spawn[0], y: spawn[1] },
      solids: [],
      oneWays: [],
      pickups: [],
      pods: [],
      enemies: [],
      lures: [],
    };
  }

  private list(key: string): Json[] {
    const d = this.data as Json;
    if (!Array.isArray(d[key])) d[key] = [];
    return d[key] as Json[];
  }

  /** A solid rect. */
  solid(x: number, y: number, w: number, h: number, tag: Tag = 'ground', kick?: Kick): this {
    const s: Json = { tag, x, y, w, h };
    if (kick !== undefined) s.kick = kick;
    this.data.solids.push(s);
    return this;
  }

  /** A one-way line. */
  oneWay(x: number, y: number, w: number, tag: Tag = 'ledge', noDrop?: boolean | string): this {
    const o: Json = { tag, x, y, w };
    if (noDrop !== undefined) o.noDrop = noDrop;
    this.data.oneWays.push(o);
    return this;
  }

  /** Glints along points. */
  glints(prefix: string, points: Array<[number, number]>): this {
    points.forEach(([x, y], i) => {
      this.data.pickups.push({ id: `${prefix}${i + 1}`, kind: 'glint', x, y });
    });
    return this;
  }

  /** Glints along a jump's arc from (x0, y0) to (x1, y0), `n` of them, rising `h` at the middle. */
  arc(prefix: string, x0: number, x1: number, y0: number, h: number, n: number): this {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      pts.push([Math.round(x0 + (x1 - x0) * u), Math.round(y0 - 4 * h * u * (1 - u))]);
    }
    return this.glints(prefix, pts);
  }

  /** A cluster (a hoard) of `n` glints in rows inside a rect. */
  hoard(prefix: string, x: number, y: number, w: number, h: number, n: number): this {
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / Math.max(1, h))));
    const rows = Math.ceil(n / cols);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      pts.push([Math.round(x + ((c + 0.5) * w) / cols), Math.round(y + ((r + 0.5) * h) / rows)]);
    }
    return this.glints(prefix, pts);
  }

  /** A glow pod sitting on a top at y (its centre 22 over it), regrowing. */
  pod(id: string, x: number, top: number, regrow = 1200, mount: 'sit' | 'hang' = 'sit', hp?: number): this {
    const p: Json = { id, x, y: mount === 'sit' ? top - 22 : top + 22, mount, regrow };
    if (hp) p.hp = hp;
    this.data.pods.push(p);
    return this;
  }

  enemy(e: Json): this {
    this.data.enemies.push(e);
    return this;
  }

  lure(l: Json): this {
    this.data.lures.push(l);
    return this;
  }

  /** A warm lamp (a wick unless said). */
  lamp(id: string, x: number, y: number, more: Json = {}): this {
    return this.lure({ id, kind: 'wick', x, y, ...more });
  }

  /** A cold moonwick. */
  moonwick(id: string, x: number, y: number, more: Json = {}): this {
    return this.lure({ id, kind: 'moonwick', x, y, ...more });
  }

  add(key: string, item: Json): this {
    this.list(key).push(item);
    return this;
  }

  set(key: string, value: unknown): this {
    (this.data as Json)[key] = value;
    return this;
  }

  mark(key: string, item: Json): this {
    const d = this.data as Json;
    const marks = (d.marks ?? {}) as Json;
    d.marks = marks;
    if (!Array.isArray(marks[key])) marks[key] = [];
    (marks[key] as Json[]).push(item);
    return this;
  }

  route(from: string, to: string, more: Json = {}): this {
    return this.add('routes', { from, to, ...more });
  }

  write(dir: string): void {
    const file = join(dir, `${this.data.id}.json`);
    writeFileSync(file, `${JSON.stringify(this.data, null, 2)}\n`);
    console.log(`wrote ${file}`);
  }
}
