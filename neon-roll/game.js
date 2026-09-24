/* Neon Roll — Ski on Neon (and Tiny Wings before it) with a glowing ball in
   place of the skier. One button: holding presses the ball into the track, so
   it gathers speed down a slope and bleeds it back out going up; letting go
   lets it fly off the next crest. Land along the slope for a Perfect, and
   three in a row set it on fire.

   The track is stitched from pieces — symmetric cosine hills, and in the Gaps
   mode kicker ramps, gaps
   and landing slopes — each of which knows its own height, slope and curvature
   exactly, so the ball leaves the ground where the physics says it would (the
   track curving away faster than gravity can hold it on) rather than wherever
   a sampled polyline happens to kink.

   World y points up. The ball is simulated as its contact point with the tube;
   the drawn ball sits one radius out along the track's normal. */
(() => {
  'use strict';

  // ---------- constants ----------
  const PX_PER_M = 40;                      // world px in a metre, for the HUD
  const STEP = 1 / 240;                     // fixed physics step (s)
  const G = 1500;                           // px/s² gravity on the track
  const AIR_G = 650;                       // ... and in flight: lighter, so jumps hang in the air
  /* The ball always rolls on. The track draws it towards a cruising speed that
     rises with flow — one level per Perfect in a row — and flow also adds lift
     when it leaves a lip or a crest, so a clean run goes faster AND higher. A
     near miss costs a level; a slam drops it back to plain cruising. */
  const CRUISE = 1300;                      // px/s cruising speed at flow 0
  const FLOW_SPEED = 110;                   // px/s more cruise per level of flow
  const FLOW_MAX = 8;
  const FLOW_POP = 35;                      // px/s of upward lift per level on take-off
  const BASE_POP = 70;                      // ... and at any level, off a lip
  const CRUISE_PULL = 3, CRUISE_EASE = 1;   // back down to cruise: firm enough that holding can't build 160 km/h
  const CLIMB_ASSIST = 0.75;                // share of an uphill's pull cancelled while under cruising speed // per s, pull up to cruise from below / down from above
  const CRUISE_FLOOR = 0.55;                // under this fraction of cruise the pull gets firm
  const HOLD_G = 1.6;                       // gravity multiplier while held on the track
  const DIVE_G = 2.6;                       // ... and while held in the air
  const DRAG = 0.00014;                     // quadratic air drag (per px)
  const ROLL = 14;                          // px/s² rolling resistance
  const MAX_SPEED = 3400;                   // px/s, a safety cap
  const R = 15;                             // ball radius (world px)
  const PERFECT_DEG = 24, GOOD_DEG = 44;    // landing mismatch that still counts
  /* Gliding: GLIDE_STREAK Perfects in a row and the ball falls at GLIDE_G of
     normal gravity whenever the button is up, until a landing short of Perfect.
     It carries you further, holding still dives, so a clean chain floats out and
     times its dive onto the next downslope (Amber's idea). */
  const GLIDE_STREAK = 2, GLIDE_G = 0.55;
  const SETTLE = 0.3;                       // s after a landing the ball cannot be thrown off a crest
  const HOP_AIR = 0.3;                      // s; a shorter flight is a skip, not a landing
  const GOOD_KEEP = 0.95;                   // fraction of along-track speed a near-miss keeps (and it costs a level of flow)
  const SLAM_MIN = 260;                     // px/s a slam never leaves the ball below: slowed, not stopped
  const LIP_KINK = 0.25;                    // slope drop at a join that throws the ball off it (only a gap's edge now)
  const LIP_CURVE = 0.004;                  // slope change per px over the rounded top of a jump
  const BOOST_MARGIN = 1.3;                 // a kicker ramp drives the ball to this much over what its gap needs
  /* The tube after a lip is a ski jump's landing hill: it falls away at
     LAND_SLOPE[0] and steepens steadily to LAND_SLOPE[1] over LAND_RUN px, then
     eases out into a valley. A flight meets a slope from above, so it always
     arrives steeper than the slope, and the longer it flew the steeper — so the
     hill steepens the further out it is, and a short hop and a long flight both
     meet it inside the Perfect window. (A straight 50-degree hill had every
     landing 23 degrees off; curves fitted to one flight path suited one speed.) */
  const LAND_SLOPE = [-0.7, -1.8];          // about 35 degrees steepening to 61
  const LAND_RUN = [300, 560];              // px of landing hill
  const RAMP_Q = 1.6;                       // ramp shape: y = h u^q (2 would be a parabola)
  const RIPPLE = [30, 80];                  // px tall: the low waves most of the track is made of
  const RIPPLE_SLOPE = [0.3, 0.5];          // slope at the middle of a ripple's flank
  const BIG_HILL = [220, 380];              // px tall: the big long hills every few ripples
  const BIG_SLOPE = [0.85, 1.1];          // steep: launched off one flank, the ball comes down on the same slope
  const SWELL_MIN = 40;                     // px: the lowest a swell may be squeezed to (flatter reads as a flat)
  const SWELL_HOLD = 0.8;                   // a ripple's crest bends a cruising ball this fraction of what would throw it
  const BIG_WAVE = 0.25;                    // share of big waves, in the Gaps mode's kicker run-ins
  const LAUNCH_KEEP = 0.93;                 // share of cruising speed a ball still has where it leaves a big hill
  const REACH_FIT = 0.95;                   // how far along a cruising flight's reach the next big hill's far side sits
  const PERFECT_KICK = 70;                  // px/s a Perfect adds
  const FEVER_STREAK = 3, FEVER_TIME = 6;   // Perfects in a row to ignite, and how long it burns
  const FEVER_KICK = 220, FEVER_PUSH = 180; // px/s on ignition, px/s² while burning
  const BIG_AIR = 1.4;                      // s in the air that earns a mention
  const START_SPEED = 260;                  // px/s the ball is pushed off with
  // Endless: the blackout starts CHASE_OPEN behind, speeds up by CHASE_RAMP each
  // second up to CHASE_MAX, and is never further back than CHASE_LAG.
  const CHASE_START = 300, CHASE_RAMP = 3, CHASE_MAX = 1000, CHASE_LAG = 1900, CHASE_OPEN = 1500;
  // Air Time: a fixed two minutes (Amber: one felt short), scored on seconds in the air. (It used to run its clock only on the
  // track, and once flights filled most of every minute a run went on for ages.)
  const AIRTIME_LENGTH = 120, AIR_FALL = 2;
  const SPRINT_M = 1500, SPRINT_SEED = 0x5e1f, SPRINT_FALL = 2;
  const NO_PROGRESS = 4, PROGRESS_PX = 60;  // no new ground by this many px in this many s offers a restart
  const RESPAWN_SPEED = 520;                // px/s after being put back on the far side of a gap
  const FALL_DEPTH = 700;                   // px below a gap's far edge that counts as gone
  const ZONE_M = 400;                       // metres per colour zone
  const SAVE_KEY = 'neon-roll-save-v1';
  const LEAD_FROM = -5200;                  // px: where the scenery to the left of the start begins

  const MODES = {
    endless: { label: 'Endless', blurb: 'The blackout is rolling in behind you, and it keeps getting faster. Stay ahead of it.' },
    airtime: { label: 'Air Time', blurb: 'Two minutes. Your score is how long you spend in the air.' },
    sprint: { label: 'Sprint', blurb: 'The same 1500 m every time. Race your best.' },
    gaps: { label: 'Gaps', blurb: 'Kickers throw you over breaks in the tube. Miss the far side and you are gone.' },
  };

  // track colours by zone, as rgb, blended as the ball crosses a boundary
  const ZONES = [
    { tube: [255, 47, 208], sky: [34, 6, 58] },
    { tube: [34, 230, 255], sky: [6, 22, 52] },
    { tube: [125, 255, 74], sky: [8, 34, 26] },
    { tube: [255, 176, 46], sky: [44, 16, 8] },
    { tube: [162, 107, 255], sky: [22, 10, 54] },
  ];

  const SKINS = [
    { id: 'cyan', name: 'Cyan', cost: 0, rgb: [34, 230, 255] },
    { id: 'rose', name: 'Hot Pink', cost: 60, rgb: [255, 47, 208] },
    { id: 'lime', name: 'Laser Lime', cost: 150, rgb: [125, 255, 74] },
    { id: 'sun', name: 'Sunset', cost: 300, rgb: [255, 176, 46] },
    { id: 'violet', name: 'Ultraviolet', cost: 500, rgb: [162, 107, 255] },
    { id: 'prism', name: 'Prism', cost: 900, rgb: null },
  ];

  const LIME = [125, 255, 74], RED = [255, 70, 90], FIRE = [255, 150, 40], WHITE = [255, 255, 255];

  // ---------- helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  function skinRGB(id, t) {
    const s = SKINS.find((k) => k.id === id) || SKINS[0];
    return s.rgb || hsl((t * 90) % 360, 1, 0.62);
  }

  // ---------- save ----------
  function freshSave() {
    return {
      v: 1, shards: 0, owned: ['cyan'], skin: 'cyan', sound: false, mode: 'endless',
      best: { endless: { score: 0, dist: 0 }, airtime: { air: 0 }, sprint: { time: 0 }, gaps: { dist: 0 } },
    };
  }

  function loadSave() {
    const d = freshSave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.v === 1) {
        Object.assign(d, s);
        d.best = Object.assign(freshSave().best, s.best);
        if (!Array.isArray(d.owned) || !d.owned.includes('cyan')) d.owned = ['cyan'].concat(d.owned || []);
        if (!MODES[d.mode]) d.mode = 'endless';
      }
    } catch (e) { /* private window or corrupt: start fresh */ }
    return d;
  }

  const save = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ }
  }

  // ---------- track ----------
  /* Every piece ends where the next begins, at the same height, and every
     piece but the kicker ramp and the gap ends level — so the joins are
     smooth and only the lip of a kicker throws the ball. A piece's f(X, o)
     fills o with height, slope and second derivative at world X. */
  function makeTrack(seed, opts = {}) {
    const rnd = mulberry32(seed);
    const segs = [];
    const shards = [];
    let x = LEAD_FROM, y = 0, last = '', atValley = false;
    /* The track wanders around y = 0 in waves rather than drifting down: every
       crest, valley and lip is picked as a height above or below 0, not relative
       to the last one. (Picked relative, each piece ended a little lower than it
       began, and a run felt like one long slide further and further down.) */
    const wave = (lo, hi) => (rnd() < BIG_WAVE ? 160 + rnd() * 160 : lo + rnd() * (hi - lo)) * (1 + 0.3 * difficulty());
    const O = { y: 0, dy: 0, ddy: 0 };
    let hint = 0;                           // last index found, since lookups walk forward

    function add(seg) {
      seg.x0 = x; seg.x1 = x + seg.w;
      segs.push(seg);
      x = seg.x1; y = seg.yEnd;
      return seg;
    }
    function flat(w) {
      const y0 = y;
      return add({ kind: 'flat', w, yEnd: y0, f(X, o) { o.y = y0; o.dy = 0; o.ddy = 0; } });
    }
    // half a cosine from the current height to y1: level at both ends
    function roll(w, y1) {
      const y0 = y, A = y1 - y0, k = Math.PI / w, x0 = x;
      return add({
        kind: 'roll', w, yEnd: y1,
        f(X, o) {
          const u = (X - x0) * k;
          o.y = y0 + A * (1 - Math.cos(u)) / 2;
          o.dy = A * k * Math.sin(u) / 2;
          o.ddy = A * k * k * Math.cos(u) / 2;
        },
      });
    }
    /* Curling up from level to the lip, y = h u^RAMP_Q: concave all the way, so it
       holds the ball, and with RAMP_Q under 2 it leaves the valley floor sooner
       than a parabola would — a tall parabola ramp lay nearly flat for its first
       300px. The lip's slope is RAMP_Q h / w. */
    function ramp(lipSlope, h) {
      const w = RAMP_Q * h / lipSlope;
      const y0 = y, x0 = x;
      return add({
        kind: 'ramp', w, yEnd: y0 + h,
        f(X, o) {
          const u = Math.max(1e-6, (X - x0) / w), up = Math.pow(u, RAMP_Q - 2);
          o.y = y0 + h * up * u * u;
          o.dy = RAMP_Q * h * up * u / w;
          o.ddy = RAMP_Q * (RAMP_Q - 1) * h * up / (w * w);
        },
      });
    }
    function gap(w, drop) {
      const yLow = y - drop;
      return add({ kind: 'gap', w, yEnd: yLow, yTop: y, yLow });
    }
    // the landing hill after a lip or a gap (see LAND_SLOPE), then shards over it
    function landing(lipX, lipY, a0) {
      const run = LAND_RUN[0] + rnd() * (LAND_RUN[1] - LAND_RUN[0]);
      {
        const y0 = y, x0 = x, m0 = LAND_SLOPE[0], cv = (LAND_SLOPE[1] - LAND_SLOPE[0]) / run;
        add({
          kind: 'steep', w: run, yEnd: y0 + m0 * run + cv * run * run / 2,
          f(X, o) { const u = X - x0; o.y = y0 + m0 * u + cv * u * u / 2; o.dy = m0 + cv * u; o.ddy = cv; },
        });
      }
      // ease the slope out to level at the bottom
      const w2 = 120 + rnd() * 70, A = LAND_SLOPE[1] * 2 * w2 / Math.PI;
      const y0 = y, x0 = x, q = Math.PI / (2 * w2);
      add({
        kind: 'ease', w: w2, yEnd: y0 + A,
        f(X, o) {
          const u = (X - x0) * q;
          o.y = y0 + A * Math.sin(u);
          o.dy = A * q * Math.cos(u);
          o.ddy = -A * q * q * Math.sin(u);
        },
      });
      atValley = true;
      // shards along the line a cruising ball flies off the lip
      if (rnd() < 0.75) {
        const v = CRUISE * 1.25, vx = v * Math.cos(a0), t = (v * Math.sin(a0) + BASE_POP) / vx, k = AIR_G / (2 * vx * vx);
        for (let i = 1; i <= 4; i++) {
          const X = i * vx * 0.16;
          shards.push({ x: lipX + X, y: lipY + X * t - k * X * X + R + 4, got: false });
        }
      }
    }

    // a hill starts in a valley: if the last piece ended on a crest, come down into one first
    function climbDone() {
      if (atValley) return;
      const drop = Math.max(120, y + 60);
      roll(drop * Math.PI / (2 * RIPPLE_SLOPE[1]), y - drop).hill = true;
      atValley = true;
    }

    // from the bottom of a landing, back up to a crest (what a kicker starts from)
    function climb() {
      if (!atValley) return;
      const rise = Math.max(60, wave(40, 120) - y);
      roll(rise * (2.3 + rnd() * 1.0), y + rise);
      atValley = false;
    }

    // the speed a ball typically has at a lip: some carried in, plus the run-in's drop

    // a shard sitting on the tube, where the ball's centre will pass
    function shardOnTrack(X) {
      if (!ground(X, O)) return;
      const n = 1 / Math.sqrt(1 + O.dy * O.dy);
      shards.push({ x: X - O.dy * n * (R + 3), y: O.y + n * (R + 3), got: false });
    }

    function difficulty() { return clamp(x / (1600 * PX_PER_M), 0, 1); }

    /* Hills: each up from a valley and down the far side as two halves of one
       cosine, the same shape either side of the crest. Two kinds:
       - big hills, the launch ramps. A ball at cruising speed leaves one on its
         rising flank and flies a predictable distance, so the NEXT big hill is
         placed with its far side — a downslope at the same angle — right where
         that flight comes down. Faster (more flow) overshoots it; the landing
         ring says dive.
       - swells between them: low, and wide enough that their crests cannot throw
         a cruising ball, sized to fill the room before the next big hill.
       The track sits low and the ball flies high above it on speed, as in Ski on
       Neon. (Every earlier layout left long flights coming down wherever the track
       happened to be — half of it uphill: 16 and 65 slams in Amber's logs.) The
       far side of each hill comes down a little more or less than it went up,
       drifting valleys back towards 0, so the track stays level by itself. */
    let nextBig = null, landAt = null;
    function bigSpec() {
      const A = (BIG_HILL[0] + rnd() * (BIG_HILL[1] - BIG_HILL[0])) * (1 + 0.3 * difficulty());
      const slope = BIG_SLOPE[0] + rnd() * (BIG_SLOPE[1] - BIG_SLOPE[0]);
      return { A, slope, w: A * Math.PI / (2 * slope) };
    }
    function oneHill(A, w, big) {
      const B = clamp(A - y * 0.45 + (rnd() - 0.5) * 30, A * 0.75, A * 1.3);
      const x0 = x;
      roll(w, y + A).hill = true;
      const crestX = x, crestY = y;
      roll(w * Math.sqrt(B / A), y - B).hill = true;      // same curvature at the crest either side
      if (big && rnd() < 0.7) {
        for (let i = 1; i <= 4; i++) shards.push({ x: crestX + i * 110, y: crestY + 90 - i * i * 8, got: false });
      } else if (!big && rnd() < 0.25) {
        for (let i = 1; i <= 3; i++) shardOnTrack(x0 + w * (0.9 + i * 0.3));
      }
      atValley = true;
      return crestX;
    }
    function hill() {
      climbDone();
      if (!nextBig) nextBig = bigSpec();
      const B = nextBig;
      // where this big hill's crest must sit so its far side is under the last launch's landing
      const target = landAt === null ? x + B.w : landAt - B.w / 2;
      const room = target - (x + B.w);                     // flat distance left to fill with swells
      if (room < 900) {                                    // too little to fill with a real swell: go now
        const crest = oneHill(B.A, B.w, true);
        // a cruising ball leaves this hill around the middle of its rising flank, at its slope
        const th = Math.atan(B.slope);
        const v = CRUISE * LAUNCH_KEEP;
        landAt = crest - B.w / 2 + v * v * Math.sin(2 * th) / AIR_G * REACH_FIT;
        nextBig = null;
        return;
      }
      swell(room);
    }

    // a swell, no wider than `room`
    function swell(room) {
      climbDone();
      let A = (RIPPLE[0] + rnd() * (RIPPLE[1] - RIPPLE[0])) * (1 + 0.3 * difficulty());
      let w = Math.max(A * Math.PI / (2 * (RIPPLE_SLOPE[0] + rnd() * (RIPPLE_SLOPE[1] - RIPPLE_SLOPE[0]))),
        Math.PI * Math.sqrt(A * CRUISE * CRUISE / (2 * AIR_G * SWELL_HOLD)));
      if (2 * w > room) { const k = room / (2 * w); A = Math.max(SWELL_MIN, A * k * k); w = room / 2; }   // squeezed: no flatter than SWELL_MIN
      oneHill(A, w, false);
    }

    // Gaps mode only: a run-in, a steep kicker ramp, a break in the tube, and a landing hill
    function kicker() {
      climb();
      const d = difficulty();
      const P = Math.max(180, y + wave(80, 180));         // run-in drop, down to a trough under 0
      // wide enough that a cruising ball rolls down it: a tighter run-in threw the ball off its
      // top, clean over the ramp, and down short of the gap's far edge
      roll(Math.max(P * (2.4 + rnd() * 0.8), Math.PI * Math.sqrt(P * CRUISE * CRUISE / (2 * AIR_G * SWELL_HOLD))), y - P);
      const lip = (25 + rnd() * 13) * Math.PI / 180;
      const tanA = Math.tan(lip), cosA = Math.cos(lip);
      const h = 45 + rnd() * 45;
      const kick = ramp(tanA, h);
      const D = 110 + rnd() * 150;                        // far side sits this far below the lip
      /* The gap is sized for a ball that did nothing at all: dropped from rest
         at the top of the run-in, never held, at 80% of the speed that would
         leave it at the lip. Pumping only makes it easier; holding up the ramp
         or over the gap is the way to fall in. */
      const v = Math.sqrt(2 * G * Math.max(40, P - h)) * 0.8;
      const need = (L) => Math.sqrt(G * L * L / (2 * cosA * cosA * (L * tanA + D)));
      let L = 170 + d * 300 + rnd() * 140;
      while (L > 80 && need(L + 40) > v) L *= 0.92;
      const lipX = x, lipY = y;
      gap(L, D).need = need(L + 40);
      // a booster: whatever happened on the way in (a slam at its foot drops the ball to plain
      // cruising, far too slow), the ramp drives the ball up to what the gap needs, and then some
      kick.boost = need(L + 40) * BOOST_MARGIN;
      landing(lipX, lipY, lip);
      landAt = null;
    }

    function extend(toX) {
      while (x < toX) {
        const r = rnd();
        if (opts.gaps && x > 1500 && last !== 'kicker' && r < 0.35 + 0.15 * difficulty()) {
          // not under a flight still in the air off the last big hill: it would come down in the gap
          while (landAt !== null && x < landAt + 600) swell(Math.max(900, landAt + 600 - x));
          kicker(); last = 'kicker';
        }
        else { hill(); last = 'hill'; }
      }
    }

    function at(X) {
      if (!segs.length || X < segs[0].x0 || X >= segs[segs.length - 1].x1) return null;
      let i = clamp(hint, 0, segs.length - 1);
      if (X >= segs[i].x0 && X < segs[i].x1) return segs[i];
      if (i + 1 < segs.length && X >= segs[i + 1].x0 && X < segs[i + 1].x1) { hint = i + 1; return segs[i + 1]; }
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].x0 <= X) lo = mid; else hi = mid - 1;
      }
      hint = lo;
      return segs[lo];
    }

    function ground(X, o) {
      const s = at(X);
      if (!s || s.kind === 'gap') return null;
      s.f(X, o);
      return s;
    }

    function next(seg) {
      const i = segs.indexOf(seg);
      return i >= 0 ? segs[i + 1] || null : null;
    }

    // forget track that has scrolled well out of reach
    function trim(beforeX) {
      let n = 0;
      while (n < segs.length - 4 && segs[n].x1 < beforeX) n++;
      if (n) { segs.splice(0, n); hint = 0; }
      for (let i = shards.length - 1; i >= 0; i--) if (shards[i].x < beforeX) shards.splice(i, 1);
    }

    // scenery: swells running off the left of the screen behind the start, ending level at
    // the top of the opening drop so the curve joins smoothly (the ball never goes back there)
    for (const [w, to] of [[1100, -220], [1100, 80], [1150, -180], [1150, 0]]) roll(w, to);
    // every run opens on one steep drop (the only lopsided piece outside the Gaps mode), to get going
    roll(1100, -620);
    atValley = true;
    extend(8000);

    return { seed, segs, shards, extend, at, ground, next, trim, get end() { return x; } };
  }

  // ---------- page ----------
  const stage = document.getElementById('stage');
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d');
  const panel = document.getElementById('panel');
  const $ = (id) => document.getElementById(id);

  let W = 800, H = 500, DPR = 1;
  let sunCanvas = null;

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    sunCanvas = null;
    snapCamera();
  }

  // ---------- state ----------
  const S = {
    mode: save.mode, phase: 'menu', track: null,
    ball: null, held: false, frozen: false, noChase: false,
    t: 0, dist: 0, bonus: 0, runShards: 0, streak: 0, perfects: 0, fever: 0,
    clock: 0, penalty: 0, chaseX: 0, falls: 0, gaps: 0, slams: 0, maxAir: 0,
    overT: 0, overReason: '', newBest: {}, paused: false, lastLip: null, landT: -1, bestX: 0, noProgT: 0, flow: 0,
  };
  const cam = { x: 0, y: 0, s: 1 };
  const fx = { parts: [], texts: [], trail: [], shake: 0, flash: 0 };
  const O = { y: 0, dy: 0, ddy: 0 };        // scratch for physics
  const Q = { y: 0, dy: 0, ddy: 0 };        // scratch for the camera and drawing

  function newBall() {
    return { x: -640, y: 0, vx: 0, vy: 0, s: 0, on: true, ang: 0, spin: 0, air: 0, offx: 0, offy: R };
  }

  function resetWorld(seed) {
    if (seed == null) seed = S.mode === 'sprint' ? SPRINT_SEED : (Math.random() * 2 ** 31) | 0;
    S.track = makeTrack(seed, { gaps: S.mode === 'gaps' });
    S.ball = newBall();
    S.track.ground(S.ball.x, O);
    S.ball.y = O.y;
    Object.assign(S, {
      held: false, noProgT: 0, flow: 0, landT: -1, t: 0, dist: 0, bonus: 0, runShards: 0, streak: 0, perfects: 0, fever: 0,
      clock: S.mode === 'airtime' ? AIRTIME_LENGTH : 0, airSec: 0, penalty: 0, falls: 0, gaps: 0, slams: 0, maxAir: 0,
      chaseX: S.ball.x - CHASE_OPEN, overT: 0, overReason: '', newBest: {},
    });
    fx.parts.length = 0; fx.texts.length = 0; fx.trail.length = 0;
    S.bestX = S.ball.x;
    snapCamera();
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    S.mode = mode; save.mode = mode; persist();
    document.querySelectorAll('.mode').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    S.phase = 'menu';
    S.noChase = false;                     // a test's start(..., { noChase }) must not outlive it
    resetWorld();
    showPanel();
  }

  function startRun() {
    if (S.phase === 'over') resetWorld();
    S.phase = 'run';
    S.ball.s = START_SPEED;
    panel.hidden = true;
    Snd.sfx('go');
    logStart();
  }

  // a fresh run in the same mode, from anywhere; an abandoned run records nothing
  function restart() {
    if (modalOpen()) return;
    releaseAll();
    if (S.phase === 'run' || S.phase === 'paused') logEnd('restarted');
    S.phase = 'menu';
    resetWorld();
    startRun();
  }

  function finish(reason) {
    if (S.phase !== 'run') return;
    S.phase = 'over'; S.overReason = reason; S.overT = 0;
    const m = S.mode, b = save.best[m], nb = {};
    const dist = Math.floor(S.dist);
    if (m === 'endless') {
      const score = dist + S.bonus;
      if (score > b.score) { b.score = score; nb.score = true; }
      if (dist > b.dist) { b.dist = dist; nb.dist = true; }
    } else if (m === 'airtime') {
      if (S.airSec > (b.air || 0)) { b.air = +S.airSec.toFixed(1); nb.air = true; }
    } else if (m === 'gaps') {
      if (dist > b.dist) { b.dist = dist; nb.dist = true; }
    } else if (reason === 'finish') {
      const t = S.clock + S.penalty;
      if (!b.time || t < b.time) { b.time = t; nb.time = true; }
    }
    S.newBest = nb;
    logEnd(reason);
    persist();
    if (reason === 'void' || reason === 'caught' || reason === 'time') { fx.shake = 0.5; Snd.sfx('over'); }
    else Snd.sfx('finish');
    showPanel();
  }

  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

  function showPanel() {
    const m = S.mode, best = save.best[m];
    $('panel-kicker').textContent = MODES[m].label;
    const rows = [];
    const row = (k, v, isBest) => rows.push(`<dt>${k}</dt><dd${isBest ? ' class="best"' : ''}>${v}</dd>`);
    const hint = $('panel-hint');
    if (S.phase === 'menu') {
      $('panel-title').textContent = 'Neon Roll';
      $('panel-blurb').textContent = MODES[m].blurb;
      if (m === 'endless' && best.score) { row('best score', best.score); row('furthest', `${best.dist} m`); }
      if (m === 'airtime' && best.air) row('most air', `${best.air.toFixed(1)}s`);
      if (m === 'gaps' && best.dist) row('furthest', `${best.dist} m`);
      if (m === 'sprint' && best.time) row('best time', fmtTime(best.time));
      row('shards', save.shards);
      hint.textContent = 'Hold anywhere, or Space, to roll';
      hint.classList.remove('wait');
    } else if (S.phase === 'paused') {
      $('panel-title').textContent = 'Paused';
      $('panel-blurb').textContent = '';
      hint.textContent = 'Hold, or P, to carry on';
      hint.classList.remove('wait');
    } else {
      const titles = { caught: 'The blackout caught you', void: 'Lost in the void', time: 'Out of time', finish: 'Finished' };
      $('panel-title').textContent = titles[S.overReason] || 'Run over';
      $('panel-blurb').textContent = '';
      const nb = S.newBest, dist = Math.floor(S.dist);
      if (m === 'endless') {
        row('score', dist + S.bonus + (nb.score ? ' &middot; best!' : ''), nb.score);
        row('distance', `${dist} m`, nb.dist);
        if (!nb.score) row('best', best.score);
      } else if (m === 'airtime') {
        row('in the air', `${S.airSec.toFixed(1)}s` + (nb.air ? ' &middot; best!' : ''), nb.air);
        if (!nb.air && best.air) row('best', `${best.air.toFixed(1)}s`);
        row('distance', `${dist} m`);
      } else if (m === 'gaps') {
        row('distance', `${dist} m` + (nb.dist ? ' &middot; best!' : ''), nb.dist);
        if (!nb.dist) row('best', `${best.dist} m`);
      } else {
        row('time', fmtTime(S.clock + S.penalty) + (nb.time ? ' &middot; best!' : ''), nb.time);
        if (S.penalty) row('falls', `${S.falls} (+${S.penalty}s)`);
        if (!nb.time && best.time) row('best', fmtTime(best.time));
      }
      row('perfects', S.perfects);
      row('shards', `+${S.runShards}`);
      hint.textContent = 'Hold to go again';
      hint.classList.add('wait');
    }
    $('panel-stats').innerHTML = rows.join('');
    panel.hidden = false;
  }

  // ---------- physics ----------
  function tick(dt) {
    const b = S.ball, T = S.track;
    if (b.on) rollStep(dt); else flyStep(dt);
    if (S.phase !== 'run') return;

    // the drawn ball sits one radius out along the normal; ease it there after a landing
    if (b.on && T.ground(b.x, O)) {
      const n = 1 / Math.sqrt(1 + O.dy * O.dy);
      const k = 1 - Math.exp(-dt * 30);
      b.offx += (-O.dy * n * R - b.offx) * k;
      b.offy += (n * R - b.offy) * k;
    }

    S.t += dt;
    if (S.held !== logHeld) {
      logHeld = S.held;
      if (b.on) { T.ground(b.x, O); log(`${S.held ? 'hold' : 'let go'} on the track, ${deg(Math.atan(O.dy))}\u00B0 ${T.at(b.x).kind}, ${kmh(Math.abs(b.s))} km/h`); }
      else log(`${S.held ? 'hold (dive)' : 'let go'} in the air, ${Math.round(b.y - groundBelow(b.x))}px up`);
    }
    if (S.t >= logSnapT) {
      logSnapT = Math.floor(S.t) + 1;
      const up = b.on ? 0 : Math.round(b.y - groundBelow(b.x));
      log(`\u00B7 ${b.on ? 'rolling' : `flying ${up}px up`}, ${kmh(b.on ? Math.abs(b.s) : Math.hypot(b.vx, b.vy))} km/h, cruise ${kmh(cruise())}, flow ${S.flow}${S.held ? ', holding' : ''}`);
    }
    S.dist = Math.max(S.dist, b.x / PX_PER_M);
    // the ball always rolls on, but should a run ever stop covering new ground, offer a restart
    if (b.x > S.bestX + PROGRESS_PX) { S.bestX = b.x; S.noProgT = 0; } else S.noProgT += dt;
    if (S.fever > 0) S.fever = Math.max(0, S.fever - dt);
    T.extend(b.x + 7000);

    // shards
    const cx = b.x + b.offx, cy = b.y + b.offy, rr = (R + 14) * (R + 14);
    for (const sh of T.shards) {
      if (sh.got || Math.abs(sh.x - cx) > 40) continue;
      const dx = sh.x - cx, dy = sh.y - cy;
      if (dx * dx + dy * dy < rr) {
        sh.got = true;
        const v = S.fever > 0 ? 2 : 1;
        S.runShards += v; save.shards += v;
        burst(sh.x, sh.y, skinRGB(save.skin, S.t), 8, 160);
        Snd.sfx('shard');
      }
    }

    if (S.mode === 'endless' && !S.noChase) {
      const v = Math.min(CHASE_MAX, CHASE_START + CHASE_RAMP * S.t);
      S.chaseX = Math.max(S.chaseX + v * dt, b.x - CHASE_LAG);
      if (S.chaseX >= b.x) finish('caught');
    } else if (S.mode === 'airtime') {
      S.clock -= dt;
      if (!b.on) S.airSec += dt;
      if (S.clock <= 0) { S.clock = 0; finish('time'); }
    } else if (S.mode === 'sprint') {
      S.clock += dt;
      if (b.x >= SPRINT_M * PX_PER_M) finish('finish');
    }
  }

  function rollStep(dt) {
    const b = S.ball, T = S.track;
    const cur = T.ground(b.x, O);
    if (!cur) { takeOff(b.s, 0); return; }
    const m = O.dy, c = 1 / Math.sqrt(1 + m * m), sn = m * c;
    const g = G * (S.held ? HOLD_G : 1);
    // The track curves away (convex) faster than gravity can bend the ball's path: it lifts off.
    // Judged against the gravity it would have in the air, or a held ball hops every step.
    const curv = O.ddy * c * c * c;
    // just landed: stay down a moment (a steepening landing hill is convex and would throw it straight back up)
    if (curv < 0 && S.t - S.landT > SETTLE && b.s * b.s * -curv > airG(S.held) * c) { takeOff(b.s, m, cur.lip); return; }
    let a = -g * sn - Math.sign(b.s) * (ROLL + DRAG * b.s * b.s);
    if (S.fever > 0 && b.s > 0) a += FEVER_PUSH;
    /* Always rolling on at the cruising speed for this much flow. Below it, most of
       the pull of an uphill is cancelled (CLIMB_ASSIST) and the ball is drawn back
       up to speed; above it, it is eased back down. Too gently (0.25/s) and holding
       down every slope built 130-160 km/h and flights sailed over whole hills (16
       slams in one of Amber's runs); too firmly (3/s) and she rolled at 50-70 km/h
       and barely left the ground.
       (Measuring speed by energy instead let a tall ramp drain the ball to a
       32 km/h crawl for 5-8 seconds a climb — Amber's play log, 2026-09-23.) */
    if (S.phase === 'run') {
      const target = cruise();
      if (b.s > 0 && b.s < target && sn > 0) a += g * sn * CLIMB_ASSIST;
      a += (target - b.s) * (b.s < target ? CRUISE_PULL : CRUISE_EASE);
      if (b.s < target * CRUISE_FLOOR) a = Math.max(a, (target - b.s) * 6);
      if (cur.boost && b.s < cur.boost) a = Math.max(a, (cur.boost - b.s) * 8);
    }
    b.s = clamp(b.s + a * dt, -MAX_SPEED, MAX_SPEED);
    const nx = b.x + b.s * c * dt;
    const here = T.at(b.x), seg = T.at(nx);
    if (!seg) { b.s = Math.max(0, b.s); return; }       // the start of the track is a wall
    b.ang -= b.s * dt / R;
    // Over a lip: the next piece turns down more steeply than this one ends, so the ball
    // carries on along the old tangent and the tube drops away beneath it.
    if (seg !== here && seg.kind !== 'gap') {
      const dir = Math.sign(b.s);
      seg.f(nx, Q);
      if (dir * Q.dy < dir * m - LIP_KINK) {
        b.x = nx; b.y += b.s * sn * dt;
        takeOff(b.s, m, true);
        return;
      }
    }
    if (seg.kind === 'gap') {                           // rolled off the end of the tube
      b.vx = b.s * c; b.vy = b.s * sn;
      if (b.vx > 0) b.vy += FLOW_POP * S.flow + BASE_POP;
      b.x = nx; b.y += b.s * sn * dt;
      leaveGround('over a gap', Math.atan(m));
      if (b.vx > 0) { S.gaps++; S.lastLip = { s: Math.round(b.s), need: Math.round(seg.need) }; }
      return;
    }
    b.x = nx;
    T.ground(nx, O);
    b.y = O.y;
  }

  function takeOff(s, m, lip) {
    const b = S.ball, c = 1 / Math.sqrt(1 + m * m);
    b.vx = s * c; b.vy = s * m * c;
    if (S.phase === 'run' && b.vx > 0) b.vy += FLOW_POP * S.flow + (lip ? BASE_POP : 0);
    leaveGround(lip ? 'off a lip' : 'off a crest', Math.atan(m));
  }

  const cruise = () => CRUISE + FLOW_SPEED * S.flow;
  const gliding = () => S.streak >= GLIDE_STREAK;
  // gravity in flight: a dive while held, a glide on a Perfect streak, plain otherwise
  const airG = (held) => AIR_G * (held ? DIVE_G : gliding() ? GLIDE_G : 1);


  function leaveGround(how = 'off the track', ang = 0) {
    const b = S.ball;
    if (S.phase === 'run') {
      const sp = Math.hypot(b.vx, b.vy);
      log(`TAKE-OFF ${how}: ${kmh(sp)} km/h at ${deg(Math.atan2(b.vy, b.vx))}\u00B0 (track ${deg(ang)}\u00B0), flow ${S.flow}${S.held ? ', holding' : ''}${gliding() ? ', gliding' : ''}`);
    }
    b.on = false; b.air = 0;
    b.spin = -Math.hypot(b.vx, b.vy) * Math.sign(b.vx || 1) / R;
  }

  function flyStep(dt) {
    const b = S.ball, T = S.track;
    const g = airG(S.held && S.phase === 'run');
    const sp = Math.hypot(b.vx, b.vy), vx0 = b.vx, vy0 = b.vy;
    b.vx -= b.vx * DRAG * sp * dt;
    b.vy -= (g + b.vy * DRAG * sp) * dt;
    // average of old and new velocity: exact under gravity, so a lift-off clears the curve it left
    const nx = b.x + (vx0 + b.vx) / 2 * dt, ny = b.y + (vy0 + b.vy) / 2 * dt;
    b.ang += b.spin * dt;
    b.air += dt;
    if (S.phase !== 'run') { b.x = nx; b.y = ny; return; }   // falling away behind the results card
    const from = T.at(b.x), seg = T.at(nx);
    if (!seg) { b.vx = Math.abs(b.vx) * 0.3; return; }
    if (seg.kind !== 'gap' && T.ground(nx, O) && ny <= O.y) {
      // Coming out of a gap well below the far edge is hitting the end of the tube side-on.
      if (from && from.kind === 'gap' && O.y - ny > R) {
        log(`HIT THE END OF THE TUBE ${Math.round(O.y - ny)}px under the far edge at ${kmh(Math.hypot(b.vx, b.vy))} km/h`);
        b.vx = -b.vx * 0.3;
        fx.shake = Math.max(fx.shake, 0.25);
        burst(b.x, b.y + R, RED, 10, 220);
        Snd.sfx('slam');
        return;
      }
      b.x = nx;
      touchDown(O);
      return;
    }
    b.x = nx; b.y = ny;
    if (seg.kind === 'gap' && b.y < seg.yLow - FALL_DEPTH) fell(seg);
  }

  function touchDown(o) {
    const b = S.ball;
    const m = o.dy, c = 1 / Math.sqrt(1 + m * m);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const vt = b.vx * c + b.vy * m * c;
    const mis = Math.acos(clamp(vt / sp, -1, 1)) * 180 / Math.PI;
    const air = b.air, flowWas = S.flow, inDeg = deg(Math.atan2(b.vy, b.vx));
    b.on = true; b.y = o.y; S.landT = S.t;
    let grade;
    if (air < HOP_AIR) { grade = 'hop'; b.s = vt; }
    else if (mis <= PERFECT_DEG && vt > 0) {
      grade = 'perfect';
      S.flow = Math.min(FLOW_MAX, S.flow + 1);
      b.s = Math.max(sp, cruise()) + PERFECT_KICK;
    } else if (mis <= GOOD_DEG) {
      grade = 'good';
      // a small effect: a little speed, no flow gained, none lost (costing a level kept
      // every run under flow 5 however cleanly it was flown)
      b.s = vt * GOOD_KEEP;
    } else {
      // back to plain cruising: still rolling on, but all the flow is gone
      grade = 'slam';
      S.flow = 0;
      b.s = Math.sign(b.vx || 1) * Math.max(SLAM_MIN, CRUISE);
    }
    b.s = clamp(b.s, -MAX_SPEED, MAX_SPEED);
    S.maxAir = Math.max(S.maxAir, air);
    if (grade !== 'hop' || air > 0.12) {
      log(`LAND ${grade.toUpperCase()} ${Math.round(mis)}\u00B0 off, ${air.toFixed(2)}s up, came in at ${inDeg}\u00B0 onto ${deg(Math.atan(m))}\u00B0 ${(S.track.at(b.x) || {}).kind},` +
        ` ${kmh(sp)}\u2192${kmh(Math.abs(b.s))} km/h, flow ${flowWas}\u2192${S.flow}${S.held ? ', diving' : ''}`);
    }
    judge(grade, air);
  }

  function judge(grade, air) {
    const b = S.ball, cx = b.x, cy = b.y + R;
    if (grade === 'hop') return;
    if (air >= BIG_AIR) {
      S.bonus += Math.round(air * 30);
      say(`BIG AIR ${air.toFixed(1)}s`, [34, 230, 255], 0.9);
    }
    if (grade === 'perfect') {
      S.streak++; S.perfects++; S.bonus += 50;
      say('PERFECT', LIME);
      burst(cx, cy, LIME, 14, 260);
      Snd.sfx('perfect');
      if (S.streak % FEVER_STREAK === 0) ignite();
    } else if (grade === 'good') {
      S.streak = 0; S.bonus += 10;
      say('good', [200, 190, 255], 0.6);
      burst(cx, cy, skinRGB(save.skin, S.t), 6, 160);
      Snd.sfx('good');
    } else {
      S.streak = 0; S.slams++;
      say('SLAM', RED);
      fx.shake = Math.max(fx.shake, 0.35);
      burst(cx, cy, RED, 22, 340);
      Snd.sfx('slam');
    }
  }

  function ignite() {
    const b = S.ball;
    S.fever = FEVER_TIME;
    if (b.on) b.s += FEVER_KICK * Math.sign(b.s || 1);
    else { const sp = Math.hypot(b.vx, b.vy) || 1; b.vx += b.vx / sp * FEVER_KICK; b.vy += b.vy / sp * FEVER_KICK; }
    fx.flash = 0.5;
    say('ON FIRE', FIRE, 1.2, -34);
    log('ON FIRE');
    Snd.sfx('fever');
  }

  function fell(gapSeg) {
    const b = S.ball, T = S.track;
    S.falls++;
    log('FELL into a gap');
    if (S.mode === 'endless' || S.mode === 'gaps') { finish('void'); return; }
    // put it back on the far side, rolling, and charge for it
    const far = T.next(gapSeg);
    b.x = (far ? far.x0 : gapSeg.x1) + 60;
    T.extend(b.x + 7000);
    T.ground(b.x, O);
    b.y = O.y; b.on = true; b.s = RESPAWN_SPEED; b.air = 0;
    S.streak = 0;
    fx.trail.length = 0;
    fx.flash = 0.35;
    if (S.mode === 'airtime') { S.clock = Math.max(0, S.clock - AIR_FALL); say(`-${AIR_FALL}s`, RED); }
    else { S.penalty += SPRINT_FALL; say(`+${SPRINT_FALL}s`, RED); }
    Snd.sfx('slam');
  }

  // ---------- play log ----------
  /* Instrumentation, not a feature: every take-off, landing and press with its
     angle, speed and flow, and a line each second, so a run can be read back
     afterwards ("why was that a slam?"). The last LOG_RUNS runs are kept, and
     the Play log dialog shows them with a Copy button. */
  const LOG_KEY = 'neon-roll-log-v1', LOG_RUNS = 5, LOG_LINES = 6000;
  let logs = [], logRun = null, logHeld = false, logSnapT = 0;
  try { logs = JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (e) { logs = []; }
  const kmh = (v) => Math.round(v / PX_PER_M * 3.6);
  const deg = (a) => Math.round(a * 180 / Math.PI);
  function groundBelow(X) { return S.track.ground(X, Q) ? Q.y : NaN; }

  function logStart() {
    logRun = { when: new Date().toLocaleString(), mode: MODES[S.mode].label, seed: S.track.seed, end: '', lines: [] };
    logs.unshift(logRun);
    logs.length = Math.min(logs.length, LOG_RUNS);
    logHeld = S.held; logSnapT = 0;
  }
  function log(msg) {
    if (!logRun || logRun.end || S.phase !== 'run') return;
    if (logRun.lines.length >= LOG_LINES) return;
    logRun.lines.push(`${S.t.toFixed(2).padStart(7)}s ${String(Math.floor(Math.max(0, S.ball.x) / PX_PER_M)).padStart(5)}m  ${msg}`);
  }
  function logEnd(reason) {
    if (!logRun || logRun.end) return;
    const words = { caught: 'caught by the blackout', void: 'fell into a gap', time: 'out of time', finish: 'finished', restarted: 'restarted' };
    logRun.end = `${words[reason] || reason} at ${Math.floor(S.dist)} m after ${S.t.toFixed(1)}s \u2014 ${S.perfects} Perfect, ${S.slams} slam, best air ${S.maxAir.toFixed(2)}s, shards ${S.runShards}` +
      (S.mode === 'endless' ? `, score ${Math.floor(S.dist) + S.bonus}` : '') + (S.mode === 'sprint' && reason === 'finish' ? `, time ${fmtTime(S.clock + S.penalty)}` : '');
    saveLogs();
  }
  function saveLogs() { try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch (e) { /* too big or blocked */ } }
  function logText(r) {
    if (!r) return 'No runs recorded yet.';
    return [`NEON ROLL PLAY LOG \u2014 ${r.mode}, track ${r.seed}, ${r.when}`, `result: ${r.end || '(still going)'}`,
      `angles: + is up, - is down; a Perfect is within ${PERFECT_DEG}\u00B0 of the track, a near miss within ${GOOD_DEG}\u00B0`, ''].concat(r.lines).join('\n');
  }

  // ---------- effects ----------
  function burst(x, y, col, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.3, life: 0, max: 0.4 + Math.random() * 0.5, col, size: 1.5 + Math.random() * 2.5, g: 900 });
    }
  }

  function say(txt, col, life = 0.9, dy = 0) {
    const b = S.ball;
    fx.texts.push({ txt, col, t: 0, life, x: b.x + b.offx, y: b.y + b.offy, dy });
  }

  function updateFx(dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.life += dt;
      if (p.life >= p.max) { fx.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = fx.texts.length - 1; i >= 0; i--) {
      fx.texts[i].t += dt;
      if (fx.texts[i].t >= fx.texts[i].life) fx.texts.splice(i, 1);
    }
    fx.shake = Math.max(0, fx.shake - dt);
    fx.flash = Math.max(0, fx.flash - dt);

    const b = S.ball;
    if (S.phase === 'run') {
      fx.trail.push({ x: b.x + b.offx, y: b.y + b.offy });
      if (fx.trail.length > 34) fx.trail.shift();
      if (S.fever > 0) {
        for (let i = 0; i < 3; i++) {
          fx.parts.push({
            x: b.x + b.offx + (Math.random() - 0.5) * R, y: b.y + b.offy + (Math.random() - 0.5) * R,
            vx: -(b.on ? b.s : b.vx) * 0.15 + (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 90,
            life: 0, max: 0.25 + Math.random() * 0.3, col: Math.random() < 0.5 ? FIRE : [255, 230, 90], size: 3 + Math.random() * 4, g: -200,
          });
        }
      }
    }
    if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
  }

  // ---------- camera ----------
  function baseScale() {
    // a wide view: at 1300 px/s the ball crosses 1500px in about a second
    return Math.min(W / (W >= H ? 2400 : 1500), H / 900);
  }

  function camTarget() {
    const b = S.ball, T = S.track, base = baseScale();
    const viewW = W / base;
    let low = Infinity;
    for (let i = 0; i <= 14; i++) {
      const X = b.x - 150 + i * (viewW * 0.75 / 14);
      if (T.ground(X, Q)) low = Math.min(low, Q.y);
    }
    if (!isFinite(low)) low = b.y - 200;
    let top = Math.max(b.y, low) + 190, bottom = Math.min(low, b.y) - 130;
    // in the air, keep where the ball will come down in shot, or the landing ring is no use
    const L = S.phase === 'run' && !b.on ? predictLanding(false) : null;   // the let-go landing is the far one
    if (L) { top = Math.max(top, L.y + 190); bottom = Math.min(bottom, L.y - 130); }
    let s = clamp(H / ((top - bottom) * 1.1), base * 0.3, base);
    let cx = b.x + (W / s) * 0.18;
    if (L && L.x > b.x) {
      const left = b.x - 150, right = L.x + 260;
      s = clamp(Math.min(s, W / (right - left)), base * 0.3, base);
      cx = Math.max(cx, (left + right) / 2);
    }
    return { s, x: cx, y: (top + bottom) / 2 };
  }

  function snapCamera() {
    if (!S.track) return;
    const t = camTarget();
    cam.x = t.x; cam.y = t.y; cam.s = t.s;
  }

  function updateCamera(dt) {
    const t = camTarget();
    cam.s += (t.s - cam.s) * (1 - Math.exp(-dt * 2.2));
    const k = 1 - Math.exp(-dt * 7);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * (1 - Math.exp(-dt * 4));
    if (Math.abs(t.x - cam.x) > W / cam.s) cam.x = t.x;   // after a respawn, don't pan across the gap
  }

  const sx = (X) => (X - cam.x) * cam.s + W / 2;
  const sy = (Y) => H / 2 - (Y - cam.y) * cam.s;

  // ---------- drawing ----------
  const STARS = Array.from({ length: 140 }, (_, i) => {
    const r = mulberry32(i * 7919 + 13);
    return { x: r(), y: r() * 0.75, s: 0.5 + r() * 1.3, p: r() * 6.28 };
  });

  function zone() {
    const z = Math.max(0, cam.x) / PX_PER_M / ZONE_M;
    const i = Math.floor(z), f = z - i;
    const a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
    const t = clamp((f - 0.85) / 0.15, 0, 1);
    return { tube: mix(a.tube, b.tube, t), sky: mix(a.sky, b.sky, t) };
  }

  function buildSun(r) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2 * DPR);
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    const gr = g.createLinearGradient(0, 0, 0, r * 2);
    gr.addColorStop(0, '#ffe36b'); gr.addColorStop(0.5, '#ff7a3d'); gr.addColorStop(1, '#ff2fd0');
    g.fillStyle = gr;
    g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = r * (1.0 + i * 0.14), h = 1.5 + i * 1.6;
      g.fillRect(0, y, r * 2, h);
    }
    return c;
  }

  function ridge(u, k) {
    return (1 - Math.abs(Math.sin(u * 0.0023 + k))) * 0.55 +
      (1 - Math.abs(Math.sin(u * 0.0061 + k * 2.3))) * 0.3 +
      (1 - Math.abs(Math.sin(u * 0.017 + k * 4.1))) * 0.15;
  }

  function drawBackdrop(z, now) {
    const hz = H * 0.64;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#030108');
    sky.addColorStop(1, rgba(z.sky, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const st of STARS) {
      const x = ((st.x * W - cam.x * 0.01) % W + W) % W;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(now * 0.0015 + st.p)})`;
      ctx.fillRect(x, st.y * hz, st.s, st.s);
    }

    const r = Math.min(W, H) * 0.2;
    if (!sunCanvas) sunCanvas = buildSun(r);
    const sunX = W * 0.68, sunY = hz - r * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = 'rgba(255,90,160,0.8)'; ctx.shadowBlur = 40;
    ctx.drawImage(sunCanvas, sunX - r, sunY - r, r * 2, r * 2);
    ctx.restore();

    // two ranges of wireframe mountains, far and near
    const layers = [[0.05, 0.16, 1.7, 0.35], [0.12, 0.24, 5.2, 0.55]];
    for (const [par, hgt, k, al] of layers) {
      ctx.beginPath();
      ctx.moveTo(0, hz);
      for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, hz - ridge(x + cam.x * par, k) * H * hgt);
      ctx.lineTo(W, hz);
      ctx.closePath();
      ctx.fillStyle = rgba([8, 3, 18], 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba(z.tube, al * 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // the floor grid, running to the horizon
    const floor = ctx.createLinearGradient(0, hz, 0, H);
    floor.addColorStop(0, '#07020f'); floor.addColorStop(1, '#020006');
    ctx.fillStyle = floor;
    ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = rgba(z.tube, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const rows = 10, scroll = (now * 0.00025) % 1;
    for (let i = 0; i < rows; i++) {
      const t = (i + scroll) / rows;
      const y = hz + (H - hz) * t * t;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    const vx = W / 2, sp = 70, off = ((cam.x * 0.3) % sp + sp) % sp;
    for (let x = -W * 2 - off; x <= W * 3; x += sp) {
      ctx.moveTo(vx + (x - vx) * 0.04, hz);
      ctx.lineTo(x, H);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(z.tube, 0.5);
    ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
  }

  // runs of screen points along the visible track, broken at gaps
  function trackRuns() {
    const T = S.track, X0 = cam.x - (W / 2 + 30) / cam.s, X1 = cam.x + (W / 2 + 30) / cam.s;
    const step = 5 / cam.s;
    const runs = [], caps = [];
    let cur = null;
    for (const seg of T.segs) {
      if (seg.x1 < X0 || seg.x0 > X1) continue;
      if (seg.kind === 'gap') {
        cur = null;
        caps.push([sx(seg.x0), sy(seg.yTop)], [sx(seg.x1), sy(seg.yLow)]);
        continue;
      }
      if (!cur) { cur = []; runs.push(cur); }
      const a = Math.max(seg.x0, X0), b = Math.min(seg.x1, X1);
      for (let X = a; ; X += step) {
        const XX = Math.min(X, b - 1e-6);
        seg.f(XX, Q);
        cur.push(sx(XX), sy(Q.y));
        if (X >= b) break;
      }
    }
    return { runs, caps };
  }

  function strokeRuns(runs) {
    ctx.beginPath();
    for (const r of runs) {
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
    }
    ctx.stroke();
  }

  function drawTrack(z) {
    const { runs, caps } = trackRuns();
    const col = z.tube;
    // a faint curtain of light hanging under the tube
    for (const r of runs) {
      if (r.length < 4) continue;
      let top = Infinity;
      for (let i = 1; i < r.length; i += 2) top = Math.min(top, r[i]);
      const gr = ctx.createLinearGradient(0, top, 0, top + 320);
      gr.addColorStop(0, rgba(col, 0.13)); gr.addColorStop(1, rgba(col, 0));
      ctx.beginPath();
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
      ctx.lineTo(r[r.length - 2], top + 340);
      ctx.lineTo(r[0], top + 340);
      ctx.closePath();
      ctx.fillStyle = gr;
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const k = clamp(cam.s, 0.45, 1.2);
    for (const [w, a] of [[26, 0.05], [14, 0.12], [7, 0.3], [3.2, 0.85]]) {
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = w * k;
      strokeRuns(runs);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2 * k;
    strokeRuns(runs);
    // bright ends where the tube breaks
    for (const [x, y] of caps) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * k);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 16 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // beads on the tube every few metres, so speed reads even on a straight
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const T = S.track, gap = 160;
    const X0 = Math.ceil((cam.x - W / 2 / cam.s) / gap) * gap, X1 = cam.x + W / 2 / cam.s;
    for (let X = X0; X <= X1; X += gap) {
      if (!T.ground(X, Q)) continue;
      ctx.fillRect(sx(X) - 1.5, sy(Q.y) - 1.5, 3, 3);
    }
  }

  function drawFinish() {
    if (S.mode !== 'sprint') return;
    const X = SPRINT_M * PX_PER_M, x = sx(X);
    if (x < -50 || x > W + 50) return;
    const T = S.track;
    const y0 = T.ground(X, Q) ? sy(Q.y) : sy(cam.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[16, 0.08], [6, 0.3], [2, 0.9]]) {
      ctx.strokeStyle = rgba(LIME, a); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - 260 * cam.s); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = rgba(LIME, 0.95);
    ctx.font = `700 ${Math.round(14 + 6 * cam.s)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', x, y0 - 270 * cam.s);
  }

  function drawShards(now) {
    const T = S.track, col = skinRGB(save.skin, S.t);
    const r = Math.max(4, 7 * cam.s);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of T.shards) {
      if (sh.got) continue;
      const x = sx(sh.x), y = sy(sh.y);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const pulse = 1 + 0.15 * Math.sin(now * 0.006 + sh.x * 0.01);
      ctx.fillStyle = rgba(col, 0.18);
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 0.95);
      ctx.beginPath();
      ctx.moveTo(x, y - r * pulse); ctx.lineTo(x + r * 0.65, y); ctx.lineTo(x, y + r * pulse); ctx.lineTo(x - r * 0.65, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawChaser(now) {
    if (S.mode !== 'endless' || S.noChase || S.phase === 'menu') return;
    const x = sx(S.chaseX);
    if (x < -40) return;
    ctx.save();
    ctx.fillStyle = 'rgba(2,0,6,0.94)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let y = 0; y <= H; y += 12) ctx.lineTo(x + Math.sin(y * 0.09 + now * 0.02) * 6 + (Math.random() - 0.5) * 8, y);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const [col, off] of [[[255, 47, 208], -3], [[34, 230, 255], 3]]) {
      ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 12) {
        const xx = x + off + Math.sin(y * 0.09 + now * 0.02) * 6 + (Math.random() - 0.5) * 8;
        if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    const near = (S.ball.x - S.chaseX) / PX_PER_M;
    if (near < 15 && S.phase === 'run') {
      const a = (1 - near / 15) * 0.35;
      const g = ctx.createLinearGradient(0, 0, W * 0.4, 0);
      g.addColorStop(0, rgba(RED, a)); g.addColorStop(1, rgba(RED, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W * 0.4, H);
    }
  }

  /* Where the ball will come down if the player keeps doing what they are doing:
     holding (diving) or not. Flies the same physics forward, and grades the
     landing it finds. Amber's slams were all long flights she didn't dive on —
     from high up, where you'll land is hard to judge by eye. */
  // held: fly the rest of the flight holding (a dive) or not; by default, whatever the button is doing now
  function predictLanding(held = S.held) {
    const b = S.ball, T = S.track;
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    const g = airG(held), dt = 1 / 60, path = [];
    for (let i = 0; i < 300; i++) {
      const sp = Math.hypot(vx, vy), vx0 = vx, vy0 = vy;
      vx -= vx * DRAG * sp * dt; vy -= (g + vy * DRAG * sp) * dt;
      const nx = x + (vx0 + vx) / 2 * dt, ny = y + (vy0 + vy) / 2 * dt;
      const from = T.at(x), seg = T.at(nx);
      if (!seg) return null;
      if (seg.kind !== 'gap' && T.ground(nx, Q) && ny <= Q.y) {
        if (from && from.kind === 'gap' && Q.y - ny > R) return { x: nx, y: Q.y, grade: 'slam', path };
        const c = 1 / Math.sqrt(1 + Q.dy * Q.dy), s2 = Math.hypot(vx, vy) || 1;
        const mis = Math.acos(clamp((vx * c + vy * Q.dy * c) / s2, -1, 1)) * 180 / Math.PI;
        return { x: nx, y: Q.y, dy: Q.dy, grade: mis <= PERFECT_DEG ? 'perfect' : mis <= GOOD_DEG ? 'good' : 'slam', path };
      }
      x = nx; y = ny;
      if (i % 4 === 0) path.push(x, y);
      if (seg.kind === 'gap' && y < seg.yLow - FALL_DEPTH) return { x, y, grade: 'slam', path };
    }
    return null;
  }

  /* The ring is where you come down if you let go now; the small diamond is where you
     come down if you hold all the way. Holding bends the flight down as you go, so the
     ring slides back steadily towards the diamond rather than jumping. (One marker that
     followed the button leapt to the dive spot on a press and back on a release.) */
  const gradeCol = (g) => (g === 'perfect' ? LIME : g === 'good' ? [255, 190, 60] : RED);
  function drawLanding(now) {
    const b = S.ball;
    if (S.phase !== 'run' || b.on || b.air < 0.12) return;
    const L = predictLanding(false);
    if (!L) return;
    const D = predictLanding(true);
    if (D) {
      const dx = sx(D.x), dy = sy(D.y), dr = 6, dc = gradeCol(D.grade);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(dc, 0.55); ctx.strokeStyle = rgba(dc, 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx, dy - dr); ctx.lineTo(dx + dr, dy); ctx.lineTo(dx, dy + dr); ctx.lineTo(dx - dr, dy); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const col = gradeCol(L.grade);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the path, as a fading dotted line
    for (let i = 0; i < L.path.length; i += 2) {
      const a = 0.35 * (1 - i / L.path.length);
      ctx.fillStyle = rgba(col, a);
      ctx.fillRect(sx(L.path[i]) - 1.5, sy(L.path[i + 1]) - 1.5, 3, 3);
    }
    // a ring where it touches down, pulsing
    const x = sx(L.x), y = sy(L.y), r = 9 + 2 * Math.sin(now * 0.012);
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(col, 0.35);
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBall(now) {
    const b = S.ball;
    const col = S.fever > 0 ? mix(skinRGB(save.skin, S.t), FIRE, 0.7) : skinRGB(save.skin, S.t);
    const r = Math.max(6, R * cam.s);
    const x = sx(b.x + b.offx), y = sy(b.y + b.offy);

    // trail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';                  // round caps overlap and add up into beads
    const tr = fx.trail, n = tr.length;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.strokeStyle = rgba(S.fever > 0 ? mix(col, [255, 230, 90], t) : col, t * 0.5);
      ctx.lineWidth = r * 1.4 * t;
      ctx.beginPath(); ctx.moveTo(sx(tr[i - 1].x), sy(tr[i - 1].y)); ctx.lineTo(sx(tr[i].x), sy(tr[i].y)); ctx.stroke();
    }
    const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (S.fever > 0 ? 4.5 : 3.2));
    halo.addColorStop(0, rgba(col, 0.55)); halo.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (gliding() && !b.on && S.phase === 'run') {
      // wings: two soft sweeps either side, beating slowly, folded while diving
      const spread = S.held ? 0.35 : 1, beat = Math.sin(now * 0.008) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(mix(col, WHITE, 0.4), 0.8);
      ctx.lineWidth = Math.max(2, r * 0.25);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * r * 0.6, y);
        ctx.quadraticCurveTo(x + side * r * 2.2 * spread, y - r * (1.6 + beat) * spread, x + side * r * 3.4 * spread, y - r * (0.4 + beat) * spread);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = S.fever > 0 ? '#3a1204' : '#0a0514';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-b.ang);                    // screen y is flipped, so the spin is too
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.3), 0.9);
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, -0.6, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
    ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 0.95);
    ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.25), 1);
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  function drawParts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      const a = 1 - p.life / p.max;
      ctx.fillStyle = rgba(p.col, a);
      const s = p.size * Math.max(0.6, cam.s);
      ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
    }
    ctx.restore();
  }

  function glowText(txt, x, y, size, col, align = 'left', alpha = 1) {
    ctx.font = `800 ${size}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.shadowColor = rgba(col, 0.9 * alpha); ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = rgba(mix(col, WHITE, 0.55), alpha);
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function drawTexts() {
    for (const t of fx.texts) {
      const k = t.t / t.life;
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      glowText(t.txt, sx(t.x), sy(t.y) - 40 - k * 36 + t.dy, 18 + (t.txt.length < 6 ? 4 : 0), t.col, 'center', a);
    }
  }

  function drawHud() {
    if (S.phase === 'menu') return;
    const b = S.ball, cyan = [34, 230, 255], pink = [255, 47, 208];
    const small = W < 520;
    const big = small ? 22 : 28;
    glowText(`${Math.floor(S.dist)} m`, 16, 16 + big, big, cyan);
    let line2 = '';
    if (S.mode === 'endless') line2 = `SCORE ${Math.floor(S.dist) + S.bonus}`;
    else if (S.mode === 'sprint') line2 = fmtTime(S.clock + S.penalty) + `  / ${SPRINT_M} m`;
    else line2 = `${S.perfects} perfect`;
    glowText(line2, 16, 16 + big + 22, 14, pink);
    const kmh = Math.round(Math.abs(b.on ? b.s : Math.hypot(b.vx, b.vy)) / PX_PER_M * 3.6);
    glowText(`${kmh} km/h`, 16, 16 + big + 42, 12, [200, 190, 255], 'left', 0.8);

    // streak pips, or the fever bar while burning
    const px = 16, py = 16 + big + 58;
    if (S.fever > 0) {
      ctx.fillStyle = rgba(FIRE, 0.25); ctx.fillRect(px, py, 90, 6);
      ctx.fillStyle = rgba(FIRE, 0.95); ctx.fillRect(px, py, 90 * S.fever / FEVER_TIME, 6);
    } else {
      for (let i = 0; i < FEVER_STREAK; i++) {
        const on = i < S.streak % FEVER_STREAK;
        const x = px + 6 + i * 16, y = py + 3;
        ctx.fillStyle = on ? rgba(LIME, 1) : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
      }
    }

    if (S.flow > 0) glowText(`FLOW ×${S.flow}`, px + 104, py + 7, 12, S.flow >= FLOW_MAX ? FIRE : LIME, 'left', 0.9);
    if (gliding()) glowText('GLIDE', px + 104, py + 24, 12, [34, 230, 255], 'left', 0.9);

    glowText(`◆ ${S.runShards}`, W - 16, 16 + 22, 20, skinRGB(save.skin, S.t), 'right');

    if (S.mode === 'airtime') {
      const low = S.clock < 5;
      glowText(S.clock.toFixed(1), W / 2, 16 + 34, 34, low ? RED : cyan, 'center');
      glowText(`in the air ${S.airSec.toFixed(1)}s`, W / 2, 16 + 52, 12, b.on ? [200, 190, 255] : LIME, 'center', 0.9);
    }
    if (S.mode === 'endless' && !S.noChase && S.phase === 'run') {
      const near = Math.max(0, (b.x - S.chaseX) / PX_PER_M);
      if (near < 30) glowText(`blackout ${near.toFixed(0)} m`, W - 16, 16 + 44, 12, RED, 'right');
    }

    const lost = S.phase === 'run' && S.noProgT > NO_PROGRESS;
    if (lost) glowText('getting nowhere? press R to restart', W / 2, H - 44, 13, [255, 150, 200], 'center', 0.9);
    stageRestart.hidden = !lost;

    // the button itself, lit while held
    if (S.phase === 'run') {
      const x = W / 2, y = H - 22, on = S.held;
      ctx.strokeStyle = on ? rgba(LIME, 0.9) : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      if (on) { ctx.fillStyle = rgba(LIME, 0.5); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function render(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const z = zone();
    drawBackdrop(z, now);
    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 24, (Math.random() - 0.5) * fx.shake * 24);
    drawTrack(z);
    drawFinish();
    drawShards(now);
    drawLanding(now);
    drawBall(now);
    drawParts();
    drawChaser(now);
    drawTexts();
    ctx.restore();
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    drawHud();
  }

  // ---------- sound ----------
  /* Web Audio only. The music's tempo follows the ball's speed. A low hum that rises with speed on the track (no hiss of
     wind or whoosh on take-off: it sounded like a sledge on snow), blips for
     landings and shards, and a small synthwave loop: bass on the
     eighths and an arpeggio on the sixteenths over Am F C G. */
  const Snd = (() => {
    let ac = null, master = null, music = null, on = false;
    let hum, humGain;
    let nextNote = 0, stepN = 0;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const CHORDS = [[45, 0, 3, 7], [41, 0, 4, 7], [48, 0, 4, 7], [43, 0, 4, 7]];
    const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
    // the tempo follows the ball: BPM_SLOW rolling along, BPM_FAST flat out, eased so it never lurches
    const BPM_SLOW = 88, BPM_FAST = 150, SPEED_SLOW = 450, SPEED_FAST = 1500;
    let bpm = 110, SIX = 60 / bpm / 4;

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      music = ac.createGain(); music.gain.value = 0.22; music.connect(master);
      hum = ac.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 60;
      humGain = ac.createGain(); humGain.gain.value = 0;
      hum.connect(humGain).connect(master); hum.start();
      nextNote = ac.currentTime + 0.1;
    }

    function voice(freq, t, dur, type, vol, cutoff, dest, slide) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(dest || master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function noiseHit(t, dur, vol, cutoff) {
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
      s.connect(f).connect(g).connect(master); s.start(t);
    }

    function sfx(name) {
      if (!on || !ac) return;
      const t = ac.currentTime;
      switch (name) {
        case 'perfect': voice(880, t, 0.12, 'sine', 0.18, 6000); voice(1320, t + 0.06, 0.2, 'sine', 0.16, 6000); break;
        case 'good': voice(660, t, 0.12, 'sine', 0.12, 4000); break;
        // kept at or under the backing music (its kick lands at about 0.055)
        case 'slam': noiseHit(t, 0.18, 0.06, 700); voice(110, t, 0.2, 'sine', 0.06, 600, null, 50); break;
        case 'shard': voice(1760 + Math.random() * 200, t, 0.08, 'sine', 0.08, 8000); break;
        case 'fever': [0, 4, 7, 12, 16].forEach((n, i) => voice(midi(69 + n), t + i * 0.05, 0.2, 'square', 0.07, 3000)); break;
        case 'go': voice(midi(57), t, 0.15, 'square', 0.08, 2000); voice(midi(69), t + 0.08, 0.25, 'square', 0.08, 2500); break;
        case 'over': voice(440, t, 0.7, 'sawtooth', 0.12, 1200, null, 90); break;
        case 'finish': [0, 4, 7, 12].forEach((n, i) => voice(midi(72 + n), t + i * 0.09, 0.3, 'square', 0.08, 3500)); break;
      }
    }

    function update(ball, speed, phase) {
      if (!on || !ac) return;
      const t = ac.currentTime;
      const running = phase === 'run';
      humGain.gain.setTargetAtTime(running && ball.on ? 0.03 + Math.min(0.05, speed / 40000) : 0, t, 0.05);
      hum.frequency.setTargetAtTime(50 + speed * 0.05, t, 0.05);
      music.gain.setTargetAtTime(running ? 0.22 : 0.1, t, 0.3);
      const want = running ? lerp(BPM_SLOW, BPM_FAST, clamp((speed - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1)) : 100;
      bpm += (want - bpm) * 0.02;             // about a second to follow, at 60 fps
      SIX = 60 / bpm / 4;
      if (nextNote < t) nextNote = t + 0.05;
      while (nextNote < t + 0.15) {
        const bar = Math.floor(stepN / 16) % 4, s = stepN % 16, ch = CHORDS[bar];
        const tones = [ch[1], ch[2], ch[3], ch[1] + 12];
        voice(midi(ch[0] + 24 + tones[ARP[s % 8]]), nextNote, SIX * 0.9, 'square', 0.05, 2200, music);
        if (s % 2 === 0) voice(midi(ch[0] - 12 + (s % 4 === 2 ? 12 : 0)), nextNote, SIX * 1.8, 'sawtooth', 0.12, 500, music);
        if (running && s % 4 === 0) voice(120, nextNote, 0.18, 'sine', 0.25, 400, music, 40);
        nextNote += SIX; stepN++;
      }
    }

    function setOn(v) {
      on = v;
      if (v && !ac) init();
      if (ac) { if (v) ac.resume(); else ac.suspend(); }
    }
    function wake() { if (on && ac && ac.state === 'suspended') ac.resume(); }

    return { sfx, update, setOn, wake, get on() { return on; } };
  })();

  // ---------- input ----------
  const holds = new Set();
  const modalOpen = () => !$('help').hidden || !$('balls').hidden || !$('logsheet').hidden;

  function press(src) {
    if (modalOpen()) return;
    if (save.sound && !Snd.on) Snd.setOn(true);     // browsers want a gesture before any audio
    Snd.wake();
    const first = holds.size === 0;
    holds.add(src);
    S.held = true;
    if (!first) return;
    if (S.phase === 'menu') startRun();
    else if (S.phase === 'over' && S.overT > 0.7) startRun();
    else if (S.phase === 'paused') { S.phase = 'run'; panel.hidden = true; }
  }

  function release(src) {
    holds.delete(src);
    S.held = holds.size > 0;
  }

  function releaseAll() { holds.clear(); S.held = false; }

  function pause() {
    releaseAll();
    if (S.phase === 'run') { S.phase = 'paused'; showPanel(); }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    press('p' + e.pointerId);
  });
  const up = (e) => release('p' + e.pointerId);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYS = new Set(['Space', 'ArrowDown', 'ArrowUp', 'Enter', 'KeyS']);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModals(); return; }
    if (e.code === 'KeyP' && !modalOpen()) {
      e.preventDefault();
      if (e.repeat) return;
      if (S.phase === 'run') pause();
      else if (S.phase === 'paused') { S.phase = 'run'; panel.hidden = true; }
      return;
    }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey && !modalOpen()) {
      e.preventDefault();
      if (!e.repeat) restart();
      return;
    }
    if (!KEYS.has(e.code) || modalOpen()) return;
    e.preventDefault();
    if (e.repeat) return;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    press('k' + e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (!KEYS.has(e.code)) return;
    if (!modalOpen()) e.preventDefault();
    release('k' + e.code);
  });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); persist(); } });
  window.addEventListener('pagehide', () => { persist(); saveLogs(); });

  // ---------- chrome ----------
  $('btn-restart').addEventListener('click', () => { $('btn-restart').blur(); restart(); });

  // the on-screen restart offer: its press must not also count as the main button
  const stageRestart = $('btn-stage-restart');
  stageRestart.addEventListener('pointerdown', (e) => e.stopPropagation());
  stageRestart.addEventListener('click', () => { stageRestart.blur(); restart(); });
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); b.blur(); }));

  const btnSound = $('btn-sound');
  function syncSound() {
    btnSound.textContent = `Sound: ${save.sound ? 'on' : 'off'}`;
    btnSound.setAttribute('aria-pressed', save.sound);
  }
  btnSound.addEventListener('click', () => {
    save.sound = !save.sound; persist();
    Snd.setOn(save.sound); syncSound(); btnSound.blur();
  });

  function openModal(id) { pause(); $(id).hidden = false; }
  function closeModals() { $('help').hidden = true; $('balls').hidden = true; $('logsheet').hidden = true; }

  let logPick = 0;
  function showLog() {
    const pick = $('log-pick');
    pick.innerHTML = '';
    logs.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'mode' + (i === logPick ? ' on' : '');
      b.textContent = r === logRun && !r.end ? 'This run' : i === 0 ? 'Latest' : `${i + 1} back`;
      b.addEventListener('click', () => { logPick = i; showLog(); });
      pick.appendChild(b);
    });
    const box = $('log-text');
    box.value = logText(logs[logPick]);
    box.scrollTop = box.scrollHeight;      // the latest moves, not the start of a long run
  }
  $('btn-log').addEventListener('click', () => { logPick = 0; saveLogs(); showLog(); openModal('logsheet'); });
  $('btn-log-copy').addEventListener('click', async () => {
    const t = $('log-text');
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
    $('btn-log-copy').textContent = 'Copied';
    setTimeout(() => { $('btn-log-copy').textContent = 'Copy'; }, 1200);
  });
  $('btn-log-clear').addEventListener('click', () => { logs.length = 0; logRun = null; saveLogs(); showLog(); });
  $('btn-help').addEventListener('click', () => openModal('help'));
  $('btn-balls').addEventListener('click', () => { drawSkins(); openModal('balls'); });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.classList.contains('close')) closeModals(); });
  });

  function drawSkins() {
    $('purse').textContent = save.shards;
    const box = $('skins');
    box.innerHTML = '';
    for (const sk of SKINS) {
      const owned = save.owned.includes(sk.id);
      const b = document.createElement('button');
      b.className = 'skin' + (save.skin === sk.id ? ' on' : '');
      b.disabled = !owned && save.shards < sk.cost;
      const c = document.createElement('canvas');
      c.width = c.height = 72;
      const g = c.getContext('2d'), col = skinRGB(sk.id, 1.3);
      const halo = g.createRadialGradient(36, 36, 8, 36, 36, 36);
      halo.addColorStop(0, rgba(col, 0.6)); halo.addColorStop(1, rgba(col, 0));
      g.fillStyle = halo; g.fillRect(0, 0, 72, 72);
      g.fillStyle = '#0a0514'; g.beginPath(); g.arc(36, 36, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(mix(col, WHITE, 0.25), 1); g.lineWidth = 4;
      g.beginPath(); g.arc(36, 36, 16, 0, Math.PI * 2); g.stroke();
      b.appendChild(c);
      const label = document.createElement('span');
      label.innerHTML = `<span class="name">${sk.name}</span><span class="cost">${save.skin === sk.id ? 'rolling' : owned ? 'owned' : `◆ ${sk.cost}`}</span>`;
      b.appendChild(label);
      b.addEventListener('click', () => {
        if (!save.owned.includes(sk.id)) {
          if (save.shards < sk.cost) return;
          save.shards -= sk.cost;
          save.owned.push(sk.id);
        }
        save.skin = sk.id;
        persist();
        drawSkins();
        if (S.phase === 'menu') showPanel();
      });
      box.appendChild(b);
    }
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, trimT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!S.frozen) {
      if (S.phase === 'run') {
        acc += dt;
        while (acc >= STEP) { tick(STEP); acc -= STEP; if (S.phase !== 'run') { acc = 0; break; } }
      } else {
        acc = 0;
        if (S.phase === 'over') {
          S.overT += dt;
          if (S.overT > 0.7) $('panel-hint').classList.remove('wait');
          if (S.overReason === 'void') flyStep(dt);
        }
      }
      updateFx(dt);
      if (!(S.phase === 'over' && S.overReason === 'void')) updateCamera(dt);   // let a fall drop out of shot
      trimT += dt;
      if (trimT > 5 && S.phase === 'run') {
        trimT = 0;
        const behind = cam.x - W / cam.s;
        S.track.trim((S.mode === 'endless' ? Math.min(S.chaseX, behind) : behind) - 1500);
      }
    }
    const b = S.ball;
    Snd.update(b, Math.abs(b.on ? b.s : Math.hypot(b.vx, b.vy)), S.phase);
    render(now);
    requestAnimationFrame(frame);
  }

  // ---------- debug handle ----------
  window.__neonRoll = {
    get state() { return S; },
    get track() { return S.track; },
    get save() { return save; },
    get cam() { return cam; },
    get view() { return { W, H, DPR }; },
    constants: { PX_PER_M, STEP, G, AIR_G, GLIDE_G, GLIDE_STREAK, LIP_CURVE, CRUISE, FLOW_SPEED, FLOW_MAX, HOLD_G, DIVE_G, DRAG, R, SPRINT_M, FEVER_STREAK, PERFECT_DEG, GOOD_DEG, GOOD_KEEP, SLAM_MIN, LIP_KINK },
    setMode,
    // start a run in a mode; opts.seed pins the track, opts.noChase keeps the blackout away
    start(mode, opts = {}) {
      setMode(mode || S.mode);
      if (opts.seed != null) resetWorld(opts.seed);
      S.noChase = !!opts.noChase;
      startRun();
    },
    // advance the simulation by whole physics steps, without drawing
    step(sec) {
      let n = Math.round(sec / STEP);
      while (n-- > 0 && S.phase === 'run') tick(STEP);
      updateCamera(sec);
    },
    hold(v) { S.held = !!v; },
    logText: (i = 0) => logText(logs[i]),
    restart,
    // the track at world x: { y, dy } or null over a gap
    ground(x) { return S.track.ground(x, Q) ? { y: Q.y, dy: Q.dy } : null; },
    predictLanding,
    freeze(v) { S.frozen = !!v; },
    probe() {
      const b = S.ball, on = b.on && S.track.ground(b.x, Q);
      return {
        phase: S.phase, on: !!on, dy: on ? Q.dy : 0, x: b.x, y: b.y, s: b.s, vx: b.vx, vy: b.vy, air: b.air,
        flow: S.flow, dist: S.dist, t: S.t, falls: S.falls, gaps: S.gaps, perfects: S.perfects, slams: S.slams, reason: S.overReason,
        lastLip: S.lastLip,
      };
    },
    snapCamera,
  };

  // ---------- boot ----------
  new ResizeObserver(resize).observe(stage);
  setMode(S.mode);
  resize();
  syncSound();                             // the context itself waits for the first press
  requestAnimationFrame(frame);
})();
