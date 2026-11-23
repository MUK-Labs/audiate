const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const SMALL_INTERVALS = [
  ['minor second', 'm2', 2, 1],
  ['major second', 'M2', 2, 2],
  ['minor third', 'm3', 3, 3],
  ['major third', 'M3', 3, 4],
];
const FOURTHS = [...SMALL_INTERVALS, ['perfect fourth', 'P4', 4, 5]];
const FIFTHS = [...FOURTHS, ['perfect fifth', 'P5', 5, 7]];
const SIXTHS = [...FIFTHS, ['minor sixth', 'm6', 6, 8], ['major sixth', 'M6', 6, 9]];
const OCTAVES = [
  ...SIXTHS,
  ['augmented fourth', 'A4', 4, 6],
  ['diminished fifth', 'd5', 5, 6],
  ['minor seventh', 'm7', 7, 10],
  ['major seventh', 'M7', 7, 11],
  ['perfect octave', 'P8', 8, 12],
];

const STANDARD_LEVELS = [
  { name: 'First steps', steps: 1, detail: 'Seconds and thirds', intervals: SMALL_INTERVALS },
  { name: 'Two jumps', steps: 2, detail: 'Up to a fourth', intervals: FOURTHS },
  { name: 'Three jumps', steps: 3, detail: 'Up to a fifth', intervals: FIFTHS },
  { name: 'Four jumps', steps: 4, detail: 'Up to a sixth', intervals: SIXTHS },
  { name: 'Five jumps', steps: 5, detail: 'Up to an octave', intervals: OCTAVES },
];

export const KUMAD_START = STANDARD_LEVELS.length;
export const LEVELS = [
  ...STANDARD_LEVELS,
  ...['Six', 'Seven', 'Eight', 'Nine', 'Ten'].map((name, index) => ({
    name: `${name} jumps`,
    steps: KUMAD_START + index + 1,
    detail: 'Up to an octave',
    intervals: OCTAVES,
  })),
];

export const RANGES = [
  { name: 'Middle', min: 57, max: 76 },
  { name: 'Lower', min: 52, max: 71 },
  { name: 'Higher', min: 62, max: 81 },
];

export function midiFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteName({ letter, octave, accidental }) {
  return `${letter}${['♭', '', '♯'][accidental + 1]}${octave}`;
}

export function pitchName(midi) {
  const note = Math.round(midi);
  const octave = Math.floor(note / 12) - 1;
  return `${PITCH_NAMES[note - (octave + 1) * 12]}${octave}`;
}

function naturalNotesInRange({ min, max }) {
  const notes = [];
  for (let midi = min; midi <= max; midi += 1) {
    const letterIndex = LETTER_PITCHES.indexOf(midi % 12);
    if (letterIndex !== -1) {
      notes.push({ midi, letter: LETTERS[letterIndex], octave: Math.floor(midi / 12) - 1, accidental: 0 });
    }
  }
  return notes;
}

function possibleMoves(note, level, { min, max }) {
  const moves = [];
  const writtenPosition = note.octave * 7 + LETTERS.indexOf(note.letter);

  for (const [interval, short, number, semitones] of level.intervals) {
    for (const sign of [1, -1]) {
      const midi = note.midi + sign * semitones;
      if (midi < min || midi > max) continue;

      // Diatonic distance fixes the letter, then semitone distance fixes its accidental.
      const position = writtenPosition + sign * (number - 1);
      const octave = Math.floor(position / 7);
      const letterIndex = position - octave * 7;
      const naturalMidi = (octave + 1) * 12 + LETTER_PITCHES[letterIndex];
      const accidental = midi - naturalMidi;
      const allowedAccidental = level.steps === 1 ? 0 : 1;
      if (Math.abs(accidental) > allowedAccidental) continue;

      moves.push({
        note: { midi, letter: LETTERS[letterIndex], octave, accidental },
        cue: { direction: sign === 1 ? 'up' : 'down', interval, short, number, semitones },
      });
    }
  }
  return moves;
}

function sample(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

export function generateRound(levelIndex = 0, rangeIndex = 0, rng = Math.random) {
  const level = LEVELS[levelIndex] ?? LEVELS[0];
  const range = RANGES[rangeIndex] ?? RANGES[0];
  const notes = [sample(naturalNotesInRange(range), rng)];
  const cues = [];

  for (let step = 0; step < level.steps; step += 1) {
    const moves = possibleMoves(notes.at(-1), level, range);
    const newPitches = moves.filter(({ note }) => !notes.some(({ midi }) => midi === note.midi));
    const { note, cue } = sample(newPitches.length ? newPitches : moves, rng);
    notes.push(note);
    cues.push(cue);
  }

  return { notes, cues };
}
