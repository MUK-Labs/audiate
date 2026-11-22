import { ExerciseAudio } from './audio.js?v=live-pitch';
import { LEVELS, RANGES, generateRound, noteName, pitchName } from './exercise.js';
import { renderNotation } from './notation.js';
import { renderPitchMeter } from './pitch-meter.js?v=live-pitch';
import { phoneRotation } from './rotation.js';

const STORAGE_KEY = 'muk-labs.audiate.progress.v1';
const ROUNDS_PER_LEVEL = 3;
const audio = new ExerciseAudio();
const ui = Object.fromEntries(
  ['total-rounds', 'round-level', 'round-position', 'prompt-symbol', 'prompt-title',
    'prompt-detail', 'answer-score', 'pitch-meter', 'result-visuals', 'feedback', 'primary',
    'secondary', 'result-actions', 'play-answer', 'play-chain', 'level-list', 'range',
    'auto-check', 'storage-status', 'practice', 'classroom-toggle', 'track-pitch',
    'arrow-hint', 'track-hint', 'touch-hint', 'rotation-setting', 'rotation-check',
    'rotation-status', 'meter-announcement']
    .map(id => [id, document.getElementById(id)]),
);

function loadProgress() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }
  const completed = LEVELS.map((_, index) => {
    const count = saved?.completed?.[index];
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  });
  const unlocked = highestLevel(completed);
  return {
    completed,
    level: Number.isInteger(saved?.level) && saved.level >= 0 && saved.level <= unlocked
      ? saved.level : unlocked,
    range: RANGES[saved?.range] ? Number(saved.range) : 0,
    autoCheck: saved?.autoCheck === true,
  };
}

function highestLevel(completed) {
  const firstIncomplete = completed.findIndex(count => count < ROUNDS_PER_LEVEL);
  return firstIncomplete === -1 ? LEVELS.length - 1 : firstIncomplete;
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    ui['storage-status'].textContent = 'Progress can only be kept for this session.';
  }
}

const progress = loadProgress();
let round = null;
let phase = 'ready';
let nextLevel = null;
let step = 0;
let status = '';
let mic = null;
let playback = false;
let renderedScore = null;
let comparison = null;
let tracking = null;
let rotationReady = false;
let rotationSetup = null;
let classroom = false;
let nativeFullscreen = false;

for (const [index, range] of RANGES.entries()) {
  const option = new Option(
    `${range.name} · ${pitchName(range.min)}–${pitchName(range.max)}`, String(index),
  );
  ui.range.add(option);
}
ui.range.value = String(progress.range);
ui['auto-check'].checked = progress.autoCheck;
ui['rotation-setting'].hidden = !phoneRotation.available;
ui['rotation-check'].checked = false;

const holdButton = ui['track-pitch'];
const practiceActions = [ui.primary, ui.secondary, holdButton, ui['play-answer'], ui['play-chain']];

function availableActions() {
  return practiceActions.filter(button => !button.disabled && !button.closest('[hidden]'));
}

