import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import type {Park} from '../api';
import {cardinal, formatDistance} from '../geo';
import {LAND_CODE} from '../lands';
import {level, statusLabel, type Level, type Origin, type Row} from '../model';
import type {Hologram, HoloLabel, HoloPoint, HoloState} from '../three/hologram';

type Props = {
  mode: 'radar' | 'map';
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  park: Park;
  /** Rides with a known position, nearest first. */
  blips: Row[];
  selected: number;
  heading: number | null;
  origin: Origin;
  /** Ride ids in mission order. */
  mission: string[];
  theme: string;
  onLock: (id: string) => void;
  /** Drawn instead when WebGL is unavailable. */
  fallback: ReactNode;
};

const RANGES_M = [120, 240, 480, 960, 1920];
const TONE: Record<Level, string> = {low: '#6dffb0', mid: '#ffb43a', high: '#ff6450', off: '#7f9aa6'};
const RAD = Math.PI / 180;
const MAP_UNITS = 104;
const WIDTH = 568;
const HEIGHT = 330;

const pillar = (row: Row) => (row.status === 'OPERATING' ? 4 + Math.min(row.wait ?? 0, 120) * 0.36 : 2);

/** A three.js view of the park: a tilted radar disc, or a map with a pillar per ride. */
export function Holo({mode, blips, selected, heading, origin, park, mission, theme, onFocusCursor, onLock, fallback}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const holo = useRef<Hologram | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = blips[selected] ?? null;

  const need = Math.max(current?.range ?? 0, blips[Math.floor((blips.length - 1) * 0.65)]?.range ?? 0);
  const range = RANGES_M.find(step => step >= need) ?? RANGES_M[RANGES_M.length - 1];

  // Metres east and south of the park centre, scaled so the farthest ride sits near the edge.
  const plan = useMemo(() => {
    const east = (lon: number) => (lon - park.lon) * Math.cos(park.lat * RAD) * 111320;
    const south = (lat: number) => -(lat - park.lat) * 110540;
    const reach = Math.max(200, ...blips.map(row => Math.hypot(east(row.lon!), south(row.lat!))));
    const scale = MAP_UNITS / reach;
    return {at: (lat: number, lon: number): [number, number] => [east(lon) * scale, south(lat) * scale]};
  }, [park, blips]);

  const state = useMemo<HoloState>(() => {
    const place = (row: Row): [number, number] => {
      if (mode === 'map') return plan.at(row.lat!, row.lon!);
      const reach = Math.min(1, row.range! / range) * 100;
      return [Math.sin(row.bearing! * RAD) * reach, -Math.cos(row.bearing! * RAD) * reach];
    };
    const points: HoloPoint[] = blips.map((row, index) => {
      const [x, z] = place(row);
      return {id: row.id, x, z, height: pillar(row), color: TONE[level(row)], selected: index === selected, dim: mode === 'radar' && row.range! > range};
    });
    const labels: HoloLabel[] = [];
    if (mode === 'map') {
      const lands = new Map<string, {x: number; z: number; count: number}>();
      blips.forEach((row, index) => {
        if (!row.land) return;
        const sum = lands.get(row.land) ?? {x: 0, z: 0, count: 0};
        sum.x += points[index].x;
        sum.z += points[index].z;
        sum.count += 1;
        lands.set(row.land, sum);
      });
      for (const [land, sum] of lands) {
        labels.push({key: `land-${land}`, text: LAND_CODE[land] ?? land, x: sum.x / sum.count, y: 0, z: sum.z / sum.count, className: 'is-land'});
      }
    } else {
      labels.push({key: 'north', text: 'N', x: 0, y: 0, z: -108, className: 'is-north'});
    }
    const chosen = points[selected];
    if (chosen && current) {
      labels.push({key: 'selected', text: current.name, x: chosen.x, y: Math.max(chosen.height + 14, 40), z: chosen.z, className: `is-selected tone-${level(current)}`});
    }
    const self = mode === 'map' ? plan.at(origin.lat, origin.lon) : ([0, 0] as [number, number]);
    const route: [number, number][] = [];
    const legs = mission.map(id => blips.findIndex(row => row.id === id)).filter(index => index >= 0);
    if (legs.length) {
      route.push(self);
      for (const index of legs) route.push([points[index].x, points[index].z]);
    }
    const style = getComputedStyle(document.documentElement);
    return {
      mode,
      points,
      labels,
      turn: (origin.remote ? 0 : heading ?? 0) * RAD,
      route,
      self,
      accent: style.getPropertyValue('--c').trim() || '#4fe3ff',
      dim: style.getPropertyValue('--c-dim').trim() || '#2aa6c4',
      motion: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  }, [mode, blips, selected, range, plan, heading, origin, mission, theme, current]);

  // three.js is loaded only when a 3D view is first opened, keeping it out of the first load.
  useEffect(() => {
    let live = true;
    import('../three/hologram').then(
      module => {
        if (!live || !canvas.current || !layer.current) return;
        try {
          holo.current = module.createHologram(canvas.current, layer.current);
          holo.current.resize(WIDTH, HEIGHT);
          setReady(true);
        } catch {
          setFailed(true);
        }
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      holo.current?.dispose();
      holo.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) holo.current?.update(state);
  }, [ready, state]);

  if (failed) return <>{fallback}</>;

  const d = current?.range != null ? formatDistance(current.range) : null;
  const wait = current ? (current.status === 'OPERATING' ? (current.wait !== null ? `${current.wait} MIN` : 'OPEN') : statusLabel(current.status)) : '';
  return (
    <div className="holo">
      <div className="holo-view" style={{width: WIDTH, height: HEIGHT}}>
        <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-hidden="true" />
        <div ref={layer} className="holo-labels" aria-hidden="true" />
        {ready ? null : <p className="holo-loading pulse">CHARGING PROJECTOR</p>}
      </div>
      <button
        type="button"
        className={`sight-contact ${current ? `tone-${level(current)}` : ''}`}
        data-cursor="1"
        onFocus={() => onFocusCursor(1)}
        onClick={() => current && onLock(current.id)}
      >
        {current ? (
          <>
            <span className="sight-name">{current.name}</span>
            <span className="sight-wait">
              {wait}
              {d ? `  /  ${d.value} ${d.unit} ${cardinal(current.bearing!)}` : ''}
            </span>
          </>
        ) : (
          <span className="sight-none">NO CONTACTS</span>
        )}
      </button>
      <p className="eyebrow sight-note">
        {mode === 'map'
          ? `HEIGHT IS WAIT TIME${mission.length ? '  /  AMBER LINE IS YOUR MISSION' : ''}`
          : `${origin.remote ? 'REMOTE VIEW FROM GATE' : heading === null ? 'NORTH UP' : 'HEADING UP'}  /  RING ${formatDistance(range).value} ${formatDistance(range).unit}`}
      </p>
    </div>
  );
}
