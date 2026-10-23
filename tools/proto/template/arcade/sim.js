/* Arcade shape — a real-time scrap you survive for a fixed time. The game below is an
   example: three lanes, crates coming down, forty seconds. Replace the rules, keep the
   shape of the loop (input -> step(dt) -> the run ends on its own).

   What this shape is good at: constant input, a clock the world runs on, lives, a score.
   There are no resources, no turns and no phases.

   The interface every sim.js must expose (see GUIDE.md):
     createGame({ seed, on }) -> { S, actions(), act(id), step(dt), text() }

   S: t, lane, obstacles, next, lives, score, over */

import { mulberry32 } from '../../../../lib/rng.js';

export const RULES = [
  'Left and right, and nothing else.',
  'A crate that reaches you costs a life; three and the night is over.',
  'Survive forty seconds.',
];

export const HINT = 'Arrow keys, A/D or the buttons. Number keys work too.';

export const DURATION = 40;
const LANES = 3;
const PLAYER_Y = 0.86;

export function createGame({ seed = 1, on = () => {} } = {}) {
  const rnd = mulberry32(seed);

  const S = {
    seed,
    t: 0,
    lane: 1,
    obstacles: [],
    next: 1.2,
    lives: 3,
    score: 0,
    over: null,
  };

  function say(text, tone = '') {
    on('say', { text, tone });
  }

  function end(win, id, name, text) {
    S.over = { id, name, text, win };
    say(text, win ? 'good' : 'bad');
    on('ending', S.over);
  }

  function spawn() {
    S.obstacles.push({ lane: Math.floor(rnd() * LANES), y: -0.12 });
  }

  function step(dt) {
    if (S.over || !(dt > 0)) return;
    S.t += dt;
    S.score += dt * 4;

    const gap = Math.max(0.42, 1.05 - S.t * 0.014);
    S.next -= dt;
    while (S.next <= 0) {
      spawn();
      S.next += gap;
    }

    const speed = 0.55 + S.t * 0.012;
    for (const o of S.obstacles) o.y += speed * dt;

    const hit = S.obstacles.find((o) => o.lane === S.lane && o.y >= PLAYER_Y - 0.05 && o.y <= PLAYER_Y + 0.1);
    if (hit) {
      S.obstacles = S.obstacles.filter((o) => o !== hit);
      S.lives -= 1;
      S.score = Math.max(0, S.score - 5);
      say('A crate catches you.', 'bad');
      on('hit', { lives: S.lives });
      if (S.lives <= 0) {
        end(false, 'caught', 'The alley catches you', 'Three crates, and the night is over.');
        return;
      }
    }

    S.obstacles = S.obstacles.filter((o) => o.y < 1.2);

    if (S.t >= DURATION) {
      end(true, 'through', 'Through the night', 'Forty seconds, and the alley is still standing.');
    }
  }

  function actions() {
    if (S.over) {
      return [
        { id: 'left', label: 'Left', note: '', ok: false, why: 'the run is over' },
        { id: 'right', label: 'Right', note: '', ok: false, why: 'the run is over' },
      ];
    }
    return [
      { id: 'left', label: 'Left', note: 'one lane', ok: S.lane > 0, why: S.lane > 0 ? '' : 'the edge' },
      { id: 'right', label: 'Right', note: 'one lane', ok: S.lane < LANES - 1, why: S.lane < LANES - 1 ? '' : 'the edge' },
    ];
  }

  function act(id) {
    if (S.over) return { ok: false, why: 'the run is over' };
    if (id === 'left') {
      if (S.lane === 0) return { ok: false, why: 'the edge' };
      S.lane -= 1;
      return { ok: true };
    }
    if (id === 'right') {
      if (S.lane === LANES - 1) return { ok: false, why: 'the edge' };
      S.lane += 1;
      return { ok: true };
    }
    return { ok: false, why: 'only left and right' };
  }

  function text() {
    return JSON.stringify({
      seed: S.seed,
      t: Math.round(S.t * 10) / 10,
      lane: S.lane,
      lives: S.lives,
      score: Math.round(S.score),
      obstacles: S.obstacles.length,
      over: S.over && S.over.id,
    });
  }

  return {
    S,
    act,
    actions,
    step,
    text,
    lanes: () => LANES,
    duration: () => DURATION,
  };
}
