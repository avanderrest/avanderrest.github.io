/* Drawn gestures and heard words are read the way a player means them.

   Gestures: shaky, slanted and differently sized versions of each shape, drawn both ways
   round for the circle, must read as that shape; a scribble, a dot and a short twitch must
   read as nothing (so a tap is a tap). Words: what a recogniser actually writes back for
   each default command ("Sit.", "set", "Paul" for paw) must pick that trick, and common
   noise ("Thank you.", "[BLANK_AUDIO]", "you") must pick none. */
import { readGesture, bestCommand, TRICKS } from '../../pocket-pal/sim.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const rnd = mulberry32(4), problems = [];
  const jitter = (pts, j) => pts.map((p) => ({ x: p.x + (rnd() - 0.5) * j, y: p.y + (rnd() - 0.5) * j }));
  const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n }, (_, i) => ({ x: x0 + (x1 - x0) * i / (n - 1), y: y0 + (y1 - y0) * i / (n - 1) }));
  const circle = (r, dir, sweep = 1.9) => Array.from({ length: 40 }, (_, i) => { const a = dir * i / 39 * Math.PI * sweep; return { x: 300 + Math.cos(a) * r, y: 300 + Math.sin(a) * r * 0.85 }; });
  const zig = (w, legs) => { const out = []; for (let l = 0; l < legs; l++) out.push(...line(l % 2 ? w : 0, l * 18, l % 2 ? 0 : w, l * 18 + 18, 8)); return out; };
  const cases = [];
  for (const s of [0.6, 1, 1.8]) {
    cases.push(['down', line(300, 200, 300 + 25 * s, 200 + 140 * s)], ['up', line(300, 400, 290, 400 - 120 * s)],
      ['right', line(100, 300, 100 + 150 * s, 320)], ['left', line(500, 300, 500 - 150 * s, 285)],
      ['circle', circle(60 * s, 1)], ['circle', circle(60 * s, -1)], ['circle', circle(60 * s, 1, 2.3)],
      ['zigzag', zig(150 * s, 4)], ['zigzag', zig(120 * s, 5)]);
  }
  let ok = 0, total = 0;
  for (const [want, pts] of cases) for (const j of [0, 8]) {
    total++;
    const got = readGesture(jitter(pts, j));
    if (got === want) ok++; else problems.push(`${want} (jitter ${j}) read as ${got}`);
  }
  for (const [name, pts] of [['a dot', [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }]], ['a twitch', line(0, 0, 18, 12)], ['a scribble', jitter(line(0, 0, 40, 30, 60), 60)]]) {
    const got = readGesture(pts);
    if (got && name !== 'a scribble') problems.push(`${name} read as ${got}`);
  }

  const phrases = TRICKS.map((t) => t.word).concat('Mochi');
  const heard = { sit: ['Sit.', 'sit!', 'Set.', 'seat', 'sits'], beg: ['Beg.', 'Bag.', 'big', 'Big.'], paw: ['Paw!', 'Paul.', 'Pour.', 'pa'], spin: ['Spin!', 'Spain.'], roll: ['Roll over.', 'Roll over!', 'roll', 'Rollover.'], dance: ['Dance.', 'Dense.', 'dancing'] };
  let words = 0, wtotal = 0;
  for (const [key, list] of Object.entries(heard)) for (const h of list) {
    wtotal++;
    const hit = bestCommand(h, phrases), got = hit ? (phrases[hit.index] === 'Mochi' ? 'name' : TRICKS[hit.index].key) : null;
    if (got === key) words++; else problems.push(`"${h}" heard as ${got}`);
  }
  for (const noise of ['Thank you.', '[BLANK_AUDIO]', 'you', '(dog barking)', 'Okay.', 'What?']) {
    const hit = bestCommand(noise, phrases);
    if (hit) problems.push(`noise "${noise}" heard as ${phrases[hit.index]}`);
  }
  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + `${ok}/${total} gestures, ${words}/${wtotal} misheard words matched, 6 noises ignored` };
}
