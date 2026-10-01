import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { NAV_LINKS } from '../data/content';
import { ScrollTrigger } from '../lib/gsap';
import { SocialIcon } from './SocialIcon';

export function Topbar() {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  // Slide away while scrolling down, come back on the way up. DOM-only: no re-renders.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate(self) {
        bar.dataset.hidden = String(self.direction === 1 && self.scroll() > 240);
        bar.dataset.scrolled = String(self.scroll() > 24);
      },
    });
    return () => trigger.kill();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      ref={barRef}
      data-hidden="false"
      data-scrolled="false"
      className="group/bar fixed inset-x-0 top-0 z-50 pt-[max(12px,env(safe-area-inset-top))] pr-[max(12px,env(safe-area-inset-right))] pl-[max(12px,env(safe-area-inset-left))] transition-transform duration-500 ease-(--ease-out-expo) data-[hidden=true]:-translate-y-[130%] sm:pr-[max(20px,env(safe-area-inset-right))] sm:pl-[max(20px,env(safe-area-inset-left))]"
    >
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 rounded-full pr-2 pl-2 transition-[background-color,box-shadow] duration-500 group-data-[scrolled=true]/bar:glass sm:h-16 sm:pl-3">
        <a href="#top" className="flex items-center gap-2.5 rounded-full pr-2" aria-label="Gerry Stephen home">
          <img src="/assets/opt/pudgy-avatar.webp" alt="" width={40} height={40} className="size-10 rounded-full ring-1 ring-ink/10" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">
            gerrystephen<span className="text-teal">.com</span>
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener' : undefined}
              className="rounded-full px-3 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:bg-white/70 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <a href="https://x.com/gerrydoteth" target="_blank" rel="noopener" aria-label="Gerry Stephen on X" className="grid size-10 place-items-center rounded-full bg-ink text-snow transition-transform hover:-translate-y-0.5">
            <SocialIcon name="X" className="size-4" />
          </a>
          <a href="https://opensea.io/profile/gerrystephen" target="_blank" rel="noopener" aria-label="Gerry Stephen on OpenSea" className="hidden h-10 items-center gap-2 rounded-full bg-white pr-4 pl-1.5 text-[14px] font-semibold ring-1 ring-ink/10 transition-transform hover:-translate-y-0.5 sm:flex">
            <img src="/assets/opensea-logo.svg" alt="" width={28} height={28} className="size-7" />
            OpenSea
          </a>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full bg-white ring-1 ring-ink/10 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span className="relative block h-3 w-4" aria-hidden="true">
              <span className={`absolute left-0 h-0.5 w-4 rounded bg-ink transition-transform duration-300 ${open ? 'top-1.5 rotate-45' : 'top-0'}`} />
              <span className={`absolute top-1.5 left-0 h-0.5 w-4 rounded bg-ink transition-opacity ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute left-0 h-0.5 w-4 rounded bg-ink transition-transform duration-300 ${open ? 'top-1.5 -rotate-45' : 'top-3'}`} />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <m.nav
            key="menu"
            aria-label="Site menu"
            className="glass mx-auto mt-2 grid max-w-[1240px] gap-1 rounded-[26px] p-2 lg:hidden"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {NAV_LINKS.map((link, index) => (
              <m.a
                key={link.label}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener' : undefined}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl px-4 py-3 font-display text-lg font-medium hover:bg-white/80"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * index }}
              >
                {link.label}
                <span className="text-ink-mute" aria-hidden="true">{link.external ? '↗' : '→'}</span>
              </m.a>
            ))}
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
