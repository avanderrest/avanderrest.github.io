/* The test runner for this repo.

   Nothing to install and nothing to build — the deployed site stays exactly as it was.
   This serves the repo on a free port, drives one headless Chrome over the DevTools
   protocol, and evaluates each case inside the real page. A case is a file that ends by
   returning JSON.stringify({ pass, detail }).

   One folder per project, named after its folder in the repo: a case for furrow/ lives
   in test/furrow/ and runs against /furrow/. You normally want one at a time.

       node test/run.js furrow              every case for furrow
       node test/run.js furrow growth       just test/furrow/growth.js
       node test/run.js                     everything, every project

   Exit code is 0 only if every case passed and the page logged no errors.

   To cover another project: make test/<slug>/, drop in a case, and drive it through the
   debug handle that game already puts on window.

   Two kinds of case:
     <name>.js        evaluated inside the real page (the original kind)
     <name>.node.js   an ES module run here in Node, for a game's sim.js: it imports the sim
                      directly, plays it at full speed with no browser, and its default export
                      returns { pass, detail }. Thousands of simulated turns take milliseconds.

   After a project's page cases the runner takes screenshots into test/_shots/<slug>/
   (desktop.png at 1400x900, phone.png at 390x844, tablet.png at 820x1180 and
   tablet-wide.png at 1368x912 (a Surface Pro), the last three with touch on) and runs three built-in cases:
   `phone`, at phone width the page must not scroll sideways; `tablet` and `tablet-wide`,
   every visible control must be at least 40px for a finger (stretched or blurry pictures
   are listed in the detail, not failed). Look at the shots after a visual change.
   --no-shots skips both; --shots does only them (node test/run.js furrow --shots).
   test/wall/ runs against the wall itself (/). */
