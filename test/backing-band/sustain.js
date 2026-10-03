/* A held note rings for as long as it is held.

   Streetlight Anthem holds its guitar chords for a whole bar — two seconds at full speed,
   four at half — and the guitar is a plucked string rendered ahead of time. If that render
   is shorter than the hold, the chord stops dead while it should still be sounding. Every
   guitar chord the songs use is held for four seconds here, and its loudness may only fall
   away gradually: no 50ms window may drop below 40% of the one before it until the release. */
return (async () => {
  const B = window.__band;
  const HOLD = 4;
  const problems = [];
  let checked = 0, worst = 1, worstAt = '';
  for (const song of B.SONGS) {
    const def = song.instruments.guitar;
    if (!def) continue;
    for (let b = 0; b < def.buttons.length; b++) {
      const env = await B.envelope(song.id, 'guitar', b, HOLD);
      checked++;
      const holdEnd = Math.floor(HOLD / 0.05) - 1;
      for (let i = 4; i < holdEnd; i++) {
        const ratio = env[i] / Math.max(env[i - 1], 1e-6);
        if (ratio < worst) { worst = ratio; worstAt = `${song.id} ${def.buttons[b].label} at ${(i * 0.05).toFixed(2)}s`; }
        if (ratio < 0.4) { problems.push(`${song.id} ${def.buttons[b].label} drops from ${env[i - 1]} to ${env[i]} at ${(i * 0.05).toFixed(2)}s`); break; }
      }
    }
  }
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${checked} guitar chords held ${HOLD}s; steepest 50ms fall ${(worst * 100).toFixed(0)}% (${worstAt})` +
      (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
