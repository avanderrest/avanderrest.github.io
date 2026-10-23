#!/usr/bin/env node
'use strict';

/* Check a prototype: its sim interface, the rules played in Node, determinism, and the
   real page in a headless browser.

     node tools/proto/check.js <slug>
     node tools/proto/check.js <slug> --no-browser     skip Chrome (fast, while writing)
     node tools/proto/check.js <slug> --seed 40        start from another seed
     npm run proto:check -- <slug>

   What it relies on is the interface only, never a schema:

     sim.js exports createGame({ seed, on }) -> {
       S        the live state, whatever shape the game needs
       actions() [{ id, label, note?, ok, why? }]   what can be done now
       act(id)  { ok, why? }                         do one
       step(dt)                                      run time forward (a no-op is fine)
       text()   one line of JSON summarising the run
     }

   Exit code 0 only if everything passed. Every problem line says what to change, so the
   model can read this output and fix exactly that. Nothing is written except two
   screenshots, _desktop.png and _phone.png, beside the prototype. */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const cdp = require('../cdp.js');

const PROTO = path.join(__dirname, 'prototypes');

const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const slug = words[0];
const flag = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const SKIP_BROWSER = Boolean(flag('no-browser', false));
const BASE_SEED = Number(flag('seed', 1)) || 1;

const problems = [];
const warnings = [];
let mapReady = false;
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

function usage() {
  console.error('usage: node tools/proto/check.js <slug> [--no-browser] [--seed N]');
  process.exit(2);
}

if (!slug) usage();
const dir = path.join(PROTO, slug);
if (!fs.existsSync(dir)) {
  console.error(`No prototype at tools/proto/prototypes/${slug}/.`);
  console.error(`Create one with: node tools/proto/new.js ${slug} "A Title" --shape economy`);
  process.exit(2);
}
for (const file of ['sim.js', 'view.js', 'index.html']) {
  if (!fs.existsSync(path.join(dir, file))) fail(`${file} is missing from the prototype folder`);
}

// ---------- the material behind it ----------
// A prototype is built from a brief. When the person gave a description and pictures, the
// brief still has to be written from them; these checks catch the two ways that gets
// skipped: a brief left empty, and a reference measured but never made into anything.
const briefPath = path.join(dir, 'BRIEF.md');
const brief = fs.existsSync(briefPath) ? fs.readFileSync(briefPath, 'utf8') : '';
const specPath = path.join(dir, 'SPEC.md');
const lookPath = path.join(dir, 'LOOK.md');
const hasSpec = fs.existsSync(specPath);
const hasLook = fs.existsSync(lookPath);

function emptyBriefFields(text) {
  const out = [];
  let section = '';
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+)/.exec(line);
    if (h) section = h[1].trim();
    // the colon is inside the bold in the template: "- **One line:** answer"
    const field = /^-\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line);
    if (field && !field[2].trim()) out.push(`${section}: ${field[1].trim().replace(/:$/, '')}`);
  }
  const assumptions = text.split(/^##\s*7\./m)[1] || '';
  const body = assumptions.split(/^\|\s*:?-{2,}/m)[1] || '';
  const rows = body
    .split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*\|/.test(l));
  if (!rows.length) out.push('7. Assumptions: no assumptions recorded');
  return out;
}

const shapeInBrief = (/^- \*\*Shape:\*\*\s*([a-z]+)/m.exec(brief) || [])[1] || null;

if (!brief) {
  fail('BRIEF.md is missing: the loop has to be written down before it is built');
} else if (brief.includes('{{TITLE}}')) {
  fail('BRIEF.md still has {{TITLE}} in it — this folder did not come from tools/proto/new.js');
} else {
  const empty = emptyBriefFields(brief);
  if (empty.length >= 8) {
    fail(`BRIEF.md is still mostly empty (${empty.length} fields): answer §1–6 before building; the brief is what the game is checked against`);
  } else if (empty.length) {
    warn(`BRIEF.md has ${empty.length} empty field${empty.length === 1 ? '' : 's'}: ${empty.slice(0, 6).join('; ')}${empty.length > 6 ? ' …' : ''}`);
  }
}

