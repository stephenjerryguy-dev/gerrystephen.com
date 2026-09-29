import { useEffect } from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { FloatingControls, Snowfall } from './components/Ambient';
import { Biome } from './components/Biome';
import { Communities } from './components/Communities';
import { Hero, scrollToId } from './components/Hero';
import { Inkfinity } from './components/Inkfinity';
import { Contact, Footer, NowBuilding, Stats, Ventures } from './components/Sections';
import { Marquee, Timeline } from './components/Timeline';
import { Topbar } from './components/Topbar';
import { ScrollTrigger } from './lib/gsap';

const loadMotionFeatures = () => import('./lib/motion-features').then((module) => module.default);

// Old links still point at sections that were renamed or merged.
const HASH_ALIASES: Record<string, string> = { 'monad-game': 'monerge', zeppole: 'ventures', bluestar: 'ventures' };

function resolveHash(hash: string) {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  return HASH_ALIASES[id] ?? id;
}

export function App() {
  // Pinned sections add scroll length after first layout, so re-resolve deep links once it settles.
  useEffect(() => {
    const id = resolveHash(window.location.hash);
    if (!id) return undefined;
    const timer = window.setTimeout(() => {
      ScrollTrigger.refresh();
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  // In-page links glide instead of jumping.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const hash = anchor?.getAttribute('href');
      if (!hash || hash === '#') return;
      const id = resolveHash(hash);
      if (!document.getElementById(id)) return;
      event.preventDefault();
      history.replaceState(null, '', `#${id}`);
      scrollToId(id);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Late-loading fonts and images shift section heights; keep scroll triggers honest.
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    void document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);
    return () => window.removeEventListener('load', refresh);
  }, []);

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <a href="#journey" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-snow">
          Skip to content
        </a>
        <Topbar />
        <main>
          <Hero />
          <Marquee />
          <Timeline />
          <Communities />
          <Inkfinity />
          <Biome />
          <Stats />
          <NowBuilding />
          <Ventures />
          <Contact />
        </main>
        <Footer />
        <Snowfall />
        <FloatingControls />
      </MotionConfig>
    </LazyMotion>
  );
}
