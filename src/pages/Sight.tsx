import {angleDelta, cardinal, formatDistance} from '../geo';
import {level, statusLabel, type Row} from '../model';

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  /** Rides with a known position, nearest first. */
  blips: Row[];
  /** Degrees clockwise from north at the centre of the view. */
  look: number;
  /** The view follows the wearer's head; otherwise it is panned by hand. */
  live: boolean;
  remote: boolean;
  onLock: (id: string) => void;
};

const WIDTH = 568;
const HEIGHT = 322;
const HALF_FOV = 40;
const PX_PER_DEG = WIDTH / (HALF_FOV * 2);
const TAPE = 34;
const LANES = 6;
const LANE_GAP = 46;
const CENTRE_DEG = 9;

const short = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name);

/** The ride closest to the middle of the view, if one is near enough to count as aimed at. */
export function sighted(blips: Row[], look: number): Row | null {
  let best: Row | null = null;
  let bestOffset = CENTRE_DEG;
  for (const row of blips) {
    const offset = Math.abs(angleDelta(row.bearing!, look));
    if (offset < bestOffset) {
      best = row;
      bestOffset = offset;
    }
  }
  return best;
}

/** A look-around view: rides are drawn along the horizon in the direction they really are. */
export function Sight({blips, look, live, remote, onFocusCursor, onLock}: Props) {
  const aimed = sighted(blips, look);
  const inView = blips
    .map(row => ({row, offset: angleDelta(row.bearing!, look)}))
    .filter(item => Math.abs(item.offset) <= HALF_FOV);
  // Nearest rides get a lane; the one being aimed at always keeps its place.
  const shown = inView.slice(0, LANES);
  if (aimed && !shown.some(item => item.row === aimed)) shown[LANES - 1] = inView.find(item => item.row === aimed)!;

  const marks = [];
  const first = Math.ceil((look - HALF_FOV) / 5) * 5;
  for (let degrees = first; degrees <= look + HALF_FOV; degrees += 5) {
    const x = WIDTH / 2 + (degrees - look) * PX_PER_DEG;
    const bearing = ((degrees % 360) + 360) % 360;
    const major = bearing % 45 === 0;
    const labelled = bearing % 15 === 0;
    marks.push(
      <g key={degrees} transform={`translate(${x.toFixed(1)} 0)`}>
        <line y1={TAPE} y2={TAPE - (major ? 14 : labelled ? 10 : 6)} className={major ? 'major' : ''} />
        {labelled ? (
          <text y="13" className={major ? 'major' : ''}>
            {major ? cardinal(bearing) : bearing}
          </text>
        ) : null}
      </g>,
    );
  }

  const d = aimed?.range != null ? formatDistance(aimed.range) : null;
  const note = remote ? 'REMOTE VIEW FROM GATE' : live ? 'FOLLOWING YOUR HEAD' : 'NO COMPASS';

  return (
    <div className="sight">
      <svg className="sight-view" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <g className="tape">{marks}</g>
        <line className="horizon" x1="0" x2={WIDTH} y1={TAPE} y2={TAPE} />
        <path className="sight-notch" d={`M${WIDTH / 2},${TAPE + 2} l8,12 h-16z`} />
        <line className="sight-axis" x1={WIDTH / 2} x2={WIDTH / 2} y1={TAPE + 14} y2={HEIGHT} />
        {shown.map((item, lane) => {
          const {row, offset} = item;
          const x = WIDTH / 2 + offset * PX_PER_DEG;
          const y = HEIGHT - 18 - lane * LANE_GAP;
          const right = x < WIDTH * 0.58;
          const on = row === aimed;
          const size = Math.max(14, 19 - lane);
          const distance = row.range !== null ? formatDistance(row.range) : null;
          const wait = row.status === 'OPERATING' ? (row.wait !== null ? `${row.wait} MIN` : 'OPEN') : statusLabel(row.status);
          return (
            <g key={row.id} className={`sight-mark tone-${level(row)} ${on ? 'is-aimed' : ''}`}>
              <line className="stem" x1={x} x2={x} y1={TAPE} y2={y} />
              <circle cx={x} cy={y} r={on ? 9 : Math.max(4, 7 - lane)} />
              {on ? <path className="bracket" d={`M${x - 16},${y - 8}v-8h8M${x + 8},${y - 16}h8v8M${x + 16},${y + 8}v8h-8M${x - 8},${y + 16}h-8v-8`} /> : null}
              <text x={x + (right ? 22 : -22)} y={y - 2} textAnchor={right ? 'start' : 'end'} style={{fontSize: size}}>
                {short(row.name, Math.max(6, Math.floor(((right ? WIDTH - x : x) - 26) / (size * 0.64))))}
              </text>
              <text className="sight-sub" x={x + (right ? 22 : -22)} y={y + 14} textAnchor={right ? 'start' : 'end'}>
                {`${wait}${distance ? `  /  ${distance.value} ${distance.unit}` : ''}`}
              </text>
            </g>
          );
        })}
      </svg>

      <button
        type="button"
        className={`sight-contact ${aimed ? `tone-${level(aimed)}` : ''}`}
        data-cursor="1"
        onFocus={() => onFocusCursor(1)}
        onClick={() => aimed && onLock(aimed.id)}
      >
        {aimed ? (
          <>
            <span className="sight-name">{aimed.name}</span>
            <span className="sight-wait">
              {aimed.status === 'OPERATING' ? (aimed.wait !== null ? `${aimed.wait} MIN` : 'OPEN') : statusLabel(aimed.status)}
              {d ? `  /  ${d.value} ${d.unit}` : ''}
            </span>
            <span className="contact-hint">PINCH TO LOCK</span>
          </>
        ) : (
          <span className="sight-none">{live ? 'TURN TOWARD A RIDE TO SIGHT IT' : 'NOTHING DEAD AHEAD'}</span>
        )}
      </button>
      <p className="eyebrow sight-note">
        {`${note}  /  ${cardinal(look)} ${String(Math.round(((look % 360) + 360) % 360)).padStart(3, '0')}`}
        {live ? '' : '  /  SWIPE DOWN TO PAN'}
      </p>
    </div>
  );
}
