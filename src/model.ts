import type {Hours, LiveSet, Park, Pass} from './api';
import {bearingDeg, distanceM, walkMinutes} from './geo';
import {trendFor, type Trend} from './history';
import {landIndex} from './lands';
import type {Geo} from './sensors';

export type Sort = 'wait' | 'near' | 'name';
export const SORTS: Sort[] = ['wait', 'near', 'name'];
export const SORT_LABEL: Record<Sort, string> = {wait: 'WAIT TIME', near: 'NEAREST', name: 'A TO Z'};

export type Row = {
  id: string;
  name: string;
  status: string;
  wait: number | null;
  /** Single rider queue, minutes. */
  single: number | null;
  pass: Pass | null;
  lat: number | null;
  lon: number | null;
  land: string | null;
  /** Metres from the wearer's actual position, when known. */
  distance: number | null;
  /** Metres and bearing from the planning origin (wearer in the park, otherwise the main gate). */
  range: number | null;
  bearing: number | null;
  /** Estimated walking minutes from the planning origin. */
  walk: number | null;
  trend: Trend;
  delta: number;
  peak: number | null;
};

export type Level = 'low' | 'mid' | 'high' | 'off';

export function level(row: Pick<Row, 'status' | 'wait'>): Level {
  if (row.status !== 'OPERATING') return 'off';
  if (row.wait === null || row.wait <= 20) return 'low';
  return row.wait <= 45 ? 'mid' : 'high';
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'OPERATING':
      return 'OPEN';
    case 'DOWN':
      return 'DOWN';
    case 'REFURBISHMENT':
      return 'REFURB';
    case 'PIN':
      return 'YOUR PIN';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'NO DATA';
  }
}

const GATES: Record<string, [number, number]> = {
  DL: [33.80985, -117.91899],
  DCA: [33.80878, -117.91899],
};
const IN_PARK_M = 1500;

export type Origin = {lat: number; lon: number; remote: boolean};

/** Where walking estimates start: the wearer when inside the resort, otherwise the park gate. */
export function originFor(park: Park, geo: Geo): Origin {
  if (
    geo.state === 'ok' &&
    geo.lat !== null &&
    geo.lon !== null &&
    distanceM(geo.lat, geo.lon, park.lat, park.lon) <= IN_PARK_M
  ) {
    return {lat: geo.lat, lon: geo.lon, remote: false};
  }
  const [lat, lon] = GATES[park.key] ?? [park.lat, park.lon];
  return {lat, lon, remote: true};
}

export function buildRows(park: Park, live: LiveSet | null, geo: Geo, origin: Origin, now: number): Row[] {
  if (!live) return [];
  const lands = landIndex(park);
  const places = new Map(park.attractions.map(a => [a.id, a]));
  return live.entries.map(entry => {
    const place = places.get(entry.id);
    const lat = place?.lat ?? null;
    const lon = place?.lon ?? null;
    const located = lat !== null && lon !== null;
    const range = located ? distanceM(origin.lat, origin.lon, lat, lon) : null;
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      wait: entry.wait,
      single: entry.single ?? null,
      pass: entry.pass ?? null,
      lat,
      lon,
      land: lands.of(entry.id, entry.name),
      distance:
        located && geo.lat !== null && geo.lon !== null ? distanceM(geo.lat, geo.lon, lat, lon) : null,
      range,
      bearing: located ? bearingDeg(origin.lat, origin.lon, lat, lon) : null,
      walk: range !== null ? walkMinutes(range) : null,
      ...trendFor(park.id, entry.id, entry.status === 'OPERATING' ? entry.wait : null, now),
    };
  });
}

const rank = (row: Row) =>
  row.status === 'OPERATING' ? (row.wait === null ? 1 : 0) : row.status === 'DOWN' ? 2 : 3;
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);

export function sortRows(rows: Row[], sort: Sort, land: string | null): Row[] {
  const list = land ? rows.filter(row => row.land === land) : [...rows];
  if (sort === 'name') return list.sort(byName);
  if (sort === 'near') {
    return list.sort((a, b) => (a.range ?? Infinity) - (b.range ?? Infinity) || byName(a, b));
  }
  return list.sort((a, b) => rank(a) - rank(b) || (a.wait ?? 0) - (b.wait ?? 0) || byName(a, b));
}

/** Lands that currently have at least one reporting ride, in walking order. */
export function landsPresent(park: Park, rows: Row[]): string[] {
  const seen = new Set(rows.map(row => row.land));
  return landIndex(park).order.filter(land => seen.has(land));
}

export type ParkStats = {
  open: number;
  down: number;
  closed: number;
  average: number | null;
  crowd: string;
  longest: Row | null;
  lands: {land: string; average: number}[];
};

