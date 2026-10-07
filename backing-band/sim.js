/* Backing Band: the rules. The songs as data and how they are read into parts (what to
   press, beat by beat), how hard each song is, Mega Jam's button set, and the scoring:
   a turn played through, a timeline checked, a part's best kept. No page access, so a
   whole song can be played in Node:

     const game = createBand({ save, on })
       save   the saved object (freshSave(), or what was kept; fromV1() carries v1 across)
       on     on(event, data): 'save' (a best score or the song changed)

   Scoring is by order, not timing: notes that land on the same beat can be pressed in
   either order, and a wrong note costs that beat's share of the part's percentage but
   never sends you back to the start. */

// ---------- constants ----------
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
const SPEEDS = [[0.5, '½'], [0.75, '¾'], [1, 'Full']];

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
  // spot on, out of everything placed plus everything still to find
  const pct = Math.round(100 * count('spot') / (results.size + missing || 1));
  return { results, missing, solved, pct, spot: count('spot'), near: count('near'), wrongnote: count('wrongnote'), off: count('off') };
}

// ---------- save ----------
export const freshSave = () => ({ pct: {}, song: SONGS[0].id, speed: 1, vocals: true, mode: 'play', jam: { len: 0, events: [] } });
/* v1 kept stars: three was a part with no mistakes, so it is 100%. */
export function fromV1(v1) {
  const out = Object.assign({}, v1, { pct: {} });
  for (const [song, parts] of Object.entries(v1.stars || {})) {
    out.pct[song] = {};
    for (const [key, n] of Object.entries(parts)) out.pct[song][key] = n >= 3 ? 100 : n === 2 ? 80 : 50;
  }
  delete out.stars;
  return out;
}

export function createBand({ save = freshSave(), on = () => {} } = {}) {
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
  const stepSec = () => 60 / (state.song.bpm * state.speed) / state.song.spb;

  // a part's best score so far, as a percentage; undefined until it has been tried
  const pctOf = (song, part) => (save.pct[song.id] || {})[part.key];
  const pctOfParts = (song, parts) => (parts.length ? Math.round(parts.reduce((a, p) => a + (pctOf(song, p) || 0), 0) / parts.length) : 0);
  const tried = (song, parts) => parts.some((p) => pctOf(song, p) != null);
  const sectionDone = (song, sec) => sec.partList.every((p) => pctOf(song, p) === 100);
  const allDone = (song) => song.allParts.every((p) => pctOf(song, p) === 100);
  const defOf = (inst) => state.song.instruments[inst];
  const partOf = (inst) => (state.section && state.section.parts[inst]) || null;

  // ---------- your turn ----------
  function beginTurn(inst) {
    const part = partOf(inst);
    if (!part) return null;
    state.focus = inst;
    state.turn = { part, pos: 0, left: new Set(part.groups[0].bs), mistakes: 0, missed: new Set() };
    return part;
  }
  /* A press on the instrument whose turn it is: null when it is not that turn (any pad
     can be played just to jam); { good: true } for one of this beat's notes, with `beat`
     (and `missed`) when that finished the beat and `done` when it finished the part; or
     { good: false, want } with the notes this beat still wants. */
  function pressTurn(inst, b) {
    const t = state.turn;
    if (!t || t.part.inst !== inst) return null;
    if (t.left.has(b)) {
      t.left.delete(b);
      if (t.left.size) return { good: true };
      const beat = t.pos, missed = t.missed.has(t.pos);
      t.pos++;
      if (t.pos >= t.part.groups.length) return { good: true, beat, missed, done: true };
      t.left = new Set(t.part.groups[t.pos].bs);
      return { good: true, beat, missed };
    }
    t.mistakes++;
    t.missed.add(t.pos);
    return { good: false, want: [...t.left] };
  }
  /* The turn is over: its score is the share of beats played right first time. */
  function finishTurn() {
    const t = state.turn;
    const n = t.part.groups.length;
    const pct = Math.round(100 * (n - t.missed.size) / n);
    state.turn = null;
    state.last = { part: t.part.key, pct, mistakes: t.mistakes };
    return state.last;
  }
  /* Keeps a part's best score; returns the best. */
  function keepPct(part, pct) {
    const song = state.song;
    const best = Math.max(pct, pctOf(song, part) || 0);
    (save.pct[song.id] = save.pct[song.id] || {})[part.key] = best;
    on('save');
    return best;
  }

  // ---------- choosing ----------
  function chooseSong(id) {
    const s = findSong(id);
    if (!s) return null;
    state.turn = null;
    state.song = s;
    state.section = s.mega ? null : s.sections[0];
    state.focus = null;
    save.song = id;
    on('save');
    return s;
  }

  return {
    state, save, findSong, stepSec, pctOf, pctOfParts, tried, sectionDone, allDone, defOf, partOf,
    beginTurn, pressTurn, finishTurn, keepPct, chooseSong,
  };
}

export {
  INST, SPEEDS, chord, note, drum, pretty, sing, bars, held, once, rest, swap, KIT, NEON, NEON_SYNTH, NEON_BASS, NEON_DRUMS, SIDEWALK_DRUMS, SIDEWALK_RIFF, SIDEWALK_VOX, WHISPER_RIFF, WHISPER_DRUMS, WHISPER_SYNTH, WHISPER_VOX, ANTHEM, STADIUM_RIFF, ASH, ASH_BASS, ASH_CHANT, ASH_DRUMS, STRUT_RIFF, STRUT_DRUMS, STRUT_STAB, STRUT_OOH, SUNBEAM_VERSE, IRON, IRON_STOMP, IRON_BASS, SWAGGER_HOOK, SWAGGER_BASS, SWAGGER_DRUMS, GOLDEN_RIFF, GOLDEN_BASS, GOLDEN_OOH, GLITTER_HORNS, GLITTER_BASS, GLITTER_DRUMS, GLITTER_BADEEYA, SUNNY_HOOK, SUNNY_PLUCK, SUNNY_BASS, SURF_RIFF, CAMPFIRE_STRUM, CAMPFIRE_RIFF, CAMPFIRE_BASS, CRAWL_STOMP, CRAWL_RIFF, DIZZY_SYNTH, DIZZY_BASS, DARE, DARE_RIFF, DARE_DRUMS, DARE_BASS, EASY_ARP, EASY_BASS, CHAMPION_RIFF, DUSTY_BASS, DUSTY_DRUMS, SEASIDE_RIFF, RUNWAY_CHANT, RUNWAY_SYNTH, RUNWAY_BASS, RUNWAY_DRUMS, SKYWARD_HORNS, SKYWARD_STOMP, SKYWARD_BASS, FALLING_PIANO, FALLING_BASS, FALLING_DRUMS, SPRINT_GTR, DISCO_CHANT, DISCO_DRUMS, DISCO_BASS, BOUNCE_RIFF, BOUNCE_BASS, JUNGLE_RIFF, JUNGLE_BASS, BUSKER_HOOK, BUSKER_BASS, BUSKER_DRUMS, SUNBEAM_CHORUS, ANTHEM_BASS, ANTHEM_KEYS, SONGS, problems, midiOf, parsePart, buildVoice, LEVELS, MEGA_EXTRAS, MEGA, byMk, scoreTimeline,
};
