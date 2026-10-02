import { useRef } from 'react';
import { m } from 'framer-motion';
import { INKFINITY } from '../data/content';
import { Chapter } from './Chapter';
import { SocialIcon } from './SocialIcon';
import { SwipeCue } from './SwipeCue';

const COLLECTION = 'https://opensea.io/collection/inkfinity-canvas';

export function Inkfinity() {
  const railRef = useRef<HTMLDivElement>(null);
  return (
    <section id="inkfinity" className="relative overflow-hidden bg-[linear-gradient(180deg,var(--color-ice-50),var(--color-ice-100))] py-14 sm:py-32">
      <div className="shell">
        <div className="grid gap-4 sm:gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <Chapter num="03" kicker="ericgoodguy · Inkfinity Canvas" title="Signed work, carried forward." />
          <p className="max-w-xl text-[15.5px] leading-relaxed text-pretty text-ink-soft sm:text-lg lg:pb-2">
            Inkfinity Canvas brings my dad’s hand-signed work into the builder story: craft, signature, permanence, and a family standard that still shapes how I move.
          </p>
        </div>

        <div className="relative mt-6 sm:mt-10 md:mt-14">
          <div ref={railRef} className="max-md:swipe-rail md:grid md:grid-cols-[1.35fr_1fr] md:grid-rows-2 md:gap-5">
            {INKFINITY.map((piece, index) => (
              <m.a
                key={piece.title}
                href={COLLECTION}
                target="_blank"
                rel="noopener"
                className={`group relative flex flex-col overflow-hidden rounded-[30px] bg-white p-3 ring-1 ring-ink/5 shadow-[0_40px_80px_-50px_rgb(16_35_51/0.5)] max-md:w-[78vw] max-md:max-w-[320px] max-md:shrink-0 max-md:snap-start ${piece.featured ? 'md:row-span-2' : ''}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10% 0px' }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: index * 0.1 }}
              >
                <span className={`relative block overflow-hidden rounded-[22px] bg-sand max-md:aspect-square md:flex-1 ${piece.featured ? 'md:aspect-auto' : 'md:aspect-[4/3]'}`}>
                  <img
                    src={piece.image}
                    alt={`${piece.title} Inkfinity Canvas artwork`}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover transition-transform duration-[1.2s] ease-(--ease-out-expo) group-hover:scale-[1.05]"
                  />
                  <span className="kicker absolute top-4 left-4 rounded-full bg-white/85 px-3 py-1.5 text-[10px] text-ink backdrop-blur">{piece.tag}</span>
                </span>
                <span className="flex items-end justify-between gap-4 px-3 pt-4 pb-2">
                  <span>
                    <strong className="block font-display text-2xl font-semibold tracking-[-0.03em]">{piece.title}</strong>
                    <span className="text-[15px] text-ink-mute">{piece.note}</span>
                  </span>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ice-100 transition-colors group-hover:bg-ink group-hover:text-snow" aria-hidden="true">↗</span>
                </span>
              </m.a>
            ))}
          </div>
          <SwipeCue rail={railRef} className="md:hidden" />
        </div>

        <div className="mt-6 flex flex-wrap gap-3 sm:mt-10">
          <a className="btn-primary" href={COLLECTION} target="_blank" rel="noopener">
            View the collection on OpenSea <span aria-hidden="true">→</span>
          </a>
          <a className="btn-ghost aspect-square px-0" href="https://x.com/inkfinitycanvas" target="_blank" rel="noopener" aria-label="Inkfinity Canvas on X">
            <SocialIcon name="X" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
