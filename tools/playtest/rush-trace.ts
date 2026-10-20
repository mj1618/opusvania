/** Traces a boss rush fight headless (debug): `npx tsx tools/playtest/rush-trace.ts br-gloam [frames] [every]`. */
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { RushBot } from './rush-bot';

const room = process.argv[2] ?? 'br-gloam';
const n = Number(process.argv[3] ?? 1800);
const every = Number(process.argv[4] ?? 30);
const r = getRoom(room);
const save = newSave(r.abilities ?? []);
save.patch = { room: r.id, id: 'p-gate' };
const g = new Game(cloneTuning(defaultTuning), r, 1, () => 0, null, {
  world: getWorld('demo-bossrush'),
  save,
});
g.mode = 'manual';
const patch = r.patches?.find((q) => q.id === 'p-gate');
if (patch) g.teleport(patch.x, patch.y);
const bot = new RushBot(Number(process.env.REACT ?? 18));
g.afterStep.add((ev) => {
  for (const e of ev)
    if (e.type.startsWith('boss') || e.type === 'hurt' || e.type === 'enemyHit' || e.type === 'enemyBlock')
      console.log(g.state.frame, e.type, JSON.stringify(e).slice(0, 140));
});
for (let f = 0; f < n; f++) {
  const m = bot.decide(g.state, g.scene);
  g.queueInput([m]);
  g.stepOnce();
  if (f % every === 0) {
    const s = g.state;
    const e = s.enemies.find((q) => q.id === r.boss?.creature);
    const p = s.player;
    console.log(
      f,
      `in=${m} p=${Math.round(p.x + p.w / 2)},${Math.round(p.y + p.h)} hp=${p.hp}`,
      `boss=${s.boss?.stage}/${s.boss?.phase} ${e?.mode}:${s.boss?.move} e=${e ? Math.round(e.x + e.w / 2) : 0},${e ? Math.round(e.y + e.h) : 0} hp=${e?.hp} tell=${s.boss?.tell}`,
    );
  }
}
