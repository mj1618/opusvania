/**
 * The nests (Canopy r22): each persona started inside a nest room, short of the nest, with the kit a player has
 * there; does it clear the nest and pass the gate, and at what cost? `npx tsx tools/playtest/nest-probe.ts`
 */
import { getRoom } from '../../src/scene/index';
import { runHeadless } from './headless';

const NESTS = [
  {
    room: 'cn-hub',
    at: { x: 2400, y: 1600 },
    goal: 'cn-trunk',
    kit: [] as string[],
    flag: 'cn-nest-hub',
    exit: 'trunk',
  },
  {
    room: 'cn-trunk',
    at: { x: 600, y: 1664 },
    goal: 'cn-well',
    kit: [],
    flag: 'cn-nest-trunk',
    exit: 'well',
  },
  {
    room: 'cn-fork',
    at: { x: 800, y: 1344 },
    goal: 'cn-grove',
    kit: ['wallJump'],
    flag: 'cn-nest-fork',
    exit: 'grove',
  },
];
const personas = (process.argv[2] ?? 'speedrunner,naive,cautious,explorer').split(',');
const runs = Number(process.argv[3] ?? 3);
console.log('| nest | persona | run | cleared at | gate passed | hits | fades | nest kills |');
console.log('|---|---|---|---|---|---|---|---|');
for (const n of NESTS)
  for (const p of personas)
    for (let k = 1; k <= runs; k++) {
      let cleared = -1;
      let exited = '';
      let hits = 0;
      let fades = 0;
      let kills = 0;
      let left = '';
      let end = '';
      runHeadless({
        room: n.room,
        persona: p,
        personaSeed: k,
        abilities: n.kit,
        seconds: 120,
        until: 'exit',
        at: n.at,
        goal: n.goal,
        onStep: (s, _m, _p, ev) => {
          const sp = getRoom(s.room).enemies ?? [];
          left = sp
            .map((q, i) => ({ q, e: s.enemies[i] }))
            .filter(({ q, e }) => q.sets === n.flag && e && e.mode !== 'dead' && !(e.gone && e.hp <= 0))
            .map(
              ({ q, e }) =>
                `${q.id}:${e?.mode}${e?.gone ? '/gone' : ''}@${Math.round(e?.x ?? 0)},${Math.round(e?.y ?? 0)}`,
            )
            .join(' ');
          end = `${Math.round(s.player.x)},${Math.round(s.player.y)} f${s.frame}`;
          if (!s.save.flags.includes('cn-hub-left')) s.save.flags.push('cn-hub-left');
          for (const e of ev) {
            if (e.type === 'flagSet' && (e as { flag: string }).flag === n.flag) cleared = s.frame;
            if (e.type === 'hurt') hits++;
            if (e.type === 'fade') fades++;
            if (e.type === 'enemyDie') kills++;
            if (e.type === 'roomExit') exited = (e as { id: string }).id;
          }
        },
      });
      console.log(
        `| ${n.room} | ${p} | ${k} | ${cleared < 0 ? 'no' : `${(cleared / 60).toFixed(1)} s`} | ${exited || 'no'} | ${hits} | ${fades} | ${kills} | ${left} | ${end} |`,
      );
    }