export function parkStats(park: Park, rows: Row[]): ParkStats {
  const waits = rows.filter(row => row.status === 'OPERATING' && row.wait !== null);
  const mean = (list: Row[]) => Math.round(list.reduce((sum, row) => sum + (row.wait ?? 0), 0) / list.length);
  const average = waits.length ? mean(waits) : null;
  const lands = landsPresent(park, waits).map(land => ({
    land,
    average: mean(waits.filter(row => row.land === land)),
  }));
  return {
    open: rows.filter(row => row.status === 'OPERATING').length,
    down: rows.filter(row => row.status === 'DOWN').length,
    closed: rows.filter(row => row.status !== 'OPERATING' && row.status !== 'DOWN').length,
    average,
    crowd: average === null ? 'NO DATA' : average < 15 ? 'QUIET' : average < 28 ? 'MODERATE' : average < 42 ? 'BUSY' : 'PACKED',
    longest: waits.reduce<Row | null>((top, row) => (!top || (row.wait ?? 0) > (top.wait ?? 0) ? row : top), null),
    lands,
  };
}

export function ageLabel(fetchedAt: number, now: number, stale = false): string {
  const minutes = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (minutes < 1) return stale ? 'CACHED' : 'LIVE';
  if (minutes < 60) return `${minutes}M OLD`;
  return `${Math.floor(minutes / 60)}H OLD`;
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} MIN`;
  return `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, '0')}M`;
}

export function clock(time: number): string {
  return new Date(time).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

export function passLabel(pass: Pass | null): string | null {
  if (!pass) return null;
  if (pass.soldOut || pass.start === null) return 'LL GONE';
  return `LL ${clock(pass.start)}${pass.price ? ` ${pass.price}` : ''}`;
}

export type Show = {id: string; name: string; next: number; later: number[]; minutes: number};

/** Shows with a performance still to come, soonest first. */
export function upcomingShows(live: LiveSet | null, now: number): Show[] {
  return (live?.shows ?? [])
    .map(show => {
      const ahead = show.times.filter(time => time > now - 60000);
      return ahead.length
        ? {id: show.id, name: show.name, next: ahead[0], later: ahead.slice(1), minutes: Math.max(0, Math.round((ahead[0] - now) / 60000))}
        : null;
    })
    .filter((show): show is Show => show !== null)
    .sort((a, b) => a.next - b.next || a.name.localeCompare(b.name));
}

export function hoursLabel(hours: Hours | null, now: number): {head: string; detail: string; closing: boolean} | null {
  if (!hours) return null;
  if (now < hours.open)
    return {head: `OPENS ${clock(hours.open)}`, detail: `IN ${duration(Math.round((hours.open - now) / 60000))}`, closing: false};
  if (now >= hours.close) return {head: 'PARK CLOSED', detail: `SINCE ${clock(hours.close)}`, closing: true};
  const left = Math.round((hours.close - now) / 60000);
  return {head: `OPEN UNTIL ${clock(hours.close)}`, detail: `${duration(left)} LEFT`, closing: left <= 60};
}

export type Pin = {lat: number; lon: number; at: number};
export const PIN_ID = 'pin';

/** A dropped waypoint dressed as a ride, so the radar, sight, map and target views can show it. */
export function pinRow(pin: Pin, geo: Geo, origin: Origin): Row {
  const range = distanceM(origin.lat, origin.lon, pin.lat, pin.lon);
  return {
    id: PIN_ID,
    name: 'My Pin',
    status: 'PIN',
    wait: null,
    single: null,
    pass: null,
    lat: pin.lat,
    lon: pin.lon,
    land: `DROPPED ${clock(pin.at)}`,
    distance: geo.lat !== null && geo.lon !== null ? distanceM(geo.lat, geo.lon, pin.lat, pin.lon) : null,
    range,
    bearing: bearingDeg(origin.lat, origin.lon, pin.lat, pin.lon),
    walk: walkMinutes(range),
    trend: null,
    delta: 0,
    peak: null,
  };
}

/** Short news items for the footer ticker: what changed, what is down, what is next. */
export function headlines(rows: Row[], shows: Show[], hours: {head: string; detail: string} | null): string[] {
  const items: string[] = [];
  const open = rows.filter(row => row.status === 'OPERATING' && row.wait !== null);
  const falling = [...open].filter(row => row.trend === 'down').sort((a, b) => a.delta - b.delta)[0];
  const rising = [...open].filter(row => row.trend === 'up').sort((a, b) => b.delta - a.delta)[0];
  if (falling) items.push(`${falling.name} FALLING ${Math.abs(falling.delta)} MIN`);
  if (rising) items.push(`${rising.name} RISING ${rising.delta} MIN`);
  const longest = [...open].sort((a, b) => b.wait! - a.wait!)[0];
  if (longest) items.push(`LONGEST WAIT ${longest.name} ${longest.wait} MIN`);
  for (const row of rows.filter(row => row.status === 'DOWN').slice(0, 2)) items.push(`${row.name} IS DOWN`);
  if (shows[0]) items.push(`${shows[0].name} ${shows[0].minutes < 1 ? 'STARTING NOW' : `IN ${shows[0].minutes} MIN`}`);
  if (hours) items.push(`${hours.head}  ${hours.detail}`);
  return items;
}
