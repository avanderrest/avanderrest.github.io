/* Every song has its own band on stage, and they play.

   The band is drawn from a per-song spec: a missing spec falls back to anonymous players,
   and a part with no player behind it moves nobody while it plays — both silent. So: every
   song has a dressed band of its own, every part it asks you to play (and its singer, if it
   sings) is somebody's, and playing a note actually moves that player. */
return (async () => {
  const B = window.__band;
  const problems = [];
  let players = 0;
  for (const s of [...B.SONGS, B.MEGA]) {
    if (!B.BANDS[s.id]) problems.push(`${s.id} has no band of its own`);
    B.selectSong(s.id);
    const band = B.band;
    players += band.members.length;
    if (band.members.length > 6) problems.push(`${s.id}: ${band.members.length} players do not fit the stage`);
    for (const inst of s.order) {
      if (!band.byInst[inst]) problems.push(`${s.id}: nobody plays the ${inst}`);
      else if (!B.BANDS[s.id] || (!B.BANDS[s.id].look[inst] && !(B.BANDS[s.id].merge || {})[inst] && !s.mega)) problems.push(`${s.id}: the ${inst} player is not dressed`);
    }
    if (s.sung && !band.byInst.voice) problems.push(`${s.id} sings but nobody on stage is the singer`);
    if (!s.mega && s.order.length) {
      const inst = s.order[0];
      B.press(inst, 0);
      if (!(band.byInst[inst].until > performance.now())) problems.push(`${s.id}: pressing the ${inst} moved nobody`);
    }
  }
  B.stop();
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${B.SONGS.length + 1} bands, ${players} players` + (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
