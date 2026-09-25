/* Wren only kills if the player chose to pick up a knife.

   - A new run carries no knife: Q behind a guard does nothing, E still chokes him out,
     and there is no pulling a guard off his ledge.
   - The knife rack in the abbey kitchen asks first. Leaving the knife leaves the rack to
     come back to; taking it is what lets Q kill, inside and out.
   - And the pebble tells you what it will do: while it is aimed at the far bookshelf in
     the Abbot's study, the novice is among those who will hear it. */
return (async () => {
  const G = window.__tithe;
  const notes = [];
  let pass = true;
  const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
  const card = document.getElementById('card');
  const click = (text) => [...card.querySelectorAll('.choice')].find((b) => b.textContent.includes(text)).click();

  localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
  check('a new run carries no knife', G.S.run.knife === false);

  // behind the cornice guard
  let g = G.guards[0];
  g.x = 21; g.f = 1; g.pause = 9; g.state = 'patrol';
  G.teleport(20, 9, 1);
  const killed = G.takedown(true);
  check('without a knife, Q does not kill', !killed && g.state === 'patrol', g.state);
  check('E still chokes him out', G.takedown(false) && g.state === 'ko', g.state);

  // below a guard's feet, with no knife there is no pull
  localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
  g = G.guards[0];
  g.x = 22; g.f = -1; g.pause = 9;
  G.teleport(22, 9, 1); G.act('down'); G.tick(0.6);
  check('without a knife, no pulling him off the ledge', !G.takedown(true) && g.state !== 'dead' && g.state !== 'falling', g.state);

  // the kitchen knife rack
  localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
  G.guards.forEach((q) => { q.state = 'ko'; });
  G.teleport(25, 17, 1); G.tryWindow('4'); G.tick(2.4);
  const R = G.room;
  R.people.forEach((p) => { p.state = 'away'; p.away = 99; });
  const rack = R.spots.find((sp) => sp.kind === 'knives');
  R.hidden = null; R.u = rack.u; R.v = 0.1;
  G.doSpot(rack); G.tick(1.2);
  check('the rack asks before she takes the knife', !card.hidden && card.textContent.includes('A knife'));
  click('Leave it');
  check('leaving it leaves the rack to come back to', !G.S.run.knife && !rack.done);
  G.doSpot(rack); G.tick(1.2);
  click('Take it');
  check('taking it arms her', G.S.run.knife === true && rack.done);
  const cook = R.people[0];
  cook.state = 'idle'; cook.u = R.u + 0.05; cook.v = R.v; cook.f = 1; cook.meter = 0;
  const innocents = G.S.run.stats.innocents;
  G.roomTakedown(true);
  check('with the knife, Q kills — and a cook is an innocent', cook.state === 'dead' && G.S.run.stats.innocents === innocents + 1);

  // the pebble shows who will hear it
  localStorage.clear(); G.newGame(); G.hideCard(); G.startLevel(0);
  G.guards.forEach((q) => { q.state = 'ko'; });
  G.teleport(19, 9, 1); G.tryWindow('2'); G.tick(2.4);
  const S2 = G.room, nov = S2.people[0];
  nov.u = 0.6; nov.state = 'idle';
  G.S.run.inv.pebbles = 1;
  G.startAim('pebbles');
  const shelf = S2.spots.find((sp) => sp.kind === 'shelf');
  S2.aim.i = G.aimTargets().indexOf(shelf);
  const say = document.getElementById('say').textContent;
  check('taking out a pebble says what it is for', /distraction/.test(say), say.slice(0, 60));
  check('aimed at the bookshelf, the novice is marked as hearing it', G.pebbleListeners(shelf).includes(nov));
  G.aimFire(); G.tick(1.5);
  const said = document.getElementById('say').textContent;
  check('when it lands, it says who went to look', /goes to see/.test(said) && nov.state === 'investigate', said);

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
