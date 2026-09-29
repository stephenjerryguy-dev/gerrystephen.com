import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Ambience } from '../lib/ambient';
import { ScrollTrigger } from '../lib/gsap';

const IGLU_ORIGIN = 'https://iglu.gerrystephen.com';

/** Snow drifts in once you leave the warm hero; opacity is scroll-driven, not React state. */
export function Snowfall() {
  const layerRef = useRef<HTMLDivElement>(null);
  const flakes = useMemo(() => {
    const count = typeof window !== 'undefined' && window.innerWidth < 700 ? 18 : 36;
    return Array.from({ length: count }, (_, i) => ({
      left: (i * 97.3) % 100,
      size: 2 + ((i * 7) % 5),
      delay: -((i * 3.7) % 20),
      duration: 14 + ((i * 5.3) % 16),
      drift: ((i % 7) - 3) * 14,
      opacity: 0.35 + ((i * 13) % 50) / 100,
    }));
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const trigger = ScrollTrigger.create({
      trigger: '#journey',
      start: 'top 60%',
      endTrigger: '#nfts',
      end: 'top 20%',
      onUpdate(self) {
        layer.style.opacity = self.progress.toFixed(3);
        layer.style.visibility = self.progress > 0 ? 'visible' : 'hidden';
      },
    });
    return () => trigger.kill();
  }, []);

  return (
    <div ref={layerRef} className="pointer-events-none invisible fixed inset-0 z-30 overflow-hidden opacity-0" aria-hidden="true">
      {flakes.map((flake, index) => (
        <span
          key={index}
          className="absolute -top-4 animate-snow rounded-full bg-white shadow-[0_0_6px_rgb(255_255_255/0.8)] will-change-transform"
          style={{
            left: `${flake.left}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
            animationDelay: `${flake.delay}s`,
            ['--dur' as string]: `${flake.duration}s`,
            ['--drift' as string]: `${flake.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function FloatingControls() {
  const [soundOn, setSoundOn] = useState(true);
  const [igluOpen, setIgluOpen] = useState(false);
  const [igluMounted, setIgluMounted] = useState(false);
  const ambienceRef = useRef<Ambience | null>(null);

  // Surf at the top of the page, wind at the bottom.
  useEffect(() => {
    const ambience = new Ambience(() => {});
    ambienceRef.current = ambience;
    ambience.arm();
    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => ambience.setColdness(self.progress),
    });
    return () => {
      trigger.kill();
      ambience.dispose();
      ambienceRef.current = null;
    };
  }, []);

  useEffect(() => {
    ambienceRef.current?.setEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.classList.toggle('iglu-layer-open', igluOpen);
    if (!igluOpen) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.origin === IGLU_ORIGIN && event.data?.type === 'gerry:close-iglu') setIgluOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setIgluOpen(false);
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('iglu-layer-open');
    };
  }, [igluOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setSoundOn((value) => !value)}
        aria-pressed={soundOn}
        aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
        title={soundOn ? 'Sound on' : 'Sound off'}
        className="glass fixed bottom-4 left-4 z-40 grid size-12 place-items-center rounded-full text-ink transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:left-6"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.75 9.25h3.3l5.2-4.05v13.6l-5.2-4.05h-3.3z" fill="currentColor" stroke="none" />
          {soundOn ? (
            <>
              <path d="M16.25 8.8c1 .88 1.52 1.95 1.52 3.2s-.52 2.32-1.52 3.2" />
              <path d="M18.7 6.45c1.72 1.56 2.58 3.4 2.58 5.55s-.86 3.99-2.58 5.55" />
            </>
          ) : (
            <path d="M16.8 9.05 21 13.25m0-4.2-4.2 4.2" />
          )}
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          setIgluMounted(true);
          setIgluOpen(true);
        }}
        onPointerEnter={() => setIgluMounted(true)}
        aria-label="Open the interactive Iglu"
        aria-expanded={igluOpen}
        className="fixed right-4 bottom-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink pr-5 pl-2 font-mono text-[12px] font-semibold tracking-[0.2em] text-snow shadow-[0_18px_40px_-16px_rgb(16_35_51/0.8)] transition-transform hover:-translate-y-0.5 sm:right-6 sm:bottom-6"
      >
        <img src="/assets/iglu-mark.svg" alt="" className="size-8 rounded-full bg-white/10 p-1" />
        IGLU
      </button>

      {/* The Iglu is its own app; it only loads when asked for (or hovered on desktop). */}
      {igluMounted && (
        <div
          className={`fixed inset-0 z-[90] bg-deep transition-[opacity,visibility,translate] duration-300 ease-(--ease-out-expo) ${igluOpen ? 'visible translate-y-0 opacity-100' : 'pointer-events-none invisible translate-y-4 opacity-0'}`}
          aria-hidden={!igluOpen}
        >
          <iframe src={`${IGLU_ORIGIN}/`} title="Gerry's interactive Iglu" className="size-full border-0" tabIndex={igluOpen ? 0 : -1} allow="fullscreen; clipboard-write" />
          <AnimatePresence>
            {igluOpen && (
              <m.button
                type="button"
                onClick={() => setIgluOpen(false)}
                className="glass absolute top-[max(12px,env(safe-area-inset-top))] left-1/2 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full px-5 font-mono text-[12px] font-semibold tracking-[0.2em] text-ink"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                aria-label="Return to Gerry Stephen main site"
              >
                ← GERRY
              </m.button>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
