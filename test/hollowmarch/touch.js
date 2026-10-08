/* A finger has no hover: the first tap on a cell must show its hint, and only a second tap
   on the same cell may build. A mouse still builds on one click.

   Each tap is a synthetic touch pointerdown followed by a click, the order a browser sends
   them in. Gold and the grid say whether anything was built. */
const H = window.__hollowmarch;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

H.newGame();
const S = H.state();
const cells = () => [...document.querySelectorAll('#board .cell, .cell')];
const tap = (i, type) => {
  const c = cells()[i];
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerType: type, bubbles: true }));
  c.click();
};
// two empty cells off the horde's path, so a wall is allowed on either
const free = [];
for (let i = 0; i < S.grid.length && free.length < 2; i++) if (!S.grid[i] && !cells()[i].disabled) free.push(i);
const [a, b] = free;
const gold0 = S.gold;

tap(a, 'touch');
const hint = document.getElementById('cell-hint').textContent;
check('the first tap builds nothing', !H.state().grid[a] && H.state().gold === gold0, 'gold ' + gold0 + ' -> ' + H.state().gold);
check('it shows the hint instead', /Build a/.test(hint) && /tap again/.test(hint), hint.slice(0, 60));
check('and marks the cell', cells()[a].classList.contains('armed'));

tap(b, 'touch');
check('a tap on another cell moves the mark, still building nothing', !H.state().grid[a] && !H.state().grid[b] && cells()[b].classList.contains('armed') && !cells()[a].classList.contains('armed'));

tap(b, 'touch');
check('the second tap on the same cell builds', !!H.state().grid[b] && H.state().gold < gold0, H.state().grid[b] + ', gold ' + H.state().gold);

tap(a, 'mouse');
check('a mouse click still builds at once', !!H.state().grid[a], String(H.state().grid[a]));

return JSON.stringify({ pass, detail: notes.join('; ') });
