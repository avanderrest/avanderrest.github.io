/* Blackout: the rules. A stealth infiltration on an isometric grid, where nothing moves
   until you do: the five missions as data, walls, doors and sight lines, the light, who
   sees what, your moves and actions, the pistol, noise, the guards' turn, the terminal,
   winning, losing and the checkpoint. No page access, so a whole mission can be played
   in Node:

     const bo = createBlackout({ records, rnd, on })
       records  { load(), write(rec) }: the kept bests ({ best, unlocked, last, wins })
       rnd      the dice (where a guard wanders, the terminal's key zone)
       on       on(event, data): 'say' [text, kind], 'sfx' [name, ...args] ('tone' is
                freq, dur, vol, type, delay), 'light' (the lamps changed), 'end' won /
                lost / null to hide, 'hack' shown, 'hack-status' [text, kind], 'fog'
                (what you can see changed)
       anchor   anchor(target): where on screen a shot ends, for its tracer

   The mission's map (LEVELS, LAMPS, GUARDS...), state, difficulty and the mission number
   are read and set through bo; a turn is a queue of steps that pump(dt) plays out, or
   flush() all at once. */
import { mulberry32 } from '../lib/rng.js';

// best: { missionId: { normal, hard } } in moves; unlocked: how many missions are open
export const freshRecords = () => ({ best: {}, unlocked: 1, last: 0, wins: 0 });
/* A v3 save was the one-mission game: its bests were set on the first mission, and a win
   there opens the second. */
export function fromV3(old, firstId) {
  const rec = freshRecords();
  rec.best[firstId] = { normal: (old.best && old.best.normal) || null, hard: (old.best && old.best.hard) || null };
  rec.wins = old.wins || 0;
  if (rec.wins) rec.unlocked = 2;
  return rec;
}

