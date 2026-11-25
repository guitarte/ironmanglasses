import {useEffect} from 'react';
import type {Park} from './api';
import {ageLabel} from './model';

export const PAGES = ['overview', 'scan', 'radar', 'mission', 'system'] as const;
export type PageId = (typeof PAGES)[number];
export type DataState = 'loading' | 'failed' | 'empty' | 'ok';
export type BannerState = {text: string; tone: 'info' | 'alert'; key: number};

type HeaderProps = {
  page: PageId;
  parks: Park[] | null;
  park: Park | null;
  focused: boolean;
  loading: boolean;
  failed: boolean;
  fetchedAt: number | null;
  now: number;
  onFocus: () => void;
  onSwitch: () => void;
};

export function Header({page, parks, park, loading, failed, fetchedAt, now, onFocus, onSwitch}: HeaderProps) {
  const status = failed
    ? fetchedAt
      ? `LINK LOST  /  ${ageLabel(fetchedAt, now, true)}`
      : 'LINK LOST'
    : fetchedAt
      ? ageLabel(fetchedAt, now)
      : 'SYNCING';
  const clock = new Date(now).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  return (
    <header className="top">
      <nav className="tabs" aria-label="Views">
        {PAGES.map(id => (
          <span key={id} className={id === page ? 'on' : ''} aria-current={id === page ? 'page' : undefined}>
            {id}
          </span>
        ))}
      </nav>
      <div className="top-row">
        <button type="button" className="park" data-cursor="0" onFocus={onFocus} onClick={onSwitch} disabled={!parks}>
          <span className="park-name">{park ? park.name : 'Standby'}</span>
          <span className="park-swap" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 8h13l-4-4M20 16H7l4 4" />
            </svg>
          </span>
        </button>
        <div className="top-side">
          <span className={`link ${failed ? 'is-bad' : loading ? 'is-busy' : ''}`}>{status}</span>
          <span className="clock">{clock}</span>
        </div>
      </div>
    </header>
  );
}

export function Footer({text, track}: {text: string; track: {start: number; size: number} | null}) {
  return (
    <footer className="foot">
      <span>{text}</span>
      <span className="track" aria-hidden="true">
        {track ? <i style={{left: `${track.start * 100}%`, width: `${track.size * 100}%`}} /> : null}
      </span>
      <span>◂ VIEW ▸</span>
    </footer>
  );
}

export function StatePanel({state, onRetry}: {state: DataState; onRetry: () => void}) {
  return (
    <div className="empty">
      {state === 'failed' ? (
        <>
          <p>NO DATA LINK</p>
          <p className="empty-sub">Wait times could not be reached.</p>
          <button type="button" className="action" data-cursor="1" onClick={onRetry}>
            RETRY
          </button>
        </>
      ) : state === 'loading' ? (
        <>
          <svg className="spinner" viewBox="-40 -40 80 80" aria-hidden="true">
            <circle r="32" />
            <circle r="22" />
          </svg>
          <p className="pulse">ACQUIRING WAIT TIMES</p>
        </>
      ) : (
        <>
          <p>NO ATTRACTIONS REPORTING</p>
          <p className="empty-sub">The park may be closed right now.</p>
        </>
      )}
    </div>
  );
}

export function Banner({banner}: {banner: BannerState}) {
  return (
    <div key={banner.key} className={`banner tone-${banner.tone}`} role="status">
      <span className="banner-tag">{banner.tone === 'alert' ? 'ALERT' : 'CONFIRM'}</span>
      <span className="banner-text">{banner.text}</span>
    </div>
  );
}

const BOOT_MS = 1900;

/** Power-up sequence drawn over the app; any input skips it. */
export function Boot({onDone}: {onDone: () => void}) {
  useEffect(() => {
    const timer = setTimeout(onDone, BOOT_MS);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="boot-screen" aria-hidden="true">
      <svg viewBox="-150 -150 300 300">
        <circle className="boot-ring r1" r="132" pathLength="100" />
        <circle className="boot-ring r2" r="104" pathLength="100" />
        <circle className="boot-ring r3" r="74" pathLength="100" />
        <g className="boot-ticks">
          {Array.from({length: 36}, (_, i) => (
            <line key={i} x1="0" y1="-146" x2="0" y2={i % 3 ? -140 : -134} transform={`rotate(${i * 10})`} />
          ))}
        </g>
        <path className="boot-core" d="M0,-40 L34,20 L0,6 L-34,20Z" />
      </svg>
      <div className="boot-log">
        <span>POWER CELL .......... OK</span>
        <span>OPTICS .............. OK</span>
        <span>PARK DATA LINK ...... OK</span>
        <span>PARK HUD ONLINE</span>
      </div>
    </div>
  );
}
