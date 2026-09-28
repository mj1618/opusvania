/**
 * World project operations used by the CLI and the freshness test: open the LDtk project,
 * import a sheet as a level, bake, compile, write the bundle, and check that everything stored
 * is what the code would generate.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RoomFile } from '../../src/sim/world/room-schema';
import { bake } from './bake';
import { type CompileResult, compileWorld, formatBundle } from './compile';
import { LAYERS, newProjectJson, syncDefs } from './defs';
import { type Level, levelIdent, loadProject, type Project, saveProject } from './ldtk';
import { levelToModel, modelToLevel } from './level';
import { lintWorld } from './lint';
import type { LevelModel } from './model';

export const ROOT = resolve(import.meta.dirname, '../..');
export const PROJECT_PATH = join(ROOT, 'content/world.ldtk');
export const BUNDLE_PATH = join(ROOT, 'content/world.compiled.json');
const ASCII_DIR = join(ROOT, 'content/gym');

export function openProject(path = PROJECT_PATH): Project {
  if (existsSync(path)) return loadProject(path);
  return { path, json: newProjectJson(), levels: [] };
}

/** The hand-written ASCII rooms (content/gym): targets for doors out of the LDtk world. */
export function asciiRooms(): Map<string, RoomFile> {
  const out = new Map<string, RoomFile>();
  for (const f of readdirSync(ASCII_DIR).sort())
    if (f.endsWith('.json')) {
      const r = JSON.parse(readFileSync(join(ASCII_DIR, f), 'utf8')) as RoomFile;
      out.set(r.id, r);
    }
  return out;
}

export function models(p: Project): LevelModel[] {
  return p.levels.map(levelToModel);
}

/** Adds or replaces the level for `m` (baked first). Keeps the level's uid and position in the list. */
export function upsertLevel(p: Project, m: LevelModel): { warnings: string[] } {
  syncDefs(p.json);
  const { collision, warnings } = bake(m);
  m.collision = collision;
  const ident = levelIdent(m.id);
  const i = p.levels.findIndex((l) => l.identifier === ident);
  const uid = i >= 0 ? (p.levels[i] as Level).uid : p.json.nextUid++;
  const lv = modelToLevel(p, m, uid);
  if (i >= 0) p.levels[i] = lv;
  else p.levels.push(lv);
  p.json.levels = p.levels;
  return { warnings };
}

export function removeLevel(p: Project, id: string): boolean {
  const i = p.levels.findIndex((l) => l.identifier === levelIdent(id));
  if (i < 0) return false;
  p.levels.splice(i, 1);
  p.json.levels = p.levels;
  return true;
}

/** Re-bakes every level's Collision in place (after human edits in LDtk). Returns changed ids. */
export function rebakeAll(p: Project): { changed: string[]; warnings: string[] } {
  const changed: string[] = [];
  const warnings: string[] = [];
  for (const lv of p.levels) {
    const m = levelToModel(lv);
    const r = bake(m);
    warnings.push(...r.warnings.map((w) => `${m.id}: ${w}`));
    const li = lv.layerInstances.find((l) => l.__identifier === LAYERS.collision);
    if (!li) throw new Error(`${m.id}: no Collision layer`);
    const next = [...r.collision];
    if (li.intGridCsv.length !== next.length || li.intGridCsv.some((v, k) => v !== next[k])) {
      li.intGridCsv = next;
      changed.push(m.id);
    }
  }
  return { changed, warnings };
}

export interface BuildReport extends CompileResult {
  bakeWarnings: string[];
  lint: ReturnType<typeof lintWorld>;
  written: string[];
}

/** defs -> bake -> compile -> lint; writes the project and the bundle unless `dryRun`. */
export function build(p: Project, opts: { dryRun?: boolean } = {}): BuildReport {
  syncDefs(p.json);
  const { warnings: bakeWarnings } = rebakeAll(p);
  const ms = models(p);
  const res = compileWorld(ms, asciiRooms());
  const lint = lintWorld(ms, res);
  const written: string[] = [];
  if (!opts.dryRun) {
    written.push(...saveProject(p));
    const text = formatBundle(res.bundle);
    if (!existsSync(BUNDLE_PATH) || readFileSync(BUNDLE_PATH, 'utf8') !== text) {
      writeFileSync(BUNDLE_PATH, text);
      written.push(BUNDLE_PATH);
    }
  }
  return { ...res, bakeWarnings, lint, written };
}

/**
 * Freshness: what `npm run world -- build` would change. Empty = the stored defs, Collision
 * layers and compiled bundle all match the brushes and the code.
 */
export function staleness(path = PROJECT_PATH, bundlePath = BUNDLE_PATH): string[] {
  const out: string[] = [];
  if (!existsSync(path)) return [`${path} does not exist`];
  const p = loadProject(path);
  const before = JSON.stringify(p.json.defs);
  const nextUid = p.json.nextUid;
  syncDefs(p.json);
  if (JSON.stringify(p.json.defs) !== before || p.json.nextUid !== nextUid)
    out.push('LDtk defs differ from tools/world/model.ts');
  const { changed } = rebakeAll(p);
  for (const id of changed) out.push(`${id}: stored Collision is not the bake of its brushes + paint`);
  const res = compileWorld(models(p), asciiRooms());
  const text = formatBundle(res.bundle);
  if (!existsSync(bundlePath) || readFileSync(bundlePath, 'utf8') !== text)
    out.push(`${bundlePath} is not the compile of the project`);
  return out;
}
