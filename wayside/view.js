/* Wayside: the screen. Draws the land, the mist and the walkers on a canvas at sixteen pixels
   a tile, scaled up whole, and turns keys and clicks into sim.js verbs. Sprites live in
   sprites.js (window.WaysideArt). Nothing in here changes the rules. */

import {
  createWayside, CARDS, CHAPTERS, DECK, LAMP_CARDS, ITEMS, COMPANIONS, ROWS, TILE, START, DIRS, DIR_KEYS,
  LIGHTHOUSE_EVERY, HERO_R, clamp, inBounds, plural,
} from './sim.js';
import { store } from '../lib/save.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { expose } from '../lib/debug.js';

const ART = window.WaysideArt;

// ---------- constants ----------
const save = store('wayside-save-v4');
const best = store('wayside-best-v1');
const HELP_SEEN = 'wayside-seen-help';
const KEYDIR = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
// What stands on a tile is drawn smaller than the tile and sitting near the bottom of it, so a
// tree reads as a tree in a field rather than as a wall of pine. Ground cover is the exception:
// flowers and tracks are the field, and cover the whole square.
// The sprite size is fixed in screen pixels rather than taken as a share of the tile, so a wolf,
// a signpost or a traveller stays the same size on screen however big the tiles are drawn.
const SPRITE_PX = 2;             // screen pixels per sprite pixel (sprites are 16 x 16)
const MIN_COLS = 16;             // never draw the land so large that fewer than this fit across
const FULL_TILE = new Set(['flowers', 'tracks']);

// ---------- the mist ----------
// The land does not stop at the five rows you can walk, and it does not stop at the last card
// laid: it runs off into mist in every direction. Only two things hold the mist off: the cards
// that are face up, which stay clear for good, and you. A card still lying face down does not:
// it gives nothing away, and the ground over it looks like any other ground until you come near
// enough for it to turn over on its own.
const FOG_COL = '#080a16';
const FOG_SS = 6;                // mist-canvas pixels per tile; blurred up, so this is plenty
const LIGHT_R = 1.45;            // how far a turned-over card holds the mist off, in tiles
const EDGE_ROWS = 1.15;          // rows of mist above and below the road before it goes dark

const $ = (s) => document.querySelector(s);

let flashTimer = 0, bannerTimer = 0;
let modeSelect = false;  // the "which way to walk" screen is up; ordinary input is paused
let battleWatch = 0;     // timer id for walking the partner over to help in a fight
let pendingSeed = null;  // a seed from the URL, waiting for the next new walk

const canvas = $('#board'), overlay = $('#overlay'), bannerEl = $('#banner');
const handEl = $('#hand'), statsEl = $('#stats'), invEl = $('#inv'), logEl = $('#log'), hintEl = $('#hint');
const questEl = $('#quests');
const turnEl = $('#turn');
const topbarEl = $('#hud-top'), trayEl = $('#tray');
const ctx = canvas.getContext('2d');
const off = document.createElement('canvas');
const octx = off.getContext('2d');

let Z = 4, viewW = 176, viewH = 144, topY = 0, sprPx = 3, lastLayout = '';
const hero = { x: START.c * TILE, y: START.r * TILE, face: 1, ouch: 0, walk: 0 };
const mara = { x: START.c * TILE, y: START.r * TILE, face: 1, ouch: 0, walk: 0 };   // the partner, drawn on the land like the hero
let camX = 0;
let lastT = 0;

// ---------- the walk ----------
// A seed in the URL is a coast somebody shared. With no walk saved it is the walk; with one
// saved on a different coast, the mode screen offers the shared coast or your own road back.
const urlSeed = readSeed();
const saved = save.load();
const w = createWayside({ saved, best: best.load(), seed: urlSeed, on: onEvent });
const S = () => w.S;
const hadSave = !!saved && w.S === saved;
if (urlSeed != null && (!hadSave || w.S.seed !== urlSeed)) pendingSeed = urlSeed;

function onEvent(ev, data) {
  switch (ev) {
    case 'changed': persist(); render(); break;
    case 'redraw': render(); break;
    case 'flash': flash(data); break;
    case 'hint': hint(data); break;
    case 'banner': showBanner(data); break;
    case 'best': best.save(w.BEST); break;
    case 'ouch': (data === 'pat' ? mara : hero).ouch = performance.now(); break;
    case 'face': (data.who === 'pat' ? mara : hero).face = data.d; break;
    case 'snap': if (data === 'pat') snapPat(); else snapHero(); break;
    case 'dialog': showDialog(); break;
    case 'close': closeOverlay(); break;
    case 'lamp': lampModal(data); break;
    case 'battle':
      renderBattle();
      if (!battleWatch) battleWatch = setInterval(() => { if (!w.battle) stopWatch(); else w.battleWatchTick(); }, 900);
      break;
    case 'battle-wait': setTimeout(() => w.battleResolve(), data); break;
    case 'battle-over': stopWatch(); closeOverlay(); break;
    case 'new-game':
      snapHero(); snapPat(); snapCamera();
      writeSeed(w.S.seed);
      closeOverlay();
      break;
  }
}
function persist() { if (S()) save.save(w.S); }
function stopWatch() { if (battleWatch) { clearInterval(battleWatch); battleWatch = 0; } }

