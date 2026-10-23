/* Arcade shape — the screen. A canvas of three lanes redrawn every frame, a status row
   that changes only when its numbers do, and two buttons. */

import { createGame, DURATION, RULES, HINT } from './sim.js';
import { startPrototype, pill } from './ui.js';

const W = 320;
const H = 420;
const LANE = W / 3;

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

const COLORS = {
  road: '#17141f',
  edge: '#353044',
  lane: '#2a2537',
  crate: '#e2796a',
  you: '#e8b34b',
  shadow: '#0d0b13',
};

function draw(S) {
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(0, 0, W, H);

  // the lane markings
  for (let i = 1; i < 3; i++) {
    ctx.fillStyle = COLORS.lane;
    ctx.fillRect(i * LANE - 1, 0, 2, H);
  }
  ctx.fillStyle = COLORS.edge;
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(W - 3, 0, 3, H);

  // what is coming down
  for (const o of S.obstacles) {
    ctx.fillStyle = COLORS.crate;
    const x = o.lane * LANE + LANE * 0.22;
    const y = o.y * H;
    ctx.fillRect(x, y, LANE * 0.56, 26);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, y, LANE * 0.56, 4);
  }

  // the player
  const px = S.lane * LANE + LANE / 2;
  const py = 0.86 * H;
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(px, py + 16, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.you;
  ctx.beginPath();
  ctx.moveTo(px, py - 18);
  ctx.lineTo(px + 16, py + 14);
  ctx.lineTo(px - 16, py + 14);
  ctx.closePath();
  ctx.fill();
}

let lastStatus = '';

function statusFor(S) {
  return [
    pill('Time', Math.max(0, Math.ceil(DURATION - S.t)) + 's'),
    pill('Lives', S.lives),
    pill('Score', Math.round(S.score)),
  ];
}

function paint(S, ui) {
  ui.chip('Night run');
  ui.head('The alley', 'Three lanes, crates coming down, forty seconds.');
  ui.clock(null);
  lastStatus = '';
  ui.status(statusFor(S));
  draw(S);
  ui.stage(canvas);
}

function frame(S, ui) {
  const key = Math.ceil(DURATION - S.t) + '|' + S.lives + '|' + Math.round(S.score);
  if (key !== lastStatus) {
    lastStatus = key;
    ui.status(statusFor(S));
  }
  draw(S);
}

startPrototype({
  createGame,
  rules: RULES,
  hint: HINT,
  paint,
  frame,
  keys: {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    a: 'left',
    d: 'right',
  },
});
