/* Coffee Rush: the rules. Run the counter of a little cafe. Customers queue at the counter,
   you pull the shots and bake the treats they ask for, and between days you spend the
   takings on machines and drag them wherever you want them on the floor.

   The data (items, machines, upgrades, the room's size) is plain exports. The running
   cafe is createCafe, with no page access, so a whole day can be played in Node:

     const cr = createCafe({ save, best, keys, rnd, on })
       save   the player's progress (day, bank, upgrades, where each machine stands); the
              cafe spends and earns into it, and the page writes it to localStorage
       best   the best single day so far
       keys   a Set of the keys held down (ArrowLeft / a, ...): how you walk
       on     on(event, data): 'say' { text, ms }, 'save', 'shift-over' { closedOnTime,
              completedDay, bonus }

   cr.S (the day), cr.best and the layout (COUNTER, APPLIANCES, SOLIDS, POOL, UNPLACED)
   are getters: each is rebuilt as the game goes. */

import { mulberry32 } from '../lib/rng.js';

  export const TILE = 48;
  export const ROOM_COLS = 21;
  export const ROOM_ROWS = 12;
  export const FLOOR_TOP = 4; // rows 0-3 are the back wall
  export const COUNTER_COL = 6; // the service counter; the customers' side is left of it
  export const DOOR = { x: 226, y: 206 }; // on the door mat, where customers come and go
  export const MACHINE_RISE = 84; // how far a machine on its cabinet stands above its footprint
  export const COLS = ROOM_COLS;
  export const ROWS = ROOM_ROWS;
  export const W = COLS * TILE;
  export const H = ROWS * TILE;

  export const BASE_CUSTOMERS = 4;
  export const BASE_COUNTER_SLOTS = 8;
  export const MAX_STRIKES = 3;
  export const BASE_PLAYER_SPEED = 200;
  export const CUSTOMER_SPEED = 170;
  export const LEAVE_TIME = 1.1; // seconds a customer takes to fade out on the way to the door
  export const REACH = 18;
  export const SHIFT_LENGTH = 90; // seconds per day
  export const SAVE_VERSION = 3; // v3: the front-on room; floor plans from before it are dropped

  // Items with a "from" are made in two steps: carry the ingredient to the
  // machine that finishes it. Everything else comes straight out of a machine.
  export const ITEMS = {
    espresso: { name: "espresso", emoji: "☕", time: 2.2, price: 3, verb: "Pull", ing: "Pulling", hot: true },
    cookie: { name: "cookies", emoji: "🍪", time: 4.0, price: 3, verb: "Bake", ing: "Baking" },
    brownie: { name: "brownies", emoji: "🍫", time: 5.5, price: 4, verb: "Bake", ing: "Baking" },
    latte: { name: "latte", emoji: "🥛", time: 2.0, price: 6, verb: "Pour", ing: "Pouring", hot: true, from: "espresso" },
    muffin: { name: "muffins", emoji: "🧁", time: 4.6, price: 5, verb: "Bake", ing: "Baking" },
    iced: { name: "iced latte", emoji: "🧋", time: 1.8, price: 9, verb: "Shake", ing: "Shaking", from: "latte" },
    soup: { name: "soup", emoji: "🍲", time: 6.2, price: 8, verb: "Ladle", ing: "Ladling", hot: true },
    roll: { name: "rolls", emoji: "🥖", time: 3.4, price: 3, verb: "Bake", ing: "Baking" },
    toastie: { name: "toastie", emoji: "🥪", time: 2.6, price: 10, verb: "Press", ing: "Pressing", hot: true, from: "roll" },
    smoothie: { name: "smoothie", emoji: "🥤", time: 3.2, price: 8, verb: "Blend", ing: "Blending" }
  };

  // Every kind of machine: what it makes and how big its cabinet is. Everything
  // stands on a cabinet one tile deep: "wide" is two tiles across, "small" one.
  // The plaque is the brass-and-wood label screwed to the cabinet front.
  export const MACHINES = {
    espresso: { makes: "espresso", label: "Espresso", shape: "wide", plaque: "Espresso" },
    cookie: { makes: "cookie", label: "Cookie oven", shape: "wide", plaque: "Cookie oven" },
    brownie: { makes: "brownie", label: "Brownie oven", shape: "wide", plaque: "Brownie oven" },
    muffin: { makes: "muffin", label: "Muffin oven", shape: "wide", plaque: "Muffin oven" },
    milk: { makes: "latte", label: "Milk bar", shape: "small", plaque: "Milk" },
    ice: { makes: "iced", label: "Ice well", shape: "small", plaque: "Ice" },
    soup: { makes: "soup", label: "Soup kettle", shape: "small", plaque: "Soup" },
    bread: { makes: "roll", label: "Bread oven", shape: "wide", plaque: "Bread oven" },
    press: { makes: "toastie", label: "Sandwich press", shape: "wide", plaque: "Toastie press" },
    blend: { makes: "smoothie", label: "Blender", shape: "small", plaque: "Blend" }
  };

  export const BASE_MACHINES = ["espresso", "cookie", "brownie"];

  // New machines are delivered as the days go by.
  export const UNLOCKS = [
    { day: 3, type: "milk", text: "A milk bar arrives: carry an espresso over to pour a 🥛 latte." },
    { day: 5, type: "muffin", text: "A muffin oven arrives: 🧁 muffins bake on their own." },
    { day: 7, type: "ice", text: "An ice well is plumbed in: take a latte there to shake a 🧋 iced latte." },
    { day: 10, type: "soup", text: "A soup kettle goes on the back wall: 🍲 soup ladles itself, slowly, and pays well." },
    { day: 12, type: "bread", text: "A bread oven arrives: 🥖 rolls, quick and cheap, and good for something else." },
    { day: 14, type: "press", text: "A sandwich press is bolted down: carry a roll over and press a 🥪 toastie. Ten coins." },
    { day: 17, type: "blend", text: "A blender lands on the counter: 🥤 smoothies, no heat, no queue." }
  ];

  // How often an item turns up in an order, once its machine is on the floor.
  export const ITEM_WEIGHT = { espresso: 3, cookie: 2, brownie: 2, latte: 2, muffin: 2, iced: 1,
    soup: 2, roll: 2, toastie: 1, smoothie: 2 };

  // Customers are drawn from Amber's four character sheets, each person in
  // three moods: "a0" happy, "a0-wait" checking a watch, "a0-cross" arms folded.
  export const CUSTOMER_ART = ["a0", "a1", "a2", "a3", "a4", "a5", "b0", "b1", "b2", "b3", "b4", "b5",
    "c0", "c1", "c2", "c3", "c4", "d0", "d1", "d2", "d3", "d4", "d5"];
  export const MOODS = ["", "-wait", "-cross"];

  export const FACES = ["😊", "🙂", "😄", "🤓", "😎", "🥰", "😌", "🧐", "😃", "🙃", "😇", "🤠", "😏", "🥸", "😶", "🤗"];
  export const SHIRTS = ["#5b8def", "#e06c9f", "#4fb286", "#f0a35e", "#9b7bd8", "#e2c04e",
    "#3f9fa8", "#c25f4f", "#7a8b3e", "#b98bd0", "#d8734f", "#4b6ea8"];
  export const HAIRS = ["#3b2417", "#7a4a2a", "#e0b04f", "#b5412c", "#2c2c34", "#8c6a54", "#d98e73",
    "#57534a", "#a8a29b", "#5c3a5c", "#1f2a33", "#c9a227"];

  // Persistent upgrades. Cost for the next level = round5(base * mult ^ level).
  export const UPGRADES = [
    { id: "shoes", name: "Comfy shoes", icon: "👟", max: 5, base: 30, mult: 1.6, desc: "Move 12% faster per level.", level: (l) => "Speed +" + l * 12 + "%" },
    { id: "tray", name: "Serving tray", icon: "🍽️", max: 3, base: 45, mult: 1.8, desc: "Carry one more item at a time.", level: (l) => "Carry " + (1 + l) },
    { id: "turbo", name: "Turbo appliances", icon: "⚡", max: 4, base: 40, mult: 1.6, desc: "Machines and ovens finish 12% sooner per level.", level: (l) => "Cook time -" + Math.round((1 - Math.pow(0.88, l)) * 100) + "%" },
    { id: "espresso", name: "Espresso machines", icon: "☕", max: 2, base: 80, mult: 1.7, desc: "One more espresso machine, so two orders can pull at once.", level: (l) => (1 + l) + " machines" },
    { id: "cookieOvens", name: "Cookie ovens", icon: "🍪", max: 2, base: 75, mult: 1.7, desc: "One more oven baking cookies.", level: (l) => (1 + l) + " ovens" },
    { id: "brownieOvens", name: "Brownie ovens", icon: "🍫", max: 2, base: 90, mult: 1.7, desc: "One more oven baking brownies.", level: (l) => (1 + l) + " ovens" },
    { id: "milkbar", name: "Second milk bar", icon: "🥛", max: 1, base: 130, mult: 1, from: 3, desc: "A second milk bar, so lattes do not queue behind each other.", level: (l) => (1 + l) + " milk bars" },
    { id: "soupkettle", name: "Second soup kettle", icon: "🍲", max: 1, base: 160, mult: 1, from: 10, desc: "Soup takes six seconds a bowl. Two kettles halve the queue.", level: (l) => (1 + l) + " kettles" },
    { id: "breadOvens", name: "Bread ovens", icon: "🥖", max: 1, base: 120, mult: 1, from: 12, desc: "A second bread oven, so the press is never waiting on a roll.", level: (l) => (1 + l) + " ovens" },
    { id: "seating", name: "Cosy seating", icon: "🛋️", max: 4, base: 35, mult: 1.6, desc: "Customers wait 15% longer per level.", level: (l) => "Patience +" + l * 15 + "%" },
    { id: "tables", name: "Extra tables", icon: "🪑", max: 2, base: 70, mult: 2, desc: "Room for one more in the queue, and two more plates on the counter. More orders, more coins, more pressure.", level: (l) => (BASE_CUSTOMERS + l) + " customers" },
    { id: "tips", name: "Tip jar", icon: "💰", max: 3, base: 50, mult: 1.7, desc: "Quick service tips up to 2 coins more per level.", level: (l) => "Max tip " + (3 + l * 2) },
    { id: "helper", name: "Hire Sam", icon: "🧑‍🍳", max: 2, base: 250, mult: 0.6, desc: "Sam starts wanted orders, collects what is ready and runs it to the counter. Level 2: roller skates.", level: (l) => (l === 0 ? "Just you" : l === 1 ? "Sam hired" : "Sam on skates") }
  ];


  export function freshSave() {
    const up = {};
    for (const u of UPGRADES) up[u.id] = 0;
    return { v: SAVE_VERSION, day: 1, bank: 0, upgrades: up, layout: {}, layoutCols: 0, layoutRows: 0 };
  }

  export function clock(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }



  // Amber's counter (cabinets/counter.png) is a short one seen from the front:
  // the far end, the wooden top, the lip, then the green front. It is drawn in
  // three slices so only the top stretches to run from the back wall to the
  // front of the room, and the end and the front keep their own shape. The
  // numbers are the sprite's own rows and columns.
  export const CTR = {
    cap: 64,            // the rounded far end, down to where the top runs straight
    lip: 444,           // where the top ends and the lip and green front begin
    topW: 175,          // the wood's width across
    midFar: 141,        // the wood's centre column at the cap...
    midNear: 97.5,      // ...and at the lip: it leans, so plates follow it
    rows: 609,          // the picture's height
  };
  export const LIFT = 38; // how high the service counter's top sits above its footprint
  export const CTR_SCALE = (TILE + 16) / CTR.topW;

