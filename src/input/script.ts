import { ACTIONS, type Action, type InputFrame, maskOf } from '../sim/input';

/**
 * Scripted input for the debug API, tests and the clip tool.
 *
 * String form: space-separated segments `actions*frames`, actions joined with `+`, `_` = nothing.
 *   "right*30 right+jump*12 _*20"   hold right 30f, right+jump 12f, nothing 20f
 *   "jump"                          (frames default to 1)
 * Array form: [{ hold: ['right', 'jump'], frames: 12 }, ...] or raw masks [0, 2, 2, ...].
 */
export type InputSegment = { hold?: Action[]; frames?: number };
export type InputScript = string | Array<InputSegment | number>;

function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

export function parseInputScript(script: InputScript): InputFrame[] {
  const out: InputFrame[] = [];
  if (typeof script === 'string') {
    for (const seg of script.trim().split(/\s+/).filter(Boolean)) {
      const [acts = '', countStr] = seg.split('*');
      const frames = countStr === undefined ? 1 : Number(countStr);
      if (!Number.isInteger(frames) || frames < 0) throw new Error(`Bad frame count in "${seg}"`);
      const names = acts === '_' || acts === '' ? [] : acts.split('+');
      for (const n of names) if (!isAction(n)) throw new Error(`Unknown action "${n}" in "${seg}"`);
      const mask = maskOf(names as Action[]);
      for (let i = 0; i < frames; i++) out.push(mask);
    }
    return out;
  }
  for (const seg of script) {
    if (typeof seg === 'number') {
      out.push(seg);
      continue;
    }
    for (const n of seg.hold ?? []) if (!isAction(n)) throw new Error(`Unknown action "${n}"`);
    const mask = maskOf(seg.hold ?? []);
    for (let i = 0; i < (seg.frames ?? 1); i++) out.push(mask);
  }
  return out;
}
