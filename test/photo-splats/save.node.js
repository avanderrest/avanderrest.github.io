/* What Photo Splats keeps, it keeps right: the settings (sway, detail, depth) and the last
   scene open. Save, restore into a fresh sim, save again: identical. An empty save gives
   the defaults. (The scenes visitors make live in IndexedDB, which the page case covers.) */
import { createSplats, SETTINGS } from '../../photo-splats/sim.js';

const copy = (o) => JSON.parse(JSON.stringify(o));

export default function () {
  const problems = [];
  const a = createSplats();
  if (JSON.stringify(a.S.settings) !== JSON.stringify(SETTINGS)) problems.push('a first visit does not get the defaults');
  a.open({ id: 'g:the-forest', title: 'The Forest', focus: 2 });
  a.setSway(false); a.set('quality', 'fine'); a.set('range', 4.5);
  const saved = copy(a.toSave());
  const b = createSplats({ saved: copy(saved) });
  if (JSON.stringify(b.toSave()) !== JSON.stringify(saved)) problems.push(`restoring changed the save: ${JSON.stringify(b.toSave())}`);
  if (b.S.last !== 'g:the-forest') problems.push('the last scene was forgotten');
  if (b.S.settings.sway !== false || b.S.settings.quality !== 'fine' || b.S.settings.range !== 4.5) problems.push('settings lost');
  // an old save missing a newer setting still gets its default
  const c = createSplats({ saved: { settings: { sway: false } } });
  if (c.S.settings.quality !== SETTINGS.quality || c.S.settings.sway !== false) problems.push('a partial save did not merge with the defaults');
  return { pass: problems.length === 0, detail: problems.length ? problems.join('; ') : `kept ${JSON.stringify(saved)}` };
}
