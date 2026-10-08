/* The Garden Shed: the screen. Three places, left to right: the garden, where the
   flowers grow; the shed, where they are made up; and the stall at the end of the lane,
   where people come and ask. This file draws them, the flowers and the vases, and turns
   clicks and drags into the shop's verbs. The rules are in sim.js. */

import {
  POT_MAX, POT_PRICE, STEM_DROOP, GROW_EVERY, DAY_SLOTS, TAGS, COLOURS, FLOWERS, VASES, VASE_ORDER, FOLK, WEATHER, ROUGH,
  markupOf, clamp, cap, NUMW, mid, listText, vkey, flowerOf, colourOf, varName, varPlural, bunchText, meaningOf,
  readBunch, fitFor, judge, orderChecks, regrowDays, potRipe, QUESTIONS, createShed,
} from './sim.js';
import { store } from '../lib/save.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// The shed was a cottage life sim until 2026-09-25, saved under -v2. That diary is a
// different game and is left where it is; the shop starts its own.
const save = store('the-garden-shed-v3');

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const ink = (glyph) => `<i class="ink-plate">${glyph}</i>`;

// ---------- the flowers, drawn ----------
// None of her sheets has a cut flower or a vase, so these are drawn here: flat colour
// inside the same brown ink line as the painted props. A head is drawn about the origin, a
// little under ten units across; a spike stands up from it.
const INK = '#4a3320';
const STEM = '#57843b';
const petals = (n, shape, fill, sw = 0.8) => Array.from({ length: n }, (_, k) =>
  `<path d="${shape}" transform="rotate(${(k * 360) / n})" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`).join('');
const HEADS = {
  tulip: (c) => `<path d="M-7,-6 C-8,4 -5,9 0,9 C5,9 8,4 7,-6 L3.5,-1.5 L0,-8 L-3.5,-1.5 Z" fill="${c.m}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M-3.5,-1.5 C-3,4 -1.5,7.5 0,8.5 M3.5,-1.5 C3,4 1.5,7.5 0,8.5" fill="none" stroke="${c.d}" stroke-width="0.9"/>`,
  rose: (c) => `<circle r="8.5" fill="${c.m}" stroke="${INK}" stroke-width="1.1"/>
    <path d="M-4,1 C-4,-4.5 4.5,-4.5 4.5,0 C4.5,4.5 -2,5 -2,1 C-2,-1.2 1,-2 1.6,0 M-8,2 C-5.5,7 5.5,7 8,2" fill="none" stroke="${c.d}" stroke-width="1.1" stroke-linecap="round"/>`,
  sunflower: () => petals(12, 'M0,-3 C-2.8,-5.5 -2.4,-10 0,-12 C2.4,-10 2.8,-5.5 0,-3 Z', '#f2b632')
    + `<circle r="4.8" fill="#6b3f1e" stroke="${INK}" stroke-width="1"/><circle cx="-1.4" cy="-1.3" r="0.8" fill="#a4683a"/><circle cx="1.5" cy="0.6" r="0.8" fill="#a4683a"/>`,
  sweetpea: (c) => `<path d="M-1,6 C-11,5 -11,-7 -3,-7 C-1,-9.5 2,-8 1,-5 C8,-9 12,0 4,5 Z" fill="${c.m}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M-4,-3 C-6,0 -4,3 -1,4 M3,-3 C6,-1 6,2 3,4" fill="none" stroke="${c.d}" stroke-width="0.9"/>
    <path d="M-3,5 C-2,10 3,10 4,5 Z" fill="${c.d}" stroke="${INK}" stroke-width="0.9"/>`,
  dahlia: (c) => petals(14, 'M0,0 L-2.4,-5.2 L0,-10.5 L2.4,-5.2 Z', c.m)
    + `<g transform="scale(0.6) rotate(13)">${petals(12, 'M0,0 L-2.4,-5.2 L0,-10.5 L2.4,-5.2 Z', c.l, 1.1)}</g><circle r="2" fill="${c.d}" stroke="${INK}" stroke-width="0.7"/>`,
  lavender: (c) => [0, 1, 2, 3, 4, 5].map((k) =>
    `<ellipse cx="${k % 2 ? 1.4 : -1.4}" cy="${-2 - k * 3.4}" rx="${2.5 - k * 0.2}" ry="2.9" fill="${k % 2 ? c.l : c.m}" stroke="${INK}" stroke-width="0.7"/>`).join(''),
  hyacinth: (c) => [0, 1, 2, 3, 4].map((k) => [-1, 1].map((sx) =>
    `<g transform="translate(${(sx * (3.4 - k * 0.35)).toFixed(2)},${(-2.5 - k * 3.6).toFixed(2)})">${petals(5, 'M0,0 C-1.4,-1 -1.2,-2.8 0,-3 C1.2,-2.8 1.4,-1 0,0 Z', (k + (sx > 0 ? 1 : 0)) % 2 ? c.l : c.m, 0.55)}</g>`).join('')).join('')
    + `<circle cy="-18.5" r="2" fill="${c.l}" stroke="${INK}" stroke-width="0.6"/>`,
  daisy: () => petals(14, 'M0,-2.5 C-1.8,-4.5 -1.6,-9.5 0,-10 C1.6,-9.5 1.8,-4.5 0,-2.5 Z', '#fbf8ef', 0.7)
    + `<circle r="3.4" fill="#f2c53a" stroke="${INK}" stroke-width="0.9"/>`,
  forgetmenot: (c) => [[-4, -2], [3.5, -4], [0, 3.5], [5, 3], [-5, 5]].map(([x, y]) =>
    `<g transform="translate(${x},${y})">${petals(5, 'M0,0 C-1.8,-1.2 -1.6,-3.6 0,-3.8 C1.6,-3.6 1.8,-1.2 0,0 Z', c.m, 0.55)}<circle r="0.9" fill="#f2d069"/></g>`).join(''),
  iris: (c) => `<path d="M0,-1 C-3,-5 -2,-11 0,-12 C2,-11 3,-5 0,-1 Z" fill="${c.l}" stroke="${INK}" stroke-width="0.9"/>
    <path d="M-1,0 C-6,-4 -10,-2 -9,3 C-8,7 -4,5 -1,1 Z M1,0 C6,-4 10,-2 9,3 C8,7 4,5 1,1 Z" fill="${c.m}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M-2.5,1.5 L-6.5,3 M2.5,1.5 L6.5,3" stroke="#f2c53a" stroke-width="1.4" stroke-linecap="round"/>`,
};
const head = (k) => HEADS[flowerOf(k)](COLOURS[colourOf(k)]);
const svgUri = (body, box) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${body}</svg>`)}`;
// One stem with a leaf, for the bucket, the packets, the pots and every sheet.
const ART = {};
for (const [f, fl] of Object.entries(FLOWERS)) {
  for (const c of fl.colours) {
    const tall = fl.spike;
    const stem = `M0,26 C1.5,17 -1.5,10 0,${tall ? 2 : 5}`;
    ART[vkey(f, c)] = svgUri(`<path d="${stem}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="${stem}" fill="none" stroke="${STEM}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M0.3,18 C4,13 8,13 10,10 C6,9 2,11 0.3,15 Z" fill="#6f9e49" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>
      <g transform="translate(0,${tall ? 4 : 0}) scale(1.15)">${head(vkey(f, c))}</g>`, tall ? '-13 -20 26 47' : '-13 -13 26 40');
  }
}
// Her painted stems (assets/flowers, one 120x240 canvas each with the cut end at
// bottom-centre) stand in for the drawings above wherever a flower is shown. The drawn
// heads are kept for anything that wants a head alone.
for (const k of Object.keys(ART)) ART[k] = `assets/flowers/${k}.png`;
const pic = (k) => `<img class="spr" src="${ART[k]}" alt="">`;

