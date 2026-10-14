/**
 * The mixing graph: four buses (world, hush, hero, lantern), one shared room reverb and a far,
 * darker one as sends, a roll-off above 9 kHz on everything but the glass, the master gain and a
 * gentle limiter that should never touch a normal mix (it is there for pile-ups).
 *
 *   voice -> bus.in -> roll-off -> bus.vol -> sum -> fader -> master -> limiter -> trim -> out
 *        \-> roomIn -> room convolver ---------^
 *        \-> farIn  -> far convolver  ---------^
 */
import type { Baked } from './bake';
import { dbToGain } from './dsp';
import { AUDIO, type BusId } from './tuning';

export interface Bus {
  in: GainNode;
  /** The bus's own low-pass (the hush's is the soil; the others the roll-off). */
  filter: BiquadFilterNode;
  vol: GainNode;
  /** This bus's sends into the room and far reverbs (so muting a bus mutes its reverb too). */
  room: GainNode;
  far: GainNode;
}

/** The limiter's settings and the make-up gain Web Audio adds for them, which `trim` takes back. */
const LIMIT = { threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.25 };
const MAKEUP_DB = 0.6 * -(LIMIT.threshold - LIMIT.threshold / LIMIT.ratio);

export class AudioGraph {
  readonly buses: Record<BusId, Bus>;
  readonly roomIn: GainNode;
  readonly farIn: GainNode;
  readonly master: GainNode;
  /** The whole mix faded in and out (start, the prologue's silence): separate from the master level. */
  readonly fader: GainNode;
  /** Muting a bus for an A/B (offline: the take without the Hush). */
  readonly off = new Set<BusId>();

  constructor(
    readonly ctx: BaseAudioContext,
    baked: Baked,
    out: AudioNode = ctx.destination,
  ) {
    const sum = new GainNode(ctx);
    this.master = new GainNode(ctx, { gain: dbToGain(AUDIO.master) });
    const limiter = new DynamicsCompressorNode(ctx, LIMIT);
    const trim = new GainNode(ctx, { gain: dbToGain(-MAKEUP_DB) });
    this.fader = new GainNode(ctx, { gain: 0 });
    sum.connect(this.fader).connect(this.master).connect(limiter).connect(trim).connect(out);

    const bus = (id: BusId, hz: number): Bus => {
      const b: Bus = {
        in: new GainNode(ctx),
        filter: new BiquadFilterNode(ctx, { type: 'lowpass', frequency: hz, Q: 0.5 }),
        vol: new GainNode(ctx, { gain: dbToGain(AUDIO.bus[id]) }),
        room: new GainNode(ctx),
        far: new GainNode(ctx),
      };
      b.in.connect(b.filter).connect(b.vol).connect(sum);
      return b;
    };
    this.buses = {
      world: bus('world', AUDIO.rolloff),
      hush: bus('hush', AUDIO.hush.soilHz),
      hero: bus('hero', AUDIO.rolloff),
      // Glass may ring above the roll-off.
      lantern: bus('lantern', 15000),
    };

    const reverb = (ir: Float32Array[], into: GainNode) => {
      const conv = new ConvolverNode(ctx, { buffer: this.buffer(ir), disableNormalization: false });
      into.connect(conv).connect(sum);
    };
    this.roomIn = new GainNode(ctx);
    this.farIn = new GainNode(ctx);
    reverb(baked.ir.room, this.roomIn);
    reverb(baked.ir.far, this.farIn);
    for (const b of Object.values(this.buses)) {
      b.room.connect(this.roomIn);
      b.far.connect(this.farIn);
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
