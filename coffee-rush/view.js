/* Coffee Rush: the screen. Amber's painted room (assets/room.jpg) at three-quarter size,
   the machines on their cabinets, the customers from her character sheets, the HUD, the
   popups and the shop, rearranging the floor, and the keys. See sim.js for the rules. */
import { createCafe, CTR, CTR_SCALE, LIFT, TILE, ROOM_COLS, ROOM_ROWS, FLOOR_TOP, COUNTER_COL, DOOR, MACHINE_RISE, COLS, ROWS, W, H, BASE_CUSTOMERS, BASE_COUNTER_SLOTS, MAX_STRIKES, BASE_PLAYER_SPEED, CUSTOMER_SPEED, LEAVE_TIME, REACH, SHIFT_LENGTH, SAVE_VERSION, ITEMS, MACHINES, BASE_MACHINES, UNLOCKS, ITEM_WEIGHT, CUSTOMER_ART, MOODS, FACES, SHIRTS, HAIRS, UPGRADES, freshSave, clock } from './sim.js';
import { expose } from '../lib/debug.js';

  const keys = new Set();
  const POPUP_GRACE = 500; // ms of quiet before a popup accepts a confirm press
  const BEST_KEY = "coffee-rush-best";
  const SAVE_KEY = "coffee-rush-save";
  // The game lived in cafe-rush/ until 2026-09-24; carry its saved keys across once.
  [[SAVE_KEY, "cafe-rush-save"], [BEST_KEY, "cafe-rush-best"]].forEach(([now, was]) => {
    try {
      const old = localStorage.getItem(was);
      if (old !== null && localStorage.getItem(now) === null) localStorage.setItem(now, old);
      localStorage.removeItem(was);
    } catch (e) { /* storage blocked */ }
  });

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

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

  // The painted room has one shape; the window letterboxes around it.
  function relayout() { fitCanvas(); }

  // ---------- persistent progress ----------
  const bestSaved = (() => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } })();

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

  const save = loadSave();

  const cr = createCafe({ save, best: bestSaved, keys, on: onEvent });
  const {
    unlockedTypes, unlockedItems, unlockFor, machineList, machineSize, spotRect, rectsOverlap, spotFits, spotOk, makeAppliance, savedSpot, buildLayout, rebuildPool, standingPoint, blockedGrid, floodFill, startTile, layoutWorks, applianceRects, canStart, crateSlot, crateAt, freeSpawn, reset, say, addFloat, distToRect, circleHitsRect, activeCustomers, pressure, spawnInterval, spawnCustomer, queueSpot, wantsItem, steps, fulfil, matchCounter, walkOut, serveItem, nearestTarget, freeSlot, slotY, trayItemToPlace, fullWord, promptFor, interact, itemDemand, itemSupply, shortfall, worthFetching, counterSlotWith, besideCounter, deliverTask, pickHelperTask, helperTaskStale, updateHelper, moveAxis, update, endShift, buyUpgrade, shopUpgrades, lvl, upgradeCost, roomSpan, playerSpeed, carryCap, cookTime, patienceMult, maxTip, maxCustomers, counterSlots,
  } = cr;
  let msgTimer = 0;
  function onEvent(ev, d) {
    if (ev === 'say') {
      hud.msg.textContent = d.text;
      hud.msg.classList.add("on");
      msgTimer = (d.ms || 1800) / 1000;
    } else if (ev === 'save') persist();
    else if (ev === 'shift-over') onShiftOver(d);
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      localStorage.setItem(BEST_KEY, String(cr.best));
    } catch (e) {
      /* storage unavailable */
    }
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
    setStat(hud.coins, cr.S.coins);
    setStat(hud.served, cr.S.served);
    hud.time.textContent = clock(Math.max(0, Math.ceil(cr.S.timeLeft)));
    if (hud.timeBar) hud.timeBar.style.width = Math.max(0, Math.min(100, (cr.S.timeLeft / SHIFT_LENGTH) * 100)) + "%";
    if (hud.clock) hud.clock.classList.toggle("low", cr.S.running && cr.S.timeLeft <= 15);
    const hearts = MAX_STRIKES - cr.S.strikes + "/" + MAX_STRIKES;
    if (hud.strikes.textContent !== hearts) {
      hud.strikes.textContent = hearts;
      if (hud.hearts) {
        hud.hearts.classList.remove("hurt");
        void hud.hearts.offsetWidth;
        if (cr.S.strikes > 0) hud.hearts.classList.add("hurt");
      }
    }
    hud.day.textContent = cr.S.day;
    if (hud.cal) hud.cal.textContent = cr.S.day;
    setStat(hud.bank, save.bank);
    if (btnPause) btnPause.hidden = !cr.S.running || paused;
  }


  // ---------- drawing ----------
  // The room is Amber's painted plate (assets/room.jpg) and everything standing
  // in it is cut from her sheets into assets/art/ by
  // notes/coffee-rush-assets/cut.py. The view is front-on: a machine stands on a
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
  const FONT = '"Grandstander", "Segoe UI", system-ui, sans-serif';
  const PERSON_H = 128; // a grown-up, head to toe
  // Off the sheets, against the median grown-up on each: a5 is in a wheelchair.
  const HEIGHTS = { a2: 1.07, a5: 0.8, b0: 1.05, b4: 0.95, b5: 0.95, c3: 0.94, c4: 1.05, d1: 1.09, d4: 1.04 };
  const CAB_H = 86; // a cabinet, worktop to feet
  const CAB_TOP = 17; // where an appliance's feet land, down from the cabinet's top edge

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
    blend: { idle: "blender-idle", working: "blender-working", ready: "blender-ready", w: 30 },
    // Her Gemini sheet of 2026-09-26, registered so the machine stays put and
    // only its contents change (notes/coffee-rush-assets/slice-gemini.py).
    ice: { idle: "ice-idle", working: "ice-working", ready: "ice-ready", w: 50 },
    soup: { idle: "soup-idle", working: "soup-working", ready: "soup-ready", w: 84, dx: 3 },
    press: { idle: "press-idle", working: "press-working", ready: "press-ready", w: 76 }
  };
  // The shop's upgrade buttons show her icons; the turbo bolt did not come out
  // of the sheet, so it keeps its emoji.
  const UP_ART = new Set(["shoes", "tray", "espresso", "cookieOvens", "brownieOvens", "milkbar", "soupkettle",
    "breadOvens", "seating", "tables", "tips", "helper"]);

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
  // The chalkboard is lettered in Grandstander; letter it again once that has loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('700 13px "Grandstander"').then(() => {
      bgKey = "";
    }, () => {});
  }

  // Ask for everything up front so nothing pops in halfway through a shift.
  (function preload() {
    const names = ["cabinets/counter", "cabinets/double", "cabinets/single", "people/barista", "people/sam", "decor/cup-stack", "machines/jug-big", "decor/bin", "decor/crate"];
    for (const k in ITEMS) names.push("items/" + k);
    for (const k in LOOKS) {
      const l = LOOKS[k];
      for (const s of [l.idle, l.ready].concat(l.working)) names.push("machines/" + s);
    }
    for (const c of CUSTOMER_ART) for (const m of MOODS) names.push("people/" + c + m);
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
  // Amber's counter: its measurements (CTR, CTR_SCALE) live in sim.js, since where the
  // plates sit on it is a rule too.

  // Where the counter's pieces land on screen, for drawing and for the plates.
  function counterGeom(a, im) {
    const s = CTR_SCALE;
    const cx = a.x + a.w / 2;
    const left = cx - ((CTR.midFar + CTR.midNear) / 2) * s;
    const top = a.y - LIFT;
    const bottom = H + 4;
    const capH = CTR.cap * s;
    const frontH = (CTR.rows - CTR.lip) * s;
    const runTop = top + capH;
    const lipY = bottom - frontH;
    return { s, left, top, bottom, capH, frontH, runTop, lipY, w: im.naturalWidth * s };
  }

  // The worktop's centre at a height on screen, following its lean.
  function counterMidX(g, y) {
    const f = Math.max(0, Math.min(1, (y - g.runTop) / (g.lipY - g.runTop)));
    const m = CTR.midFar + (CTR.midNear - CTR.midFar) * f;
    return g.left + m * g.s;
  }

  function drawCounter(a, highlighted) {
    const im = art("cabinets/counter");
    if (!loaded(im)) { drawCounterDrawn(a, highlighted); return; }
    const g = counterGeom(a, im);
    const iw = im.naturalWidth;
    // a shadow on the floor, on the floor side
    ctx.fillStyle = "rgba(70,35,20,0.16)";
    ctx.beginPath();
    ctx.moveTo(g.left + 236 * g.s, a.y + 4);
    ctx.lineTo(g.left + 236 * g.s + 12, a.y + 10);
    ctx.lineTo(g.left + 218 * g.s + 12, g.bottom);
    ctx.lineTo(g.left + 212 * g.s, g.bottom);
    ctx.closePath();
    ctx.fill();
    // far end, the long top, the front
    ctx.drawImage(im, 0, 0, iw, CTR.cap, g.left, g.top, g.w, g.capH);
    ctx.drawImage(im, 0, CTR.cap, iw, CTR.lip - CTR.cap, g.left, g.runTop, g.w, g.lipY - g.runTop);
    ctx.drawImage(im, 0, CTR.lip, iw, im.naturalHeight - CTR.lip, g.left, g.lipY, g.w, g.frontH);
    // a plate for every place on the counter
    for (let i = 0; i < counterSlots(); i++) {
      const sy = slotY(i) - LIFT + 10;
      const cx = counterMidX(g, sy);
      ellipse(ctx, cx + 1, sy + 3, 17, 7, "rgba(70,35,20,0.25)");
      ctx.beginPath();
      ctx.ellipse(cx, sy, 17, 7.5, 0, 0, Math.PI * 2);
      inked(P.cream, 1.2);
      ellipse(ctx, cx, sy, 11, 4.5, "rgba(120,80,50,0.08)");
    }
    for (const s of cr.S.counter) {
      const sy = slotY(s.slot) - LIFT + 10;
      const cx = counterMidX(g, sy);
      drawItem(s.item, cx, sy - 10, 30);
      if (ITEMS[s.item].hot) drawSteam(cx, sy - 22, 2, 0.7);
    }
    if (highlighted) {
      // round the wooden top, leaning with it
      const half = (CTR.topW / 2 + 6) * g.s;
      const farX = g.left + CTR.midFar * g.s, nearX = g.left + CTR.midNear * g.s;
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(farX - half, g.top - 3);
      ctx.lineTo(farX + half, g.top - 3);
      ctx.lineTo(nearX + half, g.lipY + 4);
      ctx.lineTo(nearX - half, g.lipY + 4);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // The same counter drawn by hand, for the moment before the picture loads.
  function drawCounterDrawn(a, highlighted) {
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
    for (const s of cr.S.counter) {
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
    const pic = art("decor/bin");
    if (loaded(pic)) {
      ellipse(ctx, cx, base, 18, 5, "rgba(70,35,20,0.28)");
      if (highlighted) {
        ctx.save();
        ctx.shadowColor = "rgba(255,209,102,0.95)";
        ctx.shadowBlur = 14;
      }
      const r = drawArt(pic, cx, base + 1, 28);
      if (highlighted) ctx.restore();
      a.top = (r ? r.y : base - 43) - 8;
      return;
    }
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
    // Her art once it has loaded; until then, or if it never does, the
    // drawing in her style below.
    const drawn = { ice: drawIceWell, soup: drawSoupKettle, press: drawPress }[a.type];
    if (drawn && !loaded(lookFor(a).idle)) top = drawn(a, b);
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
    const look = LOOKS[m.type];
    const pic = m.type === "bin" ? null : look ? art("machines/" + look.idle) : null;
    const box = art("decor/crate");
    if (loaded(box)) {
      // her crate, taped shut; the machine's picture goes on its blank label
      const bw = Math.min(w, 46);
      const s = bw / box.naturalWidth;
      const bh = box.naturalHeight * s;
      ellipse(ctx, x + w / 2, bottom, bw / 2 + 3, 5, "rgba(70,35,20,0.25)");
      const left = x + w / 2 - bw / 2;
      ctx.drawImage(box, left, bottom - bh, bw, bh);
      const lx = left + bw * 0.245;
      const ly = bottom - bh + bh * 0.575;
      if (pic && loaded(pic)) {
        const ps = Math.min((bw * 0.2) / pic.naturalWidth, (bh * 0.19) / pic.naturalHeight);
        ctx.drawImage(pic, lx - (pic.naturalWidth * ps) / 2, ly - (pic.naturalHeight * ps) / 2, pic.naturalWidth * ps, pic.naturalHeight * ps);
      } else {
        ctx.font = "800 5px " + FONT;
        ctx.fillStyle = P.crateDark;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.type === "bin" ? "BIN" : (MACHINES[m.type].plaque || "").toUpperCase(), lx, ly, bw * 0.22);
      }
      return;
    }
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
  // A mood is a different picture of the same person at the same height.
  function drawPersonArt(name, p, mood) {
    let im = art("people/" + name + (mood || ""));
    if (!loaded(im)) im = art("people/" + name);
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
    const p = cr.S.player;
    const at = { x: p.x, y: p.y + FEET, walk: p.walk, fx: facing(p) };
    const bob = drawPersonArt("barista", at);
    drawCarried(at, p.tray, bob);
  }

  function drawHelper() {
    const h = cr.S.helper;
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

  // Happy while there's time, checking a watch past half, arms folded near the
  // end; served people leave happy, and anyone who walks out leaves cross.
  function mood(c, frac) {
    if (c.leaving) return c.happy ? MOODS[0] : MOODS[2];
    return frac > 0.5 ? MOODS[0] : frac > 0.22 ? MOODS[1] : MOODS[2];
  }

  function drawCustomer(c) {
    const alpha = c.leaving ? Math.max(0, 1 - c.leaveT / LEAVE_TIME) : Math.min(1, c.age * 4);
    const frac = c.patience / c.maxPatience;
    const fidget = !c.leaving && frac < 0.2 ? Math.sin(performance.now() / 45) * 1.3 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    // in the queue everyone faces the counter
    drawPersonArt(c.art, { x: c.x + fidget, y: c.y, walk: c.walk, fx: c.walk ? c.fx : 1 }, mood(c, frac));
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
    const p = cr.S.player;
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
    for (const f of cr.S.floats) {
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
    const target = cr.S.running ? nearestTarget() : null;
    drawCounter(cr.COUNTER, target === cr.COUNTER);
    // Everything that stands on the floor, back to front by where its feet are.
    const scene = [];
    for (const a of cr.APPLIANCES) if (a !== cr.COUNTER) scene.push({ y: a.y + a.h, draw: () => drawMachine(a, a === target) });
    cr.UNPLACED.forEach((m, i) => {
      if (drag && drag.unplaced && drag.a.id === m.id) return;
      const r = crateSlot(i);
      scene.push({ y: r.y + r.h - 0.1 * (cr.UNPLACED.length - i), draw: () => drawCrate(m, r) });
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
    for (const c of cr.S.customers) scene.push({ y: c.y, draw: () => drawCustomer(c) });
    scene.push({ y: cr.S.player.y + FEET, draw: drawPlayer });
    if (cr.S.helper) scene.push({ y: cr.S.helper.y + FEET, draw: drawHelper });
    scene.sort((p, q) => p.y - q.y);
    for (const s of scene) s.draw();
    for (const a of cr.APPLIANCES) drawMachineStatus(a);
    for (const c of cr.S.customers) if (!c.leaving) drawBubble(c);
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
    if (paused || !cr.S || !cr.S.running || popup || layoutMode) return;
    paused = true;
    $("pause-coins").textContent = cr.S.coins;
    $("pause-served").textContent = cr.S.served;
    $("pause-best").textContent = cr.best;
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
    const front = cr.APPLIANCES.filter((a) => a.movable).sort((p, q) => q.y + q.h - (p.y + p.h));
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
    cr.APPLIANCES.push(a);
    cr.SOLIDS.push(a);
    cr.UNPLACED = cr.UNPLACED.filter((u) => u.id !== m.id);
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
    for (const a of cr.APPLIANCES) {
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
    cr.S.running = true;
    say("Day " + cr.S.day + ". Doors open. First customer incoming.", 2000);
  }

  // the cafe has shut the doors; the page says how the day went
  function onShiftOver({ closedOnTime, completedDay, bonus }) {
    refreshHud();

    overlayTitle.textContent = closedOnTime ? "Closing time" : "Shift over";
    const intro = closedOnTime
      ? "<p>Day " + completedDay + " done and the doors are locked. Nice work.</p>"
      : "<p>Three customers walked out, so day " + completedDay + " ends early. You keep what you earned; give the day another go with better kit.</p>";
    const record = cr.S.coins >= cr.best && cr.S.coins > 0 ? "<li>A new best for a single day.</li>" : "<li>Best day so far: <b>" + cr.best + "</b> coins</li>";
    const arriving = closedOnTime && unlockFor(save.day) ? "<li>" + unlockFor(save.day).text + "</li>" : "";
    overlayBody.innerHTML =
      intro +
      "<ul><li><b>" + cr.S.served + "</b> customers served</li>" +
      "<li><b>" + cr.S.coins + "</b> coins earned" + (bonus ? " + <b>" + bonus + "</b> closing bonus" : "") + "</li>" +
      "<li>Shift lasted <b>" + clock(cr.S.time) + "</b></li>" +
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
    const cost = upgradeCost(u);
    const r = buyUpgrade(u);
    if (r === 'max') return false;
    if (r === 'poor') {
      shopNote.textContent = "Not enough coins for " + u.name + " (" + cost + ").";
      return false;
    }
    shopNote.textContent = u.name + " bought: " + u.level(lvl(u.id)) + ".";
    renderShop();
    refreshHud();
    return true;
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
        '<div class="up-head"><span class="up-icon">' + (UP_ART.has(u.id) ? '<img src="assets/art/upgrades/' + u.id + '.png" alt="" />' : u.icon) + "</span><span class=\"up-name\">" + u.name + '</span>' + (i < 9 ? '<span class="up-key">' + (i + 1) + "</span>" : "") + "</div>" +
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
    const fresh = freshSave();
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, fresh);
    persist();
    reset();
    openShop();
    shopNote.textContent = "Progress reset. Back to day 1.";
  }

  // ---------- input ----------
  // movement keys currently held: `keys`, declared at the top so the cafe can read it
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
  // as if the page had never been opened: day 1, no upgrades, no best day
  $("btn-restart").addEventListener("click", () => {
    if (!confirm("Start over from day 1? Every upgrade and your best day will be wiped.")) return;
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(BEST_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });

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
  expose('__coffeeRush', {
    state: () => cr.S,
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
      for (let t = 0; t < seconds && cr.S.running; t += d) update(d);
    },
    queueSpot: queueSpot,
    counter: () => cr.COUNTER,
    images: () => Object.keys(IMAGES).map((k) => [k, loaded(IMAGES[k])]).concat([["room", loaded(ROOM)]]),
    upgrades: UPGRADES,
    cost: upgradeCost,
    reset: reset,
    appliances: () => cr.APPLIANCES,
    unplaced: () => cr.UNPLACED.slice(),
    pool: () => cr.POOL.slice(),
    canStart: canStart,
    shortfall: shortfall,
    layout: () => save.layout,
    openLayout: openLayout,
    closeLayout: closeLayout,
    dropOk: (id, c, r) => {
      const a = cr.APPLIANCES.find((x) => x.id === id) || makeAppliance({ id: id, type: id.replace(/-[0-9]+$/, "") }, c, r);
      return dropOk(a, c, r);
    },
    place: (id, c, r) => {
      const a = cr.APPLIANCES.find((x) => x.id === id);
      if (a) {
        if (!dropOk(a, c, r)) return false;
        moveApplianceTo(a, c, r);
        save.layout[a.id] = [c, r];
        save.layoutCols = COLS;
        save.layoutRows = ROWS;
        persist();
        return true;
      }
      const m = cr.UNPLACED.find((u) => u.id === id);
      return m ? putOnFloor(m, c, r) : false;
    }
  });

  // ---------- loop ----------
  fitCanvas();
  reset();
  showIntro();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) {
      if (msgTimer > 0) {
        msgTimer -= dt;
        if (msgTimer <= 0) hud.msg.classList.remove("on");
      }
      update(dt);
    }
    refreshHud();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
