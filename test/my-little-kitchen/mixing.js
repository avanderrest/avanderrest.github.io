/* Mixing anything finds recipes (Amber, 2026-10-14, after Little Alchemy).

   With no recipe picked, the bowl takes anything. Tapping it: exactly a recipe's things
   finds that recipe (it goes in the book, and you go on and make it); nearly a recipe puts
   that recipe in the book with what you got right and question marks; nothing at all says
   so. The bin empties the bowl. Picking a found recipe from the book follows it. */
const K = window.__kitchen;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = K.state;
const fresh = (added) => { S.recipe = null; S.scene = 'kitchen'; S.phase = 'fill'; S.added = added.slice(); S.flavour = null; S.doors = {}; K.renderKitchen(); };
// the cases share a page, and an earlier one has made (and so found) everything: start the
// book again as a first visit has it, with the cake and the pizza
K.book.known.clear(); K.book.known.add('cake'); K.book.known.add('pizza');
for (const k of Object.keys(K.book.hints)) delete K.book.hints[k];
// nothing
fresh(['banana', 'salt']);
K.mixToSee();
check('a mix that is nothing stays in the kitchen', S.scene === 'kitchen' && !S.recipe, document.getElementById('helper').textContent);
// nearly brownies
fresh(['flour', 'sugar', 'cocoa', 'eggs']);
K.mixToSee();
check('nearly brownies puts a clue in the book', (K.book.hints.brownie || []).length >= 3, JSON.stringify(K.book.hints.brownie));
K.openBook();
const hintCard = [...document.querySelectorAll('.bk-card.hint')].find((c) => /Brownies/.test(c.textContent));
check('and the book shows it with a question mark', !!hintCard && hintCard.querySelectorAll('.bk-q').length === 1);
K.closeBook();
// the bin
K.binTapped();
check('the bin empties the bowl', S.added.length === 0 && S.phase === 'fill');
// exactly brownies
fresh(['flour', 'sugar', 'cocoa', 'eggs', 'butter']);
K.mixToSee();
check('exactly brownies finds them', K.book.known.has('brownie') && S.recipe === 'brownie' && !K.book.hints.brownie);
await sleep(2300);
check('and goes on to mix them', S.scene === 'mix', S.scene);
// picking a known recipe from the book follows it
fresh(['banana']);
K.openBook();
document.querySelector('.bk-card.known[data-id="pizza"]').click();
check('picking pizza from the book follows it, with a fresh bowl', S.recipe === 'pizza' && S.added.length === 0 && !document.getElementById('recipe-card').hidden);
// leave it where a player would find it
try { localStorage.removeItem('mlk-book'); } catch (e) { /* ignore */ }
K.book.known.delete('brownie');
S.recipe = null; S.phase = 'bowl'; S.added = []; S.doors = {}; S.scene = 'kitchen';
K.renderKitchen();
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((n) => n.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
