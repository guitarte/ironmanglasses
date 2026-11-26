import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {profileFor, profileStyle} from './rides';
import {load, save} from './store';

type Props = {
  rideId: string;
  rideName: string;
  onEnd: () => void;
};

type Phase = 'armed' | 'live' | 'complete';
type Readout = {
  phase: Phase;
  g: number | null;
  peak: number;
  low: number;
  roll: number;
  pitch: number;
  maxRoll: number;
  seconds: number;
  /** Seconds spent near weightless, and how many separate times it happened. */
  airtime: number;
  drops: number;
  /** How hard the ride is shaking right now, 0 to 1, and the most it has. */
  shake: number;
  maxShake: number;
  trace: number[];
  sensed: boolean;
};

const G = 9.80665;
const RAD = Math.PI / 180;
const LAUNCH_G = 0.35;
const CALM_G = 0.15;
const FLOAT_G = 0.45;
const MIN_RIDE_S = 20;
const CALM_END_S = 12;
const TRACE_POINTS = 90;
const FRAME_MS = 66;

const START: Readout = {
  phase: 'armed',
  g: null,
  peak: 1,
  low: 1,
  roll: 0,
  pitch: 0,
  maxRoll: 0,
  seconds: 0,
  airtime: 0,
  drops: 0,
  shake: 0,
  maxShake: 0,
  trace: [],
  sensed: false,
};

