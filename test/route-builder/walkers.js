/* Houses with no station close by still send people: they walk to the
   nearest station, take their time about it, and arrive impatient. Each part
   of that can fail without anything looking broken — walkers who teleport,
   walk to the wrong station, never turn up, or turn up no crosser than
   anyone else. This sets up one near cluster and one far one by hand and
   checks all four, plus that houses too far from every station stay home. */
const RB = window.routeBuilder;
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

function setup(mode) {
  RB.newGame(mode);
  const S = RB.state;
  S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
  S.trees = []; S.growTimer = 1e9; S.neighborhoods = [];
  const a = RB.spawnStation('house'); a.x = 400; a.y = 400;
  const b = RB.spawnStation('shop'); b.x = 1400; b.y = 400;
  [a, b].forEach((s) => { s.pegTimer = 1e9; s.walkTimer = 1e9; });
  return { S, a, b };
}

// Who walks where.
let { S, a, b } = setup('calm');
for (let i = 0; i < 8; i++) RB.addHouse(400 + Math.cos(i) * 80, 400 + Math.sin(i) * 80);        // next to a
for (let i = 0; i < 12; i++) RB.addHouse(800 + (i % 4) * 26, 360 + Math.floor(i / 4) * 30);   // 400ish from a, 600 from b
RB.addHouse(80, 1100);                                                                          // >700 from both
check('far houses walk to their nearest station', RB.walkersFor(a.id) === 12 && RB.walkersFor(b.id) === 0,
  `a ${RB.walkersFor(a.id)}, b ${RB.walkersFor(b.id)}`);

// They take their time: ~430 units at 35/s is about 12 seconds.
a.walkTimer = 0.05;
let t = 0, sawOnFoot = false;
while (!a.pegs.some((p) => p.walked) && t < 60) {
  RB.tick(1, 1 / 20); t += 1 / 20;
  if (S.walkers.length) sawOnFoot = true;
}
const arrived = a.pegs.find((p) => p.walked);
check('someone set off on foot', sawOnFoot);
check('and arrived, marked as having walked', !!arrived, `after ${t.toFixed(1)}s`);
check('the walk took a while, not an instant', t > 9, `${t.toFixed(1)}s`);

// Impatience, in survival: three pegs on a six-place platform is fine...
({ S, a, b } = setup('survival'));
for (let i = 0; i < 3; i++) a.pegs.push({ id: 900 + i, type: 'shop', since: 0 });
RB.tick(20 * 30, 1 / 20);
const calmPlatform = S.happiness;
// ...but the same three having walked, and waited past their patience, grumble.
({ S, a, b } = setup('survival'));
for (let i = 0; i < 3; i++) a.pegs.push({ id: 900 + i, type: 'shop', since: 0, walked: true });
RB.tick(20 * 30, 1 / 20);
const grumbled = S.happiness;
check('three locals waiting cost no happiness', calmPlatform === 100, `${calmPlatform.toFixed(1)}`);
check('three walkers waiting too long do', grumbled < 97, `${grumbled.toFixed(1)}`);

// And they crowd a platform more: 5 walkers overload a 6-place platform, 5 locals don't.
({ S, a, b } = setup('survival'));
for (let i = 0; i < 5; i++) a.pegs.push({ id: 900 + i, type: 'shop', since: S.totalTime, walked: true });
RB.tick(20 * 4, 1 / 20); // 4s: inside their patience, so only the crowding counts
check('five walkers crowd a six-place platform', S.happiness < 100, `${S.happiness.toFixed(1)}`);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
