import {useMemo} from 'react';
import {cardinal, formatDistance} from '../geo';
import {level, statusLabel, type Row} from '../model';

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  /** Rides with a known position, nearest first. */
  blips: Row[];
  selected: number;
  /** Degrees the wearer is facing; null draws the scope north-up. */
  heading: number | null;
  remote: boolean;
  onLock: (id: string) => void;
};

const RANGES_M = [120, 240, 480, 960, 1920];
const RADIUS = 150;
const RAD = Math.PI / 180;

export function Radar({blips, selected, heading, remote, onFocusCursor, onLock}: Props) {
  const current = blips[selected] ?? null;
  // Wide enough for the selection and for roughly the nearer two thirds of contacts.
  const need = Math.max(current?.range ?? 0, blips[Math.floor((blips.length - 1) * 0.65)]?.range ?? 0);
  const range = RANGES_M.find(step => step >= need) ?? RANGES_M[RANGES_M.length - 1];
  const rotation = heading ?? 0;

  const points = useMemo(
    () =>
      blips.map(row => {
        const angle = (row.bearing! - rotation) * RAD;
        const r = Math.min(1, row.range! / range) * RADIUS;
        return {row, x: Math.sin(angle) * r, y: -Math.cos(angle) * r, outside: row.range! > range};
      }),
    [blips, rotation, range],
  );
  const mark = points[selected];
  const d = current ? formatDistance(current.range!) : null;
  const rangeLabel = formatDistance(range);

  return (
    <div className="radar">
      <div className="scope-wrap">
        <svg className="radar-scope" viewBox="-170 -170 340 340" role="img" aria-label="Radar of nearby attractions">
          <circle className="rr" r={RADIUS} />
          <circle className="rr" r={RADIUS * 0.66} />
          <circle className="rr" r={RADIUS * 0.33} />
          <path className="rr" d={`M${-RADIUS},0H${RADIUS}M0,${-RADIUS}V${RADIUS}`} />
          <g className="sweep">
            <path d={`M0,0 L0,${-RADIUS} A${RADIUS},${RADIUS} 0 0 0 ${-RADIUS * Math.sin(40 * RAD)},${-RADIUS * Math.cos(40 * RAD)}Z`} />
            <line x1="0" y1="0" x2="0" y2={-RADIUS} />
          </g>
          <g transform={`rotate(${-rotation})`}>
            <text className="north" y={-RADIUS - 6}>
              N
            </text>
          </g>
          {mark ? <line className="leader" x1="0" y1="0" x2={mark.x} y2={mark.y} /> : null}
          {points.map(({row, x, y, outside}, index) =>
            index === selected ? null : (
              <circle
                key={row.id}
                className={`blip tone-${level(row)} ${outside ? 'is-far' : ''}`}
                cx={x}
                cy={y}
                r={outside ? 3 : row.status === 'OPERATING' ? 6 : 4}
              />
            ),
          )}
          {mark ? (
            <g className={`blip-on tone-${level(mark.row)}`} transform={`translate(${mark.x} ${mark.y})`}>
              <circle r="8" />
              <path d="M-16,-9V-16H-9M9,-16H16V-9M16,9V16H9M-9,16H-16V9" />
            </g>
          ) : null}
          <path className="self" d="M0,-11 L8,9 L0,4 L-8,9Z" />
        </svg>
        <span className="scope-note">
          {remote ? 'REMOTE VIEW FROM GATE' : heading === null ? 'NORTH UP' : 'HEADING UP'}
          {`  /  RING ${rangeLabel.value} ${rangeLabel.unit}`}
        </span>
      </div>

      {current ? (
        <button
          type="button"
          className={`contact tone-${level(current)}`}
          data-cursor="1"
          onFocus={() => onFocusCursor(1)}
          onClick={() => onLock(current.id)}
        >
          <span className="eyebrow">CONTACT</span>
          <span className="contact-name">{current.name}</span>
          <span className="contact-wait">
            {current.status === 'OPERATING' && current.wait !== null ? (
              <>
                <b>{current.wait}</b>
                <small>MIN</small>
              </>
            ) : (
              <b className="dash">{statusLabel(current.status)}</b>
            )}
          </span>
          <span className="contact-line">{d ? `${d.value} ${d.unit} ${cardinal(current.bearing!)}` : ''}</span>
          <span className="contact-line">{current.land ?? ''}</span>
          <span className="contact-hint">PINCH TO LOCK</span>
        </button>
      ) : (
        <p className="hint">No attraction positions available.</p>
      )}
    </div>
  );
}