const VASE_BACK = {};
// Her painted vases (assets/art/vase-*.png): each is set in the same 120x160 box on its
// foot at y=158, so the stems still come out of the mouth and the shelf's crop still fits.
const VASE_ART = { bottle: [44.5, 84, 31, 75], jar: [42, 102, 36, 56], jug: [28, 92, 66, 66], urn: [31, 90, 58, 68] };
for (const [vid, [x, y, w, h]] of Object.entries(VASE_ART)) {
  VASE_BACK[vid] = `<image href="assets/art/vase-${vid}.png" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet"/>`;
}
// Where the stems of a vase go, in the order they are filled: the middle first, then out
// to either side alternately, so one stem stands up straight and a full urn fans.
function stemPlaces(vid) {
  const v = VASES[vid];
  const n = v.holds;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
    out.push({ t, ang: t * v.spread, len: v.reach * (1 - 0.16 * Math.abs(t)) - (k % 2 && n > 4 ? 9 : 0) });
  }
  return out.sort((a, b) => Math.abs(a.t) - Math.abs(b.t) || a.t - b.t);
}
// Where a ribbon is tied: round the neck, just under the mouth. Her painted bow.
const BOW_Y = { bottle: 104, jar: 119, jug: 111, urn: 116 };
const bow = (vid, c) => `<g class="bow" transform="translate(60,${BOW_Y[vid]})"><image href="assets/art/bow-${c}.png" x="-15" y="-10" width="30" height="29"/></g>`;
// A vase with whatever is in it, as one SVG. `big` makes each stem something you can take
// hold of; `ribbon` ties a bow round the neck.
function vaseSvg(vid, stems, big, ribbon) {
  const v = VASES[vid];
  const places = stemPlaces(vid);
  const glass = vid === 'jar';
  const drawn = stems.map((k, i) => ({ k, i, p: places[i] })).filter((s) => s.p)
    .sort((a, b) => b.p.len - a.p.len) // the tallest stand at the back
    .map(({ k, i, p }) => {
      const r = (p.ang * Math.PI) / 180;
      const ox = 60 + p.t * v.lip;
      const oy = v.mouth + (glass ? 40 : 6);
      const hx = ox + Math.sin(r) * p.len;
      const hy = v.mouth - Math.cos(r) * p.len;
      // her painted stem, stood on its cut end in the mouth and leant out to where the
      // drawn head would have been, reaching a little past it for the flower itself
      const len = Math.hypot(hx - ox, hy - oy) + 18;
      const lean = (Math.atan2(hx - ox, oy - hy) * 180) / Math.PI;
      return `<g class="stem"${big ? ` data-stem="${i}" data-k="${k}"` : ''}>
        <image href="${ART[k]}" x="${(-len / 4).toFixed(1)}" y="${(-len).toFixed(1)}" width="${(len / 2).toFixed(1)}" height="${len.toFixed(1)}" transform="translate(${ox.toFixed(1)},${oy}) rotate(${lean.toFixed(1)})"/></g>`;
    }).join('');
  // Stems first and the vase over them: an opaque one hides where they end. An empty vase
  // is cropped to itself, so it stands on the shelf at its own size.
  const box = stems.length || big ? '0 0 120 160' : '26 82 68 78';
  return `<svg class="vase-svg" viewBox="${box}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${drawn}${VASE_BACK[vid]}${ribbon ? bow(vid, ribbon) : ''}</svg>`;
}

// ---------- the shop and the screen ----------
let held = null;   // 'can' while the watering can is in hand
let nextAt = 0;    // when the next one comes up the lane (performance.now() time; not saved)
const shop = createShed({ saved: save.load(), on: onEvent });
const S = () => shop.S;
function onEvent(ev, d) {
  if (ev === 'changed') { save.save(shop.serialize()); render(); }
  else if (ev === 'redraw') render();
  else if (ev === 'toast') toast(d);
  else if (ev === 'soon') soon(d);
  else if (ev === 'go') goId(d);
  else if (ev === 'arrived') { nextAt = 0; toast(`${d.face} ${at('view-stall') ? 'Somebody at the counter.' : 'Somebody at the stall.'}`); }
}

// ---------- the diary and the corner of the screen ----------
function openDiary() {
  const days = [];
  for (const e of S().diary) {
    if (e.day) days.push({ label: e.day, w: e.w, lines: [] });
    else if (days.length) days[days.length - 1].lines.push(e.t);
  }
  let html = `<h2>The diary</h2>
    <p class="lead ink">At the shed. ${days.length ? `The last ${days.length === 1 ? 'day' : `${days.length} days`} of it.` : 'Nothing written down yet.'}</p>
    <div class="diary-book">`;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    const w = WEATHER[d.w];
    html += `<section class="diary-day${i === days.length - 1 ? ' today' : ''}">
      <h3>${esc(d.label)}${w ? ` <span class="wx">${ink(w.icon)} ${esc(w.name.toLowerCase())}</span>` : ''}</h3>
      ${d.lines.length ? `<p>${d.lines.map(esc).join(' ')}</p>` : '<p class="quiet">A day where nothing much was written down.</p>'}
    </section>`;
  }
  html += '</div><div class="foot"><button class="primary" id="sheet-cancel">Close the book</button></div>';
  openSheet(html);
  $('sheet-cancel').addEventListener('click', closeSheet);
}
const LOG_MAX = 4;
function logLine(text, cls) {
  const el = $('log');
  const line = document.createElement('div');
  line.className = `log-line ${cls || ''}`;
  line.textContent = text;
  el.appendChild(line);
  while (el.children.length > LOG_MAX) el.firstChild.remove();
  setTimeout(() => {
    line.classList.add('out');
    setTimeout(() => line.remove(), 500);
  }, cls === 'day' ? 9000 : 7000);
}
function toast(msg) { logLine(msg, 'toast'); }

