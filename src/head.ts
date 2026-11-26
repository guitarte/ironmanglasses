import {useEffect, useRef} from 'react';
import {angleDelta, lookHeading} from './geo';

export type HeadGesture = 'flick-left' | 'flick-right' | 'nod';

type Sample = {time: number; heading: number; pitch: number};

const WINDOW_MS = 900;
const SETTLE_MS = 220;
const FLICK_DEG = 22;
const NOD_DEG = 14;
const RETURN_DEG = 8;
const STILL_DEG = 7;
const COOLDOWN_MS = 1100;
const RAD = Math.PI / 180;

/**
 * Finds a deliberate head gesture in the last second of motion: the head starts still,
 * swings out past a threshold and comes straight back. Walking and looking around do
 * not match, because they do not return to where they started within the window.
 */
export function detectGesture(samples: Sample[]): HeadGesture | null {
  if (samples.length < 6) return null;
  const now = samples[samples.length - 1];
  const first = samples[0];
  if (now.time - first.time < WINDOW_MS * 0.6) return null;
  // The head has to be still at the start, so a slow pan is never read as a flick.
  const opening = samples.filter(sample => sample.time - first.time <= SETTLE_MS);
  if (opening.some(sample => Math.abs(angleDelta(sample.heading, first.heading)) > STILL_DEG || Math.abs(sample.pitch - first.pitch) > STILL_DEG)) return null;

  let turn = 0;
  let dip = 0;
  for (const sample of samples) {
    const yaw = angleDelta(sample.heading, first.heading);
    if (Math.abs(yaw) > Math.abs(turn)) turn = yaw;
    dip = Math.min(dip, sample.pitch - first.pitch);
  }
  const yawBack = Math.abs(angleDelta(now.heading, first.heading)) <= RETURN_DEG;
  const pitchBack = Math.abs(now.pitch - first.pitch) <= RETURN_DEG;
  if (!yawBack || !pitchBack) return null;
  if (Math.abs(turn) >= FLICK_DEG && Math.abs(dip) < NOD_DEG) return turn > 0 ? 'flick-right' : 'flick-left';
  if (dip <= -NOD_DEG && Math.abs(turn) < FLICK_DEG * 0.6) return 'nod';
  return null;
}

/**
 * Hands-free control for a head-worn display: a quick head flick to either side, or a nod.
 * Only listens while `active`.
 */
export function useHeadGestures(active: boolean, onGesture: (gesture: HeadGesture) => void) {
  const handler = useRef(onGesture);
  handler.current = onGesture;

  useEffect(() => {
    if (!active) return;
    let samples: Sample[] = [];
    let quietUntil = 0;
    const onOrientation = (event: Event) => {
      const e = event as DeviceOrientationEvent & {webkitCompassHeading?: number};
      // Any consistent yaw reference works here, so relative alpha is fine too.
      const alpha = typeof e.webkitCompassHeading === 'number' ? 360 - e.webkitCompassHeading : e.alpha;
      if (typeof alpha !== 'number' || typeof e.beta !== 'number') return;
      const gamma = e.gamma ?? 0;
      const time = performance.now();
      // Elevation of the line of sight: how far the back of the display points above the horizon.
      const pitch = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * RAD) * Math.cos(gamma * RAD)))) / RAD;
      samples.push({time, heading: lookHeading(alpha, e.beta, gamma), pitch});
      while (samples.length && time - samples[0].time > WINDOW_MS) samples.shift();
      if (time < quietUntil) return;
      const gesture = detectGesture(samples);
      if (!gesture) return;
      quietUntil = time + COOLDOWN_MS;
      samples = [];
      handler.current(gesture);
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [active]);
}
