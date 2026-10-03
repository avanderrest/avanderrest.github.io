/* Backing Band — grown out of the wall's Pocket Synth. The band plays a
   simplified pop backing and every button lights up as it is pressed; then you
   take one instrument at a time and play its part back.

   Scoring is by order, not timing: notes that land on the same beat (a kick and
   a hi-hat, say) can be pressed in either order, and a wrong note costs a star
   but never sends you back to the start — the right button glows instead. The
   speed switch slows everything down for practice.

   Every sound is synthesised with Web Audio: drums from noise and swept sines,
   guitar by Karplus-Strong, and the singer by a sawtooth through three formant
   filters, so "ee", "ah", "oh" and "oo" really are different vowels. A section
   can carry a riser — a whoosh into the drop — that plays but is not scored.

   A song is data. Its instruments carry the buttons; its sections (intro,
   verse, chorus…) each give some of those instruments a pattern, and its form
   strings the sections into the whole song. A pattern is either a drum grid
   (one row per button, `x` for a hit) or a sequence (one token per step: a
   button id, `.` for a rest, `-` to hold the note before, `a+b` for two at
   once). A pattern shorter than its section repeats. You learn a song one
   section and one instrument at a time.

   Mega Jam lays out every button from every song, with a looper: record a
   take, it loops, record again to layer on top. */
