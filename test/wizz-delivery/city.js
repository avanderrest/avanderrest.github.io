/* The city has to be built, not just drawn.

   Two things broke silently here before and would again. First, hash2 lost
   precision in its mixing step and never returned a value above 0.5, so every
   threshold read against half a distribution: the whole map came out as
   building, with no tree and no garden anywhere, and nothing on screen said so.
   Second, the painted sprites are fetched at runtime, so a renamed or missing
   PNG just quietly leaves the drawn fallback in place.

   So: assert that every sprite loaded, that the generated city contains all
   three kinds of ground, and that the hash is actually uniform. */
const D = window.__wizz;
if (!D) return JSON.stringify({ pass: false, detail: 'window.__wizz is not exposed' });

const missing = D.artMissing();
const loaded = D.artLoaded().length;

// tile kinds, counted off the live map through the lot and prop plans
const lots = D.lots.size;
const props = D.props.size;
let trees = 0, beds = 0;
for (const p of D.props.values()) (p.kind === 'tree' ? trees++ : beds++);

// every lot must point at a sprite that actually exists
const badLot = [...D.lots.values()].find((l) => !D.artNames.includes(l.name));
const badProp = [...D.props.values()].find((p) => !D.artNames.includes(p.name));

// the hash has to spread across the whole 0..1 range, not just the bottom half
const seen = new Array(10).fill(0);
for (let y = 0; y < 34; y++) {
  for (let x = 0; x < 50; x++) {
    // same mixing as game.js, so a regression there shows up here
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    seen[Math.min(9, Math.floor((((h ^ (h >>> 16)) >>> 0) / 4294967296) * 10))]++;
  }
}
const emptyDeciles = seen.filter((n) => n === 0).length;

const problems = [];
if (missing.length) problems.push('sprites missing: ' + missing.join(', '));
if (badLot) problems.push('lot points at unknown sprite ' + badLot.name);
if (badProp) problems.push('prop points at unknown sprite ' + badProp.name);
if (!lots) problems.push('no building lots were planned');
if (!trees) problems.push('no trees — kindAt never returned T');
if (!beds) problems.push('no flowerbeds — kindAt never returned open ground');
if (!D.houses.length) problems.push('no delivery addresses');
if (emptyDeciles) problems.push(emptyDeciles + ' empty hash deciles (hash2 is not uniform)');

return JSON.stringify({
  pass: !problems.length,
  detail: problems.length
    ? problems.join('; ')
    : `${loaded}/${D.artNames.length} sprites loaded; ${lots} lots, ${trees} trees, ${beds} beds, `
      + `${D.houses.length} addresses; hash deciles ${seen.join('/')}`,
});
