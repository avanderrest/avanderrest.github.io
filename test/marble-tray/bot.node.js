/* A match and a game of bowls each come to an end, with the scores they should have.

   In Node, through the real tray (`tick`, the same frame the page runs):

   - A match where you never touch the keys. The computer's shooter has the tray to itself,
     so it has to pot marbles, and when it stalls the tray's own shakes and the give-up rule
     have to unstick whatever is left: the match must end with every marble accounted for.
     (Not with the computer ahead: a ringed hole pays whoever owns the ring, so a computer
     potting alone still scores for you.) (A match that could never end once shipped: corner.js.)
   - A game of bowls against the keenest computer, where your bowls are rolled by a player
     who only ever draws to the button, at the weight the physics says stops there. It has
     to finish (first to five), with the computer, who also fires through your bowls,
     the likelier winner, and every end scored for one side.

   Three seeds of dice each. The maze has its own page case (maze.js), which takes minutes. */
import { createTray } from '../../marble-tray/sim.js';

const DT = 1 / 60;

function tray(seed) {
  const store = { mode: 'match', maze: { level: 0, reached: 0, best: {} } };
  const mt = createTray({ store });
  mt.seedDice(seed);
  return mt;
}

function playMatch(seed) {
  const mt = tray(seed);
  mt.match.level = mt.AI_LEVELS.length - 1;
  mt.selectMode('match');
  mt.startMatch(true);
  const total = mt.inPlay().length;
  let t = 0;
  while (!mt.match.over && t < 900) { mt.tick(DT, t * 1000); t += DT; }
  return { seed, over: mt.match.over, t: Math.round(t), you: mt.match.you, ai: mt.match.ai, left: mt.inPlay().length, total, shakes: mt.match.shakes || 0 };
}

function playBowls(seed) {
  const mt = tray(seed);
  mt.match.level = mt.AI_LEVELS.length - 1;
  mt.selectMode('bowls');
  const { bowls, HOUSE, MAT_X, FLICK_MAX } = mt;
  let t = 0, ends = 0, lastEnd = 0;
  while (!bowls.over && t < 1500) {
    if (bowls.phase === 'aim' && bowls.turn === 'you' && bowls.cur) {
      const b = bowls.cur, dx = HOUSE.x - MAT_X, dy = HOUSE.y - b.y, d = Math.hypot(dx, dy);
      const sp = Math.min(FLICK_MAX, Math.sqrt(2 * b.k.roll * d));
      mt.throwBowl(dx / d * sp, dy / d * sp);
    }
    mt.tick(DT, t * 1000);
    t += DT;
    if (bowls.end !== lastEnd) { lastEnd = bowls.end; ends++; }
  }
  return { seed, over: bowls.over, t: Math.round(t), you: bowls.you, ai: bowls.ai, ends: bowls.end };
}

export default function () {
  const matches = [1, 2, 3].map(playMatch), games = [1, 2, 3].map(playBowls);
  const problems = [];
  for (const m of matches) {
    if (!m.over) problems.push(`match seed ${m.seed}: still going after ${m.t}s, ${m.left} of ${m.total} left`);
    else if (m.you + m.ai + m.left !== m.total) problems.push(`match seed ${m.seed}: ${m.you} + ${m.ai} scored and ${m.left} left of ${m.total}`);
  }
  for (const g of games) {
    if (!g.over) problems.push(`bowls seed ${g.seed}: still going after ${g.t}s (${g.you}-${g.ai}, end ${g.ends})`);
    else if (Math.max(g.you, g.ai) < 5) problems.push(`bowls seed ${g.seed}: ended at ${g.you}-${g.ai}`);
  }
  const aiWins = games.filter((g) => g.ai > g.you).length;
  if (aiWins < 2) problems.push(`the keenest computer won only ${aiWins} of 3 at bowls against a player who only draws`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      'match: ' + matches.map((m) => `seed ${m.seed} ${m.you}-${m.ai} in ${m.t}s`).join(', ') +
      '; bowls: ' + games.map((g) => `seed ${g.seed} ${g.you}-${g.ai} over ${g.ends} ends`).join(', '),
  };
}
