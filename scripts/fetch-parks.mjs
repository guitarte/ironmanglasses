#!/usr/bin/env node
// Bakes Disneyland Resort park and attraction coordinates into public/parks.json
// so the glasses only need one small request for live wait times.
// Runs in the deploy workflow. On any failure the committed file is kept and the
// app falls back to fetching coordinates itself.
import {readFileSync, writeFileSync} from 'node:fs';

const API = 'https://api.themeparks.wiki/v1';
const FILE = new URL('../public/parks.json', import.meta.url);
const current = JSON.parse(readFileSync(FILE, 'utf8'));
const clean = name => name.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();

async function get(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {Origin: 'https://example.github.io'},
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return {body: await response.json(), cors: response.headers.get('access-control-allow-origin')};
}

try {
  // Confirm the park IDs against the live directory rather than trusting the committed ones.
  const {body: directory} = await get('/destinations');
  const resort = (directory.destinations ?? []).find(d => /disneyland resort/i.test(d.name) && !/paris|hong kong|tokyo|shanghai/i.test(d.name));
  if (resort) {
    for (const park of current.parks) {
      const match = (resort.parks ?? []).find(p =>
        park.key === 'DCA' ? /adventure/i.test(p.name) : !/adventure/i.test(p.name));
      if (match && match.id !== park.id) {
        console.log(`Park id for ${park.key} changed: ${park.id} -> ${match.id}`);
        park.id = match.id;
      }
    }
  } else {
    console.warn('Disneyland Resort not found in the directory; keeping committed park ids');
  }

  for (const park of current.parks) {
    const {body} = await get(`/entity/${park.id}/children`);
    const attractions = (body.children ?? [])
      .filter(child => child.entityType === 'ATTRACTION')
      .map(child => ({
        id: child.id,
        name: clean(child.name),
        lat: child.location?.latitude ?? null,
        lon: child.location?.longitude ?? null,
      }));
    const located = attractions.filter(a => a.lat !== null).length;
    console.log(`${park.name}: ${attractions.length} attractions, ${located} with coordinates`);
    if (attractions.length) park.attractions = attractions;

    const live = await get(`/entity/${park.id}/live`);
    const waits = (live.body.liveData ?? []).filter(e => typeof e.queue?.STANDBY?.waitTime === 'number');
    console.log(`  live: ${(live.body.liveData ?? []).length} entries, ${waits.length} posting a wait, CORS header: ${live.cors}`);
    if (live.cors !== '*') console.warn('::warning::Live endpoint did not return an open CORS header; the app cannot read it from the browser');
  }
  current.generatedAt = new Date().toISOString();
  writeFileSync(FILE, `${JSON.stringify(current)}\n`);
  console.log('Wrote public/parks.json');
} catch (error) {
  console.warn(`::warning::Could not refresh park data (${error.message}); keeping the committed parks.json`);
}
