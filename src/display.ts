import {useEffect, useState} from 'react';

/** Design size of one HUD pane; the glasses show exactly one at 1:1. */
export const PANE = 600;
const GAP = 10;
/** Below this scale a second pane is too small to read, so only one is shown. */
const MIN_DUAL_SCALE = 0.6;
/** Shortest side, in CSS px, of an unfolded book-style phone. */
const UNFOLDED_MIN = 560;

export type Display = {
  /** glasses: fixed 600 px canvas. phone: one touch screen. duo: an unfolded iPhone Duo. */
  mode: 'glasses' | 'phone' | 'duo';
  touch: boolean;
  /** Room for two panes at once. */
  dual: boolean;
  /** Panes stack top to bottom rather than side by side. */
  vertical: boolean;
  scale: number;
};

const GLASSES: Display = {mode: 'glasses', touch: false, dual: false, vertical: false, scale: 1};

function forced(): string | null {
  try {
    return new URLSearchParams(location.search).get('mode');
  } catch {
    return null;
  }
}

function measure(probe: HTMLElement | null): Display {
  const override = forced();
  const width = probe?.clientWidth || innerWidth;
  const height = probe?.clientHeight || innerHeight;
  const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  // The glasses report a 600 px square viewport; anything else with a touch screen is a phone.
  const isGlasses = override === 'glasses' || (override === null && (!touch || (innerWidth === PANE && innerHeight === PANE)));
  if (isGlasses) return GLASSES;

  const vertical = height >= width;
  const single = Math.min(width, height) / PANE;
  const dualScale = vertical
    ? Math.min(width / PANE, (height - GAP) / (2 * PANE))
    : Math.min((width - GAP) / (2 * PANE), height / PANE);
  const dual = dualScale >= MIN_DUAL_SCALE;
  const unfolded = Math.min(width, height) >= UNFOLDED_MIN;
  const iphone = /iPhone/.test(navigator.userAgent);
  const mode = override === 'duo' || (override === null && iphone && unfolded) ? 'duo' : 'phone';
  return {mode, touch: true, dual, vertical, scale: dual ? dualScale : single};
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
        current.mode === next.mode && current.dual === next.dual && current.vertical === next.vertical && current.scale === next.scale
          ? current
          : next,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(probe);
    window.addEventListener('orientationchange', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', update);
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
