/* The singer sings along, and only when asked.

   The singer is not a part to play: no song has a singer row in the rack, and with Vocals on
   it sings during Listen — the face on the switch mouths each vowel. With Vocals off it is
   silent and the switch's face stays still, but the singer on stage goes on singing: off
   mutes them, it doesn't send them off stage. And the voice itself, rendered offline for every
   song that has one, has to come out as sound: finite samples (one NaN silences the whole mix
   without an error) and loud enough to hear. Every song with a singer has a vocal track, the
   instrumentals have none and show no switch, and the voice stays in a singing range. */
return (async () => {
  const B = window.__band;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [];
  const face = document.getElementById('lead-face');
  const sung = B.SONGS.filter((s) => s.sung);

  const btn = document.getElementById('btn-vocals');
  let lo = 999, hi = 0;
  for (const s of B.SONGS) {
    if (s.order.includes('vocals')) problems.push(`${s.id} still has the singer as a part`);
    // a song with a singer sings; an instrumental has nothing to switch, so no switch
    if (!s.instrumental && !s.sung) problems.push(`${s.id} has a singer but no vocal track`);
    if (s.instrumental && s.sung) problems.push(`${s.id} is instrumental but sings`);
    B.selectSong(s.id);
    if (btn.hidden !== !s.sung) problems.push(`${s.id}: Vocals switch ${btn.hidden ? 'hidden' : 'shown'}`);
    for (const sec of s.sections) for (const b of (sec.voice ? sec.voice.buttons : [])) { lo = Math.min(lo, b.midis[0]); hi = Math.max(hi, b.midis[0]); }
  }
  // an ordinary singing range: not squeaky (her ask), not mumbling
  if (lo < 55 || hi > 79) problems.push(`voice runs from midi ${lo} to ${hi}, outside 55-79`);
  B.selectSong('ash-and-echo');                // the intro is the chant
  // what the switch's face mouths, and whether the singer on stage sings at all
  let stageSang = false;
  const watch = async () => {
    const seen = new Set();
    stageSang = false;
    for (let i = 0; i < 50; i++) {
      await wait(40);
      if (face.dataset.v) seen.add(face.dataset.v);
      if (B.band.byInst.voice && B.band.byInst.voice.singUntil > performance.now()) stageSang = true;
    }
    B.stop();
    return seen;
  };
  B.save.vocals = true;
  B.listenSection();
  const on = await watch();
  const stageOn = stageSang;
  B.save.vocals = false;
  B.listenSection();
  const off = await watch();
  const stageOff = stageSang;
  B.save.vocals = true;
  if (!on.size) problems.push('with Vocals on, the face never sang');
  if (off.size) problems.push(`with Vocals off, the switch's face still sang ${[...off]}`);
  // off mutes the singer; it doesn't send them off stage
  if (!stageOn) problems.push('with Vocals on, the singer on stage never sang');
  if (!stageOff) problems.push('with Vocals off, the singer on stage stopped singing');

  let quietest = 1, quietestId = '';
  for (const s of sung) {
    const r = await B.renderVoice(s.id);
    if (r.bad) problems.push(`${s.id}: the voice renders ${r.bad} samples that are not numbers`);
    if (r.peak < quietest) { quietest = r.peak; quietestId = s.id; }
    if (!(r.peak > 0.05)) problems.push(`${s.id}: the voice peaks at only ${r.peak}`);
  }
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${sung.length} songs sing, ${B.SONGS.length - sung.length} instrumental; voice midi ${lo}-${hi}; face mouthed ${[...on].join('/')} with Vocals on, nothing with it off; quietest voice ${quietest} (${quietestId})` +
      (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
