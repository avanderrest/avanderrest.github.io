/* A headless Chrome to drive a page from Node, with nothing installed.

     const { open } = require('./cdp');
     const page = await open({ path: '/photo-splats/', gpu: true, profile: 'photo-splat-chrome' });
     const value = await page.eval('return window.__game.text()');   // body of an async fn
     await page.close();   // stops Chrome and deletes its throwaway profile

   Serves the repo on a free port, starts its own Chrome (its own debugging port and
   profile, so it never touches a browser you have open, and closing it kills only that
   one), and talks to it over the DevTools protocol with a tiny websocket client.

   gpu: true      real GPU with WebGPU on (--enable-unsafe-webgpu, as Lantern Deep's model
                  tests found works headless here); otherwise --disable-gpu like the tests
   profile: name  a fixed profile under the temp folder, so big downloads (a model in Cache
                  Storage) survive between runs; otherwise a fresh one each time
   size: [w, h]   the viewport, default 1400 x 900

   shoot.js and test/run.js still carry their own copy of this plumbing. */
'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const profiles = require('./profiles.js');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
};
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function openWs(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': 13 } });
    req.on('upgrade', (res, socket) => {
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
        const data = Buffer.from(str, 'utf8'), mask = crypto.randomBytes(4);
        let head;
        if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
        else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
        const masked = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        socket.write(Buffer.concat([head, mask, masked]));
      };
      api.close = () => { try { socket.destroy(); } catch (e) { /* gone */ } };
      resolve(api);
    });
    req.on('error', reject);
    req.end();
  });
}

async function open({ path: pagePath = '/', gpu = false, profile = null, size = [1400, 900], log = console.error } = {}) {
  const exe = CHROMES.find((p) => { try { return p && fs.existsSync(p); } catch (e) { return false; } });
  if (!exe) throw new Error('No Chrome or Edge found.');
  const server = await serve();
  const cdpPort = 9950 + Math.floor(Math.random() * 40);
  profiles.sweep(['profile-cdp-'], { log });
  const dir = path.join(os.tmpdir(), profile || 'profile-cdp-' + cdpPort);
  const keep = Boolean(profile);  // a named profile is there to survive, so don't delete it
  const flags = gpu
    ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-features=Vulkan']
    : ['--disable-gpu'];
  const chrome = spawn(exe, ['--headless=new', ...flags, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=' + size.join(','), '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: cdpPort, path: p }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await getJSON('/json/version')).webSocketDebuggerUrl; } catch (e) { await sleep(250); } }
  const close = async () => { await profiles.close(chrome, keep ? null : dir); server.close(); };
  if (!wsUrl) { await close(); throw new Error('Chrome never came up.'); }
  const ws = await openWs(wsUrl);
  let id = 0, sessionId = null;
  const pending = new Map();
  ws.onmessage = (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') log('page error: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      log('page ' + m.params.type + ': ' + m.params.args.map((a) => (a.value !== undefined ? a.value : a.description || a.type)).join(' '));
    }
  };
  const send = (method, params, s = true) => new Promise((res) => {
    const msg = { id: ++id, method, params: params || {} };
    if (s && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res);
    ws.send(JSON.stringify(msg));
  });
  const target = await send('Target.createTarget', { url: 'about:blank' }, false);
  sessionId = (await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true }, false)).result.sessionId;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${pagePath}` });
  await sleep(2500);
  return {
    send,
    async eval(body) {
      const r = await send('Runtime.evaluate', { expression: '(async () => {\n' + body + '\n})()', returnByValue: true, awaitPromise: true });
      const ex = r.result && r.result.exceptionDetails;
      if (ex) throw new Error('page script threw: ' + ((ex.exception || {}).description || ex.text));
      return r.result && r.result.result && r.result.result.value;
    },
    async shot(file) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
    },
    async close() { ws.close(); await close(); },
  };
}

module.exports = { open, serve, sleep, ROOT };
