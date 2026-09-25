/* The end of a contract, and the end of the game.

   There is no conversation with the target any more. Ways to deal with them are found
   as intel on the way up; the quest log lists each with what it still needs; and the
   deed is done in the target's own room, at the furniture it concerns.

   - The target's window stays shut until you carry what the level requires.
   - The log starts with only "leave him be", and says there are more ways to find.
     Finding the sexton's note puts "The rotten bell" in it, needing the pry bar; the
     pry bar makes it ready.
   - In the belfry the bell does nothing until you know about it; knowing and carrying
     the bar, E at the bell ends the contract as an execution, and the silver goes
     where you send it.
   - Climbing out of the Assize chambers without doing anything asks first, then
     spares him; the Keep's burn order ruins her.
   - Three contracts played three ways give the ending the numbers say: no blood and
     every coin given is the Sparrow; blood and every coin kept is the Tyrant. */
return (async () => {
  const G = window.__tithe;
  const notes = [];
  let pass = true;
  const check = (name, ok, extra) => { notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); if (!ok) pass = false; };
  const card = document.getElementById('card');
  const log = () => document.getElementById('log-body').textContent;
  const buttons = () => [...card.querySelectorAll('.choice')];
  const click = (text) => { const b = buttons().find((x) => x.textContent.includes(text)); if (!b) throw new Error('no button: ' + text + ' in ' + buttons().map((x) => x.textContent).join(' / ')); b.click(); };
  const room = (x, y) => { G.guards.forEach((q) => { q.state = 'ko'; }); G.teleport(x, y, 1); G.tryWindow('T'); G.tick(2.4); return G.room; };

  localStorage.clear();
  G.newGame(); G.hideCard(); G.startLevel(0);
  G.teleport(21, 2, 1);
  G.tryWindow('T'); G.tick(1);
  check('the belfry is shut without the tithe', G.S.mode === 'ext');

  G.renderLog();
  check('the log starts with only leaving him be, and more to find', /Leave him be/.test(log()) && /2 more ways/.test(log()) && !/rotten bell/.test(log()), log().slice(0, 120));
  G.grant({ t: 'intel', id: 'bell-note', title: 'x', text: 'x' }); G.hideCard(); G.S.paused = false;
  check('the sexton\'s note puts the rotten bell in the log, needing the pry bar', /The rotten bell/.test(log()) && /Needs the pry bar/.test(log()), log().match(/The rotten bell.*?(Needs[^.]*|Ready)/) + '');
  G.S.run.items.push('pry-bar'); G.renderLog();
  check('carrying the bar makes it ready', /The rotten bell[^]*Ready/.test(log()));

  G.S.run.items.push('coffer-key', 'tithe');
  let R = room(21, 2);
  check('the belfry is a room, with the Abbot at his routine', G.S.mode === 'room' && R.id === 'T' && R.people[0].kind === 'abbot' && R.people[0].state === 'routine', R.people[0].state);
  const bell = R.spots.find((sp) => sp.kind === 'bigbell');
  const abbot = R.people[0];
  abbot.state = 'idle'; abbot.act = null; abbot.wp = null; abbot.u = 0.9; abbot.f = 1; abbot.turnT = 99;
  R.hidden = null; R.climbIn = 0; R.peek = false; R.u = bell.u; R.v = 0.1;
  G.doSpot(bell); G.tick(2.2);
  check('with the note and the bar, E at the bell ends it', !card.hidden && /bell of St Orrin/.test(card.textContent) && G.S.run.stats.executions === 1, card.textContent.slice(0, 60));
  G.S.run.silver = 40;
  click('Go on');
  click('Keep it');
  check('kept silver is counted', G.S.run.kept === 40 && G.S.run.silver === 40);
  click('To the fence');
  click('Out into the night');
  check('the next contract opens with a consequence', /All Vell knows what happened to Crane/.test(card.textContent), card.textContent.slice(0, 90));
  click('Begin');

  // the Assize: climb out without doing anything, and it asks first
  G.S.run.items.push('seal', 'writs');
  R = room(35, 10);
  R.people[0].state = 'ko';
  R.climbIn = 0; R.peek = false; R.hidden = null;
  G.doSpot(R.spots[0]);
  check('climbing out of the chambers asks before sparing him', !card.hidden && /Leave Magistrate Voss be/.test(card.textContent));
  click('Leave him be');
  check('and spares him', G.S.run.stats.spared === 1 && G.S.run.choices[1].target === 'spare');
  G.S.run.silver = 50;
  click('Go on'); click('Give it to the Lowmarket');
  check('given silver is counted', G.S.run.given === 50 && G.S.run.silver === 0);
  click('To the fence'); click('Out into the night'); click('Begin');

  // the Keep: the burn order on her desk ruins her
  G.S.run.items.push('tower-key', 'contracts', 'burn-order');
  R = room(8, 2);
  const desk = R.spots.find((sp) => sp.method === 'order');
  R.people[0].state = 'ko';
  R.climbIn = 0; R.peek = false; R.hidden = null; R.u = desk.u; R.v = desk.v + desk.dv + 0.03;
  G.doSpot(desk); G.tick(2.2);
  check('the burn order left on her desk ruins her', G.S.run.stats.blackmails === 1 && /farthing a sack/.test(card.textContent));
  G.S.run.silver = 60;
  click('Go on'); click('Give it to the Lowmarket');
  click('The end');
  const title1 = card.querySelector('h2').textContent;
  check('little blood, most silver given: the Sparrow', title1 === 'The Sparrow of Vell', title1 + ', chaos ' + G.chaos());

  G.S.run.stats.innocents = 2; G.S.run.kept = 500;
  G.ending();
  const title2 = card.querySelector('h2').textContent;
  check('innocents killed and silver kept: the Tyrant', title2 === 'The New Tyrant', title2);
  G.hideCard();

  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
