import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {bestMoves, planRoute} from './advisor';
import {cachedLive, fetchHours, fetchLive, loadParks, type Hours, type LiveSet, type Park} from './api';
import {Deck} from './Deck';
import {Flight, requestMotion} from './Flight';
import {PANE, useDisplay, useTouchPad} from './display';
import {useHeadGestures} from './head';
import {clearHistory, recordHistory} from './history';
import {
  buildRows,
  headlines,
  hoursLabel,
  PIN_ID,
  pinRow,
  landsPresent,
  originFor,
  parkStats,
  sortRows,
  SORTS,
  upcomingShows,
  type Pin,
  type Row,
  type Show,
  type Sort,
} from './model';
import {Holo} from './pages/Holo';
import {Mission, MISSION_PAGE} from './pages/Mission';
import {Overview} from './pages/Overview';
import {Radar} from './pages/Radar';
import {Scan, SCAN_HEAD, SCAN_PAGE} from './pages/Scan';
import {Shows, SHOWS_PAGE} from './pages/Shows';
import {Sight, sighted} from './pages/Sight';
import {System, THEMES} from './pages/System';
import {requestOrientation, useCompass, useGeo, useVisible, type OrientationPermission} from './sensors';
import {Banner, Boot, Footer, Header, PAGES, Rails, StatePanel, type BannerState, type DataState, type PageId} from './Shell';
import {setSoundEnabled, sound} from './sound';
import {load, save} from './store';
import {ALERT_STEPS, TARGET_ACTIONS, TargetScreen} from './TargetScreen';
import {registerVoice, type VoiceApi} from './voice';

const POLL_MS = 30000;
const ARRIVE_M = 35;
const REMIND_MIN = 15;
const PAN_STEP = 30;
const GLANCE_MS = 10000;
const DWELL_MS = 2600;

type LiveState = {set: LiveSet | null; loading: boolean; failed: boolean};
const EMPTY: LiveState = {set: null, loading: true, failed: false};
type Settings = {sound: boolean; location: boolean; flipCompass?: boolean; theme?: string; flat?: boolean; head?: boolean; glance?: boolean};
/** How the incoming screen arrives: from a side, back out of a target lock, or flipped to another park. */
type Arrival = 'right' | 'left' | 'back' | 'flip';
export type AlertRule = number | 'open';

/** Keeps a fixed-size window of a list scrolled so that `index` stays inside it. */
function useWindow(index: number, size: number, length: number): number {
  const start = useRef(0);
  let value = start.current;
  if (index >= 0) {
    if (index < value) value = index;
    else if (index >= value + size) value = index - size + 1;
  }
  value = Math.max(0, Math.min(value, Math.max(0, length - size)));
  start.current = value;
  return value;
}

