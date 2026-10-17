/**
 * Turns a RunTrace into numbers and a report.md. Pure (no I/O): cli.ts writes the files.
 */
import type { RunTrace } from './recorder';
import type { Target } from './targets';

const sec = (f: number): string => `${(f / 60).toFixed(1)} s`;
const clock = (f: number): string => {
  const s = Math.round(f / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The summary numbers of a run (one row of the comparison table). */
export interface Summary {
  persona: string;
  room: string;
  outcome: string;
  seconds: number;
  /** From the hatch (the cocoon breaking) to the end; = seconds when there is no hatching. */
  played: number;
  deaths: number;
  catches: number;
  hits: number;
  lost: number;
  backtrack: number;
  lightsSeen: number;
  lightsLit: number;
  lightsSnuffed: number;
  lightsTotal: number;
  moths: number;
  abilities: number;
  pickups: number;
  pressesPerSec: number;
  maxSpeed: number;
  avgSpeed: number;
}

export function summarize(t: RunTrace): Summary {
  const lights = Object.values(t.lights);
  const playedFrames = t.frames - (t.hatchFrame ?? 0);
  const active = Math.max(1, t.input.activeFrames) / 60;
  return {
    persona: t.persona,
    room: t.startRoom,
    outcome: t.outcome === 'exit' ? `exit ${t.exitId}` : t.outcome,
    seconds: t.frames / 60,
    played: playedFrames / 60,
    deaths: t.deaths.length,
    catches: t.catches.length,
    hits: t.hurts.length,
    lost: t.lostFrames / 60,
    backtrack: t.backtrackFrames / 60,
    lightsSeen: lights.filter((l) => l.seen !== null).length,
    lightsLit: lights.filter((l) => l.lit !== null).length,
    lightsSnuffed: lights.filter((l) => l.snuffed !== null).length,
    lightsTotal: lights.length,
    moths: t.mothsFreed.reduce((a, m) => a + m.n, 0),
    abilities: t.abilities.length,
    pickups: t.pickups,
    pressesPerSec: t.input.presses / active,
    maxSpeed: t.speed.maxPxS,
    avgSpeed: t.speed.avgMovingPxS,
  };
}

/** The comparison table (markdown) for several runs. */
export function summaryTable(rows: readonly Summary[]): string {
  const head =
    '| persona | room | outcome | time | from hatch | deaths | catches | hits | lost | backtrack | lights seen/lit/snuffed | moths | abilities | pickups | presses/s | max / avg px/s |';
  const sep = `|${'---|'.repeat(16)}`;
  const lines = rows.map(
    (r) =>
      `| ${r.persona} | ${r.room} | ${r.outcome} | ${r.seconds.toFixed(1)} s | ${r.played.toFixed(1)} s | ${r.deaths} | ${r.catches} | ${r.hits} | ${r.lost.toFixed(1)} s | ${r.backtrack.toFixed(1)} s | ${r.lightsSeen}/${r.lightsLit}/${r.lightsSnuffed} of ${r.lightsTotal} | ${r.moths} | ${r.abilities} | ${r.pickups} | ${r.pressesPerSec.toFixed(1)} | ${r.maxSpeed} / ${r.avgSpeed} |`,
  );
  return [head, sep, ...lines].join('\n');
}

/** Groups points that lie within `radius` px of a group's first point (same room). */
export function cluster<T extends { room: string; x: number; y: number; f: number }>(
  pts: readonly T[],
  radius = 320,
): Array<{ room: string; x: number; y: number; n: number; frames: number[] }> {
  const out: Array<{ room: string; x: number; y: number; n: number; frames: number[] }> = [];
  for (const p of pts) {
    const g = out.find((c) => c.room === p.room && Math.hypot(c.x - p.x, c.y - p.y) <= radius);
    if (g) {
      g.x = (g.x * g.n + p.x) / (g.n + 1);
      g.y = (g.y * g.n + p.y) / (g.n + 1);
      g.n++;
      g.frames.push(p.f);
    } else out.push({ room: p.room, x: p.x, y: p.y, n: 1, frames: [p.f] });
  }
  return out.sort((a, b) => b.n - a.n);
}

export interface ReportMeta {
  when: string;
  abilities: string[] | null;
  targets: Record<string, Target>;
  /** Files beside the report (heatmaps, tape, clip). */
  files: string[];
  command: string;
  lostAfter: number;
}

export function reportMarkdown(t: RunTrace, meta: ReportMeta): string {
  const s = summarize(t);
  const out: string[] = [];
  out.push(`# Playtest: ${t.persona} in ${t.startRoom}`);
  out.push('');
  out.push(
    `${meta.when}. A ${t.mode} run, sim seed ${t.seed}, kit ${meta.abilities ? `[${meta.abilities.join(', ')}]` : "the room's"}. \`${meta.command}\``,
  );
  out.push('');
  const how =
    t.outcome === 'exit'
      ? `left by exit \`${t.exitId}\``
      : t.outcome === 'lost'
        ? 'gave up lost (no progress)'
        : t.outcome === 'done'
          ? 'done (nothing left it wanted to do here)'
          : t.outcome;
  out.push(
    `**${how} at ${clock(t.frames)}** (${sec(t.frames)}${t.hatchFrame !== null ? `; out of the cocoon at ${sec(t.hatchFrame)}, so ${sec(t.frames - t.hatchFrame)} of play` : ''}).`,
  );
  out.push('');
  out.push('| metric | value |');
  out.push('|---|---|');
  out.push(`| deaths (fades) | ${s.deaths} |`);
  out.push(`| fall catches | ${s.catches} |`);
  out.push(
    `| hits taken | ${s.hits}${
      s.hits
        ? ` (${Object.entries(t.hitsByCreature)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ')})`
        : ''
    } |`,
  );
  out.push(`| creatures killed | ${t.kills.length} |`);
  out.push(
    `| time lost (no progress for ${meta.lostAfter} s or more) | ${s.lost.toFixed(1)} s in ${t.lost.length} stretch(es) |`,
  );
  out.push(
    `| backtracking (moving through ground already walked, after leaving it) | ${s.backtrack.toFixed(1)} s |`,
  );
  out.push(
    `| lights seen / lit / snuffed | ${s.lightsSeen} / ${s.lightsLit} / ${s.lightsSnuffed} of ${s.lightsTotal} |`,
  );
  out.push(`| moths freed | ${s.moths} |`);
  const lured = Object.entries(t.lureCatches);
  if (lured.length || t.luredFrames)
    out.push(
      `| caught by lures | ${lured.reduce((a, [, n]) => a + n, 0)} times, ${sec(t.luredFrames)} held (${lured.map(([k, n]) => `${k} ${n}`).join(', ')}) |`,
    );
  out.push(
    `| abilities gained | ${t.abilities.length ? t.abilities.map((a) => `${a.id} at ${sec(a.f)} in ${a.room}`).join(', ') : 'none'} |`,
  );
  out.push(`| pickups | ${t.pickups} |`);
  out.push(
    `| input | ${t.input.presses} presses (${s.pressesPerSec.toFixed(2)}/s of control), ${t.input.changes} changes, a button held ${Math.round((100 * t.input.framesWithInput) / Math.max(1, t.frames))}% of frames |`,
  );
  out.push(
    `| speed | max ${t.speed.maxPxS} px/s, average ${t.speed.avgPxS} (moving: ${t.speed.avgMovingPxS}), ${t.speed.distance} px travelled |`,
  );
  out.push(`| jumps / dashes / glides | ${t.jumps} / ${t.dashes} / ${t.glides} |`);
  out.push('');

  out.push('## Rooms');
  out.push('');
  out.push('| room | region | entered | time in it | target | left by |');
  out.push('|---|---|---|---|---|---|');
  for (const v of t.rooms) {
    const tg = meta.targets[v.room];
    const dur = (v.leave - v.enter) / 60;
    const target = tg
      ? `${tg.lo === tg.hi ? `${tg.lo} s` : `${tg.lo}-${tg.hi} s`} (${dur < tg.lo ? 'short' : dur > tg.hi ? 'long' : 'on target'})`
      : '-';
    out.push(
      `| ${v.room} | ${v.region || '-'} | ${sec(v.enter)} | ${dur.toFixed(1)} s | ${target} | ${v.how || '-'} |`,
    );
  }
  const regions = Object.entries(t.framesByRegion);
  if (regions.length > 1) out.push('', `By area: ${regions.map(([k, v]) => `${k} ${sec(v)}`).join(', ')}.`);
  if (Object.keys(meta.targets).length === 0)
    out.push('', '(No targets: no table with room and target columns in docs/design/regions/.)');
  out.push('');

  out.push('## Worst moments');
  out.push('');
  const lost = [...t.lost].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 3);
  if (lost.length === 0) out.push(`- Never lost: something new at least every ${meta.lostAfter} s.`);
  for (const l of lost)
    out.push(
      `- Lost ${sec(l.to - l.from)} from ${clock(l.from)} in ${l.room}, wandering x ${Math.round(l.x0)}-${Math.round(l.x1)}, y ${Math.round(l.y0)}-${Math.round(l.y1)} (yellow box).`,
    );
  const falls = cluster([...t.deaths, ...t.catches]);
  if (falls.length === 0) out.push('- No deaths, no falls.');
  for (const c of falls.slice(0, 3))
    out.push(
      `- ${c.n} death(s) / fall(s) around (${Math.round(c.x)}, ${Math.round(c.y)}) in ${c.room}, at ${c.frames.map((f) => clock(f)).join(', ')}.`,
    );
  const hits = Object.entries(t.hitsByCreature).sort((a, b) => b[1] - a[1]);
  if (hits.length) out.push(`- Hits by creature: ${hits.map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  const enc = Object.entries(t.encounters ?? {});
  if (enc.length) {
    out.push('');
    out.push('| encounter | kind | from | time | hits | grabs | ended |');
    out.push('|---|---|---|---|---|---|---|');
    for (const [k, v] of enc.sort((a, b) => a[1].first - b[1].first))
      out.push(
        `| ${k} | ${v.kind} | ${clock(v.first)} | ${sec(v.last - v.first)} | ${v.hits} | ${v.grabs} | ${v.outcome} |`,
      );
    out.push('');
  }
  const unseen = Object.entries(t.lights).filter(([, l]) => l.seen === null);
  if (unseen.length) out.push(`- Lights never seen: ${unseen.map(([k]) => k).join(', ')}.`);
  out.push('');

  if (t.itinerary.length || t.notes.length) {
    out.push('## What the persona did');
    out.push('');
    if (t.itinerary.length) {
      const it = t.itinerary.slice(0, 40).map((i) => `${clock(i.f)} ${i.why}`);
      out.push(
        `Went for: ${it.join('; ')}${t.itinerary.length > 40 ? `; ... (${t.itinerary.length} in all)` : ''}.`,
      );
      out.push('');
    }
    for (const n of t.notes.slice(0, 30)) out.push(`- ${n}`);
    if (t.notes.length > 30) out.push(`- ... ${t.notes.length - 30} more in trace.json`);
    out.push('');
  }

  out.push('## Events');
  out.push('');
  out.push(
    Object.entries(t.events)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none',
  );
  out.push('');
  out.push('## Files');
  out.push('');
  for (const f of meta.files) out.push(`- \`${f}\``);
  out.push('');
  out.push(
    'Heatmap legend: grey = solids, olive line = one-ways, green = exits, dark red = catch zones; heat = time spent (blue little, yellow / white most); path cyan (early) to magenta (late), a white dot and its second every 5 s; white disc = spawn; red X = death; orange ring = fall catch; yellow dot = hit taken; yellow box = a lost stretch; lights (lanterns, lamps, lures): grey ring unseen, blue ring seen, gold disc lit, violet disc put out.',
  );
  return out.join('\n');
}
