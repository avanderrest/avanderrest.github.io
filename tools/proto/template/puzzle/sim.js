/* Puzzle shape — a small board you move around, collecting what a door needs before the
   moves run out. The game below is an example garden; replace the three maps with yours.

   What this shape is good at: discrete moves, a fixed board or levels, a budget of
   moves, no clock. There are no resources unless the puzzle needs one.

   The interface every sim.js must expose (see GUIDE.md):
     createGame({ seed, on }) -> { S, actions(), act(id), step(dt), text() }

   S: level, x, y, moves, keys, taken, over */

export const RULES = [
  'Every step costs one move, and waiting costs one too.',
  'Collect every key before the door will open.',
  'When the moves run out the garden keeps you.',
];

export const HINT = 'Arrow keys, WASD or the buttons move. The number keys work too.';

// ---------- the game ----------
// '#' a hedge, '.' a path, 'S' the way in, 'K' a key, 'D' the door.
export const LEVELS = [
  {
    moves: 18,
    map: [
      '#######',
      '#S..K.#',
      '#.###.#',
      '#..K..#',
      '#.###.#',
      '#....D#',
      '#######',
    ],
  },
  {
    moves: 26,
    map: [
      '#######',
      '#S#...#',
      '#.#.#.#',
      '#...#K#',
      '#.###.#',
      '#K...D#',
      '#######',
    ],
  },
  {
    moves: 16,
    map: [
      '#######',
      '#S....#',
      '#.###.#',
      '#.#K#.#',
      '#.#.#.#',
      '#K..D.#',
      '#######',
    ],
  },
];

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const at = (level, x, y) => {
  const row = LEVELS[level].map[y];
  return row && row[x] !== undefined ? row[x] : '#';
};

const keysIn = (level) => LEVELS[level].map.join('').split('K').length - 1;

export function createGame({ seed = 1, on = () => {} } = {}) {
  const S = {
    seed,
    level: 0,
    x: 0,
    y: 0,
    moves: 0,
    keys: 0,
    taken: [],
    over: null,
  };

  function say(text, tone = '') {
    on('say', { text, tone });
  }

  function place(level) {
    S.level = level;
    S.moves = LEVELS[level].moves;
    S.keys = 0;
    S.taken = [];
    for (let y = 0; y < LEVELS[level].map.length; y++) {
      const x = LEVELS[level].map[y].indexOf('S');
      if (x >= 0) {
        S.x = x;
        S.y = y;
        return;
      }
    }
  }

  const taken = (x, y) => S.taken.includes(x + ',' + y);
  const keyHere = (x, y) => at(S.level, x, y) === 'K' && !taken(x, y);

  function stepInto(id) {
    if (S.over) return { ok: false, why: 'the run is over' };
    if (S.moves <= 0) return { ok: false, why: 'no moves left' };

    if (id === 'wait') {
      S.moves -= 1;
      say('You wait.', '');
    } else {
      const d = DIRS[id];
      if (!d) return { ok: false, why: 'unknown direction' };
      const nx = S.x + d.x;
      const ny = S.y + d.y;
      const tile = at(S.level, nx, ny);
      if (tile === '#') return { ok: false, why: 'a hedge' };
      if (tile === 'D' && S.keys < keysIn(S.level)) {
        return { ok: false, why: `the door wants ${keysIn(S.level) - S.keys} more key${keysIn(S.level) - S.keys === 1 ? '' : 's'}` };
      }
      S.x = nx;
      S.y = ny;
      S.moves -= 1;

      if (keyHere(nx, ny)) {
        S.taken.push(nx + ',' + ny);
        S.keys += 1;
        say(`Key ${S.keys} of ${keysIn(S.level)}.`, 'good');
      }
      if (tile === 'D') {
        if (S.level + 1 < LEVELS.length) {
          say('The door opens. The next garden.', 'good');
          place(S.level + 1);
        } else {
          S.over = { id: 'out', name: 'Out of the garden', text: 'Every door, every key, and the hedge gives way.', win: true };
          say(S.over.text, 'good');
          on('ending', S.over);
        }
        return { ok: true };
      }
    }

    if (S.moves <= 0) {
      S.over = { id: 'kept', name: 'The garden keeps you', text: 'The last move is spent, and the hedges close in.', win: false };
      say(S.over.text, 'bad');
      on('ending', S.over);
    }
    return { ok: true };
  }

  function actions() {
    const list = [];
    for (const id of ['up', 'down', 'left', 'right']) {
      const d = DIRS[id];
      const nx = S.x + d.x;
      const ny = S.y + d.y;
      const tile = at(S.level, nx, ny);
      let why = '';
      if (S.over) why = 'the run is over';
      else if (tile === '#') why = 'a hedge';
      else if (tile === 'D' && S.keys < keysIn(S.level)) why = 'locked';
      list.push({ id, label: id[0].toUpperCase() + id.slice(1), note: 'one move', ok: !why, why });
    }
    list.push({ id: 'wait', label: 'Wait', note: 'one move', ok: !S.over, why: S.over ? 'the run is over' : '' });
    return list;
  }

  const act = (id) => stepInto(id);

  function text() {
    return JSON.stringify({
      seed: S.seed,
      level: S.level + 1,
      at: [S.x, S.y],
      moves: S.moves,
      keys: S.keys,
      over: S.over && S.over.id,
    });
  }

  place(0);
  say(`${LEVELS.length} gardens. Find the keys, then the door.`, 'phase');

  return {
    S,
    act,
    actions,
    step: () => {},
    text,
    level: () => LEVELS[S.level],
    keysIn: () => keysIn(S.level),
  };
}
