import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {cachedLive, fetchLive, loadParks, type LiveSet, type Park} from './api';
import {HEAD, ListScreen, PAGE_SIZE} from './ListScreen';
import {buildRows, landsPresent, SORTS, type Sort} from './model';
import {requestOrientation, useCompass, useGeo, useVisible, type OrientationPermission} from './sensors';
import {TargetScreen} from './TargetScreen';

// The source republishes every few minutes; 30 s keeps the display close behind it.
const POLL_MS = 30000;

type LiveState = {set: LiveSet | null; loading: boolean; failed: boolean};
const EMPTY: LiveState = {set: null, loading: true, failed: false};

function storedPark(): number {
  try {
    return Number(localStorage.getItem('parkhud.park')) || 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const visible = useVisible();
  const [parks, setParks] = useState<Park[] | null>(null);
  const [parksFailed, setParksFailed] = useState(false);
  const [parkIndex, setParkIndex] = useState(storedPark);
  const [sort, setSort] = useState<Sort>('wait');
  const [landByPark, setLandByPark] = useState<Record<string, string | null>>({});
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [targetId, setTargetId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [orientation, setOrientation] = useState<OrientationPermission>('unknown');
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);

  const park = parks ? parks[Math.min(parkIndex, parks.length - 1)] : null;
  const parkLive = (park && live[park.id]) || EMPTY;

  const geo = useGeo(visible && (sort === 'near' || targetId !== null));
  const compass = useCompass(visible && targetId !== null);

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
        set => setLive(current => ({...current, [id]: {set, loading: false, failed: false}})),
        () => {
          if (controller.signal.aborted) return;
          setLive(current => ({
            ...current,
            [id]: {set: current[id]?.set ?? null, loading: false, failed: true},
          }));
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

  // Clock for the data-age readout.
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(timer);
  }, [visible]);

  const lands = useMemo(() => (park ? landsPresent(park, parkLive.set) : []), [park, parkLive.set]);
  const chosen = park ? landByPark[park.id] ?? null : null;
  // A land that stops reporting (or a stale choice) falls back to the whole park.
  const land = chosen && lands.includes(chosen) ? chosen : null;
  const rows = useMemo(
    () => (park ? buildRows(park, parkLive.set, geo, sort, land) : []),
    [park, parkLive.set, geo.lat, geo.lon, sort, land],
  );
  const cycleLand = useCallback(() => {
    if (!park) return;
    const options = [null, ...lands];
    const next = options[(options.indexOf(land) + 1) % options.length];
    setLandByPark(current => ({...current, [park.id]: next}));
  }, [park, lands, land]);
  const target = targetId ? rows.find(row => row.id === targetId) ?? null : null;

  // Cursors below HEAD are the sort and area controls; rows follow. With no rows,
  // HEAD is Retry when shown.
  const showRetry = rows.length === 0 && (parksFailed || parkLive.failed);
  const maxCursor = HEAD - 1 + (rows.length || (showRetry ? 1 : 0));
  const focusedId = useRef<string | null>(null);

  const moveCursor = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(maxCursor, next));
      focusedId.current = clamped >= HEAD ? rows[clamped - HEAD]?.id ?? null : null;
      setCursor(clamped);
    },
    [maxCursor, rows],
  );

  // Keep the cursor on the same ride when fresh data or a new sort reorders the list.
  useEffect(() => {
    if (focusedId.current) {
      const index = rows.findIndex(row => row.id === focusedId.current);
      if (index >= 0) {
        if (index + HEAD !== cursor) setCursor(index + HEAD);
        return;
      }
    }
    if (cursor > maxCursor) setCursor(maxCursor);
  }, [rows, maxCursor]);

  const start = useRef(0);
  let windowStart = start.current;
  if (cursor >= HEAD) {
    const row = cursor - HEAD;
    if (row < windowStart) windowStart = row;
    else if (row >= windowStart + PAGE_SIZE) windowStart = row - PAGE_SIZE + 1;
  }
  windowStart = Math.max(0, Math.min(windowStart, Math.max(0, rows.length - PAGE_SIZE)));
  start.current = windowStart;

  const switchPark = useCallback(
    (step: number) => {
      if (!parks) return;
      const next = (parkIndex + step + parks.length) % parks.length;
      setParkIndex(next);
      focusedId.current = null;
      setCursor(0);
      start.current = 0;
      try {
        localStorage.setItem('parkhud.park', String(next));
      } catch {
        /* optional */
      }
    },
    [parks, parkIndex],
  );

  const lockTarget = useCallback(
    (id: string) => {
      focusedId.current = id;
      setTargetId(id);
      history.pushState({target: id}, '');
      if (orientation === 'unknown' || orientation === 'denied') {
        requestOrientation().then(setOrientation);
      }
    },
    [orientation],
  );

  // The system Back gesture and Escape both return to the list.
  useEffect(() => {
    if (history.state?.target) history.replaceState(null, '');
    const onPop = () => setTargetId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (targetId !== null) {
        if (event.key === 'Escape') {
          event.preventDefault();
          history.back();
        } else if (event.key.startsWith('Arrow')) event.preventDefault();
        return;
      }
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveCursor(cursor + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveCursor(cursor - 1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          switchPark(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          switchPark(-1);
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [targetId, cursor, moveCursor, switchPark]);

  // Focus follows the cursor, including on return from the target view.
  useEffect(() => {
    const selector = targetId !== null ? '[data-target-action]' : `[data-cursor="${cursor}"]`;
    document.querySelector<HTMLElement>(selector)?.focus({preventScroll: true});
  }, [targetId, cursor, windowStart, rows, showRetry]);

  const refresh = useCallback(() => setReload(value => value + 1), []);

  if (target && park) {
    const course = geo.speed !== null && geo.speed > 0.7 ? geo.course : null;
    return (
      <TargetScreen
        park={park}
        row={target}
        geo={geo}
        heading={compass ?? course}
        headingSource={
          compass !== null
            ? 'COMPASS'
            : course !== null
              ? 'GPS COURSE'
              : orientation === 'denied'
                ? 'COMPASS DENIED'
                : null
        }
        fetchedAt={parkLive.set?.fetchedAt ?? null}
        loading={parkLive.loading}
        failed={parkLive.failed}
        now={now}
        onRescan={refresh}
      />
    );
  }

  return (
    <ListScreen
      parks={parks}
      park={park}
      rows={rows}
      windowStart={windowStart}
      cursor={cursor}
      sort={sort}
      land={land}
      onLand={cycleLand}
      geo={geo}
      loading={!parks ? !parksFailed : parkLive.loading}
      failed={parksFailed || parkLive.failed}
      showRetry={showRetry}
      fetchedAt={parkLive.set?.fetchedAt ?? null}
      now={now}
      onFocusCursor={moveCursor}
      onSort={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}
      onLock={lockTarget}
      onRetry={refresh}
    />
  );
}