// ---------- the pots ----------
function takeCan() {
  held = held === 'can' ? null : 'can';
  render();
  if (held) toast('Got the can. Click a pot.');
}
function potClick(i) {
  if (held === 'can') { shop.waterPot(i); return; }
  const p = S().pots[i];
  if (!p.crop) { openSowSheet(i); return; }
  if (potRipe(p)) { shop.cutPot(i); return; }
  openPotSheet(i);
}
function sowPot(i, k) { if (shop.sowPot(i, k)) closeSheet(); }
function openSowSheet(i) {
  let html = '<h2>An empty pot</h2><p>Anything grows in these, in any season, but only from seed you have. Seed comes from the catalogue, and now and then off your own plants when you cut them.</p>';
  if (!S().packets.length) html += '<p class="ink">No packets on the table. The seed catalogue is up in the corner.</p>';
  html += '<div class="options">';
  for (const p of S().packets) {
    const f = FLOWERS[flowerOf(p.k)];
    html += `<button class="opt seed" data-sow="${p.k}">
      <span class="icon">${pic(p.k)}</span>
      <span><span class="t">${esc(varName(p.k))}${p.n > 1 ? ` <span class="tiny-tag">×${p.n}</span>` : ''}</span><br><span class="d">${esc(meaningOf(p.k))} · ${f.days} spells to the first cut, then every ${regrowDays(p.k)} · ${f.yield[0]}–${f.yield[1]} stems</span></span>
      <span class="r good">sow</span></button>`;
  }
  html += '</div><div class="foot"><button id="sheet-shop">Seed catalogue</button><button class="primary" id="sheet-cancel">Never mind</button></div>';
  openSheet(html);
  $('sheet').querySelectorAll('[data-sow]').forEach((b) => b.addEventListener('click', () => sowPot(i, b.dataset.sow)));
  $('sheet-cancel').addEventListener('click', closeSheet);
  $('sheet-shop').addEventListener('click', openCatalogue);
}
function openPotSheet(i) {
  const p = S().pots[i];
  const f = FLOWERS[flowerOf(p.crop)];
  const left = f.days - p.progress;
  const growth = p.wilted
    ? 'Wilted and sulking. Water it and it will come back, a day behind.'
    : `Growing. ${left} more spell${left === 1 ? '' : 's'} until ${p.picks ? 'the next cut' : 'the first cut'}. A spell passes every ${NUMW[GROW_EVERY]} customers, or the same time with the stall closed.`;
  const water = p.dry === 0 ? 'Watered today.' : p.dry === 1 ? 'Fine for now. Water it tomorrow.' : 'Thirsty. It will wilt soon without a drink.';
  openSheet(`<h2>${pic(p.crop)} ${esc(varName(p.crop))}</h2>
    <p class="ink">${growth}</p><p>${water} Pick up the watering can and click the pot to water it.</p>
    <div class="foot"><button id="pot-pull">Pull it out</button><button class="primary" id="sheet-cancel">Leave it</button></div>`);
  $('sheet-cancel').addEventListener('click', closeSheet);
  $('pot-pull').addEventListener('click', () => { closeSheet(); shop.pullPot(i); });
}
// A pot is drawn whole: a bare pot, a sprout set in one, then one of Amber's potted plants,
// and the flower itself tucked in on top once it is out.
const GROW = [['grow-1a', 'grow-1b'], ['grow-2a', 'grow-2b', 'grow-2c', 'grow-2d']];
function potArt(p, i, stage) {
  const img = (f, cls) => `<img class="${cls}" src="assets/art/${f}.png" alt="">`;
  if (!p.crop) return `<span class="gs-pot">${img('pot', 'gs-p')}</span>`;
  const set = GROW[stage === 1 ? 0 : 1];
  let html = stage === 0 ? img('pot', 'gs-p') + img('sprout', 'gs-sprout') : img(set[i % set.length], 'gs-p');
  if (stage === 3) html += `<img class="gs-crop" src="${ART[p.crop]}" alt="">`;
  return `<span class="gs-pot">${html}</span>`;
}
function renderPots() {
  const carrying = held === 'can';
  document.body.classList.toggle('carrying', carrying);
  $('pots').innerHTML = S().pots.map((p, i) => {
    if (!p.crop) return `<button class="pot empty" data-pot="${i}" title="An empty pot. Click to sow something.">${potArt(p, i, 0)}<span class="plant">＋</span><span class="pot-body"><i class="soil"></i></span><span class="pot-name">empty</span><span class="pot-state">sow</span></button>`;
    const f = FLOWERS[flowerOf(p.crop)];
    const ripe = potRipe(p);
    const frac = p.progress / f.days;
    const stage = ripe ? 3 : frac >= 0.66 ? 2 : frac >= 0.33 ? 1 : 0;
    const plant = stage === 0 ? '🌱' : stage === 1 ? '🌿' : pic(p.crop);
    const wet = p.dry === 0 ? 'wet' : p.dry === 1 ? 'fine' : p.dry === 2 ? 'thirsty' : 'parched';
    const left = f.days - p.progress;
    const state = p.wilted ? 'wilted' : ripe ? 'cut me' : p.dry >= 2 ? 'thirsty' : '●'.repeat(p.progress) + '○'.repeat(left);
    const name = varName(p.crop);
    const title = p.wilted ? `${name}, wilted. Water it.` : ripe ? `${name}, in flower. Click to cut.` : `${name}, ${left} more spell${left === 1 ? '' : 's'} of growing. Soil ${wet === 'wet' ? 'watered' : wet}.`;
    return `<button class="pot stage-${stage} ${wet}${p.wilted ? ' wilted' : ''}${ripe ? ' ripe' : ''}" data-pot="${i}" title="${esc(title)}">
      ${potArt(p, i, stage)}<span class="plant">${plant}</span><span class="pot-body"><i class="soil"></i></span>
      <span class="pot-name">${esc(name)}</span><span class="pot-state">${state}</span></button>`;
  }).join('');
  $('pots').querySelectorAll('[data-pot]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); potClick(Number(el.dataset.pot)); }));
  const can = $('can');
  can.classList.toggle('lifted', carrying);
  can.title = carrying ? 'Put the can down' : 'Watering can. Click to pick it up.';
}

// ---------- the three places ----------
// The garden, the shed and the stall, left to right, with an arrow at either edge of the
// screen. You start in the shed, between the two.
const PLACES = [['view-garden', 'The garden'], ['view-sill', 'The shed'], ['view-stall', 'The stall']];
let place = 1;
function goTo(i) {
  i = clamp(i, 0, PLACES.length - 1);
  if (i === place) return;
  const dir = i > place ? 'in-r' : 'in-l';
  place = i;
  if (held === 'can' && PLACES[i][0] !== 'view-garden') held = null; // the can stays outside
  document.querySelectorAll('.stage .view').forEach((v) => {
    const on = v.id === PLACES[i][0];
    v.classList.toggle('on', on);
    v.classList.remove('in-l', 'in-r');
    if (on) { void v.offsetWidth; v.classList.add(dir); }
  });
  render();
}
const goId = (id) => goTo(PLACES.findIndex(([v]) => v === id));
const at = (id) => PLACES[place][0] === id;

// An arrow says where it goes, and carries a badge when something there wants you:
// somebody waiting at the stall, or pots to cut or water in the garden.
function renderNav() {
  const st = S();
  const waiting = !!(st.shop.cust && !st.shop.cust.accepted);
  const garden = st.pots.some((p) => potRipe(p) || (p.crop && (p.wilted || p.dry >= 2)));
  // and what the garden wants, on the badge: the flower that is ready to cut, else a drop
  const ripe = st.pots.find(potRipe);
  const gardenIco = ripe ? `<img src="${ART[ripe.crop]}" alt="">` : garden ? '💧' : '';
  for (const [side, to] of [['left', place - 1], ['right', place + 1]]) {
    const b = $(`nav-${side}`);
    const there = PLACES[to];
    b.classList.toggle('hidden', !there);
    if (!there) continue;
    $(`nav-${side}-lb`).textContent = there[1];
    b.title = `${there[1]} (${side === 'left' ? '←' : '→'})`;
    // the stall is always rightwards and the garden always leftwards of anywhere else
    b.classList.toggle('badged', side === 'right' ? waiting : garden);
    const badge = b.querySelector('.na-badge');
    const ico = side === 'left' ? gardenIco : '';
    if (badge.dataset.ico !== ico) { badge.dataset.ico = ico; badge.innerHTML = ico; }
    badge.classList.toggle('ico', !!ico);
    badge.title = side === 'left' && ripe ? 'Flowers ready to cut' : '';
  }
  // and whoever has just come up to the stall pops up by the arrow that goes there
  const who = $('nav-right-who');
  const face = waiting && place < 2 ? st.shop.cust.face : '';
  if (who.dataset.face !== face) {
    who.dataset.face = face;
    who.innerHTML = face ? `<span class="nw-face">${face}</span><span class="nw-t">at the stall</span>` : '';
    who.classList.toggle('on', !!face);
  }
}

// ---------- the lane ----------
// The stall is always open. People come up the lane on their own time, one at a time, and
// a customer stands at the counter until you have seen to them. The gap is the shop's to
// decide (gapMs); the clock is wall time, so it lives here.
function soon(ms) {
  const due = performance.now() + (ms == null ? shop.gapMs() : ms);
  nextAt = nextAt && nextAt > performance.now() ? Math.min(nextAt, due) : due;
}
// checked once a second: nobody new while somebody is at the counter, while the last one is
// still saying thank you, or while a sheet is open over the game. With the stall closed the
// garden keeps its time even so, or a thank-you left showing (or somebody left waiting at
// the counter) would stop everything growing.
setInterval(() => {
  const st = S();
  if (!st || document.hidden) return;
  if (!st.shop.paused && (st.shop.cust || st.shop.last)) return;
  if (!$('overlay').classList.contains('hidden')) return;
  if (!nextAt) { soon(); return; }
  if (performance.now() < nextAt) return;
  nextAt = 0;
  if (st.shop.paused) shop.idleSlot();   // somebody would have come, and didn't: the garden gets the time
  else shop.nextCustomer();
}, 1000);

// ---------- at the counter ----------
// Somebody comes up to the stall and says what they want, in a speech bubble, a few letters
// at a time. Some of them will stand for a question or two, and each answer is another page
// of the conversation; the arrows go back through it to what they first asked.
let dlgKey = null;
let typing = null;
function renderDialog() {
  const el = $('dialog');
  const st = S();
  const last = st.shop.last;
  const c = st.shop.cust;
  const conv = last || c;
  el.classList.toggle('hidden', !conv);
  if (!conv) { dlgKey = null; clearInterval(typing); return; }
  const pages = last ? last.pages : shop.pagesOf(c);
  const i = clamp(conv.page || 0, 0, pages.length - 1);
  const pg = pages[i];
  const atEnd = i === pages.length - 1;
  const state = last ? 'r' : c.accepted ? 'w' : 'a';
  const key = `${state}-${conv.id}-${i}-${pages.length}-${last ? '' : (c.qs || []).join(',')}`;
  if (key === dlgKey) return;
  dlgKey = key;

  const reg = !last && c.regular ? FOLK.find((f) => f.id === c.regular) : null;
  let extra = '';
  let choices = [];
  if (last && pg.result) {
    extra = `<div class="dlg-result"><span class="dlg-vase">${vaseSvg(last.vid, last.stems, false, last.ribbon)}</span>
      <span><span class="stars" aria-label="${last.stars} of 3 stars">${'★'.repeat(last.stars)}<span class="off">${'★'.repeat(3 - last.stars)}</span></span>
      <span class="paid">🪙 ${last.pay}${last.tip ? ` and ${last.tip} in the tip jar` : ''}</span>
      ${last.hint ? `<span class="dlg-hint">${esc(last.hint)}</span>` : ''}</span></div>`;
  }
  if (last) {
    choices = [['dlg-done', 'Thank you', 'primary']];
  } else {
    const open = c.qs.filter((q) => !c.asked.includes(q));
    choices = open.map((q) => [`dlg-q-${q}`, QUESTIONS[q], 'ask']);
    choices.push(...(c.browse
      ? [['dlg-no', 'Sorry, not that one', ''], ['dlg-sell', 'Yes, it\'s yours', 'primary']]
      : c.accepted
        ? [['dlg-no', 'Say you can\'t', ''], ['dlg-go', 'To the shed →', 'primary']]
        : [['dlg-no', 'Sorry, not today', ''], ['dlg-yes', 'I\'ll make that', 'primary']]));
  }
  const nav = pages.length > 1
    ? `<div class="dlg-nav"><button class="dlg-arrow" id="dlg-prev" ${i ? '' : 'disabled'} title="Back">‹</button><span class="dlg-page">${i + 1} / ${pages.length}</span><button class="dlg-arrow" id="dlg-fwd" ${atEnd ? 'disabled' : ''} title="On">›</button></div>`
    : '';
  el.innerHTML = `<div class="dlg-name">${esc(conv.who)}</div>${nav}
    ${reg && i === 0 && !last ? `<p class="dlg-lead">${esc(reg.hi)}${st.folk[reg.id].visits ? '' : ' First time in the shop.'}</p>` : ''}
    ${pg.q ? `<p class="dlg-you">You: ${esc(pg.q)}</p>` : ''}
    <p class="dlg-text"><span class="dlg-typed"></span></p>
    <div class="dlg-after">${extra}<div class="dlg-choices">${choices.map(([id, t, cls]) => `<button id="${id}"${cls ? ` class="${cls}"` : ''}>${esc(t)}</button>`).join('')}</div></div>`;

  const text = `"${pg.text}"`;
  const out = el.querySelector('.dlg-typed');
  const seen = conv.seen || (conv.seen = []);
  const finish = () => {
    clearInterval(typing);
    typing = null;
    out.textContent = text;
    el.classList.add('said');
    if (!seen.includes(i)) seen.push(i);
  };
  el.classList.remove('said');
  clearInterval(typing);
  let n = 0;
  if (seen.includes(i) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) finish();
  else typing = setInterval(() => { n += 2; out.textContent = text.slice(0, n); if (n >= text.length) finish(); }, 28);
  el.onclick = (e) => { if (!e.target.closest('button')) finish(); };
  $('dlg-prev')?.addEventListener('click', (e) => { e.stopPropagation(); shop.turnPage(-1); });
  $('dlg-fwd')?.addEventListener('click', (e) => { e.stopPropagation(); shop.turnPage(1); });
  for (const q of Object.keys(QUESTIONS)) $(`dlg-q-${q}`)?.addEventListener('click', () => shop.askQ(q));
  $('dlg-yes')?.addEventListener('click', () => shop.acceptOrder());
  $('dlg-sell')?.addEventListener('click', () => shop.giveMade(c.browse));
  $('dlg-no')?.addEventListener('click', () => shop.declineOrder());
  $('dlg-go')?.addEventListener('click', () => goId('view-sill'));
  $('dlg-done')?.addEventListener('click', () => shop.nextPlease());
}

// What the bunch says, as bars: the three loudest things in it. Not the order (that is
// back at the stall), just what the vase on the table is saying so far.
function readoutHtml(stems, ribbon) {
  const w = readBunch(stems, ribbon);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length) return '';
  return `<div class="says"><span class="says-t">It says</span>${top.map(([t, n]) =>
    `<span class="says-row"><span class="says-nm">${esc(TAGS[t])}</span><span class="says-bar"><i style="width:${Math.round((n / total) * 100)}%"></i></span></span>`).join('')}</div>`;
}
// The thing on the table as it stands: which vase, what is in it, the ribbon, and what all
// of that says so far.
function makingHtml(b) {
  const v = VASES[b.vase];
  const inIt = b.stems.length
    ? `${esc(cap(bunchText(b.stems)))}${b.ribbon ? `, tied with ${/^[aeiou]/.test(b.ribbon) ? 'an' : 'a'} ${b.ribbon} ribbon` : ''}.`
    : `Empty. Drag flowers in off the shelves${b.ribbon ? `; ${b.ribbon} ribbon tied on` : ''}.`;
  const mk = markupOf(b.markup || S().markup);
  return `<span class="bs-t">${esc(v.name)} <span class="bs-n">${b.stems.length} of ${NUMW[v.holds]}</span></span>
    <span class="bs-in">${inIt}</span>${readoutHtml(b.stems, b.ribbon)}
    <span class="bs-price">Price <button class="mk-arrow" id="mk-down" title="Cheaper">‹</button><b>${esc(mk.name)}</b><button class="mk-arrow" id="mk-up" title="Dearer">›</button>
      <span class="bs-est">${b.stems.length ? `about 🪙 ${shop.priceOf({ vid: b.vase, stems: b.stems, ribbon: b.ribbon, markup: b.markup })}` : ''}${b.markup ? '' : ' · as the board'}</span></span>`;
}

