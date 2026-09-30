/* A passenger wants a colour, not a place, and a train isn't tied to the line
   it was put on — it runs over all the track it's joined to. So track laid in
   two colours that meet at one station is one route: a single train must
   carry a peg from one end to the other, across the join. The routing table
   (routing.dist, stops to the nearest station of each colour) decides whether
   a peg boards at all and is rebuilt on every track edit — easy to get subtly
   wrong, and then the peg just waits forever with nothing on screen amiss. */
const RB = window.routeBuilder;
RB.newGame('calm'); // calm: happiness never intervenes, isolates the routing question
RB.state.inv.track = 999;
RB.state.inv.bridges = 99; // wherever the random river falls
RB.state.growTimer = 1e9;

const a = RB.spawnStation('house'); a.x = 200; a.y = 200;
const b = RB.spawnStation('shop'); b.x = 500; b.y = 200;
const c = RB.spawnStation('school'); c.x = 800; c.y = 200;
const d = RB.spawnStation('park'); d.x = 1100; d.y = 200;
[a, b, c, d].forEach((s) => { s.pegTimer = 1e9; s.walkTimer = 1e9; s.pegs.length = 0; }); // no natural spawns

RB.buildDraft([a.id, b.id, c.id]);
// Drag FROM d INTO c: starting at c would extend the first line instead of
// laying a second colour (see beginDraft/endpointOf in game.js).
RB.buildDraft([d.id, c.id]);
RB.addTrain(RB.lines[0].id, 3); // one train, put on the first line only

const hops = RB.routing.dist.park.get(a.id);
RB.spawnPeg(a.id, 'park'); // d is only on the second line

let ticks = 0;
while (RB.state.stats.delivered === 0 && ticks < 6000) { RB.tick(1, 1 / 20); ticks++; }

const pass = hops === 3 && RB.state.stats.delivered === 1 && ticks < 6000;
return JSON.stringify({
  pass,
  detail: `stops a→park = ${hops} (expect 3); one train, delivered = ${RB.state.stats.delivered} after ${ticks} ticks`,
});
