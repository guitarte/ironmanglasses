import {useEffect, useRef, useState} from 'react';

const ROLL_MS = 520;

/** A number that rolls to its new value when it changes, like an instrument settling. */
export function Count({value, fromZero = false}: {value: number; fromZero?: boolean}) {
  const [shown, setShown] = useState(fromZero ? 0 : value);
  const current = useRef(shown);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / ROLL_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = Math.round(from + (value - from) * eased);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      current.current = value;
    };
  }, [value]);

  return <>{shown}</>;
}
