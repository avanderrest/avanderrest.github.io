/* Every sound is audible, and none drowns the rest.

   All the instruments are synthesised, so a typo in a gain or a filter is a button that
   lights up and makes no sound — or one that is ten times louder than the band. Nobody can
   listen in a headless browser, so every jam sound is rendered offline, one at a time, and
   its peak measured. Each must be clearly there (peak over 0.03) and within reach of the
   rest (under 1.2, the compressor's job beyond that). The detail prints each instrument's
   quietest and loudest, which is the balance between them. */
return (async () => {
  const B = window.__band;
  const rows = await B.levels();
  const problems = [];
  const by = {};
  for (const r of rows) {
    if (!(r.peak > 0.03)) problems.push(`${r.inst} ${r.label} peaks at ${r.peak}`);
    if (r.peak > 1.2) problems.push(`${r.inst} ${r.label} peaks at ${r.peak}`);
    const b = (by[r.inst] = by[r.inst] || { lo: r, hi: r });
    if (r.peak < b.lo.peak) b.lo = r;
    if (r.peak > b.hi.peak) b.hi = r;
  }
  const detail = Object.entries(by).map(([inst, { lo, hi }]) => `${inst} ${lo.peak} (${lo.label})–${hi.peak} (${hi.label})`).join('; ');
  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${rows.length} sounds; peak by instrument: ${detail}` + (problems.length ? '\n  ' + problems.join('\n  ') : ''),
  });
})();
