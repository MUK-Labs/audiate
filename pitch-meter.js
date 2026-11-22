const LIMIT_CENTS = 100;
const IN_TUNE_CENTS = 35;
const GRADUATIONS = [-100, -50, 0, 50, 100];

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

export function renderPitchMeter(container, measurement) {
  if (!Number.isFinite(measurement?.cents)) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }

  const { cents, targetName, sungName } = measurement;
  const distance = Math.round(Math.abs(cents));
  const direction = cents < 0 ? 'flat' : 'sharp';
  const outside = Math.abs(cents) > LIMIT_CENTS;
  const result = distance <= IN_TUNE_CENTS ? 'In tune · ' : '';
  const error = distance === 0 ? '0¢ · On target' : `${result}${distance}¢ ${direction}`;
  const spokenError = distance === 0
    ? 'matched the target'
    : `was ${distance} ${distance === 1 ? 'cent' : 'cents'} ${direction} of the target`;

  const meter = element('figure', 'pitch-meter');
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label',
    `Sung pitch ${sungName} ${spokenError} ${targetName}.${outside ? ' Beyond the displayed scale.' : ''}`);

  const summary = element('figcaption', 'pitch-meter__summary');
  summary.append(element('span', 'pitch-meter__sung', `Sung ${sungName}`));
  summary.append(element('strong', 'pitch-meter__error', error));
  summary.setAttribute('aria-hidden', 'true');

  const scale = element('div', 'pitch-meter__scale');
  scale.setAttribute('aria-hidden', 'true');
  scale.append(element('span', 'pitch-meter__target', `Target ${targetName}`));

  const axis = element('div', 'pitch-meter__axis');
  for (const value of GRADUATIONS) {
    const tick = element('span', 'pitch-meter__tick', scaleLabel(value));
    tick.style.setProperty('--pitch-position', scalePosition(value));
    if (value === 0) tick.classList.add('pitch-meter__tick--center');
    axis.append(tick);
  }

  const marker = element('span', 'pitch-meter__marker');
  marker.style.setProperty('--pitch-position', scalePosition(cents));
  if (outside) marker.dataset.overflow = direction;
  axis.append(marker);
  scale.append(axis);

  meter.append(summary, scale);
  container.replaceChildren(meter);
  container.hidden = false;
}