if (hasSpec && !hasLook) {
  console.log('  material: SPEC.md only (no reference images)');
} else if (hasLook) {
  const look = fs.readFileSync(lookPath, 'utf8');
  const refs = [...new Set([...look.matchAll(/`(refs\/[^`]+)`/g)].map((m) => m[1]))];
  const missing = refs.filter((r) => !fs.existsSync(path.join(dir, r)));
  if (missing.length) fail(`LOOK.md points at files that are not there: ${missing.join(', ')}`);
  else console.log(`  material: ${hasSpec ? 'SPEC.md + ' : ''}${refs.length} reference file${refs.length === 1 ? '' : 's'}`);
}

// ---------- the interface ----------
function mulberry32(a) {
  let x = a | 0;
  return function () {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inspect(game) {
  if (!game || typeof game !== 'object') {
    fail('createGame() must return the game object: { S, actions, act, step, text }');
    return false;
  }
  if (!game.S || typeof game.S !== 'object') fail('the game object has no S (the live state)');
  for (const name of ['actions', 'act', 'step', 'text']) {
    if (typeof game[name] !== 'function') fail(`the game object has no ${name}() — the page and the checker both call it`);
  }
  return problems.length === 0;
}

function play(createGame, seed, botSeed) {
  const pick = mulberry32(botSeed);
  const endings = [];
  const sim = createGame({ seed, on: (event, data) => { if (event === 'ending') endings.push(data); } });
  const trace = [];
  const counts = {};
  const labels = {};
  const offered = new Set();
  const tried = new Set();
  let acts = 0;
  let steps = 0;
  let stuck = null;
  let lastText = sim.text();
  let same = 0;

  while (!sim.S.over && acts < 4000 && steps < 20000) {
    let list;
    try {
      list = sim.actions();
    } catch (err) {
      stuck = `actions() threw: ${err.message}`;
      break;
    }
    if (!Array.isArray(list)) {
      stuck = 'actions() must return an array';
      break;
    }
    const seen = new Set();
    for (const a of list) {
      if (!a || typeof a.id !== 'string' || !a.id) {
        stuck = 'every action from actions() needs an id';
        break;
      }
      if (seen.has(a.id)) {
        stuck = `actions() returned "${a.id}" more than once; ids must be unique`;
        break;
      }
      seen.add(a.id);
      labels[a.id] = a.label || a.id;
      if (a.ok) offered.add(a.id);
    }
    if (stuck) break;

    const ok = list.filter((a) => a && a.ok);
    let choice = null;
    if (ok.length) {
      // every verb it is offered gets tried at least once, then it settles into a seeded
      // shuffle that avoids repeating the same verb
      const untried = ok.filter((a) => !tried.has(a.id));
      if (untried.length) {
        choice = untried[Math.floor(pick() * untried.length)];
      } else {
        const last = trace[trace.length - 1];
        const fresh = ok.length > 1 ? ok.filter((a) => a.id !== last) : ok;
        choice = fresh[Math.floor(pick() * fresh.length)];
      }
    }

    if (choice) {
      let r;
      try {
        r = sim.act(choice.id);
      } catch (err) {
        stuck = `act("${choice.id}") threw: ${err.message}`;
        break;
      }
      if (!r || typeof r !== 'object' || (r.ok !== true && r.ok !== false)) {
        stuck = `act("${choice.id}") must return { ok: true } or { ok: false, why }`;
        break;
      }
      if (r.ok === false) {
        stuck = `actions() offered "${choice.id}" as possible, then act() refused it: ${r.why || 'no reason given'}`;
        break;
      }
      trace.push(choice.id);
      tried.add(choice.id);
      counts[choice.id] = (counts[choice.id] || 0) + 1;
      acts += 1;
    }

    try {
      sim.step(choice ? 0.05 : 0.25);
    } catch (err) {
      stuck = `step() threw: ${err.message}`;
      break;
    }
    steps += 1;

    let text;
    try {
      text = sim.text();
    } catch (err) {
      stuck = `text() threw: ${err.message}`;
      break;
    }
    if (typeof text !== 'string') {
      stuck = 'text() must return a string (one line of JSON is enough)';
      break;
    }
    if (text === lastText) same += 1;
    else {
      lastText = text;
      same = 0;
    }
    if (same > 1500) {
      stuck = 'nothing changed for a long time with no action available: the run is stuck';
      break;
    }
  }

  return { sim, trace, counts, labels, offered, endings, acts, steps, stuck, text: lastText };
}

function report(run) {
  const over = run.sim.S.over;
  const ended = over ? `ended "${over.name || over.id}"${over.win ? ' (win)' : ''}` : 'never ended';
  const did = Object.entries(run.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id}×${n}`)
    .join(', ') || 'nothing';
  return `${ended} · ${run.acts} actions, ${run.steps} steps\n      ${did}\n      ${run.text.slice(0, 220)}`;
}

// ---------- the map and its knobs ----------
function inspectMap(map, game) {
  if (!map) {
    warn('no MAP export: the Graph button will be hidden; a prototype should draw its loop');
    return;
  }
  const nodes = map.nodes;
  if (!Array.isArray(nodes) || !nodes.length) {
    fail('MAP.nodes must be a non-empty array');
    return;
  }
  const ids = new Set();
  const kinds = new Set(['phase', 'action', 'state', 'ending']);
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) {
      fail('every MAP node needs an id');
      return;
    }
    if (ids.has(n.id)) fail(`MAP has two nodes with id "${n.id}"`);
    ids.add(n.id);
    if (n.kind && !kinds.has(n.kind)) {
      warn(`MAP node "${n.id}" has an unknown kind "${n.kind}" (phase, action, state, ending)`);
    }
    if (n.col != null && typeof n.col !== 'number') warn(`MAP node "${n.id}" has a non-number col`);
  }
  for (const e of map.edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      fail(`MAP edge ${e.from} -> ${e.to} points at a node that is not there`);
    }
  }
  if (!nodes.some((n) => n.kind === 'ending')) warn('MAP has no ending node');

  if (map.editable) {
    const phaseNodes = new Map(nodes.filter((n) => n.kind === 'phase').map((n) => [n.id, n]));
    for (const n of nodes.filter((n) => n.kind === 'action')) {
      if (!n.action) fail(`editable MAP action "${n.id}" needs an action id, or its edits cannot reach the rules`);
      const phase = phaseNodes.get(n.phase);
      if (!phase) {
        fail(`editable MAP action "${n.id}" has phase "${n.phase}", which is not a phase node`);
      } else if (n.col != null && n.col !== phase.col) {
        warn(`editable MAP action "${n.id}" sits in col ${n.col} but its phase is in col ${phase.col}`);
      }
    }
  }

  if (game && typeof game.knobs === 'function') {
    let knobs;
    try {
      knobs = game.knobs();
    } catch (err) {
      fail(`knobs() threw: ${err.message}`);
      return;
    }
    if (!Array.isArray(knobs)) {
      fail('knobs() must return an array');
      return;
    }
    knobs.forEach((k, i) => {
      if (!k || typeof k.id !== 'string' || !k.id) {
        fail(`knob ${i} needs an id`);
        return;
      }
      if (typeof k.set !== 'function') fail(`knob "${k.id}" needs set(value)`);
      if (typeof k.value !== 'number') fail(`knob "${k.id}" needs a numeric value`);
      if (!(typeof k.min === 'number' && typeof k.max === 'number' && k.min < k.max)) {
        fail(`knob "${k.id}" needs numeric min < max`);
      }
    });
    if (knobs.length && !problems.length) console.log(`  knobs: ${knobs.length} live number${knobs.length === 1 ? '' : 's'}`);
  }
}

