/**
 * Progression report: findings (with stable ids for the check baseline), markdown, JSON, and the
 * world graph as DOT (-> SVG through graphviz when installed, else our own layered SVG).
 */
import { execFileSync } from 'node:child_process';
import { evidenceKey, type GateAudit } from './audit';
import type { DesignGraph, DesignReport, DiffItem } from './intended';
import type { Answer } from './oracle';
import type { ProbeReport } from './probes';
import type { Solution } from './solver';
import type { WorldGraph } from './world';

export type Level = 'error' | 'warning' | 'info';
export interface Finding {
  id: string;
  level: Level;
  text: string;
}

export interface DesignSection {
  file: string;
  graph: DesignGraph;
  report: DesignReport;
  diff: DiffItem[];
  /** Symbolic design findings count as errors only for the built-world design (the gym). */
  strict: boolean;
}

export interface RunReport {
  meta: {
    date: string;
    sha: string;
    engine: string;
    mode: 'full' | 'check';
    workers: number;
    budget: number;
  };
  world: WorldGraph;
  solutions: Solution[];
  audit: GateAudit[];
  probes?: ProbeReport;
  designs: DesignSection[];
  oracle: Record<string, number>;
  timings: Record<string, number>;
  evidence: Record<string, string>;
}

const kit = (a: readonly string[]) => `{${a.join(', ') || 'none'}}`;
const why = (a?: Answer) =>
  !a
    ? 'never asked'
    : a.verdict === 'no'
      ? a.how === 'static'
        ? 'unreachable (static proof)'
        : 'unreachable (search exhausted)'
      : `not found in ${a.budget ?? '?'} nodes${a.stale ? ' (stale)' : ''}`;

