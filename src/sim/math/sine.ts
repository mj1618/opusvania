/**
 * Integer sine table (combat-spec §4.1: no Math.sin in the sim; engines may differ in the last
 * bit). 64 entries of round(sin(2*pi*i/64) * 1024), generated once and pasted as literals.
 */
export const SINE_64: readonly number[] = [
  0, 100, 200, 297, 392, 483, 569, 650, 724, 792, 851, 903, 946, 980, 1004, 1019, 1024, 1019, 1004, 980, 946,
  903, 851, 792, 724, 650, 569, 483, 392, 297, 200, 100, 0, -100, -200, -297, -392, -483, -569, -650, -724,
  -792, -851, -903, -946, -980, -1004, -1019, -1024, -1019, -1004, -980, -946, -903, -851, -792, -724, -650,
  -569, -483, -392, -297, -200, -100,
];

/** sin(2*pi*phase/period) * amp, from the table (phase in frames, nearest entry). */
export function sineAt(phase: number, period: number, amp: number): number {
  const i = Math.floor(((((phase % period) + period) % period) * 64) / period) & 63;
  return ((SINE_64[i] as number) * amp) / 1024;
}
