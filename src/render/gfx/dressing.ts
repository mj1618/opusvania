/**
 * Render-only room dressing: content/rooms-dressing/<id>.json, validated with Zod. Kept apart from
 * the room files the sim loads (content/gym), so dressing never changes sim hashes or the room
 * schema. Files are keyed by id: `default`, then a family (`gym` for every `gym-NN`), then the room;
 * later files override earlier ones section by section. See memory/render-pipeline.md.
 */
import { z } from 'zod';
import { PALETTE_NAMES, PALETTES, type Palette, type PaletteName } from './palette';

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'colour must be "#rrggbb"')
  .transform((s) => Number.parseInt(s.slice(1), 16));

export const LightDefSchema = z
  .object({
    /** Tile coordinates in the room sketch (before padding), like cameraZones; fractions allowed. */
    at: z.tuple([z.number(), z.number()]),
    color: Hex.optional(),
    /** Falloff radius in px. */
    radius: z.number().positive().default(320),
    intensity: z.number().min(0).max(4).default(1),
    /** 0 = steady, 1 = guttering. Keyed to the sim frame, so deterministic. */
    flicker: z.number().min(0).max(1).default(0),
    /** Draw a hanging lamp (cable + glowing bulb) at the light; `hang` = cable length in px. */
    lamp: z.boolean().default(false),
    hang: z.number().min(0).default(0),
  })
  .strict();
export type LightDef = z.output<typeof LightDefSchema>;

const Sections = {
  district: z.enum(PALETTE_NAMES as [PaletteName, ...PaletteName[]]),
  /** Reseeds the backdrop generator (default: hash of the room id). */
  seed: z.number().int(),
  ambient: z
    .object({ color: Hex, level: z.number().min(0).max(2) })
    .partial()
    .strict(),
  lights: z.array(LightDefSchema),
  autoLights: z
    .object({
      /** Procedural hanging lamps under ceilings. */
      lamps: z.boolean(),
      /** Roughly one lamp per this many tiles of ceiling. */
      lampSpacing: z.number().positive(),
      /** Lights on goals, orbs, spikes, doors, respawns. */
      entities: z.boolean(),
      intensity: z.number().min(0),
    })
    .partial()
    .strict(),
  /** Densities, 0 = none, 1 = default. */
  backdrop: z
    .object({
      skyline: z.number().min(0),
      chimneys: z.number().min(0),
      scaffolding: z.number().min(0),
      signs: z.number().min(0),
      cables: z.number().min(0),
      windows: z.number().min(0),
      smoke: z.number().min(0),
      mid: z.number().min(0),
    })
    .partial()
    .strict(),
  foreground: z
    .object({ density: z.number().min(0) })
    .partial()
    .strict(),
  particles: z
    .object({
      motes: z.number().int().min(0),
      embers: z.number().int().min(0),
      soot: z.number().int().min(0),
      /** Horizontal drift in px/frame. */
      wind: z.number(),
    })
    .partial()
    .strict(),
  grade: z
    .object({
      saturation: z.number().min(0),
      contrast: z.number().min(0),
      exposure: z.number().min(0),
      vignette: z.number().min(0).max(1),
      grain: z.number().min(0).max(1),
      /** Additive light scattering in the air around lamps. */
      haze: z.number().min(0).max(2),
    })
    .partial()
    .strict(),
};

export const DressingFileSchema = z
  .object({
    id: z.string().min(1),
    notes: z.string().optional(),
    district: Sections.district.optional(),
    seed: Sections.seed.optional(),
    ambient: Sections.ambient.optional(),
    lights: Sections.lights.optional(),
    autoLights: Sections.autoLights.optional(),
    backdrop: Sections.backdrop.optional(),
    foreground: Sections.foreground.optional(),
    particles: Sections.particles.optional(),
    grade: Sections.grade.optional(),
  })
  .strict();
export type DressingFile = z.output<typeof DressingFileSchema>;

