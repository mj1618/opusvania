/**
 * The light she carries, made audible (docs/audio-direction.md §3): a faint chord of rubbed glass around
 * her, one more tone of the forest's chord per seen level (A4, E5, B5, D5), louder as she carries more;
 * empty-handed it is gone. Silence is safety.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { PITCH } from '../tuning';
import { Rubbed } from './bowl';

const TONES = [PITCH.A4, PITCH.E5, PITCH.B5, PITCH.D4 * 2];

export class ChordVoice {
  private readonly tones: Rubbed[];

  constructor(graph: AudioGraph, baked: Baked) {
    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    this.tones = TONES.map((_, k) => new Rubbed(graph, k % 2 ? pr : pl, 1.3 + k * 1.7, 60, 0.55, 'hero'));
  }

  apply(L: Layers, when: number): void {
    // A tone comes in over a second and leaves over half of one: carried light gathers, spent light goes.
    this.tones.forEach((t, k) => {
      const g = L.chord[k] ?? 0;
      t.set(g, TONES[k] as number, L.chordPan + (k - 1.5) * 0.08, when, g > 0 ? 0.35 : 0.18);
    });
  }
}
