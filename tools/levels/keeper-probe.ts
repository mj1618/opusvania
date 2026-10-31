/**
 * The Keeper's fight, headless (the Canopy r12; src/sim/boss/keeper.ts): drops her on the den's balcony (the intro)
 * or its floor, plays a tape or a stand-still, and prints the boss's events and counts.
 *   npx tsx tools/levels/keeper-probe.ts [--from=balcony|floor] [--frames=N] [--phase=n]
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { jumpBoss } from '../../src/sim/boss/index';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const arg = (k: string, d: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const scene = getRoom('cn-den');
const save = newSave(['wallJump', 'glide'] as never);
const s = createState(1, t, scene, [], ['wallJump', 'glide'] as never, save);
const from = arg('from', 'floor');
if (from === 'balcony') placePlayer(s, 300, 320, t, withShortcuts(scene, s.save), []);
else placePlayer(s, 1000, 1344, t, withShortcuts(scene, s.save), []);
const N = Number(arg('frames', '1800'));
const ph = Number(arg('phase', '0'));
const SHOW = new Set([
  'bossLock',
  'bossPhase',
  'bossCue',
  'cageDrop',
  'mothSaved',
  'mothEaten',
  'keeperEat',
  'cageSwing',
  'keeperSight',
  'cageFall',
  'cageRelease',
  'enemyFeed',
  'bossDefeat',
  'denCollapse',
  'enemyWake',
  'enemyPhase',
  'hurt',
  'fade',
  'enemyWindup',
  'enemyRecover',
  'lureSnuff',
  'flagSet',
  'fireflyStart',
  'fireflyEnd',
]);
for (let f = 0; f < N; f++) {
  const ev: SimEvent[] = [];
  step(s, 0, t, withShortcuts(getRoom(s.room), s.save), ev, W);
  if (f === 5 && ph > 0) jumpBoss(s, scene, t, ph, ev);
  for (const e of ev) if (SHOW.has(e.type)) console.log(f, JSON.stringify(e));
}
const b = s.boss;
const e = s.enemies.find((q) => q.id === 'old-burr');
console.log(
  'boss',
  b?.stage,
  b?.phase,
  'left',
  b?.left,
  'saved',
  b?.saved,
  'eaten',
  b?.eaten,
  'moth',
  b?.moth,
);
console.log('keeper', e?.mode, e?.hp, e?.x, e?.blind, e?.feedX, 'her', s.player.x, s.player.y, s.player.hp);
