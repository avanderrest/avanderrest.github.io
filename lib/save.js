/* localStorage, the way every game here uses it.

     const save = store('donut-works-save-v1', { was: ['donut-works-save-v0'] });
     save.load()        the parsed value, or null (never throws: private mode, full disk)
     save.save(value)   JSON-encodes and writes; returns false if it could not
     save.clear()

     const sound = setting('donut-works-sound', true);
     sound.get(), sound.set(false)

   Keys are folder-prefixed and versioned. Bump the version when the saved shape changes;
   list older keys in `was` and the first one found is moved across once (copied to the new
   key when that is empty, then removed), which is also how a renamed game keeps its saves.
   A `was` entry can be { key, upgrade(old) } to convert an older shape on the way in. */

const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };

function read(key) {
  const s = ls(); if (!s) return null;
  try { const raw = s.getItem(key); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
}
function write(key, value) {
  const s = ls(); if (!s) return false;
  try { s.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}
function remove(key) { const s = ls(); if (!s) return; try { s.removeItem(key); } catch (e) { /* nothing to do */ } }

export function store(key, opts = {}) {
  const was = (opts.was || []).map((w) => (typeof w === 'string' ? { key: w } : w));
  let migrated = false;
  function migrate() {
    if (migrated) return; migrated = true;
    if (read(key) != null) { for (const w of was) remove(w.key); return; }
    for (const w of was) {
      const old = read(w.key);
      if (old == null) continue;
      const value = w.upgrade ? w.upgrade(old) : old;
      if (value != null) write(key, value);
      for (const v of was) remove(v.key);
      return;
    }
  }
  return {
    key,
    load() { migrate(); return read(key); },
    save(value) { migrated = true; return write(key, value); },
    clear() { remove(key); },
  };
}

// A small preference (sound on/off, difficulty) that is not part of the saved game.
export function setting(key, fallback) {
  return {
    get() { const v = read(key); return v == null ? fallback : v; },
    set(v) { write(key, v); return v; },
  };
}

// Several games kept a preference as the bare string '0' / '1' or 'off' rather than JSON.
// This reads either shape, so switching a game onto setting() keeps the player's choice.
export function legacyFlag(key, fallback) {
  return {
    get() {
      const s = ls(); if (!s) return fallback;
      let raw; try { raw = s.getItem(key); } catch (e) { return fallback; }
      if (raw == null) return fallback;
      if (raw === '0' || raw === 'off' || raw === 'false') return false;
      if (raw === '1' || raw === 'on' || raw === 'true') return true;
      return fallback;
    },
    set(v) { const s = ls(); if (s) { try { s.setItem(key, v ? '1' : '0'); } catch (e) { /* ignore */ } } return v; },
  };
}
