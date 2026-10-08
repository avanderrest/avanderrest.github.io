/* What Toy Racers keeps, it keeps right.

   The save (toy-racers-save-v2) holds the last colour, laps and class, a lap record per
   track, wins, races and the sound switch. In Node: nothing saved, a v1 save and junk all
   read as the blank one; a v2 save keeps its own values and its records. Then two short
   races on the first track with the plain driver: against an impossible record (1 ms) the
   record has to stand; against a slow one it has to fall to the lap just driven. A fresh
   game reading a JSON copy of the save has the same records and tallies. */
import { createRacers, readSave } from '../../toy-racers/sim.js';

function race(save, seed) {
  const tr = createRacers({ save });
  tr.seedDice(seed);
  const { state, keys, STEP, TRACKS } = tr;
  tr.setupRace(TRACKS[0], { laps: 2, cls: 'mid', colour: save.colour });
  const me = state.player;
  keys.ArrowUp = true;
  for (let t = 0; !me.done && t < 200; t += STEP) {
    if (Math.round(t / STEP) % 4 === 0) {
      const T = state.track, aim = T.pts[(me.si + Math.round(200 / T.step)) % T.count];
      let err = Math.atan2(aim.y - me.y, aim.x - me.x) - me.ang;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      keys.ArrowLeft = err < -0.2; keys.ArrowRight = err > 0.2;
    }
    tr.tick(STEP);
  }
  return { id: TRACKS[0].id, me };
}

export default function () {
  const problems = [];
  const blank = JSON.stringify(readSave(null));
  for (const [what, raw] of [['nothing', null], ['a v1 save', { v: 1, stars: 3 }], ['junk', 7]]) {
    if (JSON.stringify(readSave(raw)) !== blank) problems.push(`${what} did not read as blank`);
  }
  const kept = readSave({ v: 2, colour: 'blue', laps: 3, best: { bath: 23000 }, wins: 2, races: 5 });
  if (kept.colour !== 'blue' || kept.best.bath !== 23000 || kept.cls !== 'mid' || kept.sound !== true) problems.push(`a v2 save read as ${JSON.stringify(kept)}`);

  const save = readSave({ v: 2, colour: 'green', best: {}, wins: 0, races: 0 });
  const first = race(save, 2);
  save.best[first.id] = 1;
  race(save, 3);
  if (save.best[first.id] !== 1) problems.push(`an impossible record of 1ms fell to ${save.best[first.id]}`);
  save.best[first.id] = 9e9;
  const third = race(save, 4);
  const rec = save.best[first.id];
  if (rec !== third.me.best) problems.push(`a slow record became ${rec}, not the lap just driven (${third.me.best})`);
  if (save.races !== 3) problems.push(`${save.races} races counted, not 3`);

  const again = readSave(JSON.parse(JSON.stringify(save)));
  if (again.best[first.id] !== rec || again.races !== 3 || again.wins !== save.wins || again.colour !== 'green') problems.push('the copy read back different');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `blank for nothing, v1 and junk; ${first.id} record stood at 1ms, then fell to ${(rec / 1000).toFixed(2)}s; ${save.races} races, ${save.wins} wins read back`,
  };
}