function atFinalPitch() {
  return phase === 'sing' || phase === 'result';
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function renderLevels() {
  const total = progress.completed.reduce((sum, count) => sum + count, 0);
  ui['total-rounds'].textContent = `${plural(total, 'round')} finished`;
  const unlocked = highestLevel(progress.completed);
  const entries = LEVELS.map((level, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const number = document.createElement('span');
    const description = document.createElement('span');
    const name = document.createElement('span');
    const detail = document.createElement('span');
    const count = document.createElement('span');

    button.type = 'button';
    button.className = 'level-button';
    button.disabled = index > unlocked;
    if (index === progress.level) button.setAttribute('aria-current', 'true');
    number.className = 'level-number';
    number.textContent = index + 1;
    name.className = 'level-name';
    name.textContent = level.name;
    detail.className = 'level-steps';
    detail.textContent = level.detail;
    count.className = 'level-count';
    const finished = Math.min(progress.completed[index], ROUNDS_PER_LEVEL);
    count.textContent = button.disabled ? 'Locked' : `${finished}/${ROUNDS_PER_LEVEL}`;
    if (!button.disabled) count.setAttribute('aria-label', `${finished} of ${ROUNDS_PER_LEVEL} rounds`);

    description.append(name, detail);
    button.append(number, description, count);
    button.addEventListener('click', () => chooseLevel(index));
    item.append(button);
    return item;
  });
  ui['level-list'].replaceChildren(...entries);
}

function text(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function setTitle(title, direction) {
  const element = ui['prompt-title'];
  if (!direction) {
    text(element, title);
    return;
  }
  if (element.textContent === direction + ' ' + title) return;
  const label = document.createElement('span');
  label.className = 'cue-direction';
  label.textContent = direction;
  element.replaceChildren(label, document.createTextNode(' ' + title));
}

function render() {
  const level = LEVELS[progress.level];
  const isResult = phase === 'result';
  let position = `${plural(level.steps, 'cue')}`;
  let symbol = '♪';
  let title = 'Hear the starting note';
  let direction = '';
  let detail = 'Listen once, then carry the pitch through each interval.';
  let primary = 'Start round';
  let secondary = '';

  if (phase === 'starting') {
    primary = 'Playing…';
    detail = 'Keep this pitch in mind.';
  } else if (phase === 'cue') {
    const cue = round.cues[step];
    position = `Cue ${step + 1} of ${round.cues.length}`;
    symbol = cue.direction === 'up' ? '↑' : '↓';
    direction = cue.direction === 'up' ? 'Up' : 'Down';
    title = cue.interval[0].toUpperCase() + cue.interval.slice(1);
    detail = 'Hear the new note in your head.';
    primary = 'Next';
    if (step === 0) secondary = 'Replay starting note';
  } else if (phase === 'sing') {
    position = 'Your turn';
    title = 'Sing the final pitch';
    detail = 'Hold the note you arrived at, then reveal the answer.';
    primary = 'Reveal answer';
    secondary = mic && !tracking ? 'Cancel pitch check' : 'Check before reveal';
  } else if (isResult) {
    position = 'Round complete';
    title = noteName(round.notes.at(-1));
    detail = 'Final pitch';
    primary = nextLevel === null ? 'Next round' : `Start level ${nextLevel + 1}`;
    secondary = mic && !tracking ? 'Cancel pitch check' : 'Check my pitch';
  }

  text(ui['round-level'], `Level ${progress.level + 1} · ${level.name}`);
  text(ui['round-position'], position);
  text(ui['prompt-symbol'], symbol);
  setTitle(title, direction);
  text(ui['prompt-detail'], detail);
  text(ui.primary, primary);
  text(ui.secondary, secondary);
  ui.secondary.hidden = !secondary;
  ui.primary.disabled = Boolean(playback || mic);
  ui.secondary.disabled = Boolean(playback || tracking);
  holdButton.hidden = !atFinalPitch();
  holdButton.disabled = Boolean(playback || (mic && !tracking) || tracking?.source === 'rotation');
  holdButton.toggleAttribute('data-tracking', Boolean(tracking));
  text(holdButton, tracking?.source === 'toggle' ? 'Stop tracking'
    : tracking ? 'Tracking pitch…' : 'Hold to track pitch');
  ui['result-actions'].hidden = !isResult;
  ui['play-answer'].disabled = Boolean(playback || mic);
  ui['play-chain'].disabled = Boolean(playback || mic);
  ui['answer-score'].hidden = !isResult;
  if (isResult && renderedScore !== round) {
    renderNotation(ui['answer-score'], round);
    renderedScore = round;
  }
  if (!isResult && renderedScore) {
    ui['answer-score'].replaceChildren();
    renderedScore = null;
  }
  renderComparison();
  text(ui['meter-announcement'], comparison && !comparison.live
    ? ui['pitch-meter'].firstElementChild?.getAttribute('aria-label') ?? ''
    : '');
  ui['arrow-hint'].hidden = availableActions().length < 2;
  ui['track-hint'].hidden = !atFinalPitch();
  text(ui['touch-hint'], rotationReady && atFinalPitch()
    ? 'Turn sideways to track and upright to stop.'
    : atFinalPitch() ? 'Hold the pitch tracking button to follow your voice.' : 'Follow each cue silently.');
  ui.feedback.hidden = !status;
  text(ui.feedback, status);
}

function renderComparison() {
  const show = atFinalPitch() && comparison;
  ui['result-visuals'].hidden = phase !== 'result' && !show;
  ui.practice.toggleAttribute('data-live-tracking', Boolean(tracking));
  if (!show) {
    renderPitchMeter(ui['pitch-meter'], null);
    return;
  }

  const target = round.notes.at(-1);
  const { live, midi, minMidi, maxMidi } = comparison;
  const centsFromTarget = pitch => (pitch - target.midi) * 100;
  const targetName = phase === 'result' ? noteName(target) : undefined;
  renderPitchMeter(ui['pitch-meter'], {
    live,
    cents: midi === null ? null : centsFromTarget(midi),
    minCents: minMidi === undefined ? undefined : centsFromTarget(minMidi),
    maxCents: maxMidi === undefined ? undefined : centsFromTarget(maxMidi),
    targetName,
    sungName: targetName && midi !== null
      ? (Math.round(midi) === target.midi ? targetName : pitchName(midi))
      : undefined,
  });
}

function chooseLevel(index) {
  if (index === progress.level) return;
  resetRound();
  progress.level = index;
  saveProgress();
  renderLevels();
  render();
  ui.primary.focus();
}

function resetRound() {
  mic?.abort();
  mic = null;
  tracking = null;
  audio.stopPlayback();
  playback = false;
  round = null;
  phase = 'ready';
  nextLevel = null;
  step = 0;
  status = '';
  comparison = null;
}

async function play(notes, currentRound) {
  playback = true;
  render();
  try {
    await audio.ready();
    if (round !== currentRound) return false;
    await audio.play(notes);
    return round === currentRound;
  } catch {
    if (round === currentRound) {
      status = 'Audio could not play. Check your browser sound settings and try again.';
    }
    return false;
  } finally {
    if (round === currentRound) {
      playback = false;
      render();
    }
  }
}

async function startRound() {
  const upcoming = nextLevel;
  resetRound();
  if (upcoming !== null) {
    progress.level = upcoming;
    saveProgress();
    renderLevels();
  }
  const currentRound = generateRound(progress.level, progress.range);
  round = currentRound;
  phase = 'starting';
  const played = await play(round.notes[0].midi, currentRound);
  if (round !== currentRound) return;
  phase = played ? 'cue' : 'ready';
  render();
  ui.primary.focus();
}

async function reveal(currentRound, autoCheck) {
  const priorUnlock = highestLevel(progress.completed);
  progress.completed[progress.level] += 1;
  const unlock = highestLevel(progress.completed);
  nextLevel = unlock > priorUnlock ? unlock : null;
  phase = 'result';
  saveProgress();
  renderLevels();
  const played = await play(currentRound.notes.at(-1).midi, currentRound);
  if (round !== currentRound) return;
  if (syncRotationTracking()) return;
  if (played && autoCheck) {
    await checkPitch(false);
  } else {
    ui.primary.focus();
  }
}

async function checkPitch(beforeReveal) {
  const currentRound = round;
  const controller = new AbortController();
  mic = controller;
  comparison = null;
  status = 'Opening the microphone…';
  render();
  ui.secondary.focus();

  let measured = null;
  try {
    await audio.ready();
    if (controller.signal.aborted) return;
    measured = await audio.listen({
      signal: controller.signal,
      onStatus(message) {
        if (mic !== controller || controller.signal.aborted) return;
        status = message;
        render();
      },
    });
    if (controller.signal.aborted) return;
    status = measured === null ? 'No steady pitch heard. Try again and hold one note.' : '';
    if (measured !== null) comparison = { midi: measured };
  } catch (error) {
    if (controller.signal.aborted) return;
    status = error.message || 'The microphone is unavailable.';
  } finally {
    if (mic === controller) {
      mic = null;
      render();
    }
  }

  if (round !== currentRound) return;
  if (beforeReveal && measured !== null) {
    await reveal(currentRound, false);
  } else {
    (beforeReveal ? ui.secondary : ui.primary).focus();
  }
}

function startTracking(source, control) {
  if (!atFinalPitch() || playback || tracking || document.hidden) return false;
  mic?.abort();
  const controller = new AbortController();
  mic = controller;
  const session = { source, control, lastMidi: null };
  tracking = session;
  comparison = { live: true, midi: null };
  status = 'Opening the microphone…';
  render();

  void audio.track({
    signal: controller.signal,
    onStatus(message, listening) {
      if (tracking !== session) return;
      status = listening ? '' : message;
      render();
      if (source === 'rotation' && listening) {
        ui['pitch-meter'].scrollIntoView({ block: 'nearest' });
      }
    },
    onPitch(midi) {
      if (tracking !== session) return;
      comparison.midi = midi;
      if (midi !== null) {
        session.lastMidi = midi;
        comparison.minMidi = Math.min(comparison.minMidi ?? midi, midi);
        comparison.maxMidi = Math.max(comparison.maxMidi ?? midi, midi);
      }
      renderComparison();
    },
  }).then(() => {
    if (tracking === session) stopTracking();
  }).catch(error => {
    if (tracking === session) stopTracking(error.message || 'The microphone is unavailable.');
  });
  return true;
}

function stopTracking(message) {
  if (!tracking) return;
  const { lastMidi } = tracking;
  tracking = null;
  mic.abort();
  mic = null;
  comparison = lastMidi === null ? null : { ...comparison, live: false, midi: lastMidi };
  status = message ?? (comparison ? '' : 'No pitch captured.');
  render();
}

function syncRotationTracking() {
  if (!rotationReady || !phoneRotation.isLandscape() || !atFinalPitch()) {
    if (tracking?.source === 'rotation') stopTracking();
    return false;
  }
  return tracking?.source === 'rotation' || startTracking('rotation');
}

function advance() {
  if (playback || mic) return;
  if (phase === 'ready' || phase === 'result') {
    void startRound();
  } else if (phase === 'cue') {
    step += 1;
    if (step === round.cues.length) phase = 'sing';
    render();
    syncRotationTracking();
  } else if (phase === 'sing') {
    status = '';
    void reveal(round, progress.autoCheck);
  }
}

function setClassroom(active) {
  classroom = active;
  document.documentElement.classList.toggle('classroom-view', active);
  text(ui['classroom-toggle'], active ? 'Exit classroom view' : 'Classroom view');
  if (active && !ui.primary.disabled) ui.primary.focus();
  if (!active) ui['classroom-toggle'].focus();
}

ui['classroom-toggle'].addEventListener('click', async () => {
  if (document.fullscreenElement === ui.practice) {
    try {
      await document.exitFullscreen();
    } catch {
      // The browser may have started exiting fullscreen already.
    }
    return;
  }

  setClassroom(!classroom);
  if (classroom && ui.practice.requestFullscreen) {
    try {
      await ui.practice.requestFullscreen();
    } catch {
      // Classroom view also works within the browser window.
    }
  }
});

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === ui.practice) {
    nativeFullscreen = true;
  } else if (nativeFullscreen) {
    nativeFullscreen = false;
    setClassroom(false);
  }
});

