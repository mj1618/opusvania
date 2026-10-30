/**
 * Lanternroot's events (src/sim/light.ts, memory/glow.md, docs/design/levels/proto-1.md); part of `SimEvent`.
 * `x`, `y` = the piece's centre (a moonwick's flame, a bell's centre, a pod's centre), or her body centre for
 * her own (glow, mend, gust), unless said.
 *
 * - `glowGain` / `glowSpend`: her glow changed by `n` (`from` / `for`); `glow` = what she carries now.
 * - `mendStart` (the channel shows from `glow.tapFrames` on; it lands `frames` later), `mend` (it landed: `hp`
 *   now, the glow spent), `mendBreak` (`why`: hurt, input, air, nothing left to mend or spend).
 * - `lureKindle` (a cold moonwick lit: `burn` frames, `-1` = for good), `kindleRefuse` (too little glow: the bud
 *   flickers once), `lureGutter` (its last `frames` begin: the flicker), `lureCold` (it went out), `lureFan`
 *   (a gust started its burn over), `wickSet` (a set burned whole: `flag` saved, its wicks burn for good).
 * - `mossOn` / `mossOff`: a moonmoss piece became solid / went (`w`, `h` its rect; `x`, `y` its top-left).
 * - `gust` (a puff left her: `dx`, `dy` its way, `hop` = it was the air hop), `gustHit` (it met `target`:
 *   `how` = snuff | fan | knock | swing | shove), `gustEnd` (it was spent or met a wall).
 * - `enemyShy`: a hawker or a dangler would have started a strike at her, but she (or the spot) is in silver light.
 * - `bellHit` (a strike counted in the dark: `n` rings lit, `gap` frames since the last, `beat` `.`/`-`/'' for
 *   the first), `bellDull` (struck with a warm lamp burning near: it counts nothing), `bellAnswer` (the phrase:
 *   `flag` saved).
 * - `podRegrow`: a glow pod's bud is back. `enemyRespawn`: a `respawn` creature is back at its spawn.
 */
export type LightEvent =
  | {
      type: 'glowGain';
      n: number;
      from: 'hit' | 'kill' | 'snuff' | 'glint';
      glow: number;
      max: number;
      x: number;
      y: number;
    }
  | { type: 'glowSpend'; n: number; for: 'mend' | 'kindle'; glow: number; x: number; y: number }
  | { type: 'mendStart'; frames: number; x: number; y: number }
  | { type: 'mend'; hp: number; glow: number; x: number; y: number }
  | { type: 'mendBreak'; why: 'hurt' | 'input' | 'air' | 'full' | 'empty'; x: number; y: number }
  | { type: 'lureKindle'; id: string; burn: number; keep: boolean; cost: number; x: number; y: number }
  | { type: 'kindleRefuse'; id: string; glow: number; cost: number; x: number; y: number }
  | { type: 'lureGutter'; id: string; frames: number; x: number; y: number }
  | { type: 'lureCold'; id: string; x: number; y: number }
  | { type: 'lureFan'; id: string; burn: number; x: number; y: number }
  | { type: 'wickSet'; id: string; flag: string; wicks: string[]; x: number; y: number }
  | { type: 'mossOn'; id: string; x: number; y: number; w: number; h: number }
  | { type: 'mossOff'; id: string; x: number; y: number; w: number; h: number }
  | { type: 'gust'; x: number; y: number; dx: number; dy: number; frames: number; hop: boolean }
  | {
      type: 'gustHit';
      target: { kind: string; id: string };
      how: 'snuff' | 'fan' | 'knock' | 'swing' | 'shove';
      x: number;
      y: number;
    }
  | { type: 'gustEnd'; x: number; y: number; wall: boolean }
  | { type: 'enemyShy'; id: string; kind: string; x: number; y: number }
  | { type: 'bellHit'; id: string; n: number; of: number; gap: number; beat: string; x: number; y: number }
  | { type: 'bellDull'; id: string; x: number; y: number }
  | { type: 'bellAnswer'; id: string; flag: string; x: number; y: number }
  | { type: 'podRegrow'; id: string; x: number; y: number }
  | { type: 'enemyRespawn'; id: string; kind: string; x: number; y: number }
  /**
   * An ambush's creature shows at its `arrive` point (`fromX`, `fromY`: its box centre) and travels to its spawn (`x`,
   * `y`: box centre) over `frames`, harmless and out of reach (`EnemyState.arrive` counts down; Canopy r8).
   */
  | {
      type: 'enemyArrive';
      id: string;
      kind: string;
      x: number;
      y: number;
      fromX: number;
      fromY: number;
      frames: number;
    };
