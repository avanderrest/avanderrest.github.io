/* Wizz Delivery: a level as data.

   The town that ships with the game is authored inside sim.js. A level made in
   editor.html is the same shape, but plain: roads and painted grounds in `geo`,
   every building, tree and delivery house named explicitly in `geo.buildings`,
   `geo.trees`, `geo.props` and `geo.houses`. `authored: true` tells the rules not
   to scatter any of the town's random frontage or trees on top.

   Nothing here touches the page, so the editor, the game and the Node tests all
   get their levels from the same place. */
export const LEVEL_KEY = 'wizz-level-draft-v1';
export const MAPS_KEY = 'wizz-levels-v1';
export const CURRENT_KEY = 'wizz-editor-current-v1';
export const LEVEL_VERSION = 1;

const key = (x, y) => x + ',' + y;

const row = (xs, y, out) => {
  for (const x of xs) out.push({ x, y });
  return out;
};

/** A small crossroads to start from, so the first click is an edit and not a blank field. */
export function blankLevel() {
  const houses = [];
  row([14, 32, 28, 30, 34, 36], 14, houses);
  row([14, 16, 19, 21, 34, 36], 18, houses);
  row([20, 22, 30, 37], 6, houses);
  row([20, 22, 30, 37], 2, houses);
  return {
    v: LEVEL_VERSION,
    name: 'My town',
    start: { x: 24.5, y: 22.5 },
    traffic: 0.5,
    lights: [],
    roundabouts: [],
    restaurants: [
      [18, 14.6], [21, 14.6], [27.5, 6.4], [33.5, 6.4],
      [28, 18.4], [31, 18.4], [40, 14.6], [43, 14.6],
    ],
    density: { built: 0, treed: 0, frontage: 0 },
    geo: {
      authored: true,
      roads: [
        { name: 'High Street', w: 2.3, pts: [[-3, 16.5], [6, 16.5], [12.5, 16.5], [24.5, 16.5], [37.5, 16.5], [45, 16.5], [53, 16.5]] },
        { name: 'London Road', w: 2.3, pts: [[24.5, -3], [24.5, 4.5], [24.5, 10.5], [24.5, 16.5], [24.5, 22.5], [24.5, 28.5], [24.5, 37]] },
        { name: 'North Road', w: 2.1, pts: [[-3, 4.5], [6, 4.5], [16, 4.5], [24.5, 4.5], [33, 4.5], [45, 4.5], [53, 4.5]] },
        { name: 'South Road', w: 2.1, pts: [[-3, 28.5], [8, 28.5], [18, 28.5], [24.5, 28.5], [36, 28.5], [45, 28.5], [53, 28.5]] },
      ],
      bulbs: [],
      water: [],
      park: null,
      footpaths: [],
      benches: [],
      carparks: [],
      van: null,
      features: [],
      buildings: [],
      trees: [{ x: 15, y: 12 }, { x: 20, y: 12 }, { x: 29, y: 12 }, { x: 34, y: 12 },
        { x: 15, y: 22 }, { x: 20, y: 22 }, { x: 29, y: 22 }, { x: 34, y: 22 },
        { x: 9, y: 9 }, { x: 40, y: 9 }, { x: 9, y: 25 }, { x: 40, y: 25 }],
      props: [],
      houses,
    },
  };
}

/** What a level needs before the game can start a shift on it. */
export function validateLevel(level) {
  const issues = [];
  const geo = level && level.geo;
  if (!level || typeof level !== 'object') return { ok: false, issues: ['The level could not be read.'] };
  if (!geo || !Array.isArray(geo.roads)) issues.push('The level has no ground to build on.');
  if (geo && (!geo.roads || !geo.roads.length)) issues.push('Draw at least one road.');
  if (!Array.isArray(level.restaurants) || !level.restaurants.length) issues.push('Place at least one restaurant.');
  if (!geo || !Array.isArray(geo.houses) || !geo.houses.length) issues.push('Place at least one delivery house.');
  if (!level.start || !Number.isFinite(level.start.x) || !Number.isFinite(level.start.y)) issues.push('Set a start point.');
  return { ok: issues.length === 0, issues };
}