// ---------- dragging ----------
// Pointer events rather than the browser's drag and drop, so a finger works as well as a
// mouse. A press that doesn't travel is an ordinary click, and everything you can drag
// does something sensible when clicked, too.
let drag = null;
let draggedAt = -Infinity; // not 0: performance.now() starts at page load, and early clicks are real
function draggable(el, what, ghost) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !S()) return;
    drag = { what, ghost, x: e.clientX, y: e.clientY, el, g: null };
  });
}
const dropAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('[data-drop]') : null;
};
// which stem in the vase on the table has its flower nearest a point on screen
function stemNear(x, y) {
  let best = null, bd = Infinity;
  for (const g of document.querySelectorAll('.bench-vase [data-stem]')) {
    const b = g.getBoundingClientRect();
    const d = Math.hypot(b.left + b.width / 2 - x, b.top + Math.min(b.height * 0.25, 30) - y);
    if (d < bd) { bd = d; best = Number(g.dataset.stem); }
  }
  return best;
}
// what each kind of thing does when it lands on each kind of place
function landing(what, t, x, y) {
  const to = t ? t.dataset.drop : null;
  if (what.t === 'vase') return to === 'bench' || to === 'vase' ? () => shop.vaseDown(what.vid) : null;
  if (what.t === 'stem') return to === 'bench' || to === 'vase' ? () => shop.addStem(what.k) : null;
  if (what.t === 'ribbon') return to === 'bench' || to === 'vase' ? () => shop.tieRibbon(what.c, false) : null;
  if (what.t === 'out') {
    if (to !== 'vase') return () => shop.removeStem(what.i);
    // dropped back in the vase: it changes places with whichever flower it landed on
    const j = x == null ? null : stemNear(x, y);
    return j != null && j !== what.i ? () => shop.swapStems(what.i, j) : null;
  }
  if (what.t === 'bench') return to === 'shelf' ? () => shop.vaseUp() : null;
  if (what.t === 'made') return to === 'customer' && S().shop.cust ? () => shop.giveMade(what.id) : null;
  return null;
}
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.g) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.g = document.createElement('div');
    drag.g.className = `drag-ghost g-${drag.what.t}`;
    drag.g.innerHTML = drag.ghost();
    document.body.appendChild(drag.g);
    document.body.classList.add('dragging');
    drag.el.classList.add('lifted');
  }
  drag.g.style.left = `${e.clientX}px`;
  drag.g.style.top = `${e.clientY}px`;
  const t = dropAt(e.clientX, e.clientY);
  document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
  if (t && landing(drag.what, t, e.clientX, e.clientY)) t.classList.add('drop-over');
});
const endDrag = (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.g) return; // it never moved: a click, which the thing's own handler deals with
  d.g.remove();
  document.body.classList.remove('dragging');
  d.el.classList.remove('lifted');
  document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
  draggedAt = performance.now();
  const go = e.type === 'pointerup' ? landing(d.what, dropAt(e.clientX, e.clientY), e.clientX, e.clientY) : null;
  if (go) go();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
