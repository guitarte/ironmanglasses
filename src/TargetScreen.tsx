import {useMemo} from 'react';
import type {Park} from './api';
import {angleDelta, bearingDeg, cardinal, formatDistance, walkMinutes} from './geo';
import {ageLabel, level, statusLabel, type Row} from './model';
import type {Geo} from './sensors';

type Props = {
  park: Park;
  row: Row;
  geo: Geo;
  heading: number | null;
  headingSource: string | null;
  fetchedAt: number | null;
  loading: boolean;
  failed: boolean;
  now: number;
  onRescan: () => void;
};

const ARRIVE_M = 35;

function geoMessage(geo: Geo, hasPlace: boolean): string | null {
  if (!hasPlace) return 'NO MAP POINT';
  switch (geo.state) {
    case 'ok':
      return null;
    case 'denied':
      return 'LOCATION DENIED';
    case 'unsupported':
      return 'NO LOCATION SENSOR';
    case 'error':
      return 'NO POSITION FIX';
    default:
      return 'LOCATING';
  }
}

export function TargetScreen({park, row, geo, heading, headingSource, fetchedAt, loading, failed, now, onRescan}: Props) {
  const hasPlace = row.lat !== null && row.lon !== null;
  const fix = geo.state === 'ok' && geo.lat !== null && geo.lon !== null && hasPlace;
  const bearing = fix ? bearingDeg(geo.lat!, geo.lon!, row.lat!, row.lon!) : null;
  const distance = fix ? row.distance : null;
  const arrived = distance !== null && distance <= ARRIVE_M;
  const relative = bearing !== null ? angleDelta(bearing, heading ?? 0) : null;
  const onCourse = relative !== null && heading !== null && Math.abs(relative) <= 12;
  const tone = level(row);
  const d = distance !== null ? formatDistance(distance) : null;
  const message = geoMessage(geo, hasPlace);

  const ticks = useMemo(
    () =>
      Array.from({length: 72}, (_, i) => {
        const major = i % 6 === 0;
        return <line key={i} x1="0" y1="-146" x2="0" y2={major ? -128 : -138} transform={`rotate(${i * 5})`} className={major ? 'major' : ''} />;
      }),
    [],
  );

  const turn =
    arrived
      ? 'TARGET REACHED'
      : relative === null
        ? message ?? 'LOCATING'
        : heading === null
          ? `HEAD ${cardinal(bearing!)}`
          : onCourse
            ? 'ON COURSE'
            : Math.abs(relative) > 150
              ? 'BEHIND YOU'
              : relative > 0
                ? 'BEAR RIGHT'
                : 'BEAR LEFT';

  return (
    <main className="hud target" data-testid="target-screen">
      <header className="top">
        <div className="top-main">
          <span className="eyebrow">TARGET LOCK  /  {park.key}</span>
          <h1 className="target-name">{row.name}</h1>
        </div>
      </header>

      <div className="scope">
        <aside className={`gauge tone-${tone}`}>
          <span className="eyebrow">WAIT</span>
          {row.status === 'OPERATING' && row.wait !== null ? (
            <>
              <b>{row.wait}</b>
              <small>MIN</small>
            </>
          ) : (
            <b className="dash">--</b>
          )}
          <span className="chip">{statusLabel(row.status)}</span>
        </aside>

        <div className={`reticle ${onCourse || arrived ? 'is-aligned' : ''}`}>
          <svg viewBox="-160 -160 320 320" aria-hidden="true">
            <g className="ring" transform={`rotate(${-(heading ?? 0)})`}>
              <circle r="146" />
              {ticks}
              <text y="-106">N</text>
              <text y="-106" transform="rotate(90)">E</text>
              <text y="-106" transform="rotate(180)">S</text>
              <text y="-106" transform="rotate(270)">W</text>
            </g>
            <circle className="inner" r="84" />
            <path className="notch" d="M0,-158 L9,-146 L-9,-146Z" />
            {relative !== null && !arrived ? (
              <g className="pointer" transform={`rotate(${relative})`}>
                <path d="M0,-124 L20,-88 L0,-98 L-20,-88Z" />
              </g>
            ) : null}
          </svg>
          <div className="readout">
            {d ? (
              <>
                <b>{d.value}</b>
                <small>{d.unit}</small>
              </>
            ) : (
              <b className="dash">--</b>
            )}
          </div>
        </div>

        <aside className="gauge">
          <span className="eyebrow">WALK</span>
          {distance !== null ? (
            <>
              <b>{walkMinutes(distance)}</b>
              <small>MIN EST</small>
            </>
          ) : (
            <b className="dash">--</b>
          )}
          <span className="chip">{bearing !== null ? `${cardinal(bearing)} ${Math.round(bearing)}` : 'NO FIX'}</span>
        </aside>
      </div>

      <p className={`turn ${onCourse || arrived ? 'is-aligned' : ''}`} role="status">
        {turn}
      </p>

      <footer className="foot target-foot">
        <span className="telemetry">
          {headingSource ?? 'NORTH UP'}
          {geo.accuracy !== null && geo.state === 'ok' ? `  /  GPS ${Math.round(geo.accuracy * 3.28084)} FT` : ''}
          {`  /  ${failed ? (fetchedAt ? `LINK LOST  /  ${ageLabel(fetchedAt, now, true)}` : 'LINK LOST') : fetchedAt ? ageLabel(fetchedAt, now) : 'SYNCING'}`}
        </span>
        <button type="button" className="action" data-target-action onClick={onRescan}>
          {loading ? 'SCANNING' : 'RESCAN'}
        </button>
      </footer>
    </main>
  );
}
