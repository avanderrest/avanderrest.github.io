/* The floor has no grid, machines turn, and a crate left unopened is mentioned.

   Amber's notes (2026-10-14): place anything anywhere right of the counter, red and refused
   only where it would overlap another machine or the counter; a way to turn a machine; and
   a warning if the day starts with machines still boxed. The quiet failures are a quarter-
   tile spot that is refused for no reason, an overlap that is let through, a turned wide
   machine that keeps its old footprint, or a day opening on a crated machine with no word. */
const G = window.__coffeeRush;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
localStorage.clear();
G.setDay(5); G.openLayout();
const ids = G.unplaced().map((m) => m.id);
check('everything starts in its crate', ids.length >= 5, ids.join(','));

check('a spot off the grid is fine', G.place('espresso-1', 8.25, 4.5) === true, JSON.stringify(G.layout()['espresso-1']));
check('the counter is off limits', G.dropOk('cookie-1', 7.5, 6) === false);
check('and so is its front bar', G.dropOk('cookie-1', 9, 10) === false);
check('so is overlapping a machine', G.dropOk('cookie-1', 9, 4.5) === false);
// at the top of the floor, so turned two deep it still leaves the aisle behind the bar open
check('but right beside it is not', G.place('cookie-1', 10.25, 4) === true);

// a wide oven turned stands two deep, and keeps it in the save
const before = G.appliances().find((a) => a.id === 'cookie-1');
const w0 = before.w, h0 = before.h;
check('turning works', G.turn('cookie-1') === true);
const after = G.appliances().find((a) => a.id === 'cookie-1');
check('a turned wide oven stands two deep', after.w === h0 && after.h === w0, w0 + 'x' + h0 + ' -> ' + after.w + 'x' + after.h);
check('the turn is saved', (G.layout()['cookie-1'] || [])[2] === 1, JSON.stringify(G.layout()['cookie-1']));
G.openLayout();                     // rebuilds the floor from the save
const again = G.appliances().find((a) => a.id === 'cookie-1');
check('and comes back on a reload', again && again.turn === 1 && again.h === after.h, again ? again.turn + ' ' + again.w + 'x' + again.h : 'gone');

// a machine may stand partly behind the bar, so long as its cabinet's worktop stays behind
// the bar's top (its front lip may tuck behind): just behind it is fine, a quarter tile
// further down overlaps it
check('a machine just behind the bar is fine', G.dropOk('brownie-1', 9, 6.75) === true);
check('but not with its worktop over the bar', G.dropOk('brownie-1', 9, 7) === false);

// something you cannot reach is still refused: a spot with the back wall above, an oven to
// its left, the bin to its right and another oven across the front
G.place('brownie-1', 15, 4);
G.place('bin', 18, 4);
G.place('muffin-1', 16.75, 5);
check('a spot nobody can reach is refused', G.dropOk('milk-1', 17, 4) === false, JSON.stringify(G.layout()));
check('the same machine in the open is fine', G.place('milk-1', 17, 8) === true);
G.place('muffin-1', 18.5, 9.5);

// still a crate left: the doors do not open without a word
// leave the muffin oven boxed: take it back off the floor by resetting just its spot
delete G.layout()['muffin-1'];
G.openLayout();                     // rebuilt from the save: the muffin oven is back in its crate
const left = G.unplaced();
G.closeLayout();                    // back to the opening card, drawn fresh
const btn = document.getElementById('btn-start');
if (left.length) {
  btn.click();
  const warned = /crate/i.test(document.getElementById('overlay').textContent) && btn.textContent === 'Open anyway';
  check('a crate left unopened is mentioned before the day', warned && !G.state().running, btn.textContent + ' / running ' + G.state().running);
  btn.click();
  check('and Open anyway opens', G.state().running === true);
  G.endShift && G.endShift();
} else {
  check('a crate left unopened is mentioned before the day', false, 'nothing was left in a crate to test with');
}
// the cases share a page: leave the next one an empty floor on day 1
for (const k of Object.keys(G.layout())) delete G.layout()[k];
G.setDay(1);
G.openLayout(); G.closeLayout();
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
