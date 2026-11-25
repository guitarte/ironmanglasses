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


/**
 * Compass heading, degrees clockwise from north, of the direction the wearer is looking,
 * from DeviceOrientation angles measured against true or magnetic north.
 *
 * `360 - alpha` is only the heading of the device's top edge, which is right for a phone
 * lying flat. A display held or worn upright has its top edge pointing at the sky, where
 * that reading is unstable and flips by 180 degrees as the tilt passes vertical. So once
 * the display is tilted up, this uses the direction out of the back of the screen instead.
 */
export function lookHeading(alpha: number, beta: number, gamma: number, screenAngle = 0): number {
  const a = alpha * RAD;
  const b = beta * RAD;
  const g = gamma * RAD;
  const cA = Math.cos(a);
  const sA = Math.sin(a);
  const cB = Math.cos(b);
  const sB = Math.sin(b);
  const cG = Math.cos(g);
  const sG = Math.sin(g);
  // How far the screen normal is from vertical: 1 when lying flat, 0 when upright.
  const flatness = Math.abs(cB * cG);
  let degrees: number;
  if (flatness < 0.75) {
    const east = -cA * sG - sA * sB * cG;
    const north = -sA * sG + cA * sB * cG;
    degrees = Math.atan2(east, north) / RAD;
  } else {
    degrees = -alpha + screenAngle;
  }
  return ((degrees % 360) + 360) % 360;
}
