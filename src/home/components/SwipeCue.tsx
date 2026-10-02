import { useEffect, useState, type RefObject } from 'react';

type SwipeCueProps = {
  /** The sideways-scrolling row this cue sits on. */
  rail: RefObject<HTMLElement | null>;
  tone?: 'light' | 'dark';
  /** Breakpoint/motion classes that hide the cue where the row is not a swipe rail. */
  className?: string;
};

/**
 * A pulsing arrow on the right edge of a phone rail saying "there is more this way".
 * It fades out once the row has been swiped, or if everything already fits.
 */
export function SwipeCue({ rail, tone = 'light', className = '' }: SwipeCueProps) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = rail.current;
    if (!el || done) return undefined;
    const check = () => {
      if (el.scrollLeft > 24 || el.scrollWidth <= el.clientWidth + 4) setDone(true);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [rail, done]);

  const dark = tone === 'dark';
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 right-3 z-10 -translate-y-1/2 transition-opacity duration-500 ${done ? 'opacity-0' : 'opacity-100'} ${className}`}
    >
      <span className={`grid size-11 animate-cue-ring place-items-center rounded-full shadow-[0_12px_30px_-10px_rgb(16_35_51/0.7)] ${dark ? 'bg-white text-night-900' : 'bg-ink text-snow'}`}>
        <svg viewBox="0 0 24 24" className="size-5 animate-nudge-x" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
    </span>
  );
}
