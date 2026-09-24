/* Is the compound actually crossable?

   The failure this catches is the quiet one: a crate stacked two high, a duct placed a row
   too low, a slab that closes over the ladder shaft. None of it looks wrong on screen — the
   level renders perfectly and you simply cannot get to the terminal, and you only find out
   by playing the whole thing.

   So rather than drive the player, this walks the tile grid with exactly the moves the game
   gives you: step along a supported floor, haul yourself up one tile (standing only, never
   two), walk off a ledge and fall, climb a ladder, and change stance where there is headroom.
   Anything reachable in here is reachable with the keys.

   It also checks the ducts are load-bearing: with crouching taken away the compound must be
   shut, or the perimeter wall is decoration. */
const B = window.__blackout;
const C = B.consts;
B.newGame();
B.openDoor();          // the keycard is a separate question; this one is geometry
B.start();

const W = C.MAP_W, H = C.MAP_H;
const LADDER = C.tiles.LADDER;

// free = the body fits here. A standing man needs the tile above his feet too.
const free = (x, y, cr) => {
  if (x < 0 || y < 1 || x >= W || y >= H) return false;
  if (B.solidFor(x, y, cr)) return false;
  if (!cr && B.solidFor(x, y - 1, false)) return false;
  return true;
};
const supported = (x, y) => B.tileAt(x, y) === LADDER || B.solidFor(x, y + 1, false);

function reach(allowCrouch, from) {
  const seen = new Set();
  const key = (x, y, c) => x + ',' + y + ',' + (c ? 1 : 0);
  const start = from || [6, 14, false];   // default: where the mission starts you, standing
  const q = [start];
  seen.add(key(start[0], start[1], start[2]));
  const push = (x, y, c) => {
    if (!free(x, y, c)) return;
    const k = key(x, y, c);
    if (seen.has(k)) return;
    seen.add(k);
    q.push([x, y, c]);
  };
  for (let head = 0; head < q.length; head++) {
    const [x, y, cr] = q[head];
    if (allowCrouch) push(x, y, !cr);                       // stand up / go to ground
    for (const d of [-1, 1]) {
      if (free(x + d, y, cr) && supported(x + d, y)) push(x + d, y, cr);
      if (!cr && free(x + d, y - 1, cr) && supported(x + d, y - 1)) push(x + d, y - 1, cr);
      if (free(x + d, y, cr) && !supported(x + d, y)) {      // off the edge, and down
        let ny = y;
        while (ny + 1 < H && !supported(x + d, ny) && free(x + d, ny + 1, cr)) ny++;
        if (supported(x + d, ny)) push(x + d, ny, cr);
      }
    }
    if (B.tileAt(x, y) === LADDER) {
      for (const d of [-1, 1]) if (free(x, y + d, cr)) push(x, y + d, cr);
    }
  }
  return seen;
}

const has = (set, x, y) => set.has(x + ',' + y + ',0') || set.has(x + ',' + y + ',1');

const full = reach(true);
const noCrouch = reach(false);

// the terminal takes a keypress from a body standing on the upper slab beside it
const termX = Math.round(C.TERMINAL.x);
const atTerminal = [termX - 1, termX, termX + 1].filter((x) => has(full, x, 9));
// The way out is the far left of the ground, and it has to be reachable *from the
// terminal*, not from the start: the walk out runs the other way over everything, and
// a crate stair that climbs one tile at a time going in can be a two-tile wall coming
// back. Reachable-from-the-start says nothing about that, since you start next to it.
const home = reach(true, [termX, 9, false]);
const atExit = [2, 3, 4].filter((x) => has(home, x, 14));

const insideYard = has(full, 34, 14);
const onUpper = has(full, 75, 9);
const yardWithoutCrouching = has(noCrouch, 34, 14);
const termWithoutCrouching = [termX - 1, termX, termX + 1].some((x) => has(noCrouch, x, 9));

const notes = [
  'cells reachable ' + full.size,
  'yard ' + insideYard,
  'upper floor ' + onUpper,
  'terminal cells [' + atTerminal.join(',') + ']',
  'exit cells [' + atExit.join(',') + ']',
  'without crouching: yard ' + yardWithoutCrouching + ', terminal ' + termWithoutCrouching,
];

const pass = insideYard && onUpper && atTerminal.length > 0 && atExit.length > 0 &&
  !yardWithoutCrouching && !termWithoutCrouching;

return JSON.stringify({ pass, detail: notes.join(' | ') });
