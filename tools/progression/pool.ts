/**
 * Worker-thread pool for bot searches. Each search is single-threaded and deterministic, so running
 * them in parallel changes only wall time, never results. Works under tsx (workers inherit its
 * loader through execArgv). One job, or size 1, runs inline (no worker start-up cost).
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { type Job, type JobResult, runJob } from './job';

export class SearchPool {
  private workers: Worker[] = [];
  readonly size: number;

  constructor(size = Math.max(1, Math.min(8, availableParallelism() - 1))) {
    this.size = size;
  }

  async run(jobs: Job[], onDone?: (i: number, r: JobResult) => void): Promise<JobResult[]> {
    const out: JobResult[] = new Array(jobs.length);
    if (jobs.length === 0) return out;
    if (this.size <= 1 || jobs.length === 1) {
      jobs.forEach((j, i) => {
        out[i] = runJob(j);
        onDone?.(i, out[i] as JobResult);
      });
      return out;
    }
    while (this.workers.length < Math.min(this.size, jobs.length))
      this.workers.push(new Worker(new URL('./worker.ts', import.meta.url)));
    let next = 0;
    const active = this.workers.slice(0, Math.min(this.size, jobs.length));
    await Promise.all(
      active.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const feed = () => {
              if (next >= jobs.length) {
                w.off('message', onMsg);
                w.off('error', reject);
                resolve();
                return;
              }
              const i = next++;
              current = i;
              w.postMessage(jobs[i]);
            };
            let current = -1;
            const onMsg = (r: JobResult) => {
              out[current] = r;
              onDone?.(current, r);
              feed();
            };
            w.on('message', onMsg);
            w.on('error', reject);
            feed();
          }),
      ),
    );
    return out;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
  }
}
