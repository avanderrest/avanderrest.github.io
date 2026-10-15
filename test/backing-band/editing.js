/* Editing the timeline, and what a held note looks like.

   1. Play mine turns into Stop while it plays, and back when stopped.
   2. A placed note dragged (real pointer events) to another slot moves there, onto that
      slot's row; a tap on a placed note removes it.
   3. A note rings on until your next one: Synthwave's verse synth holds each chord for
      eight steps, so one placed note sounds for eight, and the seven slots after it are
      drawn as its tail.
   5. In play-along, a long note's pad flashes, then rings half-lit with a bar running down,
      rather than staying fully lit as if it should be held. */
return (async () => {
  const B = window.__band;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const notes = [];
  const help = document.getElementById('help');
  if (help.open) help.close();
  const ptr = (el, type, x, y) => (type === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }));
  const mid = (el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };

  B.selectSong('neon-highway');
  B.selectSection('verse');
  B.setSpeed(1);
  const dock = document.getElementById('dock');
  const song = B.state.song;
  const verse = song.sections.find((s) => s.id === 'verse').parts.synth;
  const chorus = song.sections.find((s) => s.id === 'chorus').parts.synth;
  // the timeline shows the section picked; a slot is the synth's row and step in it
  const cell = (step, b) => dock.querySelector(`.tl-cell[data-inst="synth"][data-step="${step}"][data-b="${b}"]`);
  for (const k of Object.keys(B.drafts)) B.drafts[k].clear();

  // 1. Play mine / Stop
  B.placeNote(verse, 0, 0);
  const go = B.tl.go;
  go.click();
  const playingText = go.textContent;
  if (!/Stop/.test(playingText)) problems.push(`Play mine reads "${playingText}" while playing`);
  go.click();
  if (B.state.playing) problems.push('pressing Stop did not stop');
  if (!/Play mine/.test(go.textContent)) problems.push(`after stopping it reads "${go.textContent}"`);
  notes.push(`button: "${playingText}" while playing`);

  // 2. move by dragging, then tap to remove
  const from = cell(0, 0), to = cell(8, 1);
  to.scrollIntoView({ block: 'center', inline: 'center' });
  const [fx, fy] = mid(from), [tx, ty] = mid(to);
  ptr(from, 'pointerdown', fx, fy);
  ptr(from, 'pointermove', fx + 10, fy);
  ptr(from, 'pointermove', tx, ty);
  ptr(from, 'pointerup', tx, ty);
  const d = B.drafts[verse.key];
  if (d.has('0|0') || !d.has('8|1')) problems.push(`after the move the verse holds ${[...d.keys()]}, wanted 8|1`);
  const moved = cell(8, 1);
  const [mx, my] = mid(moved);
  ptr(moved, 'pointerdown', mx, my);
  ptr(moved, 'pointerup', mx, my);
  if (d.size) problems.push(`a tap on the placed note left ${[...d.keys()]}`);

  // 3. the held chord: one note rings for the whole hold, and shows its tail
  const held = verse.events[0];
  B.placeNote(verse, held.step, held.b);
  const mine = B.minePart(verse).events[0];
  if (mine.len !== held.len) problems.push(`one placed note rings ${mine.len} steps, the real chord ${held.len}`);
  const tails = dock.querySelectorAll(`.tl-cell.tail[data-inst="synth"][data-b="${held.b}"]`).length;
  if (tails !== held.len - 1) problems.push(`${tails} tail slots drawn, wanted ${held.len - 1}`);
  notes.push(`held chord ${held.len} steps; mine rings ${mine.len}, ${tails} tail slots`);

  // 5. a long note in play-along rings rather than staying lit
  B.selectSection('verse');
  B.state.quiet = true;
  B.showPart('synth');
  await wait(600);
  const pads = [...document.querySelectorAll('#rack .pad')];
  const ringing = pads.filter((p) => p.classList.contains('ring')).length;
  const lit = pads.filter((p) => p.classList.contains('lit')).length;
  if (!ringing) problems.push(`600ms into a held chord no pad is ringing (${lit} fully lit)`);
  notes.push(`600ms into the verse synth: ${ringing} ringing, ${lit} lit`);
  B.stop();
  B.state.quiet = false;
  if (document.querySelector('.pad.ring, .pad.lit')) problems.push('Stop left a pad lit');

  return JSON.stringify({ pass: problems.length === 0, detail: notes.join('; ') + (problems.length ? '\n  ' + problems.join('\n  ') : '') });
})();
