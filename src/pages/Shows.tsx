import {clock, duration, type Show} from '../model';

export const SHOWS_PAGE = 5;

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  shows: Show[];
  start: number;
  hours: {head: string; detail: string; closing: boolean} | null;
  reminders: Record<string, number>;
  onRemind: (show: Show) => void;
};

/** Upcoming entertainment and the park's closing time. Pinching a show sets a reminder. */
export function Shows({shows, start, hours, reminders, onFocusCursor, onRemind}: Props) {
  const shown = shows.slice(start, start + SHOWS_PAGE);
  return (
    <div className="shows">
      <div className={`hours ${hours?.closing ? 'is-closing' : ''}`}>
        <span className="eyebrow">PARK HOURS</span>
        <b>{hours ? hours.head : 'HOURS NOT REPORTED'}</b>
        <span className="hours-left">{hours?.detail ?? ''}</span>
      </div>
      {shows.length ? (
        <section className="rows" aria-label="Shows">
          {shown.map((show, offset) => {
            const index = start + offset;
            const soon = show.minutes <= 20;
            const reminded = reminders[show.id] === show.next;
            return (
              <button
                type="button"
                key={show.id}
                className={`row tone-${soon ? 'mid' : 'low'}`}
                data-cursor={index + 1}
                onFocus={() => onFocusCursor(index + 1)}
                onClick={() => onRemind(show)}
              >
                <span className="row-text">
                  <span className="row-name">{show.name}</span>
                  <span className="row-detail">
                    {clock(show.next)}
                    {show.later.length ? `  /  THEN ${show.later.slice(0, 2).map(clock).join(', ')}` : ''}
                    {reminded ? <em className="tag tag-alert">REMINDER</em> : null}
                  </span>
                </span>
                <span className="row-wait">
                  {show.minutes < 1 ? (
                    <b className="dash">NOW</b>
                  ) : show.minutes < 100 ? (
                    <>
                      <b>{show.minutes}</b>
                      <small>MIN</small>
                    </>
                  ) : (
                    <b className="dash">{duration(show.minutes)}</b>
                  )}
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <div className="empty">
          <p>NO SHOWTIMES REPORTED</p>
          <p className="empty-sub">Nothing further is scheduled today.</p>
        </div>
      )}
    </div>
  );
}
