import {useMemo} from 'react';
import type {Park} from './api';
import type {AlertRule} from './App';
import {angleDelta, bearingDeg, cardinal, formatDistance, walkMinutes} from './geo';
import {samplesFor} from './history';
import {ageLabel, level, statusLabel, type Row} from './model';
import type {Geo} from './sensors';

export const TARGET_ACTIONS = 3;
export const ALERT_STEPS = [60, 45, 30, 20, 10];

type Props = {
  park: Park;
  row: Row;
  geo: Geo;
  heading: number | null;
  headingSource: string | null;
  arrived: boolean;
  queued: boolean;
  alert: AlertRule | undefined;
  fetchedAt: number | null;
  loading: boolean;
  failed: boolean;
  now: number;
  onFocusAction: (index: number) => void;
  onQueue: () => void;
  onAlert: () => void;
  onRescan: () => void;
};

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

/** Wait history as a small line chart; needs at least two readings. */
function Sparkline({parkId, id}: {parkId: string; id: string}) {
  const samples = samplesFor(parkId, id);
  if (samples.length < 2) return <span className="spark-empty">TREND BUILDING</span>;
  const t0 = samples[0][0];
  const span = Math.max(1, samples[samples.length - 1][0] - t0);
  const top = Math.max(20, ...samples.map(s => s[1]));
  const points = samples.map(([t, wait]) => `${(((t - t0) / span) * 116 + 2).toFixed(1)},${(34 - (wait / top) * 30).toFixed(1)}`);
  const [lastX, lastY] = points[points.length - 1].split(',');
  return (
    <svg className="spark" viewBox="0 0 120 38" role="img" aria-label="Wait time trend">
      <polyline points={points.join(' ')} />
      <circle cx={lastX} cy={lastY} r="3" />
    </svg>
  );
}

export function TargetScreen(props: Props) {
  const {park, row, geo, heading, headingSource, arrived, fetchedAt, loading, failed, now} = props;
  const hasPlace = row.lat !== null && row.lon !== null;
  const fix = geo.state === 'ok' && geo.lat !== null && geo.lon !== null && hasPlace;
  const bearing = fix ? bearingDeg(geo.lat!, geo.lon!, row.lat!, row.lon!) : null;
  const distance = fix ? row.distance : null;
  const relative = bearing !== null ? angleDelta(bearing, heading ?? 0) : null;
  const onCourse = relative !== null && heading !== null && Math.abs(relative) <= 12;
  const tone = level(row);
  const d = distance !== null ? formatDistance(distance) : null;
  const message = geoMessage(geo, hasPlace);
  const aligned = onCourse || arrived;

  const ticks = useMemo(
    () =>
      Array.from({length: 72}, (_, i) => {
        const major = i % 6 === 0;
        return <line key={i} x1="0" y1="-136" x2="0" y2={major ? -120 : -129} transform={`rotate(${i * 5})`} className={major ? 'major' : ''} />;
      }),
    [],
  );

  const turn = arrived
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

  const trend =
    row.trend === 'up' ? `RISING ${row.delta}` : row.trend === 'down' ? `FALLING ${Math.abs(row.delta)}` : row.trend === 'flat' ? 'STEADY' : null;
  const alertLabel =
    props.alert === undefined ? 'ALERT OFF' : props.alert === 'open' ? 'ALERT: OPEN' : `ALERT ≤ ${props.alert}`;
  const actions: [label: string, on: boolean, action: () => void][] = [
    [props.queued ? 'IN MISSION' : 'MISSION +', props.queued, props.onQueue],
    [alertLabel, props.alert !== undefined, props.onAlert],
    [loading ? 'SCANNING' : 'RESCAN', false, props.onRescan],
  ];

  return (
    <main className="hud target" data-testid="target-screen">
      <header className="top target-top">
        <span className="eyebrow">TARGET LOCK  /  {row.land ?? park.key}</span>
        <h1 className="target-name">{row.name}</h1>
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
          <span className="chip">{trend ?? statusLabel(row.status)}</span>
          <Sparkline parkId={park.id} id={row.id} />
        </aside>

        <div className={`reticle ${aligned ? 'is-aligned' : ''}`}>
          <svg viewBox="-150 -150 300 300" aria-hidden="true">
            <g className="ring" transform={`rotate(${-(heading ?? 0)})`}>
              <circle r="136" />
              {ticks}
              <text y="-98">N</text>
              <text y="-98" transform="rotate(90)">E</text>
              <text y="-98" transform="rotate(180)">S</text>
              <text y="-98" transform="rotate(270)">W</text>
            </g>
            <circle className="inner" r="78" />
            <path className="notch" d="M0,-148 L9,-136 L-9,-136Z" />
            <path className="lock-brackets" d="M-58,-34V-58H-34M34,-58H58V-34M58,34V58H34M-34,58H-58V34" />
            {relative !== null && !arrived ? (
              <g className="pointer" transform={`rotate(${relative})`}>
                <path d="M0,-116 L19,-82 L0,-92 L-19,-82Z" />
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
          <span className="spark-empty">{row.peak !== null ? `PEAK ${row.peak}` : ''}</span>
        </aside>
      </div>

      <p className={`turn ${aligned ? 'is-aligned' : ''}`} role="status">
        {turn}
      </p>
      <p className="telemetry">
        {headingSource ?? 'NORTH UP'}
        {geo.accuracy !== null && geo.state === 'ok' ? `  /  GPS ${Math.round(geo.accuracy * 3.28084)} FT` : ''}
        {`  /  ${failed ? (fetchedAt ? `LINK LOST  /  ${ageLabel(fetchedAt, now, true)}` : 'LINK LOST') : fetchedAt ? ageLabel(fetchedAt, now) : 'SYNCING'}`}
      </p>

      <footer className="target-actions">
        {actions.map(([label, on, action], index) => (
          <button
            type="button"
            key={index}
            className={`action ${on ? 'is-on' : ''}`}
            data-target-action={index}
            onFocus={() => props.onFocusAction(index)}
            onClick={action}
          >
            {label}
          </button>
        ))}
      </footer>
    </main>
  );
}