export function createBlackout({ records = { load: freshRecords, write() {} }, rnd, on = () => {},
  anchor = () => null } = {}) {
  // ---------- constants ----------
  // v3: this Blackout replaced the side-on one on 2026-10-01. Its v2 best times
  // measured a different game, so they are dropped rather than carried.
  // v4: five missions, so a best per mission and how far you have got. A v3 best
  // was set on the first mission, and is carried across to it once.

  // the isometric projection, in world pixels: a tile is a 64x32 diamond
  const HW = 32, HH = 16;
  const STOREY = 54;          // how far up one floor sits
  const WALL_H = 44;          // a wall stops short of the floor above, and the slab fills the gap
  const WALL_CUT = 12;        // walls between you and the camera are cut down to this
  const SLAB = 22;            // the depth of the ground slab the compound floats on
  const FENCE_H = 34, RAIL_H = 13, CRATE_H = 22, POST_H = 66;
  const WT = 0.11;            // half a wall's thickness, in tiles

  // pace: nothing moves until you do. The guards take one step for every
  // GUARD_EVERY moves of yours; a move is a step, a shot, a takedown or a door.
  const GUARD_EVERY = 2;
  const GUARD_EVERY_ALARM = 1;   // once the alarm is up they keep pace with every move you make
  const MOVE_RUN = 0.5;       // a running step counts half a move: twice as far per guard step, and loud
  const MOVE_DRAG = 2;        // a step dragging a body counts double
  const STEP_T = 0.13;        // seconds a step takes on screen
  const RUN_T = 0.08;         // and a running one
  const CAM_EVERY = 3;        // cameras sweep a notch every this many ticks
  const LOOK_EVERY = 4;       // and the tower sentry turns
  const CORNER_WAIT = 2;      // ticks a patrol stands at each corner
  // Guards never run, not even on the hunt: one step a tick, whatever they are doing.
  const RING = { sneak: 5, run: 8, drag: 3 };   // how far the move grid is drawn around you

  // you
  const START_HP = 2;
  const ROUNDS = { normal: 12, hard: 5 };
  const NV_DRAIN = 3, NV_CHARGE = 1.5;   // goggle battery, percent per tick
  const SIGHT_DARK = 3.2;     // how far you see into the dark
  const SIGHT_NV = 8.5;       // and with the goggles on
  const SIGHT_MAX = 16;       // lamplight carries this far
  const SHOT_RANGE = 9;

  // being seen
  const LAMP_R = 3.8;         // a lamp's reach, in tiles
  const LIT = 0.3;            // light a guard can see you in from anywhere in his cone
  const SEE_LIGHT = 0.18;     // light you can see a tile in from anywhere
  const AMBIENT_OUT = 0.07, AMBIENT_IN = 0.03;
  const CONE_HALF = 0.72;     // half the torch's angle, radians
  const CONE_RANGE = 5.5;
  const TORCH_REACH = 2.5;    // inside this the torch finds you in the dark
  const HUNT_REACH = 3.5;     // and a guard who knows you are here sweeps it further
  const FLOOD_RANGE = 6.5;    // the tower's floodlight
  const CAM_RANGE = 6, CAM_HALF = 0.42;
  const SEEN_GAIN = { normal: 34, hard: 50 };
  const SEEN_CAM = 50;
  const SEEN_DECAY = 6;       // per tick nobody sees you
  const REINFORCE = { normal: 2, hard: 3 };
  const REINFORCE_DELAY = 6;  // ticks after the alarm before the gate opens

  // noise, in tiles
  const NOISE_RUN = 4.5, NOISE_GLASS = 3.5, NOISE_HACK = 6;

  const HACK = {
    normal: { zone: 0.3, speed: 0.8, narrow: 0.8, quicken: 1.15 },
    hard: { zone: 0.24, speed: 1.0, narrow: 0.66, quicken: 1.3 },
  };

  // grid directions: east, south, west, north (x grows down-right on screen, y down-left)
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DIR_A = DIRS.map(([x, y]) => Math.atan2(y, x));

  const PHASES_BASE = {
    wire: 'Get inside the wire',
    card: 'Take the keycard off the yard patrol',
    door: 'Open the service door',
    terminal: 'Hack the terminal upstairs',
    escape: 'Get back out through the wire',
  };

  // ---------- the missions ----------
  /* Five compounds, played in order: each one won opens the next. Every one is the
     same job (wire, keycard, door, terminal, out), on its own two floors of 31 x 24
     tiles. Each character is one node:
       .  yard          ,  indoor floor      o  outside the wire     _  platform grating
       #  wall          W  wall with window  D  keycard door         c/C  crate (indoor/yard)
       F  fence         V  the cut in it     G  the gate reinforcements come in by
       r  railing       S  stairs up         s  their top, a floor higher   T  terminal
       L  the top of a ladder, which drops to the yard tile named in `ladders`
     Stairs join S on one floor to s straight above it; every other edge is a
     step to one of the four neighbours on the same floor.

     `upper` lists the floors above the ground. An open one (a tower) is always
     drawn; a roofed one is cut away, so you look down into the rooms beneath,
     until you are standing on it. Every tile on floor 1 must lie inside one.

     Lamps: a post stands on its tile with the lamp on an arm; a wall lamp is fixed
     to (mx,my) and shines over (x,y); a ceiling light hangs over (x,y).
     Cameras: fixed to (mx,my), looking out from (x,y), sweeping a0..a1 a notch a turn.
     Guards walk their route waypoint to waypoint, taking the shortest path between,
     and pause a step at each corner. A tower sentry never moves: he turns through
     his looks, and his floodlight falls on the yard below.
     Ladders run down the outside of a wall, from a top tile to a foot tile a floor
     below: a tower's is the only way on or off its platform, for the sentry and you.
     `termRoom` is only read by test/blackout/terminal.js: the room around the
     terminal, its ways in, and the tiles you can hack from. */
  const MISSIONS = [
    {
      id: 'compound',
      name: 'The Compound',
      brief: 'Night. A fenced compound. A terminal on the top floor.',
      levels: [
        [
          '                               ',
          '  FFFFFFFFFFFFFFFFFFFFFFFFFFFF ',
          '  F..........................F ',
          '  F.........CC.#WW###W###WW#.F ',
          '  F..####......#,cc,,#,,,,,#.F ',
          '  F..#  #......#,,,,c#,,,,,#.F ',
          '  F..#  #......W,,,,,,,,,,,W.F ',
          '  F..####......#c,,,,#,,,,c#.F ',
          '  F............###,###,,,,,#.F ',
          '  F.C..........#,,,,,###,###.F ',
          '  F.C..........W,,,,,#,,,,,W.F ',
          '  F............D,,,,,#,,,,,#.F ',
          '  F............#,,,,,,,,,,,#.G ',
          '  F............WS,c,,#,,,S,#.F ',
          '  F.......C....#,,,,,#,,,,,#.F ',
          '  F............##W###W###W##.F ',
          '  F..........................F ',
          '  F..........................F ',
          '  F.......C.............CC...F ',
          '  F..........................F ',
          '  F..........................F ',
          '  FFFFFVFFFFFFFFFFFFFFFFFFFFFF ',
          '   oooooooooooo                ',
          '   oooooooooooo                ',
        ],
        [
          '                               ',
          '                               ',
          '                               ',
          '               #WW##W#W##WW#   ',
          '     rrrr      #,,,,,#,,,,T#   ',
          '     r__L      #,,,,,#,,,,,#   ',
          '     r__r      W,,c,,,,,,,,W   ',
          '     rrrr      #,,,,,#,,,,,#   ',
          '               #,,,,,##,####   ',
          '               ###,###,,,,,#   ',
          '               W,,,,,,,,,,,W   ',
          '               #,,,,,#,,,,,#   ',
          '               #,,,,,#,,c,,#   ',
          '               Ws,,,,#,,,s,#   ',
          '               #,,,,,#,,,,,#   ',
          '               ##W##W###W###   ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
        ],
      ],
      upper: [
        { name: 'tower', lv: 1, x0: 5, y0: 4, x1: 8, y1: 7, open: true },
        { name: 'building', lv: 1, x0: 15, y0: 3, x1: 27, y1: 15, open: false },
      ],
      lamps: [
        { kind: 'post', x: 9, y: 19, lv: 0, ax: 0, ay: -1 },
        { kind: 'post', x: 12, y: 9, lv: 0, ax: 1, ay: 0 },
        { kind: 'post', x: 3, y: 16, lv: 0, ax: 1, ay: 0 },
        { kind: 'post', x: 20, y: 18, lv: 0, ax: 0, ay: -1 },
        { kind: 'wall', x: 14, y: 12, lv: 0, mx: 15, my: 12 },
        { kind: 'wall', x: 19, y: 2, lv: 0, mx: 19, my: 3 },
        { kind: 'wall', x: 28, y: 8, lv: 0, mx: 27, my: 8 },
        { kind: 'wall', x: 9, y: 6, lv: 0, mx: 8, my: 6 },
        { kind: 'ceil', x: 18, y: 12, lv: 0 },
        { kind: 'ceil', x: 24, y: 6, lv: 0 },
        { kind: 'ceil', x: 24, y: 12, lv: 0 },
        { kind: 'ceil', x: 18, y: 6, lv: 1 },
        { kind: 'ceil', x: 24, y: 5, lv: 1 },
        { kind: 'ceil', x: 24, y: 12, lv: 1 },
        { kind: 'ceil', x: 18, y: 12, lv: 1 },
      ],
      cams: [
        { x: 15, y: 16, lv: 0, mx: 15, my: 15, a0: Math.PI * 0.5, a1: Math.PI * 0.95, steps: 3 },
        // The terminal room's camera, on the south wall by the door. Tuned with test/blackout/terminal.js so
        // the terminal can be reached past it unseen, but only from a few entry timings and only by the
        // shortest way: you can do it without shooting it, just.
        { x: 24, y: 7, lv: 1, mx: 24, my: 8, a0: -3.02, a1: -0.82, steps: 3, every: 2 },
      ],
      guards: [
        { x: 4, y: 13, lv: 0, card: true, route: [[4, 13], [12, 13], [12, 17], [4, 17]] },
        { x: 9, y: 2, lv: 0, route: [[9, 2], [28, 2], [28, 17], [16, 17]] },
        { x: 17, y: 13, lv: 0, route: [[17, 13], [25, 11], [24, 5], [18, 5]] },
        { x: 17, y: 12, lv: 1, route: [[17, 12], [25, 11], [23, 6], [18, 5]] },
        { x: 7, y: 6, lv: 1, looks: [1, 0, 1, 2], overlook: true },
      ],
      ladders: [{ top: [8, 5, 1], foot: [9, 5, 0] }],
      start: { x: 7, y: 23, lv: 0, face: 3 },
      gate: { x: 29, y: 12, lv: 0 },
      termRoom: { x0: 22, y0: 4, x1: 26, y1: 7, lv: 1, entries: [[23, 8], [21, 6]], goals: [[25, 4], [26, 5]] },
    },
    {
      id: 'depot',
      name: 'The Depot',
      brief: 'A freight depot. Crates stacked in rows. An office over the loading floor.',
      levels: [
        [
          '                               ',
          ' FFFFFFFFFFFFFFFFFFFFFFFFFFF   ',
          ' F.........................F   ',
          ' F.#WW##W##WW##............F   ',
          ' F.#,,,,,,,,,,#....CC......F   ',
          ' F.#,cc,,,cc,,W....CC......F   ',
          ' F.#,cc,,,cc,,#............F   ',
          ' F.W,,,,,,,,,,#.........C..F   ',
          ' G.#,cc,,,cc,,#.........C..F   ',
          ' F.#,cc,,,cc,,W............F   ',
          ' F.#,,,,,,,,,,#....CC......F   ',
          ' F.#S,,,,,,,,,#....CC......F   ',
          ' F.####D####W##............F   ',
          ' F.........................Fooo',
          ' F...CC....CC.....CC.......Fooo',
          ' F.........................Fooo',
          ' F...CC....CC.....CC.......Vooo',
          ' F.........................Fooo',
          ' F........C.........C......Fooo',
          ' F.........................Fooo',
          ' FFFFFFFFFFFFFFFFFFFFFFFFFFFooo',
          '                            ooo',
          '                               ',
          '                               ',
        ],
        [
          '                               ',
          '                               ',
          '                               ',
          '   #WW##W##WW##                ',
          '   #,,,,,#,,,T#                ',
          '   #,,,,,#,,,,#                ',
          '   #,,,,,,,,,,W                ',
          '   #,,,,,#,,,,#                ',
          '   #,,####,####                ',
          '   #,,,,,,,,,,#                ',
          '   W,,,,c,,,,,W                ',
          '   #s,,,,,,,,,#                ',
          '   ##W###W###W#                ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
        ],
      ],
      upper: [
        { name: 'office', lv: 1, x0: 3, y0: 3, x1: 14, y1: 12, open: false },
      ],
      lamps: [
        { kind: 'post', x: 22, y: 8, lv: 0, ax: -1, ay: 0 },
        { kind: 'post', x: 15, y: 17, lv: 0, ax: 0, ay: -1 },
        { kind: 'post', x: 21, y: 19, lv: 0, ax: 0, ay: -1 },
        { kind: 'wall', x: 8, y: 13, lv: 0, mx: 8, my: 12 },
        { kind: 'wall', x: 15, y: 6, lv: 0, mx: 14, my: 6 },
        { kind: 'ceil', x: 8, y: 7, lv: 0 },
        { kind: 'ceil', x: 11, y: 10, lv: 0 },
        { kind: 'ceil', x: 6, y: 5, lv: 1 },
        { kind: 'ceil', x: 11, y: 6, lv: 1 },
        { kind: 'ceil', x: 8, y: 10, lv: 1 },
      ],
      cams: [
        { x: 15, y: 9, lv: 0, mx: 14, my: 9, a0: -0.6, a1: 0.9, steps: 3 },
        // over the terminal, tuned with test/blackout/terminal.js like the first mission's
        { x: 10, y: 4, lv: 1, mx: 10, my: 3, a0: 0.11, a1: 2.11, steps: 3, every: 2 },
      ],
      guards: [
        { x: 4, y: 15, lv: 0, card: true, route: [[4, 15], [24, 15], [24, 19], [4, 19]] },
        { x: 16, y: 3, lv: 0, route: [[16, 3], [25, 3], [25, 12], [16, 12]] },
        { x: 2, y: 12, lv: 0, route: [[2, 12], [2, 2], [13, 2]] },
        { x: 5, y: 4, lv: 0, route: [[5, 4], [12, 4], [12, 10], [5, 10]] },
        { x: 5, y: 10, lv: 1, route: [[5, 10], [12, 10], [11, 5], [6, 5]] },
      ],
      ladders: [],
      start: { x: 29, y: 20, lv: 0, face: 2 },
      gate: { x: 1, y: 8, lv: 0 },
      termRoom: { x0: 10, y0: 4, x1: 13, y1: 7, lv: 1, entries: [[9, 6], [10, 8]], goals: [[12, 4], [13, 5]] },
    },
    {
      id: 'relay',
      name: 'The Relay',
      brief: 'A radio relay on open ground. Two towers, two floodlights, nowhere to hide.',
      levels: [
        [
          '      ooooo                    ',
          '      ooooo                    ',
          '  FFFFFFVFFFFFFFFFFFFFFFFFFFF  ',
          '  F.................####....F  ',
          '  F.................#  #....F  ',
          '  F.................#  #....F  ',
          '  F.................####....F  ',
          '  F.........................F  ',
          '  F...C.....................F  ',
          '  F............#WW###W##WW#.F  ',
          '  F............#,,,,#,,,,,#.F  ',
          '  F............W,,,,,,,,,,W.F  ',
          '  F.####.......#,c,,#,,,c,#.F  ',
          '  F.#  #.......D,,,,#,,,,,#.F  ',
          '  F.#  #.......#,,,,,,,,,,#.F  ',
          '  F.####.......#,,,,#,,,,,#.F  ',
          '  F............W,,,,###,###.F  ',
          '  F............#S,,,,,,,,S#.F  ',
          '  F............##W##W##W###.F  ',
          '  F.........C...............F  ',
          '  F.........................F  ',
          '  FFFFFFFFFFFFFGFFFFFFFFFFFFF  ',
          '                               ',
          '                               ',
        ],
        [
          '                               ',
          '                               ',
          '                               ',
          '                    rrrr       ',
          '                    r__L       ',
          '                    r__r       ',
          '                    rrrr       ',
          '                               ',
          '                               ',
          '               #WW###W##WW#    ',
          '               #,,,,#,,,,T#    ',
          '               #,,,,#,,,,,#    ',
          '    rrrr       W,,,,,,,,,,W    ',
          '    r__L       #,,,,#,,,,,#    ',
          '    r__r       #,,,,###,###    ',
          '    rrrr       #,,,,#,,,,,#    ',
          '               W,,,,#,,c,,W    ',
          '               #s,,,,,,,,s#    ',
          '               ##W##W##W###    ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
        ],
      ],
      upper: [
        { name: 'west tower', lv: 1, x0: 4, y0: 12, x1: 7, y1: 15, open: true },
        { name: 'east tower', lv: 1, x0: 20, y0: 3, x1: 23, y1: 6, open: true },
        { name: 'relay house', lv: 1, x0: 15, y0: 9, x1: 26, y1: 18, open: false },
      ],
      lamps: [
        { kind: 'post', x: 10, y: 10, lv: 0, ax: 1, ay: 0 },
        { kind: 'post', x: 13, y: 20, lv: 0, ax: 0, ay: -1 },
        { kind: 'post', x: 26, y: 7, lv: 0, ax: 0, ay: 1 },
        { kind: 'wall', x: 14, y: 12, lv: 0, mx: 15, my: 12 },
        { kind: 'wall', x: 19, y: 8, lv: 0, mx: 19, my: 9 },
        { kind: 'ceil', x: 18, y: 11, lv: 0 },
        { kind: 'ceil', x: 23, y: 12, lv: 0 },
        { kind: 'ceil', x: 18, y: 15, lv: 0 },
        { kind: 'ceil', x: 17, y: 11, lv: 1 },
        { kind: 'ceil', x: 23, y: 11, lv: 1 },
        { kind: 'ceil', x: 18, y: 15, lv: 1 },
        { kind: 'ceil', x: 23, y: 16, lv: 1 },
      ],
      cams: [
        { x: 14, y: 16, lv: 0, mx: 15, my: 16, a0: 2.3, a1: 3.9, steps: 3 },
        // over the terminal, tuned with test/blackout/terminal.js like the first mission's
        { x: 21, y: 10, lv: 1, mx: 21, my: 9, a0: -0.14, a1: 2.06, steps: 3, every: 2 },
      ],
      guards: [
        { x: 3, y: 18, lv: 0, card: true, route: [[3, 18], [13, 18], [13, 7], [3, 7]] },
        { x: 27, y: 7, lv: 0, route: [[27, 7], [27, 20], [16, 20]] },
        { x: 10, y: 3, lv: 0, route: [[10, 3], [19, 3], [19, 8], [10, 8]] },
        { x: 17, y: 11, lv: 1, route: [[17, 11], [24, 12], [24, 16], [17, 16]] },
        { x: 6, y: 14, lv: 1, looks: [0, 1, 0, 3], overlook: true },
        { x: 22, y: 5, lv: 1, looks: [2, 1, 0, 1], overlook: true },
      ],
      ladders: [{ top: [7, 13, 1], foot: [8, 13, 0] }, { top: [23, 4, 1], foot: [24, 4, 0] }],
      start: { x: 8, y: 0, lv: 0, face: 1 },
      gate: { x: 15, y: 21, lv: 0 },
      termRoom: { x0: 21, y0: 10, x1: 25, y1: 13, lv: 1, entries: [[20, 12], [23, 14]], goals: [[24, 10], [25, 11]] },
    },
    {
      id: 'villa',
      name: 'The Villa',
      brief: 'A private house in walled gardens. The keycard never leaves the building.',
      phases: { card: 'Take the keycard off the house guard', door: 'Open the locked door to the stairs' },
      levels: [
        [
          '                               ',
          '                               ',
          '   FFFFFFFFFFFFFFFFFFFFFFFFFFF ',
          '   F.........................F ',
          '   F....#WW##W##W##W##WW#....F ',
          '   F....#,,,,,#,,,,#,,,,#....F ',
          '   F....#,c,,,#,,,,#,,S,#....F ',
          '   F....W,,,,,,,,,,D,,,,#....F ',
          '   F....#,,,,,#,,,,#,,c,#....F ',
          '   F....###,##,,,,,######....F ',
          '   F....#,,,,,,,,,,,,,,,W....F ',
          '   F....#,c,,,,,,,,,,,c,#....F ',
          '   F....W,,,,,,,,,,,,,,,#....F ',
          '   F....#,,,,#,,,,,#,,,,#....F ',
          '   F....#,,,,#,,,,,#,,,,#....F ',
          '   F....#WW##,,###,,##WW#....F ',
          'oooF.........................F ',
          'oooF..CCC.....CCC.....CCC....F ',
          'oooV.........................F ',
          'oooF.........................F ',
          'oooF..CCC.....CCC.....CCC....F ',
          'oooF.........................F ',
          '   FFFFFFFFFFFFFGFFFFFFFFFFFFF ',
          '                               ',
        ],
        [
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '        #WW##W##W##W##WW#      ',
          '        #T,,,,#,,,,#,,,,#      ',
          '        #,,,,,#,,,,#,,s,#      ',
          '        W,,,,,#,,,,,,,,,#      ',
          '        #,,,,,,,,,,#,,,,#      ',
          '        ###,##,,,,,##,###      ',
          '        #,,,,,,,,,,,,,,,W      ',
          '        #,,,c,,,,,,,,,,,#      ',
          '        W,,,,,,,,,,,c,,,#      ',
          '        #,,,,#,,,,,#,,,,#      ',
          '        #,,,,#,,,,,#,,,,#      ',
          '        ##WW###W###W##WW#      ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
        ],
      ],
      upper: [
        { name: 'house', lv: 1, x0: 8, y0: 4, x1: 24, y1: 15, open: false },
      ],
      lamps: [
        { kind: 'post', x: 16, y: 19, lv: 0, ax: 0, ay: -1 },
        { kind: 'post', x: 6, y: 10, lv: 0, ax: 1, ay: 0 },
        { kind: 'post', x: 26, y: 6, lv: 0, ax: -1, ay: 0 },
        { kind: 'wall', x: 12, y: 16, lv: 0, mx: 12, my: 15 },
        { kind: 'wall', x: 21, y: 16, lv: 0, mx: 21, my: 15 },
        { kind: 'ceil', x: 16, y: 7, lv: 0 },
        { kind: 'ceil', x: 11, y: 6, lv: 0 },
        { kind: 'ceil', x: 16, y: 12, lv: 0 },
        { kind: 'ceil', x: 21, y: 12, lv: 0 },
        { kind: 'ceil', x: 11, y: 6, lv: 1 },
        { kind: 'ceil', x: 16, y: 6, lv: 1 },
        { kind: 'ceil', x: 16, y: 11, lv: 1 },
        { kind: 'ceil', x: 21, y: 11, lv: 1 },
      ],
      cams: [
        { x: 16, y: 16, lv: 0, mx: 16, my: 15, a0: 0.6, a1: 2.5, steps: 3 },
        // over the terminal, tuned with test/blackout/terminal.js like the first mission's
        { x: 10, y: 5, lv: 1, mx: 10, my: 4, a0: 0.36, a1: 1.96, steps: 3, every: 2 },
      ],
      guards: [
        { x: 10, y: 10, lv: 0, card: true, route: [[10, 10], [22, 10], [22, 14], [10, 14]] },
        { x: 4, y: 16, lv: 0, route: [[4, 16], [28, 16], [28, 21], [4, 21]] },
        { x: 5, y: 15, lv: 0, route: [[5, 15], [5, 3], [27, 3], [27, 15]] },
        { x: 10, y: 5, lv: 0, route: [[10, 5], [13, 5], [13, 8], [10, 8]] },
        { x: 10, y: 10, lv: 1, route: [[10, 10], [22, 10], [21, 6], [15, 6]] },
      ],
      ladders: [],
      start: { x: 1, y: 18, lv: 0, face: 0 },
      gate: { x: 16, y: 22, lv: 0 },
      termRoom: { x0: 9, y0: 5, x1: 13, y1: 8, lv: 1, entries: [[14, 8], [11, 9]], goals: [[10, 5], [9, 6]] },
    },
    {
      id: 'blacksite',
      name: 'The Blacksite',
      brief: 'The last one. A guardhouse, a tower, cameras on every wall.',
      phases: { door: 'Open the side door' },
      levels: [
        [
          '                               ',
          '                               ',
          ' FFFFFFFFFFFFFFGFFFFFFFFFFFFFF ',
          ' F...........................F ',
          ' F.#WW##W##WW##.......####...F ',
          ' F.#,,,,#,,,,,#.......#  #...F ',
          ' F.#,c,,#,,,,,W.......#  #...F ',
          ' F.W,,,,,,,,,,#.......####...F ',
          ' F.#,,,,#,,,c,#..............F ',
          ' F.###,####,###....C.........F ',
          ' F.#,,,,,,,,,,#..............F ',
          ' F.W,,,,,,,,,,D..........C...F ',
          ' F.#S,,,c,,,,S#..............F ',
          ' F.##W###W##W##..............F ',
          ' F...........................F ',
          ' F...C............#W###W#....F ',
          ' F................#,,,,,#....F ',
          ' F................,,,,c,#....F ',
          ' F.......C........#,,,,,#....F ',
          ' F................##W#W##....F ',
          ' F...........................F ',
          ' F...........................F ',
          ' FFFFFFFFFFFFFFFFFFFFFFVFFFFFF ',
          '                    ooooooooo  ',
        ],
        [
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '   #WW##W##WW##       rrrr     ',
          '   #T,,,#,,,,,#       r__L     ',
          '   #,,,,#,,,c,W       r__r     ',
          '   W,,,,,,,,,,#       rrrr     ',
          '   #,,,,#,,,,,#                ',
          '   ###,###,####                ',
          '   #,,,,,,,,,,#                ',
          '   W,,,c,,,,,,W                ',
          '   #s,,,,,,,,s#                ',
          '   ##W###W##W##                ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
          '                               ',
        ],
      ],
      upper: [
        { name: 'tower', lv: 1, x0: 22, y0: 4, x1: 25, y1: 7, open: true },
        { name: 'block', lv: 1, x0: 3, y0: 4, x1: 14, y1: 13, open: false },
      ],
      lamps: [
        { kind: 'post', x: 18, y: 6, lv: 0, ax: 1, ay: 0 },
        { kind: 'post', x: 21, y: 12, lv: 0, ax: 0, ay: 1 },
        { kind: 'post', x: 9, y: 17, lv: 0, ax: 0, ay: -1 },
        { kind: 'post', x: 28, y: 16, lv: 0, ax: -1, ay: 0 },
        { kind: 'wall', x: 15, y: 10, lv: 0, mx: 14, my: 10 },
        { kind: 'wall', x: 17, y: 16, lv: 0, mx: 18, my: 16 },
        { kind: 'wall', x: 9, y: 14, lv: 0, mx: 9, my: 13 },
        { kind: 'ceil', x: 6, y: 10, lv: 0 },
        { kind: 'ceil', x: 11, y: 10, lv: 0 },
        { kind: 'ceil', x: 10, y: 6, lv: 0 },
        { kind: 'ceil', x: 21, y: 16, lv: 0 },
        { kind: 'ceil', x: 6, y: 6, lv: 1 },
        { kind: 'ceil', x: 11, y: 6, lv: 1 },
        { kind: 'ceil', x: 8, y: 11, lv: 1 },
      ],
      cams: [
        { x: 21, y: 14, lv: 0, mx: 21, my: 15, a0: -2.6, a1: -0.5, steps: 3 },
        { x: 15, y: 8, lv: 0, mx: 14, my: 8, a0: 0, a1: 1.6, steps: 3 },
        // over the terminal, tuned with test/blackout/terminal.js like the first mission's
        { x: 5, y: 5, lv: 1, mx: 5, my: 4, a0: 0.36, a1: 1.96, steps: 3, every: 2 },
      ],
      guards: [
        { x: 16, y: 14, lv: 0, card: true, route: [[16, 14], [16, 21], [27, 21], [27, 14]] },
        { x: 2, y: 3, lv: 0, route: [[2, 3], [28, 3], [28, 8], [16, 8]] },
        { x: 2, y: 14, lv: 0, route: [[2, 14], [2, 21], [15, 21], [15, 14]] },
        { x: 19, y: 16, lv: 0, route: [[19, 16], [23, 16], [23, 18], [19, 18]] },
        { x: 4, y: 10, lv: 0, route: [[4, 10], [13, 10], [10, 5], [5, 5]] },
        { x: 4, y: 10, lv: 1, route: [[4, 10], [13, 10], [13, 6], [9, 6]] },
        { x: 23, y: 6, lv: 1, looks: [2, 1, 2, 3], overlook: true },
      ],
      ladders: [{ top: [25, 5, 1], foot: [26, 5, 0] }],
      start: { x: 23, y: 23, lv: 0, face: 3 },
      gate: { x: 15, y: 2, lv: 0 },
      termRoom: { x0: 4, y0: 5, x1: 7, y1: 8, lv: 1, entries: [[8, 7], [6, 9]], goals: [[5, 5], [4, 6]] },
    },
  ];

  const W = 31, H = 24, LV = 2;
  const N = W * H * LV;
  MISSIONS.forEach((m) => m.levels.forEach((rows, lv) => {
    if (rows.length !== H) console.error('blackout: ' + m.id + ' floor ' + lv + ' has ' + rows.length + ' rows');
    rows.forEach((r, y) => { if (r.length !== W) console.error('blackout: ' + m.id + ' floor ' + lv + ' row ' + y + ' is ' + r.length + ' wide'); });
  }));

  // the mission being played: everything below reads these, and loadMission swaps them
  let mission = MISSIONS[0], missionI = 0;
  let LEVELS, UPPER, LAMPS, CAMERAS, GUARDS, LADDERS, START, GATE, CUT, PHASES;
  function loadMission(i) {
    missionI = clamp(i | 0, 0, MISSIONS.length - 1);
    mission = MISSIONS[missionI];
    ({ levels: LEVELS, upper: UPPER, lamps: LAMPS, cams: CAMERAS, guards: GUARDS, ladders: LADDERS, start: START, gate: GATE } = mission);
    PHASES = Object.assign({}, PHASES_BASE, mission.phases);
    CUT = null;
    LEVELS[0].forEach((r, y) => { const x = r.indexOf('V'); if (x >= 0) CUT = { x, y, lv: 0 }; });
  }

  const TILE = {
    '.': { floor: 'yard', walk: 1 },
    'o': { floor: 'dirt', walk: 1, outside: 1 },
    ',': { floor: 'tile', walk: 1 },
    '_': { floor: 'grate', walk: 1 },
    'S': { floor: 'tile', walk: 1, stairs: 1 },
    's': { floor: 'tile', walk: 1, stairs: 1, top: 1 },
    '#': { floor: 'tile', wall: 1, opaque: 1 },
    'W': { floor: 'tile', wall: 1, window: 1 },
    'D': { floor: 'tile', wall: 1, door: 1 },
    'F': { floor: 'yard', fence: 1 },
    'V': { floor: 'yard', fence: 1, cut: 1, walk: 1, playerOnly: 1 },
    'G': { floor: 'yard', fence: 1, gate: 1, walk: 1, guardOnly: 1 },
    'r': { floor: 'grate', rail: 1 },
    'L': { floor: 'grate', walk: 1, ladder: 1 },
    'C': { floor: 'yard', crate: 1, opaque: 1 },
    'c': { floor: 'tile', crate: 1, opaque: 1 },
    'T': { floor: 'tile', terminal: 1 },
  };

  // ---------- grid ----------
  let R = rnd || Math.random;      // the dice; seedDice(n) swaps in a seeded one for tests
  const key = (x, y, lv) => (lv * H + y) * W + x;
  const kx = (k) => k % W;
  const ky = (k) => Math.floor(k / W) % H;
  const kl = (k) => Math.floor(k / (W * H));
  const inb = (x, y, lv) => x >= 0 && y >= 0 && x < W && y < H && lv >= 0 && lv < LV;
  const ch = (x, y, lv) => (inb(x, y, lv) ? LEVELS[lv][y][x] : ' ');
  const tile = (x, y, lv) => TILE[ch(x, y, lv)] || null;
  const inRegion = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const regionOf = (x, y, lv) => (lv === 0 ? null : UPPER.find((r) => r.lv === lv && inRegion(r, x, y)) || null);
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const dirIndex = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  loadMission(0);

  // ---------- state ----------
  let state = null;
  let difficulty = 'normal';

  function mkGuard(d, i) {
    return {
      id: i, x: d.x, y: d.y, lv: d.lv, rx: d.x, ry: d.y, rl: d.lv,
      route: d.route || (d.looks ? [[d.x, d.y, d.lv]] : null), wp: d.route ? 1 % d.route.length : 0, wait: 0,
      looks: d.looks || null, lookI: 0, overlook: !!d.overlook, sentry: !!d.looks,
      card: !!d.card, face: d.looks ? d.looks[0] : 0, ra: 0,
      mode: d.looks ? 'sentry' : 'patrol', target: null, marker: null,
      down: false, dead: false, reviving: null, carried: false, found: false, shot: false, saw: false, look: 0, walk: 0, aiming: false,
    };
  }

  function newGame(diff, mi) {
    if (diff) difficulty = diff;
    if (mi !== undefined) loadMission(mi);
    state = {
      difficulty, mission: missionI, mode: 'title', ticks: 0, moves: 0, pace: 0, run: false, nv: false, battery: 100,
      hp: START_HP, rounds: ROUNDS[difficulty], seen: 0, alarm: false, earlyAlarm: false,
      phase: 'wire', hasCard: false, dataDone: false, doors: {},
      player: { x: START.x, y: START.y, lv: START.lv, rx: START.x, ry: START.y, rl: START.lv, face: START.face, walk: 0 },
      guards: GUARDS.map(mkGuard),
      lamps: LAMPS.map((l) => Object.assign({ alive: true }, l)),
      cams: CAMERAS.map((c) => Object.assign({ alive: true, t: 0, dir: 1, a: c.a0, ra: c.a0 }, c)),
      posts: new Set(LAMPS.filter((l) => l.kind === 'post').map((l) => key(l.x, l.y, l.lv))),
      dragging: null, lastKnown: null, reinforceIn: -1, reinforceLeft: 0,
      spotted: false, interrupt: false,
      queue: [], busy: 0, skipDelay: false,
      vis: new Uint8Array(N), light: new Float32Array(N), torch: new Uint8Array(N), danger: new Uint8Array(N),
      reach: null, aim: null, hack: null, checkpoint: null,
      fx: [], shots: 0, takedowns: 0, steps: 0,
    };
    state.guards.forEach((g) => {
      if (g.route) {
        const n = nextStep(g, g.route[g.wp]);
        if (n) g.face = dirIndex(kx(n) - g.x, ky(n) - g.y);
      }
      g.ra = DIR_A[g.face];
    });
    computeLight();
    computeVision();
    computeReach();
    return state;
  }

  // ---------- walls, doors and sight lines ----------
  const doorOpen = (x, y, lv) => !!state.doors[key(x, y, lv)];

  function opaque(x, y, lv, high) {
    const t = tile(x, y, lv);
    if (!t) return false;
    if (t.crate) return !high;
    if (t.door) return !doorOpen(x, y, lv);
    return !!t.opaque;
  }

  /* A sight line between two points in tile units, blocked by any opaque tile it
     crosses other than the two it starts and ends in. From high up (the tower)
     crates do not block, nor does the tower's own wall under your feet. */
  function losF(ax, ay, bx, by, lv, high) {
    const sx = Math.floor(ax), sy = Math.floor(ay), ex = Math.floor(bx), ey = Math.floor(by);
    const dx = bx - ax, dy = by - ay;
    const n = Math.ceil(Math.hypot(dx, dy) * 4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const tx = Math.floor(ax + dx * t), ty = Math.floor(ay + dy * t);
      if ((tx === sx && ty === sy) || (tx === ex && ty === ey)) continue;
      if (high && Math.hypot(tx + 0.5 - ax, ty + 0.5 - ay) < 2.2) continue;
      if (opaque(tx, ty, lv, high)) return false;
    }
    return true;
  }
  const los = (x0, y0, x1, y1, lv, high) => losF(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, lv, high);

  // ---------- light ----------
  function lampPoint(l) {
    if (l.kind === 'post') return [l.x + 0.5 + l.ax * 0.32, l.y + 0.5 + l.ay * 0.32];
    if (l.kind === 'wall') return [l.mx + 0.5 + (l.x - l.mx) * 0.66, l.my + 0.5 + (l.y - l.my) * 0.66];
    return [l.x + 0.5, l.y + 0.5];
  }
  const lampTile = (l) => [l.x, l.y, l.lv];


  function computeLight() {
    const L = state.light;
    for (let k = 0; k < N; k++) {
      const x = kx(k), y = ky(k), lv = kl(k);
      const t = tile(x, y, lv);
      L[k] = !t ? 0 : (lv === 0 && t.floor !== 'tile' ? AMBIENT_OUT : AMBIENT_IN);   // indoors is darker
    }
    for (const l of state.lamps) {
      if (!l.alive) continue;
      const [px, py] = lampPoint(l);
      const R = LAMP_R;
      for (let y = Math.floor(py - R); y <= Math.ceil(py + R); y++) {
        for (let x = Math.floor(px - R); x <= Math.ceil(px + R); x++) {
          if (!tile(x, y, l.lv)) continue;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d >= R) continue;
          if (d > 0.75 && !losF(px, py, x + 0.5, y + 0.5, l.lv)) continue;
          const v = Math.min(1, (1 - d / R) * 1.25);
          const k = key(x, y, l.lv);
          if (v > L[k]) L[k] = v;
        }
      }
    }
    on('light');
  }


  // ---------- who sees what ----------
  // the floodlight only while he is up at his post
  const flood = (g) => g.overlook && g.mode === 'sentry';
  function coneRangeOf(g) { return flood(g) ? FLOOD_RANGE : CONE_RANGE; }
  // the floor a guard's cone lies on: the tower's floodlight falls on the yard
  function conePlane(g) { return flood(g) ? 0 : g.lv; }

  function inCone(g, x, y, lv, range) {
    const dx = x - g.x, dy = y - g.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    if (d < 0.1) return true;
    return angDiff(Math.atan2(dy, dx), DIR_A[g.face]) <= CONE_HALF;
  }

  /* Can this guard see (x,y,lv) right now? Inside his torch's reach, yes, dark
     or not; further out only if the tile is lit. The floodlight lights all of
     its cone. The sentry also watches his own platform like anyone else. */
  function seesTile(g, x, y, lv) {
    if (g.down || g.carried) return false;
    // at the two ends of one staircase there is nowhere to hide from each other
    if (lv !== g.lv && x === g.x && y === g.y && stairOther(key(g.x, g.y, g.lv)) === key(x, y, lv)) return true;
    if (lv === g.lv) {
      if (!inCone(g, x, y, lv, CONE_RANGE)) return false;
      if (!los(g.x, g.y, x, y, lv, false)) return false;
      const d = Math.hypot(x - g.x, y - g.y);
      const reach = g.mode === 'hunt' ? HUNT_REACH : TORCH_REACH;
      return d <= reach || state.light[key(x, y, lv)] >= LIT;
    }
    if (flood(g) && lv === 0) {
      if (!inCone(g, x, y, lv, FLOOD_RANGE)) return false;
      return los(g.x, g.y, x, y, 0, true);
    }
    return false;
  }

  function camPoint(c) { return [c.x + 0.5, c.y + 0.5]; }
  function camSees(c, x, y, lv) {
    if (!c.alive || lv !== c.lv) return false;
    const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
    if (d > CAM_RANGE) return false;
    if (d > 0.1 && angDiff(Math.atan2(dy, dx), c.a) > (c.half || CAM_HALF)) return false;
    if (!los(c.x, c.y, x, y, lv, false)) return false;
    return d <= 1.5 || state.light[key(x, y, lv)] >= LIT;
  }

  function watchedAt(x, y, lv) {
    for (const g of state.guards) if (seesTile(g, x, y, lv)) return true;
    for (const c of state.cams) if (camSees(c, x, y, lv)) return true;
    return false;
  }

  // tiles a torch is lighting: you can see what is in them however far off they are
  function computeTorch() {
    const T = state.torch;
    T.fill(0);
    for (const g of state.guards) {
      if (g.down || g.carried) continue;
      const lv = conePlane(g), R = flood(g) ? FLOOD_RANGE : TORCH_REACH, high = flood(g);
      for (let y = Math.floor(g.y - R); y <= Math.ceil(g.y + R); y++) {
        for (let x = Math.floor(g.x - R); x <= Math.ceil(g.x + R); x++) {
          if (!tile(x, y, lv) || (x === g.x && y === g.y)) continue;
          if (!inCone(g, x, y, lv, R)) continue;
          if (!los(g.x, g.y, x, y, lv, high)) continue;
          T[key(x, y, lv)] = 1;
        }
      }
    }
  }

  // the first sight of the man with the card is announced, and where he was last seen is kept
  function hintCard() {
    if (state.hasCard) return;
    const g = state.guards.find((q) => q.card);
    if (!g || state.vis[key(g.x, g.y, g.lv)] !== 2) return;
    state.cardSeenAt = [g.x, g.y, g.lv];
    if (!state.cardHinted && state.mode === 'play') { state.cardHinted = true; on('say', ['That one has the keycard — the cyan card', 'good']); }
  }

  function computeVision() {
    const V = state.vis;
    for (let k = 0; k < N; k++) if (V[k] === 2) V[k] = 1;
    computeTorch();
    const p = state.player;
    const R = state.nv ? SIGHT_NV : SIGHT_DARK;
    seeFrom(p.x, p.y, p.lv, false, R);
    const reg = regionOf(p.x, p.y, p.lv);
    if (reg && reg.open) seeFrom(p.x, p.y, 0, true, R + 2);   // from the tower you look down on the yard
    // an open platform is seen whenever its foot is
    for (const r of UPPER) {
      if (!r.open) continue;
      let any = false;
      for (let y = r.y0 - 1; y <= r.y1 + 1 && !any; y++) {
        for (let x = r.x0 - 1; x <= r.x1 + 1; x++) if (V[key(x, y, 0)] === 2) { any = true; break; }
      }
      if (!any) continue;
      // and so is the structure it stands on
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          if (tile(x, y, r.lv)) V[key(x, y, r.lv)] = 2;
          if (tile(x, y, 0) && tile(x, y, 0).wall) V[key(x, y, 0)] = 2;
        }
      }
    }
    on('fog');
    hintCard();
  }

  function seeFrom(ox, oy, lv, high, R) {
    const V = state.vis;
    for (let y = Math.max(0, oy - SIGHT_MAX); y <= Math.min(H - 1, oy + SIGHT_MAX); y++) {
      for (let x = Math.max(0, ox - SIGHT_MAX); x <= Math.min(W - 1, ox + SIGHT_MAX); x++) {
        if (!tile(x, y, lv)) continue;
        const d = Math.hypot(x - ox, y - oy);
        if (d > SIGHT_MAX) continue;
        const k = key(x, y, lv);
        if (d > 1.5 && !los(ox, oy, x, y, lv, high)) continue;
        if (d <= R || state.light[k] >= SEE_LIGHT || state.torch[k]) V[k] = 2;
      }
    }
  }


  // ---------- the graph ----------
  function passable(x, y, lv, who) {
    const t = tile(x, y, lv);
    if (!t) return false;
    if (t.door) return who === 'guard' || doorOpen(x, y, lv);
    if (t.playerOnly && who !== 'player') return false;
    if (t.guardOnly && who !== 'guard') return false;
    if (t.outside && who === 'guard') return false;
    if (!t.walk) return false;
    if (state.posts.has(key(x, y, lv))) return false;
    return true;
  }

  function neighbours(k, who) {
    const out = [];
    const x = kx(k), y = ky(k), lv = kl(k);
    for (const [dx, dy] of DIRS) if (passable(x + dx, y + dy, lv, who)) out.push(key(x + dx, y + dy, lv));
    const c = ch(x, y, lv);
    if (c === 'S' && ch(x, y, lv + 1) === 's') out.push(key(x, y, lv + 1));
    if (c === 's' && ch(x, y, lv - 1) === 'S') out.push(key(x, y, lv - 1));
    for (const l of LADDERS) {
      if (x === l.top[0] && y === l.top[1] && lv === l.top[2]) out.push(key(l.foot[0], l.foot[1], l.foot[2]));
      if (x === l.foot[0] && y === l.foot[1] && lv === l.foot[2]) out.push(key(l.top[0], l.top[1], l.top[2]));
    }
    return out;
  }

  function stairOther(k) {
    const x = kx(k), y = ky(k), lv = kl(k), c = ch(x, y, lv);
    if (c === 'S' && ch(x, y, lv + 1) === 's') return key(x, y, lv + 1);
    if (c === 's' && ch(x, y, lv - 1) === 'S') return key(x, y, lv - 1);
    return -1;
  }

  function bfs(from, who, maxDepth, blocked) {
    const dist = new Int16Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    dist[from] = 0;
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (dist[c] >= maxDepth) continue;
      for (const n of neighbours(c, who)) {
        if (dist[n] >= 0 || (blocked && blocked.has(n))) continue;
        dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
      }
    }
    return { dist, prev };
  }

  const guardAt = (x, y, lv) => state.guards.find((g) => !g.down && g.x === x && g.y === y && g.lv === lv) || null;
  const bodyAt = (x, y, lv) => state.guards.find((g) => g.down && !g.carried && g.x === x && g.y === y && g.lv === lv) || null;
  const pkey = () => key(state.player.x, state.player.y, state.player.lv);

  // the first step of a guard's shortest path to t, or null
  function nextStep(g, t) {
    const from = key(g.x, g.y, g.lv), to = key(t[0], t[1], t[2] === undefined ? g.lv : t[2]);
    if (from === to) return null;
    const r = bfs(from, 'guard', 400, null);
    if (r.dist[to] < 0) return null;
    let c = to;
    while (r.prev[c] !== from) c = r.prev[c];
    return c;
  }

  // ---------- your move ----------
  /* There are no turns. Nothing moves until you do: every GUARD_EVERY moves
     of yours, the world ticks, each guard takes one step, and the cameras and
     the sentry turn on their own counts. Stand still and the compound waits.
     You can change your mind mid-walk: a new click or key replaces the walk,
     and Space stops it. */
  const canAct = () => !!state && state.mode === 'play';
  const idle = () => canAct() && state.queue.length === 0;
  const ringSize = () => (state.dragging ? RING.drag : state.run ? RING.run : RING.sneak);

  function computeReach() {
    const blocked = new Set(state.guards.filter((g) => !g.down).map((g) => key(g.x, g.y, g.lv)));
    state.reach = bfs(pkey(), 'player', 9999, blocked);
    computeDanger();
  }

  // red on the move grid: tiles near you that someone is watching right now
  function computeDanger() {
    const D = state.danger, r = state.reach, R = ringSize();
    D.fill(0);
    if (!r) return;
    for (let k = 0; k < N; k++) {
      if (r.dist[k] < 0 || r.dist[k] > R) continue;
      if (watchedAt(kx(k), ky(k), kl(k))) D[k] = 1;
    }
  }

  function pathTo(k) {
    const r = state.reach, from = pkey();
    if (!r || r.dist[k] <= 0) return null;
    const path = [];
    for (let c = k; c !== from; c = r.prev[c]) path.push(c);
    return path.reverse();
  }

  // Walking onto stairs takes you up (or down) them.
  function resolveTarget(k) {
    const o = stairOther(k), r = state.reach;
    if (o >= 0 && r && r.dist[o] === r.dist[k] + 1 && k !== pkey()) return o;
    return k;
  }

  function dropMoves() { state.queue = state.queue.filter((q) => q.tag !== 'move'); }

  function cancelMoves() {
    dropMoves();
    state.queue.unshift({ fn: afterAction, delay: 0, tag: 'after' });
    state.skipDelay = true;
  }

  function moveTo(k) {
    if (!canAct()) return false;
    dropMoves();
    computeReach();
    k = resolveTarget(k);
    const path = pathTo(k);
    if (!path) return false;
    state.interrupt = false;
    const t = state.run && !state.dragging ? RUN_T : STEP_T;
    for (const k of path) enqueue(() => walkStep(k), t, 'move');
    enqueue(afterAction, 0, 'move');
    state.aim = null;
    return true;
  }

  /* The tile one grid step in direction d, or -1. At the foot of a ladder, a
     step into the wall climbs it; at the top, a step off the edge climbs down. */
  function stepTarget(d) {
    if (!state.reach) return -1;
    const p = state.player, [dx, dy] = DIRS[d], D = state.reach.dist;
    const nx = p.x + dx, ny = p.y + dy;
    if (inb(nx, ny, p.lv) && D[key(nx, ny, p.lv)] === 1) return key(nx, ny, p.lv);
    for (const l of LADDERS) {
      const [tx, ty, tl] = l.top, [fx, fy, fl] = l.foot;
      if (p.x === fx && p.y === fy && p.lv === fl && nx === tx && ny === ty && D[key(tx, ty, tl)] === 1) return key(tx, ty, tl);
      if (p.x === tx && p.y === ty && p.lv === tl && nx === fx && ny === fy && D[key(fx, fy, fl)] === 1) return key(fx, fy, fl);
    }
    return -1;
  }

  function stepDir(d) {
    if (!canAct() || state.queue.length > 1) return false;   // a held key never runs ahead of the walk
    dropMoves();
    computeReach();
    const p = state.player, [dx, dy] = DIRS[d];
    const k = stepTarget(d);
    if (k < 0) {
      p.face = d;
      if (!guardAt(p.x + dx, p.y + dy, p.lv)) on('say', ['Cannot go that way']);
      return false;
    }
    return moveTo(k);
  }

  /* The arrow keys step along the grid, which on screen runs diagonally: up is
     up-left, right is up-right, down is down-right and left is down-left. */
  const ARROW_DIR = { up: 2, right: 3, down: 0, left: 1 };
  const arrowTarget = (name) => stepTarget(ARROW_DIR[name]);

  // Esc: stop a walk where you are
  function stopWalk() {
    if (canAct() && state.queue.some((q) => q.tag === 'move' && q.fn !== afterAction)) cancelMoves();
  }

  // Space: stay where you are for one move; the guards carry on as if you had stepped
  function stay() {
    if (!canAct()) return false;
    if (state.queue.some((q) => q.tag === 'move' && q.fn !== afterAction)) { cancelMoves(); return true; }
    if (state.queue.length > 1) return false;
    dropMoves();
    enqueue(() => { if (state.mode !== 'play') return; spend(1); afterAction(); }, STEP_T, 'move');
    return true;
  }

  // For tests only: let the world tick once as if you had moved.
  function wait() {
    if (!canAct()) return false;
    enqueue(() => { worldTick(); afterAction(); }, STEP_T, 'move');
    return true;
  }

  // A move of yours: count it, and when enough have gone by the world ticks.
  function spend(n) {
    state.moves++;
    state.pace += n;
    const every = () => (state.alarm ? GUARD_EVERY_ALARM : GUARD_EVERY);
    while (state.pace >= every() - 1e-6 && state.mode === 'play') {
      state.pace -= every();
      worldTick();
    }
  }

  function walkStep(k) {
    if (state.mode !== 'play') return cancelMoves();
    if (!playerStep(k)) return cancelMoves();
    if (state.mode !== 'play') return;
    const stopped = state.interrupt;
    spend(state.dragging ? MOVE_DRAG : state.run ? MOVE_RUN : 1);
    if (state.interrupt || stopped) { state.interrupt = false; cancelMoves(); }
  }

  function playerStep(k) {
    const p = state.player;
    const x = kx(k), y = ky(k), lv = kl(k);
    if (guardAt(x, y, lv)) return false;
    if (lv === p.lv) p.face = dirIndex(x - p.x, y - p.y);
    p.x = x; p.y = y; p.lv = lv;
    state.steps++;
    on('sfx', ['step']);
    if (state.run && !state.dragging) makeNoise(x, y, lv, NOISE_RUN, true);
    pickUp();
    advance();
    computeVision();
    detect();
    checkWin();
    return true;
  }

  function afterAction() {
    if (state.mode !== 'play') return;
    computeVision();
    computeReach();
  }

  /* Anything but a step (a shot, a takedown, a door) also takes a tick. Asked
     for mid-walk, it stops the walk and happens when the step in hand is done. */
  function act(fn) {
    if (!canAct()) return false;
    if (state.queue.length) {
      dropMoves();
      enqueue(() => { if (canAct()) fn(); }, 0, 'act');
      return true;
    }
    return fn();
  }

  function pickUp() {
    const p = state.player;
    const b = bodyAt(p.x, p.y, p.lv);
    if (b && b.card) {
      b.card = false;
      state.hasCard = true;
      fxText(p.x, p.y, p.lv, 'KEYCARD', '#8ff0ff');
      on('say', ['Keycard taken', 'good']);
      on('sfx', ['tone', 880, 0.08, 0.06, 'square']); on('sfx', ['tone', 1320, 0.1, 0.05, 'square', 0.08]);
    }
  }

  function advance() {
    const p = state.player, t = tile(p.x, p.y, p.lv);
    if (state.phase === 'wire' && t && !t.outside && !t.cut) state.phase = 'card';
    if (state.phase === 'card' && state.hasCard) state.phase = 'door';
    if (state.phase === 'door' && state.doorOpened) state.phase = 'terminal';
    if (state.phase === 'terminal' && state.dataDone) state.phase = 'escape';
  }

  function checkWin() {
    const p = state.player, t = tile(p.x, p.y, p.lv);
    if (state.dataDone && t && t.outside) { win(); return true; }
    return false;
  }

  // ---------- actions ----------
  function adjacent(x, y, lv) {
    const p = state.player;
    return lv === p.lv && Math.abs(x - p.x) + Math.abs(y - p.y) === 1;
  }

  // from beside or behind: anywhere he is not facing
  function canTakedown(g) {
    const p = state.player;
    if (g.down || !adjacent(g.x, g.y, g.lv)) return false;
    return angDiff(Math.atan2(p.y - g.y, p.x - g.x), DIR_A[g.face]) > CONE_HALF + 0.01;
  }

  // What Z would do here, in order of how much it matters.
  function contextAction() {
    if (!state || state.mode !== 'play') return null;
    const p = state.player;
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy;
      if (ch(x, y, p.lv) === 'T' && !state.dataDone) return { kind: 'hack', x, y, lv: p.lv, label: 'Z to hack' };
    }
    for (const g of state.guards) if (canTakedown(g)) return { kind: 'takedown', g, x: g.x, y: g.y, lv: g.lv, label: 'Z take down' };
    for (const [dx, dy] of DIRS) {
      const x = p.x + dx, y = p.y + dy;
      if (ch(x, y, p.lv) === 'D' && !doorOpen(x, y, p.lv)) {
        return state.hasCard
          ? { kind: 'door', x, y, lv: p.lv, label: 'Z to open' }
          : { kind: 'locked', x, y, lv: p.lv, label: 'Locked — needs a keycard' };
      }
    }
    if (state.dragging) return { kind: 'drop', x: p.x, y: p.y, lv: p.lv, label: 'Z put him down' };
    let b = bodyAt(p.x, p.y, p.lv);
    if (!b) for (const [dx, dy] of DIRS) { b = bodyAt(p.x + dx, p.y + dy, p.lv); if (b) break; }
    if (b) return { kind: 'drag', g: b, x: b.x, y: b.y, lv: b.lv, label: 'Z drag the body' };
    return null;
  }

  function doAction(a) {
    if (!a || !canAct()) return false;
    if (a.kind === 'locked') { on('say', ['Locked — the patrol carries a keycard']); on('sfx', ['tone', 140, 0.12, 0.05, 'square']); return false; }
    return act(() => doActionNow(a));
  }

  function doActionNow(a) {
    const p = state.player;
    if (a.kind === 'hack') { startHack(); return true; }
    if (a.kind === 'drop') {
      const g = state.dragging;
      if (!g) return false;
      g.x = p.x; g.y = p.y; g.lv = p.lv; g.rx = p.rx; g.ry = p.ry; g.rl = p.rl; g.carried = false;
      state.dragging = null;
      pickUp();
      on('say', ['Put down']);
      computeVision(); detect(); afterAction();
      return true;
    }
    if (a.kind === 'door') {
      state.doors[key(a.x, a.y, a.lv)] = true;
      state.doorOpened = true;
      on('say', ['Service door open', 'good']);
      on('sfx', ['tone', 420, 0.08, 0.05, 'square']); on('sfx', ['tone', 640, 0.12, 0.05, 'square', 0.09]);
      computeLight();
      advance();
    } else if (a.kind === 'takedown') {
      const g = a.g;
      if (!canTakedown(g)) return false;
      g.down = true; g.dead = false; g.mode = 'down'; g.marker = null; g.aiming = false;
      state.takedowns++;
      p.face = dirIndex(g.x - p.x, g.y - p.y);
      on('sfx', ['thud']);
      on('say', [g.card ? 'Out cold. He has a keycard — step over him' : 'Out cold. If they find him they will wake him', 'good']);
    } else if (a.kind === 'drag') {
      state.dragging = a.g; a.g.carried = true;
      on('say', ['Dragging — slow going']);
      state.run = false;
    }
    computeVision();
    detect();
    spend(1);
    afterAction();
    return true;
  }

  // ---------- the pistol ----------
  function targetPos(t) {
    if (t.kind === 'lamp') return lampTile(t.o);
    if (t.kind === 'cam') return [t.o.x, t.o.y, t.o.lv];
    return [t.o.x, t.o.y, t.o.lv];
  }

  function fireCheck(t) {
    const p = state.player;
    const [x, y, lv] = targetPos(t);
    if (t.kind === 'guard' && (t.o.down || t.o.carried)) return 'Already down';
    if ((t.kind === 'lamp' || t.kind === 'cam') && !t.o.alive) return 'Already out';
    if (lv !== p.lv) return 'Not from this floor';
    if (state.vis[key(x, y, lv)] !== 2) return 'Cannot see it';
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > SHOT_RANGE) return 'Out of range';
    if (d > 0.5 && !los(p.x, p.y, x, y, lv, false)) return 'No clear shot';
    if (state.rounds <= 0) return 'Out of rounds';
    return null;
  }

  function targets() {
    const list = [];
    for (const l of state.lamps) if (l.alive) list.push({ kind: 'lamp', o: l });
    for (const c of state.cams) if (c.alive) list.push({ kind: 'cam', o: c });
    for (const g of state.guards) if (!g.down) list.push({ kind: 'guard', o: g });
    const p = state.player;
    return list.filter((t) => !fireCheck(t)).sort((a, b) => {
      const [ax, ay] = targetPos(a), [bx, by] = targetPos(b);
      return Math.hypot(ax - p.x, ay - p.y) - Math.hypot(bx - p.x, by - p.y);
    });
  }

  function fire(t) {
    if (!canAct() || !t) return false;
    const why = fireCheck(t);
    if (why) { on('say', [why]); return false; }
    return act(() => fireNow(t));
  }

  function fireNow(t) {
    if (fireCheck(t)) return false;
    const p = state.player;
    const [x, y, lv] = targetPos(t);
    state.rounds--; state.shots++;
    p.face = dirIndex(x - p.x, y - p.y);
    state.fx.push({ kind: 'tracer', from: [p.x, p.y, p.lv, 22], to: anchor(t), t: 0, life: 0.18, col: '255,236,190' });
    on('sfx', ['shot']);
    if (t.kind === 'lamp') {
      t.o.alive = false;
      on('sfx', ['glass']);
      makeNoise(x, y, lv, NOISE_GLASS, false);
      computeLight();
      on('say', ['Lamp out']);
    } else if (t.kind === 'cam') {
      t.o.alive = false;
      on('sfx', ['glass']);
      on('say', ['Camera down']);
    } else {
      const g = t.o;
      g.down = true; g.dead = true; g.mode = 'down'; g.marker = null; g.aiming = false;
      on('sfx', ['thud']);
      on('say', [g.card ? 'Dead. He has a keycard — and if they find him, the alarm goes up' : 'Dead. If they find him, the alarm goes up', 'good']);
    }
    state.aim = null;
    computeVision();
    detect();
    spend(1);
    afterAction();
    return true;
  }

  function toggleRun() {
    if (!state || state.dragging) { on('say', ['Not while dragging a body']); return; }
    state.run = !state.run;
    if (canAct()) computeReach();
    on('say', [state.run ? 'Running — twice as far, and loud' : 'Sneaking']);
  }

  function toggleNV() {
    if (!state) return;
    if (!state.nv && state.battery < 10) { on('say', ['Goggles flat — let them charge']); return; }
    state.nv = !state.nv;
    on('sfx', ['tone', state.nv ? 1200 : 500, 0.06, 0.04, 'sine']);
    if (state.mode === 'play') { computeVision(); if (canAct()) computeReach(); }
  }

  // ---------- noise ----------
  function makeNoise(x, y, lv, r, steps) {
    state.fx.push({ kind: 'ring', x, y, lv, t: 0, life: 0.9, r });
    let heard = false;
    for (const g of state.guards) {
      if (g.down || g.mode === 'sentry' || g.lv !== lv) continue;
      if (Math.hypot(g.x - x, g.y - y) > r) continue;
      heard = true;
      if (g.mode === 'hunt') { state.lastKnown = [x, y, lv]; continue; }
      g.mode = 'suspect'; g.target = [x, y, lv]; g.marker = '?';
      if (g.x !== x || g.y !== y) g.face = dirIndex(x - g.x, y - g.y);
    }
    if (heard && steps) on('say', ['A guard heard your footsteps']);
    if (heard) computeVision();
  }

  // ---------- being seen ----------
  function detect() {
    if (state.mode !== 'play') return;
    const p = state.player;
    for (const g of state.guards) {
      if (g.down) continue;
      if (seesTile(g, p.x, p.y, p.lv)) spottedBy(g, false);
      for (const b of state.guards) {
        if (!b.down || b.carried || b.found) continue;
        if (seesTile(g, b.x, b.y, b.lv)) foundBody(b, g);
      }
    }
    for (const c of state.cams) {
      if (!c.alive) continue;
      if (camSees(c, p.x, p.y, p.lv)) spottedBy(c, true);
      for (const b of state.guards) {
        if (!b.down || b.carried || b.found) continue;
        if (camSees(c, b.x, b.y, b.lv)) foundBody(b, null);
      }
    }
  }

  /* A killed man found is the alarm. A knocked-out one gets walked over to and
     woken: by the guard who saw him, or, if a camera did, the nearest guard on
     that floor. Neither the finder nor the woken man forgets it in a hurry. */
  function foundBody(b, finder) {
    b.found = true;
    if (b.dead) { raiseAlarm(finder ? 'Body found' : 'Body on camera'); return; }
    let g = finder;
    if (!g) {
      let bd = Infinity;
      for (const q of state.guards) {
        if (q.down || q.lv !== b.lv || q.mode === 'sentry') continue;
        const d = Math.hypot(q.x - b.x, q.y - b.y);
        if (d < bd) { bd = d; g = q; }
      }
    }
    if (!g) { b.found = false; return; }
    if (g.mode !== 'hunt') { g.mode = 'suspect'; g.marker = '?'; }
    g.target = [b.x, b.y, b.lv];
    g.reviving = b.id;
    on('say', ['A guard has found the man you knocked out', 'bad']);
  }

  function spottedBy(src, isCam, loud) {
    const p = state.player;
    state.spotted = true;
    state.interrupt = true;
    if (state.alarm) {
      state.lastKnown = [p.x, p.y, p.lv];
      if (!isCam) { src.mode = 'hunt'; src.marker = '!'; }
      return;
    }
    if (!isCam) {
      src.mode = 'suspect'; src.target = [p.x, p.y, p.lv]; src.marker = '?';
      if (src.x !== p.x || src.y !== p.y) src.face = dirIndex(p.x - src.x, p.y - src.y);
    }
    if (src.saw && !loud) return;       // one jump per watcher per turn
    src.saw = true;
    const d = Math.hypot(src.x - p.x, src.y - p.y);
    const gain = loud ? 50 : isCam ? SEEN_CAM : d <= 1.5 ? 100 : SEEN_GAIN[state.difficulty];
    state.seen = Math.min(100, state.seen + gain);
    fxText(p.x, p.y, p.lv, isCam ? 'CAMERA' : 'SEEN', '#ffd479');
    on('sfx', ['tone', 660, 0.08, 0.05, 'triangle']); on('sfx', ['tone', 990, 0.1, 0.04, 'triangle', 0.07]);
    if (isCam) {
      for (const g of state.guards) {
        if (g.down || g.mode === 'sentry' || g.lv !== src.lv || Math.hypot(g.x - src.x, g.y - src.y) > 9) continue;
        g.mode = 'suspect'; g.target = [p.x, p.y, p.lv]; g.marker = '?';
      }
    }
    if (state.seen >= 100) raiseAlarm('Spotted');
    else on('say', [isCam ? 'A camera saw you' : 'Seen — he is coming to look', 'bad']);
  }

  function raiseAlarm(why) {
    if (state.alarm) return;
    const p = state.player;
    state.alarm = true;
    if (!state.dataDone) state.earlyAlarm = true;
    state.seen = 100;
    state.lastKnown = [p.x, p.y, p.lv];
    for (const g of state.guards) {
      if (g.down) continue;
      g.marker = '!';
      g.mode = 'hunt'; g.target = null;
    }
    state.reinforceIn = REINFORCE_DELAY;
    state.reinforceLeft = REINFORCE[state.difficulty];
    on('say', [why + ' — the alarm is up', 'bad']);
    on('sfx', ['alarm']);
  }

  // ---------- the world's tick ----------
  // each watcher can raise the Seen bar once between ticks, and each hunter fire once a tick
  function tickBegin() {
    for (const g of state.guards) { g.saw = false; g.shot = false; }
    for (const c of state.cams) c.saw = false;
  }

  function worldTick() {
    if (state.mode !== 'play') return;
    state.ticks++;
    for (const g of state.guards) guardStep(g);
    {
      for (const c of state.cams) {
        if (!c.alive || state.ticks % (c.every || CAM_EVERY) !== 0) continue;
        c.t += c.dir;
        if (c.t >= c.steps || c.t <= 0) c.dir = -c.dir;
        c.t = clamp(c.t, 0, c.steps);
        c.a = c.a0 + (c.a1 - c.a0) * (c.t / c.steps);
      }
    }
    if (state.ticks % LOOK_EVERY === 0) {
      for (const g of state.guards) {
        if (g.down || g.mode !== 'sentry') continue;
        g.lookI = (g.lookI + 1) % g.looks.length;
        g.face = g.looks[g.lookI];
      }
    }
    if (state.alarm && state.reinforceLeft > 0) {
      if (state.reinforceIn > 0) state.reinforceIn--;
      else if (!guardAt(GATE.x, GATE.y, GATE.lv)) {
        const g = mkGuard({ x: GATE.x, y: GATE.y, lv: GATE.lv }, state.guards.length);
        // facing in through the gate: its one open side is the yard
        const n = neighbours(key(g.x, g.y, g.lv), 'guard')[0];
        g.mode = 'hunt'; g.marker = '!'; g.route = null;
        if (n !== undefined) g.face = dirIndex(kx(n) - g.x, ky(n) - g.y);
        g.ra = DIR_A[g.face];
        state.guards.push(g);
        state.reinforceLeft--;
        on('say', ['More of them, through the gate', 'bad']);
      }
    }
    if (state.nv) {
      state.battery = Math.max(0, state.battery - NV_DRAIN);
      if (state.battery <= 0) { state.nv = false; on('say', ['Goggles flat']); }
    } else state.battery = Math.min(100, state.battery + NV_CHARGE);
    computeVision();
    detect();
    if (!state.spotted && !state.alarm) state.seen = Math.max(0, state.seen - SEEN_DECAY);
    state.spotted = false;
    const p = state.player;
    for (const g of state.guards) {
      if (!state.alarm && g.marker === '?' && g.mode === 'patrol') g.marker = null;
      if (g.aiming && (g.down || !seesTile(g, p.x, p.y, p.lv))) g.aiming = false;
    }
    tickBegin();
  }

  function guardStep(g) {
    if (g.down) return false;
    const p = state.player;
    /* A hunter who sees you takes aim first — the red line — and fires on his
       next step only if he can still see you. Break his line and he lowers it. */
    if (g.mode === 'hunt') {
      const sees = seesTile(g, p.x, p.y, p.lv);
      if (g.aiming && sees && !g.shot) {
        guardShoots(g);
        g.shot = true;
        return true;
      }
      if (!sees) g.aiming = false;
      else if (!g.aiming) {
        g.aiming = true;
        g.face = dirIndex(p.x - g.x, p.y - g.y);
        if (!state.aimWarned) { on('say', ['He has you in his sights — break his line', 'bad']); state.aimWarned = true; }
        return true;
      }
    }
    if (g.mode === 'sentry') return false;
    const here = (t) => g.x === t[0] && g.y === t[1] && g.lv === (t[2] === undefined ? g.lv : t[2]);
    // the sentry, back up at his post, takes up his sweep again
    if (g.looks && g.mode === 'patrol' && here(g.route[0])) {
      g.mode = 'sentry'; g.marker = null; g.face = g.looks[g.lookI];
      return false;
    }

    if (g.mode === 'patrol') {
      if (g.wait > 0) { g.wait--; return false; }
      const wp = g.route[g.wp];
      if (here(wp)) {
        g.wp = (g.wp + 1) % g.route.length;
        g.wait = CORNER_WAIT;
        const n = nextStep(g, g.route[g.wp]);
        if (n !== null) g.face = dirIndex(kx(n) - g.x, ky(n) - g.y);
        return true;
      }
      return walkToward(g, wp);
    }
    if (g.reviving !== null) {
      const b = state.guards.find((q) => q.id === g.reviving);
      if (!b || !b.down || b.carried) g.reviving = null;
      else if (b.lv === g.lv && Math.abs(b.x - g.x) + Math.abs(b.y - g.y) <= 1) {
        b.down = false; b.found = false; b.mode = state.alarm ? 'hunt' : 'search'; b.look = 4; b.marker = state.alarm ? '!' : '?';
        g.reviving = null;
        if (g.mode !== 'hunt') { g.mode = 'search'; g.look = 3; }
        if (state.vis[key(b.x, b.y, b.lv)] === 2) on('say', ['He has been woken up', 'bad']);
        return true;
      } else return walkToward(g, [b.x, b.y, b.lv]) || true;
    }
    if (g.mode === 'suspect') {
      if (!g.target || here(g.target) || !walkToward(g, g.target)) {
        if (g.target && !here(g.target) && guardBlockedOnly(g, g.target)) return false;
        g.mode = 'search'; g.look = 3;
        return true;
      }
      return true;
    }
    if (g.mode === 'search') {
      g.face = (g.face + 1) % 4;
      if (--g.look <= 0) {
        g.mode = state.alarm ? 'hunt' : 'patrol';
        g.marker = state.alarm ? '!' : null;
        g.target = null;
        if (g.route) g.wp = nearestWaypoint(g);
      }
      return true;
    }
    if (g.mode === 'hunt') {
      const lk = state.lastKnown;
      if (lk && !here(lk) && nextStep(g, lk) !== null) {
        g.target = null;
        return walkToward(g, lk);
      }
      if (lk && here(lk)) state.lastKnown = null;
      if (!g.target || here(g.target) || nextStep(g, g.target) === null) g.target = wanderTarget(g);
      return g.target ? walkToward(g, g.target) : false;
    }
    return false;
  }

  function guardBlockedOnly(g, t) {
    const n = nextStep(g, t);
    return n !== null && !!guardAt(kx(n), ky(n), kl(n));
  }

  function walkToward(g, t) {
    const n = nextStep(g, t);
    if (n === null) return false;
    const x = kx(n), y = ky(n), lv = kl(n), p = state.player;
    if (x === p.x && y === p.y && lv === p.lv) {
      // walked straight into the spy
      g.face = dirIndex(x - g.x, y - g.y);
      g.saw = false;
      spottedBy(g, false);
      if (!state.alarm) { state.seen = 100; raiseAlarm('Walked into you'); }
      return true;
    }
    if (guardAt(x, y, lv)) return false;
    if (lv === g.lv) g.face = dirIndex(x - g.x, y - g.y);
    g.x = x; g.y = y; g.lv = lv;
    return true;
  }

  function nearestWaypoint(g) {
    let best = 0, bd = Infinity;
    g.route.forEach((w, i) => {
      const d = Math.hypot(w[0] - g.x, w[1] - g.y) + (g.lv === (w[2] === undefined ? g.lv : w[2]) ? 0 : 20);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function wanderTarget(g) {
    const r = bfs(key(g.x, g.y, g.lv), 'guard', 6, null);
    const opts = [];
    for (let k = 0; k < N; k++) if (r.dist[k] >= 3) opts.push(k);
    if (!opts.length) return null;
    const k = opts[Math.floor(R() * opts.length)];
    return [kx(k), ky(k), kl(k)];
  }

  function guardShoots(g) {
    const p = state.player;
    g.face = dirIndex(p.x - g.x, p.y - g.y);
    state.hp--;
    state.fx.push({ kind: 'tracer', from: [g.x, g.y, g.lv, 22], to: [p.x, p.y, p.lv, 20], t: 0, life: 0.22, col: '255,120,100' });
    state.fx.push({ kind: 'flash', t: 0, life: 0.35 });
    fxText(p.x, p.y, p.lv, '-1 HP', '#ff7a7a');
    on('sfx', ['shot', true]);
    if (state.hp <= 0) die('Shot on the way out');
    else on('say', ['Hit — one more and you are done', 'bad']);
  }

  // ---------- win, lose, checkpoint ----------
  function die(why) {
    state.mode = 'over';
    state.queue = [];
    state.deathWhy = why;
    on('sfx', ['tone', 110, 0.5, 0.08, 'sawtooth']);
    on('end', false);
  }

  function win() {
    state.mode = 'won';
    state.queue = [];
    const rec = records.load();
    const prev = bestOf(rec, mission, state.difficulty);
    state.newBest = !prev || state.moves < prev;
    if (state.newBest) (rec.best[mission.id] = rec.best[mission.id] || {})[state.difficulty] = state.moves;
    rec.wins = (rec.wins || 0) + 1;
    rec.unlocked = Math.max(rec.unlocked || 1, Math.min(MISSIONS.length, missionI + 2));
    records.write(rec);
    on('sfx', ['tone', 523, 0.12, 0.06, 'triangle']); on('sfx', ['tone', 659, 0.12, 0.06, 'triangle', 0.12]); on('sfx', ['tone', 784, 0.3, 0.06, 'triangle', 0.24]);
    on('end', true);
  }

  const SNAP_KEYS = ['player', 'guards', 'lamps', 'cams', 'doors', 'hp', 'rounds', 'battery', 'seen', 'alarm', 'earlyAlarm',
    'phase', 'hasCard', 'cardSeenAt', 'cardHinted', 'doorOpened', 'dataDone', 'ticks', 'moves', 'pace', 'reinforceIn', 'reinforceLeft', 'nv', 'run', 'lastKnown',
    'shots', 'takedowns', 'steps'];

  function takeCheckpoint() {
    const snap = {};
    SNAP_KEYS.forEach((k) => { snap[k] = state[k]; });
    snap.vis = Array.from(state.vis);
    state.checkpoint = JSON.stringify(snap);
  }

  function restoreCheckpoint() {
    if (!state.checkpoint) return;
    const snap = JSON.parse(state.checkpoint);
    const cp = state.checkpoint;
    SNAP_KEYS.forEach((k) => { state[k] = snap[k]; });
    state.vis = Uint8Array.from(snap.vis);
    state.checkpoint = cp;
    state.dragging = null;
    state.guards.forEach((g) => { g.carried = false; });
    state.mode = 'play'; state.queue = []; state.busy = 0;
    state.hp = Math.max(1, state.hp);
    state.fx = [];
    computeLight();
    computeVision();
    computeReach();
    on('end', null);
    on('say', ['Back at the terminal — get out', 'good']);
  }

  // ---------- the terminal ----------
  function startHack() {
    const k = HACK[state.difficulty];
    state.mode = 'hack';
    state.hack = { round: 0, pos: 0, dir: 1, zone: k.zone, zoneAt: 0.35, speed: k.speed, flash: 0, missed: 0 };
    on('hack', true);
    hackStatus('> KEY 1 / 3', '');
    on('sfx', ['tone', 520, 0.05, 0.05, 'square']);
  }


  // the marker sweeps to and fro across the bar
  function stepHack(dt) {
    const h = state.hack;
    if (!h) return;
    h.pos += h.dir * h.speed * dt;
    if (h.pos > 1) { h.pos = 1; h.dir = -1; }
    if (h.pos < 0) { h.pos = 0; h.dir = 1; }
  }

  function hackPress() {
    if (!state || state.mode !== 'hack') return;
    const h = state.hack, k = HACK[state.difficulty];
    if (h.pos >= h.zoneAt && h.pos <= h.zoneAt + h.zone) {
      h.round++;
      on('sfx', ['tone', 700 + h.round * 140, 0.07, 0.06, 'square']);
      if (h.round >= 3) { finishHack(); return; }
      h.zone *= k.narrow;
      h.speed *= k.quicken;
      h.zoneAt = 0.08 + R() * (0.84 - h.zone);
      hackStatus('> KEY ' + (h.round + 1) + ' / 3', 'good');
    } else {
      h.missed++;
      on('sfx', ['tone', 110, 0.14, 0.06, 'sawtooth']);
      hackStatus('> ACCESS DENIED — KEY ' + (h.round + 1) + ' / 3', 'bad');
      const p = state.player;
      makeNoise(p.x, p.y, p.lv, NOISE_HACK, false);
    }
  }

  const hackStatus = (s, cls) => on('hack-status', [s, cls]);

  function finishHack() {
    state.dataDone = true;
    state.mode = 'play';
    state.hack = null;
    on('hack', false);
    raiseAlarm('Download traced');
    advance();
    takeCheckpoint();
    on('say', ['Data secured — get back to the wire', 'good']);
    afterAction();
  }

  function leaveHack() {
    if (!state || state.mode !== 'hack') return;
    state.mode = 'play';
    state.hack = null;
    on('hack', false);
    afterAction();
  }

  // ---------- the action queue ----------
  /* Everything that happens in a turn is a queue of small steps with a pause
     after each, so the logic moves a tile at a time and the drawing eases after
     it. flush() runs the whole queue at once, for tests. */
  function enqueue(fn, delay, tag) { state.queue.push({ fn, delay, tag }); }

  function pump(dt) {
    if (state.busy > 0) { state.busy -= dt; return; }
    let guard = 0;
    while (state.busy <= 0 && state.queue.length && guard++ < 50) {
      const q = state.queue.shift();
      state.skipDelay = false;
      q.fn();
      if (!state.skipDelay) state.busy += q.delay;
    }
    if (!state.queue.length && state.busy < 0) state.busy = 0;
  }

  function flush() {
    let n = 0;
    while (state.queue.length && n++ < 20000) {
      const q = state.queue.shift();
      q.fn();
    }
    state.busy = 0;
    snapAll();
  }

  function snapAll() {
    const p = state.player;
    p.rx = p.x; p.ry = p.y; p.rl = p.lv;
    for (const g of state.guards) { g.rx = g.x; g.ry = g.y; g.rl = g.lv; g.ra = DIR_A[g.face]; }
    for (const c of state.cams) c.ra = c.a;
  }

  // ---------- messages and effects ----------

  function fxText(x, y, lv, text, col) {
    state.fx.push({ kind: 'text', x, y, lv, text, col, t: 0, life: 1.3 });
  }

  const bestOf = (rec, m, d) => (rec.best[m.id] || {})[d] || null;

  // ---------- starting, and Z ----------
  /* The mission on show (or a fresh one) starts: the rules' half of the title's Go. */
  function begin() {
    if (!state || state.mode !== 'title') newGame(difficulty);
    state.mode = 'play';
    const rec = records.load();
    rec.last = missionI;
    records.write(rec);
    computeVision();
    computeReach();
    on('say', ['Mission ' + (missionI + 1) + ', ' + mission.name + '. ' + PHASES.wire + ' — there is a cut in it just ahead']);
    state.cardHinted = false;
  }

  /* Z: a key at the terminal, back to the checkpoint after a death, or whatever is in reach. */
  function use() {
    if (!state) return false;
    if (state.mode === 'hack') { hackPress(); return true; }
    if (state.mode === 'over' && state.checkpoint) { restoreCheckpoint(); return true; }
    const a = contextAction();
    if (!a) { on('say', ['Nothing to use here']); return false; }
    return doAction(a);
  }


  return {
    begin, use, loadMission, mkGuard, newGame, opaque, losF, lampPoint, computeLight, coneRangeOf, conePlane, inCone, seesTile, camPoint, camSees, watchedAt, computeTorch, hintCard, computeVision, seeFrom, passable, neighbours, stairOther, bfs, nextStep, computeReach, computeDanger, pathTo, resolveTarget, dropMoves, cancelMoves, moveTo, stepTarget, stepDir, stopWalk, stay, wait, spend, walkStep, playerStep, afterAction, act, pickUp, advance, checkWin, adjacent, canTakedown, contextAction, doAction, doActionNow, targetPos, fireCheck, targets, fire, fireNow, toggleRun, toggleNV, makeNoise, detect, foundBody, spottedBy, raiseAlarm, tickBegin, worldTick, guardStep, guardBlockedOnly, walkToward, nearestWaypoint, wanderTarget, guardShoots, die, win, takeCheckpoint, restoreCheckpoint, startHack, stepHack, hackPress, finishHack, leaveHack, enqueue, pump, flush, snapAll, fxText, HW, HH, STOREY, WALL_H, WALL_CUT, SLAB, FENCE_H, RAIL_H, CRATE_H, POST_H, WT, GUARD_EVERY, GUARD_EVERY_ALARM, MOVE_RUN, MOVE_DRAG, STEP_T, RUN_T, CAM_EVERY, LOOK_EVERY, CORNER_WAIT, RING, START_HP, ROUNDS, NV_DRAIN, NV_CHARGE, SIGHT_DARK, SIGHT_NV, SIGHT_MAX, SHOT_RANGE, LAMP_R, LIT, SEE_LIGHT, AMBIENT_OUT, AMBIENT_IN, CONE_HALF, CONE_RANGE, TORCH_REACH, HUNT_REACH, FLOOD_RANGE, CAM_RANGE, CAM_HALF, SEEN_GAIN, SEEN_CAM, SEEN_DECAY, REINFORCE, REINFORCE_DELAY, NOISE_RUN, NOISE_GLASS, NOISE_HACK, HACK, DIRS, DIR_A, PHASES_BASE, MISSIONS, W, H, LV, N, TILE, key, kx, ky, kl, inb, ch, tile, inRegion, regionOf, angDiff, dirIndex, clamp, doorOpen, los, lampTile, flood, guardAt, bodyAt, pkey, canAct, idle, ringSize, ARROW_DIR, arrowTarget, SNAP_KEYS, hackStatus, bestOf,
    get CAMERAS() { return CAMERAS; }, set CAMERAS(v) { CAMERAS = v; },
    get CUT() { return CUT; }, set CUT(v) { CUT = v; },
    get GATE() { return GATE; }, set GATE(v) { GATE = v; },
    get GUARDS() { return GUARDS; }, set GUARDS(v) { GUARDS = v; },
    get LADDERS() { return LADDERS; }, set LADDERS(v) { LADDERS = v; },
    get LAMPS() { return LAMPS; }, set LAMPS(v) { LAMPS = v; },
    get LEVELS() { return LEVELS; }, set LEVELS(v) { LEVELS = v; },
    get PHASES() { return PHASES; }, set PHASES(v) { PHASES = v; },
    get START() { return START; }, set START(v) { START = v; },
    get UPPER() { return UPPER; }, set UPPER(v) { UPPER = v; },
    get difficulty() { return difficulty; }, set difficulty(v) { difficulty = v; },
    get mission() { return mission; }, set mission(v) { mission = v; },
    get missionI() { return missionI; }, set missionI(v) { missionI = v; },
    get state() { return state; }, set state(v) { state = v; },
    seedDice(n) { R = mulberry32(n); },
  };
}
