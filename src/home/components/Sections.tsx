import { useRef } from 'react';
import { m } from 'framer-motion';
import { CONTACT_CARDS, NOW_BUILDING, SOCIALS, STATS, VENTURES, type NowCard, type Venture } from '../data/content';
import { gsap, prefersReducedMotion, useGsap } from '../lib/gsap';
import { Chapter } from './Chapter';
import { Reveal } from './Reveal';
import { SocialIcon } from './SocialIcon';

export function Stats() {
  const rootRef = useRef<HTMLElement>(null);
  useGsap(() => {
    // Count up once when the band scrolls in (markup keeps the real numbers for no-JS/reduced motion).
    if (prefersReducedMotion()) return;
    gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      const counter = { value: 0 };
      el.textContent = '0';
      gsap.to(counter, {
        value: target,
        duration: 1.6,
        ease: 'power3.out',
        snap: { value: 1 },
        onUpdate: () => (el.textContent = String(counter.value)),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
  }, rootRef);

  return (
    <section ref={rootRef} className="bg-ice-100 py-16" aria-label="By the numbers">
      <dl className="shell grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse border-t border-ink/10 pt-5">
            <dt className="kicker mt-3 text-ink-mute">{stat.label}</dt>
            <dd className="font-display text-[clamp(3rem,7vw,5.5rem)] leading-none font-semibold tracking-[-0.05em]">
              <span data-count={stat.value}>{stat.value}</span>
              {stat.suffix}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const NOW_TONES: Record<NowCard['tone'], string> = {
  ice: 'bg-[linear-gradient(160deg,white,var(--color-ice-200))]',
  blue: 'bg-[linear-gradient(160deg,#eaf3ff,#cfe2ff)]',
  sand: 'bg-[linear-gradient(160deg,#fffaf0,var(--color-sand))]',
  terrier: 'bg-[linear-gradient(160deg,#fff4ec,#ffd9c4)]',
};

export function NowBuilding() {
  return (
    <section id="now" className="bg-ice-50 py-24 sm:py-32">
      <div className="shell">
        <Chapter num="05" kicker="Now" title="Currently building the next layer." />
      </div>
      <ul className="no-scrollbar shell mt-12 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto pb-4 sm:scroll-px-8 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
        {NOW_BUILDING.map((card, index) => {
          const external = card.href.startsWith('http');
          return (
            <Reveal as="li" key={card.title} delay={index * 0.07} className="w-[80vw] max-w-[320px] shrink-0 snap-start md:w-auto md:max-w-none">
              <a
                href={card.href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener' : undefined}
                className="card group flex h-full flex-col overflow-hidden p-2.5 transition-transform duration-500 ease-(--ease-out-expo) hover:-translate-y-1.5"
              >
                <span className={`relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[22px] ${NOW_TONES[card.tone]}`}>
                  <img src={card.logo} alt={card.alt} loading="lazy" className={`transition-transform duration-700 ease-(--ease-out-expo) group-hover:scale-105 ${card.tone === 'terrier' ? 'size-full object-cover' : 'max-h-[62%] max-w-[62%] object-contain'}`} />
                  {external && (
                    <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-ink text-snow">
                      <SocialIcon name="X" className="size-3.5" />
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col px-3 pt-4 pb-3">
                  <strong className="font-display text-xl font-semibold tracking-[-0.02em]">{card.title}</strong>
                  <span className="mt-2 text-[15px] leading-relaxed text-ink-soft">{card.note}</span>
                  {card.site && <span className="mt-auto pt-4 font-mono text-[11px] tracking-[0.12em] text-teal">{card.site} →</span>}
                </span>
              </a>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

function VentureCard({ venture, index }: { venture: Venture; index: number }) {
  const warm = venture.tone === 'warm';
  return (
    <Reveal as="article" delay={index * 0.1} className={`card flex flex-col overflow-hidden p-3 ${warm ? 'bg-[#fffaf2]' : ''}`}>
      <div className="relative aspect-[16/11] overflow-hidden rounded-[22px] bg-ice-100">
        <img data-parallax src={venture.photo} alt={venture.photoAlt} loading="lazy" decoding="async" className="absolute inset-x-0 -top-[8%] h-[116%] w-full object-cover" />
        <span className="absolute bottom-4 left-4 grid h-14 min-w-14 place-items-center rounded-2xl bg-white/90 px-3 backdrop-blur">
          <img src={venture.logo} alt={venture.logoAlt} loading="lazy" className="max-h-10 w-auto max-w-28 object-contain" />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-3 pt-6 pb-3 sm:px-5">
        <p className={`kicker ${warm ? 'text-ember' : 'text-teal'}`}>{venture.kicker}</p>
        <h3 className="mt-2 font-display text-[clamp(1.8rem,3vw,2.5rem)] leading-[1.02] font-semibold tracking-[-0.035em]">{venture.title}</h3>
        <p className="mt-4 text-[16px] leading-relaxed text-pretty text-ink-soft">{venture.body}</p>
        <ul className="mt-5 grid gap-2">
          {venture.bullets.map((bullet) => (
            <li key={bullet} className="flex items-center gap-3 text-[15px]">
              <span className={`size-1.5 rounded-full ${warm ? 'bg-coral' : 'bg-sea'}`} aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
        {venture.callout && (
          <a href={venture.callout.href} target="_blank" rel="noopener" className="mt-6 block rounded-2xl bg-ink p-5 text-snow transition-transform hover:-translate-y-0.5">
            <span className="kicker text-aqua">{venture.callout.label}</span>
            <span className="mt-2 block text-[15px] leading-relaxed text-snow/85">{venture.callout.body}</span>
          </a>
        )}
        <div className="mt-auto flex flex-wrap gap-3 pt-7">
          <a className={`btn ${warm ? 'bg-ember text-white hover:bg-coral' : 'bg-teal text-white hover:bg-deep'}`} href={venture.primary.href} target="_blank" rel="noopener">
            {venture.primary.label} <span aria-hidden="true">→</span>
          </a>
          <a className="btn bg-white ring-1 ring-ink/10" href={venture.secondary.href} target="_blank" rel="noopener">
            {venture.secondary.label}
          </a>
        </div>
      </div>
    </Reveal>
  );
}

export function Ventures() {
  const rootRef = useRef<HTMLElement>(null);
  useGsap(() => {
    gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((image) => {
      gsap.fromTo(image, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: image, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }, rootRef);

  return (
    <section ref={rootRef} id="ventures" className="relative overflow-hidden bg-[linear-gradient(180deg,var(--color-ice-50),#fdf4e7_60%,var(--color-ice-50))] py-24 sm:py-32">
      <div className="pointer-events-none absolute top-20 -left-40 size-[480px] rounded-full bg-sun/25 blur-3xl" aria-hidden="true" />
      <div className="shell relative">
        <Chapter num="06" kicker="IRL ventures" title="Stay, eat, and build from the same standard." />
        <div id="bluestar" className="mt-14 grid gap-5 lg:grid-cols-2">
          {VENTURES.map((venture, index) => (
            <VentureCard key={venture.id} venture={venture} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <section id="contact" className="relative overflow-hidden bg-ice-100 pt-24 pb-16 sm:pt-32">
      <div className="shell">
        <Chapter num="07" kicker="Hello" title="Come through the iglu." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTACT_CARDS.map((card, index) => (
            <Reveal key={card.kind} delay={index * 0.06}>
              <a
                href={card.href}
                target="_blank"
                rel="noopener"
                className={`group flex h-full flex-col rounded-[26px] p-6 ring-1 transition-[transform,background-color] duration-500 ease-(--ease-out-expo) hover:-translate-y-1.5 ${card.warm ? 'bg-[#fff6ea] ring-coral/15 hover:bg-[#ffefdc]' : 'bg-white ring-ink/5 hover:bg-snow'}`}
              >
                <span className={`kicker ${card.warm ? 'text-ember' : 'text-teal'}`}>{card.kind}</span>
                <strong className="mt-6 font-display text-xl font-semibold tracking-[-0.02em] break-words">{card.handle}</strong>
                <span className="mt-2 text-[15px] leading-relaxed text-ink-soft">{card.note}</span>
                <span className="mt-auto pt-6 text-sm font-semibold">
                  Open <span className="inline-block transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>

        <m.figure
          className="mx-auto mt-24 max-w-3xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <blockquote className="font-serif text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.05] tracking-[-0.01em] text-balance">
            My father, a visionary, successfully built for decades. <em className="text-teal">I carry the standard forward.</em>
          </blockquote>
          <figcaption className="kicker mt-6 text-ink-mute">Built from the Guy family standard · ericgoodguy · strength before beauty</figcaption>
        </m.figure>

        <ul className="mt-14 flex flex-wrap justify-center gap-2" aria-label="Gerry Stephen socials">
          {SOCIALS.map((social) => (
            <li key={social.name}>
              <a href={social.href} target="_blank" rel="noopener" aria-label={`Gerry Stephen on ${social.name}`} className="grid size-12 place-items-center rounded-full bg-white text-ink ring-1 ring-ink/10 transition-[transform,background-color,color] hover:-translate-y-1 hover:bg-ink hover:text-snow">
                <SocialIcon name={social.name} className="size-[18px]" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink pt-8 pb-24 text-snow/70 sm:pb-10">
      <div className="shell flex flex-col items-center justify-between gap-3 font-mono text-[11px] tracking-[0.16em] uppercase sm:flex-row">
        <span>© {new Date().getFullYear()} gerrystephen.eth · @gerrydoteth · the iglu</span>
        <span>Made with cool hands & warm intentions</span>
      </div>
    </footer>
  );
}
