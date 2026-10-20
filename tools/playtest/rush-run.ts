/**
 * Runs the boss rush bot headless (memory/bossrush.md): `npx tsx tools/playtest/rush-run.ts [br-mantis|br-gloam]
 * [--react 18] [--no-moonstep]`. Prints won, time, hurts, fades.
 */
import { runRush } from './rush-bot';

const args = process.argv.slice(2);
const rooms = args.filter((a) => a.startsWith('br-')) as Array<'br-mantis' | 'br-gloam'>;
const ri = args.indexOf('--react');
const react = ri >= 0 ? Number(args[ri + 1]) : 18;
for (const room of rooms.length ? rooms : (['br-gloam', 'br-mantis'] as const)) {
  const r = runRush(room, { react, moonstep: !args.includes('--no-moonstep') && room === 'br-mantis' });
  console.log(room, JSON.stringify({ ...r, seconds: Math.round(r.frames / 6) / 10 }));
}