// the walk begins by choosing how to walk it, and it is a choice you can make again
function showModeSelect() {
  modeSelect = true;
  w.setHold(true);
  S().selected = null;
  const shared = pendingSeed != null && hadSave && S().steps > 0;
  overlay.innerHTML = `
    <div class="modal mode" role="dialog" aria-labelledby="md-title">
      <div class="big pix-big"></div>
      <h2 id="md-title">Choose a companion</h2>
      <p class="say intro">${shared ? 'Somebody has sent you a coast of their own. Walk it from the start, or go back to your road.' : 'Pick a class below. They lay one card after you lay one, move while you wait, and bring a different way through the road.'}</p>
      <div class="mode-opts">
        <button class="mode-btn" data-mode="solo" type="button"><b>Walk alone</b><span>The road is yours, and so is every risk on it.</span></button>
        ${shared ? '<button class="mode-btn" data-mode="mine" type="button"><b>Back to my own road</b><span>Your walk is where you left it.</span></button>' : ''}
      </div>
      <div class="companion-opts">
        ${Object.entries(COMPANIONS).map(([id, c]) => `<button class="mode-btn companion-btn" data-companion="${id}" type="button"><b>${c.name}, the ${c.className}</b><span>${c.talk} Attack: ${c.attack.label}.</span></button>`).join('')}
      </div>
      <p class="muted">A competitive mode &mdash; race an NPC, block their path, trade blows with their deck &mdash; is on the way.</p>
    </div>`;
  overlay.querySelector('.pix-big').appendChild(portrait('hero', 'grass'));
  overlay.hidden = false;
}
function chooseMode(mode, companionId) {
  modeSelect = false;
  w.setHold(false);
  if (mode === 'mine') {
    pendingSeed = null;
    writeSeed(w.S.seed);
    closeOverlay();
    render();
    hint('Welcome back. Your road is where you left it.');
    return;
  }
  const sd = pendingSeed;
  pendingSeed = null;
  w.newGame(mode, companionId, sd);
  let seen = null;
  try { seen = localStorage.getItem(HELP_SEEN); } catch (e) { /* fine */ }
  if (!seen) {
    try { localStorage.setItem(HELP_SEEN, '1'); } catch (e) { /* fine */ }
    setTimeout(showHelp, 400);
  }
}

// ---------- hints ----------
function hint(text) {
  clearTimeout(flashTimer);
  hintEl.classList.remove('flash');
  hintEl.textContent = text;
}
function flash(text) {
  clearTimeout(flashTimer);
  hintEl.classList.add('flash');
  hintEl.textContent = text;
  flashTimer = setTimeout(() => { hintEl.classList.remove('flash'); hintEl.textContent = w.defaultHint(); }, 2800);
}
function showBanner(ch) {
  bannerEl.innerHTML = `<small>Chapter ${ch.i + 1}</small><b>${ch.name}</b>`;
  bannerEl.hidden = false;
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { bannerEl.hidden = true; }, 3000);
}

