/**
 * Patches of the wood's mass baked on their own (pf-mass.ts): a cover or a rotten wall in a wood room is painted as
 * the mass it sits in (review r1 #4: "a secret you can see is a pickup with a detour"), baked like the playfield and
 * shown masked to its rect. The playfield bakes them (layers/playfield.ts) and files them here by `cover:<id>` /
 * `bark:<id>`; the level's pieces (render/lantern/kit.ts) fade a cover when she is inside it or it opens, and hide a
 * wall when it breaks. One room per build: the playfield clears the map before it bakes.
 */
import type { Container } from 'pixi.js';

export const MASS_PATCHES = new Map<string, Container>();
