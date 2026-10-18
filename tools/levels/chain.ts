/**
 * `npx tsx tools/levels/chain.ts <room> <x> <y> <aim,aim,...> <frames,frames,...> [first-lamp-x first-lamp-y]`:
 * designs a fling chain by flying it. From her standing at (x, y) a jump carries her into reach of the first lamp
 * (given, or found straight above her); each fling's flight is played in the real sim and the next lamp is put where
 * she is `frames` frames after that launch (so every link is caught where a player in that flight would be). Prints
 * the lamps and where she lands after the last one. The level generators copy the lamps it prints.
 */
import { getRoom } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { Lure, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const AIM: Record<string, number> = {
  R: ActionBit.right,
  UR: ActionBit.up | ActionBit.right,
  U: ActionBit.up,
  UL: ActionBit.up | ActionBit.left,
  L: ActionBit.left,
  DR: ActionBit.down | ActionBit.right,
  DL: ActionBit.down | ActionBit.left,
};

export function designChain(
  base: Scene,
  x: number,
  y: number,
  aims: string[],
  frames: number[],
  first?: [number, number],
  glide = false,
): { lamps: Array<[number, number]>; land: [number, number]; path: Array<[number, number]> } {
  const t = cloneTuning(defaultTuning);
  const lamps: Array<[number, number]> = [first ?? [x, y - 80 - 220]];
  let land: [number, number] = [x, y];
  let path: Array<[number, number]> = [];
  // Fly the chain with the lamps placed so far; each pass places the next lamp (or, the last, finds the landing).
  for (;;) {
    const lures: Lure[] = lamps.map(([lx, ly], i) => ({ id: `c${i}`, kind: 'wick', x: lx, y: ly }));
    const scene: Scene = { ...base, lures, enemies: [], id: `${base.id}-chain` };
    const kit = ['glide', 'wallJump', 'doubleJump'] as const;
    const s = createState(1, t, scene, [], [...kit], newSave([...kit]));
    placePlayer(s, x, y, t, scene, []);
    const ev: SimEvent[] = [];
    let link = 0;
    let since = -1;
    let placed = false;
    path = [];
    for (let k = 0; k < 900; k++) {
      const p = s.player;
      if (link < lamps.length && p.fling < 0 && p.flingCd === 0 && flingTarget(s, scene, t) === link) {
        const aim = AIM[aims[link] ?? 'U'] ?? ActionBit.up;
        for (let i = 0; i < 4; i++) step(s, aim | ActionBit.lamp, t, scene, ev);
        step(s, aim, t, scene, ev);
        link++;
        since = 0;
        continue;
      }
      let m =
        link === 0
          ? k < 30
            ? ActionBit.jump
            : 0
          : (AIM[aims[link - 1] ?? 'U'] ?? 0) & (ActionBit.left | ActionBit.right);
      if (glide && link === aims.length && since > 22) m |= ActionBit.jump;
      step(s, m, t, scene, ev);
      if (since >= 0) since++;
      path.push([Math.round(p.x + p.w / 2), Math.round(p.y + p.h / 2)]);
      if (link === lamps.length && lamps.length < aims.length && since === (frames[link - 1] ?? 12)) {
        lamps.push([Math.round(p.x + p.w / 2), Math.round(p.y + p.h / 2)]);
        placed = true;
        break;
      }
      if (link > 0 && p.grounded && since > 4) {
        land = [Math.round(p.x + p.w / 2), Math.round(p.y + p.h)];
        break;
      }
    }
    if (!placed) break;
  }
  void cloneState;
  return { lamps, land, path };
}

if (process.argv[1]?.endsWith('chain.ts')) {
  const [room, xs, ys, aimsS, framesS, fx, fy] = process.argv.slice(2);
  const base = getRoom(room ?? 'lr-hall');
  const r = designChain(
    base,
    Number(xs),
    Number(ys),
    (aimsS ?? 'U').split(','),
    (framesS ?? '12').split(',').map(Number),
    fx ? [Number(fx), Number(fy)] : undefined,
    process.argv.includes('--glide'),
  );
  console.log('lamps:', JSON.stringify(r.lamps));
  console.log('lands:', r.land);
}
