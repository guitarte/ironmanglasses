import {useEffect, useRef, useState} from 'react';

export function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

export type GeoState = 'idle' | 'seeking' | 'ok' | 'denied' | 'unsupported' | 'error';
export type Geo = {
  state: GeoState;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  course: number | null;
  speed: number | null;
};

const NO_GEO: Geo = {state: 'idle', lat: null, lon: null, accuracy: null, course: null, speed: null};

/** Watches position only while `active`; the watch is cleared when hidden or unused. */
export function useGeo(active: boolean): Geo {
  const [geo, setGeo] = useState<Geo>(NO_GEO);
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation) {
      setGeo({...NO_GEO, state: 'unsupported'});
      return;
    }
    setGeo(current => (current.state === 'ok' ? current : {...current, state: 'seeking'}));
    const id = navigator.geolocation.watchPosition(
      position => {
        const c = position.coords;
        setGeo({
          state: 'ok',
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy ?? null,
          course: typeof c.heading === 'number' && !Number.isNaN(c.heading) ? c.heading : null,
          speed: typeof c.speed === 'number' && !Number.isNaN(c.speed) ? c.speed : null,
        });
      },
      error => setGeo(current => ({...current, state: error.code === 1 ? 'denied' : 'error'})),
      {enableHighAccuracy: true, maximumAge: 5000, timeout: 20000},
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return geo;
}

export type OrientationPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** Must be called from a wearer action (pinch or Enter). */
export async function requestOrientation(): Promise<OrientationPermission> {
  const Orientation = (window as any).DeviceOrientationEvent;
  if (!Orientation) return 'unsupported';
  if (typeof Orientation.requestPermission === 'function') {
    try {
      return (await Orientation.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

const COMMIT_MS = 100;

/** Compass heading in degrees, or null until an absolute reading arrives. */
export function useCompass(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const smooth = useRef<number | null>(null);
  const lastCommit = useRef(0);

  useEffect(() => {
    if (!active) return;
    const onOrientation = (event: Event) => {
      const e = event as DeviceOrientationEvent & {webkitCompassHeading?: number};
      let raw: number | null = null;
      if (typeof e.webkitCompassHeading === 'number') raw = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === 'number') raw = (360 - e.alpha) % 360;
      if (raw === null || Number.isNaN(raw)) return;
      const previous = smooth.current;
      const next =
        previous === null ? raw : (previous + ((((raw - previous) % 360) + 540) % 360 - 180) * 0.25 + 360) % 360;
      smooth.current = next;
      const now = performance.now();
      if (now - lastCommit.current >= COMMIT_MS) {
        lastCommit.current = now;
        setHeading(Math.round(next));
      }
    };
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('deviceorientation', onOrientation);
      smooth.current = null;
      setHeading(null);
    };
  }, [active]);
  return heading;
}
