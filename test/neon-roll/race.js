/* Race on the page: one screen while close, a half each when far apart, and a winner.

   Drives the debug handle: starts a race, puts the second ball a long way back (the screen
   splits), brings it back alongside (one screen again), then carries the first ball over the
   line and checks the card names it, and that W/arrow keys reach the right balls. */
const N = window.__neonRoll;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
N.setMode('race');
N.start('race', { seed: 404 });
check('both balls roll', N.state.phase === 'run' && N.state2.phase === 'run');
// the keys: W is the first ball's, an arrow the second's
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
key('keydown', 'KeyW');
const w = [N.state.held, N.state2.held];
key('keyup', 'KeyW'); key('keydown', 'ArrowUp');
const arrow = [N.state.held, N.state2.held];
key('keyup', 'ArrowUp');
check('W rolls cyan, an arrow rolls orange', w[0] && !w[1] && !arrow[0] && arrow[1], JSON.stringify({ w, arrow }));
N.step(14);                               // a few hundred metres in, so there is track behind
const b = N.state2.ball;
b.x = N.state.ball.x - 9000; b.y = N.ground(b.x).y; b.on = true;
N.step(0.2);
check('far apart, the screen splits', N.race.split === true, Math.round((N.state.ball.x - b.x) / 40) + ' m apart');
check('and the one behind is pushed', N.state2.buff > 1 && N.state.buff < 1, N.state.buff.toFixed(3) + ' / ' + N.state2.buff.toFixed(3));
b.x = N.state.ball.x - 80; b.y = N.ground(b.x).y; b.on = true;
N.step(0.2);
check('close again, one screen', N.race.split === false);
// over the line
const a = N.state.ball;
N.state.track.extend(1500 * 40 + 2000); N.state2.track.extend(1500 * 40 + 2000);
a.x = 1500 * 40 - 300; a.y = N.ground(a.x).y; a.on = true;
N.step(1.5);
const title = document.getElementById('panel-title').textContent;
check('the first over the line wins', N.state.phase === 'over' && N.state2.phase === 'over' && /Cyan wins/.test(title), title);
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
