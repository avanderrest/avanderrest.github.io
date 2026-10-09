/* Lantern Deep: the Dungeon Master's map editor. While an AI plays the hero, the rooms beside
   the ones the hero has seen glow on the map, and the Dungeon Master fills them: pick a
   creature, a thing, or something to leave on the floor from the palette under the map, then
   tap a tile in a glowing room to put it there. Tap what is placed to choose its options (a
   creature's name, who it is, its temper and wits; a chest's trap and contents; what the
   fountain's water does) or to take it away again; with nothing picked, tap an empty tile to
   move it there. The room the hero is in, and every room they have been in, is settled.

   It edits only the sim's plans (setPlan(), which checks everything again), and says why when
   something is refused. The view owns the canvas: it hands taps over as tiles, and draws what
   scene() returns. */

import { monstersFor, featuresFor, weaponsFor, lootFor, cleanPlan, TEMPERS, WITS, TRAPS, GOLDS, EFFECTS, DM_THINGS, SNARES } from './sim.js';
import { MONSTERS, ITEMS, WEAPONS } from './content.js';

// ---------- constants ----------
export const FEATURE_LABEL = {
  chest: ['A chest', 'gold, maybe more', 89], altar: ['An altar', 'a blessing', 65], fountain: ['A fountain', 'who knows?', 20],
  corpse: ['A body', 'loot, maybe grubs', 64], shelf: ['Old books', 'a map of the floor', 63], camp: ['A campfire', 'a rest', 'fire'],
  merchant: ['The pedlar', 'sells potions', 85], statue: ['A statue', 'a hidden cache', 7],
  // only a Dungeon Master places these
  note: ['A note', 'in your own words', 'note'], snare: ['A snare', 'hidden from the hero', 'snare'],
};
const TEMPER_LABEL = { friendly: 'Friendly', wary: 'Wary', fierce: 'Fierce', asleep: 'Asleep' };
const TEMPER_NOTE = { friendly: 'Means no harm and will not fight. Give it a gift for the hero, and it hands it over when spoken to.', wary: 'Stands in the way; fights, or can be crept past.', fierce: 'Goes for the hero the moment they walk in, and is hard to talk down.', asleep: 'The hero can tiptoe on by, or ambush it; nothing here can be taken while it sleeps.' };
const SNARE_LABEL = { pit: 'A pit', darts: 'Darts', gas: 'Gas' };
const SNARE_NOTE = { pit: 'A hidden drop: hurts, a nimble hero takes half.', darts: 'A tripwire and a wall of darts: hurts, a nimble hero takes half.', gas: 'A glass bulb underfoot: poisons, a hardy hero shrugs it off.' };
const WITS_LABEL = { dull: 'Dull', average: 'Average', sharp: 'Sharp' };
const WITS_NOTE = { dull: 'Cannot be reasoned with, and easier to creep past.', average: 'As its kind usually is.', sharp: 'Can be reasoned with, even a beast, and is harder to creep past.' };
const TRAP_LABEL = { none: 'No trap', needle: 'Needle trap', mimic: 'A mimic' };
const GOLD_LABEL = { dice: 'The dice decide', none: 'None', some: 'Some', lots: 'Lots' };
const EFFECT_LABEL = { random: 'Who knows?', heal: 'Healing', hardy: 'Strength', clarity: 'Clarity', poison: 'Poison', plain: 'Just water' };
const CONTAINERS = ['chest', 'corpse', 'statue'];
const MAX_ITEMS = 3;
const dangerPips = (xp) => { const n = xp < 15 ? 1 : xp < 32 ? 2 : xp < 60 ? 3 : 4; return '●'.repeat(n) + '○'.repeat(4 - n); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const species = (k) => MONSTERS[k].name.replace(/^the /, '');

// options a newly placed thing starts with
function fresh(cat, kind, floor) {
  if (cat === 'foe') return { kind, temper: 'wary', wits: 'average', name: '', who: '' };
  if (kind === 'coins') return { kind, gold: 'some' };
  if (kind === 'item') return { kind, item: lootFor(floor)[0] };
  if (ITEMS[kind]) return { kind: 'item', item: kind };
  if (WEAPONS[kind]) return { kind: 'weapon', weapon: kind };
  if (kind === 'note') return { kind, text: '' };
  if (kind === 'snare') return { kind, snare: 'pit' };
  const t = { kind };
  if (kind === 'chest') Object.assign(t, { trap: 'none', gold: 'dice', items: null, weapon: null });
  if (kind === 'corpse') Object.assign(t, { gold: 'dice', items: null, grubs: false });
  if (kind === 'statue') Object.assign(t, { gold: 'dice', items: null });
  if (kind === 'fountain') t.effect = 'random';
  return t;
}

// root: the panel's element; icon(idx, px) and esc(s) from the view; onChange() after any
// edit (the view saves and redraws)
export function createEditor({ g, root, icon, esc, onChange = () => {} }) {
  const st = { room: null, brush: null, sel: null, msg: '', hover: null, flash: null, waited: '' };
  const FLASH = 700;   // ms a refused tile shows red after a tap (a finger has no hover)
  // the map is the Dungeon Master's only once the story has begun
  const open = () => S().mode !== 'prologue';
  const S = () => g.S;
  const rooms = () => S().map.rooms;
  const editable = () => g.editable();
  const plan = (id) => rooms()[id].plan || { foes: [], things: [] };
  const clone = (p) => JSON.parse(JSON.stringify(p));
  const roomAt = (tx, ty) => { for (const r of rooms()) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r.id; return null; };
  const entryAt = (id, tx, ty) => {
    const p = plan(id);
    let i = p.foes.findIndex((f) => f.x === tx && f.y === ty); if (i >= 0) return { list: 'foes', i };
    i = p.things.findIndex((t) => t.x === tx && t.y === ty); if (i >= 0) return { list: 'things', i };
    return null;
  };
  const icn = (kind, cat, px = 28) => {
    if (cat === 'foe') return icon(MONSTERS[kind].sprite, px);
    if (kind === 'coins') return '<i class="ld-coin" aria-hidden="true"></i>';
    if (kind === 'camp') return '<i class="ld-fire" aria-hidden="true"></i>';
    if (kind === 'note') return '<i class="ld-noteic" aria-hidden="true"></i>';
    if (kind === 'snare') return '<i class="ld-snareic" aria-hidden="true"></i>';
    if (ITEMS[kind]) return icon(ITEMS[kind].sprite, px);
    if (WEAPONS[kind]) return icon(WEAPONS[kind].sprite, px);
    return icon(FEATURE_LABEL[kind][2], px);
  };

  // Why the picked thing cannot go on this tile, or null if it can. A dry run of the sim's own
  // check (cleanPlan changes nothing), so the hover, a tap and the rules always agree.
  function refusal(tx, ty) {
    const b = st.brush, id = roomAt(tx, ty);
    if (!b) return 'Pick something first.';
    if (!open()) return 'The map opens once the story has begun.';
    if (id == null || !editable().includes(id)) return 'Only the glowing rooms can take anything.';
    if (entryAt(id, tx, ty)) return 'Something is already on that tile.';
    const p = clone(plan(id)), menu = g.furnishMenu(id), r = rooms()[id], list = b.cat === 'foe' ? 'foes' : 'things';
    p[list].push({ ...fresh(b.cat, b.kind, S().floor), x: tx, y: ty });
    if (cleanPlan(S().map, id, p)[list].length === p[list].length) return null;
    const peace = menu.peaceful;
    return b.cat === 'foe' && r.start ? `Nothing lies in wait here: ${S().hero.name} starts in this room.`
      : b.cat === 'foe' && r.throne ? 'The throne room is the boss’s alone.'
        : b.cat === 'foe' && p.things.some((t) => peace.includes(t.kind)) ? 'Not beside the pedlar or a campfire: move those first.'
          : peace.includes(b.kind) && (p.foes.length > 0 || r.throne) ? (b.kind === 'merchant' ? 'The pedlar will not set up beside a monster.' : 'Nobody lights a campfire next to a monster.')
            : b.kind === 'merchant' ? 'There is already a pedlar on this floor.'
              : 'This room is full.';
  }
  // Put a thing on a tile, or say why not (and flash the tile red).
  function place(id, tx, ty) {
    const why = refusal(tx, ty);
    if (why) { st.msg = why; st.flash = { x: tx, y: ty, t: performance.now() }; return false; }
    const b = st.brush, p = clone(plan(id)), list = b.cat === 'foe' ? 'foes' : 'things';
    p[list].push({ ...fresh(b.cat, b.kind, S().floor), x: tx, y: ty });
    const kept = g.setPlan(id, p);
    st.msg = '';
    st.sel = { list, i: kept[list].length - 1 };
    return true;
  }
  // Change the selected entry; the sim tidies it (setPlan), and the panel is redrawn unless
  // a text box is being typed in.
  function update(mut, redraw = true) {
    if (st.room == null || !st.sel) return;
    const p = clone(plan(st.room)), e = p[st.sel.list][st.sel.i];
    if (!e) return;
    mut(e);
    g.setPlan(st.room, p);
    onChange();
    if (redraw) render();
  }
  function remove() {
    if (st.room == null || !st.sel) return;
    const p = clone(plan(st.room));
    p[st.sel.list].splice(st.sel.i, 1);
    g.setPlan(st.room, p);
    st.sel = null; st.msg = '';
    onChange(); render();
  }

  // A tap on the map, as a tile.
  function tap(tx, ty) {
    if (!S().map || !open()) return;
    const id = roomAt(tx, ty);
    st.msg = '';
    const ed = id != null && editable().includes(id);
    // a picked thing tapped somewhere it cannot go: say so, on the map and in the panel
    if (st.brush && !ed) { st.msg = refusal(tx, ty); st.flash = { x: tx, y: ty, t: performance.now() }; if (id != null) { st.room = id; st.sel = null; } render(); return; }
    if (id == null) { st.sel = null; render(); return; }
    if (!ed) { st.room = id; st.sel = null; render(); return; }
    if (st.room !== id) st.sel = null;
    st.room = id;
    const at = entryAt(id, tx, ty);
    if (at) st.sel = at;
    else if (st.brush) place(id, tx, ty);
    else if (st.sel) update((e) => { e.x = tx; e.y = ty; }, false);
    onChange(); render();
  }
  function hoverAt(tx, ty) {
    if (tx == null) { st.hover = null; return; }
    const id = roomAt(tx, ty);
    st.hover = st.brush && open() ? { x: tx, y: ty, ok: !refusal(tx, ty), room: id != null } : null;
  }
  // what the map draws for the Dungeon Master
  function scene() {
    const e = st.room != null && st.sel ? plan(st.room)[st.sel.list][st.sel.i] : null;
    const flash = st.flash && performance.now() - st.flash.t < FLASH ? { x: st.flash.x, y: st.flash.y, k: 1 - (performance.now() - st.flash.t) / FLASH } : null;
    return { editable: editable(), room: st.room, pick: e ? { x: e.x, y: e.y } : null, hover: st.hover, flash };
  }
  // the dice's own pick for a room, as a plan (where things stand is the sim's to choose)
  function rollFor(id) {
    const menu = g.furnishMenu(id);
    if (!menu.suggest) return false;
    g.setPlan(id, clone(menu.suggest));
    st.room = id; st.sel = null; st.msg = '';
    onChange(); render();
    return true;
  }
  function reset() { st.room = null; st.brush = null; st.sel = null; st.msg = ''; }

  // ---------- the panel ----------
  function render() {
    if (!S().map || S().role !== 'dm') { root.innerHTML = ''; return; }
    const floor = S().floor, ed = editable();
    if (st.room != null && !rooms()[st.room]) reset();
    // when the hero reaches a door, its room is the one to look at (once: after that the
    // Dungeon Master looks where they like)
    const waiting = S().mode === 'furnish' ? S().floor + ':' + S().furnish.to : '';
    if (waiting && st.waited !== waiting) { st.waited = waiting; st.room = S().furnish.to; st.sel = null; }
    const off = !open();
    root.classList.toggle('ld-off', off);
    if (off) st.brush = null;
    const tool = (cat, kind, name, sub) => `<button type="button" class="ld-tool${st.brush && st.brush.cat === cat && st.brush.kind === kind ? ' on' : ''}" data-cat="${cat}" data-kind="${kind}" title="${esc(name)}${sub ? ' · ' + esc(sub) : ''}" aria-pressed="${!!(st.brush && st.brush.kind === kind)}"${off ? ' disabled' : ''}>${icn(kind, cat)}<span>${esc(name)}</span></button>`;
    const palette = `<div class="ld-pal">
      <p class="ld-pal-h">Creatures</p><div class="ld-tools">${monstersFor(floor).map((k) => tool('foe', k, cap(species(k)), dangerPips(MONSTERS[k].xp))).join('')}</div>
      <p class="ld-pal-h">Things</p><div class="ld-tools">${[...featuresFor(), ...DM_THINGS].map((k) => tool('thing', k, FEATURE_LABEL[k][0].replace(/^(A|An|The) /, ''), FEATURE_LABEL[k][1])).join('')}</div>
      <p class="ld-pal-h">On the floor</p><div class="ld-tools">${tool('thing', 'coins', 'Coins')}${Object.keys(ITEMS).map((k) => tool('thing', k, ITEMS[k].name)).join('')}${weaponsFor(floor).map((k) => tool('thing', k, WEAPONS[k].name)).join('')}</div></div>`;
    const hint = off ? 'The map opens once the story has begun: write the opening on the scroll first.' : st.brush ? `Tap a tile in a glowing room to put ${esc(brushName())} there. <button type="button" class="ld-link" data-act="unbrush">Done placing</button>`
      : ed.length ? 'The rooms glowing on the map are yours to fill. Pick something above, then tap a tile in one of them.' : 'Nowhere new to fill just now: the hero has seen every room beside them.';
    root.innerHTML = `<h3 class="ld-ed-h">The Dungeon Master’s map</h3>${palette}<p class="ld-ed-hint">${hint}</p>${st.msg ? `<p class="ld-ed-msg">${esc(st.msg)}</p>` : ''}${off ? '' : `<div class="ld-insp">${inspector()}</div>`}`;
    root.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => {
      const same = st.brush && st.brush.kind === b.dataset.kind;
      st.brush = same ? null : { cat: b.dataset.cat, kind: b.dataset.kind }; st.msg = '';
      render(); onChange();
    });
    root.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => act(b.dataset.act, b.dataset));
    root.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { const [list, i] = b.dataset.sel.split(':'); st.sel = st.sel && st.sel.list === list && st.sel.i === +i ? null : { list, i: +i }; render(); onChange(); });
    root.querySelectorAll('[data-opt]').forEach((b) => b.onclick = () => setOpt(b.dataset.opt, b.dataset.val));
    const name = root.querySelector('#ld-ed-name'), who = root.querySelector('#ld-ed-who'), words = root.querySelector('#ld-ed-note');
    if (name) name.oninput = () => update((e) => { e.name = name.value; }, false);
    if (who) who.oninput = () => update((e) => { e.who = who.value; }, false);
    if (words) words.oninput = () => update((e) => { e.text = words.value; }, false);
    // a name, a part or a note is final when the box is left; the list then shows it
    for (const box of [name, who, words]) if (box) box.onchange = () => render();
  }
  function brushName() {
    const b = st.brush; if (!b) return '';
    if (b.cat === 'foe') return `a ${species(b.kind)}`;
    if (b.kind === 'coins') return 'some coins';
    if (ITEMS[b.kind]) return `a ${ITEMS[b.kind].name.toLowerCase()}`;
    if (WEAPONS[b.kind]) return `a ${WEAPONS[b.kind].name.toLowerCase()}`;
    return FEATURE_LABEL[b.kind][0].toLowerCase();
  }
  function act(what) {
    if (what === 'unbrush') { st.brush = null; render(); onChange(); }
    if (what === 'remove') remove();
    if (what === 'roll') rollFor(st.room);
    if (what === 'clear') { g.setPlan(st.room, { foes: [], things: [] }); st.sel = null; onChange(); render(); }
  }
  function setOpt(opt, val) {
    update((e) => {
      if (opt === 'temper' || opt === 'wits' || opt === 'trap' || opt === 'gold' || opt === 'effect' || opt === 'item' || opt === 'snare') e[opt] = val;
      if (opt === 'gift') e.gift = val || null;
      if (opt === 'weapon') e.weapon = val || null;
      if (opt === 'grubs') e.grubs = !e.grubs;
      if (opt === 'dice') e.items = e.items ? null : [];
      if (opt === 'take') {
        const items = e.items ? e.items.slice() : [];
        const k = items.indexOf(val);
        if (k >= 0) items.splice(k, 1); else if (items.length < MAX_ITEMS) items.push(val);
        e.items = items;
      }
    });
  }
  function inspector() {
    if (st.room == null) return '<p class="ld-insp-none">Tap a room on the map to see what is in it.</p>';
    const r = rooms()[st.room], ed = editable().includes(st.room), hero = S().hero.name;
    const title = `<h4>${esc(cap(r.name.replace(/^the /, '')))}${r.stairs ? ' <small>the stair down is here</small>' : r.throne ? ' <small>the throne</small>' : r.start ? ' <small>the foot of the stair</small>' : ''}</h4>`;
    if (!ed) {
      const why = r.id === S().at ? `${hero} is in this room, so it is settled.` : r.visited ? `${hero} has been here, so it is settled.` : 'Too far ahead to see into yet. It will glow once the hero is next door.';
      return `${title}<p class="ld-insp-none">${esc(why)}</p>`;
    }
    const p = plan(st.room);
    const rows = [];
    if (r.throne && r.foes[0]) rows.push(`<li class="ld-row-fixed">${icn(r.foes[0].kind, 'foe')}<span>${esc(cap(MONSTERS[r.foes[0].kind].name))}<small>waits on the throne</small></span></li>`);
    p.foes.forEach((f, i) => rows.push(row('foes', i, icn(f.kind, 'foe'), f.name ? `${f.name}` : cap(species(f.kind)), `${f.name ? species(f.kind) + ', ' : ''}${TEMPER_LABEL[f.temper].toLowerCase()}, ${WITS_LABEL[f.wits].toLowerCase()}${f.gift ? `, has a ${ITEMS[f.gift].name.toLowerCase()} for the hero` : ''}`)));
    p.things.forEach((t, i) => rows.push(row('things', i, icn(t.kind === 'item' ? t.item : t.kind === 'weapon' ? t.weapon : t.kind, 'thing'), thingName(t), thingSub(t))));
    const sel = st.sel && p[st.sel.list][st.sel.i];
    return `${title}${rows.length ? `<ul class="ld-plan">${rows.join('')}</ul>` : `<p class="ld-insp-none">Empty so far. ${r.start ? `${esc(hero)} will start here.` : ''}</p>`}
      ${sel ? options(sel) : ''}
      <div class="ld-insp-row">${!r.start && !r.throne ? '<button type="button" class="ld-seg" data-act="roll">Leave this room to fate</button>' : ''}${rows.length ? '<button type="button" class="ld-seg" data-act="clear">Clear the room</button>' : ''}</div>`;
  }
  function row(list, i, ic, name, sub) {
    const on = st.sel && st.sel.list === list && st.sel.i === i;
    return `<li class="${on ? 'on' : ''}"><button type="button" class="ld-row-pick" data-sel="${list}:${i}" aria-expanded="${on}">${ic}<span>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><b aria-hidden="true">${on ? '▴' : '▾'}</b></button></li>`;
  }
  function thingName(t) {
    if (t.kind === 'coins') return t.gold === 'lots' ? 'A heap of coins' : 'A few coins';
    if (t.kind === 'item') return ITEMS[t.item].name;
    if (t.kind === 'weapon') return WEAPONS[t.weapon].name;
    if (t.kind === 'snare') return SNARE_LABEL[t.snare] === 'Darts' ? 'A dart trap' : SNARE_LABEL[t.snare] === 'Gas' ? 'A gas trap' : 'A hidden pit';
    return FEATURE_LABEL[t.kind][0];
  }
  function thingSub(t) {
    if (t.kind === 'chest') return [TRAP_LABEL[t.trap].toLowerCase(), contents(t)].filter(Boolean).join(', ');
    if (t.kind === 'corpse') return [t.grubs ? 'rot grubs' : '', contents(t)].filter(Boolean).join(', ');
    if (t.kind === 'statue') return contents(t);
    if (t.kind === 'fountain') return t.effect === 'random' ? 'the dice decide what the water does' : EFFECT_LABEL[t.effect].toLowerCase();
    if (t.kind === 'coins' || t.kind === 'item' || t.kind === 'weapon') return 'lying on the floor';
    if (t.kind === 'note') return t.text ? `“${t.text.length > 40 ? t.text.slice(0, 40) + '…' : t.text}”` : 'blank so far';
    if (t.kind === 'snare') return 'hidden from the hero';
    return FEATURE_LABEL[t.kind][1];
  }
  function contents(t) {
    if (t.gold === 'dice' && !t.items) return 'filled by the dice';
    const bits = [];
    if (t.gold !== 'dice' && t.gold !== 'none') bits.push(`${t.gold} gold`);
    if (t.items && t.items.length) bits.push(t.items.map((k) => ITEMS[k].name.toLowerCase()).join(', '));
    if (t.weapon) bits.push(WEAPONS[t.weapon].name.toLowerCase());
    return bits.join(', ') || 'empty';
  }
  function segs(opt, list, labels, cur, note) {
    return `<div class="ld-segs ld-opt">${list.map((v) => `<button type="button" class="ld-seg${cur === v ? ' on' : ''}" data-opt="${opt}" data-val="${v}" aria-pressed="${cur === v}">${esc(labels[v])}</button>`).join('')}</div>${note ? `<p class="ld-opt-note">${esc(note)}</p>` : ''}`;
  }
  function options(e) {
    const hero = S().hero.name, out = [];
    if (st.sel.list === 'foes') {
      out.push(`<label class="ld-field"><span>Name <small>(optional)</small></span><input id="ld-ed-name" type="text" maxlength="40" value="${esc(e.name || '')}" placeholder="Tom" autocomplete="off"></label>`);
      out.push(`<label class="ld-field"><span>Who they are <small>(the AI plays ${esc(hero)} knowing this)</small></span><textarea id="ld-ed-who" rows="2" maxlength="240" placeholder="${esc(hero)}’s older brother, who ran off with the bandits two winters ago">${esc(e.who || '')}</textarea></label>`);
      out.push(`<p class="ld-opt-h">Temper</p>${segs('temper', TEMPERS, TEMPER_LABEL, e.temper, TEMPER_NOTE[e.temper])}`);
      out.push(`<p class="ld-opt-h">Wits</p>${segs('wits', WITS, WITS_LABEL, e.wits, WITS_NOTE[e.wits])}`);
      if (e.temper === 'friendly') out.push(`<p class="ld-opt-h">A gift for ${esc(hero)}</p><div class="ld-segs ld-opt"><button type="button" class="ld-seg${!e.gift ? ' on' : ''}" data-opt="gift" data-val="" aria-pressed="${!e.gift}">Nothing</button>${Object.keys(ITEMS).map((it) => `<button type="button" class="ld-seg ld-chip${e.gift === it ? ' on' : ''}" data-opt="gift" data-val="${it}" aria-pressed="${e.gift === it}">${icon(ITEMS[it].sprite, 18)}${esc(ITEMS[it].name)}</button>`).join('')}</div>`);
    } else {
      const k = e.kind, floor = S().floor;
      if (k === 'chest') out.push(`<p class="ld-opt-h">Trap</p>${segs('trap', TRAPS, TRAP_LABEL, e.trap)}`);
      if (CONTAINERS.includes(k)) {
        out.push(`<p class="ld-opt-h">Gold</p>${segs('gold', GOLDS, GOLD_LABEL, e.gold)}`);
        const items = e.items;
        out.push(`<p class="ld-opt-h">Inside <small>(up to ${MAX_ITEMS})</small></p><div class="ld-segs ld-opt"><button type="button" class="ld-seg${!items ? ' on' : ''}" data-opt="dice" aria-pressed="${!items}">The dice decide</button>${Object.keys(ITEMS).map((it) => `<button type="button" class="ld-seg ld-chip${items && items.includes(it) ? ' on' : ''}" data-opt="take" data-val="${it}" aria-pressed="${!!(items && items.includes(it))}">${icon(ITEMS[it].sprite, 18)}${esc(ITEMS[it].name)}</button>`).join('')}</div>`);
        if (k === 'chest') out.push(`<p class="ld-opt-h">A weapon</p>${segs('weapon', ['', ...weaponsFor(floor)], { '': 'None', ...Object.fromEntries(weaponsFor(floor).map((w) => [w, WEAPONS[w].name])) }, e.weapon || '')}`);
      }
      if (k === 'corpse') out.push(`<div class="ld-segs ld-opt"><button type="button" class="ld-seg${e.grubs ? ' on' : ''}" data-opt="grubs" aria-pressed="${!!e.grubs}">Rot grubs in it</button></div>`);
      if (k === 'fountain') out.push(`<p class="ld-opt-h">The water</p>${segs('effect', EFFECTS, EFFECT_LABEL, e.effect)}`);
      if (k === 'coins') out.push(`<p class="ld-opt-h">How much</p>${segs('gold', ['some', 'lots'], { some: 'A few', lots: 'A heap' }, e.gold)}`);
      if (k === 'item') out.push(`<p class="ld-opt-h">Which</p>${segs('item', Object.keys(ITEMS), Object.fromEntries(Object.keys(ITEMS).map((i) => [i, ITEMS[i].name])), e.item)}`);
      if (k === 'note') out.push(`<label class="ld-field"><span>What it says <small>(the hero reads it word for word)</small></span><textarea id="ld-ed-note" rows="3" maxlength="400" placeholder="Pip — if you are reading this, turn back. The thing on the throne is not the king. T.">${esc(e.text || '')}</textarea></label>`);
      if (k === 'snare') out.push(`<p class="ld-opt-h">What kind</p>${segs('snare', SNARES, SNARE_LABEL, e.snare, SNARE_NOTE[e.snare] + ' A sharp-eyed hero may spot it first.')}`);
      if (!out.length) out.push(`<p class="ld-opt-note">${esc(FEATURE_LABEL[k][0])}: ${esc(FEATURE_LABEL[k][1])}. Nothing to choose.</p>`);
    }
    return `<div class="ld-opts">${out.join('')}<p class="ld-opt-note">Tap an empty tile in this room to move it there.</p><div class="ld-insp-row"><button type="button" class="ld-seg ld-remove" data-act="remove">✕ Take it away</button></div></div>`;
  }

  return { tap, hoverAt, scene, render, reset, rollFor, get state() { return st; }, set brush(b) { st.brush = b; } };
}
