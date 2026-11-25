import type {Pick} from './advisor';
import {formatDistance} from './geo';
import {level, type Row, type Show} from './model';

type Props = {
  /** Size of the deck in the same design pixels as a HUD pane. */
  width: number;
  height: number;
  blips: Row[];
  /** Ride to highlight on the scope: the locked target, or the radar selection. */
  focusId: string | null;
  heading: number | null;
  target: Row | null;
  move: Pick | null;
  show: Show | null;
  hours: {head: string; detail: string; closing: boolean} | null;
  onLock: (id: string) => void;
  onShows: () => void;
};

const RANGES_M = [120, 240, 480, 960, 1920];
const R = 100;
const RAD = Math.PI / 180;

/**
 * Fills whatever screen is left beside the square HUD pane on a phone: a live scope plus
 * tappable cards. It lays itself out as a row, a column or a tall stack to suit the space.
 */
export function Deck({width, height, blips, focusId, heading, target, move, show, hours, onLock, onShows}: Props) {
  const wide = width > height * 1.25;
  const scope = Math.round(wide ? Math.min(height, width * 0.46) : Math.min(width, height * 0.58));
  const focus = blips.find(row => row.id === focusId) ?? null;
  const need = Math.max(focus?.range ?? 0, blips[Math.floor((blips.length - 1) * 0.65)]?.range ?? 0);
  const range = RANGES_M.find(step => step >= need) ?? RANGES_M[RANGES_M.length - 1];
  const rotation = heading ?? 0;
  const d = target?.distance != null ? formatDistance(target.distance) : null;
  // Cards get roomier type when the deck has space to spare.
  const roomy = !wide && width >= 400 && height - scope > 330;

  return (
    <aside className={`deck ${wide ? 'is-wide' : 'is-tall'} ${roomy ? 'is-roomy' : ''}`} style={{width, height}}>
      <svg className="deck-scope" style={{width: scope, height: scope}} viewBox="-112 -112 224 224" aria-hidden="true">
        <circle r={R} />
        <circle r={R * 0.66} />
        <circle r={R * 0.33} />
        <g transform={`rotate(${-rotation})`}>
          <line y1={-R} y2={R} />
          <line x1={-R} x2={R} />
          <text y={-R - 3}>N</text>
        </g>
        <path className="deck-sweep" d={`M0,0 L0,${-R} A${R},${R} 0 0 1 ${R * 0.64},${-R * 0.77}Z`} />
        {blips.map(row => {
          const angle = (row.bearing! - rotation) * RAD;
          const reach = Math.min(1, row.range! / range) * R;
          const on = row.id === focusId;
          return (
            <circle
              key={row.id}
              className={`deck-blip tone-${level(row)} ${on ? 'is-on' : ''}`}
              cx={Math.sin(angle) * reach}
              cy={-Math.cos(angle) * reach}
              r={on ? 7 : 3.5}
            />
          );
        })}
        <path className="deck-self" d="M0,-9 L7,7 L0,3 L-7,7Z" />
      </svg>

      <div className="deck-cards">
        {target ? (
          <div className={`deck-card tone-${level(target)}`}>
            <span className="eyebrow">TRACKING</span>
            <b>{target.name}</b>
            <span className="deck-line">
              {target.status === 'OPERATING' && target.wait !== null ? `WAIT ${target.wait} MIN` : 'NOT RUNNING'}
              {d ? `  /  ${d.value} ${d.unit}` : ''}
            </span>
          </div>
        ) : move ? (
          <button type="button" className={`deck-card tone-${level(move.row)}`} tabIndex={-1} onClick={() => onLock(move.row.id)}>
            <span className="eyebrow">{wide || width >= 400 ? 'BEST MOVE  /  TAP TO LOCK' : 'BEST MOVE'}</span>
            <b>{move.row.name}</b>
            <span className="deck-line">{`WAIT ${move.row.wait ?? 0}  +  WALK ${move.row.walk ?? 0} MIN`}</span>
          </button>
        ) : null}
        {show ? (
          <button type="button" className={`deck-card tone-${show.minutes <= 20 ? 'mid' : 'low'}`} tabIndex={-1} onClick={onShows}>
            <span className="eyebrow">NEXT SHOW</span>
            <b>{show.name}</b>
            <span className="deck-line">{show.minutes < 1 ? 'STARTING NOW' : `IN ${show.minutes} MIN`}</span>
          </button>
        ) : null}
        {hours ? (
          <div className={`deck-card tone-${hours.closing ? 'mid' : 'low'}`}>
            <span className="eyebrow">PARK HOURS</span>
            <b>{hours.head}</b>
            <span className="deck-line">{hours.detail}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
