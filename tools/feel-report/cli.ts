/**
 * Feel report: measures movement feel metrics in the headless sim and compares them with the
 * Celeste–Hollow Knight envelope (movement-spec §3.4, §7.5). Writes markdown + JSON.
 *
 *   npm run feel:report                          # default preset -> progress/feel/<date>-<preset>.{md,json}
 *   npm run feel:report -- --preset celeste      # any preset the controller defines
 *   npm run feel:report -- --all-presets         # one section per preset
 *   npm run feel:report -- --tuning '{"jump":{"gravity":4000}}' --no-write
 *   npm run feel:report -- --compare progress/feel/2026-09-28-default.json
 *
 * See memory/feel-report.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildMeta } from '../../src/debug/build-info';
import { LEGACY_CONTROLLER, presetNames } from '../../src/debug/sim-adapter';
import { installBuildInfo } from '../lib/build-info';
import { judge, REFERENCE, type Row } from './envelope';
import { type FeelMetrics, type FeelReport, measureFeel } from './metrics';

installBuildInfo();

const { values: args } = parseArgs({
  options: {
    preset: { type: 'string' },
    'all-presets': { type: 'boolean', default: false },
    tuning: { type: 'string' },
    out: { type: 'string', default: 'progress/feel' },
    'no-write': { type: 'boolean', default: false },
    compare: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(0);
}

interface Section {
  preset: string;
  report: FeelReport;
  rows: Row[];
  ms: number;
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

function markdown(sections: Section[], previous?: Record<string, Section>): string {
  const meta = buildMeta();
  const out: string[] = [
    `# Feel report (${new Date().toISOString().slice(0, 10)})`,
    '',
    `Build ${meta.sha}, sim ${meta.sim}${LEGACY_CONTROLLER ? ', **Phase 0 placeholder controller**' : ''}. Envelope = [min, max] of Celeste and Hollow Knight (movement-spec §3.4); **OUT** = outside by more than 15%, near = outside by up to 15%.`,
  ];
  for (const s of sections) {
    const prev = previous?.[s.preset];
    out.push('', `## Preset \`${s.preset}\` (${s.ms} ms)`, '');
    out.push(
      `| Metric | Value | Celeste | HK | spec opus | Verdict |${prev ? ' Previous |' : ''}`,
      `|---|---|---|---|---|---|${prev ? '---|' : ''}`,
    );
    for (const r of s.rows) {
      const ref = r.ref;
      const label = ref ? `${ref.label} (${ref.unit})` : r.key;
      const pv = prev?.report.metrics[r.key];
      const changed = prev && pv !== r.value ? ` ${fmt(pv)} → |` : prev ? ' = |' : '';
      out.push(
        `| ${label} | ${fmt(r.value)} | ${fmt(ref?.celeste)} | ${fmt(ref?.hk)} | ${fmt(ref?.opus)} | ${r.verdict === 'OUT' ? '**OUT**' : r.verdict}${r.outBy ? ` (${r.outBy > 0 ? '+' : ''}${Math.round(r.outBy * 100)}%)` : ''} |${changed}`,
      );
    }
    const m = s.report.metrics;
    out.push(
      '',
      `Other: stop distance ${m.stopDistancePx} px, turn-around ${m.turnFrames} f, full jump ${s.report.raw.fullJump.heightPx} px in ${s.report.raw.fullJump.apexFrames} f, tap jump ${s.report.raw.tapJump.heightPx} px, player height ${s.report.raw.playerHeightPx} px.`,
      '',
      '**Forgiveness** (press-timing windows while running; a wider window = more forgiving):',
      '',
      '| Jump | Assists on | Assists off | Gain |',
      '|---|---|---|---|',
    );
    for (const f of s.report.forgiveness) {
      const w = (x: typeof f.on) =>
        x.successes === 0
          ? '0 f'
          : `${x.successes} f (${Math.round((x.successes * 1000) / 60)} ms; steps ${x.first}–${x.last})`;
      out.push(`| ${f.description} | ${w(f.on)} | ${w(f.off)} | ${f.on.successes - f.off.successes} f |`);
    }
    const outs = s.rows.filter((r) => r.verdict === 'OUT');
    out.push(
      '',
      outs.length
        ? `**Flags:** ${outs.map((r) => r.ref?.label ?? r.key).join('; ')}.`
        : 'No metric is outside the envelope by more than 15%.',
    );
  }
  return `${out.join('\n')}\n`;
}

function main(): void {
  const presets = args['all-presets'] ? presetNames() : [args.preset ?? 'default'];
  const tuning = args.tuning ? (JSON.parse(args.tuning) as Record<string, unknown>) : undefined;
  const sections: Section[] = presets.map((preset) => {
    const t0 = performance.now();
    const report = measureFeel({ preset, ...(tuning ? { tuning } : {}) });
    const rows = (Object.keys(REFERENCE) as (keyof FeelMetrics)[]).map((k) => judge(k, report.metrics[k]));
    return { preset, report, rows, ms: Math.round(performance.now() - t0) };
  });
  let previous: Record<string, Section> | undefined;
  if (args.compare) {
    const prev = JSON.parse(readFileSync(resolve(args.compare), 'utf8')) as { sections: Section[] };
    previous = Object.fromEntries(prev.sections.map((s) => [s.preset, s]));
  }
  const md = markdown(sections, previous);
  const json = {
    date: new Date().toISOString(),
    build: buildMeta(),
    legacyController: LEGACY_CONTROLLER,
    sections,
  };
  if (args.json) console.log(JSON.stringify(json, null, 2));
  else console.log(md);
  if (!args['no-write']) {
    const dir = resolve(args.out ?? 'progress/feel');
    mkdirSync(dir, { recursive: true });
    const base = join(
      dir,
      `${new Date().toISOString().slice(0, 10)}-${presets.length > 1 ? 'all' : presets[0]}`,
    );
    writeFileSync(`${base}.md`, md);
    writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
    console.error(`wrote ${base}.md and .json`);
  }
}

main();
