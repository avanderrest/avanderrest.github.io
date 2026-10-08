/* Builds the wall in index.html from wall/tiles.json.

       node tools/build-wall.js           check the layout, then rewrite #wall
       node tools/build-wall.js --check   check only; exit 1 if ragged or out of date

   The wall is a CSS grid with grid-auto-flow: dense, so whether its bottom edge comes out
   flush depends on the order and size of every tile. Instead of a rule of thumb, this
   places the tiles exactly the way the browser does (dense auto-placement, one tile at a
   time, earliest slot that fits) at 2, 4, 6 and 12 columns, and refuses to write a wall
   that leaves a hole at any of them. test/wall/ runs the same check and then measures the
   real page.

   The page stays static: the output is plain HTML committed with the rest, so the photo
   tiles work with JavaScript off and nothing is built at deploy time. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'wall', 'tiles.json');
const PARTIALS = path.join(ROOT, 'wall', 'partials');
const PAGE = path.join(ROOT, 'index.html');
const BEGIN = '<!-- wall:begin — generated from wall/tiles.json by tools/build-wall.js; edit those, not this -->';
const END = '<!-- wall:end -->';
const COLUMNS = [2, 4, 6, 12];   // 720px, 1080px, 1400px, 3200px and up (style.css)
// Holes at these counts block a write. Two columns is reported but not enforced: the
// forecast is 2x3 there (the full width), which makes the cell count odd, so the last row
// of the two-column wall has always had one empty cell.
const STRICT = [4, 6, 12];

// How many columns and rows a tile covers at a given column count, mirroring style.css.
// `col` pins a tile to a column (the forecast sits in the last one from four up).
function span(size, cols) {
  switch (size) {
    case undefined: case null: return { w: 1, h: 1 };
    case 'wide': return { w: 2, h: 1 };
    case 'wide3': return { w: cols === 2 ? 2 : 3, h: 1 };
    case '3': return { w: 2, h: 1 };
    case 'tall': return { w: 1, h: 2 };
    case 'lg': return { w: 2, h: 2 };
    case 'full': return { w: cols, h: cols === 2 ? 3 : 2 };
    case 'wx': return cols === 2 ? { w: 2, h: 3 } : { w: 1, h: 3, col: cols - 1 };
    default: throw new Error('unknown tile size ' + JSON.stringify(size));
  }
}

function load() {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const tiles = [];
  for (const band of data.bands) for (const t of band.tiles) tiles.push(Object.assign({ band: band.band }, t));
  return { data, tiles };
}

// CSS grid dense auto-placement: each item goes in the first slot, scanning rows from the
// top and columns left to right, where its whole area is free.
function place(tiles, cols) {
  const grid = [];   // grid[row][col] = tile index or undefined
  const free = (r, c, w, h) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (grid[y] && grid[y][x] !== undefined) return false;
    return true;
  };
  const spots = tiles.map((t, i) => {
    const s = span(t.size, cols);
    for (let r = 0; ; r++) {
      const cs = s.col !== undefined ? [s.col] : Array.from({ length: cols - s.w + 1 }, (_, k) => k);
      for (const c of cs) {
        if (!free(r, c, s.w, s.h)) continue;
        for (let y = r; y < r + s.h; y++) { grid[y] = grid[y] || []; for (let x = c; x < c + s.w; x++) grid[y][x] = i; }
        return { r, c, w: s.w, h: s.h };
      }
    }
  });
  const holes = [];
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < cols; x++) if (!grid[y] || grid[y][x] === undefined) holes.push({ row: y + 1, col: x + 1 });
  return { rows: grid.length, holes, spots };
}

function check(tiles) {
  const cells = tiles.reduce((n, t) => { const s = span(t.size, 4); return n + s.w * s.h; }, 0);
  const layouts = COLUMNS.map((cols) => Object.assign({ cols }, place(tiles, cols)));
  const problems = [], warnings = [];
  for (const l of layouts) {
    for (const h of l.holes) {
      const list = STRICT.includes(l.cols) ? problems : warnings;
      // name the tile just before the hole in reading order, so the fix has somewhere to start
      const before = l.spots.map((s, i) => ({ s, i })).filter(({ s }) => s.r * 100 + s.c < (h.row - 1) * 100 + (h.col - 1)).pop();
      const t = before ? tiles[before.i] : null;
      list.push(`${l.cols} columns: hole at row ${h.row}, column ${h.col}` +
        (t ? ` (after "${t.title || t.html}" in band ${t.band})` : ''));
    }
  }
  for (const t of tiles) {
    if (t.html && !fs.existsSync(path.join(PARTIALS, t.html + '.html'))) problems.push(`no partial wall/partials/${t.html}.html`);
    if (t.game && !fs.existsSync(path.join(ROOT, t.game, 'index.html'))) problems.push(`no game folder ${t.game}/`);
    if (t.game && !fs.existsSync(path.join(ROOT, 'images', 'thumbs', t.game + '.jpg'))) problems.push(`no thumbnail images/thumbs/${t.game}.jpg`);
    if (t.img && !fs.existsSync(path.join(ROOT, t.img))) problems.push(`no image ${t.img}`);
    if (t.html) {
      // a partial carries its own size class; it has to agree with the size in tiles.json
      const cls = (fs.readFileSync(path.join(PARTIALS, t.html + '.html'), 'utf8').match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/);
      const inMarkup = cls.filter((c) => /^t-/.test(c)).map((c) => c.slice(2))[0];
      if (inMarkup !== t.size) problems.push(`wall/partials/${t.html}.html says t-${inMarkup || '(none)'} but tiles.json says ${t.size || '1x1'}`);
    }
  }
  return { cells, layouts, problems, warnings };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// titles in the old markup used entities for curly quotes; keep text as written in the data
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(data) {
  const out = [BEGIN, ''];
  for (const band of data.bands) {
    out.push(`<!-- band ${band.band}${band.note ? ': ' + band.note : ''} -->`);
    for (const t of band.tiles) {
      const size = t.size ? ' t-' + t.size : '';
      if (t.html) {
        out.push(fs.readFileSync(path.join(PARTIALS, t.html + '.html'), 'utf8').replace(/\s+$/, ''));
      } else if (t.game) {
        out.push(
          `<a class="tile tile-img tile-game${size}" href="${t.game}/index.html">`,
          `  <img class="tile-bg" src="images/thumbs/${t.game}.jpg" alt="" loading="lazy" />`,
          `  <div class="tile-overlay">`,
          `    <h3>${text(t.title)}</h3>`,
          `  </div>`,
          `</a>`);
      } else {
        out.push(
          `<a class="tile tile-img${size}" href="${esc(t.photo)}">`,
          `  <img class="tile-bg" src="${esc(t.img)}" alt="${esc(t.alt)}" loading="lazy" />`,
          `  <div class="tile-overlay">`,
          `    <h3>${text(t.title)}</h3>`,
          `    <span>${text(t.label || 'Photo journal')}</span>`,
          `  </div>`,
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

module.exports = { load, place, check, render, span, COLUMNS, STRICT };

if (require.main === module) {
  const { data, tiles } = load();
  const { cells, layouts, problems, warnings } = check(tiles);
  console.log(`${tiles.length} tiles, ${cells} cells at four columns.`);
  for (const l of layouts) console.log(`  ${String(l.cols).padStart(2)} columns: ${l.rows} rows, ${l.holes.length ? l.holes.length + ' hole(s)' : 'flush'}`);
  for (const w of warnings) console.log('  allowed: ' + w);
  if (problems.length) {
    console.log('\nNot writing the wall:');
    for (const p of problems) console.log('  ' + p);
    console.log('\nResize or reorder tiles in the band named above. A 1x1 tile is 1 cell, wide 2, tall 2, lg 4.');
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
