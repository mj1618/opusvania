import { ACTIONS, type Action, ActionBit, type InputFrame, maskOf } from '../sim/input';

/**
 * Scripted input for the debug API, tests, replays and the clip tool. Two syntaxes, token by
 * token (they can be mixed):
 *
 *  - Spec DSL (movement-spec §2.8): `.10 R30 R+J12 D+A1`. Buttons: `.` nothing, L R U D, J jump,
 *    X dash, A attack (jab), S seize, V levy; the number is frames (default 1).
 *  - Long form: `right*30 right+jump*12 _*20` (`_` = nothing, count defaults to 1).
 *
 * Edges come from held transitions, so pressing the same button again needs a gap (`J1 .1 J1`).
 * Array form: [{ hold: ['right', 'jump'], frames: 12 }, ...] or raw masks [0, 2, 2, ...].
 */
export type InputSegment = { hold?: Action[]; frames?: number };
export type InputScript = string | Array<InputSegment | number>;

export const DSL_LETTERS: Record<string, Action> = {
  L: 'left',
  R: 'right',
  U: 'up',
  D: 'down',
  J: 'jump',
  X: 'dash',
  A: 'attack',
  S: 'seize',
  V: 'levy',
  H: 'special',
};
const LETTER_ORDER = ['L', 'R', 'U', 'D', 'J', 'X', 'A', 'S', 'V', 'H'] as const;
const DSL_TOKEN = /^(\.|[LRUDJXASVH](?:\+[LRUDJXASVH])*)(\d+)?$/;

function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

export function parseInputScript(script: InputScript): InputFrame[] {
  const out: InputFrame[] = [];
  if (typeof script === 'string') {
    for (const seg of script.trim().split(/\s+/).filter(Boolean)) {
      const dsl = DSL_TOKEN.exec(seg);
      if (dsl) {
        const [, buttons = '.', n] = dsl;
        const frames = n === undefined ? 1 : Number(n);
        let mask = 0;
        if (buttons !== '.') for (const l of buttons.split('+')) mask |= ActionBit[DSL_LETTERS[l] as Action];
        for (let i = 0; i < frames; i++) out.push(mask);
        continue;
      }
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

/** One mask as short text for traces, e.g. "R+J" or ".". */
export function maskLabel(mask: InputFrame): string {
  if (mask === 0) return '.';
  const letters = LETTER_ORDER.filter((l) => (mask & ActionBit[DSL_LETTERS[l] as Action]) !== 0);
  const rest = ACTIONS.filter((a) => (mask & ActionBit[a]) !== 0 && !Object.values(DSL_LETTERS).includes(a));
  if (rest.length === 0) return letters.join('+');
  return ACTIONS.filter((a) => (mask & ActionBit[a]) !== 0).join('+');
}

/** Formats masks as a run-length tape in the spec DSL (long form only for buttons it lacks). */
export function formatInputScript(masks: readonly InputFrame[]): string {
  const out: string[] = [];
  for (let i = 0; i < masks.length; ) {
    const m = masks[i] ?? 0;
    let n = 1;
    while (masks[i + n] === m) n++;
    const tok = maskLabel(m);
    const isDsl = tok === '.' || /^[LRUDJXASVH](\+[LRUDJXASVH])*$/.test(tok);
    out.push(isDsl ? `${tok}${n}` : `${tok}*${n}`);
    i += n;
  }
  return out.join(' ');
}
