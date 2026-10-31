/**
 * The Canopy, round 11 (review r10: staging; docs/design/levels/first-area.md v11):
 *  - The great cage over the old burrback: guarded while it lives (the blade glances off), cut out in three cuts from a
 *    jump off a shelf once it is down; its release holds her a beat, frees 120 moths and opens the roof's gate, the
 *    den's way out onto the way out's clifftop.
 *  - The hub's cage in the landing's frame, its cut taught (the first cut lets one moth out), a cage's catch ±64.
 *  - The warning's cage: not there in the fight; the firefly hangs it over the den's mouth once the warning is cleared
 *    (the second sighting), cut from the ledge on the lintel.
 *  - The gap's pass starts on her first fling off the chain and relights that lamp.
 *  - The old burrback's wake: 1.5 s, it rises, then turns to her, harmless.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraFor } from '../../src/render/camera/tuning';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const CG = ['wallJump', 'glide'];

function at(room: string, x: number, y: number, kit: string[] = CG, flags: string[] = []): GameState {
  const scene = getRoom(room);
  const save = newSave(kit as never);
  save.flags.push(...flags);
  const s = createState(1, t, scene, [], kit as never, save);
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  return s;
}
function run(s: GameState, input: number, n = 1, ev: SimEvent[] = []): SimEvent[] {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, input, t, withShortcuts(getRoom(s.room), s.save), e, W);
    ev.push(...e);
  }
  return ev;
}
const { jump: J, right: R, up: U, attack: A } = ActionBit;
const lureIx = (room: string, id: string) => (getRoom(room).lures ?? []).findIndex((l) => l.id === id);
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;

/** Up cuts standing still, until the lamp is out (or `n` swings). */
function standCuts(s: GameState, k: number, n = 6, ev: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < n && (s.lures.hp[k] ?? 0) > 0; i++) {
    run(s, U | A, 1, ev);
    run(s, U, 24, ev);
    run(s, 0, 6, ev);
  }
  return ev;
}

describe("the hub's cage (r11, review r10 #3 / #4)", () => {
  const scene = getRoom('cn-hub');
  const k = lureIx('cn-hub', 'trap-crossing');
  const l = scene.lures?.[k];

  for (const [vw, vh] of [
    [1920, 1080],
    [1920, 1200],
    [2560, 1080],
  ] as const)
    it(`is in the landing's frame at ${vw}x${vh}, with the kin under it`, () => {
      for (const x of [6100, 6300, 6800]) {
        const s = at('cn-hub', x, 900, []);
        s.enemies.length = 0;
        const ct = cameraFor(scene);
        const cam = createCamera(s, scene, ct, vw, vh);
        for (let f = 0; f < 120; f++) {
          run(s, 0);
          stepCamera(cam, s, scene, ct);
        }
        const v = lerpCamera(cam, cam, 1);
        const w = vw / cam.zoom;
        const h = vh / cam.zoom;
        const inView = (px: number, py: number, m: number) =>
          Math.abs(px - v.x) < w / 2 - m && Math.abs(py - v.y) < h / 2 - m;
        expect(inView(l?.x ?? 0, l?.y ?? 0, 60), `cage from ${x}`).toBe(true);
        const kin = (scene.marks as { tatter?: { x: number; y: number; until?: string } }).tatter;
        expect(kin?.until).toBe('cn-hub-left');
        expect(inView(kin?.x ?? 0, (kin?.y ?? 0) - 40, 20), `kin from ${x}`).toBe(true);
      }
    });

  it('a standing up cut from the floor under it frees it in two (r17); the first lets one moth out', () => {
    const s = at('cn-hub', l?.x ?? 0, 1600, []);
    s.enemies.length = 0;
    run(s, 0, 30);
    const ev = standCuts(s, k);
    const hits = ev.filter((e) => e.type === 'lureHit' && e.id === 'trap-crossing') as Of<'lureHit'>[];
    expect(hits.map((e) => e.escape ?? 0)).toEqual([1]);
    expect(hits.every((e) => e.trap)).toBe(true);
    const snuff = ev.find((e) => e.type === 'lureSnuff' && e.id === 'trap-crossing') as Of<'lureSnuff'>;
    expect(snuff?.trap).toBe(true);
    expect(s.save.moths).toBe(30);
    expect(s.save.flags).toContain('cn-hub-freed');
    // (The landing's frame and the kin wait until she walks off the landing, not the release.)
    expect(s.save.flags).not.toContain('cn-hub-left');
    // (The trap's snuff stops for a beat: a longer hitstop than a lamp's.)
    const last = ev.filter((e) => e.type === 'slashHit' && e.target.kind === 'lure').pop() as Of<'slashHit'>;
    expect(last.hitstop).toBe(t.lures.trapSnuffHitstop);
  });

  it("a cage's catch is ±64: a cut from 47 px off lands (v10: three cuts from there missed)", () => {
    for (const dx of [-47, 47]) {
      const s = at('cn-hub', (l?.x ?? 0) + dx, 1600, []);
      s.enemies.length = 0;
      run(s, 0, 30);
      const ev = standCuts(s, k, 1);
      expect(
        ev.some((e) => e.type === 'lureHit' && e.id === 'trap-crossing'),
        `${dx}`,
      ).toBe(true);
    }
  });
});