export function findings(r: RunReport): Finding[] {
  const out: Finding[] = [];
  for (const e of r.world.errors) out.push({ id: `structure:${e}`, level: 'error', text: e });
  for (const w of r.world.warnings) out.push({ id: `structure:${w}`, level: 'warning', text: w });
  for (const s of r.solutions) {
    const sem = s.semantics;
    for (const [id, n] of Object.entries(s.rooms))
      if (!n.reached)
        out.push({
          id: `unreachable-room:${sem}:${id}`,
          level: 'error',
          text: `[${sem}] room ${id} is not reachable`,
        });
    for (const [id, n] of Object.entries(s.exits)) {
      const room = id.split('/')[0] as string;
      if (!n.reached && s.rooms[room]?.reached)
        out.push({
          id: `unreached-exit:${sem}:${id}`,
          level: 'error',
          text: `[${sem}] exit ${id} never reached: ${why(n.why)}`,
        });
    }
    for (const [id, n] of Object.entries(s.pickups))
      if (!n.reached && !id.startsWith('grant:'))
        out.push({
          id: `unreached-pickup:${sem}:${id}`,
          level: 'error',
          text: `[${sem}] pickup ${id} never reached: ${why(n.why)}`,
        });
    for (const x of s.softlocks)
      out.push({
        id: `softlock:${sem}:${x.room}@${x.at}${kit(x.abilities)}`,
        level: 'error',
        text: `[${sem}] ${x.proven ? 'softlock' : 'suspected softlock'}: ${x.room} at ${x.at} with ${kit(x.abilities)} can't get back to the start or a Rest (path: ${x.path.join(' > ') || 'start'})`,
      });
  }
  for (const a of r.audit) {
    if (a.status === 'pass') continue;
    const bits = [
      ...a.rules,
      ...a.checks
        .filter((c) => c.status === 'bypassed')
        .map((c) =>
          c.basis === 'room'
            ? `room kit ${kit(c.kit)} without the ${c.verb} aim bypasses it`
            : `${c.basis === 'g7' ? 'G7' : 'full kit'} minus ${c.verb} ${kit(c.kit)} bypasses it; minimal: ${c.bypasses.map((b) => kit(b.abilities)).join(' or ')}`,
        ),
      ...(a.status === 'error' ? a.notes : []),
    ];
    out.push({
      id: `gate-${a.status}:${a.gate.id}`,
      level: a.status === 'warn' ? 'warning' : 'error',
      text: `gate ${a.gate.id}: ${bits.join('; ')}`,
    });
  }
  for (const t of r.probes?.traps ?? [])
    out.push({
      id: `trap:${t.room}:${t.ledge}${kit(t.abilities)}`,
      level: t.proven ? 'error' : 'warning',
      text: `${t.proven ? 'trap' : 'suspected trap'} in ${t.room}: ledge ${t.ledge} is reachable from ${t.entry} with ${kit(t.abilities)} but nothing gets back out`,
    });
  for (const d of r.designs) {
    for (const f of d.report.findings) {
      if (f.level === 'info') continue;
      out.push({
        id: `design:${d.file}:${f.check}:${f.subject}`,
        level: d.strict ? f.level : 'warning',
        text: `design ${d.file}: ${f.check}: ${f.subject}: ${f.detail}`,
      });
    }
    for (const x of d.diff) {
      if (x.level === 'info') continue;
      out.push({
        id: `diff:${d.file}:${x.kind}:${x.subject}`,
        level: x.level,
        text: `diff ${d.file}: ${x.kind}: ${x.subject}: ${x.detail}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Markdown.

function table(head: string[], rows: string[][]): string {
  const esc = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

export function markdown(r: RunReport, fs: Finding[], baseline: Set<string>, svgName?: string): string {
  const L: string[] = [];
  const world = r.world;
  const sol = (sem: string) => r.solutions.find((s) => s.semantics === sem);
  const errors = fs.filter((f) => f.level === 'error');
  const newErrors = errors.filter((f) => !baseline.has(f.id));
  L.push('# Progression validator report', '');
  L.push(
    `Generated ${r.meta.date} by \`npm run progression\` (${r.meta.mode} mode) on build ${r.meta.sha}, engine ${r.meta.engine}. ${r.meta.workers} search workers, default budget ${r.meta.budget} nodes. Tool: \`tools/progression/\`; how to read it: \`memory/progression.md\`.`,
    '',
  );
  L.push('## Summary', '');
  const w = sol('world');
  const g = sol('gym');
  const reached = (s?: Solution) =>
    s ? `${Object.values(s.rooms).filter((x) => x.reached).length}/${Object.keys(s.rooms).length}` : '-';
  const exitsReached = (s?: Solution) =>
    s ? `${Object.values(s.exits).filter((x) => x.reached).length}/${Object.keys(s.exits).length}` : '-';
  const gateFails = r.audit.filter((a) => a.status === 'fail').length;
  L.push(
    table(
      ['Check', 'World semantics (Phase 3: abilities persist)', 'Gym semantics (today: each room sets them)'],
      [
        ['Rooms reachable from the start', reached(w), reached(g)],
        ['Exits (doors, G) reached', exitsReached(w), exitsReached(g)],
        [
          'Softlocks (proven / suspected)',
          w
            ? `${w.softlocks.filter((x) => x.proven).length} / ${w.softlocks.filter((x) => !x.proven).length}`
            : '-',
          g
            ? `${g.softlocks.filter((x) => x.proven).length} / ${g.softlocks.filter((x) => !x.proven).length}`
            : '-',
        ],
        ['States explored', String(w?.states.length ?? '-'), String(g?.states.length ?? '-')],
      ],
    ),
    '',
  );
  L.push(
    `- **Gate audit:** ${r.audit.length} annotated gates, ${gateFails} failing, ${r.audit.filter((a) => a.status === 'warn').length} warning (full-kit bypass only).`,
    `- **Trap probes:** ${r.probes ? `${r.probes.probed} ledges probed, ${r.probes.traps.filter((t) => t.proven).length} proven traps, ${r.probes.traps.filter((t) => !t.proven).length} suspected` : 'skipped'}.`,
    `- **Findings:** ${errors.length} errors (${newErrors.length} not in the baseline \`tests/progression/baseline.json\`), ${fs.filter((f) => f.level === 'warning').length} warnings.`,
    `- **Run time:** ${Object.entries(r.timings)
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`)
      .join(', ')}.`,
    '',
  );
  if (svgName)
    L.push(
      `![World graph](${svgName})`,
      '',
      'Green: reached (world semantics). Red: not reached. Orange: a softlock or trap in the room. Purple border: a failing gate. Dashed edge: exit never reached.',
      '',
    );

  L.push('## Findings', '');
  if (fs.length === 0) L.push('None.', '');
  else
    L.push(
      table(
        ['Level', 'Baseline', 'Finding'],
        fs
          .filter((f) => f.level !== 'info')
          .map((f) => [
            f.level,
            baseline.has(f.id) ? 'accepted' : f.level === 'error' ? '**NEW**' : '',
            f.text,
          ]),
      ),
      '',
    );

  L.push('## Gate audit', '');
  L.push(
    "Each key ability K of a gate must be necessary. **G7** (governs): the target must be unreachable with every kit the player can still have in that room when K is removed from the game (the bag empties on room exit, so the kit is abilities plus the room's own palette, which the bot sim contains). **Full kit**: every sim ability except K (future-proofing). **G3/G8**: a reach gate may not share a room with pink unless pink is the key, and then it must be a teachGate. **Aims** (`moves`, e.g. `seize:up`): with the room's own kit and that aimed move forbidden (the bot prunes any state where it started), the target must stay unreachable.",
    '',
  );
  if (r.audit.length === 0)
    L.push('No gates are annotated (`gates.<c>.requires` or `locks` in a room file).', '');
  for (const a of r.audit) {
    L.push(`### ${a.gate.id}: **${a.status.toUpperCase()}**`, '');
    L.push(
      `- ${a.gate.kind === 'lock' ? `Lock "${a.gate.name}"` : `Tile gate ${a.gate.name} (opens on ${a.gate.opensOn})`}, ${a.gate.hold}${a.gate.teachGate ? ', teachGate' : ''}; requires ${kit(a.gate.requires)}; target \`${a.gate.target}\` from spawn ${a.gate.from}${a.gate.prelude ? ` after the prelude \`${a.gate.prelude}\`` : ''}${a.gate.derived ? ` (${a.gate.derived})` : ''}.`,
      `- Room palette: ${kit(a.palette)}.${a.gate.note ? ` Note: ${a.gate.note}` : ''}`,
    );
    for (const x of a.rules) L.push(`- **Rule broken:** ${x}`);
    for (const n of a.notes) L.push(`- ${n}`);
    if (a.checks.length)
      L.push(
        '',
        table(
          ['Key removed', 'Basis', 'Kit', 'Result', 'Minimal bypass combos (evidence)'],
          a.checks.map((c) => [
            c.verb,
            c.basis === 'g7' ? 'G7' : c.basis === 'room' ? 'room kit, aim forbidden' : 'full kit',
            kit(c.kit),
            c.status === 'bypassed'
              ? `**BYPASSED** (${c.answer.frames ?? '?'} f)`
              : `holds: ${why(c.answer)}${c.control ? `; with the aim: ${c.control.verdict === 'yes' ? `reached (${c.control.how})` : why(c.control)}` : ''}`,
            c.bypasses
              .map(
                (b) =>
                  `${kit(b.abilities)} ${b.answer.frames ?? '?'} f${r.evidence[evidenceKey(a.gate.id, c, b.abilities)] ? ` [tape](${r.evidence[evidenceKey(a.gate.id, c, b.abilities)]})` : ''}`,
              )
              .join('; ') + (c.combosTried ? ` (${c.combosTried} combos tried)` : ''),
          ]),
        ),
      );
    const tapes = a.checks.flatMap((c) => c.bypasses).filter((b) => b.answer.tape);
    if (tapes.length) {
      L.push('', '<details><summary>Bypass tapes (input DSL)</summary>', '');
      for (const b of tapes) L.push(`- ${kit(b.abilities)}: \`${b.answer.tape}\``);
      L.push('', '</details>');
    }
    L.push('');
  }

  for (const s of r.solutions) {
    L.push(`## Reachability: ${s.semantics} semantics`, '');
    L.push(
      s.semantics === 'world'
        ? "Abilities persist and only grow. A room's declared `abilities` are an implicit pickup (`grant:<room>`) collected on entry; explicit `pickups` where they stand. Kit = abilities held when taking the exit into the room."
        : "What the sim does today: entering a room sets the abilities to the room's declared set.",
      '',
    );
    const rows = Object.values(world.rooms).map((room) => {
      const n = s.rooms[room.id];
      const exits = room.exits.map((x) => {
        const e = s.exits[x.id];
        const how = e?.evidence
          ? `${e.evidence.how}${e.evidence.evidence ? `: ${e.evidence.evidence}` : ''}`
          : '';
        return `${x.target}→${x.to} ${e?.reached ? `✓ (${how})` : `✗ ${why(e?.why)}`}`;
      });
      return [
        room.id,
        n?.reached ? '✓' : '✗',
        (n?.kits ?? []).map(kit).join(' or ') || '-',
        exits.join('<br>') || '-',
      ];
    });
    L.push(table(['Room', 'Reached', 'Kit on arrival (minimal)', 'Exits (evidence)'], rows), '');
    if (s.softlocks.length) {
      L.push('**Softlocks:**', '');
      for (const x of s.softlocks)
        L.push(
          `- ${x.proven ? 'Proven' : 'Suspected'}: ${x.room} at ${x.at} with ${kit(x.abilities)}; path ${x.path.join(' > ') || 'start'}.`,
        );
      L.push('');
    }
  }

  if (r.probes) {
    L.push('## In-room trap probes', '');
    L.push(
      `${r.probes.probed} (room, entry, kit, ledge) probes: ${r.probes.escaped} ledges get back to their entry or an exit, ${r.probes.unreachable} stuck ledges are not reachable anyway, ${r.probes.traps.length} traps. ${(r.probes.ms / 1000).toFixed(1)} s.`,
      '',
    );
    for (const t of r.probes.traps)
      L.push(
        `- ${t.proven ? '**Trap**' : 'Suspected trap'}: ${t.room} ledge ${t.ledge} (entry ${t.entry}, kit ${kit(t.abilities)}); reach tape \`${t.reach.tape ?? '?'}\``,
      );
    L.push('');
  }

  L.push('## World graph (extracted from room data)', '');
  L.push(
    table(
      ['Room', 'Grant', 'Entries', 'Exits', 'Pickups / Rests', 'Gates', 'Palette', 'Hazards'],
      Object.values(world.rooms).map((room) => [
        room.id,
        kit(room.grant),
        room.entries.join(', '),
        room.exits
          .map((x) => `${x.target}→${x.to}${x.toSpawn !== 'default' ? `:${x.toSpawn}` : ''}`)
          .join(', ') || (room.goalOnly ? 'G (no next)' : '-'),
        [
          ...room.pickups.filter((p) => !p.implicit).map((p) => `${p.id} ${kit(p.grants)}`),
          ...room.rests.map((x) => x.id),
        ].join(', ') || '-',
        room.gates.map((x) => `${x.kind}:${x.name} ${kit(x.requires)} ${x.hold}`).join(', ') || '-',
        kit(room.palette),
        [
          room.hazards.spikes ? `${room.hazards.spikes} spikes` : '',
          room.hazards.orbs ? `${room.hazards.orbs} orbs` : '',
          room.hazards.enemies.join(' '),
        ]
          .filter(Boolean)
          .join(', ') || '-',
      ]),
    ),
    '',
  );

  for (const d of r.designs) {
    L.push(`## Design graph: ${d.file}`, '');
    const rep = d.report;
    L.push(
      `${rep.rooms} rooms, ${rep.edges} edges. Symbolic solve (abilities × flags × fever): ${rep.reachable.length} non-stub rooms reachable, ${rep.unreachable.length} not${rep.onlyWithBreaks.length ? ` (${rep.onlyWithBreaks.length} only through sanctioned breaks)` : ''}. ${rep.ms} ms.`,
      '',
    );
    const df = rep.findings.filter((f) => f.level !== 'info');
    if (df.length)
      L.push(
        table(
          ['Level', 'Check', 'Subject', 'Detail'],
          df.map((f) => [f.level, f.check, f.subject, f.detail]),
        ),
        '',
      );
    else L.push('Every design check passes.', '');
    if (rep.breaks.length) {
      L.push('**Sanctioned breaks:**', '');
      for (const b of rep.breaks) L.push(`- ${b.edge}: ${b.detail}`);
      L.push('');
    }
    if (rep.g7.length) {
      L.push(
        '**G7 plan** (kits each reach gate must fail against once built; the room palette is part of the kit):',
        '',
      );
      L.push(
        table(
          ['Edge', 'Key', 'Kits without the key (+ room palette)', 'Sim kits'],
          rep.g7.map((p) => [
            `${p.edge} ${p.from}→${p.to}${p.teachGate ? ' (teach)' : ''}`,
            p.key,
            p.kits.map((k) => `${k.kit} + ${kit(k.palette)}`).join('<br>') || 'room unreachable without it',
            p.simKits ? p.simKits.map(kit).join('<br>') : 'key not in the sim yet',
          ]),
        ),
        '',
      );
    }
    const infos = rep.findings.filter((f) => f.level === 'info');
    if (infos.length) {
      L.push('<details><summary>Notes</summary>', '');
      for (const f of infos) L.push(`- ${f.check}: ${f.subject}: ${f.detail}`);
      L.push('', '</details>', '');
    }
    L.push('**Diff against the built rooms:**', '');
    if (d.diff.length === 0) L.push('Design and build agree.', '');
    else
      L.push(
        table(
          ['Level', 'Kind', 'Subject', 'Detail'],
          d.diff.map((x) => [x.level, x.kind, x.subject, x.detail]),
        ),
        '',
      );
  }

  L.push('## Oracle and timings', '');
  L.push(
    `Queries ${r.oracle.queries}: static proofs ${r.oracle.static}, cache hits ${r.oracle.cache}, inferred by monotonicity ${r.oracle.inferred}, committed tapes ${r.oracle.tapes}, bot searches ${r.oracle.searches} (${((r.oracle.searchMs ?? 0) / 1000).toFixed(1)} s wall), tapes re-verified ${r.oracle.reverified}, stale records trusted ${r.oracle.stale}.`,
    '',
  );
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// Graph drawing.

