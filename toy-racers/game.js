/* Toy Racers — five toy cars racing round a circuit laid out in the clutter on a
   workbench desk: clear tubing for the bends, a steel rule for the fast bit, a
   floppy-disk stack to jump off, and spilt coffee to spoil your afternoon.

   The desk is one canvas. Everything static about a track (the wood, the track
   surfaces, the props) is baked into an offscreen layer once when the race loads;
   only the cars, the skid marks and the particles are drawn per frame.

   Plain DOM/canvas, no build step, no dependencies. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- constants ----------

  const SAVE_KEY = 'toy-racers-save-v2';
  // The game lived in paddock/ until 2026-09-24; carry its saved keys across once.
  [[SAVE_KEY, 'paddock-save-v2']].forEach(([now, was]) => {
    try {
      const old = localStorage.getItem(was);
      if (old !== null && localStorage.getItem(now) === null) localStorage.setItem(now, old);
      localStorage.removeItem(was);
    } catch (e) { /* storage blocked */ }
  });

  // The desk in world units. The race camera follows your car, so the desk no
  // longer has to fit on screen whole: it is half as big again as Amber's
  // 1600x1000 plate, which is stretched over it, so the props have room to lie
  // round the track instead of being packed in between the bends.
  const DESK_W = 2400, DESK_H = 1500;
  const UNITS_PER_CM = 26;       // the desk is about 90cm across, for readable gaps

  const STEP = 1 / 120;          // fixed physics step, s
  const MAX_FRAME = 0.1;         // never simulate more than this much in one frame

  // The race camera follows your car rather than showing the whole desk, so a
  // lap is something you drive round rather than watch from above. CAM_AREA is
  // how much desk is on screen, in world units squared, so a phone and a wide
  // monitor see about the same amount of track (~760x475 on a 1.6:1 arena).
  // It leads the car in the direction it is going, far enough that a corner is
  // on screen before its braking point (~120 units at top speed).
  const CAM_AREA = 760 * 475;
  const CAM_LEAD_T = 0.55;       // s of travel the camera looks ahead
  const CAM_LEAD_MAX = 150;      // world units, however fast the car
  const CAM_FOLLOW = 5;          // how quickly the camera catches the car, 1/s
  const CAM_ZOOM_IN = 2.4;       // s to swoop in from the whole desk at the grid

  // Centreline resampling. Small enough that a sample is always a good local
  // approximation of the track, big enough that a lap is a few hundred of them.
  const SAMPLE_STEP = 7;
  // How far either side of a car's last known sample to look for its new one.
  // A window rather than a global search is what lets a track cross itself.
  const SEARCH = 26;

  // Surfaces. `top` and `acc` are shares of the car's rated figures; `grip` is how
  // fast the velocity swings round to follow the nose, which is the whole feel of
  // the thing. `wall` means the surface has raised sides you can lean on.
  const SURF = {
    mat:   { name: 'card',    top: 0.92, acc: 0.95, grip: 1.05, drag: 0.55 },
    desk:  { name: 'wood',    top: 0.84, acc: 0.82, grip: 0.80, drag: 0.95, grit: 0.55 },
    tube:  { name: 'tubing',  top: 1.00, acc: 1.00, grip: 1.30, drag: 0.45, wall: true },
    ruler: { name: 'steel',   top: 1.14, acc: 1.06, grip: 0.46, drag: 0.30, sheen: true },
    ramp:  { name: 'ramp',    top: 1.06, acc: 1.00, grip: 0.90, drag: 0.35, jump: true },
    boost: { name: 'boost',   top: 1.00, acc: 1.00, grip: 1.15, drag: 0.45, boost: true },
  };
  // off the track altogether — bare desk, dust and disappointment
  const OFF = { name: 'off desk', top: 0.42, acc: 0.50, grip: 0.62, drag: 2.6, grit: 1 };

  // Handling. These are ported from the old isometric Toy Racers, which drove
  // well: its figures were in tiles (64 world units) per second, so a mid-range
  // car there had a top speed of ~170, acceleration ~134 and a turn radius of
  // about 110 units flat out. A first pass at this rewrite ran at 336 and 400
  // with a 189-unit radius, which meant the car could not physically get round
  // its own tightest corner without braking to 60% — hence "very difficult".
  const GRIP_RATE = 7.4;         // scales SURF.grip into a per-second convergence
  const TURN = 3.0;              // rad/s the wheels can ask for
  const TURN_V = 48;             // speed by which steering has full authority
  const LAT_ACCEL = 900;         // sideways grip, units/s² — caps the turn rate
  // A slippery surface should cost you grip, not the ability to steer at all.
  // Scaling the turn cap by SURF.grip raw gave the steel rule (0.46) a 155-unit
  // turn radius, so rule corners were literally impossible and the logs showed
  // half the lap spent off the track at exactly those corners.
  const LAT_FLOOR = 0.55;        // share of the cornering cap every surface keeps
  const TOP_SPEED = 265;         // world units/s
  const ACCEL = 270;             // world units/s² at rated acceleration
  const BRAKE = 520;
  const REVERSE = 150;           // top speed backwards
  const ROLL_DRIVE = 0.22;       // drag under power, /s
  const ROLL_COAST = 1.25;       // drag off the throttle — lifting slows you down
  const HANDBRAKE_GRIP = 0.22;   // grip multiplier while the handbrake is down
  const DRIFT_HOLD = 0.42;       // how much grip a slide sheds, so it can be held
  const SPIN_SLIP = 0.62;        // slip angle (rad) past which the tyres are screaming

  // Lateral acceleration a car can hold through a bend, before grip and nerve.
  // It sets the whole pace of the race: v = sqrt(CORNER_A * grip / curvature).
  const CORNER_A = 330;

  const G_AIR = 170;             // gravity for a jump, world units/s²
  const JUMP_MIN = 120;          // below this you just rattle over the ramp
  const JUMP_VZ = 0.135;         // share of speed turned into lift

  const WET_TIME = 2.4;          // seconds your tyres stay coffee-soaked
  const WET_GRIP = 0.42;

  const DRAFT_DIST = 210;        // how far back the tow reaches
  const DRAFT_CONE = 0.55;       // rad either side of directly behind
  const DRAFT_FILL = 0.42;       // meter per second while tucked in
  const DRAFT_PULL = 0.16;       // free acceleration share while tucked in
  const BOOST_TIME = 1.5;        // how long a spent slipstream lasts
  const BOOST_POWER = 1.34;

  const CAR_LEN = 46, CAR_WID = 26;
  const CAR_R = 17;              // collision radius
  const RESTITUTION = 0.42;

  const LAP_OPTS = [3, 5, 8];
  const CLASS_OPTS = [
    { id: 'easy', name: 'Gentle', skill: 0.80, rubber: 0.30 },
    { id: 'mid', name: 'Keen', skill: 0.92, rubber: 0.20 },
    { id: 'hard', name: 'Ruthless', skill: 1.00, rubber: 0.12 },
  ];

  // ---------- the field ----------

  // Names lifted from the standings panel on Amber's plate.
  const RIVALS = [
    { name: 'Rex Bluebottle', colour: 'blue', skill: 1.00, nerve: 0.95, line: 0.10 },
    { name: 'Ola Wasp', colour: 'yellow', skill: 0.96, nerve: 0.80, line: -0.22 },
    { name: 'Dot Marigold', colour: 'green', skill: 0.92, nerve: 0.66, line: 0.26 },
    { name: 'Sid Marmalade', colour: 'purple', skill: 0.89, nerve: 1.00, line: -0.08 },
    { name: 'Pip Tuppence', colour: 'teal', skill: 0.94, nerve: 0.72, line: 0.02 },
  ];

  const COLOURS = {
    red: { body: '#d2402d', dark: '#8d2016', light: '#ef7460', trail: '#ff7a55' },
    blue: { body: '#2c7ecb', dark: '#174a82', light: '#68b0ee', trail: '#65c8ff' },
    yellow: { body: '#e9b02a', dark: '#9a6c0d', light: '#ffd268', trail: '#ffd45e' },
    green: { body: '#5aa73c', dark: '#2f6b1d', light: '#93d472', trail: '#8ce85f' },
    purple: { body: '#8a5cc4', dark: '#553380', light: '#b892e8', trail: '#c08bff' },
    teal: { body: '#2fa5a0', dark: '#166d69', light: '#6fd6d1', trail: '#68e6df' },
    orange: { body: '#e2762a', dark: '#9c460c', light: '#ffa363', trail: '#ff9d4d' },
  };

  const PLAYER_COLOURS = ['red', 'orange', 'green', 'purple', 'teal'];

  // ---------- the desk dressing ----------

  // One shared layout, because it is one desk. `r` is the collision radius; a prop
  // with no `r` is scenery you drive straight over. Positions are world units,
  // `s` scales the sprite, `rot` is degrees.
  // Only the things right at the edges of the desk are shared — everything else
  // is placed per track, along the lap rather than heaped in the infield, since
  // the camera follows the car and what you drive past is what you see. Things
  // may lie on each other where that is how they would land (a pen across a pen,
  // pliers on the cables); only solid ones (`r`) have to stay off the road.
  const DRESSING = [
    { id: 'plant-back', img: 'plant', x: 2301, y: 108, s: 1.1, r: 56 },
    { id: 'snes', img: 'gamepad-snes', x: 1599, y: 60, s: 0.95, r: 60 },
    { id: 'ps', img: 'gamepad-ps', x: 120, y: 1443, s: 1.0, r: 62 },
    { id: 'plant-front', img: 'plant', x: 2322, y: 1416, s: 0.9, r: 48 },
    { id: 'bolt-a', img: 'bolt-tall', x: 1374, y: 90, s: 0.8 },
    { id: 'paperclip', img: 'paperclip', x: 705, y: 1458, s: 0.9 },
  ];

  // A track is a closed Catmull-Rom through [x, y, halfWidth, surface]. The flags
  // and the chequered mat go on the first node, so node 0 is the start line.
  //
  // Tight corners are fine and are the interesting part; what is not fine is a
  // tight corner made of steel rule. The rule has a third of the grip of the
  // tubing, and the first versions put R=88 bends on it — corners that demanded
  // a 50% speed cut and could not be taken at all. The rule now only ever runs
  // down parts of a lap straight enough to slide along, which `test/toy-racers`
  // checks by working out the fastest each sample can be taken at.
  const TRACKS = [
    {
      id: 'workbench',
      name: 'Workbench Sprint',
      blurb: 'The circuit off the plate — a coil of tubing, the floppy jump, then the rule all the way down.',
      nodes: [
        [840, 1269, 64, 'mat'],
        [1185, 1341, 64, 'boost'],
        [1500, 1290, 64, 'desk'],
        [1716, 1317, 64, 'desk'],
        [1917, 1200, 58, 'tube'],
        [2088, 1050, 58, 'tube'],
        [2172, 843, 58, 'tube'],
        [2157, 630, 58, 'tube'],
        [2067, 441, 58, 'tube'],
        [1887, 303, 58, 'tube'],
        [1662, 237, 58, 'tube'],
        [1374, 249, 58, 'tube'],
        [1071, 312, 54, 'ramp'],
        [795, 474, 54, 'ruler'],
        [543, 660, 54, 'ruler'],
        [336, 861, 64, 'desk'],
        [279, 1089, 64, 'desk'],
        [444, 1263, 64, 'desk'],
      ],
      omit: ['snes'],
      puddles: [{ x: 2097, y: 558, r: 74 }],
      extra: [
        // the rule is propped on the stack, so the stack goes down first and is
        // not solid — you drive over it
        { img: 'floppies', x: 1071, y: 312, s: 1.05, under: true },
        { img: 'mug-spill', x: 2250, y: 440, s: 1.1, r: 58 },   // the spill runs down onto the puddle on the coil
        { img: 'pencil', x: 1059, y: 1404, s: 0.95, rot: 6 },
        { img: 'chips-flat', x: 1450, y: 1453, s: 0.9, r: 34 },
        { img: 'bolt', x: 1558, y: 1400, s: 0.8 },
        { img: 'pliers', x: 2091, y: 1274, s: 1, rot: 24, r: 48 },
        { img: 'lamp', x: 2326, y: 961, s: 1.1, r: 52 },
        { img: 'bolt-wide', x: 1873, y: 189, s: 0.75 },
        { img: 'gamepad-snes', x: 1633, y: 71, s: 0.95, rot: -6, r: 60 },
        { img: 'screwdriver', x: 829, y: 293, s: 1, rot: -30, r: 34 },
        { img: 'eraser', x: 602, y: 494, s: 0.9 },
        { img: 'pencil', x: 642, y: 514, s: 0.95, rot: -30 },   // across the eraser
        { img: 'lamp-small', x: 284, y: 680, s: 1, r: 46 },
        { img: 'chips-tall', x: 125, y: 1148, s: 0.95, r: 44 },
        { img: 'chips-flat', x: 147, y: 1222, s: 0.9, r: 34 },
        { img: 'toolbox', x: 1707, y: 1137, s: 1, r: 56 },
        { img: 'bolt-small', x: 1621, y: 1161, s: 0.8 },   // spilt out of the toolbox
        { img: 'bolt', x: 1659, y: 1213, s: 0.8, rot: 30 },
        { img: 'cables', x: 1971, y: 706, s: 1, r: 74 },
        { img: 'pliers', x: 1907, y: 762, s: 0.95, rot: -20 },   // dropped on the cables
        { img: 'pen-green', x: 1552, y: 362, s: 1, rot: 3, r: 30 },
        { img: 'pen-blue', x: 1586, y: 396, s: 1, rot: -28, r: 30 },   // across the green one
        { img: 'paperclip', x: 1224, y: 358, s: 0.9, rot: 20 },
        { img: 'ruler', x: 1150, y: 800, s: 0.8, rot: -10 },
        { img: 'screwdriver', x: 1210, y: 834, s: 0.95, rot: 40 },   // on the rule
        { img: 'plant', x: 880, y: 960, s: 0.9, r: 48 },
        { img: 'bolt-tall', x: 502, y: 1169, s: 0.8 },
        { img: 'floppies', x: 250, y: 220, s: 1.05, rot: -8, r: 62 },
        { img: 'eraser', x: 370, y: 280, s: 0.85, rot: 20 },
      ],
    },
    {
      id: 'coffee',
      name: 'Coffee Break',
      blurb: 'Two long runs and a hairpin at each end, with the spilt mug draining onto the back straight.',
      nodes: [
        [690, 1123, 64, 'mat'],
        [1206, 1168, 64, 'boost'],
        [1686, 1138, 58, 'tube'],
        [1998, 988, 58, 'tube'],
        [2073, 742, 58, 'tube'],
        [1905, 529, 58, 'tube'],
        [1593, 466, 64, 'desk'],
        [1230, 418, 54, 'ruler'],
        [870, 373, 54, 'ruler'],
        [546, 418, 58, 'tube'],
        [348, 601, 58, 'tube'],
        [363, 832, 58, 'tube'],
        [507, 1006, 64, 'desk'],
      ],
      omit: [],
      puddles: [{ x: 1428, y: 442, r: 70 }, { x: 1050, y: 397, r: 54 }],
      extra: [
        { img: 'mug-spill', x: 1590, y: 300, s: 1.15, r: 58 },   // the spill runs onto the back straight
        { img: 'floppies', x: 1130, y: 237, s: 1.05, r: 62 },
        { img: 'screwdriver', x: 1230, y: 227, s: 1, rot: -10 },
        { img: 'lamp', x: 338, y: 326, s: 1.1, r: 52 },
        { img: 'eraser', x: 765, y: 290, s: 0.9 },
        { img: 'pencil', x: 269, y: 793, s: 0.95, rot: 70 },
        { img: 'ruler', x: 799, y: 1266, s: 0.72, rot: 4 },
        { img: 'chips-tall', x: 1369, y: 1325, s: 0.95, r: 44 },
        { img: 'chips-flat', x: 1441, y: 1351, s: 0.9, r: 34 },
        { img: 'pliers', x: 2163, y: 1051, s: 1, rot: 24, r: 48 },
        { img: 'toolbox', x: 2078, y: 448, s: 1, r: 56 },
        { img: 'bolt', x: 2148, y: 512, s: 0.8, rot: 20 },
        { img: 'bolt-small', x: 2174, y: 454, s: 0.8 },
        { img: 'pen-green', x: 1460, y: 316, s: 1, rot: -4, r: 30 },   // lying in the coffee
        { img: 'cables', x: 1116, y: 951, s: 1, r: 74 },
        { img: 'lamp-small', x: 1899, y: 754, s: 1, r: 46 },
        { img: 'pen-blue', x: 1263, y: 538, s: 1, rot: 6, r: 30 },
        { img: 'pencil', x: 1223, y: 574, s: 0.95, rot: 20 },   // across the pen
        { img: 'plant', x: 1250, y: 780, s: 0.9, r: 48 },
        { img: 'bolt-wide', x: 1360, y: 820, s: 0.75 },
        { img: 'eraser', x: 900, y: 700, s: 0.85, rot: -12 },
        { img: 'paperclip', x: 960, y: 750, s: 0.9, rot: 30 },
        { img: 'bolt-tall', x: 432, y: 659, s: 0.8 },
      ],
    },
    {
      id: 'longrule',
      name: 'The Long Rule',
      blurb: 'Right round the rim of the desk, with a jump along the back and the rule down both sides.',
      nodes: [
        [450, 1320, 64, 'mat'],
        [930, 1380, 64, 'boost'],
        [1440, 1386, 64, 'desk'],
        [1872, 1329, 54, 'ruler'],
        [2106, 1179, 54, 'ruler'],
        [2223, 960, 58, 'tube'],
        [2205, 693, 58, 'tube'],
        [2034, 459, 58, 'tube'],
        [1740, 312, 58, 'tube'],
        [1419, 243, 54, 'ramp'],
        [1074, 228, 58, 'tube'],
        [744, 285, 54, 'ruler'],
        [483, 420, 54, 'ruler'],
        [279, 609, 58, 'tube'],
        [183, 840, 58, 'tube'],
        [201, 1074, 64, 'desk'],
        [291, 1230, 64, 'desk'],
      ],
      omit: ['snes'],
      puddles: [{ x: 1638, y: 1356, r: 72 }],
      extra: [
        // the rule over the back is propped on the stack too
        { img: 'floppies', x: 1419, y: 243, s: 1.05, under: true },
        { img: 'mug-spill', x: 1768, y: 1200, s: 1.15, r: 58 },   // the spill runs down to the puddle
        { img: 'lamp', x: 140, y: 190, s: 1.1, r: 52 },
        { img: 'bolt-wide', x: 1110, y: 134, s: 0.75 },
        { img: 'paperclip', x: 778, y: 177, s: 0.9, rot: -10 },
        { img: 'eraser', x: 1983, y: 303, s: 0.9 },
        { img: 'pencil', x: 136, y: 732, s: 0.95, rot: 80 },
        { img: 'bolt', x: 2318, y: 802, s: 0.8 },
        { img: 'cables', x: 439, y: 726, s: 1, r: 74 },
        { img: 'pliers', x: 499, y: 786, s: 0.95, rot: 10 },   // on the cables
        { img: 'gamepad-snes', x: 797, y: 440, s: 0.95, rot: 8, r: 60 },
        { img: 'pen-green', x: 1312, y: 357, s: 1, rot: -4, r: 30 },
        { img: 'pen-blue', x: 1352, y: 387, s: 1, rot: 30, r: 30 },   // across the green one
        { img: 'toolbox', x: 2011, y: 700, s: 1, r: 56 },
        { img: 'bolt-small', x: 1931, y: 730, s: 0.8 },
        { img: 'bolt-tall', x: 1971, y: 784, s: 0.8, rot: 60 },
        { img: 'lamp-small', x: 1728, y: 486, s: 1, r: 46 },
        { img: 'chips-tall', x: 1089, y: 1224, s: 0.95, r: 44 },
        { img: 'chips-flat', x: 1159, y: 1250, s: 0.9, r: 34 },
        { img: 'screwdriver', x: 353, y: 1094, s: 1, rot: -20, r: 34 },
        { img: 'plant', x: 1200, y: 800, s: 0.9, r: 48 },
        { img: 'ruler', x: 880, y: 760, s: 0.8, rot: 12 },
        { img: 'pencil', x: 960, y: 800, s: 0.95, rot: -50 },   // across the rule
      ],
    },
  ];

  const SPRITES = [
    'desk', 'lamp', 'lamp-small', 'pencil', 'screwdriver', 'gamepad-snes', 'plant',
    'gamepad-ps', 'eraser', 'ruler', 'floppies', 'mug-spill', 'pliers', 'bolt-tall',
    'toolbox', 'cables', 'pen-blue', 'bolt-wide', 'pen-green', 'bolt-small', 'flag',
    'flags', 'bolt', 'paperclip', 'chips-tall', 'chips-flat',
  ];

  // ---------- small helpers ----------

  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  function fmtTime(ms) {
    if (!isFinite(ms) || ms < 0) return '—:—.—';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const c = Math.floor((ms % 1000) / 10);
    return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function trackProps(def) {
    const omit = new Set(def.omit || []);
    return DRESSING.filter((p) => !omit.has(p.id)).concat(def.extra || []);
  }

  // A desk is about 60cm across and the world is 1600 units wide, so a gap
  // reads far better in centimetres of desk than in engine units.
  function gapText(d) {
    if (!(d > 0)) return '+0.0cm';
    const laps = Math.floor(d / state.track.len);
    if (laps >= 1) return `+${laps} lap${laps > 1 ? 's' : ''}`;
    return `+${(d / UNITS_PER_CM).toFixed(1)}cm`;
  }

  // ---------- save ----------

  const save = loadSave();

  function loadSave() {
    const blank = { v: 2, colour: 'red', laps: 5, cls: 'mid', best: {}, wins: 0, races: 0, sound: true };
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!raw || raw.v !== 2) return blank;
      return Object.assign(blank, raw, { best: Object.assign({}, raw.best) });
    } catch (e) {
      return blank;
    }
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  }

  // ---------- art ----------

  const art = {};
  let artReady = false;
  let artPromise = null;

  function loadArt() {
    if (artPromise) return artPromise;
    let left = SPRITES.length;
    return (artPromise = new Promise((done) => {
      SPRITES.forEach((name) => {
        const img = new Image();
        img.onload = img.onerror = () => { if (--left === 0) { artReady = true; done(); } };
        img.src = `assets/${name}.${name === 'desk' ? 'jpg' : 'png'}`;
        art[name] = img;
      });
    }));
  }

  // ---------- building a track ----------

  // Catmull-Rom through the control points, closed, resampled to a near-even
  // spacing so that "index" and "distance along the track" are interchangeable.
  function buildTrack(def) {
    const n = def.nodes.length;
    const at = (i) => def.nodes[((i % n) + n) % n];

    // fine walk first, then resample it to even arc length
    const fine = [];
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const sub = 28;
      for (let j = 0; j < sub; j++) {
        const t = j / sub, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        const w = lerp(p1[2], p2[2], t);
        fine.push({ x, y, w, surf: t < 0.5 ? p1[3] : p2[3], node: i + t });
      }
    }

    // cumulative length round the fine walk
    let total = 0;
    for (let i = 0; i < fine.length; i++) {
      const a = fine[i], b = fine[(i + 1) % fine.length];
      a.seg = Math.hypot(b.x - a.x, b.y - a.y);
      a.s = total;
      total += a.seg;
    }

    const count = Math.max(64, Math.round(total / SAMPLE_STEP));
    const step = total / count;
    const pts = [];
    let fi = 0;
    for (let k = 0; k < count; k++) {
      const want = k * step;
      while (fi < fine.length - 1 && fine[fi].s + fine[fi].seg < want) fi++;
      const a = fine[fi], b = fine[(fi + 1) % fine.length];
      const t = a.seg > 0 ? (want - a.s) / a.seg : 0;
      pts.push({
        x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
        w: lerp(a.w, b.w, t), surf: a.surf, s: want,
      });
    }

    // tangents, normals and curvature from the resampled ring
    for (let i = 0; i < count; i++) {
      const p = pts[i], a = pts[(i - 1 + count) % count], b = pts[(i + 1) % count];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      p.tx = dx / d; p.ty = dy / d;
      p.nx = -p.ty; p.ny = p.tx;
      p.ang = Math.atan2(p.ty, p.tx);
    }
    // curvature: how much the heading swings over a short span, per unit length
    for (let i = 0; i < count; i++) {
      const a = pts[(i - 3 + count) % count], b = pts[(i + 3) % count];
      const da = Math.atan2(a.ty, a.tx), db = Math.atan2(b.ty, b.tx);
      pts[i].k = Math.abs(wrapAngle(db - da)) / (step * 6);
    }

    // where the surface changes, so the renderer can draw one run at a time
    const runs = [];
    let start = 0;
    for (let i = 1; i <= count; i++) {
      const cur = pts[i % count].surf, prev = pts[i - 1].surf;
      if (cur !== prev || i === count) {
        runs.push({ surf: prev, from: start, to: i });
        start = i;
      }
    }
    return { def, id: def.id, name: def.name, pts, count, len: total, step, runs };
  }

  // Nearest sample to (x, y), searching near `hint` so a crossing does not
  // teleport a car to the other branch. Returns the sample index.
  function nearest(tr, x, y, hint) {
    const c = tr.count;
    let bi = 0, bd = Infinity;
    if (hint == null) {
      for (let i = 0; i < c; i++) {
        const p = tr.pts[i], d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    }
    for (let o = -SEARCH; o <= SEARCH; o++) {
      const i = ((hint + o) % c + c) % c;
      const p = tr.pts[i], d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  // Where a car sits relative to the track: which sample, how far off the
  // centreline, and what it is standing on.
  function place(tr, car) {
    const i = nearest(tr, car.x, car.y, car.si);
    const p = tr.pts[i];
    const d = (car.x - p.x) * p.nx + (car.y - p.y) * p.ny;
    car.si = i;
    car.off = d;
    car.s = p.s;
    const inside = Math.abs(d) <= p.w;
    car.onTrack = inside;
    car.surf = inside ? (SURF[p.surf] || SURF.desk) : OFF;
    return p;
  }

  // ---------- the race ----------

  const state = {
    screen: 'menu',        // menu | grid | racing | done
    track: null,
    trackDef: TRACKS[0],
    cars: [],
    player: null,
    laps: save.laps,
    cls: save.cls,
    colour: save.colour,
    time: 0,               // race clock, ms
    countdown: 0,
    order: [],
    finished: [],
    paused: false,
    marks: null,           // persistent skid layer
    bg: null,              // baked desk + track + props
    props: [],             // the solid ones, for this track
    puddles: [],
    fx: [],
  };

  // Every car on the desk is the same toy. The drivers are what differ, so the
  // ratings are flat and the AI's skill does all the separating.
  function makeCar(opts) {
    return Object.assign({
      x: 0, y: 0, ang: 0, vx: 0, vy: 0,
      z: 0, vz: 0, air: false, spinAir: 0,
      si: null, s: 0, off: 0, onTrack: true, surf: SURF.mat,
      lap: 0, prevS: 0, prog: 0, pos: 1,
      lapStart: 0, best: Infinity, lapTimes: [],
      steer: 0, throttle: 0, brake: 0, hand: false,
      slip: 0, slipstream: 0, boost: 0, wet: 0, stun: 0, tow: 0,
      done: false, doneAt: 0,
      ai: null, line: 0, lineWant: 0,
      markT: 0,
      topSpeed: TOP_SPEED, accel: 1, grip: 1, turn: 1,
    }, opts);
  }

  // Lay the chosen circuit out on the desk behind the menu, so picking a track
  // shows you the actual desk it is drawn on rather than a black rectangle.
  let previewed = null;

  function previewTrack(def) {
    if (!artReady || previewed === def.id) return;
    previewed = def.id;
    const tr = buildTrack(def);
    state.track = tr;
    state.puddles = (def.puddles || []).map((p) => Object.assign({}, p));
    state.cars = [];
    state.player = null;
    bakeScene(tr);
    state.marks = makeLayer();
    drawMini();
  }

  function startRace(trackDef, opts) {
    previewed = null;
    state.trackDef = trackDef;
    const tr = buildTrack(trackDef);
    state.track = tr;
    state.laps = opts.laps;
    state.cls = opts.cls;
    state.colour = opts.colour;
    state.time = 0;
    state.countdown = 3;
    cam.k = 0; cam.lx = cam.ly = 0; cam.snap = true;   // every race swoops in from the whole desk
    state.finished = [];
    state.paused = false;
    state.fx = [];
    state.puddles = (trackDef.puddles || []).map((p) => Object.assign({}, p));

    bakeScene(tr);
    state.marks = makeLayer();

    const cls = CLASS_OPTS.find((c) => c.id === opts.cls) || CLASS_OPTS[1];
    const field = [];

    // the player
    const you = makeCar({ name: 'You', colour: opts.colour, isPlayer: true });
    field.push(you);
    state.player = you;

    // four rivals, never sharing the player's colour
    const pool = RIVALS.filter((r) => r.colour !== opts.colour).slice(0, 4);
    pool.forEach((r) => {
      field.push(makeCar({
        name: r.name, colour: r.colour,
        ai: { skill: r.skill * cls.skill, nerve: r.nerve, line: r.line, rubber: cls.rubber, t: Math.random() * 10 },
      }));
    });

    // line them up two abreast behind the start line
    field.forEach((car, i) => {
      const back = -((i >> 1) * 58 + 40);
      const side = (i % 2 ? 1 : -1) * 15;
      const si = ((Math.round(back / tr.step) % tr.count) + tr.count) % tr.count;
      const p = tr.pts[si];
      car.x = p.x + p.nx * side;
      car.y = p.y + p.ny * side;
      car.ang = p.ang;
      car.si = si;
      car.prevS = p.s;
      car.lapStart = 0;
      car.grid = i;
    });

    state.cars = field;
    state.order = field.slice();
    state.screen = 'racing';
    $('#arena').classList.add('racing');
    audio.start();
    renderBoard(true);
    updateHud();
    showCount(3);
  }

  // ---------- physics ----------

  function stepCar(car, tr, dt) {
    if (car.done) { car.throttle = 0.35; car.brake = 0; }

    if (car.stun > 0) {
      car.stun -= dt;
      car.throttle = 0;
    }

    // --- airborne: no steering, no grip, just a parabola ---
    if (car.air) {
      car.z += car.vz * dt;
      car.vz -= G_AIR * dt;
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      car.ang += car.spinAir * dt;
      if (car.z <= 0) {
        car.z = 0; car.air = false; car.vz = 0; car.spinAir = 0;
        // A crooked landing — pointing one way, travelling another — costs
        // speed, so it is worth straightening up in the air. It never takes the
        // car away from you: being stunned on touchdown just reads as unfair.
        const skew = Math.abs(wrapAngle(Math.atan2(car.vy, car.vx) - car.ang));
        const keep = clamp(1 - skew * 0.55, 0.45, 1);
        scale(car, keep);
        if (keep < 0.8) audio.thud(0.5);
        puff(car.x, car.y, 9, '#e6dccb');
      }
      place(tr, car);
      return;
    }

    const p = place(tr, car);
    const surf = car.surf;

    // wet tyres carry the coffee with them for a while
    for (const pd of state.puddles) {
      if ((car.x - pd.x) ** 2 + (car.y - pd.y) ** 2 < pd.r * pd.r) car.wet = WET_TIME;
    }
    if (car.wet > 0) car.wet -= dt;

    // --- longitudinal ---
    let sp = Math.hypot(car.vx, car.vy);
    const fwd = car.vx * Math.cos(car.ang) + car.vy * Math.sin(car.ang);
    const rated = car.topSpeed * surf.top * (car.boost > 0 ? BOOST_POWER : 1);
    const accel = ACCEL * car.accel * surf.acc * (car.boost > 0 ? 1.5 : 1);

    if (car.throttle > 0 && fwd < rated) {
      const head = 1 - clamp(fwd / rated, 0, 1) * 0.55;   // tails off near the top
      car.vx += Math.cos(car.ang) * accel * car.throttle * head * dt;
      car.vy += Math.sin(car.ang) * accel * car.throttle * head * dt;
    }
    if (car.brake > 0) {
      if (fwd > 6) {
        const b = BRAKE * car.brake * dt;
        const f = Math.max(0, 1 - b / Math.max(sp, 1));
        car.vx *= f; car.vy *= f;
      } else if (fwd > -REVERSE) {
        car.vx -= Math.cos(car.ang) * REVERSE * 1.6 * car.brake * dt;
        car.vy -= Math.sin(car.ang) * REVERSE * 1.6 * car.brake * dt;
      }
    }

    // Drag. Off the throttle the car sheds speed quickly, so a bend can be
    // slowed for by simply lifting; under power it stays light or nothing would
    // reach its rated speed. The old isometric Toy Racers did this and it is
    // most of what made it driveable without stabbing the brake for every bend.
    const drag = (car.throttle > 0 ? ROLL_DRIVE : ROLL_COAST)
      + surf.drag * 0.55 + (car.wet > 0 ? 0.3 : 0);
    const slowK = Math.exp(-drag * dt);
    car.vx *= slowK; car.vy *= slowK;

    // --- where it points versus where it is going ---
    const nose0 = Math.cos(car.ang), flank0 = Math.sin(car.ang);
    const slipF = car.vx * nose0 + car.vy * flank0;
    const slipL = -car.vx * flank0 + car.vy * nose0;
    const slip = Math.abs(Math.atan2(slipL, Math.max(28, Math.abs(slipF))));
    car.slip = slip;

    // --- steering ---
    sp = Math.hypot(car.vx, car.vy);
    let turnEff = TURN * car.turn * clamp(sp / TURN_V, 0, 1);   // full lock by walking pace
    // A tyre can only pull so much sideways. Past that the corner opens out
    // instead of the car pivoting on the spot, which is what stops it being
    // darty at speed without making it useless at a crawl.
    const latG = LAT_FLOOR + surf.grip * (1 - LAT_FLOOR);
    turnEff = Math.min(turnEff, LAT_ACCEL * latG / Math.max(sp, 40));
    // a car already sideways turns in more willingly, and the handbrake pivots it
    turnEff *= car.hand ? 1.65 : 1 + 0.35 * clamp(slip / 0.5, 0, 1);
    car.ang += car.steer * turnEff * (fwd < -4 ? -1 : 1) * dt;

    // --- grip ---
    // The tyres scrub sideways movement off; they do not turn it into forward
    // movement. Swinging the whole velocity vector round to the nose while
    // keeping its length — the usual arcade shortcut, and what this did at
    // first — lets a car shoved sideways into a tube wall convert the entire
    // impact into speed down the track, which is how a braking car ended up
    // accelerating away from a standstill.
    let grip = surf.grip * car.grip;
    // Once it is properly sideways it stays there a little more willingly, so a
    // slide can be held and steered instead of snapping straight the moment you
    // stop asking for it.
    if (car.hand) grip *= HANDBRAKE_GRIP;
    else grip *= 1 - DRIFT_HOLD * clamp((slip - 0.12) / 0.45, 0, 1);
    if (car.wet > 0) grip *= WET_GRIP;
    if (car.stun > 0) grip *= 0.5;

    const nose = Math.cos(car.ang), flank = Math.sin(car.ang);
    const vf = car.vx * nose + car.vy * flank;          // along the car
    let vl = -car.vx * flank + car.vy * nose;           // across it
    vl *= Math.exp(-grip * GRIP_RATE * dt);
    car.vx = vf * nose - vl * flank;
    car.vy = vf * flank + vl * nose;

    // --- surface effects ---
    if (surf.boost && car.onTrack && sp > 40) {
      car.vx += Math.cos(p.ang) * 520 * dt;
      car.vy += Math.sin(p.ang) * 520 * dt;
      car.boost = Math.max(car.boost, 0.5);
      if (Math.random() < dt * 40) spark(car.x, car.y, COLOURS[car.colour].trail);
    }
    if (surf.jump && car.onTrack && fwd > JUMP_MIN && !car.air) {
      car.air = true;
      car.vz = clamp(fwd * JUMP_VZ, 14, 48);
      car.z = 0.5;
      car.spinAir = car.steer * 0.9;
      audio.whoosh();
    }

    // --- the tubing has walls ---
    // Push the car back out along the normal *only*. Moving it to the sample's
    // wall point instead would throw away where it had got to along the tube,
    // which glues a car to the wall however hard it is driving.
    if (surf.wall) {
      const lim = p.w - CAR_WID * 0.35;
      const over = Math.abs(car.off) - lim;
      if (over > 0) {
        const side = Math.sign(car.off);
        car.x -= p.nx * over * side;
        car.y -= p.ny * over * side;
        const vn = car.vx * p.nx + car.vy * p.ny;
        if (vn * side > 0) {
          car.vx -= p.nx * vn * (1 + RESTITUTION);
          car.vy -= p.ny * vn * (1 + RESTITUTION);
          // scraping along the wall costs you speed, but only in proportion to
          // how hard you leaned on it
          const sp2 = Math.hypot(car.vx, car.vy);
          scale(car, 1 - 0.28 * clamp(Math.abs(vn) / Math.max(sp2, 1), 0, 1));
          if (Math.abs(vn) > 90) { audio.scrape(Math.abs(vn)); spark(car.x, car.y, '#fff2c8'); }
        }
        car.off = lim * side;
      }
    }

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    if (car.boost > 0) car.boost -= dt;

    // --- keep it on the desk ---
    const m = 26;
    if (car.x < m) { car.x = m; car.vx = Math.abs(car.vx) * 0.3; }
    if (car.x > DESK_W - m) { car.x = DESK_W - m; car.vx = -Math.abs(car.vx) * 0.3; }
    if (car.y < m) { car.y = m; car.vy = Math.abs(car.vy) * 0.3; }
    if (car.y > DESK_H - m) { car.y = DESK_H - m; car.vy = -Math.abs(car.vy) * 0.3; }
  }

  function scale(car, f) { car.vx *= f; car.vy *= f; }

  // --- props and cars are solid ---

  function hitProps(car, props) {
    if (car.air) return;
    for (const pr of props) {
      if (!pr.r) continue;
      const dx = car.x - pr.x, dy = car.y - pr.y;
      const rr = pr.r + CAR_R;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      car.x = pr.x + nx * rr;
      car.y = pr.y + ny * rr;
      const sp = Math.hypot(car.vx, car.vy);
      const vn = car.vx * nx + car.vy * ny;
      if (vn < 0) {
        car.vx -= nx * vn * (1 + RESTITUTION);
        car.vy -= ny * vn * (1 + RESTITUTION);
        // a square hit costs you most of your speed, a glance off the side barely any
        scale(car, 1 - 0.55 * clamp(-vn / Math.max(sp, 1), 0, 1));
        if (-vn > 100) {
          audio.thud(clamp(-vn / 300, 0.2, 1));
          puff(car.x, car.y, 6, '#d9cdb6');
          for (let i = 0; i < 5; i++) spark(car.x, car.y, '#ffe6a8');
        }
      }
    }
  }

  function hitCars(cars) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        if (a.air !== b.air) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = CAR_R * 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const push = (rr - d) * 0.5;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = rel * (1 + RESTITUTION) * 0.5;
          a.vx += nx * imp; a.vy += ny * imp;
          b.vx -= nx * imp; b.vy -= ny * imp;
          if (-rel > 90) {
            audio.thud(clamp(-rel / 320, 0.15, 0.8));
            for (let i = 0; i < 4; i++) spark((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffe6a8');
          }
        }
      }
    }
  }

  // --- the tow ---

  function slipstream(cars, dt) {
    for (const car of cars) {
      let tow = 0;
      const sp = Math.hypot(car.vx, car.vy);
      if (sp > 80 && !car.air) {
        for (const other of cars) {
          if (other === car || other.air) continue;
          const dx = other.x - car.x, dy = other.y - car.y;
          const d = Math.hypot(dx, dy);
          if (d > DRAFT_DIST || d < 24) continue;
          // is it ahead of us, and are we both pointing the same way?
          const ahead = (dx * car.vx + dy * car.vy) / (d * sp);
          if (ahead < Math.cos(DRAFT_CONE)) continue;
          const align = Math.cos(wrapAngle(other.ang - car.ang));
          if (align < 0.55) continue;
          tow = Math.max(tow, (1 - d / DRAFT_DIST) * align);
        }
      }
      car.tow = tow;
      if (tow > 0) {
        car.slipstream = Math.min(1, car.slipstream + DRAFT_FILL * tow * dt);
        const pull = ACCEL * DRAFT_PULL * tow;
        car.vx += Math.cos(car.ang) * pull * dt;
        car.vy += Math.sin(car.ang) * pull * dt;
      } else {
        car.slipstream = Math.max(0, car.slipstream - 0.05 * dt);
      }
    }
  }

  function spendSlipstream(car) {
    if (car.slipstream < 0.25 || car.boost > 0) return false;
    car.boost = BOOST_TIME * (0.6 + car.slipstream * 0.7);
    car.slipstream = 0;
    audio.boost();
    for (let i = 0; i < 12; i++) spark(car.x, car.y, COLOURS[car.colour].trail);
    return true;
  }

  // ---------- lap and standings ----------

  // Cars line up *behind* the start line, so the first crossing opens lap 1 and
  // times nothing; every crossing after it closes the lap before it. The race is
  // over when the counter would tick past the last lap.
  function updateProgress(car, tr) {
    const half = tr.len * 0.5;
    const ds = car.s - car.prevS;
    car.prevS = car.s;
    // a car that has taken the flag keeps rolling, but stops counting
    if (car.done) return;

    if (ds < -half) {
      car.lap++;
      if (car.lap >= 2) {
        const t = state.time - car.lapStart;
        car.lapTimes.push(t);
        if (t < car.best) car.best = t;
        if (car.isPlayer) {
          const rec = save.best[tr.id];
          if (!rec || t < rec) { save.best[tr.id] = t; persist(); flashBest(); }
        }
      }
      car.lapStart = state.time;
      if (car.lap > state.laps) {
        if (!car.done) finishCar(car);
      } else if (car.isPlayer) {
        audio.lap();
      }
    } else if (ds > half) {
      car.lap--;
    }
    car.prog = car.lap * tr.len + car.s;
  }

  function finishCar(car) {
    car.done = true;
    car.doneAt = state.time;
    car.lap = state.laps;
    state.finished.push(car);
    if (car.isPlayer) endRace();
  }

  function standings() {
    const list = state.cars.slice();
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done && b.done) return a.doneAt - b.doneAt;
      return b.prog - a.prog;
    });
    list.forEach((c, i) => { c.pos = i + 1; });
    return list;
  }

  try { localStorage.removeItem('paddock-log-v1'); } catch (e) { /* storage blocked */ }   // the old driving log

  // ---------- the AI ----------

  function driveAi(car, tr, dt) {
    const ai = car.ai;
    ai.t += dt;
    const sp = Math.hypot(car.vx, car.vy);
    const p = tr.pts[car.si];

    // Aim at a point a fixed *time* ahead rather than a fixed number of samples,
    // so the line stays tidy at both ends of the speed range.
    const look = Math.round(clamp(45 + sp * 0.42, 45, 230) / tr.step);
    const target = tr.pts[(car.si + look) % tr.count];

    // how tight is the next bit — only used to decide whether to hang the tail out
    let worst = 0;
    for (let o = 4; o <= 26; o += 2) {
      const q = tr.pts[(car.si + o) % tr.count];
      if (q.k > worst) worst = q.k;
    }

    // wander the racing line a little, and swing off it to overtake
    if (ai.t > ai.next || ai.next == null) {
      ai.next = ai.t + 1.2 + Math.random() * 2;
      car.lineWant = ai.line + (Math.random() - 0.5) * 0.5;
    }
    let avoid = 0;
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d > 130 || d < 1) continue;
      const ahead = (dx * Math.cos(car.ang) + dy * Math.sin(car.ang)) / d;
      if (ahead < 0.3) continue;
      // pull towards whichever side of them has more room
      const side = Math.sign(other.off - car.off) || 1;
      avoid -= side * (1 - d / 130) * 1.3;
    }
    car.line = lerp(car.line, clamp(car.lineWant + avoid, -0.78, 0.78), 1 - Math.exp(-3 * dt));

    const aimX = target.x + target.nx * target.w * car.line;
    const aimY = target.y + target.ny * target.w * car.line;
    const want = Math.atan2(aimY - car.y, aimX - car.x);
    let err = wrapAngle(want - car.ang);

    // countersteer out of a slide instead of spinning
    if (car.slip > 0.34) {
      const drift = wrapAngle(Math.atan2(car.vy, car.vx) - car.ang);
      err -= drift * 0.55;
    }
    car.steer = clamp(err * 2.4, -1, 1);

    // How fast dare we be? Walk forward over the next few car-lengths; for each
    // corner work out the fastest it can be taken, then the fastest we could be
    // *here* and still have slowed to that by the time we arrive. Braking from
    // the top of fourth takes about 120 units, so this only has to look that far
    // — the old version scanned a quarter of a lap and drove everywhere at the
    // speed of the slowest corner on it.
    let want_v = car.topSpeed * car.surf.top;
    const nerveA = 0.74 + ai.skill * 0.34;
    for (let o = 2; o <= 48; o += 2) {
      const q = tr.pts[(car.si + o) % tr.count];
      if (q.k < 1e-4) continue;
      const grip = (SURF[q.surf] || SURF.desk).grip;
      const vmax = Math.sqrt(CORNER_A * grip * nerveA / q.k);
      const allowed = Math.sqrt(vmax * vmax + 2 * BRAKE * 0.7 * (o * tr.step));
      if (allowed < want_v) want_v = allowed;
    }
    if (!car.onTrack) want_v = Math.min(want_v, car.topSpeed * OFF.top);

    // rubber band: chase if behind, ease off if miles ahead
    const you = state.player;
    if (you && !you.done) {
      const gap = (car.prog - you.prog) / tr.len;
      want_v *= 1 - clamp(gap, -0.55, 0.55) * ai.rubber;
    }
    want_v *= 0.88 + ai.skill * 0.14;

    if (sp < want_v) { car.throttle = 1; car.brake = 0; }
    else if (sp < want_v * 1.14) { car.throttle = 0.25; car.brake = 0; }
    else { car.throttle = 0; car.brake = clamp((sp / want_v - 1) * 4, 0.2, 1); }

    // a keen driver will hang the back end out through a tight one
    car.hand = ai.nerve > 0.7 && worst > 0.016 && sp > car.topSpeed * 0.55 && car.slip < 0.5;

    // and will spend a tow when it has one
    if (car.slipstream > 0.5 && worst < 0.006 && Math.random() < dt * (0.6 + ai.nerve)) {
      spendSlipstream(car);
    }

    // lost? point back at the track
    if (!car.onTrack && Math.abs(car.off) > p.w * 3.2) {
      const back = Math.atan2(p.y - car.y, p.x - car.x);
      car.steer = clamp(wrapAngle(back - car.ang) * 2.2, -1, 1);
      car.throttle = 0.75;
      car.brake = 0;
    }
  }

  // ---------- input ----------

  const keys = Object.create(null);
  const HELD = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 };

  window.addEventListener('keydown', (e) => {
    if (HELD[e.code]) e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (state.screen === 'racing' && !state.paused && state.player) spendSlipstream(state.player);
    }
    if (e.code === 'KeyR' && state.screen === 'racing' && state.player) rescue(state.player);
    if (e.code === 'Escape') togglePause();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function drivePlayer(car) {
    if (car.done) return;
    const up = keys.ArrowUp || keys.KeyW;
    const down = keys.ArrowDown || keys.KeyS;
    const left = keys.ArrowLeft || keys.KeyA;
    const right = keys.ArrowRight || keys.KeyD;
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    // ease into full lock so a tap is a nudge, not a flick, and centre faster
    // than we turn in — that is what makes a keyboard car catchable in a slide
    const rate = want === 0 ? 22 : 15;
    car.steer = lerp(car.steer, want, 1 - Math.exp(-rate * STEP));
    car.throttle = up ? 1 : 0;
    car.brake = down ? 1 : 0;
    car.hand = !!keys.Space;
    if (state.countdown > 0) { car.throttle = 0; car.brake = 0; }
  }

  // The touch pads write into the same key map the keyboard does, so there is
  // one control path to keep working rather than two.
  for (const pad of document.querySelectorAll('#pads .pad')) {
    const code = pad.dataset.key;
    const down = (e) => {
      e.preventDefault();
      pad.classList.add('is-down');
      if (pad.setPointerCapture && e.pointerId != null) pad.setPointerCapture(e.pointerId);
      if (code === 'ShiftLeft') {
        if (state.screen === 'racing' && !state.paused && state.player) spendSlipstream(state.player);
      } else {
        keys[code] = true;
      }
    };
    const up = (e) => {
      if (e) e.preventDefault();
      pad.classList.remove('is-down');
      keys[code] = false;
    };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function rescue(car) {
    const tr = state.track;
    if (!tr) return;
    const p = tr.pts[car.si];
    car.x = p.x; car.y = p.y;
    car.ang = p.ang;
    car.vx = Math.cos(p.ang) * 40;
    car.vy = Math.sin(p.ang) * 40;
    car.air = false; car.z = 0; car.vz = 0; car.stun = 0;
    puff(car.x, car.y, 10, '#e8dcc6');
  }

  // ---------- particles ----------

  function puff(x, y, n, colour) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 20 + Math.random() * 70;
      state.fx.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: 4 + Math.random() * 7, life: 0.45 + Math.random() * 0.4, t: 0,
        colour, kind: 'puff',
      });
    }
  }

  function spark(x, y, colour) {
    const a = Math.random() * TAU, v = 60 + Math.random() * 160;
    state.fx.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: 1.6 + Math.random() * 2, life: 0.22 + Math.random() * 0.2, t: 0,
      colour, kind: 'spark',
    });
  }

  function smoke(x, y, colour) {
    state.fx.push({
      x, y, vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22,
      r: 5 + Math.random() * 5, life: 0.7 + Math.random() * 0.5, t: 0,
      colour, kind: 'smoke',
    });
  }

  function stepFx(dt) {
    for (let i = state.fx.length - 1; i >= 0; i--) {
      const f = state.fx[i];
      f.t += dt;
      if (f.t >= f.life) { state.fx.splice(i, 1); continue; }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const k = Math.exp(-(f.kind === 'spark' ? 5 : 2.4) * dt);
      f.vx *= k; f.vy *= k;
      if (f.kind === 'smoke') f.r += 14 * dt;
    }
  }

  // Skid marks go onto their own layer and stay there for the race. Wet tyres
  // lay a much fainter brown one — at full strength five cars on a wet lap paint
  // the whole corner solid and you cannot see the track under it.
  function layMarks(car, dt) {
    if (car.air || car.done) return;
    const sp = Math.hypot(car.vx, car.vy);
    const wet = car.wet > 0 && car.slip > 0.14;
    const hard = car.slip > 0.28 || (car.hand && sp > 60) || wet;
    if (!hard || sp < 40) return;
    car.markT -= dt;
    if (car.markT > 0) return;
    car.markT = 0.02;
    const g = state.marks.ctx;
    const a = clamp(car.slip * 0.9 + (car.hand ? 0.25 : 0), 0.08, 0.40);
    g.fillStyle = car.wet > 0 ? `rgba(86,54,26,${a * 0.22})` : `rgba(42,36,32,${a})`;
    const c = Math.cos(car.ang), s = Math.sin(car.ang);
    for (const [ox, oy] of [[-11, -9], [-11, 9]]) {
      g.beginPath();
      g.ellipse(car.x + ox * c - oy * s, car.y + ox * s + oy * c, 5.5, 3.4, car.ang, 0, TAU);
      g.fill();
    }
    if (car.slip > SPIN_SLIP && Math.random() < 0.4) smoke(car.x, car.y, '#dcdce2');
    if (!car.onTrack && car.surf.grit && Math.random() < 0.5) smoke(car.x, car.y, '#cbb996');
  }

  // ---------- canvas plumbing ----------

  const debug = { show: false };

  const canvas = $('#desk');
  const ctx = canvas.getContext('2d');
  const mini = $('#minimap');
  const mctx = mini.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, fit: 1, near: 1 };
  // k blends the whole-desk view (0) into the follow view (1)
  const cam = { x: DESK_W / 2, y: DESK_H / 2, lx: 0, ly: 0, k: 0 };

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.dpr = dpr;
    view.w = r.width; view.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    // Off the grid the whole desk is fitted inside the arena; racing, the
    // camera is close enough that only a stretch of the lap is on screen.
    view.fit = Math.min(r.width / DESK_W, r.height / DESK_H);
    view.near = Math.max(view.fit, Math.sqrt((r.width * r.height) / CAM_AREA));
    placeCamera();
  }

  // Where the camera wants to be this frame: the whole desk, or your car plus
  // a lead in the direction it is travelling.
  function stepCamera(dt) {
    const you = state.player;
    const racing = (state.screen === 'racing' || state.screen === 'done') && you;
    let want = 0;
    if (racing) {
      // swoop in over the countdown, back out once the flag has fallen
      want = state.screen === 'done' ? 0 : 1;
      const rate = 1 / CAM_ZOOM_IN;
      cam.k = want > cam.k ? Math.min(want, cam.k + dt * rate) : Math.max(want, cam.k - dt * rate * 0.6);
      let lx = you.vx * CAM_LEAD_T, ly = you.vy * CAM_LEAD_T;
      const len = Math.hypot(lx, ly);
      if (len > CAM_LEAD_MAX) { lx *= CAM_LEAD_MAX / len; ly *= CAM_LEAD_MAX / len; }
      // the lead eases on its own so a spin does not whip the view round
      const e = 1 - Math.exp(-dt * CAM_FOLLOW * 0.5);
      cam.lx += (lx - cam.lx) * e;
      cam.ly += (ly - cam.ly) * e;
      const f = 1 - Math.exp(-dt * CAM_FOLLOW);
      const tx = you.x + cam.lx, ty = you.y + cam.ly;
      if (dt === 0 || cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
      else { cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; }
    } else {
      cam.k = 0;
      cam.lx = cam.ly = 0;
      cam.snap = true;
    }
    placeCamera();
  }

  function placeCamera() {
    // ease in and out so the swoop does not start or land with a jolt
    const k = cam.k * cam.k * (3 - 2 * cam.k);
    const scale = view.fit * Math.pow(view.near / view.fit, k);
    view.scale = scale;
    // centre on the car, but never show past the desk's edge once it is
    // bigger than the arena; a desk smaller than the arena stays centred
    const hw = view.w / (2 * scale), hh = view.h / (2 * scale);
    const cx = hw * 2 >= DESK_W ? DESK_W / 2 : clamp(cam.x, hw, DESK_W - hw);
    const cy = hh * 2 >= DESK_H ? DESK_H / 2 : clamp(cam.y, hh, DESK_H - hh);
    const x = DESK_W / 2 + (cx - DESK_W / 2) * k;
    const y = DESK_H / 2 + (cy - DESK_H / 2) * k;
    view.ox = view.w / 2 - x * scale;
    view.oy = view.h / 2 - y * scale;
  }

  function makeLayer() {
    const c = document.createElement('canvas');
    c.width = DESK_W; c.height = DESK_H;
    const g = c.getContext('2d');
    return { canvas: c, ctx: g };
  }

  // ---------- baking the scene ----------

  function bakeScene(tr) {
    const layer = makeLayer();
    const g = layer.ctx;

    if (art.desk && art.desk.width) g.drawImage(art.desk, 0, 0, DESK_W, DESK_H);
    else { g.fillStyle = '#c99a63'; g.fillRect(0, 0, DESK_W, DESK_H); }

    const props = trackProps(tr.def);
    const byY = (a, b) => a.y - b.y;

    // A few things are what the track is resting *on* — the rule is propped on
    // the floppy stack — so they go down before it.
    props.filter((p) => p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawTrack(g, tr);
    for (const pd of state.puddles) drawPuddle(g, pd);

    // everything else sits on the desk beside the track, and overlaps its edge
    props.filter((p) => !p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawStartLine(g, tr);
    state.bg = layer;
    state.props = props.filter((p) => p.r);
  }

  function drawProp(g, p) {
    const img = art[p.img];
    if (!img || !img.width) return;
    const s = (p.s || 1);
    const w = img.width * s, h = img.height * s;
    g.save();
    g.translate(p.x, p.y);
    if (p.rot) g.rotate(p.rot * Math.PI / 180);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  }

  function drawPuddle(g, pd) {
    const grd = g.createRadialGradient(pd.x, pd.y, pd.r * 0.15, pd.x, pd.y, pd.r);
    grd.addColorStop(0, 'rgba(58,32,14,0.68)');
    grd.addColorStop(0.7, 'rgba(78,46,20,0.54)');
    grd.addColorStop(1, 'rgba(96,62,30,0)');
    g.save();
    g.beginPath();
    // a wobbly edge, not a circle — it is a spill
    for (let a = 0; a <= TAU + 0.01; a += 0.22) {
      const wob = 1 + Math.sin(a * 3.1 + pd.x) * 0.10 + Math.sin(a * 5.3 + pd.y) * 0.06;
      const x = pd.x + Math.cos(a) * pd.r * wob, y = pd.y + Math.sin(a) * pd.r * wob * 0.82;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.clip();
    // a sheen off the top-left, so it reads as wet
    g.fillStyle = 'rgba(190,150,110,0.22)';
    g.beginPath();
    g.ellipse(pd.x - pd.r * 0.3, pd.y - pd.r * 0.3, pd.r * 0.42, pd.r * 0.2, -0.6, 0, TAU);
    g.fill();
    g.restore();
  }

  // --- the track surfaces ---

  function edgePath(g, tr, from, to, side, back) {
    const c = tr.count;
    const n = to - from;
    if (back) {
      for (let i = n; i >= 0; i--) {
        const p = tr.pts[(from + i) % c];
        const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
        g.lineTo(x, y);
      }
    } else {
      for (let i = 0; i <= n; i++) {
        const p = tr.pts[(from + i) % c];
        const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
  }

  function runShape(g, tr, run, inset) {
    const c = tr.count;
    const n = run.to - run.from;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = tr.pts[(run.from + i) % c];
      const w = p.w - inset;
      const x = p.x + p.nx * w, y = p.y + p.ny * w;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const p = tr.pts[(run.from + i) % c];
      const w = p.w - inset;
      g.lineTo(p.x - p.nx * w, p.y - p.ny * w);
    }
    g.closePath();
  }

  function centreLine(g, tr, run, off) {
    const c = tr.count;
    const n = run.to - run.from;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = tr.pts[(run.from + i) % c];
      const x = p.x + p.nx * (off || 0), y = p.y + p.ny * (off || 0);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  function drawTrack(g, tr) {
    // a soft worn band under the whole lap, so the route always reads
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      const w = tr.pts[run.from].w;
      g.strokeStyle = 'rgba(96,66,38,0.16)';
      g.lineWidth = w * 2.15;
      g.stroke();
    }
    g.restore();

    for (const run of tr.runs) {
      const fn = RUN_ART[run.surf] || RUN_ART.desk;
      g.save();
      fn(g, tr, run);
      g.restore();
    }
  }

  const RUN_ART = {
    // Bare wood. There is nothing laid down here, so the route has to be read off
    // the desk itself: a lane the toys have polished, chalked at the edges. It
    // needs to be obvious — this is the racing surface, not scenery.
    desk(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'round'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(64,40,18,0.34)';
      g.lineWidth = w * 2.1;
      g.stroke();

      // the polished middle, where the wheels actually go
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(247,231,201,0.26)';
      g.lineWidth = w * 1.5;
      g.stroke();
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(255,244,222,0.16)';
      g.lineWidth = w * 0.7;
      g.stroke();

      // chalk lines along both edges
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = 'rgba(252,246,236,0.78)';
        g.lineWidth = 3.2;
        g.stroke();
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side * 1.04, false);
        g.strokeStyle = 'rgba(58,36,16,0.30)';
        g.lineWidth = 2;
        g.stroke();
      }
    },

    // the card mat the start line is painted on
    mat(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(40,28,16,0.26)';
      g.lineWidth = w * 2.16;
      g.stroke();
      centreLine(g, tr, run);
      g.strokeStyle = '#efe7d6';
      g.lineWidth = w * 2;
      g.stroke();
      centreLine(g, tr, run, -w * 0.55);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = w * 0.5;
      g.stroke();
    },

    // clear plastic tubing: a pale channel with two bright rims
    tube(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'round'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(40,52,64,0.22)';
      g.lineWidth = w * 2.3;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(226,238,246,0.60)';
      g.lineWidth = w * 2;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(178,204,222,0.45)';
      g.lineWidth = w * 1.45;
      g.stroke();

      // the walls
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = 'rgba(250,253,255,0.88)';
        g.lineWidth = 5.5;
        g.stroke();
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side * 0.86, false);
        g.strokeStyle = 'rgba(126,158,180,0.35)';
        g.lineWidth = 2;
        g.stroke();
      }
      // the long highlight down the inside of the tube
      centreLine(g, tr, run, -w * 0.42);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = w * 0.22;
      g.stroke();
    },

    // the steel rule: brushed metal with its markings
    ruler(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(30,36,44,0.30)';
      g.lineWidth = w * 2.2;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = '#b9bfc6';
      g.lineWidth = w * 2;
      g.stroke();

      centreLine(g, tr, run, -w * 0.4);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = w * 0.5;
      g.stroke();

      centreLine(g, tr, run, w * 0.55);
      g.strokeStyle = 'rgba(120,130,142,0.5)';
      g.lineWidth = w * 0.4;
      g.stroke();

      // tick marks along the far edge
      const c = tr.count;
      g.strokeStyle = 'rgba(52,60,70,0.7)';
      for (let i = run.from; i < run.to; i += 2) {
        const p = tr.pts[i % c];
        const big = (i % 10 === 0);
        const len = big ? w * 0.52 : w * 0.3;
        g.lineWidth = big ? 1.8 : 1.1;
        g.beginPath();
        g.moveTo(p.x + p.nx * w * 0.96, p.y + p.ny * w * 0.96);
        g.lineTo(p.x + p.nx * (w * 0.96 - len), p.y + p.ny * (w * 0.96 - len));
        g.stroke();
      }
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = 'rgba(236,240,244,0.8)';
        g.lineWidth = 2.4;
        g.stroke();
      }
    },

    // the ruler propped on the floppy stack — a take-off
    ramp(g, tr, run) {
      RUN_ART.ruler(g, tr, run);
      const c = tr.count;
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      const n = run.to - run.from;
      for (let i = 0; i <= n; i++) {
        const p = tr.pts[(run.from + i) % c];
        const t = i / n;
        g.fillStyle = `rgba(255,255,255,${0.10 + t * 0.34})`;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.ang);
        g.fillRect(-4, -p.w, 8, p.w * 2);
        g.restore();
      }
      g.restore();
      // chevrons pointing at the jump
      g.strokeStyle = 'rgba(240,123,53,0.85)';
      g.lineWidth = 3.4;
      for (let i = run.from + 4; i < run.to - 2; i += 9) {
        const p = tr.pts[i % c];
        const w = p.w * 0.72;
        g.beginPath();
        g.moveTo(p.x + p.nx * w - p.tx * 7, p.y + p.ny * w - p.ty * 7);
        g.lineTo(p.x + p.tx * 7, p.y + p.ty * 7);
        g.lineTo(p.x - p.nx * w - p.tx * 7, p.y - p.ny * w - p.ty * 7);
        g.stroke();
      }
    },

    // a boost strip — the rainbow smear off the plate
    boost(g, tr, run) {
      RUN_ART.desk(g, tr, run);
      const c = tr.count;
      const bands = ['#e8483a', '#f09a2e', '#f2cf3c', '#65bb53', '#3f8fd0', '#8b5fc6'];
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt';
      bands.forEach((col, bi) => {
        const off = (bi - (bands.length - 1) / 2) * (w * 1.7 / bands.length);
        centreLine(g, tr, run, off);
        g.strokeStyle = col;
        g.globalAlpha = 0.5;
        g.lineWidth = w * 1.7 / bands.length + 1;
        g.stroke();
      });
      g.globalAlpha = 1;
      // arrows over the top
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3.2;
      for (let i = run.from + 3; i < run.to - 2; i += 8) {
        const p = tr.pts[i % c];
        const ww = p.w * 0.6;
        g.beginPath();
        g.moveTo(p.x + p.nx * ww - p.tx * 8, p.y + p.ny * ww - p.ty * 8);
        g.lineTo(p.x + p.tx * 8, p.y + p.ty * 8);
        g.lineTo(p.x - p.nx * ww - p.tx * 8, p.y - p.ny * ww - p.ty * 8);
        g.stroke();
      }
    },
  };

  function drawStartLine(g, tr) {
    const p = tr.pts[0];
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.ang);
    const w = p.w;
    // two rows of chequer across the track
    for (let r = 0; r < 2; r++) {
      for (let i = -Math.ceil(w / 11); i <= Math.ceil(w / 11); i++) {
        g.fillStyle = ((i + r) % 2) ? '#f4f1ea' : '#26262a';
        g.fillRect(r * 11 - 11, i * 11 - 5.5, 11, 11);
      }
    }
    g.restore();
    // her flags planted either side of it, far enough out to clear the cars on
    // the grid. They are drawn from the foot of the pole, not the middle.
    const stand = (img, at, s) => {
      if (!img || !img.width) return;
      g.save();
      g.translate(p.x + p.nx * at, p.y + p.ny * at);
      g.drawImage(img, -img.width * s / 2, -img.height * s * 0.86, img.width * s, img.height * s);
      g.restore();
    };
    stand(art.flag, p.w + 30, 0.58);
    stand(art.flags, -(p.w + 42), 0.58);
  }

  // ---------- drawing a car ----------

  function drawCar(g, car, t) {
    const col = COLOURS[car.colour] || COLOURS.red;
    const lift = 1 + car.z * 0.0042;
    const L = CAR_LEN * lift, W = CAR_WID * lift;

    // shadow — further out and softer the higher the car is
    g.save();
    g.translate(car.x + 4 + car.z * 0.11, car.y + 7 + car.z * 0.16);
    g.rotate(car.ang);
    g.fillStyle = `rgba(28,20,12,${clamp(0.34 - car.z * 0.0011, 0.08, 0.34)})`;
    roundRect(g, -L / 2, -W / 2, L, W, 8);
    g.fill();
    g.restore();

    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.ang);
    g.scale(lift, lift);

    // wheels first, so the body overlaps them
    const steerVis = car.steer * 0.45;
    g.fillStyle = '#25262a';
    for (const [ox, oy, turn] of [[13, -13, 1], [13, 13, 1], [-13, -13, 0], [-13, 13, 0]]) {
      g.save();
      g.translate(ox, oy);
      if (turn) g.rotate(steerVis);
      roundRect(g, -7.5, -3.6, 15, 7.2, 2.6);
      g.fill();
      g.restore();
    }

    // body
    const body = g.createLinearGradient(0, -CAR_WID / 2, 0, CAR_WID / 2);
    body.addColorStop(0, col.light);
    body.addColorStop(0.45, col.body);
    body.addColorStop(1, col.dark);
    g.fillStyle = body;
    carShell(g);
    g.fill();
    g.strokeStyle = 'rgba(20,14,10,0.55)';
    g.lineWidth = 1.6;
    g.stroke();

    // a stripe down the middle, because they all have one
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(-CAR_LEN / 2 + 5, -2.4, CAR_LEN - 12, 4.8);

    // cabin
    g.fillStyle = 'rgba(28,38,52,0.85)';
    roundRect(g, -8, -8.5, 17, 17, 5);
    g.fill();
    g.fillStyle = 'rgba(150,200,235,0.75)';
    roundRect(g, 3, -7.5, 5.5, 15, 2.5);
    g.fill();

    // lights
    g.fillStyle = '#fff3cf';
    roundRect(g, CAR_LEN / 2 - 5.5, -9.5, 3.4, 4.4, 1.4);
    g.fill();
    roundRect(g, CAR_LEN / 2 - 5.5, 5.1, 3.4, 4.4, 1.4);
    g.fill();
    g.fillStyle = car.brake > 0.1 ? '#ff5540' : '#a8342a';
    roundRect(g, -CAR_LEN / 2 + 1.6, -9, 2.6, 4, 1.2);
    g.fill();
    roundRect(g, -CAR_LEN / 2 + 1.6, 5, 2.6, 4, 1.2);
    g.fill();

    // gloss
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.beginPath();
    g.ellipse(2, -8, 15, 3.6, 0, 0, TAU);
    g.fill();

    g.restore();

    // the tow, and what you do with it
    if (car.boost > 0) {
      const a = clamp(car.boost / BOOST_TIME, 0, 1);
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.ang);
      const fl = g.createLinearGradient(-22, 0, -76, 0);
      fl.addColorStop(0, hexA(col.trail, 0.75 * a));
      fl.addColorStop(1, hexA(col.trail, 0));
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(-22, -9);
      g.lineTo(-30 - 46 * a, -3 + Math.sin(t * 40) * 2);
      g.lineTo(-30 - 46 * a, 3 + Math.sin(t * 37) * 2);
      g.lineTo(-22, 9);
      g.closePath();
      g.fill();
      g.restore();
    } else if (car.tow > 0.15) {
      g.save();
      g.globalAlpha = car.tow * 0.35;
      g.strokeStyle = '#bfe8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(car.x, car.y);
      g.lineTo(car.x - Math.cos(car.ang) * 26, car.y - Math.sin(car.ang) * 26);
      g.stroke();
      g.restore();
    }

    // a ring under the player's car so it is never lost in the clutter
    if (car.isPlayer) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(car.x, car.y + 12, 22, 9, 0, 0, TAU);
      g.stroke();
      g.restore();
    }
  }

  function carShell(g) {
    const L = CAR_LEN / 2, W = CAR_WID / 2;
    g.beginPath();
    g.moveTo(L - 3, -W + 2);
    g.quadraticCurveTo(L, -W + 1, L, -W + 5);
    g.lineTo(L, W - 5);
    g.quadraticCurveTo(L, W - 1, L - 3, W - 2);
    g.lineTo(-L + 4, W);
    g.quadraticCurveTo(-L, W, -L, W - 4);
    g.lineTo(-L, -W + 4);
    g.quadraticCurveTo(-L, -W, -L + 4, -W);
    g.closePath();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- the frame ----------

  function draw(t) {
    const g = ctx;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);

    // The camera follows smoothly and never shakes. Shaking the whole desk on a
    // bump was tried and it reads as a rendering glitch rather than an impact —
    // the feedback belongs on the car: sparks, dust and a thud.
    g.save();
    g.translate(view.ox, view.oy);
    g.scale(view.scale, view.scale);

    if (state.bg) g.drawImage(state.bg.canvas, 0, 0);
    if (state.marks) g.drawImage(state.marks.canvas, 0, 0);

    // puffs of dust under the cars
    for (const f of state.fx) {
      if (f.kind === 'spark') continue;
      const a = 1 - f.t / f.life;
      g.globalAlpha = a * (f.kind === 'smoke' ? 0.34 : 0.5);
      g.fillStyle = f.colour;
      g.beginPath();
      g.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    const cars = state.cars.slice().sort((a, b) => (a.z - b.z) || (a.y - b.y));
    for (const car of cars) drawCar(g, car, t);

    for (const f of state.fx) {
      if (f.kind !== 'spark') continue;
      g.globalAlpha = 1 - f.t / f.life;
      g.fillStyle = f.colour;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    // Laying props out beside a track by typing coordinates is guesswork, so
    // there is a switch that draws what the physics actually sees.
    if (debug.show && state.track) {
      const tr = state.track;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,60,60,0.75)';
      for (const p of state.props) {
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, TAU);
        g.stroke();
      }
      g.strokeStyle = 'rgba(80,255,120,0.8)';
      for (const side of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= tr.count; i++) {
          const p = tr.pts[i % tr.count];
          const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }

    // a caret over each rival so the standings can be read on the desk too
    for (const car of state.cars) {
      if (car.isPlayer) continue;
      g.fillStyle = hexA(COLOURS[car.colour].body, 0.9);
      g.beginPath();
      g.moveTo(car.x, car.y - 26 - car.z * 0.12);
      g.lineTo(car.x - 5, car.y - 34 - car.z * 0.12);
      g.lineTo(car.x + 5, car.y - 34 - car.z * 0.12);
      g.closePath();
      g.fill();
    }

    g.restore();

    // Zoomed in, the desk is no longer the map. Where the layout has no room
    // for the panel's map (a phone held sideways) it goes in the desk's corner.
    if (cam.k > 0.5 && state.track && mini.offsetParent === null) {
      const w = Math.min(170, view.w * 0.3), h = w * mini.height / mini.width;
      const x = view.w - w - 10, y = 10;
      g.globalAlpha = Math.min(1, (cam.k - 0.5) * 4);
      g.fillStyle = 'rgba(20, 16, 24, 0.62)';
      roundRect(g, x, y, w, h, 8);
      g.fill();
      g.drawImage(mini, x, y, w, h);
      g.globalAlpha = 1;
    }
  }

  function drawMini() {
    const tr = state.track;
    if (!tr) return;
    const W = mini.width, H = mini.height;
    mctx.clearRect(0, 0, W, H);
    const pad = 12;
    const s = Math.min((W - pad * 2) / DESK_W, (H - pad * 2) / DESK_H);
    const ox = (W - DESK_W * s) / 2, oy = (H - DESK_H * s) / 2;

    mctx.save();
    mctx.translate(ox, oy);
    mctx.scale(s, s);

    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(mctx, tr, run);
      mctx.strokeStyle = MINI_COL[run.surf] || '#8f9aa8';
      mctx.lineWidth = 44;   // world units, so it reads at the map's scale
      mctx.stroke();
    }
    mctx.restore();

    for (const car of state.cars) {
      const x = ox + car.x * s, y = oy + car.y * s;
      mctx.fillStyle = COLOURS[car.colour].body;
      mctx.beginPath();
      mctx.arc(x, y, car.isPlayer ? 5.2 : 3.6, 0, TAU);
      mctx.fill();
      if (car.isPlayer) {
        mctx.strokeStyle = '#fff';
        mctx.lineWidth = 1.6;
        mctx.stroke();
      }
    }
  }

  const MINI_COL = {
    tube: 'rgba(226,240,250,0.92)',
    ruler: 'rgba(196,204,212,0.9)',
    ramp: 'rgba(240,160,90,0.9)',
    boost: 'rgba(240,200,90,0.9)',
    mat: 'rgba(255,255,255,0.95)',
    desk: 'rgba(168,140,108,0.85)',
  };

  // ---------- HUD ----------

  const hud = {
    lap: $('#hud-lap'), time: $('#hud-time'), pos: $('#hud-pos'),
    best: $('#hud-best'), slip: $('#hud-slip-fill'), slipBox: document.querySelector('.meter-slip'),
    board: $('#board'),
  };

  let boardRows = [];

  function renderBoard(rebuild) {
    const list = standings();
    if (rebuild || boardRows.length !== list.length) {
      hud.board.innerHTML = '';
      boardRows = state.cars.map(() => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="rank"></span><span class="chip"></span><span class="who"></span><span class="gap"></span>';
        hud.board.appendChild(li);
        return li;
      });
    }
    const leader = list[0];
    const pace = list.find((c) => !c.done);
    list.forEach((car, i) => {
      const li = boardRows[i];
      li.className = car.isPlayer ? 'is-you' : (car.done ? 'is-out' : '');
      li.children[0].textContent = i + 1;
      li.children[1].style.background = COLOURS[car.colour].body;
      li.children[2].textContent = car.isPlayer ? `You — ${car.colour}` : car.name;
      // Once the leader has taken the flag its progress stops, and the cars
      // still circulating sail past it — measuring against it then gives a
      // negative gap. So the reference is the leading car still running.
      let gap = '';
      if (car.done) gap = fmtTime(car.doneAt);
      else if (i === 0) gap = ordinal(1);
      else if (car === pace) gap = 'running';
      else gap = gapText((pace || leader).prog - car.prog);
      li.children[3].textContent = gap;
    });
  }

  function updateHud() {
    const you = state.player;
    const tr = state.track;
    if (!you || !tr) return;
    hud.lap.textContent = `${clamp(you.lap || 1, 1, state.laps)}/${state.laps}`;
    // once you are across the line the clock should show the race, not a lap
    // that will never be finished
    hud.time.textContent = fmtTime(you.done ? you.doneAt
      : state.countdown > 0 ? 0 : state.time - you.lapStart);
    hud.pos.textContent = ordinal(you.pos);
    const rec = save.best[tr.id];
    hud.best.textContent = rec ? fmtTime(rec) : 'best —';
    hud.slip.style.width = `${you.slipstream * 100}%`;
    hud.slipBox.classList.toggle('is-ready', you.slipstream >= 0.25);
  }

  function flashBest() {
    const el = $('.meter-best');
    el.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 600 });
  }

  // ---------- race flow ----------

  let last = 0, acc = 0, hudT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = last ? Math.min(t - last, MAX_FRAME) : 0;
    last = t;

    if (state.screen === 'racing' && !state.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 12) {
        tick(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 12) acc = 0;
    }

    if (!state.paused) stepCamera(dt);
    draw(t);

    hudT += dt;
    if (hudT > 0.06) {
      hudT = 0;
      if (state.screen === 'racing' || state.screen === 'done') {
        renderBoard(false);
        updateHud();
        drawMini();
      }
    }
  }

  function tick(dt) {
    const tr = state.track;

    if (state.countdown > 0) {
      const was = Math.ceil(state.countdown);
      state.countdown -= dt;
      const now = Math.ceil(state.countdown);
      if (now !== was) showCount(Math.max(now, 0));
    } else {
      state.time += dt * 1000;
    }

    for (const car of state.cars) {
      if (state.countdown > 0) {
        car.throttle = 0; car.brake = 0; car.steer = 0;
        if (car.isPlayer) drivePlayer(car);
        continue;
      }
      if (car.isPlayer) drivePlayer(car);
      else driveAi(car, tr, dt);
    }

    if (state.countdown <= 0) slipstream(state.cars, dt);

    for (const car of state.cars) {
      stepCar(car, tr, dt);
      hitProps(car, state.props);
    }
    hitCars(state.cars);

    for (const car of state.cars) {
      place(tr, car);
      if (state.countdown <= 0) updateProgress(car, tr);
      layMarks(car, dt);
    }

    stepFx(dt);
    standings();
    audio.frame(state.player, dt);
  }

  function showCount(n) {
    const el = $('#countdown');
    if (n > 0) {
      el.hidden = false;
      el.innerHTML = `<b>${n}</b>`;
      audio.beep(440);
    } else if (n === 0) {
      el.hidden = false;
      el.innerHTML = '<b>GO!</b>';
      audio.beep(880);
      setTimeout(() => { el.hidden = true; }, 700);
    }
  }

  function endRace() {
    state.screen = 'done';
    save.races++;
    const list = standings();
    const you = state.player;
    if (you.pos === 1) save.wins++;
    persist();
    audio.stop();

    $('#res-title').textContent = you.pos === 1 ? 'You won.' : `${ordinal(you.pos)} place`;
    const best = you.best < Infinity ? `Best lap ${fmtTime(you.best)}.` : '';
    const rec = save.best[state.track.id];
    $('#res-sub').textContent = `${state.track.name} — ${state.laps} laps. ${best} Desk record ${fmtTime(rec)}.`;

    const ol = $('#resboard');
    ol.innerHTML = '';
    // rivals still out there finish on the spot, ordered by how far they got
    const pace = list.find((c) => !c.done);
    list.forEach((car, i) => {
      const li = document.createElement('li');
      if (car.isPlayer) li.className = 'is-you';
      const gapT = car.done ? fmtTime(car.doneAt)
        : `${gapText((pace || list[0]).prog - car.prog)} back`;
      li.innerHTML = `<span class="rank">${i + 1}</span>
        <span class="chip" style="background:${COLOURS[car.colour].body}"></span>
        <span class="who">${car.isPlayer ? 'You' : car.name}</span>
        <span class="gap">${gapT}</span>`;
      ol.appendChild(li);
    });
    $('#results').hidden = false;
    $('#arena').classList.remove('racing');
  }

  function togglePause() {
    if (state.screen !== 'racing') {
      if (!$('#help').hidden) { $('#help').hidden = true; return; }
      return;
    }
    state.paused = !state.paused;
    $('#paused').hidden = !state.paused;
    if (state.paused) audio.stop(); else audio.start();
  }

  // ---------- audio ----------

  const audio = (() => {
    let ac = null, master = null, eng = null, engGain = null, engFilt = null;
    let scr = null, scrGain = null;
    let on = save.sound !== false;
    let running = false;

    function ensure() {
      if (ac || !on) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { on = false; return null; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      return ac;
    }

    function buildEngine() {
      eng = ac.createOscillator();
      eng.type = 'sawtooth';
      eng.frequency.value = 60;
      engFilt = ac.createBiquadFilter();
      engFilt.type = 'lowpass';
      engFilt.frequency.value = 700;
      engFilt.Q.value = 4;
      engGain = ac.createGain();
      engGain.gain.value = 0;
      eng.connect(engFilt).connect(engGain).connect(master);
      eng.start();

      // tyre scrub is filtered noise
      const len = 2 * ac.sampleRate;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      scr = ac.createBufferSource();
      scr.buffer = buf;
      scr.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2400;
      f.Q.value = 1.4;
      scrGain = ac.createGain();
      scrGain.gain.value = 0;
      scr.connect(f).connect(scrGain).connect(master);
      scr.start();
    }

    function blip(freq, dur, type, vol) {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.16, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(ac.currentTime + dur + 0.02);
    }

    return {
      get on() { return on; },
      toggle() {
        on = !on;
        save.sound = on;
        persist();
        if (!on && engGain) engGain.gain.value = 0;
        if (!on && scrGain) scrGain.gain.value = 0;
        return on;
      },
      start() {
        if (!ensure()) return;
        if (ac.state === 'suspended') ac.resume();
        if (!eng) buildEngine();
        running = true;
      },
      stop() {
        running = false;
        if (engGain) engGain.gain.value = 0;
        if (scrGain) scrGain.gain.value = 0;
      },
      frame(car, dt) {
        if (!on || !running || !ac || !engGain || !car) return;
        const sp = Math.hypot(car.vx, car.vy);
        const rev = clamp(sp / (car.topSpeed || 300), 0, 1.3);
        const target = 52 + rev * 180 + (car.boost > 0 ? 60 : 0);
        eng.frequency.value += (target - eng.frequency.value) * clamp(dt * 9, 0, 1);
        engFilt.frequency.value = 480 + rev * 1500;
        const want = (car.throttle > 0 ? 0.075 : 0.035) * clamp(0.35 + rev, 0, 1.2);
        engGain.gain.value += (want - engGain.gain.value) * clamp(dt * 8, 0, 1);
        const screech = car.slip > 0.3 && sp > 60 ? clamp((car.slip - 0.3) * 0.22, 0, 0.1) : 0;
        scrGain.gain.value += (screech - scrGain.gain.value) * clamp(dt * 12, 0, 1);
      },
      beep(f) { blip(f, 0.16, 'square', 0.13); },
      lap() { blip(660, 0.1, 'triangle', 0.12); setTimeout(() => blip(990, 0.14, 'triangle', 0.1), 90); },
      boost() { if (!ensure()) return; blip(300, 0.3, 'sawtooth', 0.12); setTimeout(() => blip(700, 0.25, 'sine', 0.08), 60); },
      whoosh() { blip(180, 0.22, 'sine', 0.09); },
      thud(v) { blip(80 + Math.random() * 40, 0.13, 'square', 0.1 * v); },
      scrape(v) { blip(1800 + Math.random() * 600, 0.05, 'sawtooth', clamp(v / 4000, 0.01, 0.05)); },
    };
  })();

  // ---------- menu ----------

  let pick = { track: TRACKS[0].id, laps: save.laps, cls: save.cls, colour: save.colour };

  function renderMenu() {
    const host = $('#tracklist');
    host.innerHTML = '';
    TRACKS.forEach((def) => {
      const btn = document.createElement('button');
      btn.className = 'trackcard' + (def.id === pick.track ? ' is-on' : '');
      btn.innerHTML = `<canvas width="240" height="150"></canvas><b>${def.name}</b><span>${def.blurb}</span>`;
      btn.onclick = () => { pick.track = def.id; renderMenu(); };
      host.appendChild(btn);
      sketchTrack(btn.querySelector('canvas'), def);
    });

    seg('#opt-laps', LAP_OPTS, pick.laps, (v) => { pick.laps = v; save.laps = v; persist(); renderMenu(); }, (v) => v);
    seg('#opt-class', CLASS_OPTS.map((c) => c.id), pick.cls,
      (v) => { pick.cls = v; save.cls = v; persist(); renderMenu(); },
      (v) => CLASS_OPTS.find((c) => c.id === v).name);

    const cp = $('#carpick');
    cp.innerHTML = '';
    PLAYER_COLOURS.forEach((c) => {
      const b = document.createElement('button');
      b.className = c === pick.colour ? 'is-on' : '';
      b.style.background = COLOURS[c].body;
      b.title = c;
      b.onclick = () => { pick.colour = c; save.colour = c; persist(); renderMenu(); };
      cp.appendChild(b);
    });

    const rec = save.best[pick.track];
    $('#menu-best').textContent = rec
      ? `Desk record on this one: ${fmtTime(rec)}`
      : 'No lap set on this one yet.';

    previewTrack(TRACKS.find((t) => t.id === pick.track) || TRACKS[0]);
    renderMenuPanel(rec);
  }

  // The side panel would otherwise sit empty until the lights go out, so it
  // shows the field you are about to line up against.
  function renderMenuPanel(rec) {
    const field = [{ name: `You — ${pick.colour}`, colour: pick.colour, you: true }]
      .concat(RIVALS.filter((r) => r.colour !== pick.colour).slice(0, 4));
    hud.board.innerHTML = '';
    boardRows = [];
    field.forEach((r, i) => {
      const li = document.createElement('li');
      if (r.you) li.className = 'is-you';
      li.innerHTML = `<span class="rank">${i + 1}</span>
        <span class="chip" style="background:${COLOURS[r.colour].body}"></span>
        <span class="who">${r.name}</span><span class="gap"></span>`;
      hud.board.appendChild(li);
    });
    hud.lap.textContent = `–/${pick.laps}`;
    hud.time.textContent = '0:00.00';
    hud.pos.textContent = '—';
    hud.best.textContent = rec ? fmtTime(rec) : 'best —';
    hud.slip.style.width = '0%';
    hud.slipBox.classList.remove('is-ready');
  }

  function seg(sel, values, current, onPick, fmt) {
    const host = $(sel);
    host.innerHTML = '';
    values.forEach((v) => {
      const b = document.createElement('button');
      b.textContent = fmt ? fmt(v) : v;
      if (v === current) b.className = 'is-on';
      b.onclick = () => onPick(v);
      host.appendChild(b);
    });
  }

  // a little wire diagram of the lap for the picker
  const sketchCache = Object.create(null);

  function sketchTrack(cv, def) {
    const tr = sketchCache[def.id] || (sketchCache[def.id] = buildTrack(def));
    const g = cv.getContext('2d');
    const pad = 10;
    const s = Math.min((cv.width - pad * 2) / DESK_W, (cv.height - pad * 2) / DESK_H);
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate((cv.width - DESK_W * s) / 2, (cv.height - DESK_H * s) / 2);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      g.strokeStyle = MINI_COL[run.surf] || '#999';
      g.lineWidth = 50;
      g.stroke();
    }
    const p = tr.pts[0];
    g.restore();
    g.fillStyle = '#ef7b35';
    g.beginPath();
    g.arc((cv.width - DESK_W * s) / 2 + p.x * s, (cv.height - DESK_H * s) / 2 + p.y * s, 4, 0, TAU);
    g.fill();
  }

  // ---------- wiring ----------

  function go() {
    // the desk and the props are baked into a layer at the start of a race, so
    // there is no point starting one before they have arrived
    if (!artReady) { loadArt().then(go); return; }
    $('#menu').hidden = true;
    $('#results').hidden = true;
    $('#paused').hidden = true;
    state.paused = false;
    const def = TRACKS.find((t) => t.id === pick.track) || TRACKS[0];
    startRace(def, { laps: pick.laps, cls: pick.cls, colour: pick.colour });
  }

  $('#btn-go').onclick = go;
  $('#btn-again').onclick = go;
  $('#btn-menu').onclick = () => {
    $('#results').hidden = true;
    $('#menu').hidden = false;
    state.screen = 'menu';
    renderMenu();
  };
  $('#btn-resume').onclick = togglePause;
  $('#btn-quit').onclick = () => {
    state.paused = false;
    $('#paused').hidden = true;
    $('#results').hidden = true;
    $('#menu').hidden = false;
    state.screen = 'menu';
    $('#arena').classList.remove('racing');
    audio.stop();
    renderMenu();
  };
  $('#btn-help').onclick = () => { $('#help').hidden = false; };
  $('#btn-help-close').onclick = () => { $('#help').hidden = true; };
  $('#btn-sound').onclick = (e) => {
    const on = audio.toggle();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on && state.screen === 'racing') audio.start();
  };
  $('#btn-sound').setAttribute('aria-pressed', String(save.sound !== false));

  window.addEventListener('resize', fitCanvas);

  // ---------- boot ----------

  fitCanvas();
  renderMenu();
  requestAnimationFrame(frame);

  loadArt().then(() => {
    // the menu sketches and the first bake both want the art
    renderMenu();
  });

  // ---------- the debug handle ----------

  window.__toyRacers = {
    state, TRACKS, COLOURS, SURF, debug, DRESSING, cam, view,
    get cars() { return state.cars; },
    get track() { return state.track; },
    get player() { return state.player; },
    standings,
    start(trackId, opts) {
      pick = Object.assign({}, pick, { track: trackId || pick.track }, opts || {});
      go();
      return state.track;
    },
    // drop a car at a fraction round the lap, for tests
    put(car, frac, off) {
      const tr = state.track;
      const i = Math.round(clamp(frac, 0, 0.999) * tr.count) % tr.count;
      const p = tr.pts[i];
      car.x = p.x + p.nx * (off || 0);
      car.y = p.y + p.ny * (off || 0);
      car.ang = p.ang;
      car.si = i; car.prevS = p.s;
      car.vx = 0; car.vy = 0; car.air = false; car.z = 0;
      return car;
    },
    // run the sim with no rendering, for tests
    sim(seconds) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) tick(STEP);
      return standings().map((c) => ({ name: c.name, lap: c.lap, prog: Math.round(c.prog), pos: c.pos }));
    },
    fmtTime, buildTrack, DESK_W, DESK_H,
    // what the car can actually do, so a test can work out whether a corner
    // is takeable rather than guessing at it
    HANDLING: { TURN, TURN_V, LAT_ACCEL, LAT_FLOOR, TOP_SPEED, ACCEL, BRAKE, CAR_WID, CAR_R },
  };
})();
