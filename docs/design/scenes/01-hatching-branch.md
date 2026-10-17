# Scene 1: the hatching branch

The first scene of the real game (room id `wood-hatch`). It is built and looped until it holds up next to the openings of
Ori and the Blind Forest, Hollow Knight and Nine Sols. Only then does scene 2 start. The story and the beats come from
`docs/design/journey.md` §2 (the opening), the look from `docs/design/look-and-sound.md`, and the bar from
`docs/art-direction.md`. Matt set the scope on 2026-10-17: get this one scene right first, then build out.

## What it is for
The first 30 seconds of the game. The player learns who Wing is (small, dark, alone, one of the moths), what she wants
(the swarm leaving without her), and how she moves (it feels wonderful to run and jump). It ends when she drops off the end of the branch after the swarm.
There are no lamps, enemies or text yet.

## Beats (targets, in seconds)
| t | Beat | Player |
|---|---|---|
| 0 | Black. Wind in the leaves (muted audio is fine). The picture fades up | nothing |
| ~3 | A high branch over a deep, dark wood at blue hour. A row of split, empty cocoons hangs along it, with one still closed. The real moon is high and cool. Far below and far off there's a faint warm afterglow on the horizon (the valley's lamps, unseen yet). **Tatter**, a moth of her kind with one torn wing, sits on the branch | watches |
| ~6 | The closed cocoon twitches. Each jump press shakes it harder | first input |
| ≤ 8 | The third press: she breaks out (silk and husk flakes, a small shake). **Control** | |
| ~10 | **The swarm** streams overhead past the moon: a river of small moths, leaving. The camera leans toward them | looks up, follows |
| 10–30 | She runs along the branch after them: a short, lovely run with a couple of small gaps and steps (twigs, a knot, a fork) that ask for a jump or two, and maybe one thorn to pogo. The swarm stays just ahead and above. Tatter watches her go and does not follow | runs, jumps |
| ~30 | The branch ends in the dark canopy. She drops off after the swarm: the exit | |

Until scene 2 exists, the exit fades to black and restarts the scene.

## Rules
- **Starting kit only:** run, variable jump, fast fall, the blade (forward, up, down), pogo. No glide, dash, double jump
  or wall jump. Abilities are gated in the sim (`docs/design/tech.md` stage 0).
- **The two lights:** the moon is the key light (cool silver-blue, from above, soft). Warm is reserved for lamps, so the
  only warm in this scene is that faint far afterglow. Wing's own light is pale silver-cream, and her gold eyes stay.
- **The scene is a place, not a level.** It's a branch high in an old wood with real depth below it (the far wood in
  fog, a mid layer of huge trunks, the drop beneath). The path reads at a glance: lit moss tops on the branch.
- **Size:** about 2 to 3 screens wide (1920x1080 each), mostly one horizontal line with some up and down. The camera
  frames the vista, not a corridor.
- **Story through staging, never cutscenes:** control comes by 8 s, input is held for at most 3 s at a time, and there are no letterboxes or text.

## Done means (the review agent judges each one against real Ori / HK / Nine Sols frames)
1. **A screenshot at any moment** could sit beside those games' opening screens: value ordering by depth, a readable
   path, nothing rectangular, a clear focal point, a cool moonlit palette with the far warm accent.
2. **A 10 s clip** of the break-out and the run feels fluid and alive. Nothing is still, the wind moves through the scene, and the
   camera is soft.
3. **The break-out** reads as a birth: the cocoon's motion, the husk, her first pose.
4. **The swarm** reads as a river of moths leaving, and it is beautiful (scale, flow, depth).
5. **Tatter** reads at once as one of her kind, hurt, left behind.
6. **Where to go** is obvious without text.
7. **Feel:** running and jumping along the branch is a pleasure (Ori standard).
8. `npm run check` passes, the debug API works, and the test grove is still reachable from the debug panel.
