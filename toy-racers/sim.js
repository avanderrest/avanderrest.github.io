/* Toy Racers: the rules. Five toy cars round circuits laid out in the clutter all over the
   house: the tracks and their themes as data, how a track is built from its points, the
   field on the grid, the physics (grip, slides, jumps, puddles, props and each other),
   laps and standings, slipstream, the AI, and the particles. No page access, so a whole
   race can be run in Node:

     const tr = createRacers({ save, rnd, on })
       save   the saved object (best laps per track, wins, races, the last choices)
       rnd    the dice (the AI's moods, the sparks); tr.seedDice(n) for tests
       on     on(event, data): 'sfx' [name, ...args], 'engine' dt, 'count' n (the
              countdown), 'mark' { x, y, ang, wet, a } (a skid mark), 'best' (a track
              record), 'save', 'end' (the player took the flag)

   state is the whole race; tr.keys is the key map the page writes into; tick(dt) is one
   fixed step. */
import { mulberry32 } from '../lib/rng.js';

/* The save as kept (parsed JSON, or null): v2 or nothing, with the blanks filled in. */
export function readSave(raw) {
  const blank = { v: 2, colour: 'red', laps: 5, cls: 'mid', best: {}, wins: 0, races: 0, sound: true };
  if (!raw || raw.v !== 2) return blank;
  return Object.assign(blank, raw, { best: Object.assign({}, raw.best) });
}

export function createRacers({ save = readSave(null), rnd, on = () => {} } = {}) {
  // ---------- constants ----------


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
      name: 'Tinsel Run',
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
  let R = rnd || Math.random;      // the dice; seedDice(n) swaps in a seeded one for tests

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


  // ---------- laying a track out ----------
  /* The circuit on the desk, with no cars: what the menu shows behind it. */
  function layOut(def) {
    const tr = buildTrack(def);
    state.track = tr;
    state.puddles = (def.puddles || []).map((p) => Object.assign({}, p));
    state.cars = [];
    state.player = null;
    return tr;
  }

  /* The state half of starting a race: the track, the clock and the field on the grid.
     The page paints the desk and starts the countdown. */
  function setupRace(trackDef, opts) {
    state.trackDef = trackDef;
    const tr = buildTrack(trackDef);
    state.track = tr;
    state.laps = opts.laps;
    state.cls = opts.cls;
    state.colour = opts.colour;
    state.time = 0;
    state.countdown = 3;
    state.finished = [];
    state.paused = false;
    state.fx = [];
    state.puddles = (trackDef.puddles || []).map((p) => Object.assign({}, p));

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
        ai: { skill: r.skill * cls.skill, nerve: r.nerve, line: r.line, rubber: cls.rubber, t: R() * 10 },
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
    return tr;
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
        if (keep < 0.8) on('sfx', ['thud', 0.5]);
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
      if (R() < dt * 40) spark(car.x, car.y, COLOURS[car.colour].trail);
    }
    if (surf.jump && car.onTrack && fwd > JUMP_MIN && !car.air) {
      car.air = true;
      car.vz = clamp(fwd * JUMP_VZ, 14, 48);
      car.z = 0.5;
      car.spinAir = car.steer * 0.9;
      on('sfx', ['whoosh']);
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
          if (Math.abs(vn) > 90) { on('sfx', ['scrape', Math.abs(vn)]); spark(car.x, car.y, '#fff2c8'); }
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
          on('sfx', ['thud', clamp(-vn / 300, 0.2, 1)]);
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
            on('sfx', ['thud', clamp(-rel / 320, 0.15, 0.8)]);
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
    on('sfx', ['boost']);
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
          if (!rec || t < rec) { save.best[tr.id] = t; on('save'); on('best'); }
        }
      }
      car.lapStart = state.time;
      if (car.lap > state.laps) {
        if (!car.done) finishCar(car);
      } else if (car.isPlayer) {
        on('sfx', ['lap']);
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
      ai.next = ai.t + 1.2 + R() * 2;
      car.lineWant = ai.line + (R() - 0.5) * 0.5;
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
    if (car.slipstream > 0.5 && worst < 0.006 && R() < dt * (0.6 + ai.nerve)) {
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

  // ---------- the keys, as the page sets them ----------
  const keys = Object.create(null);
  const HELD = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1 };

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
      const a = R() * TAU, v = 20 + R() * 70;
      state.fx.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: 4 + R() * 7, life: 0.45 + R() * 0.4, t: 0,
        colour, kind: 'puff',
      });
    }
  }

  function spark(x, y, colour) {
    const a = R() * TAU, v = 60 + R() * 160;
    state.fx.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: 1.6 + R() * 2, life: 0.22 + R() * 0.2, t: 0,
      colour, kind: 'spark',
    });
  }

  function smoke(x, y, colour) {
    state.fx.push({
      x, y, vx: (R() - 0.5) * 22, vy: (R() - 0.5) * 22,
      r: 5 + R() * 5, life: 0.7 + R() * 0.5, t: 0,
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
    on('mark', { x: car.x, y: car.y, ang: car.ang, wet: car.wet > 0, a: clamp(car.slip * 0.9 + (car.hand ? 0.25 : 0), 0.08, 0.40) });
    if (car.slip > SPIN_SLIP && R() < 0.4) smoke(car.x, car.y, '#dcdce2');
    if (!car.onTrack && car.surf.grit && R() < 0.5) smoke(car.x, car.y, themeOf(state.track.def).dust);
  }

  /* The player took the flag: the race is over, and it counts. */
  function endRace() {
    state.screen = 'done';
    save.races++;
    standings();
    if (state.player.pos === 1) save.wins++;
    on('save');
    on('end');
  }

  // ---------- a frame of the race ----------
  function tick(dt) {
    const tr = state.track;

    if (state.countdown > 0) {
      const was = Math.ceil(state.countdown);
      state.countdown -= dt;
      const now = Math.ceil(state.countdown);
      if (now !== was) on('count', Math.max(now, 0));
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
    on('engine', dt);
  }

  return {
    wrapAngle, fmtTime, ordinal, trackProps, gapText, buildTrack, nearest, place, makeCar, layOut, setupRace, stepCar, scale, hitProps, hitCars, slipstream, spendSlipstream, updateProgress, finishCar, standings, driveAi, drivePlayer, rescue, puff, spark, smoke, stepFx, layMarks, endRace, tick, DESK_W, DESK_H, UNITS_PER_CM, STEP, MAX_FRAME, CAM_AREA, CAM_LEAD_T, CAM_LEAD_MAX, CAM_FOLLOW, CAM_ZOOM_IN, SAMPLE_STEP, SEARCH, TRACK_WIDEN, SURF, OFF, GRIP_RATE, TURN, TURN_V, LAT_ACCEL, LAT_FLOOR, TOP_SPEED, ACCEL, BRAKE, REVERSE, ROLL_DRIVE, ROLL_COAST, HANDBRAKE_GRIP, DRIFT_HOLD, SPIN_SLIP, CORNER_A, G_AIR, JUMP_MIN, JUMP_VZ, WET_TIME, WET_GRIP, DRAFT_DIST, DRAFT_CONE, DRAFT_FILL, DRAFT_PULL, BOOST_TIME, BOOST_POWER, CAR_LEN, CAR_WID, CAR_R, RESTITUTION, LAP_OPTS, CLASS_OPTS, RIVALS, COLOURS, PLAYER_COLOURS, DESK_DRESSING, THEMES, COMMON_SPRITES, TRACKS, clamp, lerp, TAU, themeOf, state, keys, HELD,
    seedDice(n) { R = mulberry32(n); },
  };
}
