import { noteName } from './exercise.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#1d2621';
const ACCENT = '#14543c';
const STAFF_LINE = '#a9b3ad';
const STAFF_STEP = 5.5;
const NOTE_GAP = 64;
const FIRST_NOTE_X = 75;
const STEM_LENGTH = 34;
const LETTERS = 'CDEFGAB';
const CLEFS = {
  treble: { name: 'Treble clef', bottomLine: 4 * 7 + LETTERS.indexOf('E') },
  bass: { name: 'Bass clef', bottomLine: 2 * 7 + LETTERS.indexOf('G') },
};
const ACCIDENTAL_PATHS = {
  '-1': 'M-3 -13v20C0 4 4 1 4-2C4-6 0-7-3-4',
  0: 'M-3 -10v16l6-2M3 10V-6l-6 2',
  1: 'M-2 -9V8M3 -10V7M-5 -3l11-2M-5 3l11-2',
};

let notationCount = 0;

function staffPosition(note, clef) {
  return note.octave * 7 + LETTERS.indexOf(note.letter) - clef.bottomLine;
}

function ledgerSteps(position) {
  const steps = [];
  for (let step = -2; step >= position; step -= 2) steps.push(step);
  for (let step = 10; step <= position; step += 2) steps.push(step);
  return steps;
}

function chooseClef(notes) {
  const score = clef => notes.reduce((total, note) => {
    const position = staffPosition(note, clef);
    return total + ledgerSteps(position).length ** 2;
  }, 0);
  return score(CLEFS.bass) < score(CLEFS.treble) ? CLEFS.bass : CLEFS.treble;
}

function createSvg(document, tag, attributes, content) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content !== undefined) node.textContent = content;
  return node;
}

function drawClef(add, clef, staffBottom) {
  const x = 32;
  if (clef === CLEFS.treble) {
    const y = staffBottom - 2 * STAFF_STEP;
    add('path', {
      d: 'M-2 8C-10 4-6-7 3-7C12-7 15 3 9 9C3 15-11 12-14 3C-19-10-7-17 4-27C12-34 10-44 6-48C0-45-2-36 0-26L7 18C9 28 3 32-4 29',
      transform: `translate(${x} ${y})`,
      stroke: INK,
      'stroke-width': 2.4,
      'stroke-linecap': 'round',
      fill: 'none',
    });
    add('circle', { cx: x - 4, cy: y + 26, r: 3.7, fill: INK });
    return;
  }

  const y = staffBottom - 6 * STAFF_STEP;
  add('path', {
    d: 'M-11 0C-11-9 0-12 7-7C18 1 6 14-10 22C0 14 9 5 5-3C2-10-8-7-8 0Z',
    transform: `translate(${x} ${y})`,
    fill: INK,
  });
  add('circle', { cx: x - 8, cy: y, r: 3.5, fill: INK });
  add('circle', { cx: x + 16, cy: y - STAFF_STEP, r: 2, fill: INK });
  add('circle', { cx: x + 16, cy: y + STAFF_STEP, r: 2, fill: INK });
}

function describeRound(round) {
  const steps = round.cues.map((cue, index) => {
    return `${cue.direction} a ${cue.interval} to ${noteName(round.notes[index + 1])}`;
  });
  return [noteName(round.notes[0]), ...steps].join(', ');
}

export function renderNotation(container, round) {
  const document = container.ownerDocument;
  const clef = chooseClef(round.notes);
  const positions = round.notes.map(note => staffPosition(note, clef));
  const offsets = positions.map(position => -position * STAFF_STEP);
  const top = Math.min(-60, ...offsets.map((offset, index) => {
    return offset - (positions[index] < 4 ? STEM_LENGTH : 7);
  }));
  const bottom = Math.max(24, ...offsets.map((offset, index) => {
    return offset + (positions[index] < 4 ? 7 : STEM_LENGTH);
  }));
  const staffBottom = 36 - top;
  const labelY = staffBottom + bottom + 17;
  const staffEnd = FIRST_NOTE_X + (round.notes.length - 1) * NOTE_GAP + 25;
  const width = staffEnd + 12;
  const height = labelY + 10;
  const id = `notation-${++notationCount}`;

  const svg = createSvg(document, 'svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-labelledby': `${id}-title`,
    'aria-describedby': `${id}-description`,
  });
  Object.assign(svg.style, {
    display: 'block',
    width: '100%',
    minWidth: `${Math.floor(width * 0.88)}px`,
    maxWidth: `calc(${width}px * var(--notation-scale, 1))`,
    height: 'auto',
    marginInline: 'auto',
    fontFamily: 'inherit',
  });
  const add = (tag, attributes, content) => {
    svg.append(createSvg(document, tag, attributes, content));
  };
  add('title', { id: `${id}-title` }, `${clef.name} interval chain`);
  add('desc', { id: `${id}-description` }, describeRound(round));

  for (let line = 0; line < 5; line++) {
    const y = staffBottom - line * 2 * STAFF_STEP;
    add('line', { x1: 12, x2: staffEnd, y1: y, y2: y, stroke: STAFF_LINE });
  }
  add('line', {
    x1: staffEnd,
    x2: staffEnd,
    y1: staffBottom - 8 * STAFF_STEP,
    y2: staffBottom,
    stroke: STAFF_LINE,
  });
  drawClef(add, clef, staffBottom);

  round.cues.forEach((cue, index) => {
    const x = FIRST_NOTE_X + NOTE_GAP * (index + 0.5);
    const arrow = cue.direction === 'up' ? '↑' : '↓';
    add('text', {
      x, y: 20, fill: ACCENT, 'font-size': 14, 'font-weight': 650, 'text-anchor': 'middle',
    }, `${arrow} ${cue.short}`);
  });

  const accidentals = new Map();
  round.notes.forEach((note, index) => {
    const x = FIRST_NOTE_X + index * NOTE_GAP;
    const y = staffBottom + offsets[index];
    const position = positions[index];
    const color = index === round.notes.length - 1 ? ACCENT : INK;

    for (const ledger of ledgerSteps(position)) {
      const ledgerY = staffBottom - ledger * STAFF_STEP;
      add('line', { x1: x - 10, x2: x + 10, y1: ledgerY, y2: ledgerY, stroke: INK });
    }

    const pitch = `${note.letter}${note.octave}`;
    const priorAccidental = accidentals.get(pitch) ?? 0;
    if (note.accidental !== priorAccidental) {
      add('path', {
        d: ACCIDENTAL_PATHS[note.accidental],
        transform: `translate(${x - 17} ${y})`,
        stroke: color,
        'stroke-width': 1.5,
        'stroke-linecap': 'round',
        fill: 'none',
      });
      accidentals.set(pitch, note.accidental);
    }

    const stemUp = position < 4;
    const stemX = stemUp ? x + 5.9 : x - 5.9;
    add('line', {
      x1: stemX, x2: stemX, y1: y, y2: y + (stemUp ? -STEM_LENGTH : STEM_LENGTH),
      stroke: color, 'stroke-width': 1.35,
    });
    add('ellipse', {
      cx: x, cy: y, rx: 6.9, ry: 4.6, transform: `rotate(-17 ${x} ${y})`, fill: color,
    });
    add('text', {
      x, y: labelY, fill: color, 'font-size': 14, 'font-weight': 650, 'text-anchor': 'middle',
    }, noteName(note));
  });

  const scroll = document.createElement('div');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Musical notation');
  scroll.style.overflowX = 'auto';
  scroll.style.maxWidth = '100%';
  scroll.append(svg);
  container.replaceChildren(scroll);
}
