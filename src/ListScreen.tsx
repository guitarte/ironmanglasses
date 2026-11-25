import type {Park} from './api';
import {cardinal, bearingDeg, formatDistance} from './geo';
import {ageLabel, level, SORT_LABEL, statusLabel, type Row, type Sort} from './model';
import type {Geo} from './sensors';

export const PAGE_SIZE = 6;
/** Focus stops ahead of the rows: sort, then area. */
export const HEAD = 2;

type Props = {
  parks: Park[] | null;
  park: Park | null;
  rows: Row[];
  windowStart: number;
  cursor: number;
  sort: Sort;
  land: string | null;
  geo: Geo;
  loading: boolean;
  failed: boolean;
  showRetry: boolean;
  fetchedAt: number | null;
  now: number;
  onFocusCursor: (cursor: number) => void;
  onSort: () => void;
  onLand: () => void;
  onLock: (id: string) => void;
  onRetry: () => void;
};

function rowDetail(row: Row, geo: Geo, filtered: boolean): string {
  const parts = [statusLabel(row.status)];
  if (row.land && !filtered) parts.push(row.land);
  if (row.distance !== null && geo.lat !== null && geo.lon !== null && row.lat !== null && row.lon !== null) {
    const d = formatDistance(row.distance);
    parts.push(`${d.value} ${d.unit} ${cardinal(bearingDeg(geo.lat, geo.lon, row.lat, row.lon))}`);
  }
  return parts.join('  /  ');
}

function sortNote(sort: Sort, geo: Geo): string | null {
  if (sort !== 'near') return null;
  switch (geo.state) {
    case 'seeking':
      return 'LOCATING';
    case 'denied':
      return 'LOCATION DENIED';
    case 'unsupported':
      return 'NO LOCATION SENSOR';
    case 'error':
      return 'NO POSITION FIX';
    default:
      return null;
  }
}

export function ListScreen(props: Props) {
  const {parks, park, rows, windowStart, cursor, sort, geo, loading, failed, fetchedAt, now} = props;
  const shown = rows.slice(windowStart, windowStart + PAGE_SIZE);
  const note = sortNote(sort, geo);
  const status = failed
    ? fetchedAt
      ? `LINK LOST  /  ${ageLabel(fetchedAt, now, true)}`
      : 'LINK LOST'
    : fetchedAt
      ? ageLabel(fetchedAt, now)
      : 'SYNCING';

  return (
    <main className="hud list" data-testid="list-screen">
      <header className="top">
        <div className="top-main">
          <span className="eyebrow">PARK SCAN</span>
          <h1 className="park-name">{park ? park.name.toUpperCase() : 'STANDBY'}</h1>
        </div>
        <div className="top-side">
          <span className={`link ${failed ? 'is-bad' : loading ? 'is-busy' : ''}`}>{status}</span>
          <span className="pips" aria-hidden="true">
            {(parks ?? []).map(p => (
              <i key={p.id} className={p === park ? 'on' : ''} />
            ))}
          </span>
        </div>
      </header>

      <div className="controls">
        <button
          type="button"
          className="sort"
          data-cursor="0"
          onFocus={() => props.onFocusCursor(0)}
          onClick={props.onSort}
        >
          <span className="sort-key">SORT</span>
          <span className={`sort-value ${note ? 'is-note' : ''}`}>{note ?? SORT_LABEL[sort]}</span>
        </button>
        <button
          type="button"
          className="sort"
          data-cursor="1"
          onFocus={() => props.onFocusCursor(1)}
          onClick={props.onLand}
        >
          <span className="sort-key">AREA</span>
          <span className="sort-value">{props.land ?? 'ALL'}</span>
        </button>
      </div>

      <section className="rows" aria-label="Attractions">
        {shown.map((row, offset) => {
          const index = windowStart + offset;
          const tone = level(row);
          return (
            <button
              type="button"
              key={row.id}
              className={`row tone-${tone}`}
              data-cursor={index + HEAD}
              onFocus={() => props.onFocusCursor(index + HEAD)}
              onClick={() => props.onLock(row.id)}
            >
              <span className="row-text">
                <span className="row-name">{row.name}</span>
                <span className="row-detail">{rowDetail(row, geo, props.land !== null)}</span>
              </span>
              <span className="row-wait">
                {row.status === 'OPERATING' && row.wait !== null ? (
                  <>
                    <b>{row.wait}</b>
                    <small>MIN</small>
                  </>
                ) : (
                  <b className="dash">{row.status === 'OPERATING' ? 'OPEN' : '--'}</b>
                )}
              </span>
            </button>
          );
        })}
        {rows.length === 0 ? (
          <div className="empty">
            {props.showRetry ? (
              <>
                <p>NO DATA LINK</p>
                <p className="empty-sub">Wait times could not be reached.</p>
                <button type="button" className="action" data-cursor={HEAD} onClick={props.onRetry}>
                  RETRY
                </button>
              </>
            ) : loading ? (
              <p className="pulse">ACQUIRING WAIT TIMES</p>
            ) : (
              <>
                <p>NO ATTRACTIONS REPORTING</p>
                <p className="empty-sub">The park may be closed right now.</p>
              </>
            )}
          </div>
        ) : null}
      </section>

      <footer className="foot">
        <span>{rows.length ? `${String(Math.max(cursor - HEAD + 1, 1)).padStart(2, '0')} / ${rows.length}` : '-- / --'}</span>
        <span className="track" aria-hidden="true">
          {rows.length > PAGE_SIZE ? (
            <i
              style={{
                left: `${(windowStart / rows.length) * 100}%`,
                width: `${(PAGE_SIZE / rows.length) * 100}%`,
              }}
            />
          ) : null}
        </span>
        <span>◂ PARK ▸</span>
      </footer>
    </main>
  );
}
