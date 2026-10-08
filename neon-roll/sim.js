/* Neon Roll: the rules and the physics. Ski on Neon (and Tiny Wings before it) with a
   glowing ball in place of the skier. One button: holding presses the ball into the track,
   so it gathers speed down a slope and bleeds it back out going up; letting go lets it fly
   off the next crest. Land along the slope for a Perfect, and three in a row set it on fire.

   The track is stitched from pieces (symmetric cosine hills, and in the Gaps mode kicker
   ramps, gaps and landing slopes), each of which knows its own height, slope and curvature
   exactly, so the ball leaves the ground where the physics says it would (the track curving
   away faster than gravity can hold it on) rather than wherever a sampled polyline kinks.

   World y points up. The ball is simulated as its contact point with the tube; the drawn
   ball sits one radius out along the track's normal. No page access here:

     const nr = createRoll({ save, on, pickSeed })
       save      the player's save (shards, skin, bests); finish() writes new bests into it
       pickSeed  the track for the next run in any mode but Sprint (whose course is fixed)
       on        on(event, data): 'sfx' name, 'burst' {x,y,col,n,speed}, 'say' {txt,col,life,dy},
                 'shake' s, 'flash' s, 'trail-reset', 'reset' seed (a new track), 'run',
                 'finish' reason, 'save' */

