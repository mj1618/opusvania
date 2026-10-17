/**
 * The pinned clean build every page-side playtest runs on (memory/playtest-harness.md): one detached git
 * worktree per commit (`.scratch/playtest-snap-<sha>`, node_modules linked) with its own Vite, shared by every
 * user on that commit. Before anything is served the build's rooms and world are loaded (`firsttimer.ts
 * validate`): a broken commit is reported, not crashed into. Snapshots of older commits nobody uses are stopped
 * and removed; a user marks its use with a hold (`.scratch/playtest-holds/<pid>.json`, gone with its process).
 * Imports nothing of the game.
 */
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { loadError } from './report';

export interface Snap {
  sha: string;
  dir: string;
  port: number;
  pid: number;
}

export const git = (cwd: string, ...a: string[]): string =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Commits held by live processes (their snapshot must not be removed). */
function holds(scratch: string): Set<string> {
  const dir = join(scratch, 'playtest-holds');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const h = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { pid: number; sha: string };
    if (alive(h.pid)) out.add(h.sha);
    else rmSync(join(dir, f), { force: true });
  }
  return out;
}

/** Marks `sha` as used by `pid` (a session server, a render) until that process is gone. */
export function hold(root: string, sha: string, pid = process.pid): void {
  const repo = git(root, 'rev-parse', '--show-toplevel');
  const dir = join(repo, '.scratch', 'playtest-holds');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${pid}.json`), JSON.stringify({ pid, sha }));
}

/**
 * HEAD's snapshot, served (made, validated, started when needed). `inUse`: commits other tools still play
 * (their snapshots stay). `port`: the first port tried.
 */
export async function pinnedBuild(root: string, port = 5193, inUse: Iterable<string> = []): Promise<Snap> {
  const repo = git(root, 'rev-parse', '--show-toplevel');
  const head = git(repo, 'rev-parse', 'HEAD');
  const sha = head.slice(0, 7);
  const scratch = join(repo, '.scratch');
  mkdirSync(scratch, { recursive: true });
  const regFile = join(scratch, 'playtest-snaps.json');
  const reg: Record<string, Snap> = existsSync(regFile) ? JSON.parse(readFileSync(regFile, 'utf8')) : {};
  const used = new Set([...inUse, ...holds(scratch)]);
  for (const [k, v] of Object.entries(reg)) {
    if (k === sha || used.has(k)) continue;
    if (alive(v.pid))
      try {
        process.kill(v.pid);
      } catch {
        // gone
      }
    try {
      git(repo, 'worktree', 'remove', '--force', v.dir);
    } catch {
      // already gone
    }
    delete reg[k];
  }
  const dir = join(scratch, `playtest-snap-${sha}`);
  if (!existsSync(join(dir, '.git'))) {
    git(repo, 'worktree', 'prune');
    git(repo, 'worktree', 'add', '--detach', '--force', dir, head);
  }
  if (!existsSync(join(dir, 'node_modules')))
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'));
  try {
    execFileSync('npx', ['tsx', 'tools/playtest/firsttimer.ts', 'validate'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const text = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim() || (err.message ?? '');
    const subject = git(repo, 'log', '-1', '--format=%s', head);
    throw new Error(
      `The pinned build ${sha} ("${subject}") does not load, so nothing was started.\n` +
        `${loadError(text, git(repo, 'show', '--name-only', '--format=', head))}\n` +
        'Fix it in a commit, then start again; or use the working tree (--tree).',
    );
  }
  let snap = reg[sha];
  if (!snap || !alive(snap.pid) || !(await up(`http://localhost:${snap.port}`))) {
    let p = port;
    const taken = new Set(Object.values(reg).map((v) => v.port));
    while (taken.has(p) || (await up(`http://localhost:${p}`))) p++;
    const vite = spawn('npx', ['vite', '--port', String(p), '--strictPort'], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
    });
    vite.unref();
    snap = { sha, dir, port: p, pid: vite.pid ?? 0 };
    reg[sha] = snap;
    const url = `http://localhost:${p}`;
    for (let i = 0; i < 300 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await up(url))) throw new Error(`The pinned build's Vite did not come up on ${url}`);
  }
  writeFileSync(regFile, JSON.stringify(reg, null, 1));
  console.log(`the pinned build ${sha} (${relative(root, dir)}, http://localhost:${snap.port})`);
  return snap;
}
