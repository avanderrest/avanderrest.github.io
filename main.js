(() => {
  const canvas = document.getElementById("pond-canvas");
  const ctx = canvas.getContext("2d");

  const mouse = { x: 0, y: 0, active: false };
  let W = 0;
  let H = 0;

  const FLY_COUNT = 26;
  const flies = [];
  const ripples = [];
  let rippleTimer = 0.8;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of flies) {
      f.x = Math.min(Math.max(f.x, 8), W - 8);
      f.y = Math.min(Math.max(f.y, 8), H - 8);
    }
  }

  function spawnFlies() {
    for (let i = 0; i < FLY_COUNT; i++) {
      flies.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        hue: 42 + Math.random() * 34
      });
    }
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = pointerPos(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.active = true;
  });

  canvas.addEventListener("pointerleave", () => {
    mouse.active = false;
  });

  function step(dt) {
    rippleTimer -= dt;
    if (rippleTimer <= 0) {
      rippleTimer = 1.4 + Math.random() * 1.6;
      ripples.push({ x: Math.random() * W, y: Math.random() * H, r: 2, a: 0.3 });
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 26 * dt;
      rp.a -= 0.12 * dt;
      if (rp.a <= 0) ripples.splice(i, 1);
    }

    for (const f of flies) {
      f.phase += dt * (1.5 + Math.random());
      let ax = (Math.random() - 0.5) * 260;
      let ay = (Math.random() - 0.5) * 260;

      if (mouse.active) {
        const dx = mouse.x - f.x;
        const dy = mouse.y - f.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 16 && d < 150) {
          const pull = (1 - d / 150) * 420;
          ax += (dx / d) * pull;
          ay += (dy / d) * pull;
        } else if (d <= 16) {
          ax -= (dx / d) * 500;
          ay -= (dy / d) * 500;
        }
      }

      ax += (W / 2 - f.x) * 0.12;
      ay += (H / 2 - f.y) * 0.12;

      f.vx = (f.vx + ax * dt) * Math.pow(0.55, dt);
      f.vy = (f.vy + ay * dt) * Math.pow(0.55, dt);

      const sp = Math.hypot(f.vx, f.vy);
      if (sp > 70) {
        f.vx = (f.vx / sp) * 70;
        f.vy = (f.vy / sp) * 70;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;

      if (f.x < 8) { f.x = 8; f.vx = Math.abs(f.vx) * 0.6; }
      if (f.x > W - 8) { f.x = W - 8; f.vx = -Math.abs(f.vx) * 0.6; }
      if (f.y < 8) { f.y = 8; f.vy = Math.abs(f.vy) * 0.6; }
      if (f.y > H - 8) { f.y = H - 8; f.vy = -Math.abs(f.vy) * 0.6; }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#081420");
    bg.addColorStop(1, "#0c2735");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 1;
    for (const rp of ripples) {
      ctx.strokeStyle = `rgba(148, 210, 255, ${rp.a})`;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const f of flies) {
      const pulse = 0.5 + 0.5 * Math.sin(f.phase);
      ctx.shadowColor = `hsla(${f.hue}, 95%, 62%, 0.9)`;
      ctx.shadowBlur = 6 + 10 * pulse;
      ctx.fillStyle = `hsla(${f.hue}, 95%, 68%, ${0.35 + 0.6 * pulse})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 1.4 + 1.4 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (mouse.active) {
      const halo = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 36);
      halo.addColorStop(0, "rgba(255, 232, 160, 0.30)");
      halo.addColorStop(1, "rgba(255, 232, 160, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fffdf4";
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  spawnFlies();
  window.addEventListener("resize", resize);
  requestAnimationFrame(frame);
})();

(() => {
  const holder = document.getElementById("synth-keys");
  if (!holder) return;

  const NOTES = [
    ["C", 60, 355], ["D", 62, 28], ["E", 64, 52], ["F", 65, 105],
    ["G", 67, 168], ["A", 69, 212], ["B", 71, 262], ["C", 72, 315]
  ];
  const KEYCHARS = ["A", "S", "D", "F", "G", "H", "J", "K"];
  let audio;

  function playNote(midi, btn) {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 1);

    btn.classList.add("active");
    clearTimeout(btn._keyTimer);
    btn._keyTimer = setTimeout(() => btn.classList.remove("active"), 160);
  }

  const keyMap = {};
  NOTES.forEach(([label, midi, hue], i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key";
    btn.style.setProperty("--h", hue);
    const name = document.createElement("span");
    name.textContent = label;
    const kbd = document.createElement("kbd");
    kbd.textContent = KEYCHARS[i];
    btn.append(name, kbd);
    btn.addEventListener("pointerdown", () => playNote(midi, btn));
    holder.appendChild(btn);
    keyMap[KEYCHARS[i]] = [midi, btn];
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    const hit = keyMap[e.key.toUpperCase()];
    if (hit) playNote(hit[0], hit[1]);
  });
})();

function watchVisible(el, cb) {
  if (typeof IntersectionObserver === "undefined") {
    cb(true);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => cb(en.isIntersecting)),
    { rootMargin: "60px" }
  );
  io.observe(el);
}

(() => {
  const canvas = document.getElementById("murmur-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const pointer = { x: 0, y: 0, active: false };
  const birds = [];
  const stars = [];
  const N = 88;
  let W = 0;
  let H = 0;
  let seen = true;
  let t = Math.random() * 100;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = pointerPos(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  function spawn() {
    for (let i = 0; i < N; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 50;
      birds.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        ph: Math.random() * Math.PI * 2
      });
    }
    for (let i = 0; i < 26; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.55,
        r: 0.5 + Math.random() * 0.9,
        ph: Math.random() * Math.PI * 2
      });
    }
  }

  function step(dt) {
    t += dt;
    const ax = W * (0.5 + 0.36 * Math.sin(t * 0.21) + 0.14 * Math.sin(t * 0.53 + 2));
    const ay = H * (0.5 + 0.3 * Math.cos(t * 0.17) + 0.12 * Math.sin(t * 0.47));

    for (let i = 0; i < N; i++) {
      const b = birds[i];
      let fx = (ax - b.x) * 0.55;
      let fy = (ay - b.y) * 0.55;
      let sx = 0;
      let sy = 0;
      let alx = 0;
      let aly = 0;
      let cnt = 0;

      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const o = birds[j];
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 2500) continue;
        const d = Math.sqrt(d2) || 1;
        if (d < 26) {
          const push = (26 - d) / 26;
          sx -= (dx / d) * push * 300;
          sy -= (dy / d) * push * 300;
        }
        alx += o.vx;
        aly += o.vy;
        cnt++;
      }
      if (cnt) {
        fx += ((alx / cnt) - b.vx) * 1.15;
        fy += ((aly / cnt) - b.vy) * 1.15;
      }
      fx += sx;
      fy += sy;

      if (pointer.active) {
        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < 130 && d > 0.01) {
          const push = (1 - d / 130) * 1600;
          fx += (dx / d) * push;
          fy += (dy / d) * push;
        }
      }

      b.vx += fx * dt;
      b.vy += fy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 165) {
        b.vx *= 165 / sp;
        b.vy *= 165 / sp;
      } else if (sp < 46 && sp > 0.01) {
        b.vx *= 46 / sp;
        b.vy *= 46 / sp;
      }

      const ex = (W / 2 - b.x) / (W * 0.47);
      const ey = (H / 2 - b.y) / (H * 0.47);
      if (ex * ex + ey * ey > 1) {
        b.vx += ex * 240 * dt;
        b.vy += ey * 240 * dt;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ph += dt * (13 + sp * 0.08);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1322");
    bg.addColorStop(0.65, "#171430");
    bg.addColorStop(1, "#221838");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.ph));
      ctx.fillStyle = "#dfe6f0";
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const moonGlow = ctx.createRadialGradient(W * 0.83, H * 0.2, 0, W * 0.83, H * 0.2, 34);
    moonGlow.addColorStop(0, "rgba(226, 232, 244, 0.32)");
    moonGlow.addColorStop(1, "rgba(226, 232, 244, 0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(W * 0.83, H * 0.2, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    for (const b of birds) {
      const sp = Math.hypot(b.vx, b.vy);
      const len = (3.4 + sp * 0.02) * (1 + 0.28 * Math.sin(b.ph));
      const ux = b.vx / (sp || 1);
      const uy = b.vy / (sp || 1);
      ctx.strokeStyle = `rgba(226, 232, 240, ${0.5 + 0.35 * Math.sin(b.ph * 0.53)})`;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ux * len, b.y - uy * len);
      ctx.stroke();
    }

    if (pointer.active) {
      ctx.strokeStyle = "rgba(255, 176, 120, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  resize();
  spawn();
  window.addEventListener("resize", resize);
  watchVisible(canvas, (v) => { seen = v; });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (seen) {
      step(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

(() => {
  const canvas = document.getElementById("frog-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const pads = [
    { fx: 0.16, fy: 0.48 },
    { fx: 0.52, fy: 0.78 },
    { fx: 0.84, fy: 0.36 },
    { fx: 0.44, fy: 0.18 }
  ];
  const frog = { pi: 0, x: 0, y: 0, angle: 0, hop: null, squash: 0, tongue: 0, tongueTo: null, bubble: null, air: 0 };
  const flies = [];
  const ripples = [];
  const sparks = [];
  let W = 0;
  let H = 0;
  let seen = true;
  let time = 0;
  let spawnT = 2.5;

  function padPos(i) {
    return { x: pads[i].fx * W, y: pads[i].fy * H };
  }

  function padR() {
    return Math.min(W, H) * 0.135 + 6;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!frog.x) {
      const c = padPos(frog.pi);
      frog.x = c.x;
      frog.y = c.y;
    }
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    ripples.push({ x: p.x, y: p.y, r: 2, a: 0.38 });
    let best = -1;
    let bd = padR() + 16;
    pads.forEach((pd, i) => {
      const c = padPos(i);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && best !== frog.pi && !frog.hop) {
      const c = padPos(best);
      const dist = Math.hypot(c.x - frog.x, c.y - frog.y);
      frog.angle = Math.atan2(c.y - frog.y, c.x - frog.x);
      frog.hop = {
        fx: frog.x,
        fy: frog.y,
        tx: c.x,
        ty: c.y,
        ti: best,
        t: 0,
        dur: 0.45 + dist / 700,
        h: 18 + dist * 0.2
      };
      ripples.push({ x: frog.x, y: frog.y, r: 2, a: 0.35 });
    }
  });

  function step(dt) {
    time += dt;

    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 22 * dt;
      rp.a -= 0.4 * dt;
      if (rp.a <= 0) ripples.splice(i, 1);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      sparks[i].a -= dt * 1.6;
      if (sparks[i].a <= 0) sparks.splice(i, 1);
    }

    frog.squash = Math.max(0, frog.squash - dt * 3);
    if (frog.tongue > 0) frog.tongue -= dt;
    if (frog.bubble) {
      frog.bubble.t -= dt;
      if (frog.bubble.t <= 0) frog.bubble = null;
    }

    if (frog.hop) {
      const hp = frog.hop;
      hp.t += dt / hp.dur;
      if (hp.t >= 1) {
        frog.x = hp.tx;
        frog.y = hp.ty;
        frog.pi = hp.ti;
        frog.squash = 1;
        frog.air = 0;
        ripples.push({ x: frog.x, y: frog.y, r: 3, a: 0.42 });
        if (Math.random() < 0.5) frog.bubble = { text: "ribbit.", t: 1.3 };
        frog.hop = null;
      } else {
        const e = hp.t * hp.t * (3 - 2 * hp.t);
        frog.x = hp.fx + (hp.tx - hp.fx) * e;
        frog.y = hp.fy + (hp.ty - hp.fy) * e;
        frog.air = Math.sin(hp.t * Math.PI) * hp.h;
      }
    } else {
      frog.air = 0;
      const c = padPos(frog.pi);
      frog.x += (c.x - frog.x) * Math.min(1, dt * 6);
      frog.y += (c.y - frog.y) * Math.min(1, dt * 6);
    }

    spawnT -= dt;
    if (spawnT <= 0 && flies.length === 0) {
      spawnT = 4 + Math.random() * 4;
      const side = Math.random() < 0.5 ? -14 : W + 14;
      flies.push({
        x: side,
        y: H * (0.2 + Math.random() * 0.55),
        vx: (side < 0 ? 1 : -1) * (26 + Math.random() * 18),
        ph: Math.random() * 6
      });
    }
    for (let i = flies.length - 1; i >= 0; i--) {
      const fl = flies[i];
      fl.x += fl.vx * dt;
      fl.y += Math.sin(time * 6 + fl.ph) * 12 * dt;
      if (fl.x < -24 || fl.x > W + 24) flies.splice(i, 1);
    }

    if (frog.tongueTo && frog.tongue <= 0.07) {
      sparks.push({ x: frog.tongueTo.x, y: frog.tongueTo.y, a: 0.9 });
      ripples.push({ x: frog.tongueTo.x, y: frog.tongueTo.y, r: 1.5, a: 0.3 });
      flies.length = 0;
      frog.bubble = { text: "gulp.", t: 1 };
      frog.tongueTo = null;
    }

    if (!frog.hop && frog.tongue <= 0 && frog.tongueTo === null && flies.length) {
      const fl = flies[0];
      if (Math.hypot(fl.x - frog.x, fl.y - frog.y) < 36) {
        frog.tongue = 0.14;
        frog.tongueTo = { x: fl.x, y: fl.y };
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a1c29");
    bg.addColorStop(1, "#0d2b3a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 1;
    for (const rp of ripples) {
      ctx.strokeStyle = `rgba(148, 210, 255, ${rp.a})`;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const pr = padR();
    pads.forEach((pd, i) => {
      const px = pd.fx * W;
      const py = pd.fy * H;
      const pa = i * 1.7 + 0.6;
      ctx.fillStyle = "#173e33";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, pr, pa + 0.32, pa - 0.32 + Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 210, 255, 0.12)";
      ctx.beginPath();
      ctx.arc(px, py, pr - 1.5, pa + 0.45, pa + 2.1);
      ctx.stroke();
    });

    for (const fl of flies) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 9 + fl.ph);
      const halo = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 9);
      halo.addColorStop(0, `rgba(232, 197, 106, ${0.35 * pulse})`);
      halo.addColorStop(1, "rgba(232, 197, 106, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd97a";
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of sparks) {
      ctx.strokeStyle = `rgba(232, 197, 106, ${s.a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (0.9 - s.a) * 16 + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    const size = 13;
    const airY = frog.air;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.18 * Math.max(0.15, 1 - airY / 70)})`;
    ctx.beginPath();
    ctx.ellipse(frog.x + 1, frog.y + 3, size * Math.max(0.5, 1 - airY / 90), size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(frog.x, frog.y - airY);
    ctx.rotate(frog.angle);
    const sq = frog.squash;
    const st = frog.hop ? 0.12 : 0;
    ctx.scale(1 + sq * 0.28 - st, 1 - sq * 0.3 + st);
    ctx.fillStyle = "#3f7d4e";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-size * 0.5, side * size * 0.66, size * 0.5, size * 0.24, side * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#57a56a";
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(233, 240, 220, 0.35)";
    ctx.beginPath();
    ctx.ellipse(size * 0.18, 0, size * 0.55, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = Math.cos(side * 0.55) * size * 0.74;
      const ey = Math.sin(side * 0.55) * size * 0.74;
      ctx.fillStyle = "#57a56a";
      ctx.beginPath();
      ctx.arc(ex, ey, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#17251c";
      ctx.beginPath();
      ctx.arc(ex + Math.cos(frog.angle) * size * 0.07, ey + Math.sin(frog.angle) * size * 0.07, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3f7d4e";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(Math.cos(side * 1.2) * size * 0.95, Math.sin(side * 1.2) * size * 0.95, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (frog.tongue > 0 && frog.tongueTo) {
      const mx = frog.x + Math.cos(frog.angle) * size;
      const my = frog.y - airY + Math.sin(frog.angle) * size;
      ctx.strokeStyle = "#ff8fa3";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(frog.tongueTo.x, frog.tongueTo.y);
      ctx.stroke();
      ctx.fillStyle = "#ff8fa3";
      ctx.beginPath();
      ctx.arc(frog.tongueTo.x, frog.tongueTo.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (frog.bubble) {
      const alpha = Math.min(1, frog.bubble.t * 2);
      const bx = frog.x + Math.cos(frog.angle) * size * 1.6;
      const by = frog.y - airY + Math.sin(frog.angle) * size * 1.6 - 10;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 4;
      ctx.font = "italic 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(238, 232, 213, ${alpha})`;
      ctx.fillText(frog.bubble.text, bx, by);
      ctx.restore();
    }
  }

  resize();
  window.addEventListener("resize", resize);
  watchVisible(canvas, (v) => { seen = v; });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (seen) {
      step(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

(() => {
  const canvas = document.getElementById("bokeh-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const pointer = { x: 0, y: 0, active: false };
  const orbs = [];
  const pulses = [];
  const HUES = [38, 48, 190, 205, 170, 320];
  let W = 0;
  let H = 0;
  let seen = true;
  let time = 0;

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function addOrb(x, y, born) {
    orbs.push({
      x: x !== undefined ? x : Math.random() * W,
      y: y !== undefined ? y : Math.random() * H,
      r: 9 + Math.random() * 20,
      hue: pick(HUES),
      vx: (Math.random() - 0.5) * 11,
      vy: (Math.random() - 0.5) * 11,
      ph: Math.random() * Math.PI * 2,
      s: 0,
      born
    });
    if (orbs.length > 44) orbs.shift();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = pointerPos(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    pulses.push({ x: p.x, y: p.y, r: 4, a: 0.5 });
    addOrb(p.x, p.y, time);
  });

  function step(dt) {
    time += dt;
    for (let i = pulses.length - 1; i >= 0; i--) {
      pulses[i].r += 44 * dt;
      pulses[i].a -= 1.3 * dt;
      if (pulses[i].a <= 0) pulses.splice(i, 1);
    }
    for (const o of orbs) {
      o.x += o.vx * dt + Math.sin(time * 0.5 + o.ph) * 3 * dt;
      o.y += o.vy * dt + Math.cos(time * 0.4 + o.ph) * 3 * dt;
      const m = o.r * 1.9;
      if (o.x < -m) o.x = W + m;
      if (o.x > W + m) o.x = -m;
      if (o.y < -m) o.y = H + m;
      if (o.y > H + m) o.y = -m;
      let target = 0;
      if (pointer.active) {
        target = Math.max(0, 1 - Math.hypot(pointer.x - o.x, pointer.y - o.y) / 150);
      }
      o.s += (target - o.s) * Math.min(1, dt * 6);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#070d14";
    ctx.fillRect(0, 0, W, H);

    const warm = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.65);
    warm.addColorStop(0, "rgba(64, 54, 36, 0.32)");
    warm.addColorStop(1, "rgba(64, 54, 36, 0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (const o of orbs) {
      const sc = o.born < 0 ? 1 : Math.min(1, (time - o.born) / 0.4);
      const R = (o.r + (3.5 + o.r * 0.14 - o.r) * o.s) * sc;
      const A = (0.09 + o.r * 0.004) + (0.62 - (0.09 + o.r * 0.004)) * o.s;
      ctx.fillStyle = `hsla(${o.hue}, 70%, 60%, ${A * 0.3})`;
      ctx.beginPath();
      ctx.arc(o.x, o.y, R * 1.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${o.hue}, 80%, 72%, ${A})`;
      ctx.beginPath();
      ctx.arc(o.x, o.y, R, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pu of pulses) {
      ctx.strokeStyle = `hsla(45, 80%, 70%, ${pu.a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    if (pointer.active) {
      ctx.strokeStyle = "rgba(238, 232, 213, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(238, 232, 213, 0.6)";
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resize();
  for (let i = 0; i < 30; i++) addOrb(undefined, undefined, -9);
  window.addEventListener("resize", resize);
  watchVisible(canvas, (v) => { seen = v; });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (seen) {
      step(dt);
      draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

(() => {
  const tile = document.getElementById("weather-widget");
  if (!tile) return;
  const daysEl = document.getElementById("wx-days");
  const form = document.getElementById("wx-form");
  const input = document.getElementById("wx-place");
  const locateBtn = document.getElementById("wx-locate");
  const dateEl = document.getElementById("wx-date");
  const prevBtn = document.getElementById("wx-prev");
  const nextBtn = document.getElementById("wx-next");
  const canvas = document.getElementById("wx-canvas");
  const ctx = canvas.getContext("2d");

  // Where the forecast lands when the visitor won't, or can't, share a location.
  const DEFAULT_PLACE = { name: "London, UK", lat: 51.5072, lon: -0.1276 };
  const STORE_KEY = "wx-place";
  const DAYS = 7;

  const CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Storm with hail", 99: "Storm with hail"
  };

  function describe(code) {
    return CODES[code] || "Changeable";
  }

  function isSnow(code) {
    return (code >= 71 && code <= 77) || code === 85 || code === 86;
  }

  function isWet(code) {
    return code >= 51 && code <= 99 && !isSnow(code);
  }

  // One word for the sky, which picks the scene, the icon and the palette.
  function skyKind(code) {
    if (code === 0) return "clear";
    if (code === 1) return "mostly";
    if (code === 2) return "partly";
    if (code === 3) return "overcast";
    if (code === 45 || code === 48) return "fog";
    if (code >= 95) return "storm";
    if (isSnow(code)) return "snow";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code >= 51) return "rain";
    return "partly";
  }

  function whatToWear(d) {
    const feel = d.appMax;
    const morning = d.appMin;
    const main = wardrobeFor(feel)[1];

    const extras = [];
    const windy = d.wind >= 40;
    const breezy = d.wind >= 25 && !windy;
    const rainy = d.rainProb >= 60 || d.rainSum >= 3 || isWet(d.code);
    const maybeRain = !rainy && (d.rainProb >= 35 || d.rainSum >= 0.5);

    if (isSnow(d.code)) extras.push("Boots with grip.");
    if (rainy && windy) extras.push("Wet and windy: hooded raincoat, leave the brolly.");
    else if (rainy) extras.push("Umbrella and shoes that can take a puddle.");
    else if (maybeRain) extras.push("Pack a brolly just in case.");
    else if (windy) extras.push("Windproof layer, it'll be blowy.");
    else if (breezy) extras.push("A breezy one, bring a windbreaker.");

    if (morning < feel - 7 && feel >= 10) extras.push("Chilly start, take a layer you can shed.");
    if (d.uv >= 6) extras.push("Sunscreen and sunglasses.");
    else if (d.uv >= 3 && !rainy) extras.push("Sunglasses wouldn't hurt.");

    return { main, extras: extras.slice(0, 2) };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ---------- scene ----------
  // Her painted park in the day's weather, the girl dressed for it walking the
  // path, and a low-res canvas on top that keeps the weather moving.
  const sceneEl = document.getElementById("wx-scene");
  const bgEl = document.getElementById("wx-bg");
  const girlEl = document.getElementById("wx-girl");
  // She is a paper doll: her body, then each thing she wears as its own
  // picture (images/weather/doll/, from notes/weather-assets/doll.py). Every
  // layer is the same size with the garment already in place on her, so they
  // just stack. Hair to toes she is this share of the scene's height --
  // measured off the paintings: the benches are ~18% of the height with their
  // feet ~76% down; someone beside one would be ~1.8x as tall, and she stands
  // nearer, at the front of the path, where it is ~1.7x as wide.
  const GIRL_H = 55;
  const DOLL_TALL = 578 / 551;     // the layers' box over her, hat room included
  // Which layer each piece is. Long sleeves ("+") are stretched to reach her
  // wrists; a top under a "+" coat is trimmed to it. Some tops come with
  // their own bottoms.
  const DOLL = {
    beanie: "hat", cap: "hat", sunhat: "hat", earmuffs: "hat",
    puffer: "outer+", trench: "outer+", denim: "outer+", gilet: "outer", khaki: "outer+",
    bomber: "outer+", fleece: "outer+", raincoat: "outer+", cardigan: "outer+",
    jumper: "top+", cable: "top+", flannel: "top+", stripes: "top+", tank: "top",
    blouse: "top", sundress: "top", dungarees: "top+", mint: "top+", tee: "top",
    "floral-top": "top", gingham: "top", "tee-grey": "top", "tee-stripe": "top", camisole: "top",
    skirt: "legs", jeans: "legs", "jeans-dark": "legs", chinos: "legs", cords: "legs",
    "white-socks": "socks", "grey-socks": "socks"
  };
  const DOLL_ORDER = ["socks", "legs", "top", "outer", "head", "hat"];
  // What to wear, coldest first, by how warm the day feels: the advice line,
  // and the looks that match it -- one is picked per date, so a run of similar
  // days doesn't repeat her clothes. They share a row so the picture always
  // shows what the words say. Summer looks leave her feet bare.
  const WARDROBE = [
    [3, "Heavy coat, hat, gloves and a scarf.",
      ["jeans-dark grey-socks jumper puffer beanie", "jeans-dark grey-socks cable puffer earmuffs"]],
    [8, "Warm coat and a scarf. Layer up.",
      ["jeans grey-socks jumper trench", "cords grey-socks cable trench", "jeans-dark grey-socks jumper fleece beanie"]],
    [13, "A proper jacket or a thick jumper.",
      ["cords grey-socks flannel khaki", "jeans white-socks tee-grey khaki", "jeans-dark grey-socks jumper gilet"]],
    [18, "Light jacket or a hoodie.",
      ["chinos white-socks tee denim", "skirt white-socks tee-stripe bomber", "jeans white-socks flannel", "jeans white-socks floral-top cardigan"]],
    [23, "Long sleeves or a tee with jeans.",
      ["jeans white-socks tee-stripe", "jeans white-socks tee", "jeans white-socks tee-grey", "stripes white-socks", "dungarees white-socks"]],
    [28, "T-shirt and something light on the legs.",
      ["sundress", "mint", "blouse", "skirt gingham", "skirt tee-stripe"]],
    [99, "Loose, light fabrics. Stay in the shade.",
      ["tank cap", "sundress sunhat", "blouse sunhat", "skirt camisole"]]
  ];
  function wardrobeFor(feel) {
    return WARDROBE.find(([below]) => feel < below);
  }
  // Rain means the hooded raincoat, over something for a cold or a mild day.
  const RAIN_LOOKS = { cold: "jeans-dark grey-socks cable raincoat", mild: "jeans white-socks tee raincoat" };

  function dayPick(list, date) {
    let h = 0;
    for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }

  // Autumn by the calendar, whichever half of the world the place is in.
  function isAutumn(d) {
    const m = +d.date.slice(5, 7);
    return place.lat < 0 ? m === 4 || m === 5 : m === 10 || m === 11;
  }

  function look(d, evening) {
    const kind = skyKind(d.code);
    const snowy = isSnow(d.code);
    const rainy = !snowy && (d.rainProb >= 60 || d.rainSum >= 3 || isWet(d.code));
    const windy = d.wind >= 25;
    const feel = d.appMax;

    let park;
    if (snowy) park = "snow";
    else if (kind === "storm") park = "storm";
    else if (rainy) park = "rain";
    else if (kind === "fog") park = "fog";
    else if (d.wind >= 50) park = "gale";
    else if (windy) park = kind === "overcast" ? "gusty" : "breezy";
    else if (kind === "overcast") park = "overcast";
    else if (evening) park = "dusk";
    else if (isAutumn(d)) park = "autumn";
    else park = kind;

    const fair = kind === "clear" || kind === "mostly" || kind === "partly";
    let girl = dayPick(wardrobeFor(feel)[2], d.date);
    if (rainy) girl = feel < 13 ? RAIN_LOOKS.cold : RAIN_LOOKS.mild;
    else if (snowy) girl = dayPick(WARDROBE[0][2], d.date);
    else if (fair && d.uv >= 6 && !/cap|hat|beanie|earmuffs/.test(girl)) girl += " sunhat";

    let fx = "";
    if (snowy) fx = "snow";
    else if (kind === "storm") fx = "storm";
    else if (rainy) fx = kind === "drizzle" ? "drizzle" : "rain";
    else if (kind === "fog") fx = "fog";
    else if (windy) fx = "wind";
    return { kind, park, girl, fx };
  }

  // ---------- pixel helpers (the icon, and the moving weather) ----------
  const CLOUD_PAL = {
    clear: ["#ffffff", "#dfe7ee"], mostly: ["#ffffff", "#dfe7ee"], partly: ["#ffffff", "#dfe7ee"],
    overcast: ["#d5dbe0", "#aeb7bf"], fog: ["#dfe3e6", "#c3c9ce"], snow: ["#e4e9ee", "#c2cad2"],
    drizzle: ["#b9c2ca", "#98a2ab"], rain: ["#8b95a0", "#6b747e"], storm: ["#5d6570", "#454c55"]
  };
  const ICON_CLOUD = [
    "...###....",
    ".######...",
    "#########.",
    "##########",
    ".ssssssss."
  ];

  function painter(g) {
    return (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.floor(x), Math.floor(y), w, h); };
  }

  function sprite(P, rows, x, y, pal) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const col = pal[rows[r][c]];
        if (col) P(x + c, y + r, 1, 1, col);
      }
    }
  }

  function drawSun(P, x, y) {
    const Y = "#ffd34d";
    P(x - 2, y - 3, 5, 7, Y);
    P(x - 3, y - 2, 7, 5, Y);
    P(x - 1, y - 2, 2, 1, "#fff1a8");
    P(x, y - 6, 1, 2, Y); P(x, y + 5, 1, 2, Y); P(x - 6, y, 2, 1, Y); P(x + 5, y, 2, 1, Y);
  }

  function drawIcon(el, kind) {
    const g = el.getContext("2d");
    g.clearRect(0, 0, 16, 16);
    const Q = painter(g);
    const [cMain, cShade] = CLOUD_PAL[kind];
    const cloud = (x, y) => sprite(Q, ICON_CLOUD, x, y, { "#": cMain, s: cShade });
    if (kind === "clear" || kind === "mostly") drawSun(Q, 8, 8);
    if (kind === "mostly") sprite(Q, ICON_CLOUD, 7, 10, { "#": "#ffffff", s: "#dfe7ee" });
    if (kind === "partly") { drawSun(Q, 6, 6); cloud(5, 9); }
    if (kind === "overcast") { sprite(Q, ICON_CLOUD, 5, 3, { "#": "#aeb7bf", s: "#8b95a0" }); cloud(1, 7); }
    if (kind === "fog") { Q(1, 5, 11, 2, "#c3c9ce"); Q(4, 8, 11, 2, "#dfe3e6"); Q(1, 11, 11, 2, "#c3c9ce"); }
    if (kind === "drizzle" || kind === "rain" || kind === "storm" || kind === "snow") cloud(3, 2);
    if (kind === "drizzle") { Q(5, 9, 1, 2, "#7fb7e8"); Q(9, 11, 1, 2, "#7fb7e8"); }
    if (kind === "rain") { Q(4, 9, 1, 2, "#5aa0e0"); Q(7, 11, 1, 2, "#5aa0e0"); Q(10, 9, 1, 2, "#5aa0e0"); Q(6, 14, 1, 2, "#5aa0e0"); Q(11, 13, 1, 2, "#5aa0e0"); }
    if (kind === "snow") { Q(4, 9, 1, 1, "#ffffff"); Q(8, 11, 1, 1, "#ffffff"); Q(11, 9, 1, 1, "#ffffff"); Q(6, 13, 1, 1, "#ffffff"); Q(10, 14, 1, 1, "#ffffff"); }
    if (kind === "storm") { Q(8, 8, 2, 2, "#ffd34d"); Q(7, 10, 2, 2, "#ffd34d"); Q(8, 12, 2, 1, "#ffd34d"); Q(7, 13, 1, 2, "#ffd34d"); }
  }

  // The moving layer: drawn a third of the scene's size, scaled up crisp.
  const scene = {
    W: 0, H: 0, fx: "", look: null,
    drops: [], flakes: [], leaves: [], streaks: [],
    t: 0, flash: 0, nextFlash: 4
  };

  function spawnAll() {
    const { W, H, fx } = scene;
    const rand = (n) => Math.random() * n;
    const dropCount = fx === "drizzle" ? W * 0.35 : fx === "rain" ? W * 0.8 : fx === "storm" ? W * 1.2 : 0;
    scene.drops = Array.from({ length: Math.round(dropCount) }, () => ({
      x: rand(W), y: rand(H), v: fx === "drizzle" ? 45 + rand(10) : 85 + rand(30)
    }));
    scene.flakes = fx === "snow" ? Array.from({ length: Math.round(W * 0.7) }, (_, i) => ({
      x: rand(W), y: rand(H), v: 6 + rand(8), ph: rand(6), big: i % 5 === 0
    })) : [];
    scene.leaves = fx === "wind" ? Array.from({ length: 7 }, () => ({
      x: rand(W), y: rand(H * 0.8), ph: rand(6), c: Math.random() < 0.5 ? "#c9803a" : "#6f9a4a"
    })) : [];
    scene.streaks = fx === "wind" ? Array.from({ length: 4 }, () => ({
      x: rand(W), y: 6 + rand(H * 0.6), len: 8 + Math.floor(rand(10)), v: 50 + rand(30)
    })) : [];
  }

  function step(dt) {
    const s = scene;
    const { W, H } = s;
    s.t += dt;
    const slant = s.fx === "storm" ? 18 : 5;
    for (const d of s.drops) {
      d.y += d.v * dt;
      d.x += slant * dt;
      if (d.y > H) { d.y = -Math.random() * 10; d.x = Math.random() * (W + 10) - 10; }
    }
    for (const f of s.flakes) {
      f.y += f.v * dt;
      f.x += Math.sin(s.t * 1.5 + f.ph) * 5 * dt;
      if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
    }
    for (const l of s.leaves) {
      l.x += 34 * dt;
      l.y += Math.sin(s.t * 4 + l.ph) * 10 * dt;
      if (l.x > W + 2) { l.x = -2; l.y = Math.random() * H * 0.8; }
    }
    for (const k of s.streaks) {
      k.x += k.v * dt;
      if (k.x > W + k.len) { k.x = -k.len; k.y = 6 + Math.random() * H * 0.6; }
    }
    if (s.fx === "storm") {
      if (s.flash > 0) s.flash -= dt;
      s.nextFlash -= dt;
      if (s.nextFlash <= 0) { s.flash = 0.18; s.nextFlash = 3 + Math.random() * 5; }
    }
  }

  function draw() {
    const s = scene;
    const { W, H } = s;
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = s.fx === "storm" ? "rgba(200,215,235,0.75)" : "rgba(214,230,246,0.6)";
    for (const d of s.drops) ctx.fillRect(Math.floor(d.x), Math.floor(d.y), 1, 3);
    ctx.fillStyle = "#f4f7fa";
    for (const f of s.flakes) ctx.fillRect(Math.floor(f.x), Math.floor(f.y), f.big ? 2 : 1, f.big ? 2 : 1);
    for (const l of s.leaves) { ctx.fillStyle = l.c; ctx.fillRect(Math.floor(l.x), Math.floor(l.y), 2, 1); }
    ctx.fillStyle = "rgba(220,240,250,0.55)";
    for (const k of s.streaks) {
      ctx.fillRect(Math.floor(k.x), Math.floor(k.y), k.len, 1);
      ctx.fillRect(Math.floor(k.x) + k.len, Math.floor(k.y) - 1, 3, 1);
    }
    if (s.fx === "fog") {
      // Soft drifting banks: thin layers stacked so the edges feather out.
      ctx.fillStyle = "rgba(232,236,239,0.07)";
      for (let i = 0; i < 4; i++) {
        const mid = H * (0.35 + i * 0.17) + Math.sin(s.t * 0.3 + i * 1.7) * 3;
        for (let k = 0; k < 6; k++) ctx.fillRect(0, Math.floor(mid - k * 1.5), W, 2 + k * 3);
      }
    }
    if (s.flash > 0) { ctx.fillStyle = "rgba(235,240,255,0.45)"; ctx.fillRect(0, 0, W, H); }
  }

  // Stack her layers: body, then socks up to hat, with her face and hair
  // over any collar.
  girlEl.style.height = (GIRL_H * DOLL_TALL).toFixed(1) + "%";
  function dollLayers(pieces) {
    const kindOf = (p) => DOLL[p].replace("+", "");
    // Under a long-sleeved coat she wears a copy of her top trimmed to the
    // coat, so no sleeve pokes out of it.
    const coat = pieces.find((p) => DOLL[p] === "outer+");
    const layers = ["body"];
    for (const k of DOLL_ORDER) {
      if (k === "head") layers.push("head");
      for (const p of pieces) {
        if (kindOf(p) !== k) continue;
        layers.push(k === "top" && coat ? p + "--" + coat : p);
      }
    }
    return layers;
  }

  function dressDoll(pieces) {
    const layers = dollLayers(pieces);
    const have = girlEl.children;
    for (let i = 0; i < layers.length; i++) {
      let img = have[i];
      if (!img) { img = document.createElement("img"); img.alt = ""; girlEl.appendChild(img); }
      const src = `images/weather/doll/${layers[i]}.png`;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    }
    while (have.length > layers.length) girlEl.lastChild.remove();
    girlEl.dataset.wear = pieces.join(" ");
  }

  function setScene(d, evening) {
    const lk = look(d, evening);
    scene.look = lk;
    bgEl.style.backgroundImage = `url(images/weather/park-${lk.park}.jpg)`;
    dressDoll(lk.girl.split(" "));
    if (lk.fx !== scene.fx) {
      scene.fx = lk.fx;
      scene.flash = 0;
      spawnAll();
    }
    kick();
  }

  // ---------- loop ----------
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = false;
  let raf = 0;
  let last = 0;
  let acc = 0;

  function loop(ts) {
    raf = 0;
    if (!visible || !scene.fx) return;
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0);
    last = ts;
    acc += dt;
    if (acc >= 1 / 24) {
      step(acc);
      acc = 0;
      draw();
    }
    raf = requestAnimationFrame(loop);
  }

  function kick() {
    draw();
    if (reduceMotion || !visible || raf || !scene.fx) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function resizeScene() {
    const r = sceneEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const W = Math.ceil(r.width / 3), H = Math.ceil(r.height / 3);
    if (W === scene.W && H === scene.H) return;
    scene.W = W; scene.H = H;
    canvas.width = W; canvas.height = H;
    spawnAll();
    kick();
  }

  if ("ResizeObserver" in window) new ResizeObserver(resizeScene).observe(sceneEl);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) kick();
    }).observe(sceneEl);
  } else {
    visible = true;
  }
  resizeScene();

  // ---------- forecast ----------
  let days = [];
  let dayIndex = 0;
  let nowT = null;
  let nowHour = null; // the hour where the place is, for dusk in the park
  let place = DEFAULT_PLACE;

  function dateLabel(i, iso) {
    const d = new Date(iso + "T12:00:00");
    const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const tag = i === 0 ? "Today" : i === 1 ? "Tomorrow" : "";
    return tag ? `<b>${tag}</b> &middot; ${esc(date)}` : esc(date);
  }

  function render() {
    const d = days[dayIndex];
    if (!d) return;
    dateEl.innerHTML = dateLabel(dayIndex, d.date);
    prevBtn.disabled = dayIndex === 0;
    nextBtn.disabled = dayIndex >= days.length - 1;
    const cond = describe(d.code);
    const wear = whatToWear(d);
    const meta = [];
    if (dayIndex === 0 && nowT !== null) meta.push(`Now ${nowT}&deg;`);
    meta.push(`Rain ${Math.round(d.rainProb)}%`);
    meta.push(`Wind ${Math.round(d.wind)} km/h`);
    if (d.uv >= 3) meta.push(`UV ${Math.round(d.uv)}`);
    daysEl.innerHTML = `
      <div class="wx-main">
        <canvas class="wx-icon" width="16" height="16" aria-hidden="true"></canvas>
        <span class="wx-hi">${Math.round(d.max)}&deg;</span>
        <span class="wx-lo">low ${Math.round(d.min)}&deg;<br>feels ${Math.round(d.appMax)}&deg;</span>
      </div>
      <p class="wx-cond">${cond}</p>
      <div class="wx-meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
      <div class="wx-wear">
        <p class="wx-wear-main">${esc(wear.main)}</p>
        ${wear.extras.map((e) => `<p>${esc(e)}</p>`).join("")}
      </div>`;
    drawIcon(daysEl.querySelector(".wx-icon"), skyKind(d.code));
    setScene(d, dayIndex === 0 && nowHour !== null && (nowHour >= 19 || nowHour < 6));
    sceneEl.setAttribute("aria-label", `${cond}. A girl out in the park, dressed for it: ${wear.main}`);
    let nameEl = form.querySelector(".wx-place-name");
    if (!nameEl) {
      nameEl = document.createElement("span");
      nameEl.className = "wx-place-name";
      form.appendChild(nameEl);
    }
    nameEl.textContent = place.name;
  }

  function status(msg) {
    daysEl.innerHTML = `<p class="wx-status">${esc(msg)}</p>`;
  }

  prevBtn.addEventListener("click", () => { if (dayIndex > 0) { dayIndex--; render(); } });
  nextBtn.addEventListener("click", () => { if (dayIndex < days.length - 1) { dayIndex++; render(); } });

  async function fetchForecast(p) {
    const q = new URLSearchParams({
      latitude: p.lat,
      longitude: p.lon,
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min",
        "apparent_temperature_max", "apparent_temperature_min",
        "precipitation_probability_max", "precipitation_sum",
        "wind_speed_10m_max", "uv_index_max"
      ].join(","),
      current: "temperature_2m",
      timezone: "auto",
      forecast_days: String(DAYS)
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    return res.json();
  }

  function parse(data) {
    const dl = data.daily;
    nowT = data.current && typeof data.current.temperature_2m === "number"
      ? Math.round(data.current.temperature_2m) : null;
    nowHour = data.current && data.current.time ? +data.current.time.slice(11, 13) : null;
    return dl.time.map((date, i) => ({
      date,
      code: dl.weather_code[i],
      max: dl.temperature_2m_max[i],
      min: dl.temperature_2m_min[i],
      appMax: dl.apparent_temperature_max[i],
      appMin: dl.apparent_temperature_min[i],
      rainProb: dl.precipitation_probability_max[i] || 0,
      rainSum: dl.precipitation_sum[i] || 0,
      wind: dl.wind_speed_10m_max[i] || 0,
      uv: dl.uv_index_max[i] || 0
    }));
  }

  async function geocode(name) {
    const q = new URLSearchParams({ name, count: "1", language: "en", format: "json" });
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const json = await res.json();
    const hit = json.results && json.results[0];
    if (!hit) return null;
    const bits = [hit.name];
    if (hit.admin1 && hit.admin1 !== hit.name) bits.push(hit.admin1);
    else if (hit.country) bits.push(hit.country);
    return { name: bits.join(", "), lat: hit.latitude, lon: hit.longitude };
  }

  let busy = false;
  async function load(p) {
    if (busy) return;
    busy = true;
    status(`Checking the sky over ${p.name}…`);
    try {
      const data = await fetchForecast(p);
      days = parse(data);
      dayIndex = 0;
      place = p;
      render();
      try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    } catch (e) {
      status("Couldn't reach the forecast. Try again in a moment.");
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    status(`Looking for ${name}…`);
    try {
      const found = await geocode(name);
      if (!found) {
        status(`Couldn't find "${name}". Try a town or city name.`);
        return;
      }
      input.value = "";
      load(found);
    } catch (e) {
      status("Couldn't look that place up right now.");
    }
  });

  // Ask for the visitor's position; anything short of a fix means London.
  function locate() {
    if (!navigator.geolocation) {
      load(DEFAULT_PLACE);
      return;
    }
    status("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ name: "Your location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => load(DEFAULT_PLACE),
      { timeout: 8000, maximumAge: 600000 }
    );
  }

  locateBtn.addEventListener("click", locate);

  // A debug handle, like the games have: set any day's weather by hand.
  window.__weather = {
    scene,
    get days() { return days; },
    show(d, hour) {
      nowHour = hour === undefined ? null : hour;
      days = [Object.assign({ date: new Date().toISOString().slice(0, 10), code: 2, max: 16, min: 9, appMax: 16, appMin: 9, rainProb: 0, rainSum: 0, wind: 10, uv: 2 }, d)];
      dayIndex = 0;
      render();
    },
    step(sec) { step(sec); draw(); },
    // For test/weather-doll.html: every look she can wear, and its layers.
    wardrobe: WARDROBE, rainLooks: RAIN_LOOKS, dollLayers
  };

  // A place picked on an earlier visit wins; otherwise try where they are.
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  } catch (e) { /* ignore */ }
  if (saved && typeof saved.lat === "number" && typeof saved.lon === "number" && saved.name) load(saved);
  else locate();
})();

// About card: until images/amber.jpg exists the photo slot shows initials.
(() => {
  document.querySelectorAll(".ab-photo img").forEach((img) => {
    const drop = () => img.remove();
    if (img.complete && !img.naturalWidth) drop();
    else img.addEventListener("error", drop);
  });
})();