// ---------- dialogue and overlays ----------
function portrait(sprite, base) {
  const c = ART.iconCanvas(sprite, 6, base);
  c.className = 'px portrait';
  return c;
}
function showDialog() {
  const d = w.dlg;
  if (!d) return;
  if (d.kind === 'help') return renderHelp();
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="dlg-title">
      <div class="big"></div>
      <h2 id="dlg-title">${d.title}</h2>
      <p class="say">${d.say}</p>
      <div class="actions">
        ${d.options.map((o, i) => `<button class="${o.primary ? 'primary' : ''}" data-opt="${i}" ${o.disabled ? 'disabled' : ''}><span class="key">${i + 1}</span> ${o.label}</button>`).join('')}
      </div>
    </div>`;
  if (d.sprite) overlay.querySelector('.big').appendChild(portrait(d.sprite, CARDS[d.sprite] ? CARDS[d.sprite].base : 'grass'));
  overlay.hidden = false;
  const first = overlay.querySelector('button.primary:not(:disabled)') || overlay.querySelector('button:not(:disabled)');
  if (first) first.focus();
}
function closeOverlay() {
  overlay.hidden = true;
  overlay.innerHTML = '';
}
function lampModal(won) {
  const s = S(), B = w.BEST;
  const next = w.nextLampCard();
  overlay.innerHTML = `
    <div class="modal win" role="dialog" aria-labelledby="dlg-title">
      <div class="big"></div>
      <h2 id="dlg-title">Lamp ${s.lamps} is lit</h2>
      <p>The light reaches back over everything you laid. You have walked <b>${plural(s.far, 'mile')}</b> east in <b>${plural(s.steps, 'step')}</b>, laying <b>${plural(s.placed, 'card')}</b>, and you stand here with <b>${plural(s.coins, 'coin')}</b>.</p>
      ${won ? `<p class="lamp-won">That is <b>${plural(w.lampsEver(), 'lamp')}</b> lit on this coast, all told, and the coast has noticed. <b>${won.what.replace(/^an? /, '')}</b> joins your deck &mdash; from now on, on every walk.</p>`
      : next ? `<p class="muted">${plural(w.lampsEver(), 'lamp')} lit on this coast, all told. ${plural(next.at - w.lampsEver(), 'more lamp')} and ${next.what} joins your deck for good.</p>` : ''}
      <p class="muted">Your best road so far: ${plural(B.far, 'mile')}, ${plural(B.lamps, 'lamp')}. You will wake here if you fall. The coast goes on.</p>
      <div class="actions">
        <button class="primary" data-opt="0"><span class="key">1</span> Walk on</button>
        <button data-opt="1"><span class="key">2</span> Start a new journey</button>
      </div>
    </div>`;
  overlay.querySelector('.big').appendChild(portrait('lighthouse', 'sand'));
  overlay.hidden = false;
}
function confirmNewGame() {
  if (S().steps === 0) return w.newGame(S().mode);
  w.dialog(null, 'New journey?', 'Every card you have laid will be gone, and the coast will lie differently next time.', [
    { label: 'Start again', primary: true, do: () => w.newGame(S().mode) },
    { label: 'Walk differently', do: () => showModeSelect() },
    { label: 'Keep walking' },
  ]);
}
function showHelp() { w.dialog(null, 'How to play', '', [{ label: 'Back to the road', primary: true }], 'help'); }
function renderHelp() {
  overlay.innerHTML = `
    <div class="modal help" role="dialog" aria-labelledby="dlg-title">
      <h2 id="dlg-title">How to play</h2>
      <p>You are the one in yellow. The coast runs east, and every lighthouse on it is dark. There is no road, so you will have to lay one.</p>
      <h3>One card per step</h3>
      <p><b>You may lay one card for every step you take.</b> Lay, step, lay, step. Walking itself is never rationed: you can always step onto a tile that is already on the ground, and go back over old ground as often as you like.</p>
      <ul>
        <li><b>Lay.</b> Your hand holds three cards. Press <kbd>1</kbd>, <kbd>2</kbd> or <kbd>3</kbd> (or click) to pick one up, then press a direction, or click a marked space, to lay it beside you. You put it down and your hands are empty again: nothing is ever laid for you, so if you want another card down you pick another card up.</li>
        <li><b>Step.</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys move you onto any tile next to you. Clicking a neighbouring tile works too. With no card in your hands a direction is always just a step, even if there is open ground that way.</li>
        <li>Stepping onto a tile does what it says: pick up the coins, meet the traveller, wake the wolf.</li>
      </ul>
      <h3>Chapters</h3>
      <p>Every stretch of the land ends in something that bars the way: a river, a wall, a gorge, a briar, a mountain. Each has one way through, and what you need to open it is hidden somewhere in the stretch before it, face down. Read the signpost. Talk to people. Or find the pedlar and pay.</p>
      <p>Every third chapter begins at a dark lighthouse. Light it and it becomes a place to wake up, along with any campfire you have rested at. Run out of hearts and you come round at the last one, with everything you laid still on the ground.</p>
      <p><b>Every lamp you light stays lit, for good.</b> The coast keeps count across all your walks, not just this one, and pays you back for it: a signpost after the first, an old mine after the second, and on up through chests, hollows, wells, hives, shrines, pedlars and worse, each one joining your deck permanently. The road you can lay on your tenth journey is not the road you could lay on your first.</p>
      <h3>Two ways to walk</h3>
      <p>You can walk the road alone, or with one of three companions. On a walk together you each take a turn: your companion has a separate hand, lays one card after you lay one, and moves on revealed ground while you wait. Each class has its own attack and one way to solve a dangerous passage.</p>
      <h3>Action cards</h3>
      <p>Three cards work from the hand rather than the ground. <b>Rework</b> trades one of your cards for a fresh card from the deck. <b>Slipline</b> pulls a card already on the ground into your hand and leaves one of yours in its place. <b>Crossed deck</b> trades a card with your companion's hand, or with the deck when you walk alone. Picking an action card starts the swap; Esc puts it away unplayed, and you cannot lay one down.</p>
      <h3>Fights</h3>
      <p>Some of the land objects to company: a wolf, the bear, a toll keeper, a troll. When a fight starts you take turns: you, then (if they are alongside you) your companion, then the thing itself. Whatever you are holding is what you fight with; your companion has a class attack of their own. Every fight has a <b>Run</b>, and running is never a bad idea twice. Fall, and you come round at the last place you slept.</p>
      <h3>The road</h3>
      <p>Every card carries a stretch of road, and it joins up with the road on the cards around it. Water, stone and thorn carry no road at all. A bridge does, and so does a gate once it is unlocked.</p>
      <h3>Face-down cards, and the mist</h3>
      <p>Some cards were on the ground before you arrived, and they give nothing away: the ground over one looks like any other ground. Come alongside it, by walking or by laying a card, and it turns itself over. A lookout hill turns over everything within two spaces.</p>
      <p>Everything past your road is mist. What you can see of the land, you have to take as it looks: grass, unless there is water in it, because a river is wide enough to make out from a fair way off. Read the signposts and listen to travellers, because they know where things are and the mist does not tell you.</p>
      <h3>Sharing a coast</h3>
      <p>The address bar carries your coast's seed (<code>#seed=…</code>). Send the link and whoever opens it walks the same land, chapter for chapter, however differently they lay their road.</p>
      <p class="muted" style="margin-top:0.8rem">Your journey saves itself as you go. Press <kbd>H</kbd> for this page.</p>
      <div class="actions">
        <button class="primary" data-opt="0"><span class="key">1</span> Back to the road</button>
      </div>
    </div>`;
  overlay.hidden = false;
}

function renderBattle() {
  const battle = w.battle;
  if (!battle) return;
  const spec = battle.spec, s = S();
  const moves = w.battleMoves();
  overlay.innerHTML = `
    <div class="modal battle" role="dialog" aria-labelledby="bt-title">
      <h2 id="bt-title">A scrap</h2>
      <div class="b-fight">
        <div class="b-side foe">
          <div class="b-port"></div>
          <b>${spec.name}</b>
          <div class="hp"><i style="width:${Math.round(100 * battle.hp / spec.hearts)}%"></i></div>
        </div>
        <div class="b-mid">VS</div>
        <div class="b-side">
          <div class="b-fighter"><span class="b-pl">You</span><div class="hp"><i style="width:${Math.round(100 * s.hearts / s.maxHearts)}%"></i></div></div>
          ${battle.pat
      ? `<div class="b-fighter"><span class="b-pl pat">${w.partnerName()}</span><div class="hp good"><i style="width:${Math.round(100 * battle.pat.hp / battle.pat.max)}%"></i></div></div>`
      : `<p class="muted b-alone">${s.mode === 'coop' && s.partner ? `${w.partnerName()} is hurrying over.` : 'On your own.'}</p>`}
        </div>
      </div>
      <p class="b-last">${battle.last}</p>
      <div class="actions">
        ${moves.map((mv, i) => `<button class="${i === 0 && !mv.run ? 'primary' : ''}" data-bm="${i}" type="button"><span class="key">${i + 1}</span> ${mv.label}</button>`).join('')}
      </div>
      <p class="muted">Keys 1&ndash;${moves.length} pick a move. Esc turns and runs.</p>
    </div>`;
  overlay.querySelector('.b-port').appendChild(portrait(spec.sprite, spec.base));
  overlay.hidden = false;
}

// ---------- drawing the land ----------
// Everything is drawn in world units on `off`, whose context is scaled up by a whole number so
// one world pixel is Z screen pixels and every pixel stays square. The canvas is the whole
// window: the five rows you can walk sit in the middle of it, and the land carries on past them
// in every direction until the mist takes it.
function resize() {
  const cssW = Math.max(320, window.innerWidth);
  const cssH = Math.max(320, window.innerHeight);
  // Whole numbers only: half a pixel would fray the road art. Draw the tiles as large as the
  // window allows, so long as all five rows still fit in the gap the top bar and the card tray
  // leave over, a band of mist still fits above and below, and enough tiles still fit across for
  // you to see what is coming.
  const top = topbarEl.offsetHeight || 52;
  const bot = trayEl.offsetHeight || 190;
  const gap = Math.max(160, cssH - top - bot);
  Z = clamp(Math.min(
    Math.floor(cssH / ((ROWS + 2) * TILE)),
    Math.floor(gap / (ROWS * TILE)),
    Math.floor(cssW / (MIN_COLS * TILE))), 3, 9);
  viewW = Math.ceil(cssW / Z);
  viewH = Math.ceil(cssH / Z);
  // The road sits in the middle of that gap.
  const roadPx = ROWS * TILE * Z;
  let y = top + (cssH - top - bot - roadPx) / 2;
  if (y < 0 || y + roadPx > cssH) y = (cssH - roadPx) / 2;
  topY = clamp(Math.round(y / Z), 0, Math.max(0, viewH - ROWS * TILE));

  // Nothing about the land has actually changed: leave the canvas and the camera alone. Resizing
  // the canvas clears it, and snapping the camera in the middle of a step teleports the view.
  const layout = `${Z}:${viewW}:${viewH}:${topY}`;
  if (layout === lastLayout) { sizeCards(); return; }
  lastLayout = layout;

  off.width = viewW * Z; off.height = viewH * Z;
  octx.setTransform(Z, 0, 0, Z, 0, 0);                 // then draw in world units throughout
  octx.imageSmoothingEnabled = false;
  canvas.width = viewW * Z; canvas.height = viewH * Z;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  sprPx = SPRITE_PX;
  sizeCards();
  snapCamera();
}

// The cards in the tray are pixel art too, so their pictures are only ever drawn at a whole
// number of screen pixels per art pixel. The window picks which whole number, and the tray is
// laid out around it.
let artScale = 0;
function sizeCards() {
  const h = window.innerHeight, wd = window.innerWidth;
  const s = wd < 440 ? 3 : h < 660 || wd < 620 ? 4 : h < 860 || wd < 800 ? 5 : h < 1000 || wd < 1180 ? 6 : 8;
  if (s === artScale) return;
  artScale = s;
  document.documentElement.style.setProperty('--art', `${s * 16}px`);
  if (S()) renderHand();
}

function targetCam() { return Math.max(0, S().hero.c * TILE + TILE / 2 - viewW / 2); }
function snapCamera() { if (S()) camX = targetCam(); }
function snapHero() { hero.x = S().hero.c * TILE; hero.y = S().hero.r * TILE; }
function snapPat() { const p = S() && S().partner; if (p) { mara.x = p.c * TILE; mara.y = p.r * TILE; } }

// A settled scatter: the same square always jitters its light the same way, so the edge of the
// mist is ragged rather than a tidy row of circles, and it does not crawl as you walk.
function hash(r, c, k) {
  let h = (r * 374761393 + c * 668265263 + k * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The mist is painted on its own small canvas, a few pixels to the tile, then blown up smooth
// over the land. One soft round light is stamped out of it for every square you know anything
// about, and a wider one for wherever you are standing.
const fogCv = document.createElement('canvas');
const fctx = fogCv.getContext('2d');
let fogC0 = 0, fogCols = 0;

const LIGHT_IMG = (() => {
  const n = 64, c = document.createElement('canvas');
  c.width = c.height = n;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(n / 2, n / 2, n * 0.14, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.44, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.74, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, n, n);
  return c;
})();

function stamp(x, y, radTiles, strength, r, c) {
  const rad = radTiles * (0.84 + 0.3 * hash(r, c, 1)) * FOG_SS;
  const ox = (hash(r, c, 2) - 0.5) * FOG_SS * 0.5;
  const oy = (hash(r, c, 3) - 0.5) * FOG_SS * 0.5;
  fctx.globalAlpha = strength;
  fctx.drawImage(LIGHT_IMG, x + ox - rad, y + oy - rad, rad * 2, rad * 2);
}

function paintFog(c0, c1) {
  const cols = c1 - c0 + 1;
  const wd = cols * FOG_SS, h = Math.ceil(viewH / TILE * FOG_SS) + FOG_SS;
  if (fogCv.width !== wd || fogCv.height !== h) { fogCv.width = wd; fogCv.height = h; }
  const yOff = (topY / TILE) * FOG_SS;              // where row 0 falls on the mist canvas
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.globalAlpha = 1;
  fctx.fillStyle = FOG_COL;
  fctx.fillRect(0, 0, wd, h);

  fctx.globalCompositeOperation = 'destination-out';
  for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
    const cell = w.cellAt(r, c);
    if (!cell || !cell.up) continue;                // a card face down is no light and no clue
    stamp((c - c0 + 0.5) * FOG_SS, yOff + (r + 0.5) * FOG_SS, LIGHT_R, 1, r, c);
  }
  // and a wider light for you, so the ground opens up around wherever you stand. A single circle
  // would read as a lantern beam, so a few smaller ones are scattered round its edge, settled on
  // the square you are standing on: your pool of clear air is as lumpy as the rest of the mist,
  // and it takes a new shape each time you move.
  const hr = HERO_R * FOG_SS;
  const hx = (hero.x / TILE - c0 + 0.5) * FOG_SS, hy = yOff + (hero.y / TILE + 0.5) * FOG_SS;
  fctx.globalAlpha = 1;
  fctx.drawImage(LIGHT_IMG, hx - hr, hy - hr, hr * 2, hr * 2);
  const hrow = Math.round(hero.y / TILE), hcol = Math.round(hero.x / TILE);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5 + hash(hrow, hcol, 20 + i) * 0.2) * Math.PI * 2;
    const d = hr * (0.55 + 0.3 * hash(hrow, hcol, 30 + i));
    const rr = hr * (0.38 + 0.24 * hash(hrow, hcol, 40 + i));
    fctx.drawImage(LIGHT_IMG, hx + Math.cos(a) * d - rr, hy + Math.sin(a) * d - rr, rr * 2, rr * 2);
  }

  // the road is five rows wide and no wider: above and below it the mist closes back over
  fctx.globalCompositeOperation = 'source-over';
  fctx.globalAlpha = 1;
  const top0 = yOff, bot0 = yOff + ROWS * FOG_SS;
  if (top0 > 0) {
    const g = fctx.createLinearGradient(0, top0 - EDGE_ROWS * FOG_SS, 0, top0);
    g.addColorStop(0, FOG_COL); g.addColorStop(1, 'rgba(8, 10, 22, 0)');
    fctx.fillStyle = g; fctx.fillRect(0, 0, wd, top0);
  }
  if (bot0 < h) {
    const g = fctx.createLinearGradient(0, bot0, 0, bot0 + EDGE_ROWS * FOG_SS);
    g.addColorStop(0, 'rgba(8, 10, 22, 0)'); g.addColorStop(1, FOG_COL);
    fctx.fillStyle = g; fctx.fillRect(0, bot0, wd, h - bot0);
  }
  fogC0 = c0; fogCols = cols;
}

// A sprite standing on the tile at (x, y): centred across it, sitting near the bottom, and
// sized to a whole number of screen pixels per sprite pixel.
function drawStanding(img, x, y) {
  const dev = sprPx * 16;                  // the sprite, in screen pixels
  const slack = TILE * Z - dev;            // what is left of the tile, in screen pixels
  octx.drawImage(img, x + Math.round(slack / 2) / Z, y + Math.round(slack * 0.78) / Z, dev / Z, dev / Z);
}

function drawRoad(x, y, mask) {
  octx.fillStyle = ART.PAL.T;
  if (mask & 1) octx.fillRect(x + 5, y, 6, 8);
  if (mask & 2) octx.fillRect(x + 8, y + 5, 8, 6);
  if (mask & 4) octx.fillRect(x + 5, y + 8, 6, 8);
  if (mask & 8) octx.fillRect(x, y + 5, 8, 6);
  octx.fillRect(x + 5, y + 5, 6, 6);
  octx.fillStyle = ART.PAL.t;
  octx.fillRect(x + 7, y + 7, 1, 1);
  octx.fillRect(x + 9, y + 9, 1, 1);
  if (mask & 1) octx.fillRect(x + 6, y + 2, 1, 1);
  if (mask & 4) octx.fillRect(x + 9, y + 13, 1, 1);
  if (mask & 2) octx.fillRect(x + 13, y + 6, 1, 1);
  if (mask & 8) octx.fillRect(x + 2, y + 9, 1, 1);
}
function drawDotted(x, y, colour, alpha) {
  octx.fillStyle = colour;
  octx.globalAlpha = alpha;
  for (let i = 1; i < TILE - 1; i += 2) {
    octx.fillRect(x + i, y + 1, 1, 1);
    octx.fillRect(x + i, y + TILE - 2, 1, 1);
    octx.fillRect(x + 1, y + i, 1, 1);
    octx.fillRect(x + TILE - 2, y + i, 1, 1);
  }
  octx.globalAlpha = 1;
}

// What you take an unturned square to be: grass, unless it is part of a river running across
// the land, which you can see coming long before you can read the cards in it. Off the top and
// bottom of the road it is grass and pine, and none of your business.
const WATER_BASE = new Set(['water', 'bridge']);
function guessBase(cell, r, c) {
  if (cell && WATER_BASE.has(CARDS[cell.id].base)) return 'water';
  if (r < 0 || r >= ROWS) return hash(r, c, 7) < 0.32 ? 'woods' : 'grass';
  return 'grass';
}

function drawWalker(who, sprite, x, y, t, onCell) {
  if (onCell && onCell.id === 'river') drawStanding(ART.sprite('boat'), x, y + 2);
  if (t - who.ouch < 500 && Math.floor(t / 60) % 2) return;     // a hurt blink
  octx.fillStyle = ART.PAL.K; octx.globalAlpha = 0.3;
  octx.fillRect(x + 5, y + TILE - 2, 6, 1);
  octx.globalAlpha = 1;
  if (who.face < 0) {
    octx.save(); octx.translate(x + TILE, y); octx.scale(-1, 1);
    drawStanding(ART.sprite(sprite), 0, 0);
    octx.restore();
  } else drawStanding(ART.sprite(sprite), x, y);
}

function drawWorld(t) {
  const s = S(), action = w.action;
  octx.imageSmoothingEnabled = false;
  octx.fillStyle = FOG_COL;
  octx.fillRect(0, 0, viewW, viewH);
  const cx = Math.round(camX);
  const c0 = Math.max(0, Math.floor(cx / TILE) - 1);
  const c1 = Math.floor((cx + viewW) / TILE) + 1;
  const r0 = Math.floor(-topY / TILE);
  const r1 = Math.ceil((viewH - topY) / TILE);
  const placing = s.selected !== null && w.canPlace();
  const pulse = 0.18 + 0.14 * Math.sin(t / 220);

  // the land, as far as you would guess it runs
  for (let c = c0; c <= c1; c++) for (let r = r0; r < r1; r++) {
    const x = c * TILE - cx, y = topY + r * TILE;
    const cell = w.cellAt(r, c);
    if (!cell || !cell.up) {
      // a card face down looks like the ground it is lying on, and nothing else
      octx.drawImage(ART.base(guessBase(cell, r, c)), x, y);
      continue;
    }
    const def = CARDS[cell.id];
    const look = cell.used && def.spent ? def.spent : def;
    const baseName = look.base || def.base;
    octx.drawImage(ART.base(baseName), x, y);
    if (baseName !== 'bridge' && baseName !== 'plankbridge') {
      const m = w.roadMask(r, c);
      if (m || w.carriesRoad(cell)) drawRoad(x, y, m);
    }
    if (look.sprite) {
      const img = ART.sprite(look.sprite);
      if (FULL_TILE.has(look.sprite)) octx.drawImage(img, x, y);
      else drawStanding(img, x, y);
    }
    if (!cell.mine && cell.id !== 'home') {       // a quiet mark on the cards that were here before you
      octx.fillStyle = ART.PAL.W; octx.globalAlpha = 0.55; octx.fillRect(x + 13, y + 1, 2, 2); octx.globalAlpha = 1;
    }
  }
  // the faint grid that says "these are squares", across the rows you can walk
  octx.fillStyle = ART.PAL.K;
  octx.globalAlpha = 0.16;
  for (let c = c0; c <= c1 + 1; c++) octx.fillRect(c * TILE - cx, topY, 1, ROWS * TILE);
  for (let r = 1; r < ROWS; r++) octx.fillRect(0, topY + r * TILE, viewW, 1);
  octx.globalAlpha = 1;

  // the mist over all of it
  paintFog(c0, c1);
  octx.imageSmoothingEnabled = true;
  octx.drawImage(fogCv, fogC0 * TILE - cx, 0, fogCols * TILE, (fogCv.height / FOG_SS) * TILE);
  octx.imageSmoothingEnabled = false;

  // open ground beside you, and where the card in your hand would land: over the mist, because
  // these are your own marks on the map rather than anything the land is showing you
  for (const dir of DIR_KEYS) {
    const [dr, dc] = DIRS[dir];
    const r = s.hero.r + dr, c = s.hero.c + dc;
    if (!inBounds(r, c) || w.cellAt(r, c)) continue;
    const x = c * TILE - cx, y = topY + r * TILE;
    if (placing) {
      octx.fillStyle = ART.PAL.y;
      octx.globalAlpha = pulse;
      octx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      octx.globalAlpha = 1;
      octx.fillRect(x + 7, y + 5, 2, 6);
      octx.fillRect(x + 5, y + 7, 6, 2);
    } else drawDotted(x, y, ART.PAL.W, 0.34);
  }

  // where a slipline can reach: every whole, face-up card, and the one you have already picked
  if (action && action.type === 'slip' && action.phase === 'board') {
    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
      const cell = w.cellAt(r, c);
      if (!cell || !cell.up || cell.used) continue;
      if (cell.id === 'home' || cell.id === 'lighthouse') continue;
      const k = CARDS[cell.id].kind;
      if (k === 'action' || k === 'enemy' || k === 'block') continue;
      const x = c * TILE - cx, y = topY + r * TILE;
      octx.strokeStyle = ART.PAL.p;
      octx.globalAlpha = pulse * 1.4;
      octx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
      octx.globalAlpha = 1;
    }
    if (action.br != null) {
      const x = action.bc * TILE - cx, y = topY + action.br * TILE;
      octx.strokeStyle = ART.PAL.y; octx.lineWidth = 2;
      octx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      octx.lineWidth = 1;
    }
  }

  // you
  const moving = Math.abs(hero.x - s.hero.c * TILE) > 0.5 || Math.abs(hero.y - s.hero.r * TILE) > 0.5;
  drawWalker(hero, moving && Math.floor(t / 110) % 2 ? 'hero2' : 'hero',
    Math.round(hero.x) - cx, topY + Math.round(hero.y) - 1, t, w.cellAt(s.hero.r, s.hero.c));

  // the partner, when you are walking together. They share the road rather than owning it, so
  // they sit the same way: on a river, a boat; a hurt blink when they have been struck.
  if (s.mode === 'coop' && s.partner) {
    const p = s.partner;
    const patMoving = Math.abs(mara.x - p.c * TILE) > 0.5 || Math.abs(mara.y - p.r * TILE) > 0.5;
    const same = p.r === s.hero.r && p.c === s.hero.c;
    drawWalker(mara, patMoving && Math.floor(t / 110) % 2 ? 'maren2' : 'maren',
      Math.round(mara.x) - cx + (same ? TILE * 0.4 : 0), topY + Math.round(mara.y) - 1, t, w.cellAt(p.r, p.c));
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, 0);
}

function frame(t) {
  const dt = Math.min(50, t - lastT || 16);
  lastT = t;
  const s = S();
  if (s) {
    const k = 1 - Math.pow(0.001, dt / 1000);     // settle in about a fifth of a second
    const ease = (o, tx, ty) => {
      o.x += (tx - o.x) * Math.min(1, k * 1.4);
      o.y += (ty - o.y) * Math.min(1, k * 1.4);
      if (Math.abs(tx - o.x) < 0.3) o.x = tx;
      if (Math.abs(ty - o.y) < 0.3) o.y = ty;
    };
    ease(hero, s.hero.c * TILE, s.hero.r * TILE);
    if (s.mode === 'coop' && s.partner) ease(mara, s.partner.c * TILE, s.partner.r * TILE);
    const tc = targetCam();
    camX += (tc - camX) * Math.min(1, k * 0.8);
    if (Math.abs(tc - camX) < 0.3) camX = tc;
    drawWorld(t);
  }
  requestAnimationFrame(frame);
}

// ---------- rendering the page around the land ----------
function render() {
  renderHand();
  renderStats();
  renderQuests();
  renderInv();
  renderLog();
  if (!hintEl.classList.contains('flash')) hintEl.textContent = w.defaultHint();
}

function renderHand() {
  const s = S(), action = w.action;
  const laying = w.canPlace() && w.hasEmptyNeighbour();
  handEl.innerHTML = '';
  s.hand.forEach((id, i) => {
    const d = CARDS[id];
    const isAction = d.kind === 'action';
    let disabled = !laying;
    if (isAction) disabled = !!(action && action.type !== 'cross' && action.type !== 'rework');
    else if (action) disabled = !w.actionPickable(i);
    const b = document.createElement('button');
    b.className = 'hcard' + (s.selected === i ? ' sel' : '') + (isAction ? ' action' : '');
    b.type = 'button';
    b.dataset.kind = d.kind; b.dataset.i = i;
    b.title = d.text;
    b.setAttribute('aria-label', `${d.name}: ${d.text}`);
    b.setAttribute('aria-pressed', s.selected === i);
    b.disabled = disabled;
    b.innerHTML = `<span class="key">${i + 1}</span><span class="pic"></span><span class="name">${d.name}</span><span class="text">${d.text}</span>`;
    b.querySelector('.pic').appendChild(ART.iconCanvas(d.sprite, artScale || 8, d.base, true));
    handEl.appendChild(b);
  });
  turnEl.textContent = w.turnLabel();
  document.body.dataset.phase = w.phaseName();
}

function renderStats() {
  const s = S(), B = w.BEST;
  statsEl.innerHTML = '';
  const hearts = document.createElement('span');
  hearts.className = 'stat hearts' + (s.hearts <= 1 ? ' low' : '');
  hearts.title = `${s.hearts} of ${s.maxHearts} hearts`;
  for (let i = 0; i < s.maxHearts; i++) hearts.appendChild(ART.iconCanvas(i < s.hearts ? 'heart' : 'heartoff', 2));
  statsEl.appendChild(hearts);
  if (s.mode === 'coop' && s.partner) {
    const p = document.createElement('span');
    p.className = 'stat pat';
    p.title = `${w.partnerName()}'s ${s.partner.hearts} of ${s.partner.maxHearts} hearts`;
    for (let i = 0; i < s.partner.maxHearts; i++) p.appendChild(ART.iconCanvas(i < s.partner.hearts ? 'patheart' : 'patheartoff', 2));
    statsEl.appendChild(p);
  }
  const stat = (icon, value, title) => {
    const el = document.createElement('span');
    el.className = 'stat'; el.title = title;
    el.appendChild(ART.iconCanvas(icon, 2));
    const b = document.createElement('b'); b.textContent = value;
    el.appendChild(b);
    statsEl.appendChild(el);
  };
  stat('coin', s.coins, 'Coins');
  stat('flag', s.far, `Miles east. Best: ${B.far}`);
  const next = w.nextLampCard();
  stat(s.lamps ? 'lamp' : 'lampdark', s.lamps,
    `Lamps lit on this walk. Best: ${B.lamps}. ${plural(w.lampsEver(), 'lamp')} lit on this coast all told`
    + (next ? `, ${plural(next.at - w.lampsEver(), 'more')} for ${next.what}.` : ', and the whole deck is yours.'));
}

