/* Every song is playable, scores right, and lights up what it plays.

   Songs are hand-written data — a typo in a pattern is a button that never lights or a
   part that can never be finished, and nothing on screen says so. So:

   1. Every pattern parses: no unknown button ids, grid rows agree, each part's length
      divides its section's, and the form only names sections that exist.
   2. Every note sits in its instrument's range (bass E1–G3, keys and synth C3–C5, singer G3–C6),
      and every button is used somewhere in its song — a button you are never asked to
      press is just a way to lose a star. A whole song stays between 45s and 2 minutes.
   3. Every part of every section can be played back through the real press path: one
      wrong note first (costs that beat, does not advance), then the right ones with
      same-beat notes in reverse order, which must still count. The part ends one beat short of 100%,
      and a clean replay lifts the saved best to 100%.
   4. Show me lights the part's pads, and only that part's; at half speed it lights the
      same pads at half the rate.
   5. Playing a whole song walks the rack through its sections and comes home after.
   6. Mega Jam has every distinct button once, plus the sounds no song uses yet; every one
      of them plays without an error, and the looper plays back what was recorded — pads
      light with nobody pressing them. */
return (async () => {
  const B = window.__band;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = B.problems.slice();
  const notes = [];
  const RANGE = { bass: [28, 55], keys: [48, 72], synth: [48, 72], strings: [55, 79], horns: [55, 79], whistle: [67, 90], guitar: [28, 64], vocals: [55, 84] };
  let parts = 0, presses = 0;

  // thousands of presses, each a sound, would bury the audio clock that the later
  // checks time against (it was seen at under half speed): this part is about scoring
  B.state.quiet = true;
  // each song is named by its genre alone, so no two may share one
  const titles = B.SONGS.map((s) => s.title);
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  if (dupes.length) problems.push(`songs share a name: ${dupes.join(', ')}`);
  for (const song of B.SONGS) {
    B.selectSong(song.id);
    B.setSpeed(1);
    for (const [inst, def] of Object.entries(song.instruments)) {
      const r = RANGE[inst];
      def.buttons.forEach((b, i) => {
        if (r) for (const m of b.midis) if (m < r[0] || m > r[1]) problems.push(`${song.id}/${inst} ${b.label} midi ${m} outside ${r}`);
        const voices = song.sections.map((sec) => sec.voice).filter(Boolean);
        if (![...song.allParts, ...voices].some((p) => p.inst === inst && p.events.some((e) => e.b === i))) problems.push(`${song.id}/${inst}: ${b.label} is never played`);
      });
    }
    const secs = song.form.reduce((a, s) => a + s.length, 0) * B.stepSec();
    if (song.sections.length > 1 && (secs < 45 || secs > 120)) problems.push(`${song.id}: whole song is ${secs.toFixed(0)}s`);
    if (song.sections.length > 1) notes.push(`${song.id} ${secs.toFixed(0)}s in ${song.form.length} sections`);

    for (const sec of song.sections) {
      B.selectSection(sec.id);
      for (const part of sec.partList) {
        parts++;
        const where = `${song.id}/${part.key}`;
        if (!part.groups.length) { problems.push(where + ': no notes'); continue; }
        for (const clean of [false, true]) {
          B.startTurn(part.inst);
          const T = B.state.turn;
          if (!T || T.part !== part) { problems.push(where + ': turn did not start on this part'); break; }
          if (!clean) {
            const wrong = part.buttons.findIndex((_, i) => !part.groups[0].bs.includes(i));
            if (wrong >= 0) {
              B.press(part.inst, wrong);
              if (T.pos !== 0 || T.mistakes !== 1) problems.push(`${where}: wrong note moved pos to ${T.pos}, mistakes ${T.mistakes}`);
            } else { T.mistakes = 1; T.missed.add(0); }   // a one-button part: book the mistake by hand
          }
          for (const g of part.groups) for (const b of g.bs.slice().reverse()) { B.press(part.inst, b); presses++; }
          const best = (B.save.pct[song.id] || {})[part.key];
          // one slip on the first beat costs that beat's share
          const n = part.groups.length;
          const want = clean ? 100 : Math.round(100 * (n - 1) / n);
          if (B.state.turn) problems.push(`${where}: turn still open at pos ${T.pos}/${part.groups.length}`);
          if (B.state.last.pct !== want) problems.push(`${where}: ${clean ? 'clean' : 'one-slip'} run scored ${B.state.last.pct}%, wanted ${want}%`);
          if (best !== want) problems.push(`${where}: saved best ${best}, wanted ${want}`);
          B.stop();
        }
      }
    }
  }

  B.state.quiet = false;

  // 4. lights, on the real clock, at full and half speed
  const litDuring = async (ms) => {
    const seen = new Set(), others = new Set();
    let flips = 0, was = '';
    for (let i = 0; i < ms / 25; i++) {
      await wait(25);
      const now = [...document.querySelectorAll('.station[data-part="bass"] .pad.lit')].map((p) => p.textContent).join();
      if (now && now !== was) flips++;
      was = now;
      now.split(',').filter(Boolean).forEach((x) => seen.add(x));
      document.querySelectorAll('.station:not([data-part="bass"]) .pad.lit').forEach((p) => others.add(p.textContent));
    }
    B.stop();
    return { seen, others, flips };
  };
  B.selectSong('midnight-sidewalk');
  B.selectSection('verse');           // the intro is drums alone
  B.setSpeed(1);
  B.showPart('bass');
  const full = await litDuring(1600);
  B.setSpeed(0.5);
  B.showPart('bass');
  const half = await litDuring(1600);
  B.setSpeed(1);
  if (full.seen.size < 3) problems.push(`show me lit only ${full.seen.size} bass pads in 1.6s`);
  if (full.others.size) problems.push(`show me lit other parts: ${[...full.others]}`);
  if (!(half.flips < full.flips * 0.7 && half.flips > 0)) problems.push(`half speed lit ${half.flips} notes vs ${full.flips} at full`);
  notes.push(`bass notes lit in 1.6s: ${full.flips} full, ${half.flips} half`);

  // 5. the whole song walks the sections
  B.selectSong('streetlight-anthem');
  B.selectSection('chorus');
  const dsb = B.state.song;
  // squeeze the song: a run at full length is a minute, and the walk is what matters here
  const keepBpm = dsb.bpm;
  dsb.bpm = keepBpm * 12;
  B.listen();
  const walked = [];
  for (let i = 0; i < 400 && B.state.playing; i++) {
    await wait(25);
    const id = B.state.section.id;
    if (walked[walked.length - 1] !== id) walked.push(id);
  }
  dsb.bpm = keepBpm;
  const form = dsb.form.map((s) => s.id).filter((id, i, a) => id !== a[i - 1]);
  if (walked[0] === 'chorus') walked.shift();       // where it was, in the instant before the intro
  if (walked.join() !== form.join() + ',chorus') problems.push(`whole song walked ${walked.join(' > ')}`);
  notes.push(`walked ${walked.length - 1} sections and came home`);

  // 6. mega jam
  B.selectSong('mega');
  const mks = new Set();
  let megaButtons = 0;
  for (const inst of B.MEGA.order) for (const b of B.MEGA.instruments[inst].buttons) { megaButtons++; mks.add(b.mk); }
  if (mks.size !== megaButtons) problems.push(`mega jam has ${megaButtons - mks.size} duplicate buttons`);
  const distinctInSongs = new Set();
  for (const s of B.SONGS) for (const [inst, d] of Object.entries(s.instruments))
    for (const b of d.buttons) distinctInSongs.add([inst, b.drum || b.notes.join('.'), b.vowel || '', d.tone || ''].join('|'));
  const union = new Set([...distinctInSongs, ...B.MEGA.extraKeys]);
  if (mks.size !== union.size || [...union].some((k) => !mks.has(k))) problems.push(`mega jam has ${mks.size} buttons, the songs and extras ${union.size}`);
  B.clearJam();
  B.toggleRecord();
  for (const [inst, b] of [['drums', 0], ['keys', 2], ['drums', 1], ['bass', 1]]) { B.press(inst, b); await wait(150); }
  B.toggleRecord();
  const J = B.jam;
  if (J.events.length !== 4 || !(J.len > 0.5)) problems.push(`looper took ${J.events.length} notes over ${J.len}s`);
  if (!(B.state.playing && B.state.playing.what === 'jam')) problems.push('loop is not playing after recording');
  const clock0 = B.audioState(), wall0 = performance.now();
  await wait(Math.max(200, J.len * 1000));           // let it come round once
  notes.push(`clock ${clock0} -> ${B.audioState()} over ${Math.round(performance.now() - wall0)}ms`);
  let loopLit = 0;
  for (let i = 0; i < 40; i++) { await wait(25); if (document.querySelector('.pad.lit')) loopLit++; }
  B.stop();
  if (!loopLit) problems.push('the loop played back without lighting a pad');
  if (B.save.jam.events.length !== 4) problems.push(`saved jam holds ${B.save.jam.events.length} notes`);
  notes.push(`audio ${B.audioState()}`);
  notes.push(`mega: ${megaButtons} buttons; loop ${J.len.toFixed(2)}s, lit on ${loopLit}/40 ticks`);
  B.clearJam();

  // every sound in the band, played once: a synth voice that throws only shows up here
  let played = 0;
  for (const inst of B.MEGA.order) B.MEGA.instruments[inst].buttons.forEach((_, i) => { B.press(inst, i); played++; });
  await wait(300);
  notes.push(`played all ${played} jam sounds, ${B.MEGA.extraKeys.length} of them jam-only`);
  // and a build's riser plays alongside the section without being scored
  B.selectSong('jungle-drop');
  B.selectSection('build');
  B.listenSection();
  await wait(300);
  if (!B.state.playing) problems.push('the build with a riser did not play');
  B.stop();
  B.selectSong('mega');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${B.SONGS.length} songs, ${parts} parts, ${presses} correct presses; ${notes.join('; ')}` +
      (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
