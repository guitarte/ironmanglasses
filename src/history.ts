import type {LiveEntry} from './api';
import {load, save} from './store';

/** [epoch minutes, wait minutes] */
export type Sample = [number, number];
type History = Record<string, Sample[]>;

const KEEP_MIN = 6 * 60;
const SPACING_MIN = 4;
const cache: Record<string, History> = {};

function historyFor(parkId: string): History {
  return (cache[parkId] ??= load<History>(`history.${parkId}`, {}));
}

/** Adds one reading per ride; called after each successful refresh. */
export function recordHistory(parkId: string, entries: LiveEntry[], now: number): void {
  const history = historyFor(parkId);
  const minute = Math.floor(now / 60000);
  for (const entry of entries) {
    if (entry.status !== 'OPERATING' || entry.wait === null) continue;
    const samples = (history[entry.id] ??= []);
    const last = samples[samples.length - 1];
    if (!last || minute - last[0] >= SPACING_MIN || last[1] !== entry.wait) {
      if (last && last[0] === minute) last[1] = entry.wait;
      else samples.push([minute, entry.wait]);
    }
  }
  for (const id of Object.keys(history)) {
    const kept = history[id].filter(sample => minute - sample[0] <= KEEP_MIN);
    if (kept.length) history[id] = kept;
    else delete history[id];
  }
  save(`history.${parkId}`, history);
}

export function clearHistory(): void {
  for (const parkId of Object.keys(cache)) {
    cache[parkId] = {};
    save(`history.${parkId}`, {});
  }
}

export function samplesFor(parkId: string, id: string): Sample[] {
  return historyFor(parkId)[id] ?? [];
}

export type Trend = 'up' | 'down' | 'flat' | null;

/**
 * Compares the current wait with the reading from roughly half an hour ago.
 * Returns null until there is at least 15 minutes of history for the ride.
 */
export function trendFor(
  parkId: string,
  id: string,
  wait: number | null,
  now: number,
): {trend: Trend; delta: number; peak: number | null} {
  const samples = samplesFor(parkId, id);
  const peak = samples.length ? Math.max(...samples.map(sample => sample[1])) : null;
  if (wait === null || !samples.length) return {trend: null, delta: 0, peak};
  const minute = Math.floor(now / 60000);
  let reference: Sample | null = null;
  for (const sample of samples) {
    const age = minute - sample[0];
    if (age >= 15 && age <= 75) reference = sample;
  }
  if (!reference) return {trend: null, delta: 0, peak};
  const delta = wait - reference[1];
  return {trend: delta >= 10 ? 'up' : delta <= -10 ? 'down' : 'flat', delta, peak};
}
