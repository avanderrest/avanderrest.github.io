/* Timeline mode scores what you place, and the song picker picks.

   1. The picker: the Songs button opens it, and a card picks that song and closes it.
   2. Dragging: a real pointer press on a button and release over a slot puts a note on
      that button's row at that slot — the drag is the whole mode, and it is all events.
   3. Scoring: a note on the right button and step is spot on; a step either side is nearly;
      another button at a step that has a note is right time, wrong note; anywhere else is
      off; and the tally knows how many are still to find without saying where (a note a
      step late still leaves its true spot to find).
   4. Play mine: plays only what you placed, and each note has taken its colour by the end.
      Building the part perfectly finishes it, with stars for few checks.
   5. The ruler (the strip of section names) plays from where it is clicked: the sections
      before are skipped, and only what is played is scored. */
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

  // the dock: the whole song's bass, a labelled line at each section, one loop each
  B.selectSong('midnight-sidewalk');
  B.setMode('timeline');
  B.dockInst('bass');
  const dock = document.getElementById('dock');
  if (dock.hidden) problems.push('timeline mode did not show the dock');
  const song = B.state.song;
  const regions = song.sections.filter((sec) => sec.parts.bass);
  const heads = [...dock.querySelectorAll('.tl-sec')].map((h) => h.textContent);
  if (heads.length !== regions.length) problems.push(`dock shows ${heads.length} sections, the bass plays in ${regions.length}`);
  const span = regions.reduce((a, sec) => a + sec.parts.bass.length, 0);
  const allCells = dock.querySelectorAll('.tl-cell');
  if (allCells.length !== span * song.instruments.bass.buttons.length) problems.push(`dock has ${allCells.length} slots, wanted ${span * song.instruments.bass.buttons.length}`);
  if (dock.querySelectorAll('.tl-cell.tl-secline').length !== regions.length * song.instruments.bass.buttons.length) problems.push('a section has no line where it starts');
  notes.push(`dock sections: ${heads.join(' | ')}`);
  // the verse bass: one bar, eight notes
  const part = song.sections.find((sec) => sec.id === 'verse').parts.bass;
  const station = dock;

  // 2. a real drag: press the first pad, let go over step 4 of some other row
  const pad = dock.querySelectorAll('.dock-pads .pad')[0];
  const target = dock.querySelector('.tl-cell[data-sec="verse"][data-step="4"][data-b="2"]');
  target.scrollIntoView({ block: 'center', inline: 'center' });
  const pr = pad.getBoundingClientRect(), tr = target.getBoundingClientRect();
  pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: pr.x + 5, clientY: pr.y + 5, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: tr.x + tr.width / 2, clientY: tr.y + tr.height / 2, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: tr.x + tr.width / 2, clientY: tr.y + tr.height / 2, pointerId: 1 }));
  const draft = B.drafts[part.key];
  if (!draft || !draft.has('4|0')) problems.push(`the drag placed ${draft ? [...draft.keys()] : 'nothing'}, wanted 4|0 (the pad's own row)`);
  if (!dock.querySelector('.tl-cell.on[data-sec="verse"][data-step="4"][data-b="0"]')) problems.push('the dragged note is not drawn');
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
  B.checkTimeline('bass');
  for (let i = 0; i < 200 && B.state.playing; i++) await wait(25);
  const coloured = { spot: 0, near: 0, wrongnote: 0, off: 0 };
  for (const r of Object.keys(coloured)) coloured[r] = dock.querySelectorAll(`.tl-cell.on.${r}[data-sec="verse"]`).length;
  for (const r of Object.keys(coloured)) if (coloured[r] !== want[r]) problems.push(`after Play mine ${coloured[r]} notes were ${r}, wanted ${want[r]}`);
  const sum = station.querySelector('.tl-sum').textContent;
  if (!/3 still to find/.test(sum)) problems.push(`the tally reads "${sum}"`);
  notes.push(`tally "${sum}"`);

  draft.clear();
  for (const e of ev) draft.set(e.step + '|' + e.b, { step: e.step, b: e.b });
  B.checkTimeline('bass');
  for (let i = 0; i < 200 && B.state.playing; i++) await wait(25);
  const best = (B.save.stars['midnight-sidewalk'] || {})[part.key];
  if (!(best >= 2)) problems.push(`building it perfectly on the second check saved ${best} stars, wanted 3`);
  if (!B.state.last || !B.state.last.solved || !B.state.last.solved.includes(part.key)) problems.push('the perfect build did not count as solved');
  notes.push(`perfect build on check 2 saved ${best} stars`);

  // 5. the ruler: click partway through the chorus (left empty) and only what you placed from
  //    there on plays and is scored — here the outro, built perfectly; the verse is behind
  const outro = song.sections.find((sec) => sec.id === 'outro').parts.bass;
  const od = B.drafts[outro.key] = new Map();
  for (const e of outro.events) od.set(e.step + '|' + e.b, { step: e.step, b: e.b });
  const ruler = dock.querySelector('.tl-sec[data-sec="chorus"]');
  ruler.scrollIntoView({ block: 'center', inline: 'center' });
  const rr = ruler.getBoundingClientRect();
  ruler.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rr.x + rr.width / 2, clientY: rr.y + rr.height / 2 }));
  const t0 = performance.now();
  for (let i = 0; i < 400 && B.state.playing; i++) await wait(25);
  const took = (performance.now() - t0) / 1000;
  const solved = (B.state.last && B.state.last.solved) || [];
  if (!solved.includes(outro.key)) problems.push(`playing from the chorus did not score the outro (${solved})`);
  if (solved.includes(part.key)) problems.push('playing from the chorus scored the verse too, which is behind it');
  // the outro is 16 steps at 117bpm, two seconds; the whole bass would be twelve
  if (took > 4.5) problems.push(`playing from the chorus took ${took.toFixed(1)}s, as if from the start`);
  notes.push(`ruler click in the chorus played ${took.toFixed(1)}s and scored ${solved.length} section`);

  B.stop();
  B.setMode('play');
  if (!dock.hidden) problems.push('play-along mode left the dock showing');
  return JSON.stringify({ pass: problems.length === 0, detail: notes.join('; ') + (problems.length ? '\n  ' + problems.join('\n  ') : '') });
})();
