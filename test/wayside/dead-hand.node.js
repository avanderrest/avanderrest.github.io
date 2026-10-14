/* A hand of nothing but action cards can still be played.

   Every action card swaps one of your other cards, so three of them together (three
   Sliplines, about 1 in 12,000) once stopped a walk for good: nothing could be laid and
   nothing could be played. Now an action card picked with nothing to give goes back in the
   deck for a fresh one. This deals that hand and checks a few picks get back to a card that
   can be laid. */
import { createWayside, CARDS } from '../../wayside/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const out = [];
  for (const hand of [['slip', 'slip', 'slip'], ['rework', 'slip', 'cross']]) {
    const w = createWayside({ seed: 5, rnd: mulberry32(5), best: {}, on: () => {} });
    w.newGame('solo', null, 5);
    w.S.hand = hand.slice();
    let picks = 0;
    while (w.S.hand.every((k) => CARDS[k].kind === 'action') && picks < 20) { w.handPick(picks % 3); picks++; }
    const playable = w.S.hand.some((k) => CARDS[k].kind !== 'action');
    out.push({ hand: hand.join('+'), picks, playable, now: w.S.hand.join('+') });
  }
  return {
    pass: out.every((o) => o.playable),
    detail: out.map((o) => `${o.hand}: ${o.playable ? 'playable' : 'STILL STUCK'} after ${o.picks} pick${o.picks === 1 ? '' : 's'} (${o.now})`).join('; '),
  };
}
