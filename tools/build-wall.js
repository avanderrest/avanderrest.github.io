/* Builds the wall in index.html from wall/tiles.json.

       node tools/build-wall.js           check the wall, then rewrite #wall
       node tools/build-wall.js --check   check only; exit 1 if out of date

   The wall is a freeform hanging: tiles keep their DOM order but the page measures each
   one and packs them into the columns by height (main.js), so there is no band rule and
   no flush bottom edge to maintain. Each photograph is wrapped in a frame and a mat
   here, and given a stable frame style and hanging height from its own slug, so the
   wall is varied without anyone choosing a frame for every picture. Games are flat
   portrait posters: a 3:4 crop, a narrow paper margin, no moulding and no mat.

   The page stays static: the output is plain HTML committed with the rest, and the
   photographs and their frames work with JavaScript off (the packing is the only
   enhancement that needs it). Nothing is built at deploy time. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'wall', 'tiles.json');
const PARTIALS = path.join(ROOT, 'wall', 'partials');
const PAGE = path.join(ROOT, 'index.html');
const BEGIN = '<!-- wall:begin — generated from wall/tiles.json by tools/build-wall.js; edit those, not this -->';
const END = '<!-- wall:end -->';

// Frame styles, from style.css. Photographs get the run of the dark woods and teal;
// a large tile takes the walnut statement frame. Games are posters, not framed pictures.
const PHOTO_FRAMES = ['walnut', 'black', 'oak', 'teal'];

function load() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const tiles = [];
  for (const band of data.bands) for (const t of band.tiles) tiles.push(Object.assign({ band: band.band }, t));
  return { data, tiles };
}

// FNV-1a: the same slug gets the same frame and hang every build, and neighbouring
// photographs rarely match.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function frameFor(t) {
  const key = t.game || t.img || t.title || t.html || '';
  const hang = `hang-${hash('hang:' + key) % 4}`;
  if (t.game && !t.framed) return `poster ${hang}`;
  const frame = t.size === 'lg' ? 'walnut' : PHOTO_FRAMES[hash('frame:' + key) % PHOTO_FRAMES.length];
  return `frame-${frame} ${hang}`;
}

// Width and height in the markup reserve the picture's space before it loads, which both
// stops the wall moving as photographs arrive and lets the packing measure the real
// heights straight away.
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 1, 4) === 'PNG' && b.length >= 24) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  return null;
}

// A portrait poster in images/posters/<slug>.jpg replaces the landscape thumbnail on
// that game's tile; the poster already carries its title, so no caption is added.
function posterFor(game) {
  const rel = 'images/posters/' + game + '.jpg';
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
}

function check(tiles) {
  const problems = [];
  for (const t of tiles) {
    let file = null;
    if (t.game) {
      file = path.join('images', 'thumbs', t.game + '.jpg');
      if (!fs.existsSync(path.join(ROOT, t.game, 'index.html'))) problems.push(`no game folder ${t.game}/`);
      if (!fs.existsSync(path.join(ROOT, file))) problems.push(`no thumbnail ${file}`);
      const poster = posterFor(t.game);
      if (poster && !imageSize(path.join(ROOT, poster))) problems.push(`cannot read the size of ${poster}`);
    } else if (t.img) {
      file = t.img;
      if (!fs.existsSync(path.join(ROOT, file))) problems.push(`no image ${file}`);
    }
    if (file && !imageSize(path.join(ROOT, file))) problems.push(`cannot read the size of ${file}`);
    if (t.html && !fs.existsSync(path.join(PARTIALS, t.html + '.html'))) problems.push(`no partial wall/partials/${t.html}.html`);
    if (t.html) {
      // a partial carries its own size class; it has to agree with the size in tiles.json
      const cls = (fs.readFileSync(path.join(PARTIALS, t.html + '.html'), 'utf8').match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/);
      const inMarkup = cls.filter((c) => /^t-/.test(c)).map((c) => c.slice(2))[0];
      if (inMarkup !== t.size) problems.push(`wall/partials/${t.html}.html says t-${inMarkup || '(none)'} but tiles.json says ${t.size || '1x1'}`);
    }
  }
  return { problems };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// titles in the old markup used entities for curly quotes; keep text as written in the data
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// The picture is in the flow, not absolutely placed, so the frame takes the photograph's
// own shape; width and height carry the ratio until it loads.
function picture(file, alt) {
  const s = imageSize(path.join(ROOT, file));
  return `<img class="tile-bg" src="${esc(file)}" alt="${esc(alt)}" loading="lazy" width="${s.w}" height="${s.h}" />`;
}

function render(data) {
  const out = [BEGIN, ''];
  for (const band of data.bands) {
    out.push(`<!-- band ${band.band}${band.note ? ': ' + band.note : ''} -->`);
    for (const t of band.tiles) {
      const size = t.size ? ' t-' + t.size : '';
      const frame = t.game || t.img ? ' ' + frameFor(t) : '';
      if (t.html) {
        out.push(fs.readFileSync(path.join(PARTIALS, t.html + '.html'), 'utf8').replace(/\s+$/, ''));
      } else if (t.game) {
        const framed = t.framed === true;
        const poster = framed ? null : posterFor(t.game);
        const showCaption = !framed && t.caption !== false && !poster;
        const aria = showCaption ? '' : ` aria-label="${esc(t.title)}"`;
        const cls = framed ? 'tile-photo' : 'tile-game' + (poster ? ' has-poster' : '');
        out.push(
          `<a class="tile tile-img ${cls}${size}${frame}"${aria} href="${t.game}/index.html">`,
          `  <div class="tile-art"><div class="tile-window">`,
          `    ${picture(poster || 'images/thumbs/' + t.game + '.jpg', '')}`,
          ...(showCaption ? [`    <div class="tile-cap"><h3>${text(t.title)}</h3></div>`] : []),
          `  </div></div>`,
          `</a>`);
      } else {
        out.push(
          `<a class="tile tile-img tile-photo${size}${frame}${t.landscape ? ' landscape' : ''}" href="${esc(t.photo)}">`,
          `  <div class="tile-art"><div class="tile-window">`,
          `    ${picture(t.img, t.alt)}`,
          `  </div></div>`,
          `</a>`);
      }
      out.push('');
    }
  }
  out.push(END);
  return out.map((l) => (l ? l.split('\n').map((x) => (x ? '      ' + x : x)).join('\n') : l)).join('\n');
}

function splice(page, wall) {
  const a = page.indexOf(BEGIN), b = page.indexOf(END);
  if (a < 0 || b < 0) {
    // first run: replace everything inside <section id="wall">
    const open = page.indexOf('>', page.indexOf('id="wall"')) + 1;
    const close = page.indexOf('</section>', open);
    return page.slice(0, open) + '\n' + wall + '\n    ' + page.slice(close);
  }
  const lineStart = page.lastIndexOf('\n', a) + 1;
  return page.slice(0, lineStart) + wall + page.slice(b + END.length);
}

module.exports = { load, check, render };

if (require.main === module) {
  const { data, tiles } = load();
  const { problems } = check(tiles);
  console.log(`${tiles.length} tiles on the freeform wall.`);
  if (problems.length) {
    console.log('\nNot writing the wall:');
    for (const p of problems) console.log('  ' + p);
    process.exit(1);
  }
  const page = fs.readFileSync(PAGE, 'utf8');
  const next = splice(page, render(data));
  if (process.argv.includes('--check')) {
    if (next !== page) { console.log('\nindex.html is out of date: run node tools/build-wall.js'); process.exit(1); }
    console.log('index.html matches wall/tiles.json.');
  } else if (next === page) {
    console.log('index.html already up to date.');
  } else {
    fs.writeFileSync(PAGE, next);
    console.log('index.html rewritten.');
  }
}
