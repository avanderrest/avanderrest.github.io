/* A match waits for Play.

   Setting out a match puts the marbles down and then holds everything still under
   a Play button in the middle of the tray; the 3, 2, 1 only start once it is pressed.
   Claims: while waiting the countdown does not move and the button is showing and
   centred on the tray; after the press the countdown runs and the button has gone. */
return (async () => {
  const T = window.__tray;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  T.setMode('match');
  await wait(600);
  const btn = document.getElementById('btn-play');
  const c0 = T.match.count;
  const shown = !btn.hidden;
  const b = btn.getBoundingClientRect(), t = document.getElementById('tray').getBoundingClientRect();
  const off = Math.hypot((b.left + b.right) / 2 - (t.left + t.right) / 2, (b.top + b.bottom) / 2 - (t.top + t.bottom) / 2);
  btn.click();
  await wait(600);
  const c1 = T.match.count;
  const pass = shown && c0 === 4 && off < 3 && c1 < c0 && btn.hidden && !T.match.waiting;
  return JSON.stringify({ pass, detail: `button shown while waiting: ${shown}, count held at ${c0}, ${Math.round(off)}px off centre; after Play count ${c1.toFixed(2)}, button hidden: ${btn.hidden}` });
})();