function colours(r: RunReport): Map<string, { fill: string; border: string }> {
  const w = r.solutions.find((s) => s.semantics === 'world') ?? r.solutions[0];
  const out = new Map<string, { fill: string; border: string }>();
  const bad = new Set([
    ...(w?.softlocks ?? []).map((x) => x.room),
    ...(r.probes?.traps ?? []).map((t) => t.room),
  ]);
  const failing = new Set(r.audit.filter((a) => a.status === 'fail').map((a) => a.gate.room));
  for (const id of Object.keys(r.world.rooms)) {
    const reached = w?.rooms[id]?.reached;
    out.set(id, {
      fill: !reached ? '#f4b4b4' : bad.has(id) ? '#f7c77e' : '#b9e4b0',
      border: failing.has(id) ? '#7a3fb0' : '#333333',
    });
  }
  return out;
}

export function dot(r: RunReport): string {
  const w = r.solutions.find((s) => s.semantics === 'world') ?? r.solutions[0];
  const col = colours(r);
  const L = [
    'digraph world {',
    '  rankdir=LR; node [shape=box, style="filled,rounded", fontname="Helvetica", fontsize=11]; edge [fontname="Helvetica", fontsize=9];',
  ];
  for (const room of Object.values(r.world.rooms)) {
    const c = col.get(room.id);
    const kits = w?.rooms[room.id]?.kits.map((k) => k.join('+') || 'none').join(' | ') ?? '';
    const gates = room.gates.map((g) => `${g.kind} ${g.name}: ${g.requires.join('+')}`).join('\\n');
    const label = [
      room.id,
      room.grant.length ? `grants ${room.grant.join('+')}` : '',
      kits ? `kit ${kits}` : '',
      gates,
    ]
      .filter(Boolean)
      .join('\\n');
    L.push(
      `  "${room.id}" [label="${label}", fillcolor="${c?.fill}", color="${c?.border}", penwidth=${c?.border === '#333333' ? 1 : 3}];`,
    );
  }
  for (const k of r.world.links) {
    const ok = w?.exits[k.exit]?.reached;
    const x = k.exit.split('/')[1] ?? '';
    L.push(
      `  "${k.from}" -> "${k.to}" [label="${x.replace('exit:', '')}"${ok ? '' : ', style=dashed, color="#c03030"'}];`,
    );
  }
  L.push('}');
  return `${L.join('\n')}\n`;
}

