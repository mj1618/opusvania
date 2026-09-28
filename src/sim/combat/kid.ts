import { isBoss } from '../ai/boss';
import { centreOf, countBeatFrames, damageEnemy, hurtRect, isDowned, isInert } from '../ai/enemy';
import { enemyDef } from '../ai/schema';
import type { HitClass, SimEvent } from '../events';
import { ActionBit, type InputFrame } from '../input';
import { spawnLevy, spillSound } from '../levied';
import {
  canCancel,
  isActiveFrame,
  lastActiveFrame,
  type MoveDef,
  moveDef,
  moveHitbox,
  moveTotal,
  pressedButton,
  resolveMove,
} from '../player/moves';
import type { MoveParams } from '../player/params';
import { bounce } from '../player/player';
import { chinMax, distrain } from '../run';
import { bagNewest, bagRemove, sendHome, soundById, sourceById } from '../sound';
import { resolveSeize } from '../sources';
import type { Enemy, GameState, MoveState } from '../state';
import type { Tuning } from '../tuning';
import type { Room } from '../world/rooms';
import { type Rect, rectsOverlap } from './boxes';
import { requestHitstop } from './hitstop';

/**
 * Kid Tallow's combat side (combat-spec §1, §3): the action state machine over the move table
 * (step 4), her hitboxes (step 8.1), hurt / i-frames / Chin / Ringing, the Slip's clean-slip
 * Counter, Swallow, and her own Count when Chin runs out (Beat the Count, or Counted Out).
 * Each move kind has one handler below; everything about a move is read from content/moves.json.
 * Movement is never blocked by a move (full run and air control) except where the data says so
 * (`runMult`, `root`); a jump or dash only ENDS the move once its cancel graph allows it.
 */

/** Action buttons Kid can buffer (the move is resolved from the button and aim on the start frame). */
const ACTION_BITS = ActionBit.attack | ActionBit.seize | ActionBit.levy | ActionBit.special;

function hasButton(state: GameState, button: string): boolean {
  const ab = state.player.abilities;
  if (button === 'seize') return ab.seize;
  if (button === 'levy') return ab.levy;
  if (button === 'special') return ab.seize;
  return true;
}

function pressedAction(state: GameState, input: InputFrame): string {
  const b = pressedButton(input & ~state.prevInput & ACTION_BITS);
  return b && hasButton(state, b) ? b : '';
}

/** During hitstop: latch action presses into the buffer (its counter does not run). */
export function latchAction(state: GameState, input: InputFrame, t: Tuning): void {
  const id = pressedAction(state, input);
  if (id) state.player.actBuf = { id, frames: t.combat.actionBufferFrames };
}

/** Total frames of the current move (the feather class recovers faster from jab and cross). */
function total(state: GameState, t: Tuning): number {
  const m = state.player.move;
  if (!m) return 0;
  let n = moveTotal(m);
  if (moveDef(m.id).featherRecovery && state.player.profile === 'feather') n += t.weight.featherJabRecovery;
  return n;
}

/** Swallow channel frames and heal for a colour (combat-spec §3.4). */
function swallowOf(colour: string, t: Tuning): { channel: number; heal: number } {
  const s = t.swallow;
  if (colour === 'violet') return { channel: s.channelViolet, heal: s.healViolet };
  if (colour === 'pink') return { channel: s.channelPink, heal: s.healPink };
  return { channel: s.channelBrown, heal: s.healBrown };
}

