import { useRef } from 'react';
import { MARQUEE_ITEMS, TIMELINE } from '../data/content';
import { gsap, useGsap } from '../lib/gsap';
import { Chapter } from './Chapter';
import { SwipeCue } from './SwipeCue';

export function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="relative overflow-hidden bg-ink py-3 text-snow sm:py-4" aria-hidden="true">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap will-change-transform">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-3 font-display text-base font-medium tracking-[-0.01em] sm:text-xl">
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
    // Pin the chapter and walk the rail sideways with the vertical scroll, on
    // phones too. The backdrop drifts slower than the cards and the cards bob at
    // alternating depths, so the walk reads as parallax rather than a slide.
    // Reduced motion keeps a native swipe rail (scroll-snap) instead.
    mm.add({ wide: '(min-width: 900px)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
      const { wide, motion } = context.conditions as { wide: boolean; motion: boolean };
      if (!motion) return;
      // Travel until the last card sits on the page gutter (scrollWidth ignores
      // trailing padding while the rail is overflow-visible).
      const last = rail.lastElementChild as HTMLElement | null;
      const gutter = () => (wide ? Math.max(32, (window.innerWidth - 1240) / 2 + 32) : 20);
      const distance = () => (last ? Math.max(0, last.offsetLeft + last.offsetWidth + gutter() - rail.clientWidth) : 0);
      // Phones move the rail faster than the finger so the pin stays short.
      const length = () => (wide ? distance() + window.innerHeight * 0.35 : Math.min(Math.max(distance() * 0.62, window.innerHeight * 1.1), window.innerHeight * 1.6));
      const cards = gsap.utils.toArray<HTMLElement>('[data-rail-card]', rail);
      const depth = wide ? 18 : 12;

      const walk = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: () => `+=${length()}`,
          pin: true,
          scrub: wide ? 0.8 : 0.5,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
      walk
        .to(rail, { x: () => -distance(), duration: 1 }, 0)
        .fromTo('[data-rail-backdrop]', { x: 0 }, { x: () => -distance() * 0.3, duration: 1 }, 0)
        .fromTo('[data-rail-progress]', { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0)
        .fromTo('[data-rail-year]', { xPercent: 7 }, { xPercent: -7, duration: 1 }, 0);
      cards.forEach((card, index) => {
        const sign = index % 2 ? 1 : -1;
        walk.fromTo(card, { y: sign * depth }, { y: -sign * depth, duration: 1 }, 0);
      });
    });
  }, rootRef);

  return (
    <section
      ref={rootRef}
      id="journey"
      className="relative flex flex-col justify-center overflow-hidden bg-[linear-gradient(180deg,var(--color-sand)_0%,var(--color-ice-50)_70%)] motion-safe:min-h-[100svh] pt-[calc(4.5rem+env(safe-area-inset-top))] pb-10 min-[56.25rem]:py-24 [@media(max-height:700px)]:pt-[calc(3.5rem+env(safe-area-inset-top))] [@media(max-height:700px)]:pb-4"
    >
      <div
        data-rail-backdrop
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[300%] bg-[radial-gradient(circle_at_12%_30%,rgb(255_255_255/0.85),transparent_22%),radial-gradient(circle_at_46%_70%,rgb(127_200_214/0.22),transparent_24%),radial-gradient(circle_at_78%_28%,rgb(255_188_111/0.18),transparent_22%),repeating-linear-gradient(90deg,transparent_0_58px,rgb(16_35_51/0.045)_59px_60px)] will-change-transform"
      />
      <div className="shell relative">
        <Chapter num="01" kicker="On-chain" title="The road from collector to operator." titleClassName="[@media(max-height:700px)_and_(max-width:899px)]:text-[1.75rem]" />
        <div className="mt-5 flex max-w-md items-center gap-3 motion-reduce:hidden min-[56.25rem]:mt-6 [@media(max-height:700px)]:mt-3" aria-hidden="true">
          <span className="h-px flex-1 overflow-hidden bg-ink/10">
            <i data-rail-progress className="block h-full origin-left scale-x-0 bg-teal" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-ink-mute uppercase min-[56.25rem]:hidden">
            scroll <span className="inline-block animate-nudge-x">→</span>
          </span>
        </div>
      </div>
      <div className="relative">
        <ol
          ref={railRef}
          className="no-scrollbar relative mt-6 flex [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:py-3 snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 py-4 sm:scroll-px-8 sm:px-8 motion-safe:snap-none motion-safe:overflow-visible min-[56.25rem]:mt-12 min-[56.25rem]:gap-6 min-[56.25rem]:pl-[max(2rem,calc((100vw_-_1240px)/2_+_2rem))]"
          aria-label="Timeline"
        >
          {TIMELINE.map((entry, index) => (
            <li
              key={`${entry.year}-${entry.tag}`}
              data-rail-card
              className="card group relative flex w-[min(80vw,300px)] shrink-0 snap-start flex-col overflow-hidden p-5 [@media(max-height:700px)]:p-4 transition-[translate] duration-500 ease-(--ease-out-expo) hover:-translate-y-1.5 sm:p-6 min-[56.25rem]:w-[340px] min-[56.25rem]:p-7"
            >
              <span className="font-mono text-[11px] tracking-[0.2em] text-ink-mute">{String(index + 1).padStart(2, '0')} / {TIMELINE.length}</span>
              <span data-rail-year className="mt-4 font-display text-5xl leading-none [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:text-4xl font-semibold tracking-[-0.05em] text-ink sm:mt-6 sm:text-6xl">
                {entry.year}
              </span>
              <span className="kicker mt-3 text-teal sm:mt-4">{entry.tag}</span>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-pretty text-ink-soft sm:mt-3 sm:text-[15px] [@media(max-height:700px)]:mt-2 [@media(max-height:700px)]:text-[13.5px] [@media(max-height:700px)]:leading-normal">{entry.body}</p>
              <span className="absolute top-5 right-5 size-2.5 rounded-full bg-ice-300 ring-4 ring-ice-100 transition-colors group-hover:bg-aqua sm:top-6 sm:right-6" aria-hidden="true" />
            </li>
          ))}
        </ol>
        <SwipeCue rail={railRef} className="motion-safe:hidden min-[56.25rem]:hidden" />
      </div>
    </section>
  );
}
