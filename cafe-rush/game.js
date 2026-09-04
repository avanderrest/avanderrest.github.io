(() => {
  "use strict";

  // ---------- constants ----------
  const TILE = 48;
  const COLS = 16;
  const ROWS = 11;
  const W = COLS * TILE;
  const H = ROWS * TILE;

  const MAX_CUSTOMERS = 4;
  const COUNTER_SLOTS = 8;
  const MAX_STRIKES = 3;
  const PLAYER_SPEED = 200;
  const REACH = 18;
  const BEST_KEY = "cafe-rush-best";

  const ITEMS = {
    coffee: { name: "coffee", emoji: "☕", time: 2.5, price: 3, verb: "Brew" },
    cookie: { name: "cookies", emoji: "🍪", time: 4.0, price: 2, verb: "Bake" },
    brownie: { name: "brownies", emoji: "🍫", time: 5.5, price: 4, verb: "Bake" }
  };
  const ORDER_POOL = ["coffee", "coffee", "coffee", "cookie", "cookie", "brownie"];
  const FACES = ["😊", "🙂", "😄", "🤓", "😎", "🥰", "😌", "🧐"];
  const SHIRTS = ["#5b8def", "#e06c9f", "#4fb286", "#f0a35e", "#9b7bd8", "#e2c04e"];

  const COUNTER = { kind: "counter", x: 3 * TILE, y: 2 * TILE, w: 10 * TILE, h: TILE, label: "Counter", color: "#a8703f" };
  const APPLIANCES = [
    COUNTER,
    { kind: "maker", makes: "coffee", x: 0, y: 4 * TILE, w: TILE, h: 2 * TILE, label: "Espresso", color: "#6f5590" },
    { kind: "maker", makes: "coffee", x: 0, y: 7 * TILE, w: TILE, h: 2 * TILE, label: "Espresso", color: "#6f5590" },
    { kind: "maker", makes: "cookie", x: 4 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Cookie oven", color: "#c07a35" },
    { kind: "maker", makes: "brownie", x: 10 * TILE, y: 10 * TILE, w: 2 * TILE, h: TILE, label: "Brownie oven", color: "#6a3b2a" },
    { kind: "bin", x: 15 * TILE, y: 6 * TILE, w: TILE, h: TILE, label: "Bin", color: "#4e555e" }
  ];
  // Rows 0 and 1 are the customer side of the counter. The player never crosses it.
  const SOLIDS = [{ x: 0, y: 0, w: W, h: 2 * TILE }].concat(APPLIANCES);

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
    best: $("hud-best"),
    msg: $("hud-msg")
  };
  const overlay = $("overlay");
  const overlayTitle = $("overlay-title");
  const overlayBody = $("overlay-body");
  const btnStart = $("btn-start");

  // ---------- state ----------
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    best = 0;
  }

  let S = null;
  let msgTimer = 0;

  function reset() {
    S = {
      running: false,
      over: false,
      time: 0,
      coins: 0,
      served: 0,
      strikes: 0,
      spawnTimer: 1.5,
      nextId: 1,
      customers: [],
      counter: [],
      floats: [],
      player: { x: W / 2, y: 6 * TILE, r: 14, fx: 0, fy: 1, held: null, walk: 0 }
    };
    for (const a of APPLIANCES) {
      a.state = "idle";
      a.t = 0;
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

  function refreshHud() {
    hud.coins.textContent = S.coins;
    hud.served.textContent = S.served;
    const m = Math.floor(S.time / 60);
    const s = Math.floor(S.time % 60).toString().padStart(2, "0");
    hud.time.textContent = m + ":" + s;
    hud.strikes.textContent = "♥".repeat(MAX_STRIKES - S.strikes) + "♡".repeat(S.strikes);
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

  // ---------- customers ----------
  function spawnCustomer() {
    const t = S.time;
    const maxItems = t < 30 ? 1 : t < 80 ? 2 : 3;
    const count = 1 + Math.floor(Math.random() * maxItems);
    const order = [];
    for (let i = 0; i < count; i++) {
      order.push({ item: ORDER_POOL[Math.floor(Math.random() * ORDER_POOL.length)], done: false });
    }
    const base = Math.max(22, 42 - t / 8);
    const patience = base + count * 7;
    S.customers.push({
      id: S.nextId++,
      order: order,
      patience: patience,
      maxPatience: patience,
      face: FACES[Math.floor(Math.random() * FACES.length)],
      shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
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
    return COUNTER.x + (idx + 0.5) * (COUNTER.w / MAX_CUSTOMERS);
  }

  function fulfil(c, entry) {
    entry.done = true;
    addFloat(c.x, TILE * 1.2, "✓", "#9be79b");
    if (c.order.every((o) => o.done)) {
      const total = c.order.reduce((sum, o) => sum + ITEMS[o.item].price, 0);
      const tip = Math.round((c.patience / c.maxPatience) * 3);
      S.coins += total + tip;
      S.served++;
      c.leaving = true;
      c.happy = true;
      addFloat(c.x, TILE * 0.8, "+" + (total + tip) + (tip > 0 ? " (tip " + tip + ")" : ""), "#ffd166");
      if (S.coins > best) {
        best = S.coins;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch (e) {
          /* storage unavailable */
        }
      }
      refreshHud();
    }
  }

  // Hand anything sitting on the counter to a customer who wants it.
  function matchCounter() {
    for (let i = S.counter.length - 1; i >= 0; i--) {
      const slot = S.counter[i];
      const c = activeCustomers().find((cu) => cu.order.some((o) => o.item === slot.item && !o.done));
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
    if (S.strikes >= MAX_STRIKES) endShift();
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
    for (let i = 0; i < COUNTER_SLOTS; i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  function slotX(i) {
    return COUNTER.x + (i + 0.5) * (COUNTER.w / COUNTER_SLOTS);
  }

  function promptFor(a) {
    const held = S.player.held;
    if (a.kind === "maker") {
      const it = ITEMS[a.makes];
      if (a.state === "ready") return held ? "Hands full" : "Take " + it.name;
      if (a.state === "working") return "Cooking...";
      return held ? "Hands full" : it.verb + " " + it.name;
    }
    if (a.kind === "counter") {
      if (held) return "Place " + ITEMS[held].name;
      return S.counter.length ? "Pick up from counter" : "Counter";
    }
    if (a.kind === "bin") return held ? "Bin the " + ITEMS[held].name : "Bin";
    return "";
  }

  function interact() {
    if (!S.running) return;
    const a = nearestTarget();
    const p = S.player;
    if (!a) return;

    if (a.kind === "maker") {
      const it = ITEMS[a.makes];
      if (a.state === "idle") {
        if (p.held) {
          say("Your hands are full. Put that down first.");
          return;
        }
        a.state = "working";
        a.t = 0;
        say(it.verb + "ing " + it.name + "...", 1200);
      } else if (a.state === "working") {
        say("Still cooking. Give it a moment.", 1200);
      } else if (a.state === "ready") {
        if (p.held) {
          say("Your hands are full.");
          return;
        }
        p.held = a.makes;
        a.state = "idle";
        a.t = 0;
      }
      return;
    }

    if (a.kind === "counter") {
      if (p.held) {
        const item = p.held;
        const c = activeCustomers().find((cu) => cu.order.some((o) => o.item === item && !o.done));
        if (c) {
          p.held = null;
          fulfil(c, c.order.find((o) => o.item === item && !o.done));
        } else {
          const slot = freeSlot();
          if (slot < 0) {
            say("The counter is full.");
            return;
          }
          S.counter.push({ item: item, slot: slot });
          p.held = null;
          say("Nobody wants " + ITEMS[item].name + " yet. It waits on the counter.", 1600);
        }
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
        p.held = nearest.item;
        S.counter.splice(S.counter.indexOf(nearest), 1);
      }
      return;
    }

    if (a.kind === "bin" && p.held) {
      say("Binned the " + ITEMS[p.held].name + ".", 1200);
      p.held = null;
    }
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
      moveAxis(p, dx * PLAYER_SPEED * dt, 0);
      moveAxis(p, 0, dy * PLAYER_SPEED * dt);
    } else {
      p.walk = 0;
    }

    for (const a of APPLIANCES) {
      if (a.kind === "maker" && a.state === "working") {
        a.t += dt;
        if (a.t >= ITEMS[a.makes].time) {
          a.state = "ready";
          a.t = 0;
        }
      }
    }

    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      if (activeCustomers().length < MAX_CUSTOMERS) spawnCustomer();
      S.spawnTimer = Math.max(3.5, 9 - S.time / 25) * (0.8 + Math.random() * 0.4);
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
      if (c.patience <= 0) walkOut(c);
    }

    refreshHud();
  }

  // ---------- drawing ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function emoji(text, x, y, size) {
    ctx.font = size + "px " + EMOJI_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(text, x, y);
  }

  function drawFloor() {
    ctx.fillStyle = "#2f2621";
    ctx.fillRect(0, 0, W, 2 * TILE);
    ctx.fillStyle = "#3f5f78";
    ctx.fillRect(TILE * 0.5, TILE * 0.25, W - TILE, TILE * 0.55);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let x = TILE * 0.5; x < W - TILE * 0.5; x += TILE * 2) {
      ctx.fillRect(x + TILE * 0.2, TILE * 0.25, 6, TILE * 0.55);
    }
    for (let r = 2; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#4a3a2f" : "#54423a";
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
  }

  function drawAppliance(a, highlighted) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = a.color;
    roundRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4, 8);
    ctx.fill();
    ctx.restore();

    if (a.kind === "counter") {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(a.x + 2, a.y + 2, a.w - 4, 6);
      for (let i = 0; i < COUNTER_SLOTS; i++) {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.arc(slotX(i), a.y + a.h / 2 + 4, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of S.counter) emoji(ITEMS[s.item].emoji, slotX(s.slot), a.y + a.h / 2 + 2, 22);
    }

    if (a.kind === "maker") {
      const it = ITEMS[a.makes];
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      roundRect(a.x + 8, a.y + 8, a.w - 16, a.h - 16, 6);
      ctx.fill();
      if (a.state === "idle") {
        ctx.globalAlpha = 0.45;
        emoji(it.emoji, cx, cy, 20);
        ctx.globalAlpha = 1;
      } else if (a.state === "working") {
        const frac = Math.min(1, a.t / it.time);
        ctx.fillStyle = "#ff9b4a";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (let k = 0; k < 3; k++) {
          const ph = (performance.now() / 500 + k * 0.7) % 1;
          ctx.beginPath();
          ctx.arc(cx - 8 + k * 8, cy - 14 - ph * 14, 3 * (1 - ph) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const bounce = Math.sin(performance.now() / 180) * 3;
        ctx.save();
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 14;
        emoji(it.emoji, cx, cy + bounce, 24);
        ctx.restore();
      }
    }

    if (a.kind === "bin") emoji("🗑️", a.x + a.w / 2, a.y + a.h / 2, 22);

    ctx.font = "bold 10px " + UI_FONT;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (a.kind === "maker" && a.h > a.w) {
      ctx.save();
      ctx.translate(a.x + 12, a.y + a.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(a.label, 0, 0);
      ctx.restore();
    } else if (a.kind !== "bin") {
      ctx.fillText(a.label, a.x + a.w / 2, a.y + a.h - 6);
    }

    if (highlighted) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      roundRect(a.x + 2, a.y + 2, a.w - 4, a.h - 4, 8);
      ctx.stroke();
    }
  }

  function drawCustomer(c) {
    const alpha = c.leaving ? Math.max(0, 1 - c.leaveT / 0.8) : 1;
    const lift = c.leaving ? c.leaveT * 30 : 0;
    const y = TILE * 1.45 - lift + Math.sin(c.bob) * 1.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = c.shirt;
    roundRect(c.x - 16, y - 6, 32, 34, 10);
    ctx.fill();
    ctx.fillStyle = "#f4d3b0";
    ctx.beginPath();
    ctx.arc(c.x, y - 12, 13, 0, Math.PI * 2);
    ctx.fill();
    const mood = c.leaving && !c.happy ? "😡" : c.patience / c.maxPatience < 0.3 ? "😠" : c.face;
    emoji(mood, c.x, y - 11, 18);

    if (!c.leaving) {
      const n = c.order.length;
      const bw = 18 + n * 26;
      const bx = c.x - bw / 2;
      const by = TILE * 0.05;
      ctx.fillStyle = "#fff8ec";
      roundRect(bx, by, bw, 34, 9);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c.x - 6, by + 34);
      ctx.lineTo(c.x + 6, by + 34);
      ctx.lineTo(c.x, by + 41);
      ctx.closePath();
      ctx.fill();
      c.order.forEach((o, i) => {
        const ix = bx + 17 + i * 26;
        ctx.globalAlpha = alpha * (o.done ? 0.3 : 1);
        emoji(ITEMS[o.item].emoji, ix, by + 17, 20);
        if (o.done) {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "#3fae62";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ix - 8, by + 18);
          ctx.lineTo(ix - 2, by + 24);
          ctx.lineTo(ix + 9, by + 10);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = alpha;
      const frac = Math.max(0, c.patience / c.maxPatience);
      const pw = 40;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      roundRect(c.x - pw / 2, by + 44, pw, 6, 3);
      ctx.fill();
      ctx.fillStyle = frac > 0.5 ? "#6cc46c" : frac > 0.25 ? "#e8b84c" : "#e0584a";
      roundRect(c.x - pw / 2, by + 44, Math.max(1, pw * frac), 6, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = S.player;
    const bob = p.walk ? Math.abs(Math.sin(p.walk)) * 3 : 0;
    const y = p.y - bob;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 12, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b6b4f";
    roundRect(p.x - 14, y - 6, 28, 30, 9);
    ctx.fill();
    ctx.fillStyle = "#f1e3c8";
    roundRect(p.x - 9, y + 2, 18, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#f4d3b0";
    ctx.beginPath();
    ctx.arc(p.x, y - 12, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3a22";
    ctx.beginPath();
    ctx.arc(p.x, y - 15, 12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(p.x - 4 + p.fx * 2, y - 11 + p.fy * 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x + 4 + p.fx * 2, y - 11 + p.fy * 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    if (p.held) {
      ctx.fillStyle = "#fff8ec";
      ctx.beginPath();
      ctx.arc(p.x, y - 38, 15, 0, Math.PI * 2);
      ctx.fill();
      emoji(ITEMS[p.held].emoji, p.x, y - 37, 20);
    }
  }

  function drawPrompt(a) {
    const text = promptFor(a);
    if (!text) return;
    const p = S.player;
    ctx.font = "bold 12px " + UI_FONT;
    const tw = ctx.measureText(text).width + 26;
    const x = Math.max(4, Math.min(W - tw - 4, p.x - tw / 2));
    const y = Math.min(H - 28, p.y + 22);
    ctx.fillStyle = "rgba(20,13,10,0.85)";
    roundRect(x, y, tw, 22, 6);
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
      ctx.font = "bold 14px " + UI_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(f.text, f.x, f.y - f.t * 28);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 28);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawFloor();
    const target = S.running ? nearestTarget() : null;
    for (const a of APPLIANCES) drawAppliance(a, a === target);
    for (const c of S.customers) drawCustomer(c);
    drawPlayer();
    if (target) drawPrompt(target);
    drawFloats();
  }

  // ---------- flow ----------
  function startShift() {
    reset();
    S.running = true;
    overlay.hidden = true;
    say("Doors open. First customer incoming.", 2000);
  }

  function endShift() {
    S.running = false;
    S.over = true;
    overlayTitle.textContent = "Shift over";
    const m = Math.floor(S.time / 60);
    const s = Math.floor(S.time % 60).toString().padStart(2, "0");
    const record = S.coins >= best && S.coins > 0 ? "<li>A new best.</li>" : "<li>Best so far: <b>" + best + "</b></li>";
    overlayBody.innerHTML =
      "<p>Three customers walked out, so that is the shift done.</p><ul><li><b>" +
      S.served +
      "</b> customers served</li><li><b>" +
      S.coins +
      "</b> coins earned</li><li>Shift lasted <b>" +
      m + ":" + s +
      "</b></li>" + record + "</ul>";
    btnStart.textContent = "Try another shift";
    overlay.hidden = false;
  }

  // ---------- input ----------
  const keys = new Set();
  const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (MOVE_KEYS.has(k)) {
      keys.add(k);
      e.preventDefault();
    } else if (k === "e" || k === " ") {
      if (!S.running && !overlay.hidden) startShift();
      else interact();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(k);
  });
  window.addEventListener("blur", () => keys.clear());

  btnStart.addEventListener("click", startShift);

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
    if (!S.running && !overlay.hidden) startShift();
    else interact();
  });

  // ---------- loop ----------
  reset();
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
