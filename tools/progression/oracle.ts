/**
 * In-room reachability oracle: "from this entry (or tile) of this room, with these abilities, can
 * the player reach this target?" Answers come from, in order:
 *   1. a static proof (gravity-free flood fill says no: world.ts#staticallyUnreachable);
 *   2. the cache, using ability MONOTONICITY: a yes for a subset of the abilities is a yes (its
 *      tape is the evidence), a proved no (exhausted search) for a superset is a no;
 *   3. committed tapes (tests/replays) from the same start with a subset of the abilities;
 *   4. the search bot (tools/bot/search.ts), in parallel worker threads.
 * Verdicts: yes (with a tape), no (proved: static or exhausted) or unknown (not found in budget).
 *
 * The cache (tests/progression/cache.json) is keyed by the room file's content hash, so editing a
 * room re-searches only that room. Each record carries the "engine" fingerprint (sim + bot code):
 * a yes from another engine is re-verified by replaying its tape (milliseconds); a no/unknown from
 * another engine is re-searched in a full run and trusted (flagged stale) in --check runs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type Job, replayReaches } from './job';
import type { SearchPool } from './pool';
import {
  type Ability,
  abil,
  abilKey,
  isSubset,
  layout,
  staticallyUnreachable,
  type WorldGraph,
} from './world';

const ROOT = resolve(import.meta.dirname, '../..');

export type Verdict = 'yes' | 'no' | 'unknown';

export interface Query {
  room: string;
  /** Spawn name the player enters at (also the start when `at` is absent). */
  from: string;
  /** Start on this tile instead (pickup, ledge); `label` names it in reports. */
  at?: { tx: number; ty: number; label: string };
  abilities: Ability[];
  target: string;
  budget?: number;
}

export interface Answer {
  verdict: Verdict;
  how: 'static' | 'cache' | 'subset' | 'superset' | 'tape' | 'bot';
  /** Evidence for yes: the tape (input DSL) and the abilities it was run with. */
  tape?: string;
  tapeAbilities?: Ability[];
  frames?: number;
  /** Committed tape file used as evidence. */
  evidence?: string;
  /** Budget of the search behind a no/unknown. */
  budget?: number;
  /** A no/unknown recorded by a different engine (trusted in check mode). */
  stale?: boolean;
  ms: number;
}

interface Rec {
  abilities: string;
  verdict: Verdict;
  tape?: string;
  frames?: number;
  budget: number;
  engine: string;
  ms: number;
}

interface CacheFile {
  version: 1;
  note: string;
  entries: Record<string, Rec[]>;
}

export interface OracleOptions {
  graph: WorldGraph;
  pool: SearchPool;
  /** Default search budget (child nodes). */
  budget: number;
  seed?: number;
  preset?: string;
  cachePath?: string;
  /** Trust no/unknown records from another engine instead of re-searching (check mode). */
  trustStale?: boolean;
  /** Read committed tapes as evidence (default true). */
  useTapes?: boolean;
  log?: (s: string) => void;
}

/** sha1 over the code that decides search results: the sim (minus room content), bot, adapter. */
export function engineFingerprint(): string {
  const h = createHash('sha1');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir).sort()) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|json)$/.test(n)) files.push(p);
    }
  };
  walk(join(ROOT, 'src/sim'));
  walk(join(ROOT, 'content/enemies'));
  files.push(
    join(ROOT, 'content/moves.json'),
    join(ROOT, 'src/debug/sim-adapter.ts'),
    join(ROOT, 'src/debug/headless.ts'),
    join(ROOT, 'src/input/script.ts'),
    join(ROOT, 'tools/bot/search.ts'),
    join(ROOT, 'tools/progression/job.ts'),
  );
  for (const f of files) {
    if (f.endsWith('world/content.ts')) continue; // the room list; rooms are keyed by their own hash
    h.update(relative(ROOT, f));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 10);
}

interface TapeEvidence {
  file: string;
  room: string;
  spawn: string;
  seed: number;
  abilities: Ability[];
  inputs: string;
}