// ---------- the page ----------
async function checkPage() {
  const logs = [];
  const page = await cdp.open({
    path: `/tools/proto/prototypes/${slug}/`,
    size: [1400, 900],
    log: (m) => logs.push(String(m)),
  });
  try {
    const first = await page.eval(`
      const g = window.__game;
      if (!g) return { pass: false, detail: 'window.__game is missing; view.js must call startPrototype() or expose()' };
      const buttons = [...document.querySelectorAll('.pf-action')];
      if (!buttons.length) return { pass: false, detail: 'no .pf-action button on the first screen; view.js must render one per action' };
      const enabled = buttons.filter((b) => !b.disabled);
      if (!enabled.length) return { pass: false, detail: 'every .pf-action is disabled at the start; there is nothing the player can do. ' + g.text() };
      const before = g.text();
      enabled[0].click();
      await new Promise((r) => setTimeout(r, 120));
      const after = g.text();
      const parts = [...enabled[0].querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean);
      return { pass: true, detail: { buttons: buttons.length, first: parts.join(' — ') || enabled[0].textContent.trim(), changed: before !== after, state: after } };
    `);
    if (!first || !first.pass) fail(`page: ${first ? first.detail : 'the page returned nothing'}`);
    else {
      process.stdout.write(`  first click: ${first.detail.first} → ${first.detail.changed ? 'state changed' : 'NOTHING CHANGED'}\n`);
      if (!first.detail.changed) fail('page: clicking an action changed nothing — the button is not wired to the game');
    }

    if (mapReady) {
      const graph = await page.eval(`
        const btn = document.getElementById('pf-graph');
        if (!btn) return { pass: false, detail: 'the Graph button is missing from the page shell' };
        if (btn.hidden) return { pass: false, detail: 'MAP is exported but the Graph button is hidden' };
        btn.click();
        await new Promise((r) => setTimeout(r, 150));
        const box = document.getElementById('pf-graphbox');
        const svg = box ? box.querySelector('svg') : null;
        const nodes = svg ? svg.querySelectorAll('.pf-gnode').length : 0;
        const sliders = box ? box.querySelectorAll('input[type="range"]').length : 0;
        const edit = document.getElementById('pf-graph-edit');
        let rows = 0;
        if (edit && !edit.hidden) {
          edit.click();
          await new Promise((r) => setTimeout(r, 80));
          rows = document.querySelectorAll('.pf-edit-row').length;
        }
        const open = Boolean(box && box.open);
        if (box) box.close();
        return { pass: open && nodes > 0 && (!edit || edit.hidden || rows > 0), detail: { open, nodes, sliders, rows } };
      `);
      if (!graph || !graph.pass) {
        fail(`page: ${graph ? graph.detail : 'the graph check returned nothing'}`);
      } else {
        console.log(
          `  graph: ${graph.detail.nodes} nodes, ${graph.detail.sliders} live number${graph.detail.sliders === 1 ? '' : 's'}` +
            (graph.detail.rows ? `, ${graph.detail.rows} editable rows` : '')
        );
      }
    }

    await page.shot(path.join(dir, '_desktop.png'));

    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.sleep(400);
    const phone = await page.eval('return { scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth };');
    await page.shot(path.join(dir, '_phone.png'));
    if (phone && phone.scrollWidth > phone.width + 1) {
      fail(`page: sideways scroll on a phone (${phone.scrollWidth}px in ${phone.width}px); the layout must fit one column`);
    }

    const errors = logs.filter((m) => m.startsWith('page error') || m.startsWith('page console error'));
    for (const m of errors) fail(`page: ${m}`);
    for (const m of logs.filter((x) => !errors.includes(x))) warn(`page: ${m}`);
  } finally {
    await page.close();
  }
}

