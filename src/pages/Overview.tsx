import {Count} from '../Count';
import type {Pick} from '../advisor';
import {LAND_CODE} from '../lands';
import {level, type ParkStats} from '../model';

type Props = {
  cursor: number;
  onFocusCursor: (cursor: number) => void;
  stats: ParkStats;
  moves: Pick[];
  remote: boolean;
  onLock: (id: string) => void;
};

const GAUGE_MAX = 60;
const ARC = 75; // the gauge sweeps 270 degrees of a circle whose path length is 100

export function Overview({stats, moves, remote, onFocusCursor, onLock}: Props) {
  const average = stats.average ?? 0;
  const fill = Math.min(1, average / GAUGE_MAX) * ARC;
  const tone = average < 15 ? 'low' : average < 28 ? 'low' : average < 42 ? 'mid' : 'high';
  const tallest = Math.max(30, ...stats.lands.map(l => l.average));

  return (
    <div className="overview">
      <section className="ov-top" aria-label="Park status">
        <div className={`crowd tone-${tone}`}>
          <svg viewBox="-60 -60 120 120" aria-hidden="true">
            <circle className="crowd-track" r="50" pathLength="100" strokeDasharray={`${ARC} 100`} />
            <circle className="crowd-fill" r="50" pathLength="100" strokeDasharray={`${fill} 100`} />
            {Array.from({length: 7}, (_, i) => (
              <line key={i} x1="0" y1="-58" x2="0" y2="-54" transform={`rotate(${90 + i * 45})`} />
            ))}
          </svg>
          <div className="crowd-read">
            <b>{stats.average !== null ? <Count value={stats.average} fromZero /> : '--'}</b>
            <small>MIN AVG</small>
          </div>
          <span className="crowd-label">{stats.crowd}</span>
        </div>

        <div className="lands" role="img" aria-label="Average wait by land">
          <span className="eyebrow">AVG WAIT BY AREA</span>
          <div className="bars">
            {stats.lands.map(({land, average: value}, index) => (
              <div key={land} className={`bar tone-${level({status: 'OPERATING', wait: value})}`}>
                <span className="bar-value">{value}</span>
                <i style={{height: `${Math.max(6, (value / tallest) * 100)}%`, animationDelay: `${index * 45}ms`}} />
                <span className="bar-name">{LAND_CODE[land] ?? land.slice(0, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="moves" aria-label="Best moves">
        <span className="eyebrow">
          BEST MOVES{remote ? '  /  WALK FROM MAIN GATE' : '  /  FROM YOUR POSITION'}
        </span>
        {moves.map((move, index) => (
          <button
            type="button"
            key={move.row.id}
            className={`move tone-${level(move.row)}`}
            data-cursor={index + 1}
            style={{animationDelay: `${80 + index * 70}ms`}}
            onFocus={() => onFocusCursor(index + 1)}
            onClick={() => onLock(move.row.id)}
          >
            <span className="move-rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="row-text">
              <span className="row-name">{move.row.name}</span>
              <span className="row-detail">
                {`WAIT ${move.row.wait}  +  WALK ${move.walk}  /  ${move.reason}`}
              </span>
            </span>
            <span className="row-wait">
              <b>{move.total}</b>
              <small>MIN</small>
            </span>
          </button>
        ))}
        {moves.length === 0 ? <p className="hint">No open rides are posting waits right now.</p> : null}
      </section>
    </div>
  );
}
