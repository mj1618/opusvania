/**
 * The mixing graph: six buses (world, hero, combat, lantern, creatures, score), one shared room reverb and a far,
 * darker one as sends, a roll-off above 9 kHz on everything but the glass, the master gain and a
 * gentle limiter that should never touch a normal mix (it is there for pile-ups).
 *
 *   voice -> bus.in -> roll-off -> bus.vol -> muffle -> sum -> hush -> fader -> master -> glue -> limiter -> trim -> out
 *        \-> roomIn ------------------> the convolver ------^
 *        \-> farIn  -> dull, delayed, fed back -^
 *
 * The score (score.ts) goes straight to the sum with its own hall: never muffled or ducked. `hush` (everything) is
 * the boss's last hit: total silence.
 *
 * `duck` (the world bed's own gain) lowers the bed in held moments; `muffle` (a low-pass over everything
 * but the lamps: her hurt, the fling's hold) closes it. Both are layer targets (router.ts `layers`).
 */
import type { Baked } from './bake';
import { dbToGain } from './dsp';
import { AUDIO, type BusId } from './tuning';

export interface Bus {
  in: GainNode;
  /** The bus's own low-pass (the roll-off). */
  filter: BiquadFilterNode;
  vol: GainNode;
  /** This bus's sends into the room and far reverbs (so muting a bus mutes its reverb too). */
  room: GainNode;
  far: GainNode;
}

/**
 * The master's dynamics (round 13: the game played at -24.7 LUFS, too quiet on a phone; now ~-16): a gentle glue
 * compressor (a soft 10 dB knee from -15 dBFS, 3:1, slow enough to keep the blade's attack) so the bed and the score come up with the
 * master, then a brick-wall limiter for the pile-ups. Web Audio adds a make-up gain for each (Chromium: the gain
 * that brings a 0 dBFS input back to 0 dBFS, to the power 0.6); `trim` takes it back, so `AUDIO.master` alone sets
 * the level.
 */
const GLUE = { threshold: -10, knee: 10, ratio: 3, attack: 0.012, release: 0.3 };
const LIMIT = { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.1 };
const makeup = (c: { threshold: number; ratio: number }) => 0.6 * -(c.threshold - c.threshold / c.ratio);
const MAKEUP_DB = makeup(GLUE) + makeup(LIMIT);

export class AudioGraph {
  readonly buses: Record<BusId, Bus>;
  readonly roomIn: GainNode;
  readonly farIn: GainNode;
  readonly master: GainNode;
  /** The whole mix faded in and out (start, mute): separate from the master level. */
  readonly fader: GainNode;
  /** The world bed's duck (linear gain) and the low-pass over all but the lamps. */
  readonly duck: GainNode;
  readonly muffle: BiquadFilterNode;
  /** Everything at once (the boss's last hit: total silence, then its breath). A layer target. */
  readonly hush: GainNode;
  /** A low-pass over the score (a layer target, `scoreHz`): closed in the Keeper's dark, open in its light. */
  readonly scoreTone: BiquadFilterNode;
  /** The score's own reverb: a longer, brighter hall than the forest (it is not in the world). */
  readonly hallIn: GainNode;
  /** Muting a bus for an A/B (offline: the take without the bed). */
  readonly off = new Set<BusId>();

