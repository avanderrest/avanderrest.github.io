/* Seeded randomness, shared by every game.

   Two generators, both kept bit-for-bit identical to the copies the games used to carry,
   so a world generated from a seed before the move is the same world after it:

     mulberry32(seed)  the one most games use (Furrow, Tithe, Letters to Ashfield,
                       Neon Roll, Machine Imaginaire)
     lcg(seed)         the older 9301/49297/233280 one Marble Tray and Route Builder use

   Both return a function giving a float in [0, 1). Everything below that takes a
   `rnd` argument wants one of those functions (or Math.random). */

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lcg(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// cyrb53's mixing, folded to 32 bits: turns any string (a seed typed into the URL, a
// "seed|purpose" tag) into a number for mulberry32.
export function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

// A separate stream per purpose, so drawing one more number for the weather never
// reshuffles the map: streamFor(seed, 'map'), streamFor(seed, 'weather').
export const streamFor = (seed, tag) => mulberry32(hashString(seed + '|' + tag));

// A stable value in [0, 1) for a grid cell, for texture and scatter that must not change
// between frames. Math.imul throughout: a plain `*` overflows the float mantissa for large
// inputs and the result then never comes out above 0.5 (the old Wizz Delivery bug).
export function hash2(x, y, k = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));   // inclusive
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
export const chance = (rnd, p) => rnd() < p;

// Fisher-Yates, in place; returns the array.
export function shuffle(rnd, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A fresh seed for a new world: short enough to read out or type into a URL.
export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
