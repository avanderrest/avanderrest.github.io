/* What Blackout keeps, it keeps right: the bests between visits, and the checkpoint
   within a run.

   Between visits (blackout-save-v4) there is only a record: the fewest moves per mission
   and difficulty, how many missions are open, the last one played, and the wins. In Node,
   against an in-memory store: a v3 save's bests land on the first mission and its win
   opens the second; a win sets a best and opens the next mission; a slower win keeps the
   best, a faster one replaces it; starting a mission writes it down as the last played.

   Within a run, the download is a checkpoint: change everything after it (move, spend
   rounds, get hurt, raise the stakes) and restoring puts it all back, guards included. */
import { createBlackout, freshRecords, fromV3 } from '../../blackout/sim.js';

export default function () {
  const problems = [];
  let stored = JSON.stringify(freshRecords());
  const records = { load: () => JSON.parse(stored), write: (r) => { stored = JSON.stringify(r); } };
  const bo = createBlackout({ records });
  bo.seedDice(3);

  const v3 = fromV3({ best: { normal: 80, hard: null }, wins: 2 }, bo.MISSIONS[0].id);
  if (v3.best[bo.MISSIONS[0].id].normal !== 80 || v3.unlocked !== 2) problems.push(`v3 carried as ${JSON.stringify(v3)}`);
  if (fromV3({ best: {} }, 'x').unlocked !== 1) problems.push('a v3 save with no wins opened a mission');

  const winIn = (mi, moves) => {
    bo.newGame('normal', mi);
    bo.begin();
    bo.state.moves = moves;
    bo.win();
    return records.load();
  };
  let rec = winIn(1, 140);
  const depot = bo.MISSIONS[1].id;
  if (rec.best[depot].normal !== 140) problems.push(`first win kept ${rec.best[depot].normal}`);
  if (rec.unlocked !== 3) problems.push(`winning mission 2 opened ${rec.unlocked}, not 3`);
  if (rec.last !== 1) problems.push(`last played is ${rec.last}`);
  if (!bo.state.newBest) problems.push('a first win was not a new best');
  rec = winIn(1, 170);
  if (rec.best[depot].normal !== 140 || bo.state.newBest) problems.push('a slower win replaced the best');
  rec = winIn(1, 120);
  if (rec.best[depot].normal !== 120) problems.push('a faster win did not replace the best');
  if (rec.unlocked !== 3 || rec.wins !== 3) problems.push(`after three wins: unlocked ${rec.unlocked}, wins ${rec.wins}`);

  // the checkpoint, within a run
  bo.newGame('normal', 0);
  bo.begin();
  bo.flush();
  const S = bo.state;
  const before = JSON.stringify({ p: [S.player.x, S.player.y, S.player.lv], hp: S.hp, rounds: S.rounds, g: S.guards.map((g) => [g.x, g.y, g.lv, g.mode]), data: S.dataDone });
  bo.takeCheckpoint();
  S.player.x += 1; S.hp = 1; S.rounds = 0; S.dataDone = true;
  for (const g of S.guards) { g.x = 0; g.mode = 'hunt'; }
  bo.restoreCheckpoint();
  const T = bo.state;
  const after = JSON.stringify({ p: [T.player.x, T.player.y, T.player.lv], hp: T.hp, rounds: T.rounds, g: T.guards.map((g) => [g.x, g.y, g.lv, g.mode]), data: T.dataDone });
  if (after !== before) problems.push(`the checkpoint came back different: ${before} vs ${after}`);
  if (T.mode !== 'play') problems.push(`after restoring the mode is ${T.mode}`);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `v3 best 80 carried to ${bo.MISSIONS[0].id}; ${depot}: best ${rec.best[depot].normal} after wins in 140, 170, 120; ` +
      `${rec.unlocked} missions open, ${rec.wins} wins; the checkpoint restored ${S.guards.length} guards and the player exactly`,
  };
}
