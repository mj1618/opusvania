/**
 * What the prologue's director (src/prologue/) tells its renderer each frame: plain data, written
 * by the director (harness side), read here. Render never writes it and never touches the sim.
 */
import type { PlayerState } from '../../sim/state';
import type { BeatId } from './script';

/** Where the played stretch (beat 3) has got to. */
export type PlayPhase =
  /** Sorrel runs a leg of the course (a recorded clip on his own sim body). */
  | 'leg'
  /** ...and waits at its mark for her, hopping "come on". */
  | 'wait'
  /** She fell behind: he comes back down to her and leads that leg again. */
  | 'back'
  /** On F4 under the dance he stops racing and stares up (she wins). */
  | 'stop'
  /** A glint drifts down between them; she catches it. */
  | 'glint'
  /** She holds it up to her face (no control). */
  | 'hold'
  /** The give prompt over him: she holds the give button. */
  | 'give'
  /** It streams to him; he holds it up; he looks at her; he tosses it up. */
  | 'his'
  /** Keep it up: her jump bumps it to him, his hop bumps it back. */
  | 'bumps'
  /** It sails long, west, off F4; he dives after it, wings open. */
  | 'sail'
  /** It came down on the fox's nose, the fox sneezed; it hangs over the fox's back for her. */
  | 'nose'
  /** She reached the fox: the played stretch is over. */
  | 'end';

export interface ProloguePlan {
  /** The beat, seconds into it, and seconds since the prologue began. */
  beat: BeatId;
  bt: number;
  t: number;
  /** The played stretch: its phase, seconds into the phase, the leg of the course. */
  phase: PlayPhase;
  pt: number;
  /** `pt` when the phase began. */
  phaseAt: number;
  leg: number;
  /** Seconds into the played stretch when things happened (-1: not yet). */
  raceAt: number;
  stopAt: number;
  sneezeAt: number;
  /** Sorrel's own sim body (the guide): the state before the last step and the latest, or null while he is not out. */
  sorrel: { prev: PlayerState; cur: PlayerState } | null;
  /** The glint the director owns (world px): who has it ('free' = in the air). */
  glint: { on: boolean; x: number; y: number; holder: 'none' | 'wing' | 'sorrel' | 'free' };
  /** 0..1: how far the give button has been held toward giving (the prompt fills). */
  give: number;
  /** The give prompt is up over him. */
  prompt: boolean;
  /** Bumps so far (hers). */
  bumps: number;
  /** The hollow's played escape: she is in the ferns; 0..1 she folds her wing over the glint (give held); Sorrel tackled her (s into the beat, -1). */
  inFerns: boolean;
  fold: number;
  tackleAt: number;
  /** Where the two of them were when the played stretch ended (feet, world px). */
  from: { x: number; y: number; sx: number; sy: number };
  /** What she may do now. */
  can: { jump: boolean; dash: boolean; glide: boolean };
}

export function newPlan(): ProloguePlan {
  return {
    beat: 'breath',
    bt: 0,
    t: 0,
    phase: 'leg',
    pt: 0,
    phaseAt: 0,
    leg: 0,
    raceAt: -1,
    stopAt: -1,
    sneezeAt: -1,
    sorrel: null,
    glint: { on: false, x: 0, y: 0, holder: 'none' },
    give: 0,
    prompt: false,
    bumps: 0,
    inFerns: false,
    fold: 0,
    tackleAt: -1,
    from: { x: 0, y: 0, sx: 0, sy: 0 },
    can: { jump: false, dash: false, glide: false },
  };
}