'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
// flags (--shots, --no-shots) can go anywhere; the first two other words are project and case
const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const only = (words[0] || '').replace(/[\\/]+$/, '');
const caseFilter = words[1] || '';
const SHOTS = !process.argv.includes('--no-shots');
const SHOTS_ONLY = process.argv.includes('--shots');
const SHOT_DIR = path.join(__dirname, '_shots');
const urlFor = (slug) => (slug === 'wall' ? '/' : `/${slug}/`);

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each subfolder of test/ is a project, and its name is the folder it exercises.
// A leading underscore means "not a suite" — see test/_salvage/, which holds old
// scratchpad scripts that are not cases and must not be evaluated in a page.
function suites() {
  return fs.readdirSync(__dirname, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((slug) => !only || slug === only)
    .sort()
    .map((slug) => ({
      slug,
      cases: fs.readdirSync(path.join(__dirname, slug))
        .filter((f) => f.endsWith('.js') && !f.endsWith('.node.js') && f.includes(caseFilter))
        .sort(),
      nodeCases: fs.readdirSync(path.join(__dirname, slug))
        .filter((f) => f.endsWith('.node.js') && f.includes(caseFilter))
        .sort(),
    }))
    .map((s) => (SHOTS_ONLY ? Object.assign(s, { cases: [], nodeCases: [] }) : s))
    .filter((s) => SHOTS_ONLY || s.cases.length || s.nodeCases.length);
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    let file = path.join(ROOT, rel || 'index.html');
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// A websocket client, because the repo has no dependencies and this is not worth one.
function openWs(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': 13,
      },
    });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const api = { onmessage: null };
      let buf = Buffer.alloc(0);
      socket.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          if (buf.length < 2) return;
          const len0 = buf[1] & 127;
          let off = 2, len = len0;
          if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len).toString('utf8');
          buf = buf.slice(off + len);
          if (api.onmessage) api.onmessage(payload);
        }
      });
      api.send = (str) => {
        const data = Buffer.from(str, 'utf8');
        const mask = crypto.randomBytes(4);
        let head;
        if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
        else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
        const masked = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        socket.write(Buffer.concat([head, mask, masked]));
      };
      api.close = () => { try { socket.destroy(); } catch (e) { /* already gone */ } };
      resolve(api);
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const found = suites();
  if (!found.length) {
    const all = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_')).map((d) => d.name);
    console.error(only
      ? `No cases for ${JSON.stringify(only)}. Projects with tests: ${all.join(', ') || 'none yet'}`
      : 'No cases found under test/.');
    process.exit(2);
  }

  const exe = CHROMES.find((p) => { try { return p && fs.existsSync(p); } catch (e) { return false; } });
  if (!exe) { console.error('No Chrome or Edge found. Add its path to CHROMES in test/run.js.'); process.exit(2); }

  const server = await serve();
  const port = server.address().port;
  const cdpPort = 9200 + Math.floor(Math.random() * 600);
  const profile = path.join(os.tmpdir(), 'profile-test-' + cdpPort);
  const chrome = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1400,900', '--hide-scrollbars',
    // nobody clicks in a case, so without this every AudioContext stays suspended with
    // its clock at 0 — and anything scheduled off that clock (backing-band's looper) stalls
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' });

  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: cdpPort, path: p }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });

  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try { wsUrl = (await getJSON('/json/version')).webSocketDebuggerUrl; } catch (e) { await sleep(250); }
  }
  if (!wsUrl) { console.error('Chrome never came up on the debugging port.'); chrome.kill(); server.close(); process.exit(2); }

  const ws = await openWs(wsUrl);
  let id = 0, sessionId = null;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails;
      logs.push((e.exception && e.exception.description) || e.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      logs.push(m.params.args.map((a) => (a.value !== undefined ? a.value : a.description || a.type)).join(' '));
    }
  };
  const send = (method, params, useSession) => new Promise((res) => {
    const msg = { id: ++id, method, params: params || {} };
    if (useSession && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res);
    ws.send(JSON.stringify(msg));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  sessionId = (await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true })).result.sessionId;
  await send('Runtime.enable', {}, true);
  await send('Page.enable', {}, true);

  const results = [];
  const record = (out, label) => {
    results.push(out);
    console.log(`  ${out.pass ? 'PASS' : 'FAIL'}  ${label}` + (out.secs !== undefined ? `  (${out.secs.toFixed(1)}s)` : ''));
    console.log(`        ${out.detail}`);
  };
  for (const suite of found) {
    console.log('\n' + suite.slug);
    for (const file of suite.nodeCases) {
      const label = file.replace(/\.js$/, '');
      const started = Date.now();
      let out;
      try {
        const mod = await import(pathToFileURL(path.join(__dirname, suite.slug, file)).href);
        out = await mod.default();
        if (!out || typeof out.pass !== 'boolean') out = { pass: false, detail: 'returned ' + JSON.stringify(out) };
      } catch (e) { out = { pass: false, detail: 'threw: ' + ((e && e.stack) || e) }; }
      out.name = suite.slug + '/' + label;
      out.secs = (Date.now() - started) / 1000;
      record(out, label);
    }
    if (!suite.cases.length && !SHOTS) continue;
    // the cases play deeper into a game than a fresh load does, so watch the pictures it
    // paints while they run (drawWatch, below) and list any blown up or out of shape
    const watch = await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + drawWatch.toString() + ')();' }, true);
    await send('Page.navigate', { url: `http://127.0.0.1:${port}${urlFor(suite.slug)}` }, true);
    await sleep(2500);
    if (watch.result) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: watch.result.identifier }, true);
    for (const file of suite.cases) {
      const src = fs.readFileSync(path.join(__dirname, suite.slug, file), 'utf8');
      const label = file.replace(/\.js$/, '');
      const started = Date.now();
      const r = await send('Runtime.evaluate', {
        expression: '(async () => { try {\n' + src + '\n} catch (e) { return JSON.stringify({ pass: false, detail: "threw: " + (e && e.stack || e) }); } })()',
        returnByValue: true, awaitPromise: true,
      }, true);
      const raw = r.result && r.result.result && r.result.result.value;
      let out;
      try { out = JSON.parse(raw); } catch (e) { out = { pass: false, detail: 'no result: ' + JSON.stringify(raw) }; }
      out.name = suite.slug + '/' + label;
      out.secs = (Date.now() - started) / 1000;
      record(out, label);
      if (!out.pass) {
        // a game's handle can describe itself; print that next to a failure
        const t = await send('Runtime.evaluate', {
          expression: '(() => { try { return window.__game && window.__game.text ? String(window.__game.text()) : ""; } catch (e) { return ""; } })()',
          returnByValue: true,
        }, true);
        const txt = t.result && t.result.result && t.result.result.value;
        if (txt) console.log('        state: ' + txt.slice(0, 600));
      }
    }
    if (suite.cases.length) {
      const pr = await send('Runtime.evaluate', { expression: '(' + picturesSeen.toString() + ')()', returnByValue: true }, true);
      const list = (pr.result && pr.result.result && pr.result.result.value) || [];
      // a note, not a case: replacing a picture is a job for new art, not a code fix
      if (list.length) console.log('  note  pictures while the cases ran:\n' + list.map((l) => '        ' + l).join('\n'));
    }
    if (SHOTS) await shotsAndPhone(suite.slug);
  }

  // Runs in the page: drawWatch's findings, worst first.
  function picturesSeen() {
    const out = [];
    for (const [src, r] of Object.entries(window.__drawSeen || {})) {
      if (r.up > 1.25) out.push([r.up, src + ' blown up ' + r.up.toFixed(2) + 'x (' + r.w + 'x' + r.h + ')']);
      if (r.skew > 1.04) out.push([r.skew, src + ' stretched ' + Math.round(r.skew * 100) + '%']);
    }
    return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  async function shotsAndPhone(slug) {
    const dir = path.join(SHOT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' }, true);
      if (r.result && r.result.data) fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64'));
    };
    // The cases have left the game in whatever state they finished in (a fallen keep, a
    // finished day). The shots are of what a new player sees, so forget all of it first.
    // This is the runner's own throwaway browser profile, never anyone's real saves.
    // A game that saves on unload writes its state back as the old page goes, so clearing
    // storage from outside races it. Instead the next document empties storage itself,
    // before any of the game's own scripts run, and the hook is removed straight after.
    const fresh = async (extra) => {
      const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}' + (extra || '') }, true);
      await send('Page.navigate', { url: `http://127.0.0.1:${port}${urlFor(slug)}` }, true);
      await sleep(2500);
      if (hook.result) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.result.identifier }, true);
    };
    await fresh();
    await shot('desktop.png');
    // the phone pass: a fresh load at phone size, then the one check every page must pass
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, true);
    await send('Emulation.setTouchEmulationEnabled', { enabled: true }, true);
    await fresh();
    const r = await send('Runtime.evaluate', { expression: '(' + phoneCheck.toString() + ')()', returnByValue: true }, true);
    let out;
    try { out = JSON.parse(r.result.result.value); } catch (e) { out = { pass: false, detail: 'phone check did not run' }; }
    out.name = slug + '/phone';
    record(out, 'phone');
    await shot('phone.png');
    // the tablet pass: an iPad held upright, touch only, then the same page turned on its
    // side. Every visible control must be big enough for a finger, and no picture may be
    // stretched out of shape or blown up past its pixels.
    for (const [w, h, name] of [[820, 1180, 'tablet'], [1368, 912, 'tablet-wide']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }, true);
      await fresh(';(' + drawWatch.toString() + ')();');
      const t = await send('Runtime.evaluate', { expression: '(' + touchCheck.toString() + ')()', returnByValue: true, awaitPromise: true }, true);
      let res;
      try { res = JSON.parse(t.result.result.value); } catch (e) { res = { pass: false, detail: 'touch check did not run' }; }
      res.name = slug + '/' + name;
      record(res, name);
      await shot(name + '.png');
    }
    await send('Emulation.setTouchEmulationEnabled', { enabled: false }, true);
    await send('Emulation.clearDeviceMetricsOverride', {}, true);
  }

  // Runs in the page before any of its scripts. Most art here is painted onto a canvas,
  // where no <img> shows its size, so this wraps drawImage and keeps, for each picture
  // file, the most it was ever blown up (css px per picture px, so a 2x screen does not
  // count against it) and the most it was squashed out of shape. Pixel art drawn with
  // smoothing off is meant to be blown up, and is left out.
  function drawWatch() {
    const seen = (window.__drawSeen = {});
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
      try {
        const src = img && (img.currentSrc || img.src);
        if (src && this.imageSmoothingEnabled !== false && this.canvas.clientWidth) {
          const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
          let sw = nw, sh = nh, dw = nw, dh = nh;
          if (a.length === 4) { dw = a[2]; dh = a[3]; }
          if (a.length === 8) { sw = a[2]; sh = a[3]; dw = a[6]; dh = a[7]; }
          const m = this.getTransform();
          const toCss = this.canvas.clientWidth / this.canvas.width;
          const sx = Math.abs(dw / sw) * Math.hypot(m.a, m.b) * toCss;
          const sy = Math.abs(dh / sh) * Math.hypot(m.c, m.d) * toCss;
          if (sw > 4 && sh > 4 && isFinite(sx) && isFinite(sy)) {
            const k = src.replace(location.origin, '').replace(/^\//, '');
            const r = seen[k] || (seen[k] = { up: 0, skew: 1, w: nw, h: nh });
            r.up = Math.max(r.up, sx, sy);
            const q = sx > sy ? sx / sy : sy / sx;
            if (q > r.skew) r.skew = q;
          }
        }
      } catch (e) { /* never break the page */ }
      return orig.call(this, img, ...a);
    };
  }

  // Runs in the page, at tablet size with touch on. A tap target under MIN css px on either
  // side fails (Apple asks for 44pt, Google 48dp; 40 leaves room for a hairline border).
  // Pictures are only reported, never failed: a stretched or blurry one goes on the list in
  // notes/testing notes/ to be replaced, which is a job for new art rather than code.
  async function touchCheck() {
    const MIN = 40;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
      ((e.textContent || '').trim() ? ' "' + e.textContent.trim().slice(0, 14) + '"' : '');
    const shown = (e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) return null;
      for (let p = e; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return null;
      }
      const s = getComputedStyle(e);
      if (s.pointerEvents === 'none') return null;
      return b;
    };
    // a link inside running text is fine small; a link standing alone is a button
    const inText = (e) => e.tagName === 'A' && /^(P|LI|SPAN|EM|SMALL)$/.test(e.parentElement.tagName) &&
      e.parentElement.textContent.trim().length > e.textContent.trim().length + 12;
    const small = [];
    for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [tabindex="0"]')) {
      const b = shown(e);
      if (!b || inText(e)) continue;
      // a checkbox or radio is usually inside its label, and the label is the target
      const tgt = (e.type === 'checkbox' || e.type === 'radio') && e.closest('label') ? e.closest('label').getBoundingClientRect() : b;
      // a page that grows a target invisibly (a ::before past the edges) says so in --touch-hit
      const hit = 2 * (parseFloat(getComputedStyle(e).getPropertyValue('--touch-hit')) || 0);
      // a slider is dragged sideways, so only its length counts
      const tall = e.type === 'range' ? MIN : tgt.height + hit;
      if (tgt.width + hit < MIN - 0.5 || tall < MIN - 0.5) small.push(name(e) + ' ' + Math.round(tgt.width) + 'x' + Math.round(tgt.height));
    }
    const pics = [];
    // css px per picture px: past this a picture looks soft even on a plain screen, and on a
    // 2x tablet it is visibly blurry
    const UP = 1.25;
    for (const im of document.querySelectorAll('img')) {
      const b = shown(im);
      if (!b || !im.naturalWidth) continue;
      const fit = getComputedStyle(im).objectFit;
      const skew = (b.width / b.height) / (im.naturalWidth / im.naturalHeight);
      if (fit === 'fill' && Math.abs(skew - 1) > 0.04) pics.push(im.getAttribute('src') + ' stretched ' + Math.round(skew * 100) + '%');
      const up = Math.max(b.width / im.naturalWidth, b.height / im.naturalHeight);
      if (up > UP) pics.push(im.getAttribute('src') + ' blown up ' + up.toFixed(2) + 'x (' + im.naturalWidth + 'x' + im.naturalHeight + ' shown ' + Math.round(b.width) + 'x' + Math.round(b.height) + ')');
    }
    for (const [src, r] of Object.entries(window.__drawSeen || {})) {
      if (r.up > UP) pics.push(src + ' blown up ' + r.up.toFixed(2) + 'x on canvas (' + r.w + 'x' + r.h + ')');
      if (r.skew > 1.04) pics.push(src + ' stretched ' + Math.round(r.skew * 100) + '% on canvas');
    }
    // painted rooms and plates set as a CSS background: work out the size the picture is
    // drawn at from background-size (cover, contain, auto or lengths) and the element's box
    const natural = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = url; });
    const bgSeen = new Set();
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e);
      const m = /url\("?([^")]+)"?\)/.exec(s.backgroundImage);
      if (!m || /^data:|\.svg(\?|$)/.test(m[1]) || s.backgroundRepeat.startsWith('repeat ') || s.backgroundRepeat === 'repeat') continue;
      const b = shown(e);
      if (!b || b.width < 40 || b.height < 40) continue;
      const nat = await natural(m[1]);
      if (!nat || !nat[0]) continue;
      const [nw, nh] = nat;
      const size = s.backgroundSize.split(',')[0].trim().split(/\s+/);
      let w = nw, h = nh;
      if (size[0] === 'cover' || size[0] === 'contain') {
        const k = (size[0] === 'cover' ? Math.max : Math.min)(b.width / nw, b.height / nh);
        w = nw * k; h = nh * k;
      } else if (size[0] !== 'auto' || (size[1] && size[1] !== 'auto')) {
        const len = (v, box) => (v.endsWith('%') ? parseFloat(v) / 100 * box : parseFloat(v));
        const sw = size[0] === 'auto' ? null : len(size[0], b.width);
        const sh = !size[1] || size[1] === 'auto' ? null : len(size[1], b.height);
        w = sw != null ? sw : (sh != null ? sh * nw / nh : nw);
        h = sh != null ? sh : w * nh / nw;
      }
      const k = m[1].replace(location.origin, '').replace(/^\//, '');
      const up = Math.max(w / nw, h / nh), skew = Math.max((w / nw) / (h / nh), (h / nh) / (w / nw));
      const key = k + Math.round(up * 20);
      if (bgSeen.has(key)) continue;
      bgSeen.add(key);
      if (up > UP) pics.push(k + ' blown up ' + up.toFixed(2) + 'x as a background (' + nw + 'x' + nh + ' on ' + Math.round(b.width) + 'x' + Math.round(b.height) + ')');
      if (skew > 1.04) pics.push(k + ' stretched ' + Math.round(skew * 100) + '% as a background');
    }
    const detail = (coarse ? '' : 'pointer is not coarse! ') +
      (small.length ? small.length + ' tap targets under ' + MIN + 'px: ' + small.slice(0, 8).join(', ') + (small.length > 8 ? ', ...' : '') : 'every tap target is at least ' + MIN + 'px') +
      (pics.length ? ' | pictures: ' + pics.slice(0, 12).join('; ') : '');
    return JSON.stringify({ pass: !small.length, detail });
  }

  // Runs in the page. At phone width nothing may push the page sideways; a failure names
  // the elements sticking out past the right edge, so it says what to fix.
  function phoneCheck() {
    const w = window.innerWidth;
    const over = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - w;
    if (over <= 1) return JSON.stringify({ pass: true, detail: 'no sideways scroll at ' + w + 'px' });
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '');
    const wide = [...document.body.querySelectorAll('*')]
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > w + 1 && getComputedStyle(e).position !== 'fixed'; })
      .filter((e, i, all) => !all.some((p) => p !== e && p.contains(e)))
      .slice(0, 4).map((e) => name(e) + ' (right edge ' + Math.round(e.getBoundingClientRect().right) + ')');
    return JSON.stringify({ pass: false, detail: 'page is ' + over + 'px wider than a ' + w + 'px phone: ' + wide.join(', ') });
  }

  if (logs.length) {
    console.log('\nThe page logged errors:');
    for (const l of logs.slice(0, 10)) console.log('  ' + l);
  }

  ws.close(); chrome.kill(); server.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} cases passed` + (logs.length ? ', and the page logged errors.' : '.'));
  process.exit(failed.length || logs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
