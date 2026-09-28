/**
 * The proof route (north star §2.1), played blind-free by the route driver: T02 -> T03 -> T04 ->
 * T05 -> T09 -> T04 (roof bolt) -> hatch -> C01 -> C02 (round door). World tiles.
 */
import type { Route } from '../route';

export const start = 'tally-yard';

export function route(r: Route): void {
  // T02 Evictions Yard: the cart, the crates on the plank bridge, the chair spring over the wall.
  r.walk(13.4).act('S').note('cart seized');
  r.walk(27.4).act('S').note('crates seized');
  r.walk(44.4).act('S').note('chair seized');
  r.act('V').until('levyLand').note('chair levied: spring');
  r.walk(46.6).land(200, 'R').note('over the wall');

  // T03 Rag Market: stall creak -> spring over gutter 1 onto the boardwalk.
  r.walk(71.4).expectRoom('tally-market').act('S').note('stall A seized');
  r.walk(73.5).act('V').until('levyLand').note('spring thrown');
  r.walk(80).land(200, 'R').note('gutter 1');
  r.walk(100.5).land(200, 'R').note('off the boardwalk');
  r.walk(107).land(200, 'R').note('through the foreclosed shopfront, into its cellar');
  r.walk(108.5).jump('R', 20).note('out of the cellar');
  r.act('S').note('stall B seized');
  r.walk(115.5).act('V').until('levyLand').note('spring thrown');
  r.walk(124).land(200, 'R').note('onto the awning');
  r.jump('R', 16).note('over gutter 2');

  // T04 Tally Cross: the lane bursts into the square; the Corner stool; east through the arcade.
  r.walk(188, { hop: true }).expectRoom('tally-cross').note('at the Corner stool');
  r.walk(236).note('the arcade under the stand');

  // T05 Pawn Row: up the grades, the pawnbroker's cellar door, the brass-ball chain.
  r.walk(250, { hop: true }).expectRoom('tally-pawnrow').note('Pawn Row');
  r.walk(265, { hop: true }).note('on the flat -4');
  r.walk(300, { hop: true }).note('pawnbroker');
  r.walk(341.3).act('S').note('chain seized');
  r.walk(346.5).jump('R', 14).note('stair step');
  r.walk(351.3).jump('R', 16, 12).note('stair ledge');
  r.jump('R', 32, 8).expectRoom('tally-chimneys').note('up the neck onto the roofs');
  r.jump('L', 20).note('on the roofs');

  // T09 Chimney Walk: west over pots, a gable and two light wells (pogo the weathervane), to the bolt.
  r.walk(341.5).jump('L', 10).note('chimney pot');
  r.walk(334).jump('L', 8).note('gable');
  r.walk(322.6).jump('L', 20).note('light well 1');
  r.walk(309.5).jump('L', 14).note('chimney pot');
  r.walk(298.6)
    .play('L+J16 L6')
    .hold('L+D+A', () => r.sim.view.vy < -4 || r.sim.view.grounded, 60, 'pogo')
    .land(200, 'L')
    .note('light well 2 (pogo)');
  route2(r);
}

export function route2(r: Route): void {
  r.walk(279.5).jump('L', 12).note('chimney pot');
  r.walk(267, { hop: true }).jump('L', 20).note('step -24');
  r.walk(263).jump('L', 20).note('the -28 block');
  r.walk(236).expectRoom('tally-cross').note('the roof-bolt ledge above the Cross');
  r.walk(234.8).act('S').walk(231).land(300).note('bolt seized: plunge onto the gallery');
  r.walk(222).land(200, 'L').note('down the stand');
  r.walk(214).land(200, 'L');
  r.walk(208).land(200, 'L').note('the square floor');
  r.walk(168.8)
    .act('S')
    .walk(166)
    .land(400)
    .expectRoom('cellars-slide')
    .note('hatch seized: the floor vanishes');

  // C01 Spoil Slide: down the spoil (stairs until slopes land), hopping rubble, through the neck.
  r.walk(275, { hop: true }).expectRoom('cellars-scale').note('through the neck at speed');

  // C02 Great Scale Hall: the furnace's two roars, the pan, shed a weight, the weigh-plate, the door.
  r.walk(285.3).act('S').note('firebox seized');
  r.walk(291.3).act('S').note('ash door seized: heavy');
  r.walk(300).wait(20).note('on the pan');
  r.walk(306).act('V').until('levyLand').note('shed a weight');
  r.walk(311, { hop: true }).walk(320.5).jump('R', 20, 22).note('far step 1');
  r.jump('R', 20, 22).note('far step 2');
  r.jump('R', 20, 22).note('terrace');
  r.walk(369).act('V').until('levyLand').note('levy the roar onto the weigh-plate');
  r.walk(384, { hop: true }).until('goal', 'R', 120).note('through the round door: end of the proof');
}
