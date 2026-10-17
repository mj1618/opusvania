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
    /**
     * A carpet of fallen wings on a floor (plan r3 items 5 and 8: the old burrback sleeps on what it has eaten):
     * pale wing chevrons from x0 to x1 along the floor at y, `count` of them (default one per 11 px).
     */
    /**
     * The den under the oak (plan r5 item 1, the staged death): `breath` (x, y, r) the dark that breathes under the
     * mesh before the fight; `crack` (a flag: the fight's transition) a thin blade of moonlight through the `plug`
     * (rect); `flag` (its death) the plug falls in pieces and the moon `column` (x, its top and foot, w) pours into the
     * den; `walls` (rects) the moth wings layered on its walls, seen once the light is in.
     */
    den: z
      .object({
        flag: z.string().min(1),
        crack: z.string().min(1).optional(),
        plug: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict(),
        column: z
          .object({ x: z.number(), top: z.number(), foot: z.number(), w: z.number().positive() })
          .strict(),
        breath: z.object({ x: z.number(), y: z.number(), r: z.number().positive() }).strict().optional(),
        walls: z
          .array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict())
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Moonlight leaking through cracks (round 6, video r4 #6: a hollow behind bark nobody found): thin pale beams
     * out of each rect's face (`dir` the way they fall: 1 = right, -1 = left, 0 = both), a slow shimmer.
     */
    leaks: z
      .array(
        z
          .object({
            x: z.number(),
            y: z.number(),
            w: z.number().positive(),
            h: z.number().positive(),
            dir: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
            /** Up out of its top face instead (a floor panel over a hollow). */
            up: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    /** Stragglers circling a spot (a crack with a lamp or a hollow behind it): `count` moths round (x, y) at `r`. */
    strays: z
      .array(
        z
          .object({
            x: z.number(),
            y: z.number(),
            r: z.number().positive(),
            count: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .optional(),
    carpet: z
      .object({
        x0: z.number(),
        x1: z.number(),
        y: z.number(),
        count: z.number().int().positive().optional(),
      })
      .strict()
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
     * More of Tatter (the room's `marks.tatter` is the first; plan r3: the oak holds it at its floor, then on the
     * root after the cut, then by P5 at the finale). Each like `marks.tatter`, here by `when` / `until`; with `climb`
     * it goes along `path` (from its mark) staying `lead` px ahead of her nearest point on it (never back), at most
     * `speed` px/s (up a root in effortful pulls), and sits at the path's end, or with `vanish` goes through it.
     */
    tatters: z
      .array(
        z
          .object({
            x: z.number(),
            y: z.number(),
            facing: z.union([z.literal(-1), z.literal(1)]),
            want: pt.optional(),
            when: z.string().min(1).optional(),
            until: z.string().min(1).optional(),
            /** On this flag's `flagSet` it tries the air once (the crown: wings open, a beat, a hop, then a look at her). */
            tryOn: z.string().min(1).optional(),
            climb: z
              .object({
                path,
                lead: z.number().optional(),
                speed: z.number().positive().optional(),
                /** It goes through a door at the path's end: it fades out there, gone for the session. */
                vanish: z.boolean().optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * The hatching tree as a far silhouette (plan r3: the crown's wide frame looks back west to where she was born),
     * like `oak`, in this room's coordinates: `x` its trunk, `y` its foot, `top` its crown, `w` its trunk's width.
     */
    hatchTree: z
      .object({ x: z.number(), y: z.number(), top: z.number(), w: z.number().positive().optional() })
      .strict()
      .optional(),
    /**
     * The crown cloud: every moth she has freed (`save.moths`), waiting at (x, y) in an ellipse `r` wide, lifts
     * off toward `to` when `flag` is set (the finale's trigger; a `hold` on it holds the view). Once the flag is
     * saved the cloud has gone.
     */
    cloud: z
      .object({
        x: z.number(),
        y: z.number(),
        r: z.number().positive(),
        flag: z.string().min(1),
        to: pt,
        /** Seconds the lift lasts, the view held wide the while (plan r3 item 7: ~9 s). Default 9. */
        secs: z.number().positive().optional(),
        /** The wide frame held while they go (centre, zoom): the hatching tree west, the valley east. */
        view: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).strict().optional(),
      })
      .strict()
      .optional(),
    /**
     * A straggler that shows the way on (first-timer r3: in the burrow the swarm was gone and nothing pointed
     * onward): a few moths fly `ahead` px (default 360) along `path` ahead of her, waiting for her, and at its
     * end they go on through (down the hole); gone for good once `until` is set (if given).
     */
    guide: z
      .object({
        path,
        ahead: z.number().positive().optional(),
        count: z.number().int().positive().optional(),
        until: z.string().min(1).optional(),
      })
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