/** Per-kind start hooks (a move can decide its own length on the start frame). */
function startMove(state: GameState, m: MoveState, d: MoveDef, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  if (d.counterable && p.counter > 0) {
    m.counter = true;
    p.counter = 0;
  }
  if (d.kind !== 'swallow') return;
  const s = bagNewest(state.local);
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  // Only voices can be swallowed; pink and brown need the ground.
  if (s?.kind !== 'voice' || (s.colour !== 'violet' && !p.grounded)) {
    m.outcome = 'refused';
    m.len = t.swallow.refusalFrames;
    events.push({ type: 'swallowRefused', ...c });
    return;
  }
  m.soundId = s.id;
  m.len = swallowOf(s.colour, t).channel + d.recovery;
  events.push({ type: 'swallowStart', colour: s.colour, soundId: s.id, ...c });
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
  if (p.state === 'dead' || p.down) {
    p.move = null;
    p.actBuf = null;
    return;
  }
  const pressed = pressedAction(state, input);
  if (pressed) p.actBuf = { id: pressed, frames: t.combat.actionBufferFrames };
  if (p.move) {
    p.move.frame++;
    if (p.move.frame > total(state, t)) p.move = null;
  }
  const buf = p.actBuf;
  if (buf) {
    const r = resolveMove(buf.id, input, p.grounded, p.move);
    if (r && p.hurtLock === 0 && canCancel(p.move, r.id)) {
      const inX = (input & ActionBit.right ? 1 : 0) - (input & ActionBit.left ? 1 : 0);
      const facing: 1 | -1 = inX !== 0 ? (inX > 0 ? 1 : -1) : p.facing;
      const m: MoveState = {
        id: r.id,
        frame: 1,
        dir: r.dir,
        facing,
        outcome: 'none',
        hitList: [],
        len: 0,
        counter: false,
        soundId: 0,
      };
      p.move = m;
      p.actBuf = null;
      events.push({ type: 'moveStart', move: r.id, dir: r.dir, x: p.x + p.w / 2, y: p.y + p.h });
      startMove(state, m, moveDef(r.id), t, events);
    } else if (!(r?.chain && p.move) && --buf.frames < 0) p.actBuf = null;
  }
  const m = p.move;
  if (!m) return;
  const d = moveDef(m.id);
  if (d.kind === 'levy' && d.spawnFrame === m.frame && d.spawns) {
    if (spawnLevy(state, room, t, P, m.dir, m.facing, d.spawns, events)) m.outcome = 'hit';
    else {
      m.outcome = 'whiff';
      events.push({ type: 'levyDry', x: p.x + p.w / 2, y: p.y + p.h / 2 });
    }
  } else if (d.kind === 'swallow' && m.soundId && m.frame === m.len - d.recovery)
    swallowCommit(state, m, t, events);
}

/** The last channel frame: the voice is eaten, Chin heals, its owner goes Hoarse. */
function swallowCommit(state: GameState, m: MoveState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  const p = state.player;
  const s = soundById(L, m.soundId);
  if (s?.status !== 'bag') return;
  bagRemove(L, s.id);
  s.status = 'consumed';
  s.at = 0;
  const heal = swallowOf(s.colour, t).heal;
  p.chin = Math.min(p.chinMax, p.chin + heal);
  m.outcome = 'take';
  events.push({
    type: 'swallowCommit',
    colour: s.colour,
    soundId: s.id,
    heal,
    x: p.x + p.w / 2,
    y: p.y + p.h / 2,
  });
  const src = sourceById(L, s.owner);
  const e = src ? L.enemies.find((x) => x.id === src.ent) : undefined;
  if (e && !isInert(e)) {
    e.hoarse = true;
    events.push({ type: 'hoarse', enemy: e.id, ...centreOf(e) });
  }
}

/** Input the controller sees this step: the hurt lock (Slip allowed from standSlipFrom) and a rooting move. */
export function kidInputMask(state: GameState, input: InputFrame, t: Tuning): InputFrame {
  const p = state.player;
  let mask = input;
  if (p.hurtLock > 0) {
    mask &= ~(ActionBit.left | ActionBit.right | ActionBit.jump);
    if (t.kid.hurtLock - p.hurtLock < t.kid.standSlipFrom) mask &= ~ActionBit.dash;
  }
  const m = p.move;
  if (m && p.grounded) {
    const d = moveDef(m.id);
    if (d.root && m.outcome !== 'refused' && m.frame <= m.len - d.recovery)
      mask &= ~(ActionBit.left | ActionBit.right | ActionBit.jump);
  }
  return mask;
}

/** The ground run cap during a planting move (the Cross: runMult 0.5). */
export function kidRunMult(state: GameState): number {
  const m = state.player.move;
  if (!m || !state.player.grounded) return 1;
  return moveDef(m.id).runMult;
}

