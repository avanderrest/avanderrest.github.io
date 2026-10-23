/* The shell every prototype shares: the topbar, the status row, the stage, the action
   buttons, the log and the ending card. A shape's view.js only supplies:
       paint(S, ui, game)      draw the state, called on every change
       frame(S, ui, game)      optional, called every screen frame (a clock, a board)
       keys                    optional, extra key -> action id
   The action buttons in the panel come from game.actions(); nothing here knows what a
   prototype's state means. Do not put a rule in this file: the sim owns the rules. */

import { newSeed } from '../../../../lib/rng.js';
import { seedForPage } from '../../../../lib/seed.js';
import { fixedLoop } from '../../../../lib/loop.js';
import { expose } from '../../../../lib/debug.js';

const $ = (id) => document.getElementById(id);

export function line(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** A labelled value for the status row: pill('Moves', 17). */
export function pill(name, value) {
  const n = line('span', 'pf-res-item');
  n.append(line('span', 'pf-res-name', name), line('b', 'pf-res-value', String(value)));
  return n;
}

export function startPrototype({ createGame, rules = [], hint = '', paint, frame, keys = {}, map = null }) {
  const el = {
    chip: $('pf-chip'),
    heading: $('pf-heading'),
    note: $('pf-note'),
    extra: $('pf-extra'),
    status: $('pf-status'),
    stage: $('pf-stage'),
    actions: $('pf-actions'),
    log: $('pf-log'),
    rules: $('pf-rules'),
    hint: $('pf-hint'),
    seed: $('pf-seed'),
    over: $('pf-over'),
    overKind: $('pf-over-kind'),
    overName: $('pf-over-name'),
    overText: $('pf-over-text'),
    again: $('pf-again'),
    helpbox: $('pf-helpbox'),
    helpText: $('pf-help-text'),
    helpRules: $('pf-help-rules'),
    helpClose: $('pf-help-close'),
    restart: $('pf-restart'),
    helpBtn: $('pf-help'),
    graphBtn: $('pf-graph'),
    graphbox: $('pf-graphbox'),
    graphBody: $('pf-graph-body'),
    graphKnobs: $('pf-graph-knobs'),
    graphEdit: $('pf-graph-edit'),
    graphClose: $('pf-graph-close'),
    graphIn: $('pf-graph-in'),
    graphOut: $('pf-graph-out'),
    graphFit: $('pf-graph-fit'),
    graphZoomLevel: $('pf-graph-zoom-level'),
  };

  const HINT = hint || 'Number keys 1–9 act.';
  let sim = null;
  let hintTimer = 0;

  // ---------- what a paint() may use ----------
  function chip(text) {
    el.chip.textContent = text || '';
    el.chip.hidden = !text;
  }

  function head(title, note) {
    el.heading.textContent = title || '';
    el.note.textContent = note || '';
  }

  function clock(left, total) {
    if (left == null || !(total > 0)) {
      el.extra.replaceChildren();
      el.extra.hidden = true;
      return;
    }
    el.extra.hidden = false;
    let box = el.extra.querySelector('.pf-clock');
    if (!box) {
      box = line('div', 'pf-clock');
      box.append(line('span', 'pf-clock-label'), line('i', 'pf-clock-track'));
      box.querySelector('.pf-clock-track').append(line('b'));
      el.extra.replaceChildren(box);
    }
    box.querySelector('.pf-clock-label').textContent = Math.max(0, Math.ceil(left)) + 's';
    box.querySelector('.pf-clock-track b').style.width = (Math.max(0, Math.min(1, left / total)) * 100).toFixed(1) + '%';
  }

  function status(nodes) {
    el.status.replaceChildren(...(nodes || []).filter(Boolean));
  }

  function stage(node) {
    el.stage.replaceChildren();
    if (node) {
      el.stage.append(node);
      el.stage.hidden = false;
    } else {
      el.stage.hidden = true;
    }
  }

  function say(text, tone) {
    el.log.append(line('li', 'pf-line' + (tone ? ' is-' + tone : ''), text));
    while (el.log.children.length > 80) el.log.firstChild.remove();
    el.log.scrollTop = el.log.scrollHeight;
  }

  function showOver(over) {
    el.overKind.textContent = over.win ? 'The run ends well' : 'The run ends';
    el.overKind.classList.toggle('is-good', Boolean(over.win));
    el.overName.textContent = over.name || over.id || 'The end';
    el.overText.textContent = over.text || '';
    el.over.hidden = false;
    el.again.focus();
  }

  function flash(why) {
    // the side panel is gone; a prototype that wants this can add its own place for it
    if (!el.hint) return;
    el.hint.textContent = why || 'not now';
    el.hint.classList.add('is-warn');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      el.hint.textContent = HINT;
      el.hint.classList.remove('is-warn');
    }, 2200);
  }

  const ui = { chip, head, clock, status, stage, say, flash };

  // ---------- the buttons ----------
  function renderActions(list) {
    el.actions.replaceChildren();
    for (const a of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pf-action' + (a.ok ? '' : ' is-blocked');
      btn.disabled = !a.ok;
      btn.title = a.ok ? '' : a.why || '';
      btn.dataset.id = a.id;
      btn.append(line('span', 'pf-action-label', a.label || a.id));
      btn.append(line('span', 'pf-action-note', a.ok ? a.note || '' : a.why || ''));
      el.actions.append(btn);
    }
    if (!list.length) el.actions.append(line('p', 'pf-empty', 'Nothing can be done here.'));
  }

  function render() {
    if (!sim) return;
    paint(sim.S, ui, sim);
    renderActions(sim.actions());
  }

  function act(id) {
    if (!sim) return null;
    const result = sim.act(id);
    if (result && result.ok === false) flash(result.why);
    render();
    return result;
  }

  // ---------- the run ----------
  function onEvent(event, data) {
    if (event === 'say') {
      say(data.text, data.tone);
      return;
    }
    render();
    if (event === 'ending') {
      if (el.graphbox && el.graphbox.open) el.graphbox.close();
      showOver(data);
    }
  }

  function build() {
    const seed = seedForPage(newSeed());

    // clear the page before the sim starts talking, so its first lines are kept
    el.log.replaceChildren();
    el.over.hidden = true;
    if (el.hint) {
      el.hint.textContent = HINT;
      el.hint.classList.remove('is-warn');
    }
    if (el.seed) el.seed.textContent = '#seed=' + seed;
    el.helpText.textContent = hint || '';
    el.helpRules.replaceChildren(...rules.map((r) => line('li', null, r)));
    if (el.rules) el.rules.replaceChildren(...rules.map((r) => line('li', null, r)));

    sim = createGame({ seed, on: onEvent });
    render();
    return sim;
  }


  // ---------- the logic graph ----------
  // A sim may export a MAP (nodes and edges) and return knobs() from createGame(). The graph
  // is drawn from MAP; each knob changes the live rules and repaints the game. Nothing here
  // knows what a node, an edge or a knob means. Nodes can be dragged (their x/y live on the
  // node), and edges are routed orthogonally around the other nodes so the shortest clear
  // path wins without cutting through a box.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 220;
  const NODE_H = 60;
  const COL_W = 320;
  const ROW_H = 78;
  const PAD = 28;
  const STEP = 16;
  let knobDefaults = null;
  let knobList = [];
  let graph = null;
  let drag = null;
  const view = { k: 1, x: 0, y: 0 };

  function svgEl(tag, attrs, text) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
    if (text != null) n.textContent = text;
    return n;
  }

  function shorten(text, max) {
    const s = String(text);
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  }

  // ---------- layout ----------
  function layout(map) {
    const nodes = ((map && map.nodes) || []).filter((n) => n && n.id);
    const cols = [...new Set(nodes.map((n) => n.col ?? 0))].sort((a, b) => a - b);
    const colIndex = new Map(cols.map((c, i) => [c, i]));
    const rows = new Map();
    const pos = new Map();
    const ordered = [...nodes].sort((a, b) => {
      const ca = colIndex.get(a.col ?? 0);
      const cb = colIndex.get(b.col ?? 0);
      if (ca !== cb) return ca - cb;
      return (a.kind === 'phase' ? 0 : 1) - (b.kind === 'phase' ? 0 : 1);
    });
    for (const n of ordered) {
      const c = colIndex.get(n.col ?? 0);
      const r = rows.get(c) || 0;
      rows.set(c, r + 1);
      const autoX = PAD + c * COL_W;
      const autoY = PAD + r * ROW_H;
      pos.set(n.id, {
        x: Number.isFinite(n.x) ? n.x : autoX,
        y: Number.isFinite(n.y) ? n.y : autoY,
      });
    }
    const maxRows = Math.max(1, ...cols.map((_, i) => rows.get(i) || 0));
    let width = PAD * 2 + (cols.length - 1) * COL_W + NODE_W;
    let height = PAD * 2 + (maxRows - 1) * ROW_H + NODE_H;
    // room to drag into, and a full screen's worth of canvas rather than a strip
    width = Math.max(width, PAD * 2 + cols.length * COL_W + NODE_W);
    height = Math.max(height, 720);
    for (const p of pos.values()) {
      width = Math.max(width, p.x + NODE_W + PAD);
      height = Math.max(height, p.y + NODE_H + PAD);
    }
    return { map, nodes: ordered, pos, width, height, svg: null, edgeEls: [] };
  }

  // ---------- routing ----------
  // A* on a coarse grid: nodes (inflated a little) are blocked, the path runs orthogonally
  // and the corners are rounded. The two nodes an edge belongs to are not obstacles, so its
  // ends can touch them.
  function routeGrid(layoutData, skip) {
    const gw = Math.ceil(layoutData.width / STEP) + 1;
    const gh = Math.ceil(layoutData.height / STEP) + 1;
    const blocked = new Uint8Array(gw * gh);
    for (const n of layoutData.nodes) {
      if (skip.has(n.id)) continue;
      const p = layoutData.pos.get(n.id);
      if (!p) continue;
      const x0 = Math.max(0, Math.floor((p.x - 8) / STEP));
      const x1 = Math.min(gw - 1, Math.floor((p.x + NODE_W + 8) / STEP));
      const y0 = Math.max(0, Math.floor((p.y - 8) / STEP));
      const y1 = Math.min(gh - 1, Math.floor((p.y + NODE_H + 8) / STEP));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) blocked[y * gw + x] = 1;
      }
    }
    return { blocked, gw, gh };
  }

  function heapPush(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= heap[i].f) break;
      const swap = heap[parent];
      heap[parent] = heap[i];
      heap[i] = swap;
      i = parent;
    }
  }

  function heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let small = i;
        if (left < heap.length && heap[left].f < heap[small].f) small = left;
        if (right < heap.length && heap[right].f < heap[small].f) small = right;
        if (small === i) break;
        const swap = heap[small];
        heap[small] = heap[i];
        heap[i] = swap;
        i = small;
      }
    }
    return top;
  }

  function astar(start, end, grid) {
    const { blocked, gw, gh } = grid;
    const clampCell = (p) => {
      let x = Math.max(0, Math.min(gw - 1, Math.round(p.x / STEP)));
      let y = Math.max(0, Math.min(gh - 1, Math.round(p.y / STEP)));
      if (blocked[y * gw + x]) {
        for (let r = 1; r <= 6 && blocked[y * gw + x]; r++) {
          for (const [cx, cy] of [[x + r, y], [x - r, y], [x, y + r], [x, y - r]]) {
            if (cx >= 0 && cy >= 0 && cx < gw && cy < gh && !blocked[cy * gw + cx]) {
              x = cx;
              y = cy;
              break;
            }
          }
        }
      }
      return { x, y };
    };
    const from = clampCell(start);
    const to = clampCell(end);
    const startI = from.y * gw + from.x;
    const goalI = to.y * gw + to.x;
    const size = gw * gh;
    const gScore = new Float32Array(size).fill(Infinity);
    const came = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = [];
    gScore[startI] = 0;
    heapPush(open, { f: 0, i: startI });

    while (open.length) {
      const cur = heapPop(open);
      const i = cur.i;
      if (i === goalI) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const x = i % gw;
      const y = (i - x) / gw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (blocked[ni] && ni !== goalI) continue;
        const tentative = gScore[i] + 1;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          came[ni] = i;
          const h = Math.abs(nx - to.x) + Math.abs(ny - to.y);
          heapPush(open, { f: tentative + h, i: ni });
        }
      }
    }
    if (came[goalI] < 0 && goalI !== startI) return null;

    const cells = [];
    for (let i = goalI; i >= 0; i = came[i]) {
      cells.push(i);
      if (i === startI) break;
    }
    cells.reverse();
    if (!cells.length || cells[0] !== startI) return null;

    const points = cells.map((i) => ({ x: (i % gw) * STEP, y: Math.floor(i / gw) * STEP }));
    points[0] = { x: start.x, y: start.y };
    points[points.length - 1] = { x: end.x, y: end.y };
    return simplifyPoints(points);
  }

  function simplifyPoints(points) {
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
      out.push({ x: p.x, y: p.y });
    }
    for (let i = out.length - 2; i > 0; i--) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
    }
    return out;
  }

  function anchors(a, b) {
    const acx = a.x + NODE_W / 2;
    const acy = a.y + NODE_H / 2;
    const bcx = b.x + NODE_W / 2;
    const bcy = b.y + NODE_H / 2;
    if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
      return bcx >= acx
        ? { start: { x: a.x + NODE_W, y: acy }, end: { x: b.x, y: bcy } }
        : { start: { x: a.x, y: acy }, end: { x: b.x + NODE_W, y: bcy } };
    }
    return bcy >= acy
      ? { start: { x: acx, y: a.y + NODE_H }, end: { x: bcx, y: b.y } }
      : { start: { x: acx, y: a.y }, end: { x: bcx, y: b.y + NODE_H } };
  }

  function routeEdge(edge, layoutData) {
    const a = layoutData.pos.get(edge.from);
    const b = layoutData.pos.get(edge.to);
    if (!a || !b || edge.from === edge.to) return null;
    const { start, end } = anchors(a, b);
    const grid = routeGrid(layoutData, new Set([edge.from, edge.to]));
    const points = astar(start, end, grid) || [start, end];
    return { points, label: labelSpot(points) };
  }

  function labelSpot(points) {
    const segments = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0) segments.push({ a, b, len });
      total += len;
    }
    let walk = total / 2;
    for (const s of segments) {
      if (walk <= s.len) {
        const t = s.len ? walk / s.len : 0;
        const x = s.a.x + (s.b.x - s.a.x) * t;
        const y = s.a.y + (s.b.y - s.a.y) * t;
        const horizontal = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y);
        return horizontal
          ? { x, y: y - 6, anchor: 'middle' }
          : { x: x + 7, y: y + 3, anchor: 'start' };
      }
      walk -= s.len;
    }
    return { x: points[0].x, y: points[0].y - 6, anchor: 'middle' };
  }

  function roundedPath(points, radius = 9) {
    if (!points || points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const next = points[i + 1];
      const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
      if (!inLen || !outLen) continue;
      const r = Math.min(radius, inLen / 2, outLen / 2);
      const p1 = { x: cur.x + ((prev.x - cur.x) * r) / inLen, y: cur.y + ((prev.y - cur.y) * r) / inLen };
      const p2 = { x: cur.x + ((next.x - cur.x) * r) / outLen, y: cur.y + ((next.y - cur.y) * r) / outLen };
      d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }

  function paintEdge(entry) {
    if (!graph) return;
    const route = routeEdge(entry.edge, graph);
    if (!route) {
      entry.path.setAttribute('d', '');
      entry.label.setAttribute('opacity', '0');
      return;
    }
    entry.start = route.points[0];
    entry.end = route.points[route.points.length - 1];
    entry.path.setAttribute('d', roundedPath(route.points));
    if (entry.handle) {
      entry.handle.setAttribute('cx', entry.end.x);
      entry.handle.setAttribute('cy', entry.end.y);
    }
    entry.label.setAttribute('x', route.label.x);
    entry.label.setAttribute('y', route.label.y);
    entry.label.setAttribute('text-anchor', route.label.anchor);
    entry.label.setAttribute('opacity', entry.edge.label ? '1' : '0');
  }

  function declutterLabels() {
    if (!graph) return;
    const labels = graph.edgeEls.map((e) => e.label).filter((l) => l.getAttribute('opacity') === '1');
    for (let i = 0; i < labels.length; i++) {
      let tries = 0;
      for (let j = 0; j < i && tries < 6; j++) {
        const a = labels[i].getBBox();
        const b = labels[j].getBBox();
        if (
          a.x < b.x + b.width + 3 &&
          a.x + a.width + 3 > b.x &&
          a.y < b.y + b.height + 3 &&
          a.y + a.height + 3 > b.y
        ) {
          labels[i].setAttribute('y', Number(labels[i].getAttribute('y')) + 14);
          tries++;
          j = -1;
        }
      }
    }
  }


  // ---------- pan and zoom ----------
  // The viewBox is the camera: panning changes its x/y, zooming its size. Node drags use the
  // screen CTM, so they follow the camera without any extra maths.
  function worldAt(cx, cy) {
    const pt = graph.svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return pt.matrixTransform(graph.svg.getScreenCTM().inverse());
  }

  function applyView() {
    if (!graph || !graph.svg) return;
    const w = graph.width / view.k;
    const h = graph.height / view.k;
    const minX = Math.min(0, graph.width - w) - 80;
    const maxX = Math.max(0, graph.width - w) + 80;
    const minY = Math.min(0, graph.height - h) - 80;
    const maxY = Math.max(0, graph.height - h) + 80;
    view.x = Math.min(maxX, Math.max(minX, view.x));
    view.y = Math.min(maxY, Math.max(minY, view.y));
    graph.svg.setAttribute('viewBox', `${view.x} ${view.y} ${w} ${h}`);
    if (el.graphZoomLevel) el.graphZoomLevel.textContent = Math.round(view.k * 100) + '%';
  }

  function zoomAt(factor, cx, cy) {
    if (!graph || !graph.svg) return;
    const k = Math.min(3, Math.max(0.5, view.k * factor));
    if (Math.abs(k - view.k) < 0.001) return;
    const before = worldAt(cx, cy);
    const rect = graph.svg.getBoundingClientRect();
    const fx = (cx - rect.left) / Math.max(1, rect.width);
    const fy = (cy - rect.top) / Math.max(1, rect.height);
    view.k = k;
    view.x = before.x - fx * (graph.width / k);
    view.y = before.y - fy * (graph.height / k);
    applyView();
  }

  function zoomStep(factor) {
    if (!graph || !graph.svg) return;
    const rect = graph.svg.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function resetView() {
    view.k = 1;
    view.x = 0;
    view.y = 0;
    applyView();
  }

  function startPan(e) {
    if (!graph || !graph.svg || e.button !== 0) return;
    e.preventDefault();
    const svg = graph.svg;
    const rect = svg.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const sx = graph.width / view.k / Math.max(1, rect.width);
    const sy = graph.height / view.k / Math.max(1, rect.height);
    try {
      svg.setPointerCapture(e.pointerId);
    } catch (err) {
      // no capture available; the listeners below still work
    }
    svg.style.cursor = 'grabbing';
    const move = (ev) => {
      view.x = start.vx - (ev.clientX - start.x) * sx;
      view.y = start.vy - (ev.clientY - start.y) * sy;
      applyView();
    };
    const up = (ev) => {
      try {
        svg.releasePointerCapture(ev.pointerId);
      } catch (err) {
        // already released
      }
      svg.style.cursor = 'grab';
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  }

  function onGraphWheel(e) {
    if (!graph || !graph.svg) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : 0.0016));
    zoomAt(factor, e.clientX, e.clientY);
  }

  function svgPoint(e, svg) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startDrag(e, node) {
    if (!graph || !e || e.button !== 0) return;
    const p = graph.pos.get(node.id);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    const at = svgPoint(e, graph.svg);
    drag = { node, offX: at.x - p.x, offY: at.y - p.y, pointerId: e.pointerId, group: e.currentTarget };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';

    const move = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const now = svgPoint(ev, graph.svg);
      const x = Math.round(Math.max(PAD, Math.min(graph.width - NODE_W - PAD, now.x - drag.offX)));
      const y = Math.round(Math.max(PAD, Math.min(graph.height - NODE_H - PAD, now.y - drag.offY)));
      node.x = x;
      node.y = y;
      graph.pos.set(node.id, { x, y });
      drag.group.setAttribute('transform', `translate(${x},${y})`);
      for (const entry of graph.edgeEls) {
        if (entry.edge.from === node.id || entry.edge.to === node.id) paintEdge(entry);
      }
    };

    const up = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      try {
        drag.group.releasePointerCapture(ev.pointerId);
      } catch (err) {
        // the pointer was already released
      }
      drag.group.style.cursor = 'grab';
      drag = null;
      // reroute everything: the moved box may now be in another edge's way
      drawMap(graph.map, knobList.length > 0);
    };

    e.currentTarget.addEventListener('pointermove', move);
    e.currentTarget.addEventListener('pointerup', up);
    e.currentTarget.addEventListener('pointercancel', up);
  }

  // ---------- growing and re-attaching ----------
  function nodeAt(point, exceptId = null) {
    if (!graph) return null;
    for (const n of graph.nodes) {
      if (n.id === exceptId) continue;
      const p = graph.pos.get(n.id);
      if (!p) continue;
      if (point.x >= p.x && point.x <= p.x + NODE_W && point.y >= p.y && point.y <= p.y + NODE_H) return n;
    }
    return null;
  }

  function trackLink(e, lineEl, done) {
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => {
      const p = svgPoint(ev, graph.svg);
      lineEl.setAttribute('x2', p.x);
      lineEl.setAttribute('y2', p.y);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const p = svgPoint(ev, graph.svg);
      lineEl.remove();
      done(p);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function connectNodes(source, target) {
    if (!source || !target || source.id === target.id) return;
    if (source.kind === 'phase' && target.kind === 'action') {
      // growing a phase into an existing verb is the phase select, not a second edge
      setPhase(target, source.id);
      return;
    }
    if (graph.map.edges.some((e) => e.from === source.id && e.to === target.id)) return;
    graph.map.edges.push({ from: source.id, to: target.id });
    afterEdit();
  }

  function growFrom(source, drop) {
    const p = {
      x: Math.max(PAD, Math.min(graph.width - NODE_W - PAD, drop.x - NODE_W / 2)),
      y: Math.max(PAD, Math.min(graph.height - NODE_H - PAD, drop.y - NODE_H / 2)),
    };
    const node = source.action
      ? {
          id: uniqueNodeId('verb'),
          kind: 'action',
          action: source.action,
          phase: source.phase,
          col: source.col,
          label: 'New verb',
          note: '',
          x: p.x,
          y: p.y,
        }
      : {
          id: uniqueNodeId('note'),
          kind: 'state',
          col: source.col,
          label: 'New node',
          note: '',
          x: p.x,
          y: p.y,
        };
    const at = graph.map.nodes.indexOf(source);
    graph.map.nodes.splice(at + 1, 0, node);
    if (node.kind === 'action') graph.map.edges.push({ from: node.phase, to: node.id });
    graph.map.edges.push({ from: source.id, to: node.id });
    afterEdit();
  }

  function startLink(e, source) {
    if (!graph || !graph.svg) return;
    const at = graph.pos.get(source.id);
    if (!at) return;
    const line = svgEl('line', {
      class: 'pf-link-preview',
      x1: at.x + NODE_W,
      y1: at.y + NODE_H / 2,
      x2: at.x + NODE_W,
      y2: at.y + NODE_H / 2,
    });
    graph.svg.append(line);
    trackLink(e, line, (drop) => {
      const target = nodeAt(drop, source.id);
      if (target) connectNodes(source, target);
      else growFrom(source, drop);
    });
  }

  function startRelink(e, entry) {
    if (!graph || !graph.svg) return;
    const edge = entry.edge;
    const from = entry.start || (entry.end ? entry.end : null);
    if (!from) return;
    const line = svgEl('line', {
      class: 'pf-link-preview',
      x1: from.x,
      y1: from.y,
      x2: entry.end ? entry.end.x : from.x,
      y2: entry.end ? entry.end.y : from.y,
    });
    graph.svg.append(line);
    trackLink(e, line, (drop) => {
      const target = nodeAt(drop, edge.from);
      if (!target || target.id === edge.to) return;
      edge.to = target.id;
      afterEdit();
    });
  }

  function editNodeText(e, node, field) {
    e.preventDefault();
    e.stopPropagation();
    if (!graph || !el.graphBody) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const body = el.graphBody.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pf-node-edit';
    input.value = node[field] || '';
    input.setAttribute('aria-label', `${field} for ${node.id}`);
    input.style.left = `${Math.max(4, rect.left - body.left)}px`;
    input.style.top = `${Math.max(4, rect.top - body.top)}px`;
    input.style.width = `${Math.max(140, rect.width + 80)}px`;
    el.graphBody.append(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) {
        node[field] = input.value;
        syncNodeText(node);
        render();
        if (editing) drawEditor();
      }
      input.remove();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        finish(true);
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // ---------- drawing ----------
  function drawMap(map, hasKnobs = false) {
    el.graphBody.replaceChildren();
    const nodes = ((map && map.nodes) || []).filter((n) => n && n.id);
    if (!nodes.length) {
      el.graphBody.append(
        line('p', 'pf-graph-empty', 'This prototype has no map yet. Give its sim.js a MAP export to draw one.')
      );
      return;
    }
    el.graphBody.append(
      line(
        'p',
        'pf-graph-empty',
        editing
          ? 'The loop, left to right. Drag a box to move it. Edit below: each verb is an option, its group is the phase it is offered in.'
          : hasKnobs
            ? 'The loop, left to right. Drag any box to rearrange the map; the note under each verb is what it exchanges.'
            : 'The loop, left to right. Drag any box to rearrange the map.'
      )
    );

    graph = layout(map);
    const svg = svgEl('svg', {
      viewBox: `0 0 ${graph.width} ${graph.height}`,
      width: graph.width,
      height: graph.height,
      role: 'img',
      'aria-label': map.title || 'The logic of the game',
    });
    const defs = svgEl('defs');
    const marker = svgEl('marker', {
      id: 'pf-arrow',
      viewBox: '0 0 8 8',
      refX: 7,
      refY: 4,
      markerWidth: 5,
      markerHeight: 5,
      orient: 'auto-start-reverse',
    });
    marker.append(svgEl('path', { d: 'M0,0 L8,4 L0,8 z', fill: 'var(--pf-dim)' }));
    defs.append(marker);
    svg.append(defs);

    const edgeLayer = svgEl('g', { class: 'pf-edges' });
    for (const edge of map.edges || []) {
      const path = svgEl('path', { d: '', class: 'pf-gedge' + (editing && !isMembership(edge) ? ' pf-edge-live' : ''), 'marker-end': 'url(#pf-arrow)' });
      const label = svgEl('text', { class: 'pf-gelabel', 'text-anchor': 'middle', opacity: 0 }, edge.label || '');
      const entry = { edge, path, label, handle: null, start: null, end: null };
      if (editing && !isMembership(edge)) path.addEventListener('pointerdown', (ev) => startRelink(ev, entry));
      edgeLayer.append(path, label);
      graph.edgeEls.push(entry);
    }
    svg.append(edgeLayer);

    for (const n of graph.nodes) {
      const p = graph.pos.get(n.id);
      const g = svgEl('g', {
        class: `pf-gnode ${n.kind || 'action'}${n.win ? ' good' : ''}`,
        'data-node': n.id,
        transform: `translate(${p.x},${p.y})`,
      });
      g.append(svgEl('rect', { class: 'box', x: 0, y: 0, width: NODE_W, height: NODE_H, rx: 9 }));
      const label = svgEl('text', { class: 'lbl', x: 12, y: 24 }, shorten(n.label || n.id, 26));
      label.addEventListener('pointerdown', (ev) => editNodeText(ev, n, 'label'));
      g.append(label);
      if (n.note) {
        const note = svgEl('text', { class: 'note', x: 12, y: 42 }, shorten(n.note, 34));
        note.addEventListener('pointerdown', (ev) => editNodeText(ev, n, 'note'));
        g.append(note);
      }
      g.addEventListener('pointerdown', (e) => startDrag(e, n));

      if (editing && n.kind !== 'phase') {
        const del = svgEl('g', {
          class: 'pf-node-x',
          transform: `translate(${NODE_W - 12}, 12)`,
          'aria-label': `remove ${n.label || n.id}`,
        });
        del.append(svgEl('circle', { r: 9 }));
        del.append(svgEl('text', { x: 0, y: 4, 'text-anchor': 'middle' }, '×'));
        del.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
        });
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          removeNode(n);
        });
        g.append(del);
      }

      if (editing) {
        const add = svgEl('g', {
          class: 'pf-node-add',
          transform: `translate(${NODE_W + 13}, ${NODE_H / 2})`,
          'aria-label': `drag out of ${n.label || n.id} to add a node`,
        });
        add.append(svgEl('circle', { r: 8 }));
        add.append(svgEl('text', { x: 0, y: 4, 'text-anchor': 'middle' }, '+'));
        add.addEventListener('pointerdown', (ev) => startLink(ev, n));
        g.append(add);
      }

      svg.append(g);
    }

    if (editing) {
      for (const entry of graph.edgeEls) {
        if (isMembership(entry.edge)) continue;
        const handle = svgEl('circle', { class: 'pf-edge-handle', r: 5.5, cx: 0, cy: 0 });
        handle.addEventListener('pointerdown', (ev) => startRelink(ev, entry));
        entry.handle = handle;
        svg.append(handle);
      }
    }

    graph.svg = svg;
    svg.addEventListener('pointerdown', startPan);
    el.graphBody.append(svg);
    applyView();
    for (const entry of graph.edgeEls) paintEdge(entry);
    declutterLabels();
  }

  function fmtKnob(k, value) {
    return String(value) + (k.unit || '');
  }

  function drawKnobs() {
    knobList = sim && typeof sim.knobs === 'function' ? sim.knobs() : [];
    el.graphKnobs.replaceChildren();
    if (!knobList.length) {
      el.graphKnobs.hidden = true;
      return;
    }
    el.graphKnobs.hidden = false;
    if (!knobDefaults) knobDefaults = new Map(knobList.map((k) => [k.id, k.value]));

    const head = line('div', 'pf-graph-knobs-head');
    head.append(line('span', null, 'Live numbers'));
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'tiny';
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => {
      for (const k of knobList) {
        const v = knobDefaults.get(k.id);
        if (v != null) k.set(v);
      }
      drawKnobs();
      render();
    });
    head.append(reset);
    el.graphKnobs.append(head);

    for (const k of knobList) {
      const box = line('div', 'pf-knob');
      const label = document.createElement('label');
      label.append(line('span', null, k.label || k.id));
      const value = line('b', null, fmtKnob(k, k.value));
      label.append(value);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = k.min;
      input.max = k.max;
      input.step = k.step ?? 1;
      input.value = k.value;
      input.setAttribute('aria-label', k.label || k.id);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        k.set(v);
        value.textContent = fmtKnob(k, v);
        render();
      });
      box.append(label, input);
      el.graphKnobs.append(box);
    }
  }

  // ---------- editing the map ----------
  // The map is the document here. Edits are made in place, because the sim holds the same
  // object: an action node's label is the button's label, its phase is where it is offered,
  // and its order in the column is the button's order.
  let editing = false;
  let editMap = null;
  let mapSnapshot = null;
  let nextNodeId = 0;

  function nodeById(id) {
    return editMap && editMap.nodes.find((n) => n.id === id);
  }

  function phaseIdSet() {
    return new Set((editMap.nodes || []).filter((n) => n.kind === 'phase').map((n) => n.id));
  }

  function isMembership(edge) {
    const phases = phaseIdSet();
    const to = nodeById(edge.to);
    return phases.has(edge.from) && to && to.kind === 'action';
  }

  function syncNodeText(node) {
    const g = [...el.graphBody.querySelectorAll('.pf-gnode')].find((x) => x.dataset.node === node.id);
    if (!g) return;
    const label = g.querySelector('.lbl');
    if (label) label.textContent = shorten(node.label || node.id, 26);
    let note = g.querySelector('.note');
    if (node.note) {
      if (!note) {
        note = svgEl('text', { class: 'note', x: 12, y: 42 }, '');
        g.append(note);
      }
      note.textContent = shorten(node.note, 34);
    } else if (note) {
      note.remove();
    }
  }

  function makeInput(value, aria, extraClass = '') {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.className = ('pf-edit-text ' + extraClass).trim();
    input.setAttribute('aria-label', aria);
    return input;
  }

  function makeSelect(options, value, aria) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', aria);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label || opt.id;
      if (opt.id === value) o.selected = true;
      select.append(o);
    }
    return select;
  }

  function tinyButton(text, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tiny';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function afterEdit() {
    drawMap(editMap, knobList.length > 0);
    drawEditor();
    render();
  }

  function setPhase(node, phaseId) {
    const phase = nodeById(phaseId);
    if (!phase) return;
    node.phase = phaseId;
    node.col = phase.col;
    // put it at the end of its new column, so the phase stays the header of the group
    const at = editMap.nodes.indexOf(node);
    if (at >= 0) editMap.nodes.splice(at, 1);
    let insert = editMap.nodes.length;
    for (let i = editMap.nodes.length - 1; i >= 0; i--) {
      if (editMap.nodes[i].col === phase.col) {
        insert = i + 1;
        break;
      }
    }
    editMap.nodes.splice(insert, 0, node);
    editMap.edges = editMap.edges.filter((e) => !(e.to === node.id && phaseIdSet().has(e.from)));
    editMap.edges.push({ from: phaseId, to: node.id });
    afterEdit();
  }

  function moveNode(node, dir) {
    const same = editMap.nodes.filter((n) => n.col === node.col && n.kind === node.kind);
    const i = same.indexOf(node);
    const other = same[i + dir];
    if (!other) return;
    const a = editMap.nodes.indexOf(node);
    const b = editMap.nodes.indexOf(other);
    editMap.nodes[a] = other;
    editMap.nodes[b] = node;
    afterEdit();
  }

  function uniqueNodeId(prefix) {
    let id = `${prefix}-${++nextNodeId}`;
    while (editMap.nodes.some((n) => n.id === id)) id = `${prefix}-${++nextNodeId}`;
    return id;
  }

  function removeNode(node) {
    if (!node || node.kind === 'phase') return;
    const at = editMap.nodes.indexOf(node);
    if (at >= 0) editMap.nodes.splice(at, 1);
    editMap.edges = editMap.edges.filter((e) => e.from !== node.id && e.to !== node.id);
    afterEdit();
  }

  function addVerbNode(phase, source) {
    if (!source) return;
    const node = {
      id: uniqueNodeId('verb'),
      kind: 'action',
      action: source.action,
      phase: phase.id,
      col: phase.col,
      label: 'New verb',
      note: '',
    };
    // sit it right after the verb it copies, so the button is in the right place
    let insert = -1;
    if (source && source.col === phase.col) insert = editMap.nodes.indexOf(source) + 1;
    if (insert < 0) {
      insert = editMap.nodes.length;
      for (let i = editMap.nodes.length - 1; i >= 0; i--) {
        if (editMap.nodes[i].col === phase.col) {
          insert = i + 1;
          break;
        }
      }
    }
    editMap.nodes.splice(insert, 0, node);
    editMap.edges.push({ from: phase.id, to: node.id });
    afterEdit();
  }

  function addNoteNode() {
    const col = Math.max(0, ...editMap.nodes.map((n) => n.col ?? 0));
    editMap.nodes.push({ id: uniqueNodeId('note'), kind: 'state', col, label: 'New note', note: '' });
    afterEdit();
  }

  function verbRow(node, phases) {
    const row = line('div', 'pf-edit-row');
    const label = makeInput(node.label, `${node.id} label`);
    label.addEventListener('input', () => {
      node.label = label.value;
      syncNodeText(node);
      render();
    });
    const phase = makeSelect(phases.map((p) => ({ id: p.id, label: p.label })), node.phase, `${node.id} phase`);
    phase.addEventListener('change', () => setPhase(node, phase.value));
    row.append(
      label,
      phase,
      tinyButton('\u2191', 'move up', () => moveNode(node, -1)),
      tinyButton('\u2193', 'move down', () => moveNode(node, 1)),
      tinyButton('\u00d7', 'remove verb', () => removeNode(node))
    );
    return row;
  }

  function textRow(node) {
    const row = line('div', 'pf-edit-row');
    const label = makeInput(node.label, `${node.id} label`);
    label.addEventListener('input', () => {
      node.label = label.value;
      syncNodeText(node);
    });
    const note = makeInput(node.note, `${node.id} note`, 'pf-edit-note-input');
    note.placeholder = 'note';
    note.addEventListener('input', () => {
      node.note = note.value;
      syncNodeText(node);
    });
    row.append(label, note, tinyButton('×', 'remove node', () => removeNode(node)));
    return row;
  }

  function edgeRow(edge, nodes, index) {
    const row = line('div', 'pf-edit-row');
    const from = makeSelect(nodes, edge.from, `edge ${index + 1} from`);
    const to = makeSelect(nodes, edge.to, `edge ${index + 1} to`);
    const label = makeInput(edge.label, `edge ${index + 1} label`, 'pf-edit-note-input');
    label.placeholder = 'label';
    from.addEventListener('change', () => {
      edge.from = from.value;
      afterEdit();
    });
    to.addEventListener('change', () => {
      edge.to = to.value;
      afterEdit();
    });
    label.addEventListener('change', () => {
      edge.label = label.value;
      drawMap(editMap, knobList.length > 0);
    });
    row.append(
      from,
      to,
      label,
      tinyButton('\u00d7', 'remove edge', () => {
        editMap.edges.splice(editMap.edges.indexOf(edge), 1);
        afterEdit();
      })
    );
    return row;
  }

  function drawEditor() {
    if (!editMap) return;
    el.graphKnobs.replaceChildren();
    el.graphKnobs.hidden = false;
    el.graphKnobs.classList.add('is-editing');

    if (!editMap.editable) {
      el.graphKnobs.append(
        line('p', 'pf-edit-note', 'This map is read-only. A sim makes it editable by setting editable: true and building actions() from its nodes.')
      );
      return;
    }

    const head = line('div', 'pf-graph-knobs-head');
    head.append(line('span', null, 'Editing the map'));
    head.append(
      tinyButton('Reset map', 'reset the map', () => {
        const snap = JSON.parse(mapSnapshot || 'null');
        if (snap) {
          editMap.nodes.splice(0, editMap.nodes.length, ...snap.nodes);
          editMap.edges.splice(0, editMap.edges.length, ...snap.edges);
        }
        afterEdit();
      })
    );
    el.graphKnobs.append(head);
    el.graphKnobs.append(
      line(
        'p',
        'pf-edit-note',
        'A verb is offered in the phase it sits under. Move it with its phase select, reorder with the arrows, type to rename the button below, and × removes it. Drag the + on a node to grow a linked node; drag a line or its dot to re-attach it. + verb copies the rules of the last non-advance verb in that group. Membership lines follow the phase select; the other lines are notes on the map.'
      )
    );

    const phases = editMap.nodes.filter((n) => n.kind === 'phase');
    for (const phase of phases) {
      const verbs = editMap.nodes.filter((n) => n.kind === 'action' && n.action && n.phase === phase.id);
      if (!verbs.length) continue;
      el.graphKnobs.append(line('div', 'pf-edit-group', phase.label));
      for (const node of verbs) el.graphKnobs.append(verbRow(node, phases));
      const source =
        [...verbs].reverse().find((n) => !n.advance) || verbs[verbs.length - 1] || editMap.nodes.find((n) => n.kind === 'action');
      el.graphKnobs.append(tinyButton('+ verb', `add a verb to ${phase.label}`, () => addVerbNode(phase, source)));
    }

    el.graphKnobs.append(line('div', 'pf-edit-group', 'Transitions'));
    const nodes = editMap.nodes.map((n) => ({ id: n.id, label: n.label || n.id }));
    const transitions = editMap.edges.filter((e) => !isMembership(e));
    transitions.forEach((edge, i) => el.graphKnobs.append(edgeRow(edge, nodes, i)));
    el.graphKnobs.append(
      tinyButton('+ edge', 'add an edge', () => {
        const fromNode = phases[0] || editMap.nodes[0];
        // a phase -> action line is membership, edited by the phase select, so add a note
        // between two nodes that are not a phase and its verb
        const toNode =
          editMap.nodes.find((n) => n.id !== fromNode.id && n.kind !== 'action') ||
          editMap.nodes.find((n) => n.id !== fromNode.id);
        if (!fromNode || !toNode) return;
        editMap.edges.push({ from: fromNode.id, to: toNode.id, label: 'new' });
        afterEdit();
      })
    );

    const others = editMap.nodes.filter((n) => n.kind === 'state' || n.kind === 'ending');
    el.graphKnobs.append(line('div', 'pf-edit-group', 'States and endings'));
    for (const node of others) el.graphKnobs.append(textRow(node));
    el.graphKnobs.append(tinyButton('+ note', 'add a note node', addNoteNode));
  }

  function toggleEdit() {
    editing = !editing;
    el.graphEdit.textContent = editing ? 'Done' : 'Edit';
    el.graphEdit.classList.toggle('is-on', editing);
    if (editing) {
      // the snapshot is the map as it first opened: Reset always goes back to that
      if (!mapSnapshot) mapSnapshot = JSON.stringify({ nodes: editMap.nodes, edges: editMap.edges });
      drawEditor();
    } else {
      el.graphKnobs.classList.remove('is-editing');
      drawKnobs();
    }
    drawMap(editMap, knobList.length > 0);
  }

  function openGraph() {
    if (!sim || !map || !el.graphbox) return;
    editMap = typeof map === 'function' ? map(sim) : map;
    view.k = 1;
    view.x = 0;
    view.y = 0;
    editing = false;
    if (el.graphEdit) {
      el.graphEdit.hidden = !editMap || !editMap.editable;
      el.graphEdit.textContent = 'Edit';
      el.graphEdit.classList.remove('is-on');
    }
    el.graphKnobs.classList.remove('is-editing');
    drawKnobs();
    drawMap(editMap, knobList.length > 0);
    el.graphbox.showModal();
  }

  // ---------- input ----------
  el.actions.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (btn && !btn.disabled) act(btn.dataset.id);
  });

  el.restart.addEventListener('click', () => {
    build();
    flash('a new run');
  });
  el.again.addEventListener('click', () => build());
  el.helpBtn.addEventListener('click', () => el.helpbox.showModal());
  el.helpClose.addEventListener('click', () => el.helpbox.close());
  if (el.graphBtn) {
    el.graphBtn.hidden = !map;
    el.graphBtn.addEventListener('click', openGraph);
  }
  if (el.graphClose) el.graphClose.addEventListener('click', () => el.graphbox.close());
  if (el.graphEdit) el.graphEdit.addEventListener('click', toggleEdit);
  if (el.graphIn) el.graphIn.addEventListener('click', () => zoomStep(1.25));
  if (el.graphOut) el.graphOut.addEventListener('click', () => zoomStep(1 / 1.25));
  if (el.graphFit) el.graphFit.addEventListener('click', resetView);
  if (el.graphZoomLevel) el.graphZoomLevel.addEventListener('click', resetView);
  if (el.graphBody) el.graphBody.addEventListener('wheel', onGraphWheel, { passive: false });
  if (el.graphbox) {
    el.graphbox.addEventListener('close', () => {
      editing = false;
      if (el.graphEdit) {
        el.graphEdit.textContent = 'Edit';
        el.graphEdit.classList.remove('is-on');
      }
      el.graphKnobs.classList.remove('is-editing');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (el.helpbox.open) return;
    const mapped = keys[e.key];
    if (mapped) {
      e.preventDefault();
      act(mapped);
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      const btn = el.actions.querySelectorAll('button')[Number(e.key) - 1];
      if (btn && !btn.disabled) {
        e.preventDefault();
        act(btn.dataset.id);
      }
    }
  });

  // ---------- the loop ----------
  // step() is whatever the shape's sim needs; most are turn-based and no-op. frame() is
  // for what only exists between actions: a clock, a board in motion.
  fixedLoop({
    step: (dt) => { if (sim) sim.step(dt); },
    render: () => { if (sim && frame) frame(sim.S, ui, sim); },
  }).start();

  build();

  expose('__proto', {
    get S() { return sim.S; },
    get sim() { return sim; },
    act,
    step: (dt) => { sim.step(dt); render(); return sim.text(); },
    text: () => sim.text(),
  });

  return ui;
}