describe('a cage breaking holds the world (r11, render: creatures jumped forward after the hitstop)', () => {
  it("in the Grove's wave, every creature stands still while she does", () => {
    const k = lureIx('cn-grove', 'trap-grove');
    const l = getRoom('cn-grove').lures?.[k];
    const s = at('cn-grove', l?.x ?? 0, 1600, CG, ['cn-grove-wave']);
    run(s, 0, 90);
    let snuffAt = -1;
    let pos = '';
    const where = () => s.enemies.map((e) => `${e.x},${e.y}`).join(' ');
    for (let f = 0; f < 400 && snuffAt < 0; f++) {
      s.player.invuln = 60;
      const ev = run(s, f % 31 === 0 ? U | A : U);
      if (ev.some((e) => e.type === 'lureSnuff' && e.id === 'trap-grove')) {
        snuffAt = f;
        pos = where();
      }
    }
    expect(snuffAt).toBeGreaterThanOrEqual(0);
    expect(s.player.hitstop).toBeGreaterThan(0);
    for (let n = 0; s.player.hitstop > 0 && n < 30; n++) {
      run(s, 0);
      expect(where()).toBe(pos);
    }
  });
});

describe("the warning's cage, hung by the firefly (r11, review r10 #3 / #4)", () => {
  const scene = getRoom('cn-tunnel');
  const k = lureIx('cn-tunnel', 'trap-warn');
  const l = scene.lures?.[k];

  it('is not there in the fight', () => {
    const s = at('cn-tunnel', 7400, 1856);
    s.enemies.length = 0;
    run(s, 0, 10);
    expect(s.lures.hp[k]).toBe(0);
    expect(l?.after).toBe('cn-warn-hung');
  });

  it('the warning cleared, the firefly comes, hangs it over the mouth (input held 1.5 s), and flees into the den', () => {
    const s = at('cn-tunnel', 7300, 1856);
    s.enemies.length = 0;
    run(s, 0, 10);
    s.save.flags.push('cn-tunnel-clear');
    // (She stands: walked on, she would be through the mouth into the den before it is gone.)
    const ev = run(s, 0, 260);
    const start = ev.find((e) => e.type === 'fireflyStart') as Of<'fireflyStart'>;
    expect(start?.id).toBe('firefly-warn');
    const hold = ev.find((e) => e.type === 'storyHold') as Of<'storyHold'>;
    expect(hold?.frames).toBe(90);
    const hang = ev.find((e) => e.type === 'fireflyHang') as Of<'fireflyHang'>;
    expect(hang?.lure).toBe('trap-warn');
    expect(Math.abs((hang?.x ?? 0) - (l?.x ?? 0))).toBeLessThan(40);
    expect(s.save.flags).toContain('cn-warn-hung');
    expect(s.lures.hp[k]).toBe(t.lures.trapHp);
    const end = ev.find((e) => e.type === 'fireflyEnd') as Of<'fireflyEnd'>;
    const den = (scene.exits ?? []).find((e) => e.id === 'den');
    expect(end?.x ?? 0).toBeGreaterThan(7900);
    expect(end?.y ?? 0).toBeGreaterThanOrEqual(den?.from ?? 0);
  });

  it('a pass cut short still leaves the cage hung (a fade, a room left)', () => {
    const s = at('cn-tunnel', 7300, 1856, CG, ['cn-tunnel-clear', 'cn-firefly-warn']);
    s.enemies.length = 0;
    run(s, 0, 3);
    expect(s.save.flags).toContain('cn-warn-hung');
    expect(s.lures.hp[k]).toBe(t.lures.trapHp);
  });

  it('is cut out standing on the knuckle under it, in three', () => {
    const s = at('cn-tunnel', l?.x ?? 0, 1632, CG, ['cn-tunnel-clear', 'cn-firefly-warn', 'cn-warn-hung']);
    s.enemies.length = 0;
    run(s, 0, 20);
    expect(s.player.grounded).toBe(true);
    const ev = standCuts(s, k);
    expect(ev.some((e) => e.type === 'lureSnuff' && e.id === 'trap-warn')).toBe(true);
    expect(s.save.moths).toBe(40);
  });
});

