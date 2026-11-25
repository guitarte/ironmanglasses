import {useEffect, useState} from 'react';

/** Design size of one HUD pane; the glasses show exactly one at 1:1. */
export const PANE = 600;
const GAP = 10;
/** Shortest side, in CSS px, of an unfolded book-style phone. */
const UNFOLDED_MIN = 560;

export type Display = {
  /** glasses: fixed 600 px canvas. phone: one touch screen. duo: an unfolded iPhone Duo. */
  mode: 'glasses' | 'phone' | 'duo';
  touch: boolean;
  /**
   * single: one pane. deck: one pane as large as it will go, with the rest of the screen
   * filled by a deck. dual: two panes, one on each half of a screen that is partly folded.
   */
  layout: 'single' | 'deck' | 'dual';
  /** Panes stack top to bottom rather than side by side. */
  vertical: boolean;
  scale: number;
  /** Deck size in design pixels, when there is one. */
  deckWidth: number;
  deckHeight: number;
};

const GLASSES: Display = {mode: 'glasses', touch: false, layout: 'single', vertical: false, scale: 1, deckWidth: 0, deckHeight: 0};
/** Thinnest deck worth drawing, in design pixels. */
const MIN_DECK = 150;

function forced(): string | null {
  try {
    return new URLSearchParams(location.search).get('mode');
  } catch {
    return null;
  }
}

/** A foldable held half open reports its screen as two segments either side of the hinge. */
function halfFolded(): 'side' | 'stack' | null {
  try {
    const override = new URLSearchParams(location.search).get('fold');
    if (override === 'side' || override === 'stack') return override;
  } catch {
    /* no query string */
  }
  if (matchMedia('(horizontal-viewport-segments: 2)').matches) return 'side';
  if (matchMedia('(vertical-viewport-segments: 2)').matches) return 'stack';
  return null;
}

function measure(probe: HTMLElement | null): Display {
  const override = forced();
  const width = probe?.clientWidth || innerWidth;
  const height = probe?.clientHeight || innerHeight;
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  // The glasses report a 600 px square viewport; anything else with a touch screen is a phone.
  const isGlasses = override === 'glasses' || (override === null && (!touch || (innerWidth === PANE && innerHeight === PANE)));
  if (isGlasses) return GLASSES;

  const unfolded = Math.min(width, height) >= UNFOLDED_MIN;
  const iphone = /iPhone/.test(navigator.userAgent);
  const mode = override === 'duo' || (override === null && iphone && unfolded) ? 'duo' : 'phone';
  const base = {mode, touch: true, deckWidth: 0, deckHeight: 0} as const;

  // Half open: one pane on each half, so nothing straddles the hinge.
  const fold = halfFolded();
  if (fold) {
    const vertical = fold === 'stack';
    const scale = vertical
      ? Math.min(width / PANE, (height - GAP) / (2 * PANE))
      : Math.min((width - GAP) / (2 * PANE), height / PANE);
    return {...base, layout: 'dual', vertical, scale};
  }

  // Otherwise the main pane takes the full short side and a deck takes everything left over.
  const vertical = height >= width;
  const scale = Math.min(width, height) / PANE;
  const spare = Math.floor((Math.abs(height - width) - GAP) / scale);
  if (spare < MIN_DECK) return {...base, layout: 'single', vertical, scale};
  return {...base, layout: 'deck', vertical, scale, deckWidth: vertical ? PANE : spare, deckHeight: vertical ? spare : PANE};
}

/**
 * Works out what the app is running on and how many HUD panes fit. Re-measures on
 * resize and rotation, which is also what a folding phone fires when it opens or closes.
 */
export function useDisplay(): Display {
  const [display, setDisplay] = useState<Display>(() => measure(null));

  useEffect(() => {
    // Measures the viewport minus the notch and home-indicator insets.
    const probe = document.createElement('div');
    probe.className = 'safe-probe';
    document.body.appendChild(probe);
    const update = () => {
      const next = measure(probe);
      setDisplay(current =>
        current.mode === next.mode &&
        current.layout === next.layout &&
        current.vertical === next.vertical &&
        current.scale === next.scale &&
        current.deckWidth === next.deckWidth &&
        current.deckHeight === next.deckHeight
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(probe);
    window.addEventListener('orientationchange', update);
    const folds = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)'].map(query => matchMedia(query));
    folds.forEach(query => query.addEventListener('change', update));
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', update);
      folds.forEach(query => query.removeEventListener('change', update));
      probe.remove();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.display = display.mode;
  }, [display.mode]);

  return display;
}

const STEP_PX = 44;
const SWIPE_PX = 60;

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
}

/**
 * Touch stands in for the glasses' D-pad: a sideways swipe is left/right, and a vertical
 * drag sends one up/down step for every STEP_PX travelled so lists scroll under the finger.
 */
export function useTouchPad(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let axis: 'x' | 'y' | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      axis = null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis) event.preventDefault();
      if (axis !== 'y') return;
      while (touch.clientY - lastY <= -STEP_PX) {
        press('ArrowDown');
        lastY -= STEP_PX;
      }
      while (touch.clientY - lastY >= STEP_PX) {
        press('ArrowUp');
        lastY += STEP_PX;
      }
    };
    const onEnd = (event: TouchEvent) => {
      if (axis !== 'x') return;
      const dx = event.changedTouches[0].clientX - startX;
      if (Math.abs(dx) >= SWIPE_PX) press(dx < 0 ? 'ArrowRight' : 'ArrowLeft');
    };
    document.addEventListener('touchstart', onStart, {passive: true});
    document.addEventListener('touchmove', onMove, {passive: false});
    document.addEventListener('touchend', onEnd, {passive: true});
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [active]);
}
