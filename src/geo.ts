const RAD = Math.PI / 180;
const EARTH_M = 6371000;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial compass bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * RAD) * Math.cos(lat2 * RAD);
  const x =
    Math.cos(lat1 * RAD) * Math.sin(lat2 * RAD) -
    Math.sin(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lon2 - lon1) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function formatDistance(m: number): {value: string; unit: string} {
  const feet = m * 3.28084;
  if (feet < 1000) return {value: String(Math.max(10, Math.round(feet / 10) * 10)), unit: 'FT'};
  const miles = m / 1609.344;
  return {value: miles < 10 ? miles.toFixed(1) : String(Math.round(miles)), unit: 'MI'};
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const cardinal = (deg: number): string => POINTS[Math.round(deg / 45) % 8];

/** Walking estimate: paths are not straight lines, so pad the distance by 30%. */
export const walkMinutes = (m: number): number => Math.max(1, Math.round((m * 1.3) / 80));

/** Signed smallest difference a - b in degrees, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}
