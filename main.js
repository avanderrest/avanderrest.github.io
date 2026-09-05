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
  const canvas = document.getElementById("conga-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const pointer = { x: 0, y: 0, active: false };
  const mama = { x: 80, y: 80, angle: 0, speed: 0, phase: 0, diveT: 0, diveDelay: 0, kickT: 0.3 };
  const trail = [];
  const ducks = [];
  const ripples = [];
  const TRAIL_MAX = 480;
  const GAP = 17;
  const DIVE_DUR = 1.15;
  let W = 0;
  let H = 0;
  let seen = true;
  let wakeT = 0;
  let wanderT = Math.random() * 40;
  let stillT = 0;
  let disp = 0;

  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    ducks.push({
      x: mama.x - i * GAP,
      y: mama.y,
      angle: 0,
      phase: Math.random() * 6.28,
      sx: Math.cos(a) * (26 + Math.random() * 44),
      sy: Math.sin(a) * (18 + Math.random() * 34),
      diveT: 0,
      diveDelay: 0,
      kickT: Math.random() * 0.6
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (trail.length === 0) {
      for (let i = 0; i < 60; i++) trail.push({ x: mama.x, y: mama.y, a: mama.angle });
    }
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
    stillT = 0;
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });

  canvas.addEventListener("pointerdown", (e) => {
    const p = pointerPos(e);
    ripples.push({ x: p.x, y: p.y, r: 2, a: 0.36 });
    mama.diveDelay = 0.02;
    ducks.forEach((d, i) => {
      d.diveDelay = 0.14 + i * 0.07 + Math.random() * 0.06;
    });
  });

  function posAt(dist) {
    let remaining = dist;
    for (let i = trail.length - 1; i > 0; i--) {
      const a = trail[i];
      const b = trail[i - 1];
      const seg = Math.hypot(a.x - b.x, a.y - b.y);
      if (seg >= remaining && seg > 0) {
        const t = remaining / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: a.a };
      }
      remaining -= seg;
    }
    const p = trail[0];
    return { x: p ? p.x : mama.x, y: p ? p.y : mama.y, a: mama.angle };
  }

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function stepDive(o, dt) {
    if (o.diveDelay > 0) {
      o.diveDelay -= dt;
      if (o.diveDelay <= 0) {
        o.diveDelay = 0;
        o.diveT = DIVE_DUR;
        ripples.push({ x: o.x, y: o.y, r: 2, a: 0.32 });
      }
      return;
    }
    if (o.diveT > 0) {
      o.diveT -= dt;
      if (o.diveT <= 0) {
        o.diveT = 0;
        ripples.push({ x: o.x, y: o.y, r: 3, a: 0.36 });
      }
    }
  }

  function diveOf(o) {
    if (o.diveT <= 0) return 0;
    return Math.sin((1 - o.diveT / DIVE_DUR) * Math.PI);
  }

  function stepPaddle(o, size, dt, moving) {
    o.kickT -= dt * (0.9 + mama.speed * 0.012);
    if (o.kickT <= 0) {
      o.kickT = 0.45 + Math.random() * 0.35;
      if (moving && o.diveT <= 0) {
        ripples.push({
          x: o.x - Math.cos(o.angle) * size * 1.15,
          y: o.y - Math.sin(o.angle) * size * 1.15,
          r: 1,
          a: 0.16
        });
      }
    }
  }

  function step(dt) {
    let tx;
    let ty;
    if (pointer.active) {
      tx = pointer.x;
      ty = pointer.y;
    } else {
      wanderT += dt;
      tx = W / 2 + Math.sin(wanderT * 0.37) * W * 0.36;
      ty = H / 2 + Math.sin(wanderT * 0.73 + 1.7) * H * 0.3;
    }
    const f = 1 - Math.exp(-dt * 3.4);
    const px = mama.x;
    const py = mama.y;
    mama.x += (tx - mama.x) * f;
    mama.y += (ty - mama.y) * f;
    const md = Math.hypot(mama.x - px, mama.y - py);
    mama.speed += ((md / Math.max(dt, 0.001)) - mama.speed) * 0.2;
    if (md > 0.03) mama.angle = Math.atan2(mama.y - py, mama.x - px);
    mama.phase += dt * (1.6 + mama.speed * 0.055);

    stillT += dt;
    const wantDisp = pointer.active && stillT > 0.5 ? 1 : 0;
    disp += (wantDisp - disp) * Math.min(1, dt * 2.4);

    trail.push({ x: mama.x, y: mama.y, a: mama.angle });
    while (trail.length > TRAIL_MAX) trail.shift();

    wakeT -= dt;
    if (wakeT <= 0 && mama.speed > 30) {
      wakeT = 0.4;
      const tp = trail[Math.max(0, trail.length - 14)];
      ripples.push({ x: tp.x, y: tp.y, r: 1.5, a: 0.26 });
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 16 * dt;
      rp.a -= 0.32 * dt;
      if (rp.a <= 0) ripples.splice(i, 1);
    }

    ducks.forEach((d, i) => {
      const tgt = posAt((i + 1) * GAP);
      const ox = d.sx * disp + Math.sin(d.phase * 0.8 + i) * 6 * disp;
      const oy = d.sy * disp + Math.cos(d.phase * 0.66 + i * 1.3) * 5 * disp;
      const g = 1 - Math.exp(-dt * (9 - 4.5 * disp));
      d.x += (tgt.x + ox - d.x) * g;
      d.y += (tgt.y + oy - d.y) * g;
      d.angle += normAngle(tgt.a - d.angle) * Math.min(1, dt * (8 - 4 * disp));
      d.phase += dt * (2.4 + mama.speed * 0.05) * (1 - disp * 0.35);
      stepDive(d, dt);
      stepPaddle(d, 6.5, dt, mama.speed > 22);
    });
    stepDive(mama, dt);
    stepPaddle(mama, 10.5, dt, mama.speed > 26);
  }

  function drawDuck(x, y, angle, size, colors, phase, dip, swim) {
    dip = dip || 0;
    swim = swim === undefined ? 1 : swim;
    const bob = Math.sin(phase) * size * (0.03 + swim * 0.05);
    ctx.save();
    ctx.globalAlpha = 1 - dip * 0.72;
    ctx.translate(x, y + bob + dip * size * 1.9);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, size * 1.02 * (0.85 + swim * 0.17), size * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.shade;
    ctx.beginPath();
    ctx.moveTo(-size * 0.82, 0);
    ctx.lineTo(-size * 1.42, -size * 0.4);
    ctx.lineTo(-size * 1.42, size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.72, 0, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.beak;
    ctx.beginPath();
    ctx.moveTo(size * 1.06, 0);
    ctx.lineTo(size * 1.54, -size * 0.15);
    ctx.lineTo(size * 1.54, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#20242c";
    ctx.beginPath();
    ctx.arc(size * 0.84, -size * 0.17, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.84, size * 0.17, size * 0.08, 0, Math.PI * 2);
    ctx.fill();
    if (dip > 0.03) {
      const surfY = -dip * size * 1.9;
      ctx.fillStyle = `rgba(13, 43, 58, ${0.3 + dip * 0.42})`;
      ctx.beginPath();
      ctx.ellipse(0, surfY, size * 1.75, size * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(148, 210, 255, ${dip * 0.28})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, surfY, size * 1.75, size * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
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

    const swim = Math.min(1, mama.speed / 60);
    for (let i = ducks.length - 1; i >= 0; i--) {
      const d = ducks[i];
      drawDuck(d.x, d.y, d.angle, 6.5, { body: "#ffd94a", shade: "#dfae2f", beak: "#f2913c" }, d.phase + i, diveOf(d), swim * (1 - disp * 0.4));
    }
    drawDuck(mama.x, mama.y, mama.angle, 10.5, { body: "#f4efe4", shade: "#cfc4ab", beak: "#ef8f3a" }, mama.phase, diveOf(mama), swim);
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
  const hintEl = document.getElementById("frog-hint");

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
  let caught = 0;

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

  function updateHint() {
    if (!hintEl) return;
    hintEl.textContent = caught > 0
      ? `${caught} ${caught === 1 ? "fly" : "flies"} caught \u00b7 click a lily pad`
      : "Click a lily pad";
  }

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
      caught++;
      updateHint();
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

  const DEFAULT_PLACE = { name: "Coventry", lat: 52.4068, lon: -1.5197 };
  const STORE_KEY = "wx-place";

  const CODES = {
    0: ["Clear sky", "☀️"],
    1: ["Mainly clear", "🌤️"],
    2: ["Partly cloudy", "⛅"],
    3: ["Overcast", "☁️"],
    45: ["Fog", "🌫️"],
    48: ["Freezing fog", "🌫️"],
    51: ["Light drizzle", "🌦️"],
    53: ["Drizzle", "🌦️"],
    55: ["Heavy drizzle", "🌧️"],
    56: ["Freezing drizzle", "🌧️"],
    57: ["Freezing drizzle", "🌧️"],
    61: ["Light rain", "🌦️"],
    63: ["Rain", "🌧️"],
    65: ["Heavy rain", "🌧️"],
    66: ["Freezing rain", "🌧️"],
    67: ["Freezing rain", "🌧️"],
    71: ["Light snow", "🌨️"],
    73: ["Snow", "🌨️"],
    75: ["Heavy snow", "❄️"],
    77: ["Snow grains", "🌨️"],
    80: ["Light showers", "🌦️"],
    81: ["Showers", "🌧️"],
    82: ["Heavy showers", "🌧️"],
    85: ["Snow showers", "🌨️"],
    86: ["Snow showers", "🌨️"],
    95: ["Thunderstorm", "⛈️"],
    96: ["Storm with hail", "⛈️"],
    99: ["Storm with hail", "⛈️"]
  };

  function describe(code) {
    return CODES[code] || ["Changeable", "🌥️"];
  }

  function isSnow(code) {
    return (code >= 71 && code <= 77) || code === 85 || code === 86;
  }

  function isWet(code) {
    return code >= 51 && code <= 99 && !isSnow(code);
  }

  function whatToWear(d) {
    const feel = d.appMax;
    const morning = d.appMin;
    let main;
    if (feel < 3) main = "Heavy coat, hat, gloves and a scarf.";
    else if (feel < 8) main = "Warm coat and a scarf. Layer up.";
    else if (feel < 13) main = "A proper jacket or a thick jumper.";
    else if (feel < 18) main = "Light jacket or a hoodie.";
    else if (feel < 23) main = "Long sleeves or a tee with jeans.";
    else if (feel < 28) main = "T-shirt and something light on the legs.";
    else main = "Loose, light fabrics. Stay in the shade.";

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

  function dayLabel(i, iso) {
    const d = new Date(iso + "T12:00:00");
    const wd = d.toLocaleDateString(undefined, { weekday: "short" });
    return `<b>${i === 0 ? "Today" : "Tomorrow"}</b> &middot; ${wd}`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function render(place, data) {
    const dl = data.daily;
    const nowT = data.current && typeof data.current.temperature_2m === "number"
      ? Math.round(data.current.temperature_2m) : null;
    const cards = [];
    for (let i = 0; i < 2 && i < dl.time.length; i++) {
      const d = {
        code: dl.weather_code[i],
        max: dl.temperature_2m_max[i],
        min: dl.temperature_2m_min[i],
        appMax: dl.apparent_temperature_max[i],
        appMin: dl.apparent_temperature_min[i],
        rainProb: dl.precipitation_probability_max[i] || 0,
        rainSum: dl.precipitation_sum[i] || 0,
        wind: dl.wind_speed_10m_max[i] || 0,
        uv: dl.uv_index_max[i] || 0
      };
      const [cond, icon] = describe(d.code);
      const wear = whatToWear(d);
      const meta = [];
      if (i === 0 && nowT !== null) meta.push(`Now ${nowT}&deg;`);
      meta.push(`Rain ${Math.round(d.rainProb)}%`);
      meta.push(`Wind ${Math.round(d.wind)} km/h`);
      if (d.uv >= 3) meta.push(`UV ${Math.round(d.uv)}`);
      cards.push(`
        <div class="wx-day">
          <div class="wx-day-name">${dayLabel(i, dl.time[i])}</div>
          <div class="wx-main">
            <span class="wx-icon" aria-hidden="true">${icon}</span>
            <div class="wx-temps">
              <span class="wx-hi">${Math.round(d.max)}&deg;</span>
              <span class="wx-lo">low ${Math.round(d.min)}&deg; &middot; feels ${Math.round(d.appMax)}&deg;</span>
            </div>
          </div>
          <p class="wx-cond">${cond}</p>
          <div class="wx-meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
          <div class="wx-wear">
            <p class="wx-wear-main">${esc(wear.main)}</p>
            ${wear.extras.map((e) => `<p>${esc(e)}</p>`).join("")}
          </div>
        </div>`);
    }
    daysEl.innerHTML = cards.join("");
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

  async function fetchForecast(place) {
    const q = new URLSearchParams({
      latitude: place.lat,
      longitude: place.lon,
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min",
        "apparent_temperature_max", "apparent_temperature_min",
        "precipitation_probability_max", "precipitation_sum",
        "wind_speed_10m_max", "uv_index_max"
      ].join(","),
      current: "temperature_2m",
      timezone: "auto",
      forecast_days: "2"
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    return res.json();
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
  async function load(place) {
    if (busy) return;
    busy = true;
    status(`Checking the sky over ${place.name}…`);
    try {
      const data = await fetchForecast(place);
      render(place, data);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(place)); } catch (e) { /* ignore */ }
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
      const place = await geocode(name);
      if (!place) {
        status(`Couldn't find "${name}". Try a town or city name.`);
        return;
      }
      input.value = "";
      load(place);
    } catch (e) {
      status("Couldn't look that place up right now.");
    }
  });

  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      status("Your browser doesn't share location.");
      return;
    }
    status("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ name: "Your location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => status("Location was blocked. Type a place instead."),
      { timeout: 8000, maximumAge: 600000 }
    );
  });

  let start = DEFAULT_PLACE;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number" && saved.name) start = saved;
  } catch (e) { /* ignore */ }
  load(start);
})();
