/* Who comes down the road. Every morning one or two newcomers arrive if there is a spare bed,
   food in the barn and water (each well serves eight) for them, and the village is content;
   every evening, if any of that is short, a note says what — and says nothing when all is
   well. Also that the view never zooms out past the edge of the valley.
   The quiet failure is a village that stops growing with no word why, or a note that nags
   when there is nothing to fix. */
const F = window.furrow;
F.seed(17);
F.newGame(4242);
F.quickStart();
const S = F.S, H = F.HOME;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
const note = document.getElementById('notice');
const toEvening = () => { while (!(S.t > 17.7 && S.t < 18)) F.hours(0.1); F.hours(0.4); };
const toMorning = () => { while (!(S.t > 5.7 && S.t < 6)) F.hours(0.1); F.hours(0.4); };
const spot = (type) => { for (let r = 3; r < 26; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!F.whyNot(type, H.x + dx, H.y + dy)) return [H.x + dx, H.y + dy]; return null; };

// four people, four beds: nobody new, and the evening note says why
toEvening();
check('a full house is noted in the evening', !note.hidden && /bed/i.test(note.textContent), note.hidden ? 'hidden' : note.textContent);
const pop0 = F.V.length;
toMorning();
check('and nobody comes', F.V.length === pop0 && note.hidden, F.V.length + ' villagers');

// plenty of everything: one or two come, and there is no note
S.store.logs = 200; S.store.bread = 80;
for (let i = 0; i < 3; i++) { const p = spot('house'); F.finishBuilding(F.place('house', p[0], p[1]), true); }
toEvening();
check('nothing short, no note', note.hidden, note.hidden ? '' : note.textContent);
const pop1 = F.V.length;
toMorning();
const came = F.V.length - pop1;
check('one or two come', came >= 1 && came <= 2, came + ' came');

// fill the beds past what one well serves: water is what is short
for (let i = 0; i < 2; i++) { const p = spot('house'); F.finishBuilding(F.place('house', p[0], p[1]), true); }
while (F.V.length < 8) F.arrive();
toEvening();
check('one well for eight is noted', !note.hidden && /water|well/i.test(note.textContent), F.V.length + ' people, water for ' + F.waterFor() + ': ' + (note.hidden ? 'hidden' : note.textContent));
toMorning();
check('and holds them at eight', F.V.length === 8, F.V.length + ' villagers');
// an empty barn
const wp = spot('well'); F.finishBuilding(F.place('well', wp[0], wp[1]), true);
for (const g of Object.keys(S.store)) if (F.GOODS[g].food) S.store[g] = 0;
check('an empty barn is what stops them', F.wants(1).some((w) => w.k === 'food') && !F.wants(1).some((w) => w.k === 'water'), JSON.stringify(F.wants(1).map((w) => w.k)));

// the view stops at the edge of the valley however far out you go
for (let i = 0; i < 8; i++) F.press('zoomout'), F.release('zoomout');
F.render();
const t = F.camTarget();
const cv = document.getElementById('screen');
check('zoomed right out, the view stays inside the valley', t.x >= 0 && t.y >= 0, 'camera at ' + t.x.toFixed(0) + ',' + t.y.toFixed(0) + ' on a ' + cv.width + 'x' + cv.height + ' canvas');
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
