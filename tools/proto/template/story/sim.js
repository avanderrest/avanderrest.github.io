/* Story shape — scenes, choices and what the player carries between them. The game below
   is an example lighthouse; replace the scenes.

   What this shape is good at: a sequence of situations where the choice is the game.
   There is no clock, no board and no resources unless a flag is one.

   The interface every sim.js must expose (see GUIDE.md):
     createGame({ seed, on }) -> { S, actions(), act(id), step(dt), text() }

   S: at, flags, path, over, seed */

export const RULES = [
  'Every scene offers two or three things to do, and one of them is taken.',
  'What you do is carried, and the last scene reads it.',
  'The story ends well or it ends.',
];

export const HINT = 'Choose one thing per scene. Number keys work too.';

// ---------- the game ----------
// choices: { id, label, note?, set?, go }  — `set` adds to what you carry.
// A scene with `result(S)` ends the run there.
const SCENES = {
  start: {
    title: 'The last lamp',
    text: 'The lamp is low and the town below has stopped sending oil. Out past the point a boat is showing a single light, and it is not moving.',
    choices: [
      { id: 'trim', label: 'Trim the wick', note: 'make the light last', set: { 'a steady hand': true }, go: 'knock' },
      { id: 'sea', label: 'Climb to the gallery', note: 'look at the boat', set: { 'you saw the boat': true }, go: 'knock' },
      { id: 'sleep', label: 'Sleep until morning', note: 'the light can wait', set: { 'you slept': true }, go: 'knock' },
    ],
  },
  knock: {
    title: 'Someone at the door',
    text: 'Three knocks, then three more. Nobody from the town has climbed the path in a month, and the wind is loud enough to make a knocking of its own.',
    choices: [
      { id: 'open', label: 'Open the door', note: 'see who it is', set: { 'you opened the door': true }, go: 'dawn' },
      { id: 'bar', label: 'Bar the door', note: 'whatever it is can wait', set: { 'you barred the door': true }, go: 'dawn' },
      { id: 'call', label: 'Call out through the wood', note: 'without opening it', set: { 'you called out': true }, go: 'dawn' },
    ],
  },
  dawn: {
    title: 'The boat, again',
    text: 'By first light the boat has drifted closer, and the lamp is nearly out. There is enough oil for one more night, or for the town, but not for both.',
    choices: [
      { id: 'town', label: 'Keep the light for the town', note: 'the boat is not your errand', set: { 'the light stayed lit': true }, go: 'end' },
      { id: 'boat', label: 'Signal the boat', note: 'spend the oil on one answer', set: { 'you signalled the boat': true }, go: 'end' },
    ],
  },
  end: {
    result(S) {
      const flags = S.flags;
      if (flags['you signalled the boat'] && flags['you saw the boat']) {
        return {
          id: 'answered',
          name: 'The boat comes in',
          text: 'They saw the signal because you had looked first, and by noon there are people on the path with oil and questions.',
          win: true,
        };
      }
      if (flags['you barred the door'] && flags['the light stayed lit']) {
        return {
          id: 'kept',
          name: 'The light stays lit',
          text: 'Nobody came up the path. The lamp burns for a town that has stopped looking, which is still a kind of keeping.',
          win: true,
        };
      }
      if (flags['you slept']) {
        return {
          id: 'dark',
          name: 'The lamp goes out',
          text: 'You wake to grey water and a light that is not there. The boat is gone, or it was never close.',
          win: false,
        };
      }
      return {
        id: 'thin',
        name: 'A thin morning',
        text: 'The oil runs out before the answer does. The lamp gutters, and the day arrives without it.',
        win: false,
      };
    },
  },
};

const FIRST = 'start';

export function createGame({ seed = 1, on = () => {} } = {}) {
  const S = {
    seed,
    at: FIRST,
    flags: {},
    path: [],
    over: null,
  };

  function say(text, tone = '') {
    on('say', { text, tone });
  }

  function ending(result) {
    S.over = { id: result.id, name: result.name, text: result.text, win: Boolean(result.win) };
    say(result.text, S.over.win ? 'good' : 'bad');
    on('ending', S.over);
  }

  function enter(id) {
    S.at = id;
    const scene = SCENES[id];
    if (scene.result) {
      ending(scene.result(S));
      return;
    }
    on('scene', { at: id });
    say(scene.title + '.', 'phase');
  }

  function actions() {
    if (S.over) return [];
    const scene = SCENES[S.at];
    if (!scene || scene.result) return [];
    return scene.choices.map((c) => ({
      id: c.id,
      label: c.label,
      note: c.note || '',
      ok: true,
      why: '',
    }));
  }

  function act(id) {
    if (S.over) return { ok: false, why: 'the story is over' };
    const scene = SCENES[S.at];
    if (!scene || scene.result) return { ok: false, why: 'nothing to do here' };
    const choice = scene.choices.find((c) => c.id === id);
    if (!choice) return { ok: false, why: 'no such choice' };

    Object.assign(S.flags, choice.set || {});
    S.path.push({ at: S.at, choice: id });
    say(choice.label + '.');
    enter(choice.go);
    return { ok: true };
  }

  function text() {
    return JSON.stringify({
      seed: S.seed,
      at: S.at,
      flags: Object.keys(S.flags),
      over: S.over && S.over.id,
    });
  }

  say(SCENES[FIRST].title + '.', 'phase');

  return {
    S,
    act,
    actions,
    step: () => {},
    text,
    scene: () => SCENES[S.at],
  };
}