ui.primary.addEventListener('click', advance);
ui.secondary.addEventListener('click', async () => {
  if (playback) return;
  if (mic) {
    mic.abort();
    mic = null;
    status = 'Pitch check canceled.';
    render();
  } else if (phase === 'cue') {
    const currentRound = round;
    status = '';
    await play(round.notes[0].midi, currentRound);
    if (round === currentRound) ui.primary.focus();
  } else if (phase === 'sing' || phase === 'result') {
    void checkPitch(phase === 'sing');
  }
});
ui['play-answer'].addEventListener('click', () => play(round.notes.at(-1).midi, round));
ui['play-chain'].addEventListener('click', () => play(round.notes.map(note => note.midi), round));
ui.range.addEventListener('change', () => {
  progress.range = Number(ui.range.value);
  saveProgress();
});
ui['auto-check'].addEventListener('change', () => {
  progress.autoCheck = ui['auto-check'].checked;
  saveProgress();
});

const rotationCheck = ui['rotation-check'];
rotationCheck.addEventListener('change', async () => {
  rotationSetup?.abort();
  rotationReady = false;
  if (!rotationCheck.checked) {
    rotationSetup = null;
    text(ui['rotation-status'], '');
    syncRotationTracking();
    render();
    return;
  }

  const controller = new AbortController();
  rotationSetup = controller;
  text(ui['rotation-status'], 'Waiting for microphone permission…');
  try {
    await audio.prepareMicrophone({ signal: controller.signal });
    if (controller.signal.aborted) return;
    rotationReady = true;
    text(ui['rotation-status'], '');
    syncRotationTracking();
    render();
  } catch (error) {
    if (controller.signal.aborted) return;
    rotationCheck.checked = false;
    text(ui['rotation-status'], error.message || 'The microphone is unavailable.');
  } finally {
    if (rotationSetup === controller) rotationSetup = null;
  }
});
phoneRotation.subscribe(syncRotationTracking);

