/** Which instrument sits in the middle of a ride display. */
export type Instrument = 'horizon' | 'drop' | 'tremor';

export type RideProfile = {
  key: string;
  /** Name of the display, shown in the header. */
  title: string;
  instrument: Instrument;
  /** Accent, dim accent, and the highlight used for the moving parts. */
  colors: [accent: string, dim: string, hot: string];
  words: {armed: string; live: string; complete: string; g: string; clock: string; end: string};
};

type Rule = [pattern: RegExp, profile: RideProfile];

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');

/** CSS custom properties that repaint the HUD in a profile's colours. */
export function profileStyle(profile: RideProfile): Record<string, string> {
  const [accent, dim, hot] = profile.colors;
  return {
    '--c': accent,
    '--c-dim': dim,
    '--c-faint': `rgba(${rgb(accent)}, 0.15)`,
    '--c-glow': `rgba(${rgb(accent)}, 0.36)`,
    '--hot': hot,
  };
}

const DEFAULT: RideProfile = {
  key: 'telemetry',
  title: 'RIDE TELEMETRY',
  instrument: 'horizon',
  colors: ['#4fe3ff', '#2aa6c4', '#ffb43a'],
  words: {armed: 'ARMED  /  WAITING FOR MOTION', live: 'RECORDING', complete: 'RIDE COMPLETE', g: 'G FORCE', clock: 'CLOCK', end: 'END RIDE DISPLAY'},
};

// Each display is an original design themed to the ride's setting: no logos, characters or film art.
const RULES: Rule[] = [
  [
    /space mountain|hyperspace/i,
    {
      key: 'starflight',
      title: 'STARFLIGHT DECK',
      instrument: 'horizon',
      colors: ['#8fd6ff', '#5b7fd6', '#ffffff'],
      words: {armed: 'ON THE PAD  /  AWAITING LAUNCH', live: 'IN FLIGHT', complete: 'DOCKED', g: 'G LOAD', clock: 'MISSION', end: 'LEAVE THE FLIGHT DECK'},
    },
  ],
  [
    /big thunder/i,
    {
      key: 'minetrain',
      title: 'MINE TRAIN GAUGES',
      instrument: 'horizon',
      colors: ['#ffc46b', '#b9853c', '#ff7a3d'],
      words: {armed: 'BRAKES SET  /  WAITING ON THE WHISTLE', live: 'RUNAWAY', complete: 'BACK AT THE STATION', g: 'RAIL LOAD', clock: 'RUN TIME', end: 'HANG UP THE GAUGES'},
    },
  ],
  [
    /matterhorn/i,
    {
      key: 'alpine',
      title: 'ALPINE SLED COMPUTER',
      instrument: 'horizon',
      colors: ['#eaf6ff', '#8fb0c2', '#7fe0ff'],
      words: {armed: 'AT THE SUMMIT  /  READY TO DROP IN', live: 'DESCENDING', complete: 'AT BASE CAMP', g: 'SLED LOAD', clock: 'DESCENT', end: 'STOW THE SLED COMPUTER'},
    },
  ],
  [
    /incredicoaster|goofy'?s sky|gadget|slinky|coaster/i,
    {
      key: 'launch',
      title: 'LAUNCH TELEMETRY',
      instrument: 'horizon',
      colors: ['#ff8a7a', '#c4524a', '#ffd166'],
      words: {armed: 'ON THE LINE  /  WAITING FOR LAUNCH', live: 'FULL THROTTLE', complete: 'RUN COMPLETE', g: 'G LOAD', clock: 'RUN TIME', end: 'CLOSE TELEMETRY'},
    },
  ],
  [
    /radiator springs racers|autopia|racers/i,
    {
      key: 'raceday',
      title: 'RACE DAY DASH',
      instrument: 'horizon',
      colors: ['#ffd166', '#b8922f', '#ff5a4a'],
      words: {armed: 'ON THE GRID  /  WAITING FOR GREEN', live: 'RACING', complete: 'CHEQUERED FLAG', g: 'CORNER LOAD', clock: 'LAP', end: 'PARK THE DASH'},
    },
  ],
  [
    /mission: breakout|tower|drop|jumpin|parachute/i,
    {
      key: 'droptower',
      title: 'DROP SHAFT MONITOR',
      instrument: 'drop',
      colors: ['#ff9acb', '#b85e9a', '#ffe14d'],
      words: {armed: 'LIFT HOLDING  /  WAITING FOR THE DROP', live: 'IN THE SHAFT', complete: 'BACK ON SOLID GROUND', g: 'G LOAD', clock: 'IN SHAFT', end: 'CLOSE THE MONITOR'},
    },
  ],
  [
    /bayou adventure|grizzly river|splash|pirates of the caribbean/i,
    {
      key: 'flume',
      title: 'RIVER RUN LOG',
      instrument: 'drop',
      colors: ['#7fe8d2', '#3f9c8c', '#ffffff'],
      words: {armed: 'DRIFTING  /  WAITING FOR THE FALLS', live: 'ON THE RIVER', complete: 'DOCKED AND DRIPPING', g: 'HULL LOAD', clock: 'ON WATER', end: 'CLOSE THE LOG'},
    },
  ],
  [
    /indiana jones|temple/i,
    {
      key: 'expedition',
      title: 'EXPEDITION SEISMOGRAPH',
      instrument: 'tremor',
      colors: ['#e2c178', '#96803f', '#ff6a3d'],
      words: {armed: 'ENGINE IDLING  /  WAITING TO ROLL', live: 'IN THE TEMPLE', complete: 'OUT IN ONE PIECE', g: 'JOLT', clock: 'INSIDE', end: 'PACK UP THE INSTRUMENTS'},
    },
  ],
  [
    /smugglers run|rise of the resistance|star tours|soarin|web slingers|astro blasters|rocket/i,
    {
      key: 'cockpit',
      title: 'COCKPIT MOTION DECK',
      instrument: 'tremor',
      colors: ['#9dffb0', '#4fa866', '#ffb43a'],
      words: {armed: 'SYSTEMS UP  /  WAITING FOR CLEARANCE', live: 'IN MOTION', complete: 'LANDED', g: 'HULL LOAD', clock: 'AIRBORNE', end: 'POWER DOWN THE DECK'},
    },
  ],
  [
    /haunted mansion|snow white|pinocchio|mr\. toad|alice|peter pan|monsters|little mermaid|runaway railway/i,
    {
      key: 'darkride',
      title: 'DARK RIDE DRIFT METER',
      instrument: 'tremor',
      colors: ['#c9a8ff', '#7c63b8', '#9dffb0'],
      words: {armed: 'DOORS CLOSING  /  WAITING TO MOVE', live: 'DRIFTING THROUGH', complete: 'BACK IN THE LIGHT', g: 'SWAY', clock: 'INSIDE', end: 'CLOSE THE METER'},
    },
  ],
];

export function profileFor(rideName: string): RideProfile {
  return RULES.find(([pattern]) => pattern.test(rideName))?.[1] ?? DEFAULT;
}
