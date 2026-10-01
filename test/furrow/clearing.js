/* Clearing and replanting. Nothing can be built on a tree or a rock any more: you mark it,
   and it goes when a woodcutter or a miner gets there — not at once. Felled trees leave a
   stump that rots away and never grows back, so the only new trees are the forester's.
   It breaks silently if a mark is never acted on (the site you wanted stays blocked, and
   everyone still looks busy), if a mark vanishes without anyone clearing it, or if the
   forester plants somewhere that walls a door off. */
const F = window.furrow;
F.seed(13);
F.newGame(4242);
F.quickStart();
const S = F.S, H = F.HOME, MW = F.MW, TR = F.TR, tree = F.map.tree;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
S.store.logs = 40;   // room left in the one barn for what they bring in
const hester = F.V.find((v) => v.name === 'Hester'), tobin = F.V.find((v) => v.name === 'Tobin');
const wood = F.B.find((b) => b && b.type === 'wood');

// a tree well away from the hut — further than the woodcutter would fell on his own — and
// one that someone can stand beside
const reach = F.flood();
const standable = (c) => [1, -1, MW, -MW].some((d) => reach[c + d]);
const we = F.entry(wood);
let far = -1, farD = 0;
for (let c = 0; c < tree.length; c++) {
  if (tree[c] !== TR.TREE || !standable(c)) continue;
  const d = Math.hypot(c % MW - we.x, Math.floor(c / MW) - we.y);
  if (d > 18 && d < 30 && d > farD) { far = c; farD = d; }
}
F.clearAt(far % MW, Math.floor(far / MW));
check('marking leaves the tree standing', tree[far] === TR.TREE && F.mark[far] === 1, Math.round(farD) + ' tiles from the hut');
F.setTime(8.4);
let h = 0;
while (tree[far] && h < 30) { F.hours(1); h++; }
check('the woodcutter goes and fells it, stump and all', tree[far] === TR.NONE && !F.mark[far], 'in ' + h + ' village hours');

// a rock, for a miner at a new quarry
const qp = (() => { for (let r = 3; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!F.whyNot('quarry', H.x + dx, H.y + dy)) return [H.x + dx, H.y + dy]; })();
const quarry = F.place('quarry', qp[0], qp[1]);
F.finishBuilding(quarry, true);
F.assignJob(hester, quarry);
let rock = -1, rockD = 1e9;
for (let c = 0; c < tree.length; c++) {
  if (tree[c] !== TR.ROCK || !standable(c)) continue;
  const d = Math.hypot(c % MW - qp[0], Math.floor(c / MW) - qp[1]);
  if (d < rockD) { rock = c; rockD = d; }
}
F.setMark(rock, true);
const stone0 = S.store.stone || 0;
h = 0;
while (tree[rock] && h < 48) { F.hours(1); h++; }
F.hours(14);   // she carries it in when her hands are full, or when the day is done
check('the miner breaks up the marked rock', tree[rock] === TR.NONE && !F.mark[rock], 'in ' + h + ' village hours, ' + Math.round(rockD) + ' tiles off');
check('and the stone reaches the barn', (S.store.stone || 0) > stone0, stone0 + ' → ' + (S.store.stone || 0));

// stumps rot away; nothing comes back on its own
const stumps = [];
for (let c = 0; c < tree.length; c++) if (tree[c] === TR.STUMP) stumps.push(c);
F.hours(48);
let saplings = 0;
for (let c = 0; c < tree.length; c++) if (tree[c] === TR.SAPLING) saplings++;
const gone = stumps.filter((c) => tree[c] === TR.NONE).length;
check('stumps rot away and nothing regrows unplanted', stumps.length > 0 && gone === stumps.length && saplings === 0, gone + '/' + stumps.length + ' stumps gone, ' + saplings + ' saplings');

// a forester plants, and the saplings grow — but never in front of a door
const fp = (() => { for (let r = 9; r < 22; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!F.whyNot('forester', H.x + dx, H.y + dy)) return [H.x + dx, H.y + dy]; })();
const lodge = F.place('forester', fp[0], fp[1]);
F.finishBuilding(lodge, true);
F.assignJob(hester, lodge);
const before = new Uint8Array(tree);
let planted = 0;
for (let d = 0; d < 3; d++) {
  F.hours(24);
  for (let c = 0; c < tree.length; c++) if (!before[c] && (tree[c] === TR.SAPLING || tree[c] === TR.TREE)) { planted++; before[c] = tree[c]; }
}
F.hours(40);
let grown = 0;
for (let c = 0; c < tree.length; c++) if (tree[c] === TR.TREE && before[c] === TR.SAPLING) grown++;
check('the forester plants saplings', planted >= 6, planted + ' planted in three days');
check('and they grow into trees', grown >= 1, grown + ' grown');
const seen = F.flood();
const cutOff = F.B.filter((b) => b && !seen[F.entry(b).y * MW + F.entry(b).x]).map((b) => b.type);
check('and no door is walled off by them', cutOff.length === 0, cutOff.join(','));
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