function renderQuests() {
  questEl.innerHTML = '';
  w.quests().forEach((q) => {
    const li = document.createElement('li');
    li.className = q.goal ? 'goal' : '';
    const ic = document.createElement('span'); ic.className = 'q-icon';
    ic.appendChild(ART.iconCanvas(q.icon, 1));
    const tx = document.createElement('span'); tx.textContent = q.text;
    li.appendChild(ic); li.appendChild(tx);
    questEl.appendChild(li);
  });
}

function renderInv() {
  const s = S();
  invEl.innerHTML = '';
  const have = Object.keys(ITEMS).filter((k) => s.inv[k]);
  if (!have.length) { invEl.innerHTML = '<span class="none">Nothing but the clothes you stand in.</span>'; return; }
  have.forEach((k) => {
    const el = document.createElement('span');
    el.className = 'item';
    el.appendChild(ART.iconCanvas(ITEMS[k].sprite, 1));
    el.appendChild(document.createTextNode(ITEMS[k].name));
    invEl.appendChild(el);
  });
}

function renderLog() {
  logEl.innerHTML = S().log.map((t) => `<li>${t}</li>`).join('');
}

// ---------- input ----------
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const dlg = w.dlg, battle = w.battle, action = w.action;
  if (k === 'escape' && (action || (battle && !dlg))) { e.preventDefault(); if (battle && !action) w.battleMove(-1); else w.cancelAction(); return; }
  if (dlg) {
    if (k === 'escape') { e.preventDefault(); w.chooseOption(dlg.escape != null ? dlg.escape : dlg.options.length - 1); }
    else if (/^[1-9]$/.test(k)) { e.preventDefault(); w.chooseOption(+k - 1); }
    return;
  }
  if (modeSelect) {
    if (k === '1') chooseMode('solo');
    else if (k === '2') chooseMode('coop');
    return;
  }
  if (battle) {
    if (/^[1-9]$/.test(k)) { e.preventDefault(); w.battleMove(+k - 1); }
    else if (k in KEYDIR) e.preventDefault();
    return;
  }
  if (k in KEYDIR) { e.preventDefault(); w.act(KEYDIR[k]); }
  else if (k === '1' || k === '2' || k === '3') { e.preventDefault(); w.handPick(+k - 1); }
  else if (k === 'escape') w.deselect();
  else if (k === '?' || k === 'h') showHelp();
});

