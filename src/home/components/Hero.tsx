import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { HERO_VALUES } from '../data/content';
import { gsap, useGsap } from '../lib/gsap';
import { HeroVideo, heroVariant, type HeroVariant } from './HeroVideo';

// Above-the-fold intro runs on CSS keyframes so the copy paints with the first
// frame instead of waiting for Framer Motion's lazily loaded features.

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Hero() {
  const rootRef = useRef<HTMLElement>(null);
  const [variant, setVariant] = useState<HeroVariant>(heroVariant);

  useEffect(() => {
    const media = window.matchMedia('(max-aspect-ratio: 1/1)');
    const sync = () => setVariant(heroVariant());
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useGsap(() => {
    const root = rootRef.current;
    if (!root) return;
    const readout = root.querySelector<HTMLElement>('[data-hero-readout]');
    const meter = root.querySelector<HTMLElement>('[data-hero-meter]');
    const mm = gsap.matchMedia();

    mm.add(
      { reduce: '(prefers-reduced-motion: reduce)', small: '(max-width: 767px)', fine: '(pointer: fine)' },
      (context) => {
        const { reduce, small, fine } = context.conditions as { reduce: boolean; small: boolean; fine: boolean };
        if (reduce) return;

        // Scroll turns the warm postcard into "THE IGLU": copy lifts away, the
        // camera pushes in, the scene cools, and the title card lands.
        gsap
          .timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: root,
              start: 'top top',
              end: small ? '+=85%' : '+=130%',
              pin: true,
              scrub: 0.6,
              anticipatePin: 1,
              onUpdate(self) {
                if (readout) readout.textContent = String(Math.round(self.progress * 100)).padStart(3, '0');
                if (meter) meter.style.transform = `scaleX(${self.progress})`;
              },
            },
          })
          .to('[data-hero-copy]', { yPercent: -16, opacity: 0, duration: 0.42 }, 0)
          .to('[data-hero-chrome]', { opacity: 0, duration: 0.3 }, 0.05)
          .to('[data-hero-scrim]', { opacity: 0, duration: 0.45 }, 0)
          .to('[data-hero-media]', { scale: small ? 1.1 : 1.16, duration: 1 }, 0)
          .fromTo('[data-hero-cold]', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.3)
          .fromTo('[data-hero-title]', { opacity: 0, y: 70, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'power2.out' }, 0.5)
          .to({}, { duration: 0.12 });

        if (!fine) return;
        // Look around the scene with the pointer.
        const moveX = gsap.quickTo('[data-hero-parallax]', 'x', { duration: 1.1, ease: 'power3.out' });
        const moveY = gsap.quickTo('[data-hero-parallax]', 'y', { duration: 1.1, ease: 'power3.out' });
        const onMove = (event: PointerEvent) => {
          moveX((event.clientX / window.innerWidth - 0.5) * -26);
          moveY((event.clientY / window.innerHeight - 0.5) * -16);
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        return () => window.removeEventListener('pointermove', onMove);
      },
    );
  }, rootRef);

  const jump = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToId(id);
  };

  return (
    <section ref={rootRef} id="top" className="relative h-[100svh] min-h-[560px] overflow-hidden bg-ice-200" aria-label="Welcome to Gerry's iglu">
      <div data-hero-media className="absolute inset-0 origin-[64%_60%] will-change-transform">
        <div data-hero-parallax className="absolute -inset-6">
          <HeroVideo variant={variant} />
        </div>
      </div>

      <div
        data-hero-scrim
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(241_249_251/0.9)_0%,rgb(241_249_251/0.62)_40%,rgb(241_249_251/0)_60%)] md:bg-[linear-gradient(90deg,rgb(241_249_251/0.94)_0%,rgb(241_249_251/0.74)_30%,rgb(241_249_251/0)_58%)]"
      />
      <div
        data-hero-cold
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgb(11_60_73/0.25),rgb(11_60_73/0.62)_70%),linear-gradient(180deg,rgb(179_224_234/0.35),rgb(16_35_51/0.35))] opacity-0"
      />

      <div className="shell relative z-10 flex h-full flex-col pt-[calc(5.5rem+env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] md:justify-center md:pt-[calc(5rem+env(safe-area-inset-top))]">
        <div data-hero-copy className="max-w-[40rem] will-change-transform">
          <p className="animate-rise glass kicker mb-5 inline-flex items-center gap-2.5 rounded-full py-2 pr-4 pl-3 text-ink-soft sm:mb-6" style={{ animationDelay: '50ms' }}>
            <span className="size-2 animate-pulse-dot rounded-full bg-aqua" aria-hidden="true" />
            <span className="hidden sm:inline">gerrystephen.eth ·</span> web3 since 2021
          </p>
          <h1 className="font-display text-[clamp(3.1rem,8.2vw,7.6rem)] leading-[0.9] font-semibold tracking-[-0.045em] text-ink">
            <span className="animate-rise block" style={{ animationDelay: '120ms' }}>Welcome to</span>
            <span className="animate-rise block" style={{ animationDelay: '200ms' }}>
              Gerry’s{' '}
              <em className="bg-[linear-gradient(100deg,var(--color-teal),var(--color-sea)_55%,var(--color-coral))] bg-clip-text pr-2 font-serif font-normal tracking-[-0.02em] text-transparent italic md:hidden">iglu.</em>
            </span>
            <span className="animate-rise hidden md:block" style={{ animationDelay: '280ms' }}>
              <em className="bg-[linear-gradient(100deg,var(--color-teal),var(--color-sea)_55%,var(--color-coral))] bg-clip-text pr-3 font-serif font-normal tracking-[-0.02em] text-transparent italic">iglu.</em>
            </span>
          </h1>
          <p className="animate-rise mt-4 max-w-[31rem] text-[15px] leading-relaxed text-pretty text-ink-soft sm:mt-6 sm:text-[clamp(1rem,1.5vw,1.2rem)]" style={{ animationDelay: '380ms' }}>
            A home base for the journey: business, Web3, legacy, and the Pengu that made the cold Internet feel warm.
          </p>
          <ul className="animate-rise mt-4 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-2" style={{ animationDelay: '460ms' }} aria-label="Personal values">
            {HERO_VALUES.map((value) => (
              <li key={value} className="rounded-full bg-white/70 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.12em] text-ink uppercase ring-1 ring-ink/10 sm:px-3.5 sm:py-1.5 sm:text-[11px] sm:tracking-[0.14em]">
                {value}
              </li>
            ))}
          </ul>
          <div className="animate-rise mt-6 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3" style={{ animationDelay: '540ms' }}>
            <a href="#journey" onClick={jump('journey')} className="btn-primary max-sm:min-h-11 max-sm:px-5 max-sm:text-[14px]">
              Scroll to discover <span aria-hidden="true">↓</span>
            </a>
            <a href="#nfts" onClick={jump('nfts')} className="btn-ghost max-sm:min-h-11 max-sm:px-5 max-sm:text-[14px]">
              <span className="sm:hidden">Ecosystems</span>
              <span className="hidden sm:inline">My community ecosystems</span>
            </a>
          </div>
        </div>
      </div>

      <div data-hero-chrome className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="shell flex items-end justify-between gap-6 pb-6">
          <p className="hidden max-w-[17rem] font-mono text-[11px] leading-relaxed text-ink-soft lg:block [@media(max-height:820px)]:hidden">
            <strong className="block tracking-[0.2em] text-ink">///// MANIFESTO</strong>
            Build useful things at the intersection of community, hospitality, AI, and crypto.
          </p>
          <div className="mx-auto hidden flex-col items-center gap-2 font-mono text-[10px] tracking-[0.24em] text-ink/70 uppercase sm:flex lg:mx-0">
            <span>
              live scene // <span data-hero-readout>000</span>
            </span>
            <span className="h-px w-36 overflow-hidden bg-ink/15">
              <i data-hero-meter className="block h-full origin-left scale-x-0 bg-teal" />
            </span>
            <span className="hidden sm:block">scroll to transform</span>
          </div>
          <figure className="glass hidden rotate-[-2deg] rounded-2xl px-5 py-4 lg:block">
            <blockquote className="font-serif text-2xl leading-none text-ink italic">Strength before beauty</blockquote>
            <figcaption className="mt-2 font-mono text-[10px] tracking-[0.2em] text-ink-soft uppercase">ericgoodguy</figcaption>
          </figure>
        </div>
      </div>

      <div data-hero-title className="pointer-events-none absolute inset-0 z-20 grid place-items-center opacity-0">
        <div className="px-5 text-center text-white [text-shadow:0_10px_40px_rgb(11_60_73/0.45)]">
          <p className="kicker text-white/85">welcome to</p>
          <p className="font-display text-[clamp(4.2rem,17vw,14rem)] leading-[0.85] font-extrabold tracking-[-0.06em]">THE IGLU</p>
          <p className="mt-4 font-mono text-[12px] tracking-[0.18em] text-white/85 uppercase">a small home on the internet · gerrystephen.eth</p>
          <a
            className="pointer-events-auto mx-auto mt-7 block w-fit overflow-hidden rounded-xl ring-1 ring-white/40 transition-transform hover:-translate-y-1"
            href="https://portal.abs.xyz/profile/0x382556A543aAd855C07678E7F8e820d0d90429BB"
            target="_blank"
            rel="noopener"
            aria-label="Abstract Gold II veteran wallet"
          >
            <img src="/assets/opt/abstract-gold-tier-card-ii.webp" alt="Abstract wallet Gold Tier II" width={220} height={138} loading="lazy" className="w-[180px] sm:w-[220px]" />
          </a>
        </div>
      </div>
    </section>
  );
}
