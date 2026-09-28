/**
 * Route driver: plays a designed route through world rooms on the headless sim with high-level
 * steps in WORLD tiles (walk to x, jump, seize, levy...), follows edge exits across rooms, and
 * prints the whole route as one input-DSL script (for `npm run clip -- --script`, `__game.input`,
 * tapes). A route is a TS module exporting `route(r: Route)`; see tools/world/routes/.
 *
 *   npm run world:route -- tools/world/routes/proof.ts [--out script.txt] [--verbose]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import compiled from '../../content/world.compiled.json' with { type: 'json' };
import { HeadlessSim } from '../../src/debug/headless';
import { roomAbilities } from '../../src/debug/sim-adapter';
import { formatInputScript, parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { installBuildInfo } from '../lib/build-info';

const TS = 64;
const WORLD = compiled.world as Record<string, { x: number; y: number }>;

export class Route {
  readonly sim: HeadlessSim;
  readonly masks: number[] = [];
  readonly log: string[] = [];
  events: { f: number; room: string; e: SimEvent }[] = [];
  constructor(
    room: string,
    readonly verbose = false,
  ) {
    this.sim = new HeadlessSim({ room, abilities: roomAbilities(room) });
  }
  get room(): string {
    return this.sim.state.roomId;
  }
  /** Player centre / feet in world tiles (fractional). */
  get pos(): { x: number; y: number; room: string } {
    const v = this.sim.view;
    const o = WORLD[this.room] ?? { x: 0, y: 0 };
    return { x: o.x + (v.x + v.w / 2) / TS, y: o.y + (v.y + v.h) / TS, room: this.room };
  }
  private stepMask(mask: number): SimEvent[] {
    this.masks.push(mask);
    const ev = this.sim.step(mask);
    for (const e of ev) this.events.push({ f: this.sim.frame, room: this.room, e });
    return ev;
  }
  /** Plays a DSL snippet as-is. */
  play(dsl: string): this {
    for (const m of parseInputScript(dsl)) this.stepMask(m);
    return this.note(`play ${dsl}`);
  }
  wait(n: number): this {
    return this.play(`.${n}`);
  }
  /** Holds `dsl` (e.g. 'R', 'L+J') until pred() or `max` frames (throws on timeout). */
  hold(dsl: string, pred: () => boolean, max = 600, what = dsl): this {
    const [mask = 0] = parseInputScript(`${dsl}1`);
    for (let i = 0; i < max; i++) {
      if (pred()) return this.note(`hold ${what}`);
      this.stepMask(mask);
    }
    throw new Error(
      `hold ${what}: not done in ${max} frames at ${JSON.stringify(this.pos)} f${this.sim.frame}`,
    );
  }
  /** Holds `dsl` until an event of `type` happens (or max frames). */
  until(type: string, dsl = '.', max = 300): this {
    const [mask = 0] = parseInputScript(`${dsl}1`);
    for (let i = 0; i < max; i++)
      if (this.stepMask(mask).some((e) => e.type === type)) return this.note(`until ${type}`);
    throw new Error(
      `until ${type}: not seen in ${max} frames at ${JSON.stringify(this.pos)} f${this.sim.frame}`,
    );
  }
  /** Runs toward world tile x (centre), then releases. `hop`: short-hop up steps (stairs until
   * slopes land) whenever grounded against a wall. */
  walk(x: number, opts: { max?: number; hop?: boolean } = {}): this {
    const { max = 900, hop = false } = opts;
    const dir = x > this.pos.x ? 'R' : 'L';
    const done = () => (dir === 'R' ? this.pos.x >= x : this.pos.x <= x);
    const [run = 0] = parseInputScript(`${dir}1`);
    const [runJump = 0] = parseInputScript(`${dir}+J1`);
    for (let i = 0; i < max; i++) {
      if (done()) return this.note(`walk ${dir} to ${x}${hop ? ' (hopping)' : ''}`);
      const v = this.sim.view;
      if (hop && v.grounded && v.wallDir === (dir === 'R' ? 1 : -1)) {
        for (let k = 0; k < 8; k++) this.stepMask(runJump);
        this.stepMask(run);
        continue;
      }
      this.stepMask(run);
    }
    throw new Error(
      `walk ${dir} to ${x}: not done in ${max} frames at ${JSON.stringify(this.pos)} f${this.sim.frame}`,
    );
  }
  /** Waits until grounded (after a jump or fall). */
  land(max = 600, dsl = '.'): this {
    this.stepMask(parseInputScript(`${dsl}1`)[0] ?? 0);
    return this.hold(dsl, () => this.sim.view.grounded, max, `land (${dsl})`);
  }
  /** Jump: hold jump (+dir) for `jf` frames; hold dir for `drift` frames in all, then let go;
   * returns when grounded. */
  jump(dir: '' | 'L' | 'R', jf = 16, drift = 9999, max = 600): this {
    const j = dir ? `${dir}+J` : 'J';
    const n = Math.min(jf, drift);
    if (n > 0) this.play(`${j}${n}`);
    if (jf > n) this.play(`J${jf - n}`);
    if (drift > jf && dir) {
      for (let i = jf; i < drift && !this.sim.view.grounded; i++)
        this.stepMask(parseInputScript(`${dir}1`)[0] ?? 0);
    }
    return this.land(max, drift > jf && dir && drift >= 9999 ? dir : '.');
  }
  /** A move press (S, U+S, D+V...) then waits for the move to end. */
  act(dsl: string, max = 120): this {
    this.play(`${dsl}1`);
    return this.hold('.', () => this.sim.view.move === '', max, `act ${dsl}`);
  }
  note(s: string): this {
    const p = this.pos;
    const v = this.sim.view;
    const o = WORLD[this.room] ?? { x: 0, y: 0 };
    const lev = this.sim.state.local.levied
      .map((l) => `${l.colour[0]}@${(o.x + l.x / TS).toFixed(1)},${(o.y + l.y / TS).toFixed(1)}`)
      .join(' ');
    const line = `f${String(this.sim.frame).padStart(5)} ${p.room.padEnd(15)} x${p.x.toFixed(1).padStart(6)} y${p.y.toFixed(1).padStart(6)} ${v.grounded ? 'G' : ' '} bag[${v.bag.join(',')}] chin${v.chin}${lev ? ` lev[${lev}]` : ''}  ${s}`;
    this.log.push(line);
    if (this.verbose) console.log(line);
    return this;
  }
  expectRoom(id: string): this {
    if (this.room !== id) throw new Error(`expected ${id}, in ${this.room} at ${JSON.stringify(this.pos)}`);
    return this;
  }
  script(): string {
    return formatInputScript(this.masks);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  installBuildInfo();
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, verbose: { type: 'boolean', default: false } },
  });
  const file = positionals[0];
  if (!file) throw new Error('usage: npm run world:route -- <route.ts> [--out f] [--verbose]');
  const mod = (await import(resolve(file))) as { start: string; route: (r: Route) => void };
  const r = new Route(mod.start, args.verbose);
  let failed: unknown;
  try {
    mod.route(r);
  } catch (e) {
    failed = e;
  }
  if (!args.verbose) for (const l of r.log) console.log(l);
  const keyEvents = r.events.filter((x) =>
    /seizeTake|levyThrow|levyLand|roomEnter|hazard|hurt|plate|gateOpen|goal|ghost|death|down/.test(x.e.type),
  );
  console.log(
    `\nevents: ${keyEvents.map((x) => `f${x.f}:${x.e.type}${'kind' in x.e && x.e.kind ? `:${String(x.e.kind)}` : ''}`).join(' ')}`,
  );
  console.log(`frames ${r.masks.length} (${(r.masks.length / 60).toFixed(1)} s), room ${r.room}`);
  if (args.out) {
    writeFileSync(args.out, `${r.script()}\n`);
    console.log(`wrote ${args.out}`);
  }
  if (failed) {
    console.error(String(failed));
    process.exit(1);
  }
}
