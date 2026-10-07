/* Every song can be played through to the whole band, both ways of learning a part.

   In Node, through the real rules, for each of the thirty songs: take every part of every
   section in turn and press what it asks for, beat by beat (on a song's first part, one
   wrong button first, which must cost exactly that beat's share and still let the turn
   finish). Every turn has to end, score what it should and keep its best, and when the
   last part is in the song has to say the whole band is done. Then every part is built on
   the timeline note for note, which must check as solved at 100%, and with one note a step
   late, which must say "nearly" for it and not solve.

   Also: the songs parse with no problems, and the Easy / Medium / Hard thirds stay
   balanced. (songs.js plays every song through the real page; this one is the rules.) */
import { createBand, freshSave, SONGS, problems, LEVELS, scoreTimeline } from '../../backing-band/sim.js';

const notesOf = (events) => new Map(events.map((e) => [e.step + '|' + e.b, { step: e.step, b: e.b }]));

export default function () {
  const issues = [...problems];
  let turns = 0, presses = 0, timeline = 0;
  const saves = { n: 0 };
  const game = createBand({ save: freshSave(), on: (ev) => { if (ev === 'save') saves.n++; } });
  const { state } = game;

  for (const song of SONGS) {
    game.chooseSong(song.id);
    let first = true;
    for (const sec of song.sections) {
      state.section = sec;
      for (const part of sec.partList) {
        if (!game.beginTurn(part.inst)) { issues.push(`${song.id}/${part.key}: no turn`); continue; }
        const n = part.groups.length;
        if (first) {
          const wrong = part.buttons.findIndex((_, i) => !part.groups[0].bs.includes(i));
          if (wrong >= 0) {
            const r = game.pressTurn(part.inst, wrong);
            if (!r || r.good || r.want.join() !== part.groups[0].bs.join()) issues.push(`${song.id}/${part.key}: a wrong press read as ${JSON.stringify(r)}`);
          } else first = 'none';
        }
        let done = false;
        for (const g of part.groups) {
          for (const b of g.bs) {
            const r = game.pressTurn(part.inst, b);
            presses++;
            if (!r || !r.good) { issues.push(`${song.id}/${part.key}: the right press ${b} at step ${g.step} was refused`); break; }
            done = !!r.done;
          }
        }
        if (!done) { issues.push(`${song.id}/${part.key}: the turn never finished`); state.turn = null; continue; }
        const { pct } = game.finishTurn();
        const expect = first === true ? Math.round(100 * (n - 1) / n) : 100;
        if (pct !== expect) issues.push(`${song.id}/${part.key}: scored ${pct}%, expected ${expect}%`);
        if (game.keepPct(part, pct) !== pct) issues.push(`${song.id}/${part.key}: best not kept`);
        if (first === true) {
          // a clean second go replaces the slip
          game.beginTurn(part.inst);
          for (const g of part.groups) for (const b of g.bs) game.pressTurn(part.inst, b);
          const again = game.finishTurn();
          if (game.keepPct(part, again.pct) !== 100) issues.push(`${song.id}/${part.key}: a clean replay did not reach 100%`);
        }
        first = false;
        turns++;
      }
      if (sec.partList.length && !game.sectionDone(song, sec)) issues.push(`${song.id}/${sec.id}: not done after every part`);
    }
    if (!game.allDone(song)) issues.push(`${song.id}: not the whole band after every part`);
    if (game.pctOfParts(song, song.allParts) !== 100) issues.push(`${song.id}: ${game.pctOfParts(song, song.allParts)}% complete`);

    for (const part of song.allParts) {
      const exact = scoreTimeline(part, notesOf(part.events));
      if (!exact.solved || exact.pct !== 100) issues.push(`${song.id}/${part.key}: the timeline built note for note scored ${exact.pct}%`);
      const late = part.events.map((e, i) => (i === 0 ? { ...e, step: (e.step + 1) % part.length } : e));
      const moved = notesOf(late);
      if (moved.size === part.events.length && !notesOf(part.events).has(late[0].step + '|' + late[0].b)) {
        const off = scoreTimeline(part, moved);
        if (off.solved || off.near < 1) issues.push(`${song.id}/${part.key}: one note a step late read as ${off.near} nearly, solved ${off.solved}`);
      }
      timeline++;
    }
  }

  const byLevel = Object.fromEntries(LEVELS.map((lv) => [lv, SONGS.filter((s) => s.level === lv).length]));
  const counts = Object.values(byLevel);
  if (Math.max(...counts) - Math.min(...counts) > 1) issues.push(`levels lopsided: ${JSON.stringify(byLevel)}`);

  return {
    pass: !issues.length,
    detail: (issues.length ? issues.slice(0, 8).join(' | ') + (issues.length > 8 ? ` (+${issues.length - 8} more)` : '') + ' -- ' : '') +
      `${SONGS.length} songs to the whole band: ${turns} turns, ${presses} presses, ${timeline} parts built on the timeline; ` +
      `levels ${LEVELS.map((lv) => lv + ' ' + byLevel[lv]).join(', ')}; ${saves.n} saves asked for`,
  };
}
