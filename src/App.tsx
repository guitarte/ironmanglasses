import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {bestMoves, planRoute} from './advisor';
import {cachedLive, fetchLive, loadParks, type LiveSet, type Park} from './api';
import {clearHistory, recordHistory} from './history';
import {buildRows, landsPresent, originFor, parkStats, sortRows, SORTS, type Row, type Sort} from './model';
import {Mission, MISSION_PAGE} from './pages/Mission';
import {Overview} from './pages/Overview';
import {Radar} from './pages/Radar';
import {Scan, SCAN_HEAD, SCAN_PAGE} from './pages/Scan';
import {System} from './pages/System';
import {requestOrientation, useCompass, useGeo, useVisible, type OrientationPermission} from './sensors';
import {Banner, Boot, Footer, Header, PAGES, StatePanel, type BannerState, type DataState, type PageId} from './Shell';
import {setSoundEnabled, sound} from './sound';
import {load, save} from './store';
import {ALERT_STEPS, TARGET_ACTIONS, TargetScreen} from './TargetScreen';
import {registerVoice, type VoiceApi} from './voice';

const POLL_MS = 30000;
const ARRIVE_M = 35;

type LiveState = {set: LiveSet | null; loading: boolean; failed: boolean};
const EMPTY: LiveState = {set: null, loading: true, failed: false};
type Settings = {sound: boolean; location: boolean};
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
  const [direction, setDirection] = useState(1);
  const [cursors, setCursors] = useState<Record<PageId, number>>({overview: 0, scan: 0, radar: 0, mission: 0, system: 0});
  const [sort, setSort] = useState<Sort>('wait');
  const [landByPark, setLandByPark] = useState<Record<string, string | null>>({});
  const [radarIndex, setRadarIndex] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetCursor, setTargetCursor] = useState(0);
  const [orientation, setOrientation] = useState<OrientationPermission>('unknown');
  const [settings, setSettings] = useState<Settings>(() => load('settings', {sound: true, location: false}));
  const [queues, setQueues] = useState<Record<string, string[]>>(() => load('queues', {}));
  const [alerts, setAlerts] = useState<Record<string, AlertRule>>(() => load('alerts', {}));
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [booting, setBooting] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => save('settings', settings), [settings]);
  useEffect(() => save('queues', queues), [queues]);
  useEffect(() => save('alerts', alerts), [alerts]);
  useEffect(() => save('page', page), [page]);
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  const park = parks ? parks[Math.min(parkIndex, parks.length - 1)] : null;
  const parkLive = (park && live[park.id]) || EMPTY;

  const geo = useGeo(visible && settings.location);
  const compass = useCompass(visible && (targetId !== null || page === 'radar'));
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
  const blips = useMemo(
    () => rows.filter(row => row.range !== null).sort((a, b) => a.range! - b.range!),
    [rows],
  );
  const target = targetId ? rows.find(row => row.id === targetId) ?? null : null;

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
      ? 4
      : dataState !== 'ok'
        ? dataState === 'failed'
          ? 1
          : 0
        : page === 'overview'
          ? moves.length
          : page === 'scan'
            ? SCAN_HEAD - 1 + scanRows.length
            : page === 'radar'
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
  const missionStart = useWindow(page === 'mission' ? cursor - 1 : -1, MISSION_PAGE, route.legs.length);

  // ---- Actions ------------------------------------------------------------
  const refresh = useCallback(() => setReload(value => value + 1), []);

  const goPage = useCallback(
    (step: number) => {
      const index = (PAGES.indexOf(page) + step + PAGES.length) % PAGES.length;
      setDirection(step);
      setPage(PAGES[index]);
      sound.page();
    },
    [page],
  );

  const showPage = useCallback(
    (next: PageId) => {
      setDirection(PAGES.indexOf(next) >= PAGES.indexOf(page) ? 1 : -1);
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
      setTargetId(null);
      sound.back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (booting) setBooting(false);
      if (targetId !== null) {
        if (event.key === 'Escape') {
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
      const onRadar = page === 'radar' && cursor === 1;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (onRadar) setRadarIndex(Math.min(blips.length - 1, selected + 1));
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
  }, [booting, targetId, page, cursor, selected, blips.length, setCursor, goPage]);

  // Focus follows the cursor, including on return from the target view.
  useEffect(() => {
    const selector = target ? `[data-target-action="${targetCursor}"]` : `[data-cursor="${cursor}"]`;
    document.querySelector<HTMLElement>(selector)?.focus({preventScroll: true});
  }, [target?.id, targetCursor, page, cursor, scanStart, missionStart, dataState, scanRows, route.legs.length, moves.length]);

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

  if (target && park) {
    return (
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
          fetchedAt={parkLive.set?.fetchedAt ?? null}
          loading={parkLive.loading}
          failed={parkLive.failed}
          now={now}
          onFocusAction={setTargetCursor}
          onQueue={() => toggleQueue(target.id, target.name)}
          onAlert={() => cycleAlert(target)}
          onRescan={refresh}
        />
        {overlay}
      </>
    );
  }

  const common = {cursor, onFocusCursor: setCursor};
  let body;
  let footer = '';
  if (page === 'system') {
    body = (
      <System
        {...common}
        settings={settings}
        geo={geo}
        alertCount={Object.keys(alerts).length}
        dataState={dataState}
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
  } else if (page === 'radar') {
    body = (
      <Radar
        {...common}
        blips={blips}
        selected={selected}
        heading={origin?.remote ? null : heading}
        remote={origin?.remote ?? true}
        onLock={lockTarget}
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
      : page === 'radar' && blips.length > 1
        ? {start: selected / blips.length, size: 1 / blips.length}
        : null;

  return (
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
        />
        <div key={page} className={`page ${direction > 0 ? 'from-right' : 'from-left'}`}>
          {body}
        </div>
        <Footer text={footer} track={track} />
      </main>
      {overlay}
      {boot}
    </>
  );
}