export default function App() {
  const visible = useVisible();
  const display = useDisplay();
  useTouchPad(display.touch);
  const [parks, setParks] = useState<Park[] | null>(null);
  const [parksFailed, setParksFailed] = useState(false);
  const [parkIndex, setParkIndex] = useState(() => load('park', 0));
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);

  const [page, setPage] = useState<PageId>(() => {
    const stored = load<PageId>('page', 'overview');
    return PAGES.includes(stored) ? stored : 'overview';
  });
  const [arrival, setArrival] = useState<Arrival>('right');
  const [entering, setEntering] = useState(true);
  const [cursors, setCursors] = useState<Record<PageId, number>>({overview: 0, scan: 0, radar: 0, map: 0, sight: 0, shows: 0, mission: 0, system: 0});
  const [sort, setSort] = useState<Sort>('wait');
  const [landByPark, setLandByPark] = useState<Record<string, string | null>>({});
  const [radarIndex, setRadarIndex] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetCursor, setTargetCursor] = useState(0);
  const [orientation, setOrientation] = useState<OrientationPermission>('unknown');
  const [settings, setSettings] = useState<Settings>(() => load('settings', {sound: true, location: false}));
  const [queues, setQueues] = useState<Record<string, string[]>>(() => load('queues', {}));
  const [alerts, setAlerts] = useState<Record<string, AlertRule>>(() => load('alerts', {}));
  const [reminders, setReminders] = useState<Record<string, number>>(() => load('reminders', {}));
  const [hours, setHours] = useState<Record<string, Hours | null>>({});
  const [pan, setPan] = useState(0);
  const [pin, setPin] = useState<Pin | null>(() => load('pin', null));
  const [glance, setGlance] = useState(false);
  const [flying, setFlying] = useState(false);
  const lastInput = useRef(0);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [booting, setBooting] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => save('settings', settings), [settings]);
  useEffect(() => save('queues', queues), [queues]);
  useEffect(() => save('alerts', alerts), [alerts]);
  useEffect(() => save('reminders', reminders), [reminders]);
  useEffect(() => save('pin', pin), [pin]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? THEMES[0];
  }, [settings.theme]);
  useEffect(() => save('page', page), [page]);
  // Rows cascade in only while a screen is arriving, not every time the list scrolls.
  useEffect(() => {
    setEntering(true);
    const timer = setTimeout(() => setEntering(false), 700);
    return () => clearTimeout(timer);
  }, [page, parkIndex, targetId]);
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  const park = parks ? parks[Math.min(parkIndex, parks.length - 1)] : null;
  const parkLive = (park && live[park.id]) || EMPTY;

  // On the glasses the raw reading comes out facing backwards (reported from real use), so it is
  // reversed there by default. The System view can switch it either way.
  const flipCompass = settings.flipCompass ?? display.mode === 'glasses';
  const geo = useGeo(visible && settings.location);
  const compass = useCompass(visible && (targetId !== null || page === 'radar' || page === 'map' || page === 'sight' || display.layout !== 'single'), flipCompass);
  const course = geo.speed !== null && geo.speed > 0.7 ? geo.course : null;
  const heading = compass ?? course;

  const notify = useCallback((text: string, tone: BannerState['tone'] = 'info') => {
    setBanner({text, tone, key: Date.now()});
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), banner.tone === 'alert' ? 9000 : 3500);
    return () => clearTimeout(timer);
  }, [banner]);

  // Static park data.
  useEffect(() => {
    const controller = new AbortController();
    setParksFailed(false);
    loadParks(controller.signal).then(setParks, () => {
      if (!controller.signal.aborted) setParksFailed(true);
    });
    return () => controller.abort();
  }, [reload]);

  // Live wait times: poll only while the display is on.
  useEffect(() => {
    if (!park || !visible) return;
    const id = park.id;
    const controller = new AbortController();
    const pull = () => {
      setLive(current => {
        const previous = current[id] ?? {...EMPTY, set: cachedLive(id)};
        return {...current, [id]: {...previous, loading: true}};
      });
      fetchLive(id, controller.signal).then(
        set => {
          recordHistory(id, set.entries, set.fetchedAt);
          setLive(current => ({...current, [id]: {set, loading: false, failed: false}}));
        },
        () => {
          if (controller.signal.aborted) return;
          setLive(current => ({...current, [id]: {set: current[id]?.set ?? null, loading: false, failed: true}}));
        },
      );
    };
    pull();
    const timer = setInterval(pull, POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [park?.id, visible, reload]);

  // Opening hours change once a day, so they are fetched per park and cached.
  useEffect(() => {
    if (!park || !visible) return;
    const id = park.id;
    const controller = new AbortController();
    fetchHours(id, controller.signal).then(
      value => setHours(current => ({...current, [id]: value})),
      () => {},
    );
    return () => controller.abort();
  }, [park?.id, visible]);

  // Clock for the header and the data-age readout.
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(timer);
  }, [visible]);

  // ---- Derived data -------------------------------------------------------
  const origin = useMemo(() => (park ? originFor(park, geo) : null), [park, geo.state, geo.lat, geo.lon]);
  const rows = useMemo(
    () => (park && origin ? buildRows(park, parkLive.set, geo, origin, now) : []),
    [park, origin, parkLive.set, geo.lat, geo.lon, now],
  );
  const lands = useMemo(() => (park ? landsPresent(park, rows) : []), [park, rows]);
  const chosenLand = park ? landByPark[park.id] ?? null : null;
  const land = chosenLand && lands.includes(chosenLand) ? chosenLand : null;
  const scanRows = useMemo(() => sortRows(rows, sort, land), [rows, sort, land]);
  const stats = useMemo(() => (park && rows.length ? parkStats(park, rows) : null), [park, rows]);
  const moves = useMemo(() => bestMoves(rows, 3), [rows]);
  const queue = (park && queues[park.id]) || [];
  const route = useMemo(() => {
    const queued = queue.map(id => rows.find(row => row.id === id)).filter((row): row is Row => !!row);
    return origin ? planRoute(queued, origin) : {legs: [], walk: 0, wait: 0, total: 0};
  }, [queue, rows, origin]);
  const waypoint = useMemo(() => (pin && origin ? pinRow(pin, geo, origin) : null), [pin, origin, geo.lat, geo.lon]);
  const blips = useMemo(
    () => [...rows, ...(waypoint ? [waypoint] : [])].filter(row => row.range !== null).sort((a, b) => a.range! - b.range!),
    [rows, waypoint],
  );
  const target = targetId ? (targetId === PIN_ID ? waypoint : rows.find(row => row.id === targetId) ?? null) : null;
  const shows = useMemo(() => upcomingShows(parkLive.set, now), [parkLive.set, now]);
  const hoursNow = hoursLabel(park ? hours[park.id] ?? null : null, now);
  const ticker = useMemo(() => headlines(rows, shows, hoursNow), [rows, shows, hoursNow?.head, hoursNow?.detail]);
  // The sight view follows the wearer's head when there is a compass, and is panned by hand otherwise.
  const sightLive = !origin?.remote && heading !== null;
  const look = sightLive ? heading! : pan;

  const dataState: DataState = !parks
    ? parksFailed
      ? 'failed'
      : 'loading'
    : rows.length
      ? 'ok'
      : parkLive.failed
        ? 'failed'
        : parkLive.loading
          ? 'loading'
          : 'empty';

  // ---- Focus model --------------------------------------------------------
  // Cursor 0 is always the park switch in the header; the rest belong to the page.
  const maxCursor =
    page === 'system'
      ? 10
      : dataState !== 'ok'
        ? dataState === 'failed'
          ? 1
          : 0
        : page === 'overview'
          ? moves.length
          : page === 'shows'
            ? shows.length
            : page === 'sight'
              ? blips.length
                ? 1
                : 0
              : page === 'scan'
            ? SCAN_HEAD - 1 + scanRows.length
            : page === 'radar' || page === 'map'
              ? blips.length
                ? 1
                : 0
              : route.legs.length
                ? route.legs.length + 1
                : moves.length
                  ? 1
                  : 0;
  const cursor = Math.min(cursors[page], maxCursor);
  const selected = Math.min(radarIndex, Math.max(0, blips.length - 1));
  const focusedRide = useRef<string | null>(null);

  const setCursor = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(maxCursor, next));
      if (page === 'scan') focusedRide.current = clamped >= SCAN_HEAD ? scanRows[clamped - SCAN_HEAD]?.id ?? null : null;
      setCursors(current => (current[page] === clamped ? current : {...current, [page]: clamped}));
    },
    [maxCursor, page, scanRows],
  );

  // Keep the scan cursor on the same ride when fresh data or a new sort reorders the list.
  useEffect(() => {
    if (!focusedRide.current) return;
    const index = scanRows.findIndex(row => row.id === focusedRide.current);
    if (index >= 0) setCursors(current => (current.scan === index + SCAN_HEAD ? current : {...current, scan: index + SCAN_HEAD}));
  }, [scanRows]);

  const scanStart = useWindow(page === 'scan' ? cursor - SCAN_HEAD : -1, SCAN_PAGE, scanRows.length);
  const showsStart = useWindow(page === 'shows' ? cursor - 1 : -1, SHOWS_PAGE, shows.length);
  const missionStart = useWindow(page === 'mission' ? cursor - 1 : -1, MISSION_PAGE, route.legs.length);

  // ---- Actions ------------------------------------------------------------
  const refresh = useCallback(() => setReload(value => value + 1), []);

  const goPage = useCallback(
    (step: number) => {
      const index = (PAGES.indexOf(page) + step + PAGES.length) % PAGES.length;
      setArrival(step > 0 ? 'right' : 'left');
      setPage(PAGES[index]);
      sound.page();
    },
    [page],
  );

  const showPage = useCallback(
    (next: PageId) => {
      setArrival(PAGES.indexOf(next) >= PAGES.indexOf(page) ? 'right' : 'left');
      setPage(next);
      if (history.state?.target) history.back();
    },
    [page],
  );

  const switchPark = useCallback(
    (to?: number) => {
      if (!parks) return;
      const next = to ?? (parkIndex + 1) % parks.length;
      setParkIndex(next);
      setArrival('flip');
      save('park', next);
      focusedRide.current = null;
      setCursors(current => ({...current, scan: 0, mission: 0, overview: 0}));
      setRadarIndex(0);
      sound.select();
    },
    [parks, parkIndex],
  );

  const lockTarget = useCallback(
    (id: string, byGesture = true) => {
      setTargetId(id);
      setTargetCursor(0);
      if (!history.state?.target) history.pushState({target: id}, '');
      else history.replaceState({target: id}, '');
      sound.lock();
      if (!byGesture) return;
      // Location and compass are only ever switched on by a pinch.
      setSettings(current => (current.location ? current : {...current, location: true}));
      if (orientation === 'unknown' || orientation === 'denied') requestOrientation().then(setOrientation);
    },
    [orientation],
  );

  const toggleQueue = useCallback(
    (id: string, name: string) => {
      if (!park) return;
      const has = queue.includes(id);
      setQueues(current => ({...current, [park.id]: has ? queue.filter(q => q !== id) : [...queue, id]}));
      notify(has ? `REMOVED FROM MISSION: ${name}` : `ADDED TO MISSION: ${name}`);
      sound.select();
    },
    [park, queue, notify],
  );

  const addToQueue = useCallback(
    (ids: string[]) => {
      if (!park) return;
      setQueues(current => {
        const existing = current[park.id] ?? [];
        return {...current, [park.id]: [...existing, ...ids.filter(id => !existing.includes(id))]};
      });
    },
    [park],
  );

  const cycleAlert = useCallback(
    (row: Row) => {
      if (row.id === PIN_ID) {
        setPin(null);
        notify('PIN CLEARED');
        history.back();
        return;
      }
      const current = alerts[row.id];
      let next: AlertRule | undefined;
      if (row.status !== 'OPERATING') next = current === 'open' ? undefined : 'open';
      else {
        const steps = ALERT_STEPS.filter(step => row.wait !== null && step < row.wait);
        if (!steps.length) {
          notify('WAIT IS ALREADY SHORT');
          return;
        }
        const index = typeof current === 'number' ? steps.indexOf(current) : -1;
        next = index + 1 < steps.length ? steps[index + 1] : current === undefined ? steps[0] : undefined;
      }
      setAlerts(all => {
        const copy = {...all};
        if (next === undefined) delete copy[row.id];
        else copy[row.id] = next;
        return copy;
      });
      notify(
        next === undefined ? 'ALERT CLEARED' : next === 'open' ? 'ALERT WHEN IT REOPENS' : `ALERT AT ${next} MIN OR LESS`,
      );
      sound.select();
    },
    [alerts, notify],
  );

  // Fire and clear any alert whose condition is met by the latest readings.
  useEffect(() => {
    const fired = rows.filter(row => {
      const rule = alerts[row.id];
      if (rule === undefined || row.status !== 'OPERATING') return false;
      return rule === 'open' || (row.wait !== null && row.wait <= rule);
    });
    if (!fired.length) return;
    const first = fired[0];
    notify(
      `${first.name}: ${first.wait !== null ? `NOW ${first.wait} MIN` : 'NOW OPEN'}${fired.length > 1 ? `  +${fired.length - 1} MORE` : ''}`,
      'alert',
    );
    sound.alert();
    setAlerts(all => {
      const copy = {...all};
      for (const row of fired) delete copy[row.id];
      return copy;
    });
  }, [rows]);

  const toggleReminder = useCallback(
    (show: Show) => {
      const has = reminders[show.id] === show.next;
      setReminders(all => {
        const copy = {...all};
        if (has) delete copy[show.id];
        else copy[show.id] = show.next;
        return copy;
      });
      notify(has ? 'REMINDER CLEARED' : show.minutes > REMIND_MIN ? `REMINDER ${REMIND_MIN} MIN BEFORE: ${show.name}` : `REMINDER SET: ${show.name}`);
      sound.select();
    },
    [reminders, notify],
  );

  // Fire a show reminder once its start is close, and drop any that have passed.
  useEffect(() => {
    const due = Object.entries(reminders).filter(([, start]) => start - now <= REMIND_MIN * 60000);
    if (!due.length) return;
    const [id, start] = due[0];
    const name = shows.find(show => show.id === id)?.name;
    if (name && start > now - 60000) {
      const minutes = Math.max(0, Math.round((start - now) / 60000));
      notify(`${name}: ${minutes ? `STARTS IN ${minutes} MIN` : 'STARTING NOW'}`, 'alert');
      sound.alert();
    }
    setReminders(all => Object.fromEntries(Object.entries(all).filter(([key]) => !due.some(([dueId]) => dueId === key))));
  }, [now, reminders]);

  // Arrival: announce once, and tick the ride off the mission.
  const arrived = target !== null && target.distance !== null && geo.state === 'ok' && target.distance <= ARRIVE_M;
  const arrivedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!arrived || !target || !park) {
      if (!targetId) arrivedAt.current = null;
      return;
    }
    if (arrivedAt.current === target.id) return;
    arrivedAt.current = target.id;
    sound.arrive();
    if (queue.includes(target.id)) {
      setQueues(current => ({...current, [park.id]: queue.filter(id => id !== target.id)}));
      notify(`OBJECTIVE COMPLETE: ${target.name}`, 'alert');
    }
  }, [arrived, target?.id]);

  // The system Back gesture and Escape both return from the target view.
  useEffect(() => {
    if (history.state?.target) history.replaceState(null, '');
    const onPop = () => {
      setFlying(false);
      setTargetId(null);
      setArrival('back');
      sound.back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Glance mode: on the see-through display, a locked target fades to just the arrow and
  // distance after a few seconds without input, leaving the view ahead clear.
  const glanceOn = settings.glance !== false && display.mode === 'glasses';
  useEffect(() => {
    setGlance(false);
    if (targetId === null || flying || !glanceOn || !visible) return;
    lastInput.current = Date.now();
    const timer = setInterval(() => setGlance(Date.now() - lastInput.current >= GLANCE_MS), 1000);
    return () => clearInterval(timer);
  }, [targetId, flying, glanceOn, visible]);

  // A pin asked for before the first position fix drops as soon as the fix arrives.
  const pinPending = useRef(0);
  useEffect(() => {
    if (!pinPending.current || geo.state !== 'ok' || geo.lat === null || geo.lon === null) return;
    const fresh = Date.now() - pinPending.current < 60000;
    pinPending.current = 0;
    if (!fresh || pin) return;
    setPin({lat: geo.lat, lon: geo.lon, at: Date.now()});
    notify('PIN DROPPED HERE');
  }, [geo.state, geo.lat, geo.lon]);

  // Head control: flick the head to change view, nod to pinch.
  useHeadGestures(visible && !!settings.head && orientation === 'granted', gesture => {
    if (gesture === 'nod') (document.activeElement as HTMLElement | null)?.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', {key: gesture === 'flick-right' ? 'ArrowRight' : 'ArrowLeft', bubbles: true, cancelable: true}));
  });

  // Gaze lock: with head control on, holding a ride in the sight view locks it.
  const gazeId = page === 'sight' && targetId === null && sightLive && settings.head ? sighted(blips, look)?.id ?? null : null;
  useEffect(() => {
    if (!gazeId) return;
    const timer = setTimeout(() => lockTarget(gazeId, false), DWELL_MS);
    return () => clearTimeout(timer);
  }, [gazeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (booting) setBooting(false);
      lastInput.current = Date.now();
      if (glance) {
        // The first input only wakes the display.
        setGlance(false);
        event.preventDefault();
        return;
      }
      if (targetId !== null) {
        if (event.key === 'Escape') {
          event.preventDefault();
          history.back();
        } else if (display.touch && event.key === 'ArrowLeft' && !event.isTrusted) {
          // A rightward swipe on a phone, which has no system Back gesture inside a web app.
          event.preventDefault();
          history.back();
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          setTargetCursor(value => Math.min(TARGET_ACTIONS - 1, value + 1));
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          setTargetCursor(value => Math.max(0, value - 1));
        }
        return;
      }
      const onRadar = (page === 'radar' || page === 'map') && cursor === 1;
      const panning = page === 'sight' && cursor === 1 && !sightLive;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (panning) setPan(value => (value + PAN_STEP) % 360);
          else if (onRadar) setRadarIndex(Math.min(blips.length - 1, selected + 1));
          else setCursor(cursor + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (onRadar && selected > 0) setRadarIndex(selected - 1);
          else setCursor(cursor - 1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          goPage(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          goPage(-1);
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [booting, glance, targetId, page, cursor, selected, blips.length, setCursor, goPage, display.touch, sightLive]);

  // Focus follows the cursor, including on return from the target view.
  useEffect(() => {
    const selector = target ? `[data-target-action="${flying ? 0 : targetCursor}"]` : `[data-cursor="${cursor}"]`;
    document.querySelector<HTMLElement>(selector)?.focus({preventScroll: true});
  }, [target?.id, flying, targetCursor, page, cursor, scanStart, missionStart, showsStart, shows.length, dataState, scanRows, route.legs.length, moves.length]);

  // ---- Voice --------------------------------------------------------------
  const voice = useRef<VoiceApi>(null!);
  voice.current = {
    parkName: () => park?.name ?? 'the park',
    otherParks: () => (parks ?? []).filter(p => p !== park).map(p => p.name),
    rows: () => rows,
    stats: () => stats,
    moves: () => moves,
    mission: () => route.legs.map(leg => leg.row),
    showOverview: () => showPage('overview'),
    showMission: () => showPage('mission'),
    lock: id => lockTarget(id, false),
    setAlert: (id, rule) => setAlerts(all => ({...all, [id]: rule})),
    addToMission: addToQueue,
    switchPark: name => {
      const index = (parks ?? []).findIndex(p =>
        /adventure|dca/i.test(name) ? p.key === 'DCA' : /disneyland|land/i.test(name) && p.key === 'DL',
      );
      if (index < 0) return null;
      if (index !== parkIndex) switchPark(index);
      return parks![index].name;
    },
  };
  useEffect(() => {
    const controller = new AbortController();
    const api = Object.fromEntries(
      Object.keys(voice.current).map(key => [key, (...args: unknown[]) => (voice.current as any)[key](...args)]),
    ) as VoiceApi;
    registerVoice(api, controller.signal);
    return () => controller.abort();
  }, []);

  // ---- Render -------------------------------------------------------------
  const boot = booting ? <Boot onDone={() => setBooting(false)} /> : null;
  const overlay = banner ? <Banner banner={banner} /> : null;

  let primary;
  let body;
  let footer = '';
  if (target && park && flying) {
    primary = (
      <>
        <Flight rideId={target.id} rideName={target.name} onEnd={() => setFlying(false)} />
        {overlay}
      </>
    );
  } else if (target && park) {
    primary = (
      <>
        <TargetScreen
          park={park}
          row={target}
          geo={geo}
          heading={heading}
          headingSource={
            compass !== null ? 'COMPASS' : course !== null ? 'GPS COURSE' : orientation === 'denied' ? 'COMPASS DENIED' : null
          }
          arrived={arrived}
          queued={queue.includes(target.id)}
          alert={alerts[target.id]}
          glance={glance}
          alertLabel={target.id === PIN_ID ? 'CLEAR PIN' : undefined}
          fetchedAt={parkLive.set?.fetchedAt ?? null}
          loading={parkLive.loading}
          failed={parkLive.failed}
          now={now}
          onFocusAction={setTargetCursor}
          onQueue={() => (target.id === PIN_ID ? notify('A PIN CANNOT JOIN A MISSION') : toggleQueue(target.id, target.name))}
          onAlert={() => cycleAlert(target)}
          onRescan={refresh}
          onFlight={() => {
            // Motion access has to be requested from this pinch.
            requestMotion();
            if (orientation !== 'granted') requestOrientation().then(setOrientation);
            setTargetCursor(0);
            setFlying(true);
            sound.lock();
          }}
        />
        {display.touch ? (
          <button type="button" className="phone-back" onClick={() => history.back()}>
            ◂ BACK
          </button>
        ) : null}
        {overlay}
      </>
    );
  } else {

  const common = {cursor, onFocusCursor: setCursor};
  if (page === 'system') {
    body = (
      <System
        {...common}
        settings={{...settings, flipCompass, theme: settings.theme ?? THEMES[0]}}
        geo={geo}
        alertCount={Object.keys(alerts).length}
        dataState={dataState}
        display={display.mode}
        onSound={() => {
          setSettings(current => ({...current, sound: !current.sound}));
          if (!settings.sound) {
            setSoundEnabled(true);
            sound.select();
          }
        }}
        onLocation={() => {
          setSettings(current => ({...current, location: !current.location}));
          sound.select();
        }}
        onCompass={() => {
          setSettings(current => ({...current, flipCompass: !flipCompass}));
          sound.select();
        }}
        hasPin={pin !== null}
        onHead={() => {
          const next = !settings.head;
          setSettings(current => ({...current, head: next}));
          // Reading head motion needs the same permission as the compass, asked for on this pinch.
          if (next && orientation !== 'granted') requestOrientation().then(setOrientation);
          notify(next ? 'HEAD CONTROL ON: FLICK TO TURN PAGES, NOD TO PINCH' : 'HEAD CONTROL OFF');
          sound.select();
        }}
        onGlance={() => {
          setSettings(current => ({...current, glance: current.glance === false}));
          sound.select();
        }}
        onPin={() => {
          if (pin) {
            lockTarget(PIN_ID);
            return;
          }
          if (geo.state === 'ok' && geo.lat !== null && geo.lon !== null) {
            setPin({lat: geo.lat, lon: geo.lon, at: Date.now()});
            notify('PIN DROPPED HERE');
            sound.lock();
          } else {
            setSettings(current => (current.location ? current : {...current, location: true}));
            pinPending.current = Date.now();
            notify('FINDING YOUR POSITION: THE PIN DROPS WHEN IT IS FOUND');
          }
        }}
        onFlat={() => {
          setSettings(current => ({...current, flat: !current.flat}));
          sound.select();
        }}
        onTheme={() => {
          const index = THEMES.indexOf(settings.theme ?? THEMES[0]);
          setSettings(current => ({...current, theme: THEMES[(index + 1) % THEMES.length]}));
          sound.select();
        }}
        onClearAlerts={() => {
          setAlerts({});
          notify('ALL ALERTS CLEARED');
        }}
        onResetTrends={() => {
          clearHistory();
          refresh();
          notify('TREND DATA RESET');
        }}
      />
    );
    footer = 'SYSTEM';
  } else if (dataState !== 'ok') {
    body = <StatePanel state={dataState} onRetry={refresh} />;
    footer = '-- / --';
  } else if (page === 'overview') {
    body = <Overview {...common} stats={stats!} moves={moves} remote={origin?.remote ?? true} onLock={lockTarget} />;
    footer = `${stats!.open} OPEN  /  ${stats!.down} DOWN`;
  } else if (page === 'scan') {
    body = (
      <Scan
        {...common}
        rows={scanRows}
        start={scanStart}
        sort={sort}
        land={land}
        geo={geo}
        located={settings.location}
        remote={origin?.remote ?? true}
        alerts={alerts}
        queue={queue}
        onSort={() => {
          const next = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];
          setSort(next);
          if (next === 'near') setSettings(current => (current.location ? current : {...current, location: true}));
          sound.select();
        }}
        onLand={() => {
          if (!park) return;
          const options = [null, ...lands];
          const next = options[(options.indexOf(land) + 1) % options.length];
          setLandByPark(current => ({...current, [park.id]: next}));
          sound.select();
        }}
        onLock={lockTarget}
      />
    );
    footer = `${String(Math.max(cursor - SCAN_HEAD + 1, 1)).padStart(2, '0')} / ${scanRows.length}`;
  } else if (page === 'sight') {
    body = <Sight {...common} blips={blips} look={look} live={sightLive} remote={origin?.remote ?? true} dwell={!!settings.head && sightLive} onLock={lockTarget} />;
    const aimed = sighted(blips, look);
    footer = aimed ? 'RIDE SIGHTED' : `${blips.length} IN RANGE`;
  } else if (page === 'shows') {
    body = (
      <Shows
        {...common}
        shows={shows}
        start={showsStart}
        hours={hoursLabel(park ? hours[park.id] ?? null : null, now)}
        reminders={reminders}
        onRemind={toggleReminder}
      />
    );
    footer = shows.length ? `${String(Math.max(cursor, 1)).padStart(2, '0')} / ${shows.length}` : 'NO SHOWS';
  } else if (page === 'map') {
    body = settings.flat ? (
      <div className="empty">
        <p>3D VIEWS ARE OFF</p>
        <p className="empty-sub">Turn them on in the System view.</p>
      </div>
    ) : (
      <Holo
        {...common}
        mode="map"
        park={park!}
        blips={blips}
        selected={selected}
        heading={heading}
        origin={origin!}
        mission={queue}
        theme={settings.theme ?? THEMES[0]}
        onLock={lockTarget}
        fallback={
          <div className="empty">
            <p>3D NOT AVAILABLE</p>
            <p className="empty-sub">This display could not start WebGL.</p>
          </div>
        }
      />
    );
    footer = blips.length ? `${String(selected + 1).padStart(2, '0')} / ${blips.length}` : '-- / --';
  } else if (page === 'radar') {
    const flat = (
      <Radar
        {...common}
        blips={blips}
        selected={selected}
        heading={origin?.remote ? null : heading}
        remote={origin?.remote ?? true}
        onLock={lockTarget}
      />
    );
    body = settings.flat ? (
      flat
    ) : (
      <Holo
        {...common}
        mode="radar"
        park={park!}
        blips={blips}
        selected={selected}
        heading={heading}
        origin={origin!}
        mission={queue}
        theme={settings.theme ?? THEMES[0]}
        onLock={lockTarget}
        fallback={flat}
      />
    );
    footer = blips.length ? `${String(selected + 1).padStart(2, '0')} / ${blips.length}` : '-- / --';
  } else {
    body = (
      <Mission
        {...common}
        route={route}
        start={missionStart}
        remote={origin?.remote ?? true}
        canAutoPlan={moves.length > 0}
        onLock={lockTarget}
        onAutoPlan={() => {
          addToQueue(moves.map(move => move.row.id));
          notify(`MISSION PLANNED: ${moves.length} OBJECTIVES`);
          sound.lock();
        }}
        onClear={() => {
          if (park) setQueues(current => ({...current, [park.id]: []}));
          setCursors(current => ({...current, mission: 0}));
          notify('MISSION CLEARED');
        }}
      />
    );
    footer = route.legs.length ? `${route.legs.length} OBJECTIVES` : 'NO OBJECTIVES';
  }

  const track =
    page === 'scan' && scanRows.length > SCAN_PAGE
      ? {start: scanStart / scanRows.length, size: SCAN_PAGE / scanRows.length}
      : page === 'shows' && shows.length > SHOWS_PAGE
        ? {start: showsStart / shows.length, size: SHOWS_PAGE / shows.length}
        : (page === 'radar' || page === 'map') && blips.length > 1
        ? {start: selected / blips.length, size: 1 / blips.length}
        : null;

  primary = (
    <>
      <main className="hud" data-testid={`page-${page}`}>
        <Header
          page={page}
          parks={parks}
          park={park}
          focused={cursor === 0}
          loading={!parks ? !parksFailed : parkLive.loading}
          failed={parksFailed || parkLive.failed}
          fetchedAt={parkLive.set?.fetchedAt ?? null}
          now={now}
          onFocus={() => setCursor(0)}
          onSwitch={() => switchPark()}
          onSelect={display.touch ? showPage : undefined}
        />
        <div key={`${page}-${park?.id ?? ''}`} className={`page from-${arrival} ${entering ? 'is-entering' : ''}`}>
          {body}
        </div>
        {entering ? <i key={`wipe-${page}-${park?.id ?? ''}`} className={`wipe wipe-${arrival}`} aria-hidden="true" /> : null}
        <Footer text={footer} track={track} ticker={ticker} />
        <Rails position={track ? track.start + track.size / 2 : null} />
      </main>
      {overlay}
      {boot}
    </>
  );
  }

  if (display.mode === 'glasses') return primary;

  // Second pane: the radar rides along with whatever the main pane shows, and the
  // overview takes its place while the main pane is the radar itself.
  let companion = null;
  if (display.layout === 'dual' && dataState === 'ok') {
    const showRadar = target !== null || page !== 'radar';
    const tracked = target ? blips.findIndex(row => row.id === target.id) : -1;
    companion = (
      <main className="hud companion">
        <header className="top">
          <p className="eyebrow">{`LINKED DISPLAY  /  ${showRadar ? (tracked >= 0 ? 'TRACKING' : 'RADAR') : 'OVERVIEW'}`}</p>
        </header>
        <div key={showRadar ? 'radar' : 'overview'} className="page from-right is-entering">
          {showRadar ? (
            <Radar
              cursor={-1}
              onFocusCursor={() => {}}
              blips={blips}
              selected={tracked >= 0 ? tracked : selected}
              heading={origin?.remote ? null : heading}
              remote={origin?.remote ?? true}
              onLock={lockTarget}
            />
          ) : (
            <Overview cursor={-1} onFocusCursor={() => {}} stats={stats!} moves={moves} remote={origin?.remote ?? true} onLock={lockTarget} />
          )}
        </div>
      </main>
    );
  }

  const size = PANE * display.scale;
  const slot = {width: size, height: size};
  const pane = {transform: `scale(${display.scale})`};
  return (
    <div className={`stage ${display.vertical ? 'is-vertical' : ''}`}>
      <div className="slot" style={slot}>
        <div className="pane" style={pane}>
          {primary}
        </div>
      </div>
      {companion ? (
        <div className="slot" style={slot}>
          <div className="pane" style={pane} inert>
            {companion}
          </div>
        </div>
      ) : null}
      {display.layout === 'deck' ? (
        <div className="slot" style={{width: display.deckWidth * display.scale, height: display.deckHeight * display.scale}}>
          <div className="pane" style={{...pane, width: display.deckWidth, height: display.deckHeight}}>
            <Deck
              width={display.deckWidth}
              height={display.deckHeight}
              blips={blips}
              focusId={target?.id ?? (page === 'radar' ? blips[selected]?.id ?? null : null)}
              heading={origin?.remote ? null : heading}
              target={target}
              move={moves[0] ?? null}
              show={shows[0] ?? null}
              hours={hoursNow}
              onLock={lockTarget}
              onShows={() => showPage('shows')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
