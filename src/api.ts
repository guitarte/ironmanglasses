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
export type LiveEntry = {id: string; name: string; status: string; wait: number | null};
export type LiveSet = {entries: LiveEntry[]; fetchedAt: number};

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
      return {
        id: String(entry.id ?? entry.entityId),
        name: clean(String(entry.name ?? '')),
        status: String(entry.status ?? 'UNKNOWN'),
        wait: typeof wait === 'number' ? wait : null,
      };
    });
  const set = {entries, fetchedAt: Date.now()};
  writeCache(`parkhud.live.${parkId}`, set);
  return set;
}

export function cachedLive(parkId: string): LiveSet | null {
  const set = readCache<LiveSet>(`parkhud.live.${parkId}`);
  return set && Array.isArray(set.entries) ? set : null;
}