// the click that follows a drag is not a click. A fresh press is, however soon after:
// dropping the last flower in and going straight for "Put it out" used to need two goes.
document.addEventListener('pointerdown', () => { draggedAt = -Infinity; }, true);
document.addEventListener('click', (e) => {
  if (performance.now() - draggedAt < 300) { e.stopPropagation(); e.preventDefault(); }
}, true);

// ---------- the seed catalogue ----------
function openCatalogue() {
  const st = S();
  const can = (n) => st.coins >= n;
  let html = `<h2>The seed catalogue</h2><p class="lead ink">Posted on a Thursday, here by Friday, and today since you asked nicely. There is 🪙 ${st.coins} in the tin.</p>
    <h3>Seed</h3><div class="options">`;
  for (const f of Object.keys(FLOWERS)) {
    const fl = FLOWERS[f];
    if (!st.flags.catalogue.includes(f)) {
      html += '<div class="opt unknown"><span class="icon">📜</span><span><span class="t">Something new</span><br><span class="d">The merchant carries more for a shop people talk about.</span></span><span class="r">?</span></div>';
      continue;
    }
    for (const c of fl.colours) {
      const k = vkey(f, c);
      const pk = shop.packetFor(k);
      html += `<button class="opt seed" data-buy-seed="${k}" ${can(fl.seed) ? '' : 'disabled'}>
        <span class="icon">${pic(k)}</span>
        <span><span class="t">${esc(varName(k))}${pk ? ` <span class="tiny-tag">×${pk.n} on the table</span>` : ''}</span><br><span class="d">${esc(meaningOf(k))} · ${fl.days} spells to flower</span></span>
        <span class="r ${can(fl.seed) ? 'good' : ''}">🪙 ${fl.seed}</span></button>`;
    }
  }
  html += '</div>';
  if (st.pots.length < POT_MAX) {
    html += `<h3>The shed</h3><div class="options"><button class="opt" data-buy-pot="1" ${can(POT_PRICE) ? '' : 'disabled'}>
      <span class="icon">🪴</span><span><span class="t">Another pot on the shelf</span><br><span class="d">${st.pots.length} of ${POT_MAX}. More pots, more stems.</span></span>
      <span class="r ${can(POT_PRICE) ? 'good' : ''}">🪙 ${POT_PRICE}</span></button></div>`;
  }
  html += '<div class="foot"><button class="primary" id="sheet-cancel">Close the catalogue</button></div>';
  openSheet(html);
  const sh = $('sheet');
  sh.querySelectorAll('[data-buy-seed]').forEach((b) => b.addEventListener('click', () => { shop.buySeed(b.dataset.buySeed); openCatalogue(); }));
  sh.querySelectorAll('[data-buy-pot]').forEach((b) => b.addEventListener('click', () => { shop.buyPot(); openCatalogue(); }));
  $('sheet-cancel').addEventListener('click', closeSheet);
}

// ---------- the language of flowers ----------
function openBook() {
  let html = `<h2>The Language of Flowers</h2>
    <p class="lead ink">Every flower says one thing, and its colour says something quieter underneath: the flower counts twice what its colour does.</p>
    <h3>Colours</h3><div class="book-colours">${Object.values(COLOURS).map((c) =>
      `<span class="book-col"><i style="background:${c.m}"></i>${cap(c.name)} · ${esc(TAGS[c.tag].toLowerCase())}</span>`).join('')}</div>
    <h3>Flowers</h3><div class="options">`;
  for (const f of Object.keys(FLOWERS)) {
    const fl = FLOWERS[f];
    const open = S().flags.catalogue.includes(f);
    html += `<div class="opt book${open ? '' : ' unknown'}"><span class="icon">${open ? pic(vkey(f, fl.colours[0])) : '📜'}</span>
      <span><span class="t">${open ? esc(fl.name) : 'A page not yet read'}</span><br><span class="d">${open ? `<b>${esc(TAGS[fl.tag])}.</b> ${esc(fl.says)} Comes in ${listText(fl.colours)}.` : 'The seed merchant does not carry it yet.'}</span></span><span class="r"></span></div>`;
  }
  html += `</div><p>Close cousins count for half: cheer sits near celebration and friendship, sympathy near remembrance and calm. Some things fight: nobody wants celebration at a funeral.</p>
    <div class="foot"><button class="primary" id="sheet-cancel">Close the book</button></div>`;
  openSheet(html);
  $('sheet-cancel').addEventListener('click', closeSheet);
}

