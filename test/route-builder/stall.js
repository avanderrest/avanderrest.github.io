/* A cosy builder can still go quietly wrong the way the twitchier games here do:
   a train that arrives somewhere with no way on it will take (a junction whose
   points never settle, a dead end it never turns round at) could stick there
   forever, and nothing on screen would look wrong
   until the queues never stopped growing. This wires up a busy little network —
   two lines meeting at one interchange station — force-feeds it far more
   passengers than it can comfortably take, and runs a long stretch of simulated
   time. It passes only
   if deliveries keep climbing throughout (nobody permanently wedged), every
   train's position stays a finite number (no NaN creeping into the physics), and
   the run reaches its full time budget without the page throwing. */
const RB = window.routeBuilder;
RB.newGame('calm'); // calm — this is about the simulation staying alive, not about failing it
RB.state.inv.track = 999; // however the random river falls, laying two full lines must not run out of track
RB.state.inv.bridges = 99;

const types = ['house', 'shop', 'school', 'park'];
const stations = RB.stations.slice(0, 3);
while (stations.length < 7) stations.push(RB.spawnStation());
stations.forEach((s, i) => {
  s.type = types[i % types.length];
  s.x = 200 + (i % 4) * 300;
  s.y = 200 + Math.floor(i / 4) * 400;
});

const ids = stations.map((s) => s.id);
RB.buildDraft([ids[0], ids[1], ids[2], ids[3]]); // a line across the top
RB.buildDraft([ids[4], ids[5], ids[6], ids[0]]); // a second line, meeting the first at station 0
RB.lines.forEach((l) => { RB.addTrain(l.id, 3); RB.addTrain(l.id, 3); });

// Force far more demand than 7 stations can comfortably clear.
for (let round = 0; round < 15; round++) {
  stations.forEach((s) => RB.spawnPeg(s.id));
}

const samples = [];
const STEPS = 20;
for (let i = 0; i < STEPS; i++) {
  RB.tick(300, 1 / 20); // 15 simulated seconds per sample
  samples.push(RB.state.stats.delivered);
}

const notes = [];
const checks = [];
const check = (name, ok) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}`); };

check('deliveries climb rather than flatlining early', samples[samples.length - 1] > samples[Math.floor(samples.length / 3)]);
check('deliveries are still moving in the final stretch', samples[samples.length - 1] > samples[samples.length - 2]
  || samples[samples.length - 2] > samples[samples.length - 3]); // allow one quiet sample, not two
check('every train position is a finite number', RB.trains.every((t) => Number.isFinite(t.prog)));
check('nobody sits on a negative or nonsensical progress value', RB.trains.every((t) => t.prog >= 0 && t.prog <= 1 && RB.stations.some((s) => s.id === t.at)));
check('happiness stayed a real percentage throughout', Number.isFinite(RB.state.happiness) && RB.state.happiness === 100);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: `delivered over time: ${samples.join(',')}; ${notes.join('; ')}`,
});