export function hasGraphviz(): boolean {
  try {
    execFileSync('dot', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function renderSvg(r: RunReport): { svg: string; via: 'graphviz' | 'builtin' } {
  if (hasGraphviz()) {
    try {
      return { svg: execFileSync('dot', ['-Tsvg'], { input: dot(r) }).toString(), via: 'graphviz' };
    } catch {
      // fall through to the built-in layout
    }
  }
  return { svg: builtinSvg(r), via: 'builtin' };
}

/** Layered layout by BFS depth from the start (no graphviz): columns of boxes, straight edges. */
function builtinSvg(r: RunReport): string {
  const w = r.solutions.find((s) => s.semantics === 'world') ?? r.solutions[0];
  const col = colours(r);
  const depth = new Map<string, number>([[r.world.start.room, 0]]);
  const q = [r.world.start.room];
  while (q.length > 0) {
    const id = q.shift() as string;
    for (const k of r.world.links)
      if (k.from === id && !depth.has(k.to)) {
        depth.set(k.to, (depth.get(id) ?? 0) + 1);
        q.push(k.to);
      }
  }
  let maxD = Math.max(0, ...depth.values());
  for (const id of Object.keys(r.world.rooms)) if (!depth.has(id)) depth.set(id, ++maxD);
  const cols = new Map<number, string[]>();
  for (const [id, d] of depth) cols.set(d, [...(cols.get(d) ?? []), id]);
  const BW = 130;
  const BH = 34;
  const GX = 60;
  const GY = 14;
  const pos = new Map<string, { x: number; y: number }>();
  let H = 0;
  for (const [d, ids] of [...cols].sort((a, b) => a[0] - b[0])) {
    ids.sort().forEach((id, i) => {
      pos.set(id, { x: 20 + d * (BW + GX), y: 20 + i * (BH + GY) });
    });
    H = Math.max(H, 20 + ids.length * (BH + GY));
  }
  const W = 40 + (maxD + 1) * (BW + GX);
  const S: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 20}" font-family="Helvetica" font-size="11">`,
  ];
  for (const k of r.world.links) {
    const a = pos.get(k.from);
    const b = pos.get(k.to);
    if (!a || !b) continue;
    const ok = w?.exits[k.exit]?.reached;
    S.push(
      `<line x1="${a.x + BW}" y1="${a.y + BH / 2}" x2="${b.x}" y2="${b.y + BH / 2}" stroke="${ok ? '#666' : '#c03030'}"${ok ? '' : ' stroke-dasharray="4 3"'}/>`,
    );
  }
  for (const [id, p] of pos) {
    const c = col.get(id);
    S.push(
      `<rect x="${p.x}" y="${p.y}" width="${BW}" height="${BH}" rx="6" fill="${c?.fill}" stroke="${c?.border}" stroke-width="${c?.border === '#333333' ? 1 : 3}"/>`,
      `<text x="${p.x + BW / 2}" y="${p.y + BH / 2 + 4}" text-anchor="middle">${id}</text>`,
    );
  }
  S.push('</svg>');
  return `${S.join('\n')}\n`;
}
