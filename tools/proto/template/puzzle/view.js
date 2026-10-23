/* Puzzle shape — the screen. A 7x7 board on a canvas, the moves and keys as pills, the
   four directions as buttons. */

import { createGame, LEVELS, RULES, HINT } from './sim.js';
import { startPrototype, pill } from './ui.js';

const TILE = 48;
const W = 7;
const H = 7;

const canvas = document.createElement('canvas');
canvas.width = W * TILE;
canvas.height = H * TILE;
const ctx = canvas.getContext('2d');

const COLORS = {
  floor: '#1b1824',
  wall: '#353044',
  line: '#262232',
  key: '#e8b34b',
  door: '#7fc48a',
  player: '#f1eadb',
  shadow: '#0d0b13',
};

function draw(S, game) {
  const level = LEVELS[S.level];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tile = level.map[y][x];
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = tile === '#' ? COLORS.wall : COLORS.floor;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);

      if (tile === 'K' && !S.taken.includes(x + ',' + y)) {
        ctx.fillStyle = COLORS.key;
        ctx.beginPath();
        ctx.moveTo(px + TILE / 2, py + TILE * 0.28);
        ctx.lineTo(px + TILE * 0.68, py + TILE * 0.5);
        ctx.lineTo(px + TILE / 2, py + TILE * 0.72);
        ctx.lineTo(px + TILE * 0.32, py + TILE * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      if (tile === 'D') {
        const open = S.keys >= game.keysIn();
        ctx.strokeStyle = open ? COLORS.door : COLORS.key;
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 10, py + 8, TILE - 20, TILE - 16);
      }
    }
  }

  // keys already taken
  for (const spot of S.taken) {
    const [x, y] = spot.split(',').map(Number);
    ctx.fillStyle = 'rgba(232, 179, 75, 0.16)';
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // the player
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(S.x * TILE + TILE / 2, S.y * TILE + TILE / 2, TILE * 0.26, 0, Math.PI * 2);
  ctx.fill();
}

function paint(S, ui, game) {
  ui.chip('Garden ' + (S.level + 1) + ' of ' + LEVELS.length);
  ui.head('The locked garden', 'Find every key before the door, before the moves run out.');
  ui.clock(null);
  ui.status([pill('Moves', S.moves), pill('Keys', S.keys + ' / ' + game.keysIn())]);
  draw(S, game);
  ui.stage(canvas);
}

startPrototype({
  createGame,
  rules: RULES,
  hint: HINT,
  paint,
  keys: {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    a: 'left',
    s: 'down',
    d: 'right',
  },
});