export function createCafe({ save, best: best0, keys = new Set(), rnd, on = () => {} } = {}) {
  let R = rnd || Math.random;

  const lvl = (id) => save.upgrades[id] || 0;
  const upgradeCost = (u) => Math.max(5, Math.round((u.base * Math.pow(u.mult, lvl(u.id))) / 5) * 5);
  // Walking speeds were tuned on a 16-tile floor; the painted room's floor,
  // right of the counter, is 14 tiles across, so they carry over as they are.
  const roomSpan = () => 1;
  const playerSpeed = () => BASE_PLAYER_SPEED * (1 + 0.12 * lvl("shoes")) * roomSpan();
  const carryCap = () => 1 + lvl("tray");
  const cookTime = (item) => ITEMS[item].time * Math.pow(0.88, lvl("turbo"));
  const patienceMult = () => 1 + 0.15 * lvl("seating");
  const maxTip = () => 3 + 2 * lvl("tips");
  const maxCustomers = () => BASE_CUSTOMERS + lvl("tables");
  const counterSlots = () => BASE_COUNTER_SLOTS + 2 * lvl("tables");

  // ---------- layout (rebuilt from the upgrades and wherever you dragged things) ----------
  let COUNTER = null;
  let APPLIANCES = [];
  let SOLIDS = [];
  let POOL = [];
  let UNPLACED = [];

  function unlockedTypes(day) {
    const d = day === undefined ? save.day : day;
    const set = new Set(BASE_MACHINES);
    for (const u of UNLOCKS) if (d >= u.day) set.add(u.type);
    return set;
  }

  function unlockedItems(day) {
    const items = [];
    for (const t of unlockedTypes(day)) items.push(MACHINES[t].makes);
    return items;
  }

  function unlockFor(day) {
    return UNLOCKS.find((u) => u.day === day) || null;
  }

  // Every machine the cafe owns, in a fixed order so the ids stay stable and a
  // machine you moved is still the same machine tomorrow.
  function machineList() {
    const types = unlockedTypes();
    const list = [];
    const add = (type, n) => {
      for (let i = 1; i <= n; i++) list.push({ id: type + "-" + i, type: type });
    };
    add("espresso", 1 + lvl("espresso"));
    add("cookie", 1 + lvl("cookieOvens"));
    add("brownie", 1 + lvl("brownieOvens"));
    if (types.has("milk")) add("milk", 1 + lvl("milkbar"));
    if (types.has("muffin")) add("muffin", 1);
    if (types.has("ice")) add("ice", 1);
    if (types.has("soup")) add("soup", 1 + lvl("soupkettle"));
    if (types.has("bread")) add("bread", 1 + lvl("breadOvens"));
    if (types.has("press")) add("press", 1);
    if (types.has("blend")) add("blend", 1);
    list.push({ id: "bin", type: "bin" });
    return list;
  }

  function machineSize(type) {
    const shape = type === "bin" ? "small" : MACHINES[type].shape;
    if (shape === "wide") return { w: 2, h: 1 };
    return { w: 1, h: 1 };
  }

  function spotRect(type, c, r) {
    const s = machineSize(type);
    return { x: c * TILE, y: r * TILE, w: s.w * TILE, h: s.h * TILE };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function spotFits(type, c, r, taken) {
    const s = machineSize(type);
    if (c <= COUNTER_COL || r < FLOOR_TOP || c + s.w > COLS || r + s.h > ROWS) return false;
    const rect = spotRect(type, c, r);
    for (const t of taken) if (rectsOverlap(rect, t)) return false;
    return true;
  }

  // Fits, and still leaves every machine — this one included — something to
  // stand at. Machines only ever take floor away, so a spot that keeps the room
  // walkable now keeps it walkable however many more turn up afterwards.
  function spotOk(type, c, r, taken) {
    if (!spotFits(type, c, r, taken)) return false;
    return layoutWorks(taken.concat([spotRect(type, c, r)]));
  }

  function makeAppliance(m, c, r) {
    const rect = spotRect(m.type, c, r);
    const a = { id: m.id, type: m.type, c: c, r: r, x: rect.x, y: rect.y, w: rect.w, h: rect.h, movable: true };
    if (m.type === "bin") {
      a.kind = "bin";
      a.label = "Bin";
      a.color = "#4e555e";
    } else {
      const def = MACHINES[m.type];
      a.kind = "maker";
      a.makes = def.makes;
      a.label = def.label;
      a.color = def.color;
    }
    return a;
  }

  // A spot you dragged a machine to, carried over if the room has changed shape
  // since. Anything arranged in the far half keeps its distance from the far
  // wall, so a floor plan laid out in one window still makes sense in another.
  function savedSpot(m) {
    const v = save.layout && save.layout[m.id];
    if (!v) return null;
    const size = machineSize(m.type);
    const wasC = save.layoutCols || 16;
    const wasR = save.layoutRows || 11;
    let c = v[0];
    let r = v[1];
    if (wasC !== COLS && c + size.w > wasC / 2) c += COLS - wasC;
    if (wasR !== ROWS && r + size.h > (FLOOR_TOP + wasR) / 2) r += ROWS - wasR;
    return { c: Math.max(0, Math.min(COLS - 1, c)), r: Math.max(FLOOR_TOP, Math.min(ROWS - 1, r)) };
  }

  function buildLayout() {
    // The counter runs from the back wall to the front of the room.
    COUNTER = { kind: "counter", id: "counter", type: "counter", x: COUNTER_COL * TILE, y: FLOOR_TOP * TILE, w: TILE, h: (ROWS - FLOOR_TOP) * TILE, label: "Counter", color: "#a8703f", movable: false };
    const wanted = machineList();
    const taken = [{ x: COUNTER.x, y: COUNTER.y, w: COUNTER.w, h: COUNTER.h }];
    const placed = [];
    UNPLACED = [];
    for (const m of wanted) {
      const s = savedSpot(m);
      if (s && spotOk(m.type, s.c, s.r, taken)) {
        taken.push(spotRect(m.type, s.c, s.r));
        placed.push(makeAppliance(m, s.c, s.r));
      } else {
        // Not laid out yet: the machine stays in its crate until the player
        // drags it out. Nothing is ever auto-placed for them.
        UNPLACED.push(m);
      }
    }
    APPLIANCES = [COUNTER].concat(placed);
    // The back wall, and the customers' side of the counter. The player never crosses it.
    SOLIDS = [{ x: 0, y: 0, w: W, h: FLOOR_TOP * TILE }, { x: 0, y: 0, w: COUNTER_COL * TILE, h: H }].concat(APPLIANCES);
    for (const a of APPLIANCES) {
      a.state = "idle";
      a.t = 0;
    }
    rebuildPool();
  }

  // Only order what the cafe can actually make: if a machine is still in its
  // crate, nobody asks for what it makes.
  function rebuildPool() {
    POOL = [];
    const madeHere = new Set();
    for (const a of APPLIANCES) if (a.kind === "maker") madeHere.add(a.makes);
    for (const item of unlockedItems()) {
      if (!madeHere.has(item)) continue;
      const from = ITEMS[item].from;
      if (from && !madeHere.has(from)) continue;
      const n = ITEM_WEIGHT[item] || 1;
      for (let i = 0; i < n; i++) POOL.push(item);
    }
  }

  // Where someone stands to use an appliance. Below it if there is room, else
  // whichever side is clear, so a machine dragged into the middle still works.
  function standingPoint(a) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const opts = [
      { x: cx, y: a.y + a.h + 22 },
      { x: a.x + a.w + 22, y: cy },
      { x: a.x - 22, y: cy },
      { x: cx, y: a.y - 22 }
    ];
    for (const o of opts) {
      if (o.x < (COUNTER_COL + 1) * TILE + 16 || o.x > W - 16 || o.y < FLOOR_TOP * TILE + 16 || o.y > H - 16) continue;
      let clear = true;
      for (const s of SOLIDS) {
        if (s !== a && circleHitsRect(o.x, o.y, 15, s)) {
          clear = false;
          break;
        }
      }
      if (clear) return o;
    }
    return { x: cx, y: Math.max(FLOOR_TOP * TILE + 22, Math.min(H - 16, a.y + a.h + 22)) };
  }

  // ---------- walkable floor ----------
  // A coarse tile grid, used to find a safe spawn and to check that a layout
  // you have rearranged still lets you reach everything.
  function blockedGrid(rects) {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        let b = r < FLOOR_TOP || c <= COUNTER_COL;
        if (!b) {
          const t = { x: c * TILE, y: r * TILE, w: TILE, h: TILE };
          for (const rect of rects) {
            if (rectsOverlap(t, rect)) {
              b = true;
              break;
            }
          }
        }
        row.push(b);
      }
      g.push(row);
    }
    return g;
  }

  function floodFill(g, sc, sr) {
    const seen = g.map((row) => row.map(() => false));
    if (g[sr][sc]) return seen;
    const q = [[sc, sr]];
    seen[sr][sc] = true;
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (q.length) {
      const cur = q.shift();
      for (const d of steps) {
        const nc = cur[0] + d[0];
        const nr = cur[1] + d[1];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (seen[nr][nc] || g[nr][nc]) continue;
        seen[nr][nc] = true;
        q.push([nc, nr]);
      }
    }
    return seen;
  }

  // A free tile to start from: beside the counter, halfway down, if we can.
  function startTile(g) {
    const c0 = COUNTER_COL + 1;
    const mid = Math.floor((FLOOR_TOP + ROWS) / 2);
    for (let d = 0; d < ROWS; d++) {
      for (const r of [mid - d, mid + d]) {
        if (r >= FLOOR_TOP && r < ROWS && !g[r][c0]) return { c: c0, r: r };
      }
    }
    for (let r = FLOOR_TOP; r < ROWS; r++) {
      for (let c = c0; c < COLS; c++) if (!g[r][c]) return { c: c, r: r };
    }
    return null;
  }

  // Every appliance needs a walkable tile beside it that you can actually get to.
  function layoutWorks(rects) {
    const g = blockedGrid(rects);
    const st = startTile(g);
    if (!st) return false;
    const seen = floodFill(g, st.c, st.r);
    for (const rect of rects) {
      const c0 = Math.round(rect.x / TILE);
      const r0 = Math.round(rect.y / TILE);
      const cw = Math.round(rect.w / TILE);
      const ch = Math.round(rect.h / TILE);
      let ok = false;
      for (let c = c0; c < c0 + cw && !ok; c++) {
        for (const r of [r0 - 1, r0 + ch]) {
          if (r >= 0 && r < ROWS && !g[r][c] && seen[r][c]) ok = true;
        }
      }
      for (let r = r0; r < r0 + ch && !ok; r++) {
        for (const c of [c0 - 1, c0 + cw]) {
          if (c >= 0 && c < COLS && !g[r][c] && seen[r][c]) ok = true;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  function applianceRects(skip) {
    const out = [];
    for (const a of APPLIANCES) if (a !== skip) out.push({ x: a.x, y: a.y, w: a.w, h: a.h });
    return out;
  }

  // The day cannot start with an empty floor: the cafe needs at least one
  // appliance actually on it. The counter is fixed and never counts.
  function canStart() {
    return APPLIANCES.some((a) => a.movable);
  }

  // Machines still in their crates sit in a row along the front of the room.
  // Nothing is placed for the player: each one has to be dragged onto the
  // floor by hand. A long delivery squeezes the crates up together.
  function crateSlot(i) {
    const n = UNPLACED.length;
    const x0 = (COUNTER_COL + 1) * TILE;
    const span = W - x0 - 8;
    const step = Math.min(TILE, span / n);
    const left = x0 + (span - step * (n - 1) - TILE) / 2;
    return { x: left + i * step, y: (ROWS - 1) * TILE, w: TILE, h: TILE };
  }

  function crateAt(x, y) {
    if (!UNPLACED.length) return null;
    const top = (ROWS - 1) * TILE;
    if (y < top - 20 || y > top + TILE) return null;
    // front-most crate first: they overlap when there are a lot of them
    for (let i = UNPLACED.length - 1; i >= 0; i--) {
      const r = crateSlot(i);
      if (x >= r.x && x <= r.x + r.w) return { m: UNPLACED[i], c: Math.round((r.x + r.w / 2) / TILE), r: ROWS - 1 };
    }
    return null;
  }

  // Middle of a free tile, for dropping the player and Sam somewhere sensible.
  function freeSpawn(preferCol) {
    const g = blockedGrid(applianceRects(null));
    const col = Math.max(0, Math.min(COLS - 1, preferCol));
    let best = null;
    let bestD = Infinity;
    for (let r = FLOOR_TOP; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (g[r][c]) continue;
        const d = Math.abs(c - col) + Math.abs(r - 8) * 0.5;
        if (d < bestD) {
          bestD = d;
          best = { c: c, r: r };
        }
      }
    }
    if (!best) return { x: (W + (COUNTER_COL + 1) * TILE) / 2, y: 8 * TILE };
    return { x: (best.c + 0.5) * TILE, y: (best.r + 0.5) * TILE };
  }


  // ---------- state ----------
  let S = null;
  let best = best0 || 0;
  function reset() {
    buildLayout();
    const spawn = freeSpawn(Math.round(COLS / 2));
    S = {
      running: false,
      over: false,
      day: save.day,
      time: 0,
      timeLeft: SHIFT_LENGTH,
      coins: 0,
      served: 0,
      strikes: 0,
      spawnTimer: 1.5,
      nextId: 1,
      customers: [],
      counter: [],
      floats: [],
      player: { x: spawn.x, y: spawn.y, r: 14, fx: 0, fy: 1, tray: [], walk: 0 },
      helper: null
    };
    if (lvl("helper") >= 1) {
      const sp = freeSpawn(Math.round(spawn.x / TILE) + 3);
      S.helper = { x: sp.x, y: sp.y, r: 14, fx: 0, fy: 1, carry: null, walk: 0, task: null, wait: 0.8, speed: (lvl("helper") >= 2 ? 190 : 125) * roomSpan() };
    }
  }

  // ---------- helpers ----------
  function say(text, ms) { on('say', { text, ms }); }

  function addFloat(x, y, text, color) {
    S.floats.push({ x: x, y: y, text: text, t: 0, color: color || "#ffe9b3" });
  }


  function distToRect(px, py, r) {
    const cx = Math.max(r.x, Math.min(px, r.x + r.w));
    const cy = Math.max(r.y, Math.min(py, r.y + r.h));
    return Math.hypot(px - cx, py - cy);
  }

  function circleHitsRect(px, py, pr, r) {
    return distToRect(px, py, r) < pr;
  }

  function activeCustomers() {
    return S.customers.filter((c) => !c.leaving);
  }

  // How hard the cafe is right now: climbs through each day and with every new day.
  function pressure() {
    return (S.day - 1) * 0.9 + S.time / 45;
  }

  function spawnInterval() {
    return Math.max(2.0, 7.5 - pressure() * 1.3);
  }

  // ---------- customers ----------
  function spawnCustomer() {
    const p = pressure();
    const maxItems = p < 0.7 ? 1 : p < 2.4 ? 2 : 3;
    const count = 1 + Math.floor(R() * maxItems);
    const order = [];
    let work = 0;
    for (let i = 0; i < count; i++) {
      const item = POOL[Math.floor(R() * POOL.length)];
      order.push({ item: item, done: false });
      work += steps(item); // a latte is two trips, so it buys more waiting time
    }
    const base = Math.max(15, 42 - p * 4.5);
    const patience = (base + work * 7) * patienceMult();
    const inQueue = new Set(S.customers.map((cu) => cu.art));
    const fresh = CUSTOMER_ART.filter((a) => !inQueue.has(a));
    const pick = fresh.length ? fresh : CUSTOMER_ART;
    S.customers.push({
      id: S.nextId++,
      art: pick[Math.floor(R() * pick.length)],
      order: order,
      patience: patience,
      maxPatience: patience,
      face: FACES[Math.floor(R() * FACES.length)],
      shirt: SHIRTS[Math.floor(R() * SHIRTS.length)],
      hair: HAIRS[Math.floor(R() * HAIRS.length)],
      style: Math.floor(R() * 4),
      x: DOOR.x,
      y: DOOR.y,
      fx: 0,
      walk: 0,
      age: 0,
      leaving: false,
      leaveT: 0,
      happy: true,
      bob: R() * Math.PI * 2
    });
    matchCounter();
  }

  // Where the i-th customer in the queue stands: down the customers' side of
  // the counter, first in line nearest the door, drifting left with the wall.
  function queueSpot(i) {
    const top = FLOOR_TOP * TILE + 44;
    const span = H - top - 14;
    const y = top + (i + 0.5) * (span / maxCustomers());
    return { x: 190 - (y - top) * 0.12, y: y };
  }

  // Who wants this item. Given a y (the player's, serving at the counter), the
  // one of them standing closest to it rather than the first in the queue.
  function wantsItem(item, nearY) {
    const want = activeCustomers().filter((cu) => cu.order.some((o) => o.item === item && !o.done));
    if (nearY == null || want.length < 2) return want[0];
    return want.reduce((a, b) => (Math.abs(b.y - nearY) < Math.abs(a.y - nearY) ? b : a));
  }

  // How many machines an item passes through: 1 for a cookie, 2 for a latte.
  function steps(item) {
    const f = ITEMS[item].from;
    return f ? 1 + steps(f) : 1;
  }

  function fulfil(c, entry) {
    entry.done = true;
    addFloat(c.x + 44, c.y - 100, "✓", "#9be79b");
    if (c.order.every((o) => o.done)) {
      const total = c.order.reduce((sum, o) => sum + ITEMS[o.item].price, 0);
      const tip = Math.round((c.patience / c.maxPatience) * maxTip());
      S.coins += total + tip;
      S.served++;
      c.leaving = true;
      c.happy = true;
      addFloat(c.x + 30, c.y - 134, "+" + (total + tip) + (tip > 0 ? " (tip " + tip + ")" : ""), "#ffd166");
      if (S.coins > best) {
        best = S.coins;
        on('save');
      }
    }
  }

  // Hand anything sitting on the counter to a customer who wants it.
  function matchCounter() {
    for (let i = S.counter.length - 1; i >= 0; i--) {
      const slot = S.counter[i];
      const c = wantsItem(slot.item);
      if (c) {
        S.counter.splice(i, 1);
        fulfil(c, c.order.find((o) => o.item === slot.item && !o.done));
      }
    }
  }

  function walkOut(c) {
    c.leaving = true;
    c.happy = false;
    S.strikes++;
    addFloat(c.x + 30, c.y - 134, "Walked out!", "#ff8a7a");
    say("A customer gave up waiting.");
    if (S.strikes >= MAX_STRIKES) endShift(false);
  }

  // Put one item on the counter (or straight into a waiting customer's hands).
  // Returns true if the item left the carrier's hands.
  function serveItem(item, nearY) {
    const c = wantsItem(item, nearY);
    if (c) {
      fulfil(c, c.order.find((o) => o.item === item && !o.done));
      return true;
    }
    const slot = freeSlot();
    if (slot < 0) return false;
    S.counter.push({ item: item, slot: slot });
    return true;
  }

  // ---------- interaction ----------
  function nearestTarget() {
    const p = S.player;
    let found = null;
    let bestD = Infinity;
    for (const a of APPLIANCES) {
      const d = distToRect(p.x, p.y, a);
      if (d <= p.r + REACH && d < bestD) {
        bestD = d;
        found = a;
      }
    }
    return found;
  }

  function freeSlot() {
    const used = new Set(S.counter.map((s) => s.slot));
    for (let i = 0; i < counterSlots(); i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  // The plates run down the wooden top only, stopping short of its lip: the
  // counter's green front takes up the bottom of the room.
  function slotY(i) {
    const lip = H + 4 - (CTR.rows - CTR.lip) * CTR_SCALE;
    const end = lip + LIFT - 18;
    return COUNTER.y + (i + 0.5) * ((end - COUNTER.y) / counterSlots());
  }

  // Which tray item goes down first: something a customer wants, else the oldest.
  function trayItemToPlace() {
    const tray = S.player.tray;
    if (!tray.length) return null;
    return tray.find((it) => wantsItem(it)) || tray[0];
  }

  function fullWord() {
    return carryCap() > 1 ? "Tray full" : "Hands full";
  }

  function promptFor(a) {
    const tray = S.player.tray;
    const full = tray.length >= carryCap();
    if (a.kind === "maker") {
      const it = ITEMS[a.makes];
      if (a.state === "ready") return full ? fullWord() : "Take " + it.name;
      if (a.state === "working") return it.ing + "...";
      if (it.from) {
        const need = ITEMS[it.from];
        return tray.indexOf(it.from) >= 0 ? "Add the " + need.name : "Needs " + need.emoji + " " + need.name;
      }
      return full ? fullWord() : it.verb + " " + it.name;
    }
    if (a.kind === "counter") {
      if (tray.length) return "Place " + ITEMS[trayItemToPlace()].name;
      return S.counter.length ? "Pick up from counter" : "Counter";
    }
    if (a.kind === "bin") return tray.length ? "Bin the " + ITEMS[tray[tray.length - 1]].name : "Bin";
    return "";
  }

  function interact() {
    if (!S.running) return;
    const a = nearestTarget();
    const p = S.player;
    if (!a) return;
    const full = p.tray.length >= carryCap();

    if (a.kind === "maker") {
      const it = ITEMS[a.makes];
      if (a.state === "working") {
        say("Still going. Give it a moment.", 1200);
        return;
      }
      if (a.state === "ready") {
        if (full) {
          say(carryCap() > 1 ? "Your tray is full." : "Your hands are full.");
          return;
        }
        p.tray.push(a.makes);
        a.state = "idle";
        a.t = 0;
        return;
      }
      // idle. A two-step machine wants its ingredient handing over first.
      if (it.from) {
        const i = p.tray.indexOf(it.from);
        if (i < 0) {
          say("The " + a.label.toLowerCase() + " needs " + ITEMS[it.from].emoji + " " + ITEMS[it.from].name + " bringing over.", 1800);
          return;
        }
        p.tray.splice(i, 1);
        a.state = "working";
        a.t = 0;
        say(it.ing + " the " + it.name + "...", 1200);
        return;
      }
      if (full) {
        say(carryCap() > 1 ? "Your tray is full. Put something down first." : "Your hands are full. Put that down first.");
        return;
      }
      a.state = "working";
      a.t = 0;
      say(it.ing + " " + it.name + "...", 1200);
      return;
    }

    if (a.kind === "counter") {
      if (p.tray.length) {
        const item = trayItemToPlace();
        const wanted = !!wantsItem(item);
        if (!serveItem(item, p.y)) {
          say("The counter is full.");
          return;
        }
        p.tray.splice(p.tray.indexOf(item), 1);
        if (!wanted) say("Nobody wants " + ITEMS[item].name + " yet. It waits on the counter.", 1600);
      } else {
        if (!S.counter.length) {
          say("Nothing on the counter to pick up.", 1200);
          return;
        }
        let nearest = null;
        let nd = Infinity;
        for (const s of S.counter) {
          const d = Math.abs(slotY(s.slot) - p.y);
          if (d < nd) {
            nd = d;
            nearest = s;
          }
        }
        p.tray.push(nearest.item);
        S.counter.splice(S.counter.indexOf(nearest), 1);
      }
      return;
    }

    if (a.kind === "bin" && p.tray.length) {
      const item = p.tray.pop();
      say("Binned the " + ITEMS[item].name + ".", 1200);
    }
  }

  // ---------- the helper ----------
  // Sam is deliberately simple: one item at a time, straight-line walking
  // between the standing points in front of appliances and the counter. Sam
  // does understand the two-step drinks: pull a shot, walk it to the milk bar.
  function itemDemand(item) {
    let n = 0;
    for (const c of activeCustomers()) for (const o of c.order) if (o.item === item && !o.done) n++;
    return n;
  }

  function itemSupply(item) {
    let n = S.counter.filter((s) => s.item === item).length;
    for (const a of APPLIANCES) if (a.kind === "maker" && a.makes === item && a.state !== "idle") n++;
    if (S.helper && S.helper.carry === item) n++;
    for (const it of S.player.tray) if (it === item) n++;
    return n;
  }

  // How many more of an item the cafe could do with, counting what it feeds into.
  function shortfall(item) {
    let want = itemDemand(item);
    for (const k in ITEMS) if (ITEMS[k].from === item) want += Math.max(0, shortfall(k));
    return want - itemSupply(item);
  }

  // Worth carrying: someone is asking for it, or a free machine would turn it
  // into something someone is asking for. An item sitting finished in a machine
  // counts towards supply, so shortfall alone would never fetch it.
  function worthFetching(item) {
    if (wantsItem(item)) return true;
    return APPLIANCES.some((a) => a.kind === "maker" && a.state === "idle" && ITEMS[a.makes].from === item && shortfall(a.makes) > 0);
  }

  function counterSlotWith(item) {
    return S.counter.find((s) => s.item === item) || null;
  }

  // The helper stands beside the counter, on the floor side, level with wherever it is.
  function besideCounter(y) {
    return { x: COUNTER.x + COUNTER.w + 22, y: Math.max(COUNTER.y + 24, Math.min(COUNTER.y + COUNTER.h - 24, y)) };
  }

  function deliverTask(h) {
    const at = besideCounter(h.y);
    return { type: "deliver", x: at.x, y: at.y };
  }

  function pickHelperTask(h) {
    const dist = (a) => {
      const sp = standingPoint(a);
      return Math.hypot(sp.x - h.x, sp.y - h.y);
    };
    const at = (a, type) => {
      const sp = standingPoint(a);
      return { type: type, app: a, x: sp.x, y: sp.y };
    };
    let bestA = null;
    let bestD = Infinity;

    if (h.carry) {
      // Nobody wants it as it is, but a machine could turn it into something wanted.
      if (!wantsItem(h.carry)) {
        for (const a of APPLIANCES) {
          if (a.kind !== "maker" || a.state !== "idle") continue;
          if (ITEMS[a.makes].from !== h.carry || shortfall(a.makes) <= 0) continue;
          const d = dist(a);
          if (d < bestD) {
            bestD = d;
            bestA = a;
          }
        }
        if (bestA) return at(bestA, "insert");
      }
      return deliverTask(h);
    }

    // Collect anything that is ready, if it is wanted or feeds something wanted.
    for (const a of APPLIANCES) {
      if (a.kind !== "maker" || a.state !== "ready") continue;
      if (!worthFetching(a.makes)) continue;
      const d = dist(a);
      if (d < bestD) {
        bestD = d;
        bestA = a;
      }
    }
    if (bestA) return at(bestA, "take");

    // Start a machine that makes something out of nothing.
    for (const a of APPLIANCES) {
      if (a.kind !== "maker" || a.state !== "idle" || ITEMS[a.makes].from) continue;
      if (shortfall(a.makes) <= 0) continue;
      const d = dist(a);
      if (d < bestD) {
        bestD = d;
        bestA = a;
      }
    }
    if (bestA) return at(bestA, "start");

    // An ingredient sitting on the counter that a free machine could be using.
    for (const s of S.counter) {
      if (wantsItem(s.item)) continue;
      const feeds = APPLIANCES.some((a) => a.kind === "maker" && a.state === "idle" && ITEMS[a.makes].from === s.item && shortfall(a.makes) > 0);
      if (!feeds) continue;
      const at = besideCounter(slotY(s.slot));
      return { type: "grab", item: s.item, x: at.x, y: at.y };
    }
    return null;
  }

  function helperTaskStale(h, t) {
    if (t.type === "take") return t.app.state !== "ready";
    if (t.type === "start") return t.app.state !== "idle";
    if (t.type === "insert") return t.app.state !== "idle" || h.carry !== ITEMS[t.app.makes].from;
    if (t.type === "grab") return h.carry || !counterSlotWith(t.item);
    return false;
  }

  function updateHelper(dt) {
    const h = S.helper;
    if (!h) return;
    if (h.wait > 0) {
      h.wait -= dt;
      h.walk = 0;
      return;
    }
    if (!h.task) h.task = pickHelperTask(h);
    if (!h.task) {
      h.walk = 0;
      return;
    }
    const t = h.task;
    // Re-check the job is still worth doing before walking further.
    if (helperTaskStale(h, t)) {
      h.task = null;
      return;
    }
    const dx = t.x - h.x;
    const dy = t.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const step = Math.min(d, h.speed * dt);
      h.x += (dx / d) * step;
      h.y += (dy / d) * step;
      h.fx = dx / d;
      h.fy = dy / d;
      h.walk += dt * 12;
      return;
    }
    h.walk = 0;
    if (t.type === "take") {
      h.carry = t.app.makes;
      t.app.state = "idle";
      t.app.t = 0;
      h.wait = 0.3;
    } else if (t.type === "start") {
      t.app.state = "working";
      t.app.t = 0;
      h.wait = 0.3;
    } else if (t.type === "insert") {
      t.app.state = "working";
      t.app.t = 0;
      h.carry = null;
      h.wait = 0.3;
    } else if (t.type === "grab") {
      const slot = counterSlotWith(t.item);
      if (slot) {
        S.counter.splice(S.counter.indexOf(slot), 1);
        h.carry = slot.item;
      }
      h.wait = 0.3;
    } else if (t.type === "deliver") {
      if (serveItem(h.carry)) {
        h.carry = null;
        h.wait = 0.3;
      } else {
        h.wait = 1; // counter full: hold on and try again shortly
      }
    }
    h.task = null;
  }

  // ---------- update ----------
  function moveAxis(p, dx, dy) {
    p.x += dx;
    p.y += dy;
    p.x = Math.max(p.r, Math.min(W - p.r, p.x));
    p.y = Math.max(p.r, Math.min(H - p.r, p.y));
    for (const r of SOLIDS) {
      if (!circleHitsRect(p.x, p.y, p.r, r)) continue;
      if (dx > 0) p.x = r.x - p.r;
      else if (dx < 0) p.x = r.x + r.w + p.r;
      else if (dy > 0) p.y = r.y - p.r;
      else if (dy < 0) p.y = r.y + r.h + p.r;
    }
  }

  function update(dt) {
    for (let i = S.floats.length - 1; i >= 0; i--) {
      S.floats[i].t += dt;
      if (S.floats[i].t > 1.4) S.floats.splice(i, 1);
    }
    if (!S.running) return;

    S.time += dt;
    S.timeLeft -= dt;
    if (S.timeLeft <= 0) {
      S.timeLeft = 0;
      endShift(true);
      return;
    }

    const p = S.player;
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      p.fx = dx;
      p.fy = dy;
      p.walk += dt * 12;
      const speed = playerSpeed();
      moveAxis(p, dx * speed * dt, 0);
      moveAxis(p, 0, dy * speed * dt);
    } else {
      p.walk = 0;
    }

    for (const a of APPLIANCES) {
      if (a.kind === "maker" && a.state === "working") {
        a.t += dt;
        if (a.t >= cookTime(a.makes)) {
          a.state = "ready";
          a.t = 0;
        }
      }
    }

    updateHelper(dt);

    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      // With nothing on the floor yet there is nothing to order; nobody comes.
      if (POOL.length && activeCustomers().length < maxCustomers()) spawnCustomer();
      S.spawnTimer = spawnInterval() * (0.8 + R() * 0.4);
    }

    const queue = activeCustomers();
    for (let i = S.customers.length - 1; i >= 0; i--) {
      const c = S.customers[i];
      c.bob += dt * 3;
      c.age += dt;
      // Walk to their place in the queue, or back out of the door.
      const t = c.leaving ? DOOR : queueSpot(queue.indexOf(c));
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, CUSTOMER_SPEED * dt);
        c.x += (dx / d) * step;
        c.y += (dy / d) * step;
        c.fx = dx / d;
        c.walk += dt * 12;
      } else {
        c.walk = 0;
      }
      if (c.leaving) {
        c.leaveT += dt;
        if (c.leaveT > LEAVE_TIME) S.customers.splice(i, 1);
        continue;
      }
      c.patience -= dt;
      if (c.patience <= 0) {
        walkOut(c);
        if (!S.running) return;
      }
    }
  }

  function endShift(closedOnTime) {
    if (!S.running) return;
    S.running = false;
    S.over = true;
    const bonus = closedOnTime ? 10 + 5 * S.day : 0;
    const earned = S.coins + bonus;
    save.bank += earned;
    const completedDay = S.day;
    if (closedOnTime) save.day = S.day + 1;
    if (S.coins > best) best = S.coins;
    on('save');
    on('shift-over', { closedOnTime, completedDay, bonus });
  }

  // Buying from the shop: the rules half. 'max', 'poor' or 'ok'.
  function buyUpgrade(u) {
    const l = lvl(u.id);
    if (l >= u.max) return 'max';
    if (save.bank < upgradeCost(u)) return 'poor';
    save.bank -= upgradeCost(u);
    save.upgrades[u.id] = l + 1;
    on('save');
    return 'ok';
  }
  // Upgrades for kit you do not own yet stay out of the shop until it arrives.
  function shopUpgrades() {
    return UPGRADES.filter((u) => !u.from || save.day >= u.from);
  }

  return {
    unlockedTypes, unlockedItems, unlockFor, machineList, machineSize, spotRect, rectsOverlap, spotFits, spotOk, makeAppliance, savedSpot, buildLayout, rebuildPool, standingPoint, blockedGrid, floodFill, startTile, layoutWorks, applianceRects, canStart, crateSlot, crateAt, freeSpawn, reset, say, addFloat, distToRect, circleHitsRect, activeCustomers, pressure, spawnInterval, spawnCustomer, queueSpot, wantsItem, steps, fulfil, matchCounter, walkOut, serveItem, nearestTarget, freeSlot, slotY, trayItemToPlace, fullWord, promptFor, interact, itemDemand, itemSupply, shortfall, worthFetching, counterSlotWith, besideCounter, deliverTask, pickHelperTask, helperTaskStale, updateHelper, moveAxis, update, endShift, buyUpgrade, shopUpgrades, lvl, upgradeCost, roomSpan, playerSpeed, carryCap, cookTime, patienceMult, maxTip, maxCustomers, counterSlots,
    // the page's rearranging puts machines back on the floor itself, so these can be set too
    get APPLIANCES() { return APPLIANCES; }, set APPLIANCES(v) { APPLIANCES = v; }, get COUNTER() { return COUNTER; }, set COUNTER(v) { COUNTER = v; }, get POOL() { return POOL; }, set POOL(v) { POOL = v; }, get S() { return S; }, set S(v) { S = v; }, get SOLIDS() { return SOLIDS; }, set SOLIDS(v) { SOLIDS = v; }, get UNPLACED() { return UNPLACED; }, set UNPLACED(v) { UNPLACED = v; }, get best() { return best; }, set best(v) { best = v; },
    seedDice(n) { R = mulberry32(n); },
  };
}
