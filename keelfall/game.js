/* Keelfall — a salvage-colony sim on the wreck of a colony ship.
   The Meridian came down across four terraces of a mountain and tore itself open on
   the way. The nose is your command deck at the top; the engines, the cargo bays and
   the water plant are hundreds of feet below in a jungle that has already grown
   through them. Cut a way down, strip your own ship for timber, scrap and wire,
   catch the runoff before it reaches the toxic basin, decode the data cores, and
   put the beacon back on the peak.
   Flat ground is the scarce thing here: nothing is built until a terrace is level,
   and nobody walks up a step without a stair.
   No build step, no dependencies. */
(() => {
  'use strict';

  // ------------------------------------------------------------ constants
  const TILE = 32;
  const COLS = 44, ROWS = 30;              // the whole mountainside
  let VIEW_W = 26, VIEW_H = 17;            // how much of it fits in the window (set by resize)
  const LEVELS = 4;                        // terraces, 0 (toxic basin) to 3 (the peak)
  const SAVE_KEY = 'keelfall-save-v1';
  const WORK_START = 6, WORK_END = 19;
  const SEC_PER_HOUR_DAY = 4, SEC_PER_HOUR_NIGHT = 1.5;
  const CARRY_CAP = 6;
  const MAX_CREW = 14;
  const BASE_SPEED = 2.4;                  // tiles per second on bare rock at full energy
  const EDGE = 17;                         // band at the canvas edge that pans the camera
  const PAN_SPEED = 13;
  const DEFAULT_ZOOM = 0.8;
  const ZOOM_MIN = 0.5, ZOOM_MAX = 3.5, ZOOM_STEP = 1.25;
  const CRAFT_CAP = 14;                    // how much of one input a workshop will hold
  const GALLEY_CAP = 18;
  const WATER_BASE = 60;                   // water the command deck holds before any cistern
  const CISTERN_ADDS = 60;
  const FORD = 0.3;                        // water deeper than this is not walked through
  const BUILD_WORK = 3.2;                  // crew-seconds to raise one building
  const WET_CAP = 8;                       // water a terrace plot holds

  // What the terraces are made of. Water depth lives in its own array.
  const K = { OPEN: 0, GROWTH: 1, WRECK: 2, VOID: 3 };
  // Wreck flavours: what comes out when it is stripped.
  const W = { HULL: 0, CONDUIT: 1, MAINFRAME: 2 };

  const MATS = {
    timber: { name: 'Timber', color: '#b8813f', blurb: 'Cut out of the growth. Everything early is made of it.' },
    scrap:  { name: 'Scrap', color: '#8d9aa2', blurb: 'Armour plate and structural beam, prised off the hull.' },
    wire:   { name: 'Wire', color: '#cc7a3c', blurb: 'Copper loom out of the conduits. The smelter cannot use it; the machine shop cannot do without it.' },
    alloy:  { name: 'Alloy', color: '#9fd3d8', blurb: 'Scrap run through the arc smelter. Stronger than anything you can cut down.' },
    part:   { name: 'Parts', color: '#e0b45a', blurb: 'Machined fittings. Pumps, filters and the beacon all want them.' },
    core:   { name: 'Data cores', color: '#79d2ff', blurb: 'The ship remembering how it was built. Spent in the data lab on what the crew is allowed to know.' },
    water:  { name: 'Water', color: '#5aa8d8', blurb: 'Clean runoff, caught before it reaches the basin. Drunk by the crew and by every terrace plot.' },
    fern:   { name: 'Ash fern', color: '#8cc76a', food: true, blurb: 'Grows in a day and a bit and asks almost nothing of the tank.' },
    tuber:  { name: 'Tubers', color: '#c8a86a', food: true, blurb: 'Three to a tile, and thirsty with it.' },
    spore:  { name: 'Sporefruit', color: '#c47fd0', food: true, blurb: 'Slow, and it barely drinks. The only thing on the mountain that does not mind the scorch.' },
  };
  const MAT_ORDER = ['timber', 'scrap', 'wire', 'alloy', 'part', 'core', 'water', 'fern', 'tuber', 'spore'];
  const MAT_GROUPS = [
    { name: 'Off the mountain', mats: ['timber', 'scrap', 'wire', 'water'] },
    { name: 'Made here', mats: ['alloy', 'part', 'core'] },
    { name: 'Off the terraces', mats: ['fern', 'tuber', 'spore'] },
  ];
  const isFood = (m) => !!MATS[m].food;

  // Terrace crops. `thirst` is water drawn per hour of growing; `grow` is hours.
  const CROPS = {
    fern:  { name: 'Ash fern', grow: 20, yield: 2, thirst: 0.5, blurb: 'Ready in under a day. Two to a tile and it drinks little — the thing to sow while you are still short of water.' },
    tuber: { name: 'Tubers', grow: 40, yield: 3, thirst: 1.1, blurb: 'Nearly two days, three to a tile, and it will drain a plot dry if the tank is low.' },
    spore: { name: 'Sporefruit', grow: 58, yield: 2, thirst: 0.18, blurb: 'Slowest of the three and almost drinks nothing. Keeps the crew fed straight through the scorch.' },
  };

  // ---------------------------------------------------------------- buildings
  // `craft.from` is a bag of inputs. `draw` is the water works. `cost` is materials.
  const BUILDINGS = {
    deck: {
      name: 'Command deck', w: 4, h: 3, cost: {}, unique: true, store: true,
      blurb: 'The nose cone, wedged into the peak. Everything the crew strips off the mountain is carried up here, and everything they build is carried back down.' },
    bunk: {
      name: 'Bunkhouse', w: 2, h: 2, cost: { timber: 12 }, beds: 2,
      blurb: 'Two bunks out of cut timber. Crew who sleep in one wake up rested; crew who do not, do not.' },
    galley: {
      name: 'Galley', w: 2, h: 2, cost: { timber: 14, scrap: 4 },
      blurb: 'Supper at nineteen hundred. It does not stock itself — somebody walks the food up from the deck.' },
    smelt: {
      name: 'Arc smeltery', w: 3, h: 2, cost: { timber: 10, scrap: 14 }, tech: 'smelting',
      craft: { from: { scrap: 3, timber: 1 }, to: 'alloy', make: 2, time: 3.0, verb: 'Running the arc' },
      blurb: 'Three scrap and a length of timber for the fire make two alloy. Alloy is what lets you build above the treeline.' },
    shop: {
      name: 'Machine shop', w: 3, h: 2, cost: { timber: 12, alloy: 8 }, tech: 'machining',
      craft: { from: { alloy: 2, wire: 2 }, to: 'part', make: 1, time: 3.6, verb: 'At the lathe' },
      blurb: 'Two alloy and two wire make one machined part. Pumps, filters and the beacon are all counted in parts.' },
    lab: {
      name: 'Data lab', w: 2, h: 2, cost: { scrap: 16 }, lab: true,
      craft: { from: { scrap: 10 }, to: 'core', make: 1, time: 8, verb: 'Reading a burnt core' },
      blurb: 'Where the ship is persuaded to remember. Salvaged cores are spent here; ruined ones can be pieced back together out of plate, slowly. It will not touch the wire — the machine shop needs every inch of that.' },
    catch: {
      name: 'Catchment', w: 2, h: 2, cost: { timber: 8 },
      draw: { need: 'clean', rate: 1.8, cap: 18 },
      blurb: 'A timber funnel over standing water. Stand it against clean water on a terrace and it fills; in the rain it fills wherever it is. Everything anybody drinks on this mountain comes through one of these.' },
    cistern: {
      name: 'Cistern', w: 2, h: 2, cost: { timber: 14 }, tech: 'hydro', tank: CISTERN_ADDS,
      blurb: `A timber tank. Holds another ${CISTERN_ADDS} against the scorch, and that is the whole of it — but a colony without one lives eight days at a time.` },
    filter: {
      name: 'Filtration plant', w: 3, h: 2, cost: { alloy: 8, part: 2 }, tech: 'filtration',
      draw: { need: 'toxic', rate: 1.4, cap: 18 },
      blurb: 'Takes the coolant sludge out of basin water. The whole lower basin becomes a reservoir the day this is running.' },
    pump: {
      name: 'Pressure pump', w: 2, h: 2, cost: { alloy: 8, part: 3 }, tech: 'pumps', pump: true,
      blurb: 'Draws from standing water beside it and pushes it one terrace up. Water only ever runs downhill without one.' },
    beacon: {
      name: 'The beacon', w: 3, h: 3, cost: { part: 12, alloy: 12, core: 4 }, tech: 'beaconT', unique: true,
      charge: { from: 'part', per: 2, time: 6, need: 10 },
      blurb: 'The mast off the command tower, re-raised on the peak. It has to stand on the top terrace, and it has to be fed parts until it lights.' },
  };

  const BUILD_ORDER = ['bunk', 'galley', 'smelt', 'shop', 'lab', 'catch', 'cistern', 'filter', 'pump', 'beacon'];
  const costText = (c) => Object.entries(c).map(([m, n]) => `${n} ${MATS[m].name.toLowerCase()}`).join(', ') || 'nothing';
  const costShort = (c) => Object.entries(c).map(([m, n]) => `${n}${m[0]}`).join(' ');

  // --------------------------------------------------------------- the ground
  // Tile work: costs paid out of the deck, and a crew member has to walk over and do it.
  const GROUND = {
    deck:  { name: 'Decking', cost: { timber: 1 }, work: 0.8, speed: 0.55,
      hint: 'Drag a run of decking. Crew move almost twice as fast on it — run it between the deck, the cuts and the terraces.' },
    stair: { name: 'Stair', cost: { timber: 3 }, work: 1.6,
      hint: 'Click a tile that sits one step below its neighbour. Nobody climbs a terrace without one.' },
    plat:  { name: 'Platform', cost: { timber: 4 }, work: 2.0,
      hint: 'Raise a tile one step, to level a terrace off or carry a building out over a drop. Reach it with a stair.' },
    dam:   { name: 'Levee', cost: { timber: 3 }, work: 1.4, tech: 'hydro',
      hint: 'A wall water will not cross and nobody walks through. Pond the runoff on a terrace instead of losing it to the basin.' },
    bridge:{ name: 'Span', cost: { timber: 3, scrap: 2 }, work: 2.2, tech: 'bridging',
      hint: 'Carry a walkway out over the chasm at the level you start from. Drag from solid ground.' },
    lift:  { name: 'Cargo lift', cost: { alloy: 6, part: 2 }, work: 3.0, tech: 'lift',
      hint: 'A shaft that stands at every level at once. Put one where the mountain is steepest and the hauling stops being a climb.' },
  };
  const PLOT_COST = { timber: 2 };

  // ------------------------------------------------------------------- tools
  const TOOLS = [
    { id: 'select', label: 'Look', hint: 'Click a crew member, a building, a terrace plot or a piece of the wreck to see what it is.' },
    { id: 'cut', label: 'Cut', hint: 'Drag over the growth to mark it for cutting. Every tile cut comes back as timber.' },
    { id: 'salvage', label: 'Salvage', hint: 'Drag over the wreck to mark it for stripping. Hull gives scrap, conduit gives wire, and the mainframes give data cores.' },
    { id: 'plot', label: 'Terrace', cost: costShort(PLOT_COST) + '/tile', hint: 'Drag out a terrace plot on level ground. Click it afterwards to choose what goes in it.' },
    { id: 'deck', label: 'Decking', cost: costShort(GROUND.deck.cost) + '/tile', hint: GROUND.deck.hint },
    { id: 'stair', label: 'Stair', cost: costShort(GROUND.stair.cost), hint: GROUND.stair.hint },
    { id: 'plat', label: 'Platform', cost: costShort(GROUND.plat.cost), hint: GROUND.plat.hint },
    { id: 'bridge', label: 'Span', cost: costShort(GROUND.bridge.cost) + '/tile', hint: GROUND.bridge.hint },
    { id: 'dam', label: 'Levee', cost: costShort(GROUND.dam.cost) + '/tile', hint: GROUND.dam.hint },
    { id: 'lift', label: 'Lift', cost: costShort(GROUND.lift.cost), hint: GROUND.lift.hint },
    { id: 'bunk', label: 'Bunkhouse', cost: costShort(BUILDINGS.bunk.cost), hint: 'Two bunks. Crew without one sleep on the deck plates and wake up slow.' },
    { id: 'galley', label: 'Galley', cost: costShort(BUILDINGS.galley.cost), hint: 'Supper every evening — but somebody has to carry the food up to it.' },
    { id: 'smelt', label: 'Smeltery', cost: costShort(BUILDINGS.smelt.cost), hint: 'Scrap and timber in, alloy out.' },
    { id: 'shop', label: 'Machine shop', cost: costShort(BUILDINGS.shop.cost), hint: 'Alloy and wire in, machined parts out.' },
    { id: 'lab', label: 'Data lab', cost: costShort(BUILDINGS.lab.cost), hint: 'Where cores are spent on what the crew knows how to build.' },
    { id: 'catch', label: 'Catchment', cost: costShort(BUILDINGS.catch.cost), hint: 'Stand it against clean standing water on a terrace — the wet ground below the coolant tank will do. It is the only way water reaches the tank.' },
    { id: 'cistern', label: 'Cistern', cost: costShort(BUILDINGS.cistern.cost), hint: 'More room in the tank. Build these during the runoff and fill them — not during the scorch, when there is nothing to put in them.' },
    { id: 'filter', label: 'Filter', cost: costShort(BUILDINGS.filter.cost), hint: 'Stand it against the basin. Turns the sludge down there into water you can drink.' },
    { id: 'pump', label: 'Pump', cost: costShort(BUILDINGS.pump.cost), hint: 'Stand it beside standing water. It pushes water one terrace uphill.' },
    { id: 'beacon', label: 'Beacon', cost: costShort(BUILDINGS.beacon.cost), hint: 'Three by three, on the top terrace, and then it wants feeding with parts.' },
    { id: 'demolish', label: 'Clear', hint: 'Take away a building, a plot, decking, a stair or a platform. Half the materials come back. It also unmarks anything marked.' },
    { id: 'move', label: 'Move', hidden: true, hint: 'Click where the building should stand. Escape leaves it where it is.' },
  ];
  const TOOL_GROUPS = [
    { name: 'The wreck', tools: ['select', 'cut', 'salvage'] },
    { name: 'Ground', tools: ['deck', 'stair', 'plat', 'bridge', 'lift'] },
    { name: 'Colony', tools: ['bunk', 'galley', 'plot'] },
    { name: 'Works', tools: ['smelt', 'shop', 'lab'] },
    { name: 'Water', tools: ['catch', 'cistern', 'dam', 'pump', 'filter'] },
    { name: '', tools: ['beacon', 'demolish'] },
  ];

  // ------------------------------------------------------------ what is known
  // Cores are spent here. Everything with a `tech` field above is locked until its
  // entry is bought, and nothing is ever a dead end — the lab can rebuild cores out
  // of wire and plate if the mainframes on the mountain run out.
  const TECH = {
    rigs:       { name: 'Salvage rigs', cost: 2, blurb: 'Harnesses, winches and a proper saw. Cutting and stripping go half again as fast.' },
    bridging:   { name: 'Span kit', cost: 2, blurb: 'Unlocks the span — a walkway out over the chasm.' },
    hydro:      { name: 'Hydrology', cost: 3, blurb: 'Unlocks the cistern and the levee — somewhere to keep water, and a wall to stop it reaching the basin. Without it the colony lives eight days at a time.' },
    smelting:   { name: 'Arc smelting', cost: 3, blurb: 'Unlocks the smeltery: scrap and timber into alloy.' },
    machining:  { name: 'Machining', cost: 4, needs: ['smelting'], blurb: 'Unlocks the machine shop: alloy and wire into parts.' },
    scaffold:   { name: 'Metal scaffold', cost: 3, needs: ['smelting'], blurb: 'Platforms can be stacked two high, at the cost of alloy in the upper one.' },
    pumps:      { name: 'Pressure pumps', cost: 4, needs: ['hydro', 'machining'], blurb: 'Unlocks the pump. Water can be made to run uphill.' },
    filtration: { name: 'Filtration', cost: 4, needs: ['machining'], blurb: 'Unlocks the filtration plant, and with it the whole toxic basin.' },
    lift:       { name: 'Cargo lift', cost: 4, needs: ['machining'], blurb: 'Unlocks the lift: one tile that stands at every level at once.' },
    beaconT:    { name: 'Beacon schematics', cost: 6, needs: ['machining'], blurb: 'The mast, the mounting and the firing order. Unlocks the beacon, and the way off this mountain.' },
  };
  const TECH_ORDER = ['rigs', 'bridging', 'hydro', 'smelting', 'machining', 'scaffold', 'pumps', 'filtration', 'lift', 'beaconT'];

  // ------------------------------------------------------------ the year
  const DAYS_PER_SEASON = 8;
  const SEASONS = [
    { id: 'runoff', name: 'Runoff', grow: 1.15, spring: 1.6, evap: 0.0,
      note: 'The melt is coming off the peak and the coolant tank is weeping with it. Everything grows, and everything floods.' },
    { id: 'green', name: 'Green', grow: 1.0, spring: 0.55, evap: 0.03,
      note: 'The springs are down to a trickle and the growing is easy. This is the season you build in.' },
    { id: 'scorch', name: 'Scorch', grow: 0.75, spring: 0, evap: 0.16,
      note: 'Nothing comes off the peak and the terraces are drying out. Whatever is in the tank is what the colony has.' },
  ];
  const seasonIx = (day) => Math.floor((day - 1) / DAYS_PER_SEASON) % SEASONS.length;
  const seasonOf = (day) => SEASONS[seasonIx(day)];
  const dayOfSeason = (day) => ((day - 1) % DAYS_PER_SEASON) + 1;
  const yearOf = (day) => Math.floor((day - 1) / (DAYS_PER_SEASON * SEASONS.length)) + 1;

  const WEATHER = {
    clear: { id: 'clear', name: 'Clear', w: 5, grow: 1.0, work: 1.0, rain: 0, note: 'Clear over the peak.' },
    haze:  { id: 'haze', name: 'Spore haze', w: 3, grow: 0.85, work: 0.92, rain: 0, note: 'Spore haze in the ravine. Slow going, and the ferns sulk.' },
    rain:  { id: 'rain', name: 'Rain', w: 3, grow: 1.2, work: 0.9, rain: 0.9, note: 'Rain on the hull all day. The catchments fill themselves.' },
    storm: { id: 'storm', name: 'Storm', w: 1.4, grow: 1.1, work: 0.62, rain: 1.9, note: 'A storm off the ridge. Nobody wants to be out on a span in it.' },
    ash:   { id: 'ash', name: 'Ashfall', w: 1.2, grow: 0.5, work: 0.85, rain: 0, note: 'Ash on the terraces. Very little is going to grow through that.' },
  };
  const WEATHER_ORDER = ['clear', 'haze', 'rain', 'storm', 'ash'];
  function rollWeather() {
    const sn = seasonOf(S.day).id;
    let total = 0;
    const pool = WEATHER_ORDER.map((id) => {
      const w = WEATHER[id];
      let n = w.w;
      if (sn === 'runoff' && (id === 'rain' || id === 'storm')) n *= 2.4;
      if (sn === 'scorch' && (id === 'rain' || id === 'storm')) n *= 0.18;
      if (sn === 'scorch' && (id === 'clear' || id === 'ash')) n *= 1.8;
      total += n;
      return { id, n };
    });
    let r = Math.random() * total;
    for (const p of pool) { r -= p.n; if (r <= 0) { S.weather = p.id; return; } }
    S.weather = 'clear';
  }
  const weatherOf = () => WEATHER[S.weather] || WEATHER.clear;
  const isDay = () => S.hour >= WORK_START && S.hour < WORK_END;
  const workRate = () => weatherOf().work;
  const growthRate = () => seasonOf(S.day).grow * weatherOf().grow;

  const NAMES = ['Vey', 'Coro', 'Jax', 'Nim', 'Sable', 'Ost', 'Rhen', 'Tarn', 'Wick', 'Ilm', 'Brask', 'Nuray', 'Sefa', 'Oda', 'Kessel', 'Pell', 'Yarrow', 'Fen', 'Mira', 'Dov', 'Halka', 'Esk'];
  const SUITS = ['#c9613f', '#3f8fb0', '#c2923a', '#5f9c6a', '#8b6fb0', '#c06a86', '#4fa79c', '#a3603a'];
  const HAIRS = ['#2b2118', '#6b4527', '#b08a4a', '#4a3a30', '#8a5a3a', '#26262c'];
  const GEAR = ['goggles', 'goggles', 'hood', 'none'];

  // ------------------------------------------------------------ state
  let S = null;           // saved game state
  const CLAIMS = {};      // task key -> crew id (transient)
  const BLOCKED = {};     // task key -> game hour to stop trying (transient)
  const UI = {
    tool: 'select', sel: null, drag: null, hover: null, speed: 1, panelKey: '', structure: 0,
    moving: null, cam: { x: 0, y: 0 }, mouse: null, edge: null, panning: false, keyPan: { x: 0, y: 0 },
    ledger: false, ledgerKey: '', noticeKey: '', noticeShut: false, zoom: DEFAULT_ZOOM,
    labKey: '', showLevels: false,
  };

  const N_TILES = COLS * ROWS;
  const idx = (x, y) => y * COLS + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
  const camMaxX = () => Math.max(0, COLS - VIEW_W);
  const camMaxY = () => Math.max(0, ROWS - VIEW_H);
  const camOx = () => Math.round(UI.cam.x * TILE);
  const camOy = () => Math.round(UI.cam.y * TILE);
  const known = (t) => !t || !!(S.tech && S.tech[t]);

  // ------------------------------------------------------ levels and walking
  // Every tile stands at exactly one level, except a stair, which stands at two, and a
  // lift, which stands at all of them. Two tiles are only connected if the levels they
  // stand at overlap — which is the whole of the mountain, as a rule.
  const gDone = (i) => S.ground[i] && S.gwork[i] <= 0;
  function baseLvl(x, y) {
    const i = idx(x, y);
    if (S.kind[i] === K.VOID) return S.blvl[i];
    return S.lvl[i] + (gDone(i) && S.ground[i] === 'plat' ? S.plat[i] : 0);
  }
  function loLvl(x, y) {
    const i = idx(x, y);
    return gDone(i) && S.ground[i] === 'lift' ? 0 : baseLvl(x, y);
  }
  function hiLvl(x, y) {
    const i = idx(x, y);
    if (gDone(i) && S.ground[i] === 'lift') return LEVELS - 1;
    return baseLvl(x, y) + (gDone(i) && S.ground[i] === 'stair' ? 1 : 0);
  }
  // Do the two tiles share a level? Intervals, so a stair reaches up and a lift reaches all.
  function linked(ax, ay, bx, by) {
    return Math.max(loLvl(ax, ay), loLvl(bx, by)) <= Math.min(hiLvl(ax, ay), hiLvl(bx, by));
  }

  // `wade` is the last resort: a route that goes through standing water the crew would
  // normally walk round. A pond that rises across the only path out would otherwise leave
  // somebody cut off from the deck for good, and the colony stops without saying why.
  function walkable(x, y, wade) {
    if (!inb(x, y)) return false;
    const i = idx(x, y);
    if (S.occ[i]) return false;
    const k = S.kind[i];
    if (k === K.GROWTH || k === K.WRECK) return false;
    if (k === K.VOID) return S.ground[i] === 'bridge' && S.gwork[i] <= 0;
    if (S.ground[i] === 'dam' && S.gwork[i] <= 0) return false;
    if (!wade && S.water[i] > FORD) return false;
    return true;
  }
  // Decking is quick underfoot; a lift shaft quicker still; wading is slow.
  function tileCost(x, y) {
    const i = idx(x, y);
    if (gDone(i)) {
      if (S.ground[i] === 'deck' || S.ground[i] === 'bridge') return 0.55;
      if (S.ground[i] === 'lift') return 0.4;
      if (S.ground[i] === 'stair') return 0.9;
    }
    if (S.water[i] > FORD) return 3.4;      // chest deep, and they are carrying something
    if (S.water[i] > 0.05) return 1.9;
    if (S.plots[i]) return 1.15;
    return 1;
  }

  // ------------------------------------------------------- the mountainside
  // Four terraces stacked up the screen, a chasm through the middle of them, the ship
  // laid diagonally across the lot, and a jungle that has had a long time to get into it.
  function wobble(seedA, seedB) {
    return (x) => Math.sin(x * 0.31 + seedA) * 1.9 + Math.sin(x * 0.11 + seedB) * 2.6;
  }

  function generate() {
    const lvl = new Array(N_TILES).fill(0);
    const kind = new Array(N_TILES).fill(K.OPEN);
    const wtype = new Array(N_TILES).fill(0);
    const hp = new Array(N_TILES).fill(0);
    // No terrace is truly level. A fifth of a step of slope, smooth enough to read as one
    // surface and uneven enough that runoff picks a line down it and pools at the bottom.
    const tilt = new Array(N_TILES).fill(0);
    const ta = Math.random() * 9, tb = Math.random() * 9, tc = Math.random() * 9;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const a = Math.sin(x * 0.27 + ta) * Math.sin(y * 0.31 + tb);
      const b = Math.sin(x * 0.11 + tc) * Math.cos(y * 0.13 + ta);
      tilt[idx(x, y)] = 0.09 * (a * 0.5 + 0.5) + 0.07 * (b * 0.5 + 0.5) + 0.06 * (1 - y / ROWS);
    }

    // terraces: level 3 along the top, dropping to the basin at the bottom
    const edges = [];
    for (let l = 1; l < LEVELS; l++) {
      const base = ROWS * (LEVELS - l) / LEVELS;
      edges.push({ l, f: wobble(Math.random() * 9, Math.random() * 9), base });
    }
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        let v = 0;
        for (const e of edges) if (y < e.base + e.f(x)) v = e.l;
        lvl[idx(x, y)] = v;
      }
    }

    // the chasm — a rift running down the mountain, wandering as it goes
    const cx0 = 9 + Math.floor(Math.random() * (COLS - 20));
    const cf = wobble(Math.random() * 9, Math.random() * 9);
    for (let y = 2; y < ROWS - 2; y++) {
      const cx = Math.round(cx0 + cf(y * 1.4));
      const halfW = y < ROWS * 0.4 ? 1 : 1 + (y % 3 === 0 ? 1 : 0);
      for (let x = cx - halfW; x <= cx + halfW; x++) {
        if (!inb(x, y) || lvl[idx(x, y)] < 1) continue;   // it opens out into the basin
        kind[idx(x, y)] = K.VOID;
      }
    }

    // the Meridian, strewn from the peak down into the ravine
    const shipPts = [];
    let sx = 4 + Math.random() * 6, sy = 2 + Math.random() * 2;
    for (let i = 0; i < 26; i++) {
      shipPts.push({ x: sx, y: sy });
      sx += 1.25 + Math.random() * 0.5;
      sy += 0.95 + Math.random() * 0.4;
      if (sx > COLS - 4) sx = COLS - 4;
    }
    const wreckAt = (x, y, t) => {
      if (!inb(x, y) || kind[idx(x, y)] === K.VOID) return;
      kind[idx(x, y)] = K.WRECK; wtype[idx(x, y)] = t;
    };
    shipPts.forEach((p, i) => {
      const r = i < 3 ? 1.6 : 1.1 + Math.random() * 1.3;
      const t = i < 4 ? W.HULL : (i % 3 === 1 ? W.CONDUIT : W.HULL);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx, dy) > r) continue;
        wreckAt(Math.round(p.x) + dx, Math.round(p.y) + dy, t);
      }
    });
    // and the mainframes, in the bays that are still sealed
    let mains = 0;
    for (let i = shipPts.length - 1; i >= 4 && mains < 5; i--) {
      if (i % 4) continue;
      const p = shipPts[i];
      const x = Math.round(p.x), y = Math.round(p.y);
      if (!inb(x, y) || kind[idx(x, y)] !== K.WRECK) continue;
      wtype[idx(x, y)] = W.MAINFRAME; mains++;
    }

    // the jungle, thickest in the ravine and thinning towards the peak
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = idx(x, y);
        if (kind[i] !== K.OPEN) continue;
        const l = lvl[i];
        const p = l === 0 ? 0.5 : l === 1 ? 0.42 : l === 2 ? 0.26 : 0.1;
        if (Math.random() < p) kind[i] = K.GROWTH;
      }
    }
    // thin it out again so it grows in clumps rather than a fog
    for (let pass = 0; pass < 2; pass++) {
      const copy = kind.slice();
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        const i = idx(x, y);
        if (copy[i] !== K.GROWTH && copy[i] !== K.OPEN) continue;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (copy[idx(x + dx, y + dy)] === K.GROWTH) n++;
        if (copy[i] === K.GROWTH && n === 0) kind[i] = K.OPEN;
        else if (copy[i] === K.OPEN && n >= 3 && Math.random() < 0.5) kind[i] = K.GROWTH;
      }
    }

    // ledges: wherever one terrace meets the next, leave a few places clear on both
    // sides of the step, so there is always somewhere a stair could go
    for (let n = 0; n < 40; n++) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      for (let y = 1; y < ROWS - 1; y++) {
        const a = idx(x, y), b = idx(x, y + 1);
        if (lvl[a] === lvl[b] + 1 && kind[a] !== K.VOID && kind[b] !== K.VOID) {
          for (const j of [a, b, idx(x, y - 1), idx(x, y + 2)]) {
            if (kind[j] === K.GROWTH) kind[j] = K.OPEN;
          }
          break;
        }
      }
    }

    // work left in every tile that has to be taken apart
    for (let i = 0; i < N_TILES; i++) {
      if (kind[i] === K.GROWTH) hp[i] = 2.6 + Math.random() * 1.6;
      else if (kind[i] === K.WRECK) hp[i] = wtype[i] === W.MAINFRAME ? 7 : 3.4 + Math.random() * 2.2;
    }
    return { lvl, kind, wtype, hp, tilt };
  }

  // A flat, clear 4x3 up on the peak for the nose cone to sit in.
  function deckSpot(lvl, kind) {
    let best = null;
    for (let y = 0; y < ROWS - 3; y++) for (let x = 0; x < COLS - 4; x++) {
      let ok = true, l = lvl[idx(x, y)];
      if (l !== LEVELS - 1) continue;
      for (let dy = -1; dy <= 3 && ok; dy++) for (let dx = -1; dx <= 4 && ok; dx++) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) { if (dx >= 0 && dx < 4 && dy >= 0 && dy < 3) ok = false; continue; }
        const i = idx(nx, ny);
        const core = dx >= 0 && dx < 4 && dy >= 0 && dy < 3;
        if (core && (lvl[i] !== l || kind[i] === K.VOID)) ok = false;
        if (!core && kind[i] === K.VOID) ok = false;
      }
      if (!ok) continue;
      const score = y * 2 + Math.abs(x - COLS / 2) * 0.4;
      if (!best || score < best.score) best = { x, y, score };
    }
    return best || { x: 3, y: 1 };
  }

  function newState() {
    let g, spot;
    // Very occasionally the peak comes out with nowhere to stand. Roll again.
    for (let attempt = 0; attempt < 12; attempt++) {
      g = generate();
      spot = deckSpot(g.lvl, g.kind);
      if (spot.score !== undefined) break;
    }
    const st = {
      day: 1, hour: WORK_START, nextId: 1,
      lvl: g.lvl, kind: g.kind, wtype: g.wtype, hp: g.hp, tilt: g.tilt,
      mark: new Array(N_TILES).fill(0),
      ground: new Array(N_TILES).fill(null),
      gwork: new Array(N_TILES).fill(0),
      plat: new Array(N_TILES).fill(0),
      blvl: new Array(N_TILES).fill(0),
      water: new Array(N_TILES).fill(0),
      occ: new Array(N_TILES).fill(0),
      plots: new Array(N_TILES).fill(null),
      fields: [], buildings: [], crew: [],
      store: {}, tech: {}, springs: [], seeps: [],
      log: [], won: false, notice: null, weather: 'clear',
      lit: 0, cut: 0, stripped: 0, hungerWarned: false, dryWarned: false,
    };
    for (const m of MAT_ORDER) st.store[m] = 0;
    S = st;
    // what came down with them
    S.store.timber = 26; S.store.scrap = 14; S.store.wire = 6; S.store.water = 26;
    S.store.fern = 8;

    // clear the peak and set the nose cone into it
    for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 4; dx++) {
      const x = spot.x + dx, y = spot.y + dy;
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (S.kind[i] === K.GROWTH || S.kind[i] === K.WRECK) { S.kind[i] = K.OPEN; S.hp[i] = 0; }
    }
    CAMP_X = spot.x + 2; CAMP_Y = spot.y + 3;
    const deck = { id: S.nextId++, type: 'deck', x: spot.x, y: spot.y, w: 4, h: 3, built: true, work: 0, in: {}, made: 0, ready: 0, stock: 0, residents: [], worker: null, charge: 0 };
    S.buildings.push(deck);
    stamp(deck, deck.id);

    // the coolant tank, weeping on the peak
    const springs = [];
    for (let tries = 0; tries < 300 && springs.length < 2; tries++) {
      const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * 6);
      const i = idx(x, y);
      if (S.lvl[i] !== LEVELS - 1 || S.kind[i] === K.VOID || S.occ[i]) continue;
      if (springs.some((s) => Math.abs(s.x - x) < 6)) continue;
      if (S.kind[i] === K.GROWTH || S.kind[i] === K.WRECK) { S.kind[i] = K.OPEN; S.hp[i] = 0; }
      springs.push({ x, y });
    }
    S.springs = springs;

    // the drive, down in the basin, still leaking whatever it was cooled with
    const seeps = [];
    for (let tries = 0; tries < 600 && seeps.length < 3; tries++) {
      const x = Math.floor(Math.random() * COLS), y = ROWS - 1 - Math.floor(Math.random() * 6);
      const i = idx(x, y);
      if (!inb(x, y) || S.lvl[i] !== 0 || S.kind[i] === K.VOID || S.occ[i]) continue;
      if (seeps.some((s) => Math.abs(s.x - x) < 7)) continue;
      if (S.kind[i] === K.GROWTH || S.kind[i] === K.WRECK) { S.kind[i] = K.OPEN; S.hp[i] = 0; }
      seeps.push({ x, y });
    }
    S.seeps = seeps;

    // and the basin, already full of what came out of it
    for (let i = 0; i < N_TILES; i++) {
      if (S.lvl[i] === 0 && S.kind[i] !== K.VOID) S.water[i] = 0.75 + Math.random() * 0.5;
    }

    openUp();

    const cx = spot.x + 2, cy = spot.y + 3;
    for (let i = 0; i < 3; i++) {
      const p = nearestWalkable(cx + i - 1, cy);
      addCrew(p.x + 0.5, p.y + 0.5);
    }
    log('The Meridian is down. Three of you walked out of the nose cone; the rest of the ship is somewhere below you, in the trees.');
    centreCamera(spot.x + 2, spot.y + 4);
    rollWeather();
    rollNotice();
    return st;
  }

  // Some mountains come down with the nose cone wedged in a pocket barely bigger than
  // itself, and a colony cannot cut, build or stand anywhere from there. So the crash site
  // is made workable: first enough room to move, then a guarantee that there is actually
  // something within reach to cut and something to strip. Clearing an apron alone was not
  // enough — it took away the very growth the first day's timber has to come from.
  function reachCount(reach) {
    let n = 0;
    for (let i = 0; i < N_TILES; i++) if (reach[i]) n++;
    return n;
  }
  // Every blocked tile jammed against ground the crew can stand on, at a level they share.
  function rimTiles(reach) {
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y);
      if (S.kind[i] !== K.GROWTH && S.kind[i] !== K.WRECK) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny) || !reach[idx(nx, ny)] || !linked(x, y, nx, ny)) continue;
        out.push(i);
        break;
      }
    }
    return out;
  }
  function openUp(want) {
    const target = want || 150;
    // If the nose cone came to rest fully enclosed there is no reachable ground to grow an
    // apron out from, and everything below would find nothing to do. Clear its doorstep
    // first, so there is always something to start from.
    const deck = deckB();
    if (deck) {
      for (let x = deck.x - 1; x <= deck.x + deck.w; x++) for (let y = deck.y - 1; y <= deck.y + deck.h; y++) {
        if (!inb(x, y)) continue;
        const inside = x >= deck.x && x < deck.x + deck.w && y >= deck.y && y < deck.y + deck.h;
        if (inside) continue;
        const i = idx(x, y);
        if (S.kind[i] === K.GROWTH || S.kind[i] === K.WRECK) { S.kind[i] = K.OPEN; S.hp[i] = 0; }
      }
    }
    for (let pass = 0; pass < 260; pass++) {
      const reach = reachable();
      if (reachCount(reach) >= target) break;
      const rim = rimTiles(reach);
      if (!rim.length) break;
      // shift whatever is nearest the deck, growth before wreck: the wreck is finite
      let best = -1, bestScore = Infinity;
      for (const i of rim) {
        const x = i % COLS, y = Math.floor(i / COLS);
        const score = (S.kind[i] === K.GROWTH ? 0 : 60) + Math.abs(x - CAMP_X) + Math.abs(y - CAMP_Y);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best < 0) break;
      S.kind[best] = K.OPEN; S.hp[best] = 0;
    }
    seedStart();
  }
  // ...and then put back enough to work with, on the rim, where the crew can get at it.
  // Done one tile at a time and re-checked each pass, because a tile of growth or wreck is
  // itself an obstacle: seeding a whole apron in one go can wall off the far half of it and
  // leave the counts looking fine while nothing is actually within reach any more.
  function seedStart() {
    const WANT_GROWTH = 20, WANT_WRECK = 14;
    for (let pass = 0; pass < 80; pass++) {
      const reach = reachable();
      let growth = 0, wreck = 0;
      for (const i of rimTiles(reach)) {
        if (S.kind[i] === K.GROWTH) growth++; else wreck++;
      }
      const needWreck = wreck < WANT_WRECK, needGrowth = growth < WANT_GROWTH;
      if (!needWreck && !needGrowth) return;

      // somewhere open on the rim with room around it, so putting something there cannot
      // cut anybody off from the rest of the mountain
      let best = -1;
      for (let tries = 0; tries < 400 && best < 0; tries++) {
        const i = Math.floor(Math.random() * N_TILES);
        if (S.kind[i] !== K.OPEN || S.occ[i] || S.ground[i] || S.plots[i]) continue;
        if (S.water[i] > 0.05 || !reach[i]) continue;
        const x = i % COLS, y = Math.floor(i / COLS);
        if (Math.abs(x - CAMP_X) + Math.abs(y - CAMP_Y) < 3) continue;
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (walkable(x + dx, y + dy) && linked(x, y, x + dx, y + dy)) open++;
        }
        if (open < 3) continue;
        best = i;
      }
      if (best < 0) return;                     // nowhere sensible left; take what there is

      const before = reachCount(reach);
      if (needWreck) {
        S.kind[best] = K.WRECK;
        S.wtype[best] = wreck % 4 === 1 ? W.CONDUIT : W.HULL;
        S.hp[best] = 3.2 + Math.random() * 2;
      } else {
        S.kind[best] = K.GROWTH;
        S.hp[best] = 2.4 + Math.random() * 1.4;
      }
      if (before - reachCount(reachable()) > 1) { S.kind[best] = K.OPEN; S.hp[best] = 0; }
    }
  }

  let CAMP_X = 0, CAMP_Y = 0;

  function stamp(b, v) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (inb(x, y)) S.occ[idx(x, y)] = v;
    }
  }

  function addCrew(px, py) {
    const used = new Set(S.crew.map((c) => c.name));
    const free = NAMES.filter((n) => !used.has(n));
    const c = {
      id: S.nextId++, name: free.length ? rnd(free) : 'Crew', suit: rnd(SUITS),
      hair: rnd(HAIRS), gear: rnd(GEAR),
      px, py, face: 1, energy: 80, hunger: 0, home: null, task: null, path: null, carry: null,
      sleeping: false, hidden: false, inBed: false, days: 0, slot: null,
    };
    S.crew.push(c);
    return c;
  }

  function log(text, kind) {
    S.log.unshift({ day: S.day, text, kind: kind || '' });
    if (S.log.length > 30) S.log.length = 30;
    UI.structure++;
  }

  // ------------------------------------------------------------ helpers
  const building = (id) => S.buildings.find((b) => b.id === id);
  const fieldOf = (id) => S.fields.find((f) => f.id === id);
  const firstOf = (type) => S.buildings.find((b) => b.type === type && b.built);
  const anyOf = (type) => S.buildings.find((b) => b.type === type);
  const deckB = () => S.buildings.find((b) => b.type === 'deck');
  const tileOf = (c) => ({ x: clamp(Math.floor(c.px), 0, COLS - 1), y: clamp(Math.floor(c.py), 0, ROWS - 1) });
  const eff = (c) => clamp(0.35 + c.energy / 100 * 0.65, 0.35, 1) * (c.hunger > 0 ? 0.72 : 1);
  const have = (m) => S.store[m] || 0;
  function canAfford(cost) { for (const m in cost) if (have(m) < cost[m]) return false; return true; }
  function pay(cost) { for (const m in cost) S.store[m] -= cost[m]; }
  function refund(cost, frac) { for (const m in cost) S.store[m] += Math.floor(cost[m] * (frac === undefined ? 0.5 : frac)); }
  function missing(cost) {
    const out = [];
    for (const m in cost) if (have(m) < cost[m]) out.push(`${cost[m] - have(m)} more ${MATS[m].name.toLowerCase()}`);
    return out.join(' and ');
  }
  function waterCap() {
    let n = WATER_BASE;
    for (const b of S.buildings) if (b.built && BUILDINGS[b.type].tank) n += BUILDINGS[b.type].tank;
    return n;
  }
  // Catchments and filtration plants: what the colony can actually keep drawing.
  function waterWorks() {
    let n = 0;
    for (const b of S.buildings) if (b.built && BUILDINGS[b.type].draw) n++;
    return n;
  }
  function totalBeds() {
    let n = 0;
    for (const b of S.buildings) if (b.built && BUILDINGS[b.type].beds) n += BUILDINGS[b.type].beds;
    return n;
  }
  function galleyStock() {
    let n = 0;
    for (const b of S.buildings) if (b.built && b.type === 'galley') n += b.stock;
    return n;
  }
  function foodInStore() {
    let n = 0;
    for (const m of MAT_ORDER) if (isFood(m)) n += have(m);
    return n;
  }
  function cheapestFood() {
    let best = null;
    for (const m of MAT_ORDER) {
      if (!isFood(m) || have(m) <= 0) continue;
      if (!best || have(m) > have(best)) best = m;
    }
    return best;
  }
  function facOwner(fac) {
    if (fac.kind === 'building') { const b = building(fac.id); return b ? b.worker : null; }
    if (fac.kind === 'field') { const f = fieldOf(fac.id); return f ? f.worker : null; }
    return null;
  }

  function centreCamera(x, y) {
    UI.cam.x = clamp(x - VIEW_W / 2, 0, camMaxX());
    UI.cam.y = clamp(y - VIEW_H / 2, 0, camMaxY());
  }

  // The ring of tiles a crew member can stand on to work on a building.
  function entrances(b) {
    const goals = new Set();
    for (let x = b.x - 1; x <= b.x + b.w; x++) for (let y = b.y - 1; y <= b.y + b.h; y++) {
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      const corner = (x < b.x || x >= b.x + b.w) && (y < b.y || y >= b.y + b.h);
      if (inside || corner || !walkable(x, y)) continue;
      // has to be on a level the building's own footprint stands at
      let ok = false;
      for (let by = b.y; by < b.y + b.h && !ok; by++) for (let bx = b.x; bx < b.x + b.w && !ok; bx++) {
        if (Math.abs(bx - x) + Math.abs(by - y) === 1 && sameStep(bx, by, x, y)) ok = true;
      }
      if (ok) goals.add(idx(x, y));
    }
    return goals;
  }
  // A building's footprint has no structures of its own, so compare against its ground level.
  function sameStep(bx, by, x, y) {
    const bl = S.lvl[idx(bx, by)] + S.plat[idx(bx, by)];
    return bl >= loLvl(x, y) && bl <= hiLvl(x, y);
  }
  // Where a crew member can stand to work on one tile: beside it, on a shared level.
  function beside(x, y) {
    const goals = new Set();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(nx, ny)) continue;
      if (!linked(x, y, nx, ny)) continue;
      goals.add(idx(nx, ny));
    }
    return goals;
  }
  // Where a crew member can stand to BUILD on one tile. A stair is the awkward case: it
  // is put in from the terrace above, and until it is finished it only stands at the lower
  // level, so the plain adjacency test says nobody can reach the thing they came to build.
  function besideGround(x, y) {
    const i = idx(x, y);
    const pendingStair = S.ground[i] === 'stair' && S.gwork[i] > 0;
    const lo = loLvl(x, y), hi = pendingStair ? baseLvl(x, y) + 1 : hiLvl(x, y);
    const goals = new Set();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(nx, ny)) continue;
      if (Math.max(lo, loLvl(nx, ny)) > Math.min(hi, hiLvl(nx, ny))) continue;
      goals.add(idx(nx, ny));
    }
    return goals;
  }
  function nearestWalkable(x, y) {
    for (let r = 0; r < COLS; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return { x, y };
  }

  // ------------------------------------------------------------ save/load
  function save() {
    if (!S) return;
    const copy = {
      ...S,
      crew: S.crew.map((c) => ({ ...c, task: null, path: null, carry: null, hidden: false, walking: false, working: false })),
    };
    for (const c of S.crew) if (c.carry) copy.store[c.carry.mat] = (copy.store[c.carry.mat] || 0) + c.carry.n;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(copy)); } catch (e) { /* full or private */ }
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to do */ } }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    let d = null;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !Array.isArray(d.lvl) || d.lvl.length !== N_TILES || !Array.isArray(d.crew)) return false;
    S = d;
    // anything added since this save was written
    for (const m of MAT_ORDER) if (typeof S.store[m] !== 'number') S.store[m] = 0;
    if (!S.tech) S.tech = {};
    if (!S.springs) S.springs = [];
    if (!S.seeps) S.seeps = [];
    for (const key of ['mark', 'ground', 'gwork', 'plat', 'blvl', 'water', 'occ', 'plots', 'tilt']) {
      if (!Array.isArray(S[key]) || S[key].length !== N_TILES) S[key] = new Array(N_TILES).fill(key === 'ground' || key === 'plots' ? null : 0);
    }
    for (const b of S.buildings) {
      if (!b.in) b.in = {};
      if (typeof b.work !== 'number') b.work = 0;
      if (typeof b.built !== 'boolean') b.built = true;
    }
    for (const c of S.crew) { c.task = null; c.path = null; c.sleeping = c.sleeping || false; }
    const d0 = deckB();
    if (d0) centreCamera(d0.x + 2, d0.y + 2);
    return true;
  }

  // ------------------------------------------------------------ pathfinding
  function findPath(sx, sy, goals, wade) {
    if (!goals || goals.size === 0) return null;
    const start = idx(sx, sy);
    if (goals.has(start)) return [];
    const dist = new Float64Array(N_TILES).fill(Infinity);
    const prev = new Int32Array(N_TILES).fill(-1);
    dist[start] = 0;
    const heap = [];
    const push = (d, n) => {
      heap.push([d, n]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    push(0, start);
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (goals.has(u)) {
        const out = [];
        for (let c = u; c !== start; c = prev[c]) out.push({ x: c % COLS, y: Math.floor(c / COLS) });
        return out.reverse();
      }
      const ux = u % COLS, uy = Math.floor(u / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ux + dx, ny = uy + dy;
        if (!walkable(nx, ny, wade)) continue;
        if (!linked(ux, uy, nx, ny)) continue;
        const n = idx(nx, ny), nd = d + tileCost(nx, ny);
        if (nd < dist[n]) { dist[n] = nd; prev[n] = u; push(nd, n); }
      }
    }
    return null;
  }

  // The colony is where the crew are standing, not where the deck is. Those are not always
  // the same place: the command deck is four tiles by three, and its ring of doorsteps can
  // fall into two separate pieces with the hull between them. Seeding from the deck unions
  // both, so a galley built on the far side reads as reachable while the crew, on the near
  // side, can never get to it — a full store, a bare counter, and nothing obviously wrong.
  // Wading is allowed, or somebody with wet feet would look cut off.
  function colonyRegion() {
    const seen = new Uint8Array(N_TILES);
    const q = [];
    const push = (i) => { if (!seen[i]) { seen[i] = 1; q.push(i); } };
    for (const c of S.crew) {
      const t = tileOf(c);
      if (walkable(t.x, t.y, true)) push(idx(t.x, t.y));
    }
    if (!q.length) {
      const d = deckB();
      if (d) for (const i of entrances(d)) push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const u = q[h], ux = u % COLS, uy = Math.floor(u / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ux + dx, ny = uy + dy;
        if (!walkable(nx, ny, true) || !linked(ux, uy, nx, ny)) continue;
        push(idx(nx, ny));
      }
    }
    return seen;
  }
  const touches = (b, region) => {
    for (const i of entrances(b)) if (region[i]) return true;
    return false;
  };

  // Everything the crew can get to from the command deck, for hints and for the map.
  function reachable(wade) {
    const seen = new Uint8Array(N_TILES);
    const d = deckB();
    if (!d) return seen;
    const q = [];
    for (const i of entrances(d)) { seen[i] = 1; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const u = q[h], ux = u % COLS, uy = Math.floor(u / COLS);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ux + dx, ny = uy + dy;
        if (!walkable(nx, ny, wade) || !linked(ux, uy, nx, ny)) continue;
        const n = idx(nx, ny);
        if (!seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    return seen;
  }

  function walk(c, dt) {
    let left = dt;
    while (left > 0 && c.path.length) {
      const n = c.path[0], tx = n.x + 0.5, ty = n.y + 0.5;
      const dx = tx - c.px, dy = ty - c.py, d = Math.hypot(dx, dy);
      const sp = BASE_SPEED * workRate() * (0.6 + 0.4 * eff(c)) / tileCost(n.x, n.y);
      const step = sp * left;
      if (dx) c.face = dx < 0 ? -1 : 1;
      if (step >= d) { c.px = tx; c.py = ty; c.path.shift(); left -= d / sp; }
      else { c.px += dx / d * step; c.py += dy / d * step; left = 0; }
    }
    c.walking = c.path.length > 0;
    return c.path.length === 0;
  }

  function moveStep(c, goals, dt) {
    if (!c.path) {
      const t = tileOf(c);
      let p = findPath(t.x, t.y, goals);
      if (!p) p = findPath(t.x, t.y, goals, true);   // then wade for it
      if (!p) return 'blocked';
      c.path = p;
    }
    return walk(c, dt) ? 'arrived' : 'moving';
  }

  // ------------------------------------------------------------ tasks
  function claim(key, c) { CLAIMS[key] = c.id; }
  const claimed = (key) => CLAIMS[key] !== undefined;
  function release(task) { for (const k of task.keys || []) delete CLAIMS[k]; }
  function cancelTask(c) { if (c.task) release(c.task); c.task = null; c.path = null; c.working = false; }
  function startTask(c, task) { c.task = task; task.phase = 0; c.path = null; for (const k of task.keys || []) claim(k, c); }
  // Nothing on this mountain is reachable from everywhere. When a crew member cannot get
  // to a job, the job is put down for a couple of hours rather than picked straight back
  // up by the next person to look for work.
  const clockHours = () => S.day * 24 + S.hour;
  function giveUp(c, key) {
    if (key) BLOCKED[key] = clockHours() + 2.5;
    cancelTask(c);
  }
  const blocked = (key) => BLOCKED[key] !== undefined && BLOCKED[key] > clockHours();

  function addCarry(c, mat, n) {
    if (c.carry && c.carry.mat === mat) c.carry.n += n;
    else c.carry = { mat, n };
  }
  function deposit(c) {
    if (!c.carry) return;
    S.store[c.carry.mat] = (S.store[c.carry.mat] || 0) + c.carry.n;
    if (c.carry.mat === 'water') S.store.water = Math.min(S.store.water, waterCap());
    c.carry = null;
  }

  // What a workshop is short of, and how much of it would fit.
  function craftWant(b) {
    const cr = BUILDINGS[b.type].craft;
    if (!cr) return null;
    let best = null;
    for (const m in cr.from) {
      const has = b.in[m] || 0;
      if (has > CRAFT_CAP - cr.from[m]) continue;
      const room = CRAFT_CAP - has;
      const n = Math.min(CARRY_CAP, room, have(m));
      if (n <= 0) continue;
      // whatever it has least of, in recipes-worth
      const depth = has / cr.from[m];
      if (!best || depth < best.depth) best = { mat: m, n, depth };
    }
    return best;
  }
  function canCraft(b) {
    const cr = BUILDINGS[b.type].craft;
    if (!cr) return false;
    for (const m in cr.from) if ((b.in[m] || 0) < cr.from[m]) return false;
    return true;
  }

  // The tile a marked job is worked from, or null if nobody can stand anywhere useful.
  function markTargets() {
    const out = [];
    for (let i = 0; i < N_TILES; i++) if (S.mark[i]) out.push(i);
    return out;
  }

  // What gets done first. Distance decides between two jobs of the same kind; the tier
  // decides everything else, because a mountain this big will always have a nearer tree
  // to cut than the galley is to stock, and a colony that cuts trees does not eat.
  const PRI = {
    galleyShort: -300, waterDry: -240, collect: -180, raise: -120, ground: -100,
    reap: -60, beacon: -40, craft: -20, haul: 0, galleyTop: 40, sow: 40,
    waterTop: 60, clear: 100,
  };

  function pickTask(c) {
    const deck = firstOf('deck');
    if (!deck) return null;
    const t = tileOf(c);
    const cands = [];
    const d = (x, y) => Math.abs(x - t.x) + Math.abs(y - t.y);

    // --- raising what has been placed but not yet built
    for (const b of S.buildings) {
      if (b.built || claimed('raise:' + b.id) || blocked('raise:' + b.id)) continue;
      cands.push({ score: d(b.x, b.y) + PRI.raise, task: { kind: 'raise', to: b.id, keys: ['raise:' + b.id] } });
    }
    for (let i = 0; i < N_TILES; i++) {
      if (!S.ground[i] || S.gwork[i] <= 0 || claimed('g:' + i) || blocked('g:' + i)) continue;
      cands.push({ score: d(i % COLS, Math.floor(i / COLS)) + PRI.ground, task: { kind: 'ground', tile: i, keys: ['g:' + i] } });
    }

    // --- cutting and stripping whatever has been marked
    for (const i of markTargets()) {
      if (claimed('m:' + i) || blocked('m:' + i)) continue;
      const k = S.kind[i];
      if (k !== K.GROWTH && k !== K.WRECK) continue;
      cands.push({ score: d(i % COLS, Math.floor(i / COLS)) + PRI.clear, task: { kind: k === K.GROWTH ? 'cut' : 'strip', tile: i, keys: ['m:' + i] } });
    }

    // --- the terraces
    for (const f of S.fields) {
      if (!f.crop) continue;
      const fac = { kind: 'field', id: f.id };
      // The crew drink out of the same tank the terraces do. Keep a few days of suppers
      // back before anybody waters a plot with it, or the colony irrigates itself thirsty.
      const drinking = S.crew.length * 3 + 6;
      if (!claimed('wet:' + f.id) && !blocked('wet:' + f.id) && f.wet < WET_CAP - 3 && have('water') > drinking && !fieldWatered(f)) {
        const n = Math.min(CARRY_CAP, WET_CAP - Math.floor(f.wet), have('water') - drinking);
        if (n > 0) cands.push({ score: d(f.x, f.y) + (f.wet <= 0.5 ? PRI.waterDry : PRI.waterTop), fac, task: { kind: 'haul', mat: 'water', n, to: f.id, field: true, keys: ['wet:' + f.id] } });
      }
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = idx(x, y), p = S.plots[i];
        if (!p || claimed('p:' + i)) continue;
        if (p.stage === 2) cands.push({ score: d(x, y) + PRI.reap, fac, task: { kind: 'reap', tile: i, field: f.id, keys: ['p:' + i] } });
        else if (p.stage === 0) cands.push({ score: d(x, y) + PRI.sow, fac, task: { kind: 'sow', tile: i, field: f.id, keys: ['p:' + i] } });
      }
    }

    // --- the works
    for (const b of S.buildings) {
      if (!b.built) continue;
      const def = BUILDINGS[b.type];
      const fac = { kind: 'building', id: b.id };
      if (def.craft) {
        if (!claimed('haul:' + b.id) && !blocked('haul:' + b.id)) {
          const want = craftWant(b);
          if (want) cands.push({ score: d(deck.x, deck.y) + PRI.haul, fac, task: { kind: 'haul', mat: want.mat, n: want.n, to: b.id, keys: ['haul:' + b.id] } });
        }
        if (!claimed('work:' + b.id) && canCraft(b)) {
          cands.push({ score: d(b.x, b.y) + PRI.craft, fac, task: { kind: 'craft', to: b.id, keys: ['work:' + b.id] } });
        }
      } else if (def.draw) {
        if (!claimed('coll:' + b.id) && b.ready >= 3) {
          cands.push({ score: d(b.x, b.y) + PRI.collect, fac, task: { kind: 'collect', to: b.id, keys: ['coll:' + b.id] } });
        }
      } else if (b.type === 'galley') {
        if (!claimed('stock:' + b.id) && !blocked('stock:' + b.id) && b.stock < GALLEY_CAP) {
          const mat = cheapestFood();
          const n = mat ? Math.min(CARRY_CAP, GALLEY_CAP - b.stock, have(mat)) : 0;
          const short = b.stock < S.crew.length;
          if (n > 0 && (short || n >= 3)) {
            cands.push({ score: d(deck.x, deck.y) + (short ? PRI.galleyShort : PRI.galleyTop), fac, task: { kind: 'haul', mat, n, to: b.id, keys: ['stock:' + b.id] } });
          }
        }
      } else if (def.charge) {
        const ch = def.charge;
        if (!claimed('haul:' + b.id) && !blocked('haul:' + b.id) && b.charge < ch.need && (b.in[ch.from] || 0) < ch.per * 2 && have(ch.from) > 0) {
          const n = Math.min(CARRY_CAP, ch.per * 3, have(ch.from));
          cands.push({ score: d(deck.x, deck.y) + PRI.beacon, fac, task: { kind: 'haul', mat: ch.from, n, to: b.id, keys: ['haul:' + b.id] } });
        }
        if (!claimed('work:' + b.id) && b.charge < ch.need && (b.in[ch.from] || 0) >= ch.per) {
          cands.push({ score: d(b.x, b.y) + PRI.beacon, fac, task: { kind: 'charge', to: b.id, keys: ['work:' + b.id] } });
        }
      }
    }

    if (!cands.length) return null;
    let best = null;
    for (const cd of cands) {
      const owner = cd.fac ? facOwner(cd.fac) : null;   // somebody else's post
      if (owner && owner !== c.id) continue;
      let score = cd.score;
      if (c.slot && cd.fac && c.slot.kind === cd.fac.kind && c.slot.id === cd.fac.id) score -= 14;
      else if (c.slot) score += 24;                      // posted crew wander less
      if (!best || score < best.score) best = { score, task: cd.task };
    }
    return best ? best.task : null;
  }

  // A plot with standing clean water next to it waters itself.
  function fieldWatered(f) {
    for (let y = f.y - 1; y <= f.y + f.h; y++) for (let x = f.x - 1; x <= f.x + f.w; x++) {
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (S.water[i] > 0.08 && S.lvl[i] > 0) return true;
    }
    return false;
  }

  function nextRipe(c, fieldId) {
    const f = fieldOf(fieldId);
    if (!f) return null;
    const t = tileOf(c);
    let best = null, bd = Infinity;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      const i = idx(x, y), p = S.plots[i];
      if (!p || p.stage !== 2 || claimed('p:' + i)) continue;
      const dd = Math.abs(x - t.x) + Math.abs(y - t.y);
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  const rigSpeed = () => (known('rigs') ? 1.5 : 1);

  function runTask(c, dt) {
    const t = c.task;
    const deck = firstOf('deck');
    c.working = false;
    switch (t.kind) {

      // ---------------------------------------------------- cutting the growth
      case 'cut':
      case 'strip': {
        const i = t.tile;
        const x = i % COLS, y = Math.floor(i / COLS);
        const want = t.kind === 'cut' ? K.GROWTH : K.WRECK;
        if (S.kind[i] !== want || !S.mark[i]) { if (c.carry) { t.phase = 2; c.path = null; } else return cancelTask(c); }
        if (t.phase === 0) {
          const r = moveStep(c, beside(x, y), dt);
          if (r === 'blocked') return giveUp(c, 'm:' + i);
          if (r === 'arrived') { t.phase = 1; c.face = x > c.px ? 1 : -1; }
        } else if (t.phase === 1) {
          c.working = true;
          S.hp[i] -= dt * eff(c) * workRate() * rigSpeed();
          if (S.hp[i] <= 0) {
            const got = breakTile(i);
            for (const m in got) addCarry(c, m, got[m]);
            delete CLAIMS['m:' + i];
            t.keys = [];
            // straight on to the next marked tile within reach, if there is one
            const next = nextMark(c, want);
            const room = !c.carry || c.carry.n < CARRY_CAP;
            if (next !== null && room) {
              t.tile = next; t.keys = ['m:' + next]; claim('m:' + next, c); t.phase = 0; c.path = null;
            } else { t.phase = 2; c.path = null; }
          }
        } else {
          if (!c.carry) return cancelTask(c);
          if (!deck) { c.carry = null; return cancelTask(c); }
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') { c.carry = null; return cancelTask(c); }
          if (r === 'arrived') { deposit(c); cancelTask(c); }
        }
        break;
      }

      // -------------------------------------------------- raising a structure
      case 'ground': {
        const i = t.tile;
        const x = i % COLS, y = Math.floor(i / COLS);
        if (!S.ground[i] || S.gwork[i] <= 0) return cancelTask(c);
        if (t.phase === 0) {
          const r = moveStep(c, besideGround(x, y), dt);
          if (r === 'blocked') return giveUp(c, 'g:' + i);
          if (r === 'arrived') t.phase = 1;
        } else {
          c.working = true;
          S.gwork[i] -= dt * eff(c) * workRate();
          if (S.gwork[i] <= 0) {
            S.gwork[i] = 0;
            groundDirty = true; UI.structure++;
            float(x + 0.5, y, GROUND[S.ground[i]].name, '#e0c88a');
            cancelTask(c);
          }
        }
        break;
      }
      case 'raise': {
        const b = building(t.to);
        if (!b || b.built) return cancelTask(c);
        if (t.phase === 0) {
          const r = moveStep(c, entrances(b), dt);
          if (r === 'blocked') return giveUp(c, 'raise:' + b.id);
          if (r === 'arrived') t.phase = 1;
        } else {
          c.working = true;
          b.work -= dt * eff(c) * workRate();
          if (b.work <= 0) {
            b.work = 0; b.built = true;
            UI.structure++; groundDirty = true;
            log(`${BUILDINGS[b.type].name} is up.`, 'good');
            float(b.x + b.w / 2, b.y, 'built', '#8fd6a0');
            cancelTask(c);
          }
        }
        break;
      }

      // ------------------------------------------------------------ terraces
      case 'sow': {
        const p = S.plots[t.tile], f = fieldOf(t.field);
        if (!p || !f || !f.crop || p.stage !== 0) return cancelTask(c);
        const x = t.tile % COLS, y = Math.floor(t.tile / COLS);
        if (t.phase === 0) {
          const r = moveStep(c, new Set([t.tile]), dt);
          if (r === 'blocked') return cancelTask(c);
          if (r === 'arrived') { t.phase = 1; t.timer = 1.4 / eff(c); }
        } else {
          c.working = true;
          t.timer -= dt;
          if (t.timer <= 0) { p.stage = 1; p.growth = 0; p.crop = f.crop; cancelTask(c); }
        }
        break;
      }
      case 'reap': {
        if (t.phase === 0) {
          const p = S.plots[t.tile];
          if (!p || p.stage !== 2) { t.phase = 2; c.path = null; break; }
          const r = moveStep(c, new Set([t.tile]), dt);
          if (r === 'blocked') { t.phase = 2; c.path = null; break; }
          if (r === 'arrived') { t.phase = 1; t.timer = 1.7 / eff(c); }
        } else if (t.phase === 1) {
          c.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            const p = S.plots[t.tile];
            if (p && p.stage === 2) {
              let n = CROPS[p.crop].yield;
              // Nobody starves on Keelfall. A crew member who missed supper eats on the
              // terrace, so a hungry colony quietly loses part of every harvest.
              if (c.hunger > 0 && n > 0) {
                n--; c.hunger--;
                float(t.tile % COLS + 0.5, Math.floor(t.tile / COLS), '−1', '#e9c46a');
              }
              if (n > 0) addCarry(c, p.crop, n);
              p.stage = 0; p.growth = 0;
            }
            delete CLAIMS['p:' + t.tile];
            t.keys = [];
            const next = nextRipe(c, t.field);
            const room = !c.carry || c.carry.n + 3 <= CARRY_CAP;
            if (next !== null && room) {
              t.tile = next; t.keys = ['p:' + next]; claim('p:' + next, c); t.phase = 0; c.path = null;
            } else { t.phase = 2; c.path = null; }
          }
        } else {
          if (!c.carry) return cancelTask(c);
          if (!deck) { c.carry = null; return cancelTask(c); }
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') { c.carry = null; return cancelTask(c); }
          if (r === 'arrived') { deposit(c); cancelTask(c); }
        }
        break;
      }

      // --------------------------------------------------------- carrying it
      case 'haul': {
        const dest = t.field ? fieldOf(t.to) : building(t.to);
        if (t.phase === 0) {
          if (!deck || !dest) return cancelTask(c);
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') return cancelTask(c);
          if (r === 'arrived') {
            const take = Math.min(t.n, have(t.mat));
            if (take <= 0) return cancelTask(c);
            S.store[t.mat] -= take; c.carry = { mat: t.mat, n: take };
            t.phase = 1; c.path = null;
          }
        } else if (t.phase === 1) {
          if (!dest) { t.phase = 2; c.path = null; break; }
          const goals = t.field ? fieldTiles(dest) : entrances(dest);
          const r = moveStep(c, goals, dt);
          if (r === 'blocked') {
            for (const k of t.keys || []) BLOCKED[k] = clockHours() + 3;
            t.phase = 2; c.path = null; break;
          }
          if (r === 'arrived') {
            if (t.field) {
              dest.wet = Math.min(WET_CAP, dest.wet + c.carry.n);
              float(dest.x + dest.w / 2, dest.y, '+' + c.carry.n, MATS.water.color);
            } else {
              const def = BUILDINGS[dest.type];
              if (def.craft || def.charge) dest.in[c.carry.mat] = (dest.in[c.carry.mat] || 0) + c.carry.n;
              else if (dest.type === 'galley') dest.stock += c.carry.n;
              float(dest.x + dest.w / 2, dest.y, '+' + c.carry.n, MATS[c.carry.mat].color);
            }
            c.carry = null;
            cancelTask(c);
          }
        } else {
          if (!deck || !c.carry) { c.carry = null; return cancelTask(c); }
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') { c.carry = null; return cancelTask(c); }
          if (r === 'arrived') { deposit(c); cancelTask(c); }
        }
        break;
      }

      // ------------------------------------------------------------ the works
      case 'craft': {
        const b = building(t.to);
        const cr = b ? BUILDINGS[b.type].craft : null;
        if (t.phase === 0) {
          if (!b || !canCraft(b)) return cancelTask(c);
          const r = moveStep(c, entrances(b), dt);
          if (r === 'blocked') return cancelTask(c);
          if (r === 'arrived') { t.phase = 1; t.timer = cr.time / eff(c); }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; c.path = null; break; }
          c.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            if (canCraft(b)) {
              for (const m in cr.from) b.in[m] -= cr.from[m];
              addCarry(c, cr.to, cr.make);
              b.made = (b.made || 0) + cr.make;
            }
            if (canCraft(b) && c.carry.n + cr.make <= CARRY_CAP && isDay()) t.timer = cr.time / eff(c);
            else { t.phase = 2; c.path = null; }
          }
        } else {
          if (!c.carry) return cancelTask(c);
          if (!deck) { c.carry = null; return cancelTask(c); }
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') { c.carry = null; return cancelTask(c); }
          if (r === 'arrived') { deposit(c); cancelTask(c); }
        }
        break;
      }
      case 'collect': {
        const b = building(t.to);
        if (t.phase === 0) {
          if (!b || b.ready <= 0) return cancelTask(c);
          const r = moveStep(c, entrances(b), dt);
          if (r === 'blocked') return cancelTask(c);
          if (r === 'arrived') { t.phase = 1; t.timer = 1.4 / eff(c); }
        } else if (t.phase === 1) {
          if (!b) { t.phase = 2; c.path = null; break; }
          c.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            const n = Math.min(CARRY_CAP, Math.floor(b.ready));
            if (n > 0) { b.ready -= n; b.made = (b.made || 0) + n; addCarry(c, 'water', n); float(b.x + b.w / 2, b.y, '+' + n, MATS.water.color); }
            t.phase = 2; c.path = null;
          }
        } else {
          if (!c.carry) return cancelTask(c);
          if (!deck) { c.carry = null; return cancelTask(c); }
          const r = moveStep(c, entrances(deck), dt);
          if (r === 'blocked') { c.carry = null; return cancelTask(c); }
          if (r === 'arrived') { deposit(c); cancelTask(c); }
        }
        break;
      }
      case 'charge': {
        const b = building(t.to);
        const ch = b ? BUILDINGS[b.type].charge : null;
        if (t.phase === 0) {
          if (!b || !ch || (b.in[ch.from] || 0) < ch.per) return cancelTask(c);
          const r = moveStep(c, entrances(b), dt);
          if (r === 'blocked') return cancelTask(c);
          if (r === 'arrived') { t.phase = 1; t.timer = ch.time / eff(c); }
        } else {
          if (!b) return cancelTask(c);
          c.working = true;
          t.timer -= dt;
          if (t.timer <= 0) {
            if ((b.in[ch.from] || 0) >= ch.per) {
              b.in[ch.from] -= ch.per;
              b.charge = (b.charge || 0) + 1;
              float(b.x + b.w / 2, b.y, `${b.charge}/${ch.need}`, '#ffe08a');
              UI.structure++;
              if (b.charge >= ch.need && !S.won) winGame();
            }
            if ((b.in[ch.from] || 0) >= ch.per && b.charge < ch.need && isDay()) t.timer = ch.time / eff(c);
            else cancelTask(c);
          }
        }
        break;
      }

      case 'sleep': {
        const home = c.home ? building(c.home) : null;
        const d0 = deckB();
        const goals = home ? entrances(home) : (d0 ? entrances(d0) : new Set());
        const r = moveStep(c, goals, dt);
        if (r !== 'moving') {
          c.sleeping = true; c.inBed = !!home && r === 'arrived'; c.hidden = c.inBed;
          cancelTask(c);
        }
        break;
      }
      default: cancelTask(c);
    }
  }

  function fieldTiles(f) {
    const s = new Set();
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (walkable(x, y)) s.add(idx(x, y));
    return s;
  }

  // The next marked tile of the same sort that this crew member could reach.
  function nextMark(c, want) {
    const t = tileOf(c);
    let best = null, bd = Infinity;
    for (let i = 0; i < N_TILES; i++) {
      if (!S.mark[i] || S.kind[i] !== want || claimed('m:' + i)) continue;
      const x = i % COLS, y = Math.floor(i / COLS);
      const dd = Math.abs(x - t.x) + Math.abs(y - t.y);
      if (dd > 6 || dd >= bd) continue;
      if (beside(x, y).size === 0) continue;
      bd = dd; best = i;
    }
    return best;
  }

  // What comes out of a tile when it finally gives.
  function breakTile(i) {
    const got = {};
    if (S.kind[i] === K.GROWTH) {
      got.timber = 2 + Math.floor(Math.random() * 3);
      S.cut++;
    } else {
      const t = S.wtype[i];
      if (t === W.CONDUIT) { got.wire = 2 + Math.floor(Math.random() * 2); got.scrap = 1; }
      else if (t === W.MAINFRAME) { got.core = 1; got.wire = 2; got.scrap = 2; }
      else { got.scrap = 2 + Math.floor(Math.random() * 3); if (Math.random() < 0.18) got.wire = 1; got.timber = 1 + (Math.random() < 0.5 ? 1 : 0); }
      S.stripped++;
      if (t === W.MAINFRAME) log('A mainframe bay is open. One data core, still readable.', 'good');
    }
    S.kind[i] = K.OPEN; S.hp[i] = 0; S.mark[i] = 0;
    groundDirty = true; UI.structure++;
    return got;
  }

  function taskLabel(c) {
    if (c.sleeping) return c.inBed ? 'Asleep in a bunk' : 'Asleep on the deck plates';
    const t = c.task;
    if (!t) return isDay() ? 'Looking for something to do' : 'Turning in';
    const carried = () => (c.carry ? `${c.carry.n} ${MATS[c.carry.mat].name.toLowerCase()}` : 'the load');
    const bname = (id) => { const b = building(id); return b ? BUILDINGS[b.type].name.toLowerCase() : 'somewhere'; };
    switch (t.kind) {
      case 'cut': return t.phase === 2 ? `Carrying ${carried()} up to the deck` : t.phase ? 'Cutting through the growth' : 'Climbing down to the growth';
      case 'strip': return t.phase === 2 ? `Carrying ${carried()} up to the deck` : t.phase ? 'Stripping the wreck' : 'Climbing out to the wreck';
      case 'ground': {
        const g = GROUND[S.ground[t.tile]];
        return t.phase ? `Laying ${g ? g.name.toLowerCase() : 'the ground'}` : 'Going to lay out the ground';
      }
      case 'raise': return t.phase ? `Raising the ${bname(t.to)}` : `Going to raise the ${bname(t.to)}`;
      case 'sow': return t.phase ? 'Sowing the terrace' : 'Walking out to sow';
      case 'reap': return t.phase === 2 ? `Carrying ${carried()} up to the deck` : t.phase ? 'Harvesting' : 'Walking out to harvest';
      case 'haul': {
        const what = MATS[t.mat].name.toLowerCase();
        const where = t.field ? 'the terrace' : `the ${bname(t.to)}`;
        return t.phase === 0 ? `Fetching ${what} for ${where}` : t.phase === 1 ? `Carrying ${what} to ${where}` : `Taking ${carried()} back to the deck`;
      }
      case 'craft': {
        const b = building(t.to);
        const cr = b ? BUILDINGS[b.type].craft : null;
        return t.phase === 2 ? `Carrying ${carried()} up to the deck` : t.phase ? (cr ? cr.verb : 'Working') : `Walking to the ${bname(t.to)}`;
      }
      case 'collect': return t.phase === 2 ? `Carrying ${carried()} up to the deck` : t.phase ? 'Drawing off the water' : `Walking to the ${bname(t.to)}`;
      case 'charge': return t.phase ? 'Feeding the beacon' : 'Walking up to the beacon';
      case 'sleep': return 'Turning in';
    }
    return '';
  }

  // ------------------------------------------------------------ the water
  // Water has a depth on every tile and a surface height of level + depth. Every step it
  // slides towards whichever neighbour's surface is lower, which is all the fluid model
  // this mountain needs: it ponds behind a levee, spills over a terrace lip, and falls
  // into the chasm and is gone. Anything standing on level 0 has the drive coolant in it.
  const FLOW = 3.2;
  const PUMP_RATE = 0.30;
  const MIN_FLOW = 0.012;   // below this a tile just holds what it has
  // Anything shallower than a puddle soaks into the rock and the roots within the hour.
  // This is what keeps the runoff to a channel you can see and dam, instead of spreading
  // itself into a film over the whole mountain; a pond deep enough to stand in stays put.
  const SOAK = 0.005, PUDDLE = 0.3;
  const holdsWater = (i) => !S.occ[i] && !(S.ground[i] === 'dam' && S.gwork[i] <= 0);
  const surfaceOf = (i) => S.lvl[i] + S.plat[i] + S.tilt[i] + S.water[i];
  const isToxic = (i) => S.lvl[i] === 0;

  function waterStep(dt) {
    const d = new Float64Array(N_TILES);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = idx(x, y);
        const w = S.water[i];
        if (w <= 0.002) continue;
        if (S.kind[i] === K.VOID) { d[i] -= w; continue; }   // straight down the rift
        if (w < MIN_FLOW) continue;
        const hi = surfaceOf(i);
        let total = 0;
        const outs = [];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!inb(nx, ny)) continue;
          const n = idx(nx, ny);
          if (!holdsWater(n)) continue;
          const diff = hi - (S.kind[n] === K.VOID ? S.lvl[n] + S.tilt[n] : surfaceOf(n));
          if (diff <= 0.001) continue;
          outs.push({ n, diff }); total += diff;
        }
        if (!outs.length) continue;
        const give = Math.min(w, total / (outs.length + 1)) * Math.min(1, dt * FLOW);
        for (const o of outs) {
          const share = give * (o.diff / total);
          d[i] -= share; d[o.n] += share;
        }
      }
    }
    for (let i = 0; i < N_TILES; i++) {
      if (!d[i]) continue;
      S.water[i] = Math.max(0, S.water[i] + d[i]);
      if (S.kind[i] === K.VOID) S.water[i] = 0;
    }
  }

  function waterSources(dh) {
    const sn = seasonOf(S.day), wx = weatherOf();
    const rate = sn.spring + wx.rain * 0.7;
    if (rate > 0) {
      for (const s of S.springs) {
        const i = idx(s.x, s.y);
        if (holdsWater(i)) S.water[i] = Math.min(3, S.water[i] + rate * dh * 0.5);
      }
    }
    // The drive is still weeping into the basin, and will be for years. It does not
    // care what season it is, which is why the basin is never dry and never drinkable.
    for (const s of S.seeps || []) {
      const i = idx(s.x, s.y);
      if (holdsWater(i)) S.water[i] = Math.min(2.2, S.water[i] + dh * 0.085);
    }
    // The basin is the sump: everything on the mountain drains into it and the drive is
    // still filling it, so it neither soaks away nor dries out. Only the terraces above
    // lose water, which is the whole reason to hold any of it up there.
    const ev = sn.evap * dh * 0.012, soak = SOAK * dh;
    for (let i = 0; i < N_TILES; i++) {
      const w = S.water[i];
      if (w <= 0 || S.lvl[i] === 0) continue;
      S.water[i] = Math.max(0, w - ev - (w < PUDDLE ? soak : 0));
    }
  }

  // A pump takes from the wettest thing beside it and puts it on the terrace above.
  function runPump(b, dh) {
    let from = -1, to = -1, lowest = Infinity, highest = -1;
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (!inb(x, y)) continue;
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      if (inside) continue;
      const i = idx(x, y);
      if (S.kind[i] === K.VOID || !holdsWater(i)) continue;
      const l = S.lvl[i] + S.plat[i];
      if (S.water[i] > 0.08 && l < lowest) { lowest = l; from = i; }
      if (l > highest) { highest = l; to = i; }
    }
    b.state = '';
    if (from < 0) { b.state = 'Nothing to draw from'; return; }
    if (to < 0 || highest <= lowest) { b.state = 'Nowhere higher to push it'; return; }
    const move = Math.min(S.water[from], PUMP_RATE * dh * 0.1);
    S.water[from] -= move;
    S.water[to] += move;
    b.state = 'Pushing water up a terrace';
  }

  // ------------------------------------------------------------ the notice
  const NOTICES = [
    { id: 'quiet', w: 7, kind: 'notice', text: () => rnd([
      'Quiet on the ridge. The hull ticks as the sun gets to it.',
      'Nothing new in the night. The growth is a foot further into the cargo bay than it was.',
      'A clear morning. You can see the whole length of the ship from up here, which is not a comfort.',
      'Somebody has chalked the day count on the bulkhead again. Nobody has rubbed it out.',
    ]) },
    { id: 'log', w: 3, kind: 'good', text: () => rnd([
      'A flight recorder, still sealed, half a terrace down. The crew brought it up before breakfast.',
      'A steward’s handheld turned up in the silt. Most of it is recipes. Some of it is not.',
      'One of the black boxes still had charge in it.',
    ]) + ' One core recovered.', run: () => { S.store.core += 1; } },
    { id: 'spores', w: 3, kind: 'warn', text: () => 'Spores came up the ravine in the night. The growth has taken back some of what was cleared.',
      when: () => S.cut > 6,
      run: () => {
        let n = 0;
        for (let tries = 0; tries < 400 && n < 5; tries++) {
          const i = Math.floor(Math.random() * N_TILES);
          if (S.kind[i] !== K.OPEN || S.occ[i] || S.ground[i] || S.plots[i] || S.lvl[i] > 1 || S.water[i] > 0.05) continue;
          S.kind[i] = K.GROWTH; S.hp[i] = 2.2 + Math.random() * 1.2; n++;
        }
        groundDirty = true;
      } },
    { id: 'settle', w: 2.5, kind: 'warn', text: () => 'The wreck shifted overnight. Something down there came apart, and something else is newly reachable.',
      when: () => S.stripped > 3,
      run: () => {
        let n = 0;
        for (let tries = 0; tries < 400 && n < 3; tries++) {
          const i = Math.floor(Math.random() * N_TILES);
          if (S.kind[i] !== K.OPEN || S.occ[i] || S.ground[i] || S.plots[i] || S.water[i] > 0.05) continue;
          S.kind[i] = K.WRECK; S.wtype[i] = Math.random() < 0.3 ? W.CONDUIT : W.HULL;
          S.hp[i] = 3 + Math.random() * 2; n++;
        }
        groundDirty = true;
      } },
    { id: 'cache', w: 2, kind: 'good', text: () => {
        const n = 6 + Math.floor(Math.random() * 8);
        S.store.scrap += n;
        return `A supply locker came open when the hull settled: ${n} scrap, no questions asked.`;
      } },
    { id: 'burst', w: 2, kind: 'bad', when: () => S.day > 5, text: () => {
        const n = Math.min(have('water'), 4 + Math.floor(Math.random() * 8));
        S.store.water -= n;
        return `A seam in the tank let go in the night. ${n} water on the deck plates and gone.`;
      } },
    { id: 'drifter', w: 2, kind: 'notice', when: () => S.day > 8 && have('timber') >= 12,
      text: () => 'A skiff came up out of the cloud and tied on at the nose. The pilot wants timber, and has alloy to trade.',
      offer: { cost: { timber: 12 }, label: 'Trade 12 timber for 7 alloy' },
      accept: () => { S.store.alloy += 7; return 'The skiff casts off. Seven alloy in the hold.'; } },
    { id: 'salvor', w: 2, kind: 'notice', when: () => S.day > 10 && have('scrap') >= 20,
      text: () => 'A salvor band is camped two terraces down. They will swap what they pulled out of the engine room for plate.',
      offer: { cost: { scrap: 20 }, label: 'Trade 20 scrap for 2 cores' },
      accept: () => { S.store.core += 2; return 'Two cores, and a warning about the lower bays that nobody wanted to hear.' } },
    { id: 'stranger', w: 1.6, kind: 'good', when: () => S.crew.length < MAX_CREW && totalBeds() > S.crew.length,
      text: () => 'Somebody walked up out of the trees at first light. They were in the aft section when it came down, and they have been walking ever since.',
      run: () => { const d0 = deckB(); const p = nearestWalkable(d0.x + 2, d0.y + 3); const c = addCrew(p.x + 0.5, p.y + 0.5); log(`${c.name} has joined the colony.`, 'good'); } },
    { id: 'rainy', w: 2, kind: 'notice', when: () => weatherOf().rain > 0, text: () => 'Water off the peak all night. Anything that is going to hold it should be holding it by now.' },
    { id: 'dry', w: 2.5, kind: 'warn', when: () => seasonOf(S.day).id === 'scorch', text: () => 'The springs are dead and the terraces are hard. Whatever is in the tank is what there is.' },
    { id: 'thirst', kind: 'bad', w: 0, force: () => have('water') <= 4 && S.crew.length > 0,
      text: () => 'The tank is nearly dry. Nobody has had a proper drink since yesterday.' },
    { id: 'hungry', kind: 'bad', w: 0, force: () => S.crew.some((c) => c.hunger > 1),
      text: () => 'There was nothing on the galley counter last night. People noticed.' },
  ];

  function rollNotice() {
    S.notice = null;
    const forced = NOTICES.find((n) => n.force && n.force());
    let chosen = forced;
    if (!chosen) {
      const pool = NOTICES.filter((n) => n.w > 0 && (!n.when || n.when()));
      let total = 0;
      for (const n of pool) total += n.w;
      let r = Math.random() * total;
      for (const n of pool) { r -= n.w; if (r <= 0) { chosen = n; break; } }
      if (!chosen) chosen = pool[pool.length - 1];
    }
    UI.noticeShut = false;
    if (!chosen) return;
    const text = chosen.text();
    if (chosen.run) chosen.run();
    S.notice = { id: chosen.id, text, kind: chosen.kind || 'notice', offer: chosen.offer || null, taken: false };
  }
  function takeNotice() {
    const n = S.notice;
    if (!n || !n.offer || n.taken) return;
    if (!canAfford(n.offer.cost)) { setHint('Not enough for that — ' + missing(n.offer.cost) + '.', true); return; }
    pay(n.offer.cost);
    const def = NOTICES.find((x) => x.id === n.id);
    n.taken = true;
    log(def && def.accept ? def.accept() : 'Done.', 'good');
    UI.structure++;
    renderPanel();
  }

  // ------------------------------------------------------------ simulation
  let waterT = 0;
  function tick(dt) {
    const wasDay = isDay();
    const spd = 1 / (wasDay ? SEC_PER_HOUR_DAY : SEC_PER_HOUR_NIGHT);
    const dh = dt * spd;
    const prev = S.hour;
    S.hour += dh;
    if (prev < WORK_END && S.hour >= WORK_END) evening();
    let wrapped = false;
    if (S.hour >= 24) { S.hour -= 24; wrapped = true; }
    if ((prev < WORK_START || wrapped) && S.hour >= WORK_START) morning();

    // water, four times a second of real time
    waterSources(dh);
    waterT += dt;
    if (waterT > 0.25) { waterStep(waterT); waterT = 0; }

    // the terraces
    for (const f of S.fields) {
      let growing = 0;
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = idx(x, y), p = S.plots[i];
        if (!p) continue;
        if (S.water[i] > 0.25 && p.stage > 0) {       // the terrace went under
          p.stage = 0; p.growth = 0;
          f.wet = WET_CAP;
          f.drowned = (f.drowned || 0) + 1;
        }
        if (p.stage === 1) growing++;
      }
      if (f.crop && growing) {
        const k = CROPS[f.crop];
        const free = fieldWatered(f);
        const thirst = k.thirst * growing * dh * 0.055;
        if (free) f.wet = Math.min(WET_CAP, f.wet + dh * 0.5);
        if (f.wet > 0 || free) {
          if (!free) f.wet = Math.max(0, f.wet - thirst);
          const rate = growthRate() * dh / k.grow;
          for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
            const p = S.plots[idx(x, y)];
            if (!p || p.stage !== 1) continue;
            p.growth += rate;
            if (p.growth >= 1) { p.growth = 1; p.stage = 2; }
          }
          f.thirsty = false;
        } else {
          f.thirsty = true;
        }
      }
    }

    // the works that run themselves
    for (const b of S.buildings) {
      if (!b.built) continue;
      const def = BUILDINGS[b.type];
      if (def.draw) {
        const wet = drawSource(b, def.draw.need);
        const rain = weatherOf().rain > 0 && def.draw.need === 'clean';
        const dew = def.draw.need === 'clean' && S.lvl[idx(b.x, b.y)] >= 2;
        if (wet || rain) {
          b.ready = Math.min(def.draw.cap, b.ready + def.draw.rate * dh * (wet ? 1 : 0.55));
          b.state = wet ? 'Drawing off the water beside it' : 'Catching the rain';
        } else if (dew) {
          b.ready = Math.min(def.draw.cap, b.ready + def.draw.rate * dh * 0.14);
          b.state = 'Nothing to draw — taking what the hull sweats overnight';
        } else {
          b.state = def.draw.need === 'clean' ? 'No clean water beside it' : 'No basin water beside it';
        }
      } else if (def.pump) {
        runPump(b, dh);
      }
    }

    // the crew
    for (const c of S.crew) {
      c.days = c.days || 0;
      if (c.sleeping) {
        if (isDay()) { c.sleeping = false; c.hidden = false; c.inBed = false; }
        else continue;
      }
      if (!isDay()) {
        if (!c.task || c.task.kind !== 'sleep') { cancelTask(c); startTask(c, { kind: 'sleep', keys: [] }); }
      } else if (!c.task) {
        const t = pickTask(c);
        if (t) startTask(c, t);
      }
      if (c.task) runTask(c, dt);
      const spend = c.working ? 1.9 : c.walking ? 1.1 : 0.45;
      c.energy = clamp(c.energy - spend * dh * 0.55, 0, 100);
    }
  }

  function drawSource(b, need) {
    for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
      if (!inb(x, y)) continue;
      const inside = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      if (inside) continue;
      const i = idx(x, y);
      if (S.water[i] <= 0.08 || S.kind[i] === K.VOID) continue;
      if (need === 'clean' && !isToxic(i)) return true;
      if (need === 'toxic' && isToxic(i)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ evening
  // Supper is a plate off the galley counter and a cup out of the tank. Missing either
  // is not fatal — it just makes tomorrow slower, and puts a hand in the harvest.
  function evening() {
    const galleys = S.buildings.filter((b) => b.built && b.type === 'galley');
    let fed = 0, dry = 0;
    for (const c of S.crew) {
      const g = galleys.find((b) => b.stock > 0);
      const water = have('water') > 0;
      if (g && water) { g.stock--; S.store.water--; c.hunger = Math.max(0, c.hunger - 1); fed++; }
      else { c.hunger = Math.min(3, c.hunger + 1); if (!water) dry++; }
    }
    if (!galleys.length) {
      if (!S.noGalleyWarned) { log('Nobody has had a hot meal since the crash. A galley would fix that.', 'warn'); S.noGalleyWarned = true; }
    } else if (fed < S.crew.length) {
      log(dry ? `${plural(S.crew.length - fed, 'crew member')} went without — the tank is empty.` : `${plural(S.crew.length - fed, 'crew member')} found the counter bare.`, 'bad');
    }
    // whoever has a spare bunk claims it
    for (const c of S.crew) {
      if (c.home && building(c.home)) continue;
      const bunk = S.buildings.find((b) => b.built && BUILDINGS[b.type].beds && b.residents.length < BUILDINGS[b.type].beds);
      if (bunk) { bunk.residents.push(c.id); c.home = bunk.id; }
      else c.home = null;
    }
    UI.structure++;
  }

  function morning() {
    S.day++;
    for (const c of S.crew) {
      c.days++;
      c.energy = clamp(c.energy + (c.inBed ? 62 : 30) - (c.hunger > 0 ? 12 : 0), 0, 100);
      c.sleeping = false; c.hidden = false; c.inBed = false;
    }
    rollWeather();
    rollNotice();
    regrow();
    growColony();
    S.store.water = Math.min(S.store.water, waterCap());
    groundDirty = true;
    UI.structure++;
  }

  // The growth puts back a few tiles a night, on open ground nobody is using and nowhere
  // near a walkway. It is what the place does, and it means a colony can always cut more
  // timber — there is no way to strand yourself by clearing everything in reach.
  function regrow() {
    const reach = reachable();
    // How much cutting is actually available to them right now?
    let inReach = 0;
    for (let i = 0; i < N_TILES; i++) {
      if (S.kind[i] !== K.GROWTH) continue;
      const x = i % COLS, y = Math.floor(i / COLS);
      for (const j of beside(x, y)) if (reach[j]) { inReach++; break; }
    }
    if (inReach > 24) return;          // there is plenty within reach already
    // Somewhere out in the open, beside ground the crew can stand on, and never in a gap
    // narrow enough to wall anybody in.
    let n = 0;
    for (let tries = 0; tries < 600 && n < 3; tries++) {
      const i = Math.floor(Math.random() * N_TILES);
      if (S.kind[i] !== K.OPEN || S.occ[i] || S.ground[i] || S.plots[i]) continue;
      if (S.water[i] > 0.05 || reach[i] === 0) continue;
      if (S.lvl[i] === LEVELS - 1 && Math.random() < 0.5) continue;   // thinner up on the peak
      const x = i % COLS, y = Math.floor(i / COLS);
      let open = 0, clear = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (walkable(x + dx, y + dy) && linked(x, y, x + dx, y + dy)) open++;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = inb(x + dx, y + dy) ? idx(x + dx, y + dy) : -1;
        if (j >= 0 && (S.occ[j] || S.ground[j] || S.plots[j])) { clear = false; break; }
      }
      if (!clear || open < 3) continue;   // three ways out, so cutting it off cuts off nothing
      // Three ways out is not proof. Put it there, and if the mountain comes apart into
      // pieces — or anybody ends up on the wrong side of it — take it straight back out.
      // A crew member walled in by overnight growth can never reach the deck again, and
      // the colony quietly stops without ever saying why.
      const before = reachCount(reach);
      S.kind[i] = K.GROWTH; S.hp[i] = 2.2 + Math.random() * 1.4;
      const after = reachable();
      let lost = before - reachCount(after);
      if (lost > 1) { S.kind[i] = K.OPEN; S.hp[i] = 0; continue; }
      let cutOff = false, afterWade = null;
      for (const c of S.crew) {
        const t = tileOf(c);
        if (after[idx(t.x, t.y)]) continue;
        if (!afterWade) afterWade = reachable(true);
        if (!afterWade[idx(t.x, t.y)]) { cutOff = true; break; }
      }
      if (cutOff) { S.kind[i] = K.OPEN; S.hp[i] = 0; continue; }
      n++;
    }
    if (n) {
      groundDirty = true; UI.structure++;
      log(n === 1 ? 'Something green has come up through the plates overnight.'
        : `The growth has put back ${plural(n, 'tile')} in the night. It always does, if you give it room.`);
    }
  }

  // Survivors keep coming out of the trees, but only to somewhere that can hold them.
  function growColony() {
    if (S.crew.length >= MAX_CREW) return;
    if (totalBeds() <= S.crew.length) return;
    if (galleyStock() < S.crew.length + 3) return;
    if (have('water') < S.crew.length * 4 + 8) return;
    if (waterWorks() * 5 <= S.crew.length) return;
    if (Math.random() > 0.34) return;
    const d0 = deckB();
    if (!d0) return;
    const p = nearestWalkable(d0.x + 2, d0.y + 3);
    const c = addCrew(p.x + 0.5, p.y + 0.5);
    log(`${c.name} came up the ridge and asked if there was a bunk going. There was.`, 'good');
  }

  function growthHurdles() {
    const h = [];
    if (totalBeds() <= S.crew.length) h.push('a spare bunk');
    if (galleyStock() < S.crew.length + 3) h.push('food on the galley counter');
    if (have('water') < S.crew.length * 4 + 8) h.push(`water in the tank (${S.crew.length * 4 + 8})`);
    if (waterWorks() * 5 <= S.crew.length) h.push('another catchment or filter');
    return h;
  }
  function growthStatus() {
    if (S.crew.length >= MAX_CREW) return 'No room on the peak';
    const h = growthHurdles();
    return h.length ? 'Waiting on ' + h.join(', ') : 'Someone will turn up';
  }

  function winGame() {
    S.won = true;
    S.lit = S.day;
    log('The beacon is lit. Somebody, somewhere, is going to see that.', 'good');
    showWin();
  }

  // ------------------------------------------------------------ building
  const rectOf = (x0, y0, x1, y1) => ({
    x: Math.min(x0, x1), y: Math.min(y0, y1),
    w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1,
  });

  // --- marking the growth and the wreck for the crew to work through
  function markArea(x0, y0, x1, y1, want) {
    const r = rectOf(x0, y0, x1, y1);
    let n = 0, unreachable = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (S.kind[i] !== want || S.mark[i]) continue;
      S.mark[i] = 1; n++;
      if (beside(x, y).size === 0) unreachable++;
    }
    if (!n) { setHint(want === K.GROWTH ? 'No growth there to cut.' : 'No wreck there to strip.'); return; }
    UI.structure++;
    const what = want === K.GROWTH ? 'growth' : 'wreck';
    if (unreachable >= n) setHint(`${plural(n, 'tile')} of ${what} marked — but nobody can get to any of it yet. They need a stair or a span to that terrace.`, true);
    else setHint(`${plural(n, 'tile')} of ${what} marked.`);
  }
  function unmarkArea(x0, y0, x1, y1) {
    const r = rectOf(x0, y0, x1, y1);
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (!S.mark[i]) continue;
      S.mark[i] = 0; delete CLAIMS['m:' + i]; n++;
    }
    return n;
  }

  // --- the ground: decking, stairs, platforms, levees, spans and lifts
  function groundOK(type, x, y, dragLvl) {
    if (!inb(x, y)) return 'off the mountain';
    const i = idx(x, y);
    const g = GROUND[type];
    if (!known(g.tech)) return 'not worked out yet';
    if (S.occ[i]) return 'a building is standing there';
    if (S.plots[i]) return 'that is a terrace plot';
    if (S.ground[i]) return 'there is already something there';
    if (type === 'bridge') {
      if (S.kind[i] !== K.VOID) return 'a span only goes over the chasm';
      return null;
    }
    if (S.kind[i] === K.VOID) return 'that is the chasm — it wants a span';
    if (S.kind[i] === K.GROWTH) return 'the growth has to be cut first';
    if (S.kind[i] === K.WRECK) return 'the wreck has to be stripped first';
    if (S.water[i] > FORD) return 'that is under water';
    if (type === 'stair') {
      const base = S.lvl[i] + S.plat[i];
      let up = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const j = idx(nx, ny);
        if (S.kind[j] === K.VOID) continue;
        if (S.lvl[j] + S.plat[j] === base + 1) up = true;
      }
      if (!up) return 'nothing to climb to from there';
    }
    if (type === 'plat') {
      const stacked = S.plat[i];
      if (stacked >= (known('scaffold') ? 2 : 1)) {
        return known('scaffold') ? 'platforms only stack two high' : 'a second platform wants metal scaffold';
      }
    }
    return null;
  }
  function platCost(x, y) {
    return S.plat[idx(x, y)] >= 1 ? { timber: 3, alloy: 2 } : GROUND.plat.cost;
  }
  function groundCost(type, x, y) {
    return type === 'plat' ? platCost(x, y) : GROUND[type].cost;
  }

  function placeGround(type, x0, y0, x1, y1, dragLvl) {
    const r = rectOf(x0, y0, x1, y1);
    const reach = reachable();
    const nextTo = (x, y) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inb(x + dx, y + dy) && reach[idx(x + dx, y + dy)]) return true;
      }
      return false;
    };
    let laid = 0, short = false, why = '', outOfReach = 0;
    const madeHere = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const bad = groundOK(type, x, y);
      if (bad) { why = why || bad; continue; }
      // a run of decking is laid outwards from ground somebody is already standing on
      if (!nextTo(x, y)) { outOfReach++; continue; }
      const cost = groundCost(type, x, y);
      if (!canAfford(cost)) { short = true; continue; }
      pay(cost);
      const i = idx(x, y);
      S.ground[i] = type;
      S.gwork[i] = GROUND[type].work;
      if (type === 'plat') S.plat[i] = S.plat[i] + 1;
      if (type === 'bridge') S.blvl[i] = pickSpanLevel(x, y, dragLvl);
      madeHere.push(i);
      laid++;
    }
    if (laid && type === 'dam') {
      const cut = stranded();
      if (cut) {
        for (const i of madeHere) { refund(groundCost(type, i % COLS, Math.floor(i / COLS)), 1); S.ground[i] = null; S.gwork[i] = 0; }
        setHint(`That levee would wall off the ${cut.toLowerCase()}. Leave a way round it.`, true);
        return;
      }
    }
    if (laid) { UI.structure++; groundDirty = true; setHint(`${plural(laid, GROUND[type].name.toLowerCase())} marked out — somebody will come and lay ${laid === 1 ? 'it' : 'them'}.`); }
    else if (short) setHint('Not enough materials — ' + missing(groundCost(type, r.x, r.y)) + '.', true);
    else if (outOfReach) setHint('Nobody can reach that yet. Work outwards from ground the crew can already stand on.', true);
    else setHint(why ? `Cannot go there: ${why}.` : 'Nothing to lay there.', true);
  }
  // A span stands at the level of the solid ground it was started from.
  function pickSpanLevel(x, y, dragLvl) {
    if (dragLvl !== undefined && dragLvl !== null) return dragLvl;
    let best = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      const j = idx(nx, ny);
      if (S.kind[j] === K.VOID) { if (S.ground[j] === 'bridge') { const l = S.blvl[j]; if (best === null || l > best) best = l; } continue; }
      const l = S.lvl[j] + S.plat[j];
      if (best === null || l > best) best = l;
    }
    return best === null ? 0 : best;
  }

  // --- terrace plots
  function fieldOK(x, y, lvl) {
    if (!inb(x, y)) return false;
    const i = idx(x, y);
    if (S.kind[i] !== K.OPEN) return false;
    if (S.occ[i] || S.plots[i] || S.ground[i]) return false;
    if (S.water[i] > 0.1) return false;
    if (lvl !== undefined && S.lvl[i] + S.plat[i] !== lvl) return false;
    return true;
  }
  function placeField(x0, y0, x1, y1) {
    const r = rectOf(x0, y0, x1, y1);
    const lvl = inb(x0, y0) ? S.lvl[idx(x0, y0)] + S.plat[idx(x0, y0)] : 0;
    const reach = reachable();
    const tiles = [];
    let uneven = false, outOfReach = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!fieldOK(x, y)) { uneven = true; continue; }
      if (S.lvl[idx(x, y)] + S.plat[idx(x, y)] !== lvl) { uneven = true; continue; }
      // A plot nobody can walk to is never sown, never watered and never harvested; it
      // just quietly swallows the timber. Same rule as everything else built here.
      if (!reach[idx(x, y)]) { outOfReach++; continue; }
      tiles.push(idx(x, y));
    }
    if (!tiles.length) {
      setHint(outOfReach
        ? 'Nobody can get to that ground yet — it wants a stair, a platform or a span onto that terrace first.'
        : uneven ? 'A terrace plot wants clear, level, dry ground — the whole of it on one step.'
        : 'Nothing can be laid out there.', true);
      return;
    }
    const cost = { timber: PLOT_COST.timber * tiles.length };
    if (!canAfford(cost)) { setHint(`That plot wants ${cost.timber} timber — ${missing(cost)}.`, true); return; }
    pay(cost);
    const f = { id: S.nextId++, x: r.x, y: r.y, w: r.w, h: r.h, crop: 'fern', wet: 0, worker: null, tiles: tiles.length, drowned: 0 };
    S.fields.push(f);
    for (const i of tiles) S.plots[i] = { stage: 0, growth: 0, crop: null, field: f.id };
    UI.structure++; groundDirty = true;
    setHint(uneven
      ? `Terrace plot laid out over ${plural(tiles.length, 'tile')} — the rest of that rectangle was not clear, level and dry.`
      : `Terrace plot laid out — ${plural(tiles.length, 'tile')}, sown with ash fern. Click it to change what goes in.`);
  }

  // --- buildings
  function buildOK(type, x, y) {
    const def = BUILDINGS[type];
    if (!def) return 'no such thing';
    if (!known(def.tech)) return 'the crew do not know how yet';
    if (def.unique && S.buildings.some((b) => b.type === type)) return `there is only ever one ${def.name.toLowerCase()}`;
    if (x < 0 || y < 0 || x + def.w > COLS || y + def.h > ROWS) return 'it would hang off the mountain';
    let lvl = null;
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const i = idx(x + dx, y + dy);
      if (S.kind[i] === K.VOID) return 'part of it is over the chasm';
      if (S.kind[i] === K.GROWTH) return 'the growth has to be cut first';
      if (S.kind[i] === K.WRECK) return 'the wreck has to be stripped first';
      if (S.occ[i] && !(UI.moving && S.occ[i] === UI.moving)) return 'something is already standing there';
      if (S.plots[i]) return 'that is a terrace plot';
      if (S.water[i] > 0.1) return 'that ground is under water';
      if (S.ground[i] === 'dam' || S.ground[i] === 'bridge' || S.ground[i] === 'lift') return 'clear the structure there first';
      const l = S.lvl[i] + S.plat[i];
      if (lvl === null) lvl = l;
      else if (l !== lvl) return 'the ground under it is not level — platform it first';
    }
    if (type === 'beacon' && lvl !== LEVELS - 1) return 'the beacon has to stand on the top terrace';
    return null;
  }
  // ...and nothing gets built where nobody can walk. Paying for a bunkhouse on a ledge the
  // crew cannot climb to is the one mistake the mountain will not tell you about.
  function buildReachable(type, x, y, region) {
    const def = BUILDINGS[type];
    return touches({ x, y, w: def.w, h: def.h }, region);
  }
  // Would putting this here cut something else off? A ring of huts round the command deck
  // seals every door it has, and a levee across the wrong tile walls in half the colony.
  // Either way the crew stop being able to reach their own front step, so it is refused.
  function stranded() {
    const reach = colonyRegion();
    // People first. A hut dropped across a one-tile neck while somebody is out on the far
    // side of it leaves them there for good: they can still cut and carry in their pocket,
    // so nothing looks broken, and the colony quietly stops growing.
    // Judge that the way the crew actually move, wading included — somebody standing in
    // deep water is on a tile nothing can walk to, and testing them strictly meant every
    // placement anywhere was refused for as long as one person had wet feet.
    for (const c of S.crew) {
      const t = tileOf(c);
      if (!reach[idx(t.x, t.y)]) return 'crew out on the far side of it';
    }
    const deck = deckB();
    if (deck && !touches(deck, reach)) return BUILDINGS.deck.name;
    for (const b of S.buildings) {
      if (b.type === 'deck') continue;
      if (!touches(b, reach)) return BUILDINGS[b.type].name;
    }
    return null;
  }

  function placeBuilding(type, cx, cy) {
    const def = BUILDINGS[type];
    const x = cx - Math.floor((def.w - 1) / 2), y = cy - Math.floor((def.h - 1) / 2);
    const bad = buildOK(type, x, y);
    if (bad) { setHint(`Cannot build there: ${bad}.`, true); return null; }
    if (S.buildings.length && !buildReachable(type, x, y, colonyRegion())) {
      setHint('Nobody can get to that spot. It wants a stair, a platform or a span onto that terrace first.', true);
      return null;
    }
    if (!canAfford(def.cost)) { setHint(`${def.name} wants ${costText(def.cost)} — ${missing(def.cost)}.`, true); return null; }
    const b = {
      id: S.nextId++, type, x, y, w: def.w, h: def.h,
      built: false, work: BUILD_WORK * def.w * def.h,
      in: {}, made: 0, ready: 0, stock: 0, residents: [], worker: null, charge: 0, state: '',
    };
    // Stand it there on paper first: nothing is paid for and no decking is lifted until
    // it is clear the footprint does not shut anybody in.
    S.buildings.push(b);
    stamp(b, b.id);
    const cut = stranded();
    if (cut) {
      stamp(b, 0);
      S.buildings.pop();
      S.nextId--;
      setHint(`That would wall off the ${cut.toLowerCase()} — nobody could get to it afterwards.`, true);
      return null;
    }
    pay(def.cost);
    // decking under the footprint goes back on the pile
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const i = idx(x + dx, y + dy);
      if (S.ground[i]) { refund(groundCost(S.ground[i], x + dx, y + dy)); S.ground[i] = null; S.gwork[i] = 0; }
      S.mark[i] = 0;
    }
    UI.structure++; groundDirty = true;
    setHint(`${def.name} marked out. Somebody will come and raise it.`);
    return b;
  }

  function moveBuilding(id, cx, cy) {
    const b = building(id);
    if (!b) { setTool('select'); return; }
    const def = BUILDINGS[b.type];
    const x = cx - Math.floor((def.w - 1) / 2), y = cy - Math.floor((def.h - 1) / 2);
    const oldX = b.x, oldY = b.y;
    stamp(b, 0);
    b.x = x; b.y = y;
    const bad = buildOK(b.type, x, y);
    if (bad) { b.x = oldX; b.y = oldY; stamp(b, b.id); setHint(`Cannot stand it there: ${bad}.`, true); return; }
    if (!buildReachable(b.type, x, y, colonyRegion())) {
      b.x = oldX; b.y = oldY; stamp(b, b.id);
      setHint('Nobody could get to it over there.', true);
      return;
    }
    const fee = moveFee(b.type);
    if (!canAfford(fee)) { b.x = oldX; b.y = oldY; stamp(b, b.id); setHint(`Moving it wants ${costText(fee)} — ${missing(fee)}.`, true); return; }
    pay(fee);
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const i = idx(x + dx, y + dy);
      if (S.ground[i]) { refund(groundCost(S.ground[i], x + dx, y + dy)); S.ground[i] = null; S.gwork[i] = 0; }
    }
    stamp(b, b.id);
    UI.moving = null; setTool('select');
    UI.structure++; groundDirty = true;
    setHint(`${def.name} jacked up and rolled over.`);
  }
  // Rolling something across a terrace costs a quarter of what it took to build.
  function moveFee(type) {
    const out = {};
    for (const m in BUILDINGS[type].cost) {
      const n = Math.ceil(BUILDINGS[type].cost[m] / 4);
      if (n > 0) out[m] = n;
    }
    if (!Object.keys(out).length) out.timber = 2;
    return out;
  }

  // --- taking things away
  function demolishBuilding(id) {
    const b = building(id);
    if (!b || b.type === 'deck') return false;
    const def = BUILDINGS[b.type];
    refund(def.cost, b.built ? 0.5 : 1);
    // whatever was inside it comes back too
    for (const m in b.in) S.store[m] = (S.store[m] || 0) + b.in[m];
    if (b.stock) { const f = cheapestFood() || 'fern'; S.store[f] += b.stock; }
    for (const id2 of b.residents) { const c = S.crew.find((x) => x.id === id2); if (c) c.home = null; }
    if (b.worker) { const c = S.crew.find((x) => x.id === b.worker); if (c) c.slot = null; }
    stamp(b, 0);
    S.buildings = S.buildings.filter((x) => x.id !== b.id);
    for (const c of S.crew) if (c.task && c.task.to === b.id) cancelTask(c);
    UI.sel = null; UI.structure++; groundDirty = true;
    return true;
  }
  function demolishField(id) {
    const f = fieldOf(id);
    if (!f) return false;
    let n = 0;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
      const i = idx(x, y);
      if (S.plots[i] && S.plots[i].field === f.id) { S.plots[i] = null; delete CLAIMS['p:' + i]; n++; }
    }
    S.store.timber += Math.floor(n * PLOT_COST.timber / 2);
    if (f.worker) { const c = S.crew.find((x) => x.id === f.worker); if (c) c.slot = null; }
    S.fields = S.fields.filter((x) => x.id !== f.id);
    for (const c of S.crew) if (c.task && (c.task.field === f.id || c.task.to === f.id)) cancelTask(c);
    UI.sel = null; UI.structure++; groundDirty = true;
    return true;
  }
  function demolishAt(x, y) {
    if (!inb(x, y)) return false;
    const i = idx(x, y);
    if (S.mark[i]) { unmarkArea(x, y, x, y); UI.structure++; setHint('Unmarked.'); return true; }
    const bid = S.occ[i];
    if (bid) {
      const b = building(bid);
      if (b && b.type === 'deck') { setHint('The command deck stays where it is.', true); return true; }
      return demolishBuilding(bid);
    }
    if (S.plots[i]) return demolishField(S.plots[i].field);
    if (S.ground[i]) {
      const type = S.ground[i];
      refund(groundCost(type, x, y), S.gwork[i] > 0 ? 1 : 0.5);
      if (type === 'plat') S.plat[i] = Math.max(0, S.plat[i] - 1);
      S.ground[i] = null; S.gwork[i] = 0;
      delete CLAIMS['g:' + i];
      UI.structure++; groundDirty = true;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ what is known
  function techOK(id) {
    const t = TECH[id];
    if (!t || S.tech[id]) return 'already known';
    if (!firstOf('lab')) return 'there is no data lab';
    for (const n of t.needs || []) if (!S.tech[n]) return `${TECH[n].name} first`;
    if (have('core') < t.cost) return `${t.cost - have('core')} more cores`;
    return null;
  }
  function buyTech(id) {
    const bad = techOK(id);
    if (bad) { setHint('Not yet — ' + bad + '.', true); return false; }
    S.store.core -= TECH[id].cost;
    S.tech[id] = true;
    log(`${TECH[id].name} decoded.`, 'good');
    UI.structure++; UI.labKey = '';
    renderToolbar();
    return true;
  }

  // ------------------------------------------------------------- posting crew
  function assignCrew(crewId, fac) {
    const c = S.crew.find((x) => x.id === crewId);
    if (!c) return;
    unassignCrew(crewId);
    if (fac) {
      // one post each way round
      if (fac.kind === 'building') { const b = building(fac.id); if (b) { if (b.worker) unassignCrew(b.worker); b.worker = c.id; } }
      else { const f = fieldOf(fac.id); if (f) { if (f.worker) unassignCrew(f.worker); f.worker = c.id; } }
      c.slot = fac;
    }
    cancelTask(c);
    UI.structure++;
  }
  function unassignCrew(crewId) {
    const c = S.crew.find((x) => x.id === crewId);
    if (!c) return;
    for (const b of S.buildings) if (b.worker === crewId) b.worker = null;
    for (const f of S.fields) if (f.worker === crewId) f.worker = null;
    c.slot = null;
    UI.structure++;
  }
  function postName(slot) {
    if (!slot) return 'anywhere';
    if (slot.kind === 'building') { const b = building(slot.id); return b ? BUILDINGS[b.type].name : 'anywhere'; }
    const f = fieldOf(slot.id);
    return f ? `Terrace ${f.w}×${f.h}` : 'anywhere';
  }

  // ------------------------------------------------------------ drawing
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');

  // Everything is drawn at map scale into a backing store a couple of times smaller than
  // the screen and blown up with nearest-neighbour, which is what keeps the chunky look.
  const MAP_W = COLS * TILE, MAP_H = ROWS * TILE;
  function resize() {
    const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight);
    const want = (w < 760 ? 1.7 : w < 1500 ? 2.1 : 2.5) * UI.zoom;
    const z = Math.max(want, w / MAP_W, h / MAP_H);
    canvas.width = Math.min(MAP_W, Math.round(w / z));
    canvas.height = Math.min(MAP_H, Math.round(h / z));
    VIEW_W = canvas.width / TILE; VIEW_H = canvas.height / TILE;
    UI.cam.x = clamp(UI.cam.x, 0, camMaxX());
    UI.cam.y = clamp(UI.cam.y, 0, camMaxY());
  }
  resize();
  window.addEventListener('resize', resize);
  function changeZoom(d, sx, sy) {
    const before = UI.zoom;
    UI.zoom = clamp(d === 0 ? DEFAULT_ZOOM : before * (d > 0 ? ZOOM_STEP : 1 / ZOOM_STEP), ZOOM_MIN, ZOOM_MAX);
    if (UI.zoom === before) return;
    const cw = canvas.width, ch = canvas.height;
    const fx = sx == null ? 0.5 : sx / cw, fy = sy == null ? 0.5 : sy / ch;
    const ax = fx * cw + camOx(), ay = fy * ch + camOy();
    resize();
    UI.cam.x = clamp((ax - fx * canvas.width) / TILE, 0, camMaxX());
    UI.cam.y = clamp((ay - fy * canvas.height) / TILE, 0, camMaxY());
  }

  const ground = document.createElement('canvas');
  ground.width = MAP_W; ground.height = MAP_H;
  const gctx = ground.getContext('2d');
  let groundDirty = true, groundKey = '';
  let clockT = 0;

  const FLOATS = [];
  const FLOAT_LIFE = 1.6;
  function float(x, y, text, color) { FLOATS.push({ x, y, text, color, born: clockT }); }
  function drawFloats(c) {
    c.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center';
    for (let i = FLOATS.length - 1; i >= 0; i--) {
      const f = FLOATS[i], age = (clockT - f.born) / FLOAT_LIFE;
      if (age >= 1 || age < 0) { FLOATS.splice(i, 1); continue; }
      const x = f.x * TILE, y = f.y * TILE - 6 - age * 18;
      c.globalAlpha = 1 - age * age;
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3; c.strokeText(f.text, x, y);
      c.fillStyle = f.color; c.fillText(f.text, x, y);
      c.globalAlpha = 1;
    }
    c.textAlign = 'left';
  }

  // Fixed per-tile noise so speckles and fronds do not crawl about.
  const NOISE = [];
  {
    let seed = 20260918;
    for (let i = 0; i < N_TILES * 4; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      NOISE.push((seed % 1000) / 1000);
    }
  }
  const nz = (i, k) => NOISE[(i * 4 + k) % NOISE.length];

  // ---------------------------------------------------------------- palette
  // Four terraces: wet moss in the basin, jungle on the lower steps, dry stone on the peak.
  const TERRACE = [
    { top: '#41543c', spec: '#4c6045', lip: '#728a63', side: '#20281c', foot: '#12170f' },
    { top: '#5c7a45', spec: '#688750', lip: '#93b070', side: '#2b3320', foot: '#191d12' },
    { top: '#83895a', spec: '#8f9565', lip: '#bcc28c', side: '#3c3e28', foot: '#232416' },
    { top: '#9d9a7c', spec: '#a9a688', lip: '#d6d2b4', side: '#4d4c3a', foot: '#2e2d22' },
  ];
  const STEP_PX = 9;                        // how tall one terrace step is drawn
  const INK = '#221c16';

  function drawGround() {
    const g = gctx;
    g.clearRect(0, 0, MAP_W, MAP_H);
    g.imageSmoothingEnabled = false;

    // 1. the flat top of every tile
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y), px = x * TILE, py = y * TILE;
      if (S.kind[i] === K.VOID) { drawVoidTile(g, x, y); continue; }
      const t = TERRACE[clamp(S.lvl[i] + S.plat[i], 0, LEVELS - 1)];
      g.fillStyle = t.top;
      g.fillRect(px, py, TILE, TILE);
      // the lie of the land, so a terrace reads as ground rather than lino
      const sh = S.tilt[i] - 0.11;
      g.fillStyle = sh > 0 ? `rgba(255,246,214,${Math.min(0.13, sh * 0.9)})` : `rgba(0,0,0,${Math.min(0.15, -sh * 1.0)})`;
      g.fillRect(px, py, TILE, TILE);
      // speckle
      g.fillStyle = t.spec;
      for (let k = 0; k < 3; k++) {
        const sx = px + Math.floor(nz(i, k) * (TILE - 5));
        const sy = py + Math.floor(nz(i, (k + 1) % 4) * (TILE - 5));
        g.fillRect(sx, sy, 3 + Math.floor(nz(i, k) * 3), 3);
      }
      groundDetail(g, px, py, i, clamp(S.lvl[i] + S.plat[i], 0, LEVELS - 1), t);
    }

    // 2. the faces of every step, drawn down the map so the near ones win
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y);
      if (S.kind[i] === K.VOID) continue;
      const here = S.lvl[i] + S.plat[i];
      const t = TERRACE[clamp(here, 0, LEVELS - 1)];
      const px = x * TILE, py = y * TILE;
      // south face
      const below = inb(x, y + 1) ? (S.kind[idx(x, y + 1)] === K.VOID ? null : S.lvl[idx(x, y + 1)] + S.plat[idx(x, y + 1)]) : null;
      if (below !== null && below < here) {
        const drop = Math.min(here - below, 3) * STEP_PX;
        g.fillStyle = t.side;
        g.fillRect(px, py + TILE, TILE, drop);
        g.fillStyle = t.foot;
        g.fillRect(px, py + TILE + drop - 3, TILE, 3);
        g.fillStyle = t.lip;
        g.fillRect(px, py + TILE - 3, TILE, 3);
        g.fillStyle = INK;
        g.fillRect(px, py + TILE, TILE, 1);
        // a few courses in the rock face
        g.fillStyle = 'rgba(0,0,0,0.16)';
        for (let d = STEP_PX; d < drop; d += STEP_PX) g.fillRect(px, py + TILE + d - 1, TILE, 1);
      }
      // east and west edges get a hard line where the step changes
      for (const dx of [-1, 1]) {
        if (!inb(x + dx, y)) continue;
        const j = idx(x + dx, y);
        const there = S.kind[j] === K.VOID ? null : S.lvl[j] + S.plat[j];
        if (there === null || there >= here) continue;
        g.fillStyle = t.side;
        g.fillRect(dx < 0 ? px : px + TILE - 3, py, 3, TILE);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(dx < 0 ? px - 2 : px + TILE, py, 2, TILE);
      }
      // north edge of a step catches the light
      const above = inb(x, y - 1) ? (S.kind[idx(x, y - 1)] === K.VOID ? null : S.lvl[idx(x, y - 1)] + S.plat[idx(x, y - 1)]) : null;
      if (above !== null && above > here) {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(px, py, TILE, 3);
      }
    }

    // 3. what is standing on the ground
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y);
      if (S.plots[i]) drawSoil(g, x, y);
      if (S.ground[i] && S.ground[i] !== 'lift') drawGroundThing(g, x, y, S.ground[i], S.gwork[i] > 0);
      if (S.kind[i] === K.GROWTH) drawGrowth(g, x, y);
      else if (S.kind[i] === K.WRECK) drawWreck(g, x, y);
    }
    groundDirty = false;
    groundKey = groundStamp();
  }
  const groundStamp = () => `${UI.structure}`;

  // What is actually on the ground. The peak is bare stone and scree; the lower terraces
  // are increasingly overgrown. Without this every terrace reads as a flat colour swatch.
  function groundDetail(g, px, py, i, lvl, t) {
    const a = nz(i, 0), b = nz(i, 1), c = nz(i, 2), d = nz(i, 3);
    if (lvl >= 2) {
      // cracked stone: a couple of hairline fissures and some loose scree
      g.fillStyle = 'rgba(0,0,0,0.26)';
      const cx = px + 3 + ((a * (TILE - 10)) | 0), cy = py + 4 + ((b * (TILE - 12)) | 0);
      const run = 6 + ((c * 9) | 0);
      if (a > 0.3) g.fillRect(cx, cy, run, 1);
      if (b > 0.36) g.fillRect(cx + (run >> 1), cy, 1, 4 + ((d * 6) | 0));
      if (c > 0.62) g.fillRect(cx - 3 - ((d * 4) | 0), cy + 2, 4, 1);
      g.fillStyle = t.lip;
      for (let k = 0; k < 4; k++) {
        if (nz(i, k) < 0.3) continue;
        const sz = nz(i, (k + 1) % 4) > 0.7 ? 3 : 2;
        g.fillRect(px + 2 + ((nz(i, (k + 2) % 4) * (TILE - 6)) | 0), py + 3 + ((nz(i, k) * (TILE - 7)) | 0), sz, 2);
      }
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let k = 0; k < 2; k++) {
        if (nz(i, k + 1) < 0.5) continue;
        g.fillRect(px + 3 + ((nz(i, k) * (TILE - 9)) | 0), py + 5 + ((nz(i, (k + 3) % 4) * (TILE - 10)) | 0) + 2, 3, 1);
      }
      g.fillStyle = 'rgba(0,0,0,0.16)';
      if (c > 0.5) g.fillRect(px + 5 + ((d * 16) | 0), py + 18 + ((a * 8) | 0), 5, 2);
    }
    if (lvl <= 2) {
      // tufts, thicker the further down the mountain you are
      const tufts = lvl === 0 ? 5 : lvl === 1 ? 4 : 2;
      for (let k = 0; k < tufts; k++) {
        const n1 = nz(i, k % 4), n2 = nz(i, (k + 1) % 4);
        if (n1 < 0.3) continue;
        const gx = px + 2 + ((n1 * (TILE - 6)) | 0), gy = py + 5 + ((n2 * (TILE - 11)) | 0);
        g.fillStyle = lvl === 0 ? '#3d5c38' : lvl === 1 ? '#4c7a3c' : '#6b8450';
        g.fillRect(gx, gy, 1, 4);
        g.fillRect(gx - 2, gy + 1, 1, 3);
        g.fillRect(gx + 2, gy + 1, 1, 3);
      }
    }
    if (lvl === 0 && a > 0.7) {
      // silt and coolant staining down in the basin
      g.fillStyle = 'rgba(120,140,70,0.22)';
      g.fillRect(px + 3 + ((b * 14) | 0), py + 6 + ((c * 14) | 0), 7, 5);
    }
  }

  function drawVoidTile(g, x, y) {
    const px = x * TILE, py = y * TILE, i = idx(x, y);
    g.fillStyle = '#100f14';
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = '#1b1a22';
    g.fillRect(px + 2 + Math.floor(nz(i, 0) * 6), py + 4, 10 + Math.floor(nz(i, 1) * 8), TILE - 8);
    // a rim of broken rock where the chasm meets solid ground
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inb(x + dx, y + dy) || S.kind[idx(x + dx, y + dy)] === K.VOID) continue;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      if (dx) g.fillRect(dx < 0 ? px : px + TILE - 5, py, 5, TILE);
      else g.fillRect(px, dy < 0 ? py : py + TILE - 5, TILE, 5);
    }
  }

  function drawSoil(g, x, y) {
    const px = x * TILE, py = y * TILE, i = idx(x, y);
    g.fillStyle = '#5a4430';
    g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    g.fillStyle = '#4a3726';
    for (let r = 0; r < 4; r++) g.fillRect(px + 2, py + 4 + r * 7, TILE - 4, 2);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(px + 1, py + 1, TILE - 2, 2);
    g.fillStyle = '#6b5340';
    g.fillRect(px + 2 + Math.floor(nz(i, 2) * 18), py + 3 + Math.floor(nz(i, 3) * 20), 3, 2);
  }

  // The jungle. Layered canopy with a hard ink edge wherever it meets open ground, so a
  // cut line reads at a glance and a block of it reads as a mass rather than a green tile.
  const GROWTH_INK = '#13230f';
  function drawGrowth(g, x, y) {
    const px = x * TILE, py = y * TILE, i = idx(x, y);
    const under = '#1b3418', mid = '#27501f', lit = '#3f7a2e', hot = '#5aa03a', pale = '#7fbe4c';
    // the mass
    g.fillStyle = under;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = mid;
    g.fillRect(px, py + 3, TILE, TILE - 3);

    // three rounded crowns, offset per tile so no two tiles repeat
    for (let k = 0; k < 3; k++) {
      const n1 = nz(i, k), n2 = nz(i, (k + 1) % 4);
      const cx = px + 7 + ((n1 * (TILE - 14)) | 0);
      const cy = py + 9 + ((n2 * (TILE - 18)) | 0);
      const r = 5 + ((n1 * 3) | 0);
      g.fillStyle = GROWTH_INK;
      g.beginPath(); g.arc(cx, cy, r + 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = k === 1 ? hot : lit;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      // the light comes from the north-west, as it does on every building here
      g.fillStyle = pale;
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.35, r * 0.46, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.arc(cx + r * 0.3, cy + r * 0.4, r * 0.4, 0, Math.PI * 2); g.fill();
    }
    // fronds breaking the silhouette
    g.fillStyle = hot;
    for (let k = 0; k < 4; k++) {
      const n1 = nz(i, (k + 2) % 4), n2 = nz(i, (k + 3) % 4);
      if (n1 < 0.35) continue;
      const fx = px + 3 + ((n1 * (TILE - 8)) | 0), fy = py + 4 + ((n2 * (TILE - 12)) | 0);
      g.fillStyle = GROWTH_INK; g.fillRect(fx - 1, fy - 1, 8, 3);
      g.fillStyle = k % 2 ? pale : hot; g.fillRect(fx, fy, 6, 1);
      g.fillRect(fx + 2, fy - 3, 1, 7);
    }
    // vines down the face
    g.fillStyle = '#1f3d1a';
    for (let k = 0; k < 3; k++) {
      if (nz(i, k) < 0.4) continue;
      g.fillRect(px + 4 + k * 9, py + TILE - 8, 2, 8);
    }
    inkEdge(g, x, y, K.GROWTH, GROWTH_INK);
  }

  // A hard dark line wherever a block of something meets ground you can walk on. This is
  // most of what makes the map read as chunky pixel art rather than a tile grid.
  function inkEdge(g, x, y, kind, ink) {
    g.fillStyle = ink;
    const px = x * TILE, py = y * TILE;
    const same = (nx, ny) => inb(nx, ny) && S.kind[idx(nx, ny)] === kind;
    if (!same(x, y - 1)) g.fillRect(px, py, TILE, 2);
    if (!same(x, y + 1)) g.fillRect(px, py + TILE - 2, TILE, 2);
    if (!same(x - 1, y)) g.fillRect(px, py, 2, TILE);
    if (!same(x + 1, y)) g.fillRect(px + TILE - 2, py, 2, TILE);
  }

  // The Meridian. Oxidised plate, rust streaks, and the odd lit panel in a mainframe bay.
  function drawWreck(g, x, y) {
    const px = x * TILE, py = y * TILE, i = idx(x, y), t = S.wtype[i];
    const plate = t === W.CONDUIT ? '#3d4a4e' : '#46706e';
    const lo = t === W.CONDUIT ? '#2b3538' : '#2f4f4e';
    g.fillStyle = INK;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = plate;
    g.fillRect(px + 1, py + 1, TILE - 2, TILE - 3);
    g.fillStyle = lo;
    g.fillRect(px + 1, py + TILE - 6, TILE - 2, 4);
    // panel lines and rivets
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(px + 1, py + 11 + Math.floor(nz(i, 0) * 6), TILE - 2, 2);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.fillRect(px + 1, py + 1, TILE - 2, 2);
    g.fillStyle = '#20302f';
    for (let k = 0; k < 4; k++) g.fillRect(px + 4 + k * 7, py + 4, 2, 2);
    // rust
    g.fillStyle = 'rgba(176,86,40,0.5)';
    g.fillRect(px + 3 + Math.floor(nz(i, 1) * 18), py + 6, 4, 12 + Math.floor(nz(i, 2) * 8));
    if (t === W.CONDUIT) {
      g.fillStyle = '#c4762f';
      g.fillRect(px + 2, py + 16, TILE - 4, 3);
      g.fillStyle = '#e0913f';
      g.fillRect(px + 2, py + 16, TILE - 4, 1);
      g.fillStyle = '#8a4d1f';
      g.fillRect(px + 9, py + 19, 3, 6);
    } else if (t === W.MAINFRAME) {
      g.fillStyle = '#12232c';
      g.fillRect(px + 5, py + 8, TILE - 10, TILE - 15);
      g.fillStyle = '#2f6f8a';
      g.fillRect(px + 7, py + 10, TILE - 14, 3);
      g.fillRect(px + 7, py + 15, TILE - 18, 3);
      g.fillStyle = '#79d2ff';
      g.fillRect(px + 7, py + 10, 5, 3);
    }
    inkEdge(g, x, y, K.WRECK, '#101c1d');
  }

  function drawGroundThing(g, x, y, type, unfinished) {
    const px = x * TILE, py = y * TILE, i = idx(x, y);
    if (unfinished) {
      g.globalAlpha = 0.42;
    }
    if (type === 'deck' || type === 'bridge') {
      const base = type === 'bridge' ? '#8a6a3f' : '#9a7745';
      g.fillStyle = '#4a3520';
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = base;
      g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 1; k < 4; k++) g.fillRect(px + 1, py + k * 8, TILE - 2, 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(px + 1, py + 1, TILE - 2, 2);
      if (type === 'bridge') {
        g.fillStyle = '#6b4f2c';
        g.fillRect(px, py, TILE, 3);
        g.fillRect(px, py + TILE - 3, TILE, 3);
        g.fillStyle = '#c0a068';
        for (let k = 0; k < 3; k++) { g.fillRect(px + 4 + k * 11, py - 3, 3, 5); g.fillRect(px + 4 + k * 11, py + TILE - 2, 3, 5); }
      }
    } else if (type === 'stair') {
      g.fillStyle = '#5c4629';
      g.fillRect(px, py, TILE, TILE);
      for (let s = 0; s < 4; s++) {
        g.fillStyle = ['#7d5f34', '#8d6c3c', '#9d7a45', '#ad884e'][s];
        g.fillRect(px + 1, py + TILE - 2 - (s + 1) * 7, TILE - 2, 7);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(px + 1, py + TILE - 2 - (s + 1) * 7, TILE - 2, 2);
      }
      g.fillStyle = '#c7a36a';
      g.fillRect(px + 1, py + 1, TILE - 2, 2);
    } else if (type === 'plat') {
      // the tile is already drawn a step higher; this is the timber under it
      g.fillStyle = '#7a5c33';
      g.fillRect(px, py + TILE - 2, TILE, STEP_PX + 2);
      g.fillStyle = '#5a4225';
      for (let k = 0; k < 4; k++) g.fillRect(px + 2 + k * 8, py + TILE, 3, STEP_PX);
      g.fillStyle = '#a07d46';
      g.fillRect(px, py + TILE - 3, TILE, 3);
    } else if (type === 'dam') {
      g.fillStyle = '#3d2c19';
      g.fillRect(px + 1, py + 4, TILE - 2, TILE - 6);
      g.fillStyle = '#7a5c33';
      g.fillRect(px + 2, py + 5, TILE - 4, TILE - 9);
      g.fillStyle = '#5a4225';
      for (let k = 0; k < 3; k++) g.fillRect(px + 2, py + 7 + k * 7, TILE - 4, 2);
      g.fillStyle = '#a07d46';
      g.fillRect(px + 2, py + 5, TILE - 4, 2);
    }
    if (unfinished) {
      g.globalAlpha = 1;
      g.strokeStyle = '#e0c88a'; g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
      g.setLineDash([]);
      g.fillStyle = '#e0c88a';
      g.fillRect(px + TILE / 2 - 1, py + 4, 2, 6);
    }
  }

  // ------------------------------------------------------------ water
  // Drawn live, because it moves. Clean water on a terrace is blue; whatever is sitting
  // in the basin has the drive coolant in it and is not.
  function drawWater(c) {
    const x0 = Math.max(0, Math.floor(UI.cam.x) - 1), x1 = Math.min(COLS, Math.ceil(UI.cam.x + VIEW_W) + 1);
    const y0 = Math.max(0, Math.floor(UI.cam.y) - 1), y1 = Math.min(ROWS, Math.ceil(UI.cam.y + VIEW_H) + 1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      const w = S.water[i];
      if (w <= 0.05 || S.kind[i] === K.VOID) continue;
      const px = x * TILE, py = y * TILE;
      const deep = clamp(w / 1.2, 0, 1);
      const tox = isToxic(i);
      const shallow = tox ? '#6c7a4a' : '#4f8fae';
      const deepC = tox ? '#3d4a2c' : '#2d5f86';
      // a run of water an inch deep is a dark wet sheen; a pond you cannot wade is solid
      c.globalAlpha = w < 0.14 ? 0.12 + w * 1.6 : clamp(0.45 + deep * 0.5, 0.4, 0.95);
      c.fillStyle = deep > 0.5 ? deepC : shallow;
      c.fillRect(px, py, TILE, TILE);
      c.globalAlpha = 1;
      if (w > 0.12 && w < PUDDLE) {
        // and it moves, so a run of water reads as running rather than as a stain
        c.fillStyle = tox ? 'rgba(180,205,120,0.3)' : 'rgba(175,220,240,0.3)';
        const t2 = (clockT * 0.9 + nz(i, 2) * 3) % 1;
        c.fillRect(px + 6, py + (t2 * TILE | 0), TILE - 12, 1);
      }
      // a moving glint so standing water does not look like paint
      const t = clockT * 1.1 + nz(i, 0) * 9;
      c.fillStyle = tox ? 'rgba(190,210,140,0.32)' : 'rgba(190,225,245,0.34)';
      const gy = py + 6 + ((Math.sin(t) * 0.5 + 0.5) * (TILE - 14) | 0);
      c.fillRect(px + 3, gy, TILE - 8, 2);
      if (tox) {
        c.fillStyle = 'rgba(150,190,90,0.3)';
        c.fillRect(px + 6 + ((nz(i, 1) * 12) | 0), py + 8 + ((Math.sin(t * 0.6) * 4) | 0), 5, 4);
      }
    }
  }

  // ---------------------------------------------------------------- crops
  function drawCrop(c, x, y, p) {
    const k = CROPS[p.crop];
    if (!k) return;
    const px = x * TILE, py = y * TILE;
    const t = p.stage === 2 ? 1 : clamp(p.growth, 0, 1);
    const h = 4 + t * 16;
    if (p.crop === 'fern') {
      c.fillStyle = p.stage === 2 ? '#8cd35f' : '#5c9c46';
      for (let k2 = 0; k2 < 3; k2++) {
        const fx = px + 7 + k2 * 8;
        c.fillRect(fx, py + TILE - 6 - h, 2, h);
        c.fillRect(fx - 3, py + TILE - 6 - h * 0.7, 8, 2);
        c.fillRect(fx - 2, py + TILE - 6 - h * 0.4, 6, 2);
      }
    } else if (p.crop === 'tuber') {
      c.fillStyle = p.stage === 2 ? '#a9d45f' : '#5f9c4a';
      for (let k2 = 0; k2 < 3; k2++) {
        const fx = px + 6 + k2 * 9;
        c.fillRect(fx, py + TILE - 6 - h * 0.7, 3, h * 0.7);
        c.fillRect(fx - 2, py + TILE - 7 - h * 0.7, 7, 3);
      }
      if (p.stage === 2) {
        c.fillStyle = '#c8a86a';
        for (let k2 = 0; k2 < 3; k2++) c.fillRect(px + 5 + k2 * 9, py + TILE - 7, 5, 4);
      }
    } else {
      c.fillStyle = '#4c7a55';
      c.fillRect(px + 14, py + TILE - 6 - h, 3, h);
      const cap = p.stage === 2 ? '#c47fd0' : '#7a8f7a';
      c.fillStyle = cap;
      c.beginPath();
      c.ellipse(px + 15.5, py + TILE - 6 - h, 3 + t * 7, 2 + t * 4, 0, 0, Math.PI * 2);
      c.fill();
      if (p.stage === 2) { c.fillStyle = '#e0a8e8'; c.fillRect(px + 11, py + TILE - 8 - h, 4, 2); }
    }
  }

  // --------------------------------------------------- marks, ghosts, overlays
  function drawMarks(c) {
    const x0 = Math.max(0, Math.floor(UI.cam.x) - 1), x1 = Math.min(COLS, Math.ceil(UI.cam.x + VIEW_W) + 1);
    const y0 = Math.max(0, Math.floor(UI.cam.y) - 1), y1 = Math.min(ROWS, Math.ceil(UI.cam.y + VIEW_H) + 1);
    const pulse = 0.5 + 0.2 * Math.sin(clockT * 4);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (!S.mark[i]) continue;
      const px = x * TILE, py = y * TILE;
      const cut = S.kind[i] === K.GROWTH;
      c.strokeStyle = cut ? `rgba(255,214,120,${pulse})` : `rgba(140,220,255,${pulse})`;
      c.lineWidth = 2;
      c.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
      c.fillStyle = c.strokeStyle;
      // a saw for growth, a crowbar for the hull
      if (cut) { c.fillRect(px + 10, py + 13, 12, 2); for (let k = 0; k < 4; k++) c.fillRect(px + 11 + k * 3, py + 15, 2, 2); }
      else { c.fillRect(px + 12, py + 10, 3, 12); c.fillRect(px + 12, py + 10, 8, 3); }
    }
  }

  function selRect(c, x, y, w, h) {
    c.strokeStyle = 'rgba(255,224,150,0.95)'; c.lineWidth = 2;
    c.setLineDash([6, 4]); c.lineDashOffset = -clockT * 10;
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    c.setLineDash([]); c.lineDashOffset = 0;
  }

  function drawPreview(c) {
    const t = UI.hover;
    if (!t) return;
    const tool = UI.tool;
    if (tool === 'select' || tool === 'demolish') {
      if (tool === 'demolish') {
        c.strokeStyle = 'rgba(230,110,95,0.9)'; c.lineWidth = 2;
        c.strokeRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
      }
      return;
    }
    if (UI.drag && (tool === 'cut' || tool === 'salvage' || tool === 'deck' || tool === 'dam' || tool === 'bridge' || tool === 'plot')) {
      const r = rectOf(UI.drag.x0, UI.drag.y0, t.x, t.y);
      c.strokeStyle = 'rgba(255,224,150,0.85)'; c.lineWidth = 2;
      c.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.w * TILE - 2, r.h * TILE - 2);
      c.fillStyle = 'rgba(255,224,150,0.12)';
      c.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
      return;
    }
    if (BUILDINGS[tool]) {
      const def = BUILDINGS[tool];
      const x = t.x - Math.floor((def.w - 1) / 2), y = t.y - Math.floor((def.h - 1) / 2);
      const ok = !buildOK(tool, x, y) && canAfford(def.cost);
      c.globalAlpha = 0.6;
      const ghost = { id: -1, type: tool, x, y, w: def.w, h: def.h, built: true, in: {}, residents: [], ready: 6, stock: 6, charge: 0, state: '' };
      drawBuilding(c, ghost, false);
      c.globalAlpha = 1;
      c.strokeStyle = ok ? 'rgba(140,230,150,0.95)' : 'rgba(235,110,95,0.95)';
      c.lineWidth = 2;
      c.strokeRect(x * TILE + 1, y * TILE + 1, def.w * TILE - 2, def.h * TILE - 2);
      return;
    }
    if (GROUND[tool]) {
      const ok = !groundOK(tool, t.x, t.y);
      c.strokeStyle = ok ? 'rgba(140,230,150,0.95)' : 'rgba(235,110,95,0.95)';
      c.lineWidth = 2;
      c.strokeRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  // Level numbers over the whole map, for when the terraces stop being obvious.
  function drawLevels(c) {
    const x0 = Math.max(0, Math.floor(UI.cam.x)), x1 = Math.min(COLS, Math.ceil(UI.cam.x + VIEW_W));
    const y0 = Math.max(0, Math.floor(UI.cam.y)), y1 = Math.min(ROWS, Math.ceil(UI.cam.y + VIEW_H));
    c.font = 'bold 10px ui-monospace, monospace'; c.textAlign = 'center';
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (S.kind[i] === K.VOID) continue;
      const lo = loLvl(x, y), hi = hiLvl(x, y);
      const label = lo === hi ? String(lo) : `${lo}–${hi}`;
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(x * TILE + 8, y * TILE + 11, TILE - 16, 11);
      c.fillStyle = 'rgba(255,238,200,0.9)';
      c.fillText(label, x * TILE + TILE / 2, y * TILE + 20);
    }
    c.textAlign = 'left';
  }

  // ------------------------------------------------------------- the buildings
  // Everything is a slab with a lit top edge and a dark skirt, then whatever makes that
  // particular thing recognisable from above at thirty-two pixels.
  function slab(c, px, py, w, h, fill, dark, light) {
    c.fillStyle = INK; c.fillRect(px - 1, py - 1, w + 2, h + 2);
    c.fillStyle = fill; c.fillRect(px, py, w, h);
    c.fillStyle = dark; c.fillRect(px, py + h - Math.min(7, h / 3), w, Math.min(7, h / 3));
    c.fillStyle = light; c.fillRect(px, py, w, 3);
  }
  function rivets(c, px, py, w, color) {
    c.fillStyle = color;
    for (let x = px + 3; x < px + w - 2; x += 7) c.fillRect(x, py, 2, 2);
  }

  function drawBuilding(c, b, night) {
    const def = BUILDINGS[b.type];
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(px + 3, py + h - 3, w - 2, 6);

    if (!b.built) {
      const done = 1 - clamp(b.work / (BUILD_WORK * b.w * b.h), 0, 1);
      c.fillStyle = 'rgba(30,24,18,0.35)';
      c.fillRect(px, py, w, h);
      c.strokeStyle = '#e0c88a'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.strokeRect(px + 2, py + 2, w - 4, h - 4);
      c.setLineDash([]);
      // scaffolding poles going up as it gets built
      c.fillStyle = '#9a7745';
      for (let k = 0; k < b.w * 2; k++) c.fillRect(px + 5 + k * 16, py + h - 8 - done * (h - 14), 3, 8 + done * (h - 14));
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(px + 4, py + 4, w - 8, 7);
      c.fillStyle = '#8fd6a0'; c.fillRect(px + 4, py + 4, (w - 8) * done, 7);
      return;
    }

    switch (b.type) {
      case 'deck': {
        // the nose cone, wedged nose-up into the peak
        c.fillStyle = INK;
        c.beginPath();
        c.moveTo(px + w / 2, py - 6); c.lineTo(px + w + 1, py + h * 0.45);
        c.lineTo(px + w - 6, py + h + 1); c.lineTo(px + 6, py + h + 1);
        c.lineTo(px - 1, py + h * 0.45); c.closePath(); c.fill();
        c.fillStyle = '#5b8382';
        c.beginPath();
        c.moveTo(px + w / 2, py - 3); c.lineTo(px + w - 2, py + h * 0.46);
        c.lineTo(px + w - 8, py + h - 2); c.lineTo(px + 8, py + h - 2);
        c.lineTo(px + 2, py + h * 0.46); c.closePath(); c.fill();
        c.fillStyle = '#3d5f60'; c.fillRect(px + 8, py + h - 14, w - 16, 12);
        c.fillStyle = '#76a09c'; c.fillRect(px + 10, py + 8, w - 20, 4);
        // the viewport
        c.fillStyle = '#12232c'; c.fillRect(px + w / 2 - 12, py + 14, 24, 10);
        c.fillStyle = night ? '#ffd27a' : '#8fd4e8'; c.fillRect(px + w / 2 - 10, py + 16, 20, 6);
        c.fillStyle = 'rgba(176,86,40,0.5)'; c.fillRect(px + 12, py + 26, 6, 18);
        rivets(c, px + 6, py + h - 20, w - 12, '#2c4645');
        // mast
        c.fillStyle = '#2c4645'; c.fillRect(px + w - 14, py - 16, 3, 20);
        c.fillStyle = '#e0b45a'; c.fillRect(px + w - 17, py - 18, 9, 3);
        break;
      }
      case 'bunk': {
        slab(c, px + 2, py + 6, w - 4, h - 10, '#7d6a4e', '#584a34', '#9a866a');
        c.fillStyle = '#c0a068';
        c.beginPath(); c.moveTo(px + 1, py + 8); c.lineTo(px + w / 2, py + 1); c.lineTo(px + w - 1, py + 8); c.closePath(); c.fill();
        c.fillStyle = INK; c.fillRect(px + 1, py + 7, w - 2, 2);
        c.fillStyle = night ? '#ffd27a' : '#2f4a52';
        c.fillRect(px + 7, py + 18, 7, 7); c.fillRect(px + w - 14, py + 18, 7, 7);
        c.fillStyle = INK; c.fillRect(px + 7, py + 18, 7, 2); c.fillRect(px + w - 14, py + 18, 7, 2);
        break;
      }
      case 'galley': {
        slab(c, px + 2, py + 8, w - 4, h - 12, '#8a5f3f', '#5e402a', '#a67c52');
        c.fillStyle = '#c4762f'; c.fillRect(px + 1, py + 4, w - 2, 6);
        c.fillStyle = INK; c.fillRect(px + 1, py + 9, w - 2, 2);
        // awning stripes
        c.fillStyle = '#e8dcc0';
        for (let k = 0; k < 3; k++) c.fillRect(px + 4 + k * 12, py + 4, 5, 6);
        // stove pipe with a curl of smoke
        c.fillStyle = '#4a4a4a'; c.fillRect(px + w - 12, py - 4, 5, 10);
        c.fillStyle = 'rgba(220,220,220,0.35)';
        for (let k = 0; k < 3; k++) c.fillRect(px + w - 13 + Math.sin(clockT * 1.4 + k) * 2, py - 9 - k * 5, 4, 3);
        c.fillStyle = night ? '#ffd27a' : '#3d2f22';
        c.fillRect(px + 8, py + 20, w - 20, 8);
        break;
      }
      case 'smelt': {
        slab(c, px + 2, py + 8, w - 4, h - 12, '#5e5750', '#3b3631', '#7a7268');
        c.fillStyle = '#2b2622'; c.fillRect(px + 8, py + 16, w - 26, h - 24);
        const glow = 0.6 + 0.4 * Math.sin(clockT * 5);
        c.fillStyle = `rgba(255,${120 + glow * 90 | 0},60,${0.65 + glow * 0.3})`;
        c.fillRect(px + 11, py + 19, w - 32, h - 30);
        c.fillStyle = '#3b3631'; c.fillRect(px + w - 18, py - 6, 10, 20);
        c.fillStyle = '#6a6259'; c.fillRect(px + w - 19, py - 8, 12, 4);
        c.fillStyle = 'rgba(200,200,200,0.3)';
        for (let k = 0; k < 3; k++) c.fillRect(px + w - 17 + Math.sin(clockT * 1.1 + k * 1.4) * 3, py - 14 - k * 6, 5, 4);
        rivets(c, px + 5, py + h - 12, w - 10, '#2b2622');
        break;
      }
      case 'shop': {
        slab(c, px + 2, py + 6, w - 4, h - 10, '#4f6b74', '#334a52', '#6d8a92');
        // sawtooth roof
        c.fillStyle = '#82a0a6';
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          c.moveTo(px + 4 + k * 22, py + 12); c.lineTo(px + 14 + k * 22, py + 2); c.lineTo(px + 18 + k * 22, py + 12);
          c.closePath(); c.fill();
        }
        c.fillStyle = night ? '#ffd27a' : '#bfe4ea';
        for (let k = 0; k < 3; k++) c.fillRect(px + 6 + k * 22, py + 6, 7, 5);
        c.fillStyle = '#e0b45a'; c.fillRect(px + 6, py + h - 14, 12, 4);
        c.fillStyle = '#2b3b40'; c.fillRect(px + w - 22, py + h - 16, 14, 10);
        break;
      }
      case 'lab': {
        slab(c, px + 2, py + 8, w - 4, h - 12, '#3f4a63', '#28304a', '#5b6784');
        c.fillStyle = '#8fa8c8';
        c.beginPath(); c.arc(px + w / 2, py + 12, w / 2 - 5, Math.PI, 0); c.fill();
        c.fillStyle = INK; c.fillRect(px + 3, py + 11, w - 6, 2);
        const pulse = 0.5 + 0.5 * Math.sin(clockT * 2.2);
        c.fillStyle = `rgba(121,210,255,${0.5 + pulse * 0.5})`;
        c.fillRect(px + 8, py + 18, w - 16, 4);
        c.fillRect(px + 8, py + 24, w - 22, 4);
        // dish
        c.fillStyle = '#c6d4e4';
        c.beginPath(); c.ellipse(px + w - 9, py + 5, 6, 4, -0.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5b6784'; c.fillRect(px + w - 10, py + 5, 2, 7);
        break;
      }
      case 'catch': {
        c.fillStyle = '#7a5c33';
        c.fillRect(px + 4, py + h - 14, 4, 12); c.fillRect(px + w - 8, py + h - 14, 4, 12);
        c.fillStyle = INK;
        c.beginPath(); c.moveTo(px + 1, py + 4); c.lineTo(px + w - 1, py + 4); c.lineTo(px + w / 2 + 6, py + h - 10); c.lineTo(px + w / 2 - 6, py + h - 10); c.closePath(); c.fill();
        c.fillStyle = '#b89a62';
        c.beginPath(); c.moveTo(px + 3, py + 6); c.lineTo(px + w - 3, py + 6); c.lineTo(px + w / 2 + 4, py + h - 12); c.lineTo(px + w / 2 - 4, py + h - 12); c.closePath(); c.fill();
        c.fillStyle = 'rgba(90,168,216,0.55)';
        c.fillRect(px + w / 2 - 4, py + h - 12 - (b.ready / 18) * 6, 8, (b.ready / 18) * 6);
        c.fillStyle = '#5aa8d8'; c.fillRect(px + w / 2 - 3, py + h - 11, 6, 9);
        break;
      }
      case 'cistern': {
        c.fillStyle = INK;
        c.beginPath(); c.ellipse(px + w / 2, py + h / 2, w / 2 - 2, h / 2 - 3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7f8c92';
        c.beginPath(); c.ellipse(px + w / 2, py + h / 2, w / 2 - 4, h / 2 - 5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5b666c';
        c.fillRect(px + 6, py + h / 2, w - 12, h / 2 - 5);
        c.fillStyle = '#9fadb4';
        c.beginPath(); c.ellipse(px + w / 2, py + 10, w / 2 - 7, 5, 0, 0, Math.PI * 2); c.fill();
        const lvlF = clamp(have('water') / Math.max(1, waterCap()), 0, 1);
        c.fillStyle = '#4f8fae';
        c.fillRect(px + 8, py + h - 10 - lvlF * 8, w - 16, lvlF * 8);
        rivets(c, px + 5, py + h / 2 + 2, w - 10, '#414a4f');
        break;
      }
      case 'filter': {
        slab(c, px + 2, py + 10, w - 4, h - 14, '#59616b', '#383e47', '#767f8a');
        for (let k = 0; k < 3; k++) {
          c.fillStyle = INK;
          c.beginPath(); c.ellipse(px + 14 + k * 20, py + 10, 8, 6, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = k === 2 ? '#5aa8d8' : k === 1 ? '#8fa05a' : '#6c7a4a';
          c.beginPath(); c.ellipse(px + 14 + k * 20, py + 10, 6, 4, 0, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#9a6a3a'; c.fillRect(px + 6, py + h - 12, w - 12, 4);
        c.fillStyle = '#e0b45a'; c.fillRect(px + w - 16, py + h - 16, 5, 10);
        break;
      }
      case 'pump': {
        slab(c, px + 3, py + 10, w - 6, h - 14, '#6b5f52', '#463d34', '#8b7d6c');
        c.fillStyle = '#9fd3d8'; c.fillRect(px + 8, py + 4, 6, 12);
        const stroke = Math.sin(clockT * 3.4) * 3;
        c.fillStyle = '#c6d4e4'; c.fillRect(px + 9, py + 2 + stroke, 4, 6);
        c.fillStyle = '#4f8fae'; c.fillRect(px + w - 16, py + h - 12, 10, 5);
        c.fillStyle = '#2f4a52'; c.fillRect(px + w - 10, py + h - 18, 4, 10);
        rivets(c, px + 6, py + h - 9, w - 12, '#332c25');
        break;
      }
      case 'beacon': {
        slab(c, px + 6, py + h - 20, w - 12, 18, '#5b6b72', '#39464c', '#7e8f96');
        c.fillStyle = '#3d4a4e'; c.fillRect(px + w / 2 - 4, py + 6, 8, h - 24);
        c.fillStyle = '#6d7f86'; c.fillRect(px + w / 2 - 2, py + 6, 3, h - 24);
        for (let k = 0; k < 3; k++) { c.fillStyle = '#2c3639'; c.fillRect(px + w / 2 - 9, py + 14 + k * 14, 18, 3); }
        const ch = BUILDINGS.beacon.charge;
        const lit = S.won || b.charge >= ch.need;
        const beat = lit ? 1 : b.charge / ch.need * (0.4 + 0.3 * Math.sin(clockT * 3));
        c.fillStyle = `rgba(255,${200 + beat * 55 | 0},120,${0.35 + beat * 0.65})`;
        c.beginPath(); c.arc(px + w / 2, py + 4, 5 + beat * 4, 0, Math.PI * 2); c.fill();
        if (lit) {
          c.fillStyle = `rgba(255,232,170,${0.16 + 0.1 * Math.sin(clockT * 2)})`;
          c.beginPath(); c.arc(px + w / 2, py + 4, 34, 0, Math.PI * 2); c.fill();
        }
        break;
      }
      default:
        slab(c, px + 2, py + 4, w - 4, h - 8, '#6b6257', '#453f38', '#8a8177');
    }

    // a hint of what is going on inside
    if (BUILDINGS[b.type].craft && b.made) {
      c.fillStyle = MATS[BUILDINGS[b.type].craft.to].color;
      c.fillRect(px + w - 8, py + h - 8, 5, 5);
      c.fillStyle = INK; c.fillRect(px + w - 8, py + h - 8, 5, 1);
    }
  }

  // The lift is tall, so it gets sorted with the buildings rather than baked flat.
  function drawLift(c, x, y) {
    const px = x * TILE, py = y * TILE, top = py - STEP_PX * (LEVELS - 1) - 6;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(px + 2, py + TILE - 3, TILE - 4, 5);
    c.fillStyle = INK; c.fillRect(px + 3, top, TILE - 6, py + TILE - top);
    c.fillStyle = '#5f6b72'; c.fillRect(px + 5, top + 2, TILE - 10, py + TILE - top - 4);
    c.fillStyle = '#39454b';
    for (let k = 0; k < 8; k++) c.fillRect(px + 5, top + 4 + k * 7, TILE - 10, 2);
    // the car, riding up and down
    const t = (Math.sin(clockT * 0.9) * 0.5 + 0.5);
    const cy = top + 4 + t * (py + TILE - top - 16);
    c.fillStyle = '#e0b45a'; c.fillRect(px + 7, cy, TILE - 14, 10);
    c.fillStyle = INK; c.fillRect(px + 7, cy, TILE - 14, 2);
    c.fillStyle = '#9fd3d8'; c.fillRect(px + 9, cy + 3, TILE - 18, 4);
  }

  // The coolant tank on the peak, and the drive down in the basin. One of them stops
  // in the scorch; the other has not stopped since the day it came down.
  function drawSpring(c, s, seep) {
    const px = s.x * TILE, py = s.y * TILE;
    c.fillStyle = INK; c.fillRect(px + 4, py + 5, TILE - 8, TILE - 10);
    c.fillStyle = seep ? '#4a4a3e' : '#5b6b72'; c.fillRect(px + 5, py + 6, TILE - 10, TILE - 12);
    c.fillStyle = seep ? '#8a9a5a' : '#9fd3d8'; c.fillRect(px + 7, py + 8, TILE - 14, 4);
    c.fillStyle = 'rgba(176,86,40,0.55)'; c.fillRect(px + 8, py + 14, 5, 9);
    c.fillStyle = seep ? '#2e3524' : '#33474c';
    for (let k = 0; k < 3; k++) c.fillRect(px + 6 + k * 7, py + TILE - 9, 3, 3);
    const rate = seep ? 1 : seasonOf(S.day).spring + weatherOf().rain * 0.7;
    if (rate > 0.1) {
      c.fillStyle = seep ? 'rgba(170,200,110,0.75)' : 'rgba(150,210,235,0.75)';
      for (let k = 0; k < 3; k++) {
        const t = (clockT * (seep ? 1.1 : 2) + k * 0.4) % 1;
        c.fillRect(px + 20 + Math.sin(t * 6) * 2, py + 18 + t * 12, 2, 4);
      }
    }
  }

  // -------------------------------------------------------------- the crew
  function drawCrew(c, v) {
    if (v.hidden) return;
    const x = v.px * TILE, y = v.py * TILE;
    const bob = v.walking ? Math.sin(clockT * 11 + v.id) * 1.2 : v.working ? Math.sin(clockT * 7 + v.id) * 0.8 : 0;
    const yy = y + bob;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x, y + 7, 6, 2.6, 0, 0, Math.PI * 2); c.fill();
    if (v.sleeping) {
      c.fillStyle = v.suit; c.fillRect(x - 7, y + 1, 14, 6);
      c.fillStyle = INK; c.fillRect(x - 7, y + 1, 14, 1);
      c.fillStyle = '#e8dcc0'; c.fillRect(x + 5, y - 1, 4, 4);
      c.font = '9px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillText('z', x + 8, y - 4 - (clockT * 6 % 6));
      return;
    }
    // legs
    c.fillStyle = '#3a3630';
    const stride = v.walking ? Math.sin(clockT * 11 + v.id) * 2 : 0;
    c.fillRect(x - 3 + stride, yy + 2, 2.6, 5);
    c.fillRect(x + 1 - stride, yy + 2, 2.6, 5);
    // flight suit
    c.fillStyle = INK; c.fillRect(x - 5, yy - 8, 10, 11);
    c.fillStyle = v.suit; c.fillRect(x - 4, yy - 7, 8, 9);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x - 4, yy - 7, 8, 2);
    // tool harness
    c.fillStyle = '#6b5232'; c.fillRect(x - 4, yy - 3, 8, 2);
    c.fillStyle = '#c6a05a'; c.fillRect(x + (v.face > 0 ? 2 : -4), yy - 3, 2, 3);
    // head
    c.fillStyle = INK; c.fillRect(x - 4, yy - 14, 8, 7);
    c.fillStyle = '#d8ab86'; c.fillRect(x - 3, yy - 13, 6, 5);
    c.fillStyle = v.hair; c.fillRect(x - 3, yy - 13, 6, 2);
    if (v.gear === 'goggles') {
      c.fillStyle = '#2b3b40'; c.fillRect(x - 4, yy - 12, 8, 2.6);
      c.fillStyle = '#8fd4e8'; c.fillRect(x + (v.face > 0 ? 0 : -3), yy - 12, 3, 2.6);
    } else if (v.gear === 'hood') {
      c.fillStyle = '#5d5140'; c.fillRect(x - 4, yy - 15, 8, 4);
    }
    // what they are carrying
    if (v.carry) {
      c.fillStyle = INK; c.fillRect(x - 5, yy - 20, 10, 6);
      c.fillStyle = MATS[v.carry.mat].color; c.fillRect(x - 4, yy - 19, 8, 4);
    }
    if (v.working) {
      const sw = Math.sin(clockT * 9 + v.id) * 4;
      c.strokeStyle = '#d8c39a'; c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x + v.face * 4, yy - 5);
      c.lineTo(x + v.face * 10, yy - 9 + sw);
      c.stroke();
    }
    if (v.hunger > 0) {
      c.fillStyle = '#e8b04a';
      c.fillRect(x + 4, yy - 18, 2, 5); c.fillRect(x + 4, yy - 12, 2, 2);
    }
  }

  // ------------------------------------------------------------ the scene
  const NIGHT_MAX = 0.46;
  function nightAlpha() {
    const h = S.hour;
    if (h >= 20 || h < 5) return NIGHT_MAX;
    if (h >= 17 && h < 20) return (h - 17) / 3 * NIGHT_MAX;
    if (h >= 5 && h < 7) return NIGHT_MAX * (1 - (h - 5) / 2);
    return 0;
  }

  const DROPS = [];
  for (let i = 0; i < 180; i++) DROPS.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), w: Math.random() });
  function drawWeatherFx(c) {
    const w = weatherOf().id;
    const CW = canvas.width, CH = canvas.height;
    if (w === 'rain' || w === 'storm') {
      const heavy = w === 'storm';
      c.strokeStyle = heavy ? 'rgba(180,205,230,0.5)' : 'rgba(180,205,230,0.34)';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < (heavy ? 170 : 110); i++) {
        const d = DROPS[i];
        const y = (d.y + clockT * (heavy ? 1.5 : 1.05) * d.s) % 1 * CH;
        const x = (d.x + (heavy ? 0.16 : 0.08) * (y / CH)) % 1 * CW;
        c.moveTo(x, y); c.lineTo(x - (heavy ? 6 : 3), y + (heavy ? 14 : 11));
      }
      c.stroke();
      if (heavy) {
        const f = Math.sin(clockT * 0.7) * Math.sin(clockT * 5.3);
        if (f > 0.985) { c.fillStyle = 'rgba(220,232,255,0.22)'; c.fillRect(0, 0, CW, CH); }
      }
    } else if (w === 'ash') {
      for (let i = 0; i < 120; i++) {
        const d = DROPS[i];
        const y = (d.y + clockT * 0.09 * d.s) % 1 * CH;
        const x = ((d.x + Math.sin(clockT * 0.4 + d.w * 8) * 0.02) % 1 + 1) % 1 * CW;
        c.fillStyle = `rgba(190,184,172,${0.25 + d.w * 0.35})`;
        c.fillRect(x, y, 1 + d.w * 2, 1 + d.w * 2);
      }
      c.fillStyle = 'rgba(120,108,92,0.1)'; c.fillRect(0, 0, CW, CH);
    } else if (w === 'haze') {
      c.fillStyle = 'rgba(150,180,130,0.12)'; c.fillRect(0, 0, CW, CH);
      for (let i = 0; i < 26; i++) {
        const d = DROPS[i];
        const x = (d.x + clockT * 0.05 * d.s) % 1 * CW;
        const y = (d.y * CH + Math.sin(clockT * 0.8 + d.w * 9) * 10);
        c.fillStyle = `rgba(190,220,160,${0.1 + d.w * 0.14})`;
        c.beginPath(); c.arc(x, y, 12 + d.w * 20, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function draw() {
    if (groundDirty || groundKey !== groundStamp()) drawGround();
    const c = ctx;
    const ox = camOx(), oy = camOy();
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(ground, ox, oy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(-ox, -oy);

    drawWater(c);

    const x0 = Math.max(0, Math.floor(UI.cam.x) - 1), x1 = Math.min(COLS, Math.ceil(UI.cam.x + VIEW_W) + 1);
    const y0 = Math.max(0, Math.floor(UI.cam.y) - 1), y1 = Math.min(ROWS, Math.ceil(UI.cam.y + VIEW_H) + 1);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = S.plots[idx(x, y)];
      if (p && p.stage > 0) drawCrop(c, x, y, p);
    }
    drawMarks(c);

    if (UI.sel && UI.sel.kind === 'field') {
      const f = fieldOf(UI.sel.id);
      if (f) selRect(c, f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
    }
    if (UI.sel && UI.sel.kind === 'building') {
      const b = building(UI.sel.id);
      if (b) selRect(c, b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE);
    }

    const night = nightAlpha() > 0.25;
    const things = [];
    for (const b of S.buildings) things.push({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(c, b, night) });
    for (const v of S.crew) things.push({ y: v.py * TILE + 6, draw: () => drawCrew(c, v) });
    for (const s of S.springs) things.push({ y: s.y * TILE + 26, draw: () => drawSpring(c, s, false) });
    for (const s of S.seeps || []) things.push({ y: s.y * TILE + 26, draw: () => drawSpring(c, s, true) });
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (S.ground[i] === 'lift' && S.gwork[i] <= 0) things.push({ y: (y + 1) * TILE, draw: () => drawLift(c, x, y) });
    }
    things.sort((a, b) => a.y - b.y);
    for (const t of things) t.draw();

    drawPreview(c);
    if (UI.showLevels) drawLevels(c);

    const a = nightAlpha();
    if (a > 0) {
      c.fillStyle = `rgba(22, 30, 62, ${a})`;
      c.fillRect(ox, oy, canvas.width, canvas.height);
      if (a > 0.25) {
        for (const b of S.buildings) {
          if (!b.built) continue;
          const bx = b.x * TILE, by = b.y * TILE, bw = b.w * TILE, bh = b.h * TILE;
          const g = c.createRadialGradient(bx + bw / 2, by + bh * 0.7, 4, bx + bw / 2, by + bh * 0.7, bw * 0.95);
          g.addColorStop(0, 'rgba(255,208,118,0.34)'); g.addColorStop(1, 'rgba(255,208,118,0)');
          c.fillStyle = g; c.fillRect(bx - bw / 2, by - bh / 2, bw * 2, bh * 2);
        }
      }
    }
    drawFloats(c);
    c.restore();
    drawWeatherFx(c);
    drawEdges(c);
  }

  function drawEdges(c) {
    const e = UI.edge;
    if (!e) return;
    const CW = canvas.width, CH = canvas.height;
    const m = UI.mouse || { sx: CW / 2, sy: CH / 2 };
    const x = e.dx < 0 ? 22 : e.dx > 0 ? CW - 22 : clamp(m.sx, 40, CW - 40);
    const y = e.dy < 0 ? 22 : e.dy > 0 ? CH - 22 : clamp(m.sy, 40, CH - 40);
    const pulse = UI.panning ? 1 : 0.62 + 0.16 * Math.sin(clockT * 5);
    c.save();
    c.translate(x, y);
    c.rotate(Math.atan2(e.dy, e.dx));
    c.fillStyle = `rgba(16,22,26,${0.4 * pulse})`;
    c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = `rgba(236,232,220,${pulse})`;
    c.beginPath();
    c.moveTo(7, 0); c.lineTo(-4, -7); c.lineTo(-1.5, 0); c.lineTo(-4, 7);
    c.closePath(); c.fill();
    c.restore();
  }

  // ---------------------------------------------------------------- minimap
  const mini = document.getElementById('mini');
  const mctx = mini ? mini.getContext('2d') : null;
  if (mini) { mini.width = COLS * 3; mini.height = ROWS * 3; }
  function drawMini() {
    if (!mctx) return;
    const s = 3;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const i = idx(x, y);
      let col;
      if (S.kind[i] === K.VOID) col = S.ground[i] === 'bridge' ? '#9a7745' : '#14131a';
      else if (S.kind[i] === K.WRECK) col = S.wtype[i] === W.MAINFRAME ? '#79d2ff' : S.wtype[i] === W.CONDUIT ? '#c4762f' : '#46706e';
      else if (S.kind[i] === K.GROWTH) col = '#2f5c30';
      else col = TERRACE[clamp(S.lvl[i] + S.plat[i], 0, LEVELS - 1)].top;
      if (S.water[i] > 0.05) col = isToxic(i) ? '#6c7a4a' : '#4f8fae';
      if (S.plots[i]) col = '#5a4430';
      if (S.ground[i] && S.kind[i] !== K.VOID) col = S.ground[i] === 'dam' ? '#7a5c33' : '#9a7745';
      if (S.occ[i]) col = '#e8dcc0';
      if (S.mark[i]) col = '#ffd678';
      mctx.fillStyle = col;
      mctx.fillRect(x * s, y * s, s, s);
    }
    mctx.strokeStyle = 'rgba(255,255,255,0.9)'; mctx.lineWidth = 1;
    mctx.strokeRect(UI.cam.x * s + 0.5, UI.cam.y * s + 0.5, VIEW_W * s, VIEW_H * s);
  }

  // ------------------------------------------------------------ input
  function screenFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { sx: (e.clientX - r.left) / r.width * canvas.width, sy: (e.clientY - r.top) / r.height * canvas.height };
  }
  function tileAt(sx, sy) {
    const x = Math.floor((sx + camOx()) / TILE), y = Math.floor((sy + camOy()) / TILE);
    return inb(x, y) ? { x, y } : null;
  }
  function pointAt(sx, sy) { return { x: (sx + camOx()) / TILE, y: (sy + camOy()) / TILE }; }

  function edgeAt(sx, sy) {
    if (sx < 0 || sy < 0 || sx > canvas.width || sy > canvas.height) return null;
    let dx = 0, dy = 0;
    if (sx < EDGE) dx = -1; else if (sx > canvas.width - EDGE) dx = 1;
    if (sy < EDGE) dy = -1; else if (sy > canvas.height - EDGE) dy = 1;
    if (dx < 0 && UI.cam.x <= 0.001) dx = 0;
    if (dx > 0 && UI.cam.x >= camMaxX() - 0.001) dx = 0;
    if (dy < 0 && UI.cam.y <= 0.001) dy = 0;
    if (dy > 0 && UI.cam.y >= camMaxY() - 0.001) dy = 0;
    return (dx || dy) ? { dx, dy } : null;
  }
  const EDGE_CURSOR = {
    '-1,0': 'w-resize', '1,0': 'e-resize', '0,-1': 'n-resize', '0,1': 's-resize',
    '-1,-1': 'nw-resize', '1,-1': 'ne-resize', '-1,1': 'sw-resize', '1,1': 'se-resize',
  };
  function refreshEdge() {
    if (!UI.mouse) UI.edge = null;
    else if (!UI.drag) UI.edge = edgeAt(UI.mouse.sx, UI.mouse.sy);
    canvas.style.cursor = UI.edge ? (EDGE_CURSOR[`${UI.edge.dx},${UI.edge.dy}`] || 'move') : '';
    if (!UI.edge) UI.panning = false;
  }

  const DRAG_TOOLS = { cut: 1, salvage: 1, deck: 1, dam: 1, bridge: 1, plot: 1 };

  canvas.addEventListener('pointerdown', (e) => {
    const { sx, sy } = screenFromEvent(e);
    UI.mouse = { sx, sy };
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      UI.freeDrag = { sx, sy, cx: UI.cam.x, cy: UI.cam.y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    UI.edge = edgeAt(sx, sy);
    if (UI.edge) { e.preventDefault(); UI.panning = true; canvas.setPointerCapture(e.pointerId); return; }
    const t = tileAt(sx, sy);
    if (!t) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    UI.hover = t;
    const i = idx(t.x, t.y);
    if (DRAG_TOOLS[UI.tool]) {
      UI.drag = { x0: t.x, y0: t.y, lvl: S.kind[i] === K.VOID ? null : S.lvl[i] + S.plat[i] };
      return;
    }
    if (BUILDINGS[UI.tool]) { placeBuilding(UI.tool, t.x, t.y); return; }
    if (GROUND[UI.tool]) { placeGround(UI.tool, t.x, t.y, t.x, t.y); return; }
    if (UI.tool === 'move') { if (UI.moving) moveBuilding(UI.moving, t.x, t.y); else setTool('select'); return; }
    if (UI.tool === 'demolish') { if (!demolishAt(t.x, t.y)) setHint('Nothing to clear there.'); return; }
    // look
    const p = pointAt(sx, sy);
    let best = null, bd = 0.7;
    for (const c of S.crew) { if (c.hidden) continue; const d = Math.hypot(c.px - p.x, c.py - p.y + 0.3); if (d < bd) { bd = d; best = c; } }
    if (best) { UI.sel = { kind: 'crew', id: best.id }; return; }
    if (S.occ[i]) { UI.sel = { kind: 'building', id: S.occ[i] }; return; }
    if (S.plots[i]) { UI.sel = { kind: 'field', id: S.plots[i].field }; return; }
    if (S.kind[i] === K.GROWTH || S.kind[i] === K.WRECK) { UI.sel = { kind: 'tile', id: i }; return; }
    UI.sel = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    const { sx, sy } = screenFromEvent(e);
    UI.mouse = { sx, sy };
    if (UI.freeDrag) {
      UI.cam.x = clamp(UI.freeDrag.cx - (sx - UI.freeDrag.sx) / TILE, 0, camMaxX());
      UI.cam.y = clamp(UI.freeDrag.cy - (sy - UI.freeDrag.sy) / TILE, 0, camMaxY());
      return;
    }
    if (!UI.panning) refreshEdge();
    UI.hover = tileAt(sx, sy);
  });
  canvas.addEventListener('pointerleave', () => {
    if (!UI.drag && !UI.panning) { UI.hover = null; UI.mouse = null; UI.edge = null; canvas.style.cursor = ''; }
  });
  canvas.addEventListener('pointerup', (e) => {
    UI.freeDrag = null;
    if (UI.panning) { UI.panning = false; refreshEdge(); return; }
    const { sx, sy } = screenFromEvent(e);
    const t = tileAt(sx, sy) || UI.hover;
    if (UI.drag && t) {
      const d = UI.drag;
      if (UI.tool === 'cut') markArea(d.x0, d.y0, t.x, t.y, K.GROWTH);
      else if (UI.tool === 'salvage') markArea(d.x0, d.y0, t.x, t.y, K.WRECK);
      else if (UI.tool === 'plot') placeField(d.x0, d.y0, t.x, t.y);
      else placeGround(UI.tool, d.x0, d.y0, t.x, t.y, d.lvl);
    }
    UI.drag = null;
  });
  canvas.addEventListener('pointercancel', () => { UI.drag = null; UI.panning = false; UI.freeDrag = null; });
  canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { sx, sy } = screenFromEvent(e);
    changeZoom(e.deltaY < 0 ? 1 : -1, sx, sy);
  }, { passive: false });

  const PAN_KEYS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
  };
  document.addEventListener('keydown', (e) => {
    if (e.target !== document.body) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); changeZoom(1); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); changeZoom(-1); return; }
    if (e.key === '0') { e.preventDefault(); changeZoom(0); return; }
    const k = PAN_KEYS[e.key] || PAN_KEYS[String(e.key).toLowerCase()];
    if (k) { e.preventDefault(); UI.keyPan.x = k[0] || UI.keyPan.x; UI.keyPan.y = k[1] || UI.keyPan.y; return; }
    if (e.key === 'Escape') {
      if (!overlay.hidden) { overlay.hidden = true; UI.ledger = false; return; }
      setTool('select'); UI.sel = null;
    }
    if (e.key === 'l' || e.key === 'L') { if (overlay.hidden) openLedger(); else { overlay.hidden = true; UI.ledger = false; } }
    if (e.key === 'e' || e.key === 'E') { UI.showLevels = !UI.showLevels; setHint(UI.showLevels ? 'Showing the level of every tile. E hides them again.' : 'Levels hidden.'); }
    if (e.key === ' ') { e.preventDefault(); setSpeed(UI.speed ? 0 : 1); }
  });
  document.addEventListener('keyup', (e) => {
    const k = PAN_KEYS[e.key] || PAN_KEYS[String(e.key).toLowerCase()];
    if (!k) return;
    if (k[0]) UI.keyPan.x = 0;
    if (k[1]) UI.keyPan.y = 0;
  });
  window.addEventListener('blur', () => { UI.keyPan.x = 0; UI.keyPan.y = 0; UI.panning = false; });

  if (mini) {
    const jump = (e) => {
      const r = mini.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * COLS, y = (e.clientY - r.top) / r.height * ROWS;
      centreCamera(x, y);
    };
    mini.addEventListener('pointerdown', (e) => { e.preventDefault(); mini.setPointerCapture(e.pointerId); mini.dragging = true; jump(e); });
    mini.addEventListener('pointermove', (e) => { if (mini.dragging) jump(e); });
    mini.addEventListener('pointerup', () => { mini.dragging = false; });
  }

  function panCamera(dt) {
    let dx = UI.keyPan.x, dy = UI.keyPan.y;
    if (UI.panning && UI.edge) { dx += UI.edge.dx; dy += UI.edge.dy; }
    if (!dx && !dy) return;
    const n = Math.hypot(dx, dy) || 1;
    UI.cam.x = clamp(UI.cam.x + dx / n * PAN_SPEED * dt, 0, camMaxX());
    UI.cam.y = clamp(UI.cam.y + dy / n * PAN_SPEED * dt, 0, camMaxY());
    if (UI.mouse) UI.hover = tileAt(UI.mouse.sx, UI.mouse.sy);
  }

  // ------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id);
  const toolbar = $('toolbar'), panel = $('panel'), hintEl = $('hint'), clockEl = $('clock'), overlay = $('overlay');
  const resEl = $('res'), noticeSlot = $('notice-slot'), ledgerBtn = $('ledger-btn'), ledgerBadge = $('ledger-badge');
  let hintTimer = 0;

  function setHint(text, bad) {
    hintEl.textContent = text;
    hintEl.classList.toggle('bad', !!bad);
    hintTimer = 5;
  }
  function defaultHint() {
    if (UI.tool === 'move' && UI.moving) {
      const b = building(UI.moving);
      if (b) return `Click where the ${BUILDINGS[b.type].name.toLowerCase()} should stand. ${costText(moveFee(b.type))}. Escape leaves it where it is.`;
    }
    if (!S.cut) return 'Start with the Cut tool: drag over the growth beside the deck. Every tile of it comes back as timber.';
    if (!anyOf('catch')) return 'Nothing refills the tank. Find the wet ground under the coolant tank on the peak and put a catchment against it — 8 timber.';
    if (!S.fields.length && have('timber') >= 8) return 'Lay out a terrace plot on level ground with the Terrace tool — the colony eats what grows on it.';
    if (!anyOf('galley')) return 'Nobody has had a hot meal yet. A galley is 14 timber and 4 scrap.';
    if (totalBeds() < S.crew.length) return 'Somebody is sleeping on the deck plates. A bunkhouse holds two.';
    if (!S.stripped) return 'The wreck below is the only source of scrap and wire. Mark it with Salvage, and build a stair to get down to it.';
    if (!anyOf('lab') && have('core') > 0) return 'You have a data core and nowhere to read it. The data lab is 12 scrap and 8 wire.';
    return (TOOLS.find((t) => t.id === UI.tool) || { hint: '' }).hint;
  }

  function setTool(id) {
    if (id !== 'move') UI.moving = null;
    UI.tool = id;
    for (const b of toolbar.querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === id);
    setHint(defaultHint());
  }
  function setSpeed(n) {
    UI.speed = n;
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === n);
  }

  // Every tool draws its own picture with the same routines the map uses, so the dock is
  // a row of small buildings rather than a row of words.
  const ICONS = {};
  function toolIcon(id) {
    if (ICONS[id]) return ICONS[id];
    const def = BUILDINGS[id];
    const w = (def ? def.w : 2) * TILE, h = (def ? def.h : 2) * TILE;
    const cv = document.createElement('canvas');
    cv.width = w + 10; cv.height = h + 16;
    const c = cv.getContext('2d');
    c.translate(5, 10);
    // a scrap of terrace to stand it on
    c.fillStyle = TERRACE[2].top; c.fillRect(-5, -4, w + 10, h + 8);
    c.fillStyle = TERRACE[2].spec; c.fillRect(-5, h - 6, w + 10, 4);
    if (def) {
      const ghost = { id: -1000, type: id, x: 0, y: 0, w: def.w, h: def.h, built: true, in: {}, made: 4, ready: 8, stock: 8, residents: [], charge: 6, state: '' };
      drawBuilding(c, ghost, false);
    } else if (id === 'cut' || id === 'salvage') {
      // a tile of the thing being worked on, with the mark over it
      c.fillStyle = id === 'cut' ? '#2f5c30' : '#46706e';
      c.fillRect(6, 6, w - 12, h - 14);
      c.fillStyle = id === 'cut' ? '#5f9c45' : '#2f4f4e';
      c.fillRect(10, 10, w - 20, 8);
      c.strokeStyle = id === 'cut' ? '#ffd678' : '#8cdcff'; c.lineWidth = 3;
      c.strokeRect(4, 4, w - 8, h - 10);
      c.fillStyle = id === 'cut' ? '#ffd678' : '#8cdcff';
      if (id === 'cut') { c.fillRect(14, h / 2, 26, 4); for (let k = 0; k < 6; k++) c.fillRect(15 + k * 4, h / 2 + 4, 3, 3); }
      else { c.fillRect(24, 12, 5, 26); c.fillRect(24, 12, 16, 5); }
    } else if (id === 'plot') {
      c.fillStyle = '#5a4430'; c.fillRect(2, 4, w - 4, h - 10);
      c.fillStyle = '#4a3726'; for (let r = 0; r < 4; r++) c.fillRect(3, 8 + r * 9, w - 6, 3);
      c.fillStyle = '#8cd35f';
      for (let k = 0; k < 4; k++) { const x = 9 + k * 12; c.fillRect(x, 16, 3, 16); c.fillRect(x - 4, 20, 11, 3); }
    } else if (GROUND[id]) {
      c.save();
      c.translate(w / 2 - TILE / 2, h / 2 - TILE / 2 + 4);
      drawGroundIcon(c, id, 0, 0);
      c.restore();
    } else if (id === 'select') {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.moveTo(20, 12); c.lineTo(20, 42); c.lineTo(28, 34); c.lineTo(34, 45); c.lineTo(39, 42); c.lineTo(33, 32); c.lineTo(43, 31);
      c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
    } else if (id === 'demolish') {
      c.strokeStyle = '#e06c5f'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(16, 14); c.lineTo(w - 16, h - 12); c.moveTo(w - 16, 14); c.lineTo(16, h - 12); c.stroke();
      c.lineCap = 'butt';
    }
    return (ICONS[id] = cv.toDataURL());
  }
  // A stand-alone version of the tile art, for the dock icons.
  function drawGroundIcon(c, type, px, py) {
    if (type === 'deck' || type === 'bridge') {
      c.fillStyle = '#4a3520'; c.fillRect(px, py, TILE, TILE);
      c.fillStyle = type === 'bridge' ? '#8a6a3f' : '#9a7745'; c.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 1; k < 4; k++) c.fillRect(px + 1, py + k * 8, TILE - 2, 2);
      if (type === 'bridge') { c.fillStyle = '#c0a068'; for (let k = 0; k < 3; k++) { c.fillRect(px + 4 + k * 11, py - 4, 3, 6); c.fillRect(px + 4 + k * 11, py + TILE - 2, 3, 6); } }
    } else if (type === 'stair') {
      c.fillStyle = '#5c4629'; c.fillRect(px, py, TILE, TILE);
      for (let s = 0; s < 4; s++) {
        c.fillStyle = ['#7d5f34', '#8d6c3c', '#9d7a45', '#ad884e'][s];
        c.fillRect(px + 1, py + TILE - 2 - (s + 1) * 7, TILE - 2, 7);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(px + 1, py + TILE - 2 - (s + 1) * 7, TILE - 2, 2);
      }
    } else if (type === 'plat') {
      c.fillStyle = TERRACE[3].top; c.fillRect(px, py - 6, TILE, TILE);
      c.fillStyle = '#7a5c33'; c.fillRect(px, py + TILE - 8, TILE, 10);
      c.fillStyle = '#5a4225'; for (let k = 0; k < 4; k++) c.fillRect(px + 2 + k * 8, py + TILE - 6, 3, 8);
      c.fillStyle = '#a07d46'; c.fillRect(px, py - 7, TILE, 3);
    } else if (type === 'dam') {
      c.fillStyle = '#4f8fae'; c.fillRect(px - 4, py + 12, TILE + 8, TILE - 12);
      c.fillStyle = '#3d2c19'; c.fillRect(px + 1, py + 2, TILE - 2, TILE - 4);
      c.fillStyle = '#7a5c33'; c.fillRect(px + 2, py + 3, TILE - 4, TILE - 7);
      c.fillStyle = '#5a4225'; for (let k = 0; k < 3; k++) c.fillRect(px + 2, py + 6 + k * 7, TILE - 4, 2);
    } else if (type === 'lift') {
      c.fillStyle = INK; c.fillRect(px + 3, py - 10, TILE - 6, TILE + 10);
      c.fillStyle = '#5f6b72'; c.fillRect(px + 5, py - 8, TILE - 10, TILE + 6);
      c.fillStyle = '#39454b'; for (let k = 0; k < 5; k++) c.fillRect(px + 5, py - 6 + k * 7, TILE - 10, 2);
      c.fillStyle = '#e0b45a'; c.fillRect(px + 7, py + 6, TILE - 14, 10);
      c.fillStyle = '#9fd3d8'; c.fillRect(px + 9, py + 9, TILE - 18, 4);
    }
  }

  function renderToolbar() {
    toolbar.innerHTML = TOOL_GROUPS.map((g) => {
      const rows = g.tools.map((id) => {
        const t = TOOLS.find((x) => x.id === id);
        if (!t || t.hidden) return '';
        const def = BUILDINGS[id] || GROUND[id];
        const locked = def && def.tech && !known(def.tech);
        const title = locked
          ? `Locked — the data lab has to decode ${TECH[def.tech].name} first.`
          : t.hint.replace(/"/g, '&quot;');
        return `<button type="button" data-tool="${id}" class="${id === UI.tool ? 'on' : ''}${locked ? ' locked' : ''}" title="${title}"${locked ? ' disabled' : ''}>
          <img src="${toolIcon(id)}" alt="" />
          <span>${t.label}</span>${t.cost !== undefined ? `<small>${t.cost}</small>` : '<small>&nbsp;</small>'}</button>`;
      }).join('');
      if (!rows.replace(/\s/g, '')) return '';
      return `<div class="tgroup">${g.name ? `<span class="tglabel">${g.name}</span>` : ''}<div class="trow">${rows}</div></div>`;
    }).join('');
  }
  toolbar.addEventListener('click', (e) => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });

  // ------------------------------------------------------- the permanent readout
  const HUD_MATS = ['timber', 'scrap', 'wire', 'alloy', 'part', 'core', 'water'];
  function renderStats() {
    const sn = seasonOf(S.day);
    const hh = String(Math.floor(S.hour)).padStart(2, '0');
    const mm = String(Math.floor((S.hour % 1) * 60)).padStart(2, '0');
    clockEl.innerHTML = `<b class="s-${sn.id}">${sn.name} ${dayOfSeason(S.day)}</b>`
      + `<span class="full"> · year ${yearOf(S.day)}</span> · ${hh}:${mm}${isDay() ? '' : ' · night'}`
      + `<span class="full"> · ${weatherOf().name.toLowerCase()}</span>`;

    const cap = waterCap();
    resEl.innerHTML = HUD_MATS.map((m) => {
      const n = have(m);
      const low = (m === 'water' && n < 10) ? ' low' : '';
      const sub = m === 'water' ? `<span class="cap">/${cap}</span>` : '';
      return `<span class="res-pill${low}" title="${MATS[m].name}"><i class="sw" style="background:${MATS[m].color}"></i><b>${n}</b>${sub}</span>`;
    }).join('') + `<span class="res-pill${foodInStore() + galleyStock() < S.crew.length ? ' low' : ''}" title="Food, on the deck and on the galley counter"><i class="sw" style="background:#8cc76a"></i><b>${foodInStore() + galleyStock()}</b></span>`
      + `<span class="res-pill" title="Crew and bunks"><i class="sw" style="background:#e8dcc0"></i><b>${S.crew.length}</b><span class="cap">/${totalBeds()}</span></span>`;

    const wants = S.crew.length > totalBeds() || galleyStock() < S.crew.length || have('water') < 10 || S.crew.some((c) => c.hunger > 0);
    if (ledgerBadge) ledgerBadge.hidden = !wants;
    if (ledgerBtn) ledgerBtn.title = wants ? 'The log — something wants looking at (L)' : 'The log — everything the colony is doing (L)';
  }

  function tallyHTML() {
    const beacon = S.buildings.find((b) => b.type === 'beacon');
    const ch = BUILDINGS.beacon.charge;
    const pct = S.won ? 100 : beacon && beacon.built ? beacon.charge / ch.need * 100 : 0;
    const tired = S.crew.filter((c) => c.energy < 35).length;
    const food = galleyStock();
    return `<div class="tally">
      <span class="stat"><b>${S.won ? 'lit' : beacon ? `${beacon.charge}/${ch.need}` : '—'}</b><span class="lbl">beacon</span><span class="meter"><i style="width:${pct}%"></i></span></span>
      <span class="stat ${S.crew.length > totalBeds() ? 'low' : ''}"><b>${S.crew.length}</b><span class="lbl">crew</span><span class="cap">/ ${totalBeds()} bunks</span></span>
      <span class="stat ${food < S.crew.length ? 'low' : ''}"><b>${food}</b><span class="lbl">on the counter</span></span>
      <span class="stat ${have('water') < 12 ? 'low' : ''}"><b>${have('water')}</b><span class="lbl">water</span><span class="cap">/ ${waterCap()}</span></span>
      ${tired ? `<span class="stat low"><b>${tired}</b><span class="lbl">tired</span></span>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------ the panel
  function panelKey() { return `${UI.sel ? UI.sel.kind + ':' + UI.sel.id : 'none'}|${UI.structure}`; }
  function ledgerKey() {
    const nt = S.notice;
    return `${UI.structure}|${S.day}|${S.weather}|${nt ? nt.id + (nt.taken ? '!' : '') : '-'}`;
  }
  function noticeKey() {
    const nt = S.notice;
    return nt && !UI.noticeShut ? `${S.day}:${nt.id}:${nt.taken ? 1 : 0}:${nt.offer ? 1 : 0}` : '-';
  }

  function workerRow(b) {
    const c = b.worker ? S.crew.find((x) => x.id === b.worker) : null;
    return `<div class="row"><span>Posted here</span><b data-live="bworker-${b.id}"></b></div>` + (c
      ? `<div class="btns"><button type="button" class="link half" data-open-crew="${c.id}">About ${c.name}</button><button type="button" class="danger half" data-unassign="${b.id}">Unpost them</button></div>`
      : `<button type="button" class="link" data-assign="${b.id}">Post someone here</button>`);
  }
  function fieldWorkerRow(f) {
    const c = f.worker ? S.crew.find((x) => x.id === f.worker) : null;
    return `<div class="row"><span>Posted here</span><b data-live="fworker-${f.id}"></b></div>` + (c
      ? `<div class="btns"><button type="button" class="link half" data-open-crew="${c.id}">About ${c.name}</button><button type="button" class="danger half" data-unassign-field="${f.id}">Unpost them</button></div>`
      : `<button type="button" class="link" data-assign-field="${f.id}">Post someone here</button>`);
  }

  function techHTML() {
    return `<h3>What the crew know</h3>
      <p class="muted small">Cores are spent here. <b data-live="cores"></b> in hand.</p>
      <div class="options">${TECH_ORDER.map((id) => {
        const t = TECH[id];
        const got = !!S.tech[id];
        const bad = got ? null : techOK(id);
        const needs = (t.needs || []).map((n) => TECH[n].name).join(', ');
        return `<button type="button" class="option tech ${got ? 'done' : bad ? 'off' : 'ready'}" data-tech="${id}"${got || bad ? ' disabled' : ''}>
          <span class="opt-label">${t.name} <em>${got ? 'known' : `${t.cost} core${t.cost === 1 ? '' : 's'}`}</em></span>
          <span class="opt-text">${t.blurb}${needs ? ` <i>Wants ${needs}.</i>` : ''}${!got && bad ? ` <i class="warn">${bad[0].toUpperCase() + bad.slice(1)}.</i>` : ''}</span>
        </button>`;
      }).join('')}</div>`;
  }

  function storeHTML() {
    return MAT_GROUPS.map((grp) => `<h3>${grp.name}</h3><table class="inv">
      <thead><tr><th>Material</th><th>On the deck</th><th></th></tr></thead>
      ${grp.mats.map((m) => `<tr>
        <td><i class="sw" style="background:${MATS[m].color}"></i>${MATS[m].name}</td>
        <td class="num" data-live="store-${m}"></td>
        <td class="note">${m === 'water' ? `room for ${waterCap()}` : ''}</td>
      </tr>`).join('')}</table>`).join('');
  }

  function renderPanel() {
    const key = panelKey();
    if (key === UI.panelKey) return updateLive();
    UI.panelKey = key;
    let html = '';
    const sel = UI.sel;

    if (sel && sel.kind === 'crew') {
      const c = S.crew.find((o) => o.id === sel.id);
      if (!c) { UI.sel = null; return renderPanel(); }
      html = `<h2><i class="dot" style="background:${c.suit}"></i>${c.name}</h2>
        <p class="muted">${c.home ? 'Has a bunk' : 'Sleeps on the deck plates'} · here ${plural(c.days, 'day')}</p>
        <div class="row"><span>Posted to</span><b data-live="vpost"></b></div>
        <div class="row"><span>Energy</span><div class="bar"><span data-live="energy"></span></div></div>
        <div class="row"><span>Suppers missed</span><span data-live="hunger"></span></div>
        <div class="row"><span>Working at</span><span data-live="eff"></span></div>
        <p class="doing" data-live="task"></p>
        ${c.slot ? `<button type="button" class="link" data-unassign-me="${c.id}">Let them work anywhere</button>` : ''}
        <p class="muted small">Tired crew work slowly. A bunk gives back most of a night; the deck plates give back half that. Missing supper makes both worse.</p>
        <p class="muted small">Nobody starves on Keelfall. Somebody who missed supper eats on the terrace, so a hungry colony quietly loses part of every harvest until the galley is stocked again.</p>`;

    } else if (sel && sel.kind === 'field') {
      const f = fieldOf(sel.id);
      if (!f) { UI.sel = null; return renderPanel(); }
      html = `<h2>Terrace plot <span class="muted">${f.w}×${f.h}</span></h2>
        <p class="muted" data-live="field"></p>
        <div class="row"><span>Water in the beds</span><div class="bar"><span data-live="wet"></span></div></div>
        <p class="doing" data-live="fstatus"></p>
        ${fieldWorkerRow(f)}
        <h3>Sown with</h3>
        <div class="options">${Object.entries(CROPS).map(([id, k]) => `<button type="button" class="option ${f.crop === id ? 'on' : ''}" data-crop="${id}">
          <span class="opt-label"><i class="sw" style="background:${MATS[id].color}"></i>${k.name} <em>${Math.round(k.grow / 24 * 10) / 10} days · ${k.yield}/tile · ${k.thirst >= 1 ? 'thirsty' : k.thirst >= 0.4 ? 'drinks a little' : 'barely drinks'}</em></span>
          <span class="opt-text">${k.blurb}</span></button>`).join('')}</div>
        <p class="muted small">Changing what is sown only affects tiles sown from now on. A plot with clean standing water beside it waters itself; otherwise the crew carry water out to it from the tank.</p>
        <button type="button" class="danger" data-demolish-field="${f.id}">Break it up</button>`;

    } else if (sel && sel.kind === 'tile') {
      const i = sel.id, x = i % COLS, y = Math.floor(i / COLS);
      const k = S.kind[i];
      if (k !== K.GROWTH && k !== K.WRECK) { UI.sel = null; return renderPanel(); }
      const isCut = k === K.GROWTH;
      const t = S.wtype[i];
      const what = isCut ? 'Overgrowth' : t === W.MAINFRAME ? 'Mainframe bay' : t === W.CONDUIT ? 'Conduit run' : 'Hull plating';
      const gives = isCut ? '2–4 timber'
        : t === W.MAINFRAME ? 'a data core, plus wire and plate'
        : t === W.CONDUIT ? '2–3 wire and a plate' : '2–4 scrap';
      const reach = beside(x, y).size > 0;
      html = `<h2>${what}</h2>
        <p class="muted">${isCut
          ? 'Mutated growth, straight through whatever it found. It comes out as timber.'
          : t === W.MAINFRAME ? 'A sealed bay with the ship’s own record of itself still in it.'
          : t === W.CONDUIT ? 'Copper loom, mostly intact.' : 'Armour plate and structural beam.'}</p>
        <div class="row"><span>Terrace</span><b>level ${S.lvl[i] + S.plat[i]}</b></div>
        <div class="row"><span>Work left</span><b>${Math.ceil(S.hp[i])}</b></div>
        <div class="row"><span>Gives</span><b>${gives}</b></div>
        <div class="row"><span>Marked</span><b>${S.mark[i] ? 'yes' : 'no'}</b></div>
        ${reach ? '' : '<p class="doing warn">Nobody can stand anywhere next to this. It wants a stair, a platform or a span onto that terrace first.</p>'}
        <button type="button" class="link" data-mark="${i}">${S.mark[i] ? 'Leave it alone' : isCut ? 'Mark it for cutting' : 'Mark it for stripping'}</button>`;

    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (!b) { UI.sel = null; return renderPanel(); }
      const def = BUILDINGS[b.type];
      html = `<h2>${def.name}</h2><p class="muted">${def.blurb}</p>`;
      if (!b.built) {
        html += `<div class="row"><span>Being raised</span><b data-live="raise-${b.id}"></b></div>
          <p class="muted small">Materials are already paid for. Somebody has to walk over and put it up.</p>`;
      } else if (b.type === 'deck') {
        html += `<div class="row"><span>Water in the tank</span><b data-live="wtank"></b></div>` + storeHTML()
          + `<p class="muted small">Everything the crew strip off the mountain ends up here, and everything they build goes back out from here. The tank grows with every cistern.</p>`;
      } else if (def.lab) {
        html += techHTML();
        const cr = def.craft;
        html += `<h3>Piecing burnt cores together</h3>
          <div class="row"><span>Recipe</span><b>${costText(cr.from)} → 1 core</b></div>
          <div class="row"><span>Inside</span><b data-live="cin"></b></div>
          <div class="row"><span>Rebuilt so far</span><b data-live="cmade"></b></div>
          <p class="doing" data-live="cstatus"></p>`;
        html += workerRow(b);
      } else if (def.craft) {
        const cr = def.craft;
        html += `<div class="row"><span>Recipe</span><b>${costText(cr.from)} → ${cr.make} ${MATS[cr.to].name.toLowerCase()}</b></div>
          <div class="row"><span>Inside</span><b data-live="cin"></b></div>
          <div class="row"><span>Made so far</span><b data-live="cmade"></b></div>
          <p class="doing" data-live="cstatus"></p>` + workerRow(b);
      } else if (def.draw) {
        html += `<div class="row"><span>Waiting to be drawn off</span><b data-live="dready"></b></div>
          <div class="row"><span>Draws from</span><b>${def.draw.need === 'clean' ? 'clean standing water beside it' : 'the toxic basin'}</b></div>
          <div class="row"><span>Carried to the deck so far</span><b data-live="dmade"></b></div>
          <p class="doing" data-live="dstatus"></p>` + workerRow(b)
          + `<p class="muted small">${def.draw.need === 'clean'
            ? 'It has to be standing next to water on a terrace — level 1 or above. Anything sitting in the basin has the coolant in it. In the rain it fills on its own, wherever it is, and one standing high on the mountain takes a little from the hull overnight even in a scorch — nowhere near enough to live on.'
            : 'It has to be standing next to the basin. Nothing else on the mountain can use that water.'}</p>`;
      } else if (def.pump) {
        html += `<p class="doing" data-live="pstatus"></p>
          <p class="muted small">It takes from the lowest water beside it and puts it on the highest ground beside it. Pair it with a levee and a terrace fills up like a bath.</p>`;
      } else if (def.tank) {
        html += `<div class="row"><span>Adds to the tank</span><b>${def.tank}</b></div>
          <div class="row"><span>Tank now holds</span><b data-live="wtank"></b></div>`;
      } else if (b.type === 'galley') {
        html += `<div class="row"><span>On the counter</span><b data-live="gstock"></b></div>
          <div class="row"><span>Room for</span><b>${GALLEY_CAP}</b></div>
          <p class="doing" data-live="gstatus"></p>` + workerRow(b)
          + `<p class="muted small"><b>The galley does not stock itself.</b> Somebody carries food up from the deck a load at a time, and drops whatever else they were doing when the counter will not cover supper.</p>
          <p class="muted small">Each crew member takes a plate and a cup of water at ${WORK_END}:00. Newcomers only stay when the counter and the tank will carry them too — a colony will not grow past its catchments.</p>`;
      } else if (b.type === 'bunk') {
        const names = b.residents.map((id) => S.crew.find((c) => c.id === id)).filter(Boolean).map((c) => c.name);
        html += `<div class="row"><span>Sleeping here</span><b>${names.length ? names.join(' and ') : 'nobody yet'}</b></div>
          <div class="row"><span>Free bunks</span><b>${def.beds - b.residents.length}</b></div>`;
      } else if (def.charge) {
        const ch = def.charge;
        html += `<div class="row"><span>Charge</span><div class="bar"><span data-live="bcharge"></span></div></div>
          <div class="row"><span>Parts fed in</span><b data-live="bfed"></b></div>
          <div class="row"><span>Wants</span><b>${ch.need} more loads of ${ch.per} parts</b></div>
          <p class="doing" data-live="bstatus"></p>` + workerRow(b)
          + `<p class="muted small">Once it is lit, somebody will come. The colony keeps going either way.</p>`;
      }
      if (b.built && b.type !== 'deck') {
        html += `<button type="button" class="link" data-move="${b.id}">Move it (${costText(moveFee(b.type))})</button>`;
      }
      if (b.type !== 'deck') {
        html += `<button type="button" class="danger" data-demolish-b="${b.id}">Pull it down (half the materials back)</button>`;
      }
    } else {
      panel.hidden = true; panel.innerHTML = '';
      return updateLive();
    }
    panel.innerHTML = '<button type="button" class="close" data-shut title="Close">×</button>' + html;
    panel.hidden = false;
    updateLive();
  }

  // The numbers inside an open panel, refreshed without rebuilding the markup.
  function updateLive() {
    const set = (k, v) => { for (const el of document.querySelectorAll(`[data-live="${k}"]`)) el.textContent = v; };
    const bar = (k, pct, cls) => {
      for (const el of document.querySelectorAll(`[data-live="${k}"]`)) {
        el.style.width = clamp(pct, 0, 100) + '%';
        el.className = cls || '';
      }
    };
    for (const m of MAT_ORDER) set('store-' + m, have(m));
    set('cores', plural(have('core'), 'core'));
    set('wtank', `${have('water')} / ${waterCap()}`);

    const sel = UI.sel;
    if (sel && sel.kind === 'crew') {
      const c = S.crew.find((o) => o.id === sel.id);
      if (c) {
        set('vpost', postName(c.slot));
        bar('energy', c.energy, c.energy < 20 ? 'crit' : c.energy < 40 ? 'low' : '');
        set('hunger', c.hunger ? plural(c.hunger, 'supper') : 'none');
        set('eff', Math.round(eff(c) * 100) + '%');
        set('task', taskLabel(c));
      }
    } else if (sel && sel.kind === 'field') {
      const f = fieldOf(sel.id);
      if (f) {
        let ripe = 0, growing = 0, bare = 0;
        for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
          const p = S.plots[idx(x, y)];
          if (!p) continue;
          if (p.stage === 2) ripe++; else if (p.stage === 1) growing++; else bare++;
        }
        set('field', `${plural(f.tiles, 'tile')} · ${ripe} ripe, ${growing} growing, ${bare} bare${f.drowned ? ` · ${f.drowned} drowned so far` : ''}`);
        bar('wet', f.wet / WET_CAP * 100, f.wet <= 0.5 ? 'crit' : f.wet < 3 ? 'low' : '');
        const watered = fieldWatered(f);
        set('fstatus', watered ? 'Standing water beside it — it waters itself.'
          : f.thirsty ? 'Dry. Nothing is growing until water reaches it.'
          : f.crop ? `Sown with ${CROPS[f.crop].name.toLowerCase()}.` : 'Nothing sown.');
      }
    } else if (sel && sel.kind === 'building') {
      const b = building(sel.id);
      if (b) {
        const def = BUILDINGS[b.type];
        if (!b.built) {
          const done = 1 - clamp(b.work / (BUILD_WORK * b.w * b.h), 0, 1);
          set('raise-' + b.id, Math.round(done * 100) + '%');
        }
        set('bworker-' + b.id, b.worker ? (S.crew.find((c) => c.id === b.worker) || {}).name || 'nobody' : 'nobody in particular');
        if (def.craft) {
          const cr = def.craft;
          set('cin', Object.keys(cr.from).map((m) => `${b.in[m] || 0} ${MATS[m].name.toLowerCase()}`).join(', '));
          set('cmade', `${b.made || 0} ${MATS[cr.to].name.toLowerCase()}`);
          set('cstatus', canCraft(b) ? 'Ready to run.' : 'Waiting on materials from the deck.');
        }
        if (def.draw) {
          set('dready', Math.floor(b.ready));
          set('dmade', b.made || 0);
          set('dstatus', b.state || '—');
        }
        if (def.pump) set('pstatus', b.state || 'Idle');
        if (b.type === 'galley') {
          set('gstock', b.stock);
          set('gstatus', b.stock >= S.crew.length ? 'Enough on the counter for tonight.' : b.stock > 0 ? 'Not enough for everybody tonight.' : 'Counter is bare.');
        }
        if (def.charge) {
          const ch = def.charge;
          bar('bcharge', (b.charge || 0) / ch.need * 100, '');
          set('bfed', `${b.in[ch.from] || 0} waiting`);
          set('bstatus', S.won ? 'Lit.' : (b.in[ch.from] || 0) >= ch.per ? 'Ready for another load.' : 'Wants parts carried up.');
        }
      }
    }
    for (const f of S.fields) set('fworker-' + f.id, f.worker ? (S.crew.find((c) => c.id === f.worker) || {}).name || 'nobody' : 'nobody in particular');
  }

  // ------------------------------------------------------------------ the log
  function openLedger() {
    UI.ledgerKey = '';
    overlay.innerHTML = '<div class="sheet ledger" id="ledger"></div>';
    overlay.hidden = false;
    UI.ledger = true;
    renderLedger();
  }
  function renderLedger() {
    if (!UI.ledger || overlay.hidden) return;
    const key = ledgerKey();
    if (key === UI.ledgerKey) return updateLive();
    UI.ledgerKey = key;
    const el = $('ledger');
    if (!el) return;
    el.innerHTML = ledgerHTML();
    updateLive();
  }
  function ledgerHTML() {
    const sn = seasonOf(S.day), wx = weatherOf();
    const techDone = TECH_ORDER.filter((t) => S.tech[t]).length;
    return `<h2>The log</h2>
      <p class="muted">Light the beacon on the peak. ${S.won ? `Done, on day ${S.lit}. Keep going as long as you like.` : ''}</p>
      ${tallyHTML()}
      <div class="season s-${sn.id}">
        <div class="row"><span>${sn.name}, day ${dayOfSeason(S.day)} of ${DAYS_PER_SEASON}</span><b>year ${yearOf(S.day)}</b></div>
        <p class="small">${sn.note}</p>
        <div class="row"><span>Outside</span><b>${wx.name}</b></div>
        <p class="small">${wx.note}</p>
      </div>
      <h3>The crew</h3>
      <p class="muted small">${growthStatus()}. Post someone to a plot or a workshop and they will stay near it.</p>
      <ul class="roster">${S.crew.map((c) => `<li>
        <i class="dot" style="background:${c.suit}"></i>
        <span class="vname">${c.name}</span>
        <span class="hmeter" title="Energy"><i style="width:${Math.round(c.energy)}%"></i></span>
        <span class="hun">${c.hunger ? plural(c.hunger, 'supper') + ' missed' : c.home ? 'has a bunk' : 'no bunk'}</span>
        <select data-post="${c.id}">
          <option value="">anywhere</option>
          ${S.fields.map((f) => `<option value="field:${f.id}"${c.slot && c.slot.kind === 'field' && c.slot.id === f.id ? ' selected' : ''}>Terrace ${f.w}×${f.h} at ${f.x},${f.y}</option>`).join('')}
          ${S.buildings.filter((b) => b.built && (BUILDINGS[b.type].craft || BUILDINGS[b.type].draw || b.type === 'galley' || BUILDINGS[b.type].charge)).map((b) => `<option value="building:${b.id}"${c.slot && c.slot.kind === 'building' && c.slot.id === b.id ? ' selected' : ''}>${BUILDINGS[b.type].name}</option>`).join('')}
        </select>
        <span class="vdoing">${taskLabel(c)}</span>
      </li>`).join('')}</ul>
      <h3>On the deck</h3>
      ${storeHTML()}
      <h3>What the crew know <span class="muted">${techDone} of ${TECH_ORDER.length}</span></h3>
      <p class="muted small">${firstOf('lab') ? 'Open the data lab to spend cores.' : 'Nothing can be decoded until there is a data lab.'}</p>
      <ul class="log">${TECH_ORDER.map((id) => `<li class="${S.tech[id] ? 'good' : ''}"><small>${S.tech[id] ? 'known' : TECH[id].cost + 'c'}</small>${TECH[id].name}</li>`).join('')}</ul>
      <h3>Lately</h3>
      <ul class="log">${S.log.map((l) => `<li class="${l.kind}"><small>day ${l.day}</small>${l.text}</li>`).join('') || '<li>Nothing yet.</li>'}</ul>
      <button type="button" class="primary" data-close>Back to the mountain</button>`;
  }

  // --------------------------------------------------- this morning's notice
  function renderNotice() {
    const key = noticeKey();
    if (key === UI.noticeKey) return;
    UI.noticeKey = key;
    const n = S.notice;
    if (!n || UI.noticeShut) { noticeSlot.innerHTML = ''; return; }
    const offer = n.offer && !n.taken
      ? `<div class="nbtns"><button type="button" data-take>${n.offer.label}</button><button type="button" class="dismiss" data-shut-notice>Leave it</button></div>`
      : `<div class="nbtns"><button type="button" class="dismiss" data-shut-notice>Close</button></div>`;
    noticeSlot.innerHTML = `<div class="notice n-${n.kind}">
      <h3>Day ${S.day}</h3><p>${n.text}${n.taken ? ' <b>Done.</b>' : ''}</p>${offer}</div>`;
  }

  // --------------------------------------------------------------- clicking
  function panelClick(e) {
    const el = e.target.closest('button, select');
    if (!el) return;
    const d = el.dataset;
    if (d.shut !== undefined) { UI.sel = null; renderPanel(); return; }
    if (d.shutNotice !== undefined) { UI.noticeShut = true; renderNotice(); return; }
    if (d.take !== undefined) { takeNotice(); return; }
    if (d.crop) { const f = fieldOf(UI.sel.id); if (f) { f.crop = d.crop; UI.structure++; } return; }
    if (d.tech) { buyTech(d.tech); return; }
    if (d.mark) {
      const i = Number(d.mark);
      S.mark[i] = S.mark[i] ? 0 : 1;
      if (!S.mark[i]) delete CLAIMS['m:' + i];
      UI.structure++;
      return;
    }
    if (d.demolishB) { demolishBuilding(Number(d.demolishB)); return; }
    if (d.demolishField) { demolishField(Number(d.demolishField)); return; }
    if (d.move) { UI.moving = Number(d.move); setTool('move'); UI.sel = null; overlay.hidden = true; UI.ledger = false; return; }
    if (d.openCrew) { UI.sel = { kind: 'crew', id: Number(d.openCrew) }; renderPanel(); return; }
    if (d.unassign) { const b = building(Number(d.unassign)); if (b && b.worker) unassignCrew(b.worker); return; }
    if (d.unassignField) { const f = fieldOf(Number(d.unassignField)); if (f && f.worker) unassignCrew(f.worker); return; }
    if (d.unassignMe) { unassignCrew(Number(d.unassignMe)); return; }
    if (d.assign || d.assignField) {
      const fac = d.assign ? { kind: 'building', id: Number(d.assign) } : { kind: 'field', id: Number(d.assignField) };
      const free = S.crew.find((c) => !c.slot) || S.crew[0];
      if (free) assignCrew(free.id, fac);
      return;
    }
  }
  panel.addEventListener('click', panelClick);
  panel.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-post]');
    if (!sel) return;
    const [kind, id] = sel.value ? sel.value.split(':') : [null, null];
    assignCrew(Number(sel.dataset.post), kind ? { kind, id: Number(id) } : null);
  });
  noticeSlot.addEventListener('click', panelClick);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed], [data-zoom], [data-action]');
    if (!b) return;
    if (b.dataset.speed !== undefined) setSpeed(Number(b.dataset.speed));
    if (b.dataset.zoom !== undefined) changeZoom(Number(b.dataset.zoom));
    if (b.dataset.action === 'ledger') openLedger();
    if (b.dataset.action === 'help') showHelp();
    if (b.dataset.action === 'levels') { UI.showLevels = !UI.showLevels; b.classList.toggle('on', UI.showLevels); }
    if (b.dataset.action === 'new-game') confirmNew();
  });

  // ------------------------------------------------------------ overlays
  function sheet(html) { UI.ledger = false; overlay.innerHTML = `<div class="sheet">${html}</div>`; overlay.hidden = false; }
  overlay.addEventListener('click', (e) => {
    if (UI.ledger && !e.target.closest('[data-close]') && e.target !== overlay) panelClick(e);
    if (e.target === overlay || e.target.closest('[data-close]')) { overlay.hidden = true; UI.ledger = false; }
    if (e.target.closest('[data-reset]')) {
      wipe(); newState();
      UI.sel = null; UI.structure++; groundDirty = true; overlay.hidden = true;
      for (const k of Object.keys(CLAIMS)) delete CLAIMS[k];
      renderToolbar();
      setTool('select');
    }
  });
  overlay.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-post]');
    if (!sel) return;
    const [kind, id] = sel.value ? sel.value.split(':') : [null, null];
    assignCrew(Number(sel.dataset.post), kind ? { kind, id: Number(id) } : null);
  });

  function showHelp() {
    sheet(`<h2>How to play</h2>
      <p>The Meridian is in four pieces down the side of a mountain and you are standing on the nose of it. Three of you walked away. Everything else you are going to need is somewhere below, under the trees.</p>
      <h3>The mountain has levels</h3>
      <ul>
        <li>Every tile stands on one of <b>four terraces</b>, level 3 on the peak down to level 0 in the basin. The steps are drawn as rock faces; press <b>E</b> to put a number on every tile instead.</li>
        <li><b>Nobody walks up a step.</b> To get from one terrace to the next you build a <b>stair</b> on the lower tile beside it. A <b>platform</b> raises one tile by a step, to level off ground for a building or carry it out over a drop. A <b>span</b> crosses the chasm at the level you drag from, and a <b>cargo lift</b> stands at every level at once.</li>
        <li>Buildings need <b>level ground</b> — the whole footprint on one step, clear and dry.</li>
      </ul>
      <h3>The loop</h3>
      <ul>
        <li><b>Cut</b> marks growth; <b>Salvage</b> marks wreck. The crew work through whatever is marked and carry it up to the deck. Growth gives timber. Hull gives scrap, conduits give wire, and the sealed <b>mainframe bays</b> give data cores.</li>
        <li><b>Cores</b> are spent in the <b>data lab</b> on what the crew are allowed to build — spans, smelting, hydrology, pumps and eventually the beacon. The lab can also piece burnt cores back together out of wire and plate, so you can never run dry.</li>
        <li><b>Terrace plots</b> feed everybody. Ash fern is quick and barely drinks; tubers are worth more and thirsty; sporefruit is slow and gets through the scorch.</li>
        <li><b>The galley</b> does not stock itself — somebody carries food up from the deck. Every crew member takes a plate and a cup of water at ${WORK_END}:00.</li>
      </ul>
      <h3>Water</h3>
      <ul>
        <li>The ruptured coolant tank on the peak runs hard in <b>Runoff</b>, trickles in <b>Green</b> and stops dead in <b>Scorch</b>. Water runs downhill, pools on flat ground, and falls into the chasm and is gone.</li>
        <li>A <b>levee</b> is a wall water will not cross. Put one across a terrace and the runoff ponds behind it instead of reaching the basin.</li>
        <li>A <b>catchment</b> beside clean standing water fills up, and a crew member carries it to the tank. Nothing else puts water in the tank, so build one early — the ground below the coolant tank is already wet. <b>Cisterns</b> make the tank bigger, which is the whole of surviving a scorch.</li>
        <li>Anything standing in the <b>basin</b> has the drive coolant in it and is no use until the <b>filtration plant</b> is up. A <b>pump</b> takes water from beside it and puts it a terrace higher.</li>
        <li>Crew walk round standing water rather than through it, and a flooded terrace plot loses whatever was growing in it. If a pond closes the only way home they will wade it, slowly and unhappily.</li>
      </ul>
      <h3>Getting about</h3>
      <ul>
        <li>The mountain is bigger than the window. Put the pointer in the <b>band at the edge</b> and <b>hold the button down</b> to walk the camera, or use the arrow keys, or drag with the <b>right button</b>. The small map in the corner jumps you anywhere.</li>
        <li><b>Zoom</b> with the wheel, with <b>+</b> and <b>&minus;</b>, or with the buttons. <b>0</b> puts the whole mountain on the screen.</li>
        <li>The <b>log</b> at the top right holds the season, the crew, the deck and everything that has happened. <b>L</b> opens it. Space pauses.</li>
      </ul>
      <p>Get the beacon up on the top terrace and feed it parts until it lights.</p>
      <button type="button" class="primary" data-close>Out to the mountain</button>`);
  }
  function confirmNew() {
    sheet(`<h2>Start over?</h2><p>This throws away this mountain, everything built on it and everyone on it, and comes down somewhere else.</p>
      <div class="btns"><button type="button" class="primary" data-reset>Crash somewhere else</button><button type="button" class="ghost" data-close>Keep going</button></div>`);
  }
  function showWin() {
    sheet(`<h2>The beacon is lit</h2>
      <p>Day ${S.day}, with ${plural(S.crew.length, 'crew')} still on their feet, ${plural(S.cut, 'tile')} of growth cut and ${plural(S.stripped, 'tile')} of the Meridian carried up the hill by hand.</p>
      <p>It will be a while before anybody answers. The colony runs perfectly well in the meantime — keep building.</p>
      <button type="button" class="primary" data-close>Keep going</button>`);
  }

  // ------------------------------------------------------------ loop
  let last = performance.now(), uiT = 0, miniT = 0;
  function frame(now) {
    const raw = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    clockT += raw;
    refreshEdge();
    panCamera(raw);
    if (UI.speed && overlay.hidden) {
      const dt = raw * UI.speed;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) tick(dt / steps);
    }
    draw();
    uiT += raw;
    if (uiT > 0.2) {
      uiT = 0;
      renderStats(); renderPanel(); renderNotice(); renderLedger();
      if (hintTimer > 0 && (hintTimer -= 0.2) <= 0) { hintEl.textContent = defaultHint(); hintEl.classList.remove('bad'); }
    }
    miniT += raw;
    if (miniT > 0.14) { miniT = 0; drawMini(); }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ boot
  if (!load()) newState();
  renderToolbar();
  setTool('select');
  renderStats();
  renderPanel();
  renderNotice();
  drawMini();
  hintEl.textContent = defaultHint();
  window.addEventListener('beforeunload', save);
  setInterval(save, 20000);
  requestAnimationFrame(frame);

  // A handle for the console and for testing.
  window.__keelfall = {
    get S() { return S; }, UI, CLAIMS, BLOCKED, besideGround, tick, draw, save, load, wipe, newState, openUp, seedStart,
    MATS, CROPS, BUILDINGS, GROUND, TECH, TECH_ORDER, TOOLS, SEASONS, WEATHER, NOTICES, TERRACE,
    K, W, COLS, ROWS, TILE, LEVELS, idx, inb, resize, changeZoom, centreCamera,
    walkable, linked, loLvl, hiLvl, findPath, reachable, colonyRegion, beside, entrances,
    placeBuilding, placeGround, placeField, stranded, markArea, unmarkArea, demolishAt, demolishBuilding, demolishField,
    moveBuilding, buyTech, techOK, assignCrew, unassignCrew, addCrew, breakTile,
    rollWeather, rollNotice, takeNotice, morning, evening, regrow, waterStep, waterSources, runPump,
    renderPanel, renderLedger, openLedger, renderToolbar, setTool, setSpeed, showHelp, winGame,
    have, canAfford, pay, waterCap, waterWorks, totalBeds, galleyStock, foodInStore, growthHurdles, growthStatus,
    get VIEW_W() { return VIEW_W; }, get VIEW_H() { return VIEW_H; },
    set groundDirty(v) { groundDirty = v; },
  };
})();