// ---------- sheets ----------
function openSheet(html) {
  $('sheet').innerHTML = html;
  $('overlay').classList.remove('hidden');
}
function closeSheet() {
  $('overlay').classList.add('hidden');
  $('sheet').innerHTML = '';
}
// A new shop, straight in: no name to give and no card to click past.
function newShop() {
  shop.newShop();
  held = null;
  nextAt = 0;
  save.save(shop.serialize());
  goTo(1);
  render();
  toast('The stall is closed for now. Open it from the top bar, or the sign at the stall, when you are ready.');
}
function openHelp() {
  openSheet(`<h2>How to play</h2>
    <p class="lead ink">Grow flowers, and sell them to people who want to say something with them.</p>
    <h3>Getting about</h3>
    <ul>
      <li>Three places, left to right: <strong>the garden, the shed and the stall</strong>. The arrows at the edges of the screen (or ← and →) go between them, and light up when something over there wants you. The shed door goes out to the garden too.</li>
    </ul>
    <h3>The garden</h3>
    <ul>
      <li>The garden keeps customer time: a <strong>growing spell</strong> passes every ${NUMW[GROW_EVERY]} customers, and every time somebody would have come while the stall is closed. ${NUMW[DAY_SLOTS]} customers make a day. Each spell, watered pots grow a step and every pot dries a step. <strong>Pick up the can and click a pot</strong> to water it; left dry, a plant wilts, then dies. Heatwaves dry them twice as fast.</li>
      <li><strong>Click a pot in flower to cut it.</strong> The stems go on the shelves in the shed, and the plant grows back from half-way. Stems keep a few days, droop, then go on the compost.</li>
      <li>Sow an empty pot from a seed packet on the grass. Packets come from the <strong>catalogue</strong> (top right), and sometimes off your own plants.</li>
    </ul>
    <h3>The stall and the shed</h3>
    <ul>
      <li>The stall is always open. Customers come up the lane one at a time, say what they want, and wait while you work. A bare stall gets passed by; put something out and they stop sooner. If you are elsewhere when someone arrives, their face pops up by the arrow.</li>
      <li>Take the order and you go through to the shed. <strong>Drag a vase off the shelf onto the table</strong>, then drag flowers off the shelves into it, and a ribbon if you like. Drag a stem out to take it back. (Clicking does the same.) Forgotten what they asked for? The stall is one arrow away, and they will tell you again.</li>
      <li><strong>You don't need an order to make something.</strong> Fill a vase and <em>Put it out on the stall</em>. Passers-by may ask to buy one as it stands, and you can drag one (or click it) to whoever is at the counter. Up to four at once, and they go over in a few days like cut stems do.</li>
      <li><strong>Every flower says one thing, and its colour something quieter</strong>: a flower counts twice what its colour does, and a ribbon counts like a colour. The Language of Flowers on the table has them all.</li>
      <li>Stars: up to two for saying the right thing, one more for a proper bunch (a full vase, or more than one kind). Anything they said it had to have, or had to not, keeps you to one star if you miss it. A size they asked for, or tired stems, cost a star.</li>
      <li>More stars, more people talk: more customers a day, and new seed in the catalogue.</li>
    </ul>
    <h3>Money and satisfaction</h3>
    <ul>
      <li>The <strong>price board</strong> at the stall sets what you charge, from Cheap to Daylight robbery; the card by the vase on the table can price one arrangement differently. Dear prices fetch more but please people less, and someone browsing may walk off.</li>
      <li><strong>Satisfaction</strong>, up in the bar, is how pleased the lane is with you: good bunches and fair prices raise it. The higher it is, the more often people come, the more particular they are, and the more a job pays.</li>
      <li>The <strong>Open</strong> button in the bar (or the sign at the stall) closes the stall for a while, if you just want to make things up. Nobody new comes until you open again.</li>
      <li>A bunch sells for its stems and its vase, more for more stars, and a happy customer tips. Spend it on seed and more pots. Vases never run out; flowers do.</li>
    </ul>
    <div class="foot"><button id="help-reset">Start again</button><button class="primary" id="sheet-cancel">Back</button></div>`);
  $('sheet-cancel').addEventListener('click', closeSheet);
  $('help-reset').addEventListener('click', startOver);
}
// A new shop from scratch: the saved one thrown away, and back to the shed with the garden
// in flower. Asks first, since there is no getting the old one back.
function startOver() {
  if (!confirm('Start a new shop? This one, and everything in it, will be thrown away.')) return;
  save.clear();
  closeSheet();
  newShop();
}

