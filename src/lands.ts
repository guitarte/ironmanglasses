import type {Park} from './api';
import {distanceM} from './geo';

/**
 * The wait-time source does not say which land a ride is in, so rides are
 * matched by name. Seasonal overlays rename rides ("Haunted Mansion Holiday"),
 * which is why these are keyword patterns rather than exact names. A ride
 * that matches nothing falls back to the land whose rides are closest to it.
 */
const RULES: Record<string, [land: string, pattern: RegExp][]> = {
  DL: [
    ['Toontown', /toontown|chip .n. dale|donald.s duck|goofy.s how|runaway railway|minnie.s house|roger rabbit/i],
    ['New Orleans Sq', /new orleans|haunted mansion|pirates of the caribbean/i],
    ['Tomorrowland', /tomorrowland|astro orbitor|autopia|buzz lightyear|monorail|finding nemo|pixar short|space mountain|star tours/i],
    ['Galaxy\'s Edge', /millennium falcon|rise of the resistance|galaxy.s edge/i],
    ['Bayou Country', /canoes|winnie the pooh|tiana/i],
    ['Frontierland', /frontierland|big thunder|mark twain|columbia|tom sawyer/i],
    ['Adventureland', /adventureland|indiana jones|jungle cruise|tiki room/i],
    ['Fantasyland', /fantasyland|small world|alice in wonderland|casey jr|dumbo|carrousel|mad tea|matterhorn|mr\. toad|peter pan|pinocchio|sleeping beauty|snow white|storybook/i],
    ['Main Street', /main street|disneyland railroad|fortune tellers|lincoln|opera house|disney gallery|magical life/i],
  ],
  DCA: [
    ['Avengers Campus', /guardians of the galaxy|web slingers|avengers/i],
    ['Cars Land', /luigi|mater.s|radiator springs/i],
    ['Pixar Pier', /pixar pier|incredicoaster|inside out|jessie.s|pal-a-round|toy story/i],
    ['Paradise Gardens', /golden zephyr|sky school|jellyfish|silly symphony|little mermaid/i],
    ['Grizzly Peak', /grizzly|redwood creek|soarin/i],
    ['San Fransokyo', /bakery tour|san fransokyo/i],
    ['Hollywood Land', /animation academy|sorcerer.s workshop|turtle talk|philharmagic|monsters, inc|hollywood/i],
  ],
};

function byName(parkKey: string, name: string): string | null {
  for (const [land, pattern] of RULES[parkKey] ?? []) if (pattern.test(name)) return land;
  return null;
}

export type LandIndex = {
  /** Lands in walking order, as listed in the rules. */
  order: string[];
  of: (id: string, name: string) => string | null;
};

const cache = new WeakMap<Park, LandIndex>();

export function landIndex(park: Park): LandIndex {
  const existing = cache.get(park);
  if (existing) return existing;

  const known = new Map<string, string>();
  const points = new Map<string, {lat: number; lon: number}[]>();
  for (const a of park.attractions) {
    const land = byName(park.key, a.name);
    if (!land) continue;
    known.set(a.id, land);
    if (a.lat !== null && a.lon !== null) {
      points.set(land, [...(points.get(land) ?? []), {lat: a.lat, lon: a.lon}]);
    }
  }
  // Unmatched rides with coordinates take the land of their nearest matched neighbour.
  for (const a of park.attractions) {
    if (known.has(a.id) || a.lat === null || a.lon === null) continue;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [land, list] of points) {
      for (const p of list) {
        const d = distanceM(a.lat, a.lon, p.lat, p.lon);
        if (d < bestDistance) {
          bestDistance = d;
          best = land;
        }
      }
    }
    if (best) known.set(a.id, best);
  }

  const index: LandIndex = {
    order: (RULES[park.key] ?? []).map(([land]) => land),
    of: (id, name) => known.get(id) ?? byName(park.key, name),
  };
  cache.set(park, index);
  return index;
}
