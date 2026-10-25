/* Wizz Delivery: the town you start in, as an editable level.

   The fixed town is grown from `MAPS.town` — its roads and grounds authored, its
   delivery houses and trees scattered by the generator. The editor wants all of
   it as objects it can point at, so this builds the real town once and copies
   what it actually made: every delivery house, every tree, the snapped start,
   and the restaurants where they stood. `authored: false` keeps the garden
   scatter (bushes and the last few trees) the same as the game's.

   Built from the sim rather than by hand so the map the editor opens is the map
   the game plays, tile for tile. */
import { createWizz } from './sim.js';
import { normalizeLevel } from './level.js';
import { mulberry32 } from '../lib/rng.js';

export function townLevel() {
  const sim = createWizz({ rnd: mulberry32(1) });
  const geo = sim.geo;
  const trees = [];
  for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) {
    if (sim.kindAt(x, y) === 'T') trees.push({ x, y });
  }
  return normalizeLevel({
    v: 1,
    name: 'Wizzby',
    start: { x: sim.activeMap.start.x, y: sim.activeMap.start.y },
    traffic: sim.activeMap.traffic,
    lights: sim.activeMap.lights.map(([x, y]) => [x, y]),
    roundabouts: sim.activeMap.roundabouts.map(([x, y]) => [x, y]),
    restaurants: sim.RESTAURANTS.map((r) => [r.x + 0.5, r.y + 0.5]),
    density: { built: 0, treed: 0, frontage: 0 },
    geo: {
      authored: false,   // keep the garden scatter the fixed town has
      roads: geo.roads.map((r) => ({ name: r.name, w: r.w, minor: !!r.minor, pts: r.pts.map((p) => [p[0], p[1]]) })),
      bulbs: (geo.bulbs || []).map((p) => [p[0], p[1]]),
      water: (geo.water || []).map((poly) => poly.map((p) => [p[0], p[1]])),
      park: (geo.park || []).map((p) => [p[0], p[1]]),
      footpaths: (geo.footpaths || []).map((f) => ({ w: f.w, pts: f.pts.map((p) => [p[0], p[1]]) })),
      benches: (geo.benches || []).map((b) => [b[0], b[1], b[2]]),
      carparks: (geo.carparks || []).map((c) => [c[0], c[1], c[2], c[3]]),
      van: geo.van ? { x: geo.van.x, y: geo.van.y, h: geo.van.h } : null,
      features: (geo.features || []).map((f) => ({ art: f.art, x: f.x, y: f.y, w: f.w, h: f.h })),
      buildings: [],
      trees,
      props: [],
      houses: sim.HOUSES.map((h) => ({ x: h.x, y: h.y })),
    },
  });
}
