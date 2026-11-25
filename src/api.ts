const API: string = import.meta.env.VITE_API_BASE || 'https://api.themeparks.wiki/v1';
const TIMEOUT_MS = 15000;

export type Attraction = {id: string; name: string; lat: number | null; lon: number | null};
export type Park = {
  id: string;
  key: string;
  name: string;
  lat: number;
  lon: number;
  attractions: Attraction[];
};
/** A Lightning Lane return window: the next time a new booking would let you ride. */
export type Pass = {start: number | null; price: string | null; soldOut: boolean};
export type LiveEntry = {
  id: string;
  name: string;
  status: string;
  wait: number | null;
  single?: number | null;
  pass?: Pass | null;
};
export type ShowEntry = {id: string; name: string; times: number[]};
export type LiveSet = {entries: LiveEntry[]; shows?: ShowEntry[]; fetchedAt: number};
export type Hours = {open: number; close: number};

const clean = (name: string) => name.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.any([signal, timeout])});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: the cache is optional */
  }
}

function toAttractions(children: any[]): Attraction[] {
  return children
    .filter(child => child?.entityType === 'ATTRACTION' && child.id && child.name)
    .map(child => ({
      id: String(child.id),
      name: clean(String(child.name)),
      lat: typeof child.location?.latitude === 'number' ? child.location.latitude : null,
      lon: typeof child.location?.longitude === 'number' ? child.location.longitude : null,
    }));
}

/**
 * Park and attraction coordinates. The deploy workflow bakes them into
 * parks.json; if a park arrives without attractions they are fetched once
 * and kept in local storage.
 */
export async function loadParks(signal: AbortSignal): Promise<Park[]> {
  const data = await getJson('./parks.json', signal);
  const parks: Park[] = data.parks;
  await Promise.all(
    parks.map(async park => {
      if (park.attractions.length) return;
      const key = `parkhud.children.${park.id}`;
      const cached = readCache<Attraction[]>(key);
      if (cached?.length) {
        park.attractions = cached;
        return;
      }
      try {
        const body = await getJson(`${API}/entity/${park.id}/children`, signal);
        park.attractions = toAttractions(body.children ?? []);
        if (park.attractions.length) writeCache(key, park.attractions);
      } catch {
        /* wait times still work without coordinates */
      }
    }),
  );
  return parks;
}

export async function fetchLive(parkId: string, signal: AbortSignal): Promise<LiveSet> {
  const body = await getJson(`${API}/entity/${parkId}/live`, signal);
  const entries: LiveEntry[] = (body.liveData ?? [])
    .filter((entry: any) => entry?.entityType === 'ATTRACTION')
    .map((entry: any) => {
      const wait = entry.queue?.STANDBY?.waitTime;
      const single = entry.queue?.SINGLE_RIDER?.waitTime;
      return {
        id: String(entry.id ?? entry.entityId),
        name: clean(String(entry.name ?? '')),
        status: String(entry.status ?? 'UNKNOWN'),
        wait: typeof wait === 'number' ? wait : null,
        single: typeof single === 'number' ? single : null,
        pass: toPass(entry.queue),
      };
    });
  const shows: ShowEntry[] = (body.liveData ?? [])
    .filter((entry: any) => entry?.entityType === 'SHOW' && Array.isArray(entry.showtimes))
    .map((entry: any) => ({
      id: String(entry.id ?? entry.entityId),
      name: clean(String(entry.name ?? '')),
      times: entry.showtimes
        .map((slot: any) => Date.parse(slot?.startTime))
        .filter((time: number) => Number.isFinite(time))
        .sort((a: number, b: number) => a - b),
    }))
    .filter((show: ShowEntry) => show.times.length);
  const set = {entries, shows, fetchedAt: Date.now()};
  writeCache(`parkhud.live.${parkId}`, set);
  return set;
}

function toPass(queue: any): Pass | null {
  const paid = queue?.PAID_RETURN_TIME;
  const free = queue?.RETURN_TIME;
  const slot = paid ?? free;
  if (!slot) return null;
  const start = Date.parse(slot.returnStart);
  const price = paid?.price?.formatted ?? (typeof paid?.price?.amount === 'number' ? `$${Math.round(paid.price.amount / 100)}` : null);
  return {
    start: Number.isFinite(start) ? start : null,
    price: typeof price === 'string' ? price.replace(/\.00$/, '') : null,
    soldOut: slot.state === 'FINISHED' || slot.state === 'SOLD_OUT' || !Number.isFinite(start),
  };
}

const HOURS_TTL_MS = 60 * 60 * 1000;

/** Today's opening and closing time for a park, cached for an hour. */
export async function fetchHours(parkId: string, signal: AbortSignal, now = Date.now()): Promise<Hours | null> {
  const key = `parkhud.hours.${parkId}`;
  const cached = readCache<{hours: Hours | null; at: number}>(key);
  if (cached && now - cached.at < HOURS_TTL_MS) return cached.hours;
  const body = await getJson(`${API}/entity/${parkId}/schedule`, signal);
  const days: Hours[] = (body.schedule ?? [])
    .filter((day: any) => day?.type === 'OPERATING')
    .map((day: any) => ({open: Date.parse(day.openingTime), close: Date.parse(day.closingTime)}))
    .filter((day: Hours) => Number.isFinite(day.open) && Number.isFinite(day.close));
  // The operating day in progress, or else the next one to start.
  const hours =
    days.find(day => now >= day.open && now < day.close) ??
    days.filter(day => day.open > now).sort((a, b) => a.open - b.open)[0] ??
    null;
  writeCache(key, {hours, at: now});
  return hours;
}

export function cachedLive(parkId: string): LiveSet | null {
  const set = readCache<LiveSet>(`parkhud.live.${parkId}`);
  return set && Array.isArray(set.entries) ? set : null;
}
