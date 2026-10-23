/* Story shape — the screen. The scene's prose sits in the stage, what the player carries
   sits in the status row, and the choices are the buttons. */

import { createGame, RULES, HINT } from './sim.js';
import { startPrototype, pill, line } from './ui.js';

function sceneNode(scene) {
  const box = line('div', 'pf-scene');
  box.append(line('p', null, scene.text));
  return box;
}

function paint(S, ui, game) {
  const scene = game.scene();
  const carried = Object.keys(S.flags);
  ui.chip('Scene ' + (S.path.length + 1));
  ui.head(scene && scene.title ? scene.title : 'The last lamp', 'Choose one thing; it is carried.');
  ui.clock(null);
  ui.status([pill('Carrying', carried.length ? carried.join(' · ') : 'nothing yet')]);
  ui.stage(scene && scene.text ? sceneNode(scene) : null);
}

startPrototype({ createGame, rules: RULES, hint: HINT, paint });
