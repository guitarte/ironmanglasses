import {Count} from '../Count';
import type {AlertRule} from '../App';
import {cardinal, formatDistance} from '../geo';
import {level, SORT_LABEL, statusLabel, type Row, type Sort, passLabel} from '../model';
import type {Geo} from '../sensors';

export const SCAN_PAGE = 6;
/** Focus stops ahead of the rows: park, sort, area. */
export const SCAN_HEAD = 3;

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  rows: Row[];
  start: number;
  sort: Sort;
  land: string | null;
  geo: Geo;
  located: boolean;
  remote: boolean;
  alerts: Record<string, AlertRule>;
  queue: string[];
  onSort: () => void;
  onLand: () => void;
  onLock: (id: string) => void;
};

function sortNote(sort: Sort, geo: Geo, located: boolean, remote: boolean): string | null {
  if (sort !== 'near') return null;
  if (!located) return 'NEAREST';
  switch (geo.state) {
    case 'seeking':
    case 'idle':
      return 'LOCATING';
    case 'denied':
      return 'GATE (NO GPS)';
    case 'unsupported':
    case 'error':
      return 'GATE (NO FIX)';
    default:
      return remote ? 'FROM GATE' : null;
  }
}

export function Scan(props: Props) {
  const {rows, start, sort, land, geo, alerts, queue} = props;
  const shown = rows.slice(start, start + SCAN_PAGE);
  const note = sortNote(sort, geo, props.located, props.remote);

  return (
    <div className="scan">
      <div className="controls">
        <button type="button" className="sort" data-cursor="1" onFocus={() => props.onFocusCursor(1)} onClick={props.onSort}>
          <span className="sort-key">SORT</span>
          <span className={`sort-value ${note && note !== 'NEAREST' ? 'is-note' : ''}`}>{note ?? SORT_LABEL[sort]}</span>
        </button>
        <button type="button" className="sort" data-cursor="2" onFocus={() => props.onFocusCursor(2)} onClick={props.onLand}>
          <span className="sort-key">AREA</span>
          <span className="sort-value">{land ?? 'ALL'}</span>
        </button>
      </div>

      <section className="rows" aria-label="Attractions">
        {shown.map((row, offset) => {
          const index = start + offset;
          const detail = [statusLabel(row.status)];
          if (sort === 'near' && row.range !== null && row.bearing !== null) {
            const d = formatDistance(row.range);
            detail.push(`${d.value} ${d.unit} ${cardinal(row.bearing)}`);
          } else if (row.land && !land) detail.push(row.land);
          const alert = alerts[row.id];
          const place = queue.indexOf(row.id);
          const pass = row.status === 'OPERATING' ? passLabel(row.pass) : null;
          return (
            <button
              type="button"
              key={row.id}
              className={`row tone-${level(row)}`}
              data-cursor={index + SCAN_HEAD}
              onFocus={() => props.onFocusCursor(index + SCAN_HEAD)}
              onClick={() => props.onLock(row.id)}
            >
              {row.status === 'OPERATING' && row.wait !== null ? (
                <i className="meter" style={{width: `${Math.min(row.wait, 90) / 90 * 100}%`}} aria-hidden="true" />
              ) : null}
              <span className="row-text">
                <span className="row-name">{row.name}</span>
                <span className="row-detail">
                  {detail.join('  /  ')}
                  {alert !== undefined ? <em className="tag tag-alert">{alert === 'open' ? 'ALERT' : `ALERT ${alert}`}</em> : null}
                  {place >= 0 ? <em className="tag">MISSION</em> : null}
                  {row.single !== null && row.status === 'OPERATING' ? <em className="tag">{`SINGLE ${row.single}`}</em> : null}
                  {pass ? <em className="tag">{pass}</em> : null}
                </span>
              </span>
              {row.trend === 'up' || row.trend === 'down' ? (
                <span className={`trend trend-${row.trend}`}>
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d={row.trend === 'up' ? 'M6 1l5 9H1z' : 'M6 11L1 2h10z'} />
                  </svg>
                  {Math.abs(row.delta)}
                </span>
              ) : null}
              <span className="row-wait">
                {row.status === 'OPERATING' && row.wait !== null ? (
                  <>
                    <b>
                      <Count value={row.wait} />
                    </b>
                    <small>MIN</small>
                  </>
                ) : (
                  <b className="dash">{row.status === 'OPERATING' ? 'OPEN' : '--'}</b>
                )}
              </span>
            </button>
          );
        })}
      </section>
    </div>
  );
}
