/* A level from the editor is a level the game can drive.

   The starter town from level.js is validated, sent through the same base64 link
   the editor's Copy link button makes, decoded, and handed to the real rules twice
   with the same dice: the two towns have to come out identical. The town the game
   actually plays is then rebuilt from town-level.js and has to match tile for tile,
   and the little saved-map shelf has to round-trip. Finally a shift runs on the
   starter — offers on the boards, every placed house and tree where it was put,
   and no crash as the world steps. */
import { createWizz } from '../../wizz-delivery/sim.js';
import {
  blankLevel, validateLevel, encodeLevel, decodeLevel,
  saveMap, listMaps, getMap, deleteMap,
} from '../../wizz-delivery/level.js';
import { townLevel } from '../../wizz-delivery/town-level.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const problems = [];
  const level = blankLevel();
  const verdict = validateLevel(level);
  if (!verdict.ok) problems.push('the starter level does not validate: ' + verdict.issues.join('; '));

  // the share link: a level has to survive the trip and come back a level
  const shared = decodeLevel(encodeLevel(level));
  if (!shared) problems.push('a shared level did not decode');
  else {
    for (const [label, a, b] of [
      ['roads', level.geo.roads.length, shared.geo.roads.length],
      ['houses', level.geo.houses.length, shared.geo.houses.length],
      ['trees', level.geo.trees.length, shared.geo.trees.length],
      ['restaurants', level.restaurants.length, shared.restaurants.length],
    ]) {
      if (a !== b) problems.push(`the share link changed the ${label}: ${a} -> ${b}`);
    }
  }

  // footpaths and painted grounds are level data too
  const extras = blankLevel();
  extras.geo.footpaths.push({ w: 0.55, pts: [[2, 20], [6, 22]] });
  extras.geo.features.push({ art: 'tennis', x: 28, y: 22, w: 3, h: 2 });
  const extrasBack = decodeLevel(encodeLevel(extras));
  if (!extrasBack) problems.push('a level with a path and a court did not decode');
  else {
    if (extrasBack.geo.footpaths.length !== 1) problems.push('the share link lost the footpath');
    if (!extrasBack.geo.features.some((f) => f.art === 'tennis')) problems.push('the share link lost the tennis court');
  }

  const build = (map) => createWizz({ map, rnd: mulberry32(7) });
  const a = build(level);
  const b = shared ? build(shared) : null;
  if (b) {
    for (const [label, x, y] of [
      ['tarmac', a.roadTiles.size, b.roadTiles.size],
      ['delivery houses', a.HOUSES.length, b.HOUSES.length],
      ['restaurants', a.RESTAURANTS.length, b.RESTAURANTS.length],
    ]) {
      if (x !== y) problems.push(`the decoded level differs on ${label}: ${x} vs ${y}`);
    }
  }

  // every object that was placed is in the town the rules built
  if (a.HOUSES.length !== level.geo.houses.length) {
    problems.push(`${level.geo.houses.length - a.HOUSES.length} placed houses were not on pavement`);
  }
  if (a.RESTAURANTS.length !== level.restaurants.length) {
    problems.push(`${a.RESTAURANTS.length} restaurants were built, not ${level.restaurants.length}`);
  }
  const tree = level.geo.trees[0];
  if (a.kindAt(tree.x, tree.y) !== 'T') problems.push('a placed tree is not a tree in the collision grid');
  const house = level.geo.houses[0];
  if (!a.houseAt(house.x, house.y)) problems.push('a placed house is not a delivery address');

  // a house off the pavement is still a delivery: its door moves to the road
  const offLevel = blankLevel();
  offLevel.geo.houses.push({ x: 5, y: 21 });
  const offSim = build(offLevel);
  const offHouse = offSim.HOUSES.find((h) => h.x === 5 && h.y === 21);
  if (!offHouse) problems.push('a house off the pavement was dropped');
  else if (offSim.HOUSES.length !== offLevel.geo.houses.length) problems.push('an off-pavement house was dropped');
  else {
    if (!offHouse.access) problems.push('an off-pavement house has no road access');
    else if (!offSim.isRoad(Math.floor(offHouse.access.x), Math.floor(offHouse.access.y))) {
      problems.push('the off-pavement door is not on a road');
    }
    const door = offSim.destinationOf({ pickedUp: true, hm: offHouse, r: offSim.REST[0], id: 999 });
    if (!door || Math.hypot(door.x - 5.5, door.y - 21.5) < 1.5) problems.push('the off-pavement door did not move to the road');
    const path = offSim.routePath({ pickedUp: true, hm: offHouse, r: offSim.REST[0], id: 999 });
    if (!path || !path.length) problems.push('there is no route to the nearest road for an off-pavement house');

    // and the drop happens at the road, not out in the field
    const only = blankLevel();
    only.geo.houses = [{ x: 5, y: 21 }];
    const deliver = build(only);
    deliver.startShift();
    const offer = deliver.REST.find((r) => r.offers.length).offers[0];
    deliver.car.x = offer.r.x + 0.5;
    deliver.car.y = offer.r.y + 0.5;
    deliver.acceptOffer(offer);
    const offOnly = deliver.HOUSES[0];
    deliver.car.x = offOnly.x + 0.5;
    deliver.car.y = offOnly.y + 0.5;
    deliver.step(1 / 30);
    if (deliver.ST.done) problems.push('an off-pavement house delivered out in the field');
    deliver.car.x = offOnly.access.x;
    deliver.car.y = offOnly.access.y;
    deliver.step(1 / 30);
    if (!deliver.ST.done) problems.push('an off-pavement house did not deliver at its nearest road');
  }

  // the map the editor opens on: the real town, copied into an editable level,
  // has to rebuild to the same town — same tarmac, houses, trees and start
  const townSim = createWizz({ rnd: mulberry32(5) });
  const editableTown = townLevel();
  const townCopy = createWizz({ map: editableTown, rnd: mulberry32(5) });
  let townTreeDiff = 0, townTileDiff = 0;
  for (let y = 0; y < 34; y++) for (let x = 0; x < 50; x++) {
    const k1 = townSim.kindAt(x, y), k2 = townCopy.kindAt(x, y);
    if (k1 !== k2) townTileDiff++;
    if (k1 === 'T' && k2 !== 'T') townTreeDiff++;
  }
  if (townTileDiff) problems.push(`the editable town differs from Wizzby on ${townTileDiff} tiles`);
  if (townCopy.roadTiles.size !== townSim.roadTiles.size) problems.push('the editable town has different tarmac');
  if (townCopy.HOUSES.length !== townSim.HOUSES.length) {
    problems.push(`the editable town has ${townCopy.HOUSES.length} houses, not ${townSim.HOUSES.length}`);
  }
  if (Math.abs(townCopy.START.x - townSim.START.x) > 1e-6 || townCopy.START.y !== townSim.START.y) {
    problems.push('the editable town starts somewhere else');
  }

  // the shelf: save a map, list it, read it back and delete it
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const savedId = saveMap(level);
  const shelf = listMaps();
  if (shelf.length !== 1) problems.push(`the shelf holds ${shelf.length} maps after one save`);
  if (shelf[0] && shelf[0].name !== level.name) problems.push('the saved map lost its name');
  if (!getMap(savedId)) problems.push('a saved map could not be read back');
  deleteMap(savedId);
  if (listMaps().length !== 0) problems.push('a deleted map is still on the shelf');
  delete globalThis.localStorage;

  // an editor-drawn straight road is tarmac all the way along, not just at its ends
  const straight = blankLevel();
  straight.geo.roads.push({ name: 'New street', w: 2.1, pts: [[20, 16.5], [20, 22]] });
  const straightSim = build(straight);
  for (let y = 18; y <= 21; y++) {
    if (!straightSim.isRoad(20, y)) problems.push(`a two-point road is not tarmac at 20,${y}`);
  }

  // estate lanes are drawn the same way but traffic keeps off them
  const laneLevel = blankLevel();
  laneLevel.geo.roads.push({ name: 'Estate lane', w: 1.5, minor: true, pts: [[20, 16.5], [20, 22]] });
  const laneSim = build(laneLevel);
  const laneTraffic = laneSim.traffic.filter((t) => Math.abs(t.x - 20.5) < 1.2 && t.y > 17 && t.y < 22).length;
  if (laneTraffic) problems.push(`${laneTraffic} traffic cars used an estate lane`);

  // and a shift can be driven on it
  let over = null;
  const wz = createWizz({ map: level, rnd: mulberry32(3), on: (ev, d) => { if (ev === 'shift-over') over = d; } });
  wz.startShift();
  const offers = wz.REST.reduce((n, r) => n + r.offers.length, 0);
  if (offers < 1) problems.push('the level started with an empty board');
  if (!wz.closestAccepted()) {
    // accept one so the order machinery gets a turn too
    const first = wz.REST.find((r) => r.offers.length);
    if (first) wz.acceptOffer(first.offers[0]);
  }
  for (let i = 0; i < 900 && !over; i++) wz.step(1 / 30);
  if (!(wz.G.ms > 0)) problems.push('the shift clock never ran');
  if (wz.HOUSES.length && !wz.destinationOf) problems.push('the level has no destination lookup');

  return {
    pass: problems.length === 0,
    detail: `${level.geo.roads.length} roads, ${a.roadTiles.size} tarmac tiles, `
      + `${a.HOUSES.length} houses, ${a.RESTAURANTS.length} restaurants, ${offers} offers`
      + ` | editable Wizzby: ${townCopy.HOUSES.length} houses, ${townCopy.roadTiles.size} tarmac, ${townTileDiff} tile diffs`
      + (problems.length ? ' | ' + problems.join(' | ') : ' | a level the game can drive'),
  };
}