holdButton.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  if (tracking?.source === 'toggle') {
    stopTracking();
    return;
  }
  if (startTracking('pointer', event.pointerId)) {
    holdButton.setPointerCapture(event.pointerId);
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  holdButton.addEventListener(type, event => {
    if (tracking?.source === 'pointer' && tracking.control === event.pointerId) stopTracking();
  });
}
holdButton.addEventListener('contextmenu', event => event.preventDefault());
holdButton.addEventListener('click', event => {
  if (event.detail !== 0) return;
  if (tracking?.source === 'toggle') stopTracking();
  else startTracking('toggle');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && tracking) stopTracking();
  if (event.key === 'Escape' && classroom && !nativeFullscreen) {
    setClassroom(false);
    return;
  }

  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
    || event.shiftKey || event.isComposing
    || event.target.closest?.('input, select, textarea, [contenteditable]')) return;

  const activationKey = event.key === 'Enter' || event.key === ' ';
  if ((event.key.toLowerCase() === 'c' && atFinalPitch()) || (activationKey && event.target === holdButton)) {
    event.preventDefault();
    if (!event.repeat) {
      if (tracking?.source === 'toggle') stopTracking();
      else startTracking('key', event.key.toLowerCase());
    }
    return;
  }

  const focusedAction = practiceActions.includes(event.target);
  if (!focusedAction && event.target.closest?.('button, a, [tabindex]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const actions = availableActions();
    if (actions.length < 2) return;
    const current = Math.max(0, actions.indexOf(event.target));
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    event.preventDefault();
    actions[(current + offset + actions.length) % actions.length].focus();
    return;
  }
  if (!activationKey) return;
  if (event.repeat) {
    event.preventDefault();
    return;
  }
  if (focusedAction) return;
  event.preventDefault();
  advance();
});

document.addEventListener('keyup', event => {
  if (tracking?.source !== 'key' || tracking.control !== event.key.toLowerCase()) return;
  event.preventDefault();
  stopTracking();
});

window.addEventListener('blur', () => {
  if (tracking?.source === 'key') stopTracking();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !mic) return;
  if (tracking) stopTracking();
  else {
    mic.abort();
    mic = null;
    status = '';
    render();
  }
});

window.addEventListener('pagehide', () => {
  rotationSetup?.abort();
  rotationSetup = null;
  if (!rotationReady) rotationCheck.checked = false;
  if (!mic && !playback) return;
  resetRound();
  render();
});

renderLevels();
render();
