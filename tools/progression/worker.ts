/** Search worker (pool.ts): receives a Job, posts back its JobResult. */
import { parentPort } from 'node:worker_threads';
import { type Job, runJob } from './job';

parentPort?.on('message', (j: Job) => {
  parentPort?.postMessage(runJob(j));
});
