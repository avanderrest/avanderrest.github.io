/* Track can be laid two ways with the same tool: click a station then click
   the one to join it to (and keep clicking to carry the line on), or drag
   across stations in one stroke. The two share a pointerdown/pointerup pair,
   so it's easy for one to swallow the other — a click read as a failed drag,
   or a drag that leaves a station armed. This drives both through the real
   pointer handlers. */
const RB = window.routeBuilder;
const canvas = document.getElementById('mat');
const notes = [];
const checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(`${name}: ${ok ? 'ok' : 'FAILED'}${extra ? ` (${extra})` : ''}`); };

RB.newGame('calm');
const S = RB.state;
S.river = [{ x: 0, y: 1180 }, { x: 1900, y: 1180 }];
S.inv.track = 999; S.inv.bridges = 9; S.growTimer = 1e9;
const at = [[400, 400], [800, 400], [1200, 400], [600, 800], [1000, 800]];
const st = at.map(([x, y], i) => { const s = RB.spawnStation(['house', 'shop', 'school', 'park', 'house'][i]); s.x = x; s.y = y; return s; });

const rect = canvas.getBoundingClientRect();
const screen = (w) => { const p = RB.worldToScreen(w.x, w.y); return { clientX: rect.left + p.x, clientY: rect.top + p.y }; };
const fire = (type, w) => canvas.dispatchEvent(new PointerEvent(type, { ...screen(w), pointerId: 1, pointerType: 'mouse', bubbles: true }));
const click = (w) => { fire('pointerdown', w); fire('pointerup', w); };
const joined = (x, y) => RB.lines.some((l) => l.stationIds.some((id, i) => id === x.id && (l.stationIds[i - 1] === y.id || l.stationIds[i + 1] === y.id)));

RB.setTool('track');

// Click A, click B: joined. Click C: the same line carries on.
click(st[0]);
check('clicking a station lays nothing yet', RB.lines.length === 0);
click(st[1]);
check('clicking a second station joins them', joined(st[0], st[1]) && RB.lines.length === 1);
click(st[2]);
check('a third click carries the same line on', joined(st[1], st[2]) && RB.lines.length === 1, JSON.stringify(RB.lines.map((l) => l.stationIds)));

// Open grass puts it down: clicking D and then E makes a new line, not a
// branch off C.
click({ x: 1500, y: 1000 });
click(st[3]);
check('open grass puts the armed station down', !joined(st[2], st[3]));
click(st[4]);
check('then D, E makes its own line', joined(st[3], st[4]) && RB.lines.length === 2);

// Esc puts it down too.
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
document.getElementById('pausemenu').hidden = true; // Esc with nothing armed would open the menu; not what we're testing
click(st[0]);
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
click(st[3]);
check('Esc cancels an armed station', !joined(st[0], st[3]));
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
document.getElementById('pausemenu').hidden = true;

// Dragging still works (from a fresh station F, so it's a new line rather
// than an extension), and leaves nothing armed behind it.
const f = RB.spawnStation('shop'); f.x = 1500; f.y = 700;
const lines0 = RB.lines.length;
fire('pointerdown', f);
fire('pointermove', { x: 1300, y: 600 });
fire('pointermove', st[2]);
fire('pointerup', st[2]);
check('a drag from F to C lays a new line', joined(f, st[2]) && RB.lines.length === lines0 + 1);
click(st[4]);
check('the click after a drag only arms — nothing was left armed', RB.lines.length === lines0 + 1 && !joined(f, st[4]) && !joined(st[2], st[4]));
click(f);
check('and the click after that joins as usual', joined(st[4], f));

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
