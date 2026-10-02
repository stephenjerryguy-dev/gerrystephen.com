import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { buildGroups, cachedEcosystemGroups, describeToken, loadEcosystemGroups, warmEcosystemArt, type EcosystemGroup, type Nft } from '../lib/nfts';
import { resolveMedia } from '../lib/media';
import { Chapter } from './Chapter';

function NftArt({ nft, eager = false }: { nft: Nft; eager?: boolean }) {
  const media = useMemo(() => resolveMedia(nft.image), [nft.image]);
  const [attempt, setAttempt] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Animated art only plays while its card is on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [media.video]);

  if (media.video) {
    return <video ref={videoRef} className="size-full object-cover" src={media.video} poster={media.poster} muted loop playsInline preload="none" aria-label={nft.name} />;
  }
  const src = media.sources[attempt];
  if (!src) {
    return (
      <span className="grid size-full place-items-center bg-[linear-gradient(135deg,var(--color-ice-100),var(--color-ice-300))] font-display text-2xl font-semibold tracking-[-0.03em] text-teal">
        {nft.glyph ?? nft.name.slice(0, 2)}
      </span>
    );
  }
  const loaded = loadedSrc === src;
  return (
    <>
      {!loaded && <span className="absolute inset-0 animate-pulse bg-[linear-gradient(135deg,var(--color-ice-100),var(--color-ice-300))]" aria-hidden="true" />}
      <img
        key={src}
        // Already-cached art (warmed earlier, or from a previous visit) is complete before onLoad is wired up.
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoadedSrc(src);
        }}
        src={src}
        alt={nft.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`relative size-full object-cover transition-opacity duration-300 [image-rendering:auto] ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setAttempt((value) => value + 1)}
      />
    </>
  );
}

function NftCard({ nft, eager }: { nft: Nft; eager?: boolean }) {
  const isAsset = nft.tokenId === 'asset';
  const disabled = !nft.href;
  return (
    <a
      href={nft.href ?? '#nfts'}
      target={disabled ? undefined : '_blank'}
      rel="noopener"
      aria-disabled={disabled || undefined}
      className="group/card card flex w-[190px] shrink-0 snap-start flex-col overflow-hidden p-2.5 transition-transform duration-500 ease-(--ease-out-expo) hover:-translate-y-1.5 sm:w-[228px]"
    >
      <span className={`relative block aspect-square overflow-hidden rounded-[20px] ${isAsset ? 'bg-[radial-gradient(circle_at_30%_20%,white,var(--color-ice-200))] p-8' : 'bg-ice-100'}`}>
        <span className={`relative block size-full overflow-hidden transition-transform duration-700 ease-(--ease-out-expo) group-hover/card:scale-[1.04] ${isAsset ? 'rounded-full' : ''}`}>
          <NftArt nft={nft} eager={eager} />
        </span>
        {isAsset && <span className="kicker absolute top-3 left-3 rounded-full bg-ink px-2.5 py-1 text-[9px] text-snow">token</span>}
      </span>
      <span className="flex flex-1 flex-col px-2 pt-3 pb-2">
        <span className="kicker truncate text-[9.5px] text-ink-mute">{nft.collection}</span>
        <strong className="mt-1 truncate font-display text-[17px] font-semibold tracking-[-0.02em]">{nft.name}</strong>
        <span className={`mt-1 truncate font-mono text-[11px] ${isAsset ? 'font-semibold text-teal' : 'text-ink-mute'}`}>{describeToken(nft)}</span>
      </span>
    </a>
  );
}

/** Drifts the rail sideways while it is on screen; any touch, wheel, or hover hands control back. */
function useAutoDrift(track: RefObject<HTMLDivElement | null>, key: string, count: number) {
  useEffect(() => {
    const el = track.current;
    if (!el || count < 3 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    el.scrollLeft = 0;
    let frame = 0;
    let last = 0;
    let visible = false;
    let resumeAt = 0;
    // One full set of cards: where the duplicate list starts, so the wrap is seamless.
    const measure = () => {
      const first = el.children[0] as HTMLElement | undefined;
      const repeat = el.children[count] as HTMLElement | undefined;
      return first && repeat ? repeat.offsetLeft - first.offsetLeft : el.scrollWidth / 2;
    };
    let half = measure();
    let position = 0;
    const speed = window.matchMedia('(max-width: 700px)').matches ? 46 : 30;

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = Math.min(50, now - (last || now));
      last = now;
      if (now < resumeAt) {
        position = el.scrollLeft;
        return;
      }
      position += (speed * elapsed) / 1000;
      if (half > 0 && position >= half) position -= half;
      el.scrollLeft = position;
    };
    const run = () => {
      if (!frame && visible && !document.hidden) {
        last = 0;
        position = el.scrollLeft;
        frame = requestAnimationFrame(step);
      }
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const hold = (ms: number) => () => (resumeAt = performance.now() + ms);
    const holdLong = hold(2600);
    const holdForever = () => (resumeAt = Number.POSITIVE_INFINITY);
    const release = () => (resumeAt = performance.now() + 600);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
      else stop();
    });
    observer.observe(el);
    const resize = new ResizeObserver(() => (half = measure()));
    resize.observe(el);
    const onVisibility = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', onVisibility);
    el.addEventListener('pointerdown', holdLong, { passive: true });
    el.addEventListener('touchstart', holdLong, { passive: true });
    el.addEventListener('touchend', holdLong, { passive: true });
    el.addEventListener('wheel', holdLong, { passive: true });
    el.addEventListener('focusin', holdForever);
    el.addEventListener('focusout', release);
    el.addEventListener('mouseenter', holdForever);
    el.addEventListener('mouseleave', release);
    return () => {
      stop();
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('pointerdown', holdLong);
      el.removeEventListener('touchstart', holdLong);
      el.removeEventListener('touchend', holdLong);
      el.removeEventListener('wheel', holdLong);
      el.removeEventListener('focusin', holdForever);
      el.removeEventListener('focusout', release);
      el.removeEventListener('mouseenter', holdForever);
      el.removeEventListener('mouseleave', release);
    };
  }, [track, key, count]);
}

function CollectionModal({ group, onClose }: { group: EcosystemGroup; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
    };
  }, [onClose]);

  return (
    <m.div className="fixed inset-0 z-[80] grid place-items-center px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6 sm:pt-[max(24px,env(safe-area-inset-top))] sm:pb-[max(24px,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label={`${group.label} collection`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="absolute inset-0 bg-ink/45 backdrop-blur-sm" aria-label="Close collection" onClick={onClose} />
      <m.div
        className="relative flex max-h-[88svh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-ice-50 shadow-2xl ring-1 ring-white"
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, scale: 0.98 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-ink/5 px-6 py-5">
          <div>
            <p className="kicker text-ink-mute">{group.label}</p>
            <p className="font-display text-2xl font-semibold tracking-[-0.03em]">{group.items.length} featured items</p>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white text-xl ring-1 ring-ink/10" aria-label="Close collection">
            ×
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-4 sm:p-6 [&>a]:w-auto">
          {group.items.map((nft, index) => (
            <NftCard key={`${nft.name}-${nft.tokenId}-${index}`} nft={nft} />
          ))}
        </div>
      </m.div>
    </m.div>
  );
}

/** Runs `callback` once the page has loaded and the main thread is quiet. */
function whenIdle(callback: () => void) {
  let timer = 0;
  let idle = 0;
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(callback, { timeout: 2500 });
    else timer = window.setTimeout(callback, 1200);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    window.removeEventListener('load', schedule);
    window.clearTimeout(timer);
    if (idle) window.cancelIdleCallback?.(idle);
  };
}

export function Communities() {
  const [cached] = useState(cachedEcosystemGroups);
  const [groups, setGroups] = useState<EcosystemGroup[]>(() => cached ?? buildGroups([]));
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(!cached);
  const [near, setNear] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // The wallet JSON is small and CDN-cached: ask for it as soon as the page is
  // idle, or earlier if the visitor is already heading to this section.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    let cancelled = false;
    const load = () =>
      void loadEcosystemGroups().then((next) => {
        if (cancelled) return;
        setGroups(next);
        setSyncing(false);
      });
    const cancelIdle = whenIdle(load);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setNear(true);
        load();
      },
      { rootMargin: '150% 0px' },
    );
    observer.observe(section);
    return () => {
      cancelled = true;
      cancelIdle();
      observer.disconnect();
    };
  }, []);

  // Once the section is close, fetch the first art of both tabs, not just the open one.
  useEffect(() => {
    if (near) warmEcosystemArt(groups);
  }, [near, groups]);

  const group = groups[active] ?? groups[0];
  const loop = group.items.length > 2 ? [...group.items, ...group.items] : group.items;
  useAutoDrift(trackRef, `${group.id}-${group.items.length}`, group.items.length);

  return (
    <section ref={sectionRef} id="nfts" className="relative overflow-hidden bg-ice-50 pt-14 pb-8 sm:py-32">
      <div className="pointer-events-none absolute -top-40 right-[-10%] size-[520px] rounded-full bg-aqua/15 blur-3xl" aria-hidden="true" />
      <div className="shell relative">
        <Chapter num="02" kicker="My community ecosystems" title="My forever communities: Pudgy & Sappy." />
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-ink-soft max-sm:hidden">
          A curated view of my owned Pudgy and Sappy collections: $PENGU, $PIXL, Sappy Faithful Key, Sappy Seals, Omnia Pets, Omnia items, Pixseals, and a Bitcoin ordinal. Cards open the matching asset, collection, or explorer page.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-10 sm:gap-4">
          <div className="glass relative inline-flex rounded-full p-1" role="tablist" aria-label="Ecosystem">
            {groups.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                onClick={() => setActive(index)}
                className={`relative rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors ${index === active ? 'text-snow' : 'text-ink-soft hover:text-ink'}`}
              >
                {index === active && <m.span layoutId="eco-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span className="relative">{item.short}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {group.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener" className="rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-ink/10 transition-transform hover:-translate-y-0.5 sm:px-4 sm:py-2 sm:text-sm">
                {link.label} <span aria-hidden="true">↗</span>
              </a>
            ))}
            <button type="button" onClick={() => setExpanded(true)} className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-snow transition-transform hover:-translate-y-0.5 sm:px-4 sm:py-2 sm:text-sm">
              View all {group.items.length}
            </button>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <m.p key={group.id} className="mt-4 max-w-2xl text-[14.5px] text-ink-mute sm:mt-5 sm:text-[15px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
            {group.note}
            {syncing && <span className="ml-2 font-mono text-[11px] tracking-[0.16em] text-teal uppercase">syncing wallet…</span>}
          </m.p>
        </AnimatePresence>
      </div>

      <div ref={trackRef} className="no-scrollbar mask-fade-x mt-3 flex gap-3 overflow-x-auto px-5 py-4 sm:mt-8 sm:gap-4 sm:px-8 sm:py-6" aria-label={`${group.label} items`}>
        {loop.map((nft, index) => (
          <m.div
            key={`${group.id}-${nft.name}-${nft.tokenId}-${index}`}
            className="shrink-0"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 6) * 0.05 }}
          >
            <NftCard nft={nft} eager={index < 4} />
          </m.div>
        ))}
      </div>

      <AnimatePresence>{expanded && <CollectionModal group={group} onClose={() => setExpanded(false)} />}</AnimatePresence>
    </section>
  );
}
