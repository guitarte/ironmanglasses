import {distanceM, walkMinutes} from './geo';
import type {Origin, Row} from './model';

// Headline rides are worth a longer wait; walk-through exhibits and transport are not what
// someone asking "what next?" usually means, so they only surface when little else is open.
const MARQUEE =
  /space mountain|indiana jones|rise of the resistance|smugglers run|matterhorn|big thunder|haunted mansion|pirates of the caribbean|tiana|runaway railway|peter pan|star tours|jungle cruise|radiator springs|guardians of the galaxy|web slingers|incredicoaster|soarin|toy story|grizzly river/i;
const MINOR =
  /cinema|vehicles|gallery|opera house|lincoln|fortune tellers|railroad|monorail|treehouse|walkthrough|shootin|magical life|bakery tour|games of|animation academy|sorcerer|turtle talk|redwood creek|tom sawyer|duck pond|minnie.s house|how-to-play|film spotlight|tiki room/i;

export type Pick = {row: Row; walk: number; total: number; reason: string};

/**
 * Ranks open rides by time-to-ride (walk plus wait). A ride running well
 * below the highest wait seen today gets credit for half of that drop, so a
 * headliner on a dip can beat a walk-on that is always empty.
 */
export function bestMoves(rows: Row[], count: number, exclude: Set<string> = new Set()): Pick[] {
  return rows
    .filter(row => row.status === 'OPERATING' && row.wait !== null && !exclude.has(row.id))
    .map(row => {
      const walk = row.walk ?? 8;
      const drop = Math.max(0, (row.peak ?? row.wait!) - row.wait!);
      const appeal = MARQUEE.test(row.name) ? 22 : MINOR.test(row.name) ? -25 : 0;
      return {
        row,
        walk,
        total: walk + row.wait!,
        score: walk + row.wait! - drop * 0.5 - appeal,
        reason:
          drop >= 10
            ? `${drop} BELOW TODAY'S PEAK`
            : row.trend === 'down'
              ? 'WAIT FALLING'
              : row.wait! <= 10
                ? 'WALK-ON'
                : row.trend === 'up'
                  ? 'WAIT RISING'
                  : 'STEADY',
      };
    })
    .sort((a, b) => a.score - b.score || a.row.name.localeCompare(b.row.name))
    .slice(0, count)
    .map(({row, walk, total, reason}) => ({row, walk, total, reason}));
}

export type Leg = {row: Row; walk: number; wait: number};
export type Route = {legs: Leg[]; walk: number; wait: number; total: number};

/** Orders queued rides greedily: from each stop, go to whichever costs the least walk plus wait. */
export function planRoute(queued: Row[], origin: Origin): Route {
  const remaining = [...queued];
  const legs: Leg[] = [];
  let here = {lat: origin.lat, lon: origin.lon};
  while (remaining.length) {
    let bestIndex = 0;
    let bestCost = Infinity;
    let bestWalk = 0;
    remaining.forEach((row, index) => {
      const walk =
        row.lat !== null && row.lon !== null ? walkMinutes(distanceM(here.lat, here.lon, row.lat, row.lon)) : 8;
      const open = row.status === 'OPERATING';
      const cost = walk + (open ? row.wait ?? 0 : 240);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
        bestWalk = walk;
      }
    });
    const [row] = remaining.splice(bestIndex, 1);
    legs.push({row, walk: bestWalk, wait: row.status === 'OPERATING' ? row.wait ?? 0 : 0});
    if (row.lat !== null && row.lon !== null) here = {lat: row.lat, lon: row.lon};
  }
  const walk = legs.reduce((sum, leg) => sum + leg.walk, 0);
  const wait = legs.reduce((sum, leg) => sum + leg.wait, 0);
  return {legs, walk, wait, total: walk + wait};
}