/** After movement: a jump or dash this step ends the move once its cancel graph allows it. A dash is a Slip. */
export function kidMovementCancels(state: GameState, events: SimEvent[], from: number): void {
  const p = state.player;
  const n = events.length;
  for (let i = from; i < n; i++) {
    const e = events[i] as SimEvent;
    if (e.type === 'dashStart' && p.abilities.seize) {
      p.slipClean = false;
      events.push({ type: 'slipStart', x: p.x + p.w / 2, y: p.y + p.h / 2 });
    }
    if (!p.move) continue;
    const into = e.type === 'jump' ? 'jump' : e.type === 'dashStart' ? 'dash' : '';
    if (into && canCancel(p.move, into) && p.move.frame > 1) p.move = null;
  }
}

/** Kid's invulnerability this step: hurt i-frames, and the Slip's (dash frames 1..slipIframesTo). */
export function kidInvulnerable(
  state: GameState,
  t: Tuning,
  P: MoveParams,
): { hurt: boolean; slip: boolean } {
  const p = state.player;
  // dashCd is set on the press frame and has run k times after dash frame k.
  const slip = p.dashCd > 0 && P.dashCooldownFrames - p.dashCd <= t.kid.slipIframesTo && p.state === 'dash';
  return { hurt: p.iframes > 0, slip };
}

/** A clean Slip: i-frames over a live hitbox open the Counter window and refund the cooldown. */
export function slipClean(state: GameState, enemy: number, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  if (p.slipClean) return;
  p.slipClean = true;
  p.counter = t.kid.counterFrames;
  p.dashCd = 0;
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  events.push({ type: 'slipClean', enemy, ...c });
  events.push({ type: 'counterOpen', ...c });
}

