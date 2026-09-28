import { type InputScript, parseInputScript } from '../input/script';
import { ACTIONS, type Action, ActionBit, type InputFrame } from '../sim/input';

/**
 * Input tapes as text. Accepts both syntaxes, token by token, so they can be mixed:
 *
 *  - Spec DSL (movement-spec §2.8), what the bot writes: `.10 R30 R+J12 D+A1`
 *    buttons: `.` nothing, L R U D, J jump, X dash, A attack; the number is frames (default 1).
 *  - Phase 0 syntax (src/input/script.ts): `right*30 right+jump*12 _*20`.
 *
 * Edges come from held transitions, so pressing the same button twice needs a gap (`J1 .1 J1`).
 */
export const DSL_LETTERS: Record<string, Action> = {
  L: 'left',
  R: 'right',
  U: 'up',
  D: 'down',
  J: 'jump',
  X: 'dash',
  A: 'attack',
};

const LETTER_ORDER = ['L', 'R', 'U', 'D', 'J', 'X', 'A'] as const;
const DSL_TOKEN = /^(\.|[LRUDJXA](?:\+[LRUDJXA])*)(\d+)?$/;
const DSL_MASK = LETTER_ORDER.reduce((m, l) => m | ActionBit[DSL_LETTERS[l] as Action], 0);

export type Tape = InputScript;

/** Parses a tape (either syntax, or raw masks) into one input mask per frame. */
export function parseTape(tape: Tape): InputFrame[] {
  if (Array.isArray(tape)) return parseInputScript(tape);
  const out: InputFrame[] = [];
  for (const tok of tape.trim().split(/\s+/).filter(Boolean)) {
    const m = DSL_TOKEN.exec(tok);
    if (!m) {
      out.push(...parseInputScript(tok));
      continue;
    }
    const [, buttons = '.', n] = m;
    const frames = n === undefined ? 1 : Number(n);
    let mask = 0;
    if (buttons !== '.') for (const l of buttons.split('+')) mask |= ActionBit[DSL_LETTERS[l] as Action];
    for (let i = 0; i < frames; i++) out.push(mask);
  }
  return out;
}

function maskToken(mask: InputFrame): string {
  if (mask === 0) return '.';
  if ((mask & ~DSL_MASK) !== 0) {
    // Buttons the DSL can't express (special, map, pause): use the long form for this run.
    const names = ACTIONS.filter((a) => (mask & ActionBit[a]) !== 0);
    return names.join('+');
  }
  return LETTER_ORDER.filter((l) => (mask & ActionBit[DSL_LETTERS[l] as Action]) !== 0).join('+');
}

/** Formats masks as a compact tape (run-length encoded, spec DSL where possible). */
export function formatTape(masks: readonly InputFrame[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < masks.length) {
    const m = masks[i] ?? 0;
    let j = i + 1;
    while (j < masks.length && masks[j] === m) j++;
    const tok = maskToken(m);
    const n = j - i;
    out.push(/[a-z]/.test(tok) ? `${tok}*${n}` : `${tok}${n}`);
    i = j;
  }
  return out.join(' ');
}

/** One mask as short text for traces, e.g. "R+J" or "." */
export function maskLabel(mask: InputFrame): string {
  return maskToken(mask);
}
