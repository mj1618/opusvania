import { damageEnemy, hurtRect, isDowned, isInert } from '../ai/enemy';
import { enemyDef } from '../ai/schema';
import type { SimEvent } from '../events';
import { ActionBit, type InputFrame } from '../input';
import { spawnLevy } from '../levied';
import {
  aimOf,
  canCancel,
  isActiveFrame,
  lastActiveFrame,
  moveDef,
  moveHitbox,
  moveTotal,
} from '../player/moves';
import type { MoveParams } from '../player/params';
import { die } from '../player/player';
import { resolveSeize } from '../sources';
import type { Enemy, GameState } from '../state';
import type { Tuning } from '../tuning';
import type { Room } from '../world/rooms';
import { rectsOverlap } from './boxes';
import { requestHitstop } from './hitstop';

/**
 * Kid Tallow's combat side (combat-spec §1, §3.1): the action state machine over the move table
 * (step 4), her hitboxes (step 8.1), hurt / i-frames / Chin, and bookkeeping (step 11).
 * Movement is never blocked by a move (full run and air control, combat-spec §1.2); a jump or
 * dash only ends the move once the move's cancel graph allows it.
 */

const ACTION_BITS = ActionBit.attack | ActionBit.seize | ActionBit.levy;

/** Which action a press asks for (seize > levy > jab when pressed together). */
function pressedAction(state: GameState, input: InputFrame): string {
  const p = state.player;
  const pressed = input & ~state.prevInput & ACTION_BITS;
  if (pressed === 0) return '';
  if (pressed & ActionBit.seize && p.abilities.seize) return 'seize';
  if (pressed & ActionBit.levy && p.abilities.levy) return 'levy';
  // Down+Attack in the air is the movement pogo (existing path).
  if (pressed & ActionBit.attack && !(p.abilities.pogo && !p.grounded && input & ActionBit.down))
    return 'jab';
  return '';
}

/** During hitstop: latch action presses into the buffer (its counter does not run). */
export function latchAction(state: GameState, input: InputFrame, t: Tuning): void {
  const id = pressedAction(state, input);
  if (id) state.player.actBuf = { id, frames: t.combat.actionBufferFrames };
}

function total(state: GameState, t: Tuning): number {
  const m = state.player.move;
  if (!m) return 0;
  let n = moveTotal(m);
  if (m.id === 'jab' && state.player.profile === 'feather') n += t.weight.featherJabRecovery;
  return n;
}

/** Step 4: a new press (or the buffer) starts a move if legal; otherwise the move advances. */
export function kidAction(
  state: GameState,
  room: Room,
  input: InputFrame,
  t: Tuning,
  P: MoveParams,
  events: SimEvent[],
): void {
  const p = state.player;
  if (p.state === 'dead') {
    p.move = null;
    p.actBuf = null;
    return;
  }
  const id = pressedAction(state, input);
  if (id) p.actBuf = { id, frames: t.combat.actionBufferFrames };
  if (p.move) {
    p.move.frame++;
    if (p.move.frame > total(state, t)) p.move = null;
  }
  const buf = p.actBuf;
  if (buf) {
    if (p.hurtLock === 0 && canCancel(p.move, buf.id)) {
      const inX = (input & ActionBit.right ? 1 : 0) - (input & ActionBit.left ? 1 : 0);
      const facing: 1 | -1 = inX !== 0 ? (inX > 0 ? 1 : -1) : p.facing;
      const dir = buf.id === 'jab' ? 'fwd' : aimOf(input, p.grounded);
      p.move = { id: buf.id, frame: 1, dir, facing, outcome: 'none', hitList: [] };
      p.actBuf = null;
      events.push({ type: 'moveStart', move: buf.id, dir, x: p.x + p.w / 2, y: p.y + p.h });
    } else if (--buf.frames < 0) p.actBuf = null;
  }
  const m = p.move;
  const d = m ? moveDef(m.id) : null;
  if (m && d?.spawnFrame === m.frame && d.spawns) {
    if (spawnLevy(state, room, t, P, m.dir, m.facing, d.spawns, events)) m.outcome = 'hit';
    else {
      m.outcome = 'whiff';
      events.push({ type: 'levyDry', x: p.x + p.w / 2, y: p.y + p.h / 2 });
    }
  }
}

/** After movement: a jump or dash this step ends the move once its cancel graph allows it. */
export function kidMovementCancels(state: GameState, events: readonly SimEvent[], from: number): void {
  const p = state.player;
  if (!p.move) return;
  for (let i = from; i < events.length; i++) {
    const e = events[i] as SimEvent;
    const into = e.type === 'jump' ? 'jump' : e.type === 'dashStart' ? 'dash' : '';
    if (into && canCancel(p.move, into) && p.move.frame > 1) {
      p.move = null;
      return;
    }
  }
}