canvas.addEventListener('click', (e) => {
  if (w.dlg || modeSelect) return;
  const s = S(), action = w.action;
  const box = canvas.getBoundingClientRect();
  const wx = (e.clientX - box.left) / Z + Math.round(camX);
  const wy = (e.clientY - box.top) / Z - topY;
  const c = Math.floor(wx / TILE), r = Math.floor(wy / TILE);
  if (!inBounds(r, c)) return;
  if (action) {
    if (action.type === 'slip' && action.phase === 'board') w.pickSlipBoard(r, c);
    else flash(`${w.actionHint()} (Esc cancels.)`);
    return;
  }
  if (!w.isAdjacent(r, c)) { if (!(r === s.hero.r && c === s.hero.c)) flash('Too far. You can only reach the tiles next to you.'); return; }
  if (!w.cellAt(r, c)) {
    if (!w.canPlace()) flash('Your card is already down. Take your step first.');
    else if (s.selected === null) flash('Pick a card from your hand first (1, 2, 3).');
    else if (CARDS[s.hand[s.selected]].kind === 'action') flash('Action cards are played, not laid. Use 1, 2 or 3.');
    else w.placeAt(r, c);
    return;
  }
  w.tryMove(r, c);
});

handEl.addEventListener('click', (e) => {
  const b = e.target.closest('.hcard');
  if (b && !b.disabled) w.handPick(+b.dataset.i);
});