export function createRoll({ save, on = () => {}, pickSeed = () => (Math.random() * 2 ** 31) | 0 } = {}) {
  const sfx = (name) => on('sfx', name);
  const burst = (x, y, col, n, speed) => on('burst', { x, y, col, n, speed });
  const say = (txt, col, life = 0.9, dy = 0) => on('say', { txt, col, life, dy });

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


  // ---------- state ----------
  const S = {
    mode: save.mode, phase: 'menu', track: null,
    ball: null, held: false, frozen: false, noChase: false,
    t: 0, dist: 0, bonus: 0, runShards: 0, streak: 0, perfects: 0, fever: 0,
    clock: 0, penalty: 0, chaseX: 0, falls: 0, gaps: 0, slams: 0, maxAir: 0,
    overT: 0, overReason: '', newBest: {}, paused: false, lastLip: null, landT: -1, bestX: 0, noProgT: 0, flow: 0,
  };
  const O = { y: 0, dy: 0, ddy: 0 };        // scratch for physics
  const Q = { y: 0, dy: 0, ddy: 0 };        // scratch for the camera and drawing

  function newBall() {
    return { x: -640, y: 0, vx: 0, vy: 0, s: 0, on: true, ang: 0, spin: 0, air: 0, offx: 0, offy: R };
  }

  function resetWorld(seed) {
    if (seed == null) seed = S.mode === 'sprint' ? SPRINT_SEED : pickSeed();
    S.track = makeTrack(seed, { gaps: S.mode === 'gaps' });
    S.ball = newBall();
    S.track.ground(S.ball.x, O);
    S.ball.y = O.y;
    Object.assign(S, {
      held: false, noProgT: 0, flow: 0, landT: -1, t: 0, dist: 0, bonus: 0, runShards: 0, streak: 0, perfects: 0, fever: 0,
      clock: S.mode === 'airtime' ? AIRTIME_LENGTH : 0, airSec: 0, penalty: 0, falls: 0, gaps: 0, slams: 0, maxAir: 0,
      chaseX: S.ball.x - CHASE_OPEN, overT: 0, overReason: '', newBest: {},
    });
    S.bestX = S.ball.x;
    S.seed = seed;
    on('reset', seed);
  }

  // the state part of choosing a mode; the page does the buttons and the panel
  function selectMode(mode) {
    if (!MODES[mode]) return false;
    S.mode = mode;
    S.phase = 'menu';
    S.noChase = false;                     // a test's start(..., { noChase }) must not outlive it
    resetWorld();
    return true;
  }

  function startRun() {
    if (S.phase === 'over') resetWorld();
    S.phase = 'run';
    S.ball.s = START_SPEED;
    on('run');
    sfx('go');
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
    on('save');
    if (reason === 'void' || reason === 'caught' || reason === 'time') { on('shake', 0.5); sfx('over'); }
    else sfx('finish');
    on('finish', reason);
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
        sfx('shard');
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
      leaveGround();
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
    leaveGround();
  }

  const cruise = () => CRUISE + FLOW_SPEED * S.flow;
  const gliding = () => S.streak >= GLIDE_STREAK;
  // gravity in flight: a dive while held, a glide on a Perfect streak, plain otherwise
  const airG = (held) => AIR_G * (held ? DIVE_G : gliding() ? GLIDE_G : 1);


  function leaveGround() {
    const b = S.ball;
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
        b.vx = -b.vx * 0.3;
        on('shake', 0.25);
        burst(b.x, b.y + R, RED, 10, 220);
        sfx('slam');
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
    const air = b.air;
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
      sfx('perfect');
      if (S.streak % FEVER_STREAK === 0) ignite();
    } else if (grade === 'good') {
      S.streak = 0; S.bonus += 10;
      say('good', [200, 190, 255], 0.6);
      burst(cx, cy, skinRGB(save.skin, S.t), 6, 160);
      sfx('good');
    } else {
      S.streak = 0; S.slams++;
      say('SLAM', RED);
      on('shake', 0.35);
      burst(cx, cy, RED, 22, 340);
      sfx('slam');
    }
  }

  function ignite() {
    const b = S.ball;
    S.fever = FEVER_TIME;
    if (b.on) b.s += FEVER_KICK * Math.sign(b.s || 1);
    else { const sp = Math.hypot(b.vx, b.vy) || 1; b.vx += b.vx / sp * FEVER_KICK; b.vy += b.vy / sp * FEVER_KICK; }
    on('flash', 0.5);
    say('ON FIRE', FIRE, 1.2, -34);
    sfx('fever');
  }

  function fell(gapSeg) {
    const b = S.ball, T = S.track;
    S.falls++;
    if (S.mode === 'endless' || S.mode === 'gaps') { finish('void'); return; }
    // put it back on the far side, rolling, and charge for it
    const far = T.next(gapSeg);
    b.x = (far ? far.x0 : gapSeg.x1) + 60;
    T.extend(b.x + 7000);
    T.ground(b.x, O);
    b.y = O.y; b.on = true; b.s = RESPAWN_SPEED; b.air = 0;
    S.streak = 0;
    on('trail-reset');
    on('flash', 0.35);
    if (S.mode === 'airtime') { S.clock = Math.max(0, S.clock - AIR_FALL); say(`-${AIR_FALL}s`, RED); }
    else { S.penalty += SPRINT_FALL; say(`+${SPRINT_FALL}s`, RED); }
    sfx('slam');
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

  return {
    mulberry32, hsl, skinRGB, makeTrack, newBall, resetWorld, startRun, finish, tick, rollStep, takeOff, leaveGround, flyStep, touchDown, judge, ignite, fell, predictLanding, PX_PER_M, STEP, G, AIR_G, CRUISE, FLOW_SPEED, FLOW_MAX, FLOW_POP, BASE_POP, CRUISE_PULL, CRUISE_EASE, CLIMB_ASSIST, CRUISE_FLOOR, HOLD_G, DIVE_G, DRAG, ROLL, MAX_SPEED, R, PERFECT_DEG, GOOD_DEG, GLIDE_STREAK, GLIDE_G, SETTLE, HOP_AIR, GOOD_KEEP, SLAM_MIN, LIP_KINK, LIP_CURVE, BOOST_MARGIN, LAND_SLOPE, LAND_RUN, RAMP_Q, RIPPLE, RIPPLE_SLOPE, BIG_HILL, BIG_SLOPE, SWELL_MIN, SWELL_HOLD, BIG_WAVE, LAUNCH_KEEP, REACH_FIT, PERFECT_KICK, FEVER_STREAK, FEVER_TIME, FEVER_KICK, FEVER_PUSH, BIG_AIR, START_SPEED, CHASE_START, CHASE_RAMP, CHASE_MAX, CHASE_LAG, CHASE_OPEN, AIRTIME_LENGTH, AIR_FALL, SPRINT_M, SPRINT_SEED, SPRINT_FALL, NO_PROGRESS, PROGRESS_PX, RESPAWN_SPEED, FALL_DEPTH, ZONE_M, LEAD_FROM, MODES, ZONES, SKINS, LIME, RED, FIRE, WHITE, clamp, lerp, rgba, mix, S, O, Q, cruise, gliding, airG,
    selectMode,
  };
}
