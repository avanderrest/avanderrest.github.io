/* Blackout — a side-on stealth infiltration, drawn small and blown up, in the
   spirit of the little stealth games phones used to carry. One continuous
   compound: the wire,
   the yard, two floors of building, and a terminal at the far end. Light is the
   whole game. Stand in a lamp pool and a torch beam will find you; stand in the
   dark and the guard walks past your shoulder. You carry five rounds, which is
   enough for the lamps and not enough for the men. */
(() => {
  'use strict';

  // ---------- constants ----------
  // v2: best times are kept per difficulty. A v1 record was set with five rounds,
  // so it is carried across as the hard one.
  const SAVE_KEY = 'spy-assassin-save-v2';
  const OLD_SAVE_KEY = 'spy-assassin-save-v1';
  const SOUND_KEY = 'spy-assassin-sound';
  const DIFF_KEY = 'spy-assassin-difficulty';
  const SCALE_KEY = 'spy-assassin-scale';

  // The old handset screen. It is still the size of everything that is laid out
  // by hand — the status strip, the title and the other panels — and of the clear
  // view around the spy; the canvas itself is now as big as the window.
  const VIEW_W = 176, VIEW_H = 220;   // in pixels
  const HUD_H = 24;                   // the status strip along the top
  const WORLD_H = VIEW_H - HUD_H;     // the clear view's height, under the strip
  const T = 16;                       // pixels per tile

  /* The fog. The canvas fills the window, but you only see clearly as far as the
     old screen reached; past that the compound fades to black, and all that gets
     through is light — lamps, torch beams, cameras, tripwires — blurred, and
     blurrier the further out it is. The view is an ellipse around the centre of
     the old screen, in pixels at r = 1: clear inside FOG_CLEAR, black outside
     FOG_BLACK. Light shows through from the edge outward: a lightly blurred copy
     near the view, handing over to a heavily blurred one out at GLOW_FAR. */
  const FOG_A = 95, FOG_B = 105;
  const FOG_CLEAR = 0.8, FOG_BLACK = 1.12;
  const GLOW_FULL = 1.1, GLOW_HANDOFF = 1.7, GLOW_FAR = 2.4;
  const GLOW_NEAR_RES = 3, GLOW_FAR_RES = 8;   // each blurred layer is drawn this many times smaller
  // How much light gets through. Only a hint that something is out there: at full
  // strength a lamp in the fog was as bright as one in the view, and pulled the eye.
  const GLOW_NEAR_ALPHA = 0.35, GLOW_FAR_ALPHA = 0.22;
  const BEACON_BOOST = 2.6;           // the way out has to read even through that
  const AIM_CLEAR = 0.92;             // a target further out than this is in the fog
  const LOOK_UP = 2.5;                // tiles the view sits above the spy, so he is low in it
  // the sharp scene is only drawn inside this box; beyond it is fog and glow
  const SCENE_W = Math.ceil(2 * FOG_A * FOG_BLACK) + 8;
  const SCENE_H = Math.ceil(2 * FOG_B * FOG_BLACK) + 8;
  let CW = VIEW_W, CH = VIEW_H;       // the canvas, in game pixels; set by fitCanvas()
  // the centre of the clear view, and how far out into the fog a screen point is
  const viewCX = () => Math.round(CW / 2);
  const viewCY = () => Math.round(HUD_H + (CH - HUD_H) / 2);
  const fogR = (sx, sy) => Math.hypot((sx - viewCX()) / FOG_A, (sy - viewCY()) / FOG_B);

  // Only as deep as it needs to be: every row under the ground line is bedrock
  // nobody sees, and each one is a band of dead black at the foot of the screen.
  const MAP_W = 96, MAP_H = 18;

  // tiles
  const EMPTY = 0, WALL = 1, GROUND = 2, VENT = 3, LADDER = 4, CRATE = 5, DOOR = 6, FENCE = 7;

  // the player
  const P_W = 0.62;
  const P_H_STAND = 1.78, P_H_CROUCH = 0.95;
  const SPD_CROUCH = 2.0, SPD_SNEAK = 3.4, SPD_RUN = 6.2;
  const CLIMB_SPD = 3.4;
  const GRAVITY = 36, FALL_MAX = 24;
  const START_HP = 2;
  /* Rounds by difficulty. Five is real scarcity — enough for the lamps
     you most need, so every shot is a decision — and it belongs on hard. Normal
     carries enough for every lamp and camera in the compound with a couple over,
     so running dry is never the reason you did not get out. */
  const ROUNDS = { normal: 15, hard: 5 };
  const DIFFICULTIES = ['normal', 'hard'];
  const NV_DRAIN = 9, NV_CHARGE = 5;   // goggle battery, percent per second

  /* Being seen. A torch that reached 8.5 tiles covered most of an 11-tile-wide
     screen, so there was nowhere on it to stand and wait for a guard to turn —
     which is the move the whole game is made of. Seven tiles leaves a margin you
     can see on screen, and the slower fill gives you a beat to back out of a beam
     rather than being caught the instant it touches you. */
  const CONE_RANGE = 7.0;              // how far a torch reaches, in tiles
  const CONE_HALF = 0.52;              // half-angle, radians
  const PERIPHERAL = 1.7;              // guards notice this close whatever they face
  const DARK_ENOUGH = 0.17;            // below this you are simply not there
  const SUSPECT = 0.45;                // the "?" over a guard's head
  const SEE_RATE = 1.45, FORGET_RATE = 0.5;

  // noise
  const NOISE_RUN = 7.5, NOISE_WALK = 3.0;
  const STEP_LIFE = 0.4;               // how long a footstep mark stays at your feet

  // slow enough that a beat can be read off a patrol and waited out
  const GUARD_SPD = 1.45, GUARD_HUNT = 2.8, GUARD_CHASE = 3.9;
  const GUARD_PAUSE = 2.6;             // seconds spent turning at the end of a beat
  const SHOOT_RANGE = 9, SHOOT_CD = 1.15;

  /* Under the alarm. It used to turn every guard "alert", and an alert guard fired
     whenever he had a line on you — no question of whether he could see you — so
     the walk back out was a shooting gallery that the dark did nothing about. Now
     the alarm starts a search: everyone makes for where you were, then sweeps his
     ground at a brisk pace. Sight builds faster, but it still has to be sight. */
  // how much faster a guard makes you out under the alarm. He starts halfway there
  // already (SEARCH_SUSP), so this only needs to be a little: at 2.5 a lamp had you
  // made in a quarter of a second, which is "instantly" again by another name.
  const ALARM_SEE = 1.5;
  const SEARCH_SUSP = 0.5;             // a searching guard is wary: "?" not "!", and still chokeable
  const SHOOT_GRACE = 0.4;             // he fires only if he saw you this recently
  const LOSE_AFTER = 2.5;              // out of his sight this long, he goes back to searching
  const SEARCH_LOOK = 3.5;             // how long he looks about where he thought you were

  const CAM_RANGE = 6.5, CAM_HALF = 0.4, CAM_LOCK = 1.1;

  const PHASES = {
    infiltrate: 'GET INSIDE THE WIRE',
    keycard: 'FIND THE KEYCARD',
    door: 'OPEN THE SERVICE DOOR',
    terminal: 'REACH THE TERMINAL',
    escape: 'GET BACK TO THE FENCE'
  };
  // the same thing again, short enough for the corner of the status strip
  const PHASE_TAG = {
    infiltrate: 'WIRE', keycard: 'CARD', door: 'DOOR', terminal: 'DATA', escape: 'FENCE'
  };

  /* ---------- the font ----------
     A 5x7 bitmap, drawn a pixel at a time. Hinted type at 7px on a 176px screen
     is a grey smear — the phones of the day all drew their own bitmap font for
     exactly this reason, and every stroke here lands on a whole pixel. */
  const GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;
  const FONT = {
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
    B: '####./#...#/####./#...#/#...#/#...#/####.',
    C: '.###./#...#/#..../#..../#..../#...#/.###.',
    D: '####./#...#/#...#/#...#/#...#/#...#/####.',
    E: '#####/#..../####./#..../#..../#..../#####',
    F: '#####/#..../####./#..../#..../#..../#....',
    G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
    H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    I: '#####/..#../..#../..#../..#../..#../#####',
    J: '....#/....#/....#/....#/#...#/#...#/.###.',
    K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    L: '#..../#..../#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
    N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
    O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    P: '####./#...#/#...#/####./#..../#..../#....',
    Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    R: '####./#...#/#...#/####./#.#../#..#./#...#',
    S: '.####/#..../#..../.###./....#/....#/####.',
    T: '#####/..#../..#../..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
    Z: '#####/....#/...#./..#../.#.../#..../#####',
    0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    1: '..#../.##../..#../..#../..#../..#../.###.',
    2: '.###./#...#/....#/...#./..#../.#.../#####',
    3: '####./....#/....#/.###./....#/....#/####.',
    4: '...#./..##./.#.#./#..#./#####/...#./...#.',
    5: '#####/#..../####./....#/....#/#...#/.###.',
    6: '.###./#...#/#..../####./#...#/#...#/.###.',
    7: '#####/....#/...#./..#../.#.../.#.../.#...',
    8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
    9: '.###./#...#/#...#/.####/....#/#...#/.###.',
    ' ': '...../...../...../...../...../...../.....',
    '.': '...../...../...../...../...../..##./..##.',
    ',': '...../...../...../...../..##./..##./.#...',
    ':': '...../..##./..##./...../..##./..##./.....',
    '-': '...../...../...../#####/...../...../.....',
    '/': '....#/...#./...#./..#../.#.../.#.../#....',
    '!': '..#../..#../..#../..#../..#../...../..#..',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
    ')': '.#.../..#../...#./...#./...#./..#../.#...',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '>': '#..../.#.../..#../...#./..#../.#.../#....',
    '<': '....#/...#./..#../.#.../..#../...#./....#',
    '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
    '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
    "'": '..#../..#../...../...../...../...../.....',
  };
  // parsed once into lists of lit [col, row] pairs
  const GLYPH_PIX = {};
  for (const ch in FONT) {
    const pix = [];
    FONT[ch].split('/').forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') pix.push(x, y);
    });
    GLYPH_PIX[ch] = pix;
  }
  const textWidth = (s, scale) => s.length * (GLYPH_W + GLYPH_GAP) * (scale || 1) - GLYPH_GAP * (scale || 1);

  // ---------- the level ----------
  // Built from rectangles rather than a wall of ascii: same thing, easier to
  // keep honest. Ground line is row 15; the building has a slab at row 10.
  const map = new Uint8Array(MAP_W * MAP_H);
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) ? WALL : map[ty * MAP_W + tx];
  const setTile = (tx, ty, v) => { if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) map[ty * MAP_W + tx] = v; };

  function rect(x, y, w, h, v) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setTile(i, j, v);
  }

  const BLD_L = 44, BLD_R = 90;        // the building's outer walls
  const LADDER_X = 60;
  const DOOR_X = 44;
  const TERMINAL = { x: 86.0, y: 10 };  // feet line of the upper floor
  const EXTRACT_X = 4.5;

  function buildMap() {
    map.fill(EMPTY);
    rect(0, 15, MAP_W, MAP_H - 15, GROUND);          // the earth
    rect(0, 0, 1, MAP_H, WALL);                       // map edges
    rect(MAP_W - 1, 0, 1, MAP_H, WALL);

    // the perimeter wall, with a duct at its foot you can only crawl through
    rect(26, 8, 1, 7, WALL);
    setTile(26, 14, VENT);

    // the building shell
    rect(BLD_L, 5, BLD_R - BLD_L + 1, 1, WALL);       // roof
    rect(BLD_L, 5, 1, 10, WALL);                      // left wall
    rect(BLD_R, 5, 1, 10, WALL);                      // right wall
    rect(BLD_L, 13, 1, 2, DOOR);                      // the service door
    rect(BLD_L + 1, 10, BLD_R - BLD_L - 1, 1, WALL);  // the upper floor slab
    // the shaft: two tiles wide, so finding it in the dark isn't a pixel hunt
    for (let y = 6; y <= 14; y++) { setTile(LADDER_X, y, LADDER); setTile(LADDER_X + 1, y, LADDER); }

    /* Crates, and only ever one high. You can haul yourself up one tile and never
       two, so any stack is a wall from one side or the other — the first layout had
       a stair that climbed fine going in and was a two-tile wall on the way home,
       which made the escape impossible. One high is still cover: crouch behind one
       and a torch at head height passes over you.
       Each sits at the end of a guard's beat, never in the middle of it. A crate in
       a beat turns the guard round, and one that did boxed the keycard guard into
       three tiles under the camera. */
    setTile(30, 14, CRATE); setTile(31, 14, CRATE);    // just inside the duct
    setTile(49, 14, CRATE); setTile(50, 14, CRATE);    // just inside the door
    setTile(73, 9, CRATE);                             // just past the upstairs duct

    // interior partitions. Each has a duct at the floor: they split the guards'
    // beats as well as the sightlines, and you go through on your belly.
    rect(66, 11, 1, 4, WALL); setTile(66, 14, VENT);
    rect(70, 6, 1, 4, WALL); setTile(70, 9, VENT);
  }

  const SOLID = t => t === WALL || t === GROUND || t === CRATE || t === FENCE;
  const blocksVision = t => t === WALL || t === GROUND || t === CRATE || t === VENT || (t === DOOR && !state.doorOpen);
  const indoors = x => x > BLD_L && x < BLD_R;

  function solidFor(tx, ty, crouched) {
    const t = tileAt(tx, ty);
    if (t === VENT) return !crouched;                 // the duct only takes you on your belly
    if (t === DOOR) return !state.doorOpen;
    return SOLID(t);
  }

  // ---------- world objects ----------
  /* The lamps are the level design. What matters is not where they look right
     but how wide a pool each one throws *at floor level*, because that is the
     only height anybody walks at: a lamp 2.8 tiles up with radius r lights a
     strip about 2*sqrt((0.95r)^2 - 2.8^2) wide down there. Laid out so every
     pool is roughly five and a half tiles and every gap between them is three
     or more — a gap you can stand in, watch a patrol from, and cross. The
     ladder shaft and the service door are deliberately left in the dark. */
  function freshLamps() {
    return [
      // the approach: two pools, four and a half tiles of dark between them
      { x: 13.5, y: 11.2, r: 4.2, on: true, pole: true },
      { x: 23.5, y: 11.2, r: 4.2, on: true, pole: true },
      // The yard: one pool in the middle of the keycard guard's beat, with the
      // camera over it. The crates by the duct and the door both stay dark, so
      // the puzzle is crossing the one lit patch — time the sweep, or shoot it.
      { x: 36.0, y: 11.6, r: 3.9, on: true, pole: true },
      // ground floor, left of the partition; the ladder end of it stays dark
      { x: 48.5, y: 11.2, r: 4.1, on: true, pole: false },
      { x: 57.0, y: 11.2, r: 4.1, on: true, pole: false },
      // ground floor, right of the partition
      { x: 71.0, y: 11.2, r: 4.1, on: true, pole: false },
      { x: 81.0, y: 11.2, r: 4.1, on: true, pole: false },
      // Upper floor. The ceiling is higher but a body's chest is not: what counts
      // is the 2.7 tiles from the lamp down to the height light is measured at,
      // which is the same as downstairs — so these are the same radius. Sizing
      // them off the floor instead threw pools half again too wide up here.
      { x: 52.0, y: 6.2, r: 4.1, on: true, pole: false },
      { x: 65.0, y: 6.2, r: 4.1, on: true, pole: false },
      { x: 76.0, y: 6.2, r: 4.1, on: true, pole: false },
      { x: 85.0, y: 6.2, r: 4.1, on: true, pole: false }
    ];
  }

  function freshGuards() {
    // y is the feet line. min/max are the ends of the beat they walk.
    return [
      // beats start half a tile clear of whatever ends them, so the declared beat
      // is the one he actually walks (test/spy-assassin/beats.js holds him to it)
      { id: 'wire', x: 14, y: 15, min: 11, max: 24, dir: 1, card: false },
      { id: 'yard', x: 38, y: 15, min: 32.5, max: 42.5, dir: 1, card: true },
      { id: 'hall', x: 54, y: 15, min: 51.5, max: 58, dir: 1, card: false },
      { id: 'rear', x: 76, y: 15, min: 68, max: 88, dir: -1, card: false },
      { id: 'upper', x: 80, y: 10, min: 74.5, max: 88, dir: 1, card: false }
    ].map(g => Object.assign(g, {
      state: 'patrol', susp: 0, timer: 0, down: false, shootCd: 0, lastSeen: -99,
      target: null, home: g.x, homeY: g.y, lookDir: g.dir
    }));
  }

  function freshCameras() {
    return [
      { x: 36.0, y: 9.6, base: Math.PI * 0.5, span: 0.55, speed: 0.55, t: 0, alive: true, lock: 0 },
      { x: 72.5, y: 5.9, base: Math.PI * 0.5, span: 0.5, speed: 0.7, t: 1.6, alive: true, lock: 0 }
    ];
  }

  function freshLasers() {
    // Beams you duck under. They have to reach below a standing player's head
    // (feet on 15, top at 13.22) but stop above a crouched one (top at 14.05).
    return [
      { x: 55.5, y0: 11, y1: 13.9, on: true },
      { x: 81.5, y0: 6, y1: 8.9, on: true }
    ];
  }

  // ---------- state ----------
  let state = null;

  function newGame() {
    buildMap();
    state = {
      mode: 'title',                  // title | brief | play | hack | dead | win | pause
      difficulty,                     // chosen on the title screen: normal | hard
      phase: 'infiltrate',
      t: 0, clock: 0,
      player: {
        x: 6, y: 15 - P_H_STAND, vx: 0, vy: 0,
        w: P_W, h: P_H_STAND, dir: 1,
        crouch: false, climbing: false, onGround: true,
        step: 0, anim: 0, hp: START_HP, ammo: ROUNDS[difficulty],
        nv: false, batt: 100, light: 0,
        dragging: null, hurt: 0, muzzle: 0
      },
      lamps: freshLamps(),
      guards: freshGuards(),
      cameras: freshCameras(),
      lasers: freshLasers(),
      bullets: [],
      steps: [],                      // footstep marks, drawn small at the spy's feet
      doorOpen: false,
      hasCard: false,
      dataDone: false,
      alarm: false, alarmT: 0, alarmEarly: false,
      taken: 0,                       // guards put down without anyone noticing
      banner: null,                   // a big message across the view, for a moment
      checkpoint: null,               // the state as JSON, from the moment the data came out
      retries: 0,                     // times gone back to it
      prompt: '',                     // the contextual soft-key hint over the spy's head
      aim: null,                      // what a shot would hit right now, for the laser sight
      sight: { obj: null, loud: false, t: 99, x: 0, y: 0, fromX: 0, fromY: 0 },
      hack: null,
      msg: '', msgT: 0,
      camX: 0, camY: 0,
      shake: 0,
      seenBy: 0,                      // strongest suspicion this frame, for the HUD
      ending: ''
    };
    say('OPERATION BLACKOUT');
  }

  function say(text, secs) {
    state.msg = text;
    state.msgT = secs || 2.6;
  }

  // ---------- light ----------
  function losClear(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 0.42);
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      if (blocksVision(tileAt(Math.floor(x0 + dx * f), Math.floor(y0 + dy * f)))) return false;
    }
    return true;
  }

  function lightAt(x, y) {
    // Both ambients sit just under DARK_ENOUGH, alarm or not: floodlights make
    // the compound nastier without ever taking the shadows away entirely.
    const amb = indoors(x) ? (state.alarm ? 0.13 : 0.045) : (state.alarm ? 0.15 : 0.10);
    let l = amb;
    for (const lm of state.lamps) {
      if (!lm.on) continue;
      const dx = x - lm.x, dy = y - lm.y;
      if (Math.abs(dx) > lm.r || Math.abs(dy) > lm.r) continue;
      const d = Math.hypot(dx, dy);
      if (d >= lm.r) continue;
      if (!losClear(lm.x, lm.y, x, y)) continue;
      // Linear falloff. A square one looked plausible and measured wrong: standing
      // directly under a lamp came out at 0.45, half lit, when the whole point of a
      // lamp is that under it you are caught.
      const f = 1 - d / lm.r;
      l += f * 1.45;
    }
    return Math.min(1, l);
  }

  /* A guard's torch is light like any other. Without this, "dark is cover" held
     even with a torch pointed straight at you: you could stand upright in a
     guard's beam beside the yard crates and he walked on. Now the beam shows up
     what it falls on, fading along its length, and only something solid in the
     way stops it. That is what makes a waist-high crate cover: stand up beside
     it and you are in the beam, crouch behind it and the crate takes it. */
  const TORCH_REACH = 5.5, TORCH_POWER = 0.85;
  function torchAt(x, y) {
    let best = 0;
    for (const g of state.guards) {
      if (g.down) continue;
      const ex = g.x, ey = g.y - 1.3;
      const dx = x - ex, dy = y - ey;
      if (Math.sign(dx) !== g.dir) continue;
      const d = Math.hypot(dx, dy);
      if (d >= TORCH_REACH) continue;
      if (Math.abs(Math.atan2(dy, Math.abs(dx))) > CONE_HALF) continue;
      const l = (1 - d / TORCH_REACH) * TORCH_POWER;
      if (l <= best || !losClear(ex, ey, x, y)) continue;
      best = l;
    }
    return best;
  }

  // ---------- collision ----------
  function boxFree(x, y, w, h, crouched) {
    const x0 = Math.floor(x), x1 = Math.floor(x + w - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (solidFor(tx, ty, crouched)) return false;
    return true;
  }

  function onLadder(p) {
    const cx = Math.floor(p.x + p.w / 2);
    const top = Math.floor(p.y + 0.2), bot = Math.floor(p.y + p.h - 0.1);
    return tileAt(cx, top) === LADDER || tileAt(cx, bot) === LADDER;
  }

  // ---------- input ----------
  const keys = Object.create(null);
  const pressed = Object.create(null);   // edge-triggered, cleared each frame

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'run', ShiftRight: 'run',
    KeyZ: 'action', Space: 'action', Enter: 'action', Numpad5: 'action',
    KeyX: 'fire', Slash: 'fire',
    KeyC: 'nv',
    KeyP: 'pause', Escape: 'pause'
  };

  // the on-screen button for a key, lit while the key is held
  function lightButton(name, on) {
    for (const el of document.querySelectorAll('[data-key="' + name + '"]')) el.classList.toggle('down', on);
  }
  function keyDown(name) {
    if (!keys[name]) pressed[name] = true;
    keys[name] = true;
    lightButton(name, true);
  }
  function keyUp(name) {
    keys[name] = false;
    lightButton(name, false);
  }

  addEventListener('keydown', e => {
    const n = KEYMAP[e.code];
    if (!n) return;
    if (!e.repeat) keyDown(n);
    e.preventDefault();
  });
  addEventListener('keyup', e => {
    const n = KEYMAP[e.code];
    if (!n) return;
    keyUp(n);
    e.preventDefault();
  });
  addEventListener('blur', () => { for (const k in keys) keyUp(k); });

  // ---------- the player ----------
  function updatePlayer(dt) {
    const p = state.player;
    const wantLeft = keys.left, wantRight = keys.right;
    const running = keys.run && !keys.down && !p.dragging;

    // crouch, if there's room to come back up
    const wantCrouch = keys.down && !p.climbing;
    if (wantCrouch && !p.crouch) {
      p.y += P_H_STAND - P_H_CROUCH;
      p.h = P_H_CROUCH;
      p.crouch = true;
    } else if (!wantCrouch && p.crouch) {
      const ny = p.y - (P_H_STAND - P_H_CROUCH);
      if (boxFree(p.x, ny, p.w, P_H_STAND, false)) { p.y = ny; p.h = P_H_STAND; p.crouch = false; }
    }

    // ladders
    const lad = onLadder(p);
    if (lad && (keys.up || keys.down) && !p.crouch) p.climbing = true;
    if (!lad) p.climbing = false;

    let speed = p.crouch ? SPD_CROUCH : running ? SPD_RUN : SPD_SNEAK;
    if (p.dragging) speed = Math.min(speed, 1.5);
    if (p.climbing) speed *= 0.5;

    let mx = 0;
    if (wantLeft && !wantRight) { mx = -1; p.dir = -1; }
    else if (wantRight && !wantLeft) { mx = 1; p.dir = 1; }

    // horizontal, with a step up onto a crate or a kerb
    const stepX = mx * speed * dt;
    if (stepX !== 0) {
      if (boxFree(p.x + stepX, p.y, p.w, p.h, p.crouch)) {
        p.x += stepX;
      } else if (p.onGround && !p.crouch && boxFree(p.x + stepX, p.y - 1.02, p.w, p.h, p.crouch)) {
        p.x += stepX; p.y -= 1.02;                    // haul yourself up
      }
      p.step += Math.abs(stepX);
      p.anim += Math.abs(stepX);
    }

    // vertical
    if (p.climbing) {
      p.vy = 0;
      const vy = (keys.up ? -1 : keys.down ? 1 : 0) * CLIMB_SPD * dt;
      if (vy !== 0 && boxFree(p.x, p.y + vy, p.w, p.h, p.crouch)) { p.y += vy; p.step += Math.abs(vy); }
      p.onGround = true;
    } else {
      p.vy = Math.min(FALL_MAX, p.vy + GRAVITY * dt);
      const vy = p.vy * dt;
      if (boxFree(p.x, p.y + vy, p.w, p.h, p.crouch)) {
        p.y += vy;
        p.onGround = false;
      } else {
        // settle onto whatever stopped us
        let stepDown = vy;
        while (Math.abs(stepDown) > 0.002) {
          stepDown /= 2;
          if (boxFree(p.x, p.y + stepDown, p.w, p.h, p.crouch)) p.y += stepDown;
        }
        p.onGround = p.vy > 0;
        p.vy = 0;
      }
    }

    // how lit are you
    const lx = p.x + p.w / 2, ly = p.y + p.h * 0.4;
    p.light = Math.max(lightAt(lx, ly), torchAt(lx, ly));

    // goggles
    if (pressed.nv) toggleNV();
    if (p.nv) {
      p.batt = Math.max(0, p.batt - NV_DRAIN * dt);
      if (p.batt <= 0) { p.nv = false; say('BATTERY FLAT'); }
    } else {
      p.batt = Math.min(100, p.batt + NV_CHARGE * dt);
    }

    // footsteps
    if (mx !== 0 && p.onGround && !p.climbing) {
      const each = p.crouch ? 0.9 : running ? 0.62 : 0.8;
      if (p.step > each) {
        p.step = 0;
        if (!p.crouch) {
          const heard = makeNoise(p.x + p.w / 2, p.y + p.h, running ? NOISE_RUN : NOISE_WALK);
          state.steps.push({ x: p.x + p.w / 2, y: p.y + p.h, run: !!running, heard, life: STEP_LIFE });
          beep(running ? 150 : 110, 0.03, 0.05);
        }
      }
    }

    if (p.hurt > 0) p.hurt -= dt;
    if (p.muzzle > 0) p.muzzle -= dt;

    // dragging a body
    if (p.dragging) {
      if (!keys.action) { p.dragging = null; }
      else {
        const g = p.dragging;
        const want = p.x + p.w / 2 - p.dir * 0.75;
        g.x += (want - g.x) * Math.min(1, dt * 9);
        g.y = p.y + p.h;
      }
    }

    if (pressed.fire) fire();
    if (pressed.action) useAction();

    checkLasers();
    checkPickups();
    state.prompt = contextPrompt();
    state.aim = p.ammo > 0 && !p.climbing && !p.dragging ? aimTarget() : null;
    updateSight(dt);
  }

  /* What the action key would do right now, said over the spy's head. It teaches the
     silent takedown by saying so the first time you get behind somebody, and it
     is the one thing that stops a player walking up to a guard and opening fire. */
  function contextPrompt() {
    const p = state.player;
    const px = p.x + p.w / 2, py = p.y + p.h;

    for (const g of state.guards) {
      if (!g.down) continue;
      if (Math.abs(g.x - px) < 1.1 && Math.abs(g.y - py) < 1.6) {
        return p.dragging ? '' : 'Z DRAG';
      }
    }
    // kept short: half the width of a 176px screen is as much as a prompt may take
    for (const g of state.guards) {
      if (g.down) continue;
      if (Math.abs(g.x - px) > 2.4 || Math.abs(g.y - py) > 1.6) continue;
      if (!unaware(g)) return '';
      return behind(g, px) ? 'Z TAKE HIM' : 'GET BEHIND';
    }
    if (!state.doorOpen && Math.abs(px - (DOOR_X + 0.5)) < 1.7 && py > 12 && py < 16) {
      return state.hasCard ? 'Z USE CARD' : 'LOCKED';
    }
    if (!state.dataDone && Math.abs(px - TERMINAL.x) < 1.6 && Math.abs(py - TERMINAL.y) < 1.4) {
      return 'Z HACK';
    }
    return '';
  }

  /* The laser sight is a glance, not a fixture: when something new comes into the
     line of fire the dot swings across onto it, sits there a moment, and fades.
     It comes back when the target changes — or when the same guard turns to face
     you, since that is the moment its colour matters. */
  const SIGHT_SWEEP = 0.16, SIGHT_HOLD = 0.6, SIGHT_FADE = 0.35;
  const SIGHT_LIFE = SIGHT_SWEEP + SIGHT_HOLD + SIGHT_FADE;

  function updateSight(dt) {
    const a = state.aim, s = state.sight;
    const obj = a ? a.obj : null;
    const loud = !!a && a.kind === 'guard' && !(unaware(a.obj) && behind(a.obj, a.ox));
    if (obj !== s.obj || loud !== s.loud) {
      if (obj) {
        // swing from wherever the dot is now, or out of the muzzle if it was away
        const showing = s.obj && s.t < SIGHT_LIFE;
        s.fromX = showing ? s.x : a.ox;
        s.fromY = showing ? s.y : a.oy;
        s.t = 0;
      }
      s.obj = obj;
      s.loud = loud;
    }
    if (!obj) { s.t = SIGHT_LIFE; return; }
    s.t += dt;
    const k = Math.min(1, s.t / SIGHT_SWEEP);
    const e = 1 - (1 - k) * (1 - k);                // ease out: fast, then settle
    s.x = s.fromX + (a.x - s.fromX) * e;            // follows a target that moves
    s.y = s.fromY + (a.y - s.fromY) * e;
  }

  function toggleNV() {
    const p = state.player;
    if (!p.nv && p.batt < 12) { say('BATTERY TOO LOW'); return; }
    p.nv = !p.nv;
    beep(p.nv ? 660 : 330, 0.06, 0.06);
  }

  // A footstep carries r tiles. Returns whether any guard heard it, so the step
  // marks at the spy's feet can say so.
  function makeNoise(x, y, r) {
    let heard = false;
    for (const g of state.guards) {
      if (g.down) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < r && Math.abs(g.y - y) < 3.5) {
        heard = true;
        if (g.state === 'patrol' || g.state === 'look') {
          g.state = 'hunt'; g.target = x; g.timer = 0;
          g.susp = Math.max(g.susp, 0.3);
        } else if (g.state === 'search' || g.state === 'sweep') {
          g.state = 'search'; g.target = x; g.timer = 0;    // under the alarm, a noise is a lead
        }
      }
    }
    return heard;
  }

  // ---------- shooting ----------
  /* What a shot fired now would hit. fire() and the laser sight both ask this, so
     the dot is never on anything but the thing the round will actually go into.
     Ranked by distance *and* by how far off level it is: the pistol is held out
     straight, so a man in your line of fire beats a lamp overhead. Ranked by
     distance alone, following the keycard guard under the yard lamp put the lamp
     and the camera nearer than him every time, and he could not be shot at all. */
  const AIM_RANGE = 14;
  const AIM_TILT = 3;                  // how much an upward angle counts against a target
  function aimTarget() {
    const p = state.player;
    const ox = p.x + p.w / 2, oy = p.y + p.h * 0.32;
    let best = null, bestScore = Infinity;

    const consider = (obj, x, y, kind) => {
      const dx = x - ox, dy = y - oy;
      if (Math.sign(dx) !== p.dir) return;
      const d = Math.hypot(dx, dy);
      // 4.6 up reaches a yard camera from the ground; at 3.2 it never could
      if (d > AIM_RANGE || Math.abs(dy) > 4.6) return;
      // Only what you can see clearly. The pistol reaches further than the view,
      // and a lamp going out out in the fog — with the laser dot somewhere you
      // cannot see it — is a shot you did not know you were taking.
      const sx = x * T - state.camX, sy = y * T - state.camY + HUD_H;
      if (fogR(sx, sy) > AIM_CLEAR) return;
      const score = d * (1 + AIM_TILT * Math.abs(Math.atan2(dy, Math.abs(dx))));
      if (score >= bestScore) return;
      if (!losClear(ox, oy, x, y)) return;
      bestScore = score; best = { obj, kind, x, y, ox, oy };
    };

    for (const lm of state.lamps) if (lm.on) consider(lm, lm.x, lm.y, 'lamp');
    for (const c of state.cameras) if (c.alive) consider(c, c.x, c.y, 'cam');
    for (const g of state.guards) if (!g.down) consider(g, g.x, g.y - 1.0, 'guard');
    return best;
  }

  function fire() {
    const p = state.player;
    if (p.ammo <= 0) { say('NO ROUNDS LEFT'); beep(90, 0.08, 0.05); return; }
    p.ammo--;
    p.muzzle = 0.09;
    beep(220, 0.05, 0.08, 'square');

    const best = aimTarget();
    const ox = p.x + p.w / 2;
    if (!best) { say('MISSED'); return; }
    if (best.kind === 'lamp') {
      best.obj.on = false;
      state.shake = 0.12;
      say('LIGHT OUT');
      beep(500, 0.05, 0.09, 'square');
    } else if (best.kind === 'cam') {
      best.obj.alive = false;
      say('CAMERA DEAD');
    } else {
      /* A man facing you does not go down quietly, however good the silencer.
         This is the rule the whole game leans on: the pistol is for the lamps,
         and for a back that is turned. Anything else starts a fight you lose. */
      const g = best.obj;
      if (unaware(g) && behind(g, ox)) {
        dropGuard(g, 'shot');
      } else {
        g.susp = 1;
        g.state = 'alert';
        g.target = ox;
        say('HE SAW IT COMING');
        raiseAlarm('SPOTTED');
      }
    }
  }

  const unaware = g => !g.down && g.susp < 0.75 && g.state !== 'alert';
  const behind = (g, fromX) => Math.sign(fromX - g.x) === -g.dir;

  function dropGuard(g, how) {
    g.down = true;
    g.susp = 0;
    g.state = 'down';
    state.taken++;
    if (how === 'choke') { say('OUT COLD'); beep(180, 0.12, 0.07); }
    else { say('DOWN, QUIETLY'); beep(160, 0.1, 0.06); }
  }

  // ---------- the action key ----------
  function useAction() {
    const p = state.player;
    const px = p.x + p.w / 2, py = p.y + p.h;

    // drag a body you're standing over
    for (const g of state.guards) {
      if (!g.down) continue;
      if (Math.abs(g.x - px) < 1.1 && Math.abs(g.y - py) < 1.6) {
        p.dragging = g;
        say('DRAGGING');
        return;
      }
    }

    // choke a guard from behind
    for (const g of state.guards) {
      if (g.down) continue;
      const d = Math.abs(g.x - px);
      if (d > 1.35 || Math.abs(g.y - py) > 1.6) continue;
      if (unaware(g) && behind(g, px)) {
        dropGuard(g, 'choke');
        if (g.card) { state.hasCard = true; advance(); }
        return;
      }
      say(g.state === 'alert' ? 'HE HAS SEEN YOU' : 'NOT FROM THE FRONT');
      return;
    }

    // the service door
    if (Math.abs(px - (DOOR_X + 0.5)) < 1.7 && py > 12 && py < 16) {
      if (state.doorOpen) return;
      if (state.hasCard) {
        state.doorOpen = true;
        say('DOOR OPEN');
        beep(700, 0.09, 0.07);
        advance();
      } else {
        say('LOCKED - NEED A CARD');
        beep(120, 0.1, 0.06);
      }
      return;
    }

    // the terminal
    if (!state.dataDone && Math.abs(px - TERMINAL.x) < 1.6 && Math.abs(py - TERMINAL.y) < 1.4) {
      startHack();
      return;
    }
  }

  function checkPickups() {
    if (state.hasCard) return;
    const p = state.player, px = p.x + p.w / 2;
    for (const g of state.guards) {
      if (g.card && g.down && Math.abs(g.x - px) < 1.0 && Math.abs(g.y - (p.y + p.h)) < 1.6) {
        state.hasCard = true;
        say('KEYCARD TAKEN');
        beep(880, 0.08, 0.07);
        advance();
      }
    }
  }

  function advance() {
    const s = state;
    if (s.phase === 'infiltrate' && s.player.x > 27) s.phase = 'keycard';
    if (s.phase === 'keycard' && s.hasCard) s.phase = 'door';
    if (s.phase === 'door' && s.doorOpen) s.phase = 'terminal';
    if (s.phase === 'terminal' && s.dataDone) s.phase = 'escape';
    say(PHASES[s.phase], 3.2);
  }

  // ---------- lasers ----------
  function checkLasers() {
    const p = state.player;
    for (const L of state.lasers) {
      if (!L.on) continue;
      if (p.x < L.x && p.x + p.w > L.x) {
        // the beam runs from y0 down to y1; crouching keeps you under it
        if (p.y < L.y1 && p.y + p.h > L.y0) {
          L.on = false;
          raiseAlarm('TRIPWIRE');
          return;
        }
      }
    }
  }

  // ---------- guards ----------
  function guardSees(g, tx, ty, light) {
    const ex = g.x, ey = g.y - 1.3;
    const dx = tx - ex, dy = ty - ey;
    const d = Math.hypot(dx, dy);
    if (d > CONE_RANGE) return 0;
    if (!losClear(ex, ey, tx, ty)) return 0;
    const close = d < PERIPHERAL;
    if (!close) {
      if (Math.sign(dx) !== g.dir) return 0;
      const ang = Math.abs(Math.atan2(dy, Math.abs(dx)));
      if (ang > CONE_HALF) return 0;
      if (light < DARK_ENOUGH) return 0;             // shadow is shadow
    }
    const lit = close ? Math.max(light, 0.45) : light;
    return Math.max(0, (0.22 + 0.78 * lit) * (1 - d / (CONE_RANGE * 1.15)));
  }

  function updateGuard(g, dt) {
    const p = state.player;
    if (g.down) return;

    const px = p.x + p.w / 2, py = p.y + p.h * 0.45;
    let exposure = guardSees(g, px, py, p.light);
    if (exposure > 0) {
      if (p.crouch) exposure *= 0.62;
      if (keys.run && !p.crouch) exposure *= 1.4;
    }

    if (exposure > 0) {
      g.susp = Math.min(1, g.susp + exposure * SEE_RATE * (state.alarm ? ALARM_SEE : 1) * dt);
      g.target = px;
      g.lastSeen = state.clock;
      if (g.susp > SUSPECT && g.state !== 'alert') {
        g.state = state.alarm ? 'search' : 'hunt';
        g.timer = 0;
      }
    } else {
      // under the alarm nobody calms down past wary
      g.susp = Math.max(state.alarm ? Math.min(g.susp, SEARCH_SUSP) : 0, g.susp - FORGET_RATE * dt);
    }

    // a body lying in the light is as good as a confession
    if (!state.alarm) {
      for (const b of state.guards) {
        if (!b.down || b === g) continue;
        const bl = Math.max(lightAt(b.x, b.y - 0.6), torchAt(b.x, b.y - 0.6));
        if (bl < 0.2) continue;
        if (guardSees(g, b.x, b.y - 0.6, bl) > 0) {
          g.susp = Math.min(1, g.susp + 1.5 * dt);
          g.target = b.x;
          if (g.state === 'patrol') g.state = 'hunt';
        }
      }
    }

    if (g.susp >= 1 && g.state !== 'alert') {
      g.state = 'alert';
      g.lastSeen = state.clock;
      raiseAlarm('SPOTTED');
    }

    // The SEEN meter: how near anyone is to making you out. Under the alarm every
    // guard is at least wary, so measure from there, or it would never go down.
    const seesYouNow = g.state === 'alert' && state.clock - g.lastSeen < SHOOT_GRACE;
    const seen = seesYouNow ? 1 : state.alarm ? Math.max(0, (g.susp - SEARCH_SUSP) / (1 - SEARCH_SUSP)) : g.susp;
    state.seenBy = Math.max(state.seenBy, seen);

    /* One step along the floor. solidFor rather than SOLID, so a standing guard is
       stopped by a duct he could never fit through. On patrol an obstacle turns him
       round; a guard who is after you (canStep) climbs a one-tile crate and steps
       off the far side, the same as you can — without it he stood behind the first
       crate between you for the rest of the game. */
    const walk = (speed, toward, canStep) => {
      const dir = Math.sign(toward - g.x) || g.dir;
      g.dir = dir;
      const nx = g.x + dir * speed * dt;
      const ahead = Math.floor(nx + dir * 0.4);
      const fy = Math.round(g.y);
      const feet = solidFor(ahead, fy - 1, false);
      const head = solidFor(ahead, fy - 2, false);
      const floor = solidFor(ahead, fy, false);
      if (!feet && !head && floor) { g.x = nx; return true; }
      if (!canStep) return false;
      if (feet && !head && !solidFor(ahead, fy - 3, false) && !solidFor(Math.floor(g.x), fy - 3, false)) {
        g.x = nx; g.y = fy - 1;                    // up onto it
        return true;
      }
      if (!feet && !head && !floor && solidFor(ahead, fy + 1, false)) {
        g.x = nx; g.y = fy + 1;                    // down off it
        return true;
      }
      return false;
    };

    switch (g.state) {
      case 'patrol': {
        // Off his beat — up on a crate, or out past its end after a chase — he may
        // step his way back to it. On it, an obstacle turns him round as usual.
        const lost = Math.round(g.y) !== g.homeY || g.x < g.min - 0.5 || g.x > g.max + 0.5;
        const goal = g.x < g.min - 0.5 ? g.max : g.x > g.max + 0.5 ? g.min : g.dir > 0 ? g.max : g.min;
        if (!walk(GUARD_SPD, goal, lost) || Math.abs(g.x - goal) < 0.3) {
          g.state = 'look'; g.timer = 0;
        }
        break;
      }
      case 'look':
        // Turn early and stand a while facing the new way: the pause is what
        // gives you the window, and it has to be long enough to see coming.
        g.timer += dt;
        if (g.timer > 0.7 && g.timer < 0.77) g.dir *= -1;
        if (g.timer > GUARD_PAUSE) { g.state = 'patrol'; g.timer = 0; }
        break;
      case 'hunt': {
        g.timer += dt;
        const to = g.target == null ? g.x : g.target;
        if (Math.abs(g.x - to) > 0.6) walk(GUARD_HUNT, to, true);
        else if (g.timer > 2.6) { g.state = 'patrol'; g.timer = 0; g.target = null; }
        if (g.timer > 6) { g.state = 'patrol'; g.timer = 0; }
        break;
      }
      case 'alert': {
        // He has you. He closes on where he last saw you, and fires only while he
        // can still see you — lose him for LOSE_AFTER and he is back to searching.
        const sinceSeen = state.clock - g.lastSeen;
        if (sinceSeen > LOSE_AFTER) {
          g.state = 'search'; g.timer = 0; g.susp = Math.max(SEARCH_SUSP, 0.6);
          break;
        }
        const to = g.target == null ? g.x : g.target;
        const d = Math.abs(to - g.x);
        if (d > 3.2) walk(GUARD_CHASE, to, true);
        else g.dir = Math.sign(to - g.x) || g.dir;
        g.shootCd -= dt;
        const sameFloor = Math.abs(g.y - (p.y + p.h)) < 2.5;
        if (sameFloor && sinceSeen < SHOOT_GRACE && Math.abs(px - g.x) < SHOOT_RANGE
          && g.shootCd <= 0 && losClear(g.x, g.y - 1.2, px, py)) {
          g.shootCd = SHOOT_CD;
          state.bullets.push({ x: g.x + g.dir * 0.5, y: g.y - 1.2, vx: g.dir * 17, life: 1.1 });
          beep(300, 0.05, 0.07, 'square');
        }
        break;
      }
      case 'search': {
        // Make for where you were; once there (or stopped by a wall or a duct),
        // stand and look both ways; then go and sweep his own ground.
        const to = g.target == null ? g.x : g.target;
        if (g.timer === 0 && Math.abs(g.x - to) > 0.6 && walk(GUARD_HUNT, to, true)) break;
        g.timer += dt;
        if ((g.timer % 1.2) < dt) g.dir *= -1;
        if (g.timer > SEARCH_LOOK) { g.state = 'sweep'; g.timer = 0; }
        break;
      }
      case 'sweep': {
        // his beat, briskly, with short turns: the compound on edge, not on rails
        if (g.timer > 0) { g.timer -= dt; break; }
        const lost = Math.round(g.y) !== g.homeY || g.x < g.min - 0.5 || g.x > g.max + 0.5;
        const goal = g.x < g.min - 0.5 ? g.max : g.x > g.max + 0.5 ? g.min : g.dir > 0 ? g.max : g.min;
        if (!walk(GUARD_HUNT, goal, lost) || Math.abs(g.x - goal) < 0.3) {
          g.dir *= -1;
          g.timer = 0.9;
        }
        break;
      }
    }
  }

  // ---------- cameras ----------
  function updateCamera(c, dt) {
    if (!c.alive) return;
    c.t += dt * c.speed;
    const ang = c.base + Math.sin(c.t) * c.span;
    c.ang = ang;
    const p = state.player;
    const px = p.x + p.w / 2, py = p.y + p.h * 0.45;
    const dx = px - c.x, dy = py - c.y;
    const d = Math.hypot(dx, dy);
    let sees = false;
    if (d < CAM_RANGE && losClear(c.x, c.y, px, py)) {
      const a = Math.atan2(dy, dx);
      let diff = Math.abs(((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < CAM_HALF && (p.light > 0.2 || d < 2.5)) sees = true;
    }
    if (sees) {
      c.lock += dt;
      state.seenBy = Math.max(state.seenBy, Math.min(1, c.lock / CAM_LOCK));
      if (c.lock >= CAM_LOCK) raiseAlarm('CAMERA');
    } else {
      c.lock = Math.max(0, c.lock - dt * 0.8);
    }
  }

  // ---------- the alarm ----------
  function raiseAlarm(why) {
    if (state.alarm) return;
    state.alarm = true;
    state.alarmEarly = !state.dataDone;   // the download always trips it; nothing else should
    state.alarmT = 0;
    state.shake = 0.35;
    say('ALARM - ' + why, 3);
    siren();
    // Everyone makes for where you were. The man who actually saw you stays on you.
    for (const g of state.guards) {
      if (g.down || g.state === 'alert') continue;
      g.state = 'search';
      g.timer = 0;
      g.susp = Math.max(g.susp, SEARCH_SUSP);
      g.target = state.player.x;
    }
    // the shift that was asleep: one to the far end, one to the door you came in by
    state.guards.push(mkReinforcement(87, 15));
    state.guards.push(mkReinforcement(46, 15));
  }

  function mkReinforcement(x, y) {
    return {
      id: 'reinf', x, y, min: x - 12, max: x + 4, dir: -1, card: false,
      state: 'search', susp: SEARCH_SUSP, timer: 0, down: false, shootCd: 0.8,
      target: state.player.x, home: x, homeY: y, lookDir: -1, lastSeen: -99
    };
  }

  /* ---------- the hack ----------
     Three keys, each a marker to stop in a green zone that narrows as the marker
     speeds up. As first tuned, the last key's zone passed under the marker in
     0.08s — a reflex test, not a stealth game — so that stays for hard, and
     normal gets a zone that barely narrows, with about 0.3s to hit the last one.
     A miss never loses the hack; it only makes a noise. */
  const HACK = {
    normal: { zone: 0.42, speed: 0.75, narrow: 0.82, quicken: 1.12 },
    hard: { zone: 0.34, speed: 0.95, narrow: 0.62, quicken: 1.35 },
  };

  function startHack() {
    const k = HACK[state.difficulty];
    state.mode = 'hack';
    state.hack = { round: 0, pos: 0, dir: 1, zone: k.zone, zoneAt: 0.4, speed: k.speed, flash: 0, missed: 0 };
    say('');
    beep(520, 0.05, 0.06);
  }

  function updateHack(dt) {
    const h = state.hack;
    h.pos += h.dir * h.speed * dt;
    if (h.pos > 1) { h.pos = 1; h.dir = -1; }
    if (h.pos < 0) { h.pos = 0; h.dir = 1; }
    if (h.flash > 0) h.flash -= dt;
    if (h.missed > 0) h.missed -= dt;

    if (pressed.action || pressed.fire) {
      const lo = h.zoneAt, hi = h.zoneAt + h.zone;
      if (h.pos >= lo && h.pos <= hi) {
        h.round++;
        beep(700 + h.round * 140, 0.07, 0.07);
        if (h.round >= 3) {
          state.dataDone = true;
          state.mode = 'play';
          state.hack = null;
          // The alarm first, then the objective, so the last word on screen is
          // where to go. The other way round, "GET OUT" was overwritten the same
          // instant by the alarm, and with the upstairs guard already dealt with
          // nothing happened next — it looked as if the game had simply stopped.
          raiseAlarm('DOWNLOAD TRACED');
          advance();
          state.banner = { lines: ['DATA SECURED', 'NOW GET BACK', 'TO THE FENCE'], t: 0 };
          takeCheckpoint();
          return;
        }
        const k = HACK[state.difficulty];
        h.zone *= k.narrow;
        h.speed *= k.quicken;
        h.zoneAt = 0.1 + Math.random() * (0.9 - h.zone);
        h.flash = 0.2;
      } else {
        beep(110, 0.12, 0.07);
        h.flash = 0.3;
        h.missed = 1.4;                            // long enough to read on the terminal screen
        makeNoise(state.player.x, state.player.y + state.player.h, 5.5);
      }
    }
    if (pressed.pause) { state.mode = 'play'; state.hack = null; }
  }

  // ---------- bullets ----------
  function updateBullets(dt) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.life -= dt;
      const hitWall = SOLID(tileAt(Math.floor(b.x), Math.floor(b.y)));
      const hitMe = b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h;
      if (hitMe) {
        p.hp--;
        p.hurt = 0.5;
        state.shake = 0.3;
        beep(90, 0.15, 0.09, 'square');
        state.bullets.splice(i, 1);
        if (p.hp <= 0) endGame(false, 'YOU WERE SHOT');
        continue;
      }
      if (hitWall || b.life <= 0) state.bullets.splice(i, 1);
    }
  }

  // ---------- win / lose ----------
  function endGame(won, why) {
    state.mode = won ? 'win' : 'dead';
    state.ending = why;
    if (won) {
      const save = load();
      const rec = save[state.difficulty] || (save[state.difficulty] = {});
      if (!rec.best || state.clock < rec.best) rec.best = state.clock;
      rec.done = true;
      if (!state.alarmEarly) rec.ghost = true;    // nobody ever knew you were there
      store(save);
    }
  }

  /* ---------- the checkpoint ----------
     Taken the moment the download lands: the alarm going, the reinforcements in,
     everybody where they were. Dying on the way out used to mean the whole
     infiltration again, for a run that had already done the hard part. The
     snapshot is the state as JSON, with the few live object references in it
     (a body being dragged, what the sight is on) let go first, since they would
     come back as copies of the thing rather than the thing. */
  function takeCheckpoint() {
    const p = state.player;
    const held = { dragging: p.dragging, aim: state.aim, sight: state.sight.obj };
    p.dragging = null; state.aim = null; state.sight.obj = null;
    state.checkpoint = null;
    const snap = JSON.stringify(state);
    p.dragging = held.dragging; state.aim = held.aim; state.sight.obj = held.sight;
    state.checkpoint = snap;
  }

  function restoreCheckpoint() {
    const snap = state.checkpoint;
    const retries = (state.retries || 0) + 1;
    state = JSON.parse(snap);
    state.checkpoint = snap;
    state.retries = retries;
    state.mode = 'play';
    state.banner = { lines: ['CHECKPOINT', 'GET BACK TO', 'THE FENCE'], t: 0 };
    for (const k in keys) keyUp(k);
    const c = camTarget();
    state.camX = c.x; state.camY = c.y;
  }

  function setDifficulty(d) {
    if (!ROUNDS[d]) return;
    difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch (e) { /* ignore */ }
    // the round is not under way yet, so the pistol can simply be reloaded
    if (state && (state.mode === 'title' || state.mode === 'brief')) {
      state.difficulty = d;
      state.player.ammo = ROUNDS[d];
    }
  }

  // ---------- the loop ----------
  function step(dt) {
    const s = state;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;

    if (s.mode === 'title') {
      // 4/6 (or 2/8) flips between the two, the way a phone menu did
      if (pressed.left || pressed.right || pressed.up || pressed.down) {
        const i = DIFFICULTIES.indexOf(difficulty);
        setDifficulty(DIFFICULTIES[(i + 1) % DIFFICULTIES.length]);
        beep(440, 0.04, 0.05);
      }
      if (pressed.action) { s.mode = 'brief'; beep(600, 0.06, 0.06); }
      return;
    }
    if (s.mode === 'brief') {
      if (pressed.action) { s.mode = 'play'; say(PHASES.infiltrate, 3.2); }
      return;
    }
    if (s.mode === 'dead' && s.checkpoint) {
      // Z from the terminal, P from the very start
      if (pressed.action) { restoreCheckpoint(); beep(600, 0.06, 0.06); }
      else if (pressed.pause) { newGame(); state.mode = 'brief'; }
      return;
    }
    if (s.mode === 'dead' || s.mode === 'win') {
      if (pressed.action) { newGame(); state.mode = 'brief'; }
      return;
    }
    if (s.mode === 'pause') {
      if (pressed.pause || pressed.action) s.mode = 'play';
      return;
    }
    if (s.mode === 'hack') { updateHack(dt); return; }

    if (pressed.pause) { s.mode = 'pause'; return; }

    s.clock += dt;
    if (s.alarm) s.alarmT += dt;
    s.seenBy = 0;

    updatePlayer(dt);
    for (const g of s.guards) updateGuard(g, dt);
    for (const c of s.cameras) updateCamera(c, dt);
    updateBullets(dt);

    for (let i = s.steps.length - 1; i >= 0; i--) {
      s.steps[i].life -= dt;
      if (s.steps[i].life <= 0) s.steps.splice(i, 1);
    }

    if (s.msgT > 0) s.msgT -= dt;
    if (s.banner) s.banner.t += dt;

    // phase bookkeeping
    if (s.phase === 'infiltrate' && s.player.x > 27) advance();

    // home
    if (s.phase === 'escape' && s.player.x < EXTRACT_X && s.player.y + s.player.h > 14) {
      endGame(true, 'EXTRACTED');
    }

    // camera follow, eased so it isn't seasick
    const c = camTarget();
    s.camX += (c.x - s.camX) * Math.min(1, dt * 7);
    s.camY += (c.y - s.camY) * Math.min(1, dt * 5);
  }

  /* Where the camera wants to be: the spy in the middle of the clear view, a little
     low in it. It is not held to the map any more — the view has to stay on the spy
     or he would walk out of it into the fog at the ends of the compound — and
     past the edge of the map there is simply nothing to see. */
  function camTarget() {
    const p = state.player;
    return {
      x: (p.x + p.w / 2) * T - CW / 2,
      y: (p.y + p.h / 2 - LOOK_UP) * T - (CH - HUD_H) / 2,
    };
  }

  // ---------- rendering ----------
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // One pixel per tile, blown up: gives soft light pools that still respect walls.
  // Sized to the scene box, not the canvas — past that it is all fog anyway.
  const lm = document.createElement('canvas');
  const LM_W = Math.ceil(SCENE_W / T) + 3, LM_H = Math.ceil(SCENE_H / T) + 3;
  lm.width = LM_W; lm.height = LM_H;
  const lmx = lm.getContext('2d');
  const lmImg = lmx.createImageData(LM_W, LM_H);

  function px(wx) { return Math.round(wx * T - state.camX); }
  function py(wy) { return Math.round(wy * T - state.camY) + HUD_H; }

  // the top-left tile of the scene box, in world tiles
  function sceneOrigin() {
    const sx = viewCX() - SCENE_W / 2, sy = viewCY() - SCENE_H / 2;
    return {
      tx: Math.floor((sx + state.camX) / T) - 1,
      ty: Math.floor((sy - HUD_H + state.camY) / T) - 1,
    };
  }

  function drawTiles() {
    const o = sceneOrigin();
    const x0 = o.tx, x1 = x0 + LM_W + 1;
    const y0 = o.ty, y1 = y0 + LM_H + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        // off the map is nothing at all, rather than the wall collision treats it as
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        const t = tileAt(tx, ty);
        if (t === EMPTY) continue;
        const X = px(tx), Y = py(ty);
        switch (t) {
          case GROUND:
            ctx.fillStyle = ty === 15 ? '#24291f' : '#171b14';
            ctx.fillRect(X, Y, T, T);
            if (ty === 15) {
              ctx.fillStyle = '#323a28';
              ctx.fillRect(X, Y, T, 2);
              ctx.fillStyle = '#1d2218';
              for (let i = 0; i < 3; i++) ctx.fillRect(X + ((tx * 7 + i * 5) % 14), Y + 4 + ((tx + i) % 9), 2, 1);
            }
            break;
          case WALL:
            ctx.fillStyle = '#2b3138';
            ctx.fillRect(X, Y, T, T);
            ctx.fillStyle = '#39424c';
            ctx.fillRect(X, Y, T, 1);
            ctx.fillStyle = '#21262c';
            ctx.fillRect(X, Y + T - 1, T, 1);
            ctx.fillRect(X + T - 1, Y, 1, T);
            break;
          case CRATE:
            ctx.fillStyle = '#4a3b28';
            ctx.fillRect(X, Y, T, T);
            ctx.strokeStyle = '#654f34';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(X + 0.5, Y + 0.5); ctx.lineTo(X + T - 0.5, Y + T - 0.5);
            ctx.moveTo(X + T - 0.5, Y + 0.5); ctx.lineTo(X + 0.5, Y + T - 0.5);
            ctx.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
            ctx.stroke();
            break;
          case LADDER:
            ctx.fillStyle = '#5b6470';
            ctx.fillRect(X + 3, Y, 2, T);
            ctx.fillRect(X + T - 5, Y, 2, T);
            ctx.fillRect(X + 3, Y + 4, T - 6, 2);
            ctx.fillRect(X + 3, Y + 11, T - 6, 2);
            break;
          case VENT:
            ctx.fillStyle = '#1b2026';
            ctx.fillRect(X, Y, T, T);
            ctx.fillStyle = '#3d4650';
            for (let i = 2; i < T - 1; i += 3) ctx.fillRect(X + 1, Y + i, T - 2, 1);
            break;
          case DOOR:
            if (state.doorOpen) {
              ctx.fillStyle = '#0d1014';
              ctx.fillRect(X, Y, T, T);
              ctx.fillStyle = '#3a4450';
              ctx.fillRect(X, Y, 2, T);
            } else {
              ctx.fillStyle = '#4a4130';
              ctx.fillRect(X, Y, T, T);
              ctx.fillStyle = '#5d523d';
              ctx.fillRect(X + 2, Y + 1, T - 4, T - 2);
              ctx.fillStyle = state.hasCard ? '#7dfaa8' : '#d7263d';
              ctx.fillRect(X + T - 5, Y + 7, 2, 2);
            }
            break;
          case FENCE:
            ctx.strokeStyle = '#39424c';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < T; i += 4) {
              ctx.moveTo(X + i + 0.5, Y); ctx.lineTo(X + i + 4.5, Y + T);
              ctx.moveTo(X + i + 4.5, Y); ctx.lineTo(X + i + 0.5, Y + T);
            }
            ctx.stroke();
            break;
        }
      }
    }
  }

  function drawProps() {
    // lamps
    for (const l of state.lamps) {
      const X = px(l.x), Y = py(l.y);
      ctx.fillStyle = '#39424c';
      if (l.pole) {
        ctx.fillRect(X - 1, Y, 2, py(15) - Y);
        ctx.fillRect(X - 4, Y - 3, 8, 3);
      } else {
        ctx.fillRect(X - 3, Y - 6, 6, 3);
        ctx.fillRect(X - 1, Y - 8, 2, 3);
      }
      ctx.fillStyle = l.on ? '#ffe9a8' : '#2c3138';
      ctx.fillRect(X - 3, Y - 1, 6, 2);
    }

    // the gate out on the approach: chain link, drawn rather than built, so
    // nothing can snag on it
    const gx = px(19);
    if (gx > -40 && gx < CW + 40) {
      ctx.strokeStyle = '#242c35';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -20; i <= 20; i += 4) {
        ctx.moveTo(gx + i + 0.5, py(11)); ctx.lineTo(gx + i + 4.5, py(13));
        ctx.moveTo(gx + i + 4.5, py(11)); ctx.lineTo(gx + i + 0.5, py(13));
      }
      ctx.stroke();
      ctx.fillStyle = '#39424c';
      ctx.fillRect(gx - 21, py(11) - 2, 42, 2);
    }

    // the terminal
    {
      const X = px(TERMINAL.x), Y = py(TERMINAL.y);
      ctx.fillStyle = '#2f3843';
      ctx.fillRect(X - 5, Y - 12, 11, 12);
      ctx.fillStyle = state.dataDone ? '#7dfaa8' : '#2ea3e0';
      ctx.fillRect(X - 3, Y - 10, 7, 6);
      ctx.fillStyle = '#0c2233';
      ctx.fillRect(X - 3, Y - 10 + ((state.t * 6) % 6 | 0), 7, 1);
    }

    // lasers
    for (const L of state.lasers) {
      if (!L.on) continue;
      const X = px(L.x);
      ctx.strokeStyle = 'rgba(215,38,61,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X + 0.5, py(L.y0));
      ctx.lineTo(X + 0.5, py(L.y1));
      ctx.stroke();
      ctx.fillStyle = '#d7263d';
      ctx.fillRect(X - 1, py(L.y0) - 2, 3, 3);
    }

    // cameras
    for (const c of state.cameras) {
      const X = px(c.x), Y = py(c.y);
      ctx.fillStyle = c.alive ? '#4b5562' : '#2a2f36';
      ctx.fillRect(X - 4, Y - 3, 8, 5);
      if (c.alive) {
        const a = c.ang || c.base;
        ctx.fillStyle = c.lock > 0.1 ? '#d7263d' : '#7dfaa8';
        ctx.fillRect(X + Math.cos(a) * 5 - 1, Y + Math.sin(a) * 5 - 1, 2, 2);
      }
    }
  }

  function drawCones() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // The pool under a lit lamp. The darkness layer is computed from the same
    // radius, so what this adds is only the glow — the two always agree about
    // where it is safe to stand.
    for (const l of state.lamps) {
      if (!l.on) continue;
      const X = px(l.x), Y = py(l.y), r = l.r * T;
      if (X + r < 0 || X - r > CW) continue;
      const pool = ctx.createRadialGradient(X, Y, 1, X, Y, r);
      pool.addColorStop(0, 'rgba(255,232,168,0.34)');
      pool.addColorStop(0.45, 'rgba(255,222,150,0.13)');
      pool.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(X - r, Y - r, r * 2, r * 2);
    }
    for (const g of state.guards) {
      if (g.down) continue;
      const ex = px(g.x), ey = py(g.y - 1.3);
      const a0 = g.dir > 0 ? -CONE_HALF : Math.PI - CONE_HALF;
      const a1 = g.dir > 0 ? CONE_HALF : Math.PI + CONE_HALF;
      const grad = ctx.createRadialGradient(ex, ey, 2, ex, ey, CONE_RANGE * T);
      const hot = g.state === 'alert' ? '215,38,61' : g.susp > SUSPECT ? '240,180,41' : '255,236,170';
      grad.addColorStop(0, 'rgba(' + hot + ',0.30)');
      grad.addColorStop(1, 'rgba(' + hot + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.arc(ex, ey, CONE_RANGE * T, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    for (const c of state.cameras) {
      if (!c.alive) continue;
      const ex = px(c.x), ey = py(c.y);
      const a = c.ang || c.base;
      const grad = ctx.createRadialGradient(ex, ey, 2, ex, ey, CAM_RANGE * T);
      const hot = c.lock > 0.1 ? '215,38,61' : '125,250,168';
      grad.addColorStop(0, 'rgba(' + hot + ',0.22)');
      grad.addColorStop(1, 'rgba(' + hot + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.arc(ex, ey, CAM_RANGE * T, a - CAM_HALF, a + CAM_HALF);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* The figures. Everything is a whole-pixel rectangle placed off the feet, and
     the shapes have to carry a lot on a screen this size: which way a man is
     facing has to be readable at a glance, because the whole game is walking up
     behind one. Hence the helmet brim, the torch and the pack, all of which sit
     on one side only. */
  const rect9 = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

  function drawGuard(g) {
    const X = px(g.x), Y = py(g.y);
    const f = g.dir > 0 ? 1 : -1;        // +1 facing right
    const hot = g.state === 'alert';

    if (g.down) {
      rect9(X - 7, Y - 5, 14, 5, '#333b47');
      rect9(X - 7, Y - 5, 14, 1, '#454f5d');
      rect9(X + (f > 0 ? 5 : -9), Y - 8, 4, 4, '#2b323c');   // helmet, come off
      rect9(X + (f > 0 ? -9 : 6), Y - 3, 3, 3, '#242a33');   // boots
      return;
    }

    const t = Y - 22;
    const uniform = hot ? '#5b3a42' : '#39414e';
    const vest = hot ? '#7a4a54' : '#4c5666';
    const sw = g.state === 'look' ? 0 : Math.sin(state.t * 8 + g.x) * 2;

    rect9(X - 3 + sw, t + 16, 3, 6, '#272d36');            // legs
    rect9(X - sw, t + 16, 3, 6, '#2f3540');
    rect9(X - 3 + sw, t + 20, 3, 2, '#1a1f26');            // boots
    rect9(X - sw, t + 20, 3, 2, '#1a1f26');

    rect9(X - 4, t + 8, 8, 8, uniform);                    // torso
    rect9(X - 3, t + 9, 6, 4, vest);                       // webbing
    rect9(X - 4, t + 15, 8, 1, '#20252d');                 // belt
    rect9(X - 5, t + 6, 10, 2, uniform);                   // shoulders

    rect9(X - 3, t + 4, 6, 3, '#6d5c4f');                  // face
    rect9(X - 4, t, 8, 4, '#2b323c');                      // helmet
    rect9(X + (f > 0 ? 2 : -5), t + 3, 3, 1, '#2b323c');   // brim, on the front
    rect9(X - 4, t, 8, 1, '#3c4552');

    rect9(X + (f > 0 ? 3 : -7), t + 9, 4, 2, uniform);     // the arm holding it
    rect9(X + (f > 0 ? 6 : -9), t + 8, 3, 3, '#ffeaa0');   // the torch
  }

  function drawPlayer() {
    const p = state.player;
    const X = px(p.x + p.w / 2), Y = py(p.y + p.h);
    const f = p.dir > 0 ? 1 : -1;
    const flick = p.hurt > 0 && (state.t * 20 | 0) % 2 === 0;
    const suit = flick ? '#8d3a45' : '#1b2b23';
    const lit = flick ? '#a04651' : '#26392f';
    const dark = '#0f1813';
    const moving = (keys.left || keys.right) && p.onGround;

    if (p.crouch) {
      const t = Y - 15;
      const sw = moving ? Math.sin(p.anim * 9) * 1.2 : 0;
      rect9(X - 4 + sw, t + 11, 4, 4, dark);               // folded legs
      rect9(X + sw, t + 11, 4, 4, suit);
      rect9(X - 4, t + 5, 8, 7, suit);                     // torso, hunched
      rect9(X - 3, t + 6, 6, 4, lit);
      rect9(X + (f > 0 ? -6 : 4), t + 4, 2, 5, '#16231c');  // the pack, behind
      rect9(X + (f > 0 ? 3 : -6), t + 6, 4, 2, suit);       // arm
      rect9(X - 3, t, 7, 5, suit);                          // head
      rect9(X - 3, t + 2, 7, 2, dark);                      // goggle strap
      return;
    }

    const t = Y - 27;
    const sw = moving ? Math.sin(p.anim * 9) * 2.5 : 0;
    rect9(X - 3 + sw, t + 20, 3, 7, dark);                 // legs
    rect9(X - sw, t + 20, 3, 7, suit);
    rect9(X - 3 + sw, t + 25, 3, 2, '#080d0a');            // boots
    rect9(X - sw, t + 25, 3, 2, '#080d0a');

    rect9(X - 3, t + 17, 7, 3, suit);                      // hips
    rect9(X - 4, t + 16, 8, 1, dark);                      // belt
    rect9(X - 4, t + 8, 8, 8, suit);                       // torso
    rect9(X - 3, t + 9, 6, 5, lit);
    rect9(X - 4, t + 6, 9, 2, suit);                       // shoulders
    rect9(X + (f > 0 ? -6 : 4), t + 7, 2, 7, '#16231c');   // the pack, behind

    rect9(X - 3, t, 7, 6, suit);                           // head
    rect9(X - 3, t + 2, 7, 2, dark);                       // goggle strap

    rect9(X + (f > 0 ? 3 : -7), t + 10, 4, 2, suit);       // arm, out in front
    rect9(X + (f > 0 ? 6 : -8), t + 10, 2, 2, '#0c1410');  // the pistol
    if (p.muzzle > 0) {
      rect9(X + (f > 0 ? 8 : -11), t + 9, 3, 3, '#fff3c4');
    }
  }

  /* The goggles go on after the darkness does. However black the corner he
     is standing in, you can always find the spy by the goggles — which is the only
     reason a game this dark is playable at all. */
  /* The laser sight: a red line from the pistol to whatever a shot would hit,
     only while there is something to hit. Drawn a pixel at a time so it stays
     a crisp one-pixel line at any angle. A guard who would see the shot coming —
     facing you, or already suspicious — gets an amber dot instead of a red one:
     you can still fire, but the sight is telling you it will not be quiet. */
  function drawLaser() {
    const s = state.sight;
    if (!state.aim || s.t >= SIGHT_LIFE) return;
    const fade = s.t < SIGHT_SWEEP + SIGHT_HOLD ? 1 : 1 - (s.t - SIGHT_SWEEP - SIGHT_HOLD) / SIGHT_FADE;
    const p = state.player;
    const f = p.dir > 0 ? 1 : -1;
    const X = px(p.x + p.w / 2), Y = py(p.y + p.h);
    const x0 = X + (f > 0 ? 8 : -9);
    const y0 = p.crouch ? Y - 15 + 7 : Y - 27 + 11;
    const x1 = px(s.x), y1 = py(s.y);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (n < 2) return;
    const rgb = s.loud ? '240,180,41' : '255,40,50';
    // every other pixel, and faint: a beam you notice rather than one you look at
    ctx.fillStyle = 'rgba(255,40,50,' + (0.3 * fade).toFixed(3) + ')';
    for (let i = 0; i < n; i += 2) {
      ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
    }
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.25 * fade).toFixed(3) + ')';
    ctx.fillRect(x1 - 1, y1 - 1, 3, 3);
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.95 * fade).toFixed(3) + ')';
    ctx.fillRect(x1, y1, 1, 1);
  }

  function drawGoggles() {
    const p = state.player;
    const X = px(p.x + p.w / 2), Y = py(p.y + p.h);
    const t = Y - (p.crouch ? 15 : 27);
    // the goggle lenses, on whichever side he is facing
    const gx = p.dir > 0 ? X : X - 3;
    ctx.fillStyle = p.nv ? '#d6ffe6' : '#7dfaa8';
    ctx.fillRect(gx, t + 2, 1, 1);
    ctx.fillRect(gx + 2, t + 2, 1, 1);
    ctx.fillRect(gx + 1, t + 4, 1, 1);
  }

  function drawLight() {
    const p = state.player;
    const o = sceneOrigin();
    const ox = o.tx, oy = o.ty;
    const d = lmImg.data;
    const nvOn = p.nv;
    const maxDark = nvOn ? 110 : 244;
    for (let j = 0; j < LM_H; j++) {
      for (let i = 0; i < LM_W; i++) {
        const l = lightAt(ox + i + 0.5, oy + j + 0.5);
        const a = Math.max(0, Math.min(1, 1 - l * 1.25));
        const k = (j * LM_W + i) * 4;
        d[k] = nvOn ? 4 : 3;
        d[k + 1] = nvOn ? 16 : 6;
        d[k + 2] = nvOn ? 8 : 9;
        d[k + 3] = a * maxDark;
      }
    }
    lmx.putImageData(lmImg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const X = ox * T - state.camX, Y = oy * T - state.camY + HUD_H;
    ctx.drawImage(lm, X, Y, LM_W * T, LM_H * T);
    ctx.imageSmoothingEnabled = false;
    ctx.restore();

    if (nvOn) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(30,150,70,0.16)';
      ctx.fillRect(0, HUD_H, CW, CH - HUD_H);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = HUD_H; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
    }
    if (state.alarm) {
      const pulse = 0.10 + 0.08 * Math.sin(state.alarmT * 7);
      ctx.fillStyle = 'rgba(215,38,61,' + pulse.toFixed(3) + ')';
      ctx.fillRect(0, HUD_H, CW, CH - HUD_H);
    }
  }

  // ---------- fog and glow ----------
  const fogCv = document.createElement('canvas');
  const maskNear = document.createElement('canvas');
  const maskFar = document.createElement('canvas');
  const glowNear = document.createElement('canvas');
  const glowFar = document.createElement('canvas');
  const glowOut = document.createElement('canvas');

  // Paint canvas c with black whose opacity follows r, the distance out from the
  // centre of the view in FOG_A/FOG_B units. Past the last stop it holds.
  function ellipseRamp(c, stops) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const rMax = stops[stops.length - 1][0];
    g.translate(viewCX(), viewCY());
    g.scale(1, FOG_B / FOG_A);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, FOG_A * rMax);
    for (const [r, a] of stops) grad.addColorStop(r / rMax, 'rgba(0,0,0,' + a + ')');
    g.fillStyle = grad;
    const big = Math.max(CW, CH) * 4;
    g.fillRect(-big, -big, big * 2, big * 2);
  }

  function resizeFog() {
    for (const c of [fogCv, maskNear, maskFar, glowOut]) { c.width = CW; c.height = CH; }
    glowNear.width = Math.ceil(CW / GLOW_NEAR_RES); glowNear.height = Math.ceil(CH / GLOW_NEAR_RES);
    glowFar.width = Math.ceil(CW / GLOW_FAR_RES); glowFar.height = Math.ceil(CH / GLOW_FAR_RES);
    ellipseRamp(fogCv, [[0, 0], [FOG_CLEAR, 0], [FOG_BLACK, 1]]);
    ellipseRamp(maskNear, [[0, 0], [FOG_CLEAR, 0], [GLOW_FULL, 1], [GLOW_HANDOFF, 1], [GLOW_FAR, 0]]);
    ellipseRamp(maskFar, [[0, 0], [GLOW_HANDOFF, 0], [GLOW_FAR, 1]]);
  }

  /* Everything that gives off light, drawn into a small canvas at 1/k scale.
     Blown back up with smoothing, that is the blur: a lamp in the near layer is a
     soft pool, in the far one a smudge. Nothing here is solid — a guard is only
     his torch, a camera only its cone and its light. */
  function paintEmissive(c, k) {
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(1 / k, 0, 0, 1 / k, 0, 0);
    g.globalCompositeOperation = 'lighter';
    const onCanvas = (X, r) => X + r > 0 && X - r < CW;

    for (const l of state.lamps) {
      if (!l.on) continue;
      const X = px(l.x), Y = py(l.y), r = l.r * T;
      if (!onCanvas(X, r)) continue;
      const pool = g.createRadialGradient(X, Y, 1, X, Y, r);
      pool.addColorStop(0, 'rgba(255,228,165,0.55)');
      pool.addColorStop(0.35, 'rgba(255,215,140,0.18)');
      pool.addColorStop(1, 'rgba(255,210,140,0)');
      g.fillStyle = pool;
      g.fillRect(X - r, Y - r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,244,210,0.9)';
      g.fillRect(X - 3, Y - 2, 6, 3);
    }

    const cone = (ex, ey, a0, a1, reach, rgb, alpha) => {
      const grad = g.createRadialGradient(ex, ey, 2, ex, ey, reach);
      grad.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
      grad.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(ex, ey);
      g.arc(ex, ey, reach, a0, a1);
      g.closePath();
      g.fill();
    };
    for (const gd of state.guards) {
      if (gd.down) continue;
      const ex = px(gd.x), ey = py(gd.y - 1.3);
      if (!onCanvas(ex, CONE_RANGE * T)) continue;
      const rgb = gd.state === 'alert' ? '215,38,61' : gd.susp > SUSPECT ? '240,180,41' : '255,236,170';
      const a0 = gd.dir > 0 ? -CONE_HALF : Math.PI - CONE_HALF;
      cone(ex, ey, a0, a0 + CONE_HALF * 2, CONE_RANGE * T, rgb, 0.4);
      g.fillStyle = 'rgba(' + rgb + ',0.9)';
      g.fillRect(ex + gd.dir * 5 - 1, ey - 1, 3, 3);
    }
    for (const cm of state.cameras) {
      if (!cm.alive) continue;
      const ex = px(cm.x), ey = py(cm.y), a = cm.ang || cm.base;
      if (!onCanvas(ex, CAM_RANGE * T)) continue;
      const rgb = cm.lock > 0.1 ? '215,38,61' : '125,250,168';
      cone(ex, ey, a - CAM_HALF, a + CAM_HALF, CAM_RANGE * T, rgb, 0.3);
      g.fillStyle = 'rgba(' + rgb + ',0.9)';
      g.fillRect(ex - 1, ey - 1, 3, 3);
    }

    g.strokeStyle = 'rgba(255,40,50,0.9)';
    g.lineWidth = 2;
    for (const L of state.lasers) {
      if (!L.on) continue;
      const X = px(L.x);
      g.beginPath();
      g.moveTo(X, py(L.y0));
      g.lineTo(X, py(L.y1));
      g.stroke();
    }

    const spot = (X, Y, r, rgb, alpha) => {
      if (!onCanvas(X, r)) return;
      const grad = g.createRadialGradient(X, Y, 0, X, Y, r);
      grad.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
      grad.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grad;
      g.fillRect(X - r, Y - r, r * 2, r * 2);
    };
    spot(px(TERMINAL.x), py(TERMINAL.y) - 8, 14, state.dataDone ? '125,250,168' : '46,163,224', 0.6);
    for (const b of state.bullets) spot(px(b.x), py(b.y), 6, '255,217,138', 0.9);
    // once the data is out, the fence you came in by is a beacon in the dark
    if (state.phase === 'escape') {
      const pulse = Math.min(1, (0.45 + 0.25 * Math.sin(state.t * 4)) * BEACON_BOOST);
      spot(px(EXTRACT_X), py(14), 34, '125,250,168', pulse);
    }
  }

  function drawFogAndGlow() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fogCv, 0, 0);
    paintEmissive(glowNear, GLOW_NEAR_RES);
    paintEmissive(glowFar, GLOW_FAR_RES);
    const o = glowOut.getContext('2d');
    for (const [layer, mask, k, alpha] of [
      [glowNear, maskNear, GLOW_NEAR_RES, GLOW_NEAR_ALPHA],
      [glowFar, maskFar, GLOW_FAR_RES, GLOW_FAR_ALPHA],
    ]) {
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, CW, CH);
      o.imageSmoothingEnabled = true;
      o.globalAlpha = alpha;
      o.drawImage(layer, 0, 0, layer.width * k, layer.height * k);
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'destination-in';
      o.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowOut, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    // under an alarm the dark itself goes faintly red
    if (state.alarm) {
      const pulse = 0.08 + 0.06 * Math.sin(state.alarmT * 7);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,10,22,' + pulse.toFixed(3) + ')';
      ctx.fillRect(0, HUD_H, CW, CH - HUD_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawMarkers() {
    for (const g of state.guards) {
      if (g.down || g.susp < 0.12) continue;
      const X = px(g.x), Y = py(g.y - 2.1);
      if (g.state === 'alert') {
        ctx.fillStyle = '#d7263d';
        ctx.fillRect(X - 1, Y - 7, 3, 5);
        ctx.fillRect(X - 1, Y - 1, 3, 2);
      } else {
        ctx.fillStyle = g.susp > SUSPECT ? '#f0b429' : '#8a95a3';
        ctx.fillRect(X - 2, Y - 7, 4, 2);
        ctx.fillRect(X + 1, Y - 5, 2, 2);
        ctx.fillRect(X - 1, Y - 3, 3, 2);
        ctx.fillRect(X - 1, Y - 1, 2, 2);
      }
    }
    /* Footstep marks: little ( ) either side of the feet, the way a cartoon draws
       a loud shoe. The first version drew a ring out to the whole hearing radius
       — 7.5 tiles for a run, most of the screen — which said "loud" by shouting.
       These say it in a few pixels: one pair for a walk, three for a run, none on
       your belly, and amber when a guard actually heard it. */
    for (const st of state.steps) {
      const k = 1 - st.life / STEP_LIFE;                 // 0 at the step, 1 when gone
      const arcs = st.run ? 3 : 1;
      const X = px(st.x), Y = py(st.y);
      const a = (1 - k) * (st.heard ? 0.95 : 0.55);
      ctx.fillStyle = (st.heard ? 'rgba(240,180,41,' : 'rgba(190,200,212,') + a.toFixed(3) + ')';
      for (let i = 0; i < arcs; i++) {
        if (k < i * 0.18) continue;                      // the outer ones arrive a beat later
        const o = 5 + i * 3 + Math.round(k * 2);
        const h = 2 + i * 2;
        for (const side of [1, -1]) {
          const x = X + side * o;
          ctx.fillRect(x, Y - 3 - h, 1, 1);              // the curl at the top
          ctx.fillRect(x + side, Y - 2 - h, 1, h);       // the bulge
          ctx.fillRect(x, Y - 2, 1, 1);                  // the curl at the bottom
        }
      }
    }

    // bullets
    ctx.fillStyle = '#ffd98a';
    for (const b of state.bullets) ctx.fillRect(px(b.x), py(b.y), 3, 1);

    // the contextual prompt, on a plate so it reads over any background
    if (state.prompt) {
      const p = state.player;
      const w = textWidth(state.prompt, 1) + 4;
      const bx = Math.round(px(p.x + p.w / 2) - w / 2);
      const by = py(p.y) - 13;
      ctx.fillStyle = 'rgba(8,11,15,0.85)';
      ctx.fillRect(bx, by, w, 11);
      ctx.fillStyle = '#2c6b46';
      ctx.fillRect(bx, by + 10, w, 1);
      text(state.prompt, bx + 2, by + 2, state.prompt.startsWith('Z') ? '#7dfaa8' : '#f0b429');
    }

    // where to go, when the way out is what matters: a post on the spot itself
    if (state.phase === 'escape') {
      const X = px(EXTRACT_X);
      ctx.fillStyle = '#7dfaa8';
      ctx.fillRect(X - 6, py(14.4), 12, 1);
      ctx.fillRect(X - 1, py(13.4), 2, 6);
    }
  }

  // Drawn over the fog: the things that must be read wherever they are.
  const BANNER_LIFE = 4.5;
  function drawOverFog() {
    const blink = (state.t * 2.5 | 0) % 2 === 0;
    // with the way out still off in the dark, a big arrow at the edge of the view
    // pointing at it, and how far it is
    if (state.phase === 'escape' && fogR(px(EXTRACT_X), py(14)) > FOG_CLEAR) {
      const x = Math.round(viewCX() - FOG_A * FOG_CLEAR) + 2, y = viewCY() + 20;
      const dist = Math.max(0, Math.round(state.player.x - EXTRACT_X));
      text('<', x, y - 7, blink ? '#7dfaa8' : '#35704b', 2);
      text('FENCE ' + dist + 'M', x, y + 10, '#7dfaa8');
    }
    // the banner: a moment of the whole view saying what just changed
    const b = state.banner;
    if (b && b.t < BANNER_LIFE) {
      const a = b.t > BANNER_LIFE - 0.6 ? (BANNER_LIFE - b.t) / 0.6 : 1;
      const lineH = 18, h = b.lines.length * lineH + 10;
      const top = viewCY() - 40 - Math.round(h / 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,11,15,0.9)';
      ctx.fillRect(viewCX() - VIEW_W / 2, top, VIEW_W, h);
      ctx.fillStyle = '#7dfaa8';
      ctx.fillRect(viewCX() - VIEW_W / 2, top, VIEW_W, 1);
      ctx.fillRect(viewCX() - VIEW_W / 2, top + h - 1, VIEW_W, 1);
      b.lines.forEach((l, i) => {
        text(l, Math.round(viewCX() - textWidth(l, 2) / 2), top + 6 + i * lineH, i === 0 ? '#7dfaa8' : '#d7dee6', 2);
      });
      ctx.globalAlpha = 1;
    }
    // The ticker, along the foot of the clear view. Once the data is out it never
    // goes quiet: with nothing else to say, it says where to go.
    const msg = state.msgT > 0 && state.msg ? state.msg
      : state.phase === 'escape' && state.mode === 'play' ? PHASES.escape : '';
    if (msg) {
      const x = viewCX() - VIEW_W / 2, y = viewCY() + WORLD_H / 2 - 12;
      ctx.fillStyle = 'rgba(8,11,15,0.88)';
      ctx.fillRect(x, y, VIEW_W, 12);
      text(msg, x + 3, y + 2, '#7dfaa8');
    }
  }

  // ---------- HUD ----------
  /* One path for the whole string and a single fill: a line of this font is a
     couple of hundred little rectangles, and asking the canvas to fill them one
     at a time is the only part of the frame that ever showed up as slow. */
  function text(s, x, y, col, scale) {
    const k = scale || 1;
    const step = (GLYPH_W + GLYPH_GAP) * k;
    ctx.fillStyle = col || '#d7dee6';
    ctx.beginPath();
    const str = String(s).toUpperCase();
    for (let i = 0; i < str.length; i++) {
      const pix = GLYPH_PIX[str[i]];
      if (!pix) continue;
      const ox = x + i * step;
      for (let p = 0; p < pix.length; p += 2) {
        ctx.rect(ox + pix[p] * k, y + pix[p + 1] * k, k, k);
      }
    }
    ctx.fill();
  }

  // centred, for the panels
  function textMid(s, y, col, scale) {
    text(s, Math.round((VIEW_W - textWidth(String(s), scale)) / 2), y, col, scale);
  }

  // Laid out 176 wide as it always was, and drawn centred over the view; the bar
  // behind it runs the full width of the canvas.
  function drawHud() {
    const p = state.player;
    const ox = viewCX() - VIEW_W / 2;
    ctx.fillStyle = state.alarm ? '#2a0d12' : '#0e1218';
    ctx.fillRect(-ox, 0, CW, HUD_H);
    ctx.fillStyle = state.alarm ? '#d7263d' : '#232b34';
    ctx.fillRect(-ox, HUD_H - 1, CW, 1);

    // light meter — eight segments, the oldest UI in the business
    text('LIGHT', 2, 2, '#7f8a97');
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const on = p.light > (i + 0.5) / segs;
      ctx.fillStyle = on ? (i > 5 ? '#d7263d' : i > 3 ? '#f0b429' : '#7dfaa8') : '#232b34';
      ctx.fillRect(36 + i * 6, 2, 5, 7);
    }

    // seen-ness
    text('SEEN', 90, 2, '#7f8a97');
    ctx.fillStyle = '#232b34';
    ctx.fillRect(117, 2, 27, 7);
    if (state.seenBy > 0) {
      ctx.fillStyle = state.seenBy > 0.9 ? '#d7263d' : state.seenBy > SUSPECT ? '#f0b429' : '#8a95a3';
      ctx.fillRect(117, 2, Math.max(1, 27 * state.seenBy), 7);
    }

    // rounds left
    ctx.fillStyle = '#ffd98a';
    // Five pips fit; fifteen do not. Hard shows each round, since each one is a
    // decision; normal shows a single round and the count.
    if (p.ammo <= 5) {
      for (let i = 0; i < p.ammo; i++) ctx.fillRect(149 + i * 5, 2, 3, 7);
    } else {
      ctx.fillRect(152, 2, 3, 7);
      text(String(p.ammo), 158, 2, '#ffd98a');
    }

    text('HP', 2, 12, '#7f8a97');
    for (let i = 0; i < START_HP; i++) {
      ctx.fillStyle = i < p.hp ? '#d7263d' : '#2a313a';
      ctx.fillRect(16 + i * 7, 13, 5, 5);
    }

    text('NV', 32, 12, p.nv ? '#7dfaa8' : '#7f8a97');
    ctx.fillStyle = '#232b34';
    ctx.fillRect(46, 13, 24, 5);
    ctx.fillStyle = p.batt > 25 ? '#7dfaa8' : '#d7263d';
    ctx.fillRect(46, 13, 24 * p.batt / 100, 5);

    const mm = Math.floor(state.clock / 60), ss = Math.floor(state.clock % 60);
    text((mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, 75, 12, '#7f8a97');

    if (state.hasCard) { ctx.fillStyle = '#f0b429'; ctx.fillRect(110, 13, 7, 5); }
    if (state.dataDone) { ctx.fillStyle = '#2ea3e0'; ctx.fillRect(120, 13, 7, 5); }

    // once the data is out the job is the fence, alarm or no alarm, so say that
    const tag = state.phase === 'escape' ? PHASE_TAG.escape : state.alarm ? 'ALARM' : PHASE_TAG[state.phase];
    text(tag, VIEW_W - 2 - textWidth(tag, 1), 12, state.alarm ? '#d7263d' : '#7f8a97');
  }

  // ---------- full-screen panels ----------
  // 28 characters to a line at this size, which is what the copy below is cut to
  function panel(title, lines, footer) {
    ctx.fillStyle = '#080b0f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(title, 6, 12, '#7dfaa8', 2);
    ctx.fillStyle = '#2c6b46';
    ctx.fillRect(6, 30, VIEW_W - 12, 1);
    let y = 38;
    for (const l of lines) {
      text(l, 6, y, l.startsWith('>') ? '#f0b429' : l === l.toUpperCase() && l.trim() ? '#7dfaa8' : '#a9b3bf');
      y += 10;
    }
    if (footer) {
      const blink = (state.t * 2 | 0) % 2 === 0;
      textMid(footer, VIEW_H - 18, blink ? '#7dfaa8' : '#2c6b46');
    }
  }

  function drawTitle() {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // A man standing in a lit doorway, backlit: the doorway is the only light in
    // the picture and he is the hole in it. Same proportions as the sprite, at
    // double size, so the title screen and the game are plainly the same man.
    ctx.fillStyle = '#101820';
    ctx.fillRect(-(viewCX() - VIEW_W / 2), 152, CW, CH);   // the floor, the full width of the canvas
    ctx.fillStyle = '#1b2a22';
    ctx.fillRect(58, 92, 60, 82);
    ctx.fillStyle = '#2f5239';
    ctx.fillRect(63, 97, 50, 77);
    const glow = ctx.createLinearGradient(0, 97, 0, 174);
    glow.addColorStop(0, 'rgba(160,255,200,0.30)');
    glow.addColorStop(1, 'rgba(160,255,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(63, 97, 50, 77);

    const S = 2, MX = 88, MY = 174;                 // his feet, on the doorstep
    const sil = '#04070a';
    const blk = (x, y, w, h) => ctx.fillRect(MX + x * S, MY - 27 * S + y * S, w * S, h * S);
    ctx.fillStyle = sil;
    blk(-4, 20, 3, 7); blk(1, 20, 3, 7);            // legs, stood square on
    blk(-3, 17, 7, 3);                              // hips
    blk(-4, 8, 8, 8);                               // torso
    blk(-4, 6, 9, 2);                               // shoulders
    blk(-6, 7, 2, 7);                               // the pack
    blk(-3, 0, 7, 6);                               // head
    blk(3, 10, 4, 2);                               // arm
    blk(6, 10, 2, 2);                               // pistol
    ctx.fillStyle = '#7dfaa8';
    blk(0, 2, 0.5, 0.5); blk(2, 2, 0.5, 0.5); blk(1, 4, 0.5, 0.5);

    textMid('BLACKOUT', 30, '#7dfaa8', 3);
    textMid('KEEP TO THE DARK', 58, '#35704b');

    // the difficulty, on one line: the chosen one bright with a marker, the other dim
    const opts = DIFFICULTIES.map((d) => (d === difficulty ? '>' : ' ') + d.toUpperCase());
    const line = opts.join('  ');
    const lx = Math.round((VIEW_W - textWidth(line, 1)) / 2);
    let cx = lx;
    DIFFICULTIES.forEach((d, i) => {
      text(opts[i], cx, 180, d === difficulty ? '#7dfaa8' : '#35704b');
      cx += (opts[i].length + 2) * (GLYPH_W + GLYPH_GAP);
    });
    const rec = record();
    textMid(ROUNDS[difficulty] + ' ROUNDS' + (rec.best ? '   BEST ' + fmt(rec.best) + (rec.ghost ? ' G' : '') : ''),
      191, rec.best ? '#f0b429' : '#4a5560');
    const blink = (state.t * 2 | 0) % 2 === 0;
    textMid('< > CHOOSE   Z START', 205, blink ? '#7dfaa8' : '#1f3a2a');
  }

  function fmt(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /* The briefing is where the game says what kind of game it is, and it matters:
     without being told, everyone picks up the pistol and starts a firefight they
     cannot win. */
  function drawBrief() {
    panel('BRIEFING', [
      'GET IN. GET THE DATA.',
      'GET OUT UNSEEN.',
      '',
      '> DARK IS COVER. A GUARD',
      '  CANNOT SEE INTO IT.',
      '> WALK. RUNNING CARRIES.',
      '> TAKE A MAN FROM',
      '  BEHIND, NEVER FROM',
      '  THE FRONT.',
      '> THE PISTOL IS FOR THE',
      '  LAMPS. ' + ROUNDS[state.difficulty] + ' ROUNDS.',
      '',
      'TWO HITS AND YOU ARE',
      'FINISHED.'
    ], 'PRESS Z');
  }

  function drawHack() {
    const h = state.hack;
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('TERMINAL', 6, 16, '#7dfaa8', 2);
    text('BYPASS ' + (h.round + 1) + ' OF 3', 6, 42, '#a9b3bf');

    const bx = 10, bw = VIEW_W - 20, by = 74, bh = 20;
    ctx.fillStyle = '#10161c';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = h.flash > 0 ? '#d7263d' : '#35704b';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = 'rgba(125,250,168,0.35)';
    ctx.fillRect(Math.round(bx + h.zoneAt * bw), by + 1, Math.round(h.zone * bw), bh - 2);
    ctx.fillStyle = '#7dfaa8';
    ctx.fillRect(Math.round(bx + h.pos * bw) - 1, by - 4, 3, bh + 8);

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < h.round ? '#7dfaa8' : '#232b34';
      ctx.fillRect(10 + i * 14, 108, 10, 6);
    }
    // a miss says so here, where you are looking, not in the ticker the terminal covers
    if (h.missed > 0) {
      text('MISSED - TRY AGAIN', 6, 118, '#d7263d');
      text('IT MADE A NOISE', 6, 128, '#f0b429');
    } else {
      text('STOP IT IN THE GREEN', 6, 128, '#7f8a97');
    }
    text('Z TO LOCK', 6, 140, '#7dfaa8');
    text('P TO BACK OUT', 6, 152, '#4a5560');
    // a little falling garbage, for the look of the thing
    ctx.fillStyle = '#183226';
    for (let i = 0; i < 26; i++) {
      const x = (i * 37) % VIEW_W;
      const y = 172 + ((state.t * 40 + i * 23) % 44);
      ctx.fillRect(x, y, 2, 5);
    }
  }

  function drawEnd() {
    const won = state.mode === 'win';
    panel(won ? 'EXTRACTED' : 'MISSION FAILED', won ? [
      'MODE    ' + state.difficulty.toUpperCase(),
      'TIME    ' + fmt(state.clock),
      'ALARM   ' + (state.alarmEarly ? 'RAISED' : 'CLEAN'),
      'ROUNDS  ' + state.player.ammo + ' OF ' + ROUNDS[state.difficulty] + ' LEFT',
      'TAKEN   ' + state.taken + ' QUIETLY',
      state.retries ? 'RETRIES ' + state.retries : '',
      state.alarmEarly ? 'They knew you were' : 'Nobody ever knew you',
      state.alarmEarly ? 'there. Go again.' : 'were there.',
      '',
      record().best ? 'BEST ' + fmt(record().best) : ''
    ] : state.checkpoint ? [
      state.ending,
      '',
      'You had the data.',
      'The checkpoint is at',
      'the terminal.',
      '',
      '> Z  RETRY THE ESCAPE',
      '> P  START OVER'
    ] : [
      state.ending,
      '',
      'They had the whole',
      'compound awake.',
      '',
      'TIME ' + fmt(state.clock)
    ], won || !state.checkpoint ? 'PRESS Z' : 'Z RETRY   P RESTART');
  }

  function drawPause() {
    panel('PAUSED', [
      '',
      'The compound waits.',
      '',
      'ARROWS  MOVE',
      'DOWN    CROUCH',
      'UP      CLIMB',
      'Z       USE / TAKE DOWN',
      'X       FIRE',
      'SHIFT   RUN',
      'C       GOGGLES'
    ], 'PRESS Z');
  }

  /* A full-canvas screen, held to the old 176x220 box in the middle: fill the
     canvas in its background colour, then draw the box as it was always drawn. */
  function boxed(bg, draw) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    ctx.translate(viewCX() - VIEW_W / 2, Math.round((CH - VIEW_H) / 2));
    draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (state.mode === 'title') { boxed('#05070a', drawTitle); return; }
    if (state.mode === 'brief') { boxed('#080b0f', drawBrief); return; }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CW, CH);

    if (state.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    }

    // sky and the far side of the compound
    const skyTop = py(0), skyBot = py(15);
    const sky = ctx.createLinearGradient(0, skyTop, 0, skyBot);
    sky.addColorStop(0, '#0a1018');
    sky.addColorStop(1, '#121a15');
    ctx.fillStyle = sky;
    ctx.fillRect(0, HUD_H, CW, CH - HUD_H);
    ctx.fillStyle = '#0d141c';
    for (let i = 0; i < 12 + Math.ceil(CW / 120); i++) {
      const x = ((i * 137 - state.camX * 0.35) % (CW + 60) + (CW + 60)) % (CW + 60) - 30;
      ctx.fillRect(x, py(9.5) + (i % 3) * 9, 26, 60);
    }

    // Inside the building the rooms are empty tiles, so without this the night
    // sky shows straight through the walls of a two-storey block.
    const bx0 = px(BLD_L), bx1 = px(BLD_R + 1);
    if (bx1 > 0 && bx0 < CW) {
      const top = py(5), bot = py(15);
      ctx.fillStyle = '#0e1319';
      ctx.fillRect(bx0, top, bx1 - bx0, bot - top);
      ctx.fillStyle = '#141b22';
      for (let y = top; y < bot; y += 9) ctx.fillRect(bx0, y, bx1 - bx0, 1);
    }

    drawTiles();
    drawProps();
    drawCones();
    for (const g of state.guards) if (g.down) drawGuard(g);
    for (const g of state.guards) if (!g.down) drawGuard(g);
    drawPlayer();
    drawLight();
    drawLaser();
    drawGoggles();
    drawMarkers();

    drawFogAndGlow();
    drawOverFog();

    ctx.translate(viewCX() - VIEW_W / 2, 0);
    drawHud();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (state.mode === 'hack') boxed('#05080c', drawHack);
    if (state.mode === 'pause') boxed('#080b0f', drawPause);
    if (state.mode === 'dead' || state.mode === 'win') boxed('#080b0f', drawEnd);
  }

  // ---------- sound: a few square waves, off by default ----------
  let audioOn = false;
  let ac = null;

  function ensureAudio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }

  function beep(freq, dur, vol, type) {
    if (!audioOn) return;
    const a = ensureAudio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.05, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  }

  function siren() {
    if (!audioOn) return;
    const a = ensureAudio();
    if (!a) return;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => beep(i % 2 ? 440 : 660, 0.22, 0.06, 'square'), i * 230);
    }
  }

  // ---------- storage ----------
  function load() {
    try {
      const v2 = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (v2) return v2;
      const v1 = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
      return v1 ? { hard: v1 } : {};
    } catch (e) { return {}; }
  }
  function store(v) {
    saveCache = v;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { /* private window */ }
  }
  // the title and the end card read this every frame, so it is read from disk once
  let saveCache = load();
  const record = () => saveCache[difficulty] || {};

  let difficulty = 'normal';
  try {
    const d = localStorage.getItem(DIFF_KEY);
    if (ROUNDS[d]) difficulty = d;
  } catch (e) { /* ignore */ }

  // ---------- page furniture ----------
  const btnSound = document.getElementById('btn-sound');
  const btnHelp = document.getElementById('btn-help');
  const btnScale = document.getElementById('btn-scale');
  const help = document.getElementById('help');
  const stage = document.getElementById('stage');

  btnSound.addEventListener('click', () => {
    audioOn = !audioOn;
    btnSound.textContent = 'Sound: ' + (audioOn ? 'on' : 'off');
    btnSound.setAttribute('aria-pressed', String(audioOn));
    try { localStorage.setItem(SOUND_KEY, audioOn ? '1' : '0'); } catch (e) { /* ignore */ }
    if (audioOn) { ensureAudio(); beep(660, 0.08, 0.06); }
  });
  try {
    if (localStorage.getItem(SOUND_KEY) === '1') btnSound.click();
  } catch (e) { /* ignore */ }

  btnHelp.addEventListener('click', () => { help.hidden = false; });
  help.addEventListener('click', e => {
    if (e.target === help || e.target.dataset.close) help.hidden = true;
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !help.hidden) help.hidden = true; });

  // screen size: fit the window, or a fixed multiple
  let scaleMode = 'fit';
  try { scaleMode = localStorage.getItem(SCALE_KEY) || 'fit'; } catch (e) { /* ignore */ }

  /* The canvas fills the stage, in whole game pixels. "Fit" picks the scale that
     keeps the clear view about the size the old phone screen was — roughly a
     third of the stage's height, three times over on a laptop — and the canvas
     is simply as many game pixels as then fit, most of them fog. */
  function fitCanvas() {
    const availW = stage.clientWidth, availH = stage.clientHeight;
    let s;
    if (scaleMode === 'fit') {
      s = Math.max(1, Math.min(4, Math.floor(availH / 290)));
      while (s > 1 && (VIEW_W * s > availW || VIEW_H * s > availH)) s--;
    } else {
      s = parseInt(scaleMode, 10) || 2;
    }
    CW = Math.max(VIEW_W, Math.floor(availW / s));
    CH = Math.max(VIEW_H, Math.floor(availH / s));
    if (cv.width !== CW) cv.width = CW;
    if (cv.height !== CH) cv.height = CH;
    cv.style.width = CW * s + 'px';
    cv.style.height = CH * s + 'px';
    ctx.imageSmoothingEnabled = false;
    resizeFog();
    if (state) { const c = camTarget(); state.camX = c.x; state.camY = c.y; }
    btnScale.textContent = 'Screen: ' + (scaleMode === 'fit' ? 'fit' : '×' + s);
    return s;
  }
  btnScale.addEventListener('click', () => {
    scaleMode = scaleMode === 'fit' ? '2' : scaleMode === '2' ? '3' : scaleMode === '3' ? '4' : 'fit';
    try { localStorage.setItem(SCALE_KEY, scaleMode); } catch (e) { /* ignore */ }
    fitCanvas();
  });
  addEventListener('resize', fitCanvas);

  // The buttons along the bottom drive the same key names as the keyboard, and
  // light up when the key is pressed, so each one teaches its own shortcut.
  for (const el of document.querySelectorAll('[data-key]')) {
    const name = el.dataset.key;
    const down = e => { e.preventDefault(); keyDown(name); };
    const up = e => { e.preventDefault(); keyUp(name); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  // ---------- go ----------
  newGame();
  fitCanvas();

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;                            // a tab that was in the background
    step(dt);
    render();
    for (const k in pressed) delete pressed[k];
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- the handle the tests drive ----------
  window.__blackout = {
    get state() { return state; },
    get player() { return state.player; },
    get guards() { return state.guards; },
    lightAt,
    losClear,
    tileAt,
    solidFor,
    guardSees,
    newGame,
    start() { state.mode = 'play'; },
    setMode(m) { state.mode = m; },
    press(name) { keyDown(name); },
    release(name) { keyUp(name); },
    // A key only registers as newly pressed if it was up first, same as a real
    // keyboard — so two presses in a row need the release in between.
    tap(name) { keyUp(name); keyDown(name); },
    hold(name, on) { if (on) keyDown(name); else keyUp(name); },
    teleport(x, y) {
      const p = state.player;
      p.x = x; p.y = y - p.h; p.vy = 0;
      const c = camTarget();
      state.camX = c.x;
      state.camY = c.y;
    },
    tick(dt, n) { for (let i = 0; i < (n || 1); i++) { step(dt || 1 / 60); for (const k in pressed) delete pressed[k]; } },
    setDifficulty,
    // the fog: draw a frame now, where things land on the canvas, how deep in the fog
    renderNow() { render(); },
    screenOf(wx, wy) { return { x: px(wx), y: py(wy) }; },
    fogAt: fogR,
    view() { return { cx: viewCX(), cy: viewCY(), w: CW, h: CH }; },
    giveCard() { state.hasCard = true; },
    openDoor() { state.doorOpen = true; },
    alarm() { raiseAlarm('TEST'); },
    consts: {
      T, MAP_W, MAP_H, DARK_ENOUGH, CONE_RANGE, EXTRACT_X, TERMINAL, DOOR_X, LADDER_X,
      BLD_L, BLD_R, P_H_STAND, P_H_CROUCH, SUSPECT, ROUNDS,
      tiles: { EMPTY, WALL, GROUND, VENT, LADDER, CRATE, DOOR, FENCE }
    }
  };
})();