document.querySelector('.dpad').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dir]');
  if (b && !w.dlg && !modeSelect && !w.battle && !w.action) w.act(b.dataset.dir);
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'help') showHelp();
  else if (a === 'close') { w.closeDialog(); render(); }
  else if (a === 'new-game') confirmNewGame();
  else if (a === 'rail') document.body.classList.toggle('rail-open');
});

overlay.addEventListener('click', (e) => {
  const bm = e.target.closest('[data-bm]');
  if (bm) { w.battleMove(+bm.dataset.bm); return; }
  const mb = e.target.closest('[data-mode]');
  if (mb) {
    if (mb.dataset.mode === 'coop') {
      const choices = overlay.querySelector('.companion-opts');
      if (choices) { choices.hidden = false; mb.closest('.mode-opts').hidden = true; choices.querySelector('button')?.focus(); }
    } else chooseMode(mb.dataset.mode);
    return;
  }
  const cb = e.target.closest('[data-companion]');
  if (cb) { chooseMode('coop', cb.dataset.companion); return; }
  const b = e.target.closest('[data-opt]');
  if (b) { w.chooseOption(+b.dataset.opt); return; }
  if (e.target === overlay && w.dlg && w.dlg.kind === 'help') { w.closeDialog(); render(); }
});

window.addEventListener('resize', () => { resize(); });
window.addEventListener('orientationchange', () => { resize(); });
// The tray grows and shrinks with the card in hand, and the road recentres itself under it.
if (window.ResizeObserver) new ResizeObserver(() => { if (S()) resize(); }).observe(trayEl);

