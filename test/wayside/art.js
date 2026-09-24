/* Every card, item and ground the game can show has a picture.

   Wayside's art is hand-typed pixel rows in sprites.js, looked up by name. Ask for
   a name that is not there and you get a blank tile, not an error — and every
   lighthouse lit adds a card to the deck, so a new card can go in with a typo in
   its sprite name and only show up as an empty square forty lamps into someone's
   save.

   So this draws every sprite the game names — each card face up and spent, each
   item, each ground — and requires ink on it, and checks that every card the deck
   can ever deal, with every lamp lit, is a card the game has. */
return (() => {
  const W = window.__wayside;
  const A = window.WaysideArt;
  const problems = [];

  const inked = (canvas) => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  };
  const names = new Map();                 // sprite name -> who asked for it
  const bases = new Map();
  const want = (m, name, who) => { if (name && !m.has(name)) m.set(name, who); };
  for (const [id, c] of Object.entries(W.CARDS)) {
    want(names, c.sprite, `card ${id}`);
    if (c.spent) want(names, c.spent.sprite, `card ${id} (spent)`);
    want(bases, c.base, `card ${id}`);
  }
  for (const [id, it] of Object.entries(W.ITEMS)) want(names, it.sprite, `item ${id}`);

  let blank = 0;
  for (const [name, who] of names) {
    const px = inked(A.sprite(name));
    if (px === 0) { blank++; problems.push(`${who}: sprite "${name}" draws nothing`); }
  }
  for (const [name, who] of bases) {
    if (inked(A.base(name)) === 0) problems.push(`${who}: ground "${name}" draws nothing`);
  }

  // the deck, with every lamp ever lit
  const was = W.BEST.lampsEver || 0;
  W.setLampsEver(99);
  const dealt = W.deck().map(([id]) => id);
  W.setLampsEver(was);
  for (const id of dealt) if (!W.CARDS[id]) problems.push(`the deck can deal "${id}", which is not a card`);
  for (const lc of W.LAMP_CARDS) if (!dealt.includes(lc.id)) problems.push(`lamp card ${lc.id} never reaches the deck`);

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '')
      + `${names.size} sprites and ${bases.size} grounds drawn, ${blank} blank; deck of ${dealt.length} kinds with every lamp lit`,
  });
})();
