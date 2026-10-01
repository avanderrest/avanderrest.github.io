/* You drive at the traffic's pace, and a car behind you never pins you.

   1. Everybody on the road goes the one speed. Holding up on clear tarmac
      settles at the traffic's speed; E takes you a level faster, and letting
      off until you are back at the traffic's pace drops the level again.
   2. Stopped at a door with a car come right up to you, you can still back
      away. Every frame touching another car used to cut your speed, whichever
      way you were going, and the other car sat waiting for you: both stuck.
   3. And the other car does not wait for ever: after a while it squeezes past.

   Driven on the grid map in an iframe, from the start, with the town's traffic
   cleared away so nothing else gets in the way. */
return (async () => {
  const MAP_KEY = 'dash-map-v1';
  const before = localStorage.getItem(MAP_KEY);
  localStorage.setItem(MAP_KEY, 'grid');
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;width:900px;height:600px';
  frame.src = '/wizz-delivery/index.html?case=pace';
  const w = await new Promise((resolve, reject) => {
    frame.onload = () => setTimeout(() => resolve(frame.contentWindow), 600);
    frame.onerror = () => reject(new Error('iframe failed'));
    document.body.appendChild(frame);
  });
  const finish = () => {
    frame.remove();
    if (before === null) localStorage.removeItem(MAP_KEY); else localStorage.setItem(MAP_KEY, before);
  };
  const D = w.__wizz;
  const problems = [], notes = [];
  const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => w.requestAnimationFrame(r)); };
  const key = (code, down) => w.dispatchEvent(new w.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const place = () => { D.car.x = D.START.x; D.car.y = D.START.y; D.car.h = 0; D.car.v = 0; };

  const npc = D.traffic[0];
  const speeds = D.traffic.map((t) => t.speed);
  const traffic = Math.max(...speeds);
  if (Math.min(...speeds) !== traffic) problems.push(`traffic speeds differ: ${Math.min(...speeds)}..${traffic}`);
  D.traffic.length = 0;

  // ---- 1. cruising with the traffic, then a level up, then back ----
  place();
  key('ArrowUp', true);
  await frames(150);
  const cruise = D.car.v;
  if (Math.abs(cruise - traffic) > 0.05) problems.push(`holding up on clear tarmac settles at ${cruise.toFixed(2)}, the traffic does ${traffic}`);
  place(); D.car.v = cruise;
  key('KeyE', true); key('KeyE', false);
  await frames(90);
  const fast = D.car.v;
  if (!(fast > cruise * 1.3)) problems.push(`a level faster only reached ${fast.toFixed(2)}`);
  key('ArrowUp', false);
  key('ArrowDown', true);
  await frames(30);
  key('ArrowDown', false);
  place();
  key('ArrowUp', true);
  await frames(150);
  const after = D.car.v;
  if (Math.abs(after - traffic) > 0.05) problems.push(`after braking back down the car still runs at ${after.toFixed(2)}, so the faster level stuck`);
  key('ArrowUp', false);
  notes.push(`traffic ${traffic}, cruise ${cruise.toFixed(2)}, a level up ${fast.toFixed(2)}, after braking ${after.toFixed(2)}`);

  // ---- 2. a car nose to nose with you, then back away from it ----
  place();
  await frames(2);
  npc.curve = null; npc.wait = 0; npc.exiting = false;
  npc.x = D.car.x; npc.y = D.car.y - 0.42; npc.heading = Math.PI;
  npc.target = { x: D.car.x, y: D.car.y + 4 };
  D.traffic.push(npc);
  const y0 = D.car.y;
  key('ArrowDown', true);
  await frames(90);
  key('ArrowDown', false);
  const back = D.car.y - y0;
  if (back < 0.5) problems.push(`nose to nose with a car, reversing for 1.5s moved the player only ${back.toFixed(2)} tiles`);
  notes.push(`backed ${back.toFixed(2)} tiles off a car 0.42 ahead`);

  // ---- 3. stopped in a car's way, it does not wait for ever ----
  place();
  await frames(2);
  npc.curve = null; npc.wait = 0; npc.exiting = false; npc.squeezeUntil = 0; npc.playerWait = 0;
  npc.x = D.car.x; npc.y = D.car.y + 0.9; npc.heading = 0;
  npc.target = { x: D.car.x, y: D.car.y - 4 };
  const ny0 = npc.y;
  await frames(270);
  const passed = ny0 - npc.y;
  if (passed < 1) problems.push(`a car behind the stopped player moved ${passed.toFixed(2)} tiles in 4.5s: it waits for ever`);
  notes.push(`a car held up behind you got ${passed.toFixed(2)} tiles on in 4.5s`);

  finish();
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(' | ') });
})();
