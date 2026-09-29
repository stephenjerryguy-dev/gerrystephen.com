import type { ReactNode } from 'react';
import { m } from 'framer-motion';

type ChapterProps = {
  num: string;
  kicker: string;
  title: ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
};

export function Chapter({ num, kicker, title, tone = 'light', className = '' }: ChapterProps) {
  const dark = tone === 'dark';
  return (
    <header className={`max-w-4xl ${className}`}>
      <m.div
        className={`mb-5 flex items-center gap-3 ${dark ? 'text-lilac/80' : 'text-ink-mute'}`}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className={`grid h-8 min-w-8 place-items-center rounded-full px-2 font-mono text-[11px] font-semibold ${dark ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-white text-ink ring-1 ring-ink/10'}`}>
          {num}
        </span>
        <span className="kicker">{kicker}</span>
      </m.div>
      <m.h2
        className={`font-display text-[clamp(2.3rem,5.6vw,4.6rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance ${dark ? 'text-white' : 'text-ink'}`}
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      >
        {title}
      </m.h2>
    </header>
  );
}
