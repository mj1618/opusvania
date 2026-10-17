/**
 * What a player can see on one frame: her own body, and the parts of the room inside the camera's
 * view. Personas decide from this only (plus what they remember of earlier frames: map.ts), never
 * from the whole scene. Pure: runs in Node (headless runs) and in the page (live runs).
 */
import type { RoomExit, Scene, SolidRect } from '../../src/sim/scene';
import type { GameState, PlayerState } from '../../src/sim/state';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The camera's view as a rect in room px (top-left based). */
export type ViewRect = Rect;

/** A camera view given by its centre (CameraView, `__game.cam()`) as a rect. */
export function viewRect(cam: { x: number; y: number; w: number; h: number }): ViewRect {
  return { x: cam.x - cam.w / 2, y: cam.y - cam.h / 2, w: cam.w, h: cam.h };
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x - pad < b.x + b.w && b.x < a.x + a.w + pad && a.y - pad < b.y + b.h && b.y < a.y + a.h + pad;
}

export function contains(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/**
 * An exit as a rect in room px: the open span of its edge, `depth` px deep on both sides of the line
 * where the crossing counts. A south exit with `at` is a drop: the opening is seen from above.
 */
export function exitRect(scene: Scene, e: RoomExit, depth = 320): Rect {
  const along = { a: e.from, b: e.to };
  switch (e.edge) {
    case 's': {
      // A hole in a floor reads as a way down from its lip, however deep the shaft under it.
      const at = e.at ?? scene.height;
      const d = Math.max(depth, 720);
      return { x: along.a, y: at - d, w: along.b - along.a, h: d * 2 };
    }
    case 'n': {
      const at = e.at ?? 0;
      return { x: along.a, y: at - depth, w: along.b - along.a, h: depth * 2 };
    }
    case 'e': {
      const at = e.at ?? scene.width;
      return { x: at - depth, y: along.a, w: depth * 2, h: along.b - along.a };
    }
    default: {
      const at = e.at ?? 0;
      return { x: at - depth, y: along.a, w: depth * 2, h: along.b - along.a };
    }
  }
}

/** The point an exit leads to (the middle of its span, on the crossing line). */
export function exitPoint(scene: Scene, e: RoomExit): { x: number; y: number } {
  const mid = (e.from + e.to) / 2;
  switch (e.edge) {
    case 's':
      return { x: mid, y: e.at ?? scene.height };
    case 'n':
      return { x: mid, y: e.at ?? 0 };
    case 'e':
      return { x: e.at ?? scene.width, y: mid };
    default:
      return { x: e.at ?? 0, y: mid };
  }
}

export interface SeenThing {
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface SeenEnemy extends SeenThing {
  w: number;
  h: number;
  mode: string;
  facing: number;
  vx: number;
}

export interface SeenLight extends SeenThing {
  /** A lantern or lamp she has kindled. */
  lit: boolean;
  /** A lure she has put out. */
  out: boolean;
}

export interface Obs {
  frame: number;
  room: string;
  /** Her body (her own state is always known to the player). */
  p: PlayerState;
  feetX: number;
  feetY: number;
  view: ViewRect;
  abilities: readonly string[];
  /** Shut in the cocoon (any button stirs it). */
  shut: boolean;
  /** No control this frame: an exit's or a caught fall's hold, faded, staggered. */
  held: boolean;
  /** Caught circling a lure's flame (memory/lures.md), or held by a web (memory/creatures.md): presses beat her free. */
  lured: boolean;
  /** Web strands standing inside the view (`[x0, y0, x1, y1]`): silk she can see (and cut). */
  strands: Array<[number, number, number, number]>;
  /** Indices into `scene.solids` / `scene.oneWays` inside the view. */
  solids: number[];
  /** Solids whose top edge is inside the view (ground she can see). */
  tops: number[];
  oneWays: number[];
  exits: Array<{ id: string; edge: string; rect: Rect; point: { x: number; y: number } }>;
  pickups: SeenThing[];
  enemies: SeenEnemy[];
  lights: SeenLight[];
}

/** Everything inside the view (with `pad` px of peripheral vision). */
export function observe(state: GameState, scene: Scene, view: ViewRect, pad = 32): Obs {
  const p = state.player;
  const solids: number[] = [];
  const tops: number[] = [];
  scene.solids.forEach((s: SolidRect, i) => {
    if (!overlaps(view, s, pad)) return;
    solids.push(i);
    if (s.y >= view.y - pad && s.y <= view.y + view.h + pad) tops.push(i);
  });
  const oneWays: number[] = [];
  scene.oneWays.forEach((o, i) => {
    if (overlaps(view, { x: o.x, y: o.y, w: o.w, h: 1 }, pad)) oneWays.push(i);
  });
  const exits: Obs['exits'] = [];
  for (const e of scene.exits ?? []) {
    const rect = exitRect(scene, e);
    if (overlaps(view, rect)) exits.push({ id: e.id, edge: e.edge, rect, point: exitPoint(scene, e) });
  }
  const pickups: SeenThing[] = [];
  (scene.pickups ?? []).forEach((q, i) => {
    if ((state.pickups.timers[i] ?? -1) === 0 && contains(view, q.x, q.y, pad))
      pickups.push({ id: q.id, kind: q.kind, x: q.x, y: q.y });
  });
  const enemies: SeenEnemy[] = [];
  for (const e of state.enemies ?? []) {
    // (A web is silk, not a body: `strands`.)
    if (e.gone || e.mode === 'dead' || e.kind === 'web') continue;
    if (!overlaps(view, e, pad)) continue;
    enemies.push({
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h,
      w: e.w,
      h: e.h,
      mode: e.mode,
      facing: e.facing,
      vx: e.vx,
    });
  }
  return {
    frame: state.frame,
    room: state.room,
    p,
    feetX: p.x + p.w / 2,
    feetY: p.y + p.h,
    view,
    abilities: state.save.abilities,
    shut: !!state.hatch && !state.hatch.done,
    held: !!state.exit || !!state.caught || p.faded > 0 || p.stagger > 0,
    // Read loosely: the lure fields are new in the sim (state v22).
    lured: ((p as unknown as { lure?: number }).lure ?? -1) >= 0 || (p.grab ?? -1) >= 0,
    strands: seenStrands(state, scene, view, pad),
    solids,
    tops,
    oneWays,
    exits,
    pickups,
    enemies,
    lights: seenLights(state, scene, view, pad),
  };
}

/** Lanterns, wayside lamps and any other list of lights a room carries (`lures`: the lamp verb). */
export function sceneLights(scene: Scene): Array<SeenThing & { list: string; index: number }> {
  const out: Array<SeenThing & { list: string; index: number }> = [];
  const rec = scene as unknown as Record<string, unknown>;
  for (const list of LIGHT_LISTS) {
    const arr = rec[list];
    if (!Array.isArray(arr)) continue;
    arr.forEach((q: unknown, index) => {
      const o = q as { id?: unknown; x?: unknown; y?: unknown };
      if (typeof o?.x === 'number' && typeof o?.y === 'number')
        out.push({ id: String(o.id ?? `${list}-${index}`), kind: list, x: o.x, y: o.y, list, index });
    });
  }
  return out;
}

/** Scene lists that hold lights (a list the sim does not have yet is just absent). */
export const LIGHT_LISTS = ['lanterns', 'lamps', 'lures'] as const;

function seenLights(state: GameState, scene: Scene, view: ViewRect, pad: number): SeenLight[] {
  const goal = state.goal as unknown as Record<string, unknown> | undefined;
  // Lures keep their own state (`state.lures.hp`, 0 = out for good); read loosely, it is new.
  const lureHp = (state as unknown as { lures?: { hp?: number[] } }).lures?.hp;
  return sceneLights(scene)
    .filter((l) => contains(view, l.x, l.y - 48, pad))
    .map((l) => {
      const arr = goal?.[l.list] as Array<Record<string, unknown>> | undefined;
      const rec = arr?.[l.index];
      const lit =
        !!rec && (rec.lit === true || rec.state === 'lit' || (typeof rec.lit === 'number' && rec.lit > 0));
      const out = l.list === 'lures' && (lureHp?.[l.index] ?? 1) <= 0;
      return { id: l.id, kind: l.kind, x: l.x, y: l.y, lit, out };
    });
}

/** The intact strands of every web that reach into the view. */
function seenStrands(state: GameState, scene: Scene, view: ViewRect, pad: number): Obs['strands'] {
  const out: Obs['strands'] = [];
  (scene.enemies ?? []).forEach((sp, i) => {
    const e = state.enemies[i];
    if (!sp.strands || !e || e.kind !== 'web' || e.dispersed) return;
    sp.strands.forEach((q, k) => {
      if (e.cut.charCodeAt(k) !== 48) return;
      const x0 = Math.min(q[0], q[2]);
      const y0 = Math.min(q[1], q[3]);
      if (
        overlaps(
          view,
          { x: x0, y: y0, w: Math.max(1, Math.abs(q[2] - q[0])), h: Math.max(1, Math.abs(q[3] - q[1])) },
          pad,
        )
      )
        out.push(q);
    });
  });
  return out;
}
