import type {Geo} from '../sensors';
import type {DataState} from '../Shell';
import {VOICE_EXAMPLES, voiceAvailable} from '../voice';

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  settings: {sound: boolean; location: boolean};
  geo: Geo;
  alertCount: number;
  dataState: DataState;
  onSound: () => void;
  onLocation: () => void;
  onClearAlerts: () => void;
  onResetTrends: () => void;
};

const GEO_LABEL: Record<Geo['state'], string> = {
  idle: 'STANDBY',
  seeking: 'LOCATING',
  ok: 'FIX',
  denied: 'DENIED',
  unsupported: 'NO SENSOR',
  error: 'NO FIX',
};

export function System(props: Props) {
  const {settings, geo, alertCount, onFocusCursor} = props;
  const toggles: [label: string, value: string, on: boolean, action: () => void][] = [
    ['SOUND', settings.sound ? 'ON' : 'OFF', settings.sound, props.onSound],
    ['LOCATION', settings.location ? GEO_LABEL[geo.state] : 'OFF', settings.location, props.onLocation],
    ['CLEAR ALERTS', String(alertCount), alertCount > 0, props.onClearAlerts],
    ['RESET TRENDS', 'RUN', false, props.onResetTrends],
  ];
  const voice = voiceAvailable();
  return (
    <div className="system">
      <div className="toggles">
        {toggles.map(([label, value, on, action], index) => (
          <button
            type="button"
            key={label}
            className={`toggle ${on ? 'is-on' : ''}`}
            data-cursor={index + 1}
            onFocus={() => onFocusCursor(index + 1)}
            onClick={action}
          >
            <span className="sort-key">{label}</span>
            <span className="toggle-value">{value}</span>
          </button>
        ))}
      </div>
      <section className="voice" aria-label="Voice commands">
        <span className="eyebrow">{`VOICE LINK  /  ${voice ? 'ACTIVE' : 'NOT ENABLED ON THIS DEVICE'}`}</span>
        <p className="hint">Ask Meta AI while this app is open:</p>
        <ul>
          {VOICE_EXAMPLES.map(example => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      </section>
      <p className="diag">
        {`GPS ${settings.location ? GEO_LABEL[geo.state] : 'OFF'}`}
        {geo.state === 'ok' && geo.accuracy !== null ? ` ${Math.round(geo.accuracy * 3.28084)} FT` : ''}
        {`  /  DATA ${props.dataState === 'ok' ? 'LIVE' : props.dataState.toUpperCase()}  /  REFRESH 30 S`}
      </p>
      <p className="credit">Wait times by ThemeParks.wiki. Unofficial fan project.</p>
    </div>
  );
}
