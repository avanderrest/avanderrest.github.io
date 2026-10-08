/* The on-screen pad shows on a touch screen, and holding it walks the barista.

   The pad's markup and wiring survived a rewrite once while the one CSS rule that shows
   it did not, so on a tablet the game had no way to move at all and nothing failed. This
   reads the stylesheet for that rule (the cases run without touch emulation, so the pad
   itself is hidden here), then holds the pad's right arrow through the real pointer
   handlers and checks the player went right. */
return (async () => {
  const C = window.__coffeeRush;
  const notes = [];
  let pass = true;
  const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

  // a touch media rule that sets .touch to display: flex
  let shown = false;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSMediaRule) || !/coarse/.test(r.conditionText || r.media.mediaText)) continue;
      for (const inner of r.cssRules) if (inner.selectorText === '.touch' && inner.style.display === 'flex') shown = true;
    }
  }
  check('a touch screen shows the pad', shown);

  C.openLayout();
  for (const m of C.unplaced()) C.place(m.id, 7 + (C.unplaced().indexOf(m) * 2), 4);
  C.closeLayout();
  document.getElementById('btn-start').click();
  const S = C.state();
  check('the shift starts', S.running);
  const x0 = S.player.x;
  const right = document.querySelector('#touch [data-key="ArrowRight"]');
  right.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true }));
  C.step(0.6);
  right.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
  const x1 = S.player.x;
  C.step(0.3);
  check('holding the pad\'s right arrow walks right', x1 > x0 + 20, Math.round(x0) + ' -> ' + Math.round(x1));
  check('and letting go stops', Math.abs(S.player.x - x1) < 8, Math.round(x1) + ' -> ' + Math.round(S.player.x));

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