  constructor(
    readonly ctx: BaseAudioContext,
    baked: Baked,
    out: AudioNode = ctx.destination,
  ) {
    const sum = new GainNode(ctx);
    this.master = new GainNode(ctx, { gain: dbToGain(AUDIO.master) });
    const glue = new DynamicsCompressorNode(ctx, GLUE);
    const limiter = new DynamicsCompressorNode(ctx, LIMIT);
    const trim = new GainNode(ctx, { gain: dbToGain(-MAKEUP_DB) });
    this.fader = new GainNode(ctx, { gain: 0 });
    this.hush = new GainNode(ctx);
    sum
      .connect(this.hush)
      .connect(this.fader)
      .connect(this.master)
      .connect(glue)
      .connect(limiter)
      .connect(trim)
      .connect(out);
    this.muffle = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0 });
    this.muffle.connect(sum);
    this.scoreTone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0 });
    this.scoreTone.connect(sum);
    this.duck = new GainNode(ctx);

    const bus = (id: BusId, hz: number, to: AudioNode): Bus => {
      const b: Bus = {
        in: new GainNode(ctx),
        filter: new BiquadFilterNode(ctx, { type: 'lowpass', frequency: hz, Q: 0.5 }),
        vol: new GainNode(ctx, { gain: dbToGain(AUDIO.bus[id]) }),
        room: new GainNode(ctx),
        far: new GainNode(ctx),
      };
      b.in.connect(b.filter).connect(b.vol).connect(to);
      return b;
    };
    this.buses = {
      world: bus('world', AUDIO.rolloff, this.duck),
      hero: bus('hero', AUDIO.rolloff, this.muffle),
      combat: bus('combat', AUDIO.rolloff, this.muffle),
      // Glass may ring above the roll-off; the lamps are never muffled (caught, the hum dominates).
      lantern: bus('lantern', 15000, sum),
      creatures: bus('creatures', AUDIO.rolloff, this.muffle),
      // The score is not in the world: never muffled or ducked, its own hall (below). Its own tone (`scoreTone`):
      // the Keeper's P2 closes it in the dark and opens it when the light finds her.
      score: bus('score', 12000, this.scoreTone),
    };
    this.duck.connect(this.muffle);

    // One shared convolver (it is most of the render's cost). The far send reaches it duller, later and
    // fed back on itself a little (a longer, darker tail): farther sounds duller, wetter, wider.
    this.roomIn = new GainNode(ctx);
    this.farIn = new GainNode(ctx);
    const conv = new ConvolverNode(ctx, { buffer: this.buffer(baked.ir.room), disableNormalization: false });
    this.roomIn.connect(conv).connect(sum);
    const dull = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1600, Q: 0 });
    const pre = new DelayNode(ctx, { delayTime: 0.045, maxDelayTime: 0.2 });
    const loop = new DelayNode(ctx, { delayTime: 0.097, maxDelayTime: 0.2 });
    const loopDull = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 0 });
    const feedback = new GainNode(ctx, { gain: 0.42 });
    const wet = new GainNode(ctx, { gain: 1.25 });
    this.farIn.connect(dull).connect(pre).connect(wet).connect(conv);
    pre.connect(loop).connect(loopDull).connect(feedback).connect(loop);
    feedback.connect(wet);
    // The score's hall: a second convolver (3.4 s, brighter), its sends only.
    this.hallIn = new GainNode(ctx);
    const hall = new ConvolverNode(ctx, { buffer: this.buffer(baked.ir.hall), disableNormalization: false });
    this.hallIn.connect(hall).connect(sum);
    for (const [id, b] of Object.entries(this.buses)) {
      b.room.connect(id === 'score' ? this.hallIn : this.roomIn);
      b.far.connect(id === 'score' ? this.hallIn : this.farIn);
    }
  }

  /** Channel arrays to an AudioBuffer (at the context's rate unless told). */
  buffer(chs: Float32Array[], sampleRate = this.ctx.sampleRate): AudioBuffer {
    const n = chs[0]?.length ?? 1;
    const b = new AudioBuffer({ numberOfChannels: chs.length, length: n, sampleRate });
    chs.forEach((c, i) => {
      b.copyToChannel(c as Float32Array<ArrayBuffer>, i);
    });
    return b;
  }

  /** Re-reads master and bus volumes from tuning (and the A/B mutes), gliding there. */
  setVolumes(when: number): void {
    this.master.gain.setTargetAtTime(dbToGain(AUDIO.master), when, 0.03);
    for (const id of Object.keys(this.buses) as BusId[]) {
      const b = this.buses[id];
      const g = this.off.has(id) ? 0 : dbToGain(AUDIO.bus[id]);
      b.vol.gain.setTargetAtTime(g, when, 0.03);
      b.room.gain.setTargetAtTime(g, when, 0.03);
      b.far.gain.setTargetAtTime(g, when, 0.03);
    }
  }
}
