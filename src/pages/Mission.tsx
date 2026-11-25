import type {Route} from '../advisor';
import {duration, level, statusLabel} from '../model';

export const MISSION_PAGE = 4;

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  route: Route;
  start: number;
  remote: boolean;
  canAutoPlan: boolean;
  onLock: (id: string) => void;
  onAutoPlan: () => void;
  onClear: () => void;
};

export function Mission({route, start, remote, canAutoPlan, onFocusCursor, onLock, onAutoPlan, onClear}: Props) {
  const count = route.legs.length;
  if (!count) {
    return (
      <div className="empty">
        <svg className="mission-art" viewBox="0 0 200 70" aria-hidden="true">
          <path d="M14,52 C50,8 84,62 112,30 S168,18 186,40" />
          <circle cx="14" cy="52" r="6" />
          <circle cx="112" cy="30" r="6" />
          <circle cx="186" cy="40" r="6" />
        </svg>
        <p>NO OBJECTIVES</p>
        <p className="empty-sub">Lock a ride and pinch MISSION to add it, or let the advisor plan one.</p>
        {canAutoPlan ? (
          <button type="button" className="action" data-cursor="1" onFocus={() => onFocusCursor(1)} onClick={onAutoPlan}>
            AUTO-PLAN TOP 3
          </button>
        ) : null}
      </div>
    );
  }

  const shown = route.legs.slice(start, start + MISSION_PAGE);
  const clearCursor = count + 1;
  return (
    <div className="mission">
      <div className="mission-sum">
        <div>
          <span className="eyebrow">TOTAL</span>
          <b>{duration(route.total)}</b>
        </div>
        <div>
          <span className="eyebrow">WALK</span>
          <b>{route.walk} MIN</b>
        </div>
        <div>
          <span className="eyebrow">QUEUE</span>
          <b>{route.wait} MIN</b>
        </div>
      </div>
      <span className="eyebrow">{`ROUTE ORDER  /  ${remote ? 'FROM MAIN GATE' : 'FROM YOUR POSITION'}`}</span>
      <section className="legs" aria-label="Mission route">
        {shown.map((leg, offset) => {
          const index = start + offset;
          const open = leg.row.status === 'OPERATING';
          return (
            <button
              type="button"
              key={leg.row.id}
              className={`row leg tone-${level(leg.row)}`}
              data-cursor={index + 1}
              onFocus={() => onFocusCursor(index + 1)}
              onClick={() => onLock(leg.row.id)}
            >
              <span className="leg-node">{index + 1}</span>
              <span className="row-text">
                <span className="row-name">{leg.row.name}</span>
                <span className="row-detail">
                  {`WALK ${leg.walk} MIN  /  ${open ? (leg.row.land ?? 'OPEN') : statusLabel(leg.row.status)}`}
                </span>
              </span>
              <span className="row-wait">
                {open && leg.row.wait !== null ? (
                  <>
                    <b>{leg.row.wait}</b>
                    <small>MIN</small>
                  </>
                ) : (
                  <b className="dash">{open ? 'OPEN' : '--'}</b>
                )}
              </span>
            </button>
          );
        })}
      </section>
      <button
        type="button"
        className="action mission-clear"
        data-cursor={clearCursor}
        onFocus={() => onFocusCursor(clearCursor)}
        onClick={onClear}
      >
        CLEAR MISSION
      </button>
    </div>
  );
}
