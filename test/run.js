/* The test runner for this repo.

   Nothing to install and nothing to build — the deployed site stays exactly as it was.
   This serves the repo on a free port, drives one headless Chrome over the DevTools
   protocol, and evaluates each case inside the real page. A case is a file that ends by
   returning JSON.stringify({ pass, detail }).

   One folder per project, named after its folder in the repo: a case for furrow/ lives
   in test/furrow/ and runs against /furrow/. You normally want one at a time.

       node test/run.js furrow              every case for furrow
       node test/run.js furrow gather       just test/furrow/gather.js
       node test/run.js                     everything, every project

   Exit code is 0 only if every case passed and the page logged no errors.

   To cover another project: make test/<slug>/, drop in a case, and drive it through the
   debug handle that game already puts on window. */
'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const only = (process.argv[2] || '').replace(/[\\/]+$/, '');
const caseFilter = process.argv[3] || '';

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
        .filter((f) => f.endsWith('.js') && f.includes(caseFilter))
        .sort(),
    }))
    .filter((s) => s.cases.length);
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
      .filter((d) => d.isDirectory()).map((d) => d.name);
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
  for (const suite of found) {
    console.log('\n' + suite.slug);
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/${suite.slug}/` }, true);
    await sleep(2500);
    for (const file of suite.cases) {
      const src = fs.readFileSync(path.join(__dirname, suite.slug, file), 'utf8');
      const label = file.replace(/\.js$/, '');
      const started = Date.now();
      const r = await send('Runtime.evaluate', {
        expression: '(() => { try {\n' + src + '\n} catch (e) { return JSON.stringify({ pass: false, detail: "threw: " + (e && e.stack || e) }); } })()',
        returnByValue: true, awaitPromise: true,
      }, true);
      const raw = r.result && r.result.result && r.result.result.value;
      let out;
      try { out = JSON.parse(raw); } catch (e) { out = { pass: false, detail: 'no result: ' + JSON.stringify(raw) }; }
      out.name = suite.slug + '/' + label;
      results.push(out);
      console.log(`  ${out.pass ? 'PASS' : 'FAIL'}  ${label}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      console.log(`        ${out.detail}`);
    }
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
