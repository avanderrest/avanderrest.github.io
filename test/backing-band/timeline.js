/* The timeline scores what you place, and the song picker picks.

   1. The picker: the Songs button opens it, and a card picks that song and closes it.
   2. Dragging: a real pointer press on an instrument's pad (on the left) and release over
      a slot puts a note on that pad's own row at that step — it is all events.
   3. Scoring: a note on the right button and step is spot on; a step either side is nearly;
      another button at a step that has a note is right time, wrong note; anywhere else is
      off; and the tally knows how many are still to find without saying where (a note a
      step late still leaves its true spot to find).
   4. Play mine: plays only what you placed, and each note has taken its colour by the end.
      A check scores the part as a percentage and shows it beside the instrument's name;
      building the part perfectly finishes it at 100%.
   6. The timeline shows one section, every instrument in it; picking another section
      shows that one. */
return (async () => {
  const B = window.__band;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const notes = [];

  // a first visit opens How to play over everything; a player closes it first
  const help = document.getElementById('help');
  if (help.open) help.close();

  // 1. the picker
  const picker = document.getElementById('picker');
  document.getElementById('btn-pick').click();
  if (!picker.open) problems.push('the Songs button did not open the picker');
  const card = picker.querySelector('.song[data-song="midnight-sidewalk"]');
  if (!card) problems.push('no card for Midnight Sidewalk in the picker');
  else card.click();
  if (picker.open) problems.push('picking a song left the picker open');
  if (B.state.song.id !== 'midnight-sidewalk') problems.push(`picking Midnight Sidewalk chose ${B.state.song.id}`);
  notes.push(`picker has ${picker.querySelectorAll('.song').length} songs`);

  // the timeline: the verse, every instrument in it as a block of rows
  delete B.save.pct['midnight-sidewalk'];   // an earlier case may have played it already
  B.selectSong('midnight-sidewalk');
  B.selectSection('verse');
  const dock = document.getElementById('dock');
  if (dock.hidden) problems.push('the song did not show its timeline');
  const song = B.state.song;
  const vsec = song.sections.find((sec) => sec.id === 'verse');
  const blocks = [...new Set([...dock.querySelectorAll('.tl-cell')].map((x) => x.dataset.inst))];
  const playing = song.order.filter((i) => vsec.parts[i]);
  if (blocks.join() !== playing.join()) problems.push(`timeline shows ${blocks}, the verse has ${playing}`);
  if (dock.querySelector('.tl-inst')) problems.push('the timeline has words above its rows');
  // every instrument in the section gets a row per button right across it, repeats and all
  const slots = (sec) => {
    const ps = song.order.map((i) => sec.parts[i]).filter(Boolean);
    const cols = Math.max(...ps.map((p) => p.length));
    return ps.reduce((n, p) => n + cols * p.buttons.length, 0);
  };
  if (dock.querySelectorAll('.tl-cell').length !== slots(vsec)) problems.push(`timeline has ${dock.querySelectorAll('.tl-cell').length} slots, wanted ${slots(vsec)}`);
  notes.push(`verse timeline: ${blocks.join(' | ')}`);
  // another section shows only that one
  B.selectSection('chorus');
  const csec = song.sections.find((sec) => sec.id === 'chorus');
  if (dock.querySelectorAll('.tl-cell').length !== slots(csec)) problems.push('picking the chorus did not show the chorus');
  B.selectSection('verse');
  // the verse bass: one bar, eight notes
  const part = vsec.parts.bass;
  const station = dock;
  // the left side shows only the instruments playing in the section on show
  const lefts = Object.keys(B.stations()).join();
  if (lefts !== playing.join()) problems.push(`the left shows ${lefts} in the verse, which has ${playing}`);

  // 2. a real drag: press the first pad, let go over step 4 of some other row
  const pad = B.stations().bass.pads[0];       // the instrument's own pad on the left
  const target = dock.querySelector('.tl-cell[data-inst="bass"][data-step="4"][data-b="2"]');
  target.scrollIntoView({ block: 'center', inline: 'center' });
  const pr = pad.getBoundingClientRect(), tr = target.getBoundingClientRect();
  pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: pr.x + 5, clientY: pr.y + 5, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: tr.x + tr.width / 2, clientY: tr.y + tr.height / 2, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: tr.x + tr.width / 2, clientY: tr.y + tr.height / 2, pointerId: 1 }));
  const draft = B.drafts[part.key];
  if (!draft || !draft.has('4|0')) problems.push(`the drag placed ${draft ? [...draft.keys()] : 'nothing'}, wanted 4|0 (the pad's own row)`);
  if (!dock.querySelector('.tl-cell.on[data-inst="bass"][data-step="4"][data-b="0"]')) problems.push('the dragged note is not drawn');
  draft.clear();

  // 3. scoring, on a hand-made set: every true note, but one a step late, one swapped for
  //    another button at its step, one extra on an empty step, and one left out
  const ev = part.events;
  const empty = [...Array(part.length).keys()].find((s) => !ev.some((e) => e.step === s));
  const late = ev[1], swap = ev[2], left = ev[3];
  const other = (late.b + 1) % part.buttons.length;
  const set = new Map();
  for (const e of ev) {
    if (e === left) continue;
    if (e === late) { set.set((e.step + 1) + '|' + e.b, { step: e.step + 1, b: e.b }); continue; }
    if (e === swap) { const b = (e.b + 1) % part.buttons.length; set.set(e.step + '|' + b, { step: e.step, b }); continue; }
    set.set(e.step + '|' + e.b, { step: e.step, b: e.b });
  }
  set.set(empty + '|' + other, { step: empty, b: other });
  const sc = B.scoreTimeline(part, set);
  // the late and the swapped notes each leave their own true spot empty too: three to find
  const want = { spot: ev.length - 3, near: 1, wrongnote: 1, off: 1, missing: 3 };
  for (const [k, v] of Object.entries(want)) if (sc[k] !== v) problems.push(`scored ${k} ${sc[k]}, wanted ${v}`);
  if (sc.solved) problems.push('a set with mistakes scored as solved');

  // 4. play it back for real, then build it perfectly
  for (const [k, n] of set) draft.set(k, n);
  B.setSpeed(1);
  B.checkTimeline();
  for (let i = 0; i < 200 && B.state.playing; i++) await wait(25);
  const coloured = { spot: 0, near: 0, wrongnote: 0, off: 0 };
  for (const r of Object.keys(coloured)) coloured[r] = dock.querySelectorAll(`.tl-cell.on.${r}[data-inst="bass"]:not(.tl-repeat)`).length;
  for (const r of Object.keys(coloured)) if (coloured[r] !== want[r]) problems.push(`after Play mine ${coloured[r]} notes were ${r}, wanted ${want[r]}`);
  // spot on out of placed plus still to find: 5 of 8 + 3
  // the timeline's score is its own, beside the instrument on the left
  const partial = B.stations().bass.score.textContent;
  if (partial !== 'timeline 45%') problems.push(`after the first check the bass reads "${partial}", wanted "timeline 45%"`);
  if ((B.save.pct['midnight-sidewalk'] || {})[part.key] != null) problems.push('the timeline wrote a play-along score');
  notes.push(`first check ${partial}`);
  const sum = station.querySelector('.tl-selbar').textContent;     // the one line under it
  if (!/3 still to find/.test(sum)) problems.push(`the tally reads "${sum}"`);
  notes.push(`tally "${sum}"`);

  draft.clear();
  for (const e of ev) draft.set(e.step + '|' + e.b, { step: e.step, b: e.b });
  B.checkTimeline();
  for (let i = 0; i < 200 && B.state.playing; i++) await wait(25);
  const best = (B.save.tl['midnight-sidewalk'] || {})[part.key];
  if (best !== 100) problems.push(`building it perfectly saved ${best}%, wanted 100`);
  const onRuler = B.stations().bass.score.textContent;
  if (onRuler !== 'timeline 100%') problems.push(`the bass reads "${onRuler}", wanted "timeline 100%"`);
  if (!B.state.last || !B.state.last.solved || !B.state.last.solved.includes(part.key)) problems.push('the perfect build did not count as solved');
  notes.push(`perfect build saved ${best}%; bass reads ${onRuler}`);

  B.stop();
  // the tapping and the timeline score only themselves: a timeline press during My turn
  // is not part of the turn, and Play mine ends a turn in progress
  B.selectSong('midnight-sidewalk');
  const tapInst = B.state.section.partList[0].inst;
  B.startTurn(tapInst);
  const pos = B.state.turn && JSON.stringify([B.state.turn.pos, B.state.turn.mistakes, B.state.turn.left.size, B.state.turn.missed.size]);
  const cell0 = dock.querySelector('.tl-cell');
  cell0.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 1, clientY: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: 1, clientY: 1 }));
  if (!B.state.turn || JSON.stringify([B.state.turn.pos, B.state.turn.mistakes, B.state.turn.left.size, B.state.turn.missed.size]) !== pos) problems.push('a timeline press counted towards My turn');
  B.placeNote(B.tlParts()[0], 0, 0);
  B.checkTimeline();
  if (B.state.turn) problems.push('Play mine left My turn running');
  B.stop();
  // no modes: a song always has its timeline, Mega Jam never
  if (dock.hidden) problems.push('a song hid its timeline');
  B.selectSong('mega');
  if (!dock.hidden) problems.push('Mega Jam showed a timeline');
  return JSON.stringify({ pass: problems.length === 0, detail: notes.join('; ') + (problems.length ? '\n  ' + problems.join('\n  ') : '') });
})();
