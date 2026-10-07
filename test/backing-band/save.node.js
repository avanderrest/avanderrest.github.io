/* What the band keeps between visits, it keeps right.

   The save (backing-band-save-v2) holds a best percentage per part per song, the song
   last picked, the speed, Vocals on or off, the mode, and the looper's take. In Node:
   a v1 save's stars carry across as percentages (three stars 100, two 80, one 50); a
   worse score never replaces a best; a fresh band built from a JSON copy of the save
   opens on the same song with the same scores. */
import { createBand, freshSave, fromV1, SONGS } from '../../backing-band/sim.js';

export default function () {
  const problems = [];
  const song = SONGS[2];
  const [a, b, c] = song.allParts;

  const v1 = { stars: { [song.id]: { [a.key]: 3, [b.key]: 2, [c.key]: 1 } }, song: song.id, speed: 0.75 };
  const carried = fromV1(v1);
  const got = [a, b, c].map((p) => carried.pct[song.id][p.key]).join('/');
  if (got !== '100/80/50') problems.push(`v1 stars came across as ${got}`);
  if ('stars' in carried || carried.speed !== 0.75) problems.push('the v1 carry lost or kept the wrong fields');

  const save = Object.assign(freshSave(), carried);
  const game = createBand({ save });
  game.chooseSong(song.id);
  game.keepPct(b, 60);
  if (game.pctOf(song, b) !== 80) problems.push(`a worse score replaced the best: ${game.pctOf(song, b)}`);
  game.keepPct(c, 90);
  if (game.pctOf(song, c) !== 90) problems.push(`a better score did not replace the best: ${game.pctOf(song, c)}`);
  game.chooseSong(SONGS[5].id);
  save.jam = { len: 2, events: [{ t: 0.5, mk: 'drums|kick|||' }] };

  const copy = JSON.parse(JSON.stringify(save));
  const again = createBand({ save: Object.assign(freshSave(), copy) });
  if (again.state.song !== SONGS[5]) problems.push(`a fresh band opened on ${again.state.song.id}, not ${SONGS[5].id}`);
  if (again.state.speed !== 0.75) problems.push(`speed came back as ${again.state.speed}`);
  const back = [a, b, c].map((p) => again.pctOf(song, p)).join('/');
  if (back !== '100/80/90') problems.push(`scores came back as ${back}`);
  if (again.save.jam.events.length !== 1) problems.push('the looper take was lost');
  const odd = createBand({ save: Object.assign(freshSave(), { song: 'no-such-song', speed: 3 }) });
  if (odd.state.song !== SONGS[0] || odd.state.speed !== 1) problems.push('a save naming a missing song or speed did not fall back');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `v1 stars to ${got}; after a 60 and a 90, ${back}; reopened on ${again.state.song.id} at speed ${again.state.speed}, ${again.save.jam.events.length} looper note`,
  };
}
