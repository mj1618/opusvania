// Story loop round (kept in the repo so the loop can be resumed from any session).
// Run with the Workflow tool: { scriptPath: this file, args: { round, prev, prevReview, extra } }.
export const meta = {
  name: 'story-loop-round-v2',
  description: 'Story loop: revise from last review, a cutting editor simplifies, a naive reader retells it, a fresh director reviews',
  phases: [{ title: 'Revise' }, { title: 'Simplify' }, { title: 'Retell' }, { title: 'Review' }],
}
const ROOT = '/Users/matt/code/worktrees/opusvania/game-startup-1b5035/docs/story'
const BRIEF = `${ROOT}/brief.md`
const R = args.round
const STORIES = [
  { n: 1, slug: 'noise', title: 'NOISE' },
  { n: 2, slug: 'mouthless', title: 'MOUTHLESS' },
  { n: 3, slug: 'reply', title: 'REPLY' },
  { n: 4, slug: 'what-the-lanterns-burn', title: 'WHAT THE LANTERNS BURN' },
  { n: 5, slug: 'one-night', title: 'ONE NIGHT' },
].filter(s => !args.only || args.only.includes(s.slug))
const READERS = [
  { key: 'lore', who: 'You love Hollow Knight: you read every item description, chase every mystery, and hate being told what you could have found.' },
  { key: 'heart', who: 'You love Ori and the Blind Forest: you play for the feeling, you cried at the prologue, and you want characters to care about.' },
  { key: 'casual', who: 'You play a few games a year, mostly on a whim; you want to know what is going on and why you should care, fast.' },
]
const file = s => `${ROOT}/round-${R}/${s.n}-${s.slug}.md`

const results = await pipeline(
  STORIES,
  s => agent(
    `You are the writer of the game storyline ${s.title}. Read the brief ${BRIEF} IN FULL and the locked decisions ${ROOT}/locked.md (frozen: refine within them; you may only PROPOSE changes to them in a closing "Proposed changes to locked decisions" note) (the anchor at the top is non-negotiable: a biological AI that took over the world is the central, on-screen, active antagonist; then the owner's ideas, his notes on relationships and balance, what exists in the game, and the bar: Ori / Hollow Knight / Nine Sols). Read the current version ${ROOT}/${args.prev}/${s.n}-${s.slug}.md and its latest review ${ROOT}/${args.prevReview}/${s.n}-${s.slug}.md${args.prevRetell ? ` and the first-time readers' retellings in ${ROOT}/${args.prevRetell}/ (files starting ${s.n}-${s.slug}) (anything the reader got wrong or found confusing is a clarity bug)` : ''}.
Fix every problem the review raises (foundation first, then must-fix polish), keeping what it says works. Prefer fixes that REMOVE or merge a rule over fixes that add one. Keep the AI on screen and active in every act, the relationships felt through play.${args.extra ? ' ORCHESTRATOR FOCUS: ' + args.extra : ''}
Keep the file's format: LITMUS line, spine in three plain sentences, central question, cast table (including the AI), then the story; end with "Changes this round". Write to ${file(s)}. Return 3 lines on what changed.`,
    { label: `revise:${s.slug}`, phase: 'Revise' }
  ).then(() => s),
  s => agent(
    `You are a cutting editor. Your only job is clarity: make ${file(s)} easier to understand and retell WITHOUT losing any story beat, relationship moment, ending, or the anchor (the biological AI that took over the world, on screen and active). Read the brief ${BRIEF} first for context.
Do, in the file itself (edit in place):
- Count proper names and invented terms. Keep at most 6 proper names; turn other coined terms into plain words unless the term is load-bearing.
- Count the rules a player must learn. Merge or cut until there are at most 5, each stated once in plain words in one place; remove every other place that re-explains a rule.
- Cut sentences that explain what a scene already shows; cut dev notes except one about the real-world lineage.
- Fix any sentence a first-time reader would have to read twice.
- Target 2,200–2,700 words.
Append a short "Editor's cuts" list (names before/after, rules before/after, word count before/after). Return those three numbers.`,
    { label: `simplify:${s.slug}`, phase: 'Simplify' }
  ).then(() => s),
  s => parallel(READERS.map(rd => () => agent(
    `You are a player who has never heard of this game. ${rd.who} Read ONLY ${file(s)} once, carefully, then without looking back write:
1. The story in three plain sentences, as you'd tell a friend.
2. Who the characters are and what each wants, one line each.
3. What the enemy is, what it did to the world, and what it wants.
4. How it ends (each ending in one line).
5. Anything that confused you, that you had to re-read, or that seemed to contradict itself (be specific).
6. One moment you'd remember a week later, and whether this story would make YOU buy and finish the game (yes/no, why).
Do not read any other file. Write ~250–400 words to ${ROOT}/round-${R}-retell/${s.n}-${s.slug}-${rd.key}.md and return items 1, 5 and 6.`,
    { label: `retell:${s.slug}:${rd.key}`, phase: 'Retell' }
  ))).then(() => s),
  s => agent(
    `You are the narrative director of a studio that shipped a game at the level of Ori and the Will of the Wisps, Hollow Knight or Nine Sols, reviewing with fresh eyes (do not read earlier rounds or reviews). Read the brief ${BRIEF} IN FULL, then ${file(s)}, then three first-time readers' retellings of it, ${ROOT}/round-${R}-retell/${s.n}-${s.slug}-lore.md, -heart.md and -casual.md (a Hollow Knight lore-hunter, an Ori fan who plays for feeling, a casual player; where a reader got it wrong or was confused, the story failed, not the reader; weigh what each would remember and whether each would finish the game).
1. ANCHOR GATE (strict): PASS/FAIL per the brief's LITMUS (a player's first sentence names a little moth against a living thing that swallowed the world; that it is a brain grown from living cells is central and discoverable in play), with it the central, on-screen, active antagonist at world scale in every act. Rate the owner's four ideas: central / minor / missing.
2. CRAFT VERDICT: GREENLIGHT / GREENLIGHT WITH NOTES / SEND BACK, as for production in that tier. Only foundation problems block. Anchor FAIL = SEND BACK.
3. What is at the bar (3–5 bullets with quotes).
4. Problems ranked (max 6), each with a concrete fix that does not add a rule if it can avoid it; mark FOUNDATION or POLISH.
5. Scores 1–10: anchor, relationships, clarity (weigh the retelling heavily), idea, world, mechanics-as-theme, antagonist, ending, originality, Grove fit, balance.
6. AT THE BAR? yes/no: would you put this outline next to Ori / Hollow Knight / Nine Sols's story as an equal? If no, the single biggest gap.
Write ~600–850 words to ${ROOT}/round-${R}-review/${s.n}-${s.slug}.md. Return the gate line, verdict, scores line, AT THE BAR line, and foundation problems if any.`,
    { label: `review:${s.slug}`, phase: 'Review' }
  )
)
return results
