(() => {
  "use strict";

  // ---------- constants ----------
  // The cafe is Amber's painted room (assets/room.jpg) at three-quarter size:
  // 21 x 12 tiles of 48px. The room keeps that shape and the window letterboxes
  // around it, so the door, the wall and the floor sit where the painting has
  // them. Rows 0-3 are the back wall; customers come in through the door and
  // queue down the left of the counter, which runs from the wall to the front.
  const TILE = 48;
  const ROOM_COLS = 21;
  const ROOM_ROWS = 12;
  const FLOOR_TOP = 4; // rows 0-3 are the back wall
  const COUNTER_COL = 6; // the service counter; the customers' side is left of it
  const DOOR = { x: 226, y: 206 }; // on the door mat, where customers come and go
  const MACHINE_RISE = 84; // how far a machine on its cabinet stands above its footprint
  let COLS = ROOM_COLS;
  let ROWS = ROOM_ROWS;
  let W = COLS * TILE;
  let H = ROWS * TILE;

  const BASE_CUSTOMERS = 4;
  const BASE_COUNTER_SLOTS = 8;
  const MAX_STRIKES = 3;
  const BASE_PLAYER_SPEED = 200;
  const CUSTOMER_SPEED = 170;
  const LEAVE_TIME = 1.1; // seconds a customer takes to fade out on the way to the door
  const REACH = 18;
  const SHIFT_LENGTH = 90; // seconds per day
  const POPUP_GRACE = 500; // ms of quiet before a popup accepts a confirm press
  const BEST_KEY = "cafe-rush-best";
  const SAVE_KEY = "cafe-rush-save";
  const SAVE_VERSION = 3; // v3: the front-on room; floor plans from before it are dropped

  // Items with a "from" are made in two steps: carry the ingredient to the
  // machine that finishes it. Everything else comes straight out of a machine.
  const ITEMS = {
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
  const MACHINES = {
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

  const BASE_MACHINES = ["espresso", "cookie", "brownie"];

  // New machines are delivered as the days go by.
  const UNLOCKS = [
    { day: 3, type: "milk", text: "A milk bar arrives: carry an espresso over to pour a 🥛 latte." },
    { day: 5, type: "muffin", text: "A muffin oven arrives: 🧁 muffins bake on their own." },
    { day: 7, type: "ice", text: "An ice well is plumbed in: take a latte there to shake a 🧋 iced latte." },
    { day: 10, type: "soup", text: "A soup kettle goes on the back wall: 🍲 soup ladles itself, slowly, and pays well." },
    { day: 12, type: "bread", text: "A bread oven arrives: 🥖 rolls, quick and cheap, and good for something else." },
    { day: 14, type: "press", text: "A sandwich press is bolted down: carry a roll over and press a 🥪 toastie. Ten coins." },
    { day: 17, type: "blend", text: "A blender lands on the counter: 🥤 smoothies, no heat, no queue." }
  ];

  // How often an item turns up in an order, once its machine is on the floor.
  const ITEM_WEIGHT = { espresso: 3, cookie: 2, brownie: 2, latte: 2, muffin: 2, iced: 1,
    soup: 2, roll: 2, toastie: 1, smoothie: 2 };

  // Customers are drawn from Amber's character sheet; the barista and Sam are
  // two of the same people in aprons, so they never turn up in the queue.
  const CUSTOMER_ART = ["p00", "p01", "p02", "p03", "p03b", "p05", "p06", "p07", "p08",
    "p09", "p10", "p11", "p12", "p13", "p14", "p14b", "p16"];

  const FACES = ["😊", "🙂", "😄", "🤓", "😎", "🥰", "😌", "🧐", "😃", "🙃", "😇", "🤠", "😏", "🥸", "😶", "🤗"];
  const SHIRTS = ["#5b8def", "#e06c9f", "#4fb286", "#f0a35e", "#9b7bd8", "#e2c04e",
    "#3f9fa8", "#c25f4f", "#7a8b3e", "#b98bd0", "#d8734f", "#4b6ea8"];
  const HAIRS = ["#3b2417", "#7a4a2a", "#e0b04f", "#b5412c", "#2c2c34", "#8c6a54", "#d98e73",
    "#57534a", "#a8a29b", "#5c3a5c", "#1f2a33", "#c9a227"];

  // Persistent upgrades. Cost for the next level = round5(base * mult ^ level).
  const UPGRADES = [
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

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const UI_FONT = '"Segoe UI", system-ui, sans-serif';

  // ---------- dom ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const hud = {
    coins: $("hud-coins"),
    served: $("hud-served"),
    time: $("hud-time"),
    timeBar: $("hud-timebar"),
    clock: $("hud-clock"),
    strikes: $("hud-strikes"),
    hearts: $("hud-hearts"),
    day: $("hud-day"),
    cal: $("hud-cal"),
    bank: $("hud-bank"),
    msg: $("hud-msg")
  };
  const overlay = $("overlay");
  const overlayTitle = $("overlay-title");
  const overlayBody = $("overlay-body");
  const btnStart = $("btn-start");
  const btnShop = $("btn-shop");
  const shop = $("shop");
  const shopBank = $("shop-bank");
  const shopNote = $("shop-note");
  const shopGrid = $("shop-grid");
  const btnNext = $("btn-next");
  const btnReset = $("btn-reset");
  const btnLayout = $("btn-layout");
  const btnShopLayout = $("btn-shop-layout");
  const layoutBar = $("layoutbar");
  const layoutMsg = $("layout-msg");
  const btnLayoutDone = $("btn-layout-done");
  const btnLayoutReset = $("btn-layout-reset");
  const pausePanel = $("pause");
  const btnPause = $("btn-pause");
  const btnResume = $("btn-resume");

  // ---------- fitting the room to the window ----------
  // Everything in the game is measured in 48px tiles. The canvas is drawn
  // through a single scale transform at device resolution, so the room can fill
  // a 4K screen without a soft edge anywhere.
  let view = { scale: 1, dpr: 1 };
  let want = { cols: COLS, rows: ROWS };

  // The painted room has one shape; the window letterboxes around it.
  function idealShape() {
    return { cols: ROOM_COLS, rows: ROOM_ROWS };
  }

  function fitCanvas() {
    const vw = Math.max(320, window.innerWidth);
    const vh = Math.max(320, window.innerHeight);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const scale = Math.min(vw / W, vh / H);
    view = { scale: scale, dpr: dpr };
    canvas.style.width = Math.round(W * scale) + "px";
    canvas.style.height = Math.round(H * scale) + "px";
    canvas.width = Math.max(1, Math.round(W * scale * dpr));
    canvas.height = Math.max(1, Math.round(H * scale * dpr));
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }

  // A resize during a shift only rescales: the floor never moves out from under
  // you mid-service. The new shape is taken up at the start of the next day.
  function applyShape(shape) {
    if (shape.cols === COLS && shape.rows === ROWS) return false;
    COLS = shape.cols;
    ROWS = shape.rows;
    W = COLS * TILE;
    H = ROWS * TILE;
    return true;
  }

  function relayout() {
    want = idealShape();
    if (!S || !S.running) {
      const changed = applyShape(want);
      if (changed && S) {
        buildLayout();
        settlePeople();
      }
    }
    fitCanvas();
  }

  // After the room changes shape, make sure nobody is standing in a machine.
  function settlePeople() {
    if (!S) return;
    for (const p of [S.player, S.helper]) {
      if (!p) continue;
      p.x = Math.max(p.r, Math.min(W - p.r, p.x));
      p.y = Math.max(p.r, Math.min(H - p.r, p.y));
      let stuck = false;
      for (const s of SOLIDS) if (circleHitsRect(p.x, p.y, p.r, s)) stuck = true;
      if (stuck) {
        const sp = freeSpawn(Math.round(p.x / TILE));
        p.x = sp.x;
        p.y = sp.y;
      }
    }
  }

  // ---------- persistent progress ----------
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    best = 0;
  }

  function freshSave() {
    const up = {};
    for (const u of UPGRADES) up[u.id] = 0;
    return { v: SAVE_VERSION, day: 1, bank: 0, upgrades: up, layout: {}, layoutCols: 0, layoutRows: 0 };
  }

  function loadSave() {
    const s = freshSave();
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (raw && typeof raw === "object") {
        s.day = Math.max(1, Math.floor(Number(raw.day) || 1));
        s.bank = Math.max(0, Math.floor(Number(raw.bank) || 0));
        for (const u of UPGRADES) {
          const l = Math.floor(Number(raw.upgrades && raw.upgrades[u.id]) || 0);
          s.upgrades[u.id] = Math.max(0, Math.min(u.max, l));
        }
        // v1 had a single "extra ovens" track; split it into the two oven lines.
        const oldOvens = Math.floor(Number(raw.upgrades && raw.upgrades.ovens) || 0);
        if (oldOvens > 0 && !(Number(raw.v) >= 2)) {
          s.upgrades.cookieOvens = Math.max(s.upgrades.cookieOvens, oldOvens >= 1 ? 1 : 0);
          s.upgrades.brownieOvens = Math.max(s.upgrades.brownieOvens, oldOvens >= 2 ? 1 : 0);
        }
        s.layoutCols = Math.max(0, Math.floor(Number(raw.layoutCols) || 0));
        s.layoutRows = Math.max(0, Math.floor(Number(raw.layoutRows) || 0));
        // A floor plan from the old top-down room means nothing in this one:
        // the machines go back in their crates, and day, bank and kit carry on.
        if (raw.layout && typeof raw.layout === "object" && Number(raw.v) >= SAVE_VERSION) {
          for (const id in raw.layout) {
            const v = raw.layout[id];
            if (Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1])) {
              s.layout[id] = [Math.floor(v[0]), Math.floor(v[1])];
            }
          }
        }
      }
    } catch (e) {
      /* corrupt or unavailable storage: start fresh */
    }
    return s;
  }

  let save = loadSave();

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      localStorage.setItem(BEST_KEY, String(best));
    } catch (e) {
      /* storage unavailable */
    }
  }

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
  let msgTimer = 0;

  function reset() {
    if (applyShape(want)) fitCanvas(); // take up a resize that happened mid-shift
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
    refreshHud();
  }

  // ---------- helpers ----------
  function say(text, ms) {
    hud.msg.textContent = text;
    hud.msg.classList.add("on");
    msgTimer = (ms || 1800) / 1000;
  }

  function addFloat(x, y, text, color) {
    S.floats.push({ x: x, y: y, text: text, t: 0, color: color || "#ffe9b3" });
  }

  function clock(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }

  // Numbers on the HUD give a little kick when they change, so a coin or a
  // served customer registers out of the corner of your eye.
  function setStat(el, value) {
    if (!el) return;
    const text = String(value);
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove("bump");
    void el.offsetWidth; // restart the animation
    el.classList.add("bump");
  }

  function refreshHud() {
    setStat(hud.coins, S.coins);
    setStat(hud.served, S.served);
    hud.time.textContent = clock(Math.max(0, Math.ceil(S.timeLeft)));
    if (hud.timeBar) hud.timeBar.style.width = Math.max(0, Math.min(100, (S.timeLeft / SHIFT_LENGTH) * 100)) + "%";
    if (hud.clock) hud.clock.classList.toggle("low", S.running && S.timeLeft <= 15);
    const hearts = MAX_STRIKES - S.strikes + "/" + MAX_STRIKES;
    if (hud.strikes.textContent !== hearts) {
      hud.strikes.textContent = hearts;
      if (hud.hearts) {
        hud.hearts.classList.remove("hurt");
        void hud.hearts.offsetWidth;
        if (S.strikes > 0) hud.hearts.classList.add("hurt");
      }
    }
    hud.day.textContent = S.day;
    if (hud.cal) hud.cal.textContent = S.day;
    setStat(hud.bank, save.bank);
    if (btnPause) btnPause.hidden = !S.running || paused;
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
    const count = 1 + Math.floor(Math.random() * maxItems);
    const order = [];
    let work = 0;
    for (let i = 0; i < count; i++) {
      const item = POOL[Math.floor(Math.random() * POOL.length)];
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
      art: pick[Math.floor(Math.random() * pick.length)],
      order: order,
      patience: patience,
      maxPatience: patience,
      face: FACES[Math.floor(Math.random() * FACES.length)],
      shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
      style: Math.floor(Math.random() * 4),
      x: DOOR.x,
      y: DOOR.y,
      fx: 0,
      walk: 0,
      age: 0,
      leaving: false,
      leaveT: 0,
      happy: true,
      bob: Math.random() * Math.PI * 2
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

  function wantsItem(item) {
    return activeCustomers().find((cu) => cu.order.some((o) => o.item === item && !o.done));
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
        persist();
      }
      refreshHud();
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
    refreshHud();
    if (S.strikes >= MAX_STRIKES) endShift(false);
  }

  // Put one item on the counter (or straight into a waiting customer's hands).
  // Returns true if the item left the carrier's hands.
  function serveItem(item) {
    const c = wantsItem(item);
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

  function slotY(i) {
    return COUNTER.y + (i + 0.5) * (COUNTER.h / counterSlots());
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
        if (!serveItem(item)) {
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
    if (paused) return;
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) hud.msg.classList.remove("on");
    }
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
      S.spawnTimer = spawnInterval() * (0.8 + Math.random() * 0.4);
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

    refreshHud();
  }

  // ---------- drawing ----------
  // The room is Amber's painted plate (assets/room.jpg) and everything standing
  // in it is cut from her sheets into assets/art/ by
  // notes/cafe-rush-assets/cut.py. The view is front-on: a machine stands on a
  // green cabinet whose feet are on its footprint, people stand with their feet
  // at their position, and depth is just y, drawn back to front. Everything
  // here is purely visual: the rects in APPLIANCES/SOLIDS and every position
  // are the game's own.
  const ART = "assets/art/";
  const INK = "#3a261e";
  const P = {
    wood: "#c98452",
    woodDark: "#8e5433",
    woodLight: "#e2a877",
    cream: "#fff8ea",
    sage: "#879d7d",
    sageDark: "#5f7458",
    chalk: "#2c3833",
    chrome: "#e1e5e8",
    chromeMid: "#b3bbc2",
    chromeDark: "#7a848d",
    crate: "#c99a62",
    crateTop: "#ddb47e",
    crateDark: "#9c7243"
  };
  const FONT = '"Baloo 2", "Segoe UI", system-ui, sans-serif';
  const PERSON_H = 128; // a grown-up, head to toe
  const HEIGHTS = { p05: 0.8, p10: 0.78 }; // the two children on the sheet
  const CAB_H = 86; // a cabinet, worktop to feet
  const CAB_TOP = 17; // where an appliance's feet land, down from the cabinet's top edge
  const LIFT = 38; // how high the service counter's top sits above its footprint

  // How each machine looks in each state. Ovens swap between pictures of
  // different sizes (the finished one has its door hanging open), so they are
  // pinned by the idle picture's top-right corner rather than centred.
  const LOOKS = {
    espresso: { idle: "espresso-idle", working: ["espresso-brew", "espresso-pour"], ready: "espresso-ready", w: 60, dx: -13 },
    cookie: { idle: "oven-idle", working: "oven-baking", ready: "oven-ready", w: 84, oven: true },
    brownie: { idle: "oven-idle", working: "brownie-baking", ready: "brownie-ready", w: 84, oven: true },
    muffin: { idle: "muffin-idle", working: "muffin-baking", ready: "muffin-ready", w: 84, oven: true },
    bread: { idle: "muffin-idle", working: "muffin-baking", ready: "muffin-ready", w: 84, oven: true },
    milk: { idle: "jug-milk", working: "jug-coffee", ready: "jug-milk", w: 26, dx: -7 },
    blend: { idle: "blender-idle", working: "blender-working", ready: "blender-ready", w: 30 }
  };

  const IMAGES = {};
  let bg = null;
  let bgKey = "";

  function art(name) {
    let im = IMAGES[name];
    if (!im) {
      im = new Image();
      im.onload = () => {
        bgKey = ""; // the menu board shows item art: repaint it once that arrives
      };
      im.src = ART + name + ".png";
      IMAGES[name] = im;
    }
    return im;
  }

  const loaded = (im) => !!im && im.complete && im.naturalWidth > 0;

  const ROOM = new Image();
  ROOM.onload = () => {
    bgKey = "";
  };
  ROOM.src = "assets/room.jpg";
  // The chalkboard is lettered in Baloo 2; letter it again once that has loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 13px "Baloo 2"').then(() => {
      bgKey = "";
    }, () => {});
  }

  // Ask for everything up front so nothing pops in halfway through a shift.
  (function preload() {
    const names = ["cabinets/double", "cabinets/single", "people/barista", "people/sam", "decor/cup-stack", "machines/jug-big"];
    for (const k in ITEMS) names.push("items/" + k);
    for (const k in LOOKS) {
      const l = LOOKS[k];
      for (const s of [l.idle, l.ready].concat(l.working)) names.push("machines/" + s);
    }
    for (const c of CUSTOMER_ART) names.push("people/" + c);
    for (const n of names) art(n);
  })();

  function roundRect(x, y, w, h, r, g) {
    g = g || ctx;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function emoji(text, x, y, size, g) {
    g = g || ctx;
    g.font = size + "px " + EMOJI_FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#000";
    g.fillText(text, x, y);
  }

  function ellipse(g, x, y, rx, ry, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Fill and ink a path in one go, the way everything on the sheets is drawn.
  function inked(fill, width, g) {
    g = g || ctx;
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = width || 1.6;
    g.lineJoin = "round";
    g.stroke();
  }

  // Draw a picture scaled to width w, its bottom edge centred on (x, y).
  function drawArt(im, x, y, w, flip, g) {
    g = g || ctx;
    if (!loaded(im)) return null;
    const s = w / im.naturalWidth;
    const dw = w;
    const dh = im.naturalHeight * s;
    if (flip) {
      g.save();
      g.translate(x, 0);
      g.scale(-1, 1);
      g.drawImage(im, -dw / 2, y - dh, dw, dh);
      g.restore();
    } else {
      g.drawImage(im, x - dw / 2, y - dh, dw, dh);
    }
    return { x: x - dw / 2, y: y - dh, w: dw, h: dh };
  }

  // An item, fitted into a size x size box centred on (cx, cy). Until its art
  // has loaded it shows as its emoji, so nothing is ever blank.
  function drawItem(item, cx, cy, size, g) {
    g = g || ctx;
    const im = art("items/" + item);
    if (!loaded(im)) {
      emoji(ITEMS[item].emoji, cx, cy, size * 0.78, g);
      return;
    }
    const s = size / Math.max(im.naturalWidth, im.naturalHeight);
    const dw = im.naturalWidth * s;
    const dh = im.naturalHeight * s;
    g.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
  }

  // Rising wisps of steam. Cheap enough to draw every frame.
  function drawSteam(x, y, count, scale) {
    const now = performance.now();
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * (scale || 1);
    for (let k = 0; k < count; k++) {
      const ph = (now / 1100 + k * 0.41) % 1;
      const ox = (k - (count - 1) / 2) * 6 * (scale || 1);
      const h = 18 * (scale || 1);
      ctx.globalAlpha = 0.6 * (1 - ph) * Math.min(1, ph * 4);
      ctx.beginPath();
      ctx.moveTo(x + ox, y - ph * h);
      ctx.bezierCurveTo(x + ox + 4, y - ph * h - 5, x + ox - 4, y - ph * h - 9, x + ox + Math.sin(ph * 6 + k) * 2, y - ph * h - 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- the room ----------
  // The painted chalkboard has scribble on it: chalk the day's real menu over it.
  const BOARD = { x: 466, y: 70, w: 172, h: 60 };

  function paintMenuBoard(g) {
    g.fillStyle = P.chalk;
    roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 3, g);
    g.fill();
    // old chalk rubbed about
    g.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 9; i++) {
      const x = BOARD.x + 10 + ((i * 53) % (BOARD.w - 30));
      const y = BOARD.y + 8 + ((i * 29) % (BOARD.h - 16));
      g.beginPath();
      g.ellipse(x, y, 16, 5, (i % 3) * 0.3 - 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.font = "700 13px " + FONT;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(246,242,230,0.92)";
    g.fillText("Menu", BOARD.x + BOARD.w / 2, BOARD.y + 15);
    g.strokeStyle = "rgba(246,242,230,0.5)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(BOARD.x + BOARD.w / 2 - 22, BOARD.y + 18.5);
    g.lineTo(BOARD.x + BOARD.w / 2 + 22, BOARD.y + 18.5);
    g.stroke();
    const items = unlockedItems();
    const perRow = items.length > 6 ? Math.ceil(items.length / 2) : items.length;
    const rows = Math.ceil(items.length / perRow);
    const cell = Math.min(26, (BOARD.w - 12) / perRow, (BOARD.h - 24) / rows);
    items.forEach((it, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, items.length - row * perRow);
      const x = BOARD.x + BOARD.w / 2 + (i % perRow - (inRow - 1) / 2) * cell;
      const y = BOARD.y + 22 + cell / 2 + row * cell;
      drawItem(it, x, y, cell - 3, g);
    });
  }

  function paintBackground(g) {
    g.fillStyle = "#d99a74";
    g.fillRect(0, 0, W, H);
    if (loaded(ROOM)) g.drawImage(ROOM, 0, 0, W, H);
    paintMenuBoard(g);
  }

  // The room behind everything is painted once, at whatever resolution the
  // window is actually showing, and reused until something on it changes.
  function ensureBackground() {
    const sc = Math.max(0.5, view.scale * view.dpr);
    const key = COLS + "x" + ROWS + "|" + sc.toFixed(2) + "|" + unlockedItems().join(",") + "|" + loaded(ROOM);
    if (bg && bgKey === key) return;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = Math.max(1, Math.round(W * sc));
    bg.height = Math.max(1, Math.round(H * sc));
    const g = bg.getContext("2d");
    g.setTransform(bg.width / W, 0, 0, bg.height / H, 0, 0);
    paintBackground(g);
  }

  // ---------- the service counter ----------
  // It runs from the back wall off the front of the room. Front-on that is its
  // long wooden top, plus the panelled side the customers stand against.
  function drawCounter(a, highlighted) {
    const x0 = a.x - 9;
    const x1 = a.x + a.w + 9;
    const y0 = a.y - LIFT;
    const y1 = H + 4;
    const side = 16;
    const lip = 6; // the thickness of the worktop, seen along its edge
    // a shadow on the floor, on the floor side
    ctx.fillStyle = "rgba(70,35,20,0.16)";
    ctx.fillRect(x1, a.y + 4, 12, H - a.y);
    // the customers' side
    ctx.beginPath();
    ctx.moveTo(x0 - side, y0 + 10);
    ctx.lineTo(x0, y0 + 2);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x0 - side, y1);
    ctx.closePath();
    inked(P.sage, 1.8);
    ctx.strokeStyle = "rgba(58,38,30,0.45)";
    ctx.lineWidth = 1.2;
    for (let y = y0 + 34; y < y1 - 10; y += 70) {
      roundRect(x0 - side + 3, y, side - 6, 54, 2);
      ctx.stroke();
    }
    // the worktop's edge, then its top
    roundRect(x0 - 3, y0 + 2, lip + 4, y1 - y0, 3);
    inked(P.woodDark, 1.6);
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, P.woodLight);
    grad.addColorStop(0.75, P.wood);
    grad.addColorStop(1, P.woodDark);
    roundRect(x0, y0, x1 - x0, y1 - y0, 5);
    inked(grad, 2);
    ctx.strokeStyle = "rgba(120,66,36,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const gx = x0 + 9 + i * 12;
      ctx.beginPath();
      ctx.moveTo(gx, y0 + 6);
      ctx.bezierCurveTo(gx + 4, y0 + 120, gx - 4, y0 + 240, gx + 2, y1);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,236,206,0.35)";
    ctx.fillRect(x0 + 3, y0 + 3, 3, y1 - y0 - 6);
    // a plate for every place on the counter
    const cx = a.x + a.w / 2;
    for (let i = 0; i < counterSlots(); i++) {
      const sy = slotY(i) - LIFT + 10;
      ellipse(ctx, cx + 1, sy + 3, 17, 7, "rgba(70,35,20,0.25)");
      ctx.beginPath();
      ctx.ellipse(cx, sy, 17, 7.5, 0, 0, Math.PI * 2);
      inked(P.cream, 1.2);
      ellipse(ctx, cx, sy, 11, 4.5, "rgba(120,80,50,0.08)");
    }
    for (const s of S.counter) {
      const sy = slotY(s.slot) - LIFT + 10;
      drawItem(s.item, cx, sy - 10, 30);
      if (ITEMS[s.item].hot) drawSteam(cx, sy - 22, 2, 0.7);
    }
    if (highlighted) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      roundRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 8);
      ctx.stroke();
    }
  }

  // ---------- machines ----------
  function cabinetBox(a) {
    const bottom = a.y + a.h + 2;
    const w = a.w > TILE ? a.w + 2 : TILE + 4;
    return { x: a.x + a.w / 2 - w / 2, y: bottom - CAB_H, w: w, h: CAB_H, cx: a.x + a.w / 2, top: bottom - CAB_H + CAB_TOP, bottom: bottom };
  }

  function drawCabinet(a, b) {
    ellipse(ctx, b.cx, b.bottom, b.w / 2 + 2, 6, "rgba(70,35,20,0.28)");
    const im = art(a.w > TILE ? "cabinets/double" : "cabinets/single");
    if (loaded(im)) {
      ctx.drawImage(im, b.x, b.y, b.w, b.h);
    } else {
      roundRect(b.x, b.y + 12, b.w, b.h - 12, 4);
      inked(P.sage, 1.6);
      roundRect(b.x - 2, b.y, b.w + 4, 16, 3);
      inked(P.wood, 1.6);
    }
  }

  // The little wooden plaque on each cabinet front, like the ones in the mockup.
  function drawPlaque(a, b) {
    const text = (MACHINES[a.type] ? MACHINES[a.type].plaque : a.label).toUpperCase();
    let size = 8.5;
    ctx.font = "800 " + size + "px " + FONT;
    let tw = ctx.measureText(text).width;
    const room = b.w - 12;
    if (tw + 10 > room) {
      size = Math.max(6, (size * (room - 10)) / tw);
      ctx.font = "800 " + size + "px " + FONT;
      tw = ctx.measureText(text).width;
    }
    const pw = Math.min(room, tw + 10);
    const py = b.y + 30;
    roundRect(b.cx - pw / 2, py, pw, 12, 3);
    inked("#c0814f", 1.2);
    ctx.fillStyle = P.cream;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, b.cx, py + 6.5);
  }

  function lookFor(a) {
    const look = LOOKS[a.type];
    let name = look[a.state] || look.idle;
    if (Array.isArray(name)) name = name[Math.floor(performance.now() / 380) % name.length];
    return { look: look, im: art("machines/" + name), idle: art("machines/" + look.idle) };
  }

  // A machine picture on its cabinet. Returns the top of what it drew, where
  // progress and a finished item float.
  function drawMachineArt(a, b) {
    const m = lookFor(a);
    if (!loaded(m.im)) return b.top - 30;
    const shake = a.state === "working" && a.type === "blend" ? Math.sin(performance.now() / 30) * 1.3 : 0;
    const x = b.cx + (m.look.dx || 0) + shake;
    if (m.look.oven && loaded(m.idle)) {
      // pin every state by the idle picture's top-right corner
      const s = m.look.w / m.idle.naturalWidth;
      const right = x + m.look.w / 2;
      const top = b.top - m.idle.naturalHeight * s;
      ctx.drawImage(m.im, right - m.im.naturalWidth * s, top, m.im.naturalWidth * s, m.im.naturalHeight * s);
      return top;
    }
    const ref = loaded(m.idle) ? m.idle : m.im;
    const s = m.look.w / ref.naturalWidth;
    const r = drawArt(m.im, x, b.top, m.im.naturalWidth * s);
    return r ? r.y : b.top - 30;
  }

  // The three machines Amber's sheets do not have are drawn in their style:
  // flat colour, a soft highlight, and an ink line round everything.
  function drawIceWell(a, b) {
    const shake = a.state === "working" ? Math.sin(performance.now() / 35) * 1.2 : 0;
    const cx = b.cx + shake;
    const base = b.top + 2;
    const w = 34;
    const h = 24;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base - h);
    ctx.lineTo(cx + w / 2, base - h);
    ctx.lineTo(cx + w / 2 - 3, base);
    ctx.lineTo(cx - w / 2 + 3, base);
    ctx.closePath();
    inked(P.chromeMid, 1.6);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(cx - w / 2 + 5, base - h + 6, 4, h - 10);
    ctx.beginPath();
    ctx.ellipse(cx, base - h, w / 2, 6, 0, 0, Math.PI * 2);
    inked(P.chrome, 1.6);
    const cubes = [[-9, -1], [-1, -3], [7, -1], [-5, 2], [4, 2], [0, -6]];
    for (const [dx, dy] of cubes) {
      roundRect(cx + dx - 4, base - h + dy - 3, 8, 6, 1.5);
      inked("#dff3fb", 0.9);
    }
    return base - h - 10;
  }

  function drawSoupKettle(a, b) {
    const cx = b.cx;
    const base = b.top + 2;
    const w = 36;
    const h = 26;
    // handles
    for (const s of [-1, 1]) {
      roundRect(cx + s * (w / 2 + 2) - 4, base - h + 6, 8, 5, 2);
      inked(P.chromeDark, 1.2);
    }
    roundRect(cx - w / 2, base - h, w, h, 7);
    inked("#c8603e", 1.6);
    ctx.fillStyle = "rgba(255,210,180,0.35)";
    ctx.fillRect(cx - w / 2 + 5, base - h + 6, 4, h - 12);
    // lid and knob; the lid rattles while it cooks
    const rattle = a.state === "working" ? Math.abs(Math.sin(performance.now() / 90)) * 2 : 0;
    ctx.beginPath();
    ctx.ellipse(cx, base - h - rattle, w / 2 + 1, 6, 0, 0, Math.PI * 2);
    inked("#a34a31", 1.6);
    ctx.beginPath();
    ctx.ellipse(cx, base - h - 6 - rattle, 5, 3.5, 0, 0, Math.PI * 2);
    inked(P.chromeDark, 1.2);
    if (a.state !== "idle") drawSteam(cx, base - h - 10, 3, 0.8);
    return base - h - 14;
  }

  function drawPress(a, b) {
    const cx = b.cx;
    const base = b.top + 2;
    const w = 70;
    // base plate
    roundRect(cx - w / 2, base - 16, w, 16, 5);
    inked(P.chromeMid, 1.6);
    ctx.fillStyle = a.state === "working" ? "#e0584a" : a.state === "ready" ? "#6de07a" : "#5a6a40";
    ctx.beginPath();
    ctx.arc(cx + w / 2 - 9, base - 8, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // the lid: shut and glowing while it presses, propped open otherwise
    const shut = a.state === "working";
    ctx.save();
    ctx.translate(cx - w / 2 + 4, base - 16);
    ctx.rotate(shut ? 0 : -0.42);
    roundRect(0, -12, w - 8, 12, 5);
    inked(P.chrome, 1.6);
    ctx.fillStyle = "rgba(60,60,60,0.25)";
    for (let i = 0; i < 5; i++) ctx.fillRect(8 + i * 11, -9, 6, 2);
    roundRect(w - 14, -18, 14, 7, 3);
    inked("#3b2e2a", 1.2);
    ctx.restore();
    if (shut) {
      ctx.fillStyle = "rgba(255,140,60,0.35)";
      ctx.fillRect(cx - w / 2 + 6, base - 17, w - 12, 3);
      drawSteam(cx, base - 30, 2, 0.8);
    }
    return base - (shut ? 30 : 48);
  }

  function drawBin(a, highlighted) {
    const cx = a.x + a.w / 2;
    const base = a.y + a.h - 4;
    const w = 30;
    const h = 38;
    ellipse(ctx, cx, base, 18, 5, "rgba(70,35,20,0.28)");
    if (highlighted) {
      ctx.save();
      ctx.shadowColor = "rgba(255,209,102,0.95)";
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base - h);
    ctx.lineTo(cx + w / 2, base - h);
    ctx.lineTo(cx + w / 2 - 4, base);
    ctx.lineTo(cx - w / 2 + 4, base);
    ctx.closePath();
    inked("#9ba4ab", 1.8);
    if (highlighted) ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(cx - w / 2 + 5, base - h + 5, 4, h - 10);
    roundRect(cx - w / 2 - 2, base - h - 5, w + 4, 7, 3);
    inked("#838c93", 1.6);
    ctx.font = "700 15px " + FONT;
    ctx.fillStyle = "#6d767d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♻", cx, base - h / 2 + 1);
    a.top = base - h - 8;
  }

  function drawMachine(a, highlighted) {
    if (a.kind === "bin") return drawBin(a, highlighted);
    const b = cabinetBox(a);
    if (highlighted) {
      ctx.save();
      ctx.shadowColor = "rgba(255,209,102,0.95)";
      ctx.shadowBlur = 16;
    }
    drawCabinet(a, b);
    let top;
    if (a.type === "ice") top = drawIceWell(a, b);
    else if (a.type === "soup") top = drawSoupKettle(a, b);
    else if (a.type === "press") top = drawPress(a, b);
    else top = drawMachineArt(a, b);
    if (highlighted) ctx.restore();
    // a little set dressing on the espresso cabinet, like the mockup's cup stacks
    if (a.type === "espresso") drawArt(art("decor/cup-stack"), b.cx + 32, b.top - 1, 14);
    if (a.type === "milk" && a.state !== "working") drawArt(art("machines/jug-big"), b.cx + 9, b.top, 20);
    if (a.type === "milk" && a.state === "working") drawSteam(b.cx - 5, top + 6, 2, 0.7);
    if (a.type === "espresso" && a.state === "working") drawSteam(b.cx - 13, top + 30, 2, 0.6);
    drawPlaque(a, b);
    a.top = top;
  }

  function drawProgress(cx, cy, r, frac) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    inked(P.cream, 1.6);
    ctx.fillStyle = "#e8964a";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  // Progress while a machine works, and the finished item bobbing when it is done.
  function drawMachineStatus(a) {
    if (a.kind !== "maker" || a.top === undefined) return;
    const cx = a.x + a.w / 2;
    if (a.state === "working") {
      drawProgress(cx, a.top - 12, 9, Math.min(1, a.t / cookTime(a.makes)));
    } else if (a.state === "ready") {
      const bounce = Math.sin(performance.now() / 180) * 3;
      ctx.save();
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, a.top - 16 + bounce, 17, 0, Math.PI * 2);
      inked(P.cream, 1.6);
      ctx.restore();
      drawItem(a.makes, cx, a.top - 16 + bounce, 26);
    }
  }

  // A machine still in its packing crate: a cardboard box with its picture on the side.
  function drawCrate(m, r) {
    const x = r.x + 4;
    const w = r.w - 8;
    const bottom = r.y + r.h - 4;
    const h = 30;
    const lid = 9;
    ellipse(ctx, x + w / 2, bottom, w / 2 + 3, 5, "rgba(70,35,20,0.25)");
    roundRect(x, bottom - h, w, h, 3);
    inked(P.crate, 1.6);
    ctx.beginPath();
    ctx.moveTo(x, bottom - h);
    ctx.lineTo(x + 4, bottom - h - lid);
    ctx.lineTo(x + w - 4, bottom - h - lid);
    ctx.lineTo(x + w, bottom - h);
    ctx.closePath();
    inked(P.crateTop, 1.6);
    ctx.fillStyle = "rgba(240,224,190,0.9)";
    ctx.fillRect(x + w / 2 - 4, bottom - h - lid + 1, 8, lid + 7);
    const look = LOOKS[m.type];
    const pic = m.type === "bin" ? null : look ? art("machines/" + look.idle) : null;
    if (pic && loaded(pic)) {
      ctx.globalAlpha = 0.9;
      const s = Math.min((w - 10) / pic.naturalWidth, (h - 10) / pic.naturalHeight);
      ctx.drawImage(pic, x + w / 2 - (pic.naturalWidth * s) / 2, bottom - h / 2 - (pic.naturalHeight * s) / 2 + 2, pic.naturalWidth * s, pic.naturalHeight * s);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = "800 7px " + FONT;
      ctx.fillStyle = P.crateDark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = m.type === "bin" ? "BIN" : (MACHINES[m.type].plaque || "").toUpperCase();
      ctx.fillText(label, x + w / 2, bottom - h / 2 + 3, w - 4);
    }
  }

  // ---------- people ----------
  // Feet at (x, y). Walking is a bob and a sway; they face the way they last moved.
  function drawPersonArt(name, p) {
    const im = art("people/" + name);
    const bob = p.walk ? Math.abs(Math.sin(p.walk)) * 2.5 : 0;
    ellipse(ctx, p.x, p.y, 20, 5.5, "rgba(60,30,15,0.28)");
    if (!loaded(im)) return bob;
    const w = (im.naturalWidth / im.naturalHeight) * PERSON_H * (HEIGHTS[name] || 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.walk) ctx.rotate(Math.sin(p.walk) * 0.035);
    drawArt(im, 0, -bob, w, p.fx < -0.2);
    ctx.restore();
    return bob;
  }

  // What someone is carrying, held out in front at chest height; on a tray once
  // they can carry more than one thing.
  function drawCarried(p, items, bob) {
    if (!items.length) return;
    const n = items.length;
    const gap = 25;
    const y = p.y - bob - 60;
    const x0 = p.x - ((n - 1) * gap) / 2;
    if (n > 1 || carryCap() > 1) {
      roundRect(x0 - 17, y + 9, (n - 1) * gap + 34, 6, 3);
      inked(P.woodDark, 1.4);
    }
    items.forEach((it, i) => {
      const x = x0 + i * gap;
      drawItem(it, x, y, 27);
      if (ITEMS[it].hot) drawSteam(x, y - 12, 2, 0.6);
    });
  }

  // The player's and Sam's feet sit a little below their middle.
  const FEET = 10;

  // Which way someone faces: the way they last walked sideways. Walking
  // straight up or down keeps whatever they had.
  function facing(p) {
    if (p.fx < -0.2) p.face = -1;
    else if (p.fx > 0.2) p.face = 1;
    return p.face || 1;
  }

  function drawPlayer() {
    const p = S.player;
    const at = { x: p.x, y: p.y + FEET, walk: p.walk, fx: facing(p) };
    const bob = drawPersonArt("barista", at);
    drawCarried(at, p.tray, bob);
  }

  function drawHelper() {
    const h = S.helper;
    if (!h) return;
    const at = { x: h.x, y: h.y + FEET, walk: h.walk, fx: facing(h) };
    if (lvl("helper") >= 2) {
      // roller skates
      for (const s of [-1, 1]) {
        ctx.fillStyle = "#e0584a";
        roundRect(h.x + s * 9 - 8, at.y - 5, 16, 4, 2);
        ctx.fill();
        ellipse(ctx, h.x + s * 9 - 5, at.y, 2.6, 2.6, INK);
        ellipse(ctx, h.x + s * 9 + 5, at.y, 2.6, 2.6, INK);
      }
    }
    const bob = drawPersonArt("sam", at);
    drawCarried(at, h.carry ? [h.carry] : [], bob);
    ctx.font = "800 9px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(58,38,30,0.75)";
    ctx.strokeText("SAM", h.x, at.y + 4);
    ctx.fillStyle = P.cream;
    ctx.fillText("SAM", h.x, at.y + 4);
  }

  function drawCustomer(c) {
    const alpha = c.leaving ? Math.max(0, 1 - c.leaveT / LEAVE_TIME) : Math.min(1, c.age * 4);
    const frac = c.patience / c.maxPatience;
    const fidget = !c.leaving && frac < 0.2 ? Math.sin(performance.now() / 45) * 1.3 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    // in the queue everyone faces the counter
    drawPersonArt(c.art, { x: c.x + fidget, y: c.y, walk: c.walk, fx: c.walk ? c.fx : 1 });
    ctx.restore();
  }

  // The order bubble, to the right of the head like the mockup, with a
  // patience bar underneath that drains green to amber to red.
  function drawBubble(c) {
    const n = c.order.length;
    const cell = maxCustomers() > 5 ? 23 : 27;
    const cols = n <= 2 ? n : 2;
    const rows = n <= 2 ? 1 : 2;
    const bw = cols * cell + 12;
    const bh = rows * cell + 10;
    const bx = c.x + 22;
    const by = c.y - PERSON_H * (HEIGHTS[c.art] || 1) + 8;
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.age * 3);
    ctx.fillStyle = "rgba(60,30,15,0.22)";
    roundRect(bx + 2, by + 3, bw, bh, 11);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + 1, by + bh * 0.5);
    ctx.lineTo(bx - 9, by + bh * 0.5 + 9);
    ctx.lineTo(bx + 1, by + bh * 0.5 + 6);
    ctx.closePath();
    inked("#fffdf6", 1.8);
    roundRect(bx, by, bw, bh, 11);
    inked("#fffdf6", 1.8);
    c.order.forEach((o, i) => {
      const ix = bx + 6 + cell * (i % cols + 0.5);
      const iy = by + 5 + cell * (Math.floor(i / cols) + 0.5);
      ctx.globalAlpha = Math.min(1, c.age * 3) * (o.done ? 0.3 : 1);
      drawItem(o.item, ix, iy, cell - 3);
      if (o.done) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#3fae62";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ix - 7, iy + 1);
        ctx.lineTo(ix - 2, iy + 6);
        ctx.lineTo(ix + 8, iy - 6);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = Math.min(1, c.age * 3);
    const f = Math.max(0, c.patience / c.maxPatience);
    const pw = bw - 10;
    roundRect(bx + 5, by + bh + 4, pw, 6, 3);
    inked("rgba(58,38,30,0.5)", 1);
    ctx.fillStyle = f > 0.5 ? "#6cc46c" : f > 0.25 ? "#e8b84c" : "#e0584a";
    roundRect(bx + 6, by + bh + 5, Math.max(1, (pw - 2) * f), 4, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPrompt(a) {
    const text = promptFor(a);
    if (!text) return;
    const p = S.player;
    ctx.font = "700 12px " + FONT;
    const tw = ctx.measureText(text).width + 30;
    const x = Math.max(4, Math.min(W - tw - 4, p.x - tw / 2));
    const y = Math.min(H - 26, p.y + FEET + 8);
    roundRect(x, y, tw, 21, 10);
    inked("rgba(58,38,30,0.9)", 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    roundRect(x + 4, y + 3.5, 14, 14, 4);
    ctx.fillStyle = "#ffd166";
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText("E", x + 7.2, y + 11.5);
    ctx.fillStyle = P.cream;
    ctx.fillText(text, x + 23, y + 11.5);
  }

  function drawFloats() {
    for (const f of S.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.font = "800 16px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(58,38,30,0.8)";
      ctx.strokeText(f.text, f.x, f.y - f.t * 28);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 28);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ensureBackground();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);
    const target = S.running ? nearestTarget() : null;
    drawCounter(COUNTER, target === COUNTER);
    // Everything that stands on the floor, back to front by where its feet are.
    const scene = [];
    for (const a of APPLIANCES) if (a !== COUNTER) scene.push({ y: a.y + a.h, draw: () => drawMachine(a, a === target) });
    UNPLACED.forEach((m, i) => {
      if (drag && drag.unplaced && drag.a.id === m.id) return;
      const r = crateSlot(i);
      scene.push({ y: r.y + r.h - 0.1 * (UNPLACED.length - i), draw: () => drawCrate(m, r) });
    });
    if (drag && drag.unplaced) {
      scene.push({
        y: drag.a.y + drag.a.h,
        draw: () => {
          ctx.globalAlpha = 0.85;
          drawMachine(drag.a, false);
          ctx.globalAlpha = 1;
        }
      });
    }
    for (const c of S.customers) scene.push({ y: c.y, draw: () => drawCustomer(c) });
    scene.push({ y: S.player.y + FEET, draw: drawPlayer });
    if (S.helper) scene.push({ y: S.helper.y + FEET, draw: drawHelper });
    scene.sort((p, q) => p.y - q.y);
    for (const s of scene) s.draw();
    for (const a of APPLIANCES) drawMachineStatus(a);
    for (const c of S.customers) if (!c.leaving) drawBubble(c);
    if (layoutMode) drawLayoutOverlay();
    if (target) drawPrompt(target);
    drawFloats();
  }

  // ---------- popups ----------
  // Every overlay goes through here so the same rules apply: a popup ignores
  // movement keys entirely, ignores keys that were already down when it opened,
  // and only confirms on Enter/Space pressed after a short grace period.
  let popup = null; // { el, openedAt, stale: Set, onConfirm }

  function openPopup(el, onConfirm) {
    if (popup && popup.el !== el) popup.el.hidden = true;
    el.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    popup = { el: el, openedAt: performance.now(), stale: new Set(heldKeys), onConfirm: onConfirm };
  }

  function closePopup() {
    if (!popup) return;
    popup.el.hidden = true;
    popup = null;
  }

  function popupReady() {
    return !!popup && performance.now() - popup.openedAt >= POPUP_GRACE;
  }

  // ---------- pausing ----------
  // Full screen means there is no page around the game to step out to, so the
  // shift can be stopped where it stands: nothing ticks, nobody walks out.
  let paused = false;

  function pauseGame() {
    if (paused || !S || !S.running || popup || layoutMode) return;
    paused = true;
    $("pause-coins").textContent = S.coins;
    $("pause-served").textContent = S.served;
    $("pause-best").textContent = best;
    openPopup(pausePanel, resumeGame);
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    closePopup();
  }

  // ---------- rearranging the floor ----------
  // Between shifts you can drag any machine onto a clear patch of floor. The
  // counter is fixed, and a drop is refused if it would wall something off.
  const LAYOUT_HINT = "Crates wait along the front. Drag each machine onto the floor \u2014 lined up along the back wall they make a counter. The service counter stays put.";
  let layoutMode = false;
  let layoutBack = null;
  let drag = null; // { a, ox, oy, home, c, r, ok, unplaced }

  function canvasPos(e) {
    const b = canvas.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H };
  }

  // A machine is drawn standing on its cabinet, well above its footprint, so
  // the whole of what you can see picks it up. The front-most one wins.
  function applianceAt(x, y) {
    const front = APPLIANCES.filter((a) => a.movable).sort((p, q) => q.y + q.h - (p.y + p.h));
    for (const a of front) {
      const rise = a.kind === "bin" ? 26 : MACHINE_RISE;
      if (x >= a.x && x <= a.x + a.w && y >= a.y - rise && y <= a.y + a.h) return a;
    }
    return null;
  }

  function moveApplianceTo(a, c, r) {
    a.c = c;
    a.r = r;
    a.x = c * TILE;
    a.y = r * TILE;
  }

  function dropOk(a, c, r) {
    const s = machineSize(a.type);
    if (c <= COUNTER_COL || r < FLOOR_TOP || c + s.w > COLS || r + s.h > ROWS) return false;
    const rect = spotRect(a.type, c, r);
    const others = applianceRects(a);
    for (const o of others) if (rectsOverlap(rect, o)) return false;
    return layoutWorks(others.concat([rect]));
  }

  // Lift a machine out of its crate and onto a spot on the floor.
  function putOnFloor(m, c, r) {
    const a = makeAppliance(m, c, r);
    if (!dropOk(a, c, r)) return false;
    moveApplianceTo(a, c, r);
    APPLIANCES.push(a);
    SOLIDS.push(a);
    UNPLACED = UNPLACED.filter((u) => u.id !== m.id);
    save.layout[m.id] = [c, r];
    save.layoutCols = COLS;
    save.layoutRows = ROWS;
    rebuildPool();
    persist();
    return true;
  }

  function endDrag(commit) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.unplaced) {
      // The machine came out of a crate: dropping it somewhere legal puts it
      // on the floor for good; anything else puts it back in the crate.
      if (commit && d.ok && putOnFloor({ id: d.a.id, type: d.a.type }, d.c, d.r)) {
        layoutMsg.textContent = "Placed the " + d.a.label.toLowerCase() + ".";
      } else {
        layoutMsg.textContent = commit ? "No room there. Every machine has to stay reachable." : LAYOUT_HINT;
      }
    } else if (commit && d.ok) {
      moveApplianceTo(d.a, d.c, d.r);
      save.layout[d.a.id] = [d.c, d.r];
      save.layoutCols = COLS;
      save.layoutRows = ROWS;
      persist();
      layoutMsg.textContent = "Moved the " + d.a.label.toLowerCase() + ".";
    } else {
      moveApplianceTo(d.a, d.home.c, d.home.r);
      layoutMsg.textContent = commit ? "No room there. Every machine has to stay reachable." : LAYOUT_HINT;
    }
  }

  function openLayout(back) {
    layoutBack = back || showIntro;
    paused = false;
    closePopup();
    endDrag(false);
    buildLayout();
    layoutMode = true;
    layoutBar.hidden = false;
    layoutMsg.textContent = LAYOUT_HINT;
    canvas.classList.add("arranging");
  }

  function closeLayout() {
    if (!layoutMode) return;
    endDrag(false);
    layoutMode = false;
    layoutBar.hidden = true;
    canvas.classList.remove("arranging");
    const back = layoutBack || showIntro;
    layoutBack = null;
    reset();
    back();
  }

  function resetLayout() {
    endDrag(false);
    save.layout = {};
    save.layoutCols = COLS;
    save.layoutRows = ROWS;
    persist();
    buildLayout();
    layoutMsg.textContent = "Everything is back where it started.";
  }

  function drawLayoutOverlay() {
    const x0 = (COUNTER_COL + 1) * TILE;
    ctx.save();
    ctx.fillStyle = "rgba(40,24,14,0.10)";
    ctx.fillRect(x0, FLOOR_TOP * TILE, W - x0, H - FLOOR_TOP * TILE);
    ctx.strokeStyle = "rgba(255,244,226,0.34)";
    ctx.lineWidth = 1;
    for (let c = COUNTER_COL + 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE + 0.5, FLOOR_TOP * TILE);
      ctx.lineTo(c * TILE + 0.5, H);
      ctx.stroke();
    }
    for (let r = FLOOR_TOP; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(x0, r * TILE + 0.5);
      ctx.lineTo(W, r * TILE + 0.5);
      ctx.stroke();
    }
    for (const a of APPLIANCES) {
      if (!a.movable || (drag && drag.a === a)) continue;
      // round the whole machine as it stands, not just the tiles under it
      const top = a.y - (a.kind === "bin" ? 26 : MACHINE_RISE);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(255,221,140,0.95)";
      ctx.lineWidth = 2;
      roundRect(a.x + 1, top, a.w - 2, a.y + a.h - top + 2, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      roundRect(a.x + a.w - 17, top + 3, 14, 14, 4);
      ctx.fillStyle = "rgba(58,38,30,0.85)";
      ctx.fill();
      ctx.font = "800 11px " + FONT;
      ctx.fillStyle = "#ffd166";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2725", a.x + a.w - 10, top + 10.5);
    }
    if (drag) {
      ctx.setLineDash([]);
      ctx.strokeStyle = drag.ok ? "#7ee081" : "#e0584a";
      ctx.lineWidth = 3;
      roundRect(drag.a.x + 2, drag.a.y + 2, drag.a.w - 4, drag.a.h - 4, 8);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = drag.ok ? "#7ee081" : "#e0584a";
      roundRect(drag.a.x + 2, drag.a.y + 2, drag.a.w - 4, drag.a.h - 4, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- flow ----------
  // The first day cannot begin until something sits on the floor. The cafe
  // starts with everything still in its crates; putting one appliance down
  // unlocks the doors.
  function blockStart() {
    if (popup && popup.el === shop) {
      shopNote.textContent = "Place at least one appliance first \u2014 use \u201cRearrange cafe\u201d.";
      return;
    }
    showIntro("Place at least one appliance first \u2014 use \u201cRearrange cafe\u201d to drag one out.");
  }

  function startShift() {
    if (!canStart()) {
      blockStart();
      return;
    }
    paused = false;
    reset();
    closePopup();
    S.running = true;
    say("Day " + S.day + ". Doors open. First customer incoming.", 2000);
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
    persist();
    refreshHud();

    overlayTitle.textContent = closedOnTime ? "Closing time" : "Shift over";
    const intro = closedOnTime
      ? "<p>Day " + completedDay + " done and the doors are locked. Nice work.</p>"
      : "<p>Three customers walked out, so day " + completedDay + " ends early. You keep what you earned; give the day another go with better kit.</p>";
    const record = S.coins >= best && S.coins > 0 ? "<li>A new best for a single day.</li>" : "<li>Best day so far: <b>" + best + "</b> coins</li>";
    const arriving = closedOnTime && unlockFor(save.day) ? "<li>" + unlockFor(save.day).text + "</li>" : "";
    overlayBody.innerHTML =
      intro +
      "<ul><li><b>" + S.served + "</b> customers served</li>" +
      "<li><b>" + S.coins + "</b> coins earned" + (bonus ? " + <b>" + bonus + "</b> closing bonus" : "") + "</li>" +
      "<li>Shift lasted <b>" + clock(S.time) + "</b></li>" +
      "<li>Bank: <b>" + save.bank + "</b> coins to spend in the shop</li>" +
      record + arriving + "</ul>";
    btnStart.textContent = "Visit the shop";
    btnStart.disabled = false;
    btnShop.hidden = true;
    btnLayout.hidden = true;
    openPopup(overlay, openShop);
    btnStart.onclick = openShop;
  }

  function showIntro(warn) {
    overlayTitle.textContent = save.day > 1 || save.bank > 0 ? "Welcome back" : "Opening time";
    const status = save.day > 1 || save.bank > 0
      ? "<p>You are on <b>day " + save.day + "</b> with <b>" + save.bank + "</b> coins in the bank. Spend them in the shop between shifts.</p>"
      : "";
    const fresh = save.day === 1 && save.bank === 0 && Object.keys(save.layout).length === 0;
    const setup = fresh
      ? "<p><b>First, set up the floor:</b> your machines are still in their crates along the front of the room. Use <b>Rearrange cafe</b>, drag each one out onto the floor, then open the doors.</p>"
      : "";
    const warning = warn ? '<p class="warn"><b>' + warn + "</b></p>" : "";
    const menu = unlockedItems();
    const twoStep = menu.filter((i) => ITEMS[i].from);
    const machines = "<li><b>On the menu:</b> " + menu.map((i) => ITEMS[i].emoji + " " + ITEMS[i].name).join(", ") + ".</li>";
    const chained = twoStep.length
      ? "<li><b>Two-step drinks:</b> " +
        twoStep.map((i) => ITEMS[ITEMS[i].from].emoji + " \u2192 " + ITEMS[i].emoji + " " + ITEMS[i].name).join(", ") +
        ". Carry the first half over to the machine that finishes it.</li>"
      : "";
    overlayBody.innerHTML =
      status +
      setup +
      warning +
      "<p>Customers come in through the door and queue along the counter with an order in their speech bubble. Make each item at the right machine, then put it on the counter. Matching items are taken straight away.</p>" +
      "<ul>" +
      "<li><b>Move</b> with WASD or the arrow keys.</li>" +
      "<li><b>Use</b> a machine or the counter with <kbd>E</kbd> or <kbd>Space</kbd>, and <b>pause</b> with <kbd>Esc</kbd>.</li>" +
      machines +
      chained +
      "<li><b>Rearrange</b> the floor between shifts: drag any machine where you want it.</li>" +
      "<li>Each day lasts 90 seconds. Faster service means bigger tips. Three walkouts and the day ends early.</li>" +
      "<li>Earnings go in the bank. Spend them on upgrades between days; every day gets busier and new machines turn up.</li>" +
      "</ul>";
    btnStart.textContent = fresh && !canStart() ? "Place an appliance first" : save.day > 1 ? "Start day " + save.day : "Open the cafe";
    btnStart.disabled = !canStart();
    btnStart.onclick = startShift;
    btnShop.hidden = false;
    btnLayout.hidden = false;
    openPopup(overlay, startShift);
  }

  // ---------- shop ----------
  function buy(u) {
    const l = lvl(u.id);
    if (l >= u.max) return false;
    const cost = upgradeCost(u);
    if (save.bank < cost) {
      shopNote.textContent = "Not enough coins for " + u.name + " (" + cost + ").";
      return false;
    }
    save.bank -= cost;
    save.upgrades[u.id] = l + 1;
    persist();
    shopNote.textContent = u.name + " bought: " + u.level(l + 1) + ".";
    renderShop();
    refreshHud();
    return true;
  }

  // Upgrades for kit you do not own yet stay out of the shop until it arrives.
  function shopUpgrades() {
    return UPGRADES.filter((u) => !u.from || save.day >= u.from);
  }

  function buyIndex(i) {
    const list = shopUpgrades();
    if (list[i]) buy(list[i]);
  }

  function dayPreview() {
    const d = save.day;
    const p0 = (d - 1) * 0.9;
    const items = p0 < 0.7 ? "single-item orders to start" : p0 < 2.4 ? "orders of up to 2 items from the start" : "orders of up to 3 items from the start";
    const every = Math.max(2.0, 7.5 - p0 * 1.3).toFixed(1);
    let line = "Day " + d + ": a customer roughly every " + every + "s, " + items + ", patience " + Math.round(Math.max(15, 42 - p0 * 4.5) * patienceMult()) + "s+.";
    const u = unlockFor(d);
    if (u) line += " " + u.text;
    else {
      const next = UNLOCKS.find((x) => x.day > d);
      if (next) line += " New kit turns up on day " + next.day + ".";
    }
    return line;
  }

  function renderShop() {
    shopBank.textContent = save.bank;
    shopGrid.innerHTML = "";
    shopUpgrades().forEach((u, i) => {
      const l = lvl(u.id);
      const maxed = l >= u.max;
      const cost = upgradeCost(u);
      const card = document.createElement("div");
      card.className = "up" + (maxed ? " maxed" : save.bank >= cost ? " afford" : "");
      let pips = "";
      for (let k = 0; k < u.max; k++) pips += '<i class="' + (k < l ? "on" : "") + '"></i>';
      card.innerHTML =
        '<div class="up-head"><span class="up-icon">' + u.icon + "</span><span class=\"up-name\">" + u.name + '</span>' + (i < 9 ? '<span class="up-key">' + (i + 1) + "</span>" : "") + "</div>" +
        '<p class="up-desc">' + u.desc + "</p>" +
        '<div class="up-foot"><span class="pips" title="Level ' + l + " of " + u.max + '">' + pips + '</span><span class="up-level">' + u.level(l) + "</span></div>";
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = maxed ? "Maxed" : "Buy for " + cost;
      b.disabled = maxed || save.bank < cost;
      b.addEventListener("click", () => buy(u));
      card.appendChild(b);
      shopGrid.appendChild(card);
    });
    btnNext.textContent = "Start day " + save.day;
    btnNext.disabled = !canStart();
    document.getElementById("shop-day").textContent = dayPreview();
  }

  function openShop() {
    shopNote.textContent = "";
    btnReset.textContent = "Reset progress";
    btnReset.dataset.armed = "";
    renderShop();
    openPopup(shop, startShift);
  }

  function resetProgress() {
    if (btnReset.dataset.armed !== "1") {
      btnReset.dataset.armed = "1";
      btnReset.textContent = "Really reset? Click again";
      return;
    }
    save = freshSave();
    persist();
    reset();
    openShop();
    shopNote.textContent = "Progress reset. Back to day 1.";
  }

  // ---------- input ----------
  const keys = new Set(); // movement keys currently held
  const heldKeys = new Set(); // every key currently held, for popup stale-key checks
  const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);
  const CONFIRM_KEYS = new Set(["Enter", " "]);
  const normKey = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

  window.addEventListener("keydown", (e) => {
    const k = normKey(e);
    if (e.repeat) {
      if (MOVE_KEYS.has(k) || k === " ") e.preventDefault();
      return;
    }
    heldKeys.add(k);

    if (layoutMode) {
      if (k === "Escape" || CONFIRM_KEYS.has(k)) {
        e.preventDefault();
        closeLayout();
      }
      return;
    }

    if (popup) {
      if (k === "Escape" && popup.el === pausePanel) {
        e.preventDefault();
        resumeGame();
        return;
      }
      if (MOVE_KEYS.has(k)) {
        // Movement never touches a popup, but keep tracking it so the player
        // walks off straight away once the next shift starts.
        keys.add(k);
        e.preventDefault();
        return;
      }
      if (CONFIRM_KEYS.has(k)) {
        e.preventDefault();
        if (popup.stale.has(k)) return; // held since before the popup opened
        if (!popupReady()) {
          // Mashing through the grace period restarts it: the popup wants a
          // deliberate press after half a second of quiet.
          popup.openedAt = performance.now();
          return;
        }
        // Let a focused button in the popup (reached with Tab) activate natively.
        const ae = document.activeElement;
        if (ae && ae.tagName === "BUTTON" && popup.el.contains(ae)) {
          ae.click();
          return;
        }
        popup.onConfirm();
        return;
      }
      if (popup.el === shop && /^[1-9]$/.test(k) && popupReady()) {
        buyIndex(Number(k) - 1);
        e.preventDefault();
      }
      return;
    }

    if (MOVE_KEYS.has(k)) {
      keys.add(k);
      e.preventDefault();
    } else if (k === "e" || k === " ") {
      interact();
      e.preventDefault();
    } else if (k === "Escape" || k === "p") {
      pauseGame();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = normKey(e);
    heldKeys.delete(k);
    keys.delete(k);
    if (popup) popup.stale.delete(k);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    heldKeys.clear();
    pauseGame(); // nobody storms out while you are in another tab
  });

  let resizePending = false;
  window.addEventListener("resize", () => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      relayout();
    });
  });

  btnStart.addEventListener("click", () => {
    if (typeof btnStart.onclick !== "function") startShift();
  });
  btnShop.addEventListener("click", openShop);
  btnNext.addEventListener("click", startShift);
  btnReset.addEventListener("click", resetProgress);
  btnLayout.addEventListener("click", () => openLayout(showIntro));
  btnShopLayout.addEventListener("click", () => openLayout(openShop));
  btnLayoutDone.addEventListener("click", closeLayout);
  btnLayoutReset.addEventListener("click", resetLayout);
  btnPause.addEventListener("click", pauseGame);
  btnResume.addEventListener("click", resumeGame);

  canvas.addEventListener("pointerdown", (e) => {
    if (!layoutMode) return;
    const pos = canvasPos(e);
    const a = applianceAt(pos.x, pos.y);
    const grab = a ? null : crateAt(pos.x, pos.y);
    if (!a && !grab) return;
    e.preventDefault();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    if (a) {
      drag = { a: a, unplaced: false, ox: pos.x - a.x, oy: pos.y - a.y, home: { c: a.c, r: a.r }, c: a.c, r: a.r, ok: true };
      layoutMsg.textContent = "Drop the " + a.label.toLowerCase() + " on a clear patch of floor.";
    } else {
      const ghost = makeAppliance(grab.m, grab.c, grab.r);
      drag = { a: ghost, unplaced: true, ox: pos.x - ghost.x, oy: pos.y - ghost.y, home: { c: grab.c, r: grab.r }, c: grab.c, r: grab.r, ok: true };
      layoutMsg.textContent = "Drag the " + ghost.label.toLowerCase() + " out onto the floor.";
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    e.preventDefault();
    const pos = canvasPos(e);
    const s = machineSize(drag.a.type);
    const c = Math.max(0, Math.min(COLS - s.w, Math.round((pos.x - drag.ox) / TILE)));
    const r = Math.max(FLOOR_TOP, Math.min(ROWS - s.h, Math.round((pos.y - drag.oy) / TILE)));
    if (c === drag.c && r === drag.r) return;
    drag.c = c;
    drag.r = r;
    drag.ok = dropOk(drag.a, c, r);
    moveApplianceTo(drag.a, c, r);
  });
  canvas.addEventListener("pointerup", () => endDrag(true));
  canvas.addEventListener("pointercancel", () => endDrag(false));

  const padButtons = document.querySelectorAll("#touch [data-key]");
  for (const b of padButtons) {
    const k = b.dataset.key;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      keys.add(k);
    });
    const up = () => keys.delete(k);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
  }
  $("touch-action").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (layoutMode) {
      closeLayout();
    } else if (popup) {
      if (popupReady()) popup.onConfirm();
      else popup.openedAt = performance.now();
    } else {
      interact();
    }
  });

  // Small hook for automated playtesting; not used by the game itself.
  window.__cafeRush = {
    state: () => S,
    save: () => save,
    cols: () => COLS,
    view: () => view,
    relayout: relayout,
    pause: pauseGame,
    resume: resumeGame,
    endShift: endShift,
    buy: (id) => {
      const u = UPGRADES.find((x) => x.id === id);
      return u ? buy(u) : false;
    },
    grant: (coins) => {
      save.bank += coins;
      persist();
      renderShop();
      refreshHud();
    },
    setDay: (d) => {
      save.day = d;
      persist();
      refreshHud();
    },
    interact: interact,
    step: (seconds, dt) => {
      const d = dt || 1 / 30;
      for (let t = 0; t < seconds && S.running; t += d) update(d);
    },
    queueSpot: queueSpot,
    counter: () => COUNTER,
    images: () => Object.keys(IMAGES).map((k) => [k, loaded(IMAGES[k])]).concat([["room", loaded(ROOM)]]),
    upgrades: UPGRADES,
    cost: upgradeCost,
    reset: reset,
    appliances: () => APPLIANCES,
    unplaced: () => UNPLACED.slice(),
    pool: () => POOL.slice(),
    canStart: canStart,
    shortfall: shortfall,
    layout: () => save.layout,
    openLayout: openLayout,
    closeLayout: closeLayout,
    dropOk: (id, c, r) => {
      const a = APPLIANCES.find((x) => x.id === id) || makeAppliance({ id: id, type: id.replace(/-[0-9]+$/, "") }, c, r);
      return dropOk(a, c, r);
    },
    place: (id, c, r) => {
      const a = APPLIANCES.find((x) => x.id === id);
      if (a) {
        if (!dropOk(a, c, r)) return false;
        moveApplianceTo(a, c, r);
        save.layout[a.id] = [c, r];
        save.layoutCols = COLS;
        save.layoutRows = ROWS;
        persist();
        return true;
      }
      const m = UNPLACED.find((u) => u.id === id);
      return m ? putOnFloor(m, c, r) : false;
    }
  };

  // ---------- loop ----------
  want = idealShape();
  applyShape(want);
  fitCanvas();
  reset();
  showIntro();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
