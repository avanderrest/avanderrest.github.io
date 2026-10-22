/* Screenshot a page after driving it.

   The test runner only photographs a first visit. This opens a page in its own headless
   Chrome (its own port and profile, so it never touches a browser you have open), runs a
   script inside the page, waits, and saves a PNG. Use it to look at a game mid-shift, a
   thumbnail for the wall, or a change before and after.

       node tools/shoot.js coffee-rush out.png
       node tools/shoot.js coffee-rush out.png --eval "window.__game.step(30)"
       node tools/shoot.js coffee-rush out.png --file drive.js --size 1400x900 --wait 1500

   --eval / --file   page script, run as the body of an async function after load (the
                     game's debug handle, window.__game, is the way in)
   --size WxH        viewport, default 1400x900
   --wait ms         after the script, before the shot, default 800
   --fresh           clear localStorage before the page's own scripts run
   Whatever the script returns is printed. Nothing is installed; Chrome or Edge must be. */
'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const profiles = require('./profiles.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--fresh'));
const [slug, out] = words;
if (!slug || !out) { console.error('usage: node tools/shoot.js <slug|wall> <out.png> [--eval js | --file drive.js] [--size WxH] [--wait ms] [--fresh]'); process.exit(2); }
const script = opt('file') ? fs.readFileSync(opt('file'), 'utf8') : opt('eval', '');
const [VW, VH] = opt('size', '1400x900').split('x').map(Number);
const WAIT = Number(opt('wait', 800));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
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

// the same tiny websocket client as test/run.js (no dependencies)
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

(async () => {
  const exe = CHROMES.find((p) => { try { return p && fs.existsSync(p); } catch (e) { return false; } });
  if (!exe) { console.error('No Chrome or Edge found.'); process.exit(2); }
  const server = await serve();
  const cdpPort = 9800 + Math.floor(Math.random() * 150);
  // `fit-` is what an earlier screenshot script called the same throwaway profile
  profiles.sweep(['profile-shoot-', 'fit-'], { log: (m) => console.error(m) });
  const profile = path.join(os.tmpdir(), 'profile-shoot-' + cdpPort);
  const chrome = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--window-size=' + VW + ',' + VH,
    '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  process.once('SIGINT', async () => { await profiles.close(chrome, profile); process.exit(130); });
  const done = async (code) => { await profiles.close(chrome, profile); server.close(); process.exit(code); };
  const getJSON = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: cdpPort, path: p }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await getJSON('/json/version')).webSocketDebuggerUrl; } catch (e) { await sleep(250); } }
  if (!wsUrl) { console.error('Chrome never came up.'); return done(2); }
  const ws = await openWs(wsUrl);
  let id = 0, sessionId = null;
  const pending = new Map();
  ws.onmessage = (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') console.error('page error: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
  };
  const send = (method, params, s) => new Promise((res) => {
    const msg = { id: ++id, method, params: params || {} };
    if (s && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res);
    ws.send(JSON.stringify(msg));
  });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  sessionId = (await send('Target.attachToTarget', { targetId: target.result.targetId, flatten: true })).result.sessionId;
  await send('Runtime.enable', {}, true);
  await send('Page.enable', {}, true);
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, true);
  if (args.includes('--fresh')) await send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); } catch (e) {}' }, true);
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${slug === 'wall' ? '/' : '/' + slug + '/'}` }, true);
  await sleep(2500);
  if (script) {
    const r = await send('Runtime.evaluate', { expression: '(async () => {\n' + script + '\n})()', returnByValue: true, awaitPromise: true }, true);
    const ex = r.result && r.result.exceptionDetails;
    if (ex) console.error('script threw: ' + ((ex.exception || {}).description || ex.text));
    const v = r.result && r.result.result && r.result.result.value;
    if (v !== undefined) console.log(typeof v === 'string' ? v : JSON.stringify(v));
  }
  await sleep(WAIT);
  const shot = await send('Page.captureScreenshot', { format: 'png' }, true);
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved ' + out);
  ws.close();
  await done(0);
})();
