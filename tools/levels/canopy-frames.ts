/**
 * Solid in frame (canopy review r8 #2), headless: every wide stop of the Canopy's rooms, framed by the real follow
 * camera (src/render/camera, its zones included) at 16:9, 16:10 and 21:9, and the share of the frame that is deep solid
 * (inside the solids more than 96 px from their edge, `look:check`'s `shareDeep`, the same ring test). The bar: at most
 * 30% of a stop, a room's median at most 20%. No browser: for laying out walls; `npm run look:check` is the one that
 * reads the painted frames.
 *
 *   npx tsx tools/levels/canopy-frames.ts [cn-well cn-hub ...] [--sizes=1920x1080,1920x1200,2560x1080] [--all]
 * Prints a row a stop (the worst size first) and each room's median; exits 0 (a report).
 */
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { getRoom, ROOMS } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

export const FRAME_BAR = { deep: 96, max: 0.3, median: 0.2 };

const args = process.argv.slice(2);
const sizes = (args.find((a) => a.startsWith('--sizes='))?.slice(8) ?? '1920x1080,1920x1200,2560x1080')
  .split(',')
  .map((s) => s.split('x').map(Number) as [number, number]);
const named = args.filter((a) => !a.startsWith('--'));
const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');

/** The deep-solid share of a view rect (world px), sampled on a 160 x 90 grid. */
export function deepShare(
  scene: Scene,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  deep = FRAME_BAR.deep,
): number {
  const solids = scene.solids;
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x > scene.width || y > scene.height) return false;
    for (const s of solids) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
    return false;
  };
  const ring: [number, number][] = [];
  for (let a = 0; a < 16; a++) {
    const q = (a / 16) * Math.PI * 2;
    ring.push([Math.cos(q) * deep, Math.sin(q) * deep], [Math.cos(q) * deep * 0.5, Math.sin(q) * deep * 0.5]);
  }
  const nx = 160;
  const ny = Math.round((nx * vh) / vw);
  let n = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = vx + ((i + 0.5) / nx) * vw;
      const y = vy + ((j + 0.5) / ny) * vh;
      if (inside(x, y) && ring.every(([dx, dy]) => inside(x + dx, y + dy))) n++;
    }
  return n / (nx * ny);
}

/** Where the camera settles on a stop (feet at x, y): the view rect in world px. */
export function frameAt(id: string, x: number, y: number, vw: number, vh: number) {
  const scene = getRoom(id);
  const s = createState(
    1,
    t,
    scene,
    [],
    ['wallJump', 'glide'] as never,
    newSave(['wallJump', 'glide'] as never),
  );
  const sc = withShortcuts(scene, s.save);
  placePlayer(s, x, y, t, sc, []);
  for (let k = 0; k < 20; k++) step(s, 0, t, sc, [] as SimEvent[], W);
  const ct = cameraFor(scene);
  const cam = createCamera(s, scene, ct, vw, vh);
  for (let k = 0; k < 90; k++) {
    step(s, 0, t, sc, [] as SimEvent[], W);
    stepCamera(cam, s, scene, ct);
  }
  const v = lerpCamera(cam, cam, 1);
  return { scene, x: v.x - v.w / 2, y: v.y - v.h / 2, w: v.w, h: v.h, zoom: cam.zoom };
}

function main(): void {
  const ids = named.length
    ? named
    : Object.keys(ROOMS).filter((id) => id.startsWith('cn-') && (ROOMS[id]?.shots?.wide?.length ?? 0) > 0);
  const fails: string[] = [];
  for (const id of ids) {
    const room = getRoom(id);
    const shares: number[] = [];
    for (const stop of room.shots?.wide ?? []) {
      const row: string[] = [];
      let worst = 0;
      for (const [vw, vh] of sizes) {
        const f = frameAt(id, stop.x, stop.y, vw, vh);
        const share = deepShare(f.scene, f.x, f.y, f.w, f.h);
        worst = Math.max(worst, share);
        if (vw === 1920 && vh === 1080) shares.push(share);
        row.push(
          `${vw}x${vh} ${String(Math.round(100 * share)).padStart(2)}%${f.zoom !== 1 ? ` z${f.zoom.toFixed(2)}` : ''}`,
        );
      }
      const bad = worst > FRAME_BAR.max;
      if (bad) fails.push(`${id}/${stop.name}`);
      console.log(`${bad ? 'OVER' : 'ok  '} ${id.padEnd(14)} ${stop.name.padEnd(10)} ${row.join('  ')}`);
    }
    shares.sort((a, b) => a - b);
    const med = shares.length ? (shares[(shares.length - 1) >> 1] as number) : 0;
    console.log(
      `     ${id.padEnd(14)} median ${Math.round(100 * med)}% (16:9)${med > FRAME_BAR.median ? '  OVER the room bar' : ''}`,
    );
  }
  console.log(
    fails.length ? `${fails.length} stops over 30%: ${fails.join(', ')}` : 'every stop at most 30%',
  );
}

main();
