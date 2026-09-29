import { useRef } from 'react';
import { MARQUEE_ITEMS, TIMELINE } from '../data/content';
import { gsap, useGsap } from '../lib/gsap';
import { Chapter } from './Chapter';

export function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="relative overflow-hidden bg-ink py-4 text-snow" aria-hidden="true">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap will-change-transform">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-3 font-display text-lg font-medium tracking-[-0.01em] sm:text-xl">
            <span className="size-2 rounded-full bg-aqua" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Timeline() {
  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLOListElement>(null);

  useGsap(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    if (!root || !rail) return;
    const mm = gsap.matchMedia();
    // Wide screens: pin the chapter and walk the rail sideways with the scroll.
    // Narrow screens keep a native swipe rail (scroll-snap), which feels better on touch.
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      const distance = () => Math.max(0, rail.scrollWidth - rail.clientWidth);
      gsap.to(rail, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: () => `+=${distance() + window.innerHeight * 0.35}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
      gsap.to('[data-rail-progress]', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: () => `+=${distance() + window.innerHeight * 0.35}`, scrub: true, invalidateOnRefresh: true },
      });
    });
  }, rootRef);

  return (
    <section ref={rootRef} id="journey" className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden bg-[linear-gradient(180deg,var(--color-sand)_0%,var(--color-ice-50)_70%)] py-24">
      <div className="shell">
        <Chapter num="01" kicker="On-chain" title="The road from collector to operator." />
        <div className="mt-6 hidden h-px w-full max-w-md overflow-hidden bg-ink/10 min-[900px]:block" aria-hidden="true">
          <i data-rail-progress className="block h-full origin-left scale-x-0 bg-teal" />
        </div>
      </div>
      <ol
        ref={railRef}
        className="no-scrollbar mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-6 sm:scroll-px-8 sm:px-8 min-[900px]:gap-6 min-[900px]:pl-[max(2rem,calc((100vw_-_1240px)/2_+_2rem))] min-[900px]:pr-[20vw] motion-safe:min-[900px]:snap-none motion-safe:min-[900px]:overflow-visible"
        aria-label="Timeline"
      >
        {TIMELINE.map((entry, index) => (
          <li
            key={`${entry.year}-${entry.tag}`}
            className="card group relative flex w-[min(78vw,300px)] shrink-0 snap-start flex-col p-6 transition-transform duration-500 ease-(--ease-out-expo) hover:-translate-y-1.5 min-[900px]:w-[340px] min-[900px]:p-7"
          >
            <span className="font-mono text-[11px] tracking-[0.2em] text-ink-mute">{String(index + 1).padStart(2, '0')} / {TIMELINE.length}</span>
            <span className="mt-6 font-display text-6xl leading-none font-semibold tracking-[-0.05em] text-ink">{entry.year}</span>
            <span className="kicker mt-4 text-teal">{entry.tag}</span>
            <p className="mt-3 text-[15px] leading-relaxed text-pretty text-ink-soft">{entry.body}</p>
            <span className="absolute top-6 right-6 size-2.5 rounded-full bg-ice-300 ring-4 ring-ice-100 transition-colors group-hover:bg-aqua" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </section>
  );
}
