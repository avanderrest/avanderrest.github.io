/* The seed in the URL, so a generated world can be shared as a link.

     readSeed()        the seed in the address (#seed=123 or ?seed=123), or null
     writeSeed(seed)   put it in the address bar without reloading or adding history

   A seed is a whole number. Anything else typed in (#seed=lighthouse) is hashed to one,
   so a word works as a seed too. Other #key=value pairs in the hash are left alone. */

import { hashString } from './rng.js';

const parse = (s) => (s == null || s === '' ? null : /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s));

export function readSeed() {
  if (typeof location === 'undefined') return null;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(location.search);
  return parse(hash.get('seed') ?? query.get('seed'));
}

export function writeSeed(seed) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  hash.set('seed', String(seed));
  const next = '#' + hash.toString();
  if (location.hash !== next) history.replaceState(null, '', location.pathname + location.search + next);
}

// The seed for this page load: the one in the URL if there is one, otherwise `fallback`
// (a saved game's seed, or a fresh one), which is then written to the URL.
export function seedForPage(fallback) {
  const s = readSeed();
  const seed = s != null ? s : fallback;
  writeSeed(seed);
  return seed;
}