/** Slip i-frames (dash frames 1..slipIframesTo) or hurt i-frames. */
export function kidInvulnerable(state: GameState, t: Tuning, P: MoveParams): boolean {
  const p = state.player;
  if (p.iframes > 0) return true;
  // dashCd is set on the press frame and has run k times after dash frame k.
  return p.dashCd > 0 && P.dashCooldownFrames - p.dashCd <= t.kid.slipIframesTo;
}

/** Step 8.1: Kid's active hitbox vs enemies, sources and levied objects. */
export function kidHits(state: GameState, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const m = p.move;
  if (!m || p.state === 'dead' || !isActiveFrame(m)) return;
  const box = moveHitbox(p, m);
  if (box && m.outcome === 'none') {
    if (m.id === 'seize') {
      const r = resolveSeize(state, box, m.facing, t, events);
      if (r) m.outcome = r;
    } else if (m.id === 'jab') {
      jabHits(state, box, t, events);
    }
  }
  if (lastActiveFrame(m) && m.outcome === 'none') {
    m.outcome = 'whiff';
    const c = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: p.x, y: p.y };
    events.push({ type: 'whiff', move: m.id, ...c });
  }
}

function jabHits(
  state: GameState,
  box: { x: number; y: number; w: number; h: number },
  t: Tuning,
  events: SimEvent[],
): void {
  const p = state.player;
  const m = p.move;
  if (!m) return;
  const d = moveDef(m.id);
  for (const e of state.local.enemies) {
    if (isInert(e) || m.hitList.includes(e.id)) continue;
    const hr = hurtRect(e);
    if (!rectsOverlap(box, hr)) continue;
    m.hitList.push(e.id);
    const c = { x: hr.x + hr.w / 2, y: hr.y + hr.h / 2 };
    if (isDowned(e)) {
      // A foul: punches pass through a downed enemy.
      events.push({ type: 'whiff', move: m.id, reason: 'down', ...c });
      continue;
    }
    const dmg = d.dmg + (p.profile === 'heavy' ? t.weight.heavyPunchBonus : 0);
    requestHitstop('light', t);
    events.push({ type: 'hit', cls: 'light', move: m.id, target: e.id, dmg, ...c, dir: m.facing });
    damageEnemy(state, e, dmg, m.facing * t.combat.enemyKbLight, false, t, events);
    m.outcome = 'hit';
    if (p.profile !== 'heavy') {
      p.recoilVx = m.facing * (p.grounded ? t.combat.kidRecoilGroundLight : t.combat.kidRecoilAirLight);
      p.recoilT = t.combat.kidRecoilFrames;
    }
  }
}

/** Kid takes a hit (combat-spec §3.1): Chin, hitstop, i-frames, a control lock and knockback. */
export function hurtKid(
  state: GameState,
  dmg: number,
  src: Enemy,
  t: Tuning,
  P: MoveParams,
  events: SimEvent[],
): void {
  const p = state.player;
  p.chin = Math.max(0, p.chin - dmg);
  requestHitstop('hurt', t);
  events.push({ type: 'hurt', dmg, src: src.id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  p.iframes = t.kid.iframes;
  p.hurtLock = t.kid.hurtLock;
  p.move = null;
  const kb =
    p.profile === 'heavy'
      ? t.weight.kbHeavy
      : p.profile === 'middle'
        ? t.weight.kbMiddle
        : t.weight.kbFeather;
  const dir = p.x + p.w / 2 >= src.x + src.w / 2 ? 1 : -1;
  if (p.state === 'wallSlide') {
    events.push({ type: 'wallSlideEnd', x: p.x + p.w / 2, y: p.y + p.h, dir: p.wallDir });
    p.state = 'normal';
  } else if (p.state === 'dash') {
    events.push({ type: 'dashEnd', x: p.x + p.w / 2, y: p.y + p.h, dir: p.dashDir });
    p.state = 'normal';
    p.dashTimer = 0;
  }
  if (kb > 0) {
    p.vx = dir * t.kid.hurtVx * kb;
    p.vy = t.kid.hurtVy;
    p.grounded = false;
    p.coyote = 0;
    p.fromJump = false;
    p.cutDisabled = true;
  }
  if (p.chin <= 0) die(state, P, events);
}

/** Step 11: Kid's combat timers. */
export function kidBookkeeping(state: GameState): void {
  const p = state.player;
  if (p.iframes > 0) p.iframes--;
  if (p.hurtLock > 0) p.hurtLock--;
  if (p.recoilT > 0) p.recoilT--;
}

/** Enemy definition lookup re-exported for the debug API. */
export { enemyDef };
