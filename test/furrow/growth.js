/* A village from nothing. The game starts with four people and a handcart on the green:
   no barn, no houses, no field, nobody employed. The player lays out a barn, three houses,
   a field, a woodcutter and a well, hires whoever is idle once the workplaces stand, and
   later adds a market, a bakery, a wheat field, a fourth house and a third field — nothing
   else. It does no tasks, so the coin comes only from the market and the daily tithe.
   The villagers have to raise all of it themselves, living off the handcart meanwhile,
   and nobody may go hungry or leave over twelve days.
   This is the balance case, and the failures it guards against are quiet: the handcart
   running dry before the first harvest, the camp never handing over to the barn, or
   nobody left to raise the bakery once everyone has a job (which happened — the wheat
   piled up unbaked and the village starved). The detail prints the barn and each field
   every morning. */
const F = window.furrow; F.seed(1); F.newGame(4242); const S = F.S;
const put = (type, crop) => {
  for (let r = 2; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (!F.whyNot(type, 24 + dx, 21 + dy)) { const b = F.place(type, 24 + dx, 21 + dy); if (crop) b.crop = crop; return b; }
  }
  return 'no room: ' + F.whyNot(type, 24, 21);
};
const first = ['barn', 'house', 'house', 'house', 'field', 'wood', 'well'].map((t) => put(t));
const refused = first.filter((b) => typeof b === 'string');
const out = [];
let lowest = 100, hungryDays = 0, allUp = -1, campGone = -1;
const hire = () => { for (const v of F.V) if (v.job < 0) { const b = F.B.find((b) => b && b.built && F.BT[b.type].jobs && b.workers.length < F.BT[b.type].jobs); if (b) F.assignJob(v, b); } };
for (let d = 0; d < 12; d++) {
  let dayLow = 100;
  for (let h = 0; h < 24; h++) { F.hours(1); hire(); for (const v of F.V) dayLow = Math.min(dayLow, v.hunger); }
  if (d >= 1) { lowest = Math.min(lowest, dayLow); if (dayLow < 15) hungryDays++; }
  if (allUp < 0 && first.every((b) => typeof b !== 'string' && b.built)) allUp = S.day;
  if (campGone < 0 && !F.B.some((b) => b && b.type === 'camp')) campGone = S.day;
  if (d === 1) put('market');
  if (d === 3) { S.renown = Math.max(S.renown, 3); put('bakery'); put('field', 'wheat'); }
  if (d === 6) { put('house'); put('field'); }
  out.push('d' + S.day + ' pop ' + F.V.length + ' food ' + F.foodInStore() + ' low ' + dayLow.toFixed(0) + ' coin ' + S.coins + ' logs ' + (S.store.logs | 0) + ' ★' + S.renown
    + ' sites ' + F.B.filter((b) => b && !b.built).map((b) => b.type).join(',') + ' | '
    + F.B.filter((b) => b && b.type === 'field').map((b) => b.crop + ' ' + b.cells.map((c) => (c.st < 0 ? '.' : c.st)).join('')).join(' '));
}
const pass = !refused.length && allUp > 0 && allUp <= 3 && campGone > 0 && F.V.length >= 8 && hungryDays === 0 && S.stats.left === 0 && F.B.every((b) => !b || b.built);
return JSON.stringify({ pass, detail: (refused.length ? 'refused: ' + refused.join('; ') + ' | ' : '') + 'first seven up by day ' + allUp + ', camp packed day ' + campGone + ', pop ' + F.V.length
  + ', lowest hunger ' + lowest.toFixed(0) + ', hungry days ' + hungryDays + ', left ' + S.stats.left + '\n        ' + out.join('\n        ') });
