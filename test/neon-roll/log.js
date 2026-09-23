/* The play log has to record a run move by move, and survive to be copied.

   It is how a playtest gets back to whoever is tuning the game: Amber plays,
   opens Play log, copies a run and pastes it. Every tuning pass on this game
   since it existed has been decided by reading one of these, so a log that
   silently stops recording landings, or loses the run it just finished, costs
   exactly the evidence needed. This plays a short run with a pumping player,
   ends it, and reads the text the dialog would show — and the copy kept in
   localStorage for after a reload. */
return (async () => {
  const N = window.__neonRoll;
  const problems = [];
  N.freeze(true);
  N.start('endless', { seed: 606, noChase: true });
  for (let t = 0; t < 40; t += 1 / 60) {
    const p = N.probe();
    N.hold(p.on && (p.s >= 0 ? p.dy < 0 : p.dy > 0));
    N.step(1 / 60);
  }
  N.hold(false);
  N.restart();                              // ends the run as "restarted" and starts another
  const text = N.logText(1);
  const lines = text.split('\n');
  const count = (re) => lines.filter((l) => re.test(l)).length;
  const takeoffs = count(/TAKE-OFF/), lands = count(/LAND (PERFECT|GOOD|SLAM)/), holds = count(/ hold /), ticks = count(/· /);
  if (!/^NEON ROLL PLAY LOG/.test(lines[0])) problems.push('no header');
  if (!/result: restarted at \d+ m/.test(lines[1])) problems.push(`the result line is missing or wrong: "${lines[1]}"`);
  if (takeoffs < 4) problems.push(`only ${takeoffs} take-offs in 40s`);
  if (lands < 4) problems.push(`only ${lands} graded landings in 40s`);
  if (holds < 4) problems.push(`only ${holds} presses logged in 40s of pumping`);
  if (ticks < 35) problems.push(`only ${ticks} once-a-second lines in 40s`);
  const land = lines.find((l) => /LAND (PERFECT|GOOD|SLAM)/.test(l)) || '';
  if (!/\d+° off, [\d.]+s up, came in at -?\d+° onto -?\d+° \w+, \d+→\d+ km\/h, flow \d→\d/.test(land)) problems.push(`a landing line is missing its numbers: "${land.trim()}"`);
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('neon-roll-log-v1')); } catch (e) { /* checked below */ }
  if (!stored || !stored.some((r) => /restarted/.test(r.end) && r.lines.length === lines.length - 4)) problems.push('the finished run did not reach localStorage');
  N.freeze(false);
  N.setMode('endless');
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${problems.join('; ') || 'ok'} | ${lines.length} lines: ${takeoffs} take-offs, ${lands} landings, ${holds} presses, ${ticks} ticks | e.g. ${land.trim()}`,
  });
})();
