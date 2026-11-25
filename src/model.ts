import type {LiveSet, Park} from './api';
import type {Geo} from './sensors';
import {distanceM} from './geo';

export type Sort = 'wait' | 'near' | 'name';
export const SORTS: Sort[] = ['wait', 'near', 'name'];
export const SORT_LABEL: Record<Sort, string> = {
  wait: 'SHORTEST WAIT',
  near: 'NEAREST',
  name: 'A TO Z',
};

export type Row = {
  id: string;
  name: string;
  status: string;
  wait: number | null;
  lat: number | null;
  lon: number | null;
  distance: number | null;
};

export type Level = 'low' | 'mid' | 'high' | 'off';

export function level(row: Pick<Row, 'status' | 'wait'>): Level {
  if (row.status !== 'OPERATING') return 'off';
  if (row.wait === null) return 'low';
  if (row.wait <= 20) return 'low';
  if (row.wait <= 45) return 'mid';
  return 'high';
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'OPERATING':
      return 'OPEN';
    case 'DOWN':
      return 'DOWN';
    case 'REFURBISHMENT':
      return 'REFURB';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'NO DATA';
  }
}

const rank = (row: Row) =>
  row.status === 'OPERATING' ? (row.wait === null ? 1 : 0) : row.status === 'DOWN' ? 2 : 3;

export function buildRows(park: Park, live: LiveSet | null, geo: Geo, sort: Sort): Row[] {
  if (!live) return [];
  const places = new Map(park.attractions.map(a => [a.id, a]));
  const rows: Row[] = live.entries.map(entry => {
    const place = places.get(entry.id);
    const lat = place?.lat ?? null;
    const lon = place?.lon ?? null;
    const distance =
      geo.lat !== null && geo.lon !== null && lat !== null && lon !== null
        ? distanceM(geo.lat, geo.lon, lat, lon)
        : null;
    return {id: entry.id, name: entry.name, status: entry.status, wait: entry.wait, lat, lon, distance};
  });
  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
  if (sort === 'name') return rows.sort(byName);
  if (sort === 'near') {
    return rows.sort(
      (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || byName(a, b),
    );
  }
  return rows.sort(
    (a, b) => rank(a) - rank(b) || (a.wait ?? 0) - (b.wait ?? 0) || byName(a, b),
  );
}

export function ageLabel(fetchedAt: number, now: number, stale = false): string {
  const minutes = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (minutes < 1) return stale ? 'CACHED' : 'LIVE';
  if (minutes < 60) return `${minutes}M OLD`;
  return `${Math.floor(minutes / 60)}H OLD`;
}
