/**
 * Draw an area.json (tools/reference/schema.ts) as an SVG at one fixed scale for every game, so our areas and the
 * reference games' first areas can be laid side by side:
 *   npx tsx tools/reference/area-svg.ts <area.json> [out.svg] [--scale 8] [--labels]
 * Solids dark, one-ways a line, hazards red, breakables dashed, doors amber, the critical path a blue line through
 * room centres, things and enemies as glyphs (enemy size by difficulty), the hero box and a 1920x1080 view for scale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { AreaFile } from './schema';

const COL = {
  bg: '#f4f1ea',
  room: '#e2ddd0',
  roomLine: '#b9b1a0',
  solid: '#2b2a28',
  oneway: '#6a5f4c',
  hazard: '#d0342c',
  water: '#4f8fc0',
  breakable: '#8a6d3b',
  door: '#e0a020',
  path: '#2f6fd6',
  major: '#7b3fd0',
  minor: '#d9b200',
  save: '#1f9e5a',
  enemy: '#d0342c',
  other: '#555',
};

export function areaSvg(a: AreaFile, scale = 8, labels = false): string {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of a.rooms) {
    xs.push(r.rect[0], r.rect[0] + r.rect[2]);
    ys.push(r.rect[1], r.rect[1] + r.rect[3]);
  }
  for (const t of a.terrain)
    for (const [x, y] of t.poly) {
      xs.push(x as number);
      ys.push(y as number);
    }
  const pad = 400;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const x1 = Math.max(...xs) + pad;
  const y1 = Math.max(...ys) + pad + 1400;
  const W = Math.ceil((x1 - x0) / scale);
  const H = Math.ceil((y1 - y0) / scale);
  const X = (x: number) => ((x - x0) / scale).toFixed(1);
  const Y = (y: number) => ((y - y0) / scale).toFixed(1);
  const pts = (p: number[][]) => p.map(([x, y]) => `${X(x as number)},${Y(y as number)}`).join(' ');
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">`,
  );
  out.push(`<rect width="${W}" height="${H}" fill="${COL.bg}"/>`);
  for (const r of a.rooms) {
    const [x, y, w, h] = r.rect;
    out.push(
      `<rect x="${X(x)}" y="${Y(y)}" width="${(w / scale).toFixed(1)}" height="${(h / scale).toFixed(1)}" fill="${COL.room}" stroke="${COL.roomLine}" stroke-width="1"/>`,
    );
    if (labels)
      out.push(
        `<text x="${X(x + 40)}" y="${Y(y + 200)}" font-size="10" fill="#8a826f">${esc(r.name ?? r.id)}</text>`,
      );
  }
  const order = ['water', 'solid', 'breakable', 'secretWall', 'door', 'hazard', 'oneway'];
  const terrain = [...a.terrain].sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind));
  for (const t of terrain) {
    const p = t.poly;
    if (t.kind === 'oneway' || p.length === 2) {
      const ys2 = p.map((q) => q[1] as number);
      const xs2 = p.map((q) => q[0] as number);
      out.push(
        `<line x1="${X(Math.min(...xs2))}" y1="${Y(Math.min(...ys2))}" x2="${X(Math.max(...xs2))}" y2="${Y(Math.min(...ys2))}" stroke="${t.kind === 'oneway' ? COL.oneway : COL.solid}" stroke-width="1.5"/>`,
      );
      continue;
    }
    const style: Record<string, string> = {
      solid: `fill="${COL.solid}"`,
      water: `fill="${COL.water}" fill-opacity="0.45"`,
      hazard: `fill="${COL.hazard}" fill-opacity="0.85"`,
      breakable: `fill="${COL.breakable}" fill-opacity="0.5" stroke="${COL.breakable}" stroke-dasharray="3,2"`,
      secretWall: `fill="${COL.breakable}" fill-opacity="0.35" stroke="${COL.hazard}" stroke-dasharray="3,2"`,
      door: `fill="${COL.door}" fill-opacity="0.7"`,
    };
    out.push(`<polygon points="${pts(p)}" ${style[t.kind] ?? `fill="${COL.solid}"`}/>`);
  }
  // Critical path through room centres.
  const byId = new Map(a.rooms.map((r) => [r.id, r]));
  const path = a.criticalPath
    .map((id) => byId.get(id))
    .filter((r) => r !== undefined)
    .map((r) => [r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2]);
  if (path.length > 1)
    out.push(
      `<polyline points="${pts(path)}" fill="none" stroke="${COL.path}" stroke-width="2.5" stroke-opacity="0.7" stroke-linejoin="round"/>`,
    );
  for (const t of a.things) {
    const [x, y] = t.at;
    const cx = X(x);
    const cy = Y(y);
    const hiddenRing = t.hidden
      ? `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="${COL.major}" stroke-dasharray="2,2"/>`
      : '';
    if (t.kind === 'pickup-major')
      out.push(
        `<rect x="${(+cx - 4).toFixed(1)}" y="${(+cy - 4).toFixed(1)}" width="8" height="8" transform="rotate(45 ${cx} ${cy})" fill="${COL.major}"/>${hiddenRing}`,
      );
    else if (t.kind === 'pickup-minor')
      out.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${COL.minor}"/>${hiddenRing}`);
    else if (t.kind === 'save')
      out.push(
        `<rect x="${(+cx - 5).toFixed(1)}" y="${(+cy - 9).toFixed(1)}" width="10" height="9" fill="${COL.save}"/>`,
      );
    else if (t.kind === 'boss' || t.kind === 'arena')
      out.push(`<text x="${cx}" y="${cy}" font-size="16" text-anchor="middle" fill="${COL.enemy}">☠</text>`);
    else if (t.kind === 'breakable')
      out.push(
        `<rect x="${(+cx - 2.5).toFixed(1)}" y="${(+cy - 2.5).toFixed(1)}" width="5" height="5" fill="none" stroke="${COL.breakable}"/>${hiddenRing}`,
      );
    else
      out.push(
        `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="${t.kind === 'npc' || t.kind === 'shop' ? COL.save : COL.other}" stroke-width="1.2"/>${hiddenRing}`,
      );
    if (labels && (t.kind === 'pickup-major' || t.kind === 'npc' || t.kind === 'boss'))
      out.push(
        `<text x="${(+cx + 6).toFixed(1)}" y="${cy}" font-size="8" fill="#333">${esc(t.value ?? t.kind)}</text>`,
      );
  }
  for (const e of a.enemies) {
    const [x, y] = e.at;
    const s = 2 + e.difficulty * 1.6;
    out.push(
      `<polygon points="${X(x)},${(+Y(y) - s).toFixed(1)} ${(+X(x) + s).toFixed(1)},${(+Y(y) + s * 0.7).toFixed(1)} ${(+X(x) - s).toFixed(1)},${(+Y(y) + s * 0.7).toFixed(1)}" fill="${COL.enemy}" fill-opacity="${0.35 + e.difficulty * 0.12}"/>`,
    );
    if (labels)
      out.push(
        `<text x="${(+X(x) + s + 1).toFixed(1)}" y="${Y(y)}" font-size="7" fill="#a33">${esc(e.kind)}</text>`,
      );
  }
  // Scale key: the hero box and one 1920x1080 view, bottom-left.
  const kx = x0 + pad;
  const ky = y1 - 1300;
  out.push(
    `<rect x="${X(kx)}" y="${Y(ky)}" width="${(1920 / scale).toFixed(1)}" height="${(1080 / scale).toFixed(1)}" fill="none" stroke="#333" stroke-dasharray="4,3"/>`,
  );
  const hb = a.hero.box;
  out.push(
    `<rect x="${X(kx + 940)}" y="${Y(ky + 1000)}" width="${((hb[0] ?? 40) / scale).toFixed(1)}" height="${((hb[1] ?? 80) / scale).toFixed(1)}" fill="#333"/>`,
  );
  out.push(
    `<text x="${X(kx)}" y="${Y(ky - 40)}" font-size="12" fill="#333">${esc(a.game)}: ${esc(a.area)} · one screen (1920×1080) and the hero · 1 px = ${scale} px</text>`,
  );
  out.push('</svg>');
  return out.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (process.argv[1]?.endsWith('area-svg.ts')) {
  const [inPath, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!inPath) throw new Error('usage: area-svg.ts <area.json> [out.svg] [--scale 8] [--labels]');
  const si = process.argv.indexOf('--scale');
  const scale = si > 0 ? Number(process.argv[si + 1]) : 8;
  const a = JSON.parse(readFileSync(inPath, 'utf8')) as AreaFile;
  const outPath = outArg && !/^\d+$/.test(outArg) ? outArg : inPath.replace(/area\.json$/, 'map.svg');
  writeFileSync(outPath, areaSvg(a, scale, process.argv.includes('--labels')));
  console.log(`wrote ${outPath}`);
}
