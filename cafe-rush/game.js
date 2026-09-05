(() => {
  "use strict";

  // ---------- constants ----------
  const TILE = 48;
  const COLS = 16;
  const ROWS = 11;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const BASE_CUSTOMERS = 4;
  const BASE_COUNTER_SLOTS = 8;
  const MAX_STRIKES = 3;
  const BASE_PLAYER_SPEED = 200;
  const REACH = 18;
  const SHIFT_LENGTH = 90; // seconds per day
  const POPUP_GRACE = 500; // ms of quiet before a popup accepts a confirm press
  const BEST_KEY = "cafe-rush-best";
  const SAVE_KEY = "cafe-rush-save";

  const ITEMS = {
    coffee: { name: "coffee", emoji: "☕", time: 2.5, price: 3, verb: "Brew" },
    cookie: { name: "cookies", emoji: "🍪", time: 4.0, price: 2, verb: "Bake" },
    brownie: { name: "brownies", emoji: "🍫", time: 5.5, price: 4, verb: "Bake" }
  };
  const ORDER_POOL = ["coffee", "coffee", "coffee", "cookie", "cookie", "brownie"];
  const FACES = ["😊", "🙂", "😄", "🤓", "😎", "🥰", "😌", "🧐"];
  const SHIRTS = ["#5b8def", "#e06c9f", "#4fb286", "#f0a35e", "#9b7bd8", "#e2c04e"];
  const HAIRS = ["#3b2417", "#7a4a2a", "#e0b04f", "#b5412c", "#2c2c34", "#8c6a54", "#d98e73"];

  // Persistent upgrades. Cost for the next level = round5(base * mult ^ level).
  const UPGRADES = [
    { id: "shoes", name: "Comfy shoes", icon: "👟", max: 5, base: 30, mult: 1.6, desc: "Move 12% faster per level.", level: (l) => "Speed +" + l * 12 + "%" },
    { id: "tray", name: "Serving tray", icon: "🍽️", max: 3, base: 45, mult: 1.8, desc: "Carry one more item at a time.", level: (l) => "Carry " + (1 + l) },
    { id: "turbo", name: "Turbo appliances", icon: "⚡", max: 4, base: 40, mult: 1.6, desc: "Machines and ovens finish 12% sooner per level.", level: (l) => "Cook time -" + Math.round((1 - Math.pow(0.88, l)) * 100) + "%" },
    { id: "espresso", name: "Third espresso machine", icon: "☕", max: 1, base: 80, mult: 1, desc: "Another espresso machine on the right-hand wall.", level: (l) => (l ? "Installed" : "2 machines") },
    { id: "ovens", name: "Extra ovens", icon: "🔥", max: 2, base: 90, mult: 1.5, desc: "A second cookie oven, then a second brownie oven.", level: (l) => (l === 0 ? "2 ovens" : l === 1 ? "3 ovens" : "4 ovens") },
    { id: "seating", name: "Cosy seating", icon: "🛋️", max: 4, base: 35, mult: 1.6, desc: "Customers wait 15% longer per level.", level: (l) => "Patience +" + l * 15 + "%" },
    { id: "tables", name: "Extra tables", icon: "🪑", max: 2, base: 70, mult: 2, desc: "A longer counter: one more customer can queue at once. More orders, more coins, more pressure.", level: (l) => (BASE_CUSTOMERS + l) + " customers" },
    { id: "tips", name: "Tip jar", icon: "💰", max: 3, base: 50, mult: 1.7, desc: "Quick service tips up to 2 coins more per level.", level: (l) => "Max tip " + (3 + l * 2) },
    { id: "helper", name: "Hire Sam", icon: "🧑‍🍳", max: 2, base: 250, mult: 0.6, desc: "Sam starts wanted orders, collects what is ready and runs it to the counter. Level 2: roller skates.", level: (l) => (l === 0 ? "Just you" : l === 1 ? "Sam hired" : "Sam on skates") }
  ];

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const UI_FONT = '"Segoe UI", system-ui, sans-serif';

  // ---------- dom ----------
  const canvas = document.getElementById("game");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const hud = {
    coins: $("hud-coins"),
    served: $("hud-served"),
    time: $("hud-time"),
    strikes: $("hud-strikes"),
    day: $("hud-day"),
    bank: $("hud-bank"),
    best: $("hud-best"),
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
    return { v: 1, day: 1, bank: 0, upgrades: up };
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
  const playerSpeed = () => BASE_PLAYER_SPEED * (1 + 0.12 * lvl("shoes"));
  const carryCap = () => 1 + lvl("tray");
  const cookTime = (item) => ITEMS[item].time * Math.pow(0.88, lvl("turbo"));
  const patienceMult = () => 1 + 0.15 * lvl("seating");
  const maxTip = () => 3 + 2 * lvl("tips");
  const maxCustomers = () => BASE_CUSTOMERS + lvl("tables");
  const counterSlots = () => BASE_COUNTER_SLOTS + 2 * lvl("tables");

  // ---------- layout (rebuilt each day from the upgrades) ----------
  let COUNTER = null;
  let APPLIANCES = [];
  let SOLIDS = [];

  function buildLayout() {
    const ext = lvl("tables"); // each level stretches the counter by a tile on both ends
    COUNTER = { kind: "counter", x: (3 - ext) * TILE, y: 2 * TILE, w: (10 + 2 * ext) * TILE, h: TILE, label: "Counter", color: "#a8703f" };
    APPLIANCES = [
      COUNTER,
      { kind: "maker", makes: "coffee", x: 0, y: 4 * TILE, w: TILE, h: 2 * TILE, label: "Espresso", color: "#6f5590" },
      { kind: "maker", makes: "coffee", x: 0, y: 7 * TILE, w: TILE, h: 2 * TILE, label: "Espresso", color: "#6f5590" },
      { kind: "maker", makes: "cookie", x: 4 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Cookie oven", color: "#c07a35" },
      { kind: "maker", makes: "brownie", x: 10 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Brownie oven", color: "#6a3b2a" }
    ];
    if (lvl("espresso") >= 1) {
      APPLIANCES.push({ kind: "maker", makes: "coffee", x: 15 * TILE, y: 3 * TILE, w: TILE, h: 2 * TILE, label: "Espresso", color: "#6f5590" });
    }
    if (lvl("ovens") >= 1) {
      APPLIANCES.push({ kind: "maker", makes: "cookie", x: 1 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Cookie oven", color: "#c07a35" });
    }
    if (lvl("ovens") >= 2) {
      APPLIANCES.push({ kind: "maker", makes: "brownie", x: 13 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Brownie oven", color: "#6a3b2a" });
    }
    APPLIANCES.push({ kind: "bin", x: 15 * TILE, y: 6 * TILE, w: TILE, h: TILE, label: "Bin", color: "#4e555e" });
    // Rows 0 and 1 are the customer side of the counter. The player never crosses it.
    SOLIDS = [{ x: 0, y: 0, w: W, h: 2 * TILE }].concat(APPLIANCES);
    for (const a of APPLIANCES) {
      a.state = "idle";
      a.t = 0;
    }
  }

  // Where someone stands to use an appliance: just inside the room from it.
  function standingPoint(a) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    if (a.x <= 0) return { x: a.x + a.w + 22, y: cy };
    if (a.x + a.w >= W) return { x: a.x - 22, y: cy };
    if (a.y + a.h >= H) return { x: cx, y: a.y - 22 };
    return { x: cx, y: a.y + a.h + 22 };
  }

  // ---------- state ----------
  let S = null;
  let msgTimer = 0;

  function reset() {
    buildLayout();
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
      player: { x: W / 2, y: 6 * TILE, r: 14, fx: 0, fy: 1, tray: [], walk: 0 },
      helper: null
    };
    if (lvl("helper") >= 1) {
      S.helper = { x: W / 2 + 120, y: 8 * TILE, r: 14, fx: 0, fy: 1, carry: null, walk: 0, task: null, wait: 0.8, speed: lvl("helper") >= 2 ? 190 : 125 };
    }
    refreshHud();
  }

  // ---------- helpers ----------
  function say(text, ms) {
    hud.msg.textContent = text;
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

  function refreshHud() {
    hud.coins.textContent = S.coins;
    hud.served.textContent = S.served;
    hud.time.textContent = clock(Math.max(0, Math.ceil(S.timeLeft)));
    hud.strikes.textContent = "♥".repeat(MAX_STRIKES - S.strikes) + "♡".repeat(S.strikes);
    hud.day.textContent = S.day;
    hud.bank.textContent = save.bank;
    hud.best.textContent = best;
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
    for (let i = 0; i < count; i++) {
      order.push({ item: ORDER_POOL[Math.floor(Math.random() * ORDER_POOL.length)], done: false });
    }
    const base = Math.max(15, 42 - p * 4.5);
    const patience = (base + count * 7) * patienceMult();
    S.customers.push({
      id: S.nextId++,
      order: order,
      patience: patience,
      maxPatience: patience,
      face: FACES[Math.floor(Math.random() * FACES.length)],
      shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
      style: Math.floor(Math.random() * 4),
      x: W + 40,
      leaving: false,
      leaveT: 0,
      happy: true,
      bob: Math.random() * Math.PI * 2
    });
    matchCounter();
  }

  function customerTargetX(c) {
    const idx = activeCustomers().indexOf(c);
    return COUNTER.x + (idx + 0.5) * (COUNTER.w / maxCustomers());
  }

  function wantsItem(item) {
    return activeCustomers().find((cu) => cu.order.some((o) => o.item === item && !o.done));
  }

  function fulfil(c, entry) {
    entry.done = true;
    addFloat(c.x, TILE * 1.2, "✓", "#9be79b");
    if (c.order.every((o) => o.done)) {
      const total = c.order.reduce((sum, o) => sum + ITEMS[o.item].price, 0);
      const tip = Math.round((c.patience / c.maxPatience) * maxTip());
      S.coins += total + tip;
      S.served++;
      c.leaving = true;
      c.happy = true;
      addFloat(c.x, TILE * 0.8, "+" + (total + tip) + (tip > 0 ? " (tip " + tip + ")" : ""), "#ffd166");
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
    addFloat(c.x, TILE * 0.8, "Walked out!", "#ff8a7a");
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

  function slotX(i) {
    return COUNTER.x + (i + 0.5) * (COUNTER.w / counterSlots());
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
      if (a.state === "working") return "Cooking...";
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
      if (a.state === "idle") {
        if (full) {
          say(carryCap() > 1 ? "Your tray is full. Put something down first." : "Your hands are full. Put that down first.");
          return;
        }
        a.state = "working";
        a.t = 0;
        say(it.verb + "ing " + it.name + "...", 1200);
      } else if (a.state === "working") {
        say("Still cooking. Give it a moment.", 1200);
      } else if (a.state === "ready") {
        if (full) {
          say(carryCap() > 1 ? "Your tray is full." : "Your hands are full.");
          return;
        }
        p.tray.push(a.makes);
        a.state = "idle";
        a.t = 0;
      }
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
          const d = Math.abs(slotX(s.slot) - p.x);
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
  // between the standing points in front of appliances and the counter.
  function itemDemand(item) {
    let n = 0;
    for (const c of activeCustomers()) for (const o of c.order) if (o.item === item && !o.done) n++;
    return n;
  }

  function itemSupply(item) {
    let n = S.counter.filter((s) => s.item === item).length;
    for (const a of APPLIANCES) if (a.kind === "maker" && a.makes === item && a.state !== "idle") n++;
    if (S.helper && S.helper.carry === item) n++;
    return n;
  }

  function pickHelperTask(h) {
    if (h.carry) {
      const x = Math.max(COUNTER.x + 24, Math.min(COUNTER.x + COUNTER.w - 24, h.x));
      return { type: "deliver", x: x, y: COUNTER.y + COUNTER.h + 22 };
    }
    let bestA = null;
    let bestD = Infinity;
    for (const a of APPLIANCES) {
      if (a.kind !== "maker" || a.state !== "ready" || !wantsItem(a.makes)) continue;
      const sp = standingPoint(a);
      const d = Math.hypot(sp.x - h.x, sp.y - h.y);
      if (d < bestD) {
        bestD = d;
        bestA = a;
      }
    }
    if (bestA) {
      const sp = standingPoint(bestA);
      return { type: "take", app: bestA, x: sp.x, y: sp.y };
    }
    for (const a of APPLIANCES) {
      if (a.kind !== "maker" || a.state !== "idle") continue;
      if (itemDemand(a.makes) <= itemSupply(a.makes)) continue;
      const sp = standingPoint(a);
      const d = Math.hypot(sp.x - h.x, sp.y - h.y);
      if (d < bestD) {
        bestD = d;
        bestA = a;
      }
    }
    if (bestA) {
      const sp = standingPoint(bestA);
      return { type: "start", app: bestA, x: sp.x, y: sp.y };
    }
    return null;
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
    if (t.type === "take" && t.app.state !== "ready") {
      h.task = null;
      return;
    }
    if (t.type === "start" && t.app.state !== "idle") {
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
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) hud.msg.innerHTML = "&nbsp;";
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
      if (activeCustomers().length < maxCustomers()) spawnCustomer();
      S.spawnTimer = spawnInterval() * (0.8 + Math.random() * 0.4);
    }

    for (let i = S.customers.length - 1; i >= 0; i--) {
      const c = S.customers[i];
      c.bob += dt * 3;
      if (c.leaving) {
        c.leaveT += dt;
        if (c.leaveT > 0.8) S.customers.splice(i, 1);
        continue;
      }
      const tx = customerTargetX(c);
      c.x += (tx - c.x) * Math.min(1, dt * 6);
      c.patience -= dt;
      if (c.patience <= 0) {
        walkOut(c);
        if (!S.running) return;
      }
    }

    refreshHud();
  }

  // ---------- drawing ----------
  // Warm, chunky cartoon look. Everything here is purely visual: the rects in
  // APPLIANCES/SOLIDS and every position are unchanged.
  const P = {
    wall: "#f6e3c4",
    wallStripe: "#eed3ad",
    dado: "#b8744a",
    dadoLight: "#dea474",
    floorA: "#ebc79c",
    floorB: "#d6a877",
    wood: "#c98b52",
    woodDark: "#9a6136",
    woodLight: "#e3ac6f",
    cream: "#fff7e8",
    chrome: "#e3e7ec",
    chromeMid: "#b9c1ca",
    chromeDark: "#7e8893",
    teal: "#4fb3a9",
    tealDark: "#2f7f78",
    terracotta: "#e07a4f",
    skin: "#f6d3b3",
    outline: "rgba(60,30,15,0.35)"
  };
  const BULBS = ["#ffd166", "#ff8fa3", "#7ee0d6", "#ffb36b"];

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
      ctx.globalAlpha = 0.55 * (1 - ph) * Math.min(1, ph * 4);
      ctx.beginPath();
      ctx.moveTo(x + ox, y - ph * h);
      ctx.bezierCurveTo(x + ox + 4, y - ph * h - 5, x + ox - 4, y - ph * h - 9, x + ox + Math.sin(ph * 6 + k) * 2, y - ph * h - 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  function sparkle(x, y, r, alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  // The room itself never changes during a day, so it is painted once to an
  // offscreen canvas and re-painted only when the layout (tables) changes.
  let bg = null;
  let bgKey = "";

  function paintPlant(g, x, y, size) {
    // pot
    g.fillStyle = P.terracotta;
    g.beginPath();
    g.moveTo(x - size * 0.55, y - size * 0.45);
    g.lineTo(x + size * 0.55, y - size * 0.45);
    g.lineTo(x + size * 0.42, y + size * 0.3);
    g.lineTo(x - size * 0.42, y + size * 0.3);
    g.closePath();
    g.fill();
    g.fillStyle = "#b85f3a";
    g.fillRect(x - size * 0.6, y - size * 0.55, size * 1.2, size * 0.14);
    // leaves
    const greens = ["#4f9a5c", "#63b46f", "#3d7f4b"];
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i - 2) * 0.55;
      const lx = x + Math.cos(ang) * size * 0.55;
      const ly = y - size * 0.55 + Math.sin(ang) * size * 0.6;
      g.save();
      g.translate(lx, ly);
      g.rotate(ang + Math.PI / 2);
      ellipse(g, 0, 0, size * 0.22, size * 0.42, greens[i % 3]);
      g.restore();
    }
  }

  function paintFrame(g, x, y, w, h, icon) {
    g.fillStyle = "rgba(0,0,0,0.15)";
    g.fillRect(x + 2, y + 3, w, h);
    g.fillStyle = P.woodDark;
    g.fillRect(x, y, w, h);
    g.fillStyle = P.cream;
    g.fillRect(x + 4, y + 4, w - 8, h - 8);
    emoji(icon, x + w / 2, y + h / 2 + 1, Math.min(w, h) * 0.5, g);
  }

  function paintBackground(g) {
    // Back wall with soft stripes.
    g.fillStyle = P.wall;
    g.fillRect(0, 0, W, 2 * TILE);
    g.fillStyle = P.wallStripe;
    for (let x = 6; x < W; x += 28) g.fillRect(x, 0, 12, 2 * TILE);

    // Big window onto a sunny street.
    const wx = TILE * 2.4;
    const ww = W - wx * 2;
    const wy = 8;
    const wh = 40;
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, "#8fd0ee");
    sky.addColorStop(1, "#dbf1fb");
    g.fillStyle = sky;
    g.fillRect(wx, wy, ww, wh);
    ellipse(g, wx + ww * 0.82, wy + 14, 9, 9, "#ffe27a");
    g.fillStyle = "#ffffff";
    for (const c of [[0.12, 22, 14], [0.2, 18, 10], [0.55, 26, 13], [0.62, 20, 9]]) {
      ellipse(g, wx + ww * c[0], wy + c[1], c[2], c[2] * 0.55, "#ffffff");
    }
    g.fillStyle = "#7fb07a";
    g.fillRect(wx, wy + wh - 8, ww, 8);
    g.strokeStyle = P.woodDark;
    g.lineWidth = 5;
    g.strokeRect(wx, wy, ww, wh);
    g.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(wx + (ww * i) / 4, wy);
      g.lineTo(wx + (ww * i) / 4, wy + wh);
      g.stroke();
    }
    g.fillStyle = P.woodLight;
    g.fillRect(wx - 6, wy + wh, ww + 12, 6);

    // Framed pictures either side.
    paintFrame(g, TILE * 0.85, 12, 30, 32, "🍰");
    paintFrame(g, W - TILE * 0.85 - 30, 12, 30, 32, "☕");

    // Plants in the corners of the customer side.
    paintPlant(g, 22, 80, 22);
    paintPlant(g, W - 22, 80, 22);

    // Dado rail where wall meets floor.
    g.fillStyle = P.dadoLight;
    g.fillRect(0, 2 * TILE - 8, W, 8);
    g.fillStyle = P.dado;
    g.fillRect(0, 2 * TILE - 3, W, 3);

    // Warm checkerboard floor with grout and a highlight on each tile.
    for (let r = 2; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        g.fillStyle = (r + c) % 2 ? P.floorB : P.floorA;
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = "rgba(255,255,255,0.16)";
        g.fillRect(x + 2, y + 2, TILE - 4, 3);
        g.fillRect(x + 2, y + 2, 3, TILE - 4);
        g.fillStyle = "rgba(120,70,40,0.22)";
        g.fillRect(x, y + TILE - 2, TILE, 2);
        g.fillRect(x + TILE - 2, y, 2, TILE);
      }
    }
    // Soft vignette so the middle of the floor glows a little.
    const v = g.createRadialGradient(W / 2, H * 0.6, TILE * 3, W / 2, H * 0.6, W * 0.7);
    v.addColorStop(0, "rgba(255,230,190,0.10)");
    v.addColorStop(1, "rgba(70,35,15,0.28)");
    g.fillStyle = v;
    g.fillRect(0, 2 * TILE, W, H - 2 * TILE);
  }

  function ensureBackground() {
    const key = String(lvl("tables"));
    if (bg && bgKey === key) return;
    bgKey = key;
    bg = document.createElement("canvas");
    bg.width = W;
    bg.height = H;
    paintBackground(bg.getContext("2d"));
  }

  function drawStringLights() {
    const now = performance.now();
    ctx.save();
    ctx.strokeStyle = "#5a3a22";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(W / 2, 30, W, 2);
    ctx.stroke();
    const n = 16;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * (W / 2) + t * t * W;
      const y = (1 - t) * (1 - t) * 2 + 2 * (1 - t) * t * 30 + t * t * 2;
      const col = BULBS[i % BULBS.length];
      const glow = 0.35 + 0.25 * Math.sin(now / 400 + i * 1.7);
      ctx.fillStyle = "#3a2a1c";
      ctx.fillRect(x - 1.5, y, 3, 4);
      ctx.globalAlpha = glow;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y + 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(x - 1.2, y + 6.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCounter(a, highlighted) {
    const now = performance.now();
    // drop shadow on the floor
    ctx.fillStyle = "rgba(60,30,15,0.28)";
    roundRect(a.x + 4, a.y + 10, a.w - 8, a.h, 8);
    ctx.fill();
    // front panel
    ctx.fillStyle = P.woodDark;
    roundRect(a.x + 2, a.y + 20, a.w - 4, a.h - 22, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let x = a.x + 8; x < a.x + a.w - 8; x += TILE) {
      roundRect(x, a.y + 38, TILE - 12, 6, 3);
      ctx.fill();
    }
    // top with wood grain
    ctx.fillStyle = P.wood;
    roundRect(a.x + 2, a.y + 2, a.w - 4, 34, 7);
    ctx.fill();
    ctx.fillStyle = P.woodLight;
    roundRect(a.x + 4, a.y + 3, a.w - 8, 5, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,50,20,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(a.x + 12, a.y + 12 + i * 8);
      ctx.bezierCurveTo(a.x + a.w * 0.3, a.y + 10 + i * 8 + (i % 2) * 4, a.x + a.w * 0.7, a.y + 14 + i * 8 - (i % 2) * 4, a.x + a.w - 12, a.y + 12 + i * 8);
      ctx.stroke();
    }
    // plates for the slots
    const slots = counterSlots();
    for (let i = 0; i < slots; i++) {
      const sx = slotX(i);
      ellipse(ctx, sx, a.y + 31, 13, 8, "rgba(60,30,15,0.25)");
      ellipse(ctx, sx, a.y + 28, 13, 8, P.cream);
      ellipse(ctx, sx, a.y + 28, 9, 5, "rgba(0,0,0,0.06)");
    }
    for (const s of S.counter) {
      emoji(ITEMS[s.item].emoji, slotX(s.slot), a.y + 24, 22);
      if (s.item === "coffee") drawSteam(slotX(s.slot), a.y + 12, 2, 0.8);
    }
    // tip jar on the left end
    const jx = a.x + 14;
    const jy = a.y + 4;
    ctx.fillStyle = "rgba(60,30,15,0.2)";
    ellipse(ctx, jx, jy + 16, 8, 3, "rgba(60,30,15,0.2)");
    ctx.fillStyle = "rgba(190,225,240,0.75)";
    roundRect(jx - 7, jy, 14, 16, 4);
    ctx.fill();
    ellipse(ctx, jx - 2, jy + 12, 4, 2.2, "#f2c14e");
    ellipse(ctx, jx + 2, jy + 10, 4, 2.2, "#ffd76a");
    ellipse(ctx, jx, jy + 7, 4, 2.2, "#f2c14e");
    ctx.fillStyle = P.chromeMid;
    roundRect(jx - 8, jy - 3, 16, 4, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(jx - 5, jy + 2, 2, 11);
    sparkle(jx + 8, jy - 2, 4, (Math.sin(now / 350) + 1) / 2);
    sparkle(jx - 9, jy + 6, 3, (Math.sin(now / 350 + 2.1) + 1) / 2);
    // cake stand on the right end
    const cx = a.x + a.w - 16;
    const cy = a.y + 16;
    ellipse(ctx, cx, cy + 4, 11, 3.5, "rgba(60,30,15,0.2)");
    ctx.fillStyle = P.chromeMid;
    ctx.fillRect(cx - 1.5, cy - 4, 3, 7);
    ellipse(ctx, cx, cy + 3, 8, 2.5, P.chrome);
    ellipse(ctx, cx, cy - 4, 11, 3, P.chrome);
    ctx.fillStyle = "#f28cab";
    roundRect(cx - 7, cy - 13, 14, 9, 2);
    ctx.fill();
    ctx.fillStyle = "#fff0f4";
    roundRect(cx - 7, cy - 14, 14, 4, 2);
    ctx.fill();
    ellipse(ctx, cx, cy - 15, 2, 2, "#e0403f");
    ctx.fillStyle = "rgba(200,235,245,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 12, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 6, 8, Math.PI * 1.15, Math.PI * 1.55);
    ctx.stroke();

    ctx.font = "bold 10px " + UI_FONT;
    ctx.fillStyle = "rgba(255,240,220,0.7)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(a.label, a.x + a.w / 2, a.y + a.h - 6);
    if (highlighted) outline(a);
  }

  function outline(a) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    roundRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4, 8);
    ctx.stroke();
  }

  function drawProgress(cx, cy, r, frac) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9b4a";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawReadyItem(it, cx, cy) {
    const bounce = Math.sin(performance.now() / 180) * 3;
    ctx.save();
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 14;
    emoji(it.emoji, cx, cy + bounce, 24);
    ctx.restore();
  }

  function drawEspresso(a, highlighted) {
    const it = ITEMS[a.makes];
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const side = a.x <= 0 ? 1 : -1; // which way the room is
    const now = performance.now();
    ctx.fillStyle = "rgba(60,30,15,0.3)";
    roundRect(a.x + 4, a.y + 6, a.w - 6, a.h - 6, 8);
    ctx.fill();
    const body = ctx.createLinearGradient(a.x, 0, a.x + a.w, 0);
    body.addColorStop(0, side > 0 ? P.chromeMid : P.chrome);
    body.addColorStop(0.5, "#f4f6f8");
    body.addColorStop(1, side > 0 ? P.chrome : P.chromeMid);
    ctx.fillStyle = body;
    roundRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4, 8);
    ctx.fill();
    // top band with knobs and a light
    ctx.fillStyle = P.chromeDark;
    roundRect(a.x + 5, a.y + 5, a.w - 10, 18, 5);
    ctx.fill();
    ellipse(ctx, cx - 9, a.y + 14, 4, 4, "#2b2f36");
    ellipse(ctx, cx + 9, a.y + 14, 4, 4, "#2b2f36");
    const light = a.state === "working" ? (Math.sin(now / 150) > 0 ? "#ff5a4a" : "#a83a30") : a.state === "ready" ? "#6de07a" : "#5a6a40";
    ellipse(ctx, cx, a.y + 14, 3, 3, light);
    // group head and portafilter handle poking into the room
    ctx.fillStyle = "#3a3f47";
    roundRect(cx - 12, a.y + 30, 24, 12, 4);
    ctx.fill();
    ctx.fillStyle = "#2b2f36";
    roundRect(cx + side * 8 - 4, a.y + 34, 8, 5, 2);
    ctx.fill();
    ctx.fillStyle = "#4a3728";
    roundRect(cx + side * 10, a.y + 33, side * 16, 6, 3);
    ctx.fill();
    // steam wand
    ctx.strokeStyle = P.chromeDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - side * 14, a.y + 24);
    ctx.lineTo(cx - side * 17, a.y + 48);
    ctx.stroke();
    // drip tray and cup
    ctx.fillStyle = P.chromeDark;
    roundRect(a.x + 6, a.y + a.h - 14, a.w - 12, 8, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    roundRect(a.x + 8, a.y + 46, a.w - 16, a.h - 62, 6);
    ctx.fill();
    if (a.state === "idle") {
      ctx.globalAlpha = 0.5;
      emoji(it.emoji, cx, cy + 8, 20);
      ctx.globalAlpha = 1;
    } else if (a.state === "working") {
      emoji(it.emoji, cx, cy + 10, 18);
      drawProgress(cx, cy - 4, 9, Math.min(1, a.t / cookTime(a.makes)));
      drawSteam(cx, cy + 2, 3, 0.9);
    } else {
      drawReadyItem(it, cx, cy + 6);
      drawSteam(cx, cy - 6, 3, 1);
    }
    ctx.font = "bold 10px " + UI_FONT;
    ctx.fillStyle = "rgba(40,30,25,0.7)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.save();
    ctx.translate(a.x + (side > 0 ? 12 : a.w - 12), a.y + a.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(a.label, 0, 0);
    ctx.restore();
    if (highlighted) outline(a);
  }

  function drawOven(a, highlighted) {
    const it = ITEMS[a.makes];
    const cx = a.x + a.w / 2;
    const now = performance.now();
    const enamel = a.makes === "cookie" ? "#f0a24c" : "#9c5a45";
    const enamelDark = a.makes === "cookie" ? "#c47b2e" : "#6e3d2e";
    ctx.fillStyle = "rgba(60,30,15,0.3)";
    roundRect(a.x + 5, a.y + 4, a.w - 8, a.h - 4, 8);
    ctx.fill();
    ctx.fillStyle = enamel;
    roundRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    roundRect(a.x + 5, a.y + 4, a.w - 10, 4, 2);
    ctx.fill();
    ctx.fillStyle = enamelDark;
    roundRect(a.x + 2, a.y + a.h - 12, a.w - 4, 10, 6);
    ctx.fill();
    // knobs along the top
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, a.x + 18 + i * 14, a.y + 11, 3.5, 3.5, "#2b2f36");
      ellipse(ctx, a.x + 18 + i * 14, a.y + 10, 1.2, 1.2, "#ddd");
    }
    ellipse(ctx, a.x + a.w - 14, a.y + 11, 3, 3, a.state === "working" ? "#ff5a4a" : "#6a3a30");
    // glass door with a warm glow when it is on
    ctx.fillStyle = "#2a201c";
    roundRect(a.x + 10, a.y + 16, a.w - 20, 22, 4);
    ctx.fill();
    if (a.state === "working") {
      const glow = ctx.createRadialGradient(cx, a.y + 34, 2, cx, a.y + 30, 34);
      glow.addColorStop(0, "rgba(255,170,70," + (0.6 + 0.2 * Math.sin(now / 200)) + ")");
      glow.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = glow;
      roundRect(a.x + 10, a.y + 16, a.w - 20, 22, 4);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(a.x + 13, a.y + 18, a.w - 26, 5, 2);
    ctx.fill();
    ctx.fillStyle = P.chrome;
    roundRect(a.x + 14, a.y + 14, a.w - 28, 3, 1.5);
    ctx.fill();
    if (a.state === "idle") {
      ctx.globalAlpha = 0.45;
      emoji(it.emoji, cx, a.y + 28, 18);
      ctx.globalAlpha = 1;
    } else if (a.state === "working") {
      emoji(it.emoji, cx - 10, a.y + 28, 18);
      drawProgress(cx + 18, a.y + 27, 8, Math.min(1, a.t / cookTime(a.makes)));
    } else {
      drawReadyItem(it, cx, a.y + 26);
    }
    ctx.font = "bold 10px " + UI_FONT;
    ctx.fillStyle = "rgba(255,240,220,0.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(a.label, cx, a.y + a.h - 3);
    if (highlighted) outline(a);
  }

  function drawBin(a, highlighted) {
    const cx = a.x + a.w / 2;
    ellipse(ctx, cx, a.y + a.h - 4, 17, 5, "rgba(60,30,15,0.3)");
    const body = ctx.createLinearGradient(a.x, 0, a.x + a.w, 0);
    body.addColorStop(0, P.chromeDark);
    body.addColorStop(0.45, P.chrome);
    body.addColorStop(1, P.chromeDark);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(a.x + 8, a.y + 12);
    ctx.lineTo(a.x + a.w - 8, a.y + 12);
    ctx.lineTo(a.x + a.w - 11, a.y + a.h - 6);
    ctx.lineTo(a.x + 11, a.y + a.h - 6);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, cx, a.y + 12, 17, 5, P.chromeMid);
    ellipse(ctx, cx, a.y + 10, 17, 5, "#5f6a75");
    ctx.fillStyle = "#4a535d";
    roundRect(cx - 5, a.y + 3, 10, 5, 2);
    ctx.fill();
    ctx.fillStyle = "#3b434c";
    roundRect(cx - 7, a.y + a.h - 8, 14, 4, 2);
    ctx.fill();
    if (highlighted) outline(a);
  }

  function drawAppliance(a, highlighted) {
    if (a.kind === "counter") drawCounter(a, highlighted);
    else if (a.kind === "bin") drawBin(a, highlighted);
    else if (a.h > a.w) drawEspresso(a, highlighted);
    else drawOven(a, highlighted);
  }

  // mood: 0 happy, 1 fine, 2 worried, 3 angry
  function drawFace(x, y, fx, fy, mood) {
    const r = 13;
    ellipse(ctx, x, y, r, r, P.skin);
    // cheeks
    ellipse(ctx, x - 7, y + 4, 3, 2, "rgba(240,120,120,0.35)");
    ellipse(ctx, x + 7, y + 4, 3, 2, "rgba(240,120,120,0.35)");
    // eyes
    const ex = fx * 1.5;
    const ey = fy * 1.5;
    for (const s of [-1, 1]) {
      ellipse(ctx, x + s * 4.5, y - 1, 2.6, 3.2, "#ffffff");
      ellipse(ctx, x + s * 4.5 + ex, y - 1 + ey, 1.6, 2, "#2a1f1a");
      ellipse(ctx, x + s * 4.5 + ex - 0.6, y - 2 + ey, 0.6, 0.6, "#ffffff");
    }
    // brows
    if (mood >= 2) {
      ctx.strokeStyle = "#3a2a20";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * 7, y - 6 + (mood === 3 ? 1 : 0));
        ctx.lineTo(x + s * 2, y - 5 + (mood === 3 ? -1.5 : 1));
        ctx.stroke();
      }
    }
    // mouth
    ctx.strokeStyle = "#7a3a30";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (mood === 0) {
      ctx.arc(x, y + 4, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (mood === 1) {
      ctx.arc(x, y + 4.5, 3, 0.2 * Math.PI, 0.8 * Math.PI);
    } else if (mood === 2) {
      ctx.moveTo(x - 3, y + 6);
      ctx.lineTo(x + 3, y + 6);
    } else {
      ctx.arc(x, y + 9, 4, 1.2 * Math.PI, 1.8 * Math.PI);
    }
    ctx.stroke();
  }

  function drawHair(x, y, color, style) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 2, 13.5, Math.PI, Math.PI * 2);
    ctx.fill();
    if (style === 0) {
      // fringe
      for (let i = 0; i < 3; i++) ellipse(ctx, x - 7 + i * 7, y - 6, 4.5, 3.5, color);
    } else if (style === 1) {
      // bun
      ellipse(ctx, x, y - 15, 5.5, 5, color);
      ellipse(ctx, x - 8, y - 5, 4, 3, color);
      ellipse(ctx, x + 8, y - 5, 4, 3, color);
    } else if (style === 2) {
      // long hair down the sides
      ctx.fillRect(x - 13.5, y - 3, 6, 14);
      ctx.fillRect(x + 7.5, y - 3, 6, 14);
      ellipse(ctx, x, y - 7, 9, 3, color);
    } else {
      // short spiky
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 10 + i * 6, y - 8);
        ctx.lineTo(x - 7 + i * 6, y - 18);
        ctx.lineTo(x - 4 + i * 6, y - 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Shared chunky body for the player, the helper and customers.
  function drawPerson(p, look, items, name, mood) {
    const bob = p.walk ? Math.abs(Math.sin(p.walk)) * 3 : 0;
    const y = p.y - bob;
    const step = p.walk ? Math.sin(p.walk) * 3 : 0;
    // shadow and feet
    ellipse(ctx, p.x, p.y + 13, 15, 6, "rgba(60,30,15,0.32)");
    ellipse(ctx, p.x - 6, p.y + 12 + step * 0.4, 5, 3, look.shoes || "#4a3226");
    ellipse(ctx, p.x + 6, p.y + 12 - step * 0.4, 5, 3, look.shoes || "#4a3226");
    // body
    ctx.fillStyle = look.shirt;
    roundRect(p.x - 15, y - 8, 30, 32, 11);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    roundRect(p.x - 15, y + 12, 30, 12, 8);
    ctx.fill();
    if (look.apron) {
      ctx.fillStyle = look.apron;
      roundRect(p.x - 10, y + 1, 20, 22, 6);
      ctx.fill();
      ctx.strokeStyle = look.apron;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, y + 2);
      ctx.lineTo(p.x - 9, y - 6);
      ctx.moveTo(p.x + 6, y + 2);
      ctx.lineTo(p.x + 9, y - 6);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      roundRect(p.x - 5, y + 12, 10, 6, 2);
      ctx.fill();
    }
    // arms
    ctx.strokeStyle = P.skin;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (items.length) {
      ctx.moveTo(p.x - 13, y + 2);
      ctx.lineTo(p.x - 11, y - 14);
      ctx.moveTo(p.x + 13, y + 2);
      ctx.lineTo(p.x + 11, y - 14);
    } else {
      ctx.moveTo(p.x - 13, y + 2);
      ctx.lineTo(p.x - 15, y + 12 + step);
      ctx.moveTo(p.x + 13, y + 2);
      ctx.lineTo(p.x + 15, y + 12 - step);
    }
    ctx.stroke();
    // head
    drawFace(p.x, y - 14, p.fx, p.fy, mood);
    drawHair(p.x, y - 14, look.hair, look.style);
    if (name) {
      ctx.font = "bold 10px " + UI_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(60,30,15,0.5)";
      ctx.strokeText(name, p.x, y + 38);
      ctx.fillStyle = "#fff4e0";
      ctx.fillText(name, p.x, y + 38);
    }
    if (items.length) {
      const n = items.length;
      const gap = 24;
      const x0 = p.x - ((n - 1) * gap) / 2;
      if (n > 1 || carryCap() > 1) {
        ctx.fillStyle = P.woodDark;
        roundRect(x0 - 17, y - 27, (n - 1) * gap + 34, 9, 4);
        ctx.fill();
        ctx.fillStyle = P.woodLight;
        roundRect(x0 - 16, y - 28, (n - 1) * gap + 32, 6, 3);
        ctx.fill();
      }
      items.forEach((it, i) => {
        const x = x0 + i * gap;
        ellipse(ctx, x, y - 36, 13, 13, "rgba(60,30,15,0.2)");
        ellipse(ctx, x, y - 38, 13, 13, P.cream);
        emoji(ITEMS[it].emoji, x, y - 37, 18);
        if (it === "coffee") drawSteam(x, y - 48, 2, 0.7);
      });
    }
  }

  const PLAYER_LOOK = { shirt: P.teal, apron: "#fff1dc", hair: "#5a3a22", style: 1, shoes: "#3b2a22" };
  const HELPER_LOOK = { shirt: P.terracotta, apron: "#fff1dc", hair: "#2b2b34", style: 3, shoes: "#3b2a22" };

  function drawPlayer() {
    drawPerson(S.player, PLAYER_LOOK, S.player.tray, null, 0);
  }

  function drawHelper() {
    const h = S.helper;
    if (!h) return;
    drawPerson(h, HELPER_LOOK, h.carry ? [h.carry] : [], "Sam", 0);
  }

  function drawCustomer(c) {
    const alpha = c.leaving ? Math.max(0, 1 - c.leaveT / 0.8) : 1;
    const lift = c.leaving ? c.leaveT * 30 : 0;
    const y = TILE * 1.45 - lift + Math.sin(c.bob) * 1.5;
    const frac = c.patience / c.maxPatience;
    const mood = c.leaving ? (c.happy ? 0 : 3) : frac > 0.55 ? 0 : frac > 0.3 ? 1 : frac > 0.15 ? 2 : 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    const look = { shirt: c.shirt, apron: null, hair: c.hair || "#3b2417", style: c.style || 0, shoes: "#3b2a22" };
    drawPerson({ x: c.x, y: y + 8, fx: 0, fy: 0.6, walk: 0 }, look, [], null, mood);

    if (!c.leaving) {
      const n = c.order.length;
      const gap = maxCustomers() > 5 ? 22 : 26; // tighter bubbles when the queue is longer
      const bw = 18 + n * gap;
      const bx = c.x - bw / 2;
      const by = TILE * 0.05;
      ctx.fillStyle = "rgba(60,30,15,0.25)";
      roundRect(bx + 2, by + 3, bw, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#fffaf0";
      roundRect(bx, by, bw, 34, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c.x - 6, by + 33);
      ctx.lineTo(c.x + 6, by + 33);
      ctx.lineTo(c.x, by + 41);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(200,150,110,0.6)";
      ctx.lineWidth = 1.5;
      roundRect(bx, by, bw, 34, 10);
      ctx.stroke();
      c.order.forEach((o, i) => {
        const ix = bx + 9 + gap / 2 + i * gap;
        ctx.globalAlpha = alpha * (o.done ? 0.3 : 1);
        emoji(ITEMS[o.item].emoji, ix, by + 17, gap > 22 ? 20 : 18);
        if (o.done) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "#3fae62";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ix - 8, by + 18);
          ctx.lineTo(ix - 2, by + 24);
          ctx.lineTo(ix + 9, by + 10);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = alpha;
      const f = Math.max(0, frac);
      const pw = 40;
      ctx.fillStyle = "rgba(60,30,15,0.45)";
      roundRect(c.x - pw / 2, by + 44, pw, 7, 3.5);
      ctx.fill();
      ctx.fillStyle = f > 0.5 ? "#6cc46c" : f > 0.25 ? "#e8b84c" : "#e0584a";
      roundRect(c.x - pw / 2 + 1, by + 45, Math.max(1, (pw - 2) * f), 5, 2.5);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPrompt(a) {
    const text = promptFor(a);
    if (!text) return;
    const p = S.player;
    ctx.font = "bold 12px " + UI_FONT;
    const tw = ctx.measureText(text).width + 26;
    const x = Math.max(4, Math.min(W - tw - 4, p.x - tw / 2));
    const y = Math.min(H - 28, p.y + 22);
    ctx.fillStyle = "rgba(40,22,14,0.88)";
    roundRect(x, y, tw, 22, 8);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd166";
    ctx.fillText("E", x + 9, y + 11);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + 22, y + 11);
  }

  function drawFloats() {
    for (const f of S.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.font = "bold 15px " + UI_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(50,25,10,0.75)";
      ctx.strokeText(f.text, f.x, f.y - f.t * 28);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 28);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ensureBackground();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    drawStringLights();
    const target = S.running ? nearestTarget() : null;
    for (const a of APPLIANCES) drawAppliance(a, a === target);
    for (const c of S.customers) drawCustomer(c);
    // Draw whoever is lower on screen last so they overlap naturally.
    if (S.helper && S.helper.y < S.player.y) {
      drawHelper();
      drawPlayer();
    } else {
      drawPlayer();
      drawHelper();
    }
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

  // ---------- flow ----------
  function startShift() {
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
    overlayBody.innerHTML =
      intro +
      "<ul><li><b>" + S.served + "</b> customers served</li>" +
      "<li><b>" + S.coins + "</b> coins earned" + (bonus ? " + <b>" + bonus + "</b> closing bonus" : "") + "</li>" +
      "<li>Shift lasted <b>" + clock(S.time) + "</b></li>" +
      "<li>Bank: <b>" + save.bank + "</b> coins to spend in the shop</li>" +
      record + "</ul>";
    btnStart.textContent = "Visit the shop";
    btnShop.hidden = true;
    openPopup(overlay, openShop);
    btnStart.onclick = openShop;
  }

  function showIntro() {
    overlayTitle.textContent = save.day > 1 || save.bank > 0 ? "Welcome back" : "Opening time";
    const status = save.day > 1 || save.bank > 0
      ? "<p>You are on <b>day " + save.day + "</b> with <b>" + save.bank + "</b> coins in the bank. Spend them in the shop between shifts.</p>"
      : "";
    overlayBody.innerHTML =
      status +
      "<p>Customers queue at the counter with an order in their speech bubble. Make each item at the right appliance, then put it on the counter. Matching items are taken straight away.</p>" +
      "<ul>" +
      "<li><b>Move</b> with WASD or the arrow keys.</li>" +
      "<li><b>Use</b> an appliance or the counter with <kbd>E</kbd> or <kbd>Space</kbd>.</li>" +
      "<li><b>☕ Coffee</b> from the espresso machines, <b>🍪 cookies</b> and <b>🍫 brownies</b> from the ovens.</li>" +
      "<li>Each day lasts 90 seconds. Faster service means bigger tips. Three walkouts and the day ends early.</li>" +
      "<li>Earnings go in the bank. Spend them on upgrades between days; every day gets busier.</li>" +
      "</ul>";
    btnStart.textContent = save.day > 1 ? "Start day " + save.day : "Open the cafe";
    btnStart.onclick = startShift;
    btnShop.hidden = false;
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

  function buyIndex(i) {
    if (UPGRADES[i]) buy(UPGRADES[i]);
  }

  function dayPreview() {
    const d = save.day;
    const p0 = (d - 1) * 0.9;
    const items = p0 < 0.7 ? "single-item orders to start" : p0 < 2.4 ? "orders of up to 2 items from the start" : "orders of up to 3 items from the start";
    const every = Math.max(2.0, 7.5 - p0 * 1.3).toFixed(1);
    return "Day " + d + ": a customer roughly every " + every + "s, " + items + ", patience " + Math.round(Math.max(15, 42 - p0 * 4.5) * patienceMult()) + "s+.";
  }

  function renderShop() {
    shopBank.textContent = save.bank;
    shopGrid.innerHTML = "";
    UPGRADES.forEach((u, i) => {
      const l = lvl(u.id);
      const maxed = l >= u.max;
      const cost = upgradeCost(u);
      const card = document.createElement("div");
      card.className = "up" + (maxed ? " maxed" : save.bank >= cost ? " afford" : "");
      let pips = "";
      for (let k = 0; k < u.max; k++) pips += '<i class="' + (k < l ? "on" : "") + '"></i>';
      card.innerHTML =
        '<div class="up-head"><span class="up-icon">' + u.icon + "</span><span class=\"up-name\">" + u.name + '</span><span class="up-key">' + (i + 1) + "</span></div>" +
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

    if (popup) {
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
  });

  btnStart.addEventListener("click", () => {
    if (typeof btnStart.onclick !== "function") startShift();
  });
  btnShop.addEventListener("click", openShop);
  btnNext.addEventListener("click", startShift);
  btnReset.addEventListener("click", resetProgress);

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
    if (popup) {
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
    upgrades: UPGRADES,
    cost: upgradeCost
  };

  // ---------- loop ----------
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
