// The wall's data: every tile resolves to a real file, every generated picture has its
// size, and index.html is what tools/build-wall.js would write now. The freeform packing
// itself is measured in the real browser by masonry.js.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wall = require(path.join(ROOT, 'tools', 'build-wall.js'));

export default function () {
  const { data, tiles } = wall.load();
  const { problems } = wall.check(tiles);
  const html = wall.render(data);
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inSync = page.includes(html);
  const pictures = (html.match(/class="tile-art"/g) || []).length;
  const parts = tiles.filter((t) => t.html).length;
  const partialArt = tiles.filter((t) => t.html &&
    fs.readFileSync(path.join(ROOT, 'wall', 'partials', t.html + '.html'), 'utf8').includes('class="tile-art"')).length;
  const fail = problems.slice();
  if (!inSync) fail.push('index.html is out of date: run node tools/build-wall.js');
  if (pictures !== tiles.length - parts + partialArt) fail.push(`${pictures} framed pictures for ${tiles.length - parts + partialArt} image tiles`);
  return {
    pass: !fail.length,
    detail: `${tiles.length} tiles (${parts} partials, ${pictures} pictures)` +
      (fail.length ? ' -- ' + fail.join('; ') : ''),
  };
}