// ---------- go ----------
persist();                       // keep the land that was just generated, so it lies the same next time
if (S().partner) snapPat();
snapHero();
resize();
render();
if (hadSave && pendingSeed == null) {
  writeSeed(S().seed);
  hint('Welcome back. Your road is where you left it.');
} else showModeSelect();
requestAnimationFrame(frame);
// the partner's turns while you stand still
setInterval(() => { if (S() && !modeSelect) w.partnerTurn(); }, 1400);

// Small hook for smoke tests.
expose('__wayside', {
  get S() { return w.S; }, get BEST() { return w.BEST; }, CARDS, CHAPTERS, DECK, LAMP_CARDS,
  deck: w.deck, draw: w.draw, lampsEver: w.lampsEver, lampCardsWon: w.lampCardsWon, nextLampCard: w.nextLampCard,
  countLampEver: w.countLampEver, render,
  get battle() { return w.battle; }, get action() { return w.action; },
  setMode: (m) => { if (!w.dlg && !w.battle) chooseMode(m); },
  partnerTurn: w.partnerTurn, tryMove: w.tryMove, placeAt: w.placeAt, moveTo: w.moveTo, act: w.act,
  handPick: w.handPick, actionPick: w.actionPick, pickSlipBoard: w.pickSlipBoard,
  battleMove: w.battleMove, startBattle: w.startBattle, showModeSelect,
  get view() { return { Z, topY, viewW, viewH, camX: Math.round(camX), TILE, ROWS }; },
  setLampsEver: (n) => { w.setLampsEver(n); render(); },
  ensureGenerated: w.ensureGenerated, cellAt: w.cellAt, ROWS, LIGHTHOUSE_EVERY, ITEMS,
  sim: w,
  text: () => JSON.stringify({ seed: w.S.seed, hero: w.S.hero, chapter: w.here().i, hearts: w.S.hearts, coins: w.S.coins, inv: w.S.inv, dlg: w.dlg && w.dlg.title, battle: w.battle && w.battle.id }),
});
