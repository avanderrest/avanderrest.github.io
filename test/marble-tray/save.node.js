/* What the tray keeps between visits, it keeps right.

   Marble Tray saves no game in progress, only the last game set out, how far through the
   mazes you have got and your best time on each. In Node: get through maze 3 in a set
   time, and the best and the next maze open up; a slower run keeps the old best; a faster
   one replaces it. Then a fresh tray built from a JSON copy of the store sets out the same
   game, at the same maze. */
import { createTray } from '../../marble-tray/sim.js';

const fresh = () => ({ mode: 'match', maze: { level: 0, reached: 0, best: {} } });

export default function () {
  const problems = [];
  const store = fresh();
  let saves = 0;
  const mt = createTray({ store, on: (ev) => { if (ev === 'save') saves++; } });
  mt.seedDice(1);
  mt.selectMode('maze');
  const through = (level, t) => {
    mt.startMaze(level);
    mt.maze.t = t;
    mt.mazeSunk(mt.holes.find((h) => h.goal));
  };
  through(2, 41.25);
  if (store.maze.best['2'] !== 41.25) problems.push(`best after the first run is ${store.maze.best['2']}`);
  if (store.maze.reached !== 3) problems.push(`reached is ${store.maze.reached}, not 3`);
  through(2, 55);
  if (store.maze.best['2'] !== 41.25) problems.push('a slower run replaced the best');
  through(2, 30.5);
  if (store.maze.best['2'] !== 30.5) problems.push('a faster run did not replace the best');
  if (store.mode !== 'maze' || store.maze.level !== 2) problems.push(`store says ${store.mode} at maze ${store.maze.level}`);

  const copy = JSON.parse(JSON.stringify(store));
  const again = createTray({ store: copy });
  again.selectMode(copy.mode);
  if (again.mode !== 'maze' || again.maze.level !== 2 || !again.maze.on) problems.push('a tray from the saved store did not set out maze 3');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `maze 3 best ${store.maze.best['2']}s after three runs, reached maze ${store.maze.reached + 1}, ${saves} saves asked for; a fresh tray set out maze ${again.maze.level + 1}`,
  };
}
