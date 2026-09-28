/**
 * World pipeline CLI (docs/research/level-toolchain.md §2.4; how-to in memory/level-authoring.md).
 *
 *   npm run world -- import <sheet.json>...   create/replace rooms from room sheets, then build
 *   npm run world -- export <room> [--out f]  print a room's sheet (edit it, import it back)
 *   npm run world -- section import <f.json>  a whole region in world tiles, cut into its rooms
 *   npm run world -- section export <name> [--out f]   rebuild the section sheet from its rooms
 *   npm run world -- build [--check]          defs + bake + compile + lint (after LDtk edits);
 *                                             --check: exit 1 if anything stored is stale
 *   npm run world -- render [--region p | --rooms a,b] [--out f.png] [--scale n]
 *   npm run world:render                      = render (whole world -> clips/world/world.png)
 *   npm run world -- ls                       rooms, world positions, sizes
 *   npm run world -- rm <room>                delete a room
 *   npm run world -- port <ascii-room> --id <new-id> --at x,y [--out f]   content/gym room -> sheet
 *   npm run world -- ascii <room>             the compiled rows (what the sim loads)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { levelToModel } from './level';
import { formatSheet, modelToSheet, sheetToModel } from './model';
import { renderWorld } from './png';
import { portRoomText } from './port';
import {
  asciiRooms,
  type BuildReport,
  build,
  models,
  openProject,
  ROOT,
  removeLevel,
  staleness,
  upsertLevel,
} from './project';
import { formatSection, modelsToSection, sectionToModels } from './section';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    region: { type: 'string' },
    rooms: { type: 'string' },
    scale: { type: 'string' },
    id: { type: 'string' },
    at: { type: 'string' },
    check: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});
const [cmd, ...rest] = positionals;
const rel = (p: string) => relative(process.cwd(), p) || p;

function usage(): never {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(cmd ? 1 : 0);
}

function report(r: BuildReport): number {
  const errs = [...r.errors, ...r.lint.errors];
  const warns = [...r.bakeWarnings, ...r.warnings, ...r.lint.warnings];
  for (const w of warns) console.log(`warning: ${w}`);
  for (const e of errs) console.log(`ERROR: ${e}`);
  const matched = r.lint.openings.filter((o) => o.matched);
  if (matched.length && !args.quiet)
    console.log(
      `edge links: ${matched.map((o) => `${o.room}:${o.side}${o.from}-${o.to}->${o.into}`).join(', ')}`,
    );
  for (const f of r.written) console.log(`wrote ${rel(f)}`);
  console.log(`${r.bundle.rooms.length} rooms, ${errs.length} errors, ${warns.length} warnings`);
  return errs.length ? 1 : 0;
}

function main(): number {
  if (args.help || !cmd) usage();
  switch (cmd) {
    case 'import': {
      if (!rest.length) usage();
      const p = openProject();
      for (const file of rest) {
        const m = sheetToModel(JSON.parse(readFileSync(file, 'utf8')));
        const { warnings } = upsertLevel(p, m);
        for (const w of warnings) console.log(`warning: ${m.id}: ${w}`);
        console.log(
          `imported ${m.id} (${m.size[0]}x${m.size[1]} at ${m.at[0]},${m.at[1]}, ${m.brushes.length} brushes, ${m.entities.length} entities)`,
        );
      }
      return report(build(p));
    }
    case 'section': {
      const [sub, arg] = rest;
      if (sub === 'import' && arg) {
        const p = openProject();
        const { section, models: ms } = sectionToModels(JSON.parse(readFileSync(arg, 'utf8')));
        const keep = new Set(ms.map((m) => m.id));
        for (const old of models(p))
          if (old.id.startsWith(`${section}-`) && !keep.has(old.id)) {
            removeLevel(p, old.id);
            console.log(`removed ${old.id} (not in the section)`);
          }
        for (const m of ms) {
          const { warnings } = upsertLevel(p, m);
          for (const w of warnings) console.log(`warning: ${m.id}: ${w}`);
          console.log(
            `imported ${m.id} (${m.size[0]}x${m.size[1]} at ${m.at[0]},${m.at[1]}, ${m.brushes.length} brushes, ${m.entities.length} entities)`,
          );
        }
        return report(build(p));
      }
      if (sub === 'export' && arg) {
        const ms = models(openProject()).filter((m) => m.id.startsWith(`${arg}-`));
        if (!ms.length) throw new Error(`no rooms ${arg}-*`);
        const text = formatSection(modelsToSection(arg, ms));
        if (args.out) {
          mkdirSync(dirname(resolve(args.out)), { recursive: true });
          writeFileSync(args.out, text);
          console.log(`wrote ${args.out}`);
        } else process.stdout.write(text);
        return 0;
      }
      return usage();
    }
    case 'export': {
      const id = rest[0] ?? usage();
      const p = openProject();
      const lv = p.levels.find((l) => levelToModel(l).id === id);
      if (!lv) throw new Error(`no room ${id}`);
      const text = formatSheet(modelToSheet(levelToModel(lv)));
      if (args.out) {
        mkdirSync(dirname(resolve(args.out)), { recursive: true });
        writeFileSync(args.out, text);
        console.log(`wrote ${args.out}`);
      } else process.stdout.write(text);
      return 0;
    }
    case 'build': {
      if (args.check) {
        const stale = staleness();
        for (const s of stale) console.log(`STALE: ${s}`);
        const r = build(openProject(), { dryRun: true });
        const errs = [...r.errors, ...r.lint.errors];
        for (const e of errs) console.log(`ERROR: ${e}`);
        if (stale.length) console.log('run `npm run world -- build` and commit the result');
        return stale.length || errs.length ? 1 : 0;
      }
      return report(build(openProject()));
    }
    case 'render': {
      const p = openProject();
      let ms = models(p);
      const region = args.region;
      const pick = args.rooms?.split(',');
      if (region) ms = ms.filter((m) => m.id.startsWith(region));
      if (pick) ms = ms.filter((m) => pick.includes(m.id));
      if (!ms.length) throw new Error('no rooms match');
      const r = build(p, { dryRun: true });
      const rooms = new Map(r.bundle.rooms.map((x) => [x.id, x]));
      const out = resolve(
        args.out ?? join(ROOT, 'clips/world', `${region ?? (pick ? pick.join('+') : 'world')}.png`),
      );
      const img = renderWorld(ms, rooms, {
        scale: args.scale ? Number(args.scale) : undefined,
        title: region ?? 'world',
      });
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, img.png);
      console.log(`wrote ${rel(out)} (${img.w}x${img.h} px, ${img.scale} px/tile, ${ms.length} rooms)`);
      return 0;
    }
    case 'ls': {
      for (const m of models(openProject()))
        console.log(
          `${m.id.padEnd(24)} at ${`${m.at[0]},${m.at[1]}`.padEnd(10)} ${`${m.size[0]}x${m.size[1]}`.padEnd(8)} (${(m.size[0] / 30).toFixed(1)}x${(m.size[1] / 17).toFixed(1)} screens) ${m.brushes.length} brushes, ${m.entities.length} entities${m.fields.draft ? ', draft' : ''}`,
        );
      return 0;
    }
    case 'rm': {
      const id = rest[0] ?? usage();
      const p = openProject();
      if (!removeLevel(p, id)) throw new Error(`no room ${id}`);
      console.log(`removed ${id}`);
      return report(build(p));
    }
    case 'port': {
      const src = rest[0] ?? usage();
      const room = asciiRooms().get(src);
      if (!room) throw new Error(`no ASCII room ${src} in content/gym`);
      const at = (args.at ?? '0,0').split(',').map(Number) as [number, number];
      const text = portRoomText(room, args.id ?? `port-${src}`, at);
      if (args.out) {
        mkdirSync(dirname(resolve(args.out)), { recursive: true });
        writeFileSync(args.out, text);
        console.log(`wrote ${args.out}`);
      } else process.stdout.write(text);
      return 0;
    }
    case 'ascii': {
      const id = rest[0] ?? usage();
      const r = build(openProject(), { dryRun: true });
      const room = r.bundle.rooms.find((x) => x.id === id);
      if (!room) throw new Error(`no room ${id}`);
      const w = room.rows[0]?.length ?? 0;
      const ruler = Array.from({ length: w }, (_, i) => (i % 10 === 0 ? String((i / 10) % 10) : ' ')).join(
        '',
      );
      console.log(`    ${ruler}`);
      room.rows.forEach((row, y) => {
        console.log(`${String(y).padStart(3)} ${row}`);
      });
      return 0;
    }
    default:
      usage();
  }
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`world: ${(e as Error).message}`);
  process.exitCode = 1;
}
