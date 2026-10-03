/* Every song plays in real time.

   Surf Monster went silent on Play the whole song while its pads went on lighting: the song
   was set up all at once, a filter chain for every note in it, and the audio thread fell to
   61% of real time. Live audio that cannot keep up drops out, but nothing errors and the
   lights run on ordinary timers, so it only shows up by measuring the audio clock against
   the wall clock while each whole song plays. Each must hold 90% or better. */
return (async () => {
  const B = window.__band;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => +B.audioState().split('t=')[1];
  const problems = [];
  let slowest = 2, slowestId = '';
  for (const song of B.SONGS) {
    B.selectSong(song.id);
    B.listen();
    await wait(250);
    const a0 = clock(), w0 = performance.now();
    await wait(1500);
    const rate = (clock() - a0) / ((performance.now() - w0) / 1000);
    B.stop();
    await wait(200);
    if (rate < slowest) { slowest = rate; slowestId = song.id; }
    if (rate < 0.9) problems.push(`${song.id} plays at ${(rate * 100).toFixed(0)}% of real time`);
  }
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${B.SONGS.length} songs; slowest ${(slowest * 100).toFixed(0)}% of real time (${slowestId})` + (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
