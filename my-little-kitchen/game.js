/* My Little Kitchen — a little cottage-kitchen cooking game.
   No timers you can fail, no scores. Tap things, make something, eat it.

   Pick a recipe on the shelf, then fetch a bowl from the cupboard and fill it
   from the fridge, the cupboard and the tap. Tap the full bowl and the view
   zooms in close — and stays close: you mix, roll, bake, decorate and eat at
   the bench, and only pull back out to the kitchen when it is all gone.

   Eleven recipes, in three shapes (RECIPES holds the differences):

     form 'tin', decorateAfter       recipe > gather > mix > bake > ice > eat
       cake, cupcake, brownies, banana bread, flapjacks
     form 'flat', decorateAfter      ...> mix > roll > bake > ice > eat
       big cookie, gingerbread, jam scone
     form 'flat', top-then-bake      ...> mix > roll > top > bake > eat
       pizza, garlic bread, berry tart

   A tin recipe with no flavour to pick carries its own `tone` so it bakes to
   the right colour; a flat one carries a `base` palette instead. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const shelf = $('shelf');
  const helper = $('helper');
  const stepsEl = $('steps');
  const countEl = $('cake-count');
  const muteBtn = $('mute');
  const resetBtn = $('reset');

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (c) => c.match(/\w\w/g).map((h) => parseInt(h, 16));
  const mixHex = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
  };
  const listWords = (arr) => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  /* ---------------- sound ---------------- */
  let muted = false;
  try { muted = localStorage.getItem('mlk-muted') === '1'; } catch (e) { /* ignore */ }
  let actx = null;
  function tone(freq, dur, type, vol, slide) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, actx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.15, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur + 0.02);
    } catch (e) { /* no audio */ }
  }
  /* soft rushing sound, for the tap and the rolling pin */
  function noise(dur, vol, cut) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const n = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource();
      src.buffer = buf;
      const f = actx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut || 1400;
      const g = actx.createGain();
      g.gain.value = vol || 0.08;
      src.connect(f).connect(g).connect(actx.destination);
      src.start();
    } catch (e) { /* no audio */ }
  }
  const sfx = {
    tap: () => tone(560, 0.07, 'triangle', 0.1),
    plop: () => tone(420, 0.16, 'sine', 0.2, -260),
    stir: () => tone(rand(160, 230), 0.05, 'triangle', 0.05),
    pour: () => tone(300, 0.6, 'sine', 0.08, -150),
    ding: () => { tone(880, 0.4, 'sine', 0.18); setTimeout(() => tone(1175, 0.6, 'sine', 0.18), 130); },
    sprinkle: () => { for (let i = 0; i < 4; i++) setTimeout(() => tone(rand(900, 1500), 0.05, 'square', 0.03), i * 40); },
    yay: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.13), i * 110)),
    no: () => tone(220, 0.2, 'sine', 0.1, -60),
    blow: () => tone(140, 0.5, 'sawtooth', 0.04, -80),
    door: () => tone(330, 0.12, 'triangle', 0.06, 120),
    pickup: () => tone(700, 0.09, 'triangle', 0.09, 200),
    whoosh: () => tone(500, 0.35, 'sine', 0.06, -380),
    munch: () => { tone(210, 0.1, 'square', 0.05, -90); setTimeout(() => tone(170, 0.12, 'square', 0.05, -70), 100); },
    roll: () => noise(0.18, 0.05, 700),
    splash: () => noise(0.55, 0.05, 3000),
    cheese: () => tone(rand(300, 380), 0.18, 'triangle', 0.07, 70),
  };
  function setMuteBtn() {
    muteBtn.textContent = muted ? '🔕' : '🔔';
    muteBtn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  }
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('mlk-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    setMuteBtn();
    if (!muted) sfx.tap();
  });
  setMuteBtn();

  /* ---------------- how many things you have made ---------------- */
  const counts = { cake: 0, pizza: 0, cookie: 0, cupcake: 0, gingerbread: 0, brownie: 0, garlicbread: 0,
    bananabread: 0, tart: 0, scone: 0, flapjack: 0 };
  try {
    /* the first version only counted cakes and pizzas */
    counts.cake = parseInt(localStorage.getItem('mlk-count-cake') || localStorage.getItem('mlk-cakes') || '0', 10) || 0;
    counts.pizza = parseInt(localStorage.getItem('mlk-count-pizza') || localStorage.getItem('mlk-pizzas') || '0', 10) || 0;
    counts.cookie = parseInt(localStorage.getItem('mlk-count-cookie') || '0', 10) || 0;
    counts.cupcake = parseInt(localStorage.getItem('mlk-count-cupcake') || '0', 10) || 0;
    for (const k of ['gingerbread', 'brownie', 'garlicbread', 'bananabread', 'tart', 'scone', 'flapjack']) {
      counts[k] = parseInt(localStorage.getItem('mlk-count-' + k) || '0', 10) || 0;
    }
  } catch (e) { /* ignore */ }
  function showCount() {
    const made = Object.keys(counts).filter((k) => counts[k] > 0);
    const list = made.map((k) => `${RECIPES[k].emoji} ${counts[k]}`).join('  ');
    const total = made.reduce((n, k) => n + counts[k], 0);
    countEl.textContent = !made.length ? 'Nothing yet!' : made.length > 4 ? `${total} made` : list;
    countEl.title = made.length ? made.map((k) => `${RECIPES[k].name}: ${counts[k]}`).join(', ') : 'Things you have made';
  }

  /* ---------------- data ---------------- */
  const INGREDIENTS = {
    flour: { name: 'Flour' },
    sugar: { name: 'Sugar' },
    eggs: { name: 'Eggs' },
    butter: { name: 'Butter' },
    milk: { name: 'Milk' },
    yeast: { name: 'Yeast' },
    salt: { name: 'Salt' },
    oil: { name: 'Oil' },
    water: { name: 'Water' },
    honey: { name: 'Honey' },
    ginger: { name: 'Ginger' },
    treacle: { name: 'Treacle' },
    cocoa: { name: 'Cocoa' },
    garlic: { name: 'Garlic' },
    oats: { name: 'Oats' },
    banana: { name: 'Banana' },
    berries: { name: 'Berries' },
  };
  /* Where each thing lives in the kitchen. */
  const WHERE = {
    flour: 'cupboard', sugar: 'cupboard', yeast: 'cupboard', salt: 'cupboard', honey: 'cupboard',
    ginger: 'cupboard', treacle: 'cupboard', cocoa: 'cupboard', oats: 'cupboard',
    eggs: 'fridge', butter: 'fridge', milk: 'fridge', oil: 'fridge',
    garlic: 'fridge', banana: 'fridge', berries: 'fridge',
    water: 'tap',
  };
  const FLAVOURS = {
    chocolate: { name: 'Chocolate', batter: '#8a5a3b', crumb: '#7a4a30', crust: '#5b3320', jam: '#f9c8d6' },
    strawberry: { name: 'Strawberry', batter: '#f7a9c0', crumb: '#f4bccb', crust: '#e39cb2', jam: '#ff6b8f' },
    vanilla: { name: 'Vanilla', batter: '#f6e7b4', crumb: '#f5dfa4', crust: '#dfae62', jam: '#ff8fae' },
    lemon: { name: 'Lemon', batter: '#f7e96b', crumb: '#f6e784', crust: '#dcb64f', jam: '#fff3b0' },
  };
  const DOUGH = '#f0dcae';
  const ICINGS = [
    { id: 'pink', name: 'Pink', color: '#ff9fb8' },
    { id: 'white', name: 'Vanilla', color: '#fff8f0' },
    { id: 'choc', name: 'Choccy', color: '#6b4029' },
    { id: 'mint', name: 'Mint', color: '#9fe3c9' },
    { id: 'blue', name: 'Berry', color: '#a9c6ff' },
    { id: 'yellow', name: 'Lemon', color: '#ffe08a' },
  ];
  const BUTTERS = [
    { id: 'garlic', name: 'Garlic', color: '#f7e6ae' },
    { id: 'herb', name: 'Herby', color: '#bfd98a' },
    { id: 'chilli', name: 'Chilli', color: '#e8925a' },
    { id: 'plain', name: 'Plain', color: '#fff2cc' },
  ];
  /* sweet fillings, for a tart: spread on before it bakes */
  const FILLINGS = [
    { id: 'berry', name: 'Berry', color: '#8e3a63' },
    { id: 'custard', name: 'Custard', color: '#f4d886' },
    { id: 'choc', name: 'Choccy', color: '#6b4029' },
    { id: 'apple', name: 'Apple', color: '#cbd884' },
  ];
  const JAMS = [
    { id: 'strawberry', name: 'Strawberry', color: '#e0455f' },
    { id: 'raspberry', name: 'Raspberry', color: '#b8294c' },
    { id: 'apricot', name: 'Apricot', color: '#efa451' },
    { id: 'blackcurrant', name: 'Blackcurrant', color: '#6a2f63' },
  ];
  const SAUCES = [
    { id: 'tomato', name: 'Tomato', color: '#e0304e' },
    { id: 'bbq', name: 'BBQ', color: '#7a3b1e' },
    { id: 'pesto', name: 'Pesto', color: '#6aa84f' },
    { id: 'garlic', name: 'Garlic', color: '#fff1cc' },
  ];
  const CAKE_TOPPINGS = [
    { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
    { id: 'cherry', name: 'Cherry', plural: 'cherries' },
    { id: 'candle', name: 'Candle', plural: 'candles' },
    { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
    { id: 'star', name: 'Star', plural: 'stars' },
    { id: 'mallow', name: 'Mallow', plural: 'mallows' },
  ];
  const COOKIE_TOPPINGS = [
    { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
    { id: 'mallow', name: 'Mallow', plural: 'mallows' },
    { id: 'star', name: 'Star', plural: 'stars' },
    { id: 'cherry', name: 'Cherry', plural: 'cherries' },
    { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
  ];
  const PIZZA_TOPPINGS = [
    { id: 'pepperoni', name: 'Pepperoni', plural: 'pepperonis' },
    { id: 'mushroom', name: 'Mushroom', plural: 'mushrooms' },
    { id: 'olive', name: 'Olive', plural: 'olives' },
    { id: 'pepper', name: 'Pepper', plural: 'peppers' },
    { id: 'basil', name: 'Basil', plural: 'basil leaves' },
    { id: 'pineapple', name: 'Pineapple', plural: 'pineapple chunks' },
  ];
  const GINGER_TOPPINGS = [
    { id: 'smartie', name: 'Smartie', plural: 'smarties' },
    { id: 'jelly', name: 'Jelly sweet', plural: 'jelly sweets' },
    { id: 'chip', name: 'Choc button', plural: 'choc buttons' },
    { id: 'cherry', name: 'Nose', plural: 'noses' },
    { id: 'star', name: 'Star', plural: 'stars' },
    { id: 'mallow', name: 'Mallow', plural: 'mallows' },
  ];
  const TART_TOPPINGS = [
    { id: 'strawberry', name: 'Strawberry', plural: 'strawberries' },
    { id: 'cherry', name: 'Cherry', plural: 'cherries' },
    { id: 'chip', name: 'Choc chip', plural: 'choc chips' },
    { id: 'mallow', name: 'Mallow', plural: 'mallows' },
    { id: 'star', name: 'Star', plural: 'stars' },
  ];
  const GARLIC_TOPPINGS = [
    { id: 'basil', name: 'Herbs', plural: 'herbs' },
    { id: 'olive', name: 'Olive', plural: 'olives' },
    { id: 'mushroom', name: 'Mushroom', plural: 'mushrooms' },
    { id: 'pepper', name: 'Pepper', plural: 'peppers' },
  ];
  const SPRINKLE_COLORS = ['#ff6b8f', '#ffd166', '#6ec6ff', '#7ee8a2', '#c58cff', '#ff9f6b', '#ffffff'];
  /* Sweets come in a bagful of colours, so each one placed picks its own. */
  const SMARTIE_COLORS = ['#e0304e', '#ff8f2e', '#ffd166', '#4aa564', '#4a7fd4', '#a86ce0', '#ff8fb8', '#6b4029'];
  const JELLY_COLORS = ['#e33b5a', '#ff8a3d', '#ffcf3d', '#5ec46a', '#9b5de5'];
  const SWEET_PICKS = { smartie: SMARTIE_COLORS, jelly: JELLY_COLORS };
  const SWEET_SAMPLE = { smartie: '#e0304e', jelly: '#5ec46a' };

  /* ---------------- the gingerbread man ----------------
     Drawn around (0,0), roughly 165 across and 190 tall, which is the same
     footprint as the round base — so every close-up scene keeps its scaling.
     He is a pile of overlapping rounded rectangles rather than one path; the
     outline is the same pile drawn fat underneath, so no seams show where the
     arms meet the body. */
  const MAN_PARTS = `<circle cx="0" cy="-64" r="27"/>
    <rect x="-31" y="-52" width="62" height="82" rx="22"/>
    <rect x="-88" y="-38" width="90" height="24" rx="12" transform="rotate(-20 0 -26)"/>
    <rect x="-2" y="-38" width="90" height="24" rx="12" transform="rotate(20 0 -26)"/>
    <rect x="-34" y="8" width="29" height="86" rx="14" transform="rotate(9 -19 14)"/>
    <rect x="5" y="8" width="29" height="86" rx="14" transform="rotate(-9 19 14)"/>`;
  const manSVG = (fill, line, w) =>
    `<g id="crustLine" fill="${line}" stroke="${line}" stroke-width="${w}" stroke-linejoin="round">${MAN_PARTS}</g>
     <g id="crustFill" fill="${fill}">${MAN_PARTS}</g>`;

  /* Is a point inside him? A rounded rectangle is "within r of the box shrunk
     by r", so each part is one clamp and one distance. */
  function inRR(px, py, x, y, w, h, r, deg, ox, oy) {
    if (deg) {
      const a = -deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      const dx = px - ox, dy = py - oy;
      px = ox + dx * c - dy * sn;
      py = oy + dx * sn + dy * c;
    }
    const cx = clamp(px, x + r, x + w - r), cy = clamp(py, y + r, y + h - r);
    return Math.hypot(px - cx, py - cy) <= r;
  }
  function inMan(x, y, pad) {
    const p = pad || 0;
    const rr = (bx, by, bw, bh, br, deg, ox, oy) =>
      inRR(x, y, bx - p, by - p, bw + p * 2, bh + p * 2, br + p, deg, ox, oy);
    return Math.hypot(x, y + 64) <= 27 + p
      || rr(-31, -52, 62, 82, 22)
      || rr(-88, -38, 90, 24, 12, -20, 0, -26)
      || rr(-2, -38, 90, 24, 12, 20, 0, -26)
      || rr(-34, 8, 29, 86, 14, 9, -19, 14)
      || rr(5, 8, 29, 86, 14, -9, 19, 14);
  }

  /* ---------------- icons ---------------- */
  const svgWrap = (inner, vb) => `<svg viewBox="${vb || '0 0 48 48'}" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    flour: svgWrap(`
      <path d="M12 12h24l3 29a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" fill="#f6ecd8" stroke="#d9c39a" stroke-width="2" stroke-linejoin="round"/>
      <rect x="13" y="6" width="22" height="8" rx="2" fill="#e9dcc0" stroke="#d9c39a" stroke-width="2"/>
      <rect x="14" y="22" width="20" height="13" rx="4" fill="#fff"/>
      <text x="24" y="31.5" font-size="7.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#8a7373">FLOUR</text>`),
    sugar: svgWrap(`
      <rect x="12" y="14" width="24" height="28" rx="6" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <rect x="10" y="7" width="28" height="9" rx="3" fill="#a9d8ff" stroke="#7fb8ee" stroke-width="2"/>
      <rect x="16" y="24" width="6" height="6" rx="1" fill="#f4f8ff" stroke="#cfd8e3"/>
      <rect x="25" y="28" width="6" height="6" rx="1" fill="#f4f8ff" stroke="#cfd8e3"/>
      <rect x="19" y="33" width="6" height="6" rx="1" fill="#f4f8ff" stroke="#cfd8e3"/>`),
    eggs: svgWrap(`
      <ellipse cx="18" cy="28" rx="10" ry="13" fill="#fff8ea" stroke="#e5d3b3" stroke-width="2"/>
      <ellipse cx="31" cy="26" rx="10" ry="13" fill="#f2d3a8" stroke="#d9b382" stroke-width="2"/>
      <ellipse cx="15" cy="23" rx="2.5" ry="4" fill="#fff" opacity="0.8"/>`),
    butter: svgWrap(`
      <path d="M8 20l8-6h26l-8 6z" fill="#fff0b3" stroke="#e6c85a" stroke-width="2" stroke-linejoin="round"/>
      <rect x="8" y="20" width="26" height="16" rx="2" fill="#ffe58a" stroke="#e6c85a" stroke-width="2"/>
      <path d="M34 20l8-6v16l-8 6z" fill="#f2cf5a" stroke="#e6c85a" stroke-width="2" stroke-linejoin="round"/>
      <rect x="14" y="20" width="8" height="16" fill="#fff" opacity="0.6"/>`),
    milk: svgWrap(`
      <path d="M14 18l5-9h10l5 9v22a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#fff" stroke="#cfd8e3" stroke-width="2" stroke-linejoin="round"/>
      <path d="M14 18h20" stroke="#cfd8e3" stroke-width="2"/>
      <rect x="14" y="26" width="20" height="8" fill="#a9d8ff"/>
      <circle cx="24" cy="30" r="2.5" fill="#fff"/>`),
    yeast: svgWrap(`
      <path d="M11 10h26l-2 30H13z" fill="#e9c98a" stroke="#c9a05a" stroke-width="2" stroke-linejoin="round"/>
      <path d="M11 10h26v5H11z" fill="#d9b06a"/>
      <rect x="15" y="21" width="18" height="11" rx="3" fill="#fff8ea"/>
      <text x="24" y="29.5" font-size="6.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#8a6a3a">YEAST</text>
      <g fill="#d9b06a"><circle cx="17" cy="36" r="1.2"/><circle cx="22" cy="37" r="1.2"/><circle cx="28" cy="36" r="1.2"/></g>`),
    salt: svgWrap(`
      <rect x="15" y="14" width="18" height="28" rx="6" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M17 14a7 7 0 0 1 14 0z" fill="#dfe6ee" stroke="#cfd8e3" stroke-width="2"/>
      <g fill="#8fa3b8"><circle cx="21" cy="9" r="1.2"/><circle cx="24" cy="7" r="1.2"/><circle cx="27" cy="9" r="1.2"/></g>
      <rect x="19" y="24" width="10" height="10" rx="2" fill="#a9d8ff"/>
      <text x="24" y="31.5" font-size="6" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#fff">SALT</text>`),
    oil: svgWrap(`
      <path d="M19 16v-8h10v8l5 6v18a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V22z" fill="#f3f7dc" stroke="#b9c56a" stroke-width="2" stroke-linejoin="round"/>
      <path d="M14 28h20v12a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#d9d34a" opacity="0.85"/>
      <rect x="18" y="5" width="12" height="5" rx="2" fill="#7a9a3a"/>
      <path d="M22 20c-4 3-4 8 0 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`),
    water: svgWrap(`
      <path d="M12 12h20l3 5v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#eaf6ff" stroke="#7fb8ee" stroke-width="2" stroke-linejoin="round"/>
      <path d="M35 20h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-4" fill="none" stroke="#7fb8ee" stroke-width="2.5"/>
      <path d="M12 24h23v15a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#a9d8ff"/>
      <path d="M12 24q6 3 12 0t11 0" fill="none" stroke="#fff" stroke-width="2"/>
      <circle cx="20" cy="33" r="2.5" fill="#fff" opacity="0.8"/>`),
    honey: svgWrap(`
      <rect x="13" y="15" width="22" height="27" rx="5" fill="#ffc94d" stroke="#d99b2e" stroke-width="2"/>
      <rect x="11" y="8" width="26" height="9" rx="3" fill="#f2b134" stroke="#d99b2e" stroke-width="2"/>
      <rect x="16" y="23" width="16" height="12" rx="3" fill="#fff6e0"/>
      <text x="24" y="31.5" font-size="6.5" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#b8801f">HONEY</text>
      <path d="M20 8V5h8v3" fill="none" stroke="#d99b2e" stroke-width="2"/>`),
    ginger: svgWrap(`
      <rect x="14" y="14" width="20" height="28" rx="4" fill="#e8b978" stroke="#c08f4a" stroke-width="2"/>
      <rect x="12" y="7" width="24" height="9" rx="3" fill="#d09b52" stroke="#b07c37" stroke-width="2"/>
      <rect x="17" y="22" width="14" height="12" rx="3" fill="#fff4e0"/>
      <text x="24" y="30.5" font-size="6" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#9c6a24">GINGER</text>`),
    treacle: svgWrap(`
      <rect x="13" y="16" width="22" height="26" rx="4" fill="#4a3020" stroke="#31200f" stroke-width="2"/>
      <rect x="11" y="9" width="26" height="9" rx="3" fill="#6b4a2e" stroke="#31200f" stroke-width="2"/>
      <rect x="16" y="24" width="16" height="11" rx="3" fill="#e8d9be"/>
      <text x="24" y="32" font-size="5.6" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#5b3d22">TREACLE</text>`),
    cocoa: svgWrap(`
      <rect x="13" y="13" width="22" height="29" rx="3" fill="#5e3a24" stroke="#3f2415" stroke-width="2"/>
      <rect x="13" y="9" width="22" height="6" rx="2" fill="#7d5136" stroke="#3f2415" stroke-width="2"/>
      <rect x="16" y="22" width="16" height="13" rx="2" fill="#f2e2cc"/>
      <text x="24" y="31" font-size="6.2" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#6b442a">COCOA</text>`),
    garlic: svgWrap(`
      <path d="M24 41c-8 0-13-5-13-11 0-5 4-8 6-12 1-3 4-6 7-6s6 3 7 6c2 4 6 7 6 12 0 6-5 11-13 11z" fill="#f6efe2" stroke="#d6c9ae" stroke-width="2"/>
      <path d="M24 13v27M17 19c-2 6-2 14 1 20M31 19c2 6 2 14-1 20" fill="none" stroke="#ddd2ba" stroke-width="1.6"/>
      <path d="M24 12c-1-4 0-7 2-8-3 0-5 3-5 7z" fill="#8fbf6a" stroke="#6a9a48" stroke-width="1.4"/>`),
    banana: svgWrap(`
      <path d="M10 16c1 14 9 24 24 24 4 0 6-2 6-4 0-3-3-3-6-4-9-2-15-9-16-18-1-3-2-4-4-3-3 1-4 3-4 5z" fill="#ffe15c" stroke="#dcb62f" stroke-width="2" stroke-linejoin="round"/>
      <path d="M14 15c2 12 9 20 20 22" fill="none" stroke="#f3cf4a" stroke-width="2"/>
      <path d="M10 14l-2-4 4 1z" fill="#8a6a3a" stroke="#6a4f2a" stroke-width="1.4" stroke-linejoin="round"/>`),
    berries: svgWrap(`
      <g fill="#5b4b9c" stroke="#3d3172" stroke-width="1.6"><circle cx="18" cy="28" r="7"/><circle cx="30" cy="26" r="7"/><circle cx="24" cy="36" r="6.5"/></g>
      <g fill="#8b7cc8" opacity="0.7"><circle cx="16" cy="26" r="2"/><circle cx="28" cy="24" r="2"/></g>
      <path d="M24 16c-3 2-6 2-8 0 1 4 4 6 8 6s7-2 8-6c-2 2-5 2-8 0z" fill="#6cc48a" stroke="#4fa86f" stroke-width="1.4"/>
      <path d="M24 10v7" stroke="#4fa86f" stroke-width="2" stroke-linecap="round"/>`),
    oats: svgWrap(`
      <path d="M12 14h24l3 27a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" fill="#f2e5c8" stroke="#cdb384" stroke-width="2" stroke-linejoin="round"/>
      <rect x="13" y="8" width="22" height="8" rx="2" fill="#e5d4ae" stroke="#cdb384" stroke-width="2"/>
      <g fill="#ddc38d" stroke="#bda067" stroke-width="1.2">
        <ellipse cx="18" cy="27" rx="3.6" ry="2.3" transform="rotate(-20 18 27)"/>
        <ellipse cx="29" cy="25" rx="3.6" ry="2.3" transform="rotate(16 29 25)"/>
        <ellipse cx="24" cy="34" rx="3.6" ry="2.3" transform="rotate(-7 24 34)"/>
      </g>`),
    tomato: svgWrap(`
      <circle cx="24" cy="27" r="15" fill="#ff5c5c" stroke="#d63a3a" stroke-width="2"/>
      <path d="M24 12c-4-2-8 0-9 3 4 0 7-1 9-3 2 2 5 3 9 3-1-3-5-5-9-3z" fill="#6cc48a" stroke="#4fa86f" stroke-width="1.5"/>
      <path d="M24 8v6" stroke="#4fa86f" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="18" cy="22" rx="3" ry="2" fill="#fff" opacity="0.6"/>`),
    cheese: svgWrap(`
      <path d="M6 32l32-14 4 8v10H6z" fill="#ffd93d" stroke="#e0b800" stroke-width="2" stroke-linejoin="round"/>
      <path d="M6 32l32-14 4 8-32 12z" fill="#ffe97a"/>
      <g fill="#e0b800" opacity="0.8"><circle cx="18" cy="31" r="2.5"/><circle cx="28" cy="27" r="2"/><circle cx="34" cy="31" r="1.6"/></g>`),
    chocolate: svgWrap(`
      <rect x="8" y="10" width="32" height="28" rx="4" fill="#6b4029" stroke="#4e2c1c" stroke-width="2"/>
      <path d="M8 24h32M24 10v28" stroke="#4e2c1c" stroke-width="2"/>
      <rect x="11" y="13" width="9" height="8" rx="2" fill="#7f4f35"/>
      <rect x="28" y="27" width="9" height="8" rx="2" fill="#7f4f35"/>`),
    strawberry: svgWrap(`
      <path d="M24 42c-9-4-15-12-15-20 0-6 5-9 9-8 3 0 5 2 6 3 1-1 3-3 6-3 4-1 9 2 9 8 0 8-6 16-15 20z" fill="#ff5c7a" stroke="#e03e5e" stroke-width="2"/>
      <path d="M24 8c-3 3-6 4-9 3 3 2 6 2 9 2 3 0 6 0 9-2-3 1-6 0-9-3z" fill="#6cc48a" stroke="#4fa86f" stroke-width="1.5"/>
      <g fill="#ffe08a"><ellipse cx="19" cy="22" rx="1.4" ry="2"/><ellipse cx="29" cy="22" rx="1.4" ry="2"/><ellipse cx="24" cy="29" rx="1.4" ry="2"/><ellipse cx="19" cy="32" rx="1.4" ry="2"/><ellipse cx="29" cy="32" rx="1.4" ry="2"/></g>`),
    vanilla: svgWrap(`
      <g fill="#fff8f0" stroke="#e8d9c4" stroke-width="1.5"><circle cx="24" cy="13" r="7"/><circle cx="34" cy="20" r="7"/><circle cx="31" cy="32" r="7"/><circle cx="17" cy="32" r="7"/><circle cx="14" cy="20" r="7"/></g>
      <circle cx="24" cy="24" r="6" fill="#ffd166"/>`),
    lemon: svgWrap(`
      <path d="M10 26c0-9 6-15 14-15s14 6 14 15-6 12-14 12-14-3-14-12z" fill="#ffe45c" stroke="#dcb64f" stroke-width="2"/>
      <path d="M38 24l4-2-2 4z" fill="#ffe45c" stroke="#dcb64f" stroke-width="2" stroke-linejoin="round"/>
      <path d="M12 16c-4-4-2-9 3-8 2 3 1 6-3 8z" fill="#6cc48a" stroke="#4fa86f" stroke-width="1.5"/>`),
    spoon: svgWrap(`
      <path d="M31 6l10 10-22 26a6 6 0 0 1-10-10z" fill="#d9a86c" stroke="#b3803f" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="14" cy="34" rx="8" ry="10" transform="rotate(45 14 34)" fill="#e8bd83" stroke="#b3803f" stroke-width="2"/>`),
    pin: svgWrap(`
      <rect x="9" y="18" width="30" height="13" rx="6.5" fill="#f2dcb4" stroke="#c9a05a" stroke-width="2"/>
      <rect x="18" y="18" width="4" height="13" fill="#e3c692"/>
      <rect x="28" y="18" width="3" height="13" fill="#e3c692"/>
      <rect x="1" y="21" width="9" height="7" rx="3.5" fill="#d9a86c" stroke="#b3803f" stroke-width="2"/>
      <rect x="38" y="21" width="9" height="7" rx="3.5" fill="#d9a86c" stroke="#b3803f" stroke-width="2"/>`),
    sprinkles: svgWrap(`
      <rect x="12" y="14" width="24" height="28" rx="6" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <rect x="10" y="7" width="28" height="9" rx="3" fill="#ff9fb8" stroke="#f26d92" stroke-width="2"/>
      <g stroke-width="3" stroke-linecap="round"><path d="M17 24l4 2" stroke="#ff6b8f"/><path d="M27 22l4 1" stroke="#6ec6ff"/><path d="M18 32l4-2" stroke="#ffd166"/><path d="M27 30l4 3" stroke="#7ee8a2"/><path d="M21 37l4 1" stroke="#c58cff"/></g>`),
    bowl: svgWrap(`
      <path d="M6 20C6 34 14 42 24 42S42 34 42 20z" fill="#a9d8ff" stroke="#7fb8ee" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M11 26c2 7 7 11 13 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      <ellipse cx="24" cy="20" rx="18" ry="6" fill="#c5e5ff" stroke="#7fb8ee" stroke-width="2.5"/>
      <ellipse cx="24" cy="20" rx="14" ry="4" fill="#5aa0dc"/>`),
    question: svgWrap(`
      <circle cx="24" cy="24" r="18" fill="#fff" stroke="#e3d5c8" stroke-width="2"/>
      <text x="24" y="31" font-size="22" text-anchor="middle" font-family="sans-serif" font-weight="bold" fill="#c9a9b5">?</text>`),
    oven: svgWrap(`
      <rect x="8" y="10" width="32" height="30" rx="5" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="2"/>
      <rect x="13" y="18" width="22" height="14" rx="3" fill="#ffb347"/>
      <circle cx="16" cy="14" r="2" fill="#f26d92"/><circle cx="32" cy="14" r="2" fill="#f26d92"/>`),
    /* recipe cards */
    cakeCard: svgWrap(`
      <ellipse cx="24" cy="40" rx="20" ry="5" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M8 24v14a16 4 0 0 0 32 0V24z" fill="#f4bccb"/>
      <path d="M8 30h32v3H8z" fill="#ff6b8f" opacity="0.7"/>
      <ellipse cx="24" cy="24" rx="16" ry="5" fill="#ff9fb8"/>
      <path d="M12 26q2 6 0 8M20 27q2 6 0 8M28 27q2 6 0 8M36 26q2 6 0 8" stroke="#ff9fb8" stroke-width="3" stroke-linecap="round"/>
      <rect x="22" y="10" width="4" height="12" rx="1.5" fill="#fff" stroke="#f26d92" stroke-width="1.2"/>
      <ellipse cx="24" cy="7" rx="2.5" ry="4" fill="#ffb347"/>`),
    pizzaCard: svgWrap(`
      <circle cx="24" cy="24" r="20" fill="#e9b96a" stroke="#c98a3e" stroke-width="2"/>
      <circle cx="24" cy="24" r="16" fill="#e0304e"/>
      <circle cx="24" cy="24" r="15" fill="#ffe08a" opacity="0.9"/>
      <g fill="#c8383f" stroke="#9e2a30" stroke-width="1"><circle cx="17" cy="20" r="4"/><circle cx="29" cy="17" r="4"/><circle cx="30" cy="30" r="4"/><circle cx="18" cy="31" r="4"/></g>
      <path d="M24 22c3 0 4 3 1 5-3 0-4-3-1-5z" fill="#4f9d4f"/>`),
    cookieCard: svgWrap(`
      <circle cx="24" cy="24" r="19" fill="#e0a55c" stroke="#b97a35" stroke-width="2"/>
      <circle cx="24" cy="24" r="15" fill="#eab876" opacity="0.7"/>
      <g fill="#6b4029"><circle cx="17" cy="18" r="3.4"/><circle cx="31" cy="17" r="2.8"/><circle cx="32" cy="29" r="3.4"/><circle cx="18" cy="31" r="3"/><circle cx="24" cy="24" r="2.4"/></g>`),
    cupcakeCard: svgWrap(`
      <path d="M13 22h22l-3 19a3 3 0 0 1-3 2h-10a3 3 0 0 1-3-2z" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="2" stroke-linejoin="round"/>
      <path d="M18 23l1.5 20M24 23v20M30 23l-1.5 20" stroke="#f2a0b5" stroke-width="1.5"/>
      <path d="M11 22c0-9 6-13 13-13s13 4 13 13z" fill="#ff9fb8" stroke="#f26d92" stroke-width="2" stroke-linejoin="round"/>
      <path d="M14 17q5 4 10 0t10 0" fill="none" stroke="#fff" stroke-width="2" opacity="0.6"/>
      <circle cx="24" cy="7" r="3.5" fill="#e0304e" stroke="#b6213a" stroke-width="1.5"/>`),
    gingerCard: svgWrap(`
      <circle cx="24" cy="12" r="7" fill="#c98a4a" stroke="#a2652c" stroke-width="2"/>
      <path d="M24 19v13M13 24l11 3 11-3M18 44l6-12 6 12" fill="none" stroke="#c98a4a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <g fill="#fff8f0"><circle cx="21" cy="11" r="1.6"/><circle cx="27" cy="11" r="1.6"/></g>
      <path d="M21 15q3 2 6 0" fill="none" stroke="#fff8f0" stroke-width="1.6" stroke-linecap="round"/>
      <g fill="#ff9fb8"><circle cx="24" cy="25" r="2"/><circle cx="24" cy="31" r="2"/></g>`),
    brownieCard: svgWrap(`
      <ellipse cx="24" cy="40" rx="19" ry="4.5" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M9 26v11a15 4 0 0 0 30 0V26z" fill="#5b3320"/>
      <ellipse cx="24" cy="26" rx="15" ry="4.5" fill="#7a4a30"/>
      <ellipse cx="24" cy="25" rx="12" ry="3.4" fill="#8f5a3a" opacity="0.8"/>
      <g fill="#4a2818"><circle cx="19" cy="25" r="2"/><circle cx="29" cy="24" r="1.7"/><circle cx="25" cy="28" r="1.6"/></g>
      <path d="M9 30h30" stroke="#4a2818" stroke-width="1.4" opacity="0.5"/>`),
    garlicCard: svgWrap(`
      <path d="M6 30q18-8 36 0v6q-18 8-36 0z" fill="#e9b96a" stroke="#c98a3e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M6 30q18-8 36 0-18 6-36 0z" fill="#f2d29a"/>
      <path d="M14 22v10M22 20v12M30 20v12M38 23v9" stroke="#c98a3e" stroke-width="2" stroke-linecap="round"/>
      <g fill="#4f9d4f"><ellipse cx="17" cy="29" rx="2.6" ry="1.4"/><ellipse cx="27" cy="28" rx="2.6" ry="1.4"/><ellipse cx="35" cy="30" rx="2.4" ry="1.3"/></g>`),
    loafCard: svgWrap(`
      <ellipse cx="24" cy="41" rx="19" ry="4.5" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M8 25q16-10 32 0v11a16 4.5 0 0 1-32 0z" fill="#d6a765" stroke="#b0803e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M8 25q16-10 32 0-16 7-32 0z" fill="#eec98e"/>
      <path d="M14 22q10-5 20 0" fill="none" stroke="#a9742f" stroke-width="2" stroke-linecap="round"/>
      <g fill="#8a5a2a" opacity="0.7"><circle cx="18" cy="31" r="1.8"/><circle cx="27" cy="30" r="1.6"/><circle cx="32" cy="33" r="1.5"/></g>`),
    tartCard: svgWrap(`
      <circle cx="24" cy="24" r="20" fill="#e6c48e" stroke="#c09455" stroke-width="2"/>
      <g stroke="#c09455" stroke-width="1.8" stroke-linecap="round"><path d="M24 5v5M38 14l-4 3M43 24h-5M38 34l-4-3M24 43v-5M10 34l4-3M5 24h5M10 14l4 3"/></g>
      <circle cx="24" cy="24" r="15.5" fill="#f5e3ba"/>
      <circle cx="24" cy="24" r="13.5" fill="#8e3a63"/>
      <g fill="#c4577f" stroke="#8e3a63" stroke-width="1"><circle cx="19" cy="20" r="3.4"/><circle cx="29" cy="19" r="3.1"/><circle cx="30" cy="29" r="3.4"/><circle cx="19" cy="30" r="3.1"/><circle cx="24" cy="25" r="2.8"/></g>`),
    sconeCard: svgWrap(`
      <ellipse cx="24" cy="41" rx="18" ry="4" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M10 29q2-14 14-14t14 14v4a14 5 0 0 1-28 0z" fill="#e8c88f" stroke="#c19a5c" stroke-width="2" stroke-linejoin="round"/>
      <path d="M10.5 27.5q13.5 6 27 0" fill="none" stroke="#d8425f" stroke-width="3.4"/>
      <path d="M10.5 30.5q13.5 6 27 0" fill="none" stroke="#fdf5e6" stroke-width="3.4"/>
      <path d="M15 21q9-6 18 0" fill="none" stroke="#d3ac6f" stroke-width="2" stroke-linecap="round"/>`),
    flapjackCard: svgWrap(`
      <ellipse cx="24" cy="41" rx="17" ry="4" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <path d="M10 15h28v19a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#dfb268" stroke="#ab7c37" stroke-width="2" stroke-linejoin="round"/>
      <g fill="#c69350" stroke="#a3762f" stroke-width="0.9">
        <ellipse cx="16" cy="21" rx="3.4" ry="2.1" transform="rotate(-22 16 21)"/>
        <ellipse cx="26" cy="19.5" rx="3.4" ry="2.1" transform="rotate(15 26 19.5)"/>
        <ellipse cx="34" cy="23" rx="3.4" ry="2.1" transform="rotate(-9 34 23)"/>
        <ellipse cx="20" cy="28" rx="3.4" ry="2.1" transform="rotate(10 20 28)"/>
        <ellipse cx="30" cy="29" rx="3.4" ry="2.1" transform="rotate(-16 30 29)"/>
        <ellipse cx="15" cy="34" rx="3.4" ry="2.1" transform="rotate(6 15 34)"/>
        <ellipse cx="25" cy="35" rx="3.4" ry="2.1" transform="rotate(-12 25 35)"/>
        <ellipse cx="34" cy="33" rx="3.4" ry="2.1" transform="rotate(18 34 33)"/>
      </g>
      <path d="M12 17q12-3 24 0" fill="none" stroke="#f2d9a2" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`),
    tin: (c) => svgWrap(`
      <rect x="6" y="20" width="36" height="16" rx="3" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="2"/>
      <rect x="9" y="18" width="30" height="8" rx="3" fill="${c}"/>
      <rect x="8" y="23" width="32" height="3" rx="1.5" fill="#fff" opacity="0.5"/>`),
    case: (c) => svgWrap(`
      <path d="M11 18h26l-4 20a3 3 0 0 1-3 2h-12a3 3 0 0 1-3-2z" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="2" stroke-linejoin="round"/>
      <path d="M17 19l2 21M24 19v21M31 19l-2 21" stroke="#f2a0b5" stroke-width="1.5"/>
      <ellipse cx="24" cy="18" rx="13" ry="4" fill="${c}"/>`),
    swatch: (c) => svgWrap(`
      <path d="M24 6c8 0 16 7 16 16 0 6-4 8-4 12s-3 8-12 8-12-4-12-8-4-6-4-12c0-9 8-16 16-16z" fill="${c}" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>
      <ellipse cx="18" cy="16" rx="4" ry="2.5" fill="#fff" opacity="0.6"/>`),
    /* An icing pen: the same swatch, squeezed into a piping bag. */
    pen: (c) => svgWrap(`
      <path d="M15 5h18l-5 25h-8z" fill="#fdf7ec" stroke="#c2a684" stroke-width="2" stroke-linejoin="round"/>
      <path d="M20 30h8l-2 6h-4z" fill="#cfd8e3" stroke="#93a3b3" stroke-width="2" stroke-linejoin="round"/>
      <path d="M18 10h12l-1.5 8h-9z" fill="${c}" opacity="0.85"/>
      <path d="M24 37q-4 4 0 7t0-7z" fill="${c}"/>
      <circle cx="24" cy="43" r="3.4" fill="${c}" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>`),
    /* The gingerbread man cutter: a fat tin outline with the middle cut out. */
    cutter: svgWrap(`<g transform="translate(24 25) scale(0.2)">
      <g fill="#9fb0bb" stroke="#9fb0bb" stroke-width="40" stroke-linejoin="round">${MAN_PARTS}</g>
      <g fill="#dfe8ee" stroke="#dfe8ee" stroke-width="22" stroke-linejoin="round">${MAN_PARTS}</g>
      <g fill="#fdf7ec">${MAN_PARTS}</g>
    </g>`),
    wipe: svgWrap(`
      <rect x="8" y="16" width="32" height="18" rx="6" fill="#ffe08a" stroke="#d9ad3e" stroke-width="2"/>
      <path d="M8 26h32" stroke="#d9ad3e" stroke-width="2"/>
      <g fill="#fff" opacity="0.75"><circle cx="16" cy="21" r="2"/><circle cx="25" cy="20" r="1.6"/><circle cx="33" cy="21.5" r="1.8"/></g>
      <path d="M13 38q5 4 11 0t11 0" fill="none" stroke="#bcd8e2" stroke-width="3" stroke-linecap="round"/>`),
  };
  /* Put an ICON inside another SVG at a position. */
  const placeIcon = (html, x, y, s) => html.replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" `);
  const stripIds = (html) => html.replace(/ id="[^"]*"/g, '');

  /* Toppings, drawn around (0,0). Roughly 26px wide. */
  const TOP_SVG = {
    strawberry: `<g transform="translate(-12 -14) scale(0.55)">${ICON.strawberry.replace(/<\/?svg[^>]*>/g, '')}</g>`,
    cherry: `<path d="M-2 -14 q3 -6 8 -8 M-2 -14 q-6 -4 -12 -2" fill="none" stroke="#4fa86f" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="-8" cy="-4" r="7" fill="#e0304e" stroke="#b6213a" stroke-width="1.5"/>
      <circle cx="6" cy="-2" r="7" fill="#ff4d6d" stroke="#b6213a" stroke-width="1.5"/>
      <circle cx="-10" cy="-6" r="2" fill="#fff" opacity="0.7"/><circle cx="4" cy="-4" r="2" fill="#fff" opacity="0.7"/>`,
    candle: `<g class="flame"><ellipse cx="0" cy="-36" rx="4" ry="7" fill="#ffb347"/><ellipse cx="0" cy="-34" rx="2" ry="4" fill="#fff3b0"/></g>
      <g class="smoke" style="display:none"><circle cx="0" cy="-36" r="3" fill="#bbb" opacity="0.7"/><circle cx="3" cy="-44" r="2.5" fill="#ccc" opacity="0.5"/><circle cx="-2" cy="-51" r="2" fill="#ddd" opacity="0.35"/></g>
      <rect x="-4" y="-28" width="8" height="28" rx="2" fill="#fff" stroke="#f26d92" stroke-width="1.5"/>
      <path d="M-4 -22h8M-4 -14h8M-4 -6h8" stroke="#ff9fb8" stroke-width="3"/>
      <rect x="-1" y="-30" width="2" height="4" fill="#4a3a3a"/>`,
    chip: `<path d="M0 -12c6 4 9 8 9 12a9 9 0 0 1-18 0c0-4 3-8 9-12z" fill="#6b4029" stroke="#4e2c1c" stroke-width="1.5"/>
      <circle cx="-3" cy="-1" r="2" fill="#fff" opacity="0.35"/>`,
    star: `<path d="M0 -13l3.8 7.7 8.5 1.2-6.2 6 1.5 8.5L0 6.4l-7.6 4 1.5-8.5-6.2-6 8.5-1.2z" fill="#ffd166" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/>`,
    mallow: `<rect x="-10" y="-9" width="20" height="18" rx="7" fill="#fff" stroke="#e8d9e0" stroke-width="1.5"/>
      <rect x="-10" y="-9" width="20" height="18" rx="7" fill="#ffd4e2" opacity="0.5"/>
      <ellipse cx="-3" cy="-4" rx="3" ry="1.5" fill="#fff"/>`,
    /* sweets: these two take their colour from the one that was placed */
    smartie: (tp) => `<ellipse rx="11" ry="8.6" fill="${tp.c}" stroke="${mixHex(tp.c, '#000000', 0.3)}" stroke-width="1.5"/>
      <ellipse cx="-3.2" cy="-3" rx="4.4" ry="2.2" fill="#fff" opacity="0.5" transform="rotate(-18)"/>`,
    jelly: (tp) => `<rect x="-9.5" y="-9.5" width="19" height="19" rx="6.5" fill="${tp.c}" stroke="${mixHex(tp.c, '#000000', 0.28)}" stroke-width="1.5"/>
      <rect x="-9.5" y="-9.5" width="19" height="19" rx="6.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-dasharray="1.5 3.2" stroke-linecap="round" opacity="0.8"/>
      <path d="M-5 -4.5q3 -2 6 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.45"/>`,
    /* pizza toppings (seen from above) */
    pepperoni: `<circle r="11" fill="#c8383f" stroke="#9e2a30" stroke-width="1.5"/>
      <g fill="#8f2229" opacity="0.7"><circle cx="-4" cy="-3" r="1.6"/><circle cx="4" cy="2" r="1.4"/><circle cx="-1" cy="5" r="1.2"/><circle cx="5" cy="-5" r="1.1"/></g>`,
    mushroom: `<path d="M-12 1a12 11 0 0 1 24 0z" fill="#e8d5b7" stroke="#b89b73" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="-4" y="1" width="8" height="11" rx="3" fill="#f6ecdc" stroke="#b89b73" stroke-width="1.5"/>
      <path d="M-8 -1a8 6 0 0 1 16 0" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7"/>`,
    olive: `<circle r="8" fill="none" stroke="#2f2f38" stroke-width="5.5"/><circle r="8" fill="none" stroke="#5a5a68" stroke-width="1.5"/>`,
    pepper: `<circle r="10" fill="none" stroke="#5fb35f" stroke-width="4.5"/><circle r="10" fill="none" stroke="#a5e0a5" stroke-width="1.5"/>`,
    basil: `<path d="M0 -13C10 -10 12 4 0 13C-12 4 -10 -10 0 -13z" fill="#4f9d4f" stroke="#2f7a2f" stroke-width="1.5"/>
      <path d="M0 -9V9M0 -2l5 -3M0 2l-5 -3" stroke="#2f7a2f" stroke-width="1.2" fill="none"/>`,
    pineapple: `<path d="M-9 -7h18l-2 14h-14z" fill="#ffd93d" stroke="#e0b800" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M-4 -3v8M2 -3v8" stroke="#f0c419" stroke-width="1.5"/>`,
  };

  /* ---------------- recipes ----------------
     form 'tin'  — batter is poured into a tin (or a paper case) and rises.
     form 'flat' — dough is rolled out flat and stays round.
     decorateAfter — icing goes on after baking (everything but the pizza). */
  const RECIPES = {
    cake: {
      id: 'cake', name: 'Cake', thing: 'cake', emoji: '🎂', icon: ICON.cakeCard,
      form: 'tin', decorateAfter: true,
      ingredients: ['flour', 'sugar', 'eggs', 'butter', 'milk'],
      flavours: true,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['bake', '🔥', 'Bake'], ['decorate', '🎨', 'Icing'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 140, 74, 36], ['sugar', 184, 74, 36]],
      fridge: [['eggs', 22, 54], ['butter', 54, 54], ['milk', 22, 100], ['chocolate', 54, 100], ['strawberry', 22, 146], ['lemon', 54, 146], ['vanilla', 38, 190]],
      paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: CAKE_TOPPINGS,
      shapeLabel: 'Pour it in!',
      box: { cx: 200, top: 130, bottom: 250, rx: 100, ry: 24, tinW: 56, plateY: 272, plateRx: 150 },
    },
    cupcake: {
      id: 'cupcake', name: 'Cupcake', thing: 'cupcake', emoji: '🧁', icon: ICON.cupcakeCard,
      form: 'tin', decorateAfter: true, paperCase: true,
      ingredients: ['flour', 'sugar', 'eggs', 'butter'],
      flavours: true,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['bake', '🔥', 'Bake'], ['decorate', '🎨', 'Icing'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 140, 74, 36], ['sugar', 184, 74, 36]],
      fridge: [['eggs', 22, 54], ['butter', 54, 54], ['chocolate', 22, 100], ['strawberry', 54, 100], ['lemon', 22, 146], ['vanilla', 54, 146]],
      paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: CAKE_TOPPINGS,
      shapeLabel: 'Pour it in!',
      box: { cx: 200, top: 128, bottom: 232, rx: 72, ry: 19, tinW: 38, plateY: 258, plateRx: 118 },
    },
    cookie: {
      id: 'cookie', name: 'Big Cookie', thing: 'cookie', emoji: '🍪', icon: ICON.cookieCard,
      form: 'flat', decorateAfter: true,
      ingredients: ['flour', 'sugar', 'butter', 'honey'],
      flavours: true,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['roll', '🥖', 'Roll'], ['bake', '🔥', 'Bake'], ['decorate', '🎨', 'Icing'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 134, 76, 30], ['sugar', 166, 76, 30], ['honey', 198, 76, 30]],
      fridge: [['butter', 22, 54], ['chocolate', 22, 100], ['strawberry', 54, 100], ['lemon', 22, 146], ['vanilla', 54, 146]],
      paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: COOKIE_TOPPINGS,
      shapeLabel: 'Roll it out!',
      paintR: 64,
      base: { raw: '#f0d9a8', done: '#cf9448', innerRaw: '#f6e4bd', innerDone: '#dda963', lineRaw: '#d8bd85', lineDone: '#a86f2f', tint: '#8a4b16', chips: true },
    },
    pizza: {
      id: 'pizza', name: 'Pizza', thing: 'pizza', emoji: '🍕', icon: ICON.pizzaCard,
      form: 'flat', decorateAfter: false,
      ingredients: ['flour', 'yeast', 'salt', 'water', 'oil'],
      flavours: false,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['roll', '🥖', 'Roll'], ['decorate', '🍅', 'Top'], ['bake', '🔥', 'Bake'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 134, 76, 30], ['yeast', 166, 76, 30], ['salt', 198, 76, 30]],
      fridge: [['oil', 22, 54], ['tomato', 22, 100], ['cheese', 54, 100]],
      paints: SAUCES, paintTitle: 'Sauce', paintWord: 'sauce',
      shake: { name: 'Cheese!', icon: ICON.cheese, word: 'cheese', mode: 'layer' },
      toppings: PIZZA_TOPPINGS,
      shapeLabel: 'Roll it out!',
      base: { raw: '#f1dfae', done: '#d9a05a', innerRaw: '#f6e9c6', innerDone: '#efd08e', lineRaw: '#d8c08a', lineDone: '#b07a3a', tint: '#b5651d' },
    },
    gingerbread: {
      id: 'gingerbread', name: 'Gingerbread', thing: 'gingerbread man', emoji: '\ud83c\udf6a', icon: ICON.gingerCard,
      form: 'flat', decorateAfter: true,
      ingredients: ['flour', 'ginger', 'treacle', 'butter', 'sugar'],
      flavours: false,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['roll', '🥖', 'Roll'], ['cut', '🍪', 'Cut'], ['bake', '🔥', 'Bake'], ['decorate', '🎨', 'Icing'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 133, 82, 24], ['ginger', 156, 82, 24], ['treacle', 179, 82, 24], ['sugar', 202, 82, 24]],
      fridge: [['butter', 22, 54]],
      cutter: true, flatShape: 'man', piping: true,
      paints: ICINGS, paintTitle: 'Icing pens', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: GINGER_TOPPINGS,
      shapeLabel: 'Roll it out!',
      paintR: 64,
      base: { raw: '#e6c48c', done: '#b9762f', innerRaw: '#efd9ac', innerDone: '#cb8b45', lineRaw: '#d2b184', lineDone: '#94571d', tint: '#6f3f10' },
    },
    brownie: {
      id: 'brownie', name: 'Brownies', thing: 'tray of brownies', emoji: '\ud83c\udf6b', icon: ICON.brownieCard,
      form: 'tin', decorateAfter: true, tone: FLAVOURS.chocolate,
      ingredients: ['flour', 'sugar', 'cocoa', 'eggs', 'butter'],
      flavours: false,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['bake', '🔥', 'Bake'], ['decorate', '🎨', 'Icing'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 140, 74, 34], ['sugar', 176, 74, 34], ['cocoa', 212, 74, 34]],
      fridge: [['eggs', 22, 54], ['butter', 54, 54]],
      paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: CAKE_TOPPINGS,
      shapeLabel: 'Pour it in!',
      box: { cx: 200, top: 148, bottom: 240, rx: 96, ry: 20, tinW: 52, plateY: 266, plateRx: 144 },
    },
    garlicbread: {
      id: 'garlicbread', name: 'Garlic Bread', thing: 'garlic bread', emoji: '\ud83e\udd56', icon: ICON.garlicCard,
      form: 'flat', decorateAfter: false,
      ingredients: ['flour', 'yeast', 'salt', 'water', 'garlic'],
      flavours: false,
      steps: [['recipe', '📖', 'Recipe'], ['gather', '🧺', 'Gather'], ['mix', '🥣', 'Mix'], ['roll', '🥖', 'Roll'], ['decorate', '🧄', 'Butter'], ['bake', '🔥', 'Bake'], ['serve', '🎉', 'Eat!']],
      cupboard: [['flour', 134, 76, 30], ['yeast', 166, 76, 30], ['salt', 198, 76, 30]],
      fridge: [['garlic', 22, 54], ['butter', 54, 54], ['cheese', 22, 100]],
      paints: BUTTERS, paintTitle: 'Butter', paintWord: 'butter',
      shake: { name: 'Cheese!', icon: ICON.cheese, word: 'cheese', mode: 'layer' },
      toppings: GARLIC_TOPPINGS,
      shapeLabel: 'Roll it out!',
      base: { raw: '#f1dfae', done: '#d9a05a', innerRaw: '#f6e9c6', innerDone: '#efd08e', lineRaw: '#d8c08a', lineDone: '#b07a3a', tint: '#b5651d' },
    },
    bananabread: {
      id: 'bananabread', name: 'Banana Bread', thing: 'banana bread', emoji: '\ud83c\udf4c', icon: ICON.loafCard,
      form: 'tin', decorateAfter: true,
      tone: { batter: '#eddaa4', crumb: '#e2c98f', crust: '#bd8c4c', jam: '#f6e3b6' },
      ingredients: ['flour', 'sugar', 'eggs', 'butter', 'banana'],
      flavours: false,
      steps: [['recipe', '\ud83d\udcd6', 'Recipe'], ['gather', '\ud83e\uddfa', 'Gather'], ['mix', '\ud83e\udd63', 'Mix'], ['bake', '\ud83d\udd25', 'Bake'], ['decorate', '\ud83c\udfa8', 'Icing'], ['serve', '\ud83c\udf89', 'Eat!']],
      cupboard: [['flour', 140, 74, 34], ['sugar', 184, 74, 34]],
      fridge: [['eggs', 22, 54], ['butter', 54, 54], ['banana', 22, 100]],
      paints: ICINGS, paintTitle: 'Icing', paintWord: 'icing',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: CAKE_TOPPINGS,
      shapeLabel: 'Pour it in!',
      box: { cx: 200, top: 142, bottom: 246, rx: 92, ry: 22, tinW: 52, plateY: 270, plateRx: 146 },
    },
    tart: {
      id: 'tart', name: 'Berry Tart', thing: 'tart', emoji: '\ud83e\udd67', icon: ICON.tartCard,
      form: 'flat', decorateAfter: false,
      ingredients: ['flour', 'butter', 'sugar', 'berries'],
      flavours: false,
      steps: [['recipe', '\ud83d\udcd6', 'Recipe'], ['gather', '\ud83e\uddfa', 'Gather'], ['mix', '\ud83e\udd63', 'Mix'], ['roll', '\ud83e\udd56', 'Roll'], ['decorate', '\ud83c\udf53', 'Fill'], ['bake', '\ud83d\udd25', 'Bake'], ['serve', '\ud83c\udf89', 'Eat!']],
      cupboard: [['flour', 140, 76, 32], ['sugar', 182, 76, 32]],
      fridge: [['butter', 22, 54], ['berries', 54, 54]],
      paints: FILLINGS, paintTitle: 'Filling', paintWord: 'filling',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: TART_TOPPINGS,
      shapeLabel: 'Roll it out!',
      paintR: 78,
      base: { raw: '#f3e3bd', done: '#ddb376', innerRaw: '#f9eed6', innerDone: '#eccd99', lineRaw: '#dcc79c', lineDone: '#bb9055', tint: '#9c6a2a' },
    },
    scone: {
      id: 'scone', name: 'Jam Scone', thing: 'scone', emoji: '\ud83e\uded3', icon: ICON.sconeCard,
      form: 'flat', decorateAfter: true,
      ingredients: ['flour', 'butter', 'sugar', 'milk'],
      flavours: false,
      steps: [['recipe', '\ud83d\udcd6', 'Recipe'], ['gather', '\ud83e\uddfa', 'Gather'], ['mix', '\ud83e\udd63', 'Mix'], ['roll', '\ud83e\udd56', 'Roll'], ['bake', '\ud83d\udd25', 'Bake'], ['decorate', '\ud83c\udf53', 'Jam'], ['serve', '\ud83c\udf89', 'Eat!']],
      cupboard: [['flour', 140, 76, 32], ['sugar', 182, 76, 32]],
      fridge: [['butter', 22, 54], ['milk', 54, 54]],
      paints: JAMS, paintTitle: 'Jam', paintWord: 'jam',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: COOKIE_TOPPINGS,
      shapeLabel: 'Roll it out!',
      paintR: 68,
      base: { raw: '#f2e2ba', done: '#e0b877', innerRaw: '#f9f0da', innerDone: '#eed3a4', lineRaw: '#dcc79c', lineDone: '#c09659', tint: '#a2712f' },
    },
    flapjack: {
      id: 'flapjack', name: 'Flapjacks', thing: 'tray of flapjacks', emoji: '\ud83c\udf3e', icon: ICON.flapjackCard,
      form: 'tin', decorateAfter: true,
      tone: { batter: '#e8cd8e', crumb: '#dbb772', crust: '#b8873c', jam: '#f0dcae' },
      ingredients: ['oats', 'sugar', 'honey', 'butter'],
      flavours: false,
      steps: [['recipe', '\ud83d\udcd6', 'Recipe'], ['gather', '\ud83e\uddfa', 'Gather'], ['mix', '\ud83e\udd63', 'Mix'], ['bake', '\ud83d\udd25', 'Bake'], ['decorate', '\ud83c\udfa8', 'Icing'], ['serve', '\ud83c\udf89', 'Eat!']],
      cupboard: [['oats', 134, 74, 34], ['sugar', 170, 74, 34], ['honey', 206, 74, 34]],
      fridge: [['butter', 22, 54]],
      paints: ICINGS, paintTitle: 'Drizzle', paintWord: 'drizzle',
      shake: { name: 'Shake!', icon: ICON.sprinkles, colors: SPRINKLE_COLORS, word: 'sprinkles', mode: 'sprinkle' },
      toppings: CAKE_TOPPINGS,
      shapeLabel: 'Press it in!',
      box: { cx: 200, top: 160, bottom: 240, rx: 96, ry: 18, tinW: 52, plateY: 266, plateRx: 144 },
    },
  };

  /* ---------------- state ---------------- */
  let state;
  let loopId = 0;
  let tickFn = null;

  function freshState() {
    return {
      recipe: null,          // 'cake' | 'cupcake' | 'cookie' | 'pizza'
      step: 'recipe',
      scene: 'kitchen',      // kitchen | mix | roll | cut | bake | decorate | serve
      phase: 'recipe',       // kitchen phase: recipe | bowl | fill
      carrying: null,        // 'bowl' | 'tin' | an ingredient/flavour id
      added: [],
      flavour: null,
      mix: 0,
      stirring: false,
      spoonAngle: 0,
      poured: false,
      roll: 0,
      rolling: false,
      holdRoll: false,
      cut: false,            // has the gingerbread man been pressed out yet
      pipes: [],             // piped icing lines, in the food's own coordinates
      pipe: null,            // the icing pen in hand
      inOven: false,
      bake: 0,
      baked: false,
      out: false,
      icing: null,           // icing (cake, cupcake, cookie) or sauce (pizza) id
      icingT: 0,
      drips: [],
      sprinkles: [],
      cheese: 0,             // 0-3 layers of cheese on a pizza
      cheeseF: [],
      cheeseSpots: [],
      chips: [],             // choc chips baked into a cookie
      toppings: [],
      tool: null,
      blown: false,
      bites: 0,
      gone: false,
      eating: false,
    };
  }
  const recipe = () => RECIPES[state.recipe || 'cake'];
  const isPizza = () => state.recipe === 'pizza';
  const isFlat = () => recipe().form === 'flat';
  const isMan = () => recipe().flatShape === 'man';
  /* The cake / cupcake shape, in the close-up scenes. */
  const box = () => recipe().box || RECIPES.cake.box;

  function say(text) {
    helper.textContent = text;
    helper.classList.remove('pop');
    void helper.offsetWidth;
    helper.classList.add('pop');
  }

  function buildSteps() {
    /* Before a recipe is picked there is no plan yet: showing the cake's would
       be a fib, and the shelf wants the room for the recipe cards. */
    stepsEl.hidden = !state.recipe;
    stepsEl.innerHTML = recipe().steps.map(([id, dot, lbl]) => `<li data-step="${id}"><span class="dot">${dot}</span><span class="lbl">${lbl}</span></li>`).join('');
  }
  function setStep(step) {
    state.step = step;
    stage.classList.remove('grab');
    const order = recipe().steps.map((s) => s[0]);
    const idx = order.indexOf(step);
    [...stepsEl.children].forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('done', i < idx);
    });
  }
  const phaseStep = (p) => (p === 'recipe' ? 'recipe' : 'gather');

  /* The close-up stages, in order, for the recipe being made. Once you have
     zoomed in on the bowl the camera stays close all the way through these. */
  function flow() {
    const r = recipe();
    if (r.form === 'tin') return ['mix', 'bake', 'decorate', 'serve'];
    if (r.cutter) return ['mix', 'roll', 'cut', 'bake', 'decorate', 'serve'];
    if (r.decorateAfter) return ['mix', 'roll', 'bake', 'decorate', 'serve'];
    return ['mix', 'roll', 'decorate', 'bake', 'serve'];
  }
  function goNext(from) {
    const f = flow();
    const next = f[f.indexOf(from) + 1];
    ({ roll: renderRoll, cut: renderCut, bake: renderBake, decorate: renderDecorate, serve: renderServe })[next]();
  }

  function loop(fn) {
    tickFn = fn;
    cancelAnimationFrame(loopId);
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (tickFn) tickFn(dt);
      loopId = requestAnimationFrame(frame);
    };
    loopId = requestAnimationFrame(frame);
  }
  function stopLoop() { tickFn = null; cancelAnimationFrame(loopId); }

  /* CSS animations override an SVG transform attribute while they run, so the
     animated classes are always removed again when the animation ends. */
  function animateClass(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
  const wobble = (el) => animateClass(el, 'wobble');
  const bounce = (el) => animateClass(el, 'bounce');

  /* The finished food wobbles by animating the SVG `transform` attribute of
     the whole food group, not by a CSS transform. A CSS rotate on a <g> is
     unreliable at moving children that carry their own SVG transform
     attributes (the round decoration bits on top stay stuck in place while
     the food swings); an SVG transform attribute on the wrapping group is
     applied to every descendant, so base and decorations move as one. */
  let foodWobble = null;
  function wobbleFood(el) {
    if (!el) return;
    if (foodWobble) {
      cancelAnimationFrame(foodWobble.raf);
      if (foodWobble.el) foodWobble.el.removeAttribute('transform');
    }
    const pivot = isFlat()
      ? { x: 0, y: isMan() ? 58 : 60 }
      : (() => { const C = box(); return { x: C.cx, y: C.top + (C.bottom - C.top) * 0.8 }; })();
    const t0 = performance.now();
    const dur = 500;
    const kf = [[0, 0], [0.25, -4], [0.5, 4], [0.75, -2], [1, 0]];
    const angle = (t) => {
      if (t <= 0 || t >= 1) return 0;
      for (let i = 0; i < kf.length - 1; i++) {
        if (t <= kf[i + 1][0]) {
          const a = kf[i], b = kf[i + 1];
          let u = (t - a[0]) / (b[0] - a[0]);
          u = u * u * (3 - 2 * u);
          return a[1] + (b[1] - a[1]) * u;
        }
      }
      return 0;
    };
    const frame = (now) => {
      if (!el.isConnected) { foodWobble = null; return; }
      const t = (now - t0) / dur;
      if (t >= 1) {
        el.removeAttribute('transform');
        foodWobble = null;
        return;
      }
      el.setAttribute('transform', `rotate(${angle(t).toFixed(2)} ${pivot.x} ${pivot.y})`);
      foodWobble.raf = requestAnimationFrame(frame);
    };
    foodWobble = { el, raf: requestAnimationFrame(frame) };
  }

  /* Entrance animation for a whole scene. Only its own animationend removes
     the class (children bubble theirs up too). */
  function enterScene(cls) {
    const svg = $('svg');
    if (!svg) return;
    svg.classList.add(cls);
    const off = (e) => { if (e.target === svg) { svg.classList.remove(cls); svg.removeEventListener('animationend', off); } };
    svg.addEventListener('animationend', off);
  }
  /* Zoom the kitchen in on a point (SVG coords) then run next(). */
  function zoomInto(x, y, next) {
    const svg = $('svg');
    if (!svg) { next(); return; }
    sfx.whoosh();
    svg.style.transformOrigin = `${(x / 4).toFixed(1)}% ${(y / 3).toFixed(1)}%`;
    svg.classList.add('zooming-in');
    setTimeout(next, 480);
  }
  /* Pull back out to the kitchen. Only happens once everything is eaten. */
  function zoomOutTo(next) {
    const svg = $('svg');
    if (!svg) { next(); return; }
    sfx.whoosh();
    svg.style.transformOrigin = '50% 50%';
    svg.classList.add('zooming-out');
    setTimeout(next, 420);
  }

  function goButton(label, cls, onClick) {
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    const b = document.createElement('button');
    b.className = 'go-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    shelf.appendChild(b);
    return b;
  }

  function itemButton({ id, name, icon, cls }) {
    const b = document.createElement('button');
    b.className = 'item' + (cls ? ' ' + cls : '');
    b.dataset.id = id;
    b.innerHTML = `${icon}<span>${name}</span>`;
    return b;
  }
  function group(title, buttons) {
    const g = document.createElement('div');
    g.className = 'group';
    if (title) {
      const t = document.createElement('div');
      t.className = 'group-title';
      t.textContent = title;
      g.appendChild(t);
    }
    buttons.forEach((b) => g.appendChild(b));
    return g;
  }
  function note(text) {
    const d = document.createElement('div');
    d.className = 'note';
    d.textContent = text;
    shelf.appendChild(d);
    return d;
  }
  function bigButton(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'big-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    stage.appendChild(b);
    return b;
  }

  /* Fly an icon from an element on screen to an SVG point on the stage. */
  function fly(fromEl, svgEl, sx, sy, iconHtml, done) {
    const pt = svgEl.createSVGPoint();
    pt.x = sx; pt.y = sy;
    const p = pt.matrixTransform(svgEl.getScreenCTM());
    const r = fromEl.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'flyer';
    f.innerHTML = iconHtml;
    f.style.left = (r.left + r.width / 2 - 28) + 'px';
    f.style.top = (r.top + r.height / 2 - 28) + 'px';
    document.body.appendChild(f);
    const dx = p.x - (r.left + r.width / 2);
    const dy = p.y - (r.top + r.height / 2);
    const anim = f.animate([
      { transform: 'translate(0,0) scale(1)', offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(1.1) rotate(20deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(60deg)`, opacity: 0.6, offset: 1 },
    ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => { f.remove(); done(); };
  }

  /* ---------------- carrying (click to pick up, click to put down) ---------------- */
  let carryEl = null;     // the floating icon that follows the pointer
  let carryFrom = null;   // the kitchen item element it came from, hidden while held
  function moveCarry(x, y) {
    if (carryEl) { carryEl.style.left = x + 'px'; carryEl.style.top = y + 'px'; }
  }
  window.addEventListener('pointermove', (e) => moveCarry(e.clientX, e.clientY));
  window.addEventListener('pointerdown', (e) => moveCarry(e.clientX, e.clientY));

  function startCarry(id, icon, e, fromItem) {
    endCarry();
    state.carrying = id;
    carryEl = document.createElement('div');
    carryEl.className = 'carry';
    carryEl.innerHTML = icon;
    document.body.appendChild(carryEl);
    moveCarry(e.clientX, e.clientY);
    if (fromItem) { carryFrom = fromItem; fromItem.classList.add('held'); }
    stage.classList.add('carrying');
    sfx.pickup();
    updateHints();
  }
  function endCarry() {
    state.carrying = null;
    if (carryEl) carryEl.remove();
    carryEl = null;
    if (carryFrom) carryFrom.classList.remove('held');
    carryFrom = null;
    stage.classList.remove('carrying');
    updateHints();
  }
  function updateHints() {
    const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? '' : 'none'; };
    const c = state.carrying;
    show('hintCounter', c === 'bowl');
    show('hintBowl', !!c && c !== 'bowl' && c !== 'tin');
    show('hintOven', c === 'tin');
  }

  /* ================= KITCHEN ================= */
  /* Where things sit in the kitchen picture (viewBox 400 x 300). */
  const K = {
    bowl: { x: 131, y: 82, s: 0.32 },        // the shared bowl drawing, shrunk onto the counter
    bowlPt: { x: 195, y: 127 },              // middle of the bowl, for flying things in and zooming
    tap: { x: 252, y: 140 },                 // where the water comes out
  };

  function kItem(id, x, y, s) {
    const used = state.added.includes(id);
    return `<g class="k-item${used ? ' used' : ''}" data-id="${id}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6" fill="#fff" opacity="0.001"/>${placeIcon(ICON[id], x, y, s)}</g>`;
  }

  function kitchenBowl() {
    return `<g id="kbowl" data-hit="bowl" transform="translate(${K.bowl.x} ${K.bowl.y}) scale(${K.bowl.s})">${bowlSVG()}</g>`;
  }

  function renderKitchen(anim) {
    stopLoop();
    endCarry();
    state.scene = 'kitchen';
    const p = state.phase;
    const r = recipe();
    buildSteps();
    setStep(phaseStep(p));
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="70%" r="70%">
            <stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#7a4b2a"/>
          </radialGradient>
          <pattern id="tiles" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="#dcc7ab"/><rect x="1" y="1" width="18" height="18" rx="3" fill="#f8eeda"/>
          </pattern>
          <pattern id="floor" width="44" height="44" patternUnits="userSpaceOnUse">
            <rect width="44" height="44" fill="#cf9a76"/><rect width="22" height="22" fill="#bd8360"/><rect x="22" y="22" width="22" height="22" fill="#bd8360"/>
          </pattern>
        </defs>
        <rect width="400" height="300" fill="#f0e1cd"/>
        <rect y="118" width="400" height="116" fill="url(#tiles)"/>
        <rect y="116" width="400" height="4" fill="#c9ab88"/>
        <rect y="232" width="400" height="68" fill="url(#floor)"/>
        <rect y="230" width="400" height="5" fill="#9c6d4c"/>

        <!-- bunting along the top of the wall; drawn first so the cupboard
             and the window pelmet sit in front of it -->
        <g id="kbunting">
          <path d="M8 12Q150 26 292 12" fill="none" stroke="#c2a684" stroke-width="1.6" stroke-linecap="round"/>
          <g stroke="#00000018" stroke-width="0.6">
            <path d="M26 14h10l-5 10z" fill="#dcaea7"/>
            <path d="M60 16h10l-5 10z" fill="#9fb795"/>
            <path d="M94 18h10l-5 10z" fill="#edcc93"/>
            <path d="M128 19h10l-5 10z" fill="#c0796c"/>
            <path d="M162 19h10l-5 10z" fill="#bfd4d4"/>
            <path d="M196 18h10l-5 10z" fill="#edcc93"/>
            <path d="M230 16h10l-5 10z" fill="#dcaea7"/>
            <path d="M264 14h10l-5 10z" fill="#9fb795"/>
          </g>
        </g>

        <!-- window -->
        <g id="kwindowWall">
          <rect x="300" y="30" width="84" height="70" rx="8" fill="#bcd8e2" stroke="#fdf7ec" stroke-width="6"/>
          <circle cx="360" cy="52" r="12" fill="#f5d489"/>
          <g fill="#fff"><ellipse cx="322" cy="60" rx="14" ry="7"/><ellipse cx="332" cy="56" rx="10" ry="8"/></g>
          <path d="M342 30v70M300 66h84" stroke="#fdf7ec" stroke-width="5"/>
          <rect x="300" y="30" width="84" height="70" rx="8" fill="none" stroke="#c2a684" stroke-width="3"/>
          <path d="M296 26h92v10H296z" fill="#b98753"/>
          <path d="M300 36q10 30 4 62" fill="#dcaea7" stroke="#b8837b" stroke-width="2"/>
          <path d="M384 36q-10 30-4 62" fill="#dcaea7" stroke="#b8837b" stroke-width="2"/>
        </g>
        <!-- clock -->
        <g id="kclock">
          <circle cx="266" cy="64" r="17" fill="#fdf7ec" stroke="#c0796c" stroke-width="4"/>
          <path d="M266 64V53M266 64l7 5" stroke="#8a6a54" stroke-width="3" stroke-linecap="round"/>
          <circle cx="266" cy="64" r="2" fill="#8a6a54"/>
        </g>

        <!-- counter -->
        <g id="kcounter" data-hit="counter">
          <rect x="104" y="172" width="186" height="60" rx="6" fill="#9fb795" stroke="#75906b" stroke-width="4"/>
          <rect x="114" y="182" width="78" height="18" rx="5" fill="#b1c6a7"/>
          <rect x="146" y="189" width="14" height="4" rx="2" fill="#f6efe2"/>
          <rect x="202" y="182" width="78" height="18" rx="5" fill="#b1c6a7"/>
          <rect x="234" y="189" width="14" height="4" rx="2" fill="#f6efe2"/>
          <rect x="114" y="206" width="78" height="20" rx="5" fill="#b1c6a7"/>
          <rect x="202" y="206" width="78" height="20" rx="5" fill="#b1c6a7"/>
          <circle cx="184" cy="216" r="3" fill="#f6efe2"/><circle cx="210" cy="216" r="3" fill="#f6efe2"/>
          <rect x="100" y="160" width="194" height="14" rx="5" fill="#d0a165" stroke="#a97c46" stroke-width="3"/>
          <ellipse id="hintCounter" class="hint" cx="180" cy="165" rx="52" ry="9" style="display:none"/>
        </g>

        <!-- a pillar tap standing on the counter, pipe and all -->
        <g id="ksink" data-hit="sink">
          <rect x="228" y="96" width="60" height="76" rx="8" fill="#fff" opacity="0.001"/>
          <ellipse cx="276.5" cy="161" rx="13" ry="3.5" fill="#7a5c3a" opacity="0.16"/>
          <rect x="271" y="122" width="11" height="30" rx="4" fill="#f2dfb7" stroke="#b58f56" stroke-width="2.5"/>
          <rect x="273.4" y="127" width="2.6" height="21" rx="1.3" fill="#fdf7ec" opacity="0.7"/>
          <path d="M266.5 160.5h20l-3.5-11h-13z" fill="#e9d3a6" stroke="#b58f56" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="276.5" cy="102" r="5.5" fill="#cfe0e3" stroke="#a3bcc0" stroke-width="2.5"/>
          <rect x="274" y="104" width="5" height="10" rx="2.5" fill="#dcb984" stroke="#b58f56" stroke-width="2"/>
          <rect x="267" y="112" width="19" height="15" rx="5" fill="#f2dfb7" stroke="#b58f56" stroke-width="2.5"/>
          <path d="M276 124v3q0 9 -11 9h-11" fill="none" stroke="#b58f56" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M276 124v3q0 9 -11 9h-11" fill="none" stroke="#e9d3a6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="247" y="131" width="11" height="9" rx="3" fill="#e9d3a6" stroke="#b58f56" stroke-width="2"/>
          <g id="kwater" style="display:none">
            <rect class="stream" x="249.5" y="139" width="6" height="21" rx="3" fill="#c2d9de" opacity="0.9"/>
            <ellipse class="splash" cx="252" cy="160" rx="10" ry="3" fill="#deecee" opacity="0.9"/>
            <circle class="splash" cx="241" cy="155" r="2" fill="#deecee"/>
            <circle class="splash" cx="263" cy="154" r="2.4" fill="#deecee"/>
          </g>
        </g>

        <!-- cupboard on the wall -->
        <g id="kcupboard" data-hit="cupboard">
          <rect x="128" y="30" width="104" height="88" rx="8" fill="#cf9f6c" stroke="#9c7040" stroke-width="4"/>
          <rect x="134" y="36" width="92" height="76" rx="5" fill="#fdf7ec"/>
          <rect x="134" y="72" width="92" height="4" fill="#cdae80"/>
          <rect x="134" y="108" width="92" height="4" fill="#cdae80"/>
          ${p === 'recipe' || p === 'bowl' ? `<g class="k-item" data-id="bowl"><rect x="158" y="34" width="44" height="40" rx="6" fill="#fff" opacity="0.001"/>${placeIcon(ICON.bowl, 158, 32, 44)}</g>` : ''}
          ${r.cupboard.map(([id, x, y, s]) => kItem(id, x, y, s)).join('')}
          <!-- two doors, hinged on the outer edges, so they part in the middle -->
          <g class="door left">
            <rect x="128" y="30" width="52" height="88" rx="8" fill="#cf9f6c" stroke="#9c7040" stroke-width="4"/>
            <rect x="138" y="42" width="32" height="64" rx="5" fill="none" stroke="#e2bd8d" stroke-width="3"/>
            <rect x="169" y="64" width="6" height="20" rx="3" fill="#f6efe2" stroke="#9c7040" stroke-width="2"/>
            <path d="M154 62l3.4 6.8 7 1-5.2 5.1 1.4 7-6.6-3.6-6.6 3.6 1.4-7-5.2-5.1 7-1z" fill="#f6efe2" opacity="0.55"/>
          </g>
          <g class="door">
            <rect x="180" y="30" width="52" height="88" rx="8" fill="#cf9f6c" stroke="#9c7040" stroke-width="4"/>
            <rect x="190" y="42" width="32" height="64" rx="5" fill="none" stroke="#e2bd8d" stroke-width="3"/>
            <rect x="185" y="64" width="6" height="20" rx="3" fill="#f6efe2" stroke="#9c7040" stroke-width="2"/>
            <path d="M206 60c-4.5-4.6 0-10.6 4.5-6 4.5-4.6 9 1.4 4.5 6l-4.5 4.6z" fill="#f6efe2" opacity="0.55"/>
          </g>
        </g>

        <!-- fridge -->
        <g id="kfridge" data-hit="fridge">
          <rect x="10" y="40" width="86" height="192" rx="10" fill="#bfd4d4" stroke="#8fadad" stroke-width="4"/>
          <rect x="16" y="46" width="74" height="180" rx="6" fill="#f8fbfa"/>
          <g fill="#b4cbcb"><rect x="16" y="92" width="74" height="4"/><rect x="16" y="138" width="74" height="4"/><rect x="16" y="184" width="74" height="4"/></g>
          ${r.fridge.map(([id, x, y]) => kItem(id, x, y, 34)).join('')}
          <g class="door">
            <rect x="10" y="40" width="86" height="192" rx="10" fill="#bfd4d4" stroke="#8fadad" stroke-width="4"/>
            <rect x="12" y="100" width="82" height="4" fill="#8fadad"/>
            <rect x="80" y="58" width="7" height="28" rx="3.5" fill="#f6efe2" stroke="#8fadad" stroke-width="2"/>
            <rect x="80" y="118" width="7" height="54" rx="3.5" fill="#f6efe2" stroke="#8fadad" stroke-width="2"/>
            <path d="M40 150c-6-6 0-14 6-8 6-6 12 2 6 8l-6 6z" fill="#c9857c"/>
            <rect x="28" y="176" width="26" height="18" rx="4" fill="#f2dfb7" stroke="#cbae7f" stroke-width="2"/>
            <path d="M33 185h16M33 189h10" stroke="#c0a276" stroke-width="2" stroke-linecap="round"/>
            <circle cx="30" cy="66" r="6" fill="#a9c2c4"/>
          </g>
        </g>

        <!-- oven (we bake at the bench, close up) -->
        <g id="koven" data-hit="oven">
          <rect x="296" y="122" width="94" height="110" rx="10" fill="#f8f0e1" stroke="#b99b74" stroke-width="4"/>
          <rect x="296" y="122" width="94" height="16" rx="8" fill="#e6d3b4"/>
          <g fill="#fdf7ec" stroke="#b99b74" stroke-width="2.5"><circle cx="318" cy="130" r="6"/><circle cx="368" cy="130" r="6"/></g>
          <g fill="#fdf7ec" stroke="#b99b74" stroke-width="2"><circle cx="310" cy="146" r="4.5"/><circle cx="325" cy="146" r="4.5"/><circle cx="361" cy="146" r="4.5"/><circle cx="376" cy="146" r="4.5"/></g>
          <circle cx="343" cy="146" r="8" fill="#fdf7ec" stroke="#b99b74" stroke-width="2"/>
          <line x1="343" y1="146" x2="343" y2="140" stroke="#a15f54" stroke-width="2.5" stroke-linecap="round"/>
          <rect x="304" y="158" width="78" height="66" rx="8" fill="#ecdfc7" stroke="#b99b74" stroke-width="3"/>
          <rect x="312" y="166" width="62" height="50" rx="6" fill="#3f3229"/>
          <line x1="316" y1="208" x2="370" y2="208" stroke="#7a6553" stroke-width="2"/>
          <line x1="316" y1="213" x2="370" y2="213" stroke="#7a6553" stroke-width="2"/>
          <rect x="312" y="166" width="62" height="50" rx="6" fill="none" stroke="#fdf7ec" stroke-width="3" opacity="0.55"/>
          <rect x="318" y="150" width="50" height="6" rx="3" fill="#fdf7ec" stroke="#b99b74" stroke-width="2"/>
        </g>

        <g id="bowlSlot">${p === 'fill' ? kitchenBowl() : ''}</g>
        <ellipse id="hintBowl" class="hint" cx="195" cy="128" rx="52" ry="20" style="display:none"/>
      </svg>`;
    enterScene(anim || 'enter-kitchen');
    if (p === 'fill') paintBowl();

    const svg = $('svg');
    svg.addEventListener('click', kitchenClick);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    ['kfridge', 'kcupboard'].forEach((id) => {
      const g = $(id);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setDoor(g, true); });
      g.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') setDoor(g, false); });
    });

    renderKitchenShelf();
    sayKitchenHint();
  }

  function setDoor(g, open) {
    if (g.classList.contains('open') === open) return;
    g.classList.toggle('open', open);
    sfx.door();
  }

  function sayKitchenHint() {
    switch (state.phase) {
      case 'recipe': say('What shall we make today? Pick a recipe!'); break;
      case 'bowl': say('First, get a bowl out of the cupboard!'); break;
      case 'fill': sayFillHint(true); break;
      default: break;
    }
  }
  function missingList() {
    const m = recipe().ingredients.filter((id) => !state.added.includes(id)).map((id) => INGREDIENTS[id].name.toLowerCase());
    if (recipe().flavours && !state.flavour) m.push('a flavour');
    return m;
  }
  function sayFillHint(first) {
    const m = missingList();
    if (!m.length) { say('Everything is in! Tap the bowl to mix it up.'); return; }
    if (first && !state.added.length) {
      say(recipe().ingredients.includes('water')
        ? 'Open the fridge and cupboard, turn on the tap, then tap the bowl!'
        : 'Open the fridge and cupboard, tap a thing, then tap the bowl!');
      return;
    }
    say((first ? '' : pick(['In it goes. ', 'Lovely. ', 'Perfect. ', 'That is that. '])) + 'Still need ' + listWords(m) + '.');
  }
  const hasCandles = () => state.toppings.some((t) => t.id === 'candle');

  function renderKitchenShelf() {
    shelf.innerHTML = '';
    const p = state.phase;
    const r = recipe();
    if (p === 'recipe') {
      const cards = Object.values(RECIPES).map((rc) => {
        const b = itemButton({ id: rc.id, name: rc.name, icon: rc.icon, cls: 'recipe pulse' });
        b.addEventListener('click', () => chooseRecipe(rc.id));
        return b;
      });
      shelf.appendChild(group('What shall we make?', cards));
      return;
    }
    const chips = r.ingredients.map((id) => {
      const ing = INGREDIENTS[id];
      const b = itemButton({ id, name: ing.name, icon: ICON[id], cls: 'small' });
      if (state.added.includes(id)) b.classList.add('used');
      b.addEventListener('click', () => {
        sfx.tap();
        say(state.added.includes(id) ? `${ing.name} is already in the bowl.`
          : id === 'water' ? 'Water comes out of the tap!' : `${ing.name} is in the ${WHERE[id]}!`);
      });
      return b;
    });
    if (r.flavours) {
      const fl = state.flavour ? FLAVOURS[state.flavour] : null;
      const fb = itemButton({ id: 'flavour', name: fl ? fl.name : 'Flavour?', icon: fl ? ICON[state.flavour] : ICON.question, cls: 'small' });
      if (fl) fb.classList.add('used');
      fb.addEventListener('click', () => {
        sfx.tap();
        say(fl ? `${fl.name} it is!` : 'The flavours are in the fridge: chocolate, strawberry, vanilla or lemon!');
      });
      chips.push(fb);
    }
    shelf.appendChild(group(p === 'bowl' ? `${r.name} recipe (get the bowl first!)` : `${r.name} recipe`, chips));
  }

  function chooseRecipe(id) {
    state.recipe = id;
    state.phase = 'bowl';
    if (RECIPES[id].base && RECIPES[id].base.chips) {
      state.chips = [];
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * 78;
        state.chips.push({ x: rr * Math.cos(a), y: rr * Math.sin(a), r: rand(4, 7) });
      }
    }
    sfx.yay();
    renderKitchen('enter-swap');
    say(`${RECIPES[id].name}! First, get a bowl out of the cupboard.`);
  }

  /* Turn the tap on for a moment. */
  function runTap(then) {
    const w = $('kwater');
    if (!w) { if (then) then(); return; }
    w.style.display = '';
    w.classList.add('running');
    sfx.splash();
    setTimeout(() => {
      if ($('kwater') === w) { w.style.display = 'none'; w.classList.remove('running'); }
      if (then) then();
    }, 850);
  }

  function kitchenClick(e) {
    if (state.scene !== 'kitchen') return;
    const item = e.target.closest('.k-item');
    const hitEl = e.target.closest('[data-hit]');
    const hit = hitEl ? hitEl.dataset.hit : null;
    if (state.carrying) { dropCarried(hit); return; }
    if (state.flyBusy) return;
    if (item) { pickItem(item, e); return; }
    switch (hit) {
      case 'cupboard':
      case 'fridge':
        // Mouse users open doors by hovering; taps toggle them.
        if (e.pointerType !== 'mouse') { const g = hit === 'fridge' ? $('kfridge') : $('kcupboard'); setDoor(g, !g.classList.contains('open')); }
        break;
      case 'sink': sinkTapped(e); break;
      case 'bowl': bowlTapped(); break;
      case 'oven':
        sfx.tap();
        say(state.phase === 'recipe' ? 'Pick a recipe from the shelf first!' : 'We will use the oven later. Fill the bowl first!');
        wobble($('koven'));
        break;
      case 'counter':
        if (state.phase === 'recipe') { sfx.tap(); say('Pick a recipe from the shelf first!'); }
        else if (state.phase === 'bowl') { sfx.tap(); say('The bowl is in the cupboard!'); wobble($('kcupboard')); }
        break;
      default: break;
    }
  }

  function sinkTapped(e) {
    const needsWater = recipe().ingredients.includes('water') && !state.added.includes('water');
    if (state.phase === 'fill' && needsWater) {
      runTap(() => {
        if (state.scene === 'kitchen' && !state.carrying) {
          startCarry('water', ICON.water, e, null);
          say('A jug of water! Now tap the bowl.');
        }
      });
      say('Filling the jug...');
      return;
    }
    runTap();
    if (state.phase === 'recipe') say('Lovely and clean. Pick a recipe from the shelf.');
    else if (needsWater === false && recipe().ingredients.includes('water')) say('We already have our water!');
    else say(pick(['Splish splash.', 'Nice and clean.', 'A little rinse.', 'Bubbles.']));
  }

  function pickItem(item, e) {
    const id = item.dataset.id;
    if (state.phase === 'recipe') { wobble(item); sfx.no(); say('Pick a recipe from the shelf first!'); return; }
    if (id === 'bowl') {
      if (state.phase !== 'bowl') return;
      startCarry('bowl', ICON.bowl, e, item);
      say('Pop it on the counter!');
      return;
    }
    if (item.classList.contains('used')) { wobble($('bowl')); sfx.no(); say('That one is already in!'); return; }
    if (state.phase === 'bowl') { wobble(item); sfx.no(); say('Get the bowl first! It is in the cupboard.'); return; }
    if (state.phase !== 'fill') { wobble(item); sfx.no(); say(`Not now! The ${recipe().thing} is already made.`); return; }
    if (!recipe().ingredients.includes(id) && !(recipe().flavours && FLAVOURS[id])) {
      wobble(item); sfx.no();
      say('Ooh, that one goes on top later.');
      return;
    }
    if (FLAVOURS[id] && state.flavour && state.flavour !== id) {
      wobble(item); sfx.no();
      say(`You already picked ${FLAVOURS[state.flavour].name.toLowerCase()}!`);
      return;
    }
    startCarry(id, ICON[id], e, item);
    say('Now tap the bowl!');
  }

  function dropCarried(hit) {
    const id = state.carrying;
    if (id === 'bowl') {
      if (hit === 'counter' || hit === 'bowl' || hit === 'sink') placeBowl();
      else { endCarry(); sfx.no(); say('Back in the cupboard it goes. Tap the counter to put it down!'); }
    } else if (hit === 'bowl') {
      addToBowl(id);
    } else {
      endCarry(); sfx.no(); say('Put it back. Tap the bowl to add it next time!');
    }
  }

  function placeBowl() {
    endCarry();
    state.phase = 'fill';
    $('bowlSlot').innerHTML = kitchenBowl();
    paintBowl();
    bounce($('bowl'));
    sfx.plop();
    renderKitchenShelf();
    sayFillHint(true);
  }

  function addToBowl(id) {
    if (state.flyBusy) return;
    state.flyBusy = true;
    fly(carryEl, $('svg'), K.bowlPt.x, K.bowlPt.y - 6, ICON[id], () => {
      state.flyBusy = false;
      if (state.scene !== 'kitchen') return;
      state.added.push(id);
      if (FLAVOURS[id]) state.flavour = id;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = blobFor(id);
      $('blobs').appendChild(g);
      paintBowl();
      bounce($('bowl'));
      sfx.plop();
      const it = stage.querySelector(`.k-item[data-id="${id}"]`);
      if (it) { it.classList.remove('held'); it.classList.add('used'); }
      renderKitchenShelf();
      sayFillHint(false);
    });
    carryFrom = null; // stays hidden: it is in the bowl now
    endCarry();
    sfx.tap();
  }

  function paintBowl() {
    const batter = $('batter');
    if (!batter) return;
    batter.setAttribute('fill', '#f6e7b4');
    batter.setAttribute('opacity', state.added.length ? '0.35' : '0');
  }

  function bowlTapped() {
    if (state.phase !== 'fill') return;
    const m = missingList();
    if (m.length) {
      wobble($('bowl'));
      sfx.no();
      say('Not yet! Still need ' + listWords(m) + '.');
      return;
    }
    sfx.tap();
    zoomInto(K.bowlPt.x, K.bowlPt.y, renderMix);
  }

  /* The wall behind the bench. Every close-up used to sit on a blank card;
     giving them the same plaster and splashback as the kitchen keeps you in
     the same room, and fills a big picture rather than floating in it. */
  const TILE_DEF = `<defs><pattern id="tiles" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#dcc7ab"/><rect x="1" y="1" width="18" height="18" rx="3" fill="#f8eeda"/>
    </pattern></defs>`;
  const JAR = (x, fill) => `<g>
      <rect x="${x}" y="${38}" width="24" height="28" rx="5" fill="#eee3cd" stroke="#c3ab86" stroke-width="2"/>
      <rect x="${x + 2}" y="50" width="20" height="14" rx="3" fill="${fill}"/>
      <rect x="${x - 3}" y="32" width="30" height="7" rx="3" fill="#b98753"/>
    </g>`;
  const WALL_SHELF = `<g id="wallshelf">
      <rect x="26" y="66" width="112" height="6" rx="3" fill="#c69b6d"/>
      <rect x="26" y="72" width="112" height="4" rx="2" fill="#a3784c"/>
      ${JAR(36, '#dcaea7')}${JAR(70, '#9fb795')}${JAR(104, '#edcc93')}
    </g>`;
  const backdrop = (h, tileTop, defs) => `${defs === false ? '' : TILE_DEF}
    <rect x="-60" y="-30" width="520" height="${h + 60}" fill="#f0e1cd"/>
    <rect x="-60" y="${tileTop}" width="520" height="${h - tileTop + 30}" fill="url(#tiles)"/>
    <rect x="-60" y="${tileTop - 2}" width="520" height="4" fill="#c9ab88"/>
    ${WALL_SHELF}`;

  /* ================= MIX ================= */
  const BOWL = { cx: 200, cy: 140, rx: 126, ry: 32 };

  const BLOBS = {
    flour: () => `<ellipse cx="170" cy="138" rx="46" ry="16" fill="#fbf7ee"/><ellipse cx="160" cy="132" rx="20" ry="8" fill="#fff"/>`,
    sugar: () => {
      let s = '';
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        s += `<circle cx="${(250 + 34 * r * Math.cos(a)).toFixed(1)}" cy="${(132 + 12 * r * Math.sin(a)).toFixed(1)}" r="2" fill="#fff"/>`;
      }
      return s;
    },
    eggs: () => `<ellipse cx="205" cy="150" rx="30" ry="12" fill="#fff8ea" opacity="0.9"/><circle cx="198" cy="150" r="8" fill="#ffc83d"/><circle cx="216" cy="148" r="7" fill="#ffd35c"/>`,
    butter: () => `<rect x="130" y="146" width="34" height="14" rx="4" fill="#ffe58a" stroke="#e6c85a" stroke-width="1.5"/>`,
    milk: () => `<ellipse cx="222" cy="126" rx="62" ry="12" fill="#f4f8ff" opacity="0.85"/>`,
    honey: () => `<ellipse cx="214" cy="144" rx="38" ry="11" fill="#ffc94d" opacity="0.9"/><ellipse cx="200" cy="140" rx="12" ry="4" fill="#ffe08a" opacity="0.8"/>`,
    yeast: () => {
      let s = '';
      for (let i = 0; i < 18; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        s += `<circle cx="${(228 + 30 * r * Math.cos(a)).toFixed(1)}" cy="${(146 + 10 * r * Math.sin(a)).toFixed(1)}" r="2.2" fill="#d9b06a"/>`;
      }
      return s;
    },
    salt: () => {
      let s = '';
      for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        s += `<circle cx="${(150 + 28 * r * Math.cos(a)).toFixed(1)}" cy="${(146 + 9 * r * Math.sin(a)).toFixed(1)}" r="1.5" fill="#fff"/>`;
      }
      return s;
    },
    oil: () => `<ellipse cx="205" cy="146" rx="40" ry="10" fill="#e8d44d" opacity="0.8"/><ellipse cx="196" cy="143" rx="12" ry="4" fill="#fff" opacity="0.5"/>`,
    water: () => `<ellipse cx="220" cy="128" rx="64" ry="13" fill="#cfe9ff" opacity="0.85"/><ellipse cx="240" cy="126" rx="14" ry="3" fill="#fff" opacity="0.7"/>`,
    chocolate: () => `<path d="M160 148q40-28 84 0q-42 12-84 0z" fill="#8a5a3b"/>`,
    strawberry: () => `<g fill="#ff5c7a"><circle cx="180" cy="140" r="6"/><circle cx="210" cy="150" r="7"/><circle cx="235" cy="135" r="6"/><circle cx="195" cy="128" r="5"/></g>`,
    vanilla: () => `<g fill="#5b3320"><circle cx="180" cy="140" r="1.6"/><circle cx="210" cy="150" r="1.6"/><circle cx="235" cy="135" r="1.6"/><circle cx="195" cy="128" r="1.6"/><circle cx="225" cy="145" r="1.6"/></g>`,
    lemon: () => `<g fill="#ffe45c" stroke="#dcb64f"><ellipse cx="190" cy="140" rx="10" ry="6"/><ellipse cx="222" cy="148" rx="10" ry="6"/></g>`,
    ginger: () => {
      let s = '';
      for (let i = 0; i < 24; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        s += `<circle cx="${(176 + 32 * r * Math.cos(a)).toFixed(1)}" cy="${(140 + 11 * r * Math.sin(a)).toFixed(1)}" r="2" fill="#d59a4e"/>`;
      }
      return s;
    },
    treacle: () => `<ellipse cx="216" cy="148" rx="40" ry="12" fill="#3f2410" opacity="0.9"/><ellipse cx="204" cy="144" rx="13" ry="4" fill="#6b4426" opacity="0.8"/>`,
    cocoa: () => {
      let s = '';
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        s += `<circle cx="${(192 + 36 * r * Math.cos(a)).toFixed(1)}" cy="${(140 + 12 * r * Math.sin(a)).toFixed(1)}" r="2.2" fill="#6b4029"/>`;
      }
      return s;
    },
    oats: () => {
      let s = '';
      for (let i = 0; i < 20; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        const x = 200 + 42 * r * Math.cos(a), y = 142 + 13 * r * Math.sin(a);
        s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.5" ry="2.6" transform="rotate(${rand(-40, 40).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#e2c68f" stroke="#c4a367" stroke-width="1"/>`;
      }
      return s;
    },
    garlic: () => `<g fill="#f6ecd8" stroke="#dcc9a4" stroke-width="1.6"><ellipse cx="180" cy="142" rx="9" ry="6" transform="rotate(-18 180 142)"/><ellipse cx="202" cy="148" rx="9" ry="6" transform="rotate(12 202 148)"/><ellipse cx="222" cy="138" rx="8" ry="5.5" transform="rotate(-6 222 138)"/></g>`,
    tomato: () => `<ellipse cx="204" cy="146" rx="42" ry="12" fill="#d13a48" opacity="0.9"/><ellipse cx="192" cy="142" rx="12" ry="4" fill="#e8636d" opacity="0.7"/>`,
    cheese: () => {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
        const x = 202 + 40 * r * Math.cos(a), y = 142 + 12 * r * Math.sin(a);
        s += `<rect x="${(x - 6).toFixed(1)}" y="${(y - 1.6).toFixed(1)}" width="12" height="3.2" rx="1.6" transform="rotate(${rand(-30, 30).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#f4d36a"/>`;
      }
      return s;
    },
    banana: () => `<g fill="#f2df9f" stroke="#d8bd6d" stroke-width="1.4"><ellipse cx="182" cy="142" rx="11" ry="6"/><ellipse cx="206" cy="148" rx="11" ry="6"/><ellipse cx="228" cy="139" rx="10" ry="5.5"/></g>`,
    berries: () => `<g fill="#5b4b9c" stroke="#3d3172" stroke-width="1.4"><circle cx="180" cy="142" r="7"/><circle cx="200" cy="150" r="7.5"/><circle cx="222" cy="140" r="6.5"/><circle cx="240" cy="147" r="6"/></g>`,
    plain: () => `<ellipse cx="200" cy="142" rx="32" ry="10" fill="#ecdcba" opacity="0.85"/>`,
  };
  /* anything without its own drawing still gets a little pool in the bowl */
  const blobFor = (id) => (BLOBS[id] || BLOBS.plain)();

  /* The mixing bowl, with whatever is in it. Shared by the kitchen and the close-up. */
  function bowlSVG() {
    return `<g id="bowl">
      <path d="M60 140C60 225 120 262 200 262S340 225 340 140z" fill="#a9d8ff" stroke="#7fb8ee" stroke-width="5" stroke-linejoin="round"/>
      <path d="M80 175c10 40 50 60 120 62" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
      <ellipse cx="200" cy="140" rx="140" ry="40" fill="#c5e5ff" stroke="#7fb8ee" stroke-width="5"/>
      <ellipse cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#5aa0dc"/>
      <ellipse id="batter" cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#f6e7b4" opacity="0"/>
      <g id="blobs">${state.added.map((id) => `<g class="blob">${blobFor(id)}</g>`).join('')}</g>
      <ellipse id="glossy" cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#fff" opacity="0"/>
      <g id="spoon" style="display:none">
        <path d="M270 140l60-95" stroke="#d9a86c" stroke-width="12" stroke-linecap="round"/>
        <path d="M270 140l60-95" stroke="#b3803f" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.001"/>
        <ellipse cx="262" cy="150" rx="16" ry="22" transform="rotate(30 262 150)" fill="#e8bd83" stroke="#b3803f" stroke-width="3"/>
      </g>
    </g>`;
  }

  /* Everything is in the bowl (and a flavour is picked, where one is needed). */
  function doughReady() {
    return recipe().ingredients.every((id) => state.added.includes(id)) && (!recipe().flavours || !!state.flavour);
  }

  /* The colour a tin recipe bakes to: the flavour you picked, or the recipe's
     own fixed tone where there is nothing to pick (brownies are chocolate
     whatever you do, banana bread is banana). */
  const bakeTone = () => (state.flavour && FLAVOURS[state.flavour]) || recipe().tone || FLAVOURS.vanilla;

  function batterColor() {
    if (isFlat()) return doughColor();
    return bakeTone().batter;
  }
  function doughColor() {
    const b = recipe().base || { raw: DOUGH };
    if (!recipe().flavours || !state.flavour) return b.raw;
    return mixHex(b.raw, FLAVOURS[state.flavour].batter, 0.5);
  }

  /* What the batter is poured into: a cake tin, a paper case, or a baking tray. */
  function mixVessel() {
    const r = recipe();
    if (r.form === 'flat') {
      return `<g id="tin" style="display:none">
        <ellipse cx="322" cy="252" rx="66" ry="15" fill="#e8c9a0" stroke="#c9a05a" stroke-width="3"/>
        <ellipse cx="322" cy="249" rx="56" ry="10" fill="#f0dcb4"/>
        <ellipse id="dough" cx="290" cy="180" rx="0" ry="0" fill="${doughColor()}" stroke="#d9c08a" stroke-width="2" style="display:none"/>
      </g>`;
    }
    if (r.paperCase) {
      return `<g id="tin" style="display:none">
        <defs><clipPath id="vesselClip"><path d="M294 224h56l-9 42h-38z"/></clipPath></defs>
        <path d="M294 224h56l-9 42h-38z" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="3" stroke-linejoin="round"/>
        <g clip-path="url(#vesselClip)"><rect id="tinFill" x="292" y="266" width="60" height="0" fill="#f6e7b4"/></g>
        <path d="M308 224l-4 42M322 224v42M336 224l4 42" stroke="#f2a0b5" stroke-width="2" opacity="0.7" fill="none"/>
        <path id="stream" d="" fill="#f6e7b4" opacity="0"/>
      </g>`;
    }
    return `<g id="tin" style="display:none">
      <rect x="262" y="228" width="120" height="34" rx="6" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="3"/>
      <rect id="tinFill" x="266" y="258" width="112" height="0" rx="4" fill="#f6e7b4"/>
      <path id="stream" d="" fill="#f6e7b4" opacity="0"/>
    </g>`;
  }

  function renderMix() {
    stopLoop();
    endCarry();
    setStep('mix');
    state.scene = 'mix';
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        ${backdrop(300, 118)}
        <rect x="0" y="238" width="400" height="62" fill="#efdcc0"/>
        <rect x="0" y="238" width="400" height="8" fill="#d7b98f"/>
        <ellipse cx="200" cy="262" rx="150" ry="12" fill="rgba(0,0,0,0.07)"/>
        <g id="bowlMove">${bowlSVG()}</g>
        ${mixVessel()}
      </svg>`;
    enterScene('enter-close');

    renderMixShelf();
    updateMixVisuals();

    const svg = $('svg');
    const startStir = (e) => {
      if (!doughReady() || state.mix >= 100) return;
      e.preventDefault();
      state.stirring = true;
      state.mix = Math.min(100, state.mix + 5);
      sfx.stir();
    };
    const stopStir = () => { state.stirring = false; };
    svg.addEventListener('pointerdown', startStir);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', stopStir);
    window.addEventListener('pointercancel', stopStir);

    loop((dt) => {
      if (state.stirring && state.mix < 100) {
        state.spoonAngle += 520 * dt;
        state.mix = Math.min(100, state.mix + 38 * dt);
        if (Math.random() < 0.08) sfx.stir();
        updateMixVisuals();
        if (state.mix >= 100) mixDone();
      } else if (doughReady() && state.mix < 100) {
        state.spoonAngle += 30 * dt;
        updateMixVisuals();
      }
    });
  }

  function updateMixVisuals() {
    const t = state.mix / 100;
    const batter = $('batter');
    const blobs = $('blobs');
    const spoon = $('spoon');
    if (!batter) return;
    const ready = doughReady();
    stage.classList.toggle('grab', ready && state.mix < 100);
    batter.setAttribute('fill', mixHex('#f6e7b4', batterColor(), t));
    batter.setAttribute('opacity', (state.added.length ? 0.35 + 0.65 * t : 0).toFixed(2));
    blobs.setAttribute('opacity', (1 - t).toFixed(2));
    $('glossy').setAttribute('opacity', (t * 0.15).toFixed(2));
    if (ready && state.mix < 100) {
      spoon.style.display = '';
      spoon.setAttribute('transform', `rotate(${state.spoonAngle % 360} ${BOWL.cx} ${BOWL.cy})`);
    } else {
      spoon.style.display = 'none';
    }
  }

  function renderMixShelf() {
    shelf.innerHTML = '';
    const r = recipe();
    const baseDone = r.ingredients.every((id) => state.added.includes(id));
    if (!baseDone) {
      say(state.added.length ? 'Keep going! Tap the next one.' : 'Tap the things to put them in the bowl!');
      const btns = r.ingredients.map((id) => {
        const b = itemButton({ id, name: INGREDIENTS[id].name, icon: ICON[id] });
        if (state.added.includes(id)) b.classList.add('used');
        b.addEventListener('click', () => addIngredient(id, b));
        return b;
      });
      shelf.appendChild(group('Into the bowl', btns));
    } else if (r.flavours && !state.flavour) {
      say('Ooh, what flavour?');
      const btns = Object.keys(FLAVOURS).map((id) => {
        const b = itemButton({ id, name: FLAVOURS[id].name, icon: ICON[id] });
        b.addEventListener('click', () => addIngredient(id, b));
        return b;
      });
      shelf.appendChild(group('Pick a flavour', btns));
    } else if (state.mix < 100) {
      say(isFlat() ? 'Hold the spoon and mix the dough!' : 'Hold the spoon and stir, stir, stir!');
      const b = itemButton({ id: 'spoon', name: 'Stir!', icon: ICON.spoon, cls: 'wide hold pulse' });
      const start = (e) => { e.preventDefault(); b.classList.remove('pulse'); state.stirring = true; state.mix = Math.min(100, state.mix + 5); sfx.stir(); };
      b.addEventListener('pointerdown', start);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      shelf.appendChild(group('', [b]));
      note('Or rub the bowl with your finger');
    } else {
      note(isFlat() ? 'Soft and squishy dough! Ready to roll.' : 'Smooth and yummy! Ready to pour.');
    }
  }

  function addIngredient(id, btn) {
    if (state.added.includes(id)) { wobble($('bowl')); sfx.no(); say('That one is already in!'); return; }
    if (state.flyBusy) return;
    state.flyBusy = true;
    sfx.tap();
    btn.classList.add('used');
    fly(btn, $('svg'), BOWL.cx, BOWL.cy - 10, ICON[id], () => {
      state.flyBusy = false;
      state.added.push(id);
      if (FLAVOURS[id]) state.flavour = id;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = blobFor(id);
      $('blobs').appendChild(g);
      bounce($('bowl'));
      sfx.plop();
      updateMixVisuals();
      renderMixShelf();
    });
  }

  function mixDone() {
    state.stirring = false;
    updateMixVisuals();
    sfx.yay();
    say(isFlat() ? 'Lovely dough! Tip it out to roll.' : 'Smooth batter! Pour it in.');
    renderMixShelf();
    goButton(recipe().shapeLabel, '', isFlat() ? tipOutDough : pourBatter);
  }

  /* Tip the bowl clockwise around its right lip (shrinking it a little so it stays in view). */
  function tipBowl(bowl, ease) {
    const s = lerp(1, 0.7, ease);
    bowl.setAttribute('transform', `translate(${-60 * ease} ${40 * ease}) rotate(${60 * ease} 340 140) translate(340 140) scale(${s.toFixed(3)}) translate(-340 -140)`);
  }

  function pourBatter() {
    if (state.poured) return;
    state.poured = true;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    say('Pouring it in...');
    sfx.pour();
    const r = recipe();
    const tin = $('tin');
    const tinFill = $('tinFill');
    const stream = $('stream');
    const bowl = $('bowlMove');
    const color = batterColor();
    const fillBottom = r.paperCase ? 266 : 258;
    const fillMax = r.paperCase ? 36 : 26;
    tin.style.display = '';
    tinFill.setAttribute('fill', color);
    stream.setAttribute('fill', color);
    let t = 0;
    loop((dt) => {
      t += dt;
      const a = clamp(t / 0.8, 0, 1);
      tipBowl(bowl, 1 - Math.pow(1 - a, 3));
      const p = clamp((t - 0.6) / 1.1, 0, 1);
      if (p > 0) {
        stream.setAttribute('opacity', p < 1 ? '1' : String(1 - clamp((t - 1.7) / 0.3, 0, 1)));
        const top = 172, bottom = 238;
        const y2 = lerp(top, bottom, Math.min(1, p * 2.5));
        stream.setAttribute('d', `M272 ${top} C272 ${top + 24} 296 ${top + 30} 298 ${y2} h16 C314 ${top + 30} 292 ${top + 24} 290 ${top} z`);
        const h = fillMax * clamp((p - 0.3) / 0.7, 0, 1);
        tinFill.setAttribute('y', (fillBottom - h).toFixed(1));
        tinFill.setAttribute('height', h.toFixed(1));
      }
      if (t > 2.2) {
        stopLoop();
        say('All in. Into the oven...');
        goNext('mix');
      }
    });
  }

  /* Flat things: the dough plops out of the bowl onto the board, ready to roll. */
  function tipOutDough() {
    if (state.poured) return;
    state.poured = true;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    say('Out it comes...');
    const tin = $('tin');
    const ball = $('dough');
    const bowl = $('bowlMove');
    tin.style.display = '';
    let t = 0;
    let plopped = false;
    loop((dt) => {
      t += dt;
      const a = clamp(t / 0.8, 0, 1);
      tipBowl(bowl, 1 - Math.pow(1 - a, 3));
      const p = clamp((t - 0.6) / 0.5, 0, 1);
      if (p > 0) {
        ball.style.display = '';
        ball.setAttribute('cx', lerp(288, 322, p).toFixed(1));
        ball.setAttribute('cy', lerp(178, 230, p * p).toFixed(1));
        ball.setAttribute('rx', lerp(22, 24, p).toFixed(1));
        ball.setAttribute('ry', lerp(22, 20, p).toFixed(1));
      }
      if (p >= 1 && !plopped) { plopped = true; sfx.plop(); bounce($('tin')); }
      if (t > 1.5) {
        stopLoop();
        goNext('mix');
      }
    });
  }

  /* ================= ROLLING (its own little game) ================= */
  const ROLL = { cx: 200, cy: 156, r0: 34, r1: 100, need: 850 };

  function renderRoll() {
    stopLoop();
    endCarry();
    state.scene = 'roll';
    setStep('roll');
    let flour = '';
    for (let i = 0; i < 26; i++) {
      flour += `<circle cx="${rand(46, 354).toFixed(0)}" cy="${rand(44, 264).toFixed(0)}" r="${rand(1, 2.6).toFixed(1)}" fill="#fff" opacity="${rand(0.4, 0.9).toFixed(2)}"/>`;
    }
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <rect width="400" height="300" fill="#f0e1cd"/>
        <rect x="24" y="26" width="352" height="252" rx="18" fill="#e2c096" stroke="#b98d52" stroke-width="6"/>
        <g stroke="#d0ab7c" stroke-width="3" opacity="0.7">
          <path d="M24 84h352M24 150h352M24 216h352"/>
        </g>
        <g id="flour">${flour}</g>
        <ellipse id="doughShadow" cx="${ROLL.cx}" cy="${ROLL.cy + 8}" rx="${ROLL.r0}" ry="${ROLL.r0 * 0.9}" fill="rgba(0,0,0,0.08)"/>
        <ellipse id="rdough" cx="${ROLL.cx}" cy="${ROLL.cy}" rx="${ROLL.r0}" ry="${ROLL.r0}" fill="${doughColor()}" stroke="${mixHex(doughColor(), '#000000', 0.14)}" stroke-width="3"/>
        <g id="puffs"></g>
        <g id="pinG" transform="translate(${ROLL.cx} 250)">
          <rect x="-62" y="-15" width="124" height="30" rx="15" fill="#f0d9ad" stroke="#b98d52" stroke-width="3"/>
          <g id="pinGrain" opacity="0.55">
            <rect x="-40" y="-15" width="6" height="30" fill="#e0c08a"/>
            <rect x="-6" y="-15" width="4" height="30" fill="#e0c08a"/>
            <rect x="26" y="-15" width="5" height="30" fill="#e0c08a"/>
          </g>
          <rect x="-88" y="-7" width="28" height="14" rx="7" fill="#d9a86c" stroke="#b3803f" stroke-width="3"/>
          <rect x="60" y="-7" width="28" height="14" rx="7" fill="#d9a86c" stroke="#b3803f" stroke-width="3"/>
        </g>
      </svg>`;
    enterScene('enter-swap');
    stage.classList.add('grab');
    lastPuff = 0;
    say('Roll the dough flat! Push the rolling pin over it.');
    renderRollShelf();
    updateRoll();

    const svg = $('svg');
    let last = null;
    let grain = 0;
    const at = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    const movePin = (x, y) => {
      const g = $('pinG');
      if (g) g.setAttribute('transform', `translate(${clamp(x, 60, 340).toFixed(1)} ${clamp(y, 40, 268).toFixed(1)})`);
    };
    const down = (e) => {
      if (state.roll >= 1) return;
      e.preventDefault();
      state.rolling = true;
      last = at(e);
      movePin(last.x, last.y);
    };
    const move = (e) => {
      if (!state.rolling || state.roll >= 1) return;
      const p = at(e);
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
      movePin(p.x, p.y);
      grain += d;
      addRoll(d);
    };
    const up = () => { state.rolling = false; };
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    let sweep = 0;
    loop((dt) => {
      if (state.holdRoll && state.roll < 1) {
        sweep += dt * 2.6;
        const x = ROLL.cx + Math.sin(sweep) * 92;
        const y = ROLL.cy + Math.cos(sweep * 0.7) * 46;
        movePin(x, y);
        addRoll(300 * dt);
      }
      const g = $('pinGrain');
      if (g && (state.rolling || state.holdRoll)) {
        g.setAttribute('transform', `translate(${((Math.sin(performance.now() / 90) * 6)).toFixed(1)} 0)`);
      }
    });
  }

  let lastPuff = 0;
  function addRoll(d) {
    if (state.roll >= 1) return;
    state.roll = clamp(state.roll + d / ROLL.need, 0, 1);
    updateRoll();
    if (state.roll - lastPuff > 0.09) {
      lastPuff = state.roll;
      sfx.roll();
      puff();
    }
    if (state.roll >= 1) rollDone();
  }

  function updateRoll() {
    const d = $('rdough');
    if (!d) return;
    const e = 1 - Math.pow(1 - state.roll, 1.6);
    const r = lerp(ROLL.r0, ROLL.r1, e);
    const squash = (state.rolling || state.holdRoll) ? 0.05 : 0;
    d.setAttribute('rx', (r * (1 + squash)).toFixed(1));
    d.setAttribute('ry', (r * (1 - squash)).toFixed(1));
    const sh = $('doughShadow');
    if (sh) { sh.setAttribute('rx', (r * 1.02).toFixed(1)); sh.setAttribute('ry', (r * 0.94).toFixed(1)); }
  }

  function puff() {
    const g = $('puffs');
    if (!g) return;
    const a = rand(0, Math.PI * 2);
    const r = lerp(ROLL.r0, ROLL.r1, state.roll);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', (ROLL.cx + Math.cos(a) * r).toFixed(1));
    c.setAttribute('cy', (ROLL.cy + Math.sin(a) * r * 0.9).toFixed(1));
    c.setAttribute('r', rand(5, 11).toFixed(1));
    c.setAttribute('fill', '#fff');
    c.setAttribute('opacity', '0.85');
    c.classList.add('puff');
    g.appendChild(c);
    setTimeout(() => c.remove(), 700);
  }

  function renderRollShelf() {
    shelf.innerHTML = '';
    if (state.roll >= 1) { note('A perfect round base!'); return; }
    const b = itemButton({ id: 'pin', name: 'Roll!', icon: ICON.pin, cls: 'wide hold pulse' });
    const start = (e) => { e.preventDefault(); b.classList.remove('pulse'); state.holdRoll = true; };
    const stop = () => { state.holdRoll = false; };
    b.addEventListener('pointerdown', start);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    shelf.appendChild(group('', [b]));
    note('Or push it about with your finger');
  }

  function rollDone() {
    state.rolling = false;
    state.holdRoll = false;
    stage.classList.remove('grab');
    sfx.yay();
    say(recipe().cutter ? 'Lovely and flat! Now for the cutter...'
      : recipe().decorateAfter ? 'Nice and flat! Into the oven...'
      : `A lovely base! Now for the ${recipe().paintWord}...`);
    renderRollShelf();
    setTimeout(() => { if (state.scene === 'roll') goNext('roll'); }, 900);
  }

  /* ================= CUTTING HIM OUT (its own little game) =================
     The rolled sheet of dough with a gingerbread man cutter over it. The
     cutter follows your finger; press, and a man-shaped hole is masked out of
     the sheet while the man himself lifts away to be baked. */
  const CUT = { cx: 200, cy: 150, rx: 122, ry: 112, s: 0.56, reach: 66 };

  function renderCut() {
    stopLoop();
    endCarry();
    state.scene = 'cut';
    setStep('cut');
    state.cut = false;
    const col = flatColors();
    const dough = col.raw, line = col.lineRaw;
    let flour = '';
    for (let i = 0; i < 26; i++) {
      flour += `<circle cx="${rand(46, 354).toFixed(0)}" cy="${rand(44, 264).toFixed(0)}" r="${rand(1, 2.6).toFixed(1)}" fill="#fff" opacity="${rand(0.4, 0.9).toFixed(2)}"/>`;
    }
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <defs>
          <mask id="slabMask">
            <rect width="400" height="300" fill="#fff"/>
            <g id="cutHole" fill="#000" style="display:none"></g>
          </mask>
          <mask id="cutterHole">
            <rect x="-400" y="-400" width="800" height="800" fill="#fff"/>
            <g fill="#000">${MAN_PARTS}</g>
          </mask>
        </defs>
        <rect width="400" height="300" fill="#f0e1cd"/>
        <rect x="24" y="26" width="352" height="252" rx="18" fill="#e2c096" stroke="#b98d52" stroke-width="6"/>
        <g stroke="#d0ab7c" stroke-width="3" opacity="0.7">
          <path d="M24 84h352M24 150h352M24 216h352"/>
        </g>
        <g id="flour">${flour}</g>
        <g id="slabG">
          <ellipse cx="${CUT.cx}" cy="${CUT.cy + 7}" rx="${CUT.rx}" ry="${CUT.ry}" fill="rgba(0,0,0,0.08)"/>
          <g mask="url(#slabMask)">
            <ellipse cx="${CUT.cx}" cy="${CUT.cy}" rx="${CUT.rx}" ry="${CUT.ry}" fill="${dough}" stroke="${line}" stroke-width="3"/>
          </g>
        </g>
        <g id="cutMan" style="display:none" transform="translate(${CUT.cx} ${CUT.cy}) scale(${CUT.s})">${manSVG(dough, line, 9)}</g>
        <g id="cutter" transform="translate(${CUT.cx} ${CUT.cy}) scale(${CUT.s})">
          <g id="cutterPress" mask="url(#cutterHole)">
            <g fill="#8fa3b0" stroke="#8fa3b0" stroke-width="26" stroke-linejoin="round">${MAN_PARTS}</g>
            <g fill="#e4edf2" stroke="#e4edf2" stroke-width="15" stroke-linejoin="round">${MAN_PARTS}</g>
          </g>
        </g>
      </svg>`;
    enterScene('enter-swap');
    stage.classList.add('grab');
    say('Press the cutter into the dough!');
    renderCutShelf();

    const svg = $('svg');
    const at = (e) => {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    /* Keep the cutter where the whole man still lands on the dough. */
    const onDough = (x, y) => {
      const dx = x - CUT.cx, dy = y - CUT.cy;
      const d = Math.hypot(dx / CUT.reach, dy / (CUT.reach * 0.86));
      if (d <= 1) return { x, y };
      return { x: CUT.cx + dx / d, y: CUT.cy + dy / d };
    };
    const moveCutter = (x, y) => {
      const g = $('cutter');
      if (!g || state.cut) return;
      const s = onDough(x, y);
      g.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${CUT.s})`);
      return s;
    };
    const hover = (e) => {
      if (state.scene !== 'cut' || state.cut) return;
      const q = at(e);
      moveCutter(q.x, q.y);
    };
    const press = (e) => {
      if (state.scene !== 'cut' || state.cut) return;
      e.preventDefault();
      const q = at(e);
      const spot = moveCutter(q.x, q.y);
      cutStamp(spot.x, spot.y);
    };
    svg.addEventListener('pointermove', hover);
    svg.addEventListener('pointerdown', press);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function renderCutShelf() {
    shelf.innerHTML = '';
    if (state.cut) { note('One gingerbread man!'); return; }
    const b = itemButton({ id: 'cutter', name: 'Press!', icon: ICON.cutter, cls: 'wide pulse' });
    b.addEventListener('click', () => {
      const g = $('cutter');
      if (!g || state.cut) return;
      const m = /translate\(([-0-9.]+) ([-0-9.]+)\)/.exec(g.getAttribute('transform'));
      cutStamp(m ? parseFloat(m[1]) : CUT.cx, m ? parseFloat(m[2]) : CUT.cy);
    });
    shelf.appendChild(group('', [b]));
    note('Or move the cutter about and tap the dough');
  }

  function cutStamp(x, y) {
    if (state.cut) return;
    state.cut = true;
    stage.classList.remove('grab');
    const hole = $('cutHole'), man = $('cutMan'), cutter = $('cutter');
    const place = `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${CUT.s})`;
    hole.innerHTML = MAN_PARTS;
    hole.setAttribute('transform', place);
    hole.style.display = '';
    man.setAttribute('transform', place);
    man.style.display = '';
    cutter.setAttribute('transform', place);
    animateClass($('cutterPress'), 'press');
    sfx.roll();
    sfx.plop();
    say('Press! One gingerbread man.');
    renderCutShelf();

    setTimeout(() => {
      if (state.scene !== 'cut') return;
      const slab = $('slabG');
      let t = 0;
      loop((dt) => {
        t = clamp(t + dt / 0.65, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        const nx = lerp(x, CUT.cx, e), ny = lerp(y, CUT.cy, e);
        man.setAttribute('transform', `translate(${nx.toFixed(1)} ${(ny - 10 * Math.sin(e * Math.PI)).toFixed(1)}) scale(${lerp(CUT.s, CUT.s * 1.16, e).toFixed(3)})`);
        if (cutter) cutter.style.opacity = (1 - e).toFixed(2);
        if (slab) slab.style.opacity = (1 - e * 0.8).toFixed(2);
        if (t >= 1) {
          stopLoop();
          if (state.scene === 'cut') goNext('cut');
        }
      });
    }, 520);
  }

  /* ================= BAKING (still close up, at the bench) ================= */
  const BAKE_SECONDS = 7;
  const B = {
    bench: { tin: { x: 108, y: 234, s: 0.72 }, flat: { x: 110, y: 212, s: 0.6 } },
    oven: { tin: { x: 310, y: 193, s: 0.42 }, flat: { x: 310, y: 182, s: 0.4 } },
    clock: { x: 366, y: 73 },
  };
  const benchSpot = () => (isFlat() ? B.bench.flat : B.bench.tin);
  const ovenSpot = () => (isFlat() ? B.oven.flat : B.oven.tin);

  /* The tin, the paper case or the baking tray, with the food in it. */
  function bakeFood() {
    if (!isFlat()) {
      const body = recipe().paperCase
        ? `<path d="M-42 -30h84l-11 40h-62z" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="3" stroke-linejoin="round"/>
           <path d="M-22 -30l-5 40M0 -30v40M22 -30l5 40" stroke="#f2a0b5" stroke-width="2" fill="none" opacity="0.7"/>`
        : `<rect x="-60" y="-28" width="120" height="34" rx="6" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="3"/>
           <rect x="-56" y="-24" width="112" height="6" rx="3" fill="#fff" opacity="0.5"/>`;
      return `<g id="cakeTin" data-hit="tin">
        <path id="cake" d="" fill="${batterColor()}"/>
        <g id="tinBody">${body}</g>
      </g>`;
    }
    return `<g id="cakeTin" data-hit="tin">
      <ellipse cx="0" cy="4" rx="112" ry="38" fill="#8f8f8f"/>
      <ellipse cx="0" cy="0" rx="112" ry="38" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="3"/>
      <ellipse cx="0" cy="-3" rx="100" ry="30" fill="#fff" opacity="0.35"/>
      <g id="foodDone" transform="translate(0 -4) scale(0.92 0.3)">${flatSVG()}</g>
    </g>`;
  }

  function renderBake() {
    stopLoop();
    endCarry();
    state.scene = 'bake';
    setStep('bake');
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="70%" r="70%">
            <stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#7a4b2a"/>
          </radialGradient>
          <linearGradient id="side" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
          <pattern id="tiles" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="#dcc7ab"/><rect x="1" y="1" width="18" height="18" rx="3" fill="#f8eeda"/>
          </pattern>
        </defs>
        ${backdrop(300, 118, false)}
        <rect x="-60" y="238" width="520" height="92" fill="#efdcc0"/>
        <rect x="0" y="238" width="400" height="8" fill="#d7b98f"/>

        <g id="koven" data-hit="oven">
          <rect x="228" y="52" width="166" height="186" rx="16" fill="#f8f0e1" stroke="#b99b74" stroke-width="5"/>
          <rect x="228" y="52" width="166" height="36" rx="16" fill="#e6d3b4"/>
          <g fill="#fdf7ec" stroke="#b99b74" stroke-width="3"><circle cx="252" cy="73" r="9"/><circle cx="282" cy="73" r="9"/></g>
          <circle cx="${B.clock.x}" cy="${B.clock.y}" r="13" fill="#fdf7ec" stroke="#b99b74" stroke-width="3"/>
          <line id="khand" x1="${B.clock.x}" y1="${B.clock.y}" x2="${B.clock.x}" y2="${B.clock.y - 9}" stroke="#a15f54" stroke-width="3" stroke-linecap="round"/>
          <rect x="240" y="98" width="142" height="132" rx="12" fill="#ecdfc7" stroke="#b99b74" stroke-width="4"/>
          <rect id="kwindow" x="252" y="110" width="118" height="98" rx="9" fill="#3f3229"/>
          <rect id="klight" x="252" y="110" width="118" height="98" rx="9" fill="url(#glow)" opacity="0"/>
          <g stroke="#7a6553" stroke-width="3"><line x1="258" y1="198" x2="364" y2="198"/><line x1="258" y1="206" x2="364" y2="206"/></g>
          <rect x="252" y="110" width="118" height="98" rx="9" fill="none" stroke="#fdf7ec" stroke-width="4" opacity="0.55"/>
          <rect x="248" y="88" width="126" height="9" rx="4.5" fill="#fdf7ec" stroke="#b99b74" stroke-width="2"/>
          <rect id="hintOven" class="hint" x="234" y="92" width="154" height="144" rx="16" style="display:none"/>
        </g>

        ${bakeFood()}
      </svg>`;
    enterScene('enter-swap');
    const s = benchSpot();
    placeFood(s.x, s.y, s.s, isFlat() ? 0 : 24);
    if (isFlat()) setFlatBake(state.bake || 0);

    const svg = $('svg');
    svg.addEventListener('click', bakeClick);
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    renderBakeShelf();
    say(recipe().paperCase ? 'Pick up the case and pop it in the oven!' : (isFlat() ? 'Pick up the tray and pop it in the oven!' : 'Pick up the tin and pop it in the oven!'));
  }

  const tinWord = () => (recipe().paperCase ? 'case' : isFlat() ? 'tray' : 'tin');

  function renderBakeShelf() {
    shelf.innerHTML = '';
    if (!state.inOven) { note(`Tap the ${tinWord()} to pick it up, then tap the oven.`); return; }
    if (!state.baked) { note('Bake, bake, bake...'); return; }
    if (state.out) { note('Ooh, look at it!'); return; }
    const b = itemButton({ id: 'open', name: 'Open!', icon: ICON.oven, cls: 'wide pulse' });
    b.addEventListener('click', takeOut);
    shelf.appendChild(group('', [b]));
  }

  function bakeClick(e) {
    if (state.scene !== 'bake') return;
    const hitEl = e.target.closest('[data-hit]');
    const hit = hitEl ? hitEl.dataset.hit : null;
    if (state.carrying === 'tin') {
      if (hit === 'oven') bakeInOven();
      else { endCarry(); $('cakeTin').style.display = ''; sfx.no(); say(`Back on the bench. Tap the oven to bake it!`); }
      return;
    }
    if (hit === 'oven') { ovenTapped(); return; }
    if (hit === 'tin') {
      if (state.inOven) { ovenTapped(); return; }
      $('cakeTin').style.display = 'none';
      startCarry('tin', carriedIcon(), e, null);
      say('Now tap the oven!');
    }
  }

  function carriedIcon() {
    if (isFlat()) return svgWrap(`<g transform="translate(24 24) scale(0.2)">${stripIds(flatSVG())}</g>`);
    return recipe().paperCase ? ICON.case(batterColor()) : ICON.tin(batterColor());
  }

  /* Move the tin / tray. cakeH is how tall the cake is (tin recipes only). */
  function placeFood(x, y, s, cakeH) {
    const g = $('cakeTin');
    if (!g) return;
    g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    const cake = $('cake');
    if (cake) {
      const w = box().tinW;
      const h = cakeH;
      const dome = Math.min(30, h * 0.45);
      cake.setAttribute('d', `M${-w} -24 v${-(h - dome)} q0 ${-dome} ${w} ${-dome} q${w} 0 ${w} ${dome} v${h - dome} z`);
    }
  }
  /* Brown a flat base as it bakes (t 0..1). */
  function setFlatBake(t) {
    state.bake = t;
    const col = flatColors();
    const tint = $('bakeTint');
    if (tint) tint.setAttribute('opacity', (t * 0.2).toFixed(2));
    if (isMan()) {
      const line = $('crustLine'), fill = $('crustFill');
      if (!line) return;
      const lc = mixHex(col.lineRaw, col.lineDone, t);
      line.setAttribute('fill', lc);
      line.setAttribute('stroke', lc);
      fill.setAttribute('fill', mixHex(col.raw, col.done, t));
      return;
    }
    const c = $('crust'), b = $('baseIn');
    if (!c) return;
    c.setAttribute('fill', mixHex(col.raw, col.done, t));
    c.setAttribute('stroke', mixHex(col.lineRaw, col.lineDone, t));
    b.setAttribute('fill', mixHex(col.innerRaw, col.innerDone, t));
    const ch = $('cheeseTop');
    if (ch) ch.setAttribute('fill', mixHex('#ffe08a', '#eaa93f', t));
    const bl = $('blisters');
    if (bl) bl.setAttribute('opacity', t.toFixed(2));
  }

  function bakeInOven() {
    if (state.inOven) return;
    state.inOven = true;
    endCarry();
    $('cakeTin').style.display = '';
    renderBakeShelf();
    say(isPizza() ? 'Bake, bake, bake... watch the cheese melt!' : 'Bake, bake, bake... watch it go!');
    sfx.tap();
    let t = 0;
    let dinged = false;
    const light = $('klight');
    const hand = $('khand');
    const winEl = $('kwindow');
    const from = benchSpot(), to = ovenSpot();
    loop((dt) => {
      t += dt;
      // glide across into the oven (0 - 0.7s)
      const a = clamp(t / 0.7, 0, 1);
      const ease = 1 - Math.pow(1 - a, 3);
      const bakeT = clamp((t - 0.7) / BAKE_SECONDS, 0, 1);
      state.bake = bakeT;
      const h = lerp(24, 70, 1 - Math.pow(1 - bakeT, 2));
      placeFood(lerp(from.x, to.x, ease), lerp(from.y, to.y, ease) - Math.sin(a * Math.PI) * 30, lerp(from.s, to.s, ease), h);
      if (isFlat()) setFlatBake(bakeT);
      else $('cake').setAttribute('fill', cakeBakedColor(bakeT));
      light.setAttribute('opacity', (ease * 0.9).toFixed(2));
      winEl.setAttribute('fill', mixHex('#4a3535', '#8a5a3a', ease));
      hand.setAttribute('transform', `rotate(${bakeT * 360} ${B.clock.x} ${B.clock.y})`);
      if (bakeT >= 1 && !dinged) {
        dinged = true;
        state.baked = true;
        stopLoop();
        sfx.ding();
        wobble($('koven'));
        const d = document.createElement('div');
        d.className = 'ding';
        d.textContent = 'DING!';
        stage.appendChild(d);
        say('Ding! Open the oven and take it out.');
        renderBakeShelf();
      }
    });
  }

  function cakeBakedColor(t) {
    const f = bakeTone();
    return mixHex(f.batter, f.crust, t);
  }

  function ovenTapped() {
    if (!state.inOven) { wobble($('koven')); sfx.no(); say(`Pick up the ${tinWord()} first!`); return; }
    if (state.out) return;
    if (!state.baked) { wobble($('koven')); sfx.no(); say(pick(['Not yet! Still baking...', 'Patience... nearly there!', 'Ooh, it smells good already.'])); return; }
    takeOut();
  }

  function takeOut() {
    if (state.out) return;
    state.out = true;
    stage.querySelectorAll('.ding').forEach((d) => d.remove());
    renderBakeShelf();
    say(isPizza() ? 'Ta-da! A hot bubbly pizza.' : 'Ta-da! Out it comes, all warm.');
    sfx.plop();
    $('klight').setAttribute('opacity', '0');
    $('kwindow').setAttribute('fill', '#4a3535');
    const from = ovenSpot(), to = benchSpot();
    let t = 0;
    loop((dt) => {
      t += dt;
      const a = clamp(t / 0.8, 0, 1);
      const ease = 1 - Math.pow(1 - a, 3);
      placeFood(lerp(from.x, to.x, ease), lerp(from.y, to.y, ease) - Math.sin(a * Math.PI) * 40, lerp(from.s, to.s, ease), 70);
      if (a >= 1) {
        stopLoop();
        bounce($('cakeTin'));
        setTimeout(() => { if (state.scene === 'bake') goNext('bake'); }, 700);
      }
    });
  }

  /* ================= THE FOOD ITSELF ================= */
  function edgeY(x) {
    const C = box();
    const dx = (x - C.cx) / C.rx;
    return C.top + C.ry * Math.sqrt(Math.max(0, 1 - dx * dx));
  }

  function makeDrips() {
    if (isFlat()) {
      const f = [];
      for (let i = 0; i < 20; i++) f.push(rand(0.93, 1));
      return f;
    }
    const C = box();
    const drips = [];
    const a = C.cx - C.rx + 16, b = C.cx + C.rx - 16;
    for (let x = a; x <= b + 0.1; x += (b - a) / 7) drips.push({ x: x + rand(-4, 4), len: rand(14, 44) * (C.rx / 100), w: rand(9, 12) * (C.rx / 100) });
    return drips;
  }

  function icingPath(t) {
    const C = box();
    if (!state.drips.length) return '';
    let d = `M${C.cx - C.rx} ${C.top}`;
    state.drips.forEach((dr) => {
      const xa = dr.x - dr.w, xb = dr.x + dr.w;
      const ea = edgeY(xa), eb = edgeY(xb);
      const bottom = edgeY(dr.x) + dr.len * t;
      const ctrl = (8 * bottom - 2 * ((ea + eb) / 2)) / 6;
      d += ` L${xa.toFixed(1)} ${ea.toFixed(1)} C${xa.toFixed(1)} ${ctrl.toFixed(1)} ${xb.toFixed(1)} ${ctrl.toFixed(1)} ${xb.toFixed(1)} ${eb.toFixed(1)}`;
    });
    d += ` L${C.cx + C.rx} ${C.top} A${C.rx} ${C.ry} 0 0 0 ${C.cx - C.rx} ${C.top} Z`;
    return d;
  }
  /* A wobbly circle spreading out from the middle: sauce, or melted cheese. */
  function blobPath(f, radius, t) {
    if (!f.length || t <= 0) return '';
    const n = f.length;
    const pt = (i) => {
      const a = (i / n) * Math.PI * 2;
      const r = radius * f[i % n] * t;
      return [r * Math.cos(a), r * Math.sin(a)];
    };
    const mid = (i) => { const p = pt(i), q = pt(i + 1); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
    let d = `M${mid(0)[0].toFixed(1)} ${mid(0)[1].toFixed(1)}`;
    for (let i = 1; i <= n; i++) {
      const c = pt(i), m = mid(i);
      d += ` Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    }
    return d + ' Z';
  }
  const paintR = () => recipe().paintR || PIZZA.sauceR;
  const saucePath = (t) => blobPath(state.drips, paintR(), t);

  function paintMarkup(t) {
    if (!state.icing) return '';
    const color = recipe().paints.find((i) => i.id === state.icing).color;
    return `<path id="icingPath" d="${isFlat() ? saucePath(t) : icingPath(t)}" fill="${color}" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>`;
  }

  /* Cheese covers most of the pizza, not like sprinkles. */
  function cheeseMarkup() {
    if (!state.cheese) return '';
    const b = state.bake || 0;
    const R = PIZZA.sauceR * (0.84 + 0.05 * state.cheese);
    const spots = state.cheeseSpots.slice(0, state.cheese * 5).map((s) => {
      const x = (Math.cos(s.a) * s.r * R).toFixed(1), y = (Math.sin(s.a) * s.r * R).toFixed(1);
      return `<ellipse cx="${x}" cy="${y}" rx="${s.rx.toFixed(1)}" ry="${s.ry.toFixed(1)}" transform="rotate(${s.rot.toFixed(0)} ${x} ${y})" fill="#fff3b0" opacity="0.55"/>`;
    }).join('');
    const blisters = state.cheeseSpots.slice(0, 8).map((s) => {
      const x = (Math.cos(s.a * 1.7) * s.r * R * 0.9).toFixed(1), y = (Math.sin(s.a * 1.7) * s.r * R * 0.9).toFixed(1);
      return `<ellipse cx="${x}" cy="${y}" rx="${(s.rx * 0.34).toFixed(1)}" ry="${(s.ry * 0.34).toFixed(1)}" fill="#c98a3e"/>`;
    }).join('');
    return `<g id="cheeseG2">
      <path id="cheeseTop" d="${blobPath(state.cheeseF, R, 1)}" fill="${mixHex('#ffe08a', '#eaa93f', b)}" stroke="rgba(0,0,0,0.06)" stroke-width="2"/>
      ${spots}
      <g id="blisters" opacity="${b.toFixed(2)}">${blisters}</g>
    </g>`;
  }

  function cakeSVG() {
    const C = box();
    const f = bakeTone();
    const dark = mixHex(f.crumb, '#000000', 0.18);
    const jamY = C.top + (C.bottom - C.top) * 0.47;
    const caseTop = C.top + (C.bottom - C.top) * 0.34;
    const w = C.rx + 5, foot = (C.rx + 5) * 0.74;
    const paper = recipe().paperCase ? `
      <path d="M${C.cx - w} ${caseTop} h${w * 2} l${-(w - foot)} ${C.bottom - caseTop + 8} h${-foot * 2} z" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="3" stroke-linejoin="round"/>
      <path d="M${C.cx - w * 0.5} ${caseTop} l${-(w - foot) * 0.5} ${C.bottom - caseTop + 8} M${C.cx} ${caseTop} v${C.bottom - caseTop + 8} M${C.cx + w * 0.5} ${caseTop} l${(w - foot) * 0.5} ${C.bottom - caseTop + 8}" stroke="#f2a0b5" stroke-width="2" fill="none" opacity="0.8"/>` : '';
    const jam = recipe().paperCase ? '' : `<path d="M${C.cx - C.rx} ${jamY} A${C.rx} ${C.ry} 0 0 0 ${C.cx + C.rx} ${jamY} v9 A${C.rx} ${C.ry} 0 0 1 ${C.cx - C.rx} ${jamY + 9} z" fill="${f.jam}"/>`;
    return `<g id="cakeG">
      <ellipse cx="${C.cx}" cy="${C.bottom}" rx="${C.rx}" ry="${C.ry}" fill="${dark}"/>
      <rect x="${C.cx - C.rx}" y="${C.top}" width="${C.rx * 2}" height="${C.bottom - C.top}" fill="${f.crumb}"/>
      <rect x="${C.cx - C.rx}" y="${C.top}" width="${C.rx * 2}" height="${C.bottom - C.top}" fill="url(#side)"/>
      ${jam}
      <ellipse cx="${C.cx}" cy="${C.top}" rx="${C.rx}" ry="${C.ry}" fill="${f.crust}"/>
      ${paper}
      <g id="icingG">${paintMarkup(state.icingT)}</g>
      <g id="sprinklesG">${state.sprinkles.map(sprinkleSVG).join('')}</g>
      <g id="toppingsG">${state.toppings.map(toppingSVG).join('')}</g>
    </g>`;
  }

  /* A flat round thing seen from above, centred on (0,0) with radius PIZZA.r. */
  const PIZZA = { r: 100, sauceR: 82, scale: 1.3, cx: 200, cy: 160 };
  function flatColors() {
    const b = recipe().base || RECIPES.pizza.base;
    if (!recipe().flavours || !state.flavour) return b;
    const f = FLAVOURS[state.flavour];
    return {
      raw: mixHex(b.raw, f.batter, 0.5), done: mixHex(b.done, f.crust, 0.5),
      innerRaw: mixHex(b.innerRaw, f.batter, 0.4), innerDone: mixHex(b.innerDone, f.crust, 0.4),
      lineRaw: b.lineRaw, lineDone: b.lineDone, tint: b.tint, chips: b.chips,
    };
  }
  function flatSVG() {
    const b = state.bake || 0;
    const col = flatColors();
    const man = isMan();
    const chips = col.chips
      ? `<g id="bakedChips">${state.chips.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r.toFixed(1)}" fill="${mixHex('#6b4029', '#4a2a18', b)}"/>`).join('')}</g>`
      : '';
    const base = man
      ? manSVG(mixHex(col.raw, col.done, b), mixHex(col.lineRaw, col.lineDone, b), 9)
      : `<circle id="crust" r="${PIZZA.r}" fill="${mixHex(col.raw, col.done, b)}" stroke="${mixHex(col.lineRaw, col.lineDone, b)}" stroke-width="4"/>
      <circle id="baseIn" r="${PIZZA.r - 16}" fill="${mixHex(col.innerRaw, col.innerDone, b)}"/>`;
    const tint = man
      ? `<g id="bakeTint" fill="${col.tint}" opacity="${(b * 0.2).toFixed(2)}" style="pointer-events:none">${MAN_PARTS}</g>`
      : `<circle id="bakeTint" r="${PIZZA.r}" fill="${col.tint}" opacity="${(b * 0.2).toFixed(2)}" style="pointer-events:none"/>`;
    return `<g id="cakeG">
      ${base}
      ${chips}
      <g id="icingG">${recipe().piping ? pipesMarkup() : paintMarkup(state.icingT)}</g>
      <g id="cheeseG">${cheeseMarkup()}</g>
      <g id="sprinklesG">${state.sprinkles.map(sprinkleSVG).join('')}</g>
      <g id="toppingsG">${state.toppings.map(toppingSVG).join('')}</g>
      ${tint}
    </g>`;
  }

  /* Piped icing: whatever lines were squeezed on, in the food's own space. */
  function pipesMarkup() {
    return state.pipes.map((p) =>
      `<path d="${p.d}" fill="none" stroke="${p.c}" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }
  const foodSVG = () => (isFlat() ? flatSVG() : cakeSVG());

  function sprinkleSVG(sp) {
    const w = sp.w || 7, h = sp.h || 2.8;
    return `<g transform="translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})"><g class="${sp.fresh ? 'sprinkle' : ''}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${sp.c}" transform="rotate(${sp.r})"/></g></g>`;
  }
  /* Most toppings are a fixed drawing; the sweets are a function of the
     colour that particular one came out of the bag as. */
  function topArt(tp) {
    const a = TOP_SVG[tp.id];
    return typeof a === 'function' ? a(tp) : a;
  }
  function toppingSVG(tp) {
    return `<g transform="translate(${tp.x.toFixed(1)} ${tp.y.toFixed(1)})"><g class="topping ${tp.fresh ? 'sprinkle' : ''}" data-id="${tp.id}">${topArt(tp)}</g></g>`;
  }

  /* The table the food sits on, in the close-up scenes. */
  function tableSVG() {
    const C = box();
    if (isFlat()) {
      return `${backdrop(320, 128)}
        <rect x="-60" y="${PIZZA.cy + 40}" width="520" height="${310 - PIZZA.cy}" fill="#efdcc0"/>
        <rect x="-60" y="${PIZZA.cy + 40}" width="520" height="8" fill="#d7b98f"/>
        <ellipse cx="${PIZZA.cx}" cy="${PIZZA.cy + 8}" rx="150" ry="150" fill="rgba(0,0,0,0.06)"/>
        <circle cx="${PIZZA.cx}" cy="${PIZZA.cy}" r="150" fill="${isMan() ? '#fdf3e4' : '#c9c9c9'}" stroke="${isMan() ? '#d9c3a2' : '#8f8f8f'}" stroke-width="4"/>
        <circle cx="${PIZZA.cx}" cy="${PIZZA.cy}" r="140" fill="none" stroke="${isMan() ? '#eee0c8' : '#fff'}" stroke-width="3" opacity="${isMan() ? '1' : '0.5'}"/>`;
    }
    return `${backdrop(320, 128)}
      <rect x="-60" y="${C.plateY - 2}" width="520" height="${352 - C.plateY}" fill="#efdcc0"/>
      <rect x="-60" y="${C.plateY - 2}" width="520" height="8" fill="#d7b98f"/>
      <ellipse cx="${C.cx}" cy="${C.plateY}" rx="${C.plateRx}" ry="28" fill="#fff" stroke="#cfd8e3" stroke-width="4"/>
      <ellipse cx="${C.cx}" cy="${C.plateY}" rx="${C.plateRx * 0.81}" ry="19" fill="none" stroke="#e3ebf3" stroke-width="3"/>`;
  }

  /* ================= DECORATE ================= */
  function renderDecorate() {
    stopLoop();
    endCarry();
    setStep('decorate');
    state.scene = 'decorate';
    const wrapT = isFlat() ? `translate(${PIZZA.cx} ${PIZZA.cy}) scale(${PIZZA.scale})` : '';
    stage.innerHTML = `
      <svg viewBox="0 0 400 320" id="svg">
        <defs>
          <linearGradient id="side" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
        </defs>
        ${tableSVG()}
        <g id="cakeWrap" transform="${wrapT}">${foodSVG()}</g>
      </svg>`;
    enterScene('enter-swap');
    if (isPizza()) say(state.icing ? 'Add cheese and toppings!' : 'Pick a sauce to spread on!');
    else if (recipe().piping) say(state.pipe ? 'Draw him a face!' : 'Pick an icing pen!');
    else say(state.icing ? 'Make it pretty!' : 'Pick a colour of icing!');
    renderDecorateShelf();
    bigButton('Done!', 'green corner', finishDecorate);

    const svg = $('svg');
    svg.addEventListener('click', (e) => {
      if (e.target.closest('.big-btn')) return;
      if (state.pipe && !state.tool) return;   // the pen draws, it does not plop
      const p = foodPoint(svg, e);
      foodTapped(p.x, p.y);
    });
    if (recipe().piping) pipeHandlers(svg);
  }

  /* ---------- squeezing icing on ----------
     A pen draws a line while you hold and drag, and a dot if you just tap.
     Points that stray off the gingerbread man are dropped, so the icing can
     never run onto the plate. */
  function pipeHandlers(svg) {
    let live = null, pts = 0, last = null;
    const start = (e) => {
      if (state.scene !== 'decorate' || !state.pipe || state.tool) return;
      if (e.target.closest('.big-btn')) return;
      const p = foodPoint(svg, e);
      if (!insideFood(p.x, p.y)) return;
      e.preventDefault();
      const col = recipe().paints.find((i) => i.id === state.pipe);
      const st = { c: col.color, w: 7, d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}` };
      state.pipes.push(st);
      live = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      live.setAttribute('fill', 'none');
      live.setAttribute('stroke', st.c);
      live.setAttribute('stroke-width', String(st.w));
      live.setAttribute('stroke-linecap', 'round');
      live.setAttribute('stroke-linejoin', 'round');
      live.setAttribute('d', st.d);
      $('icingG').appendChild(live);
      last = p; pts = 1;
      sfx.pour();
    };
    const move = (e) => {
      if (!live || state.scene !== 'decorate') return;
      const p = foodPoint(svg, e);
      if (Math.hypot(p.x - last.x, p.y - last.y) < 4) return;
      if (!insideFood(p.x, p.y)) return;
      const st = state.pipes[state.pipes.length - 1];
      st.d += ` L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      live.setAttribute('d', st.d);
      last = p; pts += 1;
    };
    const end = () => {
      if (!live) return;
      const st = state.pipes[state.pipes.length - 1];
      if (pts === 1) { st.d += ' l0.1 0'; live.setAttribute('d', st.d); }   // a single blob
      live = null;
      say(pick(['Lovely icing!', 'A big smile!', 'Squeeze, squeeze.', 'What a face.', 'Draw some more!']));
      renderDecorateShelf();
    };
    svg.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function pickPipe(id) {
    state.pipe = id;
    state.tool = null;
    sfx.tap();
    say(pick(['Draw him a smile!', 'Two eyes and a big smile!', 'Squeeze it on with your finger.']));
    renderDecorateShelf();
  }

  function wipeIcing() {
    if (!state.pipes.length) return;
    state.pipes = [];
    sfx.no();
    const g = $('icingG');
    if (g) g.innerHTML = '';
    say('All wiped off. Have another go!');
    renderDecorateShelf();
  }

  /* Turn a click into coordinates in the food's own drawing. */
  function foodPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (!isFlat()) return p;
    const s = state.scene === 'serve' ? SERVE.scale : PIZZA.scale;
    const cx = state.scene === 'serve' ? SERVE.cx : PIZZA.cx;
    const cy = state.scene === 'serve' ? SERVE.cy : PIZZA.cy;
    return { x: (p.x - cx) / s, y: (p.y - cy) / s };
  }

  function insideFood(x, y) {
    if (isMan()) return inMan(x, y, 4);
    if (isFlat()) return x * x + y * y <= (PIZZA.r + 4) * (PIZZA.r + 4);
    const C = box();
    if (x < C.cx - C.rx - 6 || x > C.cx + C.rx + 6) return false;
    const dx = (x - C.cx) / C.rx;
    const dy = (y - C.top) / C.ry;
    if (dx * dx + dy * dy <= 1.05) return true;
    return y >= C.top && y <= C.bottom + 10;
  }

  function foodTapped(x, y) {
    if (!insideFood(x, y)) return;
    if (!state.tool) {
      wobbleFood($('cakeG'));
      sfx.tap();
      say(pick(['Wobble wobble!', 'Pick something from the shelf!', 'Squishy!']));
      return;
    }
    if (state.toppings.length >= 40) { say('That is plenty of toppings!'); sfx.no(); return; }
    const C = box();
    const tp = { id: state.tool, x, y, fresh: true };
    if (SWEET_PICKS[tp.id]) tp.c = pick(SWEET_PICKS[tp.id]);
    if (tp.id === 'candle') tp.y = clamp(y, C.top - 20, C.top + C.ry);
    if (isFlat() && !isMan()) {
      // keep toppings on the food, not hanging off the crust
      const d = Math.hypot(x, y);
      if (d > PIZZA.r - 12) { tp.x = x * (PIZZA.r - 12) / d; tp.y = y * (PIZZA.r - 12) / d; }
    }
    state.toppings.push(tp);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = toppingSVG(tp);
    $('toppingsG').appendChild(g.firstChild);
    tp.fresh = false;
    sfx.plop();
    say(pick(['Lovely!', 'Ooh, nice!', 'Pop!', 'More more more!', 'So yummy!']));
  }

  function applyIcing(id) {
    state.icing = id;
    state.drips = makeDrips();
    state.icingT = 0;
    state.tool = null;
    sfx.pour();
    say(isPizza() ? pick(['Spread it all around...', 'Swirl it about...', 'Right to the edges...']) : pick(['Smooth it all over...', 'Drip, drip, drip...', 'Lovely and glossy.']));
    $('icingG').innerHTML = paintMarkup(0);
    let t = 0;
    loop((dt) => {
      t += dt;
      state.icingT = clamp(t / 0.7, 0, 1);
      const p = $('icingPath');
      const e = 1 - Math.pow(1 - state.icingT, 3);
      if (p) p.setAttribute('d', isFlat() ? saucePath(e) : icingPath(e));
      if (state.icingT >= 1) stopLoop();
    });
    renderDecorateShelf();
  }

  function shakeSprinkles() {
    const sh = recipe().shake;
    if (sh.mode === 'layer') { addCheese(); return; }
    if (state.sprinkles.length >= 260) { say('That is plenty of sprinkles.'); sfx.no(); return; }
    sfx.sprinkle();
    const C = box();
    const g = $('sprinklesG');
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      const flat = isFlat() ? flatSprinkleSpot() : null;
      if (isFlat() && !flat) continue;
      const sp = isFlat()
        ? { x: flat.x, y: flat.y, r: rand(0, 180), c: pick(sh.colors), w: 11, h: 3.2, fresh: true }
        : { x: C.cx + (C.rx - 8) * r * Math.cos(a), y: C.top + (C.ry - 4) * r * Math.sin(a), r: rand(0, 180), c: pick(sh.colors), fresh: true };
      state.sprinkles.push(sp);
      const w = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      w.innerHTML = sprinkleSVG(sp);
      g.appendChild(w.firstChild);
      sp.fresh = false;
    }
    say(pick(['Shake shake shake!', 'Sprinkles everywhere!', 'Rainbow!']));
  }

  /* Somewhere on a flat base for one sprinkle to land. A round base is easy;
     for the gingerbread man we throw darts at his bounding box until one
     sticks, so no sprinkle ends up floating beside him. */
  function flatSprinkleSpot() {
    if (!isMan()) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      return { x: (PIZZA.r - 18) * r * Math.cos(a), y: (PIZZA.r - 18) * r * Math.sin(a) };
    }
    for (let i = 0; i < 30; i++) {
      const x = rand(-84, 84), y = rand(-92, 94);
      if (inMan(x, y, -7)) return { x, y };
    }
    return null;
  }

  /* Cheese goes on in big melty layers that cover nearly the whole pizza. */
  function addCheese() {
    if (state.cheese >= 3) { say('That is plenty of cheese.'); sfx.no(); return; }
    if (!state.icing && state.cheese === 0) { say('Sauce first! Pick one from the shelf.'); sfx.no(); return; }
    if (!state.cheeseF.length) {
      for (let i = 0; i < 22; i++) state.cheeseF.push(rand(0.9, 1));
      for (let i = 0; i < 16; i++) state.cheeseSpots.push({ a: rand(0, Math.PI * 2), r: Math.sqrt(Math.random()) * 0.88, rx: rand(9, 20), ry: rand(6, 12), rot: rand(0, 180) });
    }
    state.cheese += 1;
    sfx.cheese();
    const g = $('cheeseG');
    if (g) {
      g.innerHTML = cheeseMarkup();
      animateClass(g.firstElementChild, 'sprinkle');
    }
    say(['A lovely blanket of cheese.', 'Extra cheese. Lovely.', 'So very much cheese.'][state.cheese - 1]);
    renderDecorateShelf();
  }

  function renderDecorateShelf() {
    shelf.innerHTML = '';
    const r = recipe();
    const paintBtns = r.paints.map((ic) => {
      const b = itemButton({
        id: ic.id, name: ic.name,
        icon: r.piping ? ICON.pen(ic.color) : ICON.swatch(ic.color),
        cls: 'small swatch',
      });
      if ((r.piping ? state.pipe : state.icing) === ic.id) b.classList.add('selected');
      b.addEventListener('click', () => (r.piping ? pickPipe(ic.id) : applyIcing(ic.id)));
      return b;
    });
    if (r.piping && state.pipes.length) {
      const w = itemButton({ id: 'wipe', name: 'Wipe off', icon: ICON.wipe, cls: 'small' });
      w.addEventListener('click', wipeIcing);
      paintBtns.push(w);
    }
    shelf.appendChild(group(r.piping ? `${r.paintTitle} (draw on the ${r.thing})` : r.paintTitle, paintBtns));

    const spr = itemButton({ id: 'shake', name: r.shake.name, icon: r.shake.icon, cls: 'small' });
    if (r.shake.mode === 'layer' && state.cheese >= 3) spr.classList.add('used');
    spr.addEventListener('click', shakeSprinkles);
    const topBtns = r.toppings.map((tp) => {
      const b = itemButton({ id: tp.id, name: tp.name, icon: svgWrap(`<g transform="translate(24 ${tp.id === 'candle' ? 40 : 26}) scale(1.1)">${topArt({ id: tp.id, c: SWEET_SAMPLE[tp.id] })}</g>`), cls: 'small' });
      if (state.tool === tp.id) b.classList.add('selected');
      b.addEventListener('click', () => {
        state.tool = state.tool === tp.id ? null : tp.id;
        if (state.tool) state.pipe = null;
        sfx.tap();
        say(state.tool ? `Now tap the ${r.thing} to put a ${tp.name.toLowerCase()} on!` : 'Pick something from the shelf!');
        renderDecorateShelf();
      });
      return b;
    });
    shelf.appendChild(group(`Toppings (tap one, then tap the ${r.thing})`, [spr, ...topBtns]));
  }

  function finishDecorate() {
    stopLoop();
    state.tool = null;
    state.pipe = null;
    stage.querySelectorAll('.big-btn').forEach((b) => b.remove());
    sfx.tap();
    say(recipe().decorateAfter ? 'Beautiful!' : 'Looks lovely! Now into the oven...');
    goNext('decorate');
  }

  /* ================= EATING IT (still at the bench) ================= */
  const BITES = 6;
  const SERVE = { cx: 218, cy: 150, scale: 1.05, boardR: 128 };

  /* A little word that pops out of the food where you just took a bite. */
  function nom(text, x, y) {
    const host = $('noms');
    if (!host) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `rotate(${rand(-12, 12).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', 'nom');
    t.setAttribute('x', x.toFixed(1));
    t.setAttribute('y', y.toFixed(1));
    t.setAttribute('text-anchor', 'middle');
    t.textContent = text;
    g.appendChild(t);
    host.appendChild(g);
    setTimeout(() => g.remove(), 1100);
  }

  function describeFood() {
    const r = recipe();
    const paint = state.icing ? r.paints.find((i) => i.id === state.icing).name.toLowerCase() + ' ' + r.paintWord : 'no ' + r.paintWord;
    const n = {};
    state.toppings.forEach((t) => { n[t.id] = (n[t.id] || 0) + 1; });
    const extras = [];
    if (r.shake.mode === 'layer' && state.cheese) extras.push(['a little cheese', 'lots of cheese', 'extra extra cheese'][state.cheese - 1]);
    if (state.sprinkles.length) extras.push(r.shake.word);
    Object.keys(n).forEach((id) => {
      const tp = r.toppings.find((t) => t.id === id);
      extras.push(n[id] === 1 ? `1 ${tp.name.toLowerCase()}` : `${n[id]} ${tp.plural}`);
    });
    const flav = r.flavours && state.flavour ? FLAVOURS[state.flavour].name.toLowerCase() + ' ' : '';
    return `A ${flav}${r.thing} with ${paint}` + (extras.length ? ', ' + listWords(extras) : '') + '!';
  }

  function renderServe() {
    stopLoop();
    endCarry();
    state.scene = 'serve';
    setStep('serve');
    const wrapT = isFlat() ? `translate(${SERVE.cx} ${SERVE.cy}) scale(${SERVE.scale})` : '';
    /* a darker board than the old one, so a golden pizza or tart reads
       against it instead of blending into it */
    const table = isFlat()
      ? `${backdrop(320, 128)}
         <rect x="-60" y="212" width="520" height="140" fill="#efdcc0"/>
         <rect x="-60" y="212" width="520" height="8" fill="#d7b98f"/>
         <circle cx="${SERVE.cx}" cy="${SERVE.cy + 7}" r="${SERVE.boardR}" fill="rgba(74,48,30,0.16)"/>
         <circle cx="${SERVE.cx}" cy="${SERVE.cy}" r="${SERVE.boardR}" fill="${isMan() ? '#fdf3e4' : '#b98252'}" stroke="${isMan() ? '#d9c3a2' : '#8d5f33'}" stroke-width="5"/>
         <circle cx="${SERVE.cx}" cy="${SERVE.cy}" r="${SERVE.boardR - 11}" fill="none" stroke="${isMan() ? '#eee0c8' : '#cf9c68'}" stroke-width="3"/>`
      : tableSVG();
    stage.innerHTML = `
      <svg viewBox="0 0 400 320" id="svg">
        <defs>
          <linearGradient id="side" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
          <mask id="biteMask" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000">
            <rect x="-2000" y="-2000" width="4000" height="4000" fill="#fff"/>
            <g id="bites"></g>
          </mask>
        </defs>
        ${table}
        <g id="cakeWrap" transform="${wrapT}"><g mask="url(#biteMask)">${foodSVG()}</g></g>
        <g id="crumbs"></g>
        <g id="noms"></g>
      </svg>`;
    enterScene('enter-swap');
    if (state.blown) {
      stage.querySelectorAll('.topping .flame').forEach((f) => { f.style.display = 'none'; });
      stage.querySelectorAll('.topping .smoke').forEach((s) => { s.style.display = ''; });
    }
    renderServeShelf();
    say(hasCandles() && !state.blown ? 'Blow out the candles!' : 'Looks yummy! Tap Eat when you are ready.');

    const svg = $('svg');
    svg.addEventListener('click', (e) => {
      if (e.target.closest('.big-btn')) return;
      const p = foodPoint(svg, e);
      if (!insideFood(p.x, p.y)) return;
      if (!state.eating) {
        wobbleFood($('cakeG'));
        sfx.tap();
        say(hasCandles() && !state.blown ? 'Blow out the candles first! Tap Blow.' : pick(['Wobble wobble!', 'Tap Eat to munch it!', 'Looks so yummy!']));
        return;
      }
      bite();
    });
  }

  function renderServeShelf() {
    shelf.innerHTML = '';
    if (state.gone) { note('All gone!'); return; }
    if (!state.eating) {
      note(describeFood());
      if (hasCandles() && !state.blown) goButton('Blow!', '', blowCandles);
      else goButton('Eat!', 'green', startEating);
      return;
    }
    note(`Tap the ${recipe().thing} to munch it up!`);
  }

  function confetti() {
    /* the stage grows with the window, so the fall has to as well */
    const fall = (stage.clientHeight || 400) + 30;
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.setProperty('--fall', fall + 'px');
      c.style.left = rand(0, 100) + '%';
      c.style.background = pick(SPRINKLE_COLORS);
      c.style.animationDuration = rand(1.6, 3) + 's';
      c.style.animationDelay = rand(0, 0.8) + 's';
      stage.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  function blowCandles() {
    if (state.blown) return;
    state.blown = true;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    sfx.blow();
    stage.querySelectorAll('.topping .flame').forEach((f) => { f.style.display = 'none'; });
    stage.querySelectorAll('.topping .smoke').forEach((s) => { s.style.display = ''; });
    say('Make a wish...');
    setTimeout(() => { sfx.yay(); confetti(); }, 500);
    setTimeout(() => { if (state.scene === 'serve' && !state.eating) { renderServeShelf(); say('Now tap Eat!'); } }, 1200);
  }

  function startEating() {
    if (state.scene !== 'serve' || state.eating) return;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    state.eating = true;
    renderServeShelf();
    say(`Tap the ${recipe().thing} to take a bite.`);
    setTimeout(bite, 400);
  }

  /* Head first, then an arm, then a leg - the proper way to eat one. */
  const MAN_BITES = [[0, -64, 34], [-64, -6, 32], [64, -6, 32], [-28, 66, 32], [28, 66, 32], [0, -10, 44]];

  /* Take a bite out of the finished food (in the food's own coordinates). */
  function bite() {
    if (state.scene !== 'serve' || !state.eating || state.gone) return;
    const i = state.bites++;
    let cx, cy, r;
    if (isMan()) {
      const spot = MAN_BITES[i % MAN_BITES.length];
      cx = spot[0]; cy = spot[1]; r = spot[2];
    } else if (isFlat()) {
      const a = (i * 60 - 90) * Math.PI / 180;
      cx = 62 * Math.cos(a); cy = 62 * Math.sin(a); r = 58;
    } else {
      const C = box();
      cx = C.cx + C.rx * 0.95 - i * (C.rx * 1.9 / (BITES - 1));
      cy = (C.top + C.bottom) / 2;
      r = C.rx * 0.46;
    }
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx.toFixed(1));
    c.setAttribute('cy', cy.toFixed(1));
    c.setAttribute('r', r.toFixed(1));
    c.setAttribute('fill', '#000');
    $('bites').appendChild(c);
    // toppings inside the bite get eaten too
    const before = state.toppings.length;
    state.toppings = state.toppings.filter((t) => Math.hypot(t.x - cx, t.y - cy) > r + 6);
    if (state.toppings.length !== before) $('toppingsG').innerHTML = state.toppings.map(toppingSVG).join('');
    sfx.munch();
    wobbleFood($('cakeG'));
    const nx = isFlat() ? SERVE.cx + cx * SERVE.scale : cx;
    const ny = isFlat() ? SERVE.cy + cy * SERVE.scale : cy;
    nom(pick(['Mmm!', 'Lovely.', 'Delicious!', 'So good.', 'Crunch.']), nx, ny - r * 0.5);
    say(pick(['Munch, munch.', 'Mmm.', 'Lovely.', 'A big bite.', 'Delicious.']));
    if (state.bites >= BITES) setTimeout(allGone, 350);
  }

  function allGone() {
    if (state.gone) return;
    state.gone = true;
    const w = $('cakeWrap');
    if (w) w.style.display = 'none';
    const C = box();
    const cx = isFlat() ? SERVE.cx : C.cx;
    const cy = isFlat() ? SERVE.cy : C.plateY;
    const spread = isFlat() ? 70 : C.plateRx * 0.5;
    const col = isFlat() ? mixHex(flatColors().done, '#000000', 0.15) : mixHex(bakeTone().crumb, '#000000', 0.2);
    let crumbs = '';
    for (let i = 0; i < 16; i++) {
      crumbs += `<circle cx="${(cx + rand(-spread, spread)).toFixed(1)}" cy="${(cy + rand(-8, 9)).toFixed(1)}" r="${rand(1.4, 3).toFixed(1)}" fill="${col}"/>`;
    }
    $('crumbs').innerHTML = crumbs;
    counts[recipe().id] += 1;
    try { localStorage.setItem('mlk-count-' + recipe().id, String(counts[recipe().id])); } catch (e) { /* ignore */ }
    showCount();
    bounce(countEl);
    sfx.yay();
    confetti();
    say(`All gone! That was a yummy ${recipe().thing}.`);
    nom(pick(['All gone.', 'The best one yet.', 'Not a crumb left.']), cx, cy - 34);
    renderServeShelf();
    setTimeout(() => { if (state.gone) goButton('Make another!', 'green', () => zoomOutTo(startOver)); }, 900);
  }

  function startOver() {
    stopLoop();
    endCarry();
    state = freshState();
    renderKitchen();
  }

  resetBtn.addEventListener('click', () => {
    sfx.tap();
    startOver();
    say('All tidied up. What shall we make?');
  });

  /* ---------------- go ---------------- */
  state = freshState();
  showCount();
  renderKitchen();

  /* small hook for smoke tests */
  window.__kitchen = { RECIPES, INGREDIENTS, ICON, WHERE, counts, get state() { return state; }, renderKitchen };
})();