// ---------- render ----------
// The cut flowers stand in the shed, a bucket to a kind: on the right-hand shelves in the
// painted room, along the back of the table on a phone. Drag one into the vase on the
// table, or click it.
const SHELF_SLOTS = 10;
function renderBucket() {
  const keys = shop.bucketKeys();
  const el = $('pantry');
  const shown = keys.length > SHELF_SLOTS ? keys.slice(0, SHELF_SLOTS - 1) : keys;
  el.innerHTML = keys.length
    ? shown.map((k) => {
      const n = shop.stockLeft(k);
      const tired = shop.tiredIn(k);
      const title = `${varName(k)} · ${n} stem${n === 1 ? '' : 's'}. ${meaningOf(k)}.${tired ? ' Some are going over.' : ''} Drag it into the vase on the table.`;
      return `<button class="stock-item${tired ? ' tired' : ''}${n ? '' : ' spent'}" data-stems="${k}" title="${esc(title)}">
        <span class="s-stems">${[0, 1, 2].slice(0, clamp(n, 1, 3)).map((i) => `<img src="${ART[k]}" alt="" style="--r:${(i - 1) * 16}deg">`).join('')}</span><i class="jar"></i>
        <span class="nm">${esc(varName(k))}</span><span class="n">${n}</span></button>`;
    }).join('') + (keys.length > shown.length ? `<span class="stock-more">+${keys.length - shown.length} more</span>` : '')
    : '<span class="counter-empty">Nothing cut yet. The flowers are out in the garden.</span>';
  el.querySelectorAll('[data-stems]').forEach((b) => {
    const k = b.dataset.stems;
    draggable(b, { t: 'stem', k }, () => pic(k));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (S().bench && shop.stockLeft(k) > 0) shop.addStem(k);
      else toast(`${varName(k)}: ${meaningOf(k).toLowerCase()}.`);
    });
  });
}
// Ribbon on reels on the top shelf. Any colour, as much as you like.
function renderRibbons() {
  const el = $('ribbons');
  const b = S().bench;
  el.innerHTML = Object.keys(COLOURS).map((c) => `<button class="spool${b && b.ribbon === c ? ' on' : ''}" data-ribbon="${c}" style="--rb:${COLOURS[c].m};--rd:${COLOURS[c].d}" title="${esc(`${cap(c)} ribbon: ${TAGS[COLOURS[c].tag].toLowerCase()}. Drag it onto the vase on the table.`)}"><img class="reel" src="assets/art/reel-${c}.png" alt=""></button>`).join('');
  el.querySelectorAll('[data-ribbon]').forEach((btn) => {
    const c = btn.dataset.ribbon;
    draggable(btn, { t: 'ribbon', c }, () => `<span class="spool"><img class="reel" src="assets/art/reel-${c}.png" alt=""></span>`);
    btn.addEventListener('click', (e) => { e.stopPropagation(); shop.tieRibbon(c, true); });
  });
}
// Arrangements set aside, on the right of the counter at the stall, where they can be
// dragged (or clicked) to whoever is there.
function madeHtml(m) {
  const top = Object.entries(readBunch(m.stems, m.ribbon)).sort((a, b) => b[1] - a[1])[0];
  const title = `${cap(bunchText(m.stems))} in the ${VASES[m.vid].name.toLowerCase()}${m.ribbon ? `, ${m.ribbon} ribbon` : ''}. Says ${TAGS[top[0]].toLowerCase()}, mostly.${m.age >= STEM_DROOP ? ' Going over.' : ''}`;
  return `<button class="made-item${m.age >= STEM_DROOP ? ' tired' : ''}" data-made="${m.id}" title="${esc(`${title} ${markupOf(m.markup || S().markup).name} at 🪙 ${shop.priceOf(m)}.`)}">${vaseSvg(m.vid, m.stems, false, m.ribbon)}<span class="price-tag${m.markup ? ' own' : ''}">🪙 ${shop.priceOf(m)}</span></button>`;
}
function renderMade() {
  const el = $('stall-made');
  el.innerHTML = S().made.map(madeHtml).join('');
  el.querySelectorAll('[data-made]').forEach((b) => {
    const m = S().made.find((x) => x.id === b.dataset.made);
    draggable(b, { t: 'made', id: m.id }, () => `<span class="ghost-vase g-made">${vaseSvg(m.vid, m.stems, false, m.ribbon)}</span>`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (S().shop.cust) shop.giveMade(m.id);
      else toast(b.title);
    });
  });
}
// The vase on the table, big enough to work in, with a mat under it.
function renderBench() {
  const el = $('bench');
  const st = S();
  const b = st.bench;
  const o = st.shop.cust && st.shop.cust.accepted ? st.shop.cust : null;
  el.classList.toggle('empty', !b);
  if (!b) {
    el.innerHTML = '<span class="bench-hint">Drag a vase here</span>';
    return;
  }
  const v = VASES[b.vase];
  el.innerHTML = `<div class="bench-vase" data-drop="vase" title="${esc(`${v.name}. Drag flowers and ribbon onto it; drag a stem out to take it back; drag the vase to the shelf to put it away.`)}">${vaseSvg(b.vase, b.stems, true, b.ribbon)}</div>
    <div class="bench-says">${makingHtml(b)}</div>
    <button class="bench-back" id="bench-back" title="Put the vase back on the shelf">↩</button>
    <button class="bench-give" id="bench-give" ${b.stems.length ? '' : 'disabled'}>${o ? 'Take it out to them' : 'Put it out on the stall'}</button>`;
  const vaseEl = el.querySelector('.bench-vase');
  draggable(vaseEl, { t: 'bench' }, () => `<span class="ghost-vase">${vaseSvg(b.vase, b.stems, false, b.ribbon)}</span>`);
  el.querySelectorAll('[data-stem]').forEach((g) => {
    const i = Number(g.dataset.stem);
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 0) drag = { what: { t: 'out', i }, ghost: () => pic(g.dataset.k), x: e.clientX, y: e.clientY, el: g, g: null }; });
    g.addEventListener('click', (e) => { e.stopPropagation(); shop.removeStem(i); });
  });
  $('bench-back').addEventListener('click', (e) => { e.stopPropagation(); shop.vaseUp(); });
  $('mk-down').addEventListener('click', (e) => { e.stopPropagation(); shop.benchMarkup(-1); });
  $('mk-up').addEventListener('click', (e) => { e.stopPropagation(); shop.benchMarkup(1); });
  $('bench-give').addEventListener('click', (e) => { e.stopPropagation(); shop.handOver(); });
}
function renderPackets() {
  const el = $('packets');
  el.innerHTML = S().packets.map((p, i) => `<button class="packet" data-packet="${i}" style="--tilt:${((i * 5) % 7) - 3}deg" title="${esc(varName(p.k))} seed${p.n > 1 ? `, ${p.n} packets` : ''}. Click to sow it in an empty pot.">
    <span class="ico">${pic(p.k)}</span><span class="lbl">${esc(varName(p.k).toLowerCase())}</span>${p.n > 1 ? `<span class="count">×${p.n}</span>` : ''}</button>`).join('');
  el.querySelectorAll('[data-packet]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const free = S().pots.findIndex((pt) => !pt.crop);
    if (free < 0) { toast('Every pot is busy. Pull something out, or buy another pot.'); return; }
    shop.sowPot(free, S().packets[Number(b.dataset.packet)].k);
  }));
}
function renderVases() {
  const el = $('vases');
  el.innerHTML = VASE_ORDER.map((vid) => {
    const v = VASES[vid];
    const title = `${v.name}, holds ${NUMW[v.holds]}. Drag it onto the table.`;
    return `<button class="vase v-${vid}" data-vase="${vid}" title="${esc(title)}" aria-label="${esc(title)}">
      ${vaseSvg(vid, [])}<span class="vase-nm">${esc(v.name)}</span></button>`;
  }).join('');
  el.querySelectorAll('[data-vase]').forEach((b) => {
    const vid = b.dataset.vase;
    draggable(b, { t: 'vase', vid }, () => `<span class="ghost-vase">${vaseSvg(vid, [])}</span>`);
    b.addEventListener('click', (e) => { e.stopPropagation(); shop.vaseDown(vid); });
  });
}
// Who is at the counter, painted from the waist up (assets/people). Anyone without a
// picture is still a face and a coat. Keyed by `who`, which regulars and walk-ins share.
const PEOPLE_ART = {
  Ada: 'ada', Tomas: 'tomas', Wren: 'wren', Harold: 'harold', Ines: 'ines', Poppy: 'poppy',
  'A man in a wet coat': 'wet-coat', 'A woman with a bicycle': 'bicycle', 'A student, out of breath': 'student',
  'An old man with a stick': 'old-man', 'The cook from the pub': 'cook', 'A woman in a green headscarf': 'headscarf',
  'A lad from the farm': 'farm-lad', 'A lady in a good hat': 'good-hat', 'A van driver, engine running': 'van-driver',
  'A nervous young man': 'nervous', 'The schoolteacher': 'schoolteacher', "Somebody's grandad": 'grandad',
};
// The stall: the sign, whoever is at the counter, and what is in stock on show.
const COATS = ['#6f8fb0', '#b0654f', '#6c8b58', '#8a6aa6', '#b08a4a', '#5f7f86', '#a4566e'];
function renderStall() {
  const st = S();
  const c = st.shop.cust || st.shop.last;
  const sign = $('door-sign');
  sign.textContent = st.shop.paused ? 'Closed' : 'Open';
  sign.classList.toggle('open', !st.shop.paused);
  $('stall-closed').classList.toggle('hidden', !st.shop.paused);
  $('price-board').innerHTML = `<span class="pb-t">Prices</span><button class="mk-arrow" id="pb-down" title="Cheaper">‹</button><b>${esc(markupOf(st.markup).name)}</b><button class="mk-arrow" id="pb-up" title="Dearer">›</button>`;
  $('pb-down').addEventListener('click', (e) => { e.stopPropagation(); shop.boardMarkup(-1); });
  $('pb-up').addEventListener('click', (e) => { e.stopPropagation(); shop.boardMarkup(1); });
  const el = $('customer');
  const coat = c ? COATS[[...c.who].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COATS.length] : '';
  const key = c ? c.id : '';
  if (el.dataset.who !== key) {
    el.dataset.who = key;
    const art = c && PEOPLE_ART[c.who];
    el.innerHTML = !c ? '' : art ? `<img class="cust-pic" src="assets/people/${art}.png" alt="">`
      : `<span class="cust-face">${c.face}</span><span class="cust-coat" style="--coat:${coat}"></span>`;
    el.classList.toggle('painted', !!art);
  }
  el.classList.toggle('here', !!c);
  el.disabled = !c;
  el.title = c ? c.who : 'Nobody here yet';
  renderDialog();
}
function renderGoals() {
  const t = S().flags.goals;
  $('goals').classList.toggle('hidden', !!S().flags.goalsDone);
  const lis = [...document.querySelectorAll('#goals [data-goal]')];
  lis.forEach((li) => li.classList.toggle('done', !!t[li.dataset.goal]));
  const next = lis.find((li) => !t[li.dataset.goal]);
  $('goals-next').textContent = next ? next.querySelector('.g-txt').textContent : 'All done';
  $('goals-n').textContent = `${lis.filter((li) => t[li.dataset.goal]).length}/${lis.length}`;
}
// A sun that rides the day across the doorway, by how much of the shop is left.
function renderSun() {
  const sun = $('sky-sun');
  const t = 0.12 + 0.8 * ((S().daySlots || 0) / DAY_SLOTS); // across the sky as the day's customers go by
  const top = 74 - 66 * Math.sin(Math.PI * t);
  sun.style.left = `${8 + t * 84}%`;
  sun.style.top = `${top}%`;
  sun.classList.toggle('low', top < 20);
  sun.classList.toggle('muted', ROUGH.includes(S().weather) || S().weather === 'fog');
}
function render() {
  const st = S();
  if (!st) return;
  document.body.dataset.season = shop.seasonName();
  $('hud-date').innerHTML = `<b>${shop.seasonName()}</b> · day ${st.day} · year ${st.year}`;
  const w = WEATHER[st.weather];
  $('hud-weather').innerHTML = `${ink(w.icon)} ${esc(w.name)}`;
  $('hud-actions').innerHTML = `<span class="coins" title="In the tin">🪙 ${st.coins}</span><span class="sat" title="Customer satisfaction: ${esc(shop.repWord())}. Happier customers come more often, ask for more and pay more.">${st.rep >= 75 ? '😄' : st.rep >= 50 ? '🙂' : st.rep >= 25 ? '😐' : '😞'}<i class="sat-bar"><b style="width:${st.rep}%"></b></i><span class="sat-n">${Math.round(st.rep)}%</span></span>`;
  $('btn-pause').textContent = st.shop.paused ? 'Stall closed' : 'Stall open';
  $('btn-pause').classList.toggle('closed', !!st.shop.paused);
  $('btn-pause').title = st.shop.paused ? 'The stall is closed: nobody new will come. Click to open.' : 'The stall is open. Click to close it for a while and just make things.';
  for (const id of ['sill-scene', 'garden-scene', 'stall-scene']) $(id).dataset.weather = st.weather;

  renderSun();
  renderPots();
  renderBucket();
  renderRibbons();
  renderBench();
  renderMade();
  renderPackets();
  renderVases();
  renderStall();
  renderNav();
  renderGoals();

  const ready = st.pots.filter(potRipe).length;
  const thirsty = st.pots.filter((p) => p.crop && !p.wilted && p.dry >= 2).length;
  const wilted = st.pots.filter((p) => p.crop && p.wilted).length;
  const c = st.shop.cust;
  const stems = st.bucket.reduce((a, b) => a + b.n, 0);
  $('garden-note').textContent = held === 'can'
    ? 'Carrying the can. Click a pot to water it, or the can to put it down.'
    : [
      ready ? `${ready} pot${ready === 1 ? '' : 's'} in flower to cut.` : '',
      wilted ? `${wilted} wilted, water ${wilted === 1 ? 'it' : 'them'}.` : '',
      thirsty ? `${thirsty} will wilt soon without water.` : '',
    ].filter(Boolean).join(' ') || 'Everything watered, nothing to cut. Pick up the can tomorrow.';
  const b = st.bench;
  $('sill-note').textContent = c && c.accepted
    ? (b ? `Making up ${mid(c.who)}'s order. Drag flowers from the shelves into the vase.` : `Making up ${mid(c.who)}'s order. Drag a vase off the shelf onto the table.`)
    : c ? `${c.who} is waiting at the stall.`
      : b ? 'Making something up. Put it out on the stall when it is done, for whoever wants it.' : stems ? `${stems} stem${stems === 1 ? '' : 's'} on the shelves. Orders come in at the stall.` : 'Nothing cut yet. The flowers are out in the garden.';
  // at the stall the customer does the talking; the note only speaks when nobody is
  $('stall-note').textContent = c || st.shop.last ? ''
    : st.shop.paused ? 'Closed for now. Click the sign on the counter when you want people again.' : st.made.length ? 'Your flowers are out. Somebody will stop.' : 'Nothing out on the stall. Folk walk past a bare counter.';
}

