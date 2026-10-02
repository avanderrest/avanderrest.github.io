/* Toy Racers — five toy cars racing round circuits laid out in the clutter all
   over the house. Each track has its own ground off one of Amber's plates: the
   workbench (clear tubing, a steel rule, a floppy-disk stack to jump off, spilt
   coffee), the bathroom floor, the bedroom rug, the potting bench, the Christmas
   table, the cutting mat and the kitchen counter.

   The desk is one canvas. Everything static about a track (the wood, the track
   surfaces, the props) is baked into an offscreen layer once when the race loads;
   only the cars, the skid marks and the particles are drawn per frame.

   Plain DOM/canvas, no build step, no dependencies. Saves to localStorage. */
(() => {
  'use strict';

  // ---------- touch screens ----------
  // `pointer: coarse` only describes the main pointer, so a Surface with its keyboard
  // attached would hide the on-screen controls. Any touch screen, or the first finger
  // or pen on the glass, sets <html class="has-touch"> instead, and a long press on a
  // button or the canvas no longer opens the browser's menu.
  (() => {
    const root = document.documentElement;
    let finger = false;
    if (window.matchMedia && matchMedia('(any-pointer: coarse)').matches) root.classList.add('has-touch');
    addEventListener('pointerdown', (e) => { finger = e.pointerType !== 'mouse'; if (finger) root.classList.add('has-touch'); }, true);
    addEventListener('contextmenu', (e) => { if (finger && e.target.closest && e.target.closest('button, canvas')) e.preventDefault(); }, true);
  })();

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

  // Every track's half-widths are drawn up at this scale. The node figures were laid out
  // for one car; this is room for three abreast, or one drifting wide through a bend.
  const TRACK_WIDEN = 1.3;

  // Surfaces. `top` and `acc` are shares of the car's rated figures; `grip` is how
  // fast the velocity swings round to follow the nose, which is the whole feel of
  // the thing. `wall` means the surface has raised sides you can lean on.
  const SURF = {
    mat:   { name: 'card',    top: 0.92, acc: 0.95, grip: 1.05, drag: 0.55 },
    desk:  { name: 'wood',    top: 0.84, acc: 0.82, grip: 0.80, drag: 0.95, grit: 0.55 },
    tube:  { name: 'tubing',  top: 1.00, acc: 1.00, grip: 1.30, drag: 0.45, wall: true },
    ruler: { name: 'steel',   top: 1.14, acc: 1.06, grip: 0.85, drag: 0.30, sheen: true },   // fast, not slippery: a skid nobody could see the reason for wasn't fun
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

  // ---------- themes ----------

  // Every track is laid out somewhere different in the house, off one of Amber's
  // plates: the ground it is raced on, what its surfaces are made of, what gets
  // spilt and what lies about. The physics never changes with the theme — a
  // `tube` grips like tubing whether it is drawn as clear plastic, a wooden train
  // track or a paper chain — so a lap is read the same way on every ground.
  //
  //   ground    the plate stretched over the whole desk
  //   lane      the bare-ground surface: a polished band and its edge lines
  //   mat/tube/fast   how the start mat, the walled track and the quick strip
  //             (`ruler` and `ramp` in SURF) are drawn — see RUN_ART
  //   boost     what the boost strip is strewn with
  //   puddle    a sprite of her spill, or `null` for the drawn coffee stain
  //   sprites   every prop image the theme's tracks use, so it loads as one
  //   words     what the help sheet calls things on this ground
  //
  // `r` on a prop is its collision radius; a prop with no `r` is scenery you drive
  // straight over. Positions are world units, `s` scales the sprite, `rot` is
  // degrees, `under` draws it beneath the track (the stack a ramp is propped on).
  // Props lie along the lap rather than heaped in the infield, since the camera
  // follows the car and what you drive past is what you see.

  // The desk's dressing is shared by its tracks: only the things right at the
  // edges, each with a stable `id` so a track can `omit` one its route runs over.
  const DESK_DRESSING = [
    { id: 'plant-back', img: 'plant', x: 2301, y: 108, s: 1.1, r: 56 },
    { id: 'snes', img: 'gamepad-snes', x: 1599, y: 60, s: 0.95, r: 60 },
    { id: 'ps', img: 'gamepad-ps', x: 120, y: 1443, s: 1.0, r: 62 },
    { id: 'plant-front', img: 'plant', x: 2322, y: 1416, s: 0.9, r: 48 },
    { id: 'bolt-a', img: 'bolt-tall', x: 1374, y: 90, s: 0.8 },
    { id: 'paperclip', img: 'paperclip', x: 705, y: 1458, s: 0.9 },
  ];

  const THEMES = {
    desk: {
      name: 'the workbench',
      ground: 'desk',
      base: '#c99a63',
      lane: { band: 'rgba(96,66,38,0.16)', under: 'rgba(64,40,18,0.34)', polish: 'rgba(247,231,201,0.26)', core: 'rgba(255,244,222,0.16)', edge: 'rgba(252,246,236,0.78)', shade: 'rgba(58,36,16,0.30)' },
      mat: { fill: '#efe7d6' },
      tube: 'clear',
      fast: 'rule',
      boost: 'rainbow',
      puddle: null,
      wet: '86,54,26',
      dust: '#cbb996',
      sprites: ['lamp', 'lamp-small', 'pencil', 'screwdriver', 'gamepad-snes', 'plant',
        'gamepad-ps', 'eraser', 'ruler', 'floppies', 'mug-spill', 'pliers', 'bolt-tall',
        'toolbox', 'cables', 'pen-blue', 'bolt-wide', 'pen-green', 'bolt-small', 'bolt',
        'paperclip', 'chips-tall', 'chips-flat'],
      dressing: DESK_DRESSING,
      words: { tube: 'Clear tubing', fast: 'The steel rule', ramp: 'the floppy stack', spill: 'spilt coffee' },
    },
    bath: {
      name: 'the bathroom floor',
      ground: 'bath/ground',
      base: '#eef1f3',
      lane: { cap: 'butt', band: 'rgba(90,120,150,0.14)', under: 'rgba(96,140,184,0.34)', polish: 'rgba(214,232,246,0.40)', core: 'rgba(255,255,255,0.30)', edge: 'rgba(92,140,190,0.72)', shade: 'rgba(40,70,110,0.22)' },
      mat: { pattern: 'bath/towel', scale: 0.7, edge: '#3d6496' },
      tube: 'hose',
      fast: 'chrome',
      boost: 'bubbles',
      puddle: ['bath/foam', 'bath/foam-b'],
      wet: '150,180,210',
      dust: '#e4ecf2',
      sprites: ['bath/hose', 'bath/rail', 'bath/file', 'bath/bubbles', 'bath/bubbles-b', 'bath/foam', 'bath/foam-b'],
      textures: ['bath/towel'],
      words: { tube: 'The shower hose', fast: 'The chrome rail', ramp: 'the rail', spill: 'soap suds' },
    },
    bedroom: {
      name: 'the bedroom rug',
      ground: 'bedroom/ground',
      base: '#8fa6b4',
      lane: { cap: 'butt', band: 'rgba(40,60,80,0.14)', under: 'rgba(30,50,70,0.28)', polish: 'rgba(170,200,222,0.22)', core: 'rgba(230,240,248,0.14)', edge: 'rgba(250,238,210,0.80)', shade: 'rgba(30,40,56,0.30)' },
      mat: { pattern: 'bedroom/chequer', scale: 0.8, edge: '#a87b48' },
      tube: 'wood',
      fast: 'plank',
      boost: 'stars',
      puddle: ['bedroom/honey'],
      wet: '200,130,30',
      dust: '#d8c6a4',
      sprites: ['bedroom/book', 'bedroom/honey', 'gamepad-ps', 'gamepad-snes', 'lamp-small', 'pencil', 'eraser', 'floppies'],
      textures: ['bedroom/chequer'],
      words: { tube: 'The wooden train track', fast: 'The polished plank', ramp: 'the picture book', spill: 'spilt honey' },
    },
    bench: {
      name: 'the potting bench',
      ground: 'bench/ground',
      base: '#7d7062',
      lane: { cap: 'butt', band: 'rgba(50,36,24,0.16)', under: 'rgba(48,34,22,0.30)', polish: 'rgba(214,196,170,0.22)', core: 'rgba(236,224,204,0.14)', edge: 'rgba(240,232,214,0.72)', shade: 'rgba(40,28,16,0.32)' },
      mat: { pattern: 'bench/coir', scale: 0.7, edge: '#6b4a26' },
      tube: 'pipe',
      fast: 'slate',
      boost: 'chalk',
      puddle: ['bench/mud'],
      wet: '70,46,28',
      dust: '#a8916e',
      sprites: ['bench/packet', 'bench/trowel', 'bench/mud', 'bench/pipe', 'plant', 'pliers', 'screwdriver', 'bolt', 'bolt-small'],
      textures: ['bench/slate', 'bench/coir'],
      words: { tube: 'The guttering', fast: 'The slate', ramp: 'the slate', spill: 'mud' },
    },
    christmas: {
      name: 'the Christmas table',
      ground: 'christmas/ground',
      base: '#a8222c',
      lane: { cap: 'butt', band: 'rgba(60,8,12,0.16)', under: 'rgba(70,10,16,0.30)', polish: 'rgba(255,190,190,0.14)', core: 'rgba(255,230,230,0.10)', edge: 'rgba(255,244,226,0.85)', shade: 'rgba(50,6,10,0.32)', dash: [10, 8] },
      mat: { fill: '#f6efe2', edge: '#c9a24a' },
      tube: 'chain',
      fast: 'foil',
      boost: 'tinsel',
      puddle: ['christmas/icing'],
      wet: '240,230,200',
      dust: '#f4e7e0',
      sprites: ['christmas/icing', 'christmas/tinsel'],
      textures: ['christmas/board'],
      words: { tube: 'The paper chain', fast: 'The silver foil', ramp: 'the cake board', spill: 'brandy butter' },
    },
    craft: {
      name: 'the cutting mat',
      ground: 'craft/ground',
      base: '#2f7a64',
      lane: { cap: 'butt', band: 'rgba(10,50,40,0.14)', under: 'rgba(10,46,36,0.28)', polish: 'rgba(170,220,200,0.18)', core: 'rgba(230,250,240,0.10)', edge: 'rgba(246,250,244,0.85)', shade: 'rgba(8,40,30,0.30)', dash: [14, 9] },
      mat: { pattern: 'craft/chequer', scale: 0.5, edge: '#7a5a34' },
      tube: 'card',
      fast: 'rule',
      boost: 'glitter',
      puddle: ['craft/glue'],
      wet: '120,150,170',
      dust: '#cfe2d6',
      sprites: ['craft/tape', 'craft/glue', 'pencil', 'eraser', 'pen-blue', 'pen-green', 'paperclip', 'ruler'],
      textures: ['craft/chequer'],
      words: { tube: 'The cardboard strip', fast: 'The steel rule', ramp: 'the tape roll', spill: 'spilt glue' },
    },
    kitchen: {
      name: 'the kitchen counter',
      ground: 'kitchen/ground',
      base: '#ecebe8',
      lane: { cap: 'butt', band: 'rgba(120,110,100,0.10)', under: 'rgba(255,255,255,0.40)', polish: 'rgba(255,255,255,0.45)', core: 'rgba(255,255,255,0.30)', edge: 'rgba(170,150,130,0.55)', shade: 'rgba(120,100,80,0.18)' },
      mat: { gingham: '#d8443a', edge: '#9c2a22' },
      tube: 'straw',
      fast: 'tray',
      boost: 'sprinkles',
      puddle: ['kitchen/milk'],
      wet: '200,196,186',
      dust: '#f4f0ea',
      sprites: ['kitchen/sprinkles', 'kitchen/milk', 'kitchen/pin', 'kitchen/card', 'kitchen/tray', 'kitchen/straw', 'mug-spill'],
      words: { tube: 'The bendy straws', fast: 'The baking tray', ramp: 'the rolling pin', spill: 'spilt milk' },
    },
  };

  // the flags at the start line are on every ground
  const COMMON_SPRITES = ['flag', 'flags'];

  // A track is a closed Catmull-Rom through [x, y, halfWidth, surface]. The flags
  // and the chequered mat go on the first node, so node 0 is the start line.
  //
  // Tight corners are fine and are the interesting part; what is not fine is a
  // tight corner made of steel rule. The rule once had a third of the grip of the
  // tubing, and the first versions put R=88 bends on it — corners that demanded
  // a 50% speed cut and could not be taken at all. It has near-ordinary grip now
  // (sliding down it with no say in the matter was no fun), but it still only runs
  // down parts of a lap straight enough to use its speed, which `test/toy-racers`
  // checks by working out the fastest each sample can be taken at.
  //
  // One track per theme. `coffee` and `longrule` kept their ids when they moved
  // off the desk (to the kitchen and the cutting mat) so their lap records, which
  // are per shape, still count.
  const TRACKS = [
    {
      id: 'workbench',
      name: 'Workbench Sprint',
      theme: 'desk',
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
      id: 'bedroom',
      name: 'Round the Rug',
      theme: 'bedroom',
      blurb: 'Off the train track, over the picture book and back round the rug before the honey gets you.',
      nodes: [
        [700, 1230, 64, 'mat'],
        [1150, 1290, 64, 'boost'],
        [1600, 1270, 54, 'ruler'],
        [1980, 1130, 58, 'tube'],
        [2160, 860, 58, 'tube'],
        [2120, 540, 58, 'tube'],
        [1900, 300, 58, 'tube'],
        [1560, 240, 64, 'desk'],
        [1300, 400, 54, 'ramp'],
        [1060, 560, 64, 'desk'],
        [780, 480, 64, 'desk'],
        [520, 300, 58, 'tube'],
        [260, 420, 58, 'tube'],
        [200, 760, 58, 'tube'],
        [330, 1070, 64, 'desk'],
      ],
      puddles: [{ x: 2150, y: 880, r: 62 }, { x: 1640, y: 250, r: 54 }],
      extra: [
        // the book is propped open as the ramp, so it goes down first
        { img: 'bedroom/book', x: 1300, y: 400, s: 0.8, rot: 8, under: true },
        { img: 'bedroom/book', x: 980, y: 190, s: 0.62, rot: -20, r: 66 },
        { img: 'gamepad-ps', x: 1020, y: 860, s: 1.0, rot: -12, r: 62 },
        { img: 'gamepad-snes', x: 1560, y: 930, s: 0.95, rot: 14, r: 60 },
        { img: 'lamp-small', x: 2320, y: 140, s: 1, r: 46 },
        { img: 'floppies', x: 640, y: 820, s: 1.0, rot: 10, r: 62 },
        { img: 'pencil', x: 1270, y: 1000, s: 0.95, rot: 34 },
        { img: 'eraser', x: 1330, y: 1050, s: 0.85, rot: -10 },
        { img: 'pencil', x: 2290, y: 1380, s: 0.95, rot: -60 },
        { img: 'eraser', x: 110, y: 1380, s: 0.85, rot: 25 },
        { img: 'gamepad-snes', x: 140, y: 140, s: 0.9, rot: -30, r: 56 },
      ],
    },
    {
      id: 'coffee',
      name: 'Bake Day',
      theme: 'kitchen',
      blurb: 'Two long runs on the baking trays and a straw hairpin at each end, with milk across the back.',
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
      puddles: [{ x: 1428, y: 442, r: 70 }, { x: 1050, y: 397, r: 54 }],
      extra: [
        // the recipe card, a tray and a straw run off the edge of the counter,
        // the way they run off the plate, so their cut edges are never seen
        { img: 'kitchen/card', x: 164, y: 146, s: 1 },
        { img: 'kitchen/tray', x: 1060, y: 63, s: 1 },
        { img: 'kitchen/straw', x: 1720, y: 48, s: 1 },
        { img: 'kitchen/pin', x: 2225, y: 1322, s: 1, r: 120 },
        { img: 'mug-spill', x: 1590, y: 300, s: 1.15, r: 58 },   // the milk runs on from the mug
        { img: 'kitchen/sprinkles', x: 1180, y: 760, s: 0.55, rot: 10 },
        { img: 'kitchen/pin', x: 900, y: 740, s: 0.55, rot: 40, r: 66 },
        { img: 'kitchen/sprinkles', x: 380, y: 1330, s: 0.45, rot: -40 },
        { img: 'kitchen/straw', x: 1560, y: 760, s: 0.8, rot: 150 },
        { img: 'kitchen/tray', x: 1000, y: 1443, s: 0.9, rot: 180 },
        { img: 'mug-spill', x: 2290, y: 330, s: 1.0, rot: 30, r: 54 },
      ],
    },
    {
      id: 'bath',
      name: 'Bubble Bath',
      theme: 'bath',
      blurb: 'Along the chrome rail, round the shower hose and down through the dip, where the suds are.',
      nodes: [
        [820, 1250, 64, 'mat'],
        [1250, 1290, 64, 'boost'],
        [1700, 1260, 54, 'ruler'],
        [2050, 1080, 58, 'tube'],
        [2180, 780, 58, 'tube'],
        [2080, 460, 58, 'tube'],
        [1820, 290, 58, 'tube'],
        [1580, 360, 64, 'desk'],
        [1450, 560, 64, 'desk'],
        [1340, 750, 64, 'desk'],
        [1200, 810, 64, 'desk'],
        [1060, 750, 64, 'desk'],
        [950, 560, 64, 'desk'],
        [820, 360, 64, 'desk'],
        [570, 290, 58, 'tube'],
        [320, 460, 58, 'tube'],
        [230, 780, 58, 'tube'],
        [380, 1100, 58, 'tube'],
      ],
      puddles: [{ x: 1200, y: 800, r: 66 }, { x: 2180, y: 700, r: 58 }],
      extra: [
        { img: 'bath/hose', x: 560, y: 720, s: 0.95, rot: -10, r: 62 },
        { img: 'bath/hose', x: 1720, y: 760, s: 0.95, rot: 170, r: 62 },
        { img: 'bath/rail', x: 1180, y: 1440, s: 0.85 },
        { img: 'bath/rail', x: 1200, y: 300, s: 0.75, rot: -4 },
        { img: 'bath/file', x: 720, y: 1010, s: 0.7, rot: 25 },
        { img: 'bath/file', x: 1700, y: 1010, s: 0.7, rot: -60 },
        { img: 'bath/bubbles', x: 1560, y: 560, s: 0.75, rot: 20 },
        { img: 'bath/bubbles', x: 460, y: 980, s: 0.7, rot: -30 },
        { img: 'bath/bubbles-b', x: 2300, y: 160, s: 0.7 },
        { img: 'bath/foam', x: 1230, y: 1060, s: 0.9 },
        { img: 'bath/foam-b', x: 2290, y: 1370, s: 0.8, rot: 40 },
        { img: 'bath/foam-b', x: 110, y: 160, s: 0.7 },
      ],
    },
    {
      id: 'longrule',
      name: 'The Long Rule',
      theme: 'craft',
      blurb: 'Right round the edge of the cutting mat, with a jump along the back and the rule down both sides.',
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
      puddles: [{ x: 1638, y: 1356, r: 72 }, { x: 1074, y: 232, r: 54 }],
      extra: [
        // the rule over the back is propped on a roll of tape
        { img: 'craft/tape', x: 1419, y: 243, s: 0.55, under: true },
        { img: 'craft/tape', x: 900, y: 720, s: 0.75, rot: -10 },
        { img: 'craft/tape', x: 1560, y: 900, s: 0.7, rot: 160 },
        { img: 'pen-blue', x: 1210, y: 600, s: 1, rot: 6, r: 30 },
        { img: 'pen-green', x: 1250, y: 630, s: 1, rot: -28, r: 30 },   // across the blue one
        { img: 'pencil', x: 700, y: 1010, s: 0.95, rot: 20 },
        { img: 'eraser', x: 760, y: 1060, s: 0.9 },
        { img: 'paperclip', x: 1900, y: 1060, s: 0.9, rot: 30 },
        { img: 'ruler', x: 1250, y: 1050, s: 0.8, rot: -4 },
        { img: 'pencil', x: 1720, y: 640, s: 0.95, rot: -70 },
        { img: 'craft/glue', x: 560, y: 650, s: 0.55, rot: 20 },
        { img: 'paperclip', x: 2330, y: 1440, s: 0.9 },
      ],
    },
    {
      id: 'bench',
      name: 'Potting Bench',
      theme: 'bench',
      blurb: 'Down the guttering, back across the slate and through the mud by the flowerpots.',
      nodes: [
        [560, 1240, 64, 'mat'],
        [1000, 1290, 64, 'boost'],
        [1450, 1280, 64, 'desk'],
        [1880, 1200, 54, 'ruler'],
        [2170, 980, 58, 'tube'],
        [2160, 680, 58, 'tube'],
        [1900, 560, 58, 'tube'],
        [1550, 640, 54, 'ruler'],
        [1200, 760, 54, 'ruler'],
        [880, 700, 64, 'desk'],
        [660, 440, 58, 'tube'],
        [480, 250, 58, 'tube'],
        [260, 290, 58, 'tube'],
        [190, 560, 58, 'tube'],
        [210, 860, 58, 'tube'],
        [330, 1080, 64, 'desk'],
      ],
      puddles: [{ x: 1450, y: 1280, r: 66 }, { x: 2165, y: 830, r: 58 }],
      extra: [
        { img: 'bench/trowel', x: 1500, y: 330, s: 0.8, r: 72 },
        { img: 'bench/trowel', x: 2290, y: 1400, s: 0.7, rot: -30, r: 62 },
        { img: 'bench/packet', x: 1010, y: 960, s: 0.7, rot: -12 },
        { img: 'bench/packet', x: 1950, y: 260, s: 0.65, rot: 14 },
        { img: 'bench/pipe', x: 1260, y: 1430, s: 0.8, rot: 180 },
        { img: 'plant', x: 450, y: 700, s: 1.1, r: 56 },
        { img: 'plant', x: 1150, y: 290, s: 1.0, r: 52 },
        { img: 'plant', x: 2300, y: 120, s: 1.0, r: 52 },
        { img: 'pliers', x: 1450, y: 1010, s: 1, rot: 24, r: 48 },
        { img: 'screwdriver', x: 760, y: 980, s: 1, rot: -30 },
        { img: 'bolt', x: 820, y: 1040, s: 0.8 },
        { img: 'bolt-small', x: 1540, y: 1060, s: 0.8, rot: 40 },
        { img: 'bench/packet', x: 110, y: 1380, s: 0.6, rot: 30 },
      ],
    },
    {
      id: 'christmas',
      name: 'Cracker Run',
      theme: 'christmas',
      blurb: 'A long slide down the foil from the top corner, then hard round the paper chain at both ends.',
      nodes: [
        [700, 1250, 64, 'mat'],
        [1200, 1270, 64, 'boost'],
        [1700, 1250, 64, 'desk'],
        [2050, 1150, 58, 'tube'],
        [2200, 880, 58, 'tube'],
        [2180, 520, 58, 'tube'],
        [2050, 260, 58, 'tube'],
        [1820, 230, 58, 'tube'],
        [1550, 400, 54, 'ruler'],
        [1150, 650, 54, 'ruler'],
        [760, 870, 54, 'ruler'],
        [520, 915, 58, 'tube'],
        [280, 990, 58, 'tube'],
        [190, 1150, 58, 'tube'],
        [255, 1295, 58, 'tube'],
        [430, 1345, 64, 'desk'],
      ],
      puddles: [{ x: 2205, y: 700, r: 60 }, { x: 1150, y: 655, r: 52 }],
      extra: [
        { draw: 'board', x: 1380, y: 880, size: 150 },
        { draw: 'board', x: 470, y: 330, size: 130 },
        { draw: 'bauble', x: 1560, y: 1010, size: 30, colour: '#c8202c', r: 30 },
        { draw: 'bauble', x: 1630, y: 1065, size: 24, colour: '#d8a630', r: 24 },
        { draw: 'bauble', x: 880, y: 460, size: 28, colour: '#2f8a45', r: 28 },
        { draw: 'bauble', x: 260, y: 230, size: 26, colour: '#2d6fc4', r: 26 },
        { draw: 'bauble', x: 1880, y: 640, size: 28, colour: '#d8a630', r: 28 },
        { draw: 'bauble', x: 2330, y: 1420, size: 30, colour: '#c8202c', r: 30 },
        { img: 'christmas/tinsel', x: 780, y: 240, s: 0.9, rot: -18 },
        { img: 'christmas/tinsel', x: 1700, y: 720, s: 0.8, rot: 32 },
        { img: 'christmas/tinsel', x: 1100, y: 1430, s: 0.9 },
        { img: 'christmas/icing', x: 1220, y: 1040, s: 0.5, rot: 20 },
      ],
    },
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

  const themeOf = (def) => THEMES[def.theme] || THEMES.desk;

  function trackProps(def) {
    const omit = new Set(def.omit || []);
    return (themeOf(def).dressing || []).filter((p) => !omit.has(p.id)).concat(def.extra || []);
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

  // Art arrives a theme at a time, the picked track's first. Nothing waits for
  // it: a race can start on a bare ground and the scene is baked again the
  // moment its pictures land, so a slow connection costs looks, never the race.
  const art = {};
  const themeLoads = {};

  function loadImage(key, ext) {
    if (art[key]) return art[key].ready;
    const img = new Image();
    img.ready = new Promise((done) => { img.onload = img.onerror = done; });
    img.src = `assets/${key}.${ext}`;
    art[key] = img;
    return img.ready;
  }

  function loadTheme(id) {
    if (themeLoads[id]) return themeLoads[id];
    const T = THEMES[id];
    const all = [loadImage(T.ground, 'jpg')]
      .concat((T.textures || []).map((k) => loadImage(k, 'jpg')))
      .concat(T.sprites.concat(COMMON_SPRITES).map((k) => loadImage(k, 'png')));
    return (themeLoads[id] = Promise.all(all).then(() => {
      T.ready = true;
      // re-bake whatever is on the desk now if it was waiting on these
      if (state.track && themeOf(state.track.def) === T) {
        bakeScene(state.track);
        drawMini();
      }
      if (state.screen === 'menu') renderMenu();
    }));
  }

  const loaded = (key) => art[key] && art[key].complete && art[key].naturalWidth > 0;

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
        const w = lerp(p1[2], p2[2], t) * TRACK_WIDEN;
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
    if (previewed === def.id) return;
    previewed = def.id;
    loadTheme(def.theme || 'desk');
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
    loadTheme(trackDef.theme || 'desk');
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
    $('#btn-pause').hidden = false;
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
    g.fillStyle = car.wet > 0 ? `rgba(${themeOf(state.track.def).wet},${a * 0.22})` : `rgba(42,36,32,${a})`;
    const c = Math.cos(car.ang), s = Math.sin(car.ang);
    for (const [ox, oy] of [[-11, -9], [-11, 9]]) {
      g.beginPath();
      g.ellipse(car.x + ox * c - oy * s, car.y + ox * s + oy * c, 5.5, 3.4, car.ang, 0, TAU);
      g.fill();
    }
    if (car.slip > SPIN_SLIP && Math.random() < 0.4) smoke(car.x, car.y, '#dcdce2');
    if (!car.onTrack && car.surf.grit && Math.random() < 0.5) smoke(car.x, car.y, themeOf(state.track.def).dust);
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

  // Scattered things (sprinkles, stars, glitter) come from a fixed sequence that
  // restarts every bake, so a track looks the same every time it is drawn.
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function bakeScene(tr) {
    const layer = makeLayer();
    const g = layer.ctx;
    const T = themeOf(tr.def);
    seed = 1;

    if (loaded(T.ground)) g.drawImage(art[T.ground], 0, 0, DESK_W, DESK_H);
    else { g.fillStyle = T.base; g.fillRect(0, 0, DESK_W, DESK_H); }

    const props = trackProps(tr.def);
    const byY = (a, b) => a.y - b.y;

    // A few things are what the track is resting *on* — the rule is propped on
    // the floppy stack — so they go down before it.
    props.filter((p) => p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawTrack(g, tr, T);
    for (const pd of state.puddles) drawPuddle(g, pd, T);

    // everything else sits on the desk beside the track, and overlaps its edge
    props.filter((p) => !p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawStartLine(g, tr);
    state.bg = layer;
    state.props = props.filter((p) => p.r);
  }

  function drawProp(g, p) {
    if (p.draw) {
      g.save();
      g.translate(p.x, p.y);
      if (p.rot) g.rotate(p.rot * Math.PI / 180);
      PROP_ART[p.draw](g, p);
      g.restore();
      return;
    }
    const img = art[p.img];
    if (!loaded(p.img)) return;
    const s = (p.s || 1);
    const w = img.width * s, h = img.height * s;
    g.save();
    g.translate(p.x, p.y);
    if (p.rot) g.rotate(p.rot * Math.PI / 180);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  }

  // Things with no piece on any plate, drawn instead.
  const PROP_ART = {
    // a silver cake board: her foil off the Christmas plate, cut into a disc
    board(g, p) {
      const r = p.size || 150;
      g.fillStyle = 'rgba(40,6,10,0.30)';
      g.beginPath();
      g.arc(7, 10, r, 0, TAU);
      g.fill();
      g.save();
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.clip();
      if (loaded('christmas/board')) g.drawImage(art['christmas/board'], -r, -r, r * 2, r * 2);
      else { g.fillStyle = '#cfd3d6'; g.fillRect(-r, -r, r * 2, r * 2); }
      g.restore();
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(118,122,128,0.9)';
      g.beginPath();
      g.arc(0, 0, r - 2, 0, TAU);
      g.stroke();
      g.lineWidth = 2.5;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(0, 0, r - 7, Math.PI * 1.02, Math.PI * 1.62);
      g.stroke();
    },
    // a glass bauble, cap and all
    bauble(g, p) {
      const r = p.size || 26, col = p.colour || '#c8202c';
      g.fillStyle = 'rgba(40,6,10,0.32)';
      g.beginPath();
      g.ellipse(5, 8, r, r * 0.9, 0, 0, TAU);
      g.fill();
      const grd = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
      grd.addColorStop(0, '#fffaf0');
      grd.addColorStop(0.25, col);
      grd.addColorStop(1, shade(col, -0.45));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.fillStyle = '#d9b54a';
      g.fillRect(-r * 0.22, -r - 7, r * 0.44, 9);
      g.strokeStyle = '#b08a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, -r - 9, 4, 0, TAU);
      g.stroke();
    },
  };

  // lighten (amt > 0) or darken a #rrggbb
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(amt > 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // A spill is her own painting of one where the theme has it, laid at the
  // size of the patch the physics makes wet; otherwise the drawn coffee stain.
  function drawPuddle(g, pd, T) {
    const pics = T.puddle;
    const key = pics && pics[Math.round(pd.x + pd.y) % pics.length];
    if (key && loaded(key)) {
      const img = art[key];
      const k = pd.r * 2.5 / Math.max(img.width, img.height);
      g.save();
      g.translate(pd.x, pd.y);
      g.rotate(((pd.rot != null ? pd.rot : (pd.x * 7 + pd.y * 3) % 360)) * Math.PI / 180);
      g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
      g.restore();
      return;
    }
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

  function drawTrack(g, tr, T) {
    // a soft worn band under the whole lap, so the route always reads
    g.save();
    g.lineCap = T.lane.cap || 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      const w = tr.pts[run.from].w;
      g.strokeStyle = T.lane.band;
      g.lineWidth = w * 2.15;
      g.stroke();
    }
    g.restore();

    for (const run of tr.runs) {
      const fn = RUN_ART[run.surf] || RUN_ART.desk;
      g.save();
      fn(g, tr, run, T);
      g.restore();
    }
  }

  // stroke the run's centreline (or a line `off` to one side of it)
  function strokeRun(g, tr, run, colour, width, off) {
    centreLine(g, tr, run, off);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  }

  function strokeEdge(g, tr, run, side, colour, width) {
    g.beginPath();
    edgePath(g, tr, run.from, run.to, side, false);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  }

  // every `n`th sample of a run, with its index
  function eachSample(tr, run, n, fn) {
    for (let i = run.from; i < run.to; i += n) fn(tr.pts[i % tr.count], i);
  }

  // one of her textures as a repeating fill, at `scale`
  function patternOf(g, key, scale) {
    if (!loaded(key)) return null;
    const pat = g.createPattern(art[key], 'repeat');
    if (scale && pat.setTransform) pat.setTransform(new DOMMatrix().scale(scale));
    return pat;
  }

  // a tea-towel gingham, for a theme whose plate has no clean piece of one
  const ginghams = {};
  function gingham(g, colour) {
    if (!ginghams[colour]) {
      const c = document.createElement('canvas');
      c.width = c.height = 36;
      const x = c.getContext('2d');
      x.fillStyle = '#fbf6ee';
      x.fillRect(0, 0, 36, 36);
      x.fillStyle = hexA(colour, 0.5);
      x.fillRect(0, 0, 18, 36);
      x.fillRect(0, 0, 36, 18);
      ginghams[colour] = c;
    }
    return g.createPattern(ginghams[colour], 'repeat');
  }

  function star(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }

  const RUN_ART = {
    // Bare wood. There is nothing laid down here, so the route has to be read off
    // the desk itself: a lane the toys have polished, chalked at the edges. It
    // needs to be obvious — this is the racing surface, not scenery.
    desk(g, tr, run, T) {
      const w = tr.pts[run.from].w;
      const L = T.lane;
      g.lineCap = L.cap || 'round'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = L.under;
      g.lineWidth = w * 2.1;
      g.stroke();

      // the polished middle, where the wheels actually go
      centreLine(g, tr, run);
      g.strokeStyle = L.polish;
      g.lineWidth = w * 1.5;
      g.stroke();
      centreLine(g, tr, run);
      g.strokeStyle = L.core;
      g.lineWidth = w * 0.7;
      g.stroke();

      // chalk lines along both edges — stitching or a cutting line on some grounds
      if (L.dash) g.setLineDash(L.dash);
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = L.edge;
        g.lineWidth = 3.2;
        g.stroke();
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side * 1.04, false);
        g.strokeStyle = L.shade;
        g.lineWidth = 2;
        g.stroke();
      }
      g.setLineDash([]);
    },

    // the mat the start line is painted on: card on the desk, a towel by the
    // bath, a tea towel in the kitchen
    mat(g, tr, run, T) {
      const w = tr.pts[run.from].w;
      const M = T.mat;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(40,28,16,0.26)';
      g.lineWidth = w * 2.16;
      g.stroke();
      const fill = (M.pattern && patternOf(g, M.pattern, M.scale)) || (M.gingham && gingham(g, M.gingham));
      if (fill) {
        runShape(g, tr, run, 0);
        g.fillStyle = fill;
        g.fill();
        if (M.edge) {
          for (const side of [-1, 1]) strokeEdge(g, tr, run, side, M.edge, 3);
        }
        return;
      }
      centreLine(g, tr, run);
      g.strokeStyle = M.fill || '#efe7d6';
      g.lineWidth = w * 2;
      g.stroke();
      centreLine(g, tr, run, -w * 0.55);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = w * 0.5;
      g.stroke();
    },

    tube(g, tr, run, T) {
      (TUBE_ART[T.tube] || TUBE_ART.clear)(g, tr, run, T);
    },

    ruler(g, tr, run, T) {
      (FAST_ART[T.fast] || FAST_ART.rule)(g, tr, run, T);
    },

    // the quick strip propped up into a take-off
    ramp(g, tr, run, T) {
      RUN_ART.ruler(g, tr, run, T);
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

    // a boost strip over the bare ground, strewn with whatever this house has
    boost(g, tr, run, T) {
      RUN_ART.desk(g, tr, run, T);
      const kind = T.boost;
      (BOOST_ART[kind] || BOOST_ART.rainbow)(g, tr, run, T);
      if (kind === 'chalk') return;   // its arrows are the chalk
      // arrows over the top
      const c = tr.count;
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

  // --- the walled track, per theme ---
  const TUBE_ART = {
    // clear plastic tubing: a pale channel with two bright rims
    clear(g, tr, run) {
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

    // the shower hose, split down its length: a ribbed steel wall each side
    hose(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,50,70,0.20)', w * 2.3);
      strokeRun(g, tr, run, 'rgba(214,226,236,0.72)', w * 2);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.35)', w * 1.2);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#7d8a96', 12);
        strokeEdge(g, tr, run, side * 0.985, '#c6d0d8', 5);
        g.strokeStyle = 'rgba(64,76,88,0.6)';
        g.lineWidth = 1.6;
        eachSample(tr, run, 1, (p) => {
          const a = p.w * side * 0.93, b = p.w * side * 1.07;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
      }
    },

    // a wooden train track: two grooves, raised sides and a jigsaw joint
    wood(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,34,14,0.30)', w * 2.3);
      strokeRun(g, tr, run, '#d29c5c', w * 2.06);
      strokeRun(g, tr, run, '#e6b77a', w * 1.5);
      for (const off of [-0.42, 0.42]) {
        strokeRun(g, tr, run, '#9a6430', w * 0.17, w * off);
        strokeRun(g, tr, run, 'rgba(255,232,196,0.45)', 2, w * (off - 0.1));
      }
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#7a4a22', 3.2);
      // a joint every couple of car lengths, with its peg
      const every = Math.max(8, Math.round(150 / tr.step));
      g.strokeStyle = '#7a4a22';
      g.lineWidth = 2.4;
      eachSample(tr, run, every, (p, i) => {
        if (i === run.from) return;
        g.beginPath();
        g.moveTo(p.x + p.nx * p.w, p.y + p.ny * p.w);
        g.lineTo(p.x - p.nx * p.w, p.y - p.ny * p.w);
        g.stroke();
        g.beginPath();
        g.arc(p.x + p.tx * 7, p.y + p.ty * 7, p.w * 0.13, 0, TAU);
        g.stroke();
      });
    },

    // galvanised guttering: a grey channel with rolled rims and its joins
    pipe(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,26,20,0.32)', w * 2.32);
      strokeRun(g, tr, run, '#878f95', w * 2.06);
      strokeRun(g, tr, run, '#a7afb5', w * 1.55);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.32)', w * 0.3, -w * 0.3);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#596167', 9);
        strokeEdge(g, tr, run, side * 0.985, '#cfd5d9', 3);
      }
      const every = Math.max(10, Math.round(210 / tr.step));
      eachSample(tr, run, every, (p, i) => {
        if (i === run.from) return;
        for (const [col, wd, o] of [['#6d757b', 7, 0], ['rgba(230,234,236,0.7)', 2, -4]]) {
          g.strokeStyle = col;
          g.lineWidth = wd;
          g.beginPath();
          g.moveTo(p.x + p.nx * p.w + p.tx * o, p.y + p.ny * p.w + p.ty * o);
          g.lineTo(p.x - p.nx * p.w + p.tx * o, p.y - p.ny * p.w + p.ty * o);
          g.stroke();
        }
      });
    },

    // a paper chain laid along each side, the links in turn
    chain(g, tr, run) {
      const w = tr.pts[run.from].w;
      const cols = ['#d9342b', '#2f9a4a', '#f2c230', '#2d8fd5', '#ee7d2b'];
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,6,10,0.18)', w * 2.2);
      strokeRun(g, tr, run, 'rgba(255,236,214,0.20)', w * 2);
      for (const side of [-1, 1]) {
        eachSample(tr, run, 2, (p, i) => {
          const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
          const col = cols[((i >> 1) + (side > 0 ? 2 : 0)) % cols.length];
          g.save();
          g.translate(x, y);
          g.rotate(p.ang);
          if ((i >> 1) % 2) {
            // a link seen side on, threaded through its neighbours
            g.fillStyle = shade(col, -0.25);
            roundRect(g, -9, -3, 18, 6, 3);
            g.fill();
          } else {
            g.strokeStyle = shade(col, -0.35);
            g.lineWidth = 5.4;
            g.beginPath();
            g.ellipse(0, 0, 9.5, 6.5, 0, 0, TAU);
            g.stroke();
            g.strokeStyle = col;
            g.lineWidth = 3.4;
            g.stroke();
          }
          g.restore();
        });
      }
    },

    // a strip of corrugated card stood on edge each side, the flutes showing
    card(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(20,30,20,0.30)', w * 2.32);
      strokeRun(g, tr, run, '#c99d66', w * 2.04);
      for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) strokeRun(g, tr, run, 'rgba(150,108,62,0.30)', 2, w * off);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#a87a46', 13);
        g.lineWidth = 2;
        eachSample(tr, run, 1, (p, i) => {
          g.strokeStyle = i % 2 ? 'rgba(110,76,40,0.75)' : 'rgba(236,200,150,0.6)';
          const a = p.w * side * 0.92, b = p.w * side * 1.08;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
        strokeEdge(g, tr, run, side * 1.09, '#6e4c26', 2);
        strokeEdge(g, tr, run, side * 0.91, '#6e4c26', 1.5);
      }
    },

    // bendy straws end to end, ribbed where they bend
    straw(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,70,80,0.16)', w * 2.32);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.42)', w * 2);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#2f8fd0', 13);
        strokeEdge(g, tr, run, side, '#5fb6ec', 7);
        strokeEdge(g, tr, run, side * 0.985, 'rgba(255,255,255,0.8)', 2);
        g.strokeStyle = 'rgba(20,80,130,0.55)';
        g.lineWidth = 1.6;
        eachSample(tr, run, 1, (p) => {
          if (p.k < 0.0035) return;
          const a = p.w * side * 0.93, b = p.w * side * 1.07;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
      }
    },
  };

  // --- the quick strip, per theme ---
  const FAST_ART = {
    // the steel rule: brushed metal with its markings
    rule(g, tr, run) {
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

    // the chrome towel rail laid flat: polished, blue in its reflections
    chrome(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,40,54,0.30)', w * 2.2);
      strokeRun(g, tr, run, '#b7c8d7', w * 2);
      strokeRun(g, tr, run, '#91a6b9', w * 0.9, w * 0.52);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.8)', w * 0.34, -w * 0.46);
      strokeRun(g, tr, run, 'rgba(236,246,255,0.5)', w * 0.16, -w * 0.08);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#6f8496', 2.6);
    },

    // a polished pine plank, grain and all
    plank(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(50,30,12,0.30)', w * 2.2);
      strokeRun(g, tr, run, '#deb075', w * 2);
      for (const off of [-0.72, -0.36, 0.06, 0.41, 0.74]) strokeRun(g, tr, run, 'rgba(150,96,44,0.32)', 1.4, w * off);
      strokeRun(g, tr, run, 'rgba(255,242,214,0.42)', w * 0.3, -w * 0.4);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#8a5a2b', 3);
    },

    // a roofing slate, chalk-edged
    slate(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(20,20,24,0.34)', w * 2.24);
      runShape(g, tr, run, 0);
      g.fillStyle = patternOf(g, 'bench/slate', 0.8) || '#4b5560';
      g.fill();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#283038', 3);
      g.setLineDash([12, 10]);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side * 0.88, 'rgba(240,240,232,0.55)', 2.2);
      g.setLineDash([]);
    },

    // a strip of silver foil, crinkled
    foil(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(50,6,10,0.32)', w * 2.2);
      strokeRun(g, tr, run, '#cfd3d7', w * 2);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.55)', w * 0.4, -w * 0.42);
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 2; k++) {
          const o = (rnd() - 0.5) * 1.8 * p.w, a = rnd() * TAU, l = 6 + rnd() * 14;
          const x = p.x + p.nx * o, y = p.y + p.ny * o;
          g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(110,116,124,0.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2);
          g.lineTo(x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2);
          g.stroke();
        }
      });
      g.restore();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#8a9096', 2.6);
    },

    // a baking tray: dark sheet steel with a rolled rim, and last week's baking
    tray(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(40,40,44,0.30)', w * 2.24);
      strokeRun(g, tr, run, '#878e95', w * 2);
      strokeRun(g, tr, run, '#9ba2a8', w * 1.5);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.28)', w * 0.3, -w * 0.38);
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      eachSample(tr, run, 3, (p) => {
        const o = (rnd() - 0.5) * 1.6 * p.w;
        g.fillStyle = `rgba(120,80,40,${0.10 + rnd() * 0.16})`;
        g.beginPath();
        g.arc(p.x + p.nx * o, p.y + p.ny * o, 2 + rnd() * 5, 0, TAU);
        g.fill();
      });
      g.restore();
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#d3d8dc', 8);
        strokeEdge(g, tr, run, side * 1.05, '#5f666c', 2);
      }
    },
  };

  // --- what the boost strip is strewn with, per theme ---
  const BOOST_ART = {
    // the rainbow smear off the desk plate
    rainbow(g, tr, run) {
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
    },

    // her bubbles, blown along the strip
    bubbles(g, tr, run) {
      const key = 'bath/bubbles-b';
      let n = 0;
      eachSample(tr, run, 5, (p) => {
        const o = (n++ % 2 ? 0.42 : -0.42) * p.w + (rnd() - 0.5) * 12;
        const x = p.x + p.nx * o, y = p.y + p.ny * o;
        if (loaded(key)) {
          const img = art[key], k = 0.3;
          g.save();
          g.translate(x, y);
          g.rotate(p.ang + (rnd() - 0.5) * 0.8);
          g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
          g.restore();
        } else {
          g.strokeStyle = 'rgba(160,190,240,0.8)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, 9, 0, TAU);
          g.stroke();
        }
      });
    },

    // a trail of glow-in-the-dark stars
    stars(g, tr, run) {
      g.save();
      g.shadowColor = 'rgba(255,232,120,0.9)';
      g.shadowBlur = 10;
      eachSample(tr, run, 2, (p) => {
        const o = (rnd() - 0.5) * 1.6 * p.w;
        g.fillStyle = rnd() < 0.75 ? '#ffe57a' : '#fff6d6';
        star(g, p.x + p.nx * o, p.y + p.ny * o, 6 + rnd() * 7, rnd() * TAU);
        g.fill();
      });
      g.restore();
    },

    // the strip chalked on to a slate, arrows and all
    chalk(g, tr, run) {
      runShape(g, tr, run, 0);
      g.fillStyle = patternOf(g, 'bench/slate', 0.8) || '#4b5560';
      g.fill();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#283038', 3);
      const c = tr.count;
      g.lineCap = 'round';
      for (let i = run.from + 3; i < run.to - 2; i += 9) {
        const p = tr.pts[i % c];
        const ww = p.w * 0.62;
        // two shaky passes, the way chalk goes on
        for (let k = 0; k < 2; k++) {
          const j = () => (rnd() - 0.5) * 3;
          g.strokeStyle = `rgba(244,244,236,${k ? 0.5 : 0.85})`;
          g.lineWidth = k ? 2 : 4;
          g.beginPath();
          g.moveTo(p.x + p.nx * ww - p.tx * 10 + j(), p.y + p.ny * ww - p.ty * 10 + j());
          g.lineTo(p.x + p.tx * 10 + j(), p.y + p.ty * 10 + j());
          g.lineTo(p.x - p.nx * ww - p.tx * 10 + j(), p.y - p.ny * ww - p.ty * 10 + j());
          g.stroke();
        }
      }
    },

    // tinsel down both sides, gold dust between
    tinsel(g, tr, run) {
      const key = 'christmas/tinsel';
      const every = Math.max(4, Math.round(90 / tr.step));
      for (const side of [-1, 1]) {
        eachSample(tr, run, every, (p) => {
          if (!loaded(key)) return;
          const img = art[key], k = 0.42;
          g.save();
          g.translate(p.x + p.nx * p.w * side * 0.86, p.y + p.ny * p.w * side * 0.86);
          g.rotate(p.ang);
          g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
          g.restore();
        });
      }
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 3; k++) {
          const o = (rnd() - 0.5) * 1.4 * p.w;
          g.fillStyle = rnd() < 0.6 ? 'rgba(242,200,80,0.85)' : 'rgba(255,246,210,0.9)';
          g.beginPath();
          g.arc(p.x + p.nx * o + (rnd() - 0.5) * 6, p.y + p.ny * o + (rnd() - 0.5) * 6, 1 + rnd() * 1.8, 0, TAU);
          g.fill();
        }
      });
    },

    // a spill of glitter
    glitter(g, tr, run) {
      const cols = ['#ffffff', '#e8eef2', '#f0cf6a', '#c9d2da', '#ffe9a8'];
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 7; k++) {
          const o = (rnd() - 0.5) * 1.7 * p.w * (0.5 + rnd() * 0.5);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.beginPath();
          g.arc(p.x + p.nx * o + (rnd() - 0.5) * 7, p.y + p.ny * o + (rnd() - 0.5) * 7, 0.8 + rnd() * 2, 0, TAU);
          g.fill();
        }
      });
      g.globalAlpha = 1;
    },

    // hundreds and thousands
    sprinkles(g, tr, run) {
      const cols = ['#f2668b', '#f7c948', '#59b7ef', '#7fcf6a', '#f39a4a', '#fdfaf2', '#b98ee8'];
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 3; k++) {
          const o = (rnd() - 0.5) * 1.7 * p.w;
          g.save();
          g.translate(p.x + p.nx * o + (rnd() - 0.5) * 7, p.y + p.ny * o + (rnd() - 0.5) * 7);
          g.rotate(rnd() * TAU);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          roundRect(g, -5, -1.6, 10, 3.2, 1.6);
          g.fill();
          g.restore();
        }
      });
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
    $('#res-sub').textContent = `${state.track.name} — ${state.laps} laps. ${best} Track record ${fmtTime(rec)}.`;

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
    $('#btn-pause').hidden = true;
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
      ? `Track record on this one: ${fmtTime(rec)}`
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
    // on its own ground, so the picker says where in the house it is
    const T = themeOf(def);
    if (loaded(T.ground)) {
      g.drawImage(art[T.ground], 0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(16,14,20,0.30)';
      g.fillRect(0, 0, cv.width, cv.height);
    }
    g.save();
    g.translate((cv.width - DESK_W * s) / 2, (cv.height - DESK_H * s) / 2);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(20,16,24,0.55)';
      g.lineWidth = 74;
      g.stroke();
    }
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
  $('#btn-pause').onclick = (e) => { e.currentTarget.blur(); if (!state.paused) togglePause(); };
  // start as if the page had never been opened: every unlock and best lap gone
  $('#btn-restart').onclick = () => {
    if (!confirm('Start over? Every best lap and unlock will be wiped.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  };
  $('#btn-quit').onclick = () => {
    state.paused = false;
    $('#paused').hidden = true;
    $('#results').hidden = true;
    $('#menu').hidden = false;
    state.screen = 'menu';
    $('#arena').classList.remove('racing');
    $('#btn-pause').hidden = true;
    audio.stop();
    renderMenu();
  };
  // the help sheet names the surfaces after what they are on the picked track
  $('#btn-help').onclick = () => {
    const def = state.screen === 'menu' ? TRACKS.find((t) => t.id === pick.track) : state.trackDef;
    const words = themeOf(def || TRACKS[0]).words;
    for (const el of document.querySelectorAll('#help [data-word]')) {
      const w = words[el.dataset.word];
      if (w) el.textContent = w[0].toUpperCase() + w.slice(1);
    }
    // and leaves out the jump on a track that has none
    const has = new Set((def || TRACKS[0]).nodes.map((n) => n[3]));
    for (const el of document.querySelectorAll('#help [data-if]')) el.hidden = !has.has(el.dataset.if);
    $('#help').hidden = false;
  };
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

  // the picked track's theme first, then the rest one after another, so the
  // menu's cards fill in without the first race waiting behind all of them
  (() => {
    const first = themeOf(TRACKS.find((t) => t.id === pick.track) || TRACKS[0]);
    const order = Object.keys(THEMES).sort((a, b) => (THEMES[b] === first) - (THEMES[a] === first));
    order.reduce((p, id) => p.then(() => loadTheme(id)), Promise.resolve());
  })();

  // ---------- the debug handle ----------

  window.__toyRacers = {
    state, TRACKS, THEMES, COLOURS, SURF, debug, cam, view, trackProps, loadTheme,
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
