// Meta AI voice control through WebMCP. Each tool reads live state through
// the getter it is given at call time, so replies never describe a stale screen.
import type {Pick as Move} from './advisor';
import type {ParkStats, Row} from './model';

export type VoiceApi = {
  parkName: () => string;
  otherParks: () => string[];
  rows: () => Row[];
  stats: () => ParkStats | null;
  moves: () => Move[];
  mission: () => Row[];
  showOverview: () => void;
  showMission: () => void;
  lock: (id: string) => void;
  setAlert: (id: string, threshold: number | 'open') => void;
  addToMission: (ids: string[]) => void;
  switchPark: (name: string) => string | null;
};

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: Record<string, unknown>) => Promise<string>;
};

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(word => word && !['the', 'of', 'a', 'ride', 'at'].includes(word));

/** Best fuzzy match of a spoken ride name against the rides on screen. */
export function matchRide(rows: Row[], spoken: string): Row | null {
  const wanted = words(spoken);
  if (!wanted.length) return null;
  let best: Row | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const have = words(row.name);
    const hits = wanted.filter(word => have.some(h => h === word || h.startsWith(word) || word.startsWith(h))).length;
    const score = hits / wanted.length + hits / (have.length + 4);
    if (hits && score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

const problem = (message: string, suggestion: string) => JSON.stringify({error: true, message, suggestion});

function describe(row: Row) {
  return {
    id: row.id,
    name: row.name,
    land: row.land,
    status: row.status === 'OPERATING' ? 'open' : row.status.toLowerCase(),
    waitMinutes: row.wait,
    walkMinutes: row.walk,
    trend: row.trend === 'up' ? 'rising' : row.trend === 'down' ? 'falling' : row.trend === 'flat' ? 'steady' : undefined,
  };
}

function waitPhrase(row: Row): string {
  if (row.status !== 'OPERATING') return `${row.name} is ${row.status === 'DOWN' ? 'temporarily down' : 'closed'}.`;
  if (row.wait === null) return `${row.name} is open with no posted wait.`;
  return `${row.name} has a ${row.wait} minute wait.`;
}

function unknownRide(api: VoiceApi, spoken: string) {
  return problem(
    `No ride matching "${spoken}" is reporting in ${api.parkName()}.`,
    `Ask the wearer to repeat the name, or switch park. Other parks: ${api.otherParks().join(', ')}.`,
  );
}

function tools(api: VoiceApi): Tool[] {
  const rideArg = {type: 'string', description: 'Ride name as the wearer said it.'};
  return [
    {
      name: 'park_status',
      description:
        'Report how busy the current park is, what is on screen, and the shortest waits. Use for "how busy is it" or to orient before other tools.',
      inputSchema: {type: 'object', properties: {}},
      execute: async () => {
        const stats = api.stats();
        if (!stats) return problem('Wait times have not loaded yet.', 'Ask the wearer to try again in a moment.');
        api.showOverview();
        const shortest = api
          .rows()
          .filter(row => row.status === 'OPERATING' && row.wait !== null)
          .sort((a, b) => a.wait! - b.wait!)
          .slice(0, 5)
          .map(describe);
        return JSON.stringify({
          summary: `${api.parkName()} is ${stats.crowd.toLowerCase()}, averaging ${stats.average} minutes. ${stats.down} rides are down.`,
          park: api.parkName(),
          averageWaitMinutes: stats.average,
          open: stats.open,
          down: stats.down,
          longest: stats.longest ? describe(stats.longest) : null,
          shortest,
        });
      },
    },
    {
      name: 'ride_wait_times',
      description:
        'Get the current wait for one or more rides by name. Pass every ride the wearer named in one call.',
      inputSchema: {
        type: 'object',
        properties: {rides: {type: 'array', items: {type: 'string'}, minItems: 1, description: 'Ride names.'}},
        required: ['rides'],
      },
      execute: async input => {
        const names = Array.isArray(input.rides) ? input.rides.filter(n => typeof n === 'string') : [];
        if (!names.length) return problem('No ride names were given.', 'Ask the wearer which ride they mean.');
        const found = names.map(name => matchRide(api.rows(), name as string));
        const hits = found.filter((row): row is Row => row !== null);
        if (!hits.length) return unknownRide(api, names.join(', '));
        if (hits.length === 1) api.lock(hits[0].id);
        return JSON.stringify({
          summary: hits.map(waitPhrase).join(' '),
          rides: hits.map(describe),
          notFound: names.filter((_, index) => !found[index]),
        });
      },
    },
    {
      name: 'navigate_to_ride',
      description: 'Lock a ride as the navigation target and show the compass arrow, distance and walk time to it.',
      inputSchema: {type: 'object', properties: {ride: rideArg}, required: ['ride']},
      execute: async input => {
        const row = typeof input.ride === 'string' ? matchRide(api.rows(), input.ride) : null;
        if (!row) return unknownRide(api, String(input.ride ?? ''));
        api.lock(row.id);
        return JSON.stringify({
          summary: `Target locked on ${row.name}${row.walk !== null ? `, about a ${row.walk} minute walk` : ''}. ${waitPhrase(row)}`,
          ride: describe(row),
        });
      },
    },
    {
      name: 'recommend_next_ride',
      description: 'Suggest the best rides to go to next, weighing walk time, current wait, and how far each wait is below today\'s peak.',
      inputSchema: {type: 'object', properties: {}},
      execute: async () => {
        const moves = api.moves();
        if (!moves.length) return problem('No open rides are posting waits right now.', 'Suggest checking again later.');
        api.showOverview();
        const top = moves[0];
        return JSON.stringify({
          summary: `Best move is ${top.row.name}: ${top.row.wait} minute wait and a ${top.walk} minute walk.`,
          recommendations: moves.map(move => ({...describe(move.row), totalMinutes: move.total, why: move.reason.toLowerCase()})),
        });
      },
    },
    {
      name: 'set_wait_alert',
      description:
        'Alert the wearer when a ride\'s wait drops to a number of minutes or less. For a ride that is down or closed, alerts when it reopens.',
      inputSchema: {
        type: 'object',
        properties: {ride: rideArg, minutes: {type: 'number', description: 'Wait threshold in minutes, 5 to 120.'}},
        required: ['ride'],
      },
      execute: async input => {
        const row = typeof input.ride === 'string' ? matchRide(api.rows(), input.ride) : null;
        if (!row) return unknownRide(api, String(input.ride ?? ''));
        if (row.status !== 'OPERATING') {
          api.setAlert(row.id, 'open');
          api.lock(row.id);
          return JSON.stringify({summary: `I'll alert you when ${row.name} reopens.`, ride: describe(row)});
        }
        const minutes = typeof input.minutes === 'number' ? Math.round(input.minutes) : NaN;
        if (!(minutes >= 5 && minutes <= 120)) {
          return problem('A wait threshold between 5 and 120 minutes is needed.', 'Ask the wearer what wait they want to be alerted at.');
        }
        if (row.wait !== null && row.wait <= minutes) {
          return JSON.stringify({summary: `${row.name} is already at ${row.wait} minutes.`, ride: describe(row)});
        }
        api.setAlert(row.id, minutes);
        api.lock(row.id);
        return JSON.stringify({summary: `Alert set for ${row.name} at ${minutes} minutes or less.`, ride: describe(row)});
      },
    },
    {
      name: 'add_rides_to_mission',
      description: 'Add one or more rides to the mission plan, which orders them into an efficient route. Pass every ride in one call.',
      inputSchema: {
        type: 'object',
        properties: {rides: {type: 'array', items: {type: 'string'}, minItems: 1, description: 'Ride names.'}},
        required: ['rides'],
      },
      execute: async input => {
        const names = Array.isArray(input.rides) ? input.rides.filter(n => typeof n === 'string') : [];
        const found = names.map(name => matchRide(api.rows(), name as string));
        const hits = found.filter((row): row is Row => row !== null);
        if (!hits.length) return unknownRide(api, names.join(', '));
        api.addToMission(hits.map(row => row.id));
        api.showMission();
        return JSON.stringify({
          summary: hits.length > 3 ? `Added ${hits.length} rides to the mission.` : `Added ${hits.map(row => row.name).join(', ')} to the mission.`,
          added: hits.map(describe),
          notFound: names.filter((_, index) => !found[index]),
        });
      },
    },
    {
      name: 'switch_park',
      description: 'Switch between Disneyland and California Adventure.',
      inputSchema: {
        type: 'object',
        properties: {park: {type: 'string', description: 'Either "Disneyland" or "California Adventure".'}},
        required: ['park'],
      },
      execute: async input => {
        const name = typeof input.park === 'string' ? api.switchPark(input.park) : null;
        if (!name) return problem('That park is not available.', `Offer: ${[api.parkName(), ...api.otherParks()].join(', ')}.`);
        return JSON.stringify({summary: `Showing ${name}.`, park: name});
      },
    },
  ];
}

export const VOICE_EXAMPLES = [
  'What should I ride next?',
  'Navigate to Space Mountain',
  'Alert me when Matterhorn is under 30',
];

export function voiceAvailable(): boolean {
  return typeof (document as any).modelContext?.registerTool === 'function';
}

/** Registers every tool through its own guarded call; aborting the signal unregisters them. */
export function registerVoice(api: VoiceApi, signal: AbortSignal): void {
  const ctx = (document as any).modelContext;
  if (!ctx?.registerTool) return;
  for (const tool of tools(api)) {
    Promise.resolve()
      .then(() => ctx.registerTool(tool, {signal}))
      .catch((error: unknown) => {
        if (!signal.aborted) console.warn(`${tool.name} registration failed`, error);
      });
  }
}