/** Committed tapes usable as evidence: default preset, no tuning/assist overrides, no exact start. */
function loadTapes(graph: WorldGraph): TapeEvidence[] {
  const dir = join(ROOT, 'tests/replays');
  if (!existsSync(dir)) return [];
  const out: TapeEvidence[] = [];
  for (const n of readdirSync(dir).sort()) {
    if (!n.endsWith('.json')) continue;
    let t: Record<string, unknown>;
    try {
      t = JSON.parse(readFileSync(join(dir, n), 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (t.kind !== 'tape' || typeof t.room !== 'string' || typeof t.inputs !== 'string') continue;
    if (t.tuning || t.assists || t.start || (t.preset && t.preset !== 'opus' && t.preset !== 'default'))
      continue;
    const room = graph.rooms[t.room];
    if (!room) continue;
    const ab = t.abilities as Record<string, boolean> | undefined;
    const abilities = ab ? abil((Object.keys(ab) as Ability[]).filter((k) => ab[k])) : [...room.grant];
    out.push({
      file: `tests/replays/${n}`,
      room: t.room,
      spawn: typeof t.spawn === 'string' ? t.spawn : 'default',
      seed: typeof t.seed === 'number' ? t.seed : 1,
      abilities,
      inputs: t.inputs,
    });
  }
  return out;
}

export class Oracle {
  readonly engine: string;
  readonly stats = {
    queries: 0,
    static: 0,
    cache: 0,
    inferred: 0,
    tapes: 0,
    searches: 0,
    searchMs: 0,
    reverified: 0,
    stale: 0,
  };
  private cache: CacheFile = { version: 1, note: '', entries: {} };
  private dirty = false;
  private tapes: TapeEvidence[];
  private tapeMemo = new Map<string, number | undefined>();
  private readonly seed: number;
  private readonly opts: OracleOptions;

  constructor(opts: OracleOptions) {
    this.opts = opts;
    this.seed = opts.seed ?? 1;
    this.engine = engineFingerprint();
    this.tapes = opts.useTapes === false ? [] : loadTapes(opts.graph);
    if (opts.cachePath && existsSync(opts.cachePath)) {
      const c = JSON.parse(readFileSync(opts.cachePath, 'utf8')) as CacheFile;
      if (c.version === 1) this.cache = c;
    }
  }

  private baseKey(q: Query): string {
    const room = this.opts.graph.rooms[q.room];
    const from = q.at ? `@${q.at.tx},${q.at.ty}` : q.from;
    return `${q.room}#${room?.hash ?? '?'}|${from}|${q.target}|s${this.seed}|${this.opts.preset ?? 'opus'}`;
  }

  private job(q: Query): Job {
    return {
      room: q.room,
      spawn: q.from,
      ...(q.at ? { at: { tx: q.at.tx, ty: q.at.ty } } : {}),
      abilities: q.abilities,
      target: q.target,
      budget: q.budget ?? this.opts.budget,
      seed: this.seed,
      ...(this.opts.preset ? { preset: this.opts.preset } : {}),
    };
  }

  /** Answers without searching, or undefined when a search is needed. */
  private lookup(q: Query): Answer | undefined {
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    const l = layout(q.room);
    const start = q.at ?? l.spawns[q.from];
    if (start && staticallyUnreachable(l, start, q.abilities, q.target)) {
      this.stats.static++;
      return { verdict: 'no', how: 'static', ms: ms() };
    }
    const key = this.baseKey(q);
    const recs = this.cache.entries[key] ?? [];
    const want = abilKey(q.abilities);
    const budget = q.budget ?? this.opts.budget;
    // Yes from a subset (smallest set first: the most general evidence).
    const yes = recs
      .filter((r) => r.verdict === 'yes' && isSubset(this.parse(r.abilities), q.abilities))
      .sort((a, b) => this.parse(a.abilities).length - this.parse(b.abilities).length);
    for (const r of yes) {
      if (r.engine !== this.engine) {
        const at = replayReaches({ ...this.job(q), abilities: this.parse(r.abilities) }, r.tape ?? '');
        this.stats.reverified++;
        if (at === undefined) {
          this.cache.entries[key] = (this.cache.entries[key] ?? []).filter((x) => x !== r);
          this.dirty = true;
          continue;
        }
        r.engine = this.engine;
        r.frames = at;
        this.dirty = true;
      }
      if (r.abilities === want) this.stats.cache++;
      else this.stats.inferred++;
      return {
        verdict: 'yes',
        how: r.abilities === want ? 'cache' : 'subset',
        ...(r.tape !== undefined ? { tape: r.tape } : {}),
        tapeAbilities: this.parse(r.abilities),
        ...(r.frames !== undefined ? { frames: r.frames } : {}),
        ms: ms(),
      };
    }
    // Proved no from a superset; unknown only for the same set with at least this budget.
    for (const r of recs) {
      const fresh = r.engine === this.engine;
      if (!fresh && !this.opts.trustStale) continue;
      const set = this.parse(r.abilities);
      const hit =
        (r.verdict === 'no' && isSubset(q.abilities, set)) ||
        (r.verdict === 'unknown' && r.abilities === want && r.budget >= budget);
      if (!hit) continue;
      if (!fresh) this.stats.stale++;
      if (r.abilities === want) this.stats.cache++;
      else this.stats.inferred++;
      return {
        verdict: r.verdict,
        how: r.abilities === want ? 'cache' : 'superset',
        budget: r.budget,
        ...(fresh ? {} : { stale: true }),
        ms: ms(),
      };
    }
    // Committed tapes from the same start with a subset of the abilities.
    if (!q.at)
      for (const t of this.tapes) {
        if (t.room !== q.room || t.spawn !== q.from || t.seed !== this.seed) continue;
        if (!isSubset(t.abilities, q.abilities)) continue;
        const mk = `${t.file}|${q.target}`;
        if (!this.tapeMemo.has(mk))
          this.tapeMemo.set(mk, replayReaches({ ...this.job(q), abilities: t.abilities }, t.inputs));
        const at = this.tapeMemo.get(mk);
        if (at === undefined) continue;
        this.stats.tapes++;
        return {
          verdict: 'yes',
          how: 'tape',
          tape: t.inputs,
          tapeAbilities: t.abilities,
          frames: at,
          evidence: t.file,
          ms: ms(),
        };
      }
    return undefined;
  }

  private parse(k: string): Ability[] {
    return k === 'none' ? [] : (k.split('+') as Ability[]);
  }

  /** Answers a batch; searches run in parallel. Duplicate queries are asked once. */
  async ask(qs: Query[]): Promise<Answer[]> {
    this.stats.queries += qs.length;
    const out: (Answer | undefined)[] = qs.map((q) => this.lookup(q));
    const pending = new Map<string, number[]>();
    qs.forEach((q, i) => {
      if (out[i]) return;
      const k = `${this.baseKey(q)}|${abilKey(q.abilities)}|${q.budget ?? this.opts.budget}`;
      pending.set(k, [...(pending.get(k) ?? []), i]);
    });
    const groups = [...pending.values()];
    const jobs = groups.map((g) => this.job(qs[g[0] as number] as Query));
    if (jobs.length > 0) {
      const t0 = performance.now();
      this.opts.log?.(`  searching ${jobs.length} ${jobs.length === 1 ? 'query' : 'queries'}...`);
      const res = await this.opts.pool.run(jobs);
      this.stats.searches += jobs.length;
      this.stats.searchMs += Math.round(performance.now() - t0);
      groups.forEach((g, gi) => {
        const r = res[gi];
        const q = qs[g[0] as number] as Query;
        const j = jobs[gi] as Job;
        if (!r) return;
        const verdict: Verdict = r.found ? 'yes' : r.exhausted ? 'no' : 'unknown';
        const rec: Rec = {
          abilities: abilKey(q.abilities),
          verdict,
          ...(r.tape !== undefined && r.found ? { tape: r.tape } : {}),
          ...(r.frames !== undefined && r.found ? { frames: r.frames } : {}),
          budget: j.budget,
          engine: this.engine,
          ms: r.ms,
        };
        const key = this.baseKey(q);
        // A new search supersedes every older record for the same ability set.
        const list = (this.cache.entries[key] ?? []).filter((x) => x.abilities !== rec.abilities);
        list.push(rec);
        this.cache.entries[key] = list;
        this.dirty = true;
        const a: Answer = {
          verdict,
          how: 'bot',
          ...(rec.tape !== undefined ? { tape: rec.tape, tapeAbilities: q.abilities } : {}),
          ...(rec.frames !== undefined ? { frames: rec.frames } : {}),
          ...(verdict !== 'yes' ? { budget: j.budget } : {}),
          ms: r.ms,
        };
        for (const i of g) out[i] = a;
      });
    }
    return out as Answer[];
  }

  async one(q: Query): Promise<Answer> {
    return (await this.ask([q]))[0] as Answer;
  }

  /** Writes the cache (sorted keys, only rooms that still exist with the same hash). */
  save(): boolean {
    const path = this.opts.cachePath;
    if (!path || !this.dirty) return false;
    const live = new Set(Object.values(this.opts.graph.rooms).map((r) => `${r.id}#${r.hash}`));
    const entries: Record<string, Rec[]> = {};
    for (const k of Object.keys(this.cache.entries).sort()) {
      if (!live.has(k.split('|')[0] as string)) continue;
      const recs = (this.cache.entries[k] ?? [])
        .slice()
        .sort((a, b) => a.abilities.localeCompare(b.abilities));
      if (recs.length) entries[k] = recs;
    }
    const file: CacheFile = {
      version: 1,
      note: 'Progression-validator oracle cache (tools/progression/oracle.ts). Generated by `npm run progression`; safe to delete.',
      entries,
    };
    writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
    this.dirty = false;
    return true;
  }
}