/** Clamp a decoded level into the shape the rules expect, so a hand-edited link cannot break the town. */
export function normalizeLevel(raw) {
  const base = blankLevel();
  if (!raw || typeof raw !== 'object') return base;
  const geoIn = raw.geo && typeof raw.geo === 'object' ? raw.geo : {};
  const obj = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null);
  const objs = (a) => (Array.isArray(a) ? a.map(obj).filter(Boolean) : []);
  const rects = (a) => (Array.isArray(a) ? a.filter((r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)).map((r) => [r[0], r[1], Math.abs(r[2]), Math.abs(r[3])]) : []);
  const roads = (Array.isArray(geoIn.roads) ? geoIn.roads : []).filter((r) => r && Array.isArray(r.pts) && r.pts.length >= 2)
    .map((r) => ({
      name: String(r.name || 'Street'),
      w: Math.max(1.2, Math.min(3.2, Number(r.w) || 2.1)),
      minor: !!r.minor,
      pts: r.pts.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]),
    })).filter((r) => r.pts.length >= 2);
  const polys = (a) => (Array.isArray(a) ? a.filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => p.filter((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) : []);
  const restaurants = Array.isArray(raw.restaurants)
    ? raw.restaurants.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 8)
    : [];
  const lights = Array.isArray(raw.lights) ? raw.lights.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).map((p) => [Math.round(p[0]), Math.round(p[1])]) : [];
  const roundabouts = Array.isArray(raw.roundabouts) ? raw.roundabouts.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).map((p) => [Math.round(p[0]), Math.round(p[1])]) : [];
  const props = Array.isArray(geoIn.props) ? geoIn.props.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), kind: p.kind === 'tree' ? 'tree' : 'bush' })) : [];
  return {
    v: LEVEL_VERSION,
    name: String(raw.name || 'My town').slice(0, 40),
    start: raw.start && Number.isFinite(raw.start.x) && Number.isFinite(raw.start.y) ? { x: raw.start.x, y: raw.start.y } : base.start,
    traffic: Number.isFinite(raw.traffic) ? Math.max(0, Math.min(1, raw.traffic)) : 0.5,
    trafficSide: raw.trafficSide === 'right' ? 'right' : 'left',
    lights,
    roundabouts,
    restaurants: restaurants.map((p) => [p[0], p[1]]),
    density: {
      built: Number(raw.density && raw.density.built) || 0,
      treed: Number(raw.density && raw.density.treed) || 0,
      frontage: Number(raw.density && raw.density.frontage) || 0,
    },
    geo: {
      authored: geoIn.authored !== false,
      roads,
      bulbs: Array.isArray(geoIn.bulbs) ? geoIn.bulbs.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).map((p) => [p[0], p[1]]) : [],
      water: polys(geoIn.water),
      park: Array.isArray(geoIn.park) && geoIn.park.length >= 3 ? geoIn.park.filter((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)) : null,
      footpaths: Array.isArray(geoIn.footpaths) ? geoIn.footpaths.filter((p) => p && Array.isArray(p.pts) && p.pts.length >= 2).map((p) => ({ w: Number(p.w) || 0.55, pts: p.pts })) : [],
      benches: Array.isArray(geoIn.benches) ? geoIn.benches.filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) : [],
      carparks: rects(geoIn.carparks),
      van: geoIn.van && Number.isFinite(geoIn.van.x) && Number.isFinite(geoIn.van.y) ? { x: geoIn.van.x, y: geoIn.van.y, h: Number(geoIn.van.h) || 0 } : null,
      features: Array.isArray(geoIn.features) ? geoIn.features.filter((f) => f && typeof f.art === 'string' && Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.w) && Number.isFinite(f.h)).map((f) => ({ art: f.art, x: f.x, y: f.y, w: f.w, h: f.h })) : [],
      buildings: objs(geoIn.buildings),
      trees: objs(geoIn.trees),
      props,
      houses: objs(geoIn.houses),
    },
  };
}

/** A link-safe base64 of the level, for sharing a map without a server. */
export function encodeLevel(level) {
  const bytes = new TextEncoder().encode(JSON.stringify(level));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLevel(text) {
  try {
    const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return normalizeLevel(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/** The level named in the page's query string, if there is one: ?level=draft or ?level=<base64>. */
export function levelFromQuery(search) {
  let value = null;
  try {
    value = new URLSearchParams(search || '').get('level');
  } catch {
    return null;
  }
  if (!value) return null;
  if (value === 'draft') {
    try {
      const raw = globalThis.localStorage && localStorage.getItem(LEVEL_KEY);
      return raw ? normalizeLevel(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  return decodeLevel(value);
}

/* ---------- saved maps ----------
   A small shelf of named maps in localStorage. The draft above is always the
   working copy (what Play opens); these are the ones worth keeping. */
export function listMaps() {
  try {
    const raw = globalThis.localStorage && localStorage.getItem(MAPS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && e.id && e.level).map((e) => ({
      id: String(e.id),
      name: String(e.name || (e.level && e.level.name) || 'Untitled').slice(0, 40),
      updated: Number(e.updated) || 0,
      level: normalizeLevel(e.level),
    }));
  } catch {
    return [];
  }
}

/** Write a level to the shelf. With `id`, update it in place; without, make a new one. */
export function saveMap(level, id) {
  const list = listMaps();
  const now = Date.now();
  let entry = id ? list.find((m) => m.id === id) : null;
  if (!entry) {
    const base = 'm' + now.toString(36);
    let nextId = base, n = 1;
    while (list.some((m) => m.id === nextId)) nextId = base + '-' + (n++);
    entry = { id: nextId, name: '', updated: now, level: null };
    list.push(entry);
  }
  entry.name = String(level.name || 'Untitled').slice(0, 40);
  entry.updated = now;
  entry.level = JSON.parse(JSON.stringify(normalizeLevel(level)));
  try { localStorage.setItem(MAPS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  return entry.id;
}

export function deleteMap(id) {
  const list = listMaps().filter((m) => m.id !== id);
  try { localStorage.setItem(MAPS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function getMap(id) {
  return listMaps().find((m) => m.id === id) || null;
}

export function readCurrentMapId() {
  try { return globalThis.localStorage && localStorage.getItem(CURRENT_KEY); } catch { return null; }
}

export function writeCurrentMapId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch { /* ignore */ }
}
