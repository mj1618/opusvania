import { audioData } from './data';
import type { AudioEngine } from './engine';
import type { HumVoice } from './hum';
import { NOISE_COLOURS, type NoiseColour } from './noise';

/**
 * Offline render scenarios: timed actions against an AudioEngine. Rendered by offline.ts (in the
 * browser) for `npm run audio:render` level checks and the combined demo. The listener is at (0, 0).
 */
export interface Scenario {
  name: string;
  seconds: number;
  actions: [t: number, run: (e: AudioEngine) => void][];
}

const sfxScenario = (name: string): Scenario => ({
  name: `sfx/${name}`,
  seconds: 1.5,
  actions: [[0.02, (e) => e.play(name, { exact: true })]],
});

const humScenario = (c: NoiseColour): Scenario => {
  let h: HumVoice | undefined;
  return {
    name: `hum/${c}`,
    seconds: 3,
    actions: [
      [0, (e) => (h = e.hum(undefined, c, { x: 0, y: 0 }))],
      [2.4, () => h?.stop(0.4)],
    ],
  };
};

const seizeScenario = (c: NoiseColour): Scenario => {
  let h: HumVoice | undefined;
  return {
    name: `seize/${c}`,
    seconds: 3.5,
    actions: [
      [0, (e) => (h = e.hum(undefined, c, { x: -400, y: 0 }))],
      [1, () => h?.seize({ x: 0, y: 0 })],
      [2.8, () => h?.stop(0.3)],
    ],
  };
};

const levyScenario = (c: NoiseColour): Scenario => {
  let h: HumVoice | undefined;
  return {
    name: `levy/${c}`,
    seconds: 4,
    actions: [
      [0, (e) => (h = e.hum(undefined, c, { x: -600, y: 0 }))],
      [0.8, () => h?.seize({ x: 0, y: 0 })],
      [1.8, () => h?.levy({ x: 700, y: 0 })],
      [3.4, () => h?.stop(0.3)],
    ],
  };
};

/** The combined demo for humans: ambience, music layers, the SFX set, hums, seize/levy, muffle. */
function demo(): Scenario {
  const a: Scenario['actions'] = [];
  const hums: Partial<Record<NoiseColour, HumVoice>> = {};
  a.push([0, (e) => e.setRoom('gym-01')]);
  a.push([1, (e) => e.music.start('sparse')]);

  // SFX reel.
  const reel: [number, string, number?][] = [
    [3, 'jump'],
    [3.5, 'landSoft', 0.6],
    [5.4, 'jump'],
    [5.7, 'doubleJump'],
    [6.3, 'landHard'],
    [7, 'dash'],
    [7.6, 'wallJump'],
    [9.5, 'headBump'],
    [9.9, 'pogo'],
    [10.5, 'hurt'],
    [11, 'hit'],
    [11.6, 'uiMove'],
    [11.85, 'uiConfirm'],
    [12.2, 'uiBack'],
  ];
  for (const [t, name, volume] of reel) a.push([t, (e) => e.play(name, { volume: volume ?? 1 })]);
  for (let i = 0; i < 5; i++) {
    const t = 3.9 + i * 0.28;
    a.push([t, (e) => e.play('footstep', { x: (i % 2 ? 1 : -1) * 60, y: 0 })]);
  }
  for (let t = 8; t < 9.2; t += 0.05) {
    const k = (t - 8) / 1.2;
    a.push([t, (e) => e.loopGain('wallSlide', 0.3 + 0.7 * k)]);
  }
  a.push([9.2, (e) => e.loopGain('wallSlide', 0)]);

  a.push([13, (e) => e.music.request('full')]);

  // Hums, spread across the stereo field.
  const place: [number, NoiseColour, number][] = [
    [13.5, 'brown', -700],
    [14.5, 'pink', 0],
    [15.5, 'violet', 700],
    [16.5, 'white', 300],
  ];
  for (const [t, c, x] of place) a.push([t, (e) => (hums[c] = e.hum(c, c, { x, y: 0 }))]);
  a.push([18, () => hums.brown?.seize({ x: 0, y: 0 })]);
  a.push([19.5, () => hums.brown?.levy({ x: 600, y: 0 })]);
  a.push([21, () => hums.pink?.seize({ x: 0, y: 0 })]);
  a.push([22, () => hums.pink?.levy({ x: -500, y: 0 })]);
  a.push([23.5, () => hums.violet?.seize({ x: 0, y: 0 })]);
  a.push([24.5, () => hums.violet?.levy({ x: 0, y: -200 })]);
  a.push([26, () => hums.white?.seize({ x: 0, y: 0 })]);
  a.push([
    27.5,
    () => {
      for (const h of Object.values(hums)) h?.stop(0.6);
    },
  ]);

  a.push([28, (e) => e.setRoom('hub')]);

  // Spatial sweep: a blue hum travels left to right past the listener.
  let sweep: HumVoice | undefined;
  a.push([30, (e) => (sweep = e.hum('sweep', 'blue', { x: -1400, y: 0 }))]);
  for (let t = 30.05; t < 34; t += 0.05) {
    const x = -1400 + ((t - 30) / 4) * 2800;
    a.push([t, () => sweep?.setPosition({ x, y: 0 })]);
  }
  a.push([34.2, () => sweep?.stop(0.4)]);

  a.push([35, (e) => e.setMuffle('pause')]);
  a.push([35.5, (e) => e.play('jump')]);
  a.push([36, (e) => e.play('landHard')]);
  a.push([37, (e) => e.setMuffle('none')]);
  a.push([38, (e) => e.music.request('sparse')]);
  a.push([42, (e) => e.music.stop(2.5)]);
  return { name: 'demo', seconds: 46, actions: a };
}

function musicScenario(): Scenario {
  return {
    name: 'music',
    seconds: 16,
    actions: [
      [0.05, (e) => e.music.start('sparse')],
      [5.9, (e) => e.music.request('full')],
      [11.5, (e) => e.music.request('sparse')],
      [15, (e) => e.music.stop(0.8)],
    ],
  };
}

/** Builds every scenario fresh (they hold per-render state in closures). */
export function buildScenarios(): Scenario[] {
  const data = audioData();
  return [
    ...Object.keys(data.sfx.sounds).map(sfxScenario),
    ...NOISE_COLOURS.map(humScenario),
    ...NOISE_COLOURS.map(seizeScenario),
    ...NOISE_COLOURS.map(levyScenario),
    ...['default', ...Object.keys(data.ambience.rooms)].map(
      (room): Scenario => ({ name: `ambience/${room}`, seconds: 8, actions: [[0, (e) => e.setRoom(room)]] }),
    ),
    musicScenario(),
    demo(),
  ];
}

export function scenarioNames(): string[] {
  return buildScenarios().map((s) => s.name);
}
