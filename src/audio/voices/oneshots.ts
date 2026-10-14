/**
 * One-shots: a baked buffer through a level, a far-ness low-pass and a panner, into its bus and the
 * sends. At most `AUDIO.maxVoices` at once: a new one steals the lowest-priority, oldest voice
 * (faded over 10 ms, never cut).
 */
import { type Baked, rateOf, type SoundId } from '../bake';
import { centsToRatio, dbToGain } from '../dsp';
import type { AudioGraph } from '../graph';
import { type AudioCam, type Cue, panOf } from '../router';
import { AUDIO } from '../tuning';

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
  priority: number;
  start: number;
}

export class OneShots {
  private readonly buffers: Record<string, AudioBuffer[]> = {};
  private playing: Playing[] = [];

  constructor(
    private readonly graph: AudioGraph,
    baked: Baked,
  ) {
    for (const [id, variants] of Object.entries(baked.sounds))
      this.buffers[id] = variants.map((chs) => graph.buffer(chs, rateOf(id as SoundId, baked.sr)));
  }

  /** Plays a cue at context time `when` (its own `delay` added), heard from `cam`. */
  play(cue: Cue, when: number, cam: AudioCam): void {
    const g = this.graph;
    const ctx = g.ctx;
    const list = this.buffers[cue.sound];
    const buffer = list?.[cue.variant % (list?.length || 1)];
    if (!buffer) return;
    const t = when + cue.delay;
    this.playing = this.playing.filter((p) => p.end > t);
    if (this.playing.length >= AUDIO.maxVoices) {
      const victim = [...this.playing].sort((a, b) => a.priority - b.priority || a.start - b.start)[0];
      if (!victim || victim.priority > cue.priority) return;
      victim.gain.gain.setTargetAtTime(0, t, 0.004);
      victim.src.stop(t + 0.03);
      this.playing.splice(this.playing.indexOf(victim), 1);
    }

    let level = dbToGain(cue.db);
    let pan = cue.pan ?? 0;
    if (cue.place === 'hero') pan = panOf(cue.x, cam) * AUDIO.hero.panWidth;
    else if (cue.place === 'world') {
      pan = panOf(cue.x, cam) * 0.8;
      const d = Math.hypot(cue.x - cam.x, cue.y - cam.y) / AUDIO.halfPx;
      level /= 1 + d * d;
    }
    const rate = centsToRatio(cue.cents);
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
    const gain = new GainNode(ctx, { gain: level });
    const panner = new StereoPannerNode(ctx, { pan });
    let head: AudioNode = src;
    if (cue.far > 0) {
      const lp = new BiquadFilterNode(ctx, {
        type: 'lowpass',
        frequency: 9000 * (1400 / 9000) ** cue.far,
        Q: 0.5,
      });
      head.connect(lp);
      head = lp;
    }
    head.connect(gain).connect(panner).connect(g.buses[cue.bus].in);
    const dur = buffer.duration / rate;
    if (cue.panTo !== undefined) {
      panner.pan.setValueAtTime(pan, t);
      panner.pan.linearRampToValueAtTime(cue.panTo, t + dur);
    }
    // Wetter the farther: the room for everything, the far send for distant things.
    const room = new GainNode(ctx, { gain: cue.bus === 'lantern' ? 0.5 : cue.bus === 'hero' ? 0.16 : 0.3 });
    panner.connect(room).connect(g.buses[cue.bus].room);
    if (cue.far > 0) {
      const far = new GainNode(ctx, { gain: 0.9 * cue.far });
      panner.connect(far).connect(g.buses[cue.bus].far);
    }
    src.start(t);
    this.playing.push({ src, gain, end: t + dur, priority: cue.priority, start: t });
  }
}