/** Ringing: a Seize take, a Catch, a Counter or a repossession wins the ringing pip back. */
export function ringRecover(state: GameState, events: SimEvent[]): void {
  const p = state.player;
  if (p.ring <= 0) return;
  p.ring = 0;
  p.chin = Math.min(p.chinMax, p.chin + 1);
  events.push({ type: 'ringRecover', x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

/** Step 8.1: Kid's active hitbox vs sources (Seize) or enemies (strikes). */
export function kidHits(state: GameState, t: Tuning, P: MoveParams, events: SimEvent[]): void {
  const p = state.player;
  const m = p.move;
  if (!m || p.state === 'dead' || p.down || !isActiveFrame(m)) return;
  const d = moveDef(m.id);
  const box = moveHitbox(p, m, t.kid.counterBoxScale);
  if (box && m.outcome === 'none') {
    if (d.kind === 'seize') {
      const before = events.length;
      const r = resolveSeize(state, box, m.facing, t, events);
      if (r) m.outcome = r;
      const won = events
        .slice(before)
        .some((e) => e.type === 'seizeTake' || e.type === 'catch' || e.type === 'repossess');
      if (won) ringRecover(state, events);
    } else if (d.kind === 'strike') strikeHits(state, box, m, d, t, P, events);
  }
  if (lastActiveFrame(m) && m.outcome === 'none') {
    m.outcome = 'whiff';
    const c = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: p.x, y: p.y };
    events.push({ type: 'whiff', move: m.id, ...c });
  }
}

const KB: Record<string, keyof Tuning['combat']> = {
  light: 'enemyKbLight',
  medium: 'enemyKbMedium',
  heavy: 'enemyKbHeavy',
  counter: 'enemyKbCounter',
};

/** A strike's hitbox vs enemy hurtboxes (one hit per target per instance; downed = a foul, whiff). */
function strikeHits(
  state: GameState,
  box: Rect,
  m: MoveState,
  d: MoveDef,
  t: Tuning,
  P: MoveParams,
  events: SimEvent[],
): void {
  for (const e of state.local.enemies) {
    if (isInert(e) || m.hitList.includes(e.id)) continue;
    const hr = hurtRect(e);
    if (!rectsOverlap(box, hr)) continue;
    m.hitList.push(e.id);
    const c = { x: hr.x + hr.w / 2, y: hr.y + hr.h / 2 };
    if (isDowned(e)) {
      // A foul: punches pass through a downed enemy (the Runner excepted: a punch downs it).
      events.push({ type: 'whiff', move: m.id, reason: 'down', target: e.id, ...c });
      continue;
    }
    strike(state, e, m, d, c, t, P, events);
  }
}

function strike(
  state: GameState,
  e: Enemy,
  m: MoveState,
  d: MoveDef,
  c: { x: number; y: number },
  t: Tuning,
  P: MoveParams,
  events: SimEvent[],
): void {
  const p = state.player;
  const heavy = p.profile === 'heavy';
  let dmg = d.dmg + (d.heavyBonus && heavy ? t.weight.heavyPunchBonus : 0);
  const cls: HitClass = m.counter ? 'counter' : d.cls;
  if (m.counter) dmg *= t.kid.counterDmgMult;
  requestHitstop(state, cls, t);
  events.push({ type: 'hit', cls, move: m.id, target: e.id, dmg, ...c, dir: m.facing });
  const kb = m.facing * (t.combat[KB[cls] ?? 'enemyKbLight'] as number);
  damageEnemy(state, e, dmg, kb, t, events, {
    knock: m.counter && !isBoss(e),
    cls,
    ...(d.launch ? { launchVy: t.combat.uppercutVy } : {}),
  });
  m.outcome = 'hit';
  if (m.counter) {
    events.push({ type: 'counterHit', enemy: e.id, move: m.id, ...c });
    ringRecover(state, events);
  }
  if (d.pogo) {
    // The Overhand is the pogo: a hit bounces Kid like a pogo off spikes (movement spec §2.7).
    bounce(p, P.pogoSpeed, P, { refill: true, cutDisabled: true });
    events.push({ type: 'pogo', x: p.x + p.w / 2, y: p.y + p.h, target: 'orb' });
  }
  // Recoil on Kid (none while heavy or on a counter).
  if (!heavy && !m.counter && enemyDef(e.type).class !== 'runner') {
    const r =
      cls === 'medium'
        ? t.kid.recoilMedium
        : p.grounded
          ? t.combat.kidRecoilGroundLight
          : t.combat.kidRecoilAirLight;
    if (cls === 'light' || cls === 'medium') {
      p.recoilVx = m.facing * r;
      p.recoilT = t.combat.kidRecoilFrames;
    }
  }
}

/**
 * Kid takes a hit (combat-spec §3.1): Chin, hitstop, i-frames, a control lock and knockback. The
 * lost pip rings (§3.2); a hit during a Swallow's channel spills the sound; Chin 0 = down.
 */
export function hurtKid(
  state: GameState,
  room: Room,
  dmg: number,
  fromX: number,
  src: number,
  attack: string,
  t: Tuning,
  events: SimEvent[],
): void {
  const p = state.player;
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  p.chin = Math.max(0, p.chin - dmg);
  requestHitstop(state, 'hurt', t);
  events.push({ type: 'hurt', dmg, src, attack, ...c });
  if (p.ring > 0) events.push({ type: 'ringLost', ...c });
  p.ring = p.chin > 0 ? t.kid.ringFrames : 0;
  if (p.ring > 0) events.push({ type: 'ringStart', ...c });
  const m = p.move;
  if (m && moveDef(m.id).kind === 'swallow' && m.soundId && m.outcome !== 'take') {
    const s = soundById(state.local, m.soundId);
    if (s && s.status === 'bag') spillSound(state, room, t, s, events);
  }
  p.iframes = t.kid.iframes;
  p.hurtLock = t.kid.hurtLock;
  p.move = null;
  p.counter = 0;
  const kb =
    p.profile === 'heavy'
      ? t.weight.kbHeavy
      : p.profile === 'middle'
        ? t.weight.kbMiddle
        : t.weight.kbFeather;
  const dir = p.x + p.w / 2 >= fromX ? 1 : -1;
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
  if (p.chin <= 0) kidDown(state, t, events);
}

/** Chin 0: Kid goes down and her Count starts (combat-spec §3.5). */
export function kidDown(state: GameState, _t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const voice = state.local.bag.some((id) => soundById(state.local, id)?.kind === 'voice');
  p.down = { t: 0, beat: 0, canRise: !state.run.beatUsed && voice, pressed: false };
  p.state = 'dead';
  p.deathTimer = 0;
  p.hazardRespawn = false;
  p.move = null;
  p.actBuf = null;
  p.vx = 0;
  p.ring = 0;
  p.counter = 0;
  events.push({ type: 'kidDown', x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

/**
 * Kid's Count, one step (while down). Beat the Count: ONE Jump press within +-riseWindow of a beat
 * from riseBeatMin to riseBeatMax, once per Corner, with a voice in the bag; she rises with
 * riseChin and pays the whole bag to the referee. Otherwise she's Counted Out after the last
 * beat: distrained, and she wakes at the Corner.
 */
export function kidCountStep(state: GameState, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const d = p.down;
  if (!d) return;
  const beat = countBeatFrames(state, t);
  d.t++;
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  const k = t.kid;
  if (d.t % beat === 0 && d.beat < t.combat.kidCountBeats) {
    d.beat++;
    events.push({ type: 'beatCountTick', beat: d.beat, canRise: d.canRise && !d.pressed, ...c });
  }
  const press = (input & ActionBit.jump) !== 0 && (state.prevInput & ActionBit.jump) === 0;
  let rise = false;
  if (press && !d.pressed) {
    d.pressed = true;
    const nearest = Math.round(d.t / beat);
    rise =
      d.canRise &&
      nearest >= k.riseBeatMin &&
      nearest <= k.riseBeatMax &&
      Math.abs(d.t - nearest * beat) <= k.riseWindow;
  }
  if (!rise && k.autoBeatCount && d.canRise && !d.pressed && d.t === k.riseBeatMin * beat) rise = true;
  if (rise) {
    const L = state.local;
    const paid = L.bag.length;
    for (const id of [...L.bag]) {
      const s = soundById(L, id);
      if (s) sendHome(state, s, events);
    }
    p.chin = Math.min(p.chinMax, k.riseChin);
    p.iframes = k.riseIframes;
    p.down = null;
    p.state = 'normal';
    state.run.beatUsed = true;
    events.push({ type: 'beatCountRise', paid, ...c });
    return;
  }
  if (d.t > t.combat.kidCountBeats * beat) {
    events.push({ type: 'countedOut', ...c });
    distrain(state, t, events, c, p.y + p.h);
    p.chinMax = chinMax(state, t);
    p.chin = p.chinMax;
    const corner = state.run.corner;
    state.transition = { to: corner.roomId, spawn: corner.spawn, timer: k.countedOutFrames };
    events.push({ type: 'roomExit', roomId: state.roomId, to: corner.roomId, x: c.x, y: c.y });
  }
}

/** White static leaks the bag's oldest sound every combat.staticLeakFrames while Kid stands in it. */
export function staticLeak(state: GameState, t: Tuning, events: SimEvent[]): void {
  const L = state.local;
  const p = state.player;
  const ts = t.world.tileSize;
  let inStatic = false;
  for (const src of L.sources) {
    if (src.kind !== 'object' || src.ghost) continue;
    const s = soundById(L, src.soundIds[0] ?? -1);
    if (s?.colour !== 'white') continue;
    if (
      p.x < src.x + src.w + ts / 2 &&
      src.x - ts / 2 < p.x + p.w &&
      p.y < src.y + src.h + ts / 2 &&
      src.y - ts / 2 < p.y + p.h
    )
      inStatic = true;
  }
  if (!inStatic || L.bag.length === 0) {
    L.staticT = 0;
    return;
  }
  if (++L.staticT < t.combat.staticLeakFrames) return;
  L.staticT = 0;
  const old = soundById(L, L.bag[0] as number);
  if (!old) return;
  events.push({ type: 'bagLeak', soundId: old.id, colour: old.colour, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  sendHome(state, old, events);
}

/** Step 11: Kid's combat timers (Ringing expiry loses the pip for good). */
export function kidBookkeeping(state: GameState, events: SimEvent[]): void {
  const p = state.player;
  if (p.iframes > 0) p.iframes--;
  if (p.hurtLock > 0) p.hurtLock--;
  if (p.recoilT > 0) p.recoilT--;
  if (p.counter > 0) p.counter--;
  if (p.ring > 0 && --p.ring === 0) events.push({ type: 'ringLost', x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

/** Enemy definition lookup re-exported for the debug API. */
export { enemyDef };
