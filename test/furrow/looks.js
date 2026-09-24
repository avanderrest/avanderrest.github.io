/* The barber and the clothes shop, from inside. Walk up to the door as someone, pick a
   new cut (or a new coat) in the real dialog, pay from their own purse — and it has to be
   the sprite that changes, since a look stored but never drawn looks exactly like a look
   that was never bought. Also that the shops will not serve you broke, and that the
   clothes shop needs something sewn to sell. */
const F = window.furrow;
F.seed(9);
F.newGame(4242);
F.quickStart();                                  // a small working village, raised at once
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
S.renown = 20; S.coins = 1000; S.store.logs = 80;
const put = (type) => { for (let y = 8; y < 34; y++) for (let x = 8; x < 44; x++) if (!F.whyNot(type, x, y)) { const b = F.place(type, x, y); F.finishBuilding(b, true); return b; } return null; };
put('smith'); put('sheep');
const barber = put('barber'), tailor = put('tailor');
const tobin = F.V.find((v) => v.name === 'Tobin'), hester = F.V.find((v) => v.name === 'Hester');
F.assignJob(hester, barber);
const bram = F.V.find((v) => v.name === 'Bram');
F.assignJob(bram, tailor);
F.setTime(10);
F.liveAs(tobin);
tobin.purse = 20;
tobin.look.style = 'short';
const before = JSON.stringify(tobin.look);
let e = F.entryC(barber);
F.teleport(tobin, e.x, e.y);
let acts = F.actionsFor(tobin).map((a) => a.label);
check('the barber offers a cut', acts.includes('Get a haircut (4 coin)'), acts.join('/'));
const i = acts.indexOf('Get a haircut (4 coin)');
F.press(i ? 'alt' : 'use'); F.step(0.05); F.release(i ? 'alt' : 'use'); F.step(0.05);
const dlg = document.getElementById('style');
check('the barber’s chair opens', !dlg.hidden);
document.querySelector('#style-opts [data-k="style"][data-v="bun"]').click();
document.querySelector('#style-opts [data-k="hair"][data-v="8"]').click();
document.getElementById('style-pay').click();
check('a new cut, paid from the purse', tobin.look.style === 'bun' && tobin.look.hair === 8 && tobin.purse === 16 && dlg.hidden, before + ' → ' + JSON.stringify(tobin.look) + ', purse ' + tobin.purse);
// the sprite really is different: the face in the live panel is drawn from the look, so read it back
const px = () => { F.render(); const c = document.getElementById('screen'); return c.getContext('2d').getImageData(0, 0, 90, 90).data.join(); };
const oldLook = tobin.look; tobin.look = JSON.parse(before); const pxBefore = px(); tobin.look = oldLook;
check('and the sprite on screen changed with it', px() !== pxBefore);
check('the game carries on after', !S.modal && S.mode === 'live');

e = F.entryC(tailor);
F.teleport(tobin, e.x, e.y);
S.store.clothes = 0;
acts = F.actionsFor(tobin).map((a) => a.label);
check('nothing sewn, nothing to buy', !acts.some((l) => l.startsWith('Buy new clothes')), acts.join('/'));
S.store.clothes = 2;
acts = F.actionsFor(tobin).map((a) => a.label);
const j = acts.indexOf('Buy new clothes (8 coin)');
check('the clothes shop sells, once there is stock', j === 0 || j === 1, acts.join('/'));
F.press(j ? 'alt' : 'use'); F.step(0.05); F.release(j ? 'alt' : 'use'); F.step(0.05);
const coat0 = tobin.look.coat;
document.querySelector('#style-opts [data-k="coat"][data-v="' + ((coat0 + 3) % 14) + '"]').click();
document.querySelector('#style-opts [data-k="dress"][data-v="1"]').click();
document.getElementById('style-pay').click();
check('new clothes', tobin.look.coat === (coat0 + 3) % 14 && tobin.look.dress && tobin.purse === 8 && S.store.clothes === 1, 'coat ' + coat0 + '→' + tobin.look.coat + ', purse ' + tobin.purse);
tobin.purse = 3;
acts = F.actionsFor(tobin).map((a) => a.label);
check('broke, no service', !acts.some((l) => l.startsWith('Buy new clothes')));
F.stepBack();
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