// ---------- run ----------
(async () => {
  console.log(`checking tools/proto/prototypes/${slug}/`);

  let createGame = null;
  let map = null;
  try {
    const mod = await import(pathToFileURL(path.join(dir, 'sim.js')).href);
    createGame = mod.createGame;
    map = mod.MAP || null;
  } catch (err) {
    fail(`sim.js would not load: ${err.message}`);
  }
  if (!problems.length && typeof createGame !== 'function') {
    fail('sim.js must export createGame({ seed, on })');
  }

  let trial = null;
  if (createGame) {
    try {
      trial = createGame({ seed: BASE_SEED });
    } catch (err) {
      fail(`createGame() threw: ${err.message}`);
    }
    if (trial) inspect(trial);
  }
  if (trial && !problems.length) {
    inspectMap(map, trial);
    mapReady = Boolean(map) && !problems.length;
  }

  if (trial && !problems.length) {
    const seeds = [BASE_SEED, BASE_SEED + 1, BASE_SEED + 2];
    const offered = new Set();
    const used = new Set();
    const labels = {};
    for (const seed of seeds) {
      let run = null;
      try {
        run = play(createGame, seed, seed * 7919);
      } catch (err) {
        fail(`seed ${seed}: the rules threw: ${err.message}`);
        continue;
      }
      for (const id of run.offered) offered.add(id);
      for (const id of Object.keys(run.counts)) used.add(id);
      Object.assign(labels, run.labels);
      if (run.endings.length > 1) {
        warn(`seed ${seed}: ${run.endings.length} endings fired (${run.endings.map((e) => e && e.id).join(', ')}); the first one should be the only one`);
      }
      if (run.endings.length && !run.sim.S.over) {
        fail(`seed ${seed}: on('ending') fired but S.over is still empty; set S.over before you announce the ending`);
      }
      if (run.sim.S.over && !run.endings.length) {
        warn(`seed ${seed}: S.over is set but on('ending') never fired; the page will not show the card`);
      }
      if (run.stuck) {
        fail(`seed ${seed}: ${run.stuck}`);
        console.log(`      ${report(run)}`);
        continue;
      }
      if (!run.sim.S.over) {
        warn(`seed ${seed}: no ending was reached (${run.acts} actions, ${run.steps} steps); fine for a sandbox, but a flow prototype should end`);
      }
      console.log(`  seed ${seed}: ${report(run)}`);
    }

    if (offered.size) {
      const never = [...offered].filter((id) => !used.has(id));
      console.log(`  verbs: ${used.size}/${offered.size} offered verbs used across the seeds`);
      if (never.length) {
        warn(`${never.length} verb${never.length === 1 ? ' was' : 's were'} offered but never taken in any seed: ${never.join(', ')} — check what blocks ${never.length === 1 ? 'it' : 'them'}`);
      }
    }

    // the template's own words are the easiest thing to leave in
    if (shapeInBrief) {
      const tmplPath = path.join(__dirname, 'template', shapeInBrief, 'sim.js');
      if (fs.existsSync(tmplPath)) {
        const tmpl = fs.readFileSync(tmplPath, 'utf8');
        const tmplLabels = new Set([...tmpl.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]));
        const left = [...new Set(Object.values(labels).filter((l) => tmplLabels.has(l)))];
        if (left.length) {
          warn(`the ${shapeInBrief} template's words are still in the game: ${left.map((l) => `"${l}"`).join(', ')} — replace every label with the game's own`);
        }
      }
    }

    // the same seed is the same run
    try {
      const a = play(createGame, BASE_SEED, 4242);
      const b = play(createGame, BASE_SEED, 4242);
      if (a.trace.join() !== b.trace.join() || a.text !== b.text) {
        fail('the same seed played twice gave different runs; all randomness must come from the seed in createGame');
      } else {
        console.log('  same seed: same run');
      }
    } catch (err) {
      fail(`determinism check threw: ${err.message}`);
    }
  }

  if (!SKIP_BROWSER && !problems.length) {
    const before = problems.length;
    try {
      await checkPage();
      if (problems.length === before) {
        console.log('  page: loaded, one click worked, no console errors');
        console.log('  shots: _desktop.png, _phone.png');
      }
    } catch (err) {
      warn(`browser check skipped or failed: ${err.message}`);
    }
  }

  console.log('');
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const p of problems) console.log(`FAIL  ${p}`);

  if (problems.length) {
    console.log('');
    console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}. Fix exactly these, then run:`);
    console.log(`  node tools/proto/check.js ${slug}`);
    process.exit(1);
  }
  console.log(`ok    ${slug} plays: the rules and their ending${SKIP_BROWSER ? ' (browser not checked)' : ', the page, and the phone layout'}.`);
  process.exit(0);
})().catch((err) => {
  console.error('the checker itself failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
