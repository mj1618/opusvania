/**
 * Story staging marks (`room.marks.stage`): render-only data for the greybox stand-ins of the story's
 * set pieces (docs/design/journey.md, docs/design/regions/wood.md; memory/staging.md). Nothing here
 * touches the sim: beats start on sim events (`flagSet` from a trigger, `gladeGrant`, `fallCatch`) and the
 * camera moves are render-side offsets (src/render/camera/stage-cam.ts). Staging rule: the player stays
 * in control (no input is held); the camera may lift, widen or look.
 *
 * Far things (`moon`, `lights`, `stream`) are drawn with parallax `parallax` (0 = fixed on screen, 1 = in
 * the world) about the vista's view point, so they sit "far off" in a flat greybox room.
 */
import { z } from 'zod';

const pt = z.tuple([z.number(), z.number()]);
const path = z.array(pt).min(2);

/** On a story flag (a trigger's `sets`, memory/level-kit.md) or, until the trigger exists, on entering a camera zone. */
const cue = { flag: z.string().min(1).optional(), zone: z.string().min(1).optional() };

export const StageSchema = z
  .object({
    /** A pale greybox moon, far off. The title sits over it. */
    moon: z.object({ x: z.number(), y: z.number(), r: z.number().positive() }).strict().optional(),
    /** Far warm lights (the valley's lamps) scattered in a rect. */
    lights: z
      .object({
        x: z.number(),
        y: z.number(),
        w: z.number().positive(),
        h: z.number().positive(),
        count: z.number().int().positive(),
      })
      .strict()
      .optional(),
    /** The swarm as a dot stream along a far path (west to east), pouring into the lights at its end. */
    stream: z
      .object({
        points: path,
        count: z.number().int().positive().optional(),
        speed: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    /**
     * The vista: on its cue the camera eases to (x, y) at `zoom` and holds `hold` s (she keeps control);
     * `title` fades in over the moon. `parallax` is the far layer's (moon, lights, stream), anchored here.
     */
    vista: z
      .object({
        ...cue,
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive().optional(),
        hold: z.number().positive(),
        title: z.string().min(1).optional(),
        parallax: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    /** Stragglers: on the vista's cue, `count` moths peel off the stream and dive along `path` (world px). */
    stragglers: z.object({ count: z.number().int().positive(), path }).strict().optional(),
    /** Moths circling a lure while it burns (they scatter when it goes out). */
    circlers: z
      .array(
        z
          .object({ lure: z.string().min(1), count: z.number().int().positive(), r: z.number().positive() })
          .strict(),
      )
      .optional(),
    /** Still props: a dead moth on the ground (feet point). */
    props: z
      .array(
        z
          .object({
            kind: z.literal('deadMoth'),
            x: z.number(),
            y: z.number(),
            facing: z.union([z.literal(-1), z.literal(1)]).optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * The firefly's glimpse: on its cue the camera looks at (x, y) at `zoom` for `secs`; a small warm light
     * flies `path` in, hangs at its last point (the glow-cap), pulses twice and darts away along `away`.
     */
    glimpse: z
      .object({
        ...cue,
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive().optional(),
        secs: z.number().positive(),
        path,
        away: path,
      })
      .strict()
      .optional(),
    /** The bask: on a glade's grant in this room the camera frames (x, y) at `zoom` for `secs`; moonlight motes rise. */
    bask: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number().positive().optional(),
        secs: z.number().positive(),
      })
      .strict()
      .optional(),
    /** Root ladders that hang once `flag` is set (the hub, after the cap stair's root is cut): x, top, bottom. */
    ladders: z
      .array(z.object({ flag: z.string().min(1), x: z.number(), y0: z.number(), y1: z.number() }).strict())
      .optional(),
    /** On `flag`'s flagSet, a root `len` px long falls from (x, y) (the cap stair's top: the root she cut). */
    rootFall: z
      .object({ flag: z.string().min(1), x: z.number(), y: z.number(), len: z.number().positive() })
      .strict()
      .optional(),
    /**
     * The great hollow oak (the director's area 1, docs/design/regions/wood-area1-director.md), in this room's
     * coordinates (it may lie outside the room): `x` its trunk's middle, `y` the foot of the column the moths
     * climb, `top` its crown ring, `w` the hollow's width. Freed moths follow her a moment, then fly to it and
     * up inside it; where it stands in the room, every moth she has freed is seen spiralling up the column.
     */
    oak: z
      .object({ x: z.number(), y: z.number(), top: z.number(), w: z.number().positive().optional() })
      .strict()
      .optional(),
    /**
     * The crown cloud: every moth she has freed (`save.moths`), waiting at (x, y) in an ellipse `r` wide, lifts
     * off toward `to` when `flag` is set (the finale's trigger; a `hold` on it holds the view). Once the flag is
     * saved the cloud has gone.
     */
    cloud: z
      .object({ x: z.number(), y: z.number(), r: z.number().positive(), flag: z.string().min(1), to: pt })
      .strict()
      .optional(),
    /**
     * The wings-twitch cue (wood.md R5: a tapper never opens the wings): after `catches` fall catches in the
     * room, standing within `r` of (x, y) (her feet) plays her wings flicking open twice, now and then.
     */
    twitch: z
      .object({
        x: z.number(),
        y: z.number(),
        r: z.number().positive(),
        catches: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type StageMarks = z.infer<typeof StageSchema>;
