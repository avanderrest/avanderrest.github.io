#!/usr/bin/env node
'use strict';

/* Start a flow prototype: copy one shape's rule file and view, plus the shared shell,
   into tools/proto/prototypes/<slug>/ and put the title in.

     node tools/proto/new.js night-bus "The Night Bus" --shape economy
     node tools/proto/new.js the-locked-garden "The Locked Garden" --shape puzzle
     npm run proto:new -- night-bus "The Night Bus" --shape arcade

   Or start from a description and some pictures, with no interview:

     node tools/proto/new.js --spec ideas/night-cafe.md --ref refs/street.png --ref refs/stall.jpg

   Then the slug and title come from the description's first heading (or --slug/--title),
   the shape is guessed from the words in it (or --shape), the description is copied to
   SPEC.md, the images to refs/, and refs/look.json + LOOK.md hold the palette measured from
   them. BRIEF.md is still the file the model fills in — it just fills it from the material
   instead of asking for it.

   Shapes are the folders under tools/proto/template/ that do not start with an underscore:
   each is a small, playable game with its own state and verbs, not a set of numbers in a
   fixed schema. Pick the one closest to the game; the model replaces its rules.

   Refuses to overwrite. Nothing the page needs is generated at run time. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TEMPLATE = path.join(__dirname, 'template');
const SHARED = path.join(TEMPLATE, '_shared');
const PROTOTYPES = path.join(__dirname, 'prototypes');
const TEXT = new Set(['.html', '.js', '.css', '.md', '.json']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const SHAPE_INFO = {
  economy: 'resources, costs, a clock, upkeep — shops, farms, stalls',
  puzzle: 'a board or levels, discrete moves, a budget — marble-run, the-wizards-muddle',
  arcade: 'real time, lives, a score — wizz-delivery, toy-racers',
  story: 'scenes, choices, what is carried — lantern-deep, wayside',
};

// Words that point at the material a game is made of. A description that says "market",
// "rent" and "customer" is an economy even if it never uses the word; one that says
// "board" and "move" is a puzzle. The score is only a suggestion — --shape overrides it.
const SHAPE_WORDS = {
  economy: [
    'money', 'buy', 'sell', 'sells', 'sold', 'price', 'prices', 'rent', 'debt', 'loan', 'loans',
    'cost', 'costs', 'stock', 'ingredient', 'ingredients', 'customer', 'customers', 'market',
    'shop', 'stall', 'trade', 'profit', 'budget', 'wage', 'wages', 'supply', 'supplies', 'cook',
    'cooks', 'cooking', 'recipe', 'recipes', 'serve', 'serves', 'pay', 'pays', 'paid', 'earn',
    'earns', 'income', 'vendor', 'vendors', 'afford', 'upkeep', 'interest', 'lender', 'lenders',
  ],
  puzzle: [
    'puzzle', 'board', 'tile', 'tiles', 'grid', 'move', 'moves', 'rotate', 'slide', 'lock',
    'locked', 'key', 'keys', 'level', 'levels', 'solve', 'path', 'match', 'switch', 'mechanism',
    'layout', 'piece', 'pieces', 'step', 'steps',
  ],
  arcade: [
    'dodge', 'lane', 'lanes', 'jump', 'shoot', 'score', 'lives', 'reflex', 'wave', 'waves',
    'enemy', 'enemies', 'combo', 'fast', 'run', 'runs', 'crash', 'timing', 'twitch', 'dash',
    'avoid', 'hazard', 'hazards', 'speed',
  ],
  story: [
    'choice', 'choices', 'dialogue', 'conversation', 'scene', 'scenes', 'mystery', 'investigate',
    'character', 'characters', 'relationship', 'trust', 'secret', 'secrets', 'ending', 'endings',
    'story', 'talk', 'decide', 'decision', 'remember', 'memory', 'rumour', 'rumours', 'rumor',
    'rumors', 'whodunit',
  ],
};

const shapesOnDisk = fs
  .readdirSync(TEMPLATE, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name);

// ---------- arguments ----------
const argv = process.argv.slice(2);
let shape = null;
let specPath = null;
let titleFlag = null;
let slugFlag = null;
const refArgs = [];
const words = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const valueOf = (name) => {
    if (a === '--' + name) return argv[++i];
    if (a.startsWith('--' + name + '=')) return a.slice(name.length + 3);
    return null;
  };
  const sp = valueOf('spec');
  if (sp != null) { specPath = sp; continue; }
  const ti = valueOf('title');
  if (ti != null) { titleFlag = ti; continue; }
  const sl = valueOf('slug');
  if (sl != null) { slugFlag = sl; continue; }
  const rf = valueOf('ref');
  if (rf != null) { refArgs.push(rf); continue; }
  const sh = valueOf('shape');
  if (sh != null) { shape = sh; continue; }
  if (a.startsWith('--')) continue;
  words.push(a);
}

function usage() {
  console.error('usage: node tools/proto/new.js <slug> "<Display Title>" --shape <shape>');
  console.error('       node tools/proto/new.js --spec <description.md> [--ref <image> ...] [--shape <shape>]');
  console.error('');
  console.error('shapes:');
  for (const name of shapesOnDisk) console.error(`  ${name.padEnd(10)} ${SHAPE_INFO[name] || ''}`);
  console.error('');
  console.error('  e.g. node tools/proto/new.js night-bus "The Night Bus" --shape economy');
  console.error('       node tools/proto/new.js --spec notes/night-cafe.md --ref refs/street.png');
  process.exit(2);
}

// ---------- reading the description ----------
const spec = specPath ? readSpec(specPath) : null;

function readSpec(file) {
  if (!fs.existsSync(file)) {
    console.error(`No description at ${file}.`);
    process.exit(2);
  }
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) {
    console.error(`${file} is empty; there is nothing to build from.`);
    process.exit(2);
  }
  return text.replace(/\r\n/g, '\n');
}

function firstHeading(text) {
  const m = /^#\s+(.+)$/m.exec(text);
  return m ? m[1].trim().replace(/[*_`]/g, '') : '';
}

function firstLines(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/^[#>*\-–—\d.\s|]+/, '').trim())
    .find((l) => l.length > 8) || '';
}

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 3)
    .join('-');
}

function shapeWords(text) {
  const scores = {};
  const hits = {};
  const lower = text.toLowerCase();
  for (const [name, list] of Object.entries(SHAPE_WORDS)) {
    let score = 0;
    const found = [];
    for (const word of list) {
      const re = new RegExp(`\\b${word}(?:s|es)?\\b`, 'gi');
      const n = (lower.match(re) || []).length;
      if (n) {
        score += n;
        found.push(`${word}×${n}`);
      }
    }
    scores[name] = score;
    hits[name] = found;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { shape: ranked[0][1] > 0 ? ranked[0][0] : 'economy', scores, hits, ranked };
}

const guess = spec ? shapeWords(spec) : null;
if (!shape && guess) shape = guess.shape;
if (!shape && spec) shape = 'economy';

const specTitle = spec ? firstHeading(spec) || firstLines(spec).slice(0, 60) : '';
let slug = slugFlag || words[0] || (specTitle ? slugify(specTitle) : '');
let title = words.slice(1).join(' ').trim() || titleFlag || specTitle;

if (!slug) {
  console.error('No slug. Give one as the first argument, or a --spec with a heading to take it from.');
  usage();
}
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`"${slug}" is not a slug. Use lower-case words joined by hyphens, e.g. "the-locked-garden".`);
  process.exit(2);
}
if (!shape) {
  console.error('Pick a shape with --shape. The shape decides what the game is made of:');
  usage();
}
if (!shapesOnDisk.includes(shape)) {
  console.error(`There is no shape "${shape}".`);
  usage();
}

const name = title || slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const dest = path.join(PROTOTYPES, slug);
if (fs.existsSync(dest)) {
  console.error(`tools/proto/prototypes/${slug}/ already exists. Pick another slug, or delete that folder first.`);
  process.exit(2);
}

// ---------- the refs ----------
function expandRefs(list) {
  const out = [];
  for (const item of list) {
    if (!fs.existsSync(item)) {
      console.error(`No image at ${item}.`);
      process.exit(2);
    }
    const st = fs.statSync(item);
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(item, { withFileTypes: true })) {
        if (entry.isFile() && IMAGE.has(path.extname(entry.name).toLowerCase())) {
          out.push(path.join(item, entry.name));
        }
      }
    } else if (IMAGE.has(path.extname(item).toLowerCase())) {
      out.push(item);
    } else {
      console.error(`${item} is not an image this tool reads (.png .jpg .jpeg .webp .gif).`);
      process.exit(2);
    }
  }
  // the same picture pasted twice is still one reference
  const seen = new Set();
  return out.filter((file) => {
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}

// ---------- copy ----------
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const out = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copy(src, out);
      continue;
    }
    let text = fs.readFileSync(src, 'utf8');
    if (TEXT.has(path.extname(src).toLowerCase())) text = text.replaceAll('{{TITLE}}', name);
    fs.writeFileSync(out, text);
  }
}

fs.mkdirSync(PROTOTYPES, { recursive: true });
copy(SHARED, dest);
copy(path.join(TEMPLATE, shape), dest);
// The prototype's modules are ES modules, and the nearest package.json decides how Node
// reads them. Without this, Node warns when check.js imports sim.js.
fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n');

const refFiles = expandRefs(refArgs);
if (refFiles.length) {
  const refDir = path.join(dest, 'refs');
  fs.mkdirSync(refDir, { recursive: true });
  const taken = new Set();
  const copied = [];
  for (const file of refFiles) {
    const base = path.basename(file);
    let outName = base;
    let n = 2;
    while (taken.has(outName.toLowerCase())) {
      outName = `${path.basename(base, path.extname(base))}-${n++}${path.extname(base)}`;
    }
    taken.add(outName.toLowerCase());
    fs.copyFileSync(file, path.join(refDir, outName));
    copied.push(path.join('refs', outName).replace(/\\/g, '/'));
  }
  const look = measureRefs(copied, dest);
  fs.writeFileSync(path.join(dest, 'LOOK.md'), lookMarkdown(look));
}

if (spec) {
  fs.writeFileSync(
    path.join(dest, 'SPEC.md'),
    '<!-- The description the person gave, verbatim. Read it before BRIEF.md. -->\n\n' +
      spec.trim() + '\n'
  );

  const briefPath = path.join(dest, 'BRIEF.md');
  let brief = fs.readFileSync(briefPath, 'utf8');
  brief = brief.replace(
    'The answers from the interview, in order, as they are given. Write each answer here, then\nbuild from this file, not from memory. It is not shown to the player.',
    'The brief, built from the material the person gave. Write each answer here, then build from\nthis file, not from memory. It is not shown to the player.'
  );
  brief = brief.replace(
    '- **Shape:** economy / puzzle / arcade / story',
    `- **Shape:** ${shape}${guess ? ` (guessed from the description: ${guess.ranked.map(([n, s]) => `${n} ${s}`).join(', ')})` : ''}`
  );
  brief = brief.replace(
    '## 0. What kind of game this is',
    'Built from material, not an interview. `SPEC.md` is the person\'s description verbatim' +
      (refFiles.length ? '; `LOOK.md` is the palette measured from the reference images.' : '.') +
      '\nFill §1–6 from those, and mark anything you had to invent **(assumed)**.\n\n' +
      '## 0. What kind of game this is'
  );
  brief = brief.trimEnd() + '\n\n' + assumptionsSection() + '\n';
  fs.writeFileSync(briefPath, brief);
}

function assumptionsSection() {
  return `## 7. Assumptions

Every place the description was silent and you had to choose. An assumption is fine; an
unmarked one is how a prototype ends up testing something else.

| What you assumed | Why | What would change it |
| --- | --- | --- |
| | | |`;
}

// ---------- measuring the refs ----------
function python() {
  const candidates = [process.env.PYTHON, 'python', 'python3'].filter(Boolean);
  for (const exe of candidates) {
    const probe = spawnSync(exe, ['-c', 'import PIL'], { stdio: 'ignore' });
    if (probe.status === 0) return exe;
  }
  return null;
}

function measureRefs(files, base) {
  const exe = python();
  const look = { images: [] };
  if (!exe) {
    console.warn('warn  no Python with Pillow: the references are copied but not measured.');
    for (const file of files) look.images.push({ file, error: 'not measured (no Python + Pillow)' });
    return look;
  }
  const args = [path.join(__dirname, 'look.py'), ...files.map((f) => path.join(base, f)), '--swatches', path.join(base, 'refs')];
  const run = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (run.status !== 0) {
    console.warn('warn  look.py failed; the references are copied but not measured.');
    if (run.stderr) console.warn(run.stderr.trim());
    for (const file of files) look.images.push({ file, error: 'not measured (look.py failed)' });
    return look;
  }
  try {
    const measured = JSON.parse(run.stdout);
    for (const img of measured.images || []) {
      img.file = path.relative(base, path.resolve(base, img.file)).replace(/\\/g, '/');
      if (img.swatch) img.swatch = path.relative(base, path.resolve(base, img.swatch)).replace(/\\/g, '/');
      look.images.push(img);
    }
  } catch (err) {
    console.warn(`warn  look.py returned something that is not JSON: ${err.message}`);
    for (const file of files) look.images.push({ file, error: 'not measured (bad JSON)' });
  }
  return look;
}

function pct(n) {
  return Math.round(n * 100) + '%';
}

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tokens(img) {
  const pal = (img.palette || []).slice();
  if (!pal.length) return null;
  const sorted = pal.slice().sort((a, b) => lum(a.hex) - lum(b.hex));
  const bg = sorted[0];
  const panel = sorted[1] || sorted[0];
  const ink = sorted[sorted.length - 1];
  const accent = (img.accents || [])[0] || pal.slice().sort((a, b) => b.saturation - a.saturation)[0];
  return { bg: bg.hex, panel: panel.hex, ink: ink.hex, accent: accent.hex };
}

function lookMarkdown(look) {
  const lines = [
    '# Look — measured from the reference images',
    '',
    'These are references, not assets: nothing here is copied into the game. Borrow the',
    'palette, the light and the shapes; do not redraw the picture, and do not try to match its',
    'layout — the prototype is a flow, not a painting. The swatch strips are there so the',
    'measurement can be checked by eye.',
    '',
    'Fill in "what to copy, what to invent" before writing `view.js`; the numbers below say',
    'what the picture is made of, not what the game should be.',
    '',
  ];
  for (const img of look.images) {
    lines.push(`## \`${img.file}\``, '');
    if (img.error) {
      lines.push(`- not measured: ${img.error}`, '');
      continue;
    }
    const mood = img.brightness < 0.3 ? 'dark' : img.brightness > 0.65 ? 'bright' : 'mid-tone';
    const heat = img.saturation < 0.2 ? 'near-monochrome' : img.saturation > 0.45 ? 'strongly coloured' : 'muted';
    lines.push(
      `- **${img.width}×${img.height}**, brightness ${pct(img.brightness)}, saturation ${pct(img.saturation)} — ${mood} and ${heat}.`
    );
    lines.push(
      `- **Palette** (by area): ${(img.palette || []).map((c) => `\`${c.hex}\` ${pct(c.share)}`).join(', ')}`
    );
    if (img.accents && img.accents.length) {
      lines.push(`- **Loud colours** (bright and saturated): ${img.accents.map((c) => `\`${c.hex}\``).join(', ')}`);
    }
    if (img.regions) {
      lines.push(
        `- **Regions**: top \`${img.regions.top}\`, centre \`${img.regions.centre}\`, bottom \`${img.regions.bottom}\`, ` +
          `left \`${img.regions['mid-left']}\`, right \`${img.regions['mid-right']}\``
      );
    }
    if (img.swatch) lines.push(`- swatch: \`${img.swatch}\``);
    const t = tokens(img);
    if (t) {
      lines.push(
        '',
        'Suggested starting tokens (rename them to the prototype\'s own names):',
        '```css',
        ':root {',
        `  --look-bg: ${t.bg};`,
        `  --look-panel: ${t.panel};`,
        `  --look-ink: ${t.ink};`,
        `  --look-accent: ${t.accent};`,
        '}',
        '```'
      );
    }
    lines.push('');
  }
  lines.push(
    '## What to copy, what to invent',
    '',
    '- **Light:**',
    '- **Palette:**',
    '- **Shapes and silhouettes:**',
    '- **What the game must not copy:** (the reference\'s layout, its words, its exact art)',
    ''
  );
  return lines.join('\n');
}

// ---------- done ----------
const rel = `tools/proto/prototypes/${slug}`;
console.log(`Created ${rel}/  (${shape}: ${SHAPE_INFO[shape] || ''})`);
if (guess) {
  console.log(
    `  shape guessed from the description: ${guess.ranked.map(([n, s]) => `${n} ${s}`).join(', ')}` +
      `${shape === guess.shape ? '' : ` (overridden to ${shape})`}`
  );
}
console.log('');
console.log('  BRIEF.md    the answers — fill these from the material, not from a conversation');
if (spec) console.log('  SPEC.md     the description given, verbatim');
console.log('  sim.js      the rules for this shape — the file to rewrite');
console.log('  view.js     how this shape draws itself (keep .pf-action and expose)');
console.log('  ui.js       the shared shell: buttons, log, clock, ending card');
console.log('  index.html  the page shell');
console.log('  style.css   the prototype palette and layout');
if (refFiles.length) console.log('  refs/       the reference images, measured into LOOK.md');
console.log('');
console.log('Serve the repo first (npm run serve), then open:');
console.log(`  http://localhost:8010/${rel}/`);
console.log('');
console.log('Check it any time with:');
console.log(`  node tools/proto/check.js ${slug}`);
console.log('');
console.log(`Next: read tools/proto/GUIDE.md${spec ? ' (the "given material" path)' : ''}, then tools/proto/shapes/${shape}.md.`);
