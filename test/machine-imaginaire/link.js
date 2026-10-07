/* Copy link has to bring back exactly the picture on screen — including one made from
   a photo, which the link cannot carry: only its canonical palette and light map. */
return (async () => {
  const M = window.__machine;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(20, 20, 2, 32, 20, 40);
  g.addColorStop(0, '#fff6e0'); g.addColorStop(0.6, '#c0392b'); g.addColorStop(1, '#1b2631');
  x.fillStyle = g; x.fillRect(0, 0, 64, 40);
  M.setPhotoData(x.getImageData(0, 0, 64, 40), 'sunset');
  M.render({ seed: 'link-check', style: 'riley', params: { stripes: 70, waves: 2.5, colour: 'sequence' } });
  const want = M.fingerprint();
  const hash = location.hash;
  // wander off: another seed, another style, no photo
  M.clearPhoto();
  M.render({ seed: 'elsewhere', style: 'hobbs' });
  const away = M.fingerprint();
  location.hash = hash;
  for (let i = 0; i < 40 && M.S.style !== 'riley'; i++) await wait(50);
  await wait(150);
  const back = M.fingerprint();
  const ok = back === want && away !== want && location.hash === hash;
  M.clearPhoto();
  return JSON.stringify({ pass: ok, detail: 'drawn ' + want + ', elsewhere ' + away + ', from the link ' + back + ' (' + hash.length + ' chars)' });
})();
