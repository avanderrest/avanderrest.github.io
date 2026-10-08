/* The frame loop.

     const loop = fixedLoop({ step: (dt) => sim.step(dt), render: (alpha) => draw(), hz: 60 });
     loop.start(); loop.stop(); loop.running

   step() runs at a fixed rate however fast the screen refreshes, so a game plays the same
   on a 60Hz laptop and a 120Hz phone, and a sim stepped by a test in Node behaves exactly
   like the one on screen. A long gap (a background tab) is capped at `maxFrame` seconds of
   catch-up rather than fast-forwarding through it. render() gets how far it is between
   two steps, for anyone who wants to interpolate.

     const loop = frameLoop((dt) => { update(dt); draw(); });

   frameLoop is the simple version: one call per screen frame, dt in seconds, capped. */

const raf = (f) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(f) : setTimeout(() => f(Date.now()), 16));
const caf = (h) => (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame(h) : clearTimeout(h));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function fixedLoop({ step, render = () => {}, hz = 60, maxFrame = 0.25 }) {
  const dt = 1 / hz;
  let handle = null, last = 0, acc = 0;
  const api = {
    running: false,
    start() {
      if (api.running) return api;
      api.running = true; last = now(); acc = 0;
      const tick = (t) => {
        if (!api.running) return;
        acc += Math.min(maxFrame, Math.max(0, (t - last) / 1000));
        last = t;
        while (acc >= dt) { step(dt); acc -= dt; }
        render(acc / dt);
        handle = raf(tick);
      };
      handle = raf(tick);
      return api;
    },
    stop() { api.running = false; if (handle != null) caf(handle); handle = null; return api; },
  };
  return api;
}

export function frameLoop(update, { maxDt = 0.05 } = {}) {
  let handle = null, last = 0;
  const api = {
    running: false,
    start() {
      if (api.running) return api;
      api.running = true; last = now();
      const tick = (t) => {
        if (!api.running) return;
        const d = Math.min(maxDt, Math.max(0, (t - last) / 1000));
        last = t;
        update(d);
        handle = raf(tick);
      };
      handle = raf(tick);
      return api;
    },
    stop() { api.running = false; if (handle != null) caf(handle); handle = null; return api; },
  };
  return api;
}
