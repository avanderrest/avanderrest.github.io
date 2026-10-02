/* Letters to Ashfield — the drawing.
 *
 * Everything you see that isn't a texture is drawn here as SVG: the people at the
 * counter (one parameter set each, five moods), the objects on the shelves you tidy,
 * and the churchyard. Returns strings; game.js puts them in the page.
 */
window.OAKART = (function () {
  'use strict';

  // ---------- constants ----------
  const INK = '#3b2618';
  const LOOKS = {
    beatrice: { skin: '#f2d4c0', hair: '#ece6dc', style: 'bun', coat: '#8c76a3', collar: 'cardigan', glasses: 'round', age: 3 },
    arthur: { skin: '#e3a184', hair: '#857260', style: 'cap', cap: '#6e5d47', coat: '#6d6249', collar: 'tweed', stubble: true, age: 2 },
    jack: { skin: '#f0c6a6', hair: '#5b3a20', style: 'quiff', coat: '#f4f0e6', collar: 'braces', age: 1 },
    gladys: { skin: '#f1caae', hair: '#a8482a', style: 'curls', coat: '#c98190', collar: 'apron', glasses: 'cat', age: 2 },
    sam: { skin: '#7a4a32', hair: '#1d1612', style: 'short', coat: '#3d4658', collar: 'tie', tie: '#7c2f2f', stetho: true, age: 1 },
    penry: { skin: '#f0d5c2', hair: '#bdb6ac', style: 'bald', coat: '#24242a', collar: 'clerical', glasses: 'half', age: 2 },
    tom: { skin: '#d79d78', hair: '#2e2520', style: 'short', beard: true, coat: '#5b5047', collar: 'leather', age: 1 },
    edith: { skin: '#f4d8c8', hair: '#d3cec8', style: 'curls', coat: '#5f8a6c', collar: 'pearls', age: 3 },
    marion: { skin: '#efd1bc', hair: '#dad6d0', style: 'chignon', coat: '#7a6342', collar: 'brooch', age: 3 },
    wren: { skin: '#f2cdb2', hair: '#3c2a1e', style: 'bob', coat: '#4f6e4b', collar: 'cardigan', glasses: 'round', age: 0 },
    gale: { skin: '#e7bea0', hair: '#5a5550', style: 'hat', hat: '#4b4a44', coat: '#8a7d62', collar: 'trench', moustache: true, age: 2 },
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- portraits ----------
  function hairBack(L) {
    const h = L.hair, s = `fill="${h}" stroke="${INK}" stroke-width="2.5"`;
    switch (L.style) {
      case 'bun': return `<circle cx="100" cy="60" r="20" ${s}/><path d="M86,56 q14,-10 28,0" fill="none" stroke="${shade(h, -0.25)}" stroke-width="2"/>`;
      case 'bob': return `<path d="M50,112 C44,50 156,50 150,112 L152,160 C140,168 130,160 128,150 L72,150 C70,160 60,168 48,160 Z" ${s}/>`;
      case 'chignon': return `<ellipse cx="100" cy="68" rx="30" ry="16" ${s}/>`;
      case 'curls': return [[60, 92], [140, 92], [54, 118], [146, 118], [58, 140], [142, 140]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="14" ${s}/>`).join('');
      default: return '';
    }
  }
  function hairFront(L) {
    const h = L.hair, dk = shade(h, -0.3), s = `fill="${h}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;
    switch (L.style) {
      case 'bun': return `<path d="M55,110 C50,58 150,58 145,110 C140,84 118,72 100,76 C82,72 60,84 55,110Z" ${s}/><path d="M100,76 C96,66 92,64 90,62 M74,84 q10,-8 22,-8 M126,84 q-10,-8 -22,-8" stroke="${dk}" stroke-width="2" fill="none"/>`;
      case 'cap': return `<path d="M54,104 C52,74 70,56 100,56 C134,56 150,74 148,100 Z" fill="${L.hair}" stroke="${INK}" stroke-width="2.5"/>` +
        `<path d="M50,96 C50,60 150,52 156,88 C150,82 120,74 100,76 C80,76 62,84 50,96Z" fill="${L.cap}" stroke="${INK}" stroke-width="2.5"/>` +
        `<path d="M118,80 C138,78 162,86 168,96 C150,96 130,92 112,90Z" fill="${shade(L.cap, -0.15)}" stroke="${INK}" stroke-width="2.5"/>` +
        `<path d="M70,70 q30,-12 60,-2" stroke="${shade(L.cap, -0.3)}" stroke-width="1.6" fill="none"/>`;
      case 'quiff': return `<path d="M54,112 C46,60 80,44 108,48 C138,50 156,72 146,112 C142,92 132,82 118,80 C104,90 76,82 66,88 C60,96 56,104 54,112Z" ${s}/><path d="M76,66 q24,-14 52,0 M84,58 q20,-8 40,2" stroke="${dk}" stroke-width="2" fill="none"/>`;
      case 'curls': return [[66, 74], [84, 64], [102, 60], [120, 64], [136, 74], [146, 92], [56, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" ${s}/>`).join('') +
        `<path d="M70,82 q8,-8 16,0 M96,72 q8,-8 16,0 M120,80 q8,-8 16,0" stroke="${dk}" stroke-width="2" fill="none"/>`;
      case 'short': return `<path d="M56,106 C50,62 150,56 144,106 C140,84 124,74 100,74 C78,74 60,84 56,106Z" ${s}/>`;
      case 'bald': return `<path d="M56,120 C52,104 56,94 62,90 C64,104 64,114 62,124Z M144,120 C148,104 144,94 138,90 C136,104 136,114 138,124Z" ${s}/><path d="M80,72 q20,-6 40,0" stroke="${shade(L.skin, -0.12)}" stroke-width="2" fill="none"/>`;
      case 'bob': return `<path d="M56,106 C54,66 146,62 144,106 C130,90 120,84 112,96 C104,84 84,86 74,96 C66,90 60,96 56,106Z" ${s}/>`;
      case 'chignon': return `<path d="M55,112 C50,62 150,62 145,112 C142,86 124,74 100,74 C76,74 58,86 55,112Z" ${s}/><path d="M64,96 q30,-30 72,0" stroke="${dk}" stroke-width="2" fill="none"/>`;
      case 'hat': return `<path d="M58,100 C56,70 70,52 100,52 C130,52 144,70 142,100 Z" fill="${L.hat}" stroke="${INK}" stroke-width="2.5"/>` +
        `<path d="M66,58 q34,-14 68,0" stroke="${shade(L.hat, -0.3)}" stroke-width="3" fill="none"/>` +
        `<rect x="58" y="86" width="84" height="10" fill="${shade(L.hat, -0.35)}"/>` +
        `<ellipse cx="100" cy="99" rx="62" ry="10" fill="${L.hat}" stroke="${INK}" stroke-width="2.5"/>`;
      default: return '';
    }
  }
  function collar(L) {
    const c = L.coat, dk = shade(c, -0.25), S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;
    switch (L.collar) {
      case 'cardigan': return `<path d="M84,176 L100,232 L116,176" fill="#f5efe3" ${S}/><path d="M78,178 L100,240 L76,240 L64,190Z M122,178 L100,240 L124,240 L136,190Z" fill="${dk}" ${S}/>` +
        `<circle cx="100" cy="214" r="3" fill="${shade(c, 0.4)}"/><circle cx="100" cy="230" r="3" fill="${shade(c, 0.4)}"/>`;
      case 'tweed': return `<path d="M82,176 L100,214 L118,176Z" fill="#e9e2cf" ${S}/><path d="M74,180 L100,240 L60,240 L58,196Z M126,180 L100,240 L140,240 L142,196Z" fill="${dk}" ${S}/>` +
        `<path d="M96,200 L104,200 L100,226Z" fill="#7a3b2a"/>`;
      case 'braces': return `<path d="M84,176 L100,196 L116,176" fill="none" ${S}/><path d="M74,190 L80,240 M126,190 L120,240" stroke="#3b3b45" stroke-width="7"/>` +
        `<path d="M90,186 L100,198 L110,186" fill="none" stroke="${shade(c, -0.15)}" stroke-width="2"/>`;
      case 'apron': return `<path d="M84,176 q16,14 32,0" fill="none" ${S}/><path d="M70,200 L130,200 L136,240 L64,240Z" fill="#fbf6ea" ${S}/><path d="M74,200 L64,182 M126,200 L136,182" stroke="#fbf6ea" stroke-width="5"/>`;
      case 'tie': return `<path d="M84,176 L100,196 L116,176" fill="#f6f4ee" ${S}/><path d="M96,194 L104,194 L108,234 L100,240 L92,234Z" fill="${L.tie}" ${S}/>` +
        `<path d="M78,180 L96,240 L60,240 L58,198Z M122,180 L104,240 L140,240 L142,198Z" fill="${dk}" ${S}/>`;
      case 'clerical': return `<path d="M82,176 Q100,190 118,176 L118,186 Q100,200 82,186Z" fill="#fbfbf6" ${S}/><rect x="96" y="186" width="8" height="10" fill="#fbfbf6"/>`;
      case 'leather': return `<path d="M84,176 q16,12 32,0" fill="none" ${S}/><path d="M68,196 L132,196 L138,240 L62,240Z" fill="#7a4a2a" ${S}/><path d="M72,196 L66,180 M128,196 L134,180" stroke="#7a4a2a" stroke-width="5"/>`;
      case 'pearls': return `<path d="M82,178 q18,16 36,0" fill="none" ${S}/>` + [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const a = Math.PI * (0.15 + i * 0.0875), x = 100 - Math.cos(a) * 22, y = 180 + Math.sin(a) * 18;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.3" fill="#fbf7ee" stroke="#b9aea0" stroke-width="1"/>`;
      }).join('');
      case 'brooch': return `<path d="M82,176 L100,206 L118,176Z" fill="#efe7da" ${S}/><path d="M76,180 L100,240 L62,240 L58,196Z M124,180 L100,240 L138,240 L142,196Z" fill="${dk}" ${S}/>` +
        `<ellipse cx="124" cy="212" rx="7" ry="9" fill="#e9d9c0" stroke="#a07a3a" stroke-width="2.5"/>`;
      case 'trench': return `<path d="M80,174 L100,206 L120,174Z" fill="#f0ece2" ${S}/><path d="M96,200 L104,200 L106,236 L94,236Z" fill="#33384a"/>` +
        `<path d="M72,176 L100,240 L58,240 L54,192Z M128,176 L100,240 L142,240 L146,192Z" fill="${dk}" ${S}/>`;
      default: return '';
    }
  }
  function glasses(L) {
    const S = `fill="rgba(255,255,255,0.18)" stroke="#5a4632" stroke-width="2.4"`;
    if (L.glasses === 'round') return `<circle cx="83" cy="113" r="11" ${S}/><circle cx="117" cy="113" r="11" ${S}/><path d="M94,112 q6,-4 12,0" stroke="#5a4632" stroke-width="2.4" fill="none"/>`;
    if (L.glasses === 'cat') return `<path d="M70,106 L96,108 L94,120 L74,120Z M130,106 L104,108 L106,120 L126,120Z" ${S.replace('#5a4632', '#7b2d3d')}/><path d="M96,110 L104,110" stroke="#7b2d3d" stroke-width="2.4"/>`;
    if (L.glasses === 'half') return `<path d="M72,116 L94,116 Q92,126 83,126 Q74,126 72,116Z M106,116 L128,116 Q126,126 117,126 Q108,126 106,116Z" ${S}/><path d="M94,117 L106,117" stroke="#5a4632" stroke-width="2"/>`;
    return '';
  }
  function face(L, mood) {
    const eye = mood === 'shock' ? 4.6 : mood === 'tense' ? 2.8 : 3.6;
    const brow = shade(L.hair === '#ece6dc' || L.hair === '#d3cec8' || L.hair === '#dad6d0' || L.hair === '#bdb6ac' ? '#8d847a' : L.hair, -0.2);
    let out = '';
    // eyes
    out += `<ellipse cx="83" cy="113" rx="6.5" ry="${mood === 'tense' ? 3.6 : 4.6}" fill="#fbf8f2"/><ellipse cx="117" cy="113" rx="6.5" ry="${mood === 'tense' ? 3.6 : 4.6}" fill="#fbf8f2"/>`;
    const look = mood === 'tense' ? 2.2 : 0;
    out += `<circle cx="${83 + look}" cy="113.5" r="${eye}" fill="#2a1d14"/><circle cx="${117 + look}" cy="113.5" r="${eye}" fill="#2a1d14"/>`;
    out += `<circle cx="${84.4 + look}" cy="112" r="1.2" fill="#fff"/><circle cx="${118.4 + look}" cy="112" r="1.2" fill="#fff"/>`;
    // brows
    const b = {
      calm: 'M74,101 q9,-5 18,-1 M108,100 q9,-4 18,1',
      smile: 'M74,100 q9,-6 18,-1 M108,99 q9,-5 18,1',
      worried: 'M74,100 q9,-1 18,-6 M108,94 q9,5 18,6',
      tense: 'M74,98 q9,4 18,6 M108,104 q9,-2 18,-6',
      shock: 'M74,96 q9,-7 18,-2 M108,94 q9,-5 18,2',
    }[mood] || '';
    out += `<path d="${b}" stroke="${brow}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`;
    // nose
    out += `<path d="M100,116 q-5,12 0,16 q4,1 6,-1" stroke="${shade(L.skin, -0.32)}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    // cheeks
    out += `<circle cx="74" cy="130" r="8" fill="#e47a6a" opacity="0.18"/><circle cx="126" cy="130" r="8" fill="#e47a6a" opacity="0.18"/>`;
    // mouth
    const m = {
      calm: 'M88,144 q12,5 24,0',
      smile: 'M86,142 q14,12 28,0',
      worried: 'M88,147 q12,-5 24,0',
      tense: 'M88,145 q4,-2 8,0 q4,2 8,0 q4,-2 8,0',
      shock: '',
    }[mood];
    out += mood === 'shock' ? `<ellipse cx="100" cy="146" rx="6" ry="7" fill="#5a2a22"/>` : `<path d="${m}" stroke="#8a3f33" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
    // age
    if (L.age >= 2) out += `<path d="M66,112 l-5,-2 M66,117 l-5,1 M134,112 l5,-2 M134,117 l5,1" stroke="${shade(L.skin, -0.25)}" stroke-width="1.5"/>`;
    if (L.age >= 3) out += `<path d="M84,90 q16,-4 32,0 M88,96 q12,-3 24,0" stroke="${shade(L.skin, -0.16)}" stroke-width="1.5" fill="none"/><path d="M84,136 q-4,6 -2,12 M116,136 q4,6 2,12" stroke="${shade(L.skin, -0.2)}" stroke-width="1.5" fill="none"/>`;
    return out;
  }
  // Her painted expression sheets, one per person and mood (assets/who, 2:3). The drawn
  // face below is only the fallback for anyone without a sheet.
  const PAINTED = ['beatrice', 'arthur', 'jack', 'gladys', 'sam', 'penry', 'tom', 'edith', 'marion', 'wren', 'gale'];
  const MOODS = ['calm', 'smile', 'worried', 'tense', 'shock'];
  function portrait(key, mood) {
    mood = MOODS.includes(mood) ? mood : 'calm';
    if (PAINTED.includes(key)) {
      return `<svg class="portrait painted" viewBox="0 0 200 300" aria-hidden="true"><image href="assets/who/${key}-${mood}.webp" width="200" height="300"/></svg>`;
    }
    const L = LOOKS[key] || LOOKS.beatrice;
    const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;
    let s = `<svg class="portrait" viewBox="0 0 200 240" aria-hidden="true">`;
    // shoulders
    s += `<path d="M14,242 C18,206 46,186 78,180 L122,180 C154,186 182,206 186,242Z" fill="${L.coat}" ${S}/>`;
    s += `<path d="M30,236 C36,214 54,200 72,194" stroke="${shade(L.coat, 0.16)}" stroke-width="5" fill="none" opacity="0.6"/>`;
    // neck
    s += `<path d="M84,150 L84,180 Q100,192 116,180 L116,150Z" fill="${shade(L.skin, -0.12)}" ${S}/>`;
    s += collar(L);
    if (L.stetho) s += `<path d="M78,182 C70,206 84,224 100,226 C116,224 130,206 122,182" stroke="#2b2b30" stroke-width="3.5" fill="none"/><circle cx="100" cy="228" r="5" fill="#c8c8cc" stroke="#2b2b30" stroke-width="2"/>`;
    s += hairBack(L);
    // ears + head
    s += `<ellipse cx="56" cy="118" rx="8" ry="12" fill="${shade(L.skin, -0.06)}" ${S}/><ellipse cx="144" cy="118" rx="8" ry="12" fill="${shade(L.skin, -0.06)}" ${S}/>`;
    s += `<path d="M56,108 C56,62 144,62 144,108 C144,148 126,168 100,168 C74,168 56,148 56,108Z" fill="${L.skin}" ${S}/>`;
    s += `<path d="M64,140 C70,156 84,164 100,166" stroke="${shade(L.skin, -0.1)}" stroke-width="4" fill="none" opacity="0.6"/>`;
    if (L.stubble) s += `<path d="M66,138 C72,160 128,160 134,138 C128,154 72,154 66,138Z" fill="${shade(L.hair, -0.1)}" opacity="0.35"/>`;
    if (L.beard) s += `<path d="M60,124 C60,170 140,170 140,124 C134,146 120,156 100,156 C80,156 66,146 60,124Z" fill="${L.hair}" ${S}/>`;
    s += face(L, mood);
    if (L.beard) s += `<path d="M86,140 q14,-6 28,0 q-14,4 -28,0Z" fill="${L.hair}"/>`;
    if (L.moustache) s += `<path d="M84,138 q8,-8 16,-2 q8,-6 16,2 q-8,4 -16,0 q-8,4 -16,0Z" fill="${L.hair}" stroke="${INK}" stroke-width="1.5"/>`;
    s += hairFront(L);
    s += glasses(L);
    if (mood === 'tense') s += `<path class="sweat" d="M146,84 q6,10 0,14 q-6,-4 0,-14Z" fill="#9fd0ee" stroke="#4a86a8" stroke-width="1.5"/>`;
    s += `</svg>`;
    return s;
  }

  // ---------- shelf objects ----------
  // Each returns SVG for an item standing on y=0 (it draws upward), centred on x=0.
  const R = (n) => Math.round(n * 10) / 10;
  function bottle(h, col, label) {
    const w = 26 + h * 0.18;
    return `<g><rect x="${R(-w / 2)}" y="${-h}" width="${R(w)}" height="${h}" rx="7" fill="${col}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="-7" y="${-h - 16}" width="14" height="18" fill="${col}" stroke="${INK}" stroke-width="2"/><rect x="-9" y="${-h - 24}" width="18" height="9" rx="2" fill="#c9a36a" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="${R(-w / 2 + 5)}" y="${R(-h * 0.62)}" width="${R(w - 10)}" height="${R(Math.min(26, h * 0.3))}" fill="#f5ecd6" stroke="${INK}" stroke-width="1.2"/>` +
      `<text x="0" y="${R(-h * 0.62 + Math.min(26, h * 0.3) / 2 + 4)}" text-anchor="middle" font-size="9" font-family="Special Elite, monospace" fill="#4a3424">${label}</text>` +
      `<rect x="${R(-w / 2 + 4)}" y="${-h + 6}" width="5" height="${R(h * 0.5)}" rx="2" fill="#fff" opacity="0.25"/></g>`;
  }
  function stamp(h, col) {
    return `<g><rect x="-22" y="-14" width="44" height="14" rx="2" fill="#2d2d2d" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="-18" y="${-h + 12}" width="36" height="${h - 26}" rx="3" fill="${col}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="0" cy="${-h + 10}" rx="15" ry="14" fill="${shade(col, 0.15)}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="-14" y="${-h + 26}" width="5" height="${h - 46}" fill="#fff" opacity="0.2"/></g>`;
  }
  function tankard(s) {
    const w = 30 + s * 16, h = 40 + s * 18;
    return `<g><path d="M${R(-w / 2)},${-h} L${R(w / 2)},${-h} L${R(w / 2 - 3)},0 L${R(-w / 2 + 3)},0Z" fill="#b8bcc0" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M${R(w / 2)},${R(-h * 0.8)} q${R(14 + s * 4)},4 ${R(4 + s)},${R(h * 0.55)}" fill="none" stroke="${INK}" stroke-width="6"/><path d="M${R(w / 2)},${R(-h * 0.8)} q${R(14 + s * 4)},4 ${R(4 + s)},${R(h * 0.55)}" fill="none" stroke="#b8bcc0" stroke-width="3"/>` +
      `<rect x="${R(-w / 2)}" y="${-h}" width="${R(w)}" height="6" fill="#9ca0a5" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="${R(-w / 2 + 5)}" y="${-h + 10}" width="5" height="${R(h - 18)}" fill="#fff" opacity="0.35"/></g>`;
  }
  function tin(col, label) {
    return `<g><rect x="-24" y="-74" width="48" height="74" fill="${col}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="0" cy="-74" rx="24" ry="6" fill="#cfcfd2" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="-24" y="-52" width="48" height="26" fill="#f6efdc" stroke="${INK}" stroke-width="1.5"/>` +
      `<text x="0" y="-35" text-anchor="middle" font-size="9" font-family="Special Elite, monospace" fill="#3a2a1c">${label}</text>` +
      `<rect x="-19" y="-70" width="5" height="66" fill="#fff" opacity="0.22"/></g>`;
  }
  function churn(s) {
    const w = 36 + s * 9, h = 70 + s * 16;
    return `<g><path d="M${R(-w / 2)},0 L${R(-w / 2)},${R(-h * 0.62)} Q${R(-w / 2)},${R(-h * 0.78)} ${R(-w / 4)},${R(-h * 0.84)} L${R(-w / 4)},${-h} L${R(w / 4)},${-h} L${R(w / 4)},${R(-h * 0.84)} Q${R(w / 2)},${R(-h * 0.78)} ${R(w / 2)},${R(-h * 0.62)} L${R(w / 2)},0Z" fill="#c4c9cc" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="${R(-w / 4 - 4)}" y="${-h - 8}" width="${R(w / 2 + 8)}" height="10" rx="3" fill="#a9afb3" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="${R(-w / 2)}" y="${R(-h * 0.3)}" width="${R(w)}" height="6" fill="#a9afb3" stroke="${INK}" stroke-width="1.5"/>` +
      `<rect x="${R(-w / 2 + 5)}" y="${R(-h * 0.6)}" width="5" height="${R(h * 0.55)}" fill="#fff" opacity="0.35"/></g>`;
  }
  function book(h, col, year) {
    const w = 38;
    return `<g><rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="3" fill="${col}" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="${-w / 2}" y="${-h + 12}" width="${w}" height="5" fill="#c9a24e" opacity="0.8"/><rect x="${-w / 2}" y="-18" width="${w}" height="5" fill="#c9a24e" opacity="0.8"/>` +
      `<rect x="-14" y="${R(-h / 2 - 15)}" width="28" height="30" fill="#efe2c2" stroke="${INK}" stroke-width="1.2"/>` +
      `<text x="0" y="${R(-h / 2 + 4)}" text-anchor="middle" font-size="11" font-family="Special Elite, monospace" fill="#3a2a1c">${year}</text></g>`;
  }
  function hatbox(s, col) {
    const w = 50 + s * 16, h = 34 + s * 10;
    return `<g><rect x="${R(-w / 2)}" y="${-h}" width="${R(w)}" height="${h}" fill="${col}" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse cx="0" cy="${-h}" rx="${R(w / 2 + 3)}" ry="7" fill="${shade(col, 0.2)}" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M${R(-w / 2)},${R(-h * 0.45)} L${R(w / 2)},${R(-h * 0.45)}" stroke="${shade(col, -0.3)}" stroke-width="4"/>` +
      `<path d="M-10,${-h - 6} q10,-16 20,0" stroke="#5b3a2a" stroke-width="3" fill="none"/></g>`;
  }
  function lost(kind) {
    switch (kind) {
      case 'thimble': return `<g><path d="M-10,0 L-8,-20 Q0,-28 8,-20 L10,0Z" fill="#c9cbd0" stroke="${INK}" stroke-width="2"/><path d="M-6,-12 h12 M-7,-6 h14" stroke="#8b8f96" stroke-width="1.5"/></g>`;
      case 'matchbox': return `<g><rect x="-20" y="-16" width="40" height="16" fill="#e8d6a0" stroke="${INK}" stroke-width="2"/><rect x="-12" y="-13" width="24" height="10" fill="#b8402e"/></g>`;
      case 'specs': return `<g><rect x="-34" y="-20" width="68" height="20" rx="9" fill="#8a2f3a" stroke="${INK}" stroke-width="2"/><path d="M-26,-10 h52" stroke="#d6a95a" stroke-width="2"/></g>`;
      case 'glove': return `<g><path d="M-30,0 L-30,-30 Q-30,-40 -22,-40 L-22,-56 Q-16,-62 -12,-56 L-12,-44 L-8,-62 Q-2,-68 2,-62 L0,-44 L8,-58 Q14,-62 16,-54 L10,-38 L22,-46 Q30,-44 26,-36 L12,-14 L12,0Z" fill="#7a5638" stroke="${INK}" stroke-width="2"/></g>`;
      case 'purse': return `<g><path d="M-36,0 L-40,-38 Q0,-50 40,-38 L36,0Z" fill="#3d5a6e" stroke="${INK}" stroke-width="2"/><path d="M-12,-46 q12,-16 24,0" stroke="#c9a24e" stroke-width="4" fill="none"/></g>`;
      case 'brolly': return `<g><path d="M-6,0 L-6,-92 Q0,-100 6,-92 L6,0Z" fill="#2a2a34" stroke="${INK}" stroke-width="2"/><path d="M0,0 q0,12 -10,12" stroke="#6b4a2a" stroke-width="5" fill="none"/><path d="M-10,-70 L10,-70 L6,-30 L-6,-30Z" fill="#33333e" stroke="${INK}" stroke-width="2"/></g>`;
      default: return '';
    }
  }

  // tools for the forge pegboard: each is centred; `outline` uses the same path as a painted silhouette
  const TOOLS = {
    hammer: 'M-8,40 L-8,-26 L-30,-26 L-30,-44 L30,-44 L30,-30 L8,-26 L8,40Z',
    saw: 'M-50,-14 L40,-14 L48,14 L-50,14 Z M-50,-14 L-70,-20 L-70,22 L-50,14Z',
    chisel: 'M-5,46 L-5,0 L-9,-4 L-9,-30 L9,-30 L9,-4 L5,0 L5,46 L0,52Z',
    pliers: 'M-6,-44 L6,-44 L4,-6 L16,40 L8,44 L0,6 L-8,44 L-16,40 L-4,-6Z',
    spanner: 'M-6,-30 L-6,36 Q-6,46 -16,48 L-16,58 L16,58 L16,48 Q6,46 6,36 L6,-30 Q18,-34 18,-46 L8,-46 L8,-38 L-8,-38 L-8,-46 L-18,-46 Q-18,-34 -6,-30Z',
  };
  const TOOL_COL = { hammer: '#8b6b4a', saw: '#a9adb2', chisel: '#a0723f', pliers: '#9aa0a6', spanner: '#b0b4b8' };
  function tool(kind) {
    return `<path d="${TOOLS[kind]}" fill="${TOOL_COL[kind]}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }
  function toolOutline(kind) {
    return `<path d="${TOOLS[kind]}" fill="#f2e6cc" stroke="#d9c49c" stroke-width="3" stroke-dasharray="5 4" opacity="0.85"/>`;
  }

  // ---------- backdrops for the tidy scenes (800 x 440) ----------
  function shelfScene(kind) {
    const bg = {
      stamps: ['#6a3d26', '#4a2a1a'], bottles: ['#e7e3d6', '#cfc8b4'], tankards: ['#5a3a24', '#3d2616'],
      tins: ['#d8cfb8', '#bfb397'], churns: ['#cfc7b0', '#a99f86'], registers: ['#4c3a2c', '#33261b'],
      ledgers: ['#5b4632', '#3b2c1e'], hatboxes: ['#d9c9b3', '#b7a68e'], drawer: ['#7a5a3e', '#5a3e28'],
    }[kind] || ['#ccc', '#999'];
    let s = `<defs><linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>`;
    s += `<rect width="800" height="440" fill="url(#bgg)"/>`;
    if (kind === 'bottles' || kind === 'tins' || kind === 'hatboxes' || kind === 'churns') {
      for (let x = 0; x < 800; x += 40) s += `<rect x="${x}" y="0" width="40" height="440" fill="${x % 80 ? '#000' : '#fff'}" opacity="0.025"/>`;
    }
    if (kind === 'churns') s += `<rect y="300" width="800" height="140" fill="#9a8f78"/><path d="M0,300 H800" stroke="${INK}" stroke-width="3"/>` + Array.from({ length: 10 }, (_, i) => `<path d="M${i * 90},300 l-30,140" stroke="#857a64" stroke-width="2"/>`).join('');
    else if (kind === 'tankards') {
      s += `<rect x="20" y="120" width="760" height="16" fill="#7a5235" stroke="${INK}" stroke-width="2"/>`;
      s += `<rect x="20" y="340" width="760" height="100" fill="#6a4228"/>`;
    } else if (kind === 'drawer') {
      // a cardboard box seen from above, with card dividers
      s += `<rect x="30" y="40" width="740" height="360" rx="4" fill="#c49a62" stroke="${INK}" stroke-width="3"/><rect x="46" y="56" width="708" height="328" fill="#8a6a42"/>`;
      s += `<path d="M30,40 L80,10 L720,10 L770,40" fill="#d9b27a" stroke="${INK}" stroke-width="3"/><text x="400" y="34" text-anchor="middle" font-family="Special Elite, monospace" font-size="18" fill="#5a3a22">LOST &amp; FOUND</text>`;
      for (let i = 1; i < 6; i++) s += `<rect x="${46 + i * 118 - 3}" y="56" width="6" height="328" fill="#d9b27a" stroke="#8a6a42" stroke-width="1"/>`;
    } else {
      s += `<rect x="20" y="320" width="760" height="22" fill="#8a5b38" stroke="${INK}" stroke-width="2.5"/><rect x="20" y="342" width="760" height="10" fill="#5e3b22"/>`;
      s += `<path d="M60,352 l0,40 M740,352 l0,40" stroke="#5e3b22" stroke-width="10"/>`;
    }
    return s;
  }

  // the forge pegboard
  function pegboard() {
    let s = `<rect width="800" height="440" fill="#a07a54"/>`;
    for (let y = 20; y < 300; y += 24) for (let x = 20; x < 800; x += 24) s += `<circle cx="${x}" cy="${y}" r="2.6" fill="#5e4128"/>`;
    s += `<rect x="0" y="300" width="800" height="140" fill="#4b3424"/><rect x="0" y="300" width="800" height="10" fill="#6b4a32"/>`;
    return s;
  }

  // ---------- the churchyard ----------
  function churchyard() {
    let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7f8c"/><stop offset="1" stop-color="#a9b2a8"/></linearGradient></defs>`;
    s += `<rect width="800" height="440" fill="url(#sky)"/>`;
    // church wall + vestry door
    s += `<rect x="360" y="40" width="440" height="330" fill="#9a958a" stroke="${INK}" stroke-width="2.5"/>`;
    for (let y = 52; y < 360; y += 22) for (let x = 360 + ((y / 22) % 2) * 20; x < 800; x += 40) s += `<rect x="${x}" y="${y}" width="38" height="20" fill="none" stroke="#7e796f" stroke-width="1.2"/>`;
    s += `<path d="M520,330 L520,170 Q570,110 620,170 L620,330Z" fill="#5a3a24" stroke="${INK}" stroke-width="3"/><path d="M570,130 L570,330" stroke="#3e2818" stroke-width="2"/>`;
    // steps
    s += `<path d="M470,330 h200 v14 h30 v14 h30 v14 h30 v20 H420 v-20 h20 v-14 h20 v-14 h10Z" fill="#8a857b" stroke="${INK}" stroke-width="2.5"/>`;
    // ground
    s += `<path d="M0,330 Q200,310 360,340 L360,440 L0,440Z" fill="#5f7350"/><rect x="360" y="392" width="440" height="48" fill="#6a7d58"/>`;
    // gravestones
    s += `<path d="M80,330 L80,250 Q110,220 140,250 L140,330Z" fill="#a8a69d" stroke="${INK}" stroke-width="2.5"/><path d="M96,262 h28 M100,276 h20" stroke="#7a786f" stroke-width="2"/>`;
    s += `<path d="M220,340 L220,280 Q240,262 260,280 L260,340Z" fill="#9b998f" stroke="${INK}" stroke-width="2.5"/>`;
    // railings
    s += `<path d="M300,250 H360" stroke="#2d2a28" stroke-width="4"/>` + Array.from({ length: 6 }, (_, i) => `<path d="M${300 + i * 12},250 V350" stroke="#2d2a28" stroke-width="3"/>`).join('');
    // rain
    s += `<g class="rain" opacity="0.35">` + Array.from({ length: 40 }, (_, i) => `<path d="M${(i * 53) % 800},${(i * 97) % 440} l-6,16" stroke="#dfe8ee" stroke-width="1.5"/>`).join('') + `</g>`;
    return s;
  }
  // the five crooked things, drawn upright at their pivot (rotation is applied by the game)
  const CHURCH_BITS = {
    vase: { x: 110, y: 330, svg: `<path d="M-12,0 L-14,-30 L14,-30 L12,0Z" fill="#cfe0e3" stroke="${INK}" stroke-width="2" opacity="0.9"/><circle cx="-8" cy="-40" r="9" fill="#e8b04a" stroke="${INK}" stroke-width="1.5"/><circle cx="8" cy="-44" r="9" fill="#d9773a" stroke="${INK}" stroke-width="1.5"/><path d="M-8,-32 v-4 M8,-32 v-6" stroke="#4a6a3a" stroke-width="2"/>` },
    rail: { x: 470, y: 330, svg: `<path d="M0,0 L0,-70 L80,-40 L80,30" fill="none" stroke="#2d2a28" stroke-width="6" stroke-linejoin="round"/>` },
    mat: { x: 570, y: 334, svg: `<rect x="-50" y="-8" width="100" height="14" rx="3" fill="#8a6a3e" stroke="${INK}" stroke-width="2"/><path d="M-44,-2 h88" stroke="#6b4f2b" stroke-width="2" stroke-dasharray="4 3"/>` },
    lantern: { x: 660, y: 150, svg: `<path d="M0,0 v20" stroke="#2d2a28" stroke-width="3"/><path d="M-16,20 h32 l-4,40 h-24Z" fill="#f2d27a" stroke="#2d2a28" stroke-width="3" opacity="0.92"/><path d="M-18,60 h36 v6 h-36Z" fill="#2d2a28"/><path d="M-6,66 q2,10 0,16 M6,66 q-1,8 0,12" stroke="#f4ecd8" stroke-width="3"/>` },
    notice: { x: 330, y: 290, svg: `<path d="M-22,-24 L22,-26 L24,20 L4,22 L0,14 L-6,24 L-22,22Z" fill="#f4ecd6" stroke="${INK}" stroke-width="2"/><path d="M-14,-14 h28 M-14,-6 h24 M-14,2 h20" stroke="#8a7a62" stroke-width="2"/>` },
  };


  // ---------- your rooms upstairs (800 x 440) ----------
  // Containers are hit-boxes in scene coordinates; items are drawn centred on 0,0.
  const ROOM_SPOTS = {
    wardrobe: { x: 452, y: 40, w: 150, h: 340, label: 'Wardrobe', takes: ['hang', 'bag'] },
    shelf: { x: 618, y: 70, w: 166, h: 70, label: 'Shelf', takes: ['shelf'] },
    smalls: { x: 622, y: 196, w: 158, h: 50, label: 'Smalls', takes: ['smalls'] },
    woollens: { x: 622, y: 252, w: 158, h: 56, label: 'Woollens', takes: ['wool'] },
    linen: { x: 622, y: 314, w: 158, h: 58, label: 'Linen', takes: ['linen'] },
  };
  const ROOM_ITEMS = [
    { id: 'cardigan', cat: 'wool', x: 90, y: 262, svg: `<path d="M-34,-16 L34,-16 L38,16 L-38,16Z" fill="#8c76a3" stroke="${INK}" stroke-width="2"/><path d="M0,-16 V16 M-6,-6 h0.1 M-6,4 h0.1" stroke="${shade('#8c76a3', -0.3)}" stroke-width="3" stroke-linecap="round"/>` },
    { id: 'jumper', cat: 'wool', x: 196, y: 300, svg: `<path d="M-32,-14 L32,-14 L34,14 L-34,14Z" fill="#5f7a5a" stroke="${INK}" stroke-width="2"/><path d="M-32,-4 h66 M-33,6 h67" stroke="${shade('#5f7a5a', 0.25)}" stroke-width="2" stroke-dasharray="4 3"/>` },
    { id: 'stockings', cat: 'smalls', x: 300, y: 262, svg: `<ellipse cx="-10" cy="0" rx="14" ry="9" fill="#d9b29a" stroke="${INK}" stroke-width="2"/><ellipse cx="12" cy="2" rx="14" ry="9" fill="#cfa68e" stroke="${INK}" stroke-width="2"/>` },
    { id: 'gloves', cat: 'smalls', x: 360, y: 312, svg: `<path d="M-22,8 L-22,-8 L-14,-14 L-8,-6 L-8,8Z M2,8 L2,-8 L10,-14 L16,-6 L16,8Z" fill="#3a3a44" stroke="${INK}" stroke-width="2"/>` },
    { id: 'nightdress', cat: 'linen', x: 120, y: 340, svg: `<path d="M-36,-14 L36,-14 L38,14 L-38,14Z" fill="#f4efe4" stroke="${INK}" stroke-width="2"/><path d="M-10,-14 q10,8 20,0" stroke="#d8a0a8" stroke-width="2" fill="none"/>` },
    { id: 'pillowslips', cat: 'linen', x: 270, y: 346, svg: `<rect x="-34" y="-12" width="68" height="24" fill="#eef2f6" stroke="${INK}" stroke-width="2"/><path d="M-34,-4 h68" stroke="#9ab0c8" stroke-width="2"/>` },
    { id: 'dress', cat: 'hang', x: 180, y: 252, svg: `<path d="M0,-30 v6 M-10,-24 h20" stroke="${INK}" stroke-width="2"/><path d="M-12,-22 L12,-22 L22,26 L-22,26Z" fill="#2f4f6e" stroke="${INK}" stroke-width="2"/><path d="M-12,-8 h24" stroke="#c9a24e" stroke-width="2"/>` },
    { id: 'blouse', cat: 'hang', x: 390, y: 258, svg: `<path d="M0,-26 v6 M-10,-20 h20" stroke="${INK}" stroke-width="2"/><path d="M-14,-18 L14,-18 L18,16 L-18,16Z" fill="#f2e2d0" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="-6" r="1.6" fill="${INK}"/><circle cx="0" cy="4" r="1.6" fill="${INK}"/>` },
    { id: 'books', cat: 'shelf', x: 60, y: 318, svg: `<rect x="-22" y="-14" width="44" height="9" fill="#7a2e2e" stroke="${INK}" stroke-width="1.6"/><rect x="-20" y="-5" width="40" height="9" fill="#2f4f6a" stroke="${INK}" stroke-width="1.6"/><rect x="-24" y="4" width="48" height="9" fill="#4d6a3a" stroke="${INK}" stroke-width="1.6"/>` },
    { id: 'frame', cat: 'shelf', x: 330, y: 362, svg: `<rect x="-14" y="-18" width="28" height="34" fill="#c9a24e" stroke="${INK}" stroke-width="2"/><rect x="-9" y="-13" width="18" height="24" fill="#d8d0c0"/><circle cx="0" cy="-4" r="5" fill="#8a7a6a"/>` },
    { id: 'bag', cat: 'bag', x: 400, y: 356, svg: `<path d="M-30,16 L-26,-10 L26,-10 L30,16Z" fill="#7a3a2a" stroke="${INK}" stroke-width="2"/><path d="M-26,-2 h52 M-26,6 h52" stroke="#c9a24e" stroke-width="2" opacity="0.7"/><path d="M-10,-10 q10,-18 20,0" stroke="${INK}" stroke-width="3" fill="none"/>` },
  ];
  function bedroom() {
    let s = `<rect width="800" height="440" fill="#d9c9b3"/>`;
    for (let x = 0; x < 800; x += 26) s += `<path d="M${x},0 V400" stroke="#cbb89c" stroke-width="10" opacity="0.35"/>`;
    s += `<rect y="395" width="800" height="45" fill="#7a5235"/><path d="M0,395 H800" stroke="${INK}" stroke-width="2"/>`;
    // the window with its rain
    s += `<rect x="250" y="40" width="120" height="120" fill="#5f7080" stroke="#5a3a24" stroke-width="8"/><path d="M310,40 V160 M250,100 H370" stroke="#5a3a24" stroke-width="5"/>`;
    // the bed, quilt in squares
    s += `<rect x="16" y="200" width="32" height="200" fill="#6b4226" stroke="${INK}" stroke-width="2"/><rect x="24" y="226" width="410" height="40" fill="#efe6d6" stroke="${INK}" stroke-width="2"/>`;
    s += `<rect x="24" y="240" width="410" height="150" fill="#b56a5a" stroke="${INK}" stroke-width="2"/>`;
    for (let x = 24; x < 434; x += 41) for (let y = 240; y < 390; y += 37) s += `<rect x="${x}" y="${y}" width="41" height="37" fill="${(x + y) % 3 ? '#c27b6a' : '#d9a38e'}" opacity="0.55"/>`;
    s += `<rect x="424" y="230" width="22" height="170" fill="#6b4226" stroke="${INK}" stroke-width="2"/>`;
    // the wardrobe
    s += `<rect x="452" y="40" width="150" height="355" fill="#7a4a2a" stroke="${INK}" stroke-width="2.5"/><path d="M527,52 V384" stroke="${INK}" stroke-width="2"/>` +
      `<rect x="462" y="52" width="58" height="330" fill="none" stroke="#5a3418" stroke-width="2"/><rect x="534" y="52" width="58" height="330" fill="none" stroke="#5a3418" stroke-width="2"/>` +
      `<circle cx="518" cy="220" r="4" fill="#c9a24e"/><circle cx="536" cy="220" r="4" fill="#c9a24e"/>`;
    // the shelf and the chest of drawers
    s += `<rect x="618" y="132" width="166" height="10" fill="#7a4a2a" stroke="${INK}" stroke-width="2"/><path d="M630,142 l10,16 M772,142 l-10,16" stroke="#5a3418" stroke-width="4"/>`;
    s += `<rect x="616" y="190" width="170" height="205" fill="#8a5a36" stroke="${INK}" stroke-width="2.5"/>`;
    return s;
  }
  // one drawer of the chest; `ajar` leaves it sticking out
  function drawer(k, ajar) {
    const d = ROOM_SPOTS[k];
    const off = ajar ? 10 : 0;
    return `<g class="drawer${ajar ? ' ajar' : ''}" data-c="${k}" transform="translate(0,${off})"><rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="#9a6a42" stroke="${INK}" stroke-width="2"/>` +
      (ajar ? `<rect x="${d.x}" y="${d.y - 6}" width="${d.w}" height="6" fill="#4a2a14"/>` : '') +
      `<rect x="${d.x + d.w / 2 - 22}" y="${d.y + 6}" width="44" height="12" fill="#efe2c2" stroke="#8a6a2a" stroke-width="1"/>` +
      `<text x="${d.x + d.w / 2}" y="${d.y + 15.5}" text-anchor="middle" font-family="Special Elite, monospace" font-size="8.5" fill="#3a2a1c">${d.label.toUpperCase()}</text>` +
      `<circle cx="${d.x + d.w / 2 - 34}" cy="${d.y + d.h / 2 + 6}" r="4" fill="#c9a24e"/><circle cx="${d.x + d.w / 2 + 34}" cy="${d.y + d.h / 2 + 6}" r="4" fill="#c9a24e"/></g>`;
  }

  // ---------- the night letter ----------
  function kettle(steam) {
    return `<svg viewBox="0 0 300 260" class="kettle-svg"><path d="M60,240 Q50,140 150,130 Q250,140 240,240Z" fill="#b8bcc0" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M230,180 Q270,150 286,110" stroke="${INK}" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M230,180 Q270,150 286,110" stroke="#b8bcc0" stroke-width="11" fill="none" stroke-linecap="round"/>` +
      `<path d="M100,130 Q150,70 200,130" stroke="${INK}" stroke-width="8" fill="none"/><ellipse cx="150" cy="130" rx="30" ry="8" fill="#9ca0a5" stroke="${INK}" stroke-width="2"/>` +
      `<g class="steam" opacity="${Math.min(1, steam * 1.2).toFixed(2)}"><path d="M286,100 q-14,-20 0,-40 q14,-20 0,-40" stroke="#fff" stroke-width="8" fill="none" opacity="0.7" stroke-linecap="round"/><path d="M270,96 q-10,-16 4,-34" stroke="#fff" stroke-width="6" fill="none" opacity="0.5" stroke-linecap="round"/></g></svg>`;
  }

  // ---------- the village map (1000 x 640) ----------
  // Where each errand is, in map coordinates; the game puts its pins on these.
  const SPOTS = {
    post: [505, 352], stores: [588, 352], swan: [352, 452], forge: [236, 520], surgery: [660, 270],
    teashop: [742, 236], church: [828, 150], vicarage: [918, 238], manor: [868, 500], farm: [196, 150],
    out: [952, 448],
  };
  // How Beatrice walks there from the post office door, along the lanes.
  const DOOR = [505, 372];
  const ROUTES = {
    post: [DOOR],
    stores: [DOOR, [588, 372]],
    church: [DOOR, [560, 374], [640, 300], [690, 262], [760, 206], [812, 178]],
    surgery: [DOOR, [560, 374], [610, 318], [646, 292]],
    swan: [DOOR, [440, 374], [400, 420], [366, 452]],
    forge: [DOOR, [440, 374], [400, 420], [352, 460], [290, 500], [250, 526]],
    farm: [DOOR, [400, 372], [300, 380], [270, 310], [235, 230], [204, 172]],
    manor: [DOOR, [640, 368], [760, 380], [820, 440], [858, 486]],
  };
  // Beatrice on the map: her full-length figure (assets/who/full), feet on the spot
  function walker() {
    const h = 54, w = R(h / 3.279);
    return `<g class="walker"><ellipse cx="0" cy="1" rx="9" ry="3" fill="#3b2618" opacity="0.3"/>` +
      `<image href="assets/who/full/beatrice.webp" x="${R(-w / 2)}" y="${-h}" width="${w}" height="${h}"/></g>`;
  }
  function label(x, y, t, size) {
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Caveat, cursive" font-weight="700" font-size="${size || 21}" fill="#3b2618" stroke="#f1e4c4" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
  }
  // height / width of each map sprite, so a placement only needs a width
  const SPRITE = {barn: 0.782, bridge: 0.315, 'bush-a': 0.985, 'bush-b': 1.308, 'bush-d': 0.581, church: 1.124, compass: 0.865, cottage: 0.979, farm: 0.596, 'fir-a': 1.953, 'fir-b': 1.509, forge: 1.405, gate: 0.433, manor: 0.625, phonebox: 2.033, pillarbox: 2.28, pond: 0.587, post: 1.01, sack: 1.2, signpost: 1.518, stores: 0.895, surgery: 0.655, swan: 0.941, teashop: 1.419, 'tree-a': 1.235, 'tree-b': 1.176, 'tree-d': 1.125, 'tree-e': 1.16, 'tree-f': 1.167, 'tree-g': 1.111, vicarage: 0.658, wall: 0.667, well: 1.438};
  function villageMap() {
    let s = `<defs><radialGradient id="mapvig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3b2618" stop-opacity="0.35"/></radialGradient>` +
      `<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0,0 V8" stroke="#6f7f4a" stroke-width="1.4" opacity="0.5"/></pattern></defs>`;
    s += `<rect width="1000" height="640" fill="#efe1bd"/><image href="assets/map/parchment.jpg" width="1000" height="640" preserveAspectRatio="none"/>`;
    // the land, with a ragged edge
    s += `<path d="M30,40 Q200,18 380,34 T720,26 T972,44 Q986,200 974,330 T980,600 Q760,620 520,608 T40,612 Q22,450 30,300 T30,40Z" fill="#b9c58e" stroke="#7e8a54" stroke-width="2"/>`;
    // the hill and its fields, top left
    s += `<path d="M40,60 Q180,30 330,70 Q380,160 320,250 Q200,290 60,250Z" fill="#a7b67a"/>`;
    [[80, 70, 90, 60, '#c9c27a'], [176, 84, 80, 52, '#9fb06a'], [92, 156, 82, 60, '#b7a86a'], [270, 110, 60, 70, '#a9bb76']].forEach(([x, y, w, h, c]) =>
      { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" stroke="#7e8a54" stroke-width="1.5" transform="rotate(-6 ${x} ${y})"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)" transform="rotate(-6 ${x} ${y})"/>`; });
    for (let i = 0; i < 4; i++) s += `<path d="M${60 + i * 12},${248 - i * 30} Q190,${210 - i * 34} ${320 - i * 10},${244 - i * 30}" fill="none" stroke="#8c9a5c" stroke-width="1.2" opacity="0.6"/>`;
    // the river
    s += `<path d="M960,60 C880,120 900,250 800,300 C700,350 690,420 600,450 C500,480 470,560 380,600 L360,612" fill="none" stroke="#5f8aa0" stroke-width="26" stroke-linecap="round" opacity="0.9"/>`;
    s += `<path d="M960,60 C880,120 900,250 800,300 C700,350 690,420 600,450 C500,480 470,560 380,600 L360,612" fill="none" stroke="#9cc3d4" stroke-width="16" stroke-linecap="round"/>`;
    s += `<path d="M900,140 q10,8 4,18 M820,292 q14,4 18,14 M640,438 q12,6 10,16 M470,520 q10,8 2,18" stroke="#e6f1f5" stroke-width="2" fill="none"/>`;
    // the lanes
    const road = (d) => `<path d="${d}" fill="none" stroke="#9a7f56" stroke-width="18" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#e2cf9e" stroke-width="12" stroke-linecap="round"/>`;
    s += road('M60,388 C260,374 520,368 760,380 C860,386 930,396 975,402');            // High Street
    s += road('M560,374 C600,320 640,300 690,262 C740,226 780,196 812,176');            // Church Lane
    s += road('M440,374 C410,410 380,436 352,460 C310,494 270,512 236,528');            // Mill Lane
    s += road('M300,380 C280,320 250,260 220,200 C210,180 204,170 198,162');            // Ridge Lane
    s += road('M760,380 C790,420 820,452 862,488');                                       // the Manor drive
    s += road('M812,176 C850,190 890,212 918,236');                                       // to the vicarage
    // Everything standing on the land is one of her painted sprites (assets/map), drawn back
    // to front by where it stands. `at` is the middle of the sprite's foot, in map units.
    const things = [];
    const put = (name, x, y, w, o) => things.push({ name, x, y, w, o: o || {} });
    // trees, round the edges and between the lanes
    const TREES = ['tree-a', 'tree-b', 'tree-d', 'tree-e', 'tree-f', 'tree-g', 'fir-a', 'fir-b', 'bush-a', 'bush-b', 'bush-d'];
    [[120, 330, 13], [150, 318, 10], [420, 300, 12], [470, 280, 10], [600, 210, 13], [560, 240, 9],
      [960, 300, 12], [930, 330, 10], [700, 520, 13], [740, 560, 10], [960, 560, 14], [930, 590, 10],
      [120, 560, 14], [160, 590, 11], [70, 470, 12], [420, 560, 11], [520, 590, 9], [880, 90, 11],
      [740, 120, 12], [360, 220, 12], [330, 560, 10], [620, 560, 12], [930, 450, 10]].forEach(([x, y, r], i) => put(TREES[(i * 7) % TREES.length], x, y + r, r * 3.4));
    // the buildings
    put('church', 836, 204, 150);                 // St Jude's, its yard and lychgate
    put('manor', 870, 530, 172);
    put('farm', 162, 172, 96); put('barn', 246, 172, 74);
    put('post', 505, 374, 84); put('stores', 592, 372, 80);
    put('swan', 350, 478, 92); put('forge', 236, 550, 70);
    put('surgery', 664, 292, 88); put('teashop', 750, 254, 54); put('vicarage', 918, 262, 88);
    [[640, 436], [120, 432], [190, 476], [790, 376]].forEach(([x, y]) => put('cottage', x, y, 48));
    // bits of village life
    put('bridge', 702, 392, 70); put('well', 548, 456, 22); put('pond', 640, 186, 52); put('pillarbox', 470, 372, 12);
    put('phonebox', 300, 396, 14); put('gate', 300, 216, 42); put('wall', 96, 254, 44);
    put('signpost', 966, 452, 26); put('sack', 940, 452, 32);
    things.sort((a, b) => a.y - b.y);
    things.forEach(({ name, x, y, w }) => {
      const h = w * SPRITE[name];
      s += `<image href="assets/map/${name}.webp" x="${R(x - w / 2)}" y="${R(y - h)}" width="${w}" height="${R(h)}"/>`;
    });
    // who lives where: her portraits on little medallions beside their doors, as on her map
    [['arthur', 98, 148], ['jack', 414, 446], ['gladys', 650, 340], ['sam', 604, 300], ['penry', 978, 236],
      ['tom', 292, 522], ['edith', 796, 222], ['marion', 790, 552], ['wren', 948, 552], ['beatrice', 446, 346]].forEach(([k, x, y]) => {
      s += `<g transform="translate(${x},${y})"><circle r="18" fill="#f6ead0" stroke="${INK}" stroke-width="2"/><image href="assets/who/head/${k}.webp" x="-16" y="-16" width="32" height="32"/></g>`;
    });
    // the names
    s += label(505, 400, 'Post Office') + label(600, 400, 'Henderson’s', 18) + label(352, 498, 'The Black Swan') + label(236, 568, 'The Forge') +
      label(670, 314, 'The Surgery', 18) + label(762, 276, 'Tea Shop', 18) + label(752, 104, 'St Jude’s', 22) + label(930, 284, 'Vicarage', 18) +
      label(868, 548, 'The Manor') + label(205, 54, 'Hilltop Farm') + label(150, 380, 'High Street', 17) + label(624, 228, 'Church Lane', 15) +
      label(424, 414, 'Mill Lane', 15) + label(250, 262, 'Ridge Lane', 15) + label(710, 470, 'river Oak', 16);
    // the cartouche and the compass
    s += `<g transform="translate(500,40)"><rect x="-150" y="-24" width="300" height="46" rx="6" fill="#f6ead0" stroke="${INK}" stroke-width="2"/><rect x="-144" y="-18" width="288" height="34" rx="4" fill="none" stroke="#a4473a" stroke-width="1.2"/>` +
      `<text x="0" y="8" text-anchor="middle" font-family="IM Fell English, serif" font-size="24" fill="#3b2618">Oakhaven-under-Hill</text></g>`;
    s += `<image href="assets/map/compass.webp" x="22" y="514" width="96" height="${R(96 * SPRITE.compass)}"/>`;
    // the van for Nettleton calls at the end of the High Street
    s += label(952, 488, 'to Nettleton', 15);
    s += `<rect width="1000" height="640" fill="url(#mapvig)" pointer-events="none"/>`;
    return s;
  }

  return { bedroom, drawer, ROOM_SPOTS, ROOM_ITEMS, villageMap, SPOTS, ROUTES, walker, portrait, LOOKS, shade, bottle, stamp, tankard, tin, churn, book, hatbox, lost, tool, toolOutline, TOOLS, shelfScene, pegboard, churchyard, CHURCH_BITS, kettle };
})();
