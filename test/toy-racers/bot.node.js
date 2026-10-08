/* A plain driver finishes a race on every track, and the race counts.

   In Node, through sim.js and its fixed step: the same unremarkable driver as fairness.js
   (looks a fixed distance ahead, steers in whole keypresses through a wide deadband,
   never lifts, never brakes) drives three laps of every track against the mid-class
   field, with seeded dice. Each race has to end with the player's flag inside four
   minutes of race time, the standings have to place all five cars once each, the race
   has to be counted (races, and wins when it is won), and every track has to come away
   with a lap record. fairness.js asks the harder question, in the page: how the driving
   felt. */
import { createRacers } from '../../toy-racers/sim.js';

export default function () {
  const problems = [], notes = [];
  const save = { v: 2, colour: 'red', laps: 5, cls: 'mid', best: {}, wins: 0, races: 0, sound: true };
  let ends = 0, saves = 0;
  const tr = createRacers({ save, on: (ev) => { if (ev === 'end') ends++; if (ev === 'save') saves++; } });
  tr.seedDice(5);
  const { state, keys, STEP, TRACKS } = tr;

  for (const def of TRACKS) {
    const won = save.wins, raced = save.races;
    tr.setupRace(def, { laps: 3, cls: 'mid', colour: 'red' });
    const me = state.player;
    for (let t = 0; t < 3.1; t += STEP) tr.tick(STEP);
    keys.ArrowUp = true;
    let t = 0;
    while (!me.done && t < 240) {
      const T = state.track;
      const aim = T.pts[(me.si + Math.round(200 / T.step)) % T.count];
      let err = Math.atan2(aim.y - me.y, aim.x - me.x) - me.ang;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      keys.ArrowLeft = err < -0.2;
      keys.ArrowRight = err > 0.2;
      for (let k = 0; k < 4; k++) { tr.tick(STEP); t += STEP; }
    }
    keys.ArrowUp = keys.ArrowLeft = keys.ArrowRight = false;
    if (!me.done) { problems.push(`${def.id}: still on lap ${me.lap} after 240s`); continue; }
    if (state.screen !== 'done') problems.push(`${def.id}: the race did not end (screen ${state.screen})`);
    const places = tr.standings().map((c) => c.pos).sort().join('');
    if (places !== '12345') problems.push(`${def.id}: standings ${places}`);
    if (save.races !== raced + 1) problems.push(`${def.id}: not counted as a race`);
    if ((me.pos === 1) !== (save.wins === won + 1)) problems.push(`${def.id}: P${me.pos} but wins went ${won} to ${save.wins}`);
    if (!(save.best[def.id] > 0)) problems.push(`${def.id}: no lap record kept`);
    notes.push(`${def.id} P${me.pos} in ${(me.doneAt / 1000).toFixed(1)}s, best lap ${(me.best / 1000).toFixed(1)}s`);
  }
  if (ends !== TRACKS.length) problems.push(`${ends} race ends for ${TRACKS.length} races`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') + `; ${save.wins} wins of ${save.races}, ${saves} saves asked for`,
  };
}