/** Fully resolved dressing for one room. */
export interface Dressing {
  roomId: string;
  district: PaletteName;
  palette: Palette;
  seed: number;
  ambient: { color: number; level: number };
  lights: LightDef[];
  autoLights: { lamps: boolean; lampSpacing: number; entities: boolean; intensity: number };
  backdrop: Required<z.output<typeof Sections.backdrop>>;
  foreground: { density: number };
  particles: { motes: number; embers: number; soot: number; wind: number };
  grade: Required<z.output<typeof Sections.grade>>;
  /** Which files contributed, in order (for the debug API). */
  sources: string[];
}

const BUILTIN: Omit<Dressing, 'roomId' | 'palette' | 'seed' | 'ambient' | 'sources'> = {
  district: 'brown',
  lights: [],
  autoLights: { lamps: true, lampSpacing: 11, entities: true, intensity: 1 },
  backdrop: { skyline: 1, chimneys: 1, scaffolding: 1, signs: 1, cables: 1, windows: 1, smoke: 1, mid: 1 },
  foreground: { density: 1 },
  particles: { motes: 70, embers: 14, soot: 40, wind: 0.25 },
  grade: { saturation: 1, contrast: 1, exposure: 1, vignette: 0.5, grain: 0.045, haze: 0.2 },
};

/** Parses every dressing file; throws with the file name on the first invalid one. */
export function parseDressingFiles(files: Record<string, unknown>): Map<string, DressingFile> {
  const out = new Map<string, DressingFile>();
  for (const [path, raw] of Object.entries(files)) {
    const res = DressingFileSchema.safeParse(raw);
    if (!res.success) throw new Error(`${path}: ${z.prettifyError(res.error)}`);
    const base = path
      .split('/')
      .pop()
      ?.replace(/\.json$/, '');
    if (base !== res.data.id) throw new Error(`${path}: id "${res.data.id}" must match the file name`);
    out.set(res.data.id, res.data);
  }
  return out;
}

/** The family of a room id: `gym-07` -> `gym`. */
export function roomFamily(id: string): string {
  return id.replace(/-\w+$/, '');
}

export function resolveDressing(
  files: Map<string, DressingFile>,
  roomId: string,
  seedFallback: number,
): Dressing {
  const chain = ['default', roomFamily(roomId), roomId].filter((id, i, a) => a.indexOf(id) === i);
  const d: Dressing = {
    ...structuredClone(BUILTIN),
    roomId,
    palette: PALETTES.brown,
    seed: seedFallback,
    ambient: { ...PALETTES.brown.ambient },
    sources: [],
  };
  let ambient: Partial<Dressing['ambient']> = {};
  for (const id of chain) {
    const f = files.get(id);
    if (!f) continue;
    d.sources.push(id);
    if (f.district) d.district = f.district;
    if (f.seed !== undefined) d.seed = f.seed;
    if (f.ambient) ambient = { ...ambient, ...f.ambient };
    if (f.lights) d.lights = f.lights;
    if (f.autoLights) Object.assign(d.autoLights, f.autoLights);
    if (f.backdrop) Object.assign(d.backdrop, f.backdrop);
    if (f.foreground) Object.assign(d.foreground, f.foreground);
    if (f.particles) Object.assign(d.particles, f.particles);
    if (f.grade) Object.assign(d.grade, f.grade);
  }
  d.palette = PALETTES[d.district];
  d.ambient = { ...d.palette.ambient, ...ambient };
  return d;
}

// Vite (and Vitest) bundle every dressing file; render code only, never imported by the sim.
const RAW = import.meta.glob('../../../content/rooms-dressing/*.json', { eager: true, import: 'default' });
let cache: Map<string, DressingFile> | null = null;

export function dressingFiles(): Map<string, DressingFile> {
  cache ??= parseDressingFiles(RAW);
  return cache;
}

export function getDressing(roomId: string, seedFallback: number): Dressing {
  return resolveDressing(dressingFiles(), roomId, seedFallback);
}
