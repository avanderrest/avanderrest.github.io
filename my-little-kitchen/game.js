/* My Little Kitchen — a toy-kitchen cake game.
   No timers you can fail, no scores. Tap things, make a cake, eat it. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const shelf = $('shelf');
  const helper = $('helper');
  const stepsEl = $('steps');
  const countEl = $('cake-count');
  const muteBtn = $('mute');

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (c) => c.match(/\w\w/g).map((h) => parseInt(h, 16));
  const mixHex = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
  };

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
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur + 0.05);
    } catch (e) { /* no audio, no problem */ }
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

  /* ---------------- cake count ---------------- */
  let cakes = 0;
  try { cakes = parseInt(localStorage.getItem('mlk-cakes') || '0', 10) || 0; } catch (e) { /* ignore */ }
  function showCount() { countEl.textContent = '🎂 ' + cakes; }
  showCount();

  /* ---------------- data ---------------- */
  const INGREDIENTS = [
    { id: 'flour', name: 'Flour' },
    { id: 'sugar', name: 'Sugar' },
    { id: 'eggs', name: 'Eggs' },
    { id: 'butter', name: 'Butter' },
    { id: 'milk', name: 'Milk' },
  ];
  const FLAVOURS = {
    chocolate: { name: 'Chocolate', batter: '#8a5a3b', crumb: '#7a4a30', crust: '#5b3320', jam: '#f9c8d6' },
    strawberry: { name: 'Strawberry', batter: '#f7a9c0', crumb: '#f4bccb', crust: '#e39cb2', jam: '#ff6b8f' },
    vanilla: { name: 'Vanilla', batter: '#f6e7b4', crumb: '#f5dfa4', crust: '#dfae62', jam: '#ff8fae' },
    lemon: { name: 'Lemon', batter: '#f7e96b', crumb: '#f6e784', crust: '#dcb64f', jam: '#fff3b0' },
  };
  const ICINGS = [
    { id: 'pink', name: 'Pink', color: '#ff9fb8' },
    { id: 'white', name: 'Vanilla', color: '#fff8f0' },
    { id: 'choc', name: 'Choccy', color: '#6b4029' },
    { id: 'mint', name: 'Mint', color: '#9fe3c9' },
    { id: 'blue', name: 'Berry', color: '#a9c6ff' },
    { id: 'yellow', name: 'Lemon', color: '#ffe08a' },
  ];
  const TOPPINGS = [
    { id: 'strawberry', name: 'Strawberry' },
    { id: 'cherry', name: 'Cherry' },
    { id: 'candle', name: 'Candle' },
    { id: 'chip', name: 'Choc chip' },
    { id: 'star', name: 'Star' },
    { id: 'mallow', name: 'Mallow' },
  ];
  const SPRINKLE_COLORS = ['#ff6b8f', '#ffd166', '#6ec6ff', '#7ee8a2', '#c58cff', '#ff9f6b', '#ffffff'];

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
    sprinkles: svgWrap(`
      <rect x="12" y="14" width="24" height="28" rx="6" fill="#fff" stroke="#cfd8e3" stroke-width="2"/>
      <rect x="10" y="7" width="28" height="9" rx="3" fill="#ff9fb8" stroke="#f26d92" stroke-width="2"/>
      <g stroke-width="3" stroke-linecap="round"><path d="M17 24l4 2" stroke="#ff6b8f"/><path d="M27 22l4 1" stroke="#6ec6ff"/><path d="M18 32l4-2" stroke="#ffd166"/><path d="M27 30l4 3" stroke="#7ee8a2"/><path d="M21 37l4 1" stroke="#c58cff"/></g>`),
    wipe: svgWrap(`
      <rect x="10" y="20" width="28" height="18" rx="5" fill="#a9d8ff" stroke="#7fb8ee" stroke-width="2"/>
      <path d="M12 20c3-6 21-6 24 0" fill="none" stroke="#7fb8ee" stroke-width="2"/>
      <g fill="#fff"><circle cx="16" cy="16" r="2.5"/><circle cx="24" cy="12" r="3"/><circle cx="32" cy="16" r="2.5"/></g>`),
    swatch: (c) => svgWrap(`
      <path d="M24 6c8 0 16 7 16 16 0 6-4 8-4 12s-3 8-12 8-12-4-12-8-4-6-4-12c0-9 8-16 16-16z" fill="${c}" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>
      <ellipse cx="18" cy="16" rx="4" ry="2.5" fill="#fff" opacity="0.6"/>`),
  };

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
  };

  /* ---------------- state ---------------- */
  let state;
  let loopId = 0;
  let tickFn = null;

  function freshState() {
    return {
      step: 'mix',
      added: [],
      flavour: null,
      mix: 0,
      stirring: false,
      spoonAngle: 0,
      poured: false,
      inOven: false,
      bake: 0,
      baked: false,
      out: false,
      icing: null,
      icingT: 0,
      drips: [],
      sprinkles: [],
      toppings: [],
      tool: null,
      blown: false,
    };
  }

  function say(text) {
    helper.textContent = text;
    helper.classList.remove('pop');
    void helper.offsetWidth;
    helper.classList.add('pop');
  }

  function setStep(step) {
    state.step = step;
    stage.classList.remove('grab');
    const order = ['mix', 'oven', 'decorate', 'serve'];
    const idx = order.indexOf(step);
    [...stepsEl.children].forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('done', i < idx);
    });
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
  function bigButton(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'big-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    stage.appendChild(b);
    return b;
  }

  /* Fly an icon from a shelf button to an SVG point on the stage. */
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
    chocolate: () => `<path d="M160 148q40-28 84 0q-42 12-84 0z" fill="#8a5a3b"/>`,
    strawberry: () => `<g fill="#ff5c7a"><circle cx="180" cy="140" r="6"/><circle cx="210" cy="150" r="7"/><circle cx="235" cy="135" r="6"/><circle cx="195" cy="128" r="5"/></g>`,
    vanilla: () => `<g fill="#5b3320"><circle cx="180" cy="140" r="1.6"/><circle cx="210" cy="150" r="1.6"/><circle cx="235" cy="135" r="1.6"/><circle cx="195" cy="128" r="1.6"/><circle cx="225" cy="145" r="1.6"/></g>`,
    lemon: () => `<g fill="#ffe45c" stroke="#dcb64f"><ellipse cx="190" cy="140" rx="10" ry="6"/><ellipse cx="222" cy="148" rx="10" ry="6"/></g>`,
  };

  function renderMix() {
    setStep('mix');
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <rect x="0" y="238" width="400" height="62" fill="#ffe9c9"/>
        <rect x="0" y="238" width="400" height="8" fill="#ffd9a8"/>
        <ellipse cx="200" cy="262" rx="150" ry="12" fill="rgba(0,0,0,0.07)"/>
        <g id="bowlMove"><g id="bowl">
          <path d="M60 140C60 225 120 262 200 262S340 225 340 140z" fill="#a9d8ff" stroke="#7fb8ee" stroke-width="5" stroke-linejoin="round"/>
          <path d="M80 175c10 40 50 60 120 62" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
          <ellipse cx="200" cy="140" rx="140" ry="40" fill="#c5e5ff" stroke="#7fb8ee" stroke-width="5"/>
          <ellipse cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#5aa0dc"/>
          <ellipse id="batter" cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#f6e7b4" opacity="0"/>
          <g id="blobs"></g>
          <ellipse id="glossy" cx="${BOWL.cx}" cy="${BOWL.cy}" rx="${BOWL.rx}" ry="${BOWL.ry}" fill="#fff" opacity="0"/>
          <g id="spoon" style="display:none">
            <path d="M270 140l60-95" stroke="#d9a86c" stroke-width="12" stroke-linecap="round"/>
            <path d="M270 140l60-95" stroke="#b3803f" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.001"/>
            <ellipse cx="262" cy="150" rx="16" ry="22" transform="rotate(30 262 150)" fill="#e8bd83" stroke="#b3803f" stroke-width="3"/>
          </g>
        </g></g>
        <g id="tin" style="display:none">
          <rect x="262" y="228" width="120" height="34" rx="6" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="3"/>
          <rect id="tinFill" x="266" y="258" width="112" height="0" rx="4" fill="#f6e7b4"/>
          <path id="stream" d="" fill="#f6e7b4" opacity="0"/>
        </g>
      </svg>`;

    const blobsEl = $('blobs');
    state.added.forEach((id) => { blobsEl.innerHTML += `<g class="blob">${BLOBS[id]()}</g>`; });

    renderMixShelf();
    updateMixVisuals();

    const svg = $('svg');
    const startStir = (e) => {
      if (!state.flavour || state.mix >= 100) return;
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
      } else if (state.flavour && state.mix < 100) {
        state.spoonAngle += 30 * dt;
        updateMixVisuals();
      }
    });
  }

  function batterColor() {
    const f = state.flavour ? FLAVOURS[state.flavour] : FLAVOURS.vanilla;
    return f.batter;
  }

  function updateMixVisuals() {
    const t = state.mix / 100;
    const batter = $('batter');
    const blobs = $('blobs');
    const spoon = $('spoon');
    if (!batter) return;
    stage.classList.toggle('grab', !!state.flavour && state.mix < 100);
    batter.setAttribute('fill', mixHex('#f6e7b4', batterColor(), t));
    batter.setAttribute('opacity', (state.added.length ? 0.35 + 0.65 * t : 0).toFixed(2));
    blobs.setAttribute('opacity', (1 - t).toFixed(2));
    $('glossy').setAttribute('opacity', (t * 0.15).toFixed(2));
    if (state.flavour && state.mix < 100) {
      spoon.style.display = '';
      spoon.setAttribute('transform', `rotate(${state.spoonAngle % 360} ${BOWL.cx} ${BOWL.cy})`);
    } else {
      spoon.style.display = 'none';
    }
  }

  function renderMixShelf() {
    shelf.innerHTML = '';
    const baseDone = INGREDIENTS.every((i) => state.added.includes(i.id));
    if (!baseDone) {
      say(state.added.length ? 'Keep going! Tap the next one.' : 'Tap the things to put them in the bowl!');
      const btns = INGREDIENTS.map((ing) => {
        const b = itemButton({ id: ing.id, name: ing.name, icon: ICON[ing.id] });
        if (state.added.includes(ing.id)) b.classList.add('used');
        b.addEventListener('click', () => addIngredient(ing.id, b));
        return b;
      });
      shelf.appendChild(group('Into the bowl', btns));
    } else if (!state.flavour) {
      say('Ooh, what flavour?');
      const btns = Object.keys(FLAVOURS).map((id) => {
        const b = itemButton({ id, name: FLAVOURS[id].name, icon: ICON[id] });
        b.addEventListener('click', () => addIngredient(id, b));
        return b;
      });
      shelf.appendChild(group('Pick a flavour', btns));
    } else if (state.mix < 100) {
      say('Hold the spoon and stir, stir, stir!');
      const b = itemButton({ id: 'spoon', name: 'Stir!', icon: ICON.spoon, cls: 'wide hold pulse' });
      const start = (e) => { e.preventDefault(); b.classList.remove('pulse'); state.stirring = true; state.mix = Math.min(100, state.mix + 5); sfx.stir(); };
      b.addEventListener('pointerdown', start);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      shelf.appendChild(group('', [b]));
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = 'Or rub the bowl with your finger';
      shelf.appendChild(note);
    } else {
      shelf.innerHTML = '<div class="note">Smooth and yummy! Ready to pour.</div>';
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
      g.innerHTML = BLOBS[id]();
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
    say('Smooth batter! Pour it in the tin.');
    renderMixShelf();
    goButton('Pour it in!', '', pourBatter);
  }

  function pourBatter() {
    if (state.poured) return;
    state.poured = true;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    say('Glug glug glug...');
    sfx.pour();
    const tin = $('tin');
    const tinFill = $('tinFill');
    const stream = $('stream');
    const bowl = $('bowlMove');
    const color = batterColor();
    tin.style.display = '';
    tinFill.setAttribute('fill', color);
    stream.setAttribute('fill', color);
    let t = 0;
    loop((dt) => {
      t += dt;
      const a = clamp(t / 0.8, 0, 1);
      const ease = 1 - Math.pow(1 - a, 3);
      // Tip the bowl clockwise around its right lip (shrinking it a little so it stays in view).
      const s = lerp(1, 0.7, ease);
      bowl.setAttribute('transform', `translate(${-60 * ease} ${40 * ease}) rotate(${60 * ease} 340 140) translate(340 140) scale(${s.toFixed(3)}) translate(-340 -140)`);
      const p = clamp((t - 0.6) / 1.1, 0, 1);
      if (p > 0) {
        stream.setAttribute('opacity', p < 1 ? '1' : String(1 - clamp((t - 1.7) / 0.3, 0, 1)));
        const top = 172, bottom = 238;
        const y2 = lerp(top, bottom, Math.min(1, p * 2.5));
        stream.setAttribute('d', `M272 ${top} C272 ${top + 24} 296 ${top + 30} 298 ${y2} h16 C314 ${top + 30} 292 ${top + 24} 290 ${top} z`);
        const h = 26 * clamp((p - 0.3) / 0.7, 0, 1);
        tinFill.setAttribute('y', (258 - h).toFixed(1));
        tinFill.setAttribute('height', h.toFixed(1));
      }
      if (t > 2.2) { stopLoop(); renderOven(); }
    });
  }

  /* ================= OVEN ================= */
  const BAKE_SECONDS = 7;

  function cakeBakedColor(t) {
    const f = FLAVOURS[state.flavour];
    return mixHex(f.batter, f.crust, t);
  }

  function renderOven() {
    setStep('oven');
    state.inOven = false;
    stage.innerHTML = `
      <svg viewBox="0 0 400 300" id="svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="70%" r="70%">
            <stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#7a4b2a"/>
          </radialGradient>
        </defs>
        <rect x="0" y="238" width="400" height="62" fill="#ffe9c9"/>
        <rect x="0" y="238" width="400" height="8" fill="#ffd9a8"/>
        <g id="oven">
          <rect x="70" y="26" width="260" height="222" rx="18" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="5"/>
          <rect x="70" y="26" width="260" height="52" rx="18" fill="#ffc0cf"/>
          <rect x="70" y="60" width="260" height="18" fill="#ffc0cf"/>
          <g fill="#fff" stroke="#f2a0b5" stroke-width="3"><circle cx="108" cy="52" r="10"/><circle cx="138" cy="52" r="10"/><circle cx="262" cy="52" r="10"/><circle cx="292" cy="52" r="10"/></g>
          <circle cx="200" cy="52" r="19" fill="#fff" stroke="#f2a0b5" stroke-width="3"/>
          <line id="hand" x1="200" y1="52" x2="200" y2="38" stroke="#f26d92" stroke-width="4" stroke-linecap="round"/>
          <circle cx="200" cy="52" r="3" fill="#f26d92"/>
          <rect x="92" y="92" width="216" height="140" rx="14" fill="#f7b3c4" stroke="#f2a0b5" stroke-width="4"/>
          <rect id="window" x="112" y="108" width="176" height="104" rx="10" fill="#4a3535"/>
          <g id="inside">
            <rect id="light" x="112" y="108" width="176" height="104" rx="10" fill="url(#glow)" opacity="0"/>
            <line x1="120" y1="196" x2="280" y2="196" stroke="#8a6e6e" stroke-width="3"/>
            <line x1="120" y1="203" x2="280" y2="203" stroke="#8a6e6e" stroke-width="3"/>
          </g>
          <rect x="112" y="108" width="176" height="104" rx="10" fill="none" stroke="#fff" stroke-width="4" opacity="0.6"/>
          <rect x="130" y="218" width="140" height="8" rx="4" fill="#fff" stroke="#f2a0b5" stroke-width="2"/>
        </g>
        <g id="cakeTin">
          <rect id="tinCakeMask" x="0" y="0" width="0" height="0"/>
          <path id="cake" d="" fill="${batterColor()}"/>
          <rect x="-60" y="-28" width="120" height="34" rx="6" fill="#c9c9c9" stroke="#8f8f8f" stroke-width="3"/>
          <rect x="-56" y="-24" width="112" height="6" rx="3" fill="#fff" opacity="0.5"/>
        </g>
      </svg>`;
    shelf.innerHTML = '';
    say('Pop it in the oven!');
    const b = itemButton({ id: 'oven', name: 'In it goes!', icon: svgWrap('<rect x="8" y="10" width="32" height="30" rx="5" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="2"/><rect x="13" y="18" width="22" height="14" rx="3" fill="#4a3535"/><circle cx="16" cy="14" r="2" fill="#f26d92"/><circle cx="32" cy="14" r="2" fill="#f26d92"/>'), cls: 'wide pulse' });
    b.addEventListener('click', putInOven);
    shelf.appendChild(group('', [b]));

    positionTin(200, 262, 1, 24);
    $('svg').addEventListener('click', ovenTapped);
    $('oven').addEventListener('click', putInOvenIfWaiting);
  }

  function putInOvenIfWaiting() { if (!state.inOven) putInOven(); }

  function positionTin(x, y, s, cakeH) {
    const g = $('cakeTin');
    g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    const h = cakeH;
    const dome = Math.min(30, h * 0.45);
    $('cake').setAttribute('d', `M-56 -24 v${-(h - dome)} q0 ${-dome} 56 ${-dome} q56 0 56 ${dome} v${h - dome} z`);
  }

  function putInOven() {
    if (state.inOven) return;
    state.inOven = true;
    shelf.innerHTML = '<div class="note">Bake, bake, bake...</div>';
    say('Bake, bake, bake... watch it rise!');
    sfx.tap();
    let t = 0;
    let dinged = false;
    const light = $('light');
    const hand = $('hand');
    const winEl = $('window');
    loop((dt) => {
      t += dt;
      // slide in (0 - 0.6s)
      const a = clamp(t / 0.6, 0, 1);
      const ease = 1 - Math.pow(1 - a, 3);
      const x = 200, y = lerp(262, 200, ease), s = lerp(1, 0.86, ease);
      const bakeT = clamp((t - 0.6) / BAKE_SECONDS, 0, 1);
      state.bake = bakeT;
      const h = lerp(24, 70, 1 - Math.pow(1 - bakeT, 2));
      positionTin(x, y, s, h);
      $('cake').setAttribute('fill', cakeBakedColor(bakeT));
      light.setAttribute('opacity', (ease * 0.9).toFixed(2));
      winEl.setAttribute('fill', mixHex('#4a3535', '#8a5a3a', ease));
      hand.setAttribute('transform', `rotate(${bakeT * 360} 200 52)`);
      if (bakeT >= 1 && !dinged) {
        dinged = true;
        state.baked = true;
        stopLoop();
        sfx.ding();
        wobble($('oven'));
        const d = document.createElement('div');
        d.className = 'ding';
        d.textContent = 'DING!';
        stage.appendChild(d);
        say('DING! Tap the oven to take it out!');
        shelf.innerHTML = '';
        const b = itemButton({ id: 'open', name: 'Open!', icon: svgWrap('<rect x="8" y="10" width="32" height="30" rx="5" fill="#ffd3dc" stroke="#f2a0b5" stroke-width="2"/><rect x="13" y="18" width="22" height="14" rx="3" fill="#ffb347"/><circle cx="16" cy="14" r="2" fill="#f26d92"/><circle cx="32" cy="14" r="2" fill="#f26d92"/>'), cls: 'wide pulse' });
        b.addEventListener('click', takeOut);
        shelf.appendChild(group('', [b]));
      }
    });
  }

  function ovenTapped() {
    if (!state.inOven) return;
    if (state.out) return;
    if (!state.baked) { wobble($('oven')); sfx.no(); say(pick(['Not yet! Still baking...', 'Patience... nearly there!', 'Ooh, it smells good already.'])); return; }
    takeOut();
  }

  function takeOut() {
    if (state.out) return;
    state.out = true;
    stage.querySelectorAll('.ding').forEach((d) => d.remove());
    shelf.innerHTML = '<div class="note">Ooh, look at it!</div>';
    say('Ta-da! A lovely warm cake.');
    sfx.plop();
    $('light').setAttribute('opacity', '0');
    $('window').setAttribute('fill', '#4a3535');
    let t = 0;
    loop((dt) => {
      t += dt;
      const a = clamp(t / 0.7, 0, 1);
      const ease = 1 - Math.pow(1 - a, 3);
      positionTin(200, lerp(200, 262, ease), lerp(0.86, 1.15, ease), 70);
      if (a >= 1) {
        stopLoop();
        goButton('Decorate it!', 'green', renderDecorate);
      }
    });
  }

  /* ================= DECORATE ================= */
  const CAKE = { cx: 200, top: 130, bottom: 250, rx: 100, ry: 24 };

  function edgeY(x) {
    const dx = (x - CAKE.cx) / CAKE.rx;
    return CAKE.top + CAKE.ry * Math.sqrt(Math.max(0, 1 - dx * dx));
  }

  function makeDrips() {
    const drips = [];
    for (let x = 116; x <= 284; x += 24) drips.push({ x: x + rand(-4, 4), len: rand(14, 44), w: rand(9, 12) });
    return drips;
  }

  function icingPath(t) {
    if (!state.drips.length) return '';
    let d = `M${CAKE.cx - CAKE.rx} ${CAKE.top}`;
    state.drips.forEach((dr) => {
      const xa = dr.x - dr.w, xb = dr.x + dr.w;
      const ea = edgeY(xa), eb = edgeY(xb);
      const bottom = edgeY(dr.x) + dr.len * t;
      const ctrl = (8 * bottom - 2 * ((ea + eb) / 2)) / 6;
      d += ` L${xa.toFixed(1)} ${ea.toFixed(1)} C${xa.toFixed(1)} ${ctrl.toFixed(1)} ${xb.toFixed(1)} ${ctrl.toFixed(1)} ${xb.toFixed(1)} ${eb.toFixed(1)}`;
    });
    d += ` L${CAKE.cx + CAKE.rx} ${CAKE.top} A${CAKE.rx} ${CAKE.ry} 0 0 0 ${CAKE.cx - CAKE.rx} ${CAKE.top} Z`;
    return d;
  }

  function cakeSVG() {
    const f = FLAVOURS[state.flavour];
    const icing = state.icing ? ICINGS.find((i) => i.id === state.icing).color : null;
    const dark = mixHex(f.crumb, '#000000', 0.18);
    let s = `<g id="cakeG">
      <ellipse cx="${CAKE.cx}" cy="${CAKE.bottom}" rx="${CAKE.rx}" ry="${CAKE.ry}" fill="${dark}"/>
      <rect x="${CAKE.cx - CAKE.rx}" y="${CAKE.top}" width="${CAKE.rx * 2}" height="${CAKE.bottom - CAKE.top}" fill="${f.crumb}"/>
      <rect x="${CAKE.cx - CAKE.rx}" y="${CAKE.top}" width="${CAKE.rx * 2}" height="${CAKE.bottom - CAKE.top}" fill="url(#side)"/>
      <path d="M${CAKE.cx - CAKE.rx} 186 A${CAKE.rx} ${CAKE.ry} 0 0 0 ${CAKE.cx + CAKE.rx} 186 v9 A${CAKE.rx} ${CAKE.ry} 0 0 1 ${CAKE.cx - CAKE.rx} 195 z" fill="${f.jam}"/>
      <ellipse cx="${CAKE.cx}" cy="${CAKE.top}" rx="${CAKE.rx}" ry="${CAKE.ry}" fill="${f.crust}"/>
      <g id="icingG">${icing ? `<path id="icingPath" d="${icingPath(state.icingT)}" fill="${icing}" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>` : ''}</g>
      <g id="sprinklesG">${state.sprinkles.map(sprinkleSVG).join('')}</g>
      <g id="toppingsG">${state.toppings.map(toppingSVG).join('')}</g>
    </g>`;
    return s;
  }
  function sprinkleSVG(sp) {
    return `<g transform="translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})"><g class="${sp.fresh ? 'sprinkle' : ''}"><rect x="-3.5" y="-1.4" width="7" height="2.8" rx="1.4" fill="${sp.c}" transform="rotate(${sp.r})"/></g></g>`;
  }
  function toppingSVG(tp) {
    return `<g transform="translate(${tp.x.toFixed(1)} ${tp.y.toFixed(1)})"><g class="topping ${tp.fresh ? 'sprinkle' : ''}" data-id="${tp.id}">${TOP_SVG[tp.id]}</g></g>`;
  }

  function renderDecorate() {
    setStep('decorate');
    stage.innerHTML = `
      <svg viewBox="0 0 400 320" id="svg">
        <defs>
          <linearGradient id="side" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
        </defs>
        <rect x="0" y="270" width="400" height="50" fill="#ffe9c9"/>
        <ellipse cx="200" cy="272" rx="150" ry="28" fill="#fff" stroke="#cfd8e3" stroke-width="4"/>
        <ellipse cx="200" cy="272" rx="122" ry="19" fill="none" stroke="#e3ebf3" stroke-width="3"/>
        <g id="cakeWrap">${cakeSVG()}</g>
      </svg>`;
    say(state.icing ? 'Make it pretty!' : 'Pick a colour of icing!');
    renderDecorateShelf();
    bigButton('Done!', 'green corner', renderServe);

    const svg = $('svg');
    svg.addEventListener('click', (e) => {
      if (e.target.closest('.big-btn')) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      cakeTapped(p.x, p.y);
    });
  }

  function insideCake(x, y) {
    if (x < CAKE.cx - CAKE.rx - 6 || x > CAKE.cx + CAKE.rx + 6) return false;
    const dx = (x - CAKE.cx) / CAKE.rx;
    const dy = (y - CAKE.top) / CAKE.ry;
    if (dx * dx + dy * dy <= 1.05) return true;
    return y >= CAKE.top && y <= CAKE.bottom + 10;
  }

  function cakeTapped(x, y) {
    if (!insideCake(x, y)) return;
    if (!state.tool) {
      wobble($('cakeWrap'));
      sfx.tap();
      say(pick(['Wobble wobble!', 'Pick something from the shelf!', 'Squishy!']));
      return;
    }
    if (state.toppings.length >= 40) { say('That is a LOT of toppings!'); sfx.no(); return; }
    const tp = { id: state.tool, x, y, fresh: true };
    if (tp.id === 'candle') tp.y = clamp(y, CAKE.top - 20, CAKE.top + 22);
    state.toppings.push(tp);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = toppingSVG(tp);
    $('toppingsG').appendChild(g.firstChild);
    tp.fresh = false;
    sfx.plop();
    say(pick(['Lovely!', 'Ooh, nice!', 'Pop!', 'More more more!', 'So pretty!']));
  }

  function applyIcing(id) {
    state.icing = id;
    state.drips = makeDrips();
    state.icingT = 0;
    state.tool = null;
    sfx.pour();
    say(pick(['Smooth it all over...', 'Drip, drip, drip!', 'Yummy icing!']));
    const color = ICINGS.find((i) => i.id === id).color;
    const icingG = $('icingG');
    icingG.innerHTML = `<path id="icingPath" d="${icingPath(0)}" fill="${color}" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>`;
    let t = 0;
    loop((dt) => {
      t += dt;
      state.icingT = clamp(t / 0.7, 0, 1);
      const p = $('icingPath');
      if (p) p.setAttribute('d', icingPath(1 - Math.pow(1 - state.icingT, 3)));
      if (state.icingT >= 1) stopLoop();
    });
    renderDecorateShelf();
  }

  function shakeSprinkles() {
    if (state.sprinkles.length >= 260) { say('Sprinkle overload!'); sfx.no(); return; }
    sfx.sprinkle();
    const g = $('sprinklesG');
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      const sp = { x: CAKE.cx + (CAKE.rx - 8) * r * Math.cos(a), y: CAKE.top + (CAKE.ry - 4) * r * Math.sin(a), r: rand(0, 180), c: pick(SPRINKLE_COLORS), fresh: true };
      state.sprinkles.push(sp);
      const w = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      w.innerHTML = sprinkleSVG(sp);
      g.appendChild(w.firstChild);
      sp.fresh = false;
    }
    say(pick(['Shake shake shake!', 'Sprinkles everywhere!', 'Rainbow!']));
  }

  function wipeCake() {
    state.icing = null;
    state.drips = [];
    state.sprinkles = [];
    state.toppings = [];
    state.tool = null;
    stopLoop();
    $('cakeWrap').innerHTML = cakeSVG();
    sfx.no();
    say('All clean! Start again.');
    renderDecorateShelf();
  }

  function renderDecorateShelf() {
    shelf.innerHTML = '';
    const icingBtns = ICINGS.map((ic) => {
      const b = itemButton({ id: ic.id, name: ic.name, icon: ICON.swatch(ic.color), cls: 'small swatch' });
      if (state.icing === ic.id) b.classList.add('selected');
      b.addEventListener('click', () => applyIcing(ic.id));
      return b;
    });
    shelf.appendChild(group('Icing', icingBtns));

    const spr = itemButton({ id: 'sprinkles', name: 'Shake!', icon: ICON.sprinkles, cls: 'small' });
    spr.addEventListener('click', shakeSprinkles);
    const topBtns = TOPPINGS.map((tp) => {
      const b = itemButton({ id: tp.id, name: tp.name, icon: svgWrap(`<g transform="translate(24 ${tp.id === 'candle' ? 40 : 26}) scale(1.1)">${TOP_SVG[tp.id]}</g>`), cls: 'small' });
      if (state.tool === tp.id) b.classList.add('selected');
      b.addEventListener('click', () => {
        state.tool = state.tool === tp.id ? null : tp.id;
        sfx.tap();
        say(state.tool ? `Now tap the cake to put a ${tp.name.toLowerCase()} on!` : 'Pick something from the shelf!');
        renderDecorateShelf();
      });
      return b;
    });
    const wipe = itemButton({ id: 'wipe', name: 'Wipe', icon: ICON.wipe, cls: 'small' });
    wipe.addEventListener('click', wipeCake);
    shelf.appendChild(group('Toppings (tap one, then tap the cake)', [spr, ...topBtns, wipe]));
  }

  /* ================= SERVE ================= */
  const FRIENDS = [
    { name: 'Bear', body: '#c98a5a', dark: '#a56d3f', ear: '#f2c9a0' },
    { name: 'Bunny', body: '#f4f4f4', dark: '#d9d9d9', ear: '#ffc0cf' },
    { name: 'Kitty', body: '#ffb86b', dark: '#e0964a', ear: '#ffd9b8' },
  ];

  function friendSVG(f) {
    const ears = f.name === 'Bunny'
      ? `<ellipse cx="-16" cy="-62" rx="9" ry="26" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/><ellipse cx="16" cy="-62" rx="9" ry="26" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/><ellipse cx="-16" cy="-62" rx="4" ry="18" fill="${f.ear}"/><ellipse cx="16" cy="-62" rx="4" ry="18" fill="${f.ear}"/>`
      : f.name === 'Kitty'
        ? `<path d="M-34 -30 l-6 -30 26 14z M34 -30 l6 -30 -26 14z" fill="${f.body}" stroke="${f.dark}" stroke-width="3" stroke-linejoin="round"/>`
        : `<circle cx="-30" cy="-34" r="13" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/><circle cx="30" cy="-34" r="13" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/><circle cx="-30" cy="-34" r="6" fill="${f.ear}"/><circle cx="30" cy="-34" r="6" fill="${f.ear}"/>`;
    return `<g transform="translate(320 200)"><g id="friend">
      <ellipse cx="0" cy="72" rx="36" ry="30" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/>
      <ellipse cx="0" cy="76" rx="20" ry="18" fill="${f.ear}" opacity="0.8"/>
      ${ears}
      <circle cx="0" cy="0" r="40" fill="${f.body}" stroke="${f.dark}" stroke-width="3"/>
      <ellipse cx="0" cy="12" rx="17" ry="12" fill="${f.ear}" opacity="0.9"/>
      <g id="eyes"><circle cx="-14" cy="-8" r="4" fill="#3a2a2a"/><circle cx="14" cy="-8" r="4" fill="#3a2a2a"/><circle cx="-12.5" cy="-9.5" r="1.4" fill="#fff"/><circle cx="15.5" cy="-9.5" r="1.4" fill="#fff"/></g>
      <ellipse cx="0" cy="8" rx="5" ry="3.5" fill="#3a2a2a"/>
      <path d="M-7 15 q7 7 14 0" fill="none" stroke="#3a2a2a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="-26" cy="8" r="6" fill="#ff9fb8" opacity="0.6"/><circle cx="26" cy="8" r="6" fill="#ff9fb8" opacity="0.6"/>
    </g></g>`;
  }

  function bubble(text) {
    const lines = wrap(text, 16);
    const w = Math.max(90, Math.max(...lines.map((l) => l.length)) * 8.4 + 24);
    const h = lines.length * 20 + 18;
    const x = 330 - w / 2, y = 108 - h;
    return `<g id="bubble" class="bounce">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#fff" stroke="#e3ebf3" stroke-width="3"/>
      <path d="M318 ${y + h - 2} l8 14 l10 -14z" fill="#fff" stroke="#e3ebf3" stroke-width="3" stroke-linejoin="round"/>
      <rect x="${x + 2}" y="${y + h - 5}" width="${w - 4}" height="6" fill="#fff"/>
      ${lines.map((l, i) => `<text x="330" y="${y + 24 + i * 20}" text-anchor="middle" font-size="15" font-weight="700" font-family="Fredoka, Varela Round, Segoe UI, sans-serif" fill="#4a3a3a">${l}</text>`).join('')}
    </g>`;
  }
  function wrap(text, max) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function describeCake() {
    const f = FLAVOURS[state.flavour].name.toLowerCase();
    const ic = state.icing ? ICINGS.find((i) => i.id === state.icing).name.toLowerCase() + ' icing' : 'no icing';
    const counts = {};
    state.toppings.forEach((t) => { counts[t.id] = (counts[t.id] || 0) + 1; });
    const parts = Object.keys(counts).map((id) => {
      const n = counts[id];
      const name = TOPPINGS.find((t) => t.id === id).name.toLowerCase();
      return n === 1 ? `1 ${name}` : `${n} ${name === 'cherry' ? 'cherries' : name === 'strawberry' ? 'strawberries' : name === 'mallow' ? 'mallows' : name + 's'}`;
    });
    let s = `A ${f} cake with ${ic}`;
    if (state.sprinkles.length) s += ', sprinkles';
    if (parts.length) s += (state.sprinkles.length ? ' and ' : ', ') + parts.join(', ');
    return s + '!';
  }

  function confetti() {
    for (let i = 0; i < 40; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = rand(0, 100) + '%';
      c.style.background = pick(SPRINKLE_COLORS);
      c.style.animationDuration = rand(1.6, 3) + 's';
      c.style.animationDelay = rand(0, 0.8) + 's';
      stage.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  function renderServe() {
    setStep('serve');
    state.tool = null;
    stopLoop();
    cakes += 1;
    try { localStorage.setItem('mlk-cakes', String(cakes)); } catch (e) { /* ignore */ }
    showCount();
    bounce(countEl);

    const friend = pick(FRIENDS);
    stage.innerHTML = `
      <svg viewBox="0 0 400 320" id="svg">
        <defs>
          <linearGradient id="side" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
        </defs>
        <rect x="0" y="270" width="400" height="50" fill="#ffe9c9"/>
        <g transform="translate(-40 40) scale(0.85)">
          <g id="cakeWrap">
            <ellipse cx="200" cy="272" rx="150" ry="28" fill="#fff" stroke="#cfd8e3" stroke-width="4"/>
            <ellipse cx="200" cy="272" rx="122" ry="19" fill="none" stroke="#e3ebf3" stroke-width="3"/>
            ${cakeSVG()}
          </g>
        </g>
        ${friendSVG(friend)}
        <g id="bubbleWrap"></g>
      </svg>`;
    confetti();
    sfx.yay();
    const hasCandles = state.toppings.some((t) => t.id === 'candle');
    say(hasCandles ? 'Blow out the candles!' : 'Ta-da! You made a cake!');
    setBubble(pick(['Wow!', 'For me?!', 'Yummy!', 'Ooh, so pretty!']));
    shelf.innerHTML = `<div class="note">${describeCake()}</div>`;

    if (hasCandles) {
      goButton('Blow!', '', blowCandles);
    } else {
      setTimeout(() => { if (state.step === 'serve') goButton('Bake another!', 'green', startOver); }, 900);
    }

    $('cakeWrap').addEventListener('click', () => {
      wobble($('cakeWrap'));
      sfx.tap();
      setBubble(pick(['Yum yum!', 'Can I have a slice?', `Mmm, ${FLAVOURS[state.flavour].name.toLowerCase()}!`, 'Best cake ever!', 'Nom nom nom.']));
    });
    $('friend').addEventListener('click', () => {
      bounce($('friend'));
      sfx.plop();
      setBubble(pick(['Hello!', 'Hee hee!', `I'm ${friend.name}!`, 'You are a great baker!']));
    });
  }

  function setBubble(text) {
    const w = $('bubbleWrap');
    if (w) w.innerHTML = bubble(text);
  }

  function blowCandles() {
    if (state.blown) return;
    state.blown = true;
    shelf.querySelectorAll('.go-btn').forEach((b) => b.remove());
    sfx.blow();
    stage.querySelectorAll('.topping .flame').forEach((f) => { f.style.display = 'none'; });
    stage.querySelectorAll('.topping .smoke').forEach((s) => { s.style.display = ''; });
    say('Whoooosh! Make a wish.');
    setBubble('Hooray! Make a wish!');
    setTimeout(() => { sfx.yay(); confetti(); }, 500);
    setTimeout(() => { if (state.step === 'serve') goButton('Bake another!', 'green', startOver); }, 1200);
  }

  function startOver() {
    stopLoop();
    state = freshState();
    sfx.tap();
    renderMix();
  }

  /* ---------------- go ---------------- */
  state = freshState();
  renderMix();
})();
