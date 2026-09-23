/* Light is the whole game, so this pins down the rule the rest of it rests on: past a
   couple of paces, a guard sees a lit man and does not see a dark one.

   It breaks silently in both directions. Invert the comparison and the game is
   unplayable but looks identical — torch cones still sweep, guards still walk. Drop the
   wall check out of the line of sight and guards see you through the compound wall, which
   also looks like nothing at all until you wonder why you keep being caught.

   The geometry is held still and only the light level moves, so a failure here is about
   the rule and not about where anything happens to be standing. */
const B = window.__blackout;
const C = B.consts;
B.newGame();

const DARK = C.DARK_ENOUGH;
// Out on the open approach, where there is nothing between him and the target: put him
// in the yard and the service door sits in the line and the whole measurement is of a
// door instead. Light is the only thing allowed to vary here.
const guard = { x: 8, y: 15, dir: 1 };            // on the ground, facing right
const AHEAD = [13, 14];                           // five paces in front of him
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };

const sees = (x, y, light) => B.guardSees(guard, x, y, light);

check('lit man is seen', sees(AHEAD[0], AHEAD[1], 0.9) > 0);
check('dark man is not', sees(AHEAD[0], AHEAD[1], 0.03) === 0);
check('just under the threshold hides', sees(AHEAD[0], AHEAD[1], DARK - 0.02) === 0);
check('just over it does not', sees(AHEAD[0], AHEAD[1], DARK + 0.02) > 0);
check('brighter is more visible',
  sees(AHEAD[0], AHEAD[1], 0.95) > sees(AHEAD[0], AHEAD[1], 0.35));
check('closer is more visible',
  sees(10, 14, 0.9) > sees(15, 14, 0.9));
check('behind him is safe at any light', sees(3, 14, 1) === 0);
check('beyond the torch is safe', sees(guard.x + C.CONE_RANGE + 1.5, 14, 1) === 0);
// stood on his toes in the pitch dark, he still notices
check('but not at arm reach', sees(9, 14, 0.0) > 0);

// the compound wall stands at x=26 and light does not go through masonry
const atWall = { x: 24, y: 15, dir: 1 };
check('wall blocks the torch', B.guardSees(atWall, 28, 14, 0.95) === 0);
check('same range with nothing between', B.guardSees({ x: 4, y: 15, dir: 1 }, 8, 14, 0.95) > 0);

// A torch is light. Without that, dark stayed cover with the beam full on you: you
// could stand upright beside the yard crates in a guard's torch and he walked on. Stood
// up there he has to notice you; crouched behind them the crate has to take the beam.
function behindCrates(crouch) {
  B.newGame();
  B.start();
  const g = B.guards.find((q) => q.card);
  B.guards.forEach((q) => { if (q !== g) q.x = -20; });
  B.teleport(29.3, 15);
  B.hold('down', crouch);
  B.tick(1 / 60, 5);
  let most = 0;
  for (let i = 0; i < 120; i++) {           // two seconds of him standing there facing you
    g.x = 33; g.dir = -1; g.state = 'look'; g.timer = 0;
    B.tick(1 / 60, 1);
    most = Math.max(most, g.susp);
  }
  B.hold('down', false);
  return most;
}
const standingBy = behindCrates(false);
const crouchedBehind = behindCrates(true);
check('stood up by the crates, his torch finds you', standingBy > C.SUSPECT);
check('crouched behind them, it does not', crouchedBehind === 0);
B.newGame();

// And the lamps themselves. Taken off the live list rather than written down
// here, because the lamps get moved about whenever the level is retuned and a
// test that pins them to a coordinate only ever measures the coordinate.
const firstLamp = B.state.lamps[0];
const underLamp = B.lightAt(firstLamp.x, 13.9);       // stood right under it
const outOnTheApproach = B.lightAt(4, 13.9);          // off at the extraction end
const atTheLadder = B.lightAt(60.5, 13.9);            // the shaft, kept dark on purpose
check('under a lamp you are plainly lit', underLamp > DARK * 3);
check('the far end of the approach is dark', outOnTheApproach < DARK);
check('and the ladder foot is darker still', atTheLadder < outOnTheApproach);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | threshold ' + DARK
    + ', lamp ' + underLamp.toFixed(2) + ', approach ' + outOnTheApproach.toFixed(2)
    + ', ladder ' + atTheLadder.toFixed(2),
});