// (r13: the gap's pass is the firefly's chase now: tests/unit/canopy-r13.test.ts.)
describe('the great cage over the old burrback (r11, review r10 #1)', () => {
  const scene = getRoom('cn-den');
  const k = lureIx('cn-den', 'trap-den');
  const l = scene.lures?.[k];

  /** From the west shelf's east end, a running jump east and an up cut near its top, until it is out. */
  function shelfCuts(s: GameState, ev: SimEvent[]): void {
    for (let tries = 0; tries < 8 && (s.lures.hp[k] ?? 0) > 0 && s.kit.story === 0; tries++) {
      placePlayer(s, 1440, 1088, t, withShortcuts(scene, s.save), []);
      s.player.dj = 0;
      run(s, 0, 12, ev);
      let f = 0;
      while (s.player.x + s.player.w / 2 < 1520 && f++ < 40) run(s, R, 1, ev);
      run(s, J | R, 20, ev);
      run(s, J | U | A, 1, ev);
      run(s, J | U, 16, ev);
      run(s, 0, 60, ev);
    }
  }

  it('is a 120-moth trap guarded by its keeper; the way out is the breach the collapse opens (r15)', () => {
    expect(l?.trap).toBe(true);
    expect(l?.moths).toBe(120);
    expect(l?.guard).toBe('cn-den-down');
    expect(l?.sets).toBe('cn-den-freed');
    // (r15, review r14 #1: the roof's gate is gone; the way out is low and east, torn open by the collapse.)
    expect((scene.gates ?? []).some((g) => g.id === 'den-roof')).toBe(false);
    const breach = (scene.gates ?? []).find((g) => g.id === 'den-breach');
    expect(breach?.flag).toBe('cn-den-collapse');
    const out = (scene.exits ?? []).find((e) => e.id === 'out');
    expect(out?.edge).toBe('e');
    expect(out?.to).toBe(1344);
  });

  it('while it lives the blade glances off the cage: no cut taken', () => {
    const s = at('cn-den', 1500, 1088);
    s.enemies.length = 0;
    const ev: SimEvent[] = [];
    shelfCuts(s, ev);
    expect(ev.some((e) => e.type === 'lureGuarded' && e.id === 'trap-den')).toBe(true);
    expect(ev.some((e) => e.type === 'lureHit' && e.id === 'trap-den')).toBe(false);
    expect(s.lures.hp[k]).toBe(t.lures.trapHp);
  });

  it('down, it lies fallen on the floor (r12, the Keeper): a cut frees it, a held beat, 120 moths', () => {
    const s = at('cn-den', 1500, 1344, CG, ['cn-den-down']);
    s.enemies.length = 0;
    const ev: SimEvent[] = [];
    const cx = (scene.boss?.lowered?.x ?? 0) - 40;
    placePlayer(s, cx, 1344, t, withShortcuts(scene, s.save), []);
    standCuts(s, k, 4, ev);
    run(s, 0, 100, ev);
    const snuff = ev.find((e) => e.type === 'lureSnuff' && e.id === 'trap-den') as Of<'lureSnuff'>;
    expect(snuff?.trap).toBe(true);
    expect(snuff?.moths).toBe(120);
    expect(s.save.moths).toBe(120);
    const hold = ev.find((e) => e.type === 'storyHold' && e.id === 'trap-den') as Of<'storyHold'>;
    expect(hold?.frames).toBe(90);
    expect(s.save.flags).toContain('cn-den-freed');
    // (Control back within 3 s of the last cut.)
    const end = ev.findIndex((e) => e.type === 'storyHoldEnd' && e.id === 'trap-den');
    expect(end).toBeGreaterThan(0);
  });

  it('the firefly is over the cage as she lands on the balcony, once, and goes into the east wall', () => {
    const s = at('cn-den', 300, 320);
    s.enemies.length = 0;
    const ev = run(s, 0, 400);
    expect(ev.filter((e) => e.type === 'fireflyStart' && e.id === 'firefly-den').length).toBe(1);
    const hang = ev.find((e) => e.type === 'fireflyHang') as Of<'fireflyHang'>;
    expect(Math.abs((hang?.x ?? 0) - (l?.x ?? 0))).toBeLessThan(40);
    expect(s.save.flags).toContain('cn-firefly-den');
  });
});

describe("the old burrback's wake (r11, review r10 #10)", () => {
  it('on her drop to the floor it rises for 1 s, turns to her for 0.5 s, harmless, then hunts', () => {
    const scene = getRoom('cn-den');
    const s = at('cn-den', 2600, 1344);
    const i = (scene.enemies ?? []).findIndex((e) => e.id === 'old-burr');
    const e0 = s.enemies[i];
    expect(e0?.mode).toBe('sleep');
    const facing0 = e0?.facing;
    let woke = -1;
    let turned = -1;
    let walked = -1;
    const hp = s.player.hp;
    for (let f = 0; f < 200 && walked < 0; f++) {
      const ev = run(s, 0);
      const e = s.enemies[i];
      if (woke < 0 && ev.some((q) => q.type === 'enemyWake')) woke = f;
      const turn = ev.find((q) => q.type === 'enemyTurn' && q.cause === 'wake');
      if (turn) turned = f;
      if (woke >= 0 && e?.mode !== 'wake' && e?.mode !== 'sleep') walked = f;
    }
    expect(woke).toBeGreaterThanOrEqual(0);
    expect(walked - woke).toBe(t.oldBurrback.wakeFrames);
    // (It slept facing west; she is east of it: it turns in the wake's last half second.)
    expect(facing0).toBe(-1);
    expect(walked - turned).toBe(t.oldBurrback.wakeTurnFrames);
    expect(s.player.hp).toBe(hp);
  });
});