(() => {
  'use strict';

  // ---------- constants ----------
  const SAVE_KEY = 'backing-band-save-v1';
  const LIVE_DUR = { keys: 0.5, synth: 0.5, strings: 0.9, horns: 0.25, whistle: 0.35, bass: 0.32, guitar: 0.7, vocals: 0.45, drums: 0.2, fx: 2 };
  const LIGHT_MIN = 0.13;                 // s a pad stays lit, however short its note
  const SHOW_MIN = 3;                     // s; a "Show me" shorter than this plays twice
  const SPEEDS = [[0.5, '½'], [0.75, '¾'], [1, 'Full']];
  const JAM_MAX = 30;                     // s, longest loop the looper will take
  const JAM_AHEAD = 0.15;                 // s the looper schedules ahead of the clock
  const PLAY_AHEAD = 0.25;                // s a song's notes are made into sound ahead of the clock
  const INST = {
    keys: { name: 'Keyboard', icon: '🎹', h: 275 },
    synth: { name: 'Synth', icon: '🎛️', h: 170 },
    strings: { name: 'Strings', icon: '🎻', h: 120 },
    horns: { name: 'Horns', icon: '🎺', h: 42 },
    whistle: { name: 'Whistle', icon: '😗', h: 85 },
    drums: { name: 'Drums', icon: '🥁', h: 25 },
    bass: { name: 'Bass', icon: '🎸', h: 200 },
    guitar: { name: 'Guitar', icon: '⚡', h: 350 },
    vocals: { name: 'Singer', icon: '🎤', h: 320 },
    fx: { name: 'Effects', icon: '✨', h: 235 },
  };
  const VOWELS = {                        // formants F1, F2, F3 in Hz
    ee: [270, 2290, 3010],
    ah: [730, 1090, 2440],
    oh: [450, 800, 2830],
    oo: [300, 870, 2240],
    eh: [530, 1840, 2480],
  };
  const L_FORMANTS = [350, 1200, 2700];   // the tongue-up start of "la", which then opens to "ah"
  // the face's mouth for each vowel: "la" sings as "ah", a shouted "hey!" as "eh"
  const MOUTH = { la: 'ah', hey: 'eh' };

  // ---------- songs ----------
  // Simplified, approximate backings — enough of the shape to be recognised,
  // not a transcription. Ranges: bass E1–G3, keys and synth C3–C5, singer G3–C6.
  const chord = (id, label, notes, sub) => ({ id, label, notes, sub });
  const note = (id, label, n) => ({ id, label, notes: [n] });
  const drum = (id, label, d) => ({ id, label, drum: d });
  const pretty = (n) => n.replace('b', '♭').replace('#', '♯');
  const sing = (id, label, n, vowel) => ({ id, label, notes: [n], vowel, sub: pretty(n.replace(/\d/, '')) });
  // pattern helpers: a one-bar template with X in it, filled with a chord per bar
  const bars = (tpl, ids) => ids.map((id) => tpl.trim().replace(/X/g, id)).join(' ');
  const held = (id, n) => [id, ...Array(n - 1).fill('-')].join(' ');
  const once = (n) => 'x' + '.'.repeat(n - 1);
  const rest = (n) => Array(n).fill('.').join(' ');
  // the same pattern played on another instrument, button for button
  const swap = (seq, ids) => seq.split(' ').map((t) => ids[t] || t).join(' ');

  const KIT = [drum('K', 'Kick', 'kick'), drum('S', 'Snare', 'snare'), drum('H', 'Hi-hat', 'hat')];
  const NEON = ['Fm', 'Cm', 'Eb', 'Bb'];
  const NEON_SYNTH = bars('X - - X - - - -', NEON);
  const NEON_BASS = bars('X . . X . . X .', ['F', 'C', 'Eb', 'Bb']);
  const NEON_DRUMS = { K: 'x.x.x.x.', C: '..x...x.', H: '.x.x.x.x' };
  const SIDEWALK_DRUMS = { K: 'x.......x.......', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' };
  const SIDEWALK_RIFF = 'Fs . Cs . E . Fs . E . Cs . B . Cs .';
  const SIDEWALK_VOX = rest(28) + ' hee . hee .';
  const WHISPER_RIFF = 'G - . G - . Bb - D - . . C - . . Bb - . Bb - . A - G - . . D - . .';
  const WHISPER_DRUMS = { K: 'x...x...x...x...', N: '....x.......x...' };
  const WHISPER_SYNTH = '. . Gm . . . . . . . Gm . . . . . . . Cm . . . . . . . D . . . . .';
  const WHISPER_VOX = rest(28) + ' duh - . .';
  const ANTHEM = ['E', 'B', 'Csm', 'A'];
  const STADIUM_RIFF = 'E - - - - - E - G - - E - - D - C - - - - - - - B - - - - - - -';
  const ASH = ['A', 'Csm', 'Fsm', 'D'];
  const ASH_BASS = ['A', 'Cs', 'Fs', 'D'];
  const ASH_CHANT = 'eh - oh - - - eh - oh - - - eh - ohA - eh - oh - - - eh - oh - - - ohA - - -';
  const ASH_DRUMS = { K: 'x.....x.x.......', S: '....x.......x...' };
  const STRUT_RIFF = 'Cs . . Cs . . E . Fs - . E . . Cs . Gs . . Gs . . B . Cs - . B . . Gs .';
  const STRUT_DRUMS = { K: 'x......x..x.....', C: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' };
  const STRUT_STAB = '. . X - . . . . . . X - . . . .';
  const STRUT_OOH = 'oo - - woo - - - - ' + rest(8) + ' oo - - woo - - - - ' + rest(8);
  const SUNBEAM_VERSE = ['F', 'Am', 'Bb', 'C'];
  const IRON = ['Bbm', 'Gb', 'Db', 'Ab'];
  const IRON_STOMP = { P: 'x.......x.x.....', C: '....x.......x...' };
  const IRON_BASS = bars('X - - - . . X - X - - - . . . .', ['Bb', 'Gb', 'Db', 'Ab']);
  const SWAGGER_HOOK = 'B - . B - . D - . E - . Fs - - - E - . D - . B - . A - . B - - -';
  const SWAGGER_BASS = 'B . . B . . . . A . B . . . . . E . . E . . . . D . E . . . . .';
  const SWAGGER_DRUMS = { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' };
  const GOLDEN_RIFF = 'Cs - . Cs - . E - . Fs - . E - Cs - Ds - . Ds - . Cs - . B - . Gs - - -';
  const GOLDEN_BASS = bars('X - - - - - - - X - - - - - - -', ['Cs', 'A', 'E', 'B']);
  const GOLDEN_OOH = 'oo - - - - - - - - - - - ooB - - - ' + rest(16);
  const GLITTER_HORNS = bars('X . . X . . X - . . . . . . . .', ['A', 'Csm', 'Fsm', 'E']);
  const GLITTER_BASS = bars('X . . X . . X . . . . . . . . .', ['A', 'Cs', 'Fs', 'E']);
  const GLITTER_DRUMS = { K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.' };
  const GLITTER_BADEEYA = 'ba - dee - ya - - - ' + rest(8) + ' ba - dee - ya - - - ' + rest(8);
  const SUNNY_HOOK = 'B - . B - . Cs - B - . . Gs - . . E - . E - . Fs - E - . . Gs - - -';
  const SUNNY_PLUCK = bars('. . X . . . X . . . X . . . X .', ['E', 'B', 'Csm', 'A']);
  const SUNNY_BASS = bars('X . . . . . . . X . . . . . . .', ['E', 'B', 'Cs', 'A']);
  const SURF_RIFF = 'E . E . G . E . A . E . Bb - A - E . E . G . E . A . G . E - - -';
  const CAMPFIRE_STRUM = bars('X . . X . . X . . . . . X . . .', ['Bm', 'G', 'D', 'A']);
  const CAMPFIRE_RIFF = 'Fs - . Fs - . E - D - . . B - . . D - . D - . E - Fs - . . A - - -';
  const CAMPFIRE_BASS = bars('X - - - - - - - X - - - - - - -', ['B', 'G', 'D', 'A']);
  const CRAWL_STOMP = { P: 'x.......x.......', C: '....x.......x...' };
  const CRAWL_RIFF = 'G - - G - - Bb - G - - - F - - - G - - G - - Bb - C - Bb - G - - -';
  const DIZZY_SYNTH = bars('X - - - - - - - X - - - - - - -', ['Csm', 'A', 'E', 'B']);
  const DIZZY_BASS = bars('X - - - - - - - X - - - - - - -', ['Cs', 'A', 'E', 'B']);
  const DARE = ['Db', 'Bbm', 'Gb', 'Ab'];
  const DARE_RIFF = 'Db . . Db . . Ab . Gb . F . Eb - . . Db . . Db . . Ab . Gb - F - Eb - . .';
  const DARE_DRUMS = { K: 'x...x...x...x...', S: '....x.......x...', H: '.x.x.x.x.x.x.x.x' };
  const DARE_BASS = bars('X . . X . . X . . . . . . . . .', ['Db', 'Bb', 'Gb', 'Ab']);
  const EASY_ARP = 'C . Eb . G . Eb . C . Eb . G . Eb . C . Eb . Ab . Eb . C . Eb . Ab . Eb .';
  const EASY_BASS = bars('X - - - - - - - X - - - - - - -', ['C', 'Ab', 'Eb', 'Bb']);
  const CHAMPION_RIFF = 'C - - - . . C . C . C - - - . . . . C . C . C - - - . . Bb - Ab -';
  const DUSTY_BASS = 'E . . . E . . . E . . . . . . . E . E . E . G . E . A . . . . .';
  const DUSTY_DRUMS = { K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.' };
  const SEASIDE_RIFF = 'F . F . Ab . F . C - Ab - F - . . Eb . Eb . G . Eb . Bb - G - Eb - . .';
  const RUNWAY_CHANT = 'rah . rah . ah . ah . ah - - - . . . . ro . ma . ro . ma . ma - - - . . . .';
  const RUNWAY_SYNTH = bars('X . . X . . X . . . . . . . . .', ['Am', 'C', 'D', 'F']);
  const RUNWAY_BASS = bars('X . . . X . . . X . . . X . . .', ['A', 'C', 'D', 'F']);
  const RUNWAY_DRUMS = { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' };
  const SKYWARD_HORNS = bars('X . . X . . . . X . . . . . . .', ['F', 'Dm', 'Bb', 'C']);
  const SKYWARD_STOMP = { P: 'x.......x.......', C: '....x.......x...' };
  const SKYWARD_BASS = bars('X - - - - - - - X - - - - - - -', ['F', 'D', 'Bb', 'C']);
  const FALLING_PIANO = 'Eb . Bb . Bb . Gb . F - - - . . . . Eb . Bb . Bb . Gb . F . Gb . F - Db -';
  const FALLING_BASS = bars('X - - - - - - - X - - - - - - -', ['Eb', 'B', 'Gb', 'Db']);
  const FALLING_DRUMS = { K: 'x.......x.x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' };
  const SPRINT_GTR = bars('X - - X - - X -', ['Db5', 'Db5', 'Gb5', 'Gb5']);
  const DISCO_CHANT = 'oG - oG - oG - oF - oDs - - - oCs - - - oG - oG - oG - oF - oDs - - - . . . .';
  const DISCO_DRUMS = { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' };
  const DISCO_BASS = 'Cs . . . Ch . . . Cs . . . Ch . . . Fs . . . Fh . . . Fs . . . Fh . . .';
  const BOUNCE_RIFF = 'G . G . Bb . G . C . G . D - C . G . G . Bb . G . F . D . C - Bb .';
  const BOUNCE_BASS = bars('X . . . . . X . . . X . . . . .', ['G', 'Eb', 'Bb', 'F']);
  const JUNGLE_RIFF = 'Cs . . Cs . . Cs . Ds . . E . . Ds . Cs . . Cs . . Cs . B . . Gs - - - -';
  const JUNGLE_BASS = bars('X - - - - - - - X - - - - - - -', ['Cs', 'A', 'B', 'Gs']);
  const BUSKER_HOOK = 'A . . A . . Fs . E - Fs - . . . . A . . A . . B . A - Fs - . . . .';
  const BUSKER_BASS = bars('X . . . . . . . X . . X . . . .', ['Fs', 'D', 'E', 'Cs']);
  const BUSKER_DRUMS = { K: 'x......x..x.....', C: '....x.......x...', H: '..x...x...x...x.' };
  const SUNBEAM_CHORUS = ['Dm', 'Bb', 'F', 'C'];
  const ANTHEM_BASS = ['E', 'B', 'Cs', 'A'];
  const ANTHEM_KEYS = bars('X . . X . . X . . . . . . . . .', ANTHEM);

  const SONGS = [
    {
      id: 'neon-highway', title: 'Synthwave',
      key: 'F minor', bpm: 171, spb: 2,
      instruments: {
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
        bass: { tone: 'synth', buttons: [note('F', 'F', 'F2'), note('C', 'C', 'C2'), note('Eb', 'E♭', 'Eb2'), note('Bb', 'B♭', 'Bb1')] },
        synth: { buttons: [chord('Fm', 'Fm', ['F3', 'Ab3', 'C4']), chord('Cm', 'Cm', ['G3', 'C4', 'Eb4']),
          chord('Eb', 'E♭', ['G3', 'Bb3', 'Eb4']), chord('Bb', 'B♭', ['F3', 'Bb3', 'D4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          synth: { seq: NEON_SYNTH },
          drums: { grid: { K: 'x.x.x.x.' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          drums: { grid: NEON_DRUMS },
          bass: { seq: NEON_BASS },
          synth: { seq: bars(held('X', 8), NEON) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:Ab4 - ah:Bb4 - oo:C5 - - - - - - - . . . . ah:C5 - ah:C5 - eh:Bb4 - ah:Ab4 - ah:G4 - - - . . . . oh:Ab4 - oh:Ab4 - oh:Bb4 - ee:C5 - - - . . . . . . ah:C5 - ah:Bb4 - ah:Ab4 - ah:G4 - ah:F4 - - - - - . .', parts: {
          drums: { grid: NEON_DRUMS },
          bass: { seq: NEON_BASS },
          synth: { seq: NEON_SYNTH },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          synth: { seq: held('Fm', 32) },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'midnight-sidewalk', title: 'Funk pop',
      key: 'F♯ minor', bpm: 117, spb: 4,
      instruments: {
        drums: { buttons: KIT },
        bass: { tone: 'synth', buttons: [note('Fs', 'F♯', 'F#2'), note('Cs', 'C♯', 'C#2'), note('D', 'D', 'D2'),
          note('E', 'E', 'E2'), note('B', 'B', 'B1')] },
        keys: { tone: 'piano', buttons: [chord('Fsm', 'F♯m', ['F#3', 'A3', 'C#4']), chord('Gsm', 'G♯m', ['G#3', 'B3', 'D#4']),
          chord('D', 'D', ['F#3', 'A3', 'D4'])] },
        vocals: { buttons: [sing('hee', 'Hee!', 'E5', 'ee')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          drums: { grid: SIDEWALK_DRUMS },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          drums: { grid: SIDEWALK_DRUMS },
          bass: { seq: SIDEWALK_RIFF },
          keys: { seq: bars('. . . . X - . . . . . . X - . .', ['Fsm', 'Gsm']) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ee:C#5 - ee:C#5 - ee:C#5 - - - ee:B4 - ah:A4 - oh:B4 - - - ee:A4 - ee:B4 - ah:A4 - - - . . . . . . . . oo:C#5 - ah:C#5 - ah:C#5 - - - ah:B4 - ah:A4 - ah:B4 - - - . . . . . . . . . . . . ee:E5 . ee:E5 .', parts: {
          drums: { grid: SIDEWALK_DRUMS },
          bass: { seq: bars('X . . . . . X . X . . . . . . .', ['D', 'Fs', 'D', 'Fs']) },
          keys: { seq: bars('X - - - . . . . X - - - . . . .', ['D', 'Fsm', 'D', 'Fsm']) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          drums: { grid: SIDEWALK_DRUMS },
          bass: { seq: SIDEWALK_RIFF },
          vocals: { seq: SIDEWALK_VOX },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'streetlight-anthem', title: 'Arena rock',
      key: 'E major', bpm: 119, spb: 4,
      instruments: {
        keys: { tone: 'piano', buttons: [chord('E', 'E', ['E3', 'G#3', 'B3']), chord('B', 'B', ['F#3', 'B3', 'D#4']),
          chord('Csm', 'C♯m', ['E3', 'G#3', 'C#4']), chord('A', 'A', ['E3', 'A3', 'C#4'])] },
        bass: { tone: 'synth', buttons: [note('E', 'E', 'E2'), note('B', 'B', 'B1'), note('Cs', 'C♯', 'C#2'), note('A', 'A', 'A1')] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash')] },
        guitar: { buttons: [chord('E5', 'E5', ['E2', 'B2', 'E3'], 'power'), chord('B5', 'B5', ['B1', 'F#2', 'B2'], 'power'),
          chord('Cs5', 'C♯5', ['C#2', 'G#2', 'C#3'], 'power'), chord('A5', 'A5', ['A1', 'E2', 'A2'], 'power')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          keys: { seq: ANTHEM_KEYS },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          keys: { seq: ANTHEM_KEYS },
          bass: { seq: bars('X - - - - - - - X - - - - - - -', ANTHEM_BASS) },
          drums: { grid: { K: 'x.......x.......', H: 'x...x...x...x...' } },
        } },
        { id: 'build', name: 'Build', length: 64, parts: {
          keys: { seq: bars('X - - - - - - - X - - - - - - -', ['A', 'E', 'A', 'B']) },
          bass: { seq: bars('X . . . X . . . X . . . X . . .', ['A', 'E', 'A', 'B']) },
          drums: { grid: { K: 'x...x...x...x...', H: 'x.x.x.x.x.x.x.x.' } },
          guitar: { seq: bars(held('X', 16), ['A5', 'E5', 'A5', 'B5']) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'oh:G#4 - oh:G#4 - ee:G#4 - ee:A4 - ee:G#4 - - - . . . . oh:F#4 - oh:F#4 - oo:F#4 - ah:G#4 - ah:F#4 - eh:E4 - ee:E4 - - - ee:E4 - ee:F#4 - ee:G#4 - ee:B4 - ah:G#4 - - - . . . . oh:F#4 - oh:E4 - - - . . . . . . . . . .', parts: {
          keys: { seq: ANTHEM_KEYS },
          bass: { seq: bars('X . . . X . . . X . . . X . . .', ANTHEM_BASS) },
          drums: { grid: { K: 'x.......x.x.....', S: '....x.......x...', H: '..x.x.x.x.x.x.x.', C: 'x...............' } },
          guitar: { seq: bars('X - - - - - X - - - - - - - - -', ['E5', 'B5', 'Cs5', 'A5']) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          keys: { seq: held('E', 32) },
          bass: { seq: held('E', 32) },
          drums: { grid: { K: once(32), C: once(32) } },
          guitar: { seq: held('E5', 32) },
        } },
      ],
      form: ['intro', 'verse', 'build', 'chorus', 'verse', 'build', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'whisper-bass', title: 'Dark pop',
      key: 'G minor', bpm: 135, spb: 4,
      instruments: {
        bass: { tone: 'sub', buttons: [note('G', 'G', 'G2'), note('A', 'A', 'A2'), note('Bb', 'B♭', 'Bb2'), note('C', 'C', 'C3'), note('D', 'D', 'D3')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('N', 'Snap', 'snap')] },
        synth: { buttons: [chord('Gm', 'Gm', ['G3', 'Bb3', 'D4']), chord('Cm', 'Cm', ['G3', 'C4', 'Eb4']), chord('D', 'D', ['F#3', 'A3', 'D4'])] },
        vocals: { buttons: [sing('duh', 'Duh!', 'G4', 'ah')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          bass: { seq: WHISPER_RIFF },
          drums: { grid: { N: '....x.......x...' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          bass: { seq: WHISPER_RIFF },
          drums: { grid: WHISPER_DRUMS },
          synth: { seq: WHISPER_SYNTH },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:D4 - ah:F4 - ah:G4 - ah:G4 - ah:G4 - ah:F4 - ah:G4 - - - ah:D4 - ah:F4 - ah:G4 - - - . . . . . . . .', parts: {
          bass: { seq: WHISPER_RIFF },
          drums: { grid: WHISPER_DRUMS },
          synth: { seq: WHISPER_SYNTH },
          vocals: { seq: WHISPER_VOX },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          bass: { seq: 'G - - - - - G - - - G - - - - - Bb - - - - - Bb - - - A - - - - -' },
          drums: { grid: WHISPER_DRUMS },
          synth: { seq: held('Gm', 16) + ' ' + held('D', 16) },
          vocals: { seq: 'duh - ' + rest(30) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          bass: { seq: WHISPER_RIFF },
          vocals: { seq: WHISPER_VOX },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'drop', 'drop', 'outro'],
    },
    {
      id: 'stadium-stomp', title: 'Garage rock',
      key: 'E minor', bpm: 124, spb: 4,
      instruments: {
        bass: { tone: 'synth', buttons: [note('E', 'E', 'E2'), note('G', 'G', 'G2'), note('D', 'D', 'D2'), note('C', 'C', 'C2'), note('B', 'B', 'B1')] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash')] },
        // single notes, not power chords: the riff is one line, and one note at a time is
        // what overdrive sounds best on (chords distorted together clash) — as in Surf Monster
        guitar: { buttons: [note('E', 'E', 'E3'), note('G', 'G', 'G3'), note('D', 'D', 'D3'), note('C', 'C', 'C3'), note('B', 'B', 'B2')] },
        vocals: { tone: 'choir', buttons: [sing('oE', 'Oh', 'E4', 'oh'), sing('oG', 'Oh', 'G4', 'oh'), sing('oD', 'Oh', 'D4', 'oh'),
          sing('oC', 'Oh', 'C4', 'oh'), sing('oB', 'Oh', 'B3', 'oh')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          bass: { seq: STADIUM_RIFF },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'ah:E4 - - - - - ah:E4 - ah:G4 - - ee:E4 - - oh:D4 - oh:C4 - - - - - - - oh:B3 - - - - - - -', parts: {
          bass: { seq: STADIUM_RIFF },
          drums: { grid: { K: 'x...x...x...x...', H: '..x...x...x...x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          bass: { seq: STADIUM_RIFF },
          drums: { grid: {
            K: 'x.......x.......x.......x.......',
            S: '....x.......x.......x.......x...',
            H: '..x...x...x...x...x...x...x...x.',
            C: once(32),
          } },
          guitar: { seq: STADIUM_RIFF },
          vocals: { seq: swap(STADIUM_RIFF, { E: 'oE', G: 'oG', D: 'oD', C: 'oC', B: 'oB' }) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          bass: { seq: held('E', 32) },
          drums: { grid: { K: once(32), C: once(32) } },
          guitar: { seq: held('E', 32) },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'ash-and-echo', title: 'Indie pop',
      key: 'A major', bpm: 127, spb: 4,
      instruments: {
        vocals: { tone: 'choir', buttons: [sing('eh', 'Eh', 'C#5', 'eh'), sing('oh', 'Oh', 'B4', 'oh'), sing('ohA', 'Oh', 'A4', 'oh')] },
        drums: { buttons: [...KIT, drum('T', 'Tom', 'tomhi'), drum('L', 'Low tom', 'tomlo'), drum('P', 'Stomp', 'stomp')] },
        bass: { tone: 'synth', buttons: [note('A', 'A', 'A2'), note('Cs', 'C♯', 'C#2'), note('Fs', 'F♯', 'F#2'), note('D', 'D', 'D2')] },
        synth: { buttons: [chord('A', 'A', ['A3', 'C#4', 'E4']), chord('Csm', 'C♯m', ['G#3', 'C#4', 'E4']),
          chord('Fsm', 'F♯m', ['F#3', 'A3', 'C#4']), chord('D', 'D', ['F#3', 'A3', 'D4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          vocals: { seq: ASH_CHANT },
          drums: { grid: { L: 'x.....x.x.......', T: '....x.......x...' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'ah:E4 - ah:E4 - eh:E4 - ee:F#4 - ee:E4 - - - . . . . ah:C#4 - ah:E4 - ah:E4 - oh:F#4 - ah:E4 - - - . . . .', parts: {
          drums: { grid: { P: 'x.....x.x.......', S: '....x.......x...' } },
          bass: { seq: bars('X - - - - - - - X - - - - - - -', ASH_BASS) },
          synth: { seq: bars(held('X', 16), ASH) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          vocals: { seq: ASH_CHANT },
          drums: { grid: Object.assign({ H: 'x.x.x.x.x.x.x.x.' }, ASH_DRUMS) },
          bass: { seq: bars('X . . . X . . . X . . . X . . .', ASH_BASS) },
          synth: { seq: bars(held('X', 16), ASH) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          vocals: { seq: ASH_CHANT },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'rebel-strut', title: 'Indie funk',
      key: 'C♯ minor', bpm: 79, spb: 4,
      instruments: {
        bass: { tone: 'synth', buttons: [note('Cs', 'C♯', 'C#2'), note('E', 'E', 'E2'), note('Fs', 'F♯', 'F#2'), note('Gs', 'G♯', 'G#1'), note('B', 'B', 'B1')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
        keys: { tone: 'piano', buttons: [chord('Csm', 'C♯m', ['E3', 'G#3', 'C#4']), chord('Gsm', 'G♯m', ['G#3', 'B3', 'D#4']),
          chord('A', 'A', ['E3', 'A3', 'C#4']), chord('E', 'E', ['E3', 'G#3', 'B3'])] },
        vocals: { buttons: [sing('oo', 'Ooh', 'G#4', 'oo'), sing('woo', 'Woo', 'B4', 'oo')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          bass: { seq: STRUT_RIFF },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          bass: { seq: STRUT_RIFF },
          drums: { grid: STRUT_DRUMS },
          keys: { seq: bars(STRUT_STAB, ['Csm', 'Gsm', 'Csm', 'Gsm']) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: '. . . . . . . . ah:G#4 ah:G#4 eh:B4 eh:B4 ah:G#4 ee:F#4 ah:E4 - . . . . . . . . ah:G#4 ah:G#4 eh:B4 eh:B4 ah:G#4 ee:F#4 ah:E4 -', parts: {
          bass: { seq: STRUT_RIFF },
          drums: { grid: STRUT_DRUMS },
          keys: { seq: bars(STRUT_STAB, ['A', 'E', 'Csm', 'Gsm']) },
          vocals: { seq: STRUT_OOH },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          bass: { seq: STRUT_RIFF },
          vocals: { seq: STRUT_OOH },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'sunbeam-parade', title: 'Orchestral pop',
      key: 'F major', bpm: 178, spb: 2,
      instruments: {
        keys: { tone: 'piano', buttons: [chord('F', 'F', ['F3', 'A3', 'C4']), chord('Am', 'Am', ['E3', 'A3', 'C4']),
          chord('Bb', 'B♭', ['F3', 'Bb3', 'D4']), chord('C', 'C', ['E3', 'G3', 'C4']), chord('Dm', 'Dm', ['F3', 'A3', 'D4'])] },
        bass: { tone: 'synth', buttons: [note('F', 'F', 'F2'), note('A', 'A', 'A1'), note('Bb', 'B♭', 'Bb1'), note('C', 'C', 'C2'), note('D', 'D', 'D2')] },
        drums: { buttons: KIT },
        strings: { buttons: [chord('Dm', 'Dm', ['D4', 'F4', 'A4']), chord('Bb', 'B♭', ['D4', 'F4', 'Bb4']),
          chord('F', 'F', ['C4', 'F4', 'A4']), chord('C', 'C', ['C4', 'E4', 'G4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          keys: { seq: bars('X . X . X . X .', SUNBEAM_VERSE) },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          keys: { seq: bars('X . X . X . X .', SUNBEAM_VERSE) },
          bass: { seq: bars('X . . . X . . .', ['F', 'A', 'Bb', 'C']) },
          drums: { grid: { K: 'x...x...', S: '..x...x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ee:A4 - ee:A4 - oo:F4 - ah:A4 - ee:A4 - eh:G4 - oo:F4 - ah:G4 - oo:A4 - oh:A4 - oo:G4 - - - oh:F4 - - - . . . .', parts: {
          keys: { seq: bars('X . X . X . X .', SUNBEAM_CHORUS) },
          bass: { seq: bars('X . . . X . . .', ['D', 'Bb', 'F', 'C']) },
          drums: { grid: { K: 'x...x...', S: '..x...x.', H: '.x.x.x.x' } },
          strings: { seq: bars(held('X', 8), SUNBEAM_CHORUS) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          keys: { seq: held('F', 32) },
          bass: { seq: held('F', 32) },
          drums: { grid: { K: once(32) } },
          strings: { seq: held('F', 32) },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'green-eyed-sprint', title: 'Indie rock',
      key: 'D♭ major', bpm: 148, spb: 2,
      instruments: {
        guitar: { buttons: [chord('Db5', 'D♭5', ['Db2', 'Ab2', 'Db3'], 'power'), chord('Gb5', 'G♭5', ['Gb2', 'Db3', 'Gb3'], 'power'),
          chord('Ab5', 'A♭5', ['Ab1', 'Eb2', 'Ab2'], 'power'), chord('Bb5', 'B♭5', ['Bb1', 'F2', 'Bb2'], 'power')] },
        bass: { tone: 'synth', buttons: [note('Db', 'D♭', 'Db2'), note('Gb', 'G♭', 'Gb2'), note('Ab', 'A♭', 'Ab1'), note('Bb', 'B♭', 'Bb1')] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash'), drum('T', 'Tambourine', 'tamb')] },
        synth: { buttons: [chord('Gb', 'G♭', ['Gb3', 'Bb3', 'Db4']), chord('Db', 'D♭', ['F3', 'Ab3', 'Db4']),
          chord('Ab', 'A♭', ['Ab3', 'C4', 'Eb4']), chord('Bbm', 'B♭m', ['F3', 'Bb3', 'Db4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          guitar: { seq: SPRINT_GTR },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          guitar: { seq: SPRINT_GTR },
          bass: { seq: bars('X . . . X . . .', ['Db', 'Db', 'Gb', 'Gb']) },
          drums: { grid: { K: 'x...x...', S: '..x...x.', H: 'x.x.x.x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'eh:Ab4 - - ah:Ab4 - ee:Ab4 - - eh:Bb4 - ee:Ab4 - ah:Gb4 - oo:F4 - ah:F4 - ee:Eb4 - - - . . oh:Db4 - - - . . . .', parts: {
          guitar: { seq: bars(held('X', 16), ['Gb5', 'Db5', 'Ab5', 'Bb5']) },
          bass: { seq: bars('X . . . X . . . X . . . X . . .', ['Gb', 'Db', 'Ab', 'Bb']) },
          drums: { grid: { K: 'x...x...x...x...', S: '..x...x...x...x.', T: '.x.x.x.x.x.x.x.x', C: 'x...............' } },
          synth: { seq: bars(held('X', 16), ['Gb', 'Db', 'Ab', 'Bbm']) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: held('Db5', 32) },
          bass: { seq: held('Db', 32) },
          drums: { grid: { K: once(32), C: once(32) } },
          synth: { seq: held('Db', 32) },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'disco-chant', title: 'Disco house',
      key: 'C♯ major', bpm: 128, spb: 4,
      instruments: {
        vocals: { tone: 'choir', buttons: [sing('oG', 'Ooh', 'G#4', 'oo'), sing('oF', 'Ooh', 'F4', 'oo'), sing('oDs', 'Ooh', 'D#4', 'oo'), sing('oCs', 'Ooh', 'C#4', 'oo')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat'), drum('O', 'Open hat', 'openhat')] },
        guitar: { tone: 'clean', buttons: [chord('gCs', 'C♯', ['C#3', 'F3', 'G#3', 'C#4'], 'clean'), chord('gFs', 'F♯', ['F#2', 'C#3', 'F#3', 'A#3'], 'clean')] },
        bass: { tone: 'synth', buttons: [note('Cs', 'C♯', 'C#2'), Object.assign(note('Ch', 'C♯', 'C#3'), { sub: 'high' }),
          note('Fs', 'F♯', 'F#2'), Object.assign(note('Fh', 'F♯', 'F#3'), { sub: 'high' })] },
        keys: { tone: 'piano', buttons: [chord('Cs', 'C♯', ['F3', 'G#3', 'C#4']), chord('Fs', 'F♯', ['F#3', 'A#3', 'C#4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          vocals: { seq: DISCO_CHANT },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          drums: { grid: DISCO_DRUMS },
          bass: { seq: DISCO_BASS },
          keys: { seq: bars('. . X - . . . . . . X - . . . .', ['Cs', 'Fs']) },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          vocals: { seq: DISCO_CHANT },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.' } },
          guitar: { seq: bars('. . X . . . X . . . X . . . X .', ['gCs', 'gFs']) },
          bass: { seq: DISCO_BASS },
          keys: { seq: bars('. . X - . . . . . . X - . . . .', ['Cs', 'Fs']) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          vocals: { seq: DISCO_CHANT },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'bounce-signal', instrumental: true, title: 'Electro house',
      key: 'G minor', bpm: 105, spb: 4,
      instruments: {
        synth: { tone: 'pluck', buttons: [note('G', 'G', 'G3'), note('Bb', 'B♭', 'Bb3'), note('C', 'C', 'C4'), note('D', 'D', 'D4'), note('F', 'F', 'F4')] },
        bass: { tone: 'synth', buttons: [note('G', 'G', 'G2'), note('Eb', 'E♭', 'Eb2'), note('Bb', 'B♭', 'Bb1'), note('F', 'F', 'F2')] },
        drums: { buttons: KIT },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          synth: { seq: BOUNCE_RIFF },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          synth: { seq: BOUNCE_RIFF },
          bass: { seq: BOUNCE_BASS },
          drums: { grid: { K: 'x...x...x...x...', H: '..x...x...x...x.' } },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          synth: { seq: BOUNCE_RIFF },
          bass: { seq: BOUNCE_BASS },
          drums: { grid: { K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          synth: { seq: BOUNCE_RIFF },
        } },
      ],
      form: ['intro', 'verse', 'drop', 'verse', 'drop', 'drop', 'outro'],
    },
    {
      id: 'jungle-drop', instrumental: true, title: 'Big room EDM',
      key: 'C♯', bpm: 128, spb: 4,
      instruments: {
        synth: { tone: 'supersaw', buttons: [note('Cs', 'C♯', 'C#4'), note('Ds', 'D♯', 'D#4'), note('E', 'E', 'E4'), note('B', 'B', 'B3'), note('Gs', 'G♯', 'G#3')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('S', 'Snare', 'snare'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
        bass: { tone: 'synth', buttons: [note('Cs', 'C♯', 'C#2'), note('A', 'A', 'A1'), note('B', 'B', 'B1'), note('Gs', 'G♯', 'G#1')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          drums: { grid: { K: 'x...x...x...x...', H: '..x...x...x...x.' } },
        } },
        { id: 'build', name: 'Build', length: 32, riser: true, parts: {
          drums: { grid: { S: 'x.x.x.x.x.x.x.x.' } },
          bass: { seq: held('Cs', 32) },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          synth: { seq: JUNGLE_RIFF },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' } },
          bass: { seq: JUNGLE_BASS },
        } },
        { id: 'break', name: 'Break', length: 64, parts: {
          drums: { grid: { K: 'x...x...x...x...' } },
          bass: { seq: JUNGLE_BASS },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          drums: { grid: { K: 'x...x...x...x...' } },
          bass: { seq: held('Cs', 32) },
        } },
      ],
      form: ['intro', 'build', 'drop', 'break', 'build', 'drop', 'drop', 'outro'],
    },
    {
      id: 'street-busker', title: 'Busker pop',
      key: 'F♯ minor', bpm: 98, spb: 4,
      instruments: {
        keys: { tone: 'piano', buttons: [note('A', 'A', 'A4'), note('Fs', 'F♯', 'F#4'), note('E', 'E', 'E4'), note('B', 'B', 'B4')] },
        bass: { tone: 'synth', buttons: [note('Fs', 'F♯', 'F#2'), note('D', 'D', 'D2'), note('E', 'E', 'E2'), note('Cs', 'C♯', 'C#2')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          keys: { seq: BUSKER_HOOK },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          keys: { seq: BUSKER_HOOK },
          bass: { seq: BUSKER_BASS },
          drums: { grid: BUSKER_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:A4 . ah:A4 ee:B4 - . ah:A4 . ah:A4 ee:B4 - . ah:A4 . ah:A4 ee:B4 oh:C#5 - oh:B4 - oh:A4 - - - . . . . . . . .', parts: {
          keys: { seq: BUSKER_HOOK },
          bass: { seq: BUSKER_BASS },
          drums: { grid: BUSKER_DRUMS },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          keys: { seq: BUSKER_HOOK },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'iron-stomp', title: 'Arena pop',
      key: 'B♭ minor', bpm: 125, spb: 4,
      instruments: {
        drums: { buttons: [drum('P', 'Stomp', 'stomp'), drum('C', 'Clap', 'clap'), drum('K', 'Kick', 'kick'), drum('S', 'Snare', 'snare'),
          drum('T', 'Tom', 'tomhi'), drum('L', 'Low tom', 'tomlo')] },
        bass: { tone: 'synth', buttons: [note('Bb', 'B♭', 'Bb1'), note('Gb', 'G♭', 'Gb1'), note('Db', 'D♭', 'Db2'), note('Ab', 'A♭', 'Ab1')] },
        synth: { buttons: [chord('Bbm', 'B♭m', ['F3', 'Bb3', 'Db4']), chord('Gb', 'G♭', ['Gb3', 'Bb3', 'Db4']),
          chord('Db', 'D♭', ['F3', 'Ab3', 'Db4']), chord('Ab', 'A♭', ['Ab3', 'C4', 'Eb4'])] },
        vocals: { tone: 'choir', buttons: [sing('pain', 'Pain!', 'F4', 'hey')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          drums: { grid: IRON_STOMP },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          drums: { grid: IRON_STOMP },
          bass: { seq: IRON_BASS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: '. . . . . . . . oo:F4 ah:F4 ee:F4 ah:F4 - oo:F4 ah:F4 ee:F4 ah:F4 - ee:Ab4 - ee:Bb4 - eh:Ab4 - ee:F4 - - - . . . .', parts: {
          drums: { grid: { K: 'x.......x.......', S: '....x.......x...', T: '...x.......x....', L: '......x.......x.' } },
          bass: { seq: IRON_BASS },
          synth: { seq: bars('X - - - . . . . . . . . . . . .', IRON) },
          vocals: { seq: 'pain - - - ' + rest(28) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          drums: { grid: IRON_STOMP },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'whistle-swagger', title: 'Disco pop',
      key: 'B minor', bpm: 128, spb: 4,
      instruments: {
        whistle: { buttons: [note('A', 'A', 'A4'), note('B', 'B', 'B4'), note('D', 'D', 'D5'), note('E', 'E', 'E5'), note('Fs', 'F♯', 'F#5')] },
        guitar: { tone: 'clean', buttons: [chord('gBm', 'Bm', ['B2', 'F#3', 'B3', 'D4'], 'clean'), chord('gE', 'E', ['B2', 'E3', 'G#3', 'B3'], 'clean')] },
        bass: { tone: 'synth', buttons: [note('B', 'B', 'B1'), note('A', 'A', 'A1'), note('E', 'E', 'E2'), note('D', 'D', 'D2')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          whistle: { seq: SWAGGER_HOOK },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          guitar: { seq: bars('. . X . . . X . . . X . . . X .', ['gBm', 'gE']) },
          bass: { seq: SWAGGER_BASS },
          drums: { grid: SWAGGER_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:D5 - ah:D5 - oh:B4 - - - oo:A4 - ah:B4 - - - . . ah:B4 - ah:A4 - ah:B4 - - - . . . . . . . .', parts: {
          whistle: { seq: SWAGGER_HOOK },
          guitar: { seq: bars('. . X . . . X . . . X . . . X .', ['gBm', 'gE']) },
          bass: { seq: SWAGGER_BASS },
          drums: { grid: SWAGGER_DRUMS },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          whistle: { seq: SWAGGER_HOOK },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'golden-rise', title: 'Progressive house',
      key: 'C♯ minor', bpm: 126, spb: 4,
      instruments: {
        synth: { tone: 'supersaw', buttons: [note('Gs', 'G♯', 'G#3'), note('B', 'B', 'B3'), note('Cs', 'C♯', 'C#4'), note('Ds', 'D♯', 'D#4'),
          note('E', 'E', 'E4'), note('Fs', 'F♯', 'F#4')] },
        keys: { tone: 'piano', buttons: [chord('Csm', 'C♯m', ['E3', 'G#3', 'C#4']), chord('A', 'A', ['E3', 'A3', 'C#4']),
          chord('E', 'E', ['E3', 'G#3', 'B3']), chord('B', 'B', ['F#3', 'B3', 'D#4'])] },
        bass: { tone: 'synth', buttons: [note('Cs', 'C♯', 'C#2'), note('A', 'A', 'A1'), note('E', 'E', 'E2'), note('B', 'B', 'B1')] },
        drums: { buttons: [...KIT, drum('C', 'Clap', 'clap')] },
        vocals: { buttons: [sing('oo', 'Ooh', 'C#5', 'oo'), sing('ooB', 'Ooh', 'B4', 'oo')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          keys: { seq: bars(held('X', 16), ['Csm', 'A', 'E', 'B']) },
          vocals: { seq: GOLDEN_OOH },
        } },
        { id: 'build', name: 'Build', length: 32, riser: true, parts: {
          drums: { grid: { S: 'x.x.x.x.x.x.x.x.' } },
          bass: { seq: held('Cs', 32) },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          synth: { seq: GOLDEN_RIFF },
          bass: { seq: GOLDEN_BASS },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'break', name: 'Break', length: 64, parts: {
          keys: { seq: bars(held('X', 16), ['Csm', 'A', 'E', 'B']) },
          vocals: { seq: GOLDEN_OOH },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          keys: { seq: held('Csm', 32) },
        } },
      ],
      form: ['intro', 'build', 'drop', 'break', 'build', 'drop', 'drop', 'outro'],
    },
    {
      id: 'glitter-groove', title: 'Disco funk',
      key: 'A major', bpm: 126, spb: 4,
      instruments: {
        horns: { buttons: [chord('A', 'A', ['A3', 'C#4', 'E4']), chord('Csm', 'C♯m', ['G#3', 'C#4', 'E4']),
          chord('Fsm', 'F♯m', ['A3', 'C#4', 'F#4']), chord('E', 'E', ['B3', 'E4', 'G#4'])] },
        bass: { tone: 'synth', buttons: [note('A', 'A', 'A1'), note('Cs', 'C♯', 'C#2'), note('Fs', 'F♯', 'F#1'), note('E', 'E', 'E2')] },
        drums: { buttons: KIT },
        vocals: { buttons: [sing('ba', 'Ba', 'C#5', 'ah'), sing('dee', 'Dee', 'B4', 'ee'), sing('ya', 'Ya', 'A4', 'ah')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          horns: { seq: GLITTER_HORNS },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'oo:A4 - oo:C#5 - ee:B4 - eh:A4 - eh:F#4 - - - . . . . . . . . . . . . . . . . . . . .', parts: {
          horns: { seq: GLITTER_HORNS },
          bass: { seq: GLITTER_BASS },
          drums: { grid: GLITTER_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          horns: { seq: GLITTER_HORNS },
          bass: { seq: GLITTER_BASS },
          drums: { grid: GLITTER_DRUMS },
          vocals: { seq: GLITTER_BADEEYA },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          horns: { seq: held('A', 32) },
          vocals: { seq: GLITTER_BADEEYA },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'sunny-trumpet', title: 'Tropical house',
      key: 'E major', bpm: 118, spb: 4,
      instruments: {
        horns: { buttons: [note('E', 'E', 'E4'), note('Fs', 'F♯', 'F#4'), note('Gs', 'G♯', 'G#4'), note('B', 'B', 'B4'), note('Cs', 'C♯', 'C#5')] },
        synth: { tone: 'pluck', buttons: [chord('E', 'E', ['E3', 'G#3', 'B3']), chord('B', 'B', ['F#3', 'B3', 'D#4']),
          chord('Csm', 'C♯m', ['E3', 'G#3', 'C#4']), chord('A', 'A', ['E3', 'A3', 'C#4'])] },
        bass: { tone: 'synth', buttons: [note('E', 'E', 'E2'), note('B', 'B', 'B1'), note('Cs', 'C♯', 'C#2'), note('A', 'A', 'A1')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          horns: { seq: SUNNY_HOOK },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'oh:G#4 - - - ah:E4 - ee:E4 - ah:F#4 - ah:G#4 - ah:G#4 - ah:F#4 - ah:E4 - ee:E4 - ee:C#4 - - - ee:E4 - - - . . . .', parts: {
          synth: { seq: SUNNY_PLUCK },
          bass: { seq: SUNNY_BASS },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...' } },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          horns: { seq: SUNNY_HOOK },
          synth: { seq: SUNNY_PLUCK },
          bass: { seq: SUNNY_BASS },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          horns: { seq: SUNNY_HOOK },
        } },
      ],
      form: ['intro', 'verse', 'drop', 'verse', 'drop', 'drop', 'outro'],
    },
    {
      id: 'surf-monster', title: 'Pop punk',
      key: 'E minor', bpm: 150, spb: 4,
      instruments: {
        guitar: { buttons: [note('E', 'E', 'E2'), note('G', 'G', 'G2'), note('A', 'A', 'A2'), note('Bb', 'B♭', 'Bb2')] },
        bass: { tone: 'synth', buttons: [note('E', 'E', 'E2'), note('G', 'G', 'G2'), note('A', 'A', 'A2'), note('Bb', 'B♭', 'Bb2'),
          note('C', 'C', 'C2'), note('D', 'D', 'D2')] },
        horns: { buttons: [chord('Em', 'Em', ['G3', 'B3', 'E4']), chord('C', 'C', ['G3', 'C4', 'E4']),
          chord('G', 'G', ['G3', 'B3', 'D4']), chord('D', 'D', ['A3', 'D4', 'F#4'])] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          guitar: { seq: SURF_RIFF },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          guitar: { seq: SURF_RIFF },
          bass: { seq: SURF_RIFF },
          drums: { grid: { K: 'x.......x.......', S: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ee:E4 - ah:G4 - oo:A4 - ah:B4 - ah:B4 - oo:A4 - ah:G4 - - - ah:E4 - ah:E4 - ee:G4 - ah:E4 - - - . . . . . .', parts: {
          guitar: { seq: SURF_RIFF },
          horns: { seq: bars('X - . . X - . . . . . . . . . .', ['Em', 'C', 'G', 'D']) },
          bass: { seq: bars('X . . . X . . . X . . . X . . .', ['E', 'C', 'G', 'D']) },
          drums: { grid: {
            K: 'x.......x.......x.......x.......',
            S: '....x.......x.......x.......x...',
            H: '..x...x...x...x...x...x...x...x.',
            C: once(32),
          } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: SURF_RIFF },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'campfire-drop', title: 'Folk EDM',
      key: 'B minor', bpm: 124, spb: 4,
      instruments: {
        guitar: { tone: 'nylon', buttons: [chord('Bm', 'Bm', ['B2', 'F#3', 'B3', 'D4'], 'nylon'), chord('G', 'G', ['G2', 'B2', 'D3', 'G3', 'B3'], 'nylon'),
          chord('D', 'D', ['D3', 'A3', 'D4'], 'nylon'), chord('A', 'A', ['A2', 'E3', 'A3', 'C#4'], 'nylon')] },
        synth: { tone: 'supersaw', buttons: [note('A', 'A', 'A3'), note('B', 'B', 'B3'), note('D', 'D', 'D4'), note('E', 'E', 'E4'), note('Fs', 'F♯', 'F#4')] },
        bass: { tone: 'synth', buttons: [note('B', 'B', 'B1'), note('G', 'G', 'G1'), note('D', 'D', 'D2'), note('A', 'A', 'A1')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('S', 'Snare', 'snare'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          guitar: { seq: CAMPFIRE_STRUM },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'oh:F#4 - ah:F#4 - ee:E4 - ah:D4 - - - ee:D4 - ah:E4 - - - eh:F#4 - ah:E4 - ee:D4 - - - . . . . . . . .', parts: {
          guitar: { seq: CAMPFIRE_STRUM },
          bass: { seq: CAMPFIRE_BASS },
          drums: { grid: { K: 'x.......x.......' } },
        } },
        { id: 'build', name: 'Build', length: 32, riser: true, parts: {
          guitar: { seq: bars(held('X', 16), ['Bm', 'A']) },
          drums: { grid: { S: 'x.x.x.x.x.x.x.x.' } },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          synth: { seq: CAMPFIRE_RIFF },
          bass: { seq: CAMPFIRE_BASS },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: held('Bm', 32) },
        } },
      ],
      form: ['intro', 'verse', 'build', 'drop', 'verse', 'build', 'drop', 'drop', 'outro'],
    },
    {
      id: 'late-night-crawl', title: 'Slow-burn rock',
      key: 'G minor', bpm: 85, spb: 4,
      instruments: {
        drums: { buttons: [drum('P', 'Stomp', 'stomp'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
        guitar: { buttons: [note('G', 'G', 'G2'), note('Bb', 'B♭', 'Bb2'), note('C', 'C', 'C3'), note('F', 'F', 'F2')] },
        bass: { tone: 'synth', buttons: [note('G', 'G', 'G1'), note('Bb', 'B♭', 'Bb1'), note('C', 'C', 'C2'), note('F', 'F', 'F1')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          drums: { grid: CRAWL_STOMP },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          drums: { grid: CRAWL_STOMP },
          guitar: { seq: CRAWL_RIFF },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'oo:G4 - ah:G4 - ah:G4 - oh:F4 - - - . . . . . . ee:D4 - ee:F4 - ee:G4 - oh:F4 - ah:D4 - ah:C4 - - - . .', parts: {
          drums: { grid: Object.assign({ H: '..x...x...x...x.' }, CRAWL_STOMP) },
          guitar: { seq: CRAWL_RIFF },
          bass: { seq: CRAWL_RIFF },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: CRAWL_RIFF },
        } },
      ],
      form: ['intro', 'verse', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'dizzy-dancefloor', title: 'Electropop',
      key: 'C♯ minor', bpm: 119, spb: 4,
      instruments: {
        synth: { buttons: [chord('Csm', 'C♯m', ['E3', 'G#3', 'C#4']), chord('A', 'A', ['E3', 'A3', 'C#4']),
          chord('E', 'E', ['E3', 'G#3', 'B3']), chord('B', 'B', ['F#3', 'B3', 'D#4'])] },
        bass: { tone: 'synth', buttons: [note('Cs', 'C♯', 'C#2'), note('A', 'A', 'A1'), note('E', 'E', 'E2'), note('B', 'B', 'B1')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap')] },
        vocals: { buttons: [sing('da', 'Da', 'E4', 'ah'), sing('doo', 'Doo', 'C#4', 'oo')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          synth: { seq: DIZZY_SYNTH },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          synth: { seq: DIZZY_SYNTH },
          bass: { seq: DIZZY_BASS },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: '. . . . . . . . ah:C#5 - ah:B4 - - - ah:B4 - ah:A4 - ee:G#4 - oh:G#4 - eh:E4 - - - . . . . . .', parts: {
          synth: { seq: DIZZY_SYNTH },
          bass: { seq: DIZZY_BASS },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...' } },
          vocals: { seq: 'da - da - doo - doo - ' + rest(24) },
        } },
        { id: 'outro', name: 'Outro', length: 64, parts: {
          synth: { seq: DIZZY_SYNTH },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'dancefloor-dare', title: 'Dance rock',
      key: 'D♭ major', bpm: 128, spb: 4,
      instruments: {
        // a single-note riff, the Surf Monster way
        guitar: { buttons: [note('Db', 'D♭', 'Db3'), note('Eb', 'E♭', 'Eb3'), note('F', 'F', 'F3'), note('Gb', 'G♭', 'Gb3'), note('Ab', 'A♭', 'Ab3')] },
        bass: { tone: 'synth', buttons: [note('Db', 'D♭', 'Db2'), note('Bb', 'B♭', 'Bb1'), note('Gb', 'G♭', 'Gb1'), note('Ab', 'A♭', 'Ab1')] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash')] },
        synth: { buttons: [chord('Db', 'D♭', ['F3', 'Ab3', 'Db4']), chord('Bbm', 'B♭m', ['F3', 'Bb3', 'Db4']),
          chord('Gb', 'G♭', ['Gb3', 'Bb3', 'Db4']), chord('Ab', 'A♭', ['Ab3', 'C4', 'Eb4'])] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          guitar: { seq: DARE_RIFF },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          guitar: { seq: DARE_RIFF },
          bass: { seq: DARE_BASS },
          drums: { grid: DARE_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:Ab4 - ah:Ab4 - ah:Bb4 - ah:Ab4 - ah:F4 - ee:Eb4 - - - . . ah:Db4 - oo:Eb4 - ah:F4 - ah:F4 - ee:Eb4 - ee:Db4 - - - . .', parts: {
          guitar: { seq: DARE_RIFF },
          bass: { seq: DARE_BASS },
          drums: { grid: DARE_DRUMS },
          synth: { seq: bars(held('X', 16), DARE) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: held('Db', 32) },
          bass: { seq: held('Db', 32) },
          drums: { grid: { K: once(32), C: once(32) } },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'easy-falsetto', title: 'Synth pop',
      key: 'C minor', bpm: 110, spb: 4,
      instruments: {
        synth: { buttons: [note('C', 'C', 'C4'), note('Eb', 'E♭', 'Eb4'), note('G', 'G', 'G4'), note('Ab', 'A♭', 'Ab4')] },
        strings: { buttons: [chord('Cm', 'Cm', ['G3', 'C4', 'Eb4']), chord('Ab', 'A♭', ['Ab3', 'C4', 'Eb4']),
          chord('Eb', 'E♭', ['G3', 'Bb3', 'Eb4']), chord('Bb', 'B♭', ['Bb3', 'D4', 'F4'])] },
        bass: { tone: 'synth', buttons: [note('C', 'C', 'C2'), note('Ab', 'A♭', 'Ab1'), note('Eb', 'E♭', 'Eb2'), note('Bb', 'B♭', 'Bb1')] },
        drums: { buttons: KIT },
        vocals: { buttons: [sing('re', 'Re', 'Eb5', 'ee'), sing('lax', 'lax', 'C5', 'ah')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          synth: { seq: EASY_ARP },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'ee:G4 - ah:G4 - ah:Ab4 - ee:G4 - ah:Eb4 - - - . . . . . . . . . . . . . . . . . . . .', parts: {
          synth: { seq: EASY_ARP },
          bass: { seq: EASY_BASS },
          drums: { grid: { K: 'x.......x.......', S: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          synth: { seq: EASY_ARP },
          strings: { seq: bars(held('X', 16), ['Cm', 'Ab', 'Eb', 'Bb']) },
          bass: { seq: EASY_BASS },
          drums: { grid: { K: 'x.......x.......', S: '....x.......x...', H: '..x...x...x...x.' } },
          vocals: { seq: 're - lax - - - - - ' + rest(24) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          synth: { seq: EASY_ARP },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'champion-run', title: '80s rock',
      key: 'C minor', bpm: 109, spb: 4,
      instruments: {
        // the riff is a rhythm more than a tune, which is why it reads from the band alone
        guitar: { buttons: [note('C', 'C', 'C3'), note('Bb', 'B♭', 'Bb2'), note('Ab', 'A♭', 'Ab2')] },
        bass: { tone: 'synth', buttons: [note('C', 'C', 'C2'), note('Bb', 'B♭', 'Bb1'), note('Ab', 'A♭', 'Ab1')] },
        drums: { buttons: [...KIT, drum('C', 'Crash', 'crash')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          guitar: { seq: CHAMPION_RIFF },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          bass: { seq: CHAMPION_RIFF },
          drums: { grid: { K: 'x.......x.......', S: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ee:G4 - ah:G4 - ah:G4 - ah:G4 - ah:Ab4 - - - ah:G4 - - - eh:F4 - eh:Eb4 - ee:F4 - - - ee:Eb4 - ee:C4 - - - . .', parts: {
          guitar: { seq: CHAMPION_RIFF },
          bass: { seq: CHAMPION_RIFF },
          drums: { grid: {
            K: 'x.......x.......x.......x.......',
            S: '....x.......x.......x.......x...',
            C: once(32),
          } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          guitar: { seq: held('C', 32) },
          bass: { seq: held('C', 32) },
          drums: { grid: { K: once(32), C: once(32) } },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'dusty-bassline', title: 'Funk rock',
      key: 'E minor', bpm: 110, spb: 4,
      instruments: {
        bass: { tone: 'synth', buttons: [note('E', 'E', 'E2'), note('G', 'G', 'G2'), note('A', 'A', 'A2')] },
        drums: { buttons: KIT },
        guitar: { tone: 'clean', buttons: [chord('gEm', 'Em', ['E3', 'G3', 'B3', 'E4'], 'clean'), chord('gA', 'A', ['E3', 'A3', 'C#4', 'E4'], 'clean')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          bass: { seq: DUSTY_BASS },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          bass: { seq: DUSTY_BASS },
          drums: { grid: DUSTY_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:B4 - ah:B4 - ah:B4 - ah:B4 - ah:B4 - ah:A4 - oo:G4 - - - . . . . . . . . . . . . . . . .', parts: {
          bass: { seq: DUSTY_BASS },
          drums: { grid: DUSTY_DRUMS },
          guitar: { seq: bars('. . . . . . X . . . . . . . X .', ['gEm', 'gA']) },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          bass: { seq: DUSTY_BASS },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'seaside-rave', instrumental: true, title: 'Festival EDM',
      key: 'F minor', bpm: 125, spb: 4,
      instruments: {
        synth: { tone: 'pluck', buttons: [note('Eb', 'E♭', 'Eb4'), note('F', 'F', 'F4'), note('G', 'G', 'G4'), note('Ab', 'A♭', 'Ab4'),
          note('Bb', 'B♭', 'Bb4'), note('C', 'C', 'C5')] },
        bass: { tone: 'synth', buttons: [note('F', 'F', 'F2'), note('Db', 'D♭', 'Db2'), note('Ab', 'A♭', 'Ab1'), note('Eb', 'E♭', 'Eb2')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('S', 'Snare', 'snare'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          synth: { seq: SEASIDE_RIFF },
        } },
        { id: 'build', name: 'Build', length: 32, riser: true, parts: {
          drums: { grid: { S: 'x.x.x.x.x.x.x.x.' } },
          bass: { seq: held('F', 32) },
        } },
        { id: 'drop', name: 'Drop', length: 64, parts: {
          synth: { seq: SEASIDE_RIFF },
          bass: { seq: bars('X - - - - - - - X - - - - - - -', ['F', 'Db', 'Ab', 'Eb']) },
          drums: { grid: { K: 'x...x...x...x...', C: '....x.......x...', H: '..x...x...x...x.' } },
        } },
        { id: 'break', name: 'Break', length: 64, parts: {
          synth: { seq: SEASIDE_RIFF },
          drums: { grid: { K: 'x...x...x...x...' } },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          synth: { seq: SEASIDE_RIFF },
        } },
      ],
      form: ['intro', 'build', 'drop', 'break', 'build', 'drop', 'drop', 'outro'],
    },
    {
      id: 'runway-chant', title: 'Dance pop',
      key: 'A minor', bpm: 119, spb: 4,
      instruments: {
        vocals: { tone: 'choir', buttons: [sing('rah', 'Rah', 'C5', 'ah'), sing('ah', 'Ah', 'A4', 'ah'), sing('ro', 'Ro', 'E5', 'oh'), sing('ma', 'Ma', 'D5', 'ah')] },
        synth: { tone: 'supersaw', buttons: [chord('Am', 'Am', ['E3', 'A3', 'C4']), chord('C', 'C', ['E3', 'G3', 'C4']),
          chord('D', 'D', ['F#3', 'A3', 'D4']), chord('F', 'F', ['F3', 'A3', 'C4'])] },
        bass: { tone: 'synth', buttons: [note('A', 'A', 'A1'), note('C', 'C', 'C2'), note('D', 'D', 'D2'), note('F', 'F', 'F2')] },
        drums: { buttons: [drum('K', 'Kick', 'kick'), drum('C', 'Clap', 'clap'), drum('H', 'Hi-hat', 'hat')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          vocals: { seq: RUNWAY_CHANT },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'ah:A4 - ah:A4 - oh:A4 - ah:G4 - ee:A4 - - - . . . . ah:A4 - ah:A4 - oh:A4 - ah:C5 - ee:A4 - - - . . . .', parts: {
          synth: { seq: RUNWAY_SYNTH },
          bass: { seq: RUNWAY_BASS },
          drums: { grid: RUNWAY_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          vocals: { seq: RUNWAY_CHANT },
          synth: { seq: RUNWAY_SYNTH },
          bass: { seq: RUNWAY_BASS },
          drums: { grid: RUNWAY_DRUMS },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          vocals: { seq: RUNWAY_CHANT },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'skyward-brass', title: 'Brass pop',
      key: 'F major', bpm: 82, spb: 4,
      instruments: {
        horns: { buttons: [chord('F', 'F', ['A3', 'C4', 'F4']), chord('Dm', 'Dm', ['A3', 'D4', 'F4']),
          chord('Bb', 'B♭', ['Bb3', 'D4', 'F4']), chord('C', 'C', ['G3', 'C4', 'E4'])] },
        drums: { buttons: [drum('P', 'Stomp', 'stomp'), drum('C', 'Clap', 'clap')] },
        bass: { tone: 'synth', buttons: [note('F', 'F', 'F2'), note('D', 'D', 'D2'), note('Bb', 'B♭', 'Bb1'), note('C', 'C', 'C2')] },
        vocals: { tone: 'choir', buttons: [sing('high', 'High', 'C5', 'ah'), sing('hopes', 'Hopes', 'A4', 'oh')] },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 64, parts: {
          horns: { seq: SKYWARD_HORNS },
        } },
        { id: 'verse', name: 'Verse', length: 64, lead: 'ah:F4 - oo:F4 - ah:F4 - ah:A4 - ah:C5 - - - . . . . oh:A4 - ah:G4 - ee:F4 - - - . . . . . . . .', parts: {
          drums: { grid: SKYWARD_STOMP },
          bass: { seq: SKYWARD_BASS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, parts: {
          horns: { seq: SKYWARD_HORNS },
          drums: { grid: SKYWARD_STOMP },
          bass: { seq: SKYWARD_BASS },
          vocals: { seq: 'high - - - hopes - - - - - - - ' + rest(20) },
        } },
        { id: 'outro', name: 'Outro', length: 64, parts: {
          horns: { seq: SKYWARD_HORNS },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
    {
      id: 'falling-keys', title: 'Nu metal',
      key: 'E♭ minor', bpm: 105, spb: 4,
      instruments: {
        keys: { tone: 'piano', buttons: [note('Db', 'D♭', 'Db4'), note('Eb', 'E♭', 'Eb4'), note('F', 'F', 'F4'), note('Gb', 'G♭', 'Gb4'), note('Bb', 'B♭', 'Bb4')] },
        guitar: { buttons: [chord('Eb5', 'E♭5', ['Eb2', 'Bb2', 'Eb3'], 'power'), chord('B5', 'B5', ['B1', 'F#2', 'B2'], 'power'),
          chord('Gb5', 'G♭5', ['Gb2', 'Db3', 'Gb3'], 'power'), chord('Db5', 'D♭5', ['Db2', 'Ab2', 'Db3'], 'power')] },
        bass: { tone: 'synth', buttons: [note('Eb', 'E♭', 'Eb2'), note('B', 'B', 'B1'), note('Gb', 'G♭', 'Gb1'), note('Db', 'D♭', 'Db2')] },
        drums: { buttons: KIT },
      },
      sections: [
        { id: 'intro', name: 'Intro', length: 32, parts: {
          keys: { seq: FALLING_PIANO },
        } },
        { id: 'verse', name: 'Verse', length: 64, parts: {
          keys: { seq: FALLING_PIANO },
          bass: { seq: FALLING_BASS },
          drums: { grid: FALLING_DRUMS },
        } },
        { id: 'chorus', name: 'Chorus', length: 64, lead: 'ah:Bb4 - ah:Bb4 - oh:Bb4 - ah:Ab4 - ah:Gb4 - oh:Gb4 - ah:F4 - - - ah:Eb4 - ee:Eb4 - eh:F4 - eh:Gb4 - - - eh:F4 - ee:Eb4 - - -', parts: {
          keys: { seq: FALLING_PIANO },
          guitar: { seq: bars(held('X', 16), ['Eb5', 'B5', 'Gb5', 'Db5']) },
          bass: { seq: FALLING_BASS },
          drums: { grid: FALLING_DRUMS },
        } },
        { id: 'outro', name: 'Outro', length: 32, parts: {
          keys: { seq: FALLING_PIANO },
        } },
      ],
      form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'chorus', 'outro'],
    },
  ];

  // ---------- parsing ----------
  const problems = [];                    // anything malformed in SONGS, for the test case

  function midiOf(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) { problems.push('bad note ' + name); return 60; }
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 12 * (+m[3] + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  /* A part is one instrument in one section: it carries the instrument's
     buttons and tone, so it can be handed to sound() just like an instrument. */
  function parsePart(song, section, inst, pat) {
    const def = song.instruments[inst];
    const where = `${song.id}/${section.id}/${inst}`;
    if (!def) { problems.push(where + ': no such instrument in the song'); return null; }
    const part = { inst, key: section.id + '/' + inst, section, buttons: def.buttons, tone: def.tone };
    const idx = Object.fromEntries(def.buttons.map((b, i) => [b.id, i]));
    const events = [];
    if (pat.grid) {
      const rows = Object.entries(pat.grid);
      part.length = rows[0][1].length;
      for (const [id, row] of rows) {
        if (!(id in idx)) problems.push(where + ': no button ' + id);
        if (row.length !== part.length) problems.push(where + ': grid rows differ in length');
        [...row].forEach((c, step) => { if (c === 'x') events.push({ step, b: idx[id], len: 1 }); });
      }
    } else {
      const toks = pat.seq.trim().split(/\s+/);
      part.length = toks.length;
      let last = [];
      toks.forEach((tok, step) => {
        if (tok === '.') { last = []; return; }
        if (tok === '-') { last.forEach((e) => e.len++); return; }
        last = tok.split('+').map((id) => {
          if (!(id in idx)) problems.push(where + ': no button ' + id);
          const e = { step, b: idx[id], len: 1 };
          events.push(e);
          return e;
        });
      });
    }
    if (section.length % part.length) problems.push(where + ': length ' + part.length + ' does not divide ' + section.length);
    events.sort((a, b) => a.step - b.step || a.b - b.b);
    part.events = events;
    // what the player has to press, beat by beat: same-step notes form one group
    part.groups = [];
    for (const e of events) {
      const g = part.groups[part.groups.length - 1];
      if (g && g.step === e.step) { if (!g.bs.includes(e.b)) g.bs.push(e.b); }
      else part.groups.push({ step: e.step, bs: [e.b] });
    }
    return part;
  }

  /* A section's voice: its signature bits (a "vocals" part, written with buttons
     like any part) and its lead line (`vowel:note` per sung step, `-` to hold, `.`
     to rest), laid out together across the whole section as one part for the
     playback to sing. Null when the section has no singing. */
  function buildVoice(song, sec, part, lead) {
    if (!part && !lead) return null;
    const voice = { inst: 'vocals', length: sec.length, buttons: [], events: [] };
    const index = new Map();
    const button = (vowel, n) => {
      const key = vowel + '|' + n;
      if (!index.has(key)) {
        index.set(key, voice.buttons.length);
        voice.buttons.push({ vowel, notes: [n], midis: [midiOf(n)] });
      }
      return index.get(key);
    };
    if (part) {
      for (let c = 0; c * part.length < sec.length; c++) {
        for (const e of part.events) {
          const btn = part.buttons[e.b];
          voice.events.push({ step: c * part.length + e.step, len: e.len, b: button(btn.vowel, btn.notes[0]) });
        }
      }
    }
    if (lead) {
      const toks = lead.trim().split(/\s+/);
      if (sec.length % toks.length) problems.push(`${song.id}/${sec.id}: lead of ${toks.length} does not divide ${sec.length}`);
      const one = [];
      let last = null;
      toks.forEach((tok, step) => {
        if (tok === '.') { last = null; return; }
        if (tok === '-') { if (last) last.len++; return; }
        const m = /^(ee|eh|ah|oh|oo):([A-G][#b]?-?\d)$/.exec(tok);
        if (!m) { problems.push(`${song.id}/${sec.id}: bad lead note ${tok}`); last = null; return; }
        last = { step, len: 1, b: button(m[1], m[2]) };
        one.push(last);
      });
      for (let c = 0; c * toks.length < sec.length; c++) {
        for (const e of one) voice.events.push({ step: c * toks.length + e.step, len: e.len, b: e.b });
      }
    }
    voice.events.sort((x, y) => x.step - y.step);
    return voice;
  }

  for (const song of SONGS) {
    song.order = Object.keys(song.instruments);
    for (const [inst, def] of Object.entries(song.instruments)) {
      def.inst = inst;
      def.buttons.forEach((b) => { b.midis = (b.notes || []).map(midiOf); });
    }
    for (const sec of song.sections) {
      const pats = sec.parts;
      sec.parts = {};
      for (const inst of song.order) {
        if (pats[inst]) sec.parts[inst] = parsePart(song, sec, inst, pats[inst]);
      }
      for (const inst of Object.keys(pats)) if (!song.instruments[inst]) problems.push(`${song.id}/${sec.id}: ${inst} is not in the band`);
      // the singer is not one of your parts: it sings along when Vocals is on, and is
      // never a row of buttons to follow
      sec.voice = buildVoice(song, sec, sec.parts.vocals, sec.lead);
      delete sec.parts.vocals;
      sec.partList = Object.values(sec.parts).filter(Boolean);
    }
    song.order = song.order.filter((inst) => inst !== 'vocals');
    song.sung = song.sections.some((sec) => sec.voice);
    song.form = (song.form || song.sections.map((s) => s.id)).map((id) => {
      const s = song.sections.find((x) => x.id === id);
      if (!s) problems.push(`${song.id}: form names missing section ${id}`);
      return s;
    }).filter(Boolean);
    song.allParts = song.sections.flatMap((s) => s.partList);
  }

  /* How hard a song is: a turn is as hard as the beats it asks you to play plus
     the different buttons they are on, and a song is as hard as its three hardest
     turns — its easy parts don't make its riff any easier. The songs are then
     split into thirds, so the labels stay balanced as songs are added. */
  for (const song of SONGS) {
    const turns = song.allParts.map((p) => p.groups.length + new Set(p.events.map((e) => e.b)).size).sort((a, b) => b - a);
    const top = turns.slice(0, 3);
    song.load = top.reduce((a, n) => a + n, 0) / top.length;
  }
  const LEVELS = ['Easy', 'Medium', 'Hard'];
  SONGS.slice().sort((a, b) => a.load - b.load)
    .forEach((song, i, all) => { song.level = LEVELS[Math.min(2, Math.floor((i * 3) / all.length))]; });

  /* Mega Jam: every distinct button from every song, per instrument. Two
     buttons are the same if they sound the same (notes, vowel and tone). */
  const MEGA_EXTRAS = {
    horns: [chord('hC', 'C', ['C4', 'E4', 'G4']), chord('hDm', 'Dm', ['A3', 'D4', 'F4']), chord('hF', 'F', ['C4', 'F4', 'A4']),
      chord('hG', 'G', ['B3', 'D4', 'G4']), chord('hAm', 'Am', ['A3', 'C4', 'E4']), chord('hBb', 'B♭', ['Bb3', 'D4', 'F4'])],
    // a pentatonic run, so any order sounds like a tune
    whistle: ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'].map((n) => note('w' + n, n.replace(/\d/, ''), n)),
    vocals: [Object.assign(sing('hey', 'Hey!', 'A4', 'hey'), { tone: 'choir' }), sing('laG', 'La', 'G4', 'la'), sing('laC', 'La', 'C5', 'la')],
    fx: [{ id: 'riser', label: 'Riser', fx: 'riser' }, { id: 'cheer', label: 'Cheer', fx: 'cheer' }],
    guitar: [['nC', 'C', ['C3', 'E3', 'G3', 'C4', 'E4']], ['nG', 'G', ['G2', 'B2', 'D3', 'G3', 'B3']],
      ['nAm', 'Am', ['A2', 'E3', 'A3', 'C4', 'E4']], ['nEm', 'Em', ['E2', 'B2', 'E3', 'G3', 'B3']], ['nD', 'D', ['D3', 'A3', 'D4']]]
      .map(([id, label, notes]) => Object.assign(chord(id, label, notes, 'nylon'), { tone: 'nylon' })),
  };
  const MEGA = { id: 'mega', title: 'Mega Jam', genre: 'Every sound in the band', mega: true, instruments: {}, order: [], extraKeys: [] };
  for (const inst of Object.keys(INST)) {
    const seen = new Map();
    for (const b of MEGA_EXTRAS[inst] || []) {
      b.midis = (b.notes || []).map(midiOf);
      const mk = [inst, b.fx || b.notes.join('.'), b.vowel || '', b.tone || ''].join('|');
      seen.set(mk, b);
      MEGA.extraKeys.push(mk);
    }
    for (const song of SONGS) {
      const def = song.instruments[inst];
      if (!def) continue;
      for (const b of def.buttons) {
        const mk = [inst, b.drum || b.notes.join('.'), b.vowel || '', def.tone || ''].join('|');
        if (seen.has(mk)) continue;
        const copy = Object.assign({}, b, { mk, tone: def.tone });
        // a single note shows its octave: two B♭s apart, or the note A beside the A chord
        if (b.notes && b.notes.length === 1 && inst !== 'vocals') copy.sub = pretty(b.notes[0]);
        // the same note sung solo and by a crowd would otherwise look like one button twice
        if (def.tone === 'choir') copy.sub = (copy.sub || '') + ' · choir';
        seen.set(mk, copy);
      }
    }
    if (!seen.size) continue;
    for (const [mk, b] of seen) b.mk = mk;
    const buttons = [...seen.values()];
    if (inst !== 'drums' && inst !== 'fx') buttons.sort((a, b) => a.midis[0] - b.midis[0]);
    MEGA.instruments[inst] = { inst, buttons };
    MEGA.order.push(inst);
  }
  const byMk = new Map();
  for (const inst of MEGA.order) MEGA.instruments[inst].buttons.forEach((b, i) => byMk.set(b.mk, [inst, i]));

  // ---------- save ----------
  let save = { stars: {}, song: SONGS[0].id, speed: 1, vocals: true, mode: 'play', jam: { len: 0, events: [] } };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch (e) { /* private mode: play unsaved */ }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  const starsOf = (song, part) => ((save.stars[song.id] || {})[part.key]) || 0;

  // ---------- audio ----------
  let ac = null;
  let master = null;
  let noiseBuf = null;
  const plucks = new Map();               // midi -> Karplus-Strong buffer

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function env(t, peak, attack, hold, release) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }
  function noise(t, dur) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;                        // the buffer is a second long; a riser is not
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
    return s;
  }
  function osc(type, f, t, dur) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function playDrum(kind, t, out) {
    if (kind === 'kick') {
      const o = osc('sine', 150, t, 0.4);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g).connect(out);
    } else if (kind === 'snare') {
      const n = noise(t, 0.22);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1300;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(hp).connect(g).connect(out);
      const o = osc('triangle', 190, t, 0.1);
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.4, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g2).connect(out);
    } else if (kind === 'hat') {
      const n = noise(t, 0.07);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'clap') {
      const n = noise(t, 0.25);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {       // a clap is a few hands, a hair apart
        g.gain.setValueAtTime(0.7, t + i * 0.011);
        g.gain.exponentialRampToValueAtTime(0.1, t + i * 0.011 + 0.009);
      }
      g.gain.setValueAtTime(0.5, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'snap') {
      const n = noise(t, 0.08);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 2.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'crash') {
      const n = noise(t, 1.4);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4200;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'openhat') {
      const n = noise(t, 0.45);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.26, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'tamb') {
      // jingles: a few bright bursts close together
      const n = noise(t, 0.25);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 8500;
      bp.Q.value = 1.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        g.gain.setValueAtTime(0.5, t + i * 0.018);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.018 + 0.014);
      }
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'tomhi' || kind === 'tomlo') {
      const [from, to] = kind === 'tomhi' ? [240, 160] : [150, 95];
      const o = osc('sine', from, t, 0.45);
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + 0.2);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.75, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(out);
    } else if (kind === 'stomp') {
      // a boot on a wooden floor: a deep thud and the knock of the boards
      const o = osc('sine', 95, t, 0.35);
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(out);
      const n = noise(t, 0.12);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.45, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(lp).connect(g2).connect(out);
    }
  }

  function playBass(m, t, dur, tone, out) {
    const g = env(t, tone === 'sub' ? 0.55 : 0.38, 0.006, Math.max(0.02, dur - 0.08), 0.09);
    if (tone === 'sub') {
      // a pure sub is all but silent on a laptop, so a little triangle above it
      osc('sine', hz(m), t, dur + 0.1).connect(g);
      const g2 = ac.createGain();
      g2.gain.value = 0.25;
      osc('triangle', hz(m + 12), t, dur + 0.1).connect(g2).connect(g);
    } else {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
      osc('sawtooth', hz(m), t, dur + 0.1).connect(lp).connect(g);
    }
    g.connect(out);
  }

  function playKeys(midis, t, dur, tone, out) {
    for (const m of midis) {
      if (tone === 'supersaw') {
        // the wide EDM lead: a stack of detuned saws
        const g = env(t, 0.05, 0.008, Math.max(0.02, dur - 0.06), 0.16);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3600;
        for (const det of [-22, -11, 0, 11, 22]) {
          const o = osc('sawtooth', hz(m), t, dur + 0.2);
          o.detune.value = det;
          o.connect(lp);
        }
        lp.connect(g).connect(out);
      } else if (tone === 'pluck') {
        // marimba-ish: a woody knock that dies away whatever the note's length
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc('sine', hz(m), t, 0.45).connect(g);
        const g2 = ac.createGain();
        g2.gain.setValueAtTime(0.4, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc('sine', hz(m) * 4, t, 0.08).connect(g2).connect(g);
        g.connect(out);
      } else if (tone === 'synth') {
        const g = env(t, 0.09, 0.02, Math.max(0.02, dur - 0.1), 0.18);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        for (const det of [-7, 7]) {
          const o = osc('sawtooth', hz(m), t, dur + 0.2);
          o.detune.value = det;
          o.connect(lp);
        }
        lp.connect(g).connect(out);
      } else {
        // piano-ish: struck, then dying away whether the key is held or not
        const ring = Math.max(dur, 0.25) + 0.6;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
        osc('triangle', hz(m), t, ring).connect(g);
        const g2 = ac.createGain();
        g2.gain.value = 0.35;
        osc('sine', hz(m + 12), t, ring).connect(g2).connect(g);
        g.connect(out);
      }
    }
  }

  /* Karplus-Strong: a burst of noise one period long, fed round a loop that
     smooths it a little each pass. Raw white noise is a hard pick right at the
     bridge — all twang — so the burst is smoothed first: `soft` is how much,
     from a pick (0) to the flesh of a thumb on nylon (1). Softer strings also
     lose their top faster as they ring, which is what makes nylon sound warm. */
  function pluckBuffer(m, soft) {
    const key = m + '/' + soft;
    if (plucks.has(key)) return plucks.get(key);
    const sr = ac.sampleRate;
    const N = Math.round(sr / hz(m));
    const buf = ac.createBuffer(1, Math.floor(sr * 1.6), sr);
    const d = buf.getChannelData(0);
    const a = 0.75 - soft * 0.5;          // one-pole smoothing of the burst
    let y = 0;
    for (let i = 0; i < N; i++) { y += a * (Math.random() * 2 - 1 - y); d[i] = y; }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += d[i] / N;
    for (let i = 0; i < N; i++) d[i] = (d[i] - mean) * 1.6;   // no thump of DC, and back up to strength
    const w = 0.25 + soft * 0.15;         // the outer taps of the loop's smoothing: more is darker
    const keep = 0.997 - soft * 0.002;
    for (let i = N; i < d.length; i++) {
      const b = i - N;
      d[i] = keep * (w * d[b] + (1 - 2 * w) * d[b + 1 < i ? b + 1 : b] + w * (b > 0 ? d[b - 1] : d[b]));
    }
    // the last few whole periods, to loop if the note is held past the end of the buffer:
    // whole periods, so the loop joins without a click
    const loopLen = N * Math.ceil((sr * 0.05) / N);
    buf.loopFrom = (d.length - loopLen) / sr;
    plucks.set(key, buf);
    return buf;
  }
  let drive = null;
  const GUITAR = {
    // soft: the pluck; drive: overdrive or not; tone: the last lowpass; peak, release, strum spacing
    electric: { soft: 0.35, drive: true, tone: 1900, peak: 0.24, release: 0.12, strum: 0.008 },
    clean: { soft: 0.45, drive: false, tone: 3400, peak: 0.24, release: 0.25, strum: 0.014 },
    nylon: { soft: 1, drive: false, tone: 2400, peak: 0.28, release: 0.35, strum: 0.022 },
  };
  function playGuitar(midis, t, dur, tone, out) {
    const G = GUITAR[tone] || GUITAR.electric;
    let into;
    let last;
    if (G.drive) {
      if (!drive) {
        drive = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; drive[i] = Math.tanh(x * 2.2); }
      }
      // trim the top before the drive, so the strings' fizz never gets distorted,
      // then roll off what the drive adds, the way a guitar speaker does
      // and drive it hard: the overdrive squashes the string's fade, so a held chord
      // stays full, as a real overdriven guitar's does
      into = ac.createGain();
      into.gain.value = 3;
      const pre = ac.createBiquadFilter();
      pre.type = 'lowpass';
      pre.frequency.value = 2600;
      const ws = ac.createWaveShaper();
      ws.curve = drive;
      ws.oversample = '2x';
      into.connect(pre).connect(ws);
      last = ws;
    } else {
      into = ac.createGain();
      last = into;
    }
    if (tone === 'nylon') {
      // the wooden body: a warm resonance low down
      const body = ac.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 220;
      body.Q.value = 1.2;
      body.gain.value = 5;
      last.connect(body);
      last = body;
    }
    const hp = ac.createBiquadFilter();   // and nothing muddy beneath the guitar
    hp.type = 'highpass';
    hp.frequency.value = 80;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = G.tone;
    const g = env(t, G.peak, 0.004, Math.max(0.02, dur - 0.06), G.release);
    midis.forEach((m, i) => {
      const s = ac.createBufferSource();
      s.buffer = pluckBuffer(m, G.soft);
      s.loop = true;                      // held past the buffer, it rings on
      s.loopStart = s.buffer.loopFrom;
      s.loopEnd = s.buffer.duration;
      s.connect(into);
      s.start(t + i * G.strum);           // a strum, low string first
      s.stop(t + dur + 0.4);
    });
    last.connect(hp).connect(lp).connect(g).connect(out);
  }

  function playVoice(m, vowel, t, dur, out, choir) {
    const g = env(t, choir ? 0.3 : 0.5, 0.06, Math.max(0.02, dur - 0.1), 0.14);
    const target = VOWELS[MOUTH[vowel] || vowel];
    const filters = target.map((f, i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      // wider as the note rises: a high voice has few harmonics, far apart, and a
      // narrow formant can fall between them and pass almost nothing
      bp.Q.value = f / Math.max(90, hz(m) * 0.6);
      // a note pitched above the vowel's first formant would get nothing through it,
      // so that formant rises to meet the note, as a singer's does up high
      if (i === 0) f = Math.max(f, hz(m) * 1.05);
      if (vowel === 'la') {
        bp.frequency.setValueAtTime(Math.max(L_FORMANTS[i], i === 0 ? f : 0), t);
        bp.frequency.linearRampToValueAtTime(f, t + 0.07);
      } else bp.frequency.value = f;
      const fg = ac.createGain();
      fg.gain.value = [1, 0.5, 0.25][i];
      bp.connect(fg).connect(g);
      return bp;
    });
    // a choir is a few singers, never quite in tune with each other, and one an octave down
    const voices = choir ? [[-9, 0, 5.1], [8, 0, 5.9], [0, -12, 5.5]] : [[0, 0, 5.6]];
    for (const [cents, shift, rate] of voices) {
      const o = osc('sawtooth', hz(m + shift), t, dur + 0.2);
      o.detune.value = cents;
      // vibrato that only comes in once the note has settled, as a singer's does
      const lfo = osc('sine', rate, t, dur + 0.2);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(hz(m + shift) * 0.012, t + Math.min(0.35, dur));
      lfo.connect(depth).connect(o.frequency);
      filters.forEach((bp) => o.connect(bp));
    }
    g.connect(out);
  }

  // "Hey!": a breath, then a short "eh" that falls in pitch, shouted by a few people
  function playShout(m, t, out) {
    const n = noise(t, 0.06);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.35, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(gn).connect(out);
    const g = env(t + 0.03, 0.4, 0.015, 0.12, 0.1);
    const filters = VOWELS.eh.map((f, i) => {
      const f2 = ac.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = f;
      f2.Q.value = f / 70;
      const fg = ac.createGain();
      fg.gain.value = [1, 0.6, 0.3][i];
      f2.connect(fg).connect(g);
      return f2;
    });
    for (const cents of [-15, 0, 12]) {
      const o = osc('sawtooth', hz(m), t + 0.03, 0.3);
      o.detune.value = cents;
      o.frequency.setValueAtTime(hz(m), t + 0.03);
      o.frequency.exponentialRampToValueAtTime(hz(m - 4), t + 0.28);
      filters.forEach((f2) => o.connect(f2));
    }
    g.connect(out);
  }

  // strings: slow to swell, slow to fade — the attack never takes more than half the note
  function playStrings(midis, t, dur, out) {
    const attack = Math.min(0.28, dur * 0.5);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = env(t, 0.05, attack, Math.max(0.02, dur - attack), 0.45);
    for (const m of midis) {
      for (const det of [-12, -4, 5, 13]) {
        const o = osc('sawtooth', hz(m), t, dur + 0.5);
        o.detune.value = det;
        o.connect(lp);
      }
    }
    lp.connect(g).connect(out);
  }

  // horns: a stab with a little scoop up into the note and a brassy filter "bwap"
  function playHorns(midis, t, dur, out) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 0.04);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    const g = env(t, 0.08, 0.02, Math.max(0.02, dur - 0.06), 0.09);
    for (const m of midis) {
      for (const [type, det, lvl] of [['sawtooth', -6, 1], ['sawtooth', 6, 1], ['square', 0, 0.4]]) {
        const o = osc(type, hz(m), t, dur + 0.15);
        o.detune.setValueAtTime(det - 40, t);
        o.detune.linearRampToValueAtTime(det, t + 0.04);
        const lg = ac.createGain();
        lg.gain.value = lvl;
        o.connect(lg).connect(lp);
      }
    }
    lp.connect(g).connect(out);
  }

  function playWhistle(m, t, dur, out) {
    const o = osc('sine', hz(m), t, dur + 0.1);
    const lfo = osc('sine', 6.2, t, dur + 0.1);
    const depth = ac.createGain();
    depth.gain.value = hz(m) * 0.015;
    lfo.connect(depth).connect(o.frequency);
    const g = env(t, 0.2, 0.03, Math.max(0.02, dur - 0.06), 0.06);
    o.connect(g).connect(out);
    // and the breath through the lips
    const n = noise(t, dur + 0.05);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz(m);
    bp.Q.value = 8;
    const gn = env(t, 0.05, 0.03, Math.max(0.02, dur - 0.06), 0.05);
    n.connect(bp).connect(gn).connect(out);
  }

  function playFx(kind, t, dur, out) {
    if (kind === 'riser') {
      // noise and a tone, both sweeping up and swelling into the drop
      const n = noise(t, dur);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      n.connect(bp).connect(g).connect(out);
      const o = osc('sawtooth', 180, t, dur);
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.001, t);
      g2.gain.exponentialRampToValueAtTime(0.1, t + dur);
      g2.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      o.connect(g2).connect(out);
    } else if (kind === 'cheer') {
      // a crowd: a swell of voices (shaped noise) with claps scattered through it
      const n = noise(t, 1);
      const n2 = noise(t + 0.9, 1);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.3);
      g.gain.setValueAtTime(0.35, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      n.connect(bp);
      n2.connect(bp);
      bp.connect(g).connect(out);
      for (let i = 0; i < 14; i++) playDrum('clap', t + 0.1 + Math.random() * 1.4, out);
    }
  }

  /* The lead voice: a wordless "eeeaaaooo", distorted, in an ordinary singing
     range. Each note slides into the next in both pitch and vowel — that morph is
     the whole character — so a playback keeps one `lead` state: the chain every
     note goes through (built once, so a long song stays cheap) and the last note
     sung, to slide from. */
  let leadCurve = null;
  function leadChain(out) {
    if (!leadCurve) {
      leadCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; leadCurve[i] = Math.tanh(x * 4); }
    }
    const pre = ac.createGain();
    pre.gain.value = 3;
    const ws = ac.createWaveShaper();
    ws.curve = leadCurve;
    ws.oversample = '2x';
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const post = ac.createGain();
    post.gain.value = 0.16;
    pre.connect(ws).connect(hp).connect(lp).connect(post).connect(out);
    return { in: pre, last: null };
  }
  function playLead(btn, t, dur, lead) {
    const m = btn.midis[0];
    const vowel = MOUTH[btn.vowel] || btn.vowel;
    const to = VOWELS[vowel];
    // slide in from the note before if it has only just finished: a phrase, not a list
    const prev = lead.last && t - lead.last.end < 0.2 ? lead.last : null;
    const fromHz = prev ? hz(prev.m) : hz(m);
    const from = prev ? VOWELS[prev.vowel] : to;
    const glide = 0.09;
    const g = env(t, 1, prev ? 0.02 : 0.05, Math.max(0.02, dur - 0.05), 0.14);
    const filters = to.map((f, i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = f / Math.max(90, hz(m) * 0.6);
      const f0 = i === 0 ? Math.max(from[0], fromHz * 1.05) : from[i];
      const f1 = i === 0 ? Math.max(f, hz(m) * 1.05) : f;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + glide + 0.04);
      const fg = ac.createGain();
      fg.gain.value = [1, 0.6, 0.35][i];
      bp.connect(fg).connect(g);
      return bp;
    });
    for (const cents of [-6, 7]) {
      const o = osc('sawtooth', fromHz, t, dur + 0.2);
      o.detune.value = cents;
      o.frequency.setValueAtTime(fromHz, t);
      o.frequency.exponentialRampToValueAtTime(hz(m), t + glide);
      const lfo = osc('sine', 5.4, t, dur + 0.2);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(hz(m) * 0.014, t + Math.min(0.4, dur));
      lfo.connect(depth).connect(o.frequency);
      filters.forEach((bp) => o.connect(bp));
    }
    g.connect(lead.in);
    lead.last = { m, vowel, end: t + dur };
  }

  // `part` is anything with inst, buttons and tone: a song's instrument, one
  // section's part, or the Mega Jam's, whose buttons carry their own tone
  function sound(part, b, t, dur, out) {
    const btn = part.buttons[b];
    const tone = btn.tone || part.tone;
    switch (part.inst) {
      case 'drums': playDrum(btn.drum, t, out); break;
      case 'bass': playBass(btn.midis[0], t, dur, tone, out); break;
      case 'keys': playKeys(btn.midis, t, dur, 'piano', out); break;
      case 'synth': playKeys(btn.midis, t, dur, tone || 'synth', out); break;
      case 'strings': playStrings(btn.midis, t, dur, out); break;
      case 'horns': playHorns(btn.midis, t, dur, out); break;
      case 'whistle': playWhistle(btn.midis[0], t, dur, out); break;
      case 'guitar': playGuitar(btn.midis, t, dur, tone, out); break;
      case 'vocals':
        if (btn.vowel === 'hey') playShout(btn.midis[0], t, out);
        else playVoice(btn.midis[0], btn.vowel, t, dur, out, tone === 'choir');
        break;
      case 'fx': playFx(btn.fx, t, dur, out); break;
    }
  }

  // ---------- the band on stage ----------
  /* A pixel band that plays along, after Amber's reference: chunky figures about
     9x16 on a flat colour, each holding their instrument. Every song has its own
     band, loosely after the real one — a look per instrument, a backdrop colour,
     who sings, and which parts one player covers (Stadium Stomp's band is two
     people). A figure moves when its part plays: a strum, a stick, a key, the
     singer's mouth on each vowel. Drawn at one canvas pixel per art pixel and
     scaled up by CSS, so it stays crisp. */
  const STAGE_W = 100;                    // canvas pixels across: room for six players
  const STAGE_H = 22;
  const FIG = 13;                         // one player's box, instrument included
  const SK = ['#f3cfb1', '#e4b08a', '#b98260', '#8a5a3c', '#5e3b26'];
  const HAIR = { black: '#1b1b1f', brown: '#5b3a24', dark: '#3a2618', blonde: '#e9c46a', platinum: '#f2ead3', red: '#b4462a', grey: '#a3a3a3' };
  const INK = '#1b1b1f';
  // L(hair style, hair colour, skin, top, trousers, extra fields)
  const L = (h, hc, sk, t, p, x = {}) => Object.assign({ h, hc, sk, t, p, s: INK }, x);
  // the player's position in the line-up: guitars on the left, the singer in the middle, drums at the back right
  const LINEUP = ['guitar', 'bass', 'whistle', 'vocals', 'horns', 'strings', 'keys', 'synth', 'drums'];

  const BANDS = {
    'neon-highway': { bg: '#2b0f3f', look: {
      vocals: L('short', HAIR.black, SK[3], '#c8102e', '#c8102e', { t2: '#1b1b1f' }),
      synth: L('quiff', HAIR.blonde, SK[0], '#1fb5ad', '#2a2a40', { i: '#ff3caa', x: ['shades'] }),
      bass: L('short', HAIR.dark, SK[2], '#3a3a5a', '#1b1b1f', { i: '#e6e6e6' }),
      drums: L('long', HAIR.brown, SK[1], '#5a1f6e', '#1b1b1f', { i: '#ff3caa' }) } },
    'midnight-sidewalk': { bg: '#4a3a6a', look: {
      vocals: L('fedora', HAIR.black, SK[3], '#2a2a2a', '#1b1b1f', { hat: '#111', x: ['glove', 'socks'] }),
      bass: L('afro', HAIR.black, SK[4], '#c08a2d', '#3a2a1a', { i: '#7a2a1a' }),
      keys: L('short', HAIR.black, SK[3], '#6b2d8c', '#1b1b1f', { i: '#202020' }),
      drums: L('afro', HAIR.dark, SK[3], '#d9d9d9', '#2b2b2b', { i: '#9c1c1c' }) } },
    'streetlight-anthem': { bg: '#1c2c4c', look: {
      vocals: L('long', HAIR.black, SK[2], '#f2f2f2', '#2a3a6a'),
      guitar: L('afro', HAIR.dark, SK[1], '#202020', '#202020', { i: '#d9d9d9' }),
      keys: L('long', HAIR.brown, SK[1], '#7b5ba6', '#2a2a2a', { i: '#1b1b1f' }),
      bass: L('long', HAIR.blonde, SK[0], '#8c2d2d', '#2a3a6a', { i: '#2a2a2a' }),
      drums: L('short', HAIR.brown, SK[1], '#e0c37a', '#2a2a2a', { i: '#1f4fa0' }) } },
    'whisper-bass': { bg: '#0f1a0f', look: {
      vocals: L('bob', HAIR.black, SK[0], '#c4e02b', '#c4e02b', { x: ['roots'] }),
      synth: L('short', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { i: '#2b2b2b', dj: true }),
      bass: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#c4e02b' }),
      drums: L('beanie', HAIR.dark, SK[1], '#2b2b2b', '#1b1b1f', { hat: '#c4e02b', i: '#2b2b2b' }) } },
    'stadium-stomp': { bg: '#b3131b', sings: 'guitar', merge: { bass: 'guitar' }, look: {
      guitar: L('long', HAIR.black, SK[0], '#d62828', '#1b1b1f', { i: '#f2f2f2' }),
      drums: L('long', HAIR.black, SK[0], '#f2f2f2', '#d62828', { i: '#d62828' }) } },
    'ash-and-echo': { bg: '#3b2a2a', look: {
      vocals: L('quiff', HAIR.brown, SK[0], '#2b2b2b', '#1b1b1f', { tall: true }),
      synth: L('short', HAIR.dark, SK[1], '#5c6f7a', '#1b1b1f', { i: '#d9d9d9' }),
      bass: L('short', HAIR.blonde, SK[0], '#7a7a6a', '#2a2a2a', { i: '#2a2a2a' }),
      drums: L('beard', HAIR.brown, SK[1], '#4a4a4a', '#1b1b1f', { x: ['beard'], i: '#b0b0b0' }) } },
    'rebel-strut': { bg: '#127c86', look: {
      vocals: L('beanie', HAIR.blonde, SK[0], '#e8e0c8', '#3a3a3a', { hat: '#c0392b', x: ['glasses', 'beard'] }),
      bass: L('long', HAIR.brown, SK[1], '#f2a33a', '#2a2a2a', { i: '#1b1b1f' }),
      keys: L('short', HAIR.dark, SK[1], '#2c3e50', '#2a2a2a', { i: '#c0392b' }),
      drums: L('cap', HAIR.dark, SK[1], '#f2f2f2', '#2a2a2a', { hat: '#1b1b1f', i: '#f2a33a' }) } },
    'sunbeam-parade': { bg: '#2f9be0', look: {
      keys: L('afro', HAIR.dark, SK[0], '#f2f2f2', '#2b4a8a', { x: ['shades', 'beard'], i: '#1b1b1f' }),
      strings: L('long', HAIR.brown, SK[0], '#6b3fa0', '#2a2a2a'),
      bass: L('long', HAIR.blonde, SK[0], '#c0392b', '#2a2a2a', { i: '#e8e8e8' }),
      drums: L('long', HAIR.dark, SK[1], '#e8c06a', '#2a2a2a', { x: ['moustache'], i: '#1b1b1f' }) } },
    'green-eyed-sprint': { bg: '#1d1d3c', look: {
      vocals: L('quiff', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { t2: '#e8e8e8' }),
      guitar: L('long', HAIR.dark, SK[1], '#5a5a5a', '#1b1b1f', { i: '#c0392b' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a4a7a', '#1b1b1f', { i: '#e8e8e8' }),
      synth: L('short', HAIR.brown, SK[0], '#7a2a5a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#c0392b' }) } },
    'disco-chant': { bg: '#f2c14e', look: {
      vocals: L('short', HAIR.dark, SK[1], '#e8e8e8', '#2a2a2a'),
      keys: L('bald', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { x: ['beard', 'shades'], i: '#d9d9d9' }),
      guitar: L('cap', HAIR.black, SK[1], '#e8e8e8', '#1b1b1f', { hat: '#d62828', i: '#f2f2f2' }),
      bass: L('short', HAIR.brown, SK[2], '#6b2d8c', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('afro', HAIR.dark, SK[3], '#f28a1a', '#2a2a2a', { i: '#f2f2f2' }) } },
    'bounce-signal': { bg: '#3c1a5b', look: {
      synth: L('beanie', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#ff4fa3', dj: true, i: '#4fd1ff' }),
      bass: L('short', HAIR.blonde, SK[0], '#4fd1ff', '#1b1b1f', { i: '#ff4fa3' }),
      drums: L('short', HAIR.dark, SK[2], '#ff4fa3', '#1b1b1f', { i: '#4fd1ff' }) } },
    'jungle-drop': { bg: '#1f5a2a', look: {
      synth: L('short', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { dj: true, i: '#39ff14' }),
      bass: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#39ff14' }),
      drums: L('cap', HAIR.dark, SK[1], '#39ff14', '#1b1b1f', { hat: '#1b1b1f', i: '#2a2a2a' }) } },
    'street-busker': { bg: '#f2b632', sings: 'keys', look: {
      keys: L('hat', HAIR.blonde, SK[0], '#e8573a', '#2a2a2a', { hat: '#3a2a1a', long: true, i: '#1b1b1f' }),
      bass: L('short', HAIR.dark, SK[1], '#2a6a5a', '#1b1b1f', { i: '#e8e8e8' }),
      drums: L('short', HAIR.brown, SK[0], '#e8e8e8', '#1b1b1f', { i: '#e8573a' }) } },
    'iron-stomp': { bg: '#5a1616', look: {
      vocals: L('bald', HAIR.dark, SK[0], '#1b1b1f', '#2a2a2a', { buzz: true }),
      drums: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#8a8a8a' }),
      bass: L('long', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { i: '#c0392b' }),
      synth: L('short', HAIR.blonde, SK[0], '#4a4a4a', '#1b1b1f', { i: '#2a2a2a' }) } },
    'whistle-swagger': { bg: '#262626', sings: 'whistle', look: {
      whistle: L('short', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { arm: SK[0], x: ['tattoo'] }),
      guitar: L('long', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#e8c06a' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a3a6a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[3], '#8a1a1a', '#1b1b1f', { i: '#f2f2f2' }) } },
    'golden-rise': { bg: '#0d3b5a', look: {
      vocals: L('long', HAIR.black, SK[3], '#e8c06a', '#1b1b1f'),
      synth: L('cap', HAIR.blonde, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#1b1b1f', dj: true, i: '#ff8a1a' }),
      keys: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#f2f2f2' }),
      bass: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#ff8a1a' }),
      drums: L('short', HAIR.dark, SK[2], '#ff8a1a', '#1b1b1f', { i: '#1b1b1f' }) } },
    'glitter-groove': { bg: '#5b2a86', look: {
      vocals: L('afro', HAIR.black, SK[4], '#f2c200', '#f2c200', { band: '#e8e8e8' }),
      horns: L('afro', HAIR.black, SK[3], '#e8e8e8', '#e8e8e8'),
      bass: L('afro', HAIR.black, SK[4], '#d4af37', '#2a2a2a', { i: '#c0392b' }),
      drums: L('short', HAIR.black, SK[3], '#c0392b', '#2a2a2a', { i: '#d4af37' }) } },
    'sunny-trumpet': { bg: '#f2a03c', look: {
      vocals: L('fedora', HAIR.black, SK[4], '#f2f2f2', '#e8d8b0', { hat: '#e8d8a0' }),
      horns: L('short', HAIR.black, SK[3], '#2a8a6a', '#2a2a2a'),
      synth: L('short', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { dj: true, i: '#2ad4c0' }),
      bass: L('short', HAIR.dark, SK[3], '#e8573a', '#2a2a2a', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[3], '#f2f2f2', '#2a2a2a', { i: '#2a8a6a' }) } },
    'surf-monster': { bg: '#2f5f7a', sings: 'guitar', look: {
      guitar: L('fedora', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { hat: '#1b1b1f', x: ['glasses'], i: '#d9d9d9' }),
      bass: L('long', HAIR.black, SK[1], '#1b1b1f', '#1b1b1f', { i: '#c0392b' }),
      horns: L('short', HAIR.brown, SK[0], '#6a6a6a', '#1b1b1f'),
      drums: L('short', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { x: ['beard', 'glasses'], arm: '#4a6a8a', i: '#1b1b1f' }) } },
    'campfire-drop': { bg: '#d99c52', sings: 'guitar', look: {
      guitar: L('fedora', HAIR.black, SK[4], '#f2f2f2', '#3a3a3a', { hat: '#3a2a1a', i: '#c88a4a', acoustic: true }),
      synth: L('cap', HAIR.blonde, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#1b1b1f', dj: true, i: '#4fd1ff' }),
      bass: L('short', HAIR.brown, SK[0], '#6a4a2a', '#2a2a2a', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#c88a4a' }) } },
    'late-night-crawl': { bg: '#dcdcdc', sings: 'guitar', look: {
      guitar: L('quiff', HAIR.black, SK[0], '#1b1b1f', '#1b1b1f', { t2: '#e8e8e8', i: '#e8e8e8' }),
      bass: L('short', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { i: '#1b1b1f' }) } },
    'dizzy-dancefloor': { bg: '#e0218a', look: {
      vocals: L('bob', HAIR.platinum, SK[0], '#cfd8dc', '#cfd8dc', { x: ['shades', 'bow'] }),
      synth: L('short', HAIR.dark, SK[2], '#1b1b1f', '#1b1b1f', { dj: true, i: '#ff4fa3' }),
      bass: L('short', HAIR.blonde, SK[0], '#e8e8e8', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { i: '#e8e8e8' }) } },
    'dancefloor-dare': { bg: '#ff6f61', sings: 'synth', look: {
      synth: L('quiff', HAIR.dark, SK[0], '#1b1b1f', '#2a2a2a', { x: ['paint'], i: '#2a2a2a' }),
      guitar: L('long', HAIR.brown, SK[0], '#f2f2f2', '#2a2a2a', { x: ['paint'], i: '#4fd1ff' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a4a8a', '#2a2a2a', { x: ['paint'], i: '#f2f2f2' }),
      drums: L('short', HAIR.dark, SK[0], '#f2c200', '#2a2a2a', { x: ['paint'], i: '#2a4a8a' }) } },
    'falling-keys': { bg: '#3a3a3a', look: {
      vocals: L('spiky', HAIR.platinum, SK[0], '#1b1b1f', '#4a4a4a', { x: ['glasses'] }),
      keys: L('short', HAIR.black, SK[1], '#7a7a7a', '#1b1b1f', { i: '#1b1b1f' }),
      guitar: L('short', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { x: ['phones'], i: '#c0392b' }),
      bass: L('short', HAIR.dark, SK[1], '#5a5a5a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('bald', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { i: '#7a7a7a' }) } },
    'champion-run': { bg: '#c8641e', look: {
      guitar: L('long', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { band: '#f2f2f2', i: '#f2f2f2' }),
      bass: L('long', HAIR.blonde, SK[0], '#e8e8e8', '#2a3a6a', { i: '#1b1b1f' }),
      drums: L('long', HAIR.dark, SK[0], '#c0392b', '#1b1b1f', { i: '#1b1b1f' }) } },
    'dusty-bassline': { bg: '#16162a', look: {
      vocals: L('short', HAIR.black, SK[1], '#f2c200', '#f2f2f2', { x: ['moustache'] }),
      bass: L('short', HAIR.brown, SK[0], '#2a2a2a', '#1b1b1f', { i: '#e8e8e8' }),
      guitar: L('curly', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { i: '#8a1a1a' }),
      drums: L('long', HAIR.blonde, SK[0], '#6a6a6a', '#1b1b1f', { i: '#e8e8e8' }) } },
    'seaside-rave': { bg: '#1e88c8', crabs: true, look: {
      synth: L('crab', 0, 0, '#ef5b2f', 0, { dj: true, i: '#39ff14' }),
      bass: L('crab', 0, 0, '#f27a3a', 0, { i: '#e8e8e8' }),
      drums: L('crab', 0, 0, '#e8432a', 0, { i: '#f2c200' }) } },
    'runway-chant': { bg: '#5a0f1c', look: {
      vocals: L('long', HAIR.platinum, SK[0], '#f2f2f2', '#f2f2f2', { x: ['shades'] }),
      synth: L('short', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { dj: true, i: '#d62828' }),
      bass: L('short', HAIR.blonde, SK[0], '#3a3a3a', '#1b1b1f', { i: '#d62828' }),
      drums: L('short', HAIR.dark, SK[2], '#d62828', '#1b1b1f', { i: '#f2f2f2' }) } },
    'skyward-brass': { bg: '#6a2c91', look: {
      vocals: L('quiff', HAIR.dark, SK[0], '#d4af37', '#1b1b1f', { t2: '#1b1b1f' }),
      horns: L('short', HAIR.brown, SK[1], '#1b1b1f', '#1b1b1f'),
      bass: L('short', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { i: '#d4af37' }),
      drums: L('short', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { i: '#1b1b1f' }) } },
    'easy-falsetto': { bg: '#ffd84a', look: {
      vocals: L('curly', HAIR.dark, SK[1], '#ff4fa3', '#2a5aa0', { t2: '#f2f2f2' }),
      synth: L('short', HAIR.blonde, SK[0], '#2ad4c0', '#1b1b1f', { i: '#f2f2f2' }),
      strings: L('long', HAIR.red, SK[0], '#6b3fa0', '#1b1b1f'),
      bass: L('short', HAIR.dark, SK[2], '#f28a1a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.brown, SK[0], '#2a5aa0', '#1b1b1f', { i: '#ff4fa3' }) } },
    mega: { bg: '#00a3e0', look: {
      guitar: L('short', HAIR.dark, SK[1], '#8fa6d8', '#1f2a4a', { i: '#e8c06a' }),
      bass: L('short', HAIR.grey, SK[0], '#6b3a1a', '#1f2a4a', { i: '#2a2a2a' }),
      vocals: L('short', HAIR.dark, SK[1], '#4f6b3a', '#c8b88a'),
      horns: L('short', HAIR.brown, SK[2], '#c0392b', '#1b1b1f'),
      synth: L('quiff', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { i: '#ff4fa3' }),
      drums: L('short', HAIR.dark, SK[1], '#1f3a6a', '#1b1b1f', { i: '#d62828' }) } },
  };

  // a player nobody has dressed: picked from the song and instrument, so it never changes
  function defaultLook(songId, inst) {
    let h = 0;
    for (const c of songId + inst) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pick = (list) => list[(h = (h * 1103515245 + 12345) >>> 0) % list.length];
    return L(pick(['short', 'long', 'quiff', 'beanie', 'cap', 'afro']), pick(Object.values(HAIR).slice(0, 5)), pick(SK),
      pick(['#c0392b', '#2a6a5a', '#3a3a5a', '#e8e8e8', '#6b3fa0', '#d4af37']), pick(['#1b1b1f', '#2a3a6a', '#3a3a3a']),
      { hat: pick(['#1b1b1f', '#c0392b', '#2a6a5a']), i: pick(['#1b1b1f', '#e8e8e8', '#c0392b', '#d4af37']) });
  }

  const stageEl = document.getElementById('band');
  const sctx = stageEl.getContext('2d');
  stageEl.width = STAGE_W;
  stageEl.height = STAGE_H;
  const band = { members: [], byInst: {}, bg: '#000', running: false };

  function bandFor(song) {
    const spec = BANDS[song.id] || { bg: '#2a2a2a', look: {} };
    const merge = spec.merge || {};
    const insts = song.mega ? Object.keys(spec.look) : [...song.order, ...(song.sung && !spec.sings ? ['vocals'] : [])];
    const members = [];
    const byInst = {};
    for (const inst of LINEUP) {
      if (!insts.includes(inst) || merge[inst]) continue;
      const m = { inst, look: spec.look[inst] || defaultLook(song.id, inst), until: 0, alt: false, singUntil: 0, vowel: '' };
      m.mic = spec.sings === inst;
      members.push(m);
      byInst[inst] = m;
    }
    for (const [from, to] of Object.entries(merge)) byInst[from] = byInst[to];
    // the singer is whoever sings: a separate figure, or the player named by `sings`
    byInst.voice = byInst[spec.sings] || byInst.vocals;
    // in Mega Jam the instruments without a player of their own nudge the nearest look-alike
    if (song.mega) for (const inst of Object.keys(INST)) byInst[inst] = byInst[inst] || byInst.synth;
    band.members = members;
    band.byInst = byInst;
    band.bg = spec.bg;
    drawBand();
  }

  function bandHit(inst, ms) {
    const m = band.byInst[inst];
    if (!m) return;
    m.until = performance.now() + Math.max(120, ms);
    m.alt = !m.alt;
    wake();
  }
  function bandSing(vowel, ms) {
    const m = band.byInst.voice;
    if (!m) return;
    m.singUntil = performance.now() + ms;
    m.vowel = MOUTH[vowel] || vowel;
    if (m.inst === 'vocals') { m.until = m.singUntil; m.alt = !m.alt; }
    wake();
  }
  function bandRest() {
    for (const m of band.members) { m.until = 0; m.singUntil = 0; }
    drawBand();
  }
  // redraw every frame while anyone is moving, then stop until the next note
  function wake() {
    if (band.running) return;
    band.running = true;
    const frame = () => {
      drawBand();
      const now = performance.now();
      if (band.members.some((m) => now < m.until || now < m.singUntil)) requestAnimationFrame(frame);
      else { band.running = false; drawBand(); }
    };
    requestAnimationFrame(frame);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function drawBand() {
    sctx.fillStyle = band.bg;
    sctx.fillRect(0, 0, STAGE_W, STAGE_H);
    sctx.fillStyle = shade(band.bg, 0.72);    // the boards
    sctx.fillRect(0, STAGE_H - 2, STAGE_W, 2);
    const n = band.members.length;
    const gap = Math.max(0, Math.min(3, Math.floor((STAGE_W - n * FIG) / Math.max(1, n + 1))));
    let x = Math.floor((STAGE_W - (n * FIG + (n - 1) * gap)) / 2);
    const now = performance.now();
    for (const m of band.members) { drawMember(m, x, now); x += FIG + gap; }
  }

  function drawMember(m, ox, now) {
    const L0 = m.look;
    const playing = now < m.until;
    const pose = playing ? (m.alt ? 'a' : 'b') : 'rest';
    const fixed = m.inst === 'drums' || m.inst === 'keys' || m.inst === 'synth';
    const oy = playing && m.alt && !fixed ? -1 : 0;   // a bounce on every other note
    const P = (x, y, c) => { sctx.fillStyle = c; sctx.fillRect(ox + x, oy + y, 1, 1); };
    const R = (x0, y0, x1, y1, c) => { sctx.fillStyle = c; sctx.fillRect(ox + x0, oy + y0, x1 - x0 + 1, y1 - y0 + 1); };
    const arm = L0.arm || L0.t;
    const hand = L0.x && L0.x.includes('glove') ? '#f2f2f2' : L0.sk;
    if (L0.h === 'crab') drawCrab(L0, P, R, pose);
    else drawPerson(L0, P, R, m.inst === 'drums');
    drawInstrument(m.inst, L0, P, R, pose, arm, hand, L0.h === 'crab');
    if (m.mic) {
      R(12, 8, 12, 18, '#9a9a9a');
      R(11, 19, 12, 19, '#333');
      P(11, 6, INK);
    }
    if (L0.h !== 'crab' && now < m.singUntil) {
      const open = m.vowel === 'ah' || m.vowel === 'eh';
      P(7, 6, '#5a1414');
      if (open) P(6, 6, '#5a1414');
    }
  }

  function drawPerson(Lk, P, R, seated) {
    if (!seated) {
      R(4, 13, 8, 13, Lk.p);
      R(4, 14, 5, 18, Lk.p);
      R(7, 14, 8, 18, Lk.p);
      if (Lk.x && Lk.x.includes('socks')) { R(4, 18, 5, 18, '#f2f2f2'); R(7, 18, 8, 18, '#f2f2f2'); }
      R(3, 19, 5, 19, Lk.s);
      R(7, 19, 9, 19, Lk.s);
    } else R(4, 13, 8, 13, Lk.p);
    R(4, 8, 8, 12, Lk.t);
    if (Lk.t2) R(6, 8, 6, 11, Lk.t2);       // the shirt under a jacket
    P(6, 7, Lk.sk);
    R(5, 3, 7, 6, Lk.sk);
    P(7, 4, INK);                           // an eye: everyone faces the same way
    drawHair(Lk, P, R);
    for (const x of Lk.x || []) {
      if (x === 'beard') { R(5, 6, 7, 6, Lk.hc); P(5, 5, Lk.hc); }
      if (x === 'moustache') R(6, 5, 7, 5, Lk.hc);
      if (x === 'shades') { R(6, 4, 8, 4, INK); }
      if (x === 'glasses') { P(6, 4, '#555'); P(8, 4, '#555'); }
      if (x === 'paint') { P(5, 5, '#ff4fa3'); P(7, 5, '#4fd1ff'); P(6, 3, '#f2c200'); }
      if (x === 'bow') { P(8, 1, '#ff4fa3'); P(9, 1, '#ff4fa3'); P(8, 2, '#ff4fa3'); }
      if (x === 'roots') { P(5, 2, '#39d353'); P(6, 2, '#39d353'); }
      if (x === 'phones') { P(4, 4, '#d62828'); R(5, 1, 7, 1, '#3a3a3a'); }
      if (x === 'tattoo') { P(3, 9, '#2a4a6a'); P(9, 10, '#2a4a6a'); }
    }
  }

  function drawHair(Lk, P, R) {
    const c = Lk.hc;
    const short = () => { R(5, 2, 7, 2, c); P(4, 3, c); P(5, 3, c); P(4, 4, c); };
    switch (Lk.h) {
      case 'short': short(); break;
      case 'quiff': short(); R(6, 1, 7, 1, c); P(8, 2, c); if (Lk.tall) { P(6, 0, c); P(7, 0, c); } break;
      case 'long': short(); R(4, 5, 4, 8, c); P(3, 7, c); P(3, 8, c); break;
      case 'afro': R(4, 0, 8, 2, c); R(3, 1, 3, 6, c); P(4, 3, c); P(4, 4, c); P(4, 5, c); P(8, 3, c); P(9, 2, c); break;
      case 'curly': R(4, 1, 8, 2, c); R(3, 2, 4, 8, c); P(8, 3, c); P(2, 5, c); P(2, 6, c); break;
      case 'bob': short(); R(4, 5, 4, 6, c); P(8, 3, c); P(8, 2, c); break;
      case 'spiky': short(); P(5, 1, c); P(7, 1, c); P(4, 1, c); P(8, 1, c); break;
      case 'bald': if (Lk.buzz) R(5, 2, 7, 2, shade(Lk.sk, 0.75)); else R(5, 2, 7, 2, Lk.sk); break;
      case 'beanie': R(4, 1, 7, 2, Lk.hat); P(4, 3, Lk.hat); P(4, 4, c); break;
      case 'cap': R(4, 2, 7, 2, Lk.hat); R(8, 3, 9, 3, Lk.hat); P(4, 3, c); P(4, 4, c); break;
      case 'fedora': R(3, 2, 9, 2, Lk.hat); R(4, 1, 8, 1, Lk.hat); P(4, 3, c); break;
      case 'hat': R(3, 2, 9, 2, Lk.hat); R(4, 1, 8, 1, Lk.hat); P(4, 3, c); if (Lk.long) R(4, 4, 4, 8, c); break;
      default: short();
    }
    if (Lk.band) R(5, 3, 7, 3, Lk.band);    // a headband across the forehead
  }

  function drawCrab(Lk, P, R, pose) {
    const c = Lk.t;
    const hi = shade(c, 1.2);
    R(3, 13, 9, 17, c);
    R(2, 14, 10, 16, c);
    R(4, 13, 8, 13, hi);
    P(4, 11, c); P(4, 12, c); P(8, 11, c); P(8, 12, c);   // eye stalks
    P(4, 10, INK); P(8, 10, INK);
    const up = pose === 'rest' ? 0 : pose === 'a' ? -1 : 1;
    R(0, 8 + up, 2, 10 + up, c); P(1, 8 + up, Lk.i === '#1b1b1f' ? hi : shade(c, 0.8));
    R(10, 8 - up, 12, 10 - up, c);
    P(1, 11, c); P(11, 11, c);
    P(2, 18, c); P(4, 18, c); P(8, 18, c); P(10, 18, c);
    P(1, 19, c); P(11, 19, c);
  }

  function drawInstrument(inst, Lk, P, R, pose, arm, hand, crab) {
    const i = Lk.i || '#1b1b1f';
    const wood = '#7a5230';
    if (inst === 'guitar' || inst === 'bass') {
      const bass = inst === 'bass';
      const body = Lk.acoustic ? '#c88a4a' : i;
      if (!crab) { P(3, 9, arm); P(3, 10, arm); P(9, 9, arm); }
      R(3, 10, 6, 12, body);
      R(4, 13, 5, 13, body);
      P(5, 11, Lk.acoustic ? '#3a2410' : shade(body, 0.6));
      [[7, 10], [8, 9], [9, 8], [10, 7], [11, 6]].forEach(([x, y]) => P(x, y, wood));
      if (bass) { P(12, 5, wood); P(12, 4, '#2a2a2a'); } else P(12, 5, '#2a2a2a');
      if (!crab) {
        P(pose === 'b' ? 10 : 9, pose === 'b' ? 7 : 8, hand);              // fretting hand
        P(4, pose === 'a' ? 10 : pose === 'b' ? 12 : 11, hand);            // strumming hand
      }
    } else if (inst === 'keys' || inst === 'synth') {
      if (Lk.dj) {
        R(4, 9, 6, 11, i);                                                 // the laptop's glow
        R(4, 12, 7, 12, '#9a9a9a');
        R(0, 13, 12, 14, '#2b2b2b');
        R(1, 14, 11, 14, shade(i, 0.5));
        R(1, 15, 1, 19, '#444'); R(11, 15, 11, 19, '#444');
        P(9, 12, '#444'); P(10, 12, '#777');                               // a turntable
      } else {
        R(1, 11, 11, 11, '#f2f2f2');
        [2, 4, 7, 9].forEach((x) => P(x, 11, INK));
        R(1, 12, 11, 12, i);
        R(2, 13, 2, 18, '#777'); R(10, 13, 10, 18, '#777');
        R(1, 19, 3, 19, '#555'); R(9, 19, 11, 19, '#555');
      }
      if (!crab) {
        P(3, 9, arm); P(9, 9, arm);
        const top = Lk.dj ? 12 : 10;
        P(4, pose === 'a' ? top - 1 : top, hand);
        P(8, pose === 'b' ? top - 1 : top, hand);
      }
    } else if (inst === 'drums') {
      R(0, 11, 2, 11, '#d4af37'); R(1, 12, 1, 19, '#777');                 // hi-hat
      R(2, 13, 3, 13, '#ddd'); R(2, 14, 3, 14, i);                         // snare
      R(5, 12, 6, 12, '#ddd'); R(5, 13, 6, 13, i);                         // rack tom
      R(4, 14, 8, 18, '#efefef');                                          // bass drum
      R(4, 14, 8, 14, i); R(4, 18, 8, 18, i); R(4, 15, 4, 17, i); R(8, 15, 8, 17, i);
      R(5, 16, 7, 16, Lk.t);
      R(9, 15, 10, 15, '#ddd'); R(9, 16, 10, 18, i);                       // floor tom
      R(9, 9, 11, 9, '#d4af37'); P(10, 10, '#777');                        // crash
      if (!crab) {
        P(3, 9, arm); P(9, 9, arm);
        const l = pose === 'a' ? 12 : 10;
        const r = pose === 'b' ? 12 : 10;
        P(3, l, hand); P(2, l - 1, '#e8d0a0');
        P(9, r, hand); P(10, r - 1, '#e8d0a0');
      }
    } else if (inst === 'vocals') {
      R(10, 8, 10, 18, '#9a9a9a');
      R(9, 19, 11, 19, '#333');
      P(9, 6, INK); P(10, 7, '#555');
      if (!crab) {
        P(9, 8, arm); P(9, 7, hand);
        if (pose === 'rest') { P(3, 9, arm); P(3, 10, arm); P(3, 11, hand); }
        else { P(3, 8, arm); P(3, 7, arm); P(3, 6, hand); }               // the other arm goes up
      }
    } else if (inst === 'horns') {
      const lift = pose === 'rest' ? 1 : 0;
      R(8, 6 + lift, 11, 6 + lift, '#e3b23c');
      R(12, 5 + lift, 12, 7 + lift, '#e3b23c');
      P(9, 5 + lift, '#c99a2e'); P(10, 5 + lift, '#c99a2e');
      if (!crab) { P(8, 8, arm); P(9, 7 + lift, hand); P(3, 9, arm); P(3, 10, arm); P(10, 7 + lift, hand); }
    } else if (inst === 'strings') {
      R(8, 8, 9, 9, '#8b4513'); P(10, 7, '#3b2410'); P(11, 6, '#3b2410');
      const d = pose === 'a' ? -1 : pose === 'b' ? 1 : 0;
      [[3, 10], [4, 9], [5, 9], [6, 8], [7, 8]].forEach(([x, y]) => P(x + d, y, '#e8d8b0'));
      if (!crab) { P(3, 9, arm); P(3 + d, 10, hand); P(10, 8, hand); }
    } else if (inst === 'whistle') {
      if (!crab) { P(3, 9, arm); P(9, 9, arm); P(3, 10, hand); P(9, 10, hand); }
      if (pose !== 'rest') { P(7, 6, '#5a1414'); P(10, pose === 'a' ? 1 : 2, '#f2f2f2'); P(11, pose === 'a' ? 0 : 1, '#f2f2f2'); P(11, pose === 'a' ? 1 : 2, '#f2f2f2'); }
    }
  }

  // ---------- state ----------
  const findSong = (id) => (id === 'mega' ? MEGA : SONGS.find((s) => s.id === id));
  const state = {
    song: findSong(save.song) || SONGS[0],
    section: null,                        // the section on show in the rack
    speed: SPEEDS.some(([v]) => v === save.speed) ? save.speed : 1,
    playing: null,                        // { what, bus, timers, home?, interval? }
    turn: null,                           // { part, pos, left: Set, mistakes, missed: Set }
    focus: null,                          // instrument the number keys play
    last: null,                           // how the last finished turn went
    quiet: false,                         // tests only: presses score but make no sound
  };
  state.section = state.song.mega ? null : state.song.sections[0];
  const jam = {
    events: (save.jam && save.jam.events) || [],   // { t: s into the loop, mk: button }
    len: (save.jam && save.jam.len) || 0,
    rec: false,
    recStart: 0,
    loopStart: 0,
    recTimer: 0,
  };
  const stepSec = () => 60 / (state.song.bpm * state.speed) / state.song.spb;

  // ---------- dom ----------
  const $ = (id) => document.getElementById(id);
  const songsEl = $('songs');
  const pickerEl = $('picker');
  const sectionsEl = $('sections');
  const speedEl = $('speed');
  const modesEl = $('modes');
  const rackEl = $('rack');
  const sayEl = $('say');
  const listenBtn = $('btn-listen');
  const vocalsBtn = $('btn-vocals');
  const leadFace = $('lead-face');
  const sectionBtn = $('btn-section');
  const secbarEl = $('secbar');
  const recBtn = $('btn-rec');
  const loopBtn = $('btn-loop');
  const clearBtn = $('btn-clear');
  let stations = {};                      // inst -> { el, pads: [], dots, show, turn, stars, face }

  const say = (text) => { sayEl.textContent = text; };
  const starText = (n) => (n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '');
  const lower = (inst) => INST[inst].name.toLowerCase();

  function songStars(song) {
    return song.allParts.reduce((a, p) => a + starsOf(song, p), 0);
  }
  const sectionDone = (song, sec) => sec.partList.every((p) => starsOf(song, p) > 0);
  const allDone = (song) => song.allParts.every((p) => starsOf(song, p) > 0);

  function songNote(s) {
    if (s.mega) return jam.events.length ? `Your loop: ${jam.events.length} notes` : '';
    const got = songStars(s);
    return got ? `★ ${got} / ${s.allParts.length * 3}` : `${s.sections.length} sections`;
  }

  /* The songs live in a pop-up behind the Songs button, grouped by difficulty,
     easiest first: thirty cards on the page pushed the stage and the instruments
     off the screen. */
  function renderSongs() {
    songsEl.innerHTML = '';
    const groups = [...LEVELS.map((lv) => [lv, SONGS.filter((s) => s.level === lv)]), ['Jam', [MEGA]]];
    for (const [lv, list] of groups) {
      const h = document.createElement('h3');
      h.className = 'lvl';
      h.textContent = lv;
      songsEl.appendChild(h);
      for (const s of list) addSongCard(s);
    }
  }

  function addSongCard(s) {
    const b = document.createElement('button');
    b.className = 'song' + (s === state.song ? ' on' : '') + (s.mega ? ' mega' : '');
    b.dataset.song = s.id;
    b.innerHTML = `<b></b><span></span><span class="stars"></span>`;
    b.children[0].textContent = s.title;
    b.children[1].textContent = s.mega ? s.genre : '';
    b.children[2].textContent = songNote(s) || ' ';
    b.addEventListener('click', () => { pickerEl.close(); selectSong(s.id); });
    songsEl.appendChild(b);
  }

  function renderDeck() {
    const song = state.song;
    $('song-title').textContent = song.title;
    if (song.mega) {
      $('song-sub').textContent = 'Play anything. Record a loop, then record again to layer on top.';
    } else {
      const secs = song.form.reduce((a, s) => a + s.length, 0) * (60 / song.bpm / song.spb);
      const at = state.speed === 1 ? '' : ` (${Math.round(song.bpm * state.speed)} at this speed)`;
      $('song-sub').textContent = `${song.key} · ${song.bpm} bpm${at}` +
        (song.sections.length > 1 ? ` · ${Math.round(secs)}s` : '');
    }
    document.body.classList.toggle('is-mega', !!song.mega);
    // section tabs, only when there is more than one
    sectionsEl.innerHTML = '';
    if (!song.mega && song.sections.length > 1) {
      for (const sec of song.sections) {
        const b = document.createElement('button');
        // a section that is only the singer has nothing to learn, so nothing to tick off
        b.className = 'sec' + (sec === state.section ? ' on' : '') + (sec.partList.length && sectionDone(song, sec) ? ' done' : '');
        b.dataset.section = sec.id;
        b.textContent = sec.name;
        b.addEventListener('click', () => selectSection(sec.id));
        sectionsEl.appendChild(b);
      }
    }
    // the sections sit under the band in play-along mode; the timeline lays them all out itself
    secbarEl.hidden = song.mega || song.sections.length < 2 || save.mode === 'timeline';
    vocalsBtn.hidden = song.mega || !song.sung;
    modesEl.innerHTML = '';
    if (!song.mega) {
      for (const [m, label] of [['play', 'Play along'], ['timeline', 'Timeline']]) {
        const b = document.createElement('button');
        b.className = 'spd' + (save.mode === m ? ' on' : '');
        b.textContent = label;
        b.setAttribute('aria-pressed', save.mode === m);
        b.addEventListener('click', () => setMode(m));
        modesEl.appendChild(b);
      }
    }
    speedEl.innerHTML = '';
    if (!song.mega) {
      const lab = document.createElement('span');
      lab.textContent = 'Speed';
      speedEl.appendChild(lab);
      for (const [v, label] of SPEEDS) {
        const b = document.createElement('button');
        b.className = 'spd' + (v === state.speed ? ' on' : '');
        b.textContent = label;
        b.setAttribute('aria-pressed', v === state.speed);
        b.addEventListener('click', () => setSpeed(v));
        speedEl.appendChild(b);
      }
    }
    syncButtons();
  }

  function renderRack() {
    const song = state.song;
    rackEl.innerHTML = '';
    stations = {};
    // tabs, so one instrument fits on the screen at a time, and All for the lot
    const tabs = document.createElement('div');
    tabs.className = 'rack-tabs';
    for (const inst of [null, ...song.order]) {
      const t = document.createElement('button');
      t.className = 'dock-tab';
      t.dataset.inst = inst || 'all';
      if (inst) {
        t.style.setProperty('--h', INST[inst].h);
        t.textContent = INST[inst].icon + ' ' + INST[inst].name;
        if (!song.mega && !state.section.parts[inst]) t.classList.add('resting');
      } else t.textContent = 'All';
      t.addEventListener('click', () => showRack(inst));
      tabs.appendChild(t);
    }
    rackEl.appendChild(tabs);
    for (const inst of song.order) {
      const def = song.instruments[inst];
      const part = song.mega ? null : state.section.parts[inst] || null;
      const info = INST[inst];
      const el = document.createElement('article');
      el.className = 'station' + (!song.mega && !part ? ' resting' : '');
      el.dataset.part = inst;
      el.style.setProperty('--h', info.h);
      const head = document.createElement('div');
      head.className = 'st-head';
      let face = null;
      if (inst === 'vocals') {
        face = document.createElement('div');
        face.className = 'face';
        face.innerHTML = '<div class="mouth"></div>';
        head.appendChild(face);
      } else {
        const icon = document.createElement('span');
        icon.className = 'st-icon';
        icon.textContent = info.icon;
        head.appendChild(icon);
      }
      const name = document.createElement('span');
      name.className = 'st-name';
      name.textContent = info.name;
      const stars = document.createElement('span');
      stars.className = 'st-stars';
      if (part) stars.textContent = starText(starsOf(song, part));
      else if (!song.mega) stars.textContent = `rests in the ${state.section.name.toLowerCase()}`;
      const sp = document.createElement('span');
      sp.className = 'spacer';
      head.append(name, stars, sp);
      let show = null;
      let turn = null;
      if (part) {
        show = document.createElement('button');
        show.textContent = 'Show me';
        show.addEventListener('click', () => (state.playing && state.playing.what === 'show:' + inst ? stop() : showPart(inst)));
        turn = document.createElement('button');
        turn.className = 'primary';
        turn.textContent = 'My turn';
        turn.addEventListener('click', () => {
          if (save.mode === 'timeline') dockInst(inst);
          else if (state.turn && state.turn.part === part) endTurn('stopped');
          else startTurn(inst);
        });
        head.append(show, turn);
      }

      const padsEl = document.createElement('div');
      padsEl.className = 'pads';
      const pads = def.buttons.map((btn, i) => {
        const p = document.createElement('button');
        p.className = 'pad';
        p.innerHTML = '<span></span>' + (btn.sub ? '<small></small>' : '') + (i < 9 ? `<kbd>${i + 1}</kbd>` : '');
        p.firstChild.textContent = btn.label;
        if (btn.sub) p.querySelector('small').textContent = btn.sub;
        p.addEventListener('pointerdown', (e) => { e.preventDefault(); press(inst, i); });
        padsEl.appendChild(p);
        return p;
      });
      const dots = document.createElement('div');
      dots.className = 'dots';
      el.append(head, padsEl, dots);
      el.addEventListener('pointerdown', () => { state.focus = inst; });
      rackEl.appendChild(el);
      stations[inst] = { el, pads, dots, show, turn, stars, face, part };
    }
    if (state.rackInst && !song.order.includes(state.rackInst)) state.rackInst = null;
    if (!state.rackInst && !save.rackAll) state.rackInst = song.order[0];
    applyRack();
    syncButtons();
  }

  // one instrument, or All (inst null); a choice of All is remembered between visits
  function showRack(inst) {
    state.rackInst = inst;
    save.rackAll = !inst;
    persist();
    if (inst) state.focus = inst;
    applyRack();
  }
  function applyRack() {
    const one = state.rackInst;
    for (const [inst, st] of Object.entries(stations)) st.el.hidden = !!one && inst !== one;
    rackEl.querySelectorAll('.rack-tabs .dock-tab').forEach((t) => t.classList.toggle('on', t.dataset.inst === (one || 'all')));
  }

  function greet() {
    const song = state.song;
    if (song.mega) say(jam.len ? 'Your loop is saved — press Play loop.' : 'Press Record, play something, then Stop to make it loop.');
    else say(allDone(song) ? 'Every part played. Listen to your band!' : '');
  }

  // the instrument a pad belongs to, as it is laid out right now
  const defOf = (inst) => state.song.instruments[inst];
  const partOf = (inst) => (state.section && state.section.parts[inst]) || null;

  // ---------- lights ----------
  function light(inst, b, ms, section) {
    // in timeline mode the song's own notes never light a button — that would give the
    // answer away — only your presses do (a press comes without a section)
    if (save.mode === 'timeline' && inst === state.tlInst && !section) {
      const dp = dockEl.querySelectorAll('.dock-pads .pad')[b];
      if (dp) {
        dp.classList.add('lit');
        clearTimeout(dp._lit);
        dp._lit = setTimeout(() => dp.classList.remove('lit'), ms);
      }
    }
    if (section && section !== state.section) return;
    bandHit(inst, ms);
    const st = stations[inst];
    if (!st || !st.pads[b]) return;
    const pad = st.pads[b];
    pad.classList.add('lit');
    clearTimeout(pad._lit);
    pad._lit = setTimeout(() => pad.classList.remove('lit'), ms);
    if (st.face) {
      const v = defOf(inst).buttons[b].vowel;
      st.face.dataset.v = MOUTH[v] || v;
      clearTimeout(st.face._t);
      st.face._t = setTimeout(() => { delete st.face.dataset.v; }, ms);
    }
  }
  function mouth(vowel, ms) {
    bandSing(vowel, ms);
    leadFace.dataset.v = MOUTH[vowel] || vowel;
    clearTimeout(leadFace._t);
    leadFace._t = setTimeout(() => { delete leadFace.dataset.v; }, ms);
  }
  function flash(inst, b, cls, ms = 260) {
    const pad = stations[inst] && stations[inst].pads[b];
    if (!pad) return;
    pad.classList.remove(cls);
    void pad.offsetWidth;                 // restart the animation if it is already running
    pad.classList.add(cls);
    clearTimeout(pad['_' + cls]);
    pad['_' + cls] = setTimeout(() => pad.classList.remove(cls), ms);
  }

  // ---------- playback ----------
  /* Plays a run of sections back to back: each segment is a section and the
     parts of it to play. The notes are laid out in time order first, then made
     into sound only a moment ahead of the audio clock: setting a whole song up
     at once built a filter chain for every note in it, and the busiest song
     (Surf Monster's guitar riff) left the audio thread unable to keep up, so it
     played silent while the pads went on lighting. The lights run on timers
     aimed at the same moments. Across several sections the rack follows along,
     and goes back to where you were when it ends. */
  function play(what, segs, done) {
    stop();
    audio();
    const sp = stepSec();
    const bus = ac.createGain();
    bus.connect(master);
    const t0 = ac.currentTime + 0.12;
    const timers = [];
    const home = state.section;
    const follow = segs.some((s) => s.section !== home);
    const notes = [];                     // { at: s after t0, part, b, dur, section } or a riser
    let offset = 0;
    for (const seg of segs) {
      const start = offset * sp;
      if (follow) timers.push(setTimeout(() => viewSection(seg.section), Math.max(0, (t0 + start - ac.currentTime) * 1000 - 40)));
      if (seg.section.riser) notes.push({ at: start, riser: seg.steps * sp });
      const voice = seg.section.voice;
      if (voice && (what === 'band' || what === 'section')) {
        for (let c = 0; c * voice.length < seg.steps; c++) {
          for (const e of voice.events) notes.push({ at: start + (c * voice.length + e.step) * sp, voice, b: e.b, dur: e.len * sp });
        }
      }
      for (const part of seg.parts) {
        for (let c = 0; c * part.length < seg.steps; c++) {
          for (const e of part.events) {
            notes.push({ at: start + (c * part.length + e.step) * sp, part, b: e.b, dur: e.len * sp, section: seg.section });
          }
        }
      }
      offset += seg.steps;
    }
    notes.sort((a, b) => a.at - b.at);
    let next = 0;
    let lead = null;
    const tick = () => {
      const until = ac.currentTime + PLAY_AHEAD;
      for (; next < notes.length && t0 + notes[next].at < until; next++) {
        const n = notes[next];
        const t = t0 + n.at;
        if (n.riser) { playFx('riser', t, n.riser, bus); continue; }
        if (n.voice) {
          // Vocals off mutes the singer, it doesn't send them off stage: they go on
          // singing on the stage, unheard, and only the switch's own face stops.
          // Checked as each note comes due, so the switch takes effect at once.
          const btn = n.voice.buttons[n.b];
          const ms = Math.max(LIGHT_MIN, n.dur * 0.9) * 1000;
          if (save.vocals) {
            lead = lead || leadChain(bus);
            playLead(btn, t, n.dur, lead);
          }
          timers.push(setTimeout(() => (save.vocals ? mouth(btn.vowel, ms) : bandSing(btn.vowel, ms)), (t - ac.currentTime) * 1000));
          continue;
        }
        sound(n.part, n.b, t, n.dur, bus);
        const ms = Math.max(LIGHT_MIN, n.dur * 0.9) * 1000;
        timers.push(setTimeout(() => light(n.part.inst, n.b, ms, n.section), (t - ac.currentTime) * 1000));
      }
    };
    tick();
    const interval = setInterval(tick, 25);
    timers.push(setTimeout(() => {
      state.playing = null;
      if (follow) viewSection(home);
      syncButtons();
      if (done) done();
      clearInterval(interval);
    }, (t0 - ac.currentTime + offset * sp) * 1000 + 200));
    state.playing = { what, bus, timers, interval, home: follow ? home : null };
    syncButtons();
  }

  function stop() {
    const p = state.playing;
    if (!p) return;
    p.timers.forEach(clearTimeout);
    if (p.interval) clearInterval(p.interval);
    const t = ac.currentTime;
    p.bus.gain.setValueAtTime(p.bus.gain.value, t);
    p.bus.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => p.bus.disconnect(), 120);
    state.playing = null;
    if (jam.rec && jam.len) endRecord();
    if (p.home) viewSection(p.home);
    rackEl.querySelectorAll('.pad.lit').forEach((el) => el.classList.remove('lit'));
    clearTimeout(leadFace._t);
    delete leadFace.dataset.v;            // and the singer stops mid-word, mouth shut
    bandRest();
    syncButtons();
  }

  const segOf = (sec, parts) => ({ section: sec, parts: parts || sec.partList, steps: sec.length });

  function listen() {
    if (state.playing && state.playing.what === 'band') { stop(); return; }
    if (state.turn) endTurn('stopped');
    const song = state.song;
    rackEl.classList.remove('focused');
    say(song.sections.length > 1 ? 'The whole song…' : 'The whole band…');
    play('band', song.form.map((s) => segOf(s)), () => {
      say(allDone(song) ? 'That was all you. Encore?' : 'Your turn — pick an instrument and press Show me.');
    });
  }

  function listenSection() {
    if (state.playing && state.playing.what === 'section') { stop(); return; }
    if (state.turn) endTurn('stopped');
    rackEl.classList.remove('focused');
    const sec = state.section;
    say(`The ${sec.name.toLowerCase()}, everyone in it…`);
    play('section', [segOf(sec)], () => say(`Pick an instrument in the ${sec.name.toLowerCase()} and press Show me.`));
  }

  function showPart(inst) {
    const part = partOf(inst);
    if (!part) return;
    if (state.turn) endTurn('stopped');
    state.focus = inst;
    const once = part.length * stepSec();
    const steps = once < SHOW_MIN ? part.length * 2 : part.length;
    rackEl.classList.add('focused');
    stations[inst].el.classList.add('showing');
    say(`Just the ${lower(inst)}. Watch the buttons.`);
    play('show:' + inst, [{ section: state.section, parts: [part], steps }], () => {
      if (stations[inst]) stations[inst].el.classList.remove('showing');
      rackEl.classList.remove('focused');
      say(`Ready? Press My turn on the ${lower(inst)}.`);
    });
  }

  function syncButtons() {
    const what = state.playing && state.playing.what;
    listenBtn.innerHTML = what === 'band' ? '&#9632; Stop' : state.song.sections && state.song.sections.length > 1 ? '&#9654; Play the whole song' : '&#9654; Listen to the band';
    sectionBtn.innerHTML = what === 'section' ? '&#9632; Stop' : '&#9654; This section';
    for (const [inst, st] of Object.entries(stations)) {
      if (st.show) st.show.textContent = what === 'show:' + inst ? 'Stop' : 'Show me';
      if (st.turn) {
        st.turn.textContent = save.mode === 'timeline'
          ? (state.tlInst === inst ? 'On the timeline' : 'Build it')
          : (state.turn && state.turn.part.inst === inst ? 'Stop' : 'My turn');
      }
      if (what !== 'show:' + inst) st.el.classList.remove('showing');
    }
    vocalsBtn.setAttribute('aria-pressed', save.vocals);
    vocalsBtn.lastChild.textContent = save.vocals ? 'Vocals on' : 'Vocals off';
    recBtn.innerHTML = jam.rec ? '&#9632; Stop recording' : jam.len ? '&#9679; Record a layer' : '&#9679; Record';
    recBtn.classList.toggle('rec', jam.rec);
    loopBtn.innerHTML = what === 'jam' ? '&#9632; Stop loop' : '&#9654; Play loop';
    loopBtn.disabled = !jam.len;
    clearBtn.disabled = !jam.len && !jam.rec;
    sectionsEl.querySelectorAll('.sec').forEach((b) => b.classList.toggle('on', b.dataset.section === (state.section && state.section.id)));
  }

  function viewSection(sec) {
    if (!sec || sec === state.section) return;
    state.section = sec;
    renderRack();
  }

  function setSpeed(v) {
    stop();
    state.speed = v;
    save.speed = v;
    persist();
    renderDeck();
    say(v === 1 ? 'Full speed.' : `${v === 0.5 ? 'Half' : 'Three-quarter'} speed — for practice. Stars count the same.`);
  }

  // ---------- your turn ----------
  function startTurn(inst) {
    const part = partOf(inst);
    if (!part) return;
    stop();
    if (state.turn) endTurn('stopped');
    state.focus = inst;
    if (state.rackInst) showRack(inst);
    state.turn = { part, pos: 0, left: new Set(part.groups[0].bs), mistakes: 0, missed: new Set() };
    const st = stations[inst];
    st.el.classList.add('live');
    rackEl.classList.add('focused');
    st.dots.innerHTML = part.groups.map(() => '<i></i>').join('');
    say(`Your turn on the ${lower(inst)}: ${part.groups.length} beats to play.`);
    syncButtons();
  }

  function endTurn(why) {
    const t = state.turn;
    if (!t) return;
    const st = stations[t.part.inst];
    if (st) {
      st.el.classList.remove('live');
      if (why === 'stopped') st.dots.innerHTML = '';
    }
    rackEl.classList.remove('focused');
    state.turn = null;
    syncButtons();
  }

  function press(inst, b) {
    const def = defOf(inst);
    if (!def || !def.buttons[b]) return;
    state.focus = inst;
    audio();
    if (!state.quiet) sound(def, b, ac.currentTime + 0.005, LIVE_DUR[inst], master);
    light(inst, b, 160);
    if (state.song.mega) { if (jam.rec) recordNote(def.buttons[b]); return; }
    const t = state.turn;
    if (!t || t.part.inst !== inst) return;   // any pad can be played just to jam
    if (t.left.has(b)) {
      t.left.delete(b);
      flash(inst, b, 'good', 200);
      if (t.left.size) return;
      const dot = stations[inst].dots.children[t.pos];
      if (dot) dot.className = t.missed.has(t.pos) ? 'miss' : 'done';
      t.pos++;
      if (t.pos >= t.part.groups.length) { finishTurn(); return; }
      t.left = new Set(t.part.groups[t.pos].bs);
    } else {
      t.mistakes++;
      t.missed.add(t.pos);
      flash(inst, b, 'bad');
      for (const want of t.left) flash(inst, want, 'hint', 1500);
    }
  }

  function finishTurn() {
    const t = state.turn;
    const stars = t.mistakes === 0 ? 3 : t.mistakes <= 2 ? 2 : 1;
    endTurn('done');
    state.last = { part: t.part.key, stars, mistakes: t.mistakes };
    completePart(t.part, stars, t.mistakes ? ` (${t.mistakes} wrong)` : '');
  }

  // a part is done, by playing it back or by building it on the timeline
  function completePart(part, stars, note) {
    const song = state.song;
    const sec = part.section;
    const best = Math.max(stars, starsOf(song, part));
    (save.stars[song.id] = save.stars[song.id] || {})[part.key] = best;
    persist();
    if (stations[part.inst]) stations[part.inst].stars.textContent = starText(best);
    const name = INST[part.inst].name;
    renderSongs();
    renderDeck();
    const head = `${name}: ${starText(stars)}${note}`;
    const replay = (what, segs, msg) => setTimeout(() => {
      if (!state.playing && !state.turn && state.song === song) play(what, segs, () => say(msg));
    }, 900);
    if (allDone(song)) {
      playFx('cheer', ac.currentTime + 0.05, 2, master);
      say(`${head} — that's the whole band! Here it is together…`);
      replay('band', song.form.map((s) => segOf(s)), 'Your band. Pick another song?');
    } else if (song.sections.length > 1 && sectionDone(song, sec)) {
      say(`${head} — the ${sec.name.toLowerCase()} is done! Here it is with everyone…`);
      replay('section', [segOf(sec)], 'On to the next section.');
    } else {
      const left = sec.partList.filter((p) => !starsOf(song, p)).map((p) => lower(p.inst));
      say(`${head}. Still to play${song.sections.length > 1 ? ' in the ' + sec.name.toLowerCase() : ''}: ${left.join(', ')}.`);
    }
  }

  // ---------- timeline mode ----------
  /* The other way to learn a part. In timeline mode the bottom of the screen is
     a dock: the instruments as tabs, the chosen one's buttons across, and under
     them a timeline of the whole song — a row per button, a slot per step, and a
     line where each section ends. Each section shows its loop once ("Verse ×4"),
     and the timeline scrolls sideways when the song is long. Nothing shows where
     the notes belong: drag a button onto its row (or tap a slot), then Play mine
     plays back only what you placed, a playhead sweeping across, and each note
     takes a colour as it is reached: spot on, nearly (a step early or late), the
     right moment but the wrong note, or off. The tally says how many are still to
     find, never where. A section all spot on with nothing extra finishes that
     part; fewer checks, more stars. What you place is kept per part while the
     page is open. */
  const TL_RESULTS = ['spot', 'near', 'wrongnote', 'off'];
  const drafts = {};                      // part key -> Map('step|b' -> { step, b })
  const tlResults = {};                   // part key -> results of the last check
  const dockEl = $('dock');

  function setMode(m) {
    if (save.mode === m) return;
    stop();
    if (state.turn) endTurn('stopped');
    save.mode = m;
    persist();
    renderDeck();
    renderRack();
    renderDock();
    say('');
  }

  // the sections the instrument plays in, laid end to end: one loop each
  function dockRegions(inst) {
    let g = 0;
    return state.song.sections.filter((sec) => sec.parts[inst]).map((sec) => {
      const part = sec.parts[inst];
      const r = { sec, part, g0: g };
      g += part.length;
      return r;
    });
  }

  function dockInst(inst) {
    state.tlInst = inst;
    renderDock();
    syncButtons();
  }

  function renderDock() {
    const song = state.song;
    const on = save.mode === 'timeline' && !song.mega;
    dockEl.hidden = !on;
    document.body.classList.toggle('tl-mode', on);
    dockEl.innerHTML = '';
    if (!on) return;
    const insts = song.order.filter((inst) => song.sections.some((sec) => sec.parts[inst]));
    if (!insts.includes(state.tlInst)) state.tlInst = insts[0];
    const inst = state.tlInst;
    const def = defOf(inst);
    dockEl.style.setProperty('--h', INST[inst].h);

    const head = document.createElement('div');
    head.className = 'dock-head';
    for (const i of insts) {
      const t = document.createElement('button');
      t.className = 'dock-tab' + (i === inst ? ' on' : '');
      t.style.setProperty('--h', INST[i].h);
      t.textContent = INST[i].icon + ' ' + INST[i].name;
      t.addEventListener('click', () => dockInst(i));
      head.appendChild(t);
    }
    const sp = document.createElement('span');
    sp.className = 'spacer';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = '▶ Play mine';
    go.addEventListener('click', () => (state.playing && state.playing.what === 'check:' + inst ? stop() : checkTimeline(inst)));
    // the rack is hidden in this mode, so the dock has its own Show me: the real part,
    // each section's loop once, in the same order as the timeline
    const show = document.createElement('button');
    show.textContent = 'Show me';
    show.addEventListener('click', () => {
      if (state.playing && state.playing.what === 'show:' + inst) { stop(); return; }
      play('show:' + inst, dockRegions(inst).map((r) => ({ section: r.sec, parts: [r.part], steps: r.part.length })),
        () => say('Now build it: drag the buttons onto the timeline, then Play mine.'));
      say(`The ${lower(inst)}, the whole way through. Listen closely.`);
    });
    const clear = document.createElement('button');
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      for (const r of dockRegions(inst)) { (drafts[r.part.key] || new Map()).clear(); delete tlResults[r.part.key]; }
      paintDock();
    });
    head.append(sp, show, clear, go);

    const pads = document.createElement('div');
    pads.className = 'dock-pads';
    def.buttons.forEach((btn, b) => {
      const p = document.createElement('button');
      p.className = 'pad';
      p.innerHTML = '<span></span>' + (btn.sub ? '<small></small>' : '');
      p.firstChild.textContent = btn.label;
      if (btn.sub) p.querySelector('small').textContent = btn.sub;
      p.addEventListener('pointerdown', (e) => { e.preventDefault(); press(inst, b); startDrag(e, inst, b); });
      pads.appendChild(p);
    });
    const hint = document.createElement('span');
    hint.className = 'tl-hint';
    hint.textContent = 'Drag a button onto its row, or tap a slot. Tap a note to remove it.';
    pads.appendChild(hint);

    const regions = dockRegions(inst);
    const total = regions.reduce((a, r) => a + r.part.length, 0);
    const scroll = document.createElement('div');
    scroll.className = 'tl-scroll';
    const grid = document.createElement('div');
    grid.className = 'tl-grid';
    grid.style.setProperty('--cols', total);
    const corner = document.createElement('div');
    corner.className = 'tl-lab tl-corner';
    grid.appendChild(corner);
    for (const r of regions) {
      const h = document.createElement('div');
      h.className = 'tl-sec';
      h.dataset.sec = r.sec.id;
      h.style.gridColumn = `span ${r.part.length}`;
      const times = r.sec.length / r.part.length;
      h.textContent = r.sec.name + (times > 1 ? ` ×${times}` : '');
      // the strip of section names is a ruler: click it to play what you placed from there
      h.title = 'Play mine from here';
      h.addEventListener('click', (e) => {
        const box = h.getBoundingClientRect();
        const step = Math.max(0, Math.min(r.part.length - 1, Math.floor((e.clientX - box.left) / (box.width / r.part.length))));
        checkTimeline(inst, r.g0 + step);
      });
      grid.appendChild(h);
    }
    const beat = song.spb;
    def.buttons.forEach((btn, b) => {
      const lab = document.createElement('div');
      lab.className = 'tl-lab';
      lab.textContent = btn.label + (btn.sub && btn.sub !== 'power' ? ' ' + btn.sub : '');
      grid.appendChild(lab);
      for (const r of regions) {
        for (let step = 0; step < r.part.length; step++) {
          const c = document.createElement('div');
          // tl- prefixed: a bare "bar" is already the deck's row of switches
          c.className = 'tl-cell' + (step === 0 ? ' tl-secline' : step % (beat * 4) === 0 ? ' tl-barline' : step % beat === 0 ? ' tl-beat' : '');
          c.dataset.sec = r.sec.id;
          c.dataset.step = step;
          c.dataset.b = b;
          c.dataset.g = r.g0 + step;
          c.addEventListener('click', () => toggleNote(r.part, step, b));
          grid.appendChild(c);
        }
      }
    });
    scroll.appendChild(grid);
    const sum = document.createElement('p');
    sum.className = 'tl-sum';
    dockEl.append(head, pads, scroll, sum);
    paintDock();
  }

  const sectionById = (id) => state.song.sections.find((x) => x.id === id);
  const cellsOf = () => [...dockEl.querySelectorAll('.tl-cell')];
  // draw the placed notes, with their colours from the last check where they have one
  function paintDock() {
    for (const c of cellsOf()) {
      const part = sectionById(c.dataset.sec).parts[state.tlInst];
      const key = c.dataset.step + '|' + c.dataset.b;
      const notes = drafts[part.key];
      const res = tlResults[part.key];
      c.classList.toggle('on', !!notes && notes.has(key));
      for (const r of TL_RESULTS) c.classList.toggle(r, !!res && res.get(key) === r);
    }
  }

  // a note you move or add forgets its colour from the last check
  function placeNote(part, step, b) {
    const notes = drafts[part.key] = drafts[part.key] || new Map();
    notes.set(step + '|' + b, { step, b });
    if (tlResults[part.key]) tlResults[part.key].delete(step + '|' + b);
    paintDock();
  }
  function toggleNote(part, step, b) {
    const notes = drafts[part.key] = drafts[part.key] || new Map();
    const key = step + '|' + b;
    if (notes.has(key)) notes.delete(key);
    else { notes.set(key, { step, b }); press(part.inst, b); }
    if (tlResults[part.key]) tlResults[part.key].delete(key);
    paintDock();
  }

  /* How close the placed notes are. Pure, so it can be tested on its own: each
     note is spot on (that button, that step), nearly (that button a step either
     side), wrongnote (another button belongs on that step) or off; plus how many
     of the part's notes nobody has placed yet. */
  function scoreTimeline(part, notes) {
    const want = new Set(part.events.map((e) => e.step + '|' + e.b));
    const steps = new Set(part.events.map((e) => e.step));
    const len = part.length;
    const results = new Map();
    for (const [key, n] of notes) {
      if (want.has(key)) results.set(key, 'spot');
      else if (want.has(((n.step + 1) % len) + '|' + n.b) || want.has(((n.step - 1 + len) % len) + '|' + n.b)) results.set(key, 'near');
      else if (steps.has(n.step)) results.set(key, 'wrongnote');
      else results.set(key, 'off');
    }
    const missing = [...want].filter((k) => !notes.has(k)).length;
    const count = (r) => [...results.values()].filter((x) => x === r).length;
    const solved = missing === 0 && results.size === want.size && count('spot') === want.size;
    return { results, missing, solved, spot: count('spot'), near: count('near'), wrongnote: count('wrongnote'), off: count('off') };
  }

  // what you placed in one section, as a part: each note rings until your next on its row
  function minePart(part) {
    const placed = [...drafts[part.key].values()].sort((a, b) => a.step - b.step);
    const events = placed.map((n) => {
      const next = placed.find((m) => m.b === n.b && m.step > n.step);
      return { step: n.step, b: n.b, len: Math.max(1, Math.min(4, (next ? next.step : part.length) - n.step)) };
    });
    return { inst: part.inst, buttons: part.buttons, tone: part.tone, length: part.length, events, section: part.section };
  }

  /* Play mine: every section you have put notes in, in order, each loop once —
     from the start, or from wherever you clicked the ruler (`from`, a slot along
     the whole timeline). Sections are scored whole either way. */
  function checkTimeline(inst = state.tlInst, from = 0) {
    const regions = dockRegions(inst).filter((r) => drafts[r.part.key] && drafts[r.part.key].size && r.g0 + r.part.length > from);
    if (!regions.length) {
      say(from ? 'Nothing placed from there on.' : 'Nothing on the timeline yet: drag a button onto it first.');
      return;
    }
    // how far into the first section to start: the rest of the section plays from there
    const skip = (r) => Math.max(0, from - r.g0);
    const ck = state.song.id + '/' + inst;
    state.tlChecks = state.tlChecks || {};
    state.tlChecks[ck] = (state.tlChecks[ck] || 0) + 1;
    const scores = regions.map((r) => ({ r, score: scoreTimeline(r.part, drafts[r.part.key]) }));
    for (const { r } of scores) delete tlResults[r.part.key];
    paintDock();                          // plain again until each note is reached
    const what = 'check:' + inst;
    const stepMs = stepSec() * 1000;
    const start = performance.now() + 120;
    // where each played step sits on the timeline, skipping the sections left empty
    const map = [];
    for (const { r } of scores) for (let step = skip(r); step < r.part.length; step++) map.push({ g: r.g0 + step, r });
    const cells = cellsOf();
    const playing = () => state.playing && state.playing.what === what;
    let col = -1;
    const sweep = setInterval(() => {
      if (!playing()) { clearInterval(sweep); cells.forEach((c) => c.classList.remove('now')); return; }
      const at = map[Math.floor((performance.now() - start) / stepMs)];
      if (!at || at.g === col) return;
      col = at.g;
      const res = scores.find((x) => x.r === at.r).score.results;
      for (const c of cells) {
        const here = +c.dataset.g === col;
        c.classList.toggle('now', here);
        if (here) {
          const r = res.get(c.dataset.step + '|' + c.dataset.b);
          if (r) c.classList.add(r);
          if (c.classList.contains('on')) c.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      }
    }, 20);
    const from0 = (part, off) => {
      const m = minePart(part);
      if (!off) return m;
      return Object.assign(m, { length: part.length - off, events: m.events.filter((e) => e.step >= off).map((e) => Object.assign({}, e, { step: e.step - off })) });
    };
    play(what, scores.map(({ r }) => ({ section: r.sec, parts: [from0(r.part, skip(r))], steps: r.part.length - skip(r) })), () => {
      clearInterval(sweep);
      cells.forEach((c) => c.classList.remove('now'));
      for (const { r, score } of scores) tlResults[r.part.key] = score.results;
      paintDock();
      reportTimeline(inst, scores, state.tlChecks[ck]);
    });
    say('Playing what you placed…');
  }

  function reportTimeline(inst, scores, checks) {
    const total = { spot: 0, near: 0, wrongnote: 0, off: 0, missing: 0 };
    for (const { score } of scores) for (const k of Object.keys(total)) total[k] += score[k];
    const bits = [];
    if (total.spot) bits.push(`${total.spot} spot on`);
    if (total.near) bits.push(`${total.near} nearly`);
    if (total.wrongnote) bits.push(`${total.wrongnote} right time, wrong note`);
    if (total.off) bits.push(`${total.off} off`);
    if (total.missing) bits.push(`${total.missing} still to find`);
    const sum = dockEl.querySelector('.tl-sum');
    if (sum) sum.textContent = bits.join(' · ');
    state.last = { inst, timeline: total, solved: scores.filter((x) => x.score.solved).map((x) => x.r.part.key) };
    const solved = scores.filter((x) => x.score.solved);
    const stars = checks <= 2 ? 3 : checks <= 4 ? 2 : 1;
    for (const { r } of solved) completePart(r.part, stars, ` — the ${r.sec.name.toLowerCase()}, on the timeline`);
    if (solved.length < scores.length) {
      say(solved.length
        ? `${solved.map((x) => x.r.sec.name).join(' and ')} spot on! Move the yellow, orange and red ones in the rest, and play it again.`
        : 'Not quite yet — move the yellow, orange and red ones, find the rest, and play it again.');
    }
  }

  // dragging a button onto the timeline: a chip follows the pointer, and letting go
  // over any slot puts the note there on that button's own row
  function startDrag(e, inst, b) {
    const btn = defOf(inst).buttons[b];
    const chip = document.createElement('div');
    chip.className = 'tl-chip';
    chip.textContent = btn.label;
    chip.style.setProperty('--h', INST[inst].h);
    document.body.appendChild(chip);
    const move = (ev) => {
      chip.style.left = ev.clientX + 'px';
      chip.style.top = ev.clientY + 'px';
    };
    move(e);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      chip.remove();
      dropAt(inst, b, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function dropAt(inst, b, x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('.tl-cell');
    if (!cell || !dockEl.contains(cell)) return false;
    const part = sectionById(cell.dataset.sec).parts[inst];
    if (!part) return false;
    placeNote(part, +cell.dataset.step, b);
    return true;
  }

  // ---------- mega jam: the looper ----------
  function recordNote(btn) {
    const now = ac.currentTime;
    const t = jam.len ? (now - jam.loopStart) % jam.len : now - jam.recStart;
    jam.events.push({ t: Math.round(t * 1000) / 1000, mk: btn.mk });
  }

  function toggleRecord() {
    audio();
    if (jam.rec) { endRecord(); return; }
    jam.rec = true;
    if (!jam.len) {
      // the first take: its length becomes the loop's
      stop();
      jam.events = [];
      jam.recStart = ac.currentTime;
      jam.recTimer = setTimeout(endRecord, JAM_MAX * 1000);
      say('Recording… play something, then press Stop recording.');
    } else {
      if (!(state.playing && state.playing.what === 'jam')) startLoop(ac.currentTime);
      say('Recording a layer over your loop…');
    }
    syncButtons();
  }

  function endRecord() {
    clearTimeout(jam.recTimer);
    const first = !jam.len;
    jam.rec = false;
    if (first) {
      if (!jam.events.length) { say('Nothing recorded — press Record and play some buttons.'); syncButtons(); return; }
      jam.len = Math.min(JAM_MAX, Math.max(1, ac.currentTime - jam.recStart));
      startLoop(jam.recStart);            // carries straight on: the take's start is the loop's zero
    }
    save.jam = { len: Math.round(jam.len * 1000) / 1000, events: jam.events };
    persist();
    renderSongs();
    say(`Loop: ${jam.len.toFixed(1)}s, ${jam.events.length} notes. Record again to add a layer.`);
    syncButtons();
  }

  function startLoop(zero) {
    stop();
    audio();
    const bus = ac.createGain();
    bus.connect(master);
    jam.loopStart = zero;
    let until = ac.currentTime;
    const tick = () => {
      const to = ac.currentTime + JAM_AHEAD;
      for (let k = Math.floor((until - zero) / jam.len); zero + k * jam.len < to; k++) {
        for (const e of jam.events) {
          const at = zero + k * jam.len + e.t;
          if (at < until || at >= to) continue;
          const hit = byMk.get(e.mk);
          if (!hit) continue;             // a button that has since left the songs
          const [inst, b] = hit;
          sound(MEGA.instruments[inst], b, at, LIVE_DUR[inst], bus);
          setTimeout(() => { if (state.song.mega) light(inst, b, 160); }, (at - ac.currentTime) * 1000);
        }
      }
      until = to;
    };
    tick();
    state.playing = { what: 'jam', bus, timers: [], interval: setInterval(tick, 25) };
    syncButtons();
  }

  function toggleLoop() {
    if (state.playing && state.playing.what === 'jam') { stop(); say('Loop stopped.'); return; }
    if (jam.len) { audio(); startLoop(ac.currentTime); say('Your loop. Record to add a layer.'); }
  }

  function clearJam() {
    stop();
    clearTimeout(jam.recTimer);
    jam.rec = false;
    jam.events = [];
    jam.len = 0;
    save.jam = { len: 0, events: [] };
    persist();
    renderSongs();
    say('Cleared. Press Record to start a new loop.');
    syncButtons();
  }

  // ---------- choosing ----------
  function selectSong(id) {
    const s = findSong(id);
    if (!s) return;
    stop();
    if (jam.rec) { clearTimeout(jam.recTimer); jam.rec = false; }
    state.turn = null;
    state.song = s;
    state.section = s.mega ? null : s.sections[0];
    state.focus = null;
    save.song = id;
    persist();
    renderSongs();
    renderDeck();
    renderRack();
    renderDock();
    bandFor(s);
    greet();
  }

  function selectSection(id) {
    const sec = state.song.sections.find((s) => s.id === id);
    if (!sec) return;
    stop();
    if (state.turn) endTurn('stopped');
    // in timeline mode, bring that section's part of the timeline into view
    const head = dockEl.querySelector(`.tl-sec[data-sec="${id}"]`);
    if (head) head.scrollIntoView({ block: 'nearest', inline: 'start' });
    viewSection(sec);
    syncButtons();
    say(sec.partList.length
      ? `The ${sec.name.toLowerCase()}: ${sec.partList.map((p) => lower(p.inst)).join(', ')}.`
      : `The ${sec.name.toLowerCase()} is just the singer — have a listen.`);
  }

  // ---------- input ----------
  listenBtn.addEventListener('click', listen);
  vocalsBtn.addEventListener('click', () => {
    save.vocals = !save.vocals;
    persist();
    syncButtons();
  });
  $('btn-pick').addEventListener('click', () => {
    renderSongs();
    pickerEl.showModal();
    const on = songsEl.querySelector('.song.on');
    if (on) on.scrollIntoView({ block: 'center' });
  });
  sectionBtn.addEventListener('click', listenSection);
  recBtn.addEventListener('click', toggleRecord);
  loopBtn.addEventListener('click', toggleLoop);
  clearBtn.addEventListener('click', clearJam);
  const help = $('help');
  $('btn-help').addEventListener('click', () => help.showModal());

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || help.open || pickerEl.open) return;
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 9)) return;
    const inst = (state.turn && state.turn.part.inst) || state.focus || state.song.order[0];
    const def = defOf(inst);
    if (def && n <= def.buttons.length) { e.preventDefault(); press(inst, n - 1); }
  });

  renderSongs();
  renderDeck();
  renderRack();
  renderDock();
  bandFor(state.song);
  greet();
  try { if (!localStorage.getItem(SAVE_KEY)) { help.showModal(); persist(); } } catch (e) { /* ignore */ }

  // ---------- debug handle ----------
  window.__band = {
    SONGS, MEGA, state, problems, INST, jam,
    get save() { return save; },
    selectSong, selectSection, setSpeed, listen, listenSection, showPart, startTurn, endTurn, press, stop,
    toggleRecord, toggleLoop, clearJam,
    stations: () => stations,
    band, BANDS, drawBand,
    setMode, dockInst, placeNote, checkTimeline, scoreTimeline, drafts, dropAt,
    stepSec, midiOf,
    audioState: () => (ac ? ac.state + ' t=' + ac.currentTime.toFixed(2) : 'none'),
    // renders just a song's voice, every section that sings once through, and measures it
    async renderVoice(songId) {
      audio();
      const song = findSong(songId);
      const keep = [ac, master];
      const sr = 22050;
      const sp = 60 / song.bpm / song.spb;
      const secs = song.sections.filter((x) => x.voice);
      const total = secs.reduce((a, x) => a + x.length, 0) * sp + 1;
      const off = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
      try {
        ac = off;
        master = off.destination;
        const lead = leadChain(off.destination);
        let at = 0.01;
        for (const sec of secs) {
          for (let c = 0; c * sec.voice.length < sec.length; c++) {
            for (const e of sec.voice.events) playLead(sec.voice.buttons[e.b], at + (c * sec.voice.length + e.step) * sp, e.len * sp, lead);
          }
          at += sec.length * sp;
        }
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let bad = 0, peak = 0;
      for (let j = 0; j < d.length; j++) {
        if (!Number.isFinite(d[j])) bad++;
        else if (Math.abs(d[j]) > peak) peak = Math.abs(d[j]);
      }
      return { bad, peak: +peak.toFixed(3) };
    },
    // renders the first `secs` of a whole song offline, as Play the whole song would,
    // and counts samples that are not numbers at all: one NaN through the compressor
    // silences everything after it without an error, while the pads go on lighting
    async renderSong(songId, secs = 20) {
      audio();
      const song = findSong(songId);
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * secs), sr);
      const sp = 60 / song.bpm / song.spb;
      const firstBad = {};
      try {
        ac = off;
        master = off.destination;
        let offset = 0;
        for (const sec of song.form) {
          for (const part of sec.partList) {
            for (let c = 0; c * part.length < sec.length; c++) {
              for (const e of part.events) {
                const t = (offset + c * part.length + e.step) * sp;
                if (t < secs) sound(part, e.b, t + 0.01, e.len * sp, off.destination);
              }
            }
          }
          offset += sec.length;
        }
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let bad = 0, sum = 0;
      for (let j = 0; j < d.length; j++) {
        if (!Number.isFinite(d[j])) { if (!bad) firstBad.at = +(j / sr).toFixed(3); bad++; } else sum += d[j] * d[j];
      }
      return { bad, firstBadAt: firstBad.at, rms: +Math.sqrt(sum / d.length).toFixed(4) };
    },
    // renders one button and says how loud it is through a small speaker: the RMS of
    // everything above `cut` Hz (a laptop or phone plays almost nothing below ~250Hz)
    async audible(songId, inst, b, dur, cut = 250) {
      audio();
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * (dur + 0.5)), sr);
      try {
        ac = off;
        const hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = cut;
        hp.connect(off.destination);
        master = hp;
        sound(findSong(songId).instruments[inst], b, 0.01, dur, hp);
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let sum = 0;
      const n = Math.ceil(sr * dur);
      for (let j = 0; j < n; j++) sum += d[j] * d[j];
      return +Math.sqrt(sum / n).toFixed(4);
    },
    // renders one button of a song held for `dur` seconds and returns its loudness
    // every 50ms, so a note that stops dead while it is meant to be ringing shows up
    async envelope(songId, inst, b, dur) {
      audio();
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * (dur + 1)), sr);
      try {
        ac = off;
        master = off.destination;
        sound(findSong(songId).instruments[inst], b, 0.01, dur, off.destination);
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      const win = Math.round(sr * 0.05);
      const out = [];
      for (let a = 0; a + win <= d.length; a += win) {
        let sum = 0;
        for (let j = a; j < a + win; j++) sum += d[j] * d[j];
        out.push(+Math.sqrt(sum / win).toFixed(4));
      }
      return out;
    },
    // renders every jam sound offline, one per slot, and measures each: nobody can
    // listen in a test, but a sound that comes out silent or deafening shows up here
    async levels(slot = 2.5) {
      audio();
      const keep = [ac, master];
      const list = MEGA.order.flatMap((inst) => MEGA.instruments[inst].buttons.map((b, i) => ({ inst, i, label: b.label + (b.sub ? ' ' + b.sub : '') })));
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * slot * list.length), sr);
      try {
        ac = off;
        master = off.destination;
        list.forEach((x, k) => sound(MEGA.instruments[x.inst], x.i, k * slot + 0.01, LIVE_DUR[x.inst], off.destination));
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      return list.map((x, k) => {
        let peak = 0, sum = 0;
        const a = Math.floor(k * slot * sr), z = Math.floor((k + 1) * slot * sr);
        for (let j = a; j < z; j++) { const v = Math.abs(d[j]); if (v > peak) peak = v; sum += v * v; }
        return { inst: x.inst, label: x.label, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (z - a)).toFixed(4) };
      });
    },
  };
})();