// ---------- boot ----------
$('btn-pause').addEventListener('click', () => shop.togglePause());
$('door-sign').addEventListener('click', (e) => { e.stopPropagation(); shop.togglePause(); });
$('stall-closed').addEventListener('click', (e) => { e.stopPropagation(); shop.togglePause(); });
$('btn-cook').addEventListener('click', openBook);
$('btn-shop').addEventListener('click', openCatalogue);
$('btn-help').addEventListener('click', openHelp);
$('btn-restart').addEventListener('click', startOver);
$('btn-diary').addEventListener('click', openDiary);
$('goals-hide').addEventListener('click', (e) => { e.stopPropagation(); shop.markGoalHide(); });
$('goals-toggle').addEventListener('click', () => $('goals').classList.toggle('open'));
$('btn-door').addEventListener('click', (e) => { e.stopPropagation(); goId('view-garden'); });
$('customer').addEventListener('click', (e) => { e.stopPropagation(); $('dialog').click(); });
// the vase shelf and the table are where a dragged vase can land
$('vases').dataset.drop = 'shelf';
$('bench').dataset.drop = 'bench';
$('customer').dataset.drop = 'customer';
$('nav-left').addEventListener('click', () => goTo(place - 1));
$('nav-right').addEventListener('click', () => goTo(place + 1));
$('can').addEventListener('click', (e) => { e.stopPropagation(); takeCan(); });
$('garden-scene').addEventListener('click', () => { if (held === 'can') { held = null; render(); } });
$('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeSheet(); });
document.addEventListener('keydown', (e) => {
  // the arrow keys walk between the three places, when nothing else wants them
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && $('overlay').classList.contains('hidden') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
    goTo(place + (e.key === 'ArrowLeft' ? -1 : 1));
    return;
  }
  if (e.key !== 'Escape') return;
  if (held !== null) { held = null; render(); return; }
  if (!$('overlay').classList.contains('hidden')) closeSheet();
});

// ---------- the painted room ----------
// The shed is Amber's painted plate, and the scene's logical pixels are the plate's own,
// so every position in the stylesheet reads straight off it. Below PLATE_MIN_W the room
// would be too small to use, so the phone layout (the drawn shed) takes over.
const PLATE_W = 1376, PLATE_H = 768;
const PLATE_SEE_W = 1150, PLATE_SEE_H = 700;   // the least of the plate that must stay in view
const PLATE_MIN_W = 700;
function fitPlate() {
  const view = $('view-sill');
  const shed = $('sill-scene');
  const W = view.clientWidth, H = view.clientHeight;
  if (!W && !H) return; // another place is on screen; fit it when the shed comes back
  const on = W >= PLATE_MIN_W && H > 0;
  shed.classList.toggle('gs-plate', on);
  view.classList.toggle('gs-plate-view', on);
  $('stage').classList.toggle('gs-on', on);
  if (!on) { shed.style.transform = ''; return; }
  const k = Math.min(Math.max(W / PLATE_W, H / PLATE_H), W / PLATE_SEE_W, H / PLATE_SEE_H);
  const x = (W - PLATE_W * k) / 2;
  const y = (H - PLATE_H * k) * (H < PLATE_H * k ? 0.3 : 0.5);
  shed.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  const st = $('stage').style;
  st.setProperty('--gs-k', k);
  st.setProperty('--gs-x', `${x}px`);
  st.setProperty('--gs-y', `${y}px`);
}
window.addEventListener('resize', fitPlate);
if (window.ResizeObserver) new ResizeObserver(fitPlate).observe($('view-sill'));
fitPlate();

// straight in: the saved shop if there is one, a new one if not
if (save.load()) render(); else newShop();

// The debug handle, for tests: the live state and the verbs, so a case can play a customer
// without clicking at the plate.
expose('__gardenShed', {
  shop,
  get S() { return S(); }, FLOWERS, COLOURS, TAGS, VASES, FOLK,
  render, newDay: () => shop.newDay(), ageStems: () => shop.ageStems(), nextCustomer: (b) => shop.nextCustomer(b),
  growSpell: (q) => shop.growSpell(q), slotPassed: () => shop.slotPassed(), newOrder: () => shop.newOrder(), cutPot: (i) => shop.cutPot(i),
  goTo, askQ: (q) => shop.askQ(q), turnPage: (d) => shop.turnPage(d),
  acceptOrder: () => shop.acceptOrder(), declineOrder: () => shop.declineOrder(), nextPlease: () => shop.nextPlease(), togglePause: () => shop.togglePause(),
  benchMarkup: (d) => shop.benchMarkup(d), boardMarkup: (d) => shop.boardMarkup(d), priceOf: (m) => shop.priceOf(m),
  vaseDown: (v) => shop.vaseDown(v), vaseUp: () => shop.vaseUp(), addStem: (k) => shop.addStem(k), removeStem: (i) => shop.removeStem(i),
  tieRibbon: (c, t) => shop.tieRibbon(c, t), handOver: () => shop.handOver(), setAside: () => shop.setAside(), giveMade: (id) => shop.giveMade(id),
  get place() { return PLACES[place][0]; },
  readBunch, fitFor, judge, orderChecks, vkey, save: () => save.save(shop.serialize()),
  // a new shop in place of whatever is loaded, since cases share one page
  fresh() { const s = shop.fresh(); held = null; closeSheet(); goTo(1); render(); return s; },
  text: () => JSON.stringify({ day: S().day, coins: S().coins, rep: S().rep, cust: !!S().shop.cust, made: S().made.length }),
});
