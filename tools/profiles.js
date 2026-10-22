/* Throwaway Chrome profiles under the temp folder.

   A browser given --user-data-dir never removes that directory, and Windows does not
   reliably clean %TEMP% itself. So every run of test/run.js, tools/shoot.js or tools/cdp.js
   used to leave a full Chrome profile behind — hundreds of them, tens of gigabytes.

   sweep(prefixes)    delete old ones a killed or older run left; call at startup
   close(chrome, dir) stop Chrome, wait for it to let go, then delete its profile

   Prefixes are matched literally (keep the trailing dash), and only names this repo
   creates should be listed. A fixed profile passed to cdp's open({ profile }) is meant
   to be kept between runs, so it is never named here and never deleted on close. */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;

// A recursive delete on Windows can hit a file Chrome has only just let go of, hence
// the retries. Failure is not fatal: the next sweep will pick the folder up again.
function remove(dir, onError) {
  if (!dir) return false;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return true;
  } catch (e) {
    if (onError) onError(dir, e);
    return false;
  }
}

// Chrome never deletes its profile, so leftovers accumulate even after this fix if a run
// is killed or crashes. Deleting only profiles older than a day can never disturb another
// run that is still going (a run takes seconds or minutes, not hours).
function sweep(prefixes, { olderThan = DAY, log = null, onError = null } = {}) {
  const tmp = os.tmpdir();
  let names;
  try { names = fs.readdirSync(tmp); } catch (e) { return 0; }
  const cutoff = Date.now() - olderThan;
  let removed = 0;
  for (const name of names) {
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    const dir = path.join(tmp, name);
    try {
      const st = fs.statSync(dir);
      if (!st.isDirectory() || st.mtimeMs > cutoff) continue;
    } catch (e) { continue; }
    if (remove(dir, onError)) removed++;
  }
  if (removed && log) log(`removed ${removed} old browser profile${removed === 1 ? '' : 's'} from ${tmp}`);
  return removed;
}

// chrome.kill() on Windows stops the launcher but not its helper processes, which keep
// the profile's files open. taskkill /T takes the tree down, so the delete below works.
function stop(chrome) {
  return new Promise((resolve) => {
    if (!chrome || chrome.exitCode !== null) return resolve();
    let settled = false;
    let timer = null;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    chrome.once('exit', done);
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        chrome.kill();
      }
    } catch (e) { /* already gone */ }
    timer = setTimeout(done, 5000);
  });
}

async function close(chrome, dir) {
  await stop(chrome);
  return remove(dir);
}

module.exports = { DAY, close, remove, stop, sweep };

// A way to reclaim the folders without starting a browser:
//     node tools/profiles.js
if (require.main === module) {
  const prefixes = ['profile-test-', 'profile-shoot-', 'profile-cdp-', 'cdp-profile-', 'fit-'];
  let failed = 0;
  const removed = sweep(prefixes, {
    log: (m) => console.log(m),
    onError: (dir, e) => { failed++; console.error('could not remove ' + dir + ': ' + (e.code || e.message)); },
  });
  if (!removed && !failed) console.log('no old browser profiles in ' + os.tmpdir());
}
