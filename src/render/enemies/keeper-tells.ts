/**
 * The Keeper's tells, read from the sim (the Canopy r14, review r13 #2 / #3 / #7): pure, no Pixi. The rig (burrback.ts)
 * poses from them and the den (lantern/keeper.ts) draws the claws, the floor's arc and the cracks from them, so the
 * pose and the marks agree.
 *
 *  - **The sweep** (P3): its tell (r14: `boss.sweep` 1, creature mode `sweep`, `boss.tellFrames` left of
 *    `keeper.sweepTell`; r13: `boss.moth === 4` in mode `eat`, `mothT` of the tell) and its strike (`boss.sweep` 2 /
 *    `boss.sweepHit` frames left of `keeper.sweepHitFrames`). Review r13 #2: the tell was the eat pose (head down over
 *    the moths), the pose that meant "cut it" in P1 and P2.
 *  - **The rage** (P1, review r13 #3): `boss.angry` 1 while it rears and slams, 2 after (every eye lit, fast rams).
 */

export interface SweepRead {
  /** 0..1 through the tell, -1 = not telling. */
  tell: number;
  /** 0..1 through the strike (the claws live), -1 = not striking. */
  strike: number;
}

interface BossLike {
  moth?: number;
  mothT?: number;
  sweepHit?: number;
  stage?: string;
  sweep?: number;
  tell?: string;
  tellFrames?: number;
  angry?: number;
  gated?: number;
}

/** P1's rage (`boss.angry`): 0 calm, 1 the rear and slam under way, 2 angry to the end of the fight. */
export function keeperAngry(boss: unknown): number {
  return (boss as BossLike | null)?.angry ?? 0;
}

/** Its health sits at the phase's floor with the phase not done (`boss.gated`, `keeperGate`). */
export function keeperGated(boss: unknown): boolean {
  return ((boss as BossLike | null)?.gated ?? 0) > 0;
}

interface EnemyLike {
  kind: string;
  mode: string;
  modeFrames: number;
  timer: number;
}

/** Where the Keeper `e` is in a sweep this frame (`tell` and `strike` from the sim's boss state and tuning). */
export function sweepRead(
  boss: unknown,
  e: EnemyLike,
  t: { sweepTell: number; sweepHitFrames: number },
  out: SweepRead = { tell: -1, strike: -1 },
): SweepRead {
  out.tell = -1;
  out.strike = -1;
  const b = boss as BossLike | null;
  if (!b || e.kind !== 'oldBurrback' || e.mode === 'dead') return out;
  if ((b.sweepHit ?? 0) > 0 || b.sweep === 2) {
    out.strike = Math.min(1, Math.max(0, 1 - (b.sweepHit ?? 0) / Math.max(1, t.sweepHitFrames)));
    return out;
  }
  if (b.sweep === 1 || (e.mode as string) === 'sweep') {
    const left = b.tell === 'sweep' && typeof b.tellFrames === 'number' ? b.tellFrames : -1;
    out.tell =
      left >= 0
        ? 1 - Math.min(1, left / Math.max(1, t.sweepTell))
        : Math.min(1, e.modeFrames / Math.max(1, e.modeFrames + e.timer));
    out.tell = Math.max(0, out.tell);
    return out;
  }
  if (b.moth === 4 && e.mode === 'eat')
    out.tell = Math.min(1, Math.max(0, (b.mothT ?? 0) / Math.max(1, t.sweepTell)));
  return out;
}
