/* Traffic has to get through the junctions that have no lights.

   With no signal and no rule, two cars arriving at a crossroads together both
   pulled in, met in the middle, and sat nose to nose until the stuck timer
   lifted one of them off the map. Nothing on screen says "deadlock"; you just
   see cars sitting in the box and then vanishing.

   So run the town's traffic for thirty seconds and read the game's own log of
   cars it had to give up on. Any of those near an unsignalled junction fails. */
return (async () => {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px';
  f.src = '/wizz-delivery/index.html?case=giveway';
  document.body.appendChild(f);
  await new Promise((r) => { f.onload = () => setTimeout(r, 500); });
  const D = f.contentWindow.__wizz;
  if (!D) return JSON.stringify({ pass: false, detail: 'no debug handle' });
  const t0 = f.contentWindow.performance.now();
  await new Promise((r) => setTimeout(r, 30000));
  const log = D.stuckLog.filter((e) => e.at >= t0);
  const boxes = D.crossings || [];
  const atBox = log.filter((e) => boxes.some((b) => Math.hypot(e.x - b.x, e.y - b.y) < b.r + 1.5));
  const where = log.slice(0, 8).map((e) => `${e.why}@${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(' ');
  f.remove();
  const problems = [];
  if (!boxes.length) problems.push('no unsignalled junctions found — D.crossings is empty');
  if (atBox.length) problems.push(`${atBox.length} cars given up on at unsignalled junctions`);
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' | ' : '')
      + `${boxes.length} unsignalled junctions, ${log.length} cars given up on in 30s anywhere: ${where}`,
  });
})();
