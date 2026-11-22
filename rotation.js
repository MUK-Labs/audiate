const browser = globalThis.window;
const hasTouch = browser?.navigator?.maxTouchPoints > 0
  || browser?.matchMedia?.('(any-pointer: coarse)')?.matches === true;

function screenRotation() {
  const orientation = browser.screen?.orientation;
  if (typeof orientation?.type === 'string' && orientation.addEventListener) {
    return {
      isLandscape: () => orientation.type.startsWith('landscape'),
      subscribe: update => orientation.addEventListener('change', update),
    };
  }

  // Older versions of iOS report the screen angle through window.orientation.
  if (Number.isFinite(browser.orientation) && browser.addEventListener) {
    return {
      isLandscape: () => Math.abs(browser.orientation % 180) === 90,
      subscribe: update => browser.addEventListener('orientationchange', update),
    };
  }

  const landscape = browser.matchMedia?.('(orientation: landscape)');
  if (landscape?.addEventListener || landscape?.addListener) {
    return {
      isLandscape: () => landscape.matches,
      subscribe: update => {
        if (landscape.addEventListener) landscape.addEventListener('change', update);
        else landscape.addListener(update);
      },
    };
  }

  return null;
}

const rotation = hasTouch ? screenRotation() : null;

export const phoneRotation = {
  available: Boolean(rotation),
  isLandscape() {
    return rotation?.isLandscape() ?? false;
  },
  subscribe(listener) {
    if (!rotation) return;
    let landscape = rotation.isLandscape();
    rotation.subscribe(() => {
      const current = rotation.isLandscape();
      if (current === landscape) return;
      landscape = current;
      listener(landscape);
    });
  },
};
