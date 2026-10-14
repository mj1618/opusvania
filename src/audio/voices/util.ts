/** Small helpers the continuous voices share. */
import { type BiquadKind, biquad, rms } from '../dsp';
import type { AudioGraph } from '../graph';

/** A looping noise bed from one channel of a baked loop, started at `offset` s into it. */
export function bed(graph: AudioGraph, ch: Float32Array, offset: number): AudioBufferSourceNode {
  const src = new AudioBufferSourceNode(graph.ctx, { buffer: graph.buffer([ch]), loop: true });
  src.start(0, offset % (ch.length / graph.ctx.sampleRate));
  return src;
}

/** Glides an AudioParam toward `v` from `when` (never a step: every change ramps). */
export function aim(p: AudioParam, v: number, when: number, tau: number): void {
  p.setTargetAtTime(v, when, tau);
}

/** A gain that starts silent. */
export function silent(graph: AudioGraph): GainNode {
  return new GainNode(graph.ctx, { gain: 0 });
}

/** One filter of a chain: kind, frequency (Hz), Q (linear). */
export type Filt = [BiquadKind, number, number];

export interface Band {
  /** The chain's filters, in order (aim their frequency to move the band). */
  filters: BiquadFilterNode[];
  /** Unit-RMS output: a layer's gain after it is the layer's RMS level, linear. */
  out: GainNode;
}

/**
 * A noise bed through a filter chain, trimmed so its output is unit RMS: the trim is measured by
 * running the same chain (dsp.ts, the cookbook formulas Web Audio uses) over two seconds of the
 * bed. So the tuning's dB numbers are the layers' real RMS levels before the master.
 */
export function band(graph: AudioGraph, ch: Float32Array, offset: number, chain: Filt[]): Band {
  const ctx = graph.ctx;
  const src = bed(graph, ch, offset);
  const probe = ch.slice(0, Math.min(ch.length, 2 * ctx.sampleRate));
  for (const [kind, f, q] of chain) biquad(probe, ctx.sampleRate, kind, f, q);
  // Skip the filters' settling at the start.
  const trim = 1 / Math.max(1e-6, rms(probe.subarray(Math.floor(probe.length / 4))));
  const filters = chain.map(
    ([type, frequency, q]) =>
      new BiquadFilterNode(ctx, {
        type,
        frequency,
        // Web Audio reads a low/high-pass Q in dB, a band-pass Q as is.
        Q: type === 'bandpass' ? q : 20 * Math.log10(q),
      }),
  );
  const out = new GainNode(ctx, { gain: trim });
  let head: AudioNode = src;
  for (const f of filters) head = head.connect(f);
  head.connect(out);
  return { filters, out };
}
