/**
 * Lanternroot's graph (docs/design/levels/proto-1.md §9, memory/lanternroot.md): the places of its rooms (each room's
 * `marks.places`) and the edges between them, with what each needs. One list, read twice: the level generator
 * (tools/levels/lanternroot.ts) writes it into the rooms' `routes` for the world check, and the solver
 * (tools/solve/proto-1.ts) proves every edge in the real sim and searches for the ways round the locks.
 *
 * An edge's `to` is a place of the same room, `exit:<id>` (she leaves by it: a door is an exit too), `flag:<name>`
 * (the save gets it: a set burned, a cap answered, a boss beaten), or `find:<id>` (a hollow, a sign, a stone, a glade,
 * a patch: the save has it). `needs` are abilities, `flags` story flags set already, `upgrades` owned ones; `light`
 * the moonwicks she kindles on the way (the solver checks their fuel), `lamps` the warm lamps the way flings off (they
 * burn for its proof; every other warm lamp of the room is spent, so no way leans on a lamp it does not name).
 * `proof`: `explore` (the explorer finds the line: tools/solve/explore.ts), `driver:<name>` (a scripted run:
 * tools/solve/drivers.ts), or `gate` (a flag gate: nothing to fly, the flag opens it).
 */

export interface LrEdge {
  room: string;
  from: string;
  to: string;
  needs?: string[];
  flags?: string[];
  upgrades?: string[];
  light?: string[];
  lamps?: string[];
  /** Both ways (a walk). Default: one way. */
  both?: boolean;
  proof: 'explore' | `driver:${string}`;
  /** The explorer searches with the creatures in (a fight, a ram). Default: movement only. */
  creatures?: boolean;
  /** A search by time (a clock matters: moonwicks). Default by moves. */
  byTime?: boolean;
  /** Node budget for its search (default 2500). */
  budget?: number;
  note?: string;
}

const BASE = ['glide', 'wallJump', 'doubleJump'];
export const KINDLE = [...BASE, 'kindle'];
export const GUST = [...BASE, 'kindle', 'gust'];
export const BASE_KIT = BASE;

