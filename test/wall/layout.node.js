// The wall's data: every tile resolves to a real file, the dense-placement simulation finishes
// flush at 4, 6 and 12 columns, and index.html is what tools/build-wall.js would write now.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wall = require(path.join(ROOT, 'tools', 'build-wall.js'));

export default function () {
  const { data, tiles } = wall.load();
  const { cells, layouts, problems, warnings } = wall.check(tiles);
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inSync = page.includes(wall.render(data));
  const summary = layouts.map((l) => `${l.cols}col ${l.holes.length ? l.holes.length + ' hole' : 'flush'}`).join(', ');
  const fail = problems.slice();
  if (!inSync) fail.push('index.html is out of date: run node tools/build-wall.js');
  return {
    pass: !fail.length,
    detail: `${tiles.length} tiles, ${cells} cells; ${summary}` + (warnings.length ? ` (allowed: ${warnings.length} at 2 columns)` : '') +
      (fail.length ? ' -- ' + fail.join('; ') : ''),
  };
}
