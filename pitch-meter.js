const LIMIT_CENTS = 100;
const IN_TUNE_CENTS = 35;
const GRADUATIONS = [-100, -50, 0, 50, 100];
const meters = new WeakMap();

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function scalePosition(cents) {
  const bounded = Math.max(-LIMIT_CENTS, Math.min(LIMIT_CENTS, cents));
  return `${50 + 50 * bounded / LIMIT_CENTS}%`;
}

function scaleLabel(cents) {
  if (cents === 0) return '0¢';
  return `${cents < 0 ? '−' : '+'}${Math.abs(cents)}¢`;
}

function roundedCents(cents) {
  return Math.sign(cents) * Math.round(Math.abs(cents));
}

function spokenCents(cents) {
  if (cents === 0) return 'on target';
  const distance = Math.abs(cents);
  return `${distance} ${distance === 1 ? 'cent' : 'cents'} ${cents < 0 ? 'flat' : 'sharp'}`;
}

function createMeter(container) {
  const figure = element('figure', 'pitch-meter');
  figure.setAttribute('role', 'img');
  const summary = element('figcaption', 'pitch-meter__summary');
  const sung = element('span', 'pitch-meter__sung');
  const error = element('strong', 'pitch-meter__error');
  summary.append(sung, error);
  summary.setAttribute('aria-hidden', 'true');

  const scale = element('div', 'pitch-meter__scale');
  scale.setAttribute('aria-hidden', 'true');
  const target = element('span', 'pitch-meter__target');
  const axis = element('div', 'pitch-meter__axis');
  const band = element('span', 'pitch-meter__band');
  axis.append(band);
  for (const value of GRADUATIONS) {
    const tick = element('span', 'pitch-meter__tick', scaleLabel(value));
    tick.style.setProperty('--pitch-position', scalePosition(value));
    if (value === 0) tick.classList.add('pitch-meter__tick--center');
    axis.append(tick);
  }
  const marker = element('span', 'pitch-meter__marker');
  axis.append(marker);
  scale.append(target, axis);

  const range = element('span', 'pitch-meter__range');
  range.setAttribute('aria-hidden', 'true');
  figure.append(summary, scale, range);
  container.replaceChildren(figure);
  return { figure, sung, error, target, band, marker, range };
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function pitchError(cents) {
  const distance = Math.round(Math.abs(cents));
  const direction = cents < 0 ? 'flat' : 'sharp';
  const outside = Math.abs(cents) > LIMIT_CENTS;
  const result = distance <= IN_TUNE_CENTS ? 'In tune · ' : '';
  const visual = distance === 0 ? '0¢ · On target' : `${result}${distance}¢ ${direction}`;
  const spoken = spokenCents(roundedCents(cents));
  return { visual, spoken, outside, direction };
}

export function renderPitchMeter(container, measurement) {
  const hasPitch = Number.isFinite(measurement?.cents);
  const hasRange = Number.isFinite(measurement?.minCents) && Number.isFinite(measurement?.maxCents);
  if (!measurement?.live && !hasPitch && !hasRange) {
    container.hidden = true;
    if (meters.delete(container)) container.replaceChildren();
    return;
  }

  const { cents, targetName, sungName, live, minCents, maxCents } = measurement;
  let meter = meters.get(container);
  if (!meter) {
    meter = createMeter(container);
    meters.set(container, meter);
  }

  const targetLabel = targetName ? `Target ${targetName}` : 'Target';
  const sungLabel = sungName ? `Sung ${sungName}` : 'Sung pitch';
  const current = hasPitch ? pitchError(cents) : null;
  const rangeStart = hasRange ? roundedCents(minCents) : 0;
  const rangeEnd = hasRange ? roundedCents(maxCents) : 0;
  const rangeLabel = rangeStart === rangeEnd
    ? scaleLabel(rangeStart)
    : `${scaleLabel(rangeStart)} to ${scaleLabel(rangeEnd)}`;

  text(meter.target, targetLabel);
  text(meter.sung, hasPitch ? sungLabel : live ? 'Listening…' : 'Tracking complete');
  text(meter.error, current?.visual ?? '');
  meter.marker.hidden = !hasPitch;
  if (hasPitch) {
    meter.marker.style.setProperty('--pitch-position', scalePosition(cents));
    if (current.outside) meter.marker.dataset.overflow = current.direction;
    else delete meter.marker.dataset.overflow;
  }

  meter.band.hidden = !hasRange;
  meter.range.hidden = !hasRange;
  if (hasRange) {
    meter.band.style.setProperty('--pitch-range-start', scalePosition(minCents));
    meter.band.style.setProperty('--pitch-range-end', scalePosition(maxCents));
    text(meter.range, `Range ${rangeLabel}`);
  }

  const spokenSung = sungName ? `Sung pitch ${sungName}` : 'Sung pitch';
  const spokenRange = rangeStart === rangeEnd
    ? spokenCents(rangeStart)
    : `${spokenCents(rangeStart)} to ${spokenCents(rangeEnd)}`;
  const label = live ? `Live pitch meter. ${targetLabel}. Sing and hold one note.` : [
    `${targetLabel}.`,
    current ? `${spokenSung} was ${current.spoken}.` : '',
    current?.outside ? 'Beyond the displayed scale.' : '',
    hasRange ? `Pitch range ${spokenRange}.` : '',
  ].filter(Boolean).join(' ');
  if (meter.figure.getAttribute('aria-label') !== label) meter.figure.setAttribute('aria-label', label);
  container.hidden = false;
}