/** Motion permission has to be asked for from the pinch that opens a ride display (Safari). */
export async function requestMotion(): Promise<void> {
  const Motion = (window as any).DeviceMotionEvent;
  if (Motion && typeof Motion.requestPermission === 'function') {
    try {
      await Motion.requestPermission();
    } catch {
      /* the display simply shows no sensor */
    }
  }
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * An on-ride display driven by the motion sensors, themed to the ride. Once opened it
 * needs no input: the clock starts when the ride moves and stops when the motion settles.
 * Coasters get an artificial horizon, drops get a weightlessness gauge, and motion-base
 * and dark rides get a seismograph.
 */
export function Flight({rideId, rideName, onEnd}: Props) {
  const profile = profileFor(rideName);
  const [view, setView] = useState<Readout>(START);
  const state = useRef<Readout>(START);
  const best = useRef<number>(load<Record<string, number>>('flights', {})[rideId] ?? 0);

  useEffect(() => {
    let launchHits = 0;
    let startedAt = 0;
    let calmSince = 0;
    let lastTrace = 0;
    let lastTime = 0;
    let smooth = 1;
    let previous = 1;
    let floating = false;
    const now = () => performance.now() / 1000;

    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const raw = Math.hypot(a.x, a.y, a.z) / G;
      smooth += (raw - smooth) * 0.35;
      const s = state.current;
      const time = now();
      const step = lastTime ? Math.min(0.2, time - lastTime) : 0;
      lastTime = time;
      const shake = s.shake + (Math.min(1, Math.abs(raw - previous) * 2.2) - s.shake) * 0.2;
      previous = raw;
      const next: Readout = {...s, g: smooth, shake, sensed: true};
      const off = Math.abs(smooth - 1);
      if (s.phase === 'armed') {
        launchHits = off > LAUNCH_G ? launchHits + 1 : 0;
        if (launchHits >= 3) {
          Object.assign(next, {phase: 'live', peak: smooth, low: smooth, maxRoll: 0, airtime: 0, drops: 0, maxShake: shake, trace: []});
          startedAt = time;
          calmSince = 0;
          floating = false;
        }
      } else if (s.phase === 'live') {
        next.seconds = time - startedAt;
        next.peak = Math.max(s.peak, smooth);
        next.low = Math.min(s.low, smooth);
        next.maxRoll = Math.max(s.maxRoll, Math.abs(s.roll));
        next.maxShake = Math.max(s.maxShake, shake);
        if (smooth < FLOAT_G) {
          next.airtime = s.airtime + step;
          if (!floating) next.drops = s.drops + 1;
          floating = true;
        } else if (smooth > FLOAT_G + 0.2) floating = false;
        if (time - lastTrace > 0.33) {
          lastTrace = time;
          next.trace = [...s.trace, smooth].slice(-TRACE_POINTS);
        }
        if (off < CALM_G) calmSince = calmSince || time;
        else calmSince = 0;
        if (next.seconds > MIN_RIDE_S && calmSince && time - calmSince > CALM_END_S) {
          next.phase = 'complete';
          next.seconds = calmSince - startedAt;
          if (next.peak > best.current) {
            best.current = next.peak;
            save('flights', {...load<Record<string, number>>('flights', {}), [rideId]: Math.round(next.peak * 100) / 100});
          }
        }
      }
      state.current = next;
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (typeof event.beta !== 'number') return;
      const b = event.beta * RAD;
      const g = (event.gamma ?? 0) * RAD;
      // Roll of the display about the line of sight, and how far that line is above the horizon.
      const roll = Math.atan2(-Math.cos(b) * Math.sin(g), Math.sin(b)) / RAD;
      const pitch = Math.asin(Math.max(-1, Math.min(1, -Math.cos(b) * Math.cos(g)))) / RAD;
      state.current = {...state.current, roll, pitch, sensed: true};
    };

    window.addEventListener('devicemotion', onMotion);
    window.addEventListener('deviceorientation', onOrientation);
    const timer = setInterval(() => setView(state.current), FRAME_MS);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrientation);
      clearInterval(timer);
    };
  }, [rideId]);

  const {phase, g, peak, low, roll, pitch, maxRoll, seconds, airtime, drops, shake, maxShake, trace, sensed} = view;
  const gTone = g === null ? 'off' : g >= 2.5 ? 'high' : g >= 1.6 ? 'mid' : 'low';
  const fill = g === null ? 0 : Math.max(0, Math.min(1, g / 4));
  const peakAt = Math.max(0, Math.min(1, peak / 4));
  const shift = Math.max(-70, Math.min(70, pitch * 2.2));
  const words = profile.words;
  const status = phase === 'armed' ? (sensed ? words.armed : 'NO MOTION SENSOR ON THIS DISPLAY') : phase === 'live' ? words.live : words.complete;
  const points = trace.map((value, index) => `${(index / (TRACE_POINTS - 1)) * 250},${46 - Math.min(4, value) * 11}`).join(' ');
  const weightless = g !== null && g < FLOAT_G;
  const started = phase !== 'armed';

  let instrument;
  let side: [string, string][];
  if (profile.instrument === 'drop') {
    // A column whose float rises as the load falls away: at the top you are weightless.
    const lift = g === null ? 0 : Math.max(0, Math.min(1, 1 - g / 2));
    instrument = (
      <svg className="horizon-ball drop-shaft" viewBox="-150 -150 300 300" aria-hidden="true">
        <rect className="shaft" x="-46" y="-132" width="92" height="264" />
        {Array.from({length: 12}, (_, i) => (
          <line key={i} className="shaft-tick" x1="-46" x2={i % 3 ? -30 : -18} y1={-132 + i * 24} y2={-132 + i * 24} />
        ))}
        <line className="float-line" x1="-70" x2="70" y1="-66" y2="-66" />
        <text className="shaft-label" x="78" y="-61">FLOAT</text>
        <g transform={`translate(0 ${110 - lift * 220})`}>
          <rect className={`cab ${weightless ? 'is-floating' : ''}`} x="-38" y="-20" width="76" height="40" />
          <path className="cab-mark" d="M-22,0 H22 M0,-10 V10" />
        </g>
        <text className={`float-word ${weightless ? 'is-on' : ''}`} y="-140">{weightless ? 'WEIGHTLESS' : ''}</text>
      </svg>
    );
    side = [
      ['FLOAT', `${airtime.toFixed(1)} S`],
      ['DROPS', String(drops)],
      ['LOW', started ? `${low.toFixed(1)} G` : '--'],
    ];
  } else if (profile.instrument === 'tremor') {
    // Rings that swell with how hard the vehicle is shaking, with the peak ring left behind.
    instrument = (
      <svg className="horizon-ball tremor" viewBox="-150 -150 300 300" aria-hidden="true">
        {[40, 80, 120].map(radius => (
          <circle key={radius} className="tremor-grid" r={radius} />
        ))}
        <line className="tremor-grid" x1="-128" x2="128" />
        <line className="tremor-grid" y1="-128" y2="128" />
        <circle className="tremor-peak" r={8 + maxShake * 118} />
        <circle className="tremor-now" r={8 + shake * 118} />
        <g transform={`rotate(${-roll})`}>
          <path className="wings" d="M-70,0 H-22 M22,0 H70 M0,-14 V14" />
        </g>
        <text className="tremor-read" y="6">{Math.round(shake * 100)}</text>
      </svg>
    );
    side = [
      ['PEAK', `${Math.round(maxShake * 100)}`],
      ['LEAN', `${Math.round(Math.abs(roll))}°`],
      ['MAX', `${Math.round(maxRoll)}°`],
    ];
  } else {
    instrument = (
      <svg className="horizon-ball" viewBox="-150 -150 300 300" aria-hidden="true">
        <defs>
          <clipPath id="horizon-clip">
            <circle r="128" />
          </clipPath>
        </defs>
        <g clipPath="url(#horizon-clip)">
          <g transform={`rotate(${-roll})`}>
            <g transform={`translate(0 ${shift})`}>
              <rect className="ground" x="-300" y="0" width="600" height="400" />
              <line className="sky-line" x1="-300" x2="300" y1="0" y2="0" />
              {[-40, -30, -20, -10, 10, 20, 30, 40].map(step => (
                <g key={step} className="ladder" transform={`translate(0 ${-step * 2.2})`}>
                  <line x1={step % 20 ? -22 : -40} x2={step % 20 ? 22 : 40} />
                  {step % 20 ? null : <text x="52" y="5">{Math.abs(step)}</text>}
                </g>
              ))}
            </g>
          </g>
        </g>
        <circle className="ball-rim" r="128" />
        <g className="roll-scale">
          {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map(mark => (
            <line key={mark} y1="-128" y2={mark % 30 ? -138 : -144} transform={`rotate(${mark})`} />
          ))}
        </g>
        <path className="roll-pointer" d="M0,-126 l8,14 h-16z" transform={`rotate(${-roll})`} />
        <path className="wings" d="M-86,0 H-34 L-18,16 L0,0 L18,16 L34,0 H86" />
      </svg>
    );
    side = [
      ['ROLL', `${Math.round(Math.abs(roll))}°`],
      ['MAX', `${Math.round(maxRoll)}°`],
      ['LOW', started ? `${low.toFixed(1)} G` : '--'],
    ];
  }

  const summary =
    phase === 'complete'
      ? `PEAK ${peak.toFixed(1)} G  /  ${clock(seconds)}${best.current ? `  /  BEST ${best.current.toFixed(1)} G` : ''}`
      : `LOAD TRACE${best.current ? `  /  YOUR BEST ${best.current.toFixed(1)} G` : ''}`;

  return (
    <main className={`hud flight is-${phase} ride-${profile.key}`} style={profileStyle(profile) as CSSProperties} data-testid="flight-screen">
      <i className="flight-backdrop" aria-hidden="true" />
      <header className="top target-top">
        <span className="eyebrow">{`${profile.title}  /  ${rideName}`}</span>
        <h1 className={`flight-status ${phase === 'live' ? 'pulse' : ''}`}>{status}</h1>
      </header>

      <div className="flight-body">
        <aside className={`g-meter tone-${gTone}`}>
          <span className="eyebrow">{words.g}</span>
          <b>{g === null ? '--' : g.toFixed(1)}</b>
          <div className="g-bar" aria-hidden="true">
            <i style={{height: `${fill * 100}%`}} />
            <u style={{bottom: `${peakAt * 100}%`}} />
            <s style={{bottom: '25%'}} />
          </div>
          <span className="g-note">PEAK {started ? peak.toFixed(1) : '--'}</span>
        </aside>

        {instrument}

        <aside className="g-meter">
          <span className="eyebrow">{words.clock}</span>
          <b>{clock(seconds)}</b>
          {side.map(([label, value]) => (
            <span key={label} className="g-note">{`${label} ${value}`}</span>
          ))}
        </aside>
      </div>

      <div className="flight-trace">
        <span className="eyebrow">{summary}</span>
        <svg viewBox="0 0 250 46" preserveAspectRatio="none" aria-hidden="true">
          <line className="one-g" x1="0" x2="250" y1="35" y2="35" />
          {points ? <polyline points={points} /> : null}
        </svg>
      </div>

      <footer className="target-actions flight-actions">
        <button type="button" className="action" data-target-action="0" onClick={onEnd}>
          {words.end}
        </button>
      </footer>
    </main>
  );
}