export const EDGES: LrEdge[] = [
  // --- lr-night: the crown, the trunk's back, the plate.
  { room: 'lr-night', from: 'spawn', to: 'ridge', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-night', from: 'ridge', to: 'log-mouth', both: true, creatures: true, proof: 'explore' },
  {
    room: 'lr-night',
    from: 'log-mouth',
    to: 'find:h1',
    creatures: true,
    proof: 'explore',
    note: 'cut the rotten seal: Long Breath',
  },
  { room: 'lr-night', from: 'log-mouth', to: 'find:s1', creatures: true, proof: 'explore' },
  { room: 'lr-night', from: 'ridge', to: 'find:p-a1', creatures: true, proof: 'explore' },
  { room: 'lr-night', from: 'ridge', to: 'exit:split', creatures: true, proof: 'explore' },
  {
    room: 'lr-night',
    from: 'ridge',
    to: 'crown',
    lamps: ['l-a1'],
    creatures: true,
    proof: 'explore',
    note: 'the first fling (the crown end stands out of a double jump’s reach)',
  },
  { room: 'lr-night', from: 'crown', to: 'ridge', creatures: true, proof: 'explore' },
  {
    room: 'lr-night',
    from: 'ridge',
    to: 'nest',
    needs: ['kindle'],
    light: ['m-a1'],
    byTime: true,
    creatures: true,
    proof: 'explore',
    note: 'the crow’s nest: M-a1’s moss',
  },
  { room: 'lr-night', from: 'nest', to: 'ridge', creatures: true, proof: 'explore' },
  { room: 'lr-night', from: 'crown', to: 'trunk', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-night', from: 'trunk', to: 'cap-side', both: true, creatures: true, proof: 'explore' },
  {
    room: 'lr-night',
    from: 'trunk',
    to: 'exit:knot',
    creatures: true,
    proof: 'explore',
    note: 'three down cuts on the knot',
  },
  {
    room: 'lr-night',
    from: 'trunk',
    to: 'sky-limb',
    needs: ['kindle'],
    light: ['m-b1'],
    byTime: true,
    creatures: true,
    proof: 'explore',
    note: 'the sky limb: M-b1’s moss (a Kindle revisit)',
  },
  { room: 'lr-night', from: 'sky-limb', to: 'trunk', proof: 'explore' },
  {
    room: 'lr-night',
    from: 'cap-side',
    to: 'find:h-er',
    lamps: ['l-er1', 'l-er2', 'l-er3', 'l-er4', 'l-er5'],
    proof: 'explore',
    budget: 4000,
    note: 'the ember run (optional hard): a moon-drop',
  },
  {
    room: 'lr-night',
    from: 'cap-side',
    to: 'flag:answer',
    needs: ['gust'],
    proof: 'driver:answer',
    note: 'the dark, then long short short long on the cap',
  },
  { room: 'lr-night', from: 'cap-side', to: 'exit:cache-door', flags: ['answer'], proof: 'explore' },
  { room: 'lr-night', from: 'crest', to: 'find:p-c1', proof: 'explore' },
  { room: 'lr-night', from: 'crest', to: 'find:s4', proof: 'explore' },
  { room: 'lr-night', from: 'crest', to: 'find:valley', proof: 'explore', note: 'the end' },
  {
    room: 'lr-night',
    from: 'crest',
    to: 'cap-side',
    proof: 'explore',
    note: 'down the chute: the lid opens from above',
  },
  { room: 'lr-night', from: 'crest', to: 'exit:chimney', proof: 'explore' },

  // --- lr-hall: the split, the lamp hall, the wick gallery.
  {
    room: 'lr-hall',
    from: 'split-foot',
    to: 'exit:split',
    creatures: true,
    proof: 'explore',
    note: 'back up the split’s faces',
  },
  { room: 'lr-hall', from: 'split-foot', to: 'west-floor', both: true, creatures: true, proof: 'explore' },
  {
    room: 'lr-hall',
    from: 'west-floor',
    to: 'stone-shelf',
    lamps: ['l-a2c', 'l-a2d', 'l-a2e'],
    proof: 'explore',
    note: 'the three-lamp chain',
  },
  { room: 'lr-hall', from: 'stone-shelf', to: 'find:stone', proof: 'explore' },
  { room: 'lr-hall', from: 'stone-shelf', to: 'west-floor', proof: 'explore' },
  { room: 'lr-hall', from: 'split-foot', to: 'exit:hole', creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'split-foot', to: 'exit:stair', creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'split-foot', to: 'hub', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'hub', to: 'seal-foot', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'hub', to: 'tunnel-w', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'tunnel-w', to: 'find:p-b2', creatures: true, proof: 'explore' },
  {
    room: 'lr-hall',
    from: 'seal-foot',
    to: 'flag:seal-open',
    needs: ['kindle'],
    light: ['m-s1', 'm-s2'],
    byTime: true,
    creatures: true,
    budget: 4000,
    proof: 'explore',
    note: 'puzzle 2, the seal: kindle M-s1 in the air, fling off it, kindle M-s2 in that flight',
  },
  { room: 'lr-hall', from: 'seal-foot', to: 'exit:seal', flags: ['seal-open'], proof: 'explore' },
  {
    room: 'lr-hall',
    from: 'seal-foot',
    to: 'find:h2',
    needs: ['kindle'],
    flags: ['seal-open'],
    creatures: true,
    budget: 4000,
    proof: 'explore',
    note: 'H2, the loft: up the burning pair (Bright Kindle)',
  },
  {
    room: 'lr-hall',
    from: 'tunnel-w',
    to: 'gallery-w',
    needs: ['kindle'],
    light: ['m-c1'],
    byTime: true,
    creatures: true,
    proof: 'explore',
    note: 'through the thorn tunnel off M-c1',
  },
  {
    room: 'lr-hall',
    from: 'gallery-w',
    to: 'tunnel-w',
    needs: ['kindle'],
    light: ['m-c2'],
    byTime: true,
    creatures: true,
    proof: 'explore',
    note: 'back through the tunnel off M-c2',
  },
  {
    room: 'lr-hall',
    from: 'tunnel-w',
    to: 'flag:shaft-open',
    needs: ['kindle'],
    light: ['m-c1', 'm-c2'],
    byTime: true,
    creatures: true,
    budget: 4000,
    proof: 'explore',
    note: 'puzzle 3, the guarded set: off M-c1 through the tunnel, M-c2 kindled under the hawker',
  },
  { room: 'lr-hall', from: 'gallery-w', to: 'exit:shaft', flags: ['shaft-open'], proof: 'explore' },
  { room: 'lr-hall', from: 'gallery-w', to: 'gallery-e', both: true, creatures: true, proof: 'explore' },
  { room: 'lr-hall', from: 'gallery-w', to: 'roof', both: true, proof: 'explore' },
  {
    room: 'lr-hall',
    from: 'gallery-e',
    to: 'flag:curtain-open',
    needs: ['gust'],
    proof: 'explore',
    note: 'the grille lamp: gust it out from under its crown',
  },
  { room: 'lr-hall', from: 'gallery-e', to: 'exit:chimney', flags: ['curtain-open'], proof: 'explore' },
  {
    room: 'lr-hall',
    from: 'gallery-w',
    to: 'find:vault-drop',
    needs: ['kindle', 'gust'],
    light: ['m-g1', 'm-g2', 'm-g3'],
    proof: 'driver:vault',
    note: 'puzzle 5, the vault: fan the wick behind her through the window',
  },
  {
    room: 'lr-hall',
    from: 'roof',
    to: 'alcove',
    proof: 'explore',
    note: 'up to the alcove and through its bark wall (a hoard)',
  },
  { room: 'lr-hall', from: 'alcove', to: 'roof', proof: 'explore' },

  // --- lr-roots: the drowned roots, the Gloam, the cistern.
  { room: 'lr-roots', from: 'pit', to: 'find:kindle', creatures: true, proof: 'explore', note: 'Kindle' },
  { room: 'lr-roots', from: 'pit', to: 'find:p-a3', creatures: true, proof: 'explore' },
  { room: 'lr-roots', from: 'pit', to: 'find:s2', creatures: true, proof: 'explore' },
  {
    room: 'lr-roots',
    from: 'pit',
    to: 'exit:stair',
    needs: ['kindle'],
    light: ['m-a3', 'm-a3b'],
    byTime: true,
    creatures: true,
    proof: 'explore',
    note: 'puzzle 1, First Light',
  },
  {
    room: 'lr-roots',
    from: 'pit',
    to: 'find:h4',
    needs: ['kindle', 'gust'],
    light: ['m-a3c'],
    byTime: true,
    budget: 4000,
    proof: 'explore',
    note: 'the flue: fan M-a3c through the window from the third step',
  },
  {
    room: 'lr-roots',
    from: 'arena',
    to: 'flag:gloam-down',
    needs: ['kindle'],
    light: ['m-w1', 'm-w2', 'm-w3', 'm-w4'],
    proof: 'driver:gloam',
    note: 'the Gloamweaver',
  },
  { room: 'lr-roots', from: 'arena', to: 'find:gust', flags: ['gloam-down'], proof: 'explore', note: 'Gust' },
  { room: 'lr-roots', from: 'arena', to: 'cistern-w', flags: ['gloam-down'], proof: 'explore' },
  { room: 'lr-roots', from: 'cistern-w', to: 'cistern-e', both: true, creatures: true, proof: 'explore' },
  {
    room: 'lr-roots',
    from: 'cistern-w',
    to: 'exit:shaft',
    creatures: true,
    proof: 'explore',
    note: 'up the root column',
  },
  { room: 'lr-roots', from: 'cistern-e', to: 'heartwood-top', proof: 'explore' },
  { room: 'lr-roots', from: 'heartwood-top', to: 'cistern-e', proof: 'explore' },
  {
    room: 'lr-roots',
    from: 'heartwood-top',
    to: 'find:h3',
    proof: 'driver:ram',
    note: 'puzzle 4, the ram: the burrback breaks the heartwood',
  },
  { room: 'lr-roots', from: 'cistern-e', to: 'find:s3', flags: [], proof: 'driver:ram' },

  // --- lr-cache: the firefly's workshop.
  { room: 'lr-cache', from: 'cache-floor', to: 'exit:door', creatures: true, proof: 'explore' },
  {
    room: 'lr-cache',
    from: 'cache-floor',
    to: 'find:cache-vessel',
    needs: ['kindle'],
    light: ['m-ring1', 'm-ring2', 'm-ring3'],
    creatures: true,
    proof: 'explore',
    budget: 4000,
    note: 'the glow vessel on the top shelf: flings off her own lights',
  },
];

/** Where each exit lands her: `room#exit` -> `room:place` in the room beyond. */
export const ARRIVALS: Record<string, string> = {
  'lr-night#split': 'lr-hall:split-foot',
  'lr-hall#split': 'lr-night:ridge',
  'lr-night#knot': 'lr-hall:hub',
  'lr-hall#chimney': 'lr-night:crest',
  'lr-night#chimney': 'lr-hall:gallery-e',
  'lr-hall#hole': 'lr-roots:pit',
  'lr-hall#stair': 'lr-roots:pit',
  'lr-roots#stair': 'lr-hall:split-foot',
  'lr-hall#seal': 'lr-roots:arena',
  'lr-hall#shaft': 'lr-roots:cistern-w',
  'lr-roots#shaft': 'lr-hall:gallery-w',
  'lr-night#cache-door': 'lr-cache:cache-floor',
  'lr-cache#door': 'lr-night:cap-side',
};

/**
 * The locks the skip-hunter tries round (proto-1.md §10 "Solvable and in order"): from these places, with this kit
 * (the tool held back), the search must never reach `goal`. The must-use locks take a puzzle's own piece away
 * (`stripLures`: the moonwick or lamp it is meant to be flung off) and ask that it cannot be done without it.
 */
export interface Lock {
  id: string;
  room: string;
  from: string[];
  kit: string[];
  flags?: string[];
  goal: string;
  budget?: number;
  byTime?: boolean;
  /** Glades taken out of the room for the hunt (the tool itself, when it lies on the way). */
  strip?: string[];
  /** Lures taken out of the room (a must-use lock: the puzzle's own anchor). */
  stripLures?: string[];
  /** Warm lamps spent for the hunt (the revisit's state); default: every warm lamp burns for ever. */
  spent?: boolean;
}

export const LOCKS: Lock[] = [
  {
    id: 'pit-without-kindle',
    room: 'lr-roots',
    from: ['pit'],
    kit: BASE,
    goal: 'exit:stair',
    strip: ['kindle'],
  },
  {
    id: 'gully-without-the-fling',
    room: 'lr-night',
    from: ['ridge'],
    kit: BASE,
    goal: 'crown',
    stripLures: ['l-a1'],
  },
  { id: 'nest-without-kindle', room: 'lr-night', from: ['ridge', 'crown'], kit: BASE, goal: 'nest' },
  { id: 'loft-without-kindle', room: 'lr-hall', from: ['hub', 'seal-foot'], kit: BASE, goal: 'find:h2' },
  {
    id: 'seal-without-m-s1',
    room: 'lr-hall',
    from: ['hub', 'seal-foot', 'tunnel-w'],
    kit: KINDLE,
    goal: 'lit:m-s2',
    stripLures: ['m-s1'],
  },
  {
    id: 'tunnel-without-m-c1',
    room: 'lr-hall',
    from: ['hub', 'tunnel-w'],
    kit: KINDLE,
    goal: 'gallery-w',
    stripLures: ['m-c1'],
  },
  {
    id: 'crest-without-the-chimney',
    room: 'lr-night',
    from: ['ridge', 'trunk', 'cap-side'],
    kit: GUST,
    goal: 'crest',
  },
  {
    id: 'curtain-without-gust',
    room: 'lr-hall',
    from: ['gallery-e', 'gallery-w'],
    kit: KINDLE,
    goal: 'flag:curtain-open',
  },
  {
    id: 'brambles-without-gust',
    room: 'lr-night',
    from: ['trunk', 'cap-side'],
    kit: KINDLE,
    goal: 'flag:bramble-a-out',
  },
  {
    id: 'vault-without-gust',
    room: 'lr-hall',
    from: ['gallery-w', 'roof'],
    kit: KINDLE,
    goal: 'flag:vault-open',
    byTime: true,
  },
  {
    id: 'flue-without-gust',
    room: 'lr-roots',
    from: ['pit'],
    kit: KINDLE,
    goal: 'find:h4',
    byTime: true,
  },
  {
    id: 'heartwood-without-the-ram',
    room: 'lr-roots',
    from: ['cistern-e', 'heartwood-top'],
    kit: GUST,
    goal: 'find:h3',
  },
  { id: 'cistern-without-the-boss', room: 'lr-roots', from: ['arena'], kit: KINDLE, goal: 'cistern-w' },
];
